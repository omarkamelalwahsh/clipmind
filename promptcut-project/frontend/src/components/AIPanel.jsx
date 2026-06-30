/**
 * AIPanel — the left column. Preset "what do you want to create" cards seed the
 * prompt; the bottom command bar runs the orchestrator. Stays dumb: it only
 * collects text + options and calls onSubmit.
 */
import { useState, useRef } from 'react';
import {
  Bot, ChevronDown, Wand2, Loader2, AlertTriangle, CheckCircle2, Activity, Video, Image, Square, ThumbsUp, ThumbsDown, Copy
} from 'lucide-react';

const PRESETS = [
  {
    id: 'good-video',
    title: 'Good video',
    desc: 'Raise your video with bromshaf and coloring effect',
    emojis: { left: '🤯', right: '😍' },
    prompt: 'Create a high quality edit: clean up talking head segments, adjust pacing, apply a warm color grade, and add subtle whoosh transitions.'
  },
  {
    id: 'prompt-imagins',
    title: 'Prompt Imagins',
    desc: 'Raise your video with video or other creative inserts.',
    emojis: { left: '🫣', right: '🤓' },
    prompt: 'Add creative inserts and b-roll aligned with the speech to build a dynamic presentation.'
  },
  {
    id: 'prompt-images-1',
    title: 'Prompt Images',
    desc: 'Raise your video with bromshaf and colorateY effect',
    emojis: { left: '🤩', right: '😱' },
    prompt: 'Enhance the video with vibrant neon colors, tight beat-aligned cuts, and visual effects.'
  },
  {
    id: 'prompt-images-2',
    title: 'Prompt Images',
    desc: 'Raise your video with video and beautiful glows.',
    emojis: { left: '😎', right: '😁' },
    prompt: 'Add ambient glowing effects and slow zoom transitions to highlight product details.'
  },
  {
    id: 'goodit-images',
    title: 'Goodit Images',
    desc: 'Raise your video with cool animations and graphics.',
    emojis: { left: '😴', right: '👀' },
    prompt: 'Overlay modern motion graphics, lower-thirds text, and micro-animations.'
  },
  {
    id: 'fishling',
    title: 'Fishling',
    desc: 'Raise your video with audio, SFX and voice-over.',
    emojis: { left: '🤣', right: '🥰' },
    prompt: 'Mix a background lofi music bed and snap click sound effects on every transition.'
  }
];

import { useEffect } from 'react';

