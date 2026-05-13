const DEFAULT_QUIZ = {
  title: "바이브 코딩 용어 게임",
  correctScore: 100,
  roundAdvanceScore: 0,
  lifeBonusScore: 100,
  lives: 3,
  terms: [
  { term: "Vibe Coding", description: "자연언어 프로그래밍" },
  { term: "Git, GitHub", description: "파일의 변경 이력을 저장하고 관리하는 프로그램" },
  { term: "LLM", description: "다음 단어 만들기, 생성형AI" },
  { term: "컨텍스트 윈도우", description: "LLM이 한 번에 참고할 수 있는 대화와 자료의 범위" },
  { term: "플랜모드", description: "바이브코딩 처음 시작할 때 켜는 모드" },
  { term: "MCP, CLI", description: "LLM과 연결할 때 사용하는 방법" }
  ]
};

let quiz = { ...DEFAULT_QUIZ, terms: [...DEFAULT_QUIZ.terms] };

const BGM_TRACKS = [
  {
    value: "./sound/music/nakaradaalexander-fly-chicken-258462.mp3",
    label: "Fly Chicken"
  },
  {
    value: "./sound/music/backgroundmusicforvideos-roblox-minecraft-fortnite-video-game-music-358426.mp3",
    label: "Minecraft Style"
  },
  {
    value: "./sound/music/tatamusic-game-gaming-minecraft-background-music-377647.mp3",
    label: "Block Adventure"
  }
];

const VOICE_CORRECT_TRACKS = [
  "./sound/voice/nice1.mp3",
  "./sound/voice/nice2.mp3",
  "./sound/voice/nice3.mp3",
  "./sound/voice/nice4.mp3"
];
const VOICE_COMBO_TRACKS = [
  "./sound/voice/veryNice1.mp3",
  "./sound/voice/veryNice2.mp3",
  "./sound/voice/veryNice3.mp3",
  "./sound/voice/veryNice4.mp3"
];
const VOICE_WRONG_TRACKS = ["./sound/voice/notQuite.mp3", "./sound/voice/oops.mp3"];

const state = {
  running: false,
  paused: false,
  score: 0,
  lives: 3,
  roundIndex: 0,
  currentTermIndex: 0,
  termOrder: [...quiz.terms.keys()],
  cakes: [],
  playerX: 0.5,
  playerY: 0.74,
  lastFrame: 0,
  idleLastFrame: 0,
  idleDirection: 1,
  spawnTimer: 0,
  spawnDelay: 1050,
  roundSpawnCount: 0,
  minWrongBeforeCorrect: 2,
  roundHits: 0,
  correctHits: 0,
  combo: 0,
  misses: 0,
  nextCakeId: 1,
  forcedCorrectSpawned: false
};

const audio = {
  ctx: null,
  sfxMaster: null,
  enabled: false,
  effectsUnlocked: false,
  effectsUnlocking: null,
  bgm: new Audio(),
  fail: new Audio("./sound/sfx/floraphonic-brass-fail-8-a-207130.mp3"),
  failVoice: new Audio("./sound/voice/tryAgain.mp3"),
  win: new Audio("./sound/sfx/benkirb-fanfare-276819.mp3"),
  winVoice: new Audio("./sound/voice/congratulations.mp3"),
  voiceCorrect: VOICE_CORRECT_TRACKS.map((src) => new Audio(src)),
  voiceCombo: VOICE_COMBO_TRACKS.map((src) => new Audio(src)),
  voiceWrong: VOICE_WRONG_TRACKS.map((src) => new Audio(src)),
  voiceCorrectIndex: 0,
  voiceComboIndex: 0,
  bgmEnabled: false,
  bgmDuckActive: false,
  bgmFadeFrameId: 0,
  bgmVolume: 0.84,
  bgmDuckRestoreId: 0,
  sfxVolume: 0.9,
  currentTrack: BGM_TRACKS[0].value
};

const settings = {
  gamepadMode: "left"
};

const PAD_MODES = ["left", "right", "both"];
const SUN_OPEN_DURATIONS_MS = [5000, 10000, 15000];
const SUN_CLOSED_DURATIONS_MS = [1000, 2000, 3000, 4000, 5000, 6000];

const input = {
  left: false,
  right: false,
  up: false,
  down: false,
  pointerActive: false,
  padButtons: {
    a: false,
    b: false,
    x: false,
    y: false
  }
};

const els = {
  score: document.querySelector("#score"),
  lives: document.querySelector("#lives"),
  round: document.querySelector("#round"),
  questionText: document.querySelector("#questionText"),
  playfield: document.querySelector("#playfield"),
  basket: document.querySelector("#basket"),
  message: document.querySelector("#message"),
  startButton: document.querySelector("#startButton"),
  startButtonIcon: document.querySelector("#startButtonIcon"),
  bgmToggle: document.querySelector("#bgmToggle"),
  bgmSelect: document.querySelector("#bgmSelect"),
  bgmVolumeControl: document.querySelector("#bgmVolumeControl"),
  sfxVolumeControl: document.querySelector("#sfxVolumeControl"),
  padModeSelect: document.querySelector("#padModeSelect"),
  sunClosed: document.querySelector(".sun-closed"),
  clouds: [...document.querySelectorAll(".cloud")]
};

