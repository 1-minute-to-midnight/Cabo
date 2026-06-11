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
  startBtn: document.querySelector("#startBtn"),
  leaveBtn: document.querySelector("#leaveBtn"),
  notice: document.querySelector("#notice"),
  deckBtn: document.querySelector("#deckBtn"),
  discardBtn: document.querySelector("#discardBtn"),
  deckCount: document.querySelector("#deckCount"),
  discardTop: document.querySelector("#discardTop"),
  drawnCard: document.querySelector("#drawnCard"),
  discardDrawnBtn: document.querySelector("#discardDrawnBtn"),
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
  els.drawnCard.innerHTML = state.drawnCard ? cardHtml(state.drawnCard) : "";

  els.startBtn.disabled = !state.canStart;
  els.deckBtn.disabled = !canAct() || state.turnPhase !== "draw";
  els.discardBtn.disabled = !canAct() || state.turnPhase !== "draw" || !state.discardTop;
  els.discardDrawnBtn.disabled = !canAct() || state.turnPhase !== "decide";
  els.caboBtn.disabled = !canAct() || state.turnPhase !== "draw" || Boolean(state.caboCalledBy);
  els.skipPowerBtn.disabled = !canAct() || state.turnPhase !== "power";

  const phase = state.status === "waiting"
    ? "Waiting for players."
    : state.status === "ended"
      ? winnerText()
      : state.pendingPower
        ? state.pendingPower.label
        : `${current?.name || "Someone"} ${current?.id === state.you ? "is up" : "is taking a turn"}.`;
  const cabo = caboCaller ? ` Cabo was called by ${caboCaller.name}.` : "";
  els.statusText.textContent = `${phase}${cabo}`;

  els.players.innerHTML = state.players.map((player) => {
    const isCurrent = player.id === state.currentPlayerId;
    const isWinner = state.winnerIds.includes(player.id);
    const hand = player.hand.map((card, index) => {
      const selectable = selectableCard(player, index);
      const selectedClass = selected.ownIndex === index && player.id === state.you
        || selected.targetPlayerId === player.id && selected.targetIndex === index
        ? "selected"
        : "";
      return `
        <button class="card-button" type="button" data-player-id="${player.id}" data-index="${index}" ${selectable ? "" : "disabled"}>
          ${cardHtml(card, `${selectable ? "selectable" : ""} ${selectedClass}`)}
        </button>
      `;
    }).join("");
    const score = player.score === null ? "" : `<span class="badge">${player.score}</span>`;
    return `
      <article class="player ${isCurrent ? "current" : ""} ${isWinner ? "winner" : ""}">
        <div class="player-head">
          <strong>${escapeHtml(player.name)}${player.id === state.you ? " (you)" : ""}</strong>
          <span class="badges">${player.isHost ? '<span class="badge">Host</span>' : ""}${score}</span>
        </div>
        <div class="hand">${hand}</div>
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

function selectableCard(player, index) {
  if (!canAct()) return false;
  if (state.turnPhase === "replace" || state.turnPhase === "decide") return player.id === state.you;
  if (!state.pendingPower) return false;
  if (state.pendingPower.type === "ownPeek") return player.id === state.you;
  if (state.pendingPower.type === "otherPeek") return player.id !== state.you;
  if (state.pendingPower.type === "swap") return player.id === state.you || player.id !== state.you;
  return false;
}

async function selectCard(playerId, index) {
  if (!state || !canAct()) return;

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

  if (state.pendingPower.type === "swap") {
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

els.createBtn.addEventListener("click", createRoom);
els.joinBtn.addEventListener("click", joinRoom);
els.startBtn.addEventListener("click", () => request("startGame", { roomCode: state.roomCode, playerId: state.you }));
els.deckBtn.addEventListener("click", () => request("draw", { roomCode: state.roomCode, playerId: state.you, source: "deck" }));
els.discardBtn.addEventListener("click", () => request("draw", { roomCode: state.roomCode, playerId: state.you, source: "discard" }));
els.discardDrawnBtn.addEventListener("click", () => request("discardDrawn", { roomCode: state.roomCode, playerId: state.you }));
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
  state = nextState;
  saveIdentity({ roomCode: state.roomCode, playerId: state.you });
  selected = { ownIndex: null, targetPlayerId: null, targetIndex: null };
  render();
});

socket.on("connect", () => {
  if (identity.roomCode && identity.playerId) {
    request("joinRoom", { roomCode: identity.roomCode, name: identity.name, token: identity.token });
  }
});
