"""Does the Warlock's swap pay? A Warlock champion variant against two champions that never swap.

uv run python scripts/tune_swap.py [-n 600] [--players 3]
"""

import argparse
import random
from concurrent.futures import ProcessPoolExecutor

from karak.bots import PlannerBot, PlannerConfig
from karak.game.model import Hero
from karak.runner import play_game

VARIANTS = {
    "no swap": PlannerConfig(swap=False),
    "margin -0.5": PlannerConfig(swap_margin=-0.5),
    "margin 0": PlannerConfig(swap_margin=0.0),
    "margin 0.25": PlannerConfig(swap_margin=0.25),
    "margin 0.5": PlannerConfig(swap_margin=0.5),
}


def one(args: tuple[str, int, int]) -> tuple[str, float]:
    name, seed, n = args
    seat = seed % n
    others = random.Random(seed).sample([h for h in Hero if h != Hero.WARLOCK], n - 1)
    heroes = [*others[:seat], Hero.WARLOCK, *others[seat:]]
    bots = [PlannerBot(seed * 7 + i, VARIANTS[name] if i == seat else PlannerConfig(swap=False)) for i in range(n)]
    g = play_game(bots, heroes, seed=seed)
    assert g.result is not None
    won = 1 / len(g.result.winners) if seat in g.result.winners and g.dragon_slain_by is not None else 0.0
    return name, won * n


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("-n", type=int, default=600)
    ap.add_argument("--players", type=int, default=3)
    args = ap.parse_args()
    jobs = [(name, seed, args.players) for name in VARIANTS for seed in range(args.n)]
    total = dict.fromkeys(VARIANTS, 0.0)
    with ProcessPoolExecutor(10) as ex:
        for name, w in ex.map(one, jobs, chunksize=8):
            total[name] += w
    for name in VARIANTS:
        print(f"{name:12} warlock win × n {total[name] / args.n:.3f}")
