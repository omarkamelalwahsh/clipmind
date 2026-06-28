/**
 * captions.js
 * -----------------------------------------------------------------------------
 * Burned-in captions WITHOUT libass/drawtext (which the FFmpeg.wasm core does
 * not ship). Each caption cue is rendered to a transparent full-frame PNG via a
 * browser <canvas>, then the orchestrator overlays it onto the video for its
 * time window. Only the `overlay` filter is required — always available.
 */

const round = (t) => Math.round(t * 1000) / 1000;

/**
 * Group a transcript into readable caption cues.
 * Prefers Whisper segments; falls back to chunking words.
 * @param {{ words?:Array, segments?:Array }} transcript
 * @param {object} [opts]
 * @param {number} [opts.maxWordsPerCue=7]
 * @param {number} [opts.maxCueDuration=4]   seconds
 * @param {number} [opts.maxCues=80]
 * @returns {Array<{ text:string, start:number, end:number }>}
 */
export function buildCaptionCues(transcript, { maxWordsPerCue = 7, maxCueDuration = 4, maxCues = 80 } = {}) {
  const words = transcript?.words || [];

  // Word-level chunking gives the tightest sync; use it when we have timings.
  if (words.length) {
    const cues = [];
    let bucket = [];
    let start = words[0].start || 0;
    for (const w of words) {
      bucket.push((w.word || '').trim());
      const dur = (w.end || 0) - start;
      if (bucket.length >= maxWordsPerCue || dur >= maxCueDuration) {
        cues.push({ text: bucket.join(' '), start: round(start), end: round(w.end || start) });
        bucket = [];
        start = w.end || start;
      }
    }
    if (bucket.length) {
      const last = words[words.length - 1];
      cues.push({ text: bucket.join(' '), start: round(start), end: round(last.end || start) });
    }
    return cues.slice(0, maxCues);
  }

  // Fallback: Whisper segments.
  return (transcript?.segments || [])
    .map((s) => ({ text: (s.text || '').trim(), start: round(s.start || 0), end: round(s.end || 0) }))
    .filter((c) => c.text)
    .slice(0, maxCues);
}

/**
 * Render one caption cue to a transparent full-frame PNG (text in a lower-third
 * pill). Returns a Blob the orchestrator writes into FFmpeg's FS.
 * @param {string} text
 * @param {object} [opts]
 * @param {number} [opts.width=1280]
 * @param {number} [opts.height=720]
 * @returns {Promise<Blob>} image/png
 */
export function renderCaptionPng(text, { width = 1280, height = 720 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const fontSize = Math.round(height * 0.052);
  ctx.font = `700 ${fontSize}px Inter, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Word-wrap to ~80% width.
  const maxWidth = width * 0.8;
  const lines = wrapText(ctx, text.toUpperCase(), maxWidth);
  const lineHeight = fontSize * 1.25;
  const blockH = lines.length * lineHeight;
  const baseY = height - blockH - height * 0.07; // sit above the bottom edge

  lines.forEach((line, i) => {
    const y = baseY + i * lineHeight + lineHeight / 2;
    const w = ctx.measureText(line).width;
    const padX = fontSize * 0.6;
    const padY = fontSize * 0.28;

    // Rounded background pill for legibility over any footage.
    ctx.fillStyle = 'rgba(11, 15, 20, 0.72)';
    roundRect(ctx, width / 2 - w / 2 - padX, y - lineHeight / 2 - padY + 2, w + padX * 2, lineHeight + padY * 2 - 4, 10);
    ctx.fill();

    // Text with a subtle stroke.
    ctx.lineWidth = Math.max(2, fontSize * 0.06);
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(line, width / 2, y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line, width / 2, y);
  });

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3); // cap at 3 lines per cue
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
