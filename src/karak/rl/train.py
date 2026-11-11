"""Imitation (BC) and PPO for the neural player, with self-play snapshots and evaluation against bots.

One loop for both modes: envs produce decisions for learner seats (policy id 0) and frozen snapshots (id >= 1);
the trainer answers them in batches on the GPU. Every learner decision is a row in `Storage`. Seats interleave
within a game, so rows of the same (env, seat) are linked into a chain and returns are computed along it.
A chain's newest row has no successor yet; it is carried over to the next update instead of being cut.

- bc: learner seats play the teacher's move (env.behavior = "teacher"); loss = cross-entropy to the teacher
  label + value regression to lambda-returns of the teacher's own games.
- ppo: clipped policy gradient + value + entropy (+ optional cross-entropy to the teacher label).
"""

from __future__ import annotations

import copy
import csv
import json
import random
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
import yaml
from rich.console import Console

from karak.game.model import Hero
from karak.nn.encoding import N_ACTIONS, N_GLOBAL, N_SPATIAL, S
from karak.rl.config import TrainConfig
from karak.rl.env import LEARNER, EnvConfig, EpisodeSpec
from karak.rl.network import KarakNet
from karak.rl.vec_env import VecEnv

console = Console()


def resolve_device(name: str) -> torch.device:
    if name == "auto":
        if torch.cuda.is_available():
            return torch.device("cuda")
        return torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    return torch.device(name)


