from cabo.game import Game, Phase, InvalidMoveError
from cabo.player import Player
from cabo.card import Card, Suit
import pytest


# Bite 1
def test_dealing():
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players)
    assert(len(game.deck) == 52 - len(players)*4)
    assert(len(players[0].hand) == 4)

def test_discard():
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players, discard_pile=[Card("K", Suit.HEARTS), Card("A", Suit.SPADES)])
    assert(game.discard_top == game.discard_pile[-1])


def test_init():
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players)
    assert(game.phase == Phase.AWAITING_DRAW)
    assert(game.cabo_caller == None)
    assert(game.current_turn == 0)


# Bite 2

def test_draw_from_deck():
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players)
    game.draw_from_deck()
    assert(game.phase == Phase.AWAITING_DISCARD)
    assert isinstance(game.drawn_card, Card)
    assert(not game.from_discard)
    game = Game(players=players)
    game.phase = Phase.AWAITING_DISCARD
    with pytest.raises(InvalidMoveError, match="Cannot do that now!"):
        game.draw_from_deck()

def test_take_discard():
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players, discard_pile=[Card("K", Suit.HEARTS), Card("A", Suit.SPADES)])
    game.take_discard()
    assert(game.phase == Phase.AWAITING_DISCARD)
    assert isinstance(game.drawn_card, Card)
    assert(game.from_discard)
    game = Game(players=players)
    with pytest.raises(InvalidMoveError, match="Can't take from empty discard pile!"):
        game.take_discard()
    game = Game(players=players, discard_pile=[Card("K", Suit.HEARTS), Card("A", Suit.SPADES)])
    game.phase = Phase.AWAITING_DISCARD
    with pytest.raises(InvalidMoveError, match="Cannot do that now!"):
        game.take_discard()


def test_keep():
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players)
    before_card = players[0].hand[0]
    before_discard = len(game.discard_pile)
    game.draw_from_deck()
    game.keep(0)
    assert(len(game.discard_pile) == before_discard + 1)
    assert(players[0].hand[0] != before_card)
    assert(game.phase == Phase.AWAITING_TURN_END)
    assert(game.drawn_card == None)
    assert(not game.from_discard)
    
def test_discard_drawn():
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players, discard_pile=[Card("K", Suit.HEARTS), Card("A", Suit.SPADES)])
    game.draw_from_deck()
    before_card = players[0].hand[0]
    before_discard = len(game.discard_pile)
    game.discard_drawn()
    assert(len(game.discard_pile) == before_discard + 1)
    assert(players[0].hand[0] == before_card)
    assert(game.phase == Phase.AWAITING_TURN_END)
    assert(game.drawn_card == None)
    assert(not game.from_discard)
    assert(game.current_turn == 0)
    game.end_turn()
    assert(game.current_turn == 1)
    assert(game.phase == Phase.AWAITING_DRAW)
    game.current_turn = len(players) - 1
    game.phase = Phase.AWAITING_TURN_END
    game.end_turn()
    assert(game.current_turn == 0)
    game.take_discard()
    with pytest.raises(InvalidMoveError, match="Can't re-discard card taken from discard pile!"):
        game.discard_drawn()
    
    




