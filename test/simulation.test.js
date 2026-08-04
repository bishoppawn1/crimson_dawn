import assert from "node:assert/strict";
import test from "node:test";

import {
  SIMULATION_RULES,
  STRUCTURE_DEFINITIONS,
  UNIT_DEFINITIONS,
  structureFootprint,
} from "../src/data.js";
import { Simulation } from "../src/simulation.js";

function advance(simulation, seconds, step = 1 / 30) {
  const ticks = Math.ceil(seconds / step);
  for (let tick = 0; tick < ticks; tick += 1) simulation.tick(step);
}

test("movement consumes energy and an exhausted unit enters stasis", () => {
  const simulation = new Simulation();
  const unit = simulation.addUnit("scout_mech", "player", 20, 20, { energy: 1 });

  simulation.commandMove([unit.id], 500, 20);
  advance(simulation, 1);

  assert.equal(unit.state, "stasis");
  assert.ok(unit.energy > 0, "stasis regeneration should begin after shutdown");
  assert.ok(unit.energy < SIMULATION_RULES.reactivationThreshold);
  assert.equal(unit.moveTarget, null);
  assert.ok(unit.x > 20, "the unit should move as far as its remaining energy permits");
});

test("stasis regenerates only to the reactivation threshold before control returns", () => {
  const simulation = new Simulation();
  const unit = simulation.addUnit("scout_mech", "player", 20, 20, { energy: 0 });
  const secondsToReactivate =
    SIMULATION_RULES.reactivationThreshold / SIMULATION_RULES.stasisRegenerationRate;

  advance(simulation, secondsToReactivate - 0.2);
  assert.equal(unit.state, "stasis");

  advance(simulation, 0.3);
  assert.equal(unit.state, "active");
  assert.ok(unit.energy < UNIT_DEFINITIONS.scout_mech.maxEnergy);
});

test("attacking damages the target and spends the attacker's energy", () => {
  const simulation = new Simulation();
  const attacker = simulation.addUnit("scout_mech", "player", 100, 100, { energy: 20 });
  const target = simulation.addUnit("raider", "enemy", 150, 100);
  const startingHp = target.hp;

  assert.equal(simulation.commandAttack([attacker.id], target.id), 1);
  simulation.tick(1 / 30);

  assert.equal(target.hp, startingHp - UNIT_DEFINITIONS.scout_mech.attackDamage);
  assert.equal(attacker.energy, 20 - UNIT_DEFINITIONS.scout_mech.attackEnergy);
});

test("Overdrive is restricted by unit capability and consumes energy", () => {
  const simulation = new Simulation();
  const assault = simulation.addUnit("assault_mech", "player", 100, 100, { energy: 60 });
  const scout = simulation.addUnit("scout_mech", "player", 120, 100, { energy: 60 });

  assert.equal(simulation.activateAbility([assault.id, scout.id], "overdrive"), 1);
  assert.equal(assault.energy, 30);
  assert.ok(assault.abilityActiveUntil.overdrive > simulation.time);
  assert.equal(scout.energy, 60);
});

test("a linked charger draws stored energy from a grid battery", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  const battery = simulation.addStructure("battery", "player", 175, 100, { storedEnergy: 100 });
  const charger = simulation.addStructure("charger", "player", 250, 100);
  const unit = simulation.addUnit("scout_mech", "player", 260, 100, { energy: 20 });

  simulation.tick(0.25);

  assert.equal(charger.powered, true);
  assert.ok(unit.energy > 20);
  assert.ok(battery.storedEnergy < 100);
  assert.equal(simulation.resources.player.energy, battery.storedEnergy);
  assert.equal(simulation.resources.player.energyCapacity, STRUCTURE_DEFINITIONS.battery.storageCapacity);
});

test("a charger outside the generator network cannot charge units", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 50, 50);
  const charger = simulation.addStructure("charger", "player", 700, 700);
  const unit = simulation.addUnit("scout_mech", "player", 700, 700, { energy: 20 });

  simulation.tick(0.25);

  assert.equal(charger.powered, false);
  assert.equal(charger.connected, false);
  assert.equal(charger.powerStatus, "disconnected");
  assert.equal(unit.energy, 20);
});

