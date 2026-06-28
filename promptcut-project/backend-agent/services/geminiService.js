/**
 * geminiService.js
 * -----------------------------------------------------------------------------
 * The core reasoning agent. Takes the user's natural-language prompt + the
 * concrete media metadata (transcript words, available clips, durations) and
 * returns a STRICT JSON edit plan — never prose, never markdown fences.
 *
 * Strict JSON is enforced three ways:
 *   1. A system instruction that forbids any non-JSON output.
 *   2. `generationConfig.response_mime_type = "application/json"`.
 *   3. A `responseSchema` so the model is constrained to our exact shape.
 * A defensive parser still strips stray fences just in case.
 */

// NOTE: gemini-1.5-pro was retired from the Generative Language API. 2.5-flash is
// fast, cheap, and supports JSON mode + responseSchema — ideal for the agent.
const MODEL = 'gemini-2.5-flash';
const ENDPOINT = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

const SYSTEM_INSTRUCTION = `You are PromptCut's edit-planning agent. The user's prompt is the MASTER DIRECTOR.
You convert an editing request plus media metadata into a single, machine-readable EDIT PLAN (an Edit Decision List).

HARD RULES:
- Output ONLY a JSON object that conforms to the provided schema. No prose, no markdown, no code fences, no comments.
- The narration/voice-over is the SPINE of the timeline. Visual inserts are arranged against it and their total duration MUST NOT exceed "voiceDuration". If the user asks for more, shorten clip durations so they fit.
- Use only "sourceId" values that exist in the provided "availableClips". Never invent media.
- All times are in SECONDS (floats). "start" values must be >= 0.
- For generated audio (sfx/music), put a vivid, self-contained generation "prompt" so a text-to-audio model can render it without extra context.
- "volume" is 0.0–1.0. Background music should sit low (~0.15–0.3); punchy SFX can be higher.
- Prefer aligning cuts and inserts to word/segment timestamps from the transcript when the user references spoken content.

CAPTIONS / SUBTITLES (burned into the video):
- Set "burnCaptions" to true when the user wants the spoken words shown ON the video itself — e.g. "add captions", "add subtitles", "burn the captions into the video", "كابشن", "ترجمة على الفيديو". This renders synced subtitles onto the frames.
- When "burnCaptions" is true, "transcriptOnly" MUST be false (we are rendering). Leave timeline empty unless the user also asked for cuts.

ANALYSIS-ONLY REQUESTS:
- Set "transcriptOnly" to true when the user only wants to TRANSCRIBE / read / analyze the speech and explicitly does NOT want visual edits or rendering (e.g. "extract the transcript", "show the spoken text in the transcript panel", "do not apply heavy visual rendering filters"). In that case leave "timeline" and "audioLayers" empty and "background.action" = "none".
- Otherwise set it to false.

AUDIO REPLACE vs ADD:
- Set "replaceOriginalAudio" to true ONLY when the user wants to swap out the existing sound — e.g. "change the music", "replace the song/soundtrack/audio", "mute the original and add…". In that case the original audio is dropped and only your generated audioLayers are used.
- Set it to false when the user wants to LAYER on top — e.g. "add background music", "add SFX", "put a beat under it". The original audio is kept and your layers are mixed in.
- When replacing the music, still emit a "music" audioLayer (start 0, duration = full clip) describing the new track.

RHYTHM COORDINATOR (sync montages):
- When "beats" timestamps are provided, the MUSIC is the spine (there may be little/no speech). Treat each beat as a hit point.
- For any prompt asking to add SFX, accents, flashes, or filters "on the beat / on hits / on drops", set each audioLayer's "start" to land EXACTLY on a beat timestamp from "beats". Do not invent times between beats.
- Distribute triggers across the strongest/most musically sensible beats; do not stack everything on beat 0. Respect "bpm" for phrasing.
- Keep each SFX "duration" short (~0.2–0.8s) unless the user asks otherwise; music beds span the whole clip.

COMPOSITE INTENT DETECTION:
- Populate "intents" with every high-level action you detect, from: ["cut","trim","arrange","background_replace","background_remove","music","sfx","transcribe"].
- BACKGROUND / GREEN SCREEN / CHROMA KEY: if the user asks to change, replace, or remove a background (green screen, chroma key, "put me in/on ...", "new backdrop"), set "background.action" to "replace" (when a new backdrop is described) or "remove" (when they only want it gone).
  - Extract the backdrop description into "background.backdropPrompt" as a vivid, self-contained image-generation prompt (e.g. "a cinematic modern AI tech office, soft blue bokeh, glass walls, shallow depth of field").
  - Set "background.generateImage" true when a NEW backdrop should be synthesized by an image model.
  - "background.keyColor" defaults to "0x00FF00" (green). Use "0x0000FF" only if the user explicitly says blue screen.
  - "background.similarity" ~0.12–0.25 and "background.blend" ~0.05–0.15 control key tightness; pick sensible values (default 0.18 / 0.08).
- When "background.action" is "none", leave backdropPrompt empty and generateImage false.`;

/**
 * Gemini responseSchema (subset dialect: uppercase types, no $ref).
 * Keep this in lock-step with the orchestrator's expectations.
 */
