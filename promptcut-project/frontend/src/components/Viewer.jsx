/**
 * Viewer — the right column. Plays the rendered Blob URL the orchestrator
 * returns. When there's no render yet it doubles as a drag-and-drop import zone
 * (calls onUpload). Knows nothing about how media is produced.
 */
import { useState } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';

export default function Viewer({ src, busy, stage, onUpload, keysReady }) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (keysReady && e.dataTransfer.files?.length) onUpload(e.dataTransfer.files);
  };

  return (
    <section className="flex w-[42%] min-w-[320px] shrink-0 flex-col bg-panel-800">
      <div className="px-4 py-3 text-[13px] font-semibold tracking-wide text-slate-300">VIEWER</div>
      <div className="flex flex-1 items-center justify-center p-4">
        {src ? (
          <video key={src} src={src} controls className="max-h-full max-w-full rounded-xl bg-black shadow-lift animate-fade-in" />
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`flex h-full w-full flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all duration-300 ${
              dragOver
                ? 'border-banana-400 bg-banana-500/5 shadow-glow-banana'
                : 'border-panel-600/60 hover:border-panel-500'
            }`}
          >
            {busy ? (
              <>
                <div className="relative">
                  <div className="h-12 w-12 rounded-full border-2 border-banana-500/30" />
                  <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-banana-400" />
                </div>
                <span className="mt-4 text-sm font-medium capitalize text-slate-300">{stage}…</span>
                <span className="mt-1 text-[11px] text-slate-500">This may take a moment</span>
              </>
            ) : (
              <>
                <UploadCloud className="h-10 w-10 text-slate-600 animate-float" />
                <span className="mt-3 text-sm font-medium text-slate-400">Drop media here</span>
                <span className="mt-1 text-[11px] text-slate-600">your rendered preview will play here</span>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
