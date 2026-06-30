/**
 * ffmpegHelper.js
 * -----------------------------------------------------------------------------
 * Thin wrapper around FFmpeg.wasm. ALL of this runs in the user's browser — no
 * media ever leaves the machine for these operations. The helper is a lazily
 * loaded singleton so the (large) wasm core is fetched only once per session.
 *
 * Everything in/out is a Blob or Uint8Array; the orchestrator turns the results
 * into `URL.createObjectURL` blobs for the dumb UI to play.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// Pin the core to a known-good version. IMPORTANT: use the ESM build — the
// @ffmpeg/ffmpeg worker is always created as a *module* worker and loads the
// core via `await import(coreURL)`, which requires an ES module with a default
// export. The UMD core is NOT an ES module and fails with "Cannot find module".
const CORE_VERSION = '0.12.6';
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

let _ffmpeg = null;
let _loadPromise = null;

/**
 * Load (once) and return the shared FFmpeg instance.
 * @param {(line: string) => void} [onLog] optional log sink for the UI console.
 * @param {(status: string) => void} [onStatus] optional coarse load-status sink.
 */
export async function getFFmpeg(onLog, onStatus) {
  if (_ffmpeg) return _ffmpeg;
  if (_loadPromise) return _loadPromise;

  const status = (m) => { if (onStatus) onStatus(m); };

  _loadPromise = withTimeout(
    (async () => {
      const ffmpeg = new FFmpeg();
      if (onLog) ffmpeg.on('log', ({ message }) => onLog(message));

      status('Downloading FFmpeg core (~30 MB, first run only)…');
      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
        toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
      ]);

      // No classWorkerURL: the ESM build resolves its own module worker, which
      // loads the ESM core via import(). (Passing a UMD worker here is what
      // caused the "Cannot find module 'blob:'" failure.)
      status('Initializing FFmpeg engine…');
      await ffmpeg.load({ coreURL, wasmURL });

      status('FFmpeg engine ready');
      _ffmpeg = ffmpeg;
      return ffmpeg;
    })(),
    120000,
    'FFmpeg engine failed to load within 120s. The 30MB core download may be blocked, or the browser blocked the worker (check the Network tab for unpkg.com).',
  );

  try {
    return await _loadPromise;
  } catch (err) {
    _loadPromise = null; // allow a retry on the next call
    throw err;
  }
}

/** Reject if `promise` doesn't settle within `ms`. */
function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Subscribe to FFmpeg progress (0..1). Returns an unsubscribe function. */
export async function onProgress(handler) {
  const ffmpeg = await getFFmpeg();
  const cb = ({ progress }) => handler(Math.max(0, Math.min(1, progress)));
  ffmpeg.on('progress', cb);
  return () => ffmpeg.off('progress', cb);
}

/* -------------------------------------------------------------------------- */
/* Core operations                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Extract a compact mono 16 kHz MP3 from any video/audio source. This is the
 * exact shape Whisper likes and keeps the upload to Groq tiny.
 * @param {Blob|File} source
 * @returns {Promise<Blob>} audio/mpeg blob
 */
export async function extractAudio(source) {
  const ffmpeg = await getFFmpeg();
  const inName = 'extract_in';
  const outName = 'extract_out.mp3';

  await ffmpeg.writeFile(inName, await fetchFile(source));
  await ffmpeg.exec([
    '-i', inName,
    '-vn',                 // drop video
    '-ac', '1',            // mono
    '-ar', '16000',        // 16 kHz
    '-b:a', '64k',
    outName,
  ]);

  const data = await ffmpeg.readFile(outName);
  await safeDelete(ffmpeg, inName, outName);
  return new Blob([data.buffer], { type: 'audio/mpeg' });
}

/**
 * Hard-cut a clip to [start, start+duration] in seconds, re-encoding so the
 * result is frame-accurate (needed when stitching auto-trimmed inserts).
 * @param {Blob|File} source
 * @param {{ start: number, duration: number }} range
 * @returns {Promise<Blob>} video/mp4 blob
 */
