import random

import pytest

from karak.bots import make_bot
from karak.game import actions as A
from karak.game.engine import START, Game, IllegalMove, Phase
from karak.game.model import CHEST, CORNER, CROSS, MONSTERS, STRAIGHT, Hero, Kind, Pos, Tile, bag, tile_pile
from karak.runner import play_game


def _game(*heroes: Hero, seed: int = 1) -> Game:
    game = Game(list(heroes) or [Hero.WARRIOR, Hero.THIEF], seed=seed)
    game.current = 0
    game.used = 0
    game.phase = Phase.TURN
    return game


def _tile(game: Game, pos: Pos, kind: Kind = Kind.ROOM, exits: int = CROSS, token: str | None = None) -> Tile:
    tile = Tile(len(game.tiles), pos, kind, exits, token)
    game.tiles[pos] = tile
    return tile


EAST = Pos(1, 0)


def _fight(game: Game, monster: str, dice: tuple[int, int], *, at: Pos = EAST, **strike: object) -> list:
    """Walk seat 0 east from the start into `monster`, roll `dice` and strike."""
    _tile(game, at, token=monster)
    game.step(0, A.Move(1))
    assert game.phase == Phase.COMBAT
    game.step(0, A.Roll())
    assert game.combat is not None
    game.combat.dice = list(dice)
    return game.step(0, A.Strike(**strike))  # type: ignore[arg-type]


def test_box_contents() -> None:
    pile = tile_pile()
    assert len(pile) == 79
    assert sum(kind == Kind.ROOM for kind, _ in pile) == len(bag())
    assert all(bin(mask).count("1") >= 2 for _, mask in pile)
    assert sorted(mask for kind, mask in pile if kind == Kind.PORTAL) == [STRAIGHT] * 4
    assert sorted(mask for kind, mask in pile if kind == Kind.FOUNTAIN) == [CORNER] * 2
    tokens = bag()
    assert len(tokens) == 53 and tokens.count(CHEST) == 10 and tokens.count("dragon") == 1
    assert sum(m.count for m in MONSTERS.values()) == 43
    game = _game()
    assert game.tiles[START].kind == Kind.START
    assert all(p.pos == START and p.hp == 5 for p in game.players)


def test_explored_tile_connects_back_and_room_draws_a_token() -> None:
    game = _game(Hero.WARRIOR, Hero.THIEF)
    game.pile.append((Kind.ROOM, 0b0001))  # a dead end: only one way to turn it
    game.bag.append(CHEST)
    game.step(0, A.Explore(1))
    tile = game.tiles[Pos(1, 0)]
    assert tile.exits == 0b1000  # opens west, back towards the start
    assert tile.token == CHEST
    assert game.players[0].pos == Pos(1, 0) and game.used == 1


def test_choosing_a_rotation() -> None:
    game = _game()
    game.pile.append((Kind.CORRIDOR, 0b0011))  # corner
    game.step(0, A.Explore(2))
    assert game.phase == Phase.PLACE
    assert {a.rotation for a in game.legal_actions(0)} == {0, 3}  # both turns that open north
    game.step(0, A.Place(3))
    assert game.tiles[Pos(0, 1)].exits == 0b1001


def test_win_loots_and_ends_the_turn() -> None:
    game = _game()
    _fight(game, "rat", (3, 3))
    assert game.players[0].weapons == ["dagger"]
    assert game.tiles[Pos(1, 0)].token is None
    assert game.current == 1


def test_tie_retreats_and_loss_costs_a_hit_point() -> None:
    game = _game()
    events = _fight(game, "mummy", (3, 4))
    assert events[0]["outcome"] == "tie"
    assert game.players[0].pos == START and game.players[0].hp == 5
    game = _game(Hero.ORACLE, Hero.THIEF)
    game.tiles[START].kind = Kind.CORRIDOR  # no healing on the way back
    _fight(game, "mummy", (1, 2))
    assert game.players[0].hp == 4 and game.players[0].pos == START
    assert game.tiles[Pos(1, 0)].token == "mummy"


def test_losing_next_to_the_start_heals_at_the_fountain() -> None:
    game = _game(Hero.ORACLE, Hero.THIEF)
    _fight(game, "king", (1, 2))
    assert game.players[0].hp == 5


def test_thief_wins_ties_and_can_sneak() -> None:
    game = _game(Hero.THIEF, Hero.WARRIOR)
    events = _fight(game, "mummy", (3, 4))
    assert events[0]["outcome"] == "win"
    game = _game(Hero.THIEF, Hero.WARRIOR)
    _tile(game, Pos(1, 0), token="king")
    game.step(0, A.Move(1))
    assert A.Sneak() in game.legal_actions(0)
    game.step(0, A.Sneak())
    assert game.phase == Phase.TURN and game.players[0].pos == Pos(1, 0) and game.moves_left == 3
    assert A.EndTurn() not in game.legal_actions(0)  # she can't stop on the monster's tile


