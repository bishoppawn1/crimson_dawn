import assert from "node:assert/strict";
import test from "node:test";

import {
  SIMULATION_RULES,
  STRUCTURE_DEFINITIONS,
  UNIT_DEFINITIONS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  structureFootprint,
} from "../src/data.js";
import { Simulation } from "../src/simulation.js";

function advance(simulation, seconds, step = 1 / 30) {
  const ticks = Math.ceil(seconds / step);
  for (let tick = 0; tick < ticks; tick += 1) simulation.tick(step);
}

test("the standard battlefield uses the expanded map and separated starting bases", () => {
  const simulation = Simulation.createFieldTest();
  const playerGenerator = simulation.structures.find(
    (structure) => structure.team === "player" && structure.type === "generator",
  );
  const enemyGenerator = simulation.structures.find(
    (structure) => structure.team === "enemy" && structure.type === "generator",
  );

  assert.equal(WORLD_WIDTH, 3200);
  assert.equal(WORLD_HEIGHT, 1800);
  assert.equal(simulation.width, WORLD_WIDTH);
  assert.equal(simulation.height, WORLD_HEIGHT);
  assert.ok(playerGenerator.x < WORLD_WIDTH * 0.25);
  assert.ok(enemyGenerator.x > WORLD_WIDTH * 0.75);
  assert.ok(enemyGenerator.x - playerGenerator.x > WORLD_WIDTH / 2);
  assert.ok(
    simulation.metalDeposits.every(
      (deposit) =>
        deposit.x >= 0 &&
        deposit.x <= WORLD_WIDTH &&
        deposit.y >= 0 &&
        deposit.y <= WORLD_HEIGHT,
    ),
  );
});

test("mobile units use compact battlefield footprints", () => {
  const radii = Object.values(UNIT_DEFINITIONS).map((definition) => definition.radius);

  assert.ok(Math.max(...radii) <= 13);
  assert.ok(Math.min(...radii) >= 6);
});

test("overlapping friendly and enemy units physically separate", () => {
  const simulation = new Simulation();
  const units = Array.from({ length: 8 }, (_, index) =>
    simulation.addUnit(
      index % 2 === 0 ? "worker_drone_t1" : "scout_mech",
      index % 2 === 0 ? "player" : "enemy",
      400,
      400,
      { holdPosition: true },
    ),
  );

  advance(simulation, 0.5);

  for (let firstIndex = 0; firstIndex < units.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < units.length; secondIndex += 1) {
      const first = units[firstIndex];
      const second = units[secondIndex];
      const minimumDistance =
        UNIT_DEFINITIONS[first.type].radius +
        UNIT_DEFINITIONS[second.type].radius +
        SIMULATION_RULES.unitCollisionPadding;
      assert.ok(
        Math.hypot(first.x - second.x, first.y - second.y) + 0.02 >= minimumDistance,
        `${first.id} and ${second.id} should not overlap`,
      );
    }
  }
});

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

test("active low-energy units passively regenerate an emergency reserve", () => {
  const simulation = new Simulation();
  const unit = simulation.addUnit("scout_mech", "player", 100, 100, { energy: 2 });

  advance(simulation, 2);

  assert.equal(unit.state, "active");
  assert.ok(unit.energy >= 2 + SIMULATION_RULES.lowEnergyRegenerationRate * 1.99);
});

test("emergency regeneration lets an energy-starved unit resume firing", () => {
  const simulation = new Simulation();
  const attacker = simulation.addUnit("scout_mech", "player", 100, 100, { energy: 1 });
  const target = simulation.addUnit("raider", "enemy", 150, 100);
  const startingHp = target.hp;
  const recoveryTime =
    (UNIT_DEFINITIONS.scout_mech.attackEnergy - attacker.energy) /
    SIMULATION_RULES.lowEnergyRegenerationRate;

  advance(simulation, recoveryTime + 0.2);

  assert.ok(target.hp < startingHp, "the unit should regenerate enough energy to fire again");
});

