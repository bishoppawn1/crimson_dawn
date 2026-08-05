const SESSION_CODE_VERSION = 1;
const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
const MAX_BUFFERED_BYTES = 2 * 1024 * 1024;

export function encodeSessionDescription(description, roomId = null) {
  const payload = JSON.stringify({
    version: SESSION_CODE_VERSION,
    type: description.type,
    sdp: description.sdp,
    roomId,
  });
  const bytes = new TextEncoder().encode(payload);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodeSessionDescription(code, expectedType) {
  const normalized = String(code || "").trim().replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  let payload;
  try {
    const binary = atob(normalized + padding);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("That connection code is not valid.");
  }
  if (
    payload?.version !== SESSION_CODE_VERSION ||
    payload.type !== expectedType ||
    typeof payload.sdp !== "string" ||
    !payload.sdp
  ) {
    throw new Error(`Expected a valid ${expectedType} connection code.`);
  }
  return { type: payload.type, sdp: payload.sdp, roomId: payload.roomId || null };
}

export class PeerMultiplayerSession {
  constructor(role, handlers = {}) {
    this.role = role;
    this.handlers = handlers;
    this.connection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    this.channel = null;
    this.localChannel = null;
    this.localConnected = false;
    this.localReady = false;
    this.opened = false;
    this.roomId = null;
    this.sessionId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    this.closed = false;
    this.connection.addEventListener("connectionstatechange", () => {
      const state = this.connection.connectionState;
      if (state === "failed" || state === "disconnected" || state === "closed") {
        this.handlers.onClose?.(state);
      }
    });
  }

  static async createHost(handlers = {}) {
    const session = new PeerMultiplayerSession("host", handlers);
    session.roomId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    session.attachLocalChannel();
    session.attachChannel(session.connection.createDataChannel("crimson-dawn", { ordered: true }));
    const offer = await session.connection.createOffer();
    await session.connection.setLocalDescription(offer);
    await waitForIceGathering(session.connection);
    return {
      session,
      offerCode: encodeSessionDescription(session.connection.localDescription, session.roomId),
    };
  }

  static async createGuest(offerCode, handlers = {}) {
    const session = new PeerMultiplayerSession("guest", handlers);
    const offer = decodeSessionDescription(offerCode, "offer");
    session.roomId = offer.roomId;
    session.localReady = true;
    session.attachLocalChannel();
    session.connection.addEventListener("datachannel", (event) => session.attachChannel(event.channel), {
      once: true,
    });
    await session.connection.setRemoteDescription({ type: offer.type, sdp: offer.sdp });
    const answer = await session.connection.createAnswer();
    await session.connection.setLocalDescription(answer);
    await waitForIceGathering(session.connection);
    return {
      session,
      answerCode: encodeSessionDescription(session.connection.localDescription, session.roomId),
    };
  }

  async acceptAnswer(answerCode) {
    if (this.role !== "host") throw new Error("Only the host can accept an answer code.");
    const answer = decodeSessionDescription(answerCode, "answer");
    if (!answer.roomId || answer.roomId !== this.roomId) {
      throw new Error("That answer belongs to a different host offer.");
    }
    await this.connection.setRemoteDescription({ type: answer.type, sdp: answer.sdp });
    this.localReady = true;
    this.announceLocalPresence();
  }

  attachChannel(channel) {
    this.channel = channel;
    channel.addEventListener("open", () => this.markOpen());
    channel.addEventListener("close", () => this.handlers.onClose?.("closed"));
    channel.addEventListener("message", (event) => {
      if (typeof event.data !== "string" || event.data.length > MAX_MESSAGE_BYTES) return;
      try {
        const message = JSON.parse(event.data);
        if (message && typeof message.type === "string") this.handlers.onMessage?.(message);
      } catch {
        // Ignore malformed peer messages. The host validates every command.
      }
    });
  }

  attachLocalChannel() {
    if (!this.roomId || typeof BroadcastChannel === "undefined") return;
    this.localChannel = new BroadcastChannel(`crimson-dawn-${this.roomId}`);
    this.localChannel.addEventListener("message", (event) => {
      const envelope = event.data;
      if (
        !envelope ||
        envelope.senderId === this.sessionId ||
        envelope.role === this.role
      ) {
        return;
      }
      if (envelope.type === "presence") {
        if (!this.localReady) return;
        this.localConnected = true;
        this.markOpen();
        if (!envelope.acknowledged) this.announceLocalPresence(true);
        return;
      }
      if (envelope.type === "message" && this.localReady) {
        const message = envelope.message;
        if (message && typeof message.type === "string") this.handlers.onMessage?.(message);
      }
    });
    this.announceLocalPresence();
  }

  announceLocalPresence(acknowledged = false) {
    if (!this.localReady || !this.localChannel) return;
    this.localChannel.postMessage({
      type: "presence",
      role: this.role,
      senderId: this.sessionId,
      acknowledged,
    });
  }

  markOpen() {
    if (this.opened) return;
    this.opened = true;
    this.handlers.onOpen?.();
  }

  send(message) {
    if (!this.closed && this.localReady && this.localChannel) {
      this.localChannel.postMessage({
        type: "message",
        role: this.role,
        senderId: this.sessionId,
        message,
      });
      return true;
    }
    if (
      this.closed ||
      this.channel?.readyState !== "open" ||
      this.channel.bufferedAmount > MAX_BUFFERED_BYTES
    ) {
      return false;
    }
    this.channel.send(JSON.stringify(message));
    return true;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.channel?.close();
    this.localChannel?.close();
    this.connection.close();
  }
}

function waitForIceGathering(connection, timeoutMs = 8000) {
  if (connection.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(finish, timeoutMs);
    connection.addEventListener("icegatheringstatechange", checkState);
    function checkState() {
      if (connection.iceGatheringState === "complete") finish();
    }
    function finish() {
      clearTimeout(timeout);
      connection.removeEventListener("icegatheringstatechange", checkState);
      resolve();
    }
  });
}
