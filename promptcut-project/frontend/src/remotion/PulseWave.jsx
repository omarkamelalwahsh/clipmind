/**
 * PulseWave — a premium, glowing multi-layer waveform. Two travelling sine waves
 * of different frequency, a soft glow underlay, a bright core stroke, a moving
 * highlight dot, and a reactive equalizer bar strip. Frame-driven for Remotion.
 */
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

function wavePath({ width, baseline, amplitude, frequency, phase, steps = 60 }) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const p = i / steps;
    const x = p * width;
    // Envelope so the wave swells in the centre — feels alive.
    const env = Math.sin(p * Math.PI);
    const y = baseline + Math.sin(p * Math.PI * 2 * frequency + phase) * amplitude * env;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M ${pts.join(' L ')}`;
}

export const PulseWave = ({ properties = {} }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const {
    color = '#00A8E8',
    speed = 1.5,
    thickness = 5,
    amplitude = 90,
    frequency = 1.4,
    width = 1600,
    height = 500,
  } = properties;

  const baseline = height / 2;
  const phase = (frame / fps) * 6 * speed;
  const enter = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  const main = wavePath({ width, baseline, amplitude, frequency, phase });
  const second = wavePath({ width, baseline, amplitude: amplitude * 0.55, frequency: frequency * 1.9, phase: -phase * 1.3 });

  // Moving highlight dot riding the main wave.
  const dotP = (frame % 90) / 90;
  const dotX = dotP * width;
  const env = Math.sin(dotP * Math.PI);
  const dotY = baseline + Math.sin(dotP * Math.PI * 2 * frequency + phase) * amplitude * env;

  // Equalizer bars along the bottom.
  const bars = Array.from({ length: 48 }, (_, i) => {
    const h = (0.3 + 0.7 * Math.abs(Math.sin(i * 0.5 + frame / 6))) * amplitude * 0.9;
    return { x: (i / 48) * width, h };
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', overflow: 'visible' }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible', opacity: enter }}>
        {/* equalizer bars */}
        <g opacity={0.5}>
          {bars.map((b, i) => (
            <rect key={i} x={b.x} y={height - 4 - b.h} width={width / 48 - 6} height={b.h} rx={3} fill={color} opacity={0.35} />
          ))}
        </g>

        {/* glow underlay */}
        <path d={main} fill="none" stroke={color} strokeWidth={thickness * 4} strokeLinecap="round" opacity={0.18} style={{ filter: `blur(8px)` }} />
        {/* secondary wave */}
        <path d={second} fill="none" stroke={color} strokeWidth={Math.max(1, thickness * 0.5)} strokeLinecap="round" opacity={0.5} />
        {/* bright core */}
        <path d={main} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 10px ${color})` }} />

        {/* highlight dot */}
        <circle cx={dotX} cy={dotY} r={thickness * 1.6} fill="#fff" style={{ filter: `drop-shadow(0 0 12px ${color})` }} />
      </svg>
    </AbsoluteFill>
  );
};
