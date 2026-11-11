// The labyrinth: dungeon tiles drawn as cached SVG symbols, tokens, items, hero standees, move targets,
// the tile being placed, plus pan / zoom. The viewBox follows the labyrinth until the user pans.

import { HERO_FILL } from "./art.js";
import { s } from "./dom.js";

const T = 100;
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const HEALING = new Set(["start", "fountain"]);

export const rotate = (mask, r) => ((mask << r) | (mask >> (4 - r))) & 15;
const hasExit = (mask, d) => (mask >> d) & 1;

function rng(seed) {
  let x = seed * 2654435761 + 1013904223;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 10000) / 10000;
  };
}

// ------------------------------------------------------------------ tile art
function floorShapes(kind, mask) {
  const shapes = [];
  if (kind === "room" || kind === "start") shapes.push({ x: 15, y: 15, w: 70, h: 70, r: 12 });
  else if (kind === "corridor") shapes.push({ x: 33, y: 33, w: 34, h: 34, r: 4 });
  else shapes.push({ x: 17, y: 17, w: 66, h: 66, r: 33 });
  for (let d = 0; d < 4; d++) {
    if (!hasExit(mask, d)) continue;
    if (d === 0) shapes.push({ x: 33, y: -2, w: 34, h: 52 });
    if (d === 2) shapes.push({ x: 33, y: 50, w: 34, h: 52 });
    if (d === 1) shapes.push({ x: 50, y: 33, w: 52, h: 34 });
    if (d === 3) shapes.push({ x: -2, y: 33, w: 52, h: 34 });
  }
  return shapes;
}

const rect = (sh, attrs) => s("rect", { x: sh.x, y: sh.y, width: sh.w, height: sh.h, rx: sh.r || 0, ...attrs });

const FLOOR = { corridor: "#8f877a", room: "#a59c8a", fountain: "#a2a192", portal: "#9d95a6", start: "#cdbd96" };

const INK = "#24160d";
const r1 = (n) => Math.round(n * 10) / 10;
const pol = (r, deg) => [r1(50 + Math.cos((deg * Math.PI) / 180) * r), r1(50 + Math.sin((deg * Math.PI) / 180) * r)];
const loop = (dur, begin = 0) => ({ dur: `${dur}s`, begin: `${begin}s`, repeatCount: "indefinite" });
const pulse = (kids, dur = 2.6, lo = 0.45) => s("g", {}, s("animate", { attributeName: "opacity", values: `1;${lo};1`, ...loop(dur) }), kids);
const ripple = (r0, r, dur, begin) =>
  s(
    "circle",
    { cx: 50, cy: 50, r: r0, fill: "none", stroke: "#e8fdff", "stroke-width": 1.1, opacity: 0 },
    s("animate", { attributeName: "r", values: `${r0};${r}`, ...loop(dur, begin) }),
    s("animate", { attributeName: "opacity", values: "0.75;0", ...loop(dur, begin) }),
  );