test("generators produce continuously even when surplus energy cannot be stored", () => {
  const simulation = new Simulation();
  const generator = simulation.addStructure("generator", "player", 100, 100);

  advance(simulation, 5);
  const generatedAfterFiveSeconds = generator.energyGenerated;
  advance(simulation, 30);

  assert.equal(simulation.resources.player.energy, 0);
  assert.equal(simulation.resources.player.energyCapacity, 0);
  assert.equal(simulation.getGenerationRate("player"), STRUCTURE_DEFINITIONS.generator.generationRate);
  assert.ok(generatedAfterFiveSeconds >= STRUCTURE_DEFINITIONS.generator.generationRate * 4.99);
  assert.ok(
    generator.energyGenerated >=
      generatedAfterFiveSeconds + STRUCTURE_DEFINITIONS.generator.generationRate * 29.99,
  );
});

test("battery storage is capped by completed battery capacity", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  const battery = simulation.addStructure("battery", "player", 180, 100, {
    storedEnergy: STRUCTURE_DEFINITIONS.battery.storageCapacity - 1,
  });

  advance(simulation, 2);

  assert.equal(battery.storedEnergy, STRUCTURE_DEFINITIONS.battery.storageCapacity);
  assert.equal(simulation.resources.player.energy, STRUCTURE_DEFINITIONS.battery.storageCapacity);
  assert.equal(simulation.resources.player.energyCapacity, STRUCTURE_DEFINITIONS.battery.storageCapacity);
});

test("an isolated charged battery powers its local grid while discharging", () => {
  const simulation = new Simulation();
  const battery = simulation.addStructure("battery", "player", 100, 100, { storedEnergy: 20 });
  const mine = simulation.addStructure("metal_mine", "player", 220, 100);

  simulation.tick(0.25);

  assert.equal(mine.connected, true);
  assert.equal(mine.powered, true);
  assert.equal(battery.powerStatus, "discharging");
  assert.ok(battery.storedEnergy < 20);
});

test("destroying a battery removes its stored energy and capacity", () => {
  const simulation = new Simulation();
  const battery = simulation.addStructure("battery", "player", 100, 100, { storedEnergy: 80 });
  simulation.refreshPowerState(0);
  assert.equal(simulation.resources.player.energy, 80);

  simulation.applyDamage(battery, battery.hp);
  simulation.tick(1 / 30);

  assert.equal(simulation.resources.player.energy, 0);
  assert.equal(simulation.resources.player.energyCapacity, 0);
});

test("an energy carrier automatically supplies allies without crossing its protected reserve", () => {
  const simulation = new Simulation();
  const carrier = simulation.addUnit("energy_carrier", "player", 100, 100, { energy: 100 });
  const ally = simulation.addUnit("scout_mech", "player", 110, 100, { energy: 5 });

  advance(simulation, 5);

  assert.equal(carrier.energy, UNIT_DEFINITIONS.energy_carrier.protectedReserve);
  assert.ok(ally.energy > 5);
});

test("destroyed units create finite reclaimable wreckage", () => {
  const simulation = new Simulation();
  const unit = simulation.addUnit("raider", "enemy", 100, 100);

  simulation.applyDamage(unit, unit.hp);

  assert.equal(unit.alive, false);
  assert.equal(simulation.wrecks.length, 1);
  assert.equal(
    simulation.wrecks[0].metal,
    Math.round(UNIT_DEFINITIONS.raider.metalValue * 0.55),
  );
});

test("a powered salvage yard automatically returns wreck metal", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  simulation.addStructure("salvage_yard", "player", 240, 100);
  simulation.addWreck(300, 100, 20);
  const startingMetal = simulation.resources.player.metal;

  advance(simulation, 12);

  assert.ok(simulation.resources.player.metal > startingMetal);
  assert.ok(simulation.resources.player.metal <= startingMetal + 20);
});

