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
 * Transcribe an already-extracted audio blob, falling back to Gemini 2.5 Flash if Groq fails (e.g., due to CORS in browser).
 * @param {Blob|File} audio
 * @param {object} cfg
 * @param {string} cfg.apiKey  Groq API key.
 * @param {string} [cfg.geminiApiKey]  Optional Gemini API key for fallback.
 * @param {string} [cfg.language]  ISO code to skip auto-detect (faster).
 * @param {string} [cfg.prompt]  Optional biasing prompt (names, jargon).
 * @returns {Promise<NormalizedTranscript>}
 */
export async function transcribeAudio(audio, { apiKey, geminiApiKey, language, prompt } = {}) {
  if (!apiKey) throw new Error('groqService: missing apiKey');
  if (!audio) throw new Error('groqService: missing audio blob');

  try {
    const form = new FormData();
    form.append('file', audio, 'audio.mp3');
    form.append('model', MODEL);
    form.append('response_format', 'verbose_json');
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
      throw new Error(`Groq status ${res.status}`);
    }

    const raw = await res.json();
    return normalize(raw);
  } catch (err) {
    console.warn("Groq transcription failed (likely CORS or network), falling back to Gemini:", err);
    if (geminiApiKey) {
      return transcribeAudioWithGemini(audio, geminiApiKey);
    }
    throw err;
  }
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
 * Fallback audio transcription using Gemini 2.5 Flash.
 * Runs 100% fine in browser CORS context.
 */
async function transcribeAudioWithGemini(audioBlob, apiKey) {
  const base64Audio = await blobToBase64(audioBlob);
  const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: audioBlob.type || 'audio/mp3',
              data: base64Audio,
            },
          },
          {
            text: "Transcribe the following audio file. Return a JSON object matching this schema:\n{\n  \"text\": \"full transcription text\",\n  \"words\": [\n    { \"word\": \"example\", \"start\": 0.0, \"end\": 0.5 }\n  ],\n  \"segments\": [\n    { \"id\": 0, \"text\": \"example\", \"start\": 0.0, \"end\": 0.5 }\n  ]\n}",
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          text: { type: "STRING" },
          words: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                word: { type: "STRING" },
                start: { type: "NUMBER" },
                end: { type: "NUMBER" },
              },
              required: ["word", "start", "end"],
            },
          },
          segments: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                id: { type: "INTEGER" },
                text: { type: "STRING" },
                start: { type: "NUMBER" },
                end: { type: "NUMBER" },
              },
              required: ["id", "text", "start", "end"],
            },
          },
        },
        required: ["text", "words", "segments"],
      },
    },
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Gemini transcription failed: ${res.status}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  const parsed = JSON.parse(text.trim());
  return {
    text: parsed.text || '',
    duration: parsed.words && parsed.words.length ? parsed.words[parsed.words.length - 1].end : 0,
    words: parsed.words || [],
    segments: parsed.segments || [],
  };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

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
