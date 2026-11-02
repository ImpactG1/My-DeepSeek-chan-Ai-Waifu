// ==========================================
// DeepSeek-chan AI Waifu Desktop Companion
// Autonomous VTuber Life Engine & 3D Parallax
// ==========================================

const { ipcRenderer } = require('electron');

const BACKEND_URL = 'http://127.0.0.1:8000';
const MODEL_PATH = '../assets/live2d/deepseek/model.model3.json';

// State
let live2dModel = null;
let pixiApp = null;
let lifeEngine = null;
let audioContext = null;
let currentAudio = null;
let isSpeaking = false;
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let conversationHistory = [];

// Configuration (stored in server config.json & synced)
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
const particleContainer = document.getElementById('particle-container');
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
      console.log('Server config loaded, key active:', data.has_key);
    }
  } catch (e) {
    console.warn('Could not sync config from server:', e);
  }
}

// ==========================================
// 2. Autonomous VTuber Life Engine
// ==========================================
class AutonomousLifeEngine {
  constructor(model) {
    this.model = model;
    this.time = 0;

    // Head Angles (3D Perspective)
    this.angleX = 0;
    this.angleY = 0;
    this.angleZ = 0;
    this.targetAngleX = 0;
    this.targetAngleY = 0;
    this.targetAngleZ = 0;

    // Body & Torso Parallax
    this.bodyX = 0;
    this.bodyY = 0;
    this.bodyZ = 0;
    this.lean = 0;
    this.targetLean = 0;

    // Eye Gaze & Saccades
    this.eyeX = 0;
    this.eyeY = 0;
    this.saccadeX = 0;
    this.saccadeY = 0;
    this.saccadeTimer = 0;
    this.nextSaccade = 1.5 + Math.random() * 2.0;

    // Blinking
    this.blinkValue = 1.0;
    this.isBlinking = false;
    this.blinkTimer = 0;
    this.nextBlink = 3.0;
    this.blinkProgress = 0;

    // User Mouse Tracking
    this.userMouseX = 0;
    this.userMouseY = 0;
    this.lastMouseMoveTime = Date.now();

    // Autonomous Life & Fidgets
    this.idleActionTimer = 0;
    this.nextActionTime = 14.0 + Math.random() * 10.0;
    this.isThinking = false;
    this.currentMood = 'NORMAL'; // NORMAL, THINKING, BLUSH, HAPPY

    // Speech Audio Reactive
    this.speakingEnergy = 0;
    this.mouthOpen = 0;
    this.audioWaveAvg = 0;

    // Touch Feedback
    this.touchPuff = 0;
    this.touchPout = 0;
    this.touchRecoil = 0;
  }