def test_thief_cannot_slip_past_with_her_last_move() -> None:
    game = _game(Hero.THIEF, Hero.WARRIOR)
    _tile(game, Pos(1, 0), token="king")
    game.used = 3
    game.step(0, A.Move(1))
    assert game.phase == Phase.COMBAT and A.Sneak() not in game.legal_actions(0)


def test_thief_retreats_past_the_monster_she_slipped_by() -> None:
    game = _game(Hero.THIEF, Hero.WARRIOR)
    game.tiles[START].kind = Kind.CORRIDOR  # no healing on the way back
    _tile(game, Pos(1, 0), token="king")
    _tile(game, Pos(2, 0), token="dragon")
    game.step(0, A.Move(1))
    game.step(0, A.Sneak())
    game.step(0, A.Move(1))
    assert A.Sneak() in game.legal_actions(0)
    game.step(0, A.Roll())
    assert game.combat is not None
    game.combat.dice = [1, 1]
    game.step(0, A.Strike())
    assert game.players[0].pos == START and game.players[0].hp == 4


def test_bolts_are_spent_except_by_the_wizard() -> None:
    game = _game(Hero.ORACLE, Hero.WIZARD)
    game.players[0].spells = ["bolt", "bolt"]
    _fight(game, "turnkey", (2, 2), bolts=2)  # 2+2+2 = 6 < 8: still a loss, bolts gone
    assert game.players[0].spells == []
    game = _game(Hero.WIZARD, Hero.ORACLE)
    game.players[0].spells = ["bolt", "bolt"]
    _tile(game, EAST, token="turnkey")
    game.step(0, A.Move(1))
    assert game.combat_bonus(0) == 2  # the wizard's bolts always count, nothing to choose
    game.step(0, A.Roll())
    assert all(isinstance(a, A.Strike) and a.bolts == 0 for a in game.legal_actions(0))
    assert game.combat is not None
    game.combat.dice = [4, 3]
    game.step(0, A.Strike())
    assert game.players[0].keys == ["key"] and game.players[0].spells == ["bolt", "bolt"]
    cursed = _game(Hero.WIZARD, Hero.ORACLE)
    cursed.players[0].spells = ["bolt"]
    cursed.cursed = 0
    _fight(cursed, "turnkey", (4, 3), bolts=1)
    assert cursed.players[0].spells == []


def test_warrior_rerolls_once() -> None:
    game = _game(Hero.WARRIOR, Hero.THIEF)
    _tile(game, Pos(1, 0), token="king")
    game.step(0, A.Move(1))
    game.step(0, A.Roll())
    assert A.Reroll() in game.legal_actions(0)
    game.step(0, A.Reroll())
    assert A.Reroll() not in game.legal_actions(0)


def test_swordsman_rerolls_ones_and_sixes_keep_the_turn_going() -> None:
    game = _game(Hero.SWORDSMAN, Hero.THIEF)
    game.rng = random.Random(0)
    for _ in range(50):
        game.combat = None
        _tile(game, Pos(1, 0), token="rat")
        game.players[0].pos = START
        game.used = 0
        game.phase = Phase.TURN
        game.step(0, A.Move(1))
        game.step(0, A.Roll())
        assert game.combat is not None and 1 not in game.combat.dice
        game.combat.dice = [6, 2]
        game.step(0, A.Strike())
        assert game.current == 0 and game.phase == Phase.TURN and game.moves_left == 3
        game.players[0].weapons = []


def test_oracle_foresight_and_fate() -> None:
    game = _game(Hero.ORACLE, Hero.THIEF)
    events = _fight(game, "mummy", (3, 4))  # 7 + 1 on the first move beats the mummy
    assert events[0]["outcome"] == "win"
    game = _game(Hero.ORACLE, Hero.THIEF)
    game.pile.append((Kind.ROOM, 0b0001))
    game.bag += ["rat", CHEST]
    size = len(game.bag)
    game.step(0, A.Explore(1))
    assert game.phase == Phase.CHOOSE_TOKEN and game.offer == [CHEST, "rat"]
    game.step(0, A.ChooseToken(0))
    assert game.tiles[Pos(1, 0)].token == CHEST and len(game.bag) == size - 1 and "rat" in game.bag


def test_warlock_sacrifice_and_swap() -> None:
    game = _game(Hero.WARLOCK, Hero.THIEF)
    events = _fight(game, "mummy", (3, 4), sacrifice=True)
    assert events[0]["outcome"] == "win" and game.players[0].hp == 4
    game = _game(Hero.WARLOCK, Hero.THIEF)
    _tile(game, Pos(1, 0), token=None)
    game.players[1].pos = Pos(1, 0)
    game.step(0, A.Swap(1))
    assert game.players[0].pos == Pos(1, 0) and game.players[1].pos == START and game.current == 1


