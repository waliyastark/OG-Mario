const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const TILE = 32;
const VIEW_W = canvas.width;
const VIEW_H = canvas.height;
const ROWS = Math.floor(VIEW_H / TILE);
const GROUND_ROW = 21;
const LEVEL_COLS = 280;
const LEVEL_W = LEVEL_COLS * TILE;
const GRAVITY = 0.62;
const MAX_FALL = 18;
const BONUS_ENTRY_PIPE = 57;
const BONUS_START_COL = 232;
const BONUS_EXIT_PIPE = 263;
const MAIN_RETURN_COL = 163;

const keys = {
  left: false,
  right: false,
  down: false,
  run: false,
  runPressed: false,
  jump: false,
  jumpPressed: false
};

const state = {
  cameraX: 0,
  score: 0,
  coins: 0,
  lives: 3,
  time: 400,
  timeAccumulator: 0,
  introTimer: 2.2,
  area: "main",
  pipeTimer: 0,
  finishPhase: null,
  finishTimer: 0,
  flagScore: 0,
  countdownAccumulator: 0,
  paused: false,
  won: false,
  gameOver: false,
  message: "WORLD 1-1",
  messageTimer: 2.4,
  fireworks: []
};

const solidTiles = new Set(["ground", "stone", "brick", "block", "hidden", "used", "pipeTopL", "pipeTopR", "pipeL", "pipeR", "stair"]);
const bumpableTiles = new Set(["brick", "block", "hidden"]);

const level = Array.from({ length: ROWS }, () => Array(LEVEL_COLS).fill(null));
const questionBlocks = new Map();
const brickContents = new Map();
const hiddenCoins = new Map();
const bumpOffsets = new Map();
const collectableCoins = [];
const particles = [];
const enemies = [];
const powerups = [];
const fireballs = [];
const floatingText = [];

const player = {
  x: 3 * TILE,
  y: (GROUND_ROW - 2) * TILE,
  w: 24,
  h: 32,
  vx: 0,
  vy: 0,
  facing: 1,
  onGround: false,
  jumpHold: 0,
  invincible: 0,
  shootCooldown: 0,
  big: false,
  fire: false,
  dead: false,
  winWalk: false,
  hiddenBehindCastle: false
};

function tileKey(c, r) {
  return `${c},${r}`;
}

function setTile(c, r, type) {
  if (c >= 0 && c < LEVEL_COLS && r >= 0 && r < ROWS) level[r][c] = type;
}

function getTile(c, r) {
  if (c < 0 || c >= LEVEL_COLS || r < 0 || r >= ROWS) return "ground";
  return level[r][c];
}

function isSolid(c, r) {
  return solidTiles.has(getTile(c, r));
}

function addCoin(c, r) {
  collectableCoins.push({
    x: c * TILE + 10,
    y: r * TILE + 8,
    w: 12,
    h: 18,
    collected: false
  });
}

function addGround(start, end) {
  for (let c = start; c <= end; c++) {
    setTile(c, GROUND_ROW, "ground");
    setTile(c, GROUND_ROW + 1, "ground");
    setTile(c, GROUND_ROW + 2, "ground");
  }
}

function addStone(start, end, topRow = GROUND_ROW) {
  for (let c = start; c <= end; c++) {
    for (let r = topRow; r < ROWS; r++) setTile(c, r, "stone");
  }
}

function addQuestion(c, r, kind = "coin") {
  setTile(c, r, "block");
  questionBlocks.set(tileKey(c, r), { kind, used: false });
}

function addHidden(c, r, kind = "coin") {
  setTile(c, r, "hidden");
  questionBlocks.set(tileKey(c, r), { kind, used: false, hidden: true });
}

function addBrick(c, r, content = null, count = 1) {
  setTile(c, r, "brick");
  if (content) brickContents.set(tileKey(c, r), { kind: content, count, used: false });
}

function addPipe(c, h) {
  const top = GROUND_ROW - h;
  setTile(c, top, "pipeTopL");
  setTile(c + 1, top, "pipeTopR");
  for (let r = top + 1; r <= GROUND_ROW - 1; r++) {
    setTile(c, r, "pipeL");
    setTile(c + 1, r, "pipeR");
  }
}

function isStandingOnPipe(c) {
  const center = Math.floor((player.x + player.w / 2) / TILE);
  const footRow = Math.floor((player.y + player.h + 2) / TILE);
  const underfoot = getTile(center, footRow);
  return player.onGround && (center === c || center === c + 1) && (underfoot === "pipeTopL" || underfoot === "pipeTopR");
}

function beginPipeTravel(targetArea) {
  state.pipeTimer = 0.7;
  state.pipeTarget = targetArea;
  player.vx = 0;
  player.vy = 0;
}

function finishPipeTravel() {
  if (state.pipeTarget === "bonus") {
    state.area = "bonus";
    player.x = (BONUS_START_COL + 2) * TILE;
    player.y = (GROUND_ROW - 3) * TILE - player.h;
    state.cameraX = Math.max(0, player.x - VIEW_W * 0.25);
  } else {
    state.area = "main";
    player.x = (MAIN_RETURN_COL + 2) * TILE;
    player.y = (GROUND_ROW - 2) * TILE;
    state.cameraX = Math.max(0, player.x - VIEW_W * 0.36);
  }
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  state.pipeTimer = 0;
  state.pipeTarget = null;
}

function startFlagSequence() {
  const flagTop = (GROUND_ROW - 9) * TILE;
  const flagBottom = (GROUND_ROW - 1) * TILE - player.h;
  const heightScore = Math.max(100, Math.round((flagBottom - player.y) / TILE) * 500);
  state.won = true;
  state.finishPhase = "slide";
  state.finishTimer = 0;
  state.flagScore = Math.max(100, Math.min(5000, heightScore));
  state.score += state.flagScore;
  state.message = "";
  state.messageTimer = 0;
  player.x = 216 * TILE + 10;
  player.y = Math.max(flagTop, Math.min(flagBottom, player.y));
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.facing = 1;
  addFloatingText(String(state.flagScore), player.x - 14, player.y - 24);
}

