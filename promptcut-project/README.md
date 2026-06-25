# PromptCut — Nano Banana AI Engine

A **local-first**, prompt-based AI video editing MVP. All heavy lifting (video
decode, trimming, timeline assembly, playback) happens **in the browser** via
`FFmpeg.wasm`. The cloud is used only as a thin **orchestrator of AI agents**
through lightweight external APIs.

## Architecture

```
promptcut-project/
├── frontend/        # "Dumb" UI. Renders timeline, plays local Blob URLs.
└── backend-agent/   # AI logic + orchestration. Decoupled from the UI.
```

The UI never talks to an external API directly. It hands user input + raw media
blobs to the **orchestrator**, which coordinates:

1. `ffmpegHelper` — extract audio / trim / concat (FFmpeg.wasm, client-side)
2. `groqService` — Whisper `whisper-large-v3` word-level transcription
3. `geminiService` — Gemini 1.5 Pro agent → **strict JSON** edit plan
4. `videoMath` — auto-trim math so inserts never exceed the voice-over
5. `elevenLabsService` — generated SFX / background music

The orchestrator returns local `URL.createObjectURL` blobs + a timeline model.
The UI just renders and plays them.

## The "backend-agent" is a *logical* layer, not a server

Every module here is environment-agnostic: it receives its API keys via an
injected config object instead of reading `process.env`/`import.meta.env`
directly. That means you can run it two ways:

- **MVP (default):** imported straight into the browser bundle. Fastest path,
  but your API keys ship to the client. Fine for a local demo, **not** for
  public deployment.
- **Hardened:** drop the same modules behind a tiny Node/Edge proxy so keys stay
  server-side. No code changes needed — only where you inject the keys.

## Quick start

```bash
cd frontend
npm install
cp .env.example .env   # then fill in your keys
npm run dev
```

## ⚠️ Security: rotate your keys

The keys shared during setup (Groq / Gemini / ElevenLabs) were transmitted in
plaintext chat. **Rotate all three now** and put the new ones only in
`frontend/.env` (gitignored). Never commit real keys.
