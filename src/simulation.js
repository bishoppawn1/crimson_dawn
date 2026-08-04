import {
  canWorkerTierBuildStructure,
  DRONE_DEFINITION,
  getNextStructureTierType,
  SIMULATION_RULES,
  STRUCTURE_DEFINITIONS,
  TERRAIN_OBSTACLES,
  UNIT_DEFINITIONS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  gridCoverageBounds,
  pointInGridCoverage,
  powerCoverageBounds,
  structureFootprint,
} from "./data.js";

const EPSILON = 0.0001;
const STORAGE_PRIORITY = Object.freeze({ battery: 0, power_tower: 1, generator: 2 });

export class Simulation {
  constructor({
    width = WORLD_WIDTH,
    height = WORLD_HEIGHT,
    terrain = [],
    matchRulesEnabled = false,
  } = {}) {
    this.width = width;
    this.height = height;
    this.time = 0;
    this.nextEntityNumber = 1;
    this.units = [];
    this.structures = [];
    this.wrecks = [];
    this.metalDeposits = [];
    this.terrain = terrain
      .filter((obstacle) => terrainIntersectsWorld(obstacle, width, height))
      .map((obstacle) => ({ ...obstacle, kind: "terrain" }));
    this.events = [];
    this.powerNetworks = [];
    this.powerLinks = [];
    this.aiThinkRemaining = SIMULATION_RULES.enemyInitialThinkDelay;
    this.aiBuildIndex = 0;
    this.lastPlacementError = null;
    this.lastProductionError = null;
    this.lastUpgradeError = null;
    this.matchRulesEnabled = matchRulesEnabled;
    this.matchResult = null;
    this.structureTechTier = { player: 1, enemy: 1 };
    this.resources = {
      player: { metal: 520, energy: 0, energyCapacity: 0 },
      enemy: { metal: 520, energy: 0, energyCapacity: 0 },
    };
  }

  static createFieldTest() {
    const simulation = new Simulation({ terrain: TERRAIN_OBSTACLES });

    const playerStartingDeposit = simulation.addMetalDeposit(760, 1440);
    const enemyStartingDeposit = simulation.addMetalDeposit(4440, 1440);
    const standardDeposits = [
      [900, 920], [920, 2280], [1320, 1440], [1360, 2600],
      [1800, 720], [1800, 1600], [1880, 2520], [2200, 1480],
      [3000, 1720], [3320, 680], [3400, 1600], [3320, 2520],
      [3880, 1440], [4200, 920], [4200, 2280],
    ];
    for (const [x, y] of standardDeposits) simulation.addMetalDeposit(x, y);
    for (const x of [2200, 2400, 2600, 2800, 3000]) {
      simulation.addMetalDeposit(x, 240, {
        remote: true,
        cluster: "Northern Frontier",
      });
      simulation.addMetalDeposit(x, 2960, {
        remote: true,
        cluster: "Southern Frontier",
      });
    }

    simulation.addStructure("generator", "player", 600, 1600);
    simulation.addStructure("mech_factory_t1", "player", 760, 1680);
    simulation.addStructure(
      "metal_mine",
      "player",
      playerStartingDeposit.x,
      playerStartingDeposit.y,
      { depositId: playerStartingDeposit.id },
    );
    simulation.addUnit("worker_drone_t1", "player", 680, 1640);
    simulation.addUnit("worker_drone_t1", "player", 680, 1720);
    simulation.addUnit("worker_drone_t1", "player", 760, 1800);

    simulation.addStructure("generator", "enemy", 4600, 1600);
    simulation.addStructure("mech_factory_t1", "enemy", 4440, 1680);
    simulation.addStructure(
      "metal_mine",
      "enemy",
      enemyStartingDeposit.x,
      enemyStartingDeposit.y,
      { depositId: enemyStartingDeposit.id },
    );
    simulation.addUnit("worker_drone_t1", "enemy", 4520, 1640);
    simulation.addUnit("worker_drone_t1", "enemy", 4520, 1720);
    simulation.addUnit("worker_drone_t1", "enemy", 4440, 1800);

    simulation.aiBuildIndex = 1;
    simulation.refreshPowerState(0);
    simulation.matchRulesEnabled = true;
    simulation.updateMatchResult();
    return simulation;
  }

  createId(prefix) {
    const id = `${prefix}-${this.nextEntityNumber}`;
    this.nextEntityNumber += 1;
    return id;
  }

  addMetalDeposit(x, y, { remote = false, cluster = null } = {}) {
    const deposit = {
      id: this.createId("deposit"),
      kind: "metal_deposit",
      x,
      y,
      remote,
      cluster,
    };
    this.metalDeposits.push(deposit);
    return deposit;
  }

  addUnit(type, team, x, y, overrides = {}) {
    const definition = UNIT_DEFINITIONS[type];
    if (!definition) throw new Error(`Unknown unit type: ${type}`);

    const unit = {
      id: this.createId("unit"),
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
      attackTargetId: null,
      attackTargetMode: null,
      buildTargetId: null,
      holdPosition: false,
      navigationObstacleId: null,
      navigationSide: null,
      energyTransferTargetIds: [],
      energyTransferredThisTick: 0,
      ...overrides,
    };
    unit.hp = clamp(unit.hp, 0, definition.maxHp);
    unit.energy = clamp(unit.energy, 0, definition.maxEnergy);
    if (unit.energy <= EPSILON) unit.state = "stasis";
    this.units.push(unit);
    return unit;
  }

