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




