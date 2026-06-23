const canvas = document.getElementById("mycanvas");
const ctx = canvas.getContext("2d");

const BASE_W = 1280;
const BASE_H = 575;
let scaleX = 1,
  scaleY = 1;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  scaleX = canvas.width / BASE_W;
  scaleY = canvas.height / BASE_H;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

const SPRITE_DEFS = {
  p1Idle: { src: "warrior/IdleLeft.png", cols: 8, frames: 8 },
  p1Run: { src: "warrior/RunLeft.png", cols: 8, frames: 8 },
  p1Attack: { src: "warrior/Attack1Left.png", cols: 4, frames: 4 },
  p1Jump: { src: "warrior/JumpLeft.png", cols: 2, frames: 2 },
  p1Death: { src: "warrior/Death.png", cols: 6, frames: 6 },
  p2Idle: { src: "warrior2/IDLE.png", cols: 8, frames: 8 },
  p2Run: { src: "warrior2/RUN.png", cols: 8, frames: 8 },
  p2Attack: { src: "warrior2/ATTACK1.png", cols: 6, frames: 6 },
  p2Jump: { src: "warrior2/JUMP.png", cols: 2, frames: 2 },
  p2Death: { src: "warrior2/Death.png", cols: 6, frames: 6 },
};

const IMG = {};
for (const [key, def] of Object.entries(SPRITE_DEFS)) {
  IMG[key] = new Image();
  IMG[key].src = def.src;
}
const bgImg = new Image();
bgImg.src = "bg/background.png";

function getSpriteW(key) {
  const img = IMG[key];
  const def = SPRITE_DEFS[key];
  if (!img || !img.complete || !img.naturalWidth) return 0;
  return img.width / def.cols;
}
function getSpriteH(key) {
  const img = IMG[key];
  if (!img || !img.complete || !img.naturalHeight) return 0;
  return img.height;
}

// ----- Tuning fisika & gerak -----
const GRAVITY = 0.8;
const JUMP_POWER = -20;
const MOVE_SPEED = 7;
const ACCEL = 1.1;
const DECEL = 1.4;
const AIR_CONTROL = 0.7;
const GROUND_P1 = 270;
const GROUND_P2 = 235;
const MAX_HP = 600;
const ATK_DAMAGE = 15;
const FRAME_DELAY_P1 = 5;
const FRAME_DELAY_P2 = 3;
const ARENA_LEFT = -175;
const ARENA_RIGHT = BASE_W + 150;

const ROUNDS_TO_WIN = 3; // best of 5

const S = {
  IDLE: "idle",
  RUN: "run",
  JUMP: "jump",
  ATTACK: "attack",
  DEAD: "dead",
};

const GAME_STATE = {
  MENU: "menu",
  PLAYING: "playing",
  PAUSED: "paused",
  ROUND_OVER: "round_over",
  MATCH_OVER: "match_over",
};

const P1_IMG = {
  [S.IDLE]: "p1Idle",
  [S.RUN]: "p1Run",
  [S.ATTACK]: "p1Attack",
  [S.JUMP]: "p1Jump",
  [S.DEAD]: "p1Death",
};
const P2_IMG = {
  [S.IDLE]: "p2Idle",
  [S.RUN]: "p2Run",
  [S.ATTACK]: "p2Attack",
  [S.JUMP]: "p2Jump",
  [S.DEAD]: "p2Death",
};

// p1 = King,    spawn kanan, sprite asli menghadap KIRI
// p2 = Samurai, spawn kiri,  sprite asli menghadap KANAN
function makeP1() {
  return {
    x: BASE_W - 300,
    y: GROUND_P1,
    vx: 0,
    vy: 0,
    hp: MAX_HP,
    state: S.IDLE,
    frame: 0,
    frameTimer: 0,
    attackHit: false,
    keys: { left: false, right: false, up: false },
    groundY: GROUND_P1,
    scale: 2,
    imgKey: "p1Idle",
    frameDelay: FRAME_DELAY_P1,
    imgMap: P1_IMG,
    flipX: false, // false = gambar normal (menghadap kiri), true = flip (menghadap kanan)
  };
}
function makeP2() {
  return {
    x: 50,
    y: GROUND_P2,
    vx: 0,
    vy: 0,
    hp: MAX_HP,
    state: S.IDLE,
    frame: 0,
    frameTimer: 0,
    attackHit: false,
    keys: { left: false, right: false, up: false },
    groundY: GROUND_P2,
    scale: 2,
    imgKey: "p2Idle",
    frameDelay: FRAME_DELAY_P2,
    imgMap: P2_IMG,
    flipX: false, // false = gambar normal (menghadap kanan)
  };
}

