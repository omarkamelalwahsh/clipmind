import React from 'react';
import { AbsoluteFill } from 'remotion';

export const PulseWave = ({ properties }) => {
  const { color = '#00A8E8', speed = 1.5, thickness = 3 } = properties || {};

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', overflow: 'visible' }}>
      <svg width="100%" height="300" viewBox="0 0 1000 300" style={{ overflow: 'visible' }}>
        <path
          d="M0 150 L260 150 L300 90 L360 210 L420 70 L480 190 L540 150 L1000 150"
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeDasharray="1000"
          style={{ animation: `drawPulse ${Math.max(0.2, speed)}s linear infinite` }}
        />
      </svg>
      <style>{`
        @keyframes drawPulse {
          0% { stroke-dashoffset: 1000; opacity: 0.35; }
          50% { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: -1000; opacity: 0.35; }
        }
      `}</style>
    </AbsoluteFill>
  );
};
