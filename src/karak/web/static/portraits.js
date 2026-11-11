// Hero and monster portraits as SVG markup in a 100×100 box: inked storybook busts for the heroes,
// fierce close-ups on a blood-red disc for the monsters. art.js installs them as <symbol>s.

const INK = "#24160d";
const r2 = (n) => Math.round(n * 100) / 100;
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => "#" + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, "0")).join("");
const mirrorAll = (d) => d.replace(/(-?\d*\.?\d+)[ ,]+(-?\d*\.?\d+)/g, (_, x, y) => `${r2(100 - +x)} ${y}`);
const both = (d) => `${d} ${mirrorAll(d)}`;
const P = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [v]]));

// ------------------------------------------------------------------ drawing kits
const softGlow = (op) => (cx, cy, r, c) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}" opacity="${r2(op * 0.6)}"/><circle cx="${cx}" cy="${cy}" r="${r2(r * 0.62)}" fill="${c}" opacity="${op}"/>`;

function heroKit() {
  const k = { lw: 2.4 };
  k.fill = (e) => e[0];
  k.line = (w = 1, c = INK) => `stroke="${c}" stroke-width="${r2(k.lw * w)}" stroke-linejoin="round" stroke-linecap="round"`;
  k.shade = (d) => `<path d="${d}" fill="#2a0f05" opacity="0.2"/>`;
  k.hi = (d) => `<path d="${d}" fill="#fff" opacity="0.35"/>`;
  k.glow = softGlow(0.35);
  k.blush = (cx, cy, rx = 4, ry = 2.4, op = 0.35) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#f08a78" opacity="${op}"/>`;
  k.eyes = (y, iris = "#5b3a1c") =>
    [43, 57]
      .map((cx) => {
        const almond = `M${cx - 5} ${y} Q${cx} ${y - 4.8} ${cx + 5} ${y} Q${cx} ${y + 3.8} ${cx - 5} ${y}Z`;
        return (
          `<path d="${almond}" fill="#fffaf0" ${k.line(0.65)}/>` +
          `<circle cx="${cx}" cy="${y - 0.2}" r="2.5" fill="${iris}"/><circle cx="${cx}" cy="${y - 0.2}" r="1.2" fill="${INK}"/>` +
          `<circle cx="${cx + 0.9}" cy="${y - 1.3}" r="0.8" fill="#fff"/>`
        );
      })
      .join("");
  k.eyesGlow = (y, c) =>
    [43, 57].map((cx) => softGlow(0.45)(cx, y, 7, c) + `<ellipse cx="${cx}" cy="${y}" rx="4.6" ry="2.7" fill="${c}"/><circle cx="${cx}" cy="${y}" r="1.4" fill="#fff"/>`).join("");
  return k;
}

// Monster kit: darker fills, stronger shade, no highlights, glowing eyes.
function monsterKit() {
  const k = { lw: 2.4 };
  k.fill = (e) => mix(e[0], "#14080a", 0.3);
  k.line = (w = 1, c = INK) => `stroke="${c}" stroke-width="${r2(k.lw * w)}" stroke-linejoin="round" stroke-linecap="round"`;
  k.shade = (d) => `<path d="${d}" fill="#1a0806" opacity="0.4"/>`;
  k.hi = () => "";
  k.glow = (cx, cy, r, c, op = 0.35) =>
    `<circle cx="${cx}" cy="${cy}" r="${r2(r)}" fill="${c}" opacity="${r2(op * 0.6)}"/><circle cx="${cx}" cy="${cy}" r="${r2(r * 0.62)}" fill="${c}" opacity="${op}"/>`;
  k.eyes = (list) =>
    list
      .map(({ x, y, r = 4, c = "#d8261c", type = "round" }) => {
        if (type === "socket") return k.glow(x, y, r * 2, c, 0.5) + `<circle cx="${x}" cy="${y}" r="${r2(r * 0.72)}" fill="${c}"/><circle cx="${x}" cy="${y}" r="${r2(r * 0.22)}" fill="#fff"/>`;
        if (type === "visor")
          return (
            k.glow(x, y, r * 2.4, c, 0.5) +
            `<ellipse cx="${x}" cy="${y}" rx="${r2(r * 1.5)}" ry="${r2(r * 0.45)}" fill="${c}"/><ellipse cx="${x}" cy="${y}" rx="${r2(r * 1.1)}" ry="${r2(r * 0.16)}" fill="#fff"/>`
          );
        return (
          k.glow(x, y, r * 2.2, c, 0.5) + `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r2(r * 0.85)}" fill="${c}"/>` +
          (type === "slit" ? `<ellipse cx="${x}" cy="${y}" rx="${r2(r * 0.18)}" ry="${r2(r * 0.75)}" fill="${INK}"/>` : `<circle cx="${x}" cy="${y}" r="${r2(r * 0.35)}" fill="#fff"/>`)
        );
      })
      .join("");
  return k;
}

function tools(k, pal) {
  const F = (key) => (key ? k.fill(pal[key]) : "none");
  const p = (d, key, w = 1) => `<path d="${d}" fill="${F(key)}" ${w ? k.line(w) : ""}/>`;
  const poly = (pts, key, w) => p("M" + pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(" L") + "Z", key, w);
  return {
    F,
    p,
    pn: (d, key) => `<path d="${d}" fill="${F(key)}"/>`,
    ln: (d, w = 1) => `<path d="${d}" fill="none" ${k.line(w)}/>`,
    cs: (d, w, key) => `<path d="${d}" fill="none" stroke="${F(key)}" stroke-width="${w}" stroke-linecap="round"/>`,
    c: (cx, cy, r, key, w = 1) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${F(key)}" ${w ? k.line(w) : ""}/>`,
    e: (cx, cy, rx, ry, key, w = 1) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${F(key)}" ${w ? k.line(w) : ""}/>`,
    bar: (x1, y1, x2, y2, w, key, lw = 0.8) => {
      const L = Math.hypot(x2 - x1, y2 - y1), nx = (-(y2 - y1) / L) * (w / 2), ny = ((x2 - x1) / L) * (w / 2);
      return poly([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]], key, lw);
    },
    blade: (x1, y1, x2, y2, w, key) => {
      const L = Math.hypot(x2 - x1, y2 - y1), nx = (-(y2 - y1) / L) * w, ny = ((x2 - x1) / L) * w;
      return poly([[x1 + nx, y1 + ny], [x2, y2], [x1 - nx, y1 - ny]], key, 0.8);
    },
    star: (cx, cy, r, key) =>
      p(
        "M" + Array.from({ length: 10 }, (_, i) => {
          const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
          return `${r2(cx + Math.cos(a) * rr)} ${r2(cy + Math.sin(a) * rr)}`;
        }).join(" L") + "Z",
        key,
        0,
      ),
    sparkle: (cx, cy, r, key) => p(`M${cx} ${cy - r} Q${cx} ${cy} ${cx + r} ${cy} Q${cx} ${cy} ${cx} ${cy + r} Q${cx} ${cy} ${cx - r} ${cy} Q${cx} ${cy} ${cx} ${cy - r}Z`, key, 0),
  };
}

