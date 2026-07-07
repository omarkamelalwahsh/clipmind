/**
 * TopBar — ChatCut-style Menu bar.
 *
 * Left:  Logo + editable project name
 * Right: Undo · Redo · Adjust Layout · Save Version · Export
 *
 * Undo/Redo buttons are cosmetic placeholders (wired to callbacks when supplied).
 * Save Version opens a minimal version modal.
 * Export downloads the rendered preview as Video, Audio, or Motion Graphics.
 */
import { useState, useRef, useEffect } from 'react';
import {
  Undo2, Redo2, LayoutDashboard, Save, Upload, ChevronDown,
  Video, Music, Sparkles, X,
} from 'lucide-react';

export default function TopBar({
  projectName: initialName = 'Untitled Project',
  result,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onToggleLayout,
}) {
  const [projectName, setProjectName] = useState(initialName);
  const [isEditing, setIsEditing] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [savedVersions, setSavedVersions] = useState([]);
  const exportRef = useRef(null);
  const inputRef = useRef(null);

  // Close export dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setShowExportMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Auto-focus inline rename
  useEffect(() => {
    if (isEditing && inputRef.current) inputRef.current.focus();
  }, [isEditing]);

  const doExport = (type) => {
    setShowExportMenu(false);
    if (!result?.previewUrl) return;
    const a = document.createElement('a');
    a.href = result.previewUrl;
    const ext = type === 'audio' ? 'mp3' : 'mp4';
    a.download = `${projectName.toLowerCase().replace(/\s+/g, '-')}.${ext}`;
    a.click();
  };

  const saveVersion = () => {
    const version = {
      id: Date.now(),
      name: `v${savedVersions.length + 1} — ${new Date().toLocaleTimeString()}`,
      ts: Date.now(),
    };
    setSavedVersions((prev) => [...prev, version]);
    setShowSaveModal(false);
  };

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-panel-700 bg-panel-900 px-4">
      {/* Left — Logo + Project Name */}
      <div className="flex items-center gap-3">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
            <defs>
              <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#facc15" />
                <stop offset="100%" stopColor="#ca8a04" />
              </linearGradient>
            </defs>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93Zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 1.84-.63 3.53-1.69 4.89Z" fill="url(#logo-grad)" />
          </svg>
          <span className="text-sm font-bold text-slate-100 tracking-tight">PromptCut</span>
        </div>

        {/* Divider */}
        <div className="h-5 w-px bg-panel-700" />

        {/* Editable project name */}
        {isEditing ? (
          <input
            ref={inputRef}
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onBlur={() => setIsEditing(false)}
            onKeyDown={(e) => { if (e.key === 'Enter') setIsEditing(false); }}
            className="rounded bg-panel-800 px-2 py-0.5 text-xs font-medium text-slate-200 outline-none ring-1 ring-banana-500/40 w-40"
          />
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="rounded px-2 py-0.5 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-panel-800 transition-colors"
            title="Click to rename project"
          >
            {projectName}
          </button>
        )}
      </div>

      {/* Right — Menu Actions: Undo · Redo · Layout · Save · Export */}
      <div className="flex items-center gap-1.5">
        {/* Undo */}
        <MenuBtn
          icon={<Undo2 className="h-4 w-4" />}
          title="Undo"
          disabled={!canUndo}
          onClick={onUndo}
        />

        {/* Redo */}
        <MenuBtn
          icon={<Redo2 className="h-4 w-4" />}
          title="Redo"
          disabled={!canRedo}
          onClick={onRedo}
        />

        {/* Divider */}
        <div className="mx-1 h-5 w-px bg-panel-700" />

        {/* Adjust Layout */}
        <MenuBtn
          icon={<LayoutDashboard className="h-4 w-4" />}
          title="Adjust Layout"
          onClick={onToggleLayout}
        />

        {/* Save Version */}
        <MenuBtn
          icon={<Save className="h-4 w-4" />}
          title="Save Version"
          onClick={() => setShowSaveModal(true)}
        />

        {/* Divider */}
        <div className="mx-1 h-5 w-px bg-panel-700" />

        {/* Export */}
        <div className="relative" ref={exportRef}>
          <button
            onClick={() => setShowExportMenu((v) => !v)}
            disabled={!result?.previewUrl}
            className="flex items-center gap-1.5 rounded-lg bg-banana-400 hover:bg-banana-300 px-3.5 py-1.5 text-xs font-semibold text-panel-950 shadow-glow-banana-sm transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            <Upload className="h-3.5 w-3.5 rotate-180" />
            Export
            <ChevronDown className="h-3 w-3" />
          </button>

          {showExportMenu && (
            <div className="absolute right-0 top-full mt-2 z-50 min-w-[160px] rounded-xl border border-panel-700 bg-panel-800/95 backdrop-blur-md p-1.5 shadow-2xl animate-fade-in">
              <ExportOption icon={<Video className="h-3.5 w-3.5" />} label="Video" sub="MP4, up to 1080p 60fps" onClick={() => doExport('video')} />
              <ExportOption icon={<Music className="h-3.5 w-3.5" />} label="Audio" sub="Extract audio track" onClick={() => doExport('audio')} />
              <ExportOption icon={<Sparkles className="h-3.5 w-3.5" />} label="Motion Graphics" sub="Animated composition" onClick={() => doExport('motion')} />
            </div>
          )}
        </div>
      </div>

      {/* Save Version Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setShowSaveModal(false)}>
          <div className="w-80 rounded-2xl border border-panel-700 bg-panel-850 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-100">Save Version</h3>
              <button onClick={() => setShowSaveModal(false)} className="text-slate-500 hover:text-slate-300"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-slate-400 mb-4">Save your current progress. You can revert to any saved version at any time.</p>
            {savedVersions.length > 0 && (
              <div className="mb-4 max-h-32 overflow-y-auto space-y-1.5">
                {savedVersions.map((v) => (
                  <div key={v.id} className="flex items-center gap-2 rounded-lg bg-panel-800 px-3 py-2 text-xs text-slate-300">
                    <Save className="h-3 w-3 text-banana-400" />
                    {v.name}
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={saveVersion}
              className="w-full rounded-lg bg-banana-400 py-2 text-xs font-semibold text-panel-950 hover:bg-banana-300 transition-colors"
            >
              Save Current Version
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

function MenuBtn({ icon, title, disabled, onClick }) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-panel-800 hover:text-slate-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400"
    >
      {icon}
    </button>
  );
}

function ExportOption({ icon, label, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-panel-750"
    >
      <span className="text-banana-400">{icon}</span>
      <div>
        <div className="text-xs font-semibold text-slate-200">{label}</div>
        <div className="text-[10px] text-slate-500">{sub}</div>
      </div>
    </button>
  );
}