function currentTerm() {
  return quiz.terms[state.currentTermIndex];
}

function roundCount() {
  return quiz.terms.length;
}

async function loadQuiz() {
  try {
    const response = await fetch("./quiz.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load quiz.json: ${response.status}`);
    }
    const loaded = await response.json();
    if (!loaded || typeof loaded.title !== "string" || !Array.isArray(loaded.terms) || !loaded.terms.length) {
      throw new Error("Invalid quiz.json structure");
    }
    const normalizedTerms = loaded.terms.filter(
      (item) => item && typeof item.term === "string" && typeof item.description === "string"
    );
    if (!normalizedTerms.length) {
      throw new Error("quiz.json has no valid terms");
    }
    quiz = {
      title: loaded.title,
      correctScore:
        typeof loaded.correctScore === "number" && loaded.correctScore >= 0
          ? loaded.correctScore
          : DEFAULT_QUIZ.correctScore,
      roundAdvanceScore:
        typeof loaded.roundAdvanceScore === "number" && loaded.roundAdvanceScore >= 0
          ? loaded.roundAdvanceScore
          : DEFAULT_QUIZ.roundAdvanceScore,
      lifeBonusScore:
        typeof loaded.lifeBonusScore === "number" && loaded.lifeBonusScore >= 0
          ? loaded.lifeBonusScore
          : DEFAULT_QUIZ.lifeBonusScore,
      lives: typeof loaded.lives === "number" && loaded.lives > 0 ? loaded.lives : DEFAULT_QUIZ.lives,
      terms: normalizedTerms
    };
  } catch (error) {
    console.warn("Using fallback quiz data.", error);
    quiz = { ...DEFAULT_QUIZ, terms: [...DEFAULT_QUIZ.terms] };
  }
  state.termOrder = [...quiz.terms.keys()];
}

function topicParticle(text) {
  const trimmed = text.trim();
  const lastChar = [...trimmed].pop();
  if (!lastChar) return "은";
  const code = lastChar.charCodeAt(0);
  const hangulBase = 0xac00;
  const hangulEnd = 0xd7a3;

  if (code < hangulBase || code > hangulEnd) {
    return "는";
  }

  const hasBatchim = (code - hangulBase) % 28 !== 0;
  return hasBatchim ? "은" : "는";
}

function ensureAudio() {
  if (audio.ctx) return audio.ctx;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  audio.ctx = new AudioContextClass();
  audio.sfxMaster = audio.ctx.createGain();
  audio.sfxMaster.gain.value = audio.sfxVolume;
  audio.sfxMaster.connect(audio.ctx.destination);
  return audio.ctx;
}

function initBgm() {
  audio.bgm.loop = true;
  audio.bgm.preload = "none";
  audio.bgm.src = audio.currentTrack;
  audio.bgm.volume = audio.bgmVolume;
  audio.fail.preload = "auto";
  audio.fail.volume = audio.sfxVolume;
  audio.failVoice.preload = "auto";
  audio.failVoice.volume = audio.sfxVolume;
  audio.win.preload = "auto";
  audio.win.volume = audio.sfxVolume;
  audio.winVoice.preload = "auto";
  audio.winVoice.volume = audio.sfxVolume;
  for (const clip of [...audio.voiceCorrect, ...audio.voiceCombo, ...audio.voiceWrong]) {
    clip.preload = "auto";
    clip.volume = audio.sfxVolume;
  }
}

function setBgmVolume(value) {
  audio.bgmVolume = value;
  if (!audio.bgmDuckActive) {
    audio.bgm.volume = value;
  }
}

function animateBgmVolume(targetVolume, durationMs) {
  if (audio.bgmFadeFrameId) {
    window.cancelAnimationFrame(audio.bgmFadeFrameId);
    audio.bgmFadeFrameId = 0;
  }

  const startVolume = audio.bgm.volume;
  const startTime = performance.now();

  const tick = (now) => {
    const progress = Math.min(1, (now - startTime) / durationMs);
    audio.bgm.volume = startVolume + (targetVolume - startVolume) * progress;
    if (progress < 1) {
      audio.bgmFadeFrameId = window.requestAnimationFrame(tick);
      return;
    }
    audio.bgmFadeFrameId = 0;
    audio.bgm.volume = targetVolume;
  };

  audio.bgmFadeFrameId = window.requestAnimationFrame(tick);
}

function duckBgmForClip(clip, duckRatio = 0.18) {
  if (!audio.bgmEnabled || !clip) return;
  const baseVolume = audio.bgmVolume;
  const duckedVolume = Math.max(0.04, baseVolume * duckRatio);
  audio.bgmDuckActive = true;
  animateBgmVolume(duckedVolume, 180);

  if (audio.bgmDuckRestoreId) {
    window.clearTimeout(audio.bgmDuckRestoreId);
  }

  const restore = () => {
    if (audio.bgmDuckRestoreId) {
      window.clearTimeout(audio.bgmDuckRestoreId);
      audio.bgmDuckRestoreId = 0;
    }
    audio.bgmDuckActive = false;
    animateBgmVolume(audio.bgmVolume, 900);
    clip.removeEventListener("ended", restore);
  };

  clip.removeEventListener("ended", restore);
  clip.addEventListener("ended", restore, { once: true });
  audio.bgmDuckRestoreId = window.setTimeout(restore, Math.max(800, ((clip.duration || 0) + 0.2) * 1000));
}

