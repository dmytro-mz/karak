"""Training configuration: dataclasses <-> YAML, with dotted command-line overrides (`-s train.lr=1e-4`)."""

from __future__ import annotations

import dataclasses
import types
import typing
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import yaml

from karak.rl.env import EnvConfig


@dataclass
class OptimConfig:
    mode: Literal["bc", "ppo"] = "ppo"  # bc: imitate the env's teacher; ppo: reinforcement learning
    total_steps: int = 10_000_000  # learner decisions
    num_envs: int = 128
    num_steps: int = 64  # env steps per rollout
    num_workers: int = 8
    lr: float = 3e-4
    lr_final: float = 0.0  # linear decay to this
    gamma: float = 0.997
    gae_lambda: float = 0.95
    epochs: int = 2
    minibatch: int = 2048
    clip: float = 0.2
    ent_coef: float = 0.01
    ent_coef_final: float | None = None
    vf_coef: float = 0.5
    bc_coef: float = 0.0  # ppo: extra cross-entropy towards the teacher's move
    bc_coef_final: float | None = None
    max_grad_norm: float = 0.5
    target_kl: float | None = None  # stop the epoch loop early above this
    critic_warmup_updates: int = 0  # ppo: train only the value head for the first N updates
    amp: bool = True  # bfloat16 autocast for the trunk


@dataclass
class ModelConfig:
    filters: int = 32
    blocks: int = 4
    hidden: int = 256


@dataclass
class EvalConfig:
    every: int = 25  # updates
    games: int = 100  # per table size
    sizes: list[int] = field(default_factory=lambda: [2, 3, 4, 5])
    opponent: str = "champion"
    num_envs: int = 96
    num_workers: int = 8
    max_turns: int = 1500
    at_start: bool = True  # evaluate the initial weights too


@dataclass
class TrainConfig:
    name: str = "run"
    seed: int = 0
    device: str = "auto"  # auto | mps | cpu | cuda
    run_root: str = "runs"
    init: str | None = None  # start from these weights (.pt checkpoint or .npz policy)
    save_every: int = 25
    snapshot_every: int = 20  # updates between self-play snapshots
    max_snapshots: int = 10
    env: EnvConfig = field(default_factory=EnvConfig)
    train: OptimConfig = field(default_factory=OptimConfig)
    model: ModelConfig = field(default_factory=ModelConfig)
    eval: EvalConfig = field(default_factory=EvalConfig)

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


def _coerce(value: Any, hint: Any) -> Any:
    """YAML reads "1e-3" as a string and dict keys of table_sizes as ints or strings; normalise both."""
    origin = typing.get_origin(hint)
    args = [a for a in typing.get_args(hint) if a is not type(None)]
    if origin in (types.UnionType, typing.Union) and value is not None and args:
        return _coerce(value, args[0])
    if hint is float and isinstance(value, str | int):
        return float(value)
    if hint is int and isinstance(value, str | float):
        return int(float(value))
    return value


def _build(cls: type, data: dict[str, Any]) -> Any:
    hints = typing.get_type_hints(cls)
    kwargs: dict[str, Any] = {}
    for key, value in data.items():
        if key not in hints:
            raise KeyError(f"unknown config key {cls.__name__}.{key}")
        hint = hints[key]
        if dataclasses.is_dataclass(hint) and isinstance(value, dict):
            value = _build(hint, value)  # type: ignore[arg-type]
        else:
            value = _coerce(value, hint)
        kwargs[key] = value
    return cls(**kwargs)


def _set_dotted(data: dict[str, Any], dotted: str, value: Any) -> None:
    *parents, leaf = dotted.split(".")
    node = data
    for p in parents:
        node = node.setdefault(p, {})
    node[leaf] = value


_REPLACE = {"opponents", "table_sizes"}  # mappings a YAML file replaces instead of merging


def _merge(base: dict[str, Any], update: dict[str, Any]) -> None:
    for key, value in update.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict) and key not in _REPLACE:
            _merge(base[key], value)
        else:
            base[key] = value


def load_config(path: str | Path | None = None, overrides: list[str] | None = None) -> TrainConfig:
    data = TrainConfig().to_dict()
    if path is not None:
        _merge(data, yaml.safe_load(Path(path).read_text()) or {})
    for item in overrides or []:
        key, sep, raw = item.partition("=")
        if not sep:
            raise ValueError(f"override must look like key=value, got {item!r}")
        _set_dotted(data, key.strip(), yaml.safe_load(raw))
    return _build(TrainConfig, data)