function updateFinishSequence(dt) {
  const step = dt / 60;
  const groundY = GROUND_ROW * TILE - player.h;
  if (state.finishPhase === "slide") {
    player.y = Math.min(groundY, player.y + 3.2 * dt);
    player.x = 216 * TILE + 10;
    if (player.y >= groundY) {
      state.finishPhase = "walk";
      player.y = groundY;
      player.vx = 1.8;
    }
  } else if (state.finishPhase === "walk") {
    player.vx = 1.8;
    player.x += player.vx * dt;
    if (player.x > 220 * TILE + 42) player.hiddenBehindCastle = true;
    if (player.x > 223 * TILE) {
      state.finishPhase = "countdown";
      player.vx = 0;
      player.hiddenBehindCastle = true;
      state.finishTimer = 0;
      state.message = "COURSE CLEAR";
      state.messageTimer = 4;
    }
  } else if (state.finishPhase === "countdown") {
    state.finishTimer += step;
    state.countdownAccumulator += dt;
    while (state.time > 0 && state.countdownAccumulator >= 2) {
      state.time -= 1;
      state.score += 50;
      state.countdownAccumulator -= 2;
    }
  }
  updateParticles(dt);
  updateCamera();
}

function addStairs(c, h, reverse = false) {
  for (let step = 0; step < h; step++) {
    for (let y = 0; y <= step; y++) {
      const col = reverse ? c + h - 1 - step : c + step;
      setTile(col, GROUND_ROW - y - 1, "stair");
    }
  }
}

function addEnemy(c, type = "goomba") {
  enemies.push({
    type,
    x: c * TILE,
    y: (GROUND_ROW - 1) * TILE - 26,
    w: type === "koopa" ? 26 : 28,
    h: type === "koopa" ? 42 : 28,
    vx: type === "koopa" ? -0.65 : -0.8,
    vy: 0,
    alive: true,
    squashed: 0,
    shell: false
  });
}

function makeLevel() {
  addGround(0, 68);
  addGround(71, 86);
  addGround(89, 153);
  addGround(156, 225);

  addQuestion(16, 16, "coin");
  addBrick(20, 16, "multiCoin", 8);
  addQuestion(21, 16, "mushroom");
  addBrick(22, 16);
  addQuestion(23, 16, "coin");
  addBrick(24, 16);
  addQuestion(22, 12, "coin");
  [9, 10, 11, 12, 13].forEach(c => addCoin(c, 17));

  addPipe(28, 2);
  addPipe(38, 3);
  addPipe(46, 4);
  addPipe(57, 4);
  addHidden(64, 13, "oneup");

  addBrick(77, 16, "coin");
  addQuestion(78, 16, "mushroom");
  addBrick(79, 16);
  addBrick(80, 12);
  addBrick(81, 12, "multiCoin", 8);
  addQuestion(82, 12, "coin");
  addQuestion(83, 12, "coin");
  addBrick(84, 12);
  addBrick(85, 12);
  [73, 74, 75, 76, 77].forEach(c => addCoin(c, 13));

  for (let c = 91; c <= 94; c++) addBrick(c, 16, c === 92 ? "coin" : null);
  addQuestion(94, 12, "coin");
  addBrick(100, 16);
  addBrick(101, 16, "coin");
  addQuestion(106, 16, "coin");
  addQuestion(109, 16, "coin");
  addQuestion(112, 16, "coin");
  addBrick(109, 12, "multiCoin", 8);
  [103, 104, 105, 106, 107, 108].forEach(c => addCoin(c, 13));
  addQuestion(126, 16, "coin");
  addBrick(127, 16);
  addQuestion(128, 16, "coin");

  addStairs(134, 4);
  addStairs(140, 4, true);
  addStairs(148, 4);
  addStairs(155, 4, true);
  addPipe(163, 2);

  for (let c = 168; c <= 174; c++) addBrick(c, 16, c === 169 ? "coin" : null);
  addQuestion(170, 12, "coin");
  addBrick(174, 12);
  addBrick(177, 16);
  addQuestion(178, 16, "coin");
  addBrick(179, 16);
  [170, 171, 172, 173, 174].forEach(c => addCoin(c, 9));

  addStairs(181, 8);
  addStairs(190, 8, true);
  addStairs(199, 8);
  addStairs(208, 8, true);

  setTile(216, GROUND_ROW - 9, "flag");
  for (let r = GROUND_ROW - 8; r <= GROUND_ROW - 1; r++) setTile(216, r, "pole");

  for (let c = 220; c <= 224; c++) {
    for (let r = GROUND_ROW - 5; r <= GROUND_ROW - 1; r++) setTile(c, r, "castle");
  }

  [24, 32, 41, 52, 65, 83, 98, 114, 118, 123, 129, 159, 165, 176].forEach(c => addEnemy(c));
  [72, 90, 111, 121, 128, 171].forEach(c => addEnemy(c, "koopa"));

  makeBonusRoom();
}

function makeBonusRoom() {
  addStone(BONUS_START_COL, BONUS_EXIT_PIPE + 5);
  addPipe(BONUS_START_COL + 1, 3);
  for (let c = BONUS_START_COL; c <= BONUS_EXIT_PIPE + 5; c++) {
    setTile(c, 2, "stone");
    setTile(c, 3, "stone");
  }
  for (let c = BONUS_START_COL + 4; c <= BONUS_START_COL + 18; c++) addBrick(c, 15, c === BONUS_START_COL + 10 ? "multiCoin" : null, 8);
  for (let c = BONUS_START_COL + 5; c <= BONUS_START_COL + 17; c++) addCoin(c, 13);
  for (let c = BONUS_START_COL + 8; c <= BONUS_START_COL + 15; c++) addCoin(c, 10);
  addBrick(BONUS_START_COL + 21, 16);
  addBrick(BONUS_START_COL + 22, 16, "coin");
  addQuestion(BONUS_START_COL + 23, 16, "coin");
  addBrick(BONUS_START_COL + 24, 16);
  addPipe(BONUS_EXIT_PIPE, 3);
}

