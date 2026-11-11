"""Screenshot a URL with Chrome via Playwright; prints any JS errors (visual checks during development).

uv run python scripts/shot.py URL OUT.png [WIDTH HEIGHT]   (SHOT_CLICK / SHOT_HOVER=css-selector act first)
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from playwright.async_api import ConsoleMessage, Response, async_playwright

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


async def shoot(url: str, out: Path, width: int, height: int) -> int:
    errors: list[str] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=CHROME)
        page = await browser.new_page(viewport={"width": width, "height": height}, reduced_motion="reduce")
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        def console(m: ConsoleMessage) -> None:
            if m.type == "error" and "Failed to load resource" not in m.text:  # reported with its URL below
                errors.append(f"console: {m.text}")

        def response(r: Response) -> None:
            if r.status >= 400 and not r.url.endswith("favicon.ico"):
                errors.append(f"http {r.status}: {r.url}")

        page.on("console", console)
        page.on("response", response)
        await page.goto(url)
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(1500)
        if click := os.environ.get("SHOT_CLICK"):
            await page.click(click)
            await page.wait_for_timeout(300)
        if hover := os.environ.get("SHOT_HOVER"):
            await page.hover(hover)
            await page.wait_for_timeout(300)
        await page.screenshot(path=str(out))
        await browser.close()
    for e in errors:
        print(e)
    print(out)
    return 1 if errors else 0


def main() -> None:
    url, out = sys.argv[1], Path(sys.argv[2]).resolve()
    width, height = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (1440, 900)
    sys.exit(asyncio.run(shoot(url, out, width, height)))


if __name__ == "__main__":
    main()
