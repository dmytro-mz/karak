// Hero busts for Karak: Sidhar, Kirima, Elspeth: raw SVG in a 100×100 box, two versions of each hero.
// Original drawings that follow the illustrations of the expansion (Roman Hladík): Sidhar's steel pauldrons, goggles
// and green potion; Kirima's polar-bear hood, face paint and spiked club; Elspeth's twin swords, cape and golden hair.

import { C, EL, EYE, HL, INK, LIN, LN, MX, P, r2, RAD, RIVET, SHADE } from "./regent_portraits.js";

const bubbles = (list, c = "#d8ffa0") => list.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity="0.8" stroke="${INK}" stroke-width="0.5"/>`).join("");

// ------------------------------------------------------------------ Sidhar the Alchemist
// A: the illustration as drawn: steel back-dome with two yellow lamps, pauldrons the size of his head, a pink-lensed
// goggle over the stitched leather cap, a white beard, the green vial in his hand.
function alchemistA(id) {
  const ST = `url(#${id}s)`;
  const STD = `url(#${id}d)`;
  const LEA = `url(#${id}l)`;
  const GL = `url(#${id}g)`;
  const pauldron = "M0 100 L1 78 Q2 58 19 54 Q36 52 43 64 Q46 82 40 100Z";
  const side = (mirror) => {
    const f = mirror ? MX : (d) => d;
    const rv = (x, y) => RIVET(mirror ? 100 - x : x, y, 1.1, "#f2f4f9");
    return [
      P(f(pauldron), ST, 1.9),
      LN(f("M2 70 Q20 61 42 69"), 1.3), HL(f("M3 71.4 Q20 62.6 41 70.4"), 0.8, 0.5),
      LN(f("M1.4 84 Q20 75 40.6 84"), 1.3), HL(f("M2 85.4 Q20 76.6 40 85.4"), 0.8, 0.45),
      HL(f("M6 66 Q9 58 19 56.5"), 1.5, 0.8),
      SHADE(f("M30 54 Q42 58 43 66 Q46 82 40 100 L30 100 Q35 80 30 54Z"), 0.2, "#2a2850"),
      rv(8, 63), rv(18, 59.5), rv(30, 60), rv(7, 77), rv(19, 73), rv(33, 74), rv(7, 92), rv(20, 88), rv(34, 89),
    ].join("");
  };
  return [
    `<defs>${LIN(id + "s", [[0, "#f1f0fa"], [0.5, "#a9a7c6"], [1, "#5d5a82"]], [0, 0, 1, 0.5])}${LIN(id + "d", [[0, "#cfcde4"], [1, "#6d6a92"]])}${LIN(id + "l", [[0, "#a06a3c"], [1, "#5e3a1e"]], [0, 0, 0, 1])}${RAD(id + "g", [[0, "#ffb6ec"], [0.6, "#e54dbd"], [1, "#8c1f77"]], [0.38, 0.35, 0.7])}</defs>`,
    // leather straps looping over the back of the steel dome
    // the steel back-dome with its two yellow lamps
    P("M22 62 Q18 22 50 10 Q82 22 78 62Z", STD, 2),
    P("M26 58 Q24 28 50 15 Q76 28 74 58Z", ST, 1.6),
    HL("M30 36 Q36 22 50 18", 1.6, 0.8),
    LN("M26 58 Q50 50 74 58", 1.2),
    `<circle cx="40" cy="19.5" r="4.6" fill="#ffe36a" stroke="${INK}" stroke-width="1.5"/><circle cx="60" cy="19.5" r="4.6" fill="#ffe36a" stroke="${INK}" stroke-width="1.5"/><circle cx="38.6" cy="18" r="1.4" fill="#fff"/><circle cx="58.6" cy="18" r="1.4" fill="#fff"/>`,
    // brown torso, green sash with the buckle
    P("M30 100 L34 74 Q50 68 66 74 L70 100Z", LEA, 1.8),
    P("M30 100 L58 72 L66 74 L70 80 L44 100Z", "#8a9a3a", 1.5),
    LN("M33 98 L60 74", 0.8, "#d3dd7a", 0.7),
    P("M47 84 L56 76 L62 83 L53 91Z", "#3a2a1a", 1.4), P("M50.4 83.4 L56 79 L59 83 L53.4 87.4Z", "#c8a24a", 0.9), LN("M52.4 84.4 L55.8 81.4 L58 83.8", 0.8),
    side(false), side(true),
    // olive arm bands
    P("M2 96 L14 100 L2 100Z", "#8a9a3a", 1),
    // vials on the strap
    P("M30 78 L36 78 L36 96 Q36 100 33 100 Q30 100 30 96Z", "rgba(180,255,120,0.55)", 1.3), P("M31 86 L35 86 L35 96 Q35 99 33 99 Q31 99 31 96Z", "#8ee03a", 0),
    LN("M30.6 79 L30.6 84", 0.8, "#fff", 0.8), P("M30.5 76 L35.5 76 L35.5 79 L30.5 79Z", "#c8a24a", 0.9),
    P("M38 80 L43 80 L43 97 Q43 100 40.5 100 Q38 100 38 97Z", "rgba(180,255,120,0.55)", 1.3), P("M39 88 L42 88 L42 97 Q42 99 40.5 99 Q39 99 39 97Z", "#8ee03a", 0),
    P("M37.8 77.4 L43.2 77.4 L43.2 80.4 L37.8 80.4Z", "#c8a24a", 0.9),
    // neck and the face, framed by the cap
    P("M43 52 L57 52 L57 66 Q50 70 43 66Z", "#d9a77c", 1.4),
    P("M34 38 Q33 24 50 22 Q67 24 66 38 Q67 54 58 60 Q50 64 42 60 Q33 54 34 38Z", "#f4cfae", 1.8),
    SHADE("M58 24 Q67 26 66 38 Q67 54 58 60 Q54 62 52 62.6 Q62 52 61 38 Q60 28 58 24Z", 0.15),
    P("M36.4 28.4 Q36 21 50 19.6 Q64 21 63.6 28.4 L63.6 34 Q50 28 36.4 34Z", "#9a6334", 1.7),
    P("M34 31 Q28 42 33 56 Q36 50 37 42Z", "#8a5a30", 1.4), P("M66 31 Q72 42 67 56 Q64 50 63 42Z", "#8a5a30", 1.4),
    LN("M50 20 L50 30", 0.9, INK, 0.7), LN("M46.4 21.4 L46.4 26 M53.6 21.4 L53.6 26 M42 24 L42 28 M58 24 L58 28", 0.7, INK, 0.5),
    HL("M40 24 Q46 20 52 20", 1.2, 0.5),
    // goggles with their pink lenses and a leather strap
    P("M34 36.6 L66 36.6 L66 40.4 L34 40.4Z", "#6a4020", 1.1),
    `<circle cx="43" cy="39" r="7.4" fill="#b78a3c" stroke="${INK}" stroke-width="1.5"/><circle cx="57" cy="39" r="7.4" fill="#b78a3c" stroke="${INK}" stroke-width="1.5"/>`,
    `<circle cx="43" cy="39" r="5.6" fill="${GL}" stroke="${INK}" stroke-width="1"/><circle cx="57" cy="39" r="5.6" fill="${GL}" stroke="${INK}" stroke-width="1"/>`,
    `<ellipse cx="41.2" cy="37" rx="2" ry="1.3" fill="#fff" opacity="0.85"/><ellipse cx="55.2" cy="37" rx="2" ry="1.3" fill="#fff" opacity="0.85"/>`,
    `<circle cx="43.4" cy="39.4" r="1.4" fill="#5a0f48" opacity="0.8"/><circle cx="57.4" cy="39.4" r="1.4" fill="#5a0f48" opacity="0.8"/>`,
    P("M47 38.4 L53 38.4 L53 40.6 L47 40.6Z", "#b78a3c", 0.9),
    // nose, moustache and the great white beard
    P("M47.6 42 Q50 49 52.4 42 Q54 46.6 50 49.6 Q46 46.6 47.6 42Z", "#e3b08a", 1),
    P("M33 50 Q27 70 38 80 Q44 87 50 90 Q56 87 62 80 Q73 70 67 50 Q60 59 50 58 Q40 59 33 50Z", "#f6f2ea", 1.8),
    SHADE("M58 58 Q67 54 67 50 Q73 70 62 80 Q56 87 50 90 Q59 76 58 58Z", 0.14, "#4a4660"),
    LN("M40 62 Q39 72 43 80 M45 62 Q44.4 74 47 84 M55 62 Q55.6 74 53 84 M60 62 Q61 72 57 80 M36 58 Q35 66 38 72 M64 58 Q65 66 62 72", 0.8, "#8a8aa0", 0.6),
    P("M31 49 Q35 56 48 53 Q50 50 50 49 Q50 50 52 53 Q65 56 69 49 Q66 58 50 59 Q34 58 31 49Z", "#fffdf6", 1.5),
    P("M32 47 Q27 46 28 51 Q31 52 34 50Z M68 47 Q73 46 72 51 Q69 52 66 50Z", "#fffdf6", 1.2),
    HL("M38 53 Q43 55 48 54", 1, 0.8),
    // the potion in his hand: a green flask
    P("M64 100 L68 90 Q72 84 79 83 L86 82 Q92 81 96 86 L98 96 L96 100Z", "#e7b88e", 1.6),
    LN("M80 90 Q84 92 90 90", 0.7, INK, 0.6),
    `<ellipse cx="82" cy="70" rx="12.4" ry="12" fill="#8ee03a" opacity="0.35"/>`,
    P("M75 62 Q70 70 74 78 Q80 84 88 80 Q94 74 90 64 Q86 60 81 61 Q78 61.4 75 62Z", "#9aea3e", 1.7),
    P("M75 70 Q74 76 80 80 Q86 82 90 76 Q84 72 75 70Z", "#62c01c", 0),
    P("M76 54 L86 54 L85 62 L77 62Z", "rgba(255,255,255,0.45)", 1.4), P("M75 51 L87 51 L87 55 L75 55Z", "#c8a24a", 1.2),
    P("M78 45 L84 45 L85 51 L77 51Z", "#8a5a30", 1.2),
    HL("M77 66 Q78 62.6 81 62", 1.2, 0.85),
    bubbles([[82, 68, 1.6], [86, 73, 1.1], [79, 74, 0.9]]),
  ].join("");
}