function rects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function addFloatingText(text, x, y) {
  floatingText.push({ text, x, y, vy: -0.55, ttl: 1.0 });
}

function shootFireball() {
  if (!player.fire || player.shootCooldown > 0 || fireballs.length >= 2 || state.won || player.dead) return;
  fireballs.push({
    x: player.x + (player.facing > 0 ? player.w : -10),
    y: player.y + player.h - 16,
    w: 10,
    h: 10,
    vx: player.facing * 7.5,
    vy: 2.2,
    ttl: 3
  });
  player.shootCooldown = 0.32;
}

function spawnCoin(c, r) {
  particles.push({ type: "coin", x: c * TILE + 10, y: r * TILE - 8, vy: -7, ttl: 0.75 });
  state.coins += 1;
  state.score += 200;
}

function spawnBrickBits(c, r) {
  for (let i = 0; i < 4; i++) {
    particles.push({
      type: "brick",
      x: c * TILE + 8 + (i % 2) * 14,
      y: r * TILE + 8 + Math.floor(i / 2) * 12,
      vx: i % 2 ? 2 : -2,
      vy: i < 2 ? -7 : -4,
      ttl: 1
    });
  }
}

function spawnPowerup(c, r, kind) {
  if (kind === "coin") {
    spawnCoin(c, r);
    return;
  }
  if (kind === "mushroom" && player.big) kind = "flower";
  const isOneUp = kind === "oneup";
  const isFlower = kind === "flower";
  powerups.push({
    kind,
    x: c * TILE + 2,
    y: r * TILE - 2,
    w: 28,
    h: 28,
    vx: isFlower ? 0 : isOneUp ? 1.6 : 1.1,
    vy: -1,
    reveal: 0.7,
    stationary: isFlower
  });
}

function bumpTile(c, r) {
  const type = getTile(c, r);
  if (!bumpableTiles.has(type)) return;
  const key = tileKey(c, r);
  bumpOffsets.set(key, { t: 0, y: 0 });
  if (type === "block" || type === "hidden") {
    const q = questionBlocks.get(key);
    if (q && !q.used) {
      q.used = true;
      setTile(c, r, "used");
      spawnPowerup(c, r, q.kind);
    }
    return;
  }
  const brickContent = brickContents.get(key);
  if (brickContent && !brickContent.used) {
    spawnCoin(c, r);
    brickContent.count -= 1;
    if (brickContent.kind === "coin" || brickContent.count <= 0) {
      brickContent.used = true;
      setTile(c, r, "used");
    }
    return;
  }
  if (player.big) {
    setTile(c, r, null);
    brickContents.delete(key);
    spawnBrickBits(c, r);
    state.score += 50;
  } else {
    particles.push({ type: "bump", x: c * TILE, y: r * TILE, ttl: 0.2 });
  }
}

function moveEntity(entity, dt) {
  entity.vy = Math.min(MAX_FALL, entity.vy + GRAVITY);
  entity.x += entity.vx * dt;
  collideX(entity);
  entity.y += entity.vy * dt;
  collideY(entity);
}

function collideX(entity) {
  const left = Math.floor(entity.x / TILE);
  const right = Math.floor((entity.x + entity.w - 1) / TILE);
  const top = Math.floor(entity.y / TILE);
  const bottom = Math.floor((entity.y + entity.h - 1) / TILE);
  for (let r = top; r <= bottom; r++) {
    for (let c = left; c <= right; c++) {
      if (!isSolid(c, r)) continue;
      if (entity.vx > 0) entity.x = c * TILE - entity.w;
      if (entity.vx < 0) entity.x = (c + 1) * TILE;
      entity.vx = entity.enemy ? -entity.vx : 0;
    }
  }
}

function collideY(entity) {
  entity.onGround = false;
  const left = Math.floor(entity.x / TILE);
  const right = Math.floor((entity.x + entity.w - 1) / TILE);
  const top = Math.floor(entity.y / TILE);
  const bottom = Math.floor((entity.y + entity.h - 1) / TILE);
  for (let r = top; r <= bottom; r++) {
    for (let c = left; c <= right; c++) {
      if (!isSolid(c, r)) continue;
      if (entity.vy > 0) {
        entity.y = r * TILE - entity.h;
        entity.vy = 0;
        entity.onGround = true;
      } else if (entity.vy < 0) {
        entity.y = (r + 1) * TILE;
        entity.vy = 0;
        if (entity === player) bumpTile(c, r);
      }
    }
  }
}

function hurtPlayer() {
  if (player.invincible > 0 || player.dead || state.won) return;
  if (player.fire) {
    player.fire = false;
    player.invincible = 2;
    return;
  }
  if (player.big) {
    player.big = false;
    player.h = 32;
    player.y += 16;
    player.invincible = 2;
    return;
  }
  player.dead = true;
  player.vy = -11;
  player.vx = 0;
  state.lives -= 1;
  state.message = state.lives > 0 ? "TRY AGAIN" : "GAME OVER";
  state.messageTimer = 3;
}

