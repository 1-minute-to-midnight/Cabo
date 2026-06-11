const socket = io();

const els = {
  roomTitle: document.querySelector("#roomTitle"),
  joinPanel: document.querySelector("#joinPanel"),
  roomPanel: document.querySelector("#roomPanel"),
  nameInput: document.querySelector("#nameInput"),
  roomInput: document.querySelector("#roomInput"),
  createBtn: document.querySelector("#createBtn"),
  joinBtn: document.querySelector("#joinBtn"),
  copyBtn: document.querySelector("#copyBtn"),
  addBotBtn: document.querySelector("#addBotBtn"),
  startBtn: document.querySelector("#startBtn"),
  leaveBtn: document.querySelector("#leaveBtn"),
  notice: document.querySelector("#notice"),
  peekTimerContainer: document.querySelector("#peekTimerContainer"),
  deckBtn: document.querySelector("#deckBtn"),
  discardBtn: document.querySelector("#discardBtn"),
  deckCount: document.querySelector("#deckCount"),
  discardTop: document.querySelector("#discardTop"),
  drawnCard: document.querySelector("#drawnCard"),
  discardDrawnBtn: document.querySelector("#discardDrawnBtn"),
  swapPowerBtn: document.querySelector("#swapPowerBtn"),
  caboBtn: document.querySelector("#caboBtn"),
  skipPowerBtn: document.querySelector("#skipPowerBtn"),
  endTurnBtn: document.querySelector("#endTurnBtn"),
  players: document.querySelector("#players"),
  statusText: document.querySelector("#statusText"),
  logList: document.querySelector("#logList"),
  
  // Scoreboard modal elements
  endRoundModal: document.querySelector("#endRoundModal"),
  modalTitle: document.querySelector("#modalTitle"),
  scoreboardBody: document.querySelector("#scoreboardBody"),
  modalActionBtn: document.querySelector("#modalActionBtn"),
  modalCloseBtn: document.querySelector("#modalCloseBtn")
};

const identity = {
  name: localStorage.getItem("cabo:name") || "",
  token: localStorage.getItem("cabo:token") || crypto.randomUUID(),
  roomCode: localStorage.getItem("cabo:roomCode") || "",
  playerId: localStorage.getItem("cabo:playerId") || ""
};

let state = null;
let selected = {
  ownIndex: null,
  targetPlayerId: null,
  targetIndex: null
};
let initialPeekSelection = [];
let tempReveals = new Map();
let peekTimer = null;
let animationUntil = 0;
let pendingState = null;
let pendingRenderTimer = null;
let countdownTimer = null;
let lastStatus = null;
let lastCaboCalledBy = null;

els.nameInput.value = identity.name;
els.roomInput.value = identity.roomCode;
localStorage.setItem("cabo:token", identity.token);

function setNotice(message) {
  els.notice.textContent = message || "";
  if (!message) return;
  window.clearTimeout(setNotice.timer);
  setNotice.timer = window.setTimeout(() => {
    if (els.notice.textContent === message) els.notice.textContent = "";
  }, 4200);
}

function saveIdentity(payload = {}) {
  Object.assign(identity, payload);
  for (const [key, value] of Object.entries(identity)) {
    if (value) localStorage.setItem(`cabo:${key}`, value);
  }
}

function request(event, payload) {
  return new Promise((resolve) => {
    socket.emit(event, payload, (reply) => {
      if (!reply?.ok) {
        setNotice(reply?.error || "Something went wrong.");
        resolve(null);
        return;
      }
      resolve(reply);
    });
  });
}

async function createRoom() {
  const name = els.nameInput.value;
  const reply = await request("createRoom", { name, token: identity.token });
  if (!reply) return;
  saveIdentity({ name: name || "Player", roomCode: reply.roomCode, playerId: reply.playerId, token: reply.token });
  els.roomInput.value = reply.roomCode;
}

async function joinRoom() {
  const name = els.nameInput.value;
  const roomCode = els.roomInput.value.trim().toUpperCase();
  if (!roomCode) {
    setNotice("Enter a room code.");
    return;
  }
  const reply = await request("joinRoom", { roomCode, name, token: identity.token });
  if (!reply) return;
  saveIdentity({ name: name || "Player", roomCode: reply.roomCode, playerId: reply.playerId, token: reply.token });
}

function canAct() {
  return state?.status === "playing" && state.currentPlayerId === state.you;
}

function cardHtml(card, classes = "", draggable = false) {
  if (!card) return "";
  if (card.hidden) {
    return `<div class="card hidden-card ${classes}" data-card-id="${card.id}" ${draggable ? 'draggable="true"' : ""}></div>`;
  }
  const red = card.suit === "hearts" || card.suit === "diamonds";
  const suitSym = suitSymbol(card.suit);
  return `
    <div class="card ${red ? "red-card" : "black-card"} rank-${card.rank.toLowerCase()} ${classes}" data-card-id="${card.id}" ${draggable ? 'draggable="true"' : ""}>
      <div class="card-corner top-left">
        <span class="corner-rank">${card.rank}</span>
        <span class="corner-suit">${suitSym}</span>
      </div>
      <div class="card-center">
        ${cardCenterHtml(card)}
      </div>
      <div class="card-corner bottom-right">
        <span class="corner-rank">${card.rank}</span>
        <span class="corner-suit">${suitSym}</span>
      </div>
    </div>
  `;
}

