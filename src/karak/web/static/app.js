import { HERO_FILL, art, die, heroPortrait, installArt, itemIcon, richText, token } from "./art.js";
import { Board } from "./board.js";
import { copyText, h, openDialog, toast } from "./dom.js";
import { bagPopup, pilePopup, renderHud } from "./hud.js";
import { getVolume, isMuted, setMuted, setVolume, sfx, unlockAudio } from "./sound.js";

const REACTIONS = ["👍", "😂", "😱", "😡", "🎉", "🤔", "😭", "🔥", "👏", "💀"];
const MAX_SEATS = 5;
const SUMMARY_DELAY = 2200;
const DIR_KEYS = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, w: 0, d: 1, s: 2, a: 3 };
const DIR_NAMES = ["north", "east", "south", "west"];

const app = document.getElementById("app");
const fx = document.getElementById("fx");
const overlay = document.getElementById("overlay");

const URL_TOKEN = takeTokenFromUrl();

const S = {
  config: { public_url: null, lan_url: null, bots: [], heroes: [], monsters: [], items: [] },
  heroes: {},
  monsters: {},
  items: {},
  token: URL_TOKEN || localStorage.getItem("karak.token") || newToken(),
  name: localStorage.getItem("karak.name") || "",
  code: null,
  ws: null,
  retry: 0,
  reconnectTimer: null,
  connected: false,
  fatal: null,
  me: null,
  bots: [],
  log: [],
  state: null,
  board: null,
  ui: freshUi(),
  timer: { endAt: 0, total: 0, lastTick: 0 },
};
localStorage.setItem("karak.token", S.token);

function freshUi() {
  return {
    hint: null,
    sideOpen: false,
    unread: 0,
    menu: false,
    summaryHidden: false,
    heroesOpen: false,
    summaryAt: 0,
    pending: false,
    bolts: 0,
    fists: 0,
    sacrifice: false,
    mode: null,
    fresh: new Set(),
    rolling: false,
  };
}

// "Continue on another device" links carry the player's token: /r/CODE?me=TOKEN.
function takeTokenFromUrl() {
  const params = new URLSearchParams(location.search);
  const t = params.get("me");
  if (!t || !/^[0-9a-f]{16,64}$/.test(t)) return null;
  history.replaceState({}, "", location.pathname);
  return t;
}

function newToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const ADJECTIVES = ["Bold", "Grim", "Lucky", "Silent", "Brave", "Crafty", "Iron", "Wild", "Shadow", "Golden"];
const NOUNS = ["Delver", "Torchbearer", "Slayer", "Wanderer", "Seeker", "Raider", "Knight", "Rogue", "Explorer", "Hunter"];
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
const suggestName = () => `${pick(ADJECTIVES)} ${pick(NOUNS)}`;

function saveName(name) {
  name = (name || "").trim().slice(0, 20);
  if (!name) return S.name;
  S.name = name;
  localStorage.setItem("karak.name", name);
  return name;
}

const $ = (sel) => document.querySelector(sel);
const plural = (n, w) => `${n} ${n === 1 ? w : w.endsWith("o") ? `${w}es` : `${w}s`}`;
const pts = (half) => (half % 2 ? `${Math.floor(half / 2)}½` : `${half / 2}`);
const heroName = (key) => S.heroes[key]?.name || "Hero";
const seatName = (st, seat) => st.seats[seat]?.name || "?";
const fill = (color) => HERO_FILL[color] || HERO_FILL.stone;

// ------------------------------------------------------------------ routing
function go(path) {
  history.pushState({}, "", path);
  router();
}

function router() {
  const match = location.pathname.match(/^\/r\/([A-Za-z0-9]{4,8})\/?$/);
  overlay.replaceChildren();
  if (match) enterRoom(match[1].toUpperCase());
  else showHome();
}
window.addEventListener("popstate", router);

// ------------------------------------------------------------------ home
function demoLabyrinth() {
  // A decorative labyrinth for the home screen.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const kinds = ["corridor", "room", "room", "corridor", "room", "fountain", "portal", "room"];
  const tiles = [{ id: 0, x: 0, y: 0, kind: "start", exits: 15, token: null, items: [] }];
  const taken = new Set(["0,0"]);
  const tokens = ["rat", "chest", "mummy", "skeleton", null, "king", "spider", null, "chest", "dragon"];
  for (let i = 1; i < 46; i++) {
    const base = tiles[Math.floor(rnd() * tiles.length)];
    const d = Math.floor(rnd() * 4);
    const x = base.x + [0, 1, 0, -1][d];
    const y = base.y + [-1, 0, 1, 0][d];
    if (taken.has(`${x},${y}`) || Math.abs(x) > 7 || Math.abs(y) > 4) continue;
    taken.add(`${x},${y}`);
    const kind = kinds[Math.floor(rnd() * kinds.length)];
    const exits = (1 << ((d + 2) % 4)) | (1 << Math.floor(rnd() * 4)) | (rnd() < 0.5 ? 1 << Math.floor(rnd() * 4) : 0);
    const tok = kind === "room" && rnd() < 0.5 ? tokens[Math.floor(rnd() * tokens.length)] : null;
    tiles.push({ id: i, x, y, kind, exits, token: tok, items: [] });
  }
  return { tiles, players: [], monsters: S.monsters, combat: null, pending: null, current: null, cursed: null };
}

function showHome() {
  closeSocket();
  S.code = null;
  S.state = null;
  document.title = "Karak";
  const nameInput = h("input", { class: "text", value: S.name, placeholder: suggestName(), maxlength: 20 });
  const codeInput = h("input", { class: "text", placeholder: "CODE", maxlength: 8, autocapitalize: "characters" });
  const create = async () => {
    saveName(nameInput.value || nameInput.placeholder);
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).detail || "Could not create a table");
      go(`/r/${(await res.json()).room}`);
    } catch (e) {
      toast(e.message, true);
    }
  };
  const join = async () => {
    const code = codeInput.value.trim().toUpperCase();
    if (!code) return codeInput.focus();
    saveName(nameInput.value || nameInput.placeholder);
    const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
    if (!res.ok) return toast("No table with that code", true);
    go(`/r/${code}`);
  };
  codeInput.addEventListener("keydown", (e) => e.key === "Enter" && join());
  nameInput.addEventListener("keydown", (e) => e.key === "Enter" && create());
  const backdrop = h("div", { class: "home-map" });
  const demo = new Board();
  backdrop.append(demo.el);
  app.replaceChildren(
    h(
      "div",
      { class: "home" },
      backdrop,
      h(
        "div",
        { class: "home-card" },
        logo(),
        h(
          "div",
          { class: "hero-row" },
          S.config.heroes.filter((x) => x.pickable && !x.expansion).map((hero, i) => h("span", { class: "bob", style: { animationDelay: `${-i * 0.5}s` } }, heroPortrait(hero.key, hero.color, 58))),
        ),
        h("p", { class: "tagline" }, "Descend beneath the ruined castle, map the labyrinth tile by tile, battle its monsters for their loot, unlock the treasure chests and slay the Dragon. Play with friends in the browser and fill empty seats with bots."),
        h(
          "div",
          { class: "home-form" },
          h("label", {}, "Your name", nameInput),
          h("button", { class: "btn primary big", onclick: create }, "⚔️ Create a table"),
          h("div", { class: "or" }, "or join with a code"),
          h("div", { class: "join-row" }, codeInput, h("button", { class: "btn", onclick: join }, "Join")),
        ),
        h("div", { class: "home-links" }, h("button", { class: "linklike", onclick: showRules }, "How to play")),
      ),
    ),
  );
  requestAnimationFrame(() => demo.update(demoLabyrinth(), []));
}

function logo(small = false) {
  return h("div", { class: `logo ${small ? "small" : ""}` }, h("span", { class: "logo-word" }, "Karak"), small ? null : h("span", { class: "logo-sub" }, "The Labyrinth Beneath the Castle"));
}

