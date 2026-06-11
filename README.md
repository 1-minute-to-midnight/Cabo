# Cabo Online

A small real-time browser version of Cabo for private rooms with friends.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`, create a room, and share the room code.

For friends outside your machine, host this server somewhere public or expose port `3000` with a tunnel/reverse proxy.

## Rules variant

- 2 to 6 players.
- Each player has four face-down cards and starts knowing their two left cards.
- Lowest total wins.
- Values: A = 1, number cards = face value, J/Q = 10, red kings = 0, black kings = 13.
- On your turn, draw from the deck or take the top discard.
- If you draw from the deck, either replace one of your cards or discard it.
- Discarding 7/8 lets you peek at one of your cards.
- Discarding 9/10 lets you peek at an opponent card.
- Discarding J/Q lets you swap one of your cards with an opponent card.
- Call Cabo before drawing. Everyone else gets one more turn, then all cards reveal and the lowest score wins.
