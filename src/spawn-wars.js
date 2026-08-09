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
  killIncomeUpgradeValuePerLevel: 0.1,
  minimumKillIncome: 8,
  padCostMultiplier: 0.5,
  minimumPadCost: 25,
  padTierCostGrowth: 0.15,
  padDestroyRefundRatio: 0.75,
  padBuildTime: 6,
  minimumPadUpgradeCost: 20,
  padUpgradeTierCostGrowth: 0.25,
  padUpgradeHeavyRoleMultiplier: 1.15,
  padUpgradeLevelCostGrowth: 0.2,
  architectUpgradeCosts: Object.freeze([100, 200]),
  incomeUpgradeBaseCost: 150,
  incomeUpgradeCostGrowth: 50,
  incomeUpgradeMultiplier: 0.35,
});

export const SPAWN_PAD_UPGRADES = Object.freeze({
  health: Object.freeze({ label: "Integrity", baseMultiplier: 0.15 }),
  armor: Object.freeze({ label: "Armor", baseMultiplier: 0.18 }),
  damage: Object.freeze({ label: "Weapon Damage", baseMultiplier: 0.22 }),
  attack_speed: Object.freeze({ label: "Attack Speed", baseMultiplier: 0.2 }),
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
  const tierMultiplier = 1 +
    Math.max(0, (unitDefinition?.tier || 1) - 1) * SPAWN_WARS_RULES.padTierCostGrowth;
  return Math.max(
    SPAWN_WARS_RULES.minimumPadCost,
    Math.round(
      (unitDefinition?.metalCost || SPAWN_WARS_RULES.minimumPadCost) *
      SPAWN_WARS_RULES.padCostMultiplier * tierMultiplier,
    ),
  );
}

export function spawnWarsPadDestroyRefund(padCost) {
  return Math.floor(Math.max(0, padCost || 0) * SPAWN_WARS_RULES.padDestroyRefundRatio);
}

export function spawnWarsInterval() {
  return SPAWN_WARS_RULES.incomeInterval;
}

export function spawnWarsIncomeUpgradeCost(currentLevel = 0) {
  const level = Number.isFinite(currentLevel)
    ? Math.max(0, Math.floor(currentLevel))
    : 0;
  return SPAWN_WARS_RULES.incomeUpgradeBaseCost +
    level * SPAWN_WARS_RULES.incomeUpgradeCostGrowth;
}

export function spawnWarsPadUpgradeCost(unitDefinition, category, currentLevel) {
  const upgrade = SPAWN_PAD_UPGRADES[category];
  if (!upgrade) return Infinity;
  const tierWeight = 1 +
    Math.max(0, (unitDefinition?.tier || 1) - 1) *
    SPAWN_WARS_RULES.padUpgradeTierCostGrowth;
  const roleWeight = unitDefinition?.role === "bulwark" || unitDefinition?.unitDomain === "experimental"
    ? SPAWN_WARS_RULES.padUpgradeHeavyRoleMultiplier
    : 1;
  const levelWeight = 1 + currentLevel * SPAWN_WARS_RULES.padUpgradeLevelCostGrowth;
  return Math.round(
    Math.max(
      SPAWN_WARS_RULES.minimumPadUpgradeCost,
      (unitDefinition?.metalCost || SPAWN_WARS_RULES.minimumPadUpgradeCost) *
        upgrade.baseMultiplier * tierWeight * roleWeight,
    ) * levelWeight,
  );
}

export function spawnWarsKillIncome(unitDefinition, upgradeLevels = {}) {
  const totalUpgradeLevels = Object.keys(SPAWN_PAD_UPGRADES).reduce((total, category) => {
    const level = Number.isFinite(upgradeLevels?.[category])
      ? Math.floor(upgradeLevels[category])
      : 0;
    return total + Math.max(0, level);
  }, 0);
  const baseValue = unitDefinition?.metalValue || unitDefinition?.metalCost || 0;
  const upgradedValue = baseValue * (
    1 + totalUpgradeLevels * SPAWN_WARS_RULES.killIncomeUpgradeValuePerLevel
  );
  return Math.max(
    SPAWN_WARS_RULES.minimumKillIncome,
    Math.round(upgradedValue * SPAWN_WARS_RULES.killIncomeRatio),
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