test("a powered yard replaces a destroyed drone for free after a delay", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  const yard = simulation.addStructure("salvage_yard", "player", 240, 100);
  simulation.refreshPowerState(0);
  const drone = yard.drones[0];
  const startingMetal = simulation.resources.player.metal;

  simulation.destroyDrone(drone);
  advance(simulation, STRUCTURE_DEFINITIONS.salvage_yard.droneReplacementTime - 0.2);
  assert.equal(drone.alive, false);

  advance(simulation, 0.3);
  assert.equal(drone.alive, true);
  assert.equal(drone.hp, 35);
  assert.equal(simulation.resources.player.metal, startingMetal);
});

test("combat units automatically attack hostile units that enter weapon range", () => {
  const simulation = new Simulation();
  const playerUnit = simulation.addUnit("scout_mech", "player", 100, 100);
  const enemyUnit = simulation.addUnit("raider", "enemy", 170, 100);
  const enemyStartingHp = enemyUnit.hp;

  simulation.tick(1 / 30);

  assert.equal(playerUnit.attackTargetId, enemyUnit.id);
  assert.ok(enemyUnit.hp < enemyStartingHp);
});

test("a normal move order overrides target lock while firing at enemies in range", () => {
  const simulation = new Simulation();
  const unit = simulation.addUnit("scout_mech", "player", 100, 100);
  const enemy = simulation.addUnit("worker_drone_t1", "enemy", 140, 100);

  simulation.tick(1 / 30);
  assert.equal(unit.attackTargetId, enemy.id);
  const commandStartX = unit.x;
  const hpBeforeMove = enemy.hp;
  unit.attackCooldownRemaining = 0;

  simulation.commandMove([unit.id], 300, 100);
  simulation.tick(1 / 30);

  assert.ok(unit.x > commandStartX, "the move order should not be blocked by the reacquired target");
  assert.ok(enemy.hp < hpBeforeMove, "a normal move should still engage enemies in range");
  assert.deepEqual(unit.moveTarget, { x: 300, y: 100 });
});

test("a force move ignores enemies until the unit reaches its destination", () => {
  const simulation = new Simulation();
  const unit = simulation.addUnit("scout_mech", "player", 100, 100);
  const enemy = simulation.addUnit("worker_drone_t1", "enemy", 250, 100);
  const enemyStartingHp = enemy.hp;

  simulation.commandMove([unit.id], 300, 100, { force: true });
  advance(simulation, 1.5);

  assert.equal(enemy.hp, enemyStartingHp);
  assert.equal(unit.attackTargetId, null);
  assert.equal(unit.moveMode, "force");

  advance(simulation, 1);

  assert.equal(unit.moveTarget, null);
  assert.equal(unit.moveMode, null);
  assert.ok(enemy.hp < enemyStartingHp, "automatic engagement should resume after arrival");
});

test("power relay towers extend a generator network to distant structures", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  const relay = simulation.addStructure("power_tower", "player", 320, 100);
  const charger = simulation.addStructure("charger", "player", 540, 100);

  simulation.tick(0.25);

  assert.equal(relay.powered, true);
  assert.equal(charger.powered, true);
});

test("powered metal mines generate metal over time", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  const mine = simulation.addStructure("metal_mine", "player", 220, 100);
  const startingMetal = simulation.resources.player.metal;

  advance(simulation, 2);

  assert.equal(mine.powered, true);
  assert.ok(simulation.resources.player.metal >= startingMetal + 9.9);
});

test("a Tier 1 mech factory spends metal and constructs a worker drone", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  const factory = simulation.addStructure("mech_factory_t1", "player", 220, 100);
  const startingMetal = simulation.resources.player.metal;

  assert.equal(simulation.queueProduction(factory.id, "worker_drone_t1"), true);
  assert.equal(
    simulation.resources.player.metal,
    startingMetal - UNIT_DEFINITIONS.worker_drone_t1.metalCost,
  );
  advance(simulation, UNIT_DEFINITIONS.worker_drone_t1.productionTime + 0.2);

  assert.ok(simulation.units.some((unit) => unit.alive && unit.type === "worker_drone_t1"));
  assert.equal(factory.productionQueue.length, 0);
});

