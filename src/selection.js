export function selectableUnitIdsByExactType(units, { team, type } = {}) {
  if (!team || !type || !Array.isArray(units)) return [];
  return units
    .filter(
      (unit) =>
        unit?.alive &&
        !unit.carriedById &&
        unit.team === team &&
        unit.type === type,
    )
    .map((unit) => unit.id);
}
