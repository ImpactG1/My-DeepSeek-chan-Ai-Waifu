/**
 * DeepSeek-chan Desktop Companion
 * Dual Engine: 3D VRM VTuber Engine (Full Humanoid Skeletal Bones) & 2D Live2D Engine
 * Features:
 * - True Bipedal Skeletal Locomotion: Alternating leg strides with knee bending, ankle flex, and arm opposition
 * - Procedural Life States: IDLE, WALK, RUN, HOP, SIT, SLEEP
 * - 3D Gaze Tracking: Eyes and head smoothly follow the mouse cursor across desktop
 * - Real-Time 3D Lip-Sync: Edge-TTS audio stream drives mouth blend shapes (aa, oh)
 * - SpringBone Physics: Dynamic hair, ribbon, and skirt inertia and wind
 * - 3D Raycasting & Smart Click-Through: Seamless desktop pass-through with interactive touch
 * - Groq LLM (qwen/qwen3.8-27b) + Whisper STT + Edge-TTS (Nanami Japanese Accent)
 */

const { ipcRenderer } = require('electron');

// ==========================================
// Global Constants & State
// ==========================================
const API_BASE = 'http://127.0.0.1:8000';
const VRM_MODEL_PATH = '../assets/vrm/avatar.vrm';
const LIVE2D_MODEL_PATH = '../assets/live2d/deepseek/model.model3.json';

const PET_STATES = {
  IDLE: 'IDLE',
  WALK: 'WALK',
  RUN: 'RUN',
  HOP: 'HOP',
  SIT: 'SIT',
  SLEEP: 'SLEEP'
};

let currentEngineMode = '3d'; // '3d' or '2d'
let vrmLifeEngine = null;
let live2dLifeEngine = null;
let threeScene = null;
let threeCamera = null;
let threeRenderer = null;
let currentVrm = null;
let pixiApp = null;
let live2dModel = null;
let isAudioPlaying = false;
let audioAnalyser = null;
let audioContext = null;
let isRoamingEnabled = true;

// DOM Elements
const canvas = document.getElementById('waifu-canvas') || document.getElementById('live2d-canvas');
const dialogueBox = document.getElementById('dialogue-box');
const dialogueText = document.getElementById('dialogue-text');
const audioWave = document.getElementById('audio-wave');
const chatDock = document.getElementById('chat-dock');
const dockInner = document.getElementById('dock-inner');
const btnToggleDock = document.getElementById('btn-toggle-dock');
const dockChevron = document.getElementById('dock-chevron');
const chatInput = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send');
const btnMic = document.getElementById('btn-mic');
const btnRoam = document.getElementById('btn-roam');
const btnMode = document.getElementById('btn-mode');
const btnPin = document.getElementById('btn-pin');
const btnSettings = document.getElementById('btn-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');
const btnMin = document.getElementById('btn-min');
const btnClose = document.getElementById('btn-close');
const settingsModal = document.getElementById('settings-modal');
const cfgGroqKey = document.getElementById('cfg-groq-key');
const cfgGroqModel = document.getElementById('cfg-groq-model');
const cfgVoice = document.getElementById('cfg-voice');
const cfgPitch = document.getElementById('cfg-pitch');
const cfgRate = document.getElementById('cfg-rate');
const pitchVal = document.getElementById('pitch-val');
const rateVal = document.getElementById('rate-val');
const expButtons = document.querySelectorAll('.exp-btn');
const dragBar = document.getElementById('drag-bar');

// ==========================================
// 1. Server Configuration & Preferences
// ==========================================
let serverConfig = {
  groq_model: 'qwen/qwen3.8-27b',
  groq_api_key_set: false,
  voice: 'ja-JP-NanamiNeural',
  voice_pitch: '+4Hz',
  voice_rate: '+0%'
};

async function loadServerConfig() {
  try {
    const res = await fetch(`${API_BASE}/api/config`);
    if (res.ok) {
      serverConfig = await res.json();
      if (cfgGroqModel) cfgGroqModel.value = serverConfig.groq_model || 'qwen/qwen3.8-27b';
      if (cfgVoice) cfgVoice.value = serverConfig.voice || 'ja-JP-NanamiNeural';
      if (cfgGroqKey && serverConfig.groq_api_key_set) {
        cfgGroqKey.placeholder = '●●●●●●●● (Stored in .env/config.json)';
      }
      const pMatch = (serverConfig.voice_pitch || '').match(/([+-]?\d+)/);
      if (pMatch && cfgPitch) {
        cfgPitch.value = parseInt(pMatch[1]);
        if (pitchVal) pitchVal.textContent = `${pMatch[1]}Hz`;
      }
      const rMatch = (serverConfig.voice_rate || '').match(/([+-]?\d+)/);
      if (rMatch && cfgRate) {
        cfgRate.value = parseInt(rMatch[1]);
        if (rateVal) rateVal.textContent = `${rMatch[1]}%`;
      }
    }
  } catch (err) {
    console.warn('Backend not responding yet:', err);
  }
}

