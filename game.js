// ── Star background ──────────────────────────────────────────────────────────
const starCanvas = document.getElementById("stars");
starCanvas.width = window.innerWidth;
starCanvas.height = window.innerHeight;
const starCtx = starCanvas.getContext("2d");

const stars = Array.from({ length: 200 }, () => ({
  x: Math.random() * starCanvas.width,
  y: Math.random() * starCanvas.height,
  size: Math.random() * 1.5 + 0.3,
  speed: Math.random() * 0.4 + 0.1
}));

function drawStars() {
  starCtx.clearRect(0, 0, starCanvas.width, starCanvas.height);
  for (const star of stars) {
    star.y += star.speed;
    if (star.y > starCanvas.height) { star.y = 0; star.x = Math.random() * starCanvas.width; }
    starCtx.fillStyle = `rgba(255,255,255,${0.3 + star.size * 0.3})`;
    starCtx.beginPath();
    starCtx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    starCtx.fill();
  }
  requestAnimationFrame(drawStars);
}
drawStars();

// ── Canvas setup ─────────────────────────────────────────────────────────────
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

// ── Persistent data ───────────────────────────────────────────────────────────
let coins = parseInt(localStorage.getItem("coins")) || 0;
let best = parseInt(localStorage.getItem("highScore")) || 0;
let selectedSkin = localStorage.getItem("skin") || "green";

// Upgrades reset each run; purchases happen in shop
let ownedUpgrades = { extraLife: 0, speed: 0, damage: 0 };

const upgradeDefs = {
  extraLife: { label: "+1 Life",    baseCost: 150, scale: 1.8, max: 5 },
  speed:     { label: "Speed +15%", baseCost: 200, scale: 1.6, max: 6 },
  damage:    { label: "Damage +",   baseCost: 250, scale: 1.7, max: 6 }
};

const SKINS = {
  green:  { body: "#00ff88", cockpit: "#00ccff", glow: "#00ff88" },
  cyan:   { body: "#00eeff", cockpit: "#ffffff", glow: "#00ccff" },
  purple: { body: "#cc44ff", cockpit: "#ff88ff", glow: "#aa00ff" },
  red:    { body: "#ff3322", cockpit: "#ffaa44", glow: "#ff2200" }
};

// ── Game state ────────────────────────────────────────────────────────────────
let state = "title";
let score = 0, wave = 1, lives = 3;
let player, bullets = [], enemies = [], enemyBullets = [], particles = [], drops = [], coinTexts = [];
let keys = {}, shootCooldown = 0;
let enemyDir = 1, enemySpeed = 1, enemyShootTimer = 0, bossPresent = false;
let shopButtons = [];

// ── Power-ups ─────────────────────────────────────────────────────────────────
const POWERUP_DURATION = 600;
const powerups = { doubleShot: 0, shield: 0, speed: 0, explosive: 0 };
const POWERUP_COLORS = { doubleShot: "#ffdd00", shield: "#00ccff", speed: "#00ff88", explosive: "#ff4422" };
const POWERUP_LABELS = { doubleShot: "2X SHOT", shield: "SHIELD", speed: "SPEED", explosive: "BOOM" };
const DROP_TYPES = ["doubleShot", "shield", "speed", "explosive"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function saveCoins() { localStorage.setItem("coins", coins); }
function saveBest()  { localStorage.setItem("highScore", best); }
function saveSkin()  { localStorage.setItem("skin", selectedSkin); }

function getUpgradeCost(key) {
  return Math.floor(upgradeDefs[key].baseCost * Math.pow(upgradeDefs[key].scale, ownedUpgrades[key]));
}

function buyUpgrade(key) {
  const def = upgradeDefs[key];
  if (ownedUpgrades[key] >= def.max) return;
  const cost = getUpgradeCost(key);
  if (coins >= cost) { coins -= cost; ownedUpgrades[key]++; saveCoins(); }
}

function addButton(x, y, w, h, onClick) { shopButtons.push({ x, y, w, h, onClick }); }
function updateLives() { document.getElementById("lv").textContent = "❤️".repeat(Math.max(0, lives)); }
function showMsg(text) { document.getElementById("msg").textContent = text; }
function clearMsg()    { document.getElementById("msg").textContent = ""; }

// ── Start run ─────────────────────────────────────────────────────────────────
function startRun() {
  score = 0; wave = 1;
  lives = 3 + ownedUpgrades.extraLife;
  bullets = []; enemies = []; enemyBullets = []; particles = []; drops = []; coinTexts = [];
  shootCooldown = 0; enemyShootTimer = 0;
  for (const k in powerups) powerups[k] = 0;

  player = {
    x: W / 2 - 22, y: H - 50, w: 44, h: 28,
    speed: 3 * (1 + ownedUpgrades.speed * 0.15)
  };

  spawnWave();
  document.getElementById("sc").textContent = score;
  document.getElementById("hi").textContent = best;
  document.getElementById("wv").textContent = wave;
  updateLives();
  clearMsg();
  state = "playing";
}

// ── Spawn wave ────────────────────────────────────────────────────────────────
function spawnWave() {
  enemies = [];
  enemyDir = 1;
  enemySpeed = 0.4 + wave * 0.15;
  enemyShootTimer = 0;
  bossPresent = false;

  if (wave % 5 === 0) {
    bossPresent = true;
    enemies.push({
      x: W / 2 - 40, y: 60, w: 80, h: 50,
      hp: 10 + wave * 3, maxHp: 10 + wave * 3,
      type: "boss", dir: 1, speed: 1.5
    });
    return;
  }

  const specialWave = wave % 7 === 0 ? "swarm" : wave % 6 === 0 ? "tank" : "normal";

  if (specialWave === "swarm") {
    const count = 20 + wave * 2;
    const cols = 10;
    for (let i = 0; i < count; i++) {
      enemies.push({
        x: 30 + (i % cols) * 55, y: 30 + Math.floor(i / cols) * 28,
        w: 14, h: 14, hp: 1, maxHp: 1,
        type: "swarm", frame: 0, frameTimer: 0, zigTimer: 0, zigDir: 1
      });
    }
    return;
  }

  if (specialWave === "tank") {
    const count = 4 + Math.floor(wave / 3);
    for (let i = 0; i < count; i++) {
      const hp = 8 + wave * 2;
      enemies.push({
        x: 60 + i * 110, y: 50, w: 52, h: 40,
        hp, maxHp: hp, type: "tank", frame: 0, frameTimer: 0
      });
    }
    return;
  }

  const rows = Math.min(4, 2 + Math.floor(wave / 2));
  const cols = Math.min(10, 6 + wave);
  const enemyWidth = Math.min(50, Math.floor((W - 80) / cols));
  const enemyHeight = 38;
  const hpScale = 1 + Math.floor(wave / 4) * 0.5;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let type = "basic", hp = 1;
      if (r === 0)    { type = "elite";  hp = Math.ceil(2 * hpScale); }
      else if (r < 2) { type = "medium"; hp = Math.ceil(1 * hpScale); }
      if (wave >= 3 && r === rows - 1 && c % 3 === 0) {
        type = "zigzag"; hp = Math.ceil(1 * hpScale);
      }
      enemies.push({
        x: 40 + c * enemyWidth, y: 40 + r * enemyHeight,
        w: enemyWidth - 8, h: enemyHeight - 8,
        type, hp, maxHp: hp, frame: 0, frameTimer: 0, zigTimer: 0, zigDir: 1
      });
    }
  }
}

