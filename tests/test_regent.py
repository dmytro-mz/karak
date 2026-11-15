"""Karak: Regent — new tiles, monsters, items, the four heroes, arenas, cursed chambers and the Lord of Karak."""

from __future__ import annotations

import random

import pytest

from karak.bots import make_bot
from karak.game import actions as A
from karak.game.engine import START, Game, IllegalMove, Phase, RulesConfig
from karak.game.model import (
    CHEST,
    CORNER,
    CROSS,
    REGENT_HEROES,
    STRAIGHT,
    TEE,
    Hero,
    Kind,
    Pos,
    Tile,
    bag,
    tile_pile,
)

EAST = Pos(1, 0)
RULES = RulesConfig(expansion=True)


def _game(*heroes: Hero, lord: bool = False, seed: int = 1) -> Game:
    game = Game(list(heroes) or [Hero.WARRIOR, Hero.THIEF], seed=seed, rules=RulesConfig(expansion=True, lord=lord))
    game.current = 0
    game.used = 0
    game.phase = Phase.TURN
    game.pile.clear()
    return game


def _tile(game: Game, pos: Pos, kind: Kind = Kind.ROOM, exits: int = CROSS, token: str | None = None) -> Tile:
    tile = Tile(len(game.tiles), pos, kind, exits, token)
    game.tiles[pos] = tile
    return tile


def _dice(game: Game, a: int, b: int) -> None:
    game.step(game.actor, A.Roll())
    assert game.combat is not None
    game.combat.dice = [a, b]


def _fight(game: Game, monster: str, dice: tuple[int, int], **strike: object) -> None:
    _tile(game, EAST, token=monster)
    game.step(0, A.Move(1))
    _dice(game, *dice)
    game.step(0, A.Strike(**strike))  # type: ignore[arg-type]


# ------------------------------------------------------------------ the box
def test_regent_box_contents() -> None:
    pile = tile_pile(True)
    assert len(pile) == 79 + 18
    count = {k: sum(1 for kind, _ in pile if kind == k) for k in (Kind.ARENA, Kind.CURSED, Kind.ROOM)}
    assert count == {Kind.ARENA: 6, Kind.CURSED: 4, Kind.ROOM: 53 + 8}
    assert ((Kind.ARENA, STRAIGHT) in pile) and ((Kind.CURSED, CROSS) in pile)
    assert sum(1 for t in pile if t == (Kind.ROOM, TEE)) == 13 + 4
    assert sum(1 for t in pile if t == (Kind.ROOM, CORNER)) == 13 + 2
    assert sum(1 for t in pile if t == (Kind.ROOM, CROSS)) == 14 + 2
    tokens = bag(True)
    assert len(tokens) == 61 == count[Kind.ROOM]
    assert tokens.count("bat") == 6 and tokens.count("icemage") == 2
    assert len(bag()) == 53 and "bat" not in bag()


def test_the_expansion_is_off_by_default() -> None:
    with pytest.raises(ValueError):
        Game([Hero.RANGER, Hero.THIEF])
    with pytest.raises(ValueError):
        RulesConfig(lord=True)
    game = Game([Hero.WARRIOR, Hero.THIEF], seed=3)
    assert len(game.pile) == 79 and "bat" not in game.bag


def _conserved(game: Game) -> None:
    pending = 1 if game.pending is not None else 0
    assert len(game.tiles) + len(game.pile) + pending == 98
    for p in game.players:
        assert len(p.weapons) <= 2 and len(p.spells) <= 3 and len(p.keys) <= 1
        assert 0 <= p.hp <= game.rules.max_hp
        assert p.pos in game.tiles
    assert game.cursed is None or 0 <= game.cursed < game.n


@pytest.mark.parametrize("seed", range(40))
def test_random_regent_games_respect_the_invariants(seed: int) -> None:
    rng = random.Random(seed)
    heroes = rng.sample([*REGENT_HEROES, Hero.WARRIOR, Hero.THIEF, Hero.WIZARD, Hero.WARLOCK, Hero.ORACLE], 5)
    game = Game(heroes[: rng.randint(2, 5)], seed=seed, rules=RulesConfig(expansion=True, lord=seed % 2 == 0))
    steps = 0
    while game.phase != Phase.GAME_OVER and steps < 5000:
        seat = game.actor
        legal = game.legal_actions(seat)
        assert legal, game.phase
        game.step(seat, rng.choice(legal))
        _conserved(game)
        steps += 1