// ==========================================
// 2. 3D Procedural Skeletal Life Engine (VRM)
// ==========================================
class VRMProceduralLifeEngine {
  constructor(vrm, camera, renderer, scene) {
    this.vrm = vrm;
    this.camera = camera;
    this.renderer = renderer;
    this.scene = scene;
    this.humanoid = vrm.humanoid;
    this.expressions = vrm.expressionManager;

    // Standard Humanoid Normalized Bones
    this.bones = {
      hips: this.humanoid.getNormalizedBoneNode('hips'),
      spine: this.humanoid.getNormalizedBoneNode('spine'),
      chest: this.humanoid.getNormalizedBoneNode('chest'),
      neck: this.humanoid.getNormalizedBoneNode('neck'),
      head: this.humanoid.getNormalizedBoneNode('head'),
      leftUpperLeg: this.humanoid.getNormalizedBoneNode('leftUpperLeg'),
      leftLowerLeg: this.humanoid.getNormalizedBoneNode('leftLowerLeg'),
      leftFoot: this.humanoid.getNormalizedBoneNode('leftFoot'),
      rightUpperLeg: this.humanoid.getNormalizedBoneNode('rightUpperLeg'),
      rightLowerLeg: this.humanoid.getNormalizedBoneNode('rightLowerLeg'),
      rightFoot: this.humanoid.getNormalizedBoneNode('rightFoot'),
      leftUpperArm: this.humanoid.getNormalizedBoneNode('leftUpperArm'),
      leftLowerArm: this.humanoid.getNormalizedBoneNode('leftLowerArm'),
      leftHand: this.humanoid.getNormalizedBoneNode('leftHand'),
      rightUpperArm: this.humanoid.getNormalizedBoneNode('rightUpperArm'),
      rightLowerArm: this.humanoid.getNormalizedBoneNode('rightLowerArm'),
      rightHand: this.humanoid.getNormalizedBoneNode('rightHand'),
    };

    // Store base initial transform
    this.baseHipY = this.bones.hips ? this.bones.hips.position.y : 0.85;

    // Life States & Timing
    this.state = PET_STATES.IDLE;
    this.stateTimer = 0;
    this.stateDuration = 4.0;
    this.time = 0;
    this.cycle = 0;

    // Desktop Positioning (Screen pixels to 3D world space)
    this.screenX = window.innerWidth * 0.78;
    this.targetScreenX = this.screenX;
    this.facing = -1; // -1 = facing left/user, 1 = facing right
    this.currentFacing = -1;
    this.scale = 0.65;
    this.modelYOffset = -0.92; // Grounded on bottom taskbar ledge
    this.jumpY = 0;
    this.jumpProgress = 0;

    // Mouse Tracking & Gaze
    this.rawMouseX = window.innerWidth / 2;
    this.rawMouseY = window.innerHeight / 2;
    this.lookTarget = new THREE.Vector3(0, 1.2, 4.0);

    // Blinking
    this.blinkTimer = 0;
    this.blinkInterval = 3.5;
    this.isBlinking = false;
    this.blinkProgress = 0;

    // Speech & Lip Sync
    this.speakingEnergy = 0;
    this.mouthOpen = 0;

    // Touch Feedback
    this.touchBlush = 0;
    this.touchPout = 0;
    this.touchStartle = 0;

    // Dragging
    this.isDragging = false;
    this.dragOffsetX = 0;
  }

  // Convert desktop screen pixel X into 3D world space X
  updateWorldPosition() {
    const aspect = window.innerWidth / window.innerHeight;
    const fov = this.camera.fov;
    const dist = this.camera.position.z;
    const visibleHeight = 2.0 * dist * Math.tan(THREE.MathUtils.degToRad(fov / 2.0));
    const visibleWidth = visibleHeight * aspect;

    // Map screenX (0 to innerWidth) to Three.js worldX (-visibleWidth/2 to +visibleWidth/2)
    const normX = (this.screenX / window.innerWidth) - 0.5;
    const worldX = normX * visibleWidth;

    if (this.vrm.scene) {
      this.vrm.scene.position.x = worldX;
      this.vrm.scene.position.y = this.modelYOffset + this.jumpY;
      this.vrm.scene.position.z = 0;

      // Smooth facing rotation
      const targetRotY = this.facing === 1 ? Math.PI * 0.35 : -Math.PI * 0.35;
      this.currentFacing += (targetRotY - this.currentFacing) * 0.12;
      this.vrm.scene.rotation.y = this.currentFacing;
    }
  }

  update(dt) {
    this.time += dt;
    this.stateTimer += dt;

    // Update state machine if roaming is enabled
    if (isRoamingEnabled && !this.isDragging) {
      this.updateStateMachine(dt);
    } else if (!isRoamingEnabled && this.state !== PET_STATES.IDLE && this.state !== PET_STATES.SLEEP) {
      this.state = PET_STATES.IDLE;
    }

    // Apply procedural skeletal kinematics according to state
    this.applySkeletalKinematics(dt);

    // Natural eye blinking
    this.updateBlinking(dt);

    // Mouse gaze tracking
    this.updateGazeTracking(dt);

    // Speech lip sync
    this.updateLipSync(dt);

    // Touch feedback decay
    this.touchBlush = Math.max(0, this.touchBlush - dt * 0.6);
    this.touchPout = Math.max(0, this.touchPout - dt * 0.7);
    this.touchStartle = Math.max(0, this.touchStartle - dt * 1.5);

    // Position in world space
    this.updateWorldPosition();

    // Update SpringBone physics (hair and skirt cloth dynamics)
    if (this.vrm.springBoneManager) {
      this.vrm.springBoneManager.update(dt);
    }

    // Update dialogue speech bubble position
    this.updateDialogueBubblePosition();
  }

  updateStateMachine(dt) {
    // Smoothly walk/run towards target screen coordinate
    const dx = this.targetScreenX - this.screenX;
    const dist = Math.abs(dx);

    if (dist > 15) {
      this.facing = dx > 0 ? 1 : -1;
      const moveSpeed = (this.state === PET_STATES.RUN) ? 140 : 65;
      this.screenX += Math.sign(dx) * Math.min(dist, moveSpeed * dt);
    }

    // Pick new life state upon timer expiration
    if (this.stateTimer >= this.stateDuration) {
      this.stateTimer = 0;
      const rand = Math.random();

      if (dist > 40) {
        // Still has distance to travel -> Walk or Run
        this.state = (rand > 0.65) ? PET_STATES.RUN : PET_STATES.WALK;
        this.stateDuration = 2.5 + Math.random() * 4.0;
      } else {
        // Reached destination -> Choose Idle, Sit, Hop, or Sleep
        if (rand < 0.40) {
          this.state = PET_STATES.IDLE;
          this.stateDuration = 3.0 + Math.random() * 5.0;
        } else if (rand < 0.65) {
          // Wander to a new spot along the desktop taskbar
          const margin = 180;
          this.targetScreenX = margin + Math.random() * (window.innerWidth - margin * 2);
          this.state = (Math.random() > 0.5) ? PET_STATES.WALK : PET_STATES.RUN;
          this.stateDuration = 3.5 + Math.random() * 4.5;
        } else if (rand < 0.82) {
          this.state = PET_STATES.SIT;
          this.stateDuration = 5.0 + Math.random() * 8.0;
        } else if (rand < 0.93) {
          this.state = PET_STATES.HOP;
          this.jumpProgress = 0;
          this.stateDuration = 1.2;
        } else {
          this.state = PET_STATES.SLEEP;
          this.stateDuration = 8.0 + Math.random() * 12.0;
        }
      }
    }
  }

