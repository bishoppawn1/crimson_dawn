const LOBBY_CODE_LENGTH = 10;
const LOBBY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
const MAX_BUFFERED_BYTES = 2 * 1024 * 1024;
const MAX_STATE_BUFFERED_BYTES = 64 * 1024;
const STATE_FLUSH_RETRY_MS = 25;
const PEER_OPEN_TIMEOUT_MS = 12_000;
const GUEST_CONNECTION_TIMEOUT_MS = 15_000;
const MAX_CODE_ATTEMPTS = 5;
const MATCH_START_RETRY_MS = 750;
const MATCH_START_TIMEOUT_MS = 12_000;

let fallbackMatchStartId = 1;

export function normalizeLobbyCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, LOBBY_CODE_LENGTH);
}

export function isValidLobbyCode(value) {
  return /^[A-Z0-9]{10}$/.test(normalizeLobbyCode(value));
}

export function generateLobbyCode(randomValues = null) {
  const values = randomValues || secureRandomValues(LOBBY_CODE_LENGTH);
  if (!values || values.length < LOBBY_CODE_LENGTH) {
    throw new Error("Could not generate a secure lobby code.");
  }
  let code = "";
  for (let index = 0; index < LOBBY_CODE_LENGTH; index += 1) {
    code += LOBBY_CODE_ALPHABET[values[index] % LOBBY_CODE_ALPHABET.length];
  }
  return code;
}

export class MatchStartHandshake {
  constructor(role, options = {}) {
    if (role !== "host" && role !== "guest") {
      throw new Error("A match-start handshake must belong to a host or guest.");
    }
    this.role = role;
    this.now = options.now || (() => performance.now());
    this.idFactory = options.idFactory || createMatchStartId;
    this.pending = null;
    this.acceptedStartId = null;
  }

  get waiting() {
    return Boolean(this.pending);
  }

  begin(snapshot) {
    if (this.role !== "host") {
      throw new Error("Only the host can begin a match-start handshake.");
    }
    const now = this.now();
    const message = {
      type: "match_start",
      startId: this.idFactory(),
      snapshot,
    };
    this.pending = {
      message,
      retryAt: now + MATCH_START_RETRY_MS,
      expiresAt: now + MATCH_START_TIMEOUT_MS,
    };
    return message;
  }

  inspect(message) {
    if (!message || typeof message.type !== "string") return null;
    if (this.role === "host") {
      if (!this.pending || message.startId !== this.pending.message.startId) return null;
      if (message.type === "match_start_ack") {
        this.pending = null;
        return { kind: "acknowledged", startId: message.startId };
      }
      if (message.type === "match_start_reject") {
        this.pending = null;
        return {
          kind: "rejected",
          reason: String(message.reason || "The guest could not load the match setup."),
          startId: message.startId,
        };
      }
      return null;
    }

    if (message.type !== "match_start" || !validMatchStartId(message.startId)) return null;
    if (this.acceptedStartId === message.startId) {
      return {
        kind: "repeat",
        acknowledgement: this.acknowledgement(message.startId),
        startId: message.startId,
      };
    }
    if (this.acceptedStartId) {
      return { kind: "conflict", startId: message.startId };
    }
    return { kind: "offered", snapshot: message.snapshot, startId: message.startId };
  }

  accept(startId) {
    if (this.role !== "guest" || !validMatchStartId(startId)) return null;
    this.acceptedStartId = startId;
    return this.acknowledgement(startId);
  }

  reject(startId, reason) {
    if (this.role !== "guest" || !validMatchStartId(startId)) return null;
    return {
      type: "match_start_reject",
      startId,
      reason: String(reason || "The guest could not load the match setup."),
    };
  }

  poll() {
    if (this.role !== "host" || !this.pending) return null;
    const now = this.now();
    if (now >= this.pending.expiresAt) {
      this.pending = null;
      return { kind: "timeout" };
    }
    if (now < this.pending.retryAt) return null;
    this.pending.retryAt = now + MATCH_START_RETRY_MS;
    return { kind: "retry", message: this.pending.message };
  }

  reset() {
    this.pending = null;
    this.acceptedStartId = null;
  }

  acknowledgement(startId) {
    return { type: "match_start_ack", startId };
  }
}

