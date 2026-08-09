const moduleVersion = new URL(import.meta.url).searchParams.get("v");
const versionSuffix = moduleVersion ? `?v=${encodeURIComponent(moduleVersion)}` : "";

const {
  canWorkerTierBuildStructure,
  DEFAULT_MAP_ID,
  DRONE_DEFINITION,
  getNextStructureTierType,
  getNextWorkerTierType,
  MAP_DEFINITIONS,
  SIMULATION_RULES,
  STRUCTURE_DEFINITIONS,
  UNIT_DEFINITIONS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  gridCoverageBounds,
  pointInGridCoverage,
  powerCoverageBounds,
  projectileKinetics,
  structureFootprint,
} = await import(`./data.js${versionSuffix}`);
const { createMatchTeams, getMatchMap, normalizeAiDifficulty } = await import(
  `./maps.js${versionSuffix}`
);
const { SIMULATION_STEP_SECONDS } = await import(`./determinism.js${versionSuffix}`);

const EPSILON = 0.0001;
const NAVIGATION_CORNER_MARGIN = 1;
const NAVIGATION_REPLAN_INTERVAL = 0.75;
const NAVIGATION_SEARCH_MARGIN = 400;
const NAVIGATION_TARGET_TOLERANCE = 24;
const MAX_NAVIGATION_NODE_OBSTACLES = 32;
const COMBAT_SPATIAL_CELL_SIZE = 160;
const NAVIGATION_SEARCHES_PER_TICK = 4;
const DRONE_NAVIGATION_SEARCHES_PER_TICK = 2;
const UNIT_SEPARATION_MAX_PASSES = 4;
const MAX_COMBAT_TARGET_RADIUS = Math.max(
  DRONE_DEFINITION.radius,
  ...Object.values(UNIT_DEFINITIONS).map((definition) => definition.radius || 0),
  ...Object.values(STRUCTURE_DEFINITIONS).map((definition) => definition.radius || 0),
);
const UNIT_SEPARATION_CELL_SIZE = Math.max(
  40,
  ...Object.values(UNIT_DEFINITIONS).map(
    (definition) => definition.radius * 2 + SIMULATION_RULES.unitCollisionPadding,
  ),
);
const STORAGE_PRIORITY = Object.freeze({ battery: 0, power_tower: 1, generator: 2 });
const AI_STRUCTURE_UPGRADE_PRIORITY = Object.freeze({
  generator: 100,
  metal_mine: 95,
  factory: 90,
  charger: 85,
  sentry_turret: 80,
  shield_turret: 80,
  flak_turret: 80,
  mortar_turret: 78,
  power_tower: 70,
  radar_tower: 70,
  salvage_yard: 65,
});

function normalizePatrolRoute(route) {
  return Array.isArray(route)
    ? route
      .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
      .map(({ x, y }) => ({ x, y }))
    : [];
}

export class Simulation {
  constructor({
    width = WORLD_WIDTH,
    height = WORLD_HEIGHT,
    terrain = [],
    matchRulesEnabled = false,
    enemyAiEnabled = true,
    teams = createMatchTeams(2),
    mapId = null,
    mapName = null,
    mapTheme = "apocalypse",
    testerTeams = [],
  } = {}) {
    this.width = width;
    this.height = height;
    this.time = 0;
    this.tickNumber = 0;
    this.nextEntityNumber = 1;
    this.units = [];
    this.structures = [];
    this.wrecks = [];
    this.entityById = new Map();
    this.droneCache = [];
    this.combatSpatialIndex = new Map();
    this.combatSpatialIndexDirty = true;
    this.groundNavigationObstacleCache = new Map();
    this.lastUnitSeparationPasses = 0;
    this.navigationSearchesRemaining = NAVIGATION_SEARCHES_PER_TICK;
    this.lastNavigationSearchCount = 0;
    this.lastNavigationNodeObstacleCount = 0;
    this.droneNavigationSearchesRemaining = DRONE_NAVIGATION_SEARCHES_PER_TICK;
    this.lastDroneNavigationSearchCount = 0;
    this.droneNavigationObstacles = null;
    this.metalDeposits = [];
    this.terrain = terrain
      .filter((obstacle) => terrainIntersectsWorld(obstacle, width, height))
      .map((obstacle) => ({ ...obstacle, kind: "terrain" }));
    this.events = [];
    this.pendingImpacts = [];
    this.powerNetworks = [];
    this.powerLinks = [];
    this.lastPlacementError = null;
    this.lastProductionError = null;
    this.lastUpgradeError = null;
    this.matchRulesEnabled = matchRulesEnabled;
    this.enemyAiEnabled = enemyAiEnabled;
    this.matchResult = null;
    this.matchWinnerTeamId = null;
    this.mapId = mapId;
    this.mapName = mapName;
    this.mapTheme = mapTheme;
    this.testerTeams = new Set(testerTeams);
    this.teams = teams.map((team) => ({
      ...team,
      allianceId: team.allianceId || team.id,
      ...(team.kind === "ai" ? { difficulty: normalizeAiDifficulty(team.difficulty) } : {}),
    }));
    this.teamStarts = {};
    this.structureTechTier = Object.fromEntries(this.teams.map((team) => [team.id, 1]));
    this.resources = Object.fromEntries(
      this.teams.map((team) => [team.id, { metal: 520, energy: 0, energyCapacity: 0 }]),
    );
    const aiTeams = this.teams.filter((team) => team.kind === "ai");
    this.aiStates = Object.fromEntries(
      aiTeams
        .map((team, index) => [team.id, {
          thinkRemaining: this.getAiDifficultyProfile(team.id).initialThinkDelay +
            (index / Math.max(1, aiTeams.length)) *
              this.getAiDifficultyProfile(team.id).thinkInterval,
          decisionIndex: 0,
          constructionLosses: [],
        }]),
    );
    Object.defineProperties(this, {
      aiThinkRemaining: {
        configurable: true,
        get: () => this.aiStates.enemy?.thinkRemaining ?? 0,
        set: (value) => {
          this.ensureTeam("enemy", "ai");
          this.aiStates.enemy.thinkRemaining = value;
        },
      },
      aiBuildIndex: {
        configurable: true,
        get: () => this.aiStates.enemy?.decisionIndex ?? 0,
        set: (value) => {
          this.ensureTeam("enemy", "ai");
          this.aiStates.enemy.decisionIndex = value;
        },
      },
    });
  }

  static createFieldTest(options = {}) {
    const normalizedOptions = typeof options === "number" ? { playerCount: options } : options;
    const {
      enemyAiEnabled = true,
      mapId = DEFAULT_MAP_ID,
      playerCount = 2,
    } = normalizedOptions;
    const map = getMatchMap(playerCount, mapId);
    const teams = createMatchTeams(playerCount, normalizedOptions.commanderOptions || []);
    const simulation = new Simulation({
      width: map.width,
      height: map.height,
      terrain: map.terrain,
      enemyAiEnabled,
      teams,
      mapId: map.id,
      mapName: map.name,
      mapTheme: map.theme,
      testerTeams: normalizedOptions.testerTeams || [],
    });

    const startingDeposits = {};
    for (const team of teams) {
      const start = map.starts[team.slot];
      simulation.teamStarts[team.id] = { ...start };
      startingDeposits[team.id] = simulation.addMetalDeposit(start.mine.x, start.mine.y);
    }
    for (const deposit of map.deposits) {
      simulation.addMetalDeposit(deposit.x, deposit.y, deposit);
    }

    for (const team of teams) {
      const start = map.starts[team.slot];
      simulation.addStructure("headquarters", team.id, start.x, start.y);
      simulation.addStructure("generator", team.id, start.generator.x, start.generator.y);
      simulation.addStructure("mech_factory_t1", team.id, start.factory.x, start.factory.y);
      simulation.addStructure(
        "metal_mine",
        team.id,
        start.mine.x,
        start.mine.y,
        { depositId: startingDeposits[team.id].id },
      );
      for (const worker of start.workers) {
        const workerType = simulation.isTesterTeam(team.id)
          ? "worker_drone_t3"
          : "worker_drone_t1";
        simulation.addUnit(workerType, team.id, worker.x, worker.y);
      }
      if (team.kind === "ai") simulation.aiStates[team.id].decisionIndex = 1;
    }

    simulation.refreshPowerState(0);
    simulation.applyTesterTeamAdvantages();
    simulation.matchRulesEnabled = true;
    simulation.updateMatchResult();
    return simulation;
  }

  ensureTeam(teamId, kind = teamId === "player" ? "human" : "ai") {
    if (!this.teams.some((team) => team.id === teamId)) {
      this.teams.push({
        id: teamId,
        name: teamId,
        kind,
        slot: this.teams.length,
        allianceId: teamId,
        ...(kind === "ai" ? { difficulty: "medium" } : {}),
      });
    }
    if (!this.resources[teamId]) {
      this.resources[teamId] = { metal: 520, energy: 0, energyCapacity: 0 };
    }
    if (!this.structureTechTier[teamId]) this.structureTechTier[teamId] = 1;
    if (kind === "ai" && !this.aiStates[teamId]) {
      this.aiStates[teamId] = {
        thinkRemaining: this.getAiDifficultyProfile(teamId).initialThinkDelay +
          deterministicPhase(teamId, this.getAiDifficultyProfile(teamId).thinkInterval),
        decisionIndex: 0,
        constructionLosses: [],
      };
    }
  }

  getTeam(teamId) {
    return this.teams.find((team) => team.id === teamId) || null;
  }

  getAllianceId(teamId) {
    const team = this.getTeam(teamId);
    return team?.allianceId || team?.id || teamId;
  }

  areAlliedTeams(leftTeamId, rightTeamId) {
    if (!leftTeamId || !rightTeamId) return false;
    return this.getAllianceId(leftTeamId) === this.getAllianceId(rightTeamId);
  }

  areHostileTeams(leftTeamId, rightTeamId) {
    return Boolean(leftTeamId && rightTeamId && !this.areAlliedTeams(leftTeamId, rightTeamId));
  }

  getAiDifficultyProfile(teamId) {
    const difficulty = normalizeAiDifficulty(this.getTeam(teamId)?.difficulty);
    return SIMULATION_RULES.enemyDifficultyProfiles[difficulty] ||
      SIMULATION_RULES.enemyDifficultyProfiles.medium;
  }

  createSnapshot() {
    return {
      version: 2,
      mapId: this.mapId || DEFAULT_MAP_ID,
      mapName: this.mapName || MAP_DEFINITIONS[DEFAULT_MAP_ID].name,
      mapTheme: this.mapTheme || "apocalypse",
      width: this.width,
      height: this.height,
      time: this.time,
      tickNumber: this.tickNumber,
      nextEntityNumber: this.nextEntityNumber,
      units: this.units,
      structures: this.structures,
      wrecks: this.wrecks,
      metalDeposits: this.metalDeposits,
      terrain: this.terrain,
      events: this.events,
      pendingImpacts: this.pendingImpacts,
      powerLinks: this.powerLinks,
      teams: this.teams,
      teamStarts: this.teamStarts,
      aiStates: this.aiStates,
      aiThinkRemaining: this.aiThinkRemaining,
      aiBuildIndex: this.aiBuildIndex,
      enemyAiEnabled: this.enemyAiEnabled,
      matchRulesEnabled: this.matchRulesEnabled,
      matchResult: this.matchResult,
      matchWinnerTeamId: this.matchWinnerTeamId,
      structureTechTier: this.structureTechTier,
      resources: this.resources,
      testerTeams: [...this.testerTeams],
    };
  }

  static fromSnapshot(snapshot) {
    if (!snapshot || ![1, 2].includes(snapshot.version)) {
      throw new Error("Unsupported multiplayer simulation snapshot.");
    }
    const simulation = new Simulation({
      width: snapshot.width,
      height: snapshot.height,
      terrain: snapshot.terrain,
      matchRulesEnabled: snapshot.matchRulesEnabled,
      enemyAiEnabled: false,
      teams: snapshot.teams || createMatchTeams(2),
      mapId: snapshot.mapId || DEFAULT_MAP_ID,
      mapName: snapshot.mapName || MAP_DEFINITIONS[snapshot.mapId || DEFAULT_MAP_ID]?.name,
      mapTheme: snapshot.mapTheme || MAP_DEFINITIONS[snapshot.mapId || DEFAULT_MAP_ID]?.theme || "apocalypse",
      testerTeams: snapshot.testerTeams || [],
    });
    simulation.mapId = snapshot.mapId || DEFAULT_MAP_ID;
    simulation.mapName = snapshot.mapName || MAP_DEFINITIONS[simulation.mapId]?.name || "Unknown Map";
    simulation.mapTheme = snapshot.mapTheme || MAP_DEFINITIONS[simulation.mapId]?.theme || "apocalypse";
    simulation.time = snapshot.time;
    simulation.tickNumber = Number.isSafeInteger(snapshot.tickNumber)
      ? snapshot.tickNumber
      : Math.max(0, Math.round(snapshot.time / SIMULATION_STEP_SECONDS));
    simulation.nextEntityNumber = snapshot.nextEntityNumber;
    simulation.units = snapshot.units || [];
    for (const unit of simulation.units) {
      unit.transportTargetId ||= null;
      unit.carriedById ||= null;
      unit.cargoUnitIds = Array.isArray(unit.cargoUnitIds) ? unit.cargoUnitIds : [];
      unit.moveQueue = Array.isArray(unit.moveQueue) ? unit.moveQueue
        .filter((order) => Number.isFinite(order?.x) && Number.isFinite(order?.y))
        .map((order) => ({
          x: order.x,
          y: order.y,
          mode: ["normal", "force", "advance", "retreat"].includes(order.mode)
            ? order.mode
            : "normal",
        })) : [];
      unit.patrolRoute = normalizePatrolRoute(unit.patrolRoute);
      unit.patrolIndex = Number.isSafeInteger(unit.patrolIndex) &&
        unit.patrolIndex >= 0 && unit.patrolIndex < unit.patrolRoute.length
        ? unit.patrolIndex
        : 0;
    }
    simulation.structures = snapshot.structures || [];
    simulation.wrecks = snapshot.wrecks || [];
    simulation.rebuildEntityLookup();
    simulation.metalDeposits = snapshot.metalDeposits || [];
    simulation.events = snapshot.events || [];
    simulation.pendingImpacts = snapshot.pendingImpacts || [];
    simulation.powerLinks = snapshot.powerLinks || [];
    simulation.teamStarts = snapshot.teamStarts || {};
    simulation.aiStates = snapshot.aiStates
      ? Object.fromEntries(Object.entries(snapshot.aiStates).map(([teamId, state]) => [teamId, {
        thinkRemaining: state.thinkRemaining,
        decisionIndex: state.decisionIndex ?? state.buildIndex ?? 0,
        constructionLosses: Array.isArray(state.constructionLosses)
          ? state.constructionLosses.map((loss) => ({ ...loss }))
          : [],
      }]))
      : simulation.aiStates;
    if (!snapshot.aiStates) {
      simulation.aiThinkRemaining = snapshot.aiThinkRemaining;
      simulation.aiBuildIndex = snapshot.aiBuildIndex;
    }
    simulation.matchResult = snapshot.matchResult;
    simulation.matchWinnerTeamId = snapshot.matchWinnerTeamId
      || (snapshot.matchResult === "victory" ? "player" : null);
    simulation.structureTechTier = snapshot.structureTechTier || { player: 1, enemy: 1 };
    simulation.resources = snapshot.resources;
    return simulation;
  }

  createId(prefix) {
    const id = `${prefix}-${this.nextEntityNumber}`;
    this.nextEntityNumber += 1;
    return id;
  }

  isTesterTeam(teamId) {
    return this.testerTeams.has(teamId);
  }

  canTesterSpawnFor(requesterTeam, ownerTeam) {
    return Boolean(
      this.isTesterTeam(requesterTeam) &&
      requesterTeam !== ownerTeam &&
      this.teams.some((team) => team.id === ownerTeam),
    );
  }

  spawnTesterStructure(requesterTeam, ownerTeam, structureType, x, y) {
    this.lastPlacementError = null;
    if (!this.canTesterSpawnFor(requesterTeam, ownerTeam)) {
      this.lastPlacementError = "Unit Tester can only spawn assets for an opposing commander.";
      return null;
    }
    const definition = STRUCTURE_DEFINITIONS[structureType];
    if (
      !definition ||
      definition.testerSpawnable === false ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      this.lastPlacementError = "Unknown building type.";
      return null;
    }
    const placement = this.evaluatePlacement(structureType, x, y, ownerTeam);
    if (!placement.valid) {
      this.lastPlacementError = placement.reason;
      return null;
    }

    const structure = this.addStructure(
      structureType,
      ownerTeam,
      placement.x,
      placement.y,
      { depositId: placement.depositId },
    );
    this.clearFriendlyUnitsFromConstructionSite(structure);
    this.refreshPowerState(0);
    this.applyTesterTeamAdvantages();
    this.emit("construction_complete", structure.x, structure.y, {
      structureId: structure.id,
      testerSpawned: true,
    });
    return structure;
  }

  evaluateUnitPlacement(unitType, x, y) {
    if (!UNIT_DEFINITIONS[unitType]) {
      return { valid: false, x, y, reason: "Unknown unit type." };
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { valid: false, x, y, reason: "Choose a point inside the battlefield." };
    }
    if (!this.isUnitPositionClear({ x, y }, unitType)) {
      return {
        valid: false,
        x,
        y,
        reason: "Units cannot spawn on blocked terrain, buildings, other units, or map edges.",
      };
    }
    return { valid: true, x, y, reason: null };
  }

  spawnTesterUnit(requesterTeam, ownerTeam, unitType, x, y) {
    this.lastPlacementError = null;
    if (!this.canTesterSpawnFor(requesterTeam, ownerTeam)) {
      this.lastPlacementError = "Unit Tester can only spawn assets for an opposing commander.";
      return null;
    }
    const placement = this.evaluateUnitPlacement(unitType, x, y);
    if (!placement.valid) {
      this.lastPlacementError = placement.reason;
      return null;
    }

    const unit = this.addUnit(unitType, ownerTeam, placement.x, placement.y);
    this.emit("unit_complete", unit.x, unit.y, {
      unitId: unit.id,
      testerSpawned: true,
    });
    return unit;
  }

  addMetalDeposit(x, y, {
    remote = false,
    cluster = null,
    rich = false,
    yieldMultiplier = rich ? 1.5 : 1,
  } = {}) {
    const deposit = {
      id: this.createId("deposit"),
      kind: "metal_deposit",
      x,
      y,
      remote,
      cluster,
      rich,
      yieldMultiplier: Math.max(1, yieldMultiplier),
    };
    this.metalDeposits.push(deposit);
    return deposit;
  }

  addUnit(type, team, x, y, overrides = {}) {
    const definition = UNIT_DEFINITIONS[type];
    if (!definition) throw new Error(`Unknown unit type: ${type}`);
    this.ensureTeam(team);

    const unitId = this.createId("unit");
    const unit = {
      id: unitId,
      kind: "unit",
      type,
      team,
      x,
      y,
      hp: definition.maxHp,
      energy: definition.maxEnergy,
      alive: true,
      state: "active",
      attackCooldownRemaining: 0,
      abilityActiveUntil: {},
      moveTarget: null,
      moveMode: null,
      moveQueue: [],
      patrolRoute: [],
      patrolIndex: 0,
      attackTargetId: null,
      attackTargetMode: null,
      nextAutomaticTargetScanAt: this.time,
      buildTargetId: null,
      buildQueue: [],
      repairTargetId: null,
      productionAssistTargetId: null,
      holdPosition: false,
      navigationObstacleId: null,
      navigationSide: null,
      navigationPath: [],
      navigationTarget: null,
      navigationReplanAt: this.time + navigationReplanPhase(unitId),
      garrisonStructureId: null,
      transportTargetId: null,
      carriedById: null,
      cargoUnitIds: [],
      energyTransferTargetIds: [],
      energyTransferredThisTick: 0,
      underbellyBeamActive: false,
      underbellyBeamTargetIds: [],
      ...(definition.weaponSystems?.length
        ? {
          weaponSystems: definition.weaponSystems.map(() => ({
            targetId: null,
            cooldownRemaining: 0,
          })),
        }
        : {}),
      ...overrides,
    };
    unit.hp = clamp(unit.hp, 0, definition.maxHp);
    unit.energy = clamp(unit.energy, 0, definition.maxEnergy);
    unit.buildQueue = Array.isArray(unit.buildQueue) ? [...unit.buildQueue] : [];
    unit.moveQueue = Array.isArray(unit.moveQueue) ? unit.moveQueue
      .filter((order) => Number.isFinite(order?.x) && Number.isFinite(order?.y))
      .map((order) => ({
        x: order.x,
        y: order.y,
        mode: ["normal", "force", "advance", "retreat"].includes(order.mode)
          ? order.mode
          : "normal",
      })) : [];
    unit.patrolRoute = normalizePatrolRoute(unit.patrolRoute);
    unit.patrolIndex = Number.isSafeInteger(unit.patrolIndex) &&
      unit.patrolIndex >= 0 && unit.patrolIndex < unit.patrolRoute.length
      ? unit.patrolIndex
      : 0;
    unit.cargoUnitIds = Array.isArray(unit.cargoUnitIds) ? [...unit.cargoUnitIds] : [];
    if (definition.weaponSystems?.length) {
      unit.weaponSystems = normalizeWeaponSystemState(unit.weaponSystems, definition);
    }
    if (unit.energy <= EPSILON) unit.state = "stasis";
    this.units.push(unit);
    this.entityById.set(unit.id, unit);
    this.combatSpatialIndexDirty = true;
    return unit;
  }

  addStructure(type, team, x, y, overrides = {}) {
    const definition = STRUCTURE_DEFINITIONS[type];
    if (!definition) throw new Error(`Unknown structure type: ${type}`);
    this.ensureTeam(team);

    const structure = {
      id: this.createId("structure"),
      kind: "structure",
      type,
      team,
      x,
      y,
      hp: definition.maxHp,
      alive: true,
      powered: Boolean(definition.generationRate),
      connected: Boolean(definition.generationRate),
      powerStatus: definition.generationRate ? "generating" : "disconnected",
      gridId: null,
      storedEnergy: definition.storageCapacity ? 0 : null,
      energyGenerated: definition.generationRate ? 0 : null,
      depositId: null,
      powerFlow: 0,
      drones: [],
      constructionProgress: definition.buildTime || 0,
      complete: true,
      productionQueue: [],
      rallyPoint: null,
      rallySequence: 0,
      rallySequenceStride: 1,
      supplyLevel: definition.supplyLevels ? 1 : null,
      supplyUpgrade: null,
      attackCooldownRemaining: 0,
      nextAutomaticTargetScanAt: this.time,
      weaponEnergy: definition.capacitorCapacity ? definition.capacitorCapacity : null,
      defenseTargetId: null,
      defenseStatus: definition.capacitorCapacity ? "ready" : null,
      shieldStrength: definition.shieldCapacity ? definition.shieldCapacity : null,
      shieldStatus: definition.shieldCapacity ? "stable" : null,
      ...overrides,
    };

    if (definition.storageCapacity) {
      structure.storedEnergy = clamp(structure.storedEnergy, 0, definition.storageCapacity);
    }
    if (definition.shieldCapacity) {
      structure.shieldStrength = clamp(structure.shieldStrength, 0, definition.shieldCapacity);
    }
    if (definition.supplyLevels) {
      structure.supplyLevel = clamp(
        Math.floor(structure.supplyLevel || 1),
        1,
        definition.supplyLevels.length,
      );
    }

    if (definition.droneCount && structure.complete) {
      for (let slot = 0; slot < definition.droneCount; slot += 1) {
        structure.drones.push(this.createDrone(structure, slot));
      }
    }

    this.structures.push(structure);
    this.entityById.set(structure.id, structure);
    this.combatSpatialIndexDirty = true;
    if (structure.complete) this.recordStructureTierUnlock(structure);
    return structure;
  }

  createDrone(yard, slot) {
    const angle = (slot / STRUCTURE_DEFINITIONS[yard.type].droneCount) * Math.PI * 2;
    const droneId = this.createId("drone");
    const drone = {
      id: droneId,
      kind: "drone",
      type: "reclamation_drone",
      team: yard.team,
      yardId: yard.id,
      slot,
      x: yard.x + Math.cos(angle) * 28,
      y: yard.y + Math.sin(angle) * 28,
      hp: DRONE_DEFINITION.maxHp,
      alive: true,
      mode: "idle",
      carry: 0,
      targetWreckId: null,
      navigationObstacleId: null,
      navigationSide: null,
      navigationPath: [],
      navigationTarget: null,
      navigationReplanAt: this.time + navigationReplanPhase(droneId),
      replacementRemaining: 0,
      destroyedAtX: null,
      destroyedAtY: null,
    };
    this.entityById.set(drone.id, drone);
    this.droneCache.push(drone);
    this.combatSpatialIndexDirty = true;
    return drone;
  }

  addWreck(x, y, metal, team = "neutral") {
    const wreck = {
      id: this.createId("wreck"),
      kind: "wreck",
      team,
      x,
      y,
      metal: Math.max(0, metal),
      initialMetal: Math.max(0, metal),
    };
    this.wrecks.push(wreck);
    this.entityById.set(wreck.id, wreck);
    return this.mergeNearbyWrecks(wreck);
  }

  mergeNearbyWrecks(seedWreck) {
    if (!seedWreck || seedWreck.metal <= EPSILON) return seedWreck;

    const component = [seedWreck];
    const componentIds = new Set([seedWreck.id]);
    for (let index = 0; index < component.length; index += 1) {
      const anchor = component[index];
      for (const candidate of this.wrecks) {
        if (
          componentIds.has(candidate.id) ||
          candidate.metal <= EPSILON ||
          distance(anchor, candidate) > SIMULATION_RULES.wreckMergeRadius + EPSILON
        ) continue;
        component.push(candidate);
        componentIds.add(candidate.id);
      }
    }
    if (component.length === 1) return seedWreck;

    const survivor = this.wrecks.find((wreck) => componentIds.has(wreck.id));
    const totalMetal = component.reduce((total, wreck) => total + wreck.metal, 0);
    const totalInitialMetal = component.reduce(
      (total, wreck) => total + Math.max(wreck.metal, wreck.initialMetal || 0),
      0,
    );
    if (totalMetal > EPSILON) {
      survivor.x = component.reduce((total, wreck) => total + wreck.x * wreck.metal, 0) / totalMetal;
      survivor.y = component.reduce((total, wreck) => total + wreck.y * wreck.metal, 0) / totalMetal;
    }
    survivor.metal = totalMetal;
    survivor.initialMetal = Math.max(totalMetal, totalInitialMetal);
    if (!component.every((wreck) => wreck.team === survivor.team)) survivor.team = "neutral";

    for (const wreck of component) {
      if (wreck === survivor) continue;
      this.entityById.delete(wreck.id);
    }
    this.wrecks = this.wrecks.filter(
      (wreck) => wreck === survivor || !componentIds.has(wreck.id),
    );

    for (const drone of this.droneCache) {
      if (!componentIds.has(drone.targetWreckId)) continue;
      drone.targetWreckId = survivor.id;
      if (drone.mode === "collecting" && distance(drone, survivor) > 12 + EPSILON) {
        drone.mode = "to_wreck";
      }
      this.resetDroneNavigation(drone);
    }
    return survivor;
  }

  getUnit(id) {
    const entity = this.entityById.get(id);
    return entity?.kind === "unit" ? entity : null;
  }

  getStructure(id) {
    const entity = this.entityById.get(id);
    return entity?.kind === "structure" ? entity : null;
  }

  getWreck(id) {
    const entity = this.entityById.get(id);
    return entity?.kind === "wreck" ? entity : null;
  }

  getDrones() {
    return this.droneCache;
  }

  getEntity(id) {
    return this.entityById.get(id) || null;
  }

  getEntityVisionRange(entity) {
    if (!entity?.alive) return 0;
    if (entity.kind === "unit") {
      return UNIT_DEFINITIONS[entity.type]?.visionRange || 0;
    }
    if (entity.kind === "drone") return DRONE_DEFINITION.visionRange || 0;
    if (entity.kind !== "structure" || !entity.complete) return 0;
    const definition = STRUCTURE_DEFINITIONS[entity.type];
    if (!definition) return 0;
    if (definition.radarRange && !entity.powered) {
      return Math.min(340, definition.visionRange || 340);
    }
    return definition.visionRange || 0;
  }

  getVisionSources(teamId) {
    return [
      ...this.units,
      ...this.structures,
      ...this.getDrones(),
    ]
      .filter((entity) => entity.alive && this.areAlliedTeams(entity.team, teamId))
      .map((entity) => ({
        id: entity.id,
        x: entity.x,
        y: entity.y,
        range: this.getEntityVisionRange(entity),
      }))
      .filter((source) => source.range > 0);
  }

