/*
 * Kindlings PetArt v1.0 (21 Nov 2026)
 * Character art for the two Kindlings pets: Roary (id 'lion') and Bao (id 'panda').
 * Plain browser script, no dependencies, no network, no fonts, works from file://.
 * Attaches one global: window.PetArt.
 *
 * VECTOR ART
 *   PetArt.svg(petId, opts) -> string            complete <svg> markup, viewBox "0 0 256 256"
 *     petId  'lion' | 'panda'
 *     opts.stage   0..4                         growth stage (default 0)
 *     opts.mood    see PetArt.moods             (default 'happy')
 *     opts.size    px for width/height attrs     (default 256)
 *     opts.body    'none' | 'screen' | 'robot' | 'plush' | 'speaker' | 'core'   (default 'none')
 *     opts.blink   true draws closed eyes        (default false)
 *     opts.idPrefix optional prefix for gradient ids (a counter keeps every call unique anyway)
 *     opts.muted   'core' body only: shows the red mic-muted indicator
 *   PetArt.svgDataURL(petId, opts) -> 'data:image/svg+xml,...' (for <img> or canvas drawImage)
 *   PetArt.coreExploded(opts)      -> exploded-view SVG of the Kindling Core (viewBox 0 0 420 560).
 *                                     Labels use fill="currentColor"; opts.petId picks ear clips.
 *   PetArt.buildBody(kind, petId, opts) -> SVG of the Core inside a body the kids build,
 *                                     kind 'plush-shell' | 'rover' | 'dock' | 'cardboard' (viewBox 0 0 256 256)
 *
 * PIXEL SPRITES (all return a cached HTMLCanvasElement: draw it with ctx.drawImage, do not
 * mutate it or append the same canvas twice; returns null where there is no document)
 *   PetArt.sprite(petId, opts)     pets, base grid 24 x 24 px
 *     opts.stage 0..4, opts.dir 'down'|'up'|'left'|'right', opts.frame 0|1 (walk cycle),
 *     opts.scale integer (default 2, so 48 x 48), opts.mood (sleepy closes the eyes,
 *     excited opens the mouth)
 *   PetArt.spriteKid(kidId, opts)  kidId 'alfie' | 'ruby', base grid 24 x 32 px
 *   PetArt.spriteNpc(npcId, opts)  npcId 'mum' | 'dad',      base grid 24 x 32 px
 *     same opts: dir, frame, scale (default 2)
 *   Anchor every sprite at bottom-centre: the feet sit on the bottom rows (the last row is
 *   the outline). Sprites have a 1 px dark outline and no ground shadow, so draw a soft
 *   shadow ellipse under them in the game. Use ctx.imageSmoothingEnabled = false.
 *
 * DATA
 *   PetArt.stageNames, PetArt.moods, PetArt.bodies, PetArt.palette, PetArt.names
 */
