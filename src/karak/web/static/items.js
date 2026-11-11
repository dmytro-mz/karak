// Weapon and spell icons (100×100 markup strings for <symbol>s): forged steel weapons laid diagonally,
// and spells as rolled scrolls with a wax seal.

const r1 = (n) => Math.round(n * 10) / 10;
const attrs = (a) => Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(" ");
const E = (tag, a = {}, ...kids) => `<${tag} ${attrs(a)}>${kids.flat(Infinity).join("")}</${tag}>`;
const INK = "#24160d";
const DARK = "#1a100a";
const OW = 1.8;
const L = (w = 3, c = INK) => ({ stroke: c, "stroke-width": w, "stroke-linejoin": "round", "stroke-linecap": "round" });
const rot = (d, ...kids) => E("g", { transform: `rotate(${d} 50 50)` }, kids);
const mirror = (...kids) => E("g", { transform: "translate(100 0) scale(-1 1)" }, kids);
const scaled = (k, ...kids) => E("g", { transform: `translate(50 50) scale(${k}) translate(-50 -50)` }, kids);
const heartD = (x, y, s) =>
  `M${x} ${r1(y + 3 * s)} Q${r1(x - 5 * s)} ${r1(y - 0.4 * s)} ${r1(x - 2.6 * s)} ${r1(y - 2.6 * s)} Q${r1(x - s)} ${r1(y - 3.6 * s)} ${x} ${r1(y - 1.6 * s)} ` +
  `Q${r1(x + s)} ${r1(y - 3.6 * s)} ${r1(x + 2.6 * s)} ${r1(y - 2.6 * s)} Q${r1(x + 5 * s)} ${r1(y - 0.4 * s)} ${x} ${r1(y + 3 * s)}Z`;
const star4 = (x, y, r, fill) => E("path", { d: `M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z`, fill, ...L(1.4) });

// ------------------------------------------------------------------ weapon parts (upright, tip up; rotated afterwards)
function blade(y0, y1, w, tip) {
  const t = r1(y0 + w * tip);
  const d = `M50 ${y0} L${r1(50 - w)} ${t} V${y1} H${r1(50 + w)} V${t}Z`;
  return [E("path", { d, fill: "url(#we-blade)" }), E("path", { d, fill: "none", ...L(OW) })];
}
function guard(y, half, h, curve, knob) {
  const fill = "url(#we-gold)";
  const d = `M${50 - half} ${y} Q50 ${y + curve} ${50 + half} ${y} L${50 + half} ${y + h} Q50 ${y + h + curve} ${50 - half} ${y + h}Z`;
  return [
    E("path", { d, fill, ...L(OW) }),
    E("path", { d: `M${50 - half + 2} ${y + 1.6} Q50 ${y + curve + 1.6} ${50 + half - 2} ${y + 1.6}`, fill: "none", stroke: "#fff6c8", "stroke-width": 1.4, opacity: 0.8 }),
    E("circle", { cx: 50 - half, cy: y + h / 2, r: knob, fill, ...L(OW * 0.85) }),
    E("circle", { cx: 50 + half, cy: y + h / 2, r: knob, fill, ...L(OW * 0.85) }),
  ];
}
function grip(y, len, gw) {
  const box = { x: 50 - gw, y, width: gw * 2, height: len, rx: r1(gw * 0.6) };
  return [
    E("rect", { ...box, fill: "url(#we-leather)" }),
    Array.from({ length: Math.floor(len / 4) }, (_, i) => E("path", { d: `M${50 - gw} ${r1(y + 3 + i * 4)} L${50 + gw} ${r1(y + 0.8 + i * 4)}`, stroke: "#1e1008", "stroke-width": 1.5 })),
    E("rect", { ...box, fill: "none", ...L(OW) }),
  ];
}

const swordUp = () => [
  blade(5, 63, 6.6, 2),
  E("path", { d: "M50 17 V59", stroke: "#6f7b87", "stroke-width": 1.6, opacity: 0.7 }),
  E("path", { d: "M48.4 17 V59", stroke: "#fff", "stroke-width": 0.8, opacity: 0.8 }),
  grip(68, 19, 3.8),
  guard(62, 21, 5, 2.5, 3),
  E("rect", { x: 45, y: 60, width: 10, height: 10, rx: 2.2, fill: "url(#we-gold)", ...L(OW) }),
  E("circle", { cx: 50, cy: 65, r: 2.4, fill: "url(#we-gem)", ...L(0.9) }),
  E("path", { d: "M50 86 L55.5 91 L50 97 L44.5 91Z", fill: "url(#we-gold)", ...L(OW) }),
  E("circle", { cx: 50, cy: 91, r: 2.1, fill: "url(#we-gem)", ...L(0.8) }),
];

