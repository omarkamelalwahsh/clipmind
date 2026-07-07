import React from 'react';
import { AbsoluteFill } from 'remotion';

export const HudRing = ({ properties }) => {
  const { radius = 200, rotationSpeed = 2, color = '#00E5FF' } = properties || {};

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          width: radius * 2,
          height: radius * 2,
          border: `2px dashed ${color}`,
          borderRadius: '50%',
          position: 'relative',
          animation: `spin ${Math.max(0.1, 6 / rotationSpeed)}s linear infinite`,
          boxShadow: `0 0 20px ${color}33`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '15%',
            left: '15%',
            right: '15%',
            bottom: '15%',
            border: `1px solid ${color}`,
            borderRadius: '50%',
            opacity: 0.45,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '10px',
            height: '10px',
            backgroundColor: color,
            borderRadius: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </AbsoluteFill>
  );
};
