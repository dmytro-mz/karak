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
    CHEST,
    DIRS,
    HEALING,
    ITEMS,
    MONSTERS,
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
    GAME_OVER = "game_over"


@dataclass(frozen=True)
class RulesConfig:
    moves: int = 4
    max_hp: int = 5
    max_turns: int = 1500  # safety stop for bot games; the dragon ends real games long before


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
        }


@dataclass
class PendingTile:
    pos: Pos
    kind: Kind
    mask: int
    rotations: list[int]


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

    def has_skill(self, seat: int, hero: Hero) -> bool:
        return self.players[seat].hero == hero and self.cursed != seat


class Game:
    def __init__(self, heroes: list[Hero], seed: int | None = None, rules: RulesConfig | None = None) -> None:
        if not 1 <= len(heroes) <= 5 or len(set(heroes)) != len(heroes):
            raise ValueError("1-5 different heroes")
        self.rules = rules or RulesConfig()
        self.rng = random.Random(seed)
        self.tiles: dict[Pos, Tile] = {START: Tile(0, START, Kind.START, 0b1111)}
        self.pile = tile_pile()
        self.rng.shuffle(self.pile)
        self.bag = bag()
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

    def has_skill(self, seat: int, hero: Hero) -> bool:
        return self.players[seat].hero == hero and self.cursed != seat

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
        if self.phase == Phase.GAME_OVER or seat != self.current:
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
                bolts = 0 if self.has_skill(seat, Hero.WIZARD) else p.spells.count("bolt")
                sacrifice = [False, True] if self.has_skill(seat, Hero.WARLOCK) and p.hp >= 1 else [False]
                out += [A.Strike(b, s) for b in range(bolts + 1) for s in sacrifice]
                return out
            case Phase.LOOT:
                assert self.loot_item is not None
                owned = p.slot(_slot(self.loot_item))
                return [A.Loot(None)] + [A.Loot(i) for i in _swaps(owned, self.loot_item)]
            case Phase.CURSE:
                out = [A.Curse(s) for s in range(self.n) if s != seat]
                if self.cursed is not None and self.cursed != seat:
                    out.append(A.Curse(None))
                return out
            case Phase.REINCARNATE:
                return [A.Reincarnate(f) for f in self.fountains()]
        return self._turn_actions(seat)

    def _turn_actions(self, seat: int) -> list[Action]:
        p = self.players[seat]
        here = self.tiles[p.pos]
        out: list[Action] = []
        if self.moves_left:
            astral = self.has_skill(seat, Hero.WIZARD)
            for d in DIRS:
                nb = step(p.pos, d)
                if nb in self.tiles:
                    if self.connected(p.pos, d) or astral:
                        out.append(A.Move(d))
                elif has_exit(here.exits, d) and self.pile:
                    out.append(A.Explore(d))
            portals = self.portals()
            if here.kind == Kind.PORTAL and len(portals) > 1:
                out += [A.Teleport(q) for q in portals if q != p.pos]
            if self.has_skill(seat, Hero.WARLOCK) and self.used == 0:
                for s, q in enumerate(self.players):
                    if s != seat and q.pos != p.pos:
                        out.append(A.Swap(s))
        for i, item in enumerate(here.items):
            if item in here.items[:i]:
                continue
            owned = p.slot(_slot(item))
            if len(owned) < SLOTS[_slot(item)]:
                out.append(A.Pickup(i))
            else:
                out += [A.Pickup(i, j) for j in _swaps(owned, item)]
        if here.token == CHEST and p.keys:
            out.append(A.OpenChest())
        if "healing" in p.spells:
            out += [A.CastHealing(s, f) for s in range(self.n) for f in self.fountains()]
        if here.monster is None:  # a thief who slipped past a monster has to keep moving
            out.append(A.EndTurn())
        return out

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
        )

    # ------------------------------------------------------------------ step
    def step(self, seat: int, action: Action) -> list[Event]:
        if self.phase == Phase.GAME_OVER:
            raise IllegalMove("The game is over")
        if seat != self.current:
            raise IllegalMove("It's not your turn")
        if action not in self.legal_actions(seat):
            raise IllegalMove(_why(self, action))
        self._events = []
        match action:
            case A.Move(d):
                self._walk(step(self.players[seat].pos, d))
            case A.Explore(d):
                self._explore(d)
            case A.Place(r):
                self._place(r)
            case A.Teleport(to):
                self.used += 1
                self._emit("teleport", frm=list(self.players[seat].pos), to=list(to))
                self._relocate(seat, to)
                self._settle()
            case A.Swap(other):
                self._swap(other)
            case A.ChooseToken(i):
                self._choose_token(i)
            case A.Roll():
                self._roll(reroll=False)
            case A.Reroll():
                self._roll(reroll=True)
            case A.Strike(bolts, sacrifice):
                self._strike(bolts, sacrifice)
            case A.Sneak():
                assert self.combat is not None
                self._emit("sneak", monster=self.combat.monster, at=list(self.combat.at))
                self.combat = None
                self.phase = Phase.TURN
                self._settle()
            case A.Loot(drop):
                self._loot(drop)
            case A.Curse(target):
                self._curse(target)
            case A.Reincarnate(at):
                self._reincarnate(at)
            case A.Pickup(i, drop):
                self._pickup(i, drop)
            case A.OpenChest():
                self._open_chest()
            case A.CastHealing(target, at):
                self._cast_healing(target, at)
            case A.EndTurn():
                self._end_turn()
        return self._events

    def _emit(self, kind: str, **data: Any) -> None:
        self._events.append({"kind": kind, "seat": self.current, **data})

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
        if self.tiles[to].monster:
            self._start_combat()
        else:
            self._settle()

    def _explore(self, d: int) -> None:
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
        self.pending = PendingTile(target, kind, mask, rotations)
        self._emit("draw_tile", at=list(target), tile=kind.value, mask=mask, rotations=rotations)
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
        self._emit("place", tile=tile.to_json(), frm=list(p.pos))
        self._relocate(self.current, pend.pos)
        self.phase = Phase.TURN
        if tile.kind == Kind.ROOM and self.bag:
            if self.has_skill(self.current, Hero.ORACLE) and len(self.bag) >= 2:
                self.offer = [self.bag.pop(), self.bag.pop()]
                self.phase = Phase.CHOOSE_TOKEN
                self._emit("offer", tokens=list(self.offer))
                return
            self._reveal(tile, self.bag.pop())
            return
        self._awaken_dragon()
        self._settle()

    def _choose_token(self, i: int) -> None:
        keep = self.offer[i]
        returned = self.offer[1 - i] if len(self.offer) == 2 else None
        self.offer = []
        if returned is not None:
            self.bag.insert(self.rng.randrange(len(self.bag) + 1), returned)
        self._emit("choose_token", kept=keep, returned=returned)
        self.phase = Phase.TURN
        self._reveal(self.tiles[self.players[self.current].pos], keep)

    def _reveal(self, tile: Tile, token: str) -> None:
        tile.token = token
        self._emit("token", at=list(tile.pos), token=token)
        if token == "dragon":
            self._emit("dragon", at=list(tile.pos))
        if token in MONSTERS:
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
        self._settle()

    # ------------------------------------------------------------------ combat
    def _start_combat(self) -> None:
        p = self.players[self.current]
        tile = self.tiles[p.pos]
        assert tile.monster is not None
        # The thief may slip past only if she has a move left to get off the tile again.
        sneak = self.has_skill(self.current, Hero.THIEF) and self.phase != Phase.COMBAT and self.moves_left > 0
        # Retreat to the last tile of this turn without a monster (past any the thief slipped by).
        back = next((q for q in reversed(self.trail[:-1]) if self.tiles[q].monster is None), p.came_from)
        self.combat = Combat(tile.monster, p.pos, back, first_move=self.used == 1, can_sneak=sneak)
        self.phase = Phase.COMBAT
        self._emit("combat", monster=tile.monster, at=list(p.pos))

    def _d6(self) -> int:
        return self.rng.randint(1, 6)

    def _roll(self, reroll: bool) -> None:
        assert self.combat is not None
        dice = [self._d6(), self._d6()]
        steadied = 0
        if self.has_skill(self.current, Hero.SWORDSMAN):
            for i in range(2):
                while dice[i] == 1:
                    dice[i] = self._d6()
                    steadied += 1
        self.combat.dice = dice
        self.combat.rerolled = self.combat.rerolled or reroll
        self.phase = Phase.ROLLED
        self._emit("roll", dice=list(dice), reroll=reroll, steadied=steadied, monster=self.combat.monster)

    def combat_bonus(self, seat: int) -> int:
        """Fixed bonus before spent bolts and blood price: weapons, the oracle's foresight, the wizard's bolts."""
        assert self.combat is not None
        p = self.players[seat]
        foresight = 1 if self.has_skill(seat, Hero.ORACLE) and self.combat.first_move else 0
        arcane = p.spells.count("bolt") if self.has_skill(seat, Hero.WIZARD) else 0
        return p.power + foresight + arcane

    def _strike(self, bolts: int, sacrifice: bool) -> None:
        seat = self.current
        c = self.combat
        assert c is not None
        p = self.players[seat]
        monster = MONSTERS[c.monster]
        total = sum(c.dice) + self.combat_bonus(seat) + bolts + (1 if sacrifice else 0)
        for _ in range(bolts):
            p.spells.remove("bolt")
        if sacrifice:
            p.hp -= 1
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
            sacrifice=sacrifice,
            outcome=outcome,
        )
        self.combat = None
        tile = self.tiles[c.at]
        if outcome == "win":
            tile.token = None
            self._gain(monster.loot)
            if c.monster == "dragon":
                self.dragon_slain_by = seat
                self._finish()
                return
            if c.monster == "mummy" and self.n > 1:
                self.curse_pending = True
        else:
            if outcome == "loss":
                p.hp -= 1
            self._emit("retreat", frm=list(c.at), to=list(c.back))
            p.pos = c.back
            p.came_from = c.back
            self.trail.append(c.back)
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

    def _gain(self, item: str) -> None:
        p = self.players[self.current]
        slot = ITEMS[item].slot
        if slot is None:
            p.treasures.append(item)
            self._emit("loot", item=item)
        elif len(p.slot(slot)) < SLOTS[slot]:
            p.slot(slot).append(item)
            self._emit("loot", item=item)
        elif _swaps(p.slot(slot), item):
            self.loot_item = item
        else:
            self.tiles[p.pos].items.append(item)
            self._emit("leave", item=item)

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
        p = self.players[self.current]
        tile = self.tiles[p.pos]
        self.loot_item = None
        if drop is None:
            tile.items.append(item)
            self._emit("leave", item=item)
        else:
            owned = p.slot(_slot(item))
            old = owned.pop(drop)
            owned.append(item)
            tile.items.append(old)
            self._emit("loot", item=item, dropped=old)
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
        owned = p.slot(_slot(item))
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

    def _heal(self, seat: int) -> None:
        p = self.players[seat]
        lifted = self.cursed == seat
        if p.hp < self.rules.max_hp or lifted:
            self._events.append({"kind": "heal", "seat": seat, "hp": self.rules.max_hp - p.hp, "lifted": lifted})
        p.hp = self.rules.max_hp
        if lifted:
            self.cursed = None

    # ------------------------------------------------------------------ turn flow
    def _settle(self) -> None:
        """Back in the TURN phase: end the turn by itself once nothing is left to do."""
        if self.phase != Phase.TURN or self.moves_left:
            return
        if any(isinstance(a, A.Pickup | A.OpenChest) for a in self._turn_actions(self.current)):
            return
        self._end_turn()

    def _end_turn(self) -> None:
        seat = self.current
        p = self.players[seat]
        if self.tiles[p.pos].kind in HEALING:
            p.knocked_out = False
            self._heal(seat)
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
    return Tile(t.id, t.pos, t.kind, t.exits, t.token, list(t.items))


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
