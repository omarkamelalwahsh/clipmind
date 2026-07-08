/**
 * AssetsPanel → Media — ChatCut-style media library.
 *
 * Three tabs:
 *   MEDIA      → the media bin (orchestrator clips) with 3-dot menus
 *   LIBRARY    → built-in fallback assets
 *   TRANSCRIPT → word-level transcript from Groq Whisper
 *
 * Each media item has a 3-dot context menu with:
 *   - Download
 *   - Delete
 *   - Retry Transcription
 */
import { useState, useEffect, useRef } from 'react';
import {
  Upload, List, Folder, Video, Music, FileAudio2,
  ChevronDown, LayoutGrid, Image, MoreVertical,
  Download, Trash2, RefreshCw, Settings2,
} from 'lucide-react';
import PropertyPanel from './PropertyPanel.jsx';

const TABS = ['MEDIA', 'LIBRARY', 'TRANSCRIPT', 'PROPERTIES'];

export default function AssetsPanel({
  tab,
  setTab,
  clips,
  transcript,
  onUpload,
  onNeedTranscript,
  keysReady,
  activeClip,
  onSelectClip,
  onDeleteClip,
  remotionData,
  setRemotionData,
  scenes = [],
  focusedSceneId = null,
  onSelectScene,
}) {
  useEffect(() => {
    if (tab === 'TRANSCRIPT') onNeedTranscript?.();
  }, [tab, onNeedTranscript]);

  return (
    <section className="flex w-[280px] shrink-0 flex-col border-r border-panel-700 bg-panel-850">
      {/* Tab bar */}
      <div className="flex items-center gap-5 px-4 pt-3 text-[11px] border-b border-panel-700/40">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative pb-2.5 font-semibold tracking-wide transition-colors ${
              tab === t ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t}
            {tab === t && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-banana-400" />
            )}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-panel-700/60 px-4 py-2 text-xs font-semibold text-slate-400">
        <button className="flex items-center gap-1 hover:text-slate-200 transition-colors">
          THUMBNAILS
          <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
        </button>
        <div className="flex items-center gap-1.5">
          <label title="Import" className="cursor-pointer text-slate-400 hover:text-banana-400 p-1.5 rounded hover:bg-panel-750 transition-colors">
            <Upload className="h-3.5 w-3.5" />
            <input type="file" accept="video/*,audio/*,image/*" multiple disabled={!keysReady} className="hidden"
              onChange={(e) => e.target.files?.length && onUpload(e.target.files)} />
          </label>
          <button title="Grid View" className="text-banana-400 p-1.5 rounded hover:bg-panel-750 transition-colors">
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button title="List View" className="text-slate-500 p-1.5 rounded hover:bg-panel-750 transition-colors">
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 animate-fade-in" key={tab}>
        {tab === 'MEDIA' && (
          <div className="space-y-3">
            {scenes.length > 0 && (
              <SceneGrid scenes={scenes} focusedSceneId={focusedSceneId} onSelectScene={onSelectScene} />
            )}
            {(clips.length > 0 || scenes.length === 0) && (
              <MediaGrid
                clips={clips}
                onUpload={onUpload}
                keysReady={keysReady}
                activeClip={activeClip}
                onSelectClip={onSelectClip}
                onDeleteClip={onDeleteClip}
                onNeedTranscript={onNeedTranscript}
              />
            )}
          </div>
        )}
        {tab === 'LIBRARY' && <Library />}
        {tab === 'TRANSCRIPT' && <Transcript transcript={transcript} hasClips={clips.length > 0} />}
        {tab === 'PROPERTIES' && (
          remotionData ? (
            <div className="-mx-3 -my-3 h-full">
              <PropertyPanel remotionData={remotionData} setRemotionData={setRemotionData} />
            </div>
          ) : (
            <Empty label="No Properties" hint="Generate motion graphics to view properties here." />
          )
        )}
      </div>
    </section>
  );
}

