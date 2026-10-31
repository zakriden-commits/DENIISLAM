// Gate the actual distributable, not an uncompressed directory or a claimed size.
import { statSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const apk = process.argv[2];
assert.ok(apk, "Usage: node scripts/check-apk.mjs app.apk");
const size = statSync(apk).size;
assert.ok(
  size >= 30 * 1024 * 1024,
  `APK is only ${size} bytes; minimum is 30 MiB`,
);
const manifest = JSON.parse(
  readFileSync("public/assets/manifest.json", "utf8"),
);
for (const a of manifest) {
  const bytes = execFileSync(
    "unzip",
    ["-p", apk, "assets/public/assets/" + a.file],
    { maxBuffer: 20 * 1024 * 1024 },
  );
  assert.equal(bytes.length, a.bytes, a.file);
  assert.equal(
    createHash("sha1")
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest("hex"),
    a.sha,
    a.file + " intact",
  );
}
console.log(
  `Verified actual APK: ${size} bytes / ${(size / 1024 / 1024).toFixed(2)} MiB; all ${manifest.length} licensed runtime assets intact.`,
);
