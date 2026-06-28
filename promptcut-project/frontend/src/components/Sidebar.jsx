import { Home, FileText, Wand2, Video, Mic, Settings } from 'lucide-react';

export default function Sidebar() {
  return (
    <div className="flex w-[60px] shrink-0 flex-col items-center justify-between border-r border-panel-700 bg-panel-950 py-4">
      {/* Top section — navigation icons */}
      <div className="flex flex-col items-center gap-4 w-full">
        {/* Home icon, selected (yellow background highlight) */}
        <button
          title="Home"
          className="group relative flex h-10 w-10 items-center justify-center rounded-xl bg-banana-500/10 text-banana-400 transition-all hover:brightness-110"
        >
          <Home className="h-5 w-5" />
          <span className="absolute left-0 top-1/4 h-1/2 w-1 rounded-r-md bg-banana-400" />
        </button>

        {/* Script/Presets icon */}
        <button
          title="Presets"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-all hover:bg-panel-800 hover:text-slate-300"
        >
          <FileText className="h-5 w-5" />
        </button>

        {/* Magic Wand icon */}
        <button
          title="AI Tools"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-all hover:bg-panel-800 hover:text-slate-300"
        >
          <Wand2 className="h-5 w-5" />
        </button>

        {/* Video editor icon */}
        <button
          title="Clips"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-all hover:bg-panel-800 hover:text-slate-300"
        >
          <Video className="h-5 w-5" />
        </button>

        {/* Audio icon */}
        <button
          title="Audio"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-all hover:bg-panel-800 hover:text-slate-300"
        >
          <Mic className="h-5 w-5" />
        </button>
      </div>

      {/* Bottom section — settings */}
      <div className="flex flex-col items-center w-full">
        <button
          title="Settings"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-all hover:bg-panel-800 hover:text-slate-300"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
