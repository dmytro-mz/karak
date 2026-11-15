// Detailed hero busts for Karak: Regent (and a new Warrior option), drawn as raw SVG in a 100×100 box.
// Original drawings; the character concepts follow the heroes of the expansion (armour, hair, companions).

const INK = "#24160d";
const r2 = (n) => Math.round(n * 100) / 100;
const st = (w) => (w ? `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"` : "");
const P = (d, fill, w = 1.8, extra = "") => `<path d="${d}" fill="${fill}" ${st(w)} ${extra}/>`;
const C = (cx, cy, r, fill, w = 1.2) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${st(w)}/>`;
const EL = (cx, cy, rx, ry, fill, w = 1.2, extra = "") => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${st(w)} ${extra}/>`;
const LN = (d, w = 1, c = INK, op = 1) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" opacity="${op}" stroke-linecap="round" stroke-linejoin="round"/>`;
const HL = (d, w = 1.2, op = 0.7) => LN(d, w, "#ffffff", op);
const SHADE = (d, op = 0.22, c = "#1a0c06") => `<path d="${d}" fill="${c}" opacity="${op}"/>`;
const stops = (list) => list.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("");
const LIN = (id, list, [x1, y1, x2, y2] = [0, 0, 0, 1]) => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops(list)}</linearGradient>`;
const RAD = (id, list, [cx, cy, r] = [0.5, 0.5, 0.5]) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops(list)}</radialGradient>`;
const RIVET = (x, y, r = 1.15, c = "#e9eef2") => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="${INK}" stroke-width="0.7"/><circle cx="${r2(x - r * 0.3)}" cy="${r2(y - r * 0.3)}" r="${r2(r * 0.38)}" fill="#fff" opacity="0.85"/>`;
// Mirror a path left↔right (only coordinate pairs; never use H/V in mirrored paths).
const MX = (d) => d.replace(/(-?\d*\.?\d+)[ ,]+(-?\d*\.?\d+)/g, (_, x, y) => `${r2(100 - +x)} ${y}`);
const MIRROR = (...kids) => `<g transform="translate(100 0) scale(-1 1)">${kids.join("")}</g>`;
const EYE = (cx, cy, iris, { w = 4.6, open = 3.6, look = 0 } = {}) => {
  const almond = `M${cx - w} ${cy} Q${cx} ${cy - open * 1.25} ${cx + w} ${cy} Q${cx} ${cy + open * 0.85} ${cx - w} ${cy}Z`;
  return (
    P(almond, "#fffaf0", 0.9) +
    `<circle cx="${cx + look}" cy="${r2(cy - 0.2)}" r="${r2(open * 0.68)}" fill="${iris}"/><circle cx="${cx + look}" cy="${r2(cy - 0.2)}" r="${r2(open * 0.34)}" fill="${INK}"/>` +
    `<circle cx="${r2(cx + look + 0.9)}" cy="${r2(cy - 1.2)}" r="0.75" fill="#fff"/>` +
    LN(`M${cx - w - 0.4} ${r2(cy - 0.2)} Q${cx} ${r2(cy - open * 1.45)} ${cx + w + 0.4} ${r2(cy - 0.3)}`, 1.4)
  );
};

// ------------------------------------------------------------------ Warrior: horned great helm and riveted plate
function warrior(id, p) {
  const S = `url(#${id}s)`;
  const SD = `url(#${id}d)`;
  const H = `url(#${id}h)`;
  const hornL = "M35.5 34 Q21 34.5 15 23 Q10.5 13 14.5 2.5 Q17.5 13.5 23.5 19.5 Q29 24.5 35.5 23.5Z";
  const pauldronL = "M0 100 L0.5 82 Q1.5 64 17 59.5 Q31 56.5 38.5 65 Q41 80 35 100Z";
  const lames = ["M1.5 77 Q17 67.5 38.5 71.5", "M1 88 Q17 79.5 37 83"];
  const side = (mirror) => {
    const f = mirror ? MX : (d) => d;
    return [
      P(f(pauldronL), S, 1.8),
      ...lames.map((d) => LN(f(d), 1.3)),
      ...lames.map((d) => HL(f(d.replace(/(\d+\.?\d*) (\d+\.?\d*)/g, (_, x, y) => `${x} ${+y + 1.4}`)), 0.9, 0.55)),
      HL(f("M5 74 Q8 64 18 61.5"), 1.4, 0.75),
      SHADE(f("M26 58.5 Q36 60 38.5 65 Q41 80 35 100 L26 100 Q31 80 26 58.5Z"), 0.18),
      ...[[8, 70.5], [17, 66.5], [27, 66.8], [7, 81.6], [17, 78.2], [28, 78.6], [7, 93], [18, 90.2], [29, 90.4]].map(([x, y]) => RIVET(mirror ? 100 - x : x, y, 1.05, p.rivet)),
    ].join("");
  };
  return [
    `<defs>${LIN(id + "s", [[0, p.s1], [0.5, p.s2], [1, p.s3]], [0, 0, 1, 0.35])}${LIN(id + "d", [[0, p.s2], [1, p.s3]])}${LIN(id + "h", [[0, p.h2], [0.6, p.h1], [1, p.h1]], [0, 1, 0.3, 0])}</defs>`,
    p.cape ? P("M0 100 L0 64 Q12 54 30 60 L36 100Z", p.cape, 1.6) + P("M100 100 L100 64 Q88 54 70 60 L64 100Z", p.capeDk, 1.6) : "",
    P(hornL, H, 1.7), P(MX(hornL), H, 1.7),
    HL("M17 21 Q13.5 13 15 6", 1.2, 0.4), HL(MX("M17 21 Q13.5 13 15 6"), 1.2, 0.25),
    LN("M27 30 Q29 26 31.5 25 M23 27 Q24.5 23 27 21.5", 0.7, INK, 0.6), LN(MX("M27 30 Q29 26 31.5 25 M23 27 Q24.5 23 27 21.5"), 0.7, INK, 0.6),
    P("M26 100 L30.5 73 Q50 66 69.5 73 L74 100Z", S, 1.8),
    SHADE("M50 67.5 Q61 68.5 69.5 73 L74 100 L50 100Z", 0.16),
    LN("M50 68 L50 100", 1), HL("M48.6 72 L48.6 98", 0.8, 0.5),
    LN("M30 86 Q50 82 70 86", 1), HL("M31 87.4 Q50 83.4 69 87.4", 0.7, 0.45),
    ...[[35, 79], [65, 79], [34, 93], [66, 93], [44, 91], [56, 91]].map(([x, y]) => RIVET(x, y, 1, p.rivet)),
    side(false), side(true),
    P("M33.5 63 Q50 69.5 66.5 63 L66.5 73.5 Q50 80 33.5 73.5Z", SD, 1.6),
    LN("M33.8 68.2 Q50 74.6 66.2 68.2", 0.9), HL("M36 64.6 Q50 70.4 64 64.6", 0.8, 0.5),
    RIVET(38, 71, 0.95, p.rivet), RIVET(62, 71, 0.95, p.rivet), RIVET(50, 75.6, 0.95, p.rivet),
    // the great helm
    P("M32.5 27 Q32.5 16.5 42 15.5 L58 15.5 Q67.5 16.5 67.5 27 L67.5 55 Q67.5 62.5 59 64.5 L41 64.5 Q32.5 62.5 32.5 55Z", S, 2),
    SHADE("M57 15.8 Q67.5 16.5 67.5 27 L67.5 55 Q67.5 62.5 59 64.5 L53 64.5 Q60.5 50 59 29 Q58.5 20 57 15.8Z", 0.22),
    HL("M36.5 27 Q36.5 20.5 42 19.3", 1.6, 0.85), HL("M36 33 L36 53", 1.2, 0.45),
    P("M32.6 26 L67.4 26 L67.4 31.6 L32.6 31.6Z", SD, 1.3),
    HL("M34 27.3 L66 27.3", 0.7, 0.55),
    P("M37 35 L47.6 35 L47.6 40.2 L37 40.2Z", "#120a06", 1),
    P("M52.4 35 L63 35 L63 40.2 L52.4 40.2Z", "#120a06", 1),
    p.glow ? `<ellipse cx="42.3" cy="37.6" rx="3.4" ry="1.3" fill="${p.glow}" opacity="0.9"/><ellipse cx="57.7" cy="37.6" rx="3.4" ry="1.3" fill="${p.glow}" opacity="0.9"/>` : "",
    P("M46.6 15.6 L53.4 15.6 L53.4 64.4 L46.6 64.4Z", S, 1.4),
    HL("M48 18 L48 62", 0.9, 0.6),
    P("M48.7 43.5 L51.3 43.5 L51.3 57 L48.7 57Z", "#120a06", 0.8),
    ...[[38, 46], [41, 46], [38, 49.5], [41, 49.5], [38, 53], [41, 53]].flatMap(([x, y]) => [C(x, y, 0.75, "#120a06", 0), C(100 - x, y, 0.75, "#120a06", 0)]),
    ...[[35.4, 28.8], [64.6, 28.8], [35.6, 60.4], [64.4, 60.4], [50, 21.5], [50, 61.4]].map(([x, y]) => RIVET(x, y, 1.05, p.rivet)),
    p.trim ? LN("M33 31.6 L67 31.6", 1.4, p.trim) + LN("M33 26 L67 26", 1.4, p.trim) : "",
  ].join("");
}

