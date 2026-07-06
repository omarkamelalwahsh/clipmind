/**
 * RemotionPreview — live in-browser preview of a Remotion timeline via
 * @remotion/player. Fits the local-first architecture: no server render, the
 * motion graphics play instantly in the Viewer.
 */
import { useEffect, useMemo } from 'react';
import { Player } from '@remotion/player';
import { PromptCutComposition } from './PromptCutComposition.jsx';

// Ensure Montserrat is available for the kinetic typography.
function useMontserrat() {
  useEffect(() => {
    const id = 'remotion-montserrat';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&display=swap';
    document.head.appendChild(link);
  }, []);
}

export default function RemotionPreview({ data, generatedAssets, voiceoverUrl, musicUrl }) {
  useMontserrat();
  const ps = data?.projectSettings || {};
  const width = ps.width || 1920;
  const height = ps.height || 1080;
  const fps = ps.fps || 30;
  const durationInFrames = Math.max(1, ps.totalDurationInFrames || fps);

  const inputProps = useMemo(
    () => ({ data, generatedAssets, voiceoverUrl, musicUrl }),
    [data, generatedAssets, voiceoverUrl, musicUrl],
  );

  if (!data?.timeline?.length) return null;

  return (
    <Player
      component={PromptCutComposition}
      inputProps={inputProps}
      durationInFrames={durationInFrames}
      compositionWidth={width}
      compositionHeight={height}
      fps={fps}
      controls
      loop
      style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden' }}
    />
  );
}