function resetPlayer() {
  player.x = 3 * TILE;
  player.y = (GROUND_ROW - 2) * TILE;
  player.vx = 0;
  player.vy = 0;
  player.dead = false;
  player.big = false;
  player.fire = false;
  player.h = 32;
  player.winWalk = false;
  player.hiddenBehindCastle = false;
  player.invincible = 1.5;
  state.cameraX = 0;
  state.time = 400;
  state.area = "main";
  state.pipeTimer = 0;
  state.pipeTarget = null;
  state.finishPhase = null;
  state.finishTimer = 0;
  state.flagScore = 0;
  state.countdownAccumulator = 0;
  if (state.lives <= 0) state.gameOver = true;
}

function updatePlayer(dt) {
  if (state.pipeTimer > 0) {
    player.y += 1.6 * dt;
    return;
  }

  if (player.dead) {
    player.vy += GRAVITY * 0.8;
    player.y += player.vy * dt;
    if (player.y > VIEW_H + 100 && !state.gameOver) resetPlayer();
    return;
  }

  if (state.won) {
    return;
  }

  if (keys.down && state.area === "main" && isStandingOnPipe(BONUS_ENTRY_PIPE)) {
    beginPipeTravel("bonus");
    return;
  }
  if (keys.down && state.area === "bonus" && isStandingOnPipe(BONUS_EXIT_PIPE)) {
    beginPipeTravel("main");
    return;
  }
  if (keys.runPressed) shootFireball();
  if (player.shootCooldown > 0) player.shootCooldown -= dt / 60;

  const accel = player.onGround ? 0.54 : 0.28;
  const maxSpeed = keys.run ? 5.1 : 3.2;
  if (keys.left) {
    player.vx -= accel;
    player.facing = -1;
  }
  if (keys.right) {
    player.vx += accel;
    player.facing = 1;
  }
  if (!keys.left && !keys.right) {
    player.vx *= player.onGround ? 0.78 : 0.95;
  }
  player.vx = Math.max(-maxSpeed, Math.min(maxSpeed, player.vx));

  if (keys.jumpPressed && player.onGround) {
    player.vy = keys.run ? -13.2 : -12;
    player.onGround = false;
    player.jumpHold = 0.24;
  }
  if (keys.jump && player.jumpHold > 0 && player.vy < 0) {
    player.vy -= 0.28;
    player.jumpHold -= dt / 60;
  } else {
    player.jumpHold = 0;
  }

  moveEntity(player, dt);
  if (player.x < state.cameraX + 8) {
    player.x = state.cameraX + 8;
    player.vx = 0;
  }
  if (player.y > VIEW_H + 80) hurtPlayer();
  if (player.invincible > 0) player.invincible -= dt / 60;

  const flagX = 216 * TILE;
  if (state.area === "main" && player.x + player.w > flagX && player.y < GROUND_ROW * TILE) {
    startFlagSequence();
  }
}

function updateEnemies(dt) {
  for (const e of enemies) {
    if (!e.alive) continue;
    if (Math.abs(e.x - player.x) > VIEW_W * 1.3) continue;
    if (e.squashed > 0) {
      e.squashed -= dt / 60;
      if (e.squashed <= 0) e.alive = false;
      continue;
    }
    e.enemy = true;
    moveEntity(e, dt);
    const ahead = e.vx > 0 ? Math.floor((e.x + e.w + 2) / TILE) : Math.floor((e.x - 2) / TILE);
    const foot = Math.floor((e.y + e.h + 3) / TILE);
    if (!isSolid(ahead, foot)) e.vx *= -1;
    if (e.y > VIEW_H + 200) e.alive = false;

    if (e.shell && Math.abs(e.vx) > 0.5) {
      for (const target of enemies) {
        if (target === e || !target.alive || target.squashed > 0) continue;
        if (rects(e, target)) {
          target.alive = false;
          state.score += 200;
          addFloatingText("200", target.x, target.y);
        }
      }
    }

    if (!player.dead && rects(player, e)) {
      if (player.vy > 0 && player.y + player.h - e.y < 22) {
        if (e.shell) {
          e.vx = 0;
          player.vy = -8;
          state.score += 100;
          addFloatingText("100", e.x, e.y);
        } else if (e.type === "koopa") {
          e.shell = true;
          e.h = 24;
          e.y += 18;
          e.vx = 0;
          player.vy = -8;
          state.score += 100;
          addFloatingText("100", e.x, e.y);
        } else {
          e.squashed = 0.25;
          e.vx = 0;
          e.h = 12;
          e.y += 16;
          player.vy = -8;
          state.score += 100;
          addFloatingText("100", e.x, e.y);
        }
      } else if (e.shell && Math.abs(e.vx) < 0.2) {
        e.vx = player.x + player.w / 2 < e.x + e.w / 2 ? 7.2 : -7.2;
        e.facing = Math.sign(e.vx);
        player.vx = -Math.sign(e.vx) * 2.2;
        state.score += 100;
        addFloatingText("100", e.x, e.y);
      } else {
        hurtPlayer();
      }
    }
  }
}

function updateFireballs(dt) {
  for (const f of fireballs) {
    f.ttl -= dt / 60;
    f.vy = Math.min(10, f.vy + GRAVITY * 0.65);

    f.x += f.vx * dt;
    const xLeft = Math.floor(f.x / TILE);
    const xRight = Math.floor((f.x + f.w - 1) / TILE);
    const xTop = Math.floor(f.y / TILE);
    const xBottom = Math.floor((f.y + f.h - 1) / TILE);
    for (let r = xTop; r <= xBottom; r++) {
      for (let c = xLeft; c <= xRight; c++) {
        if (isSolid(c, r)) f.ttl = 0;
      }
    }

    f.y += f.vy * dt;
    const left = Math.floor(f.x / TILE);
    const right = Math.floor((f.x + f.w - 1) / TILE);
    const top = Math.floor(f.y / TILE);
    const bottom = Math.floor((f.y + f.h - 1) / TILE);
    for (let r = top; r <= bottom; r++) {
      for (let c = left; c <= right; c++) {
        if (!isSolid(c, r)) continue;
        if (f.vy > 0) {
          f.y = r * TILE - f.h;
          f.vy = -6.2;
        } else {
          f.ttl = 0;
        }
      }
    }

    for (const e of enemies) {
      if (!e.alive || e.squashed > 0) continue;
      if (rects(f, e)) {
        e.alive = false;
        f.ttl = 0;
        state.score += 200;
        addFloatingText("200", e.x, e.y);
      }
    }
  }
  for (let i = fireballs.length - 1; i >= 0; i--) {
    if (fireballs[i].ttl <= 0 || fireballs[i].x < state.cameraX - 80 || fireballs[i].x > state.cameraX + VIEW_W + 160) {
      fireballs.splice(i, 1);
    }
  }
}

