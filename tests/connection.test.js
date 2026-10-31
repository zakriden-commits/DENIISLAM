import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { RoomConnection } from "../src/connection.js";

class FakeSocket {
  static sockets = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.bufferedAmount = 0;
    this.sent = [];
    FakeSocket.sockets.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  send(text) {
    this.sent.push(JSON.parse(text));
  }
  receive(data) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  close(code = 1000) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    queueMicrotask(() => this.onclose?.({ code }));
  }
  drop() {
    this.close(1006);
  }
}
async function until(check) {
  const deadline = Date.now() + 1000;
  while (!check()) {
    if (Date.now() > deadline) throw Error("Condition timeout");
    await delay(5);
  }
}
function setup(options = {}) {
  const messages = [],
    statuses = [],
    errors = [];
  const c = new RoomConnection({
    url: "wss://game.example/online",
    credentials: () => ({
      token: "private-profile",
      role: "deni",
      code: "room",
    }),
    WebSocketImpl: FakeSocket,
    retryBase: 10,
    retryMax: 20,
    connectTimeout: 1000,
    heartbeatEvery: 1000,
    onMessage: (m) => messages.push(m),
    onStatus: (s) => statuses.push(s),
    onTerminal: (e) => errors.push(e),
    ...options,
  });
  return { c, messages, statuses, errors };
}
function welcome(c) {
  c.socket.open();
  c.socket.receive({ type: "welcome", slot: 0 });
  c.socket.receive({ type: "state", self: {} });
}

test("sends credentials only after open; gameplay only after welcome", () => {
  const { c, messages, statuses } = setup();
  try {
    c.start();
    assert.equal(c.send({ type: "shoot" }), false);
    c.socket.open();
    assert.equal(c.socket.sent[0].type, "join");
    assert.equal(c.socket.sent[0].code, "room");
    c.socket.receive({ type: "welcome" });
    assert.equal(c.send({ type: "input", x: 1 }), true);
    assert.equal(messages[0].type, "welcome");
    assert.equal(statuses.at(-1).phase, "connected");
  } finally {
    c.stop();
  }
});
test("network drop reconnects automatically; old socket events cannot corrupt resumed session", async () => {
  const { c, errors } = setup();
  try {
    c.start();
    welcome(c);
    const old = c.socket;
    old.drop();
    await until(() => c.socket && c.socket !== old);
    const replacement = c.socket;
    welcome(c);
    old.receive({ type: "error", text: "old connection" });
    old.onclose?.({ code: 1008 });
    assert.equal(c.socket, replacement);
    assert.equal(c.joined, true);
    assert.deepEqual(errors, []);
    assert.equal(c.attempt, 0);
  } finally {
    c.stop();
  }
});
test("stalled snapshots reconnect even if pong messages keep arriving", async () => {
  const { c } = setup({ heartbeatEvery: 10, staleTimeout: 25 });
  try {
    c.start();
    welcome(c);
    const old = c.socket;
    const pong = setInterval(() => old.receive({ type: "pong" }), 5);
    try {
      await until(() => c.socket !== old);
      assert.equal(c.joined, false);
    } finally {
      clearInterval(pong);
    }
  } finally {
    c.stop();
  }
});
test("normal foreground event leaves healthy connection alone, stale foreground replaces it", () => {
  const { c } = setup();
  try {
    c.start();
    welcome(c);
    const old = c.socket;
    c.wake();
    assert.equal(c.socket, old);
    c.lastState = Date.now() - 10000;
    c.wake();
    assert.notEqual(c.socket, old);
  } finally {
    c.stop();
  }
});
test("authorization errors stop retries and explain the cause", async () => {
  const { c, errors } = setup();
  c.start();
  c.socket.open();
  const old = c.socket;
  old.receive({ type: "error", text: "Неверный код комнаты." });
  await delay(30);
  assert.equal(c.wanted, false);
  assert.equal(c.socket, null);
  assert.deepEqual(errors, ["Неверный код комнаты."]);
});
test("session takeover does not enter a reconnect fight with the other window", async () => {
  const { c, errors } = setup();
  c.start();
  welcome(c);
  c.socket.close(4001);
  await delay(30);
  assert.equal(c.wanted, false);
  assert.match(errors[0], /другом окне/);
});
test("explicit exit sends leave, closes socket and cancels scheduled reconnect", async () => {
  const { c } = setup();
  c.start();
  welcome(c);
  const old = c.socket;
  c.stop();
  assert.equal(old.sent.at(-1).type, "leave");
  assert.equal(c.wanted, false);
  c.start();
  welcome(c);
  c.socket.drop();
  await delay(1);
  c.stop();
  const count = FakeSocket.sockets.length;
  await delay(40);
  assert.equal(FakeSocket.sockets.length, count);
  assert.equal(c.joined, false);
});
test("unresponsive connection attempt times out instead of hanging forever", async () => {
  const { c } = setup({ connectTimeout: 20 });
  try {
    c.start();
    const old = c.socket;
    await until(() => c.socket !== old);
    assert.equal(old.readyState, 3);
  } finally {
    c.stop();
  }
});
