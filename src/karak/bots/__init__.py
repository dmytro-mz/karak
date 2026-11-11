"""Bot registry. Every entry shows up in the web lobby and in `karak eval`."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from karak.bots.base import Bot
from karak.bots.planner import PlannerBot, PlannerConfig


@dataclass(frozen=True)
class BotType:
    key: str
    label: str
    stars: int
    description: str
    make: Callable[[int | None], Bot]


REGISTRY: dict[str, BotType] = {
    b.key: b
    for b in (
        BotType(
            "squire",
            "Squire",
            1,
            "Brave but reckless: fights whatever it meets and grabs loot at random.",
            lambda seed: PlannerBot(
                seed,
                PlannerConfig(risk=0.0, dragon_risk=0.0, smart_loot=False, heal_at=1, curse_leader=False, noise=2.0),
            ),
        ),
        BotType(
            "adventurer",
            "Adventurer",
            3,
            "Picks fights it can usually win and heals when hurt, but doesn't watch the score.",
            lambda seed: PlannerBot(seed, PlannerConfig(risk=0.5, dragon_risk=0.4, curse_leader=False, noise=1.0)),
        ),
        BotType(
            "champion",
            "Champion",
            5,
            "Gears up before going deep, curses the leader and only hunts the dragon when the ruby wins the game.",
            lambda seed: PlannerBot(seed),
        ),
    )
}


MODELS = Path(__file__).parent / "models"  # trained networks shipped with the game (see `karak train`)


def _neural(path: Path) -> Callable[[int | None], Bot]:
    def make(seed: int | None) -> Bot:
        from karak.bots.neural import NeuralBot

        return NeuralBot(path, seed)

    return make


for _path in sorted(MODELS.glob("*.npz")):
    REGISTRY[_path.stem] = BotType(
        _path.stem,
        "AI" if _path.stem == "ai" else _path.stem.replace("-", " ").title(),
        5,
        "A neural network that learned by imitating the Champion, then by playing tens of thousands of games "
        "against it.",
        _neural(_path),
    )


def make_bot(key: str, seed: int | None = None) -> Bot:
    """A registry key, or `ai:<policy.npz>` for a trained network."""
    if key.startswith("ai:"):
        from karak.bots.neural import NeuralBot

        return NeuralBot(key.removeprefix("ai:"), seed)
    return REGISTRY[key].make(seed)


__all__ = ["REGISTRY", "Bot", "BotType", "PlannerBot", "PlannerConfig", "make_bot"]