test("active emergency regeneration stops at its narrow recovery threshold", () => {
  const simulation = new Simulation();
  const threshold = SIMULATION_RULES.lowEnergyRegenerationThreshold;
  const unit = simulation.addUnit("scout_mech", "player", 100, 100, { energy: threshold - 1 });

  advance(simulation, 5);

  assert.ok(Math.abs(unit.energy - threshold) < 0.0001);
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
  const generator = simulation.addStructure("generator", "player", 100, 100);
  const battery = simulation.addStructure("battery", "player", 175, 100, { storedEnergy: 100 });
  const charger = simulation.addStructure("charger", "player", 250, 100);
  const unit = simulation.addUnit("scout_mech", "player", 260, 100, { energy: 20 });

  simulation.tick(0.25);

  assert.equal(charger.powered, true);
  assert.ok(unit.energy > 20);
  assert.ok(battery.storedEnergy < 100);
  assert.equal(
    simulation.resources.player.energy,
    battery.storedEnergy + generator.storedEnergy,
  );
  assert.equal(
    simulation.resources.player.energyCapacity,
    STRUCTURE_DEFINITIONS.battery.storageCapacity + STRUCTURE_DEFINITIONS.generator.storageCapacity,
  );
});

test("the faster Induction Charger transfers its provisional maximum rate", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  simulation.addStructure("battery", "player", 175, 100, { storedEnergy: 100 });
  const charger = simulation.addStructure("charger", "player", 250, 100);
  const unit = simulation.addUnit("scout_mech", "player", 260, 100, { energy: 20 });

  simulation.tick(0.25);

  assert.equal(charger.powered, true);
  assert.ok(Math.abs(unit.energy - (20 + STRUCTURE_DEFINITIONS.charger.chargeRate * 0.25)) < 0.001);
  assert.equal(STRUCTURE_DEFINITIONS.charger.chargeRate, 112);
});

test("an Induction Charger charges every unit in its field simultaneously", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  const charger = simulation.addStructure("charger", "player", 250, 100);
  const units = [
    simulation.addUnit("scout_mech", "player", 235, 100, { energy: 20 }),
    simulation.addUnit("scout_mech", "player", 265, 100, { energy: 20 }),
    simulation.addUnit("scout_mech", "player", 250, 125, { energy: 20 }),
  ];

  simulation.tick(0.25);

  const gains = units.map((unit) => unit.energy - 20);
  assert.ok(gains.every((gain) => gain > 0), "no in-range unit should be skipped");
  assert.ok(Math.max(...gains) - Math.min(...gains) < 0.0001, "scarce power should be shared evenly");
  assert.ok(
    Math.abs(gains.reduce((total, gain) => total + gain, 0) - 2.75) < 0.0001,
    "the field should conserve the grid energy available after charger operation",
  );
  assert.equal(charger.powered, true);
});

test("all units receive the full charger rate when the grid can supply it", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  simulation.addStructure("battery", "player", 140, 100, { storedEnergy: 100 });
  simulation.addStructure("battery", "player", 175, 100, { storedEnergy: 100 });
  simulation.addStructure("battery", "player", 210, 100, { storedEnergy: 100 });
  simulation.addStructure("charger", "player", 250, 100);
  const units = [
    simulation.addUnit("scout_mech", "player", 235, 100, { energy: 20 }),
    simulation.addUnit("scout_mech", "player", 265, 100, { energy: 20 }),
    simulation.addUnit("scout_mech", "player", 250, 125, { energy: 20 }),
  ];

  simulation.tick(0.25);

  const expectedEnergy = 20 + STRUCTURE_DEFINITIONS.charger.chargeRate * 0.25;
  assert.ok(units.every((unit) => Math.abs(unit.energy - expectedEnergy) < 0.0001));
});

test("every unit type has the enlarged provisional energy capacity", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(UNIT_DEFINITIONS).map(([type, definition]) => [type, definition.maxEnergy]),
    ),
    {
      worker_drone_t1: 690,
      worker_drone_t2: 990,
      worker_drone_t3: 1380,
      scout_mech: 600,
      scout_mech_t2: 870,
      scout_mech_t3: 1200,
      assault_mech: 780,
      assault_mech_t2: 1080,
      assault_mech_t3: 1440,
      energy_carrier: 2520,
      energy_carrier_t2: 3600,
      energy_carrier_t3: 5100,
      raider: 1080,
    },
  );
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

