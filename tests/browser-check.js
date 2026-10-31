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
    }),
    page = await desktop.newPage();
  await watch(page);
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 180000 });
  await expect(page.locator("#menu")).toBeVisible({ timeout: 180000 });
  await page.screenshot({ path: "test-results/survival-menu.png" });
  await page.route("**/api/health", (r) =>
    r.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  await page.locator("#play").click();
  await expect(page.locator("#toast")).toContainText("HTTP 503");
  await expect(page.locator("#play")).toBeEnabled();
  await page.unroute("**/api/health");
  await page.locator("#play").click();
  await expect(page.locator("#hud")).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "test-results/survival-desktop.png" });
  const initial = await page.evaluate(() => window.__survival());
  expect(initial.playing).toBeTruthy();
  expect(initial.self.inventory.axe).toBe(1);
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(1200);
  await page.keyboard.up("KeyD");
  const moved = await page.evaluate(() => window.__survival());
  expect(moved.self.x - initial.self.x).toBeLessThan(-1);
  await page.locator("#bagButton").click();
  await expect(page.locator("#dialogTitle")).toHaveText("Полевое снаряжение");
  await page.locator('[data-tab="craft"]').click();
  await expect(page.locator('[data-craft="water"]')).toBeVisible();
  await page.locator("#closeDialog").click();
  await page.locator("#mapButton").click();
  await expect(page.locator("#mapCanvas")).toBeVisible();
  await page.locator("#closeDialog").click();
  await page.evaluate(() =>
    Object.defineProperty(document, "hidden", { get: () => true }),
  );
  const phone = await browser.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 1,
    }),
    mobile = await phone.newPage();
  await watch(mobile);
  await mobile.goto(base, { waitUntil: "domcontentloaded", timeout: 180000 });
  await expect(mobile.locator("#menu")).toBeVisible({ timeout: 180000 });
  await mobile.locator('[data-role="islam"]').click();
  await mobile.screenshot({ path: "test-results/survival-phone-menu.png" });
  await mobile.locator("#play").click();
  await expect(mobile.locator("#hud")).toBeVisible({ timeout: 15000 });
  await expect
    .poll(() => page.evaluate(() => window.__survival()?.players?.length))
    .toBe(2);
  await mobile.waitForTimeout(1000);
  await mobile.screenshot({ path: "test-results/survival-phone.png" });
  const cdp = await phone.newCDPSession(mobile);
  const stick = await mobile.locator("#stick").boundingBox();
  const x = stick.x + stick.width / 2,
    y = stick.y + stick.height / 2;
  const before = await mobile.evaluate(() => window.__survival());
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x, y: y - 30 }],
  });
  await mobile.waitForTimeout(1300);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  const after = await mobile.evaluate(() => window.__survival());
  expect(
    Math.hypot(after.self.x - before.self.x, after.self.z - before.self.z),
  ).toBeGreaterThan(1);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 600, y: 180 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 660, y: 190 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect((await mobile.evaluate(() => window.__survival())).yaw).not.toBe(
    before.yaw,
  );
  await mobile.locator("#pause").click();
  await mobile.locator('[data-panel="help"]').click();
  const card = await mobile.locator("#dialog").boundingBox();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: card.x + card.width - 40, y: card.y + card.height - 40 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: card.x + card.width - 40, y: card.y + 80 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(() => mobile.locator("#dialog").evaluate((e) => e.scrollTop))
    .toBeGreaterThan(0);
  await mobile.screenshot({ path: "test-results/survival-guide.png" });
  await mobile.locator("#closeDialog").click();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.waitForTimeout(800);
  await mobile.screenshot({ path: "test-results/survival-portrait.png" });
  await expect(mobile.locator("#fire")).toBeInViewport();
  await expect(mobile.locator("#stick")).toBeInViewport();
  expect(errors).toEqual([]);
  await desktop.close();
  await phone.close();
  console.log(
    "Survival browser checks: two real clients, FPS, phone move/look, inventory, crafting, map, native modal scrolling and portrait passed.",
  );
} finally {
  await browser.close();
}
