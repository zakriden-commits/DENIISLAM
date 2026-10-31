import test from "node:test";
import assert from "node:assert/strict";
import { FirstPersonView } from "../src/first-person.js";
globalThis.innerWidth = 844;
globalThis.innerHeight = 390;
function setup() {
  const calls = [];
  const renderer = {
    autoClear: true,
    clearDepth() {
      calls.push("depth");
    },
    render() {
      calls.push("render");
    },
  };
  return { view: new FirstPersonView(renderer), renderer, calls };
}
const pose = {
  selected: "fist",
  carrying: false,
  moving: false,
  running: false,
  reload: false,
  looting: false,
  sleep: 0,
  slot: 0,
};
test("first-person hands have an independent foreground camera and correct phone aspect", () => {
  const { view, renderer, calls } = setup();
  view.update(pose, 1);
  assert.equal(view.camera.aspect, 844 / 390);
  assert.equal(view.camera.near, 0.015);
  assert.equal(view.left.visible, true);
  assert.equal(view.right.visible, true);
  view.render();
  assert.deepEqual(calls, ["depth", "render"]);
  assert.equal(renderer.autoClear, true);
  view.resize(390, 844);
  assert.equal(view.camera.aspect, 390 / 844);
});
test("fist moves forward when punching; firearm recoils and flashes instead", () => {
  const { view } = setup();
  view.update(pose, 1);
  const neutral = view.right.position.z;
  view.attack(1);
  view.update(pose, 1.05);
  assert.ok(view.right.position.z < neutral);
  view.update({ ...pose, selected: "pistol" }, 2);
  const gunNeutral = view.right.position.z;
  view.attack(2);
  view.update({ ...pose, selected: "pistol" }, 2.03);
  assert.ok(view.right.position.z > gunNeutral);
  assert.equal(view.flash.visible, true);
  view.update({ ...pose, selected: "pistol" }, 2.5);
  assert.equal(view.flash.visible, false);
});
test("waking hides hands; reloading and looting show the supporting hand", () => {
  const { view } = setup();
  view.update({ ...pose, sleep: 3 }, 1);
  assert.equal(view.root.visible, false);
  view.update({ ...pose, selected: "smg" }, 4);
  assert.equal(view.root.visible, true);
  assert.equal(view.left.visible, false);
  view.update({ ...pose, selected: "smg", reload: true }, 4.2);
  assert.equal(view.left.visible, true);
  assert.equal(view.right.rotation.z, -0.45);
  view.update({ ...pose, selected: "bag", looting: true }, 5);
  assert.equal(view.item, "bag");
  assert.equal(view.left.visible, true);
});
test("carrying crates replaces the equipped weapon in the foreground", () => {
  const { view } = setup();
  view.update({ ...pose, selected: "pistol", carrying: true }, 1);
  assert.equal(view.item, "crate");
  view.update({ ...pose, selected: "pistol", carrying: false }, 2);
  assert.equal(view.item, "pistol");
});