function updatePowerups(dt) {
  for (const p of powerups) {
    if (p.reveal > 0) {
      p.reveal -= dt / 60;
      p.y -= 0.5 * dt;
    } else if (!p.stationary) {
      moveEntity(p, dt);
    }
    if (rects(player, p)) {
      p.collected = true;
      if (p.kind === "oneup") {
        state.lives += 1;
        state.score += 1000;
        addFloatingText("1UP", player.x, player.y);
      } else {
        player.big = true;
        player.fire = p.kind === "flower";
        player.h = 48;
        player.y -= 16;
        state.score += 1000;
        addFloatingText("1000", player.x, player.y);
      }
    }
  }
  for (let i = powerups.length - 1; i >= 0; i--) {
    if (powerups[i].collected || powerups[i].y > VIEW_H + 80) powerups.splice(i, 1);
  }
}

function updateParticles(dt) {
  for (const coin of collectableCoins) {
    if (!coin.collected && rects(player, coin)) {
      coin.collected = true;
      state.coins += 1;
      state.score += 200;
      addFloatingText("200", coin.x, coin.y);
    }
  }
  for (const p of particles) {
    p.ttl -= dt / 60;
    if (p.type === "coin") p.vy += 0.45;
    if (p.type === "brick") p.vy += 0.55;
    p.x += (p.vx || 0) * dt;
    p.y += (p.vy || 0) * dt;
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].ttl <= 0) particles.splice(i, 1);
  }
  for (const f of floatingText) {
    f.ttl -= dt / 60;
    f.y += f.vy * dt;
  }
  for (let i = floatingText.length - 1; i >= 0; i--) {
    if (floatingText[i].ttl <= 0) floatingText.splice(i, 1);
  }
  for (const [key, bump] of bumpOffsets) {
    bump.t += dt / 60;
    const phase = Math.min(1, bump.t / 0.18);
    bump.y = -Math.sin(phase * Math.PI) * 8;
    if (phase >= 1) bumpOffsets.delete(key);
  }
}

function updateCamera() {
  const target = player.x - VIEW_W * 0.38;
  state.cameraX = Math.max(0, Math.min(LEVEL_W - VIEW_W, Math.max(state.cameraX, target)));
}

function update(dt) {
  if (state.gameOver) return;
  if (state.introTimer > 0) {
    state.introTimer -= dt / 60;
    return;
  }
  if (state.pipeTimer > 0) {
    state.pipeTimer -= dt / 60;
    updatePlayer(dt);
    updateCamera();
    if (state.pipeTimer <= 0) finishPipeTravel();
    return;
  }
  if (state.won) {
    updateFinishSequence(dt);
    return;
  }
  if (state.messageTimer > 0) state.messageTimer -= dt / 60;
  if (!state.won && !player.dead) {
    state.timeAccumulator += dt / 60;
    if (state.timeAccumulator >= 1) {
      state.time -= 1;
      state.timeAccumulator = 0;
      if (state.time <= 0) hurtPlayer();
    }
  }
  updatePlayer(dt);
  updateEnemies(dt);
  updatePowerups(dt);
  updateFireballs(dt);
  updateParticles(dt);
  updateCamera();
  keys.jumpPressed = false;
  keys.runPressed = false;
}

function drawRect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawCircleBlock(x, y, size, color) {
  drawRect(x + size, y, size, size, color);
  drawRect(x, y + size, size * 3, size, color);
  drawRect(x + size, y + size * 2, size, size, color);
}

function drawTile(type, x, y) {
  if (!type || type === "hidden") return;
  if (type === "ground") {
    drawRect(x, y, TILE, TILE, "#c84c0c");
    drawRect(x, y, TILE, 6, "#ffcc4d");
    for (let i = 0; i < 4; i++) drawRect(x + i * 8, y + 10 + (i % 2) * 8, 6, 4, "#7c2c00");
  } else if (type === "brick") {
    drawRect(x, y, TILE, TILE, "#b84820");
    drawRect(x, y + 14, TILE, 3, "#581808");
    drawRect(x + 14, y, 3, 14, "#581808");
    drawRect(x + 4, y + 4, 6, 4, "#f89840");
  } else if (type === "block") {
    const flash = Math.floor(performance.now() / 220) % 4;
    const outer = ["#f8b800", "#f8d840", "#f8b800", "#e07800"][flash];
    const inner = ["#e07800", "#f8b800", "#d06000", "#f8d840"][flash];
    drawRect(x, y, TILE, TILE, outer);
    drawRect(x + 3, y + 3, TILE - 6, TILE - 6, inner);
    ctx.fillStyle = "#fff0a0";
    ctx.font = "bold 26px Courier New";
    ctx.fillText("?", x + 7, y + 25);
  } else if (type === "used") {
    drawRect(x, y, TILE, TILE, "#b88840");
    drawRect(x + 4, y + 4, TILE - 8, TILE - 8, "#8c642c");
  } else if (type === "stone") {
    drawRect(x, y, TILE, TILE, "#5c5c5c");
    drawRect(x, y + 14, TILE, 3, "#242424");
    drawRect(x + 14, y, 3, 14, "#242424");
    drawRect(x + 4, y + 4, 6, 4, "#8c8c8c");
  } else if (type.startsWith("pipe")) {
    const left = type.endsWith("L");
    drawRect(x, y, TILE, TILE, "#008800");
    drawRect(x + (left ? 5 : 0), y, left ? TILE - 5 : TILE - 5, TILE, "#00b800");
    drawRect(x + (left ? 4 : 0), y + 6, left ? 4 : TILE - 4, 5, "#7cff6b");
    if (type.startsWith("pipeTop")) drawRect(x, y, TILE, 8, "#7cff6b");
  } else if (type === "stair") {
    drawRect(x, y, TILE, TILE, "#b84820");
    drawRect(x + 4, y + 4, TILE - 8, TILE - 8, "#9c3818");
  } else if (type === "pole") {
    drawRect(x + 14, y, 4, TILE, "#d8f8d8");
  } else if (type === "flag") {
    drawRect(x + 14, y, 4, TILE, "#d8f8d8");
    drawRect(x + 18, y + 5, 30, 20, "#26a641");
  } else if (type === "castle") {
    drawRect(x, y, TILE, TILE, "#8c8c8c");
    drawRect(x + 3, y + 4, 8, 5, "#5c5c5c");
    drawRect(x + 19, y + 17, 8, 8, "#303030");
  }
}

