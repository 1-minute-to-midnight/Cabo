from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from cabo.game import Game, InvalidMoveError
from cabo.player import Player
import random
import string

app = FastAPI()

class CardResponse(BaseModel):
    rank: str
    suit: str 

class CreateGameRequest(BaseModel):
    players: list[str]

class GameCreatedResponse(BaseModel):
    message: str
    game_code: str

class GameStatusResponse(BaseModel):
    game_code: str
    players: list[str]
    turn : str 
    discard_pile : CardResponse | None
    deck: int 
    phase: str    
    player_hands: dict[str, list[CardResponse]]
    drawn_card: CardResponse | None
    cabo_caller: str | None
    pending_swap: tuple[int, int, int, int] | None 
    from_discard: bool


class ResolvePowerRequest(BaseModel):
    player_a: int | None = None
    slot_a: int | None = None
    player_b: int | None = None
    slot_b: int | None = None
    
games: dict[str, Game] = {}


@app.get("/ping")
def ping():
    return {"status": "ok"}


def generate_game_code(length=6):
    characters = string.ascii_uppercase + string.digits
    return ''.join(random.choices(characters, k=length))

@app.post("/games", response_model=GameCreatedResponse)
def create_game(request_data: CreateGameRequest):
    string_list = request_data.players
    player_list = [Player(name) for name in string_list]
    new_game = Game(player_list)
    code = generate_game_code()
    games[code] = new_game

    return {
            "message" : "Game created successfully!",
            "game_code": code
            }


def serialize_game(game, code):
    return {
                "game_code": code,
                "players": [player.name for player in game.players],
                "turn" : game.players[game.current_turn].name,
                "discard_pile" : game.discard_top,
                "deck": len(game.deck),
                "phase": game.phase.name,
                "player_hands": {player.name: player.hand for player in game.players}, 
                "drawn_card": game.drawn_card if game.drawn_card else None,
                "cabo_caller": game.cabo_caller.name if game.cabo_caller else None, 
                "pending_swap": game.pending_swap if game.pending_swap else None,
                "from_discard": game.from_discard
                }

def get_current_game(code: str) -> Game:
    if code not in games:
        raise HTTPException(status_code=404, detail="Game not found")
    return games[code]

@app.get("/games/{code}", response_model=GameStatusResponse)
def get_game_state(code: str, game: Game = Depends(get_current_game)):
    return serialize_game(game, code) 

@app.exception_handler(InvalidMoveError)
def invalid_move_exception_handler(request: Request, exc: InvalidMoveError):
    return JSONResponse(
            status_code=400, # 400 Bad request
            content = {
                "status": "error",
                "message": str(exc)
                }
            )

@app.post("/games/{code}/draw-from-deck")
def do_draw_from_deck(code: str, game: Game = Depends(get_current_game)):
    game.draw_from_deck()
    return serialize_game(game, code)

@app.post("/games/{code}/take-discard")
def do_take_discard(code: str, game: Game = Depends(get_current_game)):
    game.take_discard()
    return serialize_game(game, code)

@app.post("/games/{code}/keep/{slot}")
def do_keep(slot: int, code: str, game: Game = Depends(get_current_game)):
    game.keep(slot)
    return serialize_game(game, code)

@app.post("/games/{code}/resolve-power")
def do_resolve_power(payload: ResolvePowerRequest, code: str, game: Game = Depends(get_current_game)):
    game.resolve_power(**payload.model_dump())
    return serialize_game(game, code)

@app.post("/games/{code}/complete-swap")
def do_complete_swap(code: str, game: Game = Depends(get_current_game)):
    game.complete_swap()
    return serialize_game(game, code)

@app.post("/games/{code}/decline-swap")
def do_decline_swap(code: str, game: Game = Depends(get_current_game)):
    game.decline_swap()
    return serialize_game(game, code)

@app.post("/games/{code}/skip")
def do_skip(code: str, game: Game = Depends(get_current_game)):
    game.skip()
    return serialize_game(game, code)

@app.post("/games/{code}/call-cabo")
def do_call_cabo(code: str, game: Game = Depends(get_current_game)):
    game.call_cabo()
    return serialize_game(game, code)

@app.post("/games/{code}/end-turn")
def do_end_turn(code: str, game: Game = Depends(get_current_game)):
    game.end_turn()
    return serialize_game(game, code)