// ── Particles / drops / coin texts ────────────────────────────────────────────
function spawnParticles(x, y, color, amount = 12) {
  for (let i = 0; i < amount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = Math.random() * 3 + 1;
    particles.push({ x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd, life: 1, color });
  }
}

function spawnDrop(x, y) {
  if (Math.random() > 0.18) return;
  const type = DROP_TYPES[Math.floor(Math.random() * DROP_TYPES.length)];
  drops.push({ x, y, type, w: 18, h: 18, vy: 1.2, pulse: 0 });
}

function spawnCoinText(x, y, amount) {
  coinTexts.push({ x, y, vy: -0.8, life: 1, text: "+" + amount });
}

function awardKill(enemy) {
  const pts    = enemy.type === "boss" ? 500 : enemy.type === "tank" ? 80 : enemy.type === "elite" ? 30 : enemy.type === "medium" ? 20 : 10;
  const reward = enemy.type === "boss" ? 50  : enemy.type === "tank" ? 20 : 5;
  score += pts;
  coins += reward;
  saveCoins();
  spawnCoinText(enemy.x + enemy.w / 2, enemy.y, reward);
  if (score > best) { best = score; saveBest(); document.getElementById("hi").textContent = best; }
  document.getElementById("sc").textContent = score;
  spawnDrop(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2);
}

// ── Update ────────────────────────────────────────────────────────────────────
function update() {
  if (state !== "playing") return;
  movePlayer();
  handleShooting();
  moveBullets();
  moveEnemyBullets();
  moveEnemies();
  moveDrops();
  checkBulletHits();
  checkEnemyBulletHits();
  checkDropPickups();
  checkLoseCondition();
  checkWaveClear();
  updateParticles();
  updateCoinTexts();
  tickPowerups();
}

function tickPowerups() {
  for (const k in powerups) if (powerups[k] > 0) powerups[k]--;
}

function movePlayer() {
  const spd = powerups.speed > 0 ? player.speed * 2 : player.speed;
  if (keys["ArrowLeft"] || keys["a"]) player.x -= spd;
  if (keys["ArrowRight"] || keys["d"]) player.x += spd;
  player.x = Math.max(0, Math.min(player.x, W - player.w));
}

function handleShooting() {
  if (shootCooldown > 0) shootCooldown--;
  if ((keys[" "] || keys["z"]) && shootCooldown <= 0) {
    const bx = player.x + player.w / 2;
    const by = player.y - 4;
    const isExplosive = powerups.explosive > 0;
    const spd = powerups.speed > 0 ? 12 : 6;
    const dmg = 1 + ownedUpgrades.damage * 0.75;

    if (powerups.doubleShot > 0) {
      bullets.push({ x: bx - 7, y: by, w: 3, h: 14, speed: spd, explosive: isExplosive, damage: dmg });
      bullets.push({ x: bx + 7, y: by, w: 3, h: 14, speed: spd, explosive: isExplosive, damage: dmg });
    } else {
      bullets.push({ x: bx, y: by, w: 3, h: 14, speed: spd, explosive: isExplosive, damage: dmg });
    }
    shootCooldown = isExplosive ? 30 : 18;
  }
}