function setSfxVolume(value) {
  audio.sfxVolume = value;
  audio.fail.volume = value;
  audio.failVoice.volume = value;
  audio.win.volume = value;
  audio.winVoice.volume = value;
  for (const clip of [...audio.voiceCorrect, ...audio.voiceCombo, ...audio.voiceWrong]) {
    clip.volume = value;
  }
  if (audio.sfxMaster && audio.ctx) {
    audio.sfxMaster.gain.setTargetAtTime(audio.sfxVolume, audio.ctx.currentTime, 0.02);
  }
}

function playVoiceClip(clip) {
  if (!audio.enabled || !clip) return;
  clip.pause();
  clip.currentTime = 0;
  clip.play().catch(() => {});
}

function playTone({ frequency, duration = 0.2, volume = 0.05, type = "sine", when, rampTo }) {
  const ctx = ensureAudio();
  if (!ctx || !audio.sfxMaster) return;

  const startAt = when ?? ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startAt);
  if (rampTo) {
    osc.frequency.exponentialRampToValueAtTime(rampTo, startAt + duration);
  }

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  osc.connect(gain);
  gain.connect(audio.sfxMaster);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.03);
}

async function playBgm() {
  if (!audio.enabled || !audio.bgmEnabled) return;
  if (!audio.bgm.src) {
    initBgm();
  }
  try {
    await audio.bgm.play();
  } catch {
    // Ignore autoplay or decoding errors; the next user gesture can retry.
  }
}

function pauseBgm() {
  audio.bgm.pause();
}

function stopBgm() {
  audio.bgm.pause();
  audio.bgm.currentTime = 0;
}

async function changeBgmTrack(nextTrack) {
  const shouldResume = audio.bgmEnabled && audio.enabled;
  audio.currentTrack = nextTrack;
  audio.bgm.pause();
  audio.bgm.src = nextTrack;
  audio.bgm.load();
  if (shouldResume) {
    await playBgm();
  }
}

async function enableAudio() {
  const ctx = ensureAudio();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  audio.enabled = true;
}

