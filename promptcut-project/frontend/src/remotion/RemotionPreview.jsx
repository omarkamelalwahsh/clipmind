import { useEffect, useMemo, useRef, useCallback } from 'react';
import { Player } from '@remotion/player';
import { PromptCutComposition } from './PromptCutComposition.jsx';

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

export default function RemotionPreview({
  data,
  baseVideoUrl = null,
  words = [],
  showCaptions = false,
  videoDurationSec = 0,
  assets = {},
  voiceoverUrl,
  musicUrl,
  videoRef,
}) {
  useMontserrat();

  const cleanupRef = useRef(null);

  const ps = data?.projectSettings || {};
  const fps = ps.fps || 30;
  const width = ps.width || 1920;
  const height = ps.height || 1080;

  // Composition length. In creative "scenes" mode use the timeline exactly (so a
  // long uploaded clip doesn't pad the promo with black). In overlay mode take
  // the longer of the timeline and the base video.
  const sceneMode = (data?.timeline?.scenes?.length || 0) > 0;
  const timelineFrames = ps.totalDurationInFrames || 0;
  const videoFrames = Math.round((videoDurationSec || 0) * fps);
  const durationInFrames = sceneMode
    ? Math.max(1, timelineFrames)
    : Math.max(1, timelineFrames, videoFrames);

  // Use a callback ref so that the mock video is bound immediately when
  // the @remotion/player mounts in the DOM.
  const playerRefCallback = useCallback((player) => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    if (!player || !videoRef) return;

    // Standard HTML5 event listener proxy registry
    const listeners = {
      play: [],
      pause: [],
      timeupdate: [],
      ended: [],
    };

    const onPlay = () => listeners.play.forEach((cb) => cb());
    const onPause = () => listeners.pause.forEach((cb) => cb());
    const onFrameUpdate = (e) => {
      const currentTime = e.detail.frame / fps;
      listeners.timeupdate.forEach((cb) => cb());
    };
    const onEnded = () => listeners.ended.forEach((cb) => cb());

    player.addEventListener('play', onPlay);
    player.addEventListener('pause', onPause);
    player.addEventListener('frameupdate', onFrameUpdate);
    player.addEventListener('ended', onEnded);

    const mockVideo = {
      play: () => player.play(),
      pause: () => player.pause(),
      get paused() {
        return !player.isPlaying();
      },
      get currentTime() {
        return player.getCurrentFrame() / fps;
      },
      set currentTime(val) {
        player.seekTo(Math.round(val * fps));
      },
      get duration() {
        return durationInFrames / fps;
      },
      style: {
        visibility: 'visible',
      },
      set muted(val) {
        if (val) player.mute();
        else player.unmute();
      },
      addEventListener: (evt, cb) => {
        if (listeners[evt]) listeners[evt].push(cb);
      },
      removeEventListener: (evt, cb) => {
        if (listeners[evt]) {
          listeners[evt] = listeners[evt].filter((c) => c !== cb);
        }
      },
    };

    videoRef.current = mockVideo;
    
    // Initial sync
    listeners.timeupdate.forEach((cb) => cb());

    cleanupRef.current = () => {
      player.removeEventListener('play', onPlay);
      player.removeEventListener('pause', onPause);
      player.removeEventListener('frameupdate', onFrameUpdate);
      player.removeEventListener('ended', onEnded);
      if (videoRef.current === mockVideo) {
        videoRef.current = null;
      }
    };
  }, [videoRef, fps, durationInFrames]);

  const inputProps = useMemo(
    () => ({ data, baseVideoUrl, words, showCaptions, assets, voiceoverUrl, musicUrl }),
    [data, baseVideoUrl, words, showCaptions, assets, voiceoverUrl, musicUrl],
  );

  // Nothing to show unless we have a base video OR any agent track content (v2).
  const hasTracks =
    (data?.timeline?.videoTrack?.length || 0) +
    (data?.timeline?.motionGraphicsTrack?.length || 0) +
    (data?.timeline?.scenes?.length || 0) > 0;
  if (!baseVideoUrl && !hasTracks) return null;

  return (
    <Player
      ref={playerRefCallback}
      component={PromptCutComposition}
      inputProps={inputProps}
      durationInFrames={durationInFrames}
      compositionWidth={width}
      compositionHeight={height}
      fps={fps}
      controls
      autoPlay
      loop
      style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden' }}
    />
  );
}
