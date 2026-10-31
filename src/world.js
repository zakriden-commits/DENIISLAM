import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { WORLD, inside } from "./shared.js";
const M = {};
const weathered = new Set([
  "#88817a",
  "#a19b90",
  "#767873",
  "#6f716f",
  "#7d7770",
  "#69706e",
  "#4e5351",
  "#726d55",
  "#796b51",
  "#59634e",
  "#707960",
  "#6b6950",
  "#929b83",
  "#8c967c",
]);
function weatherMap() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f1f0ed";
  ctx.fillRect(0, 0, 128, 128);
  let seed = 7919;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 7500; i++) {
    ctx.fillStyle = random() > 0.7 ? "#eceae126" : "#24262908";
    ctx.fillRect(
      random() * 128,
      random() * 128,
      1 + random() * 3,
      1 + random() * 2,
    );
  }
  for (let i = 0; i < 12; i++) {
    const x = random() * 128,
      y = random() * 128;
    ctx.fillStyle = "#29302d09";
    ctx.fillRect(x, y, 2 + random() * 8, 8 + random() * 60);
  }
  ctx.strokeStyle = "#3437353c";
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    let x = random() * 128,
      y = random() * 128;
    ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      x += random() * 9 - 4;
      y += random() * 12;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}
let weatherTexture;
export function material(color, roughness = 0.95, metalness = 0) {
  const key = color + ":" + roughness + ":" + metalness;
  if (!M[key]) {
    M[key] = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    if (weathered.has(color)) M[key].map = weatherTexture ||= weatherMap();
  }
  return M[key];
}
const c = {
  concrete: "#8f918c",
  dark: "#263a34",
  brick: "#735f51",
  road: "#414d49",
  yellow: "#e0c56b",
  green: "#567766",
  wood: "#796b51",
  skin: "#bf9270",
  black: "#202927",
  cream: "#ded9c3",
};
export function box(parent, w, h, d, x, y, z, color, opts = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    typeof color === "string" ? material(color) : color,
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = opts.shadow !== false;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function cyl(parent, r1, r2, h, x, y, z, color, segments = 8) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r1, r2, h, segments),
    material(color),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function textTexture(
  text,
  { bg = "#23382e", fg = "#e8e4ce", w = 1024, h = 200, font = 90 } = {},
) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${font}px Arial`;
  ctx.fillText(text, w / 2, h / 2, w * 0.93);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function sign(parent, text, x, y, z, w, h, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    map: textTexture(text, opts),
    roughness: 0.8,
  });
  return box(parent, w, h, 0.09, x, y, z, mat);
}
function groundTexture(type) {
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = 256;
  const ctx = cvs.getContext("2d");
  ctx.fillStyle = type === "road" ? "#3e4243" : "#8c8b84";
  ctx.fillRect(0, 0, 256, 256);
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 9000; i++) {
    const v = rnd() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${rnd() * 0.06})`;
    ctx.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  if (type !== "road") {
    ctx.strokeStyle = "#6e786d55";
    ctx.lineWidth = 2;
    for (let i = 0; i < 256; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = "#28362d77";
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      let x = rnd() * 256,
        y = rnd() * 256;
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += rnd() * 35 - 15;
        y += rnd() * 35;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cvs);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(type === "road" ? 16 : 24, type === "road" ? 6 : 20);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function weaponModel(type = "pistol", display = false) {
  const g = new THREE.Group();
  if (type === "bag") {
    box(g, 0.62, 0.37, 0.32, 0, 0.03, 0, "#62684a");
    box(g, 0.56, 0.05, 0.3, 0, 0.23, 0, "#343e2e");
    box(g, 0.04, 0.21, 0.05, -0.18, 0.29, 0, "#282e24");
    box(g, 0.04, 0.21, 0.05, 0.18, 0.29, 0, "#282e24");
    box(g, 0.38, 0.04, 0.05, 0, 0.4, 0, "#282e24");
    box(g, 0.18, 0.16, 0.02, 0, 0.02, 0.17, "#a9ab78");
  } else if (type === "ammo") {
    for (let i = 0; i < 6; i++) {
      const a = cyl(
        g,
        0.022,
        0.022,
        0.17,
        (i % 3) * 0.06 - 0.06,
        Math.floor(i / 3) * 0.06,
        0,
        "#bf9a4f",
      );
      a.rotation.x = Math.PI / 2;
    }
    box(g, 0.32, 0.12, 0.22, 0, -0.12, 0, "#78815c");
  } else if (type === "medkit") {
    box(g, 0.44, 0.32, 0.22, 0, 0, 0, "#d8d4b8");
    box(g, 0.07, 0.2, 0.01, 0, 0, 0.12, "#9c5142");
    box(g, 0.22, 0.06, 0.01, 0, 0, 0.125, "#9c5142");
  } else if (type === "cash") {
    for (let i = 0; i < 5; i++) {
      box(g, 0.32, 0.06, 0.2, 0, i * 0.06, 0, "#8c9b6b");
      box(g, 0.07, 0.061, 0.205, 0, i * 0.06, 0, "#d3cca8");
    }
  } else if (type === "fist") {
    const palm = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 6, 4),
      material(c.skin),
    );
    palm.scale.set(0.85, 0.7, 1);
    g.add(palm);
    for (let i = 0; i < 4; i++) {
      const knuckle = new THREE.Mesh(
        new THREE.SphereGeometry(0.028, 5, 3),
        material("#cda17b"),
      );
      knuckle.position.set(-0.055 + i * 0.037, 0.049, 0.045);
      knuckle.scale.z = 1.3;
      g.add(knuckle);
    }
    const thumb = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 5, 3),
      material(c.skin),
    );
    thumb.position.set(0.075, -0.025, 0);
    thumb.scale.set(0.7, 0.7, 1.4);
    g.add(thumb);
  } else {
    const smg = type === "smg";
    const dark = material("#343f3d", 0.4, 0.7),
      metal = material("#69716a", 0.3, 0.8);
    box(g, smg ? 0.18 : 0.13, 0.15, smg ? 0.58 : 0.38, 0, 0.11, 0, dark);
    box(g, smg ? 0.17 : 0.12, 0.09, smg ? 0.63 : 0.4, 0, 0.22, 0, metal);
    const handle = box(g, 0.105, 0.28, 0.14, 0, -0.08, -0.1, "#2a302b");
    handle.rotation.x = -0.22;
    box(g, 0.03, 0.12, 0.15, 0.064, -0.02, 0.08, dark);
    box(g, 0.11, 0.025, 0.16, 0, -0.09, 0.08, dark);
    const barrel = cyl(
      g,
      0.037,
      0.037,
      smg ? 0.35 : 0.1,
      0,
      0.14,
      smg ? 0.42 : 0.25,
      "#252d2b",
    );
    barrel.rotation.x = Math.PI / 2;
    box(g, 0.04, 0.035, 0.05, 0, 0.28, 0.14, "#171e1a");
    if (smg) {
      box(g, 0.09, 0.32, 0.16, 0, -0.13, 0.1, "#444c44");
      box(g, 0.12, 0.12, 0.3, 0, 0.08, -0.43, "#4b5149");
      box(g, 0.2, 0.05, 0.04, 0, 0.24, -0.17, "#252e28");
    }
  }
  if (display) g.rotation.y = -0.7;
  return g;
}
export function character(type = "deni") {
  const g = new THREE.Group(),
    skin =
      type === "elder" ? "#bda88b" : type === "islam" ? "#c49471" : "#c19b7b";
  const suit = ["deni", "guard", "police"].includes(type),
    elder = type === "elder";
  const coat =
    type === "deni"
      ? "#263c37"
      : type === "islam"
        ? "#596954"
        : type === "police"
          ? "#334b58"
          : type === "guard"
            ? "#3c4543"
            : type === "seller"
              ? "#654f3c"
              : type === "cashier"
                ? "#a39a7a"
                : elder
                  ? "#817d63"
                  : type === "rough"
                    ? "#765f4d"
                    : "#77887a";
  const body = new THREE.Group();
  body.position.y = 1;
  g.add(body);
  const torso = cyl(body, 0.31, 0.24, 0.66, 0, 0.19, 0, coat, 6);
  torso.scale.z = 0.65;
  box(body, 0.43, 0.15, 0.27, 0, -0.16, 0, "#323c33");
  if (suit) {
    box(body, 0.16, 0.5, 0.02, 0, 0.23, 0.165, "#d5d4bc");
    const tie = box(
      body,
      0.055,
      0.32,
      0.025,
      0,
      0.23,
      0.18,
      type === "deni" ? "#7c6250" : "#273632",
    );
    tie.rotation.z = 0.05;
    const l = box(body, 0.13, 0.38, 0.03, -0.15, 0.3, 0.18, coat);
    l.rotation.z = 0.26;
    const r = box(body, 0.13, 0.38, 0.03, 0.15, 0.3, 0.18, coat);
    r.rotation.z = -0.26;
  }
  const head = new THREE.Group();
  head.position.y = 0.76;
  body.add(head);
  const face = cyl(head, 0.19, 0.15, 0.38, 0, 0, 0, skin, 6);
  face.rotation.y = Math.PI / 6;
  for (const side of [-1, 1])
    box(head, 0.055, 0.1, 0.08, side * 0.175, -0.02, 0, skin);
  box(head, 0.06, 0.08, 0.06, 0, -0.015, 0.18, skin);
  box(head, 0.07, 0.055, 0.016, -0.085, 0.06, 0.163, "#26332a");
  box(head, 0.07, 0.055, 0.016, 0.085, 0.06, 0.163, "#26332a");
  box(head, 0.13, 0.018, 0.015, 0, -0.115, 0.16, "#6b5442");
  if (type === "deni") {
    cyl(head, 0.28, 0.28, 0.055, 0, 0.22, 0, "#1b2a24", 10);
    cyl(head, 0.19, 0.2, 0.24, 0, 0.36, 0, "#23352b", 8);
    cyl(head, 0.194, 0.205, 0.045, 0, 0.265, 0, "#69745a", 8);
    box(head, 0.35, 0.07, 0.04, 0, 0.07, 0.18, "#313e32");
    box(head, 0.05, 0.04, 0.05, 0, 0.07, 0.2, "#ae9f73");
  } else if (type === "islam" || type === "rough") {
    box(head, 0.37, 0.12, 0.35, 0, 0.22, 0, "#606d54");
    box(head, 0.34, 0.035, 0.22, 0, 0.17, 0.21, "#394735");
    if (type === "islam") {
      for (const side of [-1, 1])
        box(body, 0.035, 0.55, 0.32, side * 0.235, 0.2, 0, "#c4c8b0");
      cyl(body, 0.13, 0.13, 0.012, 0, 0.25, 0.18, "#c3ac66", 10).rotation.x =
        Math.PI / 2;
    }
  } else if (type === "police" || type === "guard") {
    box(
      head,
      0.37,
      0.12,
      0.33,
      0,
      0.22,
      0,
      type === "police" ? "#2f4550" : "#343f37",
    );
    box(head, 0.35, 0.035, 0.18, 0, 0.17, 0.18, "#26352c");
    box(body, 0.07, 0.1, 0.02, -0.14, 0.36, 0.18, "#c5b36d");
  } else {
    box(head, 0.34, 0.12, 0.32, 0, 0.19, -0.015, elder ? "#c8c4ae" : "#414339");
    if (elder) {
      box(head, 0.35, 0.05, 0.025, 0, 0.055, 0.177, "#696a5b");
      box(head, 0.19, 0.12, 0.015, 0, -0.12, 0.166, "#beb69b");
    }
  }
  const arms = [],
    legs = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.36, 0.45, 0);
    body.add(arm);
    cyl(arm, 0.115, 0.085, 0.51, 0, -0.2, 0, coat, 6);
    box(arm, 0.16, 0.18, 0.17, 0, -0.52, 0, skin);
    if (type === "islam") {
      for (let i = 0; i < 2; i++)
        box(arm, 0.185, 0.034, 0.23, 0, -0.1 - i * 0.07, 0, "#c9ccb7");
    }
    arms.push(arm);
    const leg = new THREE.Group();
    leg.position.set(s * 0.15, 0.79, 0);
    g.add(leg);
    cyl(
      leg,
      0.115,
      0.085,
      0.65,
      0,
      -0.32,
      0,
      type === "islam" ? "#4c504a" : "#303637",
      6,
    );
    box(
      leg,
      0.24,
      0.15,
      0.38,
      0,
      -0.7,
      0.07,
      type === "islam" ? "#d4d1b9" : "#252c25",
    );
    legs.push(leg);
  }
  if (elder) body.rotation.x = 0.12;
  const held = new THREE.Group();
  held.position.set(0, -0.48, 0.1);
  arms[1].add(held);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.43, 16),
    new THREE.MeshBasicMaterial({
      color: "#15231b",
      transparent: true,
      opacity: 0.23,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  g.add(shadow);
  g.userData = { body, head, arms, legs, held, item: null, type };
  return g;
}
export function animateCharacter(g, state, t, dt) {
  const u = g.userData,
    moving = !!state.moving;
  const walk = Math.sin(t * (state.carrying ? 6 : 9) + g.id) * 0.6;
  u.legs.forEach((l, i) => {
    l.rotation.x = THREE.MathUtils.lerp(
      l.rotation.x,
      moving ? walk * (i ? 1 : -1) : 0,
      0.22,
    );
  });
  u.arms.forEach((a, i) => {
    a.rotation.x = THREE.MathUtils.lerp(
      a.rotation.x,
      state.looting
        ? -0.9 + Math.sin(t * 5 + i) * 0.25
        : state.carrying
          ? -0.95
          : state.selected === "pistol" || state.selected === "smg"
            ? i
              ? -0.95
              : -0.3
            : moving
              ? -walk * (i ? 1 : -1) * 0.7
              : 0,
      0.2,
    );
  });
  u.body.position.y =
    1 +
    (moving ? Math.abs(Math.sin(t * 9)) * 0.025 : Math.sin(t * 1.8) * 0.012);
  const item = state.carrying ? "crate" : state.selected;
  if (u.item !== item) {
    u.held.clear();
    if (item === "crate") box(u.held, 0.65, 0.55, 0.5, -0.3, 0, 0.3, "#a08b5c");
    else if (item && item !== "fist") {
      const model = weaponModel(item);
      if (item === "pistol" || item === "smg") model.rotation.x = 0.95;
      u.held.add(model);
    }
    u.item = item;
  }
  if (state.sleep > 0) {
    g.rotation.x = (-Math.PI / 2) * Math.min(1, state.sleep);
    g.rotation.y = 0;
    g.position.y = 0.7 * Math.min(1, state.sleep);
  } else {
    g.rotation.x = 0;
    g.position.y = 0;
  }
}
export class City {
  constructor(scene) {
    this.scene = scene;
    this.roofs = [];
    this.obstacles = [];
    this.lamps = [];
    this.make();
    this.batchStatic();
  }
  batchStatic() {
    // Batch the stationary city by material: dozens of draw calls, not thousands,
    // while retaining invisible wall meshes for precise camera collision rays.
    this.scene.updateMatrixWorld(true);
    const groups = new Map(),
      dynamic = new Set([...this.roofs.map((r) => r.mesh), this.doorPivot]);
    this.scene.traverse((mesh) => {
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      let parent = mesh;
      while (parent) {
        if (dynamic.has(parent)) return;
        parent = parent.parent;
      }
      const list = groups.get(mesh.material) || [];
      list.push(mesh);
      groups.set(mesh.material, list);
    });
    const obstacles = new Set(this.obstacles);
    for (const [mat, meshes] of groups) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map((m) => {
        const g = m.geometry.index
          ? m.geometry.toNonIndexed()
          : m.geometry.clone();
        return g.applyMatrix4(m.matrixWorld);
      });
      const geo = mergeGeometries(geometries, false);
      geometries.forEach((g) => g.dispose());
      if (!geo) continue;
      const batch = new THREE.Mesh(geo, mat);
      batch.castShadow = meshes.some((m) => m.castShadow);
      batch.receiveShadow = true;
      for (const m of meshes) {
        if (obstacles.has(m)) m.visible = false;
        else m.removeFromParent();
      }
      this.scene.add(batch);
    }
  }
  wall(parent, w, h, d, x, y, z, color) {
    const o = box(parent, w, h, d, x, y, z, color);
    this.obstacles.push(o);
    return o;
  }
  building(b, type) {
    const g = new THREE.Group();
    this.scene.add(g);
    const h = type === "bank" ? 6.7 : 4.6,
      wall =
        type === "home" ? "#88817a" : type === "bank" ? "#a19b90" : "#767873";
    box(
      g,
      b.w,
      0.1,
      b.d,
      b.x,
      0.015,
      b.z,
      type === "home" ? "#726d55" : "#a3a28a",
    );
    this.wall(g, 0.35, h, b.d, b.x - b.w / 2, h / 2, b.z, wall);
    this.wall(g, 0.35, h, b.d, b.x + b.w / 2, h / 2, b.z, wall);
    const front = type === "bank" ? b.z + b.d / 2 : b.z - b.d / 2,
      back = type === "bank" ? b.z - b.d / 2 : b.z + b.d / 2;
    this.wall(g, b.w, h, 0.35, b.x, h / 2, back, wall);
    this.wall(
      g,
      (b.w - 3.2) / 2,
      h,
      0.35,
      b.x - (b.w + 3.2) / 4,
      h / 2,
      front,
      wall,
    );
    this.wall(
      g,
      (b.w - 3.2) / 2,
      h,
      0.35,
      b.x + (b.w + 3.2) / 4,
      h / 2,
      front,
      wall,
    );
    this.wall(g, 3.2, h - 3.2, 0.35, b.x, 3.2 + (h - 3.2) / 2, front, wall);
    for (const side of [-1, 1]) {
      box(
        g,
        b.w + 0.5,
        0.3,
        0.35,
        b.x,
        h + 0.15,
        b.z + (side * b.d) / 2,
        "#4e5351",
      );
      box(g, 0.35, 0.3, b.d, b.x + (side * b.w) / 2, h + 0.15, b.z, "#4e5351");
    }
    const roof = new THREE.Group();
    box(roof, b.w + 0.7, 0.15, b.d + 0.7, b.x, h + 0.4, b.z, "#526052");
    box(roof, 3, 1.1, 2, b.x + b.w / 4, h + 1, b.z, "#637261");
    this.scene.add(roof);
    this.roofs.push({ mesh: roof, b });
    // Top ring remains, while roof and lintels fade out indoors.
    const frontSignZ = front + (type === "bank" ? 0.25 : -0.25);
    let sg = sign(
      g,
      type === "bank"
        ? "НАРОДНЫЙ БАНК"
        : type === "home"
          ? "ДОМ  ·  07"
          : "АРСЕНАЛ",
      b.x,
      type === "bank" ? 5.15 : 3.9,
      frontSignZ,
      type === "bank" ? 14 : 8,
      0.85,
      { bg: type === "bank" ? "#33493b" : "#2d3b31", fg: "#dce5b9", font: 90 },
    );
    if (type !== "bank") sg.rotation.y = Math.PI;
    for (const s of [-1, 1]) {
      const wx = b.x + s * (b.w / 2 - 3.4);
      box(
        g,
        3,
        1.9,
        0.08,
        wx,
        2.5,
        front + (type === "bank" ? 0.2 : -0.2),
        "#3b514a",
      );
      for (let i = 0; i < 4; i++)
        box(
          g,
          0.065,
          1.95,
          0.12,
          wx - 1.4 + i * 0.95,
          2.5,
          front + (type === "bank" ? 0.27 : -0.27),
          "#adb09a",
        );
      box(
        g,
        3.1,
        0.1,
        0.35,
        wx,
        1.5,
        front + (type === "bank" ? 0.27 : -0.27),
        "#c3bea3",
      );
    }
    if (type === "bank") {
      for (let x of [-9, 9]) {
        cyl(g, 0.48, 0.57, 5.4, x, 2.7, front + 0.8, "#b4b69e", 10);
        box(g, 1.4, 0.3, 1.4, x, 0.15, front + 0.8, "#929b83");
        box(g, 1.4, 0.3, 1.4, x, 5.4, front + 0.8, "#c9c6aa");
      }
      for (const side of [-1, 1])
        box(g, 8, 0.9, 1.2, side * 5.5, 0.45, -25, "#6b795f");
      for (const x of [-7.5, -4.5, 4.5, 7.5]) {
        box(g, 2.5, 0.04, 1, x, 0.94, -25, "#c0b695");
        box(
          g,
          2.6,
          1.1,
          0.05,
          x,
          1.55,
          -25,
          new THREE.MeshStandardMaterial({
            color: "#99b6ab",
            transparent: true,
            opacity: 0.3,
            roughness: 0.15,
          }),
        );
      }
      sign(g, "КАССА  /  CASH", 7, 2.5, -30.6, 5, 0.5, { font: 75 });
      for (let i = 0; i < 18; i++) {
        const cash = weaponModel("cash");
        cash.position.set(
          -2 + (i % 6) * 0.8,
          0.12 + Math.floor(i / 6) * 0.28,
          -29,
        );
        g.add(cash);
      }
      box(g, 7, 0.9, 2.5, 0, 0.45, -29, "#697b5a");
      for (let i = 0; i < 18; i++) {
        const cash = weaponModel("cash");
        cash.position.set(
          -2 + (i % 6) * 0.8,
          0.96 + Math.floor(i / 6) * 0.26,
          -29,
        );
        g.add(cash);
      }
      const vault = cyl(g, 2.3, 2.3, 0.23, -6, 2.4, -32.7, "#596858", 16);
      vault.rotation.x = Math.PI / 2;
      cyl(g, 0.65, 0.65, 0.12, -6, 2.4, -32.5, "#9a9e84", 8).rotation.x =
        Math.PI / 2;
      box(g, 1.6, 0.12, 0.18, -6, 2.4, -32.3, "#b3b297");
      for (let x of [-8, 8])
        for (let z of [-18, -21]) {
          box(g, 1.1, 0.1, 1.1, x, 0.55, z, "#4b5c46");
          for (let s of [-0.4, 0.4])
            box(g, 0.07, 0.55, 0.07, x + s, 0.27, z, "#354330");
          box(g, 1.1, 0.8, 0.1, x, 1, z - 0.5, "#65765d");
        }
      sign(g, "ТИШИНА — ЗОЛОТО", 0, 4.2, -32.75, 8, 0.6, {
        font: 65,
        bg: "#a2a88c",
        fg: "#3e5440",
      });
    } else if (type === "home") {
      for (let [i, spawn] of WORLD.spawns.entries()) {
        box(g, 2.2, 0.45, 3.9, spawn.x, 0.3, spawn.z, c.wood);
        box(g, 2.1, 0.25, 3.8, spawn.x, 0.65, spawn.z, "#acaa8c");
        box(
          g,
          2.1,
          0.15,
          2.4,
          spawn.x,
          0.85,
          spawn.z + 0.6,
          i ? "#6a775e" : "#596c66",
        );
        box(g, 1.4, 0.22, 0.65, spawn.x, 0.88, spawn.z - 1.3, "#d0cbb0");
        box(g, 2.2, 1.2, 0.15, spawn.x, 0.8, spawn.z - 2, "#6c6149");
        box(g, 0.9, 0.65, 0.85, spawn.x + 1.9, 0.35, spawn.z - 1, "#5d654e");
      }
      for (let [i, p] of WORLD.lockers.entries()) {
        box(g, 1.9, 2.8, 1.1, p.x, 1.4, p.z, "#59634e");
        for (let x of [-0.48, 0.48]) {
          box(g, 0.87, 2.6, 0.08, p.x + x, 1.4, p.z - 0.6, "#707960");
          box(
            g,
            0.05,
            0.3,
            0.08,
            p.x + x + (x < 0 ? 0.25 : -0.25),
            1.4,
            p.z - 0.67,
            "#beb18b",
          );
        }
        sign(g, i ? "ISLAM" : "DENI", p.x, 2.3, p.z - 0.68, 1.4, 0.24, {
          font: 75,
          bg: "#414d3d",
        }).rotation.y = Math.PI;
      }
      box(g, 2, 0.9, 1.5, -22, 0.45, 21, "#685e46");
      box(g, 0.6, 0.1, 0.6, -22, 0.95, 21, "#bfb898");
      box(g, 0.7, 0.5, 0.2, -22, 1.2, 23.1, "#292e26");
      sign(g, "ДОМА ЛУЧШЕ", -22, 3.1, 23.8, 3.5, 0.5, {
        bg: "#8c9078",
        fg: "#3f513a",
        font: 70,
      });
      this.doorPivot = new THREE.Group();
      this.doorPivot.position.set(b.doorX - 1.5, 0, b.doorZ);
      g.add(this.doorPivot);
      box(this.doorPivot, 3, 3.15, 0.18, 1.5, 1.57, 0, "#47573d");
      box(this.doorPivot, 0.1, 0.1, 0.12, 2.7, 1.5, -0.15, "#d4c489");
      sign(this.doorPivot, "07", 1.5, 2.2, -0.12, 0.5, 0.3, {
        font: 90,
        bg: "#47573d",
      }).rotation.y = Math.PI;
    } else {
      box(g, 11, 1.2, 1.1, 24, 0.6, 18.5, "#6b6950");
      box(g, 11, 0.12, 1.4, 24, 1.25, 18.5, "#a8a080");
      box(g, 12, 2.5, 0.16, 24, 2.4, 22.7, "#3c4939");
      for (let i = 0; i < 5; i++) {
        const gun = weaponModel(i % 2 ? "pistol" : "smg");
        gun.position.set(19 + i * 2.4, 2.7, 22.4);
        gun.rotation.z = Math.PI / 2;
        g.add(gun);
      }
      for (let i = 0; i < 6; i++)
        box(g, 0.8, 0.35, 0.6, 20 + i * 1.6, 0.3, 21.5, "#8b8b5c");
      sign(g, "БЕЗ ЛИШНИХ ВОПРОСОВ", 24, 3.8, 22.7, 10, 0.55, {
        font: 65,
        bg: "#3c4939",
      });
    }
    return g;
  }
  make() {
    const s = this.scene;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 150),
      new THREE.MeshStandardMaterial({
        map: groundTexture("pavement"),
        roughness: 1,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.06;
    ground.receiveShadow = true;
    s.add(ground);
    box(
      s,
      123,
      0.08,
      12,
      0,
      -0.02,
      -2,
      new THREE.MeshStandardMaterial({
        map: groundTexture("road"),
        roughness: 1,
      }),
      { shadow: false },
    );
    box(
      s,
      12,
      0.07,
      100,
      12,
      -0.01,
      -1,
      new THREE.MeshStandardMaterial({
        map: groundTexture("road"),
        roughness: 1,
      }),
      { shadow: false },
    );
    for (let x = -55; x < 57; x += 7) {
      box(s, 3, 0.015, 0.12, x, 0.033, -2, "#bebc93", { shadow: false });
      for (const z of [-8.1, 4.1])
        box(s, 6.7, 0.17, 0.25, x, 0.06, z, "#919a83");
    }
    for (let z = -45; z < 45; z += 7)
      box(s, 0.12, 0.012, 3, 12, 0.04, z, "#b9b993", { shadow: false });
    for (let i = 0; i < 8; i++) {
      box(s, 0.55, 0.015, 9, -3 + i * 1.1, 0.035, -2, "#b9baa0", {
        shadow: false,
      });
      box(s, 9, 0.015, 0.55, 12, 0.05, 5.5 + i * 1.1, "#b9baa0", {
        shadow: false,
      });
    }
    this.building(WORLD.home, "home");
    this.building(WORLD.bank, "bank");
    this.building(WORLD.shop, "shop");
    box(s, 0.04, 0.5, 0.04, -22, 4.1, 18, "#363c3a");
    box(s, 0.65, 0.12, 0.4, -22, 3.85, 18, "#535956");
    box(
      s,
      0.5,
      0.04,
      0.3,
      -22,
      3.77,
      18,
      new THREE.MeshStandardMaterial({
        color: "#d4c7a6",
        emissive: "#c5a264",
        emissiveIntensity: 0.5,
      }),
    );
    const homeLight = new THREE.PointLight("#d6c29d", 8, 16, 2);
    homeLight.position.set(-22, 3.6, 18);
    s.add(homeLight);
    sign(s, "НЕ ВЕРЬ НИКОМУ", -28, 1.4, 9.78, 3.7, 0.5, {
      bg: "#69655f",
      fg: "#363b3b",
      font: 64,
    }).rotation.y = Math.PI;
    sign(s, "ОБЪЕКТ ПОД ОХРАНОЙ", 9.8, 1.2, -12.75, 2, 0.7, {
      bg: "#938b78",
      fg: "#393c39",
      font: 55,
    });
    sign(s, "КВАРТАЛ 07", -44, 2.1, 17.8, 6, 0.8, {
      bg: "#676e6d",
      fg: "#c4b9a0",
      font: 72,
    }).rotation.y = Math.PI;
    for (const [i, b] of [
      { x: -44, z: 27, w: 12, d: 18 },
      { x: 44, z: -25, w: 15, d: 20 },
      { x: -27, z: -35, w: 15, d: 14 },
      { x: 23, z: -35, w: 13, d: 13 },
      { x: 5, z: 34, w: 18, d: 12 },
    ].entries()) {
      const h = 9 + (i % 3) * 4;
      this.wall(
        s,
        b.w,
        h,
        b.d,
        b.x,
        h / 2,
        b.z,
        ["#6f716f", "#7d7770", "#69706e"][i % 3],
      );
      box(s, b.w + 0.5, 0.4, b.d + 0.5, b.x, h, b.z, "#4c5c4b");
      for (let y = 2.5; y < h - 1; y += 3)
        for (let x = b.x - b.w / 2 + 2; x < b.x + b.w / 2 - 1; x += 3) {
          box(s, 1.3, 1.7, 0.06, x, y, b.z + b.d / 2 + 0.05, "#435950");
          box(s, 1.5, 0.1, 0.3, x, y - 0.85, b.z + b.d / 2 + 0.1, "#a9aa8d");
          box(s, 0.06, 1.7, 0.1, x, y, b.z + b.d / 2 + 0.1, "#a1a68b");
        }
      for (let z = b.z - b.d / 2 + 2; z < b.z + b.d / 2 - 1; z += 3)
        for (let y = 2.5; y < h - 1; y += 3)
          box(s, 0.07, 1.7, 1.3, b.x - b.w / 2 - 0.06, y, z, "#42574d");
      box(s, 2, 0.8, 1.4, b.x, h + 0.6, b.z, "#6d7863");
    }
    // Distant skyline gives the playable quarter a real neighbourhood silhouette.
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2,
        x = Math.sin(angle) * 83,
        z = Math.cos(angle) * 67,
        h = 8 + ((i * 7) % 19);
      box(
        s,
        9 + (i % 4) * 2,
        h,
        9 + (i % 3) * 3,
        x,
        h / 2,
        z,
        ["#787d7e", "#878988", "#6c7577"][i % 3],
      );
    }
    for (const [x, z] of [
      [-39, 6],
      [-36, -17],
      [-8, 9],
      [19, -11],
      [37, 8],
      [39, 28],
      [-12, 32],
      [-48, -4],
      [-45, 42],
      [26, 34],
      [-16, -42],
      [42, -40],
    ])
      this.tree(x, z);
    for (let x of [-45, -12, 18, 42]) for (let z of [-9, 6]) this.lamp(x, z);
    this.car(-39, -9, "#bbb69a", true);
    this.car(30, 1, "#697e6b");
    this.car(-15, 1, "#875f49");
    this.car(17, -5, "#c2c4b0", false, true);
    const depot = new THREE.Group();
    s.add(depot);
    for (let i = 0; i < 9; i++) {
      const x = -30 + (i % 3) * 1.2,
        z = -10 - Math.floor(i / 3) * 1.1;
      box(depot, 1, 0.9, 1, x, 0.45, z, "#9b8b60");
      for (let j of [-0.35, 0.35])
        box(depot, 0.07, 0.95, 1.03, x + j, 0.45, z, "#6c6243");
    }
    sign(s, "ПОДРАБОТКА  →", -29, 2, -11.5, 5, 0.6, {
      bg: "#5b6947",
      fg: "#e0dda6",
      font: 70,
    });
    for (let [x, z] of [
      [-8, 6],
      [-34, 7],
      [35, -10],
    ]) {
      box(s, 2.5, 0.13, 0.7, x, 0.65, z, "#7d7957");
      box(s, 2.5, 0.7, 0.12, x, 1.03, z + 0.3, "#777452");
      for (let a of [-0.9, 0.9])
        box(s, 0.12, 0.65, 0.5, x + a, 0.32, z, "#354c3b");
    }
    // Power cables, posters, drain covers, bollards, planters and litter.
    for (let x = -48; x < 49; x += 24) {
      cyl(s, 0.1, 0.15, 9, x, 4.5, 7.5, "#655d45");
      const pts = [];
      for (let j = 0; j <= 16; j++)
        pts.push(
          new THREE.Vector3(
            x + j * 1.5,
            8.5 - Math.sin((j / 16) * Math.PI) * 0.8,
            7.5,
          ),
        );
      s.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: "#334435" }),
        ),
      );
    }
    for (let i = 0; i < 20; i++) {
      const x = -50 + i * 5.1,
        z = i % 2 ? 5.5 : -9.5;
      cyl(s, 0.12, 0.16, 0.75, x, 0.38, z, "#596b50");
      if (i % 4 === 0) {
        box(s, 1.3, 0.6, 1.3, x, 0.3, z + 1.7, "#7d876e");
        cyl(s, 0.7, 0.6, 0.7, x, 0.85, z + 1.7, "#545e4a", 7);
      }
    }
    for (let i = 0; i < 20; i++)
      box(
        s,
        0.15 + (i % 3) * 0.12,
        0.012,
        0.25,
        -40 + ((i * 13) % 85),
        0.06,
        -7 + ((i * 11) % 13),
        "#b2b095",
        { shadow: false },
      );
    for (let i = 0; i < 12; i++) {
      const bag = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.3 + (i % 3) * 0.06, 0),
        material("#383d39"),
      );
      bag.position.set(-34 + ((i * 7) % 65), 0.27, i % 2 ? 5.5 : -10.2);
      bag.scale.y = 1.2;
      bag.castShadow = true;
      s.add(bag);
    }
    for (let x of [-20, 5, 35]) {
      const drain = box(s, 0.8, 0.03, 0.6, x, 0.04, -6.8, "#2d3e31");
      for (let i = 0; i < 5; i++)
        box(s, 0.045, 0.01, 0.5, x - 0.3 + i * 0.15, 0.06, -6.8, "#6a7760");
    }
  }
  tree(x, z) {
    const s = this.scene;
    cyl(s, 0.18, 0.3, 3, x, 1.5, z, "#665e43");
    const leaf = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.2, 1),
      material("#52594a"),
    );
    leaf.position.set(x, 4, z);
    leaf.scale.set(1, 1.2, 1);
    leaf.castShadow = true;
    s.add(leaf);
    const second = leaf.clone();
    second.position.set(x + 1, 4.6, z - 0.4);
    second.scale.set(0.65, 0.9, 0.65);
    s.add(second);
    box(s, 2, 0.35, 2, x, 0.1, z, "#8c967c");
  }
  lamp(x, z) {
    const s = this.scene;
    cyl(s, 0.055, 0.1, 5, x, 2.5, z, "#3b5140");
    box(s, 1.5, 0.08, 0.09, x + 0.7, 5, z, "#405440");
    box(s, 0.8, 0.12, 0.45, x + 1.1, 4.94, z, "#3d513d");
    box(
      s,
      0.65,
      0.025,
      0.32,
      x + 1.1,
      4.87,
      z,
      new THREE.MeshStandardMaterial({
        color: "#e1d994",
        emissive: "#d6bc68",
        emissiveIntensity: 0.6,
      }),
    );
  }
  car(x, z, color, truck = false, police = false) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    this.scene.add(g);
    box(g, 2.05, 0.55, truck ? 5.8 : 4.3, 0, 0.65, 0, color);
    box(g, 1.85, 0.7, truck ? 1.7 : 2.2, 0, 1.25, truck ? 1 : 0, color);
    box(g, 1.7, 0.55, 0.035, 0, 1.3, truck ? 1.88 : 1.15, "#3c5750");
    box(g, 1.7, 0.5, 0.035, 0, 1.3, truck ? 0.12 : -1.15, "#3c5750");
    for (let side of [-1, 1]) {
      box(g, 0.02, 0.5, 1.6, side * 0.94, 1.3, truck ? 1 : 0, "#3b554b");
      for (let zi of [-1.45, 1.45]) {
        const wheel = cyl(
          g,
          0.4,
          0.4,
          0.25,
          side * 1.03,
          0.43,
          zi,
          "#25342a",
          10,
        );
        wheel.rotation.z = Math.PI / 2;
        cyl(g, 0.2, 0.2, 0.26, side * 1.04, 0.43, zi, "#90967b", 8).rotation.z =
          Math.PI / 2;
      }
    }
    for (let side of [-1, 1]) {
      box(
        g,
        0.43,
        0.19,
        0.06,
        side * 0.65,
        0.78,
        truck ? 2.94 : 2.19,
        "#d7d2a0",
      );
      box(
        g,
        0.3,
        0.15,
        0.06,
        side * 0.7,
        0.73,
        truck ? -2.94 : -2.19,
        "#a46044",
      );
    }
    box(g, 1.5, 0.14, 0.12, 0, 0.45, truck ? 2.96 : 2.2, "#7b8872");
    if (truck) {
      box(g, 2.0, 1.75, 3.1, 0, 1.25, -1.15, "#8b9379");
      box(g, 1.85, 1.65, 0.05, 0, 1.25, -2.74, "#656f58");
      for (let i = 0; i < 7; i++)
        box(g, 1.84, 0.025, 0.07, 0, 0.5 + i * 0.22, -2.79, "#a1a48a");
    }
    if (police) {
      box(g, 2.08, 0.22, 3.6, 0, 0.8, 0, "#405d66");
      box(g, 1, 0.12, 0.3, 0, 1.69, 0, "#2d443d");
      box(g, 0.4, 0.2, 0.32, -0.28, 1.82, 0, "#546f8e");
      box(g, 0.4, 0.2, 0.32, 0.28, 1.82, 0, "#a36755");
    }
    return g;
  }
  update(p, door, dt, firstPerson = false) {
    for (const r of this.roofs) {
      r.mesh.visible = firstPerson || !p || !inside(p, r.b, -7);
    }
    if (this.doorPivot)
      this.doorPivot.rotation.y = THREE.MathUtils.lerp(
        this.doorPivot.rotation.y,
        door ? -Math.PI / 2 : 0,
        Math.min(1, dt * 8),
      );
  }
}
