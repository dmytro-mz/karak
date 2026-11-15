"""Karak: Sidhar, Kirima, Elspeth: the alchemist, the beast hunter and the warrior princess."""

from __future__ import annotations

import random

import pytest

from karak.bots import make_bot
from karak.game import actions as A
from karak.game.engine import START, Game, IllegalMove, Phase, RulesConfig
from karak.game.model import (
    BASE_HEROES,
    CHEST,
    CROSS,
    REGENT_HEROES,
    SIDHAR_HEROES,
    STRAIGHT,
    Hero,
    Kind,
    Pos,
    Tile,
)
from karak.game.rules import win_chance

EAST = Pos(1, 0)
RULES = RulesConfig(sidhar=True)


def _game(*heroes: Hero, seed: int = 1) -> Game:
    game = Game(list(heroes) or [Hero.ALCHEMIST, Hero.THIEF], seed=seed, rules=RULES)
    game.current = 0
    game.used = 0
    game.phase = Phase.TURN
    game.pile.clear()
    return game


def _tile(game: Game, pos: Pos, kind: Kind = Kind.ROOM, exits: int = CROSS, token: str | None = None) -> Tile:
    tile = Tile(len(game.tiles), pos, kind, exits, token)
    game.tiles[pos] = tile
    return tile


def _fight(game: Game, monster: str, dice: tuple[int, int], **strike: object) -> list[dict]:
    """Walk east two tiles into `monster` (so a retreat does not end on the healing start tile)."""
    _tile(game, EAST)
    _tile(game, Pos(2, 0), token=monster)
    game.step(0, A.Move(1))
    game.step(0, A.Move(1))
    game.step(0, A.Roll())
    assert game.combat is not None
    game.combat.dice = list(dice)
    return game.step(0, A.Strike(**strike))  # type: ignore[arg-type]


# ------------------------------------------------------------------ the box
def test_the_heroes_need_the_switch() -> None:
    with pytest.raises(ValueError):
        Game([Hero.ALCHEMIST, Hero.THIEF])
    with pytest.raises(ValueError):
        Game([Hero.PRINCESS, Hero.THIEF], rules=RulesConfig(expansion=True))
    Game([Hero.ALCHEMIST, Hero.BEASTHUNTER, Hero.PRINCESS], rules=RULES)
    # works next to the Regent heroes too, and adds no tiles or tokens
    both = Game([Hero.RANGER, Hero.PRINCESS], rules=RulesConfig(expansion=True, sidhar=True))
    assert len(both.pile) == 79 + 18
    assert len(Game([Hero.WARRIOR, Hero.BEASTHUNTER], rules=RULES).pile) == 79


def _conserved(game: Game) -> None:
    pending = 1 if game.pending is not None else 0
    assert len(game.tiles) + len(game.pile) + pending == 80
    for p in game.players:
        assert len(p.weapons) <= 2 and len(p.spells) <= 3 and len(p.keys) <= 1
        assert 0 <= p.hp <= game.rules.max_hp
        assert p.pos in game.tiles
    if game.phase != Phase.TRANSFORM:
        assert not game.aside


@pytest.mark.parametrize("seed", range(40))
def test_random_games_with_the_new_heroes_respect_the_invariants(seed: int) -> None:
    rng = random.Random(seed)
    heroes = rng.sample([*SIDHAR_HEROES, Hero.WARRIOR, Hero.THIEF, Hero.WIZARD, Hero.ORACLE, Hero.WARLOCK], 5)
    # make sure at least one of the new heroes plays
    heroes = [*SIDHAR_HEROES[: 1 + seed % 3], *[h for h in heroes if h not in SIDHAR_HEROES]][: rng.randint(2, 5)]
    game = Game(heroes, seed=seed, rules=RulesConfig(sidhar=True))
    steps = 0
    while game.phase != Phase.GAME_OVER and steps < 5000:
        seat = game.actor
        legal = game.legal_actions(seat)
        assert legal, game.phase
        game.step(seat, rng.choice(legal))
        _conserved(game)
        steps += 1


@pytest.mark.parametrize("seed", range(10))
def test_random_games_with_both_expansions(seed: int) -> None:
    rng = random.Random(seed)
    heroes = rng.sample([*SIDHAR_HEROES, *REGENT_HEROES, *BASE_HEROES], 4)
    game = Game(heroes, seed=seed, rules=RulesConfig(expansion=True, lord=seed % 2 == 0, sidhar=True))
    steps = 0
    while game.phase != Phase.GAME_OVER and steps < 5000:
        seat = game.actor
        legal = game.legal_actions(seat)
        assert legal
        game.step(seat, rng.choice(legal))
        steps += 1