const limb = (k, d, w, c) =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${r2(w + k.lw)}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const ringM = (k, t, cx, cy, r, key, w = 2.2) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${INK}" stroke-width="${r2(w + k.lw * 0.8)}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.F(key)}" stroke-width="${w}"/>`;
const ring = (t, cx, cy, r, key, w = 2.2) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${INK}" stroke-width="${w + 1.8}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.F(key)}" stroke-width="${w}"/>`;

// ------------------------------------------------------------------ heroes
const HERO_PAL = {
  warrior: {
    skin: "#eab489", beard: "#c0662e", beardDk: "#8f4220", steel: "#b3bcc4", steelDk: "#7c858f", horn: "#f3ead2", fur: "#6b4426", furLt: "#9a6a3e",
    wood: "#8a5a2b", blade: "#d6dde3", gold: "#e2b23b", scar: "#b53a2a", rivet: "#4f463b",
  },
  thief: {
    skin: "#f0c59a", hood: "#3f7a34", hoodDk: "#21401c", hair: "#94391f", cloak: "#2c5226", leather: "#6b3f1f", gold: "#d9b04a", blade: "#d6dde3", scarfR: "#8a2f24",
  },
  wizard: {
    skin: "#f3cfae", beard: "#f6f3ec", robe: "#2f5fb3", hat: "#3b72cf", star: "#ffd84d", gold: "#e2b23b", wood: "#7a4a22", orb: "#bfe8ff",
  },
  warlock: {
    skin: "#dcd4ea", cowl: "#3d2160", cowlDk: "#231234", robe: "#2a1640", gold: "#d4ad4f", gem: "#c77dff", glow: "#c77dff", glowLt: "#f3e0ff",
  },
  swordsman: {
    skin: "#eebc8e", helm: "#e8b739", helmDk: "#a87a12", plume: "#d8342a", tabard: "#b8322a", mail: "#9aa3ab", stache: "#5a3418", blade: "#dde3e8", gold: "#f2c94c",
  },
  oracle: {
    skin: "#a8693f", robe: "#34407a", gold: "#d9b04a", gem: "#3fe0d0", orb: "#a8fff4", lipsDk: "#6e2f2a", wrap: "#1f7d76", white: "#fffaf0",
  },
};
const SH = "M6 100 Q8 80 28 74 Q40 70 50 71 Q60 70 72 74 Q92 80 94 100Z";
const NECK = "M43 62 V77 H57 V62Z";

function face(k, t, { y = 48, ears = true, nose = true, blush = true } = {}) {
  let o = "";
  if (ears) o += t.e(32.5, y + 2, 3.5, 5.5, "skin", 0.9) + t.e(67.5, y + 2, 3.5, 5.5, "skin", 0.9);
  o += t.e(50, y, 17.5, 20, "skin");
  o += k.shade(`M55 ${y - 18} Q68 ${y - 12} 67.5 ${y} Q67 ${y + 16} 50 ${y + 20} Q61 ${y + 12} 62 ${y} Q62 ${y - 10} 55 ${y - 18}Z`);
  if (blush) o += k.blush(40, y + 9) + k.blush(60, y + 9);
  if (nose) o += t.ln(`M50 ${y + 2} Q47.5 ${y + 7} 50 ${y + 8} Q52 ${y + 8} 53 ${y + 7}`, 0.6);
  return o;
}

