/**
 * elevenLabsService.js
 * -----------------------------------------------------------------------------
 * Text-to-audio generation via ElevenLabs. Two flavors:
 *   - Sound effects  → POST /v1/sound-generation (duration-controlled)
 *   - Background music → POST /v1/music (longer beds; falls back to SFX if the
 *     music endpoint is unavailable on the account tier).
 *
 * Returns audio Blobs the orchestrator overlays onto the timeline locally.
 */

const SFX_URL = 'https://api.elevenlabs.io/v1/sound-generation';
const MUSIC_URL = 'https://api.elevenlabs.io/v1/music';

/** ElevenLabs SFX caps a single generation at ~22s. */
const SFX_MAX_SECONDS = 22;

/**
 * Generate a sound effect from a prompt.
 * @param {object} args
 * @param {string} args.prompt  Vivid description, e.g. "soft whoosh transition".
 * @param {number} [args.durationSeconds]  0.5–22. Omit to let the model decide.
 * @param {number} [args.promptInfluence=0.4]  0..1, higher = closer to prompt.
 * @param {object} cfg
 * @param {string} cfg.apiKey
 * @returns {Promise<Blob>} audio/mpeg
 */
export async function generateSoundEffect({ prompt, durationSeconds, promptInfluence = 0.4 }, { apiKey } = {}) {
  if (!apiKey) throw new Error('elevenLabsService: missing apiKey');
  if (!prompt) throw new Error('elevenLabsService: missing prompt');

  const payload = { text: prompt, prompt_influence: clamp01(promptInfluence) };
  if (durationSeconds != null) {
    payload.duration_seconds = clamp(durationSeconds, 0.5, SFX_MAX_SECONDS);
  }

  return postForAudio(SFX_URL, payload, apiKey);
}

/**
 * Generate a background music bed from a prompt. Gracefully degrades to a
 * looped/long SFX request if the dedicated music endpoint 404/403s.
 * @param {object} args
 * @param {string} args.prompt
 * @param {number} args.durationSeconds  Target length in seconds.
 * @param {object} cfg
 * @param {string} cfg.apiKey
 * @returns {Promise<Blob>} audio/mpeg
 */
export async function generateMusic({ prompt, durationSeconds }, { apiKey } = {}) {
  if (!apiKey) throw new Error('elevenLabsService: missing apiKey');
  if (!prompt) throw new Error('elevenLabsService: missing prompt');

  const ms = Math.round(Math.max(1, durationSeconds || 10) * 1000);
  try {
    return await postForAudio(MUSIC_URL, { prompt, music_length_ms: ms }, apiKey);
  } catch (err) {
    // Tier doesn't expose /music — fall back to a long, low-influence SFX bed.
    return generateSoundEffect(
      { prompt: `ambient background music bed, looping: ${prompt}`, durationSeconds, promptInfluence: 0.25 },
      { apiKey },
    );
  }
}

/**
 * Dispatch a single audioLayer from the edit plan to the right generator.
 * @param {{ kind:'sfx'|'music', prompt:string, duration:number }} layer
 * @param {object} cfg  { apiKey }
 * @returns {Promise<Blob>}
 */
export function generateForLayer(layer, cfg) {
  return layer.kind === 'music'
    ? generateMusic({ prompt: layer.prompt, durationSeconds: layer.duration }, cfg)
    : generateSoundEffect({ prompt: layer.prompt, durationSeconds: layer.duration }, cfg);
}

/* -------------------------------------------------------------------------- */

async function postForAudio(url, payload, apiKey) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await safeText(res);
    throw new Error(`elevenLabsService: generation failed (${res.status}) ${detail}`);
  }
  const buf = await res.arrayBuffer();
  return new Blob([buf], { type: 'audio/mpeg' });
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
const clamp01 = (n) => clamp(n, 0, 1);

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