  update(dt) {
    this.time += dt;

    // 1. Organic Multi-Frequency Breathing
    const breath = (Math.sin(this.time * 1.9) + 1) * 0.5;
    const deepBreath = Math.sin(this.time * 0.45) * 0.15;
    const totalBreath = Math.max(0, Math.min(1.0, breath + deepBreath));

    // 2. Weight Shifting (Realistic Lateral Body Sway)
    const sway1 = Math.sin(this.time * 0.65) * 3.5;
    const sway2 = Math.cos(this.time * 0.32) * 2.0;
    const naturalBodySwayX = sway1 + sway2;
    const naturalHeadCounterTilt = -naturalBodySwayX * 0.3;

    // 3. Eye Saccades (Rapid Micro-glances)
    this.saccadeTimer += dt;
    if (this.saccadeTimer >= this.nextSaccade) {
      this.saccadeTimer = 0;
      this.nextSaccade = 1.5 + Math.random() * 3.0;
      if (!this.isThinking) {
        this.saccadeX = (Math.random() - 0.5) * 0.28;
        this.saccadeY = (Math.random() - 0.5) * 0.22;
      }
    }

    // 4. Biological Non-Periodic Blinking
    this.blinkTimer += dt;
    if (!this.isBlinking && this.blinkTimer >= this.nextBlink) {
      this.isBlinking = true;
      this.blinkTimer = 0;
      this.blinkProgress = 0;
      this.nextBlink = 2.5 + Math.random() * 4.5;
    }
    if (this.isBlinking) {
      this.blinkProgress += dt * 13.0; // ~130ms quick blink
      if (this.blinkProgress <= 1.0) {
        this.blinkValue = 1.0 - Math.sin(this.blinkProgress * Math.PI);
      } else {
        this.blinkValue = 1.0;
        this.isBlinking = false;
        // 20% chance of double-blink
        if (Math.random() < 0.22) {
          this.nextBlink = 0.18;
        }
      }
    }

    // 5. Head Tracking vs Autonomous Wander
    const timeSinceMouseMove = (Date.now() - this.lastMouseMoveTime) / 1000;
    let targetX = 0;
    let targetY = 0;

    if (this.isThinking) {
      // Look up and away when thinking
      targetX = 14.0;
      targetY = 12.0;
      this.targetAngleZ = 8.0;
    } else if (timeSinceMouseMove < 5.0) {
      // Active user mouse tracking
      targetX = this.userMouseX * 26.0;
      targetY = -this.userMouseY * 20.0;
      this.targetAngleZ = naturalHeadCounterTilt + (-targetX * 0.18);
    } else {
      // Autonomous gentle gaze wander (looking around room, glancing back at user)
      const wanderX = Math.sin(this.time * 0.42) * 16.0 + Math.sin(this.time * 0.95) * 7.0;
      const wanderY = Math.cos(this.time * 0.35) * 8.0;
      targetX = wanderX;
      targetY = wanderY;
      this.targetAngleZ = naturalHeadCounterTilt;
    }

    // Speech-driven conversational cadence (Head nods on voice peaks)
    let speechNodY = 0;
    let speechTiltZ = 0;
    if (isSpeaking && this.speakingEnergy > 0.05) {
      speechNodY = -Math.sin(this.time * 8.0) * (this.speakingEnergy * 7.0);
      speechTiltZ = Math.sin(this.time * 4.5) * (this.speakingEnergy * 5.0);
    }

    // Smooth second-order spring/lerp (natural organic lag & damping)
    const lerpSpeed = dt * 6.5;
    this.angleX += (targetX - this.angleX) * lerpSpeed;
    this.angleY += (targetY + speechNodY - this.angleY) * lerpSpeed;
    this.angleZ += (this.targetAngleZ + speechTiltZ - this.angleZ) * lerpSpeed;

    // Eye gaze
    const targetEyeX = (this.angleX / 26.0) * 0.72 + this.saccadeX;
    const targetEyeY = (this.angleY / 20.0) * 0.72 + this.saccadeY;
    this.eyeX += (targetEyeX - this.eyeX) * (dt * 12.0);
    this.eyeY += (targetEyeY - this.eyeY) * (dt * 12.0);

    // Torso follows with 3D parallax
    const targetBodyX = this.angleX * 0.35 + naturalBodySwayX;
    const targetBodyY = totalBreath * 3.5;
    const targetBodyZ = naturalHeadCounterTilt * 0.5;
    this.bodyX += (targetBodyX - this.bodyX) * (dt * 4.5);
    this.bodyY += (targetBodyY - this.bodyY) * (dt * 4.5);
    this.bodyZ += (targetBodyZ - this.bodyZ) * (dt * 4.5);

    // Lean posture interpolation
    this.lean += (this.targetLean - this.lean) * (dt * 3.5);

    // Touch feedback decay
    this.touchPuff *= Math.max(0, 1.0 - dt * 2.0);
    this.touchPout *= Math.max(0, 1.0 - dt * 2.0);
    this.touchRecoil *= Math.max(0, 1.0 - dt * 3.0);

    // 6. Autonomous Fidgets & Gestures (Every 15-25s)
    this.idleActionTimer += dt;
    if (this.idleActionTimer >= this.nextActionTime && !isSpeaking && !this.isThinking) {
      this.idleActionTimer = 0;
      this.nextActionTime = 16.0 + Math.random() * 18.0;
      this.triggerAutonomousLifeAction();
    }

    // 7. Apply parameters to Live2D core model
    this.applyParameters(totalBreath);
  }