// ------------------------------------------------------------------ room / socket
async function enterRoom(code) {
  closeSocket();
  Object.assign(S, { code, state: null, log: [], fatal: null, me: null, connected: false, retry: 0 });
  S.ui = freshUi();
  S.board = null;
  document.title = `Karak · ${code}`;
  if (!S.name && !URL_TOKEN) await askName(`Join table ${code}`);
  buildShell();
  connect();
}

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws/${S.code}`);
  S.ws = ws;
  ws.onopen = () => ws.send(JSON.stringify({ type: "hello", token: S.token, name: S.name }));
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onclose = () => {
    if (S.ws !== ws) return;
    S.connected = false;
    renderConn();
    if (S.fatal) return;
    const delay = Math.min(8000, 400 * 2 ** S.retry++);
    S.reconnectTimer = setTimeout(connect, delay);
  };
}

function closeSocket() {
  clearTimeout(S.reconnectTimer);
  const ws = S.ws;
  S.ws = null;
  if (ws) ws.close();
}

function send(msg) {
  if (S.ws && S.ws.readyState === WebSocket.OPEN) S.ws.send(JSON.stringify(msg));
  else toast("Not connected. Reconnecting…", true);
}

function act(action) {
  S.ui.hint = null;
  S.ui.pending = true;
  closePopover();
  send({ type: "action", action });
}

function onMessage(msg) {
  switch (msg.type) {
    case "welcome":
      S.me = msg.you;
      S.bots = msg.bots;
      S.log = msg.log;
      S.connected = true;
      S.retry = 0;
      renderConn();
      renderFeed();
      break;
    case "state":
      applyState(msg);
      break;
    case "log":
      S.log.push(msg.entry);
      appendFeed(msg.entry);
      if (msg.entry.kind === "chat" && msg.entry.member !== S.me) {
        sfx.chat();
        if (!S.ui.sideOpen && window.matchMedia("(max-width: 1100px)").matches) {
          S.ui.unread++;
          renderTop();
        }
      }
      break;
    case "react":
      showReaction(msg);
      break;
    case "hint":
      showHint(msg.action);
      break;
    case "error":
      S.ui.pending = false;
      toast(msg.message, true);
      sfx.error();
      if (S.state) render();
      break;
    case "fatal":
      S.fatal = msg.message;
      closeSocket();
      showFatal(msg.message);
      break;
  }
}

function showFatal(message) {
  app.replaceChildren(
    h(
      "div",
      { class: "center-msg" },
      h("div", {}, logo(true), h("h2", {}, message), h("p", {}, "Tables close a while after everyone has left."), h("button", { class: "btn primary big", onclick: () => go("/") }, "Start a new table")),
    ),
  );
}

// ------------------------------------------------------------------ state + effects
function applyState(next) {
  const prev = S.state;
  S.state = next;
  S.ui.pending = false;
  if (!prev) renderFeed();
  const g = next.game;
  if (g && g.time_left != null) {
    S.timer.endAt = performance.now() + g.time_left * 1000;
    S.timer.total = g.time_total;
  } else S.timer.endAt = 0;
  if (next.status !== prev?.status) {
    S.ui.summaryHidden = false;
    if (next.status === "game_over" && prev?.status === "playing") {
      S.ui.summaryAt = performance.now() + SUMMARY_DELAY;
      setTimeout(renderOverlay, SUMMARY_DELAY + 20);
    } else S.ui.summaryAt = 0;
  }
  if (next.event?.kind === "game_start") {
    S.board = null;
    S.ui = { ...freshUi(), sideOpen: S.ui.sideOpen };
  }
  const events = next.event?.kind === "move" ? next.event.events : [];
  const live = prev && next.seq === prev.seq + 1 && !document.hidden;
  S.ui.fresh = new Set(events.filter((e) => e.kind === "place").map((e) => e.tile.id));
  if (g?.phase !== "rolled") {
    S.ui.bolts = 0;
    S.ui.fists = 0;
    S.ui.sacrifice = false;
  }
  S.ui.rolling = live && events.some((e) => e.kind === "roll");
  render();
  if (live) playEffects(next, events);
  afterApply(prev, next);
}

function afterApply(prev, next) {
  const mine = (st) => st?.status === "playing" && st.game && st.game.actor === st.you.seat && st.game.legal.length > 0;
  if (mine(next) && !mine(prev)) {
    sfx.turn();
    const me = next.game.players[next.you.seat];
    S.board?.focus(me.x, me.y, true);
    if (document.hidden) document.title = "🔔 Your turn! · Karak";
  }
  if (prev?.status === "playing" && next.status === "game_over") {
    const won = next.game.result?.winners.includes(next.you.seat);
    setTimeout(() => {
      if (won) {
        sfx.fanfare();
        confetti();
      } else sfx.lose();
    }, SUMMARY_DELAY);
  }
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && S.code) document.title = `Karak · ${S.code}`;
});

function banner(cls, title, sub = null, ms = 1700) {
  const wrap = $("#board-wrap");
  if (!wrap) return;
  const el = h("div", { class: `fight-banner ${cls}` }, h("div", { class: "fb-title" }, title), sub ? h("div", { class: "fb-sub" }, sub) : null);
  wrap.append(el);
  setTimeout(() => el.remove(), ms);
}

function playEffects(st, events) {
  for (const ev of events) {
    const name = seatName(st, ev.seat);
    switch (ev.kind) {
      case "move":
      case "retreat":
        sfx.step();
        break;
      case "draw_tile":
        sfx.draw();
        break;
      case "place":
        sfx.tile();
        break;
      case "teleport":
      case "swap":
        sfx.portal();
        break;
      case "token":
        if (ev.token === "chest") sfx.coins();
        else sfx.growl(ev.token === "dragon");
        break;
      case "dragon":
      case "dragon_awakens":
        banner("dragon", "🐉 The Dragon!", ev.kind === "dragon_awakens" ? "It wakes in the deepest room" : "Strength 15", 2400);
        break;
      case "roll":
        sfx.dice();
        break;
      case "strike": {
        const m = S.monsters[ev.monster];
        const sub = `${ev.total} vs ${m.strength}`;
        setTimeout(() => {
          if (ev.outcome === "win") {
            sfx.clash();
            setTimeout(sfx.win, 200);
            banner("win", `${name} defeats the ${m.name}!`, sub);
          } else if (ev.outcome === "tie") {
            sfx.tie();
            banner("tie", "A stand-off", `${sub}: ${name} falls back`);
          } else {
            sfx.hurt();
            banner("loss", `The ${m.name} wins`, `${sub}: ${name} is wounded`);
          }
        }, 150);
        break;
      }
      case "loot":
      case "pickup":
        sfx.loot();
        break;
      case "open_chest":
        sfx.coins();
        banner("win", "Treasure!", `${name} unlocks a chest`);
        break;
      case "heal":
      case "cast_healing":
      case "reincarnate":
        sfx.heal();
        break;
      case "curse":
        sfx.curse();
        banner("curse", "☠ The Curse", `falls upon ${seatName(st, ev.target)}`);
        break;
      case "knocked_out":
        banner("loss", `${seatName(st, ev.seat)} is knocked out`, "and misses the next turn");
        break;
      case "sprint":
        sfx.step();
        break;
      case "blitz":
        sfx.portal();
        banner("win", "⚡ Blitz attack!", `${name} strikes without warning`);
        break;
      case "curse_roll":
        sfx.dice();
        banner(ev.cursed ? "curse" : "tie", `🎲 ${ev.die}: ${ev.cursed ? "cursed!" : "safe"}`, ev.cursed ? `${name} is touched by Karak's curse` : `${name} escapes the cursed chamber`);
        break;
      case "duel":
        sfx.clash();
        banner("tie", "⚔️ Duel in the arena!", `${name} vs ${seatName(st, ev.defender)}`, 2000);
        break;
      case "duel_result":
        if (ev.winner == null) banner("tie", "A draw", `${ev.totals[0]} vs ${ev.totals[1]}`);
        else {
          sfx.win();
          banner("win", `${seatName(st, ev.winner)} wins the duel`, `${ev.totals[0]} vs ${ev.totals[1]}`);
        }
        break;
      case "thorn":
        sfx.hurt();
        banner("loss", "🥀 Thorn of darkness", `${seatName(st, ev.target)} loses a life`);
        break;
      case "steal":
        sfx.loot();
        break;
      case "lord":
        sfx.curse();
        banner("dragon", "👑 The Lord of Karak!", `${name} is possessed and gains every skill`, 3200);
        break;
    }
  }
  const moved = [...events].reverse().find((e) => ["move", "place", "teleport", "retreat", "swap", "reincarnate", "cast_healing", "sprint", "blitz"].includes(e.kind));
  if (moved && S.board) {
    const p = st.game.players[moved.kind === "cast_healing" ? moved.target : moved.seat];
    if (p) S.board.focus(p.x, p.y);
  }
}

// ------------------------------------------------------------------ shell
function buildShell() {
  const input = h("input", { class: "text", placeholder: "Say something…", maxlength: 240, enterkeyhint: "send" });
  const form = h(
    "form",
    {
      class: "chat-form",
      onsubmit: (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        send({ type: "chat", text });
        input.value = "";
      },
    },
    input,
    h("button", { class: "btn small" }, "Send"),
  );
  app.replaceChildren(
    h(
      "div",
      { class: "shell" },
      h("header", { class: "topbar", id: "topbar" }),
      h("main", { class: "main", id: "main" }, h("div", { class: "center-msg" }, h("p", {}, "Lighting the torches…"))),
      h(
        "aside",
        { class: "side", id: "side" },
        h("div", { class: "players", id: "players" }),
        h("div", { class: "side-head" }, "Chronicle", h("button", { class: "icon-btn only-narrow", onclick: toggleSide, title: "Close" }, "✕")),
        h("div", { class: "feed", id: "feed" }),
        h("div", { class: "reactions" }, REACTIONS.map((emoji) => h("button", { title: "React", onclick: () => send({ type: "react", emoji }) }, emoji))),
        form,
      ),
    ),
    h("div", { id: "conn", class: "conn-banner hidden" }, "Reconnecting…"),
  );
  renderTop();
}

function renderConn() {
  $("#conn")?.classList.toggle("hidden", S.connected || !!S.fatal || !S.code);
}

function toggleSide() {
  S.ui.sideOpen = !S.ui.sideOpen;
  if (S.ui.sideOpen) S.ui.unread = 0;
  $("#side")?.classList.toggle("open", S.ui.sideOpen);
  renderTop();
}

function feedEntry(entry) {
  const time = new Date(entry.ts * 1000).toLocaleTimeString();
  if (entry.kind === "chat") return h("div", { class: "entry chat", title: time }, h("b", {}, entry.name), ": ", entry.text);
  const st = S.state;
  const color = entry.seat != null && st?.seats[entry.seat] ? st.seats[entry.seat].color : null;
  const dot = color ? h("span", { class: "who", style: { background: fill(color)[0] } }) : null;
  return h("div", { class: "entry log", title: time }, dot, richText(entry.text));
}

function renderFeed() {
  const feed = $("#feed");
  if (!feed) return;
  feed.replaceChildren(...S.log.map(feedEntry));
  feed.scrollTop = feed.scrollHeight;
}

function appendFeed(entry) {
  const feed = $("#feed");
  if (!feed) return;
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
  feed.append(feedEntry(entry));
  while (feed.children.length > 400) feed.firstChild.remove();
  if (atBottom || entry.member === S.me) feed.scrollTop = feed.scrollHeight;
}

function iconBtn(icon, title, onclick, cls = "", badge = 0) {
  return h("button", { class: `icon-btn ${cls}`, title, "aria-label": title, onclick }, icon, badge ? h("span", { class: "badge-dot" }, badge) : null);
}

const volumeControl = (() => {
  const btn = h("button", { class: "icon-btn" });
  const range = h("input", { type: "range", min: 0, max: 100, step: 1, class: "vol-range", "aria-label": "Volume" });
  const pct = h("span", { class: "vol-pct" });
  const sync = () => {
    const vol = getVolume();
    const off = isMuted() || vol === 0;
    btn.textContent = off ? "🔇" : vol < 0.4 ? "🔉" : "🔊";
    btn.title = off ? "Sound off. Click to turn on" : "Click to mute";
    range.value = String(Math.round(vol * 100));
    pct.textContent = off ? "off" : `${Math.round(vol * 100)}%`;
  };
  btn.addEventListener("click", () => {
    unlockAudio();
    if (isMuted() || getVolume() === 0) {
      setMuted(false);
      if (getVolume() === 0) setVolume(0.8);
      sync();
      sfx.loot();
    } else {
      setMuted(true);
      sync();
    }
  });
  range.addEventListener("input", () => {
    setVolume(Number(range.value) / 100);
    if (isMuted()) setMuted(false);
    sync();
  });
  range.addEventListener("change", () => sfx.step());
  sync();
  const place = () => {
    const r = btn.getBoundingClientRect();
    wrap.style.setProperty("--vol-top", `${r.bottom + 4}px`);
    wrap.style.setProperty("--vol-right", `${Math.max(8, window.innerWidth - r.right - 60)}px`);
  };
  const wrap = h("div", { class: "vol", onpointerenter: place, onfocusin: place }, btn, h("div", { class: "vol-pop" }, h("span", {}, "🔈"), range, pct));
  return wrap;
})();

function renderTop() {
  const top = $("#topbar");
  if (!top) return;
  const st = S.state;
  const g = st?.game;
  let info = "";
  if (st?.status === "lobby") info = "Lobby";
  else if (g) info = `Round ${g.round} · ${g.dragon_seen ? "🐉 the Dragon is awake" : "the Dragon still sleeps"}`;
  const before = [
    h("span", { class: "brand", title: "Home", onclick: leaveTable }, "Karak"),
    h("span", { class: "chip code", title: "Copy table code", onclick: copyCode }, "📋 ", S.code),
    h("span", { class: "round-info" }, info),
    h("span", { class: "spacer" }),
    g ? iconBtn("📊", "Scores", showScores) : null,
    iconBtn("❓", "How to play", showRules),
  ].filter(Boolean);
  const after = [iconBtn("💬", "Chronicle & players", toggleSide, "only-narrow", S.ui.unread), iconBtn("⋯", "Menu", toggleMenu)];
  if (volumeControl.parentNode !== top) top.append(volumeControl);
  for (const el of [...top.children]) if (el !== volumeControl) el.remove();
  volumeControl.before(...before);
  volumeControl.after(...after);
  document.getElementById("menu")?.remove();
  if (S.ui.menu) document.body.append(renderMenu());
}

function toggleMenu() {
  S.ui.menu = !S.ui.menu;
  renderTop();
}

function renderMenu() {
  const st = S.state;
  const isHost = st?.host === S.me;
  const item = (label, fn) =>
    h(
      "button",
      {
        onclick: () => {
          S.ui.menu = false;
          renderTop();
          fn();
        },
      },
      label,
    );
  return h(
    "div",
    { class: "menu", id: "menu" },
    item("🔗 Copy invite link", copyInvite),
    item("📱 Continue on another device", async () => {
      const url = `${inviteUrl()}?me=${S.token}`;
      const ok = await copyText(url);
      toast(ok ? "Personal link copied. Open it on your other device (don't share it!)" : url, !ok);
    }),
    item("✏️ Change my name", async () => {
      const name = await askName("Change your name", true);
      if (name) send({ type: "rename", name });
    }),
    isHost && st?.status !== "lobby"
      ? item("⏹ End game, back to lobby", () => {
          if (confirm("End the current game for everyone?")) send({ type: "to_lobby" });
        })
      : null,
    item("🚪 Leave table", leaveTable),
  );
}

document.addEventListener("click", (e) => {
  if (S.ui.menu && !e.target.closest(".menu") && !e.target.closest('[title="Menu"]')) {
    S.ui.menu = false;
    renderTop();
  }
});

function leaveTable() {
  S.ui.menu = false;
  document.getElementById("menu")?.remove();
  closeSocket();
  go("/");
}

function inviteUrl() {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const base = S.config.public_url || (local && S.config.lan_url) || location.origin;
  return `${base.replace(/\/$/, "")}/r/${S.code}`;
}

async function copyCode() {
  const ok = await copyText(S.code);
  toast(ok ? `Table code ${S.code} copied` : `Table code: ${S.code}`, !ok);
}

async function copyInvite() {
  const ok = await copyText(inviteUrl());
  toast(ok ? "Invite link copied. Send it to your friends!" : inviteUrl(), !ok);
}

