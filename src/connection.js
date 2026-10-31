// A reconnecting game session, independent of rendering / animation frames.
// Browser timers may pause in the background; wake() recovers on foreground/online.
export class RoomConnection {
  constructor({
    url,
    credentials,
    onMessage,
    onStatus = () => {},
    onTerminal = () => {},
    WebSocketImpl = globalThis.WebSocket,
    connectTimeout = 20000,
    staleTimeout = 15000,
    retryBase = 1000,
    retryMax = 15000,
    heartbeatEvery = 5000,
  }) {
    Object.assign(this, {
      url,
      credentials,
      onMessage,
      onStatus,
      onTerminal,
      WebSocketImpl,
      connectTimeout,
      staleTimeout,
      retryBase,
      retryMax,
      heartbeatEvery,
    });
    this.socket = null;
    this.wanted = false;
    this.joined = false;
    this.attempt = 0;
    this.epoch = 0;
    this.lastState = 0;
  }
  start() {
    if (this.wanted) return;
    this.wanted = true;
    this.attempt = 0;
    this.connect();
  }
  clearTimers() {
    clearTimeout(this.retryTimer);
    clearTimeout(this.authTimer);
    clearInterval(this.heartbeatTimer);
  }
  connect() {
    if (!this.wanted) return;
    this.clearTimers();
    const epoch = ++this.epoch;
    const old = this.socket;
    this.socket = null;
    this.joined = false;
    old?.close();
    this.onStatus({
      phase: this.attempt ? "reconnecting" : "connecting",
      attempt: this.attempt,
    });
    let ws;
    try {
      ws = new this.WebSocketImpl(this.url);
    } catch {
      this.schedule();
      return;
    }
    this.socket = ws;
    const current = () =>
      this.wanted && this.epoch === epoch && this.socket === ws;
    this.authTimer = setTimeout(() => {
      if (current() && !this.joined) this.retryNow();
    }, this.connectTimeout);
    ws.onopen = () => {
      if (!current()) return;
      ws.send(JSON.stringify({ type: "join", ...this.credentials() }));
      this.heartbeatTimer = setInterval(() => {
        if (!current() || !this.joined) return;
        if (Date.now() - this.lastState > this.staleTimeout) {
          this.retryNow();
          return;
        }
        this.send({ type: "ping", at: Date.now() });
      }, this.heartbeatEvery);
    };
    ws.onmessage = (event) => {
      if (!current()) return;
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "error") {
        this.fail(msg.text || "Сервер отклонил вход.");
        return;
      }
      if (msg.type === "welcome") {
        clearTimeout(this.authTimer);
        this.joined = true;
        this.attempt = 0;
        this.lastState = Date.now();
        this.onStatus({ phase: "connected", resumed: !!msg.resumed });
      }
      if (msg.type === "state") this.lastState = Date.now();
      this.onMessage(msg);
    };
    ws.onerror = () => {}; // onclose handles transport errors, without toast floods.
    ws.onclose = (event) => {
      if (!current()) return;
      this.clearTimers();
      this.socket = null;
      this.joined = false;
      if (event.code === 4001) {
        this.fail(
          "Этот профиль открыт в другом окне. Закройте его перед повторным входом.",
        );
        return;
      }
      if (event.code === 1008) {
        this.fail(
          "Вход отклонён. Проверьте код комнаты и выбранного персонажа.",
        );
        return;
      }
      this.schedule();
    };
  }
  schedule() {
    if (!this.wanted) return;
    this.joined = false;
    this.clearTimers();
    const delay = Math.min(
      this.retryMax,
      this.retryBase * 2 ** Math.min(this.attempt, 4),
    );
    this.attempt++;
    this.onStatus({
      phase: "waiting",
      attempt: this.attempt,
      retryAt: Date.now() + delay,
    });
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }
  retryNow() {
    if (!this.wanted) return;
    this.attempt = Math.max(1, this.attempt);
    this.connect();
  }
  wake() {
    if (this.wanted && (!this.joined || Date.now() - this.lastState > 8000))
      this.retryNow();
  }
  send(data) {
    if (
      !this.joined ||
      this.socket?.readyState !== 1 ||
      this.socket.bufferedAmount > 65536
    )
      return false;
    this.socket.send(JSON.stringify(data));
    return true;
  }
  fail(text) {
    this.stop(false);
    this.onTerminal(text);
  }
  stop(leave = true) {
    this.wanted = false;
    this.epoch++;
    this.clearTimers();
    const ws = this.socket;
    if (leave && this.joined && ws?.readyState === 1)
      ws.send(JSON.stringify({ type: "leave" }));
    this.socket = null;
    this.joined = false;
    ws?.close(1000, "Client exit");
    this.onStatus({ phase: "idle" });
  }
}
