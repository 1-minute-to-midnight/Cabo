const crypto = require("crypto");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const ROOM_CODE_LENGTH = 5;
const SUITS = ["clubs", "diamonds", "hearts", "spades"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const POWER_LABELS = {
  ownPeek: "Peek at one of your cards",
  otherPeek: "Peek at one opponent card",
  swap: "Swap one of your cards with an opponent card"
};

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

/** @type {Map<string, import("./types").Room>} */
const rooms = new Map();

function makeRoomCode() {
  let code = "";
  do {
    code = crypto.randomBytes(4).toString("base64url").replace(/[^A-Z0-9]/gi, "").slice(0, ROOM_CODE_LENGTH).toUpperCase();
  } while (rooms.has(code) || code.length < ROOM_CODE_LENGTH);
  return code;
}

function makeId(prefix = "") {
  return `${prefix}${crypto.randomBytes(8).toString("hex")}`;
}

function cardValue(rank, suit) {
  if (rank === "A") return 1;
  if (["J", "Q"].includes(rank)) return 10;
  if (rank === "K") return suit === "hearts" || suit === "diamonds" ? 0 : 13;
  return Number(rank);
}

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: makeId("c_"),
        rank,
        suit,
        value: cardValue(rank, suit),
        knownTo: []
      });
    }
  }
  return shuffle(deck);
}

function shuffle(cards) {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 24) || "Player";
}

function getRoomOrThrow(roomCode) {
  const room = rooms.get(String(roomCode || "").toUpperCase());
  if (!room) throw new Error("Room not found.");
  return room;
}

function getPlayer(room, playerId) {
  return room.players.find((player) => player.id === playerId);
}

function activePlayers(room) {
  return room.players.filter((player) => !player.left);
}

function currentPlayer(room) {
  return activePlayers(room)[room.turnIndex] || null;
}

function advanceTurn(room) {
  const players = activePlayers(room);
  if (!players.length) return;

  room.pendingPower = null;
  room.drawnCard = null;
  room.turnPhase = "draw";

  if (room.caboCalledBy && room.finalTurnsRemaining <= 0) {
    finishRound(room);
    return;
  }

  room.turnIndex = (room.turnIndex + 1) % players.length;

  if (room.caboCalledBy) {
    room.finalTurnsRemaining -= 1;
    if (room.finalTurnsRemaining < 0) {
      finishRound(room);
    }
  }
}

function ensureDeck(room) {
  if (room.deck.length > 0) return;
  if (room.discard.length <= 1) return;
  const top = room.discard.pop();
  room.deck = shuffle(room.discard.map((card) => ({ ...card, knownTo: [] })));
  room.discard = [top];
  room.log.unshift("The discard pile was shuffled back into the deck.");
}

function cardLabel(card) {
  return `${card.rank}${suitSymbol(card.suit)}`;
}

function suitSymbol(suit) {
  return {
    clubs: "♣",
    diamonds: "♦",
    hearts: "♥",
    spades: "♠"
  }[suit];
}

function isPowerCard(card) {
  if (!card) return null;
  if (card.rank === "7" || card.rank === "8") return "ownPeek";
  if (card.rank === "9" || card.rank === "10") return "otherPeek";
  if (card.rank === "J" || card.rank === "Q") return "swap";
  return null;
}

function startRound(room) {
  const players = activePlayers(room);
  if (players.length < 2 || players.length > 6) {
    throw new Error("Cabo needs 2 to 6 players.");
  }

  room.status = "playing";
  room.deck = makeDeck();
  room.discard = [];
  room.turnIndex = 0;
  room.turnPhase = "draw";
  room.drawnCard = null;
  room.pendingPower = null;
  room.caboCalledBy = null;
  room.finalTurnsRemaining = null;
  room.winnerIds = [];
  room.log = ["Round started. Everyone knows their two left cards."];

  for (const player of players) {
    player.hand = [];
    player.score = null;
    for (let index = 0; index < 4; index += 1) {
      const card = room.deck.pop();
      if (index < 2) card.knownTo = [player.id];
      player.hand.push(card);
    }
  }

  room.discard.push(room.deck.pop());
}

function finishRound(room) {
  room.status = "ended";
  room.turnPhase = "ended";
  room.drawnCard = null;
  room.pendingPower = null;

  let lowScore = Infinity;
  for (const player of activePlayers(room)) {
    player.score = player.hand.reduce((sum, card) => sum + card.value, 0);
    lowScore = Math.min(lowScore, player.score);
  }

  room.winnerIds = activePlayers(room)
    .filter((player) => player.score === lowScore)
    .map((player) => player.id);

  const winners = room.winnerIds.map((id) => getPlayer(room, id)?.name).filter(Boolean).join(", ");
  room.log.unshift(`${winners} won the round with ${lowScore}.`);
}

function requireTurn(room, playerId) {
  if (room.status !== "playing") throw new Error("The round is not in progress.");
  const player = currentPlayer(room);
  if (!player || player.id !== playerId) throw new Error("It is not your turn.");
  return player;
}

function takeCardFromHand(player, index) {
  const card = player.hand[index];
  if (!card) throw new Error("That card is not available.");
  return card;
}