test("factories choose an unobstructed exit when the preferred spawn is blocked", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 300);
  const factory = simulation.addStructure("mech_factory_t1", "player", 220, 300);
  const blocker = simulation.addStructure("battery", "player", 307, 300);

  assert.equal(simulation.queueProduction(factory.id, "scout_mech"), true);
  advance(simulation, UNIT_DEFINITIONS.scout_mech.productionTime + 0.2);

  const unit = simulation.units.find((candidate) => candidate.type === "scout_mech");
  assert.ok(unit);
  for (const structure of simulation.structures) {
    const clearance =
      UNIT_DEFINITIONS.scout_mech.radius +
      STRUCTURE_DEFINITIONS[structure.type].radius +
      SIMULATION_RULES.structureCollisionPadding;
    assert.ok(Math.hypot(unit.x - structure.x, unit.y - structure.y) + 0.001 >= clearance);
  }
  assert.ok(Math.hypot(unit.x - blocker.x, unit.y - blocker.y) > 0);

  const startingPosition = { x: unit.x, y: unit.y };
  simulation.commandMove([unit.id], 700, 300);
  advance(simulation, 0.5);
  assert.ok(Math.hypot(unit.x - startingPosition.x, unit.y - startingPosition.y) > 1);
});

test("a completed unit waits in a surrounded factory until an exit opens", () => {
  const simulation = new Simulation();
  const factory = simulation.addStructure("mech_factory_t1", "player", 400, 400);
  const blockers = [];
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const type = index === 4 ? "generator" : "battery";
    blockers.push(
      simulation.addStructure(
        type,
        "player",
        factory.x + Math.cos(angle) * 87,
        factory.y + Math.sin(angle) * 87,
      ),
    );
  }

  assert.equal(simulation.queueProduction(factory.id, "scout_mech"), true);
  advance(simulation, UNIT_DEFINITIONS.scout_mech.productionTime + 0.2);

  assert.equal(simulation.units.length, 0);
  assert.equal(factory.productionQueue.length, 1);
  assert.ok(factory.productionQueue[0].progress >= UNIT_DEFINITIONS.scout_mech.productionTime);

  simulation.applyDamage(blockers[0], blockers[0].hp);
  advance(simulation, 0.2);

  assert.equal(simulation.units.length, 1);
  assert.equal(factory.productionQueue.length, 0);
});

test("newly produced combat units attack-move to their factory rally point", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 300);
  const factory = simulation.addStructure("mech_factory_t1", "player", 220, 300);
  const enemy = simulation.addUnit("raider", "enemy", 405, 300);
  const enemyStartingHp = enemy.hp;

  assert.equal(simulation.commandRally(factory.id, 700, 300), true);
  assert.equal(simulation.queueProduction(factory.id, "scout_mech"), true);
  advance(simulation, UNIT_DEFINITIONS.scout_mech.productionTime + 0.5);

  const unit = simulation.units.find((candidate) => candidate.type === "scout_mech");
  assert.ok(unit);
  assert.deepEqual(unit.moveTarget, { x: 700, y: 300 });
  assert.equal(unit.moveMode, "normal");
  assert.ok(enemy.hp < enemyStartingHp, "the unit should engage an enemy along its rally path");
});

test("workers spend metal and complete new structures", () => {
  const simulation = new Simulation();
  const worker = simulation.addUnit("worker_drone_t1", "player", 100, 100);
  const startingMetal = simulation.resources.player.metal;
  const structure = simulation.startConstruction([worker.id], "power_tower", 200, 120);

  assert.ok(structure);
  assert.equal(structure.complete, false);
  assert.equal(
    simulation.resources.player.metal,
    startingMetal - STRUCTURE_DEFINITIONS.power_tower.metalCost,
  );
  advance(simulation, STRUCTURE_DEFINITIONS.power_tower.buildTime + 2);

  assert.equal(structure.complete, true);
  assert.equal(worker.buildTargetId, null);
});