let p1 = makeP1();
let p2 = makeP2();

let gameState = GAME_STATE.MENU;
let winner = ""; // pemenang ronde / match (nama)
let roundWins = { p1: 0, p2: 0 };
let currentRound = 1;
let roundOverTimer = 0;
const ROUND_OVER_DELAY = 1800; // ms sebelum lanjut ke ronde berikutnya

// ----- Delta time -----
let lastTime = 0;

function setPlayerState(p, newState) {
  if (p.state === S.DEAD) return;
  if (p.state === newState) return;
  p.state = newState;
  p.frame = 0;
  p.frameTimer = 0;
  p.imgKey = p.imgMap[newState];
}

function resolveIdle(p) {
  if (p.keys.left || p.keys.right) setPlayerState(p, S.RUN);
  else setPlayerState(p, S.IDLE);
}

function approach(current, target, rate) {
  if (current < target) return Math.min(current + rate, target);
  if (current > target) return Math.max(current - rate, target);
  return current;
}

function updatePlayer(p, spriteNaturalLeft, dt) {
  if (p.state === S.DEAD) {
    p.vx = approach(p.vx, 0, DECEL * dt);
    p.x += p.vx * dt;
    return;
  }

  const onGround = p.y >= p.groundY;

  if (p.state !== S.ATTACK) {
    let targetVx = 0;
    if (p.keys.left) {
      targetVx = -MOVE_SPEED;
      // jika sprite asli menghadap kiri: kiri=normal(false), kanan=flip(true)
      // jika sprite asli menghadap kanan: kiri=flip(true), kanan=normal(false)
      p.flipX = spriteNaturalLeft ? false : true;
    }
    if (p.keys.right) {
      targetVx = MOVE_SPEED;
      p.flipX = spriteNaturalLeft ? true : false;
    }

    // akselerasi/deselerasi halus alih-alih kecepatan instan -> gerak lebih smooth
    const rate =
      (targetVx === 0 ? DECEL : ACCEL) * (onGround ? 1 : AIR_CONTROL);
    p.vx = approach(p.vx, targetVx, rate * dt);
  } else {
    // saat menyerang, tetap melambat secara halus (tidak berhenti mendadak)
    p.vx = approach(p.vx, 0, DECEL * dt);
  }

  p.vy += GRAVITY * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  if (p.y >= p.groundY) {
    p.y = p.groundY;
    p.vy = 0;
    if (p.state === S.JUMP) resolveIdle(p);
  }

  p.x = Math.max(
    ARENA_LEFT,
    Math.min(ARENA_RIGHT - getSpriteW(p.imgKey) * p.scale, p.x),
  );

  if (p.state !== S.ATTACK && p.state !== S.JUMP) {
    if (p.keys.left || p.keys.right) {
      if (p.state !== S.RUN) setPlayerState(p, S.RUN);
    } else {
      if (p.state !== S.IDLE) setPlayerState(p, S.IDLE);
    }
  }

  const def = SPRITE_DEFS[p.imgKey];
  const totalFrames = def ? def.frames : 1;

  p.frameTimer += dt;
  if (p.frameTimer >= p.frameDelay) {
    p.frameTimer = 0;
    p.frame++;
    if (p.state === S.DEAD) {
      if (p.frame >= totalFrames) p.frame = totalFrames - 1;
    } else if (p.state === S.ATTACK) {
      if (p.frame >= totalFrames) {
        p.attackHit = false;
        resolveIdle(p);
      }
    } else if (p.state === S.JUMP) {
      if (p.frame >= totalFrames) p.frame = totalFrames - 1;
    } else {
      if (p.frame >= totalFrames) p.frame = 0;
    }
  }
}

function getHitBox(p) {
  const sw = getSpriteW(p.imgKey) * p.scale;
  const sh = getSpriteH(p.imgKey) * p.scale;
  return {
    x: p.x + sw * 0.3,
    y: p.y + sh * 0.25,
    width: sw * 0.35,
    height: sh * 0.65,
  };
}