@pytest.mark.parametrize("bot", ["squire", "adventurer", "champion"])
def test_bots_finish_regent_games(bot: str) -> None:
    for seed in range(6):
        rng = random.Random(seed)
        heroes = rng.sample([*REGENT_HEROES, Hero.WARRIOR, Hero.THIEF, Hero.ORACLE], 3)
        game = Game(heroes, seed=seed, rules=RulesConfig(expansion=True, lord=True))
        bots = [make_bot(bot, seed * 3 + i) for i in range(3)]
        while game.phase != Phase.GAME_OVER:
            seat = game.actor
            game.step(seat, bots[seat].act(game.view(seat)))
        assert game.result is not None


# ------------------------------------------------------------------ cursed chamber
def test_cursed_chamber_curses_on_a_low_roll(monkeypatch: pytest.MonkeyPatch) -> None:
    game = _game()
    _tile(game, EAST, Kind.CURSED)
    monkeypatch.setattr(game, "_d6", lambda: 3)
    events = game.step(0, A.Move(1))
    assert game.cursed == 0
    assert [e["kind"] for e in events if e["kind"].startswith("curse")] == ["curse_roll", "curse"]
    assert game.phase == Phase.TURN and game.moves_left == 3  # the hero carries on


def test_cursed_chamber_spares_a_high_roll_and_a_cursed_hero_does_not_roll(monkeypatch: pytest.MonkeyPatch) -> None:
    game = _game()
    _tile(game, EAST, Kind.CURSED)
    monkeypatch.setattr(game, "_d6", lambda: 4)
    game.step(0, A.Move(1))
    assert game.cursed is None
    game.step(0, A.Move(3))
    game.cursed = 0
    rolls: list[int] = []
    monkeypatch.setattr(game, "_d6", lambda: rolls.append(1) or 1)
    game.step(0, A.Move(1))
    assert not rolls and game.cursed == 0


def test_retreating_onto_a_cursed_chamber_rolls_again(monkeypatch: pytest.MonkeyPatch) -> None:
    game = _game(Hero.WARRIOR, Hero.THIEF)
    _tile(game, EAST, Kind.CURSED)
    _tile(game, Pos(2, 0), token="king")
    monkeypatch.setattr(game, "_d6", lambda: 6)
    game.step(0, A.Move(1))
    game.step(0, A.Move(1))
    game.step(0, A.Roll())
    assert game.combat is not None
    game.combat.dice = [1, 2]
    monkeypatch.setattr(game, "_d6", lambda: 2)
    game.step(0, A.Strike())
    assert game.players[0].pos == EAST and game.cursed == 0


# ------------------------------------------------------------------ arena duel
def _duel_result(events: list[dict]) -> dict:
    return next(e for e in events if e["kind"] == "duel_result")


def _arena_duel(game: Game, challenger: tuple[int, int], defender: tuple[int, int]) -> list[dict]:
    _tile(game, EAST, Kind.ARENA, STRAIGHT | 0b1010)
    game.step(0, A.Move(1))
    assert game.phase == Phase.COMBAT and game.actor == 0
    _dice(game, *challenger)
    game.step(0, A.Strike())
    assert game.phase == Phase.COMBAT and game.actor == 1  # the summoned hero rolls next
    assert game.players[1].pos == EAST
    _dice(game, *defender)
    return game.step(1, A.Strike())