export async function trimClip(source, { start, duration, volume = 1.0, maxHeight = 720 }) {
  const ffmpeg = await getFFmpeg();
  const inName = 'trim_in.mp4';
  const outName = 'trim_out.mp4';

  await ffmpeg.writeFile(inName, await fetchFile(source));
  await ffmpeg.exec([
    '-ss', String(start),
    '-i', inName,
    '-t', String(duration),
    // Cap height (keep aspect, even width) so heavy 1080p/4K clips stay light in
    // the browser. Smaller sources are left untouched by `min()`.
    '-vf', `scale=-2:'min(${maxHeight},ih)'`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-af', `volume=${volume}`,
    '-c:a', 'aac',
    '-movflags', '+faststart',
    outName,
  ]);

  const data = await ffmpeg.readFile(outName);
  await safeDelete(ffmpeg, inName, outName);
  return new Blob([data.buffer], { type: 'video/mp4' });
}

/**
 * Concatenate already-normalized MP4 clips into one file (re-encode path, so
 * mixed sources still join cleanly for an MVP).
 * @param {(Blob|File)[]} clips
 * @returns {Promise<Blob>} video/mp4 blob
 */
export async function concatClips(clips) {
  if (!clips.length) throw new Error('concatClips: no clips provided');
  const ffmpeg = await getFFmpeg();

  const names = [];
  for (let i = 0; i < clips.length; i++) {
    const name = `concat_${i}.mp4`;
    await ffmpeg.writeFile(name, await fetchFile(clips[i]));
    names.push(name);
  }

  const inputs = names.flatMap((n) => ['-i', n]);
  const filter =
    names.map((_, i) => `[${i}:v:0][${i}:a:0]`).join('') +
    `concat=n=${names.length}:v=1:a=1[v][a]`;

  await ffmpeg.exec([
    ...inputs,
    '-filter_complex', filter,
    '-map', '[v]',
    '-map', '[a]',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-c:a', 'aac',
    '-movflags', '+faststart',
    'concat_out.mp4',
  ]);

  const data = await ffmpeg.readFile('concat_out.mp4');
  await safeDelete(ffmpeg, ...names, 'concat_out.mp4');
  return new Blob([data.buffer], { type: 'video/mp4' });
}

/**
 * Overlay a generated audio bed (SFX / music) onto a video at a given offset
 * and volume, keeping the original audio.
 * @param {Blob|File} video
 * @param {Blob|File} audio
 * @param {{ offset?: number, volume?: number }} [opts]
 * @returns {Promise<Blob>} video/mp4 blob
 */
export async function mixAudioOver(video, audio, { offset = 0, volume = 0.5 } = {}) {
  const ffmpeg = await getFFmpeg();
  await ffmpeg.writeFile('mix_v.mp4', await fetchFile(video));
  await ffmpeg.writeFile('mix_a', await fetchFile(audio));

  const filter =
    `[1:a]adelay=${Math.round(offset * 1000)}|${Math.round(offset * 1000)},` +
    `volume=${volume}[bed];[0:a][bed]amix=inputs=2:duration=first[aout]`;

  await ffmpeg.exec([
    '-i', 'mix_v.mp4',
    '-i', 'mix_a',
    '-filter_complex', filter,
    '-map', '0:v',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    'mix_out.mp4',
  ]);

  const data = await ffmpeg.readFile('mix_out.mp4');
  await safeDelete(ffmpeg, 'mix_v.mp4', 'mix_a', 'mix_out.mp4');
  return new Blob([data.buffer], { type: 'video/mp4' });
}