@pytest.mark.parametrize("bot", ["squire", "adventurer", "champion"])
def test_bots_finish_games_with_the_new_heroes(bot: str) -> None:
    for seed in range(6):
        heroes = [Hero.ALCHEMIST, Hero.BEASTHUNTER, Hero.PRINCESS]
        game = Game(heroes, seed=seed, rules=RULES)
        bots = [make_bot(bot, seed * 3 + i) for i in range(3)]
        while game.phase != Phase.GAME_OVER:
            seat = game.actor
            game.step(seat, bots[seat].act(game.view(seat)))
        assert game.result is not None


# ------------------------------------------------------------------ alchemist
def test_skin_of_steel_only_hurts_when_losing_by_three() -> None:
    game = _game()
    events = _fight(game, "mummy", (3, 2))  # 5 vs 7: beaten by 2
    assert events[0]["outcome"] == "loss" and events[0]["unhurt"]
    assert game.players[0].hp == 5 and game.players[0].pos == EAST
    game = _game()
    events = _fight(game, "mummy", (3, 1))  # 4 vs 7: beaten by 3
    assert events[0]["outcome"] == "loss" and not events[0]["unhurt"]
    assert game.players[0].hp == 4
    game = _game(Hero.WARRIOR, Hero.THIEF)
    assert _fight(game, "mummy", (3, 2))[0]["unhurt"] is False and game.players[0].hp == 4


def test_skin_of_steel_in_an_arena_duel() -> None:
    game = Game([Hero.ALCHEMIST, Hero.THIEF], rules=RulesConfig(expansion=True, sidhar=True))
    game.current, game.used, game.phase = 0, 0, Phase.TURN
    game.pile.clear()
    _tile(game, EAST, Kind.ARENA, STRAIGHT | 0b1010)
    game.step(0, A.Move(1))
    game.step(0, A.Roll())
    assert game.combat is not None
    game.combat.dice = [3, 3]
    game.step(0, A.Strike())
    game.step(1, A.Roll())
    game.combat.dice = [4, 4]  # wins by 2: the alchemist keeps his life
    game.step(1, A.Strike())
    assert game.players[0].hp == 5


def _draw(game: Game, *tokens: str) -> None:
    """Explore east and have the next tokens (the first is drawn first) waiting in the bag."""
    game.pile[:] = [(Kind.ROOM, CROSS)] * 3 + [(Kind.ROOM, 0b0001)]  # keeps the labyrinth open: no dragon wake-up
    game.bag[:] = [*game.bag, *reversed(tokens)]
    game.step(0, A.Explore(1))


def test_transformation_keeps_or_redraws_for_a_life() -> None:
    game = _game()
    _draw(game, "dragon", "king", "rat")
    assert game.phase == Phase.TRANSFORM and game.offer == ["dragon"]
    assert set(game.legal_actions(0)) == {A.Transform(False), A.Transform(True)}
    events = game.step(0, A.Transform(True))
    assert game.players[0].hp == 4 and game.offer == ["king"] and game.aside == ["dragon"]
    assert events[0] == {"kind": "transform", "seat": 0, "discarded": "dragon", "token": "king", "hp": 4}
    game.step(0, A.Transform(True))
    assert game.players[0].hp == 3 and game.offer == ["rat"]
    size = len(game.bag)
    game.step(0, A.Transform(False))
    assert game.aside == [] and len(game.bag) == size + 2 and "dragon" in game.bag and "king" in game.bag
    assert game.tiles[EAST].token == "rat" and game.phase == Phase.COMBAT


def test_transformation_on_the_last_life_drops_him_without_a_fight() -> None:
    game = _game()
    game.players[0].hp = 1
    _tile(game, EAST)
    game.step(0, A.Move(1))
    _draw(game, "dragon", "rat")
    game.step(0, A.Transform(True))
    assert game.current == 1  # his turn is over
    assert game.players[0].knocked_out and game.players[0].hp == 0
    assert game.players[0].pos == EAST  # he fell back to the tile he came from
    assert game.tiles[Pos(2, 0)].token == "rat" and "dragon" in game.bag and not game.aside


def test_transformation_stops_when_the_bag_runs_dry() -> None:
    game = _game()
    game.bag.clear()
    game.pile.append((Kind.ROOM, 0b0001))
    game.bag[:] = ["rat", "mummy"]
    game.step(0, A.Explore(1))
    assert game.phase == Phase.TRANSFORM
    game.step(0, A.Transform(True))
    assert game.offer == ["rat"] and game.legal_actions(0) == [A.Transform(False)]
    with pytest.raises(IllegalMove):
        game.step(0, A.Transform(True))


