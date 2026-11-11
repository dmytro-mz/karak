"""Goal-driven dungeon bot: every decision searches the discovered labyrinth and walks towards the best goal.

Goals are monsters worth fighting (by exact win chance), chests when holding a key, better equipment on the
floor, a fountain when hurt or cursed, and unexplored passages. One `PlannerBot` class, three configurations.
"""

from __future__ import annotations

from dataclasses import dataclass

from karak.bots.base import Bot
from karak.game import actions as A
from karak.game.actions import Action
from karak.game.engine import Phase, View
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
    has_exit,
    rotate,
    step,
)
from karak.game.rules import neighbours, win_chance


@dataclass(frozen=True)
class PlannerConfig:
    risk: float = 0.35  # minimum win chance to pick a fight on purpose
    dragon_risk: float = 0.15  # minimum win chance against the dragon
    smart_loot: bool = True
    heal_at: int = 2  # head for a fountain at this many HP or fewer
    cast_heal_at: int = 1
    curse_leader: bool = True
    explore_value: float = 2.2
    distance_cost: float = 0.45
    noise: float = 0.0  # random jitter on goal scores
    swap: bool = True  # warlock: use the shadow swap
    swap_margin: float = 0.5  # how much better the other tile must look (tuned with scripts/tune_swap.py)


@dataclass
class _Goal:
    score: float
    first: Action
    what: str
    pos: Pos


def _weapon_gain(weapons: list[str], new: str) -> int:
    power = ITEMS[new].power
    if len(weapons) < SLOTS[ITEMS[new].slot]:  # type: ignore[index]
        return power
    return power - min(ITEMS[w].power for w in weapons)