function cardCenterHtml(card) {
  const isRed = card.suit === "hearts" || card.suit === "diamonds";
  const colorClass = isRed ? "red-suit" : "black-suit";
  const suitSym = suitSymbol(card.suit);
  
  if (card.rank === "J") {
    return faceCardHtml("jack");
  }
  if (card.rank === "Q") {
    return faceCardHtml("queen");
  }
  if (card.rank === "K") {
    return faceCardHtml("king");
  }

  if (card.rank === "A") {
    return `<span class="center-suit ${colorClass} large-ace">${suitSym}</span>`;
  }

  const count = Number(card.rank);
  const layouts = {
    2: ["mid-top", "mid-bottom"],
    3: ["mid-top", "center", "mid-bottom"],
    4: ["top-left-pip", "top-right-pip", "bottom-left-pip", "bottom-right-pip"],
    5: ["top-left-pip", "top-right-pip", "center", "bottom-left-pip", "bottom-right-pip"],
    6: ["top-left-pip", "top-right-pip", "center-left", "center-right", "bottom-left-pip", "bottom-right-pip"],
    7: ["top-left-pip", "top-right-pip", "center-left", "center", "center-right", "bottom-left-pip", "bottom-right-pip"],
    8: ["top-left-pip", "top-right-pip", "upper-left", "upper-right", "lower-left", "lower-right", "bottom-left-pip", "bottom-right-pip"],
    9: ["top-left-pip", "top-right-pip", "upper-left", "upper-right", "center", "lower-left", "lower-right", "bottom-left-pip", "bottom-right-pip"],
    10: ["top-left-pip", "top-right-pip", "upper-left", "upper-right", "mid-left", "mid-right", "lower-left", "lower-right", "bottom-left-pip", "bottom-right-pip"]
  };
  const pips = (layouts[count] || ["center"])
    .map((pos) => `<span class="pip ${colorClass} ${pos}">${suitSym}</span>`)
    .join("");
  return `<div class="pip-grid pip-grid-${count}">${pips}</div>`;
}

function faceCardHtml(face) {
  return `
    <div class="court-card ${face}-art">
      <span class="court-half court-top">
        <img src="/assets/cards/${face}.png" alt="" draggable="false">
      </span>
      <span class="court-divider"></span>
      <span class="court-half court-bottom">
        <img src="/assets/cards/${face}.png" alt="" draggable="false">
      </span>
    </div>
  `;
}

function suitSymbol(suit) {
  return {
    clubs: "♣",
    diamonds: "♦",
    hearts: "♥",
    spades: "♠"
  }[suit] || "";
}