const HERO = {
  warrior: (k, t) => [
    t.bar(22, 99, 31, 22, 5, "wood"),
    t.p("M30 28 Q15 17 10 33 Q16 47 31 40Z", "blade"),
    k.hi("M13.5 33 Q15.5 24 24 23.5 Q18 28 17 36Z"),
    t.p("M30 27 Q37 25 38.5 31 Q38 37 31 39Z", "steelDk", 0.7),
    t.p(NECK, "skin"),
    t.p(SH, "fur"),
    t.p("M16 84 Q20 72 30 76 Q34 68 42 72 Q50 66 58 72 Q66 68 70 76 Q80 72 84 84 Q50 77 16 84Z", "furLt", 0.8),
    t.p("M6 94 Q8 76 28 77 Q33 88 26 99Z", "steel"),
    t.p("M94 94 Q92 76 72 77 Q67 88 74 99Z", "steel"),
    k.shade("M80 78 Q92 80 94 94 L76 99 Q80 88 80 78Z"),
    t.c(14, 85, 1.3, "rivet", 0), t.c(86, 85, 1.3, "rivet", 0),
    t.p("M31 50 Q30 80 42 86 L44 97 L50 92 L56 97 L58 86 Q70 80 69 50Z", "beard"),
    face(k, t, { nose: false }),
    t.p("M32.5 53 Q33 72 44 78 Q50 81 56 78 Q67 72 67.5 53 Q62 61 56 58 Q50 63 44 58 Q38 61 32.5 53Z", "beard"),
    k.shade("M60 60 Q67 56 67.5 53 Q67 72 56 78 Q62 70 60 60Z"),
    t.ln("M40 66 Q42 72 46 76 M60 66 Q58 72 54 76", 0.4),
    t.ln("M46.5 64.5 Q50 66 53.5 64.5", 0.6),
    t.p("M50 57.5 Q43 54.5 37 60.5 Q43 58.5 46 62.5 Q50 60.5 50 57.5 Q50 60.5 54 62.5 Q57 58.5 63 60.5 Q57 54.5 50 57.5Z", "beardDk", 0.6),
    t.p("M42.2 88 L46.8 88 L47.2 91.5 L42.8 91.5Z M53.2 88 L57.8 88 L57.2 91.5 L52.8 91.5Z", "gold", 0.5),
    k.eyes(49, "#3b5f86"),
    t.ln("M37 44 L46 46", 1.3), t.ln("M63 44 L54 46", 1.3),
    t.cs("M60 52 L64.5 59", 1.8, "scar"),
    t.p("M32 33 Q18 32 17 16 Q24 25 33 26Z", "horn"),
    t.p("M68 33 Q82 32 83 16 Q76 25 67 26Z", "horn"),
    t.ln("M22.5 27.5 L25.5 24.6 M77.5 27.5 L74.5 24.6", 0.5),
    t.p("M31 40 Q31 23 50 21 Q69 23 69 40Z", "steel"),
    k.shade("M56 22 Q69 25 69 40 L60 40 Q60 30 56 22Z"),
    k.hi("M35 37 Q35 27 44 24 Q39 29 38.5 37Z"),
    t.p("M47.5 21.5 H52.5 V38 H47.5Z", "steelDk", 0.6),
    t.p("M29.5 37.5 H70.5 V42.5 H29.5Z", "steelDk", 0.9),
    t.c(34, 40, 1, "rivet", 0), t.c(41, 40, 1, "rivet", 0), t.c(59, 40, 1, "rivet", 0), t.c(66, 40, 1, "rivet", 0),
    t.p("M47.6 42 H52.4 V55 L50 57.5 L47.6 55Z", "steel", 0.8),
  ],
  // the huntress: hood, copper braid over the shoulder, red scarf mask, dagger
  thief: (k, t) => [
    t.p(NECK, "skin"), t.p(SH, "cloak"),
    t.p("M22 79 L29 74 L78 100 L66 100Z", "leather", 0.7), t.p("M42 84 h7 v6 h-7z", "gold", 0.6),
    t.p("M20 97 Q15 36 50 17 Q85 36 80 97 Q70 80 50 80 Q30 80 20 97Z", "hood"),
    k.shade("M62 22 Q85 36 80 97 Q76 86 70 80 Q74 50 62 22Z"),
    t.ln("M26 86 Q24 62 32 40 M74 86 Q76 62 68 40", 0.4),
    Array.from({ length: 6 }, (_, i) => t.e(r2(68 + i * 1.1), 58 + i * 6.4, r2(4.6 - i * 0.25), 4, "hair", 0.6)).join(""),
    t.p("M71.5 91 h5.4 v3 h-5.4z", "gold", 0.5),
    t.p("M72 94 L70.5 100 L78 100 L76.5 94Z", "hair", 0.5),
    face(k, t, { ears: false, nose: false }),
    t.p("M32.5 53 Q30 33 47 29 Q41 37 40 47 Q36 47 32.5 53Z", "hair", 0.7),
    t.p("M67.5 50 Q69 36 58 31 Q62 38 61 46Z", "hair", 0.7),
    t.p("M30 53 Q30 26 50 25 Q70 26 70 53 Q66 36 50 34 Q34 36 30 53Z", "hoodDk"),
    k.shade("M33 43 Q50 35 67 43 Q66 48 50 45 Q34 48 33 43Z"),
    k.eyes(49, "#4b7a3a"),
    t.ln("M38.2 48.6 L35.6 46.6 M61.8 48.6 L64.4 46.6", 0.55),
    t.ln("M37.5 44.2 Q41.5 41.8 46 43.6", 0.75), t.ln("M62.5 44.2 Q58.5 41.8 54 43.6", 0.75),
    t.p("M31.5 55 Q50 52 68.5 55 Q69 69 50 74 Q31 69 31.5 55Z", "scarfR"),
    t.ln("M36 61 Q50 58.5 64 61 M40 67.5 Q50 66 60 67.5", 0.35),
    t.blade(30.5, 87.5, 16, 61, 3.4, "blade"),
    t.ln("M29.5 85.5 L19 67", 0.3),
    t.bar(26, 92, 36.5, 86, 2.8, "gold", 0.6),
    t.bar(36, 100, 31.5, 90.5, 4, "leather", 0.6),
    t.e(34.5, 95.5, 4.2, 3.6, "skin", 0.7),
  ],
  wizard: (k, t) => [
    t.bar(20, 100, 27, 26, 4.5, "wood"),
    k.glow(27, 20, 13, t.F("orb")),
    t.c(27, 20, 6.5, "orb", 0.8),
    k.hi("M23.5 18.5 Q24.5 15 28 15 Q25.8 17 25.4 20Z"),
    t.cs("M23 27 Q20 20 23.5 14.5 M31 27 Q34 20 30.5 14.5", 2, "wood"),
    t.p(NECK, "skin"),
    t.p(SH, "robe"),
    k.shade("M72 74 Q92 80 94 100 L78 100 Q80 86 72 74Z"),
    t.star(16, 88, 3, "star"), t.star(84, 86, 2.6, "star"),
    t.p("M31 52 Q26 86 50 100 Q74 86 69 52Z", "beard"),
    face(k, t),
    t.p("M32.5 53 Q32 80 50 92 Q68 80 67.5 53 Q62 61 56 58 Q50 63 44 58 Q38 61 32.5 53Z", "beard"),
    k.shade("M60 62 Q67 58 67.5 53 Q68 80 50 92 Q62 78 60 62Z"),
    t.ln("M42 68 Q43 78 47 85 M58 68 Q57 78 53 85 M50 66 V88", 0.4),
    t.p("M50 57.5 Q42 55 36 62 Q43 60 47 62.5 Q50 60.5 50 57.5 Q50 60.5 53 62.5 Q57 60 64 62 Q58 55 50 57.5Z", "beard", 0.6),
    k.eyes(49, "#3f6aa8"),
    t.p("M35 45 Q40 40.5 47 44.5 Q41 43.5 35 47Z", "beard", 0.5),
    t.p("M65 45 Q60 40.5 53 44.5 Q59 43.5 65 47Z", "beard", 0.5),
    t.p("M12 38 Q50 25 88 38 Q50 46 12 38Z", "hat"),
    t.p("M29 35 Q45 20 62 3 Q61 22 71 35 Q50 29 29 35Z", "hat"),
    k.shade("M62 3 Q61 22 71 35 Q66 33.5 63 32.5 Q59 18 62 3Z"),
    t.p("M29.5 34.5 Q50 28.5 70.5 34.5 L71.5 38 Q50 32 28.5 38Z", "gold", 0.5),
    t.star(51, 20, 4, "star"), t.c(41, 28.5, 1.6, "star", 0), t.c(58.5, 11.5, 1.3, "star", 0),
  ],
  warlock: (k, t) => [
    t.p(NECK, "skin"),
    t.p(SH, "robe"),
    t.p("M21 92 L17 57 L40 76Z", "cowlDk", 0.8),
    t.p("M79 92 L83 57 L60 76Z", "cowlDk", 0.8),
    t.p("M19 98 Q16 30 50 15 Q84 30 81 98 Q66 80 50 80 Q34 80 19 98Z", "cowl"),
    k.shade("M62 20 Q84 30 81 98 Q76 88 70 82 Q74 50 62 20Z"),
    t.ln("M25 88 Q23 62 32 40 M75 88 Q77 62 68 40", 0.4),
    face(k, t, { ears: false, blush: false }),
    t.p("M30 54 Q30 27 50 26 Q70 27 70 54 Q66 38 50 36 Q34 38 30 54Z", "cowlDk"),
    k.shade("M33 44 Q50 36 67 44 Q66 50 50 46.5 Q34 50 33 44Z"),
    t.cs("M34 42 Q50 35 66 42", 2.6, "gold"),
    t.p("M36.5 41 L31 27 L41.5 38.5Z M63.5 41 L69 27 L58.5 38.5Z", "gold", 0.55),
    t.p("M50 34 L53 37.5 L50 41 L47 37.5Z", "gem", 0.5),
    k.eyesGlow(49, t.F("glow")),
    t.ln("M36.5 44 L46 46.6", 1.25), t.ln("M63.5 44 L54 46.6", 1.25),
    t.ln("M37 55 Q38.5 59.5 41.5 61 M63 55 Q61.5 59.5 58.5 61", 0.35),
    t.ln("M45 61.5 Q50 62.5 56 59.8", 0.7),
    t.p("M46.5 64.5 Q50 73 53.5 64.5 Q50 66.5 46.5 64.5Z", "cowlDk", 0.5),
    k.glow(78, 80, 13, t.F("glow")),
    t.p("M78 93 Q67 87 71 76 Q73 82 76.5 80 Q73 70 80 61 Q80 72 86 76 Q91 87 78 93Z", "glow", 0.6),
    t.pn("M78.5 90 Q73 86 75.5 80 Q78 84 80 81 Q84 86 78.5 90Z", "glowLt"),
  ],
  swordsman: (k, t) => [
    t.blade(79, 67, 79, 15, 4, "blade"),
    t.ln("M79 22 V62", 0.3),
    t.p("M69 64 Q79 61 89 64 L89 69 Q79 66 69 69Z", "gold", 0.7),
    t.p(NECK, "skin"),
    t.p(SH, "tabard"),
    t.p("M34 75 Q50 69 66 75 Q60 83 50 83 Q40 83 34 75Z", "mail", 0.7),
    t.ln("M38 77 Q50 73 62 77 M41 80 Q50 77 59 80", 0.3),
    t.p("M6 95 Q8 77 29 77 Q34 89 27 99Z", "helm"),
    t.p("M94 95 Q92 77 71 77 Q66 89 73 99Z", "helm"),
    k.shade("M81 79 Q92 82 94 95 L77 99 Q81 89 81 79Z"),
    t.p("M50 86 L54 91 L50 96 L46 91Z", "gold", 0.6),
    face(k, t, { ears: false }),
    t.p("M30 47 Q30 22 50 20 Q70 22 70 47 L63 47 L63 41 L37 41 L37 47Z", "helm"),
    k.shade("M57 21 Q70 24 70 47 L63 47 L63 41 L60 41 Q60 28 57 21Z"),
    t.p("M30 46 L30 63 Q33 68 38 66 L37 46Z", "helm", 0.8),
    t.p("M70 46 L70 63 Q67 68 62 66 L63 46Z", "helm", 0.8),
    t.cs("M50 21 V40", 3, "helmDk"),
    k.hi("M34 38 Q34 27 44 23.5 Q38 29 37.5 38Z"),
    t.p("M32 31 Q27 5 50 4 Q73 5 68 31 Q65 20 50 19.5 Q35 20 32 31Z", "plume"),
    t.ln("M36 22 Q38 10 50 9 Q62 10 64 22 M42 18 Q44 13 50 13", 0.35),
    k.eyes(50, "#5b3a1c"),
    t.ln("M38 45 L46 44.5", 1.25), t.ln("M62 45 L54 44.5", 1.25),
    t.p("M50 58.5 Q43 54.5 38 58 Q35 61 37.5 63.5 Q38.5 59.5 42.5 60.5 Q46 62.5 50 60.5 Q54 62.5 57.5 60.5 Q61.5 59.5 62.5 63.5 Q65 61 62 58 Q57 54.5 50 58.5Z", "stache", 0.5),
    t.ln("M45.5 64 Q50 66.5 54.5 64", 0.7),
    t.ln("M48.5 67.6 Q50 68.4 51.5 67.6", 0.4),
  ],
  // the third-eye mystic: teal headwrap, an eye on the forehead, gold hoops, a crystal shard
  oracle: (k, t) => [
    t.p(NECK, "skin"), t.p(SH, "robe"), t.cs("M29 74.5 Q50 88 71 74.5", 3, "gold"),
    t.p("M27 50 Q20 12 50 9 Q80 12 73 50 Q70 38 50 36 Q30 38 27 50Z", "wrap"),
    k.shade("M58 10 Q80 13 73 50 Q71 44 67 40 Q68 22 58 10Z"),
    t.ln("M31 38 Q38 20 60 13 M36 36.5 Q46 24 68 21 M30 28 Q38 15 52 12", 0.4),
    face(k, t),
    t.p("M27.5 47 Q30 37 50 35 Q70 37 72.5 47 Q70 41 50 39.5 Q30 41 27.5 47Z", "wrap", 0.8),
    t.cs("M29 43.5 Q32 35 50 33.5 Q68 35 71 43.5", 2.6, "gold"),
    t.c(50, 33.4, 2.4, "gem", 0.5),
    k.glow(50, 43.4, 5.5, t.F("gem")),
    t.p("M50 39.6 Q53 43.4 50 47.2 Q47 43.4 50 39.6Z", "white", 0.45),
    t.c(50, 43.4, 1.7, "gem", 0), `<circle cx="50" cy="43.4" r="0.8" fill="${INK}"/>`,
    k.eyes(50.5, "#3a2414"),
    t.ln("M37 46 Q41.5 44.6 45.5 46", 0.85), t.ln("M63 46 Q58.5 44.6 54.5 46", 0.85),
    [[36.6, 55.8], [39.2, 57.2], [42, 57.8], [58, 57.8], [60.8, 57.2], [63.4, 55.8]].map(([x, y]) => t.c(x, y, 0.75, "white", 0)).join(""),
    t.p("M45.5 61.2 Q50 59.5 54.5 61.2 Q50 64.8 45.5 61.2Z", "lipsDk", 0.45),
    ring(t, 32.3, 58.4, 2.2, "gold", 1.2), ring(t, 67.7, 58.4, 2.2, "gold", 1.2),
    k.glow(50, 89, 14, t.F("orb")),
    t.p("M50 77 L56.5 87.5 L50 99 L43.5 87.5Z", "orb", 0.6),
    t.ln("M43.5 87.5 H56.5 M50 77 V99", 0.3),
    t.e(40.5, 94, 5, 3.8, "skin", 0.7), t.e(59.5, 94, 5, 3.8, "skin", 0.7),
  ],
};

