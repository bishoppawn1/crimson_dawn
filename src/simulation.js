import {
  DRONE_DEFINITION,
  SIMULATION_RULES,
  STRUCTURE_DEFINITIONS,
  UNIT_DEFINITIONS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  structureFootprint,
} from "./data.js";

const EPSILON = 0.0001;

export class Simulation {
  constructor({ width = WORLD_WIDTH, height = WORLD_HEIGHT } = {}) {
    this.width = width;
    this.height = height;
    this.time = 0;
    this.nextEntityNumber = 1;
    this.units = [];
    this.structures = [];
    this.wrecks = [];
    this.metalDeposits = [];
    this.events = [];
    this.powerNetworks = [];
    this.powerLinks = [];
    this.aiThinkRemaining = 5;
    this.aiBuildIndex = 0;
    this.lastPlacementError = null;
    this.resources = {
      player: { metal: 520, energy: 0, energyCapacity: 0 },
      enemy: { metal: 520, energy: 0, energyCapacity: 0 },
    };
  }

  static createFieldTest() {
    const simulation = new Simulation();

    simulation.addMetalDeposit(250, 220);
    simulation.addMetalDeposit(510, 760);
    simulation.addMetalDeposit(730, 250);
    simulation.addMetalDeposit(870, 650);
    simulation.addMetalDeposit(1090, 760);
    simulation.addMetalDeposit(1350, 220);

    simulation.addStructure("generator", "player", 160, 400);
    simulation.addStructure("mech_factory_t1", "player", 300, 520);
    simulation.addUnit("worker_drone_t1", "player", 220, 500);
    simulation.addUnit("worker_drone_t1", "player", 220, 560);
    simulation.addUnit("worker_drone_t1", "player", 300, 590);

    simulation.addStructure("generator", "enemy", 1440, 400);
    simulation.addStructure("mech_factory_t1", "enemy", 1300, 520);
    simulation.addUnit("worker_drone_t1", "enemy", 1380, 500);
    simulation.addUnit("worker_drone_t1", "enemy", 1380, 560);
    simulation.addUnit("worker_drone_t1", "enemy", 1300, 590);

    simulation.refreshPowerState(0);
    return simulation;
  }

  createId(prefix) {
    const id = `${prefix}-${this.nextEntityNumber}`;
    this.nextEntityNumber += 1;
    return id;
  }

  addMetalDeposit(x, y) {
    const deposit = {
      id: this.createId("deposit"),
      kind: "metal_deposit",
      x,
      y,
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
      powered: type === "generator",
      connected: type === "generator",
      powerStatus: type === "generator" ? "generating" : "disconnected",
      gridId: null,
      storedEnergy: type === "battery" ? 0 : null,
      energyGenerated: type === "generator" ? 0 : null,
      depositId: null,
      powerFlow: 0,
      drones: [],
      constructionProgress: definition.buildTime || 0,
      complete: true,
      productionQueue: [],
      rallyPoint: null,
      attackCooldownRemaining: 0,
      weaponEnergy: type === "sentry_turret" ? definition.capacitorCapacity : null,
      defenseTargetId: null,
      defenseStatus: type === "sentry_turret" ? "ready" : null,
      ...overrides,
    };

    if (type === "battery") {
      structure.storedEnergy = clamp(structure.storedEnergy, 0, definition.storageCapacity);
    }

    if (type === "salvage_yard" && structure.complete) {
      for (let slot = 0; slot < definition.droneCount; slot += 1) {
        structure.drones.push(this.createDrone(structure, slot));
      }
    }

    this.structures.push(structure);
    return structure;
  }

