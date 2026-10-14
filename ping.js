// ping.js - complete, smooth, with sound effects and glowing ball trail

// Canvas setup
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = 720;
canvas.height = 480;

// --- Game constants and state
let paddleHeight = 20;
const basePaddleWidth = 120;
let paddleBottomWidth = basePaddleWidth;
let paddleTopWidth = basePaddleWidth;
let paddleBottomX = (canvas.width - paddleBottomWidth) / 2;
let paddleTopX = (canvas.width - paddleTopWidth) / 2;

let ballRadius = 16;
let balls = [
  {
    x: canvas.width / 2,
    y: canvas.height / 2,
    dx: 2.5,
    dy: 2.5,
    lastHit: null,
    trail: [], // ensure trail exists
  },
];

let rightPressed = false;
let leftPressed = false;
let paused = false;
let mode = "AI"; // "AI" or "LOCAL"

let scoreP1 = 0;
let scoreP2 = 0;

let paddleBottomSpeed = 6;
let paddleTopSpeed = 6;

let powerUps = [];
const powerTypes = [
  { type: "multiply", color: "purple", symbol: "×" },
  { type: "pause", color: "red", symbol: "⏸" },
  { type: "fast", color: "green", symbol: "⏩" },
  { type: "cancel", color: "black", symbol: "✖" },
  { type: "minus", color: "orange", symbol: "−" },
  { type: "plus", color: "blue", symbol: "+" },
];

// --- Sound effects setup
const SFX_PATH = "assets/sfx/";
const SFX_FILES = {
  paddleHit: "paddle_hit.wav",
  wallBounce: "wall_bounce.wav",
  powerSpawn: "power_spawn.wav",
  powerCollect: "power_collect.wav",
  gameOver: "game_over.wav",
  uiClick: "ui_click.wav",
  explosion: "explosion.wav",
};
const sfx = {};
let sfxUnlocked = false;
for (const [key, file] of Object.entries(SFX_FILES)) {
  const audio = new Audio(SFX_PATH + file);
  audio.preload = "auto";
  audio.volume = 0.8;
  sfx[key] = audio;
}
function unlockSfx() {
  if (sfxUnlocked) return;
  try {
    sfx.uiClick.play().catch(() => {});
  } catch {}
  sfxUnlocked = true;
}
window.addEventListener("pointerdown", unlockSfx, { once: true });
window.addEventListener("keydown", unlockSfx, { once: true });

// --- Manage active sounds
let activeSounds = [];
function playSfx(name, { volume = 1, rate = 1 } = {}) {
  const src = sfx[name];
  if (!src) return;
  const clone = src.cloneNode();
  clone.volume = src.volume * volume;
  clone.playbackRate = rate;
  clone.play().catch(() => {});
  activeSounds.push(clone);
  clone.addEventListener("ended", () => {
    const idx = activeSounds.indexOf(clone);
    if (idx !== -1) activeSounds.splice(idx, 1);
  });
}
function stopAllSfx() {
  activeSounds.forEach((sound) => {
    try {
      sound.pause();
      sound.currentTime = 0;
    } catch {}
  });
  activeSounds = [];
}

// track last positions for momentum
window.lastBottomX = paddleBottomX;
window.lastTopX = paddleTopX;

// --- Helpers
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

// --- Score pulse helper
function updateScore(playerEl, newScore) {
  if (!playerEl) return;
  playerEl.textContent = newScore;
  playerEl.classList.add("scored");
  setTimeout(() => playerEl.classList.remove("scored"), 600);
}

// --- Drawing functions
function drawPaddle(px, py, width) {
  const grad = ctx.createLinearGradient(px, py, px, py + paddleHeight);
  grad.addColorStop(0, "#f6f7f8");
  grad.addColorStop(0.5, "#cfd6da");
  grad.addColorStop(1, "#9aa3a8");
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 12;
  if (ctx.roundRect) {
    ctx.fillStyle = grad;
    ctx.roundRect(px, py, width, paddleHeight, 10);
    ctx.fill();
  } else {
    ctx.fillStyle = grad;
    ctx.fillRect(px, py, width, paddleHeight);
  }
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  if (ctx.roundRect) {
    ctx.roundRect(px + 4, py + 3, width - 8, paddleHeight / 2, 8);
    ctx.fill();
  } else {
    ctx.fillRect(px + 4, py + 3, width - 8, paddleHeight / 2);
  }
  ctx.restore();
}

