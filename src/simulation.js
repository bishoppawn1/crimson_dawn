import {
  DRONE_DEFINITION,
  SIMULATION_RULES,
  STRUCTURE_DEFINITIONS,
  UNIT_DEFINITIONS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
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
    this.events = [];
    this.resources = {
      player: { metal: 240, energy: 160 },
      enemy: { metal: 0, energy: 1000 },
    };
  }

  static createFieldTest() {
    const simulation = new Simulation();

    simulation.addStructure("generator", "player", 225, 440);
    simulation.addStructure("charger", "player", 430, 440);
    simulation.addStructure("salvage_yard", "player", 245, 685);

    simulation.addUnit("scout_mech", "player", 390, 350);
    simulation.addUnit("scout_mech", "player", 440, 340, { energy: 64 });
    simulation.addUnit("assault_mech", "player", 390, 520);
    simulation.addUnit("energy_carrier", "player", 490, 470);

    simulation.addUnit("raider", "enemy", 1240, 310);
    simulation.addUnit("raider", "enemy", 1320, 390);
    simulation.addUnit("raider", "enemy", 1285, 555);

    simulation.addWreck(730, 650, 72);
    simulation.addWreck(885, 720, 48);
    simulation.addWreck(1030, 610, 90);
    simulation.refreshPowerState(0);
    return simulation;
  }

  createId(prefix) {
    const id = `${prefix}-${this.nextEntityNumber}`;
    this.nextEntityNumber += 1;
    return id;
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
      attackTargetId: null,
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
      drones: [],
      ...overrides,
    };

    if (type === "salvage_yard") {
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

  commandMove(unitIds, x, y) {
    const destination = {
      x: clamp(x, 0, this.width),
      y: clamp(y, 0, this.height),
    };
    let accepted = 0;

    for (const id of unitIds) {
      const unit = this.getUnit(id);
      if (!unit || !unit.alive || unit.state !== "active") continue;
      unit.moveTarget = { ...destination };
      unit.attackTargetId = null;
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
      unit.moveTarget = null;
      accepted += 1;
    }
    return accepted;
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
    this.assignEnemyOrders();
    this.updateUnits(delta);
    this.updateChargers(delta);
    this.updateEnergyCarriers(delta);
    this.updateDrones(delta);
    this.events = this.events.filter((event) => this.time - event.time < 1.2);
    this.wrecks = this.wrecks.filter((wreck) => wreck.metal > EPSILON);
  }

  refreshPowerState(delta) {
    for (const team of Object.keys(this.resources)) {
      const generation = this.structures
        .filter((structure) => structure.alive && structure.team === team && structure.type === "generator")
        .reduce((total, structure) => total + STRUCTURE_DEFINITIONS[structure.type].generationRate, 0);
      this.resources[team].energy += generation * delta;
    }

    for (const structure of this.structures) {
      if (!structure.alive) {
        structure.powered = false;
        continue;
      }
      if (structure.type === "generator") {
        structure.powered = true;
        continue;
      }

      const linked = this.structures.some((generator) => {
        if (!generator.alive || generator.team !== structure.team || generator.type !== "generator") return false;
        return distance(generator, structure) <= STRUCTURE_DEFINITIONS.generator.powerRadius;
      });
      const demand = STRUCTURE_DEFINITIONS[structure.type].powerDemand || 0;
      const operationCost = demand * delta;
      const account = this.resources[structure.team];
      structure.powered = linked && account.energy + EPSILON >= operationCost;
      if (structure.powered) account.energy = Math.max(0, account.energy - operationCost);
    }
  }

  assignEnemyOrders() {
    const potentialTargets = [
      ...this.units.filter((entity) => entity.alive && entity.team === "player"),
      ...this.getDrones().filter((entity) => entity.alive && entity.team === "player"),
      ...this.structures.filter((entity) => entity.alive && entity.team === "player"),
    ];

    for (const unit of this.units) {
      if (!unit.alive || unit.team !== "enemy" || unit.state !== "active") continue;
      const existingTarget = this.getEntity(unit.attackTargetId);
      if (existingTarget?.alive && existingTarget.team !== unit.team) continue;
      const target = nearest(unit, potentialTargets);
      unit.attackTargetId = target?.id || null;
    }
  }

  updateUnits(delta) {
    for (const unit of this.units) {
      if (!unit.alive) continue;
      const definition = UNIT_DEFINITIONS[unit.type];
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

      const attackTarget = this.getEntity(unit.attackTargetId);
      if (unit.attackTargetId && (!attackTarget || !attackTarget.alive || attackTarget.team === unit.team)) {
        unit.attackTargetId = null;
      }

      if (attackTarget?.alive && attackTarget.team !== unit.team) {
        const separation = distance(unit, attackTarget);
        const targetRadius = entityRadius(attackTarget);
        if (separation <= definition.attackRange + targetRadius) {
          this.tryAttack(unit, attackTarget, definition);
        } else {
          this.moveUnitToward(unit, attackTarget, delta, definition.attackRange + targetRadius * 0.75);
        }
      } else if (unit.moveTarget) {
        this.moveUnitToward(unit, unit.moveTarget, delta, 4);
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
      if (unit.moveTarget) unit.moveTarget = null;
      return 0;
    }

    const overdrive = unit.abilityActiveUntil.overdrive > this.time;
    const speedMultiplier = overdrive
      ? definition.abilities.overdrive.speedMultiplier
      : 1;
    const desiredDistance = Math.min(definition.speed * speedMultiplier * delta, separation - stopDistance);
    const energyCostPerUnit = definition.movementEnergyPerUnit;
    const affordableDistance = energyCostPerUnit > 0 ? unit.energy / energyCostPerUnit : desiredDistance;
    const traveled = Math.max(0, Math.min(desiredDistance, affordableDistance));

    if (traveled > EPSILON) {
      unit.x = clamp(unit.x + (dx / separation) * traveled, 0, this.width);
      unit.y = clamp(unit.y + (dy / separation) * traveled, 0, this.height);
      unit.energy = Math.max(0, unit.energy - traveled * energyCostPerUnit);
    }

    if (unit.moveTarget && separation - traveled <= stopDistance + EPSILON) unit.moveTarget = null;
    if (unit.energy <= EPSILON) this.enterStasis(unit);
    return traveled;
  }

  enterStasis(unit) {
    if (!unit.alive || unit.state === "stasis") return;
    unit.energy = 0;
    unit.state = "stasis";
    unit.moveTarget = null;
    unit.attackTargetId = null;
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
        const account = this.resources[charger.team];
        const transfer = Math.min(missing, definition.chargeRate * delta, account.energy);
        if (transfer <= EPSILON) continue;
        unit.energy += transfer;
        account.energy -= transfer;
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
      target.attackTargetId = null;
      const salvageMetal = Math.round(UNIT_DEFINITIONS[target.type].metalValue * 0.55);
      this.addWreck(target.x, target.y, salvageMetal, target.team);
    }
    if (target.kind === "structure") target.powered = false;
    this.emit("destroyed", target.x, target.y, { targetId: target.id });
  }

  destroyDrone(drone) {
    if (!drone.alive) return;
    const yard = this.getStructure(drone.yardId);
    drone.alive = false;
    drone.hp = 0;
    drone.carry = 0;
    drone.mode = "rebuilding";
    drone.targetWreckId = null;
    drone.replacementRemaining = STRUCTURE_DEFINITIONS.salvage_yard.droneReplacementTime;
    this.emit("destroyed", drone.x, drone.y, { targetId: drone.id });
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
