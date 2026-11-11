"""`View` -> network input, and the fixed action space of the neural player.

Everything is seen from the acting seat: relative seat 0 is "me", 1 the next player in turn order, and so on, so
one network plays any seat at any table size (absent seats are all zeros).

Input:
- `spatial` uint8 (N_SPATIAL, S, S): the labyrinth on an S x S canvas centred on its bounding box (measured maps
  stay within 20 x 20; a bigger one is cropped around the hero). Planes hold 0..255 and the network scales by 1/255.
- `glob` float32 (N_GLOBAL,): phase, bag, hero sheets per seat, the fight, the tile being placed, offers, inventory.
- `me`: the canvas cell of the acting hero (the network reads its trunk features there).

Actions: map-targeted actions are planes over the canvas, everything else is one of N_FLAT fixed slots.
- `go`: a destination, any reachable tile or unexplored cell behind an open exit. The hero takes the first step
  of a shortest path there (a move, an exploration or a teleport) and decides again after it. Several cells
  can share one first step. A destination's logit then depends on what is there and how far away it is, so
  the network doesn't have to work out paths itself.
- `reincarnate`, `heal{k}` (cast healing on relative seat k): the fountain cell.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

import numpy as np

from karak.game import actions as A
from karak.game.actions import Action
from karak.game.engine import Phase, View
from karak.game.model import (
    CHEST,
    DIRS,
    HEALING,
    MONSTERS,
    Hero,
    Kind,
    Pos,
    bag,
    has_exit,
    opposite,
    rotate,
    step,
)
from karak.game.rules import neighbours, win_chance

VERSION = 2
S = 24
CELLS = S * S
MAX_SEATS = 5
MONSTER_KEYS = tuple(MONSTERS)
TOKEN_KEYS = (*MONSTER_KEYS, CHEST)
TOKEN_TOTAL = Counter(bag())
GEAR = ("dagger", "sword", "axe", "bolt", "healing", "key")
GEAR_INDEX = {g: i for i, g in enumerate(GEAR)}
KINDS = (Kind.START, Kind.CORRIDOR, Kind.ROOM, Kind.FOUNTAIN, Kind.PORTAL)
HEROES = tuple(Hero)
PHASES = (
    Phase.TURN,
    Phase.PLACE,
    Phase.CHOOSE_TOKEN,
    Phase.COMBAT,
    Phase.ROLLED,
    Phase.LOOT,
    Phase.CURSE,
    Phase.REINCARNATE,
)
DIST_SCALE = 32.0


class _Layout:
    """Named, contiguous blocks of a feature vector."""

    def __init__(self) -> None:
        self.size = 0
        self.blocks: dict[str, tuple[int, int]] = {}

    def add(self, name: str, n: int) -> int:
        self.blocks[name] = (self.size, n)
        self.size += n
        return self.size - n


_sp = _Layout()
P_TILE = _sp.add("tile", 1)
P_KIND = _sp.add("kind", len(KINDS))
P_EXIT = _sp.add("exit", 4)
P_FRONTIER = _sp.add("frontier", 1)  # empty cell behind an open exit (while the pile lasts)
P_MONSTER = _sp.add("monster", len(MONSTER_KEYS))
P_ODDS = _sp.add("odds", 1)  # my chance to beat the monster here
P_CHEST = _sp.add("chest", 1)
P_GEAR = _sp.add("gear", len(GEAR))  # equipment on the floor
P_SEAT = _sp.add("seat", MAX_SEATS)  # heroes by relative seat
P_DIST = _sp.add("dist", 1)  # 1 - moves/32 along my shortest path, 0 = unreachable
P_REACH = _sp.add("reach", 1)  # reachable with the moves left this turn
P_REACH_NEXT = _sp.add("reach_next", 1)  # ... or by the end of the next turn
P_BACK = _sp.add("back", 1)  # where a fight retreats to
P_PENDING = _sp.add("pending", 1)  # the tile being placed
N_SPATIAL = _sp.size

_SEAT_FEATURES = _Layout()
F_PRESENT = _SEAT_FEATURES.add("present", 1)
F_HERO = _SEAT_FEATURES.add("hero", len(HEROES))
F_SKILL = _SEAT_FEATURES.add("skill", 1)  # skills work (not cursed)
F_HP = _SEAT_FEATURES.add("hp", 6)
F_HP_FRAC = _SEAT_FEATURES.add("hp_frac", 1)
F_POWER = _SEAT_FEATURES.add("power", 1)
F_WEAPONS = _SEAT_FEATURES.add("weapons", 3)
F_SPELLS = _SEAT_FEATURES.add("spells", 2)
F_KEY = _SEAT_FEATURES.add("key", 1)
F_POINTS = _SEAT_FEATURES.add("points", 1)
F_TREASURES = _SEAT_FEATURES.add("treasures", 1)
F_RUBY = _SEAT_FEATURES.add("ruby", 1)
F_KO = _SEAT_FEATURES.add("knocked_out", 1)
F_CURSED = _SEAT_FEATURES.add("cursed", 1)
F_CURRENT = _SEAT_FEATURES.add("current", 1)
F_REACHABLE = _SEAT_FEATURES.add("reachable", 1)
F_DIST = _SEAT_FEATURES.add("dist", 1)
F_ON_HEAL = _SEAT_FEATURES.add("on_heal", 1)
F_LEAD = _SEAT_FEATURES.add("lead_over_me", 1)
F_DRAGON_ODDS = _SEAT_FEATURES.add("dragon_odds", 1)
F_WITH_ME = _SEAT_FEATURES.add("with_me", 1)
SEAT_SIZE = _SEAT_FEATURES.size

_gl = _Layout()
G_PHASE = _gl.add("phase", len(PHASES))
G_TABLE = _gl.add("table_size", MAX_SEATS)
G_MOVES = _gl.add("moves", 2)
G_TURN = _gl.add("turn", 2)
G_PILE = _gl.add("pile", 2)
G_BAG = _gl.add("bag", len(TOKEN_KEYS) + 1)
G_BOARD = _gl.add("board", len(TOKEN_KEYS))
G_SEATS = _gl.add("seats", MAX_SEATS * SEAT_SIZE)
G_CURSE_FREE = _gl.add("curse_free", 1)
G_SCORE = _gl.add("score", 2)  # the ruby would win me the game, my lead over the best rival
G_DRAGON = _gl.add("dragon", 2)
G_FRONTIER = _gl.add("frontier", 1)
G_FIGHT = _gl.add("fight", 1 + len(MONSTER_KEYS) + 15)
G_PLACE = _gl.add("place", len(KINDS) + 4 * 9)
G_OFFER = _gl.add("offer", 2 * (len(TOKEN_KEYS) + 1))
G_LOOT = _gl.add("loot", len(GEAR))
G_INVENTORY = _gl.add("inventory", 2 * 3 + 3 * 2 + 1)
G_HERE = _gl.add("here", len(GEAR) + 4)
N_GLOBAL = _gl.size

# ---------------------------------------------------------------- action space
PLANES = ("go", "reincarnate", *(f"heal{k}" for k in range(MAX_SEATS)))
N_PLANES = len(PLANES)
N_SPATIAL_ACTIONS = N_PLANES * CELLS
_fl = _Layout()
A_PLACE = _fl.add("place", 4)
A_SWAP = _fl.add("swap", MAX_SEATS - 1)  # relative seat 1..4
A_CHOOSE = _fl.add("choose_token", 2)
A_ROLL = _fl.add("roll", 1)
A_REROLL = _fl.add("reroll", 1)
A_SNEAK = _fl.add("sneak", 1)
A_STRIKE = _fl.add("strike", 4 * 2)  # bolts * 2 + sacrifice
A_LOOT = _fl.add("loot", 4)  # leave the new item, or drop owned 0..2
A_CURSE = _fl.add("curse", MAX_SEATS)  # relative seat 1..4, then "keep it where it is"
A_PICKUP = _fl.add("pickup", len(GEAR) * 4)  # gear * 4 + (no drop, drop 0..2)
A_OPEN = _fl.add("open_chest", 1)
A_END = _fl.add("end_turn", 1)
N_FLAT = _fl.size
N_ACTIONS = N_SPATIAL_ACTIONS + N_FLAT


@dataclass(frozen=True)
class Frame:
    """Maps board positions to canvas cells."""

    ox: int
    oy: int

    def cell(self, pos: Pos) -> int | None:
        col, row = pos.x - self.ox, pos.y - self.oy
        if 0 <= col < S and 0 <= row < S:
            return row * S + col
        return None


def frame_for(view: View) -> Frame:
    xs = [p.x for p in view.tiles]
    ys = [p.y for p in view.tiles]
    me = view.players[view.seat].pos
    return Frame(_origin(min(xs), max(xs), me.x), _origin(min(ys), max(ys), me.y))


def _origin(lo: int, hi: int, mine: int) -> int:
    o = (lo + hi + 1) // 2 - S // 2
    # Too wide to fit with a one-cell margin: keep the hero and its neighbours on the canvas.
    return min(max(o, mine - S + 2), mine - 1)


def relative(view: View, seat: int) -> int:
    return (seat - view.seat) % len(view.players)


def fight_odds(view: View, seat: int, monster: str, first_move: bool = False) -> float:
    """Chance to win a fight from the start, spending every bolt and the warlock's blood price if useful."""
    p = view.players[seat]
    bonus = p.power + p.spells.count("bolt")
    if view.has_skill(seat, Hero.ORACLE) and first_move:
        bonus += 1
    if view.has_skill(seat, Hero.WARLOCK) and p.hp > 1:
        bonus += 1
    return win_chance(
        MONSTERS[monster].strength - bonus,
        steady=view.has_skill(seat, Hero.SWORDSMAN),
        ties_win=view.has_skill(seat, Hero.THIEF),
        reroll=view.has_skill(seat, Hero.WARRIOR),
    )