function drawBall(ball) {
  ctx.save();
  ctx.beginPath();
  ctx.shadowColor = "#00f0ff";
  ctx.shadowBlur = 20;
  const g = ctx.createRadialGradient(
    ball.x - 3,
    ball.y - 3,
    2,
    ball.x,
    ball.y,
    ballRadius
  );
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.6, "#bffcff");
  g.addColorStop(1, "#00a6b0");
  ctx.fillStyle = g;
  ctx.arc(ball.x, ball.y, ballRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// --- Trail drawing helper
function drawTrail(ball) {
  if (!ball.trail || ball.trail.length === 0) return;
  ctx.save();
  // draw from oldest to newest so newest is on top
  for (let i = 0; i < ball.trail.length; i++) {
    const pos = ball.trail[i];
    const t = i / ball.trail.length; // 0..1
    const alpha = t * 0.6; // tweak max opacity
    ctx.beginPath();
    ctx.fillStyle = `rgba(0, 240, 255, ${alpha})`; // cyan glow
    ctx.shadowColor = "#00f0ff";
    ctx.shadowBlur = 20 * t; // stronger blur for newer points
    const radius = ballRadius * (1.2 - 0.2 * (1 - t));
    ctx.arc(pos.x, pos.y, Math.max(1, radius), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// --- PowerUp class
class PowerUp {
  constructor(typeObj) {
    this.type = typeObj.type;
    this.color = typeObj.color;
    this.symbol = typeObj.symbol;
    this.x = Math.random() < 0.5 ? -30 : canvas.width + 30;
    this.y = 30 + Math.random() * (canvas.height - 60);
    this.vx = (Math.random() * 1.6 + 0.8) * (this.x < 0 ? 1 : -1);
    this.vy = (Math.random() - 0.5) * 1.4;
    this.active = true;
  }
  draw() {
    ctx.save();
    ctx.beginPath();
    ctx.globalAlpha = 0.98;
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 14;
    ctx.arc(this.x, this.y, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.closePath();
    ctx.fillStyle = "#fff";
    ctx.font = "22px Segoe UI";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.symbol, this.x, this.y);
    ctx.restore();
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    if (this.y < 18 || this.y > canvas.height - 18) this.vy *= -1;
    if (this.x < -60 || this.x > canvas.width + 60) this.active = false;
  }
}

// --- Power-up spawning
(function spawnLoop() {
  if (powerUps.length === 0) {
    const typeObj = powerTypes[Math.floor(Math.random() * powerTypes.length)];
    powerUps.push(new PowerUp(typeObj));
    playSfx("powerSpawn");
  }
  setTimeout(spawnLoop, 1500 + Math.random() * 4500);
})();

// --- UI wiring
const pauseBtn = document.getElementById("pauseBtn");
const restartBtn = document.getElementById("restartBtn");
const modeAI = document.getElementById("modeAI");
const modeLocal = document.getElementById("modeLocal");
const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");
const scoreP1El = document.getElementById("scoreP1");
const scoreP2El = document.getElementById("scoreP2");

function setActiveModeUI() {
  if (modeAI) modeAI.classList.toggle("active", mode === "AI");
  if (modeLocal) modeLocal.classList.toggle("active", mode === "LOCAL");
  if (modeAI) modeAI.setAttribute("aria-pressed", mode === "AI");
  if (modeLocal) modeLocal.setAttribute("aria-pressed", mode === "LOCAL");
}

if (modeAI) {
  modeAI.addEventListener("click", () => {
    mode = "AI";
    setActiveModeUI();
    resetGame();
    playSfx("uiClick");
  });
}
if (modeLocal) {
  modeLocal.addEventListener("click", () => {
    mode = "LOCAL";
    setActiveModeUI();
    resetGame();
    playSfx("uiClick");
  });
}

let gameOverTimeout = null;

if (pauseBtn) {
  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    pauseBtn.textContent = paused ? "Resume" : "Pause";
    playSfx("uiClick");
    if (paused) stopAllSfx();
  });
}

if (restartBtn) {
  restartBtn.addEventListener("click", () => {
    if (gameOverTimeout) {
      clearTimeout(gameOverTimeout);
      gameOverTimeout = null;
    }
    scoreP1 = 0;
    scoreP2 = 0;
    if (scoreP1El) scoreP1El.textContent = scoreP1;
    if (scoreP2El) scoreP2El.textContent = scoreP2;
    stopAllSfx();
    resetGame();
    playSfx("uiClick");
  });
}

// touch buttons (pointer-friendly)
if (leftBtn) {
  leftBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    leftPressed = true;
    playSfx("uiClick", { volume: 0.6 });
  });
  leftBtn.addEventListener("pointerup", (e) => {
    e.preventDefault();
    leftPressed = false;
  });
  leftBtn.addEventListener("pointercancel", () => (leftPressed = false));
}
if (rightBtn) {
  rightBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    rightPressed = true;
    playSfx("uiClick", { volume: 0.6 });
  });
  rightBtn.addEventListener("pointerup", (e) => {
    e.preventDefault();
    rightPressed = false;
  });
  rightBtn.addEventListener("pointercancel", () => (rightPressed = false));
}

