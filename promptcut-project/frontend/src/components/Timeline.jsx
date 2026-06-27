/**
 * Timeline — the bottom dock. Shows uploaded clips immediately (like ChatCut)
 * and overlays the AI-rendered timeline + audio when available.
 * V1 = video track, A1 = audio track.
 *
 * Connected to the Viewer's <video> element via videoRef for:
 *  - Play / Pause
 *  - Live timecode display
 *  - Playhead scrubbing
 *  - Zoom that scales the track width
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Scissors, Link2, Mic, ChevronDown,
  Play, Pause, ZoomOut, ZoomIn, Maximize2, MoveHorizontal, LayoutGrid,
  Eye, EyeOff, Volume2, VolumeX, Trash2, Bug, SkipBack, SkipForward,
} from 'lucide-react';

export default function Timeline({ result, clips = [], activeClip, videoRef }) {
  const [zoom, setZoom] = useState(50);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Track visibility/mute state
  const [v1Visible, setV1Visible] = useState(true);
  const [a1Muted, setA1Muted] = useState(false);

  // If we have a render result, show the rendered timeline.
  // Otherwise show the raw uploaded clips.
  const hasResult = result && (result.timeline?.length || result.audio?.length);
  const { timeline = [], audio = [] } = result || {};

  // Calculate total duration from either render result or raw clips
  const total = hasResult
    ? (timeline.reduce((m, s) => Math.max(m, s.end), 0) ||
       audio.reduce((m, a) => Math.max(m, (a.start || 0) + (a.duration || 0)), 0) || 1)
    : (clips.reduce((m, c) => Math.max(m, c.duration || 0), 0) || 1);

  // Generate dynamic ruler marks based on total duration
  const rulerMarks = generateRulerMarks(total);

  // Zoom scale factor: 50 = 100% (1x), 100 = 200% (2x), 10 = 20%
  const zoomScale = zoom / 50;

  // ─── Video playback sync ───
  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;

    const onTimeUpdate = () => {
      if (!isScrubbing) setCurrentTime(video.currentTime);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
    };
  }, [videoRef, isScrubbing]);

  // Sync mute state
  useEffect(() => {
    const video = videoRef?.current;
    if (video) video.muted = a1Muted;
  }, [a1Muted, videoRef]);

  const togglePlay = useCallback(() => {
    const video = videoRef?.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }, [videoRef]);

  const skipBack = useCallback(() => {
    const video = videoRef?.current;
    if (!video) return;
    video.currentTime = Math.max(0, video.currentTime - 5);
  }, [videoRef]);

  const skipForward = useCallback(() => {
    const video = videoRef?.current;
    if (!video) return;
    video.currentTime = Math.min(video.duration || total, video.currentTime + 5);
  }, [videoRef, total]);

  const goToStart = useCallback(() => {
    const video = videoRef?.current;
    if (!video) return;
    video.currentTime = 0;
    setCurrentTime(0);
  }, [videoRef]);

  // Ruler click to seek
  const handleRulerClick = useCallback((e) => {
    const video = videoRef?.current;
    if (!video) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    const seekTime = pct * total;
    video.currentTime = seekTime;
    setCurrentTime(seekTime);
  }, [videoRef, total]);

  // Playhead position as percentage
  const playheadPct = total > 0 ? (currentTime / total) * 100 : 0;

  const hasVideo = videoRef?.current?.src;

  return (
    <div className="flex h-[260px] shrink-0 flex-col border-t border-panel-600/60 bg-panel-850">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-panel-600/40 px-3 py-1.5">
        {/* Left — editing tools */}
        <div className="flex items-center gap-0.5">
          <Tool title="Add"><Plus className="h-4 w-4" /></Tool>
          <Tool title="Cut"><Scissors className="h-4 w-4" /></Tool>
          <Tool title="Link"><Link2 className="h-4 w-4" /></Tool>
          <Tool title="Record"><Mic className="h-4 w-4" /></Tool>
          <Tool title="More"><ChevronDown className="h-4 w-4" /></Tool>
        </div>

        {/* Center — transport controls */}
        <div className="flex items-center gap-1.5 text-sm text-slate-300">
          <button
            onClick={goToStart}
            title="Go to start"
            className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-panel-700 hover:text-slate-200"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={togglePlay}
            disabled={!hasVideo}
            title={isPlaying ? 'Pause' : 'Play'}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-panel-700/80 text-slate-200 transition-all hover:bg-panel-600 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={skipForward}
            title="Skip forward 5s"
            className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-panel-700 hover:text-slate-200"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>
          <span className="ml-2 font-mono text-xs tabular-nums text-slate-400">
            {fmt(currentTime)} / {fmt(total)}
          </span>
        </div>

        {/* Right — zoom + layout */}
        <div className="flex items-center gap-1">
          <Tool title="Zoom out" onClick={() => setZoom((z) => Math.max(10, z - 10))}><ZoomOut className="h-4 w-4" /></Tool>
          <input type="range" min="10" max="100" value={zoom} onChange={(e) => setZoom(+e.target.value)}
            title={`Zoom: ${Math.round(zoomScale * 100)}%`}
            className="w-20" />
          <Tool title="Zoom in" onClick={() => setZoom((z) => Math.min(100, z + 10))}><ZoomIn className="h-4 w-4" /></Tool>
          <Tool title="Fit to window" onClick={() => setZoom(50)}><MoveHorizontal className="h-4 w-4" /></Tool>
          <Tool title="Snap"><LayoutGrid className="h-4 w-4" /></Tool>
          <span className="rounded-md bg-panel-700/80 px-2 py-0.5 text-[10px] font-medium text-slate-500">OFF</span>
          <Tool title="Fullscreen"><Maximize2 className="h-4 w-4" /></Tool>
        </div>
      </div>

      {/* Ruler — clickable for seeking */}
      <div
        className="relative flex h-6 shrink-0 items-center border-b border-panel-600/40 bg-panel-900/30 pl-24 text-[10px] text-slate-500 cursor-pointer select-none"
        onClick={handleRulerClick}
      >
        <div className="flex flex-1" style={{ width: `${zoomScale * 100}%`, minWidth: '100%' }}>
          {rulerMarks.map((m) => (
            <span key={m} className="flex-1">{m}</span>
          ))}
        </div>
        {/* Playhead line */}
        <div
          className="absolute bottom-0 top-0 w-px bg-banana-400 shadow-[0_0_6px_rgba(234,179,8,0.4)] transition-[left] duration-75"
          style={{ left: `calc(96px + ${playheadPct}% * (100% - 96px) / 100)` }}
        />
        {/* Playhead triangle */}
        <div
          className="absolute top-0 h-0 w-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-banana-400 transition-[left] duration-75"
          style={{ left: `calc(96px + ${playheadPct}% * (100% - 96px) / 100 - 5px)` }}
        />
      </div>

      {/* Tracks */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto">
        {/* V1 — Video Track */}
        <Track
          label="V1"
          badgeColor="bg-banana-500 text-panel-900"
          isVisible={v1Visible}
          onToggleVisibility={() => setV1Visible((v) => !v)}
          isMuted={false}
          onToggleMute={() => {}}
        >
          <div className="flex flex-1 items-center gap-1 p-1.5" style={{ width: `${zoomScale * 100}%`, minWidth: '100%' }}>
            {hasResult ? (
              timeline.map((s) => (
                <Block key={s.id} widthPct={(s.duration / total) * 100}
                  title={`${s.sourceName} • ${s.duration.toFixed(2)}s${s.note ? ` • ${s.note}` : ''}`}
                  className="bg-banana-500/70 text-panel-900"
                  thumbnail={null}>
                  {s.sourceName}
                </Block>
              ))
            ) : clips.length > 0 ? (
              clips.filter(c => c.type !== 'audio').map((c) => (
                <Block key={c.id} widthPct={Math.max(15, (c.duration / total) * 100)}
                  title={`${c.name} • ${c.duration?.toFixed(1) || '?'}s`}
                  className="bg-emerald-500/70 text-white"
                  thumbnail={c.thumbnail}>
                  {c.name}
                </Block>
              ))
            ) : (
              <span className="px-3 text-[11px] text-slate-600 italic">Video 1</span>
            )}
          </div>
        </Track>

        {/* A1 — Audio Track */}
        <Track
          label="A1"
          badgeColor="bg-sky-500 text-white"
          isVisible={true}
          onToggleVisibility={() => {}}
          isMuted={a1Muted}
          onToggleMute={() => setA1Muted((m) => !m)}
        >
          <div className="flex flex-1 items-center gap-1 p-1.5" style={{ width: `${zoomScale * 100}%`, minWidth: '100%' }}>
            {hasResult ? (
              audio.length === 0
                ? <span className="px-3 text-[11px] text-slate-600 italic">no generated audio</span>
                : audio.map((a) => (
                  <Block key={a.id} widthPct={(a.duration / total) * 100} offsetPct={((a.start || 0) / total) * 100}
                    title={`${a.kind}: ${a.prompt} • ${a.duration?.toFixed(1)}s @vol ${a.volume}`}
                    className="bg-sky-500/60 text-white">
                    {a.kind}
                  </Block>
                ))
            ) : clips.length > 0 ? (
              // Show audio as a real block matching the video duration
              clips.filter(c => c.type !== 'audio').map((c) => (
                <Block key={`audio-${c.id}`} widthPct={Math.max(15, (c.duration / total) * 100)}
                  title={`Audio • ${c.name} • ${c.duration?.toFixed(1) || '?'}s`}
                  className="bg-sky-500/50 text-white">
                  <span className="flex items-center gap-1">
                    <Volume2 className="h-3 w-3" />
                    {c.name}
                  </span>
                </Block>
              )).concat(
                // Also show any standalone audio files
                clips.filter(c => c.type === 'audio').map((c) => (
                  <Block key={c.id} widthPct={Math.max(15, (c.duration / total) * 100)}
                    title={`${c.name} • ${c.duration?.toFixed(1) || '?'}s`}
                    className="bg-violet-500/50 text-white">
                    {c.name}
                  </Block>
                ))
              )
            ) : (
              <span className="px-3 text-[11px] text-slate-600 italic">Audio 1</span>
            )}
          </div>
        </Track>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-panel-600/40 px-3 py-1">
        <span className="text-[10px] text-slate-600">
          {clips.length > 0 && `${clips.length} clip${clips.length > 1 ? 's' : ''} • `}
          Zoom: {Math.round(zoomScale * 100)}%
        </span>
        <Bug className="h-3.5 w-3.5 text-slate-700 hover:text-slate-500 transition-colors cursor-pointer" />
      </div>
    </div>
  );
}

