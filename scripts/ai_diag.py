"""Where does a policy differ from the Champion? Plays `ai` vs champions and tallies disagreements per phase.

uv run python scripts/ai_diag.py runs/<run>/policy_latest.npz [-n 20]
"""

import argparse
import random
from collections import Counter

from karak.bots import make_bot
from karak.game.engine import Game, Phase
from karak.game.model import Hero

ap = argparse.ArgumentParser()
ap.add_argument("policy")
ap.add_argument("-n", type=int, default=20)
ap.add_argument("--players", type=int, default=3)
args = ap.parse_args()

seen: Counter[str] = Counter()
differ: Counter[str] = Counter()
kinds: Counter[tuple[str, str]] = Counter()
wins = 0.0
turns = []
points = []
for seed in range(args.n):
    n = args.players
    heroes = random.Random(seed).sample(list(Hero), n)
    ai_seat = seed % n
    bots = [make_bot("champion", seed * 10 + i) for i in range(n)]
    ai = make_bot(f"ai:{args.policy}", seed)
    teacher = make_bot("champion", 999 + seed)
    g = Game(heroes, seed=seed)
    while g.phase != Phase.GAME_OVER:
        s = g.current
        v = g.view(s)
        if s == ai_seat and len(v.legal) > 1:
            a = ai.act(v)
            t = teacher.act(v)
            seen[v.phase] += 1
            if a != t:
                differ[v.phase] += 1
                kinds[(type(t).__name__, type(a).__name__)] += 1
        else:
            a = bots[s].act(v)
        g.step(s, a)
    assert g.result is not None
    wins += (1 / len(g.result.winners) if ai_seat in g.result.winners else 0) * n
    turns.append(g.turn)
    points.append(g.players[ai_seat].points / 2)
print(f"win×n {wins / args.n:.2f}  mean turns {sum(turns) / len(turns):.0f}  ai points {sum(points) / len(points):.2f}")
for ph in seen:
    print(f"{ph:14} {seen[ph]:6} decisions, differ {differ[ph] / seen[ph]:.0%}")
print("champion -> ai (most common disagreements):")
for (t, a), c in kinds.most_common(12):
    print(f"  {t:12} -> {a:12} {c}")