test("powered sentry turrets automatically defend against nearby enemies", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  const turret = simulation.addStructure("sentry_turret", "player", 220, 100);
  const enemy = simulation.addUnit("raider", "enemy", 300, 100);
  const startingHp = enemy.hp;

  simulation.tick(0.25);

  assert.equal(turret.powered, true);
  assert.ok(enemy.hp < startingHp);
});

test("a sentry capacitor charges from live generator output and fires without a grid battery", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  const turret = simulation.addStructure("sentry_turret", "player", 220, 100, {
    weaponEnergy: 0,
  });
  const enemy = simulation.addUnit("raider", "enemy", 300, 100);
  const startingHp = enemy.hp;

  advance(simulation, 0.6, 1 / 30);

  assert.equal(turret.powered, true);
  assert.ok(enemy.hp < startingHp, "the turret should accumulate enough live grid energy to fire");
  assert.ok(turret.weaponEnergy >= 0);
  assert.ok(turret.weaponEnergy <= STRUCTURE_DEFINITIONS.sentry_turret.capacitorCapacity);
});

test("a relay-connected sentry capacitor accepts partial surplus generator output", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  simulation.addStructure("mech_factory_t1", "player", 180, 100);
  simulation.addStructure("metal_mine", "player", 180, 150);
  const relay = simulation.addStructure("power_tower", "player", 320, 100);
  const turret = simulation.addStructure("sentry_turret", "player", 540, 100, {
    weaponEnergy: 0,
  });

  advance(simulation, 1);

  assert.equal(relay.powered, true);
  assert.equal(turret.powered, true);
  assert.ok(turret.weaponEnergy > 0, "the turret should use surplus below its maximum charge rate");
  assert.ok(turret.weaponEnergy < STRUCTURE_DEFINITIONS.sentry_turret.capacitorChargeRate);
});

test("destroyed reclamation drones drop their carried scrap at the death location", () => {
  const simulation = new Simulation();
  const yard = simulation.addStructure("salvage_yard", "player", 100, 100);
  const drone = yard.drones[0];
  drone.x = 300;
  drone.y = 240;
  drone.carry = 17;

  simulation.destroyDrone(drone);

  const droppedScrap = simulation.wrecks.find((wreck) => wreck.x === 300 && wreck.y === 240);
  assert.ok(droppedScrap);
  assert.equal(droppedScrap.metal, 17);
  assert.equal(drone.carry, 0);
});

test("both sides start with only three workers, one Tier 1 factory, and one generator", () => {
  const simulation = Simulation.createFieldTest();

  for (const team of ["player", "enemy"]) {
    const units = simulation.units.filter((unit) => unit.alive && unit.team === team);
    const structures = simulation.structures.filter((structure) => structure.alive && structure.team === team);
    assert.equal(units.length, 3);
    assert.ok(units.every((unit) => unit.type === "worker_drone_t1"));
    assert.deepEqual(
      structures.map((structure) => structure.type).sort(),
      ["generator", "mech_factory_t1"],
    );
  }
});

test("metal mines can only be placed on unused metal deposits and snap to them", () => {
  const simulation = new Simulation();
  const worker = simulation.addUnit("worker_drone_t1", "player", 100, 100);
  const deposit = simulation.addMetalDeposit(300, 300);
  const startingMetal = simulation.resources.player.metal;

  const invalidMine = simulation.startConstruction([worker.id], "metal_mine", 100, 400);
  assert.equal(invalidMine, null);
  assert.equal(simulation.resources.player.metal, startingMetal);
  assert.match(simulation.lastPlacementError, /unused metal deposit/i);

  const mine = simulation.startConstruction([worker.id], "metal_mine", 340, 300);
  assert.ok(mine);
  assert.equal(mine.x, deposit.x);
  assert.equal(mine.y, deposit.y);
  assert.equal(mine.depositId, deposit.id);

  const duplicateMine = simulation.startConstruction([worker.id], "metal_mine", 300, 300);
  assert.equal(duplicateMine, null);
});

