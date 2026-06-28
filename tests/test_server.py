from fastapi.testclient import TestClient
from cabo.game import Game
from cabo.server import app, games
from cabo.player import Player


client = TestClient(app)

def test_create_game():
    r = client.post("/games", json={"players": ["a", "b"]})
    assert r.status_code == 200
    assert "game_code" in r.json()

def test_missing_game():
    assert client.get("/games/NONE").status_code == 404


def test_some_moves():
    code = client.post("/games", json={"players": ["a", "b"]}).json()["game_code"]
    client.post(f"/games/{code}/draw-from-deck")
    assert client.post(f"/games/{code}/draw-from-deck").status_code == 400 # Double Draw 
    assert client.get(f"/games/{code}").json()["drawn_card"]
    assert client.post(f"/games/{code}/keep/0").status_code == 200
    assert client.post(f"/games/{code}/call-cabo").status_code == 200
    assert client.post(f"/games/{code}/end-turn").status_code == 200


def test_websocket_action_broadcast():
    code = client.post("/games", json={"players": ["a", "b"]}).json()["game_code"]    
    with client.websocket_connect(f"/ws/{code}") as a, client.websocket_connect(f"/ws/{code}") as b:
        a.send_json({"type": "draw_from_deck"})
        assert b.receive_json()["drawn_card"]

    del games[f"{code}"]