// ------------------------------------------------------------------ monsters
const GHOST = "#7fe0c8";
const BLOOD = "#c4001e";
const MPAL = {
  rat: P({ fur: "#8d8077", furDk: "#6e635b", ear: "#e7a3a0", snout: "#b9ada2", nose: "#e0706e", tooth: "#fff8e0" }),
  spider: P({ leg: "#3b2e3e", body: "#4a3b4e", mark: "#c2302a", fang: "#e8dcc8" }),
  mummy: P({ wrap: "#dccfa8", gap: "#2b2117", tooth: "#dccfa8" }),
  turnkey: P({ rag: "#5a3d2a", hood: "#6b4a2e", hoodDk: "#3a2618", bone: "#efe6cf", socket: "#2b2117", brass: "#d9a43b" }),
  skeleton: P({ bone: "#efe6cf", socket: "#2b2117", void: "#2a211c", iron: "#7d8790", ironDk: "#59626b", rust: "#b8642a", blade: "#cfd6dd", bladeDk: "#8f99a3", leather: "#6b3f1f", wood: "#8a5a2b" }),
  king: P({ bone: "#efe6cf", socket: "#2b2117", cape: "#8f1c22", ermine: "#f6f2ea", gold: "#f2c230", goldDk: "#c08a12", ruby: "#d8261c", gem2: "#3fa9e0", wood: "#7a4a22", steel: "#c7cfd6", edge: "#eef3f6", leather: "#5a3418" }),
  fallen: P({ cloak: "#2c3a40", steel: "#7d8f96", steelDk: "#4c6068", void: "#0f1a1d", horn: "#cbbd9c", tooth: "#e6dcc6" }),
  dragon: P({}),
};
const mirrorX = (d) => d.replace(/([ML])\s*([\d.]+)\s+([\d.]+)/g, (_, c, x, y) => `${c}${r2(100 - x)} ${y}`);
const gleam = (d, op = 0.5) => `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="0.9" opacity="${op}" stroke-linecap="round"/>`;
const drip = (x, y, len = 7) =>
  `<path d="M${x} ${y} Q${x + 1} ${y + len * 0.6} ${x + 0.3} ${y + len}" fill="none" stroke="${BLOOD}" stroke-width="1.7" stroke-linecap="round"/><ellipse cx="${x + 0.3}" cy="${y + len + 1.2}" rx="1.3" ry="1.7" fill="${BLOOD}"/>`;
