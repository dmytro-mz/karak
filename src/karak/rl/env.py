"""One Karak table for training: policy-controlled seats talk to the trainer, bot seats play inside `step`.

Seat controllers:
- "learner": the network being trained (policy id 0); every decision becomes a training sample.
- "snapshot": a frozen earlier version of the learner (policy id 1..n_snapshots); not trained.
- any bot registry key ("champion", ...): plays inside the env.

The primary seat (random each game) is always the learner; the others are drawn from `EnvConfig.opponents`.
Decisions with a single legal action are played automatically and never reach the trainer.

Rewards (learner seats only): the game result, +1 for a win and -1/(n-1) for a loss (ties split; zero-sum over
the table), plus potential-based shaping on the treasure lead that cancels out exactly at the end of the game.
A game stopped by the turn limit has no winner (0 for everyone): real games only end with the Dragon, so
stalling while ahead must not pay.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Literal

import numpy as np

from karak.bots import Bot, make_bot
from karak.game.actions import Action
from karak.game.engine import Game, Phase, RulesConfig
from karak.game.model import Hero
from karak.nn.encoding import encode_into, label_index

LEARNER = "learner"
SNAPSHOT = "snapshot"
SELF = "self"  # opponents key: another learner seat (shared weights, trained)

Event = tuple[int, float, bool]  # (seat, reward, game over)


@dataclass
class EnvConfig:
    table_sizes: dict[int, float] = field(default_factory=lambda: {2: 1.0, 3: 1.0, 4: 1.0, 5: 1.0})
    opponents: dict[str, float] = field(default_factory=lambda: {"champion": 1.0})
    behavior: Literal["policy", "teacher"] = "policy"  # teacher: learner seats play the teacher's moves (imitation)
    teacher: str | None = "champion"  # labels every learner decision with this bot's choice
    max_turns: int = 600
    shaping: float = 0.05  # potential = shaping * (my half points - rivals' mean)

    def __post_init__(self) -> None:
        self.table_sizes = {int(k): float(v) for k, v in self.table_sizes.items() if v > 0}
        self.opponents = {str(k): float(v) for k, v in self.opponents.items() if v > 0}
        if not self.table_sizes or not set(self.table_sizes) <= {2, 3, 4, 5}:
            raise ValueError("table_sizes: weights for 2-5 players")
        if not self.opponents:
            raise ValueError("opponents needs at least one positive weight")
        if self.behavior == "teacher" and self.teacher is None:
            raise ValueError("behavior 'teacher' needs a teacher")


@dataclass(frozen=True)
class EpisodeSpec:
    """A fixed game for evaluation."""

    seed: int
    heroes: tuple[Hero, ...]
    controllers: tuple[str, ...]


@dataclass
class Decision:
    """What the trainer needs besides the observation buffers."""

    policy: int  # 0 learner, k >= 1 snapshot k, -1 idle (evaluation finished)
    seat: int
    label: int  # teacher's action index, -1 if none
    me: int
    events: list[Event]
    episodes: list[dict[str, float]]


class KarakEnv:
    def __init__(self, config: EnvConfig, seed: int = 0, specs: list[EpisodeSpec] | None = None) -> None:
        self.cfg = config
        self.rng = random.Random(seed)
        self.specs = list(specs) if specs is not None else None
        self.n_snapshots = 0
        self.game: Game | None = None
        self.controllers: list[str] = []
        self.snapshot_ids: dict[int, int] = {}
        self.bots: dict[int, Bot] = {}
        self.teacher: Bot | None = None
        self.phi: list[float] = []
        self.actions: dict[int, Action] = {}
        self.teacher_action: Action | None = None
        self.spec_id = -1
        self._events: list[Event] = []
        self._episodes: list[dict[str, float]] = []

    # ------------------------------------------------------------------ api
    def reset(self, spatial: np.ndarray, glob: np.ndarray, mask: np.ndarray) -> Decision:
        self._events, self._episodes = [], []
        self._new_episode()
        return self._advance(spatial, glob, mask)

    def step(self, action: int, spatial: np.ndarray, glob: np.ndarray, mask: np.ndarray) -> Decision:
        self._events, self._episodes = [], []
        game = self.game
        if game is None:
            return self._idle()
        if action < 0 or action not in self.actions:
            if self.teacher_action is None:
                raise ValueError(f"action {action} is not legal here")
            chosen = self.teacher_action
        else:
            chosen = self.actions[action]
        self._play(game.current, chosen)
        return self._advance(spatial, glob, mask)

    # ------------------------------------------------------------------ episodes
    def _new_episode(self) -> None:
        if self.specs is not None:
            if not self.specs:
                self.game = None
                return
            spec = self.specs.pop(0)
            self.spec_id += 1
            seed, heroes, controllers = spec.seed, list(spec.heroes), list(spec.controllers)
        else:
            sizes = list(self.cfg.table_sizes)
            n = self.rng.choices(sizes, [self.cfg.table_sizes[s] for s in sizes])[0]
            heroes = self.rng.sample(list(Hero), n)
            controllers = [self._draw_opponent() for _ in range(n)]
            controllers[self.rng.randrange(n)] = LEARNER
            seed = self.rng.randrange(2**62)
        rng = random.Random(seed ^ 0x5EED)
        self.controllers = controllers
        self.bots = {
            s: make_bot(c, rng.randrange(2**31)) for s, c in enumerate(controllers) if c not in (LEARNER, SNAPSHOT)
        }
        self.snapshot_ids = {
            s: 1 + rng.randrange(max(1, self.n_snapshots)) for s, c in enumerate(controllers) if c == SNAPSHOT
        }
        self.teacher = make_bot(self.cfg.teacher, rng.randrange(2**31)) if self.cfg.teacher else None
        self.game = Game(heroes, seed=seed, rules=RulesConfig(max_turns=self.cfg.max_turns))
        self.phi = self._potentials()

    def _draw_opponent(self) -> str:
        keys = [k for k in self.cfg.opponents if k != SNAPSHOT or self.n_snapshots]
        if not keys:
            return LEARNER
        key = self.rng.choices(keys, [self.cfg.opponents[k] for k in keys])[0]
        return LEARNER if key == SELF else key

    def _potentials(self) -> list[float]:
        assert self.game is not None
        pts = [p.points for p in self.game.players]
        n = len(pts)
        total = sum(pts)
        return [self.cfg.shaping * (pts[s] - (total - pts[s]) / (n - 1)) for s in range(n)]

    def _idle(self) -> Decision:
        return Decision(-1, -1, -1, 0, self._events, self._episodes)

    # ------------------------------------------------------------------ flow
    def _play(self, seat: int, action: Action) -> None:
        game = self.game
        assert game is not None
        game.step(seat, action)
        phi = self._potentials()
        for s, c in enumerate(self.controllers):
            if c == LEARNER and phi[s] != self.phi[s]:
                self._events.append((s, phi[s] - self.phi[s], False))
        self.phi = phi
        if game.phase == Phase.GAME_OVER:
            self._finish()

    def _finish(self) -> None:
        game = self.game
        assert game is not None and game.result is not None
        n = game.n
        timeout = game.dragon_slain_by is None
        winners = [] if timeout else game.result.winners
        for s, c in enumerate(self.controllers):
            share = 1 / len(winners) if s in winners else 0.0
            outcome = 0.0 if timeout else share - (1 - share) / (n - 1)
            if c == LEARNER:
                self._events.append((s, outcome - self.phi[s], True))
        primary = self.controllers.index(LEARNER)
        share = 1 / len(winners) if primary in winners else 0.0
        rivals = sorted({c for s, c in enumerate(self.controllers) if s != primary})
        info = {
            "win": share,
            "win_vs_fair": share * n,
            f"win_vs_fair_{n}p": share * n,
            "points": game.players[primary].points / 2,
            "turns": float(game.turn),
            "timeout": float(timeout),
            "slew_dragon": float(game.dragon_slain_by == primary),
            "spec": float(self.spec_id),
        }
        if rivals == ["champion"]:
            info["win_vs_fair_champion"] = share * n
        self._episodes.append(info)
        self._new_episode()

    def _advance(self, spatial: np.ndarray, glob: np.ndarray, mask: np.ndarray) -> Decision:
        """Play bots and forced moves until a policy seat has a real choice."""
        while self.game is not None:
            game = self.game
            seat = game.current
            view = game.view(seat)
            ctrl = self.controllers[seat]
            if len(view.legal) == 1:
                self._play(seat, view.legal[0])
                continue
            if ctrl not in (LEARNER, SNAPSHOT):
                self._play(seat, self.bots[seat].act(view))
                continue
            me, self.actions = encode_into(view, spatial, glob, mask)
            if not self.actions:  # every option is off the canvas (never seen in practice)
                self._play(seat, view.legal[0])
                continue
            label = -1
            self.teacher_action = None
            if ctrl == LEARNER and self.teacher is not None:
                self.teacher_action = self.teacher.act(view)
                goal = getattr(self.teacher, "goal", None)
                label = label_index(view, self.actions, self.teacher_action, goal)
                if self.cfg.behavior == "policy":
                    self.teacher_action = None
            policy = 0 if ctrl == LEARNER else self.snapshot_ids[seat]
            return Decision(policy, seat, label, me, self._events, self._episodes)
        return self._idle()
