import assert from "node:assert/strict";
import test from "node:test";

import { PeerMultiplayerSession } from "../src/multiplayer.js";

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
  constructor() {
    super();
    this.open = false;
    this.dataChannel = { bufferedAmount: 0 };
    this.remote = null;
  }

  send(message) {
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

  connect(id) {
    const local = new FakeConnection();
    const remote = new FakeConnection();
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

