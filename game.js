// A separate canvas sits behind the game canvas so the stars so it never interfere with game drawing calls.
const starCanvas = document.getElementById("stars");
// Match the canvas pixel dimensions to the browser window so
// nothing gets stretched or clipped.
starCanvas.width = window.innerWidth;
starCanvas.height = window.innerHeight;
const starCtx = starCanvas.getContext("2d");

// Build 200 star objects. Each one stores its own random position,
// size (0.3 to 1.8px radius) and fall speed (0.1 to 0.5px per frame).
const stars = Array.from({ length: 200 }, () => ({
  x: Math.random() * starCanvas.width,
  y: Math.random() * starCanvas.height,
  size: Math.random() * 1.5 + 0.3,
  speed: Math.random() * 0.4 + 0.1
}));

// Redraws every star once per animation frame.
// Stars scroll downward. When one exits the bottom it wraps to the top
// at a new random X so the field never empties out.
function drawStars() {
  starCtx.clearRect(0, 0, starCanvas.width, starCanvas.height);
  for (const star of stars) {
    star.y += star.speed;
    if (star.y > starCanvas.height) {
      star.y = 0;
      star.x = Math.random() * starCanvas.width;
    }
    // Bigger stars get a slightly higher alpha so they pop visually.
    starCtx.fillStyle = `rgba(255, 255, 255, ${0.3 + star.size * 0.3})`;
    starCtx.beginPath();
    starCtx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    starCtx.fill();

  }
  requestAnimationFrame(drawStars);
}
drawStars();

//game canvas + game setup

const canvas = document.getElementById("myCanvas");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

// state drives which branch of draw() and update() runs each frame.
// Possible values: "title" | "playing" | "gameover"
let state = "title";

let score = 0, best = 0, wave = 1, lives = 3;

// player is rebuilt on every new game via init().
let player;

// All active game objects live in these arrays.
// Looping backwards when splicing prevents index-skip bugs.
let bullets = [], enemies = [], enemyBullets = [], particles = [], drops = [];

// keys holds the live pressed/released state for every key we care about.
let keys = {}, shootCooldown = 0;

// enemyDir flips between 1 (right) and -1 (left) when the formation hits a wall.
let enemyDir = 1, enemySpeed = 1, enemyShootTimer = 0, bossPresent = false;

// local storage gets players highscore
// The best score survives page refreshes. We read it once on load
// and write it back whenever the player breaks their record.

// Pull the saved best out of localStorage. If nothing is stored yet
// parseInt returns NaN so the || 0 fallback keeps it a clean number.
best = parseInt(localStorage.getItem("spaceBestScore")) || 0;

// Writes the current best to localStorage so it persists across sessions.
function saveBestScore() {
  localStorage.setItem("spaceBestScore", best);
}


//powerup system
// Each power-up is a countdown timer in frames. A value > 0 means the power-up is active. tickPowerups() decrements all of them once per game frame (~60 times a second).

// 600 frames = roughly 10 seconds at 60 fps
const powerUpDuration = 600;

// All four timers start at 0 (inactive).
const powerups = {
  doubleShot: 0,
  shield: 0,
  speed: 0,
  explosive: 0
};

// Used for both the HUD color coding and the drop gem colors.
const powerUpColors = {
  doubleShot: "#ffdd00",
  shield: "#00ccff",
  speed: "#00ff88",
  explosive: "#ff4422"
};

// Short labels shown on the HUD cards while a power-up is active.
const powerUpLabels = {
  doubleShot: "2X SHOT",
  shield: "SHIELD",
  speed: "SPEED",
  explosive: "BOOM"
};

// The pool of possible drop types. Picked randomly when an enemy dies.
const dropTypes = ["doubleShot", "shield", "speed", "explosive"];

// Resets every piece of mutable state then kicks off wave 1.
// Called on the first Enter press and after every game over.

function init() {
  score = 0; lives = 3; wave = 1;
  bullets = []; enemies = []; enemyBullets = []; particles = []; drops = [];
  shootCooldown = 0; enemyShootTimer = 0;
  for (const k in powerups) powerups[k] = 0;

  // Center the player horizontally near the bottom of the canvas.
  // w:44 h:28 match the ship drawing dimensions in drawPlayer().
  player = { x: W / 2 - 22, y: H - 50, w: 44, h: 28, speed: 4 };
  spawnWave();

  document.getElementById("sc").textContent = score;
  document.getElementById("hi").textContent = best;
  document.getElementById("wv").textContent = wave;
  updateLives();
  clearMsg();
  state = "playing";
}


//enemy wave spawning
// Every 5th wave drops a single boss instead of a formation.
// Otherwise the grid grows wider and taller as wave increases but is clamped so enemies always fit inside the canvas.

function spawnWave() {
  enemies = [];
  enemyDir = 1;

  // Higher waves move faster. The +0.15 per wave keeps it challenging
  // without becoming impossible in the first handful of waves.
  enemySpeed = 0.4 + wave * 0.15;
  enemyShootTimer = 0;
  bossPresent = false;

  if (wave % 5 === 0) {
    bossPresent = true;
    enemies.push({
      x: W / 2 - 40, y: 60, w: 80, h: 50,
      hp: 10 + wave * 2, maxHp: 10 + wave * 2,
      type: "boss", dir: 1, speed: 1.5
    });
    return;
  }

  // Clamp grid size so enemies never exceed the playfield.
  const rows = Math.min(4, 2 + Math.floor(wave / 2));
  const cols = Math.min(10, 6 + wave);

  // Divide available horizontal space evenly among columns.
  // 80px padding keeps enemies off the very edges.
  const enemyWidth = Math.min(50, Math.floor((W - 80) / cols));
  const enemyHeight = 38;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Row 0 = elite (2 hp), row 1 = medium, all others = basic (1 hp).
      let type = "basic", hp = 1;
      if (r === 0) { type = "elite"; hp = 2; }
      else if (r < 2) { type = "medium"; }
      enemies.push({
        x: 40 + c * enemyWidth, y: 40 + r * enemyHeight,
        w: enemyWidth - 8, h: enemyHeight - 8,
        type, hp, maxHp: hp, frame: 0, frameTimer: 0
      });
    }
  }
}

