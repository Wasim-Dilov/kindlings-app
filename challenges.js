/* Kindlings learning challenges: window.Challenges
   Friendly puzzle encounters, curated question banks, a spaced-repetition learner,
   original critter art and the Friend Book. Plain browser JavaScript with no
   dependencies and no network requests. The data and learner parts also run
   headless (Node, Web Workers) for simulated weeks.

   Naming rule for the public build: child names never appear in sentences or
   identifiers. Ids stay `alfie` / `ruby`; every name shown or spoken comes from
   the kidName / petName options through the {kid} and {pet} templates. */
(function (global) {
"use strict";

var VERSION = "1.1.0";
var GAPS = [0, 1, 2, 4, 7, 14];            // Leitner box -> days until due
var DEFAULT_NAMES = { alfie: "Alfie", ruby: "Ruby" };
var PET_DEFAULT = { alfie: { id: "lion", name: "Roary" }, ruby: { id: "panda", name: "Bao" } };
var MAX_NEW = { alfie: 6, ruby: 8 };       // new items per day
var DEFAULT_N = { alfie: 3, ruby: 5 };     // questions per encounter
var BASE_APTITUDE = { alfie: 1.9, ruby: 2.0 };
var SECONDS_PER_ITEM = { alfie: 22, ruby: 26 };
var ABORT = { aborted: true };
// Befriending pace (target: 1 to 3 new friends a week per child).
// A shy critter becomes a friend after HEARTS visits on different days: at most one heart
// per critter per day, the meter never goes down, and only one critter is being befriended
// at a time once the child has a first friend. Friends keep visiting for spaced review.
var HEARTS = { alfie: 4, ruby: 3 };       // the younger child plays shorter, more frequent visits and has 12 critters
var OPEN_MAX = { start: 2, later: 1 };     // critters being befriended at once (no friends yet / later)
var SVG_SALT = Math.floor(Math.random() * 46656).toString(36);   // keeps ids unique across copies of this file

/* ------------------------------------------------------------------ utils */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashStr(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function shuffle(a, rng) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function pickOne(a, rng) { return a[Math.floor(rng() * a.length)]; }
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function cap(s) { s = String(s); return s.charAt(0).toUpperCase() + s.slice(1); }
function kidKey(k) { return k === "ruby" ? "ruby" : "alfie"; }
function an(w) { return (/^[aeiou]/i.test(w) ? "an " : "a ") + w; }
function fill(text, ctx) {
  return String(text == null ? "" : text)
    .replace(/\{kid\}/g, ctx && ctx.kid || "")
    .replace(/\{pet\}/g, ctx && ctx.pet || "");
}

/* ----------------------------------------------------------- pictures */
var COLS = { red: "#E53935", blue: "#1E88E5", yellow: "#FDD835", green: "#43A047", orange: "#FB8C00", purple: "#8E24AA", pink: "#F06292", brown: "#8D6E63", black: "#212121", white: "#FAFAFA" };
var PIC = {
  swatch: function (c) { return { swatch: COLS[c] || c }; },
  shape: function (s, c) { return { shape: s, color: c || "#2F7DE1" }; },
  clock: function (h, m) { return { clock: [h, m || 0] }; },
  dots: function (n) { return { dots: n }; },
  word: function (w) { return { word: w }; },
  num: function (n) { return { num: n }; },
  mini: function (k) { return { mini: k }; },
  big: function (e, s) { return { e: e, scale: s }; }
};

function shapeSvg(s, color) {
  var st = 'fill="' + color + '" stroke="#1E2233" stroke-width="4" stroke-linejoin="round"';
  var body;
  switch (s) {
    case "circle": body = '<circle cx="50" cy="50" r="38" ' + st + '/>'; break;
    case "square": body = '<rect x="14" y="14" width="72" height="72" rx="4" ' + st + '/>'; break;
    case "triangle": body = '<path d="M50 12 L90 86 L10 86 Z" ' + st + '/>'; break;
    case "star": body = '<path d="M50 8 L61 38 L93 39 L68 58 L77 90 L50 71 L23 90 L32 58 L7 39 L39 38 Z" ' + st + '/>'; break;
    case "heart": body = '<path d="M50 88 C20 66 6 50 10 32 C14 14 38 10 50 30 C62 10 86 14 90 32 C94 50 80 66 50 88 Z" ' + st + '/>'; break;
    case "rectangle": body = '<rect x="6" y="28" width="88" height="44" rx="4" ' + st + '/>'; break;
    case "oval": body = '<ellipse cx="50" cy="50" rx="44" ry="30" ' + st + '/>'; break;
    case "diamond": body = '<path d="M50 6 L90 50 L50 94 L10 50 Z" ' + st + '/>'; break;
    default: body = '<circle cx="50" cy="50" r="38" ' + st + '/>';
  }
  return '<svg class="chl-svgpic" viewBox="0 0 100 100" aria-hidden="true">' + body + '</svg>';
}
function clockSvg(h, m) {
  var s = '<svg class="chl-svgpic chl-clock" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="#FFFDF7" stroke="#1E2233" stroke-width="4"/>';
  for (var i = 0; i < 60; i++) {
    var a = i * Math.PI / 30, big = i % 5 === 0, r1 = big ? 38 : 41;
    s += '<line x1="' + (50 + Math.sin(a) * r1).toFixed(1) + '" y1="' + (50 - Math.cos(a) * r1).toFixed(1) + '" x2="' + (50 + Math.sin(a) * 44).toFixed(1) + '" y2="' + (50 - Math.cos(a) * 44).toFixed(1) + '" stroke="#1E2233" stroke-width="' + (big ? 2 : 0.8) + '"/>';
  }
  for (var n = 1; n <= 12; n++) {
    var b = n * Math.PI / 6;
    s += '<text x="' + (50 + Math.sin(b) * 30).toFixed(1) + '" y="' + (50 - Math.cos(b) * 30 + 3.6).toFixed(1) + '" text-anchor="middle" font-size="10" font-weight="700" fill="#1E2233" font-family="system-ui,sans-serif">' + n + '</text>';
  }
  var ha = ((h % 12) + m / 60) * 30, ma = m * 6;
  s += '<line x1="50" y1="50" x2="50" y2="27" stroke="#1E2233" stroke-width="5" stroke-linecap="round" transform="rotate(' + ha + ' 50 50)"/>';
  s += '<line x1="50" y1="50" x2="50" y2="13" stroke="#2F7DE1" stroke-width="3" stroke-linecap="round" transform="rotate(' + ma + ' 50 50)"/>';
  s += '<circle cx="50" cy="50" r="3.5" fill="#1E2233"/></svg>';
  return s;
}
function dotsSvg(n) {
  // a ten-frame: two rows of five
  var s = '<svg class="chl-svgpic chl-frame" viewBox="0 0 104 46" aria-hidden="true"><rect x="2" y="2" width="100" height="42" rx="6" fill="#FFFDF7" stroke="#1E2233" stroke-width="2.5"/>';
  for (var i = 0; i < 10; i++) {
    var x = 12 + (i % 5) * 20, y = 13 + Math.floor(i / 5) * 20;
    s += '<circle cx="' + x + '" cy="' + y + '" r="7" fill="' + (i < n ? "#FF7A1A" : "none") + '" stroke="' + (i < n ? "#1E2233" : "#C9C2B5") + '" stroke-width="1.6"/>';
  }
  return s + '</svg>';
}
var MINI = {
  chrysalis: '<svg class="chl-svgpic" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 6 L50 18" stroke="#7A5A3A" stroke-width="4"/><path d="M50 18 C70 24 72 60 58 84 C54 92 46 92 42 84 C28 60 30 24 50 18 Z" fill="#8BC34A" stroke="#1E2233" stroke-width="3.5"/><path d="M42 40 C50 46 58 46 64 42 M38 58 C48 64 58 64 64 58" fill="none" stroke="#4E7D2A" stroke-width="3"/><circle cx="56" cy="30" r="3" fill="#F6D36B"/></svg>',
  tadpole: '<svg class="chl-svgpic" viewBox="0 0 100 100" aria-hidden="true"><path d="M44 52 C60 40 80 58 94 46 C82 66 62 58 50 64" fill="#3E5C3A" stroke="#1E2233" stroke-width="3" stroke-linejoin="round"/><ellipse cx="34" cy="54" rx="22" ry="18" fill="#4F7A4A" stroke="#1E2233" stroke-width="3.5"/><circle cx="26" cy="48" r="5" fill="#fff"/><circle cx="25" cy="48" r="2.6" fill="#1E2233"/></svg>',
  frogspawn: '<svg class="chl-svgpic" viewBox="0 0 100 100" aria-hidden="true"><g stroke="#1E2233" stroke-width="2.5"><circle cx="30" cy="34" r="14" fill="#D7EEF7"/><circle cx="58" cy="28" r="14" fill="#D7EEF7"/><circle cx="74" cy="54" r="14" fill="#D7EEF7"/><circle cx="46" cy="58" r="14" fill="#D7EEF7"/><circle cx="24" cy="66" r="14" fill="#D7EEF7"/><circle cx="54" cy="82" r="13" fill="#D7EEF7"/></g><g fill="#1E2233"><circle cx="30" cy="34" r="4"/><circle cx="58" cy="28" r="4"/><circle cx="74" cy="54" r="4"/><circle cx="46" cy="58" r="4"/><circle cx="24" cy="66" r="4"/><circle cx="54" cy="82" r="4"/></g></svg>',
  seed: '<svg class="chl-svgpic" viewBox="0 0 100 100" aria-hidden="true"><path d="M10 78 Q50 70 90 78 L90 94 L10 94 Z" fill="#8D6E63" stroke="#1E2233" stroke-width="3"/><ellipse cx="50" cy="62" rx="14" ry="10" fill="#C89B5B" stroke="#1E2233" stroke-width="3" transform="rotate(-20 50 62)"/><path d="M44 60 Q50 56 56 60" fill="none" stroke="#8A6234" stroke-width="2"/></svg>',
  // Drawn versions of the toys the younger child meets most, so they look the same on every phone.
  ball: '<svg class="chl-svgpic" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="52" r="40" fill="#2F7DE1"/><ellipse cx="50" cy="52" rx="26" ry="40" fill="#FDD835"/><ellipse cx="50" cy="52" rx="10" ry="40" fill="#E53935"/><circle cx="50" cy="52" r="40" fill="none" stroke="#1E2233" stroke-width="4"/><ellipse cx="34" cy="34" rx="7" ry="11" fill="#fff" opacity=".45" transform="rotate(30 34 34)"/><circle cx="50" cy="13" r="4" fill="#FFFDF7" stroke="#1E2233" stroke-width="2.5"/></svg>',
  teddy: '<svg class="chl-svgpic" viewBox="0 0 100 100" aria-hidden="true"><g stroke="#1E2233" stroke-width="3.5"><ellipse cx="37" cy="93" rx="9" ry="5" fill="#9A6A40"/><ellipse cx="63" cy="93" rx="9" ry="5" fill="#9A6A40"/><ellipse cx="50" cy="78" rx="21" ry="17" fill="#B07A4A"/><ellipse cx="29" cy="74" rx="7" ry="11" fill="#B07A4A" transform="rotate(20 29 74)"/><ellipse cx="71" cy="74" rx="7" ry="11" fill="#B07A4A" transform="rotate(-20 71 74)"/><circle cx="29" cy="24" r="11" fill="#B07A4A"/><circle cx="71" cy="24" r="11" fill="#B07A4A"/><circle cx="50" cy="42" r="24" fill="#B07A4A"/></g><ellipse cx="50" cy="81" rx="10" ry="9" fill="#E8C39E"/><circle cx="29" cy="24" r="5" fill="#E8C39E"/><circle cx="71" cy="24" r="5" fill="#E8C39E"/><ellipse cx="50" cy="51" rx="12" ry="9" fill="#E8C39E"/><ellipse cx="50" cy="47" rx="4.5" ry="3.4" fill="#1E2233"/><circle cx="41" cy="38" r="3.2" fill="#1E2233"/><circle cx="59" cy="38" r="3.2" fill="#1E2233"/><path d="M45 54 Q50 58 55 54" fill="none" stroke="#1E2233" stroke-width="2.4" stroke-linecap="round"/></svg>',
  star: '<svg class="chl-svgpic" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 8 L61 38 L93 39 L68 58 L77 90 L50 71 L23 90 L32 58 L7 39 L39 38 Z" fill="#FDD835" stroke="#1E2233" stroke-width="4" stroke-linejoin="round"/><path d="M50 22 L56 40" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".6"/></svg>',
  apple: '<svg class="chl-svgpic" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 30 Q51 18 57 11" fill="none" stroke="#6D4C41" stroke-width="4.5" stroke-linecap="round"/><path d="M55 21 C62 10 76 11 79 15 C73 24 61 26 55 21 Z" fill="#43A047" stroke="#1E2233" stroke-width="2.5"/><path d="M50 31 C40 22 17 24 17 51 C17 75 34 93 50 87 C66 93 83 75 83 51 C83 24 60 22 50 31 Z" fill="#E53935" stroke="#1E2233" stroke-width="4" stroke-linejoin="round"/><ellipse cx="33" cy="47" rx="5" ry="9" fill="#fff" opacity=".45"/></svg>',
  truck: '<svg class="chl-svgpic" viewBox="0 0 100 100" aria-hidden="true"><path d="M8 64 L8 48 Q8 43 13 43 L32 43 L41 28 Q43 24 48 24 L69 24 Q74 24 76 28 L83 43 L87 43 Q92 43 92 48 L92 64 Z" fill="#FF7A1A" stroke="#1E2233" stroke-width="3.5" stroke-linejoin="round"/><rect x="8" y="51" width="84" height="6" fill="#2F7DE1"/><path d="M46 30 L68 30 L74 43 L40 43 Z" fill="#CDEBFF" stroke="#1E2233" stroke-width="2.5" stroke-linejoin="round"/><g stroke="#1E2233" stroke-width="3.5"><circle cx="27" cy="75" r="16" fill="#2D2C35"/><circle cx="73" cy="75" r="16" fill="#2D2C35"/></g><circle cx="27" cy="75" r="6" fill="#2F7DE1"/><circle cx="73" cy="75" r="6" fill="#2F7DE1"/></svg>',
  box: '<svg class="chl-svgpic" viewBox="0 0 100 100" aria-hidden="true"><path d="M12 38 L50 26 L88 38 L88 80 L50 93 L12 80 Z" fill="#D2A266" stroke="#1E2233" stroke-width="3.5" stroke-linejoin="round"/><path d="M12 38 L50 51 L50 93 L12 80 Z" fill="#B9874E"/><path d="M12 38 L50 51 L88 38 M50 51 L50 93" fill="none" stroke="#1E2233" stroke-width="3" stroke-linejoin="round"/><path d="M12 80 L12 38 L50 26 L88 38 L88 80 L50 93 Z" fill="none" stroke="#1E2233" stroke-width="3.5" stroke-linejoin="round"/></svg>'
};
// Emoji that are swapped for the drawn pictures above wherever they appear in a question.
var DRAWN_FOR = { "⚽": "ball", "🧸": "teddy", "⭐": "star", "🍎": "apple", "🚚": "truck", "📦": "box" };
function drawnPic(p) {
  if (typeof p === "string" && DRAWN_FOR[p]) return { mini: DRAWN_FOR[p] };
  if (p && typeof p === "object" && p.e && DRAWN_FOR[p.e]) return { mini: DRAWN_FOR[p.e], scale: p.scale };
  return p;
}
function useDrawnPics(B) {
  function opt(o) { if (o && o.pic != null) o.pic = drawnPic(o.pic); }
  B.forEach(function (it) {
    (it.options || []).forEach(opt);
    if (it.show) it.show = it.show.map(drawnPic);
    if (it.count) { it.count.emo = it.count.pic; it.count.pic = drawnPic(it.count.pic); }
    if (it.sort) { it.sort.bins.forEach(opt); it.sort.things.forEach(opt); }
    if (it.order) it.order.forEach(opt);
  });
  return B;
}

function renderPic(pic, cls) {
  cls = cls || "";
  if (pic == null) return "";
  if (typeof pic === "string") return '<span class="chl-emo ' + cls + '" aria-hidden="true">' + pic + '</span>';
  if (pic.swatch) return '<span class="chl-swatch ' + cls + '" style="background:' + pic.swatch + '" aria-hidden="true"></span>';
  if (pic.shape) return shapeSvg(pic.shape, pic.color);
  if (pic.clock) return clockSvg(pic.clock[0], pic.clock[1]);
  if (pic.dots != null) return dotsSvg(pic.dots);
  if (pic.num != null) return '<span class="chl-numwrap"><span class="chl-num ' + cls + '">' + esc(pic.num) + '</span>' + (pic.dotsUnder && pic.num <= 10 ? dotsSvg(pic.num) : "") + '</span>';
  if (pic.word != null) return '<span class="chl-word ' + cls + '">' + esc(pic.word) + '</span>';
  if (pic.mini) return pic.scale != null && pic.scale !== 1 ? '<span class="chl-sized" style="--s:' + pic.scale + '">' + (MINI[pic.mini] || "") + '</span>' : (MINI[pic.mini] || "");
  if (pic.e) return '<span class="chl-emo ' + cls + '" style="--s:' + (pic.scale || 1) + '" aria-hidden="true">' + pic.e + '</span>';
  if (pic.row) return '<span class="chl-row">' + pic.row.map(function (p) { return renderPic(p, cls); }).join("") + '</span>';
  return "";
}

/* -------------------------------------------------------- item helpers */
function O(label, pic) { return { label: String(label), pic: pic }; }
function choice(id, skill, level, q, ans, others, extra) {
  var it = { id: id, skill: skill, level: level, type: "choice", q: q, options: [ans].concat(others), answer: ans.label };
  if (extra) for (var k in extra) it[k] = extra[k];
  return it;
}
function numberOpts(n, max, pictorial) {
  max = max || 20;
  var cands = [n - 1, n + 1, n - 2, n + 2, n + 3].filter(function (x) { return x >= 0 && x <= max && x !== n; });
  var pickd = [cands[0], cands[1]];
  if (n === 0) pickd = [1, 2];
  if (n <= 1 && pickd.indexOf(undefined) >= 0) pickd = [n + 1, n + 2];
  return [n].concat(pickd).map(function (x) { return O(String(x), pictorial && x <= 10 ? { num: x, dotsUnder: true } : PIC.num(x)); });
}
var EMO_NAME = { "🔴": "red circle", "🔵": "blue circle", "🟢": "green circle", "🟡": "yellow circle", "🚗": "car", "🚚": "truck", "🚌": "bus", "⭐": "star", "🌙": "moon", "☀️": "sun", "🍎": "apple", "🍌": "banana", "🍇": "grapes", "🐶": "dog", "🐱": "cat", "🐭": "mouse", "🦁": "lion", "🐼": "panda", "🐯": "tiger" };

/* --------------------------------------------------- bank: younger child */
function bank_alfie() {
  var B = [];
  // Counting: tap each one, then pick the number
  var cps = [["🚚", "trucks", "truck"], ["⭐", "stars", "star"], ["🍎", "apples", "apple"]];
  for (var n = 1; n <= 10; n++) {
    for (var c = 0; c < cps.length; c++) {
      var e = cps[c][0], pl = cps[c][1], sg = cps[c][2];
      B.push({ id: "L-count-" + sg + "-" + n, skill: "Counting", level: n <= 4 ? 1 : n <= 7 ? 2 : 3, type: "count",
        count: { pic: e, n: n, noun: sg }, q: "How many " + pl + "? Tap each one to count.", answer: String(n),
        hint: "Let's count together, one by one.", explain: n + " " + (n === 1 ? sg : pl) + "!",
        praise: "You counted every one!", short: "counted " + n + " " + (n === 1 ? sg : pl) });
    }
  }
  for (var b = 11; b <= 20; b++) {
    B.push({ id: "L-count-balloon-" + b, skill: "Counting", level: 3, type: "count", count: { pic: "🎈", n: b, noun: "balloon" },
      q: "So many balloons! Tap each one to count.", answer: String(b), hint: "Let's count them together, slowly.",
      explain: b + " balloons!", praise: "You counted to " + b + "!", short: "counted " + b + " balloons" });
  }

  // Colours
  var COL_THING = { red: "a fire engine", blue: "the sky", yellow: "a banana", green: "grass", orange: "a carrot", purple: "grapes", pink: "a flamingo", brown: "chocolate", black: "a crow", white: "snow" };
  var colLv = { red: 1, blue: 1, yellow: 1, green: 1, orange: 2, purple: 2, pink: 2, brown: 3, black: 3, white: 3 };
  var cn = Object.keys(COLS);
  cn.forEach(function (col, i) {
    var o1 = cn[(i + 3) % 10], o2 = cn[(i + 6) % 10];
    B.push(choice("L-colour-" + col, "Colours", colLv[col], "Which one is " + col + "?", O(col, PIC.swatch(col)),
      [O(o1, PIC.swatch(o1)), O(o2, PIC.swatch(o2))],
      { hint: cap(col) + ", like " + COL_THING[col] + "!", explain: "That's " + col + "!", praise: "You found " + col + "!", short: "found " + col }));
  });
  [["banana", "🍌", "yellow", ["red", "blue"]], ["strawberry", "🍓", "red", ["green", "yellow"]], ["frog", "🐸", "green", ["pink", "orange"]],
   ["carrot", "🥕", "orange", ["blue", "purple"]], ["bunch of grapes", "🍇", "purple", ["yellow", "green"]], ["pig", "🐷", "pink", ["green", "black"]],
   ["bar of chocolate", "🍫", "brown", ["blue", "yellow"]], ["snowman", "⛄", "white", ["red", "green"]]].forEach(function (t) {
    B.push(choice("L-colourof-" + t[2], "Colours", 2, "What colour is a " + t[0] + "?", O(t[2], PIC.swatch(t[2])),
      t[3].map(function (o) { return O(o, PIC.swatch(o)); }),
      { show: [t[1]], hint: "Look at the " + t[0] + "!", explain: cap(an(t[0])) + " is " + t[2] + "!", praise: "You looked carefully!", short: "knew a " + t[0] + " is " + t[2] }));
  });

  // Shapes
  var SHAPE_HINT = { circle: "A circle is round. Like a ball!", square: "Four sides, all the same.", triangle: "A triangle has three sides.", star: "A star has five points.", heart: "A heart is a love shape.", rectangle: "Two long sides, two short sides.", oval: "An oval is like an egg.", diamond: "A diamond is a tipped square." };
  var SH = [["circle", 1], ["square", 1], ["triangle", 1], ["star", 2], ["heart", 2], ["rectangle", 2], ["oval", 3], ["diamond", 3]];
  var SHC = ["#FF7A1A", "#2F7DE1", "#43A047", "#FDD835", "#F06292", "#8E24AA", "#FB8C00", "#4CC3A5"];
  SH.forEach(function (s, i) {
    var o1 = SH[(i + 1) % 8][0], o2 = SH[(i + 3) % 8][0];
    B.push(choice("L-shape-" + s[0], "Shapes", s[1], "Which one is the " + s[0] + "?", O(s[0], PIC.shape(s[0], SHC[i])),
      [O(o1, PIC.shape(o1, SHC[(i + 2) % 8])), O(o2, PIC.shape(o2, SHC[(i + 5) % 8]))],
      { hint: SHAPE_HINT[s[0]], explain: "That's the " + s[0] + "!", praise: "You spotted the " + s[0] + "!", short: "found the " + s[0] }));
  });
  [["pizza slice", "🍕", "triangle", ["circle", "square"], 2], ["ball", "⚽", "circle", ["triangle", "square"], 2], ["door", "🚪", "rectangle", ["circle", "triangle"], 3],
   ["egg", "🥚", "oval", ["triangle", "square"], 3], ["present", "🎁", "square", ["circle", "triangle"], 2]].forEach(function (t, i) {
    B.push(choice("L-shapeof-" + t[2], "Shapes", t[4], "What shape is " + an(t[0]) + "?", O(t[2], PIC.shape(t[2], SHC[i])),
      t[3].map(function (o, j) { return O(o, PIC.shape(o, SHC[(i + j + 3) % 8])); }),
      { show: [t[1]], hint: SHAPE_HINT[t[2]], explain: "It's shaped like " + an(t[2]) + "!", praise: "You matched the shape!", short: "knew " + an(t[0]) + " is " + an(t[2]) }));
  });

  // Big and small
  [["ball", "⚽", "bigger"], ["truck", "🚚", "smaller"], ["star", "⭐", "bigger"], ["apple", "🍎", "smaller"], ["teddy", "🧸", "bigger"]].forEach(function (t) {
    var big = O("big " + t[0], PIC.big(t[1], 1)), small = O("small " + t[0], PIC.big(t[1], 0.5));
    var ans = t[2] === "bigger" ? big : small, oth = t[2] === "bigger" ? small : big;
    B.push(choice("L-size-" + t[0], "Big and small", 1, "Which " + t[0] + " is " + t[2] + "?", ans, [oth],
      { hint: t[2] === "bigger" ? "Bigger takes up more space." : "Smaller takes up less space.", explain: "That one is " + t[2] + "!", praise: "You compared them carefully!", short: "found the " + t[2] + " " + t[0] }));
  });
  [["elephant", "🐘", "mouse", "🐭"], ["bus", "🚌", "bike", "🚲"], ["tree", "🌳", "flower", "🌼"], ["whale", "🐳", "fish", "🐟"], ["horse", "🐴", "cat", "🐱"], ["house", "🏠", "dog", "🐶"]].forEach(function (t) {
    B.push(choice("L-bigger-" + t[0], "Big and small", 2, "Which one is bigger in real life?", O(t[0], t[1]), [O(t[2], t[3])],
      { hint: "How big are they really?", explain: "The " + t[0] + " is much bigger!", praise: "You thought about real life!", short: "knew " + an(t[0]) + " is bigger than " + an(t[2]) }));
  });
  [["ant", "🐜", "elephant", "🐘"], ["mouse", "🐭", "lion", "🦁"], ["cup", "☕", "bath", "🛁"]].forEach(function (t) {
    B.push(choice("L-smaller-" + t[0], "Big and small", 3, "Which one is smaller in real life?", O(t[0], t[1]), [O(t[2], t[3])],
      { hint: "How small are they really?", explain: "The " + t[0] + " is smaller!", praise: "You thought about real life!", short: "knew " + an(t[0]) + " is smaller than " + an(t[2]) }));
  });

  // Animal sounds
  var AN = [["cow", "🐄", "moo", 1], ["dog", "🐶", "woof", 1], ["cat", "🐱", "meow", 1], ["duck", "🦆", "quack", 1], ["lion", "🦁", "roar", 1], ["sheep", "🐑", "baa", 2],
    ["pig", "🐷", "oink", 2], ["horse", "🐴", "neigh", 2], ["mouse", "🐭", "squeak", 2], ["owl", "🦉", "twit-twoo", 3], ["frog", "🐸", "ribbit", 3], ["chick", "🐤", "cheep", 3]];
  AN.forEach(function (a, i) {
    var o1 = AN[(i + 4) % 12], o2 = AN[(i + 7) % 12];
    B.push(choice("L-animal-" + a[0], "Animal sounds", a[3], "Who says " + a[2] + "?", O(a[0], a[1]), [O(o1[0], o1[1]), O(o2[0], o2[1])],
      { say: "Who says " + a[2] + "? " + cap(a[2]) + "!", hint: "Listen: " + a[2] + "! Which animal makes that sound?", explain: "The " + a[0] + " says " + a[2] + "!", praise: "You listened really well!", short: "knew the " + a[0] + " says " + a[2] }));
  });

  // First sounds
  [["b", "buh", "ball", "⚽", ["cat", "🐱"], ["sun", "☀️"], 2], ["c", "kuh", "cat", "🐱", ["moon", "🌙"], ["dog", "🐶"], 2], ["d", "duh", "dog", "🐶", ["fish", "🐟"], ["hat", "🎩"], 2],
   ["s", "sss", "sun", "☀️", ["pig", "🐷"], ["ball", "⚽"], 2], ["m", "mmm", "moon", "🌙", ["tree", "🌳"], ["fish", "🐟"], 2], ["p", "puh", "pig", "🐷", ["sun", "☀️"], ["car", "🚗"], 3],
   ["f", "fff", "fish", "🐟", ["dog", "🐶"], ["moon", "🌙"], 3], ["h", "huh", "hat", "🎩", ["bus", "🚌"], ["pig", "🐷"], 3], ["t", "tuh", "tree", "🌳", ["hat", "🎩"], ["ball", "⚽"], 3],
   ["r", "rrr", "rabbit", "🐰", ["lion", "🦁"], ["fish", "🐟"], 3], ["l", "lll", "lion", "🦁", ["rabbit", "🐰"], ["cat", "🐱"], 3], ["w", "wuh", "whale", "🐳", ["dog", "🐶"], ["sun", "☀️"], 3]
  ].forEach(function (f) {
    B.push(choice("L-sound-" + f[0], "First sounds", f[6], "Which one starts with " + f[1] + "?", O(f[2], f[3]), [O(f[4][0], f[4][1]), O(f[5][0], f[5][1])],
      { say: "Which one starts with " + f[1] + "... " + f[1] + "?", hint: "Say them slowly. Listen to the start!", explain: cap(f[2]) + " starts with " + f[1] + "!", praise: "You listened for the first sound!", short: "heard " + f[2] + " starts with " + f[1] }));
  });

  // Patterns: what comes next?
  [[["🔴", "🔵", "🔴", "🔵"], "🔴", ["🔵", "🟢"], 1], [["🚗", "🚚", "🚗", "🚚"], "🚗", ["🚚", "🚌"], 1], [["⭐", "🌙", "⭐", "🌙"], "⭐", ["🌙", "☀️"], 1],
   [["🍎", "🍌", "🍎", "🍌"], "🍎", ["🍌", "🍇"], 1], [["🦁", "🐼", "🦁", "🐼", "🦁"], "🐼", ["🦁", "🐯"], 2], [["🔴", "🔴", "🔵", "🔴", "🔴"], "🔵", ["🔴", "🟡"], 2],
   [["🐶", "🐶", "🐱", "🐶", "🐶"], "🐱", ["🐶", "🐭"], 2], [["🟡", "🟢", "🟢", "🟡", "🟢"], "🟢", ["🟡", "🔴"], 2], [["🔴", "🟡", "🔵", "🔴", "🟡"], "🔵", ["🔴", "🟡"], 3],
   [["🍎", "🍌", "🍇", "🍎", "🍌"], "🍇", ["🍎", "🍌"], 3]].forEach(function (p, i) {
    B.push(choice("L-pattern-" + i, "Patterns", p[3], "What comes next?", O(EMO_NAME[p[1]], p[1]), p[2].map(function (o) { return O(EMO_NAME[o], o); }),
      { show: p[0].concat(["❔"]), hint: "Say the pattern out loud!", explain: "Next comes the " + EMO_NAME[p[1]] + "!", praise: "You followed the pattern!", short: "finished a pattern" }));
  });
  B.push(choice("L-pattern-grow", "Patterns", 3, "What comes next?", O("4", PIC.dots(4)), [O("2", PIC.dots(2)), O("6", PIC.dots(6))],
    { show: [PIC.dots(1), PIC.dots(2), PIC.dots(3)], hint: "One more each time.", explain: "1, 2, 3, then 4!", praise: "You spotted it grows by one!", short: "saw a growing pattern" }));

  // Matching: what goes together?
  [["bee", "🐝", "honey", "🍯", [["bone", "🦴"], ["carrot", "🥕"]], 2], ["dog", "🐶", "bone", "🦴", [["honey", "🍯"], ["banana", "🍌"]], 2],
   ["rabbit", "🐰", "carrot", "🥕", [["bone", "🦴"], ["fish", "🐟"]], 2], ["monkey", "🐒", "banana", "🍌", [["carrot", "🥕"], ["honey", "🍯"]], 2],
   ["rain cloud", "🌧️", "umbrella", "☂️", [["sunglasses", "🕶️"], ["ice cream", "🍦"]], 3], ["foot", "🦶", "sock", "🧦", [["hat", "🎩"], ["glove", "🧤"]], 3],
   ["key", "🔑", "lock", "🔒", [["spoon", "🥄"], ["sock", "🧦"]], 3], ["toothbrush", "🪥", "tooth", "🦷", [["foot", "🦶"], ["book", "📖"]], 3]].forEach(function (m) {
    B.push(choice("L-match-" + m[2], "Matching", m[5], "What goes with the " + m[0] + "?", O(m[2], m[3]), m[4].map(function (o) { return O(o[0], o[1]); }),
      { show: [m[1]], hint: "What does the " + m[0] + " need?", explain: "It goes with the " + m[2] + "!", praise: "You found the pair!", short: "matched the " + m[0] + " and the " + m[2] }));
  });
  [["fire engine", "🚒", [["police car", "🚓"], ["ambulance", "🚑"]]], ["teddy", "🧸", [["ball", "⚽"], ["kite", "🪁"]]], ["duck", "🦆", [["chick", "🐤"], ["owl", "🦉"]]]].forEach(function (m) {
    B.push(choice("L-same-" + m[0].replace(/ /g, "-"), "Matching", 1, "Find the one that's the same!", O(m[0], m[1]), m[2].map(function (o) { return O(o[0], o[1]); }),
      { show: [m[1]], hint: "Find the same one!", explain: "They're the same!", praise: "You looked really carefully!", short: "found the same " + m[0] }));
  });

  // Feelings
  var FACE = { happy: "😊", sad: "😢", cross: "😠", sleepy: "😴", scared: "😨", surprised: "😮" };
  [["happy", ["sad", "cross"], 1], ["sad", ["happy", "sleepy"], 1], ["cross", ["happy", "sleepy"], 2], ["sleepy", ["happy", "cross"], 2], ["scared", ["happy", "sleepy"], 3], ["surprised", ["sad", "sleepy"], 3]].forEach(function (f) {
    B.push(choice("L-feel-" + f[0], "Feelings", f[2], "Which face looks " + f[0] + "?", O(f[0], FACE[f[0]]), f[1].map(function (o) { return O(o, FACE[o]); }),
      { hint: "Look at the eyes and mouth.", explain: "That face looks " + f[0] + ".", praise: "You read the face!", short: "spotted a " + f[0] + " face" }));
  });
  [["Oh no! The ice cream fell on the floor. How might you feel?", "🍦", "sad", ["happy", "sleepy"], 2], ["It's your birthday party! How might you feel?", "🎂", "happy", ["sad", "cross"], 2],
   ["It's very late and you're so tired. How do you feel?", "🌙", "sleepy", ["happy", "cross"], 2], ["Someone took your toy without asking. How might you feel?", "🧸", "cross", ["happy", "sleepy"], 3],
   ["Thunder goes BOOM! How might you feel?", "⛈️", "scared", ["happy", "sleepy"], 3]].forEach(function (f, i) {
    B.push(choice("L-feelwhen-" + i, "Feelings", f[4], f[0], O(f[2], FACE[f[2]]), f[3].map(function (o) { return O(o, FACE[o]); }),
      { show: [f[1]], hint: "Think about how you'd feel.", explain: "Lots of people would feel " + f[2] + ". All feelings are okay.", praise: "You thought about feelings!", short: "talked about feeling " + f[2] }));
  });

  // Opposites
  [["Which one is hot?", "hot", "🔥", "cold", "☃️", 1], ["Which one is cold?", "cold", "🧊", "hot", "☀️", 1], ["Which one is day?", "day", "☀️", "night", "🌙", 1],
   ["Which one is night?", "night", "🌙", "day", "☀️", 1], ["Which one is fast?", "fast", "🏎️", "slow", "🐌", 2], ["Which one is slow?", "slow", "🐢", "fast", "🐇", 2],
   ["Which book is open?", "open", "📖", "closed", "📕", 3], ["Which one is wet?", "wet", "💧", "dry", "🏜️", 3], ["Which one is loud?", "loud", "🥁", "quiet", "🤫", 3],
   ["Which one goes up?", "up", "🎈", "down", "⚓", 3]].forEach(function (o) {
    B.push(choice("L-opp-" + o[1], "Opposites", o[5], o[0], O(o[1], o[2]), [O(o[3], o[4])],
      { hint: cap(o[1]) + " or " + o[3] + "?", explain: "The opposite of " + o[1] + " is " + o[3] + ".", praise: "You know your opposites!", short: "knew " + o[1] + " and " + o[3] }));
  });

  // Sorting into two baskets
  function sortItem(id, level, q, bins, things, hint) {
    return { id: id, skill: "Sorting", level: level, type: "sort", q: q, sort: { bins: bins, things: things }, answer: "sorted", hint: hint, explain: "Everything is in the right place!", praise: "You sorted them all!", short: "sorted things into groups" };
  }
  function T(label, pic, bin) { return { label: label, pic: pic, bin: bin }; }
  B.push(sortItem("L-sort-redblue", 1, "Red ones in the red box, blue ones in the blue box!", [O("red box", PIC.swatch("red")), O("blue box", PIC.swatch("blue"))],
    [T("red circle", PIC.shape("circle", COLS.red), 0), T("blue star", PIC.shape("star", COLS.blue), 1), T("red heart", PIC.shape("heart", COLS.red), 0), T("blue square", PIC.shape("square", COLS.blue), 1)], "Look at the colour!"));
  B.push(sortItem("L-sort-shapes", 1, "Circles in one box, triangles in the other!", [O("circles", PIC.shape("circle", "#FFFDF7")), O("triangles", PIC.shape("triangle", "#FFFDF7"))],
    [T("orange circle", PIC.shape("circle", "#FF7A1A"), 0), T("green triangle", PIC.shape("triangle", "#43A047"), 1), T("purple triangle", PIC.shape("triangle", "#8E24AA"), 1), T("blue circle", PIC.shape("circle", "#1E88E5"), 0)], "Round, or with corners?"));
  B.push(sortItem("L-sort-fruitcars", 2, "Fruit in the bowl, vehicles in the garage!", [O("fruit bowl", "🧺"), O("garage", "🏠")],
    [T("apple", "🍎", 0), T("car", "🚗", 1), T("banana", "🍌", 0), T("bus", "🚌", 1), T("grapes", "🍇", 0), T("tractor", "🚜", 1)], "Eat it, or drive it?"));
  B.push(sortItem("L-sort-toysclothes", 2, "Toys in the toy box, clothes in the drawer!", [O("toy box", "🧸"), O("clothes drawer", "👕")],
    [T("train", "🚂", 0), T("sock", "🧦", 1), T("ball", "⚽", 0), T("trousers", "👖", 1), T("kite", "🪁", 0), T("cap", "🧢", 1)], "Play with it, or wear it?"));
  B.push(sortItem("L-sort-size", 2, "Big ones in the big box, small ones in the small box!", [O("big box", PIC.big("📦", 1)), O("small box", PIC.big("📦", 0.55))],
    [T("big ball", PIC.big("⚽", 1), 0), T("small ball", PIC.big("⚽", 0.5), 1), T("big apple", PIC.big("🍎", 1), 0), T("small apple", PIC.big("🍎", 0.5), 1)], "Is it big or small?"));
  B.push(sortItem("L-sort-flyswim", 3, "Who flies in the sky, and who swims in the sea?", [O("sky", "☁️"), O("sea", "🌊")],
    [T("bird", "🐦", 0), T("fish", "🐟", 1), T("butterfly", "🦋", 0), T("dolphin", "🐬", 1), T("bee", "🐝", 0), T("octopus", "🐙", 1)], "Does it have wings or fins?"));
  B.push(sortItem("L-sort-daynight", 3, "Day things with the sun, night things with the moon!", [O("day", "☀️"), O("night", "🌙")],
    [T("rainbow", "🌈", 0), T("owl", "🦉", 1), T("sunglasses", "🕶️", 0), T("star", "⭐", 1), T("sunflower", "🌻", 0), T("bat", "🦇", 1)], "When do you see it?"));
  B.push(sortItem("L-sort-hotcold", 3, "Hot things by the fire, cold things by the ice!", [O("hot", "🔥"), O("cold", "🧊")],
    [T("hot drink", "☕", 0), T("ice cream", "🍦", 1), T("soup", "🍲", 0), T("snowman", "⛄", 1), T("sun", "☀️", 0), T("snowflake", "❄️", 1)], "Would it feel hot or cold?"));

  // Sequences: tap them in order
  function orderItem(id, level, q, steps, hint) {
    return { id: id, skill: "Sequences", level: level, type: "order", q: q, order: steps, answer: "in order", hint: hint, explain: "That's the right order!", praise: "You put them in order!", short: "put things in order" };
  }
  B.push(orderItem("L-order-balls", 2, "Smallest first! Tap the balls from small to big.", [O("small ball", PIC.big("⚽", 0.45)), O("middle ball", PIC.big("⚽", 0.72)), O("big ball", PIC.big("⚽", 1))], "Find the smallest one first."));
  B.push(orderItem("L-order-123", 2, "Tap them in order: one, two, three!", [O("one", PIC.dots(1)), O("two", PIC.dots(2)), O("three", PIC.dots(3))], "Which one has just one dot?"));
  B.push(orderItem("L-order-chick", 3, "What happens first? Tap them in order.", [O("egg", "🥚"), O("hatching", "🐣"), O("chick", "🐥")], "The egg comes first."));
  B.push(orderItem("L-order-morning", 3, "Wake up, brush teeth, get dressed! Tap them in order.", [O("wake up", "🛏️"), O("brush teeth", "🪥"), O("get dressed", "👕")], "What do you do first?"));
  B.push(orderItem("L-order-bedtime", 3, "Bath, then a story, then sleep! Tap them in order.", [O("bath", "🛁"), O("story", "📖"), O("sleep", "😴")], "Bath time comes first."));

  // Silly pet: the pet gets it wrong, the child puts it right (by tapping, no reading)
  var YES = O("Yes!", "👍"), NO = O("No, silly!", "👎");
  function silly(id, level, claim, show, right, after) {
    return { id: id, skill: "Silly pet", level: level, type: "teach", claim: claim, show: show, options: [right ? YES : NO, right ? NO : YES], answer: right ? YES.label : NO.label,
      after: after, hint: "Look again. Is {pet} right?", explain: after, praise: "You put {pet} right!", short: "helped {pet} get it right" };
  }
  B.push(silly("L-silly-cow", 2, "This is a cow! Moo!", ["🐶"], false, "Oh! It's a dog. Woof woof!"));
  B.push(silly("L-silly-red", 2, "This one is red!", [PIC.swatch("blue")], false, "Oops! That's blue."));
  B.push(silly("L-silly-duck", 1, "A duck says quack!", ["🦆"], true, "Yay! Quack quack!"));
  B.push(silly("L-silly-triangle", 2, "This is a triangle!", [PIC.shape("circle", COLS.orange)], false, "Silly me! It's a circle."));
  B.push(silly("L-silly-elephant", 1, "An elephant is big!", ["🐘"], true, "Yes! Elephants are very big."));
  B.push(silly("L-silly-banana", 2, "This is a banana!", ["🍎"], false, "Oh! It's an apple."));
  B.push(silly("L-silly-woof", 2, "This cat says woof!", ["🐱"], false, "Cats say meow! Silly me."));
  B.push(silly("L-silly-square", 2, "This is a square!", [PIC.shape("square", COLS.green)], true, "Yay! A square has four sides."));
  // the pet miscounts and the child taps the right number
  [[3, "🚚", 2], [2, "⭐", 3], [4, "🍎", 5], [5, "🦆", 4], [1, "🐸", 2], [6, "🎈", 5]].forEach(function (s, i) {
    var n = s[0];
    B.push({ id: "L-silly-count-" + i, skill: "Silly pet", level: n <= 3 ? 1 : n <= 5 ? 2 : 3, type: "teach", claim: "I count " + s[2] + "! Is that right? How many are there really?",
      show: Array(n).fill(s[1]), options: numberOpts(n, 10, true), answer: String(n), after: "There are " + n + "! Thank you for counting for me.",
      hint: "Count them one at a time.", explain: "There are " + n + ".", praise: "You counted for {pet}!", short: "counted " + n + " for {pet}" });
  });
  // the pet names the wrong picture and the child taps the right one
  [["cow", "🐄", "🐶", "dog", "🐷", "pig"], ["sun", "☀️", "🌙", "moon", "🌳", "tree"], ["truck", "🚚", "🚌", "bus", "🚲", "bike"]].forEach(function (s) {
    B.push({ id: "L-silly-find-" + s[0], skill: "Silly pet", level: 2, type: "teach", claim: "Where's the " + s[0] + "? I think it's this one!",
      show: [s[2]], options: [O(s[0], s[1]), O(s[3], s[2]), O(s[5], s[4])], answer: s[0], after: "That's the " + s[0] + "! Thank you.",
      hint: "{pet} pointed at the wrong one. Which is the " + s[0] + "?", explain: "That's the " + s[0] + ".", praise: "You showed {pet} the " + s[0] + "!", short: "showed {pet} the " + s[0] });
  });
  return B;
}

/* ---------------------------------------------------- bank: older child */
var READ_WORDS = [
  ["the", 1], ["said", 1], ["was", 1], ["they", 1], ["you", 1], ["are", 1], ["my", 1], ["here", 1], ["come", 1], ["some", 1], ["one", 1], ["have", 1], ["do", 1], ["to", 1], ["of", 1],
  ["there", 2], ["love", 2], ["school", 2], ["friend", 2], ["put", 2], ["push", 2], ["pull", 2], ["full", 2], ["house", 2], ["our", 2], ["once", 2], ["ask", 2], ["where", 2], ["today", 2], ["were", 2],
  ["because", 3], ["could", 3], ["would", 3], ["people", 3], ["water", 3], ["again", 3], ["every", 3], ["after", 3], ["children", 3], ["money", 3]
];
function lookAlikes(w, list) {
  var scored = list.filter(function (x) { return x !== w; }).map(function (x) {
    var sc = 0;
    if (x[0] === w[0]) sc += 3;
    if (Math.abs(x.length - w.length) <= 1) sc += 2;
    for (var i = 0; i < x.length; i++) if (w.indexOf(x[i]) >= 0) sc += 0.3;
    if (x[x.length - 1] === w[w.length - 1]) sc += 1;
    return [x, sc];
  }).sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); });
  return [scored[0][0], scored[1][0]];
}
var SPELL_DEFAULT = {
  said: ["sed", "siad", 1], friend: ["frend", "freind", 1], little: ["litle", "littel", 1], school: ["skool", "shool", 1], there: ["thare", "ther", 1], house: ["hous", "howse", 1],
  because: ["becos", "becuase", 2], people: ["peeple", "peopel", 2], could: ["cud", "coud", 2], would: ["wud", "woud", 2], water: ["warter", "watter", 2], again: ["agen", "agian", 2],
  money: ["muny", "monney", 3], every: ["evry", "evrey", 3], beautiful: ["butiful", "beautifull", 3], laugh: ["larf", "lauf", 3]
};
function misspell(w) {
  w = String(w).toLowerCase();
  if (SPELL_DEFAULT[w]) return SPELL_DEFAULT[w].slice(0, 2);
  var out = [], add = function (v) { if (v && v !== w && v.length > 1 && out.indexOf(v) < 0) out.push(v); };
  var vow = "aeiou";
  add(w.replace(/([bcdfglmnprst])\1/, "$1"));                         // drop a double letter
  add(w.replace(/ck/, "k")); add(w.replace(/ph/, "f")); add(w.replace(/^c([aou])/, "k$1"));
  add(w.replace(/e$/, ""));                                            // drop a final e
  for (var i = 1; i < w.length - 1; i++) {                             // swap two middle letters
    if (w[i] !== w[i + 1]) { add(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2)); break; }
  }
  for (var j = 1; j < w.length; j++) {                                 // change one vowel
    var k = vow.indexOf(w[j]);
    if (k >= 0) { add(w.slice(0, j) + vow[(k + 1) % 5] + w.slice(j + 1)); break; }
  }
  add(w.replace(/([bdglmnprt])/, "$1$1"));                             // double a consonant
  while (out.length < 2) add(w + "e".repeat(out.length + 1));
  return out.slice(0, 2);
}
function spellItem(w, level, school) {
  var wrong = misspell(w);
  return { id: (school ? "S-school-" : "S-spell-") + w, skill: "School spellings", level: level, type: "choice", priority: !!school, school: !!school,
    q: "Which is the right way to spell \"" + w + "\"?", say: "Spell the word " + w + ". Which one is right?",
    options: [O(w, PIC.word(w)), O(wrong[0], PIC.word(wrong[0])), O(wrong[1], PIC.word(wrong[1]))], answer: w,
    hint: "Say it slowly and picture the word. Which one looks right?", explain: cap(w) + " is spelt " + w.split("").join("-") + ".",
    praise: "You checked every letter!", short: "spelt \"" + w + "\"" };
}
function parseWords(s) {
  var arr = Array.isArray(s) ? s : String(s || "").split(/[\s,;]+/);
  var seen = {}, out = [];
  arr.forEach(function (w) { w = String(w).toLowerCase().replace(/[^a-z'-]/g, ""); if (w.length >= 2 && !seen[w]) { seen[w] = 1; out.push(w); } });
  return out.slice(0, 40);
}
function exprAnswer(e) { var m = /^(\d+)\s*([+-])\s*(\d+)$/.exec(e); return m[2] === "+" ? +m[1] + +m[3] : +m[1] - +m[3]; }

function bank_ruby() {
  var B = [];
  // Reading words (common exception words)
  var all = READ_WORDS.map(function (x) { return x[0]; });
  READ_WORDS.forEach(function (rw) {
    var w = rw[0], d = lookAlikes(w, all);
    B.push(choice("S-read-" + w, "Reading words", rw[1], "Find the word \"" + w + "\".", O(w, PIC.word(w)), [O(d[0], PIC.word(d[0])), O(d[1], PIC.word(d[1]))],
      { say: "Can you find the word... " + w + "?", hint: "Listen to the first sound, then look at the first letter.", explain: "That word says \"" + w + "\".", praise: "You read it by looking at every letter!", short: "read \"" + w + "\"" }));
  });

  // Phonics: digraphs, rhymes, blending
  [["sh", "shoe", "ship", ["chip", "sip"], 1], ["ch", "cheese", "chin", ["shin", "tin"], 1], ["th", "thumb", "thin", ["fin", "tin"], 1], ["ee", "bee", "feet", ["fat", "fit"], 1],
   ["ng", "ring", "king", ["kit", "kick"], 2], ["ai", "rain", "tail", ["tell", "till"], 2], ["igh", "night", "light", ["lot", "let"], 2], ["oa", "boat", "coat", ["cat", "cut"], 2],
   ["oo", "moon", "spoon", ["span", "spin"], 2], ["ar", "car", "star", ["stir", "stop"], 2], ["or", "fork", "horn", ["hen", "hit"], 3], ["ur", "turn", "burn", ["bin", "ban"], 3],
   ["ow", "cow", "owl", ["all", "ill"], 3], ["oi", "coin", "boil", ["bell", "bowl"], 3]].forEach(function (p) {
    B.push(choice("S-phon-" + p[0], "Phonics", p[4], "Which word has the \"" + p[0] + "\" sound, like in " + p[1] + "?", O(p[2], PIC.word(p[2])), p[3].map(function (o) { return O(o, PIC.word(o)); }),
      { hint: "Say each word slowly. Listen for " + p[0] + ".", explain: cap(p[2]) + " has the " + p[0] + " sound.", praise: "You listened for the sound!", short: "heard \"" + p[0] + "\" in " + p[2] }));
  });
  [["cat", "hat", ["dog", "cup"]], ["sun", "bun", ["sit", "sock"]], ["bee", "tree", ["bed", "bus"]], ["cake", "lake", ["cook", "cut"]], ["frog", "log", ["fig", "fan"]],
   ["star", "car", ["stop", "sun"]], ["king", "ring", ["kite", "cake"]], ["boat", "coat", ["book", "bat"]]].forEach(function (r) {
    B.push(choice("S-rhyme-" + r[0], "Phonics", 1, "Which word rhymes with \"" + r[0] + "\"?", O(r[1], PIC.word(r[1])), r[2].map(function (o) { return O(o, PIC.word(o)); }),
      { hint: "Rhyming words sound the same at the end.", explain: cap(r[0]) + " and " + r[1] + " rhyme!", praise: "You heard the rhyme!", short: "rhymed " + r[0] + " and " + r[1] }));
  });
  [["c-a-t", "kuh... a... tuh", "cat", ["cot", "cut"], 2], ["d-o-g", "duh... o... guh", "dog", ["dig", "dug"], 2], ["s-u-n", "sss... u... nnn", "sun", ["sin", "sat"], 2],
   ["f-i-sh", "fff... i... sh", "fish", ["dish", "fist"], 3], ["ch-i-p", "ch... i... puh", "chip", ["ship", "chop"], 3], ["r-ai-n", "rrr... ai... nnn", "rain", ["ran", "ring"], 3]].forEach(function (b) {
    B.push(choice("S-blend-" + b[2], "Phonics", b[4], "Blend the sounds " + b[0] + ". What word is it?", O(b[2], PIC.word(b[2])), b[3].map(function (o) { return O(o, PIC.word(o)); }),
      { say: "Listen: " + b[1] + " What word is that?", show: [PIC.word(b[0])], hint: "Say the sounds faster and faster until they join up.", explain: b[0] + " makes " + b[2] + "!", praise: "You blended the sounds!", short: "blended " + b[2] }));
  });

  // Spellings (parents can add the school list on top)
  Object.keys(SPELL_DEFAULT).forEach(function (w) { B.push(spellItem(w, SPELL_DEFAULT[w][2], false)); });

  // Number bonds
  for (var a = 0; a <= 10; a++) {
    B.push({ id: "S-bond10-" + a, skill: "Number bonds", level: 1, type: "choice", q: a + " + ? = 10", say: a + " and what make 10?",
      show: [PIC.dots(a)], options: numberOpts(10 - a, 10), answer: String(10 - a), hint: "Count the empty spaces in the ten-frame.",
      explain: a + " + " + (10 - a) + " = 10.", praise: "You found the missing part!", short: a + " and " + (10 - a) + " make 10" });
  }
  for (var c = 11; c <= 19; c++) {
    B.push({ id: "S-bond20-" + c, skill: "Number bonds", level: 2, type: "choice", q: c + " + ? = 20", say: c + " and what make 20?",
      options: numberOpts(20 - c, 20), answer: String(20 - c), hint: (c - 10) + " + ? = 10 helps. It works the same way.",
      explain: c + " + " + (20 - c) + " = 20.", praise: "You used what you know about 10!", short: c + " and " + (20 - c) + " make 20" });
  }
  [[3, 7], [6, 4], [8, 2]].forEach(function (m) {
    B.push({ id: "S-bondfirst-" + m[0], skill: "Number bonds", level: 2, type: "choice", q: "? + " + m[0] + " = 10", say: "What and " + m[0] + " make 10?",
      options: numberOpts(m[1], 10), answer: String(m[1]), hint: "Start at " + m[0] + " and count on to 10.", explain: m[1] + " + " + m[0] + " = 10.", praise: "You counted on!", short: m[1] + " and " + m[0] + " make 10" });
  });
  [["6 and 4", ["5 and 4", "7 and 2"]], ["3 and 7", ["3 and 6", "2 and 7"]], ["8 and 2", ["8 and 3", "6 and 2"]]].forEach(function (p, i) {
    B.push(choice("S-bondpair-" + i, "Number bonds", 2, "Which two numbers make 10?", O(p[0], PIC.word(p[0])), p[1].map(function (o) { return O(o, PIC.word(o)); }),
      { hint: "Add each pair. Which one makes exactly 10?", explain: p[0].replace(" and ", " + ") + " = 10.", praise: "You checked each pair!", short: p[0] + " make 10" }));
  });

  // Adding and taking away
  [["2 + 3", 1], ["4 + 1", 1], ["3 + 3", 1], ["5 + 2", 1], ["6 + 2", 1], ["4 + 4", 1], ["7 - 2", 1], ["9 - 3", 1], ["5 - 1", 1], ["8 - 4", 1],
   ["7 + 5", 2], ["8 + 6", 2], ["9 + 4", 2], ["6 + 6", 2], ["12 - 3", 2], ["15 - 5", 2], ["11 - 2", 2], ["13 - 4", 2],
   ["8 + 7", 3], ["9 + 9", 3], ["17 - 8", 3], ["14 - 6", 3], ["16 - 9", 3], ["20 - 7", 3]].forEach(function (s) {
    var ans = exprAnswer(s[0]), shown = s[0].replace("-", "−");
    B.push({ id: "S-sum-" + s[0].replace(/ /g, ""), skill: "Adding and taking away", level: s[1], type: "choice", q: "What is " + shown + "?",
      say: "What is " + s[0].replace("+", "add").replace("-", "take away") + "?", options: numberOpts(ans, 20), answer: String(ans),
      hint: s[0].indexOf("+") > 0 ? "Start with the bigger number and count on." : "Start with the first number and count back.",
      explain: shown + " = " + ans + ".", praise: "You worked it out step by step!", short: shown + " = " + ans });
  });
  [["{pet} has 3 apples and finds 4 more. How many apples now?", 7, "🍎"], ["There are 10 bubbles. 3 pop! How many are left?", 7, "🔵"],
   ["You have 6 stickers and give 2 to a friend. How many do you have left?", 4, "⭐"], ["5 ducks swim on the pond. 4 more join them. How many ducks now?", 9, "🦆"]].forEach(function (w, i) {
    B.push({ id: "S-story-" + i, skill: "Adding and taking away", level: 2, type: "choice", q: w[0], options: numberOpts(w[1], 20), answer: String(w[1]),
      hint: "Is the number getting bigger or smaller? Then add or take away.", explain: "The answer is " + w[1] + ".", praise: "You worked out the story!", short: "solved a number story" });
  });
  function orderNums(id, level, q, nums, hint) {
    return { id: id, skill: "Numbers", level: level, type: "order", q: q, order: nums.map(function (n) { return O(String(n), PIC.num(n)); }), answer: "in order", hint: hint, explain: nums.join(", ") + ".", praise: "You put them in order!", short: "ordered " + nums.join(", ") };
  }
  B.push(orderNums("S-order-small1", 1, "Tap the numbers from smallest to biggest.", [3, 9, 14, 20], "Which number is the smallest?"));
  B.push(orderNums("S-order-small2", 2, "Tap the numbers from smallest to biggest.", [2, 7, 13, 18], "Which number is the smallest?"));
  B.push(orderNums("S-order-big", 2, "Tap the numbers from biggest to smallest.", [17, 12, 8, 1], "Which number is the biggest?"));
  B.push(orderNums("S-order-twos", 3, "Count in twos! Tap them in order.", [2, 4, 6, 8], "Start at 2, then jump 2 more."));
  B.push(orderNums("S-order-fives", 3, "Count in fives! Tap them in order.", [5, 10, 15, 20], "Start at 5, then jump 5 more."));

  // Telling the time
  [[3, 1], [7, 1], [12, 1], [9, 2], [1, 2], [5, 2]].forEach(function (t) {
    var h = t[0], o1 = ((h + 5) % 12 || 12) + " o'clock";
    B.push(choice("S-time-oc-" + h, "Telling the time", t[1], "What time is it?", O(h + " o'clock", PIC.word(h + " o'clock")), [O(o1, PIC.word(o1)), O("half past " + h, PIC.word("half past " + h))],
      { show: [PIC.clock(h, 0)], hint: "The long hand on 12 means o'clock. Look where the short hand points.", explain: "It's " + h + " o'clock.", praise: "You read both hands!", short: "read " + h + " o'clock" }));
  });
  [[2, ["2 o'clock", "6 o'clock"], 2], [6, ["6 o'clock", "half past 7"], 2], [10, ["10 o'clock", "6 o'clock"], 3], [4, ["4 o'clock", "half past 5"], 3]].forEach(function (t) {
    var a = "half past " + t[0];
    B.push(choice("S-time-half-" + t[0], "Telling the time", t[2], "What time is it?", O(a, PIC.word(a)), t[1].map(function (o) { return O(o, PIC.word(o)); }),
      { show: [PIC.clock(t[0], 30)], hint: "The long hand on 6 means half past. The short hand has just gone past the hour.", explain: "It's half past " + t[0] + ".", praise: "You read both hands!", short: "read half past " + t[0] }));
  });
  B.push(choice("S-time-qp3", "Telling the time", 3, "What time is it?", O("quarter past 3", PIC.word("quarter past 3")), [O("quarter to 3", PIC.word("quarter to 3")), O("3 o'clock", PIC.word("3 o'clock"))],
    { show: [PIC.clock(3, 15)], hint: "The long hand on 3 means quarter past.", explain: "It's quarter past 3.", praise: "You read both hands!", short: "read quarter past 3" }));
  B.push(choice("S-time-qt9", "Telling the time", 3, "What time is it?", O("quarter to 9", PIC.word("quarter to 9")), [O("quarter past 8", PIC.word("quarter past 8")), O("9 o'clock", PIC.word("9 o'clock"))],
    { show: [PIC.clock(8, 45)], hint: "The long hand on 9 means quarter to the next hour.", explain: "It's quarter to 9.", praise: "You read both hands!", short: "read quarter to 9" }));
  [["How many minutes are in an hour?", "60", ["100", "10"], 3], ["How many hours are in a day?", "24", ["12", "60"], 3], ["How many days are in a week?", "7", ["5", "10"], 2],
   ["What day comes after Monday?", "Tuesday", ["Sunday", "Friday"], 1], ["What day comes after Friday?", "Saturday", ["Thursday", "Monday"], 2],
   ["What day comes before Sunday?", "Saturday", ["Monday", "Friday"], 2], ["Which month comes after March?", "April", ["May", "February"], 3],
   ["Which is the first month of the year?", "January", ["June", "December"], 3]].forEach(function (f, i) {
    B.push(choice("S-timefact-" + i, "Telling the time", f[3], f[0], O(f[1], PIC.word(f[1])), f[2].map(function (o) { return O(o, PIC.word(o)); }),
      { hint: "Say them in order out loud to check.", explain: "It's " + f[1] + ".", praise: "You remembered the order!", short: "knew " + f[0].replace("?", "").toLowerCase() + ": " + f[1] }));
  });
  B.push({ id: "S-order-days", skill: "Telling the time", level: 2, type: "order", q: "Tap the days in order, starting with Monday.",
    order: ["Monday", "Tuesday", "Wednesday", "Thursday"].map(function (d) { return O(d, PIC.word(d)); }), answer: "in order",
    hint: "Monday first. What comes after Monday?", explain: "Monday, Tuesday, Wednesday, Thursday.", praise: "You know the days of the week!", short: "put the days in order" });

  // New words
  [["enormous", "very, very big", ["very small", "very fast"], 1], ["tiny", "very, very small", ["very loud", "very big"], 1], ["brave", "not scared to try", ["very sleepy", "very hungry"], 1],
   ["giggle", "a little laugh", ["a big sneeze", "a loud shout"], 1], ["cosy", "warm and comfy", ["cold and wet", "loud and busy"], 1], ["curious", "wanting to find out", ["feeling cross", "being very quiet"], 2],
   ["gentle", "soft and kind", ["loud and rough", "very fast"], 2], ["delicious", "tastes really good", ["smells really bad", "looks very old"], 2], ["whisper", "talk very quietly", ["shout very loudly", "sing a song"], 2],
   ["nibble", "take tiny bites", ["take a big jump", "have a long sleep"], 2], ["grumpy", "in a bad mood", ["very happy", "very tall"], 2], ["sparkle", "shine with little flashes of light", ["make a loud bang", "feel very soft"], 2],
   ["freezing", "very, very cold", ["very, very hot", "very wet"], 2], ["exhausted", "very, very tired", ["very excited", "very hungry"], 3], ["furious", "very, very cross", ["very calm", "very sleepy"], 3],
   ["scorching", "very, very hot", ["very cold", "very windy"], 3], ["peculiar", "strange or unusual", ["very ordinary", "very small"], 3], ["ancient", "very, very old", ["brand new", "very quick"], 3],
   ["fragile", "breaks easily", ["very strong", "very heavy"], 3], ["astonished", "very surprised", ["very bored", "very sleepy"], 3]].forEach(function (v) {
    B.push(choice("S-word-" + v[0], "New words", v[3], "What does \"" + v[0] + "\" mean?", O(cap(v[1]), PIC.word(cap(v[1]))), v[2].map(function (o) { return O(cap(o), PIC.word(cap(o))); }),
      { hint: "Think of a time you might use the word \"" + v[0] + "\".", explain: "\"" + cap(v[0]) + "\" means " + v[1] + ". Can you use it today?", praise: "You worked out a new word!", short: "learned \"" + v[0] + "\"" }));
  });

  // Science facts
  [["What do plants need to grow?", "Sunlight and water", ["Sand and socks", "Chocolate"], 1], ["How many legs does a spider have?", "8", ["6", "4"], 1],
   ["What is ice made of?", "Frozen water", ["Glass", "Sugar"], 1], ["Which planet do we live on?", "Earth", ["Mars", "Jupiter"], 1], ["What do bees make?", "Honey", ["Milk", "Bread"], 1],
   ["What do we breathe in to stay alive?", "Air", ["Water", "Sand"], 1], ["Where do baby birds hatch from?", "Eggs", ["Flowers", "Puddles"], 1], ["Which sense do you use your nose for?", "Smelling", ["Hearing", "Seeing"], 1],
   ["What falls from clouds as soft white flakes?", "Snow", ["Sand", "Leaves"], 1], ["How many legs does an insect have?", "6", ["8", "10"], 2], ["Which season comes after winter?", "Spring", ["Summer", "Autumn"], 2],
   ["Where does a caterpillar change into a butterfly?", "Inside a chrysalis", ["Inside an egg", "Under the sea"], 2], ["What makes a rainbow?", "Sunlight shining through raindrops", ["Paint in the sky", "Thunder"], 2],
   ["What happens to water when it boils?", "It turns into steam", ["It turns into ice", "It turns into juice"], 2], ["What is the Sun?", "A star", ["A planet", "A cloud"], 2],
   ["What does your heart do?", "Pumps blood around your body", ["Helps you smell", "Grows your hair"], 2], ["What holds your body up on the inside?", "Your skeleton", ["Your hair", "Your clothes"], 2],
   ["What does a tadpole grow into?", "A frog", ["A fish", "A duck"], 2], ["Which part of a plant drinks water from the soil?", "The roots", ["The petals", "The seeds"], 2],
   ["What makes a shadow?", "Something blocking the light", ["Rain", "The wind"], 2], ["What can penguins do instead of flying?", "Swim", ["Climb trees", "Dig tunnels"], 2],
   ["Which of these is a mammal?", "Whale", ["Shark", "Frog"], 3], ["Where does the Moon's light come from?", "Sunlight bouncing off it", ["Its own fire", "Lots of light bulbs"], 3],
   ["Which animal is a reptile?", "Snake", ["Frog", "Fish"], 3], ["What do we call an animal that only eats plants?", "A herbivore", ["A carnivore", "A dinosaur"], 3],
   ["Which of these is the hottest?", "The Sun", ["A cup of tea", "A candle"], 3]].forEach(function (f, i) {
    B.push(choice("S-sci-" + i, "Science", f[3], f[0], O(f[1], PIC.word(f[1])), f[2].map(function (o) { return O(o, PIC.word(o)); }),
      { hint: "Think about what you've seen in real life.", explain: f[1] + ".", praise: "You remembered a science fact!", short: "knew: " + f[1].charAt(0).toLowerCase() + f[1].slice(1) }));
  });
  function cycle(id, level, q, steps, hint) {
    return { id: id, skill: "Science", level: level, type: "order", q: q, order: steps, answer: "in order", hint: hint, explain: steps.map(function (s) { return s.label; }).join(", then ") + ".", praise: "You know the life cycle!", short: "ordered a life cycle" };
  }
  B.push(cycle("S-cycle-chick", 1, "How does a hen grow? Tap them in order.", [O("egg", "🥚"), O("hatching chick", "🐣"), O("chick", "🐥"), O("hen", "🐔")], "Everything starts as an egg."));
  B.push(cycle("S-cycle-plant", 2, "How does a sunflower grow? Tap them in order.", [O("seed", PIC.mini("seed")), O("sprout", "🌱"), O("young plant", "🌿"), O("sunflower", "🌻")], "It starts as a tiny seed."));
  B.push(cycle("S-cycle-butterfly", 2, "How does a butterfly grow? Tap them in order.", [O("egg", "🥚"), O("caterpillar", "🐛"), O("chrysalis", PIC.mini("chrysalis")), O("butterfly", "🦋")], "It starts as an egg on a leaf."));
  B.push(cycle("S-cycle-frog", 3, "How does a frog grow? Tap them in order.", [O("frogspawn", PIC.mini("frogspawn")), O("tadpole", PIC.mini("tadpole")), O("frog", "🐸")], "Frogs start as frogspawn in a pond."));

  // Experiments: predict and sort
  function T(label, pic, bin) { return { label: label, pic: pic, bin: bin }; }
  function exSort(id, level, q, bins, things, hint) {
    return { id: id, skill: "Experiments", level: level, type: "sort", q: q, sort: { bins: bins, things: things }, answer: "sorted", hint: hint, explain: "Every one is in the right place.", praise: "You predicted like a scientist!", short: "sorted an experiment" };
  }
  var FS = [O("floats", "⛵"), O("sinks", "⚓")];
  B.push(exSort("S-float-1", 1, "Float or sink? Put each one where you think it goes.", FS, [T("apple", "🍎", 0), T("coin", "🪙", 1), T("leaf", "🍃", 0), T("key", "🔑", 1)], "Is it light and full of air, or small and heavy?"));
  B.push(exSort("S-float-2", 2, "Float or sink? Put each one where you think it goes.", FS, [T("rubber duck", "🦆", 0), T("stone", "🪨", 1), T("feather", "🪶", 0), T("metal spoon", "🥄", 1)], "Is it light and full of air, or small and heavy?"));
  B.push(exSort("S-float-3", 2, "Float or sink? Put each one where you think it goes.", FS, [T("ball", "⚽", 0), T("paper clip", "📎", 1), T("orange", "🍊", 0), T("bolt", "🔩", 1)], "Is it light and full of air, or small and heavy?"));
  B.push(exSort("S-magnet", 3, "Does it stick to a magnet?", [O("sticks", "🧲"), O("doesn't stick", "🚫")], [T("paper clip", "📎", 0), T("apple", "🍎", 1), T("steel bolt", "🔩", 0), T("pencil", "✏️", 1)], "Magnets pull things made of iron and steel."));
  B.push(exSort("S-living", 2, "Living or not living?", [O("living", "🌱"), O("not living", "🪨")], [T("tree", "🌳", 0), T("car", "🚗", 1), T("cat", "🐱", 0), T("teddy", "🧸", 1), T("sunflower", "🌻", 0), T("pencil", "✏️", 1)], "Does it grow, eat or breathe?"));
  [["What colour do blue and yellow paint make?", "Green", ["Orange", "Pink"], 1, [PIC.swatch("blue"), "➕", PIC.swatch("yellow")]],
   ["What colour do red and yellow paint make?", "Orange", ["Purple", "Green"], 1, [PIC.swatch("red"), "➕", PIC.swatch("yellow")]],
   ["What colour do red and blue paint make?", "Purple", ["Green", "Orange"], 2, [PIC.swatch("red"), "➕", PIC.swatch("blue")]],
   ["What colour do red and white paint make?", "Pink", ["Brown", "Blue"], 2, [PIC.swatch("red"), "➕", PIC.swatch("white")]],
   ["What happens to an ice cube left in the sun?", "It melts into water", ["It gets bigger", "It turns into a stone"], 1, ["🧊", "☀️"]],
   ["What happens to water in the freezer?", "It turns into ice", ["It turns into steam", "It disappears"], 1, ["💧", "❄️"]],
   ["What happens when you add bicarbonate of soda to vinegar?", "It fizzes and bubbles", ["It freezes", "It turns into jelly"], 2, ["🧪"]],
   ["What happens when you stir sugar into warm water?", "It dissolves and you can't see it", ["It turns into salt", "It floats on top for ever"], 2, ["🥄"]],
   ["What happens to a plant kept in a dark cupboard for weeks?", "It grows pale and weak", ["It grows bigger and greener", "It turns into a tree"], 3, ["🪴"]],
   ["What happens when you shine a torch at your hand?", "A shadow appears behind it", ["Your hand glows", "It gets cold"], 2, ["🔦", "✋"]],
   ["What happens when you blow air into a balloon?", "It gets bigger", ["It gets heavier than a rock", "It changes colour"], 1, ["🎈"]],
   ["You drop a ball and a feather at the same time. Which lands first?", "The ball", ["The feather", "They float away"], 3, ["⚽", "🪶"]],
   ["What happens when you rub a balloon on your hair?", "Your hair sticks up towards it", ["The balloon pops", "Your hair turns blue"], 3, ["🎈"]]].forEach(function (x, i) {
    B.push(choice("S-exp-" + i, "Experiments", x[3], x[0], O(x[1], PIC.word(x[1])), x[2].map(function (o) { return O(o, PIC.word(o)); }),
      { show: x[4], hint: "Make a prediction, then think about what you've seen before.", explain: x[1] + ".", praise: "You made a great prediction!", short: "predicted: " + x[1].charAt(0).toLowerCase() + x[1].slice(1) }));
  });

  // Feelings and kindness
  [["Your friend is sitting on their own at playtime. What could you do?", "Ask them to play with you", ["Walk away", "Keep playing without them"], 1],
   ["Your little brother knocks over your tower by accident. What could you say?", "\"It's okay, let's build it again\"", ["\"Go away!\"", "Knock his tower down too"], 1],
   ["Someone shares their crayons with you. What do you say?", "\"Thank you!\"", ["\"Give me more\"", "Say nothing"], 1],
   ["You feel really cross. What could help?", "Take three big, slow breaths", ["Throw something", "Shout at someone"], 1],
   ["A new child joins your class and looks nervous. How might they feel?", "Worried", ["Bored", "Silly"], 2],
   ["Your friend falls over in the playground. What could you do?", "Ask if they're okay and help them up", ["Laugh", "Run away"], 1],
   ["You win a game. What's a kind thing to say?", "\"Good game! Want to play again?\"", ["\"I'm the best!\"", "\"That was too easy.\""], 2],
   ["Your little brother is crying because he lost his toy truck. What could you do?", "Help him look for it", ["Tell him to stop", "Hide another toy"], 1],
   ["Someone says something unkind to you. How might you feel?", "Sad or hurt", ["Sleepy", "Hungry"], 2],
   ["{pet} is scared of the dark. What could you say?", "\"I'm here. You're safe.\"", ["\"Boo!\"", "\"Stop worrying and go to sleep.\""], 1],
   ["Which word means feeling worried?", "Nervous", ["Excited", "Proud"], 2],
   ["You make a mistake on your homework. What could you tell yourself?", "\"Mistakes help me learn. I'll try again.\"", ["\"I give up.\"", "\"I'll hide it.\""], 2],
   ["Your friend has a new haircut. What's a kind thing to say?", "\"Your hair looks nice!\"", ["\"It looks funny.\"", "Stare and say nothing"], 2],
   ["You feel proud. What might have happened?", "You did something tricky all by yourself", ["You lost your shoe", "You stubbed your toe"], 3]].forEach(function (k, i) {
    B.push(choice("S-kind-" + i, "Feelings and kindness", k[3], k[0], O(k[1], PIC.word(k[1])), k[2].map(function (o) { return O(o, PIC.word(o)); }),
      { hint: "Think how everyone would feel afterwards.", explain: k[1].replace(/"/g, "") + ".", praise: "You thought about how others feel!", short: "chose a kind answer" }));
  });

  // Teach the pet: the pet makes a mistake and the child corrects it
  var YES = "Yes, that's right!";
  [["I think 3 + 4 = 8!", "No, it's 7", ["Yes, that's right", "No, it's 9"], 1, "3 + 4 = 7. Thank you for teaching me!"],
   ["5 + 5 = 11, I'm sure!", "No, it's 10", ["Yes, that's right", "No, it's 12"], 1, "5 + 5 = 10! Now I know."],
   ["10 take away 3 is 6!", "No, it's 7", ["Yes, that's right", "No, it's 13"], 2, "10 take away 3 is 7. Thank you!"],
   ["6 and 3 make 10!", "No, 6 and 4 make 10", ["Yes, that's right", "No, 6 and 5 make 10"], 1, "6 and 4 make 10. I'll remember that!"],
   ["2 + 2 = 5!", "No, it's 4", ["Yes, that's right", "No, it's 3"], 1, "2 + 2 = 4. Oops!"],
   ["9 take away 9 is 1!", "No, it's 0", ["Yes, that's right", "No, it's 18"], 2, "9 take away 9 leaves nothing at all: 0!"],
   ["Double 4 is 6!", "No, double 4 is 8", ["Yes, that's right", "No, double 4 is 10"], 2, "Double 4 is 4 + 4 = 8!"],
   ["8 + 2 = 10!", YES, ["No, it's 9", "No, it's 11"], 1, "Yay, I got one right!"],
   ["7 + 3 = 9!", "No, it's 10", ["Yes, that's right", "No, it's 4"], 2, "7 + 3 = 10. Thank you!"],
   ["12 take away 2 is 11!", "No, it's 10", ["Yes, that's right", "No, it's 14"], 2, "12 take away 2 is 10."],
   ["Spiders have 6 legs!", "No, spiders have 8 legs", ["Yes, that's right", "No, spiders have 10 legs"], 1, "Spiders have 8 legs, and insects have 6!"],
   ["Insects have 6 legs!", YES, ["No, they have 8", "No, they have 2"], 2, "Yay! Ants, bees and ladybirds all have 6 legs."],
   ["Ice is made of glass!", "No, ice is frozen water", ["Yes, that's right", "No, ice is made of sugar"], 1, "Ice is frozen water. Brrr!"],
   ["Bees make milk!", "No, bees make honey", ["Yes, that's right", "No, bees make bread"], 1, "Bees make honey. Yum!"],
   ["Plants grow by eating sweets!", "No, plants need sunlight and water", ["Yes, that's right", "No, plants eat pizza"], 1, "Plants need sunlight and water. No sweets!"],
   ["Penguins fly high in the sky!", "No, penguins swim instead", ["Yes, that's right", "No, penguins live in trees"], 2, "Penguins can't fly, but they swim really fast!"],
   ["Caterpillars turn into frogs!", "No, they turn into butterflies or moths", ["Yes, that's right", "No, they turn into snails"], 2, "Caterpillars turn into butterflies or moths!"],
   ["Whales are fish!", "No, whales are mammals", ["Yes, that's right", "No, whales are birds"], 3, "Whales are mammals. They breathe air, like us!"],
   ["The Sun is a planet!", "No, the Sun is a star", ["Yes, that's right", "No, the Sun is a cloud"], 2, "The Sun is a star, our very own star!"],
   ["Ice melts in the sunshine!", YES, ["No, it gets bigger", "No, it turns into stone"], 1, "Yay! Ice melts into water."],
   ["Cat starts with a k!", "No, cat starts with a c", ["Yes, that's right", "No, cat starts with a t"], 1, "Cat starts with c. C-a-t!"],
   ["Ship starts with the ch sound!", "No, ship starts with sh", ["Yes, that's right", "No, ship starts with s"], 2, "Ship starts with sh. Shhh!"],
   ["Said is spelt s-e-d!", "No, it's s-a-i-d", ["Yes, that's right", "No, it's s-a-d"], 2, "Said is s-a-i-d. That's a tricky one!"],
   ["Cat rhymes with dog!", "No, cat rhymes with hat", ["Yes, that's right", "No, cat rhymes with cup"], 1, "Cat, hat, bat, mat! They rhyme."],
   ["Friend is spelt f-r-i-e-n-d!", YES, ["No, it's f-r-e-n-d", "No, it's f-r-e-i-n-d"], 3, "Yay! There's an i before the e in friend."],
   ["There are 100 minutes in an hour!", "No, there are 60", ["Yes, that's right", "No, there are 10"], 3, "60 minutes make an hour."],
   ["After Monday comes Wednesday!", "No, Tuesday comes next", ["Yes, that's right", "No, Sunday comes next"], 1, "Monday, Tuesday, Wednesday!"],
   ["A week has 5 days!", "No, a week has 7 days", ["Yes, that's right", "No, a week has 10 days"], 2, "7 days in a week. Let's count them!"],
   ["It's 12 o'clock!", "No, it's 3 o'clock", ["Yes, that's right", "No, it's half past 12"], 2, "The short hand points to 3, so it's 3 o'clock!", [PIC.clock(3, 0)]],
   ["It's half past 4!", YES, ["No, it's 4 o'clock", "No, it's 6 o'clock"], 3, "Yay! The long hand is on 6, so it's half past.", [PIC.clock(4, 30)]]].forEach(function (t, i) {
    B.push({ id: "S-teach-" + i, skill: "Teach the pet", level: t[3], type: "teach", claim: t[0], show: t[5] || null,
      options: [O(t[1], PIC.word(t[1]))].concat(t[2].map(function (o) { return O(o, PIC.word(o)); })), answer: t[1], after: t[4],
      hint: "Hmm, check it carefully. Is {pet} right?", explain: t[4], praise: "You taught {pet} something!", short: "taught {pet}: " + t[4].replace(/[!.]+$/, "") });
  });
  return B;
}
var BANKS = {};
function bankFor(kidId) { kidId = kidKey(kidId); if (!BANKS[kidId]) BANKS[kidId] = useDrawnPics(kidId === "alfie" ? bank_alfie() : bank_ruby()); return BANKS[kidId]; }

/* ------------------------------------------------------------ critters */
var CRITTERS = [
  { id: "tally", name: "Tally", kind: "Countipede", kid: "alfie", skills: ["Counting"], habitat: "garden", color: "#6CC24A",
    blurb: "A wriggly caterpillar with a number on every spot. Tally counts everything: leaves, raindrops, even its own feet.", hello: "H-hello... I'm Tally. Will you count with me?" },
  { id: "pip", name: "Pip", kind: "Colour Chameleon", kid: "alfie", skills: ["Colours"], habitat: "park", color: "#FFB547",
    blurb: "Pip changes colour to match whatever it is thinking about. Say a colour and watch Pip glow.", hello: "Oh! I'm Pip. I go pale when I'm shy. Can you help me find colours?" },
  { id: "shelby", name: "Shelby", kind: "Shape Snail", kid: "alfie", skills: ["Shapes"], habitat: "garden", color: "#8B6FD6",
    blurb: "Shelby's shell is covered in circles, squares and triangles. It carries its favourite shapes everywhere it goes.", hello: "Hello... I'm Shelby. Do you like shapes too?" },
  { id: "echo", name: "Echo", kind: "Sound Bat", kid: "alfie", skills: ["Animal sounds"], habitat: "bedroom", color: "#7E68C6",
    blurb: "Echo hangs by the bedroom window and copies every animal noise it hears. Its favourite is moo.", hello: "Squeak! I'm Echo. Can you guess the animal sounds?" },
  { id: "puff", name: "Puff", kind: "Puffer Fish", kid: "alfie", skills: ["Big and small"], habitat: "bath", color: "#F5A524",
    blurb: "Puff puffs up big when happy and goes small when shy. It lives in the bath with the bubbles.", hello: "Blub... I'm Puff. I'm small right now. Can you tell big from small?" },
  { id: "mumble", name: "Mumble", kind: "Sound Mole", kid: "alfie", skills: ["First sounds"], habitat: "park", color: "#8C6A5D",
    blurb: "Mumble digs tunnels under the park and listens for the very first sound of every word.", hello: "Mmm... I'm Mumble. Listen with me for the very first sound!" },
  { id: "dotty", name: "Dotty", kind: "Pattern Ladybird", kid: "alfie", skills: ["Patterns", "Sequences"], habitat: "kitchen", color: "#E53935",
    blurb: "Dotty's spots go circle, triangle, circle, triangle. It sits on the kitchen herbs and loves anything that repeats.", hello: "Hello! I'm Dotty. What comes next? Let's find out!" },
  { id: "inky", name: "Inky", kind: "Sock Octopus", kid: "alfie", skills: ["Matching"], habitat: "bath", color: "#2E9C83",
    blurb: "Inky has eight arms and spends all day matching odd socks into pairs.", hello: "Oh, hello... I'm Inky. Can you help me find things that go together?" },
  { id: "flip", name: "Flip", kind: "Opposite Otter", kid: "alfie", skills: ["Opposites"], habitat: "park", color: "#9C6B4E",
    blurb: "Flip floats on its back in the pond, so up is down and down is up. It loves opposites.", hello: "Hi... I'm Flip. Hot or cold? Fast or slow? Let's play opposites!" },
  { id: "nutty", name: "Nutty", kind: "Sorting Squirrel", kid: "alfie", skills: ["Sorting"], habitat: "garden", color: "#D98A3F",
    blurb: "Nutty keeps acorns in one basket and berries in the other. Everything has its place.", hello: "Um, hello. I'm Nutty. Will you help me sort?" },
  { id: "glow", name: "Glow", kind: "Feelings Firefly", kid: "both", skills: ["Feelings", "Feelings and kindness"], habitat: "bedroom", color: "#FFD24A",
    blurb: "Glow's light changes with its feelings: blue when shy, yellow when happy, pink when it feels loved.", hello: "Oh... hello. I'm Glow. Can we talk about feelings?" },
  { id: "muddle", name: "Muddle", kind: "Mix-up Magpie", kid: "both", skills: ["Silly pet", "Teach the pet"], habitat: "home", color: "#3B6FD1",
    blurb: "Muddle collects shiny facts but gets them all mixed up. Your pet repeats Muddle's mix-ups, and you put them right.", hello: "Ooh, hello! I'm Muddle. I told {pet} some facts. I might have mixed them up..." },
  { id: "hoot", name: "Hoot", kind: "Word Owl", kid: "ruby", skills: ["Reading words"], habitat: "bedroom", color: "#8B6340",
    blurb: "Hoot reads every book on the shelf at night and loves finding tricky words.", hello: "Hoo... hello. I'm Hoot. Will you read some tricky words with me?" },
  { id: "kiki", name: "Kiki", kind: "Phonics Parakeet", kid: "ruby", skills: ["Phonics"], habitat: "home", color: "#6CC24A",
    blurb: "Kiki chirps sounds all day long: sh, ch, th, ee! It can blend any word.", hello: "Cheep! I'm Kiki. Can you hear the sounds hiding in words?" },
  { id: "webster", name: "Webster", kind: "Spelling Spider", kid: "ruby", skills: ["School spellings"], habitat: "home", color: "#5E4BB0",
    blurb: "Webster spins words into its web, one letter bead at a time. It knows the school spelling list by heart.", hello: "Hello... I'm Webster. I spin words. Will you help me spell them?" },
  { id: "tenna", name: "Tenna", kind: "Number-Bond Bee", kid: "ruby", skills: ["Number bonds"], habitat: "garden", color: "#FFC21A",
    blurb: "Tenna has five dots on each wing. Together they always make ten.", hello: "Bzz... I'm Tenna. Can you find the numbers that make ten?" },
  { id: "pebble", name: "Pebble", kind: "Sum Crab", kid: "ruby", skills: ["Adding and taking away", "Numbers"], habitat: "bath", color: "#E0603F",
    blurb: "Pebble collects pebbles, adds some, gives some away, and counts them all again.", hello: "Click click... I'm Pebble. Shall we add and take away?" },
  { id: "tick", name: "Tick", kind: "Clock Tortoise", kid: "ruby", skills: ["Telling the time"], habitat: "kitchen", color: "#4E8A3E",
    blurb: "Tick's shell is a clock. Tick is never late, just slow.", hello: "Oh, hello... I'm Tick. Can you read my clock?" },
  { id: "nib", name: "Nib", kind: "Word Worm", kid: "ruby", skills: ["New words"], habitat: "kitchen", color: "#FF9DB0",
    blurb: "Nib lives in an apple in the fruit bowl and nibbles one new word every day.", hello: "Hello! I'm Nib. I've found a delicious new word. Want to try it?" },
  { id: "plop", name: "Plop", kind: "Float-or-Sink Frog", kid: "ruby", skills: ["Experiments"], habitat: "park", color: "#3F9A3A",
    blurb: "Plop tests everything in the pond. Does it float, or does it sink? Plop always makes a prediction first.", hello: "Ribbit... I'm Plop. Shall we do an experiment?" },
  { id: "nova", name: "Nova", kind: "Star Moth", kid: "ruby", skills: ["Science"], habitat: "garden", color: "#3B4BA6",
    blurb: "Nova flies out at night and knows a fact about everything it lands on.", hello: "Hello... I'm Nova. Do you want to hear some science?" }
];
var CRITTER_BY_ID = {};
CRITTERS.forEach(function (c) { CRITTER_BY_ID[c.id] = c; c.skill = c.skills[0]; });
function crittersFor(kidId) { kidId = kidKey(kidId); return CRITTERS.filter(function (c) { return c.kid === kidId || c.kid === "both"; }); }

/* ------------------------------------------------------------- learner */
function Learner(kidId, opts) {
  opts = opts || {};
  this.kidId = kidKey(kidId);
  this.seed = (opts.seed != null ? opts.seed : hashStr(this.kidId) + 17) >>> 0;
  this.rng = mulberry32(this.seed);
  this.rec = {}; this.levels = {}; this.recent = {}; this.since = {}; this.skillAdj = {};
  this.aptitude = opts.aptitude != null ? opts.aptitude : BASE_APTITUDE[this.kidId];
  this.newDay = -1; this.newCount = 0;
  this.friendship = {}; this.friends = []; this.recentAll = []; this.recentCritters = [];
  this.bond = {};   // critterId -> { h: hearts (0..HEARTS, in halves), day: last day a heart grew, got: hearts grown that day }
  this.schoolWords = []; this.extra = []; this.history = [];
  this._index();
  if (opts.schoolWords) this.addSchoolWords(opts.schoolWords);
}
Learner.prototype._index = function () {
  var self = this;
  this.items = bankFor(this.kidId).concat(this.extra);
  this.byId = {}; this.skillInfo = {};
  this.items.forEach(function (it) {
    self.byId[it.id] = it;
    var s = self.skillInfo[it.skill] || (self.skillInfo[it.skill] = { min: 9, max: 0, count: 0 });
    s.min = Math.min(s.min, it.level); s.max = Math.max(s.max, it.level); s.count++;
  });
  Object.keys(this.skillInfo).forEach(function (sk) {
    if (self.levels[sk] == null) self.levels[sk] = self.skillInfo[sk].min;
    if (self.skillAdj[sk] == null) self.skillAdj[sk] = ((hashStr(self.kidId + sk + self.seed) % 1000) / 1000 - 0.5) * 0.4;
  });
};
Learner.prototype.levelOf = function (skill) { return this.levels[skill] || 1; };
// School spelling lists are for the reader only; the younger child's practice is spoken and pictorial.
Learner.prototype.addSchoolWords = function (words) {
  var self = this, added = 0;
  if (this.kidId !== "ruby") return 0;
  parseWords(words).forEach(function (w) {
    if (self.schoolWords.indexOf(w) >= 0) return;
    self.schoolWords.push(w);
    var it = spellItem(w, 1, true);
    if (!self.byId[it.id]) { self.extra.push(it); added++; }
  });
  if (added) this._index();
  return added;
};
Learner.prototype.removeSchoolWord = function (w) {
  w = String(w).toLowerCase();
  this.schoolWords = this.schoolWords.filter(function (x) { return x !== w; });
  this.extra = this.extra.filter(function (it) { return it.id !== "S-school-" + w; });
  this._index();
};
// chance the simulated child gets an item right on the first try
Learner.prototype.p = function (item) {
  var r = this.rec[item.id], box = r ? r.box : 0;
  return clamp(0.62 + 0.22 * (this.aptitude + (this.skillAdj[item.skill] || 0) - item.level) + 0.06 * box, 0.08, 0.97);
};
Learner.prototype.pick = function (n, day, o) {
  o = o || {};
  var self = this, rng = o.rng || this.rng, kid = this.kidId;
  if (this.newDay !== day) { this.newDay = day; this.newCount = 0; }
  var skills = o.skills && o.skills.length ? o.skills : null;
  var ex = {}; (o.exclude || []).forEach(function (id) { ex[id] = 1; });
  var out = [];
  function add(it) { if (out.length < n && !ex[it.id]) { out.push(it); ex[it.id] = 1; } }
  var pool = this.items.filter(function (it) { return !skills || skills.indexOf(it.skill) >= 0; });
  var R = this.rec;
  var due = pool.filter(function (it) { return R[it.id] && R[it.id].due <= day; })
    .sort(function (a, b) { return R[a.id].box - R[b.id].box || R[a.id].due - R[b.id].due; });
  var freshAllowed = Math.max(0, MAX_NEW[kid] - this.newCount);
  var fresh = shuffle(pool.filter(function (it) { return !R[it.id] && it.level <= self.levelOf(it.skill); }), rng)
    .sort(function (a, b) {
      return ((b.priority ? 1 : 0) - (a.priority ? 1 : 0)) || (Math.abs(a.level - self.levelOf(a.skill)) - Math.abs(b.level - self.levelOf(b.skill)));
    });
  // When recent answers have been tricky, start with something the child already knows.
  var ra = this.recentAll || [], recentAcc = ra.length >= 4 ? ra.reduce(function (s, x) { return s + x; }, 0) / ra.length : 1;
  if (recentAcc < 0.7) {
    var known = pool.filter(function (it) { return R[it.id] && R[it.id].box >= 2; }).sort(function (a, b) { return R[b.id].box - R[a.id].box; });
    if (known.length) add(known[0]);
    else { var easy = pool.filter(function (it) { return !R[it.id] && it.level === (self.skillInfo[it.skill] || {}).min; }); if (easy.length) add(pickOne(easy, rng)); }
  }
  // Reviews first (Leitner), but always leave room for one new thing.
  var freshSlots = freshAllowed > 0 && fresh.length ? Math.max(1, n - out.length - due.length) : 0;
  due.slice(0, Math.max(0, n - out.length - freshSlots)).forEach(add);
  var nf = 0;
  for (var i = 0; i < fresh.length && out.length < n && nf < freshAllowed; i++) { if (!ex[fresh[i].id]) { add(fresh[i]); nf++; } }
  if (out.length < n) {
    pool.filter(function (it) { return R[it.id] && !ex[it.id]; })
      .sort(function (a, b) { return R[a.id].box - R[b.id].box || R[a.id].due - R[b.id].due; }).forEach(add);
  }
  if (out.length < n) {
    shuffle(pool.filter(function (it) { return !R[it.id] && !ex[it.id]; }), rng)
      .sort(function (a, b) { return a.level - b.level; }).forEach(add);
  }
  if (out.length < n && skills) out = out.concat(this.pick(n - out.length, day, { rng: rng, exclude: Object.keys(ex) }));
  return out;
};
Learner.prototype.answer = function (item, correct, day) {
  var r = this.rec[item.id];
  if (!r) { r = this.rec[item.id] = { box: 0, due: day, seen: 0, right: 0, first: day }; if (this.newDay !== day) { this.newDay = day; this.newCount = 0; } this.newCount++; }
  r.seen++; r.last = day;
  if (correct) { r.right++; r.box = Math.min(5, r.box + 1); this.aptitude += 0.002; } else { r.box = 0; }
  var all = this.recentAll || (this.recentAll = []); all.push(correct ? 1 : 0); if (all.length > 10) all.shift();
  if (this.recentCritters == null) this.recentCritters = [];
  r.due = day + GAPS[r.box];
  var sk = item.skill, rec = this.recent[sk] || (this.recent[sk] = []);
  rec.push(correct ? 1 : 0); if (rec.length > 8) rec.shift();
  this.since[sk] = (this.since[sk] || 0) + 1;
  var info = this.skillInfo[sk] || { min: 1, max: 3 }, lv = this.levelOf(sk), last = rec.slice(-6);
  var acc = last.reduce(function (s, x) { return s + x; }, 0) / last.length, change = null;
  if (this.since[sk] >= 5 && last.length >= 5 && acc >= 0.85 && lv < info.max) { this.levels[sk] = lv + 1; this.since[sk] = 0; change = "up"; }
  else if (this.since[sk] >= 4 && last.length >= 4 && acc <= 0.6 && lv > info.min) { this.levels[sk] = lv - 1; this.since[sk] = 0; change = "down"; }
  this.history.push({ id: item.id, skill: sk, correct: !!correct, day: day });
  if (this.history.length > 400) this.history.splice(0, 100);
  return change;
};
Learner.prototype.isFriend = function (cid) { return this.friends.indexOf(cid) >= 0; };
Learner.prototype.dueCount = function (day, skills) {
  var R = this.rec;
  return this.items.filter(function (it) { return R[it.id] && R[it.id].due <= day && (!skills || skills.indexOf(it.skill) >= 0); }).length;
};
Learner.prototype.stats = function () {
  var R = this.rec, self = this, out = { mastered: 0, learning: 0, "new": 0, total: this.items.length, seen: 0, right: 0, accuracy: 0, bySkill: {}, friends: this.friends.slice(), levels: {} };
  this.items.forEach(function (it) {
    var r = R[it.id], s = out.bySkill[it.skill] || (out.bySkill[it.skill] = { items: 0, seen: 0, right: 0, box: 0, mastered: 0, level: self.levelOf(it.skill), maxLevel: (self.skillInfo[it.skill] || {}).max || 3, _n: 0 });
    s.items++;
    if (!r) { out["new"]++; return; }
    if (r.box >= 4) { out.mastered++; s.mastered++; } else out.learning++;
    out.seen += r.seen; out.right += r.right; s.seen += r.seen; s.right += r.right; s.box += r.box; s._n++;
  });
  Object.keys(out.bySkill).forEach(function (k) { var s = out.bySkill[k]; s.box = s._n ? Math.round(s.box / s._n * 10) / 10 : 0; delete s._n; out.levels[k] = s.level; });
  out.accuracy = out.seen ? Math.round(out.right / out.seen * 100) / 100 : 0;
  return out;
};
Learner.prototype.todaySummary = function (day, ctx) {
  var self = this, h = this.history.filter(function (x) { return x.day === day; });
  var right = h.filter(function (x) { return x.correct; });
  var seen = {}, highlights = [];
  right.forEach(function (x) { var it = self.byId[x.id]; if (it && !seen[it.id]) { seen[it.id] = 1; highlights.push(fill(it.short || ("answered " + it.answer), ctx)); } });
  return { asked: h.length, right: right.length, highlights: highlights.slice(-6) };
};
Learner.prototype.toJSON = function () {
  return { v: 1, kidId: this.kidId, seed: this.seed, rec: this.rec, levels: this.levels, recent: this.recent, since: this.since, skillAdj: this.skillAdj,
    aptitude: Math.round(this.aptitude * 1000) / 1000, newDay: this.newDay, newCount: this.newCount, friendship: this.friendship, friends: this.friends,
    schoolWords: this.schoolWords, history: this.history.slice(-150), recentAll: this.recentAll, recentCritters: this.recentCritters, bond: this.bond };
};
function loadLearner(json) {
  if (typeof json === "string") { try { json = JSON.parse(json); } catch (e) { json = null; } }
  if (!json || !json.kidId) return new Learner("alfie");
  var L = new Learner(json.kidId, { seed: json.seed, aptitude: json.aptitude, schoolWords: json.schoolWords });
  ["rec", "levels", "recent", "since", "skillAdj", "friendship"].forEach(function (k) { if (json[k]) L[k] = json[k]; });
  L.friends = json.friends || []; L.history = json.history || []; L.recentAll = json.recentAll || []; L.recentCritters = json.recentCritters || [];
  L.newDay = json.newDay != null ? json.newDay : -1; L.newCount = json.newCount || 0;
  if (json.bond && typeof json.bond === "object") L.bond = json.bond;
  else {
    // saves from v1.0 kept leftover hearts per critter: carry them over as one heart of progress
    L.bond = {};
    Object.keys(L.friendship || {}).forEach(function (cid) { if (!L.isFriend(cid) && +L.friendship[cid] > 0) L.bond[cid] = { h: 1, day: -1, got: 0 }; });
  }
  L.friends.forEach(function (cid) { L.bond[cid] = { h: HEARTS[L.kidId], day: (L.bond[cid] || {}).day != null ? L.bond[cid].day : -1, got: 0 }; });
  L._index();
  return L;
}
function createLearner(kidId, opts) { return new Learner(kidId, opts); }

/* -------------------------------------------- critter choice, headless */
/* Befriending takes several visits on different days. Each critter has a heart meter
   (HEARTS[kid] hearts). A visit grows it by at most one heart, and only once per critter
   per day: a finished visit (or at least half the visit's petals) fills a whole heart, a
   short visit that was left early fills half a heart. Hearts never go down. When the meter
   is full the critter joins the Friend Book. Friends keep coming back, and those return
   visits are where spaced review happens: the visit picks the friend's due items first. */
function heartsNeeded(kidId) { return HEARTS[kidKey(kidId)] || 3; }
function bondOf(learner, cid) {
  var B = learner.bond || (learner.bond = {});
  var b = B[cid];
  if (!b) b = B[cid] = { h: learner.isFriend(cid) ? heartsNeeded(learner.kidId) : 0, day: -1, got: 0 };
  return b;
}
// how much of a heart this critter can still grow today (0, 0.5 or 1)
function heartRoom(learner, cid, day) {
  if (learner.isFriend(cid)) return 0;
  var b = bondOf(learner, cid);
  var room = b.day === day ? Math.max(0, 1 - (b.got || 0)) : 1;
  return Math.min(room, Math.max(0, heartsNeeded(learner.kidId) - b.h));
}
function openCritters(learner) {
  return crittersFor(learner.kidId).filter(function (c) { return !learner.isFriend(c.id) && learner.bond && learner.bond[c.id] && learner.bond[c.id].h > 0; });
}
function pickCritter(learner, o) {
  o = o || {};
  var rng = o.rng || learner.rng, day = o.day != null ? o.day : 1;
  var all = crittersFor(learner.kidId), list = all;
  if (o.habitat) { var inH = list.filter(function (c) { return c.habitat === o.habitat; }); if (inH.length) list = inH; }
  if (o.exclude) { var notEx = list.filter(function (c) { return o.exclude.indexOf(c.id) < 0; }); if (notEx.length) list = notEx; }
  var rc = learner.recentCritters || [];
  var open = openCritters(learner).length;
  var openMax = learner.friends.length ? OPEN_MAX.later : OPEN_MAX.start;
  // critters whose hearts grew today (including one that became a friend today)
  var grewToday = all.filter(function (c) { var b = learner.bond && learner.bond[c.id]; return b && b.day === day && (b.got || 0) > 0; }).length;
  var mayOpen = open < openMax && grewToday < openMax;
  // Take turns: after a befriending visit, a friend with things to review comes next.
  var last = rc[0], lb = last && learner.bond ? learner.bond[last] : null;
  var lastWasShy = !!last && (!learner.isFriend(last) || (!!lb && lb.day === day && (lb.got || 0) > 0));
  var reviewTurn = lastWasShy && rng() < 0.65;
  var R = learner.rec, best = null, bestScore = -1e9;
  list.forEach(function (c, idx) {
    var friend = learner.isFriend(c.id), b = learner.bond && learner.bond[c.id], h = b ? b.h : 0;
    var due = learner.dueCount(day, c.skills);
    var r = rc.indexOf(c.id), recentPen = r >= 0 ? (4 - r) * 0.9 : 0;
    var score;
    if (friend) score = 2 + Math.min(5, due * 1.2) + (reviewTurn && due >= 2 ? 6 : 0);
    else if (h > 0) { if (heartRoom(learner, c.id, day) > 0) { score = 8; recentPen = 0; } else score = 0.5; }
    else {
      var fresh = learner.items.filter(function (it) { return !R[it.id] && c.skills.indexOf(it.skill) >= 0 && it.level <= learner.levelOf(it.skill); }).length;
      // nobody being befriended right now: meet someone new; otherwise only if there is room
      score = mayOpen ? (open === 0 ? 10 : 7) + Math.min(1.5, fresh * 0.3) - idx * 0.12 : -6;
    }
    score += rng() * 1.5 - recentPen;
    if (score > bestScore) { bestScore = score; best = c; }
  });
  return (best || all[0] || CRITTERS[0]).id;
}
function noteCritter(learner, cid) {
  var rc = learner.recentCritters || (learner.recentCritters = []);
  var i = rc.indexOf(cid); if (i >= 0) rc.splice(i, 1);
  rc.unshift(cid); if (rc.length > 4) rc.length = 4;
}
// The heart this visit has grown so far (for the live meter): never more than today's room.
function visitHeart(petals, meter, room) { return meter > 0 ? Math.min(room, petals / meter) : 0; }
// v: { petals, meter, day, already }
function settleFriendship(learner, cid, v) {
  noteCritter(learner, cid);
  var need = heartsNeeded(learner.kidId), b = bondOf(learner, cid), day = v.day != null ? v.day : 1;
  if (v.already || learner.isFriend(cid)) { b.h = need; return { befriended: true, newFriend: false, hearts: need, heartsNeeded: need, heartGained: 0 }; }
  var f = v.meter > 0 ? v.petals / v.meter : 0;
  var award = f >= 0.5 - 1e-9 ? 1 : f > 0 ? 0.5 : 0;
  var gain = Math.min(award, heartRoom(learner, cid, day));
  if (gain > 0) {
    if (b.day !== day) { b.day = day; b.got = 0; }
    b.got = (b.got || 0) + gain;
    b.h = Math.min(need, Math.round((b.h + gain) * 2) / 2);
  }
  learner.friendship[cid] = b.h;
  if (b.h >= need - 1e-9) {
    if (!learner.isFriend(cid)) learner.friends.push(cid);
    return { befriended: true, newFriend: true, hearts: need, heartsNeeded: need, heartGained: gain };
  }
  return { befriended: false, newFriend: false, hearts: b.h, heartsNeeded: need, heartGained: gain };
}
function simulateSession(learner, o) {
  o = o || {};
  var kid = learner.kidId, rng = o.rng || learner.rng, day = o.day != null ? o.day : 1;
  var ctx = { kid: o.kidName || DEFAULT_NAMES[kid], pet: o.petName || PET_DEFAULT[kid].name };
  var n = o.n || DEFAULT_N[kid];
  var cid = o.critterId && CRITTER_BY_ID[o.critterId] ? o.critterId : pickCritter(learner, { day: day, rng: rng, habitat: o.habitat });
  var c = CRITTER_BY_ID[cid];
  var items = learner.pick(n, day, { skills: c.skills, rng: rng });
  var already = learner.isFriend(cid), meter = items.length, petals = 0;
  var mult = o.skill != null ? o.skill : (o.autoSkill != null ? o.autoSkill : 1);
  var res = [], right = 0, recap = [];
  items.forEach(function (it) {
    var ok = rng() < clamp(learner.p(it) * mult, 0.01, 0.99);
    learner.answer(it, ok, day);
    if (ok) { right++; recap.push(fill(it.short, ctx)); }
    petals = Math.min(meter, petals + (ok ? 1 : 0.5));
    res.push({ id: it.id, skill: it.skill, type: it.type, correct: ok });
  });
  var f = settleFriendship(learner, cid, { petals: petals, meter: meter, day: day, already: already });
  return { critterId: cid, befriended: f.befriended, newFriend: f.newFriend, alreadyFriend: already, asked: items.length, right: right, items: res,
    seconds: Math.round(items.length * SECONDS_PER_ITEM[kid] + 12), aborted: false, petals: petals, meter: meter, recap: recap,
    hearts: f.hearts, heartsNeeded: f.heartsNeeded, heartGained: f.heartGained };
}

/* --------------------------------------------------------- critter art */
var INK = "#1E2233", svgUid = 0;
// every SVG this file draws gets its own id prefix, so many copies can share one page
function svgId(tag) { return "chl" + SVG_SALT + "-" + (++svgUid) + (tag || ""); }
function f1(n) { return Math.round(n * 10) / 10; }
function eye(x, y, r, m, lid) {
  var sw = f1(Math.max(1.6, r * 0.2));
  if (m === "friend") return '<path d="M' + f1(x - r) + ' ' + f1(y + r * 0.25) + ' Q ' + x + ' ' + f1(y - r * 1.05) + ' ' + f1(x + r) + ' ' + f1(y + r * 0.25) + '" fill="none" stroke="' + INK + '" stroke-width="' + f1(Math.max(2.6, r * 0.42)) + '" stroke-linecap="round"/>';
  var pr = r * 0.66, dx = m === "shy" ? -r * 0.3 : r * 0.04, dy = m === "shy" ? r * 0.26 : 0;
  var s = '<ellipse cx="' + x + '" cy="' + y + '" rx="' + r + '" ry="' + f1(r * 1.1) + '" fill="#fff" stroke="' + INK + '" stroke-width="' + sw + '"/>';
  s += '<circle cx="' + f1(x + dx) + '" cy="' + f1(y + dy) + '" r="' + f1(pr) + '" fill="' + INK + '"/>';
  s += '<circle cx="' + f1(x + dx - pr * 0.36) + '" cy="' + f1(y + dy - pr * 0.4) + '" r="' + f1(pr * 0.36) + '" fill="#fff"/>';
  s += '<circle cx="' + f1(x + dx + pr * 0.32) + '" cy="' + f1(y + dy + pr * 0.32) + '" r="' + f1(pr * 0.16) + '" fill="#fff"/>';
  if (m === "shy" && lid) {
    s += '<path d="M' + f1(x - r * 1.18) + ' ' + f1(y - r * 0.15) + ' Q ' + x + ' ' + f1(y - r * 0.75) + ' ' + f1(x + r * 1.18) + ' ' + f1(y - r * 0.15) + ' L ' + f1(x + r * 1.18) + ' ' + f1(y - r * 1.35) + ' L ' + f1(x - r * 1.18) + ' ' + f1(y - r * 1.35) + ' Z" fill="' + lid + '"/>';
    s += '<path d="M' + f1(x - r * 1.05) + ' ' + f1(y - r * 0.2) + ' Q ' + x + ' ' + f1(y - r * 0.72) + ' ' + f1(x + r * 1.05) + ' ' + f1(y - r * 0.2) + '" fill="none" stroke="' + INK + '" stroke-width="' + sw + '" stroke-linecap="round"/>';
  }
  return s;
}
function mouth(x, y, w, m, ink) {
  ink = ink || INK;
  if (m === "shy") return '<path d="M' + f1(x - w * 0.35) + ' ' + y + ' q ' + f1(w * 0.175) + ' ' + f1(-w * 0.16) + ' ' + f1(w * 0.35) + ' 0 t ' + f1(w * 0.35) + ' 0" fill="none" stroke="' + ink + '" stroke-width="2.6" stroke-linecap="round"/>';
  var ww = m === "friend" ? w * 1.2 : w;
  return '<path d="M' + f1(x - ww / 2) + ' ' + y + ' Q ' + x + ' ' + f1(y + ww * 0.62) + ' ' + f1(x + ww / 2) + ' ' + y + ' Z" fill="#7A2E2E" stroke="' + ink + '" stroke-width="2.2" stroke-linejoin="round"/>' +
    '<path d="M' + f1(x - ww * 0.2) + ' ' + f1(y + ww * 0.2) + ' Q ' + x + ' ' + f1(y + ww * 0.08) + ' ' + f1(x + ww * 0.2) + ' ' + f1(y + ww * 0.2) + ' Q ' + x + ' ' + f1(y + ww * 0.34) + ' ' + f1(x - ww * 0.2) + ' ' + f1(y + ww * 0.2) + ' Z" fill="#FF8FA3"/>';
}
function blush(x, y, rx, m) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + f1(rx * 0.6) + '" fill="#FF8FA3" opacity="' + (m === "shy" ? 0.8 : 0.45) + '"/>'; }
function rg(id, a, b) { return '<radialGradient id="' + id + '" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></radialGradient>'; }
function lg(id, stops, vertical) {
  return '<linearGradient id="' + id + '" x1="0" y1="0" x2="' + (vertical ? 0 : 1) + '" y2="' + (vertical ? 1 : 0) + '">' + stops.map(function (s, i) { return '<stop offset="' + (i / (stops.length - 1)) + '" stop-color="' + s + '"/>'; }).join("") + '</linearGradient>';
}
function heart(x, y, s, c) { return '<path transform="translate(' + x + ' ' + y + ') scale(' + s + ')" d="M12 21C12 21 3 15.5 3 9.5C3 6.4 5.4 4 8.4 4C10 4 11.3 4.8 12 6C12.7 4.8 14 4 15.6 4C18.6 4 21 6.4 21 9.5C21 15.5 12 21 12 21Z" fill="' + c + '" stroke="' + INK + '" stroke-width="1.6"/>'; }
function sparkle(x, y, s, c) { return '<path transform="translate(' + x + ' ' + y + ') scale(' + s + ')" d="M0 -10 L2.6 -2.6 L10 0 L2.6 2.6 L0 10 L-2.6 2.6 L-10 0 L-2.6 -2.6 Z" fill="' + c + '"/>'; }
function line(d, w, c) { return '<path d="' + d + '" fill="none" stroke="' + (c || INK) + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"/>'; }
function limb(d, w, c) { return line(d, w + 4, INK) + line(d, w, c); }
function sock(x, y, rot, c, flip) {
  return '<g transform="translate(' + x + ' ' + y + ') rotate(' + rot + ')' + (flip ? ' scale(-1 1)' : '') + '"><path d="M-6 -14 L6 -14 L6 2 Q6 8 12 8 L16 8 Q20 8 20 12 Q20 16 16 16 L-2 16 Q-6 16 -6 12 Z" fill="' + c + '" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/><path d="M-6 -8 L6 -8 M-6 -3 L6 -3" stroke="#fff" stroke-width="2"/></g>';
}
function extras(m) {
  if (m === "friend") return heart(10, 18, 1.1, "#FF6F91") + heart(160, 10, 0.85, "#FF8FB1") + heart(170, 52, 0.6, "#FF6F91") + sparkle(40, 60, 0.7, "#FFD84A") + sparkle(150, 100, 0.6, "#FFD84A");
  if (m === "happy") return sparkle(26, 36, 0.8, "#FFD84A") + sparkle(176, 34, 0.6, "#FFD84A");
  return '<path d="M30 30 q 6 9 0 14 q -6 -5 0 -14 Z" fill="#9ED8F0" stroke="' + INK + '" stroke-width="1.6"/>';
}

var ART = {
  tally: function (P, m) {
    var defs = rg(P + "b", "#B6F08F", "#4E9E46") + rg(P + "h", "#C4F59E", "#58AE4C");
    var seg = [[36, 150, 17], [64, 140, 20], [94, 134, 22], [124, 138, 22]], s = "";
    seg.forEach(function (g) { s += '<ellipse cx="' + (g[0] - 7) + '" cy="' + (g[1] + g[2] - 2) + '" rx="5" ry="3.5" fill="#3E7F38" stroke="' + INK + '" stroke-width="1.5"/><ellipse cx="' + (g[0] + 7) + '" cy="' + (g[1] + g[2] - 2) + '" rx="5" ry="3.5" fill="#3E7F38" stroke="' + INK + '" stroke-width="1.5"/>'; });
    seg.forEach(function (g, i) {
      s += '<circle cx="' + g[0] + '" cy="' + g[1] + '" r="' + g[2] + '" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3"/>';
      s += '<circle cx="' + g[0] + '" cy="' + f1(g[1] - g[2] * 0.3) + '" r="' + f1(g[2] * 0.42) + '" fill="#FFE36E" stroke="' + INK + '" stroke-width="2"/>';
      s += '<text x="' + g[0] + '" y="' + f1(g[1] - g[2] * 0.3 + g[2] * 0.18) + '" text-anchor="middle" font-size="' + f1(g[2] * 0.52) + '" font-weight="800" fill="' + INK + '" font-family="system-ui,sans-serif">' + (i + 1) + '</text>';
    });
    s += line("M140 84 Q 132 60 122 52", 3) + line("M164 82 Q 170 58 180 50", 3);
    s += '<circle cx="122" cy="50" r="6" fill="#FF8FB1" stroke="' + INK + '" stroke-width="2"/><circle cx="180" cy="48" r="6" fill="#FF8FB1" stroke="' + INK + '" stroke-width="2"/>';
    s += '<circle cx="152" cy="108" r="30" fill="url(#' + P + 'h)" stroke="' + INK + '" stroke-width="3"/>';
    s += eye(141, 104, 8, m, "#8AD36C") + eye(163, 104, 8, m, "#8AD36C") + mouth(152, 120, 14, m) + blush(133, 118, 6, m) + blush(171, 118, 6, m);
    return { defs: defs, body: s };
  },
  pip: function (P, m) {
    var cols = m === "shy" ? ["#D8E8DA", "#E0E6D2", "#E3DEEB", "#D5E1F0", "#DCD3F2"] : ["#FF6B6B", "#FFB547", "#FFE36E", "#7BD36A", "#5EC8F2", "#A88BEB"];
    var defs = lg(P + "r", cols) + rg(P + "hd", m === "shy" ? "#E9E4F7" : "#9FE0FA", m === "shy" ? "#C9BEE6" : "#A88BEB");
    var head = m === "shy" ? "#D9D0F0" : "#A88BEB", s = "";
    s += '<path d="M10 160 Q 100 148 190 160 L 190 171 Q 100 159 10 171 Z" fill="#A0703F" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>';
    s += '<ellipse cx="34" cy="156" rx="9" ry="5" fill="#6CC24A" stroke="' + INK + '" stroke-width="2" transform="rotate(-25 34 156)"/><ellipse cx="174" cy="156" rx="9" ry="5" fill="#6CC24A" stroke="' + INK + '" stroke-width="2" transform="rotate(20 174 156)"/>';
    var tail = "M60 132 C 30 136 26 174 52 174 C 72 174 72 150 56 150 C 48 150 48 162 55 162";
    s += line(tail, 18, INK) + line(tail, 12, cols[1]);
    s += limb("M74 138 L 66 158", 6, cols[2]) + limb("M88 142 L 86 160", 6, cols[3]) + limb("M118 142 L 122 160", 6, cols[4]) + limb("M130 138 L 138 158", 6, cols[cols.length - 1]);
    s += '<path d="M70 101 q6 -12 12 0 q6 -12 12 0 q6 -12 12 0 q6 -12 12 0" fill="#FF8FB1" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>';
    s += '<ellipse cx="100" cy="124" rx="44" ry="27" fill="url(#' + P + 'r)" stroke="' + INK + '" stroke-width="3"/>';
    s += '<path d="M126 104 Q 150 84 174 104 Q 184 117 168 129 Q 150 138 126 130 Z" fill="url(#' + P + 'hd)" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>';
    s += '<path d="M134 102 Q 146 74 166 96" fill="url(#' + P + 'hd)" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>';
    s += '<circle cx="150" cy="108" r="13" fill="' + head + '" stroke="' + INK + '" stroke-width="3"/>' + eye(150, 108, 8.5, m, head);
    s += m === "shy" ? line("M158 124 q4 -2 8 0", 2.6) : line("M146 122 Q 162 132 176 117", 2.6);
    s += blush(138, 122, 6, m);
    return { defs: defs, body: s };
  },
  shelby: function (P, m) {
    var defs = rg(P + "s", "#E9DFFF", "#8B6FD6") + rg(P + "b", "#D4EEFF", "#5FA8D3");
    var s = '<ellipse cx="96" cy="162" rx="74" ry="14" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3"/>';
    s += '<circle cx="86" cy="112" r="44" fill="url(#' + P + 's)" stroke="' + INK + '" stroke-width="3"/>';
    s += '<path d="M86 112 m-5 0 a5 5 0 1 1 10 0 a10 10 0 1 1 -20 0 a15 15 0 1 1 30 0 a20 20 0 1 1 -40 0 a25 25 0 1 1 50 0" fill="none" stroke="' + INK + '" stroke-width="3" opacity=".3"/>';
    s += '<circle cx="58" cy="98" r="7.5" fill="#FFE36E" stroke="' + INK + '" stroke-width="2"/><path d="M99 70 L108 86 L90 86 Z" fill="#FF8FB1" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/>';
    s += '<rect x="106" y="108" width="14" height="14" rx="2" fill="#7BD36A" stroke="' + INK + '" stroke-width="2" transform="rotate(12 113 115)"/>';
    s += '<g transform="translate(62 128) scale(0.2)"><path d="M50 8 L61 38 L93 39 L68 58 L77 90 L50 71 L23 90 L32 58 L7 39 L39 38 Z" fill="#FFB547" stroke="' + INK + '" stroke-width="10" stroke-linejoin="round"/></g>';
    s += '<path d="M132 160 L 136 104 Q 138 80 155 80 Q 172 80 174 104 L 170 160 Z" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>';
    s += line("M146 86 L 138 60", 3) + line("M164 86 L 172 60", 3);
    s += eye(138, 54, 9, m, "#9ED3F2") + eye(172, 54, 9, m, "#9ED3F2") + mouth(155, 110, 14, m) + blush(142, 104, 5, m) + blush(168, 104, 5, m);
    return { defs: defs, body: s };
  },
  echo: function (P, m) {
    var defs = rg(P + "b", "#D3C5F8", "#6C55B8"), s = "";
    s += '<path d="M66 110 Q 30 84 12 104 Q 26 106 28 120 Q 38 112 46 126 Q 54 116 64 128 Z" fill="#7E68C6" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>';
    s += '<path d="M134 110 Q 170 84 188 104 Q 174 106 172 120 Q 162 112 154 126 Q 146 116 136 128 Z" fill="#7E68C6" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>';
    s += '<path d="M72 84 L 60 36 Q 84 50 92 74 Z" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/><path d="M72 76 L 66 50 Q 80 58 84 72 Z" fill="#FFB8CC"/>';
    s += '<path d="M128 84 L 140 36 Q 116 50 108 74 Z" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/><path d="M128 76 L 134 50 Q 120 58 116 72 Z" fill="#FFB8CC"/>';
    s += '<ellipse cx="88" cy="154" rx="7" ry="5" fill="#5B4699" stroke="' + INK + '" stroke-width="2"/><ellipse cx="112" cy="154" rx="7" ry="5" fill="#5B4699" stroke="' + INK + '" stroke-width="2"/>';
    s += '<circle cx="100" cy="112" r="42" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3"/>';
    s += '<path d="M88 72 q6 -10 12 0 q6 -10 12 0" fill="#B9A8EE" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>';
    s += '<ellipse cx="100" cy="132" rx="24" ry="17" fill="#E6DDFB"/>';
    s += eye(85, 104, 10, m, "#A693E2") + eye(115, 104, 10, m, "#A693E2") + mouth(100, 121, 14, m) + blush(71, 118, 6, m) + blush(129, 118, 6, m);
    if (m !== "shy") s += '<path d="M103 121.5 l2.5 5 l2.5 -5 Z" fill="#fff" stroke="' + INK + '" stroke-width="1.2" stroke-linejoin="round"/>';
    if (m !== "shy") {
      s += '<g fill="' + INK + '"><ellipse cx="164" cy="64" rx="6" ry="4.5" transform="rotate(-20 164 64)"/><rect x="168.5" y="38" width="2.6" height="26"/><path d="M171 38 q10 4 10 14 q-4 -6 -10 -6 Z"/></g>';
      s += '<g fill="' + INK + '" opacity=".75"><ellipse cx="34" cy="58" rx="5" ry="3.8" transform="rotate(-20 34 58)"/><rect x="37.6" y="36" width="2.2" height="22"/></g>';
    }
    return { defs: defs, body: s };
  },
  puff: function (P, m) {
    var r = m === "shy" ? 36 : 44, cx = 98, cy = 114, s = "";
    var defs = rg(P + "b", "#FFEDB0", "#F5A524");
    s += '<path d="M' + (cx - r + 6) + ' ' + cy + ' L ' + (cx - r - 22) + ' ' + (cy - 18) + ' Q ' + (cx - r - 14) + ' ' + cy + ' ' + (cx - r - 22) + ' ' + (cy + 18) + ' Z" fill="#FFB547" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>';
    for (var k = 0; k < 12; k++) {
      var a = k * Math.PI / 6 + 0.26, tip = r + (m === "shy" ? 7 : 14), d = 0.16;
      s += '<path d="M' + f1(cx + Math.cos(a - d) * (r - 2)) + ' ' + f1(cy + Math.sin(a - d) * (r - 2)) + ' L ' + f1(cx + Math.cos(a) * tip) + ' ' + f1(cy + Math.sin(a) * tip) + ' L ' + f1(cx + Math.cos(a + d) * (r - 2)) + ' ' + f1(cy + Math.sin(a + d) * (r - 2)) + ' Z" fill="#F5A524" stroke="' + INK + '" stroke-width="2.4" stroke-linejoin="round"/>';
    }
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3"/>';
    s += '<ellipse cx="' + cx + '" cy="' + f1(cy + r * 0.45) + '" rx="' + f1(r * 0.68) + '" ry="' + f1(r * 0.38) + '" fill="#FFF4D2" opacity=".9"/>';
    s += '<path d="M' + (cx - 12) + ' ' + (cy + 8) + ' q -14 6 -6 18 q 8 -4 12 -14 Z" fill="#FFB547" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/>';
    var er = f1(r * 0.21), ex1 = f1(cx + r * 0.12), ex2 = f1(cx + r * 0.6), ey = f1(cy - r * 0.2);
    s += eye(ex1, ey, er, m, "#FFD36B") + eye(ex2, ey, er, m, "#FFD36B");
    s += m === "shy" ? '<circle cx="' + f1(cx + r * 0.36) + '" cy="' + f1(cy + r * 0.25) + '" r="4" fill="#7A2E2E" stroke="' + INK + '" stroke-width="2"/>' : mouth(f1(cx + r * 0.36), f1(cy + r * 0.18), 14, m);
    s += blush(f1(cx - r * 0.12), f1(cy + r * 0.1), 5, m) + blush(f1(cx + r * 0.84), f1(cy + r * 0.1), 4, m);
    s += '<g fill="rgba(255,255,255,.65)" stroke="#6EC6F0" stroke-width="2.5"><circle cx="160" cy="58" r="6"/><circle cx="172" cy="40" r="4"/><circle cx="156" cy="30" r="3"/></g>';
    return { defs: defs, body: s };
  },
  mumble: function (P, m) {
    var defs = rg(P + "b", "#A88272", "#6B4E43"), s = "";
    s += '<ellipse cx="64" cy="108" rx="8" ry="10" fill="#8C6A5D" stroke="' + INK + '" stroke-width="2.5"/><ellipse cx="136" cy="108" rx="8" ry="10" fill="#8C6A5D" stroke="' + INK + '" stroke-width="2.5"/>';
    s += '<path d="M60 170 Q 54 96 100 90 Q 146 96 140 170 Z" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>';
    s += '<path d="M78 170 Q 76 130 100 128 Q 124 130 122 170 Z" fill="#C8A99A"/>';
    s += '<path d="M14 186 Q 26 150 62 154 Q 100 146 138 154 Q 174 150 186 186 Z" fill="#A9764A" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>';
    s += '<g fill="#8A5C34"><circle cx="40" cy="172" r="5"/><circle cx="160" cy="170" r="4"/><circle cx="120" cy="178" r="3.5"/><circle cx="76" cy="180" r="3"/></g>';
    s += '<g><ellipse cx="72" cy="160" rx="13" ry="9" fill="#F2C3A6" stroke="' + INK + '" stroke-width="2.5"/>' + line("M64 158 l-2 7 M70 160 l-1 7 M77 160 l0 7", 1.8) + '</g>';
    s += '<g><ellipse cx="128" cy="160" rx="13" ry="9" fill="#F2C3A6" stroke="' + INK + '" stroke-width="2.5"/>' + line("M136 158 l2 7 M130 160 l1 7 M123 160 l0 7", 1.8) + '</g>';
    s += eye(86, 110, 6, m, "#8C6A5D") + eye(114, 110, 6, m, "#8C6A5D");
    s += '<ellipse cx="100" cy="124" rx="12" ry="9" fill="#FF9DB0" stroke="' + INK + '" stroke-width="2.5"/><ellipse cx="96" cy="121" rx="3.5" ry="2" fill="#fff" opacity=".7"/>';
    s += mouth(100, 138, 12, m) + blush(78, 128, 5, m) + blush(122, 128, 5, m);
    if (m !== "shy") s += line("M150 96 q8 8 0 16", 2.5, "#8C6A5D") + line("M158 90 q12 14 0 28", 2.5, "#8C6A5D");
    s += '<rect x="148" y="34" width="30" height="30" rx="7" fill="#FFF8EC" stroke="' + INK + '" stroke-width="2.5" transform="rotate(8 163 49)"/><text x="163" y="57" text-anchor="middle" font-size="22" font-weight="800" fill="#2F7DE1" font-family="system-ui,sans-serif" transform="rotate(8 163 49)">b</text>';
    return { defs: defs, body: s };
  },
  dotty: function (P, m) {
    var defs = rg(P + "b", "#FF9EA1", "#D93A40"), s = "";
    s += line("M58 120 L 36 128 M58 140 L 34 152 M64 158 L 46 174 M142 120 L 164 128 M142 140 L 166 152 M136 158 L 154 174", 4);
    s += '<ellipse cx="100" cy="134" rx="52" ry="44" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3"/>' + line("M100 92 L 100 177", 2.5);
    s += '<g fill="#2D2C35"><circle cx="74" cy="114" r="8"/><path d="M70 133 L79 149 L61 149 Z"/><circle cx="80" cy="166" r="7"/><path d="M130 105 L139 121 L121 121 Z"/><circle cx="130" cy="142" r="8"/><path d="M120 158 L128 172 L112 172 Z"/></g>';
    s += '<ellipse cx="70" cy="112" rx="10" ry="6" fill="#fff" opacity=".3"/>';
    s += line("M88 62 Q 80 42 70 38", 3) + line("M112 62 Q 120 42 130 38", 3);
    s += '<circle cx="70" cy="38" r="5" fill="#FFE36E" stroke="' + INK + '" stroke-width="2"/><circle cx="130" cy="38" r="5" fill="#FFE36E" stroke="' + INK + '" stroke-width="2"/>';
    s += '<circle cx="100" cy="82" r="26" fill="#2D2C35" stroke="' + INK + '" stroke-width="3"/>';
    s += eye(90, 80, 8, m, "#2D2C35") + eye(110, 80, 8, m, "#2D2C35") + mouth(100, 93, 11, m, "#FFF8EC") + blush(80, 93, 5, m) + blush(120, 93, 5, m);
    return { defs: defs, body: s };
  },
  inky: function (P, m) {
    var defs = rg(P + "b", "#8FE3CC", "#2E9C83"), s = "";
    ["M70 124 Q 44 138 46 158 Q 48 172 34 176", "M84 132 Q 70 156 80 170 Q 88 180 78 188", "M94 136 Q 88 162 96 182", "M108 136 Q 116 160 110 182", "M118 132 Q 132 156 122 170 Q 114 180 124 188", "M130 124 Q 158 138 156 158 Q 154 172 168 176"].forEach(function (d) { s += line(d, 17) + line(d, 12, "#3FB497"); });
    s += '<g fill="#BFF0E2"><circle cx="48" cy="160" r="2.5"/><circle cx="82" cy="172" r="2.5"/><circle cx="96" cy="172" r="2.5"/><circle cx="111" cy="172" r="2.5"/><circle cx="120" cy="172" r="2.5"/><circle cx="154" cy="160" r="2.5"/></g>';
    s += sock(30, 170, -30, "#FF8FB1") + sock(172, 170, 30, "#FF8FB1", true) + sock(76, 186, 0, "#5EC8F2") + sock(126, 186, 0, "#5EC8F2", true);
    s += '<path d="M52 96 Q 52 40 100 40 Q 148 40 148 96 Q 148 130 100 134 Q 52 130 52 96 Z" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3"/>';
    s += '<g fill="#C9F4E8" opacity=".85"><circle cx="74" cy="62" r="6"/><circle cx="126" cy="58" r="5"/><circle cx="136" cy="84" r="4"/><circle cx="64" cy="86" r="4"/></g>';
    s += eye(84, 96, 11, m, "#5CC7AC") + eye(116, 96, 11, m, "#5CC7AC") + mouth(100, 116, 16, m) + blush(68, 112, 6, m) + blush(132, 112, 6, m);
    return { defs: defs, body: s };
  },
  flip: function (P, m) {
    var defs = rg(P + "b", "#C29070", "#7A5038"), s = "";
    s += '<circle cx="44" cy="46" r="14" fill="#FFD84A" stroke="' + INK + '" stroke-width="2.5"/>';
    for (var k = 0; k < 8; k++) { var a = k * Math.PI / 4; s += line("M" + f1(44 + Math.cos(a) * 19) + " " + f1(46 + Math.sin(a) * 19) + " L " + f1(44 + Math.cos(a) * 25) + " " + f1(46 + Math.sin(a) * 25), 2.5, "#F5A524"); }
    s += '<path d="M160 28 A 17 17 0 1 0 160 62 A 13 13 0 1 1 160 28 Z" fill="#C8B6F2" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>';
    s += '<path d="M44 138 Q 20 132 12 120 Q 30 120 54 130 Z" fill="#7A5038" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>';
    s += '<ellipse cx="52" cy="118" rx="7" ry="10" fill="#7A5038" stroke="' + INK + '" stroke-width="2" transform="rotate(-20 52 118)"/><ellipse cx="66" cy="113" rx="7" ry="10" fill="#7A5038" stroke="' + INK + '" stroke-width="2" transform="rotate(-10 66 113)"/>';
    s += '<ellipse cx="96" cy="138" rx="56" ry="22" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3"/><ellipse cx="96" cy="130" rx="42" ry="12" fill="#F3DDC0"/>';
    s += '<path d="M84 126 Q 96 104 108 126 Z" fill="#FFC9D6" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/>' + line("M96 110 L 96 125 M90 113 L 92 125 M102 113 L 100 125", 1.4);
    s += '<ellipse cx="85" cy="127" rx="6" ry="5" fill="#8E5E40" stroke="' + INK + '" stroke-width="2"/><ellipse cx="107" cy="127" rx="6" ry="5" fill="#8E5E40" stroke="' + INK + '" stroke-width="2"/>';
    s += '<circle cx="138" cy="98" r="6" fill="#7A5038" stroke="' + INK + '" stroke-width="2"/><circle cx="170" cy="98" r="6" fill="#7A5038" stroke="' + INK + '" stroke-width="2"/>';
    s += '<circle cx="154" cy="118" r="24" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3"/><ellipse cx="155" cy="128" rx="13" ry="9" fill="#F3DDC0"/><ellipse cx="155" cy="122" rx="5" ry="3.6" fill="' + INK + '"/>';
    s += line("M140 126 L 128 124 M140 130 L 128 132 M170 126 L 182 124 M170 130 L 182 132", 1.3);
    s += eye(146, 111, 6, m, "#9C6B4E") + eye(164, 111, 6, m, "#9C6B4E") + mouth(155, 131, 9, m) + blush(139, 124, 4, m) + blush(171, 124, 4, m);
    s += '<path d="M0 152 Q 25 142 50 152 T 100 152 T 150 152 T 200 152 L 200 196 L 0 196 Z" fill="#9ED8F0" opacity=".85"/>' + line("M20 166 q10 -5 20 0 M120 172 q10 -5 20 0 M70 180 q10 -5 20 0", 2, "#fff");
    return { defs: defs, body: s };
  },
  nutty: function (P, m) {
    var defs = rg(P + "t", "#EDB06E", "#B86A2A") + rg(P + "b", "#F3B675", "#D98A3F"), s = "";
    s += '<path d="M112 168 C 172 172 190 104 162 70 C 140 44 104 58 118 86 C 128 104 150 104 146 128 C 143 146 128 154 112 152 Z" fill="url(#' + P + 't)" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>' + line("M132 82 C 140 70 160 74 162 92", 4, "#F8CE96");
    s += '<path d="M60 70 L 56 42 L 78 62 Z" fill="#D98A3F" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/><path d="M112 70 L 116 42 L 94 62 Z" fill="#D98A3F" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>';
    s += line("M56 42 l-3 -6 M56 42 l2 -7 M116 42 l3 -6 M116 42 l-2 -7", 2);
    s += '<ellipse cx="72" cy="172" rx="10" ry="6" fill="#D98A3F" stroke="' + INK + '" stroke-width="2.5"/><ellipse cx="102" cy="172" rx="10" ry="6" fill="#D98A3F" stroke="' + INK + '" stroke-width="2.5"/>';
    s += '<ellipse cx="86" cy="136" rx="32" ry="36" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3"/><ellipse cx="85" cy="144" rx="19" ry="24" fill="#FFE3C2"/>';
    s += '<circle cx="86" cy="88" r="28" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3"/><ellipse cx="86" cy="100" rx="13" ry="9" fill="#FFE3C2"/><ellipse cx="86" cy="95" rx="4.5" ry="3.2" fill="' + INK + '"/>';
    if (m !== "shy") s += '<rect x="83" y="104" width="6" height="5" rx="1" fill="#fff" stroke="' + INK + '" stroke-width="1.2"/>';
    s += '<ellipse cx="86" cy="126" rx="7" ry="8" fill="#A0703F" stroke="' + INK + '" stroke-width="2"/><path d="M78 121 Q 86 112 94 121 Z" fill="#7A5038" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/>';
    s += '<ellipse cx="77" cy="127" rx="6" ry="5" fill="#D98A3F" stroke="' + INK + '" stroke-width="2"/><ellipse cx="95" cy="127" rx="6" ry="5" fill="#D98A3F" stroke="' + INK + '" stroke-width="2"/>';
    s += eye(74, 84, 8, m, "#E09A55") + eye(98, 84, 8, m, "#E09A55") + (m === "shy" ? mouth(86, 108, 10, m) : "") + blush(64, 98, 5, m) + blush(108, 98, 5, m);
    s += '<path d="M14 160 L 58 160 L 52 186 L 20 186 Z" fill="#C98E55" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>' + line("M18 170 L 56 170 M20 178 L 54 178", 1.5, "#8A5C34");
    s += '<g stroke="' + INK + '" stroke-width="1.6"><ellipse cx="28" cy="156" rx="6" ry="7" fill="#A0703F"/><ellipse cx="42" cy="154" rx="6" ry="7" fill="#A0703F"/></g>';
    s += '<path d="M140 162 L 184 162 L 178 188 L 146 188 Z" fill="#C98E55" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>' + line("M142 172 L 182 172 M144 180 L 180 180", 1.5, "#8A5C34");
    s += '<g fill="#E53935" stroke="' + INK + '" stroke-width="1.5"><circle cx="152" cy="158" r="5"/><circle cx="163" cy="156" r="5"/><circle cx="174" cy="158" r="5"/></g>';
    return { defs: defs, body: s };
  },
  glow: function (P, m) {
    var c = m === "shy" ? ["#D6ECFF", "#7FB8F0"] : m === "friend" ? ["#FFE1EF", "#FF8FB1"] : ["#FFF6A8", "#FFD24A"];
    var defs = '<radialGradient id="' + P + 'g"><stop offset="0" stop-color="' + c[1] + '" stop-opacity=".75"/><stop offset="1" stop-color="' + c[1] + '" stop-opacity="0"/></radialGradient>' + rg(P + "t", c[0], c[1]) + rg(P + "h", "#9CA0E0", "#565AA0");
    var s = '<circle cx="100" cy="140" r="64" fill="url(#' + P + 'g)"/>';
    s += '<ellipse cx="68" cy="94" rx="27" ry="16" fill="#fff" opacity=".75" stroke="' + INK + '" stroke-width="2.5" transform="rotate(-28 68 94)"/><ellipse cx="132" cy="94" rx="27" ry="16" fill="#fff" opacity=".75" stroke="' + INK + '" stroke-width="2.5" transform="rotate(28 132 94)"/>';
    s += line("M84 116 L 72 132 M116 116 L 128 132 M90 120 L 84 140 M110 120 L 116 140", 3);
    s += '<ellipse cx="100" cy="144" rx="28" ry="30" fill="url(#' + P + 't)" stroke="' + INK + '" stroke-width="3"/>' + line("M76 136 Q 100 144 124 136 M78 152 Q 100 160 122 152", 2, "rgba(30,34,51,.25)");
    s += '<ellipse cx="100" cy="110" rx="22" ry="14" fill="#565AA0" stroke="' + INK + '" stroke-width="3"/>';
    s += line("M90 58 Q 84 36 72 32", 3) + line("M110 58 Q 116 36 128 32", 3) + '<circle cx="72" cy="32" r="5" fill="' + c[1] + '" stroke="' + INK + '" stroke-width="2"/><circle cx="128" cy="32" r="5" fill="' + c[1] + '" stroke="' + INK + '" stroke-width="2"/>';
    s += '<circle cx="100" cy="80" r="26" fill="url(#' + P + 'h)" stroke="' + INK + '" stroke-width="3"/>';
    s += eye(90, 79, 8, m, "#7C80C8") + eye(110, 79, 8, m, "#7C80C8") + mouth(100, 92, 11, m) + blush(80, 90, 5, m) + blush(120, 90, 5, m);
    return { defs: defs, body: s };
  },
  muddle: function (P, m) {
    var defs = lg(P + "t", ["#4E8CF0", "#1F2A55"]) + lg(P + "w", ["#5C98F5", "#22307A"], true), s = "";
    s += '<path d="M64 128 L 16 150 L 22 164 L 70 142 Z" fill="url(#' + P + 't)" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>';
    s += line("M96 158 L 92 180 M112 158 L 116 180", 4, "#6B6B78") + line("M84 182 L 100 182 M108 182 L 124 182", 3, "#6B6B78");
    s += '<ellipse cx="100" cy="124" rx="44" ry="38" fill="#2D2C35" stroke="' + INK + '" stroke-width="3"/><ellipse cx="110" cy="134" rx="26" ry="24" fill="#F7F4EE"/>';
    s += '<path d="M64 112 Q 90 96 112 116 Q 98 146 68 140 Z" fill="url(#' + P + 'w)" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/><path d="M76 116 Q 88 110 98 120 Q 88 128 78 126 Z" fill="#F7F4EE"/>';
    s += '<circle cx="122" cy="82" r="28" fill="#2D2C35" stroke="' + INK + '" stroke-width="3"/>';
    s += '<path d="M146 80 L 172 88 L 146 96 Z" fill="#6B6B78" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>';
    if (m !== "shy") s += '<path d="M146 92 L 166 92 L 146 100 Z" fill="#55555F" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/>';
    s += '<g transform="translate(118 50) rotate(-18) scale(1.5)"><path d="M-6 -14 L6 -14 L6 2 Q6 8 12 8 L16 8 Q20 8 20 12 Q20 16 16 16 L-2 16 Q-6 16 -6 12 Z" fill="#FF8FB1" stroke="' + INK + '" stroke-width="1.6" stroke-linejoin="round"/><path d="M-6 -8 L6 -8 M-6 -2 L6 -2" stroke="#FFE36E" stroke-width="2.2"/></g>';
    s += eye(113, 80, 8, m, "#2D2C35") + eye(131, 80, 8, m, "#2D2C35") + blush(106, 94, 5, m) + blush(140, 96, 4, m);
    var fixed = m === "friend";
    s += '<g transform="rotate(-8 46 92)"><rect x="18" y="80" width="56" height="26" rx="5" fill="#FFF8EC" stroke="' + INK + '" stroke-width="2.2"/><text x="46" y="98" text-anchor="middle" font-size="14" font-weight="800" fill="' + (fixed ? "#2E8B57" : "#B9372F") + '" font-family="system-ui,sans-serif">2+2=' + (fixed ? "4" : "5") + '</text></g>';
    s += '<circle cx="40" cy="48" r="15" fill="#FFF8EC" stroke="' + INK + '" stroke-width="2.5"/><text x="40" y="56" text-anchor="middle" font-size="21" font-weight="800" fill="#8B6FD6" font-family="system-ui,sans-serif">' + (fixed ? "!" : "?") + '</text>';
    return { defs: defs, body: s };
  },
  hoot: function (P, m) {
    var defs = rg(P + "b", "#D3A879", "#8B6340"), s = "";
    s += '<path d="M62 72 L 54 38 L 82 60 Z" fill="#8B6340" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/><path d="M138 72 L 146 38 L 118 60 Z" fill="#8B6340" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>';
    s += '<ellipse cx="100" cy="116" rx="50" ry="58" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3"/><ellipse cx="100" cy="138" rx="32" ry="30" fill="#F3E3C6"/>';
    s += line("M86 124 l4 4 l4 -4 M106 124 l4 4 l4 -4 M96 136 l4 4 l4 -4", 2, "#C9A57B");
    s += '<circle cx="82" cy="94" r="20" fill="#E9D3B0"/><circle cx="118" cy="94" r="20" fill="#E9D3B0"/>';
    s += eye(82, 94, 11, m, "#E9D3B0") + eye(118, 94, 11, m, "#E9D3B0");
    s += '<circle cx="82" cy="94" r="16" fill="none" stroke="#8B6FD6" stroke-width="3.5"/><circle cx="118" cy="94" r="16" fill="none" stroke="#8B6FD6" stroke-width="3.5"/>' + line("M98 94 L 102 94", 3.5, "#8B6FD6");
    s += '<path d="M94 108 L 106 108 L 100 120 Z" fill="#FFB547" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/>' + blush(64, 114, 5, m) + blush(136, 114, 5, m);
    s += '<ellipse cx="54" cy="140" rx="12" ry="26" fill="#8B6340" stroke="' + INK + '" stroke-width="2.5" transform="rotate(15 54 140)"/><ellipse cx="146" cy="140" rx="12" ry="26" fill="#8B6340" stroke="' + INK + '" stroke-width="2.5" transform="rotate(-15 146 140)"/>';
    s += line("M58 152 L 58 184 L 100 192 L 142 184 L 142 152", 6, "#8B6FD6");
    s += '<path d="M62 150 L 100 158 L 138 150 L 138 180 L 100 188 L 62 180 Z" fill="#FFF8EC" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>' + line("M100 158 L 100 188", 2);
    s += '<text x="80" y="174" text-anchor="middle" font-size="12" font-weight="800" fill="#8B6FD6" font-family="system-ui,sans-serif">said</text>' + line("M108 166 L 132 162 M108 173 L 128 170 M108 180 L 130 176", 2, "#C9C2B5");
    return { defs: defs, body: s };
  },
  kiki: function (P, m) {
    var defs = rg(P + "b", "#B6EC8C", "#4E9E46") + rg(P + "h", "#FFF6B8", "#FFD84A"), s = "";
    s += '<rect x="34" y="168" width="132" height="9" rx="4.5" fill="#A0703F" stroke="' + INK + '" stroke-width="2.5"/>';
    s += '<path d="M92 150 L 84 196 L 100 190 L 116 196 L 108 150 Z" fill="#2F7DE1" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>';
    s += '<ellipse cx="100" cy="124" rx="36" ry="44" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3"/>';
    s += '<path d="M68 106 Q 60 140 82 162 Q 76 130 86 108 Z" fill="#6CC24A" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/><path d="M132 106 Q 140 140 118 162 Q 124 130 114 108 Z" fill="#6CC24A" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>';
    s += line("M72 124 q4 4 8 0 M74 136 q4 4 8 0 M120 124 q4 4 8 0 M118 136 q4 4 8 0", 1.8, "#2E6B2A");
    s += line("M88 170 l-4 6 M92 170 l0 7 M108 170 l0 7 M112 170 l4 6", 2.5, "#F5A524");
    s += '<circle cx="100" cy="74" r="30" fill="url(#' + P + 'h)" stroke="' + INK + '" stroke-width="3"/>' + line("M80 58 q8 -4 16 0 M104 54 q8 -4 16 0 M88 48 q8 -4 16 0", 2, "rgba(30,34,51,.45)");
    s += '<circle cx="77" cy="90" r="5" fill="#8EC5FF"/><circle cx="123" cy="90" r="5" fill="#8EC5FF"/>';
    s += eye(86, 70, 7, m, "#FFE36E") + eye(114, 70, 7, m, "#FFE36E");
    s += '<ellipse cx="100" cy="80" rx="6" ry="3" fill="#7EB6FF"/><path d="M94 83 Q 100 79 106 83 Q 106 95 100 99 Q 94 95 94 83 Z" fill="#F5A524" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/>';
    s += '<path d="M130 18 h50 a12 12 0 0 1 12 12 v6 a12 12 0 0 1 -12 12 h-34 l-10 10 l2 -10 h-8 a12 12 0 0 1 -12 -12 v-6 a12 12 0 0 1 12 -12 Z" fill="#FFF8EC" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>';
    s += '<text x="155" y="39" text-anchor="middle" font-size="15" font-weight="800" fill="#8B6FD6" font-family="system-ui,sans-serif">' + (m === "shy" ? "..." : "sh ch") + '</text>';
    return { defs: defs, body: s };
  },
  webster: function (P, m) {
    var defs = rg(P + "b", "#BDB2F5", "#5E4BB0"), s = "";
    s += line("M0 0 L 74 0 M0 0 L 62 34 M0 0 L 32 62 M0 0 L 0 74 M22 0 Q 22 18 0 22 M44 0 Q 44 34 0 44 M64 0 Q 62 52 0 64", 1.5, "#C9C2B5");
    s += line("M100 0 L 100 82", 2, "#C9C2B5") + line("M166 0 L 166 128", 1.5, "#C9C2B5");
    [["s", "#FFB547", 36], ["a", "#FF8FB1", 60], ["i", "#5EC8F2", 84], ["d", "#7BD36A", 108]].forEach(function (b) {
      s += '<circle cx="166" cy="' + b[2] + '" r="10" fill="' + b[1] + '" stroke="' + INK + '" stroke-width="2"/><text x="166" y="' + (b[2] + 4.5) + '" text-anchor="middle" font-size="13" font-weight="800" fill="' + INK + '" font-family="system-ui,sans-serif">' + b[0] + '</text>';
    });
    var legs = ["M74 108 Q 44 88 36 108", "M72 120 Q 40 116 30 136", "M74 132 Q 46 144 40 162", "M82 142 Q 62 162 60 180", "M126 108 Q 156 88 164 108", "M128 120 Q 160 116 170 136", "M126 132 Q 154 144 160 162", "M118 142 Q 138 162 140 180"];
    legs.forEach(function (d) { s += line(d, 10) + line(d, 6, "#8C7AE6"); });
    [[36, 108], [30, 136], [40, 162], [60, 180], [164, 108], [170, 136], [160, 162], [140, 180]].forEach(function (p) { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="5" fill="#FFB547" stroke="' + INK + '" stroke-width="2"/>'; });
    s += '<path d="M80 88 q4 -8 8 0 q4 -8 8 0 q4 -8 8 0 q4 -8 8 0 q4 -8 8 0" fill="#9C8CEB" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/>';
    s += '<circle cx="100" cy="118" r="36" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3"/>';
    s += '<circle cx="92" cy="98" r="3.6" fill="' + INK + '"/><circle cx="108" cy="98" r="3.6" fill="' + INK + '"/><circle cx="91" cy="97" r="1.2" fill="#fff"/><circle cx="107" cy="97" r="1.2" fill="#fff"/>';
    s += eye(88, 116, 11, m, "#9C8CEB") + eye(112, 116, 11, m, "#9C8CEB") + mouth(100, 134, 12, m) + blush(74, 130, 5, m) + blush(126, 130, 5, m);
    return { defs: defs, body: s };
  },
  tenna: function (P, m) {
    var defs = rg(P + "b", "#FFF4A0", "#FFC21A") + '<clipPath id="' + P + 'c"><ellipse cx="100" cy="124" rx="46" ry="40"/></clipPath>', s = "";
    s += '<ellipse cx="68" cy="72" rx="28" ry="20" fill="#F4FBFF" opacity=".9" stroke="' + INK + '" stroke-width="2.5" transform="rotate(-20 68 72)"/><ellipse cx="132" cy="72" rx="28" ry="20" fill="#F4FBFF" opacity=".9" stroke="' + INK + '" stroke-width="2.5" transform="rotate(20 132 72)"/>';
    s += '<g fill="#FF7A1A" stroke="' + INK + '" stroke-width="1.2"><circle cx="54" cy="70" r="4"/><circle cx="64" cy="64" r="4"/><circle cx="74" cy="58" r="4"/><circle cx="62" cy="80" r="4"/><circle cx="72" cy="74" r="4"/><circle cx="146" cy="70" r="4"/><circle cx="136" cy="64" r="4"/><circle cx="126" cy="58" r="4"/><circle cx="138" cy="80" r="4"/><circle cx="128" cy="74" r="4"/></g>';
    s += line("M88 90 Q 80 66 70 58", 3) + line("M112 90 Q 120 66 130 58", 3) + '<circle cx="70" cy="58" r="5" fill="#FF7A1A" stroke="' + INK + '" stroke-width="2"/><circle cx="130" cy="58" r="5" fill="#FF7A1A" stroke="' + INK + '" stroke-width="2"/>';
    s += '<ellipse cx="100" cy="124" rx="46" ry="40" fill="url(#' + P + 'b)"/><g clip-path="url(#' + P + 'c)" fill="#2D2C35"><rect x="50" y="136" width="100" height="10"/><rect x="50" y="154" width="100" height="10"/></g>';
    s += '<ellipse cx="100" cy="124" rx="46" ry="40" fill="none" stroke="' + INK + '" stroke-width="3"/>';
    s += eye(86, 112, 10, m, "#FFE15A") + eye(114, 112, 10, m, "#FFE15A") + mouth(100, 127, 13, m) + blush(72, 126, 6, m) + blush(128, 126, 6, m);
    s += '<ellipse cx="140" cy="150" rx="6" ry="5" fill="#FFD84A" stroke="' + INK + '" stroke-width="2"/>';
    s += '<path d="M140 154 Q 138 176 152 178 Q 166 176 164 154 Z" fill="#FFB547" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/><ellipse cx="152" cy="154" rx="13" ry="4" fill="#C98E55" stroke="' + INK + '" stroke-width="2"/><path d="M146 156 q-1 6 2 8" fill="none" stroke="#F5A524" stroke-width="3" stroke-linecap="round"/>';
    return { defs: defs, body: s };
  },
  pebble: function (P, m) {
    var defs = rg(P + "b", "#FFB9A3", "#E0603F"), s = "";
    ["M58 136 Q 36 140 30 156", "M60 146 Q 42 156 40 170", "M66 154 Q 54 168 56 180", "M142 136 Q 164 140 170 156", "M140 146 Q 158 156 160 170", "M134 154 Q 146 168 144 180"].forEach(function (d) { s += line(d, 9) + line(d, 5, "#FF8A6B"); });
    s += line("M62 120 Q 44 108 38 92", 10) + line("M62 120 Q 44 108 38 92", 6, "#FF8A6B") + line("M138 120 Q 156 108 162 92", 10) + line("M138 120 Q 156 108 162 92", 6, "#FF8A6B");
    s += '<path d="M20 80 Q 18 56 40 58 L 36 72 L 50 68 Q 54 90 34 94 Q 22 92 20 80 Z" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>';
    s += '<path d="M180 80 Q 182 56 160 58 L 164 72 L 150 68 Q 146 90 166 94 Q 178 92 180 80 Z" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>';
    s += '<ellipse cx="38" cy="42" rx="12" ry="9" fill="#BDB8AE" stroke="' + INK + '" stroke-width="2"/><text x="38" y="47" text-anchor="middle" font-size="14" font-weight="800" fill="' + INK + '" font-family="system-ui,sans-serif">+</text>';
    s += '<ellipse cx="162" cy="42" rx="12" ry="9" fill="#BDB8AE" stroke="' + INK + '" stroke-width="2"/><text x="162" y="47" text-anchor="middle" font-size="14" font-weight="800" fill="' + INK + '" font-family="system-ui,sans-serif">−</text>';
    s += line("M88 106 L 84 84", 3) + line("M112 106 L 116 84", 3);
    s += '<ellipse cx="100" cy="134" rx="52" ry="30" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3"/><g fill="#FFD3C4"><circle cx="78" cy="122" r="4"/><circle cx="122" cy="120" r="3.4"/><circle cx="102" cy="114" r="3"/></g>';
    s += eye(84, 78, 9, m, "#FF9C80") + eye(116, 78, 9, m, "#FF9C80") + mouth(100, 140, 14, m) + blush(72, 140, 6, m) + blush(128, 140, 6, m);
    return { defs: defs, body: s };
  },
  tick: function (P, m) {
    var defs = rg(P + "s", "#A9D690", "#4E8A3E") + rg(P + "k", "#E2EEAA", "#A8BD62"), s = "";
    s += '<path d="M40 140 L 22 148 L 40 150 Z" fill="#B9CB74" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>';
    [[58, 158, 12, 14], [82, 164, 11, 12], [118, 164, 11, 12], [140, 158, 12, 14]].forEach(function (l) { s += '<ellipse cx="' + l[0] + '" cy="' + l[1] + '" rx="' + l[2] + '" ry="' + l[3] + '" fill="url(#' + P + 'k)" stroke="' + INK + '" stroke-width="2.5"/>'; });
    s += '<path d="M36 146 Q 36 72 100 70 Q 160 72 160 146 Z" fill="url(#' + P + 's)" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>';
    s += line("M50 120 L 62 128 M150 120 L 138 128 M70 82 L 76 92 M130 82 L 124 92 M100 72 L 100 82", 2, "rgba(30,34,51,.35)");
    s += '<path d="M30 146 L 166 146 Q 168 156 158 156 L 38 156 Q 28 156 30 146 Z" fill="#C9A76B" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>';
    s += '<circle cx="98" cy="112" r="28" fill="#FFFDF7" stroke="' + INK + '" stroke-width="2.5"/>';
    [["12", 98, 94], ["3", 117, 116], ["6", 98, 136], ["9", 79, 116]].forEach(function (n) { s += '<text x="' + n[1] + '" y="' + n[2] + '" text-anchor="middle" font-size="9" font-weight="800" fill="' + INK + '" font-family="system-ui,sans-serif">' + n[0] + '</text>'; });
    s += line("M98 112 L 112 112", 4) + line("M98 112 L 98 92", 3, "#2F7DE1") + '<circle cx="98" cy="112" r="3" fill="' + INK + '"/>';
    s += '<circle cx="164" cy="122" r="20" fill="url(#' + P + 'k)" stroke="' + INK + '" stroke-width="3"/>';
    s += eye(157, 116, 6, m, "#C9D98A") + eye(172, 116, 6, m, "#C9D98A") + mouth(165, 130, 9, m) + blush(151, 128, 4, m) + blush(178, 128, 4, m);
    return { defs: defs, body: s };
  },
  nib: function (P, m) {
    var defs = rg(P + "a", "#FF9EA1", "#D93A40"), s = "";
    s += '<path d="M100 82 C 70 62 34 84 40 124 C 46 166 76 184 100 172 C 124 184 154 166 160 124 C 166 84 130 62 100 82 Z" fill="url(#' + P + 'a)" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>';
    s += line("M100 82 Q 98 64 106 54", 5, "#7A5038") + '<path d="M104 64 Q 124 50 138 60 Q 122 74 104 64 Z" fill="#6CC24A" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>';
    s += '<ellipse cx="64" cy="110" rx="8" ry="15" fill="#fff" opacity=".35"/><ellipse cx="128" cy="114" rx="12" ry="9" fill="#7A2E2E" stroke="' + INK + '" stroke-width="2"/>';
    var body = "M128 116 Q 138 94 128 74";
    s += line(body, 23) + line(body, 18, "#FF9DB0") + line("M122 104 q7 3 13 0 M123 92 q6 3 12 0", 1.6, "#E07A90");
    s += '<path d="M116 81 L 126 77 L 116 73 Z M136 81 L 126 77 L 136 73 Z" fill="#8B6FD6" stroke="' + INK + '" stroke-width="1.5" stroke-linejoin="round"/>';
    s += '<circle cx="126" cy="62" r="16" fill="#FF9DB0" stroke="' + INK + '" stroke-width="3"/>';
    s += eye(120, 60, 5.5, m, "#FF9DB0") + eye(132, 60, 5.5, m, "#FF9DB0") + mouth(126, 69, 8, m) + blush(114, 67, 3.5, m) + blush(138, 67, 3.5, m);
    s += '<circle cx="44" cy="44" r="17" fill="#FFF8EC" stroke="' + INK + '" stroke-width="2.5"/><text x="44" y="49.5" text-anchor="middle" font-size="14" font-weight="800" fill="#8B6FD6" font-family="system-ui,sans-serif">Aa</text>';
    return { defs: defs, body: s };
  },
  plop: function (P, m) {
    var defs = rg(P + "b", "#A6E585", "#3F9A3A"), s = "";
    s += '<ellipse cx="100" cy="170" rx="74" ry="16" fill="#5FAE57" stroke="' + INK + '" stroke-width="2.5"/>' + line("M100 170 L 60 162 M100 170 L 140 162 M100 170 L 100 156", 1.5, "#3F8A38");
    s += '<ellipse cx="62" cy="154" rx="20" ry="12" fill="#4FA84A" stroke="' + INK + '" stroke-width="2.5"/><ellipse cx="138" cy="154" rx="20" ry="12" fill="#4FA84A" stroke="' + INK + '" stroke-width="2.5"/>';
    s += '<ellipse cx="100" cy="128" rx="46" ry="38" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3"/><ellipse cx="100" cy="142" rx="28" ry="21" fill="#E6F6C8"/>';
    s += line("M54 96 Q 100 80 146 96", 6, "#8B6FD6");
    s += '<circle cx="76" cy="92" r="18" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3"/><circle cx="124" cy="92" r="18" fill="url(#' + P + 'b)" stroke="' + INK + '" stroke-width="3"/>';
    s += eye(76, 93, 10, m, "#7CCB62") + eye(124, 93, 10, m, "#7CCB62");
    s += '<circle cx="76" cy="92" r="14" fill="#CFF3FF" fill-opacity=".25" stroke="#8B6FD6" stroke-width="4"/><circle cx="124" cy="92" r="14" fill="#CFF3FF" fill-opacity=".25" stroke="#8B6FD6" stroke-width="4"/>';
    s += m === "shy" ? line("M92 126 q4 -3 8 0 t 8 0", 2.6) : line(m === "friend" ? "M70 120 Q 100 148 130 120" : "M74 122 Q 100 142 126 122", 3);
    s += blush(68, 128, 6, m) + blush(132, 128, 6, m);
    s += '<ellipse cx="80" cy="164" rx="9" ry="5" fill="#4FA84A" stroke="' + INK + '" stroke-width="2"/><ellipse cx="120" cy="164" rx="9" ry="5" fill="#4FA84A" stroke="' + INK + '" stroke-width="2"/>';
    s += '<rect x="164" y="146" width="14" height="10" rx="3" fill="#C89B5B" stroke="' + INK + '" stroke-width="2"/>' + line("M158 160 q10 -4 26 0", 2, "#6EC6F0");
    s += '<ellipse cx="26" cy="188" rx="8" ry="5" fill="#9A9A9A" stroke="' + INK + '" stroke-width="2"/><g fill="none" stroke="#6EC6F0" stroke-width="2"><circle cx="28" cy="172" r="3"/><circle cx="24" cy="162" r="2.4"/></g>';
    return { defs: defs, body: s };
  },
  nova: function (P, m) {
    var defs = lg(P + "w", ["#4B5BC0", "#22307A"], true) + '<radialGradient id="' + P + 'g"><stop offset="0" stop-color="#FFF3B0" stop-opacity=".7"/><stop offset="1" stop-color="#FFF3B0" stop-opacity="0"/></radialGradient>', s = "";
    if (m !== "shy") s += '<circle cx="100" cy="104" r="80" fill="url(#' + P + 'g)"/>';
    s += '<ellipse cx="72" cy="140" rx="26" ry="18" fill="#A88BEB" stroke="' + INK + '" stroke-width="2.5" transform="rotate(30 72 140)"/><ellipse cx="128" cy="140" rx="26" ry="18" fill="#A88BEB" stroke="' + INK + '" stroke-width="2.5" transform="rotate(-30 128 140)"/>';
    s += '<path d="M96 100 Q 40 40 20 78 Q 10 122 92 122 Z" fill="url(#' + P + 'w)" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/><path d="M104 100 Q 160 40 180 78 Q 190 122 108 122 Z" fill="url(#' + P + 'w)" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>';
    s += line("M44 76 L 62 94 L 36 102 M156 76 L 138 94 L 164 102", 1.2, "rgba(255,227,110,.6)");
    s += sparkle(44, 76, 0.55, "#FFE36E") + sparkle(62, 94, 0.45, "#FFE36E") + sparkle(36, 102, 0.4, "#FFE36E") + sparkle(156, 76, 0.55, "#FFE36E") + sparkle(138, 94, 0.45, "#FFE36E") + sparkle(164, 102, 0.4, "#FFE36E");
    s += '<ellipse cx="100" cy="134" rx="16" ry="34" fill="#F4F0FF" stroke="' + INK + '" stroke-width="3"/>' + line("M86 130 Q 100 136 114 130 M86 144 Q 100 150 114 144 M88 158 Q 100 163 112 158", 1.8, "#C8BEEB");
    s += line("M92 66 Q 80 40 62 34", 2.5) + line("M108 66 Q 120 40 138 34", 2.5) + line("M84 52 l-6 -2 M78 44 l-6 -1 M72 38 l-5 1 M116 52 l6 -2 M122 44 l6 -1 M128 38 l5 1", 1.6);
    s += '<path d="M78 104 q4 -10 10 -4 q4 -10 12 -4 q6 -8 12 0 q8 -4 10 6 q4 10 -6 12 q-14 6 -28 0 q-14 -2 -10 -10 Z" fill="#fff" stroke="' + INK + '" stroke-width="2.5" stroke-linejoin="round"/>';
    s += '<circle cx="100" cy="84" r="20" fill="#F4F0FF" stroke="' + INK + '" stroke-width="3"/>';
    s += eye(92, 83, 7, m, "#F4F0FF") + eye(108, 83, 7, m, "#F4F0FF") + mouth(100, 93, 8, m) + blush(84, 92, 4, m) + blush(116, 92, 4, m);
    return { defs: defs, body: s };
  }
};

function critterSvg(id, o) {
  o = o || {};
  var c = CRITTER_BY_ID[id];
  if (!c || !ART[id]) return "";
  var m = o.mood === "happy" || o.mood === "friend" ? o.mood : "shy";
  var P = svgId(id);
  var art = ART[id](P, m), size = o.size || 160;
  var pose = m === "shy" ? ' transform="translate(10 8) scale(0.92)"' : m === "friend" ? ' transform="translate(0 -4)"' : "";
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="' + size + '" height="' + size + '" role="img" aria-label="' + esc(c.name + " the " + c.kind) + '"><defs>' + art.defs + '</defs>' +
    '<ellipse cx="100" cy="190" rx="58" ry="7" fill="#1E2233" opacity=".13"/><g' + pose + '>' + art.body + '</g>' + extras(m) + '</svg>';
}

/* ------------------------------------------------ pet portrait fallback */
function fallbackPet(petId, mood) {
  var lion = petId !== "panda", P = svgId("pet");
  var face = lion ? "#F4A940" : "#F7F4EE", shade = lion ? "#D9832B" : "#E3DED3", ear = lion ? "#B9541F" : "#2D2C35";
  var m = mood === "sleepy" ? "friend" : mood === "wobbly" || mood === "thinking" ? "shy" : "happy";
  var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="' + (lion ? "lion cub" : "panda") + '"><defs>' + rg(P + "f", lion ? "#FFD08A" : "#FFFFFF", shade) + '</defs>';
  s += '<ellipse cx="128" cy="236" rx="70" ry="9" fill="#1E2233" opacity=".13"/>';
  if (lion) {
    s += '<circle cx="128" cy="112" r="84" fill="#B9541F" stroke="' + INK + '" stroke-width="4"/>';
    for (var k = 0; k < 14; k++) { var a = k * Math.PI / 7; s += '<circle cx="' + f1(128 + Math.cos(a) * 78) + '" cy="' + f1(112 + Math.sin(a) * 78) + '" r="18" fill="#B9541F" stroke="' + INK + '" stroke-width="3"/>'; }
    s += '<circle cx="128" cy="112" r="74" fill="#B9541F"/>';
  }
  s += '<ellipse cx="128" cy="196" rx="52" ry="40" fill="url(#' + P + 'f)" stroke="' + INK + '" stroke-width="4"/>';
  s += '<circle cx="74" cy="70" r="22" fill="' + ear + '" stroke="' + INK + '" stroke-width="4"/><circle cx="182" cy="70" r="22" fill="' + ear + '" stroke="' + INK + '" stroke-width="4"/>';
  s += '<circle cx="128" cy="116" r="62" fill="url(#' + P + 'f)" stroke="' + INK + '" stroke-width="4"/>';
  if (!lion) s += '<ellipse cx="102" cy="112" rx="18" ry="22" fill="#2D2C35" transform="rotate(-20 102 112)"/><ellipse cx="154" cy="112" rx="18" ry="22" fill="#2D2C35" transform="rotate(20 154 112)"/>';
  else s += '<ellipse cx="128" cy="140" rx="30" ry="22" fill="#FFE8C4"/>';
  s += eye(104, 112, 10, m, face) + eye(152, 112, 10, m, face);
  s += '<ellipse cx="128" cy="134" rx="9" ry="6.5" fill="' + (lion ? "#5A2E22" : "#2D2C35") + '"/>' + mouth(128, 146, 18, m === "shy" ? "shy" : "happy");
  s += blush(92, 138, 9, "happy") + blush(164, 138, 9, "happy") + '</svg>';
  return s;
}
function petPortrait(petId, o) {
  try {
    if (global.PetArt && typeof global.PetArt.svg === "function") {
      // a fresh idPrefix on every call: the same portrait string must never be inserted twice,
      // or its gradients clash and the pet paints as a hollow outline
      var out = global.PetArt.svg(petId, { stage: o.stage || 0, mood: o.mood || "happy", size: 256, idPrefix: svgId("p") });
      if (out) return out;
    }
  } catch (e) { /* fall back below */ }
  return fallbackPet(petId, o.mood);
}

/* ------------------------------------------------------------- styles */
var HEART_MASK = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 21C12 21 3 15.5 3 9.5C3 6.4 5.4 4 8.4 4C10 4 11.3 4.8 12 6C12.7 4.8 14 4 15.6 4C18.6 4 21 6.4 21 9.5C21 15.5 12 21 12 21Z'/%3E%3C/svg%3E\")";
var DARK_TOKENS = "--ink:#F3EEE2;--paper:#262B3D;--paper2:#1B1F2E;--btn:#2F3652;--btn-ink:#F3EEE2;--edge:#0A0D16;--good-soft:#1F3B2B;--good:#62C483;--muted:#AEB5C8;--bin:rgba(255,255,255,.05);--sil:brightness(0) invert(1);";
var COMPACT = ".chl-stage .chl-mini{display:flex}.chl-stage .chl-scene{visibility:hidden}.chl-stage .chl-show .chl-clock{width:clamp(70px,28cqh,104px)}.chl-stage .chl-ask:not(.keep){display:none}.chl-stage .chl-opts.text .chl-opt,.chl-stage .chl-opts.text .chl-word{font-size:15px}.chl-stage .chl-show .chl-frame{width:clamp(110px,30cqw,160px)}" +
  ".chl-stage .chl-opts.text{grid-template-columns:repeat(auto-fit,minmax(min(100%,96px),1fr))}.chl-stage .chl-opt{min-height:48px;padding:6px 8px}.chl-stage .chl-opts.pics .chl-opt{min-height:clamp(58px,22cqh,90px)}" +
  ".chl-stage .chl-dialog{margin:12px 8px 6px;padding:9px 58px 8px 12px;min-height:52px}.chl-stage .chl-text{font-size:15px}.chl-stage .chl-puzzle{padding:8px 10px;gap:8px}.chl-stage .chl-go{min-height:52px}" +
  ".chl-stage .chl-thing{width:clamp(48px,10cqw,56px)}.chl-stage .chl-bin{min-height:72px}.chl-stage .chl-slot{min-width:52px;min-height:52px}.chl-stage .chl-cards .chl-opt{min-width:58px;min-height:58px}" +
  ".chl-root[data-kid] .chl-stage .chl-show{font-size:clamp(28px,9cqh,44px)}.chl-root[data-kid] .chl-stage .chl-show .chl-svgpic{width:clamp(40px,13cqh,64px)}.chl-root[data-kid] .chl-stage .chl-field .chl-thing{width:clamp(48px,10cqw,56px)}.chl-stage .chl-q{font-size:clamp(15px,4.4cqh,18px)}.chl-stage .chl-hear{width:52px;height:52px;min-width:52px}.chl-stage .chl-hear .lbl{display:none}.chl-stage .chl-newcard svg{width:clamp(60px,18cqmin,90px)}";
var CSS = [
  ".chl-root,.chl-book{--ink:#1E2233;--paper:#FFF8EC;--paper2:#F4E8D4;--btn:#FFFFFF;--btn-ink:#1E2233;--edge:#1E2233;--accent:#2F7DE1;--accent2:#FF7A1A;--good:#2E8B57;--good-soft:#DDF5E3;--muted:#5D6478;--bin:rgba(255,255,255,.55);--sil:brightness(0);",
  "font-family:ui-rounded,'SF Pro Rounded','Arial Rounded MT Bold','Nunito','Varela Round',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:var(--ink)}",
  ".chl-root[data-kid=ruby],.chl-book[data-kid=ruby]{--accent:#8B6FD6;--accent2:#4CC3A5}",
  "@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .chl-root,:root:not([data-theme=light]) .chl-book{" + DARK_TOKENS + "}}",
  ":root[data-theme=dark] .chl-root,:root[data-theme=dark] .chl-book{" + DARK_TOKENS + "}",
  ".chl-root{position:absolute;inset:0;z-index:40;container:chl/size;overflow:hidden;overflow:clip;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation;outline:none;line-height:1.3}",
  ".chl-root *{box-sizing:border-box}",
  ".chl-stage{position:absolute;inset:0;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,34%) minmax(0,1fr) auto;grid-template-areas:'top' 'scene' 'puzzle' 'dialog';background:var(--paper2);animation:chl-fade .35s .2s both}",
  "@container chl (max-height:540px){.chl-stage{grid-template-rows:auto minmax(0,27%) minmax(0,1fr) auto}}",
  "@container chl (max-height:420px) and (orientation:portrait){.chl-stage{grid-template-rows:auto 0 minmax(0,1fr) auto}" + COMPACT + "}",
  "@container chl (orientation:landscape) and (min-width:560px){.chl-stage{grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);grid-template-rows:auto minmax(0,1fr) auto;grid-template-areas:'top top' 'scene puzzle' 'dialog puzzle'}.chl-critter{width:min(40cqh,22cqw)!important}.chl-pet{width:min(38cqh,21cqw)!important}}",
  "@container chl (orientation:landscape) and (min-width:560px) and (max-height:430px){.chl-stage .chl-show .chl-clock{width:clamp(70px,28cqh,106px)}.chl-stage .chl-opt{min-height:48px}.chl-stage .chl-opts.pics .chl-opt{min-height:clamp(58px,20cqh,90px)}.chl-stage .chl-dialog{margin:12px 8px 6px;padding:9px 58px 8px 12px}.chl-stage .chl-text{font-size:15px}.chl-stage .chl-ask:not(.keep){display:none}.chl-stage .chl-opts.text{grid-template-columns:1fr}.chl-stage .chl-opts.text .chl-opt{min-height:48px}.chl-stage .chl-q{font-size:16px}.chl-stage .chl-hear{width:52px;height:52px}.chl-stage .chl-hear .lbl{display:none}.chl-stage .chl-opts.text .chl-opt,.chl-stage .chl-opts.text .chl-word{font-size:15px}}",
  "@container chl (orientation:landscape) and (max-width:559px){.chl-stage{grid-template-rows:auto 0 minmax(0,1fr) auto}" + COMPACT + "}",
  ".chl-top{grid-area:top;display:flex;align-items:center;gap:8px;padding:8px 10px 7px;background:var(--paper);border-bottom:3px solid var(--edge);min-width:0}",
  ".chl-mini{display:none;gap:2px;flex:none}.chl-mini span{width:40px;height:40px;display:block}.chl-mini svg{width:100%;height:100%;display:block}",
  ".chl-tag{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}",
  ".chl-cname{font-weight:800;font-size:clamp(14px,3.8cqw,19px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  ".chl-meter{display:flex;gap:4px;align-items:center;flex-wrap:wrap}",
  ".chl-petal,.chl-bigheart{width:26px;height:24px;display:block;flex:none;background:linear-gradient(0deg,#FF5C86 var(--f,0%),rgba(128,128,140,.38) var(--f,0%));-webkit-mask:" + HEART_MASK + " center/contain no-repeat;mask:" + HEART_MASK + " center/contain no-repeat}",
  ".chl-petal.pop,.chl-bigheart.pop{animation:chl-pop .7s 2}",
  ".chl-friendtag{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--good);margin-left:4px}",
  ".chl-bighearts{display:flex;gap:8px;justify-content:center}.chl-bigheart{width:clamp(34px,10cqmin,48px);height:clamp(31px,9cqmin,44px)}",
  ".chl-iconbtn{flex:none;min-width:48px;min-height:48px;border-radius:14px;border:3px solid var(--edge);background:var(--btn);color:var(--btn-ink);font:inherit;font-weight:800;font-size:15px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 10px;box-shadow:0 3px 0 var(--edge);cursor:pointer}",
  ".chl-iconbtn svg{width:24px;height:24px;display:block}",
  ".chl-iconbtn:active{transform:translateY(2px);box-shadow:0 1px 0 var(--edge)}",
  "@container chl (max-width:430px){.chl-exit .lbl{display:none}}",
  ".chl-scene{grid-area:scene;position:relative;overflow:hidden;min-height:0}",
  ".chl-scene[data-h=garden]{background:radial-gradient(circle at 12% 80%,#FFD84A 0 4px,transparent 5px),radial-gradient(circle at 86% 88%,#FF8FB1 0 4px,transparent 5px),radial-gradient(circle at 58% 94%,#fff 0 3px,transparent 4px),radial-gradient(circle at 30% 92%,#FF8FB1 0 3px,transparent 4px),linear-gradient(#CDEBFF 0 58%,#8BD17C 58% 100%)}",
  ".chl-scene[data-h=park]{background:radial-gradient(ellipse 34% 12% at 76% 90%,#6EC6F0 0 98%,transparent 100%),radial-gradient(ellipse 15% 11% at 14% 55%,#5FAE57 0 98%,transparent 100%),radial-gradient(ellipse 9% 7% at 30% 55%,#6DBA62 0 98%,transparent 100%),linear-gradient(#BFE6FF 0 55%,#7FCB6E 55% 100%)}",
  ".chl-scene[data-h=bath]{background:linear-gradient(transparent 0 68%,#9ED8F0 68% 100%),repeating-linear-gradient(90deg,transparent 0 26px,#C3E2EB 26px 28px),repeating-linear-gradient(0deg,#E7F6FA 0 26px,#C3E2EB 26px 28px)}",
  ".chl-scene[data-h=bedroom]{background:radial-gradient(circle at 18% 18%,#FFF6C8 0 2px,transparent 3px),radial-gradient(circle at 70% 12%,#FFF6C8 0 2px,transparent 3px),radial-gradient(circle at 44% 28%,#FFF6C8 0 1.5px,transparent 2.5px),radial-gradient(circle at 88% 36%,#FFF6C8 0 2px,transparent 3px),radial-gradient(circle at 8% 44%,#FFF6C8 0 1.5px,transparent 2.5px),linear-gradient(#3A3470,#6B5BB0 64%,#C9B9E8 64% 100%)}",
  ".chl-scene[data-h=kitchen]{background:linear-gradient(#FFF1D6 0 60%,transparent 60%),repeating-conic-gradient(#F3E3CC 0 25%,#E2CBA9 0 50%) 0 0/34px 34px}",
  ".chl-scene[data-h=home]{background:linear-gradient(transparent 0 62%,#D9B48A 62% 100%),repeating-linear-gradient(90deg,#F7EBDD 0 18px,#F0DEC6 18px 36px)}",
  ".chl-critter,.chl-pet{position:absolute;aspect-ratio:1}",
  ".chl-critter{right:5%;top:5%;width:min(31cqh,44cqw)}",
  ".chl-pet{left:4%;bottom:2%;width:min(30cqh,40cqw)}",
  ".chl-art{position:relative;width:100%;height:100%;animation:chl-bob 2.6s ease-in-out infinite}",
  ".chl-pet .chl-art{animation-delay:-1.3s}",
  ".chl-art svg{width:100%;height:100%;display:block}",
  ".chl-mat{position:absolute;left:4%;right:4%;bottom:0;height:20%;border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,.8),rgba(255,255,255,0))}",
  ".chl-critter.enter{animation:chl-in .7s cubic-bezier(.2,.9,.3,1.25) .25s both}",
  ".chl-puzzle{grid-area:puzzle;overflow:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;justify-content:safe center;gap:10px;padding:12px max(12px,3cqw);min-height:0}",
  ".chl-puzzle>*{flex-shrink:0}",
  ".chl-ask{font-weight:800;text-align:center;font-size:clamp(15px,4cqw,20px);margin:0}",
  ".chl-qrow{display:flex;align-items:center;gap:10px;min-width:0}",
  ".chl-q{flex:1;min-width:0;margin:0;font-weight:800;font-size:clamp(18px,5.2cqw,26px);line-height:1.25;text-wrap:balance}",
  ".chl-hear{flex:none;width:64px;height:64px;border-radius:50%;border:3px solid var(--edge);background:var(--accent);color:#fff;box-shadow:0 4px 0 var(--edge);display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:0;cursor:pointer;padding:0;font:inherit;touch-action:manipulation}",
  ".chl-hear svg{width:34px;height:34px}.chl-hear .lbl{font-size:10px;font-weight:800;line-height:1;margin-top:1px}.chl-root[data-kid=ruby] .chl-hear{width:72px;height:72px}",
  ".chl-hear:active{transform:translateY(3px);box-shadow:0 1px 0 var(--edge)}",
  ".chl-dots{display:flex;gap:5px;flex:none}.chl-dots i{width:10px;height:10px;border-radius:50%;border:2px solid var(--edge);background:transparent}.chl-dots i.on{background:#FFC93C}.chl-dots i.now{background:var(--accent)}",
  ".chl-show{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:6px;font-size:clamp(30px,8.5cqw,52px);line-height:1}",
  ".chl-show .chl-svgpic{width:clamp(44px,13cqw,72px);height:auto}",
  ".chl-show .chl-clock{width:clamp(110px,30cqmin,180px)}",
  ".chl-show .chl-frame{width:clamp(130px,42cqw,220px)}",
  ".chl-root[data-kid=alfie] .chl-show{font-size:clamp(46px,13cqw,76px)}.chl-root[data-kid=alfie] .chl-show .chl-svgpic{width:clamp(58px,17cqw,96px)}.chl-root[data-kid=alfie] .chl-show .chl-swatch{width:clamp(58px,17cqw,96px)}",
  ".chl-root[data-kid=alfie] .chl-binhead .chl-emo{font-size:clamp(34px,10cqw,52px)}.chl-root[data-kid=alfie] .chl-binhead .chl-svgpic,.chl-root[data-kid=alfie] .chl-binhead .chl-swatch{width:clamp(38px,11cqw,56px)}",
  ".chl-root[data-kid=alfie] .chl-field .chl-thing{width:clamp(52px,14cqw,76px)}",
  ".chl-show .chl-word{font-size:clamp(20px,6cqw,30px);background:var(--btn);border:3px solid var(--edge);border-radius:12px;padding:4px 12px}",
  ".chl-opts{display:grid;gap:10px;grid-template-columns:repeat(var(--cols,3),minmax(0,1fr))}",
  ".chl-opts.text{grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr))}",
  ".chl-opt{position:relative;min-height:58px;border:3px solid var(--edge);border-radius:18px;background:var(--btn);color:var(--btn-ink);font:inherit;font-weight:800;font-size:clamp(16px,4.4cqw,21px);box-shadow:0 4px 0 var(--edge);padding:8px 12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer;touch-action:manipulation;transition:transform .08s}",
  ".chl-opt:active:not(:disabled){transform:translateY(3px);box-shadow:0 1px 0 var(--edge)}",
  ".chl-opts.pics .chl-opt{min-height:clamp(78px,18cqh,128px);font-size:clamp(40px,12cqw,70px);line-height:1}",
  ".chl-opt .chl-svgpic{width:clamp(46px,14cqw,80px);height:auto}",
  ".chl-opt .chl-clock{width:clamp(70px,20cqw,110px)}",
  ".chl-cap{font-size:clamp(12px,3.2cqw,15px);font-weight:700;line-height:1.1}",
  ".chl-emo{display:inline-block;line-height:1;transform:scale(var(--s,1));transform-origin:center bottom}",
  ".chl-sized{display:inline-flex;transform:scale(var(--s,1));transform-origin:center bottom}",
  ".chl-swatch{display:inline-block;width:clamp(44px,13cqw,72px);aspect-ratio:1;border-radius:50%;border:3px solid #1E2233;box-shadow:inset 0 -6px 0 rgba(0,0,0,.12)}",
  ".chl-word{font-size:clamp(16px,4.4cqw,23px);font-weight:800;line-height:1.2;text-align:center}",
  ".chl-num{font-size:clamp(28px,8cqw,46px);font-weight:900;line-height:1}",
  ".chl-numwrap{display:flex;flex-direction:column;align-items:center;gap:4px}.chl-numwrap .chl-frame{width:clamp(56px,16cqw,90px);height:auto}",
  ".chl-row{display:inline-flex;gap:4px}",
  ".chl-opt.is-right{background:var(--good-soft);border-color:var(--good);box-shadow:0 4px 0 var(--good);animation:chl-pop .45s}",
  ".chl-opt.is-wrong{animation:chl-shake .45s;opacity:.38}",
  ".chl-opt.is-hint,.chl-thing.is-hint{animation:chl-pulse 1.1s ease-in-out infinite;border-color:var(--accent)!important;border-style:solid!important}",
  ".chl-opt:disabled{cursor:default}",
  ".chl-root button:focus-visible{outline:3px solid var(--accent);outline-offset:3px}",
  ".chl-field,.chl-tray{display:flex;flex-wrap:wrap;justify-content:center;gap:clamp(4px,1.6cqw,10px);padding:4px}",
  ".chl-thing{position:relative;width:clamp(48px,12cqw,66px);aspect-ratio:1;border-radius:14px;border:3px dashed transparent;background:transparent;font-size:clamp(28px,8.5cqw,46px);line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;color:inherit;font-family:inherit;touch-action:manipulation}",
  ".chl-tray .chl-thing{touch-action:none}",
  ".chl-thing .chl-svgpic{width:86%;height:auto}.chl-thing .chl-swatch{width:80%}",
  ".chl-thing.counted{border-color:var(--accent);background:rgba(47,125,225,.1)}",
  ".chl-thing.sel{border:3px solid var(--accent);background:rgba(47,125,225,.14);transform:translateY(-4px)}",
  ".chl-thing.is-wrong{animation:chl-shake .45s}",
  ".chl-badge{position:absolute;top:-7px;right:-7px;min-width:22px;height:22px;border-radius:11px;background:var(--accent);color:#fff;font-size:13px;font-weight:900;display:flex;align-items:center;justify-content:center;padding:0 4px;border:2px solid var(--edge);font-family:system-ui,sans-serif}",
  ".chl-bins{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
  ".chl-bin{border:3px dashed var(--edge);border-radius:18px;min-height:clamp(96px,22cqh,160px);background:var(--bin);display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px;cursor:pointer;font:inherit;color:inherit}",
  ".chl-bin.ready{border-style:solid;border-color:var(--accent);background:rgba(47,125,225,.1)}",
  ".chl-bin.is-hint{animation:chl-pulse 1.1s ease-in-out infinite}",
  ".chl-binhead{display:flex;align-items:center;gap:6px;font-weight:800;font-size:clamp(13px,3.6cqw,17px)}.chl-binhead .chl-emo{font-size:clamp(24px,7cqw,34px)}.chl-binhead .chl-svgpic,.chl-binhead .chl-swatch{width:30px;height:auto}",
  ".chl-binitems{display:flex;flex-wrap:wrap;gap:4px;justify-content:center;font-size:26px;line-height:1}.chl-binitems .chl-svgpic{width:30px;height:auto}.chl-binitems .chl-swatch{width:26px}",
  ".chl-ghost{position:fixed;z-index:99999;pointer-events:none;font-size:44px;line-height:1;transform:translate(-50%,-50%) scale(1.15);filter:drop-shadow(0 6px 6px rgba(0,0,0,.3))}.chl-ghost .chl-svgpic{width:56px;height:auto}",
  ".chl-slots,.chl-cards{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}",
  ".chl-slot{min-width:clamp(58px,17cqw,92px);min-height:clamp(58px,17cqw,92px);padding:4px 6px;border:3px dashed var(--edge);border-radius:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;font-size:clamp(28px,8cqw,44px);line-height:1;background:var(--bin)}",
  ".chl-slot::before{content:attr(data-n);position:absolute;top:3px;left:7px;font-size:12px;font-weight:900;opacity:.5;font-family:system-ui,sans-serif}",
  ".chl-slot.filled{border-style:solid;border-color:var(--good);background:var(--good-soft);animation:chl-pop .4s}",
  ".chl-slot .chl-svgpic{width:clamp(40px,12cqw,64px);height:auto}.chl-slot .chl-word{font-size:clamp(13px,3.6cqw,18px)}.chl-slot .chl-num{font-size:clamp(22px,6.5cqw,36px)}",
  ".chl-cards .chl-opt{min-width:clamp(66px,19cqw,104px);min-height:clamp(66px,19cqw,104px);font-size:clamp(30px,8.5cqw,48px);line-height:1}",
  ".chl-cards .chl-opt .chl-word{font-size:clamp(14px,4cqw,19px)}",
  ".chl-opt.is-listen,.chl-bin.is-listen,.chl-thing.is-listen,.chl-slot.is-listen{border-color:var(--accent);border-style:solid;transform:scale(1.06);box-shadow:0 4px 0 var(--edge),0 0 0 5px rgba(47,125,225,.35)}",
  ".chl-go{align-self:center;min-height:62px;min-width:170px;padding:0 28px;border-radius:20px;border:3px solid var(--edge);background:var(--accent);color:#fff;font:inherit;font-size:clamp(18px,5cqw,24px);font-weight:800;box-shadow:0 5px 0 var(--edge);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:10px}",
  ".chl-goicon svg{width:28px;height:28px;display:block}",
  ".chl-go:active{transform:translateY(3px);box-shadow:0 2px 0 var(--edge)}",
  ".chl-newcard{align-self:center;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 20px 14px;border:3px solid var(--edge);border-radius:22px;background:var(--paper);box-shadow:0 4px 0 var(--edge);text-align:center;max-width:100%}",
  ".chl-newcard svg{width:clamp(80px,24cqmin,130px);height:auto}.chl-newcard strong{font-size:clamp(18px,5cqw,24px)}.chl-newcard>span:not(.chl-bighearts){font-size:clamp(13px,3.6cqw,16px);color:var(--muted)}",
  ".chl-heartcard{gap:8px}.chl-heartcard svg{width:clamp(96px,30cqmin,150px)}",
  ".chl-dialog{grid-area:dialog;position:relative;margin:16px 10px 10px;border:3px solid var(--edge);border-radius:18px;background:var(--paper);padding:14px 58px 12px 14px;min-height:64px;box-shadow:0 4px 0 var(--edge);cursor:pointer}",
  ".chl-speaker{position:absolute;top:-15px;left:14px;border:2px solid var(--edge);border-radius:999px;padding:1px 12px;font-weight:800;font-size:14px;max-width:70%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:var(--accent);color:#fff}",
  ".chl-text{margin:0;font-size:clamp(15px,4.1cqw,21px);font-weight:600;line-height:1.35;min-height:1.35em;-webkit-user-select:text;user-select:text}",
  ".chl-say{position:absolute;right:8px;top:50%;transform:translateY(-50%)}.chl-say:active{transform:translateY(-40%)}",
  ".chl-book-hearts{display:flex;gap:4px;justify-content:center}.chl-book-hearts .chl-petal{width:20px;height:18px}",
  ".chl-fx{position:absolute;inset:0;pointer-events:none;overflow:hidden;overflow:clip;z-index:6}",
  ".chl-spark{position:absolute;width:18px;height:18px;margin:-9px;background:#FFD84A;clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);animation:chl-spark .9s ease-out forwards}",
  ".chl-confetti{position:absolute;top:-24px;width:10px;height:14px;border-radius:3px;animation:chl-fall 2s ease-in forwards}",
  ".chl-finger{position:absolute;z-index:8;font-size:34px;line-height:1;pointer-events:none;transition:left .3s ease,top .3s ease;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35));transform:translate(-25%,-5%)}",
  ".chl-swoosh{position:absolute;top:0;bottom:0;left:-150%;width:150%;z-index:9;pointer-events:none;background:linear-gradient(110deg,transparent 0 22%,var(--accent) 22% 48%,var(--accent2) 48% 62%,transparent 62%);animation:chl-swoosh .75s ease-in-out forwards}",
  ".chl-root.chl-out{animation:chl-fadeout .25s forwards}",
  "@keyframes chl-swoosh{to{transform:translateX(170%)}}",
  "@keyframes chl-fade{from{opacity:0}to{opacity:1}}",
  "@keyframes chl-fadeout{to{opacity:0}}",
  "@keyframes chl-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}",
  "@keyframes chl-pop{0%{transform:scale(1)}40%{transform:scale(1.14)}100%{transform:scale(1)}}",
  "@keyframes chl-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-7px)}40%{transform:translateX(7px)}60%{transform:translateX(-5px)}80%{transform:translateX(4px)}}",
  "@keyframes chl-pulse{0%,100%{box-shadow:0 4px 0 var(--edge),0 0 0 0 rgba(47,125,225,.6)}50%{box-shadow:0 4px 0 var(--edge),0 0 0 10px rgba(47,125,225,0)}}",
  "@keyframes chl-in{from{transform:translateX(45%) scale(.55);opacity:0}to{transform:none;opacity:1}}",
  "@keyframes chl-spark{from{transform:translate(0,0) scale(.4);opacity:1}to{transform:translate(var(--dx),var(--dy)) scale(1.1);opacity:0}}",
  "@keyframes chl-fall{to{transform:translate(var(--dx),110cqh) rotate(560deg)}}",
  "@media (prefers-reduced-motion:reduce){.chl-root,.chl-root *{animation:none!important;transition:none!important}.chl-swoosh,.chl-confetti,.chl-spark{display:none!important}}",
  ".chl-book{display:flex;flex-direction:column;gap:14px}",
  ".chl-book-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap}",
  ".chl-book-head h2{margin:0;font-size:clamp(20px,5vw,28px);font-weight:800;text-wrap:balance}",
  ".chl-book-count{font-weight:700;color:var(--muted);font-variant-numeric:tabular-nums}",
  ".chl-book-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,128px),1fr));gap:10px}",
  ".chl-bcard{border:3px solid var(--edge);border-radius:18px;background:var(--paper);padding:10px 10px 12px;display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;box-shadow:0 3px 0 var(--edge);min-width:0}",
  ".chl-bcard svg{width:100%;max-width:120px;height:auto}",
  ".chl-bcard.sil svg{filter:var(--sil);opacity:.18}",
  ".chl-bcard .nm{font-weight:800;font-size:17px}.chl-bcard .kd{font-size:13px;font-weight:700;color:var(--muted)}.chl-bcard .bl{font-size:13px;line-height:1.4}",
  ".chl-hab{margin-top:auto;padding-top:4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}"
].join("\n");
function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById("chl-styles")) return;
  var st = document.createElement("style"); st.id = "chl-styles"; st.textContent = CSS;
  (document.head || document.documentElement).appendChild(st);
}

/* ------------------------------------------------------------- speech */
/* No browser speech synthesis. Lines go to window.KindlingsVoice (pre-rendered Kokoro
   clips; it honours the voice and its promise settles when the clip ends). Only when
   voice.js is not on the page does a line go to opts.speak(text, { voice }). Every spoken
   line is listed by Challenges.voiceLines() as a {kid}/{pet} template. */
var PET_VOICE = { lion: "roary", panda: "bao" };
function cleanForSpeech(t) {
  return String(t == null ? "" : t).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}]/gu, " ")
    .replace(/−/g, " take away ").replace(/\s+/g, " ").trim();
}
function isThenable(p) { return !!p && typeof p.then === "function"; }
function speechMs(text) { return Math.min(9000, 450 + String(text).length * 62); }
// Returns a promise of "did a clip play", or null when a custom speak gave no way to tell.
function speakLine(text, opts, custom) {
  try {
    var v = global.KindlingsVoice;
    if (v && typeof v.speak === "function") {
      var p = v.speak(text, opts);
      return isThenable(p) ? p.then(function (x) { return x !== false; }, function () { return false; }) : Promise.resolve(false);
    }
    if (typeof custom === "function") {
      var r = custom(text, opts);
      return isThenable(r) ? r.then(function (x) { return x !== false; }, function () { return false; }) : null;
    }
  } catch (e) { /* voice is optional */ }
  return Promise.resolve(false);
}
function voiceStop(customStop) {
  try {
    var v = global.KindlingsVoice;
    if (v && typeof v.stop === "function") { v.stop(); return; }
    if (typeof customStop === "function") customStop();
  } catch (e) { /* ignore */ }
}
// Soft synthesised chimes (no files, no network). Silent when the voice is switched off or at volume 0.
var audioCtx = null;
function chime(kind) {
  try {
    var V = global.KindlingsVoice;
    if (V && typeof V.isEnabled === "function" && !V.isEnabled()) return;
    var vol = V && typeof V.getVolume === "function" ? +V.getVolume() : 0.7;
    if (!(vol > 0)) return;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended" && audioCtx.resume) audioCtx.resume();
    var notes = kind === "friend" ? [523, 659, 784, 1047] : kind === "heart" ? [659, 880, 1175] : kind === "place" ? [698] : [784, 1047];
    var t0 = audioCtx.currentTime + 0.02;
    notes.forEach(function (f, i) {
      var osc = audioCtx.createOscillator(), g = audioCtx.createGain(), t = t0 + i * 0.1;
      osc.type = "sine"; osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.16 * vol), t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      osc.connect(g); g.connect(audioCtx.destination); osc.start(t); osc.stop(t + 0.42);
    });
  } catch (e) { /* sound is optional */ }
}

var SKILL_OWNER = {};
CRITTERS.forEach(function (c) { c.skills.forEach(function (sk) { if (!SKILL_OWNER[sk]) SKILL_OWNER[sk] = c.id; }); });
function promptVoice(item) { return "critter:" + (SKILL_OWNER[item.skill] || "muddle"); }

/* Praise names what the child did, never the child, and rotates so a line is not heard twice
   in one encounter. The item's own line comes first, then its skill's lines, then general ones.
   The younger child's pet speaks in short sentences. */
var SKILL_PRAISE = {
  "Counting": ["You counted so carefully!", "You touched each one!", "One at a time. Yes!"],
  "Colours": ["You looked at the colour!", "You checked the colours!", "Your eyes found it!"],
  "Shapes": ["You looked at the sides!", "You checked the corners!", "You spotted the shape!"],
  "Big and small": ["You looked at the sizes!", "You thought about the size!", "You compared them!"],
  "Animal sounds": ["You knew that sound!", "Your ears did it!", "You listened carefully!"],
  "First sounds": ["You heard the first sound!", "You said it slowly!", "Good listening!"],
  "Patterns": ["You found what comes next!", "You said the pattern!", "You spotted the repeat!"],
  "Sequences": ["You found what comes first!", "You thought about the order!", "First, then next. Yes!"],
  "Matching": ["You found what goes together!", "You matched them!", "You thought about it!"],
  "Feelings": ["You looked at the face!", "You noticed the feeling!", "You thought about how it feels!"],
  "Opposites": ["You found the opposite!", "You thought about both!", "You compared them!"],
  "Sorting": ["You put each one away!", "You checked each one!", "Everything has its place!"],
  "Silly pet": ["You helped {pet}!", "You checked for {pet}!", "Thank you for helping!"],
  "Reading words": ["You checked every letter!", "You looked at the whole word!", "You read it carefully!"],
  "Phonics": ["You said it slowly and listened!", "You heard the sounds in the word!", "You used your sounds!"],
  "School spellings": ["You pictured the word!", "You looked at each letter in turn!", "You spotted the tricky part!"],
  "Number bonds": ["You found the other part!", "You thought about what makes 10!", "You used the ten-frame in your head!"],
  "Adding and taking away": ["You kept track of the numbers!", "You counted on carefully!", "You checked your answer!"],
  "Numbers": ["You compared the numbers!", "You thought about which is bigger!", "You counted in jumps!"],
  "Telling the time": ["You looked at the long hand first!", "You checked where the hands point!", "You said them in order!"],
  "New words": ["You thought about what it means!", "You used the clues!", "You tried the word in your head!"],
  "Science": ["You thought about real life!", "You remembered what you've seen!", "You thought like a scientist!"],
  "Experiments": ["You made a prediction first!", "You thought before you chose!", "You used what you've seen before!"],
  "Feelings and kindness": ["You chose a kind way!", "You thought about everyone!", "You imagined how they feel!"]
};
var PRAISE = { alfie: ["You worked it out!", "You looked carefully!", "You took your time!"], ruby: ["You worked that out!", "You looked really carefully!", "You took your time and got it!", "You thought it through!"] };
var TOGETHER = { alfie: ["We did it together!", "Now we both know!", "Teamwork!"], ruby: ["We did it together!", "Now we both know!", "That was a tricky one, and we worked it out together!"] };
var CHEERS = { roary: ["Rrroar!", "Rrroar! Hooray!"], bao: ["Ooh, yay!", "Hooray!"] };
var LINES = {
  look: "Hmm, not that one. Let's look again!", together: "Let's do it together. It's this one!", countTogether: "Let's count them together!",
  otherBasket: "Let's try the other basket together.", tryOther: "Hmm, try the other one!", tapFirst: "First tap a picture!",
  orderTogether: "Let's do this one together. It's this one!", whatFirst: "Hmm, what comes first?",
  again: "{kid}! It's me, %c. Shall we play again?", peek: "A shy %k peeks out. It's %c!", friendNow: "%c isn't shy any more. %c is your friend now!",
  fun: "That was fun! Thank you for playing with me, {kid}.", lessShy: "I'm a little less shy now. See you another day!",
  almost: "I'm hardly shy at all now. See you another day!", bye: "Okay! See you soon, {kid}.",
  isRight: "Is {pet} right?", tapRight: "Tap the right answer for {pet}.", howMany: "How many?"
};
function critLine(key, c) { return LINES[key].replace(/%c/g, c.name).replace(/%k/g, c.kind); }
function hintLine(item) {
  if (item.hint) return item.hint;
  return item.type === "count" ? LINES.countTogether : item.type === "sort" ? LINES.tryOther : item.type === "order" ? LINES.whatFirst : LINES.look;
}
function teachAsk(item) { return item.ask || (item.options && item.options.length === 2 ? LINES.isRight : LINES.tapRight); }
function countOptions(n) { return numberOpts(n, 20, n <= 10); }
// Everything the younger child can hear named by the narrator: the answer pictures, number cards, baskets and cards.
function namedLabels(item) {
  var out = [];
  if (item.options) item.options.forEach(function (o) { out.push(o.label); });
  if (item.type === "count") countOptions(item.count.n).forEach(function (o) { out.push(o.label); });
  if (item.sort) { item.sort.bins.forEach(function (b) { out.push(b.label); }); item.sort.things.forEach(function (t) { out.push(t.label); }); }
  if (item.order) item.order.forEach(function (o) { out.push(o.label); });
  return out;
}
function voiceLines(o) {
  o = o || {};
  var out = [], seen = {};
  function add(text, voice) {
    text = cleanForSpeech(text);
    if (!text) return;
    var k = voice + "|" + text;
    if (!seen[k]) { seen[k] = 1; out.push({ text: text, voice: voice }); }
  }
  var kids = o.kidId ? [kidKey(o.kidId)] : ["alfie", "ruby"];
  kids.forEach(function (kid) {
    var pv = PET_VOICE[PET_DEFAULT[kid].id];
    crittersFor(kid).forEach(function (c) {
      var cv = "critter:" + c.id;
      add(critLine("peek", c), "narrator"); add(c.hello, cv); add(critLine("again", c), cv); add(critLine("friendNow", c), "narrator");
      ["fun", "lessShy", "almost", "bye"].forEach(function (k) { add(LINES[k], cv); });
    });
    ["look", "together", "countTogether", "otherBasket", "tryOther", "tapFirst", "orderTogether", "whatFirst"].forEach(function (k) { add(LINES[k], pv); });
    (CHEERS[pv] || []).concat(PRAISE[kid], TOGETHER[kid]).forEach(function (t) { add(t, pv); });
    var items = bankFor(kid).slice();
    if (o.learner && o.learner.kidId === kid) items = items.concat(o.learner.extra || []);
    var skills = {};
    items.forEach(function (it) {
      skills[it.skill] = 1;
      if (it.type === "teach") { add(it.claim, pv); add(it.after, pv); }
      else { add(it.say || it.q, promptVoice(it)); add(it.praise, pv); add(it.explain, pv); }
      add(hintLine(it), pv);
      if (it.type === "count") {
        for (var i = 1; i <= it.count.n; i++) add(String(i), pv);
        add("There are " + it.count.n + "! Tap " + it.count.n + ".", pv);
      }
      if (kid === "alfie") {
        namedLabels(it).forEach(function (l) { add(l, "narrator"); });
        if (it.type === "teach") add(teachAsk(it), "narrator");
        if (it.type === "count") add(LINES.howMany, "narrator");
      }
    });
    Object.keys(skills).forEach(function (sk) { (SKILL_PRAISE[sk] || []).forEach(function (t) { add(t, pv); }); });
  });
  return out;
}
function textOn(hex) {
  var m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return "#fff";
  var n = parseInt(m[1], 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? "#1E2233" : "#FFFFFF";
}
var ICON = {
  speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 9.2h3.8L12.5 5v14l-5.2-4.2H3.5z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M15.6 8.6a4.8 4.8 0 0 1 0 6.8M18.3 6a8.6 8.6 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 9.2h3.8L12.5 5v14l-5.2-4.2H3.5z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21C12 21 3 15.5 3 9.5C3 6.4 5.4 4 8.4 4C10 4 11.3 4.8 12 6C12.7 4.8 14 4 15.6 4C18.6 4 21 6.4 21 9.5C21 15.5 12 21 12 21Z" fill="currentColor"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

/* ---------------------------------------------------------- encounter */
function noop() {}

function Encounter(o) {
  this.o = o;
  var kid = this.kid = kidKey(o.kidId);
  this.alfie = kid === "alfie";            // the younger child: everything spoken, answers are pictures
  this.kidName = o.kidName || DEFAULT_NAMES[kid];
  this.petId = o.petId || PET_DEFAULT[kid].id;
  this.petName = o.petName || PET_DEFAULT[kid].name;
  this.ctx = { kid: this.kidName, pet: this.petName };
  this.stage = o.stage || 0;
  this.learner = o.learner || createLearner(kid);
  this.day = o.day != null ? o.day : 1;
  this.mode = o.mode === "auto" ? "auto" : "play";
  this.speed = Math.max(0.25, +o.speed || 1);
  this.autoSkill = o.autoSkill != null ? +o.autoSkill : 1;
  this.rng = o.rng || mulberry32((Date.now() ^ hashStr(kid)) >>> 0);
  var cid = o.critterId && CRITTER_BY_ID[o.critterId] ? o.critterId : pickCritter(this.learner, { day: this.day, rng: this.rng, habitat: o.habitat });
  this.critter = CRITTER_BY_ID[cid];
  this.n = o.n || DEFAULT_N[kid];
  var forced = (o.itemIds || []).map(function (id) { return this.learner.byId[id]; }, this).filter(Boolean);
  this.items = forced.length ? forced : this.learner.pick(this.n, this.day, { skills: this.critter.skills, rng: this.rng });
  this.already = this.learner.isFriend(cid);
  this.meter = this.items.length;              // this visit's petals: 1 per first-try answer, 1/2 when done together
  this.petals = 0;
  this.need = heartsNeeded(kid);              // the friendship meter, kept between visits
  this.hearts0 = this.already ? this.need : bondOf(this.learner, cid).h;
  this.room = heartRoom(this.learner, cid, this.day);
  this.shownHearts = null;
  this.results = []; this.recap = []; this.right = 0; this.timers = []; this.dead = false; this.done = false; this.friend = null;
  this.talkId = 0; this.usedLines = {}; this.qParts = null; this.curParts = null; this.hiEl = null;
  this.muted = !!o.muted || (this.mode === "auto" && !o.speakInAuto);
  try { this.reduced = !!(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { this.reduced = false; }
  this.t0 = Date.now();
}
var E = Encounter.prototype;
E.wait = function (ms) {
  var self = this;
  if (this.dead) return Promise.reject(ABORT);
  var t = this.mode === "auto" ? ms / this.speed : ms;
  return new Promise(function (res, rej) { self.timers.push(setTimeout(function () { if (self.dead) rej(ABORT); else res(); }, t)); });
};
E.pause = function (ms) { var self = this; return new Promise(function (res) { self.timers.push(setTimeout(res, ms)); }); };
E.bg = function (p) { if (p && p.catch) p.catch(noop); };
E.mount = function () {
  var self = this, c = this.o.container;
  ensureStyles();
  var pos = ""; try { pos = global.getComputedStyle(c).position; } catch (e) { /* ignore */ }
  if (!pos || pos === "static") { this.oldPos = c.style.position; this.posChanged = true; c.style.position = "relative"; }
  var root = document.createElement("div");
  root.className = "chl-root"; root.setAttribute("data-kid", this.kid); root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Puzzle with " + this.critter.name); root.tabIndex = -1;
  root.innerHTML = '<div class="chl-stage">' +
    '<div class="chl-top"><div class="chl-mini" aria-hidden="true"><span class="chl-mpet"></span><span class="chl-mcrit"></span></div>' +
    '<div class="chl-tag"><span class="chl-cname"></span><span class="chl-meter" role="img"></span></div>' +
    '<button type="button" class="chl-iconbtn chl-mute"></button>' +
    '<button type="button" class="chl-iconbtn chl-exit" aria-label="All done for now"><span aria-hidden="true">✕</span><span class="lbl">Done for now</span></button></div>' +
    '<div class="chl-scene" data-h="' + this.critter.habitat + '"><div class="chl-pet"><div class="chl-mat"></div><div class="chl-art"></div></div>' +
    '<div class="chl-critter enter"><div class="chl-mat"></div><div class="chl-art"></div></div></div>' +
    '<div class="chl-puzzle"></div>' +
    '<div class="chl-dialog" aria-live="polite"><span class="chl-speaker" hidden></span><p class="chl-text"></p>' +
    '<button type="button" class="chl-iconbtn chl-say" aria-label="Say it again">' + ICON.speaker + '</button></div>' +
    '</div><div class="chl-fx"></div>' + (this.reduced ? "" : '<div class="chl-swoosh"></div>');
  c.appendChild(root);
  var q = function (s) { return root.querySelector(s); };
  this.root = root;
  this.el = { cname: q(".chl-cname"), meter: q(".chl-meter"), mpet: q(".chl-mpet"), mcrit: q(".chl-mcrit"), scene: q(".chl-scene"), petArt: q(".chl-pet .chl-art"),
    critArt: q(".chl-critter .chl-art"), critter: q(".chl-critter"), puzzle: q(".chl-puzzle"), dialog: q(".chl-dialog"), speaker: q(".chl-speaker"), text: q(".chl-text"),
    fx: q(".chl-fx"), mute: q(".chl-mute"), exit: q(".chl-exit"), say: q(".chl-say") };
  this.el.cname.textContent = this.critter.name + " the " + this.critter.kind;
  this.drawMute();
  this.el.mute.addEventListener("click", function () { self.muted = !self.muted; if (self.muted) { self.talkId++; self.hush(); } self.drawMute(); });
  this.el.exit.addEventListener("click", function () { self.exit(); });
  this.el.say.addEventListener("click", function (e) { e.stopPropagation(); if (self.curParts) self.bg(self.talk(self.curParts, true)); });
  this.el.dialog.addEventListener("click", function () { if (self.finishTyping) self.finishTyping(); });
  root.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { e.preventDefault(); self.exit(); return; }
    if (e.target === root && (e.key === "Enter" || e.key === " ")) {
      var g = root.querySelector(".chl-go"); e.preventDefault();
      if (g) g.click(); else if (self.finishTyping) self.finishTyping();
      return;
    }
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) {
      var opts = [].slice.call(root.querySelectorAll(".chl-opts .chl-opt:not(:disabled),.chl-cards .chl-opt:not(:disabled)"));
      if (opts[n - 1]) { e.preventDefault(); opts[n - 1].click(); }
    }
  });
  try { root.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
};
E.drawMute = function () {
  this.el.mute.innerHTML = this.muted ? ICON.muted : ICON.speaker;
  this.el.mute.setAttribute("aria-label", this.muted ? "Turn sound on" : "Turn sound off");
  this.el.mute.setAttribute("aria-pressed", this.muted ? "true" : "false");
};
E.petVoice = function () { return PET_VOICE[this.petId] || "roary"; };
E.line = function (text, voice, el) { return { text: cleanForSpeech(fill(text, this.ctx)), voice: voice || "narrator", el: el || null }; };
E.highlight = function (el) {
  if (this.hiEl && this.hiEl !== el) this.hiEl.classList.remove("is-listen");
  this.hiEl = el || null;
  if (el) el.classList.add("is-listen");
};
/* Speak parts one after another. A newer talk cancels an older one, so a tap always wins.
   Each part may name an element to highlight while it is spoken (the picture being named). */
E.talk = function (parts, force) {
  var self = this, id = ++this.talkId;
  if ((this.muted && !force) || this.dead || !parts || !parts.length) { this.highlight(null); return Promise.resolve(false); }
  var i = 0, any = false;
  function step() {
    if (self.dead || id !== self.talkId) return Promise.resolve(any);
    if (i >= parts.length) { self.highlight(null); return Promise.resolve(any); }
    var p = parts[i++];
    if (p.el && !p.el.isConnected) return step();
    self.highlight(p.el);
    var sp = speakLine(p.text, { voice: p.voice, interrupt: true, kidId: self.kid }, self.o.speak);
    var guard = speechMs(p.text) * 2 + 1500;
    var pr = sp ? Promise.race([sp, self.pause(guard).then(function () { return true; })]) : self.pause(speechMs(p.text)).then(function () { return true; });
    return pr.then(function (played) {
      any = any || played;
      if (self.dead || id !== self.talkId) return null;
      var gap = played ? 160 : (p.el ? 380 : 0);
      return gap ? self.pause(gap) : null;
    }).then(step);
  }
  return step();
};
E.hush = function () { this.highlight(null); voiceStop(this.o.stopSpeaking); };
E.ding = function (kind) { if (!this.muted) chime(kind); };
/* Show a line in the dialogue box and speak it. Resolves once the text is typed and the
   speech has finished, so lines never talk over each other.
   o.speech: parts to speak instead of the text; o.lead: parts spoken first (the picture just tapped). */
E.say = function (who, text, o) {
  o = o || {};
  var self = this, el = this.el;
  text = fill(text, this.ctx);
  var name = "", color = null, voice = "narrator";
  if (who === "critter") { name = this.critter.name; color = this.critter.color; voice = o.voice || ("critter:" + this.critter.id); }
  else if (who === "pet") { name = this.petName; color = this.alfie ? "#FF7A1A" : "#8B6FD6"; voice = this.petVoice(); }
  el.speaker.hidden = !name; el.speaker.textContent = name;
  if (color) { el.speaker.style.background = color; el.speaker.style.color = textOn(color); }
  var parts = o.speech || [this.line(o.sayText || text, voice)];
  this.curParts = parts.map(function (p) { return { text: p.text, voice: p.voice }; });
  var spoken = this.talk((o.lead || []).concat(parts));
  if (this.finishTyping) this.finishTyping();
  if (this.reduced) { el.text.textContent = text; return spoken.then(noop); }
  el.text.textContent = "";
  var i = 0, step = this.mode === "auto" ? Math.max(1, Math.round(this.speed)) : 1;
  var typed = new Promise(function (res) {
    var timer = setInterval(function () {
      if (self.dead) { clearInterval(timer); return; }
      i += step; el.text.textContent = text.slice(0, i);
      if (i >= text.length) done();
    }, 24);
    function done() { clearInterval(timer); if (self.finishTyping === done) self.finishTyping = null; el.text.textContent = text; res(); }
    self.finishTyping = done;
  });
  return Promise.all([typed, spoken]).then(noop);
};
E.setCritter = function (mood) {
  this.cMood = mood;
  this.el.critArt.innerHTML = critterSvg(this.critter.id, { mood: mood, size: 200 });
  this.el.mcrit.innerHTML = critterSvg(this.critter.id, { mood: mood, size: 38 });
};
E.setPet = function (mood) {
  if (this.pMood === mood) return;
  this.pMood = mood;
  // two separate renders: each copy needs its own gradient ids
  this.el.petArt.innerHTML = petPortrait(this.petId, { stage: this.stage, mood: mood });
  this.el.mpet.innerHTML = petPortrait(this.petId, { stage: this.stage, mood: mood });
};
E.heartsNow = function () {
  if (this.shownHearts != null) return this.shownHearts;
  if (this.already) return this.need;
  return Math.min(this.need, this.hearts0 + visitHeart(this.petals, this.meter, this.room));
};
E.heartsHtml = function (v, pop, cls) {
  var h = "";
  for (var i = 0; i < this.need; i++) h += '<span class="' + (cls || "chl-petal") + (i === pop ? " pop" : "") + '" style="--f:' + Math.round(clamp(v - i, 0, 1) * 100) + '%"></span>';
  return h;
};
E.drawMeter = function (pop) {
  var v = this.heartsNow();
  this.el.meter.innerHTML = this.heartsHtml(v, pop) + (this.already ? '<span class="chl-friendtag">friend</span>' : "");
  this.el.meter.setAttribute("aria-label", "Friendship: " + (Math.round(v * 2) / 2) + " of " + this.need + " hearts");
};
E.relRect = function (el) {
  var a = el.getBoundingClientRect(), b = this.root.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
};
E.pointAt = function (el) {
  if (!this.finger) { this.finger = document.createElement("div"); this.finger.className = "chl-finger"; this.finger.textContent = "👆"; this.finger.setAttribute("aria-hidden", "true"); this.root.appendChild(this.finger); }
  var r = this.relRect(el);
  this.finger.style.left = (r.x + r.w * 0.55) + "px"; this.finger.style.top = (r.y + r.h * 0.55) + "px";
};
E.autoTap = function (el, delay) {
  var self = this;
  return this.wait(delay == null ? 700 : delay).then(function () {
    if (self.dead || !el || !el.isConnected) return;
    self.pointAt(el);
    return self.wait(360).then(function () { if (!self.dead && el.isConnected) el.click(); });
  });
};
E.firstRight = function (item) { return this.rng() < clamp(this.learner.p(item) * this.autoSkill, 0.02, 0.99); };
E.sparks = function (at) {
  if (this.reduced) return;
  var anchor = at || (this.el.scene.style.visibility === "hidden" || !this.el.scene.offsetHeight ? this.el.meter : this.el.critter);
  var r = this.relRect(anchor), cx = r.x + r.w / 2, cy = r.y + r.h / 2, fx = this.el.fx;
  for (var i = 0; i < 8; i++) {
    var s = document.createElement("span"), a = i * Math.PI / 4;
    s.className = "chl-spark"; s.style.left = cx + "px"; s.style.top = cy + "px";
    s.style.setProperty("--dx", Math.round(Math.cos(a) * 70) + "px"); s.style.setProperty("--dy", Math.round(Math.sin(a) * 70) + "px");
    if (i % 2) s.style.background = "#FF8FB1";
    fx.appendChild(s);
    (function (n) { setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 1000); })(s);
  }
};
E.confetti = function () {
  if (this.reduced) return;
  var cols = ["#FF5C86", "#FFD84A", "#4CC3A5", "#2F7DE1", "#8B6FD6", "#FF7A1A"], fx = this.el.fx;
  for (var i = 0; i < 28; i++) {
    var s = document.createElement("span");
    s.className = "chl-confetti"; s.style.left = Math.round(this.rng() * 100) + "%"; s.style.background = cols[i % cols.length];
    s.style.animationDelay = Math.round(this.rng() * 500) + "ms"; s.style.setProperty("--dx", Math.round((this.rng() - 0.5) * 120) + "px");
    fx.appendChild(s);
    (function (n) { setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 2700); })(s);
  }
};
E.go = function (label, before, icon) {
  var self = this;
  this.el.puzzle.innerHTML = (before || "") + '<button type="button" class="chl-go">' + (icon ? '<span class="chl-goicon">' + ICON[icon] + '</span>' : "") + '<span>' + esc(label) + '</span></button>';
  var b = this.el.puzzle.querySelector(".chl-go");
  return new Promise(function (res) {
    b.addEventListener("click", function () { if (self.finishTyping) self.finishTyping(); b.disabled = true; res(); });
    if (self.mode === "auto") self.bg(self.autoTap(b, 900));
    else { try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  });
};
// the next line from a pool that hasn't been said in this encounter yet
E.fresh = function (pool, seed) {
  var used = this.usedLines, list = pool.filter(Boolean);
  for (var i = 0; i < list.length; i++) { var t = list[(i + seed) % list.length]; if (!used[t]) { used[t] = 1; return t; } }
  return list[seed % list.length];
};
E.feedback = function (item, res) {
  var pv = this.petVoice(), seed = hashStr(item.id + this.results.length), parts = [], text;
  if (res.correct) {
    var cheer = this.fresh(CHEERS[pv] || [], seed);
    if (cheer) parts.push(this.line(cheer, pv));
    if (item.type === "teach") { parts.push(this.line(item.after, pv)); text = (cheer ? cheer + " " : "") + item.after; }
    else {
      // the item's own praise first; if it was already heard this time, another line for the skill
      var skillPool = SKILL_PRAISE[item.skill] || [], self = this;
      var praise = !this.usedLines[item.praise] && item.praise ? (this.usedLines[item.praise] = 1, item.praise)
        : skillPool.some(function (t) { return !self.usedLines[t]; }) ? this.fresh(skillPool, seed) : this.fresh(PRAISE[this.kid], seed);
      parts.push(this.line(praise, pv));
      if (item.explain) parts.push(this.line(item.explain, pv));
      text = (cheer ? cheer + " " : "") + praise + (item.explain ? " " + item.explain : "");
    }
  } else {
    var tog = this.fresh(TOGETHER[this.kid], seed), more = item.type === "teach" ? item.after : item.explain;
    parts.push(this.line(tog, pv));
    if (more) parts.push(this.line(more, pv));
    text = tog + (more ? " " + more : "");
  }
  return { text: text, parts: parts };
};
E.run = async function () {
  try {
    this.mount();
    this.setPet("curious"); this.setCritter(this.already ? "happy" : "shy"); this.drawMeter(-1);
    await this.wait(this.reduced ? 0 : 700);
    if (this.already) await this.say("critter", critLine("again", this.critter));
    else {
      await this.say("narrator", critLine("peek", this.critter));
      await this.wait(300);
      await this.say("critter", this.critter.hello);
    }
    await this.go(this.already ? "Let's play!" : "Make friends", "", "play");
    for (var i = 0; i < this.items.length; i++) await this.question(this.items[i], i);
    await this.outro();
    this.finish(false);
  } catch (e) {
    if (e !== ABORT) { try { console.error("Challenges:", e); } catch (x) { /* ignore */ } this.finish(true); }
  }
};
E.question = async function (item, idx) {
  this.idx = idx;
  this.setPet(item.type === "teach" ? "proud" : "curious");
  var res = await this.ask(item);
  if (this.dead) throw ABORT;
  this.learner.answer(item, res.correct, this.day);
  this.results.push({ id: item.id, skill: item.skill, type: item.type, correct: res.correct });
  if (res.correct) this.recap.push(fill(item.short, this.ctx));
  var before = this.heartsNow();
  this.petals = Math.min(this.meter, this.petals + (res.correct ? 1 : 0.5));
  this.drawMeter(this.heartsNow() > before ? Math.min(this.need - 1, Math.floor(before)) : -1);
  this.drawDots();
  this.setCritter("happy");
  var fb = this.feedback(item, res);
  if (res.correct) { this.right++; this.sparks(); this.setPet("excited"); this.ding("right"); }
  else { this.setPet("happy"); this.ding("place"); }
  await this.say("pet", fb.text, { speech: fb.parts, lead: res.lead });
  await this.wait(this.mode === "auto" ? 650 : 900);
};
E.ask = function (item) {
  if (item.type === "count") return this.askCount(item);
  if (item.type === "sort") return this.askSort(item);
  if (item.type === "order") return this.askOrder(item);
  return this.askChoice(item, item.type === "teach");
};
// The question, large, with a big "hear it again" button and the visit's progress dots.
E.qHead = function (text) {
  var dots = "";
  for (var i = 0; i < this.items.length; i++) dots += '<i class="' + (i < this.results.length ? "on" : i === this.idx ? "now" : "") + '"></i>';
  return '<div class="chl-qrow"><button type="button" class="chl-hear" aria-label="Hear it again">' + ICON.speaker + (this.alfie ? "" : '<span class="lbl">Hear it again</span>') + '</button>' +
    '<p class="chl-q">' + esc(fill(text, this.ctx)) + '</p><span class="chl-dots" aria-hidden="true">' + dots + '</span></div>';
};
E.drawDots = function () {
  var d = this.root && this.root.querySelector(".chl-dots");
  if (d) [].slice.call(d.children).forEach(function (x, i) { x.className = i < this.results.length ? "on" : ""; }, this);
};
// Ask the question aloud. For the younger child each answer picture is then named in turn and lit up.
E.askAloud = function (item, who, text, labelled) {
  var self = this, voice = who === "pet" ? this.petVoice() : promptVoice(item);
  var parts = [this.line(item.say || text, voice)];
  if (this.alfie && item.type === "teach") parts.push(this.line(teachAsk(item), "narrator"));
  if (this.alfie) (labelled || []).forEach(function (x) { parts.push(self.line(x.label, "narrator", x.el)); });
  this.qParts = parts;
  var hear = this.el.puzzle.querySelector(".chl-hear");
  if (hear) hear.addEventListener("click", function () { if (self.finishTyping) self.finishTyping(); self.bg(self.talk(self.qParts, true)); });
  this.bg(this.say(who, text, { speech: parts }));
};
E.nameIt = function (label) { return this.alfie ? [this.line(label, "narrator")] : null; };
function optHtml(o, i, isText, ctx, caption) {
  var inner = o.pic != null ? renderPic(o.pic) : '<span class="chl-word">' + esc(fill(o.label, ctx)) + '</span>';
  if (caption && o.pic != null && (typeof o.pic === "string" || o.pic.e || o.pic.mini)) inner += '<span class="chl-cap">' + esc(fill(o.label, ctx)) + '</span>';
  return '<button type="button" class="chl-opt" data-i="' + i + '" aria-label="' + esc(fill(o.label, ctx)) + '">' + inner + '</button>';
}
E.askChoice = function (item, teach) {
  var self = this, P = this.el.puzzle, ctx = this.ctx;
  var opts = shuffle(item.options, this.rng);
  var isText = opts.some(function (o) { return o.pic == null || o.pic.word != null; });
  var h = this.qHead(teach ? teachAsk(item) : item.q);
  if (item.show && item.show.length) h += '<div class="chl-show">' + item.show.map(function (p) { return renderPic(p); }).join("") + '</div>';
  h += '<div class="chl-opts ' + (isText ? "text" : "pics") + '" style="--cols:' + Math.min(opts.length, 3) + '">';
  opts.forEach(function (o, i) { h += optHtml(o, i, isText, ctx, teach && !self.alfie); });
  P.innerHTML = h + '</div>';
  var btns = [].slice.call(P.querySelectorAll(".chl-opt"));
  btns.forEach(function (b, i) { b.dataset.k = opts[i].label === item.answer ? "1" : "0"; });
  var good = btns.filter(function (b) { return b.dataset.k === "1"; })[0];
  this.askAloud(item, teach ? "pet" : "critter", teach ? item.claim : item.q, opts.map(function (o, i) { return { label: o.label, el: btns[i] }; }));
  return new Promise(function (resolve) {
    var tries = 0, together = false, locked = false;
    function wrongLeft() { return btns.filter(function (x) { return !x.disabled && x.dataset.k !== "1"; }); }
    function onPick(b) {
      if (locked || b.disabled) return;
      var label = opts[+b.dataset.i].label;
      if (b.dataset.k === "1") {
        locked = true; b.classList.add("is-right"); b.classList.remove("is-hint");
        btns.forEach(function (x) { if (x !== b) x.disabled = true; });
        resolve({ correct: tries === 0 && !together, together: together, lead: self.nameIt(label) });
        return;
      }
      tries++; b.classList.add("is-wrong"); b.disabled = true;
      var left = wrongLeft();
      if (tries === 1 && left.length) {
        self.setPet("thinking");
        self.bg(self.say("pet", hintLine(item), { lead: self.nameIt(label) }));
        if (self.mode === "auto") self.bg(self.autoTap(self.rng() < 0.6 ? good : pickOne(left, self.rng), 1300));
      } else {
        together = true; self.setPet("happy");
        btns.forEach(function (x) { if (x !== good) x.disabled = true; });
        good.classList.add("is-hint");
        self.bg(self.say("pet", LINES.together, { lead: self.nameIt(label) }));
        if (self.mode === "auto") self.bg(self.autoTap(good, 1100));
      }
    }
    btns.forEach(function (b) { b.addEventListener("click", function () { onPick(b); }); });
    if (self.mode === "auto") self.bg(self.autoTap(self.firstRight(item) ? good : pickOne(btns.filter(function (x) { return x !== good; }), self.rng), 1300));
  });
};
E.askCount = function (item) {
  var self = this, P = this.el.puzzle, n = item.count.n, pic = item.count.pic;
  var noun = item.count.noun || (typeof item.count.emo === "string" ? EMO_NAME[item.count.emo] : "") || "picture";
  var opts = shuffle(countOptions(n), this.rng);
  var h = this.qHead(item.q) + '<div class="chl-field">';
  for (var i = 0; i < n; i++) h += '<button type="button" class="chl-thing" data-i="' + i + '" aria-label="' + esc(noun) + ' number ' + (i + 1) + '">' + renderPic(pic) + '</button>';
  h += '</div><p class="chl-ask keep">How many?</p><div class="chl-opts pics" style="--cols:3">';
  opts.forEach(function (o, j) { h += optHtml(o, j, false, self.ctx, false); });
  P.innerHTML = h + '</div>';
  var things = [].slice.call(P.querySelectorAll(".chl-thing")), btns = [].slice.call(P.querySelectorAll(".chl-opt"));
  btns.forEach(function (b, j) { b.dataset.k = opts[j].label === String(n) ? "1" : "0"; });
  var good = btns.filter(function (b) { return b.dataset.k === "1"; })[0], counted = 0;
  var numberParts = function () { return [self.line(LINES.howMany, "narrator")].concat(opts.map(function (o, j) { return self.line(o.label, "narrator", btns[j]); })); };
  this.askAloud(item, "critter", item.q, []);
  if (this.alfie) this.qParts = this.qParts.concat(numberParts());
  function mark(t, num) { t.classList.add("counted"); var bd = t.querySelector(".chl-badge"); if (!bd) { bd = document.createElement("span"); bd.className = "chl-badge"; t.appendChild(bd); } bd.textContent = num; }
  things.forEach(function (t) {
    t.addEventListener("click", function () {
      if (t.classList.contains("counted")) return;
      counted++; mark(t, counted);
      var parts = [self.line(String(counted), self.petVoice())];
      // once every one is counted, the younger child hears the number cards named
      if (counted === n && self.alfie && self.mode === "play") parts = parts.concat(numberParts());
      self.bg(self.talk(parts));
    });
  });
  return new Promise(function (resolve) {
    var locked = false;
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        if (locked || b.disabled) return;
        var label = opts[+b.dataset.i].label;
        if (b.dataset.k === "1") { locked = true; b.classList.add("is-right"); b.classList.remove("is-hint"); btns.forEach(function (x) { if (x !== b) x.disabled = true; }); resolve({ correct: !self.togetherCount, lead: self.nameIt(label) }); return; }
        b.classList.add("is-wrong"); b.disabled = true; self.togetherCount = true;
        btns.forEach(function (x) { if (x !== good) x.disabled = true; });
        self.setPet("thinking");
        self.bg(self.countTogether(things, item, label).then(function () {
          good.disabled = false; good.classList.add("is-hint");
          if (self.mode === "auto") return self.autoTap(good, 700);
        }));
      });
    });
    self.togetherCount = false;
    if (self.mode === "auto") {
      var ok = self.firstRight(item);
      self.bg((async function () {
        await self.wait(900);
        for (var k = 0; k < things.length; k++) { if (self.dead) return; self.pointAt(things[k]); await self.wait(240); things[k].click(); }
        await self.autoTap(ok ? good : pickOne(btns.filter(function (x) { return x !== good; }), self.rng), 500);
      })());
    }
  });
};
E.countTogether = async function (things, item, label) {
  await this.say("pet", hintLine(item), { lead: this.nameIt(label) });
  things.forEach(function (t) { t.classList.remove("counted"); var b = t.querySelector(".chl-badge"); if (b) b.remove(); });
  for (var k = 0; k < things.length; k++) {
    await this.wait(this.reduced ? 120 : 520);
    things[k].classList.add("counted");
    var bd = document.createElement("span"); bd.className = "chl-badge"; bd.textContent = k + 1; things[k].appendChild(bd);
    this.bg(this.talk([this.line(String(k + 1), this.petVoice())]));
  }
  await this.wait(400);
  await this.say("pet", "There are " + things.length + "! Tap " + things.length + ".");
};
E.askSort = function (item) {
  var self = this, P = this.el.puzzle, bins = item.sort.bins, things = shuffle(item.sort.things, this.rng);
  var h = this.qHead(item.q) + '<div class="chl-tray">';
  things.forEach(function (t, i) { h += '<button type="button" class="chl-thing" data-i="' + i + '" aria-label="' + esc(t.label) + '">' + renderPic(t.pic) + '</button>'; });
  h += '</div><div class="chl-bins">';
  bins.forEach(function (b, j) { h += '<button type="button" class="chl-bin" data-j="' + j + '" aria-label="' + esc(b.label) + '"><span class="chl-binhead">' + renderPic(b.pic) + (self.alfie ? "" : '<span>' + esc(b.label) + '</span>') + '</span><span class="chl-binitems"></span></button>'; });
  P.innerHTML = h + '</div>';
  var tEls = [].slice.call(P.querySelectorAll(".chl-thing")), bEls = [].slice.call(P.querySelectorAll(".chl-bin"));
  this.askAloud(item, "critter", item.q, bins.map(function (b, j) { return { label: b.label, el: bEls[j] }; }));
  var allowed = things.length > 4 ? 1 : 0;
  return new Promise(function (resolve) {
    var sel = -1, mistakes = 0, placed = 0, misses = {};
    function select(i, say) {
      tEls.forEach(function (t) { t.classList.remove("sel"); });
      sel = i; if (i >= 0) tEls[i].classList.add("sel");
      bEls.forEach(function (b) { b.classList.toggle("ready", i >= 0); });
      if (i >= 0 && say && self.alfie && self.mode === "play") self.bg(self.talk([self.line(things[i].label, "narrator", tEls[i])]));
    }
    function place(i, j) {
      var t = things[i], el = tEls[i];
      if (!el || el.dataset.done) return;
      if (t.bin === j) {
        el.dataset.done = "1"; el.style.visibility = "hidden"; el.disabled = true;
        bEls[j].querySelector(".chl-binitems").insertAdjacentHTML("beforeend", '<span>' + renderPic(t.pic) + '</span>');
        bEls.forEach(function (b) { b.classList.remove("is-hint"); });
        select(-1); placed++; self.ding("place");
        if (placed === things.length) resolve({ correct: mistakes <= allowed });
      } else {
        mistakes++; misses[i] = (misses[i] || 0) + 1;
        el.classList.remove("is-wrong"); void el.offsetWidth; el.classList.add("is-wrong");
        self.setPet("thinking");
        self.bg(self.say("pet", misses[i] > 1 ? LINES.otherBasket : hintLine(item)));
        if (misses[i] > 1) bEls[t.bin].classList.add("is-hint");
        select(i);
      }
    }
    tEls.forEach(function (el, i) {
      el.addEventListener("click", function () { if (el._dragged) { el._dragged = false; return; } if (!el.dataset.done) select(sel === i ? -1 : i, sel !== i); });
      el.addEventListener("pointerdown", function (e) {
        el._dragged = false;
        if (el.dataset.done || self.mode === "auto") return;
        var sx = e.clientX, sy = e.clientY, ghost = null;
        function move(ev) {
          if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) {
            ghost = document.createElement("div"); ghost.className = "chl-ghost"; ghost.innerHTML = renderPic(things[i].pic); document.body.appendChild(ghost); select(i, true);
          }
          if (ghost) { ghost.style.left = ev.clientX + "px"; ghost.style.top = ev.clientY + "px"; }
        }
        function up(ev) {
          global.removeEventListener("pointermove", move); global.removeEventListener("pointerup", up); global.removeEventListener("pointercancel", up);
          if (!ghost) return;
          ghost.remove(); el._dragged = true;
          var under = document.elementFromPoint(ev.clientX, ev.clientY), bin = under && under.closest ? under.closest(".chl-bin") : null;
          if (bin && self.root.contains(bin)) place(i, +bin.dataset.j); else select(-1);
        }
        global.addEventListener("pointermove", move); global.addEventListener("pointerup", up); global.addEventListener("pointercancel", up);
      });
    });
    bEls.forEach(function (b, j) {
      b.addEventListener("click", function () {
        if (sel < 0) {
          tEls.forEach(function (t) { if (!t.dataset.done) { t.classList.remove("is-wrong"); void t.offsetWidth; t.classList.add("is-wrong"); } });
          self.bg(self.say("pet", LINES.tapFirst)); return;
        }
        place(sel, j);
      });
    });
    if (self.mode === "auto") {
      var ok = self.firstRight(item), plan = {};
      if (!ok) shuffle(things.map(function (_, i) { return i; }), self.rng).slice(0, allowed + 1).forEach(function (i) { plan[i] = 1; });
      self.bg((async function () {
        await self.wait(1000);
        for (var i = 0; i < things.length; i++) {
          if (self.dead) return;
          await self.autoTap(tEls[i], 250);
          if (plan[i]) await self.autoTap(bEls[1 - things[i].bin], 300);   // a wrong drop keeps the picture selected
          await self.autoTap(bEls[things[i].bin], 300);
        }
      })());
    }
  });
};
E.askOrder = function (item) {
  var self = this, P = this.el.puzzle, steps = item.order;
  var idx = steps.map(function (_, i) { return i; }), sh = shuffle(idx, this.rng), guard = 0;
  while (sh.every(function (v, i) { return v === i; }) && guard++ < 10) sh = shuffle(idx, this.rng);
  var h = this.qHead(item.q) + '<div class="chl-slots">';
  steps.forEach(function (_, i) { h += '<span class="chl-slot" data-n="' + (i + 1) + '"></span>'; });
  h += '</div><div class="chl-cards">';
  sh.forEach(function (i) { h += optHtml(steps[i], i, false, self.ctx, !self.alfie); });
  P.innerHTML = h + '</div>';
  var slots = [].slice.call(P.querySelectorAll(".chl-slot")), cards = [].slice.call(P.querySelectorAll(".chl-opt"));
  this.askAloud(item, "critter", item.q, cards.map(function (c) { return { label: steps[+c.dataset.i].label, el: c }; }));
  var allowed = steps.length > 3 ? 1 : 0;
  return new Promise(function (resolve) {
    var next = 0, mistakes = 0, stepMiss = 0;
    function cardFor(i) { return cards.filter(function (c) { return +c.dataset.i === i; })[0]; }
    cards.forEach(function (c) {
      c.addEventListener("click", function () {
        if (c.disabled) return;
        var i = +c.dataset.i;
        if (i === next) {
          c.disabled = true; c.style.visibility = "hidden"; c.classList.remove("is-hint");
          slots[next].innerHTML = renderPic(steps[i].pic); slots[next].classList.add("filled");
          next++; stepMiss = 0; self.ding("place");
          if (self.alfie && self.mode === "play" && next < steps.length) self.bg(self.talk([self.line(steps[i].label, "narrator", slots[next - 1])]));
          if (next === steps.length) resolve({ correct: mistakes <= allowed, lead: self.nameIt(steps[i].label) });
        } else {
          mistakes++; stepMiss++;
          c.classList.remove("is-wrong"); void c.offsetWidth; c.classList.add("is-wrong");
          setTimeout(function () { c.classList.remove("is-wrong"); }, 500);
          self.setPet("thinking");
          if (stepMiss >= 2) { cardFor(next).classList.add("is-hint"); self.bg(self.say("pet", LINES.orderTogether, { lead: self.nameIt(steps[i].label) })); }
          else self.bg(self.say("pet", hintLine(item), { lead: self.nameIt(steps[i].label) }));
        }
      });
    });
    if (self.mode === "auto") {
      var ok = self.firstRight(item), plan = {};
      if (!ok) shuffle(idx, self.rng).slice(0, allowed + 1).forEach(function (i) { plan[i] = 1; });
      self.bg((async function () {
        await self.wait(1000);
        for (var s = 0; s < steps.length; s++) {
          if (self.dead) return;
          if (plan[s] && s < steps.length - 1) await self.autoTap(cardFor(s + 1), 300);
          await self.autoTap(cardFor(s), 350);
        }
      })());
    }
  });
};
E.heartCard = function (f) {

  return '<div class="chl-newcard chl-heartcard">' + critterSvg(this.critter.id, { mood: "happy", size: 110 }) +
    '<span class="chl-bighearts" role="img" aria-label="' + (Math.round(f.hearts * 2) / 2) + ' of ' + f.heartsNeeded + ' friendship hearts">' + this.heartsHtml(f.hearts, f.heartGained > 0 ? Math.ceil(f.hearts) - 1 : -1, "chl-bigheart") + '</span>' +
    '<span>' + (Math.round(f.hearts * 2) / 2) + ' of ' + f.heartsNeeded + ' hearts' + (f.heartGained > 0 ? '' : ' (hearts grow once a day)') + '</span></div>';
};
E.outro = async function () {
  var f = this.friend = settleFriendship(this.learner, this.critter.id, { petals: this.petals, meter: this.meter, day: this.day, already: this.already });
  var grew = f.heartGained > 0;
  this.shownHearts = f.hearts;
  this.drawMeter(grew ? Math.min(this.need - 1, Math.ceil(f.hearts) - 1) : -1);
  if (f.newFriend) {
    this.setCritter("friend"); this.setPet("excited"); this.confetti(); this.ding("friend");
    var card = '<div class="chl-newcard">' + critterSvg(this.critter.id, { mood: "friend", size: 120 }) + '<strong>New friend!</strong><span>' + esc(this.critter.name) + ' joined the Friend Book.</span></div>';
    var g = this.go("Yay!", card, "heart");
    await this.say("narrator", critLine("friendNow", this.critter));
    await g;
  } else if (this.already) {
    this.setCritter("friend"); this.setPet("happy");
    var g2 = this.go("Bye for now", "", "check");
    await this.say("critter", LINES.fun);
    await g2;
  } else {
    this.setCritter("happy"); this.setPet("happy");
    if (grew) { this.ding("heart"); this.sparks(this.el.meter); }
    var g3 = this.go("Bye for now", this.heartCard(f), "check");
    await this.say("critter", grew ? (f.heartsNeeded - f.hearts <= 1 ? LINES.almost : LINES.lessShy) : LINES.fun);
    await g3;
  }
};
E.exit = function () {
  if (this.done || this.leaving) return;
  var self = this;
  this.leaving = true;
  this.dead = true;
  this.talkId++;
  if (this.finishTyping) { try { this.finishTyping(); } catch (e) { /* ignore */ } }
  var spoken = Promise.resolve();
  try {
    this.el.puzzle.innerHTML = "";
    this.el.speaker.hidden = false; this.el.speaker.textContent = this.critter.name;
    this.el.speaker.style.background = this.critter.color; this.el.speaker.style.color = textOn(this.critter.color);
    this.el.text.textContent = fill(LINES.bye, this.ctx);
    if (!this.muted) { var sp = speakLine(cleanForSpeech(fill(LINES.bye, this.ctx)), { voice: "critter:" + this.critter.id, interrupt: true, kidId: this.kid }, this.o.speak); if (sp) spoken = sp; }
    else this.hush();
  } catch (e) { /* ignore */ }
  // let the goodbye finish (but never wait long), then close
  var min = this.reduced ? 0 : 650, t0 = Date.now(), closed = false;
  function close() { if (closed) return; closed = true; setTimeout(function () { self.finish(true, false, false, true); }, Math.max(0, min - (Date.now() - t0))); }
  spoken.then(close, close);
  setTimeout(close, 2600);
};
E.abort = function (x) { x = x || {}; this.dead = true; this.finish(true, !!x.silent, true); };
E.finish = function (aborted, silent, immediate, keepVoice) {
  if (this.done) return;
  this.done = true; this.dead = true;
  this.timers.forEach(clearTimeout);
  if (this.finishTyping) { try { this.finishTyping(); } catch (e) { /* ignore */ } }
  if (!keepVoice) this.hush(); else this.highlight(null);
  var f = this.friend;
  if (!f) {
    // left early: the hearts earned so far still count, and nothing is ever taken away
    if (this.results.length) f = settleFriendship(this.learner, this.critter.id, { petals: this.petals, meter: this.meter, day: this.day, already: this.already });
    else f = { befriended: this.already, newFriend: false, hearts: this.hearts0, heartsNeeded: this.need, heartGained: 0 };
  }
  var result = { critterId: this.critter.id, befriended: f.befriended, newFriend: f.newFriend, alreadyFriend: this.already, asked: this.results.length, right: this.right,
    items: this.results.slice(), seconds: Math.round((Date.now() - this.t0) / 1000), aborted: !!aborted, petals: this.petals, meter: this.meter, recap: this.recap.slice(),
    hearts: f.hearts, heartsNeeded: f.heartsNeeded, heartGained: f.heartGained };
  var self = this, root = this.root;
  function remove() {
    if (root && root.parentNode) root.parentNode.removeChild(root);
    if (self.posChanged) self.o.container.style.position = self.oldPos || "";
  }
  if (!root || immediate || this.reduced) remove(); else { root.classList.add("chl-out"); setTimeout(remove, 260); }
  if (!silent && typeof this.o.onDone === "function") { try { this.o.onDone(result); } catch (e) { try { console.error(e); } catch (x) { /* ignore */ } } }
};

