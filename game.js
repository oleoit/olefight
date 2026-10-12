/* ============================================================
   NEON FIST — เกมต่อสู้ 2D สไตล์ Street Fighter (Canvas)
   HTML/CSS/JS ล้วน ไม่มี dependency
   ============================================================ */
"use strict";

// ---------------- ค่าคงที่ของเกม ----------------
const W = 960, H = 540;
const GROUND_Y = 470;              // แนวพื้น (พาดขาตัวละคร)
const GRAVITY = 0.55;
const STAGE_W = 1000;              // กว้างกว่าจอ เล็กน้อย เพื่อกล้องเลื่อนได้
const ROUND_TIME = 99;
const PLAYER_X_START = 260;
// สเตตที่ถือว่า "กำลังโจมตี" (เพิ่ม เตะต่ำ/สไลด์)
const ATTACK_STATES = ["punch", "kick", "kickLow", "slide", "super"];
const GROUND_ATTACKS = ["punch", "kick", "kickLow", "slide"];

// ---------------- องค์ประกอบ DOM ----------------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const el = {
  p1Health: document.getElementById("p1-health"),
  p1Chip: document.getElementById("p1-chip"),
  p1Meter: document.getElementById("p1-meter"),
  p1Name: document.getElementById("p1-name"),
  p2Health: document.getElementById("p2-health"),
  p2Chip: document.getElementById("p2-chip"),
  p2Meter: document.getElementById("p2-meter"),
  p2Name: document.getElementById("p2-name"),
  timer: document.getElementById("timer"),
  roundLabel: document.getElementById("round-label"),
  announce: document.getElementById("announce"),
  menu: document.getElementById("menu"),
  pauseBtn: document.getElementById("pause-btn"),
  soundBtn: document.getElementById("sound-btn"),
  pauseOverlay: document.getElementById("pause-overlay"),
};

// ---------------- เสียงสังเคราะห์ (WebAudio ไม่ต้องมีไฟล์) ----------
let audioCtx = null;
function ac() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function beep({ freq = 440, dur = 0.1, type = "square", vol = 0.15, slide = 0 } = {}) {
  try {
    const a = ac(), t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur);
  } catch (_) { /* เสียงใช้ไม่ได้ก็ข้ามไป */ }
}
const SFX = {
  hit: () => beep({ freq: 180, dur: 0.09, type: "square", slide: -80 }),
  kick: () => beep({ freq: 140, dur: 0.12, type: "sawtooth", slide: -60 }),
  block: () => beep({ freq: 500, dur: 0.05, type: "triangle", vol: 0.1 }),
  jump: () => beep({ freq: 300, dur: 0.15, type: "sine", slide: 200 }),
  super: () => beep({ freq: 120, dur: 0.5, type: "sawtooth", vol: 0.2, slide: 400 }),
  bell: () => beep({ freq: 880, dur: 0.25, type: "sine", vol: 0.18 }),
};

// ---------------- เพลงประกอบการต่อสู้ (sound/Clash_of_the_Iron_Crown.mp3) ----
const BGM_VOLUME = 0.45;
const battleBgm = new Audio("sound/Clash_of_the_Iron_Crown.mp3");
battleBgm.loop = true;
battleBgm.preload = "auto";
battleBgm.volume = BGM_VOLUME;
let bgmMuted = false;

function playBgm() {
  if (bgmMuted) return;
  const p = battleBgm.play();
  // เบราว์เซอร์บางตัวบล็อก autoplay ก่อนมีการกด — ข้ามไปเงียบ ๆ ไม่ให้เกมพัง
  if (p && typeof p.catch === "function") p.catch(() => {});
}

function pauseBgm() {
  if (!battleBgm.paused) battleBgm.pause();
}

function stopBgm() {
  battleBgm.pause();
  try { battleBgm.currentTime = 0; } catch (_) { /* ยังโหลดไม่เสร็จ ก็ข้ามไป */ }
}

function setMuted(on) {
  bgmMuted = on;
  el.soundBtn.classList.toggle("off", on);
  el.soundBtn.textContent = on ? "🔇" : "🔊";
  el.soundBtn.setAttribute("aria-label", on ? "เปิดเสียงเพลง" : "ปิดเสียงเพลง");
  if (on) pauseBgm();
  else if (matchState !== "menu" && !paused) playBgm();
}

// ---------------- อินพุต ----------------
const keys = {};
window.addEventListener("keydown", (e) => { keys[e.code] = true; });
window.addEventListener("keyup", (e) => { keys[e.code] = false; });

// ปุ่มสัมผัสบนมือถือ จำลอง keydown/keyup
document.querySelectorAll("#touch-controls button").forEach((btn) => {
  const codeMap = { w: "KeyW", a: "KeyA", s: "KeyS", d: "KeyD", u: "KeyU", i: "KeyI", o: "KeyO", k: "KeyK" };
  const code = codeMap[btn.dataset.key];
  const on = (e) => { e.preventDefault(); keys[code] = true; };
  const off = (e) => { e.preventDefault(); keys[code] = false; };
  btn.addEventListener("touchstart", on);
  btn.addEventListener("touchend", off);
  btn.addEventListener("touchcancel", off);
});

// ---------------- ตัวละคร ----------------
// ธีมตัวละคร: ชุด / ผิว / ผม / ถุงมือ / สไตล์ทรงผม
const THEMES = [
  {
    style: "band",
    main: "#3f9dff", deep: "#10284f", trim: "#a8ecff",
    accent: "#00e0a4", skin: "#ffd3ae", skinShade: "#cf9163",
    hair: "#0f1a33", hairHi: "#4d7ad1",
    glove: "#00e0a4", boot: "#0c1526", belt: "#0a1220",
    eye: "#9df6ff", aura: "#5ee0ff",
  },
  {
    style: "pony",
    main: "#ff5470", deep: "#4d0c1d", trim: "#ffd7b0",
    accent: "#ffb02f", skin: "#f3c49b", skinShade: "#c0824f",
    hair: "#28060f", hairHi: "#ff8a5c",
    glove: "#ffb02f", boot: "#27060f", belt: "#1a0308",
    eye: "#ffe08a", aura: "#ff8a5c",
  },
];

class Fighter {
  constructor(index, name, theme, isCpu) {
    this.index = index;              // 0 = ซ้าย, 1 = ขวา
    this.name = name;
    this.theme = theme;
    this.isCpu = isCpu;

    this.reset();
  }

