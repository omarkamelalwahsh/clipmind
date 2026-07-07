/**
 * PromptCutComposition — the unified Remotion compositor (v2 contract).
 *
 *   Layer 0: base video (user upload / FFmpeg output) OR the agent videoTrack.
 *   Layer 1: word-synced kinetic captions (from the transcript).
 *   Layer 2: motionGraphicsTrack (lower thirds / title cards / overlays),
 *            each driven by its editable `properties` object.
 *   Audio  : audioTrack (voiceover / bg_music) with per-item volume.
 *
 * `assets` maps assetId (or upload name) → local Blob URL.
 */
import { AbsoluteFill, Sequence, Audio, Video } from 'remotion';
import { VideoScene, MotionGraphic, SceneSequence } from './Scene.jsx';
import { KineticCaptions } from './KineticCaptions.jsx';

export function PromptCutComposition({
  data,
  baseVideoUrl = null,
  words = [],
  showCaptions = false,
  assets = {},
  voiceoverUrl = null,
  musicUrl = null,
}) {
  const scenes = data?.timeline?.scenes || [];
  const videoTrack = data?.timeline?.videoTrack || [];
  const mgTrack = data?.timeline?.motionGraphicsTrack || [];
  const audioTrack = data?.timeline?.audioTrack || [];

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Layer 0 — explicit scene timeline if provided, else base video / video track */}
      {scenes.length > 0 ? (
        scenes.map((scene) => {
          const d = Math.max(1, scene.endFrame - scene.startFrame);
          return (
            <Sequence key={scene.sceneId} from={scene.startFrame} durationInFrames={d} name={scene.sceneId}>
              <SceneSequence scene={scene} durationInFrames={d} />
            </Sequence>
          );
        })
      ) : baseVideoUrl ? (
        <Video src={baseVideoUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : (
        videoTrack.map((item) => {
          const d = Math.max(1, item.endFrame - item.startFrame);
          return (
            <Sequence key={item.id} from={item.startFrame} durationInFrames={d} name={item.id}>
              <VideoScene item={item} durationInFrames={d} assetUrl={assets[item.assetId]} />
            </Sequence>
          );
        })
      )}

      {/* Layer 2 — motion graphics driven by editable properties */}
      {mgTrack.map((item) => {
        const d = Math.max(1, item.endFrame - item.startFrame);
        return (
          <Sequence key={item.id} from={item.startFrame} durationInFrames={d} name={item.id}>
            <MotionGraphic item={item} durationInFrames={d} />
          </Sequence>
        );
      })}

      {/* Layer 1 — kinetic captions synced to the voiceover */}
      {showCaptions && words.length > 0 && <KineticCaptions words={words} />}

      {/* Audio track */}
      {audioTrack.map((a) => {
        const src = a.type === 'voiceover' ? voiceoverUrl : musicUrl;
        if (!src) return null;
        const d = Math.max(1, a.endFrame - a.startFrame);
        return (
          <Sequence key={a.id} from={a.startFrame} durationInFrames={d} name={a.id}>
            <Audio src={src} volume={a.volume ?? 1} />
          </Sequence>
        );
      })}
      {/* Fallbacks when the agent produced no explicit audio items */}
      {audioTrack.length === 0 && voiceoverUrl && <Audio src={voiceoverUrl} />}
      {audioTrack.length === 0 && musicUrl && <Audio src={musicUrl} volume={0.25} />}
    </AbsoluteFill>
  );
}
