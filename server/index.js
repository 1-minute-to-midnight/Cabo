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
const BOT_NAMES = ["Ada", "Babbage", "Cardsharp", "Noor", "Vega"];
const BOT_TURN_DELAY_MS = 850;

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

function scheduleBotTurn(room) {
  if (room.botTimer || room.status !== "playing") return;
  const player = currentPlayer(room);
  if (!player?.isBot) return;

  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    playBotTurn(room.code);
  }, BOT_TURN_DELAY_MS);
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
    canAddBot: room.status !== "playing" && room.hostId === viewerId && activePlayers(room).length < 6,
    canStart: room.status !== "playing" && activePlayers(room).length >= 2 && room.hostId === viewerId,
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
      isBot: Boolean(player.isBot),
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
  scheduleBotTurn(room);
}

function addLog(room, message) {
  room.log.unshift(message);
  room.log = room.log.slice(0, 18);
}

function makeBot(room) {
  const usedNames = new Set(room.players.map((player) => player.name));
  const baseName = BOT_NAMES.find((name) => !usedNames.has(name)) || `Bot ${activePlayers(room).length}`;
  return {
    id: makeId("b_"),
    token: makeId("bt_"),
    name: baseName,
    socketId: null,
    connected: true,
    left: false,
    isBot: true,
    hand: [],
    score: null
  };
}

function knownCardsFor(room, bot) {
  const known = [];
  for (const player of activePlayers(room)) {
    for (const card of player.hand) {
      if (card.knownTo.includes(bot.id)) known.push(card);
    }
  }
  known.push(...room.discard);
  if (room.drawnCard?.knownTo.includes(bot.id)) known.push(room.drawnCard);
  return known;
}

function unknownAverageFor(room, bot) {
  const knownIds = new Set(knownCardsFor(room, bot).map((card) => card.id));
  const hiddenCards = [];
  for (const player of activePlayers(room)) {
    for (const card of player.hand) {
      if (!knownIds.has(card.id)) hiddenCards.push(card);
    }
  }
  hiddenCards.push(...room.deck.filter((card) => !knownIds.has(card.id)));
  if (!hiddenCards.length) return 6.5;
  return hiddenCards.reduce((sum, card) => sum + card.value, 0) / hiddenCards.length;
}

function estimatedCardValue(room, bot, card) {
  if (card.knownTo.includes(bot.id)) return card.value;
  return unknownAverageFor(room, bot);
}

function ownCardEstimates(room, bot) {
  return bot.hand.map((card, index) => ({
    index,
    card,
    known: card.knownTo.includes(bot.id),
    value: estimatedCardValue(room, bot, card)
  }));
}

function worstOwnCard(room, bot) {
  return ownCardEstimates(room, bot)
    .sort((a, b) => b.value - a.value || Number(a.known) - Number(b.known))[0];
}

function bestKnownOpponentCard(room, bot) {
  const candidates = [];
  for (const player of activePlayers(room)) {
    if (player.id === bot.id) continue;
    player.hand.forEach((card, index) => {
      if (card.knownTo.includes(bot.id)) {
        candidates.push({ player, index, card, value: card.value });
      }
    });
  }
  return candidates.sort((a, b) => a.value - b.value)[0] || null;
}

function unknownOwnIndex(bot) {
  const unknown = bot.hand
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => !card.knownTo.includes(bot.id));
  if (!unknown.length) return null;
  return unknown[crypto.randomInt(unknown.length)].index;
}

function opponentForPeek(room, bot) {
  const opponents = activePlayers(room).filter((player) => player.id !== bot.id);
  return opponents
    .map((player) => ({
      player,
      unknownIndexes: player.hand
        .map((card, index) => ({ card, index }))
        .filter(({ card }) => !card.knownTo.includes(bot.id))
        .map(({ index }) => index)
    }))
    .filter((entry) => entry.unknownIndexes.length)
    .sort((a, b) => a.unknownIndexes.length - b.unknownIndexes.length)[0] || null;
}

function shouldCallCabo(room, bot) {
  if (room.caboCalledBy || room.turnPhase !== "draw") return false;
  const estimates = ownCardEstimates(room, bot);
  const knownCount = estimates.filter((card) => card.known).length;
  const estimate = estimates.reduce((sum, card) => sum + card.value, 0);
  const players = activePlayers(room).length;
  const threshold = players <= 2 ? 10 : 9;
  return knownCount >= 3 && estimate <= threshold || knownCount === 4 && estimate <= threshold + 2;
}

function replaceWithDrawn(room, bot, handIndex, logPrefix = "") {
  const outgoing = takeCardFromHand(bot, handIndex);
  bot.hand[handIndex] = room.drawnCard;
  bot.hand[handIndex].knownTo = Array.from(new Set([...(bot.hand[handIndex].knownTo || []), bot.id]));
  room.discard.push(outgoing);
  addLog(room, `${bot.name} ${logPrefix}replaced a card and discarded ${cardLabel(outgoing)}.`);
  advanceTurn(room);
}