  isPointVisibleToTeam(teamId, x, y, radius = 0, visionSources = null) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const sources = visionSources || this.getVisionSources(teamId);
    return sources.some(
      (source) => Math.hypot(source.x - x, source.y - y) <= source.range + radius + EPSILON,
    );
  }

  isEntityVisibleToTeam(teamId, entity, visionSources = null) {
    if (!entity?.alive) return false;
    if (this.areAlliedTeams(entity.team, teamId)) return true;
    return this.isPointVisibleToTeam(
      teamId,
      entity.x,
      entity.y,
      entityRadius(entity),
      visionSources,
    );
  }

  rebuildEntityLookup() {
    this.droneCache = this.structures.flatMap((structure) => structure.drones || []);
    this.entityById = new Map(
      [...this.units, ...this.structures, ...this.droneCache, ...this.wrecks]
        .map((entity) => [entity.id, entity]),
    );
  }

  commandMove(unitIds, x, y, { force = false, mode = "normal", queue = false } = {}) {
    const orderedIds = [...unitIds];
    const movementMode = force
      ? "force"
      : ["normal", "advance", "retreat"].includes(mode)
        ? mode
        : "normal";
    const requestedDestination = {
      x: clamp(x, 0, this.width),
      y: clamp(y, 0, this.height),
    };
    let accepted = 0;

    for (const [orderIndex, id] of orderedIds.entries()) {
      const unit = this.getUnit(id);
      if (!unit || !unit.alive || unit.carriedById || unit.state !== "active") continue;
      const definition = UNIT_DEFINITIONS[unit.type];
      const destination = definition.movementLayer === "air"
        ? {
          x: clamp(requestedDestination.x, definition.radius, this.width - definition.radius),
          y: clamp(requestedDestination.y, definition.radius, this.height - definition.radius),
        }
        : this.findNearestPassablePoint(
          requestedDestination.x,
          requestedDestination.y,
          definition.radius,
          { ignoreStructures: definition.stridesOverStructures },
        );
      const replacingPatrol = unit.patrolRoute?.length >= 2;
      unit.patrolRoute = [];
      unit.patrolIndex = 0;
      if (queue && unit.moveTarget && !replacingPatrol) {
        unit.moveQueue = Array.isArray(unit.moveQueue) ? unit.moveQueue : [];
        unit.moveQueue.push({ x: destination.x, y: destination.y, mode: movementMode });
        accepted += 1;
        continue;
      }
      unit.moveTarget = { ...destination };
      unit.moveMode = movementMode;
      unit.moveQueue = [];
      unit.attackTargetId = null;
      unit.attackTargetMode = null;
      unit.buildTargetId = null;
      unit.buildQueue = [];
      unit.repairTargetId = null;
      unit.productionAssistTargetId = null;
      unit.transportTargetId = null;
      unit.holdPosition = false;
      unit.navigationObstacleId = null;
      unit.navigationSide = null;
      this.resetUnitNavigation(unit, orderIndex, orderedIds.length);
      accepted += 1;
    }
    return accepted;
  }

  commandPatrol(unitIds, points) {
    if (!Array.isArray(points) || points.length < 2) return 0;
    const requestedRoute = normalizePatrolRoute(points);
    if (requestedRoute.length !== points.length) return 0;

    let accepted = 0;
    const orderedIds = [...unitIds];
    for (const [orderIndex, id] of orderedIds.entries()) {
      const unit = this.getUnit(id);
      if (!unit || !unit.alive || unit.carriedById || unit.state !== "active") continue;
      const definition = UNIT_DEFINITIONS[unit.type];
      const patrolRoute = requestedRoute.map((point) => definition.movementLayer === "air"
        ? {
          x: clamp(point.x, definition.radius, this.width - definition.radius),
          y: clamp(point.y, definition.radius, this.height - definition.radius),
        }
        : this.findNearestPassablePoint(
          point.x,
          point.y,
          definition.radius,
          { ignoreStructures: definition.stridesOverStructures },
        ));
      unit.patrolRoute = patrolRoute;
      unit.patrolIndex = 0;
      unit.moveTarget = { ...patrolRoute[0] };
      unit.moveMode = "normal";
      unit.moveQueue = [];
      unit.attackTargetId = null;
      unit.attackTargetMode = null;
      unit.buildTargetId = null;
      unit.buildQueue = [];
      unit.repairTargetId = null;
      unit.productionAssistTargetId = null;
      unit.transportTargetId = null;
      unit.holdPosition = false;
      unit.navigationObstacleId = null;
      unit.navigationSide = null;
      this.resetUnitNavigation(unit, orderIndex, orderedIds.length);
      accepted += 1;
    }
    return accepted;
  }

  advanceMoveQueue(unit) {
    const next = Array.isArray(unit.moveQueue) ? unit.moveQueue.shift() : null;
    if (next) {
      unit.moveTarget = { x: next.x, y: next.y };
      unit.moveMode = next.mode;
      unit.navigationObstacleId = null;
      unit.navigationSide = null;
      this.resetUnitNavigation(unit);
      return true;
    }
    if (unit.patrolRoute?.length >= 2) {
      unit.patrolIndex = (unit.patrolIndex + 1) % unit.patrolRoute.length;
      unit.moveTarget = { ...unit.patrolRoute[unit.patrolIndex] };
      unit.moveMode = "normal";
      unit.navigationObstacleId = null;
      unit.navigationSide = null;
      this.resetUnitNavigation(unit);
      return true;
    }
    unit.moveTarget = null;
    unit.moveMode = null;
    unit.navigationPath = [];
    unit.navigationTarget = null;
    return false;
  }

  findNearestPassablePoint(x, y, radius = 0, { ignoreStructures = false } = {}) {
    let point = {
      x: clamp(x, radius, this.width - radius),
      y: clamp(y, radius, this.height - radius),
    };
    const obstacles = [
      ...this.terrain.map((obstacle) => terrainBounds(obstacle, radius)),
      ...(ignoreStructures
        ? []
        : this.structures
          .filter((structure) => structure.alive)
          .map((structure) => expandedStructureBounds(
            structure,
            radius + SIMULATION_RULES.structureCollisionPadding,
          ))),
    ];
    for (let pass = 0; pass < obstacles.length; pass += 1) {
      const containingBounds = obstacles.find((bounds) => pointInsideBounds(point, bounds));
      if (!containingBounds) break;
      const exits = [
        { x: containingBounds.minX, y: point.y },
        { x: containingBounds.maxX, y: point.y },
        { x: point.x, y: containingBounds.minY },
        { x: point.x, y: containingBounds.maxY },
      ]
        .filter(
          (candidate) =>
            candidate.x >= radius &&
            candidate.x <= this.width - radius &&
            candidate.y >= radius &&
            candidate.y <= this.height - radius,
        )
        .sort((left, right) => distance(point, left) - distance(point, right));
      point = exits.find(
        (candidate) => obstacles.every((bounds) => !pointInsideBounds(candidate, bounds)),
      ) || exits[0] || point;
    }
    return point;
  }

  commandAttack(unitIds, targetId, { requireVision = false } = {}) {
    const target = this.getEntity(targetId);
    if (!target || !target.alive || target.carriedById || target.kind === "wreck") return 0;

    let accepted = 0;
    const orderedIds = [...unitIds];
    for (const [orderIndex, id] of orderedIds.entries()) {
      const unit = this.getUnit(id);
      const definition = unit && UNIT_DEFINITIONS[unit.type];
      if (
        !unit ||
        !unit.alive ||
        unit.carriedById ||
        unit.state !== "active" ||
        this.areAlliedTeams(unit.team, target.team) ||
        (requireVision && !this.isEntityVisibleToTeam(unit.team, target)) ||
        !canUnitAttackTarget(definition, target)
      ) {
        continue;
      }
      if (definition.underbellyBeamRadius && isUnderbellyBeamTarget(target)) {
        unit.patrolRoute = [];
        unit.patrolIndex = 0;
        unit.attackTargetId = targetId;
        unit.attackTargetMode = "explicit";
        unit.moveTarget = { x: target.x, y: target.y };
        unit.moveMode = "pursuit";
        unit.moveQueue = [];
        unit.buildTargetId = null;
        unit.buildQueue = [];
        unit.repairTargetId = null;
        unit.productionAssistTargetId = null;
        unit.transportTargetId = null;
        unit.holdPosition = false;
        unit.navigationObstacleId = null;
        unit.navigationSide = null;
        this.resetUnitNavigation(unit, orderIndex, orderedIds.length);
        accepted += 1;
        continue;
      }
      if (unitAttackRangeAgainstTarget(definition, target) <= 0) continue;
      unit.patrolRoute = [];
      unit.patrolIndex = 0;
      unit.attackTargetId = targetId;
      unit.attackTargetMode = "explicit";
      unit.moveTarget = null;
      unit.moveMode = null;
      unit.moveQueue = [];
      unit.buildTargetId = null;
      unit.buildQueue = [];
      unit.repairTargetId = null;
      unit.productionAssistTargetId = null;
      unit.transportTargetId = null;
      unit.holdPosition = false;
      unit.navigationObstacleId = null;
      unit.navigationSide = null;
      this.resetUnitNavigation(unit, orderIndex, orderedIds.length);
      accepted += 1;
    }
    return accepted;
  }

  commandStop(unitIds, holdPosition = false) {
    let accepted = 0;
    for (const id of unitIds) {
      const unit = this.getUnit(id);
      if (!unit || !unit.alive || unit.carriedById) continue;
      unit.moveTarget = null;
      unit.moveMode = null;
      unit.moveQueue = [];
      unit.patrolRoute = [];
      unit.patrolIndex = 0;
      unit.attackTargetId = null;
      unit.attackTargetMode = null;
      unit.buildTargetId = null;
      unit.buildQueue = [];
      unit.repairTargetId = null;
      unit.productionAssistTargetId = null;
      unit.transportTargetId = null;
      unit.holdPosition = holdPosition;
      unit.navigationObstacleId = null;
      unit.navigationSide = null;
      unit.navigationPath = [];
      unit.navigationTarget = null;
      accepted += 1;
    }
    return accepted;
  }

  isTransport(unit) {
    return Boolean(unit?.alive && UNIT_DEFINITIONS[unit.type]?.transportCapacity);
  }

  transportReservedSlots(transport) {
    if (!this.isTransport(transport)) return 0;
    const cargoIds = new Set(transport.cargoUnitIds || []);
    const pendingCount = this.units.filter(
      (unit) =>
        unit.alive &&
        !unit.carriedById &&
        unit.transportTargetId === transport.id &&
        !cargoIds.has(unit.id),
    ).length;
    return cargoIds.size + pendingCount;
  }

  commandLoadUnits(unitIds, transportId) {
    const transport = this.getUnit(transportId);
    const transportDefinition = transport && UNIT_DEFINITIONS[transport.type];
    if (
      !this.isTransport(transport) ||
      transport.carriedById ||
      transport.state !== "active"
    ) {
      return 0;
    }

    let remainingSlots = Math.max(
      0,
      transportDefinition.transportCapacity - this.transportReservedSlots(transport),
    );
    const orderedIds = [...new Set(unitIds)];
    const orderCount = Math.min(orderedIds.length, remainingSlots);
    let accepted = 0;
    for (const id of orderedIds) {
      if (remainingSlots <= 0) break;
      const unit = this.getUnit(id);
      const definition = unit && UNIT_DEFINITIONS[unit.type];
      if (
        !unit ||
        !unit.alive ||
        unit.state !== "active" ||
        unit.carriedById ||
        unit.transportTargetId ||
        unit.team !== transport.team ||
        definition.movementLayer === "air" ||
        definition.transportCapacity
      ) {
        continue;
      }
      unit.transportTargetId = transport.id;
      unit.moveTarget = { x: transport.x, y: transport.y };
      unit.moveMode = "transport";
      unit.moveQueue = [];
      unit.patrolRoute = [];
      unit.patrolIndex = 0;
      unit.attackTargetId = null;
      unit.attackTargetMode = null;
      unit.buildTargetId = null;
      unit.buildQueue = [];
      unit.repairTargetId = null;
      unit.productionAssistTargetId = null;
      unit.holdPosition = false;
      unit.navigationObstacleId = null;
      unit.navigationSide = null;
      this.resetUnitNavigation(unit, accepted, orderCount);
      accepted += 1;
      remainingSlots -= 1;
    }
    return accepted;
  }

  commandFillTransports(transportIds) {
    const transports = [...new Set(transportIds)]
      .map((id) => this.getUnit(id))
      .filter(
        (transport) =>
          this.isTransport(transport) &&
          !transport.carriedById &&
          transport.state === "active",
      )
      .sort((left, right) => left.id.localeCompare(right.id));
    if (transports.length === 0) return 0;

    const team = transports[0].team;
    const candidates = this.units.filter((unit) => {
      const definition = UNIT_DEFINITIONS[unit.type];
      return (
        unit.alive &&
        unit.state === "active" &&
        unit.team === team &&
        !unit.carriedById &&
        !unit.transportTargetId &&
        definition.movementLayer !== "air" &&
        !definition.transportCapacity
      );
    });
    const assignedIds = new Set();
    let accepted = 0;
    let assignedInRound = true;
    while (assignedInRound) {
      assignedInRound = false;
      for (const transport of transports) {
        const capacity = UNIT_DEFINITIONS[transport.type].transportCapacity;
        if (this.transportReservedSlots(transport) >= capacity) continue;
        const candidate = candidates
          .filter((unit) => !assignedIds.has(unit.id))
          .sort(
            (left, right) =>
              distance(left, transport) - distance(right, transport) ||
              left.id.localeCompare(right.id),
          )[0];
        if (!candidate) continue;
        const loaded = this.commandLoadUnits([candidate.id], transport.id);
        if (!loaded) continue;
        assignedIds.add(candidate.id);
        accepted += loaded;
        assignedInRound = true;
      }
    }
    return accepted;
  }

  updateTransportLoading() {
    for (const unit of this.units) {
      if (!unit.alive || unit.carriedById || !unit.transportTargetId) continue;
      if (unit.state !== "active") {
        unit.transportTargetId = null;
        if (unit.moveMode === "transport") {
          unit.moveTarget = null;
          unit.moveMode = null;
          unit.moveQueue = [];
        }
        continue;
      }
      const transport = this.getUnit(unit.transportTargetId);
      const transportDefinition = transport && UNIT_DEFINITIONS[transport.type];
      const unitDefinition = UNIT_DEFINITIONS[unit.type];
      if (
        !this.isTransport(transport) ||
        transport.carriedById ||
        transport.team !== unit.team ||
        transport.state !== "active" ||
        (transport.cargoUnitIds || []).length >= transportDefinition.transportCapacity
      ) {
        unit.transportTargetId = null;
        if (unit.moveMode === "transport") {
          unit.moveTarget = null;
          unit.moveMode = null;
          unit.moveQueue = [];
        }
        continue;
      }
      unit.moveTarget = { x: transport.x, y: transport.y };
      unit.moveMode = "transport";
      const boardingDistance =
        transportDefinition.radius +
        unitDefinition.radius +
        transportDefinition.transportLoadRange;
      if (distance(unit, transport) > boardingDistance + EPSILON) continue;

      transport.cargoUnitIds = [...(transport.cargoUnitIds || []), unit.id];
      unit.carriedById = transport.id;
      unit.transportTargetId = null;
      unit.productionAssistTargetId = null;
      unit.x = transport.x;
      unit.y = transport.y;
      unit.moveTarget = null;
      unit.moveMode = null;
      unit.moveQueue = [];
      unit.navigationPath = [];
      unit.navigationTarget = null;
      this.emit("transport_loaded", transport.x, transport.y, {
        transportId: transport.id,
        unitId: unit.id,
      });
    }
  }

  syncTransportCargoPositions() {
    for (const transport of this.units) {
      if (!this.isTransport(transport)) continue;
      transport.cargoUnitIds = (transport.cargoUnitIds || []).filter((unitId) => {
        const unit = this.getUnit(unitId);
        if (!unit?.alive || unit.carriedById !== transport.id) return false;
        unit.x = transport.x;
        unit.y = transport.y;
        return true;
      });
    }
  }

  findTransportUnloadPoint(transport, unit, slot) {
    const transportDefinition = UNIT_DEFINITIONS[transport.type];
    const unitDefinition = UNIT_DEFINITIONS[unit.type];
    const baseRadius = transportDefinition.radius + unitDefinition.radius + 12;
    for (let ring = 0; ring < 6; ring += 1) {
      const radius = baseRadius + ring * (unitDefinition.radius * 2 + 12);
      for (let offset = 0; offset < 16; offset += 1) {
        const angle = ((slot + offset) / 16) * Math.PI * 2;
        const candidate = {
          x: transport.x + Math.cos(angle) * radius,
          y: transport.y + Math.sin(angle) * radius,
        };
        if (this.isUnitPositionClear(candidate, unit.type, { ignoreUnitIds: [transport.id] })) {
          return candidate;
        }
      }
    }
    return null;
  }

  commandUnloadTransports(transportIds) {
    let unloaded = 0;
    for (const transportId of [...new Set(transportIds)].sort()) {
      const transport = this.getUnit(transportId);
      if (
        !this.isTransport(transport) ||
        transport.carriedById ||
        transport.state !== "active"
      ) continue;
      const remainingCargo = [];
      for (const unitId of transport.cargoUnitIds || []) {
        const unit = this.getUnit(unitId);
        if (!unit?.alive || unit.carriedById !== transport.id) continue;
        const destination = this.findTransportUnloadPoint(transport, unit, unloaded);
        if (!destination) {
          remainingCargo.push(unitId);
          continue;
        }
        unit.carriedById = null;
        unit.x = destination.x;
        unit.y = destination.y;
        unit.moveTarget = null;
        unit.moveMode = null;
        unit.moveQueue = [];
        unit.patrolRoute = [];
        unit.patrolIndex = 0;
        unit.attackTargetId = null;
        unit.attackTargetMode = null;
        unit.holdPosition = false;
        this.resetUnitNavigation(unit);
        unloaded += 1;
        this.emit("transport_unloaded", destination.x, destination.y, {
          transportId: transport.id,
          unitId: unit.id,
        });
      }
      transport.cargoUnitIds = remainingCargo;
    }
    return unloaded;
  }

  assignActiveBuildTarget(worker, structureId) {
    worker.transportTargetId = null;
    worker.buildTargetId = structureId;
    worker.repairTargetId = null;
    worker.productionAssistTargetId = null;
    worker.attackTargetId = null;
    worker.attackTargetMode = null;
    worker.moveTarget = null;
    worker.moveMode = null;
    worker.moveQueue = [];
    worker.patrolRoute = [];
    worker.patrolIndex = 0;
    worker.holdPosition = false;
    worker.navigationObstacleId = null;
    worker.navigationSide = null;
    this.resetUnitNavigation(worker);
  }

  commandRepair(unitIds, targetId) {
    const target = this.getEntity(targetId);
    const maximumHp = repairableEntityMaxHp(target);
    if (
      !target?.alive ||
      maximumHp <= 0 ||
      target.hp + EPSILON >= maximumHp ||
      (target.kind === "structure" && !target.complete)
    ) {
      return 0;
    }

    let accepted = 0;
    const orderedIds = [...unitIds];
    for (const [orderIndex, id] of orderedIds.entries()) {
      const worker = this.getUnit(id);
      const definition = worker && UNIT_DEFINITIONS[worker.type];
      if (
        !worker?.alive ||
        worker.state !== "active" ||
        worker.carriedById ||
        worker.id === target.id ||
        worker.team !== target.team ||
        !definition?.workerTier ||
        !definition.repairRate
      ) {
        continue;
      }
      worker.repairTargetId = target.id;
      worker.productionAssistTargetId = null;
      worker.moveTarget = null;
      worker.moveMode = null;
      worker.moveQueue = [];
      worker.patrolRoute = [];
      worker.patrolIndex = 0;
      worker.attackTargetId = null;
      worker.attackTargetMode = null;
      worker.buildTargetId = null;
      worker.buildQueue = [];
      worker.transportTargetId = null;
      worker.holdPosition = false;
      worker.navigationObstacleId = null;
      worker.navigationSide = null;
      this.resetUnitNavigation(worker, orderIndex, orderedIds.length);
      accepted += 1;
    }
    return accepted;
  }

  commandAssistProduction(unitIds, structureId) {
    const factory = this.getStructure(structureId);
    if (!isActivelyProducingFactory(factory)) return 0;

    let accepted = 0;
    const orderedIds = [...unitIds];
    for (const [orderIndex, id] of orderedIds.entries()) {
      const worker = this.getUnit(id);
      const definition = worker && UNIT_DEFINITIONS[worker.type];
      if (
        !worker?.alive ||
        worker.state !== "active" ||
        worker.carriedById ||
        worker.team !== factory.team ||
        !definition?.workerTier ||
        !definition.productionAssistRate
      ) {
        continue;
      }
      worker.productionAssistTargetId = factory.id;
      worker.moveTarget = null;
      worker.moveMode = null;
      worker.moveQueue = [];
      worker.patrolRoute = [];
      worker.patrolIndex = 0;
      worker.attackTargetId = null;
      worker.attackTargetMode = null;
      worker.buildTargetId = null;
      worker.buildQueue = [];
      worker.repairTargetId = null;
      worker.transportTargetId = null;
      worker.holdPosition = false;
      worker.navigationObstacleId = null;
      worker.navigationSide = null;
      this.resetUnitNavigation(worker, orderIndex, orderedIds.length);
      accepted += 1;
    }
    return accepted;
  }

  isFactoryActivelyProducing(structureId) {
    return isActivelyProducingFactory(this.getStructure(structureId));
  }

  getFactoryProductionAssistState(structureId) {
    const factory = this.getStructure(structureId);
    let workerCount = 0;
    let productionRate = 0;
    let powerDemand = 0;
    if (!factory) return { workerCount, productionRate, powerDemand };
    const factoryDefinition = STRUCTURE_DEFINITIONS[factory.type];
    const order = factory.productionQueue?.[0];
    const unitDefinition = order ? UNIT_DEFINITIONS[order.unitType] : null;
    const productionActive = Boolean(
      order &&
      unitDefinition &&
      order.progress + EPSILON < unitDefinition.productionTime,
    );
    const basePowerDemand = productionActive
      ? (factoryDefinition.powerDemand || 0) + (factoryDefinition.productionPowerDemand || 0)
      : 0;
    let readyWorkers = 0;
    for (const worker of this.units) {
      if (!isProductionAssistantReady(worker, factory)) continue;
      const definition = UNIT_DEFINITIONS[worker.type];
      workerCount += 1;
      productionRate += definition.productionAssistRate || 0;
      powerDemand +=
        SIMULATION_RULES.productionAssistPowerDemandRatioStart +
        readyWorkers * SIMULATION_RULES.productionAssistPowerDemandRatioStep;
      readyWorkers += 1;
    }
    return { workerCount, productionRate, powerDemand: powerDemand * basePowerDemand };
  }

  resetUnitNavigation(unit, orderIndex = null, orderCount = 1) {
    unit.navigationPath = [];
    unit.navigationTarget = null;
    const phase = orderIndex === null
      ? navigationReplanPhase(unit.id)
      : (orderIndex / Math.max(1, orderCount)) * NAVIGATION_REPLAN_INTERVAL;
    unit.navigationReplanAt = this.time + phase;
  }

  advanceBuildQueue(worker) {
    worker.buildTargetId = null;
    worker.buildQueue = Array.isArray(worker.buildQueue) ? worker.buildQueue : [];
    while (worker.buildQueue.length > 0) {
      const nextStructureId = worker.buildQueue.shift();
      const nextStructure = this.getStructure(nextStructureId);
      if (
        nextStructure?.alive &&
        !nextStructure.complete &&
        nextStructure.team === worker.team &&
        canWorkerTierBuildStructure(
          UNIT_DEFINITIONS[worker.type].workerTier,
          nextStructure.type,
        )
      ) {
        this.assignActiveBuildTarget(worker, nextStructure.id);
        return nextStructure;
      }
    }
    return null;
  }

  commandBuild(unitIds, structureId, { queue = false } = {}) {
    const structure = this.getStructure(structureId);
    if (!structure?.alive || structure.complete) return 0;

    let accepted = 0;
    for (const id of unitIds) {
      const worker = this.getUnit(id);
      if (
        !worker?.alive ||
        worker.state !== "active" ||
        worker.carriedById ||
        worker.team !== structure.team ||
        !UNIT_DEFINITIONS[worker.type].workerTier ||
        !canWorkerTierBuildStructure(
          UNIT_DEFINITIONS[worker.type].workerTier,
          structure.type,
        )
      ) {
        continue;
      }
      worker.buildQueue = Array.isArray(worker.buildQueue) ? worker.buildQueue : [];
      worker.productionAssistTargetId = null;
      if (!queue) {
        worker.buildQueue = [];
        this.assignActiveBuildTarget(worker, structure.id);
      } else {
        const currentTarget = this.getStructure(worker.buildTargetId);
        const hasActiveBuildTarget =
          currentTarget?.alive &&
          !currentTarget.complete &&
          currentTarget.team === worker.team;
        if (
          worker.buildTargetId !== structure.id &&
          !worker.buildQueue.includes(structure.id)
        ) {
          worker.buildQueue.push(structure.id);
        }
        if (!hasActiveBuildTarget) this.advanceBuildQueue(worker);
      }
      accepted += 1;
    }
    return accepted;
  }

  cancelConstruction(structureId, team = null) {
    const structure = this.getStructure(structureId);
    if (
      !structure?.alive ||
      structure.complete ||
      (team && structure.team !== team)
    ) {
      return null;
    }

    const definition = STRUCTURE_DEFINITIONS[structure.type];
    const completionRatio = definition.buildTime > 0
      ? clamp(structure.constructionProgress / definition.buildTime, 0, 1)
      : 1;
    const refund =
      definition.metalCost *
      (1 - completionRatio) *
      SIMULATION_RULES.constructionCancelRefundRate;
    this.resources[structure.team].metal += refund;
    structure.alive = false;
    structure.powered = false;
    structure.connected = false;
    structure.powerStatus = "cancelled";

    for (const unit of this.units) {
      unit.buildQueue = (unit.buildQueue || []).filter((id) => id !== structure.id);
      if (unit.buildTargetId === structure.id) this.advanceBuildQueue(unit);
    }
    this.emit("construction_cancelled", structure.x, structure.y, {
      structureId: structure.id,
      refund,
    });
    return { structureId: structure.id, refund };
  }

  destroyStructure(structureId, team = null) {
    const structure = this.getStructure(structureId);
    if (
      !structure?.alive ||
      !structure.complete ||
      (team && structure.team !== team)
    ) {
      return false;
    }
    return this.destroyEntity(structure);
  }

  queueProduction(structureId, unitType) {
    this.lastProductionError = null;
    const factory = this.getStructure(structureId);
    const factoryDefinition = factory && STRUCTURE_DEFINITIONS[factory.type];
    const unitDefinition = UNIT_DEFINITIONS[unitType];
    if (
      !factory ||
      !factory.alive ||
      !factory.complete ||
      !factoryDefinition.production?.includes(unitType) ||
      !unitDefinition
    ) {
      this.lastProductionError = "This factory cannot produce that unit.";
      return false;
    }
    const account = this.resources[factory.team];
    const instant = this.isTesterTeam(factory.team);
    if (!instant && account.metal + EPSILON < unitDefinition.metalCost) {
      this.lastProductionError = "Not enough crystal.";
      return false;
    }
    const supply = this.getSupplyState(factory.team);
    if (!instant && supply.remaining + EPSILON < unitDefinition.supplyCost) {
      this.lastProductionError = "Supply limit reached.";
      return false;
    }
    if (!instant) account.metal -= unitDefinition.metalCost;
    factory.productionQueue.push({
      unitType,
      progress: instant ? unitDefinition.productionTime : 0,
    });
    return true;
  }

  queueGroupProduction(structureIds, unitType) {
    this.lastProductionError = null;
    const uniqueIds = [...new Set(structureIds || [])];
    const factories = uniqueIds.map((id) => this.getStructure(id));
    const firstFactory = factories[0];
    const firstDefinition = firstFactory && STRUCTURE_DEFINITIONS[firstFactory.type];
    if (
      factories.length === 0 ||
      !firstFactory?.alive ||
      !firstFactory.complete ||
      !firstDefinition?.production?.includes(unitType) ||
      factories.some((factory) =>
        !factory?.alive ||
        !factory.complete ||
        factory.team !== firstFactory.team ||
        factory.type !== firstFactory.type
      )
    ) {
      this.lastProductionError = "Select matching completed factories.";
      return null;
    }

    const poweredFactories = factories.filter((factory) => factory.powered);
    if (poweredFactories.length === 0) {
      this.lastProductionError = "The selected factories are unpowered.";
      return null;
    }
    const workload = (factory) => factory.productionQueue.reduce((total, order, index) => {
      const definition = UNIT_DEFINITIONS[order.unitType];
      const remaining = Math.max(0, (definition?.productionTime || 0) - (index === 0 ? order.progress : 0));
      return total + remaining;
    }, 0) / (STRUCTURE_DEFINITIONS[factory.type].productionRate || 1);
    const selectedFactory = poweredFactories
      .map((factory, selectionIndex) => ({
        factory,
        selectionIndex,
        queueLength: factory.productionQueue.length,
        workload: workload(factory),
      }))
      .sort(
        (left, right) =>
          left.queueLength - right.queueLength ||
          left.workload - right.workload ||
          left.selectionIndex - right.selectionIndex,
      )[0].factory;
    return this.queueProduction(selectedFactory.id, unitType)
      ? selectedFactory.id
      : null;
  }

  getSupplyState(team) {
    const unitSupply = this.units
      .filter((unit) => unit.alive && unit.team === team)
      .reduce((total, unit) => total + (UNIT_DEFINITIONS[unit.type].supplyCost || 0), 0);
    const reservedSupply = this.structures
      .filter((structure) => structure.alive && structure.team === team)
      .flatMap((structure) => structure.productionQueue || [])
      .reduce(
        (total, order) => total + (UNIT_DEFINITIONS[order.unitType]?.supplyCost || 0),
        0,
      );
    const structureCapacity = this.structures
      .filter(
        (structure) =>
          structure.alive &&
          structure.complete &&
          structure.powered &&
          structure.team === team,
      )
      .reduce((total, structure) => {
        const levels = STRUCTURE_DEFINITIONS[structure.type].supplyLevels;
        if (!levels) return total;
        const level = clamp(structure.supplyLevel || 1, 1, levels.length);
        return total + levels[level - 1].capacity;
      }, 0);
    const capacity = this.isTesterTeam(team)
      ? SIMULATION_RULES.unitTesterResourceAmount
      : SIMULATION_RULES.baseSupplyCapacity + structureCapacity;
    const used = unitSupply + reservedSupply;
    return {
      used,
      capacity,
      remaining: Math.max(0, capacity - used),
      unitSupply,
      reservedSupply,
    };
  }

  queueSupplyUpgrade(structureId) {
    this.lastUpgradeError = null;
    const structure = this.getStructure(structureId);
    const definition = structure && STRUCTURE_DEFINITIONS[structure.type];
    if (!structure?.alive || !structure.complete || !definition?.supplyLevels) {
      this.lastUpgradeError = "Select a completed supply structure.";
      return false;
    }
    if (structure.supplyUpgrade) {
      this.lastUpgradeError = "A supply upgrade is already in progress.";
      return false;
    }
    const nextLevel = (structure.supplyLevel || 1) + 1;
    const upgrade = definition.supplyLevels[nextLevel - 1];
    if (!upgrade) {
      this.lastUpgradeError = "This supply structure is fully upgraded.";
      return false;
    }
    const account = this.resources[structure.team];
    if (account.metal + EPSILON < upgrade.metalCost) {
      this.lastUpgradeError = "Not enough crystal.";
      return false;
    }
    account.metal -= upgrade.metalCost;
    structure.supplyUpgrade = { targetLevel: nextLevel, progress: 0 };
    this.emit("supply_upgrade_started", structure.x, structure.y, {
      structureId: structure.id,
      targetLevel: nextLevel,
    });
    return true;
  }

  getUnlockedStructureTier(team) {
    return this.structureTechTier[team] || 1;
  }

  recordStructureTierUnlock(structure) {
    const definition = STRUCTURE_DEFINITIONS[structure.type];
    if (!structure.complete || definition.factoryBranch !== "mech") return;
    const tier = definition.tier || definition.buildTier || 1;
    this.structureTechTier[structure.team] = Math.max(
      this.structureTechTier[structure.team] || 1,
      tier,
    );
  }

  getStructureUpgradeInfo(structureId) {
    const structure = this.getStructure(structureId);
    if (!structure?.alive) {
      return { valid: false, targetType: null, reason: "Select a living structure." };
    }
    const currentDefinition = STRUCTURE_DEFINITIONS[structure.type];
    const targetType = getNextStructureTierType(structure.type);
    if (!targetType) {
      return { valid: false, targetType: null, reason: "This structure is fully upgraded." };
    }
    const targetDefinition = STRUCTURE_DEFINITIONS[targetType];
    const targetTier = targetDefinition.buildTier || targetDefinition.tier || 1;
    const metalCost = Math.max(0, targetDefinition.metalCost - currentDefinition.metalCost);
    const baseInfo = { targetType, targetTier, metalCost, x: structure.x, y: structure.y };
    if (!structure.complete) {
      return { ...baseInfo, valid: false, reason: "Complete construction before upgrading." };
    }
    if (this.getUnlockedStructureTier(structure.team) < targetTier) {
      return {
        ...baseInfo,
        valid: false,
        reason: `Requires a completed Tier ${targetTier} Mech Factory.`,
      };
    }

    const placement = this.findStructureUpgradePlacement(structure, targetType);
    if (!placement.valid) return { ...baseInfo, ...placement, valid: false };
    if (this.resources[structure.team].metal + EPSILON < metalCost) {
      return { ...baseInfo, ...placement, valid: false, reason: "Not enough crystal." };
    }
    return { ...baseInfo, ...placement, valid: true, reason: null };
  }

  upgradeStructure(structureId, expectedTeam = null) {
    this.lastUpgradeError = null;
    const structure = this.getStructure(structureId);
    if (!structure?.alive || (expectedTeam && structure.team !== expectedTeam)) {
      this.lastUpgradeError = "Select one of your completed structures.";
      return false;
    }
    const upgrade = this.getStructureUpgradeInfo(structureId);
    if (!upgrade.valid) {
      this.lastUpgradeError = upgrade.reason;
      return false;
    }

    const currentDefinition = STRUCTURE_DEFINITIONS[structure.type];
    const targetDefinition = STRUCTURE_DEFINITIONS[upgrade.targetType];
    const hpRatio = clamp(structure.hp / currentDefinition.maxHp, 0, 1);
    const storedEnergy = structure.storedEnergy;
    const weaponEnergy = structure.weaponEnergy;
    const shieldStrength = structure.shieldStrength;
    this.resources[structure.team].metal -= upgrade.metalCost;

    structure.type = upgrade.targetType;
    structure.x = upgrade.x;
    structure.y = upgrade.y;
    structure.hp = Math.max(1, targetDefinition.maxHp * hpRatio);
    structure.constructionProgress = targetDefinition.buildTime || 0;
    structure.storedEnergy = targetDefinition.storageCapacity
      ? clamp(storedEnergy || 0, 0, targetDefinition.storageCapacity)
      : null;
    structure.energyGenerated = targetDefinition.generationRate
      ? structure.energyGenerated || 0
      : null;
    structure.weaponEnergy = targetDefinition.capacitorCapacity
      ? clamp(weaponEnergy || 0, 0, targetDefinition.capacitorCapacity)
      : null;
    structure.defenseStatus = targetDefinition.capacitorCapacity ? "ready" : null;
    structure.shieldStrength = targetDefinition.shieldCapacity
      ? clamp(shieldStrength || 0, 0, targetDefinition.shieldCapacity)
      : null;
    structure.shieldStatus = targetDefinition.shieldCapacity
      ? structure.shieldStrength + EPSILON >= targetDefinition.shieldCapacity
        ? "stable"
        : structure.powered
          ? "regenerating"
          : "unpowered"
      : null;
    this.recordStructureTierUnlock(structure);

    if (targetDefinition.droneCount) {
      for (let slot = structure.drones.length; slot < targetDefinition.droneCount; slot += 1) {
        structure.drones.push(this.createDrone(structure, slot));
      }
    }

    this.clearFriendlyUnitsFromConstructionSite(structure);
    this.emit("structure_upgrade_complete", structure.x, structure.y, {
      structureId: structure.id,
      structureType: structure.type,
      tier: upgrade.targetTier,
    });
    return true;
  }

  getWorkerUpgradeInfo(unitIds, expectedTeam = null) {
    const workers = [...new Set(unitIds || [])]
      .map((unitId) => this.getUnit(unitId))
      .filter((unit) =>
        unit?.alive &&
        !unit.carriedById &&
        (!expectedTeam || unit.team === expectedTeam) &&
        UNIT_DEFINITIONS[unit.type]?.workerTier
      );
    const potentialUpgrades = workers.flatMap((unit) => {
      const targetType = getNextWorkerTierType(unit.type);
      if (!targetType) return [];
      const currentDefinition = UNIT_DEFINITIONS[unit.type];
      const targetDefinition = UNIT_DEFINITIONS[targetType];
      return [{
        unit,
        targetType,
        targetTier: targetDefinition.workerTier,
        metalCost: Math.max(0, targetDefinition.metalCost - currentDefinition.metalCost),
        supplyCost: Math.max(0, targetDefinition.supplyCost - currentDefinition.supplyCost),
      }];
    });
    if (potentialUpgrades.length === 0) {
      return {
        valid: false,
        count: 0,
        metalCost: 0,
        supplyCost: 0,
        reason: workers.length > 0
          ? "The selected workers are fully upgraded."
          : "Select one or more Worker Drones.",
      };
    }

    const team = potentialUpgrades[0].unit.team;
    if (potentialUpgrades.some(({ unit }) => unit.team !== team)) {
      return {
        valid: false,
        count: potentialUpgrades.length,
        metalCost: 0,
        supplyCost: 0,
        reason: "Selected workers must belong to one commander.",
      };
    }
    const unlockedTier = this.getUnlockedStructureTier(team);
    const upgrades = potentialUpgrades.filter(
      (upgrade) => upgrade.targetTier <= unlockedTier,
    );
    if (upgrades.length === 0) {
      const targetTier = Math.min(
        ...potentialUpgrades.map((upgrade) => upgrade.targetTier),
      );
      return {
        valid: false,
        count: potentialUpgrades.length,
        targetTier,
        metalCost: potentialUpgrades.reduce(
          (total, upgrade) => total + upgrade.metalCost,
          0,
        ),
        supplyCost: potentialUpgrades.reduce(
          (total, upgrade) => total + upgrade.supplyCost,
          0,
        ),
        upgrades: [],
        reason: `Requires a completed Tier ${targetTier} Mech Factory.`,
      };
    }
    const targetTier = Math.max(...upgrades.map((upgrade) => upgrade.targetTier));
    const metalCost = upgrades.reduce((total, upgrade) => total + upgrade.metalCost, 0);
    const supplyCost = upgrades.reduce((total, upgrade) => total + upgrade.supplyCost, 0);
    const baseInfo = { count: upgrades.length, targetTier, metalCost, supplyCost, upgrades };
    if (this.resources[team].metal + EPSILON < metalCost) {
      return { ...baseInfo, valid: false, reason: "Not enough crystal." };
    }
    if (this.getSupplyState(team).remaining + EPSILON < supplyCost) {
      return { ...baseInfo, valid: false, reason: "Supply limit reached." };
    }
    return { ...baseInfo, valid: true, reason: null };
  }

  upgradeWorkers(unitIds, expectedTeam = null) {
    this.lastUpgradeError = null;
    const upgrade = this.getWorkerUpgradeInfo(unitIds, expectedTeam);
    if (!upgrade.valid) {
      this.lastUpgradeError = upgrade.reason;
      return 0;
    }

    const team = upgrade.upgrades[0].unit.team;
    this.resources[team].metal -= upgrade.metalCost;
    for (const { unit, targetType, targetTier } of upgrade.upgrades) {
      const currentDefinition = UNIT_DEFINITIONS[unit.type];
      const targetDefinition = UNIT_DEFINITIONS[targetType];
      const hpRatio = clamp(unit.hp / currentDefinition.maxHp, 0, 1);
      unit.type = targetType;
      unit.hp = Math.max(1, targetDefinition.maxHp * hpRatio);
      unit.energy = clamp(unit.energy, 0, targetDefinition.maxEnergy);
      this.emit("worker_upgrade_complete", unit.x, unit.y, {
        unitId: unit.id,
        unitType: targetType,
        tier: targetTier,
      });
    }
    return upgrade.count;
  }

  findStructureUpgradePlacement(structure, targetType) {
    const targetDefinition = STRUCTURE_DEFINITIONS[targetType];
    const targetFootprint = structureFootprint(targetType);
    const candidates = targetDefinition.requiresDeposit
      ? [{ x: structure.x, y: structure.y }]
      : nearestGridCenters(structure.x, structure.y, targetFootprint);
    let firstFailure = null;

    for (const candidate of candidates) {
      const outsideWorld =
        candidate.x - targetFootprint.halfWidth < 0 ||
        candidate.x + targetFootprint.halfWidth > this.width ||
        candidate.y - targetFootprint.halfHeight < 0 ||
        candidate.y + targetFootprint.halfHeight > this.height;
      if (outsideWorld) {
        firstFailure ||= {
          valid: false,
          ...candidate,
          reason: "The upgraded structure must fit entirely inside the battlefield.",
        };
        continue;
      }

      if (
        this.terrain.some((obstacle) =>
          footprintOverlapsTerrain(candidate.x, candidate.y, targetFootprint, obstacle),
        )
      ) {
        firstFailure ||= {
          valid: false,
          ...candidate,
          reason: "Impassable terrain blocks the upgraded footprint.",
        };
        continue;
      }

      const overlappingStructure = this.structures.some((other) => {
        if (!other.alive || other.id === structure.id) return false;
        const otherFootprint = structureFootprint(other.type);
        return (
          Math.abs(candidate.x - other.x) + EPSILON <
            targetFootprint.halfWidth + otherFootprint.halfWidth &&
          Math.abs(candidate.y - other.y) + EPSILON <
            targetFootprint.halfHeight + otherFootprint.halfHeight
        );
      });
      if (overlappingStructure) {
        firstFailure ||= {
          valid: false,
          ...candidate,
          reason: "Not enough clear space for the upgraded footprint.",
        };
        continue;
      }

      const hostileUnit = this.units.some((unit) => {
        if (!unit.alive || unit.team === structure.team) return false;
        const deltaX = Math.max(Math.abs(unit.x - candidate.x) - targetFootprint.halfWidth, 0);
        const deltaY = Math.max(Math.abs(unit.y - candidate.y) - targetFootprint.halfHeight, 0);
        return Math.hypot(deltaX, deltaY) + EPSILON < entityRadius(unit);
      });
      if (hostileUnit) {
        firstFailure ||= {
          valid: false,
          ...candidate,
          reason: "A hostile unit is blocking the upgraded footprint.",
        };
        continue;
      }

      const blockingDrone = this.getDrones().some((drone) => {
        if (!drone.alive || drone.yardId === structure.id) return false;
        const deltaX = Math.max(Math.abs(drone.x - candidate.x) - targetFootprint.halfWidth, 0);
        const deltaY = Math.max(Math.abs(drone.y - candidate.y) - targetFootprint.halfHeight, 0);
        return Math.hypot(deltaX, deltaY) + EPSILON < entityRadius(drone);
      });
      if (blockingDrone) {
        firstFailure ||= {
          valid: false,
          ...candidate,
          reason: "A reclamation drone is blocking the upgraded footprint.",
        };
        continue;
      }

      return { valid: true, ...candidate, reason: null };
    }

    return firstFailure || {
      valid: false,
      x: structure.x,
      y: structure.y,
      reason: "Not enough clear space for the upgraded footprint.",
    };
  }

  commandRally(structureId, x, y) {
    return this.commandGroupRally([structureId], x, y) === 1;
  }

  commandGroupRally(structureIds, x, y) {
    if (!Array.isArray(structureIds) || structureIds.length === 0) return 0;
    const factories = [...new Set(structureIds)]
      .map((structureId) => this.getStructure(structureId));
    const firstFactory = factories[0];
    const firstDefinition = firstFactory && STRUCTURE_DEFINITIONS[firstFactory.type];
    if (
      !firstFactory?.alive ||
      !firstFactory.complete ||
      !firstDefinition?.production ||
      factories.some((factory) => {
        const definition = factory && STRUCTURE_DEFINITIONS[factory.type];
        return (
          !factory?.alive ||
          !factory.complete ||
          !definition?.production ||
          factory.team !== firstFactory.team ||
          factory.type !== firstFactory.type
        );
      })
    ) {
      return 0;
    }

    const rallyPoint = this.findNearestPassablePoint(x, y);
    for (const [index, factory] of factories.entries()) {
      factory.rallyPoint = { ...rallyPoint };
      factory.rallySequence = index;
      factory.rallySequenceStride = factories.length;
      this.emit("rally_set", rallyPoint.x, rallyPoint.y, {
        factoryId: factory.id,
        factoryIds: factories.map((candidate) => candidate.id),
      });
    }
    return factories.length;
  }

  startConstruction(workerIds, structureType, x, y, { queue = false } = {}) {
    this.lastPlacementError = null;
    const definition = STRUCTURE_DEFINITIONS[structureType];
    const workers = workerIds
      .map((id) => this.getUnit(id))
      .filter((unit) => unit?.alive && unit.state === "active" && UNIT_DEFINITIONS[unit.type].workerTier);
    if (!definition || workers.length === 0) {
      this.lastPlacementError = "Select at least one active worker.";
      return null;
    }
    const team = workers[0].team;
    if (workers.some((worker) => worker.team !== team)) {
      this.lastPlacementError = "Workers from different teams cannot share a build order.";
      return null;
    }
    const highestWorkerTier = Math.max(
      ...workers.map((worker) => UNIT_DEFINITIONS[worker.type].workerTier),
    );
    const instant = this.isTesterTeam(team);
    if (!instant && !canWorkerTierBuildStructure(highestWorkerTier, structureType)) {
      this.lastPlacementError = `Requires a Tier ${definition.minimumWorkerTier || definition.buildTier} Worker Drone.`;
      return null;
    }
    const account = this.resources[team];
    if (!instant && account.metal + EPSILON < definition.metalCost) {
      this.lastPlacementError = "Not enough crystal.";
      return null;
    }

    const placement = this.evaluatePlacement(structureType, x, y, team);
    if (!placement.valid) {
      this.lastPlacementError = placement.reason;
      return null;
    }

    if (!instant) account.metal -= definition.metalCost;
    const structure = this.addStructure(structureType, team, placement.x, placement.y, {
      hp: instant
        ? definition.maxHp
        : Math.max(1, definition.maxHp * SIMULATION_RULES.constructionStartingHpRatio),
      complete: instant,
      powered: instant,
      connected: instant,
      powerStatus: instant
        ? definition.generationRate ? "generating" : "online"
        : "constructing",
      constructionProgress: instant ? definition.buildTime : 0,
      depositId: placement.depositId,
      ...(definition.storageCapacity && instant
        ? { storedEnergy: definition.storageCapacity }
        : {}),
      weaponEnergy: definition.capacitorCapacity
        ? instant ? definition.capacitorCapacity : 0
        : null,
      constructionStartedAt: this.time,
    });
    this.clearFriendlyUnitsFromConstructionSite(structure);
    if (instant) {
      this.emit("construction_complete", structure.x, structure.y, { structureId: structure.id });
      this.applyTesterTeamAdvantages();
      return structure;
    }
    this.commandBuild(workers.map((worker) => worker.id), structure.id, { queue });
    return structure;
  }

  evaluatePlacement(structureType, x, y, team = null) {
    const definition = STRUCTURE_DEFINITIONS[structureType];
    if (!definition) {
      return { valid: false, x, y, depositId: null, reason: "Unknown building type." };
    }

    let depositId = null;
    if (definition.requiresDeposit) {
      const deposit = this.findAvailableMetalDeposit(x, y);
      if (!deposit) {
        return {
          valid: false,
          x,
          y,
          depositId,
          reason: "Crystal Harvesters must be placed on an unused crystal deposit.",
        };
      }
      x = deposit.x;
      y = deposit.y;
      depositId = deposit.id;
    } else {
      const gridSize = SIMULATION_RULES.buildingGridSize;
      const footprint = structureFootprint(structureType);
      const offsetX = footprint.columns % 2 === 0 ? 0 : gridSize / 2;
      const offsetY = footprint.rows % 2 === 0 ? 0 : gridSize / 2;
      x = Math.round((x - offsetX) / gridSize) * gridSize + offsetX;
      y = Math.round((y - offsetY) / gridSize) * gridSize + offsetY;
    }

    const result = { valid: false, x, y, depositId, reason: null };
    const footprint = structureFootprint(structureType);
    const outsideWorld =
      x - footprint.halfWidth < 0 ||
      x + footprint.halfWidth > this.width ||
      y - footprint.halfHeight < 0 ||
      y + footprint.halfHeight > this.height;
    if (outsideWorld) {
      result.reason = "Buildings must fit entirely inside the battlefield.";
      return result;
    }

    if (this.terrain.some((obstacle) => footprintOverlapsTerrain(x, y, footprint, obstacle))) {
      result.reason = "Buildings cannot be placed on impassable terrain.";
      return result;
    }

    const overlappingStructure = this.structures.some((structure) => {
      if (!structure.alive) return false;
      const otherFootprint = structureFootprint(structure.type);
      return (
        Math.abs(x - structure.x) + EPSILON < footprint.halfWidth + otherFootprint.halfWidth &&
        Math.abs(y - structure.y) + EPSILON < footprint.halfHeight + otherFootprint.halfHeight
      );
    });
    if (overlappingStructure) {
      result.reason = "Buildings cannot overlap another structure or foundation.";
      return result;
    }

    const occupyingUnit = this.units.some((entity) => {
      if (!entity.alive) return false;
      if (team && entity.team === team) return false;
      const deltaX = Math.max(Math.abs(entity.x - x) - footprint.halfWidth, 0);
      const deltaY = Math.max(Math.abs(entity.y - y) - footprint.halfHeight, 0);
      return (
        Math.hypot(deltaX, deltaY) + EPSILON <
        entityRadius(entity) + SIMULATION_RULES.structureCollisionPadding
      );
    });
    if (occupyingUnit) {
      result.reason = "A unit is occupying this construction site.";
      return result;
    }

    const occupyingDrone = this.getDrones().some((drone) => {
      if (!drone.alive) return false;
      const deltaX = Math.max(Math.abs(drone.x - x) - footprint.halfWidth, 0);
      const deltaY = Math.max(Math.abs(drone.y - y) - footprint.halfHeight, 0);
      return (
        Math.hypot(deltaX, deltaY) + EPSILON <
        entityRadius(drone) + SIMULATION_RULES.structureCollisionPadding
      );
    });
    if (occupyingDrone) {
      result.reason = "A reclamation drone is occupying this construction site.";
      return result;
    }

    result.valid = true;
    return result;
  }

  clearFriendlyUnitsFromConstructionSite(structure) {
    for (const unit of this.units) {
      if (!unit.alive || unit.team !== structure.team) continue;
      const padding = UNIT_DEFINITIONS[unit.type].radius + SIMULATION_RULES.structureCollisionPadding;
      if (!pointInsideBounds(unit, expandedStructureBounds(structure, padding))) continue;
      this.resolveUnitStructureOverlap(unit);
    }
  }

  findNearestValidBuildSite(
    structureType,
    preferredX,
    preferredY,
    maxRings = 8,
    team = null,
    { avoidHostileThreats = false } = {},
  ) {
    const acceptable = (candidate) =>
      candidate.valid &&
      (!avoidHostileThreats || this.isAiConstructionSiteSafe(
        team,
        structureType,
        candidate.x,
        candidate.y,
      ));
    const preferred = this.evaluatePlacement(structureType, preferredX, preferredY, team);
    if (acceptable(preferred)) return preferred;
    if (STRUCTURE_DEFINITIONS[structureType]?.requiresDeposit) {
      const deposits = [...this.metalDeposits].sort(
        (left, right) =>
          distance(left, { x: preferredX, y: preferredY }) -
          distance(right, { x: preferredX, y: preferredY }),
      );
      for (const deposit of deposits) {
        const candidate = this.evaluatePlacement(structureType, deposit.x, deposit.y, team);
        if (acceptable(candidate)) return candidate;
      }
      return avoidHostileThreats && preferred.valid
        ? { ...preferred, valid: false, reason: "No safe crystal deposit is available." }
        : preferred;
    }

    const gridSize = SIMULATION_RULES.buildingGridSize;
    const centerX = preferred.x;
    const centerY = preferred.y;
    for (let ring = 1; ring <= maxRings; ring += 1) {
      for (let offsetX = -ring; offsetX <= ring; offsetX += 1) {
        for (const offsetY of [-ring, ring]) {
          const candidate = this.evaluatePlacement(
            structureType,
            centerX + offsetX * gridSize,
            centerY + offsetY * gridSize,
            team,
          );
          if (acceptable(candidate)) return candidate;
        }
      }
      for (let offsetY = -ring + 1; offsetY < ring; offsetY += 1) {
        for (const offsetX of [-ring, ring]) {
          const candidate = this.evaluatePlacement(
            structureType,
            centerX + offsetX * gridSize,
            centerY + offsetY * gridSize,
            team,
          );
          if (acceptable(candidate)) return candidate;
        }
      }
    }
    return avoidHostileThreats && preferred.valid
      ? { ...preferred, valid: false, reason: "No safe construction cell is available." }
      : preferred;
  }

  findNearestValidPoweredBuildSite(
    structureType,
    team,
    preferredX,
    preferredY,
    { avoidHostileThreats = false } = {},
  ) {
    if (STRUCTURE_DEFINITIONS[structureType]?.generationRate) {
      return this.findNearestValidBuildSite(
        structureType,
        preferredX,
        preferredY,
        8,
        team,
        { avoidHostileThreats },
      );
    }

    const preferred = this.evaluatePlacement(structureType, preferredX, preferredY, team);
    if (
      preferred.valid &&
      this.isBuildSiteConnectedToPower(structureType, team, preferred.x, preferred.y) &&
      (!avoidHostileThreats || this.isAiConstructionSiteSafe(
        team,
        structureType,
        preferred.x,
        preferred.y,
      ))
    ) {
      return preferred;
    }

    if (STRUCTURE_DEFINITIONS[structureType]?.requiresDeposit) {
      const deposits = [...this.metalDeposits].sort(
        (left, right) =>
          distance(left, { x: preferredX, y: preferredY }) -
          distance(right, { x: preferredX, y: preferredY }),
      );
      for (const deposit of deposits) {
        const candidate = this.evaluatePlacement(structureType, deposit.x, deposit.y, team);
        if (
          candidate.valid &&
          this.isBuildSiteConnectedToPower(structureType, team, candidate.x, candidate.y) &&
          (!avoidHostileThreats || this.isAiConstructionSiteSafe(
            team,
            structureType,
            candidate.x,
            candidate.y,
          ))
        ) {
          return candidate;
        }
      }
      return { ...preferred, valid: false, reason: "No powered crystal deposit is available." };
    }

    const powerNodes = this.structures.filter(
      (structure) =>
        structure.alive &&
        structure.complete &&
        structure.team === team &&
        structure.connected &&
        isPowerNode(structure),
    );
    if (powerNodes.length === 0) {
      return { ...preferred, valid: false, reason: "No energized grid can reach this site." };
    }

    const gridSize = SIMULATION_RULES.buildingGridSize;
    const footprint = structureFootprint(structureType);
    const offsetX = footprint.columns % 2 === 0 ? 0 : gridSize / 2;
    const offsetY = footprint.rows % 2 === 0 ? 0 : gridSize / 2;
    let bestCandidate = null;
    let bestDistance = Infinity;
    const visited = new Set();

    for (const node of powerNodes) {
      const candidateNodeReach = isPowerNodeType(structureType)
        ? Math.max(powerReach(node), powerReachForType(structureType))
        : powerReach(node);
      const coverage = gridCoverageBounds(node.x, node.y, candidateNodeReach);
      const minimumColumn = Math.floor((coverage.left - offsetX) / gridSize);
      const maximumColumn = Math.ceil((coverage.right - offsetX) / gridSize);
      const minimumRow = Math.floor((coverage.top - offsetY) / gridSize);
      const maximumRow = Math.ceil((coverage.bottom - offsetY) / gridSize);

      for (let column = minimumColumn; column <= maximumColumn; column += 1) {
        for (let row = minimumRow; row <= maximumRow; row += 1) {
          const x = column * gridSize + offsetX;
          const y = row * gridSize + offsetY;
          const key = `${x}:${y}`;
          if (visited.has(key)) continue;
          visited.add(key);
          if (!this.isBuildSiteConnectedToPower(structureType, team, x, y)) continue;
          const candidate = this.evaluatePlacement(structureType, x, y, team);
          if (!candidate.valid) continue;
          if (
            avoidHostileThreats &&
            !this.isAiConstructionSiteSafe(team, structureType, candidate.x, candidate.y)
          ) continue;
          const candidateDistance = distance(candidate, { x: preferredX, y: preferredY });
          if (candidateDistance + EPSILON >= bestDistance) continue;
          bestCandidate = candidate;
          bestDistance = candidateDistance;
        }
      }
    }

    return bestCandidate || {
      ...preferred,
      valid: false,
      reason: avoidHostileThreats
        ? "No safe construction cell is connected to the energized grid."
        : "No valid construction cell is connected to the energized grid.",
    };
  }

  isAiConstructionSiteSafe(teamId, structureType, x, y) {
    if (!teamId || !STRUCTURE_DEFINITIONS[structureType]) return true;
    const aiState = this.aiStates[teamId];
    if (!aiState) return true;
    const lossCutoff = this.time - SIMULATION_RULES.enemyConstructionLossMemoryDuration;
    aiState.constructionLosses = (aiState.constructionLosses || []).filter(
      (loss) => loss.time + EPSILON >= lossCutoff,
    );
    if (aiState.constructionLosses.some(
      (loss) => distance(loss, { x, y }) <= SIMULATION_RULES.enemyConstructionLossRadius,
    )) return false;

    const footprint = structureFootprint(structureType);
    const threatRadius = SIMULATION_RULES.enemyConstructionThreatRadius +
      Math.hypot(footprint.halfWidth, footprint.halfHeight);
    const nearbyCombatants = [...this.units, ...this.structures].filter((entity) => {
      if (!entity.alive || distance(entity, { x, y }) > threatRadius) return false;
      if (entity.kind === "unit") {
        return entity.state === "active" && isCombatUnitDefinition(UNIT_DEFINITIONS[entity.type]);
      }
      return entity.complete && combatStrength(entity) > EPSILON;
    });
    const hostileStrength = nearbyCombatants
      .filter((entity) => this.areHostileTeams(entity.team, teamId))
      .reduce((total, entity) => total + combatStrength(entity), 0);
    if (hostileStrength <= EPSILON) return true;
    const friendlyStrength = nearbyCombatants
      .filter((entity) => this.areAlliedTeams(entity.team, teamId))
      .reduce((total, entity) => total + combatStrength(entity), 0);
    return hostileStrength <=
      friendlyStrength * SIMULATION_RULES.enemyConstructionSafetyStrengthRatio + EPSILON;
  }

  recordAiConstructionLoss(structure) {
    const aiState = structure?.kind === "structure" ? this.aiStates[structure.team] : null;
    if (!aiState) return;
    const recentlyStarted = Number.isFinite(structure.constructionStartedAt) &&
      this.time - structure.constructionStartedAt <=
        SIMULATION_RULES.enemyConstructionRecentBuildWindow + EPSILON;
    if (structure.complete && !recentlyStarted) return;
    const lossCutoff = this.time - SIMULATION_RULES.enemyConstructionLossMemoryDuration;
    aiState.constructionLosses = [
      ...(aiState.constructionLosses || []).filter((loss) => loss.time + EPSILON >= lossCutoff),
      { x: structure.x, y: structure.y, time: this.time },
    ].slice(-SIMULATION_RULES.enemyConstructionLossMemoryLimit);
  }

  isBuildSiteConnectedToPower(structureType, team, x, y) {
    if (STRUCTURE_DEFINITIONS[structureType]?.generationRate) return true;
    const candidateIsNode = isPowerNodeType(structureType);
    return this.structures.some((node) => {
      if (
        !node.alive ||
        !node.complete ||
        node.team !== team ||
        !node.connected ||
        !isPowerNode(node)
      ) {
        return false;
      }
      const connected = candidateIsNode
        ? powerNodeCoversPoint(node, x, y) ||
          pointInGridCoverage(powerCoverageBounds(structureType, x, y), node.x, node.y)
        : powerNodeCoversPoint(node, x, y);
      return connected;
    });
  }

  findAvailableMetalDeposit(x, y, snapDistance = 75) {
    const occupiedDepositIds = new Set(
      this.structures
        .filter(
          (structure) =>
            structure.alive &&
            STRUCTURE_DEFINITIONS[structure.type].requiresDeposit &&
            structure.depositId,
        )
        .map((structure) => structure.depositId),
    );
    const candidates = this.metalDeposits.filter(
      (deposit) =>
        !occupiedDepositIds.has(deposit.id) &&
        distance(deposit, { x, y }) <= snapDistance,
    );
    return nearest({ x, y }, candidates);
  }

  activateAbility(unitIds, abilityId) {
    let activated = 0;
    for (const id of unitIds) {
      const unit = this.getUnit(id);
      if (!unit || !unit.alive || unit.state !== "active") continue;
      const ability = UNIT_DEFINITIONS[unit.type].abilities?.[abilityId];
      if (!ability || unit.energy + EPSILON < ability.energyCost) continue;

      unit.energy -= ability.energyCost;
      unit.abilityActiveUntil[abilityId] = this.time + ability.duration;
      this.emit("ability", unit.x, unit.y, { unitId: unit.id, abilityId });
      if (unit.energy <= EPSILON) this.enterStasis(unit);
      activated += 1;
    }
    return activated;
  }

  tick(deltaSeconds) {
    if (this.matchResult || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const delta = Math.min(deltaSeconds, 0.25);
    this.time += delta;
    this.groundNavigationObstacleCache.clear();

    this.updatePendingImpacts();
    this.refreshPowerState(delta);
    this.applyTesterTeamAdvantages();
    if (this.enemyAiEnabled) this.updateEnemyAi(delta);
    this.updateTransportLoading();
    this.assignAutomaticTargets();
    this.updateUnits(delta);
    this.updateConstruction(delta);
    this.updateSupplyUpgrades(delta);
    this.updateProduction(delta);
    this.updateStaticDefenses(delta);
    this.updateShieldTurrets(delta);
    this.updateChargers(delta);
    this.updateEnergyCarriers(delta);
    this.updateDrones(delta);
    this.finalizePowerStorage(delta);
    this.syncStoredEnergy();
    this.applyTesterTeamAdvantages();
    this.events = this.events.filter((event) => {
      const retention = event.type === "attack"
        ? Math.max(1.2, (event.impactDelay || 0) + 1.2)
        : 1.2;
      return this.time - event.time < retention;
    });
    for (const wreck of this.wrecks) {
      if (wreck.metal <= EPSILON) this.entityById.delete(wreck.id);
    }
    this.wrecks = this.wrecks.filter((wreck) => wreck.metal > EPSILON);
    this.pruneDestroyedEntities();
    this.updateMatchResult();
  }

  pruneDestroyedEntities() {
    const retainedUnits = [];
    for (const unit of this.units) {
      if (unit.alive) retainedUnits.push(unit);
      else this.entityById.delete(unit.id);
    }
    this.units = retainedUnits;

    const retainedStructures = [];
    for (const structure of this.structures) {
      if (structure.alive || structure.drones?.length) retainedStructures.push(structure);
      else this.entityById.delete(structure.id);
    }
    this.structures = retainedStructures;
  }

  fixedTick() {
    if (this.matchResult) return false;
    this.tickNumber += 1;
    this.tick(SIMULATION_STEP_SECONDS);
    this.time = this.tickNumber * SIMULATION_STEP_SECONDS;
    return true;
  }

  updateMatchResult() {
    if (!this.matchRulesEnabled || this.matchResult) return this.matchResult;

    const hasLivingAssets = (team) =>
      this.units.some((unit) => unit.alive && unit.team === team) ||
      this.structures.some((structure) => structure.alive && structure.team === team);
    const livingTeams = this.teams.filter((team) => hasLivingAssets(team.id));
    const livingAllianceIds = new Set(livingTeams.map((team) => this.getAllianceId(team.id)));
    if (livingAllianceIds.size > 1) return null;

    const winnerAllianceId = livingAllianceIds.values().next().value || null;
    const playerAllianceId = this.getAllianceId("player");
    this.matchWinnerTeamId = livingTeams.find((team) => team.id === "player")?.id ||
      livingTeams[0]?.id || null;
    this.matchResult = winnerAllianceId === playerAllianceId ? "victory" : "defeat";
    this.emit("match_complete", this.width / 2, this.height / 2, {
      result: this.matchResult,
      winner: this.matchWinnerTeamId,
    });
    return this.matchResult;
  }

  refreshPowerState(delta) {
    for (const structure of this.structures) {
      structure.powered = false;
      structure.connected = false;
      structure.gridId = null;
      structure.powerFlow = 0;
      structure.powerStatus = structure.complete ? "disconnected" : "constructing";
    }

    this.powerNetworks = [];
    this.powerLinks = [];
    for (const team of Object.keys(this.resources)) this.buildPowerNetworks(team, delta);

    for (const mine of this.structures) {
      const definition = STRUCTURE_DEFINITIONS[mine.type];
      if (mine.alive && mine.complete && mine.powered && definition.metalRate) {
        const deposit = this.metalDeposits.find((candidate) => candidate.id === mine.depositId);
        const yieldMultiplier = deposit?.yieldMultiplier || 1;
        this.resources[mine.team].metal += definition.metalRate * yieldMultiplier * delta;
      }
    }
    this.syncStoredEnergy();
  }

  buildPowerNetworks(team, delta) {
    const infrastructure = this.structures.filter(
      (structure) =>
        structure.alive &&
        structure.complete &&
        structure.team === team &&
        isPowerNode(structure),
    );
    const adjacency = new Map(infrastructure.map((structure) => [structure.id, []]));

    for (let leftIndex = 0; leftIndex < infrastructure.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < infrastructure.length; rightIndex += 1) {
        const left = infrastructure[leftIndex];
        const right = infrastructure[rightIndex];
        if (!powerNodesCanConnect(left, right)) continue;
        adjacency.get(left.id).push(right);
        adjacency.get(right.id).push(left);
        this.powerLinks.push({ fromId: left.id, toId: right.id, team });
      }
    }

    const visited = new Set();
    const assignedStructureIds = new Set();
    let networkNumber = 0;
    for (const root of infrastructure) {
      if (visited.has(root.id)) continue;
      const nodes = [];
      const pending = [root];
      visited.add(root.id);
      while (pending.length > 0) {
        const node = pending.pop();
        nodes.push(node);
        for (const neighbor of adjacency.get(node.id)) {
          if (visited.has(neighbor.id)) continue;
          visited.add(neighbor.id);
          pending.push(neighbor);
        }
      }

      const id = `${team}-grid-${networkNumber}`;
      networkNumber += 1;
      const network = {
        id,
        team,
        nodes,
        structures: [...nodes],
        generators: nodes.filter((structure) => STRUCTURE_DEFINITIONS[structure.type].generationRate),
        storageNodes: nodes
          .filter((structure) => STRUCTURE_DEFINITIONS[structure.type].storageCapacity)
          .sort(
            (left, right) =>
              (STORAGE_PRIORITY[structureFamily(left)] ?? 99) -
              (STORAGE_PRIORITY[structureFamily(right)] ?? 99),
          ),
        generationRemaining: 0,
        storageBudgets: new Map(),
        energized: false,
      };

      for (const structure of this.structures) {
        if (
          !structure.alive ||
          !structure.complete ||
          structure.team !== team ||
          isPowerNode(structure) ||
          assignedStructureIds.has(structure.id)
        ) {
          continue;
        }
        const attachment = nearestReachablePowerNode(structure, nodes);
        if (!attachment) continue;
        network.structures.push(structure);
        assignedStructureIds.add(structure.id);
        this.powerLinks.push({ fromId: attachment.id, toId: structure.id, team });
      }

      this.initializePowerNetwork(network, delta);
      this.powerNetworks.push(network);
    }
  }

  initializePowerNetwork(network, delta) {
    network.generationRemaining = network.generators.reduce(
      (total, generator) => total + STRUCTURE_DEFINITIONS[generator.type].generationRate * delta,
      0,
    );
    for (const storage of network.storageNodes) {
      const outputLimit = STRUCTURE_DEFINITIONS[storage.type].dischargeRate * delta;
      network.storageBudgets.set(storage.id, Math.min(storage.storedEnergy, outputLimit));
    }
    network.energized =
      network.generators.length > 0 ||
      network.storageNodes.some((storage) => storage.storedEnergy > EPSILON);

    for (const structure of network.structures) {
      structure.gridId = network.id;
      structure.connected = network.energized;
    }

    for (const generator of network.generators) {
      generator.energyGenerated += STRUCTURE_DEFINITIONS[generator.type].generationRate * delta;
      generator.powered = true;
      generator.connected = true;
      generator.powerStatus = "generating";
    }

    const consumers = network.structures
      .filter((structure) => {
        const definition = STRUCTURE_DEFINITIONS[structure.type];
        if (structureFamily(structure) === "battery") return false;
        return !definition.generationRate ||
          this.getStructurePowerDemandRate(structure) > EPSILON;
      })
      .sort(
        (left, right) =>
          Number(structureFamily(right) === "power_tower") -
          Number(structureFamily(left) === "power_tower"),
      );
    for (const structure of consumers) {
      if (!network.energized) {
        structure.powerStatus = "disconnected";
        continue;
      }
      const operationCost = this.getStructurePowerDemandRate(structure) * delta;
      if (this.takeNetworkEnergy(network, operationCost) + EPSILON >= operationCost) {
        structure.powered = true;
        structure.powerStatus = "online";
      } else {
        structure.powerStatus = "no_energy";
      }
    }

    this.updateStorageStatuses(network);
  }

  getPowerNetworkFor(structure) {
    return this.powerNetworks.find((network) => network.id === structure.gridId) || null;
  }

  getNetworkAvailableEnergy(network) {
    if (!network?.energized) return 0;
    let available = network.generationRemaining;
    for (const storage of network.storageNodes) {
      available += Math.min(
        storage.storedEnergy,
        network.storageBudgets.get(storage.id) || 0,
      );
    }
    return available;
  }

  takeNetworkEnergy(network, requested) {
    if (!network || requested <= EPSILON) return Math.max(0, requested);
    if (this.getNetworkAvailableEnergy(network) + EPSILON < requested) return 0;

    let remaining = requested;
    const generated = Math.min(remaining, network.generationRemaining);
    network.generationRemaining -= generated;
    remaining -= generated;

    for (const storage of network.storageNodes) {
      if (remaining <= EPSILON) break;
      const budget = network.storageBudgets.get(storage.id) || 0;
      const discharge = Math.min(remaining, budget, storage.storedEnergy);
      if (discharge <= EPSILON) continue;
      storage.storedEnergy -= discharge;
      storage.powerFlow -= discharge;
      network.storageBudgets.set(storage.id, budget - discharge);
      remaining -= discharge;
    }
    this.updateStorageStatuses(network);
    return requested - Math.max(0, remaining);
  }

  takeStructureEnergy(structure, requested) {
    const network = this.getPowerNetworkFor(structure);
    const available = this.getNetworkAvailableEnergy(network);
    const taken = this.takeNetworkEnergy(network, Math.min(requested, available));
    this.syncStoredEnergy();
    return taken;
  }

  updateStorageStatuses(network) {
    for (const storage of network.storageNodes) {
      const definition = STRUCTURE_DEFINITIONS[storage.type];
      storage.powered = network.energized;
      storage.connected = network.energized;
      if (definition.generationRate) {
        storage.powered = true;
        storage.connected = true;
        storage.powerStatus = "generating";
      } else if (storage.powerFlow < -EPSILON) storage.powerStatus = "discharging";
      else if (storage.powerFlow > EPSILON) storage.powerStatus = "charging";
      else if (!network.energized) storage.powerStatus = "disconnected";
      else if (storage.storedEnergy <= EPSILON) storage.powerStatus = "empty";
      else if (storage.storedEnergy + EPSILON >= definition.storageCapacity) storage.powerStatus = "full";
      else storage.powerStatus = "standby";
    }
  }

  finalizePowerStorage(delta) {
    for (const network of this.powerNetworks) {
      for (const storage of network.storageNodes) {
        if (network.generationRemaining <= EPSILON) break;
        const definition = STRUCTURE_DEFINITIONS[storage.type];
        const charge = Math.min(
          network.generationRemaining,
          definition.chargeRate * delta,
          definition.storageCapacity - storage.storedEnergy,
        );
        if (charge <= EPSILON) continue;
        storage.storedEnergy += charge;
        storage.powerFlow += charge;
        network.generationRemaining -= charge;
      }
      this.updateStorageStatuses(network);
    }
  }

  syncStoredEnergy() {
    for (const team of Object.keys(this.resources)) {
      const storageStructures = this.structures.filter(
        (structure) =>
          structure.alive &&
          structure.complete &&
          structure.team === team &&
          STRUCTURE_DEFINITIONS[structure.type].storageCapacity,
      );
      this.resources[team].energy = storageStructures.reduce(
        (total, structure) => total + structure.storedEnergy,
        0,
      );
      this.resources[team].energyCapacity = storageStructures.reduce(
        (total, structure) => total + STRUCTURE_DEFINITIONS[structure.type].storageCapacity,
        0,
      );
    }
  }

  applyTesterTeamAdvantages() {
    for (const teamId of this.testerTeams) {
      const account = this.resources[teamId];
      if (!account) continue;
      account.metal = SIMULATION_RULES.unitTesterResourceAmount;
      account.energy = SIMULATION_RULES.unitTesterResourceAmount;
      account.energyCapacity = SIMULATION_RULES.unitTesterResourceAmount;

      for (const unit of this.units) {
        if (!unit.alive || unit.team !== teamId) continue;
        unit.energy = UNIT_DEFINITIONS[unit.type].maxEnergy;
        if (unit.state === "stasis") unit.state = "active";
      }

      for (const structure of this.structures) {
        if (!structure.alive || !structure.complete || structure.team !== teamId) continue;
        const definition = STRUCTURE_DEFINITIONS[structure.type];
        structure.powered = true;
        structure.connected = true;
        structure.powerStatus = definition.generationRate ? "generating" : "online";
        if (definition.storageCapacity) structure.storedEnergy = definition.storageCapacity;
        if (definition.capacitorCapacity) structure.weaponEnergy = definition.capacitorCapacity;
        if (definition.shieldCapacity) structure.shieldStrength = definition.shieldCapacity;
      }
    }
  }

  getStructurePowerDemandRate(structure) {
    const definition = STRUCTURE_DEFINITIONS[structure.type];
    let demand = definition.powerDemand || 0;
    if (structure.supplyUpgrade && definition.upgradePowerDemand) {
      demand += definition.upgradePowerDemand;
    }
    const order = structure.productionQueue?.[0];
    if (order && definition.productionPowerDemand) {
      const unitDefinition = UNIT_DEFINITIONS[order.unitType];
      if (order.progress + EPSILON < unitDefinition.productionTime) {
        demand += definition.productionPowerDemand;
        demand += this.getFactoryProductionAssistState(structure.id).powerDemand;
      }
    }
    return demand;
  }

  getGenerationRate(team) {
    return this.structures
      .filter(
        (structure) =>
          structure.alive &&
          structure.complete &&
          structure.team === team &&
          Boolean(STRUCTURE_DEFINITIONS[structure.type].generationRate),
      )
      .reduce(
        (total, structure) => total + STRUCTURE_DEFINITIONS[structure.type].generationRate,
        0,
      );
  }

  getPlannedPowerDemandRate(team, additionalStructureType = null) {
    let demand = this.structures
      .filter((structure) => structure.alive && structure.team === team)
      .reduce(
        (total, structure) => total + plannedStructurePowerDemand(structure.type),
        0,
      );
    if (additionalStructureType) {
      demand += plannedStructurePowerDemand(additionalStructureType);
    }
    return demand;
  }

  getEnemyRequiredGenerationRate(team, additionalStructureType = null) {
    return this.getPlannedPowerDemandRate(team, additionalStructureType) *
      (1 + SIMULATION_RULES.enemyGenerationReserveRatio);
  }

  needsAdditionalGeneration(team, additionalStructureType) {
    if (!additionalStructureType || STRUCTURE_DEFINITIONS[additionalStructureType]?.generationRate) return false;
    return (
      this.getPlannedPowerDemandRate(team, additionalStructureType) >
      this.getGenerationRate(team) + EPSILON
    );
  }

  getEnemyStructureUpgradeRequest(teamId, reservedMetal = 0) {
    const unlockedTier = this.getUnlockedStructureTier(teamId);
    if (unlockedTier <= 1) return null;

    const account = this.resources[teamId];
    const minimumReserve = reservedMetal + SIMULATION_RULES.enemyStructureUpgradeMetalReserve;
    const plannedDemand = this.getPlannedPowerDemandRate(teamId);
    const generationRate = this.getGenerationRate(teamId);
    const candidates = this.structures
      .filter(
        (structure) =>
          structure.alive &&
          structure.complete &&
          structure.team === teamId &&
          STRUCTURE_DEFINITIONS[structure.type].family !== "battery",
      )
      .map((structure) => {
        const currentDefinition = STRUCTURE_DEFINITIONS[structure.type];
        const upgrade = this.getStructureUpgradeInfo(structure.id);
        if (!upgrade.valid || upgrade.targetTier > unlockedTier) return null;
        if (account.metal + EPSILON < upgrade.metalCost + minimumReserve) return null;

        const targetDefinition = STRUCTURE_DEFINITIONS[upgrade.targetType];
        if (!targetDefinition.generationRate) {
          const demandIncrease = Math.max(
            0,
            plannedStructurePowerDemand(upgrade.targetType) -
              plannedStructurePowerDemand(structure.type),
          );
          const requiredGeneration = (plannedDemand + demandIncrease) *
            (1 + SIMULATION_RULES.enemyGenerationReserveRatio);
          if (requiredGeneration > generationRate + EPSILON) return null;
        }

        return {
          structureId: structure.id,
          currentType: structure.type,
          ...upgrade,
          priority: AI_STRUCTURE_UPGRADE_PRIORITY[currentDefinition.family] || 0,
        };
      })
      .filter(Boolean)
      .sort(
        (left, right) =>
          left.targetTier - right.targetTier ||
          right.priority - left.priority ||
          left.structureId.localeCompare(right.structureId),
      );
    return candidates[0] || null;
  }

  getEnergyDemandRate(team) {
    return this.structures
      .filter(
        (structure) =>
          structure.alive &&
          structure.complete &&
          structure.team === team &&
          structure.powered,
      )
      .reduce((total, structure) => total + this.getStructurePowerDemandRate(structure), 0);
  }

  getNetEnergyRate(team) {
    return this.getGenerationRate(team) - this.getEnergyDemandRate(team);
  }

  rebuildCombatSpatialIndex() {
    this.combatSpatialIndex = new Map();
    for (const entity of [...this.units, ...this.droneCache, ...this.structures]) {
      if (!entity.alive || entity.carriedById) continue;
      const cellX = Math.floor(entity.x / COMBAT_SPATIAL_CELL_SIZE);
      const cellY = Math.floor(entity.y / COMBAT_SPATIAL_CELL_SIZE);
      const key = `${cellX},${cellY}`;
      const occupants = this.combatSpatialIndex.get(key);
      if (occupants) occupants.push(entity);
      else this.combatSpatialIndex.set(key, [entity]);
    }
    this.combatSpatialIndexDirty = false;
  }

  ensureCombatSpatialIndex() {
    if (this.combatSpatialIndexDirty) this.rebuildCombatSpatialIndex();
  }

  getNearbySpatialEntities(origin, range) {
    const searchRadius = range + MAX_COMBAT_TARGET_RADIUS;
    const minimumCellX = Math.floor((origin.x - searchRadius) / COMBAT_SPATIAL_CELL_SIZE);
    const maximumCellX = Math.floor((origin.x + searchRadius) / COMBAT_SPATIAL_CELL_SIZE);
    const minimumCellY = Math.floor((origin.y - searchRadius) / COMBAT_SPATIAL_CELL_SIZE);
    const maximumCellY = Math.floor((origin.y + searchRadius) / COMBAT_SPATIAL_CELL_SIZE);
    const candidates = [];
    for (let cellY = minimumCellY; cellY <= maximumCellY; cellY += 1) {
      for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
        const occupants = this.combatSpatialIndex.get(`${cellX},${cellY}`);
        if (occupants) candidates.push(...occupants);
      }
    }
    return candidates;
  }

  getNearbyHostileTargets(origin, range) {
    return this.getNearbySpatialEntities(origin, range).filter(
      (target) => this.areHostileTeams(target.team, origin.team) && target.alive,
    );
  }

  getNearbyAutomaticRepairTargets(worker, range) {
    return this.getNearbySpatialEntities(worker, range).filter(
      (target) =>
        isValidRepairTarget(worker, target) &&
        distanceToEntitySurface(worker, target) <= range + EPSILON,
    );
  }

  automaticTargetScanDue(entity, interval) {
    if (!Number.isFinite(entity.nextAutomaticTargetScanAt)) {
      entity.nextAutomaticTargetScanAt = this.time;
    }
    if (this.time + EPSILON < entity.nextAutomaticTargetScanAt) return false;
    entity.nextAutomaticTargetScanAt = nextDeterministicIntervalTime(
      entity.id,
      this.time,
      interval,
    );
    return true;
  }

  assignAutomaticTargets() {
    this.rebuildCombatSpatialIndex();
    for (const unit of this.units) {
      const definition = UNIT_DEFINITIONS[unit.type];
      if (!unit.alive || unit.carriedById || unit.state !== "active") continue;
      const buildTarget = this.getStructure(unit.buildTargetId);
      let repairTarget = this.getEntity(unit.repairTargetId);
      if (unit.repairTargetId && !isValidRepairTarget(unit, repairTarget)) {
        unit.repairTargetId = null;
        repairTarget = null;
      }
      let productionAssistTarget = this.getStructure(unit.productionAssistTargetId);
      if (
        unit.productionAssistTargetId &&
        !isValidProductionAssistTarget(unit, productionAssistTarget)
      ) {
        unit.productionAssistTargetId = null;
        productionAssistTarget = null;
      }
      const existingTarget = this.getEntity(unit.attackTargetId);
      const hasPriorityWorkerOrder = Boolean(
        unit.buildTargetId ||
        unit.buildQueue?.length ||
        unit.productionAssistTargetId ||
        unit.moveTarget ||
        unit.holdPosition ||
        (
          existingTarget?.alive &&
          ["explicit", "retaliation"].includes(unit.attackTargetMode)
        )
      );
      const canAcquireAutomaticTarget = Boolean(
        (definition.workerTier && definition.automaticRepairRange > 0) ||
        definition.automaticallyPursuesBeamTargets ||
        definition.attackRange > 0
      );
      const staggeredScanDue = canAcquireAutomaticTarget && this.automaticTargetScanDue(
        unit,
        SIMULATION_RULES.automaticTargetScanInterval,
      );
      const automaticScanDue = Boolean(definition.workerTier || unit.moveTarget || staggeredScanDue);
      if (
        definition.workerTier &&
        definition.automaticRepairRange > 0 &&
        !isValidRepairTarget(unit, repairTarget) &&
        !hasPriorityWorkerOrder &&
        automaticScanDue
      ) {
        repairTarget = nearestBySurfaceDistance(
          unit,
          this.getNearbyAutomaticRepairTargets(unit, definition.automaticRepairRange),
        );
        if (repairTarget) {
          unit.repairTargetId = repairTarget.id;
          unit.attackTargetId = null;
          unit.attackTargetMode = null;
          this.resetUnitNavigation(unit);
        }
      }
      if (
        definition.workerTier &&
        (
          (
            buildTarget?.alive &&
            !buildTarget.complete &&
            buildTarget.team === unit.team
          ) ||
          isValidRepairTarget(unit, repairTarget) ||
          isValidProductionAssistTarget(unit, productionAssistTarget)
        )
      ) {
        unit.attackTargetId = null;
        unit.attackTargetMode = null;
        continue;
      }
      if (definition.automaticallyPursuesBeamTargets) {
        if (
          existingTarget?.alive &&
          unit.attackTargetMode === "explicit" &&
          !isUnderbellyBeamTarget(existingTarget) &&
          canUnitAttackTarget(definition, existingTarget)
        ) {
          continue;
        }
        if (existingTarget?.alive || automaticScanDue) {
          this.assignAutomaticBeamPursuit(unit, definition, existingTarget);
        }
        continue;
      }
      if (definition.attackRange <= 0) continue;
      if (unit.moveTarget && unit.moveMode === "force") {
        unit.attackTargetId = null;
        unit.attackTargetMode = null;
        continue;
      }
      if (
        existingTarget?.alive &&
        this.areHostileTeams(existingTarget.team, unit.team) &&
        canUnitAttackTarget(definition, existingTarget) &&
        (
          unit.attackTargetMode === "explicit" ||
          unit.attackTargetMode === "retaliation" ||
          isUnitTargetInWeaponRange(definition, unit, existingTarget)
        )
      ) {
        continue;
      }
      unit.attackTargetId = null;
      unit.attackTargetMode = null;
      if (!automaticScanDue) continue;
      const potentialTargets = this.getNearbyHostileTargets(unit, definition.attackRange)
        .filter(
          (target) =>
            canUnitAttackTarget(definition, target) &&
            isUnitTargetInWeaponRange(definition, unit, target),
        );
      const target = nearest(unit, preferredTargets(definition, potentialTargets));
      unit.attackTargetId = target?.id || null;
      unit.attackTargetMode = target ? "automatic" : null;
    }
  }

  assignAutomaticBeamPursuit(unit, definition, existingTarget) {
    const validTarget = (target) => Boolean(
      target?.alive &&
      this.areHostileTeams(target.team, unit.team) &&
      isUnderbellyBeamTarget(target)
    );
    const followingPlayerRoute = Boolean(
      unit.moveTarget && unit.moveMode !== "pursuit"
    );
    if (unit.holdPosition || followingPlayerRoute) return false;

    let target = validTarget(existingTarget) ? existingTarget : null;
    if (!target) {
      const acquisitionRange = definition.automaticTargetAcquisitionRange || 0;
      const candidates = this.getNearbyHostileTargets(unit, acquisitionRange)
        .filter(
          (candidate) =>
            validTarget(candidate) &&
            distance(unit, candidate) <= acquisitionRange + entityRadius(candidate),
        );
      target = nearest(unit, preferredTargets(definition, candidates));
      unit.attackTargetId = target?.id || null;
      unit.attackTargetMode = target ? "automatic" : null;
    }
    if (!target) {
      if (unit.moveMode === "pursuit") this.advanceMoveQueue(unit);
      return false;
    }

    if (unit.attackTargetMode !== "explicit") unit.attackTargetMode = "automatic";
    unit.moveTarget = { x: target.x, y: target.y };
    unit.moveMode = "pursuit";
    return true;
  }

  updateEnemyAi(delta) {
    for (const team of this.teams.filter((candidate) => candidate.kind === "ai")) {
      this.updateAiTeam(team.id, delta);
    }
  }

  updateAiTeam(teamId, delta) {
    const aiState = this.aiStates[teamId];
    if (!aiState) return;
    const lossCutoff = this.time - SIMULATION_RULES.enemyConstructionLossMemoryDuration;
    aiState.constructionLosses = (aiState.constructionLosses || []).filter(
      (loss) => loss.time + EPSILON >= lossCutoff,
    );
    aiState.thinkRemaining -= delta;
    if (aiState.thinkRemaining > 0) return;
    aiState.thinkRemaining = this.getAiDifficultyProfile(teamId).thinkInterval;
    const hasLivingAssets =
      this.units.some((unit) => unit.alive && unit.team === teamId) ||
      this.structures.some((structure) => structure.alive && structure.team === teamId);
    if (!hasLivingAssets) return;

    const enemyFactories = this.structures.filter((structure) =>
      structure.alive &&
      structure.complete &&
      structure.team === teamId &&
      STRUCTURE_DEFINITIONS[structure.type].production?.length > 0
    );
    const enemyUnits = this.units.filter((unit) => unit.alive && unit.team === teamId);
    const enemyWorkers = enemyUnits.filter((unit) => UNIT_DEFINITIONS[unit.type].workerTier);
    this.reassignEnemyConstruction(enemyWorkers, teamId);

    const enemyAnchor = this.structures.find(
      (structure) =>
        structure.alive &&
        structure.complete &&
        structure.team === teamId &&
        STRUCTURE_DEFINITIONS[structure.type].generationRate,
    );
    const fallbackStart = this.teamStarts[teamId];
    const baseX = enemyAnchor?.x ?? fallbackStart?.x ?? this.width - 600;
    const baseY = enemyAnchor?.y ?? fallbackStart?.y ?? this.height / 2;
    const towardCenterX = this.width / 2 - baseX;
    const towardCenterY = this.height / 2 - baseY;
    const inwardLength = Math.hypot(towardCenterX, towardCenterY) || 1;
    const inwardX = fallbackStart?.inwardX ?? (teamId === "enemy" ? -1 : towardCenterX / inwardLength);
    const inwardY = fallbackStart?.inwardY ?? (teamId === "enemy" ? 0 : towardCenterY / inwardLength);
    const tangentX = fallbackStart?.tangentX ?? -inwardY;
    const tangentY = fallbackStart?.tangentY ?? inwardX;
    const planPoint = (forward, side = 0) => ({
      x: baseX + inwardX * forward + tangentX * side,
      y: baseY + inwardY * forward + tangentY * side,
    });
    const playerTargets = [
      ...this.units.filter(
        (entity) => entity.alive && this.areHostileTeams(entity.team, teamId),
      ),
      ...this.structures.filter(
        (entity) => entity.alive && this.areHostileTeams(entity.team, teamId),
      ),
    ];
    const desiredWaveSize = this.getEnemyAttackWaveSize(teamId);
    const expansionMines = this.getEnemyExpansionMines(teamId, enemyAnchor);
    const desiredGarrisonCount =
      expansionMines.length * SIMULATION_RULES.enemyOutpostGarrisonSize;
    const supplyState = this.getSupplyState(teamId);
    const supplyIsLow =
      supplyState.remaining <= supplyState.capacity * SIMULATION_RULES.enemySupplyLowRatio;
    const supplyComplex = this.structures.find(
      (structure) =>
        structure.alive &&
        structure.team === teamId &&
        STRUCTURE_DEFINITIONS[structure.type].supplyLevels,
    );
    const needsSupplyUpgrade = Boolean(
      supplyIsLow &&
      supplyComplex?.complete &&
      !supplyComplex.supplyUpgrade &&
      supplyComplex.supplyLevel < STRUCTURE_DEFINITIONS[supplyComplex.type].supplyLevels.length
    );
    if (needsSupplyUpgrade) {
      this.queueSupplyUpgrade(supplyComplex.id);
    }

    const supplyRequest = supplyIsLow && !supplyComplex
      ? {
        type: "supply_complex",
        ...planPoint(360, -480),
        advancesPlan: false,
      }
      : null;
    const strategicRequest = supplyRequest || (
      needsSupplyUpgrade
        ? null
        : this.getEnemyStrategicConstructionRequest(
          teamId,
          enemyAnchor,
          playerTargets,
          planPoint,
          aiState.decisionIndex,
        )
    );
    const pendingGenerator = this.structures.find(
      (structure) =>
        structure.alive &&
        !structure.complete &&
        structure.team === teamId &&
        Boolean(STRUCTURE_DEFINITIONS[structure.type].generationRate),
    );
    const needsGeneration =
      strategicRequest && this.needsAdditionalGeneration(teamId, strategicRequest.type);
    let constructionRequest = null;
    if (strategicRequest && !strategicRequest.waiting && (!needsGeneration || !pendingGenerator)) {
      if (needsGeneration) {
        const towardBaseX = baseX - strategicRequest.x;
        const towardBaseY = baseY - strategicRequest.y;
        const towardBaseLength = Math.hypot(towardBaseX, towardBaseY) || 1;
        const offset = STRUCTURE_DEFINITIONS.generator.powerRadius * 0.65;
        constructionRequest = {
          type: "generator",
          x: strategicRequest.x + (towardBaseX / towardBaseLength) * offset,
          y: strategicRequest.y + (towardBaseY / towardBaseLength) * offset,
          advancesPlan: false,
        };
      } else {
        constructionRequest = strategicRequest;
      }
    }
    const availableWorker = enemyWorkers.find(
      (worker) =>
        !worker.buildTargetId &&
        !worker.productionAssistTargetId &&
        worker.state === "active" &&
        constructionRequest &&
        canWorkerTierBuildStructure(
          UNIT_DEFINITIONS[worker.type].workerTier,
          constructionRequest.type,
        ),
    );
    let constructionStarted = false;
    if (
      constructionRequest &&
      availableWorker &&
      this.resources[teamId].metal >= STRUCTURE_DEFINITIONS[constructionRequest.type].metalCost
    ) {
      const site = STRUCTURE_DEFINITIONS[constructionRequest.type].generationRate
        ? this.findNearestValidBuildSite(
          constructionRequest.type,
          constructionRequest.x,
          constructionRequest.y,
          8,
          teamId,
          { avoidHostileThreats: true },
        )
        : this.findNearestValidPoweredBuildSite(
          constructionRequest.type,
          teamId,
          constructionRequest.x,
          constructionRequest.y,
          { avoidHostileThreats: true },
        );
      const construction = site.valid
        ? this.startConstruction(
          [availableWorker.id],
          constructionRequest.type,
          site.x,
          site.y,
        )
        : null;
      if (construction) {
        aiState.decisionIndex += 1;
        constructionStarted = true;
      }
    }

    const nextSupplyComplex = this.structures.find(
      (structure) =>
        structure.alive &&
        structure.team === teamId &&
        STRUCTURE_DEFINITIONS[structure.type].supplyLevels,
    );
    const nextSupplyRequest = supplyIsLow && !nextSupplyComplex
      ? { type: "supply_complex", ...planPoint(360, -480) }
      : null;
    const reservedPlan = nextSupplyRequest || (
      !constructionStarted && !needsSupplyUpgrade
        ? strategicRequest
        : this.getEnemyStrategicConstructionRequest(
          teamId,
          enemyAnchor,
          playerTargets,
          planPoint,
          aiState.decisionIndex,
        )
    );
    const reservedPlanMetal = reservedPlan
      ? STRUCTURE_DEFINITIONS[reservedPlan.type].metalCost
      : 0;
    const needsReservedGenerator =
      reservedPlan &&
      !this.structures.some(
        (structure) =>
          structure.alive &&
          !structure.complete &&
          structure.team === teamId &&
          Boolean(STRUCTURE_DEFINITIONS[structure.type].generationRate),
      ) &&
      this.needsAdditionalGeneration(teamId, reservedPlan.type);
    const supplyUpgradeDefinition =
      supplyIsLow && nextSupplyComplex?.complete && !nextSupplyComplex.supplyUpgrade
      ? STRUCTURE_DEFINITIONS[nextSupplyComplex.type].supplyLevels[
        nextSupplyComplex.supplyLevel || 1
      ]
      : null;
    const reservedMetal = Math.max(reservedPlanMetal, supplyUpgradeDefinition?.metalCost || 0) + (
      needsReservedGenerator ? STRUCTURE_DEFINITIONS.generator.metalCost : 0
    );
    const stagedCombatCount = enemyUnits.filter((unit) => {
      const definition = UNIT_DEFINITIONS[unit.type];
      return (
        isCombatUnitDefinition(definition) &&
        !isMobileEnergySupportDefinition(definition) &&
        unit.attackTargetMode !== "explicit" &&
        !["advance", "retreat"].includes(unit.moveMode)
      );
    }).length;
    const queuedCombatCount = enemyFactories.reduce(
      (total, factory) =>
        total + factory.productionQueue.filter(
          (order) => {
            const definition = UNIT_DEFINITIONS[order.unitType];
            return isCombatUnitDefinition(definition) &&
              !isMobileEnergySupportDefinition(definition);
          },
        ).length,
      0,
    );
    const stagedFieldUnits = this.getEnemyStagedCombatUnits(teamId);
    const preflightAssaultPlan = stagedFieldUnits.length >= desiredWaveSize &&
      playerTargets.length > 0
      ? this.getEnemyAssaultPlan(stagedFieldUnits, playerTargets, desiredWaveSize)
      : null;
    const assaultBlocked = Boolean(
      stagedFieldUnits.length >= desiredWaveSize &&
      playerTargets.length > 0 &&
      !preflightAssaultPlan
    );
    const needsCombatForce =
      stagedCombatCount + queuedCombatCount < desiredWaveSize + desiredGarrisonCount ||
      assaultBlocked;
    let queuedWorkerCount = enemyFactories.reduce(
      (total, factory) => total + factory.productionQueue.filter(
        (order) => UNIT_DEFINITIONS[order.unitType]?.workerTier,
      ).length,
      0,
    );
    const liveUnitTypeCounts = new Map();
    for (const unit of enemyUnits) {
      liveUnitTypeCounts.set(unit.type, (liveUnitTypeCounts.get(unit.type) || 0) + 1);
    }
    const queuedUnitTypeCounts = new Map();
    let structureUpgraded = false;
    if (!needsCombatForce) {
      const structureUpgrade = this.getEnemyStructureUpgradeRequest(teamId, reservedMetal);
      structureUpgraded = Boolean(
        structureUpgrade && this.upgradeStructure(structureUpgrade.structureId, teamId),
      );
    }

    for (const factory of enemyFactories) {
      for (const order of factory.productionQueue) {
        queuedUnitTypeCounts.set(
          order.unitType,
          (queuedUnitTypeCounts.get(order.unitType) || 0) + 1,
        );
      }
    }
    let supportCount = enemyUnits.filter(
      (unit) => isMobileEnergySupportDefinition(UNIT_DEFINITIONS[unit.type]),
    ).length + [...queuedUnitTypeCounts.entries()].reduce(
      (total, [unitType, count]) =>
        total + (isMobileEnergySupportDefinition(UNIT_DEFINITIONS[unitType]) ? count : 0),
      0,
    );
    let highestWorkerTier = Math.max(
      0,
      ...enemyWorkers.map((worker) => UNIT_DEFINITIONS[worker.type].workerTier),
      ...[...queuedUnitTypeCounts.keys()].map(
        (unitType) => UNIT_DEFINITIONS[unitType]?.workerTier || 0,
      ),
    );
    for (const factory of enemyFactories) {
      if (factory.productionQueue.length >= 2) continue;
      const factoryDefinition = STRUCTURE_DEFINITIONS[factory.type];
      const workerType = factoryDefinition.production.find(
        (unitType) => UNIT_DEFINITIONS[unitType].workerTier,
      );
      const combatTypes = factoryDefinition.production.filter(
        (unitType) => {
          const definition = UNIT_DEFINITIONS[unitType];
          return isCombatUnitDefinition(definition) &&
            !isMobileEnergySupportDefinition(definition);
        },
      );
      const combatType = combatTypes
        .map((unitType, order) => ({
          unitType,
          order,
          count: (liveUnitTypeCounts.get(unitType) || 0) +
            (queuedUnitTypeCounts.get(unitType) || 0),
        }))
        .sort((left, right) => left.count - right.count || left.order - right.order)[0]
        ?.unitType;
      const supportType = factoryDefinition.production.find(
        (unitType) => isMobileEnergySupportDefinition(UNIT_DEFINITIONS[unitType]),
      );
      const combatPopulation = stagedCombatCount + queuedCombatCount;
      const desiredSupportCount = combatPopulation >= desiredWaveSize
        ? Math.min(
          SIMULATION_RULES.enemyMaxMobileEnergySupport,
          1 + Math.floor(
            (combatPopulation - desiredWaveSize) /
              SIMULATION_RULES.enemyCombatUnitsPerMobileEnergySupport,
          ),
        )
        : 0;
      const replacingWorker = enemyWorkers.length + queuedWorkerCount < 3;
      const advancesWorkerTier =
        workerType && UNIT_DEFINITIONS[workerType].workerTier > highestWorkerTier;
      const needsSupport = supportType && supportCount < desiredSupportCount;
      const choice = replacingWorker || advancesWorkerTier
        ? workerType
        : needsSupport
          ? supportType
          : combatType;
      if (!choice) continue;
      const productionCost = UNIT_DEFINITIONS[choice].metalCost;
      const requiredReserve = replacingWorker || advancesWorkerTier || needsCombatForce
        ? 0
        : reservedMetal;
      if (this.resources[teamId].metal + EPSILON < productionCost + requiredReserve) continue;
      if (this.queueProduction(factory.id, choice)) {
        queuedUnitTypeCounts.set(choice, (queuedUnitTypeCounts.get(choice) || 0) + 1);
        if (UNIT_DEFINITIONS[choice].workerTier) {
          queuedWorkerCount += 1;
          highestWorkerTier = Math.max(
            highestWorkerTier,
            UNIT_DEFINITIONS[choice].workerTier,
          );
        }
        if (isMobileEnergySupportDefinition(UNIT_DEFINITIONS[choice])) supportCount += 1;
      }
    }

    if (!structureUpgraded) {
      const structureUpgrade = this.getEnemyStructureUpgradeRequest(teamId, reservedMetal);
      if (structureUpgrade) this.upgradeStructure(structureUpgrade.structureId, teamId);
    }
    this.assignEnemyProductionAssistants(teamId, enemyWorkers, enemyFactories);

    this.updateEnemyExpansionGarrisons(teamId, enemyAnchor, playerTargets);
    const rushTargets = playerTargets.filter((target) =>
      this.structures.some(
        (structure) =>
          structure.alive &&
          structure.team === teamId &&
          distance(structure, target) <= SIMULATION_RULES.enemyRushResponseRadius,
      ),
    );
    if (rushTargets.length === 0) this.stageEnemyCombatUnitsForRecharge(teamId);
    const stagedUnits = this.getEnemyStagedCombatUnits(teamId, {
      includeRecharging: rushTargets.length > 0,
    });
    // A local threat should trigger a fast response, but never by sending a
    // single newly produced defender across the map. Keep the response
    // immediate once a force is ready while requiring the same minimum
    // coordinated wave as a normal assault.
    const stagedUnitsUnchanged = stagedUnits.length === stagedFieldUnits.length &&
      stagedUnits.every((unit, index) => unit.id === stagedFieldUnits[index]?.id);
    const assaultPlan = rushTargets.length > 0 && stagedUnits.length >= desiredWaveSize
      ? {
        target: nearest(stagedUnits[0], rushTargets),
        wave: stagedUnits,
      }
      : stagedUnitsUnchanged
        ? preflightAssaultPlan
        : this.getEnemyAssaultPlan(stagedUnits, playerTargets, desiredWaveSize);
    if (assaultPlan) {
      const { target, wave } = assaultPlan;
      const waveCenter = {
        x: wave.reduce((total, unit) => total + unit.x, 0) / wave.length,
        y: wave.reduce((total, unit) => total + unit.y, 0) / wave.length,
      };
      if (target) {
        this.commandMove(
          wave.map((unit) => unit.id),
          target.x,
          target.y,
          { mode: "advance" },
        );
        this.emit("enemy_wave", waveCenter.x, waveCenter.y, {
          team: teamId,
          unitIds: wave.map((unit) => unit.id),
          targetId: target.id,
        });
      }
    }
  }

  assignEnemyProductionAssistants(teamId, enemyWorkers = null, enemyFactories = null) {
    const workers = (enemyWorkers || this.units.filter(
      (unit) =>
        unit.alive &&
        unit.team === teamId &&
        Boolean(UNIT_DEFINITIONS[unit.type].workerTier),
    )).filter(
      (worker) => worker.alive && worker.team === teamId && worker.state === "active",
    );
    const factories = (enemyFactories || this.structures.filter(
      (structure) =>
        structure.alive &&
        structure.complete &&
        structure.team === teamId &&
        Boolean(STRUCTURE_DEFINITIONS[structure.type].production?.length),
    )).filter((factory) => isActivelyProducingFactory(factory));

    const reservedWorkerIds = new Set(
      [...workers]
        .sort(
          (left, right) =>
            UNIT_DEFINITIONS[right.type].workerTier - UNIT_DEFINITIONS[left.type].workerTier ||
            right.id.localeCompare(left.id),
        )
        .slice(0, SIMULATION_RULES.enemyMinimumFreeWorkers)
        .map((worker) => worker.id),
    );
    const validAssistants = [];
    for (const worker of workers) {
      if (!worker.productionAssistTargetId) continue;
      const factory = this.getStructure(worker.productionAssistTargetId);
      if (
        !reservedWorkerIds.has(worker.id) &&
        factory &&
        factories.includes(factory) &&
        isValidProductionAssistTarget(worker, factory)
      ) {
        validAssistants.push(worker);
      } else {
        worker.productionAssistTargetId = null;
        this.resetUnitNavigation(worker);
      }
    }
    const maximumAssistantCount = Math.max(
      0,
      workers.length - SIMULATION_RULES.enemyMinimumFreeWorkers,
    );
    const excessAssistantCount = Math.max(0, validAssistants.length - maximumAssistantCount);
    validAssistants
      .sort(
        (left, right) =>
          UNIT_DEFINITIONS[right.type].workerTier - UNIT_DEFINITIONS[left.type].workerTier ||
          right.id.localeCompare(left.id),
      )
      .slice(0, excessAssistantCount)
      .forEach((worker) => {
        worker.productionAssistTargetId = null;
        this.resetUnitNavigation(worker);
      });
    if (workers.length <= SIMULATION_RULES.enemyMinimumFreeWorkers || factories.length === 0) {
      return 0;
    }

    const assistantCounts = new Map(factories.map((factory) => [factory.id, 0]));
    let existingAssistantCount = 0;
    let existingAssistantDemand = 0;
    for (const worker of workers) {
      const factory = this.getStructure(worker.productionAssistTargetId);
      if (
        !factory ||
        !assistantCounts.has(factory.id) ||
        !isValidProductionAssistTarget(worker, factory)
      ) {
        continue;
      }
      assistantCounts.set(factory.id, assistantCounts.get(factory.id) + 1);
      existingAssistantCount += 1;
      existingAssistantDemand += UNIT_DEFINITIONS[worker.type].productionAssistPowerDemand || 0;
    }

    let assignmentBudget = Math.max(
      0,
      workers.length - SIMULATION_RULES.enemyMinimumFreeWorkers - existingAssistantCount,
    );
    let powerHeadroom = Math.max(
      0,
      this.getGenerationRate(teamId) / (1 + SIMULATION_RULES.enemyGenerationReserveRatio) -
        this.getPlannedPowerDemandRate(teamId) -
        existingAssistantDemand,
    );
    const idleWorkers = workers
      .filter(
        (worker) =>
          !worker.buildTargetId &&
          !(worker.buildQueue?.length) &&
          !worker.repairTargetId &&
          !worker.productionAssistTargetId &&
          !worker.transportTargetId &&
          !worker.attackTargetId &&
          !worker.moveTarget &&
          !worker.holdPosition &&
          !reservedWorkerIds.has(worker.id),
      )
      .sort(
        (left, right) =>
          UNIT_DEFINITIONS[left.type].workerTier - UNIT_DEFINITIONS[right.type].workerTier ||
          left.id.localeCompare(right.id),
      );
    let assigned = 0;
    for (const worker of idleWorkers) {
      if (assignmentBudget <= 0) break;
      const workerDemand = UNIT_DEFINITIONS[worker.type].productionAssistPowerDemand || 0;
      if (workerDemand > powerHeadroom + EPSILON) continue;
      const factory = factories
        .filter(
          (candidate) =>
            assistantCounts.get(candidate.id) <
              SIMULATION_RULES.enemyMaxProductionAssistantsPerFactory,
        )
        .sort(
          (left, right) =>
            assistantCounts.get(left.id) - assistantCounts.get(right.id) ||
            right.productionQueue.length - left.productionQueue.length ||
            left.id.localeCompare(right.id),
        )[0];
      if (!factory) break;
      if (!this.commandAssistProduction([worker.id], factory.id)) continue;
      assistantCounts.set(factory.id, assistantCounts.get(factory.id) + 1);
      assignmentBudget -= 1;
      powerHeadroom -= workerDemand;
      assigned += 1;
    }
    return assigned;
  }

  getEnemyStrategicConstructionRequest(
    teamId,
    enemyAnchor,
    playerTargets,
    planPoint,
    decisionIndex = 0,
  ) {
    const structures = this.structures.filter(
      (structure) => structure.alive && structure.team === teamId,
    );
    const anchor = enemyAnchor || planPoint(0, 0);
    const countFamily = (family) => structures.filter(
      (structure) => STRUCTURE_DEFINITIONS[structure.type].family === family,
    ).length;
    const combatUnits = this.units.filter(
      (unit) =>
        unit.alive &&
        unit.team === teamId &&
        isCombatUnitDefinition(UNIT_DEFINITIONS[unit.type]),
    ).length;
    const queuedCombatUnits = structures.reduce(
      (total, structure) => total + (structure.productionQueue || []).filter(
        (order) => isCombatUnitDefinition(UNIT_DEFINITIONS[order.unitType]),
      ).length,
      0,
    );
    const combatStrength = combatUnits + queuedCombatUnits;
    const mineCount = structures.filter(
      (structure) => STRUCTURE_DEFINITIONS[structure.type].family === "metal_mine",
    ).length;
    const completedMineCount = structures.filter(
      (structure) =>
        structure.complete &&
        STRUCTURE_DEFINITIONS[structure.type].family === "metal_mine",
    ).length;
    const factoryCount = structures.filter(
      (structure) => STRUCTURE_DEFINITIONS[structure.type].factoryBranch,
    ).length;
    const generatorCount = countFamily("generator");
    const sentryCount = countFamily("sentry_turret");
    const shieldCount = countFamily("shield_turret");
    const flakCount = countFamily("flak_turret");
    const chargerCount = countFamily("charger");
    const relayCount = countFamily("power_tower");
    const radarCount = countFamily("radar_tower");
    const salvageYardCount = countFamily("salvage_yard");
    const generatorConstructionPending = structures.some(
      (structure) =>
        !structure.complete && Boolean(STRUCTURE_DEFINITIONS[structure.type].generationRate),
    );
    const powerConsumerCount = structures.filter(
      (structure) => !STRUCTURE_DEFINITIONS[structure.type].generationRate,
    ).length;
    const nearbyThreats = playerTargets.filter((target) =>
      structures.some(
        (structure) => distance(structure, target) <= SIMULATION_RULES.enemyRushResponseRadius,
      ),
    );
    const nearbyCombatThreats = nearbyThreats.filter((target) => {
      const definition = target.kind === "unit"
        ? UNIT_DEFINITIONS[target.type]
        : STRUCTURE_DEFINITIONS[target.type];
      return (definition?.attackDamage || 0) > 0;
    });
    const enemyAircraft = playerTargets.filter(
      (target) =>
        target.kind === "unit" &&
        UNIT_DEFINITIONS[target.type]?.movementLayer === "air",
    );
    const nearbyAircraft = enemyAircraft.filter((target) => nearbyThreats.includes(target));
    const basicForceReady = combatStrength >= this.getEnemyAttackWaveSize(teamId);
    const radarForceReady = combatStrength >=
      this.getEnemyAttackWaveSize(teamId) + SIMULATION_RULES.enemyOutpostGarrisonSize;
    const coreBaseReady = generatorCount >= 2 && sentryCount > 0 && basicForceReady;
    const unlockedTier = this.getUnlockedStructureTier(teamId);
    const highestWorkerTier = Math.max(
      1,
      ...this.units
        .filter((unit) => unit.alive && unit.team === teamId)
        .map((unit) => UNIT_DEFINITIONS[unit.type].workerTier || 0),
    );
    const operationalTier = Math.min(unlockedTier, highestWorkerTier);
    const structureTier = (structure) => {
      const definition = STRUCTURE_DEFINITIONS[structure.type];
      return definition.tier || definition.buildTier || 1;
    };
    const hasFamilyAtTier = (family, tier) => structures.some(
      (structure) =>
        STRUCTURE_DEFINITIONS[structure.type].family === family &&
        structureTier(structure) >= tier,
    );
    const hasFactoryBranchAtTier = (branch, tier) => structures.some(
      (structure) => {
        const definition = STRUCTURE_DEFINITIONS[structure.type];
        return definition.factoryBranch === branch && structureTier(structure) >= tier;
      },
    );
    const hasFactoryBranchAtExactTier = (branch, tier) => structures.some(
      (structure) => {
        const definition = STRUCTURE_DEFINITIONS[structure.type];
        return definition.factoryBranch === branch && structureTier(structure) === tier;
      },
    );
    const tieredType = (baseType, tier) => tier > 1 ? `${baseType}_t${tier}` : baseType;
    const sideSign = (decisionIndex + (this.teams.find((team) => team.id === teamId)?.slot || 0)) % 2
      ? -1
      : 1;
    const laneOffset = 120 + (decisionIndex % 3) * 60;
    const candidates = [];
    const addCandidate = (score, type, point) => {
      let variation = 0;
      const variationKey = `${teamId}:${type}:${decisionIndex}`;
      for (let index = 0; index < variationKey.length; index += 1) {
        variation = (variation * 31 + variationKey.charCodeAt(index)) % 17;
      }
      candidates.push({ score: score + variation * 0.01, type, ...point });
    };

    if (factoryCount === 0) {
      addCandidate(130, "mech_factory_t1", planPoint(160, sideSign * 220));
    }

    const committedGenerationRate = structures
      .filter((structure) => STRUCTURE_DEFINITIONS[structure.type].generationRate)
      .reduce(
        (total, structure) => total + STRUCTURE_DEFINITIONS[structure.type].generationRate,
        0,
      );
    const desiredGeneratorCount = Math.max(
      2,
      Math.ceil(
        powerConsumerCount / SIMULATION_RULES.enemyPowerConsumersPerGenerator,
      ),
    );
    const generationCapacityShortfall =
      committedGenerationRate + EPSILON < this.getEnemyRequiredGenerationRate(teamId);
    if (
      !generatorConstructionPending &&
      (generatorCount < desiredGeneratorCount || generationCapacityShortfall)
    ) {
      const generatorRing = Math.floor(generatorCount / 3);
      addCandidate(
        generatorCount < 2 ? 94 : 90,
        tieredType("generator", operationalTier),
        planPoint(
          -80 + (generatorCount % 3) * 80,
          sideSign * (220 + generatorRing * 100),
        ),
      );
    }

    const canInvestInTechnology =
      this.resources[teamId].metal > SIMULATION_RULES.enemyLowMetalThreshold;
    if (
      canInvestInTechnology &&
      coreBaseReady &&
      completedMineCount >= SIMULATION_RULES.enemyTierTwoMineCount &&
      !hasFactoryBranchAtTier("mech", 2)
    ) {
      addCandidate(116, "mech_factory_t2", planPoint(280, sideSign * 360));
    }
    if (
      coreBaseReady &&
      canInvestInTechnology &&
      completedMineCount >= SIMULATION_RULES.enemyTierThreeMineCount &&
      unlockedTier >= 2 &&
      highestWorkerTier >= 2 &&
      !hasFactoryBranchAtTier("mech", 3)
    ) {
      addCandidate(118, "mech_factory_t3", planPoint(420, -sideSign * 360));
    }

    if (
      coreBaseReady &&
      canInvestInTechnology &&
      completedMineCount >= SIMULATION_RULES.enemyTierTwoMineCount
    ) {
      const nextVehicleTier = [1, 2, 3].find(
        (tier) => tier <= operationalTier && !hasFactoryBranchAtExactTier("vehicle", tier),
      );
      const nextAirTier = [2, 3].find(
        (tier) => tier <= operationalTier && !hasFactoryBranchAtExactTier("air", tier),
      );
      if (nextVehicleTier) {
        addCandidate(
          106 - nextVehicleTier * 2,
          `vehicle_factory_t${nextVehicleTier}`,
          planPoint(320 + nextVehicleTier * 80, sideSign * 460),
        );
      } else if (nextAirTier) {
        addCandidate(
          104 - nextAirTier * 2,
          `air_factory_t${nextAirTier}`,
          planPoint(440 + nextAirTier * 80, -sideSign * 460),
        );
      }
    }

    if (operationalTier >= 2) {
      const advancedGenerator = tieredType("generator", operationalTier);
      const advancedSentry = tieredType("sentry_turret", operationalTier);
      const advancedFlak = tieredType("flak_turret", operationalTier);
      const advancedRadar = tieredType("radar_tower", operationalTier);
      if (!hasFamilyAtTier("generator", operationalTier)) {
        addCandidate(82, advancedGenerator, planPoint(-80, sideSign * 260));
      }
      if (!hasFamilyAtTier("sentry_turret", operationalTier)) {
        addCandidate(86, advancedSentry, planPoint(160, sideSign * 320));
      }
      if (flakCount > 0 && !hasFamilyAtTier("flak_turret", operationalTier)) {
        addCandidate(87, advancedFlak, planPoint(220, -sideSign * 320));
      }
      if (radarCount > 0 && !hasFamilyAtTier("radar_tower", operationalTier)) {
        addCandidate(81, advancedRadar, planPoint(40, sideSign * 380));
      }
    }

    if (coreBaseReady && radarForceReady && radarCount === 0) {
      addCandidate(109, "radar_tower", planPoint(20, sideSign * 300));
    }

    const desiredSentryCount = Math.min(
      4,
      1 + Math.floor(Math.max(0, mineCount - 1) / 2) + (nearbyThreats.length > 0 ? 1 : 0),
    );
    if (sentryCount < desiredSentryCount) {
      const threat = nearest(anchor, nearbyThreats);
      if (threat) {
        const threatDistance = distance(anchor, threat) || 1;
        addCandidate(120, "sentry_turret", {
          x: anchor.x + ((threat.x - anchor.x) / threatDistance) * 150
            - ((threat.y - anchor.y) / threatDistance) * sideSign * 50,
          y: anchor.y + ((threat.y - anchor.y) / threatDistance) * 150
            + ((threat.x - anchor.x) / threatDistance) * sideSign * 50,
        });
      } else {
        addCandidate(88, "sentry_turret", planPoint(100, -sideSign * (160 + sentryCount * 80)));
      }
    }

    const productionBranchesReady =
      hasFactoryBranchAtTier("vehicle", operationalTier) &&
      (operationalTier < 2 || hasFactoryBranchAtTier("air", operationalTier));
    const desiredShieldCount =
      coreBaseReady &&
      mineCount >= 2 &&
      (productionBranchesReady || nearbyCombatThreats.length > 0)
      ? Math.min(
        3,
        1 + Math.floor(Math.max(0, mineCount - 2) / 2) +
          (nearbyCombatThreats.length > 0 ? 1 : 0),
      )
      : 0;
    if (shieldCount < desiredShieldCount) {
      addCandidate(
        nearbyCombatThreats.length > 0 ? 121 : 102,
        tieredType("shield_turret", operationalTier),
        planPoint(20 + shieldCount * 80, -sideSign * (140 + shieldCount * 110)),
      );
    }

    const desiredFlakCount = Math.min(3, Math.ceil(nearbyAircraft.length / 3));
    if (flakCount < desiredFlakCount) {
      const airThreat = nearest(anchor, nearbyAircraft);
      const threatDistance = distance(anchor, airThreat) || 1;
      addCandidate(124, tieredType("flak_turret", operationalTier), {
        x: anchor.x + ((airThreat.x - anchor.x) / threatDistance) * 130,
        y: anchor.y + ((airThreat.y - anchor.y) / threatDistance) * 130,
      });
    }

    const outpostDefenseRequest = this.getEnemyOutpostDefenseRequest(teamId, enemyAnchor, {
      sentryType: tieredType("sentry_turret", operationalTier),
    });
    if (outpostDefenseRequest) {
      const outpostDefenseScore = this.resources[teamId].metal <= SIMULATION_RULES.enemyLowMetalThreshold
        ? 102
        : 126;
      addCandidate(outpostDefenseScore, outpostDefenseRequest.type, outpostDefenseRequest);
    }

    const chargerDemandUnits = this.getEnemyChargerDemandUnits(teamId, anchor);
    if (
      chargerCount === 0 &&
      chargerDemandUnits.length >= SIMULATION_RULES.enemyChargerMinimumDemandUnits
    ) {
      const demandCenter = {
        x: chargerDemandUnits.reduce((total, unit) => total + unit.x, 0) /
          chargerDemandUnits.length,
        y: chargerDemandUnits.reduce((total, unit) => total + unit.y, 0) /
          chargerDemandUnits.length,
      };
      addCandidate(110, tieredType("charger", operationalTier), demandCenter);
    }

    const fortifiedOpposition = this.hasEnemyHeavyDefenseCluster(teamId);
    const expansionRequest = this.getEnemyExpansionRequest(enemyAnchor, teamId, {
      mineType: tieredType("metal_mine", operationalTier),
      generatorType: tieredType("generator", operationalTier),
    });
    if (expansionRequest && !expansionRequest.waiting && (mineCount === 0 || coreBaseReady)) {
      const metal = this.resources[teamId].metal;
      const expansionScore = metal <= SIMULATION_RULES.enemyLowMetalThreshold
        ? 108
        : fortifiedOpposition
          ? 110
          : expansionRequest.urgent
            ? 92
            : 62;
      addCandidate(expansionScore, expansionRequest.type, expansionRequest);
    }

    const desiredRelayCount = Math.min(3, Math.max(0, mineCount - 1));
    if (relayCount < desiredRelayCount) {
      addCandidate(60, "power_tower", planPoint(300 + relayCount * 150, sideSign * laneOffset));
    }

    const reclaimableWrecks = this.wrecks.filter((wreck) => wreck.metal > EPSILON);
    const reclaimableMetal = reclaimableWrecks.reduce((total, wreck) => total + wreck.metal, 0);
    const desiredSalvageYards = reclaimableMetal >= 60 || combatStrength >= 6 ? 1 : 0;
    if (salvageYardCount < desiredSalvageYards) {
      const nearbyWreck = nearest(anchor, reclaimableWrecks);
      const salvagePoint = nearbyWreck && distance(anchor, nearbyWreck) <= 700
        ? nearbyWreck
        : planPoint(180, -sideSign * 300);
      addCandidate(reclaimableMetal >= 60 ? 74 : 42, "salvage_yard", salvagePoint);
    }

    const desiredFactoryCount = 1 + Math.floor(Math.max(0, mineCount - 1) / 2);
    if (factoryCount < desiredFactoryCount && basicForceReady) {
      addCandidate(64, "mech_factory_t1", planPoint(240 + factoryCount * 160, -sideSign * 320));
    }

    candidates.sort((left, right) => right.score - left.score || left.type.localeCompare(right.type));
    const selected = candidates[0];
    if (!selected) return null;
    const { score, ...request } = selected;
    return request;
  }

  getEnemyExpansionRequest(
    enemyAnchor,
    teamId = "enemy",
    { mineType = "metal_mine", generatorType = "generator" } = {},
  ) {
    if (!enemyAnchor) return null;
    const enemyMineCount = this.structures.filter(
      (structure) =>
        structure.alive &&
        structure.team === teamId &&
        STRUCTURE_DEFINITIONS[structure.type].family === "metal_mine",
    ).length;
    const metal = this.resources[teamId].metal;
    const fortifiedOpposition = this.hasEnemyHeavyDefenseCluster(teamId);
    const desiredMineCount = 2 + Math.floor(this.time / SIMULATION_RULES.enemyExpansionInterval) + (
      fortifiedOpposition ? SIMULATION_RULES.enemyFortifiedExpansionBonus : 0
    );
    const expansionBehindSchedule = enemyMineCount < desiredMineCount;
    const shouldExpand =
      expansionBehindSchedule ||
      metal <= SIMULATION_RULES.enemyLowMetalThreshold ||
      metal >= SIMULATION_RULES.enemyExpansionSurplusMetal;
    if (!shouldExpand) return null;

    const occupiedDepositIds = new Set(
      this.structures
        .filter(
          (structure) =>
            structure.alive &&
            STRUCTURE_DEFINITIONS[structure.type].requiresDeposit &&
            structure.depositId,
        )
        .map((structure) => structure.depositId),
    );
    const targetDeposit = this.metalDeposits
      .filter(
        (deposit) =>
          !occupiedDepositIds.has(deposit.id) &&
          this.evaluatePlacement(mineType, deposit.x, deposit.y, teamId).valid &&
          this.isAiConstructionSiteSafe(teamId, mineType, deposit.x, deposit.y),
      )
      .sort(
        (left, right) =>
          Number(left.remote) - Number(right.remote) ||
          distance(left, enemyAnchor) - distance(right, enemyAnchor),
      )[0];
    if (!targetDeposit) return null;

    if (this.isBuildSiteConnectedToPower(mineType, teamId, targetDeposit.x, targetDeposit.y)) {
      return {
        type: mineType,
        x: targetDeposit.x,
        y: targetDeposit.y,
        advancesPlan: false,
        urgent: expansionBehindSchedule,
      };
    }

    const generatorRadius = STRUCTURE_DEFINITIONS[generatorType].powerRadius;
    const pendingOutpostGenerator = this.structures.some(
      (structure) =>
        structure.alive &&
        !structure.complete &&
        structure.team === teamId &&
        STRUCTURE_DEFINITIONS[structure.type].generationRate &&
        distance(structure, targetDeposit) <= generatorRadius,
    );
    if (pendingOutpostGenerator) {
      return {
        type: "metal_mine",
        x: targetDeposit.x,
        y: targetDeposit.y,
        advancesPlan: false,
        waiting: true,
        urgent: expansionBehindSchedule,
      };
    }

    const towardBaseX = Math.sign(enemyAnchor.x - targetDeposit.x);
    const towardBaseY = Math.sign(enemyAnchor.y - targetDeposit.y);
    const generatorOffset = generatorRadius * 0.55;
    return {
      type: generatorType,
      x: targetDeposit.x + towardBaseX * generatorOffset,
      y: targetDeposit.y + towardBaseY * generatorOffset,
      advancesPlan: false,
      urgent: expansionBehindSchedule,
    };
  }

  getEnemyExpansionMines(teamId = "enemy", enemyAnchor = null) {
    const home = this.teamStarts[teamId] || enemyAnchor;
    if (!home) return [];
    return this.structures.filter(
      (structure) =>
        structure.alive &&
        structure.complete &&
        structure.team === teamId &&
        STRUCTURE_DEFINITIONS[structure.type].family === "metal_mine" &&
        distance(structure, home) >= SIMULATION_RULES.enemyOutpostDistance,
    );
  }

  getEnemyOutpostDefenseRequest(
    teamId = "enemy",
    enemyAnchor = null,
    { sentryType = "sentry_turret" } = {},
  ) {
    const undefendedMine = this.getEnemyExpansionMines(teamId, enemyAnchor).find(
      (mine) => !this.structures.some(
        (structure) =>
          structure.alive &&
          structure.team === teamId &&
          STRUCTURE_DEFINITIONS[structure.type].family === "sentry_turret" &&
          distance(structure, mine) <= SIMULATION_RULES.enemyOutpostDefenseRadius,
      ),
    );
    if (!undefendedMine) return null;
    const home = this.teamStarts[teamId] || enemyAnchor;
    const hostileStart = nearest(
      undefendedMine,
      this.teams
        .filter((team) => this.areHostileTeams(team.id, teamId))
        .map((team) => this.teamStarts[team.id])
        .filter(Boolean),
    );
    let towardEnemyX = hostileStart
      ? hostileStart.x - undefendedMine.x
      : undefendedMine.x - home.x;
    let towardEnemyY = hostileStart
      ? hostileStart.y - undefendedMine.y
      : undefendedMine.y - home.y;
    let towardEnemyLength = Math.hypot(towardEnemyX, towardEnemyY);
    if (towardEnemyLength <= EPSILON) {
      towardEnemyX = undefendedMine.x - home.x;
      towardEnemyY = undefendedMine.y - home.y;
      towardEnemyLength = Math.hypot(towardEnemyX, towardEnemyY) || 1;
    }
    return {
      type: sentryType,
      x: undefendedMine.x + (towardEnemyX / towardEnemyLength) * 80,
      y: undefendedMine.y + (towardEnemyY / towardEnemyLength) * 80,
      advancesPlan: false,
      outpostMineId: undefendedMine.id,
    };
  }

  updateEnemyExpansionGarrisons(teamId, enemyAnchor, playerTargets = []) {
    const expansionMines = this.getEnemyExpansionMines(teamId, enemyAnchor);
    const activeMineIds = new Set(expansionMines.map((mine) => mine.id));
    const combatUnits = this.units.filter((unit) =>
      unit.alive &&
      unit.state === "active" &&
      unit.team === teamId &&
      isCombatUnitDefinition(UNIT_DEFINITIONS[unit.type]),
    );
    for (const unit of combatUnits) {
      if (unit.garrisonStructureId && !activeMineIds.has(unit.garrisonStructureId)) {
        unit.garrisonStructureId = null;
      }
    }

    for (const mine of expansionMines) {
      const defenders = combatUnits.filter((unit) => unit.garrisonStructureId === mine.id);
      const candidates = combatUnits
        .filter((unit) =>
          !unit.garrisonStructureId &&
          !unit.moveTarget &&
          !this.getEntity(unit.attackTargetId)?.alive,
        )
        .sort((left, right) => distance(left, mine) - distance(right, mine));
      while (
        defenders.length < SIMULATION_RULES.enemyOutpostGarrisonSize &&
        candidates.length > 0
      ) {
        const defender = candidates.shift();
        defender.garrisonStructureId = mine.id;
        defenders.push(defender);
      }

      const localThreats = playerTargets.filter((target) =>
        target.alive &&
        distance(target, mine) <= SIMULATION_RULES.enemyOutpostResponseRadius,
      );
      const localTarget = nearest(mine, localThreats);
      for (const [index, defender] of defenders.entries()) {
        if (localTarget) {
          if (
            defender.attackTargetId !== localTarget.id ||
            defender.attackTargetMode !== "explicit"
          ) {
            this.commandAttack([defender.id], localTarget.id);
          }
          continue;
        }
        const target = this.getEntity(defender.attackTargetId);
        const guardAngle = (index / Math.max(1, defenders.length)) * Math.PI * 2;
        const guardPoint = {
          x: mine.x + Math.cos(guardAngle) * 90,
          y: mine.y + Math.sin(guardAngle) * 90,
        };
        if (
          target?.alive &&
          distance(target, mine) <= SIMULATION_RULES.enemyOutpostResponseRadius
        ) {
          continue;
        }
        if (distance(defender, guardPoint) <= SIMULATION_RULES.enemyOutpostGarrisonLeash) {
          if (target?.alive || defender.moveTarget) this.commandStop([defender.id], true);
          continue;
        }
        if (defender.moveTarget && distance(defender.moveTarget, guardPoint) <= 10) continue;
        this.commandMove([defender.id], guardPoint.x, guardPoint.y, { force: true });
      }
    }
  }

  hasEnemyHeavyDefenseCluster(teamId = "enemy") {
    const defenses = this.structures.filter(
      (structure) =>
        structure.alive &&
        structure.complete &&
        this.areHostileTeams(structure.team, teamId) &&
        STRUCTURE_DEFINITIONS[structure.type].family === "sentry_turret",
    );
    const heaviestDefenseCluster = defenses.reduce(
      (largest, defense) => Math.max(
        largest,
        defenses.filter(
          (candidate) =>
            distance(defense, candidate) <= SIMULATION_RULES.enemyHeavyDefenseRadius,
        ).length,
      ),
      0,
    );
    return heaviestDefenseCluster >= SIMULATION_RULES.enemyHeavyDefenseCount;
  }

  getEnemyAttackWaveSize(teamId = "enemy") {
    return this.getAiDifficultyProfile(teamId).attackWaveSize;
  }

  getEnemyChargerDemandUnits(teamId, anchor = null) {
    const stagingAnchor = anchor || this.structures.find(
      (structure) =>
        structure.alive &&
        structure.complete &&
        structure.team === teamId &&
        STRUCTURE_DEFINITIONS[structure.type].generationRate,
    ) || this.teamStarts[teamId];
    return this.units.filter((unit) => {
      const definition = UNIT_DEFINITIONS[unit.type];
      return (
        unit.alive &&
        unit.team === teamId &&
        isCombatUnitDefinition(definition) &&
        unit.energy <=
          definition.maxEnergy * SIMULATION_RULES.enemyChargerDemandEnergyRatio + EPSILON &&
        (
          !stagingAnchor ||
          distance(unit, stagingAnchor) <= SIMULATION_RULES.enemyChargerStagingRadius
        )
      );
    });
  }

  stageEnemyCombatUnitsForRecharge(teamId = "enemy") {
    const chargers = this.structures.filter((structure) => {
      const definition = STRUCTURE_DEFINITIONS[structure.type];
      return (
        structure.alive &&
        structure.complete &&
        structure.powered &&
        structure.team === teamId &&
        definition.chargeRadius
      );
    });
    if (chargers.length === 0) return 0;

    let routed = 0;
    for (const unit of this.getEnemyChargerDemandUnits(teamId)) {
      const target = this.getEntity(unit.attackTargetId);
      if (
        unit.state !== "active" ||
        unit.garrisonStructureId ||
        target?.alive ||
        unit.moveTarget
      ) {
        continue;
      }
      const charger = nearest(unit, chargers);
      const definition = STRUCTURE_DEFINITIONS[charger.type];
      const chargerDistance = distance(unit, charger);
      if (chargerDistance <= definition.chargeRadius) continue;
      if (chargerDistance > SIMULATION_RULES.enemyChargerStagingRadius) continue;
      routed += this.commandMove([unit.id], charger.x, charger.y, { force: true });
    }
    return routed;
  }

  getEnemyStagedCombatUnits(teamId = "enemy", { includeRecharging = false } = {}) {
    const chargers = includeRecharging
      ? []
      : this.structures.filter((structure) => {
        const definition = STRUCTURE_DEFINITIONS[structure.type];
        return (
          structure.alive &&
          structure.complete &&
          structure.powered &&
          structure.team === teamId &&
          definition.chargeRadius
        );
      });
    return this.units.filter((unit) => {
      const definition = UNIT_DEFINITIONS[unit.type];
      const target = this.getEntity(unit.attackTargetId);
      const isRecharging = chargers.some((charger) =>
        unit.energy <
          definition.maxEnergy * SIMULATION_RULES.enemyChargerReleaseEnergyRatio - EPSILON &&
        distance(unit, charger) <= STRUCTURE_DEFINITIONS[charger.type].chargeRadius
      );
      return (
        unit.alive &&
        unit.state === "active" &&
        unit.team === teamId &&
        isCombatUnitDefinition(definition) &&
        !unit.garrisonStructureId &&
        !target?.alive &&
        !unit.moveTarget &&
        !isRecharging
      );
    });
  }

  getEnemyAssaultPlan(stagedUnits, playerTargets, minimumWaveSize) {
    if (stagedUnits.length < minimumWaveSize || playerTargets.length === 0) return null;
    const armyCenter = {
      x: stagedUnits.reduce((total, unit) => total + unit.x, 0) / stagedUnits.length,
      y: stagedUnits.reduce((total, unit) => total + unit.y, 0) / stagedUnits.length,
    };
    const orderedTargets = [...playerTargets].sort(
      (left, right) =>
        distance(armyCenter, left) - distance(armyCenter, right) ||
        left.id.localeCompare(right.id),
    );
    const evaluationRadius = SIMULATION_RULES.enemyAssaultEvaluationRadius;
    const targetCells = new Set();
    const representativeTargets = [];
    for (const target of orderedTargets) {
      const cellKey = `${Math.floor(target.x / evaluationRadius)},${Math.floor(target.y / evaluationRadius)}`;
      if (targetCells.has(cellKey)) continue;
      targetCells.add(cellKey);
      representativeTargets.push(target);
      if (
        representativeTargets.length >=
        SIMULATION_RULES.enemyAssaultTargetEvaluationLimit
      ) break;
    }
    const orderedAttackers = [...stagedUnits].sort(
      (left, right) =>
        combatStrength(right) - combatStrength(left) || left.id.localeCompare(right.id),
    );
    const defenderCells = new Map();
    for (const entity of playerTargets) {
      const definition = entity.kind === "unit"
        ? UNIT_DEFINITIONS[entity.type]
        : STRUCTURE_DEFINITIONS[entity.type];
      if (
        (entity.kind === "unit" &&
          (entity.state !== "active" || !isCombatUnitDefinition(definition))) ||
        (entity.kind === "structure" && (!entity.complete || !(definition?.attackRange > 0)))
      ) continue;
      const cellKey = `${Math.floor(entity.x / evaluationRadius)},${Math.floor(entity.y / evaluationRadius)}`;
      const occupants = defenderCells.get(cellKey);
      if (occupants) occupants.push(entity);
      else defenderCells.set(cellKey, [entity]);
    }

    for (const target of representativeTargets) {
      const targetCellX = Math.floor(target.x / evaluationRadius);
      const targetCellY = Math.floor(target.y / evaluationRadius);
      const nearbyDefenders = [];
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const occupants = defenderCells.get(
            `${targetCellX + offsetX},${targetCellY + offsetY}`,
          );
          if (!occupants) continue;
          for (const entity of occupants) {
            if (distance(entity, target) <= evaluationRadius) nearbyDefenders.push(entity);
          }
        }
      }
      const hostileStrength = nearbyDefenders.reduce(
        (total, entity) => total + combatStrength(entity),
        0,
      );
      const wave = [];
      let alliedStrength = 0;
      for (const attacker of orderedAttackers) {
        wave.push(attacker);
        alliedStrength += combatStrength(attacker);
        if (
          wave.length >= minimumWaveSize &&
          hostileStrength <=
            alliedStrength * SIMULATION_RULES.enemyAssaultSafetyStrengthRatio + EPSILON
        ) {
          return { target, wave, alliedStrength, hostileStrength };
        }
      }
    }
    return null;
  }

  reassignEnemyConstruction(enemyWorkers, teamId = "enemy") {
    const projects = this.structures.filter(
      (structure) => structure.alive && !structure.complete && structure.team === teamId,
    );
    const assignedProjectIds = new Set();
    for (const worker of enemyWorkers) {
      const project = this.getStructure(worker.buildTargetId);
      if (
        project?.alive &&
        !project.complete &&
        project.team === worker.team &&
        canWorkerTierBuildStructure(
          UNIT_DEFINITIONS[worker.type].workerTier,
          project.type,
        )
      ) {
        assignedProjectIds.add(project.id);
      } else if (worker.buildTargetId) {
        worker.buildTargetId = null;
      }
    }

    const availableWorkers = enemyWorkers.filter(
      (worker) => worker.state === "active" && !worker.buildTargetId,
    );
    for (const project of projects) {
      if (assignedProjectIds.has(project.id) || availableWorkers.length === 0) continue;
      const compatibleWorkers = availableWorkers.filter((worker) =>
        canWorkerTierBuildStructure(
          UNIT_DEFINITIONS[worker.type].workerTier,
          project.type,
        )
      );
      const worker = nearest(project, compatibleWorkers);
      if (!worker) continue;
      this.commandBuild([worker.id], project.id);
      assignedProjectIds.add(project.id);
      availableWorkers.splice(availableWorkers.indexOf(worker), 1);
    }
  }

  updateConstruction(delta) {
    for (const worker of this.units) {
      const workerDefinition = UNIT_DEFINITIONS[worker.type];
      if (!worker.alive || worker.state !== "active" || !workerDefinition.workerTier || !worker.buildTargetId) continue;
      const structure = this.getStructure(worker.buildTargetId);
      if (!structure?.alive || structure.complete || structure.team !== worker.team) {
        this.advanceBuildQueue(worker);
        continue;
      }

      const buildDistance = 24;
      if (distanceToStructureFootprint(worker, structure) > buildDistance + EPSILON) {
        this.moveUnitToward(worker, structure, delta);
        continue;
      }

      const definition = STRUCTURE_DEFINITIONS[structure.type];
      const previousProgress = structure.constructionProgress;
      structure.constructionProgress = Math.min(
        definition.buildTime,
        structure.constructionProgress + workerDefinition.buildRate * delta,
      );
      const progressAdded = structure.constructionProgress - previousProgress;
      const durabilityAdded = definition.maxHp *
        (1 - SIMULATION_RULES.constructionStartingHpRatio) *
        (progressAdded / definition.buildTime);
      structure.hp = Math.min(
        definition.maxHp,
        structure.hp + durabilityAdded,
      );
      if (structure.constructionProgress + EPSILON >= definition.buildTime) {
        structure.complete = true;
        this.recordStructureTierUnlock(structure);
        this.advanceBuildQueue(worker);
        if (STRUCTURE_DEFINITIONS[structure.type].droneCount && structure.drones.length === 0) {
          for (let slot = 0; slot < definition.droneCount; slot += 1) {
            structure.drones.push(this.createDrone(structure, slot));
          }
        }
        this.emit("construction_complete", structure.x, structure.y, { structureId: structure.id });
      }
    }
  }

  updateProduction(delta) {
    const assistRates = new Map();
    for (const worker of this.units) {
      const factory = this.getStructure(worker.productionAssistTargetId);
      if (!isActivelyAssistingProduction(worker, factory)) continue;
      assistRates.set(
        factory.id,
        (assistRates.get(factory.id) || 0) +
          (UNIT_DEFINITIONS[worker.type].productionAssistRate || 0),
      );
    }

    for (const factory of this.structures) {
      const definition = STRUCTURE_DEFINITIONS[factory.type];
      if (!factory.alive || !factory.complete || !factory.powered || !definition.production || factory.productionQueue.length === 0) {
        continue;
      }
      const order = factory.productionQueue[0];
      const unitDefinition = UNIT_DEFINITIONS[order.unitType];
      order.progress += delta * (
        (definition.productionRate || 1) + (assistRates.get(factory.id) || 0)
      );
      if (order.progress + EPSILON < unitDefinition.productionTime) continue;

      const spawn = this.findUnitSpawn(factory, order.unitType);
      if (!spawn) continue;
      factory.productionQueue.shift();
      const unit = this.addUnit(
        order.unitType,
        factory.team,
        spawn.x,
        spawn.y,
      );
      if (factory.rallyPoint) {
        const rallyDestination = this.getFactoryRallyDestination(factory, order.unitType);
        this.commandMove([unit.id], rallyDestination.x, rallyDestination.y);
      }
      this.emit("unit_complete", unit.x, unit.y, { unitId: unit.id, factoryId: factory.id });
    }
  }

  updateSupplyUpgrades(delta) {
    for (const structure of this.structures) {
      if (!structure.alive || !structure.complete || !structure.supplyUpgrade) continue;
      const definition = STRUCTURE_DEFINITIONS[structure.type];
      const level = definition.supplyLevels?.[structure.supplyUpgrade.targetLevel - 1];
      if (!level) {
        structure.supplyUpgrade = null;
        continue;
      }
      if (!structure.powered) continue;
      structure.supplyUpgrade.progress = Math.min(
        level.upgradeTime,
        structure.supplyUpgrade.progress + delta,
      );
      if (structure.supplyUpgrade.progress + EPSILON < level.upgradeTime) continue;
      structure.supplyLevel = structure.supplyUpgrade.targetLevel;
      structure.supplyUpgrade = null;
      this.emit("supply_upgrade_complete", structure.x, structure.y, {
        structureId: structure.id,
        level: structure.supplyLevel,
      });
    }
  }

  findUnitSpawn(factory, unitType) {
    const factoryDefinition = STRUCTURE_DEFINITIONS[factory.type];
    const unitDefinition = UNIT_DEFINITIONS[unitType];
    if (!factoryDefinition?.production || !unitDefinition) return null;

    const preferredAngle = factory.team === "player" ? 0 : Math.PI;
    const spawnDistance =
      factoryDefinition.radius +
      unitDefinition.radius +
      SIMULATION_RULES.structureCollisionPadding +
      18;
    const sampleCount = 32;
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const alternatingStep = sample === 0
        ? 0
        : Math.ceil(sample / 2) * (sample % 2 === 1 ? 1 : -1);
      const angle = preferredAngle + alternatingStep * ((Math.PI * 2) / sampleCount);
      const candidate = {
        x: factory.x + Math.cos(angle) * spawnDistance,
        y: factory.y + Math.sin(angle) * spawnDistance,
      };
      if (this.isUnitPositionClear(candidate, unitType)) return candidate;
    }
    return null;
  }

  getFactoryRallyDestination(factory, unitType) {
    const definition = UNIT_DEFINITIONS[unitType];
    if (!factory.rallyPoint || !definition) return factory.rallyPoint;

    let slot = factory.rallySequence || 0;
    const stride = Math.max(1, factory.rallySequenceStride || 1);
    for (let attempts = 0; attempts < 4096; attempts += 1) {
      const offset = squareSpiralOffset(slot);
      slot += stride;
      const candidate = {
        x: factory.rallyPoint.x + offset.x * SIMULATION_RULES.rallyFormationSpacing,
        y: factory.rallyPoint.y + offset.y * SIMULATION_RULES.rallyFormationSpacing,
      };
      if (
        candidate.x - definition.radius < 0 ||
        candidate.x + definition.radius > this.width ||
        candidate.y - definition.radius < 0 ||
        candidate.y + definition.radius > this.height
      ) {
        continue;
      }
      const blockedByStructure =
        definition.movementLayer !== "air" &&
        !definition.stridesOverStructures &&
        this.structures.some((structure) => {
          if (!structure.alive) return false;
          const footprint = structureFootprint(structure.type);
          const padding = definition.radius + SIMULATION_RULES.structureCollisionPadding;
          return (
            candidate.x > structure.x - footprint.halfWidth - padding &&
            candidate.x < structure.x + footprint.halfWidth + padding &&
            candidate.y > structure.y - footprint.halfHeight - padding &&
            candidate.y < structure.y + footprint.halfHeight + padding
          );
        });
      if (blockedByStructure) continue;
      factory.rallySequence = slot;
      return candidate;
    }

    factory.rallySequence = slot;
    return { ...factory.rallyPoint };
  }

  isUnitPositionClear(point, unitType, { ignoreUnitIds = [] } = {}) {
    const definition = UNIT_DEFINITIONS[unitType];
    if (!definition) return false;
    if (
      point.x - definition.radius < 0 ||
      point.x + definition.radius > this.width ||
      point.y - definition.radius < 0 ||
      point.y + definition.radius > this.height
    ) {
      return false;
    }

    const clearOfTerrain = definition.movementLayer === "air" || this.terrain.every(
      (obstacle) => !pointInsideBounds(point, terrainBounds(obstacle, definition.radius)),
    );
    if (!clearOfTerrain) return false;

    const clearOfStructures =
      definition.movementLayer === "air" ||
      definition.stridesOverStructures ||
      this.structures.every((structure) => {
        if (!structure.alive) return true;
        const clearance =
          definition.radius +
          STRUCTURE_DEFINITIONS[structure.type].radius +
          SIMULATION_RULES.structureCollisionPadding;
        return distance(point, structure) + EPSILON >= clearance;
      });
    if (!clearOfStructures) return false;

    const ignoredIds = new Set(ignoreUnitIds);
    return this.units.every((unit) => {
      if (!unit.alive || unit.carriedById || ignoredIds.has(unit.id)) return true;
      const clearance =
        definition.radius +
        UNIT_DEFINITIONS[unit.type].radius +
        SIMULATION_RULES.unitCollisionPadding;
      return distance(point, unit) + EPSILON >= clearance;
    });
  }

  updateStaticDefenses(delta) {
    this.rebuildCombatSpatialIndex();
    for (const defense of this.structures) {
      const definition = STRUCTURE_DEFINITIONS[defense.type];
      if (!defense.alive || !defense.complete || !definition.capacitorCapacity) continue;
      defense.attackCooldownRemaining = Math.max(0, defense.attackCooldownRemaining - delta);
      if (!defense.powered) {
        defense.defenseTargetId = null;
        defense.defenseStatus = "unpowered";
        continue;
      }

      const chargeRequest = Math.min(
        definition.capacitorChargeRate * delta,
        definition.capacitorCapacity - defense.weaponEnergy,
      );
      if (chargeRequest > EPSILON) {
        defense.weaponEnergy += this.takeStructureEnergy(defense, chargeRequest);
      }

      const existingTarget = this.getEntity(defense.defenseTargetId);
      let target = existingTarget?.alive &&
        this.areHostileTeams(existingTarget.team, defense.team) &&
        isStaticDefenseTargetInRange(definition, defense, existingTarget)
        ? existingTarget
        : null;
      let nearbyTargets = [];
      if (this.automaticTargetScanDue(
        defense,
        SIMULATION_RULES.staticDefenseTargetScanInterval,
      )) {
        nearbyTargets = this.getNearbyHostileTargets(defense, definition.attackRange)
          .filter(
            (candidate) =>
              distance(defense, candidate) <= definition.attackRange + entityRadius(candidate),
          );
        const targets = nearbyTargets.filter((candidate) =>
          isStaticDefenseTargetInRange(definition, defense, candidate)
        );
        target = nearest(defense, preferredTargets(definition, targets));
      }
      defense.defenseTargetId = target?.id || null;
      if (!target) {
        const targetInsideDeadZone = nearbyTargets.some((candidate) =>
          distance(defense, candidate) + EPSILON < (definition.minimumAttackRange || 0)
        );
        defense.defenseStatus = targetInsideDeadZone
          ? "target too close"
          : defense.weaponEnergy + EPSILON >= definition.attackEnergy
            ? "ready"
            : "charging";
        continue;
      }
      defense.defenseTargetId = target.id;
      if (defense.weaponEnergy + EPSILON < definition.attackEnergy) {
        defense.defenseStatus = "charging";
        continue;
      }
      if (defense.attackCooldownRemaining > EPSILON) {
        defense.defenseStatus = "tracking";
        continue;
      }
      defense.weaponEnergy = Math.max(0, defense.weaponEnergy - definition.attackEnergy);
      defense.attackCooldownRemaining = definition.attackCooldown;
      defense.defenseStatus = "firing";
      this.fireWeapon(
        defense,
        target,
        definition.attackDamage * damageMultiplierAgainstTarget(definition, target),
        definition,
      );
    }
  }

  updateShieldTurrets(delta) {
    for (const shield of this.structures) {
      const definition = STRUCTURE_DEFINITIONS[shield.type];
      if (!shield.alive || !shield.complete || !definition.shieldCapacity) continue;
      if (!shield.powered) {
        shield.shieldStatus = "unpowered";
        continue;
      }
      const missingStrength = definition.shieldCapacity - shield.shieldStrength;
      if (missingStrength <= EPSILON) {
        shield.shieldStrength = definition.shieldCapacity;
        shield.shieldStatus = "stable";
        continue;
      }

      const requestedStrength = Math.min(definition.shieldRegenRate * delta, missingStrength);
      const energyRequired = requestedStrength * definition.shieldEnergyPerPoint;
      const suppliedEnergy = this.takeStructureEnergy(shield, energyRequired);
      const restoredStrength = suppliedEnergy / definition.shieldEnergyPerPoint;
      shield.shieldStrength = Math.min(
        definition.shieldCapacity,
        shield.shieldStrength + restoredStrength,
      );
      shield.shieldStatus = restoredStrength > EPSILON
        ? "regenerating"
        : shield.shieldStrength > EPSILON
          ? "low power"
          : "depleted";
    }
  }

  updateUnits(delta) {
    this.navigationSearchesRemaining = NAVIGATION_SEARCHES_PER_TICK;
    this.lastNavigationSearchCount = 0;
    this.lastNavigationNodeObstacleCount = 0;
    for (const unit of this.units) {
      if (!unit.alive || unit.carriedById) continue;
      const definition = UNIT_DEFINITIONS[unit.type];
      if (definition.movementLayer !== "air" && !definition.stridesOverStructures) {
        this.resolveUnitStructureOverlap(unit);
      }
      unit.attackCooldownRemaining = Math.max(0, unit.attackCooldownRemaining - delta);
      if (definition.weaponSystems?.length) {
        for (const weaponSystem of ensureWeaponSystemState(unit, definition)) {
          weaponSystem.cooldownRemaining = Math.max(0, weaponSystem.cooldownRemaining - delta);
        }
      }

      if (unit.state === "stasis") {
        unit.energy = Math.min(
          definition.maxEnergy,
          unit.energy + SIMULATION_RULES.stasisRegenerationRate * delta,
        );
        if (unit.energy + EPSILON >= SIMULATION_RULES.reactivationThreshold) {
          unit.state = "active";
          if (
            !unit.moveTarget &&
            (unit.moveQueue?.length || unit.patrolRoute?.length >= 2)
          ) this.advanceMoveQueue(unit);
          this.emit("reactivated", unit.x, unit.y, { unitId: unit.id });
        }
        continue;
      }

      const emergencyEnergyThreshold = definition.maxEnergy * SIMULATION_RULES.lowEnergyRatio;
      if (unit.energy + EPSILON < emergencyEnergyThreshold) {
        unit.energy = Math.min(
          emergencyEnergyThreshold,
          unit.energy + SIMULATION_RULES.lowEnergyRegenerationRate * delta,
        );
      }

      if (definition.underbellyBeamRadius) {
        this.updateUnderbellyBeam(unit, definition, delta);
        if (unit.state !== "active") continue;
      }

      const buildTarget = this.getStructure(unit.buildTargetId);
      if (buildTarget?.alive && !buildTarget.complete) {
        unit.attackTargetId = null;
        unit.attackTargetMode = null;
        continue;
      }
      if (unit.buildTargetId || unit.buildQueue?.length) {
        const nextBuildTarget = this.advanceBuildQueue(unit);
        if (nextBuildTarget) continue;
      }

      const repairTarget = this.getEntity(unit.repairTargetId);
      if (unit.repairTargetId && !isValidRepairTarget(unit, repairTarget)) {
        unit.repairTargetId = null;
      }
      if (isValidRepairTarget(unit, repairTarget)) {
        unit.attackTargetId = null;
        unit.attackTargetMode = null;
        this.updateUnitRepair(unit, repairTarget, definition, delta);
        continue;
      }

      const productionAssistTarget = this.getStructure(unit.productionAssistTargetId);
      if (
        unit.productionAssistTargetId &&
        !isValidProductionAssistTarget(unit, productionAssistTarget)
      ) {
        unit.productionAssistTargetId = null;
      }
      if (isValidProductionAssistTarget(unit, productionAssistTarget)) {
        unit.attackTargetId = null;
        unit.attackTargetMode = null;
        if (
          distanceToStructureFootprint(unit, productionAssistTarget) >
          SIMULATION_RULES.workerProductionAssistRange + EPSILON
        ) {
          this.moveUnitToward(unit, productionAssistTarget, delta);
        }
        continue;
      }

      let attackTarget = this.getEntity(unit.attackTargetId);
      if (
        unit.attackTargetId &&
        (!attackTarget ||
          !attackTarget.alive ||
          this.areAlliedTeams(attackTarget.team, unit.team) ||
          !canUnitAttackTarget(definition, attackTarget))
      ) {
        if (unit.moveMode === "pursuit") {
          this.advanceMoveQueue(unit);
        }
        unit.attackTargetId = null;
        unit.attackTargetMode = null;
        attackTarget = null;
      }

      const hasIndependentWeapons = Boolean(definition.weaponSystems?.length);
      if (hasIndependentWeapons) {
        this.updateIndependentWeaponSystems(unit, definition, attackTarget);
        if (unit.state !== "active") continue;
      }

      if (unit.moveTarget) {
        const pursuingBeamTarget = Boolean(
          definition.underbellyBeamRadius &&
          unit.moveMode === "pursuit" &&
          attackTarget?.alive &&
          isUnderbellyBeamTarget(attackTarget) &&
          this.areHostileTeams(attackTarget.team, unit.team)
        );
        if (pursuingBeamTarget) {
          this.moveUnitToward(
            unit,
            attackTarget,
            delta,
            4,
            { preserveMoveOrder: true },
          );
          continue;
        }
        const stoppedToAttack = this.isUnitStoppedToAttack(unit, attackTarget, definition);
        if (stoppedToAttack) {
          if (!hasIndependentWeapons) this.tryAttack(unit, attackTarget, definition);
        } else if (
          attackTarget?.alive &&
          this.areHostileTeams(attackTarget.team, unit.team) &&
          unit.attackTargetMode === "retaliation"
        ) {
          const attackRange = unitAttackRangeAgainstTarget(definition, attackTarget);
          if (distance(unit, attackTarget) + EPSILON < (definition.minimumAttackRange || 0)) {
            this.moveUnitToward(unit, unit.moveTarget, delta, 4);
          } else {
            this.moveUnitToward(
              unit,
              attackTarget,
              delta,
              attackRange + entityRadius(attackTarget) * 0.75,
              { preserveMoveOrder: true },
            );
          }
        } else if (unit.state === "active" && unit.moveTarget) {
          this.moveUnitToward(unit, unit.moveTarget, delta, 4);
        }
      } else if (attackTarget?.alive && this.areHostileTeams(attackTarget.team, unit.team)) {
        const separation = distance(unit, attackTarget);
        const targetRadius = entityRadius(attackTarget);
        const attackRange = unitAttackRangeAgainstTarget(definition, attackTarget);
        if (isUnitTargetInWeaponRange(definition, unit, attackTarget)) {
          if (!hasIndependentWeapons) this.tryAttack(unit, attackTarget, definition);
        } else if (
          separation + EPSILON >= (definition.minimumAttackRange || 0) &&
          (
            unit.attackTargetMode === "explicit" ||
            unit.attackTargetMode === "retaliation"
          )
        ) {
          this.moveUnitToward(unit, attackTarget, delta, attackRange + targetRadius * 0.75);
        } else {
          unit.attackTargetId = null;
          unit.attackTargetMode = null;
        }
      }
    }
    this.resolveUnitOverlaps();
    for (const unit of this.units) {
      if (unit.alive && !unit.carriedById && UNIT_DEFINITIONS[unit.type].movementLayer !== "air") {
        this.resolveUnitTerrainOverlap(unit);
      }
    }
    this.syncTransportCargoPositions();
    this.combatSpatialIndexDirty = true;
  }

  updateUnitRepair(worker, target, definition, delta) {
    const repairDistance = distanceToEntitySurface(worker, target);
    if (repairDistance > definition.repairRange + EPSILON) {
      this.moveUnitToward(
        worker,
        target,
        delta,
        target.kind === "unit" ? definition.repairRange + entityRadius(target) : 0,
      );
      return;
    }

    const maximumHp = repairableEntityMaxHp(target);
    const missingHp = Math.max(0, maximumHp - target.hp);
    const energyPerHp = definition.repairEnergyPerHp || 0;
    const energyLimitedHp = energyPerHp > 0 ? worker.energy / energyPerHp : missingHp;
    const repairedHp = Math.min(
      missingHp,
      definition.repairRate * delta,
      energyLimitedHp,
    );
    if (repairedHp <= EPSILON) {
      if (worker.energy <= EPSILON) this.enterStasis(worker);
      return;
    }

    target.hp = Math.min(maximumHp, target.hp + repairedHp);
    worker.energy = Math.max(0, worker.energy - repairedHp * energyPerHp);
    this.emit("repair", target.x, target.y, {
      sourceId: worker.id,
      targetId: target.id,
      amount: repairedHp,
    });
    if (target.hp + EPSILON >= maximumHp) worker.repairTargetId = null;
    if (worker.energy <= EPSILON) this.enterStasis(worker);
  }

  resolveUnitOverlaps() {
    const aliveUnits = this.units.filter((unit) => unit.alive && !unit.carriedById);
    this.lastUnitSeparationPasses = 0;
    if (aliveUnits.length < 2) return;

    const cellSize = UNIT_SEPARATION_CELL_SIZE;
    for (let pass = 0; pass < UNIT_SEPARATION_MAX_PASSES; pass += 1) {
      this.lastUnitSeparationPasses += 1;
      const cells = new Map();
      const movedUnits = new Set();
      for (const unit of aliveUnits) {
        const cellX = Math.floor(unit.x / cellSize);
        const cellY = Math.floor(unit.y / cellSize);
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const nearby = cells.get(`${cellX + offsetX},${cellY + offsetY}`);
            if (!nearby) continue;
            for (const other of nearby) {
              if (!this.separateUnitPair(unit, other)) continue;
              movedUnits.add(unit);
              movedUnits.add(other);
            }
          }
        }

        const key = `${cellX},${cellY}`;
        const occupants = cells.get(key);
        if (occupants) occupants.push(unit);
        else cells.set(key, [unit]);
      }

      if (movedUnits.size === 0) break;
      for (const unit of movedUnits) this.resolveUnitStructureOverlap(unit);
    }
  }

  separateUnitPair(first, second) {
    const firstDefinition = UNIT_DEFINITIONS[first.type];
    const secondDefinition = UNIT_DEFINITIONS[second.type];
    if (firstDefinition.movementLayer !== secondDefinition.movementLayer) return false;
    const minimumDistance =
      firstDefinition.radius +
      secondDefinition.radius +
      SIMULATION_RULES.unitCollisionPadding;
    const deltaX = second.x - first.x;
    const deltaY = second.y - first.y;
    const separation = Math.hypot(deltaX, deltaY);
    if (separation + EPSILON >= minimumDistance) return false;

    let normalX;
    let normalY;
    if (separation <= EPSILON) {
      const angle = deterministicPairAngle(first.id, second.id);
      normalX = Math.cos(angle);
      normalY = Math.sin(angle);
    } else {
      normalX = deltaX / separation;
      normalY = deltaY / separation;
    }

    const overlap = minimumDistance - separation;
    const firstIsMoving = Boolean(first.moveTarget);
    const secondIsMoving = Boolean(second.moveTarget);
    const firstShare = firstIsMoving === secondIsMoving ? 0.5 : firstIsMoving ? 0.2 : 0.8;
    const secondShare = 1 - firstShare;
    const firstRadius = firstDefinition.radius;
    const secondRadius = secondDefinition.radius;
    first.x = clamp(first.x - normalX * overlap * firstShare, firstRadius, this.width - firstRadius);
    first.y = clamp(first.y - normalY * overlap * firstShare, firstRadius, this.height - firstRadius);
    second.x = clamp(second.x + normalX * overlap * secondShare, secondRadius, this.width - secondRadius);
    second.y = clamp(second.y + normalY * overlap * secondShare, secondRadius, this.height - secondRadius);
    return true;
  }

  tryAttack(unit, target, definition) {
    if (definition.attackDamage <= 0 || unit.attackCooldownRemaining > EPSILON) return false;
    if (!isPrimaryWeaponTargetInRange(definition, unit, target)) return false;
    if (unit.energy + EPSILON < definition.attackEnergy) return false;

    unit.energy = Math.max(0, unit.energy - definition.attackEnergy);
    const overdrive = unit.abilityActiveUntil.overdrive > this.time;
    const cooldownMultiplier = overdrive
      ? definition.abilities.overdrive.cooldownMultiplier
      : 1;
    unit.attackCooldownRemaining = definition.attackCooldown * cooldownMultiplier;
    const damage = definition.attackDamage * damageMultiplierAgainstTarget(definition, target);
    this.fireWeapon(unit, target, damage, definition);
    if (unit.energy <= EPSILON) this.enterStasis(unit);
    return true;
  }

  updateIndependentWeaponSystems(unit, definition, primaryTarget = null) {
    const weaponDefinitions = definition.weaponSystems || [];
    const weaponSystems = ensureWeaponSystemState(unit, definition);
    if (weaponDefinitions.length === 0 || unit.moveMode === "force") {
      for (const weaponSystem of weaponSystems) weaponSystem.targetId = null;
      return false;
    }

    const maximumRange = Math.max(...weaponDefinitions.map((weapon) => weapon.attackRange));
    const candidates = this.getNearbyHostileTargets(unit, maximumRange);
    const assignedTargets = new Set();
    let fired = false;

    for (const [index, weaponDefinition] of weaponDefinitions.entries()) {
      const state = weaponSystems[index];
      const targetInRange = (target) => Boolean(
        target?.alive &&
        this.areHostileTeams(target.team, unit.team) &&
        canWeaponSystemAttackTarget(definition, weaponDefinition, target) &&
        distance(unit, target) <= weaponDefinition.attackRange + entityRadius(target)
      );
      const availableTargets = candidates.filter(
        (target) => targetInRange(target) && !assignedTargets.has(target.id),
      );
      const existingTarget = this.getEntity(state.targetId);
      let target = index === 0 && targetInRange(primaryTarget)
        ? primaryTarget
        : targetInRange(existingTarget) && !assignedTargets.has(existingTarget.id)
          ? existingTarget
          : nearest(unit, preferredTargets({ ...definition, ...weaponDefinition }, availableTargets));
      if (!target && targetInRange(primaryTarget)) target = primaryTarget;
      if (!target) {
        target = nearest(
          unit,
          preferredTargets({ ...definition, ...weaponDefinition }, candidates.filter(targetInRange)),
        );
      }
      state.targetId = target?.id || null;
      if (!target) continue;
      assignedTargets.add(target.id);
      if (
        state.cooldownRemaining > EPSILON ||
        unit.energy + EPSILON < weaponDefinition.attackEnergy
      ) {
        continue;
      }

      unit.energy = Math.max(0, unit.energy - weaponDefinition.attackEnergy);
      state.cooldownRemaining = weaponDefinition.attackCooldown;
      const firingDefinition = {
        ...definition,
        ...weaponDefinition,
        salvoCount: 1,
      };
      const damage = weaponDefinition.attackDamage * damageMultiplierAgainstTarget(
        firingDefinition,
        target,
      );
      this.fireWeapon(unit, target, damage, firingDefinition, { weaponSystemIndex: index });
      fired = true;
      if (unit.energy <= EPSILON) {
        this.enterStasis(unit);
        break;
      }
    }
    return fired;
  }

  fireWeapon(source, target, damage, definition, eventDetail = {}) {
    const impactDelay = projectileImpactDelay(source, target, definition);
    if (impactDelay > EPSILON) {
      this.pendingImpacts.push({
        sourceId: source.id,
        targetId: target.id,
        damage,
        impactAt: this.time + impactDelay,
      });
    } else {
      this.applyDamage(target, damage, source);
    }
    this.emitAttack(source, target, impactDelay, {
      ...eventDetail,
      tracksTarget: Boolean(definition.projectileTracksTarget),
    });
  }

  updateUnderbellyBeam(unit, definition, delta) {
    unit.underbellyBeamActive = false;
    unit.underbellyBeamTargetIds = [];
    const targets = this.getNearbyHostileTargets(unit, definition.underbellyBeamRadius)
      .filter(
        (target) =>
          isUnderbellyBeamTarget(target) &&
          distance(unit, target) <= definition.underbellyBeamRadius + entityRadius(target),
      );
    if (targets.length === 0 || unit.energy <= EPSILON) return false;

    const activeSeconds = Math.min(
      delta,
      unit.energy / definition.underbellyBeamEnergyPerSecond,
    );
    if (activeSeconds <= EPSILON) return false;

    unit.energy = Math.max(
      0,
      unit.energy - definition.underbellyBeamEnergyPerSecond * activeSeconds,
    );
    unit.underbellyBeamActive = true;
    unit.underbellyBeamTargetIds = targets.map((target) => target.id);
    const damage = definition.underbellyBeamDamagePerSecond * activeSeconds;
    for (const target of targets) this.applyDamage(target, damage, unit);
    if (unit.energy <= EPSILON) this.enterStasis(unit);
    return true;
  }

  updatePendingImpacts() {
    const unresolved = [];
    for (const impact of this.pendingImpacts) {
      if (impact.impactAt > this.time + EPSILON) {
        unresolved.push(impact);
        continue;
      }
      const target = this.getEntity(impact.targetId);
      if (!target?.alive) continue;
      this.applyDamage(target, impact.damage, this.getEntity(impact.sourceId));
    }
    this.pendingImpacts = unresolved;
  }

  isUnitStoppedToAttack(
    unit,
    target = this.getEntity(unit?.attackTargetId),
    definition = unit ? UNIT_DEFINITIONS[unit.type] : null,
  ) {
    return Boolean(
      unit?.alive &&
      unit.state === "active" &&
      unit.moveTarget &&
      unit.moveMode !== "force" &&
      target?.alive &&
      this.areHostileTeams(target.team, unit.team) &&
      isUnitTargetInWeaponRange(definition, unit, target)
    );
  }

  moveUnitToward(
    unit,
    target,
    delta,
    stopDistance = 0,
    { preserveMoveOrder = false } = {},
  ) {
    const definition = UNIT_DEFINITIONS[unit.type];
    const targetSeparation = distance(unit, target);
    if (targetSeparation <= stopDistance + EPSILON) {
      if (unit.moveTarget && !preserveMoveOrder) {
        this.advanceMoveQueue(unit);
      }
      unit.navigationPath = [];
      unit.navigationTarget = null;
      return 0;
    }

    const waypoint = definition.movementLayer === "air"
      ? target
      : this.getGroundNavigationWaypoint(unit, target);
    const dx = waypoint.x - unit.x;
    const dy = waypoint.y - unit.y;
    const separation = Math.hypot(dx, dy);
    const waypointIsTarget = waypoint === target;
    const waypointStopDistance = waypointIsTarget ? stopDistance : 0;
    if (separation <= waypointStopDistance + EPSILON) return 0;

    const overdrive = unit.abilityActiveUntil.overdrive > this.time;
    const speedMultiplier = overdrive
      ? definition.abilities.overdrive.speedMultiplier
      : 1;
    const desiredDistance = Math.min(
      definition.speed * speedMultiplier * delta,
      separation - waypointStopDistance,
    );
    const energyCostPerUnit = definition.movementEnergyPerUnit;
    const affordableDistance = energyCostPerUnit > 0 ? unit.energy / energyCostPerUnit : desiredDistance;
    const requestedDistance = Math.max(0, Math.min(desiredDistance, affordableDistance));
    let traveled = 0;

    if (requestedDistance > EPSILON) {
      traveled = this.moveUnitWithStructureCollisions(
        unit,
        (dx / separation) * requestedDistance,
        (dy / separation) * requestedDistance,
      );
      unit.energy = Math.max(0, unit.energy - traveled * energyCostPerUnit);
    }

    if (
      unit.moveTarget &&
      !preserveMoveOrder &&
      distance(unit, target) <= stopDistance + EPSILON
    ) {
      this.advanceMoveQueue(unit);
    }
    if (unit.energy <= EPSILON) this.enterStasis(unit);
    return traveled;
  }

  getGroundNavigationWaypoint(unit, target) {
    const definition = UNIT_DEFINITIONS[unit.type];
    const excludedObstacleId = target.kind === "structure" ? target.id : null;
    const obstacles = this.getGroundNavigationObstacles(
      definition.radius,
      excludedObstacleId,
      { ignoreStructures: definition.stridesOverStructures },
    );
    if (navigationSegmentIsClear(unit, target, obstacles)) {
      unit.navigationPath = [];
      unit.navigationTarget = { x: target.x, y: target.y, excludedObstacleId };
      return target;
    }

    const previousTarget = unit.navigationTarget;
    const targetChanged =
      !previousTarget ||
      previousTarget.excludedObstacleId !== excludedObstacleId ||
      Math.hypot(target.x - previousTarget.x, target.y - previousTarget.y) >
        NAVIGATION_TARGET_TOLERANCE;
    let pathBlocked = false;
    while (unit.navigationPath?.length) {
      if (distance(unit, unit.navigationPath[0]) <= NAVIGATION_CORNER_MARGIN + EPSILON) {
        unit.navigationPath.shift();
        continue;
      }
      pathBlocked = !navigationSegmentIsClear(unit, unit.navigationPath[0], obstacles);
      break;
    }

    const replanDue = this.time + EPSILON >= unit.navigationReplanAt;
    if (
      targetChanged ||
      pathBlocked ||
      !unit.navigationPath?.length ||
      replanDue
    ) {
      if (!replanDue) return targetChanged || pathBlocked ? target : unit.navigationPath[0] || target;
      if (this.navigationSearchesRemaining <= 0) return unit.navigationPath[0] || target;
      this.navigationSearchesRemaining -= 1;
      this.lastNavigationSearchCount += 1;
      const navigationStatistics = { maximumNodeObstacleCount: 0 };
      const path = findNavigationPath(
        unit,
        target,
        obstacles,
        definition.radius,
        this.width,
        this.height,
        navigationStatistics,
      );
      this.lastNavigationNodeObstacleCount = Math.max(
        this.lastNavigationNodeObstacleCount,
        navigationStatistics.maximumNodeObstacleCount,
      );
      unit.navigationPath = path ? path.slice(1) : [];
      unit.navigationTarget = { x: target.x, y: target.y, excludedObstacleId };
      unit.navigationReplanAt = this.time + NAVIGATION_REPLAN_INTERVAL;
    }

    while (
      unit.navigationPath.length > 1 &&
      navigationSegmentIsClear(unit, unit.navigationPath[1], obstacles)
    ) {
      unit.navigationPath.shift();
    }
    return unit.navigationPath[0] || target;
  }

  getGroundNavigationObstacles(
    radius,
    excludedObstacleId = null,
    { ignoreStructures = false } = {},
  ) {
    const cacheKey = `${radius}:${excludedObstacleId || ""}:${ignoreStructures ? 1 : 0}`;
    const cached = this.groundNavigationObstacleCache.get(cacheKey);
    if (cached) return cached;
    const padding = radius + SIMULATION_RULES.structureCollisionPadding;
    const obstacles = [
      ...(ignoreStructures
        ? []
        : this.structures
          .filter((structure) => structure.alive && structure.id !== excludedObstacleId)
          .map((structure) => ({
            id: structure.id,
            bounds: expandedStructureBounds(structure, padding),
          }))),
      ...this.terrain.map((obstacle) => ({
        id: obstacle.id,
        bounds: terrainBounds(obstacle, padding),
      })),
    ];
    this.groundNavigationObstacleCache.set(cacheKey, obstacles);
    return obstacles;
  }

  moveUnitWithStructureCollisions(unit, movementX, movementY) {
    if (UNIT_DEFINITIONS[unit.type].movementLayer === "air") {
      const radius = UNIT_DEFINITIONS[unit.type].radius;
      const nextX = clamp(unit.x + movementX, radius, this.width - radius);
      const nextY = clamp(unit.y + movementY, radius, this.height - radius);
      const traveled = Math.hypot(nextX - unit.x, nextY - unit.y);
      unit.x = nextX;
      unit.y = nextY;
      return traveled;
    }
    let remainingX = movementX;
    let remainingY = movementY;
    let traveled = 0;

    for (let pass = 0; pass < 3; pass += 1) {
      if (Math.hypot(remainingX, remainingY) <= EPSILON) break;
      const collision = this.findFirstGroundCollision(unit, remainingX, remainingY);
      if (!collision) {
        unit.x = clamp(unit.x + remainingX, 0, this.width);
        unit.y = clamp(unit.y + remainingY, 0, this.height);
        traveled += Math.hypot(remainingX, remainingY);
        break;
      }

      const safeTime = Math.max(0, collision.time - 0.001);
      const advanceX = remainingX * safeTime;
      const advanceY = remainingY * safeTime;
      unit.x = clamp(unit.x + advanceX, 0, this.width);
      unit.y = clamp(unit.y + advanceY, 0, this.height);
      traveled += Math.hypot(advanceX, advanceY);

      const leftoverScale = 1 - safeTime;
      let slideX = remainingX * leftoverScale;
      let slideY = remainingY * leftoverScale;
      const inward = slideX * collision.normalX + slideY * collision.normalY;
      if (inward < 0) {
        slideX -= collision.normalX * inward;
        slideY -= collision.normalY * inward;
      }

      const remainingDistance = Math.hypot(remainingX, remainingY) * leftoverScale;
      let side = unit.navigationSide;
      if (unit.navigationObstacleId !== collision.obstacle.id || !side) {
        const positiveTangentX = -collision.normalY;
        const positiveTangentY = collision.normalX;
        const naturalTangent = slideX * positiveTangentX + slideY * positiveTangentY;
        side = Math.abs(naturalTangent) > EPSILON
          ? Math.sign(naturalTangent)
          : deterministicSide(unit.id, collision.obstacle.id);
        unit.navigationObstacleId = collision.obstacle.id;
        unit.navigationSide = side;
      }
      const preferredTangentX = -collision.normalY * side;
      const preferredTangentY = collision.normalX * side;
      const tangentProgress =
        slideX * preferredTangentX + slideY * preferredTangentY;
      if (tangentProgress <= EPSILON) {
        slideX = preferredTangentX * remainingDistance;
        slideY = preferredTangentY * remainingDistance;
      }
      remainingX = slideX;
      remainingY = slideY;
    }

    return traveled;
  }

  findFirstGroundCollision(unit, movementX, movementY) {
    let first = null;
    const definition = UNIT_DEFINITIONS[unit.type];
    const padding =
      definition.radius + SIMULATION_RULES.structureCollisionPadding;
    if (!definition.stridesOverStructures) {
      for (const structure of this.structures) {
        if (!structure.alive) continue;
        const collision = sweepBounds(
          unit,
          movementX,
          movementY,
          expandedStructureBounds(structure, padding),
        );
        if (!collision || (first && collision.time >= first.time)) continue;
        first = { ...collision, obstacle: structure };
      }
    }
    for (const obstacle of this.terrain) {
      const collision = sweepBounds(
        unit,
        movementX,
        movementY,
        terrainBounds(obstacle, padding),
      );
      if (!collision || (first && collision.time >= first.time)) continue;
      first = { ...collision, obstacle };
    }
    return first;
  }

  resolveUnitStructureOverlap(unit) {
    const definition = UNIT_DEFINITIONS[unit.type];
    if (definition.movementLayer === "air" || definition.stridesOverStructures) return;
    const unitRadius = UNIT_DEFINITIONS[unit.type].radius;
    for (const structure of this.structures) {
      if (!structure.alive) continue;
      const padding = unitRadius + SIMULATION_RULES.structureCollisionPadding;
      const bounds = expandedStructureBounds(structure, padding);
      if (!pointInsideBounds(unit, bounds)) continue;

      const exits = [
        { distance: unit.x - bounds.minX, axis: "x", value: bounds.minX },
        { distance: bounds.maxX - unit.x, axis: "x", value: bounds.maxX },
        { distance: unit.y - bounds.minY, axis: "y", value: bounds.minY },
        { distance: bounds.maxY - unit.y, axis: "y", value: bounds.maxY },
      ]
        .filter((exit) =>
          exit.axis === "x"
            ? exit.value >= unitRadius && exit.value <= this.width - unitRadius
            : exit.value >= unitRadius && exit.value <= this.height - unitRadius,
        )
        .sort((left, right) => left.distance - right.distance);
      const exit = exits[0];
      if (!exit) continue;
      unit[exit.axis] = exit.value;
    }
  }

  resolveUnitTerrainOverlap(unit) {
    if (UNIT_DEFINITIONS[unit.type].movementLayer === "air") return;
    const unitRadius = UNIT_DEFINITIONS[unit.type].radius;
    for (const obstacle of this.terrain) {
      const bounds = terrainBounds(obstacle, unitRadius);
      if (!pointInsideBounds(unit, bounds)) continue;
      const exits = [
        { distance: unit.x - bounds.minX, axis: "x", value: bounds.minX },
        { distance: bounds.maxX - unit.x, axis: "x", value: bounds.maxX },
        { distance: unit.y - bounds.minY, axis: "y", value: bounds.minY },
        { distance: bounds.maxY - unit.y, axis: "y", value: bounds.maxY },
      ].sort((left, right) => left.distance - right.distance);
      const exit = exits[0];
      unit[exit.axis] = exit.value;
      unit.navigationObstacleId = obstacle.id;
    }
  }

  enterStasis(unit) {
    if (!unit.alive || unit.state === "stasis") return;
    unit.energy = 0;
    unit.state = "stasis";
    if (unit.moveTarget) {
      unit.moveQueue = [
        { x: unit.moveTarget.x, y: unit.moveTarget.y, mode: unit.moveMode || "normal" },
        ...(unit.moveQueue || []),
      ];
    }
    unit.moveTarget = null;
    unit.moveMode = null;
    unit.transportTargetId = null;
    unit.attackTargetId = null;
    unit.attackTargetMode = null;
    for (const weaponSystem of unit.weaponSystems || []) weaponSystem.targetId = null;
    unit.underbellyBeamActive = false;
    unit.underbellyBeamTargetIds = [];
    unit.navigationObstacleId = null;
    unit.navigationSide = null;
    this.emit("stasis", unit.x, unit.y, { unitId: unit.id });
  }

  updateChargers(delta) {
    this.ensureCombatSpatialIndex();
    for (const charger of this.structures) {
      const definition = STRUCTURE_DEFINITIONS[charger.type];
      if (!charger.alive || !definition.chargeRadius || !charger.powered) continue;
      const recipients = this.getNearbySpatialEntities(charger, definition.chargeRadius)
        .filter(
          (unit) =>
            unit.kind === "unit" &&
            unit.alive &&
            !unit.carriedById &&
            unit.team === charger.team &&
            unit.energy + EPSILON < UNIT_DEFINITIONS[unit.type].maxEnergy &&
            distance(unit, charger) <= definition.chargeRadius,
        )
        .map((unit) => ({
          unit,
          capacity: Math.min(
            UNIT_DEFINITIONS[unit.type].maxEnergy - unit.energy,
            definition.chargeRate * delta,
          ),
          allocation: 0,
        }))
        .sort((left, right) => left.capacity - right.capacity);
      if (recipients.length === 0) continue;

      const network = this.getPowerNetworkFor(charger);
      const requested = recipients.reduce((total, recipient) => total + recipient.capacity, 0);
      let remainingBudget = Math.min(requested, this.getNetworkAvailableEnergy(network));
      for (let index = 0; index < recipients.length; index += 1) {
        const remainingRecipients = recipients.length - index;
        const fairShare = remainingBudget / remainingRecipients;
        recipients[index].allocation = Math.min(recipients[index].capacity, fairShare);
        remainingBudget -= recipients[index].allocation;
      }

      const allocated = recipients.reduce((total, recipient) => total + recipient.allocation, 0);
      if (allocated <= EPSILON) continue;
      const supplied = this.takeStructureEnergy(charger, allocated);
      const supplyRatio = supplied / allocated;
      for (const recipient of recipients) {
        recipient.unit.energy += recipient.allocation * supplyRatio;
        this.tryReactivateFromSupply(recipient.unit);
      }
    }
  }

  updateEnergyCarriers(delta) {
    this.ensureCombatSpatialIndex();
    const carriers = this.units.filter(
      (unit) =>
        unit.alive &&
        !unit.carriedById &&
        unit.state === "active" &&
        UNIT_DEFINITIONS[unit.type].transferRate,
    );

    for (const carrier of carriers) {
      const definition = UNIT_DEFINITIONS[carrier.type];
      carrier.energyTransferTargetIds = [];
      carrier.energyTransferredThisTick = 0;
      const availableEnergy = Math.max(0, carrier.energy - definition.protectedReserve);
      let remainingBudget = Math.min(definition.transferRate * delta, availableEnergy);
      if (remainingBudget <= EPSILON) continue;

      const recipients = this.getNearbySpatialEntities(carrier, definition.transferRange)
        .filter((unit) => {
          if (
            unit.kind !== "unit" ||
            !unit.alive ||
            unit.carriedById ||
            unit.id === carrier.id ||
            unit.team !== carrier.team
          ) return false;
          const targetDefinition = UNIT_DEFINITIONS[unit.type];
          return (
            !targetDefinition.transferRate &&
            unit.energy + EPSILON < targetDefinition.maxEnergy &&
            distance(unit, carrier) <= definition.transferRange
          );
        })
        .map((unit) => ({
          unit,
          capacity: UNIT_DEFINITIONS[unit.type].maxEnergy - unit.energy,
          allocation: 0,
        }))
        .sort((left, right) => left.capacity - right.capacity);
      if (recipients.length === 0) continue;

      for (let index = 0; index < recipients.length; index += 1) {
        const remainingRecipients = recipients.length - index;
        const fairShare = remainingBudget / remainingRecipients;
        recipients[index].allocation = Math.min(recipients[index].capacity, fairShare);
        remainingBudget -= recipients[index].allocation;
      }

      const transferred = recipients.reduce(
        (total, recipient) => total + recipient.allocation,
        0,
      );
      if (transferred <= EPSILON) continue;
      carrier.energy -= transferred;
      carrier.energyTransferredThisTick = transferred;
      for (const recipient of recipients) {
        if (recipient.allocation <= EPSILON) continue;
        recipient.unit.energy += recipient.allocation;
        carrier.energyTransferTargetIds.push(recipient.unit.id);
        this.tryReactivateFromSupply(recipient.unit);
      }
    }
  }

  tryReactivateFromSupply(unit) {
    if (unit.state === "stasis" && unit.energy + EPSILON >= SIMULATION_RULES.reactivationThreshold) {
      unit.state = "active";
      this.emit("reactivated", unit.x, unit.y, { unitId: unit.id });
    }
  }

  updateDrones(delta) {
    this.droneNavigationSearchesRemaining = DRONE_NAVIGATION_SEARCHES_PER_TICK;
    this.lastDroneNavigationSearchCount = 0;
    const yards = this.structures.filter(
      (structure) => STRUCTURE_DEFINITIONS[structure.type].droneCount,
    );
    for (const yard of yards) {
      for (const drone of yard.drones) {
        if (!drone.alive) {
          if (yard.alive && yard.powered) {
            drone.replacementRemaining = Math.max(0, drone.replacementRemaining - delta);
            if (drone.replacementRemaining <= EPSILON) this.replaceDrone(drone, yard);
          }
          continue;
        }

        if (!yard.alive) {
          drone.mode = "stranded";
          drone.targetWreckId = null;
          this.resetDroneNavigation(drone);
          continue;
        }

        if (!yard.powered) {
          drone.targetWreckId = null;
          if (distance(drone, yard) > 22) {
            drone.mode = "returning";
            this.moveDroneToward(drone, yard, delta, 20);
          } else {
            drone.mode = "idle";
            this.resetDroneNavigation(drone);
          }
          continue;
        }

        this.updateDrone(drone, yard, delta);
      }
    }
  }

  updateDrone(drone, yard, delta) {
    let wreck = this.getWreck(drone.targetWreckId);
    if (wreck && wreck.metal <= EPSILON) wreck = null;

    if ((drone.mode === "idle" || drone.mode === "to_wreck") && !wreck) {
      if (drone.carry + EPSILON < DRONE_DEFINITION.carryCapacity) {
        wreck = this.findDroneTarget(drone);
      }
      drone.targetWreckId = wreck?.id || null;
      drone.mode = wreck ? "to_wreck" : drone.carry > EPSILON ? "returning" : "idle";
    }

    if (drone.mode === "to_wreck" && wreck) {
      const arrived = this.moveDroneToward(drone, wreck, delta, 12);
      if (arrived) {
        drone.mode = "collecting";
        this.resetDroneNavigation(drone);
      }
      return;
    }

    if (drone.mode === "collecting") {
      if (wreck) {
        const capacity = DRONE_DEFINITION.carryCapacity - drone.carry;
        const collected = Math.min(capacity, wreck.metal, DRONE_DEFINITION.collectionRate * delta);
        drone.carry += collected;
        wreck.metal -= collected;
      }
      if (drone.carry + EPSILON >= DRONE_DEFINITION.carryCapacity) {
        drone.mode = "returning";
        drone.targetWreckId = null;
        this.resetDroneNavigation(drone);
      } else if (!wreck || wreck.metal <= EPSILON) {
        const nextWreck = this.findDroneTarget(drone);
        drone.targetWreckId = nextWreck?.id || null;
        drone.mode = nextWreck ? "to_wreck" : drone.carry > EPSILON ? "returning" : "idle";
        this.resetDroneNavigation(drone);
      }
      return;
    }

    if (drone.mode === "returning") {
      const arrived = this.moveDroneToward(
        drone,
        yard,
        delta,
        STRUCTURE_DEFINITIONS[yard.type].radius * 0.65,
      );
      if (arrived) {
        this.resources[yard.team].metal += drone.carry;
        if (drone.carry > EPSILON) this.emit("salvage", yard.x, yard.y, { amount: drone.carry });
        drone.carry = 0;
        drone.mode = "idle";
        this.resetDroneNavigation(drone);
      }
    }
  }

  findDroneTarget(drone) {
    const candidates = this.wrecks.filter((wreck) => wreck.metal > EPSILON);
    return nearest(drone, candidates);
  }

  moveDroneToward(drone, target, delta, stopDistance = 0) {
    if (distance(drone, target) <= stopDistance + EPSILON) {
      this.resetDroneNavigation(drone);
      return true;
    }

    const waypoint = this.getDroneNavigationWaypoint(drone, target);
    const dx = waypoint.x - drone.x;
    const dy = waypoint.y - drone.y;
    const separation = Math.hypot(dx, dy);
    const waypointStopDistance = waypoint === target ? stopDistance : 0;
    if (separation <= waypointStopDistance + EPSILON) return false;
    const requestedDistance = Math.min(
      DRONE_DEFINITION.speed * delta,
      separation - waypointStopDistance,
    );
    this.moveDroneWithTerrainCollisions(
      drone,
      (dx / separation) * requestedDistance,
      (dy / separation) * requestedDistance,
    );
    return distance(drone, target) <= stopDistance + EPSILON;
  }

  getDroneNavigationWaypoint(drone, target) {
    drone.navigationPath = Array.isArray(drone.navigationPath) ? drone.navigationPath : [];
    if (!Number.isFinite(drone.navigationReplanAt)) drone.navigationReplanAt = this.time;
    const obstacles = this.getDroneNavigationObstacles();
    const targetId = target.id || null;
    if (navigationSegmentIsClear(drone, target, obstacles)) {
      drone.navigationPath = [];
      drone.navigationTarget = { id: targetId, x: target.x, y: target.y };
      return target;
    }

    const previousTarget = drone.navigationTarget;
    const targetChanged =
      !previousTarget ||
      previousTarget.id !== targetId ||
      Math.hypot(target.x - previousTarget.x, target.y - previousTarget.y) >
        NAVIGATION_TARGET_TOLERANCE;
    let pathBlocked = false;
    while (drone.navigationPath.length) {
      if (distance(drone, drone.navigationPath[0]) <= NAVIGATION_CORNER_MARGIN + EPSILON) {
        drone.navigationPath.shift();
        continue;
      }
      pathBlocked = !navigationSegmentIsClear(drone, drone.navigationPath[0], obstacles);
      break;
    }

    if (targetChanged || pathBlocked) drone.navigationPath = [];
    const retryDue = this.time + EPSILON >= drone.navigationReplanAt;
    if (
      (targetChanged || pathBlocked || (!drone.navigationPath.length && retryDue)) &&
      this.droneNavigationSearchesRemaining > 0
    ) {
      this.droneNavigationSearchesRemaining -= 1;
      this.lastDroneNavigationSearchCount += 1;
      const path = findNavigationPath(
        drone,
        target,
        obstacles,
        DRONE_DEFINITION.radius,
        this.width,
        this.height,
      );
      drone.navigationPath = path ? path.slice(1) : [];
      drone.navigationTarget = { id: targetId, x: target.x, y: target.y };
      drone.navigationReplanAt = this.time + NAVIGATION_REPLAN_INTERVAL;
    }

    while (
      drone.navigationPath.length > 1 &&
      navigationSegmentIsClear(drone, drone.navigationPath[1], obstacles)
    ) {
      drone.navigationPath.shift();
    }
    return drone.navigationPath[0] || target;
  }

  getDroneNavigationObstacles() {
    if (this.droneNavigationObstacles) return this.droneNavigationObstacles;
    this.droneNavigationObstacles = this.terrain
      .filter(
        (obstacle) =>
          !DRONE_DEFINITION.terrainOverflightTypes?.includes(obstacle.terrainType),
      )
      .map((obstacle) => ({
        id: obstacle.id,
        bounds: terrainBounds(obstacle, DRONE_DEFINITION.radius),
      }));
    return this.droneNavigationObstacles;
  }

  resetDroneNavigation(drone) {
    drone.navigationObstacleId = null;
    drone.navigationSide = null;
    drone.navigationPath = [];
    drone.navigationTarget = null;
    drone.navigationReplanAt = this.time + navigationReplanPhase(drone.id);
  }

  moveDroneWithTerrainCollisions(drone, movementX, movementY) {
    let remainingX = movementX;
    let remainingY = movementY;
    for (let pass = 0; pass < 3; pass += 1) {
      if (Math.hypot(remainingX, remainingY) <= EPSILON) break;
      let first = null;
      for (const obstacle of this.terrain) {
        if (DRONE_DEFINITION.terrainOverflightTypes?.includes(obstacle.terrainType)) continue;
        const collision = sweepBounds(
          drone,
          remainingX,
          remainingY,
          terrainBounds(obstacle, DRONE_DEFINITION.radius),
        );
        if (!collision || (first && collision.time >= first.time)) continue;
        first = { ...collision, obstacle };
      }
      if (!first) {
        drone.x = clamp(drone.x + remainingX, 0, this.width);
        drone.y = clamp(drone.y + remainingY, 0, this.height);
        break;
      }

      const safeTime = Math.max(0, first.time - 0.001);
      drone.x = clamp(drone.x + remainingX * safeTime, 0, this.width);
      drone.y = clamp(drone.y + remainingY * safeTime, 0, this.height);
      const leftoverScale = 1 - safeTime;
      let slideX = remainingX * leftoverScale;
      let slideY = remainingY * leftoverScale;
      const inward = slideX * first.normalX + slideY * first.normalY;
      if (inward < 0) {
        slideX -= first.normalX * inward;
        slideY -= first.normalY * inward;
      }

      const remainingDistance = Math.hypot(remainingX, remainingY) * leftoverScale;
      let side = drone.navigationSide;
      if (drone.navigationObstacleId !== first.obstacle.id || !side) {
        const positiveTangentX = -first.normalY;
        const positiveTangentY = first.normalX;
        const naturalTangent = slideX * positiveTangentX + slideY * positiveTangentY;
        side = Math.abs(naturalTangent) > EPSILON
          ? Math.sign(naturalTangent)
          : deterministicSide(drone.id, first.obstacle.id);
        drone.navigationObstacleId = first.obstacle.id;
        drone.navigationSide = side;
      }
      const preferredTangentX = -first.normalY * side;
      const preferredTangentY = first.normalX * side;
      if (slideX * preferredTangentX + slideY * preferredTangentY <= EPSILON) {
        slideX = preferredTangentX * remainingDistance;
        slideY = preferredTangentY * remainingDistance;
      }
      remainingX = slideX;
      remainingY = slideY;
    }
  }

  destroyUnit(unit) {
    if (!unit?.alive) return;
    const destroyedAt = { x: unit.x, y: unit.y };
    const carrier = this.getUnit(unit.carriedById);
    if (carrier) {
      carrier.cargoUnitIds = (carrier.cargoUnitIds || []).filter((id) => id !== unit.id);
    }

    const cargoIds = [...(unit.cargoUnitIds || [])];
    unit.cargoUnitIds = [];
    unit.alive = false;
    this.combatSpatialIndexDirty = true;
    unit.hp = 0;
    unit.state = "destroyed";
    unit.carriedById = null;
    unit.transportTargetId = null;
    unit.moveTarget = null;
    unit.moveMode = null;
    unit.moveQueue = [];
    unit.patrolRoute = [];
    unit.patrolIndex = 0;
    unit.attackTargetId = null;
    unit.attackTargetMode = null;
    for (const weaponSystem of unit.weaponSystems || []) weaponSystem.targetId = null;
    unit.buildTargetId = null;
    unit.buildQueue = [];
    unit.repairTargetId = null;
    unit.productionAssistTargetId = null;
    unit.navigationObstacleId = null;
    unit.navigationSide = null;
    const salvageMetal = Math.round(UNIT_DEFINITIONS[unit.type].metalValue * 0.55);
    this.addWreck(destroyedAt.x, destroyedAt.y, salvageMetal, unit.team);
    this.emit("destroyed", destroyedAt.x, destroyedAt.y, { targetId: unit.id });

    for (const passengerId of cargoIds) {
      const passenger = this.getUnit(passengerId);
      if (!passenger?.alive || passenger.carriedById !== unit.id) continue;
      passenger.x = destroyedAt.x;
      passenger.y = destroyedAt.y;
      this.destroyUnit(passenger);
    }
    for (const passenger of this.units) {
      if (passenger.alive && passenger.transportTargetId === unit.id) {
        passenger.transportTargetId = null;
        if (passenger.moveMode === "transport") {
          passenger.moveTarget = null;
          passenger.moveMode = null;
        }
      }
    }
  }

  applyDamage(target, amount, source = null) {
    if (
      !target?.alive ||
      amount <= 0 ||
      (source?.team && this.areAlliedTeams(source.team, target.team))
    ) return;
    const shield = this.findProtectingShield(target);
    let remainingDamage = amount;
    if (shield) {
      const absorbedDamage = Math.min(remainingDamage, shield.shieldStrength);
      shield.shieldStrength = Math.max(0, shield.shieldStrength - absorbedDamage);
      remainingDamage -= absorbedDamage;
      shield.shieldStatus = shield.shieldStrength > EPSILON ? "absorbing" : "depleted";
      this.emit("shield_hit", target.x, target.y, {
        targetId: target.id,
        shieldId: shield.id,
        absorbedDamage,
        depleted: shield.shieldStrength <= EPSILON,
      });
    }
    if (remainingDamage <= EPSILON) {
      this.assignRetaliationTarget(target, source);
      return;
    }
    target.hp = Math.max(0, target.hp - remainingDamage);
    if (target.hp > EPSILON) {
      this.assignRetaliationTarget(target, source);
      return;
    }

    this.destroyEntity(target);
  }

  destroyEntity(target, { triggerHeadquartersLoss = true } = {}) {
    if (!target?.alive) return false;
    if (target.kind === "drone") {
      this.destroyDrone(target);
      return true;
    }

    const definition = target.kind === "structure"
      ? STRUCTURE_DEFINITIONS[target.type]
      : UNIT_DEFINITIONS[target.type];
    if (target.kind === "unit") {
      this.destroyUnit(target);
      return true;
    }
    if (target.kind === "structure") this.recordAiConstructionLoss(target);
    target.hp = 0;
    target.alive = false;
    this.combatSpatialIndexDirty = true;
    target.powered = false;
    target.connected = false;
    target.powerStatus = "destroyed";
    this.emit("destroyed", target.x, target.y, { targetId: target.id });

    if (triggerHeadquartersLoss && definition.headquarters) {
      this.eliminateTeamAfterHeadquartersLoss(target.team, target.id);
    }
    return true;
  }

  eliminateTeamAfterHeadquartersLoss(teamId, headquartersId) {
    for (const drone of this.getDrones()) {
      if (drone.alive && drone.team === teamId) this.destroyDrone(drone);
    }
    for (const unit of this.units) {
      if (unit.alive && unit.team === teamId) {
        this.destroyEntity(unit, { triggerHeadquartersLoss: false });
      }
    }
    for (const structure of this.structures) {
      if (structure.alive && structure.team === teamId) {
        this.destroyEntity(structure, { triggerHeadquartersLoss: false });
      }
    }
    this.emit("team_eliminated", this.width / 2, this.height / 2, {
      team: teamId,
      headquartersId,
    });
    this.updateMatchResult();
  }

  findProtectingShield(target) {
    if (!target?.alive || !target.team || !Number.isFinite(target.x) || !Number.isFinite(target.y)) {
      return null;
    }
    return nearest(
      target,
      this.structures.filter((shield) => {
        const definition = STRUCTURE_DEFINITIONS[shield.type];
        return shield.alive &&
          shield.complete &&
          shield.powered &&
          shield.team === target.team &&
          definition.shieldCapacity &&
          shield.shieldStrength > EPSILON &&
          distance(shield, target) <= definition.shieldRadius + EPSILON;
      }),
    );
  }

  assignRetaliationTarget(target, aggressor) {
    const definition = target.kind === "unit" ? UNIT_DEFINITIONS[target.type] : null;
    const buildTarget = target.kind === "unit"
      ? this.getStructure(target.buildTargetId)
      : null;
    const repairTarget = target.kind === "unit"
      ? this.getEntity(target.repairTargetId)
      : null;
    const productionAssistTarget = target.kind === "unit"
      ? this.getStructure(target.productionAssistTargetId)
      : null;
    if (
      target.kind !== "unit" ||
      target.state !== "active" ||
      !aggressor?.alive ||
      !aggressor.id ||
      this.areAlliedTeams(aggressor.team, target.team) ||
      definition.attackRange <= 0 ||
      !canUnitAttackTarget(definition, aggressor) ||
      (
        definition.workerTier &&
        (
          (
            buildTarget?.alive &&
            !buildTarget.complete &&
            buildTarget.team === target.team
          ) ||
          isValidRepairTarget(target, repairTarget) ||
          isValidProductionAssistTarget(target, productionAssistTarget)
        )
      ) ||
      ["force", "advance", "retreat", "transport"].includes(target.moveMode)
    ) {
      return false;
    }

    const explicitTarget = this.getEntity(target.attackTargetId);
    if (target.attackTargetMode === "explicit" && explicitTarget?.alive) return false;

    const preserveMoveOrder = Boolean(target.moveTarget);
    target.attackTargetId = aggressor.id;
    target.attackTargetMode = "retaliation";
    if (!preserveMoveOrder) {
      target.moveTarget = null;
      target.moveMode = null;
    }
    target.buildTargetId = null;
    target.repairTargetId = null;
    target.productionAssistTargetId = null;
    target.holdPosition = false;
    target.navigationObstacleId = null;
    target.navigationSide = null;
    return true;
  }

  destroyDrone(drone) {
    if (!drone.alive) return;
    const yard = this.getStructure(drone.yardId);
    const destroyedAt = { x: drone.x, y: drone.y };
    const droppedMetal = drone.carry;
    drone.alive = false;
    this.combatSpatialIndexDirty = true;
    drone.hp = 0;
    drone.carry = 0;
    drone.mode = "rebuilding";
    drone.targetWreckId = null;
    drone.destroyedAtX = destroyedAt.x;
    drone.destroyedAtY = destroyedAt.y;
    this.resetDroneNavigation(drone);
    drone.replacementRemaining = yard
      ? STRUCTURE_DEFINITIONS[yard.type].droneReplacementTime
      : STRUCTURE_DEFINITIONS.salvage_yard.droneReplacementTime;
    if (droppedMetal > EPSILON) this.addWreck(destroyedAt.x, destroyedAt.y, droppedMetal, "neutral");
    this.emit("destroyed", destroyedAt.x, destroyedAt.y, { targetId: drone.id, droppedMetal });
    if (yard) {
      drone.x = yard.x;
      drone.y = yard.y;
    }
  }

  replaceDrone(drone, yard) {
    const angle = (drone.slot / STRUCTURE_DEFINITIONS[yard.type].droneCount) * Math.PI * 2;
    drone.alive = true;
    this.combatSpatialIndexDirty = true;
    drone.hp = DRONE_DEFINITION.maxHp;
    drone.x = yard.x + Math.cos(angle) * 28;
    drone.y = yard.y + Math.sin(angle) * 28;
    drone.mode = "idle";
    drone.carry = 0;
    drone.targetWreckId = null;
    drone.destroyedAtX = null;
    drone.destroyedAtY = null;
    this.resetDroneNavigation(drone);
    drone.replacementRemaining = 0;
    this.emit("drone_replaced", drone.x, drone.y, { droneId: drone.id });
  }

  emit(type, x, y, detail = {}) {
    this.events.push({ type, x, y, time: this.time, ...detail });
  }

  emitAttack(source, target, impactDelay = 0, detail = {}) {
    this.emit("attack", target.x, target.y, {
      sourceId: source.id,
      targetId: target.id,
      sourceX: source.x,
      sourceY: source.y,
      targetX: target.x,
      targetY: target.y,
      sourceRadius: entityRadius(source),
      targetRadius: entityRadius(target),
      impactDelay,
      ...detail,
    });
  }
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function energyRatio(unit) {
  return unit.energy / UNIT_DEFINITIONS[unit.type].maxEnergy;
}

