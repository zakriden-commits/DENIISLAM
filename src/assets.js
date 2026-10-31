import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
export class Assets {
  constructor(renderer) {
    this.renderer = renderer;
    this.models = {};
    this.textures = {};
    this.mobile = matchMedia("(pointer:coarse)").matches;
  }
  async load(progress) {
    const base = import.meta.env.BASE_URL + "assets/";
    this.base = base;
    const manifest = await (await fetch(base + "manifest.json")).json();
    const total = manifest.reduce((s, a) => s + a.bytes, 0);
    let done = 0;
    const gltf = new GLTFLoader(),
      tex = new THREE.TextureLoader();
    const load = async (a) => {
      if (a.file.endsWith(".glb"))
        this.models[a.file.slice(0, -4)] = await gltf.loadAsync(base + a.file);
      else if (a.file === "forest.hdr") {
        const hdr = await new RGBELoader().loadAsync(base + a.file);
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.environment = pmrem.fromEquirectangular(hdr).texture;
        hdr.dispose();
        pmrem.dispose();
      } else if (a.file === "trees.json")
        this.treeData = await (await fetch(base + a.file)).json();
      else if (/\.(png|jpg)$/.test(a.file)) {
        const t = await tex.loadAsync(base + a.file);
        const cap = this.mobile ? 1024 : 2048;
        if (Math.max(t.image.width, t.image.height) > cap) {
          const c = document.createElement("canvas"),
            ratio = cap / Math.max(t.image.width, t.image.height);
          c.width = Math.round(t.image.width * ratio);
          c.height = Math.round(t.image.height * ratio);
          c.getContext("2d").drawImage(t.image, 0, 0, c.width, c.height);
          t.image = c;
          t.needsUpdate = true;
        }
        if (!/(normal|rough)/.test(a.file)) t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = Math.min(
          4,
          this.renderer.capabilities.getMaxAnisotropy(),
        );
        this.textures[a.file] = t;
      } else if (a.file.endsWith(".mp3")) {
        const blob = await (await fetch(base + a.file)).blob();
        this.ambience = URL.createObjectURL(blob);
      }
      done += a.bytes;
      progress(done / total, done, total);
    };
    const queue = [...manifest];
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (queue.length) await load(queue.shift());
      }),
    );
  }
  model(name, height = 1) {
    const src = this.models[name];
    if (!src) return new THREE.Group();
    const obj = clone(src.scene),
      wrap = new THREE.Group();
    wrap.add(obj);
    obj.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(obj),
      size = b.getSize(new THREE.Vector3());
    const s = height / (size.y || 1);
    obj.scale.multiplyScalar(s);
    obj.position.set(
      (-(b.min.x + b.max.x) / 2) * s,
      -b.min.y * s,
      (-(b.min.z + b.max.z) / 2) * s,
    );
    obj.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    wrap.userData.clips = src.animations;
    return wrap;
  }
  item(name, size = 0.6) {
    const model = this.model(name, 1),
      b = new THREE.Box3().setFromObject(model),
      v = b.getSize(new THREE.Vector3());
    model.scale.setScalar(size / Math.max(v.x, v.y, v.z));
    return model;
  }
  texture(name, repeat) {
    const t = this.textures[name].clone();
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
    }
    t.needsUpdate = true;
    return t;
  }
}