function discardDrawnForBot(room, bot) {
  const card = room.drawnCard;
  room.discard.push(card);
  room.drawnCard = null;
  const power = isPowerCard(card);
  if (power) {
    room.pendingPower = { playerId: bot.id, type: power, source: card };
    room.turnPhase = "power";
    addLog(room, `${bot.name} discarded ${cardLabel(card)} for a power.`);
    useBotPower(room, bot);
  } else {
    addLog(room, `${bot.name} discarded ${cardLabel(card)}.`);
    advanceTurn(room);
  }
}

function useBotPower(room, bot) {
  if (!room.pendingPower || room.pendingPower.playerId !== bot.id) return;

  if (room.pendingPower.type === "ownPeek") {
    const index = unknownOwnIndex(bot);
    if (index === null) {
      addLog(room, `${bot.name} skipped the power.`);
      advanceTurn(room);
      return;
    }
    const card = takeCardFromHand(bot, index);
    card.knownTo = Array.from(new Set([...card.knownTo, bot.id]));
    addLog(room, `${bot.name} peeked at one of their cards.`);
    advanceTurn(room);
    return;
  }

  if (room.pendingPower.type === "otherPeek") {
    const target = opponentForPeek(room, bot);
    if (!target) {
      addLog(room, `${bot.name} skipped the power.`);
      advanceTurn(room);
      return;
    }
    const index = target.unknownIndexes[crypto.randomInt(target.unknownIndexes.length)];
    const card = takeCardFromHand(target.player, index);
    card.knownTo = Array.from(new Set([...card.knownTo, bot.id]));
    addLog(room, `${bot.name} peeked at ${target.player.name}'s card.`);
    advanceTurn(room);
    return;
  }

  if (room.pendingPower.type === "swap") {
    const ownWorst = worstOwnCard(room, bot);
    const opponentBest = bestKnownOpponentCard(room, bot);
    if (!opponentBest || !ownWorst || ownWorst.value <= opponentBest.value + 1.5) {
      addLog(room, `${bot.name} skipped the swap.`);
      advanceTurn(room);
      return;
    }
    const ownCard = takeCardFromHand(bot, ownWorst.index);
    const targetCard = takeCardFromHand(opponentBest.player, opponentBest.index);
    bot.hand[ownWorst.index] = targetCard;
    opponentBest.player.hand[opponentBest.index] = ownCard;
    addLog(room, `${bot.name} swapped with ${opponentBest.player.name}.`);
    advanceTurn(room);
  }
}

function playBotTurn(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== "playing") return;
  const bot = currentPlayer(room);
  if (!bot?.isBot) return;

  try {
    if (shouldCallCabo(room, bot)) {
      room.caboCalledBy = bot.id;
      room.finalTurnsRemaining = activePlayers(room).length - 1;
      addLog(room, `${bot.name} called Cabo. Everyone else gets one turn.`);
      advanceTurn(room);
      emitRoom(room);
      return;
    }

    if (room.turnPhase === "draw") {
      const discard = room.discard.at(-1);
      const worst = worstOwnCard(room, bot);
      if (discard && worst && discard.value < worst.value - 0.35) {
        room.drawnCard = room.discard.pop();
        room.drawnCard.knownTo = Array.from(new Set([...room.drawnCard.knownTo, bot.id]));
        room.turnPhase = "replace";
        addLog(room, `${bot.name} took ${cardLabel(room.drawnCard)} from discard.`);
        replaceWithDrawn(room, bot, worst.index);
      } else {
        ensureDeck(room);
        const card = room.deck.pop();
        if (!card) {
          finishRound(room);
        } else {
          card.knownTo = [bot.id];
          room.drawnCard = card;
          room.turnPhase = "decide";
          addLog(room, `${bot.name} drew from the deck.`);
        }
      }
    }

    if (room.turnPhase === "decide" && room.drawnCard) {
      const worst = worstOwnCard(room, bot);
      const improvement = worst ? worst.value - room.drawnCard.value : 0;
      if (worst && improvement > 0.75 || room.drawnCard.value <= 3) {
        replaceWithDrawn(room, bot, worst.index);
      } else {
        discardDrawnForBot(room, bot);
      }
    }

    emitRoom(room);
  } catch (error) {
    addLog(room, `${bot.name} hesitated: ${error.message}`);
    advanceTurn(room);
    emitRoom(room);
  }
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

  socket.on("addBot", ({ roomCode, playerId }, reply) => {
    try {
      const room = getRoomOrThrow(roomCode);
      if (room.hostId !== playerId) throw new Error("Only the host can add AI players.");
      if (room.status === "playing") throw new Error("Add AI players between rounds.");
      if (activePlayers(room).length >= 6) throw new Error("That room is full.");
      const bot = makeBot(room);
      room.players.push(bot);
      addLog(room, `${bot.name} joined as AI.`);
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
