/**
 * KineticCaptions — word-synced kinetic typography driven by the transcript's
 * word timings. At each frame it shows the phrase around the current time and
 * pops the word being spoken (spring squash-and-stretch). Montserrat / #FFFFFF.
 *
 * This is the "text-on-screen synchronized to the voiceover" layer — it sits on
 * top of the base video inside the Remotion composition.
 */
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

const FONT = 'Montserrat, Inter, system-ui, sans-serif';

/**
 * @param {object} props
 * @param {Array<{word:string,start:number,end:number}>} props.words
 * @param {number} [props.groupSize=4]  words shown together as one caption line.
 * @param {string} [props.color='#FFFFFF']
 */
export function KineticCaptions({ words = [], groupSize = 4, color = '#FFFFFF' }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps; // current time in seconds

  if (!words.length) return null;

  // Which word is being spoken right now?
  let activeIdx = words.findIndex((w) => t >= w.start && t < w.end);
  if (activeIdx === -1) {
    // Between words: attach to the nearest upcoming/preceding word.
    activeIdx = words.findIndex((w) => w.start > t);
    if (activeIdx === -1) activeIdx = words.length - 1;
    else if (activeIdx > 0) activeIdx -= 1;
  }

  // Show the group (phrase) the active word belongs to.
  const groupStart = Math.floor(activeIdx / groupSize) * groupSize;
  const group = words.slice(groupStart, groupStart + groupSize);
  const groupStartTime = group[0]?.start ?? 0;

  // Fade the whole line in as the phrase begins.
  const lineFrame = Math.max(0, frame - Math.round(groupStartTime * fps));
  const lineOpacity = interpolate(lineFrame, [0, 6], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', padding: '0 8% 8%' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '0 18px',
          opacity: lineOpacity,
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 64,
          lineHeight: 1.2,
          textAlign: 'center',
        }}
      >
        {group.map((w, i) => {
          const globalIdx = groupStart + i;
          const isActive = globalIdx === activeIdx;
          // Pop the word right as it starts being spoken.
          const wordFrame = Math.max(0, frame - Math.round((w.start || 0) * fps));
          const pop = spring({ frame: wordFrame, fps, config: { damping: 10, mass: 0.6, stiffness: 140 } });
          const scale = isActive ? 1 + pop * 0.18 : 1;
          const spoken = t >= (w.end ?? 0);
          return (
            <span
              key={globalIdx}
              style={{
                display: 'inline-block',
                transform: `scale(${scale})`,
                color: isActive ? '#facc15' : color, // highlight the spoken word
                opacity: spoken || isActive ? 1 : 0.55,
                textShadow: '0 4px 18px rgba(0,0,0,0.7)',
                WebkitTextStroke: '2px rgba(0,0,0,0.55)',
                transition: 'color 80ms linear',
              }}
            >
              {(w.word || '').trim()}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