test("generators continuously produce and retain a capped internal reserve", () => {
  const simulation = new Simulation();
  const generator = simulation.addStructure("generator", "player", 100, 100);

  advance(simulation, 5);
  const generatedAfterFiveSeconds = generator.energyGenerated;
  assert.ok(generator.storedEnergy >= STRUCTURE_DEFINITIONS.generator.generationRate * 4.99);
  advance(simulation, 30);

  assert.equal(generator.storedEnergy, STRUCTURE_DEFINITIONS.generator.storageCapacity);
  assert.equal(simulation.resources.player.energy, STRUCTURE_DEFINITIONS.generator.storageCapacity);
  assert.equal(simulation.resources.player.energyCapacity, STRUCTURE_DEFINITIONS.generator.storageCapacity);
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
  assert.ok(simulation.resources.player.energy > STRUCTURE_DEFINITIONS.battery.storageCapacity);
  assert.equal(
    simulation.resources.player.energyCapacity,
    STRUCTURE_DEFINITIONS.battery.storageCapacity + STRUCTURE_DEFINITIONS.generator.storageCapacity,
  );
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

test("metal mines continuously consume their passive power demand", () => {
  const simulation = new Simulation();
  const battery = simulation.addStructure("battery", "player", 100, 100, { storedEnergy: 20 });
  const mine = simulation.addStructure("metal_mine", "player", 220, 100);
  const startingEnergy = battery.storedEnergy;
  const startingMetal = simulation.resources.player.metal;

  simulation.tick(0.25);

  assert.equal(mine.powered, true);
  assert.ok(
    Math.abs(
      battery.storedEnergy -
        (startingEnergy - STRUCTURE_DEFINITIONS.metal_mine.powerDemand * 0.25),
    ) < 0.0001,
  );
  assert.ok(simulation.resources.player.metal > startingMetal);
});

test("a charged relay keeps its local grid alive after its generator is destroyed", () => {
  const simulation = new Simulation();
  const generator = simulation.addStructure("generator", "player", 100, 100);
  const relay = simulation.addStructure("power_tower", "player", 320, 100);
  const mine = simulation.addStructure("metal_mine", "player", 540, 100);

  advance(simulation, 4);
  assert.equal(relay.storedEnergy, STRUCTURE_DEFINITIONS.power_tower.storageCapacity);

  simulation.applyDamage(generator, generator.hp);
  const storedBeforeDischarge = relay.storedEnergy;
  simulation.tick(0.25);

  assert.equal(mine.connected, true);
  assert.equal(mine.powered, true);
  assert.equal(relay.powerStatus, "discharging");
  assert.ok(relay.storedEnergy < storedBeforeDischarge);
});

test("an active factory queue adds production demand and lowers net energy", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  const factory = simulation.addStructure("mech_factory_t1", "player", 220, 100);
  simulation.refreshPowerState(0);

  assert.equal(
    simulation.getNetEnergyRate("player"),
    STRUCTURE_DEFINITIONS.generator.generationRate - STRUCTURE_DEFINITIONS.mech_factory_t1.powerDemand,
  );

  assert.equal(simulation.queueProduction(factory.id, "worker_drone_t1"), true);
  simulation.tick(0.25);

  assert.equal(factory.powered, true);
  assert.ok(factory.productionQueue[0].progress > 0);
  assert.equal(
    simulation.getNetEnergyRate("player"),
    STRUCTURE_DEFINITIONS.generator.generationRate -
      STRUCTURE_DEFINITIONS.mech_factory_t1.powerDemand -
      STRUCTURE_DEFINITIONS.mech_factory_t1.productionPowerDemand,
  );
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

test("an energy carrier spends exactly the energy shared fairly with nearby units", () => {
  const simulation = new Simulation();
  const definition = UNIT_DEFINITIONS.energy_carrier;
  const carrier = simulation.addUnit("energy_carrier", "player", 100, 100, { energy: 200 });
  const firstAlly = simulation.addUnit("scout_mech", "player", 110, 100, { energy: 10 });
  const secondAlly = simulation.addUnit("scout_mech", "player", 120, 100, { energy: 20 });
  const otherCarrier = simulation.addUnit("energy_carrier", "player", 130, 100, { energy: 60 });
  const outsideAlly = simulation.addUnit(
    "scout_mech",
    "player",
    100 + definition.transferRange + 1,
    100,
    { energy: 10 },
  );
  const startingTotal = firstAlly.energy + secondAlly.energy;

  simulation.updateEnergyCarriers(1);

  const delivered = firstAlly.energy + secondAlly.energy - startingTotal;
  assert.ok(Math.abs(delivered - definition.transferRate) < 0.0001);
  assert.ok(Math.abs((200 - carrier.energy) - delivered) < 0.0001);
  assert.ok(Math.abs(firstAlly.energy - 27.5) < 0.0001);
  assert.ok(Math.abs(secondAlly.energy - 37.5) < 0.0001);
  assert.equal(otherCarrier.energy, 60);
  assert.equal(outsideAlly.energy, 10);
  assert.deepEqual(
    new Set(carrier.energyTransferTargetIds),
    new Set([firstAlly.id, secondAlly.id]),
  );
});

test("every Arc Energy Carrier tier transfers its matching output rate", () => {
  for (const [carrierType, allyType] of [
    ["energy_carrier", "scout_mech"],
    ["energy_carrier_t2", "scout_mech_t2"],
    ["energy_carrier_t3", "scout_mech_t3"],
  ]) {
    const simulation = new Simulation();
    const definition = UNIT_DEFINITIONS[carrierType];
    const startingEnergy = definition.protectedReserve + definition.transferRate + 10;
    const carrier = simulation.addUnit(carrierType, "player", 100, 100, {
      energy: startingEnergy,
    });
    const ally = simulation.addUnit(allyType, "player", 110, 100, { energy: 10 });

    simulation.updateEnergyCarriers(1);

    assert.ok(Math.abs((startingEnergy - carrier.energy) - definition.transferRate) < 0.0001);
    assert.ok(Math.abs((ally.energy - 10) - definition.transferRate) < 0.0001);
  }
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

test("combat units automatically attack hostile structures in weapon range", () => {
  const simulation = new Simulation();
  const playerUnit = simulation.addUnit("scout_mech", "player", 100, 100);
  const enemyStructure = simulation.addStructure("generator", "enemy", 220, 100);
  const startingHp = enemyStructure.hp;

  simulation.tick(1 / 30);

  assert.equal(playerUnit.attackTargetId, enemyStructure.id);
  assert.equal(playerUnit.attackTargetMode, "automatic");
  assert.ok(enemyStructure.hp < startingHp);
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

  advance(simulation, 1.6);

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

test("each mech factory tier offers improved copies of the same four unit roles", () => {
  const factoryTypes = ["mech_factory_t1", "mech_factory_t2", "mech_factory_t3"];
  const expectedRoles = ["worker", "vanguard", "bulwark", "carrier"];
  const definitionsByTier = factoryTypes.map((factoryType, index) => {
    const tier = index + 1;
    const production = STRUCTURE_DEFINITIONS[factoryType].production;
    assert.equal(production.length, 4);
    const definitions = production.map((unitType) => UNIT_DEFINITIONS[unitType]);
    assert.deepEqual(definitions.map((definition) => definition.role), expectedRoles);
    assert.ok(definitions.every((definition) => definition.tier === tier));
    return Object.fromEntries(
      definitions.map((definition) => [definition.role, definition]),
    );
  });

  for (let tierIndex = 1; tierIndex < definitionsByTier.length; tierIndex += 1) {
    const previousTier = definitionsByTier[tierIndex - 1];
    const currentTier = definitionsByTier[tierIndex];
    for (const role of expectedRoles) {
      assert.ok(currentTier[role].maxHp > previousTier[role].maxHp);
      assert.ok(currentTier[role].maxEnergy > previousTier[role].maxEnergy);
      assert.ok(currentTier[role].metalCost > previousTier[role].metalCost);
    }
    assert.ok(currentTier.worker.buildRate > previousTier.worker.buildRate);
    assert.ok(currentTier.vanguard.attackDamage > previousTier.vanguard.attackDamage);
    assert.ok(currentTier.bulwark.attackDamage > previousTier.bulwark.attackDamage);
    assert.ok(currentTier.carrier.transferRate > previousTier.carrier.transferRate);
  }
});

test("factories only queue the four unit variants matching their tier", () => {
  const simulation = new Simulation();
  simulation.resources.player.metal = 10_000;
  const tierOneFactory = simulation.addStructure("mech_factory_t1", "player", 220, 100);
  const tierTwoFactory = simulation.addStructure("mech_factory_t2", "player", 520, 100);

  for (const unitType of STRUCTURE_DEFINITIONS.mech_factory_t1.production) {
    assert.equal(simulation.queueProduction(tierOneFactory.id, unitType), true);
  }
  assert.equal(tierOneFactory.productionQueue.length, 4);
  assert.equal(simulation.queueProduction(tierOneFactory.id, "scout_mech_t2"), false);

  for (const unitType of STRUCTURE_DEFINITIONS.mech_factory_t2.production) {
    assert.equal(simulation.queueProduction(tierTwoFactory.id, unitType), true);
  }
  assert.equal(tierTwoFactory.productionQueue.length, 4);
  assert.equal(simulation.queueProduction(tierTwoFactory.id, "scout_mech"), false);
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

test("unit roles and tiers reserve different provisional supply amounts", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(UNIT_DEFINITIONS).map(([type, definition]) => [type, definition.supplyCost]),
    ),
    {
      worker_drone_t1: 1,
      worker_drone_t2: 2,
      worker_drone_t3: 3,
      scout_mech: 4,
      scout_mech_t2: 6,
      scout_mech_t3: 8,
      assault_mech: 8,
      assault_mech_t2: 12,
      assault_mech_t3: 16,
      energy_carrier: 6,
      energy_carrier_t2: 9,
      energy_carrier_t3: 12,
      raider: 4,
    },
  );
});

test("production reserves supply and rejects orders beyond the massive base limit", () => {
  const simulation = new Simulation();
  simulation.resources.player.metal = 100_000;
  const factory = simulation.addStructure("mech_factory_t3", "player", 400, 400);
  const units = Array.from({ length: 61 }, (_, index) =>
    simulation.addUnit("assault_mech_t3", "player", 800 + index, 800),
  );

  assert.deepEqual(simulation.getSupplyState("player"), {
    used: 976,
    capacity: SIMULATION_RULES.baseSupplyCapacity,
    remaining: 24,
    unitSupply: 976,
    reservedSupply: 0,
  });
  assert.equal(simulation.queueProduction(factory.id, "assault_mech_t3"), true);
  assert.equal(simulation.getSupplyState("player").reservedSupply, 16);
  assert.equal(simulation.queueProduction(factory.id, "assault_mech_t3"), false);
  assert.match(simulation.lastProductionError, /supply limit/i);

  simulation.applyDamage(units[0], units[0].hp);

  assert.equal(simulation.queueProduction(factory.id, "assault_mech_t3"), true);
  assert.equal(simulation.getSupplyState("player").used, 992);
});

test("a powered Strategic Supply Complex adds and upgrades massive supply capacity", () => {
  const simulation = new Simulation();
  simulation.resources.player.metal = 10_000;
  const generator = simulation.addStructure("generator", "player", 100, 300);
  const complex = simulation.addStructure("supply_complex", "player", 300, 300);

  simulation.tick(1 / 30);

  assert.equal(complex.powered, true);
  assert.equal(simulation.getSupplyState("player").capacity, 6000);
  assert.equal(simulation.queueSupplyUpgrade(complex.id), true);
  assert.equal(simulation.resources.player.metal, 9200);

  advance(simulation, 25.2);

  assert.equal(complex.supplyLevel, 2);
  assert.equal(simulation.getSupplyState("player").capacity, 11_000);
  assert.equal(simulation.queueSupplyUpgrade(complex.id), true);

  advance(simulation, 40.2);

  assert.equal(complex.supplyLevel, 3);
  assert.equal(complex.supplyUpgrade, null);
  assert.equal(simulation.getSupplyState("player").capacity, 21_000);
  assert.equal(simulation.queueSupplyUpgrade(complex.id), false);
  assert.match(simulation.lastUpgradeError, /fully upgraded/i);

  simulation.applyDamage(generator, generator.hp);
  simulation.tick(1 / 30);

  assert.equal(complex.powered, false);
  assert.equal(simulation.getSupplyState("player").capacity, SIMULATION_RULES.baseSupplyCapacity);
});

test("the Strategic Supply Complex is larger than every production building", () => {
  const complex = structureFootprint("supply_complex");
  const tierThreeFactory = structureFootprint("mech_factory_t3");

  assert.deepEqual(STRUCTURE_DEFINITIONS.supply_complex.footprint, [8, 6]);
  assert.ok(complex.width > tierThreeFactory.width);
  assert.ok(complex.height > tierThreeFactory.height);
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

test("factories do not deploy a completed unit on top of another unit", () => {
  const simulation = new Simulation();
  const factory = simulation.addStructure("mech_factory_t1", "player", 400, 400);
  const workerDefinition = UNIT_DEFINITIONS.worker_drone_t1;
  const preferredSpawnX =
    factory.x +
    STRUCTURE_DEFINITIONS.mech_factory_t1.radius +
    workerDefinition.radius +
    SIMULATION_RULES.structureCollisionPadding +
    18;
  const blocker = simulation.addUnit("worker_drone_t1", "player", preferredSpawnX, factory.y);

  const spawn = simulation.findUnitSpawn(factory, "worker_drone_t1");
  const minimumDistance =
    workerDefinition.radius * 2 + SIMULATION_RULES.unitCollisionPadding;

  assert.ok(spawn);
  assert.ok(Math.hypot(spawn.x - blocker.x, spawn.y - blocker.y) >= minimumDistance);
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

test("powered sentry turrets automatically attack hostile structures", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  const turret = simulation.addStructure("sentry_turret", "player", 220, 100);
  const enemyStructure = simulation.addStructure("generator", "enemy", 350, 100);
  const startingHp = enemyStructure.hp;

  simulation.tick(0.25);

  assert.equal(turret.powered, true);
  assert.equal(turret.defenseTargetId, enemyStructure.id);
  assert.ok(enemyStructure.hp < startingHp);
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

test("full idle sentries do not prevent a new sentry from charging", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  simulation.addStructure("mech_factory_t1", "player", 100, 100);
  simulation.addStructure("metal_mine", "player", 100, 100);
  simulation.addStructure("metal_mine", "player", 100, 100);
  for (let relay = 0; relay < 8; relay += 1) {
    simulation.addStructure("power_tower", "player", 100, 100);
  }
  const firstFullTurret = simulation.addStructure("sentry_turret", "player", 100, 100);
  const secondFullTurret = simulation.addStructure("sentry_turret", "player", 100, 100);
  const newTurret = simulation.addStructure("sentry_turret", "player", 100, 100, {
    weaponEnergy: 0,
  });

  advance(simulation, 1);

  assert.equal(simulation.getStructurePowerDemandRate(firstFullTurret), 0);
  assert.equal(simulation.getStructurePowerDemandRate(secondFullTurret), 0);
  assert.equal(firstFullTurret.weaponEnergy, STRUCTURE_DEFINITIONS.sentry_turret.capacitorCapacity);
  assert.equal(secondFullTurret.weaponEnergy, STRUCTURE_DEFINITIONS.sentry_turret.capacitorCapacity);
  assert.ok(newTurret.weaponEnergy >= 2.9, "the grid's remaining output should charge the new turret");
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

test("both sides start with three workers, a Tier 1 factory, a generator, and a powered mine", () => {
  const simulation = Simulation.createFieldTest();

  for (const team of ["player", "enemy"]) {
    const units = simulation.units.filter((unit) => unit.alive && unit.team === team);
    const structures = simulation.structures.filter(
      (structure) => structure.alive && structure.team === team,
    );
    const generator = structures.find((structure) => structure.type === "generator");
    const mine = structures.find((structure) => structure.type === "metal_mine");
    assert.equal(units.length, 3);
    assert.ok(units.every((unit) => unit.type === "worker_drone_t1"));
    assert.deepEqual(
      structures.map((structure) => structure.type).sort(),
      ["generator", "mech_factory_t1", "metal_mine"],
    );
    assert.ok(generator);
    assert.ok(mine);
    assert.equal(mine.complete, true);
    assert.equal(mine.powered, true);
    assert.ok(simulation.metalDeposits.some((deposit) => deposit.id === mine.depositId));
    assert.ok(
      Math.hypot(mine.x - generator.x, mine.y - generator.y) <=
        STRUCTURE_DEFINITIONS.generator.powerRadius,
    );
  }

  const startingMetal = {
    player: simulation.resources.player.metal,
    enemy: simulation.resources.enemy.metal,
  };
  advance(simulation, 1);
  assert.ok(simulation.resources.player.metal > startingMetal.player);
  assert.ok(simulation.resources.enemy.metal > startingMetal.enemy);
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

test("a worker can leave the lane after completing a building beside another structure", () => {
  const simulation = new Simulation();
  simulation.resources.player.metal = 1000;
  simulation.addStructure("generator", "player", 170, 420);
  simulation.addStructure("mech_factory_t1", "player", 320, 520);
  const worker = simulation.addUnit("worker_drone_t1", "player", 235, 515);
  const project = simulation.startConstruction([worker.id], "generator", 320, 400);

  advance(simulation, 12);

  assert.equal(project.complete, true);
  assert.equal(worker.buildTargetId, null);
  const completionPosition = { x: worker.x, y: worker.y };

  simulation.commandMove([worker.id], 1200, 700);
  advance(simulation, 3);

  assert.ok(
    Math.hypot(worker.x - completionPosition.x, worker.y - completionPosition.y) > 100,
    "the worker should not oscillate between overlapping building collision shapes",
  );
});

test("workers can construct from a corner of a rectangular building footprint", () => {
  const simulation = new Simulation();
  const project = simulation.addStructure("mech_factory_t3", "player", 800, 450, {
    complete: false,
    constructionProgress: 0,
  });
  const worker = simulation.addUnit("worker_drone_t1", "player", 910, 540);
  simulation.commandBuild([worker.id], project.id);

  simulation.tick(1 / 30);

  assert.ok(project.constructionProgress > 0);
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
  simulation.addStructure("generator", "enemy", 2880, 800);
  const worker = simulation.addUnit("worker_drone_t1", "enemy", 2740, 800);

  simulation.tick(1 / 30);

  const battery = simulation.structures.find(
    (structure) => structure.alive && structure.team === "enemy" && structure.type === "battery",
  );
  assert.ok(battery);
  assert.notDeepEqual([battery.x, battery.y], [2740, 800]);
  assert.equal(battery.x % SIMULATION_RULES.buildingGridSize, 0);
  assert.equal(battery.y % SIMULATION_RULES.buildingGridSize, 0);
  assert.equal(
    simulation.isBuildSiteConnectedToPower("battery", "enemy", battery.x, battery.y),
    true,
  );
  assert.ok(
    Math.hypot(battery.x - worker.x, battery.y - worker.y) + 0.0001 >=
      STRUCTURE_DEFINITIONS.battery.radius +
        UNIT_DEFINITIONS.worker_drone_t1.radius +
        SIMULATION_RULES.structureCollisionPadding,
  );
});

test("enemy AI builds generation before spending metal on an unpowered consumer", () => {
  const simulation = new Simulation();
  simulation.aiThinkRemaining = 0;
  simulation.aiBuildIndex = 4;
  simulation.resources.enemy.metal = 1000;
  simulation.addUnit("worker_drone_t1", "enemy", 2300, 780);
  const startingMetal = simulation.resources.enemy.metal;

  simulation.tick(1 / 30);

  assert.equal(
    simulation.structures.some(
      (structure) => structure.alive && structure.team === "enemy" && structure.type === "charger",
    ),
    false,
  );
  assert.equal(simulation.aiBuildIndex, 4);
  assert.ok(
    simulation.structures.some(
      (structure) => structure.alive && structure.team === "enemy" && structure.type === "generator",
    ),
  );
  assert.equal(
    simulation.resources.enemy.metal,
    startingMetal - STRUCTURE_DEFINITIONS.generator.metalCost,
  );
});

test("enemy AI moves a planned relay onto the connected edge of its grid", () => {
  const simulation = new Simulation();
  simulation.aiThinkRemaining = 0;
  simulation.aiBuildIndex = 2;
  simulation.resources.enemy.metal = 1000;
  const generator = simulation.addStructure("generator", "enemy", 2880, 800);
  simulation.addUnit("worker_drone_t1", "enemy", 2800, 1000);

  simulation.tick(1 / 30);

  const relay = simulation.structures.find(
    (structure) => structure.alive && structure.team === "enemy" && structure.type === "power_tower",
  );
  assert.ok(relay);
  assert.notDeepEqual([relay.x, relay.y], [2500, 860]);
  assert.ok(
    Math.hypot(relay.x - generator.x, relay.y - generator.y) <=
      STRUCTURE_DEFINITIONS.generator.powerRadius + 0.0001,
  );
  assert.equal(
    simulation.isBuildSiteConnectedToPower("power_tower", "enemy", relay.x, relay.y),
    true,
  );
});

test("enemy AI places powered consumers inside its energized grid", () => {
  const simulation = new Simulation();
  simulation.aiThinkRemaining = 0;
  simulation.aiBuildIndex = 4;
  simulation.resources.enemy.metal = 1000;
  simulation.addStructure("generator", "enemy", 2880, 800);
  simulation.addUnit("worker_drone_t1", "enemy", 2800, 1000);

  simulation.tick(1 / 30);

  const charger = simulation.structures.find(
    (structure) => structure.alive && structure.team === "enemy" && structure.type === "charger",
  );
  assert.ok(charger);
  assert.equal(
    simulation.isBuildSiteConnectedToPower("charger", "enemy", charger.x, charger.y),
    true,
  );

  advance(simulation, 15);
  assert.equal(charger.complete, true);
  assert.equal(charger.connected, true);
  assert.equal(charger.powered, true);
});

test("enemy AI completes extra generation before projected demand exceeds supply", () => {
  const simulation = new Simulation();
  simulation.aiThinkRemaining = 0;
  simulation.aiBuildIndex = 4;
  simulation.resources.enemy.metal = 5000;
  simulation.addStructure("generator", "enemy", 2880, 800);
  simulation.addStructure("mech_factory_t1", "enemy", 2680, 920);
  simulation.addStructure("metal_mine", "enemy", 2920, 600);
  simulation.addStructure("power_tower", "enemy", 2640, 800);
  simulation.addUnit("worker_drone_t1", "enemy", 2500, 1000);

  assert.equal(simulation.needsAdditionalGeneration("enemy", "charger"), true);
  simulation.tick(1 / 30);

  const generators = simulation.structures.filter(
    (structure) => structure.alive && structure.team === "enemy" && structure.type === "generator",
  );
  assert.equal(generators.length, 2);
  assert.ok(generators.some((generator) => !generator.complete));
  assert.equal(
    simulation.structures.some(
      (structure) => structure.alive && structure.team === "enemy" && structure.type === "charger",
    ),
    false,
  );
  assert.equal(simulation.aiBuildIndex, 4);

  advance(simulation, 22);
  const charger = simulation.structures.find(
    (structure) => structure.alive && structure.team === "enemy" && structure.type === "charger",
  );
  assert.ok(generators.every((generator) => generator.complete));
  assert.ok(charger?.complete);
  assert.equal(charger.connected, true);
  assert.equal(charger.powered, true);
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
