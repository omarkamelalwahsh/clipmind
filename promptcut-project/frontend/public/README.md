# Static / fallback assets

Drop default audio here for when generation is disabled or an ElevenLabs call
fails. They're served from the web root (e.g. `/fallback-whoosh.mp3`).

Suggested files:
- `fallback-whoosh.mp3` — generic transition SFX
- `fallback-music.mp3`  — neutral background bed
- `silence-1s.mp3`      — padding spacer

The orchestrator treats generated audio as optional, so the app still renders
video without these — they're purely a graceful-degradation convenience.