function moveBullets() {
  for (let i = bullets.length - 1; i >= 0; i--) {
    bullets[i].y -= bullets[i].speed;
    if (bullets[i].y < -20) bullets.splice(i, 1);
  }
}

function moveEnemyBullets() {
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    enemyBullets[i].y += enemyBullets[i].speed;
    enemyBullets[i].x += enemyBullets[i].vx;
    if (enemyBullets[i].y > H + 20) enemyBullets.splice(i, 1);
  }
}

function moveDrops() {
  for (let i = drops.length - 1; i >= 0; i--) {
    drops[i].y += drops[i].vy;
    drops[i].pulse += 0.1;
    if (drops[i].y > H + 30) drops.splice(i, 1);
  }
}

function moveEnemies() {
  if (bossPresent) {
    const boss = enemies[0];
    if (!boss) return;
    boss.x += boss.dir * boss.speed;
    if (boss.x < 30 || boss.x + boss.w > W - 30) boss.dir *= -1;
    enemyShootTimer++;
    if (enemyShootTimer > 25) {
      enemyShootTimer = 0;
      for (let i = -1; i <= 1; i++) {
        enemyBullets.push({ x: boss.x + boss.w / 2, y: boss.y + boss.h, w: 5, h: 12, speed: 4 + wave * 0.2, vx: i * 2 });
      }
    }
    return;
  }

  for (const enemy of enemies) {
    if (enemy.type === "zigzag") {
      enemy.zigTimer++;
      if (enemy.zigTimer > 18) { enemy.zigDir *= -1; enemy.zigTimer = 0; }
      enemy.x += enemy.zigDir * (enemySpeed * 1.6);
      enemy.x = Math.max(0, Math.min(enemy.x, W - enemy.w));
    } else if (enemy.type === "swarm") {
      enemy.x += enemyDir * enemySpeed * 1.8;
    } else if (enemy.type === "tank") {
      enemy.x += enemyDir * enemySpeed * 0.4;
    } else {
      enemy.x += enemyDir * enemySpeed;
    }
    enemy.frameTimer++;
    if (enemy.frameTimer > 20) { enemy.frame = 1 - enemy.frame; enemy.frameTimer = 0; }
  }

  const atEdge = enemies.some(e => e.type !== "zigzag" && (e.x < 5 || e.x + e.w > W - 5));
  if (atEdge) {
    enemyDir *= -1;
    for (const e of enemies) if (e.type !== "zigzag") e.y += 16;
  }

  enemyShootTimer++;
  const shootInterval = Math.max(30, 90 - wave * 8);
  if (enemyShootTimer > shootInterval && enemies.length > 0) {
    enemyShootTimer = 0;
    const shooter = enemies[Math.floor(Math.random() * enemies.length)];
    const angle = Math.atan2(player.y - shooter.y, player.x - shooter.x);
    const spd = 3 + wave * 0.3;
    enemyBullets.push({ x: shooter.x + shooter.w / 2, y: shooter.y + shooter.h, w: 4, h: 10, speed: spd, vx: Math.cos(angle) * spd * 0.4 });
  }
}

// Nerfed explosive: small radius, low splash, longer cooldown
function explodeAt(x, y) {
  const radius = 40;
  spawnParticles(x, y, "#ff8800", 16);
  for (let ei = enemies.length - 1; ei >= 0; ei--) {
    const e = enemies[ei];
    const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
    if (Math.sqrt((ecx - x) ** 2 + (ecy - y) ** 2) < radius) {
      e.hp -= 0.5 + ownedUpgrades.damage * 0.2;
      spawnParticles(ecx, ecy, "#ff6600", 4);
      if (e.hp <= 0) {
        spawnParticles(ecx, ecy, "#ff4400", 12);
        awardKill(e);
        enemies.splice(ei, 1);
      }
    }
  }
}

function checkBulletHits() {
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const bullet = bullets[bi];
    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      const enemy = enemies[ei];
      if (bullet.x > enemy.x && bullet.x < enemy.x + enemy.w &&
          bullet.y > enemy.y && bullet.y < enemy.y + enemy.h) {
        bullets.splice(bi, 1);
        if (bullet.explosive) { explodeAt(bullet.x, bullet.y); break; }
        const hitColor = enemy.type === "boss" ? "#ff4400" : enemy.type === "elite" ? "#ff44ff" : "#00ff88";
        spawnParticles(bullet.x, bullet.y, hitColor, 8);
        enemy.hp -= bullet.damage;
        if (enemy.hp <= 0) {
          spawnParticles(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, hitColor, 20);
          awardKill(enemy);
          enemies.splice(ei, 1);
        }
        break;
      }
    }
  }
}

function checkEnemyBulletHits() {
  if (powerups.shield > 0) return;
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const bullet = enemyBullets[i];
    if (bullet.x > player.x && bullet.x < player.x + player.w &&
        bullet.y > player.y && bullet.y < player.y + player.h) {
      enemyBullets.splice(i, 1);
      spawnParticles(player.x + player.w / 2, player.y + player.h / 2, "#ff2200", 20);
      lives--;
      updateLives();
      player.x = W / 2 - player.w / 2;
      if (lives <= 0) { state = "gameover"; showMsg("GAME OVER — PRESS ENTER"); }
    }
  }
}