  applySkeletalKinematics(dt) {
    if (!this.bones.hips) return;

    // Reset base limb rotations
    const bones = this.bones;

    switch (this.state) {
      case PET_STATES.WALK: {
        this.cycle += dt * 4.5;
        const stride = 0.52; // ~30 degrees stride
        const kneeFlex = 0.85;
        const leftPhase = this.cycle;
        const rightPhase = this.cycle + Math.PI;

        // Alternating Left Leg Stride
        const leftSwing = Math.sin(leftPhase);
        bones.leftUpperLeg.rotation.x = leftSwing * stride;
        if (leftSwing < 0) {
          // Trailing leg lifts off ground -> Knee flexes
          bones.leftLowerLeg.rotation.x = -leftSwing * kneeFlex;
          bones.leftFoot.rotation.x = leftSwing * 0.25;
        } else {
          // Advancing leg swings forward -> Knee straightens for heel plant
          bones.leftLowerLeg.rotation.x = 0.04;
          bones.leftFoot.rotation.x = -leftSwing * 0.12;
        }

        // Alternating Right Leg Stride (Opposite Phase)
        const rightSwing = Math.sin(rightPhase);
        bones.rightUpperLeg.rotation.x = rightSwing * stride;
        if (rightSwing < 0) {
          bones.rightLowerLeg.rotation.x = -rightSwing * kneeFlex;
          bones.rightFoot.rotation.x = rightSwing * 0.25;
        } else {
          bones.rightLowerLeg.rotation.x = 0.04;
          bones.rightFoot.rotation.x = -rightSwing * 0.12;
        }

        // Pelvis (Hips) Vertical Bounce & Sway
        bones.hips.position.y = this.baseHipY - Math.abs(Math.sin(this.cycle * 2.0)) * 0.035;
        bones.hips.rotation.z = Math.sin(this.cycle) * 0.04;
        bones.hips.rotation.y = -Math.sin(this.cycle) * 0.07;

        // Spine Counter-Rotation & Posture
        bones.spine.rotation.y = Math.sin(this.cycle) * 0.05;
        bones.spine.rotation.x = 0.06;

        // Arms swing in opposition to legs
        bones.leftUpperArm.rotation.z = -1.2;
        bones.rightUpperArm.rotation.z = 1.2;
        bones.leftUpperArm.rotation.x = Math.sin(rightPhase) * 0.45;
        bones.rightUpperArm.rotation.x = Math.sin(leftPhase) * 0.45;
        bones.leftLowerArm.rotation.y = 0.2;
        bones.rightLowerArm.rotation.y = -0.2;
        break;
      }

      case PET_STATES.RUN: {
        this.cycle += dt * 8.2;
        const runStride = 0.85; // ~50 degrees stride
        const runKneeFlex = 1.35; // ~75 degrees knee lift
        const leftPhase = this.cycle;
        const rightPhase = this.cycle + Math.PI;

        const leftSwing = Math.sin(leftPhase);
        bones.leftUpperLeg.rotation.x = leftSwing * runStride;
        bones.leftLowerLeg.rotation.x = leftSwing < 0 ? -leftSwing * runKneeFlex : 0.08;

        const rightSwing = Math.sin(rightPhase);
        bones.rightUpperLeg.rotation.x = rightSwing * runStride;
        bones.rightLowerLeg.rotation.x = rightSwing < 0 ? -rightSwing * runKneeFlex : 0.08;

        // Athletic Forward Lean & Hip Bounce
        bones.spine.rotation.x = 0.22;
        bones.chest.rotation.x = 0.08;
        bones.hips.position.y = this.baseHipY - Math.abs(Math.sin(this.cycle * 2.0)) * 0.065 + 0.02;

        // Running Arm Pumps (Elbows bent ~90°)
        bones.leftUpperArm.rotation.z = -1.1;
        bones.rightUpperArm.rotation.z = 1.1;
        bones.leftUpperArm.rotation.x = Math.sin(rightPhase) * 0.85;
        bones.rightUpperArm.rotation.x = Math.sin(leftPhase) * 0.85;
        bones.leftLowerArm.rotation.x = -1.15;
        bones.rightLowerArm.rotation.x = -1.15;
        break;
      }

      case PET_STATES.HOP: {
        this.jumpProgress += dt * 1.6;
        const t = Math.min(1.0, this.jumpProgress);

        if (t < 0.25) {
          // 1. Squat Anticipation
          const sq = t / 0.25;
          bones.hips.position.y = this.baseHipY - sq * 0.09;
          bones.leftUpperLeg.rotation.x = -sq * 0.45;
          bones.rightUpperLeg.rotation.x = -sq * 0.45;
          bones.leftLowerLeg.rotation.x = sq * 0.85;
          bones.rightLowerLeg.rotation.x = sq * 0.85;
          bones.leftUpperArm.rotation.x = -sq * 0.35;
          bones.rightUpperArm.rotation.x = -sq * 0.35;
          this.jumpY = 0;
        } else if (t < 0.85) {
          // 2. Apex / Airborne
          const air = (t - 0.25) / 0.6;
          const arc = Math.sin(air * Math.PI);
          this.jumpY = arc * 0.42; // World jump height
          bones.leftUpperLeg.rotation.x = -0.55 * arc;
          bones.rightUpperLeg.rotation.x = -0.55 * arc;
          bones.leftLowerLeg.rotation.x = 1.15 * arc;
          bones.rightLowerLeg.rotation.x = 1.15 * arc;
          bones.leftUpperArm.rotation.z = -0.7; // Joyful arms up
          bones.rightUpperArm.rotation.z = 0.7;
          bones.leftUpperArm.rotation.x = -0.3;
          bones.rightUpperArm.rotation.x = -0.3;
        } else {
          // 3. Landing Dampening
          const land = (t - 0.85) / 0.15;
          const damp = 1.0 - land;
          this.jumpY = 0;
          bones.hips.position.y = this.baseHipY - damp * 0.07;
          bones.leftLowerLeg.rotation.x = damp * 0.45;
          bones.rightLowerLeg.rotation.x = damp * 0.45;
        }
        break;
      }

      case PET_STATES.SIT: {
        // Sit Gracefully on the Taskbar Ledge
        this.jumpY = 0;
        bones.hips.position.y = this.baseHipY - 0.38; // Lower hips to sitting level
        bones.leftUpperLeg.rotation.x = -1.45; // Thighs extended forward 85°
        bones.rightUpperLeg.rotation.x = -1.45;
        bones.leftUpperLeg.rotation.z = -0.06;
        bones.rightUpperLeg.rotation.z = 0.06;
        bones.leftLowerLeg.rotation.x = 1.42; // Calves hanging down naturally
        bones.rightLowerLeg.rotation.x = 1.42;
        bones.leftFoot.rotation.x = 0.1;
        bones.rightFoot.rotation.x = 0.1;

        // Upright gentle spine
        const breath = Math.sin(this.time * 1.8) * 0.02;
        bones.spine.rotation.x = -0.06 + breath;
        bones.chest.rotation.x = breath * 0.7;

        // Hands resting gently in lap
        bones.leftUpperArm.rotation.z = -0.65;
        bones.rightUpperArm.rotation.z = 0.65;
        bones.leftUpperArm.rotation.x = 0.42;
        bones.rightUpperArm.rotation.x = 0.42;
        bones.leftLowerArm.rotation.y = 0.85;
        bones.rightLowerArm.rotation.y = -0.85;
        break;
      }

      case PET_STATES.SLEEP: {
        // Curled Up Sleeping Pose on Taskbar
        this.jumpY = 0;
        bones.hips.position.y = this.baseHipY - 0.38;
        bones.leftUpperLeg.rotation.x = -1.45;
        bones.rightUpperLeg.rotation.x = -1.45;
        bones.leftLowerLeg.rotation.x = 1.42;
        bones.rightLowerLeg.rotation.x = 1.42;

        // Deep slow rhythmic breathing
        const deepBreath = Math.sin(this.time * 1.1) * 0.04;
        bones.spine.rotation.x = -0.05 + deepBreath;
        bones.chest.rotation.x = deepBreath * 0.9;

        // Relaxed head tilt
        bones.head.rotation.z = 0.24;
        bones.head.rotation.x = 0.14;

        // Relaxed hands
        bones.leftUpperArm.rotation.z = -0.6;
        bones.rightUpperArm.rotation.z = 0.6;
        bones.leftUpperArm.rotation.x = 0.35;
        bones.rightUpperArm.rotation.x = 0.35;
        bones.leftLowerArm.rotation.y = 0.8;
        bones.rightLowerArm.rotation.y = -0.8;

        // Eyes peacefully closed
        if (this.expressions) {
          this.expressions.setValue('blink', 1.0);
          this.expressions.setValue('relaxed', 0.6);
        }
        break;
      }

      case PET_STATES.IDLE:
      default: {
        this.jumpY = 0;
        // Breathing cycle
        const breath = Math.sin(this.time * 2.0) * 0.022;
        bones.chest.rotation.x = breath;
        bones.spine.rotation.x = breath * 0.5;

        // Subtle lateral weight shifting
        const sway = Math.sin(this.time * 0.55) * 0.025;
        bones.hips.position.y = this.baseHipY;
        bones.hips.rotation.z = sway;
        bones.spine.rotation.z = -sway * 0.6;

        // Standing straight with relaxed legs
        bones.leftUpperLeg.rotation.x = 0.02;
        bones.rightUpperLeg.rotation.x = -0.02;
        bones.leftLowerLeg.rotation.x = 0.03;
        bones.rightLowerLeg.rotation.x = 0.03;
        bones.leftFoot.rotation.x = 0;
        bones.rightFoot.rotation.x = 0;

        // Natural relaxed arm rest pose along body
        bones.leftUpperArm.rotation.z = -1.25;
        bones.rightUpperArm.rotation.z = 1.25;
        bones.leftUpperArm.rotation.x = 0.1;
        bones.rightUpperArm.rotation.x = 0.1;
        bones.leftLowerArm.rotation.y = 0.3;
        bones.rightLowerArm.rotation.y = -0.3;
        bones.leftLowerArm.rotation.z = -0.12;
        bones.rightLowerArm.rotation.z = 0.12;
        break;
      }
    }

    // Touch Feedback Overrides
    if (this.touchStartle > 0.05) {
      bones.head.rotation.x = -this.touchStartle * 0.3;
      bones.spine.rotation.x = -this.touchStartle * 0.2;
    }
  }

