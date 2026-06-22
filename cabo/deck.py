from dataclasses import dataclass, field
from cabo.card import (
    Card,
    Suit,
)
import random

@dataclass
class Deck:
    cards: list = field(default_factory=list, init=False)

    def __post_init__(self):
        for s in Suit:
            for r in Card.RANKS:
                card = Card(r, s)
                self.cards.append(card)


    def draw(self) -> Card:
        if not self.cards:
            return reshuffle() # take all cards from draw pile except top card and shuffle into deck.
        else:
            return self.cards.pop()

    def shuffle(self) -> None:
        random.shuffle(self.cards)

    def __len__(self) -> int:
        return len(self.cards)

    def __contains__(self, card) -> bool:
        return card in self.cards


    


