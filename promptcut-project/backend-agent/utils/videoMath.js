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
