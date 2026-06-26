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
    game.drawn_card = Card("3", Suit.CLUBS)
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
    

# Bite 3
def test_peek_own():
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players)
    players[0].hand = [Card("K", Suit.HEARTS), Card("A", Suit.SPADES)]
    game.drawn_card = Card("7", Suit.CLUBS) 
    game.phase = Phase.AWAITING_DISCARD
    game.discard_drawn()
    assert(game.resolve_power(slot_a=1) == Card("A", Suit.SPADES))
    assert(game.phase == Phase.AWAITING_TURN_END)
    game.drawn_card = Card("8", Suit.CLUBS) 
    game.phase = Phase.AWAITING_DISCARD
    game.discard_drawn()
    assert(game.resolve_power(slot_a=0) == Card("K", Suit.HEARTS))
    assert(game.phase == Phase.AWAITING_TURN_END)

def test_peek_opp():
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players)
    players[1].hand = [Card("K", Suit.HEARTS), Card("A", Suit.SPADES)]
    game.drawn_card = Card("9", Suit.CLUBS) 
    game.phase = Phase.AWAITING_DISCARD
    game.discard_drawn()
    assert(game.resolve_power(player_b=1, slot_b=1) == Card("A", Suit.SPADES))
    assert(game.phase == Phase.AWAITING_TURN_END)
    game.drawn_card = Card("10", Suit.CLUBS) 
    game.phase = Phase.AWAITING_DISCARD
    game.discard_drawn()
    assert(game.resolve_power(player_b=1, slot_b=0) == Card("K", Suit.HEARTS))
    assert(game.phase == Phase.AWAITING_TURN_END)


def test_J():
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players)
    players[0].hand = [Card("K", Suit.SPADES), Card("10", Suit.SPADES)]
    players[1].hand = [Card("K", Suit.HEARTS), Card("A", Suit.SPADES)]
    game.drawn_card = Card("J", Suit.CLUBS) 
    game.phase = Phase.AWAITING_DISCARD
    game.discard_drawn()
    game.resolve_power(player_a=0, slot_a=1, player_b=1, slot_b=1)
    assert (players[0].hand[1] == Card("A", Suit.SPADES))
    assert (players[1].hand[1] == Card("10", Suit.SPADES))
    assert(game.phase == Phase.AWAITING_TURN_END)


def test_Q():
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players)
    players[0].hand = [Card("K", Suit.SPADES), Card("10", Suit.SPADES)]
    players[1].hand = [Card("K", Suit.HEARTS), Card("A", Suit.SPADES)]
    game.drawn_card = Card("Q", Suit.CLUBS) 
    game.phase = Phase.AWAITING_DISCARD
    game.discard_drawn()
    own, opp = game.resolve_power(player_a=0, slot_a=1, player_b=1, slot_b=1)
    assert (own == Card("10", Suit.SPADES))
    assert (opp == Card("A", Suit.SPADES))
    assert (players[0].hand[1] == Card("A", Suit.SPADES))
    assert (players[1].hand[1] == Card("10", Suit.SPADES))   
    assert(game.phase == Phase.AWAITING_TURN_END)

def test_K():
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players)
    players[0].hand = [Card("K", Suit.SPADES), Card("10", Suit.SPADES)]
    players[1].hand = [Card("K", Suit.HEARTS), Card("A", Suit.SPADES)]
    game.drawn_card = Card("K", Suit.CLUBS) 
    game.phase = Phase.AWAITING_DISCARD
    game.discard_drawn()
    own, opp = game.resolve_power(player_a=0, slot_a=1, player_b=1, slot_b=1)
    assert(game.phase == Phase.AWAITING_SWAP_DECISION)
    game.complete_swap()
    assert (own == Card("10", Suit.SPADES))
    assert (opp == Card("A", Suit.SPADES))
    assert (players[0].hand[1] == Card("A", Suit.SPADES))
    assert (players[1].hand[1] == Card("10", Suit.SPADES))
    assert(game.phase == Phase.AWAITING_TURN_END)
    game.drawn_card = Card("K", Suit.SPADES) 
    game.phase = Phase.AWAITING_DISCARD
    game.discard_drawn()
    own, opp = game.resolve_power(player_a=0, slot_a=1, player_b=1, slot_b=1)
    assert(game.phase == Phase.AWAITING_SWAP_DECISION)
    game.decline_swap()
    assert (own == Card("A", Suit.SPADES))
    assert (opp == Card("10", Suit.SPADES))
    assert (players[0].hand[1] == Card("A", Suit.SPADES))
    assert (players[1].hand[1] == Card("10", Suit.SPADES))
    assert(game.phase == Phase.AWAITING_TURN_END)