  reset() {
    this.x = this.index === 0 ? PLAYER_X_START : STAGE_W - PLAYER_X_START;
    this.y = GROUND_Y;
    this.vx = 0; this.vy = 0;
    this.facing = this.index === 0 ? 1 : -1;
    this.health = 100;
    this.chipHealth = 100;           // ค่าที่เดินช้ามาใช้เป็น "chip" แดงบน bar
    this.meter = 0;                  // 0..100
    this.state = "idle";             // idle|walk|jump|crouch|punch|kick|block|hit|super|ko
    this.stateTime = 0;              // เฟรมที่ผ่านไดในสเตตปัจจุบัน
    this.attackType = null;
    this.hasHit = false;             // ป้องกันโจมตีเดียวทำโจทย์ซ้ำ
    this.blocking = false;
    this.aiThink = -999;
    this.aiPlan = null;
    this.stunUntil = 0;
  }

  // ---------- ฟิสิกส์และสเตต ----------
  get facingTarget() { return this.opponent.x + this.opponent.w / 2; }

  get w() { return 46; }
  // ส่วนสูงของ hurtbox: ท่าหมอบ/เตะต่ำ/สไลด์ ตัวจะเตี้ยลงจริง
  get h() {
    if (this.state === "crouch" || this.state === "kickLow") return 60;
    if (this.state === "slide") return 44;
    return 110;
  }

  get hurtbox() {
    // กล่องโดนโจมตี (ยึดตามพาด แคบกว่าตัวละคร)
    return { x: this.x - this.w / 2 + 6, y: this.y - this.h, w: this.w - 12, h: this.h };
  }

  // hitbox การโจมตี: ตำแหน่งเทียบตัวละคร, มีชีวิตใน window ของสเตต
  get attackHitbox() {
    // ตำแหน่งกล่อง: ถ้าหันขวา กล่องเริ่มขวาของตัว, ถ้าหันซ้าย กล่องต่อไปทางซ้าย
    const box = (off, len, y, h) =>
      this.facing === 1
        ? { x: this.x + off, y, w: len, h }
        : { x: this.x - off - len, y, w: len, h };
    if (this.state === "punch") {
      if (this.stateTime < 4 || this.stateTime > 8) return null;
      return box(20, 55, this.y - this.h + 22, 26);
    }
    if (this.state === "kick") {
      // เตะสูง — ระดับหัว/อก (ลอยข้ามหัวคนหมอบ)
      if (this.stateTime < 6 || this.stateTime > 11) return null;
      return box(18, 66, this.y - this.h * 0.9, this.h * 0.32);
    }
    if (this.state === "kickLow") {
      // เตะต่ำ — ระดับเท้า โดนคนหมอบด้วย
      if (this.stateTime < 5 || this.stateTime > 10) return null;
      return box(14, 52, this.y - 22, 22);
    }
    if (this.state === "slide") {
      // สไลด์ — ยิงต่ำและไกล
      if (this.stateTime < 4 || this.stateTime > 12) return null;
      return box(10, 64, this.y - 26, 26);
    }
    if (this.state === "super") {
      if (this.stateTime < 10 || this.stateTime > 26) return null;
      return box(26, 120, this.y - this.h * 0.75, 70);
    }
    return null;
  }

  attackDamage() {
    switch (this.state) {
      case "punch": return 8;
      case "kick": return 13;
      case "kickLow": return 7;
      case "slide": return 10;
      default: return 22;            // super
    }
  }

  startAttack(type) {
    if (ATTACK_STATES.includes(this.state) || this.state === "hit" || this.state === "ko") return;
    if (type === "super") {
      if (this.meter < 100) { SFX.block(); return; }
      this.meter = 0;
      SFX.super();
      hitPauseFrames = 14;
    } else if (type === "punch") SFX.hit();
    else SFX.kick();                        // เตะสูง / เตะต่ำ / สไลด์
    this.state = type;
    this.stateTime = 0;
    this.hasHit = false;
    // สไลด์: ตัวพุ่งไปข้างหน้าตามทิศที่หันอยู่
    if (type === "slide") this.vx = this.facing * 8;
    if (type !== "super") this.meter = Math.min(100, this.meter + 6);
  }

  update(inputs) {
    this.stateTime++;

    // edge detection: ปุ่มโจมตีต้อง "กดใหม่" แต่ละครั้ง (กดค้างไม่ตีวน)
    if (!this._prevInputs) this._prevInputs = {};
    const pressed = {
      punch: inputs.punch && !this._prevInputs.punch,
      kick: inputs.kick && !this._prevInputs.kick,
      super: inputs.super && !this._prevInputs.super,
      jump: inputs.jump && !this._prevInputs.jump,
    };
    this._prevInputs = { punch: inputs.punch, kick: inputs.kick, super: inputs.super, jump: inputs.jump };

    const canAct =
      this.state !== "super" && this.stateTime >= attackCooldown(this.state) &&
      !["hit", "ko"].includes(this.state);

    // กัน (hold) — ทำได้เมื่ออยู่พื้นและไม่ติดสเตตอื่นที่ยืดหยุ่นไม่ได้
    this.blocking =
      inputs.block && this.onGround() && !["hit", "ko", "jump"].includes(this.state) && !ATTACK_STATES.includes(this.state);
    if (this.blocking && this.state !== "block") { this.state = "block"; }
    if (!this.blocking && this.state === "block") { this.state = "idle"; }

    if (canAct) {
      if (pressed.super) this.startAttack("super");
      else if (pressed.punch) this.startAttack("punch");
      else if (pressed.kick) {
        // เตะสูง (ยืน) · เตะต่ำ (กดลง) · สไลด์ (กดลง + ซ้าย/ขวา)
        if (inputs.crouch && (inputs.left || inputs.right)) this.startAttack("slide");
        else if (inputs.crouch) this.startAttack("kickLow");
        else this.startAttack("kick");
      } else if (pressed.jump && this.onGround()) {
        this.vy = -11.5;
        this.state = "jump";
        SFX.jump();
      } else if (this.onGround()) {
        if (inputs.crouch) {
          this.state = "crouch";
        } else if (inputs.left || inputs.right) {
          this.vx = (inputs.right ? 3.4 : -3.4) * (this.blocking ? 0.25 : 1);
          this.state = this.vx === 0 ? "idle" : "walk";
        } else {
          this.vx *= 0.7;
          if (Math.abs(this.vx) < 0.2) this.vx = 0;
          if (this.state !== "jump" || this.onGround()) this.state = "idle";
        }
      }
    }

    // หันหน้าตามคู่ต่อสู้ (ยกเว้นกำลังโจมตี)
    if (!["hit", "ko"].includes(this.state) && !ATTACK_STATES.includes(this.state)) {
      this.facing = this.opponent.x >= this.x ? 1 : -1;
    }

    // ฟิสิกส์
    // แรงเสียดทาน: ทุกสเตตบนพื้นควรมีการหน่วงความเร็ว knockback
    if (this.onGround() && ["hit", "ko", "idle", "crouch"].includes(this.state)) this.vx *= 0.86;
    this.x += this.vx;
    this.y += this.vy;
    if (!this.onGround()) this.vy += GRAVITY;
    if (this.onGround() && this.vy > 0) { this.vy = 0; this.y = GROUND_Y; }
    if (this.state === "jump" && this.onGround() && this.stateTime > 3) this.state = "idle";

    // ขอบสนาม
    const half = this.w / 2;
    this.x = Math.max(half + 20, Math.min(STAGE_W - half - 20, this.x));

    // สเตตที่หมดเวลาเอง
    if (GROUND_ATTACKS.includes(this.state) && this.stateTime >= attackCooldown(this.state)) {
      this.state = "idle";
    }
    if (this.state === "super" && this.stateTime >= 40) this.state = "idle";
    if (this.state === "hit" && this.stateTime >= 10) this.state = "idle";

    // chip health วิ่งตาม health อย่างช้า ๆ
    this.chipHealth += (this.health - this.chipHealth) * 0.06;
  }