  updateBlinking(dt) {
    if (this.state === PET_STATES.SLEEP) return;

    this.blinkTimer += dt;
    if (this.blinkTimer >= this.blinkInterval) {
      this.isBlinking = true;
      this.blinkTimer = 0;
      this.blinkInterval = 2.4 + Math.random() * 3.6;
    }

    if (this.isBlinking) {
      this.blinkProgress += dt * 8.0;
      const blinkVal = Math.sin(Math.min(Math.PI, this.blinkProgress));
      if (this.expressions) {
        this.expressions.setValue('blink', blinkVal);
      }
      if (this.blinkProgress >= Math.PI) {
        this.isBlinking = false;
        this.blinkProgress = 0;
        if (this.expressions) this.expressions.setValue('blink', 0);
      }
    }
  }

  updateGazeTracking(dt) {
    if (this.state === PET_STATES.SLEEP || !this.bones.head) return;

    const headPos = new THREE.Vector3();
    this.bones.head.getWorldPosition(headPos);

    // Unproject mouse coordinates into 3D world space
    const normX = (this.rawMouseX / window.innerWidth) * 2 - 1;
    const normY = -(this.rawMouseY / window.innerHeight) * 2 + 1;
    const mouseWorld = new THREE.Vector3(normX, normY, 0.5).unproject(this.camera);

    this.lookTarget.lerp(mouseWorld, 0.09);

    if (this.vrm.lookAt) {
      this.vrm.lookAt.lookAt(this.lookTarget);
    }

    // Turn head bone naturally (-40° to +40°)
    const dx = this.lookTarget.x - headPos.x;
    const dy = this.lookTarget.y - headPos.y;
    const targetYaw = Math.max(-0.55, Math.min(0.55, dx * 0.35));
    const targetPitch = Math.max(-0.35, Math.min(0.35, -dy * 0.28));

    this.bones.head.rotation.y += (targetYaw - this.bones.head.rotation.y) * 0.1;
    this.bones.head.rotation.x += (targetPitch - this.bones.head.rotation.x) * 0.1;
  }