function checkDropPickups() {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    if (d.x + d.w > player.x && d.x < player.x + player.w &&
        d.y + d.h > player.y && d.y < player.y + player.h) {
      powerups[d.type] = POWERUP_DURATION;
      spawnParticles(d.x + d.w / 2, d.y + d.h / 2, POWERUP_COLORS[d.type], 16);
      drops.splice(i, 1);
    }
  }
}

function checkLoseCondition() {
  if (enemies.some(e => e.y + e.h > H - 60)) {
    state = "gameover";
    showMsg("GAME OVER — PRESS ENTER");
  }
}

function checkWaveClear() {
  if (enemies.length > 0) return;
  const justBeatenBoss = wave % 5 === 0;
  wave++;
  document.getElementById("wv").textContent = wave;
  if (wave % 3 === 0) { lives = Math.min(lives + 1, 9); updateLives(); }
  if (justBeatenBoss) { state = "shop"; }
  else { spawnWave(); }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life -= 0.03;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function updateCoinTexts() {
  for (let i = coinTexts.length - 1; i >= 0; i--) {
    const t = coinTexts[i];
    t.y += t.vy; t.life -= 0.02;
    if (t.life <= 0) coinTexts.splice(i, 1);
  }
}

// ── Draw: player ──────────────────────────────────────────────────────────────
function drawPlayer() {
  const { x, y, w, h } = player;
  const skin = SKINS[selectedSkin] || SKINS.green;
  ctx.save();

  if (powerups.shield > 0) {
    const pulse = Math.sin(Date.now() / 100) * 0.4 + 0.6;
    ctx.shadowColor = "#00ccff"; ctx.shadowBlur = 20 * pulse;
    ctx.strokeStyle = `rgba(0,200,255,${pulse})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w * 0.85, h, 0, 0, Math.PI * 2); ctx.stroke();
  }

  ctx.shadowColor = skin.glow; ctx.shadowBlur = 15;
  ctx.fillStyle = skin.body;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w * 0.7, y + h * 0.75); ctx.lineTo(x + w * 0.5, y + h * 0.85);
  ctx.lineTo(x + w * 0.3, y + h * 0.75); ctx.lineTo(x, y + h);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = skin.cockpit;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + 4); ctx.lineTo(x + w * 0.65, y + h * 0.55);
  ctx.lineTo(x + w / 2, y + h * 0.6); ctx.lineTo(x + w * 0.35, y + h * 0.55);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = `hsl(${(Date.now() / 5) % 60 + 20}, 100%, 60%)`;
  ctx.beginPath(); ctx.ellipse(x + w / 2, y + h + Math.random() * 3, 6, 10 + Math.random() * 5, 0, 0, Math.PI * 2); ctx.fill();

  ctx.shadowBlur = 0; ctx.restore();
}

// ── Draw: enemies ─────────────────────────────────────────────────────────────
function drawEnemy(enemy) {
  ctx.save();
  const cx = enemy.x + enemy.w / 2, cy = enemy.y + enemy.h / 2;

  if (enemy.type === "boss") {
    ctx.shadowColor = "#ff4400"; ctx.shadowBlur = 20;
    ctx.fillStyle = "#ff2200"; ctx.beginPath(); ctx.ellipse(cx, cy, enemy.w / 2, enemy.h / 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff6600"; ctx.beginPath(); ctx.ellipse(cx, cy, enemy.w / 3, enemy.h / 3, 0, 0, Math.PI * 2); ctx.fill();
    const hpPct = Math.max(0, enemy.hp / enemy.maxHp);
    ctx.fillStyle = "#ff000044"; ctx.fillRect(enemy.x, enemy.y - 10, enemy.w, 5);
    ctx.fillStyle = "#ff4400"; ctx.fillRect(enemy.x, enemy.y - 10, enemy.w * hpPct, 5);
    ctx.fillStyle = "#880000";
    for (let i = -1; i <= 1; i++) ctx.fillRect(cx + i * 18 - 3, cy + 12, 6, 14);

  } else if (enemy.type === "tank") {
    ctx.shadowColor = "#ff8800"; ctx.shadowBlur = 14;
    ctx.fillStyle = "#663300"; ctx.fillRect(enemy.x, enemy.y + 8, enemy.w, enemy.h - 8);
    ctx.fillStyle = "#ff6600"; ctx.fillRect(enemy.x + 4, enemy.y + 4, enemy.w - 8, 16);
    ctx.fillStyle = "#aa4400"; ctx.fillRect(cx - 4, enemy.y - 6, 8, 14);
    const hpPct = Math.max(0, enemy.hp / enemy.maxHp);
    ctx.fillStyle = "#33000088"; ctx.fillRect(enemy.x, enemy.y - 8, enemy.w, 4);
    ctx.fillStyle = "#ff6600"; ctx.fillRect(enemy.x, enemy.y - 8, enemy.w * hpPct, 4);
    ctx.fillStyle = "#ff0"; ctx.beginPath(); ctx.arc(cx - 8, cy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 8, cy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(cx - 8, cy, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 8, cy, 1.5, 0, Math.PI * 2); ctx.fill();

  } else if (enemy.type === "swarm") {
    ctx.shadowColor = "#ff44aa"; ctx.shadowBlur = 8;
    ctx.fillStyle = "#cc0077"; ctx.beginPath(); ctx.arc(cx, cy, enemy.w / 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff88cc"; ctx.beginPath(); ctx.arc(cx, cy, enemy.w / 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ff44aa"; ctx.lineWidth = 1;
    for (let s = 0; s < 4; s++) {
      const a = (s / 4) * Math.PI * 2 + (enemy.frame * Math.PI / 4);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5);
      ctx.lineTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9); ctx.stroke();
    }

  } else if (enemy.type === "zigzag") {
    ctx.shadowColor = "#ffaa00"; ctx.shadowBlur = 10;
    ctx.fillStyle = "#cc6600";
    ctx.beginPath();
    ctx.moveTo(cx, enemy.y + enemy.h); ctx.lineTo(enemy.x, enemy.y);
    ctx.lineTo(cx - 4, enemy.y + enemy.h * 0.5); ctx.lineTo(cx + 4, enemy.y + enemy.h * 0.5);
    ctx.lineTo(enemy.x + enemy.w, enemy.y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ffcc44"; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();

  } else if (enemy.type === "elite") {
    ctx.shadowColor = "#ff44ff"; ctx.shadowBlur = 12;
    ctx.fillStyle = "#dd00ff"; ctx.beginPath(); ctx.ellipse(cx, cy - 2, enemy.w * 0.4, enemy.h * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ff44ff"; ctx.lineWidth = 3;
    for (const i of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + i * enemy.w * 0.25, cy + enemy.h * 0.15);
      ctx.quadraticCurveTo(cx + i * enemy.w * 0.45, cy + enemy.h * (enemy.frame ? 0.35 : 0.45), cx + i * enemy.w * 0.38, cy + enemy.h * 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx - 5, cy - 4, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 5, cy - 4, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff00ff"; ctx.beginPath(); ctx.arc(cx - 5, cy - 4, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 5, cy - 4, 2, 0, Math.PI * 2); ctx.fill();

  } else if (enemy.type === "medium") {
    ctx.shadowColor = "#00ccff"; ctx.shadowBlur = 10;
    ctx.fillStyle = "#0088cc";
    ctx.beginPath();
    ctx.moveTo(cx, enemy.y + 2); ctx.lineTo(enemy.x + enemy.w, cy);
    ctx.lineTo(cx, enemy.y + enemy.h - 2); ctx.lineTo(enemy.x, cy);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#00ffff"; ctx.beginPath(); ctx.arc(cx, cy, enemy.w * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#004466"; ctx.fillRect(enemy.x, cy - 3, enemy.w, 6);

  } else {
    ctx.shadowColor = "#00ff88"; ctx.shadowBlur = 8;
    ctx.fillStyle = "#006633"; ctx.fillRect(enemy.x + 2, enemy.y + 5, enemy.w - 4, enemy.h - 10);
    ctx.fillStyle = "#00ff88";
    ctx.fillRect(enemy.x + (enemy.frame ? 2 : 0), enemy.y, 6, 8);
    ctx.fillRect(enemy.x + enemy.w - 6 - (enemy.frame ? 2 : 0), enemy.y, 6, 8);
    ctx.fillRect(enemy.x, enemy.y + enemy.h - 8, 5, 5);
    ctx.fillRect(enemy.x + enemy.w - 5, enemy.y + enemy.h - 8, 5, 5);
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(cx - 4, cy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 4, cy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff0000";
    ctx.beginPath(); ctx.arc(cx - 4, cy, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 4, cy, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = 0; ctx.restore();
}

// ── Draw: bullets ─────────────────────────────────────────────────────────────
function drawBullet(bullet, isEnemy) {
  ctx.save();
  if (!isEnemy && bullet.explosive) {
    ctx.shadowColor = "#ff4422"; ctx.shadowBlur = 12;
    ctx.fillStyle = "#ff6600"; ctx.beginPath(); ctx.arc(bullet.x, bullet.y - bullet.h / 2, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffaa00"; ctx.beginPath(); ctx.arc(bullet.x, bullet.y - bullet.h / 2, 2.5, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.shadowColor = isEnemy ? "#ff4400" : "#00ffcc"; ctx.shadowBlur = 8;
    ctx.fillStyle = isEnemy ? "#ff6600" : "#00ffcc";
    ctx.fillRect(bullet.x - bullet.w / 2, bullet.y - bullet.h / 2, bullet.w, bullet.h);
  }
  ctx.restore();
}

// ── Draw: drops ───────────────────────────────────────────────────────────────
function drawDrop(d) {
  ctx.save();
  const color = POWERUP_COLORS[d.type];
  const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
  const pulse = Math.sin(d.pulse) * 0.3 + 0.7;
  ctx.shadowColor = color; ctx.shadowBlur = 14 * pulse;
  ctx.strokeStyle = color; ctx.globalAlpha = 0.3 * pulse; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1; ctx.fillStyle = color;

  if (d.type === "doubleShot") {
    for (const ox of [-5, 5]) {
      ctx.beginPath(); ctx.moveTo(cx + ox, cy - 7); ctx.lineTo(cx + ox + 4, cy);
      ctx.lineTo(cx + ox, cy + 7); ctx.lineTo(cx + ox - 4, cy); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = "#fff"; ctx.globalAlpha = 0.4; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, cy - 7); ctx.lineTo(cx, cy + 7); ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (d.type === "shield") {
    ctx.fillStyle = color + "44"; ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx + 8, cy - 4); ctx.lineTo(cx + 8, cy + 3);
    ctx.quadraticCurveTo(cx + 8, cy + 10, cx, cy + 13);
    ctx.quadraticCurveTo(cx - 8, cy + 10, cx - 8, cy + 3);
    ctx.lineTo(cx - 8, cy - 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx, cy + 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 4, cy + 1); ctx.lineTo(cx + 4, cy + 1); ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (d.type === "speed") {
    ctx.beginPath(); ctx.moveTo(cx + 2, cy - 10); ctx.lineTo(cx - 4, cy + 1);
    ctx.lineTo(cx + 1, cy + 1); ctx.lineTo(cx - 2, cy + 10);
    ctx.lineTo(cx + 5, cy - 1); ctx.lineTo(cx, cy - 1); ctx.closePath(); ctx.fill();
  } else if (d.type === "explosive") {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(d.pulse * 0.6);
    const spikes = 6, outerR = 9, innerR = 4.5;
    ctx.beginPath();
    for (let s = 0; s < spikes * 2; s++) {
      const r = s % 2 === 0 ? outerR : innerR;
      const a = (s * Math.PI) / spikes;
      s === 0 ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.restore();
  }
  ctx.shadowBlur = 0; ctx.restore();
}

// ── Draw: power-up HUD ────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  if (typeof r === "number") r = [r, r, r, r];
  ctx.beginPath();
  ctx.moveTo(x + r[0], y); ctx.lineTo(x + w - r[1], y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r[1]);
  ctx.lineTo(x + w, y + h - r[2]);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r[2], y + h);
  ctx.lineTo(x + r[3], y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r[3]);
  ctx.lineTo(x, y + r[0]); ctx.quadraticCurveTo(x, y, x + r[0], y); ctx.closePath();
}

function drawMiniIcon(type, cx, cy) {
  ctx.fillStyle = "#000"; ctx.globalAlpha = 0.6;
  if (type === "doubleShot") {
    for (const ox of [-3, 3]) ctx.fillRect(cx + ox - 1, cy - 5, 2, 10);
  } else if (type === "shield") {
    ctx.beginPath(); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx + 4, cy - 2);
    ctx.lineTo(cx + 4, cy + 2); ctx.quadraticCurveTo(cx + 4, cy + 6, cx, cy + 7);
    ctx.quadraticCurveTo(cx - 4, cy + 6, cx - 4, cy + 2); ctx.lineTo(cx - 4, cy - 2); ctx.closePath(); ctx.fill();
  } else if (type === "speed") {
    ctx.beginPath(); ctx.moveTo(cx + 1, cy - 5); ctx.lineTo(cx - 3, cy); ctx.lineTo(cx + 1, cy);
    ctx.lineTo(cx - 1, cy + 5); ctx.lineTo(cx + 4, cy - 1); ctx.lineTo(cx, cy - 1); ctx.closePath(); ctx.fill();
  } else if (type === "explosive") {
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPowerupHUD() {
  const active = Object.entries(powerups).filter(([, v]) => v > 0);
  if (active.length === 0) return;
  ctx.save();
  const cardW = 110, cardH = 28, gap = 6;
  const startX = W - cardW - 8, startY = 8;

  active.forEach(([key, frames], i) => {
    const color = POWERUP_COLORS[key];
    const pct = frames / POWERUP_DURATION;
    const bx = startX, by = startY + i * (cardH + gap);

    ctx.fillStyle = "rgba(0,0,0,0.72)"; ctx.strokeStyle = color + "88"; ctx.lineWidth = 1;
    roundRect(ctx, bx, by, cardW, cardH, 6); ctx.fill(); ctx.stroke();

    ctx.fillStyle = color;
    roundRect(ctx, bx + 1, by + 1, 22, cardH - 2, [5, 0, 0, 5]); ctx.fill();

    ctx.save(); drawMiniIcon(key, bx + 12, by + cardH / 2); ctx.restore();

    ctx.fillStyle = "#fff"; ctx.font = "bold 8px monospace";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.shadowColor = color; ctx.shadowBlur = 4;
    ctx.fillText(POWERUP_LABELS[key], bx + 28, by + 10); ctx.shadowBlur = 0;

    ctx.fillStyle = color; ctx.font = "7px monospace"; ctx.textAlign = "right";
    ctx.fillText(Math.ceil(frames / 60) + "s", bx + cardW - 5, by + 10);

    const barX = bx + 28, barY = by + 19, barW2 = cardW - 34, barH2 = 4;
    ctx.fillStyle = color + "22"; roundRect(ctx, barX, barY, barW2, barH2, 2); ctx.fill();
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 4;
    roundRect(ctx, barX, barY, barW2 * pct, barH2, 2); ctx.fill(); ctx.shadowBlur = 0;
  });
  ctx.restore();
}

// ── Draw: coin HUD ────────────────────────────────────────────────────────────
function drawCoinHUD() {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(8, 10, 100, 26);
  ctx.strokeStyle = "#ffdd00"; ctx.lineWidth = 1; ctx.strokeRect(8, 10, 100, 26);
  ctx.fillStyle = "#ffdd00"; ctx.font = "bold 13px monospace";
  ctx.textAlign = "center"; ctx.shadowColor = "#ffaa00"; ctx.shadowBlur = 6;
  ctx.fillText("$ " + coins, 58, 27); ctx.shadowBlur = 0;
  ctx.restore();
}

// ── Draw: shop screen ─────────────────────────────────────────────────────────
function drawShop() {
  shopButtons = [];
  ctx.save();
  ctx.fillStyle = "rgba(0,0,10,0.94)"; ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = "#00ff88"; ctx.font = "bold 20px monospace";
  ctx.textAlign = "center"; ctx.shadowColor = "#00ff88"; ctx.shadowBlur = 12;
  ctx.fillText("UPGRADE SHOP", W / 2, 38); ctx.shadowBlur = 0;

  ctx.fillStyle = "#ffdd00"; ctx.font = "bold 13px monospace";
  ctx.fillText("$ " + coins + " coins", W / 2, 58);

  // ── Upgrades ──────────────────────────────────────────────────────────────
  ctx.fillStyle = "#666"; ctx.font = "9px monospace";
  ctx.fillText("UPGRADES — reset on death, stack within a run", W / 2, 76);

  const upgradeKeys = ["extraLife", "speed", "damage"];
  const upgradeColors = { extraLife: "#ff6688", speed: "#00ff88", damage: "#ff8800" };
  const uw = 148, uh = 84, ugap = 14;
  const uStartX = W / 2 - (upgradeKeys.length * uw + (upgradeKeys.length - 1) * ugap) / 2;

  upgradeKeys.forEach((key, i) => {
    const def = upgradeDefs[key];
    const lvl = ownedUpgrades[key];
    const cost = getUpgradeCost(key);
    const maxed = lvl >= def.max;
    const canAfford = coins >= cost && !maxed;
    const color = upgradeColors[key];
    const bx = uStartX + i * (uw + ugap), by = 86;

    ctx.fillStyle = canAfford ? "rgba(0,25,0,0.9)" : "rgba(18,18,18,0.9)";
    roundRect(ctx, bx, by, uw, uh, 8); ctx.fill();
    ctx.strokeStyle = canAfford ? color : "#333"; ctx.lineWidth = 1.5;
    roundRect(ctx, bx, by, uw, uh, 8); ctx.stroke();

    // Top color bar
    ctx.fillStyle = color;
    roundRect(ctx, bx + 1, by + 1, uw - 2, 5, [7, 7, 0, 0]); ctx.fill();

    ctx.textAlign = "center";
    ctx.fillStyle = "#eee"; ctx.font = "bold 10px monospace";
    ctx.fillText(def.label, bx + uw / 2, by + 24);

    // Level pips
    const pipSpacing = (uw - 28) / (def.max - 1);
    for (let p = 0; p < def.max; p++) {
      ctx.fillStyle = p < lvl ? color : "#2a2a2a";
      ctx.beginPath(); ctx.arc(bx + 14 + p * pipSpacing, by + 42, 4, 0, Math.PI * 2); ctx.fill();
      if (p < lvl) { ctx.strokeStyle = color + "88"; ctx.lineWidth = 0.5; ctx.stroke(); }
    }
    ctx.fillStyle = "#888"; ctx.font = "8px monospace";
    ctx.fillText("LV " + lvl + " / " + def.max, bx + uw / 2, by + 55);

    // Buy button
    ctx.fillStyle = canAfford ? color : "#2a2a2a";
    roundRect(ctx, bx + 10, by + uh - 22, uw - 20, 16, 4); ctx.fill();
    ctx.fillStyle = canAfford ? "#000" : "#555"; ctx.font = "bold 8px monospace";
    ctx.fillText(maxed ? "MAXED" : canAfford ? "BUY  $" + cost : "$" + cost, bx + uw / 2, by + uh - 11);

    addButton(bx + 10, by + uh - 22, uw - 20, 16, () => buyUpgrade(key));
  });

  //ship customs
  ctx.fillStyle = "#666"; ctx.font = "9px monospace"; ctx.textAlign = "center";
  ctx.fillText("SHIP SKIN", W / 2, 190);

  const skinKeys = Object.keys(SKINS);
  const sw = 100, sh = 80, sgap = 12;
  const sStartX = W / 2 - (skinKeys.length * sw + (skinKeys.length - 1) * sgap) / 2;

  skinKeys.forEach((skinKey, idx) => {
    const skin = SKINS[skinKey];
    const bx = sStartX + idx * (sw + sgap), by = 198;
    const isSelected = selectedSkin === skinKey;

    ctx.fillStyle = isSelected ? "rgba(255,255,255,0.06)" : "rgba(10,10,10,0.8)";
    roundRect(ctx, bx, by, sw, sh, 8); ctx.fill();
    ctx.strokeStyle = isSelected ? skin.glow : "#2a2a2a";
    ctx.lineWidth = isSelected ? 2 : 1;
    roundRect(ctx, bx, by, sw, sh, 8); ctx.stroke();

    if (isSelected) { ctx.shadowColor = skin.glow; ctx.shadowBlur = 10; }

    //tiny skin preview
    const px = bx + sw / 2 - 14, py = by + 14;
    const pw = 28, ph = 18;
    ctx.fillStyle = skin.body;
    ctx.beginPath();
    ctx.moveTo(px + pw / 2, py); ctx.lineTo(px + pw, py + ph);
    ctx.lineTo(px + pw * 0.7, py + ph * 0.75); ctx.lineTo(px + pw * 0.5, py + ph * 0.85);
    ctx.lineTo(px + pw * 0.3, py + ph * 0.75); ctx.lineTo(px, py + ph);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = skin.cockpit;
    ctx.beginPath(); ctx.moveTo(px + pw / 2, py + 2);
    ctx.lineTo(px + pw * 0.65, py + ph * 0.55); ctx.lineTo(px + pw / 2, py + ph * 0.6);
    ctx.lineTo(px + pw * 0.35, py + ph * 0.55); ctx.closePath(); ctx.fill();

    //thruster flame
    ctx.fillStyle = `hsl(35, 100%, 55%)`;
    ctx.beginPath(); ctx.ellipse(px + pw / 2, py + ph + 4, 4, 6, 0, 0, Math.PI * 2); ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = isSelected ? skin.glow : "#777"; ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    ctx.fillText(skinKey.toUpperCase(), bx + sw / 2, by + sh - 14);
    ctx.fillStyle = isSelected ? "#fff" : "#444"; ctx.font = "7px monospace";
    ctx.fillText(isSelected ? "✓ ACTIVE" : "CLICK TO SELECT", bx + sw / 2, by + sh - 5);

    addButton(bx, by, sw, sh, () => { selectedSkin = skinKey; saveSkin(); });
  });

  //start btn
  const btnY = H - 64;
  ctx.shadowColor = "#00ff88"; ctx.shadowBlur = 10;
  ctx.fillStyle = "rgba(0,50,20,0.95)";
  roundRect(ctx, W / 2 - 110, btnY, 220, 46, 10); ctx.fill();
  ctx.strokeStyle = "#00ff88"; ctx.lineWidth = 2;
  roundRect(ctx, W / 2 - 110, btnY, 220, 46, 10); ctx.stroke();
  ctx.fillStyle = "#00ff88"; ctx.font = "bold 14px monospace";
  ctx.textAlign = "center";
  ctx.fillText("▶  START / CONTINUE", W / 2, btnY + 29);
  ctx.shadowBlur = 0;

  addButton(W / 2 - 110, btnY, 220, 46, () => {
    if (score === 0 && wave === 1) { startRun(); }
    else { spawnWave(); state = "playing"; }
  });

  ctx.restore();
}

//main draw
function draw() {
  ctx.clearRect(0, 0, W, H);

  if (state === "shop") { drawShop(); return; }

  ctx.strokeStyle = "#00ff8833"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, H - 40); ctx.lineTo(W, H - 40); ctx.stroke();

  if (state === "playing" || state === "gameover") {
    for (const e of enemies) drawEnemy(e);
    for (const b of bullets) drawBullet(b, false);
    for (const b of enemyBullets) drawBullet(b, true);
    for (const d of drops) drawDrop(d);
    drawPlayer();

    for (const p of particles) {
      ctx.save(); ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }

    for (const t of coinTexts) {
      ctx.save(); ctx.globalAlpha = t.life;
      ctx.fillStyle = "#ffdd00"; ctx.font = "bold 12px monospace";
      ctx.textAlign = "center"; ctx.shadowColor = "#ffaa00"; ctx.shadowBlur = 8;
      ctx.fillText(t.text, t.x, t.y); ctx.restore();
    }

    drawPowerupHUD();
    drawCoinHUD();
  }

  if (state === "title") {
    ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 0, W, H);
  }
}

//user input
document.addEventListener("keydown", e => {
  keys[e.key] = true;
  if (e.key === " ") e.preventDefault();
  if (e.key === "Enter") {
    if (state === "title") {
      state = "shop";
    } else if (state === "shop") {
      if (score === 0 && wave === 1) startRun();
      else { spawnWave(); state = "playing"; }
    } else if (state === "gameover") {
      ownedUpgrades = { extraLife: 0, speed: 0, damage: 0 };
      wave = 1; score = 0;
      state = "shop";
    }
  }
});
document.addEventListener("keyup", e => { keys[e.key] = false; });

canvas.addEventListener("click", e => {
  if (state !== "shop") return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  for (const b of shopButtons) {
    if (mx > b.x && mx < b.x + b.w && my > b.y && my < b.y + b.h) { b.onClick(); return; }
  }
});

//on new boot give
if (!localStorage.getItem("hasPlayed")) {
  coins = 1000;
  localStorage.setItem("hasPlayed", "1");
  saveCoins();
}

function loop() { update(); draw(); requestAnimationFrame(loop); }
loop();