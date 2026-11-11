"""Pit Champion config variants against two opponents (seats rotate, random heroes).

uv run python scripts/tune.py [--vs champion] [-n 400]
"""

import argparse
import random
from concurrent.futures import ProcessPoolExecutor

from karak.bots import REGISTRY, PlannerBot, PlannerConfig, make_bot
from karak.game.model import Hero
from karak.runner import play_game

VARIANTS = {
    "base": PlannerConfig(),
    "d25": PlannerConfig(dragon_risk=0.25),
    "d05": PlannerConfig(dragon_risk=0.05),
}


def one(args: tuple[str, str, int]) -> tuple[str, float, int]:
    name, rival, seed = args
    seats = ["x", rival, rival]
    shift = seed % 3
    seats = seats[shift:] + seats[:shift]
    bots = [
        PlannerBot(seed * 7 + i, VARIANTS[name]) if k == "x" else make_bot(k, seed * 7 + i) for i, k in enumerate(seats)
    ]
    heroes = random.Random(seed).sample(list(Hero), 3)
    g = play_game(bots, heroes, seed=seed)
    assert g.result is not None
    x = seats.index("x")
    return name, (1 / len(g.result.winners)) if x in g.result.winners else 0.0, g.turn


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--vs", default="champion", choices=list(REGISTRY))
    ap.add_argument("-n", type=int, default=400)
    args = ap.parse_args()
    jobs = [(name, args.vs, seed) for name in VARIANTS for seed in range(args.n)]
    share = dict.fromkeys(VARIANTS, 0.0)
    turns = dict.fromkeys(VARIANTS, 0)
    with ProcessPoolExecutor(8) as ex:
        for name, won, t in ex.map(one, jobs, chunksize=16):
            share[name] += won
            turns[name] += t
    for name in VARIANTS:
        print(f"{name:10} win share {share[name] / args.n:.3f} (fair 0.333) · mean turns {turns[name] / args.n:.0f}")
