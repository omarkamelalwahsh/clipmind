/**
 * AssetsPanel — the center column. Three tabs:
 *   MY ASSETS  → the media bin (orchestrator clips)
 *   LIBRARY    → static / fallback assets (public/)
 *   TRANSCRIPT → word-level transcript from Groq Whisper (lazy-loaded)
 */
import { useEffect } from 'react';
import {
  Upload, List, Folder, Video, Music, FileAudio2, ChevronDown, LayoutGrid
} from 'lucide-react';

const TABS = ['MY ASSETS', 'LIBRARY', 'TRANSCRIPT'];

export default function AssetsPanel({ tab, setTab, clips, transcript, onUpload, onNeedTranscript, keysReady, activeClip, onSelectClip }) {
  useEffect(() => {
    if (tab === 'TRANSCRIPT') onNeedTranscript?.();
  }, [tab, onNeedTranscript]);

  return (
    <section className="flex min-w-0 flex-1 flex-col border-r border-panel-700 bg-panel-850">
      {/* Tab bar */}
      <div className="flex items-center gap-6 px-4 pt-3 text-[13px] border-b border-panel-700/40">
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
        <div className="flex items-center gap-2">
          <label title="Import" className="cursor-pointer text-slate-400 hover:text-banana-400 p-1.5 rounded hover:bg-panel-750 transition-colors">
            <Upload className="h-3.5 w-3.5" />
            <input type="file" accept="video/*,audio/*" multiple disabled={!keysReady} className="hidden"
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
        {tab === 'MY ASSETS' && <MyAssets clips={clips} onUpload={onUpload} keysReady={keysReady} activeClip={activeClip} onSelectClip={onSelectClip} />}
        {tab === 'LIBRARY' && <Library />}
        {tab === 'TRANSCRIPT' && <Transcript transcript={transcript} hasClips={clips.length > 0} />}
      </div>
    </section>
  );
}

function MyAssets({ clips, onUpload, keysReady, activeClip, onSelectClip }) {
  if (!clips.length) return <Empty label="This bin is empty" hint="Import media or drag clips here." onUpload={onUpload} keysReady={keysReady} />;
  return (
    <div className="grid grid-cols-2 gap-2">
      {clips.map((c) => {
        const isActive = activeClip?.id === c.id;
        return (
          <button
            key={c.id}
            onClick={() => onSelectClip?.(c)}
            className={`group overflow-hidden rounded-xl border text-left transition-all hover:shadow-lift-sm ${
              isActive
                ? 'border-banana-500/60 ring-1 ring-banana-500/30 shadow-glow-banana-sm'
                : 'border-panel-600/60 bg-panel-750 hover:border-panel-500'
            }`}
          >
            <div className="relative flex h-20 items-center justify-center bg-panel-900/50">
              {c.thumbnail ? (
                <img src={c.thumbnail} alt={c.name} className="h-full w-full object-cover" />
              ) : c.type === 'audio' ? (
                <FileAudio2 className="h-7 w-7 text-banana-400" />
              ) : (
                <Video className="h-7 w-7 text-banana-400" />
              )}
              {/* Duration badge */}
              {c.duration > 0 && (
                <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums backdrop-blur-sm">
                  {fmtDuration(c.duration)}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-1 px-2.5 py-2">
              <span className="truncate text-[11px] font-medium text-slate-200">{c.name}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

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
        hint="The audio may be music-only/silent, or transcription failed. Check the activity log on the left."
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

function Empty({ label, hint, onUpload, keysReady }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center animate-fade-in">
      <Folder className="mb-3 h-10 w-10 text-slate-600 animate-pulse-glow" />
      <p className="text-sm font-medium text-slate-300">{label}</p>
      <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      {onUpload && (
        <label className={`mt-4 rounded-lg border border-panel-600/60 px-4 py-2 text-xs font-medium transition-all ${keysReady ? 'cursor-pointer text-slate-300 hover:border-banana-500/60 hover:text-banana-400 hover:shadow-glow-banana-sm' : 'cursor-not-allowed text-slate-600'}`}>
          Import media
          <input type="file" accept="video/*,audio/*" multiple disabled={!keysReady} className="hidden"
            onChange={(e) => e.target.files?.length && onUpload(e.target.files)} />
        </label>
      )}
    </div>
  );
}

const ToolIcon = ({ children }) => (
  <button className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-panel-700 hover:text-slate-100">{children}</button>
);

/** Format seconds to m:ss or h:mm:ss */
function fmtDuration(sec) {
  const s = Math.max(0, sec || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${m}:${String(ss).padStart(2, '0')}`;
}
