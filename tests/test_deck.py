# import pytest
from cabo.deck import Deck
from cabo.card import Card, Suit
import copy

def test_length():
    deck = Deck()
    assert(len(deck) == 52)


def test_shuffle():
    deck = Deck()
    deck1 = copy.deepcopy(deck)
    deck.shuffle()
    assert(len(deck) == 52)
    assert(deck1.cards != deck.cards)

def test_kings():
    deck = Deck()
    assert(Card("K", Suit.HEARTS) in deck)
    assert(Card("K", Suit.DIAMONDS) in deck)
    assert(Card("K", Suit.CLUBS) in deck)
    assert(Card("K", Suit.SPADES) in deck)

def test_duplicates():
    deck = Deck()
    assert(len(set(deck.cards)) == 52)

def test_draw():
    deck = Deck()
    assert isinstance(deck.draw(), Card)
    assert (len(deck) == 51)