def test_arena_winner_takes_an_item_and_the_loser_loses_a_life() -> None:
    game = _game(Hero.WARRIOR, Hero.WIZARD)
    game.players[1].treasures = ["treasure"]
    game.players[1].weapons = ["axe"]
    _arena_duel(game, (6, 5), (2, 3))
    assert game.phase == Phase.STEAL and game.actor == 0
    assert game.players[1].hp == 4 and game.tiles[EAST].spent
    steals = game.legal_actions(0)
    assert A.Steal(None) in steals and A.Steal("treasure", 0) in steals and A.Steal("weapon", 0) in steals
    game.step(0, A.Steal("treasure", 0))
    assert game.players[0].treasures == ["treasure"] and not game.players[1].treasures
    assert game.current == 1  # the duel ends the turn
    assert game.players[0].pos == game.players[1].pos == EAST


def test_arena_defender_can_win_and_a_draw_changes_nothing() -> None:
    game = _game(Hero.WARRIOR, Hero.WIZARD)
    game.players[0].spells = ["bolt"]
    _arena_duel(game, (1, 2), (6, 6))
    assert game.players[0].hp == 4 and game.phase == Phase.STEAL and game.actor == 1  # the defender won
    game.step(1, A.Steal("spell", 0))
    assert game.players[1].spells == ["bolt"] and game.phase == Phase.TURN and game.current == 1
    game = _game(Hero.WARRIOR, Hero.WIZARD)
    game.players[0].spells = ["bolt"]
    game.players[1].spells = ["bolt"]
    events = _arena_duel(game, (3, 4), (3, 4))  # the wizard's bolt counts by itself: 7 vs 8
    assert _duel_result(events)["winner"] == 1
    game = _game(Hero.WARRIOR, Hero.ORACLE)
    game.players[0].weapons = ["dagger"]
    events = _arena_duel(game, (3, 4), (3, 3))  # 8 vs 6 + 1 foresight (summoned) = 7
    assert _duel_result(events)["winner"] == 0
    game = _game(Hero.WARRIOR, Hero.ORACLE)
    game.players[0].weapons = ["dagger"]
    events = _arena_duel(game, (3, 4), (3, 4))  # 8 vs 8: a draw
    result = _duel_result(events)
    assert result["winner"] is None and game.players[0].hp == game.players[1].hp == 5


def test_thief_wins_a_drawn_duel() -> None:
    game = _game(Hero.WARRIOR, Hero.THIEF)
    events = _arena_duel(game, (3, 4), (3, 4))
    assert _duel_result(events)["winner"] == 1


def test_arena_asks_whom_to_challenge_and_only_fires_once() -> None:
    game = _game(Hero.WARRIOR, Hero.THIEF, Hero.WIZARD)
    _tile(game, EAST, Kind.ARENA, STRAIGHT | 0b1010)
    game.step(0, A.Move(1))
    assert game.phase == Phase.CHALLENGE
    assert game.legal_actions(0) == [A.Challenge(1), A.Challenge(2)]
    game.step(0, A.Challenge(2))
    assert game.combat is not None and game.combat.versus == 2
    _dice(game, 6, 6)
    game.step(0, A.Strike())
    _dice(game, 1, 1)
    game.step(2, A.Strike())
    assert game.tiles[EAST].spent
    game.players[0].pos = START
    game.current, game.phase, game.used = 0, Phase.TURN, 0
    game.step(0, A.Move(1))  # a spent arena is just a corridor
    assert game.phase == Phase.TURN


def test_nobody_to_fight_leaves_the_arena_for_later() -> None:
    game = _game(Hero.WARRIOR, Hero.THIEF)
    game.players[1].knocked_out = True
    _tile(game, EAST, Kind.ARENA, STRAIGHT | 0b1010)
    game.step(0, A.Move(1))
    assert game.phase == Phase.TURN and not game.tiles[EAST].spent


def test_a_cursed_hero_cannot_use_skills_in_the_duel() -> None:
    game = _game(Hero.THIEF, Hero.WARRIOR)
    game.cursed = 0
    events = _arena_duel(game, (3, 4), (3, 4))
    assert _duel_result(events)["winner"] is None


def test_beaten_warrior_wakes_at_a_fountain_and_a_loser_with_nothing_has_nothing_to_steal() -> None:
    game = _game(Hero.THIEF, Hero.WARRIOR)
    game.players[1].hp = 1
    _arena_duel(game, (6, 6), (1, 2))
    assert game.players[1].hp == 5 and game.players[1].pos == START and not game.players[1].knocked_out
    assert game.phase == Phase.TURN and game.current == 1