/**
 * Mix MANY generated audio layers (beat-aligned SFX / music) onto a video in a
 * single pass, each delayed to its exact timestamp and volume-balanced via
 * `amix`. This is the sync-montage execution step.
 *
 * Optimization: when no visual filter is needed, the video stream is COPIED
 * (`-c:v copy`) — no re-encode — so it's fast and light on low-spec machines.
 * Pass `reencodeVideo: true` only when a visual filter was already baked in.
 *
 * @param {Blob|File} video
 * @param {Array<{ blob: Blob, start: number, volume?: number }>} layers
 * @param {object} [opts]
 * @param {boolean} [opts.reencodeVideo=false]  re-encode video instead of copy.
 * @param {boolean} [opts.keepOriginalAudio=true]  keep the source audio track.
 * @returns {Promise<Blob>} video/mp4 blob
 */
export async function mixAudioLayers(video, layers, { reencodeVideo = false, keepOriginalAudio = true, originalVolume = 1.0 } = {}) {
  if (!layers || layers.length === 0) {
    return video instanceof Blob ? video : new Blob([await fetchFile(video)], { type: 'video/mp4' });
  }
  const ffmpeg = await getFFmpeg();
  await ffmpeg.writeFile('mlx_v.mp4', await fetchFile(video));

  const inputs = ['-i', 'mlx_v.mp4'];
  const prep = [];
  const mixLabels = [];

  for (let i = 0; i < layers.length; i++) {
    const name = `mlx_a_${i}`;
    await ffmpeg.writeFile(name, await fetchFile(layers[i].blob));
    inputs.push('-i', name);
    const inputIdx = i + 1; // input 0 is the video
    const delayMs = Math.max(0, Math.round((layers[i].start || 0) * 1000));
    const vol = layers[i].volume ?? 0.5;
    // Delay each layer to its beat timestamp, then set its level.
    prep.push(`[${inputIdx}:a]adelay=${delayMs}|${delayMs},volume=${vol}[la${i}]`);
    mixLabels.push(`[la${i}]`);
  }

  const original = keepOriginalAudio ? `[0:a]volume=${originalVolume}[orig_vol]` : '';
  const originalLabel = keepOriginalAudio ? '[orig_vol]' : '';
  const mixInputs = (keepOriginalAudio ? 1 : 0) + layers.length;
  const filter =
    `${prep.join(';')};` +
    (keepOriginalAudio ? `${original};` : '') +
    `${originalLabel}${mixLabels.join('')}amix=inputs=${mixInputs}:duration=first:dropout_transition=0:normalize=0[aout]`;

  const args = [
    ...inputs,
    '-filter_complex', filter,
    '-map', '0:v',
    '-map', '[aout]',
    ...(reencodeVideo
      ? ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p']
      : ['-c:v', 'copy']),
    '-c:a', 'aac',
    '-movflags', '+faststart',
    'mlx_out.mp4',
  ];

  await ffmpeg.exec(args);

  const data = await ffmpeg.readFile('mlx_out.mp4');
  await safeDelete(ffmpeg, 'mlx_v.mp4', ...layers.map((_, i) => `mlx_a_${i}`), 'mlx_out.mp4');
  return new Blob([data.buffer], { type: 'video/mp4' });
}

/* -------------------------------------------------------------------------- */
/* Burned-in captions (overlay of canvas-rendered PNGs)                       */
/* -------------------------------------------------------------------------- */

/**
 * Burn caption PNGs into a video, each shown only during its [start,end] window.
 * Avoids libass/drawtext (absent from the core) by overlaying pre-rendered
 * transparent PNGs. The video is normalized to width×height first.
 *
 * @param {Blob|File} video
 * @param {Array<{ png: Blob, start: number, end: number }>} cues
 * @param {object} [opts]
 * @param {number} [opts.width=1280]
 * @param {number} [opts.height=720]
 * @returns {Promise<Blob>} video/mp4 blob
 */