def paths(view: View, seat: int) -> tuple[dict[Pos, int], dict[Pos, Action]]:
    """Shortest paths for `seat` to every tile, and to every unexplored cell behind an open exit while the pile
    lasts: (moves needed, first action on the way).

    Monsters block the way (the thief slips past), the wizard walks through walls, portals connect for one move.
    """
    tiles = view.tiles
    start = view.players[seat].pos
    astral = view.has_skill(seat, Hero.WIZARD)
    thief = view.has_skill(seat, Hero.THIEF)
    portals = [p for p, t in tiles.items() if t.kind == Kind.PORTAL]
    explore = view.pile_left > 0
    dist = {start: 0}
    first: dict[Pos, Action] = {}
    frontier: dict[Pos, int] = {}
    queue = [start]
    for cur in queue:
        d = dist[cur]
        tile = tiles[cur]
        if cur != start and tile.monster and not thief:
            continue
        via = first.get(cur)
        if explore:
            for k in DIRS:
                if has_exit(tile.exits, k):
                    nb = step(cur, k)
                    if nb not in tiles and nb not in frontier:
                        frontier[nb] = d + 1
                        first[nb] = via or A.Explore(k)
        for k, nb in neighbours(tiles, cur, astral):
            if nb not in dist:
                dist[nb] = d + 1
                first[nb] = via or A.Move(k)
                queue.append(nb)
        if tile.kind == Kind.PORTAL and len(portals) > 1:
            for q in portals:
                if q not in dist:
                    dist[q] = d + 1
                    first[q] = via or A.Teleport(q)
                    queue.append(q)
    dist.update(frontier)
    return dist, first


