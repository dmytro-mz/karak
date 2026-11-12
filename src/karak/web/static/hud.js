// Board corner counters: the face-down tile pile and the bag of room tokens, each opening a popup with
// exactly what is left.

import { token } from "./art.js";
import { h } from "./dom.js";

const svgOf = (size, body) => {
  const t = document.createElement("template");
  t.innerHTML = `<svg class="art" width="${size}" height="${size}" viewBox="0 0 60 60">${body}</svg>`;
  return t.content.firstElementChild;
};

export function stackIcon(size) {
  const parts = [];
  for (let i = 2; i >= 1; i--) {
    parts.push(`<rect x="${8 + i * 3}" y="${14 - i * 3.4}" width="40" height="40" rx="4" fill="#3a2516" stroke="#c9a64a" stroke-width="1.6"/>`);
    parts.push(`<rect x="${8 + i * 3}" y="${51.5 - i * 3.4}" width="40" height="3" fill="#1a0f08" opacity="0.5"/>`);
  }
  parts.push(`<rect x="7" y="13.5" width="42" height="42" rx="4.5" fill="#1a0f08"/>`);
  parts.push(`<svg x="8" y="14.5" width="40" height="40" viewBox="0 0 100 100"><use href="#tile-back"/></svg>`);
  return svgOf(size, parts.join(""));
}

// A leather pouch that deflates as it empties; red eyes peek out while tokens remain.
export function bagIcon(size, fullness = 1, eyes = true) {
  const sy = (0.62 + 0.38 * Math.max(0, Math.min(1, fullness))).toFixed(2);
  return svgOf(
    size,
    `<g transform="translate(30 56) scale(1 ${sy}) translate(-30 -56)">
      <ellipse cx="30" cy="55" rx="19" ry="3" fill="#000" opacity="0.4"/>
      <path d="M22 20 Q8 28 8 41 Q8 55 30 55 Q52 55 52 41 Q52 28 38 20Z" fill="url(#g-pouch)" stroke="#24160d" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M16 34 Q14 42 19 48" fill="none" stroke="#e0a868" stroke-width="2" opacity="0.6" stroke-linecap="round"/>
      <path d="M24 38 l2 3 m6 -3 l2 3 m-14 6 l2 3 m14 -3 l2 3" stroke="#4a2a10" stroke-width="1.2" opacity="0.7"/>
    </g>
    <path d="M22 20 Q17 13 21 8 Q30 12 39 8 Q43 13 38 20Z" fill="#9a5e2c" stroke="#24160d" stroke-width="2.2" stroke-linejoin="round"/>
    <ellipse cx="30" cy="10" rx="8.5" ry="2.6" fill="#1a0f08"/>
    ${eyes ? `<circle cx="27" cy="10" r="1.2" fill="#ff5a3c"/><circle cx="33" cy="10" r="1.2" fill="#ff5a3c"/>` : ""}
    <path d="M20 20 Q30 24 40 20" fill="none" stroke="#24160d" stroke-width="4.6" stroke-linecap="round"/>
    <path d="M20 20 Q30 24 40 20" fill="none" stroke="#e0ad38" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M38 21 Q44 26 42 32 M40 21 Q47 24 47 29" fill="none" stroke="#e0ad38" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="42" cy="33" r="1.8" fill="#e0ad38" stroke="#24160d" stroke-width="0.8"/><circle cx="47" cy="30" r="1.8" fill="#e0ad38" stroke="#24160d" stroke-width="0.8"/>`,
  );
}

const BAG_TOTAL = 53;
const urgency = (n) => (n === 0 ? "empty" : n <= 5 ? "crit" : n <= 15 ? "low" : "");

// Without the breakdown (table setting off) the counters are plain badges, not buttons.
function counter(cls, title, open, icon, n) {
  const attrs = open ? { class: `hud-btn ${cls}`, title, onclick: (e) => open(e.currentTarget) } : { class: `hud-btn static ${cls}`, title };
  return h(open ? "button" : "div", attrs, icon, h("span", { class: "num" }, n));
}

