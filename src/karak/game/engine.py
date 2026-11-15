"""The Karak state machine: `Game.step(seat, action) -> events`, `Game.legal_actions(seat)`, `Game.view(seat)`.

`legal_actions` is the single source of truth: `step` rejects anything it doesn't list, so an illegal action
never changes the state.
"""

from __future__ import annotations

import random
from collections import Counter
from dataclasses import dataclass, field, replace
from enum import StrEnum
from typing import Any

from karak.game import actions as A
from karak.game.actions import Action
from karak.game.model import (
    BASE_HEROES,
    CHEST,
    DIRS,
    HEALING,
    ITEMS,
    LORD_CHAMBERS,
    LORD_CHAMBERS_NEEDED,
    MONSTERS,
    REGENT_HEROES,
    SLOTS,
    Hero,
    Kind,
    Pos,
    Slot,
    Tile,
    bag,
    has_exit,
    opposite,
    rotate,
    step,
    tile_pile,
)

Event = dict[str, Any]
START = Pos(0, 0)


class IllegalMove(Exception):
    pass


class Phase(StrEnum):
    TURN = "turn"  # moving, or using the tile the hero stands on
    PLACE = "place"  # a tile was drawn: choose its rotation
    CHOOSE_TOKEN = "choose_token"  # oracle: keep one of two tokens
    COMBAT = "combat"  # facing a monster, dice not rolled yet
    ROLLED = "rolled"  # dice on the table: reroll / add bolts / strike
    LOOT = "loot"  # inventory full: what to leave on the floor
    CURSE = "curse"  # a mummy fell: who gets the curse
    REINCARNATE = "reincarnate"  # warrior fell: which fountain to wake up at
    RETREAT = "retreat"  # battle mage lost a blitz: which neighbouring tile to fall back to
    CHALLENGE = "challenge"  # arena: whom to summon for the duel
    STEAL = "steal"  # arena: the winner takes something from the loser
    GAME_OVER = "game_over"


@dataclass(frozen=True)
class RulesConfig:
    moves: int = 4
    max_hp: int = 5
    max_turns: int = 1500  # safety stop for bot games; the dragon ends real games long before
    expansion: bool = False  # Karak: Regent tiles, monsters, items and heroes
    lord: bool = False  # the Lord of Karak game version (needs the expansion)

    def __post_init__(self) -> None:
        if self.lord and not self.expansion:
            raise ValueError("The Lord of Karak needs the Regent expansion")


@dataclass
class Player:
    hero: Hero
    pos: Pos = START
    hp: int = 5
    weapons: list[str] = field(default_factory=list)
    spells: list[str] = field(default_factory=list)
    keys: list[str] = field(default_factory=list)
    treasures: list[str] = field(default_factory=list)
    knocked_out: bool = False
    came_from: Pos = START
    skills: frozenset[Hero] = frozenset()  # the Lord of Karak has several; everyone else just their hero's
    origin: Hero | None = None  # the hero picked at the lobby (the Lord of Karak was this hero before)

    def __post_init__(self) -> None:
        if not self.skills:
            self.skills = frozenset({self.hero})
        if self.origin is None:
            self.origin = self.hero

    def slot(self, slot: Slot) -> list[str]:
        return {Slot.WEAPON: self.weapons, Slot.SPELL: self.spells, Slot.KEY: self.keys}[slot]

    @property
    def power(self) -> int:
        return sum(ITEMS[w].power for w in self.weapons)

    @property
    def points(self) -> int:
        """Treasure in half points (a chest is 2, the dragon's ruby 3)."""
        return sum(ITEMS[t].points for t in self.treasures)

    def to_json(self) -> dict[str, Any]:
        return {
            "hero": self.hero.value,
            "origin": self.origin.value if self.origin else self.hero.value,
            "skills": sorted(h.value for h in self.skills),
            "x": self.pos.x,
            "y": self.pos.y,
            "hp": self.hp,
            "weapons": list(self.weapons),
            "spells": list(self.spells),
            "keys": list(self.keys),
            "treasures": list(self.treasures),
            "points": self.points,
            "power": self.power,
            "knocked_out": self.knocked_out,
        }


@dataclass
class Combat:
    monster: str
    at: Pos
    back: Pos  # where the hero retreats after a tie or a loss
    first_move: bool  # oracle's foresight
    can_sneak: bool
    dice: list[int] = field(default_factory=list)
    rerolled: bool = False
    blitz: bool = False  # battle mage: the fall-back tile is chosen
    versus: int | None = None  # arena duel: the summoned hero's seat (the monster is empty then)
    stage: int = 0  # duel: 0 the challenger rolls, 1 the summoned hero rolls
    target: int = 0  # duel: the challenger's total
    thief0: bool = False  # duel: the challenger wins ties
    relent: bool = False  # duel: the challenger rolled a six with the swordsman's skill

    def to_json(self) -> dict[str, Any]:
        return {
            "monster": self.monster,
            "x": self.at.x,
            "y": self.at.y,
            "back": list(self.back),
            "first_move": self.first_move,
            "can_sneak": self.can_sneak,
            "dice": list(self.dice),
            "rerolled": self.rerolled,
            "blitz": self.blitz,
            "versus": self.versus,
            "stage": self.stage,
            "target": self.target,
            "thief0": self.thief0,
        }


@dataclass
class PendingTile:
    pos: Pos
    kind: Kind
    mask: int
    rotations: list[int]
    enter: bool = True  # False: the ranger eavesdrops, the tile is laid but nobody steps onto it


@dataclass(frozen=True)
class PlayerResult:
    seat: int
    hero: str
    points: int  # half points
    treasures: int
    ruby: bool


@dataclass(frozen=True)
class Result:
    winners: list[int]
    players: list[PlayerResult]
    dragon_slain_by: int | None


