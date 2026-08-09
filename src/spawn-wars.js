export const SPAWN_WARS_MIN_PLAYERS = 2;
export const SPAWN_WARS_MAX_PLAYERS = 4;

export const SPAWN_WARS_RULES = Object.freeze({
  mapWidth: 8400,
  mapHeight: 2000,
  centerX: 4200,
  centerCaptureHalfWidth: 120,
  incomeInterval: 30,
  baseIncome: 120,
  controlIncome: 60,
  startingCrystal: 650,
  commonMoveSpeed: 105,
  architectSpeed: 190,
  buildZoneInset: 240,
  buildZoneDepth: 900,
  killIncomeRatio: 0.2,
  minimumKillIncome: 8,
  padCostMultiplier: 2.5,
  padBuildTime: 6,
  maximumUpgradeLevel: 3,
  architectUpgradeCosts: Object.freeze([350, 800]),
  incomeUpgradeCosts: Object.freeze([450, 950, 1750]),
  incomeUpgradeMultiplier: 0.35,
});

export const SPAWN_PAD_UPGRADES = Object.freeze({
  health: Object.freeze({ label: "Integrity", baseMultiplier: 0.55 }),
  armor: Object.freeze({ label: "Armor", baseMultiplier: 0.65 }),
  damage: Object.freeze({ label: "Weapon Damage", baseMultiplier: 0.8 }),
  attack_speed: Object.freeze({ label: "Attack Speed", baseMultiplier: 0.75 }),
});

export function spawnWarsAllianceForSlot(slot, playerCount) {
  if (playerCount <= 2) return slot === 0 ? "spawn-west" : "spawn-east";
  return slot < 2 ? "spawn-west" : "spawn-east";
}

export function createSpawnWarsTeams(playerCount) {
  if (
    !Number.isSafeInteger(playerCount) ||
    playerCount < SPAWN_WARS_MIN_PLAYERS ||
    playerCount > SPAWN_WARS_MAX_PLAYERS
  ) {
    throw new RangeError("Spawn Wars requires two to four human players.");
  }
  return Object.freeze(Array.from({ length: playerCount }, (_, slot) => Object.freeze({
    id: slot === 0 ? "player" : slot === 1 ? "enemy" : `enemy-${slot}`,
    name: `Player ${slot + 1}`,
    kind: "human",
    slot,
    allianceId: spawnWarsAllianceForSlot(slot, playerCount),
  })));
}

export function spawnWarsSideForAlliance(allianceId) {
  return allianceId === "spawn-west" ? "west" : "east";
}

export function spawnWarsBuildZone(team, playerCount) {
  const side = spawnWarsSideForAlliance(team.allianceId);
  const alliedSlots = Array.from({ length: playerCount }, (_, slot) => slot)
    .filter((slot) => spawnWarsAllianceForSlot(slot, playerCount) === team.allianceId);
  const laneIndex = Math.max(0, alliedSlots.indexOf(team.slot));
  const laneHeight = SPAWN_WARS_RULES.mapHeight / alliedSlots.length;
  return Object.freeze({
    left: side === "west"
      ? SPAWN_WARS_RULES.buildZoneInset
      : SPAWN_WARS_RULES.mapWidth - SPAWN_WARS_RULES.buildZoneInset - SPAWN_WARS_RULES.buildZoneDepth,
    right: side === "west"
      ? SPAWN_WARS_RULES.buildZoneInset + SPAWN_WARS_RULES.buildZoneDepth
      : SPAWN_WARS_RULES.mapWidth - SPAWN_WARS_RULES.buildZoneInset,
    top: laneIndex * laneHeight + 120,
    bottom: (laneIndex + 1) * laneHeight - 120,
  });
}

export function spawnWarsPadCost(unitDefinition) {
  const tierMultiplier = 1 + Math.max(0, (unitDefinition?.tier || 1) - 1) * 0.35;
  return Math.max(80, Math.round((unitDefinition?.metalCost || 80) * SPAWN_WARS_RULES.padCostMultiplier * tierMultiplier));
}

export function spawnWarsInterval(unitDefinition) {
  if (unitDefinition?.unitDomain === "experimental") return 120;
  if (unitDefinition?.role === "bulwark") return 40 + Math.max(0, (unitDefinition.tier || 1) - 1) * 15;
  return 32 + Math.max(0, (unitDefinition?.tier || 1) - 1) * 14;
}

export function spawnWarsPadUpgradeCost(unitDefinition, category, currentLevel) {
  const upgrade = SPAWN_PAD_UPGRADES[category];
  if (!upgrade) return Infinity;
  const tierWeight = 1 + Math.max(0, (unitDefinition?.tier || 1) - 1) * 0.65;
  const roleWeight = unitDefinition?.role === "bulwark" || unitDefinition?.unitDomain === "experimental"
    ? 1.35
    : 1;
  return Math.round(
    Math.max(70, (unitDefinition?.metalCost || 70) * upgrade.baseMultiplier) *
    tierWeight * roleWeight * (currentLevel + 1),
  );
}

export function spawnWarsSpawnableUnits(unitDefinitions, architectTier = 3) {
  return Object.entries(unitDefinitions)
    .filter(([, definition]) => (
      !definition.workerTier &&
      !definition.spawnWarsArchitect &&
      definition.testerSpawnable !== false &&
      (definition.tier || 1) <= architectTier
    ))
    .sort((left, right) => (
      (left[1].tier || 1) - (right[1].tier || 1) ||
      left[1].name.localeCompare(right[1].name)
    ))
    .map(([type]) => type);
}