  createDrone(yard, slot) {
    const angle = (slot / 3) * Math.PI * 2;
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
    const destination = {
      x: clamp(x, 0, this.width),
      y: clamp(y, 0, this.height),
    };
    let accepted = 0;

    for (const id of unitIds) {
      const unit = this.getUnit(id);
      if (!unit || !unit.alive || unit.state !== "active") continue;
      unit.moveTarget = { ...destination };
      unit.moveMode = force ? "force" : "normal";
      unit.attackTargetId = null;
      unit.attackTargetMode = null;
      unit.buildTargetId = null;
      unit.holdPosition = false;
      accepted += 1;
    }
    return accepted;
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
      return false;
    }
    const account = this.resources[factory.team];
    if (account.metal + EPSILON < unitDefinition.metalCost) return false;
    account.metal -= unitDefinition.metalCost;
    factory.productionQueue.push({ unitType, progress: 0 });
    return true;
  }

  commandRally(structureId, x, y) {
    const factory = this.getStructure(structureId);
    const definition = factory && STRUCTURE_DEFINITIONS[factory.type];
    if (!factory?.alive || !factory.complete || !definition?.production) return false;

    factory.rallyPoint = {
      x: clamp(x, 0, this.width),
      y: clamp(y, 0, this.height),
    };
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
    const account = this.resources[team];
    if (account.metal + EPSILON < definition.metalCost) {
      this.lastPlacementError = "Not enough metal.";
      return null;
    }

    const placement = this.evaluatePlacement(structureType, x, y);
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
      weaponEnergy: structureType === "sentry_turret" ? 0 : null,
    });
    this.commandBuild(workers.map((worker) => worker.id), structure.id);
    return structure;
  }

  evaluatePlacement(structureType, x, y) {
    const definition = STRUCTURE_DEFINITIONS[structureType];
    if (!definition) {
      return { valid: false, x, y, depositId: null, reason: "Unknown building type." };
    }

    let depositId = null;
    if (structureType === "metal_mine") {
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

    const overlappingStructure = this.structures.some((structure) => {
      if (!structure.alive) return false;
      const otherFootprint = structureFootprint(structure.type);
      const padding = SIMULATION_RULES.structureCollisionPadding;
      return (
        Math.abs(x - structure.x) + EPSILON < footprint.halfWidth + otherFootprint.halfWidth + padding &&
        Math.abs(y - structure.y) + EPSILON < footprint.halfHeight + otherFootprint.halfHeight + padding
      );
    });
    if (overlappingStructure) {
      result.reason = "Buildings cannot overlap another structure or foundation.";
      return result;
    }

    const occupyingEntity = [...this.units, ...this.getDrones()].some((entity) => {
      if (!entity.alive) return false;
      const deltaX = Math.max(Math.abs(entity.x - x) - footprint.halfWidth, 0);
      const deltaY = Math.max(Math.abs(entity.y - y) - footprint.halfHeight, 0);
      return (
        Math.hypot(deltaX, deltaY) + EPSILON <
        entityRadius(entity) + SIMULATION_RULES.structureCollisionPadding
      );
    });
    if (occupyingEntity) {
      result.reason = "A unit is occupying this construction site.";
      return result;
    }

    result.valid = true;
    return result;
  }

  findNearestValidBuildSite(structureType, preferredX, preferredY, maxRings = 8) {
    const preferred = this.evaluatePlacement(structureType, preferredX, preferredY);
    if (preferred.valid) return preferred;
    if (structureType === "metal_mine") {
      const deposits = [...this.metalDeposits].sort(
        (left, right) =>
          distance(left, { x: preferredX, y: preferredY }) -
          distance(right, { x: preferredX, y: preferredY }),
      );
      for (const deposit of deposits) {
        const candidate = this.evaluatePlacement(structureType, deposit.x, deposit.y);
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
          );
          if (candidate.valid) return candidate;
        }
      }
    }
    return preferred;
  }

  findAvailableMetalDeposit(x, y, snapDistance = 75) {
    const occupiedDepositIds = new Set(
      this.structures
        .filter((structure) => structure.alive && structure.type === "metal_mine" && structure.depositId)
        .map((structure) => structure.depositId),
    );
    const candidates = this.metalDeposits.filter(
      (deposit) => !occupiedDepositIds.has(deposit.id) && distance(deposit, { x, y }) <= snapDistance,
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
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const delta = Math.min(deltaSeconds, 0.25);
    this.time += delta;

    this.refreshPowerState(delta);
    this.updateEnemyAi(delta);
    this.assignAutomaticTargets();
    this.updateUnits(delta);
    this.updateConstruction(delta);
    this.updateProduction(delta);
    this.updateStaticDefenses(delta);
    this.updateChargers(delta);
    this.updateEnergyCarriers(delta);
    this.updateDrones(delta);
    this.events = this.events.filter((event) => this.time - event.time < 1.2);
    this.wrecks = this.wrecks.filter((wreck) => wreck.metal > EPSILON);
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
      if (mine.alive && mine.complete && mine.powered && mine.type === "metal_mine") {
        this.resources[mine.team].metal += STRUCTURE_DEFINITIONS.metal_mine.metalRate * delta;
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
        if (distance(left, right) > Math.max(powerReach(left), powerReach(right))) continue;
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
        generators: nodes.filter((structure) => structure.type === "generator"),
        batteries: nodes.filter((structure) => structure.type === "battery"),
        generationRemaining: 0,
        batteryBudgets: new Map(),
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
      (total, generator) => total + STRUCTURE_DEFINITIONS.generator.generationRate * delta,
      0,
    );
    for (const battery of network.batteries) {
      const outputLimit = STRUCTURE_DEFINITIONS.battery.dischargeRate * delta;
      network.batteryBudgets.set(battery.id, Math.min(battery.storedEnergy, outputLimit));
    }
    network.energized =
      network.generators.length > 0 ||
      network.batteries.some((battery) => battery.storedEnergy > EPSILON);

    for (const structure of network.structures) {
      structure.gridId = network.id;
      structure.connected = network.energized;
    }

    for (const generator of network.generators) {
      generator.energyGenerated += STRUCTURE_DEFINITIONS.generator.generationRate * delta;
      generator.powered = true;
      generator.connected = true;
      generator.powerStatus = "generating";
    }

    const consumers = network.structures
      .filter((structure) => structure.type !== "generator" && structure.type !== "battery")
      .sort((left, right) => Number(right.type === "power_tower") - Number(left.type === "power_tower"));
    for (const structure of consumers) {
      if (!network.energized) {
        structure.powerStatus = "disconnected";
        continue;
      }
      const operationCost = (STRUCTURE_DEFINITIONS[structure.type].powerDemand || 0) * delta;
      if (this.takeNetworkEnergy(network, operationCost) + EPSILON >= operationCost) {
        structure.powered = true;
        structure.powerStatus = "online";
      } else {
        structure.powerStatus = "no_energy";
      }
    }

    for (const battery of network.batteries) {
      if (network.generationRemaining <= EPSILON) break;
      const definition = STRUCTURE_DEFINITIONS.battery;
      const charge = Math.min(
        network.generationRemaining,
        definition.chargeRate * delta,
        definition.storageCapacity - battery.storedEnergy,
      );
      if (charge <= EPSILON) continue;
      battery.storedEnergy += charge;
      battery.powerFlow += charge;
      network.generationRemaining -= charge;
    }
    this.updateBatteryStatuses(network);
  }

  getPowerNetworkFor(structure) {
    return this.powerNetworks.find((network) => network.id === structure.gridId) || null;
  }

  getNetworkAvailableEnergy(network) {
    if (!network?.energized) return 0;
    let available = network.generationRemaining;
    for (const battery of network.batteries) {
      available += Math.min(
        battery.storedEnergy,
        network.batteryBudgets.get(battery.id) || 0,
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

    for (const battery of network.batteries) {
      if (remaining <= EPSILON) break;
      const budget = network.batteryBudgets.get(battery.id) || 0;
      const discharge = Math.min(remaining, budget, battery.storedEnergy);
      if (discharge <= EPSILON) continue;
      battery.storedEnergy -= discharge;
      battery.powerFlow -= discharge;
      network.batteryBudgets.set(battery.id, budget - discharge);
      remaining -= discharge;
    }
    this.updateBatteryStatuses(network);
    return requested - Math.max(0, remaining);
  }

  takeStructureEnergy(structure, requested) {
    const network = this.getPowerNetworkFor(structure);
    const available = this.getNetworkAvailableEnergy(network);
    const taken = this.takeNetworkEnergy(network, Math.min(requested, available));
    this.syncStoredEnergy();
    return taken;
  }

  updateBatteryStatuses(network) {
    for (const battery of network.batteries) {
      const definition = STRUCTURE_DEFINITIONS.battery;
      battery.powered = network.energized;
      battery.connected = network.energized;
      if (battery.powerFlow < -EPSILON) battery.powerStatus = "discharging";
      else if (battery.powerFlow > EPSILON) battery.powerStatus = "charging";
      else if (!network.energized) battery.powerStatus = "disconnected";
      else if (battery.storedEnergy <= EPSILON) battery.powerStatus = "empty";
      else if (battery.storedEnergy + EPSILON >= definition.storageCapacity) battery.powerStatus = "full";
      else battery.powerStatus = "standby";
    }
  }

  syncStoredEnergy() {
    for (const team of Object.keys(this.resources)) {
      const batteries = this.structures.filter(
        (structure) =>
          structure.alive &&
          structure.complete &&
          structure.team === team &&
          structure.type === "battery",
      );
      this.resources[team].energy = batteries.reduce(
        (total, battery) => total + battery.storedEnergy,
        0,
      );
      this.resources[team].energyCapacity = batteries.reduce(
        (total) => total + STRUCTURE_DEFINITIONS.battery.storageCapacity,
        0,
      );
    }
  }

  getGenerationRate(team) {
    return this.structures
      .filter(
        (structure) =>
          structure.alive &&
          structure.complete &&
          structure.team === team &&
          structure.type === "generator",
      )
      .reduce(
        (total) => total + STRUCTURE_DEFINITIONS.generator.generationRate,
        0,
      );
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
      ].filter((target) => distance(unit, target) <= definition.attackRange + entityRadius(target));
      const target = nearest(unit, potentialTargets);
      unit.attackTargetId = target?.id || null;
      unit.attackTargetMode = target ? "automatic" : null;
    }
  }

  updateEnemyAi(delta) {
    this.aiThinkRemaining -= delta;
    if (this.aiThinkRemaining > 0) return;
    this.aiThinkRemaining = 2;

    const enemyFactories = this.structures.filter(
      (structure) => structure.alive && structure.complete && structure.team === "enemy" && structure.type.startsWith("mech_factory"),
    );
    const enemyWorkers = this.units.filter(
      (unit) => unit.alive && unit.team === "enemy" && UNIT_DEFINITIONS[unit.type].workerTier,
    );
    this.reassignEnemyConstruction(enemyWorkers);

    const buildPlans = [
      { type: "metal_mine", x: 1350, y: 220 },
      { type: "battery", x: 1335, y: 400 },
      { type: "power_tower", x: 1190, y: 430 },
      { type: "charger", x: 1080, y: 390 },
      { type: "sentry_turret", x: 860, y: 610 },
      { type: "power_tower", x: 1030, y: 790 },
      { type: "salvage_yard", x: 1100, y: 700 },
      { type: "mech_factory_t1", x: 1220, y: 790 },
      { type: "sentry_turret", x: 850, y: 360 },
    ];
    const plan = buildPlans[this.aiBuildIndex];
    const availableWorker = enemyWorkers.find((worker) => !worker.buildTargetId && worker.state === "active");
    if (plan && availableWorker && this.resources.enemy.metal >= STRUCTURE_DEFINITIONS[plan.type].metalCost) {
      const site = this.findNearestValidBuildSite(plan.type, plan.x, plan.y);
      const construction = site.valid
        ? this.startConstruction([availableWorker.id], plan.type, site.x, site.y)
        : null;
      if (construction) this.aiBuildIndex += 1;
    }

    const reservedPlan = buildPlans[this.aiBuildIndex];
    const reservedMetal = reservedPlan
      ? STRUCTURE_DEFINITIONS[reservedPlan.type].metalCost
      : 0;
    for (const factory of enemyFactories) {
      if (factory.productionQueue.length >= 2) continue;
      const workerType = `worker_drone_t${STRUCTURE_DEFINITIONS[factory.type].tier}`;
      const replacingWorker = enemyWorkers.length < 3;
      const choice = replacingWorker ? workerType : "scout_mech";
      const productionCost = UNIT_DEFINITIONS[choice].metalCost;
      const requiredReserve = replacingWorker ? 0 : reservedMetal;
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
    if (
      stagedUnits.length >= SIMULATION_RULES.enemyAttackWaveSize &&
      playerTargets.length > 0
    ) {
      const wave = stagedUnits.slice(0, SIMULATION_RULES.enemyAttackWaveSize);
      const waveCenter = {
        x: wave.reduce((total, unit) => total + unit.x, 0) / wave.length,
        y: wave.reduce((total, unit) => total + unit.y, 0) / wave.length,
      };
      const closest = nearest(waveCenter, playerTargets);
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

      const buildDistance = STRUCTURE_DEFINITIONS[structure.type].radius + 24;
      if (distance(worker, structure) > buildDistance + EPSILON) {
        this.moveUnitToward(worker, structure, delta, buildDistance);
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
        worker.buildTargetId = null;
        if (structure.type === "salvage_yard" && structure.drones.length === 0) {
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
        this.commandMove([unit.id], factory.rallyPoint.x, factory.rallyPoint.y);
      }
      this.emit("unit_complete", unit.x, unit.y, { unitId: unit.id, factoryId: factory.id });
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

    return this.structures.every((structure) => {
      if (!structure.alive) return true;
      const clearance =
        definition.radius +
        STRUCTURE_DEFINITIONS[structure.type].radius +
        SIMULATION_RULES.structureCollisionPadding;
      return distance(point, structure) + EPSILON >= clearance;
    });
  }

  updateStaticDefenses(delta) {
    for (const defense of this.structures) {
      if (!defense.alive || !defense.complete || defense.type !== "sentry_turret") continue;
      const definition = STRUCTURE_DEFINITIONS.sentry_turret;
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
      this.applyDamage(target, definition.attackDamage);
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
        } else if (unit.attackTargetMode === "explicit") {
          this.moveUnitToward(unit, attackTarget, delta, definition.attackRange + targetRadius * 0.75);
        } else {
          unit.attackTargetId = null;
          unit.attackTargetMode = null;
        }
      }
    }
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
    this.applyDamage(target, definition.attackDamage);
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
      const collision = this.findFirstStructureCollision(unit, remainingX, remainingY);
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

      if (Math.hypot(slideX, slideY) <= EPSILON) {
        const remainingDistance = Math.hypot(remainingX, remainingY) * leftoverScale;
        const side = deterministicSide(unit.id, collision.structure.id);
        slideX = -collision.normalY * remainingDistance * side;
        slideY = collision.normalX * remainingDistance * side;
      }
      remainingX = slideX;
      remainingY = slideY;
    }

    return traveled;
  }

  findFirstStructureCollision(unit, movementX, movementY) {
    let first = null;
    for (const structure of this.structures) {
      if (!structure.alive) continue;
      const clearance =
        UNIT_DEFINITIONS[unit.type].radius +
        STRUCTURE_DEFINITIONS[structure.type].radius +
        SIMULATION_RULES.structureCollisionPadding;
      const collision = sweepCircle(unit, movementX, movementY, structure, clearance);
      if (!collision || (first && collision.time >= first.time)) continue;
      first = { ...collision, structure };
    }
    return first;
  }

  resolveUnitStructureOverlap(unit) {
    const unitRadius = UNIT_DEFINITIONS[unit.type].radius;
    for (const structure of this.structures) {
      if (!structure.alive) continue;
      const clearance =
        unitRadius +
        STRUCTURE_DEFINITIONS[structure.type].radius +
        SIMULATION_RULES.structureCollisionPadding;
      const dx = unit.x - structure.x;
      const dy = unit.y - structure.y;
      const separation = Math.hypot(dx, dy);
      if (separation + EPSILON >= clearance) continue;
      const fallbackSide = deterministicSide(unit.id, structure.id);
      const normalX = separation > EPSILON ? dx / separation : fallbackSide;
      const normalY = separation > EPSILON ? dy / separation : 0;
      unit.x = clamp(structure.x + normalX * clearance, unitRadius, this.width - unitRadius);
      unit.y = clamp(structure.y + normalY * clearance, unitRadius, this.height - unitRadius);
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
    this.emit("stasis", unit.x, unit.y, { unitId: unit.id });
  }

  updateChargers(delta) {
    for (const charger of this.structures) {
      if (!charger.alive || charger.type !== "charger" || !charger.powered) continue;
      const definition = STRUCTURE_DEFINITIONS.charger;
      const nearbyUnits = this.units.filter(
        (unit) => unit.alive && unit.team === charger.team && distance(unit, charger) <= definition.chargeRadius,
      );

      for (const unit of nearbyUnits) {
        const unitDefinition = UNIT_DEFINITIONS[unit.type];
        const missing = unitDefinition.maxEnergy - unit.energy;
        const network = this.getPowerNetworkFor(charger);
        const transfer = Math.min(
          missing,
          definition.chargeRate * delta,
          this.getNetworkAvailableEnergy(network),
        );
        if (transfer <= EPSILON) continue;
        const supplied = this.takeStructureEnergy(charger, transfer);
        unit.energy += supplied;
        this.tryReactivateFromSupply(unit);
      }
    }
  }

  updateEnergyCarriers(delta) {
    const carriers = this.units.filter(
      (unit) => unit.alive && unit.state === "active" && UNIT_DEFINITIONS[unit.type].transferRate,
    );

    for (const carrier of carriers) {
      const definition = UNIT_DEFINITIONS[carrier.type];
      let transferBudget = definition.transferRate * delta;
      const allies = this.units
        .filter((unit) => {
          if (!unit.alive || unit.id === carrier.id || unit.team !== carrier.team) return false;
          const targetDefinition = UNIT_DEFINITIONS[unit.type];
          return unit.energy < targetDefinition.maxEnergy && distance(unit, carrier) <= definition.transferRange;
        })
        .sort((a, b) => energyRatio(a) - energyRatio(b));

      for (const ally of allies) {
        const available = Math.max(0, carrier.energy - definition.protectedReserve);
        if (available <= EPSILON || transferBudget <= EPSILON) break;
        const missing = UNIT_DEFINITIONS[ally.type].maxEnergy - ally.energy;
        const transfer = Math.min(available, transferBudget, missing);
        carrier.energy -= transfer;
        ally.energy += transfer;
        transferBudget -= transfer;
        this.tryReactivateFromSupply(ally);
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
    const yards = this.structures.filter((structure) => structure.type === "salvage_yard");
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

    if ((drone.mode === "idle" || drone.mode === "to_wreck") && !wreck && drone.carry < EPSILON) {
      wreck = this.findDroneTarget(drone);
      drone.targetWreckId = wreck?.id || null;
      drone.mode = wreck ? "to_wreck" : "idle";
    }

    if (drone.mode === "to_wreck" && wreck) {
      const arrived = this.moveDroneToward(drone, wreck, delta, 12);
      if (arrived) drone.mode = "collecting";
      return;
    }

    if (drone.mode === "collecting") {
      if (!wreck) {
        drone.mode = drone.carry > EPSILON ? "returning" : "idle";
        drone.targetWreckId = null;
        return;
      }
      const capacity = DRONE_DEFINITION.carryCapacity - drone.carry;
      const collected = Math.min(capacity, wreck.metal, DRONE_DEFINITION.collectionRate * delta);
      drone.carry += collected;
      wreck.metal -= collected;
      if (drone.carry + EPSILON >= DRONE_DEFINITION.carryCapacity || wreck.metal <= EPSILON) {
        drone.mode = "returning";
        drone.targetWreckId = null;
      }
      return;
    }

    if (drone.mode === "returning") {
      const arrived = this.moveDroneToward(drone, yard, delta, STRUCTURE_DEFINITIONS.salvage_yard.radius * 0.65);
      if (arrived) {
        this.resources[yard.team].metal += drone.carry;
        if (drone.carry > EPSILON) this.emit("salvage", yard.x, yard.y, { amount: drone.carry });
        drone.carry = 0;
        drone.mode = "idle";
      }
    }
  }

  findDroneTarget(drone) {
    const reservedIds = new Set(
      this.getDrones()
        .filter((other) => other.alive && other.id !== drone.id && other.targetWreckId)
        .map((other) => other.targetWreckId),
    );
    const candidates = this.wrecks.filter((wreck) => wreck.metal > EPSILON && !reservedIds.has(wreck.id));
    return nearest(drone, candidates);
  }

  moveDroneToward(drone, target, delta, stopDistance = 0) {
    const dx = target.x - drone.x;
    const dy = target.y - drone.y;
    const separation = Math.hypot(dx, dy);
    if (separation <= stopDistance + EPSILON) return true;
    const traveled = Math.min(DRONE_DEFINITION.speed * delta, separation - stopDistance);
    drone.x += (dx / separation) * traveled;
    drone.y += (dy / separation) * traveled;
    return separation - traveled <= stopDistance + EPSILON;
  }

  applyDamage(target, amount) {
    if (!target?.alive || amount <= 0) return;
    target.hp = Math.max(0, target.hp - amount);
    if (target.hp > EPSILON) return;

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
      const salvageMetal = Math.round(UNIT_DEFINITIONS[target.type].metalValue * 0.55);
      this.addWreck(target.x, target.y, salvageMetal, target.team);
    }
    if (target.kind === "structure") target.powered = false;
    this.emit("destroyed", target.x, target.y, { targetId: target.id });
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
    drone.replacementRemaining = STRUCTURE_DEFINITIONS.salvage_yard.droneReplacementTime;
    if (droppedMetal > EPSILON) this.addWreck(destroyedAt.x, destroyedAt.y, droppedMetal, "neutral");
    this.emit("destroyed", destroyedAt.x, destroyedAt.y, { targetId: drone.id, droppedMetal });
    if (yard) {
      drone.x = yard.x;
      drone.y = yard.y;
    }
  }

  replaceDrone(drone, yard) {
    const angle = (drone.slot / 3) * Math.PI * 2;
    drone.alive = true;
    drone.hp = DRONE_DEFINITION.maxHp;
    drone.x = yard.x + Math.cos(angle) * 28;
    drone.y = yard.y + Math.sin(angle) * 28;
    drone.mode = "idle";
    drone.carry = 0;
    drone.targetWreckId = null;
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
  const definition = STRUCTURE_DEFINITIONS[structure.type];
  return definition.relayRadius || definition.powerRadius || 0;
}

function isPowerNode(structure) {
  return structure.type === "generator" || structure.type === "power_tower" || structure.type === "battery";
}

function nearestReachablePowerNode(structure, nodes) {
  return nodes
    .filter((node) => distance(node, structure) <= powerReach(node))
    .sort((left, right) => distance(left, structure) - distance(right, structure))[0] || null;
}

function sweepCircle(origin, movementX, movementY, obstacle, clearance) {
  const offsetX = origin.x - obstacle.x;
  const offsetY = origin.y - obstacle.y;
  const movementLengthSquared = movementX * movementX + movementY * movementY;
  const offsetLengthSquared = offsetX * offsetX + offsetY * offsetY;

  if (offsetLengthSquared < clearance * clearance) {
    const separation = Math.sqrt(offsetLengthSquared);
    const side = deterministicSide(origin.id, obstacle.id);
    return {
      time: 0,
      normalX: separation > EPSILON ? offsetX / separation : side,
      normalY: separation > EPSILON ? offsetY / separation : 0,
    };
  }
  if (movementLengthSquared <= EPSILON) return null;

  const projection = offsetX * movementX + offsetY * movementY;
  if (projection >= 0) return null;
  const discriminant =
    projection * projection -
    movementLengthSquared * (offsetLengthSquared - clearance * clearance);
  if (discriminant < 0) return null;

  const time = (-projection - Math.sqrt(discriminant)) / movementLengthSquared;
  if (time < 0 || time > 1) return null;
  const contactX = offsetX + movementX * time;
  const contactY = offsetY + movementY * time;
  const contactLength = Math.hypot(contactX, contactY);
  return {
    time,
    normalX: contactLength > EPSILON ? contactX / contactLength : 1,
    normalY: contactLength > EPSILON ? contactY / contactLength : 0,
  };
}

function deterministicSide(firstId, secondId) {
  const value = `${firstId}:${secondId}`
    .split("")
    .reduce((total, character) => total + character.charCodeAt(0), 0);
  return value % 2 === 0 ? 1 : -1;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
