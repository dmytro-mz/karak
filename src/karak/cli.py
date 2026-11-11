from __future__ import annotations

import logging
import subprocess
import time
from concurrent.futures import ProcessPoolExecutor
from typing import Annotated

import typer
from rich.console import Console
from rich.table import Table

app = typer.Typer(add_completion=False, help="Karak: web game and bots")
console = Console()


def _play(args: tuple[list[str], int]) -> tuple[list[str], list[int], int, bool]:
    import random

    from karak.bots import make_bot
    from karak.game.model import Hero
    from karak.runner import play_game

    keys, seed = args
    shift = seed % len(keys)
    seated = keys[shift:] + keys[:shift]
    heroes = random.Random(seed).sample(list(Hero), len(keys))
    game = play_game([make_bot(k, seed * 31 + i) for i, k in enumerate(seated)], heroes, seed=seed)
    assert game.result is not None
    return seated, game.result.winners, game.turn, game.dragon_slain_by is not None


@app.command("eval")
def eval_cmd(
    bots: Annotated[str, typer.Option("-a", help="Comma-separated bot keys, e.g. champion,adventurer")] = (
        "champion,adventurer,squire"
    ),
    games: Annotated[int, typer.Option("-n", help="Number of games")] = 300,
    workers: int = 8,
) -> None:
    """Bot tournament with rotating seats and random heroes: win share per bot."""
    keys = [k.strip() for k in bots.split(",") if k.strip()]
    wins = dict.fromkeys(keys, 0.0)
    turns: list[int] = []
    slain = 0
    started = time.time()
    with ProcessPoolExecutor(workers) as ex:
        for seated, winners, turn, dragon in ex.map(_play, [(keys, s) for s in range(games)], chunksize=8):
            for w in winners:
                wins[seated[w]] += 1 / len(winners)
            turns.append(turn)
            slain += dragon
    table = Table(title=f"{games} games · {time.time() - started:.1f}s")
    for col in ("bot", "win share"):
        table.add_column(col)
    per_key = {k: keys.count(k) for k in keys}
    for k in dict.fromkeys(keys):
        table.add_row(k, f"{wins[k] / games / per_key[k]:.3f}")
    console.print(table)
    console.print(f"mean turns {sum(turns) / len(turns):.0f} · dragon slain in {slain / games:.0%} of games")


@app.command()
def train(
    config: Annotated[str | None, typer.Option("-c", help="YAML config, e.g. configs/bc.yaml")] = None,
    set_: Annotated[list[str] | None, typer.Option("-s", help="Override, e.g. -s train.lr=1e-4")] = None,
    resume: Annotated[str | None, typer.Option(help="Resume from a checkpoints/latest.pt")] = None,
) -> None:
    """Train the neural player (imitation or PPO, see configs/)."""
    from pathlib import Path

    from karak.rl.config import load_config
    from karak.rl.train import train as run

    run(load_config(config, set_ or []), Path(resume) if resume else None)


@app.command("eval-ai")
def eval_ai(
    policy: Annotated[str, typer.Argument(help="Trained policy (.npz)")],
    opponent: Annotated[str, typer.Option(help="Bot in every other seat")] = "champion",
    games: Annotated[int, typer.Option("-n", help="Games per table size")] = 500,
    sizes: Annotated[str, typer.Option(help="Table sizes")] = "2,3,4,5",
    seed: int = 2026,
    workers: int = 10,
) -> None:
    """A policy in one seat (rotating, random heroes) against bots, batched on the GPU. Win share x table size:
    1.0 is a fair share, 2.0 wins twice as often as an equal player would."""
    import numpy as np

    from karak.rl.env import EnvConfig
    from karak.rl.network import KarakNet
    from karak.rl.train import eval_specs, evaluate, resolve_device
    from karak.rl.vec_env import VecEnv

    device = resolve_device("auto")
    net = KarakNet.from_policy(policy).to(device)
    table = [int(s) for s in sizes.split(",")]
    specs = eval_specs(table, games, opponent, seed)
    envs = VecEnv(EnvConfig(opponents={opponent: 1.0}, teacher=None, max_turns=1500), 128, workers, seed=seed)
    started = time.time()
    try:
        infos = evaluate(net, envs, specs, device, amp=True)
    finally:
        envs.close()
    out = Table(title=f"{policy} vs {opponent} · {len(specs)} games · {time.time() - started:.0f}s")
    for col in ("players", "games", "win rate", "win × n (fair = 1)", "± 95%"):
        out.add_column(col)
    for n in table:
        rows = [i for s, i in zip(specs, infos, strict=True) if len(s.heroes) == n]
        x = np.array([r["win_vs_fair"] for r in rows])
        out.add_row(
            str(n), str(len(x)), f"{x.mean() / n:.3f}", f"{x.mean():.2f}", f"{1.96 * x.std() / len(x) ** 0.5:.2f}"
        )
    console.print(out)


def _lan_ip() -> str | None:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("10.255.255.255", 1))  # no packet is sent; picks the outbound interface
            ip = s.getsockname()[0]
        except OSError:
            return None
    return None if ip.startswith("127.") else ip


def _start_tunnel(port: int) -> tuple[subprocess.Popen[str], str]:
    import re
    import shutil

    exe = shutil.which("cloudflared")
    if exe is None:
        raise typer.BadParameter("--tunnel needs cloudflared: `brew install cloudflared`")
    proc = subprocess.Popen(
        [exe, "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{port}"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    assert proc.stderr is not None
    pattern = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")
    deadline = time.time() + 30
    for line in proc.stderr:
        if match := pattern.search(line):
            return proc, match.group(0)
        if time.time() > deadline:
            break
    proc.terminate()
    raise typer.BadParameter("cloudflared did not report a public URL")


@app.command()
def serve(
    host: Annotated[str, typer.Option(help="Interface to bind; 0.0.0.0 lets your LAN join")] = "0.0.0.0",
    port: int = 8000,
    public_url: Annotated[str | None, typer.Option(help="Base URL used in invite links")] = None,
    tunnel: Annotated[bool, typer.Option(help="Open a public cloudflared tunnel and invite through it")] = False,
) -> None:
    """Host the multiplayer web game. Share the table link; friends join from their browser."""
    import uvicorn

    from karak.bots import REGISTRY
    from karak.web.server import create_app

    ip = _lan_ip() if host == "0.0.0.0" else None
    lan_url = f"http://{ip}:{port}" if ip else None
    proc = None
    if tunnel:
        proc, public_url = _start_tunnel(port)
    console.print("[bold yellow]Karak server[/]")
    console.print(f"  local:   http://localhost:{port}")
    if lan_url:
        console.print(f"  network: {lan_url}   (same Wi-Fi / LAN)")
    if public_url:
        console.print(f"  public:  {public_url}")
    elif not lan_url:
        console.print("[dim]  bind --host 0.0.0.0 or use --tunnel to invite people from other machines")
    console.print(f"  bots:    {', '.join(b.label for b in REGISTRY.values())}")
    console.print("[dim]  table activity is logged below (Ctrl+C to stop)\n")
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s  %(message)s", datefmt="%H:%M:%S"))
    web_log = logging.getLogger("karak.web")
    web_log.addHandler(handler)
    web_log.setLevel(logging.INFO)
    web_log.propagate = False
    try:
        uvicorn.run(create_app(public_url=public_url, lan_url=lan_url), host=host, port=port, log_level="warning")
    finally:
        if proc is not None:
            proc.terminate()


def main() -> None:
    app()
