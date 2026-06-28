/**
 * videoMath.js
 * -----------------------------------------------------------------------------
 * Pure, side-effect-free timing math. No DOM, no FFmpeg, no network — which
 * makes it trivial to unit-test and reuse on either side of the wire.
 *
 * The central rule of PromptCut's MVP edit model:
 *   The voice-over (narration) is the SPINE. Visual inserts are laid against it
 *   and must never collectively exceed the narration's duration. When they do,
 *   we auto-trim — proportionally by default — so the visuals fit the voice.
 */

/** Clamp helper. */
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

/**
 * Given the narration length and a list of desired insert durations, decide how
 * each insert should be trimmed so the sum fits within the voice-over.
 *
 * @param {object} args
 * @param {number} args.voiceDuration        Total narration length (seconds).
 * @param {Array<{ id: string, duration: number, min?: number }>} args.inserts
 *        Desired duration per visual insert (seconds). `min` is an optional
 *        floor below which a clip becomes useless and is dropped instead.
 * @param {'proportional'|'truncate'} [args.strategy='proportional']
 *        proportional → scale every clip by the same factor.
 *        truncate     → keep clips at full length in order; cut the last one
 *                        that overflows and drop the rest.
 * @returns {{
 *   fits: boolean,
 *   scale: number,
 *   totalRequested: number,
 *   totalFinal: number,
 *   slack: number,
 *   segments: Array<{ id: string, requested: number, duration: number, trimmed: boolean, dropped: boolean }>
 * }}
 */
export function fitInsertsToVoice({
  voiceDuration,
  inserts,
  strategy = 'proportional',
}) {
  const safeVoice = Math.max(0, Number(voiceDuration) || 0);
  const requested = inserts.map((i) => Math.max(0, Number(i.duration) || 0));
  const totalRequested = requested.reduce((a, b) => a + b, 0);

  // Everything already fits — pass through untouched.
  if (totalRequested <= safeVoice || totalRequested === 0) {
    const segments = inserts.map((ins, i) => ({
      id: ins.id,
      requested: requested[i],
      duration: requested[i],
      trimmed: false,
      dropped: false,
    }));
    return {
      fits: true,
      scale: 1,
      totalRequested,
      totalFinal: totalRequested,
      slack: round(safeVoice - totalRequested),
      segments,
    };
  }

  const segments =
    strategy === 'truncate'
      ? truncateFit(inserts, requested, safeVoice)
      : proportionalFit(inserts, requested, safeVoice);

  const totalFinal = segments.reduce((a, s) => a + s.duration, 0);

  return {
    fits: false,
    scale: strategy === 'proportional' ? round(safeVoice / totalRequested) : 1,
    totalRequested: round(totalRequested),
    totalFinal: round(totalFinal),
    slack: round(safeVoice - totalFinal),
    segments,
  };
}

/** Scale every insert by the same factor so the sum == voiceDuration. */
function proportionalFit(inserts, requested, voice) {
  const total = requested.reduce((a, b) => a + b, 0);
  const scale = total > 0 ? voice / total : 0;
  return inserts.map((ins, i) => {
    const scaled = round(requested[i] * scale);
    const min = Number(ins.min) || 0;
    const dropped = scaled < min;
    return {
      id: ins.id,
      requested: round(requested[i]),
      duration: dropped ? 0 : scaled,
      trimmed: !dropped && scaled < requested[i],
      dropped,
    };
  });
}

/** Keep clips full-length in order; cut the overflowing one, drop the rest. */
function truncateFit(inserts, requested, voice) {
  let remaining = voice;
  return inserts.map((ins, i) => {
    const want = requested[i];
    if (remaining <= 0) {
      return { id: ins.id, requested: round(want), duration: 0, trimmed: false, dropped: true };
    }
    const give = Math.min(want, remaining);
    remaining = round(remaining - give);
    const min = Number(ins.min) || 0;
    const dropped = give < min;
    return {
      id: ins.id,
      requested: round(want),
      duration: dropped ? 0 : round(give),
      trimmed: !dropped && give < want,
      dropped,
    };
  });
}

