"""How often does a bot use each active hero skill when it is available?

uv run python scripts/skill_usage.py [ai:runs/<run>/policy_best.npz] [-n 40]
"""

import argparse
import random
from collections import Counter

from karak.bots import make_bot
from karak.game import actions as A
from karak.game.engine import Game, Phase
from karak.game.model import Hero

ap = argparse.ArgumentParser()
ap.add_argument("bots", nargs="*", default=["champion"])
ap.add_argument("-n", type=int, default=40)
args = ap.parse_args()


def skill(view, action) -> str | None:
    """The skill a legal action belongs to, if any."""
    match action:
        case A.Swap():
            return "warlock swap"
        case A.Strike(_, True):
            return "warlock blood price"
        case A.Reroll():
            return "warrior reroll"
        case A.Sneak():
            return "thief sneak"
        case A.Move(d) if view.has_skill(view.seat, Hero.WIZARD):
            from karak.game.rules import connected

            return None if connected(view.tiles, view.players[view.seat].pos, d) else "wizard phase walk"
    return None


for key in args.bots:
    offered: Counter[str] = Counter()
    used: Counter[str] = Counter()
    for seed in range(args.n):
        heroes = random.Random(seed).sample(list(Hero), 3)
        bots = [make_bot(key, seed * 10 + i) for i in range(3)]
        g = Game(heroes, seed=seed)
        while g.phase != Phase.GAME_OVER and g.turn < 600:
            s = g.current
            v = g.view(s)
            a = bots[s].act(v)
            for k in {skill(v, x) for x in v.legal} - {None}:
                offered[k] += 1
            if (k := skill(v, a)) is not None:
                used[k] += 1
            g.step(s, a)
    print(key)
    for k in sorted(offered):
        print(f"  {k:22} available {offered[k]:6}  used {used[k]:5}  ({used[k] / offered[k]:.1%})")
