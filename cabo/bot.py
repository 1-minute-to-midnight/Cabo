from dataclasses import dataclass
from cabo.game import Game, Phase
import time
from cabo.player import Player
from cabo.card import Power 
import random



@dataclass
class Bot(Player):

    def bot_gather_inputs(self, game: Game, power) -> dict:
        current_player = game.players[game.current_turn]
        valid_opp_indices = [
                idx for idx in range(len(game.players)) 
                if idx != game.current_turn
            ]
        match power:
            case Power.PEEK_OWN_CARD:
                player_a = game.current_turn
                slot = random.randrange(0, len(game.players[player_a].hand)) 
                print("Peeked own card")
                return{"slot_a": slot}

            case Power.PEEK_OPPONENT_CARD:
                opp = random.choice(valid_opp_indices)
                slot = random.randrange(0, len(game.players[opp].hand))
                print("Peeked opponent card")
                return {"player_b": opp, "slot_b": slot} 

            case Power.BLIND_SWAP | Power.FORCED_SWAP | Power.CHOICE_SWAP:
                player_a = game.current_turn
                slot_a =  next((i for i, card in enumerate(current_player.hand) if card.value() > 10), random.randrange(0, len(current_player.hand)))  
                player_b = random.choice(valid_opp_indices) 
                slot_b =  random.randrange(0, len(game.players[player_b].hand))               
                return {"player_a": player_a, "slot_a": slot_a, "player_b": player_b, "slot_b": slot_b}




    def make_decision(self, game: Game):
        current_player = game.players[game.current_turn]
        match game.phase:
            case Phase.AWAITING_DRAW:
                game.draw_from_deck()
                print(f"{self.name} drew from deck")
                time.sleep(1)
            case Phase.AWAITING_DISCARD:
                max_card_i, max_card = max(enumerate(current_player.hand), key=lambda item: item[1].value())
                
                if game.drawn_card is not None and max_card.value() > game.drawn_card.value(): 
                    game.keep(max_card_i)
                    print(f"{self.name} keeps the drawn card")
                else:
                    game.discard_drawn() 
                    print(f"{self.name} discards drawn card")
                time.sleep(1)
            case Phase.RESOLVING_POWER:
                power = game.discard_top.power()
                kwargs = self.bot_gather_inputs(game, power)
                game.resolve_power(**kwargs)
                print(f"{self.name} used power")
                time.sleep(1)
            case Phase.AWAITING_SWAP_DECISION:
                player_a, slot_a, player_b, slot_b = game.pending_swap
                if game.players[player_a].hand[slot_a].value() > game.players[player_b].hand[slot_b].value(): 
                        game.complete_swap()
                        print(f"{self.name} swapped cards")
                        time.sleep(1)
                else:
                    game.decline_swap() 
                    print(f"{self.name} declined to swap")
                    time.sleep(1)
            case Phase.AWAITING_TURN_END:
                if not game.cabo_caller and self.total_score() < 7:
                    game.call_cabo()
                    print(f"{self.name} called Cabo!")
                    time.sleep(1)
                game.end_turn()
                print(f"{self.name} ended their turn")
                time.sleep(1)



