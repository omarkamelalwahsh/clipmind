/**
 * Scene.jsx — renders v2 timeline items inside Remotion <Sequence>s.
 *
 *  - VideoScene: videoTrack item (ai_image / ai_video / user_upload) with a
 *    Ken-Burns style animation. Resolves its asset via the assets map.
 *  - MotionGraphic: motionGraphicsTrack item driven ENTIRELY by its editable
 *    `properties` object (text, fontFamily, color, fontSize, animationEffect)
 *    so the frontend Property Panel can restyle it without code changes.
 */
import { AbsoluteFill, Img, Video, Sequence, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
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

function getTextValue(properties, keys = []) {
  for (const key of keys) {
    const value = properties?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function getCountdownValue(properties, frame, fps) {
  const start = Number(properties?.startValue ?? properties?.from ?? properties?.value ?? 10);
  const end = Number(properties?.endValue ?? properties?.to ?? 0);
  const duration = Math.max(1, Number(properties?.durationFrames ?? fps * 2));
  const progress = interpolate(frame, [0, duration], [0, 1], { extrapolateRight: 'clamp' });
  return Math.max(0, Math.round(start + (end - start) * progress));
}

/* ------------------------------ video scene ------------------------------ */

export function VideoScene({ item, durationInFrames, assetUrl }) {
  const opacity = useEnvelope(durationInFrames);
  const transform = useKenBurns(item.animation, durationInFrames);

  if (!assetUrl) {
    // Asset not generated/uploaded yet → generic loading placeholder.
    return (
      <AbsoluteFill style={{ backgroundColor: '#11161d', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ opacity, color: 'rgba(255,255,255,0.65)', fontFamily: 'Montserrat, sans-serif', fontSize: 32, textAlign: 'center', padding: '0 10%' }}>
          Generating visual asset...
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

  switch (item.type) {
    case 'pulse_wave':
      return <PulseWave properties={item.properties} />;
    case 'hud_ring':
      return <HudRing properties={item.properties} />;
    case 'kinetic_text':
      return <KineticText properties={item.properties} />;
    case 'lower_third': {
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
    case 'title_card':
    case 'title_animation': {
      const title = getTextValue(p, ['title', 'headline', 'text']);
      const subtitle = getTextValue(p, ['subtitle', 'byline', 'caption']);
      const reveal = spring({ frame, fps, config: { damping: 14, mass: 0.6, stiffness: 120 } });
      return (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 8%' }}>
          <div style={{ width: '100%', maxWidth: 900, transform: `translateY(${(1 - reveal) * 24}px)`, opacity: reveal * opacity, textAlign: 'center' }}>
            <div style={{ height: 3, width: 96, margin: '0 auto 18px', background: p.accentColor || '#00E5FF', borderRadius: 999, boxShadow: `0 0 20px ${p.accentColor || '#00E5FF'}` }} />
            <div style={{ fontFamily: `${p.fontFamily || 'Montserrat'}, Inter, sans-serif`, fontSize: p.fontSize ? Math.max(36, p.fontSize) : 68, fontWeight: 800, color: p.color || '#FFFFFF', textShadow: '0 8px 30px rgba(0,0,0,0.55)', lineHeight: 1.08 }}>
              {title || 'Title'}
            </div>
            {subtitle ? <div style={{ marginTop: 12, fontSize: 24, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>{subtitle}</div> : null}
          </div>
        </AbsoluteFill>
      );
    }
    case 'countdown':
    case 'timer': {
      const value = getCountdownValue(p, frame, fps);
      const label = getTextValue(p, ['label', 'caption', 'title']);
      return (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, opacity }}>
            <div style={{ width: 140, height: 140, borderRadius: '50%', border: `4px solid ${p.color || '#FFFFFF'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, fontWeight: 800, color: p.color || '#FFFFFF', boxShadow: `0 0 24px ${p.accentColor || '#00E5FF'}` }}>
              {value}
            </div>
            {label ? <div style={{ fontSize: 24, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{label}</div> : null}
          </div>
        </AbsoluteFill>
      );
    }
    case 'chart':
    case 'infographic':
    case 'data_card': {
      const rawSeries = Array.isArray(p.series) ? p.series : Array.isArray(p.values) ? p.values.map((value, index) => ({ label: p.labels?.[index] || `Item ${index + 1}`, value })) : [];
      const maxValue = Math.max(1, ...rawSeries.map((entry) => Number(entry.value || 0)));
      return (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 8%' }}>
          <div style={{ width: '100%', maxWidth: 900, borderRadius: 24, padding: 28, background: 'rgba(5,10,24,0.72)', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 20px 50px rgba(0,0,0,0.4)', opacity }}>
            {getTextValue(p, ['title', 'headline']) ? <div style={{ fontSize: 28, fontWeight: 800, color: p.color || '#FFFFFF', marginBottom: 16 }}>{getTextValue(p, ['title', 'headline'])}</div> : null}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, rawSeries.length || 1)}, minmax(0, 1fr))`, gap: 16 }}>
              {rawSeries.length > 0 ? rawSeries.map((entry, index) => {
                const value = Number(entry.value || 0);
                const height = interpolate(value, [0, maxValue], [18, 120], { extrapolateRight: 'clamp' });
                const active = spring({ frame: frame - index * 8, fps, config: { damping: 12, mass: 0.5, stiffness: 140 } });
                return (
                  <div key={`${entry.label}-${index}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: '100%', height: 140, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      <div style={{ width: '70%', height: `${Math.max(18, height * active)}px`, minHeight: 18, borderRadius: 12, background: index % 2 === 0 ? '#00E5FF' : '#F59E0B', boxShadow: `0 0 18px ${index % 2 === 0 ? '#00E5FF' : '#F59E0B'}` }} />
                    </div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>{entry.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: p.color || '#FFFFFF' }}>{value}</div>
                  </div>
                );
              }) : <div style={{ color: 'rgba(255,255,255,0.7)' }}>No data</div>}
            </div>
          </div>
        </AbsoluteFill>
      );
    }
    case 'logo_animation':
    case 'logo_reveal': {
      const reveal = spring({ frame, fps, config: { damping: 14, mass: 0.6, stiffness: 140 } });
      return (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, opacity: reveal * opacity }}>
            <div style={{ width: 92, height: 92, borderRadius: 24, background: `linear-gradient(135deg, ${p.accentColor || '#00E5FF'}, ${p.color || '#FFFFFF'})`, transform: `scale(${reveal})`, boxShadow: `0 0 28px ${p.accentColor || '#00E5FF'}` }} />
            <div style={{ fontSize: 34, fontWeight: 800, color: p.color || '#FFFFFF' }}>{getTextValue(p, ['title', 'brand', 'text']) || 'Brand'}</div>
          </div>
        </AbsoluteFill>
      );
    }
    case 'social_overlay': {
      const cta = getTextValue(p, ['cta', 'buttonText', 'text']);
      return (
        <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'flex-end', padding: '4% 4% 0 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end', opacity: opacity * 0.95 }}>
            <div style={{ ...baseStyle, fontSize: (p.fontSize || 40) * 0.7 }}>{content}</div>
            {cta ? <div style={{ padding: '10px 16px', borderRadius: 999, background: p.accentColor || '#00E5FF', color: '#06121F', fontWeight: 800 }}>{cta}</div> : null}
          </div>
        </AbsoluteFill>
      );
    }
    default:
      return (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 8%' }}>
          <div style={{ ...baseStyle, textAlign: 'center', lineHeight: 1.15, textShadow: '0 6px 30px rgba(0,0,0,0.6)', WebkitTextStroke: '2px rgba(0,0,0,0.4)' }}>
            {content}
          </div>
        </AbsoluteFill>
      );
  }
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

  const accent = gradientColors[1] || gradientColors[0] || '#00E5FF';

  return (
    <AbsoluteFill style={{ ...style, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
      {/* Depth: subtle grid on every scene + a soft accent glow + vignette. */}
      <AbsoluteFill style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
        maskImage: 'radial-gradient(circle at 50% 50%, #000 40%, transparent 85%)',
        WebkitMaskImage: 'radial-gradient(circle at 50% 50%, #000 40%, transparent 85%)',
      }} />
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 45%, ${accent}22 0%, transparent 55%)` }} />
      <AbsoluteFill style={{ boxShadow: 'inset 0 0 220px rgba(0,0,0,0.8)' }} />

      {(scene.motionGraphics || []).map((mg, i) => {
        // The agent gives ABSOLUTE frames; convert to this scene's local frames
        // so each element enters/exits at its own beat (wave first, text after…).
        const rawStart = Math.max(0, Math.round((mg.startFrame ?? scene.startFrame) - scene.startFrame));
        const rawEnd = Math.round((mg.endFrame ?? scene.endFrame) - scene.startFrame);
        const from = Math.min(rawStart, durationInFrames - 1);
        const dur = Math.max(1, Math.min(rawEnd, durationInFrames) - from);

        let el;
        switch (mg.type) {
          case 'pulse_wave': el = <PulseWave properties={mg.properties} />; break;
          case 'hud_ring': el = <HudRing properties={mg.properties} />; break;
          case 'kinetic_text': el = <KineticText properties={mg.properties} />; break;
          default: el = <MotionGraphic item={mg} durationInFrames={dur} />;
        }
        return (
          <Sequence key={mg.id || i} from={from} durationInFrames={dur} name={mg.id || `mg_${i}`}>
            {el}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

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

