"""A multiplayer table: members, seats (humans or bots), lobby settings and the game.

All mutations are synchronous and run on the event loop thread. Every change is pushed to each listener as
a full per-viewer snapshot (`Room.state_for`) tagged with the events that caused it, so clients can animate
them. Karak has almost no hidden information: only the oracle's second token is private until the game ends.
"""

from __future__ import annotations

import asyncio
import dataclasses
import logging
import random
import secrets
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

from karak.bots import REGISTRY, Bot, PlannerBot
from karak.game import actions
from karak.game.actions import Action
from karak.game.engine import Event, Game, IllegalMove, Phase
from karak.game.model import DIR_NAMES, HEROES, ITEMS, MONSTERS, Hero, Kind

log = logging.getLogger(__name__)

MAX_SEATS = 5
MIN_SEATS = 1
MAX_NAME = 20
MAX_CHAT = 240
CHAT_INTERVAL = 0.4
HOST_GRACE = 20.0
REACTIONS = ("👍", "😂", "😱", "😡", "🎉", "🤔", "😭", "🔥", "👏", "💀")
BOT_SPEEDS = {"slow": 1.8, "normal": 1.0, "fast": 0.4}
TURN_TIMERS = (0, 30, 60, 90, 180)
HERO_COLORS = {
    Hero.WARRIOR: "red",
    Hero.THIEF: "green",
    Hero.WIZARD: "blue",
    Hero.WARLOCK: "purple",
    Hero.SWORDSMAN: "gold",
    Hero.ORACLE: "teal",
}

Plan = tuple[float, Callable[[], None]]


class RoomError(Exception):
    """A rejected request; the message is shown to the user."""


class Listener(Protocol):
    member_id: str

    def send(self, message: dict[str, Any]) -> None: ...


@dataclass
class Settings:
    turn_timer: int = 0  # seconds per human turn, 0 = off
    bot_speed: str = "normal"
    hints: bool = False

    def update(self, changes: dict[str, Any]) -> None:
        for key, value in changes.items():
            if key == "turn_timer" and value in TURN_TIMERS:
                self.turn_timer = int(value)
            elif key == "bot_speed" and value in BOT_SPEEDS:
                self.bot_speed = str(value)
            elif key == "hints" and isinstance(value, bool):
                self.hints = value
            else:
                raise RoomError(f"invalid setting {key}={value!r}")


@dataclass
class Member:
    id: str
    token: str
    name: str
    connections: int = 0
    disconnected_at: float | None = None
    last_chat: float = 0.0


@dataclass
class Seat:
    name: str
    member_id: str | None = None  # None: a bot
    bot: str | None = None  # REGISTRY key
    hero: Hero | None = None  # None: random at the start
    agent: Bot | None = None
    autoplay: bool = False  # a human seat temporarily played by the autopilot

    @property
    def is_bot(self) -> bool:
        return self.member_id is None


def clean_text(text: object, limit: int) -> str:
    if not isinstance(text, str):
        return ""
    return " ".join(text.split())[:limit]


def bots_public() -> list[dict[str, Any]]:
    return [{"key": b.key, "label": b.label, "stars": b.stars, "description": b.description} for b in REGISTRY.values()]