const fingers = (t, x, ys, rx = 5.5) => ys.map((y) => t.e(x, y, rx, 2, "bone", 0.6)).join("");
const teethRow = (t, x0, y0, x1, y1, n, L, dir = 1, key = "tooth") => {
  const at = (f) => [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
  const d = [];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = at(i / n), [bx, by] = at((i + 0.5) / n), [cx, cy] = at((i + 1) / n);
    const len = L * (0.75 + 0.5 * (((i * 37) % 5) / 5));
    d.push(`${i ? "L" : "M"}${r2(ax)} ${r2(ay)} L${r2(bx)} ${r2(by + dir * len)} L${r2(cx)} ${r2(cy)}`);
  }
  return t.p(d.join(" ") + "Z", key, 0.3);
};

const skull = (k, t, { y = 0, crack = false } = {}) => [
  t.p(`M32 ${50 + y} Q31 ${25 + y} 50 ${24 + y} Q69 ${25 + y} 68 ${50 + y} Q68 ${59 + y} 62 ${62 + y} L61 ${68 + y} H39 L38 ${62 + y} Q32 ${59 + y} 32 ${50 + y}Z`, "bone"),
  k.shade(`M56 ${25 + y} Q69 ${28 + y} 68 ${50 + y} Q68 ${59 + y} 62 ${62 + y} Q63 ${50 + y} 62 ${42 + y} Q61 ${31 + y} 56 ${25 + y}Z`),
  t.e(42, 48 + y, 6, 6.6, "socket", 0), t.e(58, 48 + y, 6, 6.6, "socket", 0),
  t.p(`M48 ${57 + y} L50 ${52.5 + y} L52 ${57 + y} Q50 ${58.5 + y} 48 ${57 + y}Z`, "socket", 0),
  t.p(`M38.5 ${66 + y} Q50 ${71 + y} 61.5 ${66 + y} L60.5 ${74 + y} Q50 ${80 + y} 39.5 ${74 + y}Z`, "bone"),
  t.ln(`M42.5 ${67.4 + y} V${73.6 + y} M46.2 ${68.6 + y} V${75.6 + y} M50 ${69 + y} V${76.2 + y} M53.8 ${68.6 + y} V${75.6 + y} M57.5 ${67.4 + y} V${73.6 + y}`, 0.35),
  crack ? t.ln(`M44 ${26 + y} L46.5 ${32 + y} L43.5 ${36 + y}`, 0.45) : "",
];
const sockets = (k, c, y = 0) => k.eyes([{ x: 42, y: 48.5 + y, r: 4.2, c, type: "socket" }, { x: 58, y: 48.5 + y, r: 4.2, c, type: "socket" }]);
const skelTorso = (k, t) => [
  t.p("M14 100 Q18 80 34 75 H66 Q82 80 86 100Z", "void"),
  limb(k, "M38 84 Q50 81 62 84 M39 90 Q50 87 61 90 M40 96 Q50 93 60 96", 1.8, t.F("bone")),
  limb(k, "M50 78 V100", 2, t.F("bone")),
  limb(k, "M34 76 Q42 78 50 76 Q58 78 66 76", 2.4, t.F("bone")),
];
const kingBody = (k, t) => [
  t.p("M6 100 Q8 78 30 72 L50 82 L70 72 Q92 78 94 100Z", "cape"),
  k.shade("M70 72 Q92 78 94 100 L76 100 Q78 84 70 72Z"),
  t.p("M22 82 Q30 70 42 74 Q50 82 58 74 Q70 70 78 82 Q66 90 50 88 Q34 90 22 82Z", "ermine"),
  [[30, 79], [38, 76.5], [62, 76.5], [70, 79], [50, 84], [43, 83.5], [57, 83.5]].map(([x, y]) => t.p(`M${x} ${y} l1.2 2.8 l-1.2 -0.7 l-1.2 0.7z`, "socket", 0)).join(""),
];
const fallenBody = (k, t) => [
  `<path d="M8 100 Q4 56 24 36 Q38 22 50 22 Q62 22 76 36 Q96 56 92 100Z" fill="${GHOST}" opacity="0.32"/>`,
  t.p(SH, "cloak"),
  t.p("M8 94 Q10 74 30 75 Q35 88 27 99Z", "steel"), t.p("M92 94 Q90 74 70 75 Q65 88 73 99Z", "steel"),
  t.p("M17 77 L9 62 L24 74Z M83 77 L91 62 L76 74Z M24 76 L22 64 L30 75Z M76 76 L78 64 L70 75Z", "steel", 0.6),
  k.shade("M80 77 Q90 80 92 94 L74 99 Q79 88 80 77Z"),
  t.p("M36 72 Q50 66 64 72 L62 80 Q50 76 38 80Z", "steelDk", 0.7),
];

