"use strict";



const vv = {
  items: {},
  recipes: {}
};
const TILE = 40;
const MAP_WIDTH = 64;
const MAP_HEIGHT = 44;
const MATERIALS = {
  dirt: { name: "Dirt", color: "#a76c49", highlight: "#d28b60", health: 1, buy: 3 },
  stone: { name: "Stone", color: "#74817b", highlight: "#a7b2a9", health: 2, buy: 6 },
  crystal: { name: "Crystal", color: "#278b78", highlight: "#78f1c6", health: 2, buy: 10 },
  gold: { name: "Gold", color: "#9a7133", highlight: "#ffda73", health: 2 },
  diamond: { name: "Diamond", color: "#287c83", highlight: "#8bf3f0", health: 3 },
};
const MACHINES = {
  turret: { name: "Auto turret", color: "#c5db75", recipe: { stone: 3, crystal: 2 } },
  generator: { name: "Generator", color: "#74c9df", recipe: { stone: 2, gold: 1, sticks: 2 } },
};
const RESOURCE_NAMES = { ...MATERIALS, ...Object.fromEntries(Object.entries(MACHINES).map(([key, machine]) => [key, { name: machine.name, color: machine.color }])), sticks: { name: "Sticks", color: "#c18b5e" }, creepers: { name: "Creeper essence", color: "#82c765" }, sword: { name: "Sword", color: "#d9e0df" } };
const WAND_RECIPE = { gold: 11, diamond: 20, sticks: 10, creepers: 300 };
const BOSS_RECIPE = { crystal: 50, creepers: 300 };
const CRAFT_RECIPES = {
  wand: WAND_RECIPE,
  boss: BOSS_RECIPE,
  turret: MACHINES.turret.recipe,
  generator: MACHINES.generator.recipe,
};
const ITEM_ALIASES = { stick: "sticks", gold_ingot: "gold", stone_sword: "sword", cobblestone: "stone", cobbled_deepslate: "stone" };
const TOOL_NAMES = { pick: "Pickaxe", dirt: "Dirt cube", stone: "Stone cube", crystal: "Crystal cube", fuse: "Fuse", wand: "Infinity wand", sword: "Stone sword", turret: "Auto turret", generator: "Generator" };
const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const canvas = document.querySelector("#game-canvas");
const ctx = canvas.getContext("2d");
const minimap = document.querySelector("#minimap");
const mapCtx = minimap.getContext("2d");
const keys = new Set();
let viewWidth = 1;
let viewHeight = 1;
let pixelRatio = 1;
let lastFrame = 0;
let toastTimer = 0;
let mouseDown = false;
let miningTimer = 0;
let mineTarget = null;
let lastHudUpdate = 0;
let lastMapDraw = 0;
const pointer = { x: 0, y: 0, inside: false };
const particles = [];

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function distance(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function cellKey(x, y) { return `${x},${y}`; }
function cellCenter(x, y) { return { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE }; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function normalizeItemName(name) { return ITEM_ALIASES[name] || name; }
function recipeItemColor(name) {
  const palette = ["#b97c55", "#8fa39a", "#d2b05e", "#67b6a1", "#c07c72", "#8a9ec1"];
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

class MapManager {
  constructor() {
    this.terrain = [];
    this.placed = new Map();
    this.damage = new Map();
    this.level = 1;
    this.generate(1);
  }

  generate(level) {
    this.level = level;
    this.placed.clear();
    this.damage.clear();
    this.terrain = Array.from({ length: MAP_HEIGHT }, (_, y) => Array.from({ length: MAP_WIDTH }, (_, x) => {
      if (x < 2 || y < 2 || x >= MAP_WIDTH - 2 || y >= MAP_HEIGHT - 2) return "stone";
      const roll = Math.random();
      return roll < 0.54 ? "dirt" : roll < 0.81 ? "stone" : roll < 0.94 ? "crystal" : roll < 0.986 ? "gold" : "diamond";
    }));

    const originX = Math.floor(MAP_WIDTH / 2);
    const originY = Math.floor(MAP_HEIGHT / 2);
    let branchIndex = 0;
    for (let branch = 0; branch < 18; branch++) {
      let x = originX + randInt(-2, 2);
      let y = originY + randInt(-2, 2);
      let angle = Math.random() * Math.PI * 2;
      const length = randInt(55, 145);
      for (let step = 0; step < length; step++) {
        const radius = Math.random() < 0.16 ? 2 : 1;
        this.carve(x, y, radius);
        angle += (Math.random() - 0.5) * 0.68;
        x += Math.cos(angle) * 0.9;
        y += Math.sin(angle) * 0.9;
        if (x < 4 || y < 4 || x > MAP_WIDTH - 5 || y > MAP_HEIGHT - 5) break;
      }
      branchIndex += 1;
    }
    this.carve(originX, originY, 5);
    for (let y = originY - 2; y <= originY + 2; y++) {
      for (let x = originX - 2; x <= originX + 2; x++) this.terrain[y][x] = null;
    }
  }

  carve(centerX, centerY, radius) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius + 0.5) continue;
        const x = Math.round(centerX) + dx;
        const y = Math.round(centerY) + dy;
        if (x >= 2 && y >= 2 && x < MAP_WIDTH - 2 && y < MAP_HEIGHT - 2) this.terrain[y][x] = null;
      }
    }
  }

  getTerrain(x, y) {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return "stone";
    return this.terrain[y][x];
  }

  isBlockedCell(x, y) {
    return this.getTerrain(x, y) !== null || this.placed.has(cellKey(x, y));
  }

  isBlockedWorld(x, y, radius = 11) {
    const points = [[x - radius, y - radius], [x + radius, y - radius], [x - radius, y + radius], [x + radius, y + radius]];
    return points.some(([px, py]) => this.isBlockedCell(Math.floor(px / TILE), Math.floor(py / TILE)));
  }

  floorCells() {
    const cells = [];
    for (let y = 3; y < MAP_HEIGHT - 3; y++) {
      for (let x = 3; x < MAP_WIDTH - 3; x++) {
        if (!this.isBlockedCell(x, y)) cells.push({ x, y });
      }
    }
    return cells;
  }

  mine(x, y, player) {
    if (distance(player.x, player.y, (x + 0.5) * TILE, (y + 0.5) * TILE) > TILE * 4.6) {
      return { message: "Out of pickaxe reach" };
    }
    const key = cellKey(x, y);
    const placed = this.placed.get(key);
    const terrain = this.getTerrain(x, y);
    if (!terrain && !placed) return { message: "" };
    const material = placed?.kind === "block" ? placed.material : terrain || "stone";
    const durability = placed ? (placed.kind === "block" ? MATERIALS[placed.material].health : 3) : MATERIALS[material].health;
    const hits = (this.damage.get(key) || 0) + 1;
    if (hits < durability) {
      this.damage.set(key, hits);
      return { message: "" };
    }
    this.damage.delete(key);
    const resources = placed?.kind === "machine" ? { ...placed.recipe } : placed?.kind === "sentry" ? { stone: 2, crystal: 1 } : placed?.kind === "reinforced" ? { dirt: 1, stone: 1 } : { [material]: 1 };
    if (!placed && terrain === "dirt" && Math.random() < 0.2) resources.sticks = 1;
    if (placed) this.placed.delete(key);
    else this.terrain[y][x] = null;
    return { material, resources, x, y };
  }

  duplicateAt(x, y, player) {
    if (x < 2 || y < 2 || x >= MAP_WIDTH - 2 || y >= MAP_HEIGHT - 2) return { message: "Choose a block inside the mine" };
    if (distance(player.x, player.y, (x + 0.5) * TILE, (y + 0.5) * TILE) > TILE * 4.6) return { message: "Out of wand range" };
    const key = cellKey(x, y);
    const placed = this.placed.get(key);
    const material = placed?.kind === "block" ? placed.material : this.getTerrain(x, y);
    if (!material || (placed && placed.kind !== "block")) return { message: "Aim the wand at a solid block" };
    if (placed) this.placed.delete(key);
    else this.terrain[y][x] = null;
    this.damage.delete(key);
    return { material, x, y };
  }

  place(x, y, material, player, monsters) {
    if (distance(player.x, player.y, (x + 0.5) * TILE, (y + 0.5) * TILE) > TILE * 3.5) return "Too far to build";
    if (Math.floor(player.x / TILE) === x && Math.floor(player.y / TILE) === y) return "Step aside before placing a cube";
    if (this.isBlockedCell(x, y)) return "That space is occupied";
    if (monsters.some((monster) => distance(monster.x, monster.y, (x + 0.5) * TILE, (y + 0.5) * TILE) < TILE * 0.7)) return "A hunter is in the way";
    const machine = MACHINES[material];
    this.placed.set(cellKey(x, y), machine
      ? { kind: "machine", machineType: material, recipe: { ...machine.recipe }, x, y }
      : { kind: "block", material, x, y });
    return "";
  }

  render(context, cameraX, cameraY, width, height) {
    const startX = Math.max(0, Math.floor(cameraX / TILE) - 1);
    const startY = Math.max(0, Math.floor(cameraY / TILE) - 1);
    const endX = Math.min(MAP_WIDTH, Math.ceil((cameraX + width) / TILE) + 1);
    const endY = Math.min(MAP_HEIGHT, Math.ceil((cameraY + height) / TILE) + 1);
    context.fillStyle = "#151c19";
    context.fillRect(cameraX, cameraY, width, height);

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const left = x * TILE;
    const top = y * TILE;

        context.fillStyle = ((x * 13 + y * 7) % 5 === 0) ? "#1c2520" : "#19211d";
        context.fillRect(left, top, TILE, TILE);
        if ((x * 17 + y * 11) % 7 === 0) {
          context.fillStyle = "#354038";
          context.fillRect(left + 7, top + 9, 2, 2);
          context.fillRect(left + 27, top + 28, 2, 2);
        }
        const material = this.getTerrain(x, y);
        if (material) this.drawCube(context, left, top, material, false);
        const placed = this.placed.get(cellKey(x, y));
        if (placed) this.drawPlaced(context, left, top, placed);
      }
    }
  }

  drawCube(context, x, y, material, placed) {
    const colors = MATERIALS[material];
    context.fillStyle = colors.color;
    context.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
    context.fillStyle = colors.highlight;
    context.globalAlpha = placed ? 0.75 : 0.48;
    context.fillRect(x + 2, y + 2, TILE - 4, 5);
    context.fillRect(x + 2, y + 2, 5, TILE - 4);
    context.globalAlpha = 1;
    context.fillStyle = "#101612";
    context.globalAlpha = 0.24;
    context.fillRect(x + TILE - 5, y + 4, 3, TILE - 8);
    context.fillRect(x + 4, y + TILE - 5, TILE - 8, 3);
    context.globalAlpha = 1;
    if (material === "crystal" || material === "diamond") {
      context.fillStyle = material === "diamond" ? "#ddffff" : "#b3ffe3";
      context.beginPath();
      context.moveTo(x + TILE * 0.52, y + 8);
      context.lineTo(x + TILE * 0.75, y + TILE * 0.43);
      context.lineTo(x + TILE * 0.51, y + TILE * 0.77);
      context.lineTo(x + TILE * 0.31, y + TILE * 0.42);
      context.closePath();
      context.fill();
      context.strokeStyle = material === "diamond" ? "#e3fffd" : "#d7fff0";
      context.lineWidth = 1;
      context.stroke();
    } else if (material === "gold") {
      context.fillStyle = "#ffe49a";
      context.beginPath();
      context.arc(x + 14, y + 15, 4, 0, Math.PI * 2);
      context.arc(x + 27, y + 27, 3, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "#f6c75b";
      context.lineWidth = 1;
      context.strokeRect(x + 7, y + 7, TILE - 14, TILE - 14);
    } else {
      context.fillStyle = "#10161240";
      context.fillRect(x + 11, y + 15, 7, 3);
      context.fillRect(x + 24, y + 27, 8, 2);
    }
    if (placed) {
      context.strokeStyle = "#dff4c055";
      context.lineWidth = 1;
      context.strokeRect(x + 2.5, y + 2.5, TILE - 5, TILE - 5);
    }
  }

  drawPlaced(context, x, y, placed) {
    if (placed.kind === "machine" && placed.machineType === "generator") {
      context.fillStyle = "#354744";
      context.fillRect(x + 5, y + 7, TILE - 10, TILE - 11);
      context.fillStyle = "#78d6e9";
      context.fillRect(x + 8, y + 10, TILE - 16, 4);
      context.fillStyle = "#192d33";
      context.fillRect(x + 11, y + 17, TILE - 22, 13);
      context.strokeStyle = "#a8f1fa";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x + TILE / 2, y + 23, 6, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = "#d7fbff";
      context.fillRect(x + TILE / 2 - 2, y + 21, 4, 4);
      context.fillStyle = "#435b5b";
      context.fillRect(x + 12, y + TILE - 7, TILE - 24, 4);
      return;
    }
    if (placed.kind === "sentry" || (placed.kind === "machine" && placed.machineType === "turret")) {
      context.fillStyle = "#22362e";
      context.fillRect(x + 5, y + 8, TILE - 10, TILE - 13);
      context.fillStyle = "#d1ed69";
      context.beginPath();
      context.arc(x + TILE / 2, y + TILE / 2 - 2, 9, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#19241e";
      context.beginPath();
      context.arc(x + TILE / 2, y + TILE / 2 - 2, 3, 0, Math.PI * 2);
      context.fill();
      if (placed.powered) {
        context.strokeStyle = "#81e8f4";
        context.lineWidth = 2;
        context.beginPath();
        context.arc(x + TILE / 2, y + TILE / 2 - 2, 13, 0, Math.PI * 2);
        context.stroke();
      }
      context.fillStyle = "#56674f";
      context.fillRect(x + 12, y + TILE - 8, TILE - 24, 5);
      return;
    }
    if (placed.kind === "reinforced") {
      context.fillStyle = "#69776e";
      context.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
      context.fillStyle = "#b4c0a0";
      context.fillRect(x + 3, y + 3, TILE - 6, 5);
      context.strokeStyle = "#d7e2c477";
      context.lineWidth = 2;
      context.strokeRect(x + 6, y + 6, TILE - 12, TILE - 12);
      context.fillStyle = "#35443a";
      context.fillRect(x + TILE / 2 - 2, y + 11, 4, TILE - 22);
      return;
    }
    this.drawCube(context, x, y, placed.material, true);
  }
}

class CoinManager {
  constructor(game) {
    this.game = game;
    this.coins = [];
  }

  scatter(count) {
    this.coins = [];
    const floors = this.game.map.floorCells();
    for (let index = 0; index < count; index++) {
      const cell = floors[randInt(0, floors.length - 1)];
      if (distance(cell.x, cell.y, MAP_WIDTH / 2, MAP_HEIGHT / 2) < 5) continue;
      const center = cellCenter(cell.x, cell.y);
      this.drop(center.x, center.y, 1, false);
    }
  }

  drop(x, y, value = 1, showParticles = true) {
    this.coins.push({ x, y, value, phase: Math.random() * 6.28, age: 0 });
    if (showParticles) this.game.burst(x, y, "#edbd58", 5);
  }

  update(delta) {
    for (let index = this.coins.length - 1; index >= 0; index--) {
      const coin = this.coins[index];
      coin.age += delta;
      const gap = distance(coin.x, coin.y, this.game.player.x, this.game.player.y);
      if (gap < 100 && gap > 1) {
        const pull = (1 - gap / 100) * 280 * delta;
        coin.x += (this.game.player.x - coin.x) / gap * pull;
        coin.y += (this.game.player.y - coin.y) / gap * pull;
      }
      if (gap < 21) {
        this.game.coins += coin.value;
        this.game.burst(coin.x, coin.y, "#ffe091", 7);
        this.coins.splice(index, 1);
        this.game.toast(`+${coin.value} coin${coin.value > 1 ? "s" : ""}`);
      }
    }
  }

  render(context) {
    for (const coin of this.coins) {
      const bob = Math.sin(coin.age * 4 + coin.phase) * 2;
      context.fillStyle = "#edbd5845";
      context.beginPath();
      context.arc(coin.x, coin.y + bob, 13, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#edbd58";
      context.beginPath();
      context.arc(coin.x, coin.y + bob, 7, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#fff0a2";
      context.fillRect(coin.x - 1, coin.y + bob - 4, 2, 8);
    }
  }
}

class MonsterManager {
  constructor(game) {
    this.game = game;
    this.monsters = [];
    this.pathTimer = 0;
    this.distances = new Int32Array(MAP_WIDTH * MAP_HEIGHT);
    this.transitionTimer = 0;
  }

  spawnWave() {
    this.monsters.length = 0;
    this.buildDistanceField();
    const floors = this.game.map.floorCells().filter((cell) => distance(cell.x, cell.y, MAP_WIDTH / 2, MAP_HEIGHT / 2) > 12 && this.distances[cell.y * MAP_WIDTH + cell.x] >= 0);
    const count = Math.min(3 + this.game.level, 12);
    for (let index = 0; index < count; index++) {
      if (!floors.length) break;
      const cell = floors[randInt(0, floors.length - 1)];
      floors.splice(floors.indexOf(cell), 1);
      const center = cellCenter(cell.x, cell.y);
      const type = index % 5 === 0 ? "brute" : index % 4 === 3 ? "rival" : "creeper";
      const stats = type === "brute" ? { color: "#df765e", hp: 3, speed: 47, damage: 14 } : type === "rival" ? { color: "#e4b45b", hp: 2, speed: 66, damage: 10 } : { color: "#82c765", hp: 2, speed: 68, damage: 9 };
      this.monsters.push({ ...center, type, ...stats, maxHp: stats.hp, hitFlash: 0, attackWait: Math.random(), fuse: 0, phase: Math.random() * 6.28 });
    }
    this.game.toast(`Depth ${String(this.game.level).padStart(2, "0")} · ${count} hunters nearby`);
  }

  spawnInfinity() {
    this.buildDistanceField();
    const floors = this.game.map.floorCells().filter((cell) => this.distances[cell.y * MAP_WIDTH + cell.x] >= 0);
    floors.sort((left, right) => {
      const leftDistance = this.distances[left.y * MAP_WIDTH + left.x];
      const rightDistance = this.distances[right.y * MAP_WIDTH + right.x];
      return rightDistance - leftDistance;
    });
    const spawn = floors[Math.min(4, floors.length - 1)];
    if (!spawn) { this.game.infinityActive = false; this.game.toast("No cave path is open for the boss"); return; }
    const center = cellCenter(spawn.x, spawn.y);
    this.monsters.push({ ...center, type: "infinity", color: "#b27be8", hp: 180, maxHp: 180, speed: 45, damage: 24, hitFlash: 0, attackWait: 1.3, fuse: 0, phase: 0 });
    this.game.toast("THE INFINITY MONSTER HAS AWAKENED");
  }

  buildDistanceField() {
    this.distances.fill(-1);
    const sx = Math.floor(this.game.player.x / TILE);
    const sy = Math.floor(this.game.player.y / TILE);
    if (this.game.map.isBlockedCell(sx, sy)) return;
    const queue = new Int32Array(MAP_WIDTH * MAP_HEIGHT);
    let head = 0;
    let tail = 0;
    const startIndex = sy * MAP_WIDTH + sx;
    queue[tail++] = startIndex;
    this.distances[startIndex] = 0;
    while (head < tail) {
      const current = queue[head++];
      const x = current % MAP_WIDTH;
      const y = Math.floor(current / MAP_WIDTH);
      for (const [dx, dy] of DIRECTIONS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT || this.game.map.isBlockedCell(nx, ny)) continue;
        const next = ny * MAP_WIDTH + nx;
        if (this.distances[next] !== -1) continue;
        this.distances[next] = this.distances[current] + 1;
        queue[tail++] = next;
      }
    }
  }

  update(delta) {
    this.pathTimer -= delta;
    if (this.pathTimer <= 0) {
      this.pathTimer = 0.42;
      this.buildDistanceField();
    }
    for (let index = this.monsters.length - 1; index >= 0; index--) {
      const monster = this.monsters[index];
      monster.hitFlash = Math.max(0, monster.hitFlash - delta);
      monster.attackWait -= delta;
      monster.fuse = Math.max(0, monster.fuse - delta * 0.12);
      const cx = Math.floor(monster.x / TILE);
      const cy = Math.floor(monster.y / TILE);
      let target = null;
      let bestDistance = this.distances[cy * MAP_WIDTH + cx];
      for (const [dx, dy] of DIRECTIONS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT || this.game.map.isBlockedCell(nx, ny)) continue;
        const pathDistance = this.distances[ny * MAP_WIDTH + nx];
        if (pathDistance >= 0 && (bestDistance < 0 || pathDistance < bestDistance)) {
          bestDistance = pathDistance;
          target = cellCenter(nx, ny);
        }
      }
      if (target) {
        const dx = target.x - monster.x;
        const dy = target.y - monster.y;
        const length = Math.hypot(dx, dy) || 1;
        const step = Math.min(length, monster.speed * delta);
        const nextX = monster.x + dx / length * step;
        const nextY = monster.y + dy / length * step;
        if (!this.game.map.isBlockedWorld(nextX, monster.y, 9)) monster.x = nextX;
        if (!this.game.map.isBlockedWorld(monster.x, nextY, 9)) monster.y = nextY;
      }
      const playerGap = distance(monster.x, monster.y, this.game.player.x, this.game.player.y);
      if (monster.type === "creeper" && playerGap < 88) {
        monster.fuse += delta;
        if (monster.fuse >= 1.05) {
          this.explodeCreeper(index);
          continue;
        }
      } else if (monster.type === "creeper") {
        monster.fuse = Math.max(0, monster.fuse - delta * 1.8);
      }
      if (monster.type === "infinity" && playerGap < 115 && monster.attackWait <= 0) {
        monster.attackWait = 2.1;
        this.game.burst(this.game.player.x, this.game.player.y, "#bd80ff", 20);
        this.game.hurt(monster.damage);
      } else if (monster.type !== "creeper" && playerGap < 27 && monster.attackWait <= 0) {
        monster.attackWait = monster.type === "brute" ? 1.1 : 0.85;
        this.game.hurt(monster.damage);
      }
      if (monster.hp <= 0) {
        this.game.coinsManager.drop(monster.x, monster.y, monster.type === "infinity" ? 80 : randInt(2, 4));
        this.game.kills += 1;
        if (monster.type === "creeper") {
          this.game.creepers += 1;
          this.game.inventory.creepers += 1;
        }
        if (monster.type === "infinity") this.game.infinityActive = false;
        this.game.burst(monster.x, monster.y, monster.color, 16);
        this.monsters.splice(index, 1);
      }
    }
    if (this.monsters.length === 0 && !this.game.dead) {
      this.transitionTimer += delta;
      if (this.transitionTimer > 2.2) {
        this.transitionTimer = 0;
        this.game.nextLevel();
      }
    }
  }

  explodeCreeper(index) {
    const creeper = this.monsters[index];
    const radius = 94;
    this.game.burst(creeper.x, creeper.y, "#b5ef75", 36);
    if (distance(creeper.x, creeper.y, this.game.player.x, this.game.player.y) < radius) this.game.hurt(28);
    for (let otherIndex = this.monsters.length - 1; otherIndex >= 0; otherIndex--) {
      if (otherIndex === index) continue;
      const other = this.monsters[otherIndex];
      if (distance(creeper.x, creeper.y, other.x, other.y) < radius) other.hp -= 2;
    }
    this.monsters.splice(index, 1);
  }

  damageNearest(damage = this.game.activeTool === "wand" ? 3 : this.game.activeTool === "sword" ? 2 : 1) {
    let nearest = null;
    let best = this.game.activeTool === "sword" ? 90 : 66;
    for (const monster of this.monsters) {
      const gap = distance(monster.x, monster.y, this.game.player.x, this.game.player.y);
      if (gap < best) { best = gap; nearest = monster; }
    }
    if (!nearest) {
      this.game.toast("No hunter in striking range");
      return;
    }
    nearest.hp -= damage;
    nearest.hitFlash = 0.15;
    this.game.burst(nearest.x, nearest.y, "#ffe0a0", 5);
  }

  render(context) {
    for (const monster of this.monsters) {
      const bob = Math.sin(performance.now() / 210 + monster.phase) * 2;
      context.save();
      context.translate(monster.x, monster.y + bob);
      context.fillStyle = "#080e0b80";
      context.beginPath();
      context.ellipse(0, monster.type === "infinity" ? 24 : 9, monster.type === "infinity" ? 34 : monster.type === "brute" ? 16 : 12, monster.type === "infinity" ? 13 : 6, 0, 0, Math.PI * 2);
      context.fill();
      if (monster.type === "infinity") {
        const aura = context.createRadialGradient(0, 0, 5, 0, 0, 38);
        aura.addColorStop(0, "#dfb7ff");
        aura.addColorStop(0.5, "#aa70e8");
        aura.addColorStop(1, "#593d91");
        context.fillStyle = "#7145a9";
        context.beginPath();
        context.ellipse(0, 1, 34, 29, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = aura;
        context.beginPath();
        context.ellipse(0, 0, 28, 25, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#f6eaff";
        context.beginPath();
        context.ellipse(-9, -3, 5, 7, 0, 0, Math.PI * 2);
        context.ellipse(9, -3, 5, 7, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#482f6a";
        context.beginPath();
        context.arc(-9, -2, 2, 0, Math.PI * 2);
        context.arc(9, -2, 2, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "#e6c9ff";
        context.lineWidth = 3;
        context.beginPath();
        context.arc(0, -4, 37 + Math.sin(performance.now() / 160) * 3, Math.PI * 1.08, Math.PI * 1.92);
        context.stroke();
        context.fillStyle = "#e9d2ff";
        context.beginPath();
        context.moveTo(-20, 13);
        context.quadraticCurveTo(0, 24, 20, 13);
        context.quadraticCurveTo(0, 31, -20, 13);
        context.fill();
      } else {
      context.fillStyle = monster.hitFlash > 0 ? "#fff1c8" : monster.color;
      context.beginPath();
      context.ellipse(0, 0, monster.type === "brute" ? 15 : 12, monster.type === "brute" ? 13 : 11, 0, 0, Math.PI * 2);
      context.fill();
      if (monster.type === "creeper") {
        context.fillStyle = "#447e43";
        context.beginPath();
        context.ellipse(-9, 7, 4, 5, -0.4, 0, Math.PI * 2);
        context.ellipse(9, 7, 4, 5, 0.4, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#e5ffd0";
        context.beginPath();
        context.arc(0, 0, 3, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = "#16201a";
      context.fillRect(-5, -3, 3, 4);
      context.fillRect(3, -3, 3, 4);
      context.fillStyle = "#f1f0d8";
      context.fillRect(-5, 5, 3, 3);
      context.fillRect(3, 5, 3, 3);
      context.fillStyle = "#080e0b";
      context.fillRect(-13, -20, 26, 3);
      context.fillStyle = monster.hp > 1 ? "#f2c76c" : "#ef786d";
      context.fillRect(-12, -19, 24 * (monster.hp / monster.maxHp), 1);
      if (monster.type === "rival") {
        context.fillStyle = "#f2d18a";
        context.fillRect(-4, -15, 8, 2);
      }
      if (monster.type === "creeper" && monster.fuse > 0) {
        const pulse = 1 + Math.sin(performance.now() / 40) * 0.13;
        context.strokeStyle = `rgba(230,255,171,${0.35 + monster.fuse * 0.55})`;
        context.lineWidth = 2 + monster.fuse * 2;
        context.beginPath();
        context.arc(0, 0, 17 * pulse, 0, Math.PI * 2);
        context.stroke();
      }
      }
      context.restore();
    }
  }
}

class CraftingManager {
  constructor(game) {
    this.game = game;
    this.recipes = [
      { needs: { dirt: 2, stone: 1 }, result: "reinforced", label: "Reinforced cube" },
      { needs: { stone: 2, crystal: 1 }, result: "sentry", label: "Sentry turret" },
    ];
  }

  combineAt(x, y) {
    const centerKey = cellKey(x, y);
    const center = this.game.map.placed.get(centerKey);
    if (!center || center.kind !== "block") {
      this.game.toast("Place a cube at the center of a cluster first");
      return false;
    }
    const nearby = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const block = this.game.map.placed.get(cellKey(x + dx, y + dy));
        if (block?.kind === "block") nearby.push(block);
      }
    }
    for (const recipe of this.recipes) {
      const chosen = [center];
      const remaining = { ...recipe.needs };
      if (remaining[center.material]) remaining[center.material] -= 1;
      for (const [material, needed] of Object.entries(remaining)) {
        for (let count = 0; count < needed; count++) {
          const match = nearby.find((block) => block.material === material && !chosen.includes(block));
          if (!match) break;
          chosen.push(match);
        }
      }
      const totalNeeded = Object.values(recipe.needs).reduce((sum, amount) => sum + amount, 0);
      if (chosen.length !== totalNeeded) continue;
      for (const block of chosen) this.game.map.placed.delete(cellKey(block.x, block.y));
      this.game.map.placed.set(centerKey, { kind: recipe.result, x, y, material: "stone" });
      this.game.burst((x + 0.5) * TILE, (y + 0.5) * TILE, recipe.result === "sentry" ? "#d1ed69" : "#b9c9ae", 18);
      this.game.toast(`Built: ${recipe.label}`);
      return true;
    }
    this.game.toast("Cluster needs 2 matching cubes + 1 partner cube");
    return false;
  }

  craftSword() {
    if (this.game.inventory.sword) { this.game.toast("You already have a stone sword"); return; }
    this.game.inventory.sword = 1;
    this.game.updateHud(true);
    this.game.selectTool("sword");
    this.game.toast("Stone sword crafted · strike with SPACE");
  }

  craftWand() {
    if (this.game.hasWand) { this.game.toast("The Infinity wand is already forged"); return; }
    this.game.hasWand = true;
    this.game.updateHud(true);
    this.game.selectTool("wand");
    this.game.toast("Infinity wand forged · copy blocks into 100 stacks");
  }

  summonInfinity() {
    if (this.game.infinityActive) { this.game.toast("The Infinity monster is already in this mine"); return; }
    this.game.infinityActive = true;
    this.game.monsters.spawnInfinity();
    this.game.updateHud(true);
    document.querySelector("#crafting-box").close();
  }
}

class Player {
  constructor(game) {
    this.game = game;
    this.x = (MAP_WIDTH / 2 + 0.5) * TILE;
    this.y = (MAP_HEIGHT / 2 + 0.5) * TILE;
    this.speed = 190;
    this.attackCooldown = 0;
    this.attackSwing = 0;
    this.invulnerable = 0;
    this.facing = 1;
  }

  update(delta) {
    let dx = Number(keys.has("d") || keys.has("arrowright")) - Number(keys.has("a") || keys.has("arrowleft"));
    let dy = Number(keys.has("s") || keys.has("arrowdown")) - Number(keys.has("w") || keys.has("arrowup"));
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    const nextX = this.x + dx * this.speed * delta;
    const nextY = this.y + dy * this.speed * delta;
    if (!this.game.map.isBlockedWorld(nextX, this.y, 10)) this.x = nextX;
    if (!this.game.map.isBlockedWorld(this.x, nextY, 10)) this.y = nextY;
    if (dx) this.facing = Math.sign(dx);
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.attackSwing = Math.max(0, this.attackSwing - delta);
    this.invulnerable = Math.max(0, this.invulnerable - delta);
    if (keys.has(" ") && this.attackCooldown === 0) this.attack();
  }

  attack() {
    this.attackCooldown = 0.48;
    this.attackSwing = 0.24;
    const damage = this.game.activeTool === "wand" ? 3 : this.game.activeTool === "sword" ? 2 : 1;
    this.game.monsters.damageNearest(damage);
  }

  render(context) {
    if (this.invulnerable > 0 && Math.floor(this.invulnerable * 18) % 2 === 0) return;
    context.save();
    context.translate(this.x, this.y);
    const stride = Math.sin(performance.now() / 105) * 1.5;
    const coat = context.createLinearGradient(-12, -3, 12, 13);
    coat.addColorStop(0, "#e5ae70");
    coat.addColorStop(0.52, "#bb754a");
    coat.addColorStop(1, "#85513d");
    context.fillStyle = "#070d0a78";
    context.beginPath();
    context.ellipse(0, 12, 16, 7, 0, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#2b3430";
    context.beginPath();
    context.roundRect(-14, -1, 8, 16, 3);
    context.fill();
    context.fillStyle = "#637065";
    context.fillRect(-12, 2, 4, 6);
    context.strokeStyle = "#c8d0be";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(-10, 2);
    context.lineTo(-10, 9);
    context.stroke();

    context.fillStyle = "#29332e";
    context.beginPath();
    context.roundRect(-7, 8 + stride, 5, 9, 2);
    context.roundRect(2, 8 - stride, 5, 9, 2);
    context.fill();
    context.fillStyle = "#d8d1b8";
    context.beginPath();
    context.roundRect(-8, 14 + stride, 7, 4, 2);
    context.roundRect(1, 14 - stride, 7, 4, 2);
    context.fill();
    context.fillStyle = "#8d5437";
    context.beginPath();
    context.roundRect(-9, 13 + stride, 8, 2, 1);
    context.roundRect(1, 13 - stride, 8, 2, 1);
    context.fill();

    context.fillStyle = coat;
    context.beginPath();
    context.moveTo(-10, -3);
    context.quadraticCurveTo(-13, 1, -11, 10);
    context.quadraticCurveTo(0, 16, 11, 10);
    context.quadraticCurveTo(13, 1, 9, -3);
    context.quadraticCurveTo(0, -7, -10, -3);
    context.closePath();
    context.fill();
    context.strokeStyle = "#f0c38c";
    context.lineWidth = 1;
    context.stroke();

    context.fillStyle = "#e9b887";
    context.beginPath();
    context.ellipse(-11, 3, 3.5, 5, -0.35, 0, Math.PI * 2);
    context.ellipse(11, 3, 3.5, 5, 0.35, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#435246";
    context.beginPath();
    context.roundRect(-8, -2, 16, 5, 2);
    context.fill();
    context.fillStyle = "#d1ed69";
    context.fillRect(-1, -2, 2, 5);
    context.fillStyle = "#25352d";
    context.beginPath();
    context.roundRect(-9, 3, 18, 3, 1);
    context.fill();
    context.fillStyle = "#e0d5bd";
    context.beginPath();
    context.roundRect(-2, 3, 4, 3, 1);
    context.fill();

    context.fillStyle = "#d5a074";
    context.beginPath();
    context.ellipse(0, -8, 8, 9, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#392b26";
    context.beginPath();
    context.ellipse(0, -13, 8, 5, 0, Math.PI, Math.PI * 2);
    context.quadraticCurveTo(8, -6, 5, -5);
    context.quadraticCurveTo(3, -10, 0, -8);
    context.quadraticCurveTo(-4, -6, -8, -9);
    context.closePath();
    context.fill();
    context.fillStyle = "#f4e6c9";
    context.beginPath();
    context.ellipse(-3, -8, 1, 1.3, 0, 0, Math.PI * 2);
    context.ellipse(3, -8, 1, 1.3, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#29322d";
    context.beginPath();
    context.arc(-3, -8, 0.6, 0, Math.PI * 2);
    context.arc(3, -8, 0.6, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#80523f";
    context.lineWidth = 0.8;
    context.beginPath();
    context.moveTo(-2, -3);
    context.quadraticCurveTo(0, -2, 2, -3);
    context.stroke();

    context.fillStyle = "#bf8745";
    context.beginPath();
    context.ellipse(0, -15, 10, 4, 0, Math.PI, Math.PI * 2);
    context.lineTo(10, -13);
    context.quadraticCurveTo(0, -10, -10, -13);
    context.closePath();
    context.fill();
    context.fillStyle = "#edc873";
    context.beginPath();
    context.ellipse(0, -16, 7, 3, 0, Math.PI, Math.PI * 2);
    context.quadraticCurveTo(0, -20, -7, -16);
    context.fill();
    const lampGlow = context.createRadialGradient(0, -18, 1, 0, -18, 12);
    lampGlow.addColorStop(0, "#fff4b6a8");
    lampGlow.addColorStop(1, "#f2ce7000");
    context.fillStyle = lampGlow;
    context.beginPath();
    context.arc(0, -18, 12, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#fff0a8";
    context.beginPath();
    context.arc(0, -17, 2, 0, Math.PI * 2);
    context.fill();

    if (this.game.activeTool === "sword" && this.game.inventory.sword) {
      context.save();
      context.translate(9, 3);
      context.rotate(this.attackSwing > 0 ? -1.15 + this.attackSwing * 3 : -0.25);
      context.strokeStyle = "#6a4934";
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(0, 5);
      context.lineTo(8, -3);
      context.stroke();
      context.fillStyle = "#d9e0df";
      context.beginPath();
      context.moveTo(7, -3);
      context.lineTo(12, -18);
      context.lineTo(15, -20);
      context.lineTo(13, -5);
      context.closePath();
      context.fill();
      context.strokeStyle = "#ffffff";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(11, -7);
      context.lineTo(13, -17);
      context.stroke();
      context.restore();
    } else if (this.game.activeTool === "pick") {
      context.strokeStyle = "#a66f45";
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(9, 5);
      context.lineTo(17, -10);
      context.stroke();
      context.strokeStyle = "#c6d1c6";
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(12, -11);
      context.quadraticCurveTo(18, -15, 21, -9);
      context.stroke();
    } else if (MATERIALS[this.game.activeTool] || MACHINES[this.game.activeTool]) {
      const heldItem = MATERIALS[this.game.activeTool] || MACHINES[this.game.activeTool];
      context.fillStyle = heldItem.color;
      context.fillRect(12, -3, 9, 9);
      context.fillStyle = heldItem.highlight || heldItem.color;
      context.fillRect(13, -2, 7, 2);
    }

    if (this.game.activeTool === "wand" && this.game.hasWand) {
      context.save();
      context.translate(9, 4);
      context.rotate(this.facing * 0.28 + (this.attackSwing > 0 ? -0.5 : 0));
      context.strokeStyle = "#f2ce70";
      context.lineWidth = 3;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(8, 4);
      context.lineTo(18, -12);
      context.stroke();
      context.fillStyle = "#fff2ad";
      context.beginPath();
      context.arc(19, -14, 3, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    context.restore();
  }
}

class GameManager {
  constructor() {
    this.level = 1;
    this.health = 100;
    this.coins = 8;
    this.kills = 0;
    this.creepers = 0;
    this.dead = false;
    this.activeTool = "pick";
    this.hasWand = false;
    this.inventory = { dirt: 7, stone: 4, crystal: 1, gold: 0, diamond: 0, sticks: 0, creepers: 0 };
    this.inventory.sword = 0;
    this.craftingGrid = Array(9).fill(null);
    this.selectedCraftMaterial = null;
    this.infinityActive = false;
    this.map = new MapManager();
    this.player = new Player(this);
    this.coinsManager = new CoinManager(this);
    this.monsters = new MonsterManager(this);
    this.crafting = new CraftingManager(this);
    this.coinsManager.scatter(30);
    this.monsters.spawnWave();
    this.lastMiningMessage = 0;
    this.frameTime = 0;
    this.minecraftRecipes = [];
    this.minecraftItemsByName = new Map();
    this.minecraftItemsById = new Map();
    this.recipeBookLimit = 40;
    this.pendingMinecraftRecipeKey = null;
    this.bindInterface();
    this.updateHud(true);
    this.loadMinecraftRecipeBook();
  }

  getItemInfo(name) {
    const known = RESOURCE_NAMES[name];
    if (known) return known;
    const rawName = name === "sticks" ? "stick" : name === "gold" ? "gold_ingot" : name === "sword" ? "stone_sword" : name;
    const item = this.minecraftItemsByName.get(rawName);
    return { name: item?.displayName || name.replaceAll("_", " "), color: recipeItemColor(name) };
  }

  bindInterface() {
    document.querySelectorAll(".tool").forEach((button) => button.addEventListener("click", () => this.selectTool(button.dataset.tool)));
    document.querySelectorAll(".shop-item[data-buy]").forEach((button) => button.addEventListener("click", () => this.buy(button.dataset.buy)));
    document.querySelectorAll(".craft-action").forEach((button) => button.addEventListener("click", () => this.loadRecipe(button.dataset.fill)));
    document.querySelector("#box-inventory").addEventListener("click", (event) => {
      const item = event.target.closest("[data-add-material]");
      if (item) this.selectCraftMaterial(item.dataset.addMaterial);
    });
    document.querySelector("#box-inventory").addEventListener("dragstart", (event) => {
      const item = event.target.closest("[data-add-material]");
      if (!item) return;
      event.dataTransfer.setData("text/plain", `material:${item.dataset.addMaterial}`);
      this.selectCraftMaterial(item.dataset.addMaterial);
    });
    const craftGrid = document.querySelector("#craft-grid");
    craftGrid.addEventListener("click", (event) => {
      const slot = event.target.closest("[data-slot]");
      if (slot) this.editCraftSlot(Number(slot.dataset.slot), event.shiftKey);
    });
    craftGrid.addEventListener("dragover", (event) => event.preventDefault());
    craftGrid.addEventListener("drop", (event) => {
      event.preventDefault();
      const slot = event.target.closest("[data-slot]");
      if (!slot) return;
      const payload = event.dataTransfer.getData("text/plain");
      if (payload.startsWith("slot:")) this.swapCraftSlots(Number(payload.slice(5)), Number(slot.dataset.slot));
      else if (payload.startsWith("material:")) {
        this.selectCraftMaterial(payload.slice(9));
        this.editCraftSlot(Number(slot.dataset.slot), event.shiftKey);
      }
    });
    craftGrid.addEventListener("dragstart", (event) => {
      const slot = event.target.closest("[data-slot]");
      if (slot && this.craftingGrid[Number(slot.dataset.slot)]) event.dataTransfer.setData("text/plain", `slot:${slot.dataset.slot}`);
    });
    document.querySelector("#clear-ingredients").addEventListener("click", () => this.clearIngredients());
    document.querySelector("#craft-selected").addEventListener("click", () => this.craftSelected());
    document.querySelector("#craft-output").addEventListener("click", () => this.craftSelected());
    document.querySelector("#recipe-search").addEventListener("input", () => {
      this.recipeBookLimit = 40;
      this.renderMinecraftRecipeBook();
    });
    document.querySelector("#recipe-supply").addEventListener("click", () => this.buyMissingRecipeIngredients());
    document.querySelector("#minecraft-recipe-list").addEventListener("click", (event) => {
      const recipeButton = event.target.closest("[data-recipe-key]");
      if (recipeButton) this.loadMinecraftRecipe(recipeButton.dataset.recipeKey);
      if (event.target.closest("[data-load-more]")) {
        this.recipeBookLimit += 40;
        this.renderMinecraftRecipeBook();
      }
    });
    document.querySelector("#inventory-hotbar").addEventListener("click", (event) => {
      const item = event.target.closest("[data-tool]");
      if (item) this.selectTool(item.dataset.tool);
    });
    document.querySelector("#open-crafting").addEventListener("click", () => this.openCraftingBox());
    document.querySelector("#close-crafting").addEventListener("click", () => document.querySelector("#crafting-box").close());
    document.querySelector("#restart-button").addEventListener("click", () => this.restart());
    document.querySelector("#craft-wand").addEventListener("click", () => this.loadRecipe("wand"));
    document.querySelectorAll(".touch-pad button").forEach((button) => {
      const key = ({ up: "w", down: "s", left: "a", right: "d" })[button.dataset.dir];
      button.addEventListener("pointerdown", (event) => { event.preventDefault(); keys.add(key); button.setPointerCapture(event.pointerId); });
      const stop = () => keys.delete(key);
      button.addEventListener("pointerup", stop);
      button.addEventListener("pointercancel", stop);
      button.addEventListener("lostpointercapture", stop);
    });
  }

  async loadMinecraftRecipeBook() {
    const status = document.querySelector("#recipe-book-status");
    try {
      const dataRoot = "node_modules/minecraft-data/minecraft-data/data/pc/1.21.4/";  
      //thguguvftyjvcsrtszgvkoklloflrldrk
      const [itemResponse, recipeResponse] = await Promise.all([
        fetch(`${dataRoot}items.json`),
        fetch(`${dataRoot}recipes.json`),
      ]);
      if (!itemResponse.ok || !recipeResponse.ok) throw new Error("Could not load local Minecraft recipe data.");
      const [items, rawRecipes] = await Promise.all([itemResponse.json(), recipeResponse.json()]);
      this.minecraftItemsById = new Map(items.map((item) => [item.id, item]));
      this.minecraftItemsByName = new Map(items.map((item) => [item.name, item]));
      const recipes = [];

      for (const [outputId, variants] of Object.entries(rawRecipes)) {
        const outputItem = this.minecraftItemsById.get(Number(outputId));
        if (!outputItem) continue;
        for (const [variantIndex, rawRecipe] of variants.entries()) {
          const resultItem = this.minecraftItemsById.get(rawRecipe.result?.id);
          if (!resultItem || !rawRecipe.result.count) continue;
          const itemName = (id) => {
            if (!id) return null;
            const item = this.minecraftItemsById.get(id);
            return item ? normalizeItemName(item.name) : undefined;
          };
          let shape = null;
          let ingredients = null;
          if (rawRecipe.inShape) {
            shape = rawRecipe.inShape.map((row) => row.map(itemName));
            if (shape.some((row) => row.some((name, index) => rawRecipe.inShape[shape.indexOf(row)][index] !== 0 && name === undefined))) continue;
          } else if (rawRecipe.ingredients) {
            ingredients = rawRecipe.ingredients.map(itemName);
            if (ingredients.some((name, index) => name === undefined && rawRecipe.ingredients[index] !== 0)) continue;
          } else {
            continue;
          }
          const output = normalizeItemName(resultItem.name);
          recipes.push({
            key: `${outputId}:${variantIndex}`,
            output,
            outputName: resultItem.displayName,
            count: rawRecipe.result.count,
            shape,
            ingredients,
          });
        }
      }
      recipes.sort((left, right) => left.outputName.localeCompare(right.outputName));
      this.minecraftRecipes = recipes;
      document.querySelector("#recipe-count").textContent = `${recipes.length} RECIPES`;
      status.textContent = "Minecraft Java 1.21.4 · shaped recipes show their exact 3×3 layout";
      this.renderMinecraftRecipeBook();
      this.updateHud(true);
    } catch (error) {
      status.textContent = "Recipe book could not load. Run the game with npm start.";
      console.error(error);
    }
  }

  renderMinecraftRecipeBook() {
    const query = document.querySelector("#recipe-search").value.trim().toLowerCase();
    const matches = this.minecraftRecipes.filter((recipe) => `${recipe.outputName} ${recipe.output}`.toLowerCase().includes(query));
    const visible = matches.slice(0, this.recipeBookLimit);
    const list = document.querySelector("#minecraft-recipe-list");
    list.innerHTML = visible.map((recipe) => {
      const cells = Array(9).fill(null);
      if (recipe.shape) {
        const height = recipe.shape.length;
        const width = Math.max(...recipe.shape.map((row) => row.length));
        const offsetX = Math.floor((3 - width) / 2);
        const offsetY = Math.floor((3 - height) / 2);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < recipe.shape[y].length; x++) cells[(y + offsetY) * 3 + x + offsetX] = recipe.shape[y][x];
        }
      } else {
        recipe.ingredients.slice(0, 9).forEach((name, index) => { cells[index] = name; });
      }
      const pattern = cells.map((name) => `<i class="recipe-cell ${name ? "filled" : ""}"${name ? ` style="--swatch:${RESOURCE_NAMES[name]?.color || recipeItemColor(name)}" title="${RESOURCE_NAMES[name]?.name || name}"` : ""}></i>`).join("");
      const ingredientLabel = recipe.shape ? "SHAPED" : "SHAPELESS";
      return `<button class="minecraft-recipe" data-recipe-key="${recipe.key}" title="Load ${recipe.outputName} recipe into the 3x3 grid"><span class="recipe-pattern">${pattern}</span><span><strong class="recipe-name">${recipe.outputName}</strong><br><small class="recipe-count">${ingredientLabel} RECIPE</small></span><span class="recipe-output">×${recipe.count}</span></button>`;
    }).join("");
    if (matches.length > visible.length) list.insertAdjacentHTML("beforeend", '<button class="craft-action" data-load-more>Show more recipes</button>');
    document.querySelector("#recipe-book-status").textContent = matches.length ? `Showing ${visible.length} of ${matches.length} matching recipe variants` : "No recipes match that search.";
  }

  async loadMinecraftRecipeBook() {
    const status = document.querySelector("#recipe-book-status");
    try {
        // Set 'vv' as the main data provider
        const items = vv.items;
        const rawRecipes = vv.recipes;

        this.minecraftItemsById = new Map(Object.entries(items).map(([id, item]) => ([id, item])));
        this.minecraftItemsByName = new Map(Object.entries(items).map(([id, item]) => ([item.name, item])));
        this.minecraftRecipes = [];

        for (const [outputId, variants] of Object.entries(rawRecipes)) {
            const outputItem = this.minecraftItemsById.get(Number(outputId));
            if (!outputItem) continue;

            for (const [variantIndex, rawRecipe] of variants.entries()) {
                const resultItem = this.minecraftItemsById.get(rawRecipe.result.id);
                if (!resultItem) continue;

                this.minecraftRecipes.push({
                    key: `${outputId}-${variantIndex}`,
                    output: outputItem,
                    result: resultItem,
                    ingredients: rawRecipe.ingredients || [],
                    shape: rawRecipe.inShape || null
                });
            }
        }

        if (status) status.textContent = "Recipes loaded successfully from vv!";
        this.renderMinecraftRecipeBook();
    } catch (error) {
        if (status) status.textContent = "Error parsing recipes from vv data store.";
        console.error(error);
    }
}


  buyMissingRecipeIngredients() {
    const recipe = this.minecraftRecipes.find((entry) => entry.key === this.pendingMinecraftRecipeKey);
    if (!recipe) return;
    const required = this.getRecipeCosts({ type: "minecraft", recipe });
    const missing = Object.entries(required).filter(([item, count]) => (this.inventory[item] || 0) < count);
    const cost = missing.reduce((total, [item, count]) => total + (count - (this.inventory[item] || 0)) * 2, 0);
    if (this.coins < cost) { this.toast(`Need ${cost - this.coins} more coins for the ingredients`); return; }
    this.coins -= cost;
    for (const [item, count] of missing) this.inventory[item] = (this.inventory[item] || 0) + count - (this.inventory[item] || 0);
    this.loadMinecraftRecipe(recipe.key);
    this.toast(`Ingredients supplied · ${cost} coins`);
  }

  selectTool(tool) {
    if (tool === "wand" && !this.hasWand) { this.toast("Forge the Infinity wand first"); return; }
    if (tool === "sword" && !this.inventory.sword) { this.toast("Craft a sword at the workbench first"); return; }
    if ((MATERIALS[tool] || MACHINES[tool]) && !this.inventory[tool]) { this.toast(`No ${this.getItemInfo(tool).name.toLowerCase()} available`); return; }
    this.activeTool = tool;
    document.querySelectorAll(".tool, .hotbar-slot").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.tool === tool)));
    document.querySelector("#active-tool").textContent = TOOL_NAMES[tool];
  }

  openCraftingBox() {
    const dialog = document.querySelector("#crafting-box");
    this.updateHud(true);
    if (!dialog.open) dialog.showModal();
  }

  craftItem(item) {
    this.loadRecipe(item);
  }

  loadRecipe(recipeName) {
    if (recipeName === "sword") {
      const stoneSword = this.minecraftRecipes.find((recipe) => recipe.output === "sword" && recipe.outputName === "Stone Sword" && recipe.shape);
      if (stoneSword) this.loadMinecraftRecipe(stoneSword.key);
      else this.toast("The Minecraft recipe book is still loading");
      return;
    }
    const recipe = CRAFT_RECIPES[recipeName];
    if (!recipe) return;
    if (recipeName === "sword" && this.inventory.sword) { this.toast("You already have a sword"); return; }
    if (recipeName === "wand" && this.hasWand) { this.toast("The Infinity wand is already forged"); return; }
    if (recipeName === "boss" && this.infinityActive) { this.toast("The Infinity monster is already here"); return; }
    const missing = Object.entries(recipe).filter(([material, amount]) => (this.inventory[material] || 0) < amount);
    if (missing.length) {
      this.toast(`Need ${missing.map(([material, amount]) => `${amount - (this.inventory[material] || 0)} ${RESOURCE_NAMES[material]?.name || material}`).join(", ")}`);
      return;
    }
    this.craftingGrid = Array(9).fill(null);
    let slotIndex = 0;
    for (const [material, amount] of Object.entries(recipe)) {
      let remaining = amount;
      while (remaining > 0 && slotIndex < this.craftingGrid.length) {
        const count = Math.min(64, remaining);
        this.craftingGrid[slotIndex++] = { material, count };
        remaining -= count;
      }
    }
    this.selectedCraftMaterial = null;
    this.updateHud(true);
  }

  getCraftingCounts() {
    const counts = {};
    for (const item of this.craftingGrid) {
      if (item) counts[item.material] = (counts[item.material] || 0) + item.count;
    }
    return counts;
  }

  getGridRecipe() {
    const selected = this.getCraftingCounts();
    const customRecipe = Object.entries(CRAFT_RECIPES).find(([, recipe]) => {
      const materials = new Set([...Object.keys(recipe), ...Object.keys(selected)]);
      return [...materials].every((material) => (recipe[material] || 0) === (selected[material] || 0));
    });
    if (customRecipe) {
      const [key, ingredients] = customRecipe;
      const outputName = key === "boss" ? "Infinity Monster" : key === "wand" ? "Infinity Wand" : this.getItemInfo(key).name;
      return { type: "custom", key, ingredients, output: key, outputName, count: 1 };
    }
    const recipe = this.minecraftRecipes.find((entry) => this.matchesMinecraftRecipe(entry));
    return recipe ? { type: "minecraft", key: recipe.key, recipe, output: recipe.output, outputName: recipe.outputName, count: recipe.count } : null;
  }

  matchesMinecraftRecipe(recipe) {
    if (recipe.shape) {
      const height = recipe.shape.length;
      const width = Math.max(...recipe.shape.map((row) => row.length));
      for (let offsetY = 0; offsetY <= 3 - height; offsetY++) {
        for (let offsetX = 0; offsetX <= 3 - width; offsetX++) {
          for (const mirrored of [false, true]) {
            let matches = true;
            for (let y = 0; y < 3 && matches; y++) {
              for (let x = 0; x < 3; x++) {
                const item = this.craftingGrid[y * 3 + x];
                const shapeY = y - offsetY;
                const shapeX = x - offsetX;
                let expected = null;
                if (shapeY >= 0 && shapeY < height && shapeX >= 0 && shapeX < width) {
                  const sourceX = mirrored ? width - shapeX - 1 : shapeX;
                  expected = recipe.shape[shapeY][sourceX] || null;
                }
                const actual = item ? normalizeItemName(item.material) : null;
                if (actual !== expected || (item && item.count < 1)) { matches = false; break; }
              }
            }
            if (matches) return true;
          }
        }
      }
      return false;
    }
    const required = recipe.ingredients.reduce((counts, item) => ({ ...counts, [item]: (counts[item] || 0) + 1 }), {});
    const selected = {};
    for (const item of this.craftingGrid) {
      if (item) selected[normalizeItemName(item.material)] = (selected[normalizeItemName(item.material)] || 0) + item.count;
    }
    const materials = new Set([...Object.keys(required), ...Object.keys(selected)]);
    return [...materials].every((material) => (required[material] || 0) === (selected[material] || 0));
  }

  selectCraftMaterial(material) {
    if (!(material in this.inventory)) return;
    const used = this.getCraftingCounts()[material] || 0;
    if ((this.inventory[material] || 0) <= used) { this.toast(`No more ${this.getItemInfo(material).name.toLowerCase()} available`); return; }
    this.selectedCraftMaterial = material;
    this.updateHud(true);
  }

  editCraftSlot(index, fillStack = false) {
    if (index < 0 || index >= this.craftingGrid.length) return;
    const current = this.craftingGrid[index];
    if (!this.selectedCraftMaterial) {
      if (!current) return;
      this.craftingGrid[index] = null;
      this.selectedCraftMaterial = current.material;
      this.updateHud(true);
      return;
    }
    const material = this.selectedCraftMaterial;
    const used = this.getCraftingCounts()[material] || 0;
    const available = (this.inventory[material] || 0) - used + (current?.material === material ? current.count : 0);
    if (available <= 0) { this.toast(`No more ${this.getItemInfo(material).name.toLowerCase()} available`); return; }
    if (current?.material === material) {
      current.count = Math.min(64, current.count + (fillStack ? available : 1));
    } else {
      this.craftingGrid[index] = { material, count: fillStack ? Math.min(64, available) : 1 };
    }
    this.updateHud(true);
  }

  swapCraftSlots(from, to) {
    if (from === to || !this.craftingGrid[from] || to < 0 || to >= this.craftingGrid.length) return;
    [this.craftingGrid[from], this.craftingGrid[to]] = [this.craftingGrid[to], this.craftingGrid[from]];
    this.updateHud(true);
  }

  removeIngredient(material) {
    const slot = this.craftingGrid.find((item) => item?.material === material);
    if (!slot) return;
    if (slot.count === 1) this.craftingGrid[this.craftingGrid.indexOf(slot)] = null;
    else slot.count -= 1;
    this.updateHud(true);
  }

  clearIngredients() {
    this.craftingGrid = Array(9).fill(null);
    this.selectedCraftMaterial = null;
    this.updateHud(true);
    this.toast("Ingredients returned to your inventory");
  }

  craftSelected() {
    const match = this.getGridRecipe();
    if (!match) { this.toast("No recipe matches these ingredients"); return; }
    if (match.type === "minecraft") {
      this.craftMinecraftRecipe(match.recipe);
      return;
    }
    if (match.key === "wand" && this.hasWand) { this.toast("The Infinity wand is already forged"); return; }
    if (match.key === "boss" && this.infinityActive) { this.toast("The Infinity monster is already here"); return; }
    if (!this.spendInventory(match.ingredients)) return;
    this.craftingGrid = Array(9).fill(null);
    this.selectedCraftMaterial = null;
    if (match.key === "wand") this.crafting.craftWand();
    if (match.key === "boss") this.crafting.summonInfinity();
    if (MACHINES[match.key]) {
      this.inventory[match.key] = (this.inventory[match.key] || 0) + match.count;
      this.toast(`${MACHINES[match.key].name} crafted · select it from the bottom bar`);
    }
    this.updateHud(true);
  }

  craftMinecraftRecipe(recipe) {
    if (recipe.output === "sword" && this.inventory.sword) { this.toast("You already have a sword"); return; }
    const costs = this.getRecipeCosts({ type: "minecraft", recipe });
    if (!this.spendInventory(costs)) return;
    if (recipe.shape) {
      for (let index = 0; index < this.craftingGrid.length; index++) {
        const item = this.craftingGrid[index];
        if (!item) continue;
        item.count -= 1;
        if (item.count <= 0) this.craftingGrid[index] = null;
      }
    } else {
      for (const material of recipe.ingredients) {
        const slot = this.craftingGrid.find((item) => item && normalizeItemName(item.material) === material);
        if (!slot) continue;
        slot.count -= 1;
        if (slot.count <= 0) this.craftingGrid[this.craftingGrid.indexOf(slot)] = null;
      }
    }
    this.inventory[recipe.output] = (this.inventory[recipe.output] || 0) + recipe.count;
    this.toast(`Crafted ${recipe.outputName} ×${recipe.count}`);
    this.updateHud(true);
  }

  getRecipeCosts(match) {
    if (match.type === "custom") return match.ingredients;
    if (!match.recipe.shape) return match.recipe.ingredients.reduce((counts, material) => ({ ...counts, [material]: (counts[material] || 0) + 1 }), {});
    return match.recipe.shape.flat().filter(Boolean).reduce((counts, material) => ({ ...counts, [material]: (counts[material] || 0) + 1 }), {});
  }

  spendInventory(costs) {
    const missing = Object.entries(costs).filter(([material, count]) => (this.inventory[material] || 0) < count);
    if (missing.length) {
      this.toast(`Not enough ${missing.map(([material, count]) => `${RESOURCE_NAMES[material]?.name || this.getItemInfo(material).name} (${this.inventory[material] || 0}/${count})`).join(", ")}`);
      return false;
    }
    for (const [material, count] of Object.entries(costs)) this.inventory[material] = Math.max(0, (this.inventory[material] || 0) - count);
    return true;
  }

  buy(material) {
    const cost = MATERIALS[material].buy;
    if (this.coins < cost) { this.toast("Not enough coins"); return; }
    this.coins -= cost;
    this.inventory[material] += 1;
    this.toast(`Bought one ${MATERIALS[material].name.toLowerCase()} cube`);
    this.updateHud(true);
  }

  craftWand() {
    this.loadRecipe("wand");
  }

  placeAt(x, y) {
    const material = this.activeTool;
    const item = MATERIALS[material] || MACHINES[material];
    if (!item) return;
    if (this.inventory[material] <= 0) { this.toast(`No ${item.name.toLowerCase()} in your bag`); return; }
    const message = this.map.place(x, y, material, this.player, this.monsters.monsters);
    if (message) { this.toast(message); return; }
    this.inventory[material] -= 1;
    const center = cellCenter(x, y);
    this.burst(center.x, center.y, item.highlight || item.color, 5);
    if (MATERIALS[material]) this.crafting.combineAt(x, y);
    if (this.inventory[material] <= 0) this.selectTool("pick");
    this.updateHud(true);
  }

  useWorldPoint(worldX, worldY) {
    const x = Math.floor(worldX / TILE);
    const y = Math.floor(worldY / TILE);
    if (this.activeTool === "pick") {
      mineTarget = { x, y };
      miningTimer = 0;
      this.mineTarget();
    } else if (this.activeTool === "wand") {
      this.castWand(x, y);
    } else if (this.activeTool === "fuse") {
      if (distance(this.player.x, this.player.y, (x + 0.5) * TILE, (y + 0.5) * TILE) > TILE * 3.5) this.toast("Too far to fuse that cluster");
      else this.crafting.combineAt(x, y);
    } else {
      this.placeAt(x, y);
    }
  }

  castWand(x, y) {
    if (!this.hasWand) { this.toast("Forge the Infinity wand first"); return; }
    const result = this.map.duplicateAt(x, y, this.player);
    if (result.message) { this.toast(result.message); return; }
    this.inventory[result.material] += 100;
    this.burst((result.x + 0.5) * TILE, (result.y + 0.5) * TILE, MATERIALS[result.material].highlight, 28);
    this.toast(`Block absorbed · +100 ${RESOURCE_NAMES[result.material].name.toLowerCase()}`);
    this.updateHud(true);
  }

  mineTarget() {
    if (!mineTarget || this.activeTool !== "pick" || this.dead) return;
    const result = this.map.mine(mineTarget.x, mineTarget.y, this.player);
    if (result.message) {
      if (performance.now() - this.lastMiningMessage > 1200) this.toast(result.message);
      this.lastMiningMessage = performance.now();
      return;
    }
    if (!result.material) return;
    for (const [material, count] of Object.entries(result.resources)) this.inventory[material] += count;
    this.burst((result.x + 0.5) * TILE, (result.y + 0.5) * TILE, MATERIALS[result.material].highlight, 10);
    if (Math.random() < (result.resources.crystal ? 0.55 : 0.16)) this.coinsManager.drop((result.x + 0.5) * TILE, (result.y + 0.5) * TILE, 1);
    this.updateHud(true);
  }

  hurt(amount) {
    if (this.player.invulnerable > 0 || this.dead) return;
    this.health = Math.max(0, this.health - amount);
    this.player.invulnerable = 0.65;
    this.burst(this.player.x, this.player.y, "#f27672", 9);
    if (this.health <= 0) {
      this.dead = true;
      document.querySelector("#score-copy").textContent = `You reached depth ${String(this.level).padStart(2, "0")}, defeated ${this.creepers} creepers, and collected ${this.coins} coins.`;
      document.querySelector("#game-over").hidden = false;
      mouseDown = false;
    }
    this.updateHud(true);
  }

  nextLevel() {
    this.level += 1;
    this.health = Math.min(100, this.health + 22);
    this.map.generate(this.level);
    this.player.x = (MAP_WIDTH / 2 + 0.5) * TILE;
    this.player.y = (MAP_HEIGHT / 2 + 0.5) * TILE;
    this.coinsManager.scatter(25 + Math.min(this.level, 20));
    this.monsters.transitionTimer = 0;
    this.monsters.spawnWave();
    this.updateHud(true);
  }

  restart() {
    this.level = 1;
    this.health = 100;
    this.coins = 8;
    this.kills = 0;
    this.creepers = 0;
    this.hasWand = false;
    this.infinityActive = false;
    this.activeTool = "pick";
    this.inventory = { dirt: 7, stone: 4, crystal: 1, gold: 0, diamond: 0, sticks: 0, creepers: 0, sword: 0 };
    this.craftingGrid = Array(9).fill(null);
    this.selectedCraftMaterial = null;
    document.querySelector('[data-tool="wand"]').disabled = true;
    document.querySelector('[data-tool="sword"]').disabled = true;
    const craftingBox = document.querySelector("#crafting-box");
    if (craftingBox.open) craftingBox.close();
    this.dead = false;
    this.map.generate(1);
    this.player.x = (MAP_WIDTH / 2 + 0.5) * TILE;
    this.player.y = (MAP_HEIGHT / 2 + 0.5) * TILE;
    this.player.invulnerable = 0;
    this.monsters.monsters.length = 0;
    this.coinsManager.scatter(30);
    this.monsters.spawnWave();
    document.querySelector("#game-over").hidden = true;
    this.updateHud(true);
  }

  burst(x, y, color, count) {
    for (let index = 0; index < count; index++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 18 + Math.random() * 82;
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, age: 0, life: 0.25 + Math.random() * 0.35, color, size: 1 + Math.random() * 3 });
    }
  }

  toast(text) {
    const element = document.querySelector("#toast");
    element.textContent = text;
    element.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove("show"), 1350);
  }

  update(delta, now) {
    if (!this.dead && !document.querySelector("#crafting-box").open) {
      this.player.update(delta);
      this.monsters.update(delta);
      this.coinsManager.update(delta);
      if (mouseDown && this.activeTool === "pick") {
        miningTimer -= delta;
        if (miningTimer <= 0) { this.mineTarget(); miningTimer = 0.2; }
      }
      this.updateSentries(delta);
    }
    for (let index = particles.length - 1; index >= 0; index--) {
      const particle = particles[index];
      particle.age += delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vx *= 0.97;
      particle.vy *= 0.97;
      if (particle.age >= particle.life) particles.splice(index, 1);
    }
    this.frameTime += delta;
    if (this.frameTime > 0.15) {
      this.frameTime = 0;
      this.updateHud(false);
    }
    if (now - lastMapDraw > 350) {
      lastMapDraw = now;
      this.drawMinimap();
    }
  }

  updateSentries(delta) {
    const generators = [...this.map.placed.values()].filter((placed) => placed.kind === "machine" && placed.machineType === "generator");
    for (const [key, placed] of this.map.placed) {
      if (placed.kind !== "sentry" && !(placed.kind === "machine" && placed.machineType === "turret")) continue;
      const origin = cellCenter(placed.x, placed.y);
      const powered = generators.some((generator) => distance(origin.x, origin.y, (generator.x + 0.5) * TILE, (generator.y + 0.5) * TILE) <= TILE * 6);
      placed.powered = powered;
      placed.cooldown = (placed.cooldown || Math.random() * 0.5) - delta * (powered ? 2.5 : 1);
      if (placed.cooldown > 0) continue;
      let nearest = null;
      let best = TILE * 7;
      for (const monster of this.monsters.monsters) {
        const gap = distance(origin.x, origin.y, monster.x, monster.y);
        if (gap < best) { best = gap; nearest = monster; }
      }
      if (nearest) {
        nearest.hp -= 1;
        nearest.hitFlash = 0.12;
        placed.targetX = nearest.x;
        placed.targetY = nearest.y;
        placed.beam = 0.12;
      }
      placed.cooldown = powered ? 0.36 : 0.9;
    }
  }

  updateHud(force) {
    const now = performance.now();
    if (!force && now - lastHudUpdate < 220) return;
    lastHudUpdate = now;
    document.querySelector("#level-value").textContent = String(this.level).padStart(2, "0");
    document.querySelector("#sector-value").textContent = `${String.fromCharCode(65 + ((this.level - 1) % 26))}-${String(this.level).padStart(2, "0")}`;
    document.querySelector("#enemy-value").textContent = String(this.monsters.monsters.length).padStart(2, "0");
    document.querySelector("#creeper-value").textContent = String(this.creepers).padStart(3, "0");
    document.querySelector("#coin-value").textContent = String(this.coins);
    const pendingRecipe = this.minecraftRecipes.find((recipe) => recipe.key === this.pendingMinecraftRecipeKey);
    const supplyButton = document.querySelector("#recipe-supply");
    if (pendingRecipe) {
      const missing = Object.entries(this.getRecipeCosts({ type: "minecraft", recipe: pendingRecipe })).filter(([item, count]) => (this.inventory[item] || 0) < count);
      const supplyCost = missing.reduce((total, [item, count]) => total + (count - (this.inventory[item] || 0)) * 2, 0);
      supplyButton.hidden = missing.length === 0;
      supplyButton.disabled = this.coins < supplyCost;
      supplyButton.textContent = `Supply missing items · ${supplyCost} coins`;
    }
    document.querySelector("#health-value").textContent = String(Math.ceil(this.health));
    const fill = document.querySelector("#health-fill");
    fill.style.width = `${this.health}%`;
    fill.style.background = this.health < 34 ? "#f27672" : this.health < 65 ? "#edbd58" : "#75e0b4";
    const threat = document.querySelector("#threat-value");
    threat.textContent = this.monsters.monsters.length > 7 ? "HIGH" : this.monsters.monsters.length > 3 ? "ACTIVE" : "CLEAR";
    threat.style.color = this.monsters.monsters.length > 7 ? "#f27672" : this.monsters.monsters.length > 3 ? "#edbd58" : "#75e0b4";
    const materialInfo = new Map(Object.entries(RESOURCE_NAMES));
    for (const [key, count] of Object.entries(this.inventory)) {
      if (count > 0 && !materialInfo.has(key)) materialInfo.set(key, this.getItemInfo(key));
    }
    const materialItems = [...materialInfo].map(([key, material]) => [key, material.name, material.color]);
    const usedMaterials = this.getCraftingCounts();
    const inventory = document.querySelector("#inventory-list");
    inventory.innerHTML = materialItems.map(([key, name, color]) => `<div class="material"><i class="material-swatch" style="--swatch:${color}"></i><span class="material-name">${name}</span><strong class="material-count">${this.inventory[key] || 0}</strong></div>`).join("");
    const boxInventory = document.querySelector("#box-inventory");
    boxInventory.innerHTML = materialItems.map(([key, name, color]) => {
      const count = this.inventory[key] || 0;
      const used = usedMaterials[key] || 0;
      const selected = this.selectedCraftMaterial === key;
      return `<button class="box-item ${selected ? "selected" : ""}" data-add-material="${key}" draggable="${count > used}" ${count <= used ? "disabled" : ""}><span class="box-item-top"><i class="box-item-swatch" style="--swatch:${color}"></i>${name}</span><strong class="box-item-count">${count}</strong><span class="material-name">${count - used} available</span></button>`;
    }).join("");
    const gridElement = document.querySelector("#craft-grid");
    gridElement.querySelectorAll("[data-slot]").forEach((slot) => {
      const item = this.craftingGrid[Number(slot.dataset.slot)];
      slot.classList.toggle("has-item", !!item);
      slot.draggable = !!item;
      const itemInfo = item ? this.getItemInfo(item.material) : null;
      slot.innerHTML = item ? `<i class="craft-slot-swatch" style="--swatch:${itemInfo.color}"></i><span class="craft-slot-count">${item.count}</span>` : "";
      slot.setAttribute("aria-label", item ? `${itemInfo.name}, ${item.count}` : "Empty crafting slot");
    });
    const selectedEntries = Object.entries(usedMaterials).filter(([, count]) => count > 0);
    const selectedCount = selectedEntries.reduce((total, [, count]) => total + count, 0);
    const ingredientList = document.querySelector("#ingredient-list");
    ingredientList.innerHTML = selectedEntries.length ? selectedEntries.map(([key, count]) => {
      const itemInfo = this.getItemInfo(key);
      return `<button class="ingredient-chip" data-remove-material="${key}" title="Click to return one"><i style="--swatch:${itemInfo.color}"></i>${itemInfo.name}<b>×${count}</b></button>`;
    }).join("") : '<span class="ingredient-empty">Ingredients in the grid appear here.</span>';
    document.querySelector("#ingredient-summary").textContent = `${selectedCount} ingredient${selectedCount === 1 ? "" : "s"}`;
    ingredientList.querySelectorAll("[data-remove-material]").forEach((button) => button.addEventListener("click", () => this.removeIngredient(button.dataset.removeMaterial)));
    document.querySelector("#clear-ingredients").disabled = selectedEntries.length === 0;
    const matchedRecipe = this.getGridRecipe();
    const alreadyCrafted = matchedRecipe?.type === "custom" ? matchedRecipe.key === "wand" ? this.hasWand : matchedRecipe.key === "boss" ? this.infinityActive : false : matchedRecipe?.output === "sword" && !!this.inventory.sword;
    const craftButton = document.querySelector("#craft-selected");
    craftButton.disabled = !matchedRecipe || alreadyCrafted;
    craftButton.textContent = matchedRecipe ? `Craft ${matchedRecipe.outputName}` : "Craft selected";
    const output = document.querySelector("#craft-output");
    const outputName = matchedRecipe?.outputName || "";
    const outputColor = matchedRecipe?.key === "boss" ? "#b27be8" : matchedRecipe ? this.getItemInfo(matchedRecipe.output).color : "#b27be8";
    output.disabled = !matchedRecipe || alreadyCrafted;
    output.innerHTML = matchedRecipe ? `<i class="craft-slot-swatch" style="--swatch:${outputColor}"></i><span class="craft-slot-count">${outputName} ×${matchedRecipe.count}</span>` : "";
    output.setAttribute("aria-label", matchedRecipe ? `Craft ${outputName}, quantity ${matchedRecipe.count}` : "No matching recipe");
    document.querySelectorAll("[data-count]").forEach((element) => { element.textContent = String(this.inventory[element.dataset.count]); });
    document.querySelectorAll(".shop-item[data-buy]").forEach((button) => { button.disabled = this.coins < MATERIALS[button.dataset.buy].buy; });
    for (const [resource, required] of Object.entries(WAND_RECIPE)) {
      const available = this.inventory[resource] || 0;
      const counter = document.querySelector(`[data-requirement="${resource}"]`);
      counter.textContent = `${Math.min(available, required)} / ${required}`;
      counter.classList.toggle("requirement-met", available >= required);
    }
    const forgeButton = document.querySelector("#craft-wand");
    forgeButton.disabled = this.hasWand;
    forgeButton.querySelector(".shop-name").textContent = this.hasWand ? "Infinity wand forged" : "Load wand ingredients";
    forgeButton.querySelector(".shop-cost").textContent = this.hasWand ? "READY" : "LOAD";
    document.querySelector('[data-tool="wand"]').disabled = !this.hasWand;
    document.querySelector('[data-tool="sword"]').disabled = !this.inventory.sword;
    document.querySelectorAll("[data-fill]").forEach((button) => {
      const isSword = button.dataset.fill === "sword";
      const swordRecipe = isSword ? this.minecraftRecipes.find((recipe) => recipe.output === "sword" && recipe.outputName === "Stone Sword" && recipe.shape) : null;
      const recipe = isSword ? swordRecipe && this.getRecipeCosts({ type: "minecraft", recipe: swordRecipe }) : CRAFT_RECIPES[button.dataset.fill];
      const available = !!recipe && Object.entries(recipe).every(([material, amount]) => (this.inventory[material] || 0) >= amount);
      const owned = isSword ? !!this.inventory.sword : button.dataset.fill === "wand" ? this.hasWand : button.dataset.fill === "boss" ? this.infinityActive : false;
      button.disabled = !available || owned;
      button.textContent = owned ? "Already made" : "Load ingredients";
    });
    const hotbar = document.querySelector("#inventory-hotbar");
    hotbar.innerHTML = Object.entries({ ...MATERIALS, ...MACHINES }).filter(([material]) => this.inventory[material] > 0).map(([material, details], index) =>
      `<button class="hotbar-slot" data-tool="${material}" aria-pressed="${this.activeTool === material}" title="Place ${details.name} (${this.inventory[material]})"><kbd class="hotbar-key">${index + 1}</kbd><i class="hotbar-swatch" style="--swatch:${details.color}"></i><strong class="hotbar-amount">${this.inventory[material]}</strong></button>`
    ).join("");
    if ((MATERIALS[this.activeTool] || MACHINES[this.activeTool]) && !this.inventory[this.activeTool]) this.activeTool = "pick";
    if (force) this.selectTool(this.activeTool);
  }

  drawMinimap() {
    const width = minimap.clientWidth;
    const height = minimap.clientHeight;
    if (!width || !height) return;
    const ratio = window.devicePixelRatio || 1;
    if (minimap.width !== Math.round(width * ratio) || minimap.height !== Math.round(height * ratio)) {
      minimap.width = Math.round(width * ratio);
      minimap.height = Math.round(height * ratio);
    }
    mapCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    mapCtx.fillStyle = "#101713";
    mapCtx.fillRect(0, 0, width, height);
    const scale = Math.min(width / MAP_WIDTH, height / MAP_HEIGHT);
    const offsetX = (width - MAP_WIDTH * scale) / 2;
    const offsetY = (height - MAP_HEIGHT * scale) / 2;
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (this.map.getTerrain(x, y)) {
          mapCtx.fillStyle = "#344039";
          mapCtx.fillRect(offsetX + x * scale, offsetY + y * scale, Math.ceil(scale), Math.ceil(scale));
        }
      }
    }
    for (const coin of this.coinsManager.coins) {
      mapCtx.fillStyle = "#edbd58";
      mapCtx.fillRect(offsetX + coin.x / TILE * scale, offsetY + coin.y / TILE * scale, 2, 2);
    }
    for (const monster of this.monsters.monsters) {
      mapCtx.fillStyle = "#f27672";
      mapCtx.fillRect(offsetX + monster.x / TILE * scale - 1, offsetY + monster.y / TILE * scale - 1, 3, 3);
    }
    mapCtx.fillStyle = "#d1ed69";
    mapCtx.beginPath();
    mapCtx.arc(offsetX + this.player.x / TILE * scale, offsetY + this.player.y / TILE * scale, 3, 0, Math.PI * 2);
    mapCtx.fill();
  }

  render() {
    const cameraX = clamp(this.player.x - viewWidth / 2, 0, MAP_WIDTH * TILE - viewWidth);
    const cameraY = clamp(this.player.y - viewHeight / 2, 0, MAP_HEIGHT * TILE - viewHeight);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, viewWidth, viewHeight);
    ctx.save();
    ctx.translate(-cameraX, -cameraY);
    this.map.render(ctx, cameraX, cameraY, viewWidth, viewHeight);
    this.coinsManager.render(ctx);
    this.renderSentries(ctx);
    this.monsters.render(ctx);
    this.player.render(ctx);
    this.renderParticles(ctx);
    if (pointer.inside && !this.dead) this.renderTarget(ctx, cameraX, cameraY);
    ctx.restore();
  }

  renderSentries(context) {
    for (const placed of this.map.placed.values()) {
      if ((placed.kind !== "sentry" && !(placed.kind === "machine" && placed.machineType === "turret")) || !placed.targetX || !placed.targetY) continue;
      placed.beam = Math.max(0, (placed.beam || 0) - 1 / 60);
      if (placed.beam <= 0) continue;
      const origin = cellCenter(placed.x, placed.y);
      context.strokeStyle = `rgba(209,237,105,${placed.beam * 5})`;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(origin.x, origin.y);
      context.lineTo(placed.targetX, placed.targetY);
      context.stroke();
    }
  }

  renderParticles(context) {
    for (const particle of particles) {
      context.globalAlpha = 1 - particle.age / particle.life;
      context.fillStyle = particle.color;
      context.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    context.globalAlpha = 1;
  }

  renderTarget(context, cameraX, cameraY) {
    const x = pointer.x + cameraX;
    const y = pointer.y + cameraY;
    const cellX = Math.floor(x / TILE);
    const cellY = Math.floor(y / TILE);
    const gap = distance(this.player.x, this.player.y, (cellX + 0.5) * TILE, (cellY + 0.5) * TILE);
    if (gap > TILE * 4.8) return;
    const selectedItem = MATERIALS[this.activeTool] || MACHINES[this.activeTool];
    context.strokeStyle = this.activeTool === "pick" ? "#e7eee3b8" : this.activeTool === "fuse" ? "#d1ed69" : this.activeTool === "wand" ? "#f2ce70" : "#75e0b4";
    context.lineWidth = 2;
    context.strokeRect(cellX * TILE + 3, cellY * TILE + 3, TILE - 6, TILE - 6);
    if (selectedItem) {
      context.globalAlpha = 0.18;
      context.fillStyle = selectedItem.highlight || selectedItem.color;
      context.fillRect(cellX * TILE + 3, cellY * TILE + 3, TILE - 6, TILE - 6);
      context.globalAlpha = 1;
    }
  }
}

function resizeCanvases() {
  const bounds = canvas.getBoundingClientRect();
  viewWidth = Math.max(1, bounds.width);
  viewHeight = Math.max(1, bounds.height);
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(viewWidth * pixelRatio);
  const height = Math.round(viewHeight * pixelRatio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  if (game) game.drawMinimap();
}

function screenToWorld(clientX, clientY) {
  const bounds = canvas.getBoundingClientRect();
  const cameraX = clamp(game.player.x - viewWidth / 2, 0, MAP_WIDTH * TILE - viewWidth);
  const cameraY = clamp(game.player.y - viewHeight / 2, 0, MAP_HEIGHT * TILE - viewHeight);
  return { x: clientX - bounds.left + cameraX, y: clientY - bounds.top + cameraY };
}

const game = new GameManager();
new ResizeObserver(resizeCanvases).observe(document.querySelector("#world-frame"));
window.addEventListener("resize", resizeCanvases);
resizeCanvases();

canvas.addEventListener("pointermove", (event) => {
  const bounds = canvas.getBoundingClientRect();
  pointer.x = event.clientX - bounds.left;
  pointer.y = event.clientY - bounds.top;
  pointer.inside = true;
  if (mouseDown && game.activeTool === "pick") {
    const world = screenToWorld(event.clientX, event.clientY);
    mineTarget = { x: Math.floor(world.x / TILE), y: Math.floor(world.y / TILE) };
  }
});
canvas.addEventListener("pointerenter", () => { pointer.inside = true; });
canvas.addEventListener("pointerleave", () => { pointer.inside = false; });
canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || game.dead) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  const world = screenToWorld(event.clientX, event.clientY);
  if (game.activeTool === "pick") {
    mouseDown = true;
    mineTarget = { x: Math.floor(world.x / TILE), y: Math.floor(world.y / TILE) };
    miningTimer = 0;
    game.mineTarget();
  } else {
    game.useWorldPoint(world.x, world.y);
  }
});
canvas.addEventListener("pointerup", () => { mouseDown = false; mineTarget = null; });
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) event.preventDefault();
  keys.add(key);
  if (event.repeat) return;
  if (key === "c") {
    const dialog = document.querySelector("#crafting-box");
    if (dialog.open) dialog.close();
    else game.openCraftingBox();
  }
  if (key === "q") game.selectTool("pick");
  if (key === "f") game.selectTool("fuse");
  if (key === "6") game.selectTool("wand");
  if (key === "7") game.selectTool("sword");
  if (Number(key) >= 1 && Number(key) <= 5) {
    const slot = document.querySelectorAll(".hotbar-slot")[Number(key) - 1];
    if (slot) game.selectTool(slot.dataset.tool);
  }
});
window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener("blur", () => { keys.clear(); mouseDown = false; });

function frame(now) {
  const delta = Math.min((now - lastFrame) / 1000 || 0, 0.04);
  lastFrame = now;
  game.update(delta, now);
  game.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