// B: leaning in: his face fills the frame, the goggle lenses glow, a sinister smile of potions across the chest,
// green steam curling from the vial.
function alchemistB(id) {
  const ST = `url(#${id}s)`;
  const LEA = `url(#${id}l)`;
  const GL = `url(#${id}g)`;
  const lens = (x) => `<circle cx="${x}" cy="40" r="9.2" fill="#c89440" stroke="${INK}" stroke-width="1.7"/><circle cx="${x}" cy="40" r="7" fill="${GL}" stroke="${INK}" stroke-width="1.1"/><ellipse cx="${x - 2.4}" cy="37.2" rx="2.6" ry="1.6" fill="#fff" opacity="0.9"/><circle cx="${x + 0.6}" cy="41" r="1.8" fill="#5a0f48" opacity="0.85"/>`;
  return [
    `<defs>${LIN(id + "s", [[0, "#f1f0fa"], [0.5, "#a9a7c6"], [1, "#5d5a82"]], [0, 0, 1, 0.6])}${LIN(id + "l", [[0, "#9a6234"], [1, "#552f16"]])}${RAD(id + "g", [[0, "#ffd0f6"], [0.5, "#ff5fd0"], [1, "#8c1f77"]], [0.4, 0.35, 0.72])}${RAD(id + "n", [[0, "#baff6a", 0.8], [1, "#baff6a", 0]])}</defs>`,
    `<circle cx="50" cy="50" r="48" fill="url(#${id}n)"/>`,
    // pauldrons
    P("M0 100 L0 80 Q2 62 18 60 Q30 58 34 70 Q36 86 30 100Z", ST, 1.9), P("M100 100 L100 80 Q98 62 82 60 Q70 58 66 70 Q64 86 70 100Z", ST, 1.9),
    HL("M4 68 Q8 62 17 62", 1.4, 0.85), HL("M96 68 Q92 62 83 62", 1.4, 0.85),
    LN("M1 78 Q16 70 33 76 M99 78 Q84 70 67 76", 1.1), LN("M1 90 Q16 82 31 88 M99 90 Q84 82 69 88", 1.1),
    ...[[8, 70], [20, 66], [10, 84], [22, 81], [92, 70], [80, 66], [90, 84], [78, 81]].map(([x, y]) => RIVET(x, y, 1.1, "#f2f4f9")),
    // chest: brown vest, green sash, three vials
    P("M28 100 L32 76 Q50 70 68 76 L72 100Z", LEA, 1.8),
    P("M28 100 L56 74 L64 76 L68 82 L42 100Z", "#8a9a3a", 1.5),
    ...[[44, "#8ee03a"], [52, "#ff9a3c"], [60, "#c77dff"]].map(([x, c]) =>
      P(`M${x - 2.6} 84 L${x + 2.6} 84 L${x + 3} 96 Q${x + 3} 100 ${x} 100 Q${x - 3} 100 ${x - 3} 96Z`, "rgba(255,255,255,0.5)", 1.2) +
      P(`M${x - 2.1} 90 L${x + 2.1} 90 L${x + 2.5} 96 Q${x + 2.5} 99 ${x} 99 Q${x - 2.5} 99 ${x - 2.5} 96Z`, c, 0) + P(`M${x - 2.2} 81 L${x + 2.2} 81 L${x + 2.6} 84 L${x - 2.6} 84Z`, "#c8a24a", 0.9),
    ),
    // neck, face, cap
    P("M42 56 L58 56 L58 70 Q50 75 42 70Z", "#d9a77c", 1.4),
    P("M29 41 Q28 22 50 20 Q72 22 71 41 Q72 58 60 64 Q50 69 40 64 Q28 58 29 41Z", "#f4cfae", 1.9),
    SHADE("M60 22 Q72 24 71 41 Q72 58 60 64 Q55 67 52 67.6 Q64 56 63 40 Q62 28 60 22Z", 0.16),
    P("M31 33 Q28 14 50 11 Q72 14 69 33 Q60 24 50 24 Q40 24 31 33Z", "#9a6334", 1.8),
    P("M30 32 Q22 44 28 60 Q33 52 34 42Z", "#8a5a30", 1.5), P("M70 32 Q78 44 72 60 Q67 52 66 42Z", "#8a5a30", 1.5),
    LN("M50 12 L50 25 M42 14 Q40 20 41 25 M58 14 Q60 20 59 25 M35 20 L36 28 M65 20 L64 28", 0.8, INK, 0.55),
    HL("M38 17 Q44 12 52 12", 1.4, 0.55),
    P("M30 36.6 L70 36.6 L70 41 L30 41Z", "#6a4020", 1.1),
    lens(41), lens(59), P("M48 38.4 L52 38.4 L52 41.2 L48 41.2Z", "#c89440", 0.9),
    P("M44 22 Q50 20 56 22 L56 25 Q50 23.4 44 25Z", "#fffdf6", 0.9),
    P("M47 44 Q50 52 53 44 Q55 49.6 50 52.4 Q45 49.6 47 44Z", "#e3b08a", 1),
    // beard and moustache
    P("M28 54 Q22 76 36 88 Q43 95 50 98 Q57 95 64 88 Q78 76 72 54 Q62 64 50 62 Q38 64 28 54Z", "#f6f2ea", 1.9),
    LN("M38 68 Q36 80 42 90 M45 66 Q44 80 48 94 M55 66 Q56 80 52 94 M62 68 Q64 80 58 90", 0.8, "#8a8aa0", 0.6),
    P("M26 52 Q31 61 47 58 Q50 54 50 53 Q50 54 53 58 Q69 61 74 52 Q70 64 50 64 Q30 64 26 52Z", "#fffdf6", 1.6),
    P("M27 51 Q21 49 22 55 Q26 56 30 54Z M73 51 Q79 49 78 55 Q74 56 70 54Z", "#fffdf6", 1.3),
    HL("M34 57 Q40 60 47 59", 1, 0.8),
    // steam from the flask in his raised hand (right)
    LN("M84 38 Q80 30 85 24 Q90 18 86 10", 2.4, "#bfff7a", 0.6), LN("M90 40 Q94 32 90 26", 1.8, "#bfff7a", 0.5),
    P("M82 56 Q78 62 80 70 Q84 76 92 72 Q98 66 95 58 Q92 53 87 54 Q84 54.6 82 56Z", "#9aea3e", 1.7),
    P("M80 66 Q82 73 90 74 Q94 70 94 66 Q88 66 80 66Z", "#62c01c", 0),
    P("M83 46 L91 46 L90.4 54.4 L84 54.4Z", "rgba(255,255,255,0.5)", 1.4), P("M82 43 L92 43 L92 47 L82 47Z", "#c8a24a", 1.2),
    P("M84.4 37 L89.6 37 L90.6 43 L83.6 43Z", "#8a5a30", 1.2),
    HL("M83 62 Q84 58 87 57.6", 1.2, 0.85),
    bubbles([[88, 64, 1.5], [91, 68, 1], [85, 70, 0.9]]),
    P("M72 100 L76 88 Q80 80 87 78 L94 78 Q98 80 99 88 L100 100Z", "#e7b88e", 1.6),
  ].join("");
}

