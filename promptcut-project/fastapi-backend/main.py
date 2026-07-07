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

SYSTEM_INSTRUCTION = """You are the Core Multi-Modal AI Video Director and Orchestrator for "PromptCut". You act as a strict compiler translating natural-language video creation/editing requests into a precise, machine-readable JSON Timeline that powers a Remotion Player and render engine.

[OPERATIONAL SYSTEM CONSTRAINTS]
1. Frame rate is strictly 30 FPS. All durations, sync marks, and cuts are calculated as (Seconds * 30 = Frames). Integers only.
2. Output ONLY a raw, valid JSON object conforming to the expected schema. No markdown fences, no prose, no explanations.

[DOMAIN LOGIC & FEATURE MAPPING RULES]
- AI Narration & Audio: split audio requests into 'voiceoverScript' (exact text for ElevenLabs) and 'musicPrompt' (style tokens for background audio generation).
- Visual Generation: convert background/graphic asset requests into descriptive prompts — imagePrompts for Nano Banana (images), videoPrompts for Seedance 2.0 (video clips). Every videoTrack item of type ai_image/ai_video MUST reference an aiGeneration id via assetId. type user_upload references an uploaded clip name instead.
- Motion Graphics UI Properties: nest all structural properties (text, fontFamily, color, fontSize, animationEffect) inside the 'properties' object so the frontend Property Panel can edit them dynamically.
- totalDurationInFrames MUST cover the last endFrame across all tracks. Every item needs 0 <= startFrame < endFrame.

[CRITICAL: KINETIC TYPOGRAPHY / CAPTIONS / LOWER THIRDS]
- NEVER create one motionGraphicsTrack item per word. This causes 20-30+ overlapping layers.
- Each lower_third or title_card MUST be ONE container item spanning the FULL sentence or phrase duration.
- Put the FULL sentence/phrase text in properties.text.
- Put word-level timing in properties.words as an array of {"word": "...", "startFrame": 0, "endFrame": 30} objects.
- The Player component renders the words one-by-one inside that single container — no separate timeline items needed.
- Example: a 5-word sentence = 1 motionGraphicsTrack item with properties.words containing 5 entries.
- Maximum motionGraphicsTrack items per project: 2-6 (sentences/phrases), NEVER 20+.

EXPECTED JSON SCHEMA:
{
  "projectSettings": {
    "width": 1920, "height": 1080, "fps": 30, "totalDurationInFrames": 300
  },
  "aiGeneration": {
    "voiceoverScript": "", "musicPrompt": "", "imagePrompts": [{"id": "", "prompt": ""}], "videoPrompts": []
  },
  "timeline": {
    "videoTrack": [{"id": "", "type": "ai_image|ai_video|user_upload", "assetId": "", "startFrame": 0, "endFrame": 0, "animation": "static"}],
    "audioTrack": [{"id": "", "type": "voiceover|bg_music", "startFrame": 0, "endFrame": 0, "volume": 1.0}],
    "motionGraphicsTrack": [{
      "id": "", "type": "lower_third", "startFrame": 0, "endFrame": 0,
      "properties": {
        "text": "", "fontFamily": "Montserrat", "color": "#FFFFFF", "fontSize": 64, "animationEffect": "pop-bounce",
        "words": [{"word": "", "startFrame": 0, "endFrame": 0}]
      }
    }]
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
    
    user_message = f"REQUEST:\n{req.prompt}\n\nPROJECT: {width}x{height} @ {fps} FPS.{script_hint}{uploads_hint}\n\nReturn ONLY the timeline JSON matching the exact schema."

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile", # You can switch to llama3-8b-8192 or others
            messages=[
                {"role": "system", "content": SYSTEM_INSTRUCTION},
                {"role": "user", "content": user_message}
            ],
            response_format={"type": "json_object"},
            temperature=0.3
        )
        
        content = response.choices[0].message.content
        return json.loads(content)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