(function (root) {
  'use strict';

  var PALETTE = {
    lion: { body: '#F4A940', bodyShade: '#D9832B', mane: '#B9541F', maneDeep: '#7E3416', cream: '#FFE8C4', nose: '#5A2E22', innerEar: '#F7B9A0', eye: '#2B1D16', blush: '#F59A8B', truckBlue: '#2F7DE1', safetyOrange: '#FF7A1A' },
    panda: { fur: '#F7F4EE', furShade: '#E3DED3', patch: '#2D2C35', patchShade: '#1E1D24', blush: '#F6A7BC', nose: '#2D2C35', lavender: '#8B6FD6', mint: '#4CC3A5', sprout: '#6CC24A', flower: '#FF8FB1' },
    world: { ink: '#1E2233', paper: '#FFF8EC', sky: '#CDEBFF', grass: '#8BD17C', grassDark: '#5FAE57', path: '#E9D2A6', water: '#6EC6F0', wood: '#B07A4A' }
  };
  var STAGE_NAMES = {
    lion: ['Cub', 'Young lion', 'Brave lion', 'Big lion', 'King of the house'],
    panda: ['Baby panda', 'Little panda', 'Curious panda', 'Clever panda', 'Wise panda']
  };
  var MOODS = ['happy', 'excited', 'sleepy', 'curious', 'proud', 'thinking', 'listening', 'talking', 'wobbly'];
  var BODIES = ['none', 'screen', 'robot', 'plush', 'speaker', 'core'];
  var NAMES = { lion: 'Roary', panda: 'Bao' };

  // Derived colours (shades, lines and details built from the brief palette)
  var X = {
    lionLine: '#7E3416', lionBrow: '#8E3F1F', lionPad: '#D98B72', lionLid: '#F6AE48',
    lionIris: ['#C99155', '#6A3E22', '#2B1D16'],
    pandaLine: '#24232B', pandaDark: '#141318', pandaPad: '#6A6070',
    pandaIris: ['#A592C4', '#4A3D63', '#1C1726'],
    mouthIn: '#6E2B33', tongue: '#F27C8C', listen: '#6EC6F0', listenDeep: '#2F9FD6',
    gold: '#FFD54A', goldDark: '#C98A12', zzz: '#7C86D6', sweat: '#BFE6FA', sweatLine: '#4F9FD0',
    seed: '#A0703F', seedDark: '#6E4A26', leafDark: '#3E8A2C', bud: '#F06A95',
    plastic: '#F3F5FA', plasticLine: '#3A3F52', glass: '#121622', ink: '#1E2233'
  };

  var SKIN_STOPS = {
    lion: [[0, '#FFDB92'], [0.5, '#F4A940'], [1, '#D07A26']],
    panda: [[0, '#FFFFFF'], [0.55, '#F7F4EE'], [1, '#D9D2C4']]
  };
  var EYES = { happy: 'open', excited: 'wide', sleepy: 'sleepy', curious: 'wide', proud: 'happy', thinking: 'open', listening: 'open', talking: 'open', wobbly: 'soft' };
  var LOOK = { thinking: [-0.7, -0.9], listening: [0.9, -0.15], curious: [0.45, -0.55], sleepy: [0, 0.5], wobbly: [0, 0.15] };

  var uid = 0;
  function f(v) { return Math.round(v * 10) / 10; }
  function clampStage(v) { v = Math.round(Number(v)); return isFinite(v) ? Math.max(0, Math.min(4, v)) : 0; }
  function pt(cx, cy, rx, ry, a) { return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; }
  function normA(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  // ---------------------------------------------------------------- gradients
  function stops(list) {
    return list.map(function (s) {
      return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] != null ? ' stop-opacity="' + s[2] + '"' : '') + '/>';
    }).join('');
  }
  function radial(id, list, cx, cy, r, fx, fy) {
    return '<radialGradient id="' + id + '" cx="' + cx + '" cy="' + cy + '" r="' + r + '"' + (fx != null ? ' fx="' + fx + '" fy="' + fy + '"' : '') + '>' + stops(list) + '</radialGradient>';
  }
  function linear(id, list, x1, y1, x2, y2) {
    return '<linearGradient id="' + id + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '">' + stops(list) + '</linearGradient>';
  }

  function defs(pet, P) {
    var lion = pet === 'lion';
    var d = '<defs>';
    d += radial(P + 'skin', SKIN_STOPS[pet], 0.38, 0.3, 0.85);
    d += radial(P + 'mane', [[0, '#DE7A3E'], [0.55, '#B9541F'], [1, '#8C3B17']], 0.45, 0.42, 0.62);
    d += radial(P + 'maneD', [[0, '#9A4A22'], [1, '#5A220E']], 0.5, 0.45, 0.6);
    d += radial(P + 'cream', [[0, '#FFF9EC'], [0.6, '#FFE8C4'], [1, '#EECB98']], 0.45, 0.35, 0.75);
    d += radial(P + 'patch', [[0, '#55525F'], [0.5, '#2D2C35'], [1, '#18171D']], 0.38, 0.28, 0.85);
    var iris = lion ? X.lionIris : X.pandaIris;
    d += radial(P + 'iris', [[0, iris[0]], [0.55, iris[1]], [1, iris[2]]], 0.5, 0.8, 0.8);
    d += radial(P + 'blush', [[0, lion ? PALETTE.lion.blush : PALETTE.panda.blush, 0.85], [1, lion ? PALETTE.lion.blush : PALETTE.panda.blush, 0]], 0.5, 0.5, 0.5);
    d += radial(P + 'shadow', [[0, '#1E2233', 0.3], [1, '#1E2233', 0]], 0.5, 0.5, 0.5);
    d += lion ? linear(P + 'nose', [[0, '#8E5040'], [1, '#4A231A']], 0, 0, 0, 1) : linear(P + 'nose', [[0, '#55525F'], [1, '#18171D']], 0, 0, 0, 1);
    d += linear(P + 'lens', [[0, '#F4FBFF'], [0.5, '#A9DBF7'], [1, '#4F9FD0']], 0, 0, 1, 1);
    d += radial(P + 'glow', [[0, '#FFF6B0', 0.95], [0.45, '#FF8FB1', 0.38], [1, '#FF8FB1', 0]], 0.5, 0.5, 0.5);
    d += radial(P + 'listen', [[0, X.listen, 0.75], [1, X.listen, 0]], 0.5, 0.5, 0.5);
    d += linear(P + 'leaf', [[0, '#A6E584'], [0.5, '#6CC24A'], [1, '#3E8A2C']], 0, 0, 1, 1);
    d += radial(P + 'petal', [[0, '#FFF0F5'], [0.55, '#FFB3CB'], [1, '#FF8FB1']], 0.5, 0.95, 1);
    d += radial(P + 'gold', [[0, '#FFF4C0'], [0.5, '#FFD54A'], [1, '#DDA11B']], 0.4, 0.35, 0.7);
    d += linear(P + 'cape', [[0, '#5BA0F0'], [0.55, '#2F7DE1'], [1, '#1D56A8']], 0, 0, 0, 1);
    d += linear(P + 'lav', [[0, '#A992EA'], [1, '#6E54BB']], 0, 0, 0, 1);
    d += linear(P + 'plastic', [[0, '#FFFFFF'], [0.6, '#EEF1F7'], [1, '#C6CDDC']], 0, 0, 0.4, 1);
    d += radial(P + 'glass', [[0, '#2C3555'], [1, '#0E121D']], 0.4, 0.3, 0.9);
    d += lion
      ? radial(P + 'deye', [[0, '#FFF3CF'], [0.45, '#FFB54D'], [1, '#C9631A']], 0.45, 0.4, 0.65)
      : radial(P + 'deye', [[0, '#F3EEFF'], [0.45, '#B9A3FF'], [1, '#6A4FD0']], 0.45, 0.4, 0.65);
    d += lion
      ? radial(P + 'shell', [[0, '#FFE0A6'], [0.55, '#F4A940'], [1, '#C97222']], 0.38, 0.25, 0.9)
      : radial(P + 'shell', [[0, '#FFFFFF'], [0.6, '#F7F4EE'], [1, '#CFC7B8']], 0.38, 0.25, 0.9);
    d += linear(P + 'cylinder', lion
      ? [[0, '#B8661F'], [0.22, '#F4A940'], [0.45, '#FFC77A'], [0.8, '#E08E30'], [1, '#A85A1A']]
      : [[0, '#BDB5A6'], [0.22, '#F1EDE4'], [0.45, '#FFFFFF'], [0.8, '#E6E0D4'], [1, '#B3AB9C']], 0, 0, 1, 0);
    d += '<pattern id="' + P + 'scarf" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(32)"><rect width="12" height="12" fill="#FF7A1A"/><rect width="4" height="12" fill="#2F7DE1"/><rect x="4" width="1.2" height="12" fill="#FFB27A" fill-opacity=".6"/></pattern>';
    d += '<pattern id="' + P + 'fab" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6L6 0M-1.5 1.5L1.5 -1.5M4.5 7.5L7.5 4.5" stroke="#3a2a20" stroke-opacity=".15" stroke-width="1"/><circle cx="1.5" cy="1.5" r=".8" fill="#fff" fill-opacity=".32"/></pattern>';
    d += '<pattern id="' + P + 'mesh" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.05" fill="#000" fill-opacity=".16"/><circle cx="2" cy="2" r=".5" fill="#fff" fill-opacity=".25"/></pattern>';
    d += '<pattern id="' + P + 'dots" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.75" fill="' + (lion ? '#FFC062' : '#CDBDFF') + '"/></pattern>';
    d += '<pattern id="' + P + 'pix" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="none"/><rect width="3" height=".6" fill="#000" fill-opacity=".09"/><rect width=".6" height="3" fill="#000" fill-opacity=".09"/></pattern>';
    d += '<filter id="' + P + 'blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>';
    d += '<filter id="' + P + 'soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.4"/></filter>';
    d += '</defs>';
    return d;
  }

  // ---------------------------------------------------------------- geometry
  function geom(pet, stage, mood) {
    var g = stage / 4, hs = 1.06 - 0.12 * g;
    var G = { pet: pet, stage: stage, g: g, hs: hs, cx: 128 };
    G.bodyRx = (pet === 'panda' ? 45 : 41) + 8 * g;
    G.bodyRy = 34 + 14 * g;
    if (mood === 'proud') G.bodyRx += 3;
    G.bodyCy = 228 - G.bodyRy;
    G.neckY = G.bodyCy - G.bodyRy;
    G.headRx = 68 * hs; G.headRy = 60 * hs;
    G.headCy = G.neckY - G.headRy * 0.55 + 6;
    if (mood === 'proud') G.headCy -= 3;
    G.headTop = G.headCy - G.headRy; G.headBot = G.headCy + G.headRy;
    G.eyeDx = 25 * hs; G.eyeY = G.headCy + 4 * hs;
    G.eyeW = (13.5 - 1.6 * g) * hs; G.eyeH = (17 - 2.2 * g) * hs;
    G.noseY = G.headCy + 23 * hs;
    G.footY = 228; G.ground = 236;
    G.scale = 0.9 + 0.1 * g;
    G.tilt = ({ curious: 8, listening: 5, sleepy: -7, wobbly: 4, thinking: -4 })[mood] || 0;
    return G;
  }

  // Scalloped outline used for manes, cheek fluff and tufts.
  function scallop(cx, cy, rx, ry, a0, a1, n, depthFn, pointyFn) {
    var d = '', step = (a1 - a0) / n;
    for (var i = 0; i < n; i++) {
      var s = a0 + i * step, e = s + step, m = s + step / 2, dep = depthFn(m);
      var S0 = pt(cx, cy, rx, ry, s), E0 = pt(cx, cy, rx, ry, e);
      if (i === 0) d += 'M' + f(S0[0]) + ' ' + f(S0[1]);
      if (pointyFn && pointyFn(m)) {
        var tip = pt(cx, cy, rx + dep, ry + dep, m);
        var c1 = pt(cx, cy, rx + dep * 0.45, ry + dep * 0.45, s + step * 0.05), c2 = pt(cx, cy, rx + dep * 0.92, ry + dep * 0.92, m - step * 0.16);
        var c3 = pt(cx, cy, rx + dep * 0.92, ry + dep * 0.92, m + step * 0.16), c4 = pt(cx, cy, rx + dep * 0.45, ry + dep * 0.45, e - step * 0.05);
        d += ' C' + f(c1[0]) + ' ' + f(c1[1]) + ' ' + f(c2[0]) + ' ' + f(c2[1]) + ' ' + f(tip[0]) + ' ' + f(tip[1]) + ' C' + f(c3[0]) + ' ' + f(c3[1]) + ' ' + f(c4[0]) + ' ' + f(c4[1]) + ' ' + f(E0[0]) + ' ' + f(E0[1]);
      } else {
        var c1 = pt(cx, cy, rx + dep * 1.3, ry + dep * 1.3, s + step * 0.08);
        var c2 = pt(cx, cy, rx + dep * 1.3, ry + dep * 1.3, e - step * 0.08);
        d += ' C' + f(c1[0]) + ' ' + f(c1[1]) + ' ' + f(c2[0]) + ' ' + f(c2[1]) + ' ' + f(E0[0]) + ' ' + f(E0[1]);
      }
    }
    return d;
  }
  function arc(cx, cy, rx, ry, a0, a1) {
    var S0 = pt(cx, cy, rx, ry, a0), E0 = pt(cx, cy, rx, ry, a1);
    return 'M' + f(S0[0]) + ' ' + f(S0[1]) + ' A' + f(rx) + ' ' + f(ry) + ' 0 ' + (a1 - a0 > Math.PI ? 1 : 0) + ' 1 ' + f(E0[0]) + ' ' + f(E0[1]);
  }
  function ellPath(cx, cy, rx, ry) {
    return 'M' + f(cx - rx) + ' ' + f(cy) + ' A' + f(rx) + ' ' + f(ry) + ' 0 1 0 ' + f(cx + rx) + ' ' + f(cy) + ' A' + f(rx) + ' ' + f(ry) + ' 0 1 0 ' + f(cx - rx) + ' ' + f(cy) + 'Z';
  }
  function star(cx, cy, r, ri, n, rot) {
    n = n || 5; ri = ri || r * 0.45; rot = rot || -Math.PI / 2;
    var d = '';
    for (var i = 0; i < n * 2; i++) {
      var rr = i % 2 ? ri : r, a = rot + i * Math.PI / n;
      d += (i ? 'L' : 'M') + f(cx + rr * Math.cos(a)) + ' ' + f(cy + rr * Math.sin(a));
    }
    return d + 'Z';
  }
  function sparkle(x, y, s, fill, line) {
    var d = 'M' + f(x) + ' ' + f(y - s) + ' Q' + f(x + s * 0.16) + ' ' + f(y - s * 0.16) + ' ' + f(x + s) + ' ' + f(y) +
      ' Q' + f(x + s * 0.16) + ' ' + f(y + s * 0.16) + ' ' + f(x) + ' ' + f(y + s) +
      ' Q' + f(x - s * 0.16) + ' ' + f(y + s * 0.16) + ' ' + f(x - s) + ' ' + f(y) +
      ' Q' + f(x - s * 0.16) + ' ' + f(y - s * 0.16) + ' ' + f(x) + ' ' + f(y - s) + 'Z';
    return '<path d="' + d + '" fill="' + (fill || X.gold) + '" stroke="' + (line || X.goldDark) + '" stroke-width="1.2" stroke-linejoin="round"/>';
  }
  function limb(a, b, c, w, fill, line, pads, padCol) {
    var d = 'M' + f(a[0]) + ' ' + f(a[1]) + ' Q' + f(b[0]) + ' ' + f(b[1]) + ' ' + f(c[0]) + ' ' + f(c[1]);
    var pr = w * 0.64, s = '';
    s += '<path d="' + d + '" fill="none" stroke="' + line + '" stroke-width="' + f(w + 5.5) + '" stroke-linecap="round"/>';
    s += '<path d="' + d + '" fill="none" stroke="' + fill + '" stroke-width="' + f(w) + '" stroke-linecap="round"/>';
    s += '<circle cx="' + f(a[0]) + '" cy="' + f(a[1]) + '" r="' + f(w * 0.62) + '" fill="' + fill + '"/>';
    s += '<circle cx="' + f(c[0]) + '" cy="' + f(c[1]) + '" r="' + f(pr) + '" fill="' + fill + '" stroke="' + line + '" stroke-width="2.6"/>';
    // highlight along the top of the limb
    s += '<path d="' + d + '" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="' + f(w * 0.3) + '" stroke-linecap="round" transform="translate(-1.5 -2)"/>';
    if (pads) {
      s += '<ellipse cx="' + f(c[0]) + '" cy="' + f(c[1] + pr * 0.22) + '" rx="' + f(pr * 0.46) + '" ry="' + f(pr * 0.36) + '" fill="' + padCol + '"/>';
      [-2.25, -1.57, -0.9].forEach(function (an) {
        s += '<circle cx="' + f(c[0] + Math.cos(an) * pr * 0.58) + '" cy="' + f(c[1] + Math.sin(an) * pr * 0.52) + '" r="' + f(pr * 0.17) + '" fill="' + padCol + '"/>';
      });
    }
    return s;
  }
  function blob(x, y, r, fill) { return '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r) + '" fill="' + fill + '"/>'; }

  // ---------------------------------------------------------------- shared face parts
  function eyeOpen(x, y, w, h, look, P, pet, kind, side) {
    var lx = look[0] * w * 0.2, ly = look[1] * h * 0.12;
    var id = P + 'ec' + side, s = '';
    var iris = pet === 'lion' ? X.lionIris : X.pandaIris;
    if (kind === 'wide') { w *= 1.1; h *= 1.08; }
    if (pet === 'panda') s += '<ellipse cx="' + f(x) + '" cy="' + f(y) + '" rx="' + f(w * 1.1) + '" ry="' + f(h * 1.08) + '" fill="#FFFFFF"/>';
    s += '<clipPath id="' + id + '"><ellipse cx="' + f(x) + '" cy="' + f(y) + '" rx="' + f(w) + '" ry="' + f(h) + '"/></clipPath>';
    s += '<ellipse cx="' + f(x) + '" cy="' + f(y) + '" rx="' + f(w) + '" ry="' + f(h) + '" fill="' + iris[2] + '"/>';
    s += '<g clip-path="url(#' + id + ')">';
    s += '<ellipse cx="' + f(x + lx) + '" cy="' + f(y + ly + h * 0.1) + '" rx="' + f(w * 0.8) + '" ry="' + f(h * 0.78) + '" fill="url(#' + P + 'iris)"/>';
    s += '<ellipse cx="' + f(x + lx) + '" cy="' + f(y + ly + h * 0.16) + '" rx="' + f(w * 0.42) + '" ry="' + f(h * 0.44) + '" fill="#0B0605" fill-opacity=".82"/>';
    s += '<path d="M' + f(x - w * 0.62) + ' ' + f(y + h * 0.58) + ' Q' + f(x) + ' ' + f(y + h * 0.98) + ' ' + f(x + w * 0.62) + ' ' + f(y + h * 0.58) + '" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="' + f(w * 0.13) + '" stroke-linecap="round"/>';
    s += '</g>';
    var hx = x + lx - w * 0.3, hy = y + ly - h * 0.38;
    s += '<ellipse cx="' + f(hx) + '" cy="' + f(hy) + '" rx="' + f(w * 0.36) + '" ry="' + f(h * 0.28) + '" fill="#fff" transform="rotate(-24 ' + f(hx) + ' ' + f(hy) + ')"/>';
    s += '<circle cx="' + f(x + lx + w * 0.36) + '" cy="' + f(y + ly + h * 0.34) + '" r="' + f(w * 0.17) + '" fill="#fff" fill-opacity=".92"/>';
    if (kind === 'wide') s += sparkle(x + lx + w * 0.22, y + ly - h * 0.05, w * 0.22, '#fff', '#fff');
    if (kind === 'soft') {
      s += '<circle cx="' + f(x + lx - w * 0.05) + '" cy="' + f(y + ly + h * 0.5) + '" r="' + f(w * 0.12) + '" fill="#fff" fill-opacity=".9"/>';
      s += '<path d="M' + f(x - w * 0.8) + ' ' + f(y + h * 0.78) + ' Q' + f(x) + ' ' + f(y + h * 1.12) + ' ' + f(x + w * 0.8) + ' ' + f(y + h * 0.78) + '" fill="none" stroke="#CFEFFF" stroke-opacity=".9" stroke-width="' + f(w * 0.14) + '" stroke-linecap="round"/>';
    }
    // upper lash line for definition
    s += '<path d="' + arc(x, y, w, h, Math.PI * 1.12, Math.PI * 1.88) + '" fill="none" stroke="' + (pet === 'lion' ? '#1A0F0A' : '#0E0D12') + '" stroke-width="' + f(w * 0.16) + '" stroke-linecap="round"/>';
    return s;
  }
  function eyeArc(x, y, w, h, kind, color, sw) {
    var d = kind === 'happy'
      ? 'M' + f(x - w) + ' ' + f(y + h * 0.3) + ' Q' + f(x) + ' ' + f(y - h * 0.75) + ' ' + f(x + w) + ' ' + f(y + h * 0.3)
      : 'M' + f(x - w) + ' ' + f(y + h * 0.02) + ' Q' + f(x) + ' ' + f(y + h * 0.72) + ' ' + f(x + w) + ' ' + f(y + h * 0.02);
    var s = '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + f(sw) + '" stroke-linecap="round"/>';
    if (kind !== 'happy') {
      // tiny lashes at the outer corners
      s += '<path d="M' + f(x - w) + ' ' + f(y + h * 0.02) + ' l' + f(-w * 0.25) + ' ' + f(-h * 0.18) + 'M' + f(x + w) + ' ' + f(y + h * 0.02) + ' l' + f(w * 0.25) + ' ' + f(-h * 0.18) + '" stroke="' + color + '" stroke-width="' + f(sw * 0.7) + '" stroke-linecap="round"/>';
    }
    return s;
  }
  function eyePair(G, P, pet, o) {
    var state = o.blink ? 'closed' : EYES[o.mood];
    var look = LOOK[o.mood] || [0, 0];
    var lion = pet === 'lion', s = '';
    var arcCol = lion ? '#3A1C10' : '#F7F4EE';
    [-1, 1].forEach(function (side) {
      var x = G.cx + side * G.eyeDx, y = G.eyeY, w = G.eyeW, h = G.eyeH;
      if (state === 'closed' || state === 'happy') { s += eyeArc(x, y, w, h, state, arcCol, 3.6 * G.hs); return; }
      s += eyeOpen(x, y, w, h, look, P, pet, state, side < 0 ? 'l' : 'r');
      if (state === 'sleepy') {
        var lid = lion ? X.lionLid : PALETTE.panda.patch;
        var cid = P + 'lid' + (side < 0 ? 'l' : 'r');
        s += '<clipPath id="' + cid + '"><ellipse cx="' + f(x) + '" cy="' + f(y) + '" rx="' + f(w * (lion ? 1.06 : 1.16)) + '" ry="' + f(h * (lion ? 1.06 : 1.14)) + '"/></clipPath>';
        s += '<g clip-path="url(#' + cid + ')"><path d="M' + f(x - w * 1.3) + ' ' + f(y + h * 0.12) + ' Q' + f(x) + ' ' + f(y + h * 0.42) + ' ' + f(x + w * 1.3) + ' ' + f(y + h * 0.12) + ' L' + f(x + w * 1.3) + ' ' + f(y - h * 1.3) + ' L' + f(x - w * 1.3) + ' ' + f(y - h * 1.3) + 'Z" fill="' + lid + '"/></g>';
        s += '<path d="M' + f(x - w * 1.02) + ' ' + f(y + h * 0.1) + ' Q' + f(x) + ' ' + f(y + h * 0.42) + ' ' + f(x + w * 1.02) + ' ' + f(y + h * 0.1) + '" fill="none" stroke="' + (lion ? '#3A1C10' : '#8A8796') + '" stroke-width="' + f(3 * G.hs) + '" stroke-linecap="round"/>';
      }
    });
    return s;
  }
  var BROWS = {
    happy: [[0, 0, 0, -3], [0, 0, 0, -3]], excited: [[-6, 0, 0, -4], [-6, 0, 0, -4]], sleepy: [[3, 0, 1, -1], [3, 0, 1, -1]],
    curious: [[0, 0, 0, -3], [-7, 0, -1, -4]], proud: [[-1, 2, -2, -2], [-1, 2, -2, -2]], thinking: [[-6, 0, 0, -4], [1, 1, 0, -1]],
    listening: [[-4, 0, 0, -3], [-4, 0, 0, -3]], talking: [[-2, 0, 0, -3], [-2, 0, 0, -3]], wobbly: [[-1, -5, 2, -1], [-1, -5, 2, -1]]
  };
  function brows(G, mood, pet) {
    var cfg = BROWS[mood] || BROWS.happy, s = '', hs = G.hs;
    var by = G.eyeY - G.eyeH - (pet === 'panda' ? 15 : 9) * hs, bw = 8 * hs;
    var col = pet === 'lion' ? X.lionBrow : PALETTE.panda.patch;
    [-1, 1].forEach(function (side, i) {
      var c = cfg[i], bx = G.cx + side * G.eyeDx;
      var inX = bx - side * bw, outX = bx + side * bw;
      var yIn = by + c[0] + c[1], yOut = by + c[0] + c[2];
      s += '<path d="M' + f(outX) + ' ' + f(yOut) + ' Q' + f(bx) + ' ' + f(by + c[0] + c[3]) + ' ' + f(inX) + ' ' + f(yIn) + '" fill="none" stroke="' + col + '" stroke-width="' + f(4.2 * hs) + '" stroke-linecap="round"/>';
    });
    return s;
  }
  function tonguePath(x, y, a, b) { return ellPath(x, y, a, b); }
  // Mouth geometry shared by the pets and the LED faces.
  function mouthShapes(mood, x, y, k) {
    function F(v) { return f(v); }
    switch (mood) {
      case 'happy': return [
        { kind: 'inside', d: 'M' + F(x - 5.5 * k) + ' ' + F(y + 1.5 * k) + ' Q' + F(x) + ' ' + F(y + 13 * k) + ' ' + F(x + 5.5 * k) + ' ' + F(y + 1.5 * k) + ' Q' + F(x) + ' ' + F(y + 4 * k) + ' ' + F(x - 5.5 * k) + ' ' + F(y + 1.5 * k) + 'Z' },
        { kind: 'tongue', d: tonguePath(x, y + 7.2 * k, 3.1 * k, 2.2 * k) },
        { kind: 'line', d: 'M' + F(x - 9.5 * k) + ' ' + F(y - 1 * k) + ' Q' + F(x - 4.7 * k) + ' ' + F(y + 4.6 * k) + ' ' + F(x) + ' ' + F(y) + ' Q' + F(x + 4.7 * k) + ' ' + F(y + 4.6 * k) + ' ' + F(x + 9.5 * k) + ' ' + F(y - 1 * k) }];
      case 'excited': return [
        { kind: 'inside', d: 'M' + F(x - 11 * k) + ' ' + F(y) + ' Q' + F(x) + ' ' + F(y + 22 * k) + ' ' + F(x + 11 * k) + ' ' + F(y) + ' Q' + F(x) + ' ' + F(y + 4 * k) + ' ' + F(x - 11 * k) + ' ' + F(y) + 'Z', outline: true },
        { kind: 'tongue', d: 'M' + F(x - 6 * k) + ' ' + F(y + 10.5 * k) + ' Q' + F(x) + ' ' + F(y + 5.5 * k) + ' ' + F(x + 6 * k) + ' ' + F(y + 10.5 * k) + ' Q' + F(x) + ' ' + F(y + 15 * k) + ' ' + F(x - 6 * k) + ' ' + F(y + 10.5 * k) + 'Z' }];
      case 'talking': return [
        { kind: 'inside', d: ellPath(x, y + 5.5 * k, 5.6 * k, 6 * k), outline: true },
        { kind: 'tongue', d: tonguePath(x, y + 8.6 * k, 3.4 * k, 2.2 * k) }];
      case 'sleepy': return [{ kind: 'inside', d: ellPath(x, y + 5 * k, 3.4 * k, 4.4 * k), outline: true }];
      case 'curious': return [{ kind: 'inside', d: ellPath(x, y + 4.4 * k, 2.9 * k, 3.3 * k), outline: true }];
      case 'listening': return [{ kind: 'line', d: 'M' + F(x - 8 * k) + ' ' + F(y) + ' Q' + F(x - 4 * k) + ' ' + F(y + 5 * k) + ' ' + F(x) + ' ' + F(y + 0.6 * k) + ' Q' + F(x + 4 * k) + ' ' + F(y + 5 * k) + ' ' + F(x + 8 * k) + ' ' + F(y) }];
      case 'proud': return [{ kind: 'line', d: 'M' + F(x - 10 * k) + ' ' + F(y - 1 * k) + ' Q' + F(x - 5 * k) + ' ' + F(y + 5.5 * k) + ' ' + F(x) + ' ' + F(y + 0.6 * k) + ' Q' + F(x + 5.5 * k) + ' ' + F(y + 6.5 * k) + ' ' + F(x + 11.5 * k) + ' ' + F(y - 3.5 * k) }];
      case 'thinking': return [{ kind: 'line', d: 'M' + F(x + 0.5 * k) + ' ' + F(y + 4.5 * k) + ' Q' + F(x + 5 * k) + ' ' + F(y + 2 * k) + ' ' + F(x + 9.5 * k) + ' ' + F(y + 4 * k) }];
      case 'wobbly': return [{ kind: 'line', d: 'M' + F(x - 9 * k) + ' ' + F(y + 4.5 * k) + ' q' + F(2.25 * k) + ' ' + F(-2.8 * k) + ' ' + F(4.5 * k) + ' 0 t' + F(4.5 * k) + ' 0 t' + F(4.5 * k) + ' 0 t' + F(4.5 * k) + ' 0' }];
    }
    return [];
  }
  function mouth(G, mood, pet) {
    var k = G.hs, y = G.noseY + 10 * k, x = G.cx;
    var line = pet === 'lion' ? X.lionLine : X.pandaLine;
    var s = '<path d="M' + f(x) + ' ' + f(G.noseY + 6.5 * k) + ' L' + f(x) + ' ' + f(y + 0.5) + '" stroke="' + line + '" stroke-width="' + f(2.4 * k) + '" stroke-linecap="round"/>';
    mouthShapes(mood, x, y, k).forEach(function (m) {
      if (m.kind === 'inside') s += '<path d="' + m.d + '" fill="' + X.mouthIn + '"' + (m.outline ? ' stroke="' + line + '" stroke-width="' + f(2.2 * k) + '" stroke-linejoin="round"' : '') + '/>';
      else if (m.kind === 'tongue') s += '<path d="' + m.d + '" fill="' + X.tongue + '"/>';
      else s += '<path d="' + m.d + '" fill="none" stroke="' + line + '" stroke-width="' + f(2.5 * k) + '" stroke-linecap="round" stroke-linejoin="round"/>';
    });
    return s;
  }
  function nose(G, P) {
    var x = G.cx, y = G.noseY, k = G.hs;
    var d = 'M' + f(x - 8.5 * k) + ' ' + f(y - 3 * k) + ' C' + f(x - 8.5 * k) + ' ' + f(y - 7.5 * k) + ' ' + f(x + 8.5 * k) + ' ' + f(y - 7.5 * k) + ' ' + f(x + 8.5 * k) + ' ' + f(y - 3 * k) +
      ' C' + f(x + 8.5 * k) + ' ' + f(y + 1 * k) + ' ' + f(x + 3 * k) + ' ' + f(y + 6 * k) + ' ' + f(x) + ' ' + f(y + 6.5 * k) +
      ' C' + f(x - 3 * k) + ' ' + f(y + 6 * k) + ' ' + f(x - 8.5 * k) + ' ' + f(y + 1 * k) + ' ' + f(x - 8.5 * k) + ' ' + f(y - 3 * k) + 'Z';
    return '<path d="' + d + '" fill="url(#' + P + 'nose)"/>' +
      '<ellipse cx="' + f(x - 2.6 * k) + '" cy="' + f(y - 3.6 * k) + '" rx="' + f(3.2 * k) + '" ry="' + f(1.7 * k) + '" fill="#fff" fill-opacity=".55"/>';
  }
  function blush(G, P, pet, mood) {
    var s = '', k = G.hs, op = (mood === 'excited' || mood === 'proud' || mood === 'wobbly') ? 1 : 0.8;
    var dx = G.eyeDx + (pet === 'panda' ? 11 : 8) * k, y = G.eyeY + G.eyeH + (pet === 'panda' ? 11 : 6) * k;
    [-1, 1].forEach(function (side) {
      s += '<ellipse cx="' + f(G.cx + side * dx) + '" cy="' + f(y) + '" rx="' + f(11 * k) + '" ry="' + f(6.5 * k) + '" fill="url(#' + P + 'blush)" opacity="' + op + '"/>';
      for (var i = 0; i < 3; i++) s += '<path d="M' + f(G.cx + side * dx - 5 * k + i * 4 * k) + ' ' + f(y - 1.5 * k) + ' l' + f(-1.6 * k) + ' ' + f(3 * k) + '" stroke="#fff" stroke-opacity=".55" stroke-width="' + f(1.1 * k) + '" stroke-linecap="round"/>';
    });
    return s;
  }
  function furEdge(cx, cy, rx, ry, a0, a1, n, col, op, len) {
    var s = '';
    for (var i = 0; i <= n; i++) {
      var a = a0 + (a1 - a0) * i / n, p0 = pt(cx, cy, rx * 0.985, ry * 0.985, a), p1 = pt(cx, cy, rx * (1 - len), ry * (1 - len), a + 0.04);
      var c = pt(cx, cy, rx * (1 - len * 0.45), ry * (1 - len * 0.45), a - 0.05);
      s += 'M' + f(p0[0]) + ' ' + f(p0[1]) + ' Q' + f(c[0]) + ' ' + f(c[1]) + ' ' + f(p1[0]) + ' ' + f(p1[1]);
    }
    return '<path d="' + s + '" fill="none" stroke="' + col + '" stroke-opacity="' + op + '" stroke-width="1.6" stroke-linecap="round"/>';
  }
  function rim(cx, cy, rx, ry, a0, a1, w, op) {
    return '<path d="' + arc(cx, cy, rx - w * 0.9, ry - w * 0.9, a0, a1) + '" fill="none" stroke="#fff" stroke-opacity="' + (op || 0.45) + '" stroke-width="' + w + '" stroke-linecap="round"/>';
  }
  // Fluffy cheeks: drawn over the head outline with the same user-space gradient, then only the
  // scalloped outer edge is stroked, so the fluff grows out of the head without a seam.
  function cheekFluff(G, P, pet, gid) {
    var s = '', hs = G.hs, line = pet === 'lion' ? X.lionLine : X.pandaLine;
    var dep = function () { return 6.5 * hs; };
    [[Math.PI * 0.6, Math.PI * 1.0], [0, Math.PI * 0.4]].forEach(function (r) {
      var edge = scallop(G.cx, G.headCy, G.headRx, G.headRy, r[0], r[1], 3, dep);
      s += '<path d="' + edge + ' L' + G.cx + ' ' + f(G.headCy) + 'Z" fill="url(#' + gid + ')"/>';
      s += '<path d="' + edge + '" fill="none" stroke="' + line + '" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>';
      if (pet === 'lion') s += '<path d="' + edge + '" fill="none" stroke="' + PALETTE.lion.bodyShade + '" stroke-opacity=".5" stroke-width="1.4" transform="translate(' + (r[0] > 1 ? 2.5 : -2.5) + ' -2.5)"/>';
    });
    return s;
  }
  function headEllipse(G, P, pet, o) {
    var s = '', line = pet === 'lion' ? X.lionLine : X.pandaLine, gid = P + 'skinH';
    s += '<radialGradient id="' + gid + '" gradientUnits="userSpaceOnUse" cx="' + f(G.cx - G.headRx * 0.24) + '" cy="' + f(G.headCy - G.headRy * 0.4) + '" r="' + f(G.headRx * 1.7) + '">' + stops(SKIN_STOPS[pet]) + '</radialGradient>';
    s += '<ellipse cx="' + G.cx + '" cy="' + f(G.headCy) + '" rx="' + f(G.headRx) + '" ry="' + f(G.headRy) + '" fill="url(#' + gid + ')" stroke="' + line + '" stroke-width="3.2"/>';
    if (!o.faceOnly) s += cheekFluff(G, P, pet, gid);
    s += furEdge(G.cx, G.headCy, G.headRx, G.headRy, Math.PI * 1.08, Math.PI * 1.92, 11, pet === 'lion' ? PALETTE.lion.bodyShade : '#C9C1B2', pet === 'lion' ? 0.45 : 0.6, 0.07);
    s += rim(G.cx, G.headCy, G.headRx, G.headRy, Math.PI * 1.1, Math.PI * 1.42, 3.4, 0.5);
    if (o.plush) {
      s += '<ellipse cx="' + G.cx + '" cy="' + f(G.headCy) + '" rx="' + f(G.headRx - 1.5) + '" ry="' + f(G.headRy - 1.5) + '" fill="url(#' + P + 'fab)"/>';
      s += '<path d="M' + G.cx + ' ' + f(G.headTop + 3) + ' Q' + f(G.cx + 2) + ' ' + f(G.headTop + 16) + ' ' + G.cx + ' ' + f(G.headCy - 26 * G.hs) + '" fill="none" stroke="' + line + '" stroke-opacity=".45" stroke-width="1.6" stroke-dasharray="3.5 3" stroke-linecap="round"/>';
      s += '<ellipse cx="' + G.cx + '" cy="' + f(G.headCy) + '" rx="' + f(G.headRx - 6) + '" ry="' + f(G.headRy - 6) + '" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.6" stroke-dasharray="3 3.5"/>';
    }
    return s;
  }

  // ---------------------------------------------------------------- mood extras (drawn over the pet)
  function extras(G, P, pet, o) {
    var s = '', hs = G.hs, cx = G.cx, mood = o.mood;
    var accent = pet === 'lion' ? PALETTE.lion.safetyOrange : PALETTE.panda.lavender;
    var ax = Math.min(cx + G.headRx * 0.82 + 6, 226), ay = Math.max(G.headTop - 2, 52);
    if (mood === 'sleepy') {
      [[0, 0, 9], [13, -15, 12], [28, -33, 15]].forEach(function (z) {
        var x = ax - 8 + z[0], y = ay + z[1], w = z[2];
        s += '<path d="M' + f(x) + ' ' + f(y) + ' h' + f(w) + ' l' + f(-w) + ' ' + f(w) + ' h' + f(w) + '" fill="none" stroke="#fff" stroke-width="' + f(w * 0.42 + 3) + '" stroke-linecap="round" stroke-linejoin="round"/>';
        s += '<path d="M' + f(x) + ' ' + f(y) + ' h' + f(w) + ' l' + f(-w) + ' ' + f(w) + ' h' + f(w) + '" fill="none" stroke="' + X.zzz + '" stroke-width="' + f(w * 0.42) + '" stroke-linecap="round" stroke-linejoin="round"/>';
      });
    }
    if (mood === 'curious') {
      var qx = ax + 6, qy = ay - 8;
      var qd = 'M' + f(qx - 8) + ' ' + f(qy - 7) + ' C' + f(qx - 8) + ' ' + f(qy - 19) + ' ' + f(qx + 10) + ' ' + f(qy - 20) + ' ' + f(qx + 10) + ' ' + f(qy - 8) + ' C' + f(qx + 10) + ' ' + f(qy - 1) + ' ' + f(qx + 1) + ' ' + f(qy) + ' ' + f(qx + 1) + ' ' + f(qy + 7);
      s += '<path d="' + qd + '" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"/>';
      s += '<path d="' + qd + '" fill="none" stroke="' + accent + '" stroke-width="5.5" stroke-linecap="round"/>';
      s += '<circle cx="' + f(qx + 1) + '" cy="' + f(qy + 16) + '" r="5" fill="#fff"/><circle cx="' + f(qx + 1) + '" cy="' + f(qy + 16) + '" r="3.2" fill="' + accent + '"/>';
    }
    if (mood === 'excited') {
      s += sparkle(Math.max(cx - G.headRx - 4, 14), G.headCy - 28 * hs, 11);
      s += sparkle(Math.min(cx + G.headRx + 4, 242), G.headCy - 40 * hs, 13);
      s += sparkle(Math.min(cx + G.headRx - 2, 242), G.headCy + 34 * hs, 7);
      s += sparkle(Math.max(cx - G.headRx + 10, 14), Math.max(G.headTop - 6, 14), 8);
      s += '<circle cx="' + f(cx - G.headRx - 14) + '" cy="' + f(G.headCy + 8) + '" r="2.6" fill="' + X.gold + '"/>';
    }
    if (mood === 'talking') {
      var mx = cx + 22 * hs, my = G.noseY + 12 * hs;
      s += '<path d="M' + f(mx + 6) + ' ' + f(my - 6) + ' l8 -5 M' + f(mx + 8) + ' ' + f(my + 2) + ' l10 0 M' + f(mx + 6) + ' ' + f(my + 10) + ' l8 5" stroke="' + accent + '" stroke-width="3.2" stroke-linecap="round" opacity=".85"/>';
    }
    if (mood === 'thinking') {
      var tx = cx - G.headRx * 0.62, ty = Math.max(G.headTop + 4, 40);
      [[0, 0, 3.2], [-9, -11, 4.6], [-22, -27, 8.5]].forEach(function (c) {
        s += '<circle cx="' + f(tx + c[0]) + '" cy="' + f(ty + c[1]) + '" r="' + c[2] + '" fill="#fff" stroke="' + X.ink + '" stroke-opacity=".35" stroke-width="1.6"/>';
      });
      s += sparkle(tx - 22, ty - 27, 4, X.gold, X.goldDark);
    }
    if (mood === 'wobbly') {
      var dx = cx + G.headRx * 0.78, dy = G.headCy - G.headRy * 0.32;
      s += '<path d="M' + f(dx) + ' ' + f(dy - 9) + ' Q' + f(dx + 6) + ' ' + f(dy) + ' ' + f(dx) + ' ' + f(dy + 4) + ' Q' + f(dx - 6) + ' ' + f(dy) + ' ' + f(dx) + ' ' + f(dy - 9) + 'Z" fill="' + X.sweat + '" stroke="' + X.sweatLine + '" stroke-width="1.6"/>';
      [-1, 1].forEach(function (side) {
        var wx = cx + side * (G.bodyRx + 12), wy = G.bodyCy - 4;
        s += '<path d="M' + f(wx) + ' ' + f(wy - 10) + ' q' + f(side * 5) + ' 5 0 10 t0 10" fill="none" stroke="' + X.ink + '" stroke-opacity=".3" stroke-width="2.4" stroke-linecap="round"/>';
      });
    }
    return s;
  }
  function listenRing(x, y, r, P) {
    return '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r + 7) + '" fill="url(#' + P + 'listen)"/>' +
      '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r + 4) + '" fill="none" stroke="' + X.listen + '" stroke-width="5" opacity=".55" filter="url(#' + P + 'blur)"/>' +
      '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r + 4) + '" fill="none" stroke="' + X.listen + '" stroke-width="2.4"/>';
  }
  function soundArcs(x, y) {
    var s = '';
    [12, 22, 32].forEach(function (r, i) {
      s += '<path d="' + arc(x, y, r, r, -0.75, 0.75) + '" fill="none" stroke="' + X.listen + '" stroke-width="' + (3.6 - i * 0.6) + '" stroke-linecap="round" opacity="' + (1 - i * 0.22) + '"/>';
    });
    return s;
  }

  // ---------------------------------------------------------------- lion
  function earRot(mood, side) {
    switch (mood) {
      case 'sleepy': return 24; case 'wobbly': return 16; case 'excited': return -8;
      case 'listening': return side > 0 ? -12 : 2; case 'curious': return side < 0 ? 12 : -6;
    }
    return 0;
  }
  function lionMane(G, P) {
    var st = G.stage; if (st === 0) return '';
    var p = [null, [1.1, 1.12, 14, 7], [1.18, 1.2, 16, 10], [1.27, 1.28, 18, 13], [1.32, 1.32, 18, 14]][st];
    var rx = G.headRx * p[0], ry = G.headRy * p[1], n = p[2], dep = p[3], cx = G.cx, cy = G.headCy + 4;
    var crown = st === 4, step = 2 * Math.PI / n, a0 = -Math.PI / 2 - step / 2;
    var off = function (a) { return Math.abs(normA(a + Math.PI / 2)); };
    var isTop = function (a) { return off(a) < 0.75; };
    var depthFn = function (a) { return crown && isTop(a) ? dep * (2.05 - 0.75 * off(a) / 0.75) : dep * (0.88 + 0.12 * Math.cos(a * 3)); };
    var pointy = crown ? isTop : null;
    var s = '';
    s += '<path d="' + scallop(cx, cy + 3, rx + 6, ry + 6, a0 + step / 2, a0 + step / 2 + 2 * Math.PI, n, function (a) { return crown && isTop(a) ? dep * 1.25 : depthFn(a) * 1.02; }, null) + 'Z" fill="url(#' + P + 'maneD)" stroke="' + X.lionLine + '" stroke-width="3" stroke-linejoin="round"/>';
    s += '<path d="' + scallop(cx, cy, rx, ry, a0, a0 + 2 * Math.PI, n, depthFn, pointy) + 'Z" fill="url(#' + P + 'mane)" stroke="' + X.lionLine + '" stroke-width="2.6" stroke-linejoin="round"/>';
    // fur strokes on every lobe
    var fs = '';
    for (var i = 0; i < n; i++) {
      var m = a0 + step * (i + 0.5), dd = depthFn(m);
      var q0 = pt(cx, cy, rx - 4, ry - 4, m - 0.05), q1 = pt(cx, cy, rx + dd * 0.35, ry + dd * 0.35, m + 0.06), q2 = pt(cx, cy, rx + dd * 0.72, ry + dd * 0.72, m - 0.02);
      fs += 'M' + f(q0[0]) + ' ' + f(q0[1]) + ' Q' + f(q1[0]) + ' ' + f(q1[1]) + ' ' + f(q2[0]) + ' ' + f(q2[1]);
      var r0 = pt(cx, cy, rx - 8, ry - 8, m + step * 0.28), r1 = pt(cx, cy, rx + dd * 0.4, ry + dd * 0.4, m + step * 0.22);
      fs += 'M' + f(r0[0]) + ' ' + f(r0[1]) + ' L' + f(r1[0]) + ' ' + f(r1[1]);
    }
    s += '<path d="' + fs + '" fill="none" stroke="' + X.lionLine + '" stroke-opacity=".5" stroke-width="1.8" stroke-linecap="round"/>';
    var hl = '';
    for (var j = 0; j < n; j++) {
      var mm = normA(a0 + step * (j + 0.5));
      if (mm < -Math.PI * 0.95 || mm > -Math.PI * 0.2) continue;
      var de = depthFn(mm), h0 = pt(cx, cy, rx + de * 0.55, ry + de * 0.55, mm - step * 0.3), h1 = pt(cx, cy, rx + de * 0.95, ry + de * 0.95, mm), h2 = pt(cx, cy, rx + de * 0.55, ry + de * 0.55, mm + step * 0.3);
      hl += 'M' + f(h0[0]) + ' ' + f(h0[1]) + ' Q' + f(h1[0]) + ' ' + f(h1[1]) + ' ' + f(h2[0]) + ' ' + f(h2[1]);
    }
    s += '<path d="' + hl + '" fill="none" stroke="#F09A5A" stroke-opacity=".8" stroke-width="2.4" stroke-linecap="round"/>';
    s += '<path d="' + arc(cx, cy, rx + dep * 0.4, ry + dep * 0.4, Math.PI * 1.1, Math.PI * 1.45) + '" fill="none" stroke="#FFB27A" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>';
    return s;
  }
  function lionEars(G, P, mood) {
    var s = '', r = 17 * G.hs;
    [-1, 1].forEach(function (side) {
      var ex = G.cx + side * G.headRx * 0.74, ey = G.headCy - G.headRy * 0.74;
      s += '<g transform="rotate(' + (side * earRot(mood, side)) + ' ' + f(ex) + ' ' + f(ey + r * 0.8) + ')">';
      if (mood === 'listening' && side > 0) s += listenRing(ex, ey, r, P);
      s += '<circle cx="' + f(ex) + '" cy="' + f(ey) + '" r="' + f(r) + '" fill="url(#' + P + 'skin)" stroke="' + X.lionLine + '" stroke-width="3"/>';
      s += '<ellipse cx="' + f(ex) + '" cy="' + f(ey + 2 * G.hs) + '" rx="' + f(r * 0.56) + '" ry="' + f(r * 0.52) + '" fill="' + PALETTE.lion.innerEar + '"/>';
      s += '<path d="M' + f(ex - r * 0.25) + ' ' + f(ey + r * 0.45) + ' q' + f(r * 0.08) + ' ' + f(-r * 0.38) + ' ' + f(r * 0.32) + ' ' + f(-r * 0.55) + ' M' + f(ex + r * 0.05) + ' ' + f(ey + r * 0.5) + ' q' + f(r * 0.06) + ' ' + f(-r * 0.3) + ' ' + f(r * 0.28) + ' ' + f(-r * 0.42) + '" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="1.5" stroke-linecap="round"/>';
      s += '</g>';
    });
    return s;
  }
  function lionTuft(G, P) {
    var x = G.cx, t = G.headTop, k = G.hs * (G.stage === 0 ? 1.15 : 0.9);
    var d = 'M' + f(x - 10 * k) + ' ' + f(t + 9 * k) + ' Q' + f(x - 9 * k) + ' ' + f(t - 8 * k) + ' ' + f(x + 2 * k) + ' ' + f(t - 13 * k) +
      ' Q' + f(x - 2 * k) + ' ' + f(t - 3 * k) + ' ' + f(x + 6 * k) + ' ' + f(t - 7 * k) + ' Q' + f(x + 7 * k) + ' ' + f(t + 1 * k) + ' ' + f(x + 11 * k) + ' ' + f(t + 8 * k) + 'Z';
    return '<path d="' + d + '" fill="url(#' + P + 'mane)" stroke="' + X.lionLine + '" stroke-width="2.6" stroke-linejoin="round"/>' +
      '<path d="M' + f(x - 3 * k) + ' ' + f(t + 4 * k) + ' Q' + f(x - 2 * k) + ' ' + f(t - 4 * k) + ' ' + f(x + 2 * k) + ' ' + f(t - 9 * k) + '" fill="none" stroke="#FFB27A" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round"/>';
  }
  function lionFace(G, P, o) {
    var s = '', cx = G.cx, hs = G.hs, my = G.noseY + 8 * hs;
    // forehead marks
    s += '<path d="M' + f(cx - 6 * hs) + ' ' + f(G.headTop + 16 * hs) + ' q2 6 1 11 M' + f(cx) + ' ' + f(G.headTop + 13 * hs) + ' v11 M' + f(cx + 6 * hs) + ' ' + f(G.headTop + 16 * hs) + ' q-2 6 -1 11" fill="none" stroke="' + PALETTE.lion.bodyShade + '" stroke-opacity=".55" stroke-width="2.4" stroke-linecap="round"/>';
    // muzzle
    s += '<ellipse cx="' + f(cx) + '" cy="' + f(my + 9 * hs) + '" rx="' + f(10 * hs) + '" ry="' + f(7 * hs) + '" fill="url(#' + P + 'cream)"/>';
    s += '<ellipse cx="' + f(cx - 11 * hs) + '" cy="' + f(my) + '" rx="' + f(14.5 * hs) + '" ry="' + f(11 * hs) + '" fill="url(#' + P + 'cream)"/>';
    s += '<ellipse cx="' + f(cx + 11 * hs) + '" cy="' + f(my) + '" rx="' + f(14.5 * hs) + '" ry="' + f(11 * hs) + '" fill="url(#' + P + 'cream)"/>';
    if (o.plush) s += '<path d="' + ellPath(cx, my + 2 * hs, 26 * hs, 15 * hs) + '" fill="none" stroke="' + X.lionLine + '" stroke-opacity=".35" stroke-width="1.5" stroke-dasharray="3 3"/>';
    // whisker dots
    [-1, 1].forEach(function (side) {
      [[7, -1], [12.5, 1.5], [17, -0.5]].forEach(function (w) {
        s += '<circle cx="' + f(cx + side * w[0] * hs) + '" cy="' + f(my + w[1] * hs) + '" r="' + f(1.25 * hs) + '" fill="#C98A5A"/>';
      });
    });
    s += nose(G, P) + mouth(G, o.mood, 'lion');
    s += blush(G, P, 'lion', o.mood);
    s += eyePair(G, P, 'lion', o);
    s += brows(G, o.mood, 'lion');
    return s;
  }
  function lionGoggles(G, P) {
    var s = '', cx = G.cx, hs = G.hs, gy = G.headCy - G.headRy * 0.68, lr = 12.5 * hs;
    var sw = G.headRx * 0.98;
    var strap = 'M' + f(cx - sw) + ' ' + f(gy + 10) + ' Q' + f(cx) + ' ' + f(gy - 12) + ' ' + f(cx + sw) + ' ' + f(gy + 10);
    s += '<path d="' + strap + '" fill="none" stroke="' + X.lionLine + '" stroke-width="10" stroke-linecap="round"/>';
    s += '<path d="' + strap + '" fill="none" stroke="' + PALETTE.lion.safetyOrange + '" stroke-width="6.5" stroke-linecap="round"/>';
    s += '<path d="' + strap + '" fill="none" stroke="#FFD3A8" stroke-width="1.2" stroke-dasharray="2.5 3"/>';
    s += '<rect x="' + f(cx - 7 * hs) + '" y="' + f(gy - 4 * hs) + '" width="' + f(14 * hs) + '" height="' + f(7 * hs) + '" rx="3" fill="' + PALETTE.lion.truckBlue + '" stroke="' + X.lionLine + '" stroke-width="2"/>';
    [-1, 1].forEach(function (side) {
      var lx = cx + side * 17 * hs;
      s += '<circle cx="' + f(lx) + '" cy="' + f(gy) + '" r="' + f(lr) + '" fill="' + PALETTE.lion.truckBlue + '" stroke="' + X.lionLine + '" stroke-width="2.6"/>';
      s += '<circle cx="' + f(lx) + '" cy="' + f(gy) + '" r="' + f(lr * 0.7) + '" fill="url(#' + P + 'lens)" stroke="#1D56A8" stroke-width="1.6"/>';
      s += '<path d="' + arc(lx, gy, lr * 0.5, lr * 0.5, Math.PI * 1.05, Math.PI * 1.5) + '" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>';
      for (var i = 0; i < 4; i++) { var rv = pt(lx, gy, lr * 0.86, lr * 0.86, Math.PI / 4 + i * Math.PI / 2); s += '<circle cx="' + f(rv[0]) + '" cy="' + f(rv[1]) + '" r="1.2" fill="#BFE0FF"/>'; }
    });
    return s;
  }
  function lionScarf(G, P) {
    var cx = G.cx, hb = G.headBot, W = Math.min(G.headRx * 0.72, G.bodyRx + 2), s = '';
    var band = 'M' + f(cx - W) + ' ' + f(hb - 8) + ' Q' + f(cx) + ' ' + f(hb + 13) + ' ' + f(cx + W) + ' ' + f(hb - 8) + ' L' + f(cx + W - 2) + ' ' + f(hb + 5) + ' Q' + f(cx) + ' ' + f(hb + 28) + ' ' + f(cx - W + 2) + ' ' + f(hb + 5) + 'Z';
    s += '<path d="' + band + '" fill="url(#' + P + 'scarf)" stroke="#9C3E08" stroke-width="2.4" stroke-linejoin="round"/>';
    s += '<path d="M' + f(cx - W + 4) + ' ' + f(hb - 4) + ' Q' + f(cx) + ' ' + f(hb + 16) + ' ' + f(cx + W - 4) + ' ' + f(hb - 4) + '" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>';
    var kx = cx + W * 0.42, ky = hb + 12;
    s += '<path d="M' + f(kx - 4) + ' ' + f(ky + 4) + ' Q' + f(kx - 9) + ' ' + f(ky + 22) + ' ' + f(kx - 3) + ' ' + f(ky + 34) + ' L' + f(kx + 7) + ' ' + f(ky + 30) + ' Q' + f(kx + 3) + ' ' + f(ky + 18) + ' ' + f(kx + 6) + ' ' + f(ky + 4) + 'Z" fill="url(#' + P + 'scarf)" stroke="#9C3E08" stroke-width="2.2" stroke-linejoin="round"/>';
    s += '<path d="M' + f(kx + 3) + ' ' + f(ky + 4) + ' Q' + f(kx + 12) + ' ' + f(ky + 14) + ' ' + f(kx + 18) + ' ' + f(ky + 26) + ' L' + f(kx + 24) + ' ' + f(ky + 20) + ' Q' + f(kx + 16) + ' ' + f(ky + 10) + ' ' + f(kx + 9) + ' ' + f(ky + 1) + 'Z" fill="url(#' + P + 'scarf)" stroke="#9C3E08" stroke-width="2.2" stroke-linejoin="round"/>';
    s += '<path d="M' + f(kx - 3) + ' ' + f(ky + 34) + ' l-1 4 M' + f(kx + 1) + ' ' + f(ky + 33) + ' l0 4 M' + f(kx + 5) + ' ' + f(ky + 31) + ' l1 4 M' + f(kx + 19) + ' ' + f(ky + 26) + ' l1 4 M' + f(kx + 22) + ' ' + f(ky + 23) + ' l3 3" stroke="#FF7A1A" stroke-width="2" stroke-linecap="round"/>';
    s += '<ellipse cx="' + f(kx + 2) + '" cy="' + f(ky + 3) + '" rx="8" ry="6.5" fill="url(#' + P + 'scarf)" stroke="#9C3E08" stroke-width="2.2"/>';
    return s;
  }
  function lionCape(G, P) {
    var cx = G.cx, rx = G.bodyRx, top = G.neckY + 10, bot = G.footY - 2;
    var d = 'M' + f(cx - rx * 0.8) + ' ' + f(top) + ' Q' + f(cx - rx - 28) + ' ' + f(G.bodyCy + G.bodyRy * 0.4) + ' ' + f(cx - rx - 18) + ' ' + f(bot) +
      ' Q' + f(cx - rx * 0.5) + ' ' + f(bot + 7) + ' ' + f(cx) + ' ' + f(bot + 2) + ' Q' + f(cx + rx * 0.5) + ' ' + f(bot + 7) + ' ' + f(cx + rx + 18) + ' ' + f(bot) +
      ' Q' + f(cx + rx + 28) + ' ' + f(G.bodyCy + G.bodyRy * 0.4) + ' ' + f(cx + rx * 0.8) + ' ' + f(top) + 'Z';
    var trim = 'M' + f(cx - rx - 18) + ' ' + f(bot) + ' Q' + f(cx - rx * 0.5) + ' ' + f(bot + 7) + ' ' + f(cx) + ' ' + f(bot + 2) + ' Q' + f(cx + rx * 0.5) + ' ' + f(bot + 7) + ' ' + f(cx + rx + 18) + ' ' + f(bot);
    return '<path d="' + d + '" fill="url(#' + P + 'cape)" stroke="#173F7A" stroke-width="2.8" stroke-linejoin="round"/>' +
      '<path d="' + trim + '" fill="none" stroke="' + PALETTE.lion.safetyOrange + '" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M' + f(cx - rx - 10) + ' ' + f(G.bodyCy) + ' q-6 18 -6 34 M' + f(cx + rx + 10) + ' ' + f(G.bodyCy) + ' q6 18 6 34" fill="none" stroke="#173F7A" stroke-opacity=".45" stroke-width="2" stroke-linecap="round"/>';
  }
  function lionTail(G, P, mood) {
    var cx = G.cx, rx = G.bodyRx, up = mood === 'excited' ? -22 : mood === 'sleepy' || mood === 'wobbly' ? 16 : 0;
    var a = [cx + rx * 0.55, G.bodyCy + G.bodyRy * 0.55], b = [cx + rx + 26, G.bodyCy + G.bodyRy * 0.7], c = [cx + rx + 22, G.bodyCy - G.bodyRy * 0.45 + up];
    var d = 'M' + f(a[0]) + ' ' + f(a[1]) + ' Q' + f(b[0]) + ' ' + f(b[1]) + ' ' + f(c[0]) + ' ' + f(c[1]);
    var s = '<path d="' + d + '" fill="none" stroke="' + X.lionLine + '" stroke-width="15" stroke-linecap="round"/>';
    s += '<path d="' + d + '" fill="none" stroke="' + PALETTE.lion.body + '" stroke-width="9.5" stroke-linecap="round"/>';
    var tr = 9.5;
    s += '<path d="' + scallop(c[0], c[1] - 3, tr, tr * 1.15, -Math.PI / 2, Math.PI * 1.5, 6, function () { return 3.4; }) + 'Z" fill="url(#' + P + 'mane)" stroke="' + X.lionLine + '" stroke-width="2.4" stroke-linejoin="round"/>';
    s += '<path d="M' + f(c[0] - 3) + ' ' + f(c[1] + 2) + ' q2 -7 5 -10 M' + f(c[0] + 2) + ' ' + f(c[1] + 3) + ' q1 -6 4 -8" fill="none" stroke="' + X.lionLine + '" stroke-opacity=".5" stroke-width="1.6" stroke-linecap="round"/>';
    return s;
  }
  function bodyEgg(G, P, pet, o) {
    var cx = G.cx, s = '', lion = pet === 'lion', line = lion ? X.lionLine : X.pandaLine;
    var cid = P + 'bc';
    s += '<clipPath id="' + cid + '"><ellipse cx="' + cx + '" cy="' + f(G.bodyCy) + '" rx="' + f(G.bodyRx) + '" ry="' + f(G.bodyRy) + '"/></clipPath>';
    s += '<ellipse cx="' + cx + '" cy="' + f(G.bodyCy) + '" rx="' + f(G.bodyRx) + '" ry="' + f(G.bodyRy) + '" fill="url(#' + P + 'skin)" stroke="' + line + '" stroke-width="3.2"/>';
    s += '<g clip-path="url(#' + cid + ')">';
    if (lion) {
      s += '<ellipse cx="' + cx + '" cy="' + f(G.bodyCy + G.bodyRy * 0.3) + '" rx="' + f(G.bodyRx * 0.6) + '" ry="' + f(G.bodyRy * 0.72) + '" fill="url(#' + P + 'cream)"/>';
      // chest fluff
      var fy = G.bodyCy + G.bodyRy * 0.3 - G.bodyRy * 0.72 + 2, fz = '';
      for (var i = -2; i <= 2; i++) fz += 'M' + f(cx + i * 7 - 3) + ' ' + f(fy + 2 + Math.abs(i)) + ' l3 6 l3 -6';
      s += '<path d="' + fz + '" fill="none" stroke="#E3B987" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>';
      if (G.stage <= 1) {
        [[-0.72, 0.05, 4.5], [-0.6, 0.45, 3.5], [0.7, -0.05, 4], [0.62, 0.42, 3.2], [-0.82, -0.3, 2.8]].forEach(function (sp) {
          s += '<ellipse cx="' + f(cx + sp[0] * G.bodyRx) + '" cy="' + f(G.bodyCy + sp[1] * G.bodyRy) + '" rx="' + sp[2] + '" ry="' + f(sp[2] * 0.75) + '" fill="' + PALETTE.lion.bodyShade + '" fill-opacity=".45"/>';
        });
      }
    } else {
      s += '<ellipse cx="' + cx + '" cy="' + f(G.neckY + G.bodyRy * 0.24) + '" rx="' + f(G.bodyRx * 1.12) + '" ry="' + f(G.bodyRy * 0.62) + '" fill="url(#' + P + 'patch)"/>';
      s += '<ellipse cx="' + cx + '" cy="' + f(G.bodyCy + G.bodyRy * 0.42) + '" rx="' + f(G.bodyRx * 0.52) + '" ry="' + f(G.bodyRy * 0.45) + '" fill="#FFFFFF" fill-opacity=".55"/>';
    }
    s += '<ellipse cx="' + cx + '" cy="' + f(G.headBot - 1) + '" rx="' + f(G.headRx * 0.72) + '" ry="12" fill="' + line + '" fill-opacity=".16"/>';
    if (o.plush) {
      s += '<rect x="0" y="0" width="256" height="256" fill="url(#' + P + 'fab)"/>';
      s += '<path d="M' + cx + ' ' + f(G.bodyCy - G.bodyRy * 0.1) + ' V' + f(G.bodyCy + G.bodyRy) + '" stroke="' + line + '" stroke-opacity=".4" stroke-width="1.6" stroke-dasharray="3.5 3"/>';
      s += '<ellipse cx="' + cx + '" cy="' + f(G.bodyCy) + '" rx="' + f(G.bodyRx - 5) + '" ry="' + f(G.bodyRy - 5) + '" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.5" stroke-dasharray="3 3.5"/>';
    }
    s += '</g>';
    s += rim(cx, G.bodyCy, G.bodyRx, G.bodyRy, Math.PI * 1.05, Math.PI * 1.35, 2.8, 0.45);
    if (o.plush) s += plushDetails(G, P, pet);
    return s;
  }
  function heartPath(x, y, s) {
    return 'M' + f(x) + ' ' + f(y + s * 0.9) + ' C' + f(x - s * 1.4) + ' ' + f(y) + ' ' + f(x - s * 0.8) + ' ' + f(y - s * 1.0) + ' ' + f(x) + ' ' + f(y - s * 0.35) +
      ' C' + f(x + s * 0.8) + ' ' + f(y - s * 1.0) + ' ' + f(x + s * 1.4) + ' ' + f(y) + ' ' + f(x) + ' ' + f(y + s * 0.9) + 'Z';
  }
  function plushDetails(G, P, pet) {
    var s = '', cx = G.cx, acc = pet === 'lion' ? PALETTE.lion.safetyOrange : PALETTE.panda.lavender;
    var hy = G.bodyCy + G.bodyRy * 0.28;
    s += '<path d="' + heartPath(cx, hy, 9) + '" fill="' + acc + '" stroke="#fff" stroke-width="1.6" stroke-dasharray="2.2 2"/>';
    s += '<path d="' + heartPath(cx - 1.5, hy - 1.5, 4) + '" fill="#fff" fill-opacity=".35"/>';
    var tx = cx - G.bodyRx + 2, ty = G.bodyCy + G.bodyRy * 0.15;
    s += '<g transform="rotate(-14 ' + f(tx) + ' ' + f(ty) + ')"><rect x="' + f(tx - 13) + '" y="' + f(ty - 8) + '" width="15" height="19" rx="2" fill="#FFFDF8" stroke="#B9B1A3" stroke-width="1.2"/>' +
      '<rect x="' + f(tx - 13) + '" y="' + f(ty - 8) + '" width="15" height="5" fill="' + acc + '"/><path d="' + heartPath(tx - 5.5, ty + 4, 3) + '" fill="' + acc + '"/></g>';
    return s;
  }
  function feet(G, P, pet) {
    var s = '', lion = pet === 'lion', line = lion ? X.lionLine : X.pandaDark, rx = 15 + 3 * G.g;
    var fill = lion ? 'url(#' + P + 'skin)' : 'url(#' + P + 'patch)';
    [-1, 1].forEach(function (side) {
      var fx = G.cx + side * G.bodyRx * 0.5, fy = G.footY;
      s += '<ellipse cx="' + f(fx) + '" cy="' + f(fy) + '" rx="' + f(rx) + '" ry="10" fill="' + fill + '" stroke="' + line + '" stroke-width="3"/>';
      s += '<path d="M' + f(fx - 4) + ' ' + f(fy - 9) + ' q-1 5 0 9 M' + f(fx + 4) + ' ' + f(fy - 9) + ' q1 5 0 9" fill="none" stroke="' + (lion ? X.lionLine : '#6A6774') + '" stroke-opacity=".7" stroke-width="1.8" stroke-linecap="round"/>';
      s += '<path d="' + arc(fx, fy, rx - 3, 7, Math.PI * 1.15, Math.PI * 1.5) + '" fill="none" stroke="#fff" stroke-opacity="' + (lion ? 0.45 : 0.25) + '" stroke-width="2" stroke-linecap="round"/>';
    });
    return s;
  }
  function arms(G, P, pet, mood, which) {
    // which: 'body' (normal arms) or 'front' (paw raised to the chin, drawn over the head)
    var lion = pet === 'lion', s = '', rx = G.bodyRx, ry = G.bodyRy, cx = G.cx, cy = G.bodyCy, w = 15 + 3 * G.g;
    var fill = lion ? PALETTE.lion.body : PALETTE.panda.patch, line = lion ? X.lionLine : X.pandaDark, pad = lion ? X.lionPad : X.pandaPad;
    [-1, 1].forEach(function (side) {
      var sh = [cx + side * rx * 0.62, cy - ry * 0.38], el, pw, pads = false, front = false;
      if (mood === 'excited') { el = [cx + side * (rx + 18), cy - ry * 0.45]; pw = [cx + side * (rx + 22), cy - ry - 10]; pads = true; front = true; }
      else if (mood === 'proud') { el = [cx + side * (rx + 22), cy - ry * 0.05]; pw = [cx + side * (rx * 0.74), cy + ry * 0.3]; }
      else if (mood === 'wobbly') { el = [cx + side * (rx * 0.8), cy + ry * 0.15]; pw = [cx + side * 9, cy + ry * 0.12]; }
      else if (mood === 'thinking' && side < 0) { el = [cx - rx * 0.45, cy + ry * 0.35]; pw = [cx - 15 * G.hs, G.headBot - 7 * G.hs]; front = true; pads = false; }
      else if (mood === 'talking' && side > 0) { el = [cx + rx + 14, cy + ry * 0.05]; pw = [cx + rx + 22, cy - ry * 0.55]; pads = true; front = true; }
      else if (mood === 'sleepy') { el = [cx + side * (rx + 2), cy + ry * 0.05]; pw = [cx + side * (rx * 0.82), cy + ry * 0.55]; }
      else { el = [cx + side * (rx + 7), cy - ry * 0.05]; pw = [cx + side * (rx * 0.88), cy + ry * 0.42]; }
      if ((which === 'front') !== front) return;
      s += limb(sh, el, pw, w, fill, line, pads, pad);
    });
    return s;
  }
  function proudStar(G, P) {
    var x = G.cx, y = G.bodyCy - G.bodyRy * 0.08;
    return '<path d="' + star(x, y, 11, 5) + '" fill="url(#' + P + 'gold)" stroke="' + X.goldDark + '" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="' + star(x - 1.5, y - 1.5, 4, 1.8) + '" fill="#fff" fill-opacity=".7"/>';
  }

  function lionFull(o, P) {
    var G = geom('lion', o.stage, o.mood), s = '', hb = '', hf = '', mood = o.mood;
    var tilt = 'rotate(' + G.tilt + ' ' + G.cx + ' ' + f(G.neckY + 4) + ')';
    s += '<ellipse cx="128" cy="' + G.ground + '" rx="' + f(G.bodyRx + 34) + '" ry="10" fill="url(#' + P + 'shadow)"/>';
    s += '<g transform="translate(128 ' + G.ground + ') scale(' + f(G.scale * 100) / 100 + ') translate(-128 -' + G.ground + ')">';
    if (G.stage >= 4) s += lionCape(G, P);
    s += lionTail(G, P, mood);
    s += bodyEgg(G, P, 'lion', o);
    s += feet(G, P, 'lion');
    hb += lionMane(G, P) + lionEars(G, P, mood);
    s += '<g transform="' + tilt + '">' + hb + '</g>';
    if (G.stage >= 2) s += lionScarf(G, P);
    if (mood === 'proud') s += proudStar(G, P);
    s += arms(G, P, 'lion', mood, 'body');
    hf += headEllipse(G, P, 'lion', o) + lionFace(G, P, o) + lionTuft(G, P);
    if (G.stage >= 3) hf += lionGoggles(G, P);
    if (mood === 'listening') hf += soundArcs(G.cx + G.headRx + 2, G.headCy - 14);
    s += '<g transform="' + tilt + '">' + hf + '</g>';
    s += arms(G, P, 'lion', mood, 'front');
    s += extras(G, P, 'lion', o);
    s += '</g>';
    return s;
  }

  // ---------------------------------------------------------------- panda
  function pandaEars(G, P, mood) {
    var s = '', r = 18 * G.hs;
    [-1, 1].forEach(function (side) {
      var ex = G.cx + side * G.headRx * 0.72, ey = G.headCy - G.headRy * 0.76;
      s += '<g transform="rotate(' + (side * earRot(mood, side)) + ' ' + f(ex) + ' ' + f(ey + r * 0.8) + ')">';
      if (mood === 'listening' && side > 0) s += listenRing(ex, ey, r, P);
      s += '<circle cx="' + f(ex) + '" cy="' + f(ey) + '" r="' + f(r) + '" fill="url(#' + P + 'patch)" stroke="' + X.pandaDark + '" stroke-width="3"/>';
      s += '<ellipse cx="' + f(ex) + '" cy="' + f(ey + 2) + '" rx="' + f(r * 0.5) + '" ry="' + f(r * 0.45) + '" fill="#45424F"/>';
      s += '<path d="' + arc(ex, ey, r * 0.78, r * 0.78, Math.PI * 1.1, Math.PI * 1.5) + '" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="2.2" stroke-linecap="round"/>';
      s += '</g>';
    });
    return s;
  }
  function pandaFace(G, P, o) {
    var s = '', cx = G.cx, hs = G.hs;
    // eye patches, tilted down and outwards
    [-1, 1].forEach(function (side) {
      var px = cx + side * (G.eyeDx + 1.5 * hs), py = G.eyeY + 3 * hs;
      var d = 'M' + f(px) + ' ' + f(py - 21 * hs) + ' C' + f(px + 15 * hs) + ' ' + f(py - 21 * hs) + ' ' + f(px + 19 * hs) + ' ' + f(py - 2 * hs) + ' ' + f(px + 15 * hs) + ' ' + f(py + 12 * hs) +
        ' C' + f(px + 11 * hs) + ' ' + f(py + 26 * hs) + ' ' + f(px - 13 * hs) + ' ' + f(py + 26 * hs) + ' ' + f(px - 16 * hs) + ' ' + f(py + 8 * hs) +
        ' C' + f(px - 18 * hs) + ' ' + f(py - 8 * hs) + ' ' + f(px - 13 * hs) + ' ' + f(py - 21 * hs) + ' ' + f(px) + ' ' + f(py - 21 * hs) + 'Z';
      s += '<path d="' + d + '" fill="url(#' + P + 'patch)" transform="rotate(' + (side * -28) + ' ' + f(px) + ' ' + f(py) + ')"/>';
    });
    var my = G.noseY + 9 * hs;
    s += '<ellipse cx="' + f(cx) + '" cy="' + f(my) + '" rx="' + f(24 * hs) + '" ry="' + f(16.5 * hs) + '" fill="#FFFEFB" stroke="#E6DFD2" stroke-width="1.4"/>';
    s += '<ellipse cx="' + f(cx) + '" cy="' + f(my + 9 * hs) + '" rx="' + f(16 * hs) + '" ry="' + f(5 * hs) + '" fill="#E9E3D7" fill-opacity=".55"/>';
    if (o.plush) s += '<path d="' + ellPath(cx, my, 26 * hs, 18 * hs) + '" fill="none" stroke="' + X.pandaLine + '" stroke-opacity=".35" stroke-width="1.5" stroke-dasharray="3 3"/>';
    s += nose(G, P) + mouth(G, o.mood, 'panda');
    s += blush(G, P, 'panda', o.mood);
    s += eyePair(G, P, 'panda', o);
    s += brows(G, o.mood, 'panda');
    return s;
  }
  function leaf(x, y, len, ang, P, wid) {
    wid = wid || 0.36;
    return '<g transform="translate(' + f(x) + ' ' + f(y) + ') rotate(' + f(ang) + ')"><path d="M0 0 C' + f(len * 0.28) + ' ' + f(-len * wid) + ' ' + f(len * 0.76) + ' ' + f(-len * wid * 0.9) + ' ' + f(len) + ' 0 C' + f(len * 0.76) + ' ' + f(len * wid * 0.8) + ' ' + f(len * 0.28) + ' ' + f(len * wid * 0.8) + ' 0 0Z" fill="url(#' + P + 'leaf)" stroke="' + X.leafDark + '" stroke-width="1.8" stroke-linejoin="round"/>' +
      '<path d="M' + f(len * 0.12) + ' 0 Q' + f(len * 0.5) + ' ' + f(-len * 0.05) + ' ' + f(len * 0.86) + ' 0" fill="none" stroke="#E6FFD2" stroke-opacity=".75" stroke-width="1.3" stroke-linecap="round"/></g>';
  }
  function sprout(G, P) {
    var st = G.stage, x = G.cx + 3, y = G.headTop + 4, s = '';
    var h = [0, 12, 19, 25, 28][st];
    if (st === 0) {
      s += '<g transform="rotate(-18 ' + f(x) + ' ' + f(y - 4) + ')"><ellipse cx="' + f(x) + '" cy="' + f(y - 4) + '" rx="7.5" ry="5.5" fill="' + X.seed + '" stroke="' + X.seedDark + '" stroke-width="2"/>' +
        '<path d="M' + f(x - 4) + ' ' + f(y - 6) + ' q3 2 6 -1" fill="none" stroke="' + X.seedDark + '" stroke-width="1.4" stroke-linecap="round"/><ellipse cx="' + f(x - 2.5) + '" cy="' + f(y - 6.5) + '" rx="2.2" ry="1.2" fill="#fff" fill-opacity=".45"/></g>';
      s += leaf(x + 3, y - 8, 9, -62, P, 0.42);
      return s;
    }
    var top = [x + 1, y - h];
    s += '<path d="M' + f(x) + ' ' + f(y) + ' Q' + f(x - 5) + ' ' + f(y - h * 0.5) + ' ' + f(top[0]) + ' ' + f(top[1]) + '" fill="none" stroke="' + X.leafDark + '" stroke-width="5.5" stroke-linecap="round"/>';
    s += '<path d="M' + f(x) + ' ' + f(y) + ' Q' + f(x - 5) + ' ' + f(y - h * 0.5) + ' ' + f(top[0]) + ' ' + f(top[1]) + '" fill="none" stroke="#7FD45A" stroke-width="3" stroke-linecap="round"/>';
    var ly = y - h * (st === 1 ? 0.95 : 0.62), ll = [0, 10, 16, 17, 18][st];
    s += leaf(x - 1, ly, ll, st === 1 ? -150 : -158, P, st === 1 ? 0.55 : 0.38);
    s += leaf(x + 1, ly - (st === 1 ? 0 : 3), ll, st === 1 ? -30 : -24, P, st === 1 ? 0.55 : 0.38);
    if (st === 3) {
      s += '<path d="M' + f(top[0]) + ' ' + f(top[1] - 12) + ' C' + f(top[0] + 8) + ' ' + f(top[1] - 6) + ' ' + f(top[0] + 6) + ' ' + f(top[1] + 2) + ' ' + f(top[0]) + ' ' + f(top[1] + 2) + ' C' + f(top[0] - 6) + ' ' + f(top[1] + 2) + ' ' + f(top[0] - 8) + ' ' + f(top[1] - 6) + ' ' + f(top[0]) + ' ' + f(top[1] - 12) + 'Z" fill="' + X.bud + '" stroke="#B9396A" stroke-width="1.8"/>';
      s += '<path d="M' + f(top[0] - 2) + ' ' + f(top[1] - 8) + ' q1 -2 2 -2" stroke="#fff" stroke-opacity=".6" stroke-width="1.4" fill="none" stroke-linecap="round"/>';
      s += leaf(top[0], top[1] + 2, 7, -125, P, 0.4) + leaf(top[0], top[1] + 2, 7, -55, P, 0.4);
    }
    if (st === 4) {
      var fx = top[0], fy = top[1] - 6;
      s += '<circle cx="' + f(fx) + '" cy="' + f(fy) + '" r="30" fill="url(#' + P + 'glow)"/>';
      for (var i = 0; i < 5; i++) {
        var a = -90 + i * 72;
        s += '<ellipse cx="' + f(fx) + '" cy="' + f(fy - 8) + '" rx="6.2" ry="9" fill="url(#' + P + 'petal)" stroke="#E0527F" stroke-width="1.6" transform="rotate(' + a + ' ' + f(fx) + ' ' + f(fy) + ')"/>';
      }
      s += '<circle cx="' + f(fx) + '" cy="' + f(fy) + '" r="5.2" fill="' + X.gold + '" stroke="' + X.goldDark + '" stroke-width="1.4"/>';
      s += '<circle cx="' + f(fx - 1.5) + '" cy="' + f(fy - 1.5) + '" r="1.4" fill="#fff" fill-opacity=".8"/>';
      s += sparkle(fx + 20, fy - 12, 5, '#FFF6B0', '#E7B72A') + sparkle(fx - 19, fy + 4, 4, '#FFF6B0', '#E7B72A');
    }
    return s;
  }
  function pandaGoggles(G, P) {
    var s = '', cx = G.cx, hs = G.hs, gy = G.headCy - G.headRy * 0.6, lr = 12 * hs, sw = G.headRx * 0.98;
    var strap = 'M' + f(cx - sw) + ' ' + f(gy + 12) + ' Q' + f(cx) + ' ' + f(gy - 10) + ' ' + f(cx + sw) + ' ' + f(gy + 12);
    s += '<path d="' + strap + '" fill="none" stroke="#2C7A66" stroke-width="9.5" stroke-linecap="round"/>';
    s += '<path d="' + strap + '" fill="none" stroke="' + PALETTE.panda.mint + '" stroke-width="6" stroke-linecap="round"/>';
    s += '<path d="' + strap + '" fill="none" stroke="#D6FFF4" stroke-width="1.1" stroke-dasharray="2.5 3"/>';
    s += '<rect x="' + f(cx - 6 * hs) + '" y="' + f(gy - 3.5 * hs) + '" width="' + f(12 * hs) + '" height="' + f(6 * hs) + '" rx="3" fill="url(#' + P + 'lav)" stroke="#4E3A92" stroke-width="2"/>';
    [-1, 1].forEach(function (side) {
      var lx = cx + side * 16 * hs;
      s += '<rect x="' + f(lx - lr) + '" y="' + f(gy - lr * 0.85) + '" width="' + f(lr * 2) + '" height="' + f(lr * 1.7) + '" rx="' + f(lr * 0.7) + '" fill="url(#' + P + 'lav)" stroke="#4E3A92" stroke-width="2.4"/>';
      s += '<rect x="' + f(lx - lr * 0.7) + '" y="' + f(gy - lr * 0.55) + '" width="' + f(lr * 1.4) + '" height="' + f(lr * 1.1) + '" rx="' + f(lr * 0.45) + '" fill="url(#' + P + 'lens)" stroke="#6A55B5" stroke-width="1.4"/>';
      s += '<path d="M' + f(lx - lr * 0.45) + ' ' + f(gy - lr * 0.2) + ' l' + f(lr * 0.35) + ' ' + f(-lr * 0.25) + '" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>';
    });
    return s;
  }
  function satchel(G, P) {
    var s = '', cx = G.cx, rx = G.bodyRx, ry = G.bodyRy, cy = G.bodyCy;
    var a = [cx - rx * 0.55, G.neckY + 10], b = [cx + rx * 0.62, cy + ry * 0.22];
    s += '<path d="M' + f(a[0]) + ' ' + f(a[1]) + ' Q' + f(cx) + ' ' + f(cy - ry * 0.05) + ' ' + f(b[0]) + ' ' + f(b[1]) + '" fill="none" stroke="#4E3A92" stroke-width="8" stroke-linecap="round"/>';
    s += '<path d="M' + f(a[0]) + ' ' + f(a[1]) + ' Q' + f(cx) + ' ' + f(cy - ry * 0.05) + ' ' + f(b[0]) + ' ' + f(b[1]) + '" fill="none" stroke="' + PALETTE.panda.lavender + '" stroke-width="5" stroke-linecap="round"/>';
    var bx = cx + rx * 0.42, by = cy + ry * 0.12, bw = 32, bh = 26;
    s += '<rect x="' + f(bx) + '" y="' + f(by) + '" width="' + bw + '" height="' + bh + '" rx="8" fill="url(#' + P + 'lav)" stroke="#4E3A92" stroke-width="2.4"/>';
    s += '<rect x="' + f(bx + 3) + '" y="' + f(by + 3) + '" width="' + (bw - 6) + '" height="' + (bh - 6) + '" rx="6" fill="none" stroke="#D9CCFF" stroke-width="1.2" stroke-dasharray="2.5 2.5"/>';
    s += '<path d="M' + f(bx) + ' ' + f(by + 8) + ' Q' + f(bx) + ' ' + f(by) + ' ' + f(bx + 8) + ' ' + f(by) + ' H' + f(bx + bw - 8) + ' Q' + f(bx + bw) + ' ' + f(by) + ' ' + f(bx + bw) + ' ' + f(by + 8) + ' V' + f(by + 13) + ' Q' + f(bx + bw / 2) + ' ' + f(by + 19) + ' ' + f(bx) + ' ' + f(by + 13) + 'Z" fill="' + PALETTE.panda.mint + '" stroke="#2C7A66" stroke-width="2.2"/>';
    s += '<circle cx="' + f(bx + bw / 2) + '" cy="' + f(by + 14) + '" r="3.4" fill="url(#' + P + 'gold)" stroke="' + X.goldDark + '" stroke-width="1.2"/>';
    s += leaf(bx + 5, by + 7, 7, -20, P, 0.45);
    return s;
  }
  function pandaFull(o, P) {
    var G = geom('panda', o.stage, o.mood), s = '', mood = o.mood;
    var tilt = 'rotate(' + G.tilt + ' ' + G.cx + ' ' + f(G.neckY + 4) + ')';
    s += '<ellipse cx="128" cy="' + G.ground + '" rx="' + f(G.bodyRx + 32) + '" ry="10" fill="url(#' + P + 'shadow)"/>';
    s += '<g transform="translate(128 ' + G.ground + ') scale(' + f(G.scale * 100) / 100 + ') translate(-128 -' + G.ground + ')">';
    s += '<circle cx="' + f(G.cx + G.bodyRx * 0.86) + '" cy="' + f(G.bodyCy + G.bodyRy * 0.55) + '" r="9" fill="url(#' + P + 'skin)" stroke="' + X.pandaLine + '" stroke-width="2.6"/>';
    s += bodyEgg(G, P, 'panda', o);
    s += feet(G, P, 'panda');
    if (G.stage >= 2) s += satchel(G, P);
    s += '<g transform="' + tilt + '">' + pandaEars(G, P, mood) + '</g>';
    if (mood === 'proud') s += proudStar(G, P);
    s += arms(G, P, 'panda', mood, 'body');
    var hf = headEllipse(G, P, 'panda', o) + pandaFace(G, P, o);
    if (G.stage >= 3) hf += pandaGoggles(G, P);
    hf += sprout(G, P);
    if (mood === 'listening') hf += soundArcs(G.cx + G.headRx + 2, G.headCy - 14);
    s += '<g transform="' + tilt + '">' + hf + '</g>';
    s += arms(G, P, 'panda', mood, 'front');
    s += extras(G, P, 'panda', o);
    s += '</g>';
    return s;
  }
  function petFull(pet, o, P) { return pet === 'lion' ? lionFull(o, P) : pandaFull(o, P); }

  // Head and face only, used on screens (robot)
  function faceOnly(pet, o, P) {
    var G = geom(pet, o.stage, o.mood), s = '';
    s += headEllipse(G, P, pet, { plush: false, faceOnly: true });
    s += pet === 'lion' ? lionFace(G, P, o) : pandaFace(G, P, o);
    return { svg: s, G: G };
  }

  // ---------------------------------------------------------------- product bodies
  function bodyScreen(pet, o, P) {
    var s = '', acc = pet === 'lion' ? PALETTE.lion.truckBlue : PALETTE.panda.lavender;
    s += '<ellipse cx="128" cy="238" rx="78" ry="8" fill="url(#' + P + 'shadow)"/>';
    // stand
    s += '<path d="M104 196 L94 234 H162 L152 196Z" fill="#B9BFCC" stroke="' + X.plasticLine + '" stroke-width="2.4" stroke-linejoin="round"/>';
    s += '<rect x="84" y="228" width="88" height="9" rx="4.5" fill="#D5DAE4" stroke="' + X.plasticLine + '" stroke-width="2.4"/>';
    // tablet
    s += '<rect x="16" y="34" width="224" height="166" rx="20" fill="#262A36" stroke="#11131A" stroke-width="2.4"/>';
    s += '<rect x="19" y="37" width="218" height="160" rx="17" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>';
    s += '<circle cx="128" cy="42" r="2.4" fill="#4A5068"/><circle cx="128" cy="42" r="1" fill="#8FA4D8"/>';
    var cid = P + 'scr';
    s += '<clipPath id="' + cid + '"><rect x="27" y="48" width="202" height="142" rx="9"/></clipPath>';
    s += '<g clip-path="url(#' + cid + ')">';
    s += '<rect x="27" y="48" width="202" height="142" fill="' + (pet === 'lion' ? '#FFF1DB' : '#EEE9FF') + '"/>';
    s += '<rect x="27" y="152" width="202" height="38" fill="' + (pet === 'lion' ? '#F7D9AE' : '#DCD3F7') + '"/>';
    s += '<circle cx="128" cy="118" r="70" fill="#fff" fill-opacity=".55"/>';
    // a window and a little shelf in the room behind the pet
    s += '<rect x="40" y="62" width="34" height="30" rx="4" fill="#CDEBFF" stroke="' + acc + '" stroke-width="2"/><path d="M57 62 V92 M40 77 H74" stroke="' + acc + '" stroke-width="1.6"/>';
    s += '<rect x="186" y="84" width="30" height="4" rx="2" fill="#B07A4A"/><circle cx="194" cy="79" r="5" fill="' + (pet === 'lion' ? '#2F7DE1' : '#4CC3A5') + '"/><rect x="202" y="72" width="8" height="12" rx="2" fill="#FF8FB1"/>';
    s += '<g transform="translate(128 186) scale(.56) translate(-128 -238)">' + petFull(pet, o, P) + '</g>';
    s += '<path d="M27 48 L118 48 L58 190 L27 190Z" fill="#fff" fill-opacity=".07"/>';
    s += '</g>';
    s += '<rect x="108" y="184" width="40" height="3.5" rx="1.75" fill="#1E2233" fill-opacity=".35"/>';
    return s;
  }

  function bodyRobot(pet, o, P) {
    var s = '', lion = pet === 'lion', mood = o.mood;
    var acc = lion ? PALETTE.lion.safetyOrange : PALETTE.panda.lavender, acc2 = lion ? PALETTE.lion.truckBlue : PALETTE.panda.mint;
    s += '<ellipse cx="128" cy="238" rx="84" ry="9" fill="url(#' + P + 'shadow)"/>';
    // treads
    [58, 164].forEach(function (x) {
      s += '<rect x="' + x + '" y="184" width="34" height="46" rx="15" fill="#2E3240" stroke="#151821" stroke-width="2.4"/>';
      for (var i = 0; i < 6; i++) s += '<rect x="' + (x + 4) + '" y="' + (189 + i * 7) + '" width="26" height="3" rx="1.5" fill="#4A5064"/>';
      s += '<circle cx="' + (x + 17) + '" cy="207" r="8" fill="#5B6278" stroke="#151821" stroke-width="2"/><circle cx="' + (x + 17) + '" cy="207" r="3" fill="' + acc + '"/>';
    });
    // chassis
    s += '<rect x="74" y="156" width="108" height="72" rx="32" fill="url(#' + P + 'plastic)" stroke="' + X.plasticLine + '" stroke-width="2.8"/>';
    s += '<path d="M76 196 H180" stroke="' + acc + '" stroke-width="8"/><path d="M76 202 H180" stroke="' + acc2 + '" stroke-width="3"/>';
    for (var r = 0; r < 3; r++) for (var c = 0; c < 7; c++) s += '<circle cx="' + (104 + c * 8) + '" cy="' + (170 + r * 7) + '" r="1.8" fill="#8D95A8"/>';
    s += '<path d="M86 166 Q92 160 100 160" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" stroke-opacity=".8"/>';
    // arms
    var up = mood === 'excited' ? -40 : mood === 'wobbly' ? 25 : mood === 'talking' ? -20 : 0;
    s += '<g transform="rotate(' + (-up) + ' 78 178)"><rect x="54" y="170" width="28" height="15" rx="7.5" fill="url(#' + P + 'plastic)" stroke="' + X.plasticLine + '" stroke-width="2.4"/><circle cx="58" cy="177.5" r="6" fill="' + acc + '" stroke="' + X.plasticLine + '" stroke-width="2"/></g>';
    s += '<g transform="rotate(' + up + ' 178 178)"><rect x="174" y="170" width="28" height="15" rx="7.5" fill="url(#' + P + 'plastic)" stroke="' + X.plasticLine + '" stroke-width="2.4"/><circle cx="198" cy="177.5" r="6" fill="' + acc + '" stroke="' + X.plasticLine + '" stroke-width="2"/></g>';
    // neck
    s += '<rect x="114" y="146" width="28" height="16" rx="5" fill="#C6CDDC" stroke="' + X.plasticLine + '" stroke-width="2.4"/>';
    // head housing with the pet's ears (and a mane trim for the lion)
    var hx = 128, hy = 96, R = 64;
    if (lion) {
      s += '<path d="' + scallop(hx, hy, R + 3, R + 3, -Math.PI / 2, Math.PI * 1.5, 16, function () { return 8; }) + 'Z" fill="url(#' + P + 'mane)" stroke="' + X.lionLine + '" stroke-width="2.6" stroke-linejoin="round"/>';
    }
    [-1, 1].forEach(function (side) {
      var ex = hx + side * 46, ey = hy - 50, er = 16;
      if (mood === 'listening' && side > 0) s += listenRing(ex, ey, er, P);
      s += '<circle cx="' + ex + '" cy="' + ey + '" r="' + er + '" fill="' + (lion ? 'url(#' + P + 'skin)' : 'url(#' + P + 'patch)') + '" stroke="' + (lion ? X.lionLine : X.pandaDark) + '" stroke-width="2.8"/>';
      s += '<circle cx="' + ex + '" cy="' + (ey + 2) + '" r="' + (er * 0.52) + '" fill="' + (lion ? PALETTE.lion.innerEar : '#45424F') + '"/>';
    });
    s += '<circle cx="' + hx + '" cy="' + hy + '" r="' + R + '" fill="url(#' + P + 'plastic)" stroke="' + X.plasticLine + '" stroke-width="2.8"/>';
    s += '<circle cx="' + hx + '" cy="' + hy + '" r="' + (R - 9) + '" fill="#0E121D" stroke="#2A3046" stroke-width="2"/>';
    var cid = P + 'rs', sr = R - 12;
    s += '<clipPath id="' + cid + '"><circle cx="' + hx + '" cy="' + hy + '" r="' + sr + '"/></clipPath>';
    var F = faceOnly(pet, o, P), k = sr / (F.G.headRx * 0.8);
    s += '<g clip-path="url(#' + cid + ')"><rect x="' + (hx - sr) + '" y="' + (hy - sr) + '" width="' + sr * 2 + '" height="' + sr * 2 + '" fill="' + (lion ? '#F4A940' : '#F7F4EE') + '"/>';
    s += '<g transform="translate(' + hx + ' ' + (hy + 4) + ') scale(' + f(k * 100) / 100 + ') translate(-128 -' + f(F.G.headCy + 6) + ')">' + F.svg + '</g>';
    s += '<rect x="' + (hx - sr) + '" y="' + (hy - sr) + '" width="' + sr * 2 + '" height="' + sr * 2 + '" fill="url(#' + P + 'pix)"/>';
    s += '<path d="' + arc(hx, hy, sr - 6, sr - 6, Math.PI * 1.08, Math.PI * 1.42) + '" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linecap="round"/>';
    s += '</g>';
    // antenna with status light
    var on = mood === 'listening' ? X.listen : mood === 'sleepy' ? '#5A6078' : acc;
    s += '<path d="M' + hx + ' ' + (hy - R) + ' V' + (hy - R - 14) + '" stroke="' + X.plasticLine + '" stroke-width="3.2" stroke-linecap="round"/>';
    if (mood === 'listening') s += '<circle cx="' + hx + '" cy="' + (hy - R - 19) + '" r="11" fill="url(#' + P + 'listen)"/>';
    s += '<circle cx="' + hx + '" cy="' + (hy - R - 19) + '" r="6" fill="' + on + '" stroke="' + X.plasticLine + '" stroke-width="2"/><circle cx="' + (hx - 2) + '" cy="' + (hy - R - 21) + '" r="1.8" fill="#fff" fill-opacity=".8"/>';
    s += robotExtras(o, P, hx, hy, R, pet);
    return s;
  }
  function robotExtras(o, P, hx, hy, R, pet) {
    var G = { cx: hx, headRx: R * 0.95, headRy: R, headTop: hy - R, headCy: hy, hs: 1, eyeDx: 25, noseY: hy + 20, bodyRx: 54, bodyCy: 190, bodyRy: 36 };
    return extras(G, P, pet, o);
  }

  function ledFace(o, P, cx, cy, sc, pet) {
    // eyes and mouth drawn with an LED dot pattern
    var s = '', state = o.blink ? 'closed' : EYES[o.mood], look = LOOK[o.mood] || [0, 0];
    var glow = pet === 'lion' ? '#FFB54D' : '#B9A3FF';
    [-1, 1].forEach(function (side) {
      var x = cx + side * 24 * sc + look[0] * 3 * sc, y = cy - 5 * sc + look[1] * 2 * sc, rx = 11 * sc, ry = 13 * sc;
      var shape;
      if (state === 'happy') shape = '<path d="M' + f(x - rx) + ' ' + f(y + 3 * sc) + ' Q' + f(x) + ' ' + f(y - 11 * sc) + ' ' + f(x + rx) + ' ' + f(y + 3 * sc) + '" fill="none" stroke="url(#' + P + 'dots)" stroke-width="' + f(5.5 * sc) + '" stroke-linecap="round"/>';
      else if (state === 'closed') shape = '<path d="M' + f(x - rx) + ' ' + f(y) + ' Q' + f(x) + ' ' + f(y + 9 * sc) + ' ' + f(x + rx) + ' ' + f(y) + '" fill="none" stroke="url(#' + P + 'dots)" stroke-width="' + f(5.5 * sc) + '" stroke-linecap="round"/>';
      else if (state === 'sleepy') shape = '<path d="M' + f(x - rx) + ' ' + f(y + 1 * sc) + ' Q' + f(x) + ' ' + f(y + 2 * sc) + ' ' + f(x + rx) + ' ' + f(y + 1 * sc) + ' Q' + f(x) + ' ' + f(y + 12 * sc) + ' ' + f(x - rx) + ' ' + f(y + 1 * sc) + 'Z" fill="url(#' + P + 'dots)"/>';
      else {
        var k = state === 'wide' ? 1.15 : 1;
        shape = '<ellipse cx="' + f(x) + '" cy="' + f(y) + '" rx="' + f(rx * k) + '" ry="' + f(ry * k) + '" fill="url(#' + P + 'dots)"/>' +
          '<circle cx="' + f(x - rx * 0.35) + '" cy="' + f(y - ry * 0.35) + '" r="' + f(2.6 * sc) + '" fill="#fff"/>';
      }
      s += '<g opacity=".5" filter="url(#' + P + 'soft)">' + shape.replace(/url\(#[^)]*dots\)/g, glow) + '</g>' + shape;
    });
    var ms = mouthShapes(o.mood, cx, cy + 12 * sc, sc * 1.05);
    ms.forEach(function (m) {
      if (m.kind === 'tongue') return;
      if (m.kind === 'inside') s += '<path d="' + m.d + '" fill="url(#' + P + 'dots)"/>';
      else s += '<path d="' + m.d + '" fill="none" stroke="url(#' + P + 'dots)" stroke-width="' + f(4.5 * sc) + '" stroke-linecap="round"/>';
    });
    return s;
  }

  function bodySpeaker(pet, o, P) {
    var s = '', lion = pet === 'lion', mood = o.mood;
    var top = 120, bot = 202, rx = 88, ry = 25;
    s += '<ellipse cx="128" cy="' + (bot + 10) + '" rx="' + (rx + 6) + '" ry="12" fill="url(#' + P + 'shadow)"/>';
    if (lion) s += '<path d="' + scallop(128, top + 4, rx - 2, ry + 6, Math.PI, Math.PI * 2, 12, function () { return 9; }) + ' L128 ' + (top + 4) + 'Z" fill="url(#' + P + 'mane)" stroke="' + X.lionLine + '" stroke-width="2.6" stroke-linejoin="round"/>';
    // ears behind the top rim
    [-1, 1].forEach(function (side) {
      var ex = 128 + side * 54, ey = top - 18, er = 22;
      if (mood === 'listening' && side > 0) s += listenRing(ex, ey, er, P);
      s += '<g transform="rotate(' + (side * earRot(mood, side) * 0.6) + ' ' + ex + ' ' + (ey + 18) + ')"><circle cx="' + ex + '" cy="' + ey + '" r="' + er + '" fill="' + (lion ? 'url(#' + P + 'skin)' : 'url(#' + P + 'patch)') + '" stroke="' + (lion ? X.lionLine : X.pandaDark) + '" stroke-width="3"/>' +
        '<circle cx="' + ex + '" cy="' + (ey + 2) + '" r="' + (er * 0.55) + '" fill="' + (lion ? PALETTE.lion.innerEar : '#45424F') + '"/>' +
        '<rect x="' + (ex - er * 0.55) + '" y="' + (ey + er * 0.55) + '" width="' + (er * 1.1) + '" height="10" rx="3" fill="#8A90A3" stroke="' + X.plasticLine + '" stroke-width="2"/></g>';
    });
    // cylinder body
    var side = 'M' + (128 - rx) + ' ' + top + ' V' + bot + ' A' + rx + ' ' + ry + ' 0 0 0 ' + (128 + rx) + ' ' + bot + ' V' + top + 'Z';
    s += '<path d="' + side + '" fill="url(#' + P + 'cylinder)" stroke="' + (lion ? X.lionLine : X.pandaLine) + '" stroke-width="2.8"/>';
    s += '<path d="' + side + '" fill="url(#' + P + 'mesh)"/>';
    if (!lion) {
      // panda: charcoal band around the bottom like its legs
      s += '<path d="M' + (128 - rx) + ' ' + (bot - 16) + ' A' + rx + ' ' + ry + ' 0 0 0 ' + (128 + rx) + ' ' + (bot - 16) + ' V' + bot + ' A' + rx + ' ' + ry + ' 0 0 1 ' + (128 - rx) + ' ' + bot + 'Z" fill="url(#' + P + 'patch)"/>';
    }
    s += '<path d="M' + (128 - rx) + ' ' + bot + ' A' + rx + ' ' + ry + ' 0 0 0 ' + (128 + rx) + ' ' + bot + '" fill="none" stroke="' + (lion ? X.lionLine : X.pandaLine) + '" stroke-width="2.8"/>';
    // top
    s += '<ellipse cx="128" cy="' + top + '" rx="' + rx + '" ry="' + ry + '" fill="' + (lion ? '#FFD08A' : '#FFFFFF') + '" stroke="' + (lion ? X.lionLine : X.pandaLine) + '" stroke-width="2.8"/>';
    s += '<ellipse cx="128" cy="' + top + '" rx="' + (rx - 14) + '" ry="' + (ry - 7) + '" fill="#2A2E3C" stroke="#151821" stroke-width="1.6"/>';
    var ring = mood === 'listening' ? X.listen : mood === 'sleepy' ? '#4A5068' : (lion ? '#FFB54D' : '#B9A3FF');
    s += '<ellipse cx="128" cy="' + top + '" rx="' + (rx - 20) + '" ry="' + (ry - 11) + '" fill="none" stroke="' + ring + '" stroke-width="6" opacity=".6" filter="url(#' + P + 'blur)"/>';
    s += '<ellipse cx="128" cy="' + top + '" rx="' + (rx - 20) + '" ry="' + (ry - 11) + '" fill="none" stroke="' + ring + '" stroke-width="3.4" stroke-dasharray="7 4.5"/>';
    s += '<circle cx="128" cy="' + top + '" r="6" fill="#3A3F52" stroke="#151821" stroke-width="1.4"/>';
    // face panel
    s += '<rect x="70" y="138" width="116" height="52" rx="26" fill="#121622" stroke="#06080D" stroke-width="2.4"/>';
    s += '<path d="M84 145 Q104 141 124 142" stroke="#fff" stroke-opacity=".25" stroke-width="3" stroke-linecap="round" fill="none"/>';
    s += ledFace(o, P, 128, 163, 0.92, pet);
    var G = { cx: 128, headRx: rx, headRy: 60, headTop: top - 30, headCy: 150, hs: 1, eyeDx: 22, noseY: 168, bodyRx: rx, bodyCy: 165, bodyRy: 40 };
    s += extras(G, P, pet, o);
    return s;
  }

  function displayEye(x, y, r, pet, state, look, P, side) {
    var s = '', glow = pet === 'lion' ? '#FFB54D' : '#B9A3FF';
    s += '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r) + '" fill="#2A2D38" stroke="' + (pet === 'lion' ? X.lionLine : X.pandaDark) + '" stroke-width="2.6"/>';
    s += '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r * 0.84) + '" fill="url(#' + P + 'glass)"/>';
    var cid = P + 'de' + side;
    s += '<clipPath id="' + cid + '"><circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r * 0.84) + '"/></clipPath><g clip-path="url(#' + cid + ')">';
    if (state === 'closed' || state === 'happy') {
      var d = state === 'happy' ? 'M' + f(x - r * 0.45) + ' ' + f(y + r * 0.12) + ' Q' + f(x) + ' ' + f(y - r * 0.55) + ' ' + f(x + r * 0.45) + ' ' + f(y + r * 0.12)
        : 'M' + f(x - r * 0.45) + ' ' + f(y - r * 0.05) + ' Q' + f(x) + ' ' + f(y + r * 0.42) + ' ' + f(x + r * 0.45) + ' ' + f(y - r * 0.05);
      s += '<path d="' + d + '" fill="none" stroke="' + glow + '" stroke-width="' + f(r * 0.3) + '" stroke-linecap="round" opacity=".6" filter="url(#' + P + 'blur)"/>';
      s += '<path d="' + d + '" fill="none" stroke="' + glow + '" stroke-width="' + f(r * 0.16) + '" stroke-linecap="round"/>';
    } else {
      var ir = r * 0.5 * (state === 'wide' ? 1.12 : 1), lx = look[0] * r * 0.16, ly = look[1] * r * 0.14;
      s += '<circle cx="' + f(x + lx) + '" cy="' + f(y + ly) + '" r="' + f(ir * 1.25) + '" fill="' + glow + '" opacity=".35" filter="url(#' + P + 'blur)"/>';
      s += '<circle cx="' + f(x + lx) + '" cy="' + f(y + ly) + '" r="' + f(ir) + '" fill="url(#' + P + 'deye)"/>';
      s += '<circle cx="' + f(x + lx) + '" cy="' + f(y + ly + ir * 0.08) + '" r="' + f(ir * 0.45) + '" fill="#140C08" fill-opacity=".85"/>';
      s += '<circle cx="' + f(x + lx - ir * 0.36) + '" cy="' + f(y + ly - ir * 0.38) + '" r="' + f(ir * 0.26) + '" fill="#fff"/>';
      s += '<circle cx="' + f(x + lx + ir * 0.32) + '" cy="' + f(y + ly + ir * 0.34) + '" r="' + f(ir * 0.12) + '" fill="#fff" fill-opacity=".9"/>';
      if (state === 'sleepy') s += '<path d="M' + f(x - r) + ' ' + f(y + r * 0.08) + ' Q' + f(x) + ' ' + f(y + r * 0.3) + ' ' + f(x + r) + ' ' + f(y + r * 0.08) + ' V' + f(y - r) + ' H' + f(x - r) + 'Z" fill="#141826"/>' +
        '<path d="M' + f(x - r * 0.8) + ' ' + f(y + r * 0.1) + ' Q' + f(x) + ' ' + f(y + r * 0.3) + ' ' + f(x + r * 0.8) + ' ' + f(y + r * 0.1) + '" fill="none" stroke="' + glow + '" stroke-width="2" stroke-linecap="round"/>';
      if (state === 'wide') s += sparkle(x + lx + ir * 0.2, y + ly - ir * 0.05, ir * 0.22, '#fff', '#fff');
      if (state === 'soft') s += '<path d="M' + f(x - r * 0.5) + ' ' + f(y + r * 0.55) + ' Q' + f(x) + ' ' + f(y + r * 0.75) + ' ' + f(x + r * 0.5) + ' ' + f(y + r * 0.55) + '" fill="none" stroke="#CFEFFF" stroke-width="2.4" stroke-linecap="round"/>';
    }
    s += '</g>';
    s += '<path d="' + arc(x, y, r * 0.7, r * 0.7, Math.PI * 1.1, Math.PI * 1.45) + '" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2.6" stroke-linecap="round"/>';
    return s;
  }

  // The Kindling Core, drawn centred on (128, 146) in a 256 box.
  function coreDevice(pet, o, P, opts) {
    opts = opts || {};
    var s = '', lion = pet === 'lion', mood = o.mood, line = lion ? X.lionLine : X.pandaLine;
    var acc = lion ? PALETTE.lion.safetyOrange : PALETTE.panda.lavender;
    var pebble = 'M128 64 C194 64 226 116 222 158 C218 204 180 230 128 230 C76 230 38 204 34 158 C30 116 62 64 128 64Z';
    if (!opts.noShadow) s += '<ellipse cx="128" cy="236" rx="92" ry="9" fill="url(#' + P + 'shadow)"/>';
    if (lion && !opts.noClips) s += '<path d="' + scallop(128, 142, 98, 86, Math.PI * 0.94, Math.PI * 2.06, 13, function () { return 11; }) + ' L128 142Z" fill="url(#' + P + 'mane)" stroke="' + X.lionLine + '" stroke-width="2.6" stroke-linejoin="round"/>';
    if (!opts.noClips) {
      [-1, 1].forEach(function (side) {
        var ex = 128 + side * 62, ey = 74, er = 21;
        if (mood === 'listening' && side > 0) s += listenRing(ex, ey, er, P);
        s += '<g transform="rotate(' + (side * earRot(mood, side) * 0.7) + ' ' + ex + ' ' + (ey + 16) + ')">' +
          '<rect x="' + (ex - 10) + '" y="' + (ey + 10) + '" width="20" height="14" rx="4" fill="#9AA1B3" stroke="' + X.plasticLine + '" stroke-width="2"/>' +
          '<circle cx="' + ex + '" cy="' + ey + '" r="' + er + '" fill="' + (lion ? 'url(#' + P + 'skin)' : 'url(#' + P + 'patch)') + '" stroke="' + (lion ? X.lionLine : X.pandaDark) + '" stroke-width="3"/>' +
          '<circle cx="' + ex + '" cy="' + (ey + 2) + '" r="' + (er * 0.55) + '" fill="' + (lion ? PALETTE.lion.innerEar : '#45424F') + '"/></g>';
      });
    }
    s += '<path d="' + pebble + '" fill="url(#' + P + 'shell)" stroke="' + line + '" stroke-width="3"/>';
    // magnetic base band
    var bc = P + 'pb';
    s += '<clipPath id="' + bc + '"><path d="' + pebble + '"/></clipPath><g clip-path="url(#' + bc + ')">';
    s += '<rect x="20" y="218" width="216" height="30" fill="' + (lion ? '#8C4A1C' : '#B9B1A2') + '"/>';
    s += '<path d="M20 218 H236" stroke="' + line + '" stroke-opacity=".6" stroke-width="2"/>';
    if (!lion) {
      // printed eye patches
      [-1, 1].forEach(function (side) {
        s += '<ellipse cx="' + (128 + side * 38) + '" cy="142" rx="34" ry="40" fill="url(#' + P + 'patch)" transform="rotate(' + (side * -26) + ' ' + (128 + side * 38) + ' 142)"/>';
      });
    }
    s += '<path d="' + arc(128, 150, 84, 76, Math.PI * 1.08, Math.PI * 1.4) + '" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="5" stroke-linecap="round"/>';
    s += '</g>';
    // speaker grille on the belly: a recessed oval with neat rows of holes
    s += '<ellipse cx="128" cy="206" rx="32" ry="9" fill="' + (lion ? '#C46E22' : '#DCD5C8') + '" stroke="' + line + '" stroke-opacity=".35" stroke-width="1.2"/>';
    for (var r = 0; r < 3; r++) for (var c = -4; c <= 4; c++) {
      var gx = 128 + c * 6 + (r === 1 ? 3 : 0), gy = 201.5 + r * 4.5;
      if (Math.pow((gx - 128) / 29, 2) + Math.pow((gy - 206) / 7.5, 2) <= 1) s += '<circle cx="' + f(gx) + '" cy="' + f(gy) + '" r="1.35" fill="' + (lion ? '#5E2410' : '#55525F') + '"/>';
    }
    // talk button
    s += '<ellipse cx="128" cy="68" rx="24" ry="8.5" fill="#3A3F52"/>';
    s += '<path d="M106 58 V64 A22 7.5 0 0 0 150 64 V58Z" fill="' + (lion ? '#C9520A' : '#5A44A0') + '"/>';
    s += '<ellipse cx="128" cy="58" rx="22" ry="7.5" fill="' + acc + '" stroke="' + X.plasticLine + '" stroke-width="2"/>';
    s += '<path d="M120 55.5 h16 a3 3 0 0 1 3 3 v1 a3 3 0 0 1 -3 3 h-9 l-4 3 v-3 h-3 a3 3 0 0 1 -3 -3 v-1 a3 3 0 0 1 3 -3Z" fill="#fff" fill-opacity=".85"/>';
    s += '<path d="M112 55 Q120 51 132 51.5" stroke="#fff" stroke-opacity=".6" stroke-width="2" fill="none" stroke-linecap="round"/>';
    // eye displays
    var state = o.blink ? 'closed' : EYES[mood], look = LOOK[mood] || [0, 0];
    s += displayEye(90, 140, 27, pet, state, look, P, 'l') + displayEye(166, 140, 27, pet, state, look, P, 'r');
    // nose, blush and a gentle printed smile
    s += '<path d="M120 167 C120 162 136 162 136 167 C136 171 131 175 128 175.5 C125 175 120 171 120 167Z" fill="url(#' + P + 'nose)"/>';
    s += '<ellipse cx="125.5" cy="165" rx="2.6" ry="1.4" fill="#fff" fill-opacity=".55"/>';
    s += '<path d="M118 179 Q123 184 128 180 Q133 184 138 179" fill="none" stroke="' + line + '" stroke-width="2.4" stroke-linecap="round"/>';
    s += '<ellipse cx="62" cy="176" rx="12" ry="6.5" fill="url(#' + P + 'blush)"/><ellipse cx="194" cy="176" rx="12" ry="6.5" fill="url(#' + P + 'blush)"/>';
    // status light (blue while listening, warm while talking)
    var lit = mood === 'listening' ? X.listen : mood === 'talking' ? acc : null;
    if (lit) s += '<rect x="106" y="186" width="44" height="10" rx="5" fill="' + lit + '" opacity=".6" filter="url(#' + P + 'blur)"/>';
    s += '<rect x="113" y="188" width="30" height="5.5" rx="2.75" fill="' + (lit || (lion ? '#C57B35' : '#D3CEC4')) + '" stroke="' + line + '" stroke-opacity=".5" stroke-width="1"/>';
    // mute switch on the side, USB-C on the base
    s += '<g transform="rotate(-14 218 150)"><rect x="213" y="138" width="10" height="26" rx="4" fill="#3A3F52" stroke="#151821" stroke-width="1.4"/><rect x="214.5" y="' + (o.muted ? 151 : 140) + '" width="7" height="11" rx="2.5" fill="#D5DAE4"/>' +
      (o.muted ? '<circle cx="218" cy="132" r="3.4" fill="#F0453A" stroke="#7A1410" stroke-width="1"/>' : '<circle cx="218" cy="132" r="2.6" fill="#59606F"/>') + '</g>';
    s += '<rect x="170" y="221" width="14" height="5" rx="2.5" fill="#20232D" stroke="#0E1016" stroke-width="1"/>';
    [113, 123, 133, 143].forEach(function (x) { s += '<circle cx="' + x + '" cy="225" r="1.7" fill="#E2B33A" stroke="#8C6A12" stroke-width=".8"/>'; });
    return s;
  }
  function bodyCore(pet, o, P) {
    var s = coreDevice(pet, o, P);
    var G = { cx: 128, headRx: 92, headRy: 80, headTop: 66, headCy: 140, hs: 1, eyeDx: 38, noseY: 172, bodyRx: 92, bodyCy: 170, bodyRy: 50 };
    return s + extras(G, P, pet, o);
  }

  // ---------------------------------------------------------------- public svg()
  function normalise(opts) {
    opts = opts || {};
    return {
      stage: clampStage(opts.stage), mood: MOODS.indexOf(opts.mood) >= 0 ? opts.mood : 'happy',
      size: opts.size || 256, body: BODIES.indexOf(opts.body) >= 0 ? opts.body : 'none',
      blink: !!opts.blink, muted: !!opts.muted, plush: false
    };
  }
  // A per-load token keeps ids unique even if this script is loaded twice on one page.
  var RUN = Math.floor(Math.random() * 46656).toString(36);
  function prefix(opts) { return String((opts && opts.idPrefix) || 'pa').replace(/[^A-Za-z0-9_-]/g, '') + RUN + '-' + (++uid) + '-'; }
  function svg(petId, opts) {
    var pet = petId === 'panda' ? 'panda' : 'lion', o = normalise(opts), P = prefix(opts), inner;
    switch (o.body) {
      case 'screen': inner = bodyScreen(pet, o, P); break;
      case 'robot': inner = bodyRobot(pet, o, P); break;
      case 'speaker': inner = bodySpeaker(pet, o, P); break;
      case 'core': inner = bodyCore(pet, o, P); break;
      case 'plush': o.plush = true; inner = petFull(pet, o, P); break;
      default: inner = petFull(pet, o, P);
    }
    var label = NAMES[pet] + ', ' + STAGE_NAMES[pet][o.stage].toLowerCase() + ', ' + o.mood + (o.body !== 'none' ? ', ' + o.body + ' body' : '');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="' + o.size + '" height="' + o.size + '" role="img" aria-label="' + label + '">' + defs(pet, P) + inner + '</svg>';
  }
  function svgDataURL(petId, opts) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(petId, opts)); }

  // ---------------------------------------------------------------- bodies the kids build
  function buildBody(kind, petId, opts) {
    var pet = petId === 'panda' ? 'panda' : 'lion', lion = pet === 'lion', o = normalise(opts), P = prefix(opts), s = '';
    var acc = lion ? PALETTE.lion.safetyOrange : PALETTE.panda.lavender, acc2 = lion ? PALETTE.lion.truckBlue : PALETTE.panda.mint;
    var line = lion ? X.lionLine : X.pandaLine;
    function core(x, y, k, noClips) { return '<g transform="translate(' + x + ' ' + y + ') scale(' + k + ') translate(-128 -146)">' + coreDevice(pet, o, P, { noShadow: true, noClips: !!noClips }) + '</g>'; }
    s += '<ellipse cx="128" cy="240" rx="92" ry="9" fill="url(#' + P + 'shadow)"/>';
    if (kind === 'rover') {
      s += '<rect x="44" y="176" width="168" height="44" rx="10" fill="' + acc2 + '" stroke="#16326A" stroke-width="2.6"/>';
      s += '<rect x="44" y="176" width="168" height="10" rx="5" fill="#fff" fill-opacity=".25"/>';
      for (var i = 0; i < 8; i++) {
        var sx = 56 + i * 20;
        s += '<rect x="' + (sx - 6) + '" y="166" width="12" height="10" fill="' + acc2 + '" stroke="#16326A" stroke-width="2"/><ellipse cx="' + sx + '" cy="166" rx="6" ry="2.6" fill="#7FB2F2" stroke="#16326A" stroke-width="1.6"/>';
      }
      [70, 186].forEach(function (x) {
        s += '<circle cx="' + x + '" cy="222" r="20" fill="#2E3240" stroke="#151821" stroke-width="2.6"/><circle cx="' + x + '" cy="222" r="9" fill="#D5DAE4" stroke="#151821" stroke-width="2"/><circle cx="' + x + '" cy="222" r="3" fill="' + acc + '"/>';
      });
      s += '<rect x="196" y="188" width="14" height="8" rx="3" fill="#FFE27A" stroke="#8C6A12" stroke-width="1.4"/>';
      s += core(128, 106, 0.62);
    } else if (kind === 'dock') {
      s += '<ellipse cx="128" cy="214" rx="86" ry="22" fill="#2B2F3D"/>';
      s += '<path d="M42 196 V214 A86 22 0 0 0 214 214 V196Z" fill="#3A3F52" stroke="#151821" stroke-width="2.4"/>';
      s += '<ellipse cx="128" cy="196" rx="86" ry="22" fill="#4A5064" stroke="#151821" stroke-width="2.4"/>';
      s += '<ellipse cx="128" cy="207" rx="80" ry="18" fill="none" stroke="#FFD58A" stroke-width="8" opacity=".55" filter="url(#' + P + 'blur)"/>';
      s += '<path d="M48 208 A80 18 0 0 0 208 208" fill="none" stroke="#FFE2A8" stroke-width="3.6"/>';
      s += '<path d="M190 70 a16 16 0 1 0 14 22 a12 12 0 1 1 -14 -22Z" fill="#FFE2A8" stroke="#C9A04A" stroke-width="1.6"/>';
      s += sparkle(214, 58, 5, '#FFF6CF', '#C9A04A') + sparkle(176, 50, 3.5, '#FFF6CF', '#C9A04A');
      o.mood = o.mood === 'happy' ? 'sleepy' : o.mood;
      s += core(128, 128, 0.62);
    } else if (kind === 'cardboard') {
      s += '<path d="M64 132 L192 132 L198 230 L58 230Z" fill="#C89B6A" stroke="#7A5530" stroke-width="2.6" stroke-linejoin="round"/>';
      s += '<path d="M64 132 L48 118 L92 116 L102 132Z M192 132 L208 118 L164 116 L154 132Z" fill="#D9AE7C" stroke="#7A5530" stroke-width="2.2" stroke-linejoin="round"/>';
      s += '<rect x="112" y="150" width="34" height="9" rx="2" fill="#E9E2CF" fill-opacity=".85" transform="rotate(-6 129 154)"/>';
      s += '<path d="M78 164 l8 -6 l8 6 M180 160 l-6 8" stroke="#7A5530" stroke-width="1.4" stroke-linecap="round" fill="none"/>';
      // crayon drawings
      if (lion) s += '<g stroke="#2F7DE1" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M82 196 h30 v-10 h-12 l-6 -8 h-12 Z"/><circle cx="88" cy="200" r="5"/><circle cx="108" cy="200" r="5"/></g>';
      else s += '<g stroke="#E0527F" stroke-width="3" fill="none" stroke-linecap="round"><circle cx="96" cy="188" r="5"/><path d="M96 178 v-4 M96 198 v14 M86 188 h-4 M106 188 h4 M96 204 q-8 -4 -12 2"/></g>';
      s += '<path d="' + star(166, 192, 10, 4.5) + '" fill="none" stroke="#FFB000" stroke-width="3" stroke-linejoin="round"/>';
      s += '<path d="' + heartPath(150, 214, 6) + '" fill="none" stroke="#E0527F" stroke-width="2.6"/>';
      [[86, 146], [104, 146]].forEach(function (b) { s += '<circle cx="' + b[0] + '" cy="' + b[1] + '" r="6" fill="' + acc + '" stroke="#5A3A1A" stroke-width="1.6"/><circle cx="' + (b[0] - 1.5) + '" cy="' + (b[1] - 1.5) + '" r="1.6" fill="#fff" fill-opacity=".7"/>'; });
      s += '<path d="M60 170 Q36 160 30 136" stroke="#E7C6A0" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M196 170 Q220 160 226 136" stroke="#E7C6A0" stroke-width="7" fill="none" stroke-linecap="round"/>';
      s += '<path d="M60 170 Q36 160 30 136 M196 170 Q220 160 226 136" stroke="#9C7A54" stroke-width="1.4" fill="none" stroke-dasharray="2 5"/>';
      s += core(128, 92, 0.52);
    } else {
      // plush shell: a soft body the Core zips into, with the Core as the face
      var bodyFill = lion ? 'url(#' + P + 'skin)' : 'url(#' + P + 'skin)';
      if (lion) s += '<path d="M190 214 Q226 214 222 176" fill="none" stroke="' + X.lionLine + '" stroke-width="13" stroke-linecap="round"/><path d="M190 214 Q226 214 222 176" fill="none" stroke="' + PALETTE.lion.body + '" stroke-width="8" stroke-linecap="round"/>' + '<circle cx="222" cy="172" r="8" fill="url(#' + P + 'mane)" stroke="' + X.lionLine + '" stroke-width="2.2"/>';
      s += '<ellipse cx="128" cy="196" rx="66" ry="42" fill="' + bodyFill + '" stroke="' + line + '" stroke-width="3"/>';
      if (!lion) s += '<path d="M64 186 Q128 150 192 186 L192 196 Q128 170 64 196Z" fill="url(#' + P + 'patch)"/>';
      s += '<ellipse cx="128" cy="196" rx="64" ry="40" fill="url(#' + P + 'fab)"/>';
      [-1, 1].forEach(function (side) {
        s += '<ellipse cx="' + (128 + side * 34) + '" cy="234" rx="20" ry="10" fill="' + (lion ? 'url(#' + P + 'skin)' : 'url(#' + P + 'patch)') + '" stroke="' + line + '" stroke-width="2.8"/>';
        s += '<ellipse cx="' + (128 + side * 62) + '" cy="200" rx="12" ry="20" fill="' + (lion ? 'url(#' + P + 'skin)' : 'url(#' + P + 'patch)') + '" stroke="' + line + '" stroke-width="2.8" transform="rotate(' + (side * -20) + ' ' + (128 + side * 62) + ' 200)"/>';
      });
      s += '<path d="M128 166 V228" stroke="' + line + '" stroke-opacity=".4" stroke-width="1.6" stroke-dasharray="3.5 3"/>';
      s += '<path d="M104 222 h48" stroke="#8A90A3" stroke-width="3" stroke-dasharray="2 2"/><rect x="148" y="217" width="6" height="10" rx="2" fill="#B9BFCC" stroke="#3A3F52" stroke-width="1.2"/>';
      s += core(128, 108, 0.66);
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="' + o.size + '" height="' + o.size + '" role="img" aria-label="Kindling Core in a ' + kind + ' body">' + defs(pet, P) + s + '</svg>';
  }

  // ---------------------------------------------------------------- exploded view of the Core
  function coreExploded(opts) {
    opts = opts || {};
    var pet = opts.petId === 'panda' ? 'panda' : 'lion', lion = pet === 'lion', P = prefix(opts), s = '';
    var shellA = lion ? '#F4A940' : '#F7F4EE', shellB = lion ? '#C97222' : '#CFC7B8', line = lion ? X.lionLine : X.pandaLine;
    var cx = 100, W = 80, Rr = 23;
    function disc(y, h, top, side, stroke, extra) {
      return '<path d="M' + (cx - W) + ' ' + y + ' V' + (y + h) + ' A' + W + ' ' + Rr + ' 0 0 0 ' + (cx + W) + ' ' + (y + h) + ' V' + y + 'Z" fill="' + side + '" stroke="' + stroke + '" stroke-width="2"/>' +
        '<ellipse cx="' + cx + '" cy="' + y + '" rx="' + W + '" ry="' + Rr + '" fill="' + top + '" stroke="' + stroke + '" stroke-width="2"/>' + (extra || '');
    }
    function label(y, title, sub) {
      return '<path d="M' + (cx + W + 6) + ' ' + y + ' H' + (cx + W + 22) + '" stroke="currentColor" stroke-opacity=".45" stroke-width="1.2"/>' +
        '<circle cx="' + (cx + W + 6) + '" cy="' + y + '" r="2.4" fill="currentColor"/>' +
        '<text x="' + (cx + W + 26) + '" y="' + (y - 2) + '" font-size="12.5" font-weight="700" fill="currentColor" font-family="system-ui, -apple-system, Segoe UI, sans-serif">' + title + '</text>' +
        '<text x="' + (cx + W + 26) + '" y="' + (y + 13) + '" font-size="10.5" fill="currentColor" fill-opacity=".7" font-family="system-ui, -apple-system, Segoe UI, sans-serif">' + sub + '</text>';
    }
    s += '<path d="M' + cx + ' 16 V544" stroke="currentColor" stroke-opacity=".28" stroke-width="1.4" stroke-dasharray="4 5"/>';
    // 1 ear and mane clips
    var y1 = 44, clips = '';
    if (lion) clips += '<path d="' + scallop(cx, y1 + 6, 66, 18, Math.PI, Math.PI * 2, 10, function () { return 8; }) + ' L' + cx + ' ' + (y1 + 6) + 'Z" fill="url(#' + P + 'mane)" stroke="' + X.lionLine + '" stroke-width="2"/>';
    [-1, 1].forEach(function (side) {
      var ex = cx + side * 46;
      clips += '<rect x="' + (ex - 9) + '" y="' + (y1 + 6) + '" width="18" height="12" rx="3" fill="#9AA1B3" stroke="' + X.plasticLine + '" stroke-width="1.6"/>';
      clips += '<circle cx="' + ex + '" cy="' + (y1 - 6) + '" r="18" fill="' + (lion ? 'url(#' + P + 'skin)' : 'url(#' + P + 'patch)') + '" stroke="' + (lion ? X.lionLine : X.pandaDark) + '" stroke-width="2.4"/><circle cx="' + ex + '" cy="' + (y1 - 4) + '" r="9.5" fill="' + (lion ? PALETTE.lion.innerEar : '#45424F') + '"/>';
    });
    s += clips + label(y1 - 4, 'Ear and mane clips', 'swap them to change the pet');
    // 2 top shell with talk button
    var y2 = 116;
    s += disc(y2, 22, 'url(#' + P + 'shell)', shellB, line,
      '<ellipse cx="' + cx + '" cy="' + (y2 - 8) + '" rx="22" ry="7" fill="' + (lion ? '#FF7A1A' : '#8B6FD6') + '" stroke="' + X.plasticLine + '" stroke-width="1.6"/>' +
      '<path d="M' + (cx - 22) + ' ' + (y2 - 8) + ' V' + (y2 - 2) + ' A22 7 0 0 0 ' + (cx + 22) + ' ' + (y2 - 2) + ' V' + (y2 - 8) + '" fill="none" stroke="' + X.plasticLine + '" stroke-width="1.6"/>' +
      '<ellipse cx="' + (cx - 40) + '" cy="' + (y2 + 4) + '" rx="16" ry="6" fill="#20242F"/><ellipse cx="' + (cx + 40) + '" cy="' + (y2 + 4) + '" rx="16" ry="6" fill="#20242F"/>');
    s += label(y2, 'Top shell and talk button', 'one big press-to-talk button');
    // 3 eye displays
    var y3 = 192;
    [-1, 1].forEach(function (side) {
      var ex = cx + side * 37;
      s += '<path d="M' + ex + ' ' + (y3 + 10) + ' q' + (-side * 10) + ' 18 ' + (-side * 30) + ' 26" fill="none" stroke="#E2B33A" stroke-width="6" stroke-opacity=".85"/>';
      s += '<ellipse cx="' + ex + '" cy="' + (y3 + 4) + '" rx="26" ry="9" fill="#1A1D27"/><ellipse cx="' + ex + '" cy="' + y3 + '" rx="26" ry="9" fill="#2A2D38" stroke="#11131A" stroke-width="1.6"/>';
      s += '<ellipse cx="' + ex + '" cy="' + y3 + '" rx="21" ry="7" fill="url(#' + P + 'glass)"/><ellipse cx="' + ex + '" cy="' + y3 + '" rx="9" ry="3.6" fill="url(#' + P + 'deye)"/><ellipse cx="' + ex + '" cy="' + y3 + '" rx="4" ry="1.7" fill="#140C08"/>';
    });
    s += label(y3, 'Two round eye displays', 'about 1.3 inch, show moods');
    // 4 main board
    var y4 = 268;
    s += disc(y4, 6, '#2F8F5B', '#1F6B42', '#164D30',
      '<rect x="' + (cx - 22) + '" y="' + (y4 - 9) + '" width="44" height="16" rx="2" fill="#C9CED9" stroke="#6A7080" stroke-width="1.2"/><text x="' + cx + '" y="' + (y4 + 2) + '" font-size="7" text-anchor="middle" fill="#3A3F52" font-family="ui-monospace, Menlo, monospace">MCU + WIFI</text>' +
      '<rect x="' + (cx - 62) + '" y="' + (y4 - 4) + '" width="14" height="9" rx="1.5" fill="#20242F"/><rect x="' + (cx + 34) + '" y="' + (y4 - 5) + '" width="12" height="9" rx="1.5" fill="#20242F"/>' +
      '<circle cx="' + (cx - 34) + '" cy="' + (y4 - 12) + '" r="3.2" fill="#6A7080"/><circle cx="' + (cx + 30) + '" cy="' + (y4 - 13) + '" r="3.2" fill="#6A7080"/>' +
      '<rect x="' + (cx + 50) + '" y="' + (y4 - 4) + '" width="16" height="8" rx="2" fill="#3A3F52"/><rect x="' + (cx + 52) + '" y="' + (y4 - 3) + '" width="6" height="6" rx="1" fill="#F0453A"/>' +
      '<rect x="' + (cx - 10) + '" y="' + (y4 + 14) + '" width="20" height="6" rx="2" fill="#B9BFCC" stroke="#6A7080" stroke-width="1"/>' +
      '<circle cx="' + (cx + 8) + '" cy="' + (y4 - 18) + '" r="2.6" fill="' + X.listen + '"/>');
    s += label(y4, 'Main board', 'chip, two mics, mute, status light');
    // 5 speaker
    var y5 = 340;
    s += '<ellipse cx="' + cx + '" cy="' + (y5 + 6) + '" rx="34" ry="11" fill="#1A1D27"/><ellipse cx="' + cx + '" cy="' + y5 + '" rx="34" ry="11" fill="#3A3F52" stroke="#11131A" stroke-width="1.6"/>';
    s += '<ellipse cx="' + cx + '" cy="' + y5 + '" rx="24" ry="7.6" fill="#5B6278"/><ellipse cx="' + cx + '" cy="' + y5 + '" rx="9" ry="3" fill="#2A2D38"/>';
    s += label(y5, 'Speaker', 'plays through the belly grille');
    // 6 battery
    var y6 = 404;
    s += '<path d="M' + (cx - 50) + ' ' + y6 + ' l50 -14 l50 14 l-50 14Z" fill="#D5DAE4" stroke="#6A7080" stroke-width="1.6"/><path d="M' + (cx - 50) + ' ' + y6 + ' v8 l50 14 l50 -14 v-8 l-50 14Z" fill="#AEB5C4" stroke="#6A7080" stroke-width="1.6"/>';
    s += '<path d="M' + (cx - 16) + ' ' + (y6 - 3) + ' l24 -7 l10 3 l-24 7Z" fill="' + X.listen + '" fill-opacity=".6"/>';
    s += '<path d="M' + (cx + 30) + ' ' + (y6 + 4) + ' q16 6 18 18" fill="none" stroke="#E2453A" stroke-width="2"/><path d="M' + (cx + 34) + ' ' + (y6 + 2) + ' q16 6 18 18" fill="none" stroke="#20242F" stroke-width="2"/>';
    s += label(y6, 'Rechargeable battery', 'sealed pouch, charges by USB-C');
    // 7 bottom shell with magnets and pogo pins
    var y7 = 480;
    s += disc(y7, 26, shellA, shellB, line,
      '<ellipse cx="' + cx + '" cy="' + y7 + '" rx="' + (W - 12) + '" ry="' + (Rr - 7) + '" fill="#000" fill-opacity=".08"/>' +
      [-42, -14, 14, 42].map(function (dx) { return '<ellipse cx="' + (cx + dx) + '" cy="' + (y7 + 2) + '" rx="8" ry="3.2" fill="#9AA1B3" stroke="#3A3F52" stroke-width="1.2"/>'; }).join('') +
      [-9, -3, 3, 9].map(function (dx) { return '<circle cx="' + (cx + dx) + '" cy="' + (y7 + 12) + '" r="2" fill="#E2B33A" stroke="#8C6A12" stroke-width=".8"/>'; }).join('') +
      '<path d="M' + (cx - W) + ' ' + (y7 + 14) + ' A' + W + ' ' + Rr + ' 0 0 0 ' + (cx + W) + ' ' + (y7 + 14) + '" fill="none" stroke="' + line + '" stroke-opacity=".5" stroke-width="1.6"/>');
    s += label(y7, 'Magnetic base, pogo pins', 'snaps into every body');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 560" width="' + (opts.width || 420) + '" role="img" aria-label="Exploded view of the Kindling Core">' + defs(pet, P) + s + '</svg>';
  }

  // =================================================================== PIXEL SPRITES
  function Px(w, h) { this.w = w; this.h = h; this.d = new Array(w * h); for (var i = 0; i < w * h; i++) this.d[i] = null; }
  Px.prototype.set = function (x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; return this; };
  Px.prototype.get = function (x, y) { return (x >= 0 && y >= 0 && x < this.w && y < this.h) ? this.d[y * this.w + x] : null; };
  Px.prototype.ell = function (cx, cy, rx, ry, c) {
    for (var y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (var x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) { var v = typeof c === 'function' ? c(dx, dy, x, y) : c; if (v) this.set(x, y, v); }
    }
    return this;
  };
  Px.prototype.rect = function (x, y, w, h, c) { for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.set(x + i, y + j, c); return this; };
  Px.prototype.pts = function (list, c) { for (var i = 0; i < list.length; i += 2) this.set(list[i], list[i + 1], c); return this; };
  Px.prototype.paintIf = function (fromList, c, region) {
    for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) { var v = this.get(x, y); if (fromList.indexOf(v) >= 0 && (!region || region(x, y))) this.set(x, y, c); }
    return this;
  };
  Px.prototype.outline = function (c) {
    var src = this.d.slice(), w = this.w, h = this.h;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (src[y * w + x]) continue;
      if ((x > 0 && src[y * w + x - 1]) || (x < w - 1 && src[y * w + x + 1]) || (y > 0 && src[(y - 1) * w + x]) || (y < h - 1 && src[(y + 1) * w + x])) this.d[y * w + x] = c;
    }
    return this;
  };
  Px.prototype.flipX = function () { var o = new Px(this.w, this.h); for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) o.d[y * this.w + (this.w - 1 - x)] = this.d[y * this.w + x]; return o; };
  Px.prototype.canvas = function (scale) {
    if (typeof document === 'undefined') return null;
    var c = document.createElement('canvas'); c.width = this.w * scale; c.height = this.h * scale;
    var g = c.getContext('2d');
    for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) { var col = this.d[y * this.w + x]; if (col) { g.fillStyle = col; g.fillRect(x * scale, y * scale, scale, scale); } }
    return c;
  };
  function shadeFn(base, dark, light) {
    return function (dx, dy) { var v = dx * 0.55 + dy * 0.85; return v > 0.5 ? dark : (light && v < -0.78 ? light : base); };
  }
  function texFn(a, b) { return function (dx, dy, x, y) { return ((x + y) % 2 === 0 && dx * dx + dy * dy > 0.5) ? b : a; }; }

  var SC = {
    lion: { B: '#F4A940', b: '#D9832B', h: '#FFD27A', M: '#B9541F', m: '#7E3416', C: '#FFE8C4', N: '#5A2E22', E: '#2B1D16', W: '#FFFFFF', P: '#F7B9A0', K: '#F59A8B', O: '#FF7A1A', U: '#2F7DE1', L: '#A9DBF7', line: '#3A1A0E' },
    panda: { B: '#F7F4EE', b: '#D6CFC1', h: '#FFFFFF', D: '#2D2C35', d: '#1E1D24', C: '#FFFDF8', N: '#2D2C35', E: '#0E0D12', W: '#FFFFFF', K: '#F6A7BC', V: '#8B6FD6', T: '#4CC3A5', G: '#6CC24A', g: '#3E8A2C', F: '#FF8FB1', Y: '#FFD54A', S: '#A0703F', L: '#C7E9FA', line: '#16151B' }
  };

  function petPx(pet, st, dir, frame, mood) {
    if (dir === 'left') return petPx(pet, st, 'right', frame, mood).flipX();
    var p = new Px(24, 24), lion = pet === 'lion', C = SC[pet];
    var hcy = lion ? 9.4 - st * 0.12 : 11, hrx = lion ? 6.9 : 6.6, hry = lion ? 6.2 : 5.9;
    var brx = 4.7 + st * 0.2, bry = 3.3 + st * 0.15, bcy = 22 - bry - 0.6;
    var m = [0, 1.1, 1.6, 2.1, 2.4][st];
    var skin = shadeFn(C.B, C.b, C.h), shut = mood === 'sleepy';
    var limbC = lion ? C.B : C.D;
    if (dir === 'down' || dir === 'up') {
      var back = dir === 'up';
      if (lion && st >= 4 && !back) p.ell(12, bcy + 0.4, brx + 1.6, bry + 1, C.U);
      if (lion && !back) { p.pts([18, Math.round(bcy), 19, Math.round(bcy) - 1], C.B); p.ell(19.9, bcy - 2.2, 1.3, 1.5, C.M); }
      // feet
      var lf = frame === 0 ? 0 : -1, rf = frame === 0 ? -1 : 0;
      p.rect(8, 20 + lf, 3, 2, limbC).rect(13, 20 + rf, 3, 2, limbC);
      // body
      p.ell(12, bcy, brx, bry, skin);
      if (!lion) p.paintIf([C.B, C.b, C.h], C.D, function (x, y) { return y < bcy - bry + 1.9; });
      if (lion && !back) p.ell(12, bcy + 0.9, brx * 0.55, bry * 0.62, C.C);
      if (!lion && back) p.ell(12, bcy + 1.6, 1.2, 1.1, C.B);
      // arms swing
      var la = frame === 0 ? 0 : 1, ra = frame === 0 ? 1 : 0, ax = Math.round(12 - brx) - 1, axr = 23 - ax;
      p.rect(ax, Math.round(bcy) - 2 + la, 1, 2, limbC).rect(axr, Math.round(bcy) - 2 + ra, 1, 2, limbC);
      if (lion && back) { p.pts([12, 20, 12, 19, 13, 18], C.B); }
      if (lion && st >= 4 && back) p.ell(12, bcy - 0.2, brx + 0.9, bry + 0.6, function (dx, dy) { return dy > 0.55 ? '#1D56A8' : C.U; });
      // satchel
      if (!lion && st >= 2) {
        var sy = Math.round(bcy - bry) + 1;
        if (!back) { p.pts([10, sy, 11, sy + 1, 12, sy + 2, 13, sy + 3], C.V); p.rect(15, Math.round(bcy), 2, 2, C.V).set(15, Math.round(bcy), C.T); }
        else { p.pts([13, sy, 12, sy + 1, 11, sy + 2, 10, sy + 3], C.V); p.rect(7, Math.round(bcy), 2, 2, C.V); }
      }
      // mane
      if (lion && st >= 1) {
        p.ell(12, hcy + 0.9, hrx + m, hry + m, texFn(C.M, C.m));
        if (st >= 4) { var tp = Math.floor(hcy + 0.9 - hry - m); p.pts([11, tp - 1, 12, tp - 1, 8, tp, 15, tp, 5, tp + 2, 18, tp + 2], C.M); }
      }
      // ears
      if (lion) { p.ell(5.9, hcy - 4.4, 2.1, 2.1, C.B).ell(18.1, hcy - 4.4, 2.1, 2.1, C.B); if (!back) p.set(6, hcy - 4.4, C.P).set(17, hcy - 4.4, C.P); }
      else { p.ell(5.7, hcy - 4.5, 2.3, 2.3, C.D).ell(18.3, hcy - 4.5, 2.3, 2.3, C.D); }
      // head
      p.ell(12, hcy, hrx, hry, skin);
      var chinRow = Math.floor(hcy + hry);
      for (var x = 7; x <= 16; x++) if (p.get(x, chinRow + 1) === C.B || p.get(x, chinRow + 1) === C.C) p.set(x, chinRow + 1, lion ? C.b : C.b);
      if (!lion) p.paintIf([C.B, C.b, C.h], C.D, function (x, y) { return y >= chinRow && y <= chinRow + 2 && Math.abs(x + 0.5 - 12) > (y - chinRow) * 0.9 + 0.6; });
      if (back) {
        if (lion && st >= 1) p.ell(12, hcy + 0.3, hrx - 0.4, hry - 0.2, texFn(C.M, C.m));
        if (lion && st === 0) p.pts([11, Math.floor(hcy - hry), 12, Math.floor(hcy - hry), 12, Math.floor(hcy - hry) - 1], C.M);
      } else {
        var ey = Math.round(hcy) - 1, nr = Math.round(hcy + 1.6);
        if (lion) p.ell(12, hcy + 2.6, 3.4, 1.9, C.C);
        else { p.ell(9.1, hcy + 0.4, 1.9, 2.3, C.D).ell(14.9, hcy + 0.4, 1.9, 2.3, C.D); p.ell(12, hcy + 2.9, 2.6, 1.5, C.C); }
        if (shut) { p.rect(8, ey + 1, 2, 1, C.E).rect(14, ey + 1, 2, 1, lion ? C.E : C.E); if (!lion) p.set(8, ey + 1, '#8A8796').set(15, ey + 1, '#8A8796'); }
        else { p.rect(8, ey, 2, 2, C.E).set(8, ey, C.W).rect(14, ey, 2, 2, C.E).set(14, ey, C.W); }
        p.rect(11, nr, 2, 1, C.N);
        if (mood === 'excited' || mood === 'talking') p.rect(11, nr + 1, 2, 1, '#C0505A');
        p.set(6, nr, C.K).set(17, nr, C.K);
        if (lion && st === 0) p.pts([11, Math.floor(hcy - hry), 12, Math.floor(hcy - hry), 12, Math.floor(hcy - hry) - 1], C.M);
      }
      // scarf / goggles / sprout / panda goggles
      if (lion && st >= 2) {
        var r = chinRow + 1;
        for (var sx = 8; sx <= 15; sx++) p.set(sx, r, sx % 3 === 0 ? C.U : C.O);
        if (!back) p.pts([14, r + 1, 14, r + 2], C.O).set(15, r + 2, C.U);
      }
      if (lion && st >= 3) {
        var gy = Math.round(hcy - 3.4);
        if (!back) { p.rect(7, gy, 4, 2, C.U).rect(13, gy, 4, 2, C.U).rect(11, gy, 2, 1, C.U); p.pts([8, gy, 9, gy, 14, gy, 15, gy], C.L); p.pts([5, gy + 1, 6, gy + 1, 17, gy + 1, 18, gy + 1], C.O); }
        else p.rect(5, gy + 1, 14, 1, C.O);
      }
      if (!lion) {
        var top = Math.floor(hcy - hry);
        if (st >= 3) { var g2 = Math.round(hcy - 3.1); if (!back) { p.rect(8, g2, 3, 1, C.V).rect(13, g2, 3, 1, C.V).set(9, g2, C.L).set(14, g2, C.L).pts([6, g2, 7, g2, 16, g2, 17, g2], C.T); } else p.rect(6, g2, 12, 1, C.T); }
        sproutPx(p, st, 12, top, C);
      }
    } else {
      // right-facing side view
      if (lion) { p.pts([6, Math.round(bcy), 5, Math.round(bcy) - 1, 4, Math.round(bcy) - 2, 4, Math.round(bcy) - 3], C.B); p.ell(3.6, bcy - 4.6, 1.4, 1.5, C.M); }
      else p.ell(6.4, bcy - 0.4, 1.2, 1.2, C.B);
      if (lion && st >= 4) p.ell(8.4, bcy, 4, 3.6, function (dx, dy) { return dy > 0.5 ? '#1D56A8' : C.U; });
      var bx0 = frame === 0 ? 8 : 10, fx0 = frame === 0 ? 15 : 13;
      p.rect(bx0, 20, 2, 2, limbC).rect(fx0, 20, 2, 2, limbC);
      p.ell(11.8, bcy, brx + 0.8, bry, skin);
      if (!lion) { p.paintIf([C.B, C.b, C.h], C.D, function (x, y) { return y < bcy - bry + 1.9 && x > 9; }); p.rect(14, Math.round(bcy) - 1 + (frame ? 1 : 0), 2, 2, C.D); }
      else { p.ell(13.2, bcy + 0.8, 2.2, 1.6, C.C); p.rect(14, Math.round(bcy) - 1 + (frame ? 1 : 0), 2, 2, C.B); }
      if (!lion && st >= 2) { p.pts([10, Math.round(bcy) - 2, 10, Math.round(bcy) - 1], C.V).rect(8, Math.round(bcy), 2, 2, C.V).set(9, Math.round(bcy), C.T); }
      if (lion && st >= 1) {
        p.ell(10.6, hcy + 0.6, hrx - 0.6 + m * 0.9, hry + m * 0.95, texFn(C.M, C.m));
        if (st >= 4) { var t2 = Math.floor(hcy + 0.6 - hry - m * 0.95); p.pts([9, t2 - 1, 11, t2 - 1, 13, t2, 7, t2 + 1], C.M); }
      }
      if (lion) { p.ell(10.6, hcy - 4.8, 2, 2, C.B).set(10, hcy - 4.8, C.P); }
      else p.ell(10.2, hcy - 4.7, 2.2, 2.2, C.D);
      p.ell(13, hcy, hrx - 0.7, hry - 0.2, skin);
      var ey2 = Math.round(hcy) - 1, sideC = Math.floor(hcy + hry);
      if (!lion) p.paintIf([C.B, C.b, C.h], C.D, function (x, y) { return y >= sideC && y <= sideC + 2 && x >= 8 && x <= 15; });
      if (lion) { p.ell(18.4, hcy + 2.1, 2.4, 1.8, C.C); p.rect(20, Math.round(hcy + 1), 1, 2, C.N); }
      else { p.ell(16, hcy + 0.5, 1.8, 2.2, C.D); p.ell(18.1, hcy + 2.3, 2.1, 1.5, C.C); p.rect(19, Math.round(hcy + 1.6), 2, 1, C.N); }
      if (shut) p.rect(15, ey2 + 1, 2, 1, lion ? C.E : '#8A8796');
      else p.rect(15, ey2, 2, 2, C.E).set(16, ey2, C.W);
      p.set(15, Math.round(hcy + 2.4), C.K);
      if (mood === 'excited' || mood === 'talking') p.set(19, Math.round(hcy + 3), '#C0505A');
      if (lion && st === 0) p.pts([11, Math.floor(hcy - hry) + 1, 12, Math.floor(hcy - hry), 12, Math.floor(hcy - hry) - 1], C.M);
      if (lion && st >= 2) { var r2 = sideC + 1; for (var q = 10; q <= 15; q++) p.set(q, r2, q % 3 === 0 ? C.U : C.O); p.pts([9, r2 + 1, 8, r2 + 1], C.O).set(7, r2 + 2, C.U); }
      if (lion && st >= 3) { var g3 = Math.round(hcy - 3.6); p.rect(14, g3, 4, 2, C.U).pts([15, g3, 16, g3], C.L); p.rect(9, g3 + 1, 5, 1, C.O); }
      if (!lion) {
        if (st >= 3) { var g4 = Math.round(hcy - 3.1); p.rect(14, g4, 3, 1, C.V).set(15, g4, C.L).rect(9, g4, 5, 1, C.T); }
        sproutPx(p, st, 13, Math.floor(hcy - hry), C);
      }
    }
    p.outline(C.line);
    return p;
  }
  function sproutPx(p, st, x, top, C) {
    if (st === 0) { p.set(x, top - 1, C.S).set(x + 1, top - 1, C.S).set(x + 1, top - 2, C.G); return; }
    p.set(x, top - 1, C.g);
    if (st === 1) { p.set(x - 1, top - 2, C.G).set(x + 1, top - 2, C.G); return; }
    p.set(x, top - 2, C.g);
    p.pts([x - 1, top - 2, x - 2, top - 3, x + 1, top - 2, x + 2, top - 3], C.G);
    if (st === 3) p.set(x, top - 3, C.F).set(x, top - 4, '#F06A95');
    if (st === 4) { p.set(x, top - 3, C.g); p.pts([x - 1, top - 5, x + 1, top - 5, x, top - 6, x, top - 4], C.F).set(x, top - 5, C.Y); }
  }

  // ---------------------------------------------------------------- people
  var SKIN = '#E9B48E', SKIN_D = '#CF946C', HAIR = '#3B2A22';
  var HUMANS = {
    alfie: { headY: 16.2, headRx: 4.8, headRy: 4.6, hair: HAIR, hairStyle: 'short', top: '#FF7A1A', topD: '#D9601A', topRows: [21, 25], topW: 4.2, legs: '#2F7DE1', legRows: [25, 28], shoes: '#3B3F4E', truck: true },
    ruby: { headY: 11.6, headRx: 5, headRy: 4.8, hair: HAIR, hairStyle: 'bunches', top: '#8B6FD6', topD: '#6E54BB', topRows: [16, 23], topW: 4.4, skirt: true, legs: '#5B4A9E', legRows: [23, 28], shoes: '#4CC3A5', tie: '#4CC3A5' },
    mum: { headY: 6.2, headRx: 4.5, headRy: 4.5, hair: '#4A2E20', hairStyle: 'long', top: '#E8735A', topD: '#C45843', topRows: [11, 20], topW: 4.8, legs: '#3D5A80', legRows: [20, 28], shoes: '#2A2E3A' },
    dad: { headY: 5.8, headRx: 4.6, headRy: 4.6, hair: '#22201F', hairStyle: 'crop', top: '#34466B', topD: '#26344F', topRows: [11, 20], topW: 5.2, legs: '#B9A27A', legRows: [20, 28], shoes: '#2A2E3A', beard: true }
  };
  function humanPx(kind, dir, frame) {
    if (dir === 'left') return humanPx(kind, 'right', frame).flipX();
    var S = HUMANS[kind], p = new Px(24, 32), side = dir === 'right', back = dir === 'up';
    var hy = S.headY, hx = side ? 12.4 : 12, t0 = S.topRows[0], t1 = S.topRows[1], l0 = S.legRows[0], l1 = S.legRows[1];
    var skin = shadeFn(SKIN, SKIN_D, null), top = shadeFn(S.top, S.topD, null);
    // legs and shoes
    if (side) {
      var a = frame === 0 ? 10 : 12, b = frame === 0 ? 13 : 11;
      p.rect(a, l0, 2, l1 - l0 + 1, S.legs).rect(b, l0, 2, l1 - l0 + 1, S.legs);
      p.rect(a, l1 + 1, 3, 2, S.shoes).rect(b, l1 + 1, 3, 2, S.shoes);
    } else {
      var lu = frame === 0 ? 0 : 1, ru = frame === 0 ? 1 : 0;
      p.rect(9, l0, 2, l1 - l0 + 1 - lu, S.legs).rect(13, l0, 2, l1 - l0 + 1 - ru, S.legs);
      p.rect(8, l1 + 1 - lu, 3, 2, S.shoes).rect(13, l1 + 1 - ru, 3, 2, S.shoes);
    }
    // body
    var tw = S.topW;
    p.ell(12, (t0 + t1) / 2 + 0.5, tw, (t1 - t0) / 2 + 0.8, top);
    p.rect(Math.round(12 - tw + 0.5), t0 + 1, Math.round(tw * 2 - 1), t1 - t0 - 1, S.top);
    if (S.skirt) p.rect(7, t1 - 2, 10, 3, S.topD).rect(8, t1 - 2, 8, 2, S.top);
    // arms
    var swing = frame === 0 ? 0 : 1;
    if (side) p.rect(12, t0 + 1 + swing, 2, t1 - t0 - 2, S.topD).rect(12, t1 - 1 + swing, 2, 2, SKIN);
    else {
      var axL = Math.round(12 - tw) - 1, axR = 23 - axL;
      p.rect(axL, t0 + 1 + swing, 1, 3, S.top).rect(axL, t0 + 4 + swing, 1, 2, SKIN);
      p.rect(axR, t0 + 2 - swing, 1, 3, S.top).rect(axR, t0 + 5 - swing, 1, 2, SKIN);
    }
    if (S.truck && !back) {
      if (side) p.rect(13, t0 + 2, 2, 1, '#2F7DE1').set(13, t0 + 3, '#2A2E3A');
      else { p.pts([12, t0 + 1, 13, t0 + 1], '#2F7DE1').rect(10, t0 + 2, 4, 1, '#2F7DE1').pts([10, t0 + 3, 13, t0 + 3], '#2A2E3A'); }
    }
    // hair behind the head
    if (S.hairStyle === 'long') {
      if (back) p.ell(hx, hy + 2.2, S.headRx + 0.8, S.headRy + 2.4, S.hair);
      else if (side) p.ell(hx - 2.6, hy + 2.4, 2.8, S.headRy + 1.6, S.hair);
      else p.ell(hx - 4.3, hy + 2.6, 1.7, S.headRy, S.hair).ell(hx + 4.3, hy + 2.6, 1.7, S.headRy, S.hair);
    }
    if (S.hairStyle === 'bunches') {
      if (side) p.ell(hx - 4.8, hy - 0.5, 2.1, 2.3, S.hair);
      else p.ell(hx - 6, hy - 0.6, 2.1, 2.3, S.hair).ell(hx + 6, hy - 0.6, 2.1, 2.3, S.hair);
    }
    // neck and head
    p.rect(11, Math.floor(hy + S.headRy) - 1, 2, 2, SKIN_D);
    p.ell(hx, hy, S.headRx, S.headRy, skin);
    // hair on the head
    if (back) p.ell(hx, hy, S.headRx + 0.4, S.headRy + 0.3, function (dx, dy) { return dy < 0.75 ? S.hair : SKIN; });
    else if (side) p.ell(hx, hy, S.headRx + 0.4, S.headRy + 0.3, function (dx, dy) { return (dy < -0.25 || (dx < -0.15 && dy < 0.55)) ? S.hair : null; });
    else p.ell(hx, hy, S.headRx + 0.4, S.headRy + 0.3, function (dx, dy) { return (dy < -0.3 || (Math.abs(dx) > 0.78 && dy < 0.35)) ? S.hair : null; });
    if (S.tie) { if (side) p.set(Math.round(hx - 3.4), Math.round(hy - 0.6), S.tie); else if (!back) p.set(Math.round(hx - 4.2), Math.round(hy - 1), S.tie).set(Math.round(hx + 3.6), Math.round(hy - 1), S.tie); else p.set(Math.round(hx - 4.2), Math.round(hy - 1), S.tie).set(Math.round(hx + 3.6), Math.round(hy - 1), S.tie); }
    if (!back) {
      var eyY = Math.round(hy + 0.4);
      if (side) { p.set(Math.round(hx + 2.4), eyY, '#2A1E1A'); p.set(Math.round(hx + 4.6), eyY + 1, SKIN_D); p.set(Math.round(hx + 1.6), eyY + 2, '#F09A8A'); }
      else { p.set(10, eyY, '#2A1E1A').set(13, eyY, '#2A1E1A').set(9, eyY + 2, '#F09A8A').set(14, eyY + 2, '#F09A8A'); p.rect(11, eyY + 2, 2, 1, '#B5645A'); }
      if (S.beard) { if (side) p.rect(Math.round(hx + 1), Math.round(hy + 3), 4, 1, S.hair); else p.rect(9, Math.round(hy + 3.2), 6, 1, S.hair); }
    }
    p.outline('#2A2230');
    return p;
  }

  var CACHE = {};
  function cached(key, make, scale) {
    if (CACHE[key] !== undefined) return CACHE[key];
    var px = make(); var c = px ? px.canvas(scale) : null;
    CACHE[key] = c; return c;
  }
  function dirOf(d) { return ['down', 'up', 'left', 'right'].indexOf(d) >= 0 ? d : 'down'; }
  function sprite(petId, opts) {
    opts = opts || {};
    var pet = petId === 'panda' ? 'panda' : 'lion', st = clampStage(opts.stage), dir = dirOf(opts.dir), fr = opts.frame ? 1 : 0;
    var scale = Math.max(1, Math.round(opts.scale || 2)), mood = MOODS.indexOf(opts.mood) >= 0 ? opts.mood : 'happy';
    var moodKey = mood === 'sleepy' ? 's' : (mood === 'excited' || mood === 'talking') ? 'o' : 'n';
    return cached([pet, st, dir, fr, scale, moodKey].join('|'), function () { return petPx(pet, st, dir, fr, mood); }, scale);
  }
  function spriteHuman(kind, opts) {
    opts = opts || {};
    if (!HUMANS[kind]) return null;
    var dir = dirOf(opts.dir), fr = opts.frame ? 1 : 0, scale = Math.max(1, Math.round(opts.scale || 2));
    return cached(['h', kind, dir, fr, scale].join('|'), function () { return humanPx(kind, dir, fr); }, scale);
  }

  root.PetArt = {
    version: '1.0',
    svg: svg,
    svgDataURL: svgDataURL,
    sprite: sprite,
    spriteKid: function (kidId, opts) { return spriteHuman(kidId, opts); },
    spriteNpc: function (npcId, opts) { return spriteHuman(npcId, opts); },
    coreExploded: coreExploded,
    buildBody: buildBody,
    stageNames: STAGE_NAMES,
    moods: MOODS.slice(),
    bodies: BODIES.slice(),
    buildBodies: ['plush-shell', 'rover', 'dock', 'cardboard'],
    palette: PALETTE,
    names: NAMES,
    // for tests: raw pixel grids without a DOM
    _pixels: function (kind, id, opts) { opts = opts || {}; return kind === 'pet' ? petPx(id, clampStage(opts.stage), dirOf(opts.dir), opts.frame ? 1 : 0, opts.mood || 'happy') : humanPx(id, dirOf(opts.dir), opts.frame ? 1 : 0); }
  };
})(typeof window !== 'undefined' ? window : this);
