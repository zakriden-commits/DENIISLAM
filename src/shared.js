// Northern Frontier: a new, deterministic 1 km² survival world shared by server/client.
export const WORLD = {
  size: 1024,
  camp: { x: 0, z: 36 },
  stash: { x: -4, z: 39 },
  spawns: [
    { x: -1.2, z: 43 },
    { x: 1.2, z: 43 },
  ],
  riverX: (z) => 118 + Math.sin(z * 0.014) * 24,
};
export const POIS = [
  {
    id: "camp",
    name: "Убежище «Рубеж»",
    x: 0,
    z: 36,
    w: 12,
    d: 10,
    h: 4,
    level: 0,
  },
  {
    id: "mill",
    name: "Старая лесопилка",
    x: -116,
    z: -80,
    w: 22,
    d: 16,
    h: 7,
    level: 2,
  },
  {
    id: "pump",
    name: "Насосная станция",
    x: 151,
    z: 94,
    w: 12,
    d: 10,
    h: 5,
    level: 0,
  },
  {
    id: "radio",
    name: "Вышка связи",
    x: 210,
    z: -204,
    w: 8,
    d: 8,
    h: 4,
    level: 6,
  },
  {
    id: "checkpoint",
    name: "Блокпост 04",
    x: -184,
    z: 152,
    w: 14,
    d: 10,
    h: 4,
    level: 4,
  },
  {
    id: "village",
    name: "Пустая деревня",
    x: -206,
    z: -238,
    w: 20,
    d: 14,
    h: 6,
    level: 3,
  },
  {
    id: "bunker",
    name: "Северный бункер",
    x: 36,
    z: -329,
    w: 16,
    d: 12,
    h: 4,
    level: 7,
  },
];
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function random(seed = 173) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export function heightAt(x, z) {
  let y =
    Math.sin(x * 0.009) * 9 +
    Math.cos(z * 0.011) * 6 +
    Math.sin((x + z) * 0.021) * 3 +
    Math.sin(x * 0.047) * Math.cos(z * 0.034) * 1.2;
  const river = Math.abs(x - WORLD.riverX(z));
  y -= Math.max(0, 1 - river / 22) * 11;
  for (const p of POIS) {
    const d = dist({ x, z }, p),
      r = Math.max(p.w, p.d) * 0.75;
    if (d < r + 38) {
      const f = Math.max(0, Math.min(1, (d - r) / 38));
      y = p.level * (1 - f) + y * f;
    }
  }
  return y;
}
export const ITEMS = {
  fist: {
    name: "Кулаки",
    kind: "weapon",
    damage: 14,
    range: 2.4,
    cooldown: 0.65,
  },
  axe: {
    name: "Походный топор",
    kind: "weapon",
    damage: 36,
    range: 3,
    cooldown: 0.8,
  },
  spear: {
    name: "Самодельное копьё",
    kind: "weapon",
    damage: 48,
    range: 4.5,
    cooldown: 1,
  },
  pistol: {
    name: "Пистолет",
    kind: "weapon",
    damage: 32,
    range: 65,
    mag: 8,
    cooldown: 0.32,
  },
  shotgun: {
    name: "Дробовик",
    kind: "weapon",
    damage: 95,
    range: 30,
    mag: 5,
    cooldown: 0.95,
  },
  dirtywater: { name: "Речная вода" },
  berries: { name: "Лесные ягоды", kind: "use" },
  wood: { name: "Древесина" },
  stone: { name: "Камень" },
  cloth: { name: "Ткань" },
  scrap: { name: "Металлолом" },
  ammo: { name: "Патроны" },
  food: { name: "Консервы", kind: "use" },
  water: { name: "Чистая вода", kind: "use" },
  raw: { name: "Сырое мясо", kind: "use" },
  cooked: { name: "Жареное мясо", kind: "use" },
  bandage: { name: "Бинт", kind: "use" },
  medkit: { name: "Аптечка", kind: "use" },
  part: { name: "Радиодеталь" },
  fuel: { name: "Топливо" },
};
export const RECIPES = {
  water: {
    name: "Кипячёная вода",
    cost: { dirtywater: 1, wood: 1 },
    result: "water",
    fire: true,
  },
  bandage: { name: "Бинт", cost: { cloth: 2 }, result: "bandage" },
  spear: {
    name: "Каменное копьё",
    cost: { wood: 3, stone: 2 },
    result: "spear",
  },
  campfire: {
    name: "Полевой костёр",
    cost: { wood: 4, stone: 3 },
    result: "campfire",
  },
  cooked: {
    name: "Жареное мясо",
    cost: { raw: 1, wood: 1 },
    result: "cooked",
    fire: true,
  },
};
const rng = random(7281);
export const TREES = [];
for (let i = 0; i < 1100; i++) {
  const x = (rng() - 0.5) * 960,
    z = (rng() - 0.5) * 960;
  if (
    POIS.some((p) => dist({ x, z }, p) < Math.max(p.w, p.d) + 12) ||
    Math.abs(x - WORLD.riverX(z)) < 16 ||
    (Math.abs(x) < 5 && z < 40 && z > -330)
  )
    continue;
  TREES.push({
    id: "t" + i,
    x,
    z,
    scale: 0.65 + rng() * 0.65,
    yaw: rng() * 6.28,
    type: rng() < 0.73 ? "broadleaf" : rng() < 0.87 ? "pine" : "dead",
  });
}
export const NODES = [];
function node(id, type, x, z, extra = {}) {
  NODES.push({ id, type, x, z, ...extra });
}
for (let i = 0; i < 22; i++) {
  const a = i * 2.4,
    r = 14 + i * 2.2;
  node("wood" + i, "wood", Math.sin(a) * r, 36 + Math.cos(a) * r);
  node("stone" + i, "stone", Math.cos(a) * r + 6, 36 + Math.sin(a) * r);
  if (i % 3 === 0)
    node("berry" + i, "berry", Math.sin(a) * r - 4, 36 + Math.cos(a) * r + 5);
}
for (const p of POIS.filter((p) => p.id !== "radio")) {
  node(p.id + "-crate", "crate", p.x - 3, p.z - 1, { site: p.id });
  node(p.id + "-supply", "supply", p.x + 3, p.z + 1, { site: p.id });
}
for (const id of ["mill", "pump", "bunker"]) {
  const p = POIS.find((p) => p.id === id);
  node(id + "-part", "part", p.x, p.z + 2, { site: id });
}
node("stream", "water", WORLD.riverX(36) - 3, 36);
for (let i = 0; i < TREES.length; i++) {
  const t = TREES[i];
  if (i % 11 === 0) node("r" + t.id, "stone", t.x + 4, t.z, { wild: true });
  if (i % 9 === 0) node("b" + t.id, "berry", t.x - 2, t.z + 3, { wild: true });
}
// A small spatial index keeps trunk collisions cheap on a full-sized map.
const grid = new Map();
for (const t of TREES) {
  const k = Math.floor(t.x / 10) + "," + Math.floor(t.z / 10);
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(t);
}
export function blocked(x, z) {
  if (Math.abs(x) > 494 || Math.abs(z) > 494) return true;
  const village = POIS.find((p) => p.id === "village");
  for (const [dx, dz, w, d] of [
    [-12, 0, 12, 12],
    [13, 7, 10, 10],
    [-22, -28, 10, 10],
  ])
    if (
      Math.abs(x - village.x - dx) < w / 2 &&
      Math.abs(z - village.z - dz) < d / 2
    )
      return true;
  for (const p of POIS.filter((p) => !["radio", "village"].includes(p.id))) {
    const l = p.x - p.w / 2,
      r = p.x + p.w / 2,
      t = p.z - p.d / 2,
      b = p.z + p.d / 2;
    if (
      z > t - 0.4 &&
      z < b + 0.4 &&
      (Math.abs(x - l) < 0.55 || Math.abs(x - r) < 0.55)
    )
      return true;
    if (
      x > l - 0.4 &&
      x < r + 0.4 &&
      (Math.abs(z - t) < 0.55 || Math.abs(z - b) < 0.55)
    )
      if (!(Math.abs(z - b) < 0.55 && Math.abs(x - p.x) < 2)) return true;
  }
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++) {
      const key = Math.floor(x / 10) + a + "," + (Math.floor(z / 10) + b);
      for (const t of grid.get(key) || [])
        if (Math.hypot(t.x - x, t.z - z) < 0.65 * t.scale + 0.25) return true;
    }
  return false;
}
export function lineClear(a, b) {
  const n = Math.ceil(dist(a, b));
  for (let i = 1; i < n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n,
      z = a.z + ((b.z - a.z) * i) / n,
      ray =
        heightAt(a.x, a.z) +
        1.6 +
        ((heightAt(b.x, b.z) + 1 - heightAt(a.x, a.z) - 1.6) * i) / n;
    if (blocked(x, z) || heightAt(x, z) > ray) return false;
  }
  return true;
}
export function nearbyTarget(p, state) {
  const list = [
    ...TREES.filter(
      (t) => dist(p, t) < 3 && !(state.depleted?.[t.id] > state.time),
    ).map((t) => ({ ...t, type: "wood" })),
    ...NODES.filter((n) => !(state.depleted?.[n.id] > state.time)),
    ...(state.drops || []).map((d) => ({ ...d, type: "drop" })),
    ...(state.npcs || [])
      .filter((n) => n.hp <= 0 && !n.harvested && n.type !== "bandit")
      .map((n) => ({ ...n, type: "carcass" })),
  ];
  let best = list
    .filter((n) => dist(p, n) < 3.5)
    .sort((a, b) => dist(a, p) - dist(b, p))[0];
  if (best) return best;
  const fire = (state.fires || []).find((f) => dist(p, f) < 3.5);
  if (fire) return { ...fire, type: "fire" };
  if (dist(p, WORLD.stash) < 3.5)
    return { id: "stash", type: "stash", ...WORLD.stash };
  const radio = POIS.find((p) => p.id === "radio");
  if (dist(p, radio) < 5) return { ...radio, type: "radio" };
  if (Math.abs(p.x - WORLD.riverX(p.z)) < 7)
    return { id: "river", type: "water", x: p.x, z: p.z };
  return null;
}
