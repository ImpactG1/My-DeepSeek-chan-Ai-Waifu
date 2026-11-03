// ==========================================
// DeepSeek-chan AI Waifu Desktop Companion
// Desktop Roaming Pet Engine & 3D Life System
// ==========================================

const { ipcRenderer } = require('electron');

const BACKEND_URL = 'http://127.0.0.1:8000';
const MODEL_PATH = '../assets/live2d/deepseek/model.model3.json';

// States
const PET_STATES = {
  IDLE: 'IDLE',
  WALK: 'WALK',
  RUN: 'RUN',
  HOP: 'HOP',
  SIT: 'SIT',
  SLEEP: 'SLEEP'
};

// Global App State
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
let roamEnabled = true;

// Configuration
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
const btnRoam = document.getElementById('btn-roam');
const dragBar = document.getElementById('drag-bar');

// ==========================================
// 1. Load Server Configuration (Permanent)
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
// 2. Desktop Roaming & Autonomous Life Engine
// ==========================================
class DesktopLifeEngine {
  constructor(model) {
    this.model = model;
    this.time = 0;

    // Dimensions & Positioning
    this.groundY = window.innerHeight - 440;
    this.baseScale = 0.42;
    this.facing = 1; // 1 = right, -1 = left
    this.scaleFacing = 1;
    this.targetScaleFacing = 1;

    // Pet State Machine
    this.state = PET_STATES.IDLE;
    this.stateTimer = 0;
    this.stateDuration = 6.0;

    // Movement Navigation
    this.targetX = model.x;
    this.moveSpeed = 95;
    this.walkCycle = 0;

    // Hop / Jump Physics
    this.hopVY = 0;
    this.hopPhase = 0; // 0=crouch, 1=airborne, 2=land

    // 3D Head & Torso Angles
    this.angleX = 0;
    this.angleY = 0;
    this.angleZ = 0;
    this.targetAngleX = 0;
    this.targetAngleY = 0;
    this.targetAngleZ = 0;

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
    this.nextSaccade = 1.8;

    // Biological Blinking
    this.blinkValue = 1.0;
    this.isBlinking = false;
    this.blinkTimer = 0;
    this.nextBlink = 3.2;
    this.blinkProgress = 0;

    // Mouse Tracking
    this.userMouseX = 0;
    this.userMouseY = 0;
    this.rawMouseX = window.innerWidth / 2;
    this.rawMouseY = window.innerHeight / 2;
    this.lastMouseMoveTime = Date.now();

    // Speech Audio Reactive
    this.speakingEnergy = 0;
    this.mouthOpen = 0;

    // Touch Feedback
    this.touchPuff = 0;
    this.touchPout = 0;
    this.touchRecoil = 0;

    // Thought state
    this.isThinking = false;
  }