function drawPlayer() {
  const x = player.x - state.cameraX;
  const y = player.y;
  if (player.invincible > 0 && Math.floor(performance.now() / 80) % 2 === 0) return;
  const cap = player.fire ? "#f8f8f8" : "#d82800";
  const shirt = player.fire ? "#f8f8f8" : player.big ? "#d82800" : "#b81800";
  const overalls = player.fire ? "#d82800" : "#0060b8";
  const skin = "#f8c080";
  const shoe = "#5c2c00";
  drawRect(x + 6, y + (player.big ? 0 : 2), 16, 8, cap);
  drawRect(x + 4, y + (player.big ? 8 : 10), 20, 12, skin);
  drawRect(x + (player.facing > 0 ? 18 : 2), y + (player.big ? 13 : 15), 5, 4, "#3c1c00");
  if (player.big) {
    drawRect(x + 4, y + 22, 22, 14, shirt);
    drawRect(x + 7, y + 32, 16, 13, overalls);
    drawRect(x + 3, y + 45, 9, 3, shoe);
    drawRect(x + 17, y + 45, 9, 3, shoe);
  } else {
    drawRect(x + 4, y + 22, 20, 8, shirt);
    drawRect(x + 6, y + 28, 16, 4, overalls);
  }
}

function drawEnemy(e) {
  const x = e.x - state.cameraX;
  const y = e.y;
  if (e.type === "koopa") {
    if (e.shell) {
      drawRect(x + 2, y + 4, 24, 18, "#2fa83b");
      drawRect(x + 6, y + 9, 16, 9, "#f8e090");
      return;
    }
    drawRect(x + 5, y, 16, 16, "#f8e090");
    drawRect(x + 2, y + 14, 22, 18, "#2fa83b");
    drawRect(x + 4, y + 32, 7, 8, "#f8e090");
    drawRect(x + 17, y + 32, 7, 8, "#f8e090");
  } else {
    const h = e.squashed > 0 ? 12 : 28;
    drawRect(x + 2, y + 28 - h, 24, h, "#8c4c20");
    drawRect(x + 6, y + 10, 4, 4, "#101010");
    drawRect(x + 18, y + 10, 4, 4, "#101010");
    drawRect(x, y + 24, 10, 5, "#101010");
    drawRect(x + 18, y + 24, 10, 5, "#101010");
  }
}

function drawPowerup(p) {
  const x = p.x - state.cameraX;
  const y = p.y;
  if (p.kind === "flower") {
    drawRect(x + 11, y + 16, 6, 12, "#20a038");
    drawRect(x + 4, y + 5, 20, 16, "#f8f8f8");
    drawRect(x + 7, y + 8, 14, 10, "#f04030");
    drawRect(x + 10, y + 10, 8, 6, "#ffd840");
    return;
  }
  const cap = p.kind === "oneup" ? "#28b840" : "#f04030";
  drawRect(x + 2, y + 6, 24, 14, cap);
  drawRect(x + 7, y + 2, 14, 22, "#f8f8f8");
  drawRect(x + 3, y + 18, 22, 10, "#f8c080");
}

function drawCloud(x, y) {
  drawRect(x + 18, y + 10, 48, 20, "#fff");
  drawRect(x + 30, y, 20, 20, "#fff");
  drawRect(x + 7, y + 18, 70, 14, "#fff");
  drawRect(x + 40, y + 23, 48, 10, "#fff");
}

function drawBush(x, y, wide = false) {
  drawRect(x + 8, y + 20, wide ? 110 : 72, 18, "#008800");
  drawCircleBlock(x + 17, y + 8, 8, "#00c000");
  drawCircleBlock(x + 45, y + 4, 10, "#00b800");
  if (wide) drawCircleBlock(x + 75, y + 9, 8, "#00c000");
}

function drawHill(x, y, scale = 1) {
  const s = scale;
  drawRect(x + 20 * s, y + 56 * s, 128 * s, 24 * s, "#00a840");
  drawRect(x + 36 * s, y + 32 * s, 96 * s, 28 * s, "#00b848");
  drawRect(x + 58 * s, y + 12 * s, 52 * s, 28 * s, "#00c850");
  drawRect(x + 70 * s, y + 24 * s, 10 * s, 10 * s, "#78f858");
  drawRect(x + 100 * s, y + 46 * s, 10 * s, 10 * s, "#78f858");
}