function getAttackBox(p) {
  const sw = getSpriteW(p.imgKey) * p.scale;
  const sh = getSpriteH(p.imgKey) * p.scale;
  if (p.flipX) {
    return {
      x: p.x + sw * 0.3,
      y: p.y + sh * 0.3,
      width: sw * 0.7,
      height: sh * 0.4,
    };
  } else {
    return { x: p.x, y: p.y + sh * 0.3, width: sw * 0.7, height: sh * 0.4 };
  }
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function checkHits() {
  if (p1.state === S.ATTACK && !p1.attackHit) {
    if (rectsOverlap(getAttackBox(p1), getHitBox(p2))) {
      p2.hp = Math.max(0, p2.hp - ATK_DAMAGE);
      p1.attackHit = true;
    }
  }
  if (p2.state === S.ATTACK && !p2.attackHit) {
    if (rectsOverlap(getAttackBox(p2), getHitBox(p1))) {
      p1.hp = Math.max(0, p1.hp - ATK_DAMAGE);
      p2.attackHit = true;
    }
  }
}

function checkDeath() {
  if (p1.hp <= 0 && p1.state !== S.DEAD) {
    setPlayerState(p1, S.DEAD);
    p1.vx = 0;
    p1.vy = 0;
    p1.keys = { left: false, right: false, up: false };
    endRound("Samurai", "p2");
  }
  if (p2.hp <= 0 && p2.state !== S.DEAD) {
    setPlayerState(p2, S.DEAD);
    p2.vx = 0;
    p2.vy = 0;
    p2.keys = { left: false, right: false, up: false };
    endRound("King", "p1");
  }
}

function endRound(roundWinnerName, winnerKey) {
  if (gameState !== GAME_STATE.PLAYING) return;
  roundWins[winnerKey]++;
  winner = roundWinnerName;
  roundOverTimer = 0;

  if (roundWins[winnerKey] >= ROUNDS_TO_WIN) {
    gameState = GAME_STATE.MATCH_OVER;
  } else {
    gameState = GAME_STATE.ROUND_OVER;
  }
}

function nextRound() {
  currentRound++;
  const keepWins = roundWins;
  p1 = makeP1();
  p2 = makeP2();
  roundWins = keepWins;
  winner = "";
  gameState = GAME_STATE.PLAYING;
}

function restartMatch() {
  p1 = makeP1();
  p2 = makeP2();
  roundWins = { p1: 0, p2: 0 };
  currentRound = 1;
  winner = "";
  gameState = GAME_STATE.PLAYING;
}

function drawSprite(p) {
  const img = IMG[p.imgKey];
  const def = SPRITE_DEFS[p.imgKey];
  if (!img || !img.complete || !img.naturalWidth || !def) return;
  const sw = img.width / def.cols;
  const sh = img.height;
  const dw = sw * p.scale;
  const dh = sh * p.scale;
  const frame = Math.min(Math.floor(p.frame), def.frames - 1);

  ctx.save();
  if (p.flipX) {
    ctx.translate(p.x + dw, p.y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, frame * sw, 0, sw, sh, 0, 0, dw, dh);
  } else {
    ctx.drawImage(img, frame * sw, 0, sw, sh, p.x, p.y, dw, dh);
  }
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
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

function drawHealthBars() {
  const bw = 500,
    bh = 22,
    by = 50,
    r = 4,
    pad = 2;
  // King (p1) = bar KANAN, Samurai (p2) = bar KIRI
  const samX = 20;
  const kingX = BASE_W - 20 - bw;
  const rKing = p1.hp / MAX_HP; // king rasio hp
  const rSam = p2.hp / MAX_HP; // samurai rasio hp
  const getColor = (ratio) =>
    ratio > 0.5 ? "#e03333" : ratio > 0.25 ? "#e07a33" : "#e0c433";

  // background gelap
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  roundRect(samX - pad, by - pad, bw + pad * 2, bh + pad * 2, r + 1);
  ctx.fill();
  roundRect(kingX - pad, by - pad, bw + pad * 2, bh + pad * 2, r + 1);
  ctx.fill();

  // background bar kosong
  ctx.fillStyle = "#3a3a3a";
  roundRect(samX, by, bw, bh, r);
  ctx.fill();
  roundRect(kingX, by, bw, bh, r);
  ctx.fill();

  // bar samurai (p2): kiri, berkurang dari kanan
  ctx.fillStyle = getColor(rSam);
  roundRect(samX, by, bw * rSam, bh, r);
  ctx.fill();

  // bar king (p1): kanan, berkurang dari kiri
  ctx.fillStyle = getColor(rKing);
  roundRect(kingX + bw * (1 - rKing), by, bw * rKing, bh, r);
  ctx.fill();

  // border
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  roundRect(samX, by, bw, bh, r);
  ctx.stroke();
  roundRect(kingX, by, bw, bh, r);
  ctx.stroke();

  // label
  ctx.fillStyle = "white";
  ctx.font = 'bold 18px "Pixelify Sans", monospace';
  ctx.textAlign = "left";
  ctx.fillText("Samurai", samX, by - 8);
  ctx.textAlign = "right";
  ctx.fillText("King", kingX + bw, by - 8);
  ctx.textAlign = "left";

  // ----- Skor ronde (dot indicators) -----
  const dotR = 7;
  const dotGap = 20;
  // dots samurai (p2): di bawah bar kiri, berjejer ke kanan
  for (let i = 0; i < ROUNDS_TO_WIN; i++) {
    const cx = samX + dotR + i * dotGap;
    const cy = by + bh + 16;
    ctx.beginPath();
    ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
    ctx.fillStyle = i < roundWins.p2 ? "#e0c433" : "rgba(255,255,255,0.15)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // dots king (p1): di bawah bar kanan, berjejer ke kiri dari ujung kanan
  for (let i = 0; i < ROUNDS_TO_WIN; i++) {
    const cx = kingX + bw - dotR - i * dotGap;
    const cy = by + bh + 16;
    ctx.beginPath();
    ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
    ctx.fillStyle = i < roundWins.p1 ? "#e0c433" : "rgba(255,255,255,0.15)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // ----- Indikator ronde saat ini -----
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = 'bold 16px "Pixelify Sans", monospace';
  ctx.textAlign = "center";
  ctx.fillText(`ROUND ${currentRound}`, BASE_W / 2, by + 6);
  ctx.textAlign = "left";
}

function drawPanel(text, subtext) {
  const bw = 500,
    bh = subtext ? 110 : 80;
  const bx = BASE_W / 2 - bw / 2;
  const by = BASE_H / 2 - bh / 2;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 12);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = '44px "Pixelify Sans", monospace';
  ctx.textAlign = "center";
  ctx.fillText(text, BASE_W / 2, by + 50);
  if (subtext) {
    ctx.font = '20px "Pixelify Sans", monospace';
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText(subtext, BASE_W / 2, by + 86);
  }
  ctx.textAlign = "left";
}

function drawMenu() {
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, BASE_W, BASE_H);

  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = 'bold 64px "Pixelify Sans", monospace';
  ctx.fillText("Samurai vs King", BASE_W / 2, BASE_H / 2 - 60);

  ctx.font = '22px "Pixelify Sans", monospace';
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText("Best of 5 rounds", BASE_W / 2, BASE_H / 2 - 10);

  ctx.font = '18px "Pixelify Sans", monospace';
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.fillText(
    "Samurai (left): A/D move, W jump, Space attack",
    BASE_W / 2,
    BASE_H / 2 + 30,
  );
  ctx.fillText(
    "King (right): \u2190/\u2192 move, \u2191 jump, \u2193 attack",
    BASE_W / 2,
    BASE_H / 2 + 56,
  );

  ctx.font = 'bold 22px "Pixelify Sans", monospace';
  ctx.fillStyle = "#e0c433";
  ctx.fillText("Press ENTER or SPACE to Start", BASE_W / 2, BASE_H / 2 + 110);

  ctx.textAlign = "left";
}

function drawPause() {
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, BASE_W, BASE_H);
  drawPanel("Paused", "Press ESC or P to resume");
}

function drawRoundOver() {
  drawPanel(`${winner} wins Round ${currentRound}!`, "Get ready...");
}

function drawMatchOver() {
  const matchWinner = roundWins.p1 > roundWins.p2 ? "King" : "Samurai";
  drawPanel(
    `${matchWinner} wins the Match!`,
    `${roundWins.p1} - ${roundWins.p2}  |  Press R to play again`,
  );
}

function update(dt) {
  updatePlayer(p1, true, dt);
  updatePlayer(p2, false, dt);
  checkHits();
  checkDeath();
}

function loop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const rawDt = timestamp - lastTime;
  lastTime = timestamp;
  // dt dinormalisasi ke basis 60fps (1.0 = 1 frame di 60fps), di-clamp
  // supaya tab yang sempat tidak aktif / lag spike tidak membuat karakter "teleport"
  const dt = Math.min(rawDt / (1000 / 60), 2.5);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.drawImage(bgImg, 0, 0, BASE_W, BASE_H);

  if (gameState === GAME_STATE.PLAYING) {
    update(dt);
  } else if (gameState === GAME_STATE.ROUND_OVER) {
    // biarkan animasi kematian selesai, lalu lanjut ronde berikutnya
    if (p1.state === S.DEAD) updatePlayer(p1, true, dt);
    if (p2.state === S.DEAD) updatePlayer(p2, false, dt);
    roundOverTimer += rawDt;
    if (roundOverTimer >= ROUND_OVER_DELAY) {
      nextRound();
    }
  } else if (gameState === GAME_STATE.MATCH_OVER) {
    if (p1.state === S.DEAD) updatePlayer(p1, true, dt);
    if (p2.state === S.DEAD) updatePlayer(p2, false, dt);
  }
  // MENU & PAUSED: tidak update fisika sama sekali

  drawSprite(p1);
  drawSprite(p2);

  if (gameState !== GAME_STATE.MENU) {
    drawHealthBars();
  }

  if (gameState === GAME_STATE.MENU) drawMenu();
  else if (gameState === GAME_STATE.PAUSED) drawPause();
  else if (gameState === GAME_STATE.ROUND_OVER) drawRoundOver();
  else if (gameState === GAME_STATE.MATCH_OVER) drawMatchOver();

  requestAnimationFrame(loop);
}