// ------------------------------------------------------------------ Kirima the Beast hunter
const spikeClub = (c, rot = 0) =>
  `<g transform="translate(${c[0]} ${c[1]}) rotate(${rot})">` +
  P("M-3 5 L3 5 L3.6 40 L-3.6 40Z", "#8a5a30", 1.5) +
  LN("M-3.4 14 L3.6 11 M-3.4 21 L3.6 18 M-3.4 28 L3.6 25 M-3.4 35 L3.6 32", 1.5, "#d8c8a0") +
  P("M-9 8 Q-11 -6 -5 -12 Q0 -16 6 -12 Q11 -6 9 8 Q0 13 -9 8Z", "#c4c8cc", 1.9) +
  HL("M-6 -8 Q-3 -12 2 -12", 1.2, 0.85) + SHADE("M3 -12 Q11 -6 9 8 Q4 11 1 11.4 Q8 0 3 -12Z", 0.2, "#202830") +
  [[-8, -6, -35], [-4, -13, -10], [4, -14, 14], [9, -8, 40], [-10, 3, -60], [10, 2, 62]].map(([x, y, r]) => `<g transform="translate(${x} ${y}) rotate(${r})">${P("M-2.6 1 L0 -7 L2.6 1Z", "#2a2a30", 1)}</g>`).join("") +
  `</g>`;