// ------------------------------------------------------------------ dialogs
function askName(title, dismissable = false) {
  return new Promise((resolve) => {
    const suggestion = S.name || suggestName();
    const input = h("input", { class: "text", value: S.name, placeholder: suggestion, maxlength: 20, style: { width: "100%" } });
    let close = null;
    const done = (e) => {
      e?.preventDefault();
      const name = saveName(input.value || suggestion);
      close();
      resolve(name);
    };
    close = openDialog(
      h("div", { class: "modal" }, h("h2", {}, title), h("p", { class: "sub" }, "Pick a name the other players will see."), h("form", { onsubmit: done }, input, h("div", { class: "actions" }, h("button", { class: "btn primary", type: "submit" }, "Enter the dungeon")))),
      { dismissable, onClose: () => resolve(null) },
    );
    input.focus();
  });
}

function showRules() {
  let close = null;
  const monsters = S.config.monsters.filter((m) => !m.expansion);
  const regentMonsters = S.config.monsters.filter((m) => m.expansion);
  const beast = (m) => h("div", { class: "beast" }, token(m.key, 46, m.strength), h("div", {}, h("b", {}, m.name), h("small", {}, ` ×${m.count}`), h("div", { class: "loot-line" }, "drops ", itemIcon(m.loot, 20), S.items[m.loot]?.name)));
  const heroRule = (hero) => h("div", { class: "hero-rule" }, heroPortrait(hero.key, hero.color, 44), h("div", {}, h("b", {}, hero.name), hero.skills.map((sk) => h("div", { class: "skill" }, h("i", {}, sk.name), ": ", sk.text))));
  close = openDialog(
    h(
      "div",
      { class: "modal wide rules parchment" },
      h("h2", {}, "How to play Karak"),
      h(
        "div",
        { class: "rules-text" },
        h("p", {}, h("b", {}, "Goal: "), "collect the most treasure. Chests and The Fallen give 1 point each, the Dragon's ruby 1½. The game ends the moment someone defeats the Dragon, and the richest hero wins, not necessarily the dragon slayer."),
        h("h4", {}, "Your turn: up to 4 moves"),
        h(
          "ul",
          {},
          h("li", {}, h("b", {}, "Explore"), ": step through an open passage into the dark: a tile is drawn and laid there (turn it so it connects back to you)."),
          h("li", {}, h("b", {}, "Rooms"), " draw a token from the bag when first discovered: a locked chest or a monster you must fight right away."),
          h("li", {}, h("b", {}, "Walk"), " over discovered tiles along open passages. You can't walk past a monster: entering its room means a fight."),
          h("li", {}, h("b", {}, "Teleportation gates"), " link up once two are found: stepping from one to another costs a move."),
          h("li", {}, "Picking up equipment, unlocking a chest (needs a key) or healing all end your turn, so stop on that tile."),
        ),
        h("h4", {}, "Fighting"),
        h(
          "ul",
          {},
          h("li", {}, "Roll two dice and add your weapons. After the roll you may cast magic bolts, +1 each (they're used up)."),
          h("li", {}, h("b", {}, "Higher"), " than the monster's strength: it's defeated and you take its loot. ", h("b", {}, "Equal"), ": you fall back to where you came from. ", h("b", {}, "Lower"), ": you also lose 1 HP."),
          h("li", {}, "A fight always ends your turn. At 0 HP you're knocked out and miss a turn (then get 1 HP back)."),
        ),
        h(
          "div",
          { class: "bestiary" },
          monsters.map(beast),
        ),
        h("h4", {}, "Equipment"),
        h(
          "ul",
          {},
          h("li", {}, "2 weapon slots (daggers +1, sword +2, axe +3), 3 spell slots, 1 key slot. Treasure doesn't take a slot. If a slot is full, leave something on the floor; anyone can pick it up later."),
          h("li", {}, h("b", {}, "Portal of healing"), " (spell): at any time on your turn, send any hero (you or another) to a fountain, fully healed and freed of the Curse. Free, and your turn goes on."),
        ),
        h("h4", {}, "Healing & the Curse"),
        h(
          "ul",
          {},
          h("li", {}, "End your turn on a healing fountain (the start tile is one) to heal fully."),
          h("li", {}, "Defeating a ", h("b", {}, "mummy"), " lets you put the Curse on another hero: they lose both hero skills until they heal at a fountain."),
        ),
        h("h4", {}, "Heroes"),
        h(
          "div",
          { class: "hero-rules" },
          S.config.heroes.filter((x) => x.pickable && !x.expansion).map(heroRule),
        ),
        h("h4", {}, "Karak: Regent (optional expansion, switched on in the table rules)"),
        h(
          "ul",
          {},
          h("li", {}, h("b", {}, "Battle arena"), " (straight passage): the first hero to step in summons another hero to a duel. The challenger rolls and decides on spells first, then the summoned hero. The higher total wins (spells and hero skills all count); the winner takes one item or treasure, the loser loses 1 life. A draw changes nothing. Afterwards it's a plain corridor."),
          h("li", {}, h("b", {}, "Cursed chamber"), " (4 entrances): whoever enters rolls a die; on 1–3 the Curse falls on them (it moves from whoever had it). Falling back onto it after a fight rolls again."),
          h("li", {}, h("b", {}, "Thorn of darkness"), " (dropped by bats): spell that costs no move; take 1 life from another hero, on your own turn."),
          h("li", {}, h("b", {}, "Frost fist"), " (dropped by ice mages): spell, +2 in a fight, even after rolling."),
          h("li", {}, h("b", {}, "The Lord of Karak"), " (game version): when 5 arenas and cursed chambers have been found, the weakest hero (least treasure, then weapon power, then other items, then lowest die) is healed, uncursed and possessed: he loses his own skills (2 players: keeps them) and gains the skills of all other heroes."),
        ),
        h("div", { class: "bestiary" }, regentMonsters.map(beast)),
        h("div", { class: "hero-rules" }, S.config.heroes.filter((x) => x.expansion).map(heroRule), S.config.heroes.filter((x) => !x.pickable).map(heroRule)),
        h("h4", {}, "Controls"),
        h("ul", {}, h("li", {}, "Click a glowing tile (or use the arrow keys / WASD) to walk or explore. ", h("b", {}, "Space"), " rolls and strikes, ", h("b", {}, "E"), " ends your turn, ", h("b", {}, "H"), " asks for a hint, ", h("b", {}, "0"), " recentres the map.")),
        h("p", { class: "small-print" }, "House rule: if the labyrinth can't grow any more while the Dragon is still in the bag, it wakes up in the empty room farthest from the start."),
      ),
      h("div", { class: "actions" }, h("button", { class: "btn primary", onclick: () => close() }, "To the dungeon!")),
    ),
  );
}

function showScores() {
  const st = S.state;
  if (!st?.game) return;
  let close = null;
  close = openDialog(h("div", { class: "modal wide" }, h("h2", {}, st.game.result ? "Final treasure" : "Treasure so far"), scoreTable(st), h("div", { class: "actions" }, h("button", { class: "btn primary", onclick: () => close() }, "Close"))));
}

function scoreTable(st) {
  const g = st.game;
  const res = g.result;
  return h(
    "table",
    { class: "scores" },
    h("thead", {}, h("tr", {}, ["Hero", "Treasure", "Points", "HP", "Weapons", "Spells", "Key"].map((t) => h("th", {}, t)))),
    h(
      "tbody",
      {},
      g.players.map((p, seat) =>
        h(
          "tr",
          { class: res?.winners.includes(seat) ? "win" : "" },
          h("td", { class: "pl" }, heroPortrait(p.hero, st.seats[seat].color, 28), h("span", {}, st.seats[seat].name, h("small", {}, ` the ${heroName(p.hero)}`)), res?.winners.includes(seat) ? " 🏆" : "", res?.dragon_slain_by === seat ? " 🐉" : ""),
          h("td", {}, h("span", { class: "treasure-row" }, p.treasures.map((t) => itemIcon(t, 22)))),
          h("td", { class: "big" }, pts(p.points)),
          h("td", {}, `${p.hp}/${g.max_hp}`),
          h("td", {}, h("span", { class: "treasure-row" }, p.weapons.map((w) => itemIcon(w, 22))), p.power ? ` +${p.power}` : ""),
          h("td", {}, h("span", { class: "treasure-row" }, p.spells.map((w) => itemIcon(w, 22)))),
          h("td", {}, p.keys.length ? itemIcon("key", 22) : "·"),
        ),
      ),
    ),
  );
}

// ------------------------------------------------------------------ rendering
function render() {
  renderTop();
  const st = S.state;
  const main = $("#main");
  if (!st || !main) return;
  if (st.status === "lobby") {
    renderPlayers(st);
    renderLobby(st, main);
  } else renderGame(st, main);
  renderOverlay();
}

function avatar(s, online) {
  const [light, dark] = fill(s.color);
  const label = s.bot ? "🤖" : (s.name || "?").trim().charAt(0).toUpperCase();
  return h("span", { class: `avatar ${s.bot ? "" : online ? "online" : "offline"}`, style: { background: `linear-gradient(180deg, ${light}, ${dark})` } }, label);
}

const botInfo = (key) => S.bots.find((b) => b.key === key);

