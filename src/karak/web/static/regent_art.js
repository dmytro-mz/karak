// Karak: Regent artwork. The five busts and the arena live in regent_portraits.js; this file adds the Lord of
// Karak, the bat and the ice mage (round tokens), the thorn and frost spells (scrolls) and the cursed chamber.
// Every design here was approved one by one. Original drawings, in the same style as the base game's art.

import { s } from "./dom.js";
import { E, L, scroll, star4 } from "./items.js";
import { INK, NECK, SH, heroKit, mirrorAll, monsterKit, skull, sockets, tools } from "./portraits.js";
import { RAW_HERO_KEYS, arenaTileArt, frostFistArt, rawHeroArt } from "./regent_portraits.js";
import { SIDHAR_HERO_KEYS, sidharHeroArt } from "./sidhar_portraits.js";

const mir = (d) => mirrorAll(d);
const wrapPal = (pal) => Object.fromEntries(Object.entries(pal).map(([n, v]) => [n, [v]]));
const glowEye = (x, y, c) =>
  `<ellipse cx="${x}" cy="${y}" rx="7" ry="7" fill="${c}" opacity="0.3"/><circle cx="${x}" cy="${y}" r="3.4" fill="${c}"/><circle cx="${x}" cy="${y}" r="1.2" fill="#fff"/>`;

// ------------------------------------------------------------------ heroes
const LORD_PAL = { bone: "#d9d2e8", robe: "#4a1f63", robeDk: "#1f0a2e", crown: "#d4ad4f", gem: "#9cff6b", socket: "#120816", aura: "#c77dff" };

// The Lord of Karak: a spectral crowned skull king in violet robes with green-fire eyes.
const lordArt = (k, t) => [
  `<circle cx="50" cy="48" r="46" fill="#c77dff" opacity="0.18"/><circle cx="50" cy="48" r="36" fill="#c77dff" opacity="0.2"/>`,
  t.p("M10 100 L4 56 L32 80Z M90 100 L96 56 L68 80Z", "robeDk"),
  t.p(SH, "robe"),
  t.p("M30 72 L40 84 L50 74 L60 84 L70 72 L70 100 L30 100Z", "robeDk", 0.8),
  t.p("M44 70 H56 V80 L50 86 L44 80Z", "crown", 0.7), t.c(50, 78, 2.4, "gem", 0.5),
  t.p(NECK, "bone"),
  ...skull(k, t, { y: -4 }),
  glowEye(42, 44, "#9cff6b"), glowEye(58, 44, "#9cff6b"),
  t.p("M29 36 L30 12 L40 24 L50 8 L60 24 L70 12 L71 36Z", "crown"),
  t.c(50, 24, 2.6, "gem", 0.6), t.c(37, 30, 1.8, "gem", 0), t.c(63, 30, 1.8, "gem", 0),
  t.ln("M30 36 H71", 0.8),
];

export const HERO_ART_KEYS = [...RAW_HERO_KEYS, ...SIDHAR_HERO_KEYS, "lord"];
export function regentHeroArt(key) {
  if (key === "lord") {
    const k = heroKit();
    return lordArt(k, tools(k, wrapPal(LORD_PAL))).join("");
  }
  if (SIDHAR_HERO_KEYS.includes(key)) return sidharHeroArt(key);
  return rawHeroArt(key);
}

// ------------------------------------------------------------------ monsters
const BAT_PAL = { fur: "#4a3a52", furDk: "#2d2236", wing: "#6a4a78", ear: "#c98aa5", fang: "#f6ecd4", nose: "#d86a8a" };
const MAGE_PAL = { bone: "#efe6cf", hood: "#3b6fa8", hoodDk: "#1f3f6a", ice: "#9be7ff", iceDk: "#4aa8d8", socket: "#0d1b2a", wood: "#7a4a22" };
const wingBones = (t) => t.ln("M50 52 L8 26 M50 54 L10 50 M50 58 L24 64", 0.5) + t.ln(mir("M50 52 L8 26 M50 54 L10 50 M50 58 L24 64"), 0.5);

