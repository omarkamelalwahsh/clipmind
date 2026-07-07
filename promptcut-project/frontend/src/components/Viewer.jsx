/**
 * Viewer → Player — ChatCut-style preview panel.
 *
 * Bottom-right control bar:
 *  - Timeline visibility toggle
 *  - Aspect ratio switcher (16:9 / 9:16 / 1:1)
 *  - Subtitle/caption toggle
 *
 * Shares a videoRef with Timeline for synchronized playback controls.
 * When there's no video it acts as a drag-and-drop import zone.
 */
import { useState, useRef, useEffect } from 'react';
import {
  UploadCloud, Rows3, RectangleHorizontal, Subtitles,
  ChevronDown,
} from 'lucide-react';
import RemotionPreview from '../remotion/RemotionPreview.jsx';

const ASPECT_RATIOS = [
  { label: '16:9', value: '16/9' },
  { label: '9:16', value: '9/16' },
  { label: '1:1', value: '1/1' },
];

export default function Viewer({
  src,
  busy,
  stage,
  progress = 0,
  onUpload,
  keysReady,
  videoRef,
  viewerRef,
  remotionData,
  setRemotionData,
  transcript,
  remotionAssets = {},
  showTimeline,
  onToggleTimeline,
}) {
  const [dragOver, setDragOver] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('16/9');
  const [showAspectMenu, setShowAspectMenu] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const aspectRef = useRef(null);

  // Close aspect menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (aspectRef.current && !aspectRef.current.contains(e.target)) setShowAspectMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (keysReady && e.dataTransfer.files?.length) onUpload(e.dataTransfer.files);
  };

  const currentAspectLabel = ASPECT_RATIOS.find((a) => a.value === aspectRatio)?.label || '16:9';

  return (
    <section ref={viewerRef} className="flex min-w-[320px] flex-1 flex-col bg-panel-900 relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-panel-700/40">
        <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Player</span>
      </div>

      {/* Preview Area */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-4">
        {remotionData ? (
          <>
            <div
              className="flex w-full max-w-full items-center justify-center overflow-hidden rounded-xl bg-black shadow-lift animate-fade-in"
              style={{ aspectRatio }}
            >
              <RemotionPreview
                data={remotionData}
                baseVideoUrl={remotionData?.timeline?.videoTrack?.length ? null : src}
                words={transcript?.words || []}
                showCaptions={showSubtitles && Boolean(transcript?.words?.length)}
                videoDurationSec={transcript?.duration || 0}
                assets={remotionAssets}
                videoRef={videoRef}
              />
            </div>
          </>
        ) : src ? (
          <div className="group relative flex max-h-full max-w-full items-center justify-center">
            <video
              ref={videoRef}
              key={src}
              src={src}
              playsInline
              onClick={() => {
                const v = videoRef?.current;
                if (!v) return;
                v.paused ? v.play() : v.pause();
              }}
              className="max-h-full max-w-full cursor-pointer rounded-xl bg-black shadow-lift animate-fade-in"
              style={{ aspectRatio }}
            />
            {busy && <BusyOverlay stage={stage} progress={progress} />}
          </div>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`flex h-full w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-300 p-8 ${
              dragOver
                ? 'border-banana-400 bg-banana-500/5 shadow-glow-banana'
                : 'border-panel-700 hover:border-panel-600'
            }`}
          >
            {busy ? (
              <BusyOverlay stage={stage} progress={progress} inline />
            ) : (
              <>
                <UploadCloud className="h-12 w-12 text-banana-400/90 animate-float" />
                <span className="mt-4 text-sm font-bold text-slate-100 tracking-wide">Drop media here</span>
                <span className="mt-1.5 text-xs text-slate-500 text-center max-w-[240px] leading-relaxed">
                  Drag & drop your video or image files to start editing
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom-right Control Bar */}
      <div className="absolute bottom-3 right-4 flex items-center gap-1 z-20">
        {/* Timeline Toggle */}
        <ControlBtn
          icon={<Rows3 className="h-3.5 w-3.5" />}
          title={showTimeline ? 'Hide Timeline' : 'Show Timeline'}
          active={showTimeline}
          onClick={onToggleTimeline}
        />

        {/* Aspect Ratio */}
        <div className="relative" ref={aspectRef}>
          <button
            onClick={() => setShowAspectMenu((v) => !v)}
            title="Aspect Ratio"
            className="flex items-center gap-1 rounded-lg bg-panel-800/80 backdrop-blur-sm border border-panel-700/60 px-2 py-1.5 text-[10px] font-semibold text-slate-300 hover:bg-panel-750 transition-colors"
          >
            <RectangleHorizontal className="h-3.5 w-3.5 text-slate-400" />
            {currentAspectLabel}
            <ChevronDown className="h-3 w-3 text-slate-500" />
          </button>
          {showAspectMenu && (
            <div className="absolute bottom-full right-0 mb-2 z-50 min-w-[100px] rounded-xl border border-panel-700 bg-panel-800/95 backdrop-blur-md p-1.5 shadow-2xl animate-fade-in">
              {ASPECT_RATIOS.map((ar) => (
                <button
                  key={ar.value}
                  onClick={() => { setAspectRatio(ar.value); setShowAspectMenu(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    aspectRatio === ar.value
                      ? 'bg-banana-500/10 text-banana-400'
                      : 'text-slate-300 hover:bg-panel-750'
                  }`}
                >
                  {ar.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Subtitles Toggle */}
        <ControlBtn
          icon={<Subtitles className="h-3.5 w-3.5" />}
          title={showSubtitles ? 'Hide Subtitles' : 'Show Subtitles'}
          active={showSubtitles}
          onClick={() => setShowSubtitles((v) => !v)}
        />
      </div>
    </section>
  );
}

function ControlBtn({ icon, title, active, onClick }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-lg backdrop-blur-sm border transition-colors ${
        active
          ? 'bg-banana-500/10 border-banana-500/30 text-banana-400'
          : 'bg-panel-800/80 border-panel-700/60 text-slate-400 hover:text-slate-200 hover:bg-panel-750'
      }`}
    >
      {icon}
    </button>
  );
}

function BusyOverlay({ stage, progress = 0, inline }) {
  const wrapperClass = inline
    ? 'flex flex-col items-center justify-center'
    : 'absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-panel-900/80 backdrop-blur-sm animate-fade-in';

  return (
    <div className={wrapperClass}>
      <div className="relative">
        <div className="h-12 w-12 rounded-full border-2 border-banana-500/30" />
        <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-banana-400" />
      </div>
      <span className="mt-4 text-sm font-semibold capitalize text-banana-200">{stage}…</span>
      <div className="mt-3.5 w-48 flex flex-col items-center gap-1.5 animate-fade-in">
        <div className="h-1.5 w-full bg-panel-800 rounded-full overflow-hidden border border-panel-700">
          <div
            className="h-full bg-banana-400 transition-all duration-300 shadow-[0_0_8px_rgba(250,204,21,0.5)]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <span className="text-[10px] font-bold text-banana-400 tabular-nums">
          {Math.round(progress * 100)}%
        </span>
      </div>
      <span className="mt-2.5 text-[11px] text-slate-400">AI is editing your video — this can take a minute</span>
    </div>
  );
}