// ------------------------------------------------------------------ Barbarian: barred helm, white beard, beast skull and axe
function barbarian(id, p) {
  const HM = `url(#${id}m)`;
  const ST = `url(#${id}s)`;
  const HN = `url(#${id}h)`;
  const hornL = "M33 36 Q19 40.5 11.5 31 Q4.5 21 8.5 6 Q12.6 21.6 20 25.6 Q26.6 29 33 25Z";
  return [
    `<defs>${LIN(id + "m", [[0, p.m1], [0.45, p.m2], [1, p.m3]], [0, 0, 1, 0.3])}${LIN(id + "s", [[0, "#e4eaef"], [0.45, "#a3afba"], [1, "#5a6672"]], [0, 0, 1, 1])}${LIN(id + "h", [[0, p.h2], [1, p.h1]], [0, 1, 0.4, 0])}</defs>`,
    // axe (behind)
    P("M30 100 L36 46 L40.5 46.6 L35 100Z", p.wood, 1.4),
    LN("M33.5 90 L36.6 89.6 M34 84 L37.2 83.6 M34.6 78 L37.8 77.6", 0.7),
    P("M37.5 50 Q22 49 12 40 Q5 33 4 24 Q-1 40 1.6 54 Q3.6 68 10 76 Q17 62 37 60Z", ST, 1.7),
    HL("M4 32 Q2.6 46 6 62", 1.4, 0.85), LN("M33 53.6 Q22 52 14 46", 0.7, INK, 0.5),
    P("M4 24 Q-1 40 1.6 54 Q3.6 68 10 76 L13 72 Q7.4 62 6 52 Q4.4 38 7 27Z", "#ffffff", 0, 'opacity="0.35"'),
    P("M34 48 L42 48.6 L41 62 L33 61.4Z", p.iron, 1.2), RIVET(37.6, 52.6, 0.8, "#cfd6dc"), RIVET(37.4, 57.8, 0.8, "#cfd6dc"),
    // fur mantle
    P("M0 100 L0 82 Q4 68 18 64 L23 67.5 L27 62 L32 66.5 L37 61 L42 66 L47 62 L52 66.5 L57 62 L62 66 L67 61 L72 66.5 L76 62.5 Q90 64 98 76 L100 100Z", p.fur, 1.6),
    LN("M8 80 l3 -5 M14 86 l3 -6 M21 78 l2 -5 M30 72 l2 -5 M66 72 l2 -5 M79 78 l2 -5 M88 84 l3 -6", 0.8, INK, 0.55),
    SHADE("M60 68 L76 62.5 Q90 64 98 76 L100 100 L68 100Z", 0.14),
    // leather strap with buckle
    P("M30 100 L70 70.5 L75.5 76 L37.5 100Z", p.leather, 1.4),
    LN("M33 98.4 L71 70.4", 0.6, "#000", 0.35),
    P("M47.5 84 L55 78.6 L59 84 L51.5 89.4Z", "none", 0), P("M47 83.4 L55.6 77.4 L59.8 83.2 L51.2 89.2Z", p.iron, 1.2),
    P("M49.6 83.4 L55.4 79.2 L57.6 82.4 L51.8 86.6Z", p.leather, 0.7),
    // the beast skull on the right shoulder (with two arrows in it)
    `<g transform="translate(84 74) scale(0.8) translate(-82 -64)">`,
    P("M63 66 Q64 51 78 48 Q89 46.5 95.5 54 L100 61 L100 76 Q95 80 89 79 L84 82 Q75 87 68 80 Q61.5 74 63 66Z", p.bone, 1.7),
    SHADE("M86 50 Q95 52 100 61 L100 76 Q95 80 89 79 Q95 68 86 50Z", 0.16),
    P("M71 49.6 Q64 41 69 32.5 Q69.4 41 77 47.4Z", HN, 1.3),
    EL(77, 61, 4.4, 4, "#2b1c12", 0.9), `<circle cx="77.6" cy="61" r="1.2" fill="#ff6a3c" opacity="0.8"/>`,
    P("M93 63.5 Q96 61 98 64 Q96 66.5 93 63.5Z", "#2b1c12", 0.6),
    P("M70 77.6 L72 82 L74 78.6 L76 83.2 L78.2 79.4 L80.4 83.6 L82.4 79.6 L84.4 82.4 L86 79", "#f6efdc", 0.8),
    HL("M67 60 Q68 52 76 50", 1.2, 0.75), LN("M84 52 Q88 57 87 64", 0.7, INK, 0.5),
    // arrows in the skull
    LN("M80 56 L95 18", 1.6, INK), LN("M80 56 L95 18", 0.8, p.wood),
    P("M95 18 L90 13.5 L94 21Z M95 18 L99.5 14 L95.6 21.6Z", p.fletch, 0.6),
    LN("M86 60 L100 36", 1.6, INK), LN("M86 60 L100 36", 0.8, p.wood),
    P("M99.6 36.6 L95 33 L98 39Z", p.fletch, 0.6),
    `</g>`,
    // beard
    P("M34 50 Q29 70 37 85 Q43 95 50 99 Q57 95 63 85 Q71 70 66 50 Q58 57 50 57 Q42 57 34 50Z", p.beard, 1.7),
    SHADE("M58 56 Q66 52 66 50 Q71 70 63 85 Q57 95 50 99 Q60 84 60 66Z", 0.15),
    LN("M41 62 Q40 74 44 86 M46 62 Q45.5 76 48 92 M54 62 Q54.5 76 52 92 M59 62 Q60 74 56 86 M37 60 Q35.5 70 39 78 M63 60 Q64.5 70 61 78", 0.8, INK, 0.45),
    HL("M38 58 Q36 70 41 82", 1.1, 0.7),
    // horns
    P(hornL, HN, 1.6), P(MX(hornL), HN, 1.6),
    LN("M26 29 Q24 33 25 37.4 M19.6 26.4 Q17 30 18 34 M14 21 Q11.6 24 12.4 27.6", 0.8, INK, 0.55),
    LN(MX("M26 29 Q24 33 25 37.4 M19.6 26.4 Q17 30 18 34 M14 21 Q11.6 24 12.4 27.6"), 0.8, INK, 0.55),
    HL("M10 10 Q11.4 21 19 25", 1.1, 0.6), HL(MX("M10 10 Q11.4 21 19 25"), 1.1, 0.4),
    // helm
    P("M30.5 46 Q29 14 50 11.5 Q71 14 69.5 46 L69.5 51.5 Q60 56.5 50 56.5 Q40 56.5 30.5 51.5Z", HM, 2),
    SHADE("M58 13 Q71 16 69.5 46 L69.5 51.5 Q63 55 57 56 Q64 40 62 26 Q61 18 58 13Z", 0.22),
    HL("M35 40 Q34 22 45 16", 1.6, 0.7),
    P("M47.2 11.8 L52.8 11.8 L52.8 33 L47.2 33Z", HM, 1.2), HL("M48.6 14 L48.6 31", 0.8, 0.55),
    P("M31 31.5 Q50 25 69 31.5 L69 36.5 Q50 30 31 36.5Z", p.m3, 1.3),
    P("M35.5 36.6 Q50 31.8 64.5 36.6 L64.5 50.6 Q50 54.6 35.5 50.6Z", "#140b06", 1.2),
    `<ellipse cx="43" cy="41" rx="2.4" ry="1.2" fill="${p.eye}" opacity="0.85"/><ellipse cx="57" cy="41" rx="2.4" ry="1.2" fill="${p.eye}" opacity="0.85"/>`,
    P("M39.5 46 Q50 49.6 60.5 46 L60.4 49.2 Q50 53 39.6 49.2Z", "#f6efdc", 0.7),
    LN("M43 46.8 L43 50.4 M46.5 47.6 L46.5 51.4 M50 47.9 L50 51.8 M53.5 47.6 L53.5 51.4 M57 46.8 L57 50.4", 0.5),
    ...[38.6, 42.8, 47, 53, 57.2, 61.4].map((x) => LN(`M${x} ${x < 50 ? 35.4 - (50 - x) * -0.05 : 35.4} L${x} 52.6`, 3, INK) + LN(`M${x} 35.4 L${x} 52.4`, 1.6, p.m2)),
    ...[[33.4, 34], [66.6, 34], [32.8, 48.6], [67.2, 48.6], [50, 22], [50, 28]].map(([x, y]) => RIVET(x, y, 1, "#e6c690")),
  ].join("");
}