function beasthunterA(id) {
  const FUR = `url(#${id}f)`;
  const SK = `url(#${id}k)`;
  const furEdge = (pts) => pts.map(([x, y]) => `L${x} ${y}`).join(" ");
  return [
    `<defs>${LIN(id + "f", [[0, "#ffffff"], [0.6, "#e6ebe6"], [1, "#b4bdb8"]], [0, 0, 0.6, 1])}${LIN(id + "k", [[0, "#f0c8a0"], [1, "#cf9a72"]], [0, 0, 1, 1])}</defs>`,
    // the spears behind her shoulder
    `<g transform="translate(88 40) rotate(14)">${P("M-1.4 0 L1.4 0 L1.4 52 L-1.4 52Z", "#8a5a30", 1.1)}${P("M-3.4 0 L0 -22 L3.4 0Z", "#d8dde2", 1.5)}${HL("M-1 -3 L0 -16", 0.8, 0.9)}</g>`,
    `<g transform="translate(95 44) rotate(24)">${P("M-1.2 0 L1.2 0 L1.2 46 L-1.2 46Z", "#8a5a30", 1)}${P("M-3 0 L0 -18 L3 0Z", "#c4c8cc", 1.4)}</g>`,
    // the spiked club over her left shoulder
    spikeClub([14, 42], 24),
    // hood: white fur sweeping down to the shoulders
    P("M16 100 L12 80 Q8 62 22 48 Q30 40 50 40 Q70 40 78 48 Q92 62 88 80 L84 100Z", FUR, 1.9),
    LN("M16 84 l5 -5 M22 94 l4 -6 M82 86 l-5 -5 M78 96 l-4 -6 M26 66 l4 -4 M74 66 l-4 -4", 1, INK, 0.5),
    // hair and face
    P("M27 56 Q22 34 50 28 Q78 34 73 56 Q73 66 66 72 L34 72 Q27 66 27 56Z", "#3b2314", 1.7),
    P("M32 50 Q32 32 50 32 Q68 32 68 50 Q68 62 60 68 Q50 72 40 68 Q32 62 32 50Z", SK, 1.8),
    SHADE("M60 34 Q68 36 68 50 Q68 62 60 68 Q56 70 53 70.6 Q64 60 63 48 Q62 38 60 34Z", 0.16),
    P("M31 36 Q36 26 50 28 Q64 26 69 36 Q60 33 50 40 Q40 33 31 36Z", "#3b2314", 1.5),
    LN("M38 33 Q42 36 41 41 M62 33 Q58 36 59 41", 0.8, "#6b4528", 0.8),
    // war paint: a pale stripe and a red stripe under each eye
    LN("M33.4 50 L45 54", 2.2, "#f4eee0", 0.95), LN("M33.4 54 L43 57.4", 1.6, "#d84a3a", 0.95), LN("M66.6 50 L55 54", 2.2, "#f4eee0", 0.95), LN("M66.6 54 L57 57.4", 1.6, "#d84a3a", 0.95),
    EYE(42.6, 47.6, "#6f8a64", { w: 4.2, open: 3.2 }), EYE(57.4, 47.6, "#6f8a64", { w: 4.2, open: 3.2 }),
    LN("M37 43 Q42 41 47 43 M53 43 Q58 41 63 43", 1.3, "#2a170c"),
    LN("M50 49 Q48.6 53 50.4 54.4 Q52 54 52 53", 0.8),
    P("M46 60 Q50 59 54 60 Q50 63.6 46 60Z", "#b85a4a", 0.8),
    // bear hood on top of her head: fur dome, ears, snout and nose, a row of fangs above the brow
    P("M19 48 Q10 22 26 14 Q36 8 50 8 Q64 8 74 14 Q90 22 81 48 Q74 42 70 38 Q60 30 50 30 Q40 30 30 38 Q26 42 19 48Z", FUR, 1.9),
    P("M18 28 Q10 14 22 10 Q30 12 33 20Z", FUR, 1.7), P("M82 28 Q90 14 78 10 Q70 12 67 20Z", FUR, 1.7),
    P("M21 24 Q17 16 23 13 Q27 15 29 20Z", "#c8a8a0", 0.8), P("M79 24 Q83 16 77 13 Q73 15 71 20Z", "#c8a8a0", 0.8),
    P("M39 24 Q39 12 50 11 Q61 12 61 24 Q61 32 50 34 Q39 32 39 24Z", "#f2f6f2", 1.6),
    P("M43 12 Q50 4 57 12 Q57 16 50 17 Q43 16 43 12Z", "#2a2a2e", 1.4), `<ellipse cx="48" cy="9.6" rx="2" ry="1" fill="#fff" opacity="0.6"/>`,
    EL(42, 22, 1.6, 1.1, "#2a2a2e", 0), EL(58, 22, 1.6, 1.1, "#2a2a2e", 0),
    P("M31 36 L35 44 L38 35Z M39 34 L43 43 L46 34Z M54 34 L57 43 L61 34Z M62 35 L65 44 L69 36Z", "#fffaf0", 1.1),
    LN("M31 36 Q50 30 69 36", 1.2, INK, 0.7),
    HL("M26 20 Q31 14 40 12", 1.4, 0.8), HL("M66 14 Q72 14 76 18", 1.2, 0.6),
    LN("M14 38 l3 -4 M84 38 l-3 -4 M22 22 l-2 -4 M78 22 l2 -4 M30 14 l-1 -4 M70 14 l1 -4", 0.9, INK, 0.5),
    // neck: bone and tooth necklace on a leather cord, fur collar and lacing
    P("M40 68 Q50 76 60 68 L62 76 Q50 84 38 76Z", "#ffffff", 1.6),
    LN("M38 72 Q50 82 62 72", 1.2, "#6a4020"),
    ...[[41, 76, 14], [45, 79, 8], [50, 80.6, 0], [55, 79, -8], [59, 76, -14]].map(([x, y, r]) => `<g transform="translate(${x} ${y}) rotate(${r})">${P("M-1.4 -1 L1.4 -1 L0.6 5 L-0.6 5Z", "#fff6dc", 0.8)}</g>`),
    P("M36 100 L40 82 Q50 88 60 82 L64 100Z", "#d9d3c0", 1.6),
    LN("M44 88 L56 96 M56 88 L44 96 M44 96 L56 104", 1, "#6a4020"),
    ...[[44, 88], [56, 88], [44, 94], [56, 94]].map(([x, y]) => C(x, y, 1, "#c8ccd0", 0.6)),
    // fur cuff and her dagger
    P("M62 100 Q64 88 78 86 Q92 86 94 100Z", FUR, 1.6), LN("M68 94 l3 -4 M78 96 l2 -5 M86 95 l3 -4", 0.8, INK, 0.5),
    P("M8 96 L16 82 L22 86 L16 100Z", "#6a4020", 1.3), P("M12 90 L15.4 80 L18 82 L15 92Z", "#c4c8cc", 1),
  ].join("");
}

