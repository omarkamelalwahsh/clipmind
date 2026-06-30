import { generateEditPlan } from './backend-agent/services/geminiService.js';

const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
if (!apiKey) {
  console.error("Error: GEMINI_API_KEY or VITE_GEMINI_API_KEY environment variable is not set.");
  process.exit(1);
}


const mediaContext = {
  voiceDuration: 184,
  availableClips: [
    { id: 'c1', name: 'Video 12 Course Conclusion The Future of Generative AI and the Skills Required_1080p.mp4', type: 'video', duration: 184 },
    { id: 'c2', name: 'pngtree-an-old-bookcase-in-a-library-image_2642908.jpg', type: 'image', duration: 5 }
  ],
  parameters: {
    mode: 'Agent',
    aspectRatio: '16:9',
    duration: '5s',
    framesType: 'Frames'
  }
};

const userPrompt = `Apply chroma-key to remove the green screen. Replace it with a cinematic dark tech office backdrop, featuring a large window overlooking a futuristic city at night, with subtle warm yellow accent lighting reflecting on the avatar's shoulders for a seamless blend.`;

async function run() {
  try {
    const plan = await generateEditPlan({ userPrompt, mediaContext }, { apiKey });
    console.log(JSON.stringify(plan, null, 2));
  } catch (err) {
    console.error(err);
  }
}

run();