function unlockableEffectClips() {
  return [audio.fail, audio.failVoice, audio.win, audio.winVoice, ...audio.voiceCorrect, ...audio.voiceCombo, ...audio.voiceWrong];
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function unlockEffectAudio() {
  if (!audio.enabled || audio.effectsUnlocked) return;
  if (audio.effectsUnlocking) {
    await audio.effectsUnlocking;
    return;
  }

  audio.effectsUnlocking = (async () => {
    try {
      for (const clip of unlockableEffectClips()) {
        const previousVolume = clip.volume;
        const previousMuted = clip.muted;
        try {
          clip.load();
          clip.muted = false;
          clip.volume = 0;
          clip.currentTime = 0;
          await clip.play();
          await wait(25);
          clip.pause();
          clip.currentTime = 0;
        } catch {
          // Some browsers may still reject individual clips here.
        } finally {
          clip.volume = previousVolume;
          clip.muted = previousMuted;
        }
      }
      audio.effectsUnlocked = true;
    } finally {
      audio.effectsUnlocking = null;
    }
  })();

  await audio.effectsUnlocking;
}

function playEatSound(isCombo = false) {
  if (!audio.enabled) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime + 0.01;
  playTone({ frequency: 920, rampTo: 1420, duration: 0.11, volume: 0.24, type: "square", when: now });
  playTone({ frequency: 1260, rampTo: 1880, duration: 0.1, volume: 0.2, type: "triangle", when: now + 0.04 });
  playTone({ frequency: 1580, rampTo: 2100, duration: 0.08, volume: 0.14, type: "sine", when: now + 0.08 });
  if (isCombo) {
    const nextClip = audio.voiceCombo[audio.voiceComboIndex % audio.voiceCombo.length];
    audio.voiceComboIndex = (audio.voiceComboIndex + 1) % audio.voiceCombo.length;
    playVoiceClip(nextClip);
    return;
  }
  const nextClip = audio.voiceCorrect[audio.voiceCorrectIndex % audio.voiceCorrect.length];
  audio.voiceCorrectIndex = (audio.voiceCorrectIndex + 1) % audio.voiceCorrect.length;
  playVoiceClip(nextClip);
}

function playWrongSound() {
  if (!audio.enabled) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime + 0.01;
  playTone({ frequency: 320, rampTo: 210, duration: 0.18, volume: 0.18, type: "sawtooth", when: now });
  playTone({ frequency: 240, rampTo: 150, duration: 0.24, volume: 0.1, type: "triangle", when: now + 0.04 });
  playVoiceClip(pickRandom(audio.voiceWrong));
}

function playSadSound() {
  if (!audio.enabled) return;
  if (audio.bgmEnabled) {
    if (audio.bgmDuckRestoreId) {
      window.clearTimeout(audio.bgmDuckRestoreId);
      audio.bgmDuckRestoreId = 0;
    }
    audio.bgmDuckActive = true;
    animateBgmVolume(Math.max(0.04, audio.bgmVolume * 0.18), 180);
  }

  const cleanup = () => {
    audio.fail.removeEventListener("ended", playTryAgainVoice);
    audio.failVoice.removeEventListener("ended", restoreBgm);
  };

  const restoreBgm = () => {
    cleanup();
    if (audio.bgmDuckRestoreId) {
      window.clearTimeout(audio.bgmDuckRestoreId);
      audio.bgmDuckRestoreId = 0;
    }
    audio.bgmDuckActive = false;
    animateBgmVolume(audio.bgmVolume, 900);
  };

  const playTryAgainVoice = () => {
    audio.failVoice.pause();
    audio.failVoice.currentTime = 0;
    audio.failVoice.play().catch(() => {
      try {
        audio.failVoice.load();
      } catch {}
      window.setTimeout(() => {
        audio.failVoice.currentTime = 0;
        audio.failVoice.play().catch(() => {
          restoreBgm();
        });
      }, 120);
    });
  };

  cleanup();
  audio.fail.pause();
  audio.fail.currentTime = 0;
  audio.fail.addEventListener("ended", playTryAgainVoice, { once: true });
  audio.failVoice.addEventListener("ended", restoreBgm, { once: true });
  audio.fail.play().catch(() => {
    playTryAgainVoice();
  });
}

function playWinSound() {
  if (!audio.enabled) return;
  if (audio.bgmEnabled) {
    if (audio.bgmDuckRestoreId) {
      window.clearTimeout(audio.bgmDuckRestoreId);
      audio.bgmDuckRestoreId = 0;
    }
    audio.bgmDuckActive = true;
    animateBgmVolume(Math.max(0.04, audio.bgmVolume * 0.18), 180);
  }

  const cleanup = () => {
    audio.win.removeEventListener("ended", playCongratsVoice);
    audio.winVoice.removeEventListener("ended", restoreBgm);
  };

  const restoreBgm = () => {
    cleanup();
    if (audio.bgmDuckRestoreId) {
      window.clearTimeout(audio.bgmDuckRestoreId);
      audio.bgmDuckRestoreId = 0;
    }
    audio.bgmDuckActive = false;
    animateBgmVolume(audio.bgmVolume, 900);
  };

  const playCongratsVoice = () => {
    audio.winVoice.pause();
    audio.winVoice.currentTime = 0;
    audio.winVoice.play().catch(() => {
      try {
        audio.winVoice.load();
      } catch {}
      window.setTimeout(() => {
        audio.winVoice.currentTime = 0;
        audio.winVoice.play().catch(() => {
          restoreBgm();
        });
      }, 120);
    });
  };

  cleanup();
  audio.win.pause();
  audio.win.currentTime = 0;
  audio.win.addEventListener("ended", playCongratsVoice, { once: true });
  audio.winVoice.addEventListener("ended", restoreBgm, { once: true });
  audio.win.play().catch(() => {
    playCongratsVoice();
  });
}

function fitQuestionText() {
  const maxSize = window.innerWidth <= 760 ? 42 : 56;
  const titleMode = els.questionText.classList.contains("title-text");
  const minSize = window.innerWidth <= 760 ? (titleMode ? 14 : 18) : 26;

  els.questionText.style.fontSize = `${maxSize}px`;
  while (
    els.questionText.scrollWidth > els.questionText.clientWidth &&
    Number.parseFloat(els.questionText.style.fontSize) > minSize
  ) {
    const nextSize = Number.parseFloat(els.questionText.style.fontSize) - 2;
    els.questionText.style.fontSize = `${nextSize}px`;
  }
}

function populateBgmSelector() {
  const options = BGM_TRACKS.map(({ value, label }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  });
  els.bgmSelect.replaceChildren(...options);
  els.bgmSelect.value = audio.currentTrack;
}

function readGamepadAxes() {
  const pads = navigator.getGamepads?.() || [];
  for (const pad of pads) {
    if (!pad) continue;
    const dpadHorizontal = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
    const dpadVertical = (pad.buttons[13]?.pressed ? 1 : 0) - (pad.buttons[12]?.pressed ? 1 : 0);
    const leftHorizontalAxis = pad.axes[0] || 0;
    const leftVerticalAxis = pad.axes[1] || 0;
    const rightHorizontalAxis = pad.axes[2] || 0;
    const rightVerticalAxis = pad.axes[3] || 0;

    let horizontal = dpadHorizontal;
    let vertical = dpadVertical;

    if (settings.gamepadMode === "left") {
      horizontal = Math.abs(leftHorizontalAxis) > 0.18 ? leftHorizontalAxis : dpadHorizontal;
      vertical = Math.abs(leftVerticalAxis) > 0.18 ? leftVerticalAxis : dpadVertical;
    }

    if (settings.gamepadMode === "right") {
      horizontal = Math.abs(rightHorizontalAxis) > 0.18 ? rightHorizontalAxis : dpadHorizontal;
      vertical = Math.abs(rightVerticalAxis) > 0.18 ? rightVerticalAxis : dpadVertical;
    }

    if (settings.gamepadMode === "both") {
      horizontal = Math.abs(rightHorizontalAxis) > 0.18 ? rightHorizontalAxis : dpadHorizontal;
      vertical = Math.abs(leftVerticalAxis) > 0.18 ? leftVerticalAxis : dpadVertical;
    }

    return { horizontal, vertical };
  }
  return { horizontal: 0, vertical: 0 };
}

function readGamepadButtons() {
  const pads = navigator.getGamepads?.() || [];
  for (const pad of pads) {
    if (!pad) continue;
    return {
      a: Boolean(pad.buttons[0]?.pressed),
      b: Boolean(pad.buttons[1]?.pressed),
      x: Boolean(pad.buttons[2]?.pressed),
      y: Boolean(pad.buttons[3]?.pressed)
    };
  }
  return { a: false, b: false, x: false, y: false };
}

function movementAxes() {
  const horizontal = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const vertical = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const gamepad = readGamepadAxes();
  return {
    horizontal: Math.abs(gamepad.horizontal) > Math.abs(horizontal) ? gamepad.horizontal : horizontal,
    vertical: Math.abs(gamepad.vertical) > Math.abs(vertical) ? gamepad.vertical : vertical
  };
}

async function toggleBgmEnabled() {
  audio.bgmEnabled = !audio.bgmEnabled;
  els.bgmToggle.checked = audio.bgmEnabled;
  if (audio.bgmEnabled) {
    await enableAudio();
    void unlockEffectAudio();
    await playBgm();
    return;
  }
  audio.bgm.pause();
}

async function selectNextTrack() {
  const currentIndex = BGM_TRACKS.findIndex(({ value }) => value === audio.currentTrack);
  const nextIndex = (currentIndex + 1) % BGM_TRACKS.length;
  const nextTrack = BGM_TRACKS[nextIndex];
  els.bgmSelect.value = nextTrack.value;
  await enableAudio();
  await changeBgmTrack(nextTrack.value);
}

function cyclePadMode() {
  const currentIndex = PAD_MODES.indexOf(settings.gamepadMode);
  const nextMode = PAD_MODES[(currentIndex + 1) % PAD_MODES.length];
  settings.gamepadMode = nextMode;
  els.padModeSelect.value = nextMode;
}

async function handleGamepadButtons() {
  const buttons = readGamepadButtons();
  const previous = input.padButtons;
  input.padButtons = buttons;

  if (buttons.a && !previous.a) {
    if (!state.running) {
      await startGame({ enableBgmOnStart: true });
    } else {
      togglePause();
    }
  }

  if (buttons.b && !previous.b) {
    cyclePadMode();
  }

  if (buttons.x && !previous.x) {
    await toggleBgmEnabled();
  }

  if (buttons.y && !previous.y) {
    await selectNextTrack();
  }
}

function monitorGamepadButtons() {
  handleGamepadButtons();
  requestAnimationFrame(monitorGamepadButtons);
}

function positionPlayer() {
  const rect = els.playfield.getBoundingClientRect();
  const playerWidth = els.basket.offsetWidth || 118;
  const playerHeight = els.basket.offsetHeight || 118;
  const topInset = window.innerWidth <= 760 ? 132 : 94;
  const minX = playerWidth / 2 + 8;
  const maxX = rect.width - playerWidth / 2 - 8;
  const minY = playerHeight / 2 + topInset;
  const maxY = rect.height - playerHeight / 2 - 8;
  const x = minX + (maxX - minX) * state.playerX;
  const y = minY + (maxY - minY) * state.playerY;
  els.basket.style.left = `${x}px`;
  els.basket.style.top = `${y}px`;
  els.basket.dataset.x = String(Math.round(x));
  els.basket.dataset.y = String(Math.round(y));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomizeClouds() {
  const mobile = window.innerWidth <= 760;
  const widthRanges = mobile
    ? [
        [20, 32],
        [18, 28],
        [22, 36],
        [19, 30],
        [18, 26],
        [21, 32]
      ]
    : [
        [12, 20],
        [10, 16],
        [14, 22],
        [11, 18],
        [9, 15],
        [12, 20]
      ];

  els.clouds.forEach((cloud, index) => {
    const [minWidth, maxWidth] = widthRanges[index % widthRanges.length];
    const widthVw = randomBetween(minWidth, maxWidth);
    const top = randomBetween(4, 40);
    const left = randomBetween(-34, -8);
    const duration = randomBetween(180, 320);
    const delay = -randomBetween(0, duration);
    const opacity = randomBetween(0.72, 0.92);

    cloud.style.top = `${top}%`;
    cloud.style.left = `${left}vw`;
    cloud.style.width = `${widthVw}vw`;
    cloud.style.opacity = String(opacity);
    cloud.style.animationDuration = `${duration}s`;
    cloud.style.animationDelay = `${delay}s`;
  });
}

function scheduleSunBlink() {
  const openDelay = pickRandom(SUN_OPEN_DURATIONS_MS);
  window.setTimeout(() => {
    els.sunClosed.style.opacity = "1";
    const closedDelay = pickRandom(SUN_CLOSED_DURATIONS_MS);
    window.setTimeout(() => {
      els.sunClosed.style.opacity = "0";
      scheduleSunBlink();
    }, closedDelay);
  }, openDelay);
}

function idleTick(now) {
  if (!state.running && !state.paused) {
    if (!state.idleLastFrame) state.idleLastFrame = now;
    const dt = Math.min(48, now - state.idleLastFrame);
    state.idleLastFrame = now;

    const idleGroundY = 0.975;
    if (state.playerY < idleGroundY) {
      state.playerY = Math.min(idleGroundY, state.playerY + dt * 0.00008);
    } else {
      state.playerY = idleGroundY;
      state.playerX += state.idleDirection * dt * 0.00006;
      if (state.playerX >= 0.82) {
        state.playerX = 0.82;
        state.idleDirection = -1;
      } else if (state.playerX <= 0.18) {
        state.playerX = 0.18;
        state.idleDirection = 1;
      }
    }
    els.basket.classList.add("flapping");
    positionPlayer();
  } else {
    state.idleLastFrame = now;
  }

  requestAnimationFrame(idleTick);
}

function playerRect() {
  const fieldRect = els.playfield.getBoundingClientRect();
  const rect = els.basket.getBoundingClientRect();
  return {
    left: rect.left - fieldRect.left + 14,
    right: rect.right - fieldRect.left - 14,
    top: rect.top - fieldRect.top + 18,
    bottom: rect.bottom - fieldRect.top - 10
  };
}

function shuffleTerms() {
  const order = [...quiz.terms.keys()];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }
  state.termOrder = order;
}

function setMessage(title, detail = "", active = true) {
  els.message.innerHTML = `<strong>${title}</strong><span>${detail}</span>`;
  els.message.classList.toggle("active", active);
}

function updateHud() {
  els.score.textContent = String(state.score);
  const displayedLives = state.running || state.score > 0 || state.misses > 0 ? state.lives : quiz.lives;
  const displayedRound = state.running ? Math.min(state.roundIndex + 1, roundCount()) : 0;
  els.lives.textContent = String(displayedLives);
  els.round.textContent = `${displayedRound}/${roundCount()}`;
}

function syncActionButtons() {
  if (state.running) {
    const paused = state.paused;
    els.startButton.dataset.icon = paused ? "play" : "pause";
    els.startButtonIcon.src = paused ? "./icons/play.png" : "./icons/pause.png";
    els.startButton.setAttribute("aria-label", paused ? "게임 계속" : "게임 일시정지");
    return;
  }

  els.startButton.dataset.icon = "play";
  els.startButtonIcon.src = "./icons/play.png";
  els.startButton.setAttribute("aria-label", "게임 시작");
}

function showStartTitle() {
  els.questionText.classList.add("title-text");
  els.questionText.textContent = quiz.title;
  fitQuestionText();
  updateHud();
}

function setupRound() {
  clearCakes();
  state.currentTermIndex = state.termOrder[state.roundIndex % state.termOrder.length];
  state.roundHits = 0;
  state.roundSpawnCount = 0;
  state.minWrongBeforeCorrect = Math.min(4, 2 + Math.floor(state.roundIndex / 2));
  state.forcedCorrectSpawned = false;
  state.spawnDelay = Math.max(580, 1050 - state.roundIndex * 42);
  state.spawnTimer = 300;

  const term = currentTerm();
  els.questionText.classList.remove("title-text");
  els.questionText.textContent = `${term.description}${topicParticle(term.description)}?`;
  fitQuestionText();

  updateHud();
}

async function startGame({ enableBgmOnStart = false } = {}) {
  await enableAudio();
  void unlockEffectAudio();
  if (enableBgmOnStart && !audio.bgmEnabled) {
    audio.bgmEnabled = true;
    els.bgmToggle.checked = true;
  }
  if (audio.bgmEnabled) {
    await playBgm();
  }
  state.running = true;
  state.paused = false;
  state.score = 0;
  state.lives = quiz.lives;
  state.roundIndex = 0;
  state.correctHits = 0;
  state.combo = 0;
  state.misses = 0;
  state.playerX = 0.5;
  state.playerY = 0.74;
  state.idleDirection = 1;
  shuffleTerms();
  syncActionButtons();
  setMessage("", "", false);
  setupRound();
  positionPlayer();
  requestAnimationFrame(tick);
}

function togglePause() {
  if (!state.running) return;
  state.paused = !state.paused;
  syncActionButtons();
  setMessage("잠깐 멈춤", "플레이를 누르면 바로 이어집니다.", state.paused);
  if (!state.paused) {
    enableAudio();
    state.lastFrame = performance.now();
    requestAnimationFrame(tick);
  }
}

function finishGame() {
  state.running = false;
  clearCakes();
  playWinSound();
  const lifeBonus = state.lives * quiz.lifeBonusScore;
  state.score += lifeBonus;
  const totalAttempts = Math.max(1, state.correctHits + state.misses);
  const accuracy = Math.round((state.correctHits / totalAttempts) * 100);
  showStartTitle();
  setMessage("축하합니다!", `총점 ${state.score}점 · 생명 보너스 ${lifeBonus}점 · 정답률 ${accuracy}%`);
  syncActionButtons();
}

function failGame() {
  state.running = false;
  clearCakes();
  playSadSound();
  showStartTitle();
  setMessage("아쉬워요!", `점수 ${state.score}점에서 멈췄습니다. 다시 도전해볼까요?`);
  syncActionButtons();
}

async function handlePrimaryAction() {
  if (state.running) {
    togglePause();
    return;
  }

  await startGame();
}

function nextRound() {
  state.roundIndex += 1;
  state.score += quiz.roundAdvanceScore;
  flash("good");
  if (state.roundIndex >= roundCount()) {
    finishGame();
    updateHud();
    return;
  }
  setupRound();
}

function clearCakes() {
  state.cakes.forEach((cake) => cake.el.remove());
  state.cakes = [];
}

function spawnCake() {
  if (!state.running || state.paused) return;
  const fieldRect = els.playfield.getBoundingClientRect();
  const term = currentTerm();
  const speed = 150 + state.roundIndex * 12 + Math.random() * 56;
  const topSafeZone = window.innerWidth <= 760 ? 198 : 142;
  const y = topSafeZone + Math.random() * Math.max(120, fieldRect.height - topSafeZone - 96);
  const canShowCorrect = state.roundSpawnCount >= state.minWrongBeforeCorrect;
  const mustShowCorrect = state.roundSpawnCount >= state.minWrongBeforeCorrect + 4;
  const correctAlreadyFalling = state.cakes.some((cake) => cake.correct);
  const correct = !correctAlreadyFalling && canShowCorrect && (mustShowCorrect || Math.random() < 0.42);
  let label = term.term;

  if (correct) {
    state.forcedCorrectSpawned = true;
  } else {
    const wrongTerms = quiz.terms.filter((item) => item.term !== term.term);
    label = wrongTerms[Math.floor(Math.random() * wrongTerms.length)].term;
  }

  const el = document.createElement("div");
  el.className = `rice-cake ${correct ? "correct" : "wrong"}`;
  el.textContent = label;
  el.dataset.correct = String(correct);
  el.dataset.label = label;
  el.dataset.id = String(state.nextCakeId++);
  els.playfield.append(el);
  state.roundSpawnCount += 1;

  const cake = {
    el,
    x: -72,
    y,
    width: 96,
    height: 54,
    speed,
    label,
    correct
  };
  state.cakes.push(cake);
  placeCake(cake);
}

function placeCake(cake) {
  cake.el.style.left = `${cake.x}px`;
  cake.el.style.top = `${cake.y}px`;
  cake.width = cake.el.offsetWidth;
  cake.height = cake.el.offsetHeight;
}

function overlaps(cake, basket) {
  const left = cake.x - cake.width / 2;
  const right = cake.x + cake.width / 2;
  const top = cake.y - cake.height / 2;
  const bottom = cake.y + cake.height / 2;
  return right > basket.left && left < basket.right && bottom > basket.top && top < basket.bottom;
}

function collectCake(cake) {
  cake.el.classList.add("hit");
  cake.el.remove();
  state.cakes = state.cakes.filter((item) => item !== cake);

  if (cake.correct) {
    state.correctHits += 1;
    state.combo += 1;
    playEatSound(state.combo >= 2);
    state.roundHits += 1;
    state.score += quiz.correctScore;
    nextRound();
    flash("good");
  } else {
    loseLife();
  }
  updateHud();
}

function loseLife() {
  playWrongSound();
  state.combo = 0;
  state.lives -= 1;
  state.misses += 1;
  flash("bad");
  updateHud();
  if (state.lives <= 0) {
    failGame();
  }
}

function flash(type) {
  const className = type === "good" ? "flash-good" : "flash-bad";
  els.playfield.classList.remove("flash-good", "flash-bad");
  void els.playfield.offsetWidth;
  els.playfield.classList.add(className);
}

function tick(now) {
  if (!state.running || state.paused) return;
  if (!state.lastFrame) state.lastFrame = now;
  const dt = Math.min(48, now - state.lastFrame);
  state.lastFrame = now;

  const axes = movementAxes();
  const moveScale = dt * 0.0012;
  const gravityScale = dt * 0.00006;
  state.playerX = Math.min(1, Math.max(0, state.playerX + axes.horizontal * moveScale));
  state.playerY = Math.min(
    1,
    Math.max(0, state.playerY + axes.vertical * moveScale + (Math.abs(axes.vertical) < 0.05 ? gravityScale : 0))
  );
  els.basket.classList.add("flapping");
  positionPlayer();

  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnCake();
    state.spawnTimer = state.spawnDelay + Math.random() * 260;
  }

  const fieldWidth = els.playfield.clientWidth;
  const player = playerRect();
  for (const cake of [...state.cakes]) {
    cake.x += cake.speed * (dt / 1000);
    placeCake(cake);
    if (overlaps(cake, player)) {
      collectCake(cake);
      continue;
    }
    if (cake.x - cake.width / 2 > fieldWidth + 24) {
      cake.el.remove();
      state.cakes = state.cakes.filter((item) => item !== cake);
    }
  }

  requestAnimationFrame(tick);
}