//heads up display helpers (HUD)

// Converts the lives count into a matching number of heart emojis.
function updateLives() { document.getElementById("lv").textContent = "❤️".repeat(Math.max(0, lives)); }

function showMsg(text) { document.getElementById("msg").textContent = text; }
function clearMsg() { document.getElementById("msg").textContent = ""; }


//how to play overlay
// Draws a semi-transparent instruction panel on the title screen
// so players know the controls before starting.
// Rendered directly to the game canvas so no extra HTML is needed.

function drawInstructions() {
  const boxW = 300, boxH = 220;
  const boxX = W / 2 - boxW / 2;
  const boxY = H / 2 - boxH / 2 + 20;

  // Dark backdrop for the instruction box.
  ctx.fillStyle = "rgba(0, 0, 0, 0.78)";
  roundRect(ctx, boxX, boxY, boxW, boxH, 12);
  ctx.fill();

  // Colored border to frame the panel.
  ctx.strokeStyle = "#00ff8866";
  ctx.lineWidth = 1.5;
  roundRect(ctx, boxX, boxY, boxW, boxH, 12);
  ctx.stroke();

  // Title line
  ctx.fillStyle = "#00ff88";
  ctx.font = "bold 15px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.shadowColor = "#00ff88";
  ctx.shadowBlur = 8;
  ctx.fillText("HOW TO PLAY", W / 2, boxY + 14);
  ctx.shadowBlur = 0;

  // Divider line beneath the title.
  ctx.strokeStyle = "#00ff8844";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(boxX + 16, boxY + 34);
  ctx.lineTo(boxX + boxW - 16, boxY + 34);
  ctx.stroke();

  // Instruction lines: each entry is [label color, label, description].
  const lines = [
    ["#00ccff", "← / → or A / D", "Move ship"],
    ["#00ccff", "SPACE or Z", "Shoot"],
    ["#ffdd00", "2X SHOT(yellow)", "Twin bullets"],
    ["#00ccff", "SHIELD(blue)", "Blocks damage"],
    ["#00ff88", "SPEED(green)", "Move faster"],
    ["#ff4422", "BOOM(red)", "Explosive shot"],
  ];

  ctx.font = "11px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  lines.forEach((line, i) => {
    const lineY = boxY + 46 + i * 24;
    // Colored dot to the left of each entry.
    ctx.fillStyle = line[0];
    ctx.beginPath();
    ctx.arc(boxX + 18, lineY + 6, 4, 0, Math.PI * 2);
    ctx.fill();

    // Key label in white.
    ctx.fillStyle = "#ffffff";
    ctx.fillText(line[1], boxX + 28, lineY);

    // Description in dim grey so the label stands out.
    ctx.fillStyle = "#aaaaaa";
    ctx.fillText("— " + line[2], boxX + 152, lineY);


  });

  // Prompt at the bottom of the box.
  ctx.fillStyle = "#ffffff88";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  ctx.fillText("PRESS ENTER TO START", W / 2, boxY + boxH - 18);
}

//particles drawing
// Particles burst outward from a center point in random directions they fade and drift with slight gravity until their life hits 0.
function spawnParticles(x, y, color, amount = 12) {
  for (let i = 0; i < amount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 3 + 1;
    // vx/vy decompose the random direction into horizontal and vertical
    // velocity components using basic trigonometry.
    // cos(angle) gives the X component and sin(angle) gives the Y component
    // of a unit vector pointing in that direction. Multiplying by speed
    // scales the vector so faster particles travel further each frame.
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color });


  }
}


//powerup drops
// Enemies have an 18% chance of leaving a power-up gem when killed.

function spawnDrop(x, y) {
  if (Math.random() > 0.18) return;
  const type = dropTypes[Math.floor(Math.random() * dropTypes.length)];
  drops.push({ x, y, type, w: 18, h: 18, vy: 1.2, pulse: 0 });
}
//main update loop
// Called every frame. Each sub-function handles one concern.
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
  tickPowerups();
}

// Counts down every active power-up timer by one frame.
function tickPowerups() {
  for (const k in powerups) {
    if (powerups[k] > 0) powerups[k]--;
  }
}

//player movement

function movePlayer() {
  // Speed bonus doubles movement when the speed power-up is active.
  const spd = powerups.speed > 0 ? player.speed * 2.5 : player.speed;
  if (keys["ArrowLeft"] || keys["a"]) player.x -= spd;
  if (keys["ArrowRight"] || keys["d"]) player.x += spd;

  // Clamp the player inside the canvas width.
  player.x = Math.max(0, Math.min(player.x, W - player.w));
}