  addStructure(type, team, x, y, overrides = {}) {
    const definition = STRUCTURE_DEFINITIONS[type];
    if (!definition) throw new Error(`Unknown structure type: ${type}`);

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
      supplyLevel: definition.supplyLevels ? 1 : null,
      supplyUpgrade: null,
      attackCooldownRemaining: 0,
      weaponEnergy: definition.capacitorCapacity ? definition.capacitorCapacity : null,
      defenseTargetId: null,
      defenseStatus: definition.capacitorCapacity ? "ready" : null,
      ...overrides,
    };

    if (definition.storageCapacity) {
      structure.storedEnergy = clamp(structure.storedEnergy, 0, definition.storageCapacity);
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
    if (structure.complete) this.recordStructureTierUnlock(structure);
    return structure;
  }

  createDrone(yard, slot) {
    const angle = (slot / STRUCTURE_DEFINITIONS[yard.type].droneCount) * Math.PI * 2;
    return {
      id: this.createId("drone"),
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
      replacementRemaining: 0,
    };
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
    return wreck;
  }

  getUnit(id) {
    return this.units.find((unit) => unit.id === id) || null;
  }

  getStructure(id) {
    return this.structures.find((structure) => structure.id === id) || null;
  }

  getWreck(id) {
    return this.wrecks.find((wreck) => wreck.id === id) || null;
  }

  getDrones() {
    return this.structures.flatMap((structure) => structure.drones || []);
  }

  getEntity(id) {
    return (
      this.getUnit(id) ||
      this.getStructure(id) ||
      this.getDrones().find((drone) => drone.id === id) ||
      this.getWreck(id)
    );
  }

  commandMove(unitIds, x, y, { force = false } = {}) {
    const requestedDestination = {
      x: clamp(x, 0, this.width),
      y: clamp(y, 0, this.height),
    };
    let accepted = 0;

    for (const id of unitIds) {
      const unit = this.getUnit(id);
      if (!unit || !unit.alive || unit.state !== "active") continue;
      const destination = this.findNearestPassablePoint(
        requestedDestination.x,
        requestedDestination.y,
        UNIT_DEFINITIONS[unit.type].radius,
      );
      unit.moveTarget = { ...destination };
      unit.moveMode = force ? "force" : "normal";
      unit.attackTargetId = null;
      unit.attackTargetMode = null;
      unit.buildTargetId = null;
      unit.holdPosition = false;
      unit.navigationObstacleId = null;
      unit.navigationSide = null;
      accepted += 1;
    }
    return accepted;
  }

  findNearestPassablePoint(x, y, radius = 0) {
    let point = {
      x: clamp(x, radius, this.width - radius),
      y: clamp(y, radius, this.height - radius),
    };
    for (const obstacle of this.terrain) {
      const bounds = terrainBounds(obstacle, radius);
      if (!pointInsideBounds(point, bounds)) continue;
      const exits = [
        { x: bounds.minX, y: point.y },
        { x: bounds.maxX, y: point.y },
        { x: point.x, y: bounds.minY },
        { x: point.x, y: bounds.maxY },
      ].sort((left, right) => distance(point, left) - distance(point, right));
      point = exits.find(
        (candidate) =>
          candidate.x >= radius &&
          candidate.x <= this.width - radius &&
          candidate.y >= radius &&
          candidate.y <= this.height - radius,
      ) || point;
    }
    return point;
  }

  commandAttack(unitIds, targetId) {
    const target = this.getEntity(targetId);
    if (!target || !target.alive || target.kind === "wreck") return 0;

    let accepted = 0;
    for (const id of unitIds) {
      const unit = this.getUnit(id);
      const definition = unit && UNIT_DEFINITIONS[unit.type];
      if (
        !unit ||
        !unit.alive ||
        unit.state !== "active" ||
        unit.team === target.team ||
        definition.attackRange <= 0
      ) {
        continue;
      }
      unit.attackTargetId = targetId;
      unit.attackTargetMode = "explicit";
      unit.moveTarget = null;
      unit.moveMode = null;
      unit.buildTargetId = null;
      unit.holdPosition = false;
      unit.navigationObstacleId = null;
      unit.navigationSide = null;
      accepted += 1;
    }
    return accepted;
  }

  commandStop(unitIds, holdPosition = false) {
    let accepted = 0;
    for (const id of unitIds) {
      const unit = this.getUnit(id);
      if (!unit || !unit.alive) continue;
      unit.moveTarget = null;
      unit.moveMode = null;
      unit.attackTargetId = null;
      unit.attackTargetMode = null;
      unit.buildTargetId = null;
      unit.holdPosition = holdPosition;
      unit.navigationObstacleId = null;
      unit.navigationSide = null;
      accepted += 1;
    }
    return accepted;
  }

