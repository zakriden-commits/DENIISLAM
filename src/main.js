import "./mobile.css";
import * as T from "three";
import { Capacitor } from "@capacitor/core";
import { Assets } from "./assets.js";
import { SurvivalWorld } from "./world.js";
import {
  WORLD,
  POIS,
  NODES,
  ITEMS,
  RECIPES,
  dist,
  blocked,
  nearbyTarget,
  heightAt,
} from "./shared.js";
import { RoomConnection } from "./connection.js";
import { Voice } from "./voice.js";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const store = {
  get: (k, f = "") => {
    try {
      return localStorage.getItem(k) || f;
    } catch {
      return f;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let role = store.get("nf-role", "deni"),
  playing = false,
  world,
  state,
  self,
  connection,
  ready = false,
  connected = false,
  tab = "inventory",
  waypoint = null,
  target = null,
  pred = null,
  shotAt = -10,
  toastTimer;
let sensitivity = +store.get("nf-sensitivity", "1"),
  sound = store.get("nf-sound", "on") === "on",
  audio,
  ctx,
  fireHeld = false,
  run = false,
  joystick = { x: 0, z: 0 },
  keys = new Set(),
  lastBag = "";
const native = Capacitor.isNativePlatform();
// Migrate only obsolete sandbox defaults; never overwrite a custom permanent host.
if (store.get("nf-server-migrated") !== "3") {
  try {
    const old = new URL(store.get("di-server")),
      fresh = new URL(
        native ? import.meta.env.VITE_SERVER_URL : location.origin,
      );
    if (
      old.hostname.endsWith(".e2b.app") &&
      fresh.hostname.endsWith(".e2b.app")
    )
      store.set("di-server", fresh.origin);
  } catch {}
  store.set("nf-server-migrated", "3");
}
function serverURL() {
  const raw =
    store.get("di-server") ||
    (native ? import.meta.env.VITE_SERVER_URL : location.origin) ||
    import.meta.env.VITE_SERVER_URL;
  if (!raw) throw Error("Укажите HTTPS-адрес сервера в настройках.");
  const u = new URL(raw);
  if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
    throw Error("Нужен адрес http:// или https:// без логина и пароля.");
  if (location.protocol === "https:" && u.protocol !== "https:")
    throw Error("Для этой версии нужен HTTPS-сервер.");
  return u.origin;
}
function notify(text) {
  $("#toast").textContent = text;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 6500);
}
function send(m) {
  return connection?.send(m);
}
const voice = new Voice(send, notify);
function resetInput() {
  keys.clear();
  joystick = { x: 0, z: 0 };
  fireHeld = false;
  $("#stickKnob").style.transform = "";
}
function closeDialog() {
  if ($("#dialog").open) $("#dialog").close();
  resetInput();
}
function dialog(title, html, tag = "ПОЛЕВОЙ ТЕРМИНАЛ") {
  resetInput();
  document.exitPointerLock?.();
  $("#dialogTitle").textContent = title;
  $("#dialogTag").textContent = tag;
  $("#dialogBody").innerHTML = html;
  if (!$("#dialog").open) $("#dialog").showModal();
  $("#dialog").scrollTop = 0;
}
$("#closeDialog").onclick = closeDialog;
$("#dialog").addEventListener("close", resetInput);
function roleUI() {
  for (const b of $$("[data-role]"))
    b.classList.toggle("active", b.dataset.role === role);
}
for (const b of $$("[data-role]"))
  b.onclick = () => {
    role = b.dataset.role;
    store.set("nf-role", role);
    roleUI();
  };
roleUI();
for (const b of $$("[data-open]")) b.onclick = () => openPanel(b.dataset.open);
function openPanel(name) {
  if (name === "settings") {
    dialog(
      "Настройки канала",
      `<p>Оба игрока должны использовать один и тот же работающий сервер. Установка APK не запускает отдельный сервер. Временный preview не является круглосуточным хостингом.</p><label for="serverInput">HTTPS-адрес сервера</label><input id="serverInput" type="url" value="${esc(store.get("di-server") || (native ? import.meta.env.VITE_SERVER_URL || "" : location.origin))}" placeholder="https://ваш-сервер"><label for="codeInput">Код комнаты (если задан владельцем сервера)</label><input id="codeInput" type="password" value="${esc(store.get("di-room"))}" autocomplete="off"><label for="sensitivity">Чувствительность обзора</label><input id="sensitivity" type="range" min="0.4" max="2" step="0.1" value="${sensitivity}"><label for="quality">Графика</label><select id="quality"><option value="low">Экономичная — для телефона</option><option value="high">Высокая — ближние деревья детальнее</option></select><label><input id="soundInput" type="checkbox" style="width:auto" ${sound ? "checked" : ""}> Звуки леса и действий</label><button id="testServer" class="primary">ПРОВЕРИТЬ СЕРВЕР ↗</button><p id="diagnostic"></p><button id="saveSettings" class="primary">СОХРАНИТЬ И ВЕРНУТЬСЯ</button>`,
    );
    $("#quality").value =
      world?.quality ||
      store.get(
        "nf-quality",
        matchMedia("(pointer:coarse)").matches ? "low" : "high",
      );
    $("#testServer").onclick = async () => {
      const e = $("#diagnostic");
      e.textContent = "Проверяем HTTP и WebSocket…";
      try {
        const u = new URL($("#serverInput").value).origin;
        const h = await health(u);
        if (h.version !== "0.3.0")
          throw Error(
            "Сервер старой версии " + h.version + ". Нужна Survival 0.3.",
          );
        await probeSocket(u);
        e.textContent = `Сервер 0.3 доступен. WebSocket работает. Онлайн ${h.players}/2, зарезервировано ${h.reserved}.`;
      } catch (e2) {
        e.textContent =
          e2.message + " Проверьте адрес, интернет и запущен ли сервер.";
      }
    };
    $("#saveSettings").onclick = () => {
      const prev = store.get("di-server");
      try {
        const u = new URL($("#serverInput").value);
        if (
          !["http:", "https:"].includes(u.protocol) ||
          u.username ||
          u.password
        )
          throw Error();
        store.set("di-server", u.origin);
      } catch {
        notify("Введите корректный HTTP(S)-адрес сервера.");
        return;
      }
      store.set("di-room", $("#codeInput").value);
      sensitivity = +$("#sensitivity").value;
      store.set("nf-sensitivity", sensitivity);
      world.quality = $("#quality").value;
      store.set("nf-quality", world.quality);
      sound = $("#soundInput").checked;
      store.set("nf-sound", sound ? "on" : "off");
      if (audio) audio.volume = sound ? 0.22 : 0;
      world.resize();
      closeDialog();
      if (playing && prev !== store.get("di-server")) leave();
      checkServer();
    };
  } else if (name === "help") {
    dialog(
      "Полевой справочник",
      `<p>Это новая survival-альфа. Банков, магазинов, валюты и работ больше нет. Открытая территория — 1024 × 1024 метра. Два реальных выживших, общие припасы и противники. Дружественный огонь отключён.</p><h3>01 / Первые минуты</h3><p>Убежище защищает от холода, но не кормит. Снаружи, у палатки, находится погасший костёр. Добавьте древесину. Сухостой, камни и ягоды лежат вокруг лагеря. Подойдите и нажмите действие; не двигайтесь, пока собираете ресурс.</p><h3>02 / Не замёрзнуть</h3><p>Следите за едой, водой и теплом. Бег расходует выносливость и ускоряет расход припасов. Костёр согревает, отпугивает волков и позволяет готовить мясо и кипятить речную воду. На это тоже нужны дрова.</p><h3>03 / Снаряжение</h3><p>Консервы, воду, бинты и аптечки используйте из рюкзака. Там же вкладка «Создание»: копьё, бинты, полевой костёр, приготовление еды и воды. Общий ящик стоит у выхода из убежища. После гибели припасы остаются в рюкзаке на месте смерти на 20 минут.</p><h3>04 / Последняя частота</h3><p>Радиодетали спрятаны на лесопилке, насосной и в бункере. Отнесите три детали, четыре единицы металлолома и канистру топлива к вышке связи. Каждый игрок может внести свою часть. Карта показывает места; нажмите на неё, чтобы поставить маршрутную метку.</p><h3>05 / Охота и опасности</h3><p>Олени убегают; волки нападают и боятся огня. Мародёры вооружены. На лесопилке есть дробовик, на блокпосту — пистолет. Найденное оружие нужно зарядить. Цельтесь по высоте: рельеф и стены мешают стрельбе.</p><h3>06 / Управление</h3><p><span class="guide-key">Телефон:</span> джойстик слева; обзор — провести справа. Круг ◎ — удар/огонь, РУКА — действие, R — перезарядка, ↑ — прыжок. БЕГ включает ускорение. Кнопки карты и рюкзака — сверху справа.</p><p><span class="guide-key">Компьютер:</span> WASD — движение, мышь — обзор (нажмите на мир), Shift — бег, ЛКМ — удар/огонь, E — действие, R — перезарядка, Space — прыжок, 1–4 — оружие, Tab — рюкзак, M — карта, Esc — освободить мышь/закрыть окно.</p><h3>07 / Подключение</h3><p>В настройках есть проверка HTTP и WebSocket с понятной ошибкой. Оба игрока указывают одинаковый HTTPS-адрес и выбирают разные профили. При обрыве приложение повторяет вход, сервер сохраняет место 90 секунд. Если сам сервер выключен, переподключение его не запустит. Для постоянной доступности нужен отдельный хост.</p><p>iPhone: открыть ссылку в Safari → Поделиться → На экран «Домой». Это PWA, не IPA. Требуется современный браузер/WebView с WebGL 2. Реальный смартфон ещё не проходил ручной тест.</p>`,
    );
  } else if (name === "credits") {
    dialog(
      "Северный рубеж / 0.3",
      `<p>Новая кооперативная survival-альфа проекта Deni / Islam. Three.js + авторитетный Node.js-сервер. Не коммерчески законченная игра и не заявка на AAA.</p><h3>Модели</h3><p>Quaternius — CC0 1.0: Survival Pack, Nature Pack, Animals Pack, Modular Men, Buildings Pack 2. Получены из trebeljahr/quaternius-showcase. Анимации животных — авторские анимации пакета; движения людей — процедурные.</p><h3>Окружение и звук</h3><p>Babylon.js Assets contributors — CC BY 4.0: лесной HDR, деревья и LOD-атласы, карты коры, грунта, травы и пены, winterWoods.mp3. Изменения: адаптация Babylon-геометрии в Three.js, освещение и материалы; уменьшение GPU-разрешения текстур на телефоне. Все файлы реально используются сценой или звуком.</p><p><a href="./CREDITS.md" target="_blank" rel="noopener">Полная атрибуция и ссылки на лицензии ↗</a></p><p>Шрифты Oswald и Manrope — SIL Open Font License. Three.js и прочие зависимости — по своим лицензиям. Манифест ассетов с исходниками, размером и Git SHA находится в assets/manifest.json.</p>`,
    );
  } else if (name === "pause") {
    dialog(
      "На привале",
      `<p>Общий мир не ставится на паузу. Отдыхайте в убежище или у костра.</p><div class="dialog-actions"><button data-panel="bag">РЮКЗАК</button><button data-panel="map">КАРТА</button><button data-panel="help">СПРАВОЧНИК</button><button data-panel="settings">НАСТРОЙКИ</button></div><button id="resume" class="primary">ВЕРНУТЬСЯ В ЛЕС ↗</button><button id="leave" class="primary">СОХРАНИТЬ И ВЫЙТИ</button>`,
    );
    $$("[data-panel]").forEach(
      (b) => (b.onclick = () => openPanel(b.dataset.panel)),
    );
    $("#resume").onclick = closeDialog;
    $("#leave").onclick = leave;
  } else if (name === "bag" || name === "stash") {
    if (!self) return;
    tab = name === "stash" ? "stash" : "inventory";
    showBag();
  } else if (name === "map") showMap();
}
function showBag() {
  const inv = self.inventory,
    html = `<div class="bag-tabs"><button data-tab="inventory" class="${tab === "inventory" ? "active" : ""}">РЮКЗАК</button><button data-tab="craft" class="${tab === "craft" ? "active" : ""}">СОЗДАНИЕ</button><button data-tab="stash" class="${tab === "stash" ? "active" : ""}">ОБЩИЙ ЯЩИК</button></div>`;
  let body = "";
  if (tab === "craft") {
    body = Object.entries(RECIPES)
      .map(
        ([id, r]) =>
          `<div class="recipe"><div><strong>${r.name}</strong><p>${Object.entries(
            r.cost,
          )
            .map(([k, n]) => `${ITEMS[k].name} ${inv[k] || 0}/${n}`)
            .join(
              " · ",
            )}${r.fire ? " · у огня" : ""}</p></div><button data-craft="${id}">СОЗДАТЬ</button></div>`,
      )
      .join("");
  } else {
    const stash = tab === "stash";
    if (stash && dist(self, WORLD.stash) > 4)
      body =
        "<p>Общий ящик находится у выхода из убежища. Подойдите, чтобы обменяться припасами с напарником.</p>";
    else {
      const items = stash ? state.stash : inv;
      body =
        '<div class="inventory-grid">' +
        Object.entries(items)
          .filter(([k, n]) => n > 0 && ITEMS[k])
          .map(
            ([k, n]) =>
              `<div class="item"><b>${ITEMS[k].name}</b><em>${n}</em>${stash ? `<button data-take="${k}">ЗАБРАТЬ ВСЁ</button>` : ITEMS[k].kind === "weapon" ? `<button data-equip="${k}">В РУКИ</button>` : ITEMS[k].kind === "use" ? `<button data-use="${k}">ИСПОЛЬЗОВАТЬ</button>` : "<span></span>"}${!stash && dist(self, WORLD.stash) < 4 ? `<button data-store="${k}">В ОБЩИЙ ЯЩИК</button>` : ""}</div>`,
          )
          .join("") +
        "</div>";
      if (!Object.values(items).some((n) => n > 0))
        body += "<p>Пока пусто. Осмотрите ближайшие строения.</p>";
    }
  }
  const scroll = $("#dialog").scrollTop;
  dialog("Полевое снаряжение", html + body, "СНАРЯЖЕНИЕ / DENI + ISLAM");
  $("#dialog").scrollTop = scroll;
  $$("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        tab = b.dataset.tab;
        showBag();
      }),
  );
  $$("[data-craft]").forEach(
    (b) => (b.onclick = () => send({ type: "craft", recipe: b.dataset.craft })),
  );
  $$("[data-equip]").forEach(
    (b) =>
      (b.onclick = () => {
        send({ type: "select", item: b.dataset.equip });
        closeDialog();
      }),
  );
  $$("[data-use]").forEach(
    (b) => (b.onclick = () => send({ type: "use", item: b.dataset.use })),
  );
  $$("[data-take]").forEach(
    (b) =>
      (b.onclick = () =>
        send({
          type: "stash",
          item: b.dataset.take,
          direction: "take",
          amount: 99,
        })),
  );
  $$("[data-store]").forEach(
    (b) =>
      (b.onclick = () =>
        send({
          type: "stash",
          item: b.dataset.store,
          direction: "store",
          amount: 99,
        })),
  );
  lastBag = JSON.stringify([self.inventory, state.stash]);
}
function showMap() {
  if (!self) return;
  dialog(
    "Карта северного сектора",
    '<canvas id="mapCanvas" width="720" height="720"></canvas><p class="map-legend">△ Вы · ○ Убежище · ◇ Объекты · Нажмите на карту — поставить метку. Территория: 1 км².</p>',
    "НАВИГАЦИЯ / СЕВЕР ↑",
  );
  const c = $("#mapCanvas"),
    g = c.getContext("2d"),
    scale = 680 / 1024,
    xy = (x) => 20 + (x + 512) * scale;
  g.fillStyle = "#1e3028";
  g.fillRect(0, 0, 720, 720);
  for (let x = -512; x < 512; x += 16)
    for (let z = -512; z < 512; z += 16) {
      const h = heightAt(x, z);
      g.fillStyle = `rgb(${30 + h * 0.5},${48 + h * 0.7},${39 + h * 0.5})`;
      g.fillRect(xy(x), xy(z), 12, 12);
    }
  g.strokeStyle = "#8da78625";
  g.lineWidth = 0.5;
  for (let i = 20; i <= 700; i += 68) {
    g.beginPath();
    g.moveTo(i, 20);
    g.lineTo(i, 700);
    g.moveTo(20, i);
    g.lineTo(700, i);
    g.stroke();
  }
  g.strokeStyle = "#6a999b";
  g.lineWidth = 5;
  g.beginPath();
  for (let z = -512; z <= 512; z += 8) g.lineTo(xy(WORLD.riverX(z)), xy(z));
  g.stroke();
  // Marching-squares topographic contours: terrain and map use identical heights.
  g.strokeStyle = "#c7c7a022";
  g.lineWidth = 0.7;
  for (let level = -12; level <= 21; level += 3)
    for (let x = -512; x < 512; x += 20)
      for (let z = -512; z < 512; z += 20) {
        const corners = [
            [x, z],
            [x + 20, z],
            [x + 20, z + 20],
            [x, z + 20],
          ],
          points = [];
        for (let i = 0; i < 4; i++) {
          const a = corners[i],
            b = corners[(i + 1) % 4],
            ha = heightAt(...a),
            hb = heightAt(...b);
          if (ha < level !== hb < level) {
            const t = (level - ha) / (hb - ha);
            points.push([
              xy(a[0] + (b[0] - a[0]) * t),
              xy(a[1] + (b[1] - a[1]) * t),
            ]);
          }
        }
        if (points.length >= 2) {
          g.beginPath();
          g.moveTo(...points[0]);
          g.lineTo(...points[1]);
          g.stroke();
        }
      }
  g.font = "12px Manrope";
  for (const p of POIS) {
    g.fillStyle = p.id === "camp" ? "#dca060" : "#c6d0b3";
    g.beginPath();
    g.arc(xy(p.x), xy(p.z), 5, 0, 7);
    g.fill();
    g.fillText(p.name, xy(p.x) + 10, xy(p.z) - 8);
  }
  for (const p of state.players) {
    g.save();
    g.translate(xy(p.x), xy(p.z));
    g.rotate(-p.yaw);
    g.fillStyle = p.id === "self" ? "#f1bd79" : "#90c7c5";
    g.beginPath();
    g.moveTo(0, 8);
    g.lineTo(-5, -6);
    g.lineTo(5, -6);
    g.closePath();
    g.fill();
    g.restore();
  }
  g.fillStyle = "#adbca0";
  g.font = "14px Oswald";
  g.fillText("С", 687, 15);
  g.font = "10px Manrope";
  g.fillText("СЕКТОР 04 / 1:1500", 24, 713);
  c.onclick = (e) => {
    const r = c.getBoundingClientRect();
    waypoint = {
      x: (((e.clientX - r.left) / r.width) * 720 - 20) / scale - 512,
      z: (((e.clientY - r.top) / r.height) * 720 - 20) / scale - 512,
      name: "Метка на карте",
    };
    closeDialog();
    notify("Маршрутная метка установлена.");
  };
}
async function health(base) {
  let r;
  try {
    r = await fetch(base + "/api/health", {
      cache: "no-store",
      signal: AbortSignal.timeout(6500),
    });
  } catch {
    throw Error(
      "Сервер не отвечает: нет сети, неверный адрес или процесс выключен.",
    );
  }
  if (!r.ok) throw Error("Сервер вернул HTTP " + r.status);
  let h;
  try {
    h = await r.json();
  } catch {
    throw Error("По этому адресу не игровой сервер (нет JSON /api/health).");
  }
  if (h.capacity !== 2 || !h.ok) throw Error("Неизвестный игровой сервер.");
  return h;
}
async function probeSocket(base) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace(/^http/, "ws") + "/online");
    const t = setTimeout(() => {
      ws.close();
      reject(Error("HTTP работает, но WebSocket заблокирован."));
    }, 6500);
    ws.onopen = () => {
      clearTimeout(t);
      ws.close();
      resolve();
    };
    ws.onerror = () => {
      clearTimeout(t);
      reject(Error("Не открывается WebSocket /online."));
    };
  });
}
async function checkServer() {
  try {
    const h = await health(serverURL());
    $("#serverStatus").textContent =
      h.version === "0.3.0"
        ? `● КАНАЛ ОТКРЫТ · В ЛЕСУ ${h.players}/2`
        : `СЕРВЕР ${h.version} · ТРЕБУЕТСЯ SURVIVAL 0.3`;
  } catch {
    $("#serverStatus").textContent =
      "○ СЕРВЕР НЕДОСТУПЕН · ПРОВЕРЬТЕ НАСТРОЙКИ";
  }
}
function startAudio() {
  if (!audio) {
    audio = new Audio(world.assets.ambience);
    audio.loop = true;
  }
  audio.volume = sound ? 0.22 : 0;
  audio.play().catch(() => {});
  try {
    ctx ??= new AudioContext();
    ctx.resume().catch(() => {});
  } catch {}
}
function fx(gun = false) {
  if (!sound || !ctx) return;
  const dur = gun ? 0.15 : 0.06,
    buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate),
    data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++)
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource(),
    gain = ctx.createGain(),
    filter = ctx.createBiquadFilter();
  src.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.value = gun ? 1800 : 450;
  gain.gain.value = gun ? 0.17 : 0.08;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start();
}
$("#play").onclick = async () => {
  if (!ready) return;
  $("#play").disabled = true;
  $("#play").textContent = "УСТАНАВЛИВАЕМ СВЯЗЬ…";
  startAudio();
  try {
    const base = serverURL(),
      h = await health(base);
    if (h.version !== "0.3.0")
      throw Error(
        "На сервере ещё старая игра " +
          h.version +
          ". Нужна новая Survival 0.3.",
      );
    await probeSocket(base);
    const key = "nf-token-" + base + "-" + role;
    let token = store.get(key);
    if (!token) {
      token = crypto.randomUUID();
      store.set(key, token);
    }
    connection?.stop();
    connection = new RoomConnection({
      url: base.replace(/^http/, "ws") + "/online",
      credentials: () => ({
        token,
        role,
        code: store.get("di-room"),
        version: 3,
      }),
      connectTimeout: 8000,
      onStatus: (s) => {
        connected = s.phase === "connected";
        $("#connection").hidden = connected || !playing;
        if (!connected) resetInput();
        if (!playing && s.phase !== "idle")
          $("#serverStatus").textContent =
            s.phase === "waiting"
              ? "НЕТ WEBSOCKET-СВЯЗИ · ПОВТОРЯЕМ ВХОД"
              : "ПОДКЛЮЧЕНИЕ К ОБЩЕМУ МИРУ…";
      },
      onTerminal: (text) => {
        leave(false);
        notify(text);
      },
      onMessage: message,
    });
    connection.start();
    voice.configure(base);
  } catch (e) {
    notify(e.message + " Откройте ⚙ → «Проверить сервер».");
    $("#play").disabled = false;
    $("#play").innerHTML = "НАЧАТЬ ВЫЛАЗКУ <span>↗</span>";
  }
};
function message(m) {
  if (m.type === "state") {
    state = m;
    const me = m.players.find((p) => p.id === "self");
    self = { ...m.self, ...me };
    if (!self.inventory) return;
    if (!playing) {
      playing = true;
      world.playing = true;
      $("#menu").hidden = true;
      $("#hud").hidden = false;
      world.yaw = Number.isFinite(self.yaw) ? self.yaw - Math.PI : Math.PI;
      pred = { x: self.x, z: self.z };
      world.pos = { ...pred };
      $("#play").disabled = false;
      $("#play").innerHTML = "НАЧАТЬ ВЫЛАЗКУ <span>↗</span>";
    }
    if (!pred || dist(pred, self) > 5) pred = { x: self.x, z: self.z };
    else {
      pred.x += (self.x - pred.x) * 0.23;
      pred.z += (self.z - pred.z) * 0.23;
    }
    world.sync(m);
    updateHUD();
    if (
      $("#dialog").open &&
      $("#dialogTitle").textContent === "Полевое снаряжение" &&
      lastBag !== JSON.stringify([self.inventory, state.stash])
    )
      showBag();
  } else if (m.type === "notice") notify(m.text);
  else if (m.type === "peerJoined") {
    notify("Напарник вышел на связь.");
    if (role === "deni") voice.offer();
  } else if (m.type === "peerLeft") {
    voice.resetPeer();
    notify(
      m.temporary
        ? "У напарника пропала связь. Ждём возвращения."
        : "Напарник покинул лес.",
    );
  } else if (m.type === "signal") voice.receive(m.data);
  else if (m.type === "welcome" && m.slot === 0) voice.offer();
}
function leave(explicit = true) {
  connection?.stop(explicit);
  voice.close();
  playing = false;
  connected = false;
  world.playing = false;
  self = null;
  pred = null;
  state = null;
  resetInput();
  closeDialog();
  $("#hud").hidden = true;
  $("#menu").hidden = false;
  $("#play").disabled = false;
  $("#play").innerHTML = "НАЧАТЬ ВЫЛАЗКУ <span>↗</span>";
  checkServer();
}
function updateHUD() {
  for (const k of ["hp", "hunger", "thirst", "warmth"]) {
    $("#" + k).textContent = Math.ceil(self[k]);
    $("#" + k).style.color = self[k] < 25 ? "#e18d6b" : "";
  }
  $("#hpBar").style.width = self.hp + "%";
  $("#staminaBar").style.width = self.stamina + "%";
  $("#damage").style.opacity = Math.max(0, (45 - self.hp) / 65);
  $("#frost").style.opacity = Math.max(0, (35 - self.warmth) / 45);
  $("#weather").textContent =
    state.temperature + "°C" + (state.storm ? " / ШКВАЛ" : "");
  $("#time").textContent =
    String(Math.floor(state.hour)).padStart(2, "0") +
    ":" +
    String(Math.floor((state.hour % 1) * 60)).padStart(2, "0");
  $("#online").textContent =
    state.players.filter((p) => p.connected).length + " / 02";
  const w = ITEMS[self.selected];
  $("#weaponName").textContent = w.name.toUpperCase();
  $("#ammo").innerHTML = self.reload
    ? "ЗАРЯДКА"
    : w.mag
      ? `${self.mag[self.selected]} <span>/ ${self.inventory.ammo || 0}</span>`
      : "— <span>/ БЛИЖНИЙ БОЙ</span>";
  const bar = ["axe", "spear", "pistol", "shotgun"];
  $("#hotbar").innerHTML = bar
    .map(
      (id, i) =>
        `<button data-slot="${id}" class="${self.selected === id ? "selected" : ""}" ${self.inventory[id] ? "" : "disabled"}><small>${i + 1}</small>${["ТОПОР", "КОПЬЁ", "ПМ", "ДРОБЬ"][i]}</button>`,
    )
    .join("");
  $$("[data-slot]").forEach(
    (b) => (b.onclick = () => send({ type: "select", item: b.dataset.slot })),
  );
  const parts = NODES.filter(
    (n) => n.type === "part" && state.depleted[n.id] > state.time,
  ).length;
  $("#objective").textContent = state.radio.active
    ? "Сигнал отправлен. Продолжайте выживать."
    : !state.fires.some((f) => f.fuel > 0)
      ? "Согрейтесь: добавьте дрова в костёр"
      : parts < 3
        ? `Найдите радиодетали: ${parts} / 3`
        : `Почините вышку: ${state.radio.part}/3 · металл ${state.radio.scrap}/4 · топливо ${state.radio.fuel}/1`;
  target = nearbyTarget(self, state);
  $("#target").hidden = !target;
  if (target) {
    const names = {
      wood: "Заготовить сухую древесину",
      stone: "Собрать камень",
      berry: "Собрать съедобные ягоды",
      water: "Набрать речную воду",
      crate: "Обыскать ящик",
      supply: "Забрать припасы",
      part: "Забрать радиодеталь",
      fire:
        target.fuel > 0
          ? "Добавить дрова / согреться"
          : "Разжечь костёр · древесина ×1",
      drop: "Подобрать рюкзак",
      stash: "Открыть общий ящик",
      radio: "Внести детали / починить связь",
      carcass: "Разделать тушу",
    };
    $("#targetText").textContent = self.loot
      ? "Собираем… не двигайтесь"
      : names[target.type] || "Осмотреть";
  }
  $("#gatherFill").style.width =
    (self.loot ? (self.loot.elapsed / self.loot.duration) * 100 : 0) + "%";
}
function interact() {
  if (!playing || $("#dialog").open || !connected || !target) return;
  if (target.type === "stash") openPanel("stash");
  else if (target.type === "fire") send({ type: "fire", id: target.id });
  else if (target.type === "radio") send({ type: "radio" });
  else send({ type: "gatherStart", id: target.id });
}
function shoot() {
  if (!self || !connected || $("#dialog").open) return;
  const w = ITEMS[self.selected],
    now = performance.now() / 1000;
  if (now - shotAt < w.cooldown || self.reload) return;
  if (w.mag && !self.mag[self.selected]) {
    send({ type: "reload" });
    return;
  }
  shotAt = now;
  send({ type: "shoot" });
  world.shot();
  fx(!!w.mag);
}
$("#pause").onclick = () => openPanel("pause");
$("#bagButton").onclick = () => openPanel("bag");
$("#mapButton").onclick = () => openPanel("map");
$("#interact").onclick = interact;
$("#reload").onclick = () => send({ type: "reload" });
$("#jump").onclick = () => send({ type: "jump" });
$("#run").onclick = () => {
  run = !run;
  $("#run").classList.toggle("active", run);
};
$("#mic").onclick = async () => {
  if (!voice.stream) await voice.enable();
  else voice.mute();
  $("#mic").textContent = voice.enabled ? "MIC ●" : "MIC";
  voice.offer();
};
function movement() {
  if (!playing || !connected || $("#dialog").open)
    return { x: 0, z: 0, run: false };
  let x = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0) + joystick.x,
    z = (keys.has("KeyS") ? 1 : 0) - (keys.has("KeyW") ? 1 : 0) + joystick.z;
  const len = Math.max(1, Math.hypot(x, z));
  x /= len;
  z /= len;
  const a = world.yaw;
  return {
    x: x * Math.cos(a) + z * Math.sin(a),
    z: -x * Math.sin(a) + z * Math.cos(a),
    run: run || keys.has("ShiftLeft") || keys.has("ShiftRight"),
  };
}
window.addEventListener("keydown", (e) => {
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  if (["Tab", "Space", "KeyM"].includes(e.code)) e.preventDefault();
  if (e.code === "Escape") {
    if (!$("#dialog").open && playing) openPanel("pause");
    return;
  }
  if (e.repeat || !playing) return;
  if ($("#dialog").open) {
    if (e.code === "Tab" || e.code === "KeyM") closeDialog();
    return;
  }
  keys.add(e.code);
  if (e.code === "KeyE") interact();
  if (e.code === "KeyR") send({ type: "reload" });
  if (e.code === "Space") send({ type: "jump" });
  if (e.code === "Tab") openPanel("bag");
  if (e.code === "KeyM") openPanel("map");
  if (/^Digit[1-4]$/.test(e.code))
    send({
      type: "select",
      item: ["axe", "spear", "pistol", "shotgun"][+e.code.slice(-1) - 1],
    });
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
function look(dx, dy) {
  if (!playing || $("#dialog").open) return;
  world.yaw -= dx * 0.0025 * sensitivity;
  world.pitch = T.MathUtils.clamp(
    world.pitch - dy * 0.0025 * sensitivity,
    -1.3,
    1.3,
  );
}
let lookPointer = null,
  lastX = 0,
  lastY = 0;
const canvas = $("#game");
canvas.addEventListener("pointerdown", (e) => {
  if (!playing || $("#dialog").open) return;
  if (e.pointerType === "mouse") {
    canvas.requestPointerLock?.();
    fireHeld = true;
    shoot();
  } else if (e.clientX > innerWidth * 0.38) {
    lookPointer = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  }
});
window.addEventListener("pointermove", (e) => {
  if (document.pointerLockElement === canvas && e.pointerType === "mouse")
    look(e.movementX, e.movementY);
  else if (e.pointerId === lookPointer) {
    look(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX;
    lastY = e.clientY;
  }
});
window.addEventListener("pointerup", (e) => {
  if (e.pointerId === lookPointer) lookPointer = null;
  if (e.pointerType === "mouse") fireHeld = false;
});
window.addEventListener("pointercancel", () => {
  lookPointer = null;
  fireHeld = false;
});
$("#fire").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  fireHeld = true;
  lastX = e.clientX;
  lastY = e.clientY;
  $("#fire").setPointerCapture(e.pointerId);
  shoot();
});
$("#fire").addEventListener("pointermove", (e) => {
  if (fireHeld) {
    look(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX;
    lastY = e.clientY;
  }
});
for (const ev of ["pointerup", "pointercancel"])
  $("#fire").addEventListener(ev, () => (fireHeld = false));
let stickID = null,
  stickX = 0,
  stickY = 0;
$("#stick").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  stickID = e.pointerId;
  const r = $("#stick").getBoundingClientRect();
  stickX = r.left + r.width / 2;
  stickY = r.top + r.height / 2;
  $("#stick").setPointerCapture(e.pointerId);
  updateStick(e);
});
function updateStick(e) {
  if (stickID !== e.pointerId) return;
  const dx = e.clientX - stickX,
    dy = e.clientY - stickY,
    len = Math.max(1, Math.hypot(dx, dy) / 35);
  joystick = { x: dx / len / 35, z: dy / len / 35 };
  $("#stickKnob").style.transform = `translate(${dx / len}px,${dy / len}px)`;
}
$("#stick").addEventListener("pointermove", updateStick);
for (const ev of ["pointerup", "pointercancel"])
  $("#stick").addEventListener(ev, () => {
    stickID = null;
    joystick = { x: 0, z: 0 };
    $("#stickKnob").style.transform = "";
  });
