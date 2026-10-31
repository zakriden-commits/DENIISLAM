import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { WORLD, POIS, TREES, NODES, heightAt, dist } from "./shared.js";
const v = new T.Vector3(),
  dummy = new T.Object3D();
export class SurvivalWorld {
  constructor(canvas, assets) {
    this.assets = assets;
    this.scene = new T.Scene();
    this.scene.fog = new T.Fog(0x8c9a96, 60, 320);
    this.scene.environment = assets.environment;
    this.scene.environmentIntensity = 0.7;
    this.camera = new T.PerspectiveCamera(73, 1, 0.08, 1400);
    this.renderer = assets.renderer;
    this.canvas = canvas;
    this.actors = new Map();
    this.nodeMeshes = new Map();
    this.fireMeshes = new Map();
    this.dropMeshes = new Map();
    this.lastLOD = -10;
    this.clock = 0;
    this.pitch = 0;
    this.yaw = Math.PI;
    this.pos = { x: -8, z: 64 };
    this.playing = false;
    this.quality = assets.mobile ? "low" : "high";
    this.build();
  }
  mesh(g, m, x = 0, y = 0, z = 0, parent = this.scene) {
    const o = new T.Mesh(g, m);
    o.position.set(x, y, z);
    o.receiveShadow = true;
    o.castShadow = true;
    parent.add(o);
    return o;
  }
  box(w, h, d, m, x, y, z, parent) {
    return this.mesh(new T.BoxGeometry(w, h, d), m, x, y, z, parent);
  }
  place(name, x, z, height = 1, y = 0, parent = this.scene) {
    const o = this.assets.model(name, height);
    o.position.set(x, heightAt(x, z) + y, z);
    parent.add(o);
    return o;
  }
  build() {
    const a = this.assets,
      s = this.scene;
    this.hemi = new T.HemisphereLight(0xc7dadd, 0x4c4b3a, 1.25);
    s.add(this.hemi);
    this.sun = new T.DirectionalLight(0xffd4a3, 2.5);
    this.sun.position.set(80, 90, -70);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, {
      left: -65,
      right: 65,
      top: 65,
      bottom: -65,
      near: 1,
      far: 350,
    });
    this.sun.shadow.bias = -0.001;
    this.sun.shadow.normalBias = 0.06;
    s.add(this.sun, this.sun.target);
    const sky = this.mesh(
      new T.SphereGeometry(1200, 24, 16),
      new T.ShaderMaterial({
        side: T.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new T.Color("#536d7b") },
          bottom: { value: new T.Color("#8c9a96") },
        },
        vertexShader:
          "varying vec3 v;void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
        fragmentShader:
          "varying vec3 v;uniform vec3 top;uniform vec3 bottom;void main(){gl_FragColor=vec4(mix(bottom,top,pow(max(normalize(v).y,0.),.6)),1.);}",
      }),
    );
    sky.castShadow = false;
    this.sky = sky;
    const groundMat = new T.MeshStandardMaterial({
      color: 0x626d56,
      map: a.texture("ground-color.png", 110),
      normalMap: a.texture("ground-normal.png", 110),
      roughnessMap: a.texture("ground-rough.png", 110),
      roughness: 1,
      normalScale: new T.Vector2(0.7, 0.7),
    });
    groundMat.onBeforeCompile = (sh) => {
      sh.uniforms.grass = { value: a.texture("grass.png", 1) };
      sh.vertexShader =
        "varying vec3 groundPos;varying float upness;\n" +
        sh.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\ngroundPos=position;upness=normal.y;",
        );
      sh.fragmentShader =
        "varying vec3 groundPos;varying float upness;uniform sampler2D grass;\n" +
        sh.fragmentShader.replace(
          "#include <color_fragment>",
          "#include <color_fragment>\nvec3 g=texture2D(grass,groundPos.xz*.14).rgb;diffuseColor.rgb=mix(diffuseColor.rgb,g*vec3(.25,.32,.22),smoothstep(.85,.99,upness)*(.3+.18*sin(groundPos.x*.035)));",
        );
    };
    const terrain = new T.PlaneGeometry(1060, 1060, 192, 192);
    terrain.rotateX(-Math.PI / 2);
    const p = terrain.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
    terrain.computeVertexNormals();
    this.mesh(terrain, groundMat).castShadow = false;
    this.wood = new T.MeshStandardMaterial({
      map: a.texture("bark.jpg", 3),
      normalMap: a.texture("bark-normal.png", 3),
      color: 0xaaa18b,
      roughness: 1,
      normalScale: new T.Vector2(0.4, 0.4),
    });
    this.rust = new T.MeshStandardMaterial({
      color: 0x635b4d,
      roughness: 0.85,
      metalness: 0.3,
    });
    this.concrete = new T.MeshStandardMaterial({
      color: 0x777d75,
      map: a.texture("ground-color.png", 3),
      roughness: 1,
    });
    for (const poi of POIS)
      if (!["radio", "village"].includes(poi.id)) this.building(poi);
    // Radio tower, guy wires and a real scavenged radio console.
    const radio = POIS.find((p) => p.id === "radio"),
      ry = heightAt(radio.x, radio.z);
    const steel = new T.MeshStandardMaterial({
      color: 0x596364,
      metalness: 0.65,
      roughness: 0.6,
    });
    const tower = new T.Group();
    tower.position.set(radio.x, ry, radio.z);
    s.add(tower);
    const beam = (x1, y1, z1, x2, y2, z2, r = 0.07) => {
      const start = new T.Vector3(x1, y1, z1),
        end = new T.Vector3(x2, y2, z2),
        o = this.mesh(
          new T.CylinderGeometry(r, r, end.distanceTo(start), 5),
          steel,
          0,
          0,
          0,
          tower,
        );
      o.position.copy(start).add(end).multiplyScalar(0.5);
      o.quaternion.setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        end.sub(start).normalize(),
      );
    };
    for (const [x, z] of [
      [-2, -2],
      [2, -2],
      [2, 2],
      [-2, 2],
    ]) {
      beam(x, 0, z, x * 0.25, 35, z * 0.25, 0.12);
      for (let y = 1; y < 33; y += 4) {
        beam(
          x * (1 - y / 44),
          y,
          z * (1 - y / 44),
          -x * (1 - (y + 4) / 44),
          y + 4,
          z * (1 - (y + 4) / 44),
        );
      }
    }
    for (let y = 4; y < 36; y += 8) beam(-2, y, 0, 2, y, 0);
    this.beacon = this.mesh(
      new T.SphereGeometry(0.35, 8, 6),
      new T.MeshBasicMaterial({ color: 0xc83e2a }),
      0,
      36,
      0,
      tower,
    );
    this.place("Radio", radio.x, radio.z, 0.8, 1);
    this.box(2, 1, 0.8, steel, radio.x, ry + 0.5, radio.z);
    const vp = POIS.find((p) => p.id === "village");
    this.place("House1", vp.x - 12, vp.z, 8);
    this.place("Building2_Small", vp.x + 13, vp.z + 7, 6);
    this.place("House1", vp.x - 22, vp.z - 28, 6).rotation.y = 1.3;
    this.place("Tent", -7, 49, 1.7);
    this.place("Backpack", -6, 49, 0.7);
    this.place("Axe", -4, 40, 0.75, 0.8).rotation.z = 0.6;
    this.place("Knife", 2.5, 35, 0.35, 0.85);
    this.place("Bandages", 3, 35, 0.18, 0.85);
    this.place("FirstAidKit", 3.4, 35, 0.35, 0.85);
    this.box(2, 0.12, 1, this.wood, 3, heightAt(3, 35) + 0.8, 35);
    this.box(1.7, 0.8, 0.9, this.wood, -4, heightAt(-4, 39) + 0.4, 39);
    for (const n of NODES) {
      if (n.wild) continue;
      let obj;
      if (n.type === "wood") obj = this.place("WoodLog", n.x, n.z, 0.45);
      else if (n.type === "stone")
        obj = this.place("Rock_Moss_1", n.x, n.z, 0.45);
      else if (n.type === "berry")
        obj = this.place("BushBerries_1", n.x, n.z, 1.05);
      else if (n.type === "water") continue;
      else if (n.type === "part")
        obj = this.place("Radio", n.x, n.z, 0.45, 0.85);
      else if (n.type === "supply") {
        obj = new T.Group();
        obj.position.set(n.x, heightAt(n.x, n.z), n.z);
        s.add(obj);
        const can = a.model("Can_Red", 0.24),
          bottle = a.model("WaterBottle_1", 0.4);
        can.position.set(-0.25, 0.8, 0);
        bottle.position.set(0.2, 0.8, 0);
        obj.add(can, bottle);
        this.box(1, 0.8, 0.7, this.wood, 0, 0.4, 0, obj);
      } else {
        obj = new T.Group();
        obj.position.set(n.x, heightAt(n.x, n.z), n.z);
        s.add(obj);
        this.box(1.2, 0.7, 0.8, this.wood, 0, 0.35, 0, obj);
        const prop = a.item(
          n.site === "mill"
            ? "Shotgun_1"
            : n.site === "checkpoint"
              ? "Pistol_1"
              : n.site === "pump"
                ? "GasCan"
                : "FirstAidKit",
          0.7,
        );
        prop.position.y = 0.75;
        obj.add(prop);
      }
      if (obj) this.nodeMeshes.set(n.id, obj);
    }
    this.buildForest();
    this.buildRiver();
    // Distant ridgeline, beyond the playable border; snow on the upper faces.
    const rg = new T.BufferGeometry(),
      rp = [],
      ri = [],
      rc = [];
    for (let ring = 0; ring <= 8; ring++)
      for (let i = 0; i <= 160; i++) {
        const a = (i / 160) * Math.PI * 2,
          r = 550 + ring * 65,
          h =
            (90 +
              Math.sin(a * 3 + 0.4) * 35 +
              Math.sin(a * 7) * 25 +
              Math.sin(a * 13) * 12) *
              Math.sin((ring / 8) * Math.PI) -
            12;
        rp.push(Math.sin(a) * r, h, Math.cos(a) * r);
        const c = new T.Color().lerpColors(
          new T.Color("#526570"),
          new T.Color("#afb8b4"),
          T.MathUtils.smoothstep(h, 65, 135),
        );
        rc.push(c.r, c.g, c.b);
        if (ring < 8 && i < 160) {
          const k = ring * 161 + i;
          ri.push(k, k + 1, k + 161, k + 1, k + 162, k + 161);
        }
      }
    rg.setAttribute("position", new T.Float32BufferAttribute(rp, 3));
    rg.setAttribute("color", new T.Float32BufferAttribute(rc, 3));
    rg.setIndex(ri);
    rg.computeVertexNormals();
    this.mesh(
      rg,
      new T.MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        side: T.DoubleSide,
      }),
    ).castShadow = false;
    this.viewScene = new T.Scene();
    this.viewCamera = new T.PerspectiveCamera(58, 1, 0.01, 10);
    this.viewScene.add(new T.HemisphereLight(0xe5e8de, 0x35352c, 2.2));
    const vl = new T.DirectionalLight(0xffcd99, 3);
    vl.position.set(-2, 3, 2);
    this.viewScene.add(vl);
    this.rig = new T.Group();
    this.viewScene.add(this.rig);
    this.makeViewmodel("axe");
    this.menuActors = [
      this.createActor("menu-deni", "human", 0),
      this.createActor("menu-islam", "human", 1),
    ];
    this.menuActors[0].root.position.set(3, heightAt(3, 49), 49);
    this.menuActors[1].root.position.set(5, heightAt(5, 48), 48);
    this.menuActors.forEach((a) => (a.root.rotation.y = 0.5));
  }
  building(p) {
    const group = new T.Group();
    group.position.set(p.x, heightAt(p.x, p.z), p.z);
    this.scene.add(group);
    const m = ["bunker", "pump"].includes(p.id) ? this.concrete : this.wood,
      parts = [];
    const part = (w, h, d, x, y, z) => {
      const g = new T.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      parts.push(g);
    };
    part(p.w, 0.18, p.d, 0, -0.08, 0);
    part(0.3, p.h, p.d, -p.w / 2, p.h / 2, 0);
    part(0.3, p.h, p.d, p.w / 2, p.h / 2, 0);
    part(p.w, p.h, 0.3, 0, p.h / 2, -p.d / 2);
    const side = (p.w - 4) / 2;
    part(side, p.h, 0.3, -2 - side / 2, p.h / 2, p.d / 2);
    part(side, p.h, 0.3, 2 + side / 2, p.h / 2, p.d / 2);
    part(4, 1, 0.3, 0, p.h - 0.5, p.d / 2);
    this.mesh(mergeGeometries(parts), m, 0, 0, 0, group);
    parts.forEach((g) => g.dispose());
    const roof = new T.PlaneGeometry(p.w + 1.4, p.d + 1.4, 40, 1);
    roof.rotateX(-Math.PI / 2);
    const v = roof.attributes.position;
    for (let i = 0; i < v.count; i++)
      v.setY(
        i,
        p.h + 1 - Math.abs(v.getX(i)) * 0.15 + Math.sin(v.getX(i) * 22) * 0.045,
      );
    roof.computeVertexNormals();
    const rm = this.rust.clone();
    rm.side = T.DoubleSide;
    this.mesh(roof, rm, 0, 0, 0, group);
    if (p.id === "camp") {
      const light = new T.PointLight(0xffb16c, 28, 12, 2);
      light.position.set(0, 2.5, 0);
      group.add(light);
      for (const x of [-3, 3]) {
        const mat = new T.MeshStandardMaterial({
          color: x < 0 ? 0x49574a : 0x6a5c41,
          roughness: 1,
        });
        this.box(1.3, 0.15, 2.5, mat, x, 0.12, -1, group);
        this.box(1, 0.17, 0.4, mat, x, 0.22, -2, group);
      }
    }
  }
  buildRiver() {
    const positions = [],
      uv = [],
      indices = [];
    for (let i = 0; i <= 180; i++) {
      const z = -530 + (i * 1060) / 180,
        x = WORLD.riverX(z),
        y = heightAt(x, z) + 1.2;
      positions.push(x - 4, y, z, x + 4, y, z);
      uv.push(0, i * 0.24, 1, i * 0.24);
      if (i < 180) {
        let a = i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    const water = new T.MeshStandardMaterial({
      color: 0x4a777b,
      metalness: 0.4,
      roughness: 0.22,
      transparent: true,
      opacity: 0.85,
      side: T.DoubleSide,
      normalMap: this.assets.texture("ground-normal.png", 1),
      normalScale: new T.Vector2(0.08, 0.08),
    });
    this.mesh(g, water).castShadow = false;
    const foam = this.assets.texture("water-foam.png", 1);
    this.foam = foam;
    this.waterFoam = this.mesh(
      g.clone(),
      new T.MeshBasicMaterial({
        color: 0xc1d4cf,
        alphaMap: foam,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: T.DoubleSide,
      }),
    );
    this.waterFoam.position.y = 0.035;
    this.waterFoam.castShadow = false;
  }
  instanceModel(name, placements, height) {
    const model = this.assets.model(name, height);
    model.updateMatrixWorld(true);
    const meshes = [];
    model.traverse((m) => {
      if (m.isMesh) meshes.push(m);
    });
    for (const m of meshes) {
      const im = new T.InstancedMesh(m.geometry, m.material, placements.length);
      im.castShadow = false;
      im.receiveShadow = true;
      placements.forEach((p, i) => {
        dummy.position.set(p.x, heightAt(p.x, p.z), p.z);
        dummy.rotation.set(0, p.yaw || 0, 0);
        dummy.scale.setScalar(p.scale || 1);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix.clone().multiply(m.matrixWorld));
      });
      im.computeBoundingSphere();
      this.scene.add(im);
    }
  }
  buildForest() {
    this.instanceModel(
      "PineTree_1",
      TREES.filter((t, i) => t.type === "pine" && i % 2 === 0),
      16,
    );
    this.instanceModel(
      "PineTree_2",
      TREES.filter((t, i) => t.type === "pine" && i % 2 !== 0),
      15,
    );
    this.instanceModel(
      "BirchTree_Dead_1",
      TREES.filter((t) => t.type === "dead"),
      12,
    );
    const data = this.assets.treeData,
      texNames = {
        "BroadleafBark.jpg": "bark.jpg",
        "BroadleafBark_Normal.png": "bark-normal.png",
        "Broadleaf_Desktop_Atlas.png": "foliage.png",
        "Broadleaf_Desktop_Atlas_Normal.png": "foliage-normal.png",
        "Broadleaf_Desktop_Atlas_Billboards.png": "tree-lod.png",
        "Broadleaf_Desktop_Atlas_Billboards_Normal.png": "tree-lod-normal.png",
      };
    const mats = new Map(
      data.materials.map((m) => {
        const color = texNames[m.albedoTexture?.name],
          normal = texNames[m.bumpTexture?.name];
        return [
          m.id,
          new T.MeshStandardMaterial({
            map: color ? this.assets.textures[color] : null,
            normalMap: normal ? this.assets.textures[normal] : null,
            normalScale: new T.Vector2(0.5, -0.5),
            color: 0xb8bcb0,
            roughness: 1,
            alphaTest: color === "bark.jpg" ? 0 : 0.4,
            side: T.DoubleSide,
          }),
        ];
      }),
    );
    this.leafTrees = TREES.filter((t) => t.type === "broadleaf");
    this.leafLODs = [];
    for (let level = 0; level < 4; level++) {
      const m = data.meshes.find((m) => m.name === "Tree1_LOD" + level),
        g = new T.BufferGeometry();
      const p = [...m.positions],
        n = [...m.normals];
      for (let i = 2; i < p.length; i += 3) {
        p[i] *= -1;
        n[i] *= -1;
      }
      const idx = [...m.indices];
      for (let i = 0; i < idx.length; i += 3)
        [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
      g.setAttribute("position", new T.Float32BufferAttribute(p, 3));
      g.setAttribute("normal", new T.Float32BufferAttribute(n, 3));
      g.setAttribute("uv", new T.Float32BufferAttribute(m.uvs, 2));
      g.setIndex(idx);
      const multi = data.multiMaterials.find((x) => x.id === m.materialId);
      let material;
      if (multi) {
        material = multi.materials.map((id) => mats.get(id));
        for (const sm of m.subMeshes)
          g.addGroup(sm.indexStart, sm.indexCount, sm.materialIndex);
      } else material = mats.get(m.materialId);
      const im = new T.InstancedMesh(g, material, this.leafTrees.length);
      im.castShadow = level === 0 || level === 1;
      im.receiveShadow = true;
      im.frustumCulled = false;
      im.count = 0;
      this.scene.add(im);
      this.leafLODs.push(im);
    }
    this.instanceModel(
      "BushBerries_1",
      NODES.filter((n) => n.wild && n.type === "berry"),
      0.8,
    );
    const patches = TREES.filter((t, i) => i % 3 === 0).map((t) => ({
      ...t,
      x: t.x + 3,
      scale: 0.7,
    }));
    this.instanceModel("Grass", patches, 0.6);
    this.instanceModel(
      "Rock_Moss_1",
      TREES.filter((t, i) => i % 11 === 0).map((t) => ({
        ...t,
        x: t.x + 4,
        scale: 1.5,
      })),
      1.5,
    );
  }
  updateLOD() {
    const counts = [0, 0, 0, 0];
    for (const t of this.leafTrees) {
      const d = dist(this.pos, t);
      if (d > 330) continue;
      const level =
        d < 23 && this.quality === "high"
          ? 0
          : d < 55 && !this.assets.mobile
            ? 1
            : d < 145
              ? 2
              : 3;
      dummy.position.set(t.x, heightAt(t.x, t.z), t.z);
      dummy.rotation.set(
        0,
        level === 3 ? Math.atan2(this.pos.x - t.x, this.pos.z - t.z) : t.yaw,
        0,
      );
      dummy.scale.setScalar(t.scale * 0.8);
      dummy.updateMatrix();
      this.leafLODs[level].setMatrixAt(counts[level]++, dummy.matrix);
    }
    this.leafLODs.forEach((m, i) => {
      m.count = counts[i];
      m.instanceMatrix.needsUpdate = true;
    });
  }
  createActor(id, type, slot = 0) {
    const root = this.assets.model(
      type === "wolf"
        ? "Wolf"
        : type === "deer"
          ? "Deer"
          : type === "bandit"
            ? "Swat"
            : slot
              ? "Worker"
              : "Adventurer",
      type === "wolf" ? 0.9 : type === "deer" ? 1.5 : 1.82,
    );
    this.scene.add(root);
    const a = {
      root,
      type,
      mixer: new T.AnimationMixer(root),
      actions: {},
      bones: {},
      rest: {},
      mode: "",
    };
    for (const clip of root.userData.clips)
      a.actions[clip.name.split("|").pop()] = a.mixer.clipAction(clip);
    if (type === "human" || type === "bandit") {
      root.updateMatrixWorld(true);
      for (const side of ["L", "R"]) {
        const upper =
          root.getObjectByName("UpperArm" + side) ||
          root.getObjectByName("UpperArm." + side);
        const hand =
          root.getObjectByName("Hand" + side) ||
          root.getObjectByName("Hand." + side);
        if (upper && hand) {
          const from = hand
              .getWorldPosition(new T.Vector3())
              .sub(upper.getWorldPosition(new T.Vector3()))
              .normalize(),
            to = new T.Vector3(
              side === "L" ? 0.15 : -0.15,
              -1,
              0.05,
            ).normalize(),
            delta = new T.Quaternion().setFromUnitVectors(from, to),
            worldQ = upper.getWorldQuaternion(new T.Quaternion());
          upper.quaternion.copy(
            upper.parent
              .getWorldQuaternion(new T.Quaternion())
              .invert()
              .multiply(delta.multiply(worldQ)),
          );
          root.updateMatrixWorld(true);
        }
      }
      root.traverse((b) => {
        if (b.isBone && /UpperLeg|UpperArm|Head/.test(b.name)) {
          a.bones[b.name] = b;
          a.rest[b.name] = b.quaternion.clone();
        }
      });
    }
    if (type === "human" || type === "bandit") {
      a.hand = root.getObjectByName("HandR") || root.getObjectByName("Hand.R");
    }
    this.actors.set(id, a);
    return a;
  }
  animateActor(a, n, dt) {
    a.root.position.lerp(
      new T.Vector3(n.x, heightAt(n.x, n.z) + (n.airY || 0), n.z),
      Math.min(1, dt * 12),
    );
    a.root.rotation.y = n.yaw || 0;
    const moving = n.mode === "run" || n.mode === "walk" || n.moving;
    let key =
      n.hp <= 0
        ? "Death"
        : n.mode === "attack"
          ? "Attack"
          : moving
            ? n.mode === "run"
              ? "Gallop"
              : "Walk"
            : "Idle";
    if (a.mode !== key) {
      for (const action of Object.values(a.actions)) action.fadeOut(0.2);
      const action = a.actions[key] || a.actions.Idle;
      if (action) {
        action.reset().fadeIn(0.2).play();
        if (key === "Death") {
          action.setLoop(T.LoopOnce, 1);
          action.clampWhenFinished = true;
        }
      }
      a.mode = key;
    }
    a.mixer.update(dt);
    if (a.type === "human" || a.type === "bandit")
      for (const [name, bone] of Object.entries(a.bones)) {
        bone.quaternion.copy(a.rest[name]);
        if (moving && !/Head/.test(name)) {
          const side = name.endsWith("L") ? 1 : -1,
            angle =
              Math.sin(this.clock * (n.running ? 11 : 7)) *
              side *
              (/Leg/.test(name) ? 0.5 : 0.25);
          bone.rotateX(angle);
        }
      }
    if (a.hand) {
      const selected = n.selected || (a.type === "bandit" ? "pistol" : "axe");
      if (a.heldName !== selected) {
        if (a.held) a.root.remove(a.held);
        a.heldName = selected;
        const file = {
          axe: "Axe",
          spear: "Knife",
          pistol: "Pistol_1",
          shotgun: "Shotgun_1",
        }[selected];
        a.held = file
          ? this.assets.item(file, selected === "pistol" ? 0.35 : 0.65)
          : null;
        if (a.held) {
          a.root.add(a.held);
          if (selected === "pistol" || selected === "shotgun")
            a.held.rotation.y = -Math.PI / 2;
        }
      }
      if (a.held) {
        a.root.updateMatrixWorld(true);
        a.held.position.copy(
          a.root.worldToLocal(a.hand.getWorldPosition(new T.Vector3())),
        );
        a.held.position.y -= 0.1;
      }
    }
    a.root.visible = !n.harvested;
    if (n.hp <= 0 && a.type === "bandit") a.root.rotation.z = 1.5;
  }
  makeViewmodel(item) {
    this.rig.clear();
    this.viewItem = item;
    this.rig.position.set(0.27, -0.34, -0.5);
    const glove = new T.MeshStandardMaterial({
        color: 0x282c26,
        roughness: 0.95,
      }),
      sleeve = new T.MeshStandardMaterial({ color: 0x515a43, roughness: 1 });
    this.box(0.12, 0.13, 0.17, glove, 0.04, -0.04, 0.08, this.rig);
    const arm = this.mesh(
      new T.CylinderGeometry(0.065, 0.08, 0.43, 9),
      sleeve,
      0.06,
      -0.12,
      0.28,
      this.rig,
    );
    arm.rotation.x = 1.3;
    let obj;
    if (item === "pistol" || item === "shotgun") {
      obj = this.assets.item(
        item === "pistol" ? "Pistol_1" : "Shotgun_1",
        item === "pistol" ? 0.4 : 0.75,
      );
      const b = new T.Box3().setFromObject(obj).getSize(new T.Vector3());
      if (b.x > b.z) obj.rotation.y = Math.PI / 2;
      obj.position.set(0, 0.03, -0.12);
    } else if (item === "axe") {
      obj = this.assets.item("Axe", 0.72);
      obj.rotation.set(0.05, 0.15, -0.25);
      obj.position.set(0.06, -0.24, -0.12);
    } else if (item === "spear") {
      obj = new T.Group();
      const shaft = this.mesh(
        new T.CylinderGeometry(0.02, 0.025, 1.25, 8),
        this.wood,
        0,
        0.3,
        -0.1,
        obj,
      );
      shaft.rotation.x = -0.4;
      const blade = this.assets.item("Knife", 0.35);
      blade.position.set(0, 0.9, -0.35);
      obj.add(blade);
      obj.rotation.z = -0.25;
    }
    if (obj) this.rig.add(obj);
  }
  sync(state) {
    this.state = state;
    for (const [id, m] of this.nodeMeshes)
      m.visible = !(state.depleted[id] > state.time);
    for (const f of state.fires) {
      let o = this.fireMeshes.get(f.id);
      if (!o) {
        o = new T.Group();
        o.position.set(f.x, heightAt(f.x, f.z), f.z);
        this.scene.add(o);
        const off = this.assets.model("Bonfire", 0.5),
          on = this.assets.model("Bonfire_Fire", 0.9);
        o.add(off, on);
        const light = new T.PointLight(0xff7f30, 45, 16, 2);
        light.position.y = 0.8;
        o.add(light);
        o.userData = { off, on, light };
        this.fireMeshes.set(f.id, o);
      }
      o.userData.off.visible = f.fuel <= 0;
      o.userData.on.visible = f.fuel > 0;
      o.userData.light.intensity = f.fuel > 0 ? 40 : 0;
    }
    const active = new Set();
    for (const d of state.drops) {
      active.add(d.id);
      if (!this.dropMeshes.has(d.id)) {
        const m = this.place("Backpack", d.x, d.z, 0.7);
        this.dropMeshes.set(d.id, m);
      }
    }
    for (const [id, m] of this.dropMeshes)
      if (!active.has(id)) {
        this.scene.remove(m);
        this.dropMeshes.delete(id);
      }
    for (const n of [
      ...state.players.filter((p) => p.id !== "self"),
      ...state.npcs,
    ])
      if (!this.actors.has(n.id))
        this.createActor(n.id, n.type || "human", n.slot);
    const actorIDs = new Set(
      [...state.players.filter((p) => p.id !== "self"), ...state.npcs].map(
        (n) => n.id,
      ),
    );
    for (const [id, a] of this.actors)
      if (!id.startsWith("menu-") && !actorIDs.has(id)) {
        this.scene.remove(a.root);
        this.actors.delete(id);
      }
    this.beacon.material.color.set(state.radio.active ? 0x9cda76 : 0xc83e2a);
  }
  resize() {
    const w = innerWidth,
      h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(
      Math.min(
        devicePixelRatio,
        this.assets.mobile ? 1.15 : this.quality === "high" ? 1.6 : 1,
      ),
    );
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = w / h;
    this.viewCamera.updateProjectionMatrix();
  }
  render(dt, self) {
    this.clock += dt;
    this.foam.offset.y -= dt * 0.025;
    this.sky.position.copy(this.camera.position);
    if (this.playing && self) {
      const f = Math.min(1, dt * 14);
      this.pos.x += (self.x - this.pos.x) * f;
      this.pos.z += (self.z - this.pos.z) * f;
      const bob = self.moving
        ? Math.sin(this.clock * (self.running ? 12 : 8)) * 0.035
        : 0;
      this.camera.position.set(
        this.pos.x,
        heightAt(this.pos.x, this.pos.z) + 1.68 + (self.airY || 0) + bob,
        this.pos.z,
      );
      this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
      if (this.viewItem !== self.selected) this.makeViewmodel(self.selected);
      const shot = Math.max(0, 1 - (this.clock - (this.shotTime || -10)) / 0.3);
      this.rig.rotation.set(
        -shot * 0.35,
        0,
        Math.sin(this.clock * 8) * (self.moving ? 0.025 : 0.005) +
          (self.selected === "axe" ? shot * 0.8 : 0),
      );
      this.rig.position.y =
        -0.34 +
        (self.moving ? Math.sin(this.clock * 9) * 0.012 : 0) -
        shot * 0.03;
    } else {
      this.camera.position.set(
        -8 + Math.sin(this.clock * 0.035) * 1.2,
        heightAt(-8, 64) + 3.4,
        64,
      );
      this.camera.lookAt(2, 2.1, 37);
      this.pos = { x: this.camera.position.x, z: this.camera.position.z };
    }
    this.menuActors.forEach((a) => (a.root.visible = !this.playing));
    if (this.state) {
      for (const n of [
        ...this.state.players.filter((p) => p.id !== "self"),
        ...this.state.npcs,
      ]) {
        const a = this.actors.get(n.id);
        if (a) this.animateActor(a, n, dt);
      }
      const daylight = Math.max(
        0.1,
        Math.min(
          1,
          Math.sin(((this.state.hour - 5) / 12) * Math.PI) * 0.8 + 0.3,
        ),
      );
      this.scene.environmentIntensity = 0.35 + daylight * 0.5;
      this.sun.intensity = daylight * 2.5;
      this.hemi.intensity = 0.3 + daylight * 1.1;
      this.scene.fog.far = this.state.storm ? 175 : 330;
    }
    if (this.clock - this.lastLOD > 0.5) {
      this.updateLOD();
      this.lastLOD = this.clock;
    }
    this.sun.position.set(this.pos.x + 60, 100, this.pos.z - 60);
    this.sun.target.position.set(this.pos.x, 0, this.pos.z);
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);
    if (this.playing) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.viewScene, this.viewCamera);
      this.renderer.autoClear = true;
    }
  }
  shot() {
    this.shotTime = this.clock;
  }
}