const GLYPHS = [
  "M0 -2.6 V2.6 M-2 -1.4 L0 0.4 L2 -1.4",
  "M-2 0 A2 2 0 1 0 2 0 A2 2 0 1 0 -2 0 M0 -0.5 V0.5",
  "M-1.6 2.6 V-2.6 L1.8 -0.8 L-1.6 0.8",
  "M0 -2.8 L2 -0.6 L0 1.4 L-2 -0.6Z M0 1.4 V2.8",
  "M-1.6 -2.4 V2.4 M1.6 -2.4 V2.4 M-1.6 0.8 L1.6 -1",
  "M-2.2 -2.4 L0 0 L-2.2 2.4 M2.2 -2.4 V2.4",
  "M0 2.6 V-0.6 M-2 -2.6 Q0 1 2 -2.6",
  "M-2 -1.6 A2 1.4 0 0 0 2 -1.6 M0 -0.2 V2.6 M-1.4 1.4 H1.4",
];
const runeRing = (n, r) =>
  Array.from({ length: n }, (_, i) => {
    const [x, y] = pol(r, -90 + (360 / n) * i);
    const line = { d: GLYPHS[i % GLYPHS.length], transform: `translate(${x} ${y}) rotate(${r1((360 / n) * i)})`, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" };
    return [s("path", { ...line, stroke: "#46e0b8", "stroke-width": 2.8, opacity: 0.35 }), s("path", { ...line, stroke: "#c8fff0", "stroke-width": 1 })];
  });

// Rune well: healing fountain and the entrance.
function fountainArt() {
  const ring = (r) => s("circle", { cx: 50, cy: 50, r, fill: "none", stroke: "#2b2016", "stroke-width": 1.6, opacity: 0.8 });
  const joints = Array.from({ length: 14 }, (_, i) => {
    const [x1, y1] = pol(16.6, (360 / 14) * i);
    const [x2, y2] = pol(20.6, (360 / 14) * i);
    return s("path", { d: `M${x1} ${y1} L${x2} ${y2}`, stroke: INK, "stroke-width": 0.9, opacity: 0.7 });
  });
  const heart = "M50 53.9 Q43.5 49.5 46.6 46.6 Q48.7 45.3 50 47.9 Q51.3 45.3 53.4 46.6 Q56.5 49.5 50 53.9Z";
  return [
    s("circle", { cx: 50, cy: 50, r: 33, fill: "url(#ft-glow)" }),
    ring(31),
    ring(25),
    pulse(runeRing(10, 28)),
    s("circle", { cx: 51.4, cy: 52, r: 21, fill: "#000", opacity: 0.3 }),
    s("circle", { cx: 50, cy: 50, r: 21, fill: "url(#ft-stone)", stroke: INK, "stroke-width": 2 }),
    joints,
    s("circle", { cx: 50, cy: 50, r: 18.6, fill: "none", stroke: INK, "stroke-width": 0.8, opacity: 0.6 }),
    s("circle", { cx: 50, cy: 50, r: 16.4, fill: "url(#ft-deep)", stroke: INK, "stroke-width": 1.3 }),
    pulse(s("circle", { cx: 50, cy: 50, r: 12, fill: "url(#ft-glow)" }), 3, 0.5),
    ripple(4, 15, 3, 0),
    ripple(4, 15, 3, 1.5),
    s("path", { d: heart, fill: "#ff6b8a", stroke: INK, "stroke-width": 0.8 }),
  ];
}

// Void rift: teleport gate.
const RIFT = "M26 74 L33 62 L31 58 L40 51 L39 46 L47 41 L49 35 L58 31 L61 26 L74 24 L67 31 L68 35 L60 41 L61 46 L52 52 L53 57 L44 63 L44 67 L34 70Z";
const RIFT_STARS = [[34, 66], [40, 58], [45, 50], [52, 45], [57, 38], [63, 31], [69, 27], [48, 55], [55, 42], [37, 63]];
const RIFT_ROCKS = [[27, 40, 3.2], [70, 58, 3.6], [60, 74, 2.6], [36, 30, 2.4]];

function riftArt() {
  const edge = (attrs) => s("path", { d: RIFT, fill: "none", "stroke-linejoin": "round", ...attrs });
  return [
    s("circle", { cx: 50, cy: 50, r: 34, fill: "url(#pt-glow)" }),
    s("path", { d: "M26 74 L18 80 M74 24 L82 18 M33 62 L24 60 M61 26 L66 18 M44 67 L48 76 M68 35 L77 37", fill: "none", stroke: INK, "stroke-width": 1.1, opacity: 0.7 }),
    edge({ stroke: "#c040ff", "stroke-width": 11, opacity: 0.18 }),
    edge({ stroke: "#d060ff", "stroke-width": 6, opacity: 0.35 }),
    edge({ fill: "url(#pt-void)", stroke: INK, "stroke-width": 2.6 }),
    edge({ stroke: "#ff9aff", "stroke-width": 0.9 }),
    RIFT_STARS.map(([x, y], i) =>
      s("circle", { cx: x, cy: y, r: i % 3 ? 0.6 : 0.9, fill: "#fff", opacity: 0.4 }, s("animate", { attributeName: "opacity", values: "0.2;1;0.2", ...loop(1.6 + (i % 4) * 0.5) })),
    ),
    RIFT_ROCKS.map(([x, y, r], i) =>
      s(
        "g",
        {},
        s("animateTransform", { attributeName: "transform", type: "translate", values: "0 0;0 -1.6;0 0", ...loop(2.4 + i * 0.4) }),
        s("ellipse", { cx: x + 2, cy: y + 4.6, rx: r, ry: r * 0.45, fill: "#000", opacity: 0.35 }),
        s("path", {
          d: `M${x - r} ${y} L${x - r * 0.3} ${y - r} L${x + r} ${y - r * 0.4} L${x + r * 0.6} ${y + r * 0.8} L${x - r * 0.5} ${y + r * 0.7}Z`,
          fill: "url(#pt-stone)",
          stroke: INK,
          "stroke-width": 1.2,
        }),
        s("path", { d: `M${x - r * 0.3} ${y - r} L${x + r} ${y - r * 0.4}`, stroke: "#e6a8ff", "stroke-width": 1, opacity: 0.8 }),
      ),
    ),
  ];
}

function tileArt(kind, mask, variant, clipId) {
  const r = rng(mask * 31 + variant * 7 + kind.length * 101);
  const out = [s("rect", { x: 0, y: 0, width: T, height: T, fill: "#3b2a1d" })];
  for (let i = 0; i < 10; i++) {
    const cx = r() * 100;
    const cy = r() * 100;
    const rad = 6 + r() * 12;
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + r() * 0.6;
      const rr = rad * (0.7 + r() * 0.5);
      pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
    }
    out.push(s("polygon", { points: pts.join(" "), fill: r() < 0.5 ? "#2d1f15" : "#46332a", opacity: 0.85 }));
  }
  const shapes = floorShapes(kind, mask);
  // Walls: a thick brick band around the floor, then a dark outline, then the floor on top.
  out.push(s("g", {}, shapes.map((sh) => rect(sh, { fill: "none", stroke: "#6a4c35", "stroke-width": 16 }))));
  out.push(s("g", {}, shapes.map((sh) => rect(sh, { fill: "none", stroke: "#3f2c1f", "stroke-width": 16, "stroke-dasharray": "7 3" }))));
  out.push(s("g", {}, shapes.map((sh) => rect(sh, { fill: "none", stroke: "#1b110a", "stroke-width": 4 }))));
  out.push(s("clipPath", { id: clipId }, shapes.map((sh) => rect(sh, {}))));
  const floor = [s("rect", { x: 0, y: 0, width: T, height: T, fill: FLOOR[kind] })];
  const rowH = kind === "room" || kind === "start" ? 13 : 11;
  for (let row = 0, y = 0; y < 100; row++, y += rowH) {
    let x = (row % 2) * -9 - r() * 6;
    while (x < 100) {
      const w = 14 + r() * 12;
      const shade = r();
      floor.push(
        s("rect", {
          x: x + 1,
          y: y + 1,
          width: w - 2,
          height: rowH - 2,
          rx: 2,
          fill: shade < 0.33 ? "#000" : "#fff",
          opacity: shade < 0.33 ? 0.08 + r() * 0.07 : 0.05 + r() * 0.08,
          stroke: "#2b2016",
          "stroke-opacity": 0.35,
          "stroke-width": 1.2,
        }),
      );
      x += w;
    }
  }
  floor.push(s("rect", { x: 0, y: 0, width: T, height: T, fill: "url(#g-fog)" }));
  out.push(s("g", { "clip-path": `url(#${clipId})` }, floor));
  if (kind === "room") {
    for (let d = 0; d < 4; d++) {
      if (hasExit(mask, d) || r() < 0.35) continue;
      const tx = [50, 84, 50, 16][d];
      const ty = [16, 50, 84, 50][d];
      out.push(s("circle", { cx: tx, cy: ty, r: 16, fill: "url(#g-torch)" }));
      out.push(s("rect", { x: tx - 2.5, y: ty - 2.5, width: 5, height: 5, fill: "#2b1a0e" }));
      out.push(s("path", { d: `M${tx} ${ty - 1} q-3 -5 0 -9 q3 4 0 9z`, fill: "#ffd54a" }));
    }
  }
  if (HEALING.has(kind)) out.push(...fountainArt());
  if (kind === "portal") out.push(...riftArt());
  if (kind === "corridor" && variant === 2) {
    out.push(s("path", { d: "M40 58 l10 4 M42 63 l7 -6", stroke: "#e9dfc6", "stroke-width": 2.5, "stroke-linecap": "round" }));
    out.push(s("circle", { cx: 57, cy: 44, r: 3.5, fill: "#e9dfc6", stroke: "#2b2016", "stroke-width": 1 }));
  }
  out.push(s("rect", { x: 0.5, y: 0.5, width: T - 1, height: T - 1, fill: "none", stroke: "#120a05", "stroke-width": 1.5, opacity: 0.8 }));
  return out;
}