// ------------------------------------------------------------------ Battle mage: plate, chain, raised sword, cape
function battlemage(id, p) {
  const S = `url(#${id}s)`;
  const SK = `url(#${id}k)`;
  const pauldron = "M2 100 L3 80 Q5 64 20 61 Q33 59.5 38 67 Q40 82 34 100Z";
  const links = Array.from({ length: 11 }, (_, i) => {
    const t = i / 10;
    const x = 36.4 + 29.2 * t;
    const y = 74 + 4 * t * (1 - t) * 7;
    return i % 2
      ? `<ellipse cx="${r2(x)}" cy="${r2(y)}" rx="1.9" ry="1" fill="none" stroke="${INK}" stroke-width="2"/><ellipse cx="${r2(x)}" cy="${r2(y)}" rx="1.9" ry="1" fill="none" stroke="${p.chain}" stroke-width="1"/>`
      : `<ellipse cx="${r2(x)}" cy="${r2(y)}" rx="2.4" ry="1.7" fill="none" stroke="${INK}" stroke-width="2.2"/><ellipse cx="${r2(x)}" cy="${r2(y)}" rx="2.4" ry="1.7" fill="none" stroke="${p.chain}" stroke-width="1.1"/>`;
  });
  return [
    `<defs>${LIN(id + "s", [[0, p.s1], [0.5, p.s2], [1, p.s3]], [0, 0, 1, 0.4])}${LIN(id + "k", [[0, p.skinHi], [0.6, p.skin], [1, p.skinSh]], [0, 0, 1, 0.2])}${RAD(id + "g", [[0, p.glow, 1], [1, p.glow, 0]])}${LIN(id + "bl", [[0, "#ffffff"], [0.5, "#d6dee6"], [1, "#8d99a5"]], [0, 0, 1, 0])}</defs>`,
    // cape
    P("M0 100 L0 52 Q12 46 26 56 L32 100Z", p.cape, 1.6), LN("M8 60 Q12 80 8 100 M18 60 Q22 80 20 100", 0.8, INK, 0.4),
    P("M100 100 L100 56 Q90 50 76 58 L70 100Z", p.capeDk, 1.6),
    // raised arm with the sword
    `<g transform="translate(0 7)">`,
    `<circle cx="17" cy="4" r="14" fill="url(#${id}g)" opacity="0.45"/>`,
    P("M13.4 -2 L21.4 -2 L20.6 12.4 L17.4 15 L14.2 12.4Z", `url(#${id}bl)`, 1.3), HL("M15.6 0 L15.6 11", 0.8, 0.85), LN("M17.4 0 L17.4 12", 0.6, INK, 0.5),
    P("M3 12.6 Q17 10.2 31 12.6 L31 16.4 Q17 14 3 16.4Z", p.gold, 1.3), C(3, 14.5, 1.8, p.gold, 1), C(31, 14.5, 1.8, p.gold, 1),
    P("M8.6 23 Q8.6 16.4 15 16 L22 16 Q27 17.2 26.4 24 L24.6 31 L10 31.4Z", S, 1.6),
    LN("M11.6 20.4 L24 20 M11 24.4 L25 24 M11 28.4 L24.6 28", 0.8), HL("M10.6 22 Q11 18.4 14 17.6", 1, 0.8),
    C(17, 33.4, 2.4, p.gold, 1),
    P("M10.6 35.6 L7.6 64 L23 66 L24 35.6Z", S, 1.6),
    LN("M9.8 43 L23.6 43.6 M9 51 L23.2 51.8", 0.9), RIVET(13, 39.6, 0.9), RIVET(20.6, 39.8, 0.9), RIVET(12, 47.4, 0.9), RIVET(20, 47.8, 0.9),
    `</g>`,
    // hair (back)
    P("M30 46 Q25 22 44 16 Q64 11 73 27 Q80 44 76 68 Q73 79 65 77 Q69 60 67 46 L37 46 Q35 62 39 78 Q31 80 28 68 Q26 56 30 46Z", p.hair, 1.6),
    LN("M33 52 Q31 64 34 74 M70 50 Q72 62 70 72", 0.8, p.hairHi, 0.9),
    // neck and chest
    P("M44 60 L44 74 L58 74 L58 60Z", p.skinSh, 1.4),
    P("M25 100 L30 73.5 Q51 67.5 72 73.5 L77 100Z", S, 1.8),
    SHADE("M51 68 Q62 69.5 72 73.5 L77 100 L51 100Z", 0.16),
    P("M41 84 Q51 81 61 84 L60 97 Q51 100 42 97Z", S, 1.3), P("M46.6 88 L55.4 88 L55.4 95 L46.6 95Z", "none", 1),
    LN("M51 70 L51 82", 1), ...[[37, 82], [65, 82], [33, 94], [69, 94], [44, 92], [58, 92]].map(([x, y]) => RIVET(x, y, 0.9)),
    // pauldrons
    P(pauldron, S, 1.8), LN("M3 76 Q18 66 37.6 71 M2.6 88 Q18 79 36 83", 1.2),
    HL("M7 72 Q11 64 20 62.4", 1.3, 0.75),
    ...[[9, 71], [19, 67.4], [29, 67.8], [8, 83], [19, 79.6], [30, 80]].map(([x, y]) => RIVET(x, y, 1)),
    P(MX(pauldron), S, 1.8), LN(MX("M3 76 Q18 66 37.6 71 M2.6 88 Q18 79 36 83"), 1.2),
    SHADE(MX(pauldron), 0.14),
    ...[[9, 71], [19, 67.4], [29, 67.8], [8, 83], [19, 79.6], [30, 80]].map(([x, y]) => RIVET(100 - x, y, 1)),
    // chain between two bosses
    ...links,
    C(34, 74, 3.4, S, 1.3), RIVET(34, 74, 1.4), C(68, 74, 3.4, S, 1.3), RIVET(68, 74, 1.4),
    // face
    P("M37 41 Q37 27 51 27 Q65 27 65 41 Q65.4 55 58.6 61.6 Q51 66.6 43.4 61.6 Q36.6 55 37 41Z", SK, 1.8),
    SHADE("M56 28 Q65 30 65 41 Q65.4 55 58.6 61.6 Q54 64.6 50 65 Q60 54 59 40 Q58.4 32 56 28Z", 0.2),
    P("M39.4 40.6 L48.2 43.2 L48 45.4 L39.6 42.8Z", p.hair, 0.8), P(MX("M39.4 40.6 L48.2 43.2 L48 45.4 L39.6 42.8").replace(/(\d+\.?\d*) (\d+\.?\d*)/g, (_, x, y) => `${r2(+x + 2)} ${y}`), p.hair, 0.8),
    `<ellipse cx="44" cy="47.4" rx="5" ry="3" fill="url(#${id}g)"/><ellipse cx="58" cy="47.4" rx="5" ry="3" fill="url(#${id}g)"/>`,
    P("M40.4 47.6 Q44 45 47.6 47.4 Q44 49.4 40.4 47.6Z", "#f8fbff", 0.9), P("M54.4 47.4 Q58 45 61.6 47.6 Q58 49.4 54.4 47.4Z", "#f8fbff", 0.9),
    LN("M51 48 Q49.4 53.6 51 55.4 Q52.6 55.6 54 54.6", 0.9),
    LN("M46 59 Q51 57.4 56 59", 1.2), LN("M47.6 61.4 Q51 62.4 54.4 61.4", 0.7, INK, 0.5),
    LN("M41 52 Q43 54 46 54", 0.6, INK, 0.35),
    // hair (front)
    P("M36 44 Q34 24 51 21.5 Q68 22 66.5 42 Q63 30 55 28.6 Q48 32 42 30 Q38 34 36 44Z", p.hair, 1.5),
    P("M37 40 Q32 52 34 64 Q38 58 39.4 48Z", p.hair, 1.2), P("M65 40 Q69.6 52 68 62 Q64.6 56 63 48Z", p.hair, 1.2),
    LN("M42 25 Q47 23.5 54 24.5 M45 28 Q50 26 57 27.4", 0.8, p.hairHi, 0.9),
  ].join("");
}

