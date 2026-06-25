/**
 * AssetsPanel — the center column. Three tabs:
 *   MY ASSETS  → the media bin (orchestrator clips)
 *   LIBRARY    → static / fallback assets (public/)
 *   TRANSCRIPT → word-level transcript from Groq Whisper (lazy-loaded)
 */
import { useEffect } from 'react';
import {
  Search, Upload, FolderPlus, List, ArrowUpDown, Filter,
  Folder, Video, Music, FileAudio2,
} from 'lucide-react';

const TABS = ['MY ASSETS', 'LIBRARY', 'TRANSCRIPT'];

export default function AssetsPanel({ tab, setTab, clips, transcript, onUpload, onNeedTranscript, keysReady }) {
  useEffect(() => {
    if (tab === 'TRANSCRIPT') onNeedTranscript?.();
  }, [tab, onNeedTranscript]);

  return (
    <section className="flex min-w-0 flex-1 flex-col border-r border-panel-600/60 bg-panel-800">
      {/* Tab bar */}
      <div className="flex items-center gap-6 px-4 pt-3 text-[13px]">
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
              <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-banana-500" />
            )}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-panel-600/60 px-3 py-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg bg-panel-900/70 px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-slate-500" />
          <input
            placeholder="Search"
            className="w-full bg-transparent text-xs text-slate-200 placeholder-slate-500 outline-none"
          />
        </div>
        <label title="Import" className={`rounded-lg p-1.5 ${keysReady ? 'cursor-pointer text-slate-400 hover:bg-panel-700 hover:text-banana-400' : 'cursor-not-allowed text-slate-600'}`}>
          <Upload className="h-4 w-4" />
          <input type="file" accept="video/*,audio/*" multiple disabled={!keysReady} className="hidden"
            onChange={(e) => e.target.files?.length && onUpload(e.target.files)} />
        </label>
        <ToolIcon><FolderPlus className="h-4 w-4" /></ToolIcon>
        <ToolIcon><List className="h-4 w-4" /></ToolIcon>
        <ToolIcon><ArrowUpDown className="h-4 w-4" /></ToolIcon>
        <ToolIcon><Filter className="h-4 w-4" /></ToolIcon>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 animate-fade-in" key={tab}>
        {tab === 'MY ASSETS' && <MyAssets clips={clips} onUpload={onUpload} keysReady={keysReady} />}
        {tab === 'LIBRARY' && <Library />}
        {tab === 'TRANSCRIPT' && <Transcript transcript={transcript} hasClips={clips.length > 0} />}
      </div>
    </section>
  );
}

function MyAssets({ clips, onUpload, keysReady }) {
  if (!clips.length) return <Empty label="This bin is empty" hint="Import media or drag clips here." onUpload={onUpload} keysReady={keysReady} />;
  return (
    <div className="grid grid-cols-2 gap-2">
      {clips.map((c) => (
        <div key={c.id} className="overflow-hidden rounded-xl border border-panel-600/60 bg-panel-750 transition-all hover:border-panel-500 hover:shadow-lift-sm">
          <div className="flex h-20 items-center justify-center bg-panel-900/50 text-banana-400">
            {c.type === 'audio' ? <FileAudio2 className="h-7 w-7" /> : <Video className="h-7 w-7" />}
          </div>
          <div className="flex items-center justify-between gap-1 px-2.5 py-2">
            <span className="truncate text-[11px] font-medium text-slate-200">{c.name}</span>
            <span className="shrink-0 text-[10px] text-slate-500">{c.duration ? `${c.duration.toFixed(1)}s` : '—'}</span>
          </div>
        </div>
      ))}
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
  return (
    <div className="space-y-3 text-xs">
      <p className="leading-relaxed text-slate-300">{transcript.text}</p>
      <div className="flex flex-wrap gap-1">
        {transcript.words.slice(0, 400).map((w, i) => (
          <span key={i} title={`${w.start.toFixed(2)}s – ${w.end.toFixed(2)}s`}
            className="rounded-md bg-panel-700 px-1.5 py-0.5 text-[11px] text-slate-300 transition-colors hover:bg-banana-500/20 hover:text-banana-200 cursor-default">
            {w.word.trim()}
          </span>
        ))}
      </div>
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
