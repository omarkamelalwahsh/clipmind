/**
 * Viewer — the right column. Plays the uploaded clip or rendered output.
 * Shares a videoRef with Timeline for synchronized playback controls.
 * When there's no video it acts as a drag-and-drop import zone.
 */
import { useState } from 'react';
import { UploadCloud } from 'lucide-react';
import RemotionPreview from '../remotion/RemotionPreview.jsx';

export default function Viewer({ src, busy, stage, progress = 0, onUpload, keysReady, videoRef, remotionData }) {
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
        {remotionData?.timeline?.length ? (
          <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-black shadow-lift animate-fade-in">
            <RemotionPreview data={remotionData} />
          </div>
        ) : src ? (
          <div className="group relative flex max-h-full max-w-full items-center justify-center">
            <video
              ref={videoRef}
              key={src}
              src={src}
              playsInline
              onClick={() => {
                const v = videoRef?.current;
                if (!v) return;
                v.paused ? v.play() : v.pause();
              }}
              className="max-h-full max-w-full cursor-pointer rounded-xl bg-black shadow-lift animate-fade-in"
            />
            {busy && (
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-panel-900/80 backdrop-blur-sm animate-fade-in">
                <div className="relative">
                  <div className="h-12 w-12 rounded-full border-2 border-banana-500/30" />
                  <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-banana-400" />
                </div>
                <span className="mt-4 text-sm font-semibold capitalize text-banana-200">{stage}…</span>
                
                {/* Progress bar */}
                <div className="mt-3.5 w-48 flex flex-col items-center gap-1.5 animate-fade-in">
                  <div className="h-1.5 w-full bg-panel-800 rounded-full overflow-hidden border border-panel-700">
                    <div
                      className="h-full bg-banana-400 transition-all duration-300 shadow-[0_0_8px_rgba(250,204,21,0.5)]"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-banana-400 tabular-nums">
                    {Math.round(progress * 100)}%
                  </span>
                </div>

                <span className="mt-2.5 text-[11px] text-slate-400">AI is editing your video — this can take a minute</span>
              </div>
            )}
          </div>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`flex h-full w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-300 p-8 ${
              dragOver
                ? 'border-banana-400 bg-banana-500/5 shadow-glow-banana'
                : 'border-panel-700 hover:border-panel-600'
            }`}
          >
            {busy ? (
              <>
                <div className="relative">
                  <div className="h-12 w-12 rounded-full border-2 border-banana-500/30" />
                  <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-2 border-transparent border-t-banana-400" />
                </div>
                <span className="mt-4 text-sm font-semibold capitalize text-banana-200">{stage}…</span>
                
                {/* Progress bar */}
                <div className="mt-3.5 w-48 flex flex-col items-center gap-1.5 animate-fade-in">
                  <div className="h-1.5 w-full bg-panel-800 rounded-full overflow-hidden border border-panel-700">
                    <div
                      className="h-full bg-banana-400 transition-all duration-300 shadow-[0_0_8px_rgba(250,204,21,0.5)]"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-banana-400 tabular-nums">
                    {Math.round(progress * 100)}%
                  </span>
                </div>

                <span className="mt-2.5 text-[11px] text-slate-400">This may take a moment</span>
              </>
            ) : (
              <>
                <UploadCloud className="h-12 w-12 text-banana-400/90 animate-float" />
                <span className="mt-4 text-sm font-bold text-slate-100 tracking-wide">Upload upload zone</span>
                <span className="mt-1 text-xs text-slate-500 text-center max-w-[220px] leading-relaxed">
                  Pulse an animation stages, better typography hierarchy
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
