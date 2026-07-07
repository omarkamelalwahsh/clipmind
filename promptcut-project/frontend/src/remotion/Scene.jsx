/**
 * Scene.jsx — renders v2 timeline items inside Remotion <Sequence>s.
 *
 *  - VideoScene: videoTrack item (ai_image / ai_video / user_upload) with a
 *    Ken-Burns style animation. Resolves its asset via the assets map.
 *  - MotionGraphic: motionGraphicsTrack item driven ENTIRELY by its editable
 *    `properties` object (text, fontFamily, color, fontSize, animationEffect)
 *    so the frontend Property Panel can restyle it without code changes.
 */
import { AbsoluteFill, Img, Video, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { PulseWave } from './PulseWave.jsx';
import { HudRing } from './HudRing.jsx';
import { KineticText } from './KineticText.jsx';

/* ------------------------------ animations ------------------------------ */

function useEnvelope(durationInFrames) {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(
    frame,
    [Math.max(0, durationInFrames - 10), durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  return Math.min(fadeIn, fadeOut);
}

function useKenBurns(animation, durationInFrames) {
  const frame = useCurrentFrame();
  if (animation === 'slow-zoom-in') {
    return `scale(${interpolate(frame, [0, durationInFrames], [1, 1.18], { extrapolateRight: 'clamp' })})`;
  }
  if (animation === 'slow-zoom-out') {
    return `scale(${interpolate(frame, [0, durationInFrames], [1.18, 1], { extrapolateRight: 'clamp' })})`;
  }
  return 'none';
}

function useTextAnimation(effect) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  switch (effect) {
    case 'pop-bounce': {
      const s = spring({ frame, fps, config: { damping: 9, mass: 0.7, stiffness: 130 } });
      return { transform: `scale(${0.55 + s * 0.45})` };
    }
    case 'slide-left': {
      const s = spring({ frame, fps, config: { damping: 18, stiffness: 90 } });
      return { transform: `translateX(${interpolate(s, [0, 1], [-240, 0])}px)` };
    }
    case 'fade-in':
    default:
      return {};
  }
}

/* ------------------------------ video scene ------------------------------ */

export function VideoScene({ item, durationInFrames, assetUrl }) {
  const opacity = useEnvelope(durationInFrames);
  const transform = useKenBurns(item.animation, durationInFrames);

  if (!assetUrl) {
    // Asset not generated/uploaded yet → labelled placeholder.
    return (
      <AbsoluteFill style={{ backgroundColor: '#11161d', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ opacity, color: 'rgba(255,255,255,0.5)', fontFamily: 'Montserrat, sans-serif', fontSize: 34, textAlign: 'center', padding: '0 10%' }}>
          🎬 {item.type} — {item.assetId}
        </div>
      </AbsoluteFill>
    );
  }

  const media = item.type === 'ai_video' || /\.(mp4|webm|mov)(\?|$)/i.test(assetUrl)
    ? <Video src={assetUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity, transform }} />
    : <Img src={assetUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity, transform }} />;

  return <AbsoluteFill style={{ backgroundColor: '#000' }}>{media}</AbsoluteFill>;
}

/* --------------------------- motion graphic --------------------------- */