def test_wizard_walks_through_walls() -> None:
    game = _game(Hero.WIZARD, Hero.THIEF)
    _tile(game, Pos(1, 0), exits=0b0001)  # no opening towards the start
    assert A.Move(1) in game.legal_actions(0)
    game.current = 1
    assert A.Move(1) not in game.legal_actions(1)


def test_full_inventory_asks_what_to_leave() -> None:
    game = _game()
    game.players[0].weapons = ["dagger", "sword"]
    _fight(game, "king", (6, 6))
    assert game.phase == Phase.LOOT
    game.step(0, A.Loot(0))
    assert sorted(game.players[0].weapons) == ["axe", "sword"]
    assert game.tiles[Pos(1, 0)].items == ["dagger"]
    game.current, game.used, game.phase = 1, 0, Phase.TURN
    game.step(1, A.Move(1))
    assert A.Pickup(0) in game.legal_actions(1)
    game.step(1, A.Pickup(0))
    assert game.players[1].weapons == ["dagger"] and game.current == 0


def test_no_pointless_swaps_are_offered() -> None:
    game = _game()
    game.players[0].weapons = ["sword", "sword"]
    _fight(game, "skeleton", (6, 6))  # drops a third sword: nothing to decide
    assert game.phase != Phase.LOOT and game.tiles[EAST].items == ["sword"]
    game = _game()
    game.players[0].weapons = ["axe", "axe"]
    game.players[0].keys = ["key"]
    _fight(game, "king", (6, 6))
    assert game.tiles[EAST].items == ["axe"]
    game = _game()
    game.players[0].weapons = ["sword", "sword"]
    _fight(game, "king", (6, 6))
    assert game.legal_actions(0) == [A.Loot(None), A.Loot(0)]
    game = _game()
    game.players[0].keys = ["key"]
    game.players[0].weapons = ["dagger", "dagger"]
    _tile(game, EAST, kind=Kind.CORRIDOR).items = ["key", "sword", "sword"]
    game.step(0, A.Move(1))
    pickups = [a for a in game.legal_actions(0) if isinstance(a, A.Pickup)]
    assert pickups == [A.Pickup(1, 0)]


def test_mummy_curse_blocks_skills_until_healed() -> None:
    game = _game(Hero.ORACLE, Hero.THIEF)
    _fight(game, "mummy", (6, 6))
    assert game.phase == Phase.CURSE
    game.step(0, A.Curse(1))
    assert game.cursed == 1 and not game.has_skill(1, Hero.THIEF)
    assert game.current == 1
    game.step(1, A.EndTurn())  # resting on the start fountain lifts the curse
    assert game.cursed is None


def test_knocked_out_hero_misses_a_turn() -> None:
    game = _game(Hero.ORACLE, Hero.THIEF)
    game.tiles[START].kind = Kind.CORRIDOR
    game.players[0].hp = 1
    _fight(game, "king", (1, 1))
    assert game.players[0].knocked_out and game.players[0].hp == 0
    game.step(1, A.EndTurn())
    assert game.current == 1 and game.players[0].hp == 1 and not game.players[0].knocked_out


def test_warrior_wakes_at_a_fountain() -> None:
    game = _game(Hero.WARRIOR, Hero.THIEF)
    game.tiles[START].kind = Kind.CORRIDOR
    _tile(game, Pos(-1, 0), kind=Kind.FOUNTAIN)
    _tile(game, Pos(0, -1), kind=Kind.FOUNTAIN)
    game.players[0].hp = 1
    _fight(game, "king", (1, 1))
    assert game.phase == Phase.REINCARNATE
    game.step(0, A.Reincarnate(Pos(0, -1)))
    assert game.players[0].pos == Pos(0, -1) and game.players[0].hp == 5 and game.current == 1


def test_chest_needs_a_key() -> None:
    game = _game()
    _tile(game, Pos(1, 0), token=CHEST)
    game.step(0, A.Move(1))
    assert A.OpenChest() not in game.legal_actions(0)
    game.players[0].keys = ["key"]
    game.step(0, A.OpenChest())
    assert game.players[0].treasures == ["treasure"] and game.players[0].keys == []
    assert game.tiles[Pos(1, 0)].token is None and game.current == 1


def test_healing_portal() -> None:
    game = _game(Hero.ORACLE, Hero.THIEF)
    _tile(game, Pos(1, 0), token=None)
    game.players[1].pos = Pos(1, 0)
    game.players[1].hp = 2
    game.cursed = 1
    game.players[0].spells = ["healing"]
    game.step(0, A.CastHealing(1, START))
    assert game.players[1].pos == START and game.players[1].hp == 5 and game.cursed is None
    assert game.current == 0 and game.players[0].spells == []