  update(dt) {
    this.time += dt;

    // 1. Update Pet State Machine (Walk, Run, Hop, Sit, Sleep)
    if (!isWindowDragging) {
      this.updateStateMachine(dt);
    }

    // 2. Breathing & Body Sway
    const isSleeping = this.state === PET_STATES.SLEEP;
    const breathFreq = isSleeping ? 1.2 : 1.9;
    const breath = (Math.sin(this.time * breathFreq) + 1) * 0.5;
    const totalBreath = isSleeping ? breath * 0.7 : breath;

    // 3. Eye Saccades
    this.saccadeTimer += dt;
    if (this.saccadeTimer >= this.nextSaccade) {
      this.saccadeTimer = 0;
      this.nextSaccade = 1.5 + Math.random() * 2.8;
      if (!isSleeping && !this.isThinking) {
        this.saccadeX = (Math.random() - 0.5) * 0.26;
        this.saccadeY = (Math.random() - 0.5) * 0.20;
      }
    }

    // 4. Biological Blinking
    if (!isSleeping) {
      this.blinkTimer += dt;
      if (!this.isBlinking && this.blinkTimer >= this.nextBlink) {
        this.isBlinking = true;
        this.blinkTimer = 0;
        this.blinkProgress = 0;
        this.nextBlink = 2.5 + Math.random() * 4.0;
      }
      if (this.isBlinking) {
        this.blinkProgress += dt * 14.0;
        if (this.blinkProgress <= 1.0) {
          this.blinkValue = 1.0 - Math.sin(this.blinkProgress * Math.PI);
        } else {
          this.blinkValue = 1.0;
          this.isBlinking = false;
          if (Math.random() < 0.2) this.nextBlink = 0.18;
        }
      }
    } else {
      this.blinkValue = 0; // Eyes closed in sleep
    }

    // 5. Head Tracking & Parallax
    this.updateHeadAndTorso(dt, isSleeping);

    // 6. Speech Head Nodding
    let speechNodY = 0;
    let speechTiltZ = 0;
    if (isSpeaking && this.speakingEnergy > 0.05) {
      speechNodY = -Math.sin(this.time * 8.0) * (this.speakingEnergy * 7.0);
      speechTiltZ = Math.sin(this.time * 4.5) * (this.speakingEnergy * 5.0);
    }

    // Smooth second-order spring/lerp for angles
    const lerpSpeed = dt * 6.5;
    this.angleX += (this.targetAngleX - this.angleX) * lerpSpeed;
    this.angleY += (this.targetAngleY + speechNodY - this.angleY) * lerpSpeed;
    this.angleZ += (this.targetAngleZ + speechTiltZ - this.angleZ) * lerpSpeed;

    // Eye gaze tracks with target
    const targetEyeX = (this.angleX / 26.0) * 0.72 + this.saccadeX;
    const targetEyeY = (this.angleY / 20.0) * 0.72 + this.saccadeY;
    this.eyeX += (targetEyeX - this.eyeX) * (dt * 12.0);
    this.eyeY += (targetEyeY - this.eyeY) * (dt * 12.0);

    // Body follow
    this.bodyX += (this.angleX * 0.35 - this.bodyX) * (dt * 4.5);
    this.bodyY += (totalBreath * 3.5 - this.bodyY) * (dt * 4.5);
    this.bodyZ += (this.targetAngleZ * 0.4 - this.bodyZ) * (dt * 4.5);
    this.lean += (this.targetLean - this.lean) * (dt * 3.5);

    // Touch decays
    this.touchPuff *= Math.max(0, 1.0 - dt * 2.0);
    this.touchPout *= Math.max(0, 1.0 - dt * 2.0);
    this.touchRecoil *= Math.max(0, 1.0 - dt * 3.0);

    // 7. Apply to Live2D core model
    this.applyParameters(totalBreath, isSleeping);

    // 8. Update Dialogue Bubble Position (Follows her head!)
    updateDialoguePosition();
  }

