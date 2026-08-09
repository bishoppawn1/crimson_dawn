export function movementOrderDestinations(unit) {
  if (!unit?.moveTarget) return [];

  if (unit.patrolRoute?.length >= 2) {
    const startIndex = Number.isSafeInteger(unit.patrolIndex) &&
      unit.patrolIndex >= 0 && unit.patrolIndex < unit.patrolRoute.length
      ? unit.patrolIndex
      : 0;
    return unit.patrolRoute.map((_, offset) => {
      const point = unit.patrolRoute[(startIndex + offset) % unit.patrolRoute.length];
      return { x: point.x, y: point.y };
    });
  }

  const queuedDestinations = Array.isArray(unit.moveQueue) ? unit.moveQueue : [];
  return [unit.moveTarget, ...queuedDestinations].map(({ x, y }) => ({ x, y }));
}

export function movementOrderLoops(unit) {
  return Boolean(unit?.moveTarget && unit.patrolRoute?.length >= 2);
}