def test_dragon_ends_the_game_and_the_ruby_counts_half() -> None:
    game = _game(Hero.ORACLE, Hero.THIEF)
    game.players[0].weapons = ["axe", "axe"]
    game.players[1].treasures = ["treasure"]
    _fight(game, "dragon", (6, 4))
    assert game.phase == Phase.GAME_OVER and game.result is not None
    assert game.result.winners == [0]
    assert game.result.players[0].points == 3 and game.result.players[1].points == 2


def test_portals_need_a_partner() -> None:
    game = _game()
    _tile(game, Pos(1, 0), kind=Kind.PORTAL)
    game.step(0, A.Move(1))
    assert not any(isinstance(a, A.Teleport) for a in game.legal_actions(0))
    _tile(game, Pos(5, 5), kind=Kind.PORTAL)
    game.step(0, A.Teleport(Pos(5, 5)))
    assert game.players[0].pos == Pos(5, 5) and game.used == 2


def test_dragon_wakes_when_the_labyrinth_is_complete() -> None:
    game = _game()
    game.bag = ["dragon"]
    game.pile = [(Kind.ROOM, 0b0001)]
    _tile(game, Pos(0, 1), kind=Kind.ROOM, exits=0b0001)
    game.step(0, A.Explore(1))  # the last tile: a room, but the bag only holds the dragon... which is drawn
    assert game.phase == Phase.COMBAT
    game = _game()
    game.bag = ["dragon", "rat"]
    game.pile = [(Kind.CORRIDOR, 0b0001)]
    game.step(0, A.Explore(1))
    assert "dragon" not in game.bag
    assert any(t.token == "dragon" for t in game.tiles.values())


def test_illegal_actions_change_nothing() -> None:
    game = _game()
    before = (dict(game.tiles), game.used, game.players[0].pos)
    with pytest.raises(IllegalMove):
        game.step(1, A.EndTurn())
    with pytest.raises(IllegalMove):
        game.step(0, A.Roll())
    with pytest.raises(IllegalMove):
        game.step(0, A.OpenChest())
    assert (dict(game.tiles), game.used, game.players[0].pos) == before


def _conserved(game: Game) -> None:
    pending = 1 if game.pending is not None else 0
    assert len(game.tiles) + len(game.pile) + pending == 80
    assert len(game.players) == len({p.hero for p in game.players})
    for p in game.players:
        assert len(p.weapons) <= 2 and len(p.spells) <= 3 and len(p.keys) <= 1
        assert 0 <= p.hp <= game.rules.max_hp
        assert p.pos in game.tiles


@pytest.mark.parametrize("seed", range(12))
def test_random_games_respect_the_invariants(seed: int) -> None:
    rng = random.Random(seed)
    heroes = rng.sample(list(Hero), rng.randint(2, 5))
    game = Game(heroes, seed=seed)
    steps = 0
    while game.phase != Phase.GAME_OVER and steps < 4000:
        seat = game.current
        legal = game.legal_actions(seat)
        assert legal
        game.step(seat, rng.choice(legal))
        _conserved(game)
        steps += 1


def test_champion_warlock_swaps_onto_a_chest_it_can_open() -> None:
    game = _game(Hero.WARLOCK, Hero.THIEF)
    _tile(game, Pos(5, 0), token=CHEST)
    game.players[1].pos = Pos(5, 0)
    game.players[0].keys.append("key")
    bot = make_bot("champion", 0)
    assert bot.act(game.view(0)) == A.Swap(1)
    game.players[0].keys.clear()
    assert bot.act(game.view(0)) != A.Swap(1)


def test_champion_leader_goes_for_the_dragon_before_a_rival_takes_it() -> None:
    game = _game(Hero.ORACLE, Hero.THIEF)
    game.pile.clear()
    game.bag.clear()
    _tile(game, EAST, token="dragon")
    game.players[0].weapons = ["dagger", "axe"]  # +4 (+1 foresight): an 8% long shot against the dragon
    game.players[0].treasures = ["treasure", "treasure"]
    game.players[1].treasures = ["treasure"]  # one behind: the ruby would win it the game
    bot = make_bot("champion", 0)
    assert bot.act(game.view(0)) == A.Move(1)
    game.players[1].treasures = []  # out of reach even with the ruby: no need to gamble
    assert bot.act(game.view(0)) == A.EndTurn()


@pytest.mark.parametrize("bot", ["squire", "adventurer", "champion"])
def test_bot_games_finish(bot: str) -> None:
    for seed in range(4):
        heroes = random.Random(seed).sample(list(Hero), 3)
        game = play_game([make_bot(bot, seed * 3 + i) for i in range(3)], heroes, seed=seed)
        assert game.result is not None
        _conserved(game)