export default function AIPanel({ onSubmit, onUpload, busy, disabled, log = [], stage, error, hasResult, width = 320 }) {
  const [prompt, setPrompt] = useState('');
  const [strategy] = useState('proportional');
  const [withAudio] = useState(true);
  const [firstFrame, setFirstFrame] = useState(null);
  const [lastFrame, setLastFrame] = useState(null);
  const [mode, setMode] = useState('Agent');
  const [agentImage, setAgentImage] = useState(null);
  const [agentImageUrl, setAgentImageUrl] = useState('');
  const [framesType, setFramesType] = useState('Frames');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState('5s');

  const [messages, setMessages] = useState([
    {
      sender: 'agent',
      text: "Hi! I'm your Nano Banana AI video editing agent. Describe what you'd like to create today or choose a preset template below to get started."
    }
  ]);
  const [stageMessagesLogged, setStageMessagesLogged] = useState(new Set());

  // Keep chat updated with agent progress
  useEffect(() => {
    if (!stage || stage === 'idle') return;

    if (stageMessagesLogged.has(stage)) return;
    setStageMessagesLogged((prev) => {
      const next = new Set(prev);
      next.add(stage);
      return next;
    });

    let text = '';
    let tools = [];

    switch (stage) {
      case 'ingest':
        text = "Loading and reading media streams...";
        tools = ['read_media_metadata', 'extract_audio_track'];
        break;
      case 'plan':
        text = "Analyzing your instructions and planning video cuts using Gemini...";
        tools = ['gemini_chat_model', 'intent_parsing'];
        break;
      case 'beats':
        text = "Analyzing audio tracks for beats and pacing...";
        tools = ['beat_detection', 'onset_strength'];
        break;
      case 'fit':
        text = "Fitting the video segments and b-roll cuts to the audio track...";
        tools = ['align_segments', 'trim_fit_duration'];
        break;
      case 'render':
        text = "Rendering, compositing, and stitching the custom timeline using FFmpeg engine...";
        tools = ['ffmpeg_trim', 'ffmpeg_concat', 'ffmpeg_mix'];
        break;
      case 'done':
        text = "Render complete! The final edited video is ready in the viewer.";
        break;
      default:
        return;
    }

    setMessages((prev) => [...prev, { sender: 'agent', text, tools }]);
  }, [stage, stageMessagesLogged]);

  // Reset log tracking when a new render starts (busy becomes true)
  useEffect(() => {
    if (busy) {
      setStageMessagesLogged(new Set());
    }
  }, [busy]);

  const submit = () => {
    const text = prompt.trim();
    if (text && !busy && !disabled) {
      setMessages((prev) => [...prev, { sender: 'user', text }]);
      onSubmit(text, {
        strategy,
        withAudio,
        mode,
        framesType,
        aspectRatio,
        duration: mode === 'Agent' ? null : duration,
        firstFrame,
        lastFrame,
      });
      setPrompt(''); // Clear input box
    }
  };

  return (
    <aside style={{ width: `${width}px` }} className="flex shrink-0 flex-col border-r border-panel-700 bg-panel-850 transition-[width] duration-75">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 text-sm font-semibold tracking-wide text-slate-300 border-b border-panel-700/40">
        <span className="text-banana-400">AI Agent</span>
      </div>

      {/* Conversation list with suggestions */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 flex flex-col custom-scrollbar">
        {messages.map((msg, index) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={index}
              className={`flex flex-col max-w-[85%] ${
                isUser ? 'self-end items-end' : 'self-start items-start'
              } animate-fade-in`}
            >
              {/* Bubble */}
              <div
                className={`px-4 py-3 text-xs font-semibold leading-relaxed shadow-sm ${
                  isUser
                    ? 'bg-panel-700/90 text-slate-100 rounded-2xl rounded-tr-sm border border-panel-600'
                    : 'bg-panel-800 text-slate-300 rounded-2xl rounded-tl-sm border border-panel-700'
                }`}
              >
                {msg.text}
                
                {/* Tool Executions */}
                {msg.tools && msg.tools.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1 font-mono text-[9px] text-cyan-400 bg-panel-900/60 px-2 py-1.5 rounded-lg border border-panel-700/60">
                    <span className="font-bold text-slate-500">✦</span>
                    {msg.tools.join(', ')}
                  </div>
                )}
              </div>

              {/* Thumbs / Feedback row under agent bubble */}
              {!isUser && (
                <div className="flex gap-2 mt-1 ml-1 text-slate-500 opacity-60 hover:opacity-100 transition-opacity">
                  <button title="Thumbs Up" className="hover:text-slate-300 p-0.5"><ThumbsUp className="h-3 w-3" /></button>
                  <button title="Thumbs Down" className="hover:text-slate-300 p-0.5"><ThumbsDown className="h-3 w-3" /></button>
                  <button title="Copy" className="hover:text-slate-300 p-0.5"><Copy className="h-3 w-3" /></button>
                </div>
              )}
            </div>
          );
        })}

        {/* Suggestion presets shown only when chat is brand new */}
        {messages.length <= 1 && (
          <div className="mt-2 border-t border-panel-700/40 pt-4 animate-fade-in">
            <h2 className="mb-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Suggestions Templates:
            </h2>
            <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
              {PRESETS.map((card) => (
                <button
                  key={card.id}
                  onClick={() => setPrompt(card.prompt)}
                  disabled={disabled}
                  className="group flex flex-col justify-between rounded-xl border border-panel-700 bg-panel-800 p-2.5 text-left transition-all hover:border-panel-600 active:scale-98 disabled:opacity-40"
                >
                  <div className="flex justify-between items-center w-full text-xs mb-1.5">
                    <span>{card.emojis.left}</span>
                    <span>{card.emojis.right}</span>
                  </div>
                  <h3 className="text-[10px] font-bold text-slate-200 truncate group-hover:text-banana-400">
                    {card.title}
                  </h3>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Seedance-style Command Console */}
      <div className="mx-3 mb-3 rounded-2xl border border-panel-700 bg-panel-800 p-3 shadow-inner-glow flex flex-col gap-2.5">
        
        {/* Conditional Image Upload Row */}
        {mode === 'Agent' ? (
          /* Agent Mode: Single Backdrop/B-roll Image Box */
          <div className="flex flex-col gap-1.5 animate-fade-in">
            <label className="relative flex h-12 w-full cursor-pointer items-center gap-3 rounded-lg border border-dashed border-panel-600 bg-panel-850 hover:bg-panel-750 hover:border-panel-500 transition-all px-3">
              {agentImage ? (
                <div className="flex items-center gap-2.5 w-full min-w-0">
                  <img src={agentImageUrl} alt="Upload preview" className="h-8 w-8 object-cover rounded" />
                  <span className="text-[11px] text-slate-300 truncate font-semibold flex-1">{agentImage.name}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAgentImage(null); setAgentImageUrl(''); }}
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-panel-700 text-xs text-slate-300 hover:bg-red-500 hover:text-white transition-colors"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="text-sm font-bold text-banana-400">+</span>
                  <span className="text-[11px] font-semibold text-slate-400">Upload Backdrop / Reference Image</span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setAgentImage(file);
                    setAgentImageUrl(URL.createObjectURL(file));
                    onUpload?.([file], { appendToTimeline: false });
                    setPrompt((prev) => {
                      const suffix = ` Replace background with ${file.name}`;
                      if (!prev.trim()) return `Replace the background with ${file.name}`;
                      if (prev.toLowerCase().includes(file.name.toLowerCase())) return prev;
                      return prev.trim() + suffix;
                    });
                  }
                }}
              />
            </label>
          </div>
        ) : (
          /* Video/Image Gen Mode: First Frame / Last Frame Row */
          <div className="flex gap-2 animate-fade-in">
            {/* First Frame Box */}
            <label className="relative flex h-12 w-14 shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-panel-600 bg-panel-850 hover:bg-panel-750 hover:border-panel-500 transition-colors">
              {firstFrame ? (
                <div className="relative h-full w-full group">
                  <img src={firstFrame} alt="First Frame" className="h-full w-full object-cover rounded-lg" />
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setFirstFrame(null); }}
                    className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white hover:bg-red-600"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-0.5">
                  <span className="text-[10px] text-slate-400 font-bold leading-none">+</span>
                  <span className="text-[8px] text-slate-500 font-semibold mt-0.5 leading-tight">First Frame</span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setFirstFrame(URL.createObjectURL(file));
                }}
              />
            </label>

            {/* Last Frame Box */}
            <label className="relative flex h-12 w-14 shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-panel-600 bg-panel-850 hover:bg-panel-750 hover:border-panel-500 transition-colors">
              {lastFrame ? (
                <div className="relative h-full w-full group">
                  <img src={lastFrame} alt="Last Frame" className="h-full w-full object-cover rounded-lg" />
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setLastFrame(null); }}
                    className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white hover:bg-red-600"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-0.5">
                  <span className="text-[10px] text-slate-400 font-bold leading-none">+</span>
                  <span className="text-[8px] text-slate-500 font-semibold mt-0.5 leading-tight">Last Frame</span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setLastFrame(URL.createObjectURL(file));
                }}
              />
            </label>
          </div>
        )}

        {/* Text Area */}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
          rows={2}
          disabled={disabled}
          placeholder={mode === 'Agent' ? "Ask the AI video editor to edit, cut, or style your video..." : "Describe the video you want PromptCut 2.0 to generate..."}
          className="w-full resize-none rounded-lg border border-panel-700/50 bg-panel-850/50 px-2.5 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-panel-600 transition-colors disabled:opacity-50"
        />

        {/* Parameter Row */}
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
          <div className="flex flex-1 items-center gap-1 flex-wrap min-w-0">
            {/* Mode selection dropdown */}
            <DropdownSelect
              icon={mode === 'Agent' ? <Bot className="h-3.5 w-3.5 text-banana-400" /> : <Video className="h-3 w-3" />}
              value={mode}
              options={['Video Gen', 'Image Gen', 'Agent']}
              onChange={setMode}
            />

            {/* Other dropdowns only show when NOT in Agent mode */}
            {mode !== 'Agent' && (
              <>
                {/* Frames selection dropdown */}
                <DropdownSelect
                  icon={<Image className="h-3 w-3" />}
                  value={framesType}
                  options={['Frames', 'Motion']}
                  onChange={setFramesType}
                />

                {/* Aspect ratio selection dropdown */}
                <DropdownSelect
                  value={aspectRatio}
                  options={['16:9', '9:16', '1:1']}
                  onChange={setAspectRatio}
                />

                {/* Duration selection dropdown */}
                <DropdownSelect
                  value={duration}
                  options={['5s', '10s', '15s']}
                  onChange={setDuration}
                />
              </>
            )}
          </div>

          {/* Cyan Execute Button */}
          <button
            onClick={submit}
            disabled={busy || disabled || !prompt.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-400 text-panel-950 font-bold hover:bg-cyan-300 active:scale-95 disabled:opacity-35 disabled:pointer-events-none transition-all shadow-[0_0_10px_rgba(34,211,238,0.35)]"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Square className="h-3 w-3 fill-current" />
            )}
          </button>
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