function serializeCard(card, visible) {
  if (!card) return null;
  if (!visible) return { id: card.id, hidden: true };
  return {
    id: card.id,
    rank: card.rank,
    suit: card.suit,
    value: card.value,
    label: cardLabel(card)
  };
}

function publicState(room, viewerId) {
  const viewer = getPlayer(room, viewerId);
  const ended = room.status === "ended";
  return {
    roomCode: room.code,
    status: room.status,
    hostId: room.hostId,
    you: viewerId,
    canStart: room.status !== "playing" && room.players.length >= 2 && room.hostId === viewerId,
    deckCount: room.deck.length,
    discardTop: serializeCard(room.discard.at(-1), true),
    drawnCard: viewer?.id === currentPlayer(room)?.id ? serializeCard(room.drawnCard, true) : null,
    currentPlayerId: currentPlayer(room)?.id || null,
    turnPhase: room.turnPhase,
    pendingPower: room.pendingPower && room.pendingPower.playerId === viewerId
      ? { type: room.pendingPower.type, label: POWER_LABELS[room.pendingPower.type], source: serializeCard(room.pendingPower.source, true) }
      : null,
    caboCalledBy: room.caboCalledBy,
    finalTurnsRemaining: room.finalTurnsRemaining,
    winnerIds: room.winnerIds,
    players: activePlayers(room).map((player) => ({
      id: player.id,
      name: player.name,
      connected: player.connected,
      score: ended ? player.score : null,
      cardCount: player.hand.length,
      isHost: player.id === room.hostId,
      hand: player.hand.map((card) => serializeCard(card, ended || player.id === viewerId || card.knownTo.includes(viewerId)))
    })),
    log: room.log.slice(0, 10)
  };
}

function emitRoom(room) {
  for (const player of room.players) {
    if (!player.socketId || player.left) continue;
    io.to(player.socketId).emit("state", publicState(room, player.id));
  }
}