function start(o) {
  o = o || {};
  if (!o.container || typeof document === "undefined") throw new Error("Challenges.start needs a container element");
  var enc = new Encounter(o);
  enc.run();
  return { abort: function (x) { enc.abort(x); }, critterId: enc.critter.id, items: enc.items.map(function (i) { return i.id; }) };
}

/* ---------------------------------------------------------- Friend Book */
var HAB_TEXT = { garden: "the garden", park: "the park", bath: "the bath", bedroom: "the bedroom", kitchen: "the kitchen", home: "the hallway" };
function friendBook(container, o) {
  o = o || {};
  ensureStyles();
  var kid = kidKey(o.kidId), name = o.kidName || DEFAULT_NAMES[kid], need = heartsNeeded(kid);
  var bf = o.befriended || (o.learner ? o.learner.friends : []) || [];
  // hearts for critters met but not yet friends: from o.hearts { id: n } or the learner
  var hearts = o.hearts || {};
  if (o.learner && o.learner.bond) Object.keys(o.learner.bond).forEach(function (id) { if (hearts[id] == null) hearts[id] = o.learner.bond[id].h || 0; });
  var list = crittersFor(kid), count = list.filter(function (c) { return bf.indexOf(c.id) >= 0; }).length;
  var h = '<section class="chl-book" data-kid="' + kid + '"><div class="chl-book-head">' + (o.showTitle === false ? "" : '<h2>' + esc(name) + '\'s Friend Book</h2>') + '<span class="chl-book-count">' + count + ' of ' + list.length + ' friends</span></div><div class="chl-book-grid">';
  list.forEach(function (c) {
    var f = bf.indexOf(c.id) >= 0, met = !f && +hearts[c.id] > 0;
    h += '<article class="chl-bcard' + (f || met ? "" : " sil") + '">' + critterSvg(c.id, { mood: f ? "friend" : met ? "shy" : "happy", size: 120 }).replace(/aria-label="[^"]*"/, 'aria-label="' + (f || met ? esc(c.name + " the " + c.kind) : "Someone shy") + '"');
    if (f) h += '<span class="nm">' + esc(c.name) + '</span><span class="kd">' + esc(c.kind) + '</span><span class="bl">' + esc(fill(c.blurb, { kid: name, pet: o.petName || PET_DEFAULT[kid].name })) + '</span>';
    else if (met) {
      var v = Math.min(need, +hearts[c.id]), hh = "";
      for (var i = 0; i < need; i++) hh += '<span class="chl-petal" style="--f:' + Math.round(clamp(v - i, 0, 1) * 100) + '%"></span>';
      h += '<span class="nm">' + esc(c.name) + '</span><span class="kd">Still a little shy</span><span class="chl-book-hearts" role="img" aria-label="' + (Math.round(v * 2) / 2) + ' of ' + need + ' friendship hearts">' + hh + '</span>';
    }
    else h += '<span class="nm">Someone shy</span><span class="bl">Lives in ' + HAB_TEXT[c.habitat] + '. Play ' + esc(c.skills[0].toLowerCase()) + ' games to meet them.</span>';
    h += '<span class="chl-hab">' + esc(c.habitat === "home" ? "hallway" : c.habitat) + '</span></article>';
  });
  container.innerHTML = h + '</div></section>';
  return container.firstChild;
}