// Where items left on a tile lie: room corners, otherwise the open corridor arms (corners there are wall).
const ARM_SPOTS = [[0, -31], [31, 0], [0, 31], [-31, 0]];
function itemSpots(kind, exits) {
  if (kind === "room" || kind === "start") return [[-25, 25], [25, 25], [-25, -25], [25, -25], [0, 29]];
  return [...ARM_SPOTS.filter((_, d) => hasExit(exits, d)), [-22, 22], [22, 22], [-22, -22], [22, -22]];
}

// ------------------------------------------------------------------ board
export class Board {
  constructor({ onAct, onTile } = {}) {
    this.onAct = onAct;
    this.onTile = onTile;
    this.symbols = new Set();
    this.defs = s("defs", {});
    this.layers = {
      tiles: s("g", { class: "l-tiles" }),
      marks: s("g", { class: "l-marks" }),
      tokens: s("g", { class: "l-tokens" }),
      heroes: s("g", { class: "l-heroes" }),
      ghost: s("g", { class: "l-ghost" }),
    };
    this.svg = s("svg", { class: "board-svg", xmlns: "http://www.w3.org/2000/svg" }, this.defs, Object.values(this.layers));
    for (const hero of ["warrior", "thief", "wizard", "warlock", "swordsman", "oracle"]) {
      this.defs.append(s("clipPath", { id: `clip-${hero}` }, s("circle", { cx: 0, cy: 0, r: 15 })));
    }
    this.el = this.svg;
    this.tileEls = new Map();
    this.tokenEls = new Map();
    this.heroEls = new Map();
    this.view = { x: -250, y: -250, w: 500, h: 500 };
    this.auto = true;
    this.bounds = null;
    this.ghostRot = 0;
    this._gestures();
    new ResizeObserver(() => this.auto && this.fit()).observe(this.svg);
  }

