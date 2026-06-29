from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
from cabo.game import Game, InvalidMoveError
from cabo.player import Player
import random
import string
from typing import Any

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
    player_hands: dict[str, int]
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


def get_current_game(code: str) -> Game:
    if code not in games:
        raise HTTPException(status_code=404, detail="Game not found")
    return games[code]


def serialize_game(code: str, game: Game, viewer: str = None):
    return {
                "game_code": code,
                "players": [player.name for player in game.players],
                "turn" : game.players[game.current_turn].name,
                "discard_pile" : game.discard_top,
                "deck": len(game.deck),
                "phase": game.phase.name,
                "player_hands": {player.name: len(player.hand) for player in game.players}, 
                "drawn_card": game.drawn_card if game.players[game.current_turn].name == viewer and game.drawn_card else None,
                "cabo_caller": game.cabo_caller.name if game.cabo_caller else None, 
                "pending_swap": game.pending_swap if game.players[game.current_turn].name == viewer and game.pending_swap else None,
                "from_discard": game.from_discard
                }

@app.get("/games/{code}", response_model=GameStatusResponse)
def get_game_state(code: str, game: Game = Depends(get_current_game)):
    return serialize_game(code, game) 

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
    return serialize_game(code, game)

@app.post("/games/{code}/take-discard")
def do_take_discard(code: str, game: Game = Depends(get_current_game)):
    game.take_discard()
    return serialize_game(code, game)

@app.post("/games/{code}/keep/{slot}")
def do_keep(slot: int, code: str, game: Game = Depends(get_current_game)):
    game.keep(slot)
    return serialize_game(code, game)

@app.post("/games/{code}/discard-drawn")
def do_discard_drawn(code: str, game: Game = Depends(get_current_game)):
    game.discard_drawn()
    return serialize_game(code, game)

@app.post("/games/{code}/resolve-power")
def do_resolve_power(payload: ResolvePowerRequest, code: str, game: Game = Depends(get_current_game)):
    game.resolve_power(**payload.model_dump())
    return serialize_game(code, game)

@app.post("/games/{code}/complete-swap")
def do_complete_swap(code: str, game: Game = Depends(get_current_game)):
    game.complete_swap()
    return serialize_game(code, game)

@app.post("/games/{code}/decline-swap")
def do_decline_swap(code: str, game: Game = Depends(get_current_game)):
    game.decline_swap()
    return serialize_game(code, game)

@app.post("/games/{code}/skip")
def do_skip(code: str, game: Game = Depends(get_current_game)):
    game.skip()
    return serialize_game(code, game)

@app.post("/games/{code}/call-cabo")
def do_call_cabo(code: str, game: Game = Depends(get_current_game)):
    game.call_cabo()
    return serialize_game(code, game)

@app.post("/games/{code}/end-turn")
def do_end_turn(code: str, game: Game = Depends(get_current_game)):
    game.end_turn()
    return serialize_game(code, game)

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, dict[str, WebSocket]] = {} 

    async def connect(self, code: str, player: str, websocket: WebSocket):
        await websocket.accept()
        if code not in self.active_connections:
            self.active_connections[code] = {}
        self.active_connections[code][player]=websocket

    def disconnect(self, code: str, player: str):
        if code in self.active_connections and player in self.active_connections[code]:
            del self.active_connections[code][player]

            if not self.active_connections[code]:
                del self.active_connections[code]

    async def broadcast(self, code: str, message: Any):
        if code in self.active_connections:
            for connection in self.active_connections[code].values():
                await connection.send_json(message)

manager = ConnectionManager()

@app.websocket("/ws/{code}/{player}")
async def websocket_endpoint(code: str, player: str, websocket: WebSocket):
    if code not in games:
        await websocket.close(code=4004) # Custom close code for Room Not Found
        return
    await manager.connect(code, player, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            action_type = data.get("type")
            game = games[code]
            try:
                peeked  = []
                if action_type!= "snap" and player != game.players[game.current_turn].name:
                    await websocket.send_json({"status": "error", "message": "Not your turn!"})
                    continue
                match action_type:
                    case "draw_from_deck": game.draw_from_deck()
                    case "take_discard": game.take_discard() 
                    case "keep": game.keep(data.get("slot"))
                    case "discard_drawn": game.discard_drawn() 
                    case "resolve_power": 
                        result = game.resolve_power(**data.get("payload"))
                        if result is None: peeked = []
                        elif isinstance(result, tuple): peeked = list(result)
                        else: peeked = [result]
                    case "complete_swap": game.complete_swap()
                    case "decline_swap": game.decline_swap()
                    case "skip": game.skip()
                    case "call_cabo": game.call_cabo()
                    case "end_turn": game.end_turn()
                    case "snap":
                        snapper_index = next(i for i, p in enumerate(game.players) if p.name == player)
                        game.snap(snapper_index, data.get("target_player"), data.get("target_slot"))
                if peeked:
                    serialized_cards = [CardResponse.model_validate(card) for card in peeked]
                    await websocket.send_json({"peek": jsonable_encoder(serialized_cards)})
                for player, socket in manager.active_connections[code].items():
                    player_specific_json = jsonable_encoder(serialize_game(code, game, viewer=player))
                    await socket.send_json(player_specific_json)

            except InvalidMoveError as e:
                await websocket.send_json({"status": "error", "message": str(e)} )
    except WebSocketDisconnect:
        manager.disconnect(code, player)
        await manager.broadcast(code, f"Game #{code} user left the room")

    