function canUnitAttackTarget(definition, target) {
  return Boolean(
    canPrimaryWeaponAttackTarget(definition, target) ||
    definition?.weaponSystems?.some(
      (weaponDefinition) =>
        canWeaponSystemAttackTarget(definition, weaponDefinition, target),
    )
  );
}

function canPrimaryWeaponAttackTarget(definition, target) {
  if (!target || target.carriedById) return false;
  if (definition?.underbellyBeamRadius) return isUnderbellyBeamTarget(target);
  if (!definition?.groundAttackOnly || target.kind !== "unit") return true;
  return UNIT_DEFINITIONS[target.type]?.movementLayer !== "air";
}

function canWeaponSystemAttackTarget(definition, weaponDefinition, target) {
  if (!target || target.carriedById) return false;
  if (weaponDefinition.targetLayer === "air") {
    return Boolean(
      target.kind === "unit" &&
      UNIT_DEFINITIONS[target.type]?.movementLayer === "air"
    );
  }
  if (weaponDefinition.targetLayer === "ground") return isUnderbellyBeamTarget(target);
  return canPrimaryWeaponAttackTarget(
    { ...definition, underbellyBeamRadius: 0 },
    target,
  );
}

function unitAttackRangeAgainstTarget(definition, target) {
  if (!definition || !target) return 0;
  const weaponRanges = (definition.weaponSystems || [])
    .filter((weaponDefinition) =>
      canWeaponSystemAttackTarget(definition, weaponDefinition, target),
    )
    .map((weaponDefinition) => weaponDefinition.attackRange || 0);
  return Math.max(
    canPrimaryWeaponAttackTarget(definition, target) ? definition.attackRange || 0 : 0,
    ...weaponRanges,
  );
}