function render() {
  if (!state) return;
  const me = state.players.find((player) => player.id === state.you);
  const current = state.players.find((player) => player.id === state.currentPlayerId);
  const caboCaller = state.players.find((player) => player.id === state.caboCalledBy);

  els.joinPanel.classList.add("hidden");
  els.roomPanel.classList.remove("hidden");
  els.roomTitle.textContent = `Room ${state.roomCode}`;
  els.deckCount.textContent = String(state.deckCount);
  if (state.discardTop) {
    els.discardBtn.innerHTML = cardHtml(state.discardTop, "discard-face");
    els.discardBtn.className = "discard-button";
  } else {
    els.discardBtn.innerHTML = `<div class="card discard-face empty-discard"><span>Discard</span></div>`;
    els.discardBtn.className = "discard-button";
  }
  els.drawnCard.innerHTML = "";

  els.addBotBtn.disabled = !state.canAddBot;
  els.startBtn.disabled = !state.canStart;
  els.deckBtn.disabled = !canAct() || state.turnPhase !== "draw";
  els.deckBtn.setAttribute("draggable", canAct() && state.turnPhase === "draw");
  els.discardBtn.disabled = state.status !== "playing";
  els.discardBtn.setAttribute("draggable", canAct() && state.turnPhase === "draw" && Boolean(state.discardTop));
  els.discardDrawnBtn.disabled = !canAct() || state.turnPhase !== "decide";
  els.swapPowerBtn.disabled = !canAct() || state.pendingPower?.type !== "optionalLookSwap" || state.pendingPower?.stage !== "chooseSwap";
  els.caboBtn.disabled = !canAct() || (state.turnPhase !== "draw" && state.turnPhase !== "turnEnd") || Boolean(state.caboCalledBy);
  els.skipPowerBtn.disabled = !canAct() || state.turnPhase !== "power"
    || (state.pendingPower?.type === "forcedLookSwap" && state.pendingPower?.stage === "chooseOwn");

  if (canAct()) {
    els.endTurnBtn.classList.remove("hidden");
    els.endTurnBtn.disabled = state.turnPhase !== "turnEnd";
  } else {
    els.endTurnBtn.classList.add("hidden");
    els.endTurnBtn.disabled = true;
  }

  // Helper to determine if a card has a power on the client
  const getPowerLabel = (card) => {
    if (!card) return null;
    if (card.rank === "7" || card.rank === "8") return "Peek Own";
    if (card.rank === "9" || card.rank === "10") return "Peek Other";
    if (card.rank === "J") return "Blind Swap";
    if (card.rank === "Q") return "Forced Swap";
    if (card.rank === "K" && (card.suit === "clubs" || card.suit === "spades")) return "Look & Swap";
    return null;
  };

  // Enhance discard button text if the drawn card has a power
  if (state.drawnCard && canAct() && state.turnPhase === "decide") {
    const powerLabel = getPowerLabel(state.drawnCard);
    if (powerLabel) {
      els.discardDrawnBtn.textContent = `Discard for Power (${powerLabel})`;
    } else {
      els.discardDrawnBtn.textContent = "Discard Card";
    }
  } else {
    els.discardDrawnBtn.textContent = "Discard";
  }

  const phase = state.status === "waiting"
    ? "Waiting for players."
    : state.status === "peeking"
      ? state.initialPeekNeeded
        ? `Choose ${2 - initialPeekSelection.length} starting card${2 - initialPeekSelection.length === 1 ? "" : "s"} to peek at.`
        : "Waiting for everyone to finish their starting peeks."
    : state.status === "ended"
      ? winnerText()
      : state.pendingPower
        ? powerText(state.pendingPower)
        : `${current?.name || "Someone"} ${current?.id === state.you ? "is up" : "is taking a turn"}.`;
  const cabo = caboCaller ? ` Cabo was called by ${caboCaller.name}.` : "";
  const timerText = peekTimer ? ` Memorize: ${peekTimer.remaining.toFixed(1)}s.` : "";
  els.statusText.textContent = `${phase}${cabo}${timerText}`;

  els.players.innerHTML = state.players.map((player, playerIndex) => {
    const isCurrent = player.id === state.currentPlayerId;
    const isWinner = state.winnerIds.includes(player.id);
    const isCaboCaller = state.caboCalledBy === player.id;
    const caboClass = isCaboCaller ? "cabo-called" : "";

    const hand = player.hand.map((card, index) => {
      const selectable = selectableCard(player, index);
      const reveal = tempReveals.get(revealKey(player.id, index));
      const displayCard = reveal || card;
      const selectedClass = selected.ownIndex === index && player.id === state.you
        || selected.targetPlayerId === player.id && selected.targetIndex === index
        || state.pendingPower?.ownIndex === index && player.id === state.you
        || state.pendingPower?.targetPlayerId === player.id && state.pendingPower?.targetIndex === index
        || initialPeekSelection.includes(index) && player.id === state.you
        ? "selected"
        : "";
      
      const isDraggable = state.status === "playing";
      const isDisabled = !selectable && !isDraggable;

      return `
        <button class="card-button" type="button" 
          data-player-id="${player.id}" 
          data-index="${index}" 
          ${isDisabled ? "disabled" : ""}
          ${isDraggable ? 'draggable="true"' : ""}>
          ${cardHtml(displayCard, `${selectable ? "selectable" : ""} ${selectedClass}`)}
        </button>
      `;
    }).join("");

    const score = player.score === null ? "" : `<span class="badge score-badge">Score: ${player.score}</span>`;
    const botBadge = player.isBot ? '<span class="badge ai-badge">AI</span>' : "";
    const pointsBadge = player.tournamentPoints !== undefined
      ? `<span class="badge points-badge" style="background: rgba(214, 166, 77, 0.12); color: var(--gold); border: 1px solid rgba(214, 166, 77, 0.25);">TP: ${player.tournamentPoints}</span>`
      : "";
    
    let actionText = "";
    if (isCurrent && state.status === "playing") {
      if (player.isBot) {
        actionText = ` <span class="status-indicator thinking">Thinking...</span>`;
      } else {
        actionText = ` <span class="status-indicator active">Active</span>`;
      }
    } else if (isCaboCaller) {
      actionText = ` <span class="status-indicator cabo-caller">Cabo!</span>`;
    }

    const drawn = (player.id === state.you || (isCurrent && state.status === "playing"))
      ? `<div class="drawn-slot">${state.drawnCard && isCurrent ? cardHtml(state.drawnCard, "drawn-in-hand", player.id === state.you) : '<div class="card-placeholder"></div>'}</div>`
      : "";
    return `
      <article class="player seat-${playerIndex} ${isCurrent ? "current" : ""} ${isWinner ? "winner" : ""} ${caboClass}" data-player-id="${player.id}">
        <div class="player-head">
          <strong>${escapeHtml(player.name)}${player.id === state.you ? " (you)" : ""}${actionText}</strong>
          <span class="badges">${player.isHost ? '<span class="badge">Host</span>' : ""}${botBadge}${pointsBadge}${score}</span>
        </div>
        <div class="hand">${hand}</div>
        ${drawn}
      </article>
    `;
  }).join("");

  els.players.querySelectorAll(".card-button").forEach((button) => {
    button.addEventListener("click", () => selectCard(button.dataset.playerId, Number(button.dataset.index)));

    button.addEventListener("dragstart", (e) => {
      if (state.status !== "playing") {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData("text/plain", JSON.stringify({
        type: "hand-card",
        playerId: button.dataset.playerId,
        index: Number(button.dataset.index),
        cardId: button.querySelector(".card")?.dataset.cardId || null
      }));
      button.classList.add("dragging");
    });

    button.addEventListener("dragend", () => {
      button.classList.remove("dragging");
    });
  });

  // Setup dynamic drag & drop on player cards (own cards are drop targets)
  els.players.querySelectorAll(`.card-button[data-player-id="${state.you}"]`).forEach((button) => {
    button.addEventListener("dragover", (e) => {
      if (!canAct()) return;
      if (state.turnPhase !== "replace" && state.turnPhase !== "decide" && state.turnPhase !== "draw") return;
      e.preventDefault();
      button.classList.add("drag-over");
    });
    button.addEventListener("dragleave", () => {
      button.classList.remove("drag-over");
    });
    button.addEventListener("drop", async (e) => {
      button.classList.remove("drag-over");
      if (!canAct()) return;
      const source = e.dataTransfer.getData("text/plain");
      const index = Number(button.dataset.index);
      if (source === "drawn") {
        await request("replace", { roomCode: state.roomCode, playerId: state.you, handIndex: index });
      } else if (source === "discard") {
        await request("draw", { roomCode: state.roomCode, playerId: state.you, source: "discard" });
        await request("replace", { roomCode: state.roomCode, playerId: state.you, handIndex: index });
      } else if (source === "deck") {
        await request("draw", { roomCode: state.roomCode, playerId: state.you, source: "deck" });
        await request("replace", { roomCode: state.roomCode, playerId: state.you, handIndex: index });
      }
    });
  });

  // Setup dynamic dragstart on drawn card
  const drawnCardEl = els.players.querySelector(".drawn-in-hand");
  if (drawnCardEl) {
    drawnCardEl.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", "drawn");
      drawnCardEl.classList.add("dragging");
    });
    drawnCardEl.addEventListener("dragend", () => {
      drawnCardEl.classList.remove("dragging");
    });
  }

  els.logList.innerHTML = state.log.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("");

  // Open scoreboard modal if round ended
  if (state.status === "ended") {
    if (els.endRoundModal.classList.contains("hidden") && lastStatus !== "ended") {
      openScoreboardModal();
    }
  } else {
    els.endRoundModal.classList.add("hidden");
  }
  // Global peek timer rendering
  if (peekTimer) {
    let timerEl = els.peekTimerContainer.querySelector(".peek-timer");
    if (!timerEl) {
      els.peekTimerContainer.innerHTML = `
        <div class="peek-timer" aria-live="polite">
          <span>Memorize</span>
          <strong>0.0</strong>
          <div class="peek-timer-track"><i style="transform: scaleX(1)"></i></div>
        </div>
      `;
      timerEl = els.peekTimerContainer.querySelector(".peek-timer");
    }

    const isLow = peekTimer.remaining <= 1.5;
    timerEl.classList.toggle("warning", isLow);

    const strongEl = timerEl.querySelector("strong");
    if (strongEl) {
      strongEl.textContent = peekTimer.remaining.toFixed(1);
    }

    const trackInner = timerEl.querySelector(".peek-timer-track i");
    if (trackInner) {
      trackInner.style.transform = `scaleX(${peekTimer.progress})`;
    }
  } else {
    els.peekTimerContainer.innerHTML = "";
  }

  lastStatus = state.status;
}

