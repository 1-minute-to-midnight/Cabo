from dataclasses import dataclass, field
from enum import Enum, auto
from cabo.deck import Deck
from cabo.card import Card
from cabo.player import Player
from typing import  Optional


class Phase(Enum):
    AWAITING_DRAW = auto()
    AWAITING_DISCARD = auto()
    RESOLVING_POWER = auto()
    AWAITING_TURN_END = auto()
    ROUND_OVER = auto()



class InvalidMoveError(Exception):
    """Exception raised for invalid moves in the game."""
    pass


@dataclass
class Game:
    players: list[Player]
    deck: Deck= field(default_factory=Deck)
    discard_pile: list[Card] = field(default_factory=list)
    current_turn: int = 0
    drawn_card: Optional[Card] = None
    from_discard: bool = False
    phase: Phase = Phase.AWAITING_DRAW 
    cabo_caller: Optional[Player] = None


    def __post_init__(self):
        self.deck.shuffle()
        for player in self.players:
            for _ in range(4):
                player.hand.append(self.deck.draw())
                
    @property
    def discard_top(self) -> Card:
        return self.discard_pile[-1]


    def draw_from_deck(self) -> None:
        if self.phase == Phase.AWAITING_DRAW:
            self.drawn_card = self.deck.draw()
            self.from_discard = False
            self.phase = Phase.AWAITING_DISCARD
        else:
            raise InvalidMoveError("Cannot do that now!")


    def take_discard(self) -> None:
        if not self.discard_pile:
            raise InvalidMoveError("Can't take from empty discard pile!")
        elif self.phase == Phase.AWAITING_DRAW:
            self.drawn_card = self.discard_pile.pop()
            self.from_discard = True 
            self.phase = Phase.AWAITING_DISCARD
        else:
            raise InvalidMoveError("Cannot do that now!")
            

    def keep(self, slot) -> None:
        # self.current_turn maps to which player, then get that players hand
        if self.phase == Phase.AWAITING_DISCARD:
            self.discard_pile.append(self.players[self.current_turn].replace(slot, self.drawn_card))
            self.phase = Phase.AWAITING_TURN_END
        else:
            raise InvalidMoveError("Cannot do that now!")

        self.drawn_card = None
        self.from_discard = False


    def discard_drawn(self) -> None:
        if self.phase == Phase.AWAITING_DISCARD:
            if not self.from_discard:
                self.discard_pile.append(self.drawn_card)
                self.phase = Phase.AWAITING_TURN_END
            else:
                raise InvalidMoveError("Can't re-discard card taken from discard pile!")
        else:
            raise InvalidMoveError("Cannot do that now!")

        self.drawn_card = None
        self.from_discard = False


    def end_turn(self) -> None:
        if self.phase == Phase.AWAITING_TURN_END:
            self.current_turn = (self.current_turn + 1) % len(self.players)
            self.phase = Phase.AWAITING_DRAW
        else:
            raise InvalidMoveError("Cannot do that now!")




