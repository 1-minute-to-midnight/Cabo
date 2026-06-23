from dataclasses import dataclass, field
from cabo.card import Card

@dataclass
class Player:
    name: str
    hand: list = field(default_factory=list)


    def peek(self, index: int) -> Card:
        return self.hand[index]
        
    def replace(self, index: int, new_card: Card) -> Card:
        to_discard = self.hand[index]
        self.hand[index] = new_card
        return to_discard


    def total_score(self) -> int:
        return sum(card.value() for card in self.hand)