function isPrimaryWeaponTargetInRange(definition, source, target) {
  if (!canPrimaryWeaponAttackTarget(definition, target)) return false;
  const separation = distance(source, target);
  return (
    separation + EPSILON >= (definition.minimumAttackRange || 0) &&
    separation <= (definition.attackRange || 0) + entityRadius(target)
  );
}

function isUnitTargetInWeaponRange(definition, source, target) {
  if (isPrimaryWeaponTargetInRange(definition, source, target)) return true;
  const separation = distance(source, target);
  return (definition.weaponSystems || []).some(
    (weaponDefinition) =>
      canWeaponSystemAttackTarget(definition, weaponDefinition, target) &&
      separation + EPSILON >= (weaponDefinition.minimumAttackRange || 0) &&
      separation <= weaponDefinition.attackRange + entityRadius(target),
  );
}

function isUnderbellyBeamTarget(target) {
  if (!target) return false;
  if (target.kind === "structure") return true;
  return (
    target.kind === "unit" &&
    UNIT_DEFINITIONS[target.type]?.movementLayer !== "air"
  );
}

function projectileImpactDelay(source, target, definition) {
  const kinetics = projectileKinetics(definition);
  if (!kinetics) return 0;
  const muzzleDistance = Math.max(5, entityRadius(source) * 0.72);
  const impactInset = Math.max(2, entityRadius(target) * 0.3);
  const flightDistance = Math.max(0, distance(source, target) - muzzleDistance - impactInset);
  return Math.max(
    kinetics.minimumTravelTime,
    flightDistance / kinetics.speed,
  );
}