  commandBuild(unitIds, structureId) {
    const structure = this.getStructure(structureId);
    if (!structure?.alive || structure.complete) return 0;

    let accepted = 0;
    for (const id of unitIds) {
      const worker = this.getUnit(id);
      if (
        !worker?.alive ||
        worker.state !== "active" ||
        worker.team !== structure.team ||
        !UNIT_DEFINITIONS[worker.type].workerTier
      ) {
        continue;
      }
      worker.buildTargetId = structure.id;
      worker.attackTargetId = null;
      worker.attackTargetMode = null;
      worker.moveTarget = null;
      worker.moveMode = null;
      worker.holdPosition = false;
      worker.navigationObstacleId = null;
      worker.navigationSide = null;
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
      if (unit.buildTargetId === structure.id) unit.buildTargetId = null;
    }
    this.emit("construction_cancelled", structure.x, structure.y, {
      structureId: structure.id,
      refund,
    });
    return { structureId: structure.id, refund };
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
    if (account.metal + EPSILON < unitDefinition.metalCost) {
      this.lastProductionError = "Not enough metal.";
      return false;
    }
    const supply = this.getSupplyState(factory.team);
    if (supply.remaining + EPSILON < unitDefinition.supplyCost) {
      this.lastProductionError = "Supply limit reached.";
      return false;
    }
    account.metal -= unitDefinition.metalCost;
    factory.productionQueue.push({ unitType, progress: 0 });
    return true;
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
    const capacity = SIMULATION_RULES.baseSupplyCapacity + structureCapacity;
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
      this.lastUpgradeError = "Not enough metal.";
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
      return { ...baseInfo, ...placement, valid: false, reason: "Not enough metal." };
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

  findStructureUpgradePlacement(structure, targetType) {
    const targetDefinition = STRUCTURE_DEFINITIONS[targetType];
    const targetFootprint = structureFootprint(targetType);
    const candidates = targetDefinition.metalRate
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
    const factory = this.getStructure(structureId);
    const definition = factory && STRUCTURE_DEFINITIONS[factory.type];
    if (!factory?.alive || !factory.complete || !definition?.production) return false;

    factory.rallyPoint = this.findNearestPassablePoint(x, y);
    factory.rallySequence = 0;
    this.emit("rally_set", factory.rallyPoint.x, factory.rallyPoint.y, {
      factoryId: factory.id,
    });
    return true;
  }

  startConstruction(workerIds, structureType, x, y) {
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
    if (!canWorkerTierBuildStructure(highestWorkerTier, structureType)) {
      this.lastPlacementError = `Requires a Tier ${definition.minimumWorkerTier || definition.buildTier} Worker Drone.`;
      return null;
    }
    const account = this.resources[team];
    if (account.metal + EPSILON < definition.metalCost) {
      this.lastPlacementError = "Not enough metal.";
      return null;
    }

    const placement = this.evaluatePlacement(structureType, x, y, team);
    if (!placement.valid) {
      this.lastPlacementError = placement.reason;
      return null;
    }

    account.metal -= definition.metalCost;
    const structure = this.addStructure(structureType, team, placement.x, placement.y, {
      hp: Math.max(1, definition.maxHp * 0.1),
      complete: false,
      powered: false,
      constructionProgress: 0,
      depositId: placement.depositId,
      weaponEnergy: definition.capacitorCapacity ? 0 : null,
    });
    this.clearFriendlyUnitsFromConstructionSite(structure);
    this.commandBuild(workers.map((worker) => worker.id), structure.id);
    return structure;
  }

  evaluatePlacement(structureType, x, y, team = null) {
    const definition = STRUCTURE_DEFINITIONS[structureType];
    if (!definition) {
      return { valid: false, x, y, depositId: null, reason: "Unknown building type." };
    }

    let depositId = null;
    if (definition.metalRate) {
      const deposit = this.findAvailableMetalDeposit(x, y);
      if (!deposit) {
        return {
          valid: false,
          x,
          y,
          depositId,
          reason: "Metal Mines must be placed on an unused metal deposit.",
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

  findNearestValidBuildSite(structureType, preferredX, preferredY, maxRings = 8, team = null) {
    const preferred = this.evaluatePlacement(structureType, preferredX, preferredY, team);
    if (preferred.valid) return preferred;
    if (STRUCTURE_DEFINITIONS[structureType]?.metalRate) {
      const deposits = [...this.metalDeposits].sort(
        (left, right) =>
          distance(left, { x: preferredX, y: preferredY }) -
          distance(right, { x: preferredX, y: preferredY }),
      );
      for (const deposit of deposits) {
        const candidate = this.evaluatePlacement(structureType, deposit.x, deposit.y, team);
        if (candidate.valid) return candidate;
      }
      return preferred;
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
          if (candidate.valid) return candidate;
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
          if (candidate.valid) return candidate;
        }
      }
    }
    return preferred;
  }

  findNearestValidPoweredBuildSite(structureType, team, preferredX, preferredY) {
    if (STRUCTURE_DEFINITIONS[structureType]?.generationRate) {
      return this.findNearestValidBuildSite(structureType, preferredX, preferredY, 8, team);
    }

    const preferred = this.evaluatePlacement(structureType, preferredX, preferredY, team);
    if (
      preferred.valid &&
      this.isBuildSiteConnectedToPower(structureType, team, preferred.x, preferred.y)
    ) {
      return preferred;
    }

    if (STRUCTURE_DEFINITIONS[structureType]?.metalRate) {
      const deposits = [...this.metalDeposits].sort(
        (left, right) =>
          distance(left, { x: preferredX, y: preferredY }) -
          distance(right, { x: preferredX, y: preferredY }),
      );
      for (const deposit of deposits) {
        const candidate = this.evaluatePlacement(structureType, deposit.x, deposit.y, team);
        if (
          candidate.valid &&
          this.isBuildSiteConnectedToPower(structureType, team, candidate.x, candidate.y)
        ) {
          return candidate;
        }
      }
      return { ...preferred, valid: false, reason: "No powered metal deposit is available." };
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
      reason: "No valid construction cell is connected to the energized grid.",
    };
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
            STRUCTURE_DEFINITIONS[structure.type].metalRate &&
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

    this.refreshPowerState(delta);
    this.updateEnemyAi(delta);
    this.assignAutomaticTargets();
    this.updateUnits(delta);
    this.updateConstruction(delta);
    this.updateSupplyUpgrades(delta);
    this.updateProduction(delta);
    this.updateStaticDefenses(delta);
    this.updateChargers(delta);
    this.updateEnergyCarriers(delta);
    this.updateDrones(delta);
    this.finalizePowerStorage(delta);
    this.syncStoredEnergy();
    this.events = this.events.filter((event) => this.time - event.time < 1.2);
    this.wrecks = this.wrecks.filter((wreck) => wreck.metal > EPSILON);
    this.updateMatchResult();
  }

  updateMatchResult() {
    if (!this.matchRulesEnabled || this.matchResult) return this.matchResult;

    const hasLivingAssets = (team) =>
      this.units.some((unit) => unit.alive && unit.team === team) ||
      this.structures.some((structure) => structure.alive && structure.team === team);
    const playerAlive = hasLivingAssets("player");
    const enemyAlive = hasLivingAssets("enemy");
    if (playerAlive && enemyAlive) return null;

    this.matchResult = playerAlive ? "victory" : "defeat";
    this.emit("match_complete", this.width / 2, this.height / 2, {
      result: this.matchResult,
      winner: this.matchResult === "victory" ? "player" : "enemy",
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
        this.resources[mine.team].metal += definition.metalRate * delta;
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
        return !definition.generationRate && structureFamily(structure) !== "battery";
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

  needsAdditionalGeneration(team, additionalStructureType) {
    if (!additionalStructureType || STRUCTURE_DEFINITIONS[additionalStructureType]?.generationRate) return false;
    return (
      this.getPlannedPowerDemandRate(team, additionalStructureType) >
      this.getGenerationRate(team) + EPSILON
    );
  }

  getEnergyDemandRate(team) {
    return this.structures
      .filter(
        (structure) =>
          structure.alive &&
          structure.complete &&
          structure.team === team &&
          structure.powered &&
          !STRUCTURE_DEFINITIONS[structure.type].generationRate,
      )
      .reduce((total, structure) => total + this.getStructurePowerDemandRate(structure), 0);
  }

  getNetEnergyRate(team) {
    return this.getGenerationRate(team) - this.getEnergyDemandRate(team);
  }

  assignAutomaticTargets() {
    for (const unit of this.units) {
      const definition = UNIT_DEFINITIONS[unit.type];
      if (!unit.alive || unit.state !== "active" || definition.attackRange <= 0) continue;
      if (unit.moveTarget && unit.moveMode === "force") {
        unit.attackTargetId = null;
        unit.attackTargetMode = null;
        continue;
      }
      const existingTarget = this.getEntity(unit.attackTargetId);
      if (
        existingTarget?.alive &&
        existingTarget.team !== unit.team &&
        (
          unit.attackTargetMode === "explicit" ||
          unit.attackTargetMode === "retaliation" ||
          distance(unit, existingTarget) <= definition.attackRange + entityRadius(existingTarget)
        )
      ) {
        continue;
      }
      unit.attackTargetId = null;
      unit.attackTargetMode = null;
      const potentialTargets = [
        ...this.units.filter((entity) => entity.alive && entity.team !== unit.team),
        ...this.getDrones().filter((entity) => entity.alive && entity.team !== unit.team),
        ...this.structures.filter((entity) => entity.alive && entity.team !== unit.team),
      ].filter((target) => distance(unit, target) <= definition.attackRange + entityRadius(target));
      const target = nearest(unit, potentialTargets);
      unit.attackTargetId = target?.id || null;
      unit.attackTargetMode = target ? "automatic" : null;
    }
  }

  updateEnemyAi(delta) {
    this.aiThinkRemaining -= delta;
    if (this.aiThinkRemaining > 0) return;
    this.aiThinkRemaining = SIMULATION_RULES.enemyThinkInterval;

    const enemyFactories = this.structures.filter(
      (structure) => structure.alive && structure.complete && structure.team === "enemy" && structure.type.startsWith("mech_factory"),
    );
    const enemyWorkers = this.units.filter(
      (unit) => unit.alive && unit.team === "enemy" && UNIT_DEFINITIONS[unit.type].workerTier,
    );
    this.reassignEnemyConstruction(enemyWorkers);

    const enemyAnchor = this.structures.find(
      (structure) =>
        structure.alive &&
        structure.complete &&
        structure.team === "enemy" &&
        STRUCTURE_DEFINITIONS[structure.type].generationRate,
    );
    const baseX = enemyAnchor?.x ?? this.width - 600;
    const baseY = enemyAnchor?.y ?? this.height / 2;
    const buildPlans = [
      { type: "metal_mine", x: baseX - 160, y: baseY - 160 },
      { type: "battery", x: baseX - 120, y: baseY },
      { type: "sentry_turret", x: baseX - 60, y: baseY + 180 },
      { type: "charger", x: baseX + 20, y: baseY + 180 },
      { type: "power_tower", x: baseX - 360, y: baseY + 40 },
      { type: "power_tower", x: baseX - 500, y: baseY - 200 },
      { type: "metal_mine", x: baseX - 400, y: baseY - 680 },
      { type: "sentry_turret", x: baseX - 520, y: baseY + 160 },
      { type: "salvage_yard", x: baseX - 280, y: baseY + 360 },
      { type: "mech_factory_t1", x: baseX - 440, y: baseY + 360 },
      { type: "supply_complex", x: baseX - 760, y: baseY + 600 },
    ];
    const plan = buildPlans[this.aiBuildIndex];
    const availableWorker = enemyWorkers.find((worker) => !worker.buildTargetId && worker.state === "active");
    const pendingGenerator = this.structures.find(
      (structure) =>
        structure.alive &&
        !structure.complete &&
        structure.team === "enemy" &&
        Boolean(STRUCTURE_DEFINITIONS[structure.type].generationRate),
    );
    const needsGeneration = plan && this.needsAdditionalGeneration("enemy", plan.type);
    let constructionRequest = null;
    if (plan && (!needsGeneration || !pendingGenerator)) {
      if (needsGeneration) {
        const direction = plan.x >= this.width / 2 ? 1 : -1;
        const offset = STRUCTURE_DEFINITIONS.generator.powerRadius * 0.65;
        constructionRequest = {
          type: "generator",
          x: plan.x + direction * offset,
          y: plan.y,
          advancesPlan: false,
        };
      } else {
        constructionRequest = { ...plan, advancesPlan: true };
      }
    }
    if (
      constructionRequest &&
      availableWorker &&
      this.resources.enemy.metal >= STRUCTURE_DEFINITIONS[constructionRequest.type].metalCost
    ) {
      const site = STRUCTURE_DEFINITIONS[constructionRequest.type].generationRate
        ? this.findNearestValidBuildSite(
          constructionRequest.type,
          constructionRequest.x,
          constructionRequest.y,
          8,
          "enemy",
        )
        : this.findNearestValidPoweredBuildSite(
          constructionRequest.type,
          "enemy",
          constructionRequest.x,
          constructionRequest.y,
        );
      const construction = site.valid
        ? this.startConstruction(
          [availableWorker.id],
          constructionRequest.type,
          site.x,
          site.y,
        )
        : null;
      if (construction && constructionRequest.advancesPlan) this.aiBuildIndex += 1;
    }

    const reservedPlan = buildPlans[this.aiBuildIndex];
    const reservedPlanMetal = reservedPlan
      ? STRUCTURE_DEFINITIONS[reservedPlan.type].metalCost
      : 0;
    const needsReservedGenerator =
      reservedPlan &&
      !this.structures.some(
        (structure) =>
          structure.alive &&
          !structure.complete &&
          structure.team === "enemy" &&
          Boolean(STRUCTURE_DEFINITIONS[structure.type].generationRate),
      ) &&
      this.needsAdditionalGeneration("enemy", reservedPlan.type);
    const reservedMetal = reservedPlanMetal + (
      needsReservedGenerator ? STRUCTURE_DEFINITIONS.generator.metalCost : 0
    );
    if (!reservedPlan) {
      const supplyComplex = this.structures.find((structure) => {
        const definition = STRUCTURE_DEFINITIONS[structure.type];
        return (
          structure.alive &&
          structure.complete &&
          structure.team === "enemy" &&
          definition.supplyLevels &&
          !structure.supplyUpgrade &&
          structure.supplyLevel < definition.supplyLevels.length
        );
      });
      if (supplyComplex) this.queueSupplyUpgrade(supplyComplex.id);
    }
    const stagedCombatCount = this.units.filter((unit) => {
      const definition = UNIT_DEFINITIONS[unit.type];
      return (
        unit.alive &&
        unit.team === "enemy" &&
        definition.attackRange > 0 &&
        unit.attackTargetMode !== "explicit"
      );
    }).length;
    const queuedCombatCount = enemyFactories.reduce(
      (total, factory) =>
        total + factory.productionQueue.filter(
          (order) => UNIT_DEFINITIONS[order.unitType].attackRange > 0,
        ).length,
      0,
    );
    const needsCombatForce =
      stagedCombatCount + queuedCombatCount < SIMULATION_RULES.enemyAttackWaveSize;
    for (const factory of enemyFactories) {
      if (factory.productionQueue.length >= 2) continue;
      const factoryDefinition = STRUCTURE_DEFINITIONS[factory.type];
      const workerType = factoryDefinition.production.find(
        (unitType) => UNIT_DEFINITIONS[unitType].workerTier,
      );
      const combatType = factoryDefinition.production.find(
        (unitType) => UNIT_DEFINITIONS[unitType].attackRange > 0,
      );
      const replacingWorker = enemyWorkers.length < 3;
      const choice = replacingWorker ? workerType : combatType;
      if (!choice) continue;
      const productionCost = UNIT_DEFINITIONS[choice].metalCost;
      const requiredReserve = replacingWorker || needsCombatForce ? 0 : reservedMetal;
      if (this.resources.enemy.metal + EPSILON < productionCost + requiredReserve) continue;
      this.queueProduction(factory.id, choice);
    }

    const playerTargets = [
      ...this.units.filter((entity) => entity.alive && entity.team === "player"),
      ...this.structures.filter((entity) => entity.alive && entity.team === "player"),
    ];
    const stagedUnits = this.units.filter((unit) => {
      const definition = UNIT_DEFINITIONS[unit.type];
      const target = this.getEntity(unit.attackTargetId);
      return (
        unit.alive &&
        unit.state === "active" &&
        unit.team === "enemy" &&
        definition.attackRange > 0 &&
        !target?.alive &&
        !unit.moveTarget
      );
    });
    const rushTargets = playerTargets.filter((target) =>
      this.structures.some(
        (structure) =>
          structure.alive &&
          structure.team === "enemy" &&
          distance(structure, target) <= SIMULATION_RULES.enemyRushResponseRadius,
      ),
    );
    const requiredAttackers = rushTargets.length > 0 ? 1 : SIMULATION_RULES.enemyAttackWaveSize;
    if (
      stagedUnits.length >= requiredAttackers &&
      playerTargets.length > 0
    ) {
      const wave = stagedUnits.slice(
        0,
        rushTargets.length > 0 ? stagedUnits.length : SIMULATION_RULES.enemyAttackWaveSize,
      );
      const waveCenter = {
        x: wave.reduce((total, unit) => total + unit.x, 0) / wave.length,
        y: wave.reduce((total, unit) => total + unit.y, 0) / wave.length,
      };
      const closest = nearest(waveCenter, rushTargets.length > 0 ? rushTargets : playerTargets);
      if (closest) {
        this.commandAttack(wave.map((unit) => unit.id), closest.id);
        this.emit("enemy_wave", waveCenter.x, waveCenter.y, {
          unitIds: wave.map((unit) => unit.id),
          targetId: closest.id,
        });
      }
    }
  }

  reassignEnemyConstruction(enemyWorkers) {
    const projects = this.structures.filter(
      (structure) => structure.alive && !structure.complete && structure.team === "enemy",
    );
    const assignedProjectIds = new Set();
    for (const worker of enemyWorkers) {
      const project = this.getStructure(worker.buildTargetId);
      if (project?.alive && !project.complete && project.team === worker.team) {
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
      const worker = nearest(project, availableWorkers);
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
        worker.buildTargetId = null;
        continue;
      }

      const buildDistance = 24;
      if (distanceToStructureFootprint(worker, structure) > buildDistance + EPSILON) {
        this.moveUnitToward(worker, structure, delta);
        continue;
      }

      const definition = STRUCTURE_DEFINITIONS[structure.type];
      structure.constructionProgress = Math.min(
        definition.buildTime,
        structure.constructionProgress + workerDefinition.buildRate * delta,
      );
      structure.hp = Math.max(
        structure.hp,
        definition.maxHp * (structure.constructionProgress / definition.buildTime),
      );
      if (structure.constructionProgress + EPSILON >= definition.buildTime) {
        structure.complete = true;
        structure.hp = definition.maxHp;
        this.recordStructureTierUnlock(structure);
        worker.buildTargetId = null;
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
    for (const factory of this.structures) {
      const definition = STRUCTURE_DEFINITIONS[factory.type];
      if (!factory.alive || !factory.complete || !factory.powered || !definition.production || factory.productionQueue.length === 0) {
        continue;
      }
      const order = factory.productionQueue[0];
      const unitDefinition = UNIT_DEFINITIONS[order.unitType];
      order.progress += delta;
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
    for (let attempts = 0; attempts < 4096; attempts += 1) {
      const offset = squareSpiralOffset(slot);
      slot += 1;
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
      const blockedByStructure = this.structures.some((structure) => {
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

  isUnitPositionClear(point, unitType) {
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

    const clearOfTerrain = this.terrain.every(
      (obstacle) => !pointInsideBounds(point, terrainBounds(obstacle, definition.radius)),
    );
    if (!clearOfTerrain) return false;

    const clearOfStructures = this.structures.every((structure) => {
      if (!structure.alive) return true;
      const clearance =
        definition.radius +
        STRUCTURE_DEFINITIONS[structure.type].radius +
        SIMULATION_RULES.structureCollisionPadding;
      return distance(point, structure) + EPSILON >= clearance;
    });
    if (!clearOfStructures) return false;

    return this.units.every((unit) => {
      if (!unit.alive) return true;
      const clearance =
        definition.radius +
        UNIT_DEFINITIONS[unit.type].radius +
        SIMULATION_RULES.unitCollisionPadding;
      return distance(point, unit) + EPSILON >= clearance;
    });
  }

  updateStaticDefenses(delta) {
    for (const defense of this.structures) {
      const definition = STRUCTURE_DEFINITIONS[defense.type];
      if (!defense.alive || !defense.complete || !definition.capacitorCapacity) continue;
      defense.attackCooldownRemaining = Math.max(0, defense.attackCooldownRemaining - delta);
      defense.defenseTargetId = null;
      if (!defense.powered) {
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

      const targets = [
        ...this.units.filter((entity) => entity.alive && entity.team !== defense.team),
        ...this.getDrones().filter((entity) => entity.alive && entity.team !== defense.team),
        ...this.structures.filter((entity) => entity.alive && entity.team !== defense.team),
      ].filter((target) => distance(defense, target) <= definition.attackRange + entityRadius(target));
      const target = nearest(defense, targets);
      if (!target) {
        defense.defenseStatus = defense.weaponEnergy + EPSILON >= definition.attackEnergy ? "ready" : "charging";
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
      this.applyDamage(target, definition.attackDamage, defense);
      this.emit("attack", target.x, target.y, { sourceId: defense.id, targetId: target.id });
    }
  }

  updateUnits(delta) {
    for (const unit of this.units) {
      if (!unit.alive) continue;
      const definition = UNIT_DEFINITIONS[unit.type];
      this.resolveUnitStructureOverlap(unit);
      unit.attackCooldownRemaining = Math.max(0, unit.attackCooldownRemaining - delta);

      if (unit.state === "stasis") {
        unit.energy = Math.min(
          definition.maxEnergy,
          unit.energy + SIMULATION_RULES.stasisRegenerationRate * delta,
        );
        if (unit.energy + EPSILON >= SIMULATION_RULES.reactivationThreshold) {
          unit.state = "active";
          this.emit("reactivated", unit.x, unit.y, { unitId: unit.id });
        }
        continue;
      }

      const emergencyEnergyThreshold = Math.min(
        definition.maxEnergy * SIMULATION_RULES.lowEnergyRatio,
        SIMULATION_RULES.lowEnergyRegenerationThreshold,
      );
      if (unit.energy + EPSILON < emergencyEnergyThreshold) {
        unit.energy = Math.min(
          emergencyEnergyThreshold,
          unit.energy + SIMULATION_RULES.lowEnergyRegenerationRate * delta,
        );
      }

      const buildTarget = this.getStructure(unit.buildTargetId);
      if (buildTarget?.alive && !buildTarget.complete) continue;
      if (unit.buildTargetId) unit.buildTargetId = null;

      const attackTarget = this.getEntity(unit.attackTargetId);
      if (unit.attackTargetId && (!attackTarget || !attackTarget.alive || attackTarget.team === unit.team)) {
        unit.attackTargetId = null;
        unit.attackTargetMode = null;
      }

      if (unit.moveTarget) {
        if (
          unit.moveMode === "normal" &&
          attackTarget?.alive &&
          attackTarget.team !== unit.team &&
          distance(unit, attackTarget) <= definition.attackRange + entityRadius(attackTarget)
        ) {
          this.tryAttack(unit, attackTarget, definition);
        }
        if (unit.state === "active" && unit.moveTarget) {
          this.moveUnitToward(unit, unit.moveTarget, delta, 4);
        }
      } else if (attackTarget?.alive && attackTarget.team !== unit.team) {
        const separation = distance(unit, attackTarget);
        const targetRadius = entityRadius(attackTarget);
        if (separation <= definition.attackRange + targetRadius) {
          this.tryAttack(unit, attackTarget, definition);
        } else if (
          unit.attackTargetMode === "explicit" ||
          unit.attackTargetMode === "retaliation"
        ) {
          this.moveUnitToward(unit, attackTarget, delta, definition.attackRange + targetRadius * 0.75);
        } else {
          unit.attackTargetId = null;
          unit.attackTargetMode = null;
        }
      }
    }
    this.resolveUnitOverlaps();
    for (const unit of this.units) {
      if (unit.alive) this.resolveUnitTerrainOverlap(unit);
    }
  }

  resolveUnitOverlaps() {
    const aliveUnits = this.units.filter((unit) => unit.alive);
    if (aliveUnits.length < 2) return;

    const cellSize = 40;
    const solverPasses = Math.min(
      40,
      8 + Math.ceil(Math.log2(aliveUnits.length)) * 4,
    );
    for (let pass = 0; pass < solverPasses; pass += 1) {
      const cells = new Map();
      for (const unit of aliveUnits) {
        const cellX = Math.floor(unit.x / cellSize);
        const cellY = Math.floor(unit.y / cellSize);
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const nearby = cells.get(`${cellX + offsetX},${cellY + offsetY}`);
            if (!nearby) continue;
            for (const other of nearby) this.separateUnitPair(unit, other);
          }
        }

        const key = `${cellX},${cellY}`;
        const occupants = cells.get(key);
        if (occupants) occupants.push(unit);
        else cells.set(key, [unit]);
      }

      for (const unit of aliveUnits) this.resolveUnitStructureOverlap(unit);
    }
  }

  separateUnitPair(first, second) {
    const minimumDistance =
      UNIT_DEFINITIONS[first.type].radius +
      UNIT_DEFINITIONS[second.type].radius +
      SIMULATION_RULES.unitCollisionPadding;
    const deltaX = second.x - first.x;
    const deltaY = second.y - first.y;
    const separation = Math.hypot(deltaX, deltaY);
    if (separation + EPSILON >= minimumDistance) return;

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
    const firstRadius = UNIT_DEFINITIONS[first.type].radius;
    const secondRadius = UNIT_DEFINITIONS[second.type].radius;
    first.x = clamp(first.x - normalX * overlap * firstShare, firstRadius, this.width - firstRadius);
    first.y = clamp(first.y - normalY * overlap * firstShare, firstRadius, this.height - firstRadius);
    second.x = clamp(second.x + normalX * overlap * secondShare, secondRadius, this.width - secondRadius);
    second.y = clamp(second.y + normalY * overlap * secondShare, secondRadius, this.height - secondRadius);
  }

  tryAttack(unit, target, definition) {
    if (definition.attackDamage <= 0 || unit.attackCooldownRemaining > EPSILON) return false;
    if (unit.energy + EPSILON < definition.attackEnergy) return false;

    unit.energy = Math.max(0, unit.energy - definition.attackEnergy);
    const overdrive = unit.abilityActiveUntil.overdrive > this.time;
    const cooldownMultiplier = overdrive
      ? definition.abilities.overdrive.cooldownMultiplier
      : 1;
    unit.attackCooldownRemaining = definition.attackCooldown * cooldownMultiplier;
    this.applyDamage(target, definition.attackDamage, unit);
    this.emit("attack", target.x, target.y, { sourceId: unit.id, targetId: target.id });
    if (unit.energy <= EPSILON) this.enterStasis(unit);
    return true;
  }

  moveUnitToward(unit, target, delta, stopDistance = 0) {
    const definition = UNIT_DEFINITIONS[unit.type];
    const dx = target.x - unit.x;
    const dy = target.y - unit.y;
    const separation = Math.hypot(dx, dy);
    if (separation <= stopDistance + EPSILON) {
      if (unit.moveTarget) {
        unit.moveTarget = null;
        unit.moveMode = null;
      }
      return 0;
    }

    const overdrive = unit.abilityActiveUntil.overdrive > this.time;
    const speedMultiplier = overdrive
      ? definition.abilities.overdrive.speedMultiplier
      : 1;
    const desiredDistance = Math.min(definition.speed * speedMultiplier * delta, separation - stopDistance);
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

    if (unit.moveTarget && distance(unit, target) <= stopDistance + EPSILON) {
      unit.moveTarget = null;
      unit.moveMode = null;
    }
    if (unit.energy <= EPSILON) this.enterStasis(unit);
    return traveled;
  }

  moveUnitWithStructureCollisions(unit, movementX, movementY) {
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
    const padding =
      UNIT_DEFINITIONS[unit.type].radius + SIMULATION_RULES.structureCollisionPadding;
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
    unit.moveTarget = null;
    unit.moveMode = null;
    unit.attackTargetId = null;
    unit.attackTargetMode = null;
    unit.navigationObstacleId = null;
    unit.navigationSide = null;
    this.emit("stasis", unit.x, unit.y, { unitId: unit.id });
  }

  updateChargers(delta) {
    for (const charger of this.structures) {
      const definition = STRUCTURE_DEFINITIONS[charger.type];
      if (!charger.alive || !definition.chargeRadius || !charger.powered) continue;
      const recipients = this.units
        .filter(
          (unit) =>
            unit.alive &&
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
    const carriers = this.units.filter(
      (unit) => unit.alive && unit.state === "active" && UNIT_DEFINITIONS[unit.type].transferRate,
    );

    for (const carrier of carriers) {
      const definition = UNIT_DEFINITIONS[carrier.type];
      carrier.energyTransferTargetIds = [];
      carrier.energyTransferredThisTick = 0;
      const availableEnergy = Math.max(0, carrier.energy - definition.protectedReserve);
      let remainingBudget = Math.min(definition.transferRate * delta, availableEnergy);
      if (remainingBudget <= EPSILON) continue;

      const recipients = this.units
        .filter((unit) => {
          if (!unit.alive || unit.id === carrier.id || unit.team !== carrier.team) return false;
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
          continue;
        }

        if (!yard.powered) {
          drone.targetWreckId = null;
          if (distance(drone, yard) > 22) {
            drone.mode = "returning";
            this.moveDroneToward(drone, yard, delta, 20);
          } else {
            drone.mode = "idle";
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
      if (arrived) drone.mode = "collecting";
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
      } else if (!wreck || wreck.metal <= EPSILON) {
        const nextWreck = this.findDroneTarget(drone);
        drone.targetWreckId = nextWreck?.id || null;
        drone.mode = nextWreck ? "to_wreck" : drone.carry > EPSILON ? "returning" : "idle";
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
      }
    }
  }

  findDroneTarget(drone) {
    const candidates = this.wrecks.filter((wreck) => wreck.metal > EPSILON);
    return nearest(drone, candidates);
  }

  moveDroneToward(drone, target, delta, stopDistance = 0) {
    const dx = target.x - drone.x;
    const dy = target.y - drone.y;
    const separation = Math.hypot(dx, dy);
    if (separation <= stopDistance + EPSILON) return true;
    const requestedDistance = Math.min(
      DRONE_DEFINITION.speed * delta,
      separation - stopDistance,
    );
    this.moveDroneWithTerrainCollisions(
      drone,
      (dx / separation) * requestedDistance,
      (dy / separation) * requestedDistance,
    );
    return distance(drone, target) <= stopDistance + EPSILON;
  }

  moveDroneWithTerrainCollisions(drone, movementX, movementY) {
    let remainingX = movementX;
    let remainingY = movementY;
    for (let pass = 0; pass < 3; pass += 1) {
      if (Math.hypot(remainingX, remainingY) <= EPSILON) break;
      let first = null;
      for (const obstacle of this.terrain) {
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

  applyDamage(target, amount, source = null) {
    if (!target?.alive || amount <= 0) return;
    target.hp = Math.max(0, target.hp - amount);
    if (target.hp > EPSILON) {
      this.assignRetaliationTarget(target, source);
      return;
    }

    if (target.kind === "drone") {
      this.destroyDrone(target);
      return;
    }

    target.alive = false;
    if (target.kind === "unit") {
      target.state = "destroyed";
      target.moveTarget = null;
      target.moveMode = null;
      target.attackTargetId = null;
      target.attackTargetMode = null;
      target.buildTargetId = null;
      target.navigationObstacleId = null;
      target.navigationSide = null;
      const salvageMetal = Math.round(UNIT_DEFINITIONS[target.type].metalValue * 0.55);
      this.addWreck(target.x, target.y, salvageMetal, target.team);
    }
    if (target.kind === "structure") target.powered = false;
    this.emit("destroyed", target.x, target.y, { targetId: target.id });
  }

  assignRetaliationTarget(target, aggressor) {
    if (
      target.kind !== "unit" ||
      target.state !== "active" ||
      !aggressor?.alive ||
      !aggressor.id ||
      aggressor.team === target.team ||
      UNIT_DEFINITIONS[target.type].attackRange <= 0 ||
      target.moveMode === "force"
    ) {
      return false;
    }

    const explicitTarget = this.getEntity(target.attackTargetId);
    if (target.attackTargetMode === "explicit" && explicitTarget?.alive) return false;

    target.attackTargetId = aggressor.id;
    target.attackTargetMode = "retaliation";
    target.moveTarget = null;
    target.moveMode = null;
    target.buildTargetId = null;
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
    drone.hp = 0;
    drone.carry = 0;
    drone.mode = "rebuilding";
    drone.targetWreckId = null;
    drone.navigationObstacleId = null;
    drone.navigationSide = null;
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
    drone.hp = DRONE_DEFINITION.maxHp;
    drone.x = yard.x + Math.cos(angle) * 28;
    drone.y = yard.y + Math.sin(angle) * 28;
    drone.mode = "idle";
    drone.carry = 0;
    drone.targetWreckId = null;
    drone.navigationObstacleId = null;
    drone.navigationSide = null;
    drone.replacementRemaining = 0;
    this.emit("drone_replaced", drone.x, drone.y, { droneId: drone.id });
  }

  emit(type, x, y, detail = {}) {
    this.events.push({ type, x, y, time: this.time, ...detail });
  }
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function energyRatio(unit) {
  return unit.energy / UNIT_DEFINITIONS[unit.type].maxEnergy;
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

function entityRadius(entity) {
  if (entity.kind === "unit") return UNIT_DEFINITIONS[entity.type].radius;
  if (entity.kind === "structure") return STRUCTURE_DEFINITIONS[entity.type].radius;
  if (entity.kind === "drone") return DRONE_DEFINITION.radius;
  return 0;
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
