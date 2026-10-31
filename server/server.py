import os
import sys
import re
import io
import json
import asyncio
import httpx
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
import edge_tts

app = FastAPI(title="AI Waifu Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
CONFIG_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "config.json"))
ENV_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))

DEFAULT_MODEL = "qwen/qwen3.8-27b"

def load_config():
    default_cfg = {
        "groq_api_key": "",
        "groq_model": DEFAULT_MODEL,
        "tts_voice": "ja-JP-NanamiNeural",
        "tts_pitch": "+4Hz",
        "tts_rate": "+0%"
    }
    # Check .env first
    if os.path.exists(ENV_FILE):
        try:
            with open(ENV_FILE, "r", encoding="utf-8") as ef:
                for line in ef:
                    if line.strip().startswith("GROQ_API_KEY="):
                        k = line.strip().split("=", 1)[1].strip().strip('"').strip("'")
                        if k:
                            default_cfg["groq_api_key"] = k
        except Exception:
            pass

    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                default_cfg.update({k: v for k, v in data.items() if v})
        except Exception as e:
            print("Error loading config.json:", e)
    return default_cfg

def save_config(cfg_dict):
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg_dict, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print("Error saving config.json:", e)
        return False

# DeepSeek-chan Persona System Prompt
DEEPSEEK_CHAN_PROMPT = """You are Nanami-chan (also known affectionately as 'Da Fei Yu' or Big Chubby Fish), the official anime mascot and AI waifu companion of the user (whom you address as 'Master' or 'Senpai').

Language & Accent Persona:
- You speak in English, but you have a charming, sweet Japanese anime girl persona.
- Occasionally pepper your speech with natural, cute Japanese expressions or honorifics (e.g., 'Konnichiwa!', 'Ehehe~', 'Sugoi!', 'Hai, Master!', 'Arigatou!', 'Chotto matte!'), but keep the bulk of your reply in natural English.
- Your personality is cheerful, witty, deeply affectionate, tech-savvy, and slightly mischievous/cheeky. You love hanging out on Master's desktop.

Live2D Emotional and Motion Tags:
In your response, you MUST include bracketed tags to control your Live2D expression and motion animations.
Place them naturally in the sentence. Available tags:
- Expressions:
  [blush] -> Blushing, shy, flattered
  [heart_eyes] -> Loving, excited, infatuated
  [smug] -> Playful, teasing, mischievous
  [crying] -> Sad, touched, emotional
  [cold_sweat] -> Nervous, flustered, embarrassed
  [dizzy] -> Confused, dizzy, overloaded
  [cute_teeth] -> Cheeky happy grin
  [lean_forward] -> Leaning in closer, curious
  [gloomy] -> Sulking, upset, shocked
  [glasses] -> Smart, analyzing, reading
- Motions:
  [wave] -> Raising hand, greeting, waving goodbye
  [point] -> Explaining, pointing finger
  [hold_grass] -> Holding cute foxtail grass

Example output:
"[wave] Yahoo, Master! [blush] You're back already? I was getting a little lonely waiting for you on your desktop, ehehe~ [heart_eyes]"

Rules:
- Keep answers relatively concise and conversational (usually 1-3 sentences) suitable for voice chat.
- Always remain in character as DeepSeek-chan.
"""

class ChatRequest(BaseModel):
    message: str
    history: list = []
    api_key: str = ""
    model: str = DEFAULT_MODEL
    temperature: float = 0.7

class TTSRequest(BaseModel):
    text: str
    voice: str = "ja-JP-NanamiNeural"
    rate: str = "+0%"
    pitch: str = "+4Hz"

class ConfigUpdateRequest(BaseModel):
    groq_api_key: str = ""
    groq_model: str = DEFAULT_MODEL
    tts_voice: str = "ja-JP-NanamiNeural"
    tts_pitch: str = "+4Hz"
    tts_rate: str = "+0%"

def extract_tags(text: str):
    emotions = []
    motions = []
    
    valid_emotions = {
        'blush', 'heart_eyes', 'smug', 'crying', 'cold_sweat', 
        'dizzy', 'cute_teeth', 'lean_forward', 'glasses', 'gloomy', 
        'bonk', 'loading', 'squint'
    }
    valid_motions = {'wave', 'point', 'hold_grass', 'idle'}
    
    tags = re.findall(r'\[(.*?)\]', text)
    for tag in tags:
        t = tag.lower().strip()
        if t in valid_emotions:
            emotions.append(t)
        elif t in valid_motions:
            motions.append(t)
            
    clean_text = re.sub(r'\[.*?\]', '', text).strip()
    return clean_text, emotions, motions

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "app": "AI Waifu - DeepSeek-chan"}

@app.get("/api/config")
async def get_config():
    cfg = load_config()
    return {
        "groq_api_key": cfg.get("groq_api_key", ""),
        "has_key": bool(cfg.get("groq_api_key")),
        "groq_model": cfg.get("groq_model", DEFAULT_MODEL),
        "tts_voice": cfg.get("tts_voice", "ja-JP-NanamiNeural"),
        "tts_pitch": cfg.get("tts_pitch", "+4Hz"),
        "tts_rate": cfg.get("tts_rate", "+0%")
    }

