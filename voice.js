/* Kindlings voice runtime: plays pre-rendered Kokoro clips, works offline and from file://.
 *
 * Load order:  <script src="audio/manifest.js"></script>  then  <script src="voice.js"></script>
 *
 * window.KindlingsVoice
 *   speak(text, { voice = 'narrator', interrupt = true }) -> Promise<boolean>  resolves when the clip ends,
 *        or straight away (false) when there is no clip and device fallback is off
 *   stop()                     stop whatever is playing
 *   has(text, voice)           true when a clip exists for this line
 *   setEnabled(bool)           master on/off (persisted)
 *   setVolume(0..1)            (persisted)
 *   setDeviceFallback(bool)    off by default; when on, lines without a clip use the best en-GB device voice
 *   setNames(obj)              { kids: {id: name}, pets: {id: name}, parents: {mum, dad} } merged over the saved family
 *   isSpeaking()
 *   misses                     unmatched lines [{ text, voice, key }], de-duplicated, max 200
 *   keyFor(text, voice)        the lookup key (debugging); normalise(text) is exposed too
 *
 * Key rule (identical to scripts/voice/kvoice.py):
 *   normalise = strip {tokens}, lowercase, runs of non [a-z0-9] -> one space, trim;  key = voice + '|' + normalised
 *   At runtime the family's names are stripped from the sentence first, so "Ready, <name>?" finds "Ready, {kid}?".
 * Never uses speechSynthesis unless setDeviceFallback(true).
 */