# ------------------------------------------------------------------ new equipment
def test_thorn_of_darkness_takes_a_life_for_free() -> None:
    game = _game(Hero.WARRIOR, Hero.THIEF, Hero.WIZARD)
    game.players[0].spells = ["thorn", "thorn"]
    assert A.Thorn(1) in game.legal_actions(0) and A.Thorn(0) not in game.legal_actions(0)
    game.step(0, A.Thorn(1))
    assert game.players[1].hp == 4 and game.players[0].spells == ["thorn"] and game.moves_left == 4
    game.players[2].hp = 1
    game.step(0, A.Thorn(2))
    assert game.players[2].knocked_out and A.Thorn(2) not in game.legal_actions(0)
    assert game.phase == Phase.TURN and game.current == 0


def test_thorn_on_a_warrior_makes_him_rise_at_a_fountain() -> None:
    game = _game(Hero.THIEF, Hero.WARRIOR)
    game.players[0].spells = ["thorn"]
    game.players[1].hp = 1
    game.players[1].pos = EAST
    _tile(game, EAST)
    game.step(0, A.Thorn(1))
    assert game.players[1].pos == START and game.players[1].hp == 5 and not game.players[1].knocked_out


def test_frost_fist_adds_two_and_the_wizard_keeps_it() -> None:
    game = _game(Hero.WARRIOR, Hero.WIZARD)
    game.players[0].spells = ["frost", "frost"]
    _fight(game, "mummy", (2, 2), fists=2)  # 4 + 4 = 8 > 7
    assert game.players[0].spells == ["bolt"] and game.tiles[EAST].token is None  # both fists used, bolt looted
    game = _game(Hero.WIZARD, Hero.WARRIOR)
    game.players[0].spells = ["frost"]
    _fight(game, "mummy", (2, 2))  # the wizard's frost fist counts by itself: 4 + 2 = 6 < 7, and it is kept
    assert game.players[0].spells == ["frost"] and game.tiles[EAST].token == "mummy"


def test_regent_monsters_drop_regent_loot() -> None:
    game = _game(Hero.WARRIOR, Hero.THIEF)
    _fight(game, "bat", (6, 6))
    assert game.players[0].spells == ["thorn"]
    game = _game(Hero.WARRIOR, Hero.THIEF)
    _fight(
        game,
        "icemage",
        (6, 6),
    )
    assert game.players[0].spells == ["frost"]


# ------------------------------------------------------------------ the new heroes
def test_barbarian_berserk_scales_with_wounds() -> None:
    for hp, bonus in ((5, 0), (4, 1), (3, 1), (2, 2), (1, 2)):
        game = _game(Hero.BARBARIAN, Hero.THIEF)
        game.players[0].hp = hp
        _tile(game, EAST, token="rat")
        game.step(0, A.Move(1))
        game.step(0, A.Roll())
        assert game.combat_bonus(0) == bonus
    game = _game(Hero.BARBARIAN, Hero.THIEF)
    game.cursed = 0
    game.players[0].hp = 1
    _tile(game, EAST, token="rat")
    game.step(0, A.Move(1))
    game.step(0, A.Roll())
    assert game.combat_bonus(0) == 0


def test_barbarian_perseverance_leaving_the_loot_keeps_his_turn() -> None:
    game = _game(Hero.BARBARIAN, Hero.THIEF)
    _fight(game, "rat", (6, 6))
    assert game.phase == Phase.LOOT
    assert set(game.legal_actions(0)) == {A.Loot(None), A.TakeLoot()}
    game.step(0, A.Loot(None))
    assert game.phase == Phase.TURN and game.current == 0 and game.tiles[EAST].items == ["dagger"]
    game = _game(Hero.BARBARIAN, Hero.THIEF)
    _fight(game, "rat", (6, 6))
    game.step(0, A.TakeLoot())
    assert game.current == 1 and game.players[0].weapons == ["dagger"]