export class PeerMultiplayerSession {
  constructor(role, peer, handlers = {}) {
    this.role = role;
    this.peer = peer;
    this.handlers = handlers;
    this.connection = null;
    this.opened = false;
    this.closed = false;
    this.lobbyCode = null;
    this.connectionTimeout = null;
    this.pendingState = null;
    this.stateInFlightSequence = null;
    this.stateFlushTimer = null;

    peer.on("error", (error) => {
      if (this.closed) return;
      // PeerJS Cloud is only the signaling broker. Once the direct WebRTC data
      // channel is open, a broker/socket interruption must not end the match.
      if (this.connection?.open) return;
      this.handlers.onError?.(friendlyPeerError(error));
      if (this.opened || error?.type === "network" || error?.type === "webrtc") {
        this.handlers.onClose?.(error?.type || "error");
      }
    });
    peer.on("disconnected", () => {
      if (!this.closed && !this.opened) {
        this.handlers.onError?.("The lobby service disconnected. Try again.");
      }
    });
  }

  static async createHost(handlers = {}, options = {}) {
    const PeerConstructor = options.PeerConstructor || globalThis.Peer;
    requirePeerConstructor(PeerConstructor);

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const lobbyCode = normalizeLobbyCode(
        options.codeFactory?.() || generateLobbyCode(),
      );
      if (!isValidLobbyCode(lobbyCode)) {
        throw new Error("Lobby codes must contain exactly 10 letters and numbers.");
      }
      const peer = new PeerConstructor(lobbyCode, peerOptions());
      try {
        await waitForPeerOpen(peer);
      } catch (error) {
        peer.destroy?.();
        if (error?.type === "unavailable-id") continue;
        throw new Error(friendlyPeerError(error));
      }

      const session = new PeerMultiplayerSession("host", peer, handlers);
      session.lobbyCode = lobbyCode;
      peer.on("connection", (connection) => {
        if (session.connection && !session.closed) {
          connection.close?.();
          return;
        }
        session.attachConnection(connection);
      });
      return { session, lobbyCode };
    }
    throw new Error("Could not reserve a lobby code. Try creating the lobby again.");
  }

  static async createGuest(lobbyCode, handlers = {}, options = {}) {
    const normalizedCode = normalizeLobbyCode(lobbyCode);
    if (!isValidLobbyCode(normalizedCode)) {
      throw new Error("Enter the host's 10-letter-and-number lobby code.");
    }
    const PeerConstructor = options.PeerConstructor || globalThis.Peer;
    requirePeerConstructor(PeerConstructor);
    const peer = new PeerConstructor(undefined, peerOptions());
    try {
      await waitForPeerOpen(peer);
    } catch (error) {
      peer.destroy?.();
      throw new Error(friendlyPeerError(error));
    }

    const session = new PeerMultiplayerSession("guest", peer, handlers);
    session.lobbyCode = normalizedCode;
    const connection = peer.connect(normalizedCode, {
      label: "crimson-dawn",
      metadata: { game: "crimson-dawn", protocol: 1 },
      reliable: true,
      // PeerJS cannot fragment oversized JSON-channel messages. Match snapshots
      // exceed that limit once a lobby contains several commanders, while the
      // binary serializer transparently chunks and reconstructs the same objects.
      serialization: "binary",
    });
    session.attachConnection(connection);
    session.connectionTimeout = setTimeout(() => {
      if (session.opened || session.closed) return;
      session.handlers.onError?.("The lobby did not answer. Check the code and ask the host to create a new lobby.");
      session.close();
    }, GUEST_CONNECTION_TIMEOUT_MS);
    return { session, lobbyCode: normalizedCode };
  }

  attachConnection(connection) {
    this.connection = connection;
    connection.on("open", () => this.markOpen());
    connection.on("close", () => {
      clearTimeout(this.stateFlushTimer);
      this.pendingState = null;
      this.stateInFlightSequence = null;
      this.stateFlushTimer = null;
      if (this.closed) return;
      if (this.role === "host" && this.connection === connection) {
        this.connection = null;
        this.opened = false;
      }
      this.handlers.onClose?.("closed");
    });
    connection.on("error", (error) => {
      if (!this.closed) this.handlers.onError?.(friendlyPeerError(error));
    });
    connection.on("data", (message) => {
      if (!message || typeof message.type !== "string") return;
      if (this.role === "host" && message.type === "state_ack") {
        this.acknowledgeState(message.sequence);
        return;
      }
      let serialized;
      try {
        serialized = JSON.stringify(message);
      } catch {
        return;
      }
      if (serialized.length > MAX_MESSAGE_BYTES) return;
      try {
        this.handlers.onMessage?.(message);
      } catch (error) {
        this.handlers.onError?.(error?.message || "Could not process multiplayer data.");
      }
    });
  }

  markOpen() {
    if (this.opened || this.closed) return;
    clearTimeout(this.connectionTimeout);
    this.connectionTimeout = null;
    this.opened = true;
    this.handlers.onOpen?.();
  }

  send(message) {
    if (
      this.closed ||
      !this.connection?.open ||
      this.bufferedAmount() > MAX_BUFFERED_BYTES
    ) {
      return false;
    }
    return this.sendNow(message);
  }

  sendState(message) {
    if (
      this.closed ||
      !this.connection?.open ||
      !Number.isSafeInteger(message?.sequence)
    ) return false;
    if (this.stateInFlightSequence !== null || this.pendingState || this.stateChannelBusy()) {
      this.pendingState = message;
      this.scheduleStateFlush();
      return true;
    }
    const sent = this.sendNow(message);
    if (sent) this.stateInFlightSequence = message.sequence;
    return sent;
  }

  sendMotion(message) {
    if (message?.type !== "motion" || this.pendingState || this.stateChannelBusy()) {
      return false;
    }
    return this.send(message);
  }

  bufferedAmount() {
    return this.connection?.dataChannel?.bufferedAmount || 0;
  }

  stateChannelBusy() {
    return (
      this.bufferedAmount() > MAX_STATE_BUFFERED_BYTES ||
      (this.connection?.bufferSize || 0) > 0
    );
  }

  sendNow(message) {
    try {
      this.connection.send(message);
      return true;
    } catch (error) {
      this.handlers.onError?.(friendlyPeerError(error));
      return false;
    }
  }

  scheduleStateFlush() {
    if (this.stateFlushTimer || this.closed) return;
    this.stateFlushTimer = setTimeout(() => {
      this.stateFlushTimer = null;
      this.flushPendingState();
    }, STATE_FLUSH_RETRY_MS);
  }

  acknowledgeState(sequence) {
    if (
      this.stateInFlightSequence === null ||
      sequence !== this.stateInFlightSequence
    ) return false;
    this.stateInFlightSequence = null;
    this.flushPendingState();
    return true;
  }

  flushPendingState() {
    if (this.closed || !this.pendingState || this.stateInFlightSequence !== null) return;
    if (!this.connection?.open) {
      this.pendingState = null;
      return;
    }
    if (this.stateChannelBusy()) {
      this.scheduleStateFlush();
      return;
    }
    const state = this.pendingState;
    this.pendingState = null;
    if (this.sendNow(state)) this.stateInFlightSequence = state.sequence;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.connectionTimeout);
    clearTimeout(this.stateFlushTimer);
    this.pendingState = null;
    this.stateInFlightSequence = null;
    this.stateFlushTimer = null;
    this.connection?.close?.();
    this.peer?.destroy?.();
  }
}

