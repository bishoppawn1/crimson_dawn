export const MULTIPLAYER_STATE_INTERVAL_SECONDS = 0.25;
export const GUEST_STATE_TRANSITION_MS = 320;

export class SnapshotPositionSmoother {
  constructor(transitionMs = GUEST_STATE_TRANSITION_MS) {
    if (!Number.isFinite(transitionMs) || transitionMs < 0) {
      throw new Error("Network position transition must be non-negative.");
    }
    this.transitionMs = transitionMs;
    this.transitions = new Map();
  }

  reset(entities = [], nowMs = 0) {
    this.transitions = new Map(
      entities
        .filter(hasPosition)
        .map((entity) => [entity.id, {
          fromX: entity.x,
          fromY: entity.y,
          toX: entity.x,
          toY: entity.y,
          startedAt: nowMs,
        }]),
    );
  }

  transitionTo(entities, nowMs) {
    const nextIds = new Set();
    for (const entity of entities) {
      if (!hasPosition(entity)) continue;
      nextIds.add(entity.id);
      const current = this.positionFor(entity, nowMs);
      this.transitions.set(entity.id, {
        fromX: current.x,
        fromY: current.y,
        toX: entity.x,
        toY: entity.y,
        startedAt: nowMs,
      });
    }
    for (const id of this.transitions.keys()) {
      if (!nextIds.has(id)) this.transitions.delete(id);
    }
  }

  positionFor(entity, nowMs) {
    const transition = entity?.id ? this.transitions.get(entity.id) : null;
    if (!transition || this.transitionMs <= 0) {
      return { x: entity.x, y: entity.y };
    }
    const progress = Math.min(
      1,
      Math.max(0, (nowMs - transition.startedAt) / this.transitionMs),
    );
    return {
      x: transition.fromX + (transition.toX - transition.fromX) * progress,
      y: transition.fromY + (transition.toY - transition.fromY) * progress,
    };
  }
}

function hasPosition(entity) {
  return Boolean(
    entity?.id &&
    Number.isFinite(entity.x) &&
    Number.isFinite(entity.y),
  );
}