const MONSTER = {
  // wings spread, fangs bared, front view
  bat: [
    BAT_PAL,
    (k, t) => {
      const wing = "M50 50 Q30 20 4 24 Q14 36 8 50 Q18 48 22 62 Q32 56 40 66 Q46 60 50 62Z";
      return [
        t.p(wing, "wing"), t.p(mir(wing), "wing"), wingBones(t),
        t.p("M38 36 L32 12 L49 29Z", "fur"), t.p(mir("M38 36 L32 12 L49 29Z"), "fur"),
        t.p("M38 30 L35 18 L44 28Z", "ear", 0), t.p(mir("M38 30 L35 18 L44 28Z"), "ear", 0),
        t.e(50, 49, 17, 16, "fur"),
        k.shade("M58 36 Q68 44 66 54 Q62 62 54 64 Q60 52 58 36Z"),
        t.e(50, 58, 9, 6.5, "furDk", 0.8), t.e(50, 54.5, 3, 2, "nose", 0),
        t.p("M44 61 l2.4 9 l2.6 -8Z M51 62 l2.6 9 l2.4 -9Z", "fang", 0.5),
        k.eyes([{ x: 42, y: 46, r: 3.6, type: "slit" }, { x: 58, y: 46, r: 3.6, type: "slit" }]),
        t.ln("M36 40 L46 44 M64 40 L54 44", 1.1),
      ];
    },
  ],
  // a skeleton in a blue hood with a crystal staff
  icemage: [
    MAGE_PAL,
    (k, t) => [
      t.bar(84, 100, 78, 24, 4.6, "wood"),
      k.glow(76, 22, 13, t.F("ice")),
      t.p("M76 6 L84 20 L76 36 L68 20Z", "ice"), t.ln("M76 6 V36 M68 20 H84", 0.4),
      t.p("M14 100 Q18 80 34 75 H66 Q82 80 86 100Z", "hoodDk"),
      t.p("M22 96 Q16 32 50 16 Q84 32 78 96 Q68 80 50 80 Q32 80 22 96Z", "hood"),
      k.shade("M62 20 Q82 32 78 96 Q74 86 68 80 Q72 50 62 20Z"),
      t.p("M30 54 Q30 30 50 28 Q70 30 70 54 Q70 70 50 76 Q30 70 30 54Z", "socket"),
      ...skull(k, t, { y: 2 }),
      sockets(k, "#7fe0ff", 2),
      t.p("M28 28 L24 12 L36 22Z M72 28 L76 12 L64 22Z M44 22 L50 6 L56 22Z", "ice", 0.7),
      t.p("M36 76 L38 90 L42 77Z M48 78 L50 94 L53 78Z M58 77 L62 90 L64 76Z", "ice", 0.6),
    ],
  ],
};
export const MONSTER_ART_KEYS = Object.keys(MONSTER);
export function regentMonsterArt(key) {
  const [pal, draw] = MONSTER[key];
  const k = monsterKit();
  const art = draw(k, tools(k, wrapPal(pal))).join("");
  return `<g clip-path="url(#clip-disc)"><circle cx="50" cy="50" r="50" fill="url(#mb-fierce)"/>${art}<rect width="100" height="100" fill="url(#mb-under)"/><rect width="100" height="100" fill="url(#mb-top)"/></g>`;
}

