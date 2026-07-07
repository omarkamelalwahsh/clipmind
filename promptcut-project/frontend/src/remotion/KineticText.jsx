import { useCurrentFrame, spring, useVideoConfig, AbsoluteFill, interpolate } from 'remotion';
import React from 'react';

export const KineticText = ({ properties = {} }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const {
    fullText = '',
    text = '',
    words: wordItems = [],
    highlightWords = [],
    color = '#FFFFFF',
    accentColor = '#00E5FF',
    animationStyle = 'word-by-word-pop',
    typingSpeed = 20,
  } = properties;

  const sourceText = String(fullText || text || '').trim();
  const wordTokens = wordItems.length > 0
    ? wordItems.map((item) => String(item.word || item.text || item || '').trim()).filter(Boolean)
    : sourceText
      ? sourceText.split(/\s+/).filter(Boolean)
      : [];

  const highlightMatcher = (word) => highlightWords.some((hWord) => String(word).toLowerCase().includes(String(hWord).toLowerCase()));

  const renderTypewriter = () => {
    const visibleChars = Math.floor(frame / Math.max(1, Math.round(fps / typingSpeed)));
    const visibleText = sourceText.slice(0, visibleChars);
    const hiddenText = sourceText.slice(visibleChars);

    const tokens = visibleText.split(/(\s+)/).filter((token) => token !== '');
    const rendered = tokens.map((token, idx) => (
      <span
        key={`${token}-${idx}`}
        style={{ color: highlightMatcher(token) ? accentColor : color, display: 'inline-block' }}
      >
        {token}
      </span>
    ));

    return (
      <span style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.35rem 0.7rem' }}>
        {rendered}
        <span style={{ opacity: 0 }}>{hiddenText || ' '}</span>
      </span>
    );
  };

  const renderWordByWordPop = () => (
    wordTokens.map((word, index) => {
      const delay = index * 4;
      const isHighlighted = highlightMatcher(word);
      const scale = spring({
        frame: frame - delay,
        fps,
        config: {
          damping: 12,
          mass: 0.5,
          stiffness: 120,
        },
      });
      const opacity = frame < delay ? 0.2 : 1;

      return (
        <span
          key={`${word}-${index}`}
          style={{
            display: 'inline-block',
            transform: `scale(${Math.max(0.35, scale)})`,
            color: isHighlighted ? accentColor : color,
            opacity,
            whiteSpace: 'pre',
          }}
        >
          {word}
        </span>
      );
    })
  );

  const content = (() => {
    switch (animationStyle) {
      case 'typewriter':
        return renderTypewriter();
      case 'word-by-word-pop':
        return renderWordByWordPop();
      default:
        return renderWordByWordPop();
    }
  })();

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 8%' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.35rem 0.7rem', fontFamily: 'Montserrat, sans-serif', fontSize: 64, fontWeight: 800, lineHeight: 1.08, textAlign: 'center', textShadow: '0 12px 35px rgba(0,0,0,0.35)' }}>
        {content}
      </div>
    </AbsoluteFill>
  );
};