export function MotionGraphic({ item, durationInFrames }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = useEnvelope(durationInFrames);
  const anim = useTextAnimation(item.properties?.animationEffect);
  const p = item.properties || {};
  const words = Array.isArray(p.words) && p.words.length > 0 ? p.words : null;

  const baseStyle = {
    fontFamily: `${p.fontFamily || 'Montserrat'}, Inter, sans-serif`,
    color: p.color || '#FFFFFF',
    fontSize: p.fontSize || 64,
    fontWeight: 800,
    opacity,
    ...anim,
  };

  // Render content: word-by-word kinetic if words array present, else full text
  const content = words
    ? <WordByWordRenderer words={words} frame={frame} fps={fps} color={p.color || '#FFFFFF'} />
    : <PlainTextRenderer text={p.text || ''} effect={p.animationEffect} frame={frame} durationInFrames={durationInFrames} />;

  if (item.type === 'pulse_wave') {
    return <PulseWave properties={item.properties} />;
  }

  if (item.type === 'hud_ring') {
    return <HudRing properties={item.properties} />;
  }

  if (item.type === 'kinetic_text') {
    return <KineticText properties={item.properties} />;
  }

  if (item.type === 'lower_third') {
    return (
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'flex-start', padding: '0 0 9% 6%' }}>
        <div
          style={{
            ...baseStyle,
            padding: '16px 32px',
            borderRadius: 16,
            background: 'rgba(255,255,255,0.10)',
            border: '1px solid rgba(255,255,255,0.25)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          }}
        >
          {content}
        </div>
      </AbsoluteFill>
    );
  }

  if (item.type === 'social_overlay') {
    return (
      <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'flex-end', padding: '4% 4% 0 0' }}>
        <div style={{ ...baseStyle, fontSize: (p.fontSize || 40) * 0.7, opacity: opacity * 0.9 }}>{content}</div>
      </AbsoluteFill>
    );
  }

  // title_card / chart
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 8%' }}>
      <div style={{ ...baseStyle, textAlign: 'center', lineHeight: 1.15, textShadow: '0 6px 30px rgba(0,0,0,0.6)', WebkitTextStroke: '2px rgba(0,0,0,0.4)' }}>
        {content}
      </div>
    </AbsoluteFill>
  );
}

export function SceneSequence({ scene, durationInFrames }) {
  const background = scene.backgroundAsset || {};
  const gradientColors = background.colors || ['#0B132B', '#1C2541'];
  const style = background.type === 'gradient_mesh'
    ? {
      background: `radial-gradient(circle at 20% 20%, ${gradientColors[0]} 0%, transparent 35%), radial-gradient(circle at 80% 30%, ${gradientColors[1]} 0%, transparent 30%), #020817`,
    }
    : background.type === 'grid_overlay'
      ? {
        backgroundColor: background.color || '#11161d',
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
        backgroundSize: '70px 70px',
      }
      : { backgroundColor: background.color || '#000' };

  return (
    <AbsoluteFill style={{ ...style, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
      {scene.motionGraphics?.map((mg) => {
        if (mg.type === 'pulse_wave') return <PulseWave key={mg.id} properties={mg.properties} />;
        if (mg.type === 'hud_ring') return <HudRing key={mg.id} properties={mg.properties} />;
        if (mg.type === 'kinetic_text') return <KineticText key={mg.id} properties={mg.properties} />;
        return null;
      })}
    </AbsoluteFill>
  );
}

/**
 * Renders words one-by-one with the active word highlighted in yellow and
 * a spring pop animation. Words not yet spoken are dimmed.
 */
function WordByWordRenderer({ words, frame, fps, color }) {
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0 14px', justifyContent: 'center' }}>
      {words.map((w, i) => {
        // Is this word currently being spoken?
        const wordStart = w.startFrame || 0;
        const wordEnd = w.endFrame || wordStart + 10;
        const localFrame = frame - wordStart;
        const isActive = frame >= wordStart && frame < wordEnd;
        const isPast = frame >= wordEnd;

        // Pop spring on the word as it starts
        const pop = isActive
          ? spring({ frame: Math.max(0, localFrame), fps, config: { damping: 10, mass: 0.6, stiffness: 140 } })
          : 0;
        const scale = isActive ? 1 + pop * 0.18 : 1;

        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              transform: `scale(${scale})`,
              color: isActive ? '#facc15' : color,
              opacity: isPast || isActive ? 1 : 0.4,
              transition: 'color 80ms linear, opacity 120ms linear',
            }}
          >
            {(w.word || '').trim()}
          </span>
        );
      })}
    </span>
  );
}

/** Renders plain text with optional typewriter effect (legacy fallback). */
function PlainTextRenderer({ text, effect, frame, durationInFrames }) {
  if (effect === 'typewriter') {
    const shown = text.slice(
      0,
      Math.floor(interpolate(frame, [0, Math.max(1, durationInFrames * 0.6)], [0, text.length], { extrapolateRight: 'clamp' })),
    );
    return <>{shown}</>;
  }
  return <>{text}</>;
}