function renderLobby(st, main) {
  S.board = null;
  const isHost = st.host === S.me;
  const mySeat = st.you.seat;
  const n = st.seats.length;
  const hostName = st.seats.find((s) => s.member === st.host)?.name || st.spectators.find((s) => s.member === st.host)?.name || "the host";
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  let note = null;
  if (!S.config.public_url) {
    if (local && !S.config.lan_url) note = "This link only works on this computer. Restart with `uv run karak serve --tunnel` to invite people over the internet.";
    else if (!location.hostname.endsWith("trycloudflare.com")) note = "Works for people on the same network. For friends elsewhere, run `uv run karak serve --tunnel`.";
  }
  const linkInput = h("input", { class: "text", readonly: true, value: inviteUrl(), onclick: (e) => e.target.select() });
  const invite = h(
    "div",
    { class: "invite" },
    h("div", {}, h("h2", {}, "Gather your party"), h("p", {}, "Anyone who opens the link joins this table. Fill the other seats with bots (1–5 heroes)."), note ? h("p", { class: "note" }, "ℹ️ ", note) : null),
    h(
      "div",
      { class: "link-box" },
      linkInput,
      h("button", { class: "btn primary", onclick: copyInvite }, "Copy link"),
      navigator.share ? h("button", { class: "btn", onclick: () => navigator.share({ title: "Play Karak with me", url: inviteUrl() }).catch(() => {}) }, "Share") : null,
    ),
  );
  const lobbyHeroes = S.config.heroes.filter((x) => x.pickable && (!x.expansion || st.settings.expansion));
  const taken = new Map(st.seats.filter((s) => s.hero).map((s) => [s.hero, s]));
  const seatRows = st.seats.map((s, i) => {
    const bot = s.bot ? botInfo(s.bot) : null;
    const isMe = i === mySeat;
    const canPick = isMe || (isHost && s.bot);
    const heroSelect = canPick
      ? h(
          "select",
          { class: "select hero-select", onchange: (e) => send({ type: "pick_hero", seat: i, hero: e.target.value || null }) },
          h("option", { value: "" }, "🎲 Random hero"),
          lobbyHeroes.map((hero) => {
            const owner = taken.get(hero.key);
            const opt = h("option", { value: hero.key, disabled: owner && owner !== s }, hero.name + (owner && owner !== s ? ` (${owner.name})` : ""));
            opt.selected = s.hero === hero.key;
            return opt;
          }),
        )
      : h("span", { class: "tag" }, s.hero ? heroName(s.hero) : "random hero");
    return h(
      "div",
      { class: "seat-row" },
      heroPortrait(s.hero, s.color, 40),
      h("span", { class: "name" }, s.name, s.bot ? h("small", {}, " 🤖") : null),
      s.member === st.host ? h("span", { class: "tag host" }, "Host") : null,
      isMe ? h("span", { class: "tag you" }, "You") : null,
      bot ? h("span", { class: "tag stars", title: bot.description }, "★".repeat(bot.stars)) : null,
      !s.bot && !s.connected ? h("span", { class: "tag" }, "offline") : null,
      heroSelect,
      isMe ? h("button", { class: "icon-btn", title: "Leave seat (watch instead)", onclick: () => send({ type: "stand" }) }, "⏏") : null,
      isHost && !isMe ? h("button", { class: "icon-btn", title: "Remove", onclick: () => send({ type: "remove_seat", seat: i }) }, "✕") : null,
    );
  });
  if (n < MAX_SEATS) seatRows.push(h("div", { class: "seat-empty" }, `${MAX_SEATS - n} empty seat${MAX_SEATS - n === 1 ? "" : "s"}. Invite someone or add a bot`));
  const spectators = st.spectators.filter((s) => s.connected);
  const seatsPanel = h(
    "div",
    { class: "panel" },
    h("h3", {}, "The party", h("small", {}, `${n} / ${MAX_SEATS}`)),
    h("div", { class: "seat-list" }, seatRows),
    spectators.length ? h("p", { class: "waiting" }, "Watching: ", spectators.map((s) => s.name).join(", ")) : null,
    mySeat == null && n < MAX_SEATS ? h("div", { style: { marginTop: "10px" } }, h("button", { class: "btn primary", onclick: () => send({ type: "sit" }) }, "Take a seat")) : null,
  );
  const heroesPanel = h(
    "details",
    { class: "panel heroes-panel", open: S.ui.heroesOpen, ontoggle: (e) => (S.ui.heroesOpen = e.target.open) },
    h(
      "summary",
      {},
      h("span", { class: "hp-title" }, "Heroes and their skills"),
      h("span", { class: "hp-faces" }, lobbyHeroes.map((hero) => heroPortrait(hero.key, hero.color, 30))),
      h("small", {}, mySeat != null ? "click a hero to choose yours" : ""),
    ),
    h(
      "div",
      { class: "hero-grid" },
      lobbyHeroes.map((hero) => {
        const owner = taken.get(hero.key);
        const mine = owner && st.seats.indexOf(owner) === mySeat;
        return h(
          "button",
          {
            class: `hero-card ${mine ? "mine" : ""} ${owner && !mine ? "taken" : ""}`,
            style: { "--hl": fill(hero.color)[0], "--hd": fill(hero.color)[1] },
            disabled: mySeat == null || (owner && !mine),
            onclick: () => send({ type: "pick_hero", seat: mySeat, hero: mine ? null : hero.key }),
          },
          heroPortrait(hero.key, hero.color, 64),
          h("div", { class: "hc-body" }, h("div", { class: "hc-name" }, hero.name, owner ? h("small", {}, ` · ${owner.name}`) : null), hero.skills.map((sk) => h("div", { class: "hc-skill" }, h("b", {}, sk.name), " ", sk.text))),
        );
      }),
    ),
  );
  const botsPanel = h(
    "div",
    { class: "panel" },
    h("h3", {}, "Add a bot", isHost ? null : h("small", {}, "host only")),
    h(
      "div",
      { class: "bot-grid" },
      S.bots.map((b) =>
        h(
          "button",
          { class: "bot-btn", disabled: !isHost || n >= MAX_SEATS || (st.settings.expansion && !b.expansion), title: st.settings.expansion && !b.expansion ? "This bot only knows the base game" : b.description, onclick: () => send({ type: "add_bot", bot: b.key }) },
          h("span", { class: "bname" }, b.label),
          h("span", { class: "stars" }, "★".repeat(b.stars), h("span", { style: { opacity: 0.3 } }, "★".repeat(5 - b.stars))),
          h("span", { class: "bdesc" }, b.description),
        ),
      ),
    ),
  );
  const set = st.settings;
  const change = (k, v) => send({ type: "settings", changes: { [k]: v } });
  const select = (k, options) =>
    h(
      "select",
      { class: "select", disabled: !isHost, onchange: (e) => change(k, isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value)) },
      options.map(([value, label]) => {
        const opt = h("option", { value }, label);
        opt.selected = String(set[k]) === String(value);
        return opt;
      }),
    );
  const toggle = (k, off = false) => {
    const input = h("input", { type: "checkbox", disabled: !isHost || off, onchange: (e) => change(k, e.target.checked) });
    input.checked = !!set[k];
    return h("label", { class: "switch" }, input, h("span"));
  };
  const row = (label, help, control) => h("div", { class: "setting" }, h("span", { class: "label" }, label, h("small", {}, help)), control);
  const settingsPanel = h(
    "div",
    { class: "panel" },
    h("h3", {}, "Table rules", isHost ? null : h("small", {}, "set by the host")),
    h(
      "div",
      { class: "settings" },
      row("Turn timer", "The autopilot finishes your turn when time runs out", select("turn_timer", [[0, "Off"], [30, "30 s"], [60, "1 min"], [90, "90 s"], [180, "3 min"]])),
      row("Bot speed", "How fast bots play", select("bot_speed", [["slow", "Relaxed"], ["normal", "Normal"], ["fast", "Fast"]])),
      row("Hints", "Players may ask the Champion bot for advice", toggle("hints")),
      row("Karak: Regent expansion", "Adds battle arenas, cursed chambers and more chambers, four heroes (Barbarian, Battle mage, Acrobat, Ranger), bats, ice mages and two new spells. The trained AI bot only knows the base game", toggle("expansion")),
      row("The Lord of Karak", "Game version: once 5 arenas and cursed chambers are found, the weakest hero is possessed by the Lord of Karak and gets every other hero's skills. Needs the expansion", toggle("lord", !set.expansion)),
      row("See what's left", "Tap the tile pile or the bag to see which tiles, monsters and chests remain. Off: only how many", toggle("peek")),
    ),
  );
  const actions = isHost
    ? h(
        "div",
        { class: "lobby-actions" },
        h("button", { class: "btn", disabled: n < 2, onclick: () => send({ type: "shuffle" }) }, "🔀 Shuffle seats"),
        h("button", { class: "btn primary big", disabled: n < 1, onclick: () => send({ type: "start" }) }, n < 1 ? "Take a seat first" : `⚔️ Descend · ${plural(n, "hero")}`),
      )
    : h("div", { class: "lobby-actions" }, h("span", { class: "waiting" }, `Waiting for ${hostName} to start the game…`));
  main.replaceChildren(h("section", { class: "lobby" }, invite, h("div", { class: "lobby-grid" }, seatsPanel, h("div", { class: "lobby-col" }, botsPanel, settingsPanel)), actions, heroesPanel));
}

// ------------------------------------------------------------------ game view
const legalOf = (g, type) => (g.legal || []).filter((a) => a.type === type);
const has = (g, type) => (g.legal || []).some((a) => a.type === type);
const myTurn = (st) => st.status === "playing" && st.game.actor === st.you.seat && st.game.legal.length > 0 && !S.ui.pending;
const skillsOf = (g, p) => (p.hero === "lord" ? p.skills.flatMap((k) => S.heroes[k]?.skills || []) : S.heroes[p.hero].skills);
// Where a hero carries an item: the acrobat keeps spare daggers in her spell slots.
const carrySlot = (g, seat, item) => {
  const p = g.players[seat];
  const slot = S.items[item].slot;
  if (item === "dagger" && p.skills.includes("acrobat") && g.cursed !== seat && p.weapons.length >= 2 && p.spells.length < 3) return "spell";
  return slot;
};
const ownedIn = (p, slot) => (slot === "weapon" ? p.weapons : slot === "spell" ? p.spells : p.keys);

function ensureBoard(main) {
  if (S.board && main.querySelector(".game")) return;
  if (!S.board) S.board = new Board({ onAct: onBoardAct, onTile: onTileClick });
  const zoom = h(
    "div",
    { class: "zoom" },
    h("button", { class: "icon-btn", title: "Zoom in", onclick: () => S.board.zoomAt(1.3) }, "+"),
    h("button", { class: "icon-btn", title: "Zoom out", onclick: () => S.board.zoomAt(1 / 1.3) }, "−"),
    h("button", { class: "icon-btn", title: "Whole labyrinth (0)", onclick: () => S.board.resetView() }, "⤢"),
  );
  main.replaceChildren(
    h(
      "section",
      { class: "game" },
      h("div", { class: "board-wrap", id: "board-wrap" }, S.board.el, zoom, h("div", { class: "hud", id: "hud" }), h("div", { class: "status", id: "status" }), h("div", { id: "panel", class: "panel-slot" })),
      h("div", { class: "dock", id: "dock" }),
    ),
  );
}

function renderGame(st, main) {
  ensureBoard(main);
  const g = st.game;
  g.monsters = S.monsters;
  const mine = myTurn(st);
  if (!mine || !has(g, "cast_healing")) S.ui.healing = null;
  if (!mine || !has(g, S.ui.mode || "-")) S.ui.mode = null;
  const dash = ["sprint", "blitz"];
  const legal = !mine
    ? []
    : S.ui.healing != null
      ? g.legal.filter((a) => a.type === "cast_healing" && a.seat === S.ui.healing)
      : S.ui.mode
        ? g.legal.filter((a) => a.type === S.ui.mode)
        : g.legal.filter((a) => a.type !== "cast_healing" && !dash.includes(a.type));
  S.board.update(g, st.seats, { me: st.you.seat, legal, hint: S.ui.hint, fresh: S.ui.fresh });
  renderHud($("#hud"), g, { onTiles: (btn) => toggleHudPopup(btn, "pile"), onBag: (btn) => toggleHudPopup(btn, "bag") });
  if (g.lord_mode) {
    const lord = g.lord != null ? `${seatName(st, g.lord)} is the Lord of Karak` : `${Math.min(g.chambers, 5)} of 5 arenas and cursed chambers found: then the Lord of Karak possesses the weakest hero`;
    $("#hud").append(h("div", { class: `hud-btn static lord-count ${g.lord != null ? "awake" : ""}`, title: lord }, h("span", {}, "👑"), h("span", { class: "num" }, g.lord != null ? "!" : `${Math.min(g.chambers, 5)}/5`)));
  }
  renderPlayers(st);
  renderDock(st);
  renderStatus(st);
  renderPanel(st);
}

function toggleHudPopup(btn, kind) {
  if (popoverEl?.dataset.hud === kind) return closePopover();
  const g = S.state?.game;
  if (!g) return;
  const r = btn.getBoundingClientRect();
  openPopover(r.left + r.width / 2, r.bottom, kind === "pile" ? pilePopup(g, (k, mask) => S.board.symbol(k, mask, 0)) : bagPopup(g, S.monsters));
  popoverEl.dataset.hud = kind;
}

function onBoardAct(action) {
  const st = S.state;
  if (!st?.game || !myTurn(st)) return;
  if (action.type === "_rotate") {
    S.board.rotateGhost(action.by, st.game);
    sfx.step();
    render();
    return;
  }
  if (action.type === "cast_healing") S.ui.healing = null;
  act(action);
}

function tileLabel(t) {
  return { start: "The entrance (a healing fountain)", corridor: "Corridor", room: "Chamber", fountain: "Healing fountain", portal: "Teleportation gate", arena: t.spent ? "Battle arena (fought in)" : "Battle arena", cursed: "Cursed chamber" }[t.kind];
}

function onTileClick([x, y], e) {
  const st = S.state;
  const g = st?.game;
  if (!g) return;
  const t = g.tiles.find((q) => q.x === x && q.y === y);
  if (!t) return;
  const here = g.players.map((p, seat) => ({ p, seat })).filter(({ p }) => p.x === x && p.y === y);
  const parts = [h("h4", {}, tileLabel(t))];
  if (t.token === "chest") parts.push(h("div", { class: "pop-row" }, token("chest", 36), "A locked chest. End your turn here with a key to open it (+1 treasure)."));
  else if (t.token) {
    const m = S.monsters[t.token];
    parts.push(h("div", { class: "pop-row" }, token(t.token, 40, m.strength), h("div", {}, h("b", {}, m.name), ` · strength ${m.strength}`, h("div", { class: "loot-line" }, "drops ", itemIcon(m.loot, 18), S.items[m.loot].name))));
  }
  if (t.items.length) parts.push(h("div", { class: "pop-row" }, "On the floor: ", t.items.map((i) => h("span", { class: "chip-item" }, itemIcon(i, 20), S.items[i].name))));
  if (here.length) parts.push(h("div", { class: "pop-row" }, here.map(({ p, seat }) => h("span", { class: "chip-item" }, heroPortrait(p.hero, st.seats[seat].color, 22), st.seats[seat].name))));
  if (t.kind === "fountain" || t.kind === "start") parts.push(h("p", { class: "why" }, "End your turn here to heal fully and lift the Curse."));
  if (t.kind === "portal") parts.push(h("p", { class: "why" }, "Step to any other discovered gate for 1 move."));
  if (t.kind === "arena") parts.push(h("p", { class: "why" }, t.spent ? "The duel has been fought: it's a plain corridor now." : "The first hero to enter summons another hero to a duel."));
  if (t.kind === "cursed") parts.push(h("p", { class: "why" }, "Everyone who enters rolls a die: on 1–3 the Curse falls on them."));
  openPopover(e.clientX, e.clientY, h("div", {}, parts));
}