  onGround() { return this.y >= GROUND_Y - 0.01 && this.vy >= -0.01; }
}

function attackCooldown(state) {
  switch (state) {
    case "punch": return 14;
    case "kick": return 22;
    case "kickLow": return 17;
    case "slide": return 30;
    case "super": return 40;
    case "hit": return 10;
    default: return 0;
  }
}

// ค่าครอบทั่วไปสำหรับ hit pause
let hitPauseFrames = 0;

// ตรวจโจมตีชนกัน (ทั้งสองฝั่ง)
function checkHits() {
  if (hitPauseFrames > 0) return;
  for (const f of fighters) {
    const box = f.attackHitbox;
    if (!box || f.hasHit) continue;
    const other = f.opponent;
    if (other.state === "ko") continue;
    const hb = other.hurtbox;
    if (box.x < hb.x + hb.w && box.x + box.w > hb.x && box.y < hb.y + hb.h && box.y + box.h > hb.y) {
      f.hasHit = true;
      let dmg = f.attackDamage();
      const blocked = other.blocking || other.state === "block";
      // กัน: ลดดาเมจ 85% แตะได้เฉพาะด้านหน้า
      if (blocked && Math.sign(other.facing) === Math.sign(f.x - other.x)) {
        dmg = Math.max(1, Math.round(dmg * 0.15));
        other.vx = f.facing * 2;
        SFX.block();
      } else {
        other.state = "hit";
        other.stateTime = 0;
        // knockback ถอยจากผู้โจมตี แรงตามชนิดการโจมตี
        const kb = f.state === "super" ? 10 : f.state === "slide" ? 8 : f.state === "kick" ? 6 : 4;
        other.vx = kb * (other.x >= f.x ? 1 : -1);
        other.stunUntil = gameFrame + 24; // เว้นจังหวะให้คนโดนตีหายใจ
        if (f.state === "super") { other.vy = -7; other.y -= 1; }
        // สไลด์ = กวาดขา ลอยขึ้นจากพื้น
        if (f.state === "slide") { other.vy = -5.5; other.y -= 1; }
        SFX[f === fighters[0] ? "hit" : "kick"]();
      }
      other.health = Math.max(0, other.health - dmg);
      f.meter = Math.min(100, f.meter + dmg * 0.8);
      other.meter = Math.min(100, other.meter + dmg * 0.4);
      hitPauseFrames = f.state === "super" ? 8 : f.state === "slide" ? 5 : 3;
      // กันมุดตีที่กำแพง: คนถูกตีเด้งออกจากกำแพง (wall bounce) + ดันผู้โจมตีถอย
      const minX = other.w / 2 + 20, maxX = STAGE_W - other.w / 2 - 20;
      if (other.x <= minX + 4) {
        other.vx = 7;
        f.x = Math.max(f.x, minX + 70);
      } else if (other.x >= maxX - 4) {
        other.vx = -7;
        f.x = Math.min(f.x, maxX - 70);
      }
      spawnParticles(other.x, other.y - other.h * 0.6, f.state === "super" ? 26 : 10, f.state === "super" ? "#ffd75e" : "#ff5470");
      cameraShake = Math.min(14, cameraShake + (f.state === "super" ? 12 : 4));
    }
  }
}

// ---------------- ประกายไฟเอฟเฟกต์ ----------------
const particles = [];
function spawnParticles(x, y, n, color) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 9,
      vy: (Math.random() * -7),
      life: 22 + Math.random() * 14,
      color,
      size: 2 + Math.random() * 3.5,
    });
  }
}

// ---------------- AI ของ CPU ----------------
function cpuInputs(f) {
  const inp = { left: false, right: false, jump: false, crouch: false, punch: false, kick: false, block: false, super: false };
  const opp = f.opponent;
  const dx = opp.x - f.x;
  const dist = Math.abs(dx);
  const dir = Math.sign(dx) > 0 ? "right" : "left";

  // เดินให้ห่างระดับกลาง ๆ, สุ่มพฤติกรรมเปลี่ยนทุก ~30 เฟรม
  if (gameFrame - f.aiThink < 26 && f.aiPlan) return f.aiPlan;
  if (gameFrame - (f.lastAttackFrame || -999) < 48) {
    // หลังตีเสร็จ ให้ AI ถอย/กัน ช่วงสั้น ๆ ไม่รุกต่อเนื่อง
    const back = f.opponent.x > f.x ? "left" : "right";
    const r2 = Math.random();
    f.aiPlan = r2 < 0.6
      ? { left: back === "left", right: back === "right", jump: false, crouch: false, punch: false, kick: false, block: false, super: false }
      : { left: false, right: false, jump: false, crouch: false, punch: false, kick: false, block: true, super: false };
  } else if (f.stunUntil > gameFrame) {
    // เพิ่งโดนตี: AI ถอยห่างก่อน
    const back = f.opponent.x > f.x ? "left" : "right";
    return { left: back === "left", right: back === "right", jump: false, crouch: false, punch: false, kick: false, block: false, super: false };
  }

  f.aiThink = gameFrame;
  const r = Math.random();
  if (f.meter >= 100 && dist < 120) {
    f.aiPlan = { ...inp, super: true };
    f.lastAttackFrame = gameFrame;
  } else if (dist > 150) {
    f.aiPlan = { ...inp, [dir]: true };
  } else if (dist > 90) {
    if (r < 0.55) f.aiPlan = { ...inp, [dir]: true };
    else if (r < 0.7) f.aiPlan = { ...inp, jump: true, [dir]: true };
    else f.aiPlan = { ...inp, block: true };
  } else if (dist > 46) {
    if (r < 0.26) f.aiPlan = { ...inp, kick: true };
    else if (r < 0.38) f.aiPlan = { ...inp, punch: true };
    else if (r < 0.54) f.aiPlan = { ...inp, block: true };
    else if (r < 0.66) f.aiPlan = { ...inp, crouch: true, [dir]: true, kick: true };  // สไลด์เข้าหา
    else if (r < 0.9) f.aiPlan = { ...inp, [dir]: true };
    else f.aiPlan = { ...inp, crouch: true };
  } else {
    if (r < 0.16) f.aiPlan = { ...inp, punch: true };
    else if (r < 0.36) f.aiPlan = { ...inp, block: true };
    else if (r < 0.6) f.aiPlan = { ...inp, [dir === "right" ? "left" : "right"]: true };
    else if (r < 0.72) f.aiPlan = { ...inp, crouch: true };
    else if (r < 0.86) f.aiPlan = { ...inp, kick: true };
    else f.aiPlan = { ...inp, crouch: true, kick: true };   // เตะต่ำกวาดขา
  }
  if (f.aiPlan.punch || f.aiPlan.kick || f.aiPlan.super) f.lastAttackFrame = gameFrame;
  return f.aiPlan;
}