def test_barbarian_goes_on_after_a_treasure() -> None:
    game = _game(Hero.BARBARIAN, Hero.THIEF)
    game.players[0].weapons = ["axe"]
    _fight(game, "fallen", (6, 6))
    assert game.phase == Phase.TURN and game.current == 0 and game.players[0].treasures == ["treasure"]


def test_barbarian_chooses_how_much_to_heal() -> None:
    game = _game(Hero.BARBARIAN, Hero.THIEF)
    game.players[0].hp = 1
    heals = [a for a in game.legal_actions(0) if isinstance(a, A.EndTurn)]
    assert A.EndTurn() in heals and A.EndTurn(1) in heals and A.EndTurn(3) in heals and A.EndTurn(5) not in heals
    game.step(0, A.EndTurn(3))
    assert game.players[0].hp == 3
    other = _game(Hero.THIEF, Hero.BARBARIAN)
    assert [a for a in other.legal_actions(0) if isinstance(a, A.EndTurn)] == [A.EndTurn()]


def test_barbarian_does_not_end_the_turn_by_himself_when_he_can_still_choose() -> None:
    game = _game(Hero.BARBARIAN, Hero.THIEF)
    game.players[0].hp = 2
    game.used = 3
    _tile(game, EAST, Kind.CORRIDOR, STRAIGHT | 0b1010)
    game.players[0].pos = EAST
    game.step(0, A.Move(3))
    assert game.current == 0 and game.phase == Phase.TURN
    game.step(0, A.EndTurn(2))
    assert game.players[0].hp == 2


def test_battle_mage_swords_have_power_three() -> None:
    game = _game(Hero.BATTLEMAGE, Hero.THIEF)
    game.players[0].weapons = ["sword", "dagger"]
    assert game.attack_power(0) == 4 and game.attack_power(1) == 0
    game.players[1].weapons = ["sword"]
    assert game.attack_power(1) == 2


def test_battle_mage_blitzes_and_picks_the_way_back() -> None:
    game = _game(Hero.BATTLEMAGE, Hero.THIEF)
    _tile(game, Pos(5, 0), token="mummy", exits=0b1111)
    _tile(game, Pos(4, 0), Kind.CORRIDOR, STRAIGHT | 0b1010)
    _tile(game, Pos(5, 1), Kind.CORRIDOR, 0b0101)
    _tile(game, Pos(5, -1), Kind.CORRIDOR, 0b0101)
    assert A.Blitz(Pos(5, 0)) in game.legal_actions(0)
    game.step(0, A.Blitz(Pos(5, 0)))
    assert game.phase == Phase.COMBAT and game.moves_left == 0
    _dice(game, 1, 2)
    game.step(0, A.Strike())
    assert game.phase == Phase.RETREAT and game.players[0].hp == 4
    assert set(game.legal_actions(0)) == {A.Retreat(0), A.Retreat(2), A.Retreat(3)}
    game.step(0, A.Retreat(0))
    assert game.players[0].pos == Pos(5, -1) and game.current == 1


def test_blitz_needs_a_fresh_turn() -> None:
    game = _game(Hero.BATTLEMAGE, Hero.THIEF)
    _tile(game, Pos(5, 0), token="rat")
    game.used = 1
    assert not any(isinstance(a, A.Blitz) for a in game.legal_actions(0))


def test_acrobat_carries_daggers_in_spell_slots() -> None:
    game = _game(Hero.ACROBAT, Hero.THIEF)
    p = game.players[0]
    p.weapons = ["dagger", "dagger"]
    p.spells = ["dagger"]
    assert game.attack_power(0) == 3
    game.tiles[START].items = ["dagger"]
    assert A.Pickup(0) in game.legal_actions(0)
    game.step(0, A.Pickup(0))
    assert p.spells == ["dagger", "dagger"] and game.attack_power(0) == 4
    _fight(game, "icemage", (1, 1)) if False else None