// ------------------------------------------------------------------ Ranger: violet hair, fur cloak, her bear
function ranger(id, p) {
  const SK = `url(#${id}k)`;
  const HR = `url(#${id}h)`;
  const BR = `url(#${id}b)`;
  return [
    `<defs>${LIN(id + "k", [[0, p.skinHi], [0.6, p.skin], [1, p.skinSh]], [0, 0, 1, 0.2])}${LIN(id + "h", [[0, p.hairHi], [0.5, p.hair], [1, p.hairDk]], [0, 0, 1, 1])}${RAD(id + "b", [[0, p.bearLt], [0.7, p.bear], [1, p.bearDk]], [0.45, 0.4, 0.7])}</defs>`,
    // hair (back)
    P("M40 52 Q32 26 50 14 Q70 4 82 22 Q90 40 84 64 Q81 74 72 72 Q78 54 74 42 L48 42 Q44 56 49 72 Q40 72 40 52Z", HR, 1.6),
    P("M63 18 Q76 4 90 12 Q100 24 95 46 Q92 64 82 74 Q88 52 85 36 Q82 25 72 23Z", HR, 1.5),
    LN("M76 12 Q90 16 92 32 M86 30 Q90 46 86 62", 0.9, p.hairHi, 0.8),
    P("M62 19 Q64 13 70 13 Q68 17 68 21Z", p.band || p.hairDk, 1),
    LN("M76 30 Q82 44 78 60 M44 46 Q42 56 46 66", 0.9, p.hairHi, 0.8),
    // fur cloak and top
    P("M26 100 L28 86 L25 82 L31 79 Q34 68 46 66 L50 71 L54 66.6 L58 71.6 L62 66.6 L66 71.4 L70 66.4 L73 70.6 Q86 66 93 76 L97 74 L96 82 L100 86 L100 100Z", p.fur, 1.6),
    LN("M38 70 Q36 74 37.6 78 M86 74 Q88 78 86.4 82", 0.8, INK, 0.45),
    LN("M34 86 l3 -5 M40 78 l2 -5 M78 80 l2 -5 M86 88 l3 -5 M90 96 l2 -5", 0.8, INK, 0.5),
    SHADE("M71 72 Q84 68 92 78 L98 100 L74 100Z", 0.14),
    P("M47 100 L48.6 82 Q58 78.6 67.6 82 L69 100Z", p.top, 1.5), LN("M50 86 Q58 83.6 66 86", 0.8, INK, 0.5),
    P("M53 60 L53 74 L64 74 L64 60Z", p.skinSh, 1.3),
    C(50.4, 80, 2, p.button, 1), C(50.8, 88.6, 2, p.button, 1), C(50.4, 80, 0.5, INK, 0), C(50.8, 88.6, 0.5, INK, 0),
    // face
    P("M45.6 42 Q45.6 28.6 58.6 28.6 Q71.6 28.6 71.6 42 Q71.6 54 65 59.6 Q58.6 63.6 52.2 59.6 Q45.6 54 45.6 42Z", SK, 1.7),
    SHADE("M63 29.6 Q71.6 32 71.6 42 Q71.6 54 65 59.6 Q61 62 57.6 62.6 Q66.6 52 66 40 Q65.6 33 63 29.6Z", 0.16),
    `<ellipse cx="50.6" cy="51.6" rx="3" ry="1.6" fill="#f08a78" opacity="0.35"/><ellipse cx="66.4" cy="51.6" rx="3" ry="1.6" fill="#f08a78" opacity="0.3"/>`,
    EYE(52.6, 45.6, p.eye, { w: 3.8, open: 3, look: 0.6 }), EYE(64.4, 45.6, p.eye, { w: 3.8, open: 3, look: 0.6 }),
    LN("M48.4 40.6 Q52 38.6 56 40", 1.2, p.hairDk), LN("M61 40 Q65 38.6 68.6 40.8", 1.2, p.hairDk),
    LN("M58.8 47 Q57.8 51.6 59 53 Q60.2 53.4 61.2 52.6", 0.8),
    P("M55.4 56.6 Q58.8 55.4 62.4 56.6 Q59 59.6 55.4 56.6Z", "#c9566a", 0.7),
    // hair (front)
    P("M44 46 Q41 24 60 20 Q78 18 74 42 Q69 30 60 28 Q54 32 47.6 47Z", HR, 1.5),
    P("M47 42 Q40 58 45.6 70 Q49 58 50.4 46Z", HR, 1.3),
    LN("M50 24 Q58 21 68 23 M48 30 Q54 26 62 27", 0.9, p.hairHi, 0.9),
    // the bear
    P("M0 100 L0 70 Q2 58 12 55.4 L16 56.6 Q26 53.4 34 57.4 Q42 62 44 72 Q46 84 40 92 L38 100Z", BR, 1.8),
    P("M4.6 61 Q2.4 53.6 7.4 51.6 Q12.6 51 13.4 56.4Z", p.bear, 1.5), P("M6.6 58.4 Q5.8 55.4 8 54.6 Q10.4 54.6 11 57Z", p.bearDk, 0),
    P("M28.4 55.6 Q30 50.6 35.4 51.4 Q39.4 54 37.4 59.4Z", p.bear, 1.5), P("M30.6 56 Q31.6 53.4 34.4 53.8 Q36.4 55.4 35.4 58Z", p.bearDk, 0),
    LN("M6 66 l2.4 -3 M12 62 l2 -3.4 M19 60.6 l1 -3.6 M26 61 l1.6 -3.4 M33 63.6 l2.4 -3 M38 68 l2.6 -2.4 M4 78 l-2.6 -1.6 M40 80 l2.6 -1", 0.8, INK, 0.45),
    P("M8.6 67.4 Q14 64.4 19.4 67.6 Q14 66.6 8.6 67.4Z", p.bearDk, 0.9), P("M25.6 67.6 Q31 64.6 36.4 67.6 Q31 66.6 25.6 67.6Z", p.bearDk, 0.9),
    LN("M11 71.6 Q14.4 70 17.6 71.8", 1.4), LN("M27.4 71.8 Q30.6 70 34 71.6", 1.4),
    P("M12 78 Q12.6 70 22.4 70 Q32.2 70 32.8 78 L32 88 Q28 94.6 22.4 94.6 Q16.8 94.6 12.8 88Z", p.snout, 1.5),
    SHADE("M22.4 70 Q32.2 70 32.8 78 L32 88 Q28 94.6 22.4 94.6 Q28 86 27.6 76Z", 0.14),
    P("M17.6 79.6 Q22.4 76.6 27.2 79.6 Q26.4 84.4 22.4 85.4 Q18.4 84.4 17.6 79.6Z", "#1d120c", 1),
    `<ellipse cx="20.8" cy="79.4" rx="1.6" ry="0.7" fill="#fff" opacity="0.6"/>`,
    LN("M22.4 85.4 L22.4 89 Q19.4 92 16.4 90 M22.4 89 Q25.4 92 28.4 90", 1.1),
    p.band ? LN("M44.4 34 Q59 26 73.4 33", 2.6, INK) + LN("M44.4 34 Q59 26 73.4 33", 1.4, p.band) : "",
  ].join("");
}