  updateStateMachine(dt) {
    if (!roamEnabled && this.state !== PET_STATES.IDLE && this.state !== PET_STATES.SIT) {
      this.state = PET_STATES.IDLE;
    }

    this.stateTimer += dt;

    switch (this.state) {
      case PET_STATES.IDLE:
        // Standing and breathing with gentle posture recovery
        this.model.y += (this.groundY - this.model.y) * (dt * 6.0);
        this.targetLean = 0;

        if (roamEnabled && this.stateTimer >= this.stateDuration && !isSpeaking && !this.isThinking) {
          this.pickNextState();
        }
        break;

      case PET_STATES.WALK:
        this.walkCycle += dt * 5.2; // Natural bipedal cadence
        const dx = this.targetX - this.model.x;
        const dist = Math.abs(dx);

        if (dist > 14) {
          const moveDir = dx > 0 ? 1 : -1;
          this.facing = moveDir;
          this.targetScaleFacing = this.facing;
          this.model.x += moveDir * this.moveSpeed * dt;
          this.targetLean = -6.0; // Purposeful forward walking posture

          // Step double-bounce on desktop
          const stepBounce = Math.abs(Math.sin(this.walkCycle * 2.0));
          this.model.y = this.groundY - stepBounce * 8.5;
        } else {
          // Reached destination! Choose next behavior
          const rand = Math.random();
          if (rand < 0.35) {
            this.state = PET_STATES.HOP;
            this.hopPhase = 0;
            this.stateTimer = 0;
            this.stateDuration = 2.0;
          } else if (rand < 0.65) {
            this.state = PET_STATES.SIT;
            this.stateTimer = 0;
            this.stateDuration = 12.0 + Math.random() * 15.0;
          } else {
            this.state = PET_STATES.IDLE;
            this.stateTimer = 0;
            this.stateDuration = 4.0 + Math.random() * 5.0;
          }
        }
        break;

      case PET_STATES.RUN:
        this.walkCycle += dt * 9.5; // High-cadence sprint
        const rdx = this.targetX - this.model.x;
        const rdist = Math.abs(rdx);

        if (rdist > 18) {
          const rDir = rdx > 0 ? 1 : -1;
          this.facing = rDir;
          this.targetScaleFacing = this.facing;
          this.model.x += rDir * (this.moveSpeed * 2.1) * dt;
          this.targetLean = -24.0; // Deep athletic forward lean!

          // Energetic vertical bounce
          const runBounce = Math.abs(Math.sin(this.walkCycle * 2.0));
          this.model.y = this.groundY - runBounce * 16.0;
        } else {
          this.targetLean = 0;
          this.state = PET_STATES.IDLE;
          this.stateTimer = 0;
          this.stateDuration = 4.0;
        }
        break;

      case PET_STATES.HOP:
        this.handleHopState(dt);
        break;

      case PET_STATES.SIT:
        // Lowers gracefully onto taskbar
        const sitY = this.groundY + 36;
        this.model.y += (sitY - this.model.y) * (dt * 5.0);
        this.targetLean = -14.0; // Comfortable forward folded posture

        if (this.stateTimer >= this.stateDuration && !isSpeaking) {
          if (Math.random() < 0.42) {
            // Falls peacefully asleep!
            this.state = PET_STATES.SLEEP;
            this.stateTimer = 0;
            this.stateDuration = 22.0 + Math.random() * 26.0;
            showDialogue("DeepSeek-chan is napping peacefully on the taskbar... zZz");
          } else {
            // Stands back up
            this.state = PET_STATES.IDLE;
            this.stateTimer = 0;
            this.stateDuration = 5.0;
          }
        }
        break;

      case PET_STATES.SLEEP:
        // Peaceful snooze curled up on taskbar
        const sleepY = this.groundY + 36;
        this.model.y += (sleepY - this.model.y) * (dt * 4.0);
        this.targetLean = -16.0;

        if (this.stateTimer >= this.stateDuration || isSpeaking) {
          this.wakeUp();
        }
        break;
    }

    // Smooth horizontal turning flip interpolation
    this.scaleFacing += (this.targetScaleFacing - this.scaleFacing) * Math.min(1.0, dt * 9.0);
    this.model.scale.set(Math.abs(this.baseScale) * this.scaleFacing, this.baseScale);
  }

  pickNextState() {
    this.stateTimer = 0;
    const rand = Math.random();

    if (rand < 0.45) {
      // Walk somewhere along desktop
      this.state = PET_STATES.WALK;
      this.targetX = 100 + Math.random() * (window.innerWidth - 280);
      this.moveSpeed = 80 + Math.random() * 25;
      this.stateDuration = 12.0;
    } else if (rand < 0.65) {
      // Sit on taskbar
      this.state = PET_STATES.SIT;
      this.stateDuration = 12.0 + Math.random() * 18.0;
    } else if (rand < 0.85) {
      // Hop joyfully
      this.state = PET_STATES.HOP;
      this.hopPhase = 0;
      this.hopVY = 0;
      this.stateDuration = 2.0;
    } else {
      // Playful sprint
      this.state = PET_STATES.RUN;
      this.targetX = 120 + Math.random() * (window.innerWidth - 300);
      this.stateDuration = 8.0;
    }
  }

  handleHopState(dt) {
    if (this.hopPhase === 0) {
      // 1. Crouch windup (anticipation)
      const crouchY = this.groundY + 16.0;
      this.model.y += (crouchY - this.model.y) * (dt * 18.0);
      this.targetLean = -18.0;
      if (this.stateTimer > 0.20) {
        this.hopPhase = 1;
        this.hopVY = -16.0; // Launch upward!
        this.stateTimer = 0;
      }
    } else if (this.hopPhase === 1) {
      // 2. Airborne parabolic arc
      this.hopVY += 36.0 * dt; // Gravity
      this.model.y += this.hopVY;
      this.model.x += this.facing * 40.0 * dt;
      this.targetLean = -5.0;

      if (this.model.y >= this.groundY) {
        this.model.y = this.groundY;
        this.hopPhase = 2; // Impact touchdown
        this.stateTimer = 0;
      }
    } else if (this.hopPhase === 2) {
      // 3. Landing shock absorption & squash recovery
      const landY = this.groundY + 12.0;
      this.model.y += (landY - this.model.y) * (dt * 16.0);
      if (this.stateTimer > 0.16) {
        this.state = PET_STATES.IDLE;
        this.stateTimer = 0;
        this.stateDuration = 4.0;
      }
    }
  }