export function renderHud(el, g, { onTiles, onBag }) {
  const tiles = g.pile
    ? counter(urgency(g.pile_left), "Tile pile: what is left to explore", onTiles, stackIcon(42), g.pile_left)
    : counter(urgency(g.pile_left), `${g.pile_left} tiles left in the pile`, null, stackIcon(42), g.pile_left);
  const bagCls = g.bag_left ? "" : "empty";
  const bag = g.bag
    ? counter(bagCls, "The bag: monsters and chests still hidden", onBag, bagIcon(42, g.bag_left / BAG_TOTAL, g.bag_left > 0), g.bag_left)
    : counter(bagCls, `${g.bag_left} tokens left in the bag`, null, bagIcon(42, g.bag_left / BAG_TOTAL, g.bag_left > 0), g.bag_left);
  el.replaceChildren(tiles, bag);
}

const SHAPE_PATHS = { straight: "M7 1 V13", corner: "M7 1 V7 H13", tee: "M7 1 V13 M7 7 H13", cross: "M7 1 V13 M1 7 H13" };
const KIND_INFO = {
  room: ["Rooms", "each hides a monster or a chest", 15],
  corridor: ["Corridors", "empty passages", 15],
  fountain: ["Fountains of life", "heal all wounds", 3],
  portal: ["Teleport gates", "jump between gates", 5],
};

function shapeChip(name, n) {
  const t = document.createElement("template");
  t.innerHTML = `<span class="shape-chip" title="${name}"><svg viewBox="0 0 14 14" width="14" height="14"><rect x="0.5" y="0.5" width="13" height="13" rx="2" fill="#e8d3a2" stroke="#9c7a45"/><path d="${SHAPE_PATHS[name]}" stroke="#4a3218" stroke-width="2.6" stroke-linecap="square" fill="none"/></svg>${n}</span>`;
  return t.content.firstElementChild;
}

export function pilePopup(g, tileSymbol) {
  const total = g.pile.reduce((n, k) => n + k.total, 0);
  const rooms = g.pile.find((k) => k.kind === "room")?.left ?? 0;
  return h(
    "div",
    { class: "hud-pop" },
    h("div", { class: "hud-head" }, stackIcon(40), h("div", {}, h("h4", {}, "Tile pile"), h("small", {}, `${g.pile_left} of ${total} face-down tiles left`))),
    h("div", { class: "hud-bar" }, h("span", { style: { width: `${(g.pile_left / total) * 100}%` } })),
    g.pile.map((k) => {
      const [name, desc, mask] = KIND_INFO[k.kind];
      const tile = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      tile.setAttribute("viewBox", "0 0 100 100");
      tile.setAttribute("class", "hud-tile");
      tile.innerHTML = `<use href="#${tileSymbol(k.kind, mask)}"/>`;
      const shapes = Object.keys(k.shapes).length > 1 ? h("div", { class: "shapes" }, Object.entries(k.shapes).map(([s, n]) => shapeChip(s, n))) : null;
      return h("div", { class: `hud-row ${k.left ? "" : "out"}` }, tile, h("div", { class: "nm" }, h("b", {}, name), h("small", {}, desc), shapes), h("div", { class: "cnt" }, k.left, h("small", {}, ` / ${k.total}`)));
    }),
    h(
      "p",
      { class: "hud-note" },
      g.pile_left
        ? `When the pile is empty nobody can explore any more. Every room you uncover draws a token from the bag, so the ${rooms} rooms left match the ${g.bag_left} tokens in it.`
        : "The pile is empty: the labyrinth is complete and nobody can explore any more.",
    ),
  );
}

export function bagPopup(g, monsters) {
  return h(
    "div",
    { class: "hud-pop wide" },
    h("div", { class: "hud-head" }, bagIcon(40, g.bag_left / BAG_TOTAL, g.bag_left > 0), h("div", {}, h("h4", {}, "The bag"), h("small", {}, `${g.bag_left} tokens left · one under every room still in the pile`))),
    h(
      "div",
      { class: "bag-grid" },
      g.bag.map((b) => {
        const m = monsters[b.key];
        const hiding = b.key === "dragon" && b.left > 0;
        return h(
          "div",
          { class: `bag-cell ${b.left ? "" : "out"} ${hiding ? "dragon" : ""}` },
          m ? token(b.key, 34, m.strength) : token("chest", 34),
          h(
            "div",
            {},
            h("b", {}, m ? m.name : "Locked chest"),
            h("span", { class: "c" }, b.left ? [String(b.left), h("small", {}, ` of ${b.total}`)] : h("small", {}, "all found")),
            hiding ? h("small", { class: "hiding" }, "still hiding!") : h("div", { class: "mini" }, h("span", { style: { width: `${(b.left / b.total) * 100}%` } })),
          ),
        );
      }),
    ),
  );
}