const MONSTER = {
  rat: (k, t) => [
    t.p(SH, "furDk"),
    t.ln("M14 88 l4 -6 l3 6 M26 80 l4 -6 l3 6 M70 80 l4 -6 l3 6 M82 88 l4 -6 l3 6", 0.4),
    t.c(25, 30, 14, "fur"), t.c(25, 30, 7.5, "ear", 0),
    t.c(75, 30, 14, "fur"), t.c(75, 30, 7.5, "ear", 0),
    t.p("M25 52 Q23 26 50 24 Q77 26 75 52 Q73 66 61 73 Q50 80 39 73 Q27 66 25 52Z", "fur"),
    k.shade("M58 26 Q77 30 75 52 Q73 66 61 73 Q66 60 65 50 Q64 34 58 26Z"),
    t.p("M44 26 L47 16 L50 24 L53 15 L56 26Z", "fur", 0.7),
    t.p("M37 57 Q50 50 63 57 Q64 70 50 76 Q36 70 37 57Z", "snout"),
    t.p("M46.4 74 h3.4 v6.5 h-3.4z M50.2 74 h3.4 v6.5 h-3.4z", "tooth", 0.5),
    t.e(50, 73.5, 5, 3.6, "nose", 0.6),
    t.ln("M41 67 L17 63 M41 70 L19 74 M59 67 L83 63 M59 70 L81 74", 0.3),
    k.eyes([{ x: 39, y: 50, r: 4.6 }, { x: 61, y: 50, r: 4.6 }]),
    t.ln("M32 42 L44 46.5 M68 42 L56 46.5", 1.1),
  ],
  spider: (k, t) => {
    const legs = ["M40 52 L22 26 L12 8", "M38 56 L14 40 L0 34", "M38 60 L14 66 L0 74", "M40 64 L22 82 L14 100"];
    return [
      [...legs, ...legs.map(mirrorX)].map((d) => limb(k, d, 5.5, t.F("leg"))).join(""),
      t.e(50, 24, 22, 17, "body"),
      t.p("M45.5 15 L54.5 15 L50 23 L54.5 31 L45.5 31 L50 23Z", "mark", 0.5),
      t.e(50, 57, 21, 19, "body"),
      k.shade("M58 39 Q71 46 71 57 Q70 72 50 76 Q64 66 64 56 Q64 45 58 39Z"),
      t.e(44, 70, 5, 4.5, "body", 0.8), t.e(56, 70, 5, 4.5, "body", 0.8),
      t.p("M41 71 Q36 80 43 87 Q43 79 47 73Z", "fang", 0.8), t.p("M59 71 Q64 80 57 87 Q57 79 53 73Z", "fang", 0.8),
      k.eyes([
        { x: 43, y: 56, r: 4.4, c: "#ff3b2f" }, { x: 57, y: 56, r: 4.4, c: "#ff3b2f" },
        { x: 37, y: 48.5, r: 2.6, c: "#ff3b2f" }, { x: 63, y: 48.5, r: 2.6, c: "#ff3b2f" },
        { x: 45, y: 46.5, r: 2.3, c: "#ff3b2f" }, { x: 55, y: 46.5, r: 2.3, c: "#ff3b2f" },
        { x: 34, y: 57, r: 2, c: "#ff3b2f" }, { x: 66, y: 57, r: 2, c: "#ff3b2f" },
      ]),
    ];
  },
  mummy: (k, t) => [
    t.p(SH, "wrap"),
    t.ln("M14 86 Q30 80 44 84 M56 84 Q70 80 86 86 M10 96 Q30 90 50 94 Q70 90 90 96", 0.4),
    k.shade("M70 74 Q92 80 94 100 L76 100 Q78 86 70 74Z"),
    t.p("M66 30 Q84 22 92 36 Q84 34 78 40 Q76 34 66 36Z", "wrap", 0.8),
    t.p("M30 52 Q28 22 50 20 Q72 22 70 52 Q70 72 50 79 Q30 72 30 52Z", "wrap"),
    k.shade("M57 21 Q72 25 70 52 Q70 72 50 79 Q64 66 63 50 Q62 32 57 21Z"),
    t.ln("M30 32 Q50 26 70 34 M29 40 Q50 36 71 42 M31 62 Q50 58 69 64 M33 70 Q50 68 66 72 M36 26 Q46 30 56 22", 0.4),
    t.p("M31 46 Q50 40 69 46 L68 56 Q50 50 32 56Z", "gap", 0.6),
    k.eyes([{ x: 42, y: 49.5, r: 3.8, c: "#9cff6b" }, { x: 59, y: 51, r: 2.6, c: "#9cff6b" }]),
    t.p("M52 43 Q60 46 69 52 L68.5 56 Q60 50 52 47Z", "wrap", 0.5),
    t.p("M40 65 Q50 61 60 65 Q50 72 40 65Z", "gap", 0.6),
    t.cs("M45 64.6 V66.6 M50 64 V66.4 M55 64.6 V66.6", 1, "tooth"),
    t.p("M68 100 Q70 86 78 81 Q86 78 90 84 Q86 86 85 90 L87 100Z", "wrap", 0.8),
    t.ln("M80 82 L84 79 M83 84.5 L88 82", 0.35),
  ],
  turnkey: (k, t) => [
    t.p(SH, "rag"),
    t.p("M38 76 Q50 72 62 76 L60 100 H40Z", "socket", 0.6),
    limb(k, "M41 83 Q50 80 59 83 M41 89 Q50 86 59 89 M42 95 Q50 92 58 95", 1.8, t.F("bone")),
    limb(k, "M50 78 V100", 2, t.F("bone")),
    t.p("M22 96 Q18 34 50 18 Q82 34 78 96 Q66 78 50 78 Q34 78 22 96Z", "hood"),
    k.shade("M62 22 Q82 34 78 96 Q74 86 68 80 Q72 50 62 22Z"),
    t.ln("M27 50 l3 2 M25.6 60 l3 2 M25.4 70 l3 2 M73 50 l-3 2 M74.4 60 l-3 2 M74.6 70 l-3 2", 0.35),
    ...skull(k, t, { crack: true }),
    t.p("M30 54 Q30 27 50 26 Q70 27 70 54 Q66 37 50 35 Q34 37 30 54Z", "hoodDk"),
    sockets(k, "#ffb347"),
    t.bar(80, 36, 80, 86, 4, "brass", 0.6),
    t.p("M82 72 h7 v4 h-7z M82 79 h5 v4 h-5z", "brass", 0.6),
    ringM(k, t, 80, 30, 6.5, "brass", 3),
    [54, 58.5, 63].map((y) => t.e(78.5, y, 5, 2.1, "bone", 0.6)).join(""),
  ],
  // sword held up beside the helmet, rusty round shield
  skeleton: (k, t) => [
    ...skelTorso(k, t),
    t.c(13, 86, 21, "wood"), ringM(k, t, 13, 86, 18, "iron", 3), t.c(13, 86, 5, "iron", 0.6),
    t.ln("M4 70 L22 100 M16 66 L30 92", 0.35), t.c(20, 74, 1.4, "rust", 0), t.c(26, 84, 1.1, "rust", 0),
    ...skull(k, t),
    sockets(k, "#7fd8ff"),
    t.p("M30.5 42 Q30 19 50 18 Q70 19 69.5 42Z", "iron"),
    k.shade("M56 19 Q70 22 69.5 42 L61 42 Q61 28 56 19Z"),
    t.ln("M38 27 Q40 30 38.5 33 M60 23.5 l2 3", 0.4),
    t.c(36, 34, 1.6, "rust", 0), t.c(63, 31, 1.2, "rust", 0), t.c(57, 37, 1.4, "rust", 0),
    t.p("M28 39.5 H72 V44.5 H28Z", "ironDk", 0.8),
    t.c(33, 42, 0.9, "rust", 0), t.c(67, 42, 0.9, "rust", 0),
    t.p("M48 44.5 H52 V56 L50 58 L48 56Z", "iron", 0.6),
    t.p("M76.5 70 L76.5 20 L80 11 L83.5 20 L83.5 70Z", "blade"),
    t.cs("M80 22 V66", 1.4, "bladeDk"),
    gleam("M77.8 24 V62"),
    t.p("M77 44 l1.6 1.2 l-1.6 1.2Z M83 54 l-1.6 1.2 l1.6 1.2Z", "void", 0),
    t.p("M67 70 Q80 66 93 70 L93 75 Q80 71 67 75Z", "iron"),
    t.c(67.5, 72.5, 1.9, "iron", 0.5), t.c(92.5, 72.5, 1.9, "iron", 0.5),
    t.bar(80, 75, 80, 92, 4, "leather", 0.6),
    t.c(80, 93.5, 3, "iron", 0.6),
    fingers(t, 80, [80.5, 84, 87.5]),
  ],
  // gold-banded double axe, tilted cracked crown
  king: (k, t) => [
    t.bar(21, 100, 21, 26, 4.4, "wood"),
    [70, 76, 82].map((y) => t.p(`M18.6 ${y} h4.8 v3 h-4.8z`, "leather", 0.4)).join(""),
    t.p("M20 31 Q14 30 11 24 Q2 37 9 52 Q14 46 20 44Z", "steel"),
    t.p("M22 31 Q28 30 31 24 Q40 37 33 52 Q28 46 22 44Z", "steel"),
    k.shade("M22 38 Q30 40 33 52 Q28 46 22 44Z"),
    t.cs("M10.6 27 Q5 37 9.6 48.5 M31.4 27 Q37 37 32.4 48.5", 1.4, "edge"),
    t.p("M18.5 29 h5 v17 h-5z", "gold", 0.6),
    t.c(21, 37.5, 1.8, "ruby", 0.4),
    t.p("M19.6 26 L21 16 L22.4 26Z", "gold", 0.5),
    ...kingBody(k, t),
    ...skull(k, t, { y: 2 }),
    sockets(k, "#ff4a2a", 2),
    `<g transform="rotate(-9 50 30)">${[
      t.p("M31 38 L32.5 16 L40.5 27 L50 11 L59.5 27 L67.5 16 L69 38Z", "gold"),
      k.shade("M59.5 27 L67.5 16 L69 38 L62 38Z"),
      t.p("M30.5 34 H69.5 V40.5 H30.5Z", "goldDk", 0.8),
      t.c(50, 37.2, 2.4, "ruby", 0.5), t.c(40, 37.2, 1.7, "gem2", 0.4), t.c(60, 37.2, 1.7, "gem2", 0.4),
      t.ln("M44 12.6 L46.5 19 L44.5 23", 0.4),
    ].join("")}</g>`,
    fingers(t, 21, [62, 65.6, 69.2]),
  ],
  // demon knight: horns through the great helm, a red-hot V visor and a fanged steel maw
  fallen: (k, t) => [
    ...fallenBody(k, t),
    t.p("M34 36 Q20 32 15 19 Q13 10 19 5 Q19 15 25 21 Q30 26 36 28Z", "horn"),
    t.p(mirrorAll("M34 36 Q20 32 15 19 Q13 10 19 5 Q19 15 25 21 Q30 26 36 28Z"), "horn"),
    t.ln(both("M18.4 12 L22.6 11.4 M18 19.6 L23 17.6 M22.6 26.4 L27 23.6"), 0.35),
    t.p("M31 62 Q29 24 50 20 Q71 24 69 62 Q62 72 50 73 Q38 72 31 62Z", "steel"),
    k.shade("M57 21.5 Q71 26 69 62 Q65 68 60 70.5 Q64 40 57 21.5Z"),
    t.cs("M50 21 V39", 2.6, "steelDk"),
    t.p("M32 39.5 L48 45 L50 43.6 L52 45 L68 39.5 L68 48 L52 50.4 L50 49.4 L48 50.4 L32 48Z", "void", 0.6),
    k.eyes([{ x: 41, y: 46, r: 3, c: "#ff5a2a", type: "visor" }, { x: 59, y: 46, r: 3, c: "#ff5a2a", type: "visor" }]),
    t.p("M36 55 L64 55 L62.5 65 Q50 72 37.5 65Z", "void", 0.6),
    k.glow(50, 61, 9, "#ff3a1a", 0.45),
    teethRow(t, 36.6, 55.2, 63.4, 55.2, 9, 4.6, 1),
    teethRow(t, 39.4, 66.4, 60.6, 66.4, 7, 3.6, -1),
    t.c(33.6, 56, 1, "void", 0), t.c(66.4, 56, 1, "void", 0), t.c(34.6, 62, 1, "void", 0), t.c(65.4, 62, 1, "void", 0),
  ],
  dragon: () => [`<g transform="translate(0 -4)">${dragonRoar().join("")}</g>`],
};

