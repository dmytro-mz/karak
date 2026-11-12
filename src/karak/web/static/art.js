// All game art as SVG symbols (100×100), installed once in a hidden <svg> and drawn with <use>.
// Heroes, monsters and items are original drawings in a chunky storybook style.

import { h, s } from "./dom.js";
import { ITEM_DEFS, ITEM_KEYS, itemArt } from "./items.js";
import { HERO_KEYS, MONSTER_KEYS, PORTRAIT_DEFS, heroArt, monsterArt } from "./portraits.js";

export const HERO_FILL = {
  red: ["#e2553f", "#8f2116"],
  green: ["#5fae4a", "#24561b"],
  blue: ["#4f8fe0", "#1d3f7c"],
  purple: ["#9a62d6", "#4a2276"],
  gold: ["#f0be3c", "#8a5c0c"],
  teal: ["#3fb9b0", "#14605b"],
  stone: ["#9b8f80", "#4f463b"],
};

const INK = "#24160d";
const line = (w = 3) => ({ stroke: INK, "stroke-width": w, "stroke-linejoin": "round", "stroke-linecap": "round" });

function grad(id, stops, { radial = false, ...attrs } = {}) {
  return s(
    radial ? "radialGradient" : "linearGradient",
    { id, ...(radial ? {} : { x1: 0, y1: 0, x2: 0, y2: 1 }), ...attrs },
    stops.map(([offset, color, opacity = 1]) => s("stop", { offset, "stop-color": color, "stop-opacity": opacity })),
  );
}

function skull(cx, cy) {
  return [
    s("path", { d: `M${cx - 18} ${cy} Q${cx - 18} ${cy - 24} ${cx} ${cy - 24} Q${cx + 18} ${cy - 24} ${cx + 18} ${cy} Q${cx + 18} ${cy + 10} ${cx + 10} ${cy + 12} V${cy + 22} H${cx - 10} V${cy + 12} Q${cx - 18} ${cy + 10} ${cx - 18} ${cy}Z`, fill: "#efe6cf", ...line() }),
    s("ellipse", { cx: cx - 7, cy: cy - 2, rx: 5.5, ry: 6, fill: "#2b2117" }),
    s("ellipse", { cx: cx + 7, cy: cy - 2, rx: 5.5, ry: 6, fill: "#2b2117" }),
    s("circle", { cx: cx - 7, cy: cy - 1, r: 1.8, fill: "#ff5a3c" }),
    s("circle", { cx: cx + 7, cy: cy - 1, r: 1.8, fill: "#ff5a3c" }),
    s("path", { d: `M${cx - 2} ${cy + 7} L${cx} ${cy + 3} L${cx + 2} ${cy + 7}Z`, fill: "#2b2117" }),
    s("path", { d: `M${cx - 5} ${cy + 14} V${cy + 21} M${cx} ${cy + 14} V${cy + 21} M${cx + 5} ${cy + 14} V${cy + 21}`, stroke: "#2b2117", "stroke-width": 2 }),
  ];
}

// ------------------------------------------------------------------ items (weapons and spells live in items.js)
const ITEMS = {
  key: () => [
    s("circle", { cx: 50, cy: 26, r: 16, fill: "#f2c230", ...line() }),
    s("circle", { cx: 50, cy: 26, r: 6, fill: "#5a3d1c" }),
    s("path", { d: "M44 40 H56 V88 H44Z", fill: "#f2c230", ...line() }),
    s("path", { d: "M56 66 H70 V74 H56 M56 80 H66 V88 H56", fill: "#f2c230", ...line(2.5) }),
    s("path", { d: "M47 44 V84", stroke: "#fff3b0", "stroke-width": 2 }),
  ],
  treasure: () => [
    s("path", { d: "M14 84 Q50 46 86 84Z", fill: "#e2a91f", ...line() }),
    ...[
      [30, 74],
      [44, 66],
      [58, 68],
      [70, 76],
      [50, 78],
      [38, 82],
      [62, 84],
      [52, 56],
    ].map(([cx, cy]) => s("ellipse", { cx, cy, rx: 9, ry: 6, fill: "#ffd447", ...line(2) })),
    s("path", { d: "M40 54 L46 40 L58 40 L64 54 L52 62Z", fill: "#3fc3ff", ...line(2.5) }),
    s("path", { d: "M46 40 L52 62 L58 40", fill: "none", stroke: "#bff0ff", "stroke-width": 2 }),
  ],
  ruby: () => [
    s("path", { d: "M50 92 L12 42 L28 16 H72 L88 42Z", fill: "#e2233b", ...line() }),
    s("path", { d: "M12 42 H88 M28 16 L40 42 L50 92 L60 42 L72 16 M40 42 L50 16 L60 42", fill: "none", stroke: "#7a0f1d", "stroke-width": 2.5 }),
    s("path", { d: "M30 22 L36 36", stroke: "#ffd0d6", "stroke-width": 4, "stroke-linecap": "round" }),
  ],
};