  applyParameters(totalBreath) {
    const core = this.model?.internalModel?.coreModel;
    if (!core) return;

    // Helper
    const set = (id, val) => {
      try { core.setParameterValueById(id, val); } catch (e) {}
    };

    // 3D Perspective Rotation (Head)
    set('AngleX', this.angleX);
    set('AngleY', this.angleY);
    set('AngleZ', this.angleZ);
    set('ParamAngleX', this.angleX);
    set('ParamAngleY', this.angleY);
    set('ParamAngleZ', this.angleZ);

    // 3D Torso Parallax (Spine & Ribcage)
    set('ParamBodyAngleX', this.bodyX * 0.5);
    set('ParamBodyAngleY', this.bodyY * 0.4);
    set('ParamBodyAngleZ', this.bodyZ);

    // Volumetric Body Position Shift (Parallax depth)
    set('PositionX', -this.angleX * 0.12 + this.bodyX * 0.08);
    set('PositionY', this.bodyY * 0.08);
    set('PositionZ', this.bodyZ * 0.1 - this.touchRecoil);

    // Organic Breathing & Shoulders
    set('ParamBreath', totalBreath);
    set('ShoulderY', totalBreath * 0.35);

    // Biological Gaze & Pupils
    set('ParamEyeBallX', this.eyeX);
    set('ParamEyeBallY', this.eyeY);
    set('PupilX', this.eyeX * 0.5);
    set('PupilY', this.eyeY * 0.5);

    // Independent Eye Blinks (With smile squint during speech)
    const effectiveBlink = isSpeaking ? Math.min(this.blinkValue, 0.85) : this.blinkValue;
    set('ParamEyeLOpen', effectiveBlink);
    set('ParamEyeROpen', effectiveBlink);

    // Curious Lean Posture
    set('LeanInput', this.lean);

    // Whale/Fish Tail Swaying (DeepSeek Mascot Physics)
    const tailCycle = Math.sin(this.time * 2.2);
    set('Param_Angle_Rotation84', tailCycle * 14.0);
    set('Param_Angle_Rotation85', tailCycle * 18.0);
    set('Param_Angle_Rotation86', tailCycle * 22.0);

    // Speech-Driven Mouth & Emoting
    if (isSpeaking) {
      set('ParamMouthOpenY', this.mouthOpen);
      set('ParamMouthForm', 0.75); // Warm smile while speaking
      set('JawOpen', this.mouthOpen * 0.8);
      set('EyeSmile', 0.45); // Warm eye crescents
      set('ParamBrowLY', 0.25 + this.speakingEnergy * 0.4);
      set('ParamBrowRY', 0.25 + this.speakingEnergy * 0.4);
    } else {
      set('ParamMouthForm', 0.2); // Gentle neutral smile
    }

    // Touch Feedback Parameters
    if (this.touchPuff > 0.05) {
      set('CheeckPuff', this.touchPuff);
    }
    if (this.touchPout > 0.05) {
      set('Mouthpucker', this.touchPout);
    }
  }

  triggerAutonomousLifeAction() {
    const actions = ['curious_lean', 'playful_grass', 'warm_wave', 'smart_glasses', 'sweet_gaze'];
    const chosen = actions[Math.floor(Math.random() * actions.length)];

    console.log('DeepSeek-chan autonomous thought:', chosen);

    switch (chosen) {
      case 'curious_lean':
        this.targetLean = 0.85;
        this.saccadeX = (Math.random() - 0.5) * 0.4;
        setTimeout(() => { this.targetLean = 0; }, 4500);
        break;

      case 'playful_grass':
        triggerMotion('HoldGrass');
        triggerExpression('cute_teeth');
        setTimeout(() => {
          triggerMotion('PutGrass');
          triggerExpression('reset');
        }, 5000);
        break;

      case 'warm_wave':
        triggerMotion('Wave');
        triggerExpression('blush');
        setTimeout(() => {
          triggerMotion('LowerHand');
          triggerExpression('reset');
        }, 3800);
        break;

      case 'smart_glasses':
        triggerExpression('glasses');
        triggerMotion('Point');
        setTimeout(() => {
          triggerMotion('LowerFinger');
          triggerExpression('reset');
        }, 4500);
        break;

      case 'sweet_gaze':
        triggerExpression('heart_eyes');
        setTimeout(() => {
          triggerExpression('blush');
          setTimeout(() => triggerExpression('reset'), 3000);
        }, 1500);
        break;
    }
  }
}

// ==========================================
// 3. Live2D & PixiJS Initialization
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

    console.log('Loading DeepSeek-chan Live2D model from:', MODEL_PATH);
    live2dModel = await PIXI.live2d.Live2DModel.from(MODEL_PATH, {
      autoInteract: false
    });

    pixiApp.stage.addChild(live2dModel);

    // Initialize Autonomous VTuber Life Engine
    lifeEngine = new AutonomousLifeEngine(live2dModel);

    // Hook life engine into Pixi ticker (60 FPS smooth updates)
    pixiApp.ticker.add((delta) => {
      lifeEngine.update(delta / 60);
    });

    // Hook parameter evaluation right before rendering
    if (live2dModel.internalModel) {
      live2dModel.internalModel.on('beforeModelUpdate', () => {
        if (lifeEngine) lifeEngine.applyParameters(1.0);
      });
    }

    updateModelLayout();
    window.addEventListener('resize', updateModelLayout);

    // Track mouse coordinates for 3D perspective
    window.addEventListener('mousemove', (e) => {
      if (lifeEngine) {
        lifeEngine.userMouseX = (e.clientX / window.innerWidth) - 0.5;
        lifeEngine.userMouseY = (e.clientY / window.innerHeight) - 0.5;
        lifeEngine.lastMouseMoveTime = Date.now();
      }
    });

    // Setup tactile touch reactions & window dragging
    setupModelInteractivity();

    console.log('DeepSeek-chan Autonomous Life Engine initialized successfully!');
    
    // Greeting
    setTimeout(() => {
      triggerExpression('blush');
      triggerMotion('Wave');
      showDialogue("Master! Yahoo~ I'm DeepSeek-chan! I feel so energetic and alive today! Let's chat! [heart_eyes]");
      speakText("Master! Yahoo~ I'm DeepSeek-chan! I feel so energetic and alive today! Let's chat!");
    }, 1200);

  } catch (err) {
    console.error('Failed to initialize Live2D model:', err);
    showDialogue('Failed to load Live2D model: ' + err.message);
  }
}

