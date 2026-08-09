export const MULTIPLAYER_STATE_INTERVAL_SECONDS = 0.25;
export const MULTIPLAYER_MOTION_INTERVAL_SECONDS = 1 / 15;
export const GUEST_STATE_TRANSITION_MS = 120;
const SIMULATION_TICKS_PER_SECOND = 30;

export class SnapshotPositionSmoother {
  constructor(transitionMs = GUEST_STATE_TRANSITION_MS) {
    if (!Number.isFinite(transitionMs) || transitionMs < 0) {
      throw new Error("Network position transition must be non-negative.");
    }
    this.transitionMs = transitionMs;
    this.transitions = new Map();
    this.latestSourceTick = null;
  }

  reset(entities = [], nowMs = 0, sourceTick = null) {
    const normalizedTick = validSourceTick(sourceTick) ? sourceTick : null;
    this.latestSourceTick = normalizedTick;
    this.transitions = new Map(
      entities
        .filter(hasPosition)
        .map((entity) => [entity.id, {
          fromX: entity.x,
          fromY: entity.y,
          fromVelocityX: 0,
          fromVelocityY: 0,
          toX: entity.x,
          toY: entity.y,
          toVelocityX: 0,
          toVelocityY: 0,
          startedAt: nowMs,
          authoritativeX: entity.x,
          authoritativeY: entity.y,
          sourceTick: normalizedTick,
        }]),
    );
  }

  transitionTo(entities, nowMs, sourceTick = null) {
    const normalizedTick = validSourceTick(sourceTick) ? sourceTick : null;
    if (
      normalizedTick !== null &&
      this.latestSourceTick !== null &&
      normalizedTick <= this.latestSourceTick
    ) {
      return false;
    }

    const nextIds = new Set();
    for (const entity of entities) {
      if (!hasPosition(entity)) continue;
      nextIds.add(entity.id);
      const previous = this.transitions.get(entity.id);
      const current = this.motionFor(entity, nowMs);
      const elapsedSourceSeconds =
        normalizedTick !== null &&
        validSourceTick(previous?.sourceTick) &&
        normalizedTick > previous.sourceTick
          ? (normalizedTick - previous.sourceTick) / SIMULATION_TICKS_PER_SECOND
          : 0;
      const targetVelocityX = elapsedSourceSeconds > 0
        ? (entity.x - previous.authoritativeX) / elapsedSourceSeconds
        : 0;
      const targetVelocityY = elapsedSourceSeconds > 0
        ? (entity.y - previous.authoritativeY) / elapsedSourceSeconds
        : 0;
      const transitionSeconds = this.transitionMs / 1000;
      this.transitions.set(entity.id, {
        fromX: current.x,
        fromY: current.y,
        fromVelocityX: current.velocityX,
        fromVelocityY: current.velocityY,
        toX: entity.x + targetVelocityX * transitionSeconds,
        toY: entity.y + targetVelocityY * transitionSeconds,
        toVelocityX: targetVelocityX,
        toVelocityY: targetVelocityY,
        startedAt: nowMs,
        authoritativeX: entity.x,
        authoritativeY: entity.y,
        sourceTick: normalizedTick,
      });
    }
    for (const id of this.transitions.keys()) {
      if (!nextIds.has(id)) this.transitions.delete(id);
    }
    if (normalizedTick !== null) this.latestSourceTick = normalizedTick;
    return true;
  }

  positionFor(entity, nowMs) {
    const motion = this.motionFor(entity, nowMs);
    return { x: motion.x, y: motion.y };
  }

  motionFor(entity, nowMs) {
    const transition = entity?.id ? this.transitions.get(entity.id) : null;
    if (!transition || this.transitionMs <= 0) {
      return { x: entity.x, y: entity.y, velocityX: 0, velocityY: 0 };
    }
    const progress = Math.min(
      1,
      Math.max(0, (nowMs - transition.startedAt) / this.transitionMs),
    );
    const progressSquared = progress * progress;
    const progressCubed = progressSquared * progress;
    const positionStart = 2 * progressCubed - 3 * progressSquared + 1;
    const velocityStart = progressCubed - 2 * progressSquared + progress;
    const positionEnd = -2 * progressCubed + 3 * progressSquared;
    const velocityEnd = progressCubed - progressSquared;
    const transitionSeconds = this.transitionMs / 1000;
    const derivativeStart = 6 * progressSquared - 6 * progress;
    const derivativeVelocityStart = 3 * progressSquared - 4 * progress + 1;
    const derivativeEnd = -derivativeStart;
    const derivativeVelocityEnd = 3 * progressSquared - 2 * progress;
    const interpolate = (from, fromVelocity, to, toVelocity) => ({
      position:
        positionStart * from +
        velocityStart * transitionSeconds * fromVelocity +
        positionEnd * to +
        velocityEnd * transitionSeconds * toVelocity,
      velocity:
        derivativeStart * from / transitionSeconds +
        derivativeVelocityStart * fromVelocity +
        derivativeEnd * to / transitionSeconds +
        derivativeVelocityEnd * toVelocity,
    });
    const x = interpolate(
      transition.fromX,
      transition.fromVelocityX,
      transition.toX,
      transition.toVelocityX,
    );
    const y = interpolate(
      transition.fromY,
      transition.fromVelocityY,
      transition.toY,
      transition.toVelocityY,
    );
    return {
      x: x.position,
      y: y.position,
      velocityX: x.velocity,
      velocityY: y.velocity,
    };
  }
}

export function createMultiplayerMotionUpdate(tick, entities = []) {
  return {
    type: "motion",
    tick,
    entities: entities
      .filter(hasPosition)
      .map((entity) => ({ id: entity.id, x: entity.x, y: entity.y })),
  };
}

export function multiplayerMotionUpdateIsValid(message) {
  if (
    message?.type !== "motion" ||
    !validSourceTick(message.tick) ||
    !Array.isArray(message.entities)
  ) {
    return false;
  }
  const ids = new Set();
  for (const entity of message.entities) {
    if (!hasPosition(entity) || ids.has(entity.id)) return false;
    ids.add(entity.id);
  }
  return true;
}

export function resolveAttackEventTargetPosition(
  event,
  trackedTarget = null,
  presentedTargetPosition = trackedTarget,
) {
  if (
    event?.tracksTarget &&
    trackedTarget?.alive &&
    Number.isFinite(presentedTargetPosition?.x) &&
    Number.isFinite(presentedTargetPosition?.y)
  ) {
    return {
      x: presentedTargetPosition.x,
      y: presentedTargetPosition.y,
    };
  }
  if (
    event?.tracksTarget &&
    !trackedTarget?.alive &&
    Number.isFinite(trackedTarget?.destroyedAtX) &&
    Number.isFinite(trackedTarget?.destroyedAtY)
  ) {
    return {
      x: trackedTarget.destroyedAtX,
      y: trackedTarget.destroyedAtY,
    };
  }
  return {
    x: event?.targetX ?? event?.x,
    y: event?.targetY ?? event?.y,
  };
}

function hasPosition(entity) {
  return Boolean(
    entity?.id &&
    Number.isFinite(entity.x) &&
    Number.isFinite(entity.y),
  );
}

function validSourceTick(tick) {
  return Number.isSafeInteger(tick) && tick >= 0;
}
