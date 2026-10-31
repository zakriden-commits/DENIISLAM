import { chromium as playwright, expect } from "@playwright/test";
import chromium from "@sparticuz/chromium";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
await mkdir("test-results", { recursive: true });
const libs = await mkdtemp(join(tmpdir(), "di-browser-libs-"));
const bin = join(
  dirname(require.resolve("@sparticuz/chromium")),
  "../bin/al2023.tar.br",
);
await writeFile(
  join(libs, "libs.tar"),
  brotliDecompressSync(readFileSync(bin)),
);
execFileSync("tar", ["-xf", join(libs, "libs.tar"), "-C", libs]);
const browser = await playwright.launch({
  executablePath: await chromium.executablePath(),
  args: chromium.args.filter(
    (a) => !["--single-process", "--in-process-gpu"].includes(a),
  ),
  env: {
    ...process.env,
    LD_LIBRARY_PATH:
      join(libs, "lib") + ":" + (process.env.LD_LIBRARY_PATH || ""),
  },
  headless: true,
});
const errors = [];
const base = process.env.BASE_URL || "http://127.0.0.1:3000";
process.on("uncaughtExceptionMonitor", (e) => {
  if (process.env.GITHUB_ACTIONS)
    console.error(
      "::error title=Browser regression::" +
        String(e.stack || e)
          .replaceAll("%", "%25")
          .replaceAll("\r", "%0D")
          .replaceAll("\n", "%0A"),
    );
});
async function watch(page) {
  // The APK build bakes in a public server URL. UI tests must never contact it
  // or take a real player's slot: override it BEFORE the client module executes.
  await page.addInitScript(() => {
    if (/^https?:$/.test(location.protocol))
      localStorage.setItem("di-server", location.origin);
  });
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("PAGE ERROR", e.message);
  });
}
try {
  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await desktop.newPage();
  await watch(page);
  await page.goto(base);
  await expect(page.locator("#menu")).toBeVisible();
  await page.screenshot({ path: "test-results/menu.png" });
  await page.locator("#play").click();
  await expect(page.locator("#hud")).toBeVisible();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: "test-results/fps-desktop.png" });
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(550);
  await page.keyboard.up("KeyD");
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(2100);
  await page.keyboard.up("KeyW");
  const phone = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const mobile = await phone.newPage();
  await watch(mobile);
  await mobile.goto(base);
  await expect(mobile.locator("#menu")).toBeVisible();
  await mobile.locator("[data-role=islam]").tap();
  await mobile.locator("#play").tap();
  await expect(mobile.locator("#hud")).toBeVisible();
  await mobile.setViewportSize({ width: 844, height: 390 });
  await expect(mobile.locator("#joystick")).toBeVisible();
  await expect(mobile.locator("#sessionPlayers")).toHaveText("В СЕТИ · 2/2");
  await mobile.waitForTimeout(3200);
  const rects = await mobile.evaluate(() =>
    Object.fromEntries(
      ["joystick", "attackBtn", "reloadBtn", "runBtn"].map((id) => {
        const r = document.getElementById(id).getBoundingClientRect();
        return [id, { x: r.x, y: r.y, w: r.width, h: r.height }];
      }),
    ),
  );
  for (const [id, r] of Object.entries(rects)) {
    if (
      r.w < 44 ||
      r.h < 44 ||
      r.x < 0 ||
      r.y < 0 ||
      r.x + r.w > 845 ||
      r.y + r.h > 391
    )
      throw Error("Unusable mobile hitbox " + id + ": " + JSON.stringify(r));
  }
  // Real touch joystick input and a real simultaneous fire/look gesture.
  const cdp = await phone.newCDPSession(mobile),
    j = rects.joystick;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 1, x: j.x + j.w / 2, y: j.y + j.h / 2 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ id: 1, x: j.x + j.w * 0.8, y: j.y + j.h / 2 }],
  });
  await mobile.waitForTimeout(350);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await mobile.locator("#runBtn").tap();
  await expect(mobile.locator("#runBtn")).toHaveClass(/active/);
  await mobile.locator("#runBtn").tap();
  const fire = rects.attackBtn;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 2, x: fire.x + fire.w / 2, y: fire.y + fire.h / 2 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { id: 2, x: fire.x + fire.w / 2 + 20, y: fire.y + fire.h / 2 + 4 },
    ],
  });
  await mobile.waitForTimeout(200);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await mobile.screenshot({ path: "test-results/fps-phone-landscape.png" });
  await mobile.evaluate(async () => {
    screen.orientation?.unlock?.();
    if (document.fullscreenElement) await document.exitFullscreen();
  });
  await mobile.setViewportSize({ width: 390, height: 844 });
  await expect(mobile.locator("#rotateHint")).toBeVisible();
  await mobile.screenshot({ path: "test-results/fps-phone-portrait.png" });
  await mobile.locator("#pauseBtn").tap();
  await mobile.locator("#displaySettings").tap();
  await mobile.locator("#qualityInput").selectOption("balanced");
  await mobile.locator("#sensitivityInput").fill("1.25");
  await mobile.locator("#screenDone").tap();
  await mobile.locator("#pauseBtn").tap();
  await mobile.locator("#controls").tap();
  const card = mobile.locator(".modal-card"),
    cr = await card.boundingBox();
  await card.evaluate((el) => (el.scrollTop = 0));
  const sx = cr.x + cr.width * 0.6,
    sy = cr.y + cr.height - 60,
    ey = cr.y + 120;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 3, x: sx, y: sy }],
  });
  for (let i = 1; i <= 5; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ id: 3, x: sx, y: sy + ((ey - sy) * i) / 5 }],
    });
    await mobile.waitForTimeout(30);
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(() => card.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(10);
  await mobile.locator("#closeModal").tap();

  await mobile.locator("#pauseBtn").tap();
  await mobile.locator("#exit").tap();
  await page.bringToFront();
  await page.locator("#pauseBtn").click();
  await page.locator("#exit").click();
  await expect(page.locator("#menu")).toBeVisible();
} finally {
  for (const context of browser.contexts())
    for (const page of context.pages())
      await page
        .evaluate(() => window.dispatchEvent(new Event("beforeunload")))
        .catch(() => {});
  await browser.close();
}
if (errors.length) throw Error(errors.join("\n"));
console.log(
  "Browser: FPS, two players, mobile landscape/portrait, real touch and settings passed; no JavaScript errors.",
);
