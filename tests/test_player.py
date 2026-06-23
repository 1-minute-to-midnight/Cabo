from cabo.player import Player
from cabo.card import Card, Suit


def test_score():
    rishin = Player("rishin", hand=[Card("K", Suit.HEARTS), Card("K", Suit.DIAMONDS)])
    roshna = Player("roshna", hand=[Card("K", Suit.HEARTS), Card("K", Suit.CLUBS), 
                                    Card("A", Suit.CLUBS), Card("7", Suit.SPADES)]) 
    dona = Player("dona", hand=[Card("K", Suit.HEARTS), Card("A", Suit.SPADES)]) 
    dany = Player("dany", hand=[Card("K", Suit.SPADES), Card("Q", Suit.CLUBS), 
                                    Card("J", Suit.HEARTS), Card("10", Suit.DIAMONDS)]) 
    assert(rishin.total_score() == -2)
    assert(roshna.total_score() == 20)
    assert(dona.total_score() == 0)
    assert(dany.total_score() == 46)


def test_replace():
    rishin = Player("rishin", hand=[Card("K", Suit.HEARTS), Card("K", Suit.DIAMONDS)])
    discard = rishin.replace(1, Card("K", Suit.SPADES))
    assert(rishin.total_score() == 12)
    assert(rishin.hand[1] == Card("K", Suit.SPADES))
    assert(discard == Card("K", Suit.DIAMONDS))


def test_peek():
    rishin = Player("rishin", hand=[Card("K", Suit.HEARTS), Card("K", Suit.DIAMONDS)])
    assert(rishin.peek(1) == Card("K", Suit.DIAMONDS))


