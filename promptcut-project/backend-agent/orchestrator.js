/**
 * orchestrator.js — The Master Agent
 * -----------------------------------------------------------------------------
 * Single coordination point between the dumb UI, the timing math, and the three
 * external AI services. The UI calls these methods and receives back nothing but
 * local Blob URLs + a plain timeline model. It never touches FFmpeg, fetch, or
 * an API key directly.
 *
 * Data flow for a render:
 *   files ──▶ ingest (probe durations)
 *   spine ──▶ groqService.transcribeVideo  (word-level timestamps)
 *   prompt+context ──▶ geminiService.generateEditPlan  (strict JSON)
 *   plan ──▶ videoMath.fitInsertsToVoice  (auto-trim to voice-over)
 *   segments ──▶ ffmpegHelper.trim/concat  (client-side render)
 *   audioLayers ──▶ elevenLabsService  (SFX/music) ──▶ ffmpegHelper.mix
 *   result ──▶ { previewUrl, timeline, plan }  back to the UI
 *
 * Keys are INJECTED via the constructor config so this module runs unchanged in
 * the browser (MVP) or behind a Node proxy (hardened).
 */

import * as ffmpeg from './utils/ffmpegHelper.js';
import { fitInsertsToVoice, layoutTimeline } from './utils/videoMath.js';
import { transcribeVideo } from './services/groqService.js';
import { generateEditPlan } from './services/geminiService.js';
import { generateForLayer } from './services/elevenLabsService.js';

/**
 * @typedef {object} OrchestratorConfig
 * @property {{ groq:string, gemini:string, elevenlabs:string }} apiKeys
 * @property {(evt:{ stage:string, message?:string, progress?:number, data?:any }) => void} [onEvent]
 */

export function createOrchestrator(config) {
  return new PromptCutOrchestrator(config);
}

export class PromptCutOrchestrator {
  /** @param {OrchestratorConfig} config */
  constructor({ apiKeys, onEvent } = {}) {
    if (!apiKeys?.groq || !apiKeys?.gemini || !apiKeys?.elevenlabs) {
      throw new Error('Orchestrator: apiKeys.{groq,gemini,elevenlabs} are all required');
    }
    this.keys = apiKeys;
    this.onEvent = typeof onEvent === 'function' ? onEvent : () => {};

    /** @type {Map<string, { id, name, file, type, duration }>} */
    this.clips = new Map();
    /** @type {string|null} id of the clip whose narration is the spine */
    this.spineId = null;
    /** transcript cache for the current spine */
    this.transcript = null;
    /** all object URLs we mint, so we can revoke them on dispose */
    this._urls = new Set();
  }

  /* --------------------------- intake --------------------------- */

  /**
   * Register uploaded media. Probes duration locally; mints no URLs yet.
   * @param {File[]} files
   * @returns {Promise<Array<{ id, name, type, duration }>>}
   */
  async ingest(files) {
    this._emit('ingest', { message: `Reading ${files.length} file(s)…` });
    const added = [];
    for (const file of files) {
      const id = cryptoId();
      const type = file.type.startsWith('audio') ? 'audio' : 'video';
      let duration = 0;
      try {
        duration = await ffmpeg.probeDuration(file);
      } catch {
        /* leave 0; agent can still place it */
      }
      const entry = { id, name: file.name, file, type, duration };
      this.clips.set(id, entry);
      added.push(publicClip(entry));
    }
    // First video becomes the narration spine by default.
    if (!this.spineId) {
      const firstVideo = added.find((c) => c.type === 'video') || added[0];
      if (firstVideo) this.spineId = firstVideo.id;
    }
    this._emit('ingest', { message: 'Ingest complete', data: added });
    return added;
  }

  /** Explicitly choose which clip's voice-over is the timeline spine. */
  setSpine(clipId) {
    if (!this.clips.has(clipId)) throw new Error(`setSpine: unknown clip ${clipId}`);
    this.spineId = clipId;
    this.transcript = null; // invalidate cache
  }

  /* --------------------------- transcription --------------------------- */

  /**
   * Transcribe the spine clip (cached). Word-level timestamps power prompt edits.
   * @returns {Promise<import('./services/groqService.js').NormalizedTranscript>}
   */
  async transcribe() {
    const spine = this._spine();
    if (this.transcript) return this.transcript;

    this._emit('transcribe', { message: 'Transcribing narration (Whisper large-v3)…' });
    this.transcript = await transcribeVideo(spine.file, { apiKey: this.keys.groq });
    this._emit('transcribe', {
      message: `Transcribed ${this.transcript.words.length} words`,
      data: { duration: this.transcript.duration },
    });
    return this.transcript;
  }

  /* --------------------------- the big one --------------------------- */