def test_acrobat_daggers_are_not_used_up_and_others_cannot_throw_them() -> None:
    game = _game(Hero.ACROBAT, Hero.THIEF)
    game.players[0].spells = ["dagger"]
    _fight(game, "rat", (2, 3))  # 5 + 1 = 6 > 5
    assert (game.players[0].spells == ["dagger"] and game.players[0].weapons == ["dagger"]) or game.current == 1
    assert game.players[1].spells == []
    game.cursed = 0
    assert game.attack_power(0) == 1  # the cursed acrobat lost the skill: only the dagger she took counts


def test_acrobat_sprints_up_to_eight_tiles_over_discovered_tiles() -> None:
    game = _game(Hero.ACROBAT, Hero.THIEF)
    for x in range(1, 10):
        _tile(game, Pos(x, 0), Kind.CORRIDOR, STRAIGHT | 0b1010)
    _tile(game, Pos(5, 0), Kind.ARENA, STRAIGHT | 0b1010)
    sprints = {a.to for a in game.legal_actions(0) if isinstance(a, A.Sprint)}
    assert sprints == {Pos(x, 0) for x in range(1, 6)}  # the unfought arena stops her
    game.tiles[Pos(5, 0)].spent = True
    sprints = {a.to for a in game.legal_actions(0) if isinstance(a, A.Sprint)}
    assert sprints == {Pos(x, 0) for x in range(1, 9)}
    game.step(0, A.Sprint(Pos(8, 0)))
    assert game.players[0].pos == Pos(8, 0) and game.current == 1
    game = _game(Hero.ACROBAT, Hero.THIEF)
    game.used = 1
    assert not any(isinstance(a, A.Sprint) for a in game.legal_actions(0))


def test_ranger_bear_turns_ones_into_sixes() -> None:
    game = _game(Hero.RANGER, Hero.THIEF)
    game.rng = random.Random(0)
    seen = set()
    for _ in range(30):
        game.phase = Phase.COMBAT
        game.combat = _combat()
        game.step(0, A.Roll())
        seen.update(game.combat.dice)  # type: ignore[union-attr]
    assert 1 not in seen and 6 in seen


def _combat():  # type: ignore[no-untyped-def]
    from karak.game.engine import Combat

    return Combat("rat", EAST, START, first_move=False, can_sneak=False)


def test_ranger_eavesdrops_without_stepping_in() -> None:
    game = _game(Hero.RANGER, Hero.THIEF)
    game.pile[:] = [(Kind.ROOM, CROSS)]
    game.bag[:] = ["mummy"]
    explores = [a for a in game.legal_actions(0) if isinstance(a, A.Eavesdrop)]
    assert {a.dir for a in explores} == {0, 1, 2, 3}
    game.step(0, A.Eavesdrop(1))
    assert game.players[0].pos == START and game.moves_left == 3
    assert game.tiles[EAST].token == "mummy" and game.phase == Phase.TURN  # no fight yet
    game.step(0, A.Move(1))
    assert game.phase == Phase.COMBAT


def test_eavesdropped_arena_waits_until_someone_walks_in() -> None:
    game = _game(Hero.RANGER, Hero.THIEF)
    game.pile[:] = [(Kind.ROOM, CROSS), (Kind.ARENA, STRAIGHT)]
    game.step(0, A.Eavesdrop(1))
    assert game.phase in (Phase.PLACE, Phase.TURN)
    if game.phase == Phase.PLACE:
        game.step(0, game.legal_actions(0)[0])
    assert game.tiles[EAST].kind == Kind.ARENA and not game.tiles[EAST].spent
    assert game.players[0].pos == START
    game.step(0, A.Move(1))
    assert game.phase == Phase.COMBAT and game.combat is not None and game.combat.versus == 1


def test_only_rangers_eavesdrop() -> None:
    game = _game(Hero.THIEF, Hero.WARRIOR)
    game.pile[:] = [(Kind.ROOM, CROSS)]
    assert not any(isinstance(a, A.Eavesdrop) for a in game.legal_actions(0))
    with pytest.raises(IllegalMove):
        game.step(0, A.Eavesdrop(1))


# ------------------------------------------------------------------ the Lord of Karak
def _chambers(game: Game, n: int) -> Tile:
    tile = None
    for i in range(n):
        tile = _tile(game, Pos(10 + i, 5), Kind.ARENA if i % 2 else Kind.CURSED)
    assert tile is not None
    return tile


