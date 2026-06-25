import pytest
from cabo.card import Card, Suit, Power

def test_red_king_val_heart():
    card = Card("K", Suit.HEARTS) 
    assert card.value() == -1

def test_red_king_val_diamond():
    card = Card("K", Suit.DIAMONDS) 
    assert card.value() == -1

@pytest.mark.parametrize("inp, expected", [
    ("1", 1),
    ("2", 2),
    ("3", 3),  
    ("4", 4),
    ("5", 5),
    ("6", 6),
    ("7", 7),
    ("8", 8),
    ("9", 9),
    ("10", 10),

])

def test_number_cards(inp, expected):
    card = Card(inp, Suit.HEARTS)
    assert card.value() == expected
    

def test_black_king_Club():
    card = Card("K", Suit.CLUBS)
    assert card.value() == 13

def test_black_king_Spade():
    card = Card("K", Suit.SPADES)
    assert card.value() == 13


def test_ace():
    card = Card("A", Suit.HEARTS)
    assert card.value() == 1


def test_queen():
    card = Card("Q", Suit.CLUBS)
    assert card.value() == 12


def test_jack():
    card = Card("J", Suit.CLUBS)
    assert card.value() == 11

@pytest.mark.parametrize("inp, expected", [

    ("7", Power.PEEK_OWN_CARD),
    ("8", Power.PEEK_OWN_CARD),
    ("9", Power.PEEK_OPPONENT_CARD),
    ("10", Power.PEEK_OPPONENT_CARD),
    ("K", Power.CHOICE_SWAP),
    ("Q", Power.FORCED_SWAP),
    ("J", Power.BLIND_SWAP),
    ("A", Power.NONE),
    ("1", Power.NONE),



])
def test_power(inp, expected):
    card = Card(inp, Suit.CLUBS) 
    assert card.power() == expected 


def test_red_king_power():
    card = Card("K", Suit.DIAMONDS) 
    assert card.power() == Power.NONE 

