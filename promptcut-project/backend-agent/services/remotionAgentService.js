/**
 * remotionAgentService.js
 * -----------------------------------------------------------------------------
 * The Multi-Modal Video Orchestrator agent for the Remotion engine. Takes a raw
 * user request (+ optional transcript) and returns a STRICT, frame-based JSON
 * timeline that synchronizes voiceover, visual assets, and kinetic typography.
 *
 * 30 FPS: 1 second = 30 frames. Output feeds Remotion compositions directly.
 */

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

const FPS = 30;

const SYSTEM_INSTRUCTION = `You are the Core Multi-Modal Video Orchestrator Agent for PromptCut (an automated AI motion graphics and video editing platform).
Your job is to take a raw user request, analyze it, and output a highly structured JSON timeline that synchronizes Video Clips, Images, Audio (Voiceover/Music), and Kinetic Typography for the Remotion engine.

CRITICAL ARCHITECTURE RULES:
1. Parse the entire instruction and break it into sequential parts on a unified timeline.
2. The video runs at 30 FPS. Every 1 second = 30 frames. Convert ALL times to frames.
3. Split assets into their lanes: Voiceover, Visual Assets (Images/Videos), and Kinetic Typography Overlays.
4. Typography MUST use the 'Montserrat' font, color '#FFFFFF', and dynamic transitions like 'pop-bounce' or 'slide-in' as specified by the user.
5. totalDurationInFrames MUST cover the last endFrame of the timeline.
6. Every timeline item needs startFrame < endFrame, both integers >= 0.
7. Output ONLY the raw JSON object — no markdown, no prose, no code fences.`;

/**
 * Gemini responseSchema — matches the Remotion timeline contract exactly.
 */
export const REMOTION_TIMELINE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    projectSettings: {
      type: 'OBJECT',
      properties: {
        width: { type: 'INTEGER' },
        height: { type: 'INTEGER' },
        fps: { type: 'INTEGER' },
        totalDurationInFrames: { type: 'INTEGER' },
      },
      required: ['width', 'height', 'fps', 'totalDurationInFrames'],
    },
    audioTrack: {
      type: 'OBJECT',
      properties: {
        generateVoiceoverFromScript: { type: 'STRING' },
        backgroundMusicStyle: { type: 'STRING' },
      },
      required: ['generateVoiceoverFromScript', 'backgroundMusicStyle'],
    },
    timeline: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          startFrame: { type: 'INTEGER' },
          endFrame: { type: 'INTEGER' },
          type: {
            type: 'STRING',
            enum: ['image_generation', 'video_generation', 'typography', 'lower_third'],
          },
          promptForGenerator: { type: 'STRING' },
          animationEffect: {
            type: 'STRING',
            enum: ['slow-zoom-in', 'slow-zoom-out', 'static', 'pop-bounce', 'slide-left', 'slide-in'],
          },
        },
        required: ['id', 'startFrame', 'endFrame', 'type', 'promptForGenerator', 'animationEffect'],
      },
    },
  },
  required: ['projectSettings', 'audioTrack', 'timeline'],
};

/**
 * Generate a Remotion timeline from a natural-language request.
 * @param {object} args
 * @param {string} args.userPrompt
 * @param {object} [args.context]  optional { transcript, width, height }
 * @param {object} cfg
 * @param {string} cfg.apiKey  Gemini API key.
 * @param {number} [cfg.temperature=0.3]
 * @returns {Promise<object>} the parsed Remotion timeline JSON.
 */
export async function generateRemotionTimeline({ userPrompt, context = {} }, { apiKey, temperature = 0.3 } = {}) {
  if (!apiKey) throw new Error('remotionAgentService: missing apiKey');
  if (!userPrompt) throw new Error('remotionAgentService: missing userPrompt');

  const width = context.width || 1920;
  const height = context.height || 1080;
  const scriptHint = context.transcript?.text
    ? `\n\nEXISTING NARRATION (use as the voiceover script and time typography to it):\n${context.transcript.text}`
    : '';

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              `REQUEST:\n${userPrompt.trim()}` +
              `\n\nPROJECT: ${width}x${height} @ ${FPS} FPS.` +
              scriptHint +
              `\n\nReturn ONLY the Remotion timeline JSON.`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature,
      response_mime_type: 'application/json',
      responseSchema: REMOTION_TIMELINE_SCHEMA,
    },
  };

  const res = await fetch(ENDPOINT(MODEL, apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await safeText(res);
    throw new Error(`remotionAgentService: request failed (${res.status}) ${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  if (!text) throw new Error('remotionAgentService: empty response');

  const plan = safeParseJson(text);
  return normalizeTimeline(plan, { width, height });
}

/** Clamp/repair the plan so Remotion never receives invalid frames. */
function normalizeTimeline(plan, { width, height }) {
  const fps = plan.projectSettings?.fps || FPS;
  const timeline = (plan.timeline || [])
    .map((t, i) => {
      const startFrame = Math.max(0, Math.round(t.startFrame || 0));
      const endFrame = Math.max(startFrame + 1, Math.round(t.endFrame || startFrame + fps));
      return {
        id: t.id || `scene_${i}`,
        startFrame,
        endFrame,
        type: t.type || 'typography',
        promptForGenerator: t.promptForGenerator || '',
        animationEffect: t.animationEffect || 'static',
      };
    })
    .sort((a, b) => a.startFrame - b.startFrame);

  const lastFrame = timeline.reduce((m, t) => Math.max(m, t.endFrame), 0);
  return {
    projectSettings: {
      width: plan.projectSettings?.width || width,
      height: plan.projectSettings?.height || height,
      fps,
      totalDurationInFrames: Math.max(plan.projectSettings?.totalDurationInFrames || 0, lastFrame, fps),
    },
    audioTrack: {
      generateVoiceoverFromScript: plan.audioTrack?.generateVoiceoverFromScript || '',
      backgroundMusicStyle: plan.audioTrack?.backgroundMusicStyle || 'cinematic',
    },
    timeline,
  };
}

function safeParseJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`remotionAgentService: non-JSON output. ${err.message}`);
  }
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