function hpRow(p, max, size = 16) {
  return h("span", { class: "hp-row" }, Array.from({ length: max }, (_, i) => art(i < p.hp ? "misc-heart" : "misc-skull", size, i < p.hp ? "hp" : "hp lost")));
}

function renderPlayers(st) {
  const box = $("#players");
  if (!box) return;
  const g = st.game;
  if (!g || st.status === "lobby") {
    box.replaceChildren();
    return;
  }
  const isHost = st.host === S.me;
  box.replaceChildren(
    ...st.seats.map((s, seat) => {
      const p = g.players[seat];
      const current = g.actor === seat;
      const badges = [];
      if (g.lord === seat) badges.push("👑 possessed");
      if (s.bot) badges.push(botInfo(s.bot)?.label || "bot");
      if (s.autoplay) badges.push("autopilot");
      if (!s.bot && !s.connected) badges.push("offline");
      const takeOver =
        isHost && st.status === "playing" && !s.bot && !s.connected && !s.autoplay ? h("button", { class: "btn small", onclick: () => send({ type: "autoplay", seat, on: true }) }, "🤖 Let a bot play") : null;
      return h(
        "div",
        {
          class: `pl-row ${current ? "current" : ""} ${g.cursed === seat ? "cursed" : ""} ${p.knocked_out ? "ko" : ""}`,
          "data-seat": seat,
          style: { "--hl": fill(s.color)[0], "--hd": fill(s.color)[1] },
          title: "Click to see everything this hero carries",
          onclick: (e) => {
            if (!e.target.closest("button")) playerPopover(st, seat, e);
          },
        },
        h(
          "div",
          { class: "pl-top" },
          heroPortrait(p.hero, s.color, 38),
          h("div", { class: "pl-id" }, h("span", { class: "pl-name" }, s.name, seat === st.you.seat ? h("small", {}, " (you)") : null), h("span", { class: "pl-hero" }, p.hero === "lord" ? `Lord of Karak (was ${heroName(p.origin)})` : heroName(p.hero), badges.length ? ` · ${badges.join(" · ")}` : "")),
          g.cursed === seat ? h("span", { title: "Cursed: no hero skills until healed at a fountain" }, art("misc-curse", 22)) : null,
          h("span", { class: "pl-score", title: "Treasure points" }, pts(p.points)),
        ),
        h(
          "div",
          { class: "pl-stats" },
          hpRow(p, g.max_hp, 14),
          h("span", { class: "pl-gear" }, p.weapons.map((w) => itemIcon(w, 18)), p.spells.map((w) => itemIcon(w, 18)), p.keys.map((w) => itemIcon(w, 18)), p.power ? h("b", { class: "power", title: "Weapons add this to every fight" }, `⚔+${p.power}`) : null),
          p.treasures.length ? h("span", { class: "pl-treasure" }, p.treasures.map((t) => itemIcon(t, 18))) : null,
        ),
        p.knocked_out ? h("div", { class: "ko-note" }, "💫 unconscious, skips the next turn") : null,
        takeOver,
      );
    }),
  );
}

// Everything a hero carries, for the curse choice and the player popover.
function heroAssets(g, seat, size = 22) {
  const p = g.players[seat];
  const group = (label, items, extra = null) =>
    h("div", { class: "asset-group" }, h("span", { class: "asset-label" }, label), h("span", { class: "asset-items" }, items.length ? items.map((x) => itemIcon(x, size)) : h("span", { class: "asset-none" }, "none"), extra));
  return h(
    "div",
    { class: "assets" },
    h("div", { class: "asset-group" }, h("span", { class: "asset-label" }, "Life"), hpRow(p, g.max_hp, size * 0.6)),
    group("Weapons", p.weapons, p.power ? h("b", { class: "power", title: "Added to every fight" }, ` +${p.power}`) : null),
    group("Spells", p.spells),
    group("Key", p.keys),
    group("Treasure", p.treasures, p.treasures.length ? h("b", { class: "power" }, ` ${pts(p.points)} pts`) : null),
  );
}

function playerPopover(st, seat, e) {
  const g = st.game;
  const p = g.players[seat];
  const s = st.seats[seat];
  S.board?.focus(p.x, p.y);
  openPopover(
    e.clientX,
    e.clientY,
    h(
      "div",
      {},
      h("div", { class: "pop-row" }, heroPortrait(p.hero, s.color, 40), h("div", {}, h("h4", {}, s.name), h("div", { class: "loot-line" }, heroName(p.hero), g.cursed === seat ? " · cursed" : "", p.knocked_out ? " · unconscious" : ""))),
      heroAssets(g, seat),
    ),
  );
}

function slot(item, empty, label, attrs = {}) {
  return h("div", { class: `slot ${item ? "full" : ""} ${attrs.cls || ""}`, title: item ? S.items[item].name : label, onclick: attrs.onclick }, item ? itemIcon(item, 38) : h("span", { class: "slot-empty" }, empty));
}

function renderDock(st) {
  const box = $("#dock");
  if (!box) return;
  const g = st.game;
  const seat = st.you.seat;
  if (seat == null) {
    box.replaceChildren(h("div", { class: "watching" }, "👀 You're watching this game. You'll get a seat when the host returns to the lobby."));
    return;
  }
  const p = g.players[seat];
  const color = st.seats[seat].color;
  const hero = S.heroes[p.hero];
  const cursed = g.cursed === seat;
  const mine = myTurn(st);
  const canCast = mine && has(g, "cast_healing");
  const canThorn = mine && has(g, "thorn");
  const spells = [0, 1, 2].map((i) => {
    const sp = p.spells[i];
    const castable = (sp === "healing" && canCast) || (sp === "thorn" && canThorn);
    return slot(sp, "✦", "Spell slot", { cls: castable ? "castable" : "", onclick: castable ? (e) => (sp === "thorn" ? thornPopover(st, e) : castHealingDialog(st)) : null });
  });
  const sheet = h(
    "div",
    { class: `sheet ${cursed ? "cursed" : ""}`, style: { "--hl": fill(color)[0], "--hd": fill(color)[1] } },
    h(
      "div",
      { class: "sheet-hero" },
      heroPortrait(p.hero, color, 74, "big"),
      h(
        "div",
        { class: "sheet-id" },
        h("div", { class: "sheet-name" }, p.hero === "lord" ? `${hero.name} (was ${heroName(p.origin)})` : hero.name, cursed ? h("span", { class: "curse-tag", title: "No hero skills until you heal at a fountain" }, art("misc-curse", 18), " Cursed") : null),
        skillsOf(g, p).map((sk) => h("div", { class: `skill ${cursed ? "off" : ""}`, title: sk.text }, h("b", {}, sk.name), h("span", {}, sk.text))),
      ),
    ),
    h(
      "div",
      { class: "sheet-inv" },
      h("div", { class: "inv-group" }, h("span", { class: "inv-label" }, "Life"), hpRow(p, g.max_hp, 26)),
      h(
        "div",
        { class: "inv-slots" },
        h("div", { class: "inv-group" }, h("span", { class: "inv-label" }, `Weapons${p.power ? ` +${p.power}` : ""}`), h("div", { class: "slots" }, [0, 1].map((i) => slot(p.weapons[i], "⚔", "Weapon slot")))),
        h("div", { class: "inv-group" }, h("span", { class: "inv-label" }, "Spells"), h("div", { class: "slots" }, spells)),
        h("div", { class: "inv-group" }, h("span", { class: "inv-label" }, "Key"), h("div", { class: "slots" }, slot(p.keys[0], "🗝", "Key slot"))),
      ),
    ),
    h(
      "div",
      { class: "sheet-treasure" },
      h("div", { class: "treasure-pile" }, p.treasures.length ? p.treasures.map((t) => itemIcon(t, 30)) : h("span", { class: "slot-empty wide" }, "none yet")),
      h("span", { class: "inv-label" }, `Treasure · ${pts(p.points)}`),
    ),
  );
  box.replaceChildren(sheet, actionBar(st));
}

function actionBar(st) {
  const g = st.game;
  const mine = myTurn(st);
  const seat = st.you.seat;
  const p = g.players[seat];
  const here = g.tiles.find((t) => t.x === p.x && t.y === p.y);
  const hint = S.ui.hint;
  const hinted = (type) => (hint && hint.type === type ? "hint" : "");
  const steps = h(
    "div",
    { class: "steps", title: `${plural(g.current === seat ? g.moves_left : 0, "move")} left` },
    Array.from({ length: g.moves }, (_, i) => h("span", { class: `step ${g.current === seat && i < g.moves_left ? "on" : ""}` }, art("misc-boot", 22))),
  );
  const buttons = [];
  if (mine && g.phase === "turn") {
    const chest = has(g, "open_chest");
    if (chest) buttons.push(h("button", { class: `btn primary ${hinted("open_chest")}`, onclick: () => act({ type: "open_chest" }) }, art("misc-chest", 22), " Open the chest"));
    const pickups = legalOf(g, "pickup");
    const byIndex = new Map();
    for (const a of pickups) {
      if (!byIndex.has(a.index)) byIndex.set(a.index, []);
      byIndex.get(a.index).push(a);
    }
    for (const [index, options] of byIndex) {
      const item = here.items[index];
      buttons.push(
        h(
          "button",
          {
            class: `btn ${hinted("pickup")}`,
            onclick: (e) => {
              if (options.length === 1 && options[0].drop == null) act(options[0]);
              else pickupPopover(st, item, options, e);
            },
          },
          itemIcon(item, 22),
          ` Pick up ${S.items[item].name}`,
        ),
      );
    }
    const swaps = legalOf(g, "swap");
    if (swaps.length) {
      buttons.push(
        h(
          "button",
          {
            class: `btn ${hinted("swap")}`,
            onclick: (e) =>
              openPopover(
                e.clientX,
                e.clientY,
                h("div", {}, h("h4", {}, "Shadow swap"), h("p", { class: "why" }, "Trade places with another hero. It uses all 4 moves."), h("div", { class: "pay-list" }, swaps.map((a) => h("button", { class: "btn", onclick: () => act(a) }, heroPortrait(g.players[a.seat].hero, st.seats[a.seat].color, 22), ` ${st.seats[a.seat].name}`)))),
              ),
          },
          "🔄 Swap",
        ),
      );
    }
    if (has(g, "cast_healing")) buttons.push(h("button", { class: `btn ${hinted("cast_healing")}`, onclick: () => castHealingDialog(st) }, itemIcon("healing", 22), " Portal of healing"));
    for (const [type, label, help] of [["sprint", "🤸 Sprint", "Run up to 8 tiles over discovered tiles (this uses the whole turn). Click a glowing tile."], ["blitz", "⚡ Blitz", "Teleport to a monster and fight it (this uses the whole turn). Click a glowing monster."]]) {
      if (has(g, type)) buttons.push(h("button", { class: `btn ${S.ui.mode === type ? "primary" : ""} ${hinted(type)}`, title: help, onclick: () => ((S.ui.mode = S.ui.mode === type ? null : type), render()) }, label));
    }
    if (has(g, "thorn")) buttons.push(h("button", { class: `btn ${hinted("thorn")}`, onclick: (e) => thornPopover(st, e) }, itemIcon("thorn", 22), " Thorn of darkness"));
    const healing = (here.kind === "fountain" || here.kind === "start") && (p.hp < g.max_hp || g.cursed === seat);
    const partial = legalOf(g, "end_turn").filter((a) => a.heal_to != null);
    if (has(g, "end_turn")) buttons.push(h("button", { class: `btn ${healing ? "primary" : ""} end-btn ${hinted("end_turn")}`, onclick: (e) => (healing && partial.length ? healPopover(st, partial, e) : act({ type: "end_turn" })), title: "E" }, healing ? (partial.length ? "⛲ End turn & heal…" : "⛲ End turn & heal") : "End turn"));
    else buttons.push(h("span", { class: "ab-label" }, "🥷 Keep moving: you can't stop on a monster's tile"));
  }
  const tools = [];
  if (st.settings.hints && mine) tools.push(h("button", { class: "btn small ghost", title: "Ask the Champion bot (H)", onclick: () => send({ type: "hint" }) }, "💡 Hint"));
  return h("div", { class: "action-bar" }, h("div", { class: "ab-top" }, h("span", { class: "ab-label" }, "Moves"), steps), h("div", { class: "ab-buttons" }, buttons), tools.length ? h("div", { class: "ab-tools" }, tools) : null);
}