export async function burnCaptions(video, cues, { width = 1280, height = 720 } = {}) {
  if (!cues || cues.length === 0) {
    return video instanceof Blob ? video : new Blob([await fetchFile(video)], { type: 'video/mp4' });
  }
  const ffmpeg = await getFFmpeg();
  await ffmpeg.writeFile('cap_v.mp4', await fetchFile(video));

  const inputs = ['-i', 'cap_v.mp4'];
  for (let i = 0; i < cues.length; i++) {
    const name = `cap_${i}.png`;
    await ffmpeg.writeFile(name, await fetchFile(cues[i].png));
    inputs.push('-i', name);
  }

  // [0:v] scaled → base; then chain one timed overlay per cue.
  const parts = [`[0:v]scale=${width}:${height},setsar=1[v0]`];
  for (let i = 0; i < cues.length; i++) {
    const { start, end } = cues[i];
    const inLabel = `[v${i}]`;
    const outLabel = i === cues.length - 1 ? '[vout]' : `[v${i + 1}]`;
    parts.push(`${inLabel}[${i + 1}:v]overlay=0:0:enable='between(t,${start},${end})'${outLabel}`);
  }
  const filter = parts.join(';');

  await ffmpeg.exec([
    ...inputs,
    '-filter_complex', filter,
    '-map', '[vout]',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-movflags', '+faststart',
    'cap_out.mp4',
  ]);

  const data = await ffmpeg.readFile('cap_out.mp4');
  await safeDelete(ffmpeg, 'cap_v.mp4', ...cues.map((_, i) => `cap_${i}.png`), 'cap_out.mp4');
  return new Blob([data.buffer], { type: 'video/mp4' });
}

/* -------------------------------------------------------------------------- */
/* Layered compositing (chroma key + overlay)                                 */
/* -------------------------------------------------------------------------- */

/**
 * Synthesize a still backdrop image locally with FFmpeg's `gradients` source.
 * Used as a graceful fallback when AI image generation is unavailable, and as a
 * deterministic backstop so chroma-key compositing never hard-fails for lack of
 * a background.
 * @param {object} [opts]
 * @param {number} [opts.width=1280]
 * @param {number} [opts.height=720]
 * @param {string} [opts.top='0x1b2a44']    top gradient color (0xRRGGBB)
 * @param {string} [opts.bottom='0x070b12'] bottom gradient color (0xRRGGBB)
 * @returns {Promise<Blob>} image/png blob
 */
export async function synthesizeBackdrop({
  width = 1280,
  height = 720,
  top = '0x1b2a44',
  bottom = '0x070b12',
} = {}) {
  const ffmpeg = await getFFmpeg();
  const out = 'backdrop.png';
  try {
    await ffmpeg.exec([
      '-f', 'lavfi',
      '-i', `gradients=s=${width}x${height}:c0=${top}:c1=${bottom}:x0=0:y0=0:x1=${width}:y1=${height}`,
      '-frames:v', '1',
      out,
    ]);
  } catch {
    // Older cores may lack `gradients`; fall back to a flat color.
    await ffmpeg.exec(['-f', 'lavfi', '-i', `color=c=${top}:s=${width}x${height}`, '-frames:v', '1', out]);
  }
  const data = await ffmpeg.readFile(out);
  await safeDelete(ffmpeg, out);
  return new Blob([data.buffer], { type: 'image/png' });
}

/**
 * Auto-detect the chroma key color by sampling a corner of the first frame.
 * Real green screens are NOT pure 0x00FF00 (this clip's is 0x198D34), so keying
 * against a guessed color fails — we sample the actual backdrop instead.
 * @param {Blob|File} source
 * @param {object} [opts]
 * @param {number} [opts.box=120]  corner sample size in px.
 * @returns {Promise<{ hex:string, r:number, g:number, b:number, isGreenish:boolean }>}
 */