// ---------------- สนามและฉากหลัง ----------------
const buildings = [];
(function genBuildings() {
  let x = 0;
  while (x < STAGE_W) {
    const w = 60 + Math.random() * 120;
    buildings.push({ x, w, h: 80 + Math.random() * 200, hue: 200 + Math.random() * 80 });
    x += w + 14 + Math.random() * 40;
  }
})();

const stars = Array.from({ length: 70 }, () => ({
  x: Math.random() * STAGE_W,
  y: Math.random() * 300,
  s: Math.random() * 1.8 + 0.4,
  tw: Math.random() * Math.PI * 2,
}));

// ---------------- สถานะเกม / รอบ ----------------
const fighters = [];
const fighter0 = new Fighter(0, "PLAYER 1", THEMES[0], false);
const fighter1 = new Fighter(1, "CPU", THEMES[1], true);
fighter0.opponent = fighter1;
fighter1.opponent = fighter0;
fighters.push(fighter0, fighter1);

let gameMode = "cpu";          // "2p" | "cpu"
let roundNumber = 1;
let winsNeeded = 2;
let wins = [0, 0];
let roundTimeLeft = ROUND_TIME;
let timeAccumulator = 0;       // เฟรม (ทุก 60 เฟรม = 1 วินาที)
let matchState = "intro";      // intro | fighting | roundEnd | matchEnd
let stateTimer = 0;
let gameFrame = 0;
let cameraShake = 0;
let cameraX = 0;
let paused = false;             // พักเกม (หยุดเวลา/ฟิสิกส์ แต่ยังวาดจอ)

function isGameOver() {
  return wins[0] >= winsNeeded || wins[1] >= winsNeeded;
}

function announce(text, keep = 1400) {
  el.announce.textContent = text;
  el.announce.classList.remove("show");
  void el.announce.offsetWidth; // reflow เพื่อรีสตาร์ต animation
  el.announce.classList.add("show");
  clearTimeout(el.announce._t);
  el.announce._t = setTimeout(() => el.announce.classList.remove("show"), keep);
}

// ---------------- พักเกม ----------------
function setPaused(on) {
  paused = on;
  el.pauseOverlay.classList.toggle("show", on);
  el.pauseBtn.classList.toggle("on", on);
  el.pauseBtn.textContent = on ? "▶" : "❚❚";
  el.pauseBtn.setAttribute("aria-label", on ? "เล่นต่อ" : "พักเกม");
  // เพลงพัก/เล่นต่อตามเกม
  if (on) pauseBgm();
  else if (matchState !== "menu") playBgm();
}

function togglePause() {
  if (matchState === "menu") { setPaused(false); return; }
  setPaused(!paused);
}

function endRound(loserIndex) {
  const winner = 1 - loserIndex;
  wins[winner]++;
  // ผู้แพ้ที่เลือดหมดล้มลงกับพื้น (ท่า KO) — หมดเวลาแค่ยืนแพ้
  const loser = fighters[loserIndex];
  if (loser.health <= 0 && loser.state !== "ko") {
    loser.state = "ko";
    loser.stateTime = 0;
    loser.vx *= 0.4;
  }
  matchState = "roundEnd";
  stateTimer = 0;
  SFX.bell();
  if (isGameOver()) {
    announce(`${fighters[winner].name} WINS!`, 2600);
    matchState = "matchEnd";
  } else {
    announce(`K.O. — ROUND ${roundNumber + 1}`, 2200);
    roundNumber++;
  }
}

function startRound() {
  fighter0.reset(); fighter1.reset();
  fighter1.isCpu = gameMode === "cpu";
  fighter1.name = gameMode === "cpu" ? "CPU" : "PLAYER 2";
  el.p2Name.textContent = fighter1.name;
  roundTimeLeft = ROUND_TIME;
  timeAccumulator = 0;
  hitPauseFrames = 0;
  particles.length = 0;
  el.roundLabel.textContent = `ROUND ${roundNumber}`;
  matchState = "intro";
  stateTimer = 0;
  announce(`ROUND ${roundNumber} — FIGHT!`, 1600);
  playBgm();                       // เพลงต่อสู้เล่นตลอดแมตช์ (ต่อเนื่องข้ามรอบ)
}

// ---------------- อินพุตของผู้เล่น 1 / 2 ----------------
function playerInputs(index) {
  if (gameMode === "cpu" && index === 1) return cpuInputs(fighter1);
  if (index === 0) {
    return {
      left: keys["KeyA"], right: keys["KeyD"], jump: keys["KeyW"],
      crouch: keys["KeyS"], punch: keys["KeyU"], kick: keys["KeyI"],
      block: keys["KeyO"], super: keys["KeyK"],
    };
  }
  return {
    left: keys["ArrowLeft"], right: keys["ArrowRight"], jump: keys["ArrowUp"],
    crouch: keys["ArrowDown"], punch: keys["Numpad1"],
    kick: keys["Numpad2"], block: keys["Numpad3"], super: keys["Numpad0"],
  };
}

/* ============================================================
   การวาดตัวละคร — นักสู้ NEON FIST (วาดด้วยโค้ดล้วน ไม่ใช้รูปภาพ)
   ตัวละครเป็นหุ่น 2.5D: มีโครงแขน-ขาเป็นข้อ ใบหน้า ผมชุดนักสู้
   และแสงเรืองขอบตามเอกลักษณ์ของแต่ละตัว
   ============================================================ */

// ---------- เครื่องมือวาด ----------
function seg(x1, y1, x2, y2, w, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// วาดแขน/ขาเป็นท่อนสอบ (หนาใกล้ลำตัว เรียวปลาย) ซ้อนบนเงาขอบดำ
function limbChain(pts, w1, w2, outline, fill, shade) {
  const n = pts.length - 1;
  const widthAt = (i) => w1 + (w2 - w1) * (n <= 1 ? 1 : i / (n - 1));
  for (let i = 0; i < n; i++) seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], widthAt(i) + 4.5, outline);
  for (let i = 0; i < n; i++) seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], widthAt(i), fill);
  if (shade) for (let i = 0; i < n; i++) seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], widthAt(i) + 0.5, shade);
}