function thornPopover(st, e) {
  const g = st.game;
  const targets = legalOf(g, "thorn");
  openPopover(
    e.clientX,
    e.clientY,
    h(
      "div",
      {},
      h("h4", {}, "Thorn of darkness"),
      h("p", { class: "why" }, "Free, on your own turn: the thorn is used up and the hero you choose loses 1 life."),
      h("div", { class: "pay-list" }, targets.map((a) => h("button", { class: "btn", onclick: () => (closePopover(), act(a)) }, heroPortrait(g.players[a.seat].hero, st.seats[a.seat].color, 22), ` ${st.seats[a.seat].name} `, hpRow(g.players[a.seat], g.max_hp, 11)))),
    ),
  );
}

function healPopover(st, partial, e) {
  const g = st.game;
  const p = g.players[st.you.seat];
  openPopover(
    e.clientX,
    e.clientY,
    h(
      "div",
      {},
      h("h4", {}, "Berserk: how much to heal?"),
      h("p", { class: "why" }, "Fewer lives mean a bigger berserk bonus (3–4 HP: +1, 1–2 HP: +2)."),
      h(
        "div",
        { class: "pay-list" },
        h("button", { class: "btn primary", onclick: () => (closePopover(), act({ type: "end_turn" })) }, `Heal fully (${g.max_hp} HP)`),
        [...partial].reverse().map((a) => h("button", { class: "btn", onclick: () => (closePopover(), act(a)) }, a.heal_to === p.hp ? `Stay at ${a.heal_to} HP` : `Heal to ${a.heal_to} HP`)),
      ),
    ),
  );
}

function pickupPopover(st, item, options, e) {
  const g = st.game;
  const p = g.players[st.you.seat];
  const slotName = carrySlot(g, st.you.seat, item);
  const owned = ownedIn(p, slotName);
  openPopover(
    e.clientX,
    e.clientY,
    h(
      "div",
      {},
      h("h4", {}, `Pick up ${S.items[item].name}`),
      h("p", { class: "why" }, "Your slots are full. Choose what to leave on the floor. Picking up ends your turn."),
      h("div", { class: "pay-list" }, options.map((a) => h("button", { class: "btn", onclick: () => act(a) }, "Leave ", itemIcon(owned[a.drop], 22), ` ${S.items[owned[a.drop]].name}`))),
    ),
  );
}

function castHealingDialog(st) {
  S.ui.healing = S.ui.healing == null ? st.you.seat : null;
  render();
}

// The fountains to choose from glow on the map (the board draws a spot per cast_healing action for S.ui.healing).
function healingPanel(st) {
  const g = st.game;
  const targets = [...new Set(legalOf(g, "cast_healing").map((a) => a.seat))];
  return h(
    "div",
    { class: "float-panel small" },
    h("h3", {}, itemIcon("healing", 28), " Portal of healing"),
    h("p", { class: "sub" }, "Pick who goes through, then click a glowing fountain on the map. They are fully healed and freed of the Curse; your turn goes on."),
    h(
      "div",
      { class: "pay-list" },
      targets.map((seat) =>
        h(
          "button",
          {
            class: `btn ${seat === S.ui.healing ? "primary" : ""}`,
            onclick: () => {
              S.ui.healing = seat;
              render();
            },
          },
          heroPortrait(g.players[seat].hero, st.seats[seat].color, 24),
          ` ${st.seats[seat].name} `,
          hpRow(g.players[seat], g.max_hp, 11),
          g.cursed === seat ? art("misc-curse", 18) : null,
        ),
      ),
    ),
    h("div", { class: "actions" }, h("button", { class: "btn ghost", onclick: () => castHealingDialog(st) }, "Cancel")),
  );
}

function statusText(st) {
  const g = st.game;
  const seat = st.you.seat;
  if (st.status === "game_over") return { parts: ["🏁 The Dragon is slain. The adventure is over"] };
  const cur = g.actor ?? g.current;
  const name = seatName(st, cur);
  const p = g.players[cur];
  const duel = g.combat?.versus != null;
  if (cur === seat && g.legal.length) {
    switch (g.phase) {
      case "turn":
        if (S.ui.mode) return { mine: true, parts: [S.ui.mode === "sprint" ? "🤸 Click a glowing tile to sprint there" : "⚡ Click a glowing monster to blitz it"] };
        return { mine: true, parts: [g.moves_left ? `Your turn: ${plural(g.moves_left, "move")} left. Click a glowing tile or use the arrow keys.` : "No moves left. Use this tile or end your turn"] };
      case "place":
        return { mine: true, parts: ["Turn the new tile so its passages lead where you want, then place it"] };
      case "choose_token":
        return { mine: true, parts: ["🔮 Foresight: choose which token to place in this room"] };
      case "combat":
        return { mine: true, parts: [duel ? "⚔️ Duel! Roll the dice" : `⚔️ A ${S.monsters[g.combat.monster].name} blocks your way. Fight!`] };
      case "rolled":
        return { mine: true, parts: ["Add spells if you like, then strike"] };
      case "loot":
        return { mine: true, parts: [has(g, "take_loot") ? "Take the loot, or leave it and fight on" : "Your pack is full. Choose what to leave behind"] };
      case "curse":
        return { mine: true, parts: ["☠ Choose who receives the Curse"] };
      case "reincarnate":
        return { mine: true, parts: ["🔥 Undying! Choose the fountain to rise at"] };
      case "retreat":
        return { mine: true, parts: ["Click a glowing neighbouring tile to fall back to"] };
      case "challenge":
        return { mine: true, parts: ["⚔️ Battle arena! Choose the hero to challenge"] };
      case "steal":
        return { mine: true, parts: ["🏅 You won the duel! Choose what to take"] };
    }
  }
  const who = st.seats[cur]?.bot ? `${name} 🤖` : name;
  const doing = {
    turn: "explores the labyrinth…",
    place: "turns a new tile…",
    choose_token: "reads the fates…",
    combat: duel ? "fights a duel in the arena…" : `faces the ${g.combat ? S.monsters[g.combat.monster].name : "monster"}…`,
    rolled: "is fighting…",
    loot: "sorts the loot…",
    curse: "chooses a victim for the Curse…",
    reincarnate: "rises again…",
    retreat: "falls back…",
    challenge: "chooses a hero to challenge…",
    steal: "picks the spoils of the duel…",
  }[g.phase];
  return { parts: [`${who} the ${heroName(p.hero)} ${doing || ""}`] };
}

function renderStatus(st) {
  const box = $("#status");
  if (!box) return;
  const info = statusText(st);
  const cur = st.game.actor ?? st.game.current;
  box.className = `status ${info.mine ? "mine" : ""}`;
  box.replaceChildren(
    h("span", { class: "stext" }, cur != null ? heroPortrait(st.game.players[cur].hero, st.seats[cur].color, 24) : null, info.parts),
    h("div", { class: "timer", id: "timer", style: { width: "0" } }),
  );
}

// ------------------------------------------------------------------ panels over the board
function renderPanel(st) {
  const box = $("#panel");
  if (!box) return;
  const g = st.game;
  if (st.status !== "playing") {
    box.replaceChildren();
    return;
  }
  const mine = myTurn(st);
  let panel = null;
  if (g.phase === "place" && mine) panel = placePanel(st);
  else if (S.ui.healing != null && mine && has(g, "cast_healing")) panel = healingPanel(st);
  else if (g.combat && g.phase !== "retreat") panel = combatPanel(st, mine);
  else if (g.phase === "choose_token") panel = tokenPanel(st, mine);
  else if (g.phase === "loot") panel = lootPanel(st, mine);
  else if (g.phase === "curse") panel = cursePanel(st, mine);
  else if (S.ui.mode && mine) panel = dashPanel(st);
  else if (g.phase === "challenge") panel = challengePanel(st, mine);
  else if (g.phase === "steal") panel = stealPanel(st, mine);
  else if (g.phase === "retreat" && mine) panel = h("div", { class: "float-panel small" }, h("h3", {}, "⚡ Fall back"), h("p", { class: "sub" }, "Click a glowing neighbouring tile to retreat to."));
  else if (g.phase === "reincarnate" && mine) panel = h("div", { class: "float-panel small" }, h("h3", {}, "🔥 Undying"), h("p", { class: "sub" }, "Click a glowing fountain on the map to rise there, fully healed."));
  if (panel) {
    const key = `${g.turn}|${g.current}|${g.combat ? "fight" : g.phase}|${panel.className}`;
    if (box.firstElementChild?.dataset.key === key) panel.classList.add("steady");
    panel.dataset.key = key;
  }
  box.replaceChildren(...(panel ? [panel] : []));
}

function placePanel(st) {
  const g = st.game;
  const turns = g.pending.rotations.length > 1;
  const swatch = (color, text) => h("span", {}, h("i", { style: { background: color } }), text);
  return h(
    "div",
    { class: "float-panel small place-panel" },
    h("h3", {}, "Lay the new tile"),
    h("p", { class: "sub" }, turns ? "Click the tile (or use ← →) to turn it, then place it." : "It only fits one way."),
    h("div", { class: "place-legend" }, swatch("#7be06a", "joins a passage"), swatch("#ffd85a", "leads into the unknown"), swatch("#ff6a4d", "hits a wall")),
    h(
      "div",
      { class: "actions" },
      turns ? h("button", { class: "btn", title: "←", onclick: () => onBoardAct({ type: "_rotate", by: -1 }) }, "⟲ Turn left") : null,
      turns ? h("button", { class: "btn", title: "→", onclick: () => onBoardAct({ type: "_rotate", by: 1 }) }, "Turn right ⟳") : null,
      h("button", { class: "btn primary", title: "Enter", onclick: () => act({ type: "place", rotation: S.board.ghostRotation(g) }) }, "✓ Place here"),
    ),
  );
}

function heroSkill(g, seat, hero) {
  return g.players[seat].skills.includes(hero) && g.cursed !== seat;
}

const STRIKE_TEXT = { win: "⚔️ Strike: victory!", tie: "🛡 Strike: a stand-off", loss: "💥 Strike: you'll be hurt" };
const DUEL_TEXT = { win: "⚔️ Strike: you win the duel!", tie: "🛡 Strike: a draw", loss: "💥 Strike: you lose the duel", roll: "⚔️ Lock in this total" };

