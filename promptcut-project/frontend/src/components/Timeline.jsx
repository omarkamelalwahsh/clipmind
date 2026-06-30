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
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Scissors, Split, Copy, Crop, Type, Heading,
  SkipBack, ChevronsLeft, Play, Pause, ChevronsRight, SkipForward,
  ChevronDown, LayoutGrid, List, Search, Maximize2,
  Eye, EyeOff, Volume2, VolumeX, Trash2, Bug, Sparkles
} from 'lucide-react';

export default function Timeline({
  result,
  clips = [],
  activeClip,
  videoRef,
  onDeleteClip,
  timeline = [],
  setTimeline,
  audio = [],
  setAudio,
  onRenderCustomTimeline,
  src,
}) {
  const [zoom, setZoom] = useState(50);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Track visibility/mute state
  const [v1Visible, setV1Visible] = useState(true);
  const [a1Muted, setA1Muted] = useState(false);
  const [snap, setSnap] = useState(false);

  const [selectedSegmentId, setSelectedSegmentId] = useState(null);
  const [hasPendingEdits, setHasPendingEdits] = useState(false);

  const handleTimelineVolumeChange = useCallback((id, newVolume) => {
    const updated = timeline.map(s => s.id === id ? { ...s, volume: newVolume } : s);
    setTimeline(updated);
    setHasPendingEdits(true);
  }, [timeline, setTimeline]);

  const handleSegmentTrim = useCallback((id, newSourceStart, newDuration) => {
    const updated = timeline.map(s => {
      if (s.id === id) {
        return {
          ...s,
          sourceStart: Math.max(0, newSourceStart),
          duration: Math.max(0.1, newDuration),
          end: s.start + newDuration,
        };
      }
      return s;
    });
    setTimeline(layoutSegments(updated));
    setHasPendingEdits(true);
  }, [timeline, setTimeline]);

  const handleAudioVolumeChange = useCallback((id, newVolume) => {
    if (!setAudio) return;
    const updated = audio.map(a => a.id === id ? { ...a, volume: newVolume } : a);
    setAudio(updated);
    setHasPendingEdits(true);
  }, [audio, setAudio]);

  // Calculate total duration from either timeline or raw clips
  const total = timeline.length > 0
    ? (timeline.reduce((m, s) => Math.max(m, s.end), 0) || 1)
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

    // Sync initial state
    setIsPlaying(!video.paused);
    setCurrentTime(video.currentTime);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
    };
  }, [videoRef, isScrubbing, src]);

  // Sync mute state
  useEffect(() => {
    const video = videoRef?.current;
    if (video) video.muted = a1Muted;
  }, [a1Muted, videoRef]);

  // Sync V1 visibility → hide/show the video in the Viewer
  useEffect(() => {
    const video = videoRef?.current;
    if (video) video.style.visibility = v1Visible ? 'visible' : 'hidden';
  }, [v1Visible, videoRef]);

  const toggleFullscreen = useCallback(() => {
    const video = videoRef?.current;
    if (!video) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else video.requestFullscreen?.();
  }, [videoRef]);

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

  // Playhead seeking and scrubbing math
  const handleSeek = useCallback((e) => {
    const video = videoRef?.current;
    if (!video) return;
    const ruler = document.getElementById('timeline-ruler');
    if (!ruler) return;
    const rect = ruler.getBoundingClientRect();
    const headerWidth = 96; // matches pl-24
    const trackWidth = rect.width - headerWidth;
    const x = e.clientX - rect.left - headerWidth;
    const pct = Math.max(0, Math.min(1, x / trackWidth));
    const seekTime = pct * total;
    video.currentTime = seekTime;
    setCurrentTime(seekTime);
  }, [videoRef, total]);

  const handleRulerMouseDown = (e) => {
    setIsScrubbing(true);
    handleSeek(e);
  };

  useEffect(() => {
    if (!isScrubbing) return;
    const handleMouseMove = (e) => {
      handleSeek(e);
    };
    const handleMouseUp = () => {
      setIsScrubbing(false);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isScrubbing, handleSeek]);

  // Split the segment at the current playhead
  const handleCut = useCallback(() => {
    if (!timeline || !timeline.length) {
      alert("التايم لاين فارغ. يرجى إضافة فيديو أولاً.");
      return;
    }

    // Find segment under the playhead to split
    const target = timeline.find((s) => currentTime >= s.start && currentTime <= s.end);
    if (!target) {
      alert("يرجى وضع مؤشر التشغيل (الخط الرأسي الأصفر) داخل كتلة الفيديو لقصها.");
      return;
    }

    const splitPoint = currentTime - target.start;
    // Don't split if it's too close to the edges (within 0.05s) to avoid zero-duration segments
    if (splitPoint < 0.05 || splitPoint > target.duration - 0.05) {
      alert("لا يمكن القص عند حافة المقطع تماماً. حرك مؤشر التشغيل قليلاً داخل المقطع.");
      return;
    }

    const index = timeline.indexOf(target);
    const part1 = {
      ...target,
      id: `${target.id}-part1-${Date.now()}`,
      duration: splitPoint,
      end: target.start + splitPoint,
    };
    const part2 = {
      ...target,
      id: `${target.id}-part2-${Date.now()}`,
      sourceStart: (target.sourceStart || 0) + splitPoint,
      duration: target.duration - splitPoint,
      start: target.start + splitPoint,
    };

    const newTimeline = [...timeline];
    newTimeline.splice(index, 1, part1, part2);
    
    // Layout and update
    const laidOut = layoutSegments(newTimeline);
    setTimeline(laidOut);
    setHasPendingEdits(true);
    setSelectedSegmentId(part2.id); // select the second part
  }, [timeline, currentTime, setTimeline]);

  // Delete the selected segment
  const handleDelete = useCallback(() => {
    if (!timeline || !timeline.length) return;

    let target = null;
    if (selectedSegmentId) {
      target = timeline.find((s) => s.id === selectedSegmentId);
    } else {
      target = timeline.find((s) => currentTime >= s.start && currentTime <= s.end);
    }

    if (!target) return;

    const newTimeline = timeline.filter((s) => s.id !== target.id);
    const laidOut = layoutSegments(newTimeline);
    setTimeline(laidOut);
    setHasPendingEdits(true);
    setSelectedSegmentId(null);
  }, [timeline, selectedSegmentId, currentTime, setTimeline]);

  // Apply edits (trigger FFmpeg render)
  const handleApplyEdits = useCallback(() => {
    if (!hasPendingEdits) return;
    onRenderCustomTimeline?.(timeline);
    setHasPendingEdits(false);
  }, [hasPendingEdits, onRenderCustomTimeline, timeline]);

  // Playhead position as percentage
  const playheadPct = total > 0 ? (currentTime / total) * 100 : 0;

  const hasVideo = Boolean(activeClip || result?.previewUrl || clips.length > 0);

  return (
    <div className="flex h-[260px] shrink-0 flex-col border-t border-panel-700 bg-panel-850">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-panel-700/60 px-4 py-2">
        {/* Left — editing tools */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleCut}
            title="Cut (Split block at playhead)"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-banana-400 text-panel-950 font-bold hover:bg-banana-300 active:scale-95 shadow-glow-banana-sm transition-all"
          >
            <Scissors className="h-4 w-4" />
          </button>
          <Tool title="Split"><Split className="h-4 w-4 text-slate-400 hover:text-slate-200" /></Tool>
          <button
            onClick={handleDelete}
            title="Delete Selected Block"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-panel-750 hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <Tool title="Copy"><Copy className="h-4 w-4 text-slate-400 hover:text-slate-200" /></Tool>
          <Tool title="Crop Select"><Crop className="h-4 w-4 text-slate-400 hover:text-slate-200" /></Tool>
          <Tool title="Text"><Type className="h-4 w-4 text-slate-400 hover:text-slate-200" /></Tool>
          <Tool title="Overlay text"><Heading className="h-4 w-4" /></Tool>
          
          {hasPendingEdits && (
            <button
              onClick={handleApplyEdits}
              className="ml-4 flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-banana-400 to-banana-500 px-3 py-1.5 text-[11px] font-semibold text-panel-950 shadow-glow-banana-sm hover:brightness-110 active:scale-[0.97] animate-pulse"
            >
              Apply Edits
            </button>
          )}
        </div>

        {/* Center — transport controls */}
        <div className="flex items-center gap-3 text-slate-300">
          <button onClick={goToStart} title="Go to start" className="text-slate-500 hover:text-slate-300 transition-colors">
            <SkipBack className="h-4 w-4" />
          </button>
          <button onClick={skipBack} title="Scan back" className="text-slate-500 hover:text-slate-300 transition-colors">
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button
            onClick={togglePlay}
            disabled={!hasVideo}
            title={isPlaying ? 'Pause' : 'Play'}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700/60 hover:bg-slate-600 text-white transition-all disabled:opacity-35 disabled:cursor-not-allowed"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button onClick={skipForward} title="Scan forward" className="text-slate-500 hover:text-slate-300 transition-colors">
            <ChevronsRight className="h-4 w-4" />
          </button>
          <button onClick={skipForward} title="Skip forward" className="text-slate-500 hover:text-slate-300 transition-colors">
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        {/* Right — snapping + zoom */}
        <div className="flex items-center gap-3">
          {/* Snapping OFF/ON Switch */}
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span>Snapping</span>
            <button
              onClick={() => setSnap((s) => !s)}
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border transition-colors ${
                snap
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-panel-800 border-panel-700 text-slate-400 hover:border-panel-600'
              }`}
            >
              {snap ? 'ON' : 'OFF'}
            </button>
          </div>

          <Search className="h-4 w-4 text-slate-500" />
          <input type="range" min="10" max="100" value={zoom} onChange={(e) => setZoom(+e.target.value)}
            title={`Zoom: ${Math.round(zoomScale * 100)}%`}
            className="w-20" />
          <button onClick={toggleFullscreen} title="Fullscreen" className="text-slate-500 hover:text-slate-300 transition-colors">
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Ruler — clickable/scrubbable for seeking */}
      <div
        id="timeline-ruler"
        className="relative flex h-6 shrink-0 items-center border-b border-panel-700 bg-panel-950 text-[10px] text-slate-500 cursor-pointer select-none overflow-hidden"
        onMouseDown={handleRulerMouseDown}
      >
        <div className="w-24 shrink-0 flex items-center justify-center border-r border-panel-700 bg-panel-950 h-full font-mono text-[9px] text-slate-600 font-bold">
          00:00:00
        </div>
        <div className="flex flex-1 pl-4" style={{ width: `${zoomScale * 100}%`, minWidth: '100%' }}>
          {rulerMarks.map((m, i) => (
            <span key={i} className="flex-1">{m}</span>
          ))}
        </div>
        
        {/* Playhead line */}
        <div
          className="absolute bottom-0 top-0 w-px bg-banana-400 shadow-[0_0_6px_rgba(234,179,8,0.5)] transition-[left] duration-75"
          style={{ left: `calc(96px + (100% - 96px) * ${playheadPct} / 100)` }}
        />
        {/* Playhead handle (yellow oval pill) */}
        <div
          className="absolute top-0 h-4 w-2 rounded bg-banana-400 transition-[left] duration-75 shadow-glow-banana-sm"
          style={{ left: `calc(96px + (100% - 96px) * ${playheadPct} / 100 - 4px)` }}
        />
      </div>

      {/* Tracks */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto relative">
        
        {/* Sparkle design watermark in background */}
        <Sparkles className="absolute right-10 bottom-6 h-16 w-16 text-panel-700/10 pointer-events-none select-none" />

        {/* V1 — Video Track */}
        <Track
          label="V1"
          badgeColor="bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20"
          isVisible={v1Visible}
          onToggleVisibility={() => setV1Visible((v) => !v)}
          isMuted={false}
          onToggleMute={() => {}}
          onDelete={
            onDeleteClip
              ? () => clips.filter((c) => c.type !== 'audio').forEach((c) => onDeleteClip(c.id))
              : undefined
          }
        >
          <div className="flex flex-1 items-center gap-1 p-1.5" style={{ width: `${zoomScale * 100}%`, minWidth: '100%' }}>
            {timeline.length > 0 ? (
              timeline.map((s) => {
                const isSelected = selectedSegmentId === s.id;
                return (
                  <Block
                    key={s.id}
                    widthPct={(s.duration / total) * 100}
                    title={`${s.sourceName} • ${s.duration.toFixed(2)}s`}
                    onClick={() => setSelectedSegmentId(s.id)}
                    className={`cursor-pointer border transition-all ${
                      isSelected
                        ? 'border-banana-400 bg-panel-750 shadow-glow-banana-sm ring-1 ring-banana-400/30'
                        : 'border-panel-700 bg-panel-800 hover:border-panel-600 text-slate-300'
                    }`}
                    thumbnail={s.thumbnail}
                    sourceStart={s.sourceStart}
                    duration={s.duration}
                    maxDuration={clips.find((c) => c.id === s.sourceId)?.duration || s.duration}
                    onTrim={(newStart, newDur) => handleSegmentTrim(s.id, newStart, newDur)}
                  >
                    {s.sourceName}
                  </Block>
                );
              })
            ) : (
              <span className="px-3 text-[11px] text-slate-600 italic">Video 1</span>
            )}
          </div>
        </Track>

        {/* A1 — Audio Track */}
        <Track
          label="A1"
          badgeColor="bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20"
          isVisible={true}
          onToggleVisibility={() => {}}
          isMuted={a1Muted}
          onToggleMute={() => setA1Muted((m) => !m)}
        >
          <div className="flex flex-1 items-center gap-1 p-1.5" style={{ width: `${zoomScale * 100}%`, minWidth: '100%' }}>
            {audio.length > 0 ? (
              audio.map((a) => (
                <Block
                  key={a.id}
                  widthPct={(a.duration / total) * 100}
                  offsetPct={((a.start || 0) / total) * 100}
                  title={`${a.kind}: ${a.prompt}`}
                  isWaveform={true}
                  volume={a.volume !== undefined ? a.volume : 0.5}
                  onVolumeChange={(v) => handleAudioVolumeChange(a.id, v)}
                  className="bg-panel-800 text-slate-300"
                />
              ))
            ) : timeline.length > 0 ? (
              // Map timeline segments as audio blocks in A1 (skip static images)
              timeline.filter((s) => s.type !== 'image').map((s) => (
                <Block
                  key={`audio-${s.id}`}
                  widthPct={(s.duration / total) * 100}
                  offsetPct={((s.start || 0) / total) * 100}
                  title={`Audio • ${s.sourceName}`}
                  isWaveform={true}
                  volume={s.volume !== undefined ? s.volume : 1.0}
                  onVolumeChange={(v) => handleTimelineVolumeChange(s.id, v)}
                  className="bg-panel-800 text-slate-300"
                />
              ))
            ) : (
              <span className="px-3 text-[11px] text-slate-600 italic">Audio 1</span>
            )}
          </div>
        </Track>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-panel-700/60 px-4 py-1.5 bg-panel-850">
        <span className="text-[10px] text-slate-600 font-medium">
          {clips.length > 0 && `${clips.length} clip${clips.length > 1 ? 's' : ''} • `}
          Zoom: {Math.round(zoomScale * 100)}%
        </span>
        <Bug className="h-3.5 w-3.5 text-slate-700 hover:text-slate-500 transition-colors cursor-pointer" />
      </div>
    </div>
  );
}

function Track({ label, badgeColor, children, isVisible, onToggleVisibility, isMuted, onToggleMute, onDelete }) {
  return (
    <div className={`flex items-stretch border-b border-panel-700/40 ${!isVisible ? 'opacity-40' : ''}`}>
      <div className="flex w-24 shrink-0 items-center gap-1.5 bg-panel-950 px-2.5 py-3 border-r border-panel-700">
        <span className={`rounded px-1.5 py-0.5 text-[10px] ${badgeColor}`}>{label}</span>
        <button onClick={onToggleVisibility} title={isVisible ? 'Hide' : 'Show'} className="transition-colors hover:text-slate-300">
          {isVisible
            ? <Eye className="h-3.5 w-3.5 text-emerald-400 cursor-pointer" />
            : <EyeOff className="h-3.5 w-3.5 text-slate-500 cursor-pointer" />
          }
        </button>
        <button onClick={onToggleMute} title={isMuted ? 'Unmute' : 'Mute'} className="transition-colors hover:text-slate-300">
          {isMuted
            ? <VolumeX className="h-3.5 w-3.5 text-red-400 cursor-pointer" />
            : <Volume2 className="h-3.5 w-3.5 text-emerald-400 cursor-pointer" />
          }
        </button>
      </div>
      <div className="relative flex flex-1 items-center overflow-hidden bg-panel-900/10">
        {children}
      </div>
    </div>
  );
}

function dbToGain(db) {
  if (db <= -39) return 0;
  return Math.pow(10, db / 20);
}

function gainToDb(gain) {
  if (gain <= 0.001) return -40;
  return 20 * Math.log10(gain);
}

function gainToYPct(gain) {
  const db = gainToDb(gain);
  if (db <= 0) {
    // Map [-40, 0] to [5, 50]
    return 5 + ((db + 40) / 40) * 45;
  } else {
    // Map [0, 12] to [50, 95]
    return 50 + (db / 12) * 45;
  }
}

function yPctToGain(yPct) {
  const clamped = Math.max(5, Math.min(95, yPct));
  let db;
  if (clamped <= 50) {
    // Map [5, 50] to [-40, 0]
    db = -40 + ((clamped - 5) / 45) * 40;
  } else {
    // Map [50, 95] to [0, 12]
    db = ((clamped - 50) / 45) * 12;
  }
  return dbToGain(db);
}

function Block({
  widthPct,
  offsetPct,
  title,
  className = '',
  thumbnail,
  isWaveform,
  volume = 1.0,
  onVolumeChange,
  onClick,
  sourceStart = 0,
  duration = 0,
  maxDuration = 0,
  onTrim,
  children
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const blockRef = useRef(null);

  const handleLeftTrimMouseDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);

    const startX = e.clientX;
    const initialSourceStart = sourceStart;
    const initialDuration = duration;
    const rect = blockRef.current.getBoundingClientRect();
    const pxPerSecond = rect.width / initialDuration;

    const handleMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dt = dx / pxPerSecond;

      let newSourceStart = initialSourceStart + dt;
      let newDuration = initialDuration - dt;

      if (newSourceStart < 0) {
        newSourceStart = 0;
        newDuration = initialDuration + initialSourceStart;
      }
      if (newDuration < 0.1) {
        newDuration = 0.1;
        newSourceStart = initialSourceStart + initialDuration - 0.1;
      }

      onTrim?.(newSourceStart, newDuration);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleRightTrimMouseDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);

    const startX = e.clientX;
    const initialDuration = duration;
    const rect = blockRef.current.getBoundingClientRect();
    const pxPerSecond = rect.width / initialDuration;

    const handleMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dt = dx / pxPerSecond;

      let newDuration = initialDuration + dt;

      if (maxDuration && (sourceStart + newDuration) > maxDuration) {
        newDuration = maxDuration - sourceStart;
      }
      if (newDuration < 0.1) {
        newDuration = 0.1;
      }

      onTrim?.(sourceStart, newDuration);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleLineMouseDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    setShowTooltip(true);

    const handleMouseMove = (moveEvent) => {
      if (!blockRef.current) return;
      const rect = blockRef.current.getBoundingClientRect();
      const mouseY = moveEvent.clientY;
      const yDiff = rect.bottom - mouseY;
      const yPct = (yDiff / rect.height) * 100;
      const newGain = yPctToGain(yPct);
      onVolumeChange?.(newGain);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setShowTooltip(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleDoubleClick = (e) => {
    e.stopPropagation();
    onVolumeChange?.(1.0); // Reset to 0 dB
  };

  const db = gainToDb(volume);
  const dbStr = db <= -39.9 ? '-∞ dB' : `${db >= 0 ? '+' : ''}${db.toFixed(1)} dB`;

  return (
    <div
      ref={blockRef}
      title={title}
      onClick={onClick}
      style={{ width: `${Math.max(5, widthPct)}%`, marginLeft: offsetPct ? `${offsetPct}%` : undefined }}
      className={`relative flex h-10 items-center overflow-hidden rounded-md text-[11px] font-medium whitespace-nowrap transition-all hover:brightness-110 cursor-default group ${className}`}
    >
      {/* Left Trim Handle */}
      {onTrim && (
        <div
          onMouseDown={handleLeftTrimMouseDown}
          className="absolute left-0 top-0 bottom-0 w-2 cursor-w-resize bg-banana-400/20 hover:bg-banana-400 opacity-0 group-hover:opacity-100 hover:w-2.5 transition-all z-30 flex items-center justify-center select-none"
          title="Trim Start"
        >
          <div className="w-[1.5px] h-4 bg-panel-950/70" />
        </div>
      )}

      {/* Right Trim Handle */}
      {onTrim && (
        <div
          onMouseDown={handleRightTrimMouseDown}
          className="absolute right-0 top-0 bottom-0 w-2 cursor-e-resize bg-banana-400/20 hover:bg-banana-400 opacity-0 group-hover:opacity-100 hover:w-2.5 transition-all z-30 flex items-center justify-center select-none"
          title="Trim End"
        >
          <div className="w-[1.5px] h-4 bg-panel-950/70" />
        </div>
      )}
      {/* Waveform representation */}
      {isWaveform && (
        <svg className="absolute inset-0 h-full w-full opacity-90 px-1" preserveAspectRatio="none" viewBox="0 0 100 40">
          <defs>
            <linearGradient id="wave-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#4ade80" />   {/* Green */}
              <stop offset="50%" stopColor="#3b82f6" />  {/* Blue */}
              <stop offset="100%" stopColor="#ef4444" /> {/* Red */}
            </linearGradient>
          </defs>
          {Array.from({ length: 40 }).map((_, i) => {
            const x = (i / 40) * 100 + 1.25;
            const height = Math.abs(Math.sin(i * 0.15 + 0.1)) * 30 + 5;
            const y = (40 - height) / 2;
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width="1.2"
                height={height}
                rx="0.6"
                fill="url(#wave-grad)"
              />
            );
          })}
        </svg>
      )}

      {/* Thumbnail strip background for video blocks */}
      {thumbnail && !isWaveform && (
        <div className="absolute inset-0 flex">
          {Array.from({ length: Math.max(1, Math.ceil(widthPct / 8)) }).map((_, i) => (
            <img key={i} src={thumbnail} alt="" className="h-full w-auto shrink-0 object-cover opacity-70" />
          ))}
        </div>
      )}
      <span className="relative z-10 truncate px-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
        {isWaveform ? '' : children}
      </span>

      {/* Volume line (Cyan line running horizontally) */}
      {onVolumeChange && (
        <div
          onMouseDown={handleLineMouseDown}
          onDoubleClick={handleDoubleClick}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => !isDragging && setShowTooltip(false)}
          style={{ bottom: `${gainToYPct(volume)}%` }}
          className="absolute left-0 right-0 h-2 -translate-y-1/2 z-20 cursor-row-resize group/vol"
        >
          {/* Visual line */}
          <div className="h-[2px] w-full bg-cyan-400 opacity-70 group-hover/vol:opacity-100 shadow-[0_0_4px_rgba(34,211,238,0.6)] transition-opacity" />
        </div>
      )}

      {/* Volume tooltip */}
      {showTooltip && onVolumeChange && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none rounded-lg bg-panel-950/95 border border-panel-700 px-3 py-1.5 shadow-2xl text-center select-none animate-fade-in">
          <div className="text-[13px] font-bold text-slate-100">{dbStr}</div>
          <div className="text-[9px] text-slate-500 font-medium">Double-click to reset</div>
        </div>
      )}
    </div>
  );
}

function Tool({ children, title, onClick }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-panel-750 hover:text-slate-200"
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
