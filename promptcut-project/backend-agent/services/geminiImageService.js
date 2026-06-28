/**
 * geminiImageService.js
 * -----------------------------------------------------------------------------
 * Generative backdrop synthesis via Gemini's image model ("Nano Banana").
 * Given a backdrop description it returns a still image Blob to be used as the
 * background layer behind a chroma-keyed speaker.
 *
 * NOTE: image generation requires quota the free tier does not grant (returns
 * 429 "limit: 0"). This service therefore throws a typed error on failure so the
 * orchestrator can gracefully fall back to a locally synthesized backdrop.
 */

const IMAGE_MODEL = 'gemini-2.5-flash-image';
const ENDPOINT = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

export class ImageGenUnavailable extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImageGenUnavailable';
  }
}

/**
 * Generate a backdrop image from a text prompt.
 * @param {object} args
 * @param {string} args.prompt        Vivid backdrop description.
 * @param {string} [args.aspectRatio] e.g. "16:9" (hinted into the prompt).
 * @param {object} cfg
 * @param {string} cfg.apiKey
 * @returns {Promise<Blob>} image/* blob
 * @throws {ImageGenUnavailable} when the model is unavailable / quota-limited.
 */
export async function generateBackdrop({ prompt, aspectRatio = '16:9' }, { apiKey } = {}) {
  if (!apiKey) throw new ImageGenUnavailable('missing apiKey');
  if (!prompt) throw new ImageGenUnavailable('missing prompt');

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `${prompt}. Aspect ratio ${aspectRatio}, photorealistic, cinematic lighting, high detail, no text, no watermark.` }],
      },
    ],
    generationConfig: { responseModalities: ['IMAGE'] },
  };

  let res;
  try {
    res = await fetch(ENDPOINT(IMAGE_MODEL, apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ImageGenUnavailable(`network error: ${err.message}`);
  }

  if (!res.ok) {
    const detail = await safeText(res);
    throw new ImageGenUnavailable(`image model ${res.status}: ${detail.slice(0, 160)}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p.inlineData?.data || p.inline_data?.data);
  const inline = imgPart?.inlineData || imgPart?.inline_data;
  if (!inline?.data) {
    throw new ImageGenUnavailable('response contained no image data');
  }

  return base64ToBlob(inline.data, inline.mimeType || inline.mime_type || 'image/png');
}

/** Decode a base64 payload into a Blob (browser-safe). */
function base64ToBlob(base64, mime) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
