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
    this.connections = new Map();
    this.connectionStates = new Map();
    this.maximumConnections = 1;
    this.opened = false;
    this.closed = false;
    this.lobbyCode = null;
    this.connectionTimeout = null;
    Object.defineProperties(this, {
      pendingState: {
        configurable: true,
        get: () => this.connectionStates.values().next().value?.pendingState ?? null,
      },
      stateInFlightSequence: {
        configurable: true,
        get: () => this.connectionStates.values().next().value?.stateInFlightSequence ?? null,
      },
      stateFlushTimer: {
        configurable: true,
        get: () => this.connectionStates.values().next().value?.stateFlushTimer ?? null,
      },
    });

    peer.on("error", (error) => {
      if (this.closed) return;
      // PeerJS Cloud is only the signaling broker. Once the direct WebRTC data
      // channel is open, a broker/socket interruption must not end the match.
      if ([...this.connections.values()].some((connection) => connection.open)) return;
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
      session.maximumConnections = Math.max(1, Math.floor(options.maximumConnections || 1));
      peer.on("connection", (connection) => {
        if (session.connections.size >= session.maximumConnections && !session.closed) {
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
    const connectionId = String(connection.peer || `connection-${this.connections.size + 1}`);
    this.connections.set(connectionId, connection);
    this.connectionStates.set(connectionId, {
      pendingState: null,
      stateInFlightSequence: null,
      stateFlushTimer: null,
    });
    if (!this.connection) this.connection = connection;
    connection.on("open", () => this.markOpen(connectionId));
    connection.on("close", () => {
      const state = this.connectionStates.get(connectionId);
      clearTimeout(state?.stateFlushTimer);
      this.connectionStates.delete(connectionId);
      this.connections.delete(connectionId);
      this.connection = this.connections.values().next().value || null;
      this.opened = [...this.connections.values()].some((candidate) => candidate.open);
      if (this.closed) return;
      this.handlers.onClose?.("closed", connectionId, this.openConnectionCount());
    });
    connection.on("error", (error) => {
      if (!this.closed) this.handlers.onError?.(friendlyPeerError(error));
    });
    connection.on("data", (message) => {
      if (!message || typeof message.type !== "string") return;
      if (this.role === "host" && message.type === "state_ack") {
        this.acknowledgeState(message.sequence, connectionId);
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
        this.handlers.onMessage?.(message, connectionId);
      } catch (error) {
        this.handlers.onError?.(error?.message || "Could not process multiplayer data.");
      }
    });
  }

  markOpen(connectionId) {
    if (this.closed) return;
    clearTimeout(this.connectionTimeout);
    this.connectionTimeout = null;
    this.opened = true;
    this.handlers.onOpen?.(connectionId, this.openConnectionCount());
  }

  openConnectionCount() {
    return [...this.connections.values()].filter((connection) => connection.open).length;
  }

  send(message, connectionId = null) {
    const targets = this.targetConnections(connectionId);
    if (this.closed || targets.length === 0) return false;
    let sent = true;
    for (const [targetId, connection] of targets) {
      if (!connection.open || this.bufferedAmount(targetId) > MAX_BUFFERED_BYTES) {
        sent = false;
        continue;
      }
      sent = this.sendNow(message, targetId) && sent;
    }
    return sent;
  }

  sendState(message, connectionId = null) {
    if (this.closed || !Number.isSafeInteger(message?.sequence)) return false;
    const targets = this.targetConnections(connectionId);
    if (targets.length === 0) return false;
    for (const [targetId] of targets) {
      const state = this.connectionStates.get(targetId);
      if (!state) continue;
      if (
        state.stateInFlightSequence !== null ||
        state.pendingState ||
        this.stateChannelBusy(targetId)
      ) {
        state.pendingState = message;
        this.scheduleStateFlush(targetId);
        continue;
      }
      if (this.sendNow(message, targetId)) state.stateInFlightSequence = message.sequence;
    }
    return true;
  }

  sendMotion(message, connectionId = null) {
    if (message?.type !== "motion") return false;
    const targets = this.targetConnections(connectionId);
    let sent = targets.length > 0;
    for (const [targetId] of targets) {
      const state = this.connectionStates.get(targetId);
      if (state?.pendingState || this.stateChannelBusy(targetId)) {
        sent = false;
        continue;
      }
      sent = this.send(message, targetId) && sent;
    }
    return sent;
  }

  targetConnections(connectionId = null) {
    if (connectionId) {
      const connection = this.connections.get(connectionId);
      return connection ? [[connectionId, connection]] : [];
    }
    return [...this.connections.entries()];
  }

  bufferedAmount(connectionId = null) {
    const connection = connectionId ? this.connections.get(connectionId) : this.connection;
    return connection?.dataChannel?.bufferedAmount || 0;
  }

  stateChannelBusy(connectionId = null) {
    const connection = connectionId ? this.connections.get(connectionId) : this.connection;
    return (
      this.bufferedAmount(connectionId) > MAX_STATE_BUFFERED_BYTES ||
      (connection?.bufferSize || 0) > 0
    );
  }

  sendNow(message, connectionId = null) {
    const connection = connectionId ? this.connections.get(connectionId) : this.connection;
    if (!connection?.open) return false;
    try {
      connection.send(message);
      return true;
    } catch (error) {
      this.handlers.onError?.(friendlyPeerError(error));
      return false;
    }
  }

  scheduleStateFlush(connectionId) {
    const state = this.connectionStates.get(connectionId);
    if (!state || state.stateFlushTimer || this.closed) return;
    state.stateFlushTimer = setTimeout(() => {
      state.stateFlushTimer = null;
      this.flushPendingState(connectionId);
    }, STATE_FLUSH_RETRY_MS);
  }

  acknowledgeState(sequence, connectionId = null) {
    const targetId = connectionId || this.connections.keys().next().value;
    const state = this.connectionStates.get(targetId);
    if (
      !state ||
      state.stateInFlightSequence === null ||
      sequence !== state.stateInFlightSequence
    ) return false;
    state.stateInFlightSequence = null;
    this.flushPendingState(targetId);
    return true;
  }

  flushPendingState(connectionId) {
    const state = this.connectionStates.get(connectionId);
    const connection = this.connections.get(connectionId);
    if (this.closed || !state?.pendingState || state.stateInFlightSequence !== null) return;
    if (!connection?.open) {
      state.pendingState = null;
      return;
    }
    if (this.stateChannelBusy(connectionId)) {
      this.scheduleStateFlush(connectionId);
      return;
    }
    const message = state.pendingState;
    state.pendingState = null;
    if (this.sendNow(message, connectionId)) state.stateInFlightSequence = message.sequence;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.connectionTimeout);
    for (const state of this.connectionStates.values()) clearTimeout(state.stateFlushTimer);
    for (const connection of this.connections.values()) connection.close?.();
    this.connectionStates.clear();
    this.connections.clear();
    this.connection = null;
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