function updateModelLayout() {
  if (!live2dModel) return;
  const width = window.innerWidth;
  const height = window.innerHeight;

  const scale = (height * 0.88) / live2dModel.height;
  live2dModel.scale.set(scale);

  live2dModel.x = (width - live2dModel.width) / 2;
  live2dModel.y = height - live2dModel.height * 0.96;
}

// ==========================================
// 4. Tactile Touch & Click Interactions
// ==========================================
let isWindowDragging = false;
let pointerStartX = 0;
let pointerStartY = 0;
let modelStartX = 0;
let modelStartY = 0;

function setupModelInteractivity() {
  live2dModel.interactive = true;
  live2dModel.buttonMode = true;

  canvas.addEventListener('pointerdown', (e) => {
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    modelStartX = live2dModel.x;
    modelStartY = live2dModel.y;
    isWindowDragging = false;
  });

  window.addEventListener('pointermove', (e) => {
    const dist = Math.hypot(e.clientX - pointerStartX, e.clientY - pointerStartY);
    if (dist > 8 && pointerStartX !== 0) {
      isWindowDragging = true;
      live2dModel.x = modelStartX + (e.clientX - pointerStartX);
      live2dModel.y = modelStartY + (e.clientY - pointerStartY);
    }
  });

  window.addEventListener('pointerup', (e) => {
    if (pointerStartX === 0) return;
    const dist = Math.hypot(e.clientX - pointerStartX, e.clientY - pointerStartY);

    if (dist <= 8 && !isWindowDragging) {
      // It's a tactile touch/click on DeepSeek-chan!
      handleModelTouch(e.clientX, e.clientY);
    }

    pointerStartX = 0;
    pointerStartY = 0;
    isWindowDragging = false;
  });
}

function handleModelTouch(clientX, clientY) {
  if (!live2dModel) return;
  const bounds = live2dModel.getBounds();
  
  if (!bounds.contains(clientX, clientY)) return;

  const relY = (clientY - bounds.y) / bounds.height;
  const relX = (clientX - bounds.x) / bounds.width;

  console.log(`Touch at relX=${relX.toFixed(2)}, relY=${relY.toFixed(2)}`);

  if (relY < 0.35) {
    // 1. HEAD PAT!
    spawnParticles(clientX, clientY, ['💖', '✨', '💕', '🌸']);
    triggerExpression('blush');
    triggerExpression('heart_eyes');
    if (lifeEngine) {
      lifeEngine.targetAngleY = 14.0; // Tilts head up warmly into hand
      lifeEngine.targetAngleZ = 6.0;
    }

    const patLines = [
      "Ehehe~ Headpats from Master make me so happy! [heart_eyes]",
      "Wah~ Master's hand is so warm and gentle... Don't stop! [blush]",
      "Hai~ More pats please! I'm your good girl, right? [heart_eyes]"
    ];
    const line = patLines[Math.floor(Math.random() * patLines.length)];
    showDialogue(line);
    speakText(line);

  } else if (relY >= 0.35 && relY < 0.52 && (relX < 0.36 || relX > 0.64)) {
    // 2. CHEEK PINCH / POKE!
    spawnParticles(clientX, clientY, ['✨', '⭐', '💢']);
    triggerExpression('blush');
    if (lifeEngine) {
      lifeEngine.touchPuff = 1.0;
      lifeEngine.touchPout = 0.85;
    }

    const cheekLines = [
      "Mou~ Master! My cheeks are not mochi! Stop squishing! [smug]",
      "Eep! Master is so naughty today! But it doesn't hurt, ehehe~ [blush]",
      "Pout~ If you squish my cheeks, I won't share my snacks! [smug]"
    ];
    const line = cheekLines[Math.floor(Math.random() * cheekLines.length)];
    showDialogue(line);
    speakText(line);

  } else {
    // 3. TORSO / BELLY POKE!
    spawnParticles(clientX, clientY, ['💧', '✨', '❓']);
    triggerExpression('cold_sweat');
    if (lifeEngine) {
      lifeEngine.touchRecoil = 8.0; // Recoil back in surprise
    }

    const pokeLines = [
      "Kyaa! That tickles, Master! No poking there! [cold_sweat]",
      "Fufu, are you trying to distract me, Master? [smug]",
      "Eep! That surprised me! Careful, Master! [cold_sweat]"
    ];
    const line = pokeLines[Math.floor(Math.random() * pokeLines.length)];
    showDialogue(line);
    speakText(line);
  }
}

