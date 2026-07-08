# PromptCut — Build Session Summary

This document summarizes the development session that produced PromptCut: what was
built, the key problems encountered, the root causes, and how each was solved.
It doubles as an engineering changelog / decision log.

---

## 1. Starting point — project scaffold

- Established a **local‑first, prompt‑based AI video editor** MVP.
- Created an npm‑workspaces monorepo: `frontend` (React + Vite + Tailwind) and
  `backend-agent` (JS orchestration + FFmpeg.wasm), with strict UI ⇄ logic
  separation via a single `useOrchestrator()` hook.
- Built the core services: **Groq** (Whisper STT), **Gemini** (edit‑plan agent,
  strict JSON), **ElevenLabs** (SFX/music), plus `ffmpegHelper` and `videoMath`.
- Rebuilt the UI to mirror **ChatCut** (Agent • Media • Player • Timeline).

## 2. Getting the core engine to actually run (the hard part)

A sequence of real, diagnosed bugs — each fixed at the root, not patched:

| # | Symptom | Root cause | Fix |
|---|---|---|---|
| 1 | "Nothing happens" on Generate | `gemini-1.5-pro` **retired** (404) | Switched to `gemini-2.5-flash` (tested JSON mode live) |
| 2 | No visible feedback | Activity log wasn't surfaced | Added a live status/log feed in the Agent panel |
| 3 | Transcription hung forever | **FFmpeg.wasm never loaded** — Vite couldn't resolve the worker; then the **UMD core** failed with *"Cannot find module 'blob:'"* | Diagnosed via an isolated `ffmpeg-test.html`; switched to the **ESM core** (worker loads it via `import()`) |
| 4 | Concurrent transcribe calls deadlocked | FFmpeg.wasm is a single, non‑reentrant instance | Added a shared in‑flight promise (de‑dupe) |
| 5 | Green screen not removed | Real key color is `~0x198D34`, not pure `0x00FF00` | **Auto‑detect** the key color by sampling a corner frame |
| 6 | Speaker appeared transparent | Chroma `similarity` too high ate the subject | Tuned `similarity ≈ 0.08` |
| 7 | Green halo on edges | Green spill | Added **spill suppression** (`colorchannelmixer`) |
| 8 | Uploaded background image ignored | `_resolveBackground` only did AI/gradient | Added an **uploaded‑image backdrop** path |

Everything above was validated **on the user's real green‑screen footage** using a
system FFmpeg to mirror the exact `ffmpegHelper` commands before shipping.

## 3. Feature build‑out (FFmpeg engine)

- **Beat / rhythm sync** — `audioBeats.js` detects transients with the Web Audio
  API (no FFmpeg); `videoMath.js` aligns SFX to beats at millisecond precision;
  Gemini acts as a "Rhythm Coordinator."
- **Composite / chroma‑key engine** — `compositeChromaKey`, `synthesizeBackdrop`,
  layered intent detection in the Gemini agent (`background.action`, key color,
  similarity, blend).
- **Burned‑in captions** — `captions.js` renders cues to canvas PNGs; FFmpeg
  overlays them with `enable='between(t,…)'` (avoids the missing `libass`/`drawtext`).
- **Audio** — multi‑track `amix`, "replace" vs "add" audio intents, per‑layer
  volume, `-c:v copy` when no visual filter is needed.
- **Resilience** — Groq STT gained an automatic **Gemini audio fallback** (Groq
  is often CORS‑blocked in the browser); heavy clips **auto‑downscale to 720p**.
- **Transcript‑only** and **captions‑only** fast paths that skip rendering.

## 4. Adding Remotion (motion‑graphics engine)

The user wanted the creative, ChatCut‑style motion graphics that FFmpeg can't do.

- Installed **Remotion + `@remotion/player`**; built a compositor
  (`PromptCutComposition`), a live preview (`RemotionPreview`), and components.
- Iterated the **agent contract** from a flat schema → a v2 tracks schema →
  the final **v3 "scenes" schema** (5‑second scenes, each with a
  `backgroundAsset` and layered `motionGraphics`).
- Moved the scene director to a **Python FastAPI service using Groq**
  (`llama-3.3-70b-versatile`) — server‑side, so no browser CORS and no Gemini
  quota limits. This is what the user asked for ("let it take the scenes from
  Groq").

### Why "no creativity / doesn't complete a second" — and the fix
The agent and components were fine; the problems were in *presentation*:
- A leftover **`TestRemotionOverlay` ("Remotion is live")** debug layer.
- The **Player had no `controls`** → the preview looked frozen.
- A long uploaded clip **padded the composition with black**.
- Scene‑internal timing was ignored.

Fixes: removed the debug overlay, restored `controls autoPlay loop`, used the
timeline duration in scenes mode, and wrapped each scene's motion graphics in
`<Sequence>`s with relative timing.

### Premium graphics + editor polish
- Upgraded `HudRing` (multi‑ring rotating sci‑fi HUD with ticks, scanner, glow),
  `PulseWave` (layered glowing waveform + equalizer + running highlight), and
  richer scene backgrounds (grid + accent glow + vignette).
- Tuned the Groq director to produce **2–4 staggered, layered motion graphics
  per scene** (`temperature 0.75`, `max_tokens 8000`).
- Surfaced scenes on a dedicated **timeline track (S1)**.
- Added a **Property Panel** for live text/color/size/animation/timing edits.
- Added **scene isolation**: scenes appear as Media cards; click one to preview
  it alone (rebased to frame 0).

## 5. Architecture summary (final state)

- **One agent surface, two engines.** Footage editing (FFmpeg.wasm) and
  generative motion graphics (Remotion) are routed by `App#smartSubmit`.
- **Local‑first.** Editing/compositing/preview all run in the browser.
- **Thin agents.** Gemini compiles the FFmpeg edit plan; a Groq‑powered Python
  service compiles the Remotion scene timeline.

## 6. Notable environment issues (not code)

- **Windows `%TEMP%` became unwritable**, which broke Vite/esbuild and the dev
  server. Worked around by redirecting `TEMP`/`TMP` to `E:\clipmind\_tmp`.
- **Gemini free‑tier quotas** (429) and **image‑gen quota = 0** — mitigated with
  retries, the Groq director, and graceful gradient fallbacks.

## 7. Open items / next steps

1. **AI asset generation** for `ai_image` / `ai_video` scenes (currently
   placeholders) — wire a text‑to‑image/video provider.
2. **Final MP4 export of the Remotion composition** (client‑side WebCodecs or a
   server render) — Export currently downloads the FFmpeg result.
3. Deeper **per‑scene editing** and transitions between scenes.
4. Move client‑bundled API keys behind a proxy for any public deployment.

---

*Generated as an engineering summary of the PromptCut build session.*