function togglePause() {
  if (gameState === GAME_STATE.PLAYING) {
    gameState = GAME_STATE.PAUSED;
  } else if (gameState === GAME_STATE.PAUSED) {
    gameState = GAME_STATE.PLAYING;
    // hindari delta-time besar setelah pause lama
    lastTime = 0;
  }
}

document.addEventListener("keydown", (e) => {
  // ----- Menu start -----
  if (gameState === GAME_STATE.MENU) {
    if (e.code === "Enter" || e.code === "Space") {
      e.preventDefault();
      restartMatch();
      lastTime = 0;
    }
    return;
  }

  // ----- Pause toggle -----
  if (e.code === "Escape" || e.code === "KeyP") {
    if (gameState === GAME_STATE.PLAYING || gameState === GAME_STATE.PAUSED) {
      togglePause();
    }
    return;
  }

  if (gameState === GAME_STATE.PAUSED) return;

  // ----- Restart match -----
  if (e.code === "KeyR" && gameState === GAME_STATE.MATCH_OVER) {
    restartMatch();
    lastTime = 0;
    return;
  }

  if (gameState !== GAME_STATE.PLAYING) return;

  if (e.code === "ArrowLeft") p1.keys.left = true;
  if (e.code === "ArrowRight") p1.keys.right = true;
  if (
    e.code === "ArrowUp" &&
    !p1.keys.up &&
    p1.state !== S.JUMP &&
    p1.state !== S.DEAD
  ) {
    p1.keys.up = true;
    p1.vy = JUMP_POWER;
    setPlayerState(p1, S.JUMP);
  }
  if (e.code === "ArrowDown" && p1.state !== S.ATTACK && p1.state !== S.DEAD) {
    p1.attackHit = false;
    setPlayerState(p1, S.ATTACK);
  }

  if (e.code === "KeyA") p2.keys.left = true;
  if (e.code === "KeyD") p2.keys.right = true;
  if (
    e.code === "KeyW" &&
    !p2.keys.up &&
    p2.state !== S.JUMP &&
    p2.state !== S.DEAD
  ) {
    p2.keys.up = true;
    p2.vy = JUMP_POWER;
    setPlayerState(p2, S.JUMP);
  }
  if (e.code === "Space" && p2.state !== S.ATTACK && p2.state !== S.DEAD) {
    e.preventDefault();
    p2.attackHit = false;
    setPlayerState(p2, S.ATTACK);
  }
});

document.addEventListener("keyup", (e) => {
  if (e.code === "ArrowLeft") {
    p1.keys.left = false;
    if (p1.state === S.RUN) resolveIdle(p1);
  }
  if (e.code === "ArrowRight") {
    p1.keys.right = false;
    if (p1.state === S.RUN) resolveIdle(p1);
  }
  if (e.code === "ArrowUp") p1.keys.up = false;

  if (e.code === "KeyA") {
    p2.keys.left = false;
    if (p2.state === S.RUN) resolveIdle(p2);
  }
  if (e.code === "KeyD") {
    p2.keys.right = false;
    if (p2.state === S.RUN) resolveIdle(p2);
  }
  if (e.code === "KeyW") p2.keys.up = false;
});

IMG["p1Idle"].onload = () => {
  requestAnimationFrame(loop);
};