// keyboard controls
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") rightPressed = true;
  if (e.key === "ArrowLeft") leftPressed = true;
  if (mode === "LOCAL") {
    if (e.key === "a" || e.key === "A") paddleTopX -= paddleTopSpeed;
    if (e.key === "d" || e.key === "D") paddleTopX += paddleTopSpeed;
  }
  if (e.key === " ") {
    paused = !paused;
    if (pauseBtn) pauseBtn.textContent = paused ? "Resume" : "Pause";
    if (paused) stopAllSfx();
  }
});
document.addEventListener("keyup", (e) => {
  if (e.key === "ArrowRight") rightPressed = false;
  if (e.key === "ArrowLeft") leftPressed = false;
});

// pointer dragging for both paddles
let dragging = null;
canvas.addEventListener("pointerdown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
  if (cy > canvas.height * 0.55) {
    dragging = "bottom";
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}
  } else if (cy < canvas.height * 0.45) {
    dragging = "top";
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
  if (dragging === "bottom") {
    paddleBottomX = clamp(
      cx - paddleBottomWidth / 2,
      0,
      canvas.width - paddleBottomWidth
    );
  } else if (dragging === "top") {
    paddleTopX = clamp(
      cx - paddleTopWidth / 2,
      0,
      canvas.width - paddleTopWidth
    );
  }
});
canvas.addEventListener("pointerup", (e) => {
  dragging = null;
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {}
});
canvas.addEventListener("pointercancel", () => {
  dragging = null;
});

// --- Game logic: collisions, scoring, powerups
function showGameOver(loser) {
  stopAllSfx();
  playSfx("gameOver");
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ff3333";
  ctx.font = "32px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 20);
  ctx.fillStyle = "#00f0ff";
  ctx.font = "18px Segoe UI";
  ctx.fillText(
    `${loser} loses this round`,
    canvas.width / 2,
    canvas.height / 2 + 14
  );
  ctx.restore();

  if (gameOverTimeout) {
    clearTimeout(gameOverTimeout);
    gameOverTimeout = null;
  }
  gameOverTimeout = setTimeout(() => {
    gameOverTimeout = null;
    resetGame();
  }, 1500);
}