const MISC = {
  chest: () => [
    s("path", { d: "M14 46 Q14 18 50 18 Q86 18 86 46Z", fill: "#a8642a", ...line() }),
    s("rect", { x: 14, y: 46, width: 72, height: 38, rx: 3, fill: "#94541f", ...line() }),
    s("path", { d: "M26 22 V84 M74 22 V84", stroke: "#e0ad38", "stroke-width": 7 }),
    s("path", { d: "M26 22 V84 M74 22 V84", ...line(1.5), fill: "none" }),
    s("path", { d: "M14 46 H86", ...line(4) }),
    s("rect", { x: 41, y: 38, width: 18, height: 22, rx: 3, fill: "#f2c230", ...line(2.5) }),
    s("path", { d: "M50 46 v6", stroke: INK, "stroke-width": 3.5, "stroke-linecap": "round" }),
  ],
  heart: () => [
    s("circle", { cx: 50, cy: 50, r: 44, fill: "#f6e7c6", ...line(4) }),
    s("path", { d: "M50 80 Q14 56 24 34 Q34 18 50 34 Q66 18 76 34 Q86 56 50 80Z", fill: "#d8261c", ...line(3.5) }),
    s("path", { d: "M32 36 Q36 30 42 34", fill: "none", stroke: "#ffb3a6", "stroke-width": 4, "stroke-linecap": "round" }),
  ],
  skull: () => [s("circle", { cx: 50, cy: 50, r: 44, fill: "#3a2f28", ...line(4) }), ...skull(50, 52)],
  curse: () => [
    s("circle", { cx: 50, cy: 50, r: 44, fill: "#4a1f63", ...line(4) }),
    s("path", { d: "M50 14 L58 40 L86 40 L63 56 L72 84 L50 67 L28 84 L37 56 L14 40 L42 40Z", fill: "none", stroke: "#c77dff", "stroke-width": 3 }),
    s("ellipse", { cx: 50, cy: 50, rx: 18, ry: 11, fill: "#efe6cf", ...line(3) }),
    s("circle", { cx: 50, cy: 50, r: 7, fill: "#9cff6b", ...line(2) }),
    s("circle", { cx: 50, cy: 50, r: 2.5, fill: INK }),
  ],
  boot: () => [
    s("path", { d: "M34 14 H58 V58 L84 66 Q90 70 88 82 H22 Q20 60 34 52Z", fill: "#8a5a2b", ...line(3.5) }),
    s("path", { d: "M34 26 H58 M22 82 H88", ...line(3) }),
  ],
  die: () => [s("rect", { x: 8, y: 8, width: 84, height: 84, rx: 18, fill: "#f8efdc", ...line(4) })],
};

// Face-down tile: the mark printed on the back of every dungeon tile.
function tileBack() {
  return [
    s("rect", { x: 0, y: 0, width: 100, height: 100, rx: 4, fill: "url(#g-back)" }),
    s("rect", { x: 5, y: 5, width: 90, height: 90, rx: 3, fill: "none", stroke: "#c9a64a", "stroke-width": 2.5, opacity: 0.8 }),
    s("path", { d: "M30 70 V44 L36 38 V30 H42 V36 H47 V30 H53 V36 H58 V30 H64 V38 L70 44 V70Z", fill: "#2a1a10", stroke: "#c9a64a", "stroke-width": 2 }),
    s("path", { d: "M44 70 V58 Q50 50 56 58 V70", fill: "#c9a64a" }),
    s("text", { x: 50, y: 88, "text-anchor": "middle", "font-size": 13, "font-weight": 900, fill: "#c9a64a", "font-family": "Cinzel Decorative, Georgia, serif", "letter-spacing": 2 }, "KARAK"),
  ];
}

function markup(tag, attrs, html) {
  const el = s(tag, attrs);
  el.innerHTML = html;
  return el;
}