/* ------------------------------------------------------------- export */
var Challenges = {
  version: VERSION,
  critters: CRITTERS,
  critterSvg: critterSvg,
  createLearner: createLearner,
  loadLearner: loadLearner,
  start: start,
  simulateSession: simulateSession,
  friendBook: friendBook,
  pickCritter: function (learner, o) { return pickCritter(learner, o); },
  hearts: function (learner, critterId) { return learner.isFriend(critterId) ? heartsNeeded(learner.kidId) : ((learner.bond || {})[critterId] || {}).h || 0; },
  heartsNeeded: heartsNeeded,
  crittersFor: crittersFor,
  items: function (kidId) { return bankFor(kidId).slice(); },
  renderPic: renderPic,
  voiceLines: voiceLines,
  petVoice: function (petId) { return PET_VOICE[petId] || "narrator"; },
  defaults: { names: DEFAULT_NAMES, pets: PET_DEFAULT, questions: DEFAULT_N, maxNewPerDay: MAX_NEW, gaps: GAPS, hearts: HEARTS, befriendingAtOnce: OPEN_MAX },
  util: { mulberry32: mulberry32, misspell: misspell, fill: fill }
};
global.Challenges = Challenges;
if (typeof module !== "undefined" && module.exports) module.exports = Challenges;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