function normalizeWeaponSystemState(states, definition) {
  const sourceStates = Array.isArray(states) ? states : [];
  return (definition.weaponSystems || []).map((weaponDefinition, index) => ({
    targetId: sourceStates[index]?.targetId || null,
    cooldownRemaining: Math.max(
      0,
      Number.isFinite(sourceStates[index]?.cooldownRemaining)
        ? sourceStates[index].cooldownRemaining
        : 0,
    ),
    id: weaponDefinition.id,
  }));
}

function ensureWeaponSystemState(unit, definition) {
  const expectedCount = definition.weaponSystems?.length || 0;
  if (
    !Array.isArray(unit.weaponSystems) ||
    unit.weaponSystems.length !== expectedCount ||
    unit.weaponSystems.some((state) => !state || !Number.isFinite(state.cooldownRemaining))
  ) {
    unit.weaponSystems = normalizeWeaponSystemState(unit.weaponSystems, definition);
  }
  return unit.weaponSystems;
}

function nearest(origin, candidates) {
  let result = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const candidateDistance = distance(origin, candidate);
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      result = candidate;
    }
  }
  return result;
}

function nearestBySurfaceDistance(origin, candidates) {
  let result = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const candidateDistance = distanceToEntitySurface(origin, candidate);
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      result = candidate;
    }
  }
  return result;
}