@dataclass
class View:
    """Everything a player may know: the whole table except the order of the tile pile and the bag."""

    seat: int
    phase: Phase
    current: int
    moves_left: int
    turn: int
    tiles: dict[Pos, Tile]
    players: list[Player]
    cursed: int | None
    combat: Combat | None
    pending: PendingTile | None
    offer: list[str]
    loot_item: str | None
    bag: Counter[str]
    pile_left: int
    legal: list[Action]
    rules: RulesConfig
    actor: int = 0  # who has to act: the current hero, except in the second half of an arena duel and the spoils
    lord: int | None = None  # the seat possessed by the Lord of Karak
    spoils: tuple[int, int] | None = None  # arena: (winner, loser) while the winner chooses

    def skills(self, seat: int) -> frozenset[Hero]:
        return frozenset() if self.cursed == seat else self.players[seat].skills

    def has_skill(self, seat: int, hero: Hero) -> bool:
        return hero in self.skills(seat)

    def attack_power(self, seat: int) -> int:
        return weapon_power(self.players[seat], self.skills(seat))

    def slot_for(self, seat: int, item: str) -> Slot:
        return carry_slot(self.players[seat], self.skills(seat), item)

    def combat_bonus(self, seat: int) -> int:
        """Fixed bonus of the fight on the table (see `Game.combat_bonus`)."""
        assert self.combat is not None
        return _fixed_bonus(self.players[seat], self.skills(seat), self.combat.first_move)


def weapon_power(p: Player, skills: frozenset[Hero]) -> int:
    """Power of the weapons carried: the battle mage's swords are 3, the acrobat's thrown daggers add +1 each."""
    sword = 3 if Hero.BATTLEMAGE in skills else ITEMS["sword"].power
    total = sum(sword if w == "sword" else ITEMS[w].power for w in p.weapons)
    if Hero.ACROBAT in skills:
        total += p.spells.count("dagger")
    return total


def _fixed_bonus(p: Player, sk: frozenset[Hero], first_move: bool) -> int:
    foresight = 1 if Hero.ORACLE in sk and first_move else 0
    arcane = p.spells.count("bolt") + 2 * p.spells.count("frost") if Hero.WIZARD in sk else 0
    return weapon_power(p, sk) + foresight + arcane + berserk_bonus(p.hp, sk)


def carry_slot(p: Player, skills: frozenset[Hero], item: str) -> Slot:
    """Where the hero would carry `item`: the acrobat keeps spare daggers in her spell slots."""
    slot = _slot(item)
    spare = len(p.weapons) >= SLOTS[Slot.WEAPON] and len(p.spells) < SLOTS[Slot.SPELL]
    return Slot.SPELL if item == "dagger" and Hero.ACROBAT in skills and spare else slot


def berserk_bonus(hp: int, skills: frozenset[Hero]) -> int:
    if Hero.BARBARIAN not in skills:
        return 0
    return 1 if hp in (3, 4) else 2 if hp in (1, 2) else 0