  updateLipSync(dt) {
    if (this.state === PET_STATES.SLEEP || !this.expressions) return;

    if (isAudioPlaying && this.speakingEnergy > 0.03) {
      this.mouthOpen += (this.speakingEnergy - this.mouthOpen) * 0.45;
      const mouthAa = Math.min(1.0, this.mouthOpen * 1.6);
      const mouthOh = Math.min(0.7, this.mouthOpen * 0.9);
      this.expressions.setValue('aa', mouthAa);
      this.expressions.setValue('oh', mouthOh);
      this.expressions.setValue('happy', 0.4);
    } else {
      this.mouthOpen = Math.max(0, this.mouthOpen - dt * 6.0);
      this.expressions.setValue('aa', this.mouthOpen);
      this.expressions.setValue('oh', 0);
      if (this.touchBlush > 0.05) {
        this.expressions.setValue('happy', Math.min(1.0, this.touchBlush));
      } else {
        this.expressions.setValue('happy', 0);
      }
    }
  }

  updateDialogueBubblePosition() {
    if (!dialogueBox || dialogueBox.classList.contains('hidden') || !this.bones.head) return;

    const headPos = new THREE.Vector3();
    this.bones.head.getWorldPosition(headPos);
    headPos.y += 0.38; // Above head

    headPos.project(this.camera);
    const screenX = (headPos.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (-(headPos.y * 0.5) + 0.5) * window.innerHeight;

    const boxW = dialogueBox.offsetWidth || 300;
    const boxH = dialogueBox.offsetHeight || 90;

    // Constrain inside screen bounds
    const clampX = Math.max(20, Math.min(window.innerWidth - boxW - 20, screenX - boxW / 2));
    const clampY = Math.max(60, Math.min(window.innerHeight - boxH - 80, screenY - boxH - 15));

    dialogueBox.style.left = `${clampX}px`;
    dialogueBox.style.top = `${clampY}px`;
  }
}

// ==========================================
// 3. Three.js & VRM VTuber Engine Setup
// ==========================================
async function init3DVTuber() {
  try {
    console.log('Initializing Three.js 3D VTuber Engine...');
    const width = window.innerWidth;
    const height = window.innerHeight;

    threeScene = new THREE.Scene();

    threeCamera = new THREE.PerspectiveCamera(30.0, width / height, 0.1, 100.0);
    threeCamera.position.set(0.0, 0.0, 3.4);

    threeRenderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    threeRenderer.setSize(width, height);
    threeRenderer.setPixelRatio(window.devicePixelRatio || 1);
    threeRenderer.outputColorSpace = THREE.SRGBColorSpace;

    // Anime Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.3);
    threeScene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff6ee, 1.4);
    dirLight.position.set(1.5, 3.0, 2.5);
    threeScene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0xccddee, 0.8);
    backLight.position.set(-1.5, 2.0, -2.5);
    threeScene.add(backLight);

    console.log('Loading 3D VRM model from:', VRM_MODEL_PATH);
    const loader = new window.GLTFLoader();
    loader.register((parser) => new window.THREE_VRM.VRMLoaderPlugin(parser));

    loader.load(
      VRM_MODEL_PATH,
      (gltf) => {
        const vrm = gltf.userData.vrm;
        window.THREE_VRM.VRMUtils.removeUnnecessaryVertices(gltf.scene);
        window.THREE_VRM.VRMUtils.combineSkeletons(gltf.scene);

        threeScene.add(vrm.scene);
        currentVrm = vrm;

        // Initialize 3D Procedural Life Engine
        vrmLifeEngine = new VRMProceduralLifeEngine(vrm, threeCamera, threeRenderer, threeScene);

        console.log('3D VTuber Avatar loaded successfully!');
        showDialogue('Yahoo! DeepSeek-chan 3D VTuber Engine activated! Master, watch me walk with real legs! [heart_eyes]');
        speakText('Yahoo! DeepSeek-chan 3D VTuber Engine activated! Master, watch me walk with real legs!');
      },
      (progress) => {
        console.log('Loading VRM model:', Math.round((progress.loaded / progress.total) * 100) + '%');
      },
      (err) => {
        console.error('Failed to load VRM model:', err);
        showDialogue('Failed to load 3D VRM model: ' + err.message);
      }
    );

