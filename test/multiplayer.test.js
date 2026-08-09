import assert from "node:assert/strict";
import test from "node:test";

import { MatchStartHandshake, PeerMultiplayerSession } from "../src/multiplayer.js";
import { Simulation } from "../src/simulation.js";

const FAKE_JSON_CHANNEL_LIMIT = 16 * 1024;

class FakeEmitter {
  constructor() {
    this.listeners = new Map();
  }

  on(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  off(type, listener) {
    this.listeners.set(
      type,
      (this.listeners.get(type) || []).filter((candidate) => candidate !== listener),
    );
  }

  emit(type, value) {
    for (const listener of this.listeners.get(type) || []) listener(value);
  }
}

class FakeConnection extends FakeEmitter {
  constructor(serialization = "binary") {
    super();
    this.open = false;
    this.dataChannel = { bufferedAmount: 0 };
    this.remote = null;
    this.serialization = serialization;
  }

  send(message) {
    const messageBytes = new TextEncoder().encode(JSON.stringify(message)).byteLength;
    if (this.serialization === "json" && messageBytes > FAKE_JSON_CHANNEL_LIMIT) {
      throw new Error("Message too big for JSON channel");
    }
    queueMicrotask(() => this.remote.emit("data", message));
  }

  close() {
    this.open = false;
  }
}

class FakePeer extends FakeEmitter {
  static peers = new Map();
  static nextGuest = 1;

  constructor(id) {
    super();
    this.id = id || `guest-${FakePeer.nextGuest++}`;
    this.destroyed = false;
    if (FakePeer.peers.has(this.id)) {
      queueMicrotask(() => this.emit("error", { type: "unavailable-id" }));
      return;
    }
    FakePeer.peers.set(this.id, this);
    queueMicrotask(() => this.emit("open", this.id));
  }

  connect(id, options = {}) {
    const serialization = options.serialization || "binary";
    const local = new FakeConnection(serialization);
    const remote = new FakeConnection(serialization);
    local.remote = remote;
    remote.remote = local;
    const target = FakePeer.peers.get(id);
    queueMicrotask(() => {
      if (!target) {
        this.emit("error", { type: "peer-unavailable" });
        return;
      }
      target.emit("connection", remote);
      queueMicrotask(() => {
        local.open = true;
        remote.open = true;
        local.emit("open");
        remote.emit("open");
      });
    });
    return local;
  }