function Track({ label, badgeColor, children, isVisible, onToggleVisibility, isMuted, onToggleMute }) {
  return (
    <div className={`flex items-stretch border-b border-panel-700/60 ${!isVisible ? 'opacity-40' : ''}`}>
      <div className="flex w-24 shrink-0 items-center gap-1.5 bg-panel-800 px-2.5 py-3 border-r border-panel-700/40">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${badgeColor}`}>{label}</span>
        <button onClick={onToggleVisibility} title={isVisible ? 'Hide' : 'Show'} className="transition-colors hover:text-slate-300">
          {isVisible
            ? <Eye className="h-3 w-3 text-slate-600 hover:text-slate-400 cursor-pointer" />
            : <EyeOff className="h-3 w-3 text-slate-500 cursor-pointer" />
          }
        </button>
        <button onClick={onToggleMute} title={isMuted ? 'Unmute' : 'Mute'} className="transition-colors hover:text-slate-300">
          {isMuted
            ? <VolumeX className="h-3 w-3 text-red-400 cursor-pointer" />
            : <Volume2 className="h-3 w-3 text-slate-600 hover:text-slate-400 cursor-pointer" />
          }
        </button>
        <Trash2 className="h-3 w-3 text-slate-600 hover:text-red-400 transition-colors cursor-pointer" />
      </div>
      <div className="relative flex flex-1 items-center overflow-hidden bg-panel-900/20">
        {children}
      </div>
    </div>
  );
}

function Block({ widthPct, offsetPct, title, className = '', thumbnail, children }) {
  return (
    <div title={title}
      style={{ width: `${Math.max(5, widthPct)}%`, marginLeft: offsetPct ? `${offsetPct}%` : undefined }}
      className={`relative flex h-10 items-center overflow-hidden rounded-md text-[11px] font-medium whitespace-nowrap transition-all hover:brightness-110 cursor-default ${className}`}>
      {/* Thumbnail strip background for video blocks */}
      {thumbnail && (
        <div className="absolute inset-0 flex">
          {Array.from({ length: Math.max(1, Math.ceil(widthPct / 8)) }).map((_, i) => (
            <img key={i} src={thumbnail} alt="" className="h-full w-auto shrink-0 object-cover opacity-70" />
          ))}
        </div>
      )}
      <span className="relative z-10 truncate px-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{children}</span>
    </div>
  );
}

function Tool({ children, title, onClick }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-panel-700 hover:text-slate-200"
    >
      {children}
    </button>
  );
}

function fmt(seconds) {
  const s = Math.max(0, seconds || 0);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(Math.floor(s % 60)).padStart(2, '0');
  const cs = String(Math.floor((s % 1) * 100)).padStart(2, '0');
  if (h > 0) return `${h}:${mm}:${ss}.${cs}`;
  return `${mm}:${ss}.${cs}`;
}

/** Generate evenly-spaced ruler marks based on total duration */
function generateRulerMarks(total) {
  const count = 5;
  const marks = [];
  for (let i = 0; i < count; i++) {
    const t = (total / count) * i;
    const h = Math.floor(t / 3600);
    const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
    const s = String(Math.floor(t % 60)).padStart(2, '0');
    marks.push(h > 0 ? `${h}:${m}:${s}` : `00:${m}:${s}`);
  }
  return marks;
}