class Game:
    def __init__(self, heroes: list[Hero], seed: int | None = None, rules: RulesConfig | None = None) -> None:
        if not 1 <= len(heroes) <= 5 or len(set(heroes)) != len(heroes):
            raise ValueError("1-5 different heroes")
        self.rules = rules or RulesConfig()
        allowed = (*BASE_HEROES, *REGENT_HEROES) if self.rules.expansion else BASE_HEROES
        if any(h not in allowed for h in heroes):
            raise ValueError("That hero needs the Regent expansion")
        self.rng = random.Random(seed)
        self.tiles: dict[Pos, Tile] = {START: Tile(0, START, Kind.START, 0b1111)}
        self.pile = tile_pile(self.rules.expansion)
        self.rng.shuffle(self.pile)
        self.bag = bag(self.rules.expansion)
        self.rng.shuffle(self.bag)
        self.players = [Player(h, hp=self.rules.max_hp) for h in heroes]
        self.cursed: int | None = None
        self.current = self.rng.randrange(len(heroes))
        self.first = self.current
        self.turn = 0
        self.used = 0
        self.trail = [START]  # tiles the current hero stood on this turn, oldest first
        self.phase = Phase.TURN
        self.combat: Combat | None = None
        self.pending: PendingTile | None = None
        self.offer: list[str] = []
        self.loot_item: str | None = None
        self.curse_pending = False
        self.relentless = False
        self.lord: int | None = None  # seat possessed by the Lord of Karak
        self.spoils: tuple[int, int] | None = None  # (winner, loser) of a duel while the winner picks
        self.offer_at: Pos | None = None
        self.offer_enter = True
        self.result: Result | None = None
        self.dragon_slain_by: int | None = None
        self._events: list[Event] = []
        self._begin_turn()
        self._events.insert(0, {"kind": "start", "seat": self.current})
        self.start_events = self._events

    # ------------------------------------------------------------------ queries
    @property
    def n(self) -> int:
        return len(self.players)

    @property
    def moves_left(self) -> int:
        return max(0, self.rules.moves - self.used)

    @property
    def actor(self) -> int:
        """Who has to act now: the current hero, except for the summoned hero in a duel and the winner's spoils."""
        if self.phase == Phase.STEAL and self.spoils is not None:
            return self.spoils[0]
        c = self.combat
        if self.phase in (Phase.COMBAT, Phase.ROLLED) and c is not None and c.versus is not None and c.stage == 1:
            return c.versus
        return self.current

    def skills(self, seat: int) -> frozenset[Hero]:
        return frozenset() if self.cursed == seat else self.players[seat].skills

    def has_skill(self, seat: int, hero: Hero) -> bool:
        return hero in self.skills(seat)

    def attack_power(self, seat: int) -> int:
        return weapon_power(self.players[seat], self.skills(seat))

    def fountains(self) -> list[Pos]:
        return [p for p, t in self.tiles.items() if t.kind in HEALING]

    def portals(self) -> list[Pos]:
        return [p for p, t in self.tiles.items() if t.kind == Kind.PORTAL]

    def connected(self, a: Pos, d: int) -> bool:
        b = step(a, d)
        return b in self.tiles and has_exit(self.tiles[a].exits, d) and has_exit(self.tiles[b].exits, opposite(d))

    def frontier(self) -> list[tuple[Pos, int]]:
        """Open exits that lead into undiscovered space."""
        return [
            (p, d) for p, t in self.tiles.items() for d in DIRS if has_exit(t.exits, d) and step(p, d) not in self.tiles
        ]

    def legal_actions(self, seat: int) -> list[Action]:
        if self.phase == Phase.GAME_OVER or seat != self.actor:
            return []
        p = self.players[seat]
        match self.phase:
            case Phase.PLACE:
                assert self.pending is not None
                return [A.Place(r) for r in self.pending.rotations]
            case Phase.CHOOSE_TOKEN:
                return [A.ChooseToken(i) for i in range(len(self.offer))]
            case Phase.COMBAT:
                assert self.combat is not None
                return [A.Roll()] + ([A.Sneak()] if self.combat.can_sneak else [])
            case Phase.ROLLED:
                out: list[Action] = []
                if self.has_skill(seat, Hero.WARRIOR) and self.combat and not self.combat.rerolled:
                    out.append(A.Reroll())
                wizard = self.has_skill(seat, Hero.WIZARD)  # arcane focus: spells count by themselves
                bolts = 0 if wizard else p.spells.count("bolt")
                fists = 0 if wizard else p.spells.count("frost")
                sacrifice = [False, True] if self.has_skill(seat, Hero.WARLOCK) and p.hp >= 1 else [False]
                out += [A.Strike(b, s, f) for b in range(bolts + 1) for f in range(fists + 1) for s in sacrifice]
                return out
            case Phase.LOOT:
                assert self.loot_item is not None
                owned = p.slot(self._slot_for(seat, self.loot_item))
                out = [A.Loot(None)] + [A.Loot(i) for i in _swaps(owned, self.loot_item)]
                if len(owned) < SLOTS[self._slot_for(seat, self.loot_item)]:
                    out.append(A.TakeLoot())  # a barbarian may choose to take it and end his turn
                return out
            case Phase.CURSE:
                out = [A.Curse(s) for s in range(self.n) if s != seat]
                if self.cursed is not None and self.cursed != seat:
                    out.append(A.Curse(None))
                return out
            case Phase.REINCARNATE:
                return [A.Reincarnate(f) for f in self.fountains()]
            case Phase.RETREAT:
                assert self.combat is not None
                return [A.Retreat(d) for d in DIRS if self.connected(self.combat.at, d)]
            case Phase.CHALLENGE:
                return [A.Challenge(s) for s in self._duel_targets(seat)]
            case Phase.STEAL:
                return self._steal_actions()
        return self._turn_actions(seat)

    def _turn_actions(self, seat: int) -> list[Action]:
        p = self.players[seat]
        here = self.tiles[p.pos]
        out: list[Action] = []
        if self.moves_left:
            astral = self.has_skill(seat, Hero.WIZARD)
            ranger = self.has_skill(seat, Hero.RANGER)
            for d in DIRS:
                nb = step(p.pos, d)
                if nb in self.tiles:
                    if self.connected(p.pos, d) or astral:
                        out.append(A.Move(d))
                elif has_exit(here.exits, d) and self.pile:
                    out.append(A.Explore(d))
                    if ranger:
                        out.append(A.Eavesdrop(d))
            portals = self.portals()
            if here.kind == Kind.PORTAL and len(portals) > 1:
                out += [A.Teleport(q) for q in portals if q != p.pos]
            if self.has_skill(seat, Hero.WARLOCK) and self.used == 0:
                for s, q in enumerate(self.players):
                    if s != seat and q.pos != p.pos:
                        out.append(A.Swap(s))
            if self.used == 0 and self.has_skill(seat, Hero.ACROBAT):
                out += [A.Sprint(q) for q in sorted(self._sprint_reach(p.pos))]
            if self.used == 0 and self.has_skill(seat, Hero.BATTLEMAGE):
                out += [A.Blitz(q) for q, t in self.tiles.items() if t.monster and q != p.pos]
        for i, item in enumerate(here.items):
            if item in here.items[:i]:
                continue
            slot = self._slot_for(seat, item)
            owned = p.slot(slot)
            if len(owned) < SLOTS[slot]:
                out.append(A.Pickup(i))
            else:
                out += [A.Pickup(i, j) for j in _swaps(owned, item)]
        if here.token == CHEST and p.keys:
            out.append(A.OpenChest())
        if "healing" in p.spells:
            out += [A.CastHealing(s, f) for s in range(self.n) for f in self.fountains()]
        if "thorn" in p.spells:
            out += [A.Thorn(s) for s, q in enumerate(self.players) if s != seat and q.hp > 0 and not q.knocked_out]
        if here.monster is None:  # a thief who slipped past a monster has to keep moving
            out.append(A.EndTurn())
            out += [A.EndTurn(h) for h in self._heal_choices(seat)]
        return out

    def _heal_choices(self, seat: int) -> list[int]:
        """The barbarian may stay wounded when he rests at a fountain: the HP he can end the turn with (below full)."""
        p = self.players[seat]
        if self.tiles[p.pos].kind not in HEALING or not self.has_skill(seat, Hero.BARBARIAN):
            return []
        return list(range(max(p.hp, 1), self.rules.max_hp))

    def _sprint_reach(self, src: Pos) -> set[Pos]:
        """Discovered tiles the acrobat can run to: up to 8 steps, never through a monster, an arena that has not been
        fought in or a cursed chamber (those can only be where she stops)."""
        dist = {src: 0}
        queue = [src]
        for cur in queue:
            if dist[cur] >= 8 or (cur != src and self._stops_sprint(self.tiles[cur])):
                continue
            for d in DIRS:
                nb = step(cur, d)
                if nb not in dist and self.connected(cur, d):
                    dist[nb] = dist[cur] + 1
                    queue.append(nb)
        return {q for q in dist if q != src}

    @staticmethod
    def _stops_sprint(tile: Tile) -> bool:
        return bool(tile.monster) or tile.kind == Kind.CURSED or (tile.kind == Kind.ARENA and not tile.spent)

    def _slot_for(self, seat: int, item: str) -> Slot:
        return carry_slot(self.players[seat], self.skills(seat), item)

    def view(self, seat: int) -> View:
        return View(
            seat=seat,
            phase=self.phase,
            current=self.current,
            moves_left=self.moves_left,
            turn=self.turn,
            tiles={pos: _copy_tile(t) for pos, t in self.tiles.items()},
            players=[_copy_player(p) for p in self.players],
            cursed=self.cursed,
            combat=replace(self.combat, dice=list(self.combat.dice)) if self.combat else None,
            pending=replace(self.pending, rotations=list(self.pending.rotations)) if self.pending else None,
            offer=list(self.offer) if seat == self.current else [],
            loot_item=self.loot_item,
            bag=Counter(self.bag),
            pile_left=len(self.pile),
            legal=self.legal_actions(seat),
            rules=self.rules,
            actor=self.actor,
            lord=self.lord,
            spoils=self.spoils,
        )

    # ------------------------------------------------------------------ step
    def step(self, seat: int, action: Action) -> list[Event]:
        if self.phase == Phase.GAME_OVER:
            raise IllegalMove("The game is over")
        if seat != self.actor:
            raise IllegalMove("It's not your turn")
        if action not in self.legal_actions(seat):
            raise IllegalMove(_why(self, action))
        self._events = []
        match action:
            case A.Move(d):
                self._walk(step(self.players[seat].pos, d))
            case A.Explore(d):
                self._explore(d, enter=True)
            case A.Eavesdrop(d):
                self._explore(d, enter=False)
            case A.Place(r):
                self._place(r)
            case A.Teleport(to):
                self.used += 1
                self._emit("teleport", frm=list(self.players[seat].pos), to=list(to))
                self._relocate(seat, to)
                self._settle()
            case A.Swap(other):
                self._swap(other)
            case A.Sprint(to):
                self._sprint(to)
            case A.Blitz(at):
                self._blitz(at)
            case A.ChooseToken(i):
                self._choose_token(i)
            case A.Roll():
                self._roll(reroll=False)
            case A.Reroll():
                self._roll(reroll=True)
            case A.Strike(bolts, sacrifice, fists):
                self._strike(bolts, sacrifice, fists)
            case A.Sneak():
                assert self.combat is not None
                self._emit("sneak", monster=self.combat.monster, at=list(self.combat.at))
                self.combat = None
                self.phase = Phase.TURN
                self._settle()
            case A.Retreat(d):
                self._retreat(d)
            case A.Loot(drop):
                self._loot(drop)
            case A.TakeLoot():
                self._take_loot()
            case A.Curse(target):
                self._curse(target)
            case A.Reincarnate(at):
                self._reincarnate(at)
            case A.Challenge(other):
                self._start_duel(seat, other)
            case A.Steal(slot, index, drop):
                self._steal(slot, index, drop)
            case A.Thorn(target):
                self._thorn(target)
            case A.Pickup(i, drop):
                self._pickup(i, drop)
            case A.OpenChest():
                self._open_chest()
            case A.CastHealing(target, at):
                self._cast_healing(target, at)
            case A.EndTurn(heal_to):
                self._end_turn(heal_to)
        return self._events

    def _emit(self, kind: str, _seat: int | None = None, **data: Any) -> None:
        self._events.append({"kind": kind, "seat": self.current if _seat is None else _seat, **data})

    # ------------------------------------------------------------------ movement
    def _relocate(self, seat: int, to: Pos) -> None:
        p = self.players[seat]
        p.came_from = p.pos
        p.pos = to
        if seat == self.current:
            self.trail.append(to)

    def _walk(self, to: Pos) -> None:
        seat = self.current
        self.used += 1
        self._emit("move", frm=list(self.players[seat].pos), to=list(to))
        self._relocate(seat, to)
        self._arrive()

    def _arrive(self) -> None:
        """The current hero has stepped onto a tile: fight its monster, or let a special chamber act, or carry on."""
        if self.tiles[self.players[self.current].pos].monster:
            self._start_combat()
        elif not self._on_enter():
            self._settle()

    def _sprint(self, to: Pos) -> None:
        seat = self.current
        self.used = self.rules.moves
        self._emit("sprint", frm=list(self.players[seat].pos), to=list(to))
        self._relocate(seat, to)
        self._arrive()

    def _blitz(self, at: Pos) -> None:
        seat = self.current
        self.used = self.rules.moves
        self._emit("blitz", frm=list(self.players[seat].pos), to=list(at))
        self._relocate(seat, at)
        self._start_combat(blitz=True)

    def _explore(self, d: int, enter: bool) -> None:
        p = self.players[self.current]
        kind, mask = self.pile.pop()
        target = step(p.pos, d)
        back = opposite(d)
        seen: set[int] = set()
        rotations = []
        for r in range(4):
            m = rotate(mask, r)
            if has_exit(m, back) and m not in seen:
                seen.add(m)
                rotations.append(r)
        self.pending = PendingTile(target, kind, mask, rotations, enter)
        self._emit("draw_tile", at=list(target), tile=kind.value, mask=mask, rotations=rotations, enter=enter)
        if len(rotations) == 1:
            self._place(rotations[0])
        else:
            self.phase = Phase.PLACE

    def _place(self, r: int) -> None:
        assert self.pending is not None
        pend, self.pending = self.pending, None
        tile = Tile(len(self.tiles), pend.pos, pend.kind, rotate(pend.mask, r))
        self.tiles[pend.pos] = tile
        self.used += 1
        p = self.players[self.current]
        self._emit("place", tile=tile.to_json(), frm=list(p.pos), enter=pend.enter)
        if pend.enter:
            self._relocate(self.current, pend.pos)
        self.phase = Phase.TURN
        self._discover(tile)
        if tile.kind == Kind.ROOM and self.bag:
            if self.has_skill(self.current, Hero.ORACLE) and len(self.bag) >= 2:
                self.offer = [self.bag.pop(), self.bag.pop()]
                self.offer_at, self.offer_enter = tile.pos, pend.enter
                self.phase = Phase.CHOOSE_TOKEN
                self._emit("offer", tokens=list(self.offer))
                return
            self._reveal(tile, self.bag.pop(), pend.enter)
            return
        self._awaken_dragon()
        if pend.enter and self._on_enter():
            return
        self._settle()

    def _choose_token(self, i: int) -> None:
        keep = self.offer[i]
        returned = self.offer[1 - i] if len(self.offer) == 2 else None
        self.offer = []
        if returned is not None:
            self.bag.insert(self.rng.randrange(len(self.bag) + 1), returned)
        self._emit("choose_token", kept=keep, returned=returned)
        self.phase = Phase.TURN
        assert self.offer_at is not None
        self._reveal(self.tiles[self.offer_at], keep, self.offer_enter)

    def _reveal(self, tile: Tile, token: str, enter: bool = True) -> None:
        tile.token = token
        self._emit("token", at=list(tile.pos), token=token)
        if token == "dragon":
            self._emit("dragon", at=list(tile.pos))
        if token in MONSTERS and enter:
            self._start_combat()
            self._awaken_dragon()
            return
        self._awaken_dragon()
        self._settle()

    def _awaken_dragon(self) -> None:
        """House rule: the labyrinth can't grow any more but the dragon is still in the bag — it wakes up in the
        empty room farthest from the start."""
        if "dragon" not in self.bag or (self.pile and self.frontier()):
            return
        self.bag.remove("dragon")
        occupied = {p.pos for p in self.players}
        dist = self._distances(START)
        candidates = [t for t in self.tiles.values() if t.token is None and t.pos not in occupied]
        rooms = [t for t in candidates if t.kind == Kind.ROOM] or [t for t in candidates if t.kind != Kind.START]
        rooms = rooms or candidates or list(self.tiles.values())
        lair = max(rooms, key=lambda t: (dist.get(t.pos, -1), -t.id))
        lair.token = "dragon"
        self._emit("dragon_awakens", at=list(lair.pos))

    def _distances(self, src: Pos) -> dict[Pos, int]:
        dist = {src: 0}
        queue = [src]
        for cur in queue:
            for d in DIRS:
                nb = step(cur, d)
                if nb not in dist and self.connected(cur, d):
                    dist[nb] = dist[cur] + 1
                    queue.append(nb)
        return dist

    def _swap(self, other: int) -> None:
        me = self.players[self.current]
        them = self.players[other]
        mine, theirs = me.pos, them.pos
        self.used = self.rules.moves
        self._emit("swap", other=other, frm=list(mine), to=list(theirs))
        self._relocate(self.current, theirs)
        self._relocate(other, mine)
        if self.tiles[mine].kind in HEALING:
            self._heal(other)
        if not self._on_enter():
            self._settle()

    # ------------------------------------------------------------------ Karak: Regent chambers
    def _on_enter(self, retreat: bool = False) -> bool:
        """The current hero entered a tile with an effect. True if that opened a phase (the duel's summons)."""
        seat = self.current
        tile = self.tiles[self.players[seat].pos]
        if tile.kind == Kind.CURSED:
            self._curse_roll(seat)
        elif tile.kind == Kind.ARENA and not tile.spent and not retreat:
            targets = self._duel_targets(seat)
            if not targets:
                return False  # nobody to fight: the arena waits for the next visitor
            if len(targets) == 1:
                self._start_duel(seat, targets[0])
            else:
                self.phase = Phase.CHALLENGE
            return True
        return False

    def _curse_roll(self, seat: int) -> None:
        if self.cursed == seat:
            return  # already cursed: no roll
        die = self._d6()
        cursed = die <= 3
        self._emit("curse_roll", _seat=seat, die=die, cursed=cursed)
        if cursed:
            self.cursed = seat
            self._emit("curse", _seat=seat, target=seat, source="chamber")

    def _discover(self, tile: Tile) -> None:
        """The Lord of Karak wakes as soon as 5 of his chambers have been discovered."""
        if not self.rules.lord or self.lord is not None or tile.kind not in LORD_CHAMBERS or self.n < 2:
            return
        if sum(1 for t in self.tiles.values() if t.kind in LORD_CHAMBERS) >= LORD_CHAMBERS_NEEDED:
            self._possess()

    def _possess(self) -> None:
        def weakness(s: int) -> tuple[int, int, int]:
            p = self.players[s]
            return (len(p.treasures), p.power, len(p.spells) + len(p.keys))

        weakest = min(weakness(s) for s in range(self.n))
        tied = [s for s in range(self.n) if weakness(s) == weakest]
        rolls: list[dict[str, int]] = []
        while len(tied) > 1:
            dice = {s: self._d6() for s in tied}
            rolls.append({str(s): d for s, d in dice.items()})
            low = min(dice.values())
            tied = [s for s in tied if dice[s] == low]
        seat = tied[0]
        p = self.players[seat]
        skills = {q.hero for s, q in enumerate(self.players) if s != seat}
        if self.n == 2:
            skills.add(p.hero)  # alone with one rival the Lord keeps his own skills too
        p.origin = p.hero
        p.hero = Hero.LORD
        p.skills = frozenset(skills)
        p.hp = self.rules.max_hp
        p.knocked_out = False
        if self.cursed == seat:
            self.cursed = None
        self.lord = seat
        self._emit("lord", _seat=seat, origin=p.origin.value, skills=sorted(h.value for h in skills), rolls=rolls)

    # ------------------------------------------------------------------ duels in the arena
    def _duel_targets(self, seat: int) -> list[int]:
        return [s for s, q in enumerate(self.players) if s != seat and q.hp > 0 and not q.knocked_out]

    def _start_duel(self, challenger: int, defender: int) -> None:
        tile = self.tiles[self.players[challenger].pos]
        at = tile.pos
        d = self.players[defender]
        self._emit("duel", defender=defender, at=list(at), frm=list(d.pos))
        d.came_from = d.pos
        d.pos = at
        self.combat = Combat("", at, at, first_move=self.used == 1, can_sneak=False, versus=defender)
        self.phase = Phase.COMBAT

    def _duel_strike(self, seat: int, total: int, bolts: int, fists: int, sacrifice: bool) -> None:
        c = self.combat
        assert c is not None and c.versus is not None
        self._emit(
            "duel_strike", _seat=seat, dice=list(c.dice), total=total, bolts=bolts, fists=fists, sacrifice=sacrifice
        )
        if c.stage == 0:
            c.target = total
            c.thief0 = self.has_skill(seat, Hero.THIEF)
            c.relent = self.has_skill(seat, Hero.SWORDSMAN) and 6 in c.dice
            c.stage, c.dice, c.rerolled, c.first_move = 1, [], False, True  # the summoned oracle always foresees
            self.phase = Phase.COMBAT
            return
        challenger, defender = self.current, c.versus
        thief1 = self.has_skill(defender, Hero.THIEF)
        winner: int | None
        if c.target != total:
            winner = challenger if c.target > total else defender
        elif c.thief0 != thief1:
            winner = challenger if c.thief0 else defender
        else:
            winner = None
        loser = None if winner is None else (defender if winner == challenger else challenger)
        self._emit("duel_result", winner=winner, loser=loser, totals=[c.target, total])
        self.tiles[c.at].spent = True
        self.combat = None
        relentless = c.relent
        if loser is not None:
            self._lose_life(loser)
        for s in range(self.n):  # blood price can bring the winner to 0 HP too
            if self.players[s].hp <= 0 and not self.players[s].knocked_out:
                self._lose_life(s, 0)
        if self.players[challenger].knocked_out:
            relentless = False
        self.relentless = relentless
        if winner is not None and loser is not None and self._stealable(loser):
            self.spoils = (winner, loser)
            self.phase = Phase.STEAL
            return
        self._after_combat()

    def _stealable(self, loser: int) -> list[tuple[str, int, str]]:
        q = self.players[loser]
        out = []
        for slot, owned in (("weapon", q.weapons), ("spell", q.spells), ("key", q.keys), ("treasure", q.treasures)):
            for i, item in enumerate(owned):
                if item not in owned[:i]:
                    out.append((slot, i, item))
        return out

    def _steal_actions(self) -> list[Action]:
        assert self.spoils is not None
        winner, loser = self.spoils
        w = self.players[winner]
        out: list[Action] = [A.Steal(None)]
        for slot, i, item in self._stealable(loser):
            if slot == "treasure":
                out.append(A.Steal(slot, i))
                continue
            dest = self._slot_for(winner, item)
            owned = w.slot(dest)
            if len(owned) < SLOTS[dest]:
                out.append(A.Steal(slot, i))
            else:
                out += [A.Steal(slot, i, j) for j in _swaps(owned, item)]
        return out

    def _steal(self, slot: str | None, index: int, drop: int | None) -> None:
        assert self.spoils is not None
        winner, loser = self.spoils
        self.spoils = None
        if slot is None:
            self._emit("steal", _seat=winner, victim=loser, item=None)
        else:
            q, w = self.players[loser], self.players[winner]
            lists = {"weapon": q.weapons, "spell": q.spells, "key": q.keys, "treasure": q.treasures}
            item = lists[slot].pop(index)
            dropped = None
            if slot == "treasure":
                w.treasures.append(item)
            else:
                owned = w.slot(self._slot_for(winner, item))
                if drop is not None:
                    dropped = owned.pop(drop)
                    self.tiles[w.pos].items.append(dropped)
                owned.append(item)
            self._emit("steal", _seat=winner, victim=loser, item=item, dropped=dropped)
        self.phase = Phase.TURN
        self._after_combat()

    def _lose_life(self, seat: int, n: int = 1) -> None:
        """A hero outside the usual fight loses life (duel, thorn): 0 HP means unconscious, or the warrior's rebirth."""
        p = self.players[seat]
        p.hp = max(0, p.hp - n)
        if p.hp > 0:
            return
        if self.has_skill(seat, Hero.WARRIOR):
            dist = self._distances(p.pos)
            at = min(self.fountains(), key=lambda f: (dist.get(f, 999), f))
            p.pos = p.came_from = at
            p.hp = self.rules.max_hp
            self._emit("reincarnate", _seat=seat, at=list(at))
        else:
            p.knocked_out = True
            self._emit("knocked_out", _seat=seat)

    def _thorn(self, target: int) -> None:
        self.players[self.current].spells.remove("thorn")
        self._emit("thorn", target=target)
        self._lose_life(target)

    # ------------------------------------------------------------------ combat
    def _start_combat(self, blitz: bool = False) -> None:
        p = self.players[self.current]
        tile = self.tiles[p.pos]
        assert tile.monster is not None
        # The thief may slip past only if she has a move left to get off the tile again.
        sneak = self.has_skill(self.current, Hero.THIEF) and self.phase != Phase.COMBAT and self.moves_left > 0
        # Retreat to the last tile of this turn without a monster (past any the thief slipped by).
        back = next((q for q in reversed(self.trail[:-1]) if self.tiles[q].monster is None), p.came_from)
        self.combat = Combat(tile.monster, p.pos, back, first_move=self.used == 1, can_sneak=sneak, blitz=blitz)
        self.phase = Phase.COMBAT
        self._emit("combat", monster=tile.monster, at=list(p.pos))

    def _d6(self) -> int:
        return self.rng.randint(1, 6)

    def _roll(self, reroll: bool) -> None:
        assert self.combat is not None
        seat = self.actor
        dice = [self._d6(), self._d6()]
        steadied = 0
        if self.has_skill(seat, Hero.SWORDSMAN):
            for i in range(2):
                while dice[i] == 1:
                    dice[i] = self._d6()
                    steadied += 1
        bear = 0
        if self.has_skill(seat, Hero.RANGER):  # the bear turns every 1 into a 6
            for i in range(2):
                if dice[i] == 1:
                    dice[i] = 6
                    bear += 1
        self.combat.dice = dice
        self.combat.rerolled = self.combat.rerolled or reroll
        self.phase = Phase.ROLLED
        self._emit(
            "roll",
            _seat=seat,
            dice=list(dice),
            reroll=reroll,
            steadied=steadied,
            bear=bear,
            monster=self.combat.monster,
        )

    def combat_bonus(self, seat: int) -> int:
        """Fixed bonus before spent spells and blood price: weapons, foresight, berserk, the wizard's spells."""
        assert self.combat is not None
        return _fixed_bonus(self.players[seat], self.skills(seat), self.combat.first_move)

    def _strike(self, bolts: int, sacrifice: bool, fists: int) -> None:
        c = self.combat
        assert c is not None
        seat = self.actor
        p = self.players[seat]
        total = sum(c.dice) + self.combat_bonus(seat) + bolts + 2 * fists + (1 if sacrifice else 0)
        for _ in range(bolts):
            p.spells.remove("bolt")
        for _ in range(fists):
            p.spells.remove("frost")
        if sacrifice:
            p.hp -= 1
        if c.versus is not None:
            self._duel_strike(seat, total, bolts, fists, sacrifice)
            return
        monster = MONSTERS[c.monster]
        if total > monster.strength or (total == monster.strength and self.has_skill(seat, Hero.THIEF)):
            outcome = "win"
        elif total == monster.strength:
            outcome = "tie"
        else:
            outcome = "loss"
        relentless = self.has_skill(seat, Hero.SWORDSMAN) and 6 in c.dice
        self._emit(
            "strike",
            monster=c.monster,
            dice=list(c.dice),
            total=total,
            strength=monster.strength,
            bolts=bolts,
            fists=fists,
            sacrifice=sacrifice,
            outcome=outcome,
        )
        self.combat = None
        tile = self.tiles[c.at]
        if outcome == "win":
            tile.token = None
            if self._gain(monster.loot) and self.has_skill(seat, Hero.BARBARIAN):
                relentless = True  # perseverance: no equipment taken, the turn goes on
            if c.monster == "dragon":
                self.dragon_slain_by = seat
                self._finish()
                return
            if c.monster == "mummy" and self.n > 1:
                self.curse_pending = True
        else:
            if outcome == "loss":
                p.hp -= 1
            if c.blitz:  # the battle mage picks where to fall back to
                self.combat = c
                self.relentless = relentless
                self.phase = Phase.RETREAT
                return
            self._emit("retreat", frm=list(c.at), to=list(c.back))
            p.pos = c.back
            p.came_from = c.back
            self.trail.append(c.back)
            if self.tiles[c.back].kind == Kind.CURSED:
                self._curse_roll(seat)  # a hero thrown back onto a cursed chamber rolls again
        self._after_fight(relentless)

    def _retreat(self, d: int) -> None:
        c = self.combat
        assert c is not None
        p = self.players[self.current]
        to = step(c.at, d)
        self._emit("retreat", frm=list(c.at), to=list(to))
        p.pos = p.came_from = to
        self.trail.append(to)
        self.combat = None
        self.phase = Phase.TURN
        if self.tiles[to].kind == Kind.CURSED:
            self._curse_roll(self.current)
        self._after_fight(self.relentless)

    def _after_fight(self, relentless: bool) -> None:
        seat = self.current
        p = self.players[seat]
        if p.hp <= 0:
            p.hp = 0
            if self.has_skill(seat, Hero.WARRIOR):
                fountains = self.fountains()
                if len(fountains) > 1:
                    self.phase = Phase.REINCARNATE
                    return
                self._reincarnate(fountains[0])
                return
            p.knocked_out = True
            self._emit("knocked_out")
            relentless = False
        self.relentless = relentless
        self._after_combat()

    def _gain(self, item: str) -> bool:
        """Loot from a beaten monster. True if it did not end up in the hero's pack (a treasure, left behind...)."""
        seat = self.current
        p = self.players[seat]
        if ITEMS[item].slot is None:
            p.treasures.append(item)
            self._emit("loot", item=item)
            return True
        slot = self._slot_for(seat, item)
        if self.has_skill(seat, Hero.BARBARIAN) and self.moves_left > 0:
            self.loot_item = item  # he chooses: take it, or leave it and fight on
            return False
        if len(p.slot(slot)) < SLOTS[slot]:
            p.slot(slot).append(item)
            self._emit("loot", item=item)
            return False
        if _swaps(p.slot(slot), item):
            self.loot_item = item
            return False
        self.tiles[p.pos].items.append(item)
        self._emit("leave", item=item)
        return True

    def _after_combat(self) -> None:
        if self.loot_item is not None:
            self.phase = Phase.LOOT
            return
        if self.curse_pending:
            self.phase = Phase.CURSE
            return
        if self.relentless:
            self.relentless = False
            self.phase = Phase.TURN
            self._emit("relentless")
            self._settle()
            return
        self._end_turn()

    def _loot(self, drop: int | None) -> None:
        item = self.loot_item
        assert item is not None
        seat = self.current
        p = self.players[seat]
        tile = self.tiles[p.pos]
        self.loot_item = None
        if drop is None:
            tile.items.append(item)
            self._emit("leave", item=item)
            if self.has_skill(seat, Hero.BARBARIAN) and not p.knocked_out:
                self.relentless = True  # perseverance
        else:
            owned = p.slot(self._slot_for(seat, item))
            old = owned.pop(drop)
            owned.append(item)
            tile.items.append(old)
            self._emit("loot", item=item, dropped=old)
        self._after_combat()

    def _take_loot(self) -> None:
        item = self.loot_item
        assert item is not None
        p = self.players[self.current]
        self.loot_item = None
        p.slot(self._slot_for(self.current, item)).append(item)
        self._emit("loot", item=item)
        self._after_combat()

    def _curse(self, target: int | None) -> None:
        self.curse_pending = False
        if target is not None:
            self.cursed = target
            self._emit("curse", target=target)
        else:
            self._emit("curse_kept", target=self.cursed)
        self._after_combat()

    def _reincarnate(self, at: Pos) -> None:
        p = self.players[self.current]
        p.pos = at
        p.came_from = at
        p.hp = self.rules.max_hp
        self._emit("reincarnate", at=list(at))
        self.relentless = False
        self._end_turn()

    # ------------------------------------------------------------------ tile actions
    def _pickup(self, i: int, drop: int | None) -> None:
        p = self.players[self.current]
        tile = self.tiles[p.pos]
        item = tile.items.pop(i)
        owned = p.slot(self._slot_for(self.current, item))
        old = owned.pop(drop) if drop is not None else None
        owned.append(item)
        if old is not None:
            tile.items.append(old)
        self._emit("pickup", item=item, dropped=old, at=list(p.pos))
        self._end_turn()

    def _open_chest(self) -> None:
        p = self.players[self.current]
        p.keys.pop()
        self.tiles[p.pos].token = None
        p.treasures.append("treasure")
        self._emit("open_chest", at=list(p.pos))
        self._end_turn()

    def _cast_healing(self, target: int, at: Pos) -> None:
        self.players[self.current].spells.remove("healing")
        q = self.players[target]
        self._emit("cast_healing", target=target, frm=list(q.pos), to=list(at))
        self._relocate(target, at)
        q.knocked_out = False
        self._heal(target)
        self._settle()

    def _heal(self, seat: int, to: int | None = None) -> None:
        """Heal to `to` HP (default full) and lift the Curse."""
        p = self.players[seat]
        lifted = self.cursed == seat
        goal = self.rules.max_hp if to is None else max(p.hp, min(to, self.rules.max_hp))
        if p.hp < goal or lifted:
            self._events.append({"kind": "heal", "seat": seat, "hp": goal - p.hp, "lifted": lifted})
        p.hp = goal
        if lifted:
            self.cursed = None

    # ------------------------------------------------------------------ turn flow
    def _settle(self) -> None:
        """Back in the TURN phase: end the turn by itself once nothing is left to do."""
        if self.phase != Phase.TURN or self.moves_left:
            return
        if any(
            isinstance(a, A.Pickup | A.OpenChest) or (isinstance(a, A.EndTurn) and a.heal_to is not None)
            for a in self._turn_actions(self.current)
        ):
            return
        self._end_turn()

    def _end_turn(self, heal_to: int | None = None) -> None:
        seat = self.current
        p = self.players[seat]
        if self.tiles[p.pos].kind in HEALING:
            p.knocked_out = False
            self._heal(seat, heal_to)
        self._emit("end_turn")
        self.turn += 1
        self.current = (seat + 1) % self.n
        if self.turn >= self.rules.max_turns:
            self._finish()
            return
        self._begin_turn()

    def _begin_turn(self) -> None:
        for _ in range(2 * self.n + 1):
            p = self.players[self.current]
            if not p.knocked_out:
                break
            p.knocked_out = False
            p.hp = 1
            self._emit("recover")
            self.turn += 1
            self.current = (self.current + 1) % self.n
        self.used = 0
        self.phase = Phase.TURN
        self.combat = None
        self.trail = [self.players[self.current].pos]
        self._emit("turn")

    def _finish(self) -> None:
        self.phase = Phase.GAME_OVER
        self.combat = None
        best = max(p.points for p in self.players)
        players = [
            PlayerResult(s, p.hero.value, p.points, len(p.treasures), "ruby" in p.treasures)
            for s, p in enumerate(self.players)
        ]
        winners = [s for s, p in enumerate(self.players) if p.points == best]
        self.result = Result(winners, players, self.dragon_slain_by)
        self._emit("game_over", winners=winners)


