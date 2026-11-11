"""A trained network as a bot (numpy forward, no torch)."""

from __future__ import annotations

from functools import cache
from pathlib import Path

import numpy as np

from karak.bots.base import Bot
from karak.game.actions import Action
from karak.game.engine import View
from karak.nn.encoding import encode
from karak.nn.forward import Policy


@cache
def load_policy(path: str) -> Policy:
    return Policy(path)


class NeuralBot(Bot):
    def __init__(self, path: str | Path, seed: int | None = None, greedy: bool = True) -> None:
        super().__init__(seed)
        self.policy = load_policy(str(path))
        self.greedy = greedy

    def act(self, view: View) -> Action:
        if len(view.legal) == 1:
            return view.legal[0]
        e = encode(view)
        if not e.actions:
            return view.legal[0]
        logits, _ = self.policy.forward(e.spatial, e.glob, e.me)
        idx = list(e.actions)
        scores = logits[idx]
        if self.greedy:
            return e.actions[idx[int(np.argmax(scores))]]
        p = np.exp(scores - scores.max())
        return e.actions[self.rng.choices(idx, weights=p.tolist())[0]]