// ------------------------------------------------------------------ Acrobat: locks flying back, three floating daggers
function dagger(x, y, rot, p) {
  return `<g transform="translate(${x} ${y}) rotate(${rot})">${[
    `<circle cx="0" cy="-15" r="2.6" fill="none" stroke="${INK}" stroke-width="2.4"/><circle cx="0" cy="-15" r="2.6" fill="none" stroke="${p.gold}" stroke-width="1.2"/>`,
    P("M-1.4 -12.6 L1.4 -12.6 L1.6 -5 L-1.6 -5Z", p.grip, 0.9),
    P("M-5 -5.2 L5 -5.2 L4.4 -3 L-4.4 -3Z", p.gold, 0.9),
    P("M-2.2 -3 L2.2 -3 L1.6 14 L0 18 L-1.6 14Z", `url(#${p.id}bl)`, 1),
    HL("M-0.8 -1.6 L-0.6 13", 0.6, 0.8),
  ].join("")}</g>`;
}
function acrobat(id, p) {
  const SK = `url(#${id}k)`;
  const locks = [
    ["M47 24 Q62 15 80 13 Q88 12.6 92 15", 4.6],
    ["M50 27 Q66 21 84 22 Q92 22.6 97 26", 4.6],
    ["M52 31 Q68 29 86 33 Q93 35 98 40", 4.6],
    ["M53 35.6 Q68 37 82 44 Q88 47.6 92 53", 4.4],
    ["M52 40 Q63 44.6 72 52 Q77 57 79 62", 4.2],
    ["M44 22 Q55 13 70 9 Q78 7.4 84 8", 4.2],
  ];
  return [
    `<defs>${LIN(id + "k", [[0, p.skinHi], [0.6, p.skin], [1, p.skinSh]], [0, 0, 1, 0.25])}${LIN(id + "bl", [[0, "#ffffff"], [0.5, "#d6dee6"], [1, "#8d99a5"]], [0, 0, 1, 0])}${RAD(id + "g", [[0, p.glow, 0.85], [1, p.glow, 0]])}</defs>`,
    // locks streaming back
    ...locks.map(([d, w]) => LN(d, w + 1.8, INK) + LN(d, w, p.hair) + LN(d, 1, p.hairHi, 0.55)),
    ...locks.map(([d]) => {
      const m = d.match(/(-?\d+\.?\d*) (-?\d+\.?\d*)$/);
      return m ? C(+m[1], +m[2], 1.6, p.bead, 0.8) : "";
    }),
    // shoulders, collar and top
    P("M38.6 54 L38.4 71 L50.8 71 L50.4 54Z", p.skinSh, 1.3),
    P("M6 100 Q8 80 26 74 Q38 70 46 71.6 Q56 70 66 75 Q76 81 78 100Z", SK, 1.7),
    SHADE("M56 71 Q66 75 76 82 L78 100 L60 100Z", 0.14),
    P("M29 100 L33 80 Q46 75.4 59 80 L63 100Z", p.leather, 1.6),
    LN("M33 80 L40 72.6 M59 80 L52 72.6", 1.6, INK), LN("M33 80 L40 72.6 M59 80 L52 72.6", 0.8, p.leather),
    C(46, 89.6, 4.4, p.leatherDk, 1), LN("M46 89.6 m-2.4 0 a2.4 2.4 0 1 1 2.4 2.4 a1.2 1.2 0 1 1 -1.2 -1.2", 0.9, p.gold),
    P("M36.8 65.6 Q44.6 71.6 52.4 65.6 L52.6 69.6 Q44.6 75.6 36.6 69.6Z", p.leatherDk, 1.2), C(44.6, 71.6, 1.6, p.gold, 0.8),
    P("M10.6 88 L22.6 84.6 L23.6 88.6 L11.6 92Z", p.leatherDk, 1.1),
    // face
    P("M31 40 Q31 25.6 44.4 25.6 Q57.6 25.6 57.6 40 Q57.6 52.6 51 58.6 Q44.4 63 37.8 58.6 Q31 52.6 31 40Z", SK, 1.7),
    SHADE("M50 26.6 Q57.6 29 57.6 40 Q57.6 52.6 51 58.6 Q48 61 44.4 61.6 Q53 51 52.6 40 Q52.4 32 50 26.6Z", 0.16),
    EYE(38.6, 44.2, p.eye, { w: 3.8, open: 2.6, look: 1 }), EYE(50.6, 44.2, p.eye, { w: 3.8, open: 2.6, look: 1 }),
    P("M34 39.6 L42.4 40.2 L42.4 41.6 L34.2 41.4Z", p.hair, 0.6), P("M46.6 40.4 L55 39.4 L55 41 L46.6 41.8Z", p.hair, 0.6),
    LN("M44.6 45.4 Q43.4 50.6 44.8 52 Q46.4 52.4 47.6 51.4", 0.8),
    P("M40.6 55 Q44.6 53.8 48.6 55 Q44.6 58.4 40.6 55Z", p.lips, 0.8), LN("M40.8 55.2 Q44.6 56 48.4 55.2", 0.6),
    `<ellipse cx="34.6" cy="50" rx="2.4" ry="1.4" fill="#d8826a" opacity="0.3"/>`,
    // hair cap and band
    P("M29.6 41 Q27.6 22 44 19.6 Q58.6 19.6 59 36 Q52 28 42 29.4 Q34 31 29.6 41Z", p.hair, 1.6),
    LN("M31.6 33 Q40 26 52 27.4", 2.8, INK), LN("M31.6 33 Q40 26 52 27.4", 1.6, p.gold),
    C(30.6, 49.6, 1.4, p.gold, 0.7),
    // raised hand and the floating daggers
    `<circle cx="80" cy="50" r="26" fill="url(#${id}g)" opacity="0.5"/>`,
    dagger(70.6, 50, -8, { ...p, id }), dagger(80.4, 44, 0, { ...p, id }), dagger(90.2, 50, 8, { ...p, id }),
    ...[[66, 31], [94, 33], [86, 23], [74, 25]].map(([x, y]) => `<path d="M${x} ${y - 2.4} L${x + 0.6} ${y - 0.6} L${x + 2.4} ${y} L${x + 0.6} ${y + 0.6} L${x} ${y + 2.4} L${x - 0.6} ${y + 0.6} L${x - 2.4} ${y} L${x - 0.6} ${y - 0.6}Z" fill="#fff" opacity="0.85"/>`),
    P("M58 100 L66 84 Q70 78 76 77 L80 72.6 Q82 70.6 83.6 72.4 L82.4 76.4 L86 71 Q88 69.4 89.6 71 L87.4 76.8 L91 72.4 Q93 71.4 94 73.4 L91 79 L94 77 Q96.4 76.6 96.4 79 L91 86 Q86 90 79 90 L74 100Z", SK, 1.5),
    LN("M80 80 Q84 82 89 80", 0.6, INK, 0.6),
    P("M58.6 100 L64 88.6 L74.4 93 L71 100Z", p.leatherDk, 1.2), LN("M61 95 L71.6 98 M62.6 91.4 L73 95", 0.6, p.gold),
  ].join("");
}

