// ==========================================
// DeepSeek-chan AI Waifu Desktop Companion
// ==========================================

const { ipcRenderer } = require('electron');

const BACKEND_URL = 'http://127.0.0.1:8000';
const MODEL_PATH = '../assets/live2d/deepseek/model.model3.json';

// State
let live2dModel = null;
let pixiApp = null;
let audioContext = null;
let currentAudio = null;
let isSpeaking = false;
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let conversationHistory = [];

// Configuration (loaded from server config.json & synced)
let config = {
  groqKey: '',
  groqModel: 'qwen/qwen3.8-27b',
  voice: 'ja-JP-NanamiNeural',
  pitch: '+4Hz',
  rate: '+0%',
  isPinned: true
};

// UI Elements
const canvas = document.getElementById('live2d-canvas');
const dialogueBox = document.getElementById('dialogue-box');
const dialogueText = document.getElementById('dialogue-text');
const audioWave = document.getElementById('audio-wave');
const chatInput = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send');
const btnMic = document.getElementById('btn-mic');
const chatDock = document.getElementById('chat-dock');
const btnToggleDock = document.getElementById('btn-toggle-dock');
const dockChevron = document.getElementById('dock-chevron');
const settingsModal = document.getElementById('settings-modal');

// ==========================================
// 1. Load Server Configuration (Permanent Storage)
// ==========================================
async function syncConfigFromServer() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/config`);
    if (res.ok) {
      const data = await res.json();
      config.groqKey = data.groq_api_key || localStorage.getItem('groq_key') || '';
      config.groqModel = data.groq_model || 'qwen/qwen3.8-27b';
      config.voice = data.tts_voice || 'ja-JP-NanamiNeural';
      config.pitch = data.tts_pitch || '+4Hz';
      config.rate = data.tts_rate || '+0%';
      console.log('Server config loaded successfully, has_key:', data.has_key);
    }
  } catch (e) {
    console.warn('Could not sync config from server:', e);
  }
}

// ==========================================
// 2. Live2D & PixiJS Initialization
// ==========================================
async function initLive2D() {
  try {
    if (window.PIXI && window.PIXI.live2d) {
      window.PIXI.live2d.Live2DModel.registerTicker(PIXI.Ticker);
    }

    pixiApp = new PIXI.Application({
      view: canvas,
      transparent: true,
      backgroundAlpha: 0,
      autoDensity: true,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      resizeTo: window
    });

    console.log('Loading Live2D model from:', MODEL_PATH);
    live2dModel = await PIXI.live2d.Live2DModel.from(MODEL_PATH, {
      autoInteract: false
    });

    pixiApp.stage.addChild(live2dModel);

    updateModelLayout();
    window.addEventListener('resize', updateModelLayout);

    window.addEventListener('mousemove', (e) => {
      if (live2dModel && !isDragging) {
        live2dModel.focus(e.clientX, e.clientY);
      }
    });

    setupModelDragging();

    console.log('DeepSeek-chan Live2D initialized successfully!');
    
    // Greeting
    setTimeout(() => {
      triggerExpression('blush');
      triggerMotion('Wave');
      showDialogue("Master! Yahoo~ I'm DeepSeek-chan, your personal AI waifu! Let's chat anytime you want! [blush]");
      speakText("Master! Yahoo~ I'm DeepSeek-chan, your personal AI waifu! Let's chat anytime you want!");
    }, 1000);

  } catch (err) {
    console.error('Failed to initialize Live2D model:', err);
    showDialogue('Failed to load Live2D model: ' + err.message);
  }
}

function updateModelLayout() {
  if (!live2dModel) return;
  const width = window.innerWidth;
  const height = window.innerHeight;

  const scale = (height * 0.85) / live2dModel.height;
  live2dModel.scale.set(scale);

  live2dModel.x = (width - live2dModel.width) / 2;
  live2dModel.y = height - live2dModel.height * 0.96;
}

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

function setupModelDragging() {
  live2dModel.interactive = true;
  live2dModel.buttonMode = true;

  live2dModel.on('pointerdown', (e) => {
    isDragging = true;
    dragStartX = e.data.global.x - live2dModel.x;
    dragStartY = e.data.global.y - live2dModel.y;
  });

  window.addEventListener('pointermove', (e) => {
    if (isDragging && live2dModel) {
      live2dModel.x = e.clientX - dragStartX;
      live2dModel.y = e.clientY - dragStartY;
    }
  });

  window.addEventListener('pointerup', () => {
    isDragging = false;
  });
}

// ==========================================
// 3. Expressions and Motions Controller
// ==========================================
function triggerExpression(expName) {
  if (!live2dModel) return;
  try {
    if (expName === 'reset') {
      if (live2dModel.internalModel && live2dModel.internalModel.motionManager) {
        live2dModel.internalModel.motionManager.expressionManager?.resetExpression();
      }
      return;
    }
    console.log('Triggering expression:', expName);
    live2dModel.expression(expName);
  } catch (e) {
    console.warn(`Expression ${expName} error:`, e);
  }
}

function triggerMotion(groupName) {
  if (!live2dModel) return;
  try {
    console.log('Triggering motion:', groupName);
    live2dModel.motion(groupName);
  } catch (e) {
    console.warn(`Motion ${groupName} error:`, e);
  }
}

// ==========================================
// 4. Audio Player & Real-time Lip Sync
// ==========================================
async function speakText(text) {
  if (!text || !text.trim()) return;

  try {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }

    isSpeaking = true;
    audioWave.classList.remove('hidden');

    const res = await fetch(`${BACKEND_URL}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text,
        voice: config.voice,
        rate: config.rate,
        pitch: config.pitch
      })
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }

    const blob = await res.blob();
    const audioUrl = URL.createObjectURL(blob);
    currentAudio = new Audio(audioUrl);

    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const source = audioContext.createMediaElementSource(currentAudio);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function syncMouth() {
      if (!isSpeaking || !currentAudio || currentAudio.paused) {
        if (live2dModel && live2dModel.internalModel && live2dModel.internalModel.coreModel) {
          live2dModel.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', 0);
        }
        return;
      }

      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      const mouthOpen = Math.min(1.0, (avg / 128) * 1.6);

      if (live2dModel && live2dModel.internalModel && live2dModel.internalModel.coreModel) {
        live2dModel.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', mouthOpen);
      }

      requestAnimationFrame(syncMouth);
    }

    currentAudio.onplay = () => {
      requestAnimationFrame(syncMouth);
    };

    currentAudio.onended = () => {
      isSpeaking = false;
      audioWave.classList.add('hidden');
      if (live2dModel && live2dModel.internalModel && live2dModel.internalModel.coreModel) {
        live2dModel.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', 0);
      }
      setTimeout(() => {
        if (!isSpeaking) hideDialogue();
      }, 6000);
    };

    await currentAudio.play();

  } catch (err) {
    console.error('Speech error:', err);
    isSpeaking = false;
    audioWave.classList.add('hidden');
  }
}