def _u8(x: float) -> int:
    return round(255 * min(1.0, max(0.0, x)))


def encode_into(view: View, spatial: np.ndarray, glob: np.ndarray, mask: np.ndarray) -> tuple[int, dict[int, Action]]:
    """Fill the (zeroed or reused) buffers; returns my canvas cell and the legal actions by index."""
    spatial.fill(0)
    glob.fill(0.0)
    mask.fill(False)
    sp = spatial.reshape(N_SPATIAL, CELLS)
    frame = frame_for(view)
    me_seat = view.seat
    me = view.players[me_seat]
    n = len(view.players)
    tiles = view.tiles
    dist, first = paths(view, me_seat)
    moves = view.moves_left
    full = view.rules.moves

    # ------------------------------------------------------------ map planes
    for pos, t in tiles.items():
        c = frame.cell(pos)
        if c is None:
            continue
        sp[P_TILE, c] = 255
        sp[P_KIND + KINDS.index(t.kind), c] = 255
        for k in DIRS:
            if has_exit(t.exits, k):
                sp[P_EXIT + k, c] = 255
                if view.pile_left:
                    nb = step(pos, k)
                    if nb not in tiles and (fc := frame.cell(nb)) is not None:
                        sp[P_FRONTIER, fc] = 255
        if t.monster:
            sp[P_MONSTER + MONSTER_KEYS.index(t.monster), c] = 255
            sp[P_ODDS, c] = _u8(fight_odds(view, me_seat, t.monster))
        elif t.token == CHEST:
            sp[P_CHEST, c] = 255
        for item, count in Counter(t.items).items():
            sp[P_GEAR + GEAR_INDEX[item], c] = min(255, 85 * count)
    for pos, d in dist.items():
        c = frame.cell(pos)
        if c is None:
            continue
        sp[P_DIST, c] = _u8(1 - d / DIST_SCALE)
        if d <= moves:
            sp[P_REACH, c] = 255
        if d <= moves + full:
            sp[P_REACH_NEXT, c] = 255
    for s, p in enumerate(view.players):
        c = frame.cell(p.pos)
        if c is not None:
            sp[P_SEAT + relative(view, s), c] = 255
    if view.combat is not None and (c := frame.cell(Pos(*view.combat.back))) is not None:
        sp[P_BACK, c] = 255
    if view.pending is not None and (c := frame.cell(view.pending.pos)) is not None:
        sp[P_PENDING, c] = 255

    # ------------------------------------------------------------ global vector
    if view.phase in PHASES:
        glob[G_PHASE + PHASES.index(view.phase)] = 1
    glob[G_TABLE + n - 1] = 1
    glob[G_MOVES] = moves / full
    glob[G_MOVES + 1] = float(moves == full)
    glob[G_TURN] = min(view.turn / 300, 5.0)
    glob[G_TURN + 1] = min(view.turn / n / 100, 5.0)
    glob[G_PILE] = view.pile_left / 79
    glob[G_PILE + 1] = float(view.pile_left == 0)
    board = Counter(t.token for t in tiles.values() if t.token)
    for i, key in enumerate(TOKEN_KEYS):
        glob[G_BAG + i] = view.bag[key] / TOKEN_TOTAL[key]
        glob[G_BOARD + i] = board[key] / TOKEN_TOTAL[key]
    glob[G_BAG + len(TOKEN_KEYS)] = sum(view.bag.values()) / sum(TOKEN_TOTAL.values())
    best_other = max((p.points for s, p in enumerate(view.players) if s != me_seat), default=0)
    for s, p in enumerate(view.players):
        o = G_SEATS + relative(view, s) * SEAT_SIZE
        glob[o + F_PRESENT] = 1
        glob[o + F_HERO + HEROES.index(p.hero)] = 1
        glob[o + F_SKILL] = float(view.cursed != s)
        glob[o + F_HP + min(5, max(0, p.hp))] = 1
        glob[o + F_HP_FRAC] = p.hp / view.rules.max_hp
        glob[o + F_POWER] = p.power / 6
        for i, w in enumerate(("dagger", "sword", "axe")):
            glob[o + F_WEAPONS + i] = p.weapons.count(w) / 2
        glob[o + F_SPELLS] = p.spells.count("bolt") / 3
        glob[o + F_SPELLS + 1] = p.spells.count("healing") / 3
        glob[o + F_KEY] = len(p.keys)
        glob[o + F_POINTS] = p.points / 10
        glob[o + F_TREASURES] = len(p.treasures) / 5
        glob[o + F_RUBY] = float("ruby" in p.treasures)
        glob[o + F_KO] = float(p.knocked_out)
        glob[o + F_CURSED] = float(view.cursed == s)
        glob[o + F_CURRENT] = float(view.current == s)
        if p.pos in dist:
            glob[o + F_REACHABLE] = 1
            glob[o + F_DIST] = dist[p.pos] / DIST_SCALE
        glob[o + F_ON_HEAL] = float(tiles[p.pos].kind in HEALING)
        glob[o + F_LEAD] = (p.points - me.points) / 10
        glob[o + F_DRAGON_ODDS] = fight_odds(view, s, "dragon")
        glob[o + F_WITH_ME] = float(p.pos == me.pos)
    glob[G_CURSE_FREE] = float(view.cursed is None)
    glob[G_SCORE] = float(me.points + 3 > best_other)
    glob[G_SCORE + 1] = (me.points - best_other) / 10
    glob[G_DRAGON] = float(view.bag["dragon"] > 0)
    glob[G_DRAGON + 1] = float(board["dragon"] > 0)
    glob[G_FRONTIER] = sum(1 for pos in dist if pos not in tiles) / 20

    if view.combat is not None:
        c = view.combat
        o = G_FIGHT
        strength = MONSTERS[c.monster].strength
        oracle = 1 if view.has_skill(me_seat, Hero.ORACLE) and c.first_move else 0
        wizard = view.has_skill(me_seat, Hero.WIZARD)
        bolts = me.spells.count("bolt")
        bonus = me.power + oracle + (bolts if wizard else 0)
        glob[o] = 1
        glob[o + 1 + MONSTER_KEYS.index(c.monster)] = 1
        o += 1 + len(MONSTER_KEYS)
        glob[o] = strength / 15
        glob[o + 1] = bonus / 10
        glob[o + 2] = float(c.first_move)
        glob[o + 3] = float(c.can_sneak)
        glob[o + 4] = float(c.rerolled)
        glob[o + 5] = fight_odds(view, me_seat, c.monster, c.first_move)
        glob[o + 6] = 0 if wizard else bolts / 3
        glob[o + 7] = float(view.has_skill(me_seat, Hero.WARLOCK) and me.hp >= 1)
        glob[o + 8] = float(tiles[Pos(*c.back)].kind in HEALING)
        if c.dice:
            total = sum(c.dice) + bonus
            glob[o + 9] = 1
            glob[o + 10] = c.dice[0] / 6
            glob[o + 11] = c.dice[1] / 6
            glob[o + 12] = sum(c.dice) / 12
            glob[o + 13] = (total - strength) / 6
            glob[o + 14] = float(6 in c.dice)

    if view.pending is not None:
        pend = view.pending
        glob[G_PLACE + KINDS.index(pend.kind)] = 1
        for r in range(4):
            o = G_PLACE + len(KINDS) + 9 * r
            if r not in pend.rotations:
                continue
            m = rotate(pend.mask, r)
            glob[o] = 1
            opens = joins = walls = shut = 0
            for k in DIRS:
                nb = tiles.get(step(pend.pos, k))
                mine = has_exit(m, k)
                glob[o + 1 + k] = float(mine)
                if nb is None:
                    opens += mine
                elif has_exit(nb.exits, opposite(k)):
                    joins += mine
                    shut += not mine
                else:
                    walls += mine
            glob[o + 5 : o + 9] = (opens / 4, joins / 4, walls / 4, shut / 4)

    if view.offer:
        first_move = moves == full - 1
        for i, token in enumerate(view.offer[:2]):
            o = G_OFFER + i * (len(TOKEN_KEYS) + 1)
            glob[o + TOKEN_KEYS.index(token)] = 1
            if token in MONSTERS:
                glob[o + len(TOKEN_KEYS)] = fight_odds(view, me_seat, token, first_move)

    if view.loot_item is not None:
        glob[G_LOOT + GEAR_INDEX[view.loot_item]] = 1
    o = G_INVENTORY
    for i, w in enumerate(me.weapons[:2]):
        glob[o + 3 * i + ("dagger", "sword", "axe").index(w)] = 1
    o += 6
    for i, sp_name in enumerate(me.spells[:3]):
        glob[o + 2 * i + ("bolt", "healing").index(sp_name)] = 1
    glob[o + 6] = float(bool(me.keys))
    here = tiles[me.pos]
    for item, count in Counter(here.items).items():
        glob[G_HERE + GEAR_INDEX[item]] = count / 3
    o = G_HERE + len(GEAR)
    glob[o] = float(here.token == CHEST)
    glob[o + 1] = float(here.kind in HEALING)
    glob[o + 2] = float(here.kind == Kind.PORTAL)
    glob[o + 3] = sum(1 for k in DIRS if has_exit(here.exits, k) and step(me.pos, k) not in tiles) / 4

    # ------------------------------------------------------------ legal actions
    actions: dict[int, Action] = {}
    legal = set(view.legal)
    for a in view.legal:
        if isinstance(a, A.Move | A.Explore | A.Teleport):
            continue  # covered by destinations below
        idx = action_index(view, frame, a)
        if idx is not None:
            actions[idx] = a
    for pos, a in first.items():
        if a in legal and (c := frame.cell(pos)) is not None:
            actions[c] = a  # `go` plane: head for this cell, taking the first step of a shortest path
    mask[list(actions)] = True
    me_cell = frame.cell(me.pos)
    return (me_cell if me_cell is not None else 0), actions