const PAL = {
  warrior: {
    a: { s1: "#f2f6f9", s2: "#a9bccc", s3: "#5d7186", h1: "#4a4658", h2: "#8f8aa0", rivet: "#e7eef3" },
  },
  barbarian: {
    a: { m1: "#d29a62", m2: "#9a6436", m3: "#5a361a", h1: "#f3e6c6", h2: "#a8875a", beard: "#f6f2ea", fur: "#b98d5a", bone: "#efe2c4", leather: "#7a4a26", iron: "#8e9aa4", wood: "#8a5a2b", fletch: "#e8e0cf", eye: "#ffb347" },
  },
  battlemage: {
    a: { skin: "#7a4f36", skinHi: "#9c6a4a", skinSh: "#55331f", hair: "#1c1a2e", hairHi: "#4a4a74", s1: "#f2f5f8", s2: "#a9b6c2", s3: "#5c6a78", cape: "#a3262c", capeDk: "#6a141a", chain: "#c9d1d8", grip: "#7a4a26", gold: "#d9a43b", glow: "#ffffff" },
  },
  ranger: {
    a: { skin: "#f4d2b8", skinHi: "#fde6d4", skinSh: "#d6a588", hair: "#8a5ab0", hairHi: "#c79be6", hairDk: "#4f2f6e", eye: "#3f7ab8", fur: "#f4efe4", top: "#8f9d5c", button: "#e8d6b0", bear: "#7a5232", bearLt: "#a8784e", bearDk: "#4a2e18", snout: "#c9a17a" },
  },
  acrobat: {
    a: { skin: "#8a5a3a", skinHi: "#ab7550", skinSh: "#643c24", hair: "#2a1e28", hairHi: "#6a5a68", bead: "#e2b23b", eye: "#5a3a1c", lips: "#6a2e2a", leather: "#c08850", leatherDk: "#7e532c", gold: "#e2b23b", grip: "#6b3f1f", glow: "#9fe8ff" },
  },
};