def test_J_swap_two_opponents():
    # New capability: current player swaps two OTHER players' cards (neither is theirs)
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players)  # current_turn = 0 (rishin)
    players[1].hand = [Card("K", Suit.HEARTS), Card("A", Suit.SPADES)]
    players[2].hand = [Card("10", Suit.SPADES), Card("3", Suit.CLUBS)]
    game.drawn_card = Card("J", Suit.CLUBS)
    game.phase = Phase.AWAITING_DISCARD
    game.discard_drawn()
    game.resolve_power(player_a=1, slot_a=1, player_b=2, slot_b=0)
    assert players[1].hand[1] == Card("10", Suit.SPADES)
    assert players[2].hand[0] == Card("A", Suit.SPADES)
    assert game.phase == Phase.AWAITING_TURN_END


def test_Q_swap_two_opponents():
    # Catches the FORCED_SWAP peek bug: revealed cards must be the ACTUAL targets, not the current player's
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players)  # current_turn = 0
    players[0].hand = [Card("2", Suit.CLUBS), Card("3", Suit.CLUBS)]   # rishin's cards must NOT be revealed
    players[1].hand = [Card("K", Suit.HEARTS), Card("A", Suit.SPADES)]
    players[2].hand = [Card("10", Suit.SPADES), Card("5", Suit.HEARTS)]
    game.drawn_card = Card("Q", Suit.CLUBS)
    game.phase = Phase.AWAITING_DISCARD
    game.discard_drawn()
    card_a, card_b = game.resolve_power(player_a=1, slot_a=1, player_b=2, slot_b=0)
    assert card_a == Card("A", Suit.SPADES)      # roshna's card — NOT rishin's
    assert card_b == Card("10", Suit.SPADES)     # dona's card
    assert players[1].hand[1] == Card("10", Suit.SPADES)
    assert players[2].hand[0] == Card("A", Suit.SPADES)
    assert game.phase == Phase.AWAITING_TURN_END


def test_swap_same_player_rejected():
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players)
    game.drawn_card = Card("J", Suit.CLUBS)
    game.phase = Phase.AWAITING_DISCARD
    game.discard_drawn()
    with pytest.raises(InvalidMoveError):
        game.resolve_power(player_a=1, slot_a=0, player_b=1, slot_b=1)  # two cards, same player


def test_K_same_player_rejected_before_reveal():
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players)
    game.drawn_card = Card("K", Suit.CLUBS)
    game.phase = Phase.AWAITING_DISCARD
    game.discard_drawn()
    with pytest.raises(InvalidMoveError):
        game.resolve_power(player_a=2, slot_a=0, player_b=2, slot_b=1)  # same player
    assert game.pending_swap is None   # look() bailed BEFORE committing a swap → no info leaked


def test_skip():
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players)
    players[0].hand = [Card("K", Suit.SPADES), Card("10", Suit.SPADES)]
    players[1].hand = [Card("K", Suit.HEARTS), Card("A", Suit.SPADES)]
    game.drawn_card = Card("K", Suit.CLUBS) 
    game.phase = Phase.AWAITING_DISCARD
    game.discard_drawn()
    game.skip()
    assert(game.phase == Phase.AWAITING_TURN_END)


def test_no_power():
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players)
    players[0].hand = [Card("K", Suit.SPADES), Card("10", Suit.SPADES)]
    players[1].hand = [Card("K", Suit.HEARTS), Card("A", Suit.SPADES)]
    game.drawn_card = Card("K", Suit.DIAMONDS) 
    game.phase = Phase.AWAITING_DISCARD
    game.discard_drawn()
    assert(game.phase == Phase.AWAITING_TURN_END)


def test_K_swap_err():
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players)
    players[0].hand = [Card("K", Suit.SPADES), Card("10", Suit.SPADES)]
    players[1].hand = [Card("K", Suit.HEARTS), Card("A", Suit.SPADES)]
    game.drawn_card = Card("J", Suit.CLUBS) 
    game.phase = Phase.AWAITING_DISCARD
    game.discard_drawn()
    with pytest.raises(InvalidMoveError, match="Cannot do that now!"):
        game.complete_swap()
    with pytest.raises(InvalidMoveError, match="Cannot do that now!"):
        game.decline_swap()

