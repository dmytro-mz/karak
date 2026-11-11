"""Player actions and their JSON form (the web protocol uses `to_json` / `from_json`)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from karak.game.model import Pos


@dataclass(frozen=True)
class Move:
    """Walk onto the neighbouring discovered tile."""

    dir: int


@dataclass(frozen=True)
class Explore:
    """Draw a tile from the pile and lay it next to the hero's tile, through an open exit."""

    dir: int


@dataclass(frozen=True)
class Place:
    """Choose how the freshly drawn tile is turned (quarter turns clockwise)."""

    rotation: int


@dataclass(frozen=True)
class Teleport:
    to: Pos


@dataclass(frozen=True)
class Swap:
    """Warlock: trade places with another hero (costs the whole turn's movement)."""

    seat: int


@dataclass(frozen=True)
class ChooseToken:
    """Oracle: keep one of the two drawn tokens."""

    index: int


@dataclass(frozen=True)
class Roll:
    pass


@dataclass(frozen=True)
class Reroll:
    """Warrior: throw both dice again (the second result stands)."""


@dataclass(frozen=True)
class Strike:
    """Settle the fight with the current roll, adding `bolts` magic bolts and optionally a blood price."""

    bolts: int = 0
    sacrifice: bool = False


@dataclass(frozen=True)
class Sneak:
    """Thief: slip past the monster instead of fighting it."""


@dataclass(frozen=True)
class Loot:
    """Inventory full: `drop` = index (within that slot type) of the item to leave behind, None = leave the new one."""

    drop: int | None


@dataclass(frozen=True)
class Curse:
    seat: int | None  # None: the curse stays where it is


@dataclass(frozen=True)
class Reincarnate:
    at: Pos


@dataclass(frozen=True)
class Pickup:
    index: int  # item on the floor
    drop: int | None = None  # when that slot type is full: which owned item to leave behind


@dataclass(frozen=True)
class OpenChest:
    pass


@dataclass(frozen=True)
class CastHealing:
    seat: int
    at: Pos


@dataclass(frozen=True)
class EndTurn:
    pass


Action = (
    Move
    | Explore
    | Place
    | Teleport
    | Swap
    | ChooseToken
    | Roll
    | Reroll
    | Strike
    | Sneak
    | Loot
    | Curse
    | Reincarnate
    | Pickup
    | OpenChest
    | CastHealing
    | EndTurn
)


class BadAction(ValueError):
    pass


def _int(value: object, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise BadAction(f"{name} must be an integer")
    return value


def _opt_int(value: object, name: str) -> int | None:
    return None if value is None else _int(value, name)


def _pos(value: object, name: str) -> Pos:
    if not isinstance(value, list | tuple) or len(value) != 2:
        raise BadAction(f"{name} must be [x, y]")
    return Pos(_int(value[0], name), _int(value[1], name))


def from_json(data: object) -> Action:
    if not isinstance(data, dict):
        raise BadAction("action must be an object")
    match data.get("type"):
        case "move":
            return Move(_int(data.get("dir"), "dir"))
        case "explore":
            return Explore(_int(data.get("dir"), "dir"))
        case "place":
            return Place(_int(data.get("rotation"), "rotation"))
        case "teleport":
            return Teleport(_pos(data.get("to"), "to"))
        case "swap":
            return Swap(_int(data.get("seat"), "seat"))
        case "choose_token":
            return ChooseToken(_int(data.get("index"), "index"))
        case "roll":
            return Roll()
        case "reroll":
            return Reroll()
        case "strike":
            sacrifice = data.get("sacrifice", False)
            if not isinstance(sacrifice, bool):
                raise BadAction("sacrifice must be true or false")
            return Strike(_int(data.get("bolts", 0), "bolts"), sacrifice)
        case "sneak":
            return Sneak()
        case "loot":
            return Loot(_opt_int(data.get("drop"), "drop"))
        case "curse":
            return Curse(_opt_int(data.get("seat"), "seat"))
        case "reincarnate":
            return Reincarnate(_pos(data.get("at"), "at"))
        case "pickup":
            return Pickup(_int(data.get("index"), "index"), _opt_int(data.get("drop"), "drop"))
        case "open_chest":
            return OpenChest()
        case "cast_healing":
            return CastHealing(_int(data.get("seat"), "seat"), _pos(data.get("at"), "at"))
        case "end_turn":
            return EndTurn()
    raise BadAction("unknown action")


def to_json(action: Action) -> dict[str, Any]:
    match action:
        case Move(d):
            return {"type": "move", "dir": d}
        case Explore(d):
            return {"type": "explore", "dir": d}
        case Place(r):
            return {"type": "place", "rotation": r}
        case Teleport(to):
            return {"type": "teleport", "to": list(to)}
        case Swap(seat):
            return {"type": "swap", "seat": seat}
        case ChooseToken(i):
            return {"type": "choose_token", "index": i}
        case Roll():
            return {"type": "roll"}
        case Reroll():
            return {"type": "reroll"}
        case Strike(bolts, sacrifice):
            return {"type": "strike", "bolts": bolts, "sacrifice": sacrifice}
        case Sneak():
            return {"type": "sneak"}
        case Loot(drop):
            return {"type": "loot", "drop": drop}
        case Curse(seat):
            return {"type": "curse", "seat": seat}
        case Reincarnate(at):
            return {"type": "reincarnate", "at": list(at)}
        case Pickup(index, drop):
            return {"type": "pickup", "index": index, "drop": drop}
        case OpenChest():
            return {"type": "open_chest"}
        case CastHealing(seat, at):
            return {"type": "cast_healing", "seat": seat, "at": list(at)}
        case EndTurn():
            return {"type": "end_turn"}
    raise BadAction("unknown action")
