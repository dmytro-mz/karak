"""KarakNet: a residual CNN over the map with global-pooling blocks, a per-cell action head and a flat head.

```
spatial (37 x 24 x 24) ─ conv3x3 ─┬─ + Linear(glob) as per-channel bias
                                  └─ residual blocks (conv, ReLU, + Linear(mean|max pool) bias, conv, skip)
trunk ─ conv1x1 ─────────────────────────────────────────── plane logits (go / teleport / reincarnate / heal k)
trunk ─ [mean pool | max pool | features at my cell | MLP(glob)] ─┬─ MLP ─ flat logits (56)
                                                                  └─ MLP ─ value
```

`karak.nn.forward` mirrors this in numpy for play without torch; keep both in sync
(`tests/test_rl.py::test_numpy_forward_matches_torch`).
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.distributions import Categorical

from karak.nn.encoding import N_FLAT, N_GLOBAL, N_PLANES, N_SPATIAL, VERSION, S

MASK_VALUE = -1e9


def _init(layer: nn.Conv2d | nn.Linear, gain: float) -> nn.Module:
    nn.init.orthogonal_(layer.weight, gain=gain)
    nn.init.zeros_(layer.bias)
    return layer


class Block(nn.Module):
    def __init__(self, f: int) -> None:
        super().__init__()
        self.conv1 = _init(nn.Conv2d(f, f, 3, padding=1), np.sqrt(2))
        self.pool = _init(nn.Linear(2 * f, f), 1.0)
        self.conv2 = _init(nn.Conv2d(f, f, 3, padding=1), 0.1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = torch.relu(self.conv1(x))
        h = h + self.pool(torch.cat([h.mean((2, 3)), h.amax((2, 3))], 1))[:, :, None, None]
        return torch.relu(x + self.conv2(h))


class KarakNet(nn.Module):
    def __init__(self, filters: int = 32, blocks: int = 4, hidden: int = 256) -> None:
        super().__init__()
        self.arch = {"filters": filters, "blocks": blocks, "hidden": hidden}
        f, h = filters, hidden
        self.stem = _init(nn.Conv2d(N_SPATIAL, f, 3, padding=1), np.sqrt(2))
        self.stem_glob = _init(nn.Linear(N_GLOBAL, f), 1.0)
        self.blocks = nn.ModuleList(Block(f) for _ in range(blocks))
        self.planes = _init(nn.Conv2d(f, N_PLANES, 1), 0.01)
        self.glob = _init(nn.Linear(N_GLOBAL, h), np.sqrt(2))
        self.pi = _init(nn.Linear(3 * f + h, h), np.sqrt(2))
        self.flat = _init(nn.Linear(h, N_FLAT), 0.01)
        self.vh = _init(nn.Linear(3 * f + h, h), np.sqrt(2))
        self.v = _init(nn.Linear(h, 1), 1.0)

    def forward(self, spatial: torch.Tensor, glob: torch.Tensor, me: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """spatial uint8 (B, C, S, S), glob float (B, G), me long (B,) -> (logits (B, A), value (B,))."""
        x = spatial.float().mul_(1 / 255).contiguous(memory_format=torch.channels_last)
        x = torch.relu(self.stem(x) + self.stem_glob(glob)[:, :, None, None])
        for block in self.blocks:
            x = block(x)
        with torch.autocast(x.device.type, enabled=False):
            x = x.float()
            flat_x = x.flatten(2)
            at_me = flat_x[torch.arange(x.shape[0], device=x.device), :, me]
            pooled = torch.cat([flat_x.mean(2), flat_x.amax(2), at_me, torch.relu(self.glob(glob.float()))], 1)
            plane_logits = self.planes(x).flatten(1)
            flat_logits = self.flat(torch.relu(self.pi(pooled)))
            value = self.v(torch.relu(self.vh(pooled))).squeeze(-1)
        return torch.cat([plane_logits, flat_logits], 1), value

    def dist(
        self, spatial: torch.Tensor, glob: torch.Tensor, me: torch.Tensor, mask: torch.Tensor
    ) -> tuple[Categorical, torch.Tensor, torch.Tensor]:
        logits, value = self(spatial, glob, me)
        logits = logits.masked_fill(~mask, MASK_VALUE)
        return Categorical(logits=logits), logits, value

    # ------------------------------------------------------------------ export
    def numpy_weights(self) -> dict[str, np.ndarray]:
        return {k: v.detach().float().cpu().numpy() for k, v in self.state_dict().items()}

    def save_policy(self, path: str | Path, meta: dict | None = None) -> None:
        """Weights as .npz for `karak.nn.forward` (no torch needed to play)."""
        info = {"version": VERSION, "canvas": S, **self.arch, **(meta or {})}
        np.savez(path, __meta__=np.array(json.dumps(info)), **self.numpy_weights())

    @classmethod
    def from_policy(cls, path: str | Path) -> KarakNet:
        data = np.load(path)
        meta = json.loads(str(data["__meta__"]))
        net = cls(meta["filters"], meta["blocks"], meta["hidden"])
        net.load_state_dict({k: torch.from_numpy(data[k]) for k in data.files if k != "__meta__"})
        return net
