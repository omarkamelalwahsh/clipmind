/**
 * HudRing — a premium sci-fi HUD: concentric rings rotating at different speeds,
 * dashed arcs, tick marks, a sweeping scanner arc, a segmented outer ring and a
 * center reticle — all glowing. Frame-driven so it renders identically on export.
 */
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

const polar = (cx, cy, r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};
const arc = (cx, cy, r, start, end) => {
  const [x1, y1] = polar(cx, cy, r, end);
  const [x2, y2] = polar(cx, cy, r, start);
  const large = end - start <= 180 ? 0 : 1;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 0 ${x2} ${y2}`;
};

export const HudRing = ({ properties = {} }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const {
    color = '#00E5FF',
    accentColor = color,
    rotationSpeed = 1,
    radius = 300,
  } = properties;

  const t = frame / fps;
  const rot = t * 40 * rotationSpeed;
  const enter = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });
  const pulse = 0.85 + 0.15 * Math.sin(frame / 6);
  const S = radius * 2 + 120;
  const c = S / 2;

  const ticks = Array.from({ length: 60 }, (_, i) => i);
  const segs = Array.from({ length: 8 }, (_, i) => i);

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <svg
        width={S}
        height={S}
        viewBox={`0 0 ${S} ${S}`}
        style={{ filter: `drop-shadow(0 0 12px ${color}) drop-shadow(0 0 30px ${color}66)`, opacity: enter, transform: `scale(${0.9 + enter * 0.1})` }}
      >
        {/* faint full ring */}
        <circle cx={c} cy={c} r={radius} fill="none" stroke={color} strokeWidth={1} opacity={0.25} />

        {/* outer segmented ring, rotating */}
        <g transform={`rotate(${rot} ${c} ${c})`} opacity={0.9}>
          {segs.map((i) => (
            <path key={i} d={arc(c, c, radius, i * 45 + 4, i * 45 + 38)} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" />
          ))}
        </g>

        {/* mid dashed ring, counter-rotating */}
        <g transform={`rotate(${-rot * 1.6} ${c} ${c})`}>
          <circle cx={c} cy={c} r={radius * 0.82} fill="none" stroke={accentColor} strokeWidth={1.5} strokeDasharray="2 12" opacity={0.8} />
        </g>

        {/* tick marks */}
        <g opacity={0.7}>
          {ticks.map((i) => {
            const long = i % 5 === 0;
            const [x1, y1] = polar(c, c, radius * 0.9, i * 6);
            const [x2, y2] = polar(c, c, radius * 0.9 - (long ? 16 : 8), i * 6);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={long ? 2 : 1} opacity={long ? 0.9 : 0.4} />;
          })}
        </g>

        {/* sweeping scanner arc */}
        <g transform={`rotate(${rot * 3} ${c} ${c})`}>
          <path d={arc(c, c, radius * 0.7, 0, 80)} fill="none" stroke={accentColor} strokeWidth={4} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 10px ${accentColor})` }} />
        </g>

        {/* inner ring + reticle */}
        <circle cx={c} cy={c} r={radius * 0.55} fill="none" stroke={color} strokeWidth={1.5} opacity={0.6 * pulse} />
        <g transform={`rotate(${-rot * 0.6} ${c} ${c})`} opacity={0.85}>
          {[0, 90, 180, 270].map((a) => (
            <path key={a} d={arc(c, c, radius * 0.55, a - 12, a + 12)} fill="none" stroke={accentColor} strokeWidth={5} strokeLinecap="round" />
          ))}
        </g>
        <circle cx={c} cy={c} r={4} fill={accentColor} style={{ filter: `drop-shadow(0 0 8px ${accentColor})` }} />
      </svg>
    </AbsoluteFill>
  );
};
