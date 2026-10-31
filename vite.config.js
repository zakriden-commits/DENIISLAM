import { defineConfig } from "vite";
import { readdirSync, writeFileSync } from "node:fs";
function list(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? list(`${dir}/${e.name}`, `${prefix}${e.name}/`)
      : [prefix + e.name],
  );
}
export default defineConfig({
  base: "./",
  server: { host: "0.0.0.0", allowedHosts: true },
  build: { rollupOptions: { output: { manualChunks: { engine: ["three"] } } } },
  plugins: [
    {
      name: "offline-shell",
      closeBundle() {
        const files = list("dist")
          .filter((f) => f !== "sw.js")
          .map((f) => "./" + f);
        writeFileSync(
          "dist/sw.js",
          `const CACHE='deni-islam-${Date.now()}';const FILES=${JSON.stringify(["./", ...files])};
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('deni-islam-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.includes('/api/'))return;e.respondWith(fetch(e.request,{cache:e.request.mode==='navigate'?'no-cache':'default'}).then(r=>{if(r.ok){const clone=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,clone)).catch(()=>{}));}return r;}).catch(()=>caches.match(e.request).then(r=>r||(e.request.mode==='navigate'?caches.match(new URL('./index.html',self.registration.scope).href):Response.error()))));});`,
        );
      },
    },
  ],
});