def heroes_public() -> list[dict[str, Any]]:
    return [
        {
            "key": h.key.value,
            "name": h.name,
            "color": HERO_COLORS[h.key],
            "skills": [{"name": n, "text": t} for n, t in h.skills],
        }
        for h in HEROES.values()
    ]


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def _points(half: int) -> str:
    return f"{half // 2}½" if half % 2 else str(half // 2)


class Room:
    def __init__(self, room_id: str, delay_scale: float = 1.0, seed: int | None = None) -> None:
        self.id = room_id
        self.delay_scale = delay_scale
        self.rng = random.Random(seed)
        self.members: dict[str, Member] = {}
        self.seats: list[Seat] = []
        self.host_id: str | None = None
        self.settings = Settings()
        self.status = "lobby"  # lobby | playing | game_over
        self.game: Game | None = None
        self.game_no = 0
        self.log: deque[dict[str, Any]] = deque(maxlen=400)
        self.listeners: set[Listener] = set()
        self.seq = 0
        self.last_activity = time.monotonic()
        self.closed = False
        self._autopilot = PlannerBot(seed=self.rng.randrange(2**31))
        self._wake = asyncio.Event()
        self._due: tuple[tuple[Any, ...], float] | None = None
        self._deadline: tuple[tuple[Any, ...], float] | None = None
        self._step = 0  # counts game steps so bot delays restart after each one

    # ------------------------------------------------------------------ members
    def join(self, token: str, name: object, origin: str = "") -> Member:
        name = clean_text(name, MAX_NAME)
        member = next((m for m in self.members.values() if m.token == token), None)
        if member is None:
            member = Member(id=secrets.token_hex(4), token=token, name=name or f"Player {len(self.members) + 1}")
            self.members[member.id] = member
            where = f" from {origin}" if origin else ""
            if self.host_id is None:
                self.host_id = member.id
                log.info("table %s opened by %s%s", self.id, member.name, where)
            else:
                log.info("table %s: %s joined%s", self.id, member.name, where)
            self._say(f"{member.name} joined the table")
            if self.status == "lobby" and len(self.seats) < MAX_SEATS:
                self.seats.append(Seat(name=member.name, member_id=member.id))
        elif name and name != member.name:
            self._rename(member, name)
        return member

    def connect(self, listener: Listener) -> None:
        member = self.members[listener.member_id]
        if member.connections == 0 and member.disconnected_at is not None:
            log.info("table %s: %s is back", self.id, member.name)
        member.connections += 1
        member.disconnected_at = None
        self.listeners.add(listener)
        self.last_activity = time.monotonic()
        seat = self.seat_of(member.id)
        if seat is not None and self.seats[seat].autoplay:
            self.seats[seat].autoplay = False
            self._say(f"{member.name} is back and takes over from the autopilot")
        listener.send(
            {
                "type": "welcome",
                "you": member.id,
                "log": list(self.log),
                "bots": bots_public(),
                "heroes": heroes_public(),
            }
        )
        self._emit({"kind": "presence"})

    def disconnect(self, listener: Listener) -> None:
        self.listeners.discard(listener)
        member = self.members.get(listener.member_id)
        if member is None:
            return
        member.connections = max(0, member.connections - 1)
        if member.connections == 0:
            member.disconnected_at = time.monotonic()
            log.info("table %s: %s left", self.id, member.name)
        self.last_activity = time.monotonic()
        self._emit({"kind": "presence"})

    def check_host(self) -> None:
        """Hand the host role to a connected member once the host has been gone a while."""
        host = self.members.get(self.host_id or "")
        if host is not None and host.connections:
            return
        if host is not None and host.disconnected_at and time.monotonic() - host.disconnected_at < HOST_GRACE:
            return
        online = [m for m in self.members.values() if m.connections]
        if not online:
            return
        seated = [m for m in online if self.seat_of(m.id) is not None]
        new = (seated or online)[0]
        self.host_id = new.id
        log.info("table %s: %s is now the host", self.id, new.name)
        self._say(f"{new.name} is now the host")
        self._emit({"kind": "presence"})

    def seat_of(self, member_id: str) -> int | None:
        for i, seat in enumerate(self.seats):
            if seat.member_id == member_id:
                return i
        return None

    def _lineup(self) -> str:
        return ", ".join(f"{s.name} (bot)" if s.is_bot else s.name for s in self.seats) or "nobody seated"

    def describe(self) -> str:
        """One line for the server console: who is at this table and what it's doing."""
        host = self.members.get(self.host_id or "")
        online = sum(1 for m in self.members.values() if m.connections)
        parts = [self.id, self.status.replace("_", " "), f"host {host.name if host else '-'}", self._lineup()]
        parts.append(f"{online} online")
        return " · ".join(parts)

    @property
    def idle_for(self) -> float:
        return 0.0 if self.listeners else time.monotonic() - self.last_activity

    # ------------------------------------------------------------------ requests
    def handle(self, member_id: str, msg: dict[str, Any]) -> dict[str, Any] | None:
        member = self.members[member_id]
        kind = msg.get("type")
        self.last_activity = time.monotonic()
        host_only = {"add_bot", "remove_seat", "settings", "start", "play_again", "to_lobby", "autoplay", "shuffle"}
        if kind in host_only and member_id != self.host_id:
            raise RoomError("Only the host can do that")
        match kind:
            case "rename":
                name = clean_text(msg.get("name"), MAX_NAME)
                if name:
                    self._rename(member, name)
                    self._emit({"kind": "presence"})
            case "chat":
                self._chat(member, msg.get("text"))
            case "react":
                self._react(member, msg.get("emoji"))
            case "sit":
                self._sit(member)
            case "stand":
                self._stand(member)
            case "pick_hero":
                self._pick_hero(member, msg.get("seat"), msg.get("hero"))
            case "add_bot":
                self._add_bot(str(msg.get("bot")))
            case "remove_seat":
                self._remove_seat(msg.get("seat"))
            case "shuffle":
                self._require_lobby()
                self.rng.shuffle(self.seats)
                self._emit({"kind": "lobby"})
            case "settings":
                self._require_lobby()
                changes = msg.get("changes")
                if not isinstance(changes, dict):
                    raise RoomError("invalid settings")
                self.settings.update(changes)
                self._emit({"kind": "lobby"})
            case "start" | "play_again":
                self.start()
            case "to_lobby":
                self._to_lobby()
            case "action":
                self._human_action(member, msg.get("action"))
            case "autoplay":
                self._set_autoplay(msg.get("seat"), bool(msg.get("on")))
            case "hint":
                return self._hint(member)
            case _:
                raise RoomError(f"unknown request {kind!r}")
        return None

    def _rename(self, member: Member, name: str) -> None:
        log.info("table %s: %s is now called %s", self.id, member.name, name)
        self._say(f"{member.name} is now called {name}")
        member.name = name
        seat = self.seat_of(member.id)
        if seat is not None:
            self.seats[seat].name = name

    def _chat(self, member: Member, text: object) -> None:
        text = clean_text(text, MAX_CHAT)
        if not text:
            return
        now = time.monotonic()
        if now - member.last_chat < CHAT_INTERVAL:
            raise RoomError("Slow down a little")
        member.last_chat = now
        self._append_log({"kind": "chat", "member": member.id, "name": member.name, "text": text})

    def _react(self, member: Member, emoji: object) -> None:
        if emoji not in REACTIONS:
            raise RoomError("unknown reaction")
        message = {"type": "react", "member": member.id, "seat": self.seat_of(member.id), "emoji": emoji}
        for listener in list(self.listeners):
            listener.send(message)

    def _require_lobby(self) -> None:
        if self.status != "lobby":
            raise RoomError("Only possible in the lobby")

    def _sit(self, member: Member) -> None:
        self._require_lobby()
        if self.seat_of(member.id) is not None:
            return
        if len(self.seats) >= MAX_SEATS:
            raise RoomError("The table is full")
        self.seats.append(Seat(name=member.name, member_id=member.id))
        self._emit({"kind": "lobby"})

    def _stand(self, member: Member) -> None:
        self._require_lobby()
        seat = self.seat_of(member.id)
        if seat is not None:
            del self.seats[seat]
            self._emit({"kind": "lobby"})

    def _pick_hero(self, member: Member, seat: object, hero: object) -> None:
        self._require_lobby()
        mine = self.seat_of(member.id)
        if seat is None:
            seat = mine
        if not isinstance(seat, int) or not 0 <= seat < len(self.seats):
            raise RoomError("No such seat")
        target = self.seats[seat]
        if seat != mine and not (target.is_bot and member.id == self.host_id):
            raise RoomError("You can only pick your own hero")
        if hero is None:
            target.hero = None
        else:
            try:
                choice = Hero(hero)
            except ValueError:
                raise RoomError("Unknown hero") from None
            taken = next((s for s in self.seats if s.hero == choice and s is not target), None)
            if taken is not None:
                raise RoomError(f"{taken.name} already plays the {HEROES[choice].name}")
            target.hero = choice
        self._emit({"kind": "lobby"})

    def _add_bot(self, key: str) -> None:
        self._require_lobby()
        bot = REGISTRY.get(key)
        if bot is None:
            raise RoomError("Unknown bot")
        if len(self.seats) >= MAX_SEATS:
            raise RoomError("The table is full")
        names = {s.name for s in self.seats}
        name, n = bot.label, 1
        while name in names:
            n += 1
            name = f"{bot.label} {n}"
        self.seats.append(Seat(name=name, bot=key))
        self._emit({"kind": "lobby"})

    def _remove_seat(self, seat: object) -> None:
        self._require_lobby()
        if not isinstance(seat, int) or not 0 <= seat < len(self.seats):
            raise RoomError("No such seat")
        del self.seats[seat]
        self._emit({"kind": "lobby"})

    def _set_autoplay(self, seat: object, on: bool) -> None:
        if self.status != "playing" or not isinstance(seat, int) or not 0 <= seat < len(self.seats):
            raise RoomError("No such seat")
        target = self.seats[seat]
        if target.is_bot:
            raise RoomError("That seat is already a bot")
        member = self.members[target.member_id or ""]
        if on and member.connections:
            raise RoomError(f"{target.name} is still connected")
        target.autoplay = on
        self._say(f"The autopilot plays for {target.name}" if on else f"{target.name} plays again")
        self._emit({"kind": "presence"})

    # ------------------------------------------------------------------ game flow
    def start(self) -> None:
        if self.status == "playing":
            raise RoomError("A game is already running")
        n = len(self.seats)
        if n < MIN_SEATS:
            raise RoomError("Take a seat or add a bot first")
        free = [h for h in Hero if h not in {s.hero for s in self.seats}]
        self.rng.shuffle(free)
        heroes = [s.hero or free.pop() for s in self.seats]
        for seat in self.seats:
            seat.agent = REGISTRY[seat.bot].make(self.rng.randrange(2**31)) if seat.bot else None
            seat.autoplay = False
        self.game = Game(heroes, seed=self.rng.randrange(2**63))
        self.game_no += 1
        self.status = "playing"
        log.info("table %s: game %d started with %s", self.id, self.game_no, self._lineup())
        lineup = ", ".join(f"{s.name} the {HEROES[h].name}" for s, h in zip(self.seats, heroes, strict=True))
        self._say(f"Game {self.game_no}: {lineup} descend into the labyrinth.")
        first = self.game.current
        self._say(f"🎲 {self.seats[first].name} rolled highest and goes first.", first)
        self._emit({"kind": "game_start"})

    def _to_lobby(self) -> None:
        if self.status == "lobby":
            return
        self.status = "lobby"
        self.game = None
        for seat in self.seats:
            seat.agent = None
            seat.autoplay = False
        for member in self.members.values():
            if member.connections and self.seat_of(member.id) is None and len(self.seats) < MAX_SEATS:
                self.seats.append(Seat(name=member.name, member_id=member.id))
        self._say("Back to the lobby")
        self._emit({"kind": "lobby"})

    def _game(self) -> Game:
        if self.game is None or self.status != "playing":
            raise RoomError("No game in progress")
        return self.game

    def _is_auto(self, seat: int) -> bool:
        s = self.seats[seat]
        return s.is_bot or s.autoplay

    def _agent(self, seat: int) -> Bot:
        return self.seats[seat].agent or self._autopilot

    def _human_action(self, member: Member, data: object) -> None:
        seat = self.seat_of(member.id)
        if seat is None:
            raise RoomError("You are watching this game")
        self._game()
        try:
            action = actions.from_json(data)
        except actions.BadAction as e:
            raise RoomError(str(e)) from None
        if self.seats[seat].autoplay:
            self.seats[seat].autoplay = False
        self._apply(seat, action)

    def _auto_move(self, seat: int) -> None:
        game = self._game()
        self._apply(seat, self._agent(seat).act(game.view(seat)))

    def _apply(self, seat: int, action: Action) -> None:
        game = self._game()
        try:
            events = game.step(seat, action)
        except IllegalMove as e:
            raise RoomError(str(e)) from None
        self._step += 1
        for ev in events:
            self._narrate(ev)
        if game.phase == Phase.GAME_OVER:
            self.status = "game_over"
            self._end_game()
        self._emit({"kind": "move", "seat": seat, "events": events})

    def _name(self, seat: int | None) -> str:
        return self.seats[seat].name if seat is not None and 0 <= seat < len(self.seats) else ""

    def _narrate(self, ev: Event) -> None:
        game = self.game
        assert game is not None
        seat = ev.get("seat")
        name = self._name(seat)
        match ev["kind"]:
            case "place":
                kind = ev["tile"]["kind"]
                if kind == Kind.FOUNTAIN:
                    self._say(f"⛲ {name} found a healing fountain", seat)
                elif kind == Kind.PORTAL:
                    self._say(f"🌀 {name} found a teleportation gate", seat)
            case "token" if ev["token"] == "chest":
                self._say(f"{name} found a locked [chest]", seat)
            case "token":
                m = MONSTERS[ev["token"]]
                self._say(f"{name} disturbed a [{m.key}] {m.name} (strength {m.strength})!", seat)
            case "dragon_awakens":
                self._say("🐉 The labyrinth is complete. The Dragon wakes in its deepest room!")
            case "choose_token":
                self._say(f"🔮 {name} foresaw two fates and chose one", seat)
            case "sneak":
                self._say(f"🥷 {name} slipped past the {MONSTERS[ev['monster']].name}", seat)
            case "roll" if ev["reroll"]:
                self._say(f"{name} swings again: 🎲 {ev['dice'][0]} + {ev['dice'][1]}", seat)
            case "strike":
                m = MONSTERS[ev["monster"]]
                extra = []
                if ev["bolts"]:
                    extra.append(f"{_plural(ev['bolts'], 'magic bolt')}")
                if ev["sacrifice"]:
                    extra.append("a blood price")
                using = f" with {' and '.join(extra)}" if extra else ""
                verdict = {"win": "defeated", "tie": "held off", "loss": "was beaten by"}[ev["outcome"]]
                self._say(
                    f"{'⚔️' if ev['outcome'] == 'win' else '🛡' if ev['outcome'] == 'tie' else '💥'} {name} {verdict} "
                    f"the {m.name}{using}: {ev['total']} vs {m.strength}",
                    seat,
                )
            case "loot":
                dropped = f", leaving the [{ev['dropped']}] behind" if ev.get("dropped") else ""
                self._say(f"{name} takes the [{ev['item']}] {ITEMS[ev['item']].name}{dropped}", seat)
            case "leave":
                self._say(f"{name} leaves the [{ev['item']}] {ITEMS[ev['item']].name} on the floor", seat)
            case "pickup":
                dropped = f" and leaves the [{ev['dropped']}]" if ev.get("dropped") else ""
                self._say(f"{name} picks up the [{ev['item']}] {ITEMS[ev['item']].name}{dropped}", seat)
            case "open_chest":
                self._say(f"🗝 {name} unlocked a chest: +1 [treasure]", seat)
            case "curse":
                self._say(f"☠️ {name} lays the Curse on {self._name(ev['target'])}", seat)
            case "curse_kept":
                self._say(f"☠️ The Curse stays on {self._name(ev['target'])}", seat)
            case "heal" if ev["lifted"]:
                self._say(f"⛲ {self._name(ev['seat'])} is healed and the Curse is lifted", ev["seat"])
            case "heal":
                self._say(f"⛲ {self._name(ev['seat'])} heals {_plural(ev['hp'], 'wound')}", ev["seat"])
            case "knocked_out":
                self._say(f"💫 {name} falls unconscious and misses the next turn", seat)
            case "recover":
                self._say(f"{name} comes round with 1 HP", seat)
            case "reincarnate":
                self._say(f"🔥 {name} refuses to die and rises again at a fountain", seat)
            case "relentless":
                self._say(f"🗡 Rolled a six! {name} presses on", seat)
            case "swap":
                self._say(f"🔄 {name} swaps places with {self._name(ev['other'])}", seat)
            case "cast_healing":
                target = "themself" if ev["target"] == seat else self._name(ev["target"])
                self._say(f"✨ {name} opens a portal of healing for {target}", seat)
            case "teleport":
                self._say(f"🌀 {name} steps through a gate", seat)

    def _end_game(self) -> None:
        game = self.game
        assert game is not None and game.result is not None
        res = game.result
        winners = " & ".join(self.seats[w].name for w in res.winners)
        scores = ", ".join(f"{s.name} {_points(r.points)}" for s, r in zip(self.seats, res.players, strict=True))
        log.info("table %s: game %d won by %s (%s)", self.id, self.game_no, winners, scores)
        if res.dragon_slain_by is not None:
            self._say(f"🐉 {self._name(res.dragon_slain_by)} slew the Dragon!", res.dragon_slain_by)
        self._say(f"🏆 {winners} won! Treasure: {scores}")

    # ------------------------------------------------------------------ hints
    def _hint(self, member: Member) -> dict[str, Any]:
        if not self.settings.hints:
            raise RoomError("Hints are turned off at this table")
        seat = self.seat_of(member.id)
        if seat is None:
            raise RoomError("You are watching this game")
        game = self._game()
        if game.current != seat:
            raise RoomError("It's not your turn")
        action = self._autopilot.act(game.view(seat))
        return {"type": "hint", "action": actions.to_json(action)}

    # ------------------------------------------------------------------ automation
    def _wait(self, key: tuple[Any, ...], delay: float) -> float:
        now = time.monotonic()
        if self._due is None or self._due[0] != key:
            self._due = (key, now + delay * self.delay_scale)
        return max(0.0, self._due[1] - now)

    def _bot_delay(self, base: float) -> float:
        return base * BOT_SPEEDS[self.settings.bot_speed]

    def plan(self) -> Plan | None:
        """The next automatic step as (seconds to wait, action), or None to wait for a human."""
        if self.status != "playing" or self.game is None:
            return None
        game = self.game
        if self._is_auto(game.current):
            base = {
                Phase.TURN: 0.75,
                Phase.PLACE: 0.7,
                Phase.COMBAT: 0.9,
                Phase.ROLLED: 1.5,
                Phase.LOOT: 0.9,
                Phase.CURSE: 1.0,
                Phase.CHOOSE_TOKEN: 1.0,
            }.get(game.phase, 0.8)
            if game.phase == Phase.TURN and game.used == 0:
                base = 1.1
            delay = self._wait(("move", self.game_no, self._step), self._bot_delay(base))
            return delay, lambda s=game.current: self._auto_move(s)
        if self._deadline is not None:
            return max(0.0, self._deadline[1] - time.monotonic()), self._timeout
        return None

    def _refresh_deadline(self) -> None:
        timer = self.settings.turn_timer
        key: tuple[Any, ...] | None = None
        game = self.game
        if timer and self.status == "playing" and game is not None and not self._is_auto(game.current):
            key = ("turn", self.game_no, game.turn)
        if key is None:
            self._deadline = None
        elif self._deadline is None or self._deadline[0] != key:
            self._deadline = (key, time.monotonic() + timer)

    def _timeout(self) -> None:
        game = self._game()
        seat = game.current
        self._say(f"⏱ {self.seats[seat].name} ran out of time; the autopilot finishes the turn")
        turn = game.turn
        while self.status == "playing" and game.current == seat and game.turn == turn:
            self._auto_move(seat)

    async def drive(self) -> None:
        """Run bot moves and timeouts until the room is closed."""
        while not self.closed:
            self._wake.clear()
            plan = self.plan()
            if plan is None:
                await self._wake.wait()
                continue
            delay, step = plan
            if delay > 0:
                try:
                    await asyncio.wait_for(self._wake.wait(), delay)
                    continue
                except TimeoutError:
                    pass
            try:
                step()
            except Exception:
                log.exception("room %s: automatic step failed", self.id)
                self._say("⚠️ A bot crashed; the game is back in the lobby")
                self._to_lobby()
            await asyncio.sleep(0)

    def close(self) -> None:
        self.closed = True
        self._wake.set()

    # ------------------------------------------------------------------ output
    def _append_log(self, entry: dict[str, Any]) -> None:
        entry["ts"] = time.time()
        self.log.append(entry)
        for listener in list(self.listeners):
            listener.send({"type": "log", "entry": entry})

    def _say(self, text: str, seat: int | None = None) -> None:
        self._append_log({"kind": "game", "text": text, "seat": seat})

    def _emit(self, event: dict[str, Any]) -> None:
        self._refresh_deadline()
        self.seq += 1
        event["seq"] = self.seq
        for listener in list(self.listeners):
            listener.send(self.state_for(listener.member_id, event))
        self._wake.set()

    def _color(self, i: int) -> str:
        if self.game is not None and i < len(self.game.players):
            return HERO_COLORS[self.game.players[i].hero]
        hero = self.seats[i].hero
        return HERO_COLORS[hero] if hero else "stone"

    def state_for(self, member_id: str, event: dict[str, Any] | None = None) -> dict[str, Any]:
        you = self.seat_of(member_id)
        seats = []
        for i, s in enumerate(self.seats):
            member = self.members.get(s.member_id or "")
            seats.append(
                {
                    "seat": i,
                    "name": s.name,
                    "member": s.member_id,
                    "bot": s.bot,
                    "hero": s.hero.value if s.hero else None,
                    "color": self._color(i),
                    "connected": True if member is None else member.connections > 0,
                    "autoplay": s.autoplay,
                }
            )
        seated = {s.member_id for s in self.seats}
        spectators = [
            {"member": m.id, "name": m.name, "connected": m.connections > 0}
            for m in self.members.values()
            if m.id not in seated
        ]
        if event is not None and event.get("kind") == "move":
            event = {**event, "events": [self._filter_event(e, you) for e in event["events"]]}
        return {
            "type": "state",
            "seq": self.seq,
            "event": event,
            "room": self.id,
            "status": self.status,
            "host": self.host_id,
            "you": {"member": member_id, "seat": you},
            "settings": dataclasses.asdict(self.settings),
            "seats": seats,
            "spectators": spectators,
            "game": self._game_state(you),
        }

    def _filter_event(self, ev: Event, you: int | None) -> Event:
        if self.status == "game_over" or ev.get("seat") == you:
            return ev
        if ev["kind"] == "offer":
            return {**ev, "tokens": None}
        if ev["kind"] == "choose_token":
            return {**ev, "returned": None}
        return ev

    def _game_state(self, you: int | None) -> dict[str, Any] | None:
        game = self.game
        if game is None:
            return None
        over = game.phase == Phase.GAME_OVER
        current = game.current if not over else None
        pending = None
        if game.pending is not None:
            p = game.pending
            pending = {"x": p.pos.x, "y": p.pos.y, "kind": p.kind.value, "mask": p.mask, "rotations": p.rotations}
        mine = you is not None and you == current and not self.seats[you].autoplay and self.status == "playing"
        state: dict[str, Any] = {
            "phase": game.phase.value,
            "current": current,
            "turn": game.turn,
            "round": game.turn // max(1, game.n) + 1,
            "moves_left": game.moves_left,
            "moves": game.rules.moves,
            "max_hp": game.rules.max_hp,
            "tiles": [t.to_json() for t in game.tiles.values()],
            "players": [p.to_json() for p in game.players],
            "cursed": game.cursed,
            "combat": game.combat.to_json() if game.combat else None,
            "bonus": game.combat_bonus(game.current) if game.combat else 0,
            "pending": pending,
            "offer": list(game.offer) if mine or over else [],
            "offer_size": len(game.offer),
            "loot_item": game.loot_item,
            "pile_left": len(game.pile),
            "bag_left": len(game.bag),
            "dragon_seen": "dragon" not in game.bag,
            "legal": [actions.to_json(a) for a in game.legal_actions(you)] if mine and you is not None else [],
            "result": self._result(game) if over else None,
            "time_left": None,
        }
        if self._deadline is not None:
            state["time_left"] = round(max(0.0, self._deadline[1] - time.monotonic()), 2)
            state["time_total"] = self.settings.turn_timer
        return state

    def _result(self, game: Game) -> dict[str, Any]:
        assert game.result is not None
        return {
            "winners": game.result.winners,
            "dragon_slain_by": game.result.dragon_slain_by,
            "players": [dataclasses.asdict(r) for r in game.result.players],
        }


__all__ = ["DIR_NAMES", "MAX_SEATS", "Room", "RoomError", "bots_public", "heroes_public"]
