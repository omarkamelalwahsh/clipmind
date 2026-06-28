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
import { fitInsertsToVoice, layoutTimeline, alignEventsToBeats } from './utils/videoMath.js';
import { detectBeats } from './utils/audioBeats.js';
import { buildCaptionCues, renderCaptionPng } from './utils/captions.js';
import { transcribeVideo } from './services/groqService.js';
import { generateEditPlan } from './services/geminiService.js';
import { generateForLayer } from './services/elevenLabsService.js';
import { generateBackdrop } from './services/geminiImageService.js';

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

  /**
   * Register a clip the UI already enriched (id, file, type, duration). Used by
   * the frontend's ingest flow which mints its own ids + thumbnails.
   * @param {string} id
   * @param {{ name:string, file:Blob|File, type?:string, duration?:number }} item
   */
  registerClip(id, item) {
    const type = item.type || (item.file?.type?.startsWith('audio') ? 'audio' : 'video');
    this.clips.set(id, {
      id,
      name: item.name,
      file: item.file,
      type,
      duration: Number(item.duration) || 0,
    });
    // First video (or first clip) becomes the spine.
    if (!this.spineId && (type !== 'audio' || ![...this.clips.values()].some((c) => c.type !== 'audio'))) {
      this.spineId = id;
      this.transcript = null;
      this._beats = null;
    }
    return publicClip(this.clips.get(id));
  }

  /** Alias the UI uses for removal. */
  unregisterClip(clipId) {
    this.removeClip(clipId);
  }

  /** Remove a clip from the bin. Reassigns the spine + clears transcript if needed. */
  removeClip(clipId) {
    if (!this.clips.has(clipId)) return;
    this.clips.delete(clipId);
    if (this.spineId === clipId) {
      const next = [...this.clips.values()].find((c) => c.type === 'video') || [...this.clips.values()][0];
      this.spineId = next?.id || null;
      this.transcript = null; // narration source changed
      this._beats = null;     // beat grid changed
    }
    this._emit('ingest', { message: 'Clip removed', data: { clipId } });
  }

  /* --------------------------- transcription --------------------------- */

  /**
   * Transcribe the spine clip (cached). Word-level timestamps power prompt edits.
   * @returns {Promise<import('./services/groqService.js').NormalizedTranscript>}
   */
  async transcribe() {
    if (this.transcript) return this.transcript;
    // De-dupe: FFmpeg.wasm is a single non-reentrant instance, so concurrent
    // callers (e.g. the Transcript tab + a render) must share ONE run.
    if (this._transcribePromise) return this._transcribePromise;

    this._transcribePromise = (async () => {
      const spine = this._spine();
      await this._ensureEngine();
      this._emit('transcribe', { message: 'Extracting audio & transcribing (Whisper large-v3)…' });
      const t = await transcribeVideo(spine.file, {
        apiKey: this.keys.groq,
        geminiApiKey: this.keys.gemini,
      });
      this.transcript = t;
      this._emit('transcribe', {
        message: `Transcribed ${t.words.length} words`,
        data: { duration: t.duration },
      });
      return t;
    })();

    try {
      return await this._transcribePromise;
    } finally {
      this._transcribePromise = null;
    }
  }

  /** Warm up FFmpeg.wasm once, surfacing load status (download/init) to the UI. */
  async _ensureEngine() {
    if (this._engineReady) return;
    this._emit('engine', { message: 'Loading FFmpeg engine…' });
    await ffmpeg.getFFmpeg(undefined, (status) => this._emit('engine', { message: status }));
    
    // Subscribe to progress events from the active FFmpeg execution
    ffmpeg.onProgress((p) => {
      if (this._currentSegmentIndex !== undefined && this._totalSegments !== undefined) {
        const segWeight = 0.8; // segments render takes 80% of total render progress
        const overall = (this._currentSegmentIndex + p) / this._totalSegments;
        this._emit('render', { progress: overall * segWeight });
      } else {
        this._emit('render', { progress: p });
      }
    });

    this._engineReady = true;
  }

  /**
   * Detect musical beats/transients in the spine clip (cached). Uses the Web
   * Audio API directly on the original file — NO FFmpeg, so it works even on the
   * heaviest clips and regardless of the FFmpeg engine state.
   * @returns {Promise<import('./utils/audioBeats.js').BeatAnalysis>}
   */
  async analyzeBeats() {
    if (this._beats) return this._beats;
    if (this._beatsPromise) return this._beatsPromise;

    this._beatsPromise = (async () => {
      const spine = this._spine();
      this._emit('beats', { message: 'Detecting musical beats (Web Audio)…' });
      
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Beat detection timed out after 8s')), 8000)
      );
      const analysis = await Promise.race([
        detectBeats(spine.file),
        timeout,
      ]);
      
      this._beats = analysis;
      this._emit('beats', {
        message: `Found ${analysis.count} beats · ~${analysis.bpm} BPM`,
        data: { count: analysis.count, bpm: analysis.bpm },
      });
      return analysis;
    })();

    try {
      return await this._beatsPromise;
    } finally {
      this._beatsPromise = null;
    }
  }

  /* --------------------------- the big one --------------------------- */

  async planAndRender(userPrompt, {
    strategy = 'proportional',
    withAudio = true,
    mode = 'Video Gen',
    framesType = 'Frames',
    aspectRatio = '16:9',
    duration = '5s',
    firstFrame = null,
    lastFrame = null,
  } = {}) {
    const spine = this._spine();

    // 0) Analyze the media structure. Beats (Web Audio) always run; transcription
    //    (Whisper, needs FFmpeg) is best-effort so montages with no speech — or a
    //    not-yet-loaded engine — still produce a plan.
    const [beatAnalysis, transcript] = await Promise.all([
      this.analyzeBeats().catch((err) => {
        this._emit('beats', { message: `Beat detection skipped: ${err.message}` });
        return { beats: [], bpm: 0, duration: 0, count: 0 };
      }),
      this.transcribe().catch((err) => {
        this._emit('transcribe', { message: `Transcription skipped: ${err.message}` });
        return { text: '', words: [], segments: [], duration: 0 };
      })
    ]);

    // 1) Ask the agent to analyze intent + rhythm and produce a strict-JSON EDL.
    this._emit('plan', { message: `Analyzing intent & rhythm (Mode: ${mode}, Ratio: ${aspectRatio}, Target: ${duration})…` });
    if (firstFrame || lastFrame) {
      this._emit('plan', {
        message: `Guided generation using uploaded frames: ${[firstFrame ? 'First Frame' : '', lastFrame ? 'Last Frame' : ''].filter(Boolean).join(', ')}`
      });
    }

    const plan = await generateEditPlan(
      {
        userPrompt,
        mediaContext: {
          voiceDuration: transcript.duration || beatAnalysis.duration || spine.duration,
          words: transcript.words,
          segments: transcript.segments,
          bpm: beatAnalysis.bpm,
          beats: beatAnalysis.beats,
          availableClips: [...this.clips.values()].map(publicClip),
          parameters: { mode, framesType, aspectRatio, duration, firstFrame, lastFrame },
        },
      },
      { apiKey: this.keys.gemini },
    );
    this._emit('plan', { message: plan.summary || 'Plan ready', data: plan });
    const intents = plan.intents || [];
    if (intents.length) this._emit('plan', { message: `Detected intents: ${intents.join(', ')}` });

    // 1b) Transcript-only request → stop here. No trimming, no rendering. The
    //     transcript is already computed; surface it for the TRANSCRIPT panel.
    const noEdits =
      (!plan.timeline || plan.timeline.length === 0) &&
      (!plan.audioLayers || plan.audioLayers.length === 0) &&
      (!plan.background || plan.background.action === 'none');
    if (plan.transcriptOnly || (intents.length === 1 && intents[0] === 'transcribe' && noEdits)) {
      const wordCount = transcript.words?.length || 0;
      // A transcript-only request with no transcript IS the failure — surface it
      // loudly instead of returning a blank panel.
      if (wordCount === 0 && !(transcript.text || '').trim()) {
        throw new Error(
          'Transcription produced no text. The audio track may be silent/music-only, or both Groq (browser CORS) and the Gemini fallback failed. See the activity log.',
        );
      }
      this._emit('done', { message: `Transcript ready — ${wordCount} words. Opening the TRANSCRIPT tab…`, progress: 1 });
      return {
        transcriptOnly: true,
        transcript,
        previewUrl: null,
        timeline: [],
        audio: [],
        beats: { count: beatAnalysis.count, bpm: beatAnalysis.bpm, timestamps: beatAnalysis.beats },
        plan,
        intents,
      };
    }

    // 1c) Captions-only request → burn subtitles straight onto the spine clip.
    if (plan.burnCaptions && noEdits) {
      const out = await this._burnCaptionsOnto(spine.file, transcript);
      const previewUrl = this._url(out);
      this._emit('done', { message: 'Captions burned into the video', progress: 1, data: { previewUrl } });
      return {
        previewUrl,
        captions: true,
        transcript,
        timeline: [],
        audio: [],
        beats: { count: beatAnalysis.count, bpm: beatAnalysis.bpm, timestamps: beatAnalysis.beats },
        plan,
        intents,
      };
    }

    // 2) Auto-trim: visuals must never exceed the voice-over / music spine.
    const voiceDuration = transcript.duration || beatAnalysis.duration || spine.duration;
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

    // 3) Resolve the BACKGROUND layer up-front (AI image → graceful local fallback).
    const bg = await this._resolveBackground(plan.background);

    // 4) Render each kept segment: trim → (optional) chroma-key composite over bg.
    const renderedClips = [];
    const timelineModel = [];
    for (const pos of positioned) {
      const planItem = plan.timeline.find((t) => t.id === pos.id);
      const source = this.clips.get(planItem?.sourceId);
      if (!source) {
        this._emit('render', { message: `Skipping ${pos.id}: unknown sourceId`, data: planItem });
        continue;
      }
      this._currentSegmentIndex = renderedClips.length;
      this._totalSegments = positioned.length;
      this._emit('render', {
        message: `Trimming "${source.name}" → ${pos.duration.toFixed(2)}s`,
        progress: (renderedClips.length / positioned.length) * 0.8,
      });
      let clipBlob = await ffmpeg.trimClip(source.file, {
        start: Math.max(0, planItem.sourceStart || 0),
        duration: pos.duration,
      });

      const composited = Boolean(bg && source.type !== 'audio');
      if (composited) {
        this._emit('render', { message: `Chroma-keying "${source.name}" over the ${bg.source} backdrop…` });
        clipBlob = await ffmpeg.compositeChromaKey(clipBlob, bg.blob, {
          color: bg.keyColor,
          similarity: bg.similarity,
          blend: bg.blend,
        });
      }

      renderedClips.push(clipBlob);
      timelineModel.push({
        id: pos.id,
        sourceId: source.id,
        sourceName: source.name,
        sourceStart: Math.max(0, planItem.sourceStart || 0),
        start: pos.start,
        end: pos.end,
        duration: pos.duration,
        note: planItem.note || '',
        composited,
      });
    }

    this._currentSegmentIndex = undefined;
    this._totalSegments = undefined;

    if (!renderedClips.length) {
      throw new Error('Orchestrator: edit plan produced no renderable clips');
    }

    this._emit('render', { message: 'Stitching timeline…', progress: 0.85 });
    let videoBlob =
      renderedClips.length === 1 ? renderedClips[0] : await ffmpeg.concatClips(renderedClips);

    // 4b) Burn synced captions onto the assembled video, if requested.
    if (plan.burnCaptions) {
      videoBlob = await this._burnCaptionsOnto(videoBlob, transcript);
    }

    // 5) Beat-align audio triggers, generate them, and mix in ONE multi-track
    //    pass. SFX snap to the nearest detected beat; music beds stay at start.
    const audioModel = [];
    if (withAudio && plan.audioLayers?.length) {
      // Snap only short triggers (SFX) to beats; leave long beds (music) anchored.
      const sfx = plan.audioLayers.filter((l) => l.kind !== 'music');
      const beds = plan.audioLayers.filter((l) => l.kind === 'music');
      const alignedSfx = alignEventsToBeats(sfx, beatAnalysis.beats);
      const aligned = [...beds.map((l) => ({ ...l, snapped: false })), ...alignedSfx];

      const layers = [];
      for (const layer of aligned) {
        try {
          this._emit('audio', {
            message: `Generating ${layer.kind} @ ${Number(layer.start || 0).toFixed(2)}s` +
              (layer.snapped ? ' (on beat)' : '') + `: "${layer.prompt}"`,
          });
          const blob = await generateForLayer(layer, { apiKey: this.keys.elevenlabs });
          layers.push({ blob, start: Math.max(0, layer.start || 0), volume: layer.volume ?? 0.3 });
          audioModel.push({ ...layer });
        } catch (err) {
          // Audio is enhancement, not core — never fail the whole render for it.
          this._emit('audio', { message: `Skipped ${layer.kind}: ${err.message}` });
        }
      }

      if (layers.length) {
        // Replace the original audio only when the user asked to swap it out AND
        // we actually produced a replacement (never leave the clip silent).
        const replaceAudio = Boolean(plan.replaceOriginalAudio);
        this._emit('audio', {
          message: `${replaceAudio ? 'Replacing original audio with' : 'Mixing'} ${layers.length} track(s)…`,
        });
        // Copy the video stream (no re-encode) unless we already baked in a filter.
        videoBlob = await ffmpeg.mixAudioLayers(videoBlob, layers, {
          reencodeVideo: Boolean(bg),
          keepOriginalAudio: !replaceAudio,
        });
      }
    }

    // 6) Hand back a local Blob URL + plain models. UI just plays this.
    const previewUrl = this._url(videoBlob);
    const backgroundModel = bg
      ? { action: plan.background.action, source: bg.source, prompt: bg.prompt, url: this._url(bg.blob) }
      : null;
    this._emit('done', { message: 'Render complete', progress: 1, data: { previewUrl } });

    return {
      previewUrl,
      timeline: timelineModel,
      audio: audioModel,
      background: backgroundModel,
      beats: { count: beatAnalysis.count, bpm: beatAnalysis.bpm, timestamps: beatAnalysis.beats },
      plan,
      fit,
      intents,
    };
  }

  /**
   * Render a custom user-edited timeline.
   * @param {Array<{ sourceId: string, sourceStart: number, duration: number }>} segments
   * @returns {Promise<{ previewUrl: string, timeline: object[] }>}
   */
  async renderTimeline(segments, audioLayers = []) {
    if (!segments || !segments.length) {
      throw new Error('renderTimeline: timeline is empty');
    }
    await this._ensureEngine();
    this._emit('render', { message: 'Rendering custom timeline…', progress: 0 });

    const renderedClips = [];
    const timelineModel = [];
    let currentStart = 0;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const source = this.clips.get(seg.sourceId);
      if (!source) {
        this._emit('render', { message: `Skipping segment: unknown sourceId ${seg.sourceId}` });
        continue;
      }

      this._currentSegmentIndex = renderedClips.length;
      this._totalSegments = segments.length;

      this._emit('render', {
        message: `Trimming "${source.name}" → ${seg.duration.toFixed(2)}s`,
        progress: (i / segments.length) * 0.8,
      });

      const clipBlob = await ffmpeg.trimClip(source.file, {
        start: seg.sourceStart || 0,
        duration: seg.duration,
        volume: seg.volume !== undefined ? seg.volume : 1.0,
      });

      renderedClips.push(clipBlob);
      timelineModel.push({
        id: seg.id || cryptoId(),
        sourceId: source.id,
        sourceName: source.name,
        sourceStart: seg.sourceStart || 0,
        start: currentStart,
        end: currentStart + seg.duration,
        duration: seg.duration,
        type: source.type,
        volume: seg.volume !== undefined ? seg.volume : 1.0,
      });
      currentStart += seg.duration;
    }

    this._currentSegmentIndex = undefined;
    this._totalSegments = undefined;

    if (!renderedClips.length) {
      throw new Error('Orchestrator: custom timeline produced no renderable clips');
    }

    this._emit('render', { message: 'Stitching timeline…', progress: 0.85 });
    let videoBlob = renderedClips.length === 1 ? renderedClips[0] : await ffmpeg.concatClips(renderedClips);

    if (audioLayers && audioLayers.length > 0) {
      this._emit('render', { message: 'Mixing audio layers…', progress: 0.95 });
      const layersToMix = [];
      for (const layer of audioLayers) {
        if (layer.blob) {
          layersToMix.push({
            blob: layer.blob,
            start: layer.start || 0,
            volume: layer.volume !== undefined ? layer.volume : 0.5,
          });
        }
      }
      if (layersToMix.length > 0) {
        videoBlob = await ffmpeg.mixAudioLayers(videoBlob, layersToMix, {
          reencodeVideo: false,
          keepOriginalAudio: true,
        });
      }
    }

    const previewUrl = this._url(videoBlob);
    
    this._emit('done', { message: 'Render complete', progress: 1, data: { previewUrl } });

    return {
      previewUrl,
      timeline: timelineModel
    };
  }

  /**
   * Re-render a user-EDITED timeline (manual edit mode). Trims each kept segment
   * from its source at the chosen volume and concatenates them — no AI calls.
   * @param {Array<{sourceId:string, sourceStart:number, duration:number, volume?:number, type?:string}>} segments
   * @returns {Promise<{ previewUrl:string, timeline:object[] }>}
   */
  async renderTimeline(segments) {
    await this._ensureEngine();
    const renderable = (segments || []).filter((s) => s.type !== 'audio' && this.clips.has(s.sourceId));
    if (!renderable.length) throw new Error('renderTimeline: no renderable segments');

    const clips = [];
    for (let i = 0; i < renderable.length; i++) {
      const seg = renderable[i];
      const source = this.clips.get(seg.sourceId);
      this._emit('render', {
        message: `Trimming "${source.name}" → ${Number(seg.duration).toFixed(2)}s`,
        progress: i / renderable.length,
      });
      const blob = await ffmpeg.trimClip(source.file, {
        start: Math.max(0, seg.sourceStart || 0),
        duration: seg.duration,
        volume: seg.volume ?? 1.0,
      });
      clips.push(blob);
    }

    this._emit('render', { message: 'Stitching timeline…', progress: 0.9 });
    const videoBlob = clips.length === 1 ? clips[0] : await ffmpeg.concatClips(clips);
    const previewUrl = this._url(videoBlob);
    this._emit('done', { message: 'Timeline re-rendered', progress: 1, data: { previewUrl } });
    return { previewUrl, timeline: segments };
  }

  /**
   * Render transcript cues to PNGs and burn them onto a video (synced subtitles).
   * @param {Blob|File} videoBlob
   * @param {object} transcript
   * @returns {Promise<Blob>}
   */
  async _burnCaptionsOnto(videoBlob, transcript) {
    await this._ensureEngine();
    const cues = buildCaptionCues(transcript);
    if (!cues.length) {
      throw new Error('Cannot caption: no transcript words were available for this clip.');
    }
    this._emit('captions', { message: `Drawing ${cues.length} caption cues…` });
    const rendered = [];
    for (const c of cues) {
      const png = await renderCaptionPng(c.text);
      rendered.push({ png, start: c.start, end: c.end });
    }
    this._emit('captions', { message: 'Burning captions into the video (FFmpeg)…' });
    return ffmpeg.burnCaptions(videoBlob, rendered);
  }

  /**
   * Resolve the background layer for a chroma-key composite.
   * - action "none"      → null (no compositing)
   * - action "remove"    → locally synthesized neutral backdrop
   * - action "replace"   → AI-generated backdrop, falling back to a local
   *                        gradient if image generation is unavailable.
   * @returns {Promise<null | { blob:Blob, source:'ai'|'synthesized'|'fallback', prompt:string, keyColor:string, similarity:number, blend:number }>}
   */
  async _resolveBackground(background) {
    if (!background || !background.action || background.action === 'none') return null;

    const keyColor = normalizeKeyColor(background.keyColor);
    const similarity = background.similarity ?? 0.18;
    const blend = background.blend ?? 0.08;
    const prompt = background.backdropPrompt || '';

    // "remove", or "replace" without a usable prompt/flag → neutral local backdrop.
    if (background.action === 'remove' || !background.generateImage || !prompt) {
      this._emit('background', { message: 'Synthesizing neutral backdrop (local)…' });
      const blob = await ffmpeg.synthesizeBackdrop();
      return { blob, source: 'synthesized', prompt, keyColor, similarity, blend };
    }

    // "replace" with a described backdrop → try the AI image model, then fall back.
    try {
      this._emit('background', { message: `Generating AI backdrop: "${prompt}"` });
      const blob = await generateBackdrop({ prompt }, { apiKey: this.keys.gemini });
      this._emit('background', { message: 'AI backdrop ready' });
      return { blob, source: 'ai', prompt, keyColor, similarity, blend };
    } catch (err) {
      this._emit('background', { message: `AI backdrop unavailable (${err.message}) — using local gradient` });
      const blob = await ffmpeg.synthesizeBackdrop();
      return { blob, source: 'fallback', prompt, keyColor, similarity, blend };
    }
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

/**
 * Normalize a key color into FFmpeg's 0xRRGGBB form. Gemini sometimes returns a
 * color *name* ("green") or a #hex instead of the documented 0x format.
 */
function normalizeKeyColor(value) {
  if (!value) return '0x00FF00';
  const v = String(value).trim().toLowerCase();
  const names = { green: '0x00FF00', blue: '0x0000FF', red: '0xFF0000', cyan: '0x00FFFF', magenta: '0xFF00FF' };
  if (names[v]) return names[v];
  if (v.startsWith('#')) return '0x' + v.slice(1);
  if (v.startsWith('0x')) return '0x' + v.slice(2).toUpperCase();
  if (/^[0-9a-f]{6}$/.test(v)) return '0x' + v.toUpperCase();
  return '0x00FF00';
}

function cryptoId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2, 10);
}