function beasthunterB(id) {
  const FUR = `url(#${id}f)`;
  const SK = `url(#${id}k)`;
  return [
    `<defs>${LIN(id + "f", [[0, "#f6fbff"], [0.6, "#d6e4ee"], [1, "#8fa8bc"]], [0, 0, 0.6, 1])}${LIN(id + "k", [[0, "#efc29a"], [1, "#c98f66"]], [0, 0, 1, 1])}${RAD(id + "g", [[0, "#bfe8ff", 0.7], [1, "#bfe8ff", 0]])}</defs>`,
    `<circle cx="50" cy="48" r="48" fill="url(#${id}g)"/>`,
    // snowflakes
    ...[[12, 16, 2.4], [86, 10, 2], [92, 34, 1.6], [8, 52, 1.8]].map(([x, y, r]) => LN(`M${x - r} ${y} L${x + r} ${y} M${x} ${y - r} L${x} ${y + r} M${x - r * 0.7} ${y - r * 0.7} L${x + r * 0.7} ${y + r * 0.7} M${x - r * 0.7} ${y + r * 0.7} L${x + r * 0.7} ${y - r * 0.7}`, 0.9, "#ffffff", 0.9)),
    // fur-trimmed shoulders
    P("M0 100 L2 78 Q8 62 28 62 L36 100Z", FUR, 1.8), P("M100 100 L98 78 Q92 62 72 62 L64 100Z", FUR, 1.8),
    LN("M6 82 l4 -5 M14 94 l4 -6 M94 82 l-4 -5 M86 94 l-4 -6 M20 70 l3 -4 M80 70 l-3 -4", 0.9, INK, 0.5),
    // the club, big and in front at the right
    spikeClub([80, 62], 18),
    // hood back and hair
    P("M20 60 Q12 30 28 18 Q40 8 50 8 Q60 8 72 18 Q88 30 80 60 Q80 70 70 76 L30 76 Q20 70 20 60Z", FUR, 1.9),
    P("M27 58 Q22 36 50 30 Q78 36 73 58 Q73 68 66 74 L34 74 Q27 68 27 58Z", "#2f1c10", 1.6),
    P("M31 52 Q31 33 50 33 Q69 33 69 52 Q69 64 60 70 Q50 74 40 70 Q31 64 31 52Z", SK, 1.9),
    SHADE("M60 35 Q69 38 69 52 Q69 64 60 70 Q56 72 53 72.6 Q65 62 64 50 Q63 40 60 35Z", 0.17),
    LN("M32.6 50.6 L45 55.4", 2.4, "#f4eee0", 0.95), LN("M32.6 55 L43 58.4", 1.8, "#4aa8d8", 0.95), LN("M67.4 50.6 L55 55.4", 2.4, "#f4eee0", 0.95), LN("M67.4 55 L57 58.4", 1.8, "#4aa8d8", 0.95),
    EYE(42, 48, "#4f8ab8", { w: 4.8, open: 3.8 }), EYE(58, 48, "#4f8ab8", { w: 4.8, open: 3.8 }),
    LN("M36 43 Q42 40 47.4 43 M52.6 43 Q58 40 64 43", 1.4, "#241208"),
    LN("M50 50 Q48.4 54.4 50.4 56 Q52.4 55.6 52 54", 0.8),
    P("M45.6 61 Q50 59.6 54.4 61 Q50 65.2 45.6 61Z", "#b85a4a", 0.8),
    P("M31 40 Q36 28 50 30 Q64 28 69 40 Q60 36 50 42 Q40 36 31 40Z", "#2f1c10", 1.5),
    // roaring bear hood above her head: open jaws and fangs
    P("M20 40 Q8 18 28 10 Q38 4 50 4 Q62 4 72 10 Q92 18 80 40 Q72 32 64 28 Q50 24 36 28 Q28 32 20 40Z", FUR, 1.9),
    P("M18 20 Q8 8 20 4 Q28 6 31 14Z", FUR, 1.7), P("M82 20 Q92 8 80 4 Q72 6 69 14Z", FUR, 1.7),
    P("M38 14 Q42 6 50 6 Q58 6 62 14 Q62 20 50 21 Q38 20 38 14Z", "#2a1a22", 1.5),
    P("M42 8 Q50 1 58 8 Q58 12 50 13 Q42 12 42 8Z", "#26262a", 1.3),
    P("M41 17 L43.6 25 L46 17Z M47 17.4 L50 26 L53 17.4Z M54 17 L56.4 25 L59 17Z", "#fffaf0", 1),
    P("M24 33 L28 42 L31 32Z M33 30 L37 40 L40 29Z M60 29 L63 40 L67 30Z M69 32 L72 42 L76 33Z", "#fffaf0", 1.1),
    LN("M22 38 Q50 22 78 38", 1.2, INK, 0.6),
    EL(36, 14, 1.5, 1, "#2a2a2e", 0), EL(64, 14, 1.5, 1, "#2a2a2e", 0),
    HL("M26 14 Q32 8 42 6", 1.4, 0.9),
    // necklace and collar
    P("M38 72 Q50 82 62 72 L64 80 Q50 90 36 80Z", "#ffffff", 1.6), LN("M36 76 Q50 88 64 76", 1.2, "#6a4020"),
    ...[[40, 80, 18], [45, 84, 9], [50, 86, 0], [55, 84, -9], [60, 80, -18]].map(([x, y, r]) => `<g transform="translate(${x} ${y}) rotate(${r})">${P("M-1.5 -1 L1.5 -1 L0.7 6 L-0.7 6Z", "#fff6dc", 0.8)}</g>`),
  ].join("");
}

