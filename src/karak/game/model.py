"""Static game data: directions, tile shapes, the tile pile, the monster bag, items and heroes."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import NamedTuple


class Pos(NamedTuple):
    x: int
    y: int


# Directions: 0 north, 1 east, 2 south, 3 west. Exits are a 4-bit mask, bit d = open towards d.
N, E, S, W = 0, 1, 2, 3
DIRS = (N, E, S, W)
DIR_NAMES = ("north", "east", "south", "west")
DX = (0, 1, 0, -1)
DY = (-1, 0, 1, 0)


def step(pos: Pos, d: int) -> Pos:
    return Pos(pos.x + DX[d], pos.y + DY[d])


def opposite(d: int) -> int:
    return (d + 2) % 4


def rotate(mask: int, quarter_turns: int) -> int:
    """Rotate an exit mask clockwise by `quarter_turns`."""
    r = quarter_turns % 4
    return ((mask << r) | (mask >> (4 - r))) & 0b1111


def has_exit(mask: int, d: int) -> bool:
    return bool(mask >> d & 1)


def exits_of(mask: int) -> list[int]:
    return [d for d in DIRS if has_exit(mask, d)]


class Kind(StrEnum):
    START = "start"  # the light-backed starting tile: a crossroads with a healing fountain
    CORRIDOR = "corridor"
    ROOM = "room"  # draws a token from the bag when first discovered
    FOUNTAIN = "fountain"  # healing fountain
    PORTAL = "portal"  # teleportation gate


HEALING = (Kind.START, Kind.FOUNTAIN)

# Base shapes (unrotated exit masks). The box has no dead ends.
STRAIGHT = 0b0101  # N S
CORNER = 0b0011  # N E
TEE = 0b0111  # N E S
CROSS = 0b1111

# 79 face-down tiles + the start tile = 80, like the box; one room per token in the bag.
TILE_PILE: tuple[tuple[Kind, int, int], ...] = (
    (Kind.CORRIDOR, STRAIGHT, 4),
    (Kind.CORRIDOR, CORNER, 4),
    (Kind.CORRIDOR, TEE, 5),
    (Kind.CORRIDOR, CROSS, 7),
    (Kind.ROOM, STRAIGHT, 13),
    (Kind.ROOM, CORNER, 13),
    (Kind.ROOM, TEE, 13),
    (Kind.ROOM, CROSS, 14),
    (Kind.FOUNTAIN, CORNER, 2),
    (Kind.PORTAL, STRAIGHT, 4),
)


def tile_pile() -> list[tuple[Kind, int]]:
    return [(kind, mask) for kind, mask, n in TILE_PILE for _ in range(n)]


class Slot(StrEnum):
    WEAPON = "weapon"
    SPELL = "spell"
    KEY = "key"


SLOTS = {Slot.WEAPON: 2, Slot.SPELL: 3, Slot.KEY: 1}


@dataclass(frozen=True)
class ItemDef:
    key: str
    name: str
    slot: Slot | None  # None: treasure, kept outside the inventory
    power: int = 0  # weapons: added to every combat roll
    points: int = 0  # treasure, in half points (the dragon's ruby is worth 1.5)


ITEMS: dict[str, ItemDef] = {
    i.key: i
    for i in (
        ItemDef("dagger", "Daggers", Slot.WEAPON, power=1),
        ItemDef("sword", "Sword", Slot.WEAPON, power=2),
        ItemDef("axe", "Axe", Slot.WEAPON, power=3),
        ItemDef("bolt", "Magic bolt", Slot.SPELL),
        ItemDef("healing", "Portal of healing", Slot.SPELL),
        ItemDef("key", "Key", Slot.KEY),
        ItemDef("treasure", "Treasure", None, points=2),
        ItemDef("ruby", "Dragon's ruby", None, points=3),
    )
}


@dataclass(frozen=True)
class MonsterDef:
    key: str
    name: str
    strength: int
    loot: str  # ITEMS key on the back of the token
    count: int


MONSTERS: dict[str, MonsterDef] = {
    m.key: m
    for m in (
        MonsterDef("rat", "Giant rat", 5, "dagger", 8),
        MonsterDef("spider", "Giant spider", 6, "healing", 4),
        MonsterDef("mummy", "Mummy", 7, "bolt", 8),
        MonsterDef("turnkey", "Skeleton turnkey", 8, "key", 12),
        MonsterDef("skeleton", "Skeleton warrior", 9, "sword", 5),
        MonsterDef("king", "Skeleton king", 10, "axe", 3),
        MonsterDef("fallen", "The Fallen", 12, "treasure", 2),
        MonsterDef("dragon", "Dragon", 15, "ruby", 1),
    )
}
CHEST = "chest"
CHESTS = 10


def bag() -> list[str]:
    return [m.key for m in MONSTERS.values() for _ in range(m.count)] + [CHEST] * CHESTS


class Hero(StrEnum):
    WARRIOR = "warrior"
    THIEF = "thief"
    WIZARD = "wizard"
    WARLOCK = "warlock"
    SWORDSMAN = "swordsman"
    ORACLE = "oracle"


@dataclass(frozen=True)
class HeroDef:
    key: Hero
    name: str
    skills: tuple[tuple[str, str], ...]  # (name, what it does)


HEROES: dict[Hero, HeroDef] = {
    h.key: h
    for h in (
        HeroDef(
            Hero.WARRIOR,
            "Warrior",
            (
                ("Second swing", "May roll both dice again once per fight, but must keep the second roll."),
                ("Undying", "Instead of falling unconscious, wakes up fully healed at a healing fountain."),
            ),
        ),
        HeroDef(
            Hero.THIEF,
            "Thief",
            (
                ("Backstab", "Wins every fight that would be a tie."),
                (
                    "Shadow step",
                    "May slip past a monster instead of fighting it, as long as she has a move left to go on.",
                ),
            ),
        ),
        HeroDef(
            Hero.WIZARD,
            "Wizard",
            (
                ("Arcane focus", "Magic bolts are not used up when cast (portals of healing are)."),
                ("Phase walk", "Moves through walls between tiles that are already discovered."),
            ),
        ),
        HeroDef(
            Hero.WARLOCK,
            "Warlock",
            (
                ("Blood price", "Once per fight, after rolling, may give up 1 HP for +1."),
                (
                    "Shadow swap",
                    "At the start of the turn, may swap places with another hero for all 4 moves.",
                ),
            ),
        ),
        HeroDef(
            Hero.SWORDSMAN,
            "Swordsman",
            (
                ("Steady blade", "Any die that shows a 1 is rolled again."),
                ("Relentless", "If a die shows a 6, the turn goes on after the fight."),
            ),
        ),
        HeroDef(
            Hero.ORACLE,
            "Oracle",
            (
                ("Foresight", "+1 in a fight that starts on the first move of the turn."),
                ("Fate's choice", "Draws two tokens from the bag, keeps one and returns the other."),
            ),
        ),
    )
}


@dataclass
class Tile:
    id: int
    pos: Pos
    kind: Kind
    exits: int
    token: str | None = None  # monster key or CHEST
    items: list[str] = field(default_factory=list)  # equipment lying on the floor

    @property
    def monster(self) -> str | None:
        return self.token if self.token in MONSTERS else None

    def to_json(self) -> dict[str, object]:
        return {
            "id": self.id,
            "x": self.pos.x,
            "y": self.pos.y,
            "kind": self.kind.value,
            "exits": self.exits,
            "token": self.token,
            "items": list(self.items),
        }
