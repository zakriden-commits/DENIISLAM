import * as THREE from "three";
import { box, weaponModel } from "./world.js";

// Dedicated foreground pass: hands remain readable at low resolution and never
// clip through nearby walls. The local full-body avatar is hidden in world space.
export class FirstPersonView {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      62,
      innerWidth / innerHeight,
      0.015,
      8,
    );
    this.scene.add(new THREE.HemisphereLight("#d5d7d5", "#39332e", 2.1));
    const key = new THREE.DirectionalLight("#e6cda7", 2);
    key.position.set(-2, 3, 2);
    this.scene.add(key);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.item = null;
    this.lastAttack = -100;
  }
  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  attack(time) {
    this.lastAttack = time;
  }
  equip(item, slot) {
    if (this.item === item && this.slot === slot) return;
    this.item = item;
    this.slot = slot;
    this.root.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry.dispose();
        if (obj.material.userData.viewOwned) obj.material.dispose();
      }
    });
    this.root.clear();
    this.left = new THREE.Group();
    this.right = new THREE.Group();
    this.root.add(this.left, this.right);
    const sleeve = slot ? "#51534e" : "#28302f";
    for (const [hand, side] of [
      [this.left, -1],
      [this.right, 1],
    ]) {
      // Forearm extends toward the bottom corners, with a cuff and articulated knuckles.
      const forearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.07, 0.48, 6),
        new THREE.MeshStandardMaterial({ color: sleeve, roughness: 1 }),
      );
      forearm.material.userData.viewOwned = true;
      forearm.position.set(side * 0.07, -0.13, 0.22);
      forearm.rotation.x = Math.PI / 2;
      forearm.rotation.z = side * 0.1;
      hand.add(forearm);
      box(
        hand,
        0.15,
        0.04,
        0.09,
        0,
        -0.03,
        0.035,
        slot ? "#a6a79c" : "#c2bdb0",
      );
      const fist = weaponModel("fist");
      fist.rotation.y = Math.PI;
      hand.add(fist);
      if (slot)
        for (let i = 0; i < 2; i++)
          box(
            hand,
            0.15,
            0.018,
            0.4,
            side * 0.07,
            -0.043 - i * 0.04,
            0.26,
            "#b6b7ac",
          );
    }
    if (item !== "fist") {
      const model = item === "crate" ? new THREE.Group() : weaponModel(item);
      if (item === "crate") {
        box(model, 0.65, 0.48, 0.45, 0, 0, 0, "#8b7757");
        for (const s of [-1, 1])
          box(model, 0.055, 0.5, 0.46, s * 0.23, 0, 0, "#514b3b");
      }
      model.rotation.y = Math.PI;
      if (item === "bag" || item === "crate") {
        model.position.set(0, -0.4, -0.68);
        this.root.add(model);
      } else {
        model.position.set(0, 0.1, -0.07);
        this.right.add(model);
      }
    }
    this.flash = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.07),
      new THREE.MeshBasicMaterial({
        color: "#ffd994",
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      }),
    );
    this.flash.material.userData.viewOwned = true;
    this.flash.position.set(0, 0.22, item === "smg" ? -0.65 : -0.42);
    this.right.add(this.flash);
    this.flash.visible = false;
  }
  update(
    { selected, carrying, moving, running, reload, looting, sleep, slot },
    time,
  ) {
    this.equip(carrying ? "crate" : selected || "fist", slot);
    const gun = !carrying && (selected === "pistol" || selected === "smg");
    const age = time - this.lastAttack;
    const kick = age >= 0 && age < 0.28 ? Math.sin((age / 0.28) * Math.PI) : 0;
    const step = moving
      ? Math.sin(time * (running ? 13 : 9))
      : Math.sin(time * 1.5) * 0.12;
    this.root.position.set(step * 0.009, Math.abs(step) * -0.012, 0);
    this.left.position.set(-0.27, -0.29, -0.74);
    this.right.position.set(
      0.27,
      -0.29 + (gun ? kick * 0.025 : 0),
      -0.73 + (gun ? kick * 0.1 : -kick * 0.3),
    );
    this.left.rotation.set(-0.05, -0.12, -0.08);
    this.right.rotation.set(gun ? kick * 0.13 : -kick * 0.3, 0.08, 0.07);
    this.left.visible = !gun || reload || looting;
    if (selected === "bag" || carrying) {
      this.left.position.set(-0.29, -0.4, -0.6);
      this.right.position.set(0.29, -0.4, -0.6);
    }
    if (looting) {
      this.right.position.z -= Math.max(0, Math.sin(time * 5)) * 0.16;
      this.left.position.z -= Math.max(0, Math.sin(time * 5 + Math.PI)) * 0.12;
    }
    if (reload) {
      this.right.rotation.z = -0.45;
      this.right.position.y -= 0.1;
      this.left.position.set(0.08, -0.3 + Math.sin(time * 8) * 0.03, -0.55);
    }
    this.root.visible = !sleep;
    this.flash.visible = gun && age >= 0 && age < 0.065;
  }
  render() {
    const previous = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
    this.renderer.autoClear = previous;
  }
}
