"""Pure helpers shared by bots and the web layer: fight odds and paths through the labyrinth."""

from __future__ import annotations

from collections.abc import Mapping
from functools import cache

from karak.game.model import DIRS, Pos, Tile, has_exit, opposite, step


@cache
def _two_dice(steady: bool) -> tuple[tuple[int, float], ...]:
    faces = range(2, 7) if steady else range(1, 7)
    p = 1 / len(faces) ** 2
    dist: dict[int, float] = {}
    for a in faces:
        for b in faces:
            dist[a + b] = dist.get(a + b, 0.0) + p
    return tuple(sorted(dist.items()))


@cache
def win_chance(need: int, steady: bool = False, ties_win: bool = False, reroll: bool = False) -> float:
    """Chance that two dice reach `need` (= monster strength - bonuses) and win.

    `steady`: ones are rolled again (swordsman). `ties_win`: thief. `reroll`: warrior throws again after a miss.
    """
    target = need if ties_win else need + 1
    p = sum(q for total, q in _two_dice(steady) if total >= target)
    return p + (1 - p) * p if reroll else p


def connected(tiles: Mapping[Pos, Tile], a: Pos, d: int) -> bool:
    b = step(a, d)
    return b in tiles and has_exit(tiles[a].exits, d) and has_exit(tiles[b].exits, opposite(d))


def neighbours(tiles: Mapping[Pos, Tile], a: Pos, astral: bool = False) -> list[tuple[int, Pos]]:
    out = []
    for d in DIRS:
        b = step(a, d)
        if b in tiles and (astral or connected(tiles, a, d)):
            out.append((d, b))
    return out