function peerOptions() {
  return {
    debug: 1,
    config: {
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      sdpSemantics: "unified-plan",
    },
  };
}

function secureRandomValues(length) {
  if (!globalThis.crypto?.getRandomValues) return null;
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

function createMatchStartId() {
  const values = secureRandomValues(8);
  if (values) {
    return [...values].map((value) => value.toString(16).padStart(2, "0")).join("");
  }
  const id = fallbackMatchStartId;
  fallbackMatchStartId += 1;
  return `${Date.now().toString(36)}-${id.toString(36)}`;
}

function validMatchStartId(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 64;
}

function requirePeerConstructor(PeerConstructor) {
  if (typeof PeerConstructor !== "function") {
    throw new Error("The lobby service could not load. Check your connection and try again.");
  }
}

function waitForPeerOpen(peer, timeoutMs = PEER_OPEN_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error("The lobby service timed out.")), timeoutMs);
    const onOpen = (id) => finish(null, id);
    const onError = (error) => finish(error);
    peer.on("open", onOpen);
    peer.on("error", onError);

    function finish(error, id = null) {
      clearTimeout(timeout);
      peer.off?.("open", onOpen);
      peer.off?.("error", onError);
      if (error) reject(error);
      else resolve(id);
    }
  });
}

function friendlyPeerError(error) {
  if (typeof error === "string") return error;
  switch (error?.type) {
    case "peer-unavailable":
      return "That lobby was not found. Check the code and make sure the host is still waiting.";
    case "unavailable-id":
      return "That lobby code is already in use.";
    case "browser-incompatible":
      return "This browser does not support multiplayer connections.";
    case "network":
    case "server-error":
    case "socket-error":
    case "socket-closed":
      return "The lobby service could not be reached. Check your connection and try again.";
    case "webrtc":
      return "The direct player connection failed. Try again or use a different network.";
    default:
      return error?.message || "Could not establish the multiplayer connection.";
  }
}
