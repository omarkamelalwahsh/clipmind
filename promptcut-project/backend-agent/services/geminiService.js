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

const SYSTEM_INSTRUCTION = `You are PromptCut's edit-planning agent.
You convert an editing request plus media metadata into a single, machine-readable EDIT PLAN.

HARD RULES:
- Output ONLY a JSON object that conforms to the provided schema. No prose, no markdown, no code fences, no comments.
- The narration/voice-over is the SPINE of the timeline. Visual inserts are arranged against it and their total duration MUST NOT exceed "voiceDuration". If the user asks for more, shorten clip durations so they fit.
- Use only "sourceId" values that exist in the provided "availableClips". Never invent media.
- All times are in SECONDS (floats). "start" values must be >= 0.
- For generated audio (sfx/music), put a vivid, self-contained generation "prompt" so a text-to-audio model can render it without extra context.
- "volume" is 0.0–1.0. Background music should sit low (~0.15–0.3); punchy SFX can be higher.
- Prefer aligning cuts and inserts to word/segment timestamps from the transcript when the user references spoken content.`;

/**
 * Gemini responseSchema (subset dialect: uppercase types, no $ref).
 * Keep this in lock-step with the orchestrator's expectations.
 */
export const EDIT_PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    version: { type: 'STRING' },
    summary: { type: 'STRING' },
    voiceTrack: {
      type: 'OBJECT',
      properties: {
        useNarration: { type: 'BOOLEAN' },
        source: { type: 'STRING', enum: ['original', 'none'] },
      },
      required: ['useNarration', 'source'],
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
  required: ['version', 'summary', 'voiceTrack', 'timeline', 'audioLayers'],
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
    // Word lists can be huge; the agent rarely needs every word. Cap defensively.
    words: (ctx.words ?? []).slice(0, 1200),
  };

  return [
    'EDITING REQUEST:',
    userPrompt.trim(),
    '',
    'MEDIA CONTEXT (JSON):',
    JSON.stringify(context),
    '',
    'Return ONLY the EDIT PLAN JSON object.',
  ].join('\n');
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