// The dragon is painted finer than the rest: thin ink, gradient volume, scales, fire in the throat.
const pth = (d, fill, w = 1.5) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
const inkLn = (d, w = 0.7, op = 0.7) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;
const fineTeeth = (x0, y0, x1, y1, n, L, dir = 1, fill = "#f4ead0") => {
  const at = (f) => [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
  const d = [];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = at(i / n), [bx, by] = at((i + 0.5) / n), [cx, cy] = at((i + 1) / n);
    const len = L * (0.7 + 0.6 * (((i * 37) % 5) / 5));
    d.push(`${i ? "L" : "M"}${r2(ax)} ${r2(ay)} L${r2(bx)} ${r2(by + dir * len)} L${r2(cx)} ${r2(cy)}`);
  }
  return pth(d.join(" ") + "Z", fill, 0.6);
};
const DR_HEAD = "M50 21 Q58 22 65 27 Q72 34 75 46 Q74 54 69 59 Q63 64 61 70 L60 77 Q50 80 40 77 L39 70 Q37 64 31 59 Q26 54 25 46 Q28 34 35 27 Q42 22 50 21Z";
const DR_FRILL = "M31 46 L8 44 L18 50 L7 57 L19 59 L12 67 L33 63Z";
const DR_HORN = "M41 24 Q30 13 16 8 Q25 16 27 25 Q29 31 35 33Z";
const DR_HORN2 = "M29 40 Q16 36 5 27 Q12 38 27 47Z";
const DR_EYE = "M31 48.5 Q38.5 46 45.5 50.5 Q38 53.2 31 48.5Z";
const DR_BROW = "M25.5 42 Q36 37.5 47.5 45 L46 49.5 Q37 45.5 28.5 47.5Z";

