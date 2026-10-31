import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { RoomConnection } from "../src/connection.js";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function client(port, token, role, version = 3) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/online`),
    messages = [];
  ws.on("open", () =>
    ws.send(JSON.stringify({ type: "join", token, role, version })),
  );
  ws.on("message", (raw) => messages.push(JSON.parse(raw)));
  return {
    ws,
    messages,
    async wait(check) {
      for (let i = 0; i < 100; i++) {
        const m = messages.find(check);
        if (m) return m;
        await delay(50);
      }
      throw Error("Message timeout: " + JSON.stringify(messages.slice(0, 3)));
    },
  };
}
test(
  "real WebSocket server: protocol, 2 clients, signaling, takeover, reconnect, save/restart",
  { timeout: 30000 },
  async () => {
    const data = await mkdtemp(join(tmpdir(), "nf-network-")),
      port = 3191,
      aToken = "10000000-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      bToken = "20000000-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    let child;
    const sockets = [];
    async function start() {
      child = spawn("node", ["server/index.js"], {
        env: {
          ...process.env,
          NODE_ENV: "production",
          PORT: String(port),
          DATA_DIR: data,
          RECONNECT_GRACE_MS: "500",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let log = "";
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(Error("Startup: " + log)), 6000);
        child.stdout.on("data", (d) => {
          log += d;
          if (log.includes("one room")) {
            clearTimeout(t);
            resolve();
          }
        });
        child.stderr.on("data", (d) => (log += d));
      });
    }
    async function stop() {
      if (child && child.exitCode === null)
        await new Promise((r) => {
          child.once("exit", r);
          child.kill("SIGTERM");
        });
    }
    const add = (...args) => {
      const c = client(port, ...args);
      sockets.push(c.ws);
      return c;
    };
    try {
      await start();
      const h = await (
        await fetch(`http://127.0.0.1:${port}/api/health`)
      ).json();
      assert.equal(h.version, "0.3.0");
      const old = add(aToken, "deni", 2);
      assert.match(
        (await old.wait((m) => m.type === "error")).text,
        /устарела/,
      );
      const a = add(aToken, "deni"),
        b = add(bToken, "islam");
      assert.equal((await a.wait((m) => m.type === "welcome")).slot, 0);
      assert.equal((await b.wait((m) => m.type === "welcome")).slot, 1);
      const s = await a.wait(
        (m) => m.type === "state" && m.players.length === 2,
      );
      assert.equal(s.self.inventory.axe, 1);
      const third = add("30000000-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "deni");
      assert.match(
        (await third.wait((m) => m.type === "error")).text,
        /заняты/,
      );
      a.ws.send(
        JSON.stringify({
          type: "signal",
          data: { description: { type: "offer", sdp: "test" } },
        }),
      );
      assert.equal(
        (await b.wait((m) => m.type === "signal")).data.description.sdp,
        "test",
      );
      const replacement = add(aToken, "deni");
      assert.equal(
        (await replacement.wait((m) => m.type === "welcome")).resumed,
        true,
      );
      await delay(100);
      assert.equal(
        (await (await fetch(`http://127.0.0.1:${port}/api/health`)).json())
          .players,
        2,
      );
      replacement.ws.terminate();
      await delay(100);
      assert.equal(
        (await (await fetch(`http://127.0.0.1:${port}/api/health`)).json())
          .reserved,
        1,
      );
      const resumed = add(aToken, "deni");
      assert.equal(
        (await resumed.wait((m) => m.type === "welcome")).resumed,
        true,
      );
      resumed.ws.send(JSON.stringify({ type: "leave" }));
      b.ws.send(JSON.stringify({ type: "leave" }));
      await delay(150);
      await stop();
      const save = JSON.parse(
        await readFile(join(data, "survival-save.json"), "utf8"),
      );
      assert.equal(save.schema, 3);
      assert.equal(save.profiles[aToken].inventory.axe, 1);
      await start();
      const back = add(aToken, "deni");
      assert.equal(
        (await back.wait((m) => m.type === "state")).self.inventory.food,
        2,
      );
      back.ws.terminate();
      await delay(650);
      let welcomes = 0;
      const auto = new RoomConnection({
        url: `ws://127.0.0.1:${port}/online`,
        credentials: () => ({ token: aToken, role: "deni", version: 3 }),
        WebSocketImpl: WebSocket,
        retryBase: 20,
        retryMax: 50,
        heartbeatEvery: 100,
        onMessage: (m) => {
          if (m.type === "welcome") welcomes++;
        },
      });
      auto.start();
      for (let i = 0; i < 100 && !welcomes; i++) await delay(20);
      assert.equal(welcomes, 1);
      auto.socket.terminate();
      for (let i = 0; i < 100 && welcomes < 2; i++) await delay(20);
      assert.equal(welcomes, 2);
      auto.stop();
    } finally {
      for (const ws of sockets) ws.terminate();
      await stop();
      await rm(data, { recursive: true, force: true });
    }
  },
);
