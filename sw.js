/* Kindlings Home Twin service worker: precache the game and every voice clip, serve cache-first, work fully offline.
   Bump VERSION whenever any cached file changes (the public build also stamps it with a content hash). */
const VERSION = "kindlings-v3-91f11e6620";
try { importScripts("audio/manifest.js"); } catch (e) { /* voice clips are optional */ }
const CORE = [
  "./",
  "index.html",
  "simulator.html",
  "pet-art.js",
  "challenges.js",
  "lines.js",
  "voice.js",
  "audio/manifest.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png"
];
// Every clip path in audio/manifest.js: plain clips and any per-child named clips.
const CLIPS = (() => {
  const out = new Set();
  const norm = u => (/^(\.\/|audio\/|https?:)/.test(u) || u.indexOf("/") >= 0 ? u : "audio/" + u);
  const addOne = c => {
    if (!c) return;
    if (typeof c === "string") { out.add(norm(c)); return; }
    if (typeof c === "object") {
      const u = c.src || c.file || c.url;
      if (typeof u === "string") out.add(norm(u));
      else Object.values(c).forEach(v => { if (typeof v === "string") out.add(norm(v)); });
    }
  };
  try {
    const A = self.KINDLINGS_AUDIO || {};
    Object.values(A.clips || {}).forEach(addOne);
    Object.values(A.named || {}).forEach(addOne);
  } catch (e) { /* no manifest */ }
  return [...out].filter(u => !/^https?:/.test(u));
})();

async function tell(msg) {
  try { (await self.clients.matchAll({ includeUncontrolled: true })).forEach(c => c.postMessage(msg)); } catch (e) { /* ignore */ }
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    const put = url => fetch(url, { cache: "reload" }).then(res => { if (res.ok) return cache.put(url, res); }).catch(() => {});
    // The game files first, together; a single missing file never blocks the rest.
    await Promise.all(CORE.map(put));
    // Then the voice clips, a few at a time so a phone on a slow connection is not swamped.
    let next = 0, done = 0;
    const total = CLIPS.length;
    const worker = async () => {
      while (next < total) {
        const url = CLIPS[next++];
        if (!(await cache.match(url))) await put(url);
        done++;
        if (done % 100 === 0) tell({ type: "progress", done, total });
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("kindlings-") && k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
    tell({ type: "cached", version: VERSION, clips: CLIPS.length });
  })());
});

// Audio elements (Safari especially) ask for byte ranges; answer them from the cached file.
async function rangeResponse(res, range) {
  const buf = await res.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range || "");
  const size = buf.byteLength;
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
  if (!m || isNaN(start) || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + size } });
  end = Math.min(end, size - 1);
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: { "Content-Type": res.headers.get("Content-Type") || "audio/mpeg", "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" }
  });
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
    const range = req.headers.get("range");
    if (hit) return range ? rangeResponse(hit, range) : hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.status === 200 && !range) cache.put(req, res.clone());
      return res;
    } catch (e) {
      if (req.mode === "navigate") return (await cache.match("simulator.html")) || Response.error();
      return Response.error();
    }
  })());
});