  wakeUp() {
    this.state = PET_STATES.IDLE;
    this.stateTimer = 0;
    this.stateDuration = 5.0;
    triggerExpression('blush');
    showDialogue("Fwaaah... Good morning, Master! Did I doze off? [blush]");
    speakText("Fwaaah... Good morning, Master! Did I doze off?");
  }

  updateHeadAndTorso(dt, isSleeping) {
    const timeSinceMouseMove = (Date.now() - this.lastMouseMoveTime) / 1000;

    if (isSleeping) {
      // Head nods down in deep sleep
      this.targetAngleX = 4.0 * this.facing;
      this.targetAngleY = -20.0;
      this.targetAngleZ = 16.0 * this.facing;
      return;
    }

    if (this.isThinking) {
      this.targetAngleX = 14.0 * this.facing;
      this.targetAngleY = 12.0;
      this.targetAngleZ = 8.0;
      return;
    }

    if (this.state === PET_STATES.WALK || this.state === PET_STATES.RUN) {
      // Look in walking direction with step cadence bob
      this.targetAngleX = 14.0 * this.facing;
      this.targetAngleY = 2.0;
      this.targetAngleZ = Math.sin(this.walkCycle * 2.0) * -5.0 * this.facing;
      return;
    }

    if (timeSinceMouseMove < 4.5) {
      // Active tracking of user cursor relative to model head
      const headScreenX = this.model.x;
      const headScreenY = this.model.y - 200;
      const dx = (this.rawMouseX - headScreenX) / window.innerWidth;
      const dy = (this.rawMouseY - headScreenY) / window.innerHeight;

      this.targetAngleX = Math.max(-28, Math.min(28, dx * 50.0));
      this.targetAngleY = Math.max(-20, Math.min(20, -dy * 40.0));
      this.targetAngleZ = -this.targetAngleX * 0.18;
    } else {
      // Autonomous wander gaze
      this.targetAngleX = (Math.sin(this.time * 0.4) * 16.0 + Math.sin(this.time * 0.9) * 7.0) * this.facing;
      this.targetAngleY = Math.cos(this.time * 0.35) * 8.0;
      this.targetAngleZ = Math.sin(this.time * 0.5) * 4.0;
    }
  }