  symbol(kind, mask, variant) {
    const id = `t-${kind}-${mask}-${variant}`;
    if (!this.symbols.has(id)) {
      this.symbols.add(id);
      this.defs.append(s("symbol", { id, viewBox: "0 0 100 100" }, tileArt(kind, mask, variant, `c-${id}`)));
    }
    return id;
  }

  // ---------------------------------------------------------------- view
  applyView() {
    const v = this.view;
    this.svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
  }

  fit() {
    const b = this.bounds;
    if (!b) return;
    const rect = this.svg.getBoundingClientRect();
    const aspect = rect.width && rect.height ? rect.width / rect.height : 1.4;
    const pad = 0.75 * T;
    let w = (b.maxX - b.minX + 1) * T + 2 * pad;
    let hgt = (b.maxY - b.minY + 1) * T + 2 * pad;
    w = Math.max(w, 5 * T);
    hgt = Math.max(hgt, 3.6 * T);
    if (w / hgt > aspect) hgt = w / aspect;
    else w = hgt * aspect;
    const cx = ((b.minX + b.maxX + 1) / 2) * T;
    const cy = ((b.minY + b.maxY + 1) / 2) * T;
    this.view = { x: cx - w / 2, y: cy - hgt / 2, w, h: hgt };
    this.applyView();
  }