// ------------------------------------------------------------------ items (spells are scrolls with a wax seal)
const ITEM = {
  // a black thorny vine with a bleeding tip, violet seal
  thorn: () =>
    scroll(
      [
        E("path", { d: "M34 74 Q24 54 44 46 Q64 38 54 24 Q50 20 62 22", fill: "none", stroke: "#b25cff", "stroke-width": 9, opacity: 0.3, "stroke-linecap": "round" }),
        E("path", { d: "M34 74 Q24 54 44 46 Q64 38 54 24 Q50 20 62 22", fill: "none", stroke: "#1a0f24", "stroke-width": 5, "stroke-linecap": "round" }),
        E("path", { d: "M30 62 L24 58 L32 56Z M44 47 L40 38 L49 43Z M56 40 L66 38 L60 46Z M56 28 L46 26 L54 34Z", fill: "#1a0f24", ...L(1.4) }),
        E("circle", { cx: 62, cy: 22, r: 3.2, fill: "#ff3b5c", ...L(1.4) }),
        star4(70, 60, 5, "#e7c6ff"),
      ],
      "#7a2cc0",
    ),
  // a white fist with jagged frost bolts
  frost: () => scroll(E("g", { transform: "translate(50 50) scale(0.6) translate(-50 -50)" }, frostFistArt()), "#2a7ec0"),
};
export const ITEM_ART_KEYS = Object.keys(ITEM);
export const regentItemArt = (key) => [ITEM[key]()].flat(Infinity).join("");

// ------------------------------------------------------------------ tiles (drawn on top of the tile's floor, 100×100)
const ring = (cx, cy, r, attrs) => s("circle", { cx, cy, r, fill: "none", ...attrs });
// Cursed chamber: a glowing violet pentagram with a skull and green flames.
function cursedTile() {
  const pts = Array.from({ length: 5 }, (_, i) => [50 + Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / 5) * 25, 50 + Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / 5) * 25]);
  const star = [0, 2, 4, 1, 3, 0].map((i) => pts[i].map((v) => v.toFixed(1)).join(" ")).join(" L");
  return [
    s("circle", { cx: 50, cy: 50, r: 32, fill: "#c77dff", opacity: 0.22 }),
    ring(50, 50, 26, { stroke: INK, "stroke-width": 3.6 }),
    ring(50, 50, 26, { stroke: "#b25cff", "stroke-width": 1.8 }),
    s("path", { d: `M${star}Z`, fill: "none", stroke: INK, "stroke-width": 4.4, "stroke-linejoin": "round" }),
    s("path", { d: `M${star}Z`, fill: "none", stroke: "#d6a0ff", "stroke-width": 1.8, "stroke-linejoin": "round" }),
    ...pts.map(([x, y]) => [s("circle", { cx: x, cy: y, r: 5, fill: "#9cff6b", opacity: 0.35 }), s("path", { d: `M${x} ${y + 2} q-3.4 -4 0 -9 q3.4 5 0 9z`, fill: "#9cff6b", stroke: INK, "stroke-width": 0.9 })]).flat(),
    s("path", { d: "M42 49 Q42 41 50 41 Q58 41 58 49 Q58 54 55 55 V58 H45 V55 Q42 54 42 49Z", fill: "#efe6cf", stroke: INK, "stroke-width": 1.8 }),
    s("circle", { cx: 46.6, cy: 49, r: 2.4, fill: "#2b2117" }), s("circle", { cx: 53.4, cy: 49, r: 2.4, fill: "#2b2117" }),
    s("circle", { cx: 46.6, cy: 49, r: 1, fill: "#9cff6b" }), s("circle", { cx: 53.4, cy: 49, r: 1, fill: "#9cff6b" }),
  ];
}
const arenaTile = () => {
  const g = s("g");
  g.innerHTML = arenaTileArt();
  return [g];
};
export const regentTileArt = (kind) => (kind === "arena" ? arenaTile() : cursedTile());

// ------------------------------------------------------------------ install
export function installRegentArt(defsParent) {
  const add = (id, markup) => {
    const el = s("symbol", { id, viewBox: "0 0 100 100" });
    el.innerHTML = markup;
    defsParent.append(el);
  };
  for (const key of HERO_ART_KEYS) add(`hero-${key}`, regentHeroArt(key));
  for (const key of MONSTER_ART_KEYS) add(`mon-${key}`, regentMonsterArt(key));
  for (const key of ITEM_ART_KEYS) add(`item-${key}`, regentItemArt(key));
}
