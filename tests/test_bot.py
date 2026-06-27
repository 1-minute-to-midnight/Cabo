from cabo.bot import Bot
from cabo.game import Game, Phase
from cabo.card import Card, Suit

def test_botvbot(monkeypatch):
    monkeypatch.setattr("cabo.bot.time.sleep", lambda _: None)
    players = [Bot("bot1"), Bot("bot2")]
    game = Game(players=players)
    steps = 0

    while game.phase != Phase.ROUND_OVER and steps < 300:
        players[game.current_turn].make_decision(game)
        steps += 1

    assert (game.phase == Phase.ROUND_OVER)


def test_bot_draw(monkeypatch):
    monkeypatch.setattr("cabo.bot.time.sleep", lambda _: None)
    bot = Bot("bot")
    game = Game(players=[bot, Bot("other")])
    bot.make_decision(game)

    assert (game.phase == Phase.AWAITING_DISCARD)
    assert (game.drawn_card is not None)

def test_bot_keeps_better_drawn_card (monkeypatch):
    monkeypatch.setattr("cabo.bot.time.sleep", lambda _: None)
    bot = Bot("bot")
    game = Game(players=[bot, Bot("other")])

    bot.hand = [Card("K", Suit.SPADES), Card("5", Suit.CLUBS)]
    game.drawn_card = Card("A", Suit.HEARTS)
    game.phase = Phase.AWAITING_DISCARD

    bot.make_decision(game)

    assert Card("A", Suit.HEARTS) in bot.hand
    assert game.phase == Phase.AWAITING_TURN_END

def test_bot_discards_worse_drawn_card (monkeypatch):
    monkeypatch.setattr("cabo.bot.time.sleep", lambda _: None)
    bot = Bot("bot")
    game = Game(players=[bot, Bot("other")])

    bot.hand = [Card("A", Suit.HEARTS), Card("2", Suit.CLUBS)]
    game.drawn_card = Card("Q", Suit.SPADES)
    game.phase = Phase.AWAITING_DISCARD

    bot.make_decision(game)

    assert game.discard_top == Card("Q", Suit.SPADES)
    assert game.phase in (Phase.RESOLVING_POWER, Phase.AWAITING_TURN_END)




