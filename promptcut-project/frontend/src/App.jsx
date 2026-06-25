/**
 * App.jsx — the Master Dashboard (ChatCut-style 3-pane + timeline layout, in the
 * PromptCut "Nano Banana" theme). Composes dumb components and wires them to the
 * orchestrator via useOrchestrator. Holds NO editing logic and touches NO API.
 *
 *  ┌───────────────────────── TopBar ─────────────────────────┐
 *  │ AIPanel │       AssetsPanel        │        Viewer        │
 *  │ (left)  │  MY ASSETS/LIB/TRANSCRIPT│   preview / drop     │
 *  │         ├──────────────── Timeline ──────────────────────┤
 *  └──────────────────────────────────────────────────────────┘
 */
import { useCallback, useState } from 'react';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { useOrchestrator } from './hooks/useOrchestrator.js';
import TopBar from './components/TopBar.jsx';
import AIPanel from './components/AIPanel.jsx';
import AssetsPanel from './components/AssetsPanel.jsx';
import Viewer from './components/Viewer.jsx';
import Timeline from './components/Timeline.jsx';

export default function App() {
  const {
    clips, result, transcript, busy, stage, error, keysReady,
    ingest, transcribe, render,
  } = useOrchestrator();
  const [tab, setTab] = useState('MY ASSETS');

  const needTranscript = useCallback(() => { transcribe(); }, [transcribe]);

  return (
    <div className="flex h-full w-full flex-col bg-panel-900 text-slate-100">
      <TopBar result={result} />

      {(!keysReady || error) && (
        <div className="space-y-1 px-3 pt-2">
          {!keysReady && (
            <Banner icon={<KeyRound className="h-4 w-4" />}>
              Missing API keys. Add your Groq, Gemini &amp; ElevenLabs keys to <code className="text-banana-400">frontend/.env</code>.
            </Banner>
          )}
          {error && (
            <Banner icon={<AlertTriangle className="h-4 w-4" />} tone="error">{error}</Banner>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <AIPanel onSubmit={render} busy={busy} disabled={!keysReady} />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <AssetsPanel
              tab={tab}
              setTab={setTab}
              clips={clips}
              transcript={transcript}
              onUpload={ingest}
              onNeedTranscript={needTranscript}
              keysReady={keysReady}
            />
            <Viewer
              src={result?.previewUrl}
              busy={busy}
              stage={stage}
              onUpload={ingest}
              keysReady={keysReady}
            />
          </div>
          <Timeline result={result} />
        </div>
      </div>
    </div>
  );
}

function Banner({ icon, tone = 'info', children }) {
  const tones = {
    info: 'border-banana-500/40 bg-banana-500/10 text-banana-200',
    error: 'border-red-500/40 bg-red-500/10 text-red-200',
  };
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${tones[tone]}`}>
      {icon}
      <span>{children}</span>
    </div>
  );
}