function handleShooting() {
  if (shootCooldown > 0) shootCooldown--;
  if ((keys[" "] || keys['z']) && shootCooldown <= 0) {


    // Center the bullet on the ship. The -4 offset starts it just above
    // the ship's nose rather than at its center.
    const bulletX = player.x + player.w / 2;
    const bulletY = player.y - 4;
    const isExplosive = powerups.explosive > 0;

    if (powerups.doubleShot > 0) {
      // Two bullets spread 14px apart (7 to each side of center).
      bullets.push({ x: bulletX - 7, y: bulletY, w: 3, h: 14, speed: 10, explosive: isExplosive });
      bullets.push({ x: bulletX + 7, y: bulletY, w: 3, h: 14, speed: 10, explosive: isExplosive });
    } else {
      // Increased from 2 to 6 so single shots feel snappy and responsive.
      bullets.push({ x: bulletX, y: bulletY, w: 3, h: 14, speed: 6, explosive: isExplosive });
    }

    // 18-frame cooldown limits fire rate to roughly 3 shots per second at 60 fps.
    shootCooldown = 18;


  }
}

function moveBullets() {
  // Loop backwards so splicing an element doesn’t skip the next index.
  for (let bulletIndex = bullets.length - 1; bulletIndex >= 0; bulletIndex--) {
    bullets[bulletIndex].y -= bullets[bulletIndex].speed;
    if (bullets[bulletIndex].y < -20) bullets.splice(bulletIndex, 1);
  }
}

function moveEnemyBullets() {
  for (let bulletIndex = enemyBullets.length - 1; bulletIndex >= 0; bulletIndex--) {
    enemyBullets[bulletIndex].y += enemyBullets[bulletIndex].speed;
    enemyBullets[bulletIndex].x += enemyBullets[bulletIndex].vx;
    if (enemyBullets[bulletIndex].y > H + 20) enemyBullets.splice(bulletIndex, 1);
  }
}

function moveDrops() {
  for (let dropIndex = drops.length - 1; dropIndex >= 0; dropIndex--) {
    drops[dropIndex].y += drops[dropIndex].vy;


    // pulse drives the sine wave used in drawDrop for the glow ring animation.
    drops[dropIndex].pulse += 0.1;
    if (drops[dropIndex].y > H + 30) drops.splice(dropIndex, 1);


  }
}

function moveEnemies() {
  if (!bossPresent) {


    // Slide every enemy sideways by the current direction and speed.
    for (const enemy of enemies) {
      enemy.x += enemyDir * enemySpeed;

      // Cycle the sprite animation frame every 20 game frames (~3 times per second).
      enemy.frameTimer++;
      if (enemy.frameTimer > 20) { enemy.frame = 1 - enemy.frame; enemy.frameTimer = 0; }
    }

    // If any enemy is touching either side wall, reverse direction and
    // drop the whole formation down by 16px (classic Space Invaders step-down).
    let atEdge = enemies.some(e => e.x < 5 || e.x + e.w > W - 5);
    if (atEdge) {
      enemyDir *= -1;
      for (const enemy of enemies) enemy.y += 16;
    }

    enemyShootTimer++;

    // Shoot interval shrinks each wave so enemies fire more aggressively.
    // It never drops below 30 frames to stay fair.
    const shootInterval = Math.max(30, 90 - wave * 8);
    if (enemyShootTimer > shootInterval && enemies.length > 0) {
      enemyShootTimer = 0;
      const shooter = enemies[Math.floor(Math.random() * enemies.length)];

      // atan2 gives the angle between the shooter and the player in radians.
      // atan2(dy, dx) returns the angle of the vector from shooter to player.
      // Multiplying the cos/sin components by 0.4 limits horizontal drift
      // so bullets track loosely without being unbeatable.
      const angle = Math.atan2(player.y - shooter.y, player.x - shooter.x);
      const speed = 3 + wave * 0.3;
      enemyBullets.push({
        x: shooter.x + shooter.w / 2, y: shooter.y + shooter.h,
        w: 4, h: 10, speed, vx: Math.cos(angle) * speed * 0.4
      });
    }


  } else {


    // Boss movement: bounce between left and right walls independently.
    const boss = enemies[0];
    if (!boss) return;
    boss.x += boss.dir * boss.speed;
    if (boss.x < 30 || boss.x + boss.w > W - 30) boss.dir *= -1;

    // Boss fires a 3-bullet spread every 25 frames.
    // The spread values (-1, 0, 1) offset the horizontal velocity left, center, right.
    enemyShootTimer++;
    if (enemyShootTimer > 25) {
      enemyShootTimer = 0;
      for (let spread = -1; spread <= 1; spread++) {
        enemyBullets.push({
          x: boss.x + boss.w / 2, y: boss.y + boss.h,
          w: 5, h: 12, speed: 4 + wave * 0.2, vx: spread * 2
        });
      }
    }


  }
}

// ============================================================
// EXPLOSIVE POWER-UP  (nerfed)
// When an explosive bullet hits, everything within radius pixels
// takes 1 damage (down from 2). Radius shrunk from 70 to 45px.
// The Pythagorean theorem finds the straight-line distance between
// two points: distance = sqrt((x2-x1)^2 + (y2-y1)^2).
// Squaring and adding the horizontal and vertical gaps gives the
// squared length of the hypotenuse of a right triangle whose legs
// run along the X and Y axes between the two points.
// ============================================================