function drawFence(x, y, posts = 6) {
  for (let i = 0; i < posts; i++) {
    drawRect(x + i * 28, y, 8, 34, "#f8d878");
  }
  drawRect(x - 4, y + 9, posts * 28, 6, "#d8a038");
  drawRect(x - 4, y + 24, posts * 28, 6, "#d8a038");
}

function drawBackground() {
  if (state.area === "bonus") {
    drawRect(0, 0, VIEW_W, VIEW_H, "#000");
    return;
  }
  drawRect(0, 0, VIEW_W, VIEW_H, "#5c94fc");
  const cam = state.cameraX * 0.45;
  for (let i = 0; i < 10; i++) {
    const x = ((i * 520 - cam) % 1700 + 1700) % 1700 - 210;
    drawCloud(x, 72 + (i % 3) * 64);
    if (i % 2 === 0) drawCloud(x + 170, 150 + (i % 2) * 40);
  }
  const hillCam = state.cameraX * 0.62;
  for (let i = 0; i < 12; i++) {
    const x = i * 520 - hillCam;
    if (x > -220 && x < VIEW_W + 120) drawHill(x, GROUND_ROW * TILE - 104, i % 3 === 0 ? 1.15 : 0.85);
  }
  for (let i = 0; i < 18; i++) {
    const x = i * 330 - state.cameraX * 0.75;
    if (x > -140 && x < VIEW_W + 80) drawBush(x, GROUND_ROW * TILE - 42, i % 4 === 1);
  }
  for (let i = 0; i < 10; i++) {
    const x = i * 740 - state.cameraX * 0.82 + 120;
    if (x > -220 && x < VIEW_W + 80) drawFence(x, GROUND_ROW * TILE - 54, 5 + (i % 3));
  }
}

function drawHud() {
  ctx.fillStyle = "#fff";
  ctx.font = "bold 24px Courier New";
  ctx.textBaseline = "top";
  ctx.fillText("MARIO", 44, 28);
  ctx.fillText(String(state.score).padStart(6, "0"), 44, 56);
  ctx.fillText(`x${String(state.coins).padStart(2, "0")}`, 300, 56);
  ctx.fillText("WORLD", 510, 28);
  ctx.fillText("1-1", 535, 56);
  ctx.fillText("TIME", 760, 28);
  ctx.fillText(String(Math.max(0, state.time)).padStart(3, "0"), 782, 56);
  ctx.fillText(`LIVES ${state.lives}`, 44, 92);
  if (state.messageTimer > 0 || state.gameOver) {
    ctx.textAlign = "center";
    ctx.font = "bold 44px Courier New";
    ctx.fillText(state.message, VIEW_W / 2, 178);
    if (state.gameOver) {
      ctx.font = "bold 22px Courier New";
      ctx.fillText("PRESS ENTER", VIEW_W / 2, 235);
    }
    ctx.textAlign = "left";
  }
}

function drawIntro() {
  drawRect(0, 0, VIEW_W, VIEW_H, "#000");
  ctx.fillStyle = "#fff";
  ctx.font = "bold 28px Courier New";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText("MARIO", 315, 210);
  ctx.fillText("WORLD 1-1", 450, 330);
  ctx.fillText(`x ${state.lives}`, 455, 410);
  drawRect(390, 399, 16, 8, "#d82800");
  drawRect(386, 407, 24, 13, "#f8c080");
  drawRect(388, 420, 22, 10, "#b81800");
  drawRect(392, 430, 16, 6, "#0060b8");
}