function preferredTargets(definition, candidates) {
  if (definition.preferredTargetLayer) {
    const preferredLayerTargets = candidates.filter(
      (candidate) =>
        candidate.kind === "unit" &&
        UNIT_DEFINITIONS[candidate.type]?.movementLayer === definition.preferredTargetLayer,
    );
    if (preferredLayerTargets.length > 0) return preferredLayerTargets;
  }
  if (!definition.preferredStructureFamilies?.length) return candidates;
  const preferredStructures = candidates.filter((candidate) => {
    if (candidate.kind !== "structure") return false;
    const family = STRUCTURE_DEFINITIONS[candidate.type]?.family;
    return definition.preferredStructureFamilies.includes(family);
  });
  return preferredStructures.length > 0 ? preferredStructures : candidates;
}

function damageMultiplierAgainstTarget(definition, target) {
  let multiplier = target.kind === "structure"
    ? definition.structureDamageMultiplier || 1
    : 1;
  const targetIsAircraft = Boolean(
    target.kind === "unit" &&
    UNIT_DEFINITIONS[target.type]?.movementLayer === "air"
  );
  if (targetIsAircraft) {
    multiplier *= definition.airDamageMultiplier || SIMULATION_RULES.normalAirDamageMultiplier;
  } else {
    multiplier *= definition.groundDamageMultiplier || 1;
  }
  return multiplier;
}

