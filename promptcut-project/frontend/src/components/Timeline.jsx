/**
 * Timeline — the bottom dock. Renders the plain timeline model the orchestrator
 * returns across a V1 (video) lane and an A1 (generated audio) lane, with a
 * toolbar, transport, ruler and zoom. Visualization only — no editing logic.
 */
import { useState } from 'react';
import {
  Plus, Scissors, Link2, Mic, ChevronDown,
  Play, ZoomOut, ZoomIn, Maximize2, MoveHorizontal, LayoutGrid,
  Eye, Volume2, Trash2, Bug,
} from 'lucide-react';

const RULER_MARKS = ['00:00:00', '00:10:00', '00:20:00', '00:30:00', '00:40:00'];

export default function Timeline({ result }) {
  const [zoom, setZoom] = useState(50);
  const { timeline = [], audio = [], fit } = result || {};
  const total =
    timeline.reduce((m, s) => Math.max(m, s.end), 0) ||
    audio.reduce((m, a) => Math.max(m, (a.start || 0) + (a.duration || 0)), 0) ||
    1;

  return (
    <div className="flex h-[260px] shrink-0 flex-col border-t border-panel-600 bg-panel-800">
      {/* toolbar */}
      <div className="flex items-center justify-between border-b border-panel-600 px-3 py-1.5">
        <div className="flex items-center gap-1">
          <Tool><Plus className="h-4 w-4" /></Tool>
          <Tool><Scissors className="h-4 w-4" /></Tool>
          <Tool><Link2 className="h-4 w-4" /></Tool>
          <Tool><Mic className="h-4 w-4" /></Tool>
          <Tool><ChevronDown className="h-4 w-4" /></Tool>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-300">
          <button className="rounded-md p-1 hover:bg-panel-700"><Play className="h-4 w-4" /></button>
          <span className="font-mono text-xs tabular-nums text-slate-400">
            00:00.00 / {fmt(total)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Tool><ZoomOut className="h-4 w-4" /></Tool>
          <input type="range" min="10" max="100" value={zoom} onChange={(e) => setZoom(+e.target.value)}
            className="h-1 w-20 accent-banana-500" />
          <Tool><ZoomIn className="h-4 w-4" /></Tool>
          <Tool><MoveHorizontal className="h-4 w-4" /></Tool>
          <Tool><LayoutGrid className="h-4 w-4" /></Tool>
          <span className="rounded bg-panel-700 px-1.5 py-0.5 text-[10px] text-slate-400">OFF</span>
          <Tool><Maximize2 className="h-4 w-4" /></Tool>
        </div>
      </div>

      {/* ruler */}
      <div className="relative flex h-6 shrink-0 items-center border-b border-panel-600 pl-24 text-[10px] text-slate-500">
        {RULER_MARKS.map((m) => (
          <span key={m} className="flex-1">{m}</span>
        ))}
        <div className="absolute bottom-0 top-0 left-24 w-px bg-banana-400" />
      </div>

      {/* tracks */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Track label="V1" colorClass="bg-banana-500/80 text-panel-900">
          {timeline.map((s) => (
            <Block key={s.id} widthPct={(s.duration / total) * 100}
              title={`${s.sourceName} • ${s.duration.toFixed(2)}s${s.note ? ` • ${s.note}` : ''}`}
              className="bg-banana-500/80 text-panel-900">
              {s.sourceName}
            </Block>
          ))}
        </Track>

        <Track label="A1" colorClass="bg-sky-500/70 text-white">
          {audio.length === 0
            ? <span className="px-2 text-[11px] text-slate-600">no generated audio</span>
            : audio.map((a) => (
              <Block key={a.id} widthPct={(a.duration / total) * 100} offsetPct={((a.start || 0) / total) * 100}
                title={`${a.kind}: ${a.prompt} • ${a.duration?.toFixed(1)}s @vol ${a.volume}`}
                className="bg-sky-500/70 text-white">
                {a.kind}
              </Block>
            ))}
        </Track>
      </div>

      <div className="flex items-center justify-end border-t border-panel-600 px-3 py-1">
        <Bug className="h-3.5 w-3.5 text-slate-600" />
      </div>
    </div>
  );
}

function Track({ label, children }) {
  return (
    <div className="flex items-stretch border-b border-panel-700">
      <div className="flex w-24 shrink-0 items-center gap-1.5 bg-panel-700 px-2 py-3">
        <span className="rounded bg-panel-600 px-1.5 py-0.5 text-[10px] font-semibold text-slate-200">{label}</span>
        <Eye className="h-3 w-3 text-slate-500" />
        <Volume2 className="h-3 w-3 text-slate-500" />
        <Trash2 className="h-3 w-3 text-slate-500" />
      </div>
      <div className="relative flex flex-1 items-center gap-1 overflow-hidden p-1.5">{children}</div>
    </div>
  );
}

function Block({ widthPct, offsetPct, title, className = '', children }) {
  return (
    <div title={title}
      style={{ width: `${Math.max(5, widthPct)}%`, marginLeft: offsetPct ? `${offsetPct}%` : undefined }}
      className={`flex h-9 items-center overflow-hidden rounded px-2 text-[11px] font-medium whitespace-nowrap ${className}`}>
      <span className="truncate">{children}</span>
    </div>
  );
}

const Tool = ({ children }) => (
  <button className="rounded-md p-1.5 text-slate-400 transition hover:bg-panel-700 hover:text-slate-100">{children}</button>
);

function fmt(seconds) {
  const s = Math.max(0, seconds || 0);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(Math.floor(s % 60)).padStart(2, '0');
  const cs = String(Math.floor((s % 1) * 100)).padStart(2, '0');
  return `${mm}:${ss}.${cs}`;
}
