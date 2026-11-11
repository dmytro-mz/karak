import random
from typing import Any

import pytest
from fastapi.testclient import TestClient

from karak.bots import MODELS
from karak.game.engine import Phase
from karak.game.model import Hero
from karak.web.room import Room, RoomError
from karak.web.server import create_app

TOKENS = ["a" * 32, "b" * 32, "c" * 32]


class Inbox:
    def __init__(self, member_id: str) -> None:
        self.member_id = member_id
        self.messages: list[dict[str, Any]] = []

    def send(self, message: dict[str, Any]) -> None:
        self.messages.append(message)

    @property
    def last_state(self) -> dict[str, Any]:
        return next(m for m in reversed(self.messages) if m["type"] == "state")


def _room(humans: int = 2, bots: tuple[str, ...] = ("champion",), seed: int = 5) -> tuple[Room, list[Inbox]]:
    room = Room("TEST", delay_scale=0.0, seed=seed)
    inboxes = []
    for i in range(humans):
        member = room.join(TOKENS[i], f"Human {i}")
        inbox = Inbox(member.id)
        room.connect(inbox)
        inboxes.append(inbox)
    host = inboxes[0].member_id
    for key in bots:
        room.handle(host, {"type": "add_bot", "bot": key})
    return room, inboxes


def _human_move(room: Room, inbox: Inbox, rng: random.Random) -> bool:
    """Play a random legal action for this human through the room protocol, if it's their move."""
    legal = room.state_for(inbox.member_id)["game"]["legal"]
    if not legal:
        return False
    fighting = [a for a in legal if a["type"] in ("roll", "strike", "place", "choose_token", "loot", "curse")]
    action = rng.choice(fighting or legal)
    room.handle(inbox.member_id, {"type": "action", "action": action})
    return True


def _run(room: Room, inboxes: list[Inbox], limit: int = 20_000) -> None:
    rng = random.Random(1)
    for _ in range(limit):
        if room.status != "playing":
            return
        if any(_human_move(room, inbox, rng) for inbox in inboxes):
            continue
        plan = room.plan()
        assert plan is not None, "nobody can move"
        plan[1]()
    raise AssertionError("game did not finish")


def test_full_game_with_humans_and_a_bot() -> None:
    room, inboxes = _room()
    room.handle(inboxes[0].member_id, {"type": "start"})
    assert room.status == "playing"
    _run(room, inboxes)
    assert room.status == "game_over"
    result = inboxes[1].last_state["game"]["result"]
    assert result and len(result["players"]) == 3
    assert result["winners"]


def test_heroes_are_unique_and_filled_in_at_start() -> None:
    room, inboxes = _room()
    host, guest = inboxes[0].member_id, inboxes[1].member_id
    room.handle(host, {"type": "pick_hero", "hero": "wizard"})
    with pytest.raises(RoomError):
        room.handle(guest, {"type": "pick_hero", "hero": "wizard"})
    with pytest.raises(RoomError):
        room.handle(guest, {"type": "pick_hero", "seat": 2, "hero": "thief"})
    room.handle(host, {"type": "pick_hero", "seat": 2, "hero": "thief"})
    room.handle(host, {"type": "start"})
    assert room.game is not None
    heroes = [p.hero for p in room.game.players]
    assert heroes[0] == Hero.WIZARD and heroes[2] == Hero.THIEF and len(set(heroes)) == 3


def test_oracle_offer_is_hidden_from_other_players() -> None:
    room, inboxes = _room(bots=())
    room.handle(inboxes[0].member_id, {"type": "pick_hero", "hero": "oracle"})
    room.handle(inboxes[0].member_id, {"type": "start"})
    game = room.game
    assert game is not None
    rng = random.Random(3)
    seen_offer = False
    for _ in range(3000):
        if room.status != "playing":
            break
        if game.phase == Phase.CHOOSE_TOKEN:
            mover = game.current
            for i, inbox in enumerate(inboxes):
                g = room.state_for(inbox.member_id)["game"]
                assert g["offer_size"] == len(game.offer)
                assert (g["offer"] == list(game.offer)) if i == mover else (g["offer"] == [])
            seen_offer = seen_offer or len(game.offer) == 2
        for inbox in inboxes:
            seat = room.seat_of(inbox.member_id)
            for msg in inbox.messages[-3:]:
                for e in ((msg.get("event") or {}).get("events") or []) if msg["type"] == "state" else []:
                    if e.get("seat") != seat and e["kind"] == "offer":
                        assert e["tokens"] is None
        if not any(_human_move(room, inbox, rng) for inbox in inboxes):
            plan = room.plan()
            assert plan is not None
            plan[1]()
    assert seen_offer


def test_only_the_host_runs_the_table() -> None:
    room, inboxes = _room()
    with pytest.raises(RoomError):
        room.handle(inboxes[1].member_id, {"type": "start"})
    with pytest.raises(RoomError):
        room.handle(inboxes[1].member_id, {"type": "add_bot", "bot": "squire"})


def test_illegal_actions_are_rejected_without_changing_state() -> None:
    room, inboxes = _room(bots=())
    room.handle(inboxes[0].member_id, {"type": "start"})
    game = room.game
    assert game is not None
    idle = next(i for i in inboxes if room.seat_of(i.member_id) != game.current)
    before = room.state_for(idle.member_id)["game"]
    with pytest.raises(RoomError):
        room.handle(idle.member_id, {"type": "action", "action": {"type": "end_turn"}})
    with pytest.raises(RoomError):
        room.handle(idle.member_id, {"type": "action", "action": {"type": "nonsense"}})
    mover = next(i for i in inboxes if room.seat_of(i.member_id) == game.current)
    with pytest.raises(RoomError):
        room.handle(mover.member_id, {"type": "action", "action": {"type": "strike"}})
    assert room.state_for(idle.member_id)["game"] == before


def test_hint_suggests_a_legal_action() -> None:
    room, inboxes = _room(bots=())
    room.handle(inboxes[0].member_id, {"type": "start"})
    mover = next(i for i in inboxes if room.state_for(i.member_id)["game"]["legal"])
    with pytest.raises(RoomError):
        room.handle(mover.member_id, {"type": "hint"})
    room.settings.hints = True
    reply = room.handle(mover.member_id, {"type": "hint"})
    assert reply is not None and reply["action"] in room.state_for(mover.member_id)["game"]["legal"]
    room.handle(mover.member_id, {"type": "action", "action": reply["action"]})


def test_http_and_websocket_smoke() -> None:
    app = create_app(delay_scale=0.0)
    with TestClient(app) as client:
        assert client.get("/").status_code == 200
        for name in ("app.js", "board.js", "art.js", "style.css"):
            assert client.get(f"/static/{name}").status_code == 200
        config = client.get("/api/config").json()
        models = {p.stem for p in MODELS.glob("*.npz")}
        assert {b["key"] for b in config["bots"]} == {"squire", "adventurer", "champion", *models}
        assert len(config["heroes"]) == 6
        code = client.post("/api/rooms").json()["room"]
        assert client.get(f"/api/rooms/{code}").json()["status"] == "lobby"
        with client.websocket_connect(f"/ws/{code}") as ws:
            ws.send_json({"token": TOKENS[0], "name": "Ada"})
            assert ws.receive_json()["type"] == "welcome"
            state = ws.receive_json()
            assert state["type"] == "state" and state["seats"][0]["name"] == "Ada"
            ws.send_json({"type": "add_bot", "bot": "squire"})
            while (msg := ws.receive_json())["type"] != "state":
                pass
            assert len(msg["seats"]) == 2
        assert client.get("/api/rooms/NOPE").status_code == 404