function isCombatUnitDefinition(definition) {
  return Boolean(
    definition &&
    (definition.attackRange > 0 || definition.underbellyBeamRadius > 0) &&
    !definition.workerTier,
  );
}

function isMobileEnergySupportDefinition(definition) {
  return Boolean(definition?.transferRate);
}

function isStaticDefenseTargetInRange(definition, defense, target) {
  const separation = distance(defense, target);
  return (
    separation + EPSILON >= (definition.minimumAttackRange || 0) &&
    separation <= definition.attackRange + entityRadius(target)
  );
}

function repairableEntityMaxHp(entity) {
  if (entity?.kind === "unit") return UNIT_DEFINITIONS[entity.type]?.maxHp || 0;
  if (entity?.kind === "structure") return STRUCTURE_DEFINITIONS[entity.type]?.maxHp || 0;
  return 0;
}

function isValidRepairTarget(worker, target) {
  const definition = worker?.kind === "unit" ? UNIT_DEFINITIONS[worker.type] : null;
  const maximumHp = repairableEntityMaxHp(target);
  return Boolean(
    worker?.alive &&
    !worker.carriedById &&
    definition?.workerTier &&
    definition.repairRate &&
    target?.alive &&
    !target.carriedById &&
    target.id !== worker.id &&
    target.team === worker.team &&
    (target.kind !== "structure" || target.complete) &&
    target.hp + EPSILON < maximumHp
  );
}