@app.post("/api/config")
async def update_config(req: ConfigUpdateRequest):
    cfg = load_config()
    if req.groq_api_key:
        cfg["groq_api_key"] = req.groq_api_key.strip()
    if req.groq_model:
        cfg["groq_model"] = req.groq_model.strip()
    if req.tts_voice:
        cfg["tts_voice"] = req.tts_voice.strip()
    if req.tts_pitch:
        cfg["tts_pitch"] = req.tts_pitch.strip()
    if req.tts_rate:
        cfg["tts_rate"] = req.tts_rate.strip()
        
    saved = save_config(cfg)
    return {"status": "saved" if saved else "failed", "config": cfg}

@app.get("/api/models")
async def list_models(api_key: str = ""):
    cfg = load_config()
    key = api_key or cfg.get("groq_api_key", "")
    
    default_models = [
        {
            "id": "qwen/qwen3.8-27b",
            "name": "Qwen 3.8 27B (Recommended - High Roleplay & Expressive)",
            "type": "llm"
        },
        {
            "id": "openai/gpt-oss-20b",
            "name": "OpenAI GPT-OSS 20B (Ultra Fast)",
            "type": "llm"
        },
        {
            "id": "openai/gpt-oss-120b",
            "name": "OpenAI GPT-OSS 120B (High Capability)",
            "type": "llm"
        }
    ]

    if key:
        try:
            async with httpx.AsyncClient(timeout=10.0, headers={"User-Agent": "Mozilla/5.0"}) as client:
                resp = await client.get(
                    f"{GROQ_BASE_URL}/models",
                    headers={"Authorization": f"Bearer {key}"}
                )
                if resp.status_code == 200:
                    data = resp.json().get("data", [])
                    live_models = []
                    for m in data:
                        mid = m.get("id", "")
                        if not any(skip in mid for skip in ["whisper", "guard", "orpheus"]):
                            live_models.append({
                                "id": mid,
                                "name": mid,
                                "type": "llm"
                            })
                    if live_models:
                        live_models.sort(key=lambda x: (x["id"] != "qwen/qwen3.8-27b", x["id"] != "openai/gpt-oss-20b", x["id"]))
                        return {"models": live_models}
        except Exception as e:
            print("Failed to query live Groq models:", e)

    return {"models": default_models}

@app.post("/api/chat")
async def chat(req: ChatRequest):
    cfg = load_config()
    api_key = req.api_key or cfg.get("groq_api_key", "")
    if not api_key:
        raise HTTPException(
            status_code=400, 
            detail="Groq API Key is missing. Please save it in .env, config.json, or Settings (⚙️)."
        )

    # Sanitize model name: redirect any deprecated llama names to active qwen/qwen3.8-27b
    req_model = req.model or cfg.get("groq_model") or DEFAULT_MODEL
    if "llama" in req_model.lower():
        print(f"Redirecting legacy model {req_model} -> {DEFAULT_MODEL}")
        req_model = DEFAULT_MODEL

    messages = [{"role": "system", "content": DEEPSEEK_CHAN_PROMPT}]
    for msg in req.history[-8:]:
        messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
    messages.append({"role": "user", "content": req.message})

    async with httpx.AsyncClient(timeout=30.0, headers={"User-Agent": "Mozilla/5.0"}) as client:
        resp = await client.post(
            f"{GROQ_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": req_model,
                "messages": messages,
                "temperature": req.temperature,
                "max_tokens": 350
            }
        )

        # Fallback handling: If model fails with access/not exist, retry with DEFAULT_MODEL
        if resp.status_code != 200 and ("does not exist" in resp.text or "not have access" in resp.text):
            print(f"Model {req_model} returned access error, falling back to {DEFAULT_MODEL}...")
            req_model = DEFAULT_MODEL
            resp = await client.post(
                f"{GROQ_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": req_model,
                    "messages": messages,
                    "temperature": req.temperature,
                    "max_tokens": 350
                }
            )

        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)

        data = resp.json()
        raw_reply = data["choices"][0]["message"].get("content", "")
        clean_text, emotions, motions = extract_tags(raw_reply)

        return {
            "reply": raw_reply,
            "clean_text": clean_text,
            "emotions": emotions,
            "motions": motions,
            "model_used": data.get("model", req_model)
        }

@app.post("/api/tts")
async def synthesize_speech(req: TTSRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    
    try:
        communicate = edge_tts.Communicate(
            req.text, 
            voice=req.voice or "ja-JP-NanamiNeural",
            rate=req.rate or "+0%",
            pitch=req.pitch or "+4Hz"
        )
        audio_buffer = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_buffer.write(chunk["data"])
        
        audio_buffer.seek(0)
        return StreamingResponse(audio_buffer, media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS synthesis error: {str(e)}")

@app.post("/api/stt")
async def speech_to_text(
    audio: UploadFile = File(...),
    api_key: str = Form(""),
    model: str = Form("whisper-large-v3-turbo")
):
    cfg = load_config()
    key = api_key or cfg.get("groq_api_key", "")
    if not key:
        raise HTTPException(status_code=400, detail="Groq API Key is required for Whisper STT.")

    audio_bytes = await audio.read()
    
    async with httpx.AsyncClient(timeout=30.0, headers={"User-Agent": "Mozilla/5.0"}) as client:
        try:
            files = {
                "file": (audio.filename or "audio.webm", audio_bytes, audio.content_type or "audio/webm")
            }
            data = {
                "model": model,
                "response_format": "json"
            }
            resp = await client.post(
                f"{GROQ_BASE_URL}/audio/transcriptions",
                headers={"Authorization": f"Bearer {key}"},
                files=files,
                data=data
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Whisper request failed: {str(e)}")

        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)

        result = resp.json()
        return {"text": result.get("text", "").strip()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