def test_transformation_also_applies_to_a_chest_and_after_the_oracle() -> None:
    game = _game(Hero.ALCHEMIST, Hero.THIEF)
    _draw(game, CHEST)
    assert game.phase == Phase.TRANSFORM and game.offer == [CHEST]
    game.step(0, A.Transform(False))
    assert game.tiles[EAST].token == CHEST
    lord = _game(Hero.ALCHEMIST, Hero.ORACLE)
    lord.players[0].skills = frozenset({Hero.ALCHEMIST, Hero.ORACLE})
    _draw(lord, "rat", "mummy")
    assert lord.phase == Phase.CHOOSE_TOKEN
    lord.step(0, A.ChooseToken(0))
    assert lord.phase == Phase.TRANSFORM and len(lord.offer) == 1


def test_a_cursed_alchemist_cannot_transform() -> None:
    game = _game()
    game.cursed = 0
    _draw(game, "dragon")
    assert game.phase == Phase.COMBAT


# ------------------------------------------------------------------ beast hunter
def test_protector_jumps_to_a_wounded_hero_and_heals_them() -> None:
    game = _game(Hero.BEASTHUNTER, Hero.THIEF)
    _tile(game, Pos(0, 1))
    game.players[1].pos = Pos(0, 1)
    assert A.Protect(1) not in game.legal_actions(0)  # full health: nobody to save
    game.players[1].hp = 3
    events = game.step(0, A.Protect(1))
    assert game.players[1].hp == 4 and game.players[0].pos == Pos(0, 1) and game.moves_left == 3
    assert events[0]["kind"] == "protect"
    assert A.Protect(1) in game.legal_actions(0)  # still hurt: she may heal again for another move


def test_protector_wakes_an_unconscious_hero_who_keeps_the_next_turn() -> None:
    game = _game(Hero.BEASTHUNTER, Hero.THIEF)
    _tile(game, Pos(0, 1))
    other = game.players[1]
    other.pos, other.hp, other.knocked_out = Pos(0, 1), 0, True
    game.step(0, A.Protect(1))
    assert other.hp == 1 and not other.knocked_out
    game.step(0, A.EndTurn())
    assert game.current == 1 and not other.knocked_out and other.hp == 1


def test_protector_needs_a_move_and_the_skill() -> None:
    game = _game(Hero.BEASTHUNTER, Hero.THIEF)
    game.players[1].hp = 2
    game.used = 4
    assert A.Protect(1) not in game.legal_actions(0)
    thief = _game(Hero.WARRIOR, Hero.THIEF)
    thief.players[1].hp = 2
    assert not any(isinstance(a, A.Protect) for a in thief.legal_actions(0))


def test_ambush_adds_one_against_a_monster_seen_on_an_earlier_turn() -> None:
    game = _game(Hero.BEASTHUNTER, Hero.THIEF)
    game.turn = 5
    tile = _tile(game, EAST, token="mummy")
    tile.seen = 3
    game.step(0, A.Move(1))
    assert game.combat is not None and game.combat.ambush
    game.step(0, A.Roll())
    game.combat.dice = [3, 3]  # 6 + 1 = 7: a tie with the mummy
    assert game.combat_bonus(0) == 1
    events = game.step(0, A.Strike())
    assert events[0]["total"] == 7 and events[0]["outcome"] == "tie"


def test_no_ambush_on_a_monster_she_uncovered_herself() -> None:
    game = _game(Hero.BEASTHUNTER, Hero.THIEF)
    game.bag[:] = ["mummy"]
    _draw(game, "mummy")
    assert game.combat is not None and not game.combat.ambush
    game.step(0, A.Roll())
    assert game.combat_bonus(0) == 0
    # the next turn the same monster is old news
    game.combat.dice = [1, 1]
    game.step(0, A.Strike())
    game.current, game.used, game.turn = 0, 0, game.turn + 2
    game.phase = Phase.TURN
    game.players[0].pos = START
    game.step(0, A.Move(1))
    assert game.combat is not None and game.combat.ambush


# ------------------------------------------------------------------ warrior princess
def test_dual_wielding_rerolls_one_die_once_per_fight(monkeypatch: pytest.MonkeyPatch) -> None:
    game = _game(Hero.PRINCESS, Hero.THIEF)
    _tile(game, EAST, token="mummy")
    game.step(0, A.Move(1))
    game.step(0, A.Roll())
    assert game.combat is not None
    game.combat.dice = [2, 5]
    legal = game.legal_actions(0)
    assert A.RerollDie(0) in legal and A.RerollDie(1) in legal and A.Reroll() not in legal
    monkeypatch.setattr(game, "_d6", lambda: 6)
    events = game.step(0, A.RerollDie(0))
    assert game.combat.dice == [6, 5] and events[0]["die"] == 0
    assert not any(isinstance(a, A.RerollDie) for a in game.legal_actions(0))
    events = game.step(0, A.Strike())
    assert events[0]["total"] == 11 and events[0]["outcome"] == "win"