// Everything in the fight that depends on the spells / blood price the player is toggling.
function combatMath(st, mine) {
  const g = st.game;
  const c = g.combat;
  const duel = c.versus != null;
  const m = duel ? null : S.monsters[c.monster];
  const seat = g.actor ?? g.current;
  const p = g.players[seat];
  const wizard = heroSkill(g, seat, "wizard");
  const ownedBolts = p.spells.filter((x) => x === "bolt").length;
  const ownedFists = p.spells.filter((x) => x === "frost").length;
  const arcane = wizard ? ownedBolts + 2 * ownedFists : 0;
  const bolts = wizard ? 0 : ownedBolts;
  const fists = wizard ? 0 : ownedFists;
  const sacrificeOk = mine && (g.legal || []).some((a) => a.type === "strike" && a.sacrifice);
  const useBolts = Math.min(S.ui.bolts, bolts);
  const useFists = Math.min(S.ui.fists, fists);
  const sac = sacrificeOk && S.ui.sacrifice;
  const diceSum = c.dice.reduce((a, b) => a + b, 0);
  const total = diceSum + g.bonus + useBolts + 2 * useFists + (sac ? 1 : 0);
  const ties = heroSkill(g, seat, "thief") && (!duel || !c.thief0);
  const strength = duel ? (c.stage === 1 ? c.target : null) : m.strength;
  let outcome = "roll";
  if (strength != null) outcome = total > strength || (ties && total === strength) ? "win" : total === strength ? "tie" : "loss";
  return { g, c, m, duel, p, seat, arcane, bolts, fists, sacrificeOk, useBolts, useFists, sac, diceSum, total, outcome, strength };
}

function totalLine(k) {
  const { g, p, arcane, useBolts, useFists, sac, diceSum, total, outcome, strength } = k;
  const parts = [];
  if (p.power) parts.push(h("span", { class: "bonus", title: "Weapons" }, p.weapons.map((w) => itemIcon(w, 18)), ` +${p.power}`));
  if (arcane) parts.push(h("span", { class: "bonus", title: "Arcane focus: the wizard's bolts and frost fists always count" }, itemIcon("bolt", 18), ` +${arcane}`));
  const extra = g.bonus - p.power - arcane;
  if (extra > 0) parts.push(h("span", { class: "bonus", title: "Foresight / berserk" }, "✨ +", extra));
  if (useBolts) parts.push(h("span", { class: "bonus" }, itemIcon("bolt", 18), ` +${useBolts}`));
  if (useFists) parts.push(h("span", { class: "bonus" }, itemIcon("frost", 18), ` +${2 * useFists}`));
  if (sac) parts.push(h("span", { class: "bonus" }, "🩸 +1"));
  return h("div", { class: `total ${outcome}` }, h("b", {}, diceSum), parts, h("span", { class: "eq" }, "="), h("b", { class: "sum" }, total), strength != null ? [h("span", { class: "vs" }, "vs"), h("b", {}, strength)] : null);
}

// Toggling spells or the blood price only touches the sum, the spell buttons and the strike button.
function updateCombat(st) {
  const el = $("#panel .combat-panel");
  if (!el) return renderPanel(st);
  const k = combatMath(st, true);
  el.querySelector(".total")?.replaceWith(totalLine(k));
  el.querySelectorAll(".bolt-btn").forEach((b, i) => b.classList.toggle("on", i < k.useBolts));
  el.querySelectorAll(".fist-btn").forEach((b, i) => b.classList.toggle("on", i < k.useFists));
  const strike = el.querySelector(".btn.strike");
  if (strike) {
    strike.className = `btn big strike ${k.outcome}`;
    strike.textContent = (k.duel ? DUEL_TEXT : STRIKE_TEXT)[k.outcome];
  }
}

function spellPicker(st, label, item, count, used, key, title) {
  return h(
    "div",
    { class: "bolt-picker" },
    h("span", { class: "label" }, label),
    Array.from({ length: count }, (_, i) =>
      h(
        "button",
        {
          class: `bolt-btn ${key === "fists" ? "fist-btn" : ""} ${i < used ? "on" : ""}`,
          title,
          onclick: () => {
            S.ui[key] = i < Math.min(S.ui[key], count) ? i : i + 1;
            updateCombat(st);
          },
        },
        itemIcon(item, 30),
      ),
    ),
  );
}

function combatPanel(st, mine) {
  const k = combatMath(st, mine);
  const { g, c, m, duel, p, seat, bolts, fists, sacrificeOk, useBolts, useFists, outcome } = k;
  const color = st.seats[seat].color;
  const rolled = c.dice.length > 0;
  const dice = rolled ? c.dice.map((v, i) => die(v, S.ui.rolling ? `rolling r${i}` : "")) : [die(0, "blank"), die(0, "blank")];
  const controls = [];
  if (mine && g.phase === "combat") {
    controls.push(h("button", { class: "btn primary big", onclick: () => act({ type: "roll" }), title: "Space" }, "🎲 Roll the dice"));
    if (has(g, "sneak")) controls.push(h("button", { class: "btn", onclick: () => act({ type: "sneak" }) }, "🥷 Slip past"));
  } else if (mine && g.phase === "rolled") {
    if (bolts) controls.push(spellPicker(st, "Magic bolts:", "bolt", bolts, useBolts, "bolts", "+1 each"));
    if (fists) controls.push(spellPicker(st, "Frost fists:", "frost", fists, useFists, "fists", "+2 each"));
    if (sacrificeOk) {
      controls.push(
        h(
          "label",
          { class: "check" },
          h("input", {
            type: "checkbox",
            checked: S.ui.sacrifice,
            onchange: (e) => {
              S.ui.sacrifice = e.target.checked;
              updateCombat(st);
            },
          }),
          " 🩸 Blood price: give 1 HP for +1",
        ),
      );
    }
    const btnRow = [];
    if (has(g, "reroll")) btnRow.push(h("button", { class: "btn", onclick: () => act({ type: "reroll" }) }, "🎲 Second swing"));
    btnRow.push(
      h(
        "button",
        {
          class: `btn big strike ${outcome}`,
          title: "Space",
          onclick: () => {
            const now = combatMath(st, mine);
            act({ type: "strike", bolts: now.useBolts, fists: now.useFists, sacrifice: now.sac });
          },
        },
        (duel ? DUEL_TEXT : STRIKE_TEXT)[outcome],
      ),
    );
    controls.push(h("div", { class: "actions" }, btnRow));
  }
  const spellNote = (bolts ? ` (+ up to ${plural(bolts, "bolt")})` : "") + (fists ? ` (+ up to ${plural(fists, "frost fist")})` : "");
  const left = h("div", { class: "side-hero" }, heroPortrait(p.hero, color, 64), h("div", { class: "vs-name" }, seatName(st, seat)), hpRow(p, g.max_hp, 14));
  let right;
  let mid;
  if (duel) {
    const other = c.stage === 0 ? c.versus : g.current;
    const q = g.players[other];
    right = h("div", { class: "side-hero" }, heroPortrait(q.hero, st.seats[other].color, 64), h("div", { class: "vs-name" }, seatName(st, other)), hpRow(q, g.max_hp, 14));
    mid = h(
      "div",
      { class: "vs-mid" },
      h("div", { class: "loot-line" }, c.stage === 0 ? `⚔️ ${seatName(st, g.current)} challenges ${seatName(st, c.versus)}` : `${seatName(st, g.current)} totalled ${c.target}. ${seatName(st, seat)} must beat it`),
      h("div", { class: "dice-row" }, dice),
      rolled ? totalLine(k) : h("div", { class: "total" }, "You add ", h("b", {}, `+${g.bonus}`), spellNote),
    );
  } else {
    right = h("div", { class: "side-monster" }, token(c.monster, 72, m.strength), h("div", { class: "vs-name" }, m.name), h("div", { class: "loot-line" }, "drops ", itemIcon(m.loot, 18), S.items[m.loot].name));
    mid = h("div", { class: "vs-mid" }, h("div", { class: "dice-row" }, dice), rolled ? totalLine(k) : h("div", { class: "total" }, "Beat ", h("b", {}, m.strength), ", you add ", h("b", {}, `+${g.bonus}`), spellNote));
  }
  return h("div", { class: `float-panel combat-panel ${!duel && c.monster === "dragon" ? "dragon" : ""}` }, h("div", { class: "versus" }, left, mid, right), controls);
}

function dashPanel(st) {
  const type = S.ui.mode;
  return h(
    "div",
    { class: "float-panel small" },
    h("h3", {}, type === "sprint" ? "🤸 Sprint" : "⚡ Blitz attack"),
    h("p", { class: "sub" }, type === "sprint" ? "Run up to 8 tiles over discovered tiles. Arenas and cursed chambers stop you. This uses the whole turn." : "Teleport to any monster and fight it. This uses the whole turn."),
    h("div", { class: "actions" }, h("button", { class: "btn ghost", onclick: () => ((S.ui.mode = null), render()) }, "Cancel")),
  );
}

function challengePanel(st, mine) {
  const g = st.game;
  if (!mine) return h("div", { class: "float-panel small" }, h("h3", {}, "⚔️ Battle arena"), h("p", { class: "sub" }, `${seatName(st, g.current)} entered the arena and chooses a hero to challenge…`));
  return h(
    "div",
    { class: "float-panel curse-panel" },
    h("h3", {}, "⚔️ Battle arena"),
    h("p", { class: "sub" }, "Summon a hero to a duel. Highest total wins and takes one item; the loser loses a life."),
    h(
      "div",
      { class: "curse-list" },
      legalOf(g, "challenge").map((a) => {
        const p = g.players[a.seat];
        return h("button", { class: "curse-card", onclick: () => act(a) }, h("div", { class: "pop-row" }, heroPortrait(p.hero, st.seats[a.seat].color, 36), h("div", {}, h("b", {}, seatName(st, a.seat)), h("div", { class: "curse-skills" }, heroName(p.hero), `: ⚔+${p.power}`))), heroAssets(g, a.seat, 20));
      }),
    ),
  );
}

function stealPanel(st, mine) {
  const g = st.game;
  const [winner, loser] = g.spoils;
  if (!mine) return h("div", { class: "float-panel small" }, h("h3", {}, "🏅 Spoils"), h("p", { class: "sub" }, `${seatName(st, winner)} won the duel and chooses what to take from ${seatName(st, loser)}…`));
  const q = g.players[loser];
  const w = g.players[winner];
  const list = { weapon: q.weapons, spell: q.spells, key: q.keys, treasure: q.treasures };
  return h(
    "div",
    { class: "float-panel small" },
    h("h3", {}, "🏅 Spoils of the duel"),
    h("p", { class: "sub" }, `Take one thing from ${seatName(st, loser)}.`),
    h(
      "div",
      { class: "actions wrap" },
      legalOf(g, "steal").map((a) => {
        if (a.slot == null) return h("button", { class: "btn ghost", onclick: () => act(a) }, "Take nothing");
        const item = list[a.slot][a.index];
        const dest = a.slot === "treasure" ? null : carrySlot(g, winner, item);
        const dropped = a.drop != null && dest ? ownedIn(w, dest)[a.drop] : null;
        return h("button", { class: "btn primary", onclick: () => act(a) }, "Take ", itemIcon(item, 22), ` ${S.items[item].name}`, dropped ? [" and leave ", itemIcon(dropped, 22)] : null);
      }),
    ),
  );
}

function tokenPanel(st, mine) {
  const g = st.game;
  if (!mine || !g.offer.length) return h("div", { class: "float-panel small" }, h("h3", {}, "🔮 Foresight"), h("p", { class: "sub" }, `${seatName(st, g.current)} drew ${g.offer_size} tokens and keeps one.`));
  return h(
    "div",
    { class: "float-panel small" },
    h("h3", {}, "🔮 Fate's choice"),
    h("p", { class: "sub" }, "Place one of these in the room; the other goes back into the bag."),
    h(
      "div",
      { class: "offer" },
      g.offer.map((tok, i) => {
        const m = S.monsters[tok];
        return h("button", { class: "offer-btn", onclick: () => act({ type: "choose_token", index: i }) }, token(tok, 70, m ? m.strength : null), h("span", {}, m ? m.name : "Locked chest"));
      }),
    ),
  );
}

