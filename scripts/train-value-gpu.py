#!/usr/bin/env python3
"""
Train Deep Lattice value MLP on Apple GPU (MPS) / CUDA / CPU.

Exports the same JSON layout as the TS trainer so
`createMlpNeuralValue` can load it unchanged.

Usage:
  yarn train:value:gpu --data docs/sim-runs/dataset-q-combined.jsonl \\
    --out packages/subspace-lattice/src/lib/ai/weights/value-mlp-v3-gpu.json
"""
from __future__ import annotations

import argparse
import json
import math
import random
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Sequence, Tuple

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset, random_split

ENCODING_VERSION = 1
FEATURE_COUNT = 1948  # must match ENCODER_FEATURE_COUNT in position-encoder.ts


def pick_device(prefer: str) -> torch.device:
    prefer = prefer.lower()
    if prefer == "cpu":
        return torch.device("cpu")
    if prefer == "cuda" and torch.cuda.is_available():
        return torch.device("cuda")
    if prefer in ("mps", "auto") and torch.backends.mps.is_available():
        return torch.device("mps")
    if prefer == "auto" and torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


class JsonlValueDataset(Dataset):
    def __init__(
        self,
        path: Path,
        target: str,
        blend_alpha: float,
    ) -> None:
        self.xs: List[torch.Tensor] = []
        self.ys: List[float] = []
        with path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                row = json.loads(line)
                if row.get("encodingVersion", ENCODING_VERSION) != ENCODING_VERSION:
                    continue
                feats = row.get("features")
                if not isinstance(feats, list) or len(feats) != FEATURE_COUNT:
                    continue
                z = row.get("z")
                q = row.get("q")
                has_z = z in (1, -1, 1.0, -1.0)
                has_q = isinstance(q, (int, float)) and math.isfinite(q)
                y = None
                if target == "q":
                    if has_q:
                        y = max(-1.0, min(1.0, float(q)))
                elif target == "blend":
                    if has_q and has_z:
                        y = blend_alpha * float(z) + (1.0 - blend_alpha) * float(q)
                    elif has_q:
                        y = float(q)
                    elif has_z:
                        y = float(z)
                else:
                    if has_z:
                        y = float(z)
                if y is None:
                    continue
                self.xs.append(torch.tensor(feats, dtype=torch.float32))
                self.ys.append(y)
        if len(self.xs) < 50:
            raise SystemExit(
                f"train:value:gpu — need ≥50 samples for target={target}, got {len(self.xs)}"
            )

    def __len__(self) -> int:
        return len(self.xs)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        return self.xs[idx], torch.tensor([self.ys[idx]], dtype=torch.float32)


class ValueMlp(nn.Module):
    def __init__(self, hidden: Sequence[int]) -> None:
        super().__init__()
        layers: List[nn.Module] = []
        prev = FEATURE_COUNT
        for h in hidden:
            layers.append(nn.Linear(prev, h))
            layers.append(nn.ReLU())
            prev = h
        layers.append(nn.Linear(prev, 1))
        layers.append(nn.Tanh())
        self.net = nn.Sequential(*layers)
        self.hidden = list(hidden)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def export_weights(model: ValueMlp, meta: dict) -> dict:
    """Match packages/.../mlp-value.ts MlpValueWeights (row-major)."""
    linear_layers = [m for m in model.net.modules() if isinstance(m, nn.Linear)]
    out_layers = []
    hidden = []
    for i, lin in enumerate(linear_layers):
        # PyTorch weight is [out, in] — same as our row-major layout.
        w = lin.weight.detach().cpu().reshape(-1).tolist()
        b = lin.bias.detach().cpu().tolist()
        out_layers.append(
            {
                "w": w,
                "b": b,
                "in": int(lin.in_features),
                "out": int(lin.out_features),
            }
        )
        if i < len(linear_layers) - 1:
            hidden.append(int(lin.out_features))
    return {
        "encodingVersion": ENCODING_VERSION,
        "featureCount": FEATURE_COUNT,
        "hidden": hidden,
        "layers": out_layers,
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "trainMeta": meta,
    }


def sign_acc(pred: torch.Tensor, y: torch.Tensor) -> float:
    p = pred.detach().reshape(-1)
    t = y.detach().reshape(-1)
    correct = ((p >= 0) & (t >= 0)) | ((p < 0) & (t < 0))
    return float(correct.float().mean().item())