function winnerText() {
  const winners = state.players.filter((player) => state.winnerIds.includes(player.id));
  if (!winners.length) return "Round ended.";
  return `${winners.map((player) => player.name).join(", ")} won.`;
}

function powerText(power) {
  if (power.type === "blindSwap") {
    return selected.ownIndex === null ? "J: pick one of your cards." : "J: pick an opponent card to blind swap.";
  }
  if (power.type === "forcedLookSwap") {
    return power.stage === "chooseOwn" ? "Q: pick one of your cards. You must swap." : "Q: pick an opponent card to look at.";
  }
  if (power.type === "optionalLookSwap") {
    if (power.stage === "chooseTarget") return "Black K: pick an opponent card to look at.";
    if (power.stage === "chooseSwap") return "Black K: choose Swap or Skip.";
    return "Black K: pick one of your cards to look at.";
  }
  return power.label;
}

function selectableCard(player, index) {
  if (state.initialPeekNeeded) return player.id === state.you;
  if (!canAct()) return false;
  if (state.turnPhase === "replace" || state.turnPhase === "decide") return player.id === state.you;
  if (!state.pendingPower) return false;
  if (state.pendingPower.type === "ownPeek") return player.id === state.you;
  if (state.pendingPower.type === "otherPeek") return player.id !== state.you;
  if (state.pendingPower.type === "blindSwap") {
    if (selected.ownIndex === null) return player.id === state.you;
    return player.id !== state.you;
  }
  if (state.pendingPower.type === "forcedLookSwap") {
    if (state.pendingPower.stage === "chooseOwn") return player.id === state.you;
    return player.id !== state.you;
  }
  if (state.pendingPower.type === "optionalLookSwap") {
    if (state.pendingPower.stage === "chooseTarget") return player.id !== state.you;
    if (state.pendingPower.stage === "chooseSwap") return false;
    return player.id === state.you;
  }
  return false;
}