// ---------- โครงท่าทางของตัวละคร (พิกัด local: +x = ด้านหน้า) ----------
function buildPose(f, t) {
  const st = f.state;
  const breathe = Math.sin(t * 0.055);
  const swing = Math.sin(t * 0.2);

  const P = {
    pelvis: [0, -46 + breathe * 1.1],
    chest: [0.5, -80 + breathe * 1.5],
    neck: [0.5, -90 + breathe * 1.8],
    head: [2, -100 + breathe * 2.1],
    headR: 11.5,
    armF: [[5, -78], [10, -68], [13, -81]],
    armB: [[-5, -78], [-10, -68], [-6, -80]],
    legF: [[5, -46], [11, -25], [16, 0]],
    legB: [[-5, -46], [-10, -25], [-15, 0]],
  };

  if (st === "ko") {
    P.armF = [[5, -78], [15, -72], [24, -68]];
    P.armB = [[-5, -78], [-14, -74], [-22, -70]];
    P.legF = [[5, -46], [13, -26], [19, -5]];
    P.legB = [[-5, -46], [-13, -26], [-19, -5]];
    return P;
  }

  if (st === "walk") {
    const s = swing;
    const bob = -Math.abs(s) * 1.6;
    for (const k of ["pelvis", "chest", "neck", "head"]) P[k] = [P[k][0], P[k][1] + bob];
    P.legF = [[5, -46], [9 + s * 9, -25], [12 + s * 17, -Math.max(0, s) * 10]];
    P.legB = [[-5, -46], [-9 - s * 9, -25], [-12 - s * 17, -Math.max(0, -s) * 10]];
    P.armF = [[5, -78], [12 - s * 5, -70], [14 - s * 10, -82 + s * 3]];
    P.armB = [[-5, -78], [-11 + s * 6, -70], [-7 + s * 12, -80 - s * 4]];
  } else if (st === "crouch" || st === "kickLow") {
    // ท่าหมอบ/เตะต่ำ: ตัวสูง ~60 ตรงกับ hurtbox (ท่ายืนหรือเตะสูงจะลอยข้ามหัว)
    const e = st === "kickLow" ? Math.min(1, Math.max(0, (f.stateTime - 1) / 4)) : 0;
    P.pelvis = [0, -22];
    P.chest = [1, -38];
    P.neck = [1, -45];
    P.head = [3, -49];
    P.legB = [[-5, -22], [-17, -14], [-21, 0]];
    P.legF = st === "kickLow"
      ? [[5, -20], [16 + e * 12, -13], [24 + e * 22, -5]]
      : [[5, -22], [17, -14], [21, 0]];
    P.armF = [[5, -36], [12, -33], [14, -45]];
    P.armB = [[-5, -36], [-11, -33], [-8, -44]];
  } else if (st === "slide") {
    // สไลด์: ตัวเกือบราบติดพื้น ขาหน้าถีบไปข้างหน้า
    const e = Math.min(1, Math.max(0, (f.stateTime - 1) / 5));
    P.pelvis = [-2, -15];
    P.chest = [-7, -25];
    P.neck = [-9, -30];
    P.head = [-8, -34];
    P.legF = [[2, -15], [18, -12], [32 + e * 18, -7]];
    P.legB = [[-4, -15], [-15, -10], [-22, -6]];
    P.armF = [[-5, -23], [9, -20], [16, -28]];
    P.armB = [[-11, -25], [-19, -18], [-26, -12]];
  } else if (!f.onGround()) {
    P.legF = [[5, -46], [16, -34], [21, -16]];
    P.legB = [[-5, -46], [-12, -30], [-17, -12]];
    P.armF = [[5, -78], [13, -88], [17, -98]];
    P.armB = [[-5, -78], [-13, -86], [-17, -94]];
  } else if (st === "punch") {
    const e = Math.min(1, f.stateTime / 4);
    P.chest = [2, -80];
    P.head = [4.5, -101];
    P.armF = [[5, -79], [9 + e * 21, -80], [14 + e * 43, -80]];
    P.armB = [[-5, -78], [-12, -70], [-4, -85]];
    P.legF = [[6, -46], [14, -26], [21, 0]];
    P.legB = [[-6, -46], [-12, -26], [-17, 0]];
  } else if (st === "kick") {
    // เตะสูง — ขาเหยียดขึ้นระดับหัว
    const e = Math.min(1, Math.max(0, (f.stateTime - 2) / 5));
    P.pelvis = [-2, -46];
    P.chest = [-3, -80];
    P.neck = [-2, -90];
    P.head = [0, -100];
    P.legF = [[2, -46], [16 + e * 10, -60], [28 + e * 24, -84]];
    P.legB = [[-5, -46], [-10, -25], [-13, 0]];
    P.armF = [[4, -78], [10, -66], [17, -74]];
    P.armB = [[-6, -78], [-16, -84], [-25, -90]];
  } else if (st === "block") {
    P.pelvis = [0, -44];
    P.chest = [-1, -78];
    P.neck = [-1, -88];
    P.head = [1, -99];
    P.armF = [[4, -77], [11, -70], [13, -87]];
    P.armB = [[-4, -77], [9, -65], [6, -83]];
    P.legF = [[6, -44], [13, -24], [19, 0]];
    P.legB = [[-6, -44], [-13, -24], [-19, 0]];
  } else if (st === "hit") {
    const k = Math.min(1, f.stateTime / 3);
    P.chest = [-4 * k, -80];
    P.neck = [-6 * k, -90];
    P.head = [-7 * k, -101];
    P.armF = [[3, -79], [-3, -70], [-11, -78]];
    P.armB = [[-7, -78], [-15, -72], [-22, -80]];
    P.legF = [[6, -46], [10, -25], [20, 0]];
    P.legB = [[-6, -46], [-13, -25], [-19, 0]];
  } else if (st === "super") {
    const e = Math.min(1, f.stateTime / 9);
    P.chest = [3, -80];
    P.neck = [3, -90];
    P.head = [5, -101];
    P.armF = [[5, -79], [14 + e * 16, -80], [20 + e * 34, -79]];
    P.armB = [[-5, -79], [9 + e * 14, -74], [17 + e * 28, -73]];
    P.legF = [[6, -46], [16, -26], [23, 0]];
    P.legB = [[-6, -46], [-16, -26], [-23, 0]];
  }

  return P;
}

