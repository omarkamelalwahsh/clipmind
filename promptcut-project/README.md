# PromptCut — Nano Banana AI Engine

> A **local‑first, prompt‑driven AI video editor**. Describe an edit or a whole
> motion‑graphics video in plain language and PromptCut plans it, renders it, and
> previews it live in the browser — matching the workflow of tools like ChatCut.

PromptCut combines **two rendering engines** behind one AI agent layer:

1. **FFmpeg.wasm pipeline** — pixel‑level editing of *real footage* entirely in
   the browser: green‑screen removal, background replacement, burned‑in captions,
   beat‑synced SFX/music, multi‑track audio mixing.
2. **Remotion compositor** — programmatic, React‑based *motion graphics*:
   frame‑accurate animated scenes (pulse waves, HUD rings, kinetic typography)
   previewed live with `@remotion/player`.

The cloud is used only as a thin **orchestrator of AI agents** through lightweight
external APIs (Groq, Gemini, ElevenLabs) plus one small Python service for the
motion‑graphics director.

---

## Table of contents

- [Vision & principles](#vision--principles)
- [Feature overview](#feature-overview)
- [Architecture](#architecture)
- [Tech stack & external APIs](#tech-stack--external-apis)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [The two engines in detail](#the-two-engines-in-detail)
- [AI agent contracts (JSON schemas)](#ai-agent-contracts-json-schemas)
- [How a request flows](#how-a-request-flows)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)
- [Security](#security)

---

## Vision & principles

- **The prompt is the director.** A single natural‑language request is compiled
  into a strict, machine‑readable timeline that drives the renderers.
- **Local‑first.** All heavy media processing runs client‑side (FFmpeg.wasm and
  Remotion). Media never leaves the user's machine for editing/compositing.
- **Decoupled.** The UI is "dumb": it renders state and plays local Blob URLs.
  All logic lives in the agent/orchestration layer.
- **Two engines, one agent.** Footage editing (FFmpeg) and generative motion
  graphics (Remotion) share the same chat‑style agent surface.

---

## Feature overview

### Footage editing (FFmpeg.wasm)
| Feature | Description |
|---|---|
| **Speech‑to‑text** | Word‑level transcript via Groq Whisper `whisper-large-v3`, with an automatic **Gemini audio fallback** if the browser blocks Groq (CORS). |
| **Green‑screen removal** | **Auto‑detects the actual key color** from the footage (real green screens are ~`0x198D34`, not pure `0x00FF00`), keys it out, and applies **green‑spill suppression** so edges stay clean. |
| **Background replacement** | Composite the keyed speaker over an **uploaded image**, an **AI‑generated backdrop** (Gemini image model when quota allows), or a locally synthesized gradient. |
| **Burned‑in captions** | Renders synced subtitles to transparent PNGs (canvas) and overlays them — no `libass`/`drawtext` needed in the core. |
| **Beat / rhythm sync** | Detects musical beats with the **Web Audio API** (no FFmpeg), then aligns SFX triggers to the nearest beat with millisecond precision. |
| **Generative audio** | SFX and music beds via ElevenLabs, mixed as multi‑track audio (`amix`) with per‑layer volume; supports "replace" vs "add" audio intents. |
| **Auto‑downscale** | Heavy 1080p/4K clips are capped to 720p before processing to stay light in the browser. |

### Motion graphics (Remotion)
| Feature | Description |
|---|---|
| **Scene director agent** | A Python "Cognitive Video Director" (Groq `llama-3.3-70b-versatile`) splits a script/prompt into continuous **5‑second scenes** (150 frames @ 30 fps). |
| **Premium components** | `pulse_wave` (layered glowing waveform + equalizer), `hud_ring` (multi‑ring rotating sci‑fi HUD with ticks & scanner), `kinetic_text` (word‑by‑word pop / typewriter, Montserrat/#FFFFFF). |
| **Layered scenes** | Each scene stacks 2–4 motion graphics with staggered entrances (background element first, text after) over `gradient_mesh` / `grid_overlay` backdrops. |
| **Live preview** | `@remotion/player` renders everything frame‑accurately in the browser — no server render for preview. |
| **Property Panel** | Edit any element's text / color / size / animation / timing **live**; the player re‑renders instantly. |
| **Scene isolation** | Generated scenes appear as clickable cards in the Media panel and on a dedicated **timeline track**; click one to preview it alone. |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite)                        │
│   ChatCut-style UI: Agent • Media • Player • Timeline • Properties     │
│                                                                        │
│   useOrchestrator() ── the single seam to all logic                    │
└───────────────┬───────────────────────────────────┬──────────────────┘
                │                                     │
     ┌──────────▼───────────┐             ┌───────────▼─────────────┐
     │  backend-agent (JS)  │             │  Remotion (client-side) │
     │  orchestrator.js     │             │  @remotion/player       │
     │  + FFmpeg.wasm        │             │  scenes → components    │
     │                       │             └───────────┬─────────────┘
     │  services/            │                         │ scenes JSON
     │   groqService         │             ┌───────────▼─────────────┐
     │   geminiService       │             │  fastapi-backend (Py)   │
     │   geminiImageService  │             │  /api/generate-timeline │
     │   elevenLabsService   │             │  Groq LLM director      │
     │   remotionAgentService│────────────▶│                         │
     │  utils/ ffmpegHelper  │             └─────────────────────────┘
     │   audioBeats, videoMath│
     │   captions            │
     └───────────────────────┘
                │
        External APIs: Groq (Whisper + LLM) · Gemini · ElevenLabs
```

- **`backend-agent`** is a *logical* layer, not a server. It runs inside the
  browser bundle (via an npm workspace). Its modules receive API keys by
  injection, so the same code could run behind a proxy for hardening.
- **`fastapi-backend`** is the only always‑server piece: it hosts the Remotion
  scene director (Groq) so the LLM call is server‑side (no browser CORS/quota
  headaches) and reads keys from `frontend/.env`.

---

## Tech stack & external APIs

| Layer | Technology |
|---|---|
| UI | React 18, Vite 5, Tailwind CSS, Lucide icons |
| Client video | FFmpeg.wasm (`@ffmpeg/ffmpeg` **ESM core** + `@ffmpeg/util`) |
| Motion graphics | Remotion + `@remotion/player` |
| Beat detection | Web Audio API (`AudioContext.decodeAudioData`) |
| Agent service | Python FastAPI + `groq` SDK |

| API | Used for |
|---|---|
| **Groq** | Whisper `whisper-large-v3` STT **and** the LLM video director (`llama-3.3-70b-versatile`) |
| **Google Gemini** | Edit‑plan agent (`gemini-2.5-flash`, JSON mode + responseSchema), STT fallback, image backdrops (`gemini-2.5-flash-image`) |
| **ElevenLabs** | SFX (`/v1/sound-generation`) and music beds |

> **Model note:** `gemini-1.5-pro` was retired from the Generative Language API;
> the agent uses `gemini-2.5-flash`. Image generation needs paid quota (free tier
> returns 429 `limit: 0`), so background generation gracefully falls back to a
> locally synthesized gradient.

---

## Repository layout

```
promptcut-project/
├── frontend/                     # React + Vite app (the UI + client engines)
│   ├── src/
│   │   ├── App.jsx               # Master dashboard (5-pane ChatCut layout)
│   │   ├── hooks/
│   │   │   └── useOrchestrator.js # The single seam UI ⇄ backend-agent
│   │   ├── components/
│   │   │   ├── AIPanel.jsx        # Agent chat + presets + command bar
│   │   │   ├── AssetsPanel.jsx    # Media / Library / Transcript / Properties
│   │   │   ├── Viewer.jsx         # Player (video OR Remotion preview)
│   │   │   ├── Timeline.jsx       # Multi-track timeline (V1/A1/S1/T1)
│   │   │   ├── PropertyPanel.jsx  # Live property editor
│   │   │   ├── TopBar.jsx / Sidebar.jsx
│   │   └── remotion/             # Remotion compositions & components
│   │       ├── PromptCutComposition.jsx  # Unified compositor
│   │       ├── RemotionPreview.jsx        # @remotion/player wrapper
│   │       ├── Scene.jsx                  # Scene + motion-graphic dispatch
│   │       ├── PulseWave.jsx / HudRing.jsx / KineticText.jsx
│   │       └── KineticCaptions.jsx        # Word-synced captions
│   └── .env                      # API keys (gitignored)
│
├── backend-agent/                # JS orchestration + FFmpeg (bundled into frontend)
│   ├── orchestrator.js           # Master agent: coordinates the whole pipeline
│   ├── services/
│   │   ├── groqService.js        # STT (Groq Whisper) + Gemini fallback
│   │   ├── geminiService.js      # Edit-plan agent (strict JSON)
│   │   ├── geminiImageService.js # AI backdrop generation
│   │   ├── elevenLabsService.js  # SFX / music
│   │   └── remotionAgentService.js # Bridge → Python scene director
│   └── utils/
│       ├── ffmpegHelper.js       # FFmpeg.wasm wrapper (trim, chromakey, captions, mix)
│       ├── audioBeats.js         # Web Audio beat detection
│       ├── videoMath.js          # Auto-trim + beat alignment math
│       └── captions.js           # Canvas caption cue rendering
│
└── fastapi-backend/              # Python service for the Remotion scene director
    └── main.py                   # /api/generate-timeline (Groq)
```

---

## Getting started

### Prerequisites
- Node.js 18+
- Python 3.11+ (for the motion‑graphics director)
- API keys: **Groq**, **Gemini**, **ElevenLabs**

### 1) Configure keys
Create `frontend/.env`:
```bash
VITE_GROQ_API_KEY=your_groq_key
VITE_GEMINI_API_KEY=your_gemini_key
VITE_ELEVENLABS_API_KEY=your_elevenlabs_key
```

### 2) Run the frontend
```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

### 3) Run the motion‑graphics director (for Remotion scenes)
```bash
cd fastapi-backend
python -m venv venv && venv\Scripts\activate      # Windows
pip install -r requirements.txt                    # fastapi, uvicorn, groq, python-dotenv
python main.py                                     # http://localhost:8000
```
The FastAPI service reads keys from `../frontend/.env`, so you don't duplicate them.

> **Windows temp‑dir tip:** if Vite/esbuild fails with a `vite.config.js.timestamp-*.mjs`
> `ENOENT`/permission error, your `%TEMP%` is full or locked. Clear `%temp%` or
> redirect it: `set TEMP=E:\clipmind\_tmp && npm run dev`.

---

## The two engines in detail

### Engine A — FFmpeg.wasm pipeline (`backend-agent`)
Coordinated by `orchestrator.js#planAndRender`:
1. **Beat analysis** (Web Audio) and **transcription** (Groq → Gemini fallback) run first.
2. **Gemini** compiles an *Edit Decision List* (strict JSON): intents, background
   action, captions flag, audio layers, timeline cuts.
3. If effects were requested but no explicit cuts, the **whole clip becomes one
   segment** so effects apply to the full video.
4. **Background**: auto‑detect key color → composite over uploaded image / AI
   image / gradient, with spill suppression.
5. **Captions**: transcript → cues → canvas PNGs → timed overlays.
6. **Audio**: generate SFX/music, beat‑align, and mix (`amix`), copying the video
   stream when no visual filter is needed.
7. Returns a local Blob URL + plain timeline/track model.

Key FFmpeg technicalities solved:
- Uses the **ESM core** (`@ffmpeg/core@0.12.6/dist/esm`) because the worker loads
  the core via `import()` — the UMD core fails with *"Cannot find module 'blob:'"*.
- Auto‑downscale to 720p for heavy clips.

### Engine B — Remotion compositor (`frontend/src/remotion`)
- `PromptCutComposition` renders **scenes mode** (creative `timeline.scenes[]`)
  or **overlay mode** (base video + captions + standalone motion graphics).
- `RemotionPreview` mounts `@remotion/player` with `controls autoPlay loop`.
- Each scene's motion graphics are wrapped in `<Sequence>`s at their relative
  frames so elements enter on their own beat.
- The Python director (Groq) produces the scenes; the JS
  `remotionAgentService` forwards the prompt and normalizes the result.

---

## AI agent contracts (JSON schemas)

### Edit‑plan (FFmpeg engine — Gemini)
`geminiService.js` enforces a strict JSON EDL with fields such as `intents`,
`background { action, keyColor, similarity, blend }`, `burnCaptions`,
`replaceOriginalAudio`, `timeline[]`, and `audioLayers[]`.

### Motion‑graphics scenes (Remotion engine — Groq, v3)
`fastapi-backend/main.py` emits:
```jsonc
{
  "projectSettings": { "width": 1920, "height": 1080, "fps": 30, "totalDurationInFrames": 450 },
  "timeline": {
    "scenes": [
      {
        "sceneId": "scene_1",
        "startFrame": 0, "endFrame": 150,
        "narrationScript": "…",
        "backgroundAsset": { "type": "gradient_mesh", "colors": ["#FF007F", "#00E5FF"] },
        "motionGraphics": [
          { "id": "pw1", "type": "pulse_wave",  "startFrame": 0,  "endFrame": 150, "properties": { "color": "#FF007F", "speed": 2, "amplitude": 90 } },
          { "id": "kt1", "type": "kinetic_text", "startFrame": 20, "endFrame": 150, "properties": { "text": "…", "animationStyle": "word-by-word-pop", "color": "#FFFFFF" } }
        ]
      }
    ]
  }
}
```
Scenes are continuous (`endFrame` of one == `startFrame` of the next) and each
carries 2–4 layered, staggered motion graphics.

---

## How a request flows

1. User types a prompt in the **Agent** panel.
2. `App#smartSubmit` routes it:
   - motion keywords, **or** a "make/create a video/promo/scenes" request with
     no uploaded footage → **Remotion** (`generateMotionGraphics`).
   - otherwise → **FFmpeg** (`render`).
3. The chosen engine runs; the **Player** shows the live result (video or
   Remotion), the **Timeline** reflects tracks/scenes, and the **Property Panel**
   exposes live‑editable properties.

---

## Known limitations

- **AI asset generation** (`ai_image` / `ai_video` scene backgrounds, realistic
  character shots) is *not wired* — those scenes show placeholders. Real
  generation needs a text‑to‑image/video provider (e.g. Flux/Imagen/Kling).
- **Final MP4 export of Remotion** is not yet implemented; the composition
  previews live and Export currently downloads the FFmpeg result. A client‑side
  WebCodecs render (or server render) is the planned next step.
- **Gemini image generation** requires paid quota (free tier = 0).
- Heavy 4K/long clips are slow in FFmpeg.wasm even after downscaling.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Motion‑graphics request fails instantly | The **Python backend isn't running** — start `fastapi-backend/main.py` (`:8000`). |
| `429 … exceeded your current quota` | Gemini free‑tier limit — wait ~60s, or rely on the Groq paths. |
| Green screen not removed | Old build using pure green — the current build auto‑detects the color. Hard‑refresh. |
| Avatar looks transparent | Chroma similarity too high — current default is tuned (`~0.08` + despill). Hard‑refresh. |
| Vite won't start (temp ENOENT) | Clear `%temp%` or set `TEMP` to a writable folder. |

---

## Security

- API keys shared during development should be treated as **compromised and
  rotated**. Keep real keys only in `frontend/.env` (gitignored).
- In this MVP, client‑bundled keys are exposed to anyone using the app. For any
  public deployment, move the `backend-agent` services behind a proxy and remove
  the keys from the frontend.

---

*PromptCut — describe it, and watch it render.*