test("energy-production buildings can be placed away from metal deposits", () => {
  const simulation = new Simulation();
  const worker = simulation.addUnit("worker_drone_t1", "player", 100, 100);

  const generator = simulation.startConstruction([worker.id], "generator", 777, 333);

  assert.ok(generator);
  assert.equal(generator.x, 760);
  assert.equal(generator.y, 320);
  assert.equal(generator.depositId, null);
});

test("units route around structures without crossing their collision footprint", () => {
  const simulation = new Simulation();
  const structure = simulation.addStructure("generator", "player", 200, 100);
  const unit = simulation.addUnit("scout_mech", "player", 100, 100);
  const clearance =
    UNIT_DEFINITIONS.scout_mech.radius +
    STRUCTURE_DEFINITIONS.generator.radius +
    SIMULATION_RULES.structureCollisionPadding;

  simulation.commandMove([unit.id], 300, 100);
  for (let tick = 0; tick < 300; tick += 1) {
    simulation.tick(1 / 30);
    assert.ok(
      Math.hypot(unit.x - structure.x, unit.y - structure.y) + 0.01 >= clearance,
      "the unit entered the structure collision footprint",
    );
  }

  assert.ok(unit.x > structure.x + clearance, "the unit should slide around the obstruction");
  assert.equal(unit.moveTarget, null);
});

test("right-click build commands can resume an unfinished friendly structure", () => {
  const simulation = new Simulation();
  const worker = simulation.addUnit("worker_drone_t1", "player", 100, 100);
  const structure = simulation.addStructure("power_tower", "player", 160, 100, {
    complete: false,
    constructionProgress: 2,
  });

  assert.equal(simulation.commandBuild([worker.id], structure.id), 1);
  assert.equal(worker.buildTargetId, structure.id);
  advance(simulation, STRUCTURE_DEFINITIONS.power_tower.buildTime + 1);

  assert.equal(structure.complete, true);
  assert.equal(worker.buildTargetId, null);
});

test("a replacement worker can finish a project after the original builder dies", () => {
  const simulation = new Simulation();
  const original = simulation.addUnit("worker_drone_t1", "player", 100, 100);
  const structure = simulation.startConstruction([original.id], "power_tower", 145, 100);
  advance(simulation, 1);
  const progressBeforeDeath = structure.constructionProgress;

  simulation.applyDamage(original, original.hp);
  const replacement = simulation.addUnit("worker_drone_t1", "player", 100, 120);
  assert.equal(simulation.commandBuild([replacement.id], structure.id), 1);
  advance(simulation, STRUCTURE_DEFINITIONS.power_tower.buildTime + 1);

  assert.ok(progressBeforeDeath > 0);
  assert.equal(original.alive, false);
  assert.equal(structure.complete, true);
});

test("a worker keeps its construction assignment through stasis and resumes after reactivation", () => {
  const simulation = new Simulation();
  const worker = simulation.addUnit("worker_drone_t1", "player", 100, 100, { energy: 1 });
  const structure = simulation.addStructure("power_tower", "player", 400, 100, {
    complete: false,
    constructionProgress: 0,
  });
  simulation.commandBuild([worker.id], structure.id);

  advance(simulation, 2);
  assert.equal(worker.state, "stasis");
  assert.equal(worker.buildTargetId, structure.id);

  advance(simulation, 18);
  assert.equal(worker.state, "active");
  assert.equal(structure.complete, true);
  assert.equal(worker.buildTargetId, null);
});

test("construction placement rejects foundations that overlap existing buildings", () => {
  const simulation = new Simulation();
  const worker = simulation.addUnit("worker_drone_t1", "player", 100, 100);
  simulation.addStructure("generator", "player", 220, 100);
  const startingMetal = simulation.resources.player.metal;

  const overlapping = simulation.startConstruction([worker.id], "battery", 240, 100);

  assert.equal(overlapping, null);
  assert.equal(simulation.resources.player.metal, startingMetal);
  assert.match(simulation.lastPlacementError, /cannot overlap/i);
});