function setKeyState(key, pressed) {
  if (key === "arrowleft" || key === "a") input.left = pressed;
  if (key === "arrowright" || key === "d") input.right = pressed;
  if (key === "arrowup" || key === "w") input.up = pressed;
  if (key === "arrowdown" || key === "s") input.down = pressed;
}

function movePlayerToPointer(clientX, clientY) {
  const rect = els.playfield.getBoundingClientRect();
  const playerWidth = els.basket.offsetWidth || 118;
  const playerHeight = els.basket.offsetHeight || 118;
  const topInset = window.innerWidth <= 760 ? 132 : 94;
  const usableMinX = playerWidth / 2 + 8;
  const usableMaxX = rect.width - playerWidth / 2 - 8;
  const usableMinY = playerHeight / 2 + topInset;
  const usableMaxY = rect.height - playerHeight / 2 - 8;
  const localX = Math.min(usableMaxX, Math.max(usableMinX, clientX - rect.left));
  const localY = Math.min(usableMaxY, Math.max(usableMinY, clientY - rect.top));
  state.playerX = (localX - usableMinX) / Math.max(1, usableMaxX - usableMinX);
  state.playerY = (localY - usableMinY) / Math.max(1, usableMaxY - usableMinY);
  positionPlayer();
}

window.addEventListener("keydown", (event) => {
  setKeyState(event.key.toLowerCase(), true);
  if (event.key === " " && state.running) {
    event.preventDefault();
    togglePause();
  }
});

