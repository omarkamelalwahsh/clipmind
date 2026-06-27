/**
 * useOrchestrator.js
 * -----------------------------------------------------------------------------
 * The single seam between the React UI and the backend-agent. The UI components
 * stay "dumb": they call the functions this hook returns and render the state it
 * exposes (clips, log, result, transcript, busy). They never import a service or
 * a key.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
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
  const [error, setError] = useState(null);
  const [activeClip, setActiveClip] = useState(null); // the clip currently shown in Viewer + Timeline

  const pushLog = useCallback((evt) => {
    setStage(evt.stage);
    if (evt.message) {
      setLog((prev) => [...prev.slice(-49), { stage: evt.stage, message: evt.message, t: Date.now() }]);
    }
  }, []);

  // One orchestrator per mounted dashboard.
  const orchestratorRef = useRef(null);
  const orchestrator = useMemo(() => {
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

      if (isAudio) {
        const audio = new Audio();
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => {
          resolve({ objectUrl: url, duration: audio.duration, thumbnail: null });
        };
        audio.onerror = () => resolve({ objectUrl: url, duration: 0, thumbnail: null });
        audio.src = url;
      } else {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;

        video.onloadeddata = () => {
          // Seek to 1s (or 25% if shorter) for a representative thumbnail
          video.currentTime = Math.min(1, video.duration * 0.25);
        };

        video.onseeked = () => {
          // Grab a thumbnail frame
          const canvas = document.createElement('canvas');
          canvas.width = 160;
          canvas.height = 90;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
          resolve({ objectUrl: url, duration: video.duration, thumbnail });
        };

        video.onerror = () => resolve({ objectUrl: url, duration: 0, thumbnail: null });
        video.src = url;
      }
    });
  }, []);

  const ingest = useCallback(
    async (fileList) => {
      if (!orchestrator) return setError('Missing API keys — check frontend/.env');
      setError(null);
      try {
        const files = Array.from(fileList);

        // Enrich each file with browser-side metadata (thumbnail, duration, objectUrl)
        const enrichments = await Promise.all(files.map(enrichClip));

        const added = await orchestrator.ingest(files);

        // Merge orchestrator clip data with our browser-side enrichments
        const enrichedClips = added.map((clip, i) => ({
          ...clip,
          objectUrl: enrichments[i].objectUrl,
          duration: clip.duration || enrichments[i].duration,
          thumbnail: enrichments[i].thumbnail,
        }));

        setClips((prev) => [...prev, ...enrichedClips]);

        // Auto-select the first uploaded clip for preview (like ChatCut)
        setActiveClip((prev) => prev || enrichedClips[0] || null);
      } catch (err) {
        setError(err.message);
      }
    },
    [orchestrator, enrichClip],
  );

  const selectClip = useCallback((clip) => {
    setActiveClip(clip);
  }, []);

  const transcribe = useCallback(async () => {
    if (!orchestrator || !clips.length || transcript) return;
    try {
      const t = await orchestrator.transcribe();
      setTranscript(t);
    } catch (err) {
      setError(err.message);
    }
  }, [orchestrator, clips.length, transcript]);

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
        if (orchestratorRef.current?.transcript) setTranscript(orchestratorRef.current.transcript);
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
        setStage('idle');
      }
    },
    [orchestrator, clips.length],
  );

  const keysReady = Boolean(orchestrator);

  return {
    clips,
    log,
    result,
    transcript,
    busy,
    stage,
    error,
    keysReady,
    activeClip,
    ingest,
    selectClip,
    transcribe,
    render,
  };
}