def main() -> None:
    ap = argparse.ArgumentParser(description="Deep Lattice value MLP (GPU/MPS)")
    ap.add_argument("--data", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--target", choices=("z", "q", "blend"), default="blend")
    ap.add_argument("--blend-alpha", type=float, default=0.35)
    ap.add_argument("--hidden", default="128,64", help="comma-separated hidden sizes")
    ap.add_argument("--epochs", type=int, default=80)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--batch", type=int, default=256)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--val", type=float, default=0.15)
    ap.add_argument("--device", default="auto", help="auto|mps|cuda|cpu")
    args = ap.parse_args()

    random.seed(args.seed)
    torch.manual_seed(args.seed)

    device = pick_device(args.device)
    hidden = [int(x.strip()) for x in args.hidden.split(",") if x.strip()]

    ds = JsonlValueDataset(args.data, args.target, args.blend_alpha)
    val_n = max(1, int(len(ds) * args.val))
    train_n = len(ds) - val_n
    train_ds, val_ds = random_split(
        ds,
        [train_n, val_n],
        generator=torch.Generator().manual_seed(args.seed),
    )

    # pin_memory is CUDA-only; MPS benefits from larger batches + sync sparingly.
    train_loader = DataLoader(
        train_ds,
        batch_size=args.batch,
        shuffle=True,
        num_workers=0,
        drop_last=False,
    )
    val_loader = DataLoader(val_ds, batch_size=args.batch, shuffle=False, num_workers=0)

    model = ValueMlp(hidden).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr)
    loss_fn = nn.MSELoss()

    print(
        f"train:value:gpu — device={device} · {train_n} train / {val_n} val · "
        f"target={args.target} · hidden={hidden} · epochs={args.epochs} · batch={args.batch}"
    )
    if device.type == "cpu":
        print(
            "train:value:gpu — WARNING: running on CPU. "
            "On Apple Silicon expect device=mps; check torch.backends.mps.is_available()."
        )

    best_state = None
    best_val = -1.0
    t0 = time.time()

    for ep in range(1, args.epochs + 1):
        model.train()
        total_loss = 0.0
        n = 0
        for xb, yb in train_loader:
            xb = xb.to(device, non_blocking=False)
            yb = yb.to(device, non_blocking=False)
            opt.zero_grad(set_to_none=True)
            pred = model(xb)
            loss = loss_fn(pred, yb)
            loss.backward()
            opt.step()
            total_loss += float(loss.item()) * xb.size(0)
            n += xb.size(0)

        model.eval()
        val_loss = 0.0
        val_correct = 0.0
        val_n_bat = 0
        with torch.no_grad():
            for xb, yb in val_loader:
                xb = xb.to(device)
                yb = yb.to(device)
                pred = model(xb)
                val_loss += float(loss_fn(pred, yb).item()) * xb.size(0)
                val_correct += sign_acc(pred, yb) * xb.size(0)
                val_n_bat += xb.size(0)
        if device.type == "mps":
            torch.mps.synchronize()

        train_loss = total_loss / max(1, n)
        v_loss = val_loss / max(1, val_n_bat)
        v_acc = val_correct / max(1, val_n_bat)
        if v_acc >= best_val:
            best_val = v_acc
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}

        if ep == 1 or ep % 5 == 0 or ep == args.epochs:
            print(
                f"  epoch {ep}: train loss {train_loss:.4f} · "
                f"val loss {v_loss:.4f} acc {v_acc * 100:.1f}%"
            )

    if best_state is not None:
        model.load_state_dict(best_state)

    elapsed = time.time() - t0
    meta = {
        "samples": len(ds),
        "train": train_n,
        "val": val_n,
        "epochs": args.epochs,
        "lr": args.lr,
        "batch": args.batch,
        "bestValAcc": best_val,
        "target": args.target,
        "blendAlpha": args.blend_alpha,
        "device": str(device),
        "elapsedSec": round(elapsed, 2),
        "backend": "pytorch",
        "data": args.data.name,
        "hidden": ",".join(str(h) for h in hidden),
    }
    payload = export_weights(model, meta)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload), encoding="utf-8")
    print(
        f"train:value:gpu — wrote {args.out} "
        f"(val sign-acc {best_val * 100:.1f}%, {elapsed:.1f}s on {device})"
    )


if __name__ == "__main__":
    main()