# Bite 4
def test_call_cabo():
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players)
    players[1].hand = [Card("K", Suit.SPADES), Card("10", Suit.SPADES)]
    players[0].hand = [Card("K", Suit.HEARTS), Card("A", Suit.SPADES)]
    game.drawn_card = Card("Q", Suit.CLUBS) 
    game.phase = Phase.AWAITING_DISCARD
    game.discard_drawn()
    game.phase = Phase.AWAITING_TURN_END
    game.call_cabo()
    game.end_turn()
    game.phase = Phase.AWAITING_TURN_END
    game.end_turn()
    game.phase = Phase.AWAITING_TURN_END
    game.end_turn()
    assert(game.cabo_caller == players[0])
    assert(game.phase == Phase.ROUND_OVER)

def test_winner_loser():
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players)
    players[2].hand = [Card("K", Suit.SPADES), Card("10", Suit.SPADES)]
    players[1].hand = [Card("K", Suit.SPADES), Card("10", Suit.SPADES)]
    players[0].hand = [Card("K", Suit.HEARTS), Card("A", Suit.SPADES)]
    game.drawn_card = Card("Q", Suit.CLUBS) 
    game.phase = Phase.AWAITING_DISCARD
    game.discard_drawn()
    game.phase = Phase.AWAITING_TURN_END
    game.call_cabo()
    game.end_turn()
    game.phase = Phase.AWAITING_TURN_END
    game.end_turn()
    game.phase = Phase.AWAITING_TURN_END
    game.end_turn()
    assert(game.winner_loser() == 'rishin')
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players)
    players[2].hand = [Card("K", Suit.SPADES), Card("10", Suit.SPADES)]
    players[1].hand = [Card("K", Suit.SPADES), Card("10", Suit.SPADES)]
    players[0].hand = [Card("3", Suit.HEARTS), Card("4", Suit.SPADES)]
    game.drawn_card = Card("Q", Suit.CLUBS) 
    game.phase = Phase.AWAITING_DISCARD
    game.discard_drawn()
    game.phase = Phase.AWAITING_TURN_END
    game.call_cabo()
    game.end_turn()
    game.phase = Phase.AWAITING_TURN_END
    game.end_turn()
    game.phase = Phase.AWAITING_TURN_END
    game.end_turn()
    assert(game.winner_loser() == None)
    players = [Player("rishin"), Player("roshna"), Player("dona")]
    game = Game(players=players)
    players[2].hand = [Card("K", Suit.SPADES), Card("10", Suit.SPADES)]
    players[1].hand = [Card("3", Suit.SPADES), Card("1", Suit.SPADES)]
    players[0].hand = [Card("3", Suit.HEARTS), Card("2", Suit.SPADES)]
    game.drawn_card = Card("Q", Suit.CLUBS) 
    game.phase = Phase.AWAITING_DISCARD
    game.discard_drawn()
    game.phase = Phase.AWAITING_TURN_END
    game.call_cabo()
    game.end_turn()
    game.phase = Phase.AWAITING_TURN_END
    game.end_turn()
    game.phase = Phase.AWAITING_TURN_END
    game.end_turn()
    assert(game.winner_loser() == None)
    players = [Player("rishin"), Player("roshna")]
    game = Game(players=players)
    players[1].hand = [Card("3", Suit.SPADES), Card("1", Suit.SPADES)]
    players[0].hand = [Card("3", Suit.HEARTS), Card("1", Suit.SPADES)]
    game.drawn_card = Card("Q", Suit.CLUBS) 
    game.phase = Phase.AWAITING_DISCARD
    game.discard_drawn()
    game.phase = Phase.AWAITING_TURN_END
    game.call_cabo()
    game.end_turn()
    game.phase = Phase.AWAITING_TURN_END
    game.end_turn()
    game.phase = Phase.AWAITING_TURN_END
    game.end_turn()
    assert(game.winner_loser() == None)
    assert(game.result() == {"rishin": (players[0].total_score(), players[0].hand), "roshna": (players[1].total_score(), players[1].hand)})
    game.phase = Phase.AWAITING_TURN_END
    with pytest.raises(InvalidMoveError, match="Cabo has already been called!"):
        game.call_cabo()