const daggerUp = () => [
  blade(15, 55, 5.6, 2.2),
  E("path", { d: "M50 25 V52", stroke: "#6f7b87", "stroke-width": 1.2, opacity: 0.7 }),
  grip(59, 15, 3.4),
  E("rect", { x: 37, y: 54.5, width: 26, height: 4.6, rx: 2.2, fill: "url(#we-gold)", ...L(OW) }),
  E("circle", { cx: 37, cy: 56.8, r: 2.6, fill: "url(#we-gold)", ...L(OW) }),
  E("circle", { cx: 63, cy: 56.8, r: 2.6, fill: "url(#we-gold)", ...L(OW) }),
  E("circle", { cx: 50, cy: 78.5, r: 4.4, fill: "none", stroke: DARK, "stroke-width": 4.4 }),
  E("circle", { cx: 50, cy: 78.5, r: 4.4, fill: "none", stroke: "url(#we-gold)", "stroke-width": 2.4 }),
];

// Bearded axe, upright with the blade on the left of the haft.
const AXE_HEAD = "M44 20 L30 18 Q22 16 17 11 Q6 34 19 60 Q24 53 30 49 L44 42Z";
const axeUp = () => [
  E("rect", { x: 46.8, y: 8, width: 6.4, height: 86, rx: 3, fill: "url(#we-wood)", ...L(OW) }),
  E("path", { d: "M49 48 Q50 60 49 70 M51.5 50 Q51 58 52 68", fill: "none", stroke: "#3a200c", "stroke-width": 0.8, opacity: 0.7 }),
  grip(70, 15, 3.8),
  E("rect", { x: 46, y: 87, width: 8, height: 7, rx: 2, fill: "url(#we-gold)", ...L(OW) }),
  E("path", { d: AXE_HEAD, fill: "url(#we-head)" }),
  E("path", { d: "M17 11 Q6 34 19 60 Q13 34 23 15Z", fill: "url(#we-edge)" }),
  E("path", { d: "M23 15 Q13 34 19 60", fill: "none", stroke: "#5d6873", "stroke-width": 0.9, opacity: 0.8 }),
  E("path", { d: "M28 30 Q33 33 38 31", fill: "none", stroke: "#4a545e", "stroke-width": 1, opacity: 0.7 }),
  E("path", { d: AXE_HEAD, fill: "none", ...L(OW, DARK) }),
  E("path", { d: "M56 22 L71 29 L56 36Z", fill: "url(#we-head)", ...L(OW) }),
  E("rect", { x: 44.4, y: 14, width: 11.2, height: 32, rx: 2.6, fill: "url(#we-socket)", ...L(OW) }),
  E("path", { d: "M44.4 20 H55.6 M44.4 40 H55.6", stroke: DARK, "stroke-width": 0.9 }),
  E("circle", { cx: 50, cy: 30, r: 2.2, fill: "url(#we-gold)", ...L(0.8) }),
];

// ------------------------------------------------------------------ spells
const SHEET = "M27 20 Q24 50 27 80 H73 Q76 50 73 20Z";
function scroll(content, seal) {
  return [
    E("path", { d: SHEET, fill: "#f6e7c0", ...L(3) }),
    E("path", { d: "M31 26 V74", stroke: "#d9c08a", "stroke-width": 2, opacity: 0.7 }),
    content,
    E("rect", { x: 19, y: 11, width: 62, height: 12, rx: 6, fill: "#e2c48a", ...L(3) }),
    E("path", { d: "M25 15 H75", stroke: "#fff3d0", "stroke-width": 1.8, opacity: 0.8 }),
    E("rect", { x: 19, y: 77, width: 62, height: 12, rx: 6, fill: "#e2c48a", ...L(3) }),
    E("path", { d: "M25 81 H75", stroke: "#fff3d0", "stroke-width": 1.8, opacity: 0.8 }),
    E("path", { d: "M64 86 L60 98 L65 95 L69 99 L70 87Z", fill: seal, ...L(2) }),
    E("circle", { cx: 68, cy: 83, r: 8, fill: seal, ...L(2.5) }),
    E("circle", { cx: 68, cy: 83, r: 4.6, fill: "none", stroke: "#fff", "stroke-width": 1.2, opacity: 0.5 }),
  ];
}

