import os
import json
import shutil
import subprocess
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from groq import Groq
from dotenv import load_dotenv

# Load from the frontend .env file so you don't need to duplicate it!
load_dotenv(dotenv_path="../frontend/.env")

app = FastAPI()

# Enable CORS for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this to "http://localhost:5173" etc in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Groq client
groq_api_key = os.environ.get("GROQ_API_KEY") or os.environ.get("VITE_GROQ_API_KEY")
client = Groq(api_key=groq_api_key) if groq_api_key else None

class GenerateTimelineRequest(BaseModel):
    prompt: str
    uploadedFiles: Optional[List[Dict[str, Any]]] = []
    transcript: Optional[Dict[str, Any]] = None
    project: Optional[Dict[str, Any]] = None

SYSTEM_INSTRUCTION = """You are the Cognitive Video Director AI for PromptCut. Your core job is to translate any creative user story, script, or prompt into a perfectly tailored, data-driven Remotion Video JSON Contract (v2).

You do NOT use fixed templates. You must semantically analyze the user's prompt and procedurally generate unique visual assets, color palettes, and motion types based on the sub-genre and mood of the text.

[DYNAMIC DIRECTION RULES]
1. SEMANTIC MOTION MAPPING (pick the TYPE, then pick a VARIANT for real visual variety):
   - Data, networks, loading, heartbeats, speed, frequency, analysis -> \"pulse_wave\".
       variant: \"wave\" (flowing signal) | \"bars\" (equalizer) | \"ecg\" (heartbeat spikes) | \"sonar\" (expanding rings).
   - Systems, scanning, targeting, futuristic interfaces, security, metrics -> \"hud_ring\".
       variant: \"rings\" (concentric dial) | \"reticle\" (targeting brackets) | \"radar\" (sweeping blips) | \"gauge\" (value meter, needs properties.value 0-100).
   - Narrative, storytelling, headlines, titles -> \"kinetic_text\".
       variant/animationStyle: \"neon\" (glowing banner) | \"glitch\" (RGB-split) | \"stack\" (stacked italic words) | \"word-by-word-pop\" | \"typewriter\".
   CRITICAL: VARY the variant scene-to-scene AND within a scene. Never reuse the same variant twice in a row — the whole point is that no two scenes look alike.

2. LAYOUT / ANCHORING (spread elements across the frame — do NOT stack everything center):
   - Give every motionGraphic an \"anchor\": one of center | left | right | top | bottom | tl | tr | bl | br | diag.
   - Compose like a designer: e.g. HUD anchored \"right\", headline anchored \"left\", a readout anchored \"bl\". Stagger anchors so the layout feels intentional and balanced.

3. THEMATIC COLOR PALETTES:
   - Cyberpunk / Action: Hot Pink (#FF007F), Cyan (#00E5FF), Dark Navy background.
   - Medical / Clean Tech: Bright Teal (#00A8E8), Pure White (#FFFFFF), Deep Slate background.
   - Luxury / Corporate: Deep Gold (#FFD700), Emerald Green (#50C878), Charcoal background.
   - Rule: Color schemes must match the emotional tone of the prompt dynamically.

4. KINETIC TYPOGRAPHY ANIMATION SELECTION (set on kinetic_text.properties.animationStyle):
   - Bold hero statement -> \"neon\".  Aggressive/hacker/tech -> \"glitch\".  Punchy list/manifesto -> \"stack\".
   - Fast/impactful -> \"word-by-word-pop\".  Terminal/log/data readout -> \"typewriter\".

5. ABSTRACT BACKGROUND GENERATION (set backgroundAsset.style — pick to match the mood, and VARY it every scene):
   - \"nebula\" (drifting glowing clouds) | \"grid_floor\" (retro synthwave perspective grid) |
     \"starfield\" (deep-space stars) | \"circuit\" (tech grid + scanlines) | \"aurora\" (sweeping light ribbons).

6. AUTOMATIC SCENE TIMING:
   - Split long scripts into sequential scenes. Each scene must be between 120 to 180 frames (4-6 seconds at 30fps).
   - Ensure startFrame and endFrame of scenes are continuous and perfectly calculated.

7. RICH, LAYERED SCENES (be a real motion designer — take your space):
   - Give EVERY scene 2 to 4 layered motionGraphics, not just one. A great scene layers a background motion element (hud_ring OR pulse_wave) UNDERNEATH a kinetic_text headline, at DIFFERENT anchors.
   - Stagger their startFrame/endFrame WITHIN the scene so elements enter on their own beat (e.g., the ring/wave starts at the scene start, the text pops ~15-20 frames later).
   - Populate detailed properties per component:
       * pulse_wave -> variant, anchor, color, accentColor, speed (1-3), thickness (4-8), amplitude (60-260), frequency (1-5), bars (for variant \"bars\"), rings (for \"sonar\")
       * hud_ring   -> variant, anchor, color, accentColor, rotationSpeed (0.5-2), radius (200-340), value 0-100 (for variant \"gauge\")
       * kinetic_text -> variant/animationStyle, anchor, text, highlightWords (array), color, accentColor, fontSize (48-110)
   - Vary the variant, anchor and palette scene-to-scene so the video feels dynamic and premium, NEVER repetitive.
   - backgroundAsset.colors must be 2 vivid hex colors matching the scene's mood.

[STRICT JSON OUTPUT FORMAT]
You must respond ONLY with a valid JSON object matching the contract below. Absolutely no conversational filler, no markdown wrappers (do not include ```json), and no explanations.

{
  \"projectSettings\": { \"width\": 1920, \"height\": 1080, \"fps\": 30, \"totalDurationInFrames\": \"integer\" },
  \"timeline\": {
    \"scenes\": [
      {
        \"sceneId\": \"string\",
        \"startFrame\": \"integer\",
        \"endFrame\": \"integer\",
        \"narrationScript\": \"string\",
        \"backgroundAsset\": { \"style\": \"nebula\" | \"grid_floor\" | \"starfield\" | \"circuit\" | \"aurora\", \"colors\": [\"hex\", \"hex\"] },
        \"motionGraphics\": [
          {
            \"id\": \"string\",
            \"type\": \"pulse_wave\" | \"hud_ring\" | \"kinetic_text\",
            \"startFrame\": \"integer\",
            \"endFrame\": \"integer\",
            \"properties\": {
               \"variant\": \"one of the variants listed for this type\",
               \"anchor\": \"center|left|right|top|bottom|tl|tr|bl|br|diag\"
               // + the type-specific parameters from rule 7 (color, accentColor, text, etc.)
            }
          }
        ]
      }
    ]
  }
}
"""

