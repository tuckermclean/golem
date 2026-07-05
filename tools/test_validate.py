"""Unit tests for the grounding validator — the golem's conscience.

NOTE (step-4 flag, do not fix here): parse_control splits the control
string on spaces, so multi-word item/mob names ("green coin", "pale eel")
cannot be expressed yet. The corpus format work (SPEC §8 step 4) must
either encode spaces or restrict names to single tokens. Tests below use
single-token names deliberately.
"""
from validate import violations, parse_control

MOVE = "EVENT:move ROOM:hall THEME:deep_mine EXITS:n,e ITEMS:none MOB:none"


def test_parse_control():
    fields, items, exits = parse_control(MOVE)
    assert fields["EVENT"] == "move"
    assert items == [] and exits == ["n", "e"]


def test_clean_move_pair_passes():
    assert violations(MOVE, "A narrow hall. Dust holds its breath. Ways out: n, e.") == []


def test_missing_exits_line():
    assert "exits-line-format" in violations(MOVE, "A narrow hall of dust.")


def test_exits_line_mismatch():
    assert "exits-line-mismatch" in violations(MOVE, "A hall. Ways out: n, e, s.")


def test_exits_line_order_does_not_matter():
    assert violations(MOVE, "A hall. Ways out: e, n.") == []


def test_phantom_exit_in_body():
    v = violations(MOVE, "A door gapes to the south. Ways out: n, e.")
    assert "phantom-exit:s" in v


def test_real_exit_direction_in_body_is_allowed():
    assert violations(MOVE, "Cold air drifts from the north. Ways out: n, e.") == []


def test_adversarial_northern_is_not_north():
    # \bnorth\b must not fire inside "northern" — use EXITS:e so the 'n'
    # phantom-direction branch actually runs against the body text
    ctrl = "EVENT:move ROOM:hall THEME:deep_mine EXITS:e ITEMS:none MOB:none"
    assert violations(ctrl, "The northern-style arch sags. Ways out: e.") == []
    assert "phantom-exit:n" in violations(ctrl, "A door gapes to the north. Ways out: e.")


def test_missing_item():
    ctrl = "EVENT:take THEME:deep_mine ITEMS:stylus MOB:none"
    assert "missing-item:stylus" in violations(ctrl, "You take nothing of note.")


def test_item_matched_by_last_word():
    ctrl = "EVENT:take THEME:deep_mine ITEMS:stylus MOB:none"
    assert violations(ctrl, "The stylus is cold in your hand.") == []


def test_multiple_items_all_required():
    ctrl = "EVENT:take THEME:x ITEMS:coin+stylus MOB:none"
    v = violations(ctrl, "You lift the coin and nothing else.")
    assert "missing-item:stylus" in v and "missing-item:coin" not in v


def test_phantom_creature():
    ctrl = "EVENT:look ITEMS:none MOB:none"
    assert "phantom-creature" in violations(ctrl, "Something alive shifts beyond the light.")


def test_missing_mob():
    ctrl = "EVENT:look ITEMS:none MOB:eel"
    assert "missing-mob:eel" in violations(ctrl, "The pool is empty and still.")


def test_mob_present_passes():
    # EVENT:take — 'look' is subject to the exits-line contract, which would
    # add exits-line-format noise to an otherwise-clean pair
    ctrl = "EVENT:take ITEMS:none MOB:eel"
    assert violations(ctrl, "A pale eel regards you without hurry.") == []


def test_banned_register():
    ctrl = "EVENT:look ITEMS:none MOB:none"
    assert "banned-register" in violations(ctrl, "An eldritch hum rises.")


def test_too_long():
    ctrl = "EVENT:look ITEMS:none MOB:none"
    prose = "It is dark. " * 5
    assert "too-long" in violations(ctrl, prose)


def test_four_sentences_is_fine():
    ctrl = "EVENT:take ITEMS:none MOB:none"  # take: exits contract not in play
    prose = "It is dark. " * 4
    assert violations(ctrl, prose.strip()) == []


def test_non_move_event_skips_exits_contract():
    ctrl = "EVENT:take ITEMS:coin MOB:none"
    assert violations(ctrl, "You pocket the coin.") == []
