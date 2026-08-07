export const SIMULATION_TICKS_PER_SECOND = 30;
export const SIMULATION_STEP_SECONDS = 1 / SIMULATION_TICKS_PER_SECOND;

export class DeterministicCommandScheduler {
  constructor() {
    this.pending = [];
    this.nextInsertionOrder = 1;
  }

  clear() {
    this.pending = [];
    this.nextInsertionOrder = 1;
  }

  enqueue({ executeTick, playerSlot, sequence, team, command, metadata = null }) {
    if (!Number.isSafeInteger(executeTick) || executeTick < 1) return false;
    if (!Number.isSafeInteger(playerSlot) || playerSlot < 0) return false;
    if (!Number.isSafeInteger(sequence) || sequence < 1) return false;
    if (!team || !command || typeof command.type !== "string") return false;

    this.pending.push({
      executeTick,
      playerSlot,
      sequence,
      team,
      command: cloneJsonValue(command),
      metadata,
      insertionOrder: this.nextInsertionOrder,
    });
    this.nextInsertionOrder += 1;
    return true;
  }

  drain(executeThroughTick, apply) {
    if (!Number.isSafeInteger(executeThroughTick) || typeof apply !== "function") return [];
    const ready = [];
    const waiting = [];
    for (const entry of this.pending) {
      if (entry.executeTick <= executeThroughTick) ready.push(entry);
      else waiting.push(entry);
    }
    this.pending = waiting;
    ready.sort(
      (left, right) =>
        left.executeTick - right.executeTick ||
        left.playerSlot - right.playerSlot ||
        left.sequence - right.sequence ||
        left.insertionOrder - right.insertionOrder,
    );
    return ready.map((entry) => ({ entry, result: apply(entry) }));
  }
}

export function deterministicStateHash(snapshot) {
  const serialized = stableSerialize(snapshot);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${unsignedHex(first)}${unsignedHex(second)}`;
}

export function createDeterministicStateMessage({
  sequence,
  lastGuestCommandId,
  snapshot,
}) {
  const detachedSnapshot = cloneJsonValue(snapshot);
  return {
    type: "state",
    sequence,
    tick: detachedSnapshot.tickNumber,
    lastGuestCommandId,
    stateHash: deterministicStateHash(detachedSnapshot),
    snapshot: detachedSnapshot,
  };
}

export function deterministicStateMessageIsValid(message) {
  if (!message?.snapshot || typeof message.stateHash !== "string") return false;
  if (
    Number.isSafeInteger(message.tick) &&
    message.tick !== message.snapshot.tickNumber
  ) {
    return false;
  }
  return deterministicStateHash(message.snapshot) === message.stateHash;
}

function stableSerialize(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? JSON.stringify(value) : "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const fields = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`);
    return `{${fields.join(",")}}`;
  }
  return "null";
}

function cloneJsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function unsignedHex(value) {
  return (value >>> 0).toString(16).padStart(8, "0");
}