function spawnParticles(x, y, symbols) {
  for (let i = 0; i < 4; i++) {
    const p = document.createElement('div');
    p.className = 'touch-particle';
    p.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    p.style.left = `${x + (Math.random() - 0.5) * 40}px`;
    p.style.top = `${y + (Math.random() - 0.5) * 30}px`;
    p.style.setProperty('--dx', `${(Math.random() - 0.5) * 60}px`);
    particleContainer.appendChild(p);

    setTimeout(() => { p.remove(); }, 1300);
  }
}

// ==========================================
// 5. Expressions & Motions Controller
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
// 6. Audio Player & Natural Cadence Lip-Sync
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
    analyser.smoothingTimeConstant = 0.5; // Natural smooth mouth easing
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function syncMouth() {
      if (!isSpeaking || !currentAudio || currentAudio.paused) {
        if (lifeEngine) {
          lifeEngine.mouthOpen = 0;
          lifeEngine.speakingEnergy = 0;
        }
        return;
      }

      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      const energy = Math.min(1.0, avg / 110.0);

      if (lifeEngine) {
        lifeEngine.speakingEnergy = energy;
        lifeEngine.mouthOpen = Math.min(1.0, energy * 1.8);
      }

      requestAnimationFrame(syncMouth);
    }

    currentAudio.onplay = () => {
      requestAnimationFrame(syncMouth);
    };

    currentAudio.onended = () => {
      isSpeaking = false;
      audioWave.classList.add('hidden');
      if (lifeEngine) {
        lifeEngine.mouthOpen = 0;
        lifeEngine.speakingEnergy = 0;
      }
      setTimeout(() => {
        if (!isSpeaking) hideDialogue();
      }, 7000);
    };

    await currentAudio.play();

  } catch (err) {
    console.error('Speech error:', err);
    isSpeaking = false;
    audioWave.classList.add('hidden');
  }
}

// ==========================================
// 7. Dialogue Box & Typewriter Animation
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
  }, 22);
}

function hideDialogue() {
  dialogueBox.classList.add('hidden');
}

// ==========================================
// 8. Chat Interaction Loop (Groq LLM)
// ==========================================
async function sendMessage(userMsg) {
  const msg = (userMsg || chatInput.value).trim();
  if (!msg) return;

  if (!config.groqKey) {
    showDialogue("Master, please put your Groq API Key into .env, config.json, or Settings (⚙️)!");
    openSettingsModal();
    return;
  }

  chatInput.value = '';
  showDialogue(`Master: "${msg}"`);

  // Enter thinking animation
  if (lifeEngine) lifeEngine.isThinking = true;

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

    if (lifeEngine) lifeEngine.isThinking = false;

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
    if (lifeEngine) lifeEngine.isThinking = false;
    console.error('Chat error:', err);
    showDialogue(`Eep! ${err.message}`);
  }
}

// ==========================================
// 9. Voice Chat (Mic & Whisper STT)
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
    if (lifeEngine) lifeEngine.isThinking = true;
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
      if (lifeEngine) lifeEngine.isThinking = false;
      showDialogue("I didn't catch that, Master. Try speaking again?");
    }
  } catch (err) {
    if (lifeEngine) lifeEngine.isThinking = false;
    console.error('STT error:', err);
    showDialogue("STT failed: " + err.message);
  }
}

// ==========================================
// 10. Event Listeners & Settings Modal
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

  localStorage.setItem('groq_key', config.groqKey);
  localStorage.setItem('groq_model', config.groqModel);
  localStorage.setItem('tts_voice', config.voice);
  localStorage.setItem('tts_pitch', config.pitch);
  localStorage.setItem('tts_rate', config.rate);

  settingsModal.classList.add('hidden');
  showDialogue("Settings saved permanently, Master! ✨");
  triggerExpression('blush');
});

// App Startup
window.addEventListener('DOMContentLoaded', async () => {
  await syncConfigFromServer();
  await initLive2D();
});
