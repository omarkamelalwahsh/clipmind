/**
 * PromptCutComposition — the unified Remotion compositor.
 *
 *   Scenes mode (Executive Director v3): timeline.scenes[] — each a 5s scene
 *     with a backgroundAsset + its own motionGraphics (pulse_wave / hud_ring /
 *     kinetic_text). This is the creative motion-graphics path.
 *
 *   Overlay mode: base video (upload / FFmpeg output) + word-synced kinetic
 *     captions + standalone motionGraphicsTrack, for editing real footage.
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
  const sceneMode = scenes.length > 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* ── Creative scenes mode ── */}
      {sceneMode ? (
        scenes.map((scene) => {
          const d = Math.max(1, scene.endFrame - scene.startFrame);
          return (
            <Sequence key={scene.sceneId || scene.id} from={scene.startFrame} durationInFrames={d} name={scene.sceneId || scene.id}>
              <SceneSequence scene={scene} durationInFrames={d} />
            </Sequence>
          );
        })
      ) : (
        <>
          {/* ── Overlay mode: base video / video track ── */}
          {baseVideoUrl ? (
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

          {/* Standalone motion graphics over the footage */}
          {mgTrack.map((item) => {
            const d = Math.max(1, item.endFrame - item.startFrame);
            return (
              <Sequence key={item.id} from={item.startFrame} durationInFrames={d} name={item.id}>
                <MotionGraphic item={item} durationInFrames={d} />
              </Sequence>
            );
          })}

          {/* Word-synced kinetic captions */}
          {showCaptions && words.length > 0 && <KineticCaptions words={words} />}
        </>
      )}

      {/* Audio (both modes) */}
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
      {audioTrack.length === 0 && voiceoverUrl && <Audio src={voiceoverUrl} />}
      {audioTrack.length === 0 && musicUrl && <Audio src={musicUrl} volume={0.25} />}
    </AbsoluteFill>
  );
}
