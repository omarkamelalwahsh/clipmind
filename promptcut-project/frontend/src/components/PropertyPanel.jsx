/**
 * PropertyPanel — ChatCut-style live property editor for the Remotion timeline.
 * Reads the v2 contract's editable `properties` objects (motionGraphicsTrack)
 * and item frames, and writes changes straight back into remotionData state —
 * the Remotion Player re-renders instantly. No code changes needed per style.
 */
import { useState } from 'react';
import { Type, Clock, Palette, Sparkles, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

const EFFECTS = ['pop-bounce', 'slide-left', 'typewriter', 'fade-in'];
const FPS = 30;

export default function PropertyPanel({ remotionData, setRemotionData }) {
  const [openId, setOpenId] = useState(null);
  const mg = remotionData?.timeline?.motionGraphicsTrack || [];
  if (!mg.length) return null;

  /** Immutably patch one motion-graphics item (and keep total duration valid). */
  const patchItem = (id, patch, propPatch) => {
    setRemotionData((prev) => {
      if (!prev) return prev;
      const track = prev.timeline.motionGraphicsTrack.map((item) =>
        item.id === id
          ? { ...item, ...patch, properties: { ...item.properties, ...(propPatch || {}) } }
          : item,
      );
      const lastFrame = Math.max(
        ...track.map((t) => t.endFrame),
        ...(prev.timeline.videoTrack || []).map((t) => t.endFrame),
        FPS,
      );
      return {
        ...prev,
        timeline: { ...prev.timeline, motionGraphicsTrack: track },
        projectSettings: {
          ...prev.projectSettings,
          totalDurationInFrames: Math.max(prev.projectSettings.totalDurationInFrames, lastFrame),
        },
      };
    });
  };

  const removeItem = (id) => {
    setRemotionData((prev) => ({
      ...prev,
      timeline: {
        ...prev.timeline,
        motionGraphicsTrack: prev.timeline.motionGraphicsTrack.filter((t) => t.id !== id),
      },
    }));
  };

  return (
    <div className="mx-4 mb-3 rounded-xl border border-panel-700 bg-panel-850 animate-fade-in">
      <div className="flex items-center gap-2 border-b border-panel-700/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <Sparkles className="h-3.5 w-3.5 text-banana-400" />
        Motion Graphics Properties
        <span className="ml-auto rounded bg-panel-750 px-1.5 py-0.5 text-[10px] text-slate-500">{mg.length} items</span>
      </div>

      <div className="max-h-56 overflow-y-auto p-2 space-y-1.5">
        {mg.map((item) => {
          const open = openId === item.id;
          const p = item.properties || {};
          return (
            <div key={item.id} className="rounded-lg border border-panel-700/60 bg-panel-800">
              {/* Row header */}
              <button
                onClick={() => setOpenId(open ? null : item.id)}
                className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
              >
                {open ? <ChevronDown className="h-3.5 w-3.5 text-banana-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-500" />}
                <span className="rounded bg-banana-500/10 px-1.5 py-0.5 text-[10px] font-bold text-banana-400">{item.type}</span>
                <span className="truncate text-xs text-slate-200 max-w-[120px]">{p.text || item.id}</span>
                {p.words?.length > 0 && (
                  <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-bold text-cyan-400">{p.words.length} words</span>
                )}
                <span className="ml-auto font-mono text-[10px] text-slate-500">
                  {(item.startFrame / FPS).toFixed(1)}s–{(item.endFrame / FPS).toFixed(1)}s
                </span>
              </button>

              {/* Editable properties */}
              {open && (
                <div className="space-y-2.5 border-t border-panel-700/60 px-3 py-2.5">
                  <Field icon={<Type className="h-3 w-3" />} label="Text">
                    <input
                      value={p.text || ''}
                      onChange={(e) => patchItem(item.id, null, { text: e.target.value })}
                      className="w-full rounded bg-panel-900 px-2 py-1 text-xs text-slate-100 outline-none focus:ring-1 focus:ring-banana-500"
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-2.5">
                    <Field icon={<Palette className="h-3 w-3" />} label="Color">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={p.color || '#FFFFFF'}
                          onChange={(e) => patchItem(item.id, null, { color: e.target.value })}
                          className="h-6 w-8 cursor-pointer rounded border border-panel-700 bg-transparent"
                        />
                        <span className="font-mono text-[10px] text-slate-400">{p.color}</span>
                      </div>
                    </Field>
                    <Field label={`Size · ${p.fontSize || 64}px`}>
                      <input
                        type="range" min="20" max="160" value={p.fontSize || 64}
                        onChange={(e) => patchItem(item.id, null, { fontSize: +e.target.value })}
                        className="w-full"
                      />
                    </Field>
                  </div>

                  <Field icon={<Sparkles className="h-3 w-3" />} label="Animation">
                    <div className="flex flex-wrap gap-1">
                      {EFFECTS.map((fx) => (
                        <button
                          key={fx}
                          onClick={() => patchItem(item.id, null, { animationEffect: fx })}
                          className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                            p.animationEffect === fx
                              ? 'bg-banana-500 text-panel-950'
                              : 'bg-panel-750 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {fx}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <div className="grid grid-cols-2 gap-2.5">
                    <Field icon={<Clock className="h-3 w-3" />} label="Start (s)">
                      <input
                        type="number" min="0" step="0.1" value={(item.startFrame / FPS).toFixed(1)}
                        onChange={(e) => {
                          const sf = Math.max(0, Math.round(parseFloat(e.target.value || 0) * FPS));
                          patchItem(item.id, { startFrame: sf, endFrame: Math.max(sf + 1, item.endFrame) });
                        }}
                        className="w-full rounded bg-panel-900 px-2 py-1 text-xs text-slate-100 outline-none focus:ring-1 focus:ring-banana-500"
                      />
                    </Field>
                    <Field label="End (s)">
                      <input
                        type="number" min="0" step="0.1" value={(item.endFrame / FPS).toFixed(1)}
                        onChange={(e) => {
                          const ef = Math.max(item.startFrame + 1, Math.round(parseFloat(e.target.value || 0) * FPS));
                          patchItem(item.id, { endFrame: ef });
                        }}
                        className="w-full rounded bg-panel-900 px-2 py-1 text-xs text-slate-100 outline-none focus:ring-1 focus:ring-banana-500"
                      />
                    </Field>
                  </div>

                  <button
                    onClick={() => removeItem(item.id)}
                    className="flex items-center gap-1 text-[10px] text-slate-500 transition-colors hover:text-red-400"
                  >
                    <Trash2 className="h-3 w-3" /> Remove item
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Field({ icon, label, children }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {icon} {label}
      </span>
      {children}
    </label>
  );
}