test("construction placement rejects sites occupied by units without spending metal", () => {
  const simulation = new Simulation();
  const builder = simulation.addUnit("worker_drone_t1", "player", 100, 100);
  simulation.addUnit("worker_drone_t1", "enemy", 400, 400);
  const startingMetal = simulation.resources.player.metal;

  const blocked = simulation.startConstruction([builder.id], "generator", 401, 399);

  assert.equal(blocked, null);
  assert.equal(simulation.resources.player.metal, startingMetal);
  assert.match(simulation.lastPlacementError, /unit is occupying/i);
});

test("ordinary buildings snap to the shared 40-unit construction grid", () => {
  const simulation = new Simulation();
  const worker = simulation.addUnit("worker_drone_t1", "player", 100, 100);

  const placement = simulation.startConstruction([worker.id], "battery", 777, 333);

  assert.ok(placement);
  assert.equal(placement.x, 760);
  assert.equal(placement.y, 320);
  assert.equal(placement.x % SIMULATION_RULES.buildingGridSize, 0);
  assert.equal(placement.y % SIMULATION_RULES.buildingGridSize, 0);
});

test("odd and even building footprints align every edge to a grid line", () => {
  const simulation = new Simulation();
  const worker = simulation.addUnit("worker_drone_t1", "player", 100, 100);
  const factory = simulation.startConstruction([worker.id], "mech_factory_t1", 777, 333);
  const footprint = structureFootprint("mech_factory_t1");

  assert.ok(factory);
  assert.equal(factory.x, 780);
  assert.equal(factory.y, 320);
  assert.equal((factory.x - footprint.halfWidth) % SIMULATION_RULES.buildingGridSize, 0);
  assert.equal((factory.x + footprint.halfWidth) % SIMULATION_RULES.buildingGridSize, 0);
  assert.equal((factory.y - footprint.halfHeight) % SIMULATION_RULES.buildingGridSize, 0);
  assert.equal((factory.y + footprint.halfHeight) % SIMULATION_RULES.buildingGridSize, 0);
});

test("building classes use distinct grid footprints", () => {
  assert.deepEqual(STRUCTURE_DEFINITIONS.power_tower.footprint, [1, 1]);
  assert.deepEqual(STRUCTURE_DEFINITIONS.generator.footprint, [2, 2]);
  assert.deepEqual(STRUCTURE_DEFINITIONS.mech_factory_t1.footprint, [3, 2]);
  assert.deepEqual(STRUCTURE_DEFINITIONS.mech_factory_t2.footprint, [4, 3]);
  assert.deepEqual(STRUCTURE_DEFINITIONS.mech_factory_t3.footprint, [5, 4]);
});

test("enemy AI searches nearby grid cells when its preferred site is occupied", () => {
  const simulation = new Simulation();
  simulation.aiThinkRemaining = 0;
  simulation.aiBuildIndex = 1;
  const worker = simulation.addUnit("worker_drone_t1", "enemy", 1320, 400);

  simulation.tick(1 / 30);

  const battery = simulation.structures.find(
    (structure) => structure.alive && structure.team === "enemy" && structure.type === "battery",
  );
  assert.ok(battery);
  assert.notDeepEqual([battery.x, battery.y], [1320, 400]);
  assert.equal(battery.x % SIMULATION_RULES.buildingGridSize, 0);
  assert.equal(battery.y % SIMULATION_RULES.buildingGridSize, 0);
  assert.ok(
    Math.hypot(battery.x - worker.x, battery.y - worker.y) + 0.0001 >=
      STRUCTURE_DEFINITIONS.battery.radius +
        UNIT_DEFINITIONS.worker_drone_t1.radius +
        SIMULATION_RULES.structureCollisionPadding,
  );
});