  /**
   * Full pipeline: prompt → plan → auto-trim → render → preview URL.
   * @param {string} userPrompt
   * @param {{ strategy?: 'proportional'|'truncate', withAudio?: boolean }} [opts]
   * @returns {Promise<{ previewUrl:string, timeline:object[], plan:object, fit:object }>}
   */
  async planAndRender(userPrompt, { strategy = 'proportional', withAudio = true } = {}) {
    const spine = this._spine();
    const transcript = await this.transcribe();

    // 1) Ask the agent for a strict-JSON edit plan.
    this._emit('plan', { message: 'Planning edit (Gemini 1.5 Pro)…' });
    const plan = await generateEditPlan(
      {
        userPrompt,
        mediaContext: {
          voiceDuration: transcript.duration || spine.duration,
          words: transcript.words,
          segments: transcript.segments,
          availableClips: [...this.clips.values()].map(publicClip),
        },
      },
      { apiKey: this.keys.gemini },
    );
    this._emit('plan', { message: plan.summary || 'Plan ready', data: plan });

    // 2) Auto-trim: visuals must never exceed the voice-over.
    const voiceDuration = transcript.duration || spine.duration;
    const fit = fitInsertsToVoice({
      voiceDuration,
      strategy,
      inserts: plan.timeline.map((t) => ({ id: t.id, duration: t.duration })),
    });
    const positioned = layoutTimeline(fit.segments);
    this._emit('fit', {
      message: fit.fits ? 'Inserts fit the voice-over' : `Auto-trimmed inserts to fit (scale ${fit.scale})`,
      data: fit,
    });

    // 3) Render each kept segment client-side, then concat.
    const renderedClips = [];
    const timelineModel = [];
    for (const pos of positioned) {
      const planItem = plan.timeline.find((t) => t.id === pos.id);
      const source = this.clips.get(planItem?.sourceId);
      if (!source) {
        this._emit('render', { message: `Skipping ${pos.id}: unknown sourceId`, data: planItem });
        continue;
      }
      this._emit('render', {
        message: `Trimming "${source.name}" → ${pos.duration.toFixed(2)}s`,
        progress: renderedClips.length / positioned.length,
      });
      const clipBlob = await ffmpeg.trimClip(source.file, {
        start: Math.max(0, planItem.sourceStart || 0),
        duration: pos.duration,
      });
      renderedClips.push(clipBlob);
      timelineModel.push({
        id: pos.id,
        sourceId: source.id,
        sourceName: source.name,
        start: pos.start,
        end: pos.end,
        duration: pos.duration,
        note: planItem.note || '',
      });
    }

    if (!renderedClips.length) {
      throw new Error('Orchestrator: edit plan produced no renderable clips');
    }

    this._emit('render', { message: 'Stitching timeline…', progress: 0.9 });
    let videoBlob =
      renderedClips.length === 1 ? renderedClips[0] : await ffmpeg.concatClips(renderedClips);

    // 4) Generate + mix audio layers (SFX / music) if requested.
    const audioModel = [];
    if (withAudio && plan.audioLayers?.length) {
      for (const layer of plan.audioLayers) {
        try {
          this._emit('audio', { message: `Generating ${layer.kind}: "${layer.prompt}"` });
          const audioBlob = await generateForLayer(layer, { apiKey: this.keys.elevenlabs });
          videoBlob = await ffmpeg.mixAudioOver(videoBlob, audioBlob, {
            offset: Math.max(0, layer.start || 0),
            volume: layer.volume ?? 0.3,
          });
          audioModel.push({ ...layer });
        } catch (err) {
          // Audio is enhancement, not core — never fail the whole render for it.
          this._emit('audio', { message: `Skipped ${layer.kind}: ${err.message}` });
        }
      }
    }

    // 5) Hand back a local Blob URL + plain models. UI just plays this.
    const previewUrl = this._url(videoBlob);
    this._emit('done', { message: 'Render complete', progress: 1, data: { previewUrl } });

    return { previewUrl, timeline: timelineModel, audio: audioModel, plan, fit };
  }

  /* --------------------------- lifecycle --------------------------- */

  /** Revoke every Blob URL we created. Call on unmount / project close. */
  dispose() {
    for (const url of this._urls) URL.revokeObjectURL(url);
    this._urls.clear();
  }

  /* --------------------------- internals --------------------------- */

  _spine() {
    if (!this.spineId) throw new Error('Orchestrator: no media ingested yet');
    const clip = this.clips.get(this.spineId);
    if (!clip) throw new Error('Orchestrator: spine clip missing');
    return clip;
  }

  _url(blob) {
    const url = URL.createObjectURL(blob);
    this._urls.add(url);
    return url;
  }

  _emit(stage, payload) {
    this.onEvent({ stage, ...payload });
  }
}

/* --------------------------- helpers --------------------------- */

const publicClip = ({ id, name, type, duration }) => ({ id, name, type, duration });

function cryptoId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2, 10);
}
