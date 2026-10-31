import { randomUUID } from "node:crypto";
import {
  WORLD,
  POIS,
  NODES,
  TREES,
  ITEMS,
  RECIPES,
  dist,
  blocked,
  lineClear,
  heightAt,
  random,
} from "../src/shared.js";
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export class Game {
  constructor(saved = {}) {
    if (saved.schema !== 3) saved = {};
    this.players = new Map();
    this.profiles = saved.profiles || {};
    this.time = saved.time || 0;
    this.tickId = 0;
    this.events = [];
    this.depleted = saved.depleted || {};
    this.stash = saved.stash || {};
    this.drops = saved.drops || [];
    this.fires = saved.fires || [{ id: "base-fire", x: 0, z: 49, fuel: 0 }];
    this.radio = saved.radio || { part: 0, scrap: 0, fuel: 0, active: false };
    this.rng = random(821);
    this.npcs = [];
    for (let i = 0; i < 16; i++) {
      const type = i < 8 ? "wolf" : i < 13 ? "deer" : "bandit",
        a = i * 2.3,
        r = 90 + (i % 5) * 35;
      const x = Math.sin(a) * r;
      let z = Math.cos(a) * r - 65;
      if (dist({ x, z }, WORLD.camp) < 70) z -= 110;
      this.npcs.push({
        id: "npc" + i,
        type,
        x,
        z,
        homeX: x,
        homeZ: z,
        hp: type === "bandit" ? 120 : type === "wolf" ? 85 : 65,
        yaw: 0,
        mode: "idle",
        lastAttack: 0,
        deadAt: 0,
        harvested: false,
        target: null,
      });
    }
  }
  add(id, role) {
    if (this.players.has(id)) throw Error("Этот профиль уже подключён.");
    if (this.players.size >= 2)
      throw Error("Два места заняты или временно зарезервированы.");
    const saved = this.profiles[id],
      slot = saved?.slot ?? (role === "islam" ? 1 : 0);
    if ([...this.players.values()].some((p) => p.slot === slot))
      throw Error("Этот выживший уже в лесу. Выберите второго.");
    const p = {
      slot,
      name: slot ? "Islam" : "Deni",
      ...WORLD.spawns[slot],
      yaw: 0,
      hp: 100,
      stamina: 100,
      hunger: 85,
      thirst: 85,
      warmth: 80,
      inventory: { axe: 1, food: 2, water: 2, wood: 2, cloth: 2 },
      selected: "axe",
      mag: { pistol: 0, shotgun: 0 },
      kills: 0,
      ...saved,
      airY: 0,
      vy: 0,
      id,
      connected: true,
      lastInputTime: this.time,
      input: { x: 0, z: 0, run: false, aim: Math.PI, pitch: 0 },
      loot: null,
      reload: null,
      lastShot: -100,
      protection: this.time + 4,
    };
    if (!Number.isFinite(p.x) || Math.abs(p.x) > 494 || Math.abs(p.z) > 494)
      Object.assign(p, WORLD.spawns[slot]);
    this.players.set(id, p);
    return p;
  }
  remove(id) {
    const p = this.players.get(id);
    if (p) {
      this.profiles[id] = this.savePlayer(p);
      this.players.delete(id);
    }
  }
  savePlayer(p) {
    return Object.fromEntries(
      [
        "slot",
        "x",
        "z",
        "yaw",
        "hp",
        "stamina",
        "hunger",
        "thirst",
        "warmth",
        "inventory",
        "selected",
        "mag",
        "kills",
      ].map((k) => [k, structuredClone(p[k])]),
    );
  }
  save() {
    for (const p of this.players.values())
      this.profiles[p.id] = this.savePlayer(p);
    return {
      schema: 3,
      time: this.time,
      profiles: this.profiles,
      depleted: this.depleted,
      stash: this.stash,
      fires: this.fires,
      drops: this.drops,
      radio: this.radio,
    };
  }
  tell(p, text) {
    this.events.push({ to: p.id, text });
  }
  broadcast(text) {
    for (const p of this.players.values()) this.tell(p, text);
  }
  give(p, item, n) {
    p.inventory[item] = (p.inventory[item] || 0) + n;
    if (p.inventory[item] <= 0) delete p.inventory[item];
  }
  has(p, cost) {
    return Object.entries(cost).every(([k, n]) => (p.inventory[k] || 0) >= n);
  }
  pay(p, cost) {
    for (const [k, n] of Object.entries(cost)) this.give(p, k, -n);
  }
  nearFire(p) {
    return this.fires.find((f) => f.fuel > 0 && dist(p, f) < 9);
  }
  find(p, id) {
    let n = NODES.find((n) => n.id === id);
    if (!n) {
      const t = TREES.find((t) => t.id === id);
      if (t) n = { ...t, type: "wood" };
    }
    if (!n)
      n = this.drops.find((d) => d.id === id) && {
        ...this.drops.find((d) => d.id === id),
        type: "drop",
      };
    if (!n) {
      const a = this.npcs.find(
        (n) => n.id === id && n.hp <= 0 && !n.harvested && n.type !== "bandit",
      );
      if (a) n = { ...a, type: "carcass" };
    }
    if (id === "river" && Math.abs(p.x - WORLD.riverX(p.z)) < 7)
      n = { id, type: "water", x: p.x, z: p.z };
    return n && dist(p, n) < 3.8 && !(this.depleted[id] > this.time) ? n : null;
  }
  action(p, m) {
    if (!p || p.connected === false) return;
    if (m.type === "input") {
      p.lastInputTime = this.time;
      p.input = {
        x: clamp(Number(m.x) || 0, -1, 1),
        z: clamp(Number(m.z) || 0, -1, 1),
        aim: Number.isFinite(m.aim) ? m.aim : 0,
        pitch: clamp(Number(m.pitch) || 0, -1.3, 1.3),
        run: !!m.run,
      };
      return;
    }
    if (m.type === "jump") {
      if (p.airY === 0 && p.stamina >= 12) {
        p.vy = 5.2;
        p.stamina -= 12;
      }
      return;
    }
    if (m.type === "select") {
      if (
        m.item === "fist" ||
        (ITEMS[m.item]?.kind === "weapon" && p.inventory[m.item] > 0)
      ) {
        p.selected = m.item;
        p.loot = null;
      }
      return;
    }
    if (m.type === "gatherStart") {
      const n = this.find(p, m.id);
      if (!n) return this.tell(p, "Подойдите ближе к припасам.");
      p.loot = {
        id: n.id,
        type: n.type,
        elapsed: 0,
        duration: n.type === "wood" ? 3.5 : n.type === "crate" ? 3 : 1.8,
      };
      return;
    }
    if (m.type === "gatherStop") {
      p.loot = null;
      return;
    }
    if (m.type === "use") {
      if (!(p.inventory[m.item] > 0)) return;
      const effects = {
        berries: ["hunger", 15],
        food: ["hunger", 32],
        cooked: ["hunger", 48],
        water: ["thirst", 45],
        medkit: ["hp", 55],
        bandage: ["hp", 24],
        raw: ["hunger", 15],
      };
      const effect = effects[m.item];
      if (!effect) return;
      if (p[effect[0]] >= 99) return this.tell(p, "Пока не требуется.");
      this.give(p, m.item, -1);
      p[effect[0]] = clamp(p[effect[0]] + effect[1], 0, 100);
      if (m.item === "raw") {
        p.hp -= 8;
        this.tell(p, "Сырое мясо опасно. Лучше приготовить на костре.");
      } else this.tell(p, "Использовано: " + ITEMS[m.item].name);
      return;
    }
    if (m.type === "craft") {
      const r = RECIPES[m.recipe];
      if (!r) return;
      if (!this.has(p, r.cost)) return this.tell(p, "Недостаточно материалов.");
      if (r.fire && !this.nearFire(p))
        return this.tell(p, "Нужен горящий костёр рядом.");
      if (r.result === "campfire") {
        if (this.fires.length >= 12)
          return this.tell(p, "В районе уже достаточно костров.");
        if (this.fires.some((f) => dist(p, f) < 8) || blocked(p.x, p.z - 2))
          return this.tell(p, "Отойдите от других костров и стен.");
        this.pay(p, r.cost);
        this.fires.push({ id: randomUUID(), x: p.x, z: p.z - 2, fuel: 180 });
      } else {
        if (ITEMS[r.result]?.kind === "weapon" && p.inventory[r.result])
          return this.tell(p, "Такое оружие уже есть.");
        this.pay(p, r.cost);
        this.give(p, r.result, 1);
      }
      this.tell(p, "Создано: " + r.name);
      return;
    }
    if (m.type === "fire") {
      const f = this.fires.find((f) => f.id === m.id && dist(f, p) < 4);
      if (!f) return;
      if (!(p.inventory.wood > 0)) return this.tell(p, "Нужна древесина.");
      this.give(p, "wood", -1);
      f.fuel = Math.min(900, f.fuel + 150);
      this.tell(p, "Дрова добавлены. Здесь можно согреться и готовить.");
      return;
    }
    if (m.type === "stash") {
      if (dist(p, WORLD.stash) > 4 || !ITEMS[m.item]) return;
      const amount = clamp(Math.floor(Number(m.amount) || 1), 1, 99);
      if (m.direction === "store") {
        const n = Math.min(amount, p.inventory[m.item] || 0);
        if (n <= 0) return;
        this.give(p, m.item, -n);
        this.stash[m.item] = (this.stash[m.item] || 0) + n;
        if (p.selected === m.item && !p.inventory[m.item]) p.selected = "fist";
      } else {
        const n = Math.min(amount, this.stash[m.item] || 0);
        if (n <= 0) return;
        this.stash[m.item] -= n;
        this.give(p, m.item, n);
      }
      return;
    }
    if (m.type === "radio") {
      if (
        dist(
          p,
          POIS.find((x) => x.id === "radio"),
        ) > 6
      )
        return;
      if (this.radio.active)
        return this.tell(p, "Маяк работает. Сигнал ушёл за перевал.");
      for (const [k, max] of Object.entries({ part: 3, scrap: 4, fuel: 1 })) {
        const n = Math.min(max - this.radio[k], p.inventory[k] || 0);
        this.radio[k] += n;
        this.give(p, k, -n);
      }
      if (
        this.radio.part === 3 &&
        this.radio.scrap === 4 &&
        this.radio.fuel === 1
      ) {
        this.radio.active = true;
        this.broadcast(
          "СВЯЗЬ ВОССТАНОВЛЕНА. Вы передали координаты. Север услышал вас.",
        );
      } else
        this.tell(
          p,
          `Ремонт: детали ${this.radio.part}/3 · металл ${this.radio.scrap}/4 · топливо ${this.radio.fuel}/1`,
        );
      return;
    }
    if (m.type === "reload") {
      const gun = ITEMS[p.selected];
      if (!gun?.mag || p.reload) return;
      if (p.mag[p.selected] >= gun.mag) return;
      if (!(p.inventory.ammo > 0))
        return this.tell(p, "Нет патронов. Ищите на блокпосту и лесопилке.");
      p.reload = { item: p.selected, left: 1.9 };
      return;
    }
    if (m.type === "shoot") {
      const w = ITEMS[p.selected];
      if (
        w?.kind !== "weapon" ||
        p.reload ||
        this.time - p.lastShot < w.cooldown
      )
        return;
      if (w.mag && !p.mag[p.selected])
        return this.tell(
          p,
          p.inventory.ammo ? "Магазин пуст — перезарядите." : "Нет патронов.",
        );
      p.lastShot = this.time;
      p.loot = null;
      if (w.mag) p.mag[p.selected]--;
      const targets = this.npcs
        .filter((n) => n.hp > 0 && dist(p, n) < w.range && lineClear(p, n))
        .filter((n) => {
          const d = dist(p, n),
            a = Math.atan2(n.x - p.x, n.z - p.z),
            angle = Math.atan2(
              Math.sin(a - p.input.aim),
              Math.cos(a - p.input.aim),
            );
          const vertical = Math.atan2(
            heightAt(n.x, n.z) +
              (n.type === "bandit" ? 1.1 : 0.65) -
              heightAt(p.x, p.z) -
              1.65,
            d,
          );
          return (
            Math.abs(angle) < (w.mag ? Math.atan2(0.6, d) + 0.018 : 0.8) &&
            (!w.mag ||
              Math.abs(vertical - p.input.pitch) < Math.atan2(0.9, d) + 0.025)
          );
        })
        .sort((a, b) => dist(a, p) - dist(b, p));
      if (targets[0]) {
        const n = targets[0];
        n.hp -= w.damage;
        n.hurt = this.time + 0.3;
        if (n.hp <= 0) {
          n.hp = 0;
          n.deadAt = this.time;
          p.kills++;
          this.tell(
            p,
            n.type === "bandit"
              ? "Мародёр обезврежен."
              : "Животное повержено. Можно собрать мясо.",
          );
        }
      }
      if (w.mag)
        for (const n of this.npcs)
          if (n.type === "wolf" && n.hp > 0 && dist(n, p) < 75) {
            n.target = { x: p.x, z: p.z };
            n.alert = this.time + 12;
          }
    }
  }
  finish(p, n) {
    if (!n) return;
    if (n.type === "drop") {
      const d = this.drops.find((d) => d.id === n.id);
      if (!d) return;
      for (const [k, v] of Object.entries(d.inventory)) this.give(p, k, v);
      this.drops = this.drops.filter((d) => d.id !== n.id);
      this.tell(p, "Рюкзак подобран.");
      return;
    }
    if (n.type === "carcass") {
      const npc = this.npcs.find((a) => a.id === n.id);
      if (!npc || npc.harvested) return;
      npc.harvested = true;
      this.give(p, "raw", 2);
      this.give(p, "cloth", 1);
      this.tell(p, "Добыто: мясо ×2, шкура/ткань ×1.");
      return;
    }
    const rewards =
      n.type === "wood"
        ? { wood: 2 }
        : n.type === "stone"
          ? { stone: 2 }
          : n.type === "berry"
            ? { berries: 1 }
            : n.type === "water"
              ? { dirtywater: 2 }
              : n.type === "part"
                ? { part: 1 }
                : n.type === "supply"
                  ? { food: 2, water: 1, cloth: 2 }
                  : n.site === "mill"
                    ? { shotgun: 1, ammo: 12, scrap: 2 }
                    : n.site === "checkpoint"
                      ? { pistol: 1, ammo: 16, medkit: 1 }
                      : n.site === "pump"
                        ? { fuel: 1, scrap: 2 }
                        : n.site === "bunker"
                          ? { ammo: 12, medkit: 1, scrap: 3 }
                          : { cloth: 2, food: 1, scrap: 1 };
    for (const [k, v] of Object.entries(rewards)) this.give(p, k, v);
    if (n.type !== "water")
      this.depleted[n.id] =
        this.time +
        (n.type === "part"
          ? 864000
          : ["wood", "stone", "berry"].includes(n.type)
            ? 240
            : 600);
    this.tell(
      p,
      Object.entries(rewards)
        .map(([k, v]) => `${ITEMS[k].name} +${v}`)
        .join(" · "),
    );
  }
  step(dt) {
    this.time += dt;
    this.tickId++;
    const hour = (5.5 + this.time / 45) % 24,
      night = hour < 7 || hour > 19;
    for (const f of this.fires) f.fuel = Math.max(0, f.fuel - dt);
    this.drops = this.drops.filter((d) => d.expires > this.time);
    for (const p of this.players.values()) {
      if (p.connected === false) continue;
      if (this.time - p.lastInputTime > 0.5) {
        p.input.x = 0;
        p.input.z = 0;
        p.input.run = false;
      }
      const len = Math.hypot(p.input.x, p.input.z),
        run = p.input.run && p.stamina > 2 && len > 0.05,
        speed = run ? 7 : 3.9;
      p.vy -= 12 * dt;
      p.airY = Math.max(0, p.airY + p.vy * dt);
      if (p.airY === 0) p.vy = 0;
      p.moving = len > 0.05;
      p.running = run;
      p.yaw = p.input.aim;
      if (len > 0.05) {
        const dx = (p.input.x / Math.max(1, len)) * speed * dt,
          dz = (p.input.z / Math.max(1, len)) * speed * dt;
        if (!blocked(p.x + dx, p.z)) p.x += dx;
        if (!blocked(p.x, p.z + dz)) p.z += dz;
      }
      p.stamina = clamp(p.stamina + (run ? -17 : 12) * dt, 0, 100);
      p.hunger = clamp(p.hunger - (run ? 0.14 : 0.075) * dt, 0, 100);
      p.thirst = clamp(p.thirst - (run ? 0.21 : 0.12) * dt, 0, 100);
      const sheltered = dist(p, WORLD.camp) < 9,
        fire = this.nearFire(p);
      p.warmth = clamp(
        p.warmth +
          (fire
            ? 3
            : sheltered
              ? 0.1
              : (night ? -0.24 : -0.1) -
                (Math.sin(this.time / 140) > 0.7 ? 0.18 : 0)) *
            dt,
        0,
        100,
      );
      if (p.hunger < 5 || p.thirst < 5 || p.warmth < 7)
        p.hp -= (p.thirst < 5 ? 1.1 : 0.6) * dt;
      if (fire && p.hunger > 50 && p.hp < 100)
        p.hp = Math.min(100, p.hp + 0.15 * dt);
      if (p.reload) {
        p.reload.left -= dt;
        if (p.reload.left <= 0) {
          const n = Math.min(
            ITEMS[p.reload.item].mag - p.mag[p.reload.item],
            p.inventory.ammo || 0,
          );
          p.mag[p.reload.item] += n;
          this.give(p, "ammo", -n);
          p.reload = null;
        }
      }
      if (p.loot) {
        const n = this.find(p, p.loot.id);
        if (!n || len > 0.1) p.loot = null;
        else {
          p.loot.elapsed += dt;
          if (p.loot.elapsed >= p.loot.duration) {
            this.finish(p, n);
            p.loot = null;
          }
        }
      }
      if (p.hp <= 0) {
        this.drops.push({
          id: randomUUID(),
          x: p.x,
          z: p.z,
          name: p.name,
          inventory: { ...p.inventory },
          expires: this.time + 1200,
        });
        Object.assign(p, {
          ...WORLD.spawns[p.slot],
          hp: 100,
          stamina: 100,
          hunger: 65,
          thirst: 65,
          warmth: 65,
          inventory: {},
          selected: "fist",
          mag: { pistol: 0, shotgun: 0 },
          reload: null,
          loot: null,
          protection: this.time + 6,
        });
        this.tell(
          p,
          "Вы очнулись в убежище. Рюкзак остался на месте гибели на 20 минут.",
        );
      }
    }
    for (const n of this.npcs) {
      if (n.hp <= 0) {
        n.mode = "dead";
        if (this.time - n.deadAt > 400) {
          Object.assign(n, {
            x: n.homeX,
            z: n.homeZ,
            hp: n.type === "bandit" ? 120 : n.type === "wolf" ? 85 : 65,
            harvested: false,
          });
        }
        continue;
      }
      const candidates = [...this.players.values()]
        .filter(
          (p) =>
            p.connected !== false &&
            p.protection < this.time &&
            dist(p, n) < (n.type === "deer" ? 18 : night ? 36 : 26) &&
            lineClear(n, p),
        )
        .sort((a, b) => dist(a, n) - dist(b, n));
      const p = candidates[0];
      let speed = 1.15;
      if (p && n.type === "deer") {
        const d = dist(n, p) || 1;
        n.target = {
          x: n.x + ((n.x - p.x) / d) * 25,
          z: n.z + ((n.z - p.z) / d) * 25,
        };
        speed = 6;
        n.mode = "run";
      } else if (p && !(n.type === "wolf" && this.nearFire(p))) {
        n.target = { x: p.x, z: p.z };
        n.alert = this.time + 6;
        speed = n.type === "wolf" ? 5.6 : 3;
        n.mode = "run";
        if (
          dist(p, n) < (n.type === "wolf" ? 2.2 : 23) &&
          this.time - n.lastAttack > (n.type === "wolf" ? 0.85 : 1.4)
        ) {
          p.hp -= n.type === "wolf" ? 11 : 9;
          n.lastAttack = this.time;
          n.mode = "attack";
        }
      } else if (n.type === "wolf" && p && this.nearFire(p)) {
        n.target = { x: n.x + (n.x - p.x), z: n.z + (n.z - p.z) };
        speed = 3;
        n.mode = "walk";
      } else if (
        !n.target ||
        dist(n, n.target) < 2 ||
        (this.time > (n.alert || 0) && this.tickId % 100 === 0)
      ) {
        n.target = {
          x: n.homeX + (this.rng() - 0.5) * 34,
          z: n.homeZ + (this.rng() - 0.5) * 34,
        };
        n.mode = "walk";
      }
      if (n.target && n.mode !== "attack") {
        const dx = n.target.x - n.x,
          dz = n.target.z - n.z,
          d = Math.hypot(dx, dz);
        if (d > 1) {
          let angle = Math.atan2(dx, dz),
            moved = false;
          for (const offset of [0, 0.7, -0.7, 1.4, -1.4]) {
            const x = n.x + Math.sin(angle + offset) * speed * dt,
              z = n.z + Math.cos(angle + offset) * speed * dt;
            if (!blocked(x, z)) {
              n.x = x;
              n.z = z;
              n.yaw = angle + offset;
              moved = true;
              break;
            }
          }
          if (!moved) n.target = null;
        } else n.mode = "idle";
      }
    }
  }
  snapshot(id) {
    const p = this.players.get(id);
    return {
      type: "state",
      time: this.time,
      hour: (5.5 + this.time / 45) % 24,
      temperature: Math.round(-8 - Math.sin(this.time / 100) * 5),
      storm: Math.sin(this.time / 140) > 0.7,
      players: [...this.players.values()].map((p) => ({
        id: p.id === id ? "self" : "player" + p.slot,
        slot: p.slot,
        name: p.name,
        x: p.x,
        z: p.z,
        yaw: p.yaw,
        hp: p.hp,
        selected: p.selected,
        airY: p.airY,
        moving: p.moving,
        running: p.running,
        connected: p.connected !== false,
        shotAt: p.lastShot,
      })),
      self: p
        ? { ...this.savePlayer(p), loot: p.loot, reload: !!p.reload }
        : null,
      npcs: this.npcs.map(({ target, homeX, homeZ, alert, ...n }) => n),
      depleted: this.depleted,
      fires: this.fires,
      stash: this.stash,
      drops: this.drops.map(({ inventory, ...d }) => d),
      radio: this.radio,
    };
  }
}
