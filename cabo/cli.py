from cabo.game import Game, InvalidMoveError, Phase
from cabo.player import Player
from cabo.card import Card, Power, Suit 





def render(game: Game) -> None:
    player_current = game.players[game.current_turn].name
    discard_top = game.discard_top
    drawn_card = game.drawn_card
    
    player_hand_display = ""
    for index, p in enumerate(game.players):
        hand_display = ""
        suffix = " (you)" if index == game.current_turn else ""
        player_name_status = f"[{index}] {p.name}{suffix}:"
        for i, card in enumerate(p.hand):
            hand_display +=  f"   [{i}] {card}"

        player_hand_display += player_name_status + hand_display + "\n"


    header = f"── Cabo ──  Turn: {player_current}   Phase: {game.phase.name}\n\n"

    card_decks = f"Discard Pile: {discard_top}      Deck: {len(game.deck)} left         Holding Area: {drawn_card}\n\n\n"


    print(header + card_decks + player_hand_display)


def choicer(valid_choices: list, prompt="Pick an action: ") -> int:
    start_idx = 0
    end_idx = len(valid_choices) - 1
    for i, choice in enumerate(valid_choices):
        print(f"[{i}] {choice}\n")
    while True:
        try:
            pick_choice = (int(input(prompt)))
            if start_idx <= pick_choice <= end_idx:
                    return pick_choice 
            else:
                print("Please enter a valid number!")

        except ValueError:
            print("Please enter a valid number!")

        



def handle_awaiting_draw(game: Game) -> None:
    valid_choices = ["Draw from discard", "Draw from Deck"]
    
    while True:
        player_choice = choicer(valid_choices)
        try:
            match player_choice:
                case 0:
                    game.take_discard()
                    break
                case 1:
                    game.draw_from_deck()
                    break
        except InvalidMoveError as e:
            print(e)



def handle_awaiting_discard(game: Game) -> None:
    valid_choices = ["Discard drawn card", "Replace with your own card"]
    while True:
        player_choice = choicer(valid_choices)
        try:
            match player_choice:
                case 0:
                    game.discard_drawn()
                    break
                case 1:
                    slot = choicer([str(card) for card in game.players[game.current_turn].hand], "Pick a card slot: ")
                    game.keep(slot)
                    break
        except InvalidMoveError as e:
            print(e)

def resolve_player_index(game, player_a = None) -> int:
    valid_opps = [(idx, player.name) for idx, player in enumerate(game.players) if player_a is None or player != game.players[player_a]]
    choice_opp = choicer([name for _, name in valid_opps], "Pick a player: ") 
    opp = valid_opps[choice_opp][0]
    return opp



def gather_power_inputs(game, power) -> dict:
    current_player = game.players[game.current_turn]
    match power:
        case Power.PEEK_OWN_CARD:
            slot = choicer([i for i in range(len(game.players[player_a].hand))], "Pick a card slot to peek: ")
            return{"slot_a": slot}

        case Power.PEEK_OPPONENT_CARD:
            player_a = game.current_turn
            opp = resolve_player_index(game, player_a) 
            slot = choicer([i for i in range(len(game.players[opp].hand))], "Pick a card slot to peek: ") 
            return {"player_b": opp, "slot_b": slot} 

        case Power.BLIND_SWAP | Power.FORCED_SWAP | Power.CHOICE_SWAP:
            player_a = resolve_player_index(game)
            slot_a = choicer([i for i in range(len(game.players[player_a].hand))], "Pick your card slot to swap: ") 
            player_b = resolve_player_index(game, player_a) 
            slot_b = choicer([i for i in range(len(game.players[player_b].hand))], "Pick opponent's card slot: ")
            return {"player_a": player_a, "slot_a": slot_a, "player_b": player_b, "slot_b": slot_b}


def handle_resolve_power(game: Game) -> None:
    power = game.discard_top.power()
    valid_choices = ["Use Power", "Skip Power"]
    while True:
        player_choice = choicer(valid_choices)
        try:
            match player_choice:
                case 0:
                    kwargs = gather_power_inputs(game, power)
                    result = game.resolve_power(**kwargs)
                    print(result)
                    break
                case 1:
                    game.skip()
                    break
        except InvalidMoveError as e:
            print(e)


def handle_swap_decision(game: Game) -> None:
    valid_choices = ["Do the swap", "Skip swap"]
    while True:
        player_choice = choicer(valid_choices)
        try:
            match player_choice:
                case 0:
                    game.complete_swap() 
                    break
                case 1:
                    game.decline_swap()
                    break
        except InvalidMoveError as e:
            print(e)

def handle_turn_end(game: Game) -> None:
    valid_choices = ["Call Cabo", "End Turn"]
    while True:
        player_choice = choicer(valid_choices)
        try:
            match player_choice:
                case 0:
                    game.call_cabo() 
                    break
                case 1:
                    game.end_turn()
                    break
        except InvalidMoveError as e:
            print(e)


def print_result(game):
    for name, p in game.result().items():
        print(f"{name} scored {p.score} with hand: {p.hand}")
    print(f"Winner is {game.winner_loser()}" if game.winner_loser() is not None else "Nobody wins!")

def play(game):
    while game.phase != Phase.ROUND_OVER:
        render(game)
        match game.phase:
            case Phase.AWAITING_DRAW:          handle_awaiting_draw(game)
            case Phase.AWAITING_DISCARD:       handle_awaiting_discard(game)
            case Phase.RESOLVING_POWER:        handle_resolve_power(game)
            case Phase.AWAITING_SWAP_DECISION: handle_swap_decision(game)
            case Phase.AWAITING_TURN_END:      handle_turn_end(game)
    # round over:
    render(game)
    print_result(game)   # winner + everyone's hands


players = [Player("rishin"), Player("roshna"), Player("dona")]
game = Game(players=players)
play(game)