function applyPowerUp(player, type) {
  // player is "P1" (bottom) or "P2" (top)
  if (type === "multiply") {
    // create two temporary extra balls (so total becomes 3)
    const newBalls = [];
    for (let i = 0; i < 2; i++) {
      const nb = {
        x: canvas.width / 2,
        y: canvas.height / 2,
        dx: 1.2 * (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 0.4),
        dy: 1.2 * (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 0.4),
        lastHit: player,
        trail: [], // ensure trail exists for the new balls
      };
      balls.push(nb);
      newBalls.push(nb);
    }
    playSfx("powerCollect");
    canvas.style.boxShadow = "0 0 60px rgba(0,240,255,.8)";

    setTimeout(() => {
      canvas.style.boxShadow =
        "0 20px 80px rgba(0, 240, 255, 0.18), inset 0 2px 8px rgba(255,255,255,0.04)";
    }, 200);

    // remove the extra balls after 5 seconds
    setTimeout(() => {
      for (const nb of newBalls) {
        const idx = balls.indexOf(nb);
        if (idx !== -1) balls.splice(idx, 1);
      }
    }, 5000);

    return;
  }

  if (type === "pause") {
    if (player === "P1") {
      paddleTopSpeed = Math.max(1, paddleTopSpeed * 0.45);
      setTimeout(() => {
        paddleTopSpeed = 6;
      }, 5000);
    } else {
      paddleBottomSpeed = Math.max(1, paddleBottomSpeed * 0.45);
      setTimeout(() => {
        paddleBottomSpeed = 6;
      }, 5000);
    }
    playSfx("powerCollect");
    canvas.style.boxShadow = "0 0 60px rgba(0,240,255,.8)";

    setTimeout(() => {
      canvas.style.boxShadow =
        "0 20px 80px rgba(0, 240, 255, 0.18), inset 0 2px 8px rgba(255,255,255,0.04)";
    }, 200);
    return;
  }

  if (type === "fast") {
    if (player === "P1") {
      paddleBottomSpeed = 12;
      setTimeout(() => {
        paddleBottomSpeed = 6;
      }, 5000);
    } else {
      paddleTopSpeed = 12;
      setTimeout(() => {
        paddleTopSpeed = 6;
      }, 5000);
    }
    playSfx("powerCollect");
    canvas.style.boxShadow = "0 0 60px rgba(0,240,255,.8)";

    setTimeout(() => {
      canvas.style.boxShadow =
        "0 20px 80px rgba(0, 240, 255, 0.18), inset 0 2px 8px rgba(255,255,255,0.04)";
    }, 200);
    return;
  }

  if (type === "cancel") {
    playSfx("explosion");
    if (player === "P1") {
      scoreP2++;
      updateScore(scoreP2El, scoreP2);
      showGameOver("Player 1");
    } else {
      scoreP1++;
      updateScore(scoreP1El, scoreP1);
      showGameOver("Player 2");
    }
    return;
  }

  if (type === "minus") {
    // shrink opponent paddle
    if (player === "P1") {
      paddleTopWidth = Math.max(40, paddleTopWidth * 0.8);
      setTimeout(() => {
        paddleTopWidth = basePaddleWidth;
      }, 5000);
    } else {
      paddleBottomWidth = Math.max(40, paddleBottomWidth * 0.8);
      setTimeout(() => {
        paddleBottomWidth = basePaddleWidth;
      }, 5000);
    }
    playSfx("powerCollect");
    canvas.style.boxShadow = "0 0 60px rgba(0,240,255,.8)";

    setTimeout(() => {
      canvas.style.boxShadow =
        "0 20px 80px rgba(0, 240, 255, 0.18), inset 0 2px 8px rgba(255,255,255,0.04)";
    }, 200);
    return;
  }

  if (type === "plus") {
    // enlarge hitter paddle
    if (player === "P1") {
      paddleBottomWidth = Math.min(canvas.width, paddleBottomWidth * 1.2);
      setTimeout(() => {
        paddleBottomWidth = basePaddleWidth;
      }, 3000);
    } else {
      paddleTopWidth = Math.min(canvas.width, paddleTopWidth * 1.2);
      setTimeout(() => {
        paddleTopWidth = basePaddleWidth;
      }, 5000);
    }
    playSfx("powerCollect");
    canvas.style.boxShadow = "0 0 60px rgba(0,240,255,.8)";

    setTimeout(() => {
      canvas.style.boxShadow =
        "0 20px 80px rgba(0, 240, 255, 0.18), inset 0 2px 8px rgba(255,255,255,0.04)";
    }, 200);
    return;
  }
}