  resetView() {
    this.auto = true;
    this.fit();
  }

  zoomAt(factor, clientX, clientY) {
    const rect = this.svg.getBoundingClientRect();
    const v = this.view;
    const px = clientX == null ? 0.5 : (clientX - rect.left) / rect.width;
    const py = clientY == null ? 0.5 : (clientY - rect.top) / rect.height;
    const w = Math.min(60 * T, Math.max(2.2 * T, v.w / factor));
    const hgt = (w * v.h) / v.w;
    this.view = { x: v.x + (v.w - w) * px, y: v.y + (v.h - hgt) * py, w, h: hgt };
    this.auto = false;
    this.applyView();
  }

  _gestures() {
    const svg = this.svg;
    let drag = null;
    svg.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
      },
      { passive: false },
    );
    svg.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, view: { ...this.view }, moved: false, id: e.pointerId };
    });
    svg.addEventListener("pointermove", (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      if (!drag.moved) svg.setPointerCapture(e.pointerId);
      drag.moved = true;
      const rect = svg.getBoundingClientRect();
      const k = drag.view.w / rect.width;
      this.view = { ...drag.view, x: drag.view.x - dx * k, y: drag.view.y - dy * k };
      this.auto = false;
      this.applyView();
    });
    const end = (e) => {
      if (!drag) return;
      const wasDrag = drag.moved;
      drag = null;
      if (wasDrag) return;
      const target = e.target.closest?.("[data-act]");
      if (target) this.onAct?.(JSON.parse(target.dataset.act), e);
      else {
        const tile = e.target.closest?.("[data-tile]");
        if (tile) this.onTile?.(JSON.parse(tile.dataset.tile), e);
      }
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", () => (drag = null));
  }

  // ---------------------------------------------------------------- render
  update(game, seats, { me = null, legal = [], hint = null, fresh = new Set() } = {}) {
    const tiles = game.tiles;
    const byPos = new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));
    let minX = 0;
    let maxX = 0;
    let minY = 0;
    let maxY = 0;
    for (const t of tiles) {
      minX = Math.min(minX, t.x);
      maxX = Math.max(maxX, t.x);
      minY = Math.min(minY, t.y);
      maxY = Math.max(maxY, t.y);
    }
    if (game.pending) {
      minX = Math.min(minX, game.pending.x);
      maxX = Math.max(maxX, game.pending.x);
      minY = Math.min(minY, game.pending.y);
      maxY = Math.max(maxY, game.pending.y);
    }
    const nb = { minX, maxX, minY, maxY };
    const grew = !this.bounds || JSON.stringify(nb) !== JSON.stringify(this.bounds);
    this.bounds = nb;

    // tiles (kept; only new ones are added so they can animate in)
    for (const t of tiles) {
      if (this.tileEls.has(t.id)) continue;
      const id = this.symbol(t.kind, t.exits, t.id % 3);
      const g = s(
        "g",
        { class: "tile", transform: `translate(${t.x * T} ${t.y * T})`, "data-tile": JSON.stringify([t.x, t.y]) },
        s("use", { href: `#${id}`, width: T, height: T, class: fresh.has(t.id) ? "fresh" : "" }),
      );
      this.layers.tiles.append(g);
      this.tileEls.set(t.id, g);
    }
    if (tiles.length < this.tileEls.size) {
      this.layers.tiles.replaceChildren();
      this.layers.tokens.replaceChildren();
      this.tileEls.clear();
      this.tokenEls.clear();
      return this.update(game, seats, { me, legal, hint, fresh });
    }

    // tokens and floor items: one group per tile, kept while unchanged so nothing re-animates
    const seen = new Set();
    const firstDraw = this.tokenEls.size === 0;
    for (const t of tiles) {
      if (!t.token && !t.items.length) continue;
      const key = `${t.id}|${t.token || ""}|${t.items.join(",")}`;
      seen.add(key);
      if (this.tokenEls.has(key)) continue;
      const parts = [];
      if (t.token) parts.push(tokenEl(t.token, game.monsters?.[t.token]));
      const spots = itemSpots(t.kind, t.exits);
      t.items.forEach((item, i) => {
        const [ox, oy] = spots[i % spots.length];
        parts.push(
          s(
            "g",
            { class: "floor-item", transform: `translate(${ox} ${oy})` },
            s("circle", { r: 16, cy: 2.5, fill: "#000", opacity: 0.45 }),
            s("circle", { r: 15, fill: "url(#g-token)", stroke: "#f2c230", "stroke-width": 3 }),
            s("circle", { r: 17.1, fill: "none", stroke: "#1a0f08", "stroke-width": 1.4 }),
            s("use", { href: `#item-${item}`, x: -11.5, y: -11.5, width: 23, height: 23 }),
          ),
        );
      });
      const g = s("g", { transform: `translate(${t.x * T + 50} ${t.y * T + 50})` }, s("g", { class: firstDraw ? "" : "pop" }, parts));
      this.layers.tokens.append(g);
      this.tokenEls.set(key, g);
    }
    for (const [key, g] of this.tokenEls) {
      if (seen.has(key)) continue;
      g.remove();
      this.tokenEls.delete(key);
    }

    // move targets
    const marks = [];
    const mySeat = me;
    const pos = mySeat != null ? game.players[mySeat] : null;
    for (const a of legal) {
      if (!pos) break;
      if (a.type === "move" || a.type === "explore") {
        const x = pos.x + DX[a.dir];
        const y = pos.y + DY[a.dir];
        const hinted = hint && hint.type === a.type && hint.dir === a.dir;
        if (a.type === "explore") {
          marks.push(
            s(
              "g",
              { class: `spot explore ${hinted ? "hint" : ""}`, transform: `translate(${x * T} ${y * T})`, "data-act": JSON.stringify(a) },
              s("use", { href: "#tile-back", x: 6, y: 6, width: T - 12, height: T - 12, opacity: 0.92 }),
              s("rect", { x: 4, y: 4, width: T - 8, height: T - 8, rx: 6, class: "spot-ring" }),
              s("text", { x: 50, y: 40, "text-anchor": "middle", class: "spot-q" }, "?"),
            ),
          );
        } else {
          const t = byPos.get(`${x},${y}`);
          const danger = t && t.token && t.token !== "chest";
          marks.push(
            s(
              "g",
              { class: `spot move ${danger ? "danger" : ""} ${hinted ? "hint" : ""}`, transform: `translate(${x * T} ${y * T})`, "data-act": JSON.stringify(a) },
              s("rect", { x: 3, y: 3, width: T - 6, height: T - 6, rx: 8, class: "spot-ring" }),
            ),
          );
        }
      } else if (a.type === "teleport") {
        const hinted = hint && hint.type === "teleport" && hint.to[0] === a.to[0] && hint.to[1] === a.to[1];
        marks.push(
          s(
            "g",
            { class: `spot teleport ${hinted ? "hint" : ""}`, transform: `translate(${a.to[0] * T} ${a.to[1] * T})`, "data-act": JSON.stringify(a) },
            s("rect", { x: 3, y: 3, width: T - 6, height: T - 6, rx: 8, class: "spot-ring" }),
          ),
        );
      } else if (a.type === "reincarnate" || a.type === "cast_healing") {
        marks.push(
          s(
            "g",
            { class: "spot fountain", transform: `translate(${a.at[0] * T} ${a.at[1] * T})`, "data-act": JSON.stringify(a) },
            s("rect", { x: 3, y: 3, width: T - 6, height: T - 6, rx: 8, class: "spot-ring" }),
          ),
        );
      }
    }
    if (game.combat) {
      const c = game.combat;
      marks.push(s("rect", { x: c.x * T + 2, y: c.y * T + 2, width: T - 4, height: T - 4, rx: 8, class: "combat-ring" }));
    }
    this.layers.marks.replaceChildren(...marks);

    this._ghost(game, legal, mySeat);
    this._heroes(game, seats);
    if (this.auto && grew) this.fit();
    else if (this.auto && !this.svg.getAttribute("viewBox")) this.fit();
  }

  _ghost(game, legal, mySeat) {
    const p = game.pending;
    if (!p) {
      this.layers.ghost.replaceChildren();
      this.ghostKey = null;
      return;
    }
    const key = `${p.x},${p.y},${p.mask}`;
    if (this.ghostKey !== key) {
      this.ghostKey = key;
      this.ghostRot = 0;
    }
    const mine = legal.some((a) => a.type === "place");
    const rot = p.rotations[this.ghostRot % p.rotations.length];
    const mask = rotate(p.mask, rot);
    const id = this.symbol(p.kind, mask, 0);
    const x = p.x * T;
    const y = p.y * T;
    const byPos = new Map(game.tiles.map((t) => [`${t.x},${t.y}`, t]));
    const kids = [s("use", { href: `#${id}`, x, y, width: T, height: T, class: "ghost-tile" })];
    // Every open passage glows from the centre to its edge: green where it joins a neighbour, gold into the
    // unknown, red where it runs into a neighbour's wall.
    for (let d = 0; d < 4; d++) {
      if (!hasExit(mask, d)) continue;
      const nb = byPos.get(`${p.x + DX[d]},${p.y + DY[d]}`);
      const cls = !nb ? "open" : hasExit(nb.exits, (d + 2) % 4) ? "joins" : "blocked";
      const ex = x + 50 + DX[d] * 50;
      const ey = y + 50 + DY[d] * 50;
      kids.push(s("line", { x1: x + 50, y1: y + 50, x2: ex - DX[d] * 4, y2: ey - DY[d] * 4, class: `ghost-way ${cls}` }));
      const tip = `M${ex} ${ey} l${-DX[d] * 12 - DY[d] * 9} ${-DY[d] * 12 - DX[d] * 9} l${DY[d] * 18} ${DX[d] * 18}Z`;
      kids.push(s("path", { d: tip, class: `ghost-tip ${cls}` }));
    }
    kids.push(s("rect", { x: x + 1, y: y + 1, width: T - 2, height: T - 2, rx: 4, class: "ghost-ring" }));
    if (mine && p.rotations.length > 1) {
      kids.push(s("rect", { x, y, width: T, height: T, class: "ghost-hit", "data-act": JSON.stringify({ type: "_rotate", by: 1 }) }));
    }
    this.layers.ghost.replaceChildren(...kids);
  }

  rotateGhost(by, game) {
    const p = game.pending;
    if (!p) return;
    this.ghostRot = (this.ghostRot + by + p.rotations.length) % p.rotations.length;
  }

  ghostRotation(game) {
    const p = game.pending;
    return p ? p.rotations[this.ghostRot % p.rotations.length] : 0;
  }

  _heroes(game, seats) {
    const groups = new Map();
    game.players.forEach((p, seat) => {
      const k = `${p.x},${p.y}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(seat);
    });
    const OFF = {
      1: [[0, 0]],
      2: [[-17, 0], [17, 0]],
      3: [[-17, -10], [17, -10], [0, 16]],
      4: [[-17, -17], [17, -17], [-17, 17], [17, 17]],
      5: [[-20, -18], [20, -18], [0, 0], [-20, 18], [20, 18]],
    };
    const tokenHere = new Set(game.tiles.filter((t) => t.token).map((t) => `${t.x},${t.y}`));
    game.players.forEach((p, seat) => {
      const k = `${p.x},${p.y}`;
      const group = groups.get(k);
      let [ox, oy] = OFF[group.length][group.indexOf(seat)];
      if (tokenHere.has(k)) {
        ox = ox * 0.6 + 26;
        oy = oy * 0.6 - 26;
      }
      let el = this.heroEls.get(seat);
      const color = seats[seat]?.color || "stone";
      if (!el || el.dataset.hero !== p.hero) {
        el?.remove();
        const [light, dark] = HERO_FILL[color];
        el = s(
          "g",
          { class: "hero-pawn", "data-hero": p.hero, "data-seat": seat },
          s("ellipse", { cx: 0, cy: 16, rx: 15, ry: 5, fill: "#000", opacity: 0.45 }),
          s("circle", { r: 19, class: "pawn-glow" }),
          s("circle", { r: 18, fill: dark, stroke: "#1a0f08", "stroke-width": 2 }),
          s("circle", { r: 15.5, fill: light }),
          s("g", { "clip-path": `url(#clip-${p.hero})` }, s("use", { href: `#hero-${p.hero}`, x: -15.5, y: -15.5, width: 31, height: 31 })),
          s("circle", { r: 15.5, fill: "none", stroke: "#fff7dc", "stroke-width": 1.5, opacity: 0.6 }),
          s("g", { class: "pawn-curse", transform: "translate(13 -13)" }, s("use", { href: "#misc-curse", x: -8, y: -8, width: 16, height: 16 })),
          s("text", { class: "pawn-ko", x: 0, y: 6, "text-anchor": "middle" }, "💫"),
        );
        this.layers.heroes.append(el);
        this.heroEls.set(seat, el);
      }
      el.style.transform = `translate(${p.x * T + 50 + ox}px, ${p.y * T + 50 + oy}px)`;
      el.classList.toggle("current", game.current === seat);
      el.classList.toggle("cursed", game.cursed === seat);
      el.classList.toggle("ko", p.knocked_out);
    });
    for (const [seat, el] of this.heroEls) {
      if (seat >= game.players.length) {
        el.remove();
        this.heroEls.delete(seat);
      }
    }
  }

  // Center the view on a tile without changing the zoom (keeps auto-follow off). Without `center` it only
  // moves when the tile is near the edge; with it, whenever the tile is outside the middle of the view.
  focus(x, y, center = false) {
    const v = this.view;
    const cx = x * T + 50;
    const cy = y * T + 50;
    const mx = center ? v.w * 0.3 : T;
    const my = center ? v.h * 0.3 : T;
    if (cx > v.x + mx && cx < v.x + v.w - mx && cy > v.y + my && cy < v.y + v.h - my) return;
    if (this.auto) return this.fit();
    this.view = { ...v, x: cx - v.w / 2, y: cy - v.h / 2 };
    this.applyView();
  }
}