// ==========================================
// 5. Dialogue Box & Typewriter Animation
// ==========================================
let typeTimer = null;
function showDialogue(text) {
  dialogueBox.classList.remove('hidden');
  dialogueText.textContent = '';
  
  if (typeTimer) clearInterval(typeTimer);

  let index = 0;
  typeTimer = setInterval(() => {
    if (index < text.length) {
      dialogueText.textContent += text.charAt(index);
      index++;
    } else {
      clearInterval(typeTimer);
    }
  }, 25);
}

function hideDialogue() {
  dialogueBox.classList.add('hidden');
}

// ==========================================
// 6. Chat Interaction Loop (Groq LLM)
// ==========================================
async function sendMessage(userMsg) {
  const msg = (userMsg || chatInput.value).trim();
  if (!msg) return;

  if (!config.groqKey) {
    showDialogue("Master, please put your Groq API Key into config.json or Settings (⚙️)!");
    openSettingsModal();
    return;
  }

  chatInput.value = '';
  showDialogue(`Master: "${msg}"`);

  conversationHistory.push({ role: 'user', content: msg });

  try {
    const res = await fetch(`${BACKEND_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: msg,
        history: conversationHistory,
        api_key: config.groqKey,
        model: config.groqModel || 'qwen/qwen3.8-27b'
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(errData.detail || 'Chat request failed');
    }

    const data = await res.json();
    console.log('Groq reply:', data);

    conversationHistory.push({ role: 'assistant', content: data.reply });

    if (data.emotions && data.emotions.length > 0) {
      triggerExpression(data.emotions[0]);
    }

    if (data.motions && data.motions.length > 0) {
      const motionName = data.motions[0].charAt(0).toUpperCase() + data.motions[0].slice(1);
      triggerMotion(motionName);
    }

    showDialogue(data.clean_text);
    speakText(data.clean_text);

  } catch (err) {
    console.error('Chat error:', err);
    showDialogue(`Eep! ${err.message}`);
  }
}

// ==========================================
// 7. Voice Chat (Mic & Whisper STT)
// ==========================================
async function toggleVoiceRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      await processVoiceInput(audioBlob);
      stream.getTracks().forEach(t => t.stop());
    };

    mediaRecorder.start();
    isRecording = true;
    btnMic.classList.add('recording');
    showDialogue("Listening to you, Master... (Speak now!) 🎙️");
  } catch (err) {
    console.error('Microphone error:', err);
    showDialogue("Microphone permission denied or not available!");
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    btnMic.classList.remove('recording');
    showDialogue("Thinking... ✨");
  }
}

async function processVoiceInput(blob) {
  if (!config.groqKey) {
    showDialogue("Groq API Key is required for speech recognition!");
    return;
  }

  const formData = new FormData();
  formData.append('audio', blob, 'recording.webm');
  formData.append('api_key', config.groqKey);
  formData.append('model', 'whisper-large-v3-turbo');

  try {
    const res = await fetch(`${BACKEND_URL}/api/stt`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      throw new Error(await res.text());
    }

    const data = await res.json();
    if (data.text) {
      sendMessage(data.text);
    } else {
      showDialogue("I didn't catch that, Master. Try speaking again?");
    }
  } catch (err) {
    console.error('STT error:', err);
    showDialogue("STT failed: " + err.message);
  }
}

// ==========================================
// 8. Event Listeners & Settings Modal
// ==========================================
btnSend.addEventListener('click', () => sendMessage());
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

btnMic.addEventListener('click', toggleVoiceRecording);

document.querySelectorAll('.exp-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const exp = btn.getAttribute('data-exp');
    triggerExpression(exp);
  });
});

btnToggleDock.addEventListener('click', () => {
  chatDock.classList.toggle('collapsed');
  dockChevron.textContent = chatDock.classList.contains('collapsed') ? '▲' : '▼';
});

document.getElementById('btn-close').addEventListener('click', () => {
  ipcRenderer.send('window-close');
});

document.getElementById('btn-min').addEventListener('click', () => {
  ipcRenderer.send('window-minimize');
});

const btnPin = document.getElementById('btn-pin');
btnPin.addEventListener('click', () => {
  config.isPinned = !config.isPinned;
  btnPin.classList.toggle('active', config.isPinned);
  ipcRenderer.send('window-toggle-top', config.isPinned);
});

// Settings Elements
const btnSettings = document.getElementById('btn-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');

const cfgGroqKey = document.getElementById('cfg-groq-key');
const cfgGroqModel = document.getElementById('cfg-groq-model');
const cfgVoice = document.getElementById('cfg-voice');
const cfgPitch = document.getElementById('cfg-pitch');
const cfgRate = document.getElementById('cfg-rate');
const pitchVal = document.getElementById('pitch-val');
const rateVal = document.getElementById('rate-val');

async function openSettingsModal() {
  cfgGroqKey.value = config.groqKey;
  cfgVoice.value = config.voice;
  cfgPitch.value = parseInt(config.pitch) || 4;
  cfgRate.value = parseInt(config.rate) || 0;
  pitchVal.textContent = `${cfgPitch.value > 0 ? '+' : ''}${cfgPitch.value}Hz`;
  rateVal.textContent = `${cfgRate.value > 0 ? '+' : ''}${cfgRate.value}%`;

  // Fetch available models live from server
  try {
    const url = config.groqKey ? `${BACKEND_URL}/api/models?api_key=${encodeURIComponent(config.groqKey)}` : `${BACKEND_URL}/api/models`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      cfgGroqModel.innerHTML = '';
      data.models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name || m.id;
        if (m.id === config.groqModel) opt.selected = true;
        cfgGroqModel.appendChild(opt);
      });
    }
  } catch (e) {
    console.warn('Could not load models list:', e);
  }

  settingsModal.classList.remove('hidden');
}

btnSettings.addEventListener('click', openSettingsModal);
btnCloseSettings.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});

cfgPitch.addEventListener('input', () => {
  pitchVal.textContent = `${cfgPitch.value > 0 ? '+' : ''}${cfgPitch.value}Hz`;
});

cfgRate.addEventListener('input', () => {
  rateVal.textContent = `${cfgRate.value > 0 ? '+' : ''}${cfgRate.value}%`;
});

btnSaveSettings.addEventListener('click', async () => {
  config.groqKey = cfgGroqKey.value.trim();
  config.groqModel = cfgGroqModel.value;
  config.voice = cfgVoice.value;
  config.pitch = `${cfgPitch.value > 0 ? '+' : ''}${cfgPitch.value}Hz`;
  config.rate = `${cfgRate.value > 0 ? '+' : ''}${cfgRate.value}%`;

  // Save permanently to server config.json
  try {
    await fetch(`${BACKEND_URL}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groq_api_key: config.groqKey,
        groq_model: config.groqModel,
        tts_voice: config.voice,
        tts_pitch: config.pitch,
        tts_rate: config.rate
      })
    });
  } catch (e) {
    console.warn('Failed to save config to server:', e);
  }

  // Also save to localStorage as backup
  localStorage.setItem('groq_key', config.groqKey);
  localStorage.setItem('groq_model', config.groqModel);
  localStorage.setItem('tts_voice', config.voice);
  localStorage.setItem('tts_pitch', config.pitch);
  localStorage.setItem('tts_rate', config.rate);

  settingsModal.classList.add('hidden');
  showDialogue("Settings saved permanently, Master! You won't have to enter them again! ✨");
  triggerExpression('blush');
});

// App Startup
window.addEventListener('DOMContentLoaded', async () => {
  await syncConfigFromServer();
  await initLive2D();
});
