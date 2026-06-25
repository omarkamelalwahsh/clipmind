/**
 * groqService.js
 * -----------------------------------------------------------------------------
 * Speech-to-Text via Groq Cloud (OpenAI-compatible audio endpoint) using
 * `whisper-large-v3`. Returns WORD-LEVEL timestamps, which are the backbone of
 * prompt-based editing ("cut where she says X", "insert b-roll on this phrase").
 *
 * Environment-agnostic: the API key is injected, never read from globals.
 */

import { extractAudio } from '../utils/ffmpegHelper.js';

const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = 'whisper-large-v3';

/**
 * Transcribe an already-extracted audio blob.
 * @param {Blob|File} audio
 * @param {object} cfg
 * @param {string} cfg.apiKey  Groq API key.
 * @param {string} [cfg.language]  ISO code to skip auto-detect (faster).
 * @param {string} [cfg.prompt]  Optional biasing prompt (names, jargon).
 * @returns {Promise<NormalizedTranscript>}
 */
export async function transcribeAudio(audio, { apiKey, language, prompt } = {}) {
  if (!apiKey) throw new Error('groqService: missing apiKey');
  if (!audio) throw new Error('groqService: missing audio blob');

  const form = new FormData();
  form.append('file', audio, 'audio.mp3');
  form.append('model', MODEL);
  form.append('response_format', 'verbose_json');
  // Word-level granularity is the whole point — segment-level is the default.
  form.append('timestamp_granularities[]', 'word');
  form.append('timestamp_granularities[]', 'segment');
  if (language) form.append('language', language);
  if (prompt) form.append('prompt', prompt);

  const res = await fetch(GROQ_TRANSCRIBE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const detail = await safeText(res);
    throw new Error(`groqService: transcription failed (${res.status}) ${detail}`);
  }

  const raw = await res.json();
  return normalize(raw);
}

/**
 * Convenience: extract audio from a video (client-side, FFmpeg.wasm) and then
 * transcribe in one call.
 * @param {Blob|File} video
 * @param {object} cfg  Same as transcribeAudio.
 * @returns {Promise<NormalizedTranscript>}
 */
export async function transcribeVideo(video, cfg) {
  const audio = await extractAudio(video);
  return transcribeAudio(audio, cfg);
}

/**
 * @typedef {object} NormalizedTranscript
 * @property {string} text   Full transcript.
 * @property {number} duration  Seconds (best-effort from the last word/segment).
 * @property {string} [language]
 * @property {Array<{ word: string, start: number, end: number }>} words
 * @property {Array<{ id: number, text: string, start: number, end: number }>} segments
 */

/** Shape Groq's verbose_json into a stable, minimal contract for the agent. */
function normalize(raw) {
  const words = (raw.words || []).map((w) => ({
    word: w.word,
    start: Number(w.start) || 0,
    end: Number(w.end) || 0,
  }));
  const segments = (raw.segments || []).map((s) => ({
    id: s.id,
    text: (s.text || '').trim(),
    start: Number(s.start) || 0,
    end: Number(s.end) || 0,
  }));

  const lastWordEnd = words.length ? words[words.length - 1].end : 0;
  const lastSegEnd = segments.length ? segments[segments.length - 1].end : 0;

  return {
    text: (raw.text || '').trim(),
    duration: Number(raw.duration) || Math.max(lastWordEnd, lastSegEnd),
    language: raw.language,
    words,
    segments,
  };
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
