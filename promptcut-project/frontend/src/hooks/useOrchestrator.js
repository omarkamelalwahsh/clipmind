/**
 * useOrchestrator.js
 * -----------------------------------------------------------------------------
 * The single seam between the React UI and the backend-agent. The UI components
 * stay "dumb": they call the functions this hook returns and render the state it
 * exposes (clips, log, result, transcript, busy). They never import a service or
 * a key.
 */

import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { createOrchestrator } from 'promptcut-backend-agent';

const apiKeys = {
  groq: import.meta.env.VITE_GROQ_API_KEY,
  gemini: import.meta.env.VITE_GEMINI_API_KEY,
  elevenlabs: import.meta.env.VITE_ELEVENLABS_API_KEY,
};

export function useOrchestrator() {
  const [clips, setClips] = useState([]);
  const [log, setLog] = useState([]);
  const [result, setResult] = useState(null); // { previewUrl, timeline, audio, plan, fit }
  const [transcript, setTranscript] = useState(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [activeClip, setActiveClip] = useState(null); // the clip currently shown in Viewer + Timeline
  const [timeline, setTimeline] = useState([]);
  const [audio, setAudio] = useState([]);
  const [remotionData, setRemotionData] = useState(null); // Remotion motion-graphics timeline JSON

  const pushLog = useCallback((evt) => {
    setStage(evt.stage);
    if (evt.progress !== undefined) {
      setProgress(evt.progress);
    }
    if (evt.message) {
      setLog((prev) => [...prev.slice(-49), { stage: evt.stage, message: evt.message, t: Date.now() }]);
    }
  }, []);

  // One orchestrator per mounted dashboard.
  const orchestratorRef = useRef(null);
  const orchestrator = useMemo(() => {
    // Create exactly once — survives StrictMode double-invokes and re-renders so
    // we never spin up two engines / duplicate the FFmpeg load.
    if (orchestratorRef.current) return orchestratorRef.current;
    const keysOk = apiKeys.groq && apiKeys.gemini && apiKeys.elevenlabs;
    if (!keysOk) return null;
    const o = createOrchestrator({ apiKeys, onEvent: pushLog });
    orchestratorRef.current = o;
    return o;
  }, [pushLog]);

  /**
   * Extract metadata (duration, thumbnail, objectURL) from a File for
   * immediate preview — runs entirely in the browser, no backend needed.
   */
  const enrichClip = useCallback((file) => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const isAudio = file.type.startsWith('audio/');
      const isImage = file.type.startsWith('image/');

      if (isAudio) {
        const audio = new Audio();
        audio.src = url;
        audio.onloadedmetadata = () => {
          resolve({
            id: cryptoId(),
            name: file.name,
            file,
            type: 'audio',
            duration: audio.duration,
            url,
          });
        };
      } else if (isImage) {
        resolve({
          id: cryptoId(),
          name: file.name,
          file,
          type: 'image',
          duration: 5,
          thumbnail: url,
          url,
        });
      } else {
        const video = document.createElement('video');
        video.src = url;
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        
        video.onloadedmetadata = () => {
          // Generate a rapid thumbnail in browser canvas
          video.currentTime = Math.min(1.0, video.duration / 2);
        };
        video.onseeked = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 160;
          canvas.height = 90;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          resolve({
            id: cryptoId(),
            name: file.name,
            file,
            type: 'video',
            duration: video.duration,
            thumbnail: canvas.toDataURL('image/jpeg', 0.7),
            url,
          });
        };
        video.onerror = () => {
          resolve({
            id: cryptoId(),
            name: file.name,
            file,
            type: 'video',
            duration: 10,
            url,
          });
        };
      }
    });
  }, []);

  const ingest = useCallback(
    async (fileList, options = {}) => {
      const appendToTimeline = options.appendToTimeline !== false;
      if (!orchestrator) return setError('Missing API keys — check frontend/.env');
      setBusy(true);
      setError(null);
      try {
        const list = Array.from(fileList);
        const enriched = await Promise.all(list.map(enrichClip));
        
        // Register in orchestrator
        for (const item of enriched) {
          orchestrator.registerClip(item.id, item);
        }

        setClips((prev) => {
          const next = [...prev, ...enriched];
          // Auto-select first clip as active clip if none active yet
          if (next.length && !activeClip) {
            setActiveClip(next[0]);
          }
          return next;
        });

        if (appendToTimeline) {
          // Append to the manual timeline state
          const newSegments = enriched.filter(c => c.type !== 'audio').map((clip) => ({
            id: clip.id,
            sourceId: clip.id,
            sourceName: clip.name,
            sourceStart: 0,
            duration: clip.duration,
            start: 0,
            end: clip.duration,
            thumbnail: clip.thumbnail,
            type: clip.type,
            volume: 1.0, // default volume
          }));
          if (newSegments.length > 0) {
            setTimeline((prev) => layoutSegments([...prev, ...newSegments]));
          }
        }

        // Trigger auto-transcript in background when we have video clips
        const hasVideo = enriched.some((c) => c.type !== 'audio');
        if (hasVideo) {
          orchestrator.transcribe().then((t) => setTranscript(t)).catch(() => {});
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    },
    [orchestrator, enrichClip, activeClip],
  );

  const selectClip = useCallback((clip) => {
    setActiveClip(clip);
    if (orchestrator && clip && clip.type !== 'audio') {
      try {
        orchestrator.setSpine(clip.id);
        setTranscript(null);
        orchestrator.transcribe().then((t) => setTranscript(t)).catch(() => {});
      } catch (e) {
        console.error("Failed to set spine:", e);
      }
    }
  }, [orchestrator]);

  const removeClip = useCallback(
    (id) => {
      if (orchestrator) orchestrator.unregisterClip(id);
      setClips((prev) => {
        const next = prev.filter((c) => c.id !== id);
        if (activeClip?.id === id) {
          const nextActive = next.length ? next[0] : null;
          setActiveClip(nextActive);
          if (orchestrator && nextActive && nextActive.type !== 'audio') {
            try {
              orchestrator.setSpine(nextActive.id);
              setTranscript(null);
              orchestrator.transcribe().then((t) => setTranscript(t)).catch(() => {});
            } catch (e) {
              console.error(e);
            }
          } else {
            setTranscript(null);
          }
        }
        return next;
      });
    },
    [orchestrator, activeClip],
  );

  const transcribe = useCallback(async () => {
    if (!orchestrator || !clips.length || transcript) return;
    try {
      const t = await orchestrator.transcribe();
      setTranscript(t);
    } catch (err) {
      setError(err.message);
    }
  }, [orchestrator, clips.length, transcript]);

  // Motion-graphics (Remotion): produce a frame-based timeline that the Remotion
  // Player previews live in the Viewer. No clip upload required.
  const generateMotionGraphics = useCallback(
    async (prompt) => {
      if (!orchestrator) return setError('Missing API keys — check frontend/.env');
      setBusy(true);
      setError(null);
      try {
        const data = await orchestrator.planRemotion(prompt);
        setRemotionData(data);
        // Surface the transcript so the composition can sync kinetic captions.
        if (orchestratorRef.current?.transcript) setTranscript(orchestratorRef.current.transcript);
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
        setStage('idle');
      }
    },
    [orchestrator],
  );

  const render = useCallback(
    async (prompt, opts) => {
      if (!orchestrator) return setError('Missing API keys — check frontend/.env');
      if (!clips.length) return setError('Upload at least one clip first');
      setBusy(true);
      setError(null);
      setResult(null);
      try {
        const out = await orchestrator.planAndRender(prompt, opts);
        setResult(out);
        // Always surface the transcript (esp. for transcript-only requests).
        if (out.transcript) setTranscript(out.transcript);
        else if (orchestratorRef.current?.transcript) setTranscript(orchestratorRef.current.transcript);
        
        if (out.newClip) {
          const url = URL.createObjectURL(out.newClip.file);
          const enriched = {
            ...out.newClip,
            url,
            thumbnail: activeClip?.thumbnail || null,
          };
          setClips((prev) => [...prev, enriched]);
          setActiveClip(enriched);
          if (out.timeline && out.timeline.length) setTimeline(out.timeline);
          setAudio([]);
        } else {
          // Don't wipe the manual timeline when a request produced no new segments.
          if (out.timeline && out.timeline.length) setTimeline(out.timeline);
          if (out.audio && out.audio.length) setAudio(out.audio);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
        setStage('idle');
      }
    },
    [orchestrator, clips.length, activeClip],
  );

  const renderCustomTimeline = useCallback(
    async (customSegments) => {
      if (!orchestrator) return setError('Missing API keys — check frontend/.env');
      setBusy(true);
      setError(null);
      try {
        const out = await orchestrator.renderTimeline(customSegments, audio);
        setResult((prev) => ({
          ...prev,
          previewUrl: out.previewUrl,
          timeline: out.timeline,
        }));
        setTimeline(out.timeline);
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
        setStage('idle');
      }
    },
    [orchestrator, audio],
  );

  const keysReady = Boolean(orchestrator);

  useEffect(() => {
    if (busy) {
      setProgress(0);
    }
  }, [busy]);

  return {
    clips,
    log,
    result,
    transcript,
    busy,
    stage,
    progress,
    error,
    keysReady,
    activeClip,
    ingest,
    selectClip,
    removeClip,
    transcribe,
    render,
    timeline,
    setTimeline,
    audio,
    setAudio,
    renderCustomTimeline,
    remotionData,
    setRemotionData,
    generateMotionGraphics,
  };
}

function layoutSegments(segments) {
  let currentStart = 0;
  return segments.map((seg) => {
    const start = currentStart;
    const end = start + seg.duration;
    currentStart = end;
    return {
      ...seg,
      start,
      end,
    };
  });
}

/** Stable unique id (browser crypto when available, otherwise a random fallback). */
function cryptoId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2, 10);
}
