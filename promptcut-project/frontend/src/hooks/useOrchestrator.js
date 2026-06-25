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

  const ingest = useCallback(
    async (fileList) => {
      if (!orchestrator) return setError('Missing API keys — check frontend/.env');
      setError(null);
      try {
        const files = Array.from(fileList);
        const added = await orchestrator.ingest(files);
        setClips((prev) => [...prev, ...added]);
      } catch (err) {
        setError(err.message);
      }
    },
    [orchestrator],
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
    ingest,
    transcribe,
    render,
  };
}