export function installArt() {
  const defs = s(
    "defs",
    {},
    grad("g-back", [
      [0, "#5a3a22"],
      [1, "#2e1d12"],
    ]),
    grad("g-token", [
      [0, "#fbf1d8"],
      [1, "#d9bf8c"],
    ]),
    grad("g-torch", [
      [0, "#fff3b0", 1],
      [0.35, "#ffb23a", 0.75],
      [1, "#ff7a1a", 0],
    ], { radial: true }),
    grad("ft-deep", [
      [0, "#c8fbff"],
      [0.3, "#4ac0e0"],
      [0.8, "#12507e"],
      [1, "#0a2e4e"],
    ], { radial: true }),
    grad("ft-glow", [
      [0, "#b8fff0", 0.75],
      [0.6, "#6ae8d0", 0.3],
      [1, "#6ae8d0", 0],
    ], { radial: true }),
    grad("ft-stone", [
      [0, "#c4bcaa"],
      [0.7, "#958d7c"],
      [1, "#6e675a"],
    ], { radial: true, cx: "40%", cy: "35%", r: "75%" }),
    grad("pt-void", [
      [0, "#3a1060"],
      [0.6, "#14042a"],
      [1, "#05010c"],
    ], { radial: true }),
    grad("pt-glow", [
      [0, "#e0a8ff", 0.7],
      [0.6, "#a050ff", 0.28],
      [1, "#a050ff", 0],
    ], { radial: true }),
    grad("pt-stone", [
      [0, "#9a92a6"],
      [1, "#4e4858"],
    ]),
    grad("g-pouch", [
      [0, "#c0803e"],
      [0.7, "#8a5226"],
      [1, "#5a3216"],
    ], { radial: true, cx: "40%", cy: "40%", r: "70%" }),
    grad("g-fog", [
      [0, "#000", 0],
      [1, "#000", 0.55],
    ], { radial: true }),
    markup("g", {}, PORTRAIT_DEFS),
    HERO_KEYS.map((k) => markup("symbol", { id: `hero-${k}`, viewBox: "0 0 100 100" }, heroArt(k))),
    MONSTER_KEYS.map((k) => markup("symbol", { id: `mon-${k}`, viewBox: "0 0 100 100" }, monsterArt(k))),
    markup("g", {}, ITEM_DEFS),
    ITEM_KEYS.map((k) => markup("symbol", { id: `item-${k}`, viewBox: "0 0 100 100" }, itemArt(k))),
    Object.entries(ITEMS).map(([k, f]) => s("symbol", { id: `item-${k}`, viewBox: "0 0 100 100" }, f())),
    Object.entries(MISC).map(([k, f]) => s("symbol", { id: `misc-${k}`, viewBox: "0 0 100 100" }, f())),
    s("symbol", { id: "tile-back", viewBox: "0 0 100 100" }, tileBack()),
  );
  document.body.append(s("svg", { class: "defs-holder", width: 0, height: 0, "aria-hidden": "true" }, defs));
}

// ------------------------------------------------------------------ HTML helpers
export function art(id, size = 40, cls = "") {
  return s("svg", { class: `art ${cls}`, width: size, height: size, viewBox: "0 0 100 100" }, s("use", { href: `#${id}` }));
}

export function heroPortrait(hero, color, size = 48, cls = "") {
  const [light, dark] = HERO_FILL[color] || HERO_FILL.stone;
  return h(
    "span",
    { class: `portrait ${cls}`, style: { width: `${size}px`, height: `${size}px`, "--hl": light, "--hd": dark } },
    hero ? art(`hero-${hero}`, size) : h("span", { class: "portrait-q" }, "?"),
  );
}

export function token(kind, size = 52, strength = null, cls = "") {
  const isMonster = strength != null;
  const id = kind === "chest" ? "misc-chest" : isMonster ? `mon-${kind}` : `item-${kind}`;
  return h(
    "span",
    { class: `token ${isMonster ? "monster" : ""} ${kind === "dragon" ? "dragon" : ""} ${cls}`, style: { width: `${size}px`, height: `${size}px` } },
    art(id, isMonster ? size : size * 0.78),
    isMonster ? h("span", { class: "strength" }, strength) : null,
  );
}

export function itemIcon(kind, size = 34, cls = "") {
  return h("span", { class: `item-icon ${cls}`, style: { width: `${size}px`, height: `${size}px` } }, art(`item-${kind}`, size * 0.8));
}

const PIPS = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[26, 26], [50, 50], [74, 74]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]], 6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]] };

export function die(value, cls = "") {
  return h(
    "span",
    { class: `die ${cls}`, "data-v": value },
    s("svg", { viewBox: "0 0 100 100", width: 56, height: 56 }, s("use", { href: "#misc-die" }), (PIPS[value] || []).map(([cx, cy]) => s("circle", { cx, cy, r: 9, fill: value === 6 ? "#b3261b" : "#24160d" }))),
  );
}

// "[rat]" / "[key]" etc. in log lines become tiny icons.
export function richText(text) {
  const out = [];
  const re = /\[([a-z]+)\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    out.push(text.slice(last, m.index));
    const k = m[1];
    const id = MONSTER_KEYS.includes(k) ? `mon-${k}` : ITEMS[k] || ITEM_KEYS.includes(k) ? `item-${k}` : k === "chest" ? "misc-chest" : null;
    out.push(id ? art(id, 18, "inline") : m[0]);
    last = re.lastIndex;
  }
  out.push(text.slice(last));
  return out;
}
