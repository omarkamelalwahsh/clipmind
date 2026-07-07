import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

export const KineticText = ({ properties }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const {
    fullText = '',
    highlightWords = [],
    fontFamily = 'Montserrat',
    color = '#FFFFFF',
    accentColor = '#00E5FF',
    animationStyle = 'word-by-word-pop',
  } = properties || {};

  const words = String(fullText).split(' ').filter(Boolean);
  const activeWordIndex = Math.min(words.length - 1, Math.floor(frame / 5));
  const text = animationStyle === 'typewriter'
    ? String(fullText).slice(0, Math.floor(interpolate(frame, [0, Math.max(1, 60)], [0, fullText.length], { extrapolateRight: 'clamp' })))
    : fullText;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 8%' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.65rem', fontFamily, fontSize: 64, fontWeight: 800, lineHeight: 1.05, textAlign: 'center', color, textShadow: '0 12px 35px rgba(0,0,0,0.35)' }}>
        {animationStyle === 'typewriter' ? (
          <span>{text}</span>
        ) : (
          words.map((word, index) => {
            const isActive = index === activeWordIndex;
            const tone = highlightWords.includes(word.replace(/[.,!?]/g, ''));
            const pop = isActive
              ? spring({ frame: Math.max(0, frame - index * 4), fps, config: { damping: 10, mass: 0.55, stiffness: 160 } })
              : 0;
            const scale = 1 + pop * 0.14;
            return (
              <span
                key={`${word}-${index}`}
                style={{
                  display: 'inline-block',
                  transform: `scale(${scale})`,
                  color: tone ? accentColor : color,
                  opacity: isActive ? 1 : 0.78,
                  transition: 'opacity 120ms ease-out, color 120ms ease-out',
                }}
              >
                {word}
              </span>
            );
          })
        )}
      </div>
    </AbsoluteFill>
  );
};