def test_dual_wielding_resets_for_the_second_half_of_a_duel() -> None:
    game = Game([Hero.PRINCESS, Hero.THIEF], rules=RulesConfig(expansion=True, sidhar=True))
    game.current, game.used, game.phase = 0, 0, Phase.TURN
    game.pile.clear()
    _tile(game, EAST, Kind.ARENA, STRAIGHT | 0b1010)
    game.step(0, A.Move(1))
    game.step(0, A.Roll())
    assert game.combat is not None
    game.combat.dice = [1, 2]
    game.step(0, A.RerollDie(0))
    game.step(0, A.Strike())
    game.step(1, A.Roll())
    assert not any(isinstance(a, A.RerollDie) for a in game.legal_actions(1))  # the thief has no second blade


def test_reposition_charges_past_a_monster_for_a_move_and_a_life() -> None:
    game = _game(Hero.PRINCESS, Hero.THIEF)
    _tile(game, EAST, token="king")
    _tile(game, Pos(2, 0))
    _tile(game, Pos(1, 1))
    legal = game.legal_actions(0)
    assert A.Reposition(1, 1) in legal and A.Reposition(1, 2) in legal
    assert A.Reposition(1, 3) not in legal  # that is the tile she came from
    game.step(0, A.Reposition(1, 1))
    p = game.players[0]
    assert p.pos == Pos(2, 0) and p.hp == 4 and game.moves_left == 3
    assert game.tiles[EAST].token == "king" and game.phase == Phase.TURN


def test_reposition_needs_a_monster() -> None:
    game = _game(Hero.PRINCESS, Hero.THIEF)
    _tile(game, EAST)
    _tile(game, Pos(2, 0))
    assert not any(isinstance(a, A.Reposition) for a in game.legal_actions(0))
    game.tiles[EAST].token = "rat"
    assert any(isinstance(a, A.Reposition) for a in game.legal_actions(0))
    game.players[0].hp = 1  # her last HP may be spent: the player takes the consequences
    assert any(isinstance(a, A.Reposition) for a in game.legal_actions(0))


def test_reposition_on_the_last_hp_knocks_her_out() -> None:
    game = _game(Hero.PRINCESS, Hero.THIEF)
    game.players[0].hp = 1
    _tile(game, EAST)
    game.step(0, A.Move(1))
    _tile(game, Pos(2, 0), token="king")
    _tile(game, Pos(3, 0), token="rat")
    game.step(0, A.Reposition(1, 1))  # lands on the rat with 0 HP: no fight, she falls back and drops
    p = game.players[0]
    assert p.knocked_out and p.hp == 0 and p.pos == EAST and game.current == 1
    assert game.tiles[Pos(3, 0)].token == "rat"
    quiet = _game(Hero.PRINCESS, Hero.THIEF)
    quiet.players[0].hp = 1
    _tile(quiet, EAST, token="king")
    _tile(quiet, Pos(2, 0))
    quiet.step(0, A.Reposition(1, 1))  # an empty tile beyond: she drops there and the turn ends
    assert quiet.players[0].knocked_out and quiet.players[0].pos == Pos(2, 0) and quiet.current == 1


def test_reposition_into_the_unknown_follows_the_exploring_rules() -> None:
    game = _game(Hero.PRINCESS, Hero.THIEF)
    _tile(game, EAST, exits=CROSS, token="king")
    game.pile.append((Kind.CORRIDOR, STRAIGHT))
    assert A.Reposition(1, 1) in game.legal_actions(0)  # east of the king is undiscovered
    game.step(0, A.Reposition(1, 1))
    p = game.players[0]
    assert Pos(2, 0) in game.tiles and p.pos == Pos(2, 0) and p.hp == 4
    assert game.moves_left == 3  # the reposition paid for the tile too
    assert game.tiles[EAST].token == "king"


def test_reposition_onto_a_monster_starts_that_fight() -> None:
    game = _game(Hero.PRINCESS, Hero.THIEF)
    _tile(game, EAST, token="king")
    _tile(game, Pos(2, 0), token="rat")
    game.step(0, A.Reposition(1, 1))
    assert game.phase == Phase.COMBAT and game.combat is not None and game.combat.monster == "rat"
    assert game.combat.back == START  # a retreat goes to where she charged from


def test_win_chance_of_a_rerolled_die() -> None:
    plain = win_chance(7)
    dual = win_chance(7, dual=True)
    assert plain < dual < 1
    assert win_chance(0, dual=True) == pytest.approx(1.0)  # always beats 0
    assert win_chance(10, dual=True) > win_chance(10)  # an extra throw helps even the long shots