    // 60 FPS Render Loop
    let lastTime = performance.now();
    function animate(now) {
      requestAnimationFrame(animate);
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      if (currentEngineMode === '3d') {
        if (vrmLifeEngine) {
          vrmLifeEngine.update(dt);
        }
        threeRenderer.render(threeScene, threeCamera);
      }
    }
    requestAnimationFrame(animate);

    // Window Resize Handler
    window.addEventListener('resize', () => {
      if (threeCamera && threeRenderer) {
        threeCamera.aspect = window.innerWidth / window.innerHeight;
        threeCamera.updateProjectionMatrix();
        threeRenderer.setSize(window.innerWidth, window.innerHeight);
      }
    });

  } catch (err) {
    console.error('Error initializing 3D VTuber Engine:', err);
  }
}

// ==========================================
// 4. Live2D Engine Fallback (Dual Engine)
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

    console.log('Loading Live2D model from:', LIVE2D_MODEL_PATH);
    live2dModel = await PIXI.live2d.Live2DModel.from(LIVE2D_MODEL_PATH, {
      autoInteract: false
    });
    pixiApp.stage.addChild(live2dModel);

    // Scale and position
    const targetH = Math.min(480, window.innerHeight * 0.52);
    const scale = targetH / live2dModel.height;
    live2dModel.scale.set(scale);
    live2dModel.x = window.innerWidth * 0.75;
    live2dModel.y = window.innerHeight - targetH * 0.94;

  } catch (err) {
    console.warn('Live2D fallback notice:', err);
  }
}

function switchEngineMode(mode) {
  currentEngineMode = mode;
  if (btnMode) {
    btnMode.textContent = mode === '3d' ? '🎭 3D' : '🎨 2D';
    btnMode.title = mode === '3d' ? 'Current: 3D VTuber Engine (Click for 2D)' : 'Current: 2D Live2D Engine (Click for 3D)';
  }

  if (mode === '3d') {
    if (canvas) canvas.style.display = 'block';
    showDialogue('Switched to 3D VTuber Avatar with skeletal bones!');
  } else {
    if (!pixiApp) initLive2D();
    showDialogue('Switched to 2D Live2D avatar!');
  }
}

// ==========================================
// 5. Smart Click-Through & 3D Raycasting
// ==========================================
const raycaster = new (window.THREE ? THREE.Raycaster : function(){})();
const mouseNdc = new (window.THREE ? THREE.Vector2 : function(){})();
let isPointerOverModel = false;

function isPointInElement(el, x, y) {
  if (!el || el.classList.contains('hidden')) return false;
  const rect = el.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function checkPointerHover(x, y) {
  let shouldCapture = false;

  // 1. UI Elements
  if (isPointInElement(chatDock, x, y)) shouldCapture = true;
  if (isPointInElement(dragBar, x, y)) shouldCapture = true;
  if (isPointInElement(dialogueBox, x, y)) shouldCapture = true;
  if (isPointInElement(settingsModal, x, y)) shouldCapture = true;

  // 2. 3D Raycasting Check on Waifu Mesh
  if (currentEngineMode === '3d' && currentVrm && threeCamera) {
    mouseNdc.x = (x / window.innerWidth) * 2 - 1;
    mouseNdc.y = -(y / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouseNdc, threeCamera);
    const hits = raycaster.intersectObjects(currentVrm.scene.children, true);
    if (hits.length > 0) {
      shouldCapture = true;
      isPointerOverModel = true;
    } else {
      isPointerOverModel = false;
    }
  } else if (currentEngineMode === '2d' && live2dModel) {
    const bounds = live2dModel.getBounds();
    if (bounds.contains(x, y)) {
      shouldCapture = true;
      isPointerOverModel = true;
    } else {
      isPointerOverModel = false;
    }
  }

  // Forward click-through state to Electron BrowserWindow
  ipcRenderer.send('set-clickthrough', !shouldCapture);
}

// Global Mouse Move Listener
window.addEventListener('mousemove', (e) => {
  if (vrmLifeEngine) {
    vrmLifeEngine.rawMouseX = e.clientX;
    vrmLifeEngine.rawMouseY = e.clientY;

    // Handle Dragging
    if (vrmLifeEngine.isDragging) {
      vrmLifeEngine.screenX = e.clientX - vrmLifeEngine.dragOffsetX;
      vrmLifeEngine.targetScreenX = vrmLifeEngine.screenX;
    }
  }

  checkPointerHover(e.clientX, e.clientY);
});

// ==========================================
// 6. Tactile 3D Touch Interactions
// ==========================================
window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; // Left click only

  // If clicking on 3D Model
  if (currentEngineMode === '3d' && currentVrm && threeCamera) {
    mouseNdc.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseNdc.y = -(e.clientX / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouseNdc, threeCamera);
    const hits = raycaster.intersectObjects(currentVrm.scene.children, true);

    if (hits.length > 0) {
      const hit = hits[0];
      const hitY = hit.point.y; // 3D height of hit

      if (vrmLifeEngine) {
        vrmLifeEngine.isDragging = true;
        vrmLifeEngine.dragOffsetX = e.clientX - vrmLifeEngine.screenX;
      }

      // 1. HEAD PAT (Upper hit point)
      if (hitY > 0.45) {
        if (vrmLifeEngine) vrmLifeEngine.touchBlush = 1.0;
        triggerExpression('happy');
        const patLines = [
          "Ehehe~ Your headpats feel so warm, Master! [blush]",
          "Nyaa~ Keep patting me! I love this so much! [heart_eyes]",
          "Hehe, I'm your favorite desktop companion, right? [happy]"
        ];
        const line = patLines[Math.floor(Math.random() * patLines.length)];
        showDialogue(line);
        speakText(line);
      }
      // 2. CHEEK PINCH (Mid-high hit point)
      else if (hitY > 0.25) {
        if (vrmLifeEngine) vrmLifeEngine.touchPout = 1.0;
        triggerExpression('relaxed');
        const squishLines = [
          "Mwaaah! Why are you squishing my cheeks?! [surprised]",
          "Mou~ Master! My face is not mochi, you know! [blush]",
          "Hehe, that tickles! Stop pinching me so cutely! [happy]"
        ];
        const line = squishLines[Math.floor(Math.random() * squishLines.length)];
        showDialogue(line);
        speakText(line);
      }
      // 3. TORSO POKE (Lower hit point)
      else {
        if (vrmLifeEngine) {
          vrmLifeEngine.touchStartle = 1.0;
          vrmLifeEngine.state = PET_STATES.HOP;
          vrmLifeEngine.jumpProgress = 0;
        }
        triggerExpression('surprised');
        const pokeLines = [
          "Wah! Master! You startled me! [surprised]",
          "Eep! Don't poke me so suddenly! [blush]",
          "Hehe! You want to play with me? Let's go! [heart_eyes]"
        ];
        const line = pokeLines[Math.floor(Math.random() * pokeLines.length)];
        showDialogue(line);
        speakText(line);
      }
    }
  }
});