function draw() {
  if (state.introTimer > 0) {
    drawIntro();
    return;
  }
  drawBackground();
  const first = Math.max(0, Math.floor(state.cameraX / TILE) - 1);
  const last = Math.min(LEVEL_COLS - 1, Math.ceil((state.cameraX + VIEW_W) / TILE) + 1);
  for (let r = 0; r < ROWS; r++) {
    for (let c = first; c <= last; c++) {
      const bump = bumpOffsets.get(tileKey(c, r));
      drawTile(level[r][c], c * TILE - state.cameraX, r * TILE + (bump ? bump.y : 0));
    }
  }
  for (const coin of collectableCoins) {
    if (coin.collected || coin.x < state.cameraX - 40 || coin.x > state.cameraX + VIEW_W + 40) continue;
    const spin = Math.abs(Math.sin(performance.now() / 180));
    const w = Math.max(4, coin.w * spin);
    drawRect(coin.x - state.cameraX + (coin.w - w) / 2, coin.y, w, coin.h, "#ffd840");
    drawRect(coin.x - state.cameraX + 4, coin.y + 3, 3, 12, "#fff090");
  }
  for (const p of particles) {
    if (p.type === "coin") {
      drawRect(p.x - state.cameraX, p.y, 12, 18, "#ffd840");
      drawRect(p.x + 4 - state.cameraX, p.y + 3, 4, 12, "#fff090");
    } else if (p.type === "brick") {
      drawRect(p.x - state.cameraX, p.y, 8, 8, "#b84820");
    }
  }
  for (const p of powerups) drawPowerup(p);
  for (const f of fireballs) {
    const pulse = Math.floor(performance.now() / 90) % 2;
    drawRect(f.x - state.cameraX, f.y, f.w, f.h, pulse ? "#ffb000" : "#f84020");
    drawRect(f.x + 3 - state.cameraX, f.y + 3, 4, 4, "#fff070");
  }
  for (const e of enemies) if (e.alive && e.x > state.cameraX - 80 && e.x < state.cameraX + VIEW_W + 80) drawEnemy(e);
  if (!player.hiddenBehindCastle) drawPlayer();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 18px Courier New";
  for (const f of floatingText) ctx.fillText(f.text, f.x - state.cameraX, f.y);
  drawHud();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(2.2, (now - last) / 16.67);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function restartGame() {
  state.score = 0;
  state.coins = 0;
  state.lives = 3;
  state.time = 400;
  state.introTimer = 2.2;
  state.area = "main";
  state.pipeTimer = 0;
  state.pipeTarget = null;
  state.finishPhase = null;
  state.finishTimer = 0;
  state.flagScore = 0;
  state.countdownAccumulator = 0;
  state.gameOver = false;
  state.won = false;
  state.message = "WORLD 1-1";
  state.messageTimer = 2.4;
  player.hiddenBehindCastle = false;
  player.winWalk = false;
  enemies.length = 0;
  powerups.length = 0;
  fireballs.length = 0;
  particles.length = 0;
  floatingText.length = 0;
  collectableCoins.length = 0;
  bumpOffsets.clear();
  for (const row of level) row.fill(null);
  questionBlocks.clear();
  brickContents.clear();
  makeLevel();
  resetPlayer();
}

window.addEventListener("keydown", event => {
  if (event.code === "ArrowLeft" || event.code === "KeyA") keys.left = true;
  if (event.code === "ArrowRight" || event.code === "KeyD") keys.right = true;
  if (event.code === "ArrowDown" || event.code === "KeyS") keys.down = true;
  if (event.code === "ShiftLeft" || event.code === "ShiftRight" || event.code === "KeyX") {
    if (!keys.run) keys.runPressed = true;
    keys.run = true;
  }
  if (event.code === "Space" || event.code === "KeyZ" || event.code === "ArrowUp") {
    if (!keys.jump) keys.jumpPressed = true;
    keys.jump = true;
    event.preventDefault();
  }
  if (event.code === "Enter" && state.gameOver) restartGame();
});

window.addEventListener("keyup", event => {
  if (event.code === "ArrowLeft" || event.code === "KeyA") keys.left = false;
  if (event.code === "ArrowRight" || event.code === "KeyD") keys.right = false;
  if (event.code === "ArrowDown" || event.code === "KeyS") keys.down = false;
  if (event.code === "ShiftLeft" || event.code === "ShiftRight" || event.code === "KeyX") keys.run = false;
  if (event.code === "Space" || event.code === "KeyZ" || event.code === "ArrowUp") keys.jump = false;
});

for (const button of document.querySelectorAll(".mobile-controls button")) {
  const hold = button.dataset.hold;
  const press = button.dataset.press;
  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    if (hold) keys[hold] = true;
    if (press === "jump") {
      keys.jumpPressed = true;
      keys.jump = true;
    }
  });
  button.addEventListener("pointerup", event => {
    event.preventDefault();
    if (hold) keys[hold] = false;
    if (press === "jump") keys.jump = false;
  });
  button.addEventListener("pointercancel", () => {
    if (hold) keys[hold] = false;
    if (press === "jump") keys.jump = false;
  });
}

makeLevel();
window.__plumberDebug = {
  placePlayer(c, row = GROUND_ROW - 1, area = state.area) {
    state.area = area;
    state.won = false;
    state.finishPhase = null;
    state.finishTimer = 0;
    state.flagScore = 0;
    state.countdownAccumulator = 0;
    player.hiddenBehindCastle = false;
    player.fire = false;
    player.shootCooldown = 0;
    player.x = c * TILE;
    player.y = row * TILE - player.h;
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
    state.cameraX = Math.max(0, player.x - VIEW_W * 0.35);
  },
  skipIntro() {
    state.introTimer = 0;
  },
  setPower({ big = player.big, fire = player.fire } = {}) {
    const foot = player.y + player.h;
    player.big = big;
    player.fire = fire;
    player.h = big ? 48 : 32;
    player.y = foot - player.h;
  },
  bump(c, r) {
    bumpTile(c, r);
  },
  tapRun() {
    keys.runPressed = true;
  },
  setEnemy(index, patch) {
    Object.assign(enemies[index], patch);
  },
  snapshot() {
    const tiles = {};
    for (const row of level) {
      for (const tile of row) {
        if (tile) tiles[tile] = (tiles[tile] || 0) + 1;
      }
    }
    return {
      levelCols: LEVEL_COLS,
      groundRow: GROUND_ROW,
      player: {
        x: player.x,
        y: player.y,
        vx: player.vx,
        vy: player.vy,
        big: player.big,
        fire: player.fire,
        dead: player.dead
      },
      state: {
        cameraX: state.cameraX,
        score: state.score,
        coins: state.coins,
        lives: state.lives,
        time: state.time,
        area: state.area,
        pipeTimer: state.pipeTimer,
        finishPhase: state.finishPhase,
        flagScore: state.flagScore,
        won: state.won,
        gameOver: state.gameOver
      },
      tiles,
      enemies: enemies.filter(enemy => enemy.alive).length,
      enemySamples: enemies.map((enemy, index) => ({ enemy, index }))
        .filter(entry => entry.enemy.alive)
        .slice(0, 8)
        .map(({ enemy, index }) => ({
          index,
          type: enemy.type,
          x: enemy.x,
          y: enemy.y,
          w: enemy.w,
          h: enemy.h,
          shell: enemy.shell,
          vx: enemy.vx
        })),
      collectableCoins: collectableCoins.filter(coin => !coin.collected).length,
      questionBlocks: questionBlocks.size,
      brickContents: Array.from(brickContents.entries()).map(([key, content]) => ({
        key,
        kind: content.kind,
        count: content.count,
        used: content.used
      })),
      powerups: powerups.map(powerup => ({ kind: powerup.kind, x: powerup.x, y: powerup.y })),
      fireballs: fireballs.length,
      fireballSamples: fireballs.map(fireball => ({ x: fireball.x, y: fireball.y, vx: fireball.vx, vy: fireball.vy }))
    };
  }
};
requestAnimationFrame(loop);
