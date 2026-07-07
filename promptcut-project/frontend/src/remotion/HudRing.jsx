import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

export const HudRing = ({ properties = {} }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const {
    radius = 180,
    rotationSpeed = 1,
    color = '#00E5FF',
    thickness = 2,
    glow = 0.35,
    innerRadius = 0.72,
  } = properties;

  const rotation = (frame / fps) * rotationSpeed * 360;
  const pulse = 0.7 + 0.3 * Math.sin(frame / 10);
  const size = radius * 2 + 40;
  const inner = radius * innerRadius;
  const dashOffset = interpolate(frame, [0, durationInFrames], [0, -(radius * Math.PI * 2)], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ filter: `drop-shadow(0 0 ${Math.max(6, glow * 20)}px ${color})` }}
      >
        <g transform={`translate(${size / 2}, ${size / 2}) rotate(${rotation})`}>
          <circle
            cx={0}
            cy={0}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={`${radius * Math.PI * 0.8} ${radius * Math.PI * 2}`}
            strokeDashoffset={dashOffset}
            opacity={0.75 + pulse * 0.15}
          />
          <circle cx={0} cy={-radius} r={Math.max(3, thickness * 1.8)} fill={color} opacity={0.95} />
        </g>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={inner}
          fill="none"
          stroke={color}
          strokeOpacity={0.18}
          strokeWidth={1}
        />
      </svg>
    </AbsoluteFill>
  );
};
