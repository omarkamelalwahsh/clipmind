import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

function buildWavePath({ width, height, amplitude, frequency, baseline, phase }) {
  const points = [];
  const steps = 30;

  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps;
    const x = progress * width;
    const wave = Math.sin(progress * Math.PI * 2 * frequency + phase);
    const y = baseline + wave * amplitude;
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }

  return `M ${points.join(' L ')}`;
}

export const PulseWave = ({ properties = {} }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const {
    color = '#00A8E8',
    speed = 1.5,
    thickness = 3,
    amplitude = 70,
    frequency = 1.2,
    baseline = 150,
    width = 1000,
    height = 300,
  } = properties;

  const phase = frame * 0.04 * speed;
  const wavePath = buildWavePath({
    width,
    height,
    amplitude,
    frequency,
    baseline,
    phase,
  });
  const dashOffset = interpolate(frame, [0, durationInFrames], [0, -width], {
    extrapolateRight: 'clamp',
  });
  const opacity = 0.6 + 0.4 * Math.sin(frame / 10);

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', overflow: 'visible' }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible' }}>
        <path
          d={wavePath}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${width} ${width}`}
          strokeDashoffset={dashOffset}
          opacity={opacity}
        />
        <path
          d={wavePath}
          fill="none"
          stroke={color}
          strokeWidth={Math.max(1, thickness * 0.35)}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.2}
        />
      </svg>
    </AbsoluteFill>
  );
};
