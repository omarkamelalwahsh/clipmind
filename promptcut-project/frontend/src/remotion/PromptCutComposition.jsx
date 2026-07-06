/**
 * PromptCutComposition — the top-level Remotion composition. Maps the agent's
 * frame-based timeline JSON to stacked <Sequence>s, each rendering a Scene.
 * `generatedAssets` optionally maps scene id → image/video URL.
 */
import { AbsoluteFill, Sequence, Audio } from 'remotion';
import { Scene } from './Scene.jsx';

export function PromptCutComposition({ data, generatedAssets = {}, voiceoverUrl = null, musicUrl = null }) {
  const timeline = data?.timeline || [];

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0f14' }}>
      {timeline.map((item) => {
        const durationInFrames = Math.max(1, item.endFrame - item.startFrame);
        return (
          <Sequence key={item.id} from={item.startFrame} durationInFrames={durationInFrames} name={item.id}>
            <Scene item={item} durationInFrames={durationInFrames} generatedUrl={generatedAssets[item.id]} />
          </Sequence>
        );
      })}

      {voiceoverUrl && <Audio src={voiceoverUrl} />}
      {musicUrl && <Audio src={musicUrl} volume={0.25} />}
    </AbsoluteFill>
  );
}
