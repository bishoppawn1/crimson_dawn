export function movementOrderDestinations(unit) {
  if (!unit?.moveTarget) return [];

  const queuedDestinations = Array.isArray(unit.moveQueue) ? unit.moveQueue : [];
  return [unit.moveTarget, ...queuedDestinations].map(({ x, y }) => ({ x, y }));
}