window.addEventListener("blur", resetInput);
document.addEventListener("visibilitychange", () => {
  resetInput();
  if (!document.hidden) connection?.wake();
});
window.addEventListener("online", () => {
  connection?.wake();
  checkServer();
});
window.addEventListener("pageshow", () => connection?.wake());
window.addEventListener("resize", () => world?.resize());
setInterval(() => {
  if (!playing) return;
  const m = movement();
  send({ type: "input", ...m, aim: world.yaw + Math.PI, pitch: world.pitch });
}, 50);
setInterval(() => {
  if (!playing) checkServer();
}, 20000);
async function init() {
  try {
    const renderer = new T.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    const assets = new Assets(renderer);
    await assets.load((p, done, total) => {
      $("#loadBar").style.width = p * 100 + "%";
      $("#loadText").textContent =
        `Подготовка экспедиции · ${(done / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} МБ`;
    });
    world = new SurvivalWorld(canvas, assets);
    world.quality = store.get("nf-quality", assets.mobile ? "low" : "high");
    world.resize();
    world.sync({
      fires: [{ id: "base-fire", x: 0, z: 49, fuel: 150 }],
      players: [],
      npcs: [],
      drops: [],
      depleted: {},
      time: 0,
      hour: 6.5,
      radio: { active: false },
    });
    ready = true;
    $("#loading").hidden = true;
    $("#menu").hidden = false;
    checkServer();
    let prev = performance.now();
    function frame(t) {
      requestAnimationFrame(frame);
      if (document.hidden) {
        prev = t;
        return;
      }
      const dt = Math.min(0.06, (t - prev) / 1000);
      prev = t;
      if (playing && self) {
        const m = movement(),
          speed = m.run && self.stamina > 2 ? 7 : 3.9;
        const dx = m.x * speed * dt,
          dz = m.z * speed * dt;
        if (!blocked(pred.x + dx, pred.z)) pred.x += dx;
        if (!blocked(pred.x, pred.z + dz)) pred.z += dz;
        if (fireHeld) shoot();
        const degree = (((world.yaw + Math.PI) * 180) / Math.PI + 3600) % 360;
        $("#compass").innerHTML =
          `С <b>${Math.round(degree).toString().padStart(3, "0")}</b> Ю`;
        const goal = waypoint || POIS.find((p) => p.id === "radio");
        $("#waypoint").textContent =
          `${goal.name} · ${Math.round(dist(self, goal))} м`;
        world.render(dt, {
          ...self,
          ...pred,
          moving: Math.hypot(m.x, m.z) > 0.1,
          running: m.run,
        });
      } else world.render(dt, null);
    }
    requestAnimationFrame(frame);
    if ("serviceWorker" in navigator && !native && import.meta.env.PROD)
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    // Read-only diagnostics for automated regressions, without a debug/admin backdoor.
    window.__survival = () => ({
      ready,
      playing,
      connected,
      self: self
        ? {
            x: self.x,
            z: self.z,
            hp: self.hp,
            inventory: { ...self.inventory },
            selected: self.selected,
          }
        : null,
      players: state?.players.map((p) => ({
        slot: p.slot,
        x: p.x,
        z: p.z,
        connected: p.connected,
      })),
      yaw: world.yaw,
      pitch: world.pitch,
      target: target?.type,
      triangles: renderer.info.render.triangles,
    });
  } catch (e) {
    console.error(e);
    $("#loadText").textContent = "Не удалось подготовить мир: " + e.message;
    $("#loading small").textContent =
      "Обновите Android System WebView / браузер. Нужен WebGL 2. Проверьте загрузку файлов и попробуйте ещё раз.";
  }
}
init();
