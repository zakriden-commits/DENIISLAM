import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
const data = await mkdtemp(join(tmpdir(), "di-browser-game-"));
const server = spawn("node", ["server/index.js"], {
  env: { ...process.env, PORT: "3177", NODE_ENV: "production", DATA_DIR: data },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Test server did not start: " + log)),
      10000,
    );
    server.stdout.on("data", (raw) => {
      log += raw;
      if (log.includes("one room")) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.stderr.on("data", (raw) => {
      log += raw;
    });
    server.once("exit", (code) => {
      if (code) {
        clearTimeout(timer);
        reject(Error("Test server exited: " + log));
      }
    });
  });
  const browser = spawn("node", ["tests/browser-check.js"], {
    env: { ...process.env, BASE_URL: "http://127.0.0.1:3177" },
    stdio: "inherit",
  });
  const [code] = await once(browser, "exit");
  process.exitCode = code || 0;
} finally {
  if (server.exitCode === null) {
    const closed = once(server, "exit");
    server.kill("SIGTERM");
    await closed;
  }
  await rm(data, { recursive: true, force: true });
}