async function selectCard(playerId, index) {
  if (!state) return;

  const player = state.players.find((p) => p.id === playerId);
  if (!player) return;

  if (!selectableCard(player, index)) {
    if (state.pendingPower?.type === "blindSwap" && selected.ownIndex === null && playerId !== state.you) {
      setNotice("Pick one of your cards first.");
      render();
    }
    return;
  }

  if (state.initialPeekNeeded && playerId === state.you) {
    if (initialPeekSelection.includes(index)) {
      initialPeekSelection = initialPeekSelection.filter((item) => item !== index);
    } else if (initialPeekSelection.length < 2) {
      initialPeekSelection.push(index);
    }
    render();
    if (initialPeekSelection.length === 2) {
      await request("initialPeek", { roomCode: state.roomCode, playerId: state.you, indexes: initialPeekSelection });
      initialPeekSelection = [];
    }
    return;
  }

  if (!canAct()) return;

  if (state.turnPhase === "replace" || state.turnPhase === "decide") {
    await request("replace", { roomCode: state.roomCode, playerId: state.you, handIndex: index });
    return;
  }

  if (!state.pendingPower) return;

  if (state.pendingPower.type === "ownPeek") {
    await request("usePower", { roomCode: state.roomCode, playerId: state.you, ownIndex: index });
    return;
  }

  if (state.pendingPower.type === "otherPeek") {
    await request("usePower", { roomCode: state.roomCode, playerId: state.you, targetPlayerId: playerId, targetIndex: index });
    return;
  }

  if (state.pendingPower.type === "blindSwap") {
    if (playerId === state.you) {
      selected.ownIndex = index;
      render();
      return;
    }
    selected.targetPlayerId = playerId;
    selected.targetIndex = index;
    if (selected.ownIndex === null) {
      setNotice("Pick one of your cards first.");
      render();
      return;
    }
    await request("usePower", {
      roomCode: state.roomCode,
      playerId: state.you,
      ownIndex: selected.ownIndex,
      targetPlayerId: selected.targetPlayerId,
      targetIndex: selected.targetIndex
    });
    selected = { ownIndex: null, targetPlayerId: null, targetIndex: null };
    return;
  }

  if (state.pendingPower.type === "forcedLookSwap") {
    if (state.pendingPower.stage === "chooseOwn") {
      await request("usePower", { roomCode: state.roomCode, playerId: state.you, ownIndex: index });
      return;
    }
    await request("usePower", { roomCode: state.roomCode, playerId: state.you, targetPlayerId: playerId, targetIndex: index });
    return;
  }

  if (state.pendingPower.type === "optionalLookSwap") {
    if (state.pendingPower.stage === "chooseTarget") {
      await request("usePower", { roomCode: state.roomCode, playerId: state.you, targetPlayerId: playerId, targetIndex: index });
      return;
    }
    await request("usePower", { roomCode: state.roomCode, playerId: state.you, ownIndex: index });
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function revealKey(ownerId, index) {
  return `${ownerId}:${index}`;
}

function openScoreboardModal() {
  if (!state) return;
  
  // 1. Determine title
  const winners = state.players.filter((p) => state.winnerIds.includes(p.id));
  if (winners.length > 0) {
    els.modalTitle.textContent = `${winners.map(w => w.name).join(", ")} won the round!`;
  } else if (state.caboCalledBy) {
    const caller = state.players.find((p) => p.id === state.caboCalledBy);
    els.modalTitle.textContent = `${caller ? caller.name : "Caller"} failed Cabo! Nobody wins!`;
  } else {
    els.modalTitle.textContent = "Round Ended";
  }

  // 2. Populate scoreboard body
  els.scoreboardBody.innerHTML = state.players.map((player) => {
    const isWinner = state.winnerIds.includes(player.id);
    const rowClass = isWinner ? 'class="winner-row"' : '';
    const crown = isWinner ? ' 👑' : '';
    
    const cardsHtml = player.hand.map((card) => {
      const red = card.suit === "hearts" || card.suit === "diamonds";
      return `
        <span class="badge ${red ? 'red-card' : ''}" style="background: var(--paper); color: var(--ink); border: 1px solid rgba(0,0,0,0.15)">
          ${card.rank}${suitSymbol(card.suit)}
        </span>
      `;
    }).join(" ");

    return `
      <tr ${rowClass}>
        <td><strong>${escapeHtml(player.name)}</strong>${crown}</td>
        <td>
          <span class="badge score-badge">Score: ${player.score}</span>
          <span class="badge points-badge" style="margin-left: 4px; background: rgba(214,166,77,0.12); color: var(--gold); border: 1px solid rgba(214,166,77,0.25);">TP: ${player.tournamentPoints ?? 0}</span>
        </td>
        <td>${cardsHtml}</td>
      </tr>
    `;
  }).join("");

  // 3. Configure action button
  const isHost = state.hostId === state.you;
  if (isHost) {
    els.modalActionBtn.textContent = "Start Next Round";
    els.modalActionBtn.disabled = false;
    els.modalActionBtn.classList.remove("hidden");
  } else {
    els.modalActionBtn.textContent = "Waiting for Host...";
    els.modalActionBtn.disabled = true;
    els.modalActionBtn.classList.remove("hidden");
  }

  // 4. Show modal
  els.endRoundModal.classList.remove("hidden");
}

function startPeekCountdown(duration) {
  const total = duration || 3600;
  const endsAt = Date.now() + total;
  window.clearInterval(countdownTimer);
  peekTimer = { remaining: total / 1000, progress: 1 };
  render();
  countdownTimer = window.setInterval(() => {
    const remainingMs = Math.max(0, endsAt - Date.now());
    peekTimer = {
      remaining: remainingMs / 1000,
      progress: total ? remainingMs / total : 0
    };
    render();
    if (remainingMs <= 0) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
      peekTimer = null;
      render();
    }
  }, 100);
}

function endpointElement(endpoint) {
  if (!endpoint) return null;
  if (endpoint.kind === "deck") return els.deckBtn;
  if (endpoint.kind === "discard") return els.discardBtn;
  if (endpoint.kind === "player") {
    const playerEl = document.querySelector(`.player[data-player-id="${endpoint.playerId}"]`);
    if (playerEl) {
      const drawnCard = playerEl.querySelector(".drawn-in-hand");
      if (drawnCard) return drawnCard;
      const drawnSlot = playerEl.querySelector(".drawn-slot");
      if (drawnSlot) return drawnSlot;
    }
    return playerEl;
  }
  if (endpoint.kind === "hand") {
    return document.querySelector(`.card-button[data-player-id="${endpoint.playerId}"][data-index="${endpoint.index}"] .card`);
  }
  return null;
}

let actionQueue = [];
let processingQueue = false;

function queueAction(type, payload) {
  actionQueue.push({ type, payload });
  processQueue();
}

async function processQueue() {
  if (processingQueue || actionQueue.length === 0) return;
  processingQueue = true;

  const action = actionQueue.shift();
  try {
    if (action.type === "animation") {
      let nextStatePayload = null;
      if (actionQueue.length > 0 && actionQueue[0].type === "state") {
        nextStatePayload = actionQueue.shift().payload;
      }
      await runAnimation(action.payload, nextStatePayload);
      if (nextStatePayload) {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
    } else if (action.type === "state") {
      applyState(action.payload);
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    }
  } catch (error) {
    console.error("Queue execution error:", error);
  }

  processingQueue = false;
  processQueue();
}

function applyState(nextState) {
  if (nextState.caboCalledBy && nextState.caboCalledBy !== lastCaboCalledBy) {
    const caller = nextState.players.find((p) => p.id === nextState.caboCalledBy);
    if (caller) {
      triggerCaboOverlay(caller.name);
    }
  }
  lastCaboCalledBy = nextState.caboCalledBy;

  state = nextState;
  saveIdentity({ roomCode: state.roomCode, playerId: state.you });
  if (!state.initialPeekNeeded) initialPeekSelection = [];
  selected = { ownIndex: null, targetPlayerId: null, targetIndex: null };
  render();
}

function triggerCaboOverlay(name) {
  const overlay = document.querySelector("#caboOverlay");
  const title = document.querySelector("#caboBannerTitle");
  if (!overlay || !title) return;

  title.textContent = `${name.toUpperCase()} CALLED CABO!`;
  overlay.classList.remove("hidden");
  
  // Force layout reflow
  overlay.offsetWidth;
  
  overlay.classList.add("active");

  const closeOverlay = () => {
    overlay.classList.remove("active");
    const cleanup = () => {
      overlay.classList.add("hidden");
      overlay.removeEventListener("click", closeOverlay);
    };
    window.setTimeout(cleanup, 350);
  };

  overlay.addEventListener("click", closeOverlay);
  
  // Automatically dismiss after 3 seconds
  window.setTimeout(() => {
    if (overlay.classList.contains("active")) {
      closeOverlay();
    }
  }, 3000);
}

function runAnimation(animation, nextStatePayload = null) {
  return new Promise((resolve) => {
    const fromEl = endpointElement(animation.from);
    const toEl = endpointElement(animation.to);

    // Resolve standard card dimensions for placeholder/bot cards
    const deckBox = els.deckBtn.getBoundingClientRect();
    const cardWidth = deckBox.width || 82;
    const cardHeight = deckBox.height || 115;

    const animationDuration = 500; // ms

    const ghosted = [];
    const clones = [];

    const addGhost = (el) => {
      if (el) {
        if (el.classList.contains("player")) return;
        el.classList.add("animating-ghost");
        ghosted.push(el);
      }
    };

    const getElementBox = (el) => {
      if (!el) return { left: window.innerWidth / 2, top: window.innerHeight / 2, width: cardWidth, height: cardHeight };
      const box = el.getBoundingClientRect();
      if (el.classList.contains("card") || el.classList.contains("pile")) {
        return box;
      }
      // Centered card box for player containers
      const centerX = box.left + box.width / 2;
      const centerY = box.top + box.height / 2;
      return {
        left: centerX - cardWidth / 2,
        top: centerY - cardHeight / 2,
        width: cardWidth,
        height: cardHeight
      };
    };

    const createClone = (el, isBack = false, customCardFrontData = null) => {
      let clone;
      if (el && el.classList.contains("card")) {
        clone = el.cloneNode(true);
      } else {
        clone = document.createElement("div");
        clone.className = "card";
        if (isBack) {
          clone.classList.add("hidden-card");
        } else if (customCardFrontData) {
          const red = customCardFrontData.suit === "hearts" || customCardFrontData.suit === "diamonds";
          if (red) clone.classList.add("red-card");
          clone.innerHTML = `
            <span class="card-rank">${customCardFrontData.rank}</span>
            <span class="card-suit">${suitSymbol(customCardFrontData.suit)}</span>
          `;
        } else {
          clone.classList.add("hidden-card");
        }
      }
      clone.classList.remove("selectable", "selected");
      clone.classList.add("flying-card-clone");
      return clone;
    };

    const setupCloneStyle = (clone, box) => {
      clone.style.left = `${box.left}px`;
      clone.style.top = `${box.top}px`;
      clone.style.width = `${box.width}px`;
      clone.style.height = `${box.height}px`;
    };

    // Perform animation based on type
    if (animation.type === "swap") {
      if (fromEl && toEl) {
        const fromBox = getElementBox(fromEl);
        const toBox = getElementBox(toEl);
        const fromCenter = { x: fromBox.left + fromBox.width / 2, y: fromBox.top + fromBox.height / 2 };
        const toCenter = { x: toBox.left + toBox.width / 2, y: toBox.top + toBox.height / 2 };
        drawArrow(fromCenter.x, fromCenter.y, toCenter.x, toCenter.y, false); // Outward
        drawArrow(toCenter.x, toCenter.y, fromCenter.x, fromCenter.y, true);  // Inward

        const cloneA = createClone(fromEl);
        const cloneB = createClone(toEl);

        setupCloneStyle(cloneA, fromBox);
        setupCloneStyle(cloneB, toBox);

        document.body.appendChild(cloneA);
        document.body.appendChild(cloneB);
        clones.push(cloneA, cloneB);

        addGhost(fromEl);
        addGhost(toEl);

        // Card A: from -> to
        const dxA = toBox.left - fromBox.left;
        const dyA = toBox.top - fromBox.top;
        const distA = Math.hypot(dxA, dyA);
        const angleA = Math.atan2(dyA, dxA);
        const perpAngleA = angleA + Math.PI / 2;
        const arcStrengthA = Math.min(60, distA * 0.18);
        const perpXA = Math.cos(perpAngleA) * arcStrengthA;
        const perpYA = Math.sin(perpAngleA) * arcStrengthA;

        cloneA.animate([
          { transform: "translate(0, 0) scale(1) rotate(0deg)", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" },
          { transform: `translate(${dxA/2 + perpXA}px, ${dyA/2 + perpYA}px) scale(1.15) rotate(4deg)`, boxShadow: "0 18px 36px rgba(0,0,0,0.3)" },
          { transform: `translate(${dxA}px, ${dyA}px) scale(1) rotate(0deg)`, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }
        ], { duration: animationDuration, easing: "cubic-bezier(0.25, 1, 0.5, 1)", fill: "forwards" });

        // Card B: to -> from
        const dxB = fromBox.left - toBox.left;
        const dyB = fromBox.top - toBox.top;
        const distB = Math.hypot(dxB, dyB);
        const angleB = Math.atan2(dyB, dxB);
        const perpAngleB = angleB + Math.PI / 2;
        const arcStrengthB = Math.min(60, distB * 0.18);
        const perpXB = Math.cos(perpAngleB) * arcStrengthB;
        const perpYB = Math.sin(perpAngleB) * arcStrengthB;

        cloneB.animate([
          { transform: "translate(0, 0) scale(1) rotate(0deg)", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" },
          { transform: `translate(${dxB/2 + perpXB}px, ${dyB/2 + perpYB}px) scale(1.15) rotate(-4deg)`, boxShadow: "0 18px 36px rgba(0,0,0,0.3)" },
          { transform: `translate(${dxB}px, ${dyB}px) scale(1) rotate(0deg)`, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }
        ], { duration: animationDuration, easing: "cubic-bezier(0.25, 1, 0.5, 1)", fill: "forwards" });
      }
    } else if (animation.type === "replace") {
      const discardEl = els.discardBtn;
      if (fromEl && toEl && discardEl) {
        const fromBox = getElementBox(fromEl);
        const toBox = getElementBox(toEl);
        const discardBox = getElementBox(discardEl);
        const isHuman = animation.playerId === state.you;

        const fromCenter = { x: fromBox.left + fromBox.width / 2, y: fromBox.top + fromBox.height / 2 };
        const toCenter = { x: toBox.left + toBox.width / 2, y: toBox.top + toBox.height / 2 };
        const discardCenter = { x: discardBox.left + discardBox.width / 2, y: discardBox.top + discardBox.height / 2 };
        drawArrow(fromCenter.x, fromCenter.y, toCenter.x, toCenter.y, true); // Inward
        drawArrow(toCenter.x, toCenter.y, discardCenter.x, discardCenter.y, false); // Outward

        // Clone 1: Drawn Card -> Hand
        const clone1 = createClone(fromEl, !isHuman);
        setupCloneStyle(clone1, fromBox);
        document.body.appendChild(clone1);
        clones.push(clone1);

        // Clone 2: Hand Card -> Discard
        const clone2 = createClone(toEl);
        setupCloneStyle(clone2, toBox);
        document.body.appendChild(clone2);
        clones.push(clone2);

        addGhost(fromEl);
        addGhost(toEl);

        const dx1 = toBox.left - fromBox.left;
        const dy1 = toBox.top - fromBox.top;

        if (isHuman) {
          // Human: Card goes face-up -> face-down (flip)
          clone1.animate([
            { transform: "translate(0, 0) scale(1) rotate(0deg)", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" },
            { transform: `translate(${dx1/2}px, ${dy1/2}px) scale(0, 1.1) rotate(0deg)`, boxShadow: "0 14px 28px rgba(0,0,0,0.25)" },
            { transform: `translate(${dx1}px, ${dy1}px) scale(1) rotate(0deg)`, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }
          ], { duration: animationDuration, easing: "ease-in-out", fill: "forwards" });

          window.setTimeout(() => {
            clone1.className = "card hidden-card flying-card-clone";
            clone1.innerHTML = "";
          }, animationDuration / 2);
        } else {
          // Bot: Card goes face-down -> face-down (no flip)
          clone1.animate([
            { transform: "translate(0, 0) scale(1)", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" },
            { transform: `translate(${dx1/2}px, ${dy1/2}px) scale(1.1)`, boxShadow: "0 14px 28px rgba(0,0,0,0.25)" },
            { transform: `translate(${dx1}px, ${dy1}px) scale(1)`, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }
          ], { duration: animationDuration, easing: "cubic-bezier(0.25, 1, 0.5, 1)", fill: "forwards" });
        }

        // Hand Card -> Discard (always flips face-up)
        const dx2 = discardBox.left - toBox.left;
        const dy2 = discardBox.top - toBox.top;

        clone2.animate([
          { transform: "translate(0, 0) scale(1) rotate(0deg)", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" },
          { transform: `translate(${dx2/2}px, ${dy2/2}px) scale(0, 1.15) rotate(4deg)`, boxShadow: "0 18px 36px rgba(0,0,0,0.3)" },
          { transform: `translate(${dx2}px, ${dy2}px) scale(1) rotate(0deg)`, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }
        ], { duration: animationDuration, easing: "ease-in-out", fill: "forwards" });

        window.setTimeout(() => {
          clone2.classList.remove("hidden-card");
          const c = animation.discardedCard;
          if (c) {
            const red = c.suit === "hearts" || c.suit === "diamonds";
            if (red) clone2.classList.add("red-card");
            else clone2.classList.remove("red-card");
            clone2.innerHTML = `
              <span class="card-rank">${c.rank}</span>
              <span class="card-suit">${suitSymbol(c.suit)}</span>
            `;
          }
        }, animationDuration / 2);
      }
    } else if (animation.type === "discard") {
      if (fromEl && toEl) {
        const fromBox = getElementBox(fromEl);
        const toBox = getElementBox(toEl);
        const isHuman = fromEl.querySelector(".drawn-in-hand") || fromEl.classList.contains("drawn-in-hand");

        const fromCenter = { x: fromBox.left + fromBox.width / 2, y: fromBox.top + fromBox.height / 2 };
        const toCenter = { x: toBox.left + toBox.width / 2, y: toBox.top + toBox.height / 2 };
        drawArrow(fromCenter.x, fromCenter.y, toCenter.x, toCenter.y, false); // Outward

        const clone = createClone(fromEl, !isHuman);
        setupCloneStyle(clone, fromBox);
        document.body.appendChild(clone);
        clones.push(clone);

        addGhost(fromEl);

        const dx = toBox.left - fromBox.left;
        const dy = toBox.top - fromBox.top;

        if (isHuman) {
          // Human: Card is already face-up
          clone.animate([
            { transform: "translate(0, 0) scale(1) rotate(0deg)", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" },
            { transform: `translate(${dx/2}px, ${dy/2}px) scale(1.1) rotate(3deg)`, boxShadow: "0 14px 28px rgba(0,0,0,0.25)" },
            { transform: `translate(${dx}px, ${dy}px) scale(1) rotate(0deg)`, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }
          ], { duration: animationDuration, easing: "cubic-bezier(0.25, 1, 0.5, 1)", fill: "forwards" });
        } else {
          // Bot: Card is face-down, flips face-up
          clone.animate([
            { transform: "translate(0, 0) scale(1) rotate(0deg)", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" },
            { transform: `translate(${dx/2}px, ${dy/2}px) scale(0, 1.15) rotate(-4deg)`, boxShadow: "0 18px 36px rgba(0,0,0,0.3)" },
            { transform: `translate(${dx}px, ${dy}px) scale(1) rotate(0deg)`, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }
          ], { duration: animationDuration, easing: "ease-in-out", fill: "forwards" });

          window.setTimeout(() => {
            clone.classList.remove("hidden-card");
            const c = animation.discardedCard;
            if (c) {
              const red = c.suit === "hearts" || c.suit === "diamonds";
              if (red) clone.classList.add("red-card");
              else clone.classList.remove("red-card");
              clone.innerHTML = `
                <span class="card-rank">${c.rank}</span>
                <span class="card-suit">${suitSymbol(c.suit)}</span>
              `;
            }
          }, animationDuration / 2);
        }
      }
    } else if (animation.type === "draw") {
      if (fromEl && toEl) {
        const fromBox = getElementBox(fromEl);
        const toBox = getElementBox(toEl);

        const fromCenter = { x: fromBox.left + fromBox.width / 2, y: fromBox.top + fromBox.height / 2 };
        const toCenter = { x: toBox.left + toBox.width / 2, y: toBox.top + toBox.height / 2 };
        drawArrow(fromCenter.x, fromCenter.y, toCenter.x, toCenter.y, true); // Inward

        const isDeck = animation.from.kind === "deck";
        const clone = createClone(fromEl, isDeck, isDeck ? null : state.discardTop);
        setupCloneStyle(clone, fromBox);
        document.body.appendChild(clone);
        clones.push(clone);

        addGhost(fromEl);

        const dx = toBox.left - fromBox.left;
        const dy = toBox.top - fromBox.top;

        clone.animate([
          { transform: "translate(0, 0) scale(1) rotate(0deg)", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" },
          { transform: `translate(${dx/2}px, ${dy/2}px) scale(1.15) rotate(6deg)`, boxShadow: "0 18px 36px rgba(0,0,0,0.3)" },
          { transform: `translate(${dx}px, ${dy}px) scale(1) rotate(0deg)`, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }
        ], { duration: animationDuration, easing: "cubic-bezier(0.25, 1, 0.5, 1)", fill: "forwards" });
      }
    }

    // Clean up clones and ghosts
    window.setTimeout(() => {
      if (nextStatePayload) {
        applyState(nextStatePayload);
      }
      for (const clone of clones) {
        clone.remove();
      }
      for (const el of ghosted) {
        el.classList.remove("animating-ghost");
      }
      resolve();
    }, animationDuration + 20);
  });
}

function drawArrow(x1, y1, x2, y2, isInward) {
  const svg = document.querySelector("#trailSvg");
  if (!svg) return;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist < 15) return;

  const angle = Math.atan2(dy, dx);
  const perpAngle = angle - Math.PI / 2;
  // Subtle curve
  const offset = Math.min(45, dist * 0.12);
  const cx = (x1 + x2) / 2 + Math.cos(perpAngle) * offset;
  const cy = (y1 + y2) / 2 + Math.sin(perpAngle) * offset;

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`);
  path.setAttribute("class", `trail-path ${isInward ? "inward" : "outward"}`);
  path.setAttribute("marker-end", `url(#arrow-${isInward ? "inward" : "outward"})`);
  
  svg.appendChild(path);

  const length = path.getTotalLength();
  path.style.strokeDasharray = length;
  path.style.strokeDashoffset = length;

  // Trigger reflow
  path.getBoundingClientRect();

  path.animate([
    { strokeDashoffset: length, opacity: 0.8 },
    { strokeDashoffset: 0, opacity: 0.9, offset: 0.4 },
    { strokeDashoffset: 0, opacity: 0 }
  ], {
    duration: 900,
    easing: "ease-out",
    fill: "forwards"
  });

  window.setTimeout(() => {
    path.remove();
  }, 1000);
}

els.createBtn.addEventListener("click", createRoom);
els.joinBtn.addEventListener("click", joinRoom);
els.addBotBtn.addEventListener("click", () => request("addBot", { roomCode: state.roomCode, playerId: state.you }));
els.startBtn.addEventListener("click", () => request("startGame", { roomCode: state.roomCode, playerId: state.you }));
els.deckBtn.addEventListener("click", () => request("draw", { roomCode: state.roomCode, playerId: state.you, source: "deck" }));
els.discardBtn.addEventListener("click", () => request("draw", { roomCode: state.roomCode, playerId: state.you, source: "discard" }));
els.discardDrawnBtn.addEventListener("click", () => request("discardDrawn", { roomCode: state.roomCode, playerId: state.you }));
els.swapPowerBtn.addEventListener("click", () => request("swapPower", { roomCode: state.roomCode, playerId: state.you }));
els.caboBtn.addEventListener("click", () => request("callCabo", { roomCode: state.roomCode, playerId: state.you }));
els.endTurnBtn.addEventListener("click", () => request("endTurn", { roomCode: state.roomCode, playerId: state.you }));
els.skipPowerBtn.addEventListener("click", () => request("skipPower", { roomCode: state.roomCode, playerId: state.you }));
els.leaveBtn.addEventListener("click", async () => {
  if (state) await request("leaveRoom", { roomCode: state.roomCode, playerId: state.you });
  localStorage.removeItem("cabo:roomCode");
  localStorage.removeItem("cabo:playerId");
  window.location.reload();
});
els.copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(state.roomCode);
  setNotice(`Copied ${state.roomCode}.`);
});
els.roomInput.addEventListener("input", () => {
  els.roomInput.value = els.roomInput.value.toUpperCase();
});
els.nameInput.addEventListener("input", () => {
  saveIdentity({ name: els.nameInput.value });
});

els.modalActionBtn.addEventListener("click", () => {
  request("startGame", { roomCode: state.roomCode, playerId: state.you });
  els.endRoundModal.classList.add("hidden");
});

els.modalCloseBtn.addEventListener("click", () => {
  els.endRoundModal.classList.add("hidden");
});

// Setup static drag & drop listeners
els.deckBtn.addEventListener("dragstart", (e) => {
  if (!canAct() || state.turnPhase !== "draw") {
    e.preventDefault();
    return;
  }
  e.dataTransfer.setData("text/plain", "deck");
  els.deckBtn.classList.add("dragging");
});
els.deckBtn.addEventListener("dragend", () => {
  els.deckBtn.classList.remove("dragging");
});

els.discardBtn.addEventListener("dragstart", (e) => {
  if (!canAct() || state.turnPhase !== "draw" || !state.discardTop) {
    e.preventDefault();
    return;
  }
  e.dataTransfer.setData("text/plain", "discard");
  els.discardBtn.classList.add("dragging");
});
els.discardBtn.addEventListener("dragend", () => {
  els.discardBtn.classList.remove("dragging");
});

els.discardBtn.addEventListener("dragover", (e) => {
  if (!state || state.status !== "playing") return;
  e.preventDefault();
  els.discardBtn.classList.add("drag-over");
});
els.discardBtn.addEventListener("dragleave", () => {
  els.discardBtn.classList.remove("drag-over");
});
els.discardBtn.addEventListener("drop", async (e) => {
  els.discardBtn.classList.remove("drag-over");
  if (!state || state.status !== "playing") return;

  const rawData = e.dataTransfer.getData("text/plain");
  if (!rawData) return;

  if (rawData === "drawn") {
    if (canAct() && state.turnPhase === "decide") {
      await request("discardDrawn", { roomCode: state.roomCode, playerId: state.you });
    }
  } else {
    try {
      const data = JSON.parse(rawData);
      if (data.type === "hand-card") {
        await request("matchCard", {
          roomCode: state.roomCode,
          playerId: state.you,
          targetPlayerId: data.playerId,
          index: data.index,
          cardId: data.cardId
        });
      }
    } catch (err) {
      // Ignore non-matching drops
    }
  }
});

els.drawnCard.addEventListener("dragover", (e) => {
  if (!canAct() || state.turnPhase !== "draw") return;
  e.preventDefault();
  els.drawnCard.classList.add("drag-over");
});
els.drawnCard.addEventListener("dragleave", () => {
  els.drawnCard.classList.remove("drag-over");
});
els.drawnCard.addEventListener("drop", async (e) => {
  els.drawnCard.classList.remove("drag-over");
  if (!canAct() || state.turnPhase !== "draw") return;
  const source = e.dataTransfer.getData("text/plain");
  if (source === "deck") {
    await request("draw", { roomCode: state.roomCode, playerId: state.you, source: "deck" });
  }
});

socket.on("state", (nextState) => {
  queueAction("state", nextState);
});

socket.on("revealCards", ({ cards, duration, reason }) => {
  for (const item of cards || []) {
    tempReveals.set(revealKey(item.ownerId, item.index), item.card);
  }
  if (reason === "initialPeek") startPeekCountdown(duration || 3600);
  render();
  window.setTimeout(() => {
    for (const item of cards || []) {
      tempReveals.delete(revealKey(item.ownerId, item.index));
    }
    render();
  }, duration || 3600);
});

socket.on("animation", (animation) => {
  queueAction("animation", animation);
});

socket.on("connect", () => {
  if (identity.roomCode && identity.playerId) {
    request("joinRoom", { roomCode: identity.roomCode, name: identity.name, token: identity.token });
  }
});
