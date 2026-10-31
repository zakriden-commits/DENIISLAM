import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as T from "three";
import { Assets } from "../src/assets.js";
test("useful asset pack is pinned, licensed, intact and over 30 MiB even after compression", () => {
  const list = JSON.parse(readFileSync("public/assets/manifest.json"));
  let compressed = 0;
  for (const a of list) {
    const b = readFileSync("public/assets/" + a.file);
    assert.equal(b.length, a.bytes);
    assert.equal(
      createHash("sha1").update(`blob ${b.length}\0`).update(b).digest("hex"),
      a.sha,
    );
    assert.ok(["CC0-1.0", "CC-BY-4.0"].includes(a.license));
    compressed += deflateRawSync(b).length;
  }
  assert.ok(compressed > 30 * 1024 * 1024, `Compressed pack ${compressed}`);
});
test("skinned player/enemy bounds are updated BEFORE normalization; people and animals are visible at real scale", async () => {
  for (const [name, height] of [
    ["Adventurer", 1.82],
    ["Worker", 1.82],
    ["Swat", 1.82],
    ["Wolf", 0.9],
    ["Deer", 1.5],
  ]) {
    const b = readFileSync("public/assets/" + name + ".glb"),
      gltf = await new GLTFLoader().parseAsync(
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
        "",
      );
    const a = Object.create(Assets.prototype);
    a.models = { [name]: gltf };
    const m = a.model(name, height);
    m.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(m);
    assert.ok(Math.abs(box.getSize(new T.Vector3()).y - height) < 0.001, name);
    assert.ok(Math.abs(box.min.y) < 0.001, name + " on ground");
  }
});