function addLog(room, message) {
  room.log.unshift(message);
  room.log = room.log.slice(0, 18);
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name, token }, reply) => {
    try {
      const code = makeRoomCode();
      const player = {
        id: makeId("p_"),
        token: token || makeId("t_"),
        name: normalizeName(name),
        socketId: socket.id,
        connected: true,
        left: false,
        hand: [],
        score: null
      };
      const room = {
        code,
        status: "waiting",
        hostId: player.id,
        players: [player],
        deck: [],
        discard: [],
        drawnCard: null,
        pendingPower: null,
        turnIndex: 0,
        turnPhase: "draw",
        caboCalledBy: null,
        finalTurnsRemaining: null,
        winnerIds: [],
        log: [`${player.name} created the room.`]
      };
      rooms.set(code, room);
      socket.join(code);
      reply?.({ ok: true, roomCode: code, playerId: player.id, token: player.token });
      emitRoom(room);
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("joinRoom", ({ roomCode, name, token }, reply) => {
    try {
      const room = getRoomOrThrow(roomCode);
      let player = room.players.find((candidate) => candidate.token && candidate.token === token);
      if (!player) {
        if (room.status === "playing") throw new Error("That room is already playing.");
        if (activePlayers(room).length >= 6) throw new Error("That room is full.");
        player = {
          id: makeId("p_"),
          token: token || makeId("t_"),
          name: normalizeName(name),
          socketId: socket.id,
          connected: true,
          left: false,
          hand: [],
          score: null
        };
        room.players.push(player);
        addLog(room, `${player.name} joined.`);
      } else {
        player.name = normalizeName(name || player.name);
        player.connected = true;
        player.left = false;
        addLog(room, `${player.name} reconnected.`);
      }

      player.socketId = socket.id;
      socket.join(room.code);
      reply?.({ ok: true, roomCode: room.code, playerId: player.id, token: player.token });
      emitRoom(room);
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("startGame", ({ roomCode, playerId }, reply) => {
    try {
      const room = getRoomOrThrow(roomCode);
      if (room.hostId !== playerId) throw new Error("Only the host can start.");
      startRound(room);
      reply?.({ ok: true });
      emitRoom(room);
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("draw", ({ roomCode, playerId, source }, reply) => {
    try {
      const room = getRoomOrThrow(roomCode);
      const player = requireTurn(room, playerId);
      if (room.turnPhase !== "draw") throw new Error("You already drew a card.");
      if (source === "deck") {
        ensureDeck(room);
        const card = room.deck.pop();
        if (!card) throw new Error("The deck is empty.");
        card.knownTo = [player.id];
        room.drawnCard = card;
        room.turnPhase = "decide";
        addLog(room, `${player.name} drew from the deck.`);
      } else if (source === "discard") {
        if (!room.discard.length) throw new Error("The discard pile is empty.");
        const card = room.discard.pop();
        card.knownTo = [player.id];
        room.drawnCard = card;
        room.turnPhase = "replace";
        addLog(room, `${player.name} took ${cardLabel(card)} from discard.`);
      } else {
        throw new Error("Choose deck or discard.");
      }
      reply?.({ ok: true });
      emitRoom(room);
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("replace", ({ roomCode, playerId, handIndex }, reply) => {
    try {
      const room = getRoomOrThrow(roomCode);
      const player = requireTurn(room, playerId);
      if (!["decide", "replace"].includes(room.turnPhase) || !room.drawnCard) {
        throw new Error("There is no drawn card to place.");
      }
      const outgoing = takeCardFromHand(player, handIndex);
      player.hand[handIndex] = room.drawnCard;
      player.hand[handIndex].knownTo = Array.from(new Set([...(player.hand[handIndex].knownTo || []), player.id]));
      room.discard.push(outgoing);
      addLog(room, `${player.name} replaced a card and discarded ${cardLabel(outgoing)}.`);
      advanceTurn(room);
      reply?.({ ok: true });
      emitRoom(room);
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("discardDrawn", ({ roomCode, playerId }, reply) => {
    try {
      const room = getRoomOrThrow(roomCode);
      const player = requireTurn(room, playerId);
      if (room.turnPhase !== "decide" || !room.drawnCard) {
        throw new Error("You can only discard a card drawn from the deck.");
      }
      const card = room.drawnCard;
      room.discard.push(card);
      room.drawnCard = null;
      const power = isPowerCard(card);
      if (power) {
        room.pendingPower = { playerId, type: power, source: card };
        room.turnPhase = "power";
        addLog(room, `${player.name} discarded ${cardLabel(card)} for a power.`);
      } else {
        addLog(room, `${player.name} discarded ${cardLabel(card)}.`);
        advanceTurn(room);
      }
      reply?.({ ok: true });
      emitRoom(room);
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("usePower", ({ roomCode, playerId, ownIndex, targetPlayerId, targetIndex }, reply) => {
    try {
      const room = getRoomOrThrow(roomCode);
      const player = requireTurn(room, playerId);
      if (!room.pendingPower || room.pendingPower.playerId !== playerId) throw new Error("No power is waiting.");

      if (room.pendingPower.type === "ownPeek") {
        const card = takeCardFromHand(player, ownIndex);
        card.knownTo = Array.from(new Set([...card.knownTo, player.id]));
        addLog(room, `${player.name} peeked at one of their cards.`);
      }

      if (room.pendingPower.type === "otherPeek") {
        const target = getPlayer(room, targetPlayerId);
        if (!target || target.id === playerId) throw new Error("Choose an opponent.");
        const card = takeCardFromHand(target, targetIndex);
        card.knownTo = Array.from(new Set([...card.knownTo, player.id]));
        addLog(room, `${player.name} peeked at ${target.name}'s card.`);
      }

      if (room.pendingPower.type === "swap") {
        const target = getPlayer(room, targetPlayerId);
        if (!target || target.id === playerId) throw new Error("Choose an opponent.");
        const ownCard = takeCardFromHand(player, ownIndex);
        const targetCard = takeCardFromHand(target, targetIndex);
        player.hand[ownIndex] = targetCard;
        target.hand[targetIndex] = ownCard;
        addLog(room, `${player.name} swapped with ${target.name}.`);
      }

      advanceTurn(room);
      reply?.({ ok: true });
      emitRoom(room);
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("skipPower", ({ roomCode, playerId }, reply) => {
    try {
      const room = getRoomOrThrow(roomCode);
      const player = requireTurn(room, playerId);
      if (!room.pendingPower || room.pendingPower.playerId !== playerId) throw new Error("No power is waiting.");
      addLog(room, `${player.name} skipped the power.`);
      advanceTurn(room);
      reply?.({ ok: true });
      emitRoom(room);
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("callCabo", ({ roomCode, playerId }, reply) => {
    try {
      const room = getRoomOrThrow(roomCode);
      const player = requireTurn(room, playerId);
      if (room.turnPhase !== "draw") throw new Error("Call Cabo before drawing.");
      if (room.caboCalledBy) throw new Error("Cabo has already been called.");
      room.caboCalledBy = playerId;
      room.finalTurnsRemaining = activePlayers(room).length - 1;
      addLog(room, `${player.name} called Cabo. Everyone else gets one turn.`);
      advanceTurn(room);
      reply?.({ ok: true });
      emitRoom(room);
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("leaveRoom", ({ roomCode, playerId }, reply) => {
    try {
      const room = getRoomOrThrow(roomCode);
      const player = getPlayer(room, playerId);
      if (player) {
        player.left = true;
        player.connected = false;
        addLog(room, `${player.name} left.`);
        if (room.hostId === playerId) {
          const nextHost = activePlayers(room)[0];
          room.hostId = nextHost?.id || null;
        }
      }
      if (!activePlayers(room).length) rooms.delete(room.code);
      else emitRoom(room);
      reply?.({ ok: true });
    } catch (error) {
      reply?.({ ok: false, error: error.message });
    }
  });

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      const player = room.players.find((candidate) => candidate.socketId === socket.id);
      if (!player) continue;
      player.connected = false;
      player.socketId = null;
      addLog(room, `${player.name} disconnected.`);
      emitRoom(room);
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Cabo is running at http://localhost:${PORT}`);
});