  applyParameters(totalBreath, isSleeping) {
    const core = this.model?.internalModel?.coreModel;
    if (!core) return;

    const set = (id, val) => {
      try { core.setParameterValueById(id, val); } catch (e) {}
    };

    // 1. Head & Facial 3D Orientation
    set('AngleX', this.angleX);
    set('AngleY', this.angleY);
    set('AngleZ', this.angleZ);
    set('ParamAngleX', this.angleX);
    set('ParamAngleY', this.angleY);
    set('ParamAngleZ', this.angleZ);

    // 2. Diaphragmatic Breathing
    set('ParamBreath', totalBreath);

    // 3. Multi-Axis Locomotion Kinematics
    const isWalking = this.state === PET_STATES.WALK;
    const isRunning = this.state === PET_STATES.RUN;
    const isHopping = this.state === PET_STATES.HOP;
    const isSitting = this.state === PET_STATES.SIT;

    if (isWalking || isRunning) {
      const phase = this.walkCycle;
      const twoPhase = phase * 2.0;
      const intensity = isRunning ? 1.6 : 1.0;

      // Pelvis (Hips) Weight-Shifting Kinematics
      const hipTilt = Math.sin(phase) * (14.0 * intensity) * this.facing;
      const hipTwist = Math.cos(phase) * (6.0 * intensity);
      const hipDip = -Math.abs(Math.sin(twoPhase)) * (8.0 * intensity);
      set('HipAngleZ', hipTilt);
      set('HipAngleX', hipTwist);
      set('HipAngleY', hipDip);
      set('ParamHipAngleZ', hipTilt * 0.7);
      set('HipZ1', hipTilt * 0.5);

      // Shoulders Counter-Opposition (Dips opposite to hip for human balance!)
      const shoulderTilt = -Math.sin(phase) * (10.0 * intensity) * this.facing;
      const shoulderDip = Math.sin(twoPhase) * (4.0 * intensity) + totalBreath * 0.3;
      set('ShoulderZ', shoulderTilt);
      set('ShoulderY', shoulderDip);

      // Arms & Forearms Stride Opposition (Left arm swings with right leg!)
      const armSwing = Math.sin(phase) * (16.0 * intensity);
      set('LArm', armSwing * this.facing);
      set('RArm', -armSwing * this.facing);
      set('LForearm', Math.max(0, armSwing * 0.6) + (isRunning ? 14.0 : 4.0));
      set('RForearm', Math.max(0, -armSwing * 0.6) + (isRunning ? 14.0 : 4.0));
      set('LWrist', Math.cos(phase) * 8.0);
      set('RWrist', -Math.cos(phase) * 8.0);

      // Torso & Chest Counter-Twist
      const torsoTilt = -Math.sin(phase) * (8.0 * intensity) * this.facing;
      set('ParamBodyAngleZ', torsoTilt);
      set('ParamBodyAngleX', Math.sin(phase) * (5.0 * intensity) * this.facing);
      set('ParamBodyAngleY', hipDip * 0.4);

      // Volumetric Body 3D Shift
      set('PositionX', Math.sin(phase) * (2.5 * intensity) * this.facing);
      set('PositionY', hipDip * 0.5);
      set('PositionZ', -this.touchRecoil);

      // Leg Stride & Stance Width
      set('LEGAngleZ2', Math.sin(phase) * (18.0 * intensity) * this.facing);
      set('Param33', Math.abs(Math.sin(twoPhase)) * 0.35);

      // Skirt Cloth Aerodynamics (Lagging 90 degrees behind hips!)
      const skirtPhase = Math.cos(phase);
      const skirtFlutter = Math.sin(twoPhase);
      set('SkirtX1', skirtPhase * (12.0 * intensity) * this.facing);
      set('SkirtX2', skirtPhase * (15.0 * intensity) * this.facing);
      set('SkirtX3', skirtPhase * (18.0 * intensity) * this.facing);
      set('SkirtX4', skirtPhase * (20.0 * intensity) * this.facing);
      set('SkirtY', skirtFlutter * (8.0 * intensity));
      set('SkirtY2', skirtFlutter * (10.0 * intensity));
      set('SkirtY3', skirtFlutter * (12.0 * intensity));
      set('SkirtLayerX1', skirtPhase * 8.0);
      set('SkirtLayerX2', skirtPhase * 10.0);
      set('SkirtLayerY1', skirtFlutter * 6.0);

      // 6-Segment Whale Tail Wave Propagation (Progressive Phase Delay!)
      const tailSpeed = isRunning ? 2.2 : 1.4;
      const tailBasePhase = phase * tailSpeed;
      const tailAmp = isRunning ? 28.0 : 18.0;
      set('Param_Angle_Rotation84', Math.sin(tailBasePhase - 0.00) * (tailAmp * 0.65));
      set('Param_Angle_Rotation85', Math.sin(tailBasePhase - 0.35) * (tailAmp * 0.80));
      set('Param_Angle_Rotation86', Math.sin(tailBasePhase - 0.70) * (tailAmp * 0.95));
      set('Param_Angle_Rotation87', Math.sin(tailBasePhase - 1.05) * (tailAmp * 1.10));
      set('Param_Angle_Rotation88', Math.sin(tailBasePhase - 1.40) * (tailAmp * 1.25));
      set('Param_Angle_Rotation89', Math.sin(tailBasePhase - 1.75) * (tailAmp * 1.40));

    } else if (isHopping) {
      if (this.hopPhase === 0) {
        // Crouch windup
        set('HipAngleY', -18.0);
        set('PositionY', -15.0);
        set('LArm', -22.0);
        set('RArm', -22.0);
        set('SkirtY', 14.0);
        set('Param33', 0.2);
      } else if (this.hopPhase === 1) {
        // Airborne apex
        set('HipAngleY', 14.0);
        set('PositionY', 12.0);
        set('LArm', 26.0);
        set('RArm', 26.0);
        set('LForearm', 15.0);
        set('RForearm', 15.0);
        set('Param33', 0.7); // Legs spread
        set('SkirtX1', 14.0 * this.facing);
        set('SkirtY', -16.0); // Skirt lifts with wind
        set('Param_Angle_Rotation84', -18.0);
        set('Param_Angle_Rotation85', -22.0);
        set('Param_Angle_Rotation86', -26.0);
      } else {
        // Landing compression
        set('HipAngleY', -14.0);
        set('SkirtY', 16.0);
        set('ShoulderY', 6.0);
        set('Param33', 0.0);
      }

    } else if (isSitting || isSleeping) {
      // Sitting / Sleeping Posture
      set('Param33', 1.0); // Legs closed together
      set('LEGAngleZ2', 0.0);
      set('HipAngleX', 10.0);
      set('HipAngleY', -14.0);
      set('HipAngleZ', 0.0);
      set('ParamBodyAngleY', -8.0);

      // Arms resting on lap
      set('LArm', 12.0);
      set('RArm', 12.0);
      set('LForearm', 16.0);
      set('RForearm', 16.0);
      set('LWrist', 8.0);
      set('RWrist', 8.0);

      // Skirt resting flat
      set('SkirtY', 14.0);
      set('SkirtX1', 0);
      set('SkirtX2', 0);

      // Gentle tail twitch
      const tailRest = Math.sin(this.time * 0.8) * 8.0;
      set('Param_Angle_Rotation84', tailRest);
      set('Param_Angle_Rotation85', tailRest * 1.2);
      set('Param_Angle_Rotation86', tailRest * 1.4);

    } else {
      // Natural Organic Idle: Weight Shift between feet
      const idleSway = Math.sin(this.time * 0.55);
      const hipTilt = idleSway * 4.5 * this.facing;
      set('HipAngleZ', hipTilt);
      set('ShoulderZ', -hipTilt * 0.7);
      set('ParamBodyAngleZ', -hipTilt * 0.5);
      set('ParamBodyAngleX', this.bodyX * 0.4);
      set('ParamBodyAngleY', this.bodyY * 0.3);
      set('ShoulderY', totalBreath * 0.35);

      set('LArm', Math.sin(this.time * 0.9) * 2.5);
      set('RArm', -Math.sin(this.time * 0.9) * 2.5);
      set('LForearm', 4.0);
      set('RForearm', 4.0);
      set('LEGAngleZ2', hipTilt * 0.5);
      set('Param33', 0.0);

      // Idle tail gentle sway
      const tailIdle = Math.sin(this.time * 1.5);
      set('Param_Angle_Rotation84', tailIdle * 10.0);
      set('Param_Angle_Rotation85', tailIdle * 14.0);
      set('Param_Angle_Rotation86', tailIdle * 18.0);
      set('Param_Angle_Rotation87', tailIdle * 22.0);
      set('Param_Angle_Rotation88', tailIdle * 25.0);
      set('Param_Angle_Rotation89', tailIdle * 28.0);
    }

    // 4. Lean Forward Posture
    set('LeanInput', this.lean);

    // 5. Gaze & Pupils
    set('ParamEyeBallX', this.eyeX);
    set('ParamEyeBallY', this.eyeY);
    set('PupilX', this.eyeX * 0.5);
    set('PupilY', this.eyeY * 0.5);

    // 6. Blinking
    set('ParamEyeLOpen', this.blinkValue);
    set('ParamEyeROpen', this.blinkValue);

    // 7. Speech-Driven Mouth & Emoting
    if (isSpeaking) {
      set('ParamMouthOpenY', this.mouthOpen);
      set('ParamMouthForm', 0.75); // Smile while talking
      set('JawOpen', this.mouthOpen * 0.85);
      set('EyeSmile', 0.45);
      set('ParamBrowLY', 0.25 + this.speakingEnergy * 0.4);
      set('ParamBrowRY', 0.25 + this.speakingEnergy * 0.4);
    } else if (isSleeping) {
      set('EyeSmile', 0.85);
      set('ParamMouthForm', 0.3);
      set('ParamMouthOpenY', 0);
    } else {
      set('ParamMouthForm', 0.2);
    }

    // 8. Touch Reactions
    if (this.touchPuff > 0.05) set('CheeckPuff', this.touchPuff);
    if (this.touchPout > 0.05) set('Mouthpucker', this.touchPout);
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

    console.log('Loading DeepSeek-chan from:', MODEL_PATH);
    live2dModel = await PIXI.live2d.Live2DModel.from(MODEL_PATH, {
      autoInteract: false
    });

    pixiApp.stage.addChild(live2dModel);

    // Initialize Desktop Life Engine
    lifeEngine = new DesktopLifeEngine(live2dModel);

    // Hook life engine into 60 FPS ticker
    pixiApp.ticker.add((delta) => {
      lifeEngine.update(delta / 60);
    });

    // Parameter hook right before drawing
    if (live2dModel.internalModel) {
      live2dModel.internalModel.on('beforeModelUpdate', () => {
        if (lifeEngine) lifeEngine.applyParameters(1.0, lifeEngine.state === PET_STATES.SLEEP);
      });
    }

    updateModelLayout();
    window.addEventListener('resize', updateModelLayout);

    // Global cursor tracking & smart mouse forwarding
    window.addEventListener('mousemove', (e) => {
      if (lifeEngine) {
        lifeEngine.rawMouseX = e.clientX;
        lifeEngine.rawMouseY = e.clientY;
        lifeEngine.lastMouseMoveTime = Date.now();
      }

      // Check if mouse is hovering over character or UI
      checkPointerHover(e.clientX, e.clientY);
    });

    setupModelInteractivity();

    console.log('DeepSeek-chan Desktop Roaming Pet initialized successfully!');

    // Greeting
    setTimeout(() => {
      triggerExpression('blush');
      triggerMotion('Wave');
      showDialogue("Master! Yahoo~ I can freely hop and roam across your entire desktop now! [heart_eyes]");
      speakText("Master! Yahoo~ I can freely hop and roam across your entire desktop now!");
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

  // Scale model to a comfortable pet size (~450px tall)
  const targetHeight = Math.min(480, height * 0.52);
  const scale = targetHeight / live2dModel.height;

  if (lifeEngine) {
    lifeEngine.baseScale = scale;
    lifeEngine.groundY = height - targetHeight * 0.94;
  }

  live2dModel.scale.set(scale);

  // Position at bottom-right initially
  if (!live2dModel.x || live2dModel.x === 0) {
    live2dModel.x = width - targetHeight * 0.85;
    live2dModel.y = height - targetHeight * 0.94;
    if (lifeEngine) lifeEngine.targetX = live2dModel.x;
  }
}

// ==========================================
// 4. Smart Click-Through & Dialogue Following
// ==========================================
let isMouseCaptured = false;

function checkPointerHover(x, y) {
  let shouldCapture = false;

  // 1. Check Live2D character bounds
  if (live2dModel) {
    const bounds = live2dModel.getBounds();
    if (bounds.contains(x, y)) shouldCapture = true;
  }

  // 2. Check UI elements
  if (isPointInElement(chatDock, x, y)) shouldCapture = true;
  if (!dialogueBox.classList.contains('hidden') && isPointInElement(dialogueBox, x, y)) shouldCapture = true;
  if (!settingsModal.classList.contains('hidden') && isPointInElement(settingsModal, x, y)) shouldCapture = true;
  if (isPointInElement(dragBar, x, y)) shouldCapture = true;

  if (shouldCapture !== isMouseCaptured) {
    isMouseCaptured = shouldCapture;
    ipcRenderer.send('set-clickthrough', !shouldCapture);
  }
}

function isPointInElement(el, x, y) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function updateDialoguePosition() {
  if (!live2dModel || dialogueBox.classList.contains('hidden')) return;

  const bubbleWidth = dialogueBox.offsetWidth || 300;
  let targetX = live2dModel.x - (bubbleWidth / 2);
  targetX = Math.max(20, Math.min(window.innerWidth - bubbleWidth - 20, targetX));

  let targetY = live2dModel.y - 120;
  targetY = Math.max(24, targetY);

  dialogueBox.style.left = `${targetX}px`;
  dialogueBox.style.top = `${targetY}px`;
}

// ==========================================
// 5. Tactile Touch & Drag Interactions
// ==========================================
let isWindowDragging = false;
let pointerStartX = 0;
let pointerStartY = 0;
let modelStartX = 0;
let modelStartY = 0;

function setupModelInteractivity() {
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
      if (lifeEngine) lifeEngine.targetX = live2dModel.x;
    }
  });

