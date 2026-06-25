/**
 * TopBar — project chrome. Home / undo / redo on the left, project name center,
 * history + layout toggles + Export on the right. Export downloads the rendered
 * Blob URL the orchestrator produced (no server round-trip).
 */
import { Home, Undo2, Redo2, Users, History, PanelsTopLeft, Download } from 'lucide-react';

export default function TopBar({ projectName = 'Causal Plum Viper', result }) {
  const exportVideo = () => {
    if (!result?.previewUrl) return;
    const a = document.createElement('a');
    a.href = result.previewUrl;
    a.download = `${projectName.toLowerCase().replace(/\s+/g, '-')}.mp4`;
    a.click();
  };

  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-panel-600/60 bg-panel-800/80 backdrop-blur-md px-3">
      {/* Left — nav */}
      <div className="flex items-center gap-0.5">
        <IconBtn title="Home"><Home className="h-4 w-4" /></IconBtn>
        <IconBtn title="Undo"><Undo2 className="h-4 w-4" /></IconBtn>
        <IconBtn title="Redo"><Redo2 className="h-4 w-4" /></IconBtn>
      </div>

      {/* Center — project name + collab */}
      <div className="flex items-center gap-2 text-sm">
        {/* Logo mark */}
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
          <defs>
            <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#facc15" />
              <stop offset="100%" stopColor="#ca8a04" />
            </linearGradient>
          </defs>
          <path d="M4 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z" stroke="url(#logo-grad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 13l2 2 4-5" stroke="url(#logo-grad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="font-semibold text-slate-100 tracking-tight">{projectName}</span>
        <Users className="h-3.5 w-3.5 text-slate-500" />
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-1.5">
        <IconBtn title="History"><History className="h-4 w-4" /></IconBtn>
        <IconBtn title="Layout"><PanelsTopLeft className="h-4 w-4" /></IconBtn>
        <button
          onClick={exportVideo}
          disabled={!result?.previewUrl}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-banana-500 to-banana-600 px-3.5 py-1.5 text-xs font-semibold text-panel-900 shadow-glow-banana-sm transition-all hover:shadow-glow-banana hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          Export
        </button>
        {/* Credits badge */}
        <div className="ml-1 flex items-center gap-1 rounded-full bg-panel-700/80 px-2.5 py-1 text-[11px] font-medium text-slate-300">
          <span className="text-banana-400">✦</span> 31
        </div>
        {/* Avatar */}
        <div className="relative ml-0.5">
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-banana-400 via-banana-500 to-banana-600 p-[2px]">
            <div className="h-full w-full rounded-full bg-panel-800" />
          </div>
          <div className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-panel-800 bg-emerald-400" />
        </div>
      </div>
    </header>
  );
}

function IconBtn({ title, children }) {
  return (
    <button
      title={title}
      className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-panel-700 hover:text-slate-100"
    >
      {children}
    </button>
  );
}
