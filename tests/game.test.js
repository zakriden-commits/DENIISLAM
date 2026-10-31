import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../server/game.js";
import {
  WORLD,
  POIS,
  NODES,
  TREES,
  ITEMS,
  dist,
  blocked,
  heightAt,
  lineClear,
} from "../src/shared.js";
function setup() {
  const g = new Game(),
    p = g.add("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "deni");
  g.npcs = [];
  return { g, p };
}
function step(g, t) {
  for (let i = 0; i < Math.ceil(t / 0.05); i++) g.step(0.05);
}
function gather(g, p, n) {
  p.x = n.x;
  p.z = n.z;
  g.action(p, { type: "gatherStart", id: n.id });
  step(g, 4);
}
test("world is new 1 km² survival terrain, with 7 places and seeded forest", () => {
  assert.equal(WORLD.size, 1024);
  assert.equal(POIS.length, 7);
  assert.ok(TREES.length > 700);
  assert.ok(Number.isFinite(heightAt(300, -400)));
  assert.ok(blocked(510, 0));
  assert.ok(!blocked(...Object.values(WORLD.spawns[0])));
});
test("one room / two distinct survivors, private inventory and no tokens leaked", () => {
  const { g, p } = setup();
  assert.throws(() => g.add("b", "deni"));
  const b = g.add("b", "islam");
  assert.equal(b.slot, 1);
  assert.throws(() => g.add("c", "islam"));
  const s = g.snapshot(p.id);
  assert.equal(s.players[0].id, "self");
  assert.ok(!JSON.stringify(s).includes(p.id));
  assert.equal(s.self.inventory.axe, 1);
  assert.equal(s.self.cash, undefined);
});
test("old tycoon save is not interpreted as survival progression", () => {
  const g = new Game({
      profiles: { a: { cash: 999999, inventory: { shotgun: 1 } } },
    }),
    p = g.add("a", "deni");
  assert.equal(p.inventory.shotgun, undefined);
  assert.equal(p.inventory.axe, 1);
});
test("gather is server-timed, range checked and resources cannot duplicate", () => {
  const { g, p } = setup(),
    n = NODES.find((n) => n.type === "wood");
  g.action(p, { type: "gatherStart", id: n.id });
  assert.equal(p.loot, null);
  p.x = n.x;
  p.z = n.z;
  g.action(p, { type: "gatherStart", id: n.id });
  step(g, 1);
  assert.equal(p.inventory.wood, 2);
  step(g, 3);
  assert.equal(p.inventory.wood, 4);
  g.action(p, { type: "gatherStart", id: n.id });
  assert.equal(p.loot, null);
});
test("moving cancels gathering and expired input stops movement", () => {
  const { g, p } = setup(),
    n = NODES[0];
  p.x = n.x;
  p.z = n.z;
  g.action(p, { type: "gatherStart", id: n.id });
  g.action(p, { type: "input", x: 1, z: 0, aim: 0 });
  step(g, 0.2);
  assert.equal(p.loot, null);
  step(g, 1);
  assert.equal(p.input.x, 0);
});
test("hunger/thirst/cold matter, campfire consumes actual wood and warms", () => {
  const { g, p } = setup();
  p.x = 50;
  p.z = 100;
  p.warmth = 10;
  p.thirst = 3;
  const hp = p.hp;
  step(g, 3);
  assert.ok(p.hp < hp);
  const f = g.fires[0];
  p.x = f.x;
  p.z = f.z;
  p.warmth = 30;
  const wood = p.inventory.wood;
  g.action(p, { type: "fire", id: f.id });
  assert.equal(p.inventory.wood, wood - 1);
  step(g, 2);
  assert.ok(p.warmth > 30);
  assert.ok(f.fuel < 150 && f.fuel > 140);
});
test("crafting validates materials and cooking requires fire", () => {
  const { g, p } = setup();
  g.action(p, { type: "craft", recipe: "spear" });
  assert.equal(p.inventory.spear, undefined);
  p.inventory.wood = 5;
  p.inventory.stone = 3;
  g.action(p, { type: "craft", recipe: "spear" });
  assert.equal(p.inventory.spear, 1);
  assert.equal(p.inventory.wood, 2);
  p.inventory.raw = 1;
  g.action(p, { type: "craft", recipe: "cooked" });
  assert.equal(p.inventory.raw, 1);
  p.x = g.fires[0].x;
  p.z = g.fires[0].z;
  g.action(p, { type: "fire", id: g.fires[0].id });
  g.action(p, { type: "craft", recipe: "cooked" });
  assert.equal(p.inventory.cooked, 1);
});
test("river water is not clean water until boiled", () => {
  const { g, p } = setup();
  p.z = 50;
  p.x = WORLD.riverX(p.z);
  g.action(p, { type: "gatherStart", id: "river" });
  step(g, 2);
  assert.equal(p.inventory.dirtywater, 2);
  p.x = g.fires[0].x;
  p.z = g.fires[0].z;
  g.action(p, { type: "fire", id: g.fires[0].id });
  g.action(p, { type: "craft", recipe: "water" });
  assert.equal(p.inventory.dirtywater, 1);
  assert.equal(p.inventory.water, 3);
});
test("consumables remove one item and heal only within limits", () => {
  const { g, p } = setup();
  p.hp = 50;
  p.inventory.medkit = 1;
  g.action(p, { type: "use", item: "medkit" });
  assert.equal(p.hp, 100);
  assert.equal(p.inventory.medkit, undefined);
  g.action(p, { type: "use", item: "axe" });
  assert.equal(p.inventory.axe, 1);
});
test("stash is shared and cannot be operated remotely", () => {
  const { g, p } = setup(),
    b = g.add("b", "islam");
  g.action(p, { type: "stash", item: "wood", direction: "store", amount: 2 });
  assert.equal(g.stash.wood, undefined);
  p.x = WORLD.stash.x;
  p.z = WORLD.stash.z;
  g.action(p, { type: "stash", item: "wood", direction: "store", amount: 2 });
  assert.equal(g.stash.wood, 2);
  b.x = p.x;
  b.z = p.z;
  g.action(b, { type: "stash", item: "wood", direction: "take", amount: 99 });
  assert.equal(b.inventory.wood, 4);
  assert.equal(g.stash.wood, 0);
});
test("guns require ownership, real ammo, reload time and cooldown", () => {
  const { g, p } = setup();
  g.action(p, { type: "select", item: "shotgun" });
  assert.equal(p.selected, "axe");
  p.inventory.pistol = 1;
  p.inventory.ammo = 10;
  g.action(p, { type: "select", item: "pistol" });
  g.action(p, { type: "reload" });
  step(g, 2);
  assert.equal(p.mag.pistol, 8);
  assert.equal(p.inventory.ammo, 2);
  g.action(p, { type: "shoot" });
  g.action(p, { type: "shoot" });
  assert.equal(p.mag.pistol, 7);
});
test("friendly fire is impossible; only NPCs can be targeted", () => {
  const { g, p } = setup(),
    b = g.add("b", "islam");
  p.x = 0;
  p.z = 48;
  b.x = 0;
  b.z = 49;
  p.input.aim = 0;
  g.action(p, { type: "shoot" });
  assert.equal(b.hp, 100);
});
test("melee hits an actual nearby target and carcass rewards only once", () => {
  const { g, p } = setup();
  p.x = 0;
  p.z = 50;
  p.input.aim = 0;
  const n = { id: "wolf", type: "wolf", x: 0, z: 52, hp: 20, yaw: 0 };
  g.npcs = [n];
  g.action(p, { type: "shoot" });
  assert.equal(n.hp, 0);
  g.action(p, { type: "gatherStart", id: n.id });
  step(g, 2);
  assert.equal(p.inventory.raw, 2);
  g.action(p, { type: "gatherStart", id: n.id });
  step(g, 2);
  assert.equal(p.inventory.raw, 2);
});
test("death drops a recoverable backpack; no free restored weapon", () => {
  const { g, p } = setup();
  p.x = 0;
  p.z = 50;
  p.hp = 0;
  step(g, 0.05);
  assert.equal(g.drops.length, 1);
  assert.equal(p.hp, 100);
  assert.equal(p.selected, "fist");
  const d = g.drops[0];
  p.x = d.x;
  p.z = d.z;
  g.action(p, { type: "gatherStart", id: d.id });
  step(g, 2);
  assert.equal(p.inventory.axe, 1);
  assert.equal(g.drops.length, 0);
});
test("radio repair accepts contributions from two players, only at tower", () => {
  const { g, p } = setup(),
    b = g.add("b", "islam");
  p.inventory.part = 2;
  p.inventory.scrap = 4;
  p.inventory.fuel = 1;
  b.inventory.part = 1;
  g.action(p, { type: "radio" });
  assert.equal(g.radio.part, 0);
  const r = POIS.find((p) => p.id === "radio");
  p.x = b.x = r.x;
  p.z = b.z = r.z;
  g.action(p, { type: "radio" });
  assert.equal(g.radio.part, 2);
  assert.equal(g.radio.active, false);
  g.action(b, { type: "radio" });
  assert.equal(g.radio.active, true);
  assert.equal(b.inventory.part, undefined);
});
test("survival schema persists personal progression and shared resources", () => {
  const { g, p } = setup();
  p.inventory.scrap = 7;
  g.radio.part = 2;
  const restored = new Game(JSON.parse(JSON.stringify(g.save()))),
    q = restored.add(p.id, "deni");
  assert.equal(q.inventory.scrap, 7);
  assert.equal(restored.radio.part, 2);
  assert.equal(restored.save().schema, 3);
});
test("jump consumes stamina and lands on terrain", () => {
  const { g, p } = setup();
  g.action(p, { type: "jump" });
  step(g, 0.2);
  assert.ok(p.airY > 0);
  step(g, 1);
  assert.equal(p.airY, 0);
});
test("disconnected survivors do not starve while waiting to reconnect", () => {
  const { g, p } = setup();
  p.connected = false;
  const hunger = p.hunger;
  step(g, 30);
  assert.equal(p.hunger, hunger);
});

test("wood and berries can be foraged outside camp without resource duplication", () => {
  const { g, p } = setup();
  const t = TREES.find((t) => Math.abs(t.x) > 150);
  gather(g, p, t);
  assert.equal(p.inventory.wood, 4);
  g.action(p, { type: "gatherStart", id: t.id });
  assert.equal(p.loot, null);
  const b = NODES.find((n) => n.wild && n.type === "berry");
  gather(g, p, b);
  assert.equal(p.inventory.berries, 1);
});
