import { Upload, SlidersHorizontal, ChevronDown, Settings } from 'lucide-react';

export default function TopBar({ projectName = 'Causal Plum Viper', result }) {
  const exportVideo = () => {
    if (!result?.previewUrl) return;
    const a = document.createElement('a');
    a.href = result.previewUrl;
    a.download = `${projectName.toLowerCase().replace(/\s+/g, '-')}.mp4`;
    a.click();
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-panel-700 bg-panel-850 px-4">
      {/* Left — Logo + Badge */}
      <div className="flex items-center gap-3">
        {/* Logo Banana SVG */}
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
            <defs>
              <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#facc15" />
                <stop offset="100%" stopColor="#ca8a04" />
              </linearGradient>
            </defs>
            {/* Banana icon style path */}
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93Zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 1.84-.63 3.53-1.69 4.89Z" fill="url(#logo-grad)" />
          </svg>
          <span className="text-lg font-bold text-slate-100 tracking-tight">PromptCut</span>
        </div>
        
        {/* Badge */}
        <span className="rounded-full bg-panel-750 px-3 py-0.5 text-[10px] font-semibold text-slate-400 border border-panel-700">
          Nano Banana AI Engine
        </span>
      </div>

      {/* Right — Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={exportVideo}
          disabled={!result?.previewUrl}
          className="flex items-center gap-1.5 rounded-lg bg-banana-400 hover:bg-banana-300 px-3.5 py-1.5 text-xs font-semibold text-panel-950 shadow-glow-banana-sm transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <Upload className="h-3.5 w-3.5 rotate-180" />
          Export
        </button>

        {/* Presets dropdown */}
        <button className="flex items-center gap-1.5 rounded-lg border border-panel-700 bg-panel-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-panel-750 transition-colors">
          <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" />
          Presets
          <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
        </button>

        {/* Gear Settings */}
        <button className="rounded-lg p-1.5 text-slate-400 hover:bg-panel-750 hover:text-slate-100 transition-colors" title="Settings">
          <Settings className="h-4 w-4" />
        </button>
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
