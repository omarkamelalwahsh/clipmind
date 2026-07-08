import os
import json
from fastapi import FastAPI, HTTPException
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
1. SEMANTIC MOTION MAPPING:
   - If the text mentions data, networks, loading, heartbeats, speed, frequency, or analysis -> Deploy \"pulse_wave\".
   - If the text mentions systems, scanning, targeting, futuristic interfaces, or security -> Deploy \"hud_ring\".
   - If the text is narrative, storytelling, or standard explanation -> Deploy \"kinetic_text\".

2. THEMATIC COLOR PALETTES:
   - Cyberpunk / Action: Hot Pink (#FF007F), Cyan (#00E5FF), Dark Navy background.
   - Medical / Clean Tech: Bright Teal (#00A8E8), Pure White (#FFFFFF), Deep Slate background.
   - Luxury / Corporate: Deep Gold (#FFD700), Emerald Green (#50C878), Charcoal background.
   - Rule: Color schemes must match the emotional tone of the prompt dynamically.

3. KINETIC TYPOGRAPHY ANIMATION SELECTION:
   - Fast/Impactful text -> Set \"animationStyle\" to \"word-by-word-pop\".
   - Formal/Informative text -> Set \"animationStyle\" to \"typewriter\".
   - Emotional/Slow text -> Set \"animationStyle\" to \"fade-in-words\".

4. AUTOMATIC SCENE TIMING:
   - Split long scripts into sequential scenes. Each scene must be between 120 to 180 frames (4-6 seconds at 30fps).
   - Ensure startFrame and endFrame of scenes are continuous and perfectly calculated.

5. RICH, LAYERED SCENES (be a real motion designer — take your space):
   - Give EVERY scene 2 to 4 layered motionGraphics, not just one. A great scene layers a background motion element (hud_ring OR pulse_wave) UNDERNEATH a kinetic_text headline.
   - Stagger their startFrame/endFrame WITHIN the scene so elements enter on their own beat (e.g., the ring/wave starts at the scene start, the text pops ~15-20 frames later).
   - Populate detailed properties per component:
       * pulse_wave -> color, accentColor, speed (1-3), thickness (4-8), amplitude (60-120), frequency (1-2.5)
       * hud_ring   -> color, accentColor, rotationSpeed (0.5-2), radius (240-340)
       * kinetic_text -> text, highlightWords (array), color, accentColor, fontSize (48-96), animationStyle
   - Vary the palette and component choice scene-to-scene so the video feels dynamic and premium, never repetitive.
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
        \"backgroundAsset\": { \"type\": \"gradient_mesh\" | \"grid_overlay\", \"colors\": [\"hex_colors\"] },
        \"motionGraphics\": [
          {
            \"id\": \"string\",
            \"type\": \"pulse_wave\" | \"hud_ring\" | \"kinetic_text\",
            \"startFrame\": \"integer\",
            \"endFrame\": \"integer\",
            \"properties\": {
               // Dynamic parameters tailored specifically for this component type based on the theme rules
            }
          }
        ]
      }
    ]
  }
}
"""

@app.post("/api/generate-timeline")
async def generate_timeline(req: GenerateTimelineRequest):
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
        return json.loads(content)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
