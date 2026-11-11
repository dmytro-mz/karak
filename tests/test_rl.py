import random

import numpy as np
import pytest

from karak.bots import make_bot
from karak.game import actions as A
from karak.game.engine import Game, Phase
from karak.game.model import Hero, Pos
from karak.nn import encoding as E
from karak.nn.forward import Policy
from karak.rl.config import load_config
from karak.rl.env import LEARNER, EnvConfig, EpisodeSpec, KarakEnv

torch = pytest.importorskip("torch")

from karak.rl.network import KarakNet  # noqa: E402
from karak.rl.train import Storage, _minibatches  # noqa: E402


def _champion_views(games: int = 3, seed: int = 0):
    for g in range(games):
        n = 2 + (seed + g) % 4
        heroes = random.Random(seed + g).sample(list(Hero), n)
        bots = [make_bot("champion", 10 * g + i) for i in range(n)]
        game = Game(heroes, seed=seed + g)
        while game.phase != Phase.GAME_OVER:
            view = game.view(game.current)
            yield view
            game.step(game.current, bots[game.current].act(view))


def test_every_legal_action_is_reachable_through_an_index() -> None:
    for view in _champion_views(games=2):
        e = E.encode(view)
        chosen = set(e.actions.values())
        assert chosen <= set(view.legal)
        # Every legal action has an index, except a teleport to a portal one plain step away (same outcome).
        missing = set(view.legal) - chosen
        assert all(isinstance(a, A.Teleport) for a in missing)
        assert np.flatnonzero(e.mask).tolist() == sorted(e.actions)
        assert e.spatial[E.P_SEAT, e.me // E.S, e.me % E.S] == 255


def test_go_destinations_take_the_first_step_of_a_shortest_path() -> None:
    teacher = make_bot("champion", 0)
    agree = total = 0
    for view in _champion_views(games=2, seed=4):
        if view.phase != Phase.TURN or len(view.legal) < 2:
            continue
        e = E.encode(view)
        dist, first = E.paths(view, view.seat)
        frame = E.frame_for(view)
        for idx, a in e.actions.items():
            if idx < E.CELLS:
                pos = Pos(idx % E.S + frame.ox, idx // E.S + frame.oy)
                assert first[pos] == a and dist[pos] >= 1
        a = teacher.act(view)
        if isinstance(a, A.Move | A.Explore | A.Teleport):
            total += 1
            label = E.label_index(view, e.actions, a, teacher.goal)
            agree += label == frame.cell(teacher.goal)  # type: ignore[arg-type]
            assert e.actions[label] == a
    assert agree / total > 0.95  # the teacher's goal is (nearly always) the label


def test_encoding_is_seat_relative() -> None:
    game = Game([Hero.WARRIOR, Hero.THIEF, Hero.WIZARD], seed=3)
    game.current = 1
    e = E.encode(game.view(1))
    hero = E.G_SEATS + E.F_HERO
    assert e.glob[hero + E.HEROES.index(Hero.THIEF)] == 1  # relative seat 0 is me
    assert e.glob[E.G_SEATS + E.SEAT_SIZE + E.F_HERO + E.HEROES.index(Hero.WIZARD)] == 1
    assert e.glob[E.G_SEATS + 2 * E.SEAT_SIZE + E.F_HERO + E.HEROES.index(Hero.WARRIOR)] == 1
    assert e.glob[E.G_SEATS + 3 * E.SEAT_SIZE + E.F_PRESENT] == 0
    assert e.glob[E.G_TABLE + 2] == 1


def test_go_plane_targets_the_neighbouring_cell() -> None:
    game = Game([Hero.WARRIOR, Hero.THIEF], seed=1)
    view = game.view(game.current)
    frame = E.frame_for(view)
    e = E.encode(view)
    for d in range(4):
        idx = E.action_index(view, frame, A.Explore(d))
        assert idx is not None and e.actions[idx] == A.Explore(d)
        assert E.label_index(view, e.actions, A.Explore(d)) == idx
        target = frame.cell(Pos([0, 1, 0, -1][d], [-1, 0, 1, 0][d]))
        assert idx == target
        assert e.spatial[E.P_FRONTIER].reshape(-1)[target] == 255


def test_numpy_forward_matches_torch() -> None:
    net = KarakNet(filters=8, blocks=2, hidden=16)
    for p in net.parameters():  # non-trivial weights everywhere (some layers start near zero)
        torch.nn.init.normal_(p, std=0.2)
    views = list(_champion_views(games=1))[:40:7]
    batch = [E.encode(v) for v in views]
    with torch.no_grad():
        logits, value = net(
            torch.from_numpy(np.stack([b.spatial for b in batch])),
            torch.from_numpy(np.stack([b.glob for b in batch])),
            torch.tensor([b.me for b in batch]),
        )
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "p.npz"
        net.save_policy(path)
        policy = Policy(path)
        for i, b in enumerate(batch):
            np_logits, np_value = policy.forward(b.spatial, b.glob, b.me)
            np.testing.assert_allclose(np_logits, logits[i].numpy(), rtol=1e-4, atol=1e-4)
            assert abs(np_value - float(value[i])) < 1e-4
        bot = make_bot(f"ai:{path}", 0)
        assert bot.act(views[0]) in views[0].legal


def test_minibatches_never_leave_a_tiny_tail() -> None:
    perm = np.random.default_rng(0).permutation(2 * 2048 + 1)
    batches = _minibatches(perm, 2048)
    assert [len(b) for b in batches] == [2048, 2049]
    assert sorted(np.concatenate(batches).tolist()) == list(range(len(perm)))
    assert [len(b) for b in _minibatches(perm[:3000], 2048)] == [3000]
    assert [len(b) for b in _minibatches(perm[:3500], 2048)] == [2048, 1452]
    assert [len(b) for b in _minibatches(perm[:1], 2048)] == [1]


def test_storage_links_seats_and_carries_unfinished_chains() -> None:
    st = Storage(16)
    obs = {
        "spatial": np.zeros((1, E.N_SPATIAL, E.S, E.S), np.uint8),
        "glob": np.zeros((1, E.N_GLOBAL), np.float32),
        "mask": np.zeros((1, E.N_ACTIONS), bool),
    }

    def add(seat: int, value: float) -> None:
        st.add((0, seat), obs, 0, 0, 0, -1, 0.0, value)

    add(0, 0.5)  # row 0
    add(1, 0.1)  # row 1
    st.reward_event((0, 0), 0.2, False)
    add(0, 0.4)  # row 2, successor of row 0
    st.reward_event((0, 0), 1.0, True)  # game over for seat 0
    st.reward_event((0, 1), -1.0, True)
    add(0, 0.3)  # row 3: a new game, nothing after it yet
    adv, ret, ready = st.returns(gamma=0.9, lam=0.5)
    assert ready.tolist() == [True, True, True, False]
    assert adv[2] == pytest.approx(1.0 - 0.4)
    assert adv[0] == pytest.approx(0.2 + 0.9 * 0.4 - 0.5 + 0.9 * 0.5 * adv[2])
    assert ret[1] == pytest.approx(-1.0)
    st.carry_over(ready)
    assert st.n == 1 and st.value[0] == pytest.approx(0.3) and st.last == {(0, 0): 0}


def _run(env: KarakEnv, policy_action=None):
    """Drive an env through one game, recording rewards per seat."""
    sp = np.zeros((E.N_SPATIAL, E.S, E.S), np.uint8)
    gl = np.zeros(E.N_GLOBAL, np.float32)
    mk = np.zeros(E.N_ACTIONS, bool)
    d = env.reset(sp, gl, mk)
    rewards: dict[int, float] = {}
    while d.policy >= 0:
        legal = np.flatnonzero(mk)
        assert len(legal) >= 2
        d = env.step(-1 if policy_action is None else int(policy_action(legal)), sp, gl, mk)
        for seat, r, _ in d.events:
            rewards[seat] = rewards.get(seat, 0.0) + r
        if d.episodes:
            return rewards, d.episodes[0]
    raise AssertionError("game did not finish")


def test_learner_rewards_are_zero_sum_and_shaping_cancels() -> None:
    cfg = EnvConfig(opponents={"self": 1.0}, behavior="teacher", max_turns=400)
    spec = EpisodeSpec(5, (Hero.WARRIOR, Hero.ORACLE, Hero.THIEF), (LEARNER, LEARNER, LEARNER))
    env = KarakEnv(cfg, specs=[spec])
    rewards, info = _run(env)
    assert sum(rewards.values()) == pytest.approx(0.0, abs=1e-6)
    assert sorted(round(r, 6) for r in rewards.values()) in ([-0.5, -0.5, 1.0], [-0.5, 0.25, 0.25], [0.0, 0.0, 0.0])
    assert info["win"] > 0 or rewards[env.controllers.index(LEARNER)] < 0


def test_turn_limit_means_nobody_wins() -> None:
    cfg = EnvConfig(opponents={"self": 1.0}, behavior="teacher", max_turns=12)
    spec = EpisodeSpec(5, (Hero.WARRIOR, Hero.ORACLE), (LEARNER, LEARNER))
    rewards, info = _run(KarakEnv(cfg, specs=[spec]))
    assert info["timeout"] == 1 and info["win"] == 0
    assert all(r == pytest.approx(0.0, abs=1e-6) for r in rewards.values())


def test_spec_games_are_reproducible() -> None:
    spec = EpisodeSpec(11, (Hero.SWORDSMAN, Hero.WIZARD), (LEARNER, "champion"))
    _, info = _run(KarakEnv(EnvConfig(behavior="teacher", max_turns=1500), specs=[spec]))
    _, again = _run(KarakEnv(EnvConfig(behavior="teacher", max_turns=1500), specs=[spec]))
    assert info["turns"] > 0 and again == info


def test_config_overrides() -> None:
    cfg = load_config(None, ["train.lr=1e-4", "env.opponents={self: 1}", "env.table_sizes={2: 1}"])
    assert cfg.train.lr == pytest.approx(1e-4)
    assert cfg.env.opponents == {"self": 1.0}
    assert cfg.env.table_sizes == {2: 1.0}
