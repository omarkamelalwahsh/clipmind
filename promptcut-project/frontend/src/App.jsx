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
import { useCallback, useRef, useState, useEffect } from 'react';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { useOrchestrator } from './hooks/useOrchestrator.js';
import TopBar from './components/TopBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import AIPanel from './components/AIPanel.jsx';
import AssetsPanel from './components/AssetsPanel.jsx';
import Viewer from './components/Viewer.jsx';
import Timeline from './components/Timeline.jsx';

export default function App() {
  const {
    clips, log, result, transcript, busy, stage, progress, error, keysReady,
    activeClip, ingest, selectClip, removeClip, transcribe, render,
    timeline, setTimeline, renderCustomTimeline, audio, setAudio,
    remotionData, generateMotionGraphics,
  } = useOrchestrator();

  // Route motion-graphics / kinetic-typography requests to the Remotion engine;
  // everything else goes to the FFmpeg edit pipeline.
  const smartSubmit = useCallback(
    (prompt, opts) => {
      const p = (prompt || '').toLowerCase();
      const isMotion = /motion graphic|kinetic|typography|animated text|lower.?third|remotion|title card|intro animation/.test(p);
      if (isMotion) generateMotionGraphics(prompt);
      else render(prompt, opts);
    },
    [generateMotionGraphics, render],
  );
  const [tab, setTab] = useState('MY ASSETS');
  const [aiPanelWidth, setAiPanelWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);

  // Shared video ref so Timeline can control playback
  const videoRef = useRef(null);

  const needTranscript = useCallback(() => { transcribe(); }, [transcribe]);

  const startResizing = useCallback((mouseDownEvent) => {
    mouseDownEvent.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (mouseMoveEvent) => {
      if (isResizing) {
        // Offset by 60px due to Sidebar
        const newWidth = mouseMoveEvent.clientX - 60;
        if (newWidth >= 260 && newWidth <= 600) {
          setAiPanelWidth(newWidth);
        }
      }
    },
    [isResizing],
  );

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  // A transcript-only request produces no video — jump the user to the result.
  useEffect(() => {
    if (result?.transcriptOnly) setTab('TRANSCRIPT');
  }, [result]);

  // Viewer source: rendered result takes priority, else show active uploaded clip
  const viewerSrc = result?.previewUrl || activeClip?.url || activeClip?.objectUrl || null;

  return (
    <div className="flex h-full w-full flex-col bg-panel-900 text-slate-100">
      <TopBar result={result} />

      {(!keysReady || error) && (
        <div className="space-y-1.5 px-3 pt-2 animate-slide-up">
          {!keysReady && (
            <Banner icon={<KeyRound className="h-4 w-4" />}>
              Missing API keys. Add your Groq, Gemini &amp; ElevenLabs keys to <code className="rounded bg-banana-500/10 px-1.5 py-0.5 text-banana-400">frontend/.env</code>.
            </Banner>
          )}
          {error && (
            <Banner icon={<AlertTriangle className="h-4 w-4" />} tone="error">{error}</Banner>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <AIPanel
          onSubmit={smartSubmit}
          onUpload={ingest}
          busy={busy}
          disabled={!keysReady}
          log={log}
          stage={stage}
          error={error}
          hasResult={Boolean(result?.previewUrl || result?.transcriptOnly)}
          transcript={result?.transcriptOnly ? transcript : null}
          width={aiPanelWidth}
        />

        {/* Resizable Divider */}
        <div
          onMouseDown={startResizing}
          className={`w-[4px] shrink-0 cursor-col-resize hover:bg-banana-400/80 bg-panel-700/60 transition-colors z-30 ${isResizing ? 'bg-banana-400' : ''}`}
        />

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
              activeClip={activeClip}
              onSelectClip={selectClip}
            />
            <Viewer
              src={viewerSrc}
              busy={busy}
              stage={stage}
              progress={progress}
              onUpload={ingest}
              keysReady={keysReady}
              videoRef={videoRef}
              remotionData={remotionData}
            />
          </div>
          <Timeline
            result={result}
            clips={clips}
            activeClip={activeClip}
            videoRef={videoRef}
            onDeleteClip={removeClip}
            timeline={timeline}
            setTimeline={setTimeline}
            audio={audio}
            setAudio={setAudio}
            onRenderCustomTimeline={renderCustomTimeline}
            src={viewerSrc}
          />
        </div>
      </div>
    </div>
  );
}

function Banner({ icon, tone = 'info', children }) {
  const tones = {
    info: 'border-banana-500/30 bg-banana-500/5 text-banana-200',
    error: 'border-red-500/30 bg-red-500/5 text-red-200',
  };
  return (
    <div className={`flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm shadow-inner-glow ${tones[tone]}`}>
      {icon}
      <span>{children}</span>
    </div>
  );
}
