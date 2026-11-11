"""Numpy forward pass of `karak.rl.network.KarakNet` (weights from `KarakNet.save_policy`)."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

from karak.nn.encoding import VERSION


def _conv3(x: np.ndarray, w: np.ndarray, b: np.ndarray) -> np.ndarray:
    """3x3 convolution with zero padding: x (C, H, W), w (O, C, 3, 3) -> (O, H, W)."""
    c, h, wd = x.shape
    cols = sliding_window_view(np.pad(x, ((0, 0), (1, 1), (1, 1))), (3, 3), axis=(1, 2))
    cols = cols.transpose(1, 2, 0, 3, 4).reshape(h * wd, c * 9)
    return (cols @ w.reshape(w.shape[0], -1).T + b).T.reshape(-1, h, wd)


def _relu(x: np.ndarray) -> np.ndarray:
    return np.maximum(x, 0)


class Policy:
    def __init__(self, path: str | Path) -> None:
        data = np.load(path)
        self.meta = json.loads(str(data["__meta__"]))
        if self.meta["version"] != VERSION:
            raise ValueError(f"{path}: encoding version {self.meta['version']}, this build reads {VERSION}")
        self.w = {k: data[k].astype(np.float32) for k in data.files if k != "__meta__"}
        self.blocks = self.meta["blocks"]

    def forward(self, spatial: np.ndarray, glob: np.ndarray, me: int) -> tuple[np.ndarray, float]:
        """One position: spatial uint8 (C, S, S), glob (G,) -> (logits (A,), value)."""
        w = self.w
        x = spatial.astype(np.float32) / 255
        bias = w["stem_glob.weight"] @ glob + w["stem_glob.bias"]
        x = _relu(_conv3(x, w["stem.weight"], w["stem.bias"]) + bias[:, None, None])
        for i in range(self.blocks):
            p = f"blocks.{i}."
            h = _relu(_conv3(x, w[p + "conv1.weight"], w[p + "conv1.bias"]))
            pooled = np.concatenate([h.mean((1, 2)), h.max((1, 2))])
            h = h + (w[p + "pool.weight"] @ pooled + w[p + "pool.bias"])[:, None, None]
            x = _relu(x + _conv3(h, w[p + "conv2.weight"], w[p + "conv2.bias"]))
        f = x.reshape(x.shape[0], -1)
        g = _relu(w["glob.weight"] @ glob + w["glob.bias"])
        pooled = np.concatenate([f.mean(1), f.max(1), f[:, me], g])
        planes = np.einsum("oc,cn->on", w["planes.weight"][:, :, 0, 0], f) + w["planes.bias"][:, None]
        flat = w["flat.weight"] @ _relu(w["pi.weight"] @ pooled + w["pi.bias"]) + w["flat.bias"]
        value = w["v.weight"] @ _relu(w["vh.weight"] @ pooled + w["vh.bias"]) + w["v.bias"]
        return np.concatenate([planes.reshape(-1), flat]), float(value[0])
