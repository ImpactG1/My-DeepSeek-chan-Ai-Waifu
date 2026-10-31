# DeepSeek-chan AI Waifu Desktop Companion 🌸

An interactive, transparent desktop companion featuring **DeepSeek-chan** (大肥鱼) powered by **Groq API (Llama 3.3 70B & Whisper Large v3 Turbo)** and **Microsoft Edge-TTS** (Japanese-accented English voice with real-time lip sync).

---

## ✨ Features

- **Transparent Desktop Companion**: Borderless, floating widget that sits directly on your Windows desktop over your apps and games.
- **Full Live2D Cubism 4 Rigging**:
  - 60 FPS WebGL rendering with physics (hair, clothing, tail, and accessories sway naturally).
  - Mouse eye-tracking (her eyes and head turn to follow your cursor).
  - Pre-rigged animations: hand waving, finger pointing, holding foxtail grass, and idle breathing.
  - 14 distinct expressions: blushing, heart eyes, crying, cold sweat, smug, dizzy, smart glasses, etc.
- **Groq LLM Brain**:
  - Default: **`llama-3.3-70b-versatile`** (Meta's flagship 70B model with rich personality, emotional awareness, and memory).
  - Fast alternative: **`llama-3.1-8b-instant`** (sub-200ms ultra-fast responses).
  - Dynamic emotion tagging: DeepSeek-chan changes expressions and makes hand gestures based on the conversation context.
- **Voice Synthesis & Lip Sync**:
  - English speech with an authentic cute Japanese anime accent using `ja-JP-NanamiNeural`.
  - Real-time Web Audio API lip synchronization modulates her mouth opening (`ParamMouthOpenY`) to match the spoken voice.
- **Two-Way Voice & Text Chat**:
  - **Voice Chat**: Click the microphone button to talk directly to her; Groq Whisper (`whisper-large-v3-turbo`) transcribes your voice in milliseconds.
  - **Text Chat**: Type messages in the collapsible dock and hit Enter.

---

## 🚀 How to Run

### Method 1: Double-Click
Double-click **`run_waifu.bat`** in this directory.

### Method 2: Command Line
```powershell
npm start
```
*Note: Electron will automatically launch the local Python FastAPI backend (`server/server.py`) in the background.*

---

## ⚙️ Quick Setup (Groq API Key)

1. Launch the app (`npm start` or `run_waifu.bat`).
2. Click the **⚙️ (Settings)** icon on the top right.
3. Paste your **Groq API Key** (`gsk_...`) from [console.groq.com/keys](https://console.groq.com/keys).
4. Click **Save & Apply**.
5. You're ready to chat with DeepSeek-chan via voice or text!

---

## 📁 Project Architecture

```
Waifu 1/
├── assets/
│   └── live2d/
│       └── deepseek/          # Clean, standardized Live2D model assets
│           ├── model.moc3
│           ├── model.model3.json
│           ├── model.physics3.json
│           ├── model.cdi3.json
│           ├── textures/      # 5 high-res 4096 texture atlases
│           ├── expressions/   # 14 mapped expression files
│           └── motions/       # 7 motion animation files
├── server/
│   └── server.py              # FastAPI server (Groq LLM, Whisper STT, Edge-TTS)
├── src/
│   ├── index.html             # Desktop companion transparent UI
│   ├── style.css              # Glassmorphic anime styling & animations
│   ├── app.js                 # Live2D controller, lip sync, chat & mic handler
│   └── lib/                   # Cubism 4 Core & PixiJS libraries
├── main.js                    # Electron main process (transparent, borderless window)
├── package.json
└── run_waifu.bat              # One-click startup script
```