// ---------- แขน (พร้อมนวม) ----------
function drawArm(arm, th, grad, isBack) {
  const shade = isBack ? "rgba(5,8,18,0.34)" : null;
  limbChain(arm, 11, 7.5, "rgba(4,7,16,0.85)", grad, shade);
  const fist = arm[2];
  ctx.save();
  ctx.translate(fist[0], fist[1]);
  if (isBack) ctx.globalAlpha *= 0.8;
  ctx.shadowColor = th.glove;
  ctx.shadowBlur = isBack ? 0 : 10;
  ctx.fillStyle = th.glove;
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------- ขา (พร้อมรองเท้า) ----------
function drawLeg(leg, th, grad, isBack) {
  const shade = isBack ? "rgba(5,8,18,0.34)" : null;
  limbChain(leg, 15, 10, "rgba(4,7,16,0.85)", grad, shade);
  const knee = leg[1], foot = leg[2];
  const ang = Math.atan2(foot[1] - knee[1], foot[0] - knee[0]);
  ctx.save();
  ctx.translate(foot[0], foot[1]);
  ctx.rotate(ang);
  if (isBack) ctx.globalAlpha *= 0.85;
  ctx.fillStyle = th.boot;
  rr(-8, -7, 24, 13, 5.5);
  ctx.fill();
  ctx.strokeStyle = "rgba(4,7,16,0.85)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = th.accent;
  rr(1, -1.5, 12, 3.5, 1.75);
  ctx.fill();
  ctx.restore();
}

// ---------- ลำตัว + ชุดนักสู้ ----------
function drawTorso(P, th, grad) {
  const [px, py] = P.pelvis;
  const [cx, cy] = P.chest;
  const [nx, ny] = P.neck;
  const mid = (ny + py) / 2;

  ctx.beginPath();
  ctx.moveTo(cx - 12, ny + 2);
  ctx.quadraticCurveTo(cx - 17, mid, px - 11, py + 5);
  ctx.lineTo(px + 11, py + 5);
  ctx.quadraticCurveTo(cx + 18, mid - 4, cx + 13, ny + 2);
  ctx.quadraticCurveTo(cx + 4, ny - 4, cx - 12, ny + 2);
  ctx.closePath();

  ctx.save();
  ctx.shadowColor = th.aura;
  ctx.shadowBlur = 16;
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = "rgba(4,7,16,0.9)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // เงาใต้ซี่โครง ให้ลำตัวดูมีมิติ
  ctx.fillStyle = "rgba(4,8,20,0.26)";
  ctx.beginPath();
  ctx.ellipse(px + 3, mid + 7, 9, 15, 0, 0, Math.PI * 2);
  ctx.fill();

  // ผ้าคาดเอว + เข็มขัดเรืองแสง
  ctx.fillStyle = th.belt;
  rr(px - 12.5, py - 5, 26, 10, 3.5);
  ctx.fill();
  ctx.fillStyle = th.accent;
  ctx.beginPath();
  ctx.arc(px + 8, py + 0.5, 3.6, 0, Math.PI * 2);
  ctx.fill();

  // สายรัดอก
  ctx.save();
  ctx.strokeStyle = th.accent;
  ctx.lineWidth = 4.5;
  ctx.lineCap = "round";
  ctx.shadowColor = th.accent;
  ctx.shadowBlur = 9;
  ctx.beginPath();
  ctx.moveTo(cx + 9, ny + 5);
  ctx.lineTo(px - 7, py - 1);
  ctx.stroke();
  ctx.restore();

  // สันไหล่
  ctx.fillStyle = th.trim;
  ctx.beginPath();
  ctx.ellipse(cx + 12, ny + 4, 7.5, 5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.ellipse(cx - 10.5, ny + 4, 6, 4.5, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ---------- ผม / ผ้าคาดหัว ----------
function drawHair(th, hx, hy, r, t, vLocal) {
  const sway = Math.sin(t * 0.11) * 3.2 - vLocal * 1.5;
  if (th.style === "pony") {
    // หางม้ารวบต่ำด้านหลัง (ไม่พาดบนหัว จนดูเหมือนหันหลัง)
    ctx.lineCap = "round";
    ctx.strokeStyle = th.hair;
    ctx.lineWidth = 7.5;
    ctx.beginPath();
    ctx.moveTo(hx - r * 0.72, hy - r * 0.1);
    ctx.quadraticCurveTo(hx - r * 1.75, hy + r * 0.4 + sway, hx - r * 1.2, hy + r * 2.0 + sway * 1.7);
    ctx.stroke();
    ctx.strokeStyle = th.hairHi;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(hx - r * 0.8, hy - r * 0.18);
    ctx.quadraticCurveTo(hx - r * 1.72, hy + r * 0.38 + sway, hx - r * 1.16, hy + r * 1.78 + sway * 1.6);
    ctx.stroke();
    // ยางรัดผม
    ctx.fillStyle = th.accent;
    ctx.beginPath();
    ctx.arc(hx - r * 0.88, hy + r * 0.02, 3.2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // ผ้าคาดหัว + ปลายผ้าปลิว
    ctx.save();
    ctx.strokeStyle = th.accent;
    ctx.lineWidth = 3.4;
    ctx.lineCap = "butt";
    ctx.shadowColor = th.accent;
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(hx, hy - r * 0.04, r * 0.99, Math.PI * 1.0, Math.PI * 2.12);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.8, hy - r * 0.3 + i * 3);
      ctx.quadraticCurveTo(hx - r * 2.1, hy + sway + i * 5, hx - r * 3.4, hy + r * 1.5 + sway * 1.7 + i * 9);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ---------- หัว + ใบหน้า ----------
function drawHead(P, th, f, t) {
  const [hx, hy] = P.head;
  const r = P.headR;
  const ko = f.state === "ko";
  const vLocal = f.vx * f.facing;

  // คอ
  seg(P.neck[0], P.neck[1] - 3, hx - 1, hy + r * 0.55, 11, th.skinShade);

  // ผมด้านหลัง/บน (รูปจันทร์เสี้ยว — ไม่ล้อมรอบใบหน้าจนเหมือนหมวก)
  ctx.save();
  if (!ko) {
    ctx.shadowColor = th.aura;
    ctx.shadowBlur = 7;
  }
  ctx.fillStyle = th.hair;
  ctx.beginPath();
  ctx.arc(hx - r * 0.14, hy - r * 0.04, r * 1.04, Math.PI * 1.6, Math.PI * 0.46, true);
  ctx.closePath();
  ctx.fill();
  // ประกายบนผม (กันหัวดำเป็นก้อนเดียว)
  ctx.strokeStyle = th.hairHi;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(hx - r * 0.14, hy - r * 0.04, r * 1.02, Math.PI * 1.52, Math.PI * 0.36, true);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();

  // ใบหน้า
  const fg = ctx.createRadialGradient(hx + r * 0.55, hy - r * 0.35, r * 0.12, hx + r * 0.05, hy, r * 1.1);
  fg.addColorStop(0, th.skin);
  fg.addColorStop(1, th.skinShade);
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(hx + r * 0.28, hy + r * 0.12, r * 0.9, 0, Math.PI * 2);
  ctx.fill();

  // ปลายผมหน้าผาก (สั้น ไม่บังหน้า)
  ctx.fillStyle = th.hair;
  ctx.beginPath();
  ctx.moveTo(hx - r * 0.6, hy - r * 0.6);
  ctx.lineTo(hx - r * 0.05, hy - r * 0.92);
  ctx.lineTo(hx + r * 0.16, hy - r * 0.44);
  ctx.lineTo(hx + r * 0.52, hy - r * 0.72);
  ctx.lineTo(hx + r * 0.7, hy - r * 0.3);
  ctx.lineTo(hx + r * 0.1, hy - r * 0.4);
  ctx.closePath();
  ctx.fill();

  drawHair(th, hx, hy, r, t, vLocal);

  if (ko) {
    const ex = hx + r * 0.5, ey = hy + r * 0.02, s = r * 0.22;
    ctx.strokeStyle = "#241640";
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ex - s, ey - s); ctx.lineTo(ex + s, ey + s);
    ctx.moveTo(ex + s, ey - s); ctx.lineTo(ex - s, ey + s);
    ctx.stroke();
    return;
  }

  // ตาเรืองแสง
  ctx.fillStyle = "#0a1020";
  ctx.beginPath();
  ctx.ellipse(hx + r * 0.56, hy + r * 0.06, r * 0.29, r * 0.18, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.shadowColor = th.eye;
  ctx.shadowBlur = 10;
  ctx.fillStyle = th.eye;
  ctx.beginPath();
  ctx.arc(hx + r * 0.65, hy + r * 0.05, r * 0.115, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // คิ้ว
  ctx.strokeStyle = th.hair;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(hx + r * 0.3, hy - r * 0.3 + Math.sin(t * 0.07) * 0.7);
  ctx.lineTo(hx + r * 0.82, hy - r * 0.18);
  ctx.stroke();

  // ปาก
  ctx.strokeStyle = th.skinShade;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(hx + r * 0.5, hy + r * 0.56);
  ctx.lineTo(hx + r * 0.8, hy + r * 0.5);
  ctx.stroke();
}

// ---------- ออร่าไม้ตาย ----------
function drawAura(f, cy) {
  const rad = 62 + Math.sin(gameFrame * 0.45) * 10;
  const ag = ctx.createRadialGradient(0, cy, 4, 0, cy, rad);
  ag.addColorStop(0, "rgba(255,240,190,0.85)");
  ag.addColorStop(0.35, "rgba(255,196,90,0.55)");
  ag.addColorStop(0.7, "rgba(255,120,50,0.28)");
  ag.addColorStop(1, "rgba(255,80,40,0)");
  ctx.fillStyle = ag;
  ctx.beginPath();
  ctx.arc(0, cy, rad, 0, Math.PI * 2);
  ctx.fill();

  // ลำแสงพุ่งไปข้างหน้า (ทิศทางที่หัน)
  const beam = ctx.createLinearGradient(20, 0, 130, 0);
  beam.addColorStop(0, "rgba(255,225,140,0.5)");
  beam.addColorStop(1, "rgba(255,140,60,0)");
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(14, cy - 20);
  ctx.lineTo(130, cy - 38 - Math.sin(gameFrame * 0.3) * 6);
  ctx.lineTo(132, cy + 34 + Math.sin(gameFrame * 0.3) * 6);
  ctx.lineTo(14, cy + 20);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255,235,170,0.9)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const a0 = gameFrame * 0.1 + i * ((Math.PI * 2) / 3);
    ctx.beginPath();
    ctx.arc(0, cy, rad * 0.72, a0, a0 + 1.05);
    ctx.stroke();
  }
  // ลำแสงพุ่งขึ้น
  ctx.strokeStyle = "rgba(255,200,110,0.5)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const bx = -26 + i * 17;
    const len = 34 + Math.abs(Math.sin(gameFrame * 0.13 + i)) * 30;
    ctx.beginPath();
    ctx.moveTo(bx, 0);
    ctx.lineTo(bx + 3, -len);
    ctx.stroke();
  }
}

// ---------- ตัวละครทั้งตัว ----------
function drawFighter(f) {
  const th = f.theme;
  const t = gameFrame + f.index * 17;
  const P = buildPose(f, t);
  const ko = f.state === "ko";
  const superPose = f.state === "super";

  // เงา + วงแหวนพลังเมื่อเกจเต็ม
  ctx.save();
  if (f.meter >= 100 && !ko) {
    const pr = 26 + Math.sin(gameFrame * 0.12) * 3;
    ctx.strokeStyle = "rgba(255,215,94,0.5)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(f.x, GROUND_Y + 5, pr + 14, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = ko ? 0.25 : 0.4;
  ctx.fillStyle = "#05070f";
  ctx.beginPath();
  ctx.ellipse(f.x, GROUND_Y + 5, ko ? 54 : 28, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(f.x, f.y);
  if (superPose) {
    drawAura(f, -f.h * 0.5);
    if (f.stateTime < 12 && f.stateTime % 3 === 0) {
      spawnParticles(f.x + f.facing * 22, f.y - f.h * 0.6, 2, "#ffd75e");
    }
  }
  ctx.scale(f.facing, 1);
  if (ko) {
    ctx.translate(0, -15);
    ctx.rotate(-Math.PI / 2 * 0.94);
  }
  if (f.state === "hit") ctx.globalAlpha = 0.5 + 0.5 * ((f.stateTime % 4) < 2 ? 1 : 0.45);

  const grad = ctx.createLinearGradient(0, -f.h - 8, 0, 8);
  grad.addColorStop(0, th.trim);
  grad.addColorStop(0.26, th.main);
  grad.addColorStop(0.72, th.main);
  grad.addColorStop(1, th.deep);

  drawLeg(P.legB, th, grad, true);
  drawLeg(P.legF, th, grad, false);
  drawArm(P.armB, th, grad, true);
  drawTorso(P, th, grad);
  drawHead(P, th, f, t);
  drawArm(P.armF, th, grad, false);

  ctx.restore();
}

function drawBackground() {
  // ท้องฟ้าไล่ระดับ
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#12142b");
  sky.addColorStop(0.6, "#241f3f");
  sky.addColorStop(1, "#3a1f47");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // ดาว
  for (const s of stars) {
    ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(gameFrame * 0.02 + s.tw));
    ctx.fillStyle = "#cfe4ff";
    ctx.fillRect(s.x - cameraX * 0.2, s.y, s.s, s.s);
  }
  ctx.globalAlpha = 1;

  // ดวงอาทิตย์/จันทร์ใหญ่ neon
  ctx.fillStyle = "rgba(255,84,112,0.25)";
  ctx.beginPath();
  ctx.arc(W * 0.5 - cameraX * 0.1, 150, 90, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,84,112,0.5)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // ตึกเมือง parallax
  for (const b of buildings) {
    const bx = b.x - cameraX * 0.4;
    ctx.fillStyle = "#151a33";
    ctx.fillRect(bx, GROUND_Y - b.h, b.w, b.h);
    ctx.strokeStyle = `hsla(${b.hue}, 90%, 65%, 0.5)`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, GROUND_Y - b.h, b.w, b.h);
    // หน้าต่าง
    ctx.fillStyle = "rgba(120, 200, 255, 0.16)";
    for (let wy = GROUND_Y - b.h + 12; wy < GROUND_Y - 14; wy += 18) {
      for (let wx = bx + 8; wx < bx + b.w - 10; wx += 16) {
        if ((wx + wy) % 5 === 0) ctx.fillRect(wx, wy, 7, 9);
      }
    }
  }

  // พื้น
  const gr = ctx.createLinearGradient(0, GROUND_Y, 0, H);
  gr.addColorStop(0, "#232a4d");
  gr.addColorStop(1, "#12142b");
  ctx.fillStyle = gr;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  // เส้นเรืองแสงพื้น
  ctx.strokeStyle = "rgba(64,156,255,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(W, GROUND_Y);
  ctx.stroke();
  // ขีดบนพื้น
  ctx.strokeStyle = "rgba(64,156,255,0.2)";
  for (let x = -((cameraX * 0.7) % 60); x < W; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y + 4);
    ctx.lineTo(x - 20, H);
    ctx.stroke();
  }
}

// ---------------- วงจรเกมหลัก ----------------
function updateHud() {
  el.p1Health.style.transform = `scaleX(${fighter0.health / 100})`;
  el.p1Chip.style.width = `${fighter0.chipHealth}%`;
  el.p1Meter.style.width = `${fighter0.meter}%`;
  el.p1Meter.classList.toggle("full", fighter0.meter >= 100);
  el.p2Health.style.transform = `scaleX(${fighter1.health / 100})`;
  el.p2Chip.style.width = `${fighter1.chipHealth}%`;
  el.p2Meter.style.width = `${fighter1.meter}%`;
  el.p2Meter.classList.toggle("full", fighter1.meter >= 100);
  el.timer.textContent = Math.max(0, Math.ceil(roundTimeLeft));
}

function update(dtFrames) {
  gameFrame++;
  stateTimer++;

  // hit pause — ชนกันแล้วเกมดีเลย์สั้น ๆ ให้รู้สึกหนักแน่น
  if (hitPauseFrames > 0) { hitPauseFrames--; return; }

  // นับเวลาในฉากสู้
  if (matchState === "fighting") {
    timeAccumulator++;
    if (timeAccumulator >= 60) {
      timeAccumulator -= 60;
      roundTimeLeft = Math.max(0, roundTimeLeft - 1);
      if (roundTimeLeft === 0) {
        // หมดเวลา = ฝ่ายที่เลือดมากกว่าชนะ
        endRound(fighter0.health >= fighter1.health ? 1 : 0);
      }
    }
  }

  // จบ intro: เริ่มสู้จริง
  if (matchState === "intro" && stateTimer > 70) {
    matchState = "fighting";
    stateTimer = 0;
  }

  // ตรวจ K.O.
  if (matchState === "fighting") {
    if (fighter0.health <= 0) endRound(0);
    else if (fighter1.health <= 0) endRound(1);
  }

  if (matchState === "fighting" || matchState === "intro" || matchState === "roundEnd") {
    if (matchState === "fighting") {
      fighter0.update(playerInputs(0));
      fighter1.update(playerInputs(1));
      checkHits();
    } else {
      // ช่วง intro/end ให้ยืนเฉย ๆ
      for (const f of fighters) f.update({ left: false, right: false, jump: false, crouch: false, punch: false, kick: false, block: false, super: false });
    }
  }

  // กันตัวละครซ้อนกันติดกันเกินไป
  const dx = fighter1.x - fighter0.x;
  const overlap = (fighter0.w + fighter1.w) / 2 - Math.abs(dx);
  if (overlap > 0) {
    const push = overlap / 2 * Math.sign(dx || 1) * 0.5;
    fighter0.x -= push;
    fighter1.x += push;
    fighter0.x = Math.max(fighter0.w / 2 + 20, Math.min(STAGE_W - fighter0.w / 2 - 20, fighter0.x));
    fighter1.x = Math.max(fighter1.w / 2 + 20, Math.min(STAGE_W - fighter1.w / 2 - 20, fighter1.x));
  }

  // กล้อง
  const mid = (fighter0.x + fighter1.x) / 2;
  cameraX += (Math.max(0, Math.min(STAGE_W - W, mid - W / 2)) - cameraX) * 0.08;

  if (cameraShake > 0) cameraShake *= 0.85;

  // อนุภาค
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // จบรอบ: ถัดไปหลังดีเลย์
  if ((matchState === "roundEnd" || matchState === "matchEnd") && stateTimer > 130) {
    if (matchState === "matchEnd") {
      matchState = "menu";
      setPaused(false);
      stopBgm();                 // กลับเมนู = หยุดเพลงและกรอกลับต้น รอแมตช์ถัดไป
      el.menu.style.display = "flex";
      el.timer.textContent = "0";
    } else {
      startRound();
    }
  }

  updateHud();
}

function render() {
  ctx.save();
  const shakeX = (Math.random() - 0.5) * cameraShake;
  const shakeY = (Math.random() - 0.5) * cameraShake;
  ctx.translate(shakeX, shakeY);

  drawBackground();

  for (const f of fighters) drawFighter(f);

  // เอฟเฟกต์อนุภาค
  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life / 20);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.restore();
}

function loop() {
  if (paused) {
    render();                 // พักเกม: หยุดเวลา/ฟิสิกส์ แต่ยังวาดจอค้างไว้
  } else {
    update(1);
    render();
  }
  requestAnimationFrame(loop);
}
loop();

// ---------------- พักเกม: ปุ่ม + คีย์ลัด ----------------
el.pauseBtn.addEventListener("click", (e) => { e.stopPropagation(); togglePause(); });
el.soundBtn.addEventListener("click", (e) => { e.stopPropagation(); setMuted(!bgmMuted); });
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyP" || e.code === "Escape") { e.preventDefault(); togglePause(); }
});

// ---------------- เมนูเริ่ม ----------------
el.menu.addEventListener("click", (e) => {
  const btn = e.target.closest(".mode-btn");
  if (!btn) return;
  setPaused(false);
  gameMode = btn.dataset.mode;
  el.menu.style.display = "none";
  wins = [0, 0];
  roundNumber = 1;
  matchState = "intro";
  stateTimer = 0;
  roundTimeLeft = ROUND_TIME;
  fighter0.reset();
  fighter1.reset();
  el.roundLabel.textContent = "ROUND 1";
  startRound();
  try { ac().resume(); } catch (_) {}
});