/**
 * Turn fitted segments into absolute timeline positions (sequential layout).
 * @param {Array<{ id: string, duration: number, dropped: boolean }>} segments
 * @returns {Array<{ id: string, start: number, end: number, duration: number }>}
 */
export function layoutTimeline(segments) {
  let cursor = 0;
  const out = [];
  for (const s of segments) {
    if (s.dropped || s.duration <= 0) continue;
    out.push({ id: s.id, start: round(cursor), end: round(cursor + s.duration), duration: s.duration });
    cursor = round(cursor + s.duration);
  }
  return out;
}

const round = (n) => Math.round(n * 1000) / 1000;

/* -------------------------------------------------------------------------- */
/* Beat / rhythm alignment (millisecond precision)                            */
/* -------------------------------------------------------------------------- */

/** Round a time to the millisecond — the alignment grid for all sync work. */
export const msAlign = (t) => Math.round((Number(t) || 0) * 1000) / 1000;

/**
 * Snap a single timestamp to the nearest detected beat, if one is close enough.
 * @param {number} time            event time (seconds).
 * @param {number[]} beats         sorted beat timestamps (seconds).
 * @param {number} [maxDistance=0.12] only snap if a beat is within this window.
 * @returns {{ time: number, snapped: boolean, beat: number|null, delta: number }}
 */
export function snapToNearestBeat(time, beats, maxDistance = 0.12) {
  if (!beats || beats.length === 0) return { time: msAlign(time), snapped: false, beat: null, delta: 0 };

  // Binary search for the closest beat (beats are sorted ascending).
  let lo = 0;
  let hi = beats.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] < time) lo = mid + 1;
    else hi = mid;
  }
  const candidates = [beats[lo]];
  if (lo > 0) candidates.push(beats[lo - 1]);

  let best = null;
  let bestDelta = Infinity;
  for (const b of candidates) {
    const d = Math.abs(b - time);
    if (d < bestDelta) {
      bestDelta = d;
      best = b;
    }
  }

  if (best != null && bestDelta <= maxDistance) {
    return { time: msAlign(best), snapped: true, beat: msAlign(best), delta: msAlign(bestDelta) };
  }
  return { time: msAlign(time), snapped: false, beat: null, delta: msAlign(bestDelta) };
}

/**
 * Align a list of timeline events (SFX/filter triggers) onto the beat grid.
 * Each event keeps its data but its `start` is snapped to the nearest beat when
 * one is within tolerance. Events that snap onto the SAME beat are nudged apart
 * by 1ms so they remain distinguishable on the timeline.
 *
 * @param {Array<{ start:number }>} events
 * @param {number[]} beats
 * @param {number} [tolerance=0.12]
 * @returns {Array<object>} events with `start`, `snapped`, `beatDelta` set.
 */
export function alignEventsToBeats(events, beats, tolerance = 0.12) {
  const used = new Set();
  return (events || [])
    .map((ev) => {
      const { time, snapped, beat, delta } = snapToNearestBeat(ev.start || 0, beats, tolerance);
      let start = time;
      while (used.has(Math.round(start * 1000))) start = msAlign(start + 0.001);
      used.add(Math.round(start * 1000));
      return { ...ev, start, snapped, beatDelta: delta, beat };
    })
    .sort((a, b) => a.start - b.start);
}

/**
 * Quantize beats to a regular grid implied by the estimated BPM. Useful when the
 * detector is noisy: snaps each beat to the nearest grid line (bar subdivision).
 * @param {number[]} beats
 * @param {number} bpm
 * @param {number} [subdivision=1] 1 = quarter notes, 2 = eighths, etc.
 * @returns {number[]}
 */
export function quantizeToGrid(beats, bpm, subdivision = 1) {
  if (!bpm || !beats?.length) return beats || [];
  const step = 60 / bpm / subdivision;
  const out = [];
  let last = -Infinity;
  for (const b of beats) {
    const q = msAlign(Math.round(b / step) * step);
    if (q !== last) out.push(q);
    last = q;
  }
  return out;
}