  window.addEventListener('pointerup', (e) => {
    if (pointerStartX === 0) return;
    const dist = Math.hypot(e.clientX - pointerStartX, e.clientY - pointerStartY);

    if (dist <= 8 && !isWindowDragging) {
      handleModelTouch(e.clientX, e.clientY);
    }

    pointerStartX = 0;
    pointerStartY = 0;
    isWindowDragging = false;
  });
}

function handleModelTouch(clientX, clientY) {
  if (!live2dModel) return;

  // Wake up if sleeping
  if (lifeEngine && lifeEngine.state === PET_STATES.SLEEP) {
    lifeEngine.wakeUp();
    return;
  }

  const bounds = live2dModel.getBounds();
  if (!bounds.contains(clientX, clientY)) return;

  const relY = (clientY - bounds.y) / bounds.height;
  const relX = (clientX - bounds.x) / bounds.width;

  if (relY < 0.35) {
    // 1. HEAD PAT!
    triggerExpression('blush');
    triggerExpression('heart_eyes');
    if (lifeEngine) {
      lifeEngine.targetAngleY = 14.0;
      lifeEngine.targetAngleZ = 6.0;
    }

    const patLines = [
      "Ehehe~ Headpats from Master make me so happy! [heart_eyes]",
      "Wah~ Master's hand is so warm and gentle... [blush]",
      "Hai~ More pats please! I'm your good girl! [heart_eyes]"
    ];
    const line = patLines[Math.floor(Math.random() * patLines.length)];
    showDialogue(line);
    speakText(line);

  } else if (relY >= 0.35 && relY < 0.52 && (relX < 0.36 || relX > 0.64)) {
    // 2. CHEEK PINCH!
    triggerExpression('blush');
    if (lifeEngine) {
      lifeEngine.touchPuff = 1.0;
      lifeEngine.touchPout = 0.85;
    }

    const cheekLines = [
      "Mou~ Master! My cheeks are not mochi! Stop squishing! [smug]",
      "Eep! Master is so naughty today! But it feels cute, ehehe~ [blush]",
      "Pout~ If you squish my cheeks, I won't share my snacks! [smug]"
    ];
    const line = cheekLines[Math.floor(Math.random() * cheekLines.length)];
    showDialogue(line);
    speakText(line);

  } else {
    // 3. TORSO / BELLY POKE!
    triggerExpression('cold_sweat');
    if (lifeEngine) {
      lifeEngine.touchRecoil = 7.0;
    }

    const pokeLines = [
      "Kyaa! That tickles, Master! No poking there! [cold_sweat]",
      "Fufu, are you trying to distract me from my walk, Master? [smug]",
      "Eep! That surprised me! Careful, Master! [cold_sweat]"
    ];
    const line = pokeLines[Math.floor(Math.random() * pokeLines.length)];
    showDialogue(line);
    speakText(line);
  }
}

