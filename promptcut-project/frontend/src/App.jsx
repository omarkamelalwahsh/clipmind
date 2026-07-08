/**
 * App.jsx — the Master Dashboard (ChatCut-style 5-panel layout).
 *
 * Matches ChatCut's documented sections:
 *
 *  ┌────────────────────── Menu (TopBar) ─────────────────────┐
 *  │  Agent (AI Panel)  │   Media (Assets)   │    Player      │
 *  │  resizable left    │   fixed 280px      │    flex-1      │
 *  │                    │                    │                │
 *  │                    ├────────── Timeline ─────────────────┤
 *  └─────────────────────────────────────────────────────────┘
 *
 * No Sidebar — ChatCut doesn't have one. The Agent panel serves as
 * the left column. All editing logic lives in useOrchestrator.
 */
import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { useOrchestrator } from './hooks/useOrchestrator.js';
import TopBar from './components/TopBar.jsx';
import AIPanel from './components/AIPanel.jsx';
import AssetsPanel from './components/AssetsPanel.jsx';
import Viewer from './components/Viewer.jsx';
import Timeline from './components/Timeline.jsx';

export default function App() {
  const {
    clips, log, result, transcript, busy, stage, progress, error, keysReady,
    activeClip, ingest, selectClip, removeClip, transcribe, render,
    timeline, setTimeline, renderCustomTimeline, audio, setAudio,
    remotionData, setRemotionData, generateMotionGraphics,
  } = useOrchestrator();

  // Routing:
  //  • Explicit motion keywords → Remotion motion-graphics engine.
  //  • A generative "make me a video / promo / scenes" request with NO uploaded
  //    footage → Remotion (there's nothing to FFmpeg-edit).
  //  • Otherwise (editing uploaded footage) → the FFmpeg pipeline.
  const smartSubmit = useCallback(
    (prompt, opts) => {
      const p = (prompt || '').toLowerCase();
      const hasVideo = clips.some((c) => c.type === 'video');
      const motionWords = /motion graphic|kinetic|typography|animated text|lower.?third|remotion|title card|intro animation|pulse wave|hud ring|scene\b/.test(p);
      const generativeVideo = /(make|create|generate|build|produce|design)\b.*(video|promo|ad|advert|reel|short|intro|explainer|montage|animation|scene|teaser|trailer)/.test(p);
      if (motionWords || (!hasVideo && generativeVideo)) generateMotionGraphics(prompt);
      else render(prompt, opts);
    },
    [generateMotionGraphics, render, clips],
  );

  const [tab, setTab] = useState('MEDIA');
  const [aiPanelWidth, setAiPanelWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const [showTimeline, setShowTimeline] = useState(true);

  // Shared video ref so Timeline can control playback
  const videoRef = useRef(null);
  const viewerRef = useRef(null);

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
        const newWidth = mouseMoveEvent.clientX;
        if (newWidth >= 260 && newWidth <= 500) {
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

  // Asset map for the Remotion compositor: upload name → local Blob URL, so
  // videoTrack items of type "user_upload" resolve without any server.
  const remotionAssets = useMemo(() => {
    const map = {};
    for (const c of clips) {
      const url = c.url || c.objectUrl;
      if (url) map[c.name] = url;
    }
    return map;
  }, [clips]);

  // Scene isolation: clicking a scene in MEDIA previews just that scene alone.
  const [focusedSceneId, setFocusedSceneId] = useState(null);
  const scenes = remotionData?.timeline?.scenes || [];
  useEffect(() => { setFocusedSceneId(null); }, [remotionData]);

  const previewRemotionData = useMemo(() => {
    if (!remotionData || !focusedSceneId) return remotionData;
    const scene = scenes.find((s) => (s.sceneId || s.id) === focusedSceneId);
    if (!scene) return remotionData;
    const off = scene.startFrame;
    const rebased = {
      ...scene,
      startFrame: 0,
      endFrame: scene.endFrame - off,
      motionGraphics: (scene.motionGraphics || []).map((m) => ({
        ...m,
        startFrame: Math.max(0, (m.startFrame ?? off) - off),
        endFrame: (m.endFrame ?? scene.endFrame) - off,
      })),
    };
    return {
      ...remotionData,
      projectSettings: { ...remotionData.projectSettings, totalDurationInFrames: rebased.endFrame },
      timeline: { ...remotionData.timeline, scenes: [rebased] },
    };
  }, [remotionData, focusedSceneId, scenes]);

  return (
    <div className="flex h-full w-full flex-col bg-panel-900 text-slate-100">
      {/* ─── Menu Bar ─── */}
      <TopBar result={result} />

      {/* ─── Banners ─── */}
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

      {/* ─── Main Content: Agent | Media | Player ─── */}
      <div className="flex min-h-0 flex-1">
        {/* Agent Panel (resizable) */}
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
          onNeedTranscript={needTranscript}
        />

        {/* Resizable Divider */}
        <div
          onMouseDown={startResizing}
          className={`w-[4px] shrink-0 cursor-col-resize hover:bg-banana-400/80 bg-panel-700/60 transition-colors z-30 ${isResizing ? 'bg-banana-400' : ''}`}
        />

        {/* Media + Player + Timeline */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            {/* Media Panel */}
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
              onDeleteClip={removeClip}
              remotionData={remotionData}
              setRemotionData={setRemotionData}
              scenes={scenes}
              focusedSceneId={focusedSceneId}
              onSelectScene={setFocusedSceneId}
            />

            {/* Player */}
            <Viewer
              src={viewerSrc}
              busy={busy}
              stage={stage}
              progress={progress}
              onUpload={ingest}
              keysReady={keysReady}
              videoRef={videoRef}
              viewerRef={viewerRef}
              remotionData={previewRemotionData}
              setRemotionData={setRemotionData}
              transcript={transcript}
              remotionAssets={remotionAssets}
              focusedSceneLabel={focusedSceneId ? `Scene ${scenes.findIndex((s) => (s.sceneId || s.id) === focusedSceneId) + 1}` : null}
              onClearFocusedScene={() => setFocusedSceneId(null)}
              showTimeline={showTimeline}
              onToggleTimeline={() => setShowTimeline((v) => !v)}
            />
          </div>

          {/* Timeline (toggleable from Player controls) */}
          {showTimeline && (
            <Timeline
              result={result}
              clips={clips}
              activeClip={activeClip}
              videoRef={videoRef}
              viewerRef={viewerRef}
              onDeleteClip={removeClip}
              timeline={timeline}
              setTimeline={setTimeline}
              audio={audio}
              setAudio={setAudio}
              onRenderCustomTimeline={renderCustomTimeline}
              src={viewerSrc}
              remotionData={remotionData}
              setRemotionData={setRemotionData}
            />
          )}
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
