from dataclasses import dataclass
from enum import Enum, auto



class Power(Enum):
            LOOK_AND_SWAP = auto()
            FORCED_SWAP = auto()
            BLIND_SWAP = auto()
            PEEK_OPPONENT_CARD = auto()
            PEEK_OWN_CARD = auto()
            NONE = auto()


class Suit(Enum):
    HEARTS = auto()
    DIAMONDS = auto()
    CLUBS = auto()
    SPADES = auto()


@dataclass(frozen = True) # frozen = True so card can't be mutated after creation
class Card:
    rank: str
    suit: Suit

    
    # if special use point table else str to int conversion

    def value(self) -> int:
        point_table = {
            "A" : 1,
            "K" : 13,
            "Q" : 12,
            "J" : 11,
            }

        
        # Red Kings are special
        if self.rank == "K" and self.suit in (Suit.DIAMONDS, Suit.HEARTS):
            return -1

        elif self.rank in point_table:
            return point_table[self.rank]
        
        else:
            return int(self.rank)


    def power(self) -> Power:
        power_table = {
        "K" : Power.LOOK_AND_SWAP,
        "Q" : Power.FORCED_SWAP,            
        "J" : Power.BLIND_SWAP,
        "10": Power.PEEK_OPPONENT_CARD,
        "9" : Power.PEEK_OPPONENT_CARD,
        "8" : Power.PEEK_OWN_CARD,
        "7" : Power.PEEK_OWN_CARD,

            }
        if self.rank == "K" and self.suit in (Suit.DIAMONDS, Suit.HEARTS):
            return Power.NONE

        elif self.rank in power_table:
            return power_table[self.rank]

        else:
            return Power.NONE




    