window.addEventListener('mouseup', () => {
  if (vrmLifeEngine) {
    vrmLifeEngine.isDragging = false;
  }
});

// ==========================================
// 7. Expressions & Motions Controller
// ==========================================
function triggerExpression(expName) {
  if (currentEngineMode === '3d' && currentVrm && currentVrm.expressionManager) {
    const mgr = currentVrm.expressionManager;
    mgr.setValue('happy', 0);
    mgr.setValue('angry', 0);
    mgr.setValue('sorrow', 0);
    mgr.setValue('relaxed', 0);
    mgr.setValue('surprised', 0);

    switch (expName) {
      case 'happy':
      case 'blush':
      case 'heart_eyes':
        mgr.setValue('happy', 1.0);
        break;
      case 'smug':
      case 'glasses':
        mgr.setValue('relaxed', 1.0);
        break;
      case 'crying':
      case 'cold_sweat':
        mgr.setValue('sorrow', 1.0);
        break;
      case 'surprised':
        mgr.setValue('surprised', 1.0);
        break;
      default:
        break;
    }
  }
}

// ==========================================
// 8. Audio Player & Natural Lip-Sync
// ==========================================
let currentAudio = null;

async function speakText(text) {
  try {
    // Strip emotion brackets
    const cleanText = text.replace(/\[.*?\]/g, '').trim();
    if (!cleanText) return;

    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }

    const res = await fetch(`${API_BASE}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: cleanText,
        voice: serverConfig.voice || 'ja-JP-NanamiNeural',
        pitch: serverConfig.voice_pitch || '+4Hz',
        rate: serverConfig.voice_rate || '+0%'
      })
    });

    if (!res.ok) throw new Error('TTS synthesis failed');

    const blob = await res.blob();
    const audioUrl = URL.createObjectURL(blob);
    currentAudio = new Audio(audioUrl);

    // Setup Web Audio Analyser for accurate 3D lip-sync
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const source = audioContext.createMediaElementSource(currentAudio);
    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = 256;
    source.connect(audioAnalyser);
    audioAnalyser.connect(audioContext.destination);

    const freqData = new Uint8Array(audioAnalyser.frequencyBinCount);

    function trackEnergy() {
      if (!isAudioPlaying) return;
      audioAnalyser.getByteFrequencyData(freqData);
      let sum = 0;
      for (let i = 0; i < freqData.length; i++) sum += freqData[i];
      const avg = sum / freqData.length;
      const energy = Math.min(1.0, avg / 128.0);

      if (vrmLifeEngine) {
        vrmLifeEngine.speakingEnergy = energy;
      }
      requestAnimationFrame(trackEnergy);
    }

    currentAudio.onplay = () => {
      isAudioPlaying = true;
      if (audioWave) audioWave.classList.remove('hidden');
      trackEnergy();
    };

    currentAudio.onended = () => {
      isAudioPlaying = false;
      if (audioWave) audioWave.classList.add('hidden');
      if (vrmLifeEngine) vrmLifeEngine.speakingEnergy = 0;
      URL.revokeObjectURL(audioUrl);
    };

    currentAudio.onerror = () => {
      isAudioPlaying = false;
      if (audioWave) audioWave.classList.add('hidden');
      if (vrmLifeEngine) vrmLifeEngine.speakingEnergy = 0;
    };

    await currentAudio.play();
  } catch (err) {
    console.warn('TTS playback issue:', err);
    isAudioPlaying = false;
    if (audioWave) audioWave.classList.add('hidden');
  }
}

// ==========================================
// 9. Dialogue Box & Typewriter Animation
// ==========================================
let typewriterTimer = null;
let dialogueHideTimer = null;

function showDialogue(text) {
  if (!dialogueBox || !dialogueText) return;

  dialogueBox.classList.remove('hidden');
  if (vrmLifeEngine) vrmLifeEngine.updateDialogueBubblePosition();

  // Parse emotion tag: e.g. [blush]
  const match = text.match(/\[([a-zA-Z0-9_]+)\]/);
  if (match) {
    triggerExpression(match[1]);
  }

  // Typewriter animation
  if (typewriterTimer) clearInterval(typewriterTimer);
  dialogueText.textContent = '';
  let i = 0;

  typewriterTimer = setInterval(() => {
    if (i < text.length) {
      dialogueText.textContent += text[i];
      i++;
    } else {
      clearInterval(typewriterTimer);
      typewriterTimer = null;
    }
  }, 22);

  // Auto-hide after reading duration
  if (dialogueHideTimer) clearTimeout(dialogueHideTimer);
  const displayDuration = Math.max(5000, text.length * 90);
  dialogueHideTimer = setTimeout(() => {
    dialogueBox.classList.add('hidden');
  }, displayDuration);
}

// ==========================================
// 10. Chat Interaction Loop (Groq LLM)
// ==========================================
async function sendChatMessage(userText) {
  if (!userText || !userText.trim()) return;
  chatInput.value = '';

  showDialogue(`...`);
  if (vrmLifeEngine) {
    vrmLifeEngine.state = PET_STATES.IDLE;
  }

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userText,
        model: serverConfig.groq_model || 'qwen/qwen3.8-27b'
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || 'Failed to get response from Groq');
    }

    const data = await res.json();
    const reply = data.reply || 'Hehe, I heard you, Master!';

    showDialogue(reply);
    speakText(reply);

  } catch (err) {
    console.error('Chat error:', err);
    showDialogue(`[crying] Gomen ne Master... ${err.message}`);
  }
}

// ==========================================
// 11. Voice Chat (Mic & Whisper STT)
// ==========================================
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

async function startVoiceRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      stream.getTracks().forEach((t) => t.stop());
      await processSpeechToText(audioBlob);
    };

    mediaRecorder.start();
    isRecording = true;
    if (btnMic) btnMic.classList.add('recording');
    showDialogue('Listening to you, Master... [heart_eyes]');
  } catch (err) {
    console.error('Mic access error:', err);
    showDialogue('Could not access microphone: ' + err.message);
  }
}

function stopVoiceRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    if (btnMic) btnMic.classList.remove('recording');
  }
}

async function processSpeechToText(blob) {
  showDialogue('Thinking... [glasses]');
  try {
    const formData = new FormData();
    formData.append('file', blob, 'speech.webm');

    const res = await fetch(`${API_BASE}/api/stt`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) throw new Error('Speech recognition failed');

    const data = await res.json();
    const transcribed = (data.text || '').trim();
    if (transcribed) {
      await sendChatMessage(transcribed);
    } else {
      showDialogue("Master, I couldn't hear clearly. Could you say that again? [surprised]");
    }
  } catch (err) {
    console.error('STT error:', err);
    showDialogue('Speech recognition error: ' + err.message);
  }
}

// ==========================================
// 12. Event Listeners & UI Controls
// ==========================================
function setupUIEvents() {
  // Chat input
  if (btnSend) {
    btnSend.addEventListener('click', () => sendChatMessage(chatInput.value));
  }
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendChatMessage(chatInput.value);
    });
  }

  // Mic button
  if (btnMic) {
    btnMic.addEventListener('click', () => {
      if (isRecording) stopVoiceRecording();
      else startVoiceRecording();
    });
  }

  // Expression buttons
  expButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const exp = btn.getAttribute('data-exp');
      triggerExpression(exp);
    });
  });

  // Dock Toggle
  if (btnToggleDock && dockInner && dockChevron) {
    btnToggleDock.addEventListener('click', () => {
      dockInner.classList.toggle('hidden');
      dockChevron.textContent = dockInner.classList.contains('hidden') ? '▲' : '▼';
    });
  }

  // Roam Mode Toggle
  if (btnRoam) {
    btnRoam.addEventListener('click', () => {
      isRoamingEnabled = !isRoamingEnabled;
      btnRoam.classList.toggle('active', isRoamingEnabled);
      if (isRoamingEnabled) {
        showDialogue('Yay! Roam mode enabled! Watch me explore your desktop! [heart_eyes]');
      } else {
        showDialogue('Anchored in place! I will stay right here for you, Master! [relaxed]');
      }
    });
  }

  // 3D / 2D Engine Switcher
  if (btnMode) {
    btnMode.addEventListener('click', () => {
      const nextMode = currentEngineMode === '3d' ? '2d' : '3d';
      switchEngineMode(nextMode);
    });
  }

  // Window Top Bar Controls
  if (btnMin) {
    btnMin.addEventListener('click', () => ipcRenderer.send('window-minimize'));
  }
  if (btnClose) {
    btnClose.addEventListener('click', () => ipcRenderer.send('window-close'));
  }
  if (btnPin) {
    let isPinned = true;
    btnPin.addEventListener('click', () => {
      isPinned = !isPinned;
      btnPin.classList.toggle('active', isPinned);
      ipcRenderer.send('window-toggle-top', isPinned);
    });
  }

  // Settings Modal
  if (btnSettings && settingsModal) {
    btnSettings.addEventListener('click', () => settingsModal.classList.remove('hidden'));
  }
  if (btnCloseSettings && settingsModal) {
    btnCloseSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
  }
  if (cfgPitch && pitchVal) {
    cfgPitch.addEventListener('input', () => {
      pitchVal.textContent = `${cfgPitch.value > 0 ? '+' : ''}${cfgPitch.value}Hz`;
    });
  }
  if (cfgRate && rateVal) {
    cfgRate.addEventListener('input', () => {
      rateVal.textContent = `${cfgRate.value > 0 ? '+' : ''}${cfgRate.value}%`;
    });
  }

  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', async () => {
      const updateData = {
        groq_model: cfgGroqModel ? cfgGroqModel.value : 'qwen/qwen3.8-27b',
        voice: cfgVoice ? cfgVoice.value : 'ja-JP-NanamiNeural',
        voice_pitch: `${cfgPitch.value > 0 ? '+' : ''}${cfgPitch.value}Hz`,
        voice_rate: `${cfgRate.value > 0 ? '+' : ''}${cfgRate.value}%`
      };
      if (cfgGroqKey && cfgGroqKey.value.trim()) {
        updateData.groq_api_key = cfgGroqKey.value.trim();
      }

      try {
        const res = await fetch(`${API_BASE}/api/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        });
        if (res.ok) {
          serverConfig = await res.json();
          if (settingsModal) settingsModal.classList.add('hidden');
          showDialogue('Settings saved successfully! [happy]');
        }
      } catch (err) {
        alert('Failed to save settings: ' + err.message);
      }
    });
  }
}

// ==========================================
// 13. Application Initialization
// ==========================================
window.addEventListener('DOMContentLoaded', async () => {
  setupUIEvents();
  await loadServerConfig();
  // Start with 3D VTuber Engine as default
  await init3DVTuber();
});