function handleBallCollisionsAndScoring(ball) {
  const paddleBottomVel = paddleBottomX - window.lastBottomX;
  const paddleTopVel = paddleTopX - window.lastTopX;
  window.lastBottomX = paddleBottomX;
  window.lastTopX = paddleTopX;

  // left/right wall bounce
  if (ball.x - ballRadius <= 0) {
    ball.x = ballRadius;
    ball.dx = Math.abs(ball.dx);
    playSfx("wallBounce");
  } else if (ball.x + ballRadius >= canvas.width) {
    ball.x = canvas.width - ballRadius;
    ball.dx = -Math.abs(ball.dx);
    playSfx("wallBounce");
  }

  // Bottom paddle collision (P1)
  if (
    ball.y + ballRadius >= canvas.height - paddleHeight - 6 &&
    ball.y - ballRadius < canvas.height
  ) {
    if (
      ball.x > paddleBottomX &&
      ball.x < paddleBottomX + paddleBottomWidth &&
      ball.dy > 0
    ) {
      const hitPos =
        (ball.x - (paddleBottomX + paddleBottomWidth / 2)) /
        (paddleBottomWidth / 2);
      const speed = Math.hypot(ball.dx, ball.dy) * 1.02;
      const angle = hitPos * (Math.PI / 3) - Math.PI / 2;
      ball.dx = speed * Math.cos(angle) + paddleBottomVel * 0.35;
      ball.dy =
        -Math.abs(speed * Math.sin(angle)) *
        (1 + Math.abs(paddleBottomVel) * 0.06);
      ball.lastHit = "P1";
      ball.y = canvas.height - paddleHeight - 6 - ballRadius - 1;
      playSfx("paddleHit");
      canvas.style.filter = "brightness(1.3)";

      setTimeout(() => {
        canvas.style.filter = "brightness(1)";
      }, 80);
    }
  }

  // Top paddle collision (P2)
  if (ball.y - ballRadius <= paddleHeight + 6 && ball.y + ballRadius > 0) {
    if (
      ball.x > paddleTopX &&
      ball.x < paddleTopX + paddleTopWidth &&
      ball.dy < 0
    ) {
      const hitPos =
        (ball.x - (paddleTopX + paddleTopWidth / 2)) / (paddleTopWidth / 2);
      const speed = Math.hypot(ball.dx, ball.dy) * 1.02;
      const angle = hitPos * (Math.PI / 3) + Math.PI / 2;
      ball.dx = speed * Math.cos(angle) + paddleTopVel * 0.35;
      ball.dy =
        Math.abs(speed * Math.sin(angle)) * (1 + Math.abs(paddleTopVel) * 0.06);
      ball.lastHit = "P2";
      ball.y = paddleHeight + 6 + ballRadius + 1;
      playSfx("paddleHit");
      canvas.style.filter = "brightness(1.3)";

      setTimeout(() => {
        canvas.style.filter = "brightness(1)";
      }, 80);
    }
  }

  // Scoring
  if (ball.y - ballRadius > canvas.height) {
    scoreP2++;
    updateScore(scoreP2El, scoreP2);
    showGameOver("Player 1");
    return true;
  } else if (ball.y + ballRadius < 0) {
    scoreP1++;
    updateScore(scoreP1El, scoreP1);
    showGameOver("Player 2");
    return true;
  }
  return false;
}

function checkPowerUpCollisions(ball) {
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const pu = powerUps[i];
    if (!pu.active) continue;
    const dxPU = ball.x - pu.x;
    const dyPU = ball.y - pu.y;
    const dist = Math.hypot(dxPU, dyPU);
    if (dist <= ballRadius + 20) {
      const owner = ball.lastHit
        ? ball.lastHit
        : ball.y > canvas.height / 2
        ? "P1"
        : "P2";
      applyPowerUp(owner, pu.type);
      pu.active = false;
      powerUps.splice(i, 1);
    }
  }
}

function updateAndDrawPowerUps() {
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const pu = powerUps[i];
    if (!pu.active) {
      powerUps.splice(i, 1);
      continue;
    }
    pu.update();
    pu.draw();
  }
}

function aiMove() {
  if (mode !== "AI") return;
  if (balls.length === 0) return;
  let target = balls[0];
  for (let b of balls) {
    if (b.y < target.y) target = b;
  }
  const predictX = target.x + target.dx * 8;
  const center = paddleTopX + paddleTopWidth / 2;
  const delta = predictX - center;
  paddleTopX += delta * 0.06 * (paddleTopSpeed / 6);
  paddleTopX = clamp(paddleTopX, 0, canvas.width - paddleTopWidth);
}

function updatePaddles() {
  if (rightPressed && paddleBottomX < canvas.width - paddleBottomWidth)
    paddleBottomX += paddleBottomSpeed;
  if (leftPressed && paddleBottomX > 0) paddleBottomX -= paddleBottomSpeed;
  paddleBottomX = clamp(paddleBottomX, 0, canvas.width - paddleBottomWidth);

  if (mode === "LOCAL") {
    paddleTopX = clamp(paddleTopX, 0, canvas.width - paddleTopWidth);
  } else {
    aiMove();
  }
}