function isActivelyProducingFactory(factory) {
  const definition = factory?.kind === "structure"
    ? STRUCTURE_DEFINITIONS[factory.type]
    : null;
  const order = factory?.productionQueue?.[0];
  const unitDefinition = order ? UNIT_DEFINITIONS[order.unitType] : null;
  return Boolean(
    factory?.alive &&
    factory.complete &&
    factory.powered &&
    definition?.production &&
    order &&
    unitDefinition &&
    order.progress + EPSILON < unitDefinition.productionTime
  );
}

function isValidProductionAssistTarget(worker, factory) {
  const workerDefinition = worker?.kind === "unit" ? UNIT_DEFINITIONS[worker.type] : null;
  const factoryDefinition = factory?.kind === "structure"
    ? STRUCTURE_DEFINITIONS[factory.type]
    : null;
  return Boolean(
    worker?.alive &&
    !worker.carriedById &&
    worker.productionAssistTargetId === factory?.id &&
    workerDefinition?.workerTier &&
    workerDefinition.productionAssistRate &&
    factory?.alive &&
    factory.complete &&
    factory.team === worker.team &&
    factoryDefinition?.production &&
    factory.productionQueue?.length
  );
}

function isActivelyAssistingProduction(worker, factory) {
  return Boolean(
    isProductionAssistantReady(worker, factory) &&
    isActivelyProducingFactory(factory)
  );
}

function isProductionAssistantReady(worker, factory) {
  const order = factory?.productionQueue?.[0];
  const unitDefinition = order ? UNIT_DEFINITIONS[order.unitType] : null;
  return Boolean(
    worker?.state === "active" &&
    isValidProductionAssistTarget(worker, factory) &&
    unitDefinition &&
    order.progress + EPSILON < unitDefinition.productionTime &&
    distanceToStructureFootprint(worker, factory) <=
      SIMULATION_RULES.workerProductionAssistRange + EPSILON
  );
}

function distanceToEntitySurface(origin, target) {
  if (target.kind === "structure") return distanceToStructureFootprint(origin, target);
  return Math.max(0, distance(origin, target) - entityRadius(target));
}

function entityRadius(entity) {
  if (entity.kind === "unit") return UNIT_DEFINITIONS[entity.type].radius;
  if (entity.kind === "structure") return STRUCTURE_DEFINITIONS[entity.type].radius;
  if (entity.kind === "drone") return DRONE_DEFINITION.radius;
  return 0;
}

function combatStrength(entity) {
  const definition = entity.kind === "unit"
    ? UNIT_DEFINITIONS[entity.type]
    : STRUCTURE_DEFINITIONS[entity.type];
  if (
    !definition?.maxHp ||
    (!definition.attackRange && !definition.underbellyBeamRadius)
  ) return 0;
  const healthRatio = clamp(entity.hp / definition.maxHp, 0, 1);
  const damageRate = definition.underbellyBeamDamagePerSecond ||
    definition.attackDamage / Math.max(definition.attackCooldown, EPSILON);
  return healthRatio * (definition.maxHp + damageRate * 20);
}

function powerReach(structure) {
  return powerReachForType(structure.type);
}

function powerReachForType(structureType) {
  const definition = STRUCTURE_DEFINITIONS[structureType];
  return definition.relayRadius || definition.powerRadius || 0;
}

function isPowerNode(structure) {
  return isPowerNodeType(structure.type);
}

function isPowerNodeType(structureType) {
  const definition = STRUCTURE_DEFINITIONS[structureType];
  return Boolean(definition && (definition.generationRate || definition.powerRadius || definition.relayRadius));
}

function structureFamily(structure) {
  return STRUCTURE_DEFINITIONS[structure.type].family;
}

function plannedStructurePowerDemand(structureType) {
  const definition = STRUCTURE_DEFINITIONS[structureType];
  return (definition.powerDemand || 0) + (definition.productionPowerDemand || 0);
}

function nearestReachablePowerNode(structure, nodes) {
  return nodes
    .filter((node) => powerNodeCoversPoint(node, structure.x, structure.y))
    .sort((left, right) => distance(left, structure) - distance(right, structure))[0] || null;
}

function powerNodeCoversPoint(node, x, y) {
  return pointInGridCoverage(powerCoverageBounds(node.type, node.x, node.y), x, y);
}

function powerNodesCanConnect(left, right) {
  return (
    powerNodeCoversPoint(left, right.x, right.y) ||
    powerNodeCoversPoint(right, left.x, left.y)
  );
}

function distanceToStructureFootprint(entity, structure) {
  const footprint = structureFootprint(structure.type);
  const deltaX = Math.max(Math.abs(entity.x - structure.x) - footprint.halfWidth, 0);
  const deltaY = Math.max(Math.abs(entity.y - structure.y) - footprint.halfHeight, 0);
  return Math.hypot(deltaX, deltaY);
}

function expandedStructureBounds(structure, padding) {
  const footprint = structureFootprint(structure.type);
  return {
    minX: structure.x - footprint.halfWidth - padding,
    maxX: structure.x + footprint.halfWidth + padding,
    minY: structure.y - footprint.halfHeight - padding,
    maxY: structure.y + footprint.halfHeight + padding,
  };
}

function terrainBounds(obstacle, padding = 0) {
  return {
    minX: obstacle.x - obstacle.width / 2 - padding,
    maxX: obstacle.x + obstacle.width / 2 + padding,
    minY: obstacle.y - obstacle.height / 2 - padding,
    maxY: obstacle.y + obstacle.height / 2 + padding,
  };
}

function navigationReplanPhase(entityId) {
  return deterministicPhase(entityId, NAVIGATION_REPLAN_INTERVAL);
}

function deterministicPhase(entityId, interval) {
  let hash = 0;
  for (let index = 0; index < entityId.length; index += 1) {
    hash = (hash * 31 + entityId.charCodeAt(index)) >>> 0;
  }
  return (hash % 997) / 997 * interval;
}

function nextDeterministicIntervalTime(entityId, currentTime, interval) {
  const phase = deterministicPhase(entityId, interval);
  const completedIntervals = Math.floor((currentTime - phase) / interval) + 1;
  return Math.max(currentTime + EPSILON, phase + completedIntervals * interval);
}

function footprintOverlapsTerrain(x, y, footprint, obstacle) {
  return (
    Math.abs(x - obstacle.x) + EPSILON < footprint.halfWidth + obstacle.width / 2 &&
    Math.abs(y - obstacle.y) + EPSILON < footprint.halfHeight + obstacle.height / 2
  );
}

function terrainIntersectsWorld(obstacle, width, height) {
  const bounds = terrainBounds(obstacle);
  return bounds.maxX > 0 && bounds.minX < width && bounds.maxY > 0 && bounds.minY < height;
}

function pointInsideBounds(point, bounds) {
  return (
    point.x > bounds.minX + EPSILON &&
    point.x < bounds.maxX - EPSILON &&
    point.y > bounds.minY + EPSILON &&
    point.y < bounds.maxY - EPSILON
  );
}

function navigationSegmentIsClear(start, end, obstacles) {
  const movementX = end.x - start.x;
  const movementY = end.y - start.y;
  if (Math.hypot(movementX, movementY) <= EPSILON) return true;
  const segmentBounds = {
    minX: Math.min(start.x, end.x),
    maxX: Math.max(start.x, end.x),
    minY: Math.min(start.y, end.y),
    maxY: Math.max(start.y, end.y),
  };
  return obstacles.every(({ bounds }) => {
    if (!boundsOverlap(bounds, segmentBounds)) return true;
    const collision = sweepBounds(start, movementX, movementY, bounds);
    return !collision || collision.time >= 1 - EPSILON;
  });
}

function findNavigationPath(
  start,
  goal,
  obstacles,
  radius,
  worldWidth,
  worldHeight,
  statistics = null,
) {
  let previousObstacleKey = null;
  for (const marginMultiplier of [1, 2]) {
    const routeObstacles = limitNavigationNodeObstacles(
      navigationObstaclesNearRoute(
        start,
        goal,
        obstacles,
        NAVIGATION_SEARCH_MARGIN * marginMultiplier,
      ),
      start,
      goal,
    );
    const obstacleKey = routeObstacles.map((obstacle) => obstacle.id).join("\0");
    if (obstacleKey === previousObstacleKey) continue;
    recordNavigationNodeObstacleCount(statistics, routeObstacles.length);
    const routePath = findVisibilityPath(
      start,
      goal,
      routeObstacles,
      obstacles,
      radius,
      worldWidth,
      worldHeight,
    );
    if (routePath || routeObstacles.length === obstacles.length) return routePath;
    previousObstacleKey = obstacleKey;
  }
  const fallbackObstacles = limitNavigationNodeObstacles(obstacles, start, goal);
  recordNavigationNodeObstacleCount(statistics, fallbackObstacles.length);
  return findVisibilityPath(
    start,
    goal,
    fallbackObstacles,
    obstacles,
    radius,
    worldWidth,
    worldHeight,
  );
}

function limitNavigationNodeObstacles(obstacles, start, goal) {
  if (obstacles.length <= MAX_NAVIGATION_NODE_OBSTACLES) return obstacles;
  return [...obstacles]
    .sort((left, right) =>
      boundsDistanceToSegment(left.bounds, start, goal) -
        boundsDistanceToSegment(right.bounds, start, goal) ||
      left.id.localeCompare(right.id)
    )
    .slice(0, MAX_NAVIGATION_NODE_OBSTACLES);
}

function recordNavigationNodeObstacleCount(statistics, count) {
  if (!statistics) return;
  statistics.maximumNodeObstacleCount = Math.max(
    statistics.maximumNodeObstacleCount,
    count,
  );
}

function navigationObstaclesNearRoute(start, goal, obstacles, margin) {
  const searchBounds = {
    minX: Math.min(start.x, goal.x) - margin,
    maxX: Math.max(start.x, goal.x) + margin,
    minY: Math.min(start.y, goal.y) - margin,
    maxY: Math.max(start.y, goal.y) + margin,
  };
  return obstacles.filter(({ bounds }) =>
    boundsOverlap(bounds, searchBounds) && boundsNearSegment(bounds, start, goal, margin),
  );
}

function findVisibilityPath(
  start,
  goal,
  nodeObstacles,
  collisionObstacles,
  radius,
  worldWidth,
  worldHeight,
) {
  const nodes = [{ x: start.x, y: start.y }, { x: goal.x, y: goal.y }];
  for (const { bounds } of nodeObstacles) {
    const corners = [
      { x: bounds.minX - NAVIGATION_CORNER_MARGIN, y: bounds.minY - NAVIGATION_CORNER_MARGIN },
      { x: bounds.maxX + NAVIGATION_CORNER_MARGIN, y: bounds.minY - NAVIGATION_CORNER_MARGIN },
      { x: bounds.maxX + NAVIGATION_CORNER_MARGIN, y: bounds.maxY + NAVIGATION_CORNER_MARGIN },
      { x: bounds.minX - NAVIGATION_CORNER_MARGIN, y: bounds.maxY + NAVIGATION_CORNER_MARGIN },
    ];
    for (const corner of corners) {
      if (
        corner.x < radius ||
        corner.x > worldWidth - radius ||
        corner.y < radius ||
        corner.y > worldHeight - radius ||
        collisionObstacles.some(({ bounds: otherBounds }) => pointInsideBounds(corner, otherBounds))
      ) {
        continue;
      }
      nodes.push(corner);
    }
  }

  const costs = Array(nodes.length).fill(Infinity);
  const estimates = Array(nodes.length).fill(Infinity);
  const previous = Array(nodes.length).fill(-1);
  const visited = Array(nodes.length).fill(false);
  const edgeVisibility = new Map();
  costs[0] = 0;
  estimates[0] = distance(nodes[0], nodes[1]);

  for (let iteration = 0; iteration < nodes.length; iteration += 1) {
    let current = -1;
    for (let index = 0; index < nodes.length; index += 1) {
      if (visited[index]) continue;
      if (
        current === -1 ||
        estimates[index] + EPSILON < estimates[current] ||
        (Math.abs(estimates[index] - estimates[current]) <= EPSILON && index < current)
      ) {
        current = index;
      }
    }
    if (current === -1 || !Number.isFinite(costs[current])) break;
    if (current === 1) break;
    visited[current] = true;

    for (let neighbor = 1; neighbor < nodes.length; neighbor += 1) {
      if (neighbor === current || visited[neighbor]) continue;
      const edgeKey = current < neighbor ? `${current}:${neighbor}` : `${neighbor}:${current}`;
      let visible = edgeVisibility.get(edgeKey);
      if (visible === undefined) {
        visible = navigationSegmentIsClear(nodes[current], nodes[neighbor], collisionObstacles);
        edgeVisibility.set(edgeKey, visible);
      }
      if (!visible) continue;
      const candidateCost = costs[current] + distance(nodes[current], nodes[neighbor]);
      if (candidateCost + EPSILON >= costs[neighbor]) continue;
      costs[neighbor] = candidateCost;
      estimates[neighbor] = candidateCost + distance(nodes[neighbor], nodes[1]);
      previous[neighbor] = current;
    }
  }

  if (!Number.isFinite(costs[1])) return null;
  const path = [];
  for (let index = 1; index !== -1; index = previous[index]) path.push(nodes[index]);
  path.reverse();
  return path;
}

function boundsOverlap(first, second) {
  return (
    first.maxX >= second.minX &&
    first.minX <= second.maxX &&
    first.maxY >= second.minY &&
    first.minY <= second.maxY
  );
}

function boundsNearSegment(bounds, start, goal, margin = NAVIGATION_SEARCH_MARGIN) {
  const obstacleRadius = Math.hypot(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
  ) / 2;
  return boundsDistanceToSegment(bounds, start, goal) <= margin + obstacleRadius;
}

function boundsDistanceToSegment(bounds, start, goal) {
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
  const segmentX = goal.x - start.x;
  const segmentY = goal.y - start.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  const projection = segmentLengthSquared > EPSILON
    ? clamp(
      ((center.x - start.x) * segmentX + (center.y - start.y) * segmentY) /
        segmentLengthSquared,
      0,
      1,
    )
    : 0;
  const closestX = start.x + segmentX * projection;
  const closestY = start.y + segmentY * projection;
  return Math.hypot(center.x - closestX, center.y - closestY);
}

function sweepBounds(origin, movementX, movementY, bounds) {
  if (pointInsideBounds(origin, bounds)) {
    const exits = [
      { distance: origin.x - bounds.minX, normalX: -1, normalY: 0 },
      { distance: bounds.maxX - origin.x, normalX: 1, normalY: 0 },
      { distance: origin.y - bounds.minY, normalX: 0, normalY: -1 },
      { distance: bounds.maxY - origin.y, normalX: 0, normalY: 1 },
    ].sort((left, right) => left.distance - right.distance);
    return { time: 0, normalX: exits[0].normalX, normalY: exits[0].normalY };
  }

  let nearX = -Infinity;
  let farX = Infinity;
  if (Math.abs(movementX) <= EPSILON) {
    if (origin.x < bounds.minX || origin.x > bounds.maxX) return null;
  } else {
    const first = (bounds.minX - origin.x) / movementX;
    const second = (bounds.maxX - origin.x) / movementX;
    nearX = Math.min(first, second);
    farX = Math.max(first, second);
  }

  let nearY = -Infinity;
  let farY = Infinity;
  if (Math.abs(movementY) <= EPSILON) {
    if (origin.y < bounds.minY || origin.y > bounds.maxY) return null;
  } else {
    const first = (bounds.minY - origin.y) / movementY;
    const second = (bounds.maxY - origin.y) / movementY;
    nearY = Math.min(first, second);
    farY = Math.max(first, second);
  }

  const entryTime = Math.max(nearX, nearY);
  const exitTime = Math.min(farX, farY);
  if (entryTime > exitTime || entryTime < -EPSILON || entryTime > 1 || exitTime < 0) return null;
  if (nearX > nearY) {
    return { time: Math.max(0, entryTime), normalX: movementX > 0 ? -1 : 1, normalY: 0 };
  }
  return { time: Math.max(0, entryTime), normalX: 0, normalY: movementY > 0 ? -1 : 1 };
}

function nearestGridCenters(x, y, footprint) {
  const gridSize = SIMULATION_RULES.buildingGridSize;
  const offsetX = footprint.columns % 2 === 0 ? 0 : gridSize / 2;
  const offsetY = footprint.rows % 2 === 0 ? 0 : gridSize / 2;
  const gridX = (x - offsetX) / gridSize;
  const gridY = (y - offsetY) / gridSize;
  const columns = [...new Set([Math.floor(gridX), Math.ceil(gridX)])];
  const rows = [...new Set([Math.floor(gridY), Math.ceil(gridY)])];
  return columns
    .flatMap((column) =>
      rows.map((row) => ({
        x: column * gridSize + offsetX,
        y: row * gridSize + offsetY,
      })),
    )
    .sort((left, right) => {
      const leftDistance = Math.hypot(left.x - x, left.y - y);
      const rightDistance = Math.hypot(right.x - x, right.y - y);
      return leftDistance - rightDistance || left.y - right.y || left.x - right.x;
    });
}

function squareSpiralOffset(slot) {
  if (slot <= 0) return { x: 0, y: 0 };
  let ring = 1;
  let perimeterIndex = slot - 1;
  while (perimeterIndex >= ring * 8) {
    perimeterIndex -= ring * 8;
    ring += 1;
  }
  const sideLength = ring * 2;
  const side = Math.floor(perimeterIndex / sideLength);
  const offset = perimeterIndex % sideLength;
  if (side === 0) return { x: -ring + offset, y: -ring };
  if (side === 1) return { x: ring, y: -ring + offset };
  if (side === 2) return { x: ring - offset, y: ring };
  return { x: -ring, y: ring - offset };
}

function deterministicSide(firstId, secondId) {
  const value = `${firstId}:${secondId}`
    .split("")
    .reduce((total, character) => total + character.charCodeAt(0), 0);
  return value % 2 === 0 ? 1 : -1;
}

function deterministicPairAngle(firstId, secondId) {
  const value = `${firstId}:${secondId}`
    .split("")
    .reduce((total, character) => (total * 31 + character.charCodeAt(0)) % 360, 0);
  return value * (Math.PI / 180);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
