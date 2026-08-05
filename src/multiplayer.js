const LOBBY_CODE_LENGTH = 10;
const LOBBY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
const MAX_BUFFERED_BYTES = 2 * 1024 * 1024;
const PEER_OPEN_TIMEOUT_MS = 12_000;
const GUEST_CONNECTION_TIMEOUT_MS = 15_000;
const MAX_CODE_ATTEMPTS = 5;

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

    peer.on("error", (error) => {
      if (this.closed) return;
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
      serialization: "json",
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
      let serialized;
      try {
        serialized = JSON.stringify(message);
      } catch {
        return;
      }
      if (serialized.length > MAX_MESSAGE_BYTES) return;
      this.handlers.onMessage?.(message);
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
    const bufferedAmount = this.connection?.dataChannel?.bufferedAmount || 0;
    if (
      this.closed ||
      !this.connection?.open ||
      bufferedAmount > MAX_BUFFERED_BYTES
    ) {
      return false;
    }
    this.connection.send(message);
    return true;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.connectionTimeout);
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
