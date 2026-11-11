"""Play a whole game through the real browser UI (clicks only) and fail on any page error.

    uv run python scripts/ui_check.py [--bots 2] [--seed 5] [--max-turns 400] [--headed] [--shots shots/ui]

The human seat explores and fights by clicking glowing spots, the ghost tile's ✓, combat and panel buttons,
while bots play on the server. Screenshots of interesting moments land in --shots.
"""

from __future__ import annotations

import argparse
import asyncio
import random
import time
from pathlib import Path

from demo import prepare, serving
from playwright.async_api import Page, async_playwright

from karak.web.server import create_app

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


class Checker:
    def __init__(self, page: Page, shots: Path, seed: int) -> None:
        self.page = page
        self.shots = shots
        self.rng = random.Random(seed)
        self.errors: list[str] = []
        self.taken: set[str] = set()
        self.clicks: dict[str, int] = {}
        page.on("pageerror", lambda e: self.errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: m.type == "error" and self.errors.append(f"console: {m.text}"))

    async def shot(self, name: str) -> None:
        if name not in self.taken:
            self.taken.add(name)
            await self.page.screenshot(path=str(self.shots / f"{name}.png"))

    async def visible(self, selector: str) -> bool:
        return await self.page.locator(selector).count() > 0

    async def click_box(self, selector: str, index: int = 0) -> None:
        box = await self.page.locator(selector).nth(index).bounding_box()
        assert box, selector
        await self.page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)

    async def press(self, name: str, selector: str, shot: str | None = None) -> bool:
        loc = self.page.locator(selector)
        if not await loc.count():
            return False
        if shot:
            await self.shot(shot)
        await loc.first.click()
        self.clicks[name] = self.clicks.get(name, 0) + 1
        return True

    async def settle(self) -> None:
        await self.page.wait_for_timeout(250)

    async def smoke_dialogs(self) -> None:
        page = self.page
        await page.get_by_title("How to play").click()
        await page.wait_for_selector(".backdrop")
        await self.shot("rules")
        await page.keyboard.press("Escape")
        await self.settle()
        await page.get_by_title("Scores").click()
        await self.settle()
        await self.shot("scores")
        await page.keyboard.press("Escape")
        await self.settle()

    async def my_turn(self) -> bool:
        panel = "#panel .float-panel"
        if await self.visible(f"{panel}.place-panel"):
            await self.shot("place")
            if self.rng.random() < 0.5 and await self.visible(".ghost-hit"):
                await self.click_box(".ghost-hit")
                await self.settle()
            await self.click_box(f"{panel}.place-panel .btn.primary")
            self.clicks["place"] = self.clicks.get("place", 0) + 1
            return True
        for name, selector, shot in [
            ("strike", f"{panel} .btn.strike", "strike"),
            ("roll", f"{panel} .btn.primary.big", "combat"),
            ("token", f"{panel} .offer-btn", "foresight"),
            ("panel", f"{panel} .actions .btn", "panel"),
        ]:
            if await self.press(name, selector, shot):
                return True
        if not await self.visible(".status.mine"):
            return False
        if await self.press("chest", ".ab-buttons .btn.primary:not(.end-btn)", "chest"):
            return True
        spots = self.page.locator("g.spot")
        n = await spots.count()
        if n and self.rng.random() < 0.9:
            await self.shot("spots")
            await self.click_box("g.spot", self.rng.randrange(n))
            self.clicks["spot"] = self.clicks.get("spot", 0) + 1
            return True
        return await self.press("end", ".end-btn")


async def run(args: argparse.Namespace) -> int:
    shots = Path(args.shots)
    shots.mkdir(parents=True, exist_ok=True)
    room = prepare("lobby", bots=args.bots, seed=args.seed, delay_scale=0.02)
    room.settings.hints = True
    host = next(iter(room.members))
    room.handle(host, {"type": "start"})
    app = create_app(delay_scale=0.02)
    async with serving(app, room, port=args.port) as url, async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=CHROME, headless=not args.headed)
        page = await browser.new_page(viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
        check = Checker(page, shots, args.seed)
        await page.goto(url)
        await page.wait_for_selector(".board-svg")
        await check.smoke_dialogs()
        deadline = time.monotonic() + args.timeout
        while room.status == "playing" and time.monotonic() < deadline:
            if room.game and room.game.turn > args.max_turns:
                break
            if await check.visible(".status.mine") and await check.visible('button[title^="Ask"]'):
                await check.press("hint", 'button[title^="Ask"]', "hint-before")
                await check.settle()
                await check.shot("hint")
            acted = await check.my_turn()
            await page.wait_for_timeout(250 if acted else 100)
        await check.settle()
        await check.shot("end" if room.status != "playing" else "stopped")
        await browser.close()
    turn = room.game.turn if room.game else 0
    print(f"status={room.status} turn={turn} clicks={dict(sorted(check.clicks.items()))}")
    for err in check.errors:
        print(err)
    return 1 if check.errors else 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bots", type=int, default=2)
    ap.add_argument("--seed", type=int, default=5)
    ap.add_argument("--max-turns", type=int, default=400)
    ap.add_argument("--timeout", type=float, default=300)
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--port", type=int, default=8767)
    ap.add_argument("--shots", default="shots/ui")
    raise SystemExit(asyncio.run(run(ap.parse_args())))


if __name__ == "__main__":
    main()