def action_index(view: View, frame: Frame, a: Action) -> int | None:
    """Index of a legal action in the fixed action space (None if its target is off the canvas)."""
    me = view.players[view.seat]

    def plane(k: int, pos: Pos) -> int | None:
        c = frame.cell(pos)
        return None if c is None else k * CELLS + c

    f = N_SPATIAL_ACTIONS
    match a:
        case A.Move(d) | A.Explore(d):
            return plane(0, step(me.pos, d))
        case A.Teleport(to):
            return plane(0, Pos(*to))
        case A.Reincarnate(at):
            return plane(1, Pos(*at))
        case A.CastHealing(seat, at):
            return plane(2 + relative(view, seat), Pos(*at))
        case A.Place(r):
            return f + A_PLACE + r
        case A.Swap(seat):
            return f + A_SWAP + relative(view, seat) - 1
        case A.ChooseToken(i):
            return f + A_CHOOSE + i
        case A.Roll():
            return f + A_ROLL
        case A.Reroll():
            return f + A_REROLL
        case A.Sneak():
            return f + A_SNEAK
        case A.Strike(bolts, sacrifice):
            return f + A_STRIKE + 2 * bolts + int(sacrifice)
        case A.Loot(drop):
            return f + A_LOOT + (0 if drop is None else drop + 1)
        case A.Curse(seat):
            return f + A_CURSE + (MAX_SEATS - 1 if seat is None else relative(view, seat) - 1)
        case A.Pickup(i, drop):
            item = view.tiles[me.pos].items[i]
            return f + A_PICKUP + 4 * GEAR_INDEX[item] + (0 if drop is None else drop + 1)
        case A.OpenChest():
            return f + A_OPEN
        case A.EndTurn():
            return f + A_END
    return None


def label_index(view: View, actions: dict[int, Action], action: Action, goal: Pos | None = None) -> int:
    """Index of another player's choice (e.g. the teacher's), heading for `goal` if it says where it was going."""
    frame = frame_for(view)
    if goal is not None and isinstance(action, A.Move | A.Explore | A.Teleport):
        c = frame.cell(goal)
        if c is not None and actions.get(c) == action:
            return c
    idx = action_index(view, frame, action)
    if idx is not None and actions.get(idx) == action:
        return idx
    return next((i for i, a in actions.items() if a == action), -1)


@dataclass
class Encoded:
    spatial: np.ndarray
    glob: np.ndarray
    mask: np.ndarray
    me: int
    actions: dict[int, Action]


def encode(view: View) -> Encoded:
    spatial = np.zeros((N_SPATIAL, S, S), dtype=np.uint8)
    glob = np.zeros(N_GLOBAL, dtype=np.float32)
    mask = np.zeros(N_ACTIONS, dtype=bool)
    me, actions = encode_into(view, spatial, glob, mask)
    return Encoded(spatial, glob, mask, me, actions)
