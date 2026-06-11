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
  deckBtn: document.querySelector("#deckBtn"),
  discardBtn: document.querySelector("#discardBtn"),
  deckCount: document.querySelector("#deckCount"),
  discardTop: document.querySelector("#discardTop"),
  drawnCard: document.querySelector("#drawnCard"),
  discardDrawnBtn: document.querySelector("#discardDrawnBtn"),
  swapPowerBtn: document.querySelector("#swapPowerBtn"),
  caboBtn: document.querySelector("#caboBtn"),
  skipPowerBtn: document.querySelector("#skipPowerBtn"),
  players: document.querySelector("#players"),
  statusText: document.querySelector("#statusText"),
  logList: document.querySelector("#logList")
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
let animationUntil = 0;
let pendingState = null;
let pendingRenderTimer = null;

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

function cardHtml(card, classes = "") {
  if (!card) return "";
  if (card.hidden) {
    return `<div class="card hidden-card ${classes}" data-card-id="${card.id}"></div>`;
  }
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return `
    <div class="card ${red ? "red-card" : ""} ${classes}" data-card-id="${card.id}">
      <span class="card-rank">${card.rank}</span>
      <span class="card-suit">${suitSymbol(card.suit)}</span>
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
  els.discardTop.textContent = state.discardTop?.label || "--";
  els.drawnCard.innerHTML = "";

  els.addBotBtn.disabled = !state.canAddBot;
  els.startBtn.disabled = !state.canStart;
  els.deckBtn.disabled = !canAct() || state.turnPhase !== "draw";
  els.discardBtn.disabled = !canAct() || state.turnPhase !== "draw" || !state.discardTop;
  els.discardDrawnBtn.disabled = !canAct() || state.turnPhase !== "decide";
  els.swapPowerBtn.disabled = !canAct() || state.pendingPower?.type !== "optionalLookSwap" || state.pendingPower?.stage !== "chooseSwap";
  els.caboBtn.disabled = !canAct() || state.turnPhase !== "draw" || Boolean(state.caboCalledBy);
  els.skipPowerBtn.disabled = !canAct() || state.turnPhase !== "power"
    || (state.pendingPower?.type === "forcedLookSwap" && state.pendingPower?.stage === "chooseOwn");

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
  els.statusText.textContent = `${phase}${cabo}`;

  els.players.innerHTML = state.players.map((player, playerIndex) => {
    const isCurrent = player.id === state.currentPlayerId;
    const isWinner = state.winnerIds.includes(player.id);
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
      return `
        <button class="card-button" type="button" data-player-id="${player.id}" data-index="${index}" ${selectable ? "" : "disabled"}>
          ${cardHtml(displayCard, `${selectable ? "selectable" : ""} ${selectedClass}`)}
        </button>
      `;
    }).join("");
    const score = player.score === null ? "" : `<span class="badge">${player.score}</span>`;
    const botBadge = player.isBot ? '<span class="badge">AI</span>' : "";
    const drawn = state.drawnCard && player.id === state.you
      ? `<div class="drawn-slot">${cardHtml(state.drawnCard, "drawn-in-hand")}</div>`
      : "";
    return `
      <article class="player seat-${playerIndex} ${isCurrent ? "current" : ""} ${isWinner ? "winner" : ""}" data-player-id="${player.id}">
        <div class="player-head">
          <strong>${escapeHtml(player.name)}${player.id === state.you ? " (you)" : ""}</strong>
          <span class="badges">${player.isHost ? '<span class="badge">Host</span>' : ""}${botBadge}${score}</span>
        </div>
        <div class="hand">${hand}</div>
        ${drawn}
      </article>
    `;
  }).join("");

  els.players.querySelectorAll(".card-button").forEach((button) => {
    button.addEventListener("click", () => selectCard(button.dataset.playerId, Number(button.dataset.index)));
  });

  els.logList.innerHTML = state.log.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("");
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

function endpointElement(endpoint) {
  if (!endpoint) return null;
  if (endpoint.kind === "deck") return els.deckBtn;
  if (endpoint.kind === "discard") return els.discardBtn;
  if (endpoint.kind === "player") return document.querySelector(`.player[data-player-id="${endpoint.playerId}"]`);
  if (endpoint.kind === "hand") {
    return document.querySelector(`.card-button[data-player-id="${endpoint.playerId}"][data-index="${endpoint.index}"] .card`);
  }
  return null;
}

function animateMovement(animation) {
  const from = endpointElement(animation.from);
  const to = endpointElement(animation.to);
  if (!from || !to) return;
  animationUntil = Date.now() + 520;

  const fromBox = from.getBoundingClientRect();
  const toBox = to.getBoundingClientRect();
  const clone = from.cloneNode(true);
  clone.classList.add("motion-card");
  clone.style.left = `${fromBox.left}px`;
  clone.style.top = `${fromBox.top}px`;
  clone.style.width = `${fromBox.width}px`;
  clone.style.height = `${fromBox.height}px`;
  document.body.appendChild(clone);

  const arrow = document.createElement("div");
  arrow.className = "motion-arrow";
  const dx = toBox.left + toBox.width / 2 - (fromBox.left + fromBox.width / 2);
  const dy = toBox.top + toBox.height / 2 - (fromBox.top + fromBox.height / 2);
  arrow.style.left = `${fromBox.left + fromBox.width / 2}px`;
  arrow.style.top = `${fromBox.top + fromBox.height / 2}px`;
  arrow.style.width = `${Math.hypot(dx, dy)}px`;
  arrow.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  document.body.appendChild(arrow);

  requestAnimationFrame(() => {
    clone.style.transform = `translate(${toBox.left - fromBox.left}px, ${toBox.top - fromBox.top}px) scale(${toBox.width / fromBox.width})`;
    clone.style.opacity = "0.72";
    arrow.classList.add("active");
  });

  window.setTimeout(() => {
    clone.remove();
    arrow.remove();
    if (pendingState) {
      state = pendingState;
      pendingState = null;
      render();
    }
  }, 540);
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

socket.on("state", (nextState) => {
  if (Date.now() < animationUntil) {
    pendingState = nextState;
    window.clearTimeout(pendingRenderTimer);
    pendingRenderTimer = window.setTimeout(() => {
      if (!pendingState) return;
      state = pendingState;
      pendingState = null;
      render();
    }, Math.max(0, animationUntil - Date.now()) + 40);
    return;
  }
  state = nextState;
  saveIdentity({ roomCode: state.roomCode, playerId: state.you });
  if (!state.initialPeekNeeded) initialPeekSelection = [];
  selected = { ownIndex: null, targetPlayerId: null, targetIndex: null };
  render();
});

socket.on("revealCards", ({ cards, duration }) => {
  for (const item of cards || []) {
    tempReveals.set(revealKey(item.ownerId, item.index), item.card);
  }
  render();
  window.setTimeout(() => {
    for (const item of cards || []) {
      tempReveals.delete(revealKey(item.ownerId, item.index));
    }
    render();
  }, duration || 3600);
});

socket.on("animation", animateMovement);

socket.on("connect", () => {
  if (identity.roomCode && identity.playerId) {
    request("joinRoom", { roomCode: identity.roomCode, name: identity.name, token: identity.token });
  }
});
