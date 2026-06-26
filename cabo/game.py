from dataclasses import dataclass, field
from enum import Enum, auto
from cabo.deck import Deck
from cabo.card import Card, Power
from cabo.player import Player
from typing import  Optional
from collections import namedtuple


PlayerResult = namedtuple('PlayerResult', ['score', 'hand'])


class Phase(Enum):
    AWAITING_DRAW = auto()
    AWAITING_DISCARD = auto()
    RESOLVING_POWER = auto()
    AWAITING_TURN_END = auto()
    AWAITING_SWAP_DECISION = auto()
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
    pending_swap: Optional[tuple[int, int, int, int]] = None


    def __post_init__(self):
        self.deck.shuffle()
        for player in self.players:
            for _ in range(4):
                player.hand.append(self.deck.draw())
                
    @property
    def discard_top(self) -> Card | None:
        if self.discard_pile:
            return self.discard_pile[-1]
        else:
            return None


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
                if self.discard_top.power() != Power.NONE:
                    self.phase = Phase.RESOLVING_POWER
                else:
                    self.phase = Phase.AWAITING_TURN_END
            else:
                raise InvalidMoveError("Can't re-discard card taken from discard pile!")
        else:
            raise InvalidMoveError("Cannot do that now!")

        self.drawn_card = None
        self.from_discard = False


    def end_turn(self) -> None:
        if self.phase != Phase.AWAITING_TURN_END:
            raise InvalidMoveError("Cannot do that now!")
        next_turn = (self.current_turn + 1) % len(self.players)
        if self.cabo_caller is not None and self.players[next_turn] is self.cabo_caller:
            self.phase = Phase.ROUND_OVER          
        else:
            self.current_turn = next_turn
            self.phase = Phase.AWAITING_DRAW

    def resolve_power(self, player_a=None, slot_a=None, player_b=None, slot_b=None) -> Card | None | tuple[Card, Card]:
        if self.phase == Phase.RESOLVING_POWER:
            #resolve each power
            match self.discard_top.power():
                case Power.PEEK_OWN_CARD:
                    result = self.peek_own(slot_a)
                case Power.PEEK_OPPONENT_CARD:
                    result = self.peek_opponent(player_b, slot_b)
                case Power.BLIND_SWAP:
                    self._swap(player_a, slot_a, player_b, slot_b)
                    result = None
                case Power.FORCED_SWAP:
                    self._check_distinct(player_a, player_b)         # validate before peeking (no info leak)
                    card_a = self.players[player_a].peek(slot_a)     # peek the ACTUAL two target cards
                    card_b = self.players[player_b].peek(slot_b)
                    self._swap(player_a, slot_a, player_b, slot_b)   # forced
                    result = card_a, card_b
                case Power.CHOICE_SWAP:
                    return self.look(player_a, slot_a, player_b, slot_b)   # ends in AWAITING_SWAP_DECISION, not TURN_END 
            self.phase = Phase.AWAITING_TURN_END
            return result

        else:
            raise InvalidMoveError("Cannot do that now!")

    
    def skip(self) -> None:
        if self.phase == Phase.RESOLVING_POWER:
            self.phase = Phase.AWAITING_TURN_END
        else:
            raise InvalidMoveError("Cannot do that now!")

    def peek_own(self, slot_a) -> Card:
        return self.players[self.current_turn].peek(slot_a)

    def peek_opponent(self, player_b, slot_b) -> Card:
        return self.players[player_b].peek(slot_b)

    def _check_distinct(self, player_a, player_b):
        if player_a == player_b:
            raise InvalidMoveError("The two cards must belong to different players!")

    def _swap(self, player_a, slot_a, player_b, slot_b) -> None:
        self._check_distinct(player_a, player_b)
        card_a = self.players[player_a].hand[slot_a]
        card_b = self.players[player_b].hand[slot_b]
        self.players[player_a].replace(slot_a, card_b)
        self.players[player_b].replace(slot_b, card_a)

    def look(self, player_a, slot_a, player_b, slot_b) -> tuple[Card, Card]:
        self._check_distinct(player_a, player_b)
        own = self.players[player_a].peek(slot_a)
        opp = self.players[player_b].peek(slot_b)
        self.phase = Phase.AWAITING_SWAP_DECISION
        self.pending_swap = (player_a, slot_a, player_b, slot_b)
        return own, opp

    def complete_swap(self) -> None:
        if self.phase == Phase.AWAITING_SWAP_DECISION:
            player_a, slot_a, player_b, slot_b = self.pending_swap
            self._swap(player_a, slot_a, player_b, slot_b)
            self.phase = Phase.AWAITING_TURN_END
            self.pending_swap = None

        else:
            raise InvalidMoveError("Cannot do that now!")


    def decline_swap(self) -> None:
        if self.phase == Phase.AWAITING_SWAP_DECISION:
            self.pending_swap = None
            self.phase = Phase.AWAITING_TURN_END
            
        else:
            raise InvalidMoveError("Cannot do that now!")


    def call_cabo(self):
        if self.phase != Phase.AWAITING_TURN_END:
            raise InvalidMoveError("Cannot do that now!")
        if self.cabo_caller is not None:
            raise InvalidMoveError("Cabo has already been called!")
        self.cabo_caller = self.players[self.current_turn]

    
    

    def result(self) -> dict[str, PlayerResult]:
        if self.phase != Phase.ROUND_OVER:
            raise InvalidMoveError("Cannot do that now!")
        return {p.name: PlayerResult(p.total_score(), p.hand) for p in self.players}

    def winner_loser(self):
        if self.phase != Phase.ROUND_OVER:
            raise InvalidMoveError("Cannot do that now!")
        caller = self.cabo_caller.name
        caller_score = self.result()[caller].score
        others = [p.score for name, p in self.result().items() if name != caller]
        if caller_score < 7 and all(caller_score < other for other in others):
            return caller
        else:
            return None
        

        


    