function explodeAt(x, y, radius) {
  for (let enemyIndex = enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
    const enemy = enemies[enemyIndex];
    const centerX = enemy.x + enemy.w / 2;
    const centerY = enemy.y + enemy.h / 2;


    // Pythagorean distance from explosion center to enemy center.
    const dist = Math.sqrt((centerX - x) ** 2 + (centerY - y) ** 2);
    if (dist < radius) {
      // Nerfed: 1 damage per explosion instead of 2.
      enemy.hp -= 1;
      spawnParticles(centerX, centerY, "#ff6600", 4);
      if (enemy.hp <= 0) {
        spawnParticles(centerX, centerY, "#ff4400", 12);
        const pts = enemy.type === "boss" ? 500 : enemy.type === "elite" ? 30 : enemy.type === "medium" ? 20 : 10;
        score += pts;
        if (score > best) {
          best = score;
          document.getElementById("hi").textContent = best;
          saveBestScore();
        }
        document.getElementById("sc").textContent = score;
        spawnDrop(centerX, centerY);
        enemies.splice(enemyIndex, 1);
      }
    }


  }

  // Visual explosion ring at the impact point. Fewer particles than before.
  spawnParticles(x, y, "#ff8800", 14);
}


// collison detections (player bullets vs enemies)
// Simple AABB (Axis-Aligned Bounding Box) overlap test:
// Two rectangles overlap when neither is fully to the left, right,
// above, or below the other. We check four conditions:
//   bullet.x > enemy.x bullet is not fully left of enemy
//   bullet.x < enemy.x + w bullet is not fully right of enemy
//   bullet.y > enemy.y bullet is not fully above enemy
//   bullet.y < enemy.y + h bullet is not fully below enemy
// All four must be true simultaneously for an intersection.


function checkBulletHits() {
  for (let bulletIndex = bullets.length - 1; bulletIndex >= 0; bulletIndex--) {
    const bullet = bullets[bulletIndex];
    let hit = false;
    for (let enemyIndex = enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
      const enemy = enemies[enemyIndex];


      // AABB check: bullet point must be inside enemy rectangle.
      if (bullet.x > enemy.x && bullet.x < enemy.x + enemy.w &&
        bullet.y > enemy.y && bullet.y < enemy.y + enemy.h) {
        bullets.splice(bulletIndex, 1);
        hit = true;

        if (bullet.explosive) {
          // Radius reduced from 70 to 45 to nerf the explosive power-up.
          explodeAt(bullet.x, bullet.y, 45);
          break;
        }

        // Different enemy types get different spark colors for visual variety.
        const hitColor = enemy.type === "boss" ? "#ff4400" : enemy.type === "elite" ? "#ff44ff" : "#00ff88";
        spawnParticles(bullet.x, bullet.y, hitColor, 8);

        enemy.hp--;
        if (enemy.hp <= 0) {
          const boomColor = enemy.type === "boss" ? "#ff4400" : "#00ff88";
          spawnParticles(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, boomColor, 20);
          const pts = enemy.type === "boss" ? 500 : enemy.type === "elite" ? 30 : enemy.type === "medium" ? 20 : 10;
          score += pts;
          if (score > best) {
            best = score;
            document.getElementById("hi").textContent = best;
            saveBestScore();
          }
          document.getElementById("sc").textContent = score;
          spawnDrop(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2);
          enemies.splice(enemyIndex, 1);
        }
        break;
      }
    }


  }
}

// ============================================================
// COLLISION DETECTION (enemy bullets vs player)
// Shield power-up skips this check entirely while active.
// ============================================================

function checkEnemyBulletHits() {
  if (powerups.shield > 0) return;
  for (let bulletIndex = enemyBullets.length - 1; bulletIndex >= 0; bulletIndex--) {
    const bullet = enemyBullets[bulletIndex];
    if (bullet.x > player.x && bullet.x < player.x + player.w &&
      bullet.y > player.y && bullet.y < player.y + player.h) {
      enemyBullets.splice(bulletIndex, 1);
      spawnParticles(player.x + player.w / 2, player.y + player.h / 2, "#ff2200", 20);
      lives--;
      updateLives();


      // Reset player to center so they have a brief moment of breathing room.
      player.x = W / 2 - player.w / 2;
      if (lives <= 0) { state = "gameover"; showMsg("GAME OVER — ENTER TO RETRY"); }
    }


  }
}

// ============================================================
// DROP PICKUP DETECTION
// Same AABB logic as bullets. On pickup the matching power-up
// timer resets to the full duration.
// ============================================================

function checkDropPickups() {
  for (let dropIndex = drops.length - 1; dropIndex >= 0; dropIndex--) {
    const drop = drops[dropIndex];
    if (drop.x + drop.w > player.x && drop.x < player.x + player.w &&
      drop.y + drop.h > player.y && drop.y < player.y + player.h) {
      powerups[drop.type] = powerUpDuration;
      spawnParticles(drop.x + drop.w / 2, drop.y + drop.h / 2, powerUpColors[drop.type], 16);
      drops.splice(dropIndex, 1);
    }
  }
}

function checkLoseCondition() {
  // The ground line is drawn at H - 40, so we check if any enemy crossed it.
  if (enemies.some(enemy => enemy.y + enemy.h > H - 60)) {
    state = "gameover";
    showMsg("GAME OVER — ENTER TO RETRY");
  }
}

function checkWaveClear() {
  if (enemies.length === 0) {
    wave++;
    document.getElementById("wv").textContent = wave;

    // Bonus life every 3 waves, capped at 5 so the game stays challenging.
    if (wave % 3 === 0) { lives = Math.min(lives + 1, 5); updateLives(); }
    spawnWave();


  }
}

// ============================================================
// PARTICLE UPDATE
// Each particle drifts along its velocity, falls slightly due to
// the +0.05 gravity nudge, and fades out as life drops from 1 to 0.
// ============================================================

function updateParticles() {
  for (let particleIndex = particles.length - 1; particleIndex >= 0; particleIndex--) {
    const particle = particles[particleIndex];
    particle.x += particle.vx;
    particle.y += particle.vy;
    // Small constant gravity curves particle arcs downward.
    particle.vy += 0.05;
    // 0.03 per frame means particles fully vanish after ~33 frames.
    particle.life -= 0.03;
    if (particle.life <= 0) particles.splice(particleIndex, 1);


  }
}