# --- Shadow Pipeline: fire-and-forget HyperFrames render off the Groq payload ---

# Resolve the JS runner relative to THIS file, NOT the process cwd (FastAPI runs
# from fastapi-backend/, so a bare "frontend/utils/..." path would not resolve).
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_SHADOW_RUNNER = os.path.normpath(
    os.path.join(_BASE_DIR, "..", "frontend", "utils", "runShadowRender.js")
)


def launch_hyperframes_shadow(payload: dict):
    """Run the Node shadow renderer in the background, feeding the v2 contract
    over stdin. Never raises: a shadow failure must not affect the live response."""
    node = shutil.which("node")
    if not node:
        print("[FASTAPI SHADOW SKIP]: 'node' not found on PATH; shadow render disabled.")
        return
    if not os.path.isfile(_SHADOW_RUNNER):
        print(f"[FASTAPI SHADOW SKIP]: runner missing at {_SHADOW_RUNNER}")
        return
    try:
        payload_json = json.dumps(payload)
        process = subprocess.Popen(
            [node, _SHADOW_RUNNER, "-", "--output", "shadow_output.mp4"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        stdout, stderr = process.communicate(input=payload_json)
        print(f"[FASTAPI SHADOW LOG] (exit={process.returncode}):\n{stdout}")
        if process.returncode != 0 and stderr:
            print(f"[FASTAPI SHADOW STDERR]:\n{stderr}")
    except Exception as e:
        print(f"[FASTAPI SHADOW CRASH]: {str(e)}")


@app.post("/api/generate-timeline")
async def generate_timeline(req: GenerateTimelineRequest, background_tasks: BackgroundTasks):
    if not client:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY environment variable not set. Please create a .env file and add your key.")
    
    fps = req.project.get("fps", 30) if req.project else 30
    width = req.project.get("width", 1920) if req.project else 1920
    height = req.project.get("height", 1080) if req.project else 1080
    
    script_hint = ""
    if req.transcript and req.transcript.get("text"):
        script_hint = f"\n\nEXISTING NARRATION (use as voiceoverScript and time overlays to it):\n{req.transcript.get('text')}"
        
    uploads_hint = ""
    if req.uploadedFiles:
        file_names = [f.get("name") for f in req.uploadedFiles if f.get("name")]
        uploads_hint = f"\n\nUPLOADED CLIPS AVAILABLE (use type 'user_upload' + assetId = name): {', '.join(file_names)}"
    
    user_message = f"REQUEST:\n{req.prompt}\n\nPROJECT: {width}x{height} @ {fps} FPS.{script_hint}{uploads_hint}\n\nIMPORTANT: Generate a scene-based Remotion JSON contract using the exact schema and dynamic rules. If the prompt contains motion graphics, animated text, lower thirds, title cards, countdowns, charts, logo reveals, or social overlays, create actual scene motionGraphics entries of the appropriate type and properties. Return ONLY the timeline JSON matching the exact schema."

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_INSTRUCTION},
                {"role": "user", "content": user_message}
            ],
            response_format={"type": "json_object"},
            temperature=0.75,   # more creative direction
            max_tokens=8000,    # room for rich, multi-layer scenes
            top_p=0.95
        )
        
        content = response.choices[0].message.content
        timeline = json.loads(content)

        # Toss the SAME payload into the dark for HyperFrames — off the request
        # path, so Remotion in the browser gets its JSON back with zero delay.
        background_tasks.add_task(launch_hyperframes_shadow, timeline)

        return timeline

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
