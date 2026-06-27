from dataclasses import dataclass
from cabo.game import Game, Phase
import time
from cabo.player import Player


@dataclass
class Bot(Player):

    def make_decision(self, game: Game):
        match game.phase:
            case Phase.AWAITING_DRAW:
                game.draw_from_deck()
                print(f"{self.name} drew from deck")
                time.sleep(1)
            case Phase.AWAITING_DISCARD:
                game.discard_drawn() 
                print(f"{self.name} discards drawn card")
                time.sleep(1)
            case Phase.RESOLVING_POWER:
                game.skip()
                print(f"{self.name} skipped using power")
                time.sleep(1)
            case Phase.AWAITING_SWAP_DECISION:
                game.decline_swap() 
                print(f"{self.name} declined to swap")
                time.sleep(1)
            case Phase.AWAITING_TURN_END:
                game.end_turn()
                print(f"{self.name} ended their turn")
                time.sleep(1)