const DRAW = { warrior, barbarian, battlemage, ranger, acrobat };
export const RAW_HERO_KEYS = Object.keys(DRAW);
export const rawHeroArt = (key) => DRAW[key](`rp-${key}`, PAL[key].a);

// ------------------------------------------------------------------ Battle arena tile (drawn over the tile's floor)
const pol = (r, deg) => [r2(50 + Math.cos((deg * Math.PI) / 180) * r), r2(50 + Math.sin((deg * Math.PI) / 180) * r)];
function arc(r1, r0, a0, a1) {
  const [x0, y0] = pol(r1, a0);
  const [x1, y1] = pol(r1, a1);
  const [x2, y2] = pol(r0, a1);
  const [x3, y3] = pol(r0, a0);
  const big = a1 - a0 > 180 ? 1 : 0;
  return `M${x0} ${y0} A${r1} ${r1} 0 ${big} 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 ${big} 0 ${x3} ${y3}Z`;
}
function goldSword(rot, p) {
  return `<g transform="rotate(${rot} 50 50)">${[
    P("M48.4 30 L51.6 30 L51.4 58 L50 62 L48.6 58Z", p.swordBlade, 1.1),
    HL("M49.4 32 L49.4 57", 0.6, 0.7),
    P("M44 59.6 L56 59.6 L55.4 62.4 L44.6 62.4Z", p.swordGuard, 1),
    P("M48.9 62.4 L51.1 62.4 L51.1 68.6 L48.9 68.6Z", p.grip, 0.8),
    C(50, 70, 1.6, p.swordGuard, 0.8),
  ].join("")}</g>`;
}
function arena(id, p) {
  const walls = [[-68, 68], [112, 248]];
  const bricks = walls.flatMap(([a0, a1]) => {
    const out = [P(arc(45.5, 37.5, a0, a1), `url(#${id}w)`, 1.6)];
    for (let a = a0 + 12; a < a1 - 4; a += 13.6) out.push(LN(`M${pol(45.5, a).join(" ")} L${pol(41.5, a).join(" ")}`, 0.9));
    for (let a = a0 + 5.2; a < a1 - 4; a += 13.6) out.push(LN(`M${pol(41.5, a).join(" ")} L${pol(37.5, a).join(" ")}`, 0.9));
    out.push(LN(arc(41.5, 41.5, a0, a1).split("L")[0], 0.8));
    out.push(HL(`M${pol(44.6, a0 + 6).join(" ")} A44.6 44.6 0 0 1 ${pol(44.6, a1 - 6).join(" ")}`, 0.8, 0.25));
    return out;
  });
  const cobbles = [];
  for (let ring = 0; ring < 2; ring++) {
    const r = 30.6 + ring * 3.8;
    const n = 30 + ring * 4;
    for (let i = 0; i < n; i++) {
      const a = (360 / n) * (i + (ring ? 0.5 : 0));
      const [x, y] = pol(r, a);
      cobbles.push(`<ellipse cx="${x}" cy="${y}" rx="2" ry="1.5" transform="rotate(${r2(a + 90)} ${x} ${y})" fill="${i % 3 ? p.cobble : p.cobbleLt}" stroke="#4a463f" stroke-width="0.5"/>`);
    }
  }
  const pillar = (a) => {
    const [x, y] = pol(41.5, a);
    return `<circle cx="${r2(x + 0.8)}" cy="${r2(y + 1.2)}" r="6.6" fill="#000" opacity="0.35"/>` + C(x, y, 6.2, `url(#${id}p)`, 1.6) + C(x, y, 4, "none", 0.7) + HL(`M${r2(x - 3.6)} ${r2(y - 1)} Q${r2(x - 2.4)} ${r2(y - 3.6)} ${r2(x + 0.4)} ${r2(y - 4.2)}`, 0.9, 0.7) +
      (p.fire ? `<circle cx="${x}" cy="${y}" r="7" fill="url(#${id}f)"/>` + P(`M${x} ${r2(y + 2.4)} q-2.6 -3.4 0 -7.6 q2.6 4 0 7.6z`, "#ffd54a", 0.7) : "");
  };
  const skull = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">${P("M-3.4 0 Q-3.4 -4 0 -4 Q3.4 -4 3.4 0 Q3.4 2 2 2.4 L2 3.6 L-2 3.6 L-2 2.4 Q-3.4 2 -3.4 0Z", "#efe6cf", 0.8)}<circle cx="-1.3" cy="-0.4" r="0.9" fill="#2b2117"/><circle cx="1.3" cy="-0.4" r="0.9" fill="#2b2117"/></g>`;
  const looseSword = (x, y, rot, s = 1) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">${P("M-0.9 -10 L0.9 -10 L0.8 5 L-0.8 5Z", "#dfe5ea", 0.7)}${P("M-3.4 5 L3.4 5 L3.4 6.4 L-3.4 6.4Z", "#8a8f98", 0.6)}${P("M-0.7 6.4 L0.7 6.4 L0.7 10 L-0.7 10Z", "#6b3f1f", 0.5)}</g>`;
  return [
    `<defs>${LIN(id + "w", [[0, p.brickLt], [1, p.brick]], [0, 0, 1, 1])}${RAD(id + "p", [[0, "#cfcac2"], [0.7, "#8f8a82"], [1, "#5a564f"]], [0.38, 0.35, 0.7])}${RAD(id + "r", [[0, p.floorLt], [0.75, p.floor], [1, p.floorDk]])}${RAD(id + "f", [[0, "#fff3b0", 0.9], [0.4, "#ffb23a", 0.6], [1, "#ff7a1a", 0]])}</defs>`,
    `<circle cx="50" cy="50" r="46" fill="#000" opacity="0.25"/>`,
    ...bricks,
    C(50, 50, 37.6, p.cobbleBase, 1.4),
    ...cobbles,
    C(50, 50, 28.4, `url(#${id}r)`, 1.8),
    C(50, 50, 25, "none", 0), LN(arc(25, 25, 0, 359.9).split("L")[0], 1.1, p.floorDk, 0.9),
    p.emblem
      ? P("M50 36 L60 40 L60 52 Q60 61 50 65 Q40 61 40 52 L40 40Z", p.swordGuard, 1.4) + P("M50 39.6 L57 42.4 L57 52 Q57 58.4 50 61.4 Q43 58.4 43 52 L43 42.4Z", p.floorDk, 0.8)
      : "",
    goldSword(45, p), goldSword(-45, p),
    looseSword(25, 33, 62), skull(30.6, 26.4, 1),
    `<g transform="translate(72 28)">${C(0, 0, 5.4, p.shield, 1.2)}${C(0, 0, 4, "none", 0.6)}${C(0, 0, 1.4, "#c9a64a", 0.6)}</g>`,
    looseSword(75, 70, -30, 0.9),
    ...[-68, 68, 112, 248].map(pillar),
  ].join("");
}