export async function detectChromaColor(source, { box = 120 } = {}) {
  const ffmpeg = await getFFmpeg();
  const inName = 'probe_in.mp4';
  const rawName = 'probe.raw';
  await ffmpeg.writeFile(inName, await fetchFile(source));
  // Average a top-left corner (almost always pure backdrop) down to 1×1 px.
  await ffmpeg.exec([
    '-i', inName,
    '-frames:v', '1',
    '-vf', `crop=${box}:${box}:0:0,scale=1:1`,
    '-f', 'rawvideo',
    '-pix_fmt', 'rgb24',
    rawName,
  ]);
  const data = await ffmpeg.readFile(rawName);
  await safeDelete(ffmpeg, inName, rawName);
  const r = data[0] ?? 0;
  const g = data[1] ?? 255;
  const b = data[2] ?? 0;
  const hex = '0x' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
  const isGreenish = g > r * 1.2 && g > b * 1.2;
  return { hex, r, g, b, isGreenish };
}

/**
 * Chroma-key a (green-screen) speaker layer and composite it pixel-for-pixel on
 * top of a still background image. The original audio is preserved.
 *
 * Pipeline (filter_complex):
 *   [bg]  scale to canvas, set SAR
 *   [fg]  scale to canvas, chromakey out the key color, set SAR
 *   overlay [fg] centered over [bg], end with the foreground's duration
 *
 * @param {Blob|File} video        Foreground speaker clip (green screen).
 * @param {Blob|File} background   Still image (AI-generated or synthesized).
 * @param {object} [opts]
 * @param {string} [opts.color='0x00FF00'] key color (0xRRGGBB).
 * @param {number} [opts.similarity=0.18]  0..1 — how close to the key color counts as key.
 * @param {number} [opts.blend=0.08]       0..1 — edge softness of the key.
 * @param {number} [opts.width=1280]       output canvas width.
 * @param {number} [opts.height=720]       output canvas height.
 * @returns {Promise<Blob>} video/mp4 blob
 */
export async function compositeChromaKey(
  video,
  background,
  { color = '0x00FF00', similarity = 0.18, blend = 0.08, width = 1280, height = 720, despill = true } = {},
) {
  const ffmpeg = await getFFmpeg();
  const bgName = 'ck_bg.png';
  const fgName = 'ck_fg.mp4';
  const outName = 'ck_out.mp4';

  await ffmpeg.writeFile(bgName, await fetchFile(background));
  await ffmpeg.writeFile(fgName, await fetchFile(video));

  const sim = clamp01(similarity);
  const bln = clamp01(blend);
  // Green-spill suppression: pull the green channel toward R/B so the green
  // reflection/halo on hair & edges disappears, without tinting white/skin.
  const spill = despill ? ',colorchannelmixer=gg=0.55:gr=0.22:gb=0.22' : '';

  const filter =
    `[0:v]scale=${width}:${height},setsar=1[bg];` +
    `[1:v]scale=${width}:${height},chromakey=${color}:${sim}:${bln}${spill},setsar=1[fg];` +
    `[bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1:format=auto[out]`;

  await ffmpeg.exec([
    '-loop', '1', '-i', bgName,   // input 0: looping background still
    '-i', fgName,                 // input 1: foreground speaker video
    '-filter_complex', filter,
    '-map', '[out]',
    '-map', '1:a?',               // keep original audio if present
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-shortest',
    '-movflags', '+faststart',
    outName,
  ]);

  const data = await ffmpeg.readFile(outName);
  await safeDelete(ffmpeg, bgName, fgName, outName);
  return new Blob([data.buffer], { type: 'video/mp4' });
}

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Read a media file's duration (seconds) without FFmpeg by using a throwaway
 * <video>/<audio> element — cheap and synchronous-ish for metadata-only needs.
 * @param {Blob|File} source
 * @returns {Promise<number>}
 */
export function probeDuration(source) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(el.duration) ? el.duration : 0);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('probeDuration: failed to read metadata'));
    };
    el.src = url;
  });
}

async function safeDelete(ffmpeg, ...names) {
  for (const name of names) {
    try {
      await ffmpeg.deleteFile(name);
    } catch {
      /* virtual FS may already be gone — ignore */
    }
  }
}