// ------------------------------------------------------------------ Elspeth the Warrior princess
const longSword = (x, y, rot, id) =>
  `<g transform="translate(${x} ${y}) rotate(${rot})">` +
  P("M-2.2 -4 L2.2 -4 L1.8 -62 L0 -68 L-1.8 -62Z", `url(#${id}b)`, 1.4) + LN("M0 -6 L0 -62", 0.7, "#8e92b8", 0.8) + HL("M-1 -8 L-0.9 -56", 0.7, 0.9) +
  P("M-7 -4 L7 -4 L6 -1 L-6 -1Z", "#d9a64a", 1.2) + P("M-1.6 -1 L1.6 -1 L1.6 8 L-1.6 8Z", "#6a2f8a", 1.1) + C(0, 9.6, 2, "#d9a64a", 0.9) +
  `</g>`;

// a sword carried on her back: only the hilt shows above the shoulder
const backHilt = (x, y, rot, id) =>
  `<g transform="translate(${x} ${y}) rotate(${rot})">` +
  P("M-2 2 L2 2 L2 40 L-2 40Z", `url(#${id}b)`, 1.2) + P("M-1.6 -13 L1.6 -13 L1.6 2 L-1.6 2Z", "#6a2f8a", 1.1) + LN("M-1.6 -9 L1.6 -10 M-1.6 -5 L1.6 -6", 0.7, "#c89af0") +
  P("M-7.5 3.4 Q-8 -0.6 -5 -1.2 L5 -1.2 Q8 -0.6 7.5 3.4Z", "#e0ae4a", 1.2) + C(0, -14.6, 2.3, "#e0ae4a", 1) +
  `</g>`;