// ------------------------------------------------------------------ Frost fist (spell)
export function frostFistArt() {
  const arrows = Array.from({ length: 8 }, (_, i) => {
    const a = i * 45 + 22.5;
    const pts = [];
    for (let k = 0; k <= 5; k++) {
      const r = 21 + k * 3.6;
      const off = k === 0 || k === 5 ? 0 : k % 2 ? 2.4 : -2.4;
      const [x, y] = pol(r, a);
      const [ox, oy] = [Math.cos(((a + 90) * Math.PI) / 180) * off, Math.sin(((a + 90) * Math.PI) / 180) * off];
      pts.push(`${r2(x + ox)} ${r2(y + oy)}`);
    }
    const [tx, ty] = pol(41.5, a);
    const [l1x, l1y] = pol(36.5, a - 7);
    const [l2x, l2y] = pol(36.5, a + 7);
    const d = `M${pts.join(" L")}`;
    return LN(d, 3.6, INK) + LN(d, 1.9, "#8fdcff") + P(`M${tx} ${ty} L${l1x} ${l1y} L${l2x} ${l2y}Z`, "#8fdcff", 1);
  });
  const fist = [
    P("M41.6 61 L58.4 61 L58 70.4 L42 70.4Z", "#d9ecf8", 1.6),
    P("M35.6 44 Q35.6 35.6 43 35.6 L60 35.6 Q66 36.6 66 43.6 L66 55.6 Q64 63.6 56 63.6 L44 63.6 Q35.6 62 35.6 54Z", "#ffffff", 1.8),
    ...[36.6, 44, 51.4, 58.8].map((x) => `<rect x="${x}" y="34.4" width="7.2" height="13.4" rx="3.4" fill="#ffffff" stroke="${INK}" stroke-width="1.4"/>`),
    LN("M37.4 44.6 L65 44.6", 0.7, INK, 0.5),
    P("M35.8 50 Q29.6 51.6 31.6 57.6 Q35.4 61.6 48.6 57.6 L50.6 53.4 Q42 54 37.6 50Z", "#ffffff", 1.6),
    SHADE("M58 36 Q66 37 66 43.6 L66 55.6 Q64 63.6 56 63.6 L52 63.6 Q61 56 60 36Z", 0.12, "#2a6fa8"),
    HL("M39 38 L39 44 M46.4 38 L46.4 44", 0.9, 0.9),
  ];
  return [...arrows, ...fist].join("");
}

const ARENA = {
  a: { brick: "#5a3a30", brickLt: "#8a5a48", cobbleBase: "#8c877e", cobble: "#b9b4ac", cobbleLt: "#d6d2ca", floor: "#c8402a", floorLt: "#de5a3c", floorDk: "#8a2418", swordBlade: "#f6d470", swordGuard: "#e2a52b", grip: "#7a4a22", shield: "#a3262c" },
};
export const arenaTileArt = () => arena("ra", ARENA.a);
