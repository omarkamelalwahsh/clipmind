/**
 * AIPanel — the left column. Preset "what do you want to create" cards seed the
 * prompt; the bottom command bar runs the orchestrator. Stays dumb: it only
 * collects text + options and calls onSubmit.
 */
import { useState } from 'react';
import {
  Mic, Sparkles, Smartphone, Box, Clapperboard, GraduationCap,
  Bot, ChevronDown, Plus, Palette, BookOpen, Wand2, SlidersHorizontal, Loader2, ArrowUp,
} from 'lucide-react';

const PRESETS = [
  { id: 'talking-head', label: 'Talking Head Editing', Icon: Mic, color: 'from-rose-500/20 to-rose-600/10', iconColor: 'text-rose-400',
    prompt: 'Clean up this talking-head video: cut filler words and long silences, keep the pacing tight, and add subtle whoosh transitions between cuts.' },
  { id: 'motion', label: 'Motion Graphics', Icon: Sparkles, color: 'from-violet-500/20 to-violet-600/10', iconColor: 'text-violet-400',
    prompt: 'Add motion-graphics energy: punchy SFX on key moments and an upbeat background music bed under the narration.' },
  { id: 'shorts', label: 'Footage to Shorts', Icon: Smartphone, color: 'from-sky-500/20 to-sky-600/10', iconColor: 'text-sky-400',
    prompt: 'Turn this footage into a vertical short: keep only the most engaging 30 seconds, trim visuals to fit the voice-over, add a hook SFX at the start.' },
  { id: 'promo', label: 'Product / App Promo', Icon: Box, color: 'from-emerald-500/20 to-emerald-600/10', iconColor: 'text-emerald-400',
    prompt: 'Make a snappy product promo: tight cuts on each feature, a confident music bed, and a satisfying click/pop SFX on every transition.' },
  { id: 'short-film', label: 'AI Short Film', Icon: Clapperboard, color: 'from-amber-500/20 to-amber-600/10', iconColor: 'text-amber-400',
    prompt: 'Edit this into a cinematic short: dramatic pacing, a moody ambient music bed, and a deep boom on the most important beat.' },
  { id: 'explainer', label: 'Explainer Video', Icon: GraduationCap, color: 'from-pink-500/20 to-pink-600/10', iconColor: 'text-pink-400',
    prompt: 'Create a clear explainer edit: align b-roll inserts to the narration, trim them to fit, and add a calm, low background bed.' },
];

export default function AIPanel({ onSubmit, busy, disabled }) {
  const [prompt, setPrompt] = useState('');
  const [strategy] = useState('proportional');
  const [withAudio] = useState(true);

  const submit = () => {
    const text = prompt.trim();
    if (text && !busy && !disabled) onSubmit(text, { strategy, withAudio });
  };

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-r border-panel-600/60 bg-panel-800">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 text-sm font-semibold tracking-wide text-slate-300">
        <span className="text-banana-400">AI</span>
      </div>

      {/* Presets */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 animate-fade-in">
        <h2 className="mb-5 text-center text-[15px] font-semibold text-slate-100">
          What do you want to create today?
        </h2>
        <div className="grid w-full grid-cols-2 gap-2">
          {PRESETS.map(({ id, label, Icon, color, iconColor, prompt: p }) => (
            <button
              key={id}
              onClick={() => setPrompt(p)}
              disabled={disabled}
              className="group flex items-center gap-2.5 rounded-xl border border-panel-600/60 bg-panel-750 p-3 text-left transition-all duration-200 hover:border-panel-500 hover:-translate-y-0.5 hover:shadow-lift-sm active:translate-y-0 disabled:opacity-40 disabled:pointer-events-none"
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${color} ${iconColor} transition-transform duration-200 group-hover:scale-110`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-xs font-medium leading-tight text-slate-300 group-hover:text-slate-100">
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Command bar */}
      <div className="mx-3 mb-3 rounded-2xl border border-panel-600/60 bg-panel-750 p-3 shadow-inner-glow">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
          rows={2}
          disabled={disabled}
          placeholder="Describe what you'd like to create…"
          className="w-full resize-none bg-transparent px-1 text-sm text-slate-100 placeholder-slate-500 outline-none disabled:opacity-50"
        />
        <div className="mt-2 flex items-center justify-between">
          <button className="flex items-center gap-1.5 rounded-lg bg-panel-900/80 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-panel-900 hover:text-slate-100">
            <Bot className="h-3.5 w-3.5 text-banana-400" /> Agent <ChevronDown className="h-3 w-3 text-slate-500" />
          </button>
          <div className="flex items-center gap-0.5 text-slate-500">
            <CmdIcon title="Add"><Plus className="h-4 w-4" /></CmdIcon>
            <CmdIcon title="Settings"><SlidersHorizontal className="h-4 w-4" /></CmdIcon>
            <CmdIcon title="Style"><Palette className="h-4 w-4" /></CmdIcon>
            <CmdIcon title="Templates"><BookOpen className="h-4 w-4" /></CmdIcon>
            <CmdIcon title="Enhance"><Wand2 className="h-4 w-4" /></CmdIcon>
            <button
              onClick={submit}
              disabled={busy || disabled || !prompt.trim()}
              title="Generate"
              className="ml-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-banana-400 to-banana-600 text-panel-900 shadow-glow-banana-sm transition-all hover:shadow-glow-banana hover:scale-105 active:scale-95 disabled:opacity-30 disabled:shadow-none"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function CmdIcon({ title, children }) {
  return (
    <button title={title} className="rounded-md p-1.5 transition-colors hover:bg-panel-900/60 hover:text-slate-200">
      {children}
    </button>
  );
}