function princessA(id) {
  const AR = `url(#${id}a)`;
  const HR = `url(#${id}h)`;
  const SK = `url(#${id}k)`;
  return [
    `<defs>${LIN(id + "a", [[0, "#fde0bd"], [0.55, "#e6a878"], [1, "#b8714a"]], [0, 0, 0.8, 1])}${LIN(id + "h", [[0, "#f7d58a"], [0.55, "#e8b45a"], [1, "#a8742a"]], [0, 0, 1, 1])}${LIN(id + "k", [[0, "#fde4cf"], [1, "#e8b898"]], [0, 0, 1, 1])}${LIN(id + "b", [[0, "#ffffff"], [0.5, "#dfe3f4"], [1, "#9aa0c6"]], [0, 0, 1, 0])}${LIN(id + "c", [[0, "#8f4fc0"], [1, "#4a1f6e"]], [0, 0, 1, 1])}</defs>`,
    // purple cape
    P("M6 100 Q2 72 18 62 L34 68 L30 100Z", `url(#${id}c)`, 1.7), P("M94 100 Q98 72 82 62 L66 68 L70 100Z", `url(#${id}c)`, 1.7),
    LN("M12 86 Q16 76 24 70 M88 86 Q84 76 76 70", 0.9, "#c89af0", 0.7),
    // hair behind
    P("M22 44 Q14 20 40 10 Q50 6 60 10 Q86 20 78 48 Q86 66 78 90 Q70 78 70 60 L30 60 Q30 78 22 90 Q14 66 22 44Z", HR, 1.8),
    LN("M24 50 Q20 66 24 80 M76 50 Q80 66 76 80 M30 62 Q28 74 31 84 M70 62 Q72 74 69 84", 1, "#a8742a", 0.7),
    // her twin swords, worn crossed on her back
    backHilt(15, 36, -24, id), backHilt(85, 36, 24, id),
    // cuirass with golden embossing, shoulder plates with purple trim
    P("M26 100 L30 74 Q50 66 70 74 L74 100Z", AR, 1.8),
    SHADE("M54 70 Q66 72 70 74 L74 100 L56 100Z", 0.16, "#7a3a1a"),
    LN("M40 80 Q50 74 60 80 M36 90 Q50 82 64 90 M50 76 L50 100", 1, "#a8602e", 0.8), HL("M33 80 Q38 74 44 72", 1.1, 0.8),
    P("M44 76 Q50 72 56 76 Q54 84 50 88 Q46 84 44 76Z", "#e9bd55", 1.2), C(50, 80, 1.6, "#c8362c", 0.7),
    P("M10 100 Q8 76 24 68 Q34 66 38 74 Q36 88 34 100Z", AR, 1.8), P("M90 100 Q92 76 76 68 Q66 66 62 74 Q64 88 66 100Z", AR, 1.8),
    LN("M12 84 Q22 76 36 82 M88 84 Q78 76 64 82", 1.1, "#7a3a1a", 0.8), HL("M14 74 Q18 70 26 69", 1.2, 0.8),
    LN("M10 80 Q8 90 11 100 M90 80 Q92 90 89 100", 2.4, "#6a2f8a"),
    `<g fill="none" stroke="#b8714a" stroke-width="0.9" stroke-linecap="round" opacity="0.8"><path d="M40 90 q4 -6 9 -2 q3 4 -2 5 M60 90 q-4 -6 -9 -2 q-3 4 2 5"/></g>`,
    // neck and face
    P("M44 56 L56 56 L56 70 Q50 74 44 70Z", "#e8b898", 1.4),
    P("M35 40 Q35 24 50 24 Q65 24 65 40 Q65 54 58 60 Q50 65 42 60 Q35 54 35 40Z", SK, 1.8),
    SHADE("M58 26 Q65 28 65 40 Q65 54 58 60 Q55 62.6 52 63.6 Q61 53 60 40 Q59 31 58 26Z", 0.14),
    EYE(43.6, 43.4, "#5e8fb8", { w: 4, open: 3.2 }), EYE(56.4, 43.4, "#5e8fb8", { w: 4, open: 3.2 }),
    LN("M38.4 38 Q43.6 35.6 48 38 M52 38 Q56.4 35.6 61.6 38", 1.2, "#8a5a24"),
    LN("M50 44 Q49 49 50.6 50.4 Q52 50 52 49", 0.7),
    P("M46 55.4 Q50 54 54 55.4 Q50 58.6 46 55.4Z", "#c9566a", 0.8), `<ellipse cx="40" cy="50" rx="2.6" ry="1.4" fill="#f08a78" opacity="0.3"/><ellipse cx="60" cy="50" rx="2.6" ry="1.4" fill="#f08a78" opacity="0.3"/>`,
    // hair front
    P("M34 44 Q30 18 52 16 Q74 16 66 44 Q64 32 56 28 Q46 27 40 34 Q36 38 34 44Z", HR, 1.7),
    P("M36 40 Q31 56 34 70 Q38 58 39 46Z", HR, 1.4), P("M64 40 Q69 56 66 70 Q62 58 61 46Z", HR, 1.4),
    LN("M42 22 Q50 19 58 21 M40 28 Q48 24 56 25", 0.9, "#f9e3a8", 0.9),
  ].join("");
}