  destroy() {
    this.destroyed = true;
    FakePeer.peers.delete(this.id);
  }
}

test("host and guest connect through one short lobby code and exchange game messages", async () => {
  FakePeer.peers.clear();
  let hostOpened = false;
  let guestOpened = false;
  let hostMessage = null;
  let guestMessage = null;
  const host = await PeerMultiplayerSession.createHost(
    {
      onOpen: () => { hostOpened = true; },
      onMessage: (message) => { hostMessage = message; },
    },
    { PeerConstructor: FakePeer, codeFactory: () => "AB12CD34EF" },
  );
  const guest = await PeerMultiplayerSession.createGuest(
    "ab12-cd34-ef",
    {
      onOpen: () => { guestOpened = true; },
      onMessage: (message) => { guestMessage = message; },
    },
    { PeerConstructor: FakePeer },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(host.lobbyCode, "AB12CD34EF");
  assert.equal(guest.lobbyCode, "AB12CD34EF");
  assert.equal(hostOpened, true);
  assert.equal(guestOpened, true);

  assert.equal(host.session.send({ type: "state", tick: 42 }), true);
  assert.equal(guest.session.send({ type: "command", command: "move" }), true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(guestMessage, { type: "state", tick: 42 });
  assert.deepEqual(hostMessage, { type: "command", command: "move" });

  host.session.close();
  guest.session.close();
});

test("a host can broadcast Spawn Wars state to three independently addressed guests", async () => {
  FakePeer.peers.clear();
  const openedIds = [];
  const hostMessages = [];
  const host = await PeerMultiplayerSession.createHost(
    {
      onOpen: (connectionId) => openedIds.push(connectionId),
      onMessage: (message, connectionId) => hostMessages.push({ message, connectionId }),
    },
    {
      PeerConstructor: FakePeer,
      codeFactory: () => "SW12AB34CD",
      maximumConnections: 3,
    },
  );
  const guests = await Promise.all(Array.from({ length: 3 }, () => (
    PeerMultiplayerSession.createGuest("SW12AB34CD", {}, { PeerConstructor: FakePeer })
  )));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(host.session.openConnectionCount(), 3);
  assert.equal(openedIds.length, 3);
  assert.equal(host.session.send({ type: "lobby_state", players: 4 }), true);
  assert.equal(host.session.send({ type: "private", slot: 2 }, openedIds[1]), true);
  guests[2].session.send({ type: "command", commandId: 1 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(hostMessages.length, 1);
  assert.equal(hostMessages[0].connectionId, openedIds[2]);

  host.session.close();
  for (const guest of guests) guest.session.close();
});

test("the host enters only after the guest loads and acknowledges the match start", async () => {
  FakePeer.peers.clear();
  let hostEntered = false;
  let guestEntered = false;
  const hostHandshake = new MatchStartHandshake("host", {
    idFactory: () => "test-match-start",
  });
  const guestHandshake = new MatchStartHandshake("guest");
  let hostSession;
  let guestSession;

  const host = await PeerMultiplayerSession.createHost(
    {
      onMessage: (message) => {
        const event = hostHandshake.inspect(message);
        if (event?.kind === "acknowledged") hostEntered = true;
      },
    },
    { PeerConstructor: FakePeer, codeFactory: () => "CD12EF34GH" },
  );
  hostSession = host.session;
  const guest = await PeerMultiplayerSession.createGuest(
    "CD12EF34GH",
    {
      onMessage: (message) => {
        const event = guestHandshake.inspect(message);
        if (event?.kind !== "offered") return;
        assert.deepEqual(event.snapshot, { mapId: "test-map", tick: 0 });
        guestEntered = true;
        guestSession.send(guestHandshake.accept(event.startId));
      },
    },
    { PeerConstructor: FakePeer },
  );
  guestSession = guest.session;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(hostSession.send(hostHandshake.begin({ mapId: "test-map", tick: 0 })), true);
  assert.equal(hostEntered, false);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(guestEntered, true);
  assert.equal(hostEntered, true);
  assert.equal(hostHandshake.waiting, false);

  hostSession.close();
  guestSession.close();
});

test("match starts are retried and time out without admitting the host alone", () => {
  let now = 1_000;
  const handshake = new MatchStartHandshake("host", {
    now: () => now,
    idFactory: () => "retry-test",
  });
  const start = handshake.begin({ mapId: "test-map" });

  now += 749;
  assert.equal(handshake.poll(), null);
  now += 1;
  assert.deepEqual(handshake.poll(), { kind: "retry", message: start });
  now = 13_000;
  assert.deepEqual(handshake.poll(), { kind: "timeout" });
  assert.equal(handshake.waiting, false);
});

test("host state backpressure keeps only the newest unsent snapshot", async () => {
  FakePeer.peers.clear();
  const guestMessages = [];
  const host = await PeerMultiplayerSession.createHost(
    {},
    { PeerConstructor: FakePeer, codeFactory: () => "GH56JK78LM" },
  );
  const guest = await PeerMultiplayerSession.createGuest(
    "GH56JK78LM",
    { onMessage: (message) => guestMessages.push(message) },
    { PeerConstructor: FakePeer },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  host.session.connection.dataChannel.bufferedAmount = 128 * 1024;
  assert.equal(host.session.sendState({ type: "state", sequence: 1 }), true);
  assert.equal(host.session.sendState({ type: "state", sequence: 2 }), true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(guestMessages, []);

  host.session.connection.dataChannel.bufferedAmount = 0;
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(guestMessages, [{ type: "state", sequence: 2 }]);

  host.session.close();
  guest.session.close();
});

test("host state delivery keeps one snapshot in flight until the guest acknowledges it", async () => {
  FakePeer.peers.clear();
  const guestStates = [];
  const host = await PeerMultiplayerSession.createHost(
    {},
    { PeerConstructor: FakePeer, codeFactory: () => "ZA12BC34DE" },
  );
  const guest = await PeerMultiplayerSession.createGuest(
    "ZA12BC34DE",
    {
      onMessage: (message) => {
        if (message.type === "state") guestStates.push(message.sequence);
      },
    },
    { PeerConstructor: FakePeer },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(host.session.sendState({ type: "state", sequence: 1 }), true);
  for (let sequence = 2; sequence <= 300; sequence += 1) {
    assert.equal(host.session.sendState({ type: "state", sequence }), true);
  }
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(guestStates, [1]);
  assert.equal(host.session.stateInFlightSequence, 1);
  assert.equal(host.session.pendingState.sequence, 300);

  assert.equal(guest.session.send({ type: "state_ack", sequence: 1 }), true);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(guestStates, [1, 300]);
  assert.equal(host.session.stateInFlightSequence, 300);
  assert.equal(host.session.pendingState, null);

  guest.session.send({ type: "state_ack", sequence: 300 });
  host.session.close();
  guest.session.close();
});

test("transient motion updates yield to a waiting canonical snapshot", async () => {
  FakePeer.peers.clear();
  const guestMessages = [];
  const host = await PeerMultiplayerSession.createHost(
    {},
    { PeerConstructor: FakePeer, codeFactory: () => "MN12PQ34RS" },
  );
  const guest = await PeerMultiplayerSession.createGuest(
    "MN12PQ34RS",
    { onMessage: (message) => guestMessages.push(message) },
    { PeerConstructor: FakePeer },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(host.session.sendState({ type: "state", sequence: 1 }), true);
  assert.equal(host.session.sendState({ type: "state", sequence: 2 }), true);
  assert.equal(host.session.sendMotion({ type: "motion", tick: 3, entities: [] }), false);
  assert.equal(guest.session.send({ type: "state_ack", sequence: 1 }), true);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(host.session.sendMotion({ type: "motion", tick: 4, entities: [] }), true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(guestMessages, [
    { type: "state", sequence: 1 },
    { type: "state", sequence: 2 },
    { type: "motion", tick: 4, entities: [] },
  ]);

  guest.session.send({ type: "state_ack", sequence: 2 });
  host.session.close();
  guest.session.close();
});

test("a signaling broker error does not close an established direct match", async () => {
  FakePeer.peers.clear();
  let hostClosed = false;
  let guestMessage = null;
  const host = await PeerMultiplayerSession.createHost(
    { onClose: () => { hostClosed = true; } },
    { PeerConstructor: FakePeer, codeFactory: () => "FG12HJ34KL" },
  );
  const guest = await PeerMultiplayerSession.createGuest(
    "FG12HJ34KL",
    { onMessage: (message) => { guestMessage = message; } },
    { PeerConstructor: FakePeer },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  host.session.peer.emit("error", { type: "socket-closed" });

  assert.equal(hostClosed, false);
  assert.equal(host.session.opened, true);
  assert.equal(host.session.send({ type: "command_result", commandId: 9 }), true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(guestMessage, { type: "command_result", commandId: 9 });

  host.session.close();
  guest.session.close();
});

test("a large four-player match setup is chunkable and acknowledged without a retry delay", async () => {
  FakePeer.peers.clear();
  const snapshot = Simulation.createFieldTest({
    enemyAiEnabled: true,
    playerCount: 4,
  }).createSnapshot();
  const hostHandshake = new MatchStartHandshake("host", {
    idFactory: () => "large-match-start",
  });
  const guestHandshake = new MatchStartHandshake("guest");
  let hostAcknowledged = false;
  let guestLoaded = false;
  let guestSession;

  const host = await PeerMultiplayerSession.createHost(
    {
      onMessage: (message) => {
        if (hostHandshake.inspect(message)?.kind === "acknowledged") {
          hostAcknowledged = true;
        }
      },
    },
    { PeerConstructor: FakePeer, codeFactory: () => "UV12WX34YZ" },
  );
  const guest = await PeerMultiplayerSession.createGuest(
    "UV12WX34YZ",
    {
      onMessage: (message) => {
        const event = guestHandshake.inspect(message);
        if (event?.kind !== "offered") return;
        const restored = Simulation.fromSnapshot(event.snapshot);
        guestLoaded = restored.teams.length === 4;
        guestSession.send(guestHandshake.accept(event.startId));
      },
    },
    { PeerConstructor: FakePeer },
  );
  guestSession = guest.session;
  await new Promise((resolve) => setTimeout(resolve, 0));

  const startMessage = hostHandshake.begin(snapshot);
  const startBytes = new TextEncoder().encode(JSON.stringify(startMessage)).byteLength;
  assert.ok(startBytes > FAKE_JSON_CHANNEL_LIMIT);
  assert.equal(host.session.connection.serialization, "binary");
  assert.equal(host.session.send(startMessage), true);
  assert.equal(hostAcknowledged, false);

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(guestLoaded, true);
  assert.equal(hostAcknowledged, true);
  assert.equal(hostHandshake.waiting, false);

  host.session.close();
  guest.session.close();
});

test("a data-channel send failure is reported without escaping into the game loop", async () => {
  FakePeer.peers.clear();
  let reportedError = null;
  const host = await PeerMultiplayerSession.createHost(
    { onError: (message) => { reportedError = message; } },
    { PeerConstructor: FakePeer, codeFactory: () => "NP34QR56ST" },
  );
  const guest = await PeerMultiplayerSession.createGuest(
    "NP34QR56ST",
    {},
    { PeerConstructor: FakePeer },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  host.session.connection.send = () => {
    throw new Error("Data channel closed during send.");
  };

  assert.doesNotThrow(() => {
    assert.equal(host.session.send({ type: "state", sequence: 1 }), false);
  });
  assert.equal(reportedError, "Data channel closed during send.");

  host.session.close();
  guest.session.close();
});
