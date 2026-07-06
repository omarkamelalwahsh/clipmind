/**
 * Scene.jsx — renders a single timeline item inside a Remotion <Sequence>.
 * Dispatches by type and applies the requested animationEffect. Frame is
 * relative to the sequence start (Remotion handles the offset).
 */
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

const FONT = 'Montserrat, Inter, system-ui, sans-serif';

/** Compute animation style for the given effect at the current frame. */
function useAnimatedStyle(effect, durationInFrames) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fade in/out envelope shared by all effects.
  const fadeIn = interpolate(frame, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(
    frame,
    [Math.max(0, durationInFrames - 10), durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const opacity = Math.min(fadeIn, fadeOut);

  switch (effect) {
    case 'pop-bounce': {
      const s = spring({ frame, fps, config: { damping: 9, mass: 0.7, stiffness: 120 } });
      return { opacity, transform: `scale(${0.6 + s * 0.4})` };
    }
    case 'slide-in':
    case 'slide-left': {
      const s = spring({ frame, fps, config: { damping: 18, stiffness: 90 } });
      const x = interpolate(s, [0, 1], [effect === 'slide-left' ? 220 : -220, 0]);
      return { opacity, transform: `translateX(${x}px)` };
    }
    case 'slow-zoom-in': {
      const scale = interpolate(frame, [0, durationInFrames], [1, 1.18], { extrapolateRight: 'clamp' });
      return { opacity, transform: `scale(${scale})` };
    }
    case 'slow-zoom-out': {
      const scale = interpolate(frame, [0, durationInFrames], [1.18, 1], { extrapolateRight: 'clamp' });
      return { opacity, transform: `scale(${scale})` };
    }
    default:
      return { opacity, transform: 'none' };
  }
}

export function Scene({ item, durationInFrames, generatedUrl }) {
  const style = useAnimatedStyle(item.animationEffect, durationInFrames);

  if (item.type === 'typography') {
    return (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 8%' }}>
        <div
          style={{
            ...style,
            fontFamily: FONT,
            color: '#FFFFFF',
            fontWeight: 800,
            fontSize: 96,
            lineHeight: 1.1,
            textAlign: 'center',
            textShadow: '0 6px 30px rgba(0,0,0,0.6)',
          }}
        >
          {item.promptForGenerator}
        </div>
      </AbsoluteFill>
    );
  }

  if (item.type === 'lower_third') {
    return (
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'flex-start', padding: '0 0 9% 6%' }}>
        <div
          style={{
            ...style,
            fontFamily: FONT,
            color: '#FFFFFF',
            fontWeight: 700,
            fontSize: 56,
            padding: '18px 34px',
            borderRadius: 16,
            // Apple-style frosted glass card.
            background: 'rgba(255,255,255,0.10)',
            border: '1px solid rgba(255,255,255,0.25)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          }}
        >
          {item.promptForGenerator}
        </div>
      </AbsoluteFill>
    );
  }

  // image_generation / video_generation → show the generated asset if provided,
  // else a labelled placeholder (generation is wired separately).
  return (
    <AbsoluteFill style={{ backgroundColor: '#11161d' }}>
      {generatedUrl ? (
        <Img src={generatedUrl} style={{ ...style, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', ...style }}>
          <div style={{ fontFamily: FONT, color: 'rgba(255,255,255,0.5)', fontSize: 34, textAlign: 'center', padding: '0 10%' }}>
            🎬 {item.type === 'video_generation' ? 'Video' : 'Image'} scene<br />
            <span style={{ fontSize: 22 }}>{item.promptForGenerator}</span>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}