window.addEventListener("keyup", (event) => {
  setKeyState(event.key.toLowerCase(), false);
});

els.playfield.addEventListener("pointerdown", (event) => {
  input.pointerActive = true;
  movePlayerToPointer(event.clientX, event.clientY);
});

els.playfield.addEventListener("pointermove", (event) => {
  if (!input.pointerActive && event.pointerType !== "touch") return;
  if (event.buttons !== 1 && event.pointerType !== "touch") return;
  movePlayerToPointer(event.clientX, event.clientY);
});

window.addEventListener("pointerup", () => {
  input.pointerActive = false;
});

window.addEventListener(
  "pointerdown",
  async () => {
    await enableAudio();
    await playBgm();
  },
  { once: true }
);

window.addEventListener(
  "keydown",
  async () => {
    await enableAudio();
    await playBgm();
  },
  { once: true }
);

els.startButton.addEventListener("click", handlePrimaryAction);
els.bgmToggle.addEventListener("change", async (event) => {
  const nextValue = event.target.checked;
  if (audio.bgmEnabled !== nextValue) {
    await toggleBgmEnabled();
  }
});
els.bgmSelect.addEventListener("change", async (event) => {
  await enableAudio();
  await changeBgmTrack(event.target.value);
});
els.padModeSelect.addEventListener("change", (event) => {
  settings.gamepadMode = event.target.value;
});
els.bgmVolumeControl.addEventListener("input", (event) => {
  setBgmVolume(Number(event.target.value) / 100);
});
els.sfxVolumeControl.addEventListener("input", (event) => {
  setSfxVolume(Number(event.target.value) / 100);
});
window.addEventListener("resize", positionPlayer);
window.addEventListener("resize", fitQuestionText);
window.addEventListener("resize", randomizeClouds);