const STAGE_LABEL = {
  ingest: 'Reading media',
  engine: 'Loading FFmpeg engine',
  beats: 'Detecting beats',
  transcribe: 'Transcribing narration',
  plan: 'Analyzing intent (Gemini)',
  fit: 'Fitting clips to the voice-over',
  background: 'Creating the backdrop',
  render: 'Rendering & compositing (FFmpeg)',
  audio: 'Generating audio',
  done: 'Done',
  idle: 'Idle',
};

function ActivityFeed({ log, stage, busy, error, hasResult }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-3 animate-fade-in">
      {/* Headline status */}
      <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-panel-600/60 bg-panel-750 px-3 py-2.5">
        {error ? (
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
        ) : busy ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-banana-400" />
        ) : hasResult ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
        ) : (
          <Activity className="h-5 w-5 shrink-0 text-slate-400" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-100">
            {error ? 'Something went wrong' : busy ? (STAGE_LABEL[stage] || 'Working') + '…' : hasResult ? 'Render complete' : 'Ready'}
          </div>
          <div className="text-[11px] text-slate-500">
            {busy ? 'This can take a minute for long clips' : error ? 'See details below' : hasResult ? 'Preview is in the Viewer' : ''}
          </div>
        </div>
      </div>

      {/* Error detail */}
      {error && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[11px] leading-relaxed text-red-200">
          {error}
        </div>
      )}

      {/* Step log */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-panel-600/40 bg-panel-900/40 p-2.5">
        {log.length === 0 ? (
          <p className="text-[11px] text-slate-600">Waiting for the agent…</p>
        ) : (
          <ul className="space-y-1.5">
            {log.slice(-30).map((e, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] leading-snug">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-banana-500/70" />
                <span className="text-slate-400">
                  <span className="font-medium text-slate-500">[{e.stage}]</span> {e.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DropdownSelect({ icon, value, options, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1 cursor-pointer text-slate-400 hover:text-slate-200 transition-colors font-semibold py-1 px-1.5 rounded-lg hover:bg-panel-750 select-none"
      >
        {icon}
        <span>{value}</span>
        <ChevronDown className="h-3 w-3 text-slate-500 transition-transform duration-200" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
      </button>

      {isOpen && (
        <ul className="absolute bottom-full mb-2.5 left-0 z-50 min-w-[120px] rounded-xl border border-panel-700 bg-panel-800/95 backdrop-blur-md p-1.5 shadow-2xl animate-fade-in flex flex-col gap-0.5">
          {options.map((opt) => (
            <li key={opt}>
              <button
                type="button"
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                  value === opt
                    ? 'bg-banana-500/10 text-banana-400'
                    : 'text-slate-300 hover:bg-panel-750 hover:text-slate-100'
                }`}
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
