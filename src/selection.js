export const LOCAL_TYPE_SELECTION_RADIUS = 700;

export function selectableUnitIdsByExactTypeNear(
  units,
  { team, type, x, y, radius = LOCAL_TYPE_SELECTION_RADIUS } = {},
) {
  if (
    !team ||
    !type ||
    !Array.isArray(units) ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(radius) ||
    radius < 0
  ) return [];
  const radiusSquared = radius * radius;
  return units
    .filter(
      (unit) =>
        unit?.alive &&
        !unit.carriedById &&
        unit.team === team &&
        unit.type === type &&
        (unit.x - x) ** 2 + (unit.y - y) ** 2 <= radiusSquared,
    )
    .map((unit) => unit.id);
}