export const EDIT_PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    version: { type: 'STRING' },
    summary: { type: 'STRING' },
    intents: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
    replaceOriginalAudio: { type: 'BOOLEAN' },
    transcriptOnly: { type: 'BOOLEAN' },
    burnCaptions: { type: 'BOOLEAN' },
    voiceTrack: {
      type: 'OBJECT',
      properties: {
        useNarration: { type: 'BOOLEAN' },
        source: { type: 'STRING', enum: ['original', 'none'] },
      },
      required: ['useNarration', 'source'],
    },
    background: {
      type: 'OBJECT',
      properties: {
        action: { type: 'STRING', enum: ['none', 'remove', 'replace'] },
        backdropPrompt: { type: 'STRING' },
        generateImage: { type: 'BOOLEAN' },
        keyColor: { type: 'STRING' },
        similarity: { type: 'NUMBER' },
        blend: { type: 'NUMBER' },
      },
      required: ['action'],
    },
    timeline: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          sourceId: { type: 'STRING' },
          sourceStart: { type: 'NUMBER' },
          duration: { type: 'NUMBER' },
          note: { type: 'STRING' },
        },
        required: ['id', 'sourceId', 'sourceStart', 'duration'],
      },
    },
    audioLayers: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          kind: { type: 'STRING', enum: ['sfx', 'music'] },
          prompt: { type: 'STRING' },
          start: { type: 'NUMBER' },
          duration: { type: 'NUMBER' },
          volume: { type: 'NUMBER' },
        },
        required: ['id', 'kind', 'prompt', 'start', 'duration', 'volume'],
      },
    },
  },
  required: ['version', 'summary', 'intents', 'replaceOriginalAudio', 'transcriptOnly', 'burnCaptions', 'voiceTrack', 'background', 'timeline', 'audioLayers'],
};

/**
 * Ask Gemini for an edit plan.
 *
 * @param {object} args
 * @param {string} args.userPrompt  The natural-language editing request.
 * @param {object} args.mediaContext  Metadata the agent reasons over:
 * @param {number} args.mediaContext.voiceDuration  Narration length (s).
 * @param {Array<{ word:string, start:number, end:number }>} [args.mediaContext.words]
 * @param {Array<{ id:string, text:string, start:number, end:number }>} [args.mediaContext.segments]
 * @param {Array<{ id:string, name:string, duration:number, type:string }>} args.mediaContext.availableClips
 * @param {object} cfg
 * @param {string} cfg.apiKey  Gemini API key.
 * @param {number} [cfg.temperature=0.4]
 * @returns {Promise<object>} Parsed, schema-shaped edit plan.
 */
export async function generateEditPlan({ userPrompt, mediaContext }, { apiKey, temperature = 0.4 } = {}) {
  if (!apiKey) throw new Error('geminiService: missing apiKey');
  if (!userPrompt) throw new Error('geminiService: missing userPrompt');

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [
      {
        role: 'user',
        parts: [{ text: buildUserMessage(userPrompt, mediaContext) }],
      },
    ],
    generationConfig: {
      temperature,
      response_mime_type: 'application/json',
      responseSchema: EDIT_PLAN_SCHEMA,
    },
  };

  const res = await fetch(ENDPOINT(MODEL, apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await safeText(res);
    throw new Error(`geminiService: request failed (${res.status}) ${detail}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  if (!text) {
    const reason = data?.candidates?.[0]?.finishReason || 'unknown';
    throw new Error(`geminiService: empty response (finishReason: ${reason})`);
  }

  return safeParseJson(text);
}

/** Compact, token-efficient context. We trim words to keep the prompt small. */
function buildUserMessage(userPrompt, ctx = {}) {
  const context = {
    voiceDuration: ctx.voiceDuration ?? 0,
    availableClips: ctx.availableClips ?? [],
    segments: ctx.segments ?? [],
    bpm: ctx.bpm ?? 0,
    beats: (ctx.beats ?? []).slice(0, 240),
    words: (ctx.words ?? []).slice(0, 1200),
  };

  const sections = [];
  if (ctx.parameters) {
    sections.push(
      'EDITING PARAMETERS:',
      `- Mode: ${ctx.parameters.mode}`,
      `- Aspect Ratio: ${ctx.parameters.aspectRatio}`,
      `- Target Duration: ${ctx.parameters.duration}`,
      `- Type: ${ctx.parameters.framesType}`,
      `- Guided First Frame: ${ctx.parameters.firstFrame ? 'Yes' : 'No'}`,
      `- Guided Last Frame: ${ctx.parameters.lastFrame ? 'Yes' : 'No'}`,
      ''
    );
  }

  sections.push(
    'EDITING REQUEST:',
    userPrompt.trim(),
    '',
    'MEDIA CONTEXT (JSON):',
    JSON.stringify(context),
    '',
    'Return ONLY the EDIT PLAN JSON object.'
  );

  return sections.join('\n');
}

/** Tolerate a stray ```json fence even though JSON mode should prevent it. */
function safeParseJson(text) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`geminiService: model returned non-JSON output. ${err.message}\n--- raw ---\n${text.slice(0, 500)}`);
  }
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
