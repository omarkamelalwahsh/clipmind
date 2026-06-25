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

// Pin the core to a known-good version served with COOP/COEP-friendly CORS.
const CORE_VERSION = '0.12.6';
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

let _ffmpeg = null;
let _loadPromise = null;

/**
 * Load (once) and return the shared FFmpeg instance.
 * @param {(line: string) => void} [onLog] optional log sink for the UI console.
 */
export async function getFFmpeg(onLog) {
  if (_ffmpeg) return _ffmpeg;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    const ffmpeg = new FFmpeg();
    if (onLog) ffmpeg.on('log', ({ message }) => onLog(message));

    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    _ffmpeg = ffmpeg;
    return ffmpeg;
  })();

  return _loadPromise;
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
export async function trimClip(source, { start, duration }) {
  const ffmpeg = await getFFmpeg();
  const inName = 'trim_in.mp4';
  const outName = 'trim_out.mp4';

  await ffmpeg.writeFile(inName, await fetchFile(source));
  await ffmpeg.exec([
    '-ss', String(start),
    '-i', inName,
    '-t', String(duration),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
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