function tokenEl(token, monster) {
  if (token === "chest") {
    return s(
      "g",
      { class: "board-token chest" },
      s("circle", { r: 24, fill: "url(#g-token)", stroke: "#6a4316", "stroke-width": 3 }),
      s("use", { href: "#misc-chest", x: -18, y: -18, width: 36, height: 36 }),
    );
  }
  const dragon = token === "dragon";
  const r = dragon ? 30 : 25;
  return s(
    "g",
    { class: `board-token monster ${dragon ? "dragon" : ""}` },
    s("circle", { r: r + 2, fill: "#000", opacity: 0.4, cy: 3 }),
    dragon ? s("circle", { r: r + 5, fill: "#ff5a1e", opacity: 0.35 }) : null,
    s("use", { href: `#mon-${token}`, x: -r, y: -r, width: r * 2, height: r * 2 }),
    s("circle", { r, fill: "none", stroke: "#8a2a14", "stroke-width": 3 }),
    s(
      "g",
      { transform: `translate(0 ${r - 2})` },
      s("path", { d: "M-11 -8 H11 V2 Q11 9 0 13 Q-11 9 -11 2Z", fill: "#a3211a", stroke: "#f2d27a", "stroke-width": 2 }),
      s("text", { y: 5.5, "text-anchor": "middle", class: "str" }, monster ? monster.strength : ""),
    ),
  );
}