function dragonRoar() {
  const u = (n) => `url(#dr-${n})`;
  return [
    pth("M28 100 Q30 78 40 66 L60 66 Q70 78 72 100Z", u("neck")),
    pth("M41 76 Q50 79 59 76 L61 100 H39Z", u("belly"), 1.1),
    inkLn("M40.4 83 Q50 86 59.6 83 M40 90 Q50 93 60 90 M39.6 97 Q50 100 60.4 97", 0.7, 0.6),
    pth(both("M31.4 80 L21 75 L30 86Z M30 90 L19 87 L29.4 96Z"), u("brow"), 1.1),
    pth(DR_FRILL, u("frillL")), pth(mirrorAll(DR_FRILL), u("frillR")),
    inkLn(both("M31 49 L8 44 M31 53 L7 57 M32 58 L12 67"), 0.7, 0.55),
    pth(DR_HORN2, u("hornL")), pth(mirrorAll(DR_HORN2), u("hornR")),
    pth(DR_HORN, u("hornL")), pth(mirrorAll(DR_HORN), u("hornR")),
    inkLn(both("M36.5 22.6 L31.6 27.6 M31 18.6 L26.6 22.8 M25 14.4 L22 17.6 M20 33.6 L17.6 37.4 M13 31 L11 34"), 0.7, 0.6),
    pth("M46 24 L50 10 L54 24Z", u("brow"), 1.1), pth(both("M41.5 25.5 L42 16.5 L45.5 24Z"), u("brow"), 1),
    pth("M30 58 Q30 80 40 92 Q50 97 60 92 Q70 80 70 58Z", u("neck")),
    pth("M33 61 Q33 78 41 88 Q50 92 59 88 Q67 78 67 61Z", u("fire"), 1),
    `<path d="M44 89.4 Q50 82 56 89.4 Q50 91.4 44 89.4Z" fill="#7a100c" opacity="0.85"/>`,
    fineTeeth(42, 88.6, 58, 88.6, 7, 3.2, -1),
    pth("M40.6 87.6 L42 78.6 L44 88.2Z M59.4 87.6 L58 78.6 L56 88.2Z", "#f4ead0", 0.6),
    pth(DR_HEAD, u("head"), 1.8), `<path d="${DR_HEAD}" fill="url(#dr-sc)"/>`,
    `<path d="M65 27 Q72 34 75 46 Q74 54 69 59 Q63 64 61 70 L60 77 Q57 66 61 56 Q66 42 60 25Z" fill="#000" opacity="0.28"/>`,
    `<path d="M35 27 Q28 34 25.6 46 Q29 39 35.6 33Z" fill="#fff" opacity="0.18"/>`,
    inkLn("M29 53 Q34 58 38 66 M71 53 Q66 58 62 66 M39 31 Q44.5 28.6 50 31.4 Q55.5 28.6 61 31 M37 36.6 Q43.6 34.4 50 37.4 Q56.4 34.4 63 36.6", 0.6, 0.5),
    pth("M50 29 Q54.5 40 55.5 52 Q56.5 62 58 70 Q50 73.5 42 70 Q43.5 62 44.5 52 Q45.5 40 50 29Z", u("plate"), 1),
    inkLn("M46.6 40 Q50 42 53.4 40 M45.4 48 Q50 50 54.6 48 M44.6 56 Q50 58 55.4 56 M44 64 Q50 66 56 64", 0.6, 0.6),
    ...[[DR_EYE, 38.5], [mirrorAll(DR_EYE), 61.5]].flatMap(([d, px]) => [
      `<ellipse cx="${px}" cy="49.6" rx="9" ry="5.6" fill="#ffb02e" opacity="0.32"/>`,
      pth(d, u("eye"), 1),
      `<ellipse cx="${px}" cy="49.7" rx="0.95" ry="2.5" fill="#1a0400"/>`,
    ]),
    `<circle cx="36.4" cy="48.6" r="0.6" fill="#fff"/><circle cx="59.4" cy="48.6" r="0.6" fill="#fff"/>`,
    pth(DR_BROW, u("brow"), 1.2), pth(mirrorAll(DR_BROW), u("brow"), 1.2),
    pth(both("M26 43 L17 35 L30.5 40.6Z"), u("brow"), 1),
    `<path d="${both("M44.6 51 Q43 62 39.6 70.4 Q37 64 32 60 Q39 58 44.6 51Z")}" fill="#000" opacity="0.26"/>`,
    `<path d="${both("M43 64.6 Q46.2 64.4 47.8 67.8 Q44.8 67.6 43 64.6Z")}" fill="#120202"/>`,
    pth("M48.2 60.4 L50 54.6 L51.8 60.4Z", u("hornL"), 0.8),
    fineTeeth(40, 77.2, 50, 79.4, 4, 2.6, 1), fineTeeth(50, 79.4, 60, 77.2, 4, 2.6, 1),
    fineTeeth(32, 60.6, 39, 70.6, 3, 2.4, 1), fineTeeth(61, 70.6, 68, 60.6, 3, 2.4, 1),
    pth("M41.2 77.4 L43.4 86.4 L45 78.4Z M58.8 77.4 L56.6 86.4 L55 78.4Z", "#f6ecd4", 0.7),
    `<path d="M42.5 82.6 L43.4 86.4 L44.2 82.9Z" fill="${BLOOD}"/>`, drip(43.4, 86, 6),
  ];
}

// ------------------------------------------------------------------ gradients, clips and the public API
const stops = (list) => list.map(([o, c, op = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${op}"/>`).join("");
const lin = (id, list, a = 'x1="0" y1="0" x2="0" y2="1"') => `<linearGradient id="${id}" ${a}>${stops(list)}</linearGradient>`;
const rad = (id, list, a = "") => `<radialGradient id="${id}" ${a}>${stops(list)}</radialGradient>`;
const even = (cs) => cs.map((c, i) => [r2(i / (cs.length - 1)), c]);

export const PORTRAIT_DEFS = [
  `<clipPath id="clip-disc"><circle cx="50" cy="50" r="50"/></clipPath>`,
  rad("mb-fierce", [[0, "#a3281a"], [0.5, "#3a0c08"], [1, "#120606"]], 'cx="50%" cy="85%" r="75%"'),
  lin("mb-under", [[0.45, "#ff4a1a", 0], [1, "#ff4a1a", 0.32]]),
  lin("mb-top", [[0, "#000", 0.35], [0.4, "#000", 0]]),
  rad("dr-head", even(["#ec5a3c", "#b02818", "#4a0a06"]), 'cx="44%" cy="30%" r="78%"'),
  lin("dr-plate", even(["#f59250", "#c23a1e"])),
  lin("dr-brow", even(["#8a1a10", "#3a0604"])),
  lin("dr-frillL", even(["#a82a18", "#3a0604"]), 'x1="1" y1="0" x2="0" y2="0"'),
  lin("dr-frillR", even(["#a82a18", "#3a0604"]), 'x1="0" y1="0" x2="1" y2="0"'),
  lin("dr-neck", even(["#a8281a", "#3a0806"]), 'x1="0.2" y1="0" x2="1" y2="0.4"'),
  lin("dr-belly", even(["#f0b464", "#9a4a18"])),
  lin("dr-hornL", even(["#6e5640", "#f6e8c8"]), 'x1="1" y1="1" x2="0" y2="0"'),
  lin("dr-hornR", even(["#6e5640", "#f6e8c8"]), 'x1="0" y1="1" x2="1" y2="0"'),
  rad("dr-eye", even(["#fffbd0", "#ffc21a", "#d84000"]), 'cx="50%" cy="50%" r="60%"'),
  rad("dr-fire", even(["#fff6c0", "#ffb020", "#d83a00", "#5a0800"]), 'cx="50%" cy="35%" r="70%"'),
  `<pattern id="dr-sc" width="5" height="4" patternUnits="userSpaceOnUse"><path d="M0 2 Q1.25 0 2.5 2 Q3.75 0 5 2 M-1.25 4 Q0 2 1.25 4 Q2.5 2 3.75 4 Q5 2 6.25 4" fill="none" stroke="#2a0404" stroke-opacity="0.35" stroke-width="0.5"/></pattern>`,
].join("");

export const HERO_KEYS = Object.keys(HERO);
export const MONSTER_KEYS = Object.keys(MONSTER);

export function heroArt(key) {
  const k = heroKit();
  return HERO[key](k, tools(k, P(HERO_PAL[key]))).join("");
}

// A monster fills its whole round token: red backdrop, the beast, an underlight and a dark vignette.
export function monsterArt(key) {
  const k = monsterKit();
  const art = MONSTER[key](k, tools(k, MPAL[key])).join("");
  return `<g clip-path="url(#clip-disc)"><circle cx="50" cy="50" r="50" fill="url(#mb-fierce)"/>${art}<rect width="100" height="100" fill="url(#mb-under)"/><rect width="100" height="100" fill="url(#mb-top)"/></g>`;
}