function lootPanel(st, mine) {
  const g = st.game;
  const item = g.loot_item;
  if (!mine) return h("div", { class: "float-panel small" }, h("h3", {}, "Loot"), h("p", { class: "sub" }, `${seatName(st, g.current)} found `, itemIcon(item, 22), ` ${S.items[item].name} and decides what to do with it.`));
  const p = g.players[g.current];
  const slotName = carrySlot(g, g.current, item);
  const owned = ownedIn(p, slotName);
  const optional = has(g, "take_loot");
  return h(
    "div",
    { class: "float-panel small" },
    h("h3", {}, optional ? "Perseverance" : "Your pack is full"),
    h("div", { class: "pop-row center" }, itemIcon(item, 54), h("div", {}, h("b", {}, S.items[item].name), S.items[item].power ? ` (+${S.items[item].power})` : "")),
    h("p", { class: "sub" }, optional ? "Take it and your turn ends, or leave it on the floor and fight on." : "Whatever you leave stays on this tile for anyone to pick up."),
    h(
      "div",
      { class: "actions wrap" },
      optional ? h("button", { class: "btn primary", onclick: () => act({ type: "take_loot" }) }, "Take the ", itemIcon(item, 22), ` ${S.items[item].name}`) : null,
      legalOf(g, "loot").map((a) =>
        a.drop == null
          ? h("button", { class: "btn", onclick: () => act(a) }, "Leave the ", itemIcon(item, 22), ` ${S.items[item].name}`)
          : h("button", { class: "btn primary", onclick: () => act(a) }, "Swap for ", itemIcon(owned[a.drop], 22), ` ${S.items[owned[a.drop]].name}`),
      ),
    ),
  );
}

function cursePanel(st, mine) {
  const g = st.game;
  if (!mine) return h("div", { class: "float-panel small" }, h("h3", {}, "☠ The Curse"), h("p", { class: "sub" }, `${seatName(st, g.current)} defeated a mummy and chooses who to curse…`));
  return h(
    "div",
    { class: "float-panel curse-panel" },
    h("h3", {}, art("misc-curse", 30), " Lay the Curse"),
    h("p", { class: "sub" }, "The cursed hero loses both skills until they heal at a fountain."),
    h(
      "div",
      { class: "curse-list" },
      legalOf(g, "curse")
        .filter((a) => a.seat != null)
        .map((a) => {
          const p = g.players[a.seat];
          return h(
            "button",
            { class: "curse-card", onclick: () => act(a) },
            h(
              "div",
              { class: "pop-row" },
              heroPortrait(p.hero, st.seats[a.seat].color, 36),
              h("div", {}, h("b", {}, seatName(st, a.seat)), h("div", { class: "curse-skills" }, heroName(p.hero), ": ", S.heroes[p.hero].skills.map((sk) => sk.name).join(", "))),
            ),
            heroAssets(g, a.seat, 20),
          );
        }),
    ),
    legalOf(g, "curse").some((a) => a.seat == null)
      ? h("div", { class: "actions" }, h("button", { class: "btn ghost", onclick: () => act({ type: "curse", seat: null }) }, `Leave it on ${seatName(st, g.cursed)}`))
      : null,
  );
}

// ------------------------------------------------------------------ popovers
let popoverEl = null;

function closePopover() {
  popoverEl?.remove();
  popoverEl = null;
}

function openPopover(x, y, content) {
  closePopover();
  popoverEl = h("div", { class: "popover" }, h("button", { class: "icon-btn close", onclick: closePopover, title: "Close" }, "✕"), content);
  document.body.append(popoverEl);
  const r = popoverEl.getBoundingClientRect();
  const left = Math.min(innerWidth - r.width - 8, Math.max(8, x - r.width / 2));
  const top = y - r.height - 16 > 60 ? y - r.height - 16 : Math.min(innerHeight - r.height - 8, y + 18);
  popoverEl.style.left = `${left}px`;
  popoverEl.style.top = `${top}px`;
}

document.addEventListener("pointerdown", (e) => {
  if (popoverEl && !e.target.closest(".popover") && !e.target.closest(".btn") && !e.target.closest(".hud-btn")) closePopover();
});

function showHint(action) {
  const st = S.state;
  S.ui.hint = action;
  const g = st.game;
  const text =
    {
      move: () => `Walk ${DIR_NAMES[action.dir]}`,
      explore: () => `Explore to the ${DIR_NAMES[action.dir]}`,
      place: () => "Place the tile like this",
      teleport: () => "Step through the gate",
      swap: () => `Swap places with ${seatName(st, action.seat)}`,
      choose_token: () => `Keep the ${S.monsters[g.offer[action.index]]?.name || "chest"}`,
      roll: () => "Roll the dice",
      reroll: () => "Swing again",
      strike: () => (action.bolts ? `Strike with ${plural(action.bolts, "bolt")}` : action.fists ? `Strike with ${plural(action.fists, "frost fist")}` : "Strike") + (action.sacrifice ? " and pay the blood price" : ""),
      sneak: () => "Slip past it",
      loot: () => (action.drop == null ? "Leave the new item" : "Swap it in"),
      curse: () => (action.seat == null ? "Leave the Curse where it is" : `Curse ${seatName(st, action.seat)}`),
      reincarnate: () => "Rise at that fountain",
      pickup: () => "Pick it up",
      open_chest: () => "Open the chest",
      cast_healing: () => `Cast the portal of healing on ${seatName(st, action.seat)}`,
      end_turn: () => "End your turn",
      eavesdrop: () => `Eavesdrop to the ${DIR_NAMES[action.dir]}`,
      sprint: () => "Sprint there",
      blitz: () => "Blitz that monster",
      retreat: () => `Fall back ${DIR_NAMES[action.dir]}`,
      challenge: () => `Challenge ${seatName(st, action.seat)}`,
      steal: () => (action.slot ? "Take that" : "Take nothing"),
      thorn: () => `Thorn ${seatName(st, action.seat)}`,
      take_loot: () => "Take the loot",
    }[action.type]?.() || action.type;
  if (action.type === "strike") {
    S.ui.bolts = action.bolts;
    S.ui.fists = action.fists || 0;
    S.ui.sacrifice = action.sacrifice;
  }
  if (action.type === "place" && g.pending) {
    const i = g.pending.rotations.indexOf(action.rotation);
    if (i >= 0) S.board.ghostRot = i;
  }
  toast(`💡 ${text}`);
  render();
}

// ------------------------------------------------------------------ game over overlay
function renderOverlay() {
  const st = S.state;
  if (!st || !st.game || st.status !== "game_over" || performance.now() < S.ui.summaryAt) {
    overlay.replaceChildren();
    return;
  }
  if (S.ui.summaryHidden) {
    overlay.replaceChildren(h("div", { class: "mini-bar" }, "🏁 Game over", h("button", { class: "btn small primary", onclick: () => ((S.ui.summaryHidden = false), renderOverlay()) }, "Show treasure")));
    return;
  }
  const res = st.game.result;
  const me = st.you.seat;
  const isHost = st.host === S.me;
  const winners = res.winners.map((w) => st.seats[w].name);
  let title = winners.length > 1 ? `🤝 ${winners.join(" & ")} share the spoils!` : `🏆 ${winners[0]} is the richest hero!`;
  if (me != null && res.winners.includes(me)) title = winners.length > 1 ? "🤝 You share the spoils!" : "🏆 You are the richest hero!";
  const slayer = res.dragon_slain_by;
  overlay.replaceChildren(
    h(
      "div",
      { class: "backdrop" },
      h(
        "div",
        { class: "modal wide parchment" },
        h("div", { class: "result-head" }, slayer != null ? token("dragon", 80, 15) : null, h("div", {}, h("h2", {}, title), slayer != null ? h("p", { class: "sub" }, `${seatName(st, slayer)} slew the Dragon and claimed its ruby.`) : h("p", { class: "sub" }, "The torches burned out before the Dragon fell."))),
        scoreTable(st),
        h(
          "div",
          { class: "actions" },
          h("button", { class: "btn ghost", onclick: () => ((S.ui.summaryHidden = true), renderOverlay()) }, "👀 Look at the labyrinth"),
          isHost ? h("button", { class: "btn", onclick: () => send({ type: "to_lobby" }) }, "Back to lobby") : null,
          isHost ? h("button", { class: "btn primary", onclick: () => send({ type: "play_again" }) }, "Play again ↻") : h("span", { class: "grow", style: { textAlign: "right" } }, "Waiting for the host to start a rematch…"),
        ),
      ),
    ),
  );
}

function confetti() {
  const layer = h("div", { class: "confetti" });
  const colors = ["#f2c230", "#e2553f", "#ffd447", "#3fc3ff", "#e2233b", "#fff3b0"];
  for (let i = 0; i < 90; i++) {
    layer.append(h("i", { style: { left: `${Math.random() * 100}%`, background: pick(colors), animationDuration: `${2.2 + Math.random() * 2}s`, animationDelay: `${Math.random() * 0.8}s`, transform: `rotate(${Math.random() * 360}deg)` } }));
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 5200);
}

function showReaction(msg) {
  const st = S.state;
  const name = st?.seats.find((s) => s.member === msg.member)?.name || st?.spectators.find((s) => s.member === msg.member)?.name || "";
  let rect = msg.seat != null ? $(`.pl-row[data-seat="${msg.seat}"]`)?.getBoundingClientRect() : null;
  if (!rect) rect = $("#main")?.getBoundingClientRect();
  if (!rect) return;
  const bubble = h("div", { class: "bubble", style: { left: `${rect.left + rect.width / 2 + (Math.random() - 0.5) * 40}px`, top: `${rect.top + 10}px` } }, msg.emoji, h("small", {}, name));
  document.body.append(bubble);
  setTimeout(() => bubble.remove(), 2300);
}

// ------------------------------------------------------------------ timer + keyboard
function tickTimer() {
  const bar = $("#timer");
  if (bar) {
    const st = S.state;
    if (S.timer.endAt && st?.status === "playing") {
      const left = Math.max(0, S.timer.endAt - performance.now());
      const frac = S.timer.total ? left / (S.timer.total * 1000) : 0;
      bar.style.width = `${(frac * 100).toFixed(2)}%`;
      bar.classList.toggle("low", left < 8000);
      if (left > 0 && left < 5000 && myTurn(st)) {
        const sec = Math.ceil(left / 1000);
        if (sec !== S.timer.lastTick) {
          S.timer.lastTick = sec;
          sfx.tick();
        }
      }
    } else bar.style.width = "0";
  }
  requestAnimationFrame(tickTimer);
}
requestAnimationFrame(tickTimer);

document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
  const st = S.state;
  if (e.key === "Escape") closePopover();
  if (!st?.game || st.status === "lobby") return;
  if (e.key === "Escape" && S.ui.healing != null) castHealingDialog(st);
  if (e.key === "0") S.board?.resetView();
  if (e.key === "+" || e.key === "=") S.board?.zoomAt(1.25);
  if (e.key === "-") S.board?.zoomAt(1 / 1.25);
  if (!myTurn(st)) return;
  const g = st.game;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === "h" && st.settings.hints) return send({ type: "hint" });
  if (k in DIR_KEYS && g.phase === "turn") {
    e.preventDefault();
    const dir = DIR_KEYS[k];
    const a = g.legal.find((x) => (x.type === "move" || x.type === "explore") && x.dir === dir);
    if (a) act(a);
    return;
  }
  if (g.phase === "place") {
    if (k === "ArrowLeft" || k === "a" || k === "q") onBoardAct({ type: "_rotate", by: -1 });
    else if (k === "ArrowRight" || k === "d" || k === "r") onBoardAct({ type: "_rotate", by: 1 });
    else if (k === "Enter" || k === " ") act({ type: "place", rotation: S.board.ghostRotation(g) });
    e.preventDefault();
    return;
  }
  if (k === " " || k === "Enter") {
    e.preventDefault();
    if (g.phase === "combat") act({ type: "roll" });
    else if (g.phase === "rolled") $(".combat-panel .strike")?.click();
    return;
  }
  if (k === "e" && g.phase === "turn" && has(g, "end_turn")) act({ type: "end_turn" });
});

for (const ev of ["pointerdown", "keydown"]) window.addEventListener(ev, unlockAudio, { capture: true });

// ------------------------------------------------------------------ boot
async function boot() {
  installArt();
  const config = await fetch("/api/config").then((r) => r.json());
  S.config = config;
  S.heroes = Object.fromEntries(config.heroes.map((x) => [x.key, x]));
  S.monsters = Object.fromEntries(config.monsters.map((x) => [x.key, x]));
  S.items = Object.fromEntries(config.items.map((x) => [x.key, x]));
  router();
}
boot().catch((e) => {
  console.error(e);
  app.replaceChildren(h("div", { class: "center-msg" }, h("p", {}, "Could not load the game. Is the server running?")));
});