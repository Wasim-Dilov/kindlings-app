/* Kindlings Home Twin service worker: cache-first, works fully offline.
   Install:  every game file must arrive, or the install fails and the browser tries again on the next visit
             (a half-saved game never takes over). Voice clips an older version already saved are copied
             across: clip files are named by their content hash, so they never change.
   After:    the remaining clips download in the background, 16 at a time with retries ("top-up"). The page
             asks for a top-up on every visit and whenever it comes back online, so clips missed on a patchy
             connection fill in later. The page shows the real count and says "Offline ready" only at 100%.
   Bump VERSION whenever any cached file changes (the public build also stamps it with a content hash). */
const VERSION = "kindlings-v4-f7f9254a7d";
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
const abs = u => new URL(u, self.location.href).href;
const CLIP_SET = new Set(CLIPS.map(abs));
const WORKERS = 16, TRIES = 3;
const wait = ms => new Promise(r => setTimeout(r, ms));

async function tell(msg) {
  try { (await self.clients.matchAll({ includeUncontrolled: true })).forEach(c => c.postMessage(msg)); } catch (e) { /* ignore */ }
}

// Fetch one file into the cache, retrying network hiccups. Resolves "ok", "missing" (the server has no such
// file, so retrying cannot help) or "failed".
async function save(cache, url, tries) {
  for (let a = 0; a < tries; a++) {
    try {
      const res = await fetch(url, { cache: "reload" });
      if (res.ok && res.status === 200) { await cache.put(url, res); return "ok"; }
      if (res.status === 404 || res.status === 410) return "missing";
    } catch (e) { /* offline or dropped: try again */ }
    if (a < tries - 1) await wait(500 * (a + 1));
  }
  return "failed";
}

// Run `job` over `items` with `n` in parallel.
async function pool(items, n, job) {
  let next = 0;
  const worker = async () => { while (next < items.length) await job(items[next++]); };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    const missed = [];
    await Promise.all(CORE.map(async u => { if ((await save(cache, u, TRIES)) !== "ok") missed.push(u); }));
    if (missed.length) throw new Error("Could not save " + missed.join(", ") + "; will try again next visit");
    // Copy clips an older version already saved (no download).
    const have = new Set((await cache.keys()).map(r => r.url));
    for (const name of await caches.keys()) {
      if (!name.startsWith("kindlings-") || name === VERSION) continue;
      const old = await caches.open(name);
      const reqs = (await old.keys()).filter(r => CLIP_SET.has(r.url) && !have.has(r.url));
      await pool(reqs, 8, async r => {
        const res = await old.match(r);
        if (res && !have.has(r.url)) { await cache.put(r.url, res); have.add(r.url); }
      });
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("kindlings-") && k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
    tell({ type: "activated", version: VERSION });
  })());
  // Start fetching voices straight away; the page's "top-up" message keeps the worker alive until it finishes.
  topUp().catch(() => {});
});

// Download every clip not yet saved. One run at a time; resolves with the counts.
let filling = null;
function topUp() {
  if (filling) return filling;
  filling = (async () => {
    const cache = await caches.open(VERSION);
    const have = new Set((await cache.keys()).map(r => r.url));
    const todo = CLIPS.filter(u => !have.has(abs(u)));
    const total = CLIPS.length;
    let saved = total - todo.length, missing = 0, failed = 0, streak = 0;
    if (todo.length) tell({ type: "progress", done: saved, total });
    await pool(todo, WORKERS, async url => {
      if (streak >= 24) { failed++; return; }   // the network is down: stop for now, try again next visit
      const r = await save(cache, url, TRIES);
      if (r === "ok") { saved++; streak = 0; }
      else { if (r === "missing") missing++; else failed++; streak++; }
      if ((saved + missing + failed) % 50 === 0) tell({ type: "progress", done: saved, total });
    });
    const result = { type: "cached", version: VERSION, clips: saved, total, missing: missing + failed };
    tell(result);
    return result;
  })();
  filling.then(() => { filling = null; }, () => { filling = null; });
  return filling;
}

self.addEventListener("message", event => {
  const d = event.data || {};
  if (d.type === "top-up") event.waitUntil(topUp().catch(() => {}));
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
