from dataclasses import dataclass
from enum import Enum, auto
from typing import ClassVar



class Power(Enum):
    CHOICE_SWAP = auto()
    FORCED_SWAP = auto()
    BLIND_SWAP = auto()
    PEEK_OPPONENT_CARD = auto()
    PEEK_OWN_CARD = auto()
    NONE = auto()


class Suit(Enum):
    HEARTS = "HEARTS"
    DIAMONDS = "DIAMONDS"
    CLUBS = "CLUBS"
    SPADES = "SPADES"


@dataclass(frozen = True) # frozen = True so card can't be mutated after creation
class Card:
    rank: str
    suit: Suit

    RANKS: ClassVar[tuple[str, ...]] = ("A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K")


    point_table = {
            "A" : 1,
            "K" : 13,
            "Q" : 12,
            "J" : 11,
            }

    power_table = {
        "K" : Power.CHOICE_SWAP,
        "Q" : Power.FORCED_SWAP,            
        "J" : Power.BLIND_SWAP,
        "10": Power.PEEK_OPPONENT_CARD,
        "9" : Power.PEEK_OPPONENT_CARD,
        "8" : Power.PEEK_OWN_CARD,
        "7" : Power.PEEK_OWN_CARD,

            }

    symbol_table = {
            Suit.SPADES: "♠",
            Suit.CLUBS: "♣",
            Suit.DIAMONDS: "♦",
            Suit.HEARTS: "♥",
            }
    
    # if special use point table else str to int conversion

    def value(self) -> int:
        # Red Kings are special
        if self.rank == "K" and self.suit in (Suit.DIAMONDS, Suit.HEARTS):
            return -1

        elif self.rank in Card.point_table:
            return Card.point_table[self.rank]
        
        else:
            return int(self.rank)


    def power(self) -> Power:
        if self.rank == "K" and self.suit in (Suit.DIAMONDS, Suit.HEARTS):
            return Power.NONE

        elif self.rank in Card.power_table:
            return Card.power_table[self.rank]

        else:
            return Power.NONE

    def __repr__(self) -> str:
        return f"{self.rank}{self.symbol_table[self.suit]}"




    