function princessB(id) {
  const AR = `url(#${id}a)`;
  const HR = `url(#${id}h)`;
  const SK = `url(#${id}k)`;
  return [
    `<defs>${LIN(id + "a", [[0, "#fde0bd"], [0.55, "#e6a878"], [1, "#b8714a"]], [0, 0, 0.8, 1])}${LIN(id + "h", [[0, "#f7d58a"], [0.55, "#e8b45a"], [1, "#a8742a"]], [0, 0, 1, 1])}${LIN(id + "k", [[0, "#fde4cf"], [1, "#e8b898"]], [0, 0, 1, 1])}${LIN(id + "b", [[0, "#ffffff"], [0.5, "#dfe3f4"], [1, "#9aa0c6"]], [0, 0, 1, 0])}${LIN(id + "c", [[0, "#9a58cc"], [1, "#4a1f6e"]], [0, 0, 1, 1])}${RAD(id + "g", [[0, "#d7b8ff", 0.5], [1, "#d7b8ff", 0]])}</defs>`,
    `<circle cx="50" cy="48" r="48" fill="url(#${id}g)"/>`,
    // cape billowing to the left, hair streaming the same way
    P("M60 62 Q36 52 8 58 Q0 60 2 70 Q10 66 14 74 Q10 84 18 94 L40 100 L66 100Z", `url(#${id}c)`, 1.8),
    LN("M52 68 Q30 62 12 68 M54 80 Q34 74 18 82", 1, "#c89af0", 0.7),
    P("M64 36 Q40 20 14 34 Q4 40 8 50 Q14 46 20 52 Q16 62 26 66 Q22 74 32 78 Q38 62 52 60 Q62 56 68 48Z", HR, 1.8),
    LN("M58 34 Q38 26 18 38 M60 42 Q40 36 22 48 M58 50 Q42 46 28 58", 1, "#a8742a", 0.7), LN("M52 30 Q36 28 22 36", 1, "#f9e3a8", 0.9),
    // armour
    P("M44 100 L46 72 Q62 66 78 72 L80 100Z", AR, 1.8),
    LN("M52 80 Q62 74 74 80 M50 90 Q62 82 76 90 M62 74 L62 100", 1, "#a8602e", 0.8), HL("M50 80 Q54 75 60 73", 1.1, 0.8),
    P("M56 78 Q62 74 68 78 Q66 86 62 90 Q58 86 56 78Z", "#e9bd55", 1.2), C(62, 82, 1.6, "#c8362c", 0.7),
    P("M28 100 Q28 80 40 72 Q52 66 60 72 Q58 88 54 100Z", AR, 1.8), LN("M30 86 Q42 76 56 84", 1.1, "#7a3a1a", 0.8), HL("M32 76 Q36 72 44 70", 1.2, 0.8),
    LN("M28 82 Q26 92 29 100", 2.4, "#6a2f8a"),
    // her sword held upright in front
    longSword(88, 90, -5, id),
    P("M82 86 Q82 80 88 80 Q94 80 94 86 L94 96 Q88 100 82 96Z", "#e6a878", 1.6), LN("M82 90 L94 90 M82 94 L94 94", 0.8, "#7a3a1a", 0.8), HL("M84 83 L84 88", 1, 0.8),
    // head turned three-quarters to the left
    P("M52 54 L64 54 L64 68 Q58 72 52 68Z", "#e8b898", 1.4),
    P("M44 38 Q44 22 58 22 Q72 22 72 38 Q72 52 66 58 Q58 63 52 58 Q44 52 44 38Z", SK, 1.8),
    SHADE("M66 24 Q72 26 72 38 Q72 52 66 58 Q63 60.6 60 61.4 Q68 51 67 38 Q66 30 66 24Z", 0.14),
    EYE(54.6, 41.6, "#5e8fb8", { w: 3.8, open: 3, look: -0.8 }), EYE(65.4, 41.6, "#5e8fb8", { w: 3.8, open: 3, look: -0.8 }),
    LN("M49.6 36.4 Q54.6 34 58.6 36.4 M62 36.4 Q65.4 34 70 36.6", 1.2, "#8a5a24"),
    LN("M60 42 Q59 47 60.6 48.4 Q62 48 62 47", 0.7),
    P("M56.6 53 Q60 51.6 64 53 Q60 56.2 56.6 53Z", "#c9566a", 0.8),
    P("M44 38 Q40 18 60 16 Q80 16 72 40 Q70 28 62 25 Q52 24 48 32 Q46 34 44 38Z", HR, 1.7),
    P("M72 34 Q80 46 74 62 Q70 52 70 42Z", HR, 1.4),
    LN("M52 22 Q60 19 68 21", 0.9, "#f9e3a8", 0.9),
  ].join("");
}

const DRAW = { alchemist: [alchemistA, alchemistB], beasthunter: [beasthunterA, beasthunterB], princess: [princessA, princessB] };
export const SIDHAR_HERO_KEYS = Object.keys(DRAW);
export const sidharHeroArt = (key, variant = 0) => DRAW[key][variant](`sp-${key}${variant}`);