async function initializeGame() {
  await loadQuiz();
  populateBgmSelector();
  initBgm();
  els.bgmToggle.checked = audio.bgmEnabled;
  els.padModeSelect.value = settings.gamepadMode;
  setBgmVolume(Number(els.bgmVolumeControl.value) / 100);
  setSfxVolume(Number(els.sfxVolumeControl.value) / 100);
  randomizeClouds();
  els.sunClosed.style.opacity = "0";
  scheduleSunBlink();
  playBgm();
  requestAnimationFrame(monitorGamepadButtons);
  requestAnimationFrame(idleTick);
  window.__vibeGame = {
    get quiz() {
      return quiz;
    },
    get TERMS() {
      return quiz.terms;
    },
    state,
    spawnCake,
    forceSpawnCorrect() {
      const term = currentTerm();
      const el = document.createElement("div");
      el.className = "rice-cake correct";
      el.textContent = term.term;
      el.dataset.correct = "true";
      el.dataset.label = term.term;
      els.playfield.append(el);
      const cake = {
        el,
        x: els.playfield.clientWidth / 2,
        y: 52,
        width: 90,
        height: 52,
        speed: 0,
        label: term.term,
        correct: true
      };
      state.cakes.push(cake);
      placeCake(cake);
    },
    forceCollectCorrect() {
      const term = currentTerm();
      const label = term.term;
      const el = document.createElement("div");
      el.className = "rice-cake correct";
      el.textContent = label;
      el.dataset.correct = "true";
      els.playfield.append(el);
      const player = playerRect();
      const cake = {
        el,
        x: (player.left + player.right) / 2,
        y: player.top,
        width: 90,
        height: 52,
        speed: 0,
        label,
        correct: true
      };
      state.cakes.push(cake);
      placeCake(cake);
      collectCake(cake);
    }
  };

  showStartTitle();
  syncActionButtons();
  positionPlayer();
}

initializeGame();