# ---------------------------------------------------------------------- storage
class Storage:
    def __init__(self, capacity: int) -> None:
        self.cap = capacity
        self.spatial = np.zeros((capacity, N_SPATIAL, S, S), dtype=np.uint8)
        self.glob = np.zeros((capacity, N_GLOBAL), dtype=np.float32)
        self.mask = np.zeros((capacity, N_ACTIONS), dtype=bool)
        self.me = np.zeros(capacity, dtype=np.int64)
        self.action = np.zeros(capacity, dtype=np.int64)
        self.label = np.zeros(capacity, dtype=np.int64)
        self.logp = np.zeros(capacity, dtype=np.float32)
        self.value = np.zeros(capacity, dtype=np.float32)
        self.reward = np.zeros(capacity, dtype=np.float32)
        self.done = np.zeros(capacity, dtype=bool)
        self.next = np.full(capacity, -1, dtype=np.int64)
        self.n = 0
        self.last: dict[tuple[int, int], int] = {}  # (env, seat) -> newest row of that chain

    def add(self, key: tuple[int, int], obs: dict[str, np.ndarray], env: int, me: int, action: int, label: int,
            logp: float, value: float) -> None:  # fmt: skip
        i = self.n
        if i >= self.cap:
            raise RuntimeError("storage full")
        self.n += 1
        self.spatial[i] = obs["spatial"][env]
        self.glob[i] = obs["glob"][env]
        self.mask[i] = obs["mask"][env]
        self.me[i], self.action[i], self.label[i] = me, action, label
        self.logp[i], self.value[i] = logp, value
        self.reward[i], self.done[i], self.next[i] = 0.0, False, -1
        prev = self.last.get(key)
        if prev is not None:
            self.next[prev] = i
        self.last[key] = i

    def reward_event(self, key: tuple[int, int], reward: float, done: bool) -> None:
        row = self.last.get(key)
        if row is None:
            return
        self.reward[row] += reward
        if done:
            self.done[row] = True
            del self.last[key]

    def returns(self, gamma: float, lam: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """(advantages, returns, ready): GAE along each chain, truncated at its newest known row."""
        n = self.n
        adv = np.zeros(n, dtype=np.float32)
        ready = self.done[:n] | (self.next[:n] >= 0)
        r, v, nxt, done = self.reward, self.value, self.next, self.done
        for i in range(n - 1, -1, -1):
            if done[i]:
                adv[i] = r[i] - v[i]
            elif nxt[i] >= 0:
                j = nxt[i]
                adv[i] = r[i] + gamma * v[j] - v[i] + (gamma * lam * adv[j] if ready[j] else 0.0)
        return adv, adv + v[:n], ready

    def carry_over(self, ready: np.ndarray) -> None:
        """Keep only the rows still waiting for a successor, moved to the front."""
        keep = np.flatnonzero(~ready)
        remap = {int(old): new for new, old in enumerate(keep)}
        for arr in (self.spatial, self.glob, self.mask, self.me, self.action, self.label, self.logp, self.value,
                    self.reward, self.done):  # fmt: skip
            arr[: len(keep)] = arr[keep]
        self.next[: len(keep)] = -1
        self.last = {k: remap[v] for k, v in self.last.items()}
        self.n = len(keep)


# ---------------------------------------------------------------------- logging
class Logger:
    def __init__(self, run_dir: Path) -> None:
        from torch.utils.tensorboard import SummaryWriter

        self.tb = SummaryWriter(str(run_dir / "tb"))
        self.csv_path = run_dir / "metrics.csv"
        self.rows: list[dict[str, float]] = []

    def log(self, step: int, scalars: dict[str, float]) -> None:
        for k, v in scalars.items():
            self.tb.add_scalar(k, v, step)
        self.rows.append({"step": step, **scalars})
        keys = sorted({k for r in self.rows for k in r} - {"step"})
        with self.csv_path.open("w", newline="") as f:
            w = csv.DictWriter(f, ["step", *keys])
            w.writeheader()
            w.writerows(self.rows)

    def close(self) -> None:
        self.tb.close()


# ---------------------------------------------------------------------- evaluation
def eval_specs(sizes: list[int], games: int, opponent: str, seed: int) -> list[EpisodeSpec]:
    """`games` per table size: the learner at a rotating seat, random heroes, `opponent` everywhere else."""
    rng = random.Random(seed)
    specs = []
    for n in sizes:
        for g in range(games):
            controllers = [opponent] * n
            controllers[g % n] = LEARNER
            specs.append(EpisodeSpec(rng.randrange(2**62), tuple(rng.sample(list(Hero), n)), tuple(controllers)))
    return specs


def _minibatches(perm: np.ndarray, size: int) -> list[np.ndarray]:
    """Sorted index slices of ``perm``; a short tail is merged into the previous slice."""
    starts = list(range(0, len(perm), size))
    if len(starts) > 1 and len(perm) - starts[-1] < size // 2:
        starts.pop()
    bounds = [*starts[1:], len(perm)]
    return [np.sort(perm[a:b]) for a, b in zip(starts, bounds, strict=True)]


@torch.no_grad()
def _act(net: KarakNet, obs: dict[str, np.ndarray], rows: list[int], me: list[int], device: torch.device,
         amp: bool, greedy: bool = False) -> tuple[np.ndarray, np.ndarray, np.ndarray]:  # fmt: skip
    sp = torch.from_numpy(obs["spatial"][rows]).to(device)
    gl = torch.from_numpy(obs["glob"][rows]).to(device)
    mk = torch.from_numpy(obs["mask"][rows]).to(device)
    me_t = torch.as_tensor(me, device=device)
    with torch.autocast(device.type, dtype=torch.bfloat16, enabled=amp and device.type != "cpu"):
        dist, logits, value = net.dist(sp, gl, me_t, mk)
    action = logits.argmax(1) if greedy else dist.sample()
    return action.cpu().numpy(), dist.log_prob(action).cpu().numpy(), value.cpu().numpy()


def evaluate(net: KarakNet, envs: VecEnv, specs: list[EpisodeSpec], device: torch.device, amp: bool
             ) -> list[dict[str, float]]:  # fmt: skip
    """Greedy play through `specs`; one info dict per game, in spec order."""
    per_env: list[list[EpisodeSpec]] = [[] for _ in range(envs.num_envs)]
    owner = []
    for i, spec in enumerate(specs):
        per_env[i % envs.num_envs].append(spec)
        owner.append(i % envs.num_envs)
    net.eval()
    decisions = envs.set_specs(per_env)
    results: dict[tuple[int, int], dict[str, float]] = {}
    while True:
        for e, d in enumerate(decisions):
            for info in d.episodes:
                results[(e, int(info["spec"]))] = info
        rows = [i for i, d in enumerate(decisions) if d.policy == 0]
        if not rows:
            break
        actions = np.full(envs.num_envs, -1, dtype=np.int64)
        a, _, _ = _act(net, envs.obs, rows, [decisions[i].me for i in rows], device, amp, greedy=True)
        actions[rows] = a
        decisions = envs.step(actions)
    net.train()
    counters = [0] * envs.num_envs
    out = []
    for e in owner:
        out.append(results[(e, counters[e])])
        counters[e] += 1
    return out


def summarize(specs: list[EpisodeSpec], infos: list[dict[str, float]], prefix: str) -> dict[str, float]:
    by_n: dict[int, list[dict[str, float]]] = defaultdict(list)
    for spec, info in zip(specs, infos, strict=True):
        by_n[len(spec.heroes)].append(info)
    out = {}
    for n, rows in sorted(by_n.items()):
        out[f"{prefix}/win_vs_fair_{n}p"] = float(np.mean([r["win_vs_fair"] for r in rows]))
        out[f"{prefix}/win_rate_{n}p"] = float(np.mean([r["win"] for r in rows]))
    out[f"{prefix}/win_vs_fair"] = float(np.mean([out[f"{prefix}/win_vs_fair_{n}p"] for n in by_n]))
    out[f"{prefix}/points"] = float(np.mean([r["points"] for r in infos]))
    out[f"{prefix}/turns"] = float(np.mean([r["turns"] for r in infos]))
    out[f"{prefix}/slew_dragon"] = float(np.mean([r["slew_dragon"] for r in infos]))
    return out


# ---------------------------------------------------------------------- training
@dataclass
class TrainState:
    update: int = 0
    steps: int = 0
    best: float = -float("inf")


def _load_weights(net: KarakNet, path: str) -> None:
    if path.endswith(".npz"):
        net.load_state_dict(KarakNet.from_policy(path).state_dict())
    else:
        net.load_state_dict(torch.load(path, map_location="cpu", weights_only=False)["model"])


def _schedule(start: float, end: float | None, frac: float) -> float:
    return start if end is None else start + (end - start) * frac


def train(cfg: TrainConfig, resume: Path | None = None) -> Path:
    t = cfg.train
    torch.manual_seed(cfg.seed)
    np.random.seed(cfg.seed)
    device = resolve_device(cfg.device)
    amp = t.amp and device.type != "cpu"
    run_dir = Path(cfg.run_root) / f"{datetime.now():%Y%m%d-%H%M%S}_{cfg.name}"
    (run_dir / "checkpoints").mkdir(parents=True)
    (run_dir / "config.yaml").write_text(yaml.safe_dump(cfg.to_dict(), sort_keys=False))
    logger = Logger(run_dir)

    net = KarakNet(cfg.model.filters, cfg.model.blocks, cfg.model.hidden)
    if cfg.init:
        _load_weights(net, cfg.init)
        console.print(f"[yellow]initialised from {cfg.init}")
    net = net.to(device).to(memory_format=torch.channels_last)  # type: ignore[call-overload]
    optimizer = torch.optim.Adam(net.parameters(), lr=t.lr, eps=1e-5)
    state = TrainState()
    if resume is not None:
        ckpt = torch.load(resume, map_location=device, weights_only=False)
        net.load_state_dict(ckpt["model"])
        optimizer.load_state_dict(ckpt["optimizer"])
        state = TrainState(**ckpt["state"])

    envs = VecEnv(cfg.env, t.num_envs, t.num_workers, seed=cfg.seed * 100_003)
    eval_cfg = EnvConfig(opponents={cfg.eval.opponent: 1.0}, teacher=None, max_turns=cfg.eval.max_turns)
    eval_envs = VecEnv(eval_cfg, cfg.eval.num_envs, cfg.eval.num_workers, seed=7) if cfg.eval.games > 0 else None
    specs = eval_specs(cfg.eval.sizes, cfg.eval.games, cfg.eval.opponent, seed=12_345)
    snapshots: list[KarakNet] = []
    uses_snapshots = "snapshot" in cfg.env.opponents

    def add_snapshot() -> None:
        snap = copy.deepcopy(net).eval()
        snapshots.append(snap)
        if len(snapshots) > cfg.max_snapshots:
            snapshots.pop(0)
        envs.set_snapshots(len(snapshots))

    if uses_snapshots:
        add_snapshot()

    storage = Storage(t.num_envs * t.num_steps + t.num_envs * 5 + 16)
    steps_per_update = t.num_envs * t.num_steps
    num_updates = max(1, t.total_steps // steps_per_update)
    console.print(f"[bold]{run_dir}[/] device={device} mode={t.mode} updates={num_updates} amp={amp}")

    def save_policy(name: str, extra: dict | None = None) -> None:
        net.save_policy(run_dir / name, {"run": run_dir.name, "update": state.update, **(extra or {})})

    def run_eval() -> None:
        if eval_envs is None:
            return
        t0 = time.time()
        infos = evaluate(net, eval_envs, specs, device, amp)
        scalars = summarize(specs, infos, f"eval/{cfg.eval.opponent}")
        logger.log(state.steps, scalars)
        key = f"eval/{cfg.eval.opponent}/win_vs_fair"
        sizes = "  ".join(f"{n}p {scalars[f'{key}_{n}p']:.2f}" for n in cfg.eval.sizes)
        console.print(f"[cyan]eval @ {state.steps:,}[/] win×n {scalars[key]:.3f}  ({sizes})  {time.time() - t0:.0f}s")
        save_policy("policy_latest.npz", {"eval": scalars[key]})
        if scalars[key] > state.best:
            state.best = scalars[key]
            save_policy("policy_best.npz", {"eval": scalars[key]})
            (run_dir / "best.json").write_text(json.dumps({"steps": state.steps, **scalars}, indent=2))

    def save_checkpoint() -> None:
        ckpt = {"model": net.state_dict(), "optimizer": optimizer.state_dict(), "state": vars(state),
                "config": cfg.to_dict()}  # fmt: skip
        torch.save(ckpt, run_dir / "checkpoints" / "latest.pt")

    if state.update == 0 and cfg.eval.games > 0 and cfg.eval.at_start:
        run_eval()

    decisions = envs.reset()
    episodes: list[dict[str, float]] = []
    t_start, start_update = time.time(), state.update
    try:
        while state.update < num_updates:
            state.update += 1
            frac = (state.update - 1) / num_updates
            lr = _schedule(t.lr, t.lr_final, frac)
            for g in optimizer.param_groups:
                g["lr"] = lr
            ent_coef = _schedule(t.ent_coef, t.ent_coef_final, frac)
            bc_coef = _schedule(t.bc_coef, t.bc_coef_final, frac)

            # -------------------------------------------------- rollout
            t0 = time.time()
            net.eval()
            for _ in range(t.num_steps):
                actions = np.full(t.num_envs, -1, dtype=np.int64)
                by_policy: dict[int, list[int]] = defaultdict(list)
                for e, d in enumerate(decisions):
                    if d.policy >= 0:
                        by_policy[d.policy].append(e)
                for pid, rows in by_policy.items():
                    model = net if pid == 0 else snapshots[min(pid, len(snapshots)) - 1]
                    me = [decisions[e].me for e in rows]
                    a, logp, value = _act(model, envs.obs, rows, me, device, amp)
                    if pid != 0:
                        actions[rows] = a
                        continue
                    for k, e in enumerate(rows):
                        d = decisions[e]
                        chosen = d.label if t.mode == "bc" else int(a[k])
                        storage.add((e, d.seat), envs.obs, e, d.me, chosen, d.label, float(logp[k]), float(value[k]))
                        if t.mode != "bc":
                            actions[e] = chosen
                decisions = envs.step(actions)
                for e, d in enumerate(decisions):
                    for seat, r, done in d.events:
                        storage.reward_event((e, seat), r, done)
                    episodes.extend(d.episodes)
            net.train()
            rollout_time = time.time() - t0

            # -------------------------------------------------- optimise
            t0 = time.time()
            adv, ret, ready = storage.returns(t.gamma, t.gae_lambda)
            rows = np.flatnonzero(ready)
            if t.mode == "bc":
                rows = rows[storage.label[rows] >= 0]
            state.steps += len(rows)
            warmup = t.mode == "ppo" and state.update <= t.critic_warmup_updates
            stats: dict[str, list[float]] = defaultdict(list)
            norm_adv = np.zeros_like(adv)
            if len(rows) > 1:
                norm_adv[rows] = (adv[rows] - adv[rows].mean()) / (adv[rows].std() + 1e-8)
            for _epoch in range(t.epochs):
                perm = np.random.permutation(rows)
                kl_stop = False
                for mb in _minibatches(perm, t.minibatch):
                    sp = torch.from_numpy(storage.spatial[mb]).to(device)
                    gl = torch.from_numpy(storage.glob[mb]).to(device)
                    mk = torch.from_numpy(storage.mask[mb]).to(device)
                    me = torch.from_numpy(storage.me[mb]).to(device)
                    act = torch.from_numpy(storage.action[mb]).to(device)
                    lab = torch.from_numpy(storage.label[mb]).to(device)
                    b_ret = torch.from_numpy(ret[mb]).to(device)
                    with torch.autocast(device.type, dtype=torch.bfloat16, enabled=amp):
                        dist, logits, value = net.dist(sp, gl, me, mk)
                    v_loss = 0.5 * ((value - b_ret) ** 2).mean()
                    has_label = lab >= 0
                    ce = (
                        F.cross_entropy(logits[has_label], lab[has_label])
                        if bool(has_label.any())
                        else torch.zeros((), device=device)
                    )
                    if t.mode == "bc":
                        loss = ce + t.vf_coef * v_loss
                        stats["losses/accuracy"].append(float((logits.argmax(1) == act).float().mean()))
                    else:
                        b_adv = torch.from_numpy(norm_adv[mb]).to(device)
                        old_logp = torch.from_numpy(storage.logp[mb]).to(device)
                        new_logp = dist.log_prob(act)
                        log_ratio = new_logp - old_logp
                        ratio = log_ratio.exp()
                        pg = torch.max(-b_adv * ratio, -b_adv * ratio.clamp(1 - t.clip, 1 + t.clip)).mean()
                        entropy = dist.entropy().mean()
                        with torch.no_grad():
                            approx_kl = ((ratio - 1) - log_ratio).mean()
                            stats["losses/approx_kl"].append(float(approx_kl))
                            stats["losses/clipfrac"].append(float(((ratio - 1).abs() > t.clip).float().mean()))
                            stats["losses/entropy"].append(float(entropy))
                            stats["losses/policy"].append(float(pg))
                            if bool(has_label.any()):
                                agree = (logits.argmax(1) == lab)[has_label].float().mean()
                                stats["losses/teacher_agree"].append(float(agree))
                        if warmup:
                            loss = t.vf_coef * v_loss
                        else:
                            loss = pg - ent_coef * entropy + t.vf_coef * v_loss + bc_coef * ce
                        if t.target_kl is not None and float(approx_kl) > t.target_kl and not warmup:
                            kl_stop = True
                    stats["losses/value"].append(v_loss.item())
                    stats["losses/cross_entropy"].append(ce.item())
                    optimizer.zero_grad()
                    loss.backward()
                    grad_norm = torch.nn.utils.clip_grad_norm_(net.parameters(), t.max_grad_norm)
                    stats["losses/grad_norm"].append(float(grad_norm))
                    optimizer.step()
                    if kl_stop:
                        break
                if kl_stop:
                    break
            var = float(np.var(ret[rows])) if len(rows) else 0.0
            explained = 1 - float(np.var(ret[rows] - storage.value[rows])) / var if var > 0 else float("nan")
            storage.carry_over(ready)
            opt_time = time.time() - t0

            sps = state.steps / max(1e-9, time.time() - t_start) if state.update > start_update else 0.0
            scalars = {f: float(np.mean(v)) for f, v in stats.items()}
            scalars.update({
                "charts/lr": lr, "charts/ent_coef": ent_coef, "charts/bc_coef": bc_coef, "charts/samples_per_s": sps,
                "charts/rollout_s": rollout_time, "charts/optimise_s": opt_time, "charts/batch": float(len(rows)),
                "losses/explained_variance": explained,
            })  # fmt: skip
            if episodes:
                for key in sorted({k for e in episodes for k in e} - {"spec"}):
                    vals = [e[key] for e in episodes if key in e]
                    scalars[f"rollout/{key}"] = float(np.mean(vals))
                scalars["rollout/episodes"] = float(len(episodes))
            logger.log(state.steps, scalars)
            if state.update % 5 == 0 or state.update == 1:
                extra = (
                    f"acc {scalars.get('losses/accuracy', 0):.3f}"
                    if t.mode == "bc"
                    else f"kl {scalars.get('losses/approx_kl', 0):.4f} ent {scalars.get('losses/entropy', 0):.3f} "
                    f"agree {scalars.get('losses/teacher_agree', 0):.2f}"
                )
                console.print(
                    f"upd {state.update:>5}/{num_updates} steps {state.steps:>10,} sps {sps:>6,.0f} "
                    f"(roll {rollout_time:.1f}s opt {opt_time:.1f}s) ce {scalars.get('losses/cross_entropy', 0):.3f} "
                    f"{extra} v {scalars.get('losses/value', 0):.4f} ev {explained:.2f} "
                    f"win×n {scalars.get('rollout/win_vs_fair', float('nan')):.2f} ({len(episodes)} games)"
                )
                episodes = []
            if uses_snapshots and state.update % cfg.snapshot_every == 0:
                add_snapshot()
            if state.update % cfg.eval.every == 0 or state.update == num_updates:
                run_eval()
            if state.update % cfg.save_every == 0 or state.update == num_updates:
                save_checkpoint()
    except KeyboardInterrupt:
        console.print("[yellow]interrupted, saving")
        save_checkpoint()
        save_policy("policy_latest.npz")
    finally:
        envs.close()
        if eval_envs is not None:
            eval_envs.close()
        logger.close()
    console.print(f"[green]done[/] best eval win×n {state.best:.3f} -> {run_dir}")
    return run_dir