(function (global) {
  "use strict";
  var doc = global.document;
  var A = global.KINDLINGS_AUDIO || { version: "none", clips: {}, named: null, voices: {} };
  var CLIPS = A.clips || {};
  var NAMED = A.named || null;
  var SETTINGS_KEY = "kindlings.voice";
  var FAMILY_KEY = "kindlings.family";
  var SILENT = "data:audio/mpeg;base64,SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYzLjEuMTAyAAAAAAAAAAAAAAD/84TAAAAAAAAAAAAASW5mbwAAAA8AAAAFAAACoABtbW1tbW1tbW1tbW1tbW1tbW1tkpKSkpKSkpKSkpKSkpKSkpKSkpK2tra2tra2tra2tra2tra2tra2ttvb29vb29vb29vb29vb29vb29vb//////////////////////////8AAAAATGF2YzYzLjEuAAAAAAAAAAAAAAAAJANgAAAAAAAAAqDr4TdlAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/80TEAAAAA0gAAAAATEFNRTQuMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FNC7/80TEUwAAA0gAAAAAMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FNC7/80TEpgAAA0gAAAAAMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80TErAAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80TErAAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=";

  // Clip paths in the manifest are relative to the folder voice.js lives in.
  var BASE = "";
  try {
    var cs = doc && doc.currentScript;
    if (cs && cs.src) BASE = cs.src.replace(/[^\/]*$/, "");
  } catch (e) { /* inlined or no DOM */ }

  // ---------------- settings ----------------
  var settings = { enabled: true, volume: 0.9, deviceFallback: false };
  function loadSettings() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (typeof s.enabled === "boolean") settings.enabled = s.enabled;
        if (typeof s.volume === "number") settings.volume = Math.max(0, Math.min(1, s.volume));
        if (typeof s.deviceFallback === "boolean") settings.deviceFallback = s.deviceFallback;
      }
    } catch (e) { /* storage blocked */ }
  }
  function saveSettings() {
    try { global.localStorage && global.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }
  loadSettings();

  // ---------------- family names ----------------
  var DEFAULT_FAMILY = {
    kids: { alfie: "Alfie", ruby: "Ruby", theo: "Theo" },
    pets: { lion: "Roary", panda: "Bao" },
    parents: { mum: "Mum", dad: "Dad" }
  };
  var override = null;      // from setNames()
  var famRaw = null;        // last localStorage string seen
  var fam = null;           // merged family
  var reAll = null, reNoParents = null, kidList = [];

  function merge(base, add) {
    var out = { kids: {}, pets: {}, parents: {} };
    ["kids", "pets", "parents"].forEach(function (g) {
      var b = (base && base[g]) || {}, a = (add && add[g]) || {};
      Object.keys(b).forEach(function (k) { out[g][k] = b[k]; });
      Object.keys(a).forEach(function (k) { if (typeof a[k] === "string" && a[k].trim()) out[g][k] = a[k].trim(); });
    });
    return out;
  }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function buildRe(names) {
    var list = names.filter(function (n) { return n && /[A-Za-z0-9]/.test(n); })
      .sort(function (a, b) { return b.length - a.length; }).map(esc);
    if (!list.length) return null;
    // no lookbehind (older iOS Safari): capture the left edge instead
    return new RegExp("(^|[^A-Za-z])(" + list.join("|") + ")(?![A-Za-z])", "gi");
  }
  function refreshFamily(force) {
    var raw = null;
    try { raw = global.localStorage && global.localStorage.getItem(FAMILY_KEY); } catch (e) { raw = null; }
    if (!force && fam && raw === famRaw) return;
    famRaw = raw;
    var saved = null;
    try { saved = raw ? JSON.parse(raw) : null; } catch (e) { saved = null; }
    fam = merge(merge(DEFAULT_FAMILY, saved), override);
    var all = [], noParents = [];
    kidList = [];
    ["kids", "pets", "parents"].forEach(function (g) {
      Object.keys(fam[g]).forEach(function (k) {
        all.push(fam[g][k]);
        if (g !== "parents") noParents.push(fam[g][k]);
        if (g === "kids") kidList.push({ id: k, name: fam[g][k] });
      });
      // defaults too, in case the game still shows a default somewhere
      Object.keys(DEFAULT_FAMILY[g]).forEach(function (k) {
        all.push(DEFAULT_FAMILY[g][k]);
        if (g !== "parents") noParents.push(DEFAULT_FAMILY[g][k]);
      });
    });
    reAll = buildRe(all);
    reNoParents = buildRe(noParents);
  }

  // ---------------- keys ----------------
  function normalise(text) {
    return String(text == null ? "" : text)
      .replace(/\{[a-z]+\}/g, " ")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }
  function strip(text, re) { return re ? String(text).replace(re, "$1 ") : String(text); }
  function variants(text) {
    refreshFamily(false);
    var out = [], seen = {};
    [strip(text, reAll), strip(text, reNoParents), String(text)].forEach(function (t) {
      var n = normalise(t);
      if (!seen[n]) { seen[n] = 1; out.push(n); }
    });
    return out;
  }
  function detectKid(text) {
    refreshFamily(false);
    var t = String(text).toLowerCase();
    for (var i = 0; i < kidList.length; i++) {
      var n = kidList[i].name.toLowerCase();
      var re = new RegExp("(^|[^a-z])" + esc(n) + "(?![a-z])");
      if (re.test(t)) return kidList[i].id;
    }
    return null;
  }
  // last-resort index: normalised text -> clip, any voice
  var byNorm = {};
  Object.keys(CLIPS).forEach(function (k) {
    var n = k.slice(k.indexOf("|") + 1);
    if (!(n in byNorm)) byNorm[n] = CLIPS[k];
  });

  function resolve(text, voice) {
    voice = voice || "narrator";
    var vs = variants(text);
    var kid = NAMED ? detectKid(text) : null;
    for (var i = 0; i < vs.length; i++) {
      var key = voice + "|" + vs[i];
      if (NAMED && kid && NAMED[key] && NAMED[key][kid]) return { path: NAMED[key][kid], key: key };
      if (CLIPS[key]) return { path: CLIPS[key], key: key };
    }
    for (var j = 0; j < vs.length; j++) if (byNorm[vs[j]]) return { path: byNorm[vs[j]], key: "*|" + vs[j] };
    return { path: null, key: voice + "|" + vs[0] };
  }

  // ---------------- playback ----------------
  var POOL_SIZE = 3, pool = [], next = 0, current = null, chain = Promise.resolve();
  var deviceUtter = null;
  function makeEl() {
    if (typeof global.Audio !== "function") return null;
    var el = new global.Audio();
    el.preload = "auto";
    return el;
  }
  for (var p = 0; p < POOL_SIZE; p++) { var el0 = makeEl(); if (el0) pool.push(el0); }

  var unlocked = false;
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    pool.forEach(function (el) {
      try {
        el.muted = true;
        el.src = SILENT;
        var pr = el.play();
        var reset = function () { try { el.pause(); el.currentTime = 0; } catch (e) { /* ignore */ } el.muted = false; };
        if (pr && pr.then) pr.then(reset, reset); else reset();
      } catch (e) { el.muted = false; }
    });
    if (doc) ["pointerdown", "touchend", "keydown"].forEach(function (ev) { doc.removeEventListener(ev, unlock, true); });
  }
  if (doc && doc.addEventListener) {
    ["pointerdown", "touchend", "keydown"].forEach(function (ev) { doc.addEventListener(ev, unlock, true); });
  }

  var misses = [], missSeen = {};
  function recordMiss(text, voice, key) {
    if (missSeen[key] || misses.length >= 200) return;
    missSeen[key] = 1;
    misses.push({ text: String(text), voice: voice, key: key });
  }

  function stop() {
    if (current) { var c = current; current = null; try { c.el.pause(); } catch (e) { /* ignore */ } c.done(); }
    if (deviceUtter) { try { global.speechSynthesis.cancel(); } catch (e) { /* ignore */ } deviceUtter = null; }
  }

  // A clip packed as a data: URI (the claude.ai artifact build loads window.KINDLINGS_AUDIO_DATA from audio/pack-N.js)
  // plays from memory; otherwise the file next to voice.js. Harmless when no pack is loaded.
  function clipSrc(path) {
    var data = global.KINDLINGS_AUDIO_DATA;
    if (data && typeof data[path] === "string") return data[path];
    return /^(data:|blob:|https?:|file:|\/)/.test(path) ? path : BASE + path;
  }

  function playClip(path) {
    return new Promise(function (res) {
      if (!pool.length) { res(false); return; }
      var el = pool[next++ % pool.length];
      var finished = false, timer = null;
      function done(ok) {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        el.onended = el.onerror = null;
        if (current && current.el === el) current = null;
        res(ok !== false);
      }
      current = { el: el, done: function () { done(true); } };
      try {
        el.muted = false;
        el.volume = settings.volume;
        el.src = clipSrc(path);
        el.onended = function () { done(true); };
        el.onerror = function () { done(false); };
        timer = setTimeout(function () { done(true); }, 30000);
        var pr = el.play();
        if (pr && pr.catch) pr.catch(function () { done(false); });
      } catch (e) { done(false); }
    });
  }

  // ---------------- optional device voice ----------------
  var PITCH = { roary: 1.25, bao: 1.2, narrator: 1, mum: 1, dad: 0.95 };
  function bestDeviceVoice() {
    try {
      var vs = global.speechSynthesis.getVoices() || [], best = null, bestScore = -1;
      vs.forEach(function (v) {
        var s = 0, lang = (v.lang || "").toLowerCase().replace("_", "-");
        if (lang === "en-gb") s += 4; else if (lang.indexOf("en") === 0) s += 1; else return;
        if (/premium|enhanced|neural|natural|siri/i.test(v.name)) s += 5;
        if (/novelty|whisper|bad news|bells|bubbles|cellos|organ|jester|zarvox|trinoids|boing|albert|bahh|superstar|wobble|grandpa|grandma|eddy|flo|reed|rocko|sandy|shelley/i.test(v.name)) s -= 10;
        if (v.localService) s += 0.5;
        if (s > bestScore) { bestScore = s; best = v; }
      });
      return best;
    } catch (e) { return null; }
  }
  function speakDevice(text, voice) {
    return new Promise(function (res) {
      try {
        if (!global.speechSynthesis || typeof global.SpeechSynthesisUtterance !== "function") { res(false); return; }
        var u = new global.SpeechSynthesisUtterance(String(text));
        var v = bestDeviceVoice();
        if (v) u.voice = v;
        u.lang = (v && v.lang) || "en-GB";
        u.volume = settings.volume;
        u.rate = 0.95;
        u.pitch = PITCH[voice] || (String(voice).indexOf("critter:") === 0 ? 1.35 : 1);
        var t = setTimeout(function () { res(true); }, Math.min(20000, 1500 + String(text).length * 90));
        u.onend = u.onerror = function () { clearTimeout(t); deviceUtter = null; res(true); };
        deviceUtter = u;
        global.speechSynthesis.speak(u);
      } catch (e) { res(false); }
    });
  }

  // ---------------- public API ----------------
  function speak(text, opts) {
    opts = opts || {};
    var voice = opts.voice || "narrator";
    var interrupt = opts.interrupt !== false;
    if (!settings.enabled || text == null || !String(text).trim()) return Promise.resolve(false);
    var r = resolve(text, voice);
    if (!r.path) recordMiss(text, voice, r.key);
    var run = function () {
      if (r.path) return playClip(r.path);
      if (settings.deviceFallback) return speakDevice(text, voice);
      return Promise.resolve(false);
    };
    if (interrupt) { stop(); chain = run(); return chain; }
    chain = chain.then(run, run);
    return chain;
  }

  global.KindlingsVoice = {
    version: A.version,
    speak: speak,
    stop: stop,
    has: function (text, voice) { return !!resolve(text, voice).path; },
    setEnabled: function (on) { settings.enabled = !!on; if (!on) stop(); saveSettings(); },
    isEnabled: function () { return settings.enabled; },
    setVolume: function (v) {
      settings.volume = Math.max(0, Math.min(1, Number(v) || 0));
      if (current) try { current.el.volume = settings.volume; } catch (e) { /* ignore */ }
      saveSettings();
    },
    getVolume: function () { return settings.volume; },
    setDeviceFallback: function (on) { settings.deviceFallback = !!on; saveSettings(); },
    setNames: function (obj) { override = merge(override || {}, obj || {}); refreshFamily(true); },
    isSpeaking: function () { return !!current || !!deviceUtter; },
    misses: misses,
    keyFor: function (text, voice) { return resolve(text, voice).key; },
    normalise: normalise,
    clipCount: Object.keys(CLIPS).length,
    unlock: unlock
  };
})(typeof window !== "undefined" ? window : this);