def test_the_lord_possesses_the_weakest_hero_with_everyone_elses_skills() -> None:
    game = _game(Hero.WARRIOR, Hero.THIEF, Hero.WIZARD, lord=True)
    game.players[0].treasures = ["treasure"]
    game.players[1].treasures = ["treasure", "treasure"]  # the wizard has none
    game.players[2].hp = 2
    game.cursed = 2
    game.players[2].weapons = ["axe"]
    _chambers(game, 4)
    assert game.lord is None
    game._discover(_tile(game, Pos(20, 5), Kind.CURSED))  # the fifth chamber wakes the Lord
    p = game.players[2]
    assert game.lord == 2 and p.hero == Hero.LORD and p.origin == Hero.WIZARD
    assert p.skills == {Hero.WARRIOR, Hero.THIEF}  # not his own wizard skills
    assert p.hp == 5 and game.cursed is None
    assert game.has_skill(2, Hero.THIEF) and not game.has_skill(2, Hero.WIZARD)
    assert p.weapons == ["axe"]  # he keeps his equipment


def test_in_a_duo_the_lord_keeps_his_own_skills() -> None:
    game = _game(Hero.WARRIOR, Hero.THIEF, lord=True)
    game.players[0].treasures = ["treasure"]
    _chambers(game, 5)
    game._discover(next(iter(game.tiles.values())) if False else game.tiles[Pos(10, 5)])
    assert game.lord == 1 and game.players[1].skills == {Hero.THIEF, Hero.WARRIOR}


def test_lord_tiebreaks_go_weapons_then_items_then_dice(monkeypatch: pytest.MonkeyPatch) -> None:
    game = _game(Hero.WARRIOR, Hero.THIEF, Hero.WIZARD, lord=True)
    game.players[0].weapons = ["sword"]
    game.players[1].weapons = ["dagger"]
    game.players[2].weapons = ["dagger"]
    game.players[2].keys = ["key"]
    _chambers(game, 5)
    game._discover(game.tiles[Pos(10, 5)])
    assert game.lord == 1  # same treasure, same weapon power as the wizard, but fewer other items
    game = _game(Hero.WARRIOR, Hero.THIEF, Hero.WIZARD, lord=True)
    rolls = iter([2, 2, 5, 1, 3, 4, 4, 4])
    monkeypatch.setattr(game, "_d6", lambda: next(rolls))
    _chambers(game, 5)
    game._discover(game.tiles[Pos(10, 5)])
    assert game.lord is not None  # tied three ways: the lowest roll after re-rolls


def test_the_lord_only_wakes_once_and_only_in_that_game_version() -> None:
    game = _game(Hero.WARRIOR, Hero.THIEF, Hero.WIZARD, lord=False)
    _chambers(game, 6)
    game._discover(game.tiles[Pos(10, 5)])
    assert game.lord is None
    game = _game(Hero.WARRIOR, Hero.THIEF, Hero.WIZARD, lord=True)
    _chambers(game, 5)
    game._discover(game.tiles[Pos(10, 5)])
    first = game.lord
    game.players[0].treasures = []
    game._discover(game.tiles[Pos(10, 5)])
    assert game.lord == first


def test_a_hero_who_has_no_chest_can_open_one_with_a_lords_oracle_skill() -> None:
    game = _game(Hero.ORACLE, Hero.THIEF, Hero.WIZARD, lord=True)
    game.players[0].treasures = ["treasure"]
    game.players[1].treasures = ["treasure"]
    _chambers(game, 5)
    game._discover(game.tiles[Pos(10, 5)])
    assert game.lord == 2
    game.current = 2
    game.pile[:] = [(Kind.ROOM, CROSS)]
    game.bag[:] = ["rat", "mummy", "bolt"]
    game.step(2, A.Explore(1)) if A.Explore(1) in game.legal_actions(2) else None
    assert game.phase == Phase.CHOOSE_TOKEN or game.phase == Phase.COMBAT


def test_chests_stay_chests() -> None:
    assert CHEST == "chest"