const BOLT = "M62 4 L30 52 H48 L36 96 L72 42 H54 L72 4Z";
const spiral = (a0, from, to, turn, n = 28) =>
  "M" +
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const r = from + (to - from) * t;
    const a = ((a0 + turn * t) * Math.PI) / 180;
    return `${r1(50 + Math.cos(a) * r)} ${r1(50 + Math.sin(a) * r)}`;
  }).join(" L");
function vortex() {
  const arms = [0, 120, 240].map((a) => spiral(a, 36, 11, 210));
  const arm = (stroke, w) => arms.map((d) => E("path", { d, fill: "none", stroke, "stroke-width": w, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  return [
    E("circle", { cx: 50, cy: 50, r: 44, fill: "url(#sc-heal)" }),
    arm(INK, 9.5),
    arm("#17a58c", 6.5),
    arm("#a8ffe8", 2.4),
    E("circle", { cx: 50, cy: 50, r: 13, fill: "#e6fff8", ...L(2.6) }),
    E("path", { d: heartD(50, 50.5, 2.1), fill: "#ff5d7a", ...L(2.2) }),
  ];
}

const ITEMS = {
  dagger: () => scaled(1.24, rot(45, daggerUp())),
  sword: () => scaled(1.2, rot(45, swordUp())),
  axe: () => E("g", { transform: "translate(-7 1)" }, scaled(1.12, rot(28, mirror(axeUp())))),
  bolt: () =>
    scroll(
      [
        E("path", { d: BOLT, transform: "translate(50 50) scale(0.72) translate(-50 -50)", fill: "none", stroke: "#ffb000", "stroke-width": 10, opacity: 0.3, "stroke-linejoin": "round" }),
        E("path", { d: BOLT, transform: "translate(50 50) scale(0.72) translate(-50 -50)", fill: "#ffd42a", ...L(3.4) }),
        star4(76, 30, 6, "#fff3a0"),
        star4(24, 62, 5, "#fff3a0"),
      ],
      "#d8263a",
    ),
  healing: () => scroll(E("g", { "clip-path": "url(#sa-sheet)" }, scaled(0.95, vortex())), "#1f9c86"),
};

export const ITEM_KEYS = Object.keys(ITEMS);
export const itemArt = (key) => [ITEMS[key]()].flat(Infinity).join("");

const stops = (list) => list.map(([o, c, op = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${op}"/>`).join("");
const lin = (id, list, a = 'x1="0" y1="0" x2="0" y2="1"') => `<linearGradient id="${id}" ${a}>${stops(list)}</linearGradient>`;
const rad = (id, list, a = "") => `<radialGradient id="${id}" ${a}>${stops(list)}</radialGradient>`;
const ACROSS = 'x1="0" y1="0" x2="1" y2="0"';
export const ITEM_DEFS = [
  lin("we-blade", [[0, "#f8fbfd"], [0.44, "#d2dae1"], [0.5, "#8d99a5"], [0.56, "#b3bec8"], [1, "#6f7b87"]], ACROSS),
  lin("we-gold", [[0, "#fff0a6"], [0.5, "#d99b28"], [1, "#7f520f"]]),
  lin("we-leather", [[0, "#3e2412"], [0.5, "#7a4a28"], [1, "#3e2412"]], ACROSS),
  lin("we-wood", [[0, "#4a2a10"], [0.35, "#b07a44"], [0.7, "#7a4a22"], [1, "#4a2a10"]], ACROSS),
  lin("we-head", [[0, "#eef2f5"], [0.6, "#9aa6b0"], [1, "#5d6873"]], 'x1="0" y1="0" x2="1" y2="1"'),
  lin("we-socket", [[0, "#5d6873"], [0.4, "#b8c2ca"], [1, "#4a545e"]], ACROSS),
  lin("we-edge", [[0, "#ffffff"], [1, "#c9d3db"]], ACROSS),
  rad("we-gem", [[0, "#ffb3bd"], [0.45, "#e2233b"], [1, "#6a0a16"]], 'cx="40%" cy="35%"'),
  rad("sc-heal", [[0, "#b8fff0", 0.8], [0.6, "#46e0b8", 0.35], [1, "#46e0b8", 0]]),
  `<clipPath id="sa-sheet"><path d="${SHEET}"/></clipPath>`,
].join("");
