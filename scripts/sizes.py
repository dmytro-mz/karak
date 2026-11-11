"""Render the main screens at several resolutions; screenshot each and fail on any horizontal overflow.

uv run python scripts/sizes.py [--sizes 1920x1080,1280x720] [--stages lobby,play] [--out shots/sizes]
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright

sys.path.insert(0, str(Path(__file__).parent))
from demo import TOKEN, prepare, serving
from shot import CHROME

from karak.web.server import create_app

SIZES = "1920x1080,1600x900,1440x900,1366x768,1280x720,1180x820,1024x768,820x1180,390x844"
STAGES = "lobby,play,combat,curse,heal"
SEEDS = {"heal": 4}
WATCH = ".topbar, .panel, .seat-row, .lobby-grid, .dock, .sheet, .action-bar, .float-panel, .pl-row, .modal, .status"

# Elements whose content is wider than their box, or that stick out of the window.
OVERFLOW_JS = """(sel) => {
  const out = [];
  const cls = (el) => (typeof el.className === "string" ? el.className.trim().split(/\\s+/) : []);
  const name = (el) => [el.tagName.toLowerCase(), ...cls(el)].join(".");
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (!r.width || getComputedStyle(el).visibility === "hidden") continue;
    if (el.closest("aside.side") && !el.closest("aside.side.open") && innerWidth <= 1100) continue;
    const [sw, cw] = [el.scrollWidth, el.clientWidth];
    if (sw > cw + 2) out.push(`${name(el)} content ${sw}px > box ${cw}px`);
    const [left, right] = [Math.round(r.left), Math.round(r.right)];
    if (right > innerWidth + 1 || left < -1) out.push(`${name(el)} sticks out (${left}..${right} of ${innerWidth})`);
  }
  return out;
}"""


async def check(stage: str, sizes: list[tuple[int, int]], out: Path, port: int) -> list[str]:
    room = prepare(stage, 0 if stage in ("curse", "heal") else 30, 3, SEEDS.get(stage, 3))
    problems: list[str] = []
    async with serving(create_app(), room, port) as url, async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=CHROME)
        for w, h in sizes:
            page = await browser.new_page(viewport={"width": w, "height": h}, reduced_motion="reduce")
            errors: list[str] = []
            page.on("pageerror", lambda e, errors=errors: errors.append(str(e)))
            await page.goto(url)
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(800)
            if stage == "heal":
                await page.click(".slot.castable")
                await page.wait_for_timeout(300)
            await page.screenshot(path=str(out / f"{stage}-{w}x{h}.png"))
            found = errors + await page.evaluate(OVERFLOW_JS, WATCH)
            problems += [f"{stage} {w}x{h}: {p}" for p in dict.fromkeys(found)]
            await page.close()
        await browser.close()
    assert TOKEN
    return problems


async def run(args: argparse.Namespace) -> int:
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    sizes = [tuple(int(v) for v in s.split("x")) for s in args.sizes.split(",")]
    problems: list[str] = []
    for i, stage in enumerate(args.stages.split(",")):
        problems += await check(stage, sizes, out, args.port + i)  # type: ignore[arg-type]
    for p in problems:
        print(p)
    print(f"{len(problems)} problem(s); screenshots in {out}")
    return 1 if problems else 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sizes", default=SIZES)
    ap.add_argument("--stages", default=STAGES)
    ap.add_argument("--out", default="shots/sizes")
    ap.add_argument("--port", type=int, default=8790)
    sys.exit(asyncio.run(run(ap.parse_args())))


if __name__ == "__main__":
    main()
