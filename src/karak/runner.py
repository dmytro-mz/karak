from __future__ import annotations

from collections.abc import Sequence

from karak.bots.base import Bot
from karak.game.engine import Game, Phase, RulesConfig
from karak.game.model import Hero


def play_game(
    bots: Sequence[Bot], heroes: Sequence[Hero] | None = None, seed: int | None = None, rules: RulesConfig | None = None
) -> Game:
    heroes = list(heroes) if heroes is not None else list(Hero)[: len(bots)]
    game = Game(heroes, seed=seed, rules=rules)
    while game.phase != Phase.GAME_OVER:
        seat = game.current
        game.step(seat, bots[seat].act(game.view(seat)))
    return game