test("enemy AI reassigns an idle worker to an abandoned foundation", () => {
  const simulation = new Simulation();
  simulation.aiThinkRemaining = 0;
  const worker = simulation.addUnit("worker_drone_t1", "enemy", 100, 100);
  const project = simulation.addStructure("power_tower", "enemy", 160, 100, {
    complete: false,
    constructionProgress: 2,
  });

  simulation.tick(1 / 30);

  assert.equal(worker.buildTargetId, project.id);
  advance(simulation, STRUCTURE_DEFINITIONS.power_tower.buildTime + 1);
  assert.equal(project.complete, true);
});

test("enemy AI reserves metal for its next building before queueing combat units", () => {
  const simulation = new Simulation();
  simulation.aiThinkRemaining = 0;
  simulation.aiBuildIndex = 1;
  simulation.resources.enemy.metal = STRUCTURE_DEFINITIONS.battery.metalCost - 10;
  simulation.addUnit("worker_drone_t1", "enemy", 1200, 600);
  simulation.addUnit("worker_drone_t1", "enemy", 1240, 600);
  simulation.addUnit("worker_drone_t1", "enemy", 1280, 600);
  const factory = simulation.addStructure("mech_factory_t1", "enemy", 1400, 700);

  simulation.tick(1 / 30);

  assert.equal(factory.productionQueue.length, 0);
  assert.equal(
    simulation.resources.enemy.metal,
    STRUCTURE_DEFINITIONS.battery.metalCost - 10,
  );
});

test("workers begin construction at the floating-point edge of build range", () => {
  const simulation = new Simulation();
  const project = simulation.addStructure("battery", "player", 200, 100, {
    complete: false,
    constructionProgress: 0,
  });
  const buildDistance = STRUCTURE_DEFINITIONS.battery.radius + 24;
  const worker = simulation.addUnit(
    "worker_drone_t1",
    "player",
    project.x + buildDistance + 0.00005,
    project.y,
  );
  simulation.commandBuild([worker.id], project.id);

  simulation.tick(1 / 30);

  assert.ok(project.constructionProgress > 0);
});

test("enemy combat units wait for a full wave before attacking", () => {
  const simulation = new Simulation();
  const target = simulation.addStructure("generator", "player", 100, 100);
  const staged = [
    simulation.addUnit("scout_mech", "enemy", 1000, 440),
    simulation.addUnit("scout_mech", "enemy", 1020, 480),
    simulation.addUnit("scout_mech", "enemy", 1040, 520),
  ];
  simulation.aiThinkRemaining = 0;

  simulation.tick(1 / 30);
  assert.ok(staged.every((unit) => unit.attackTargetId === null));

  const fourth = simulation.addUnit("scout_mech", "enemy", 1060, 560);
  simulation.aiThinkRemaining = 0;
  simulation.tick(1 / 30);

  assert.equal(SIMULATION_RULES.enemyAttackWaveSize, 4);
  assert.ok([...staged, fourth].every((unit) => unit.attackTargetId === target.id));
  assert.ok([...staged, fourth].every((unit) => unit.attackTargetMode === "explicit"));
});

test("cancelling construction removes the foundation, clears workers, and refunds unbuilt metal", () => {
  const simulation = new Simulation();
  const worker = simulation.addUnit("worker_drone_t1", "player", 100, 100);
  const definition = STRUCTURE_DEFINITIONS.battery;
  const project = simulation.addStructure("battery", "player", 200, 100, {
    complete: false,
    constructionProgress: 3,
  });
  simulation.commandBuild([worker.id], project.id);
  const startingMetal = simulation.resources.player.metal;
  const expectedRefund =
    definition.metalCost *
    (1 - project.constructionProgress / definition.buildTime) *
    SIMULATION_RULES.constructionCancelRefundRate;

  assert.equal(simulation.cancelConstruction(project.id, "enemy"), null);
  const cancellation = simulation.cancelConstruction(project.id, "player");

  assert.ok(cancellation);
  assert.equal(cancellation.refund, expectedRefund);
  assert.equal(project.alive, false);
  assert.equal(worker.buildTargetId, null);
  assert.equal(simulation.resources.player.metal, startingMetal + expectedRefund);
  assert.equal(simulation.events.at(-1).type, "construction_cancelled");
});