/* ─── Generated Scenes (click to preview one alone) ─── */
function SceneGrid({ scenes, focusedSceneId, onSelectScene }) {
  const kindColor = { pulse_wave: 'text-cyan-400', hud_ring: 'text-sky-400', kinetic_text: 'text-fuchsia-400' };
  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-fuchsia-300">Generated Scenes</span>
        {focusedSceneId && (
          <button onClick={() => onSelectScene?.(null)} className="text-[10px] font-semibold text-slate-400 hover:text-banana-400">
            Show all
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {scenes.map((s, i) => {
          const id = s.sceneId || s.id;
          const active = focusedSceneId === id;
          const kinds = [...new Set((s.motionGraphics || []).map((m) => m.type))];
          const dur = ((s.endFrame - s.startFrame) / 30).toFixed(1);
          const colors = s.backgroundAsset?.colors || ['#0B132B', '#1C2541'];
          return (
            <button
              key={id}
              onClick={() => onSelectScene?.(active ? null : id)}
              className={`group overflow-hidden rounded-lg border text-left transition-all ${
                active ? 'border-fuchsia-400 ring-1 ring-fuchsia-400/40 shadow-glow-banana-sm' : 'border-panel-700 bg-panel-800 hover:border-panel-600'
              }`}
            >
              <div
                className="relative flex h-16 items-center justify-center"
                style={{ background: `radial-gradient(circle at 30% 30%, ${colors[0]}66, transparent 60%), radial-gradient(circle at 75% 60%, ${colors[1]}66, transparent 60%), #05070d` }}
              >
                <span className="text-[10px] font-bold text-white/90">SCENE {i + 1}</span>
                <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-medium text-white tabular-nums">{dur}s</span>
              </div>
              <div className="px-2 py-1.5">
                <p className="truncate text-[11px] font-medium text-slate-200">{s.narrationScript || id}</p>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {kinds.map((k) => (
                    <span key={k} className={`text-[8px] font-bold uppercase ${kindColor[k] || 'text-slate-500'}`}>{k.replace('_', ' ')}</span>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Media Grid with 3-dot menus ─── */
function MediaGrid({ clips, onUpload, keysReady, activeClip, onSelectClip, onDeleteClip, onNeedTranscript }) {
  if (!clips.length) return <Empty label="No media yet" hint="Import media or drag files into the editor." onUpload={onUpload} keysReady={keysReady} />;

  return (
    <div className="grid grid-cols-2 gap-2">
      {clips.map((c) => (
        <MediaItem
          key={c.id}
          clip={c}
          isActive={activeClip?.id === c.id}
          onSelect={() => onSelectClip?.(c)}
          onDelete={() => onDeleteClip?.(c.id)}
          onRetryTranscript={onNeedTranscript}
        />
      ))}
    </div>
  );
}

function MediaItem({ clip, isActive, onSelect, onDelete, onRetryTranscript }) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleDownload = () => {
    setShowMenu(false);
    const url = clip.url || clip.objectUrl;
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = clip.name;
    a.click();
  };

  const handleDelete = () => {
    setShowMenu(false);
    onDelete?.();
  };

  const handleRetryTranscript = () => {
    setShowMenu(false);
    onRetryTranscript?.();
  };

  return (
    <div className="relative group">
      <button
        onClick={onSelect}
        className={`w-full overflow-hidden rounded-xl border text-left transition-all hover:shadow-lift-sm ${
          isActive
            ? 'border-banana-500/60 ring-1 ring-banana-500/30 shadow-glow-banana-sm'
            : 'border-panel-600/60 bg-panel-750 hover:border-panel-500'
        }`}
      >
        <div className="relative flex h-[72px] items-center justify-center bg-panel-900/50">
          {clip.thumbnail ? (
            <img src={clip.thumbnail} alt={clip.name} className="h-full w-full object-cover" />
          ) : clip.type === 'audio' ? (
            <FileAudio2 className="h-6 w-6 text-banana-400" />
          ) : clip.type === 'image' ? (
            <Image className="h-6 w-6 text-banana-400" />
          ) : (
            <Video className="h-6 w-6 text-banana-400" />
          )}
          {clip.type !== 'image' && clip.duration > 0 && (
            <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-medium text-white tabular-nums backdrop-blur-sm">
              {fmtDuration(clip.duration)}
            </span>
          )}
        </div>
        <div className="px-2 py-1.5">
          <span className="block truncate text-[10px] font-medium text-slate-200">{clip.name}</span>
        </div>
      </button>

      {/* 3-dot menu trigger */}
      <div className="absolute top-1.5 right-1.5 z-10" ref={menuRef}>
        <button
          onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); }}
          className="flex h-6 w-6 items-center justify-center rounded-md bg-black/50 backdrop-blur-sm text-white/70 opacity-0 group-hover:opacity-100 hover:bg-black/70 transition-all"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>

        {showMenu && (
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] rounded-xl border border-panel-700 bg-panel-800/95 backdrop-blur-md p-1 shadow-2xl animate-fade-in">
            <CtxMenuItem icon={<Download className="h-3.5 w-3.5" />} label="Download" onClick={handleDownload} />
            <CtxMenuItem icon={<RefreshCw className="h-3.5 w-3.5" />} label="Retry Transcription" onClick={handleRetryTranscript} />
            <CtxMenuItem icon={<Trash2 className="h-3.5 w-3.5" />} label="Delete" onClick={handleDelete} danger />
          </div>
        )}
      </div>
    </div>
  );
}

function CtxMenuItem({ icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
        danger
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-slate-300 hover:bg-panel-750 hover:text-slate-100'
      }`}
    >
      {icon} {label}
    </button>
  );
}

/* ─── Library ─── */
function Library() {
  const items = [
    { name: 'fallback-whoosh.mp3', Icon: Music },
    { name: 'fallback-music.mp3', Icon: Music },
    { name: 'silence-1s.mp3', Icon: Music },
  ];
  return (
    <div className="space-y-1.5">
      <p className="mb-3 text-xs text-slate-500">Built-in fallback audio (served from <code className="rounded bg-panel-700 px-1.5 py-0.5 text-banana-400">/public</code>).</p>
      {items.map((i) => (
        <div key={i.name} className="flex items-center gap-2.5 rounded-lg bg-panel-750 px-3 py-2 text-xs text-slate-300 transition-colors hover:bg-panel-700">
          <i.Icon className="h-3.5 w-3.5 text-banana-400" /> {i.name}
        </div>
      ))}
    </div>
  );
}

/* ─── Transcript ─── */
function Transcript({ transcript, hasClips }) {
  if (!hasClips) return <Empty label="No media yet" hint="Upload a clip to transcribe its narration." />;
  if (!transcript) return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-banana-500 border-t-transparent" />
        <span className="text-xs text-slate-500">Transcribing narration with Whisper large-v3…</span>
      </div>
    </div>
  );
  const words = transcript.words || [];
  const text = (transcript.text || '').trim();

  if (!text && words.length === 0) {
    return (
      <Empty
        label="No speech detected"
        hint="The audio may be music-only/silent, or transcription failed."
      />
    );
  }

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500">
        <span>Transcript</span>
        <span>{words.length} words{transcript.language ? ` · ${transcript.language}` : ''}</span>
      </div>
      <p className="leading-relaxed text-slate-200">{text}</p>
      {words.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-panel-700/60 pt-3">
          {words.slice(0, 600).map((w, i) => (
            <span key={i} title={`${Number(w.start).toFixed(2)}s – ${Number(w.end).toFixed(2)}s`}
              className="rounded-md bg-panel-700 px-1.5 py-0.5 text-[11px] text-slate-300 transition-colors hover:bg-banana-500/20 hover:text-banana-200 cursor-default">
              {(w.word || '').trim()}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Empty State ─── */
function Empty({ label, hint, onUpload, keysReady }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center animate-fade-in">
      <Folder className="mb-3 h-10 w-10 text-slate-600 animate-pulse-glow" />
      <p className="text-sm font-medium text-slate-300">{label}</p>
      <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      {onUpload && (
        <label className={`mt-4 rounded-lg border border-panel-600/60 px-4 py-2 text-xs font-medium transition-all ${keysReady ? 'cursor-pointer text-slate-300 hover:border-banana-500/60 hover:text-banana-400 hover:shadow-glow-banana-sm' : 'cursor-not-allowed text-slate-600'}`}>
          Import media
          <input type="file" accept="video/*,audio/*,image/*" multiple disabled={!keysReady} className="hidden"
            onChange={(e) => e.target.files?.length && onUpload(e.target.files)} />
        </label>
      )}
    </div>
  );
}

/** Format seconds to m:ss or h:mm:ss */
function fmtDuration(sec) {
  const s = Math.max(0, sec || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${m}:${String(ss).padStart(2, '0')}`;
}