class PlannerBot(Bot):
    def __init__(self, seed: int | None = None, config: PlannerConfig | None = None) -> None:
        super().__init__(seed)
        self.cfg = config or PlannerConfig()
        self.goal: Pos | None = None  # where the last move was heading (read by imitation learning)

    # ------------------------------------------------------------------ entry
    def act(self, view: View) -> Action:
        self.goal = None
        legal = view.legal
        if len(legal) == 1:
            return legal[0]
        match view.phase:
            case Phase.PLACE:
                return self._place(view)
            case Phase.CHOOSE_TOKEN:
                return self._choose_token(view)
            case Phase.COMBAT:
                return self._combat(view)
            case Phase.ROLLED:
                return self._rolled(view)
            case Phase.LOOT:
                return self._loot(view)
            case Phase.CURSE:
                return self._curse(view)
            case Phase.REINCARNATE:
                return self.rng.choice(legal)
        return self._turn(view)

    # ------------------------------------------------------------------ helpers
    def _me(self, view: View):
        return view.players[view.seat]

    def _skill(self, view: View, hero: Hero) -> bool:
        return view.has_skill(view.seat, hero)

    def fight_chance(self, view: View, monster: str, first_move: bool = False) -> float:
        me = self._me(view)
        bonus = me.power + me.spells.count("bolt")
        if self._skill(view, Hero.ORACLE) and first_move:
            bonus += 1
        if self._skill(view, Hero.WARLOCK) and me.hp > 1:
            bonus += 1
        return win_chance(
            MONSTERS[monster].strength - bonus,
            steady=self._skill(view, Hero.SWORDSMAN),
            ties_win=self._skill(view, Hero.THIEF),
            reroll=self._skill(view, Hero.WARRIOR),
        )

    def _ruby_wins(self, view: View) -> bool:
        mine = self._me(view).points + ITEMS["ruby"].points
        others = [p.points for s, p in enumerate(view.players) if s != view.seat]
        return not others or mine > max(others)

    def _loot_value(self, view: View, item: str) -> float:
        me = self._me(view)
        d = ITEMS[item]
        if d.slot is None:
            return 6.0 if item == "treasure" else (14.0 if self._ruby_wins(view) else -6.0)
        if d.slot.value == "weapon":
            return 2.4 * max(0, _weapon_gain(me.weapons, item))
        if d.slot.value == "spell":
            if len(me.spells) >= SLOTS[d.slot]:
                return 0.3
            return 2.0 if item == "bolt" else 1.4
        if me.keys:
            return 0.2
        chests = sum(1 for t in view.tiles.values() if t.token == CHEST) + view.bag[CHEST]
        return 4.0 if chests else 0.2

    def _nothing_left(self, view: View) -> bool:
        """The labyrinth is complete and only the dragon still holds anything worth taking."""
        if view.pile_left:
            return False
        me = self._me(view)
        for t in view.tiles.values():
            if t.token == CHEST and (me.keys or any(x.token == "turnkey" for x in view.tiles.values())):
                return False
            if t.token == "fallen":
                return False
        return True

    def _monster_value(self, view: View, monster: str, chance: float) -> float:
        me = self._me(view)
        if monster == "dragon":
            if chance < self.cfg.dragon_risk:
                return -10.0
            if self._ruby_wins(view):
                return chance * 14.0 - (1 - chance) * 1.5
            if self._nothing_left(view) or view.turn > 60 * len(view.players):
                return chance * 5.0 - (1 - chance) * 1.5
            return -10.0
        elif chance < self.cfg.risk:
            return -10.0
        gain = self._loot_value(view, MONSTERS[monster].loot)
        if monster == "mummy":
            gain += 0.8 if self.cfg.curse_leader else 0.2
        hurt = 3.0 if me.hp <= 1 else 1.2
        return chance * (gain + 1.0) - (1 - chance) * hurt

    # ------------------------------------------------------------------ phases
    def _place(self, view: View) -> Action:
        pend = view.pending
        assert pend is not None
        best, best_score = view.legal[0], -1.0
        for a in view.legal:
            assert isinstance(a, A.Place)
            mask = rotate(pend.mask, a.rotation)
            score = sum(1 for d in DIRS if has_exit(mask, d) and step(pend.pos, d) not in view.tiles)
            score += self.rng.random() * 0.5
            if score > best_score:
                best, best_score = a, score
        return best

    def _choose_token(self, view: View) -> Action:
        me = self._me(view)
        first = view.moves_left == view.rules.moves - 1

        def score(token: str) -> float:
            if token == CHEST:
                return 5.0 if me.keys else 1.0
            chance = self.fight_chance(view, token, first)
            return chance * (self._loot_value(view, MONSTERS[token].loot) + 1) - (1 - chance) * 2

        return max(view.legal, key=lambda a: score(view.offer[a.index]))  # type: ignore[union-attr]

    def _combat(self, view: View) -> Action:
        c = view.combat
        assert c is not None
        if A.Sneak() in view.legal:
            chance = self.fight_chance(view, c.monster, c.first_move)
            if self._monster_value(view, c.monster, chance) <= 0:
                return A.Sneak()
        return A.Roll()

    def _rolled(self, view: View) -> Action:
        c = view.combat
        assert c is not None
        me = self._me(view)
        strength = MONSTERS[c.monster].strength
        foresight = 1 if self._skill(view, Hero.ORACLE) and c.first_move else 0
        wizard = self._skill(view, Hero.WIZARD)
        bolts = 0 if wizard else me.spells.count("bolt")
        total = sum(c.dice) + me.power + foresight + (me.spells.count("bolt") if wizard else 0)
        ties = self._skill(view, Hero.THIEF)
        need = strength - total + (0 if ties else 1)  # extra points still missing for a win
        can_sacrifice = A.Strike(0, True) in view.legal and (me.hp > 1 or c.monster == "dragon")
        if need <= 0:
            return A.Strike(0, False)
        if A.Reroll() in view.legal and (need > 2 or need > bolts + (1 if can_sacrifice else 0)):
            return A.Reroll()
        if need <= bolts:
            return A.Strike(need, False)
        if can_sacrifice and need <= bolts + 1:
            return A.Strike(bolts, True)
        if me.hp <= 1 and bolts and need - 1 <= bolts and not ties:
            return A.Strike(need - 1, False)  # a tie at least keeps the last HP
        return A.Strike(0, False)

    def _loot(self, view: View) -> Action:
        item = view.loot_item
        assert item is not None
        me = self._me(view)
        slot = ITEMS[item].slot
        assert slot is not None
        owned = me.slot(slot)
        if not self.cfg.smart_loot:
            return self.rng.choice(view.legal)
        if slot.value == "weapon":
            weakest = min(range(len(owned)), key=lambda i: ITEMS[owned[i]].power)
            return A.Loot(weakest) if ITEMS[item].power > ITEMS[owned[weakest]].power else A.Loot(None)
        if slot.value == "spell" and item == "bolt" and "healing" in owned and owned.count("healing") > 1:
            return A.Loot(owned.index("healing"))
        return A.Loot(None)

    def _curse(self, view: View) -> Action:
        others = [a for a in view.legal if isinstance(a, A.Curse) and a.seat is not None]
        if not self.cfg.curse_leader:
            return self.rng.choice(others)

        def threat(seat: int) -> tuple[int, int]:
            p = view.players[seat]
            return (p.points, p.power + len(p.spells))

        leader = max((a.seat for a in others), key=lambda s: threat(s))  # type: ignore[arg-type]
        if view.cursed is not None and view.cursed != view.seat and threat(view.cursed) >= threat(leader):
            return A.Curse(None)
        return A.Curse(leader)

    # ------------------------------------------------------------------ turn
    def _turn(self, view: View) -> Action:
        legal = view.legal
        me = self._me(view)
        here = view.tiles[me.pos]
        if A.OpenChest() in legal:
            return A.OpenChest()
        pickup = self._best_pickup(view)
        if pickup is not None:
            return pickup
        if here.kind in HEALING and (me.hp < view.rules.max_hp - 1 or view.cursed == view.seat):
            return A.EndTurn()
        heal = self._self_heal(view)
        if heal is not None:
            return heal
        swap = self._swap(view)
        if swap is not None:
            return swap
        goal = self._best_goal(view)
        if A.EndTurn() not in legal:  # standing on a monster the thief slipped past: must move on
            if goal is not None:
                self.goal = goal.pos
                return goal.first
            a = next(a for a in legal if isinstance(a, A.Move | A.Explore | A.Teleport))
            self.goal = a.to if isinstance(a, A.Teleport) else step(me.pos, a.dir)
            return a
        if goal is None or goal.score <= 0:
            return A.EndTurn()
        self.goal = goal.pos
        return goal.first

    def _best_pickup(self, view: View) -> Action | None:
        me = self._me(view)
        here = view.tiles[me.pos]
        best: tuple[float, Action] | None = None
        for a in view.legal:
            if not isinstance(a, A.Pickup):
                continue
            item = here.items[a.index]
            slot = ITEMS[item].slot
            assert slot is not None
            owned = me.slot(slot)
            if a.drop is None:
                value = self._loot_value(view, item)
            elif slot.value == "weapon":
                value = 2.4 * (ITEMS[item].power - ITEMS[owned[a.drop]].power)
            else:
                value = -1.0
            if value > 0.5 and (best is None or value > best[0]):
                best = (value, a)
        return best[1] if best else None

    def _self_heal(self, view: View) -> Action | None:
        me = self._me(view)
        if "healing" not in me.spells or me.hp > self.cfg.cast_heal_at:
            return None
        casts = [a for a in view.legal if isinstance(a, A.CastHealing) and a.seat == view.seat]
        return casts[0] if casts else None

    def _swap(self, view: View) -> Action | None:
        """Warlock: trade places when the other hero's tile is clearly a better place to be than anywhere this
        turn's moves lead (the swap uses up the moves, so goals from there count from the next turn)."""
        swaps = [a for a in view.legal if isinstance(a, A.Swap)]
        if not swaps or not self.cfg.swap:
            return None
        me = self._me(view)
        stay = self._best_goal(view)
        best: tuple[float, Action] | None = None
        for a in swaps:
            there = view.players[a.seat].pos
            tile = view.tiles[there]
            now = max((self._loot_value(view, i) for i in tile.items), default=0.0)
            if tile.token == CHEST and me.keys:
                now = max(now, 7.0)
            goal = self._best_goal(view, start=there)
            score = (now if now > 0.5 else 0.0) + max(0.0, goal.score if goal else 0.0) / 1.3
            if best is None or score > best[0]:
                best = (score, a)
        assert best is not None
        return best[1] if best[0] > max(0.0, stay.score if stay else 0.0) + self.cfg.swap_margin else None

    def _search(
        self, view: View, start: Pos | None = None
    ) -> tuple[dict[Pos, tuple[int, Action | None]], list[tuple[Pos, int, Action]]]:
        """Reachable tiles: pos -> (moves, first action). Plus frontier exits: (pos, cost to explore, first)."""
        me = self._me(view)
        astral = self._skill(view, Hero.WIZARD)
        thief = self._skill(view, Hero.THIEF)
        portals = [p for p, t in view.tiles.items() if t.kind == Kind.PORTAL]
        start = start or me.pos
        best: dict[Pos, tuple[int, Action | None]] = {start: (0, None)}
        queue = [start]
        frontier: list[tuple[Pos, int, Action]] = []
        can_explore = view.pile_left > 0
        for cur in queue:
            cost, first = best[cur]
            tile = view.tiles[cur]
            if cur != start and tile.monster and not thief:
                continue  # can't walk past a monster
            for d in DIRS:
                nb = step(cur, d)
                if nb not in view.tiles and can_explore and has_exit(tile.exits, d):
                    frontier.append((nb, cost + 1, first or A.Explore(d)))
            for d, nb in neighbours(view.tiles, cur, astral):
                if nb not in best:
                    best[nb] = (cost + 1, first or A.Move(d))
                    queue.append(nb)
            if tile.kind == Kind.PORTAL and len(portals) > 1:
                for q in portals:
                    if q not in best:
                        best[q] = (cost + 1, first or A.Teleport(q))
                        queue.append(q)
        return best, frontier

    def _best_goal(self, view: View, start: Pos | None = None) -> _Goal | None:
        """The best goal from the hero's tile, or from `start` with a fresh turn (no legality check there)."""
        me = self._me(view)
        reach, frontier = self._search(view, start)
        legal = set(view.legal) if start is None else None
        moves = view.moves_left if start is None else view.rules.moves
        goals: list[_Goal] = []
        cursed = view.cursed == view.seat
        need_heal = me.hp <= self.cfg.heal_at or cursed
        for pos, (cost, first) in reach.items():
            if first is None or (legal is not None and first not in legal):
                continue
            tile = view.tiles[pos]
            turns = 1 + max(0, cost - moves + view.rules.moves - 1) // max(1, view.rules.moves)

            def far(value: float, cost: int = cost, turns: int = turns) -> float:
                return value / (1 + 0.3 * (turns - 1)) - self.cfg.distance_cost * 0.25 * cost

            if tile.monster:
                chance = self.fight_chance(view, tile.monster, first_move=cost == 1 and moves == view.rules.moves)
                value = self._monster_value(view, tile.monster, chance)
                goals.append(_Goal(far(value), first, f"fight {tile.monster}", pos))
            elif tile.token == CHEST and me.keys:
                goals.append(_Goal(far(7.0), first, "chest", pos))
            if tile.items:
                value = max(self._loot_value(view, i) for i in tile.items)
                if value > 0.5:
                    goals.append(_Goal(far(value), first, "pickup", pos))
            if tile.kind in HEALING and need_heal:
                goals.append(_Goal(far(5.0 + (view.rules.max_hp - me.hp)), first, "heal", pos))
        for pos, cost, first in frontier:
            if (legal is not None and first not in legal) or cost > moves + 3:
                continue
            value = self.cfg.explore_value
            if view.bag["dragon"] and self._ruby_wins(view):
                value += 0.4
            if need_heal and me.hp <= 1:
                value -= 2.0
            value += self.rng.random() * 0.3
            goals.append(_Goal(value - self.cfg.distance_cost * cost, first, f"explore {pos}", pos))
        if not goals:
            return None
        if self.cfg.noise:
            for g in goals:
                g.score += self.rng.uniform(-self.cfg.noise, self.cfg.noise)
        return max(goals, key=lambda g: g.score)