def _copy_tile(t: Tile) -> Tile:
    return Tile(t.id, t.pos, t.kind, t.exits, t.token, list(t.items), t.spent)


def _copy_player(p: Player) -> Player:
    return replace(p, weapons=list(p.weapons), spells=list(p.spells), keys=list(p.keys), treasures=list(p.treasures))


def _slot(item: str) -> Slot:
    slot = ITEMS[item].slot
    assert slot is not None
    return slot


def _swaps(owned: list[str], item: str) -> list[int]:
    """Indices worth giving up for `item`: one per distinct owned item, never an identical one."""
    return [j for j, x in enumerate(owned) if x != item and x not in owned[:j]]


def _why(game: Game, action: Action) -> str:
    """A friendly reason for a rejected action."""
    phase_needs = {
        Phase.PLACE: "Turn the new tile and place it first",
        Phase.CHOOSE_TOKEN: "Choose which token to keep first",
        Phase.COMBAT: "Finish the fight first",
        Phase.ROLLED: "Finish the fight first",
        Phase.LOOT: "Decide what to leave on the floor first",
        Phase.CURSE: "Choose who gets the curse first",
        Phase.REINCARNATE: "Choose a fountain first",
        Phase.RETREAT: "Choose where to fall back to first",
        Phase.CHALLENGE: "Choose who to challenge first",
        Phase.STEAL: "Choose what to take from the loser first",
    }
    if game.phase in phase_needs:
        return phase_needs[game.phase]
    if isinstance(action, A.Move | A.Explore | A.Teleport) and not game.moves_left:
        return "No moves left this turn"
    if isinstance(action, A.Move):
        return "A wall is in the way"
    if isinstance(action, A.Explore):
        return "You can only explore through an open passage" if game.pile else "The tile pile is empty"
    return "You can't do that now"