function resetGame() {
  if (gameOverTimeout) {
    clearTimeout(gameOverTimeout);
    gameOverTimeout = null;
  }
  balls = [
    {
      x: canvas.width / 2,
      y: canvas.height / 2,
      dx: 2.5 * (Math.random() < 0.5 ? -1 : 1),
      dy: 2.5 * (Math.random() < 0.5 ? -1 : 1),
      lastHit: null,
      trail: [],
    },
  ];
  paddleBottomWidth = basePaddleWidth;
  paddleTopWidth = basePaddleWidth;
  paddleBottomX = (canvas.width - paddleBottomWidth) / 2;
  paddleTopX = (canvas.width - paddleTopWidth) / 2;
  paddleBottomSpeed = 6;
  paddleTopSpeed = 6;
  powerUps = [];
  paused = false;
  if (pauseBtn) pauseBtn.textContent = "Pause";
  if (scoreP1El) scoreP1El.textContent = scoreP1;
  if (scoreP2El) scoreP2El.textContent = scoreP2;
  requestAnimationFrame(draw);
}

function draw() {
  if (paused) {
    requestAnimationFrame(draw);
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // subtle background grid
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.strokeStyle = "#00f0ff";
  ctx.lineWidth = 1;
  for (let i = 1; i < 12; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (canvas.height / 12) * i);
    ctx.lineTo(canvas.width, (canvas.height / 12) * i);
    ctx.stroke();
  }
  ctx.restore();

  updatePaddles();

  drawPaddle(
    paddleBottomX,
    canvas.height - paddleHeight - 6,
    paddleBottomWidth
  );
  drawPaddle(paddleTopX, 6, paddleTopWidth);

  updateAndDrawPowerUps();

  for (let i = balls.length - 1; i >= 0; i--) {
    const ball = balls[i];

    // ensure trail exists
    if (!ball.trail) ball.trail = [];

    // push current position into trail BEFORE moving the ball
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 12) ball.trail.shift(); // keep last 12 positions

    // draw trail then ball
    drawTrail(ball);
    drawBall(ball);

    // move ball after drawing the trail snapshot
    ball.x += ball.dx;
    ball.y += ball.dy;

    const roundEnded = handleBallCollisionsAndScoring(ball);
    if (roundEnded) return;

    checkPowerUpCollisions(ball);
  }

  paddleBottomX = clamp(paddleBottomX, 0, canvas.width - paddleBottomWidth);
  paddleTopX = clamp(paddleTopX, 0, canvas.width - paddleTopWidth);

  requestAnimationFrame(draw);
}

// start
setActiveModeUI && setActiveModeUI();
let gameStarted = false;

resetGame();

// --- Button visual effects (ripple + pressed)
function attachButtonEffects(selector) {
  document.querySelectorAll(selector).forEach((btn) => {
    let rc = btn.querySelector(".btn-ripple");
    if (!rc) {
      rc = document.createElement("span");
      rc.className = "btn-ripple";
      btn.appendChild(rc);
    }

    btn.addEventListener("pointerdown", (e) => {
      btn.classList.add("pressed");
      const rect = btn.getBoundingClientRect();
      const r = document.createElement("span");
      r.className = "ripple";
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      r.style.left = x - 4 + "px";
      r.style.top = y - 4 + "px";
      rc.appendChild(r);
      r.addEventListener("animationend", () => r.remove());
    });

    ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => {
      btn.addEventListener(ev, () => btn.classList.remove("pressed"));
    });

    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") btn.classList.add("pressed");
    });
    btn.addEventListener("keyup", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        btn.classList.remove("pressed");
        btn.click();
      }
    });
  });
}
attachButtonEffects(".mode-btn, .control-btn, .touch-btn");

// expose debug helpers (optional)
window.__game = {
  resetGame,
  playSfx,
  stopAllSfx,
  powerUps,
  balls,
};

/* MOBILE DRAG CONTROL */

canvas.addEventListener(
  "touchmove",
  (e) => {
    const rect = canvas.getBoundingClientRect();

    const touchX = e.touches[0].clientX - rect.left;

    paddleBottomX = touchX - paddleBottomWidth / 2;

    paddleBottomX = clamp(paddleBottomX, 0, canvas.width - paddleBottomWidth);
  },
  {
    passive: true,
  }
);
``;
