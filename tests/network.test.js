import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { RoomConnection } from "../src/connection.js";
function client(port, token, role) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/online`),
    queue = [],
    waiters = [];
  ws.on("open", () => ws.send(JSON.stringify({ type: "join", token, role })));
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw);
    queue.push(msg);
    for (const w of [...waiters])
      if (w.check(msg)) {
        w.done(msg);
        waiters.splice(waiters.indexOf(w), 1);
      }
  });
  return {
    ws,
    latest() {
      return [...queue].reverse().find((m) => m.type === "state");
    },
    wait(check) {
      const found = queue.find(check);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error("WebSocket message timeout")),
          6000,
        );
        waiters.push({
          check,
          done: (msg) => {
            clearTimeout(timer);
            resolve(msg);
          },
        });
      });
    },
  };
}
test(
  "real server: two clients share room, signaling relays, third rejected, disk save survives restart",
  { timeout: 20000 },
  async () => {
    const data = await mkdtemp(join(tmpdir(), "deni-islam-test-")),
      port = 3191,
      token1 = "10000000-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      token2 = "20000000-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    let process,
      connections = [],
      auto;
    async function start() {
      process = spawn("node", ["server/index.js"], {
        env: {
          ...global.process.env,
          NODE_ENV: "production",
          PORT: String(port),
          DATA_DIR: data,
          RECONNECT_GRACE_MS: "600",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let log = "";
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error("Server start timeout: " + log)),
          6000,
        );
        process.stdout.on("data", (raw) => {
          log += raw;
          if (log.includes("one room")) {
            clearTimeout(timer);
            resolve();
          }
        });
        process.on("exit", (code) => {
          if (code) {
            clearTimeout(timer);
            reject(Error("Server exited " + code));
          }
        });
      });
    }
    async function stop() {
      const child = process;
      if (!child || child.exitCode !== null) return;
      await new Promise((resolve) => {
        child.once("exit", resolve);
        child.kill("SIGTERM");
      });
    }
    try {
      await start();
      const a = client(port, token1, "deni");
      connections.push(a.ws);
      assert.equal((await a.wait((m) => m.type === "welcome")).slot, 0);
      const b = client(port, token2, "islam");
      connections.push(b.ws);
      assert.equal((await b.wait((m) => m.type === "welcome")).slot, 1);
      const sa = await a.wait(
        (m) => m.type === "state" && m.players.length === 2,
      );
      assert.deepEqual(
        sa.players.map((p) => p.name),
        ["Deni", "Islam"],
      );
      assert.equal(sa.self.balance, 200);
      assert.equal(sa.players.filter((p) => p.id === "self").length, 1);
      assert.ok(!JSON.stringify(sa).includes(token2));
      const c = client(port, "30000000-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "deni");
      connections.push(c.ws);
      assert.match((await c.wait((m) => m.type === "error")).text, /заполнен/);
      a.ws.send(
        JSON.stringify({ type: "signal", data: { test: "voice-check" } }),
      );
      assert.equal(
        (await b.wait((m) => m.type === "signal")).data.test,
        "voice-check",
      );
      const health = await (
        await fetch(`http://127.0.0.1:${port}/api/health`)
      ).json();
      assert.equal(health.players, 2);
      // A network interruption must reserve the slot and resume the SAME player object.
      await new Promise((resolve) => setTimeout(resolve, 3200));
      const move = setInterval(
        () => a.ws.send(JSON.stringify({ type: "input", x: 1, z: 0, aim: 0 })),
        50,
      );
      await new Promise((resolve) => setTimeout(resolve, 650));
      clearInterval(move);
      a.ws.send(JSON.stringify({ type: "input", x: 0, z: 0, aim: 0 }));
      await new Promise((resolve) => setTimeout(resolve, 130));
      const before = a.latest();
      assert.ok(before.players.find((p) => p.id === "self").x > -23.5);
      a.ws.terminate();
      await b.wait((m) => m.type === "peerLeft" && m.temporary === true);
      const resumed = client(port, token1, "deni");
      connections.push(resumed.ws);
      assert.equal(
        (await resumed.wait((m) => m.type === "welcome")).resumed,
        true,
      );
      const after = await resumed.wait((m) => m.type === "state");
      assert.equal(after.self.balance, before.self.balance);
      assert.ok(
        Math.abs(
          after.players.find((p) => p.id === "self").x -
            before.players.find((p) => p.id === "self").x,
        ) < 0.45,
      );
      assert.equal(after.self.sleep < 3, true);
      // Take over a half-dead / stale connection without a duplicate-profile failure.
      const moved = new Promise((resolve) =>
        resumed.ws.once("close", (code) => resolve(code)),
      );
      const takeover = client(port, token1, "deni");
      connections.push(takeover.ws);
      assert.equal(
        (await takeover.wait((m) => m.type === "welcome")).resumed,
        true,
      );
      assert.equal(await moved, 4001);
      takeover.ws.send(JSON.stringify({ type: "ping", at: 123 }));
      assert.equal((await takeover.wait((m) => m.type === "pong")).at, 123);
      // Deliberate exit releases the slot immediately; it is not treated as an outage.
      b.ws.send(JSON.stringify({ type: "leave" }));
      await takeover.wait(
        (m) => m.type === "peerLeft" && m.temporary === false,
      );
      const h2 = await (
        await fetch(`http://127.0.0.1:${port}/api/health`)
      ).json();
      assert.equal(h2.players, 1);
      assert.equal(h2.reserved, 0);
      // Expired grace saves and frees the disconnected player's slot.
      takeover.ws.terminate();
      await new Promise((resolve) => setTimeout(resolve, 850));
      const h3 = await (
        await fetch(`http://127.0.0.1:${port}/api/health`)
      ).json();
      assert.equal(h3.players, 0);
      assert.equal(h3.reserved, 0);
      await stop();
      const saved = JSON.parse(await readFile(join(data, "save.json"), "utf8"));
      assert.equal(saved.profiles[token1].balance, 200);
      assert.equal(saved.profiles[token2].slot, 1);
      await start();
      const again = client(port, token1, "deni");
      connections.push(again.ws);
      const restored = await again.wait((m) => m.type === "state");
      assert.equal(restored.self.balance, 200);
      assert.equal(restored.players[0].name, "Deni");
      // The production reconnecting client also resumes against a REAL server.
      let welcomes = 0;
      const firstWelcome = new Promise((resolve) => {
        auto = new RoomConnection({
          url: `ws://127.0.0.1:${port}/online`,
          credentials: () => ({ token: token1, role: "deni" }),
          WebSocketImpl: WebSocket,
          retryBase: 15,
          retryMax: 30,
          onMessage: (m) => {
            if (m.type === "welcome") {
              welcomes++;
              if (welcomes === 1) resolve(m);
            }
          },
          onTerminal: (e) => {
            throw Error(e);
          },
        });
      });
      auto.start();
      assert.equal((await firstWelcome).resumed, true);
      const previous = auto.socket;
      const secondWelcome = new Promise((resolve) => {
        const handler = auto.onMessage;
        auto.onMessage = (m) => {
          handler(m);
          if (m.type === "welcome" && welcomes === 2) resolve(m);
        };
      });
      previous.terminate();
      assert.equal((await secondWelcome).resumed, true);
      assert.notEqual(auto.socket, previous);
      auto.stop();
    } finally {
      auto?.stop();
      for (const ws of connections) ws.terminate();
      await stop();
      await rm(data, { recursive: true, force: true });
    }
  },
);
