"""HTTP + WebSocket server. Rooms live in memory; anyone with the link can join."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import secrets
import time
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from karak.game.model import ITEMS, MONSTERS
from karak.web.room import Room, RoomError, bots_public, heroes_public

log = logging.getLogger(__name__)

STATIC = Path(__file__).parent / "static"
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 5
MAX_ROOMS = 500
ROOM_TTL = 3 * 3600.0  # seconds without any connection before a room is dropped
SWEEP_INTERVAL = 5.0
OVERVIEW_INTERVAL = 600.0
MAX_QUEUE = 1000


class RevalidatedStatic(StaticFiles):
    """Browsers must revalidate (cheap 304 via ETag), so a restarted server never runs a stale client."""

    def file_response(self, *args: Any, **kwargs: Any) -> Any:
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "no-cache"
        return response


class Connection:
    """One websocket. Sends go through a queue so a slow client never blocks the room."""

    def __init__(self, ws: WebSocket, member_id: str) -> None:
        self.ws = ws
        self.member_id = member_id
        self.queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    def send(self, message: dict[str, Any]) -> None:
        if self.queue.qsize() < MAX_QUEUE:
            self.queue.put_nowait(message)

    async def pump(self) -> None:
        while True:
            message = await self.queue.get()
            await self.ws.send_json(message)


class RoomManager:
    def __init__(self, delay_scale: float = 1.0) -> None:
        self.delay_scale = delay_scale
        self.rooms: dict[str, Room] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}

    def create(self) -> Room:
        if len(self.rooms) >= MAX_ROOMS:
            raise HTTPException(503, "Too many tables open, try again later")
        while True:
            code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
            if code not in self.rooms:
                break
        return self.adopt(Room(code, delay_scale=self.delay_scale))

    def adopt(self, room: Room) -> Room:
        """Register a room and start its driver (needs a running event loop)."""
        self.rooms[room.id] = room
        self._tasks[room.id] = asyncio.create_task(room.drive(), name=f"room-{room.id}")
        return room

    def get(self, code: str) -> Room | None:
        return self.rooms.get(code.upper())

    def drop(self, code: str) -> None:
        room = self.rooms.pop(code, None)
        if room is not None:
            room.close()
            if room.members:
                log.info("table %s closed · %d tables open", code, len(self.rooms))
        task = self._tasks.pop(code, None)
        if task is not None:
            task.cancel()

    def overview(self) -> str:
        live = [room for room in self.rooms.values() if room.members]
        if not live:
            return "no tables open"
        return "\n".join([f"{len(live)} tables open:", *(f"  {room.describe()}" for room in live)])

    async def sweep(self) -> None:
        last_overview, last_text = time.monotonic(), "no tables open"
        while True:
            await asyncio.sleep(SWEEP_INTERVAL)
            for code, room in list(self.rooms.items()):
                if room.idle_for > ROOM_TTL:
                    self.drop(code)
                else:
                    room.check_host()
            if time.monotonic() - last_overview >= OVERVIEW_INTERVAL:
                last_overview, text = time.monotonic(), self.overview()
                if text != last_text:
                    log.info(text)
                    last_text = text

    def close(self) -> None:
        for code in list(self.rooms):
            self.drop(code)


def catalogue() -> dict[str, Any]:
    """Static game data the client needs to draw and explain things."""
    return {
        "heroes": heroes_public(),
        "monsters": [
            {"key": m.key, "name": m.name, "strength": m.strength, "loot": m.loot, "count": m.count}
            for m in MONSTERS.values()
        ],
        "items": [
            {
                "key": i.key,
                "name": i.name,
                "slot": i.slot.value if i.slot else None,
                "power": i.power,
                "points": i.points,
            }
            for i in ITEMS.values()
        ],
    }


def create_app(public_url: str | None = None, lan_url: str | None = None, delay_scale: float = 1.0) -> FastAPI:
    manager = RoomManager(delay_scale=delay_scale)
    data = catalogue()

    @contextlib.asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        sweeper = asyncio.create_task(manager.sweep())
        yield
        sweeper.cancel()
        manager.close()

    app = FastAPI(title="Karak", lifespan=lifespan, docs_url=None, redoc_url=None)
    app.state.manager = manager

    @app.get("/api/config")
    async def config() -> dict[str, Any]:
        return {"public_url": public_url, "lan_url": lan_url, "bots": bots_public(), **data}

    @app.post("/api/rooms")
    async def create_room() -> dict[str, str]:
        return {"room": manager.create().id}

    @app.get("/api/rooms/{code}")
    async def room_info(code: str) -> dict[str, Any]:
        room = manager.get(code)
        if room is None:
            raise HTTPException(404, "No table with that code")
        return {"room": room.id, "status": room.status, "players": len(room.seats)}

    @app.websocket("/ws/{code}")
    async def websocket(ws: WebSocket, code: str) -> None:
        await ws.accept()
        room = manager.get(code)
        if room is None:
            await ws.send_json({"type": "fatal", "message": "This table doesn't exist (anymore)."})
            await ws.close()
            return
        try:
            hello = await ws.receive_json()
        except (WebSocketDisconnect, ValueError):
            return
        token = hello.get("token") if isinstance(hello, dict) else None
        if not isinstance(token, str) or not 16 <= len(token) <= 64:
            await ws.send_json({"type": "fatal", "message": "Bad handshake"})
            await ws.close()
            return
        origin = ws.headers.get("cf-connecting-ip") or (ws.client.host if ws.client else "")
        member = room.join(token, hello.get("name"), origin)
        conn = Connection(ws, member.id)
        pump = asyncio.create_task(conn.pump())
        room.connect(conn)
        try:
            while True:
                msg = await ws.receive_json()
                if not isinstance(msg, dict):
                    continue
                try:
                    reply = room.handle(member.id, msg)
                except RoomError as e:
                    conn.send({"type": "error", "message": str(e)})
                else:
                    if reply is not None:
                        conn.send(reply)
        except (WebSocketDisconnect, ValueError, RuntimeError):
            pass
        finally:
            room.disconnect(conn)
            pump.cancel()

    @app.get("/")
    @app.get("/r/{code}")
    async def index(code: str | None = None) -> FileResponse:
        return FileResponse(STATIC / "index.html", headers={"Cache-Control": "no-cache"})

    app.mount("/static", RevalidatedStatic(directory=STATIC), name="static")
    return app
