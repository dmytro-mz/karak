"""Many `KarakEnv`s across worker processes. Observations go through shared memory, metadata through pipes."""

from __future__ import annotations

import contextlib
import multiprocessing as mp
from multiprocessing.connection import Connection
from multiprocessing.shared_memory import SharedMemory
from typing import Any

import numpy as np

from karak.nn.encoding import N_ACTIONS, N_GLOBAL, N_SPATIAL, S
from karak.rl.env import Decision, EnvConfig, EpisodeSpec, KarakEnv


class Buffers:
    """spatial / glob / mask rows for `n` envs, optionally backed by named shared memory."""

    SHAPES = (("spatial", (N_SPATIAL, S, S), np.uint8), ("glob", (N_GLOBAL,), np.float32), ("mask", (N_ACTIONS,), bool))

    def __init__(self, n: int, names: list[str] | None = None) -> None:
        self.shm: list[SharedMemory] = []
        self.arrays: dict[str, np.ndarray] = {}
        for i, (key, shape, dtype) in enumerate(self.SHAPES):
            size = int(n * np.prod(shape) * np.dtype(dtype).itemsize)
            shm = SharedMemory(name=names[i]) if names else SharedMemory(create=True, size=size)
            self.shm.append(shm)
            self.arrays[key] = np.ndarray((n, *shape), dtype=dtype, buffer=shm.buf)

    @property
    def names(self) -> list[str]:
        return [s.name for s in self.shm]

    def close(self, unlink: bool = False) -> None:
        self.arrays = {}
        for s in self.shm:
            s.close()
            if unlink:
                with contextlib.suppress(FileNotFoundError):
                    s.unlink()


class _Shard:
    def __init__(self, config: EnvConfig, n_envs: int, seed: int, buffers: Buffers) -> None:
        self.envs = [KarakEnv(config, seed=seed + i) for i in range(n_envs)]
        self.buf = buffers.arrays

    def _rows(self, i: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        return self.buf["spatial"][i], self.buf["glob"][i], self.buf["mask"][i]

    def reset(self) -> list[Decision]:
        return [env.reset(*self._rows(i)) for i, env in enumerate(self.envs)]

    def step(self, actions: np.ndarray) -> list[Decision]:
        return [env.step(int(a), *self._rows(i)) for i, (env, a) in enumerate(zip(self.envs, actions, strict=True))]

    def set_snapshots(self, n: int) -> None:
        for env in self.envs:
            env.n_snapshots = n

    def set_specs(self, specs: list[list[EpisodeSpec]]) -> list[Decision]:
        for env, s in zip(self.envs, specs, strict=True):
            env.specs = list(s)
            env.spec_id = -1
        return self.reset()


def _worker(remote: Connection, config: EnvConfig, n_envs: int, seed: int, names: list[str]) -> None:
    buffers = Buffers(n_envs, names)
    shard = _Shard(config, n_envs, seed, buffers)
    try:
        while True:
            cmd, payload = remote.recv()
            if cmd == "step":
                remote.send(shard.step(payload))
            elif cmd == "reset":
                remote.send(shard.reset())
            elif cmd == "snapshots":
                shard.set_snapshots(payload)
            elif cmd == "specs":
                remote.send(shard.set_specs(payload))
            elif cmd == "close":
                break
    except (KeyboardInterrupt, EOFError):
        pass
    finally:
        buffers.close()
        remote.close()


class VecEnv:
    """`num_envs` envs in `num_workers` processes (0 = in-process). Results are views into `self.obs`."""

    def __init__(self, config: EnvConfig, num_envs: int, num_workers: int = 0, seed: int = 0) -> None:
        self.num_envs = num_envs
        self.buffers = Buffers(num_envs)
        self.obs = self.buffers.arrays
        self.remotes: list[Connection] = []
        self.procs: list[Any] = []
        self.local: _Shard | None = None
        if num_workers <= 1:
            self.local = _Shard(config, num_envs, seed, self.buffers)
            self.splits = [num_envs]
            return
        base, extra = divmod(num_envs, num_workers)
        self.splits = [base + (w < extra) for w in range(num_workers)]
        self.shard_buffers: list[Buffers] = []
        ctx = mp.get_context("spawn")
        start = 0
        for n in self.splits:
            shard_buf = Buffers(n)
            self.shard_buffers.append(shard_buf)
            parent, child = ctx.Pipe()
            proc = ctx.Process(target=_worker, args=(child, config, n, seed + start, shard_buf.names), daemon=True)
            proc.start()
            child.close()
            self.remotes.append(parent)
            self.procs.append(proc)
            start += n

    def _gather(self, results: list[list[Decision]]) -> list[Decision]:
        if self.local is None:
            start = 0
            for shard_buf, n in zip(self.shard_buffers, self.splits, strict=True):
                for key, arr in shard_buf.arrays.items():
                    self.obs[key][start : start + n] = arr
                start += n
        return [d for res in results for d in res]

    def _call(self, cmd: str, payloads: list[Any] | None = None) -> list[Decision]:
        if self.local is not None:
            if cmd == "reset":
                return self.local.reset()
            assert payloads is not None
            return self.local.step(payloads[0]) if cmd == "step" else self.local.set_specs(payloads[0])
        for r, p in zip(self.remotes, payloads or [None] * len(self.remotes), strict=True):
            r.send((cmd, p))
        return self._gather([r.recv() for r in self.remotes])

    def _split(self, items: Any) -> list[Any]:
        out, start = [], 0
        for n in self.splits:
            out.append(items[start : start + n])
            start += n
        return out

    def reset(self) -> list[Decision]:
        return self._call("reset")

    def step(self, actions: np.ndarray) -> list[Decision]:
        return self._call("step", self._split(actions))

    def set_snapshots(self, n: int) -> None:
        if self.local is not None:
            self.local.set_snapshots(n)
            return
        for r in self.remotes:
            r.send(("snapshots", n))

    def set_specs(self, specs: list[list[EpisodeSpec]]) -> list[Decision]:
        """One list of games per env (evaluation); envs go idle when their list runs out."""
        return self._call("specs", self._split(specs))

    def close(self) -> None:
        for r in self.remotes:
            with contextlib.suppress(BrokenPipeError, OSError):
                r.send(("close", None))
        for p in self.procs:
            p.join(timeout=5)
        for b in getattr(self, "shard_buffers", []):
            b.close(unlink=True)
        self.buffers.close(unlink=True)