// ============================================================
// DRAWING: PLAYER SHIP
// The ship is made of layered canvas paths — no images needed.
//
// POLYGON MATH: ctx.moveTo / lineTo trace a series of (x, y) points.
// The coordinates are expressed relative to the player’s top-left
// corner (player.x, player.y) and scaled by player.w / player.h so
// the ship proportions stay correct at any size.
//
// ELLIPSE: ctx.ellipse(cx, cy, rx, ry, rotation, startAngle, endAngle)
//   cx, cy  — center of the ellipse in canvas pixels
//   rx, ry  — horizontal and vertical radii
//   rotation — tilt of the whole ellipse in radians (0 = upright)
//   0 → Math.PI * 2 traces the full 360° circumference.
// ============================================================

function drawPlayer() {
  const { x, y, w, h } = player;
  ctx.save();

  // Shield bubble: a pulsing ellipse that wraps the ship.
  // Math.sin(Date.now() / 100) produces a value between -1 and +1
  // that completes one full cycle about every 628ms (2π × 100ms).
  // Scaling to 0.4 and shifting by +0.6 maps the output to [0.2, 1.0]
  // so the opacity never drops completely to zero.
  if (powerups.shield > 0) {
    const pulse = Math.sin(Date.now() / 100) * 0.4 + 0.6;
    ctx.shadowColor = "#00ccff";
    ctx.shadowBlur = 20 * pulse;
    ctx.strokeStyle = `rgba(0,200,255,${pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();

  
// Ellipse radii (w * 0.8, h * 0.9) are slightly smaller than the
// ship hitbox so the shield visually wraps snugly around it.
ctx.ellipse(x + w / 2, y + h / 2, w * 0.8, h * 0.9, 0, 0, Math.PI * 2);
ctx.stroke();


  }

  // Main hull polygon. Points are defined as fractions of w and h
  // so the shape scales correctly with the player’s bounding box.
  // Nose at top-center, wings flaring out to bottom-left and bottom-right.
  ctx.shadowColor = "#00ff88";
  ctx.shadowBlur = 15;
  ctx.fillStyle = "#00ff88";
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);              // nose tip (top center)
  ctx.lineTo(x + w, y + h);          // right wing tip (bottom right)
  ctx.lineTo(x + w * 0.7, y + h * 0.75);
  ctx.lineTo(x + w * 0.5, y + h * 0.85);  // center indent between engines
  ctx.lineTo(x + w * 0.3, y + h * 0.75);
  ctx.lineTo(x, y + h);          // left wing tip (bottom left)
  ctx.closePath();
  ctx.fill();

  // Cockpit diamond drawn on top of the hull for depth.
  // A diamond is a four-point polygon with one point up, one down,
  // one left, and one right — mirrored across both center axes.
  ctx.fillStyle = "#00ccff";
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + 4);          // top of diamond
  ctx.lineTo(x + w * 0.65, y + h * 0.55);   // right
  ctx.lineTo(x + w / 2, y + h * 0.6);    // bottom
  ctx.lineTo(x + w * 0.35, y + h * 0.55);   // left
  ctx.closePath();
  ctx.fill();

  // Engine flame: a randomly sized ellipse below the hull center.
  // (Date.now() / 5) % 60 + 20 cycles the hue between 20° (orange)
  // and 80° (yellow) in HSL color space about 12 times per second,
  // simulating flickering fire. Math.random() adds per-frame jitter
  // to the vertical radius so the flame never looks perfectly still.
  ctx.fillStyle = `hsl(${(Date.now() / 5) % 60 + 20}, 100%, 60%)`;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h + Math.random() * 3, 6, 10 + Math.random() * 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.restore();
}

// ============================================================
// DRAWING: ENEMIES
// Each enemy type has its own look so the player can read the
// battlefield at a glance and prioritise targets.
//
// ARC MATH: ctx.arc(cx, cy, radius, startAngle, endAngle)
// Angles are measured in radians from the 3 o’clock position,
// going clockwise. 0 → Math.PI * 2 draws a complete circle.
// One full revolution = 2π radians ≈ 6.28 radians.
//
// quadraticCurveTo(cpx, cpy, x, y) draws a curved line to (x, y)
// with (cpx, cpy) acting as the pull point that bends the curve.
// ============================================================

function drawEnemy(enemy) {
  ctx.save();
  const centerX = enemy.x + enemy.w / 2;
  const centerY = enemy.y + enemy.h / 2;

  if (enemy.type === "boss") {
    // Boss: two concentric ellipses (outer shell + inner core).
    // Radii are half the boss’s w/h so they fill the bounding box exactly.
    ctx.shadowColor = "#ff4400"; ctx.shadowBlur = 20;
    ctx.fillStyle = "#ff2200";
    ctx.beginPath(); ctx.ellipse(centerX, centerY, enemy.w / 2, enemy.h / 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff6600";
    ctx.beginPath(); ctx.ellipse(centerX, centerY, enemy.w / 3, enemy.h / 3, 0, 0, Math.PI * 2); ctx.fill();


// Health bar: red fill scaled by current hp / max hp ratio.
// Bar width = enemy.w * (hp / maxHp), so it shrinks linearly with health.
const hpPercent = enemy.hp / enemy.maxHp;
ctx.fillStyle = "#ff000044"; ctx.fillRect(enemy.x, enemy.y - 10, enemy.w, 5);
ctx.fillStyle = "#ff4400"; ctx.fillRect(enemy.x, enemy.y - 10, enemy.w * hpPercent, 5);

// Three cannon barrels evenly spaced below the boss center.
// barrelOffset is -1, 0, +1; multiplying by 18 spaces them 18px apart
// and centering each 6px-wide barrel with the -3 offset.
ctx.fillStyle = "#880000";
for (let barrelOffset = -1; barrelOffset <= 1; barrelOffset++) {
  ctx.fillRect(centerX + barrelOffset * 18 - 3, centerY + 12, 6, 14);
}


  } else if (enemy.type === "elite") {
    // Elite: glowing jellyfish alien with animated tentacles.
    // The ellipse radii are 40% and 38% of the bounding box so it
    // stays roughly oval without touching the edges.
    ctx.shadowColor = "#ff44ff"; ctx.shadowBlur = 12;
    ctx.fillStyle = "#dd00ff";
    ctx.beginPath(); ctx.ellipse(centerX, centerY - 2, enemy.w * 0.4, enemy.h * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ff44ff"; ctx.lineWidth = 3;

// The control point Y alternates between 0.35 and 0.45 of the
// bounding box height (driven by enemy.frame) to fake a swimming animation — higher control point = more curved stroke.
for (const side of [-1, 1]) {
  ctx.beginPath();
  ctx.moveTo(centerX + side * enemy.w * 0.25, centerY + enemy.h * 0.15);
  ctx.quadraticCurveTo(
  centerX + side * enemy.w * 0.45,
  centerY + enemy.h * (enemy.frame ? 0.35 : 0.45),
  centerX + side * enemy.w * 0.38,
  centerY + enemy.h * 0.5
  );
  ctx.stroke();
}
// Two white outer eyes with purple pupils.
// Each eye is two circles: radius 4 (white) and radius 2 (purple).
ctx.fillStyle = "#fff";
ctx.beginPath(); ctx.arc(centerX - 5, centerY - 4, 4, 0, Math.PI * 2); ctx.fill();
ctx.beginPath(); ctx.arc(centerX + 5, centerY - 4, 4, 0, Math.PI * 2); ctx.fill();
ctx.fillStyle = "#ff00ff";
ctx.beginPath(); ctx.arc(centerX - 5, centerY - 4, 2, 0, Math.PI * 2); ctx.fill();
ctx.beginPath(); ctx.arc(centerX + 5, centerY - 4, 2, 0, Math.PI * 2); ctx.fill();


  } else if (enemy.type === "medium") {
    // Medium: a diamond / rotated square for quick visual recognition.
    // The four points sit at the top, right, bottom, and left midpoints
    // of the bounding box exactly like a square rotated 45°.
    ctx.shadowColor = "#00ccff"; ctx.shadowBlur = 10;
    ctx.fillStyle = "#0088cc";
    ctx.beginPath();
    ctx.moveTo(centerX, enemy.y + 2);// top
    ctx.lineTo(enemy.x + enemy.w, centerY);// right
    ctx.lineTo(centerX, enemy.y + enemy.h - 2);// bottom
    ctx.lineTo(enemy.x, centerY);// left
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#00ffff"; ctx.beginPath(); ctx.arc(centerX, centerY, enemy.w * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#004466"; ctx.fillRect(enemy.x, centerY - 3, enemy.w, 6);
  } else {
    // Basic: a small tank-like alien with animated leg nubs.
    // The frame toggle offsets the nubs by 2px to fake a walking cycle —
    // on even frames they shift left; on odd frames they shift right.
    ctx.shadowColor = "#00ff88"; ctx.shadowBlur = 8;
    ctx.fillStyle = "#006633"; ctx.fillRect(enemy.x + 2, enemy.y + 5, enemy.w - 4, enemy.h - 10);
    ctx.fillStyle = "#00ff88";


    ctx.fillRect(enemy.x + (enemy.frame ? 2 : 0), enemy.y, 6, 8);
    ctx.fillRect(enemy.x + enemy.w - 6 - (enemy.frame ? 2 : 0), enemy.y, 6, 8);
    ctx.fillRect(enemy.x, enemy.y + enemy.h - 8, 5, 5);
    ctx.fillRect(enemy.x + enemy.w - 5, enemy.y + enemy.h - 8, 5, 5);
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(centerX - 4, centerY, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(centerX + 4, centerY, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff0000";
    ctx.beginPath(); ctx.arc(centerX - 4, centerY, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(centerX + 4, centerY, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = 0; ctx.restore();
}

//drawing of bullets
// Explosive bullets render as a glowing orb. Regular bullets are simple rectangles for clarity at high speed.
// The -bullet.h / 2 offset on fillRect centers the rectangle
// vertically on the bullet’s y coordinate instead of anchoring
// at the top-left corner, keeping the visual aligned with the collision box.

function drawBullet(bullet, isEnemy) {
  ctx.save();
  if (!isEnemy && bullet.explosive) {
    ctx.shadowColor = "#ff4422"; ctx.shadowBlur = 12;
    ctx.fillStyle = "#ff6600";
    ctx.beginPath(); ctx.arc(bullet.x, bullet.y - bullet.h / 2, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffaa00";
    ctx.beginPath(); ctx.arc(bullet.x, bullet.y - bullet.h / 2, 2.5, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.shadowColor = isEnemy ? "#ff4400" : "#00ffcc";
    ctx.shadowBlur = 8;
    ctx.fillStyle = isEnemy ? "#ff6600" : "#00ffcc";
// Subtract half width and half height so the rectangle is centered
// on (bullet.x, bullet.y) rather than drawn from the top-left corner.
ctx.fillRect(bullet.x - bullet.w / 2, bullet.y - bullet.h / 2, bullet.w, bullet.h);


  }
  ctx.restore();
}
// powerup drawings
// Each gem type has a unique icon shape so color-blind players
// can still distinguish them. A sine-wave pulse drives the glow ring.
//
// SINE WAVE ANIMATION: Math.sin(drop.pulse) * 0.3 + 0.7 sin() oscillates between -1 and +1. Scaling by 0.3 tightens
// the range to [-0.3, 0.3], then shifting by +0.7 maps it to [0.4, 1.0] — a gentle breathing glow that never reaches zero.
// spinning star drawing: ctx.translate + ctx.rotate positions and tilts the canvas coordinate system before drawing, so the star appears to
// spin in place. spin increases each frame in moveDrops so the rotation angle grows over time.

function drawDrop(drop) {
  ctx.save();
  const color = powerUpColors[drop.type];
  const centerX = drop.x + drop.w / 2;
  const centerY = drop.y + drop.h / 2;

  // pulse ranges from 0.4 to 1.0, giving a gentle breathing glow.
  const pulse = Math.sin(drop.pulse) * 0.3 + 0.7;
  const spin = drop.pulse;

  ctx.shadowColor = color;
  ctx.shadowBlur = 14 * pulse;

  // Outer glow ring fades in and out with the pulse.
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.3 * pulse;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(centerX, centerY, 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (drop.type === "doubleShot") {
    // Two small diamonds side by side to suggest twin barrels.
    ctx.fillStyle = color;
    for (const offsetX of [-5, 5]) {
      ctx.beginPath();
      ctx.moveTo(centerX + offsetX, centerY - 7);
      ctx.lineTo(centerX + offsetX + 4, centerY);
      ctx.lineTo(centerX + offsetX, centerY + 7);
      ctx.lineTo(centerX + offsetX - 4, centerY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = "#fff";
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(centerX, centerY - 7); ctx.lineTo(centerX, centerY + 7); ctx.stroke();
    ctx.globalAlpha = 1;

  } else if (drop.type === "shield") {
    // Classic kite-shaped shield icon with an inner cross.
    ctx.fillStyle = color + "44";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - 9);
    ctx.lineTo(centerX + 8, centerY - 4);
    ctx.lineTo(centerX + 8, centerY + 3);
    ctx.quadraticCurveTo(centerX + 8, centerY + 10, centerX, centerY + 13);
    ctx.quadraticCurveTo(centerX - 8, centerY + 10, centerX - 8, centerY + 3);
    ctx.lineTo(centerX - 8, centerY - 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(centerX, centerY - 4); ctx.lineTo(centerX, centerY + 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(centerX - 4, centerY + 1); ctx.lineTo(centerX + 4, centerY + 1); ctx.stroke();
    ctx.globalAlpha = 1;

  } else if (drop.type === "speed") {
    // Lightning bolt: a zigzag polygon that reads instantly as electricity.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(centerX + 2, centerY - 10);
    ctx.lineTo(centerX - 4, centerY + 1);
    ctx.lineTo(centerX + 1, centerY + 1);
    ctx.lineTo(centerX - 2, centerY + 10);
    ctx.lineTo(centerX + 5, centerY - 1);
    ctx.lineTo(centerX, centerY - 1);
    ctx.closePath();
    ctx.fill();

  } else if (drop.type === "explosive") {
    // A 6-point star that rotates over time.
    // We alternate between outerRadius (spike tips) and innerRadius
    // (valleys between spikes) as we step around the circle.
    // Dividing the full circle (2π radians) into spikeCount * 2 equal
    // steps gives the correct angle for each tip and valley point.
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(spin * 0.6);
    ctx.fillStyle = color;
    const spikeCount = 6, outerRadius = 9, innerRadius = 4.5;
    ctx.beginPath();
    for (let spikeIndex = 0; spikeIndex < spikeCount * 2; spikeIndex++) {
    const radius = spikeIndex % 2 === 0 ? outerRadius : innerRadius;
    // Angle for this point: evenly divide 2π among all spike tips and valleys.
    // spikeIndex * pi / spikeCount steps through the circle in equal increments.
    const angle = (spikeIndex * Math.PI) / spikeCount;
    spikeIndex === 0 ? ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
    : ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
    ctx.shadowBlur = 0;
    ctx.restore();
  }
  // draw for power up hud
  // Active power-ups render as small cards in the top-right corner.
  // Each card shows a color swatch, label, countdown, and progress bar.
  function drawPowerupHUD() {
    const activePowerups = Object.entries(powerups).filter(([, frames]) => frames > 0);
    if (activePowerups.length === 0) return;

    ctx.save();
    const cardWidth = 110, cardHeight = 28, cardGap = 6;
    const startX = W - cardWidth - 8;
    const startY = 8;

    activePowerups.forEach(([key, frames], cardIndex) => {
      const color = powerUpColors[key];
      const label = powerUpLabels[key];


    // pct is 1.0 when fresh, shrinking toward 0 as the timer runs down.
    const pct = frames / powerUpDuration;
    const cardX = startX;
    const cardY = startY + cardIndex * (cardHeight + cardGap);

    // Semi-transparent dark card background with a colored border.
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.strokeStyle = color + "88";
    ctx.lineWidth = 1;
    roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 6);
    ctx.fill();
    ctx.stroke();

    // Solid color swatch on the left side of the card.
    ctx.fillStyle = color;
    roundRect(ctx, cardX + 1, cardY + 1, 22, cardHeight - 2, [5, 0, 0, 5]);
    ctx.fill();

    // Mini icon inside the swatch using the same shape as the drop gem.
    ctx.save();
    ctx.fillStyle = "#000";
    ctx.globalAlpha = 0.55;
    drawMiniIcon(key, cardX + 12, cardY + cardHeight / 2);
    ctx.restore();

    // Power-up label text.
    ctx.fillStyle = "#fff";
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.fillText(label, cardX + 28, cardY + 10);
    ctx.shadowBlur = 0;

    // Seconds remaining, rounded up so it shows 1 right before expiry.
    const secondsLeft = Math.ceil(frames / 60);
    ctx.fillStyle = color;
    ctx.font = "7px monospace";
    ctx.textAlign = "right";
    ctx.fillText(secondsLeft + "s", cardX + cardWidth - 5, cardY + 10);

    // Progress bar track (dim) and fill (bright, shrinks as time runs out).
    const barX = cardX + 28, barY = cardY + 19, barW = cardWidth - 34, barH = 4;
    ctx.fillStyle = color + "22";
    roundRect(ctx, barX, barY, barW, barH, 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    roundRect(ctx, barX, barY, barW * pct, barH, 2);
    ctx.fill();
    ctx.shadowBlur = 0;


    });

    ctx.restore();
  }
  //rounded rectangle path
  // Canvas doesn’t have a native roundRect in older browsers, so
  // this builds the path manually using quadraticCurveTo at each corner.
  // Each corner is drawn as two steps:
  //1. lineTo — moves along the straight edge up to the curve start.
  //2. quadraticCurveTo — bends around the corner using the actual corner point as the control point and the curve end as the destination. This produces a smooth arc of radius r.
  // r can be a single number (same radius on all corners) or an array
  // [topLeft, topRight, bottomRight, bottomLeft] for mixed radii.

  function roundRect(ctx, x, y, w, h, r) {
    if (typeof r === "number") r = [r, r, r, r];
    ctx.beginPath();
    ctx.moveTo(x + r[0], y);
    ctx.lineTo(x + w - r[1], y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r[1]);
    ctx.lineTo(x + w, y + h - r[2]);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r[2], y + h);
    ctx.lineTo(x + r[3], y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r[3]);
    ctx.lineTo(x, y + r[0]);
    ctx.quadraticCurveTo(x, y, x + r[0], y);
    ctx.closePath();
  }

  // Draws a tiny version of each gem icon inside the HUD swatch.
  function drawMiniIcon(type, centerX, centerY) {
    ctx.fillStyle = "#000";
    ctx.globalAlpha = 0.6;
    if (type === "doubleShot") {
      for (const offsetX of [-3, 3]) {
        ctx.fillRect(centerX + offsetX - 1, centerY - 5, 2, 10);
      }
    } else if (type === "shield") {
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - 5); ctx.lineTo(centerX + 4, centerY - 2);
      ctx.lineTo(centerX + 4, centerY + 2); ctx.quadraticCurveTo(centerX + 4, centerY + 6, centerX, centerY + 7);
      ctx.quadraticCurveTo(centerX - 4, centerY + 6, centerX - 4, centerY + 2);
      ctx.lineTo(centerX - 4, centerY - 2); ctx.closePath(); ctx.fill();
    } else if (type === "speed") {
      ctx.beginPath();
      ctx.moveTo(centerX + 1, centerY - 5); ctx.lineTo(centerX - 3, centerY); ctx.lineTo(centerX + 1, centerY);
      ctx.lineTo(centerX - 1, centerY + 5); ctx.lineTo(centerX + 4, centerY - 1); ctx.lineTo(centerX, centerY - 1);
      ctx.closePath(); ctx.fill();
    } else if (type === "explosive") {
      ctx.beginPath(); ctx.arc(centerX, centerY, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(centerX, centerY, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  //main call of the draw function
  // Clears the canvas, then renders the ground line, all game objects,
  // and finally the power-up HUD on top of everything.

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Subtle horizontal ground line to give the player a visual boundary.
    ctx.strokeStyle = "#00ff8833"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, H - 40); ctx.lineTo(W, H - 40); ctx.stroke();

    if (state === "playing" || state === "gameover") {
      for (const enemy of enemies) drawEnemy(enemy);
      for (const bullet of bullets) drawBullet(bullet, false);
      for (const enemyBullet of enemyBullets) drawBullet(enemyBullet, true);
      for (const drop of drops) drawDrop(drop);
      drawPlayer();


// Particles drawn last so they appear on top of everything.
for (const particle of particles) {
  ctx.save();
  ctx.globalAlpha = particle.life;
  ctx.fillStyle = particle.color; ctx.shadowColor = particle.color; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.arc(particle.x, particle.y, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
drawPowerupHUD();


    }

    // Title screen: darken the canvas and draw the instruction panel.
    if (state === "title") {
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(0, 0, W, H);
      drawInstructions();
    }
  }

  // requestAnimationFrame calls loop as fast as the display allows (typically 60 times per second). update() advances all game state,
  // draw() renders the current snapshot.

  function loop() { update(); draw(); requestAnimationFrame(loop); }

  
  //inputs for start of game

  document.addEventListener("keydown", keyboardEvent => {
    keys[keyboardEvent.key] = true;

    // Stop the space bar from scrolling the page while playing.
    if (keyboardEvent.key === " ") keyboardEvent.preventDefault();

  if (keyboardEvent.key === "Enter" && (state === "title" || state === "gameover")) init();
});
document.addEventListener("keyup", keyboardEvent => { keys[keyboardEvent.key] = false; });

loop();
