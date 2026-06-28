/**
 * audioBeats.js
 * -----------------------------------------------------------------------------
 * Local, FFmpeg-independent beat / transient detection via the Web Audio API.
 *
 * For sync-montage content (no narration) the SPINE of the edit is the MUSIC,
 * not speech. This utility decodes the audio entirely in the browser and finds
 * energy transients — beats, hits, bass drops — returning precise timestamps the
 * agent can align cuts/SFX/filters onto.
 *
 * Algorithm: short-time energy envelope → adaptive local-average peak picking
 * with a refractory gap. Lightweight enough for low-spec machines (single pass,
 * O(n) over samples).
 */

const round = (t) => Math.round(t * 1000) / 1000; // millisecond precision

/**
 * @typedef {object} BeatAnalysis
 * @property {number[]} beats     Peak timestamps in seconds (ms-rounded).
 * @property {number}   bpm       Estimated tempo (median inter-beat interval).
 * @property {number}   duration  Audio duration (seconds).
 * @property {number}   count     Number of beats detected.
 */

/**
 * Detect beats/transients in an audio or video blob.
 * decodeAudioData transparently pulls the audio track out of mp4/webm/mp3.
 *
 * @param {Blob|ArrayBuffer} source
 * @param {object} [opts]
 * @param {number} [opts.threshold=1.35]  energy must exceed local average × this.
 * @param {number} [opts.minSpacing=0.16] minimum seconds between two beats.
 * @param {number} [opts.maxBeats=240]    safety cap on returned beats.
 * @returns {Promise<BeatAnalysis>}
 */
export async function detectBeats(source, { threshold = 1.35, minSpacing = 0.16, maxBeats = 240 } = {}) {
  const arrayBuffer = source instanceof ArrayBuffer ? source : await source.arrayBuffer();

  const AudioContextClass =
    typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AudioContextClass) throw new Error('audioBeats: Web Audio API unavailable in this environment');

  const ctx = new AudioContextClass();
  let audioBuffer;
  try {
    // slice(0) — decodeAudioData detaches the buffer; keep the caller's intact.
    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    if (ctx.close) ctx.close();
  }

  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  const channelCount = audioBuffer.numberOfChannels;

  // Downmix to mono.
  const mono = new Float32Array(length);
  for (let c = 0; c < channelCount; c++) {
    const data = audioBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += data[i] / channelCount;
  }

  // Short-time energy envelope.
  const frameSize = 1024;
  const hop = 512;
  const times = [];
  const energy = [];
  for (let i = 0; i + frameSize <= length; i += hop) {
    let sum = 0;
    for (let j = 0; j < frameSize; j++) {
      const s = mono[i + j];
      sum += s * s;
    }
    times.push(i / sampleRate);
    energy.push(sum / frameSize);
  }

  // Adaptive local-average peak picking (≈0.5s window each side).
  const half = Math.max(1, Math.round((0.5 * sampleRate) / hop));
  const beats = [];
  let lastBeat = -Infinity;
  for (let k = 0; k < energy.length; k++) {
    const start = Math.max(0, k - half);
    const end = Math.min(energy.length, k + half);
    let avg = 0;
    for (let m = start; m < end; m++) avg += energy[m];
    avg /= end - start;

    const cur = energy[k];
    const isLocalMax =
      (k === 0 || cur >= energy[k - 1]) && (k === energy.length - 1 || cur >= energy[k + 1]);

    if (cur > avg * threshold && isLocalMax && times[k] - lastBeat >= minSpacing) {
      beats.push(round(times[k]));
      lastBeat = times[k];
    }
  }

  return {
    beats: beats.slice(0, maxBeats),
    bpm: estimateBpm(beats),
    duration: audioBuffer.duration,
    count: beats.length,
  };
}

/** Estimate BPM from the median inter-beat interval. */
function estimateBpm(beats) {
  if (beats.length < 2) return 0;
  const intervals = [];
  for (let i = 1; i < beats.length; i++) intervals.push(beats[i] - beats[i - 1]);
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  if (!median) return 0;
  return Math.round(60 / median);
}