// ==========================================
// 6. Expressions & Motions Controller
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
// 7. Audio Player & Natural Cadence Lip-Sync
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
    analyser.smoothingTimeConstant = 0.5;
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
// 8. Dialogue Box & Typewriter Animation
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

  updateDialoguePosition();
}

function hideDialogue() {
  dialogueBox.classList.add('hidden');
}

// ==========================================
// 9. Chat Interaction Loop (Groq LLM)
// ==========================================
async function sendMessage(userMsg) {
  const msg = (userMsg || chatInput.value).trim();
  if (!msg) return;

  if (!config.groqKey) {
    showDialogue("Master, please put your Groq API Key into .env, config.json, or Settings (⚙️)!");
    openSettingsModal();
    return;
  }

  // Wake up if sleeping
  if (lifeEngine && lifeEngine.state === PET_STATES.SLEEP) {
    lifeEngine.wakeUp();
  }

  chatInput.value = '';
  showDialogue(`Master: "${msg}"`);

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
// 10. Voice Chat (Mic & Whisper STT)
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
// 11. Event Listeners & Roaming Toggle
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

// Roaming Toggle
btnRoam.addEventListener('click', () => {
  roamEnabled = !roamEnabled;
  btnRoam.classList.toggle('active', roamEnabled);
  if (roamEnabled) {
    showDialogue("Roam mode ON! I'm exploring your desktop! 🐾");
    if (lifeEngine) lifeEngine.pickNextState();
  } else {
    showDialogue("Sitting still right here with Master! ✨");
    if (lifeEngine) lifeEngine.state = PET_STATES.IDLE;
  }
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
