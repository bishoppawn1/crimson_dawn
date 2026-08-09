import assert from "node:assert/strict";
import test from "node:test";

import {
  BUILD_DURATION_MULTIPLIER,
  BUILD_MENU,
  BUILD_MENU_BY_TIER,
  canWorkerTierBuildStructure,
  DEFAULT_MAP_ID,
  DRONE_DEFINITION,
  getNextStructureTierType,
  MAP_DEFINITIONS,
  resolveMatchMapId,
  SIMULATION_RULES,
  STRUCTURE_DEFINITIONS,
  TERRAIN_OBSTACLES,
  UNIT_DEFINITIONS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  powerCoverageBounds,
  structureFootprint,
} from "../src/data.js";
import { distance, Simulation } from "../src/simulation.js";
import {
  generateLobbyCode,
  isValidLobbyCode,
  normalizeLobbyCode,
} from "../src/multiplayer.js";
import {
  createMatchTeams,
  getMapsForPlayerCount,
  getMatchMap,
  getRandomMatchMap,
} from "../src/maps.js";
import {
  calculateMinimapLayout,
  minimapContains,
  minimapDepositMarkerStyle,
  minimapPoint,
  minimapViewport,
  minimapWorldPoint,
} from "../src/minimap.js";

function advance(simulation, seconds, step = 1 / 30) {
  const ticks = Math.ceil(seconds / step);
  for (let tick = 0; tick < ticks; tick += 1) simulation.tick(step);
}

function advanceToScheduledImpacts(simulation, step = 1 / 120) {
  if (simulation.pendingImpacts.length === 0) return;
  const latestImpactAt = Math.max(
    ...simulation.pendingImpacts.map((impact) => impact.impactAt),
  );
  advance(simulation, Math.max(step, latestImpactAt - simulation.time + step), step);
}

test("unit production and building construction use the global 4x duration scale", () => {
  assert.equal(BUILD_DURATION_MULTIPLIER, 4);
  assert.equal(UNIT_DEFINITIONS.worker_drone_t1.productionTime, 5 * BUILD_DURATION_MULTIPLIER);
  assert.equal(UNIT_DEFINITIONS.battle_tank.productionTime, 12 * BUILD_DURATION_MULTIPLIER);
  assert.equal(UNIT_DEFINITIONS.arsenal_colossus.productionTime, 48 * BUILD_DURATION_MULTIPLIER);
  assert.equal(STRUCTURE_DEFINITIONS.generator.buildTime, 8 * BUILD_DURATION_MULTIPLIER);
  assert.equal(STRUCTURE_DEFINITIONS.mech_factory_t1.buildTime, 12 * BUILD_DURATION_MULTIPLIER);
  assert.equal(STRUCTURE_DEFINITIONS.supply_complex.buildTime, 40 * BUILD_DURATION_MULTIPLIER);
  assert.equal(STRUCTURE_DEFINITIONS.experimental_factory.buildTime, 36 * BUILD_DURATION_MULTIPLIER);
});

test("the irreplaceable Command Headquarters provides economy and only Tier 1 workers", () => {
  const definition = STRUCTURE_DEFINITIONS.headquarters;
  assert.equal(definition.buildable, false);
  assert.equal(definition.headquarters, true);
  assert.equal(definition.metalRate, 4);
  assert.equal(definition.generationRate, 20);
  assert.deepEqual(definition.production, ["worker_drone_t1"]);
  assert.equal(canWorkerTierBuildStructure(3, "headquarters"), false);

  const simulation = new Simulation();
  const headquarters = simulation.addStructure("headquarters", "player", 200, 200);
  const startingMetal = simulation.resources.player.metal;
  simulation.refreshPowerState(1);

  assert.equal(simulation.resources.player.metal, startingMetal + definition.metalRate);
  assert.equal(simulation.getGenerationRate("player"), definition.generationRate);
  assert.equal(simulation.queueProduction(headquarters.id, "worker_drone_t1"), true);
  assert.equal(simulation.queueProduction(headquarters.id, "scout_mech"), false);
  simulation.refreshPowerState(1);
  assert.equal(
    simulation.getNetEnergyRate("player"),
    definition.generationRate - definition.productionPowerDemand,
  );
  advance(simulation, UNIT_DEFINITIONS.worker_drone_t1.productionTime + 0.2);
  assert.equal(headquarters.productionQueue.length, 0);
  assert.equal(
    simulation.units.filter((unit) => unit.type === "worker_drone_t1").length,
    1,
  );
});

test("the tactical minimap fits the whole battlefield and maps its viewport", () => {
  const layout = calculateMinimapLayout(1600, 900, 8560, 6280);
  const origin = minimapPoint(layout, 0, 0);
  const farCorner = minimapPoint(layout, 8560, 6280);

  assert.equal(origin.x, layout.mapLeft);
  assert.equal(origin.y, layout.mapTop);
  assert.ok(farCorner.x <= 1600 - 18);
  assert.ok(farCorner.y <= 900 - 18);
  assert.ok(layout.mapWidth <= 240);
  assert.ok(layout.mapHeight <= 160);

  const worldPoint = minimapWorldPoint(layout, minimapPoint(layout, 4280, 3140));
  assert.ok(Math.abs(worldPoint.x - 4280) < 0.001);
  assert.ok(Math.abs(worldPoint.y - 3140) < 0.001);
  assert.equal(minimapWorldPoint(layout, { x: 0, y: 0 }), null);
  assert.equal(minimapContains(layout, { x: layout.left + 1, y: layout.top + 1 }), true);

  const viewport = minimapViewport(layout, {
    left: 1000,
    right: 2600,
    top: 800,
    bottom: 1700,
  });
  assert.ok(Math.abs(viewport.width - 1600 * layout.scale) < 0.001);
  assert.ok(Math.abs(viewport.height - 900 * layout.scale) < 0.001);
});

test("worker tiers expose the requested inherited construction matrix", () => {
  for (const tier of [1, 2, 3]) {
    assert.ok(BUILD_MENU_BY_TIER[tier].length > 0);
    assert.ok(
      BUILD_MENU_BY_TIER[tier].every(
        (structureType) => STRUCTURE_DEFINITIONS[structureType].buildTier === tier,
      ),
    );
  }

  for (const structureType of BUILD_MENU_BY_TIER[1]) {
    assert.equal(canWorkerTierBuildStructure(1, structureType), true);
  }
  assert.equal(canWorkerTierBuildStructure(1, "mech_factory_t2"), true);
  assert.equal(canWorkerTierBuildStructure(1, "vehicle_factory_t2"), false);
  assert.equal(canWorkerTierBuildStructure(1, "air_factory_t2"), false);
  assert.equal(canWorkerTierBuildStructure(1, "generator_t2"), false);
  assert.equal(canWorkerTierBuildStructure(1, "mech_factory_t3"), false);

  for (const structureType of [...BUILD_MENU_BY_TIER[1], ...BUILD_MENU_BY_TIER[2]]) {
    assert.equal(canWorkerTierBuildStructure(2, structureType), true);
  }
  assert.equal(canWorkerTierBuildStructure(2, "mech_factory_t3"), true);
  assert.equal(canWorkerTierBuildStructure(2, "vehicle_factory_t3"), false);
  assert.equal(canWorkerTierBuildStructure(2, "air_factory_t3"), false);
  assert.equal(canWorkerTierBuildStructure(2, "generator_t3"), false);
  assert.equal(canWorkerTierBuildStructure(2, "experimental_factory"), false);

  for (const structureType of BUILD_MENU) {
    assert.equal(canWorkerTierBuildStructure(3, structureType), true);
  }
});

test("unit tester advantages apply only to the designated human team", () => {
  const simulation = Simulation.createFieldTest({
    enemyAiEnabled: true,
    playerCount: 2,
    testerTeams: ["player"],
  });
  const playerWorkers = simulation.units.filter(
    (unit) => unit.team === "player" && UNIT_DEFINITIONS[unit.type].workerTier,
  );
  const enemyWorkers = simulation.units.filter(
    (unit) => unit.team === "enemy" && UNIT_DEFINITIONS[unit.type].workerTier,
  );

  assert.equal(simulation.isTesterTeam("player"), true);
  assert.equal(simulation.isTesterTeam("enemy"), false);
  assert.ok(playerWorkers.every((worker) => worker.type === "worker_drone_t3"));
  assert.ok(enemyWorkers.every((worker) => worker.type === "worker_drone_t1"));
  assert.equal(simulation.resources.player.metal, SIMULATION_RULES.unitTesterResourceAmount);
  assert.equal(simulation.resources.enemy.metal, 520);
  assert.equal(simulation.getSupplyState("player").capacity, SIMULATION_RULES.unitTesterResourceAmount);
  assert.equal(simulation.getSupplyState("enemy").capacity, SIMULATION_RULES.baseSupplyCapacity);
});

test("unit tester construction completes immediately while AI construction stays normal", () => {
  const simulation = new Simulation({ testerTeams: ["player"], enemyAiEnabled: false });
  const playerWorker = simulation.addUnit("worker_drone_t1", "player", 120, 120);
  const enemyWorker = simulation.addUnit("worker_drone_t1", "enemy", 720, 120);
  const enemyMetalBefore = simulation.resources.enemy.metal;

  const playerStructure = simulation.startConstruction(
    [playerWorker.id],
    "generator_t3",
    320,
    320,
  );
  const enemyStructure = simulation.startConstruction(
    [enemyWorker.id],
    "generator",
    720,
    320,
  );

  assert.ok(playerStructure);
  assert.equal(playerStructure.complete, true);
  assert.equal(playerStructure.hp, STRUCTURE_DEFINITIONS.generator_t3.maxHp);
  assert.equal(playerStructure.powered, true);
  assert.equal(playerWorker.buildTargetId, null);
  assert.equal(simulation.resources.player.metal, SIMULATION_RULES.unitTesterResourceAmount);
  assert.ok(enemyStructure);
  assert.equal(enemyStructure.complete, false);
  assert.equal(enemyStructure.powered, false);
  assert.equal(
    simulation.resources.enemy.metal,
    enemyMetalBefore - STRUCTURE_DEFINITIONS.generator.metalCost,
  );
  assert.equal(enemyWorker.buildTargetId, enemyStructure.id);
});

test("unit tester factory orders deploy on the next simulation step without spending crystal", () => {
  const simulation = new Simulation({ testerTeams: ["player"], enemyAiEnabled: false });
  const factory = simulation.addStructure("mech_factory_t1", "player", 400, 400);
  const startingMetal = simulation.resources.player.metal;

  assert.equal(simulation.queueProduction(factory.id, "assault_mech"), true);
  assert.equal(factory.productionQueue.length, 1);
  assert.equal(
    factory.productionQueue[0].progress,
    UNIT_DEFINITIONS.assault_mech.productionTime,
  );
  assert.equal(simulation.resources.player.metal, startingMetal);

  simulation.tick(1 / 60);

  assert.equal(factory.productionQueue.length, 0);
  assert.equal(
    simulation.units.filter((unit) => unit.type === "assault_mech").length,
    1,
  );
});

test("unit tester team rules survive simulation snapshots", () => {
  const original = Simulation.createFieldTest({ testerTeams: ["player"] });
  const restored = Simulation.fromSnapshot(original.createSnapshot());

  assert.equal(restored.isTesterTeam("player"), true);
  assert.equal(restored.isTesterTeam("enemy"), false);
});

test("unit tester can instantly place completed buildings for an AI without funding it", () => {
  const simulation = new Simulation({ testerTeams: ["player"], enemyAiEnabled: false });
  const enemyMetalBefore = simulation.resources.enemy.metal;

  const generator = simulation.spawnTesterStructure(
    "player",
    "enemy",
    "generator_t3",
    400,
    400,
  );
  const remoteFactory = simulation.spawnTesterStructure(
    "player",
    "enemy",
    "mech_factory_t1",
    1200,
    400,
  );

  assert.ok(generator);
  assert.equal(generator.team, "enemy");
  assert.equal(generator.complete, true);
  assert.equal(generator.powered, true);
  assert.ok(remoteFactory);
  assert.equal(remoteFactory.team, "enemy");
  assert.equal(remoteFactory.complete, true);
  assert.equal(remoteFactory.powered, false, "spawned AI consumers still require normal power");
  assert.equal(simulation.resources.enemy.metal, enemyMetalBefore);
});

test("unit tester can place collision-safe AI units that retain ordinary ownership", () => {
  const simulation = new Simulation({ testerTeams: ["player"], enemyAiEnabled: false });
  const enemyMetalBefore = simulation.resources.enemy.metal;

  const unit = simulation.spawnTesterUnit("player", "enemy", "assault_mech", 600, 600);
  const overlappingUnit = simulation.spawnTesterUnit(
    "player",
    "enemy",
    "scout_mech",
    600,
    600,
  );

  assert.ok(unit);
  assert.equal(unit.team, "enemy");
  assert.equal(unit.energy, UNIT_DEFINITIONS.assault_mech.maxEnergy);
  assert.equal(overlappingUnit, null);
  assert.match(simulation.lastPlacementError, /cannot spawn/i);
  assert.equal(simulation.resources.enemy.metal, enemyMetalBefore);
});

test("enemy spawning is unavailable outside Unit Tester and cannot target the tester team", () => {
  const ordinary = new Simulation({ enemyAiEnabled: false });
  const tester = new Simulation({ testerTeams: ["player"], enemyAiEnabled: false });

  assert.equal(
    ordinary.spawnTesterStructure("player", "enemy", "generator", 400, 400),
    null,
  );
  assert.equal(
    ordinary.spawnTesterUnit("player", "enemy", "scout_mech", 500, 500),
    null,
  );
  assert.equal(
    tester.spawnTesterStructure("player", "player", "generator", 400, 400),
    null,
  );
  assert.equal(
    tester.spawnTesterUnit("player", "player", "scout_mech", 500, 500),
    null,
  );
});

test("construction authorization is enforced by the simulation", () => {
  const simulation = new Simulation();
  simulation.resources.player.metal = 10_000;
  const tierOneWorker = simulation.addUnit("worker_drone_t1", "player", 100, 100);
  const startingMetal = simulation.resources.player.metal;

  assert.equal(
    simulation.startConstruction([tierOneWorker.id], "vehicle_factory_t2", 400, 400),
    null,
  );
  assert.match(simulation.lastPlacementError, /Tier 2 Worker Drone/);
  assert.equal(simulation.resources.player.metal, startingMetal);

  const tierTwoMechFactory = simulation.startConstruction(
    [tierOneWorker.id],
    "mech_factory_t2",
    400,
    400,
  );
  assert.ok(tierTwoMechFactory);
  assert.equal(tierTwoMechFactory.type, "mech_factory_t2");

  const secondSimulation = new Simulation();
  secondSimulation.resources.player.metal = 10_000;
  const tierTwoWorker = secondSimulation.addUnit("worker_drone_t2", "player", 100, 100);
  assert.ok(
    secondSimulation.startConstruction(
      [tierTwoWorker.id],
      "mech_factory_t3",
      600,
      400,
    ),
  );
  assert.equal(
    secondSimulation.startConstruction(
      [tierTwoWorker.id],
      "experimental_factory",
      1000,
      400,
    ),
    null,
  );
});

test("production-building branches expose their requested tiers", () => {
  const expectedTiers = {
    mech: [1, 2, 3],
    vehicle: [1, 2, 3],
    air: [2, 3],
  };
  for (const [branch, expected] of Object.entries(expectedTiers)) {
    const tiers = Object.values(STRUCTURE_DEFINITIONS)
      .filter((definition) => definition.factoryBranch === branch)
      .map((definition) => definition.tier)
      .sort();
    assert.deepEqual(tiers, expected);
  }
  assert.equal(STRUCTURE_DEFINITIONS.experimental_factory.buildTier, 3);
  assert.equal(STRUCTURE_DEFINITIONS.experimental_factory.minimumWorkerTier, 3);
});

test("experimental factory exposes three distinct strategic units", () => {
  const roster = STRUCTURE_DEFINITIONS.experimental_factory.production;
  assert.deepEqual(roster, [
    "arsenal_colossus",
    "hexapod_landship",
    "zenith_doughnut",
  ]);

  const colossus = UNIT_DEFINITIONS.arsenal_colossus;
  assert.equal(colossus.weaponCount, 8);
  assert.ok(colossus.salvoCount > 1);
  assert.equal(colossus.unitDomain, "experimental");

  const landship = UNIT_DEFINITIONS.hexapod_landship;
  assert.equal(landship.legCount, 6);
  assert.equal(landship.weaponCount, 3);
  assert.equal(landship.weaponSystems.length, landship.weaponCount);
  assert.equal(
    landship.weaponSystems.reduce((total, weapon) => total + weapon.attackDamage, 0),
    landship.attackDamage,
  );
  assert.equal(
    landship.weaponSystems.reduce((total, weapon) => total + weapon.attackEnergy, 0),
    landship.attackEnergy,
  );
  assert.equal(landship.stridesOverStructures, true);
  assert.equal(landship.movementLayer, "ground");

  const doughnut = UNIT_DEFINITIONS.zenith_doughnut;
  assert.equal(doughnut.movementLayer, "air");
  assert.equal(doughnut.groundAttackOnly, true);
  assert.equal(doughnut.attackRange, 0);
  assert.ok(doughnut.underbellyBeamRadius > 0);
  assert.equal(doughnut.weaponSystems.length, 2);
  assert.ok(doughnut.weaponSystems.every((weapon) => weapon.targetLayer === "air"));
  assert.ok(doughnut.weaponSystems.every((weapon) => weapon.airDamageMultiplier === 2));
  assert.equal(doughnut.speed, 375);
  assert.match(doughnut.roleDescription, /anti-air batteries/);

  for (const unitType of roster) {
    const definition = UNIT_DEFINITIONS[unitType];
    assert.equal(definition.tier, 3);
    assert.ok(definition.metalCost >= 1_800);
    assert.ok(definition.supplyCost >= 70);
  }
});

test("experimental factory accepts paid production orders", () => {
  const simulation = new Simulation();
  simulation.resources.player.metal = 10_000;
  const factory = simulation.addStructure("experimental_factory", "player", 400, 300);

  assert.equal(simulation.queueProduction(factory.id, "arsenal_colossus"), true);
  assert.equal(factory.productionQueue[0].unitType, "arsenal_colossus");
  assert.equal(
    simulation.resources.player.metal,
    10_000 - UNIT_DEFINITIONS.arsenal_colossus.metalCost,
  );
});

test("hexapod landship strides through structures but still respects terrain", () => {
  const simulation = new Simulation({
    width: 900,
    height: 600,
    terrain: [{ id: "ridge", x: 740, y: 300, width: 80, height: 320 }],
    enemyAiEnabled: false,
  });
  simulation.addStructure("mech_factory_t1", "player", 430, 300);
  const landship = simulation.addUnit("hexapod_landship", "player", 160, 300);

  assert.equal(simulation.commandMove([landship.id], 650, 300), 1);
  advance(simulation, 22);
  assert.ok(landship.x > 600, `expected landship beyond factory, got x=${landship.x}`);

  simulation.commandMove([landship.id], 740, 300);
  assert.notDeepEqual(landship.moveTarget, { x: 740, y: 300 });
});

test("hexapod landship shells deal damage on impact instead of before firing", () => {
  const simulation = new Simulation({ enemyAiEnabled: false });
  const landship = simulation.addUnit("hexapod_landship", "player", 100, 300);
  const target = simulation.addUnit("scout_mech", "enemy", 400, 300);
  const startingHp = target.hp;

  assert.equal(simulation.commandAttack([landship.id], target.id), 1);
  simulation.tick(1 / 30);

  const attackEvent = simulation.events.find((event) => event.type === "attack");
  assert.ok(attackEvent.impactDelay > 0);
  assert.equal(target.hp, startingHp);
  assert.equal(target.alive, true);
  assert.equal(simulation.pendingImpacts.length, 3);
  assert.deepEqual(
    simulation.events
      .filter((event) => event.type === "attack")
      .map((event) => event.weaponSystemIndex)
      .sort(),
    [0, 1, 2],
  );

  const restored = Simulation.fromSnapshot(JSON.parse(JSON.stringify(simulation.createSnapshot())));
  const restoredTarget = restored.getUnit(target.id);
  advance(restored, attackEvent.impactDelay - 0.02, 0.01);
  assert.equal(restoredTarget.hp, startingHp);
  assert.equal(restoredTarget.alive, true);

  restored.tick(0.03);
  assert.equal(restoredTarget.hp, 0);
  assert.equal(restoredTarget.alive, false);
  assert.equal(restored.pendingImpacts.length, 0);
});

test("hexapod landship weapon systems independently engage different targets", () => {
  const simulation = new Simulation({ width: 1000, height: 800, enemyAiEnabled: false });
  const landship = simulation.addUnit("hexapod_landship", "player", 400, 400);
  const targets = [
    simulation.addStructure("generator", "enemy", 400, 100),
    simulation.addStructure("generator", "enemy", 150, 400),
    simulation.addStructure("generator", "enemy", 650, 400),
  ];
  const startingEnergy = landship.energy;

  assert.equal(simulation.commandAttack([landship.id], targets[0].id), 1);
  simulation.tick(1 / 30);

  const attackEvents = simulation.events.filter(
    (event) => event.type === "attack" && event.sourceId === landship.id,
  );
  assert.equal(attackEvents.length, 3);
  assert.equal(new Set(attackEvents.map((event) => event.targetId)).size, 3);
  assert.deepEqual(
    landship.weaponSystems.map((weaponSystem) => weaponSystem.targetId).sort(),
    targets.map((target) => target.id).sort(),
  );
  assert.deepEqual(
    landship.weaponSystems.map((weaponSystem) => weaponSystem.cooldownRemaining),
    UNIT_DEFINITIONS.hexapod_landship.weaponSystems.map((weapon) => weapon.attackCooldown),
  );
  assert.equal(startingEnergy - landship.energy, UNIT_DEFINITIONS.hexapod_landship.attackEnergy);

  const restored = Simulation.fromSnapshot(JSON.parse(JSON.stringify(simulation.createSnapshot())));
  assert.deepEqual(restored.getUnit(landship.id).weaponSystems, landship.weaponSystems);
  advanceToScheduledImpacts(restored);
  assert.ok(
    targets.every(
      (target) => restored.getStructure(target.id).hp < STRUCTURE_DEFINITIONS.generator.maxHp,
    ),
  );
});

test("Zenith Doughnut burns ground targets directly beneath it while moving", () => {
  const simulation = new Simulation({ enemyAiEnabled: false });
  const doughnut = simulation.addUnit("zenith_doughnut", "player", 300, 300);
  const enemyAircraft = simulation.addUnit("interceptor_t2", "enemy", 380, 300);
  const enemyStructure = simulation.addStructure("generator", "enemy", 330, 300);
  const distantGroundStructure = simulation.addStructure("generator", "enemy", 430, 300);
  const aircraftStartingHp = enemyAircraft.hp;
  const structureStartingHp = enemyStructure.hp;
  const distantStructureStartingHp = distantGroundStructure.hp;
  const startingEnergy = doughnut.energy;

  assert.equal(simulation.commandAttack([doughnut.id], enemyAircraft.id), 1);
  assert.equal(simulation.commandAttack([doughnut.id], enemyStructure.id), 1);
  assert.deepEqual(doughnut.moveTarget, {
    x: enemyStructure.x,
    y: enemyStructure.y,
  });

  simulation.tick(1 / 30);

  const definition = UNIT_DEFINITIONS.zenith_doughnut;
  assert.ok(doughnut.x > 300, "the aircraft should keep moving while its beam fires");
  assert.equal(doughnut.attackTargetId, enemyStructure.id);
  assert.equal(doughnut.attackTargetMode, "explicit");
  assert.equal(doughnut.underbellyBeamActive, true);
  assert.deepEqual(
    new Set(doughnut.underbellyBeamTargetIds),
    new Set([enemyStructure.id]),
  );
  assert.ok(enemyStructure.hp < structureStartingHp);
  assert.equal(distantGroundStructure.hp, distantStructureStartingHp);
  assert.equal(enemyAircraft.hp, aircraftStartingHp);
  assert.ok(
    doughnut.energy <= startingEnergy - definition.underbellyBeamEnergyPerSecond / 30,
  );

  const groundTargetSimulation = new Simulation({ enemyAiEnabled: false });
  const secondDoughnut = groundTargetSimulation.addUnit(
    "zenith_doughnut",
    "player",
    300,
    300,
  );
  const enemyUnit = groundTargetSimulation.addUnit(
    "worker_drone_t1",
    "enemy",
    320,
    300,
  );
  const aircraftUnderBeam = groundTargetSimulation.addUnit(
    "interceptor_t2",
    "enemy",
    300,
    300,
  );
  const unitStartingHp = enemyUnit.hp;
  const aircraftUnderBeamStartingHp = aircraftUnderBeam.hp;

  groundTargetSimulation.tick(1 / 30);

  assert.equal(secondDoughnut.underbellyBeamActive, true);
  assert.ok(enemyUnit.hp < unitStartingHp);
  assert.equal(aircraftUnderBeam.hp, aircraftUnderBeamStartingHp);
});

test("Zenith Doughnut beam pursuit only auto-acquires nearby ground targets", () => {
  const simulation = new Simulation({ width: 1600, height: 1000, enemyAiEnabled: false });
  const doughnut = simulation.addUnit("zenith_doughnut", "player", 200, 500);
  const acquisitionRange = UNIT_DEFINITIONS.zenith_doughnut.automaticTargetAcquisitionRange;
  const nearbyAircraft = simulation.addUnit("interceptor_t2", "enemy", 260, 500, {
    holdPosition: true,
  });
  const firstTarget = simulation.addStructure("generator", "enemy", 560, 500, { hp: 10 });
  const secondTarget = simulation.addStructure("generator", "enemy", 900, 500);
  const aircraftStartingHp = nearbyAircraft.hp;

  simulation.tick(1 / 30);

  assert.equal(doughnut.attackTargetId, firstTarget.id);
  assert.equal(doughnut.attackTargetMode, "automatic");
  assert.equal(doughnut.moveMode, "pursuit");
  assert.ok(doughnut.x > 200, "the idle aircraft should approach a locally detected target");
  assert.equal(nearbyAircraft.hp, aircraftStartingHp, "the ground beam must ignore aircraft");

  advance(simulation, 3);

  assert.equal(firstTarget.alive, false, "the aircraft should fly into beam range and attack");
  assert.equal(doughnut.attackTargetId, secondTarget.id);
  assert.equal(doughnut.attackTargetMode, "automatic");

  const distantSimulation = new Simulation({ width: 1600, height: 1000, enemyAiEnabled: false });
  const idleDoughnut = distantSimulation.addUnit("zenith_doughnut", "player", 200, 500);
  const distantTarget = distantSimulation.addStructure(
    "generator",
    "enemy",
    200 + acquisitionRange + STRUCTURE_DEFINITIONS.generator.radius + 40,
    500,
  );

  distantSimulation.tick(1 / 30);

  assert.equal(idleDoughnut.attackTargetId, null);
  assert.equal(idleDoughnut.moveTarget, null);
  assert.equal(idleDoughnut.x, 200, "a distant enemy must not trigger cross-map pursuit");
  assert.equal(distantTarget.hp, STRUCTURE_DEFINITIONS.generator.maxHp);
});

test("Zenith Doughnut AA batteries independently fire on aircraft during ground-beam attacks", () => {
  const simulation = new Simulation({ width: 1200, height: 800, enemyAiEnabled: false });
  const doughnut = simulation.addUnit("zenith_doughnut", "player", 300, 400, {
    holdPosition: true,
  });
  const groundTarget = simulation.addUnit("worker_drone_t1", "enemy", 300, 400, {
    holdPosition: true,
  });
  const aircraft = [
    simulation.addUnit("gunship_t2", "enemy", 500, 360, { holdPosition: true }),
    simulation.addUnit("gunship_t2", "enemy", 520, 460, { holdPosition: true }),
  ];
  const groundStartingHp = groundTarget.hp;
  const aircraftStartingHp = aircraft.map((target) => target.hp);
  const startingEnergy = doughnut.energy;
  const definition = UNIT_DEFINITIONS.zenith_doughnut;

  simulation.tick(1 / 30);

  assert.equal(doughnut.underbellyBeamActive, true);
  assert.ok(groundTarget.hp < groundStartingHp);
  assert.deepEqual(
    new Set(doughnut.weaponSystems.map((weapon) => weapon.targetId)),
    new Set(aircraft.map((target) => target.id)),
  );
  const attackEvents = simulation.events.filter(
    (event) => event.type === "attack" && event.sourceId === doughnut.id,
  );
  assert.deepEqual(
    attackEvents.map((event) => event.weaponSystemIndex).sort(),
    [0, 1],
  );
  assert.ok(attackEvents.every((event) => event.impactDelay > 0 && event.tracksTarget));
  assert.deepEqual(aircraft.map((target) => target.hp), aircraftStartingHp);
  assert.ok(
    doughnut.energy <=
      startingEnergy - definition.underbellyBeamEnergyPerSecond / 30 - 18,
  );

  advanceToScheduledImpacts(simulation);
  for (const [index, target] of aircraft.entries()) {
    assert.equal(
      target.hp,
      aircraftStartingHp[index] -
        definition.weaponSystems[index].attackDamage *
          definition.weaponSystems[index].airDamageMultiplier,
    );
  }
});

test("explicit Zenith Doughnut anti-air orders pursue aircraft into battery range", () => {
  const simulation = new Simulation({ width: 1400, height: 800, enemyAiEnabled: false });
  const doughnut = simulation.addUnit("zenith_doughnut", "player", 200, 400);
  const aircraft = simulation.addUnit("gunship_t2", "enemy", 800, 400, {
    holdPosition: true,
  });

  assert.equal(simulation.commandAttack([doughnut.id], aircraft.id), 1);
  simulation.tick(1 / 30);

  assert.equal(doughnut.attackTargetId, aircraft.id);
  assert.equal(doughnut.attackTargetMode, "explicit");
  assert.ok(doughnut.x > 200);
  assert.equal(doughnut.underbellyBeamActive, false);
});

test("Zenith Doughnuts hover directly over a locally acquired target", () => {
  const simulation = new Simulation({ width: 1200, height: 800, enemyAiEnabled: false });
  const doughnut = simulation.addUnit("zenith_doughnut", "player", 200, 400);
  const target = simulation.addStructure("generator", "enemy", 500, 400);

  advance(simulation, 1.5);

  assert.equal(doughnut.attackTargetId, target.id);
  assert.equal(doughnut.moveMode, "pursuit");
  assert.ok(Math.hypot(doughnut.x - target.x, doughnut.y - target.y) <= 4.01);
  assert.equal(doughnut.underbellyBeamActive, true);
  assert.ok(target.hp < STRUCTURE_DEFINITIONS.generator.maxHp);
});

test("explicit orders take priority over automatic Zenith pursuit", () => {
  const simulation = new Simulation({ width: 1600, height: 1000, enemyAiEnabled: false });
  const doughnut = simulation.addUnit("zenith_doughnut", "player", 200, 500);
  const nearerTarget = simulation.addStructure("generator", "enemy", 700, 500);
  const explicitTarget = simulation.addStructure("generator", "enemy", 1200, 500);

  assert.equal(simulation.commandAttack([doughnut.id], explicitTarget.id), 1);
  simulation.tick(1 / 30);
  assert.equal(doughnut.attackTargetId, explicitTarget.id);
  assert.equal(doughnut.attackTargetMode, "explicit");
  assert.ok(doughnut.x > 200);

  assert.equal(simulation.commandMove([doughnut.id], 200, 200), 1);
  simulation.tick(1 / 30);
  assert.equal(doughnut.attackTargetId, null);
  assert.equal(doughnut.moveMode, "normal");
  assert.notEqual(nearerTarget.id, doughnut.attackTargetId);

  assert.equal(simulation.commandMove([doughnut.id], 400, 800, { force: true }), 1);
  simulation.tick(1 / 30);
  assert.equal(doughnut.attackTargetId, null);
  assert.equal(doughnut.moveMode, "force");

  assert.equal(simulation.commandStop([doughnut.id], true), 1);
  simulation.tick(1 / 30);
  assert.equal(doughnut.attackTargetId, null);
  assert.equal(doughnut.moveTarget, null);
});

test("airborne Zenith Doughnuts do not push ground units out of their beam", () => {
  const simulation = new Simulation({ enemyAiEnabled: false });
  const doughnut = simulation.addUnit("zenith_doughnut", "player", 300, 300, {
    holdPosition: true,
  });
  const groundUnit = simulation.addUnit("worker_drone_t1", "enemy", 300, 300, {
    holdPosition: true,
  });
  const startingGroundPosition = { x: groundUnit.x, y: groundUnit.y };
  const startingHp = groundUnit.hp;

  simulation.tick(1 / 30);

  assert.deepEqual(
    { x: groundUnit.x, y: groundUnit.y },
    startingGroundPosition,
    "a ground unit should remain beneath an aircraft on the separate air layer",
  );
  assert.equal(doughnut.underbellyBeamActive, true);
  assert.ok(groundUnit.hp < startingHp);
});

test("higher-tier building variants retain their family behavior", () => {
  const simulation = new Simulation();
  const generator = simulation.addStructure("generator_t2", "player", 100, 100);
  const mine = simulation.addStructure("metal_mine_t2", "player", 220, 100);
  const yard = simulation.addStructure("salvage_yard_t2", "player", 320, 220);
  const turret = simulation.addStructure("sentry_turret_t2", "player", 300, 100);
  const enemy = simulation.addStructure("generator", "enemy", 480, 100);
  const startingMetal = simulation.resources.player.metal;
  const enemyStartingHp = enemy.hp;

  advance(simulation, 1);

  assert.equal(simulation.getGenerationRate("player"), generator.type === "generator_t2" ? 25 : 0);
  assert.equal(mine.powered, true);
  assert.ok(simulation.resources.player.metal >= startingMetal + 7.99);
  assert.equal(yard.drones.length, 4);
  assert.ok(enemy.hp < enemyStartingHp);
  assert.ok(turret.weaponEnergy < STRUCTURE_DEFINITIONS.sentry_turret_t2.capacitorCapacity);
});

test("every higher-tier infrastructure building improves its defining function", () => {
  const increasingStatsByFamily = {
    generator: ["generationRate", "powerRadius", "storageCapacity"],
    battery: ["storageCapacity", "chargeRate", "dischargeRate", "powerRadius"],
    power_tower: ["relayRadius", "storageCapacity", "chargeRate", "dischargeRate"],
    charger: ["chargeRadius", "chargeRate"],
    metal_mine: ["metalRate"],
    sentry_turret: ["attackRange", "attackDamage", "capacitorCapacity", "capacitorChargeRate"],
    shield_turret: ["shieldRadius", "shieldCapacity", "shieldRegenRate"],
    mortar_turret: ["attackRange", "attackDamage", "capacitorCapacity", "capacitorChargeRate"],
    flak_turret: ["attackRange", "attackDamage", "capacitorCapacity", "capacitorChargeRate"],
    salvage_yard: ["droneCount"],
  };

  for (const [family, stats] of Object.entries(increasingStatsByFamily)) {
    const tiers = [
      STRUCTURE_DEFINITIONS[family],
      STRUCTURE_DEFINITIONS[`${family}_t2`],
      STRUCTURE_DEFINITIONS[`${family}_t3`],
    ];
    for (const stat of stats) {
      assert.ok(tiers[1][stat] > tiers[0][stat], `${family} Tier 2 must improve ${stat}`);
      assert.ok(tiers[2][stat] > tiers[1][stat], `${family} Tier 3 must improve ${stat}`);
    }
  }

  assert.ok(
    STRUCTURE_DEFINITIONS.salvage_yard_t2.droneReplacementTime <
      STRUCTURE_DEFINITIONS.salvage_yard.droneReplacementTime,
  );
  assert.ok(
    STRUCTURE_DEFINITIONS.salvage_yard_t3.droneReplacementTime <
      STRUCTURE_DEFINITIONS.salvage_yard_t2.droneReplacementTime,
  );
});

test("higher-tier sentries deal more damage and reach targets that Tier 1 cannot", () => {
  function fireOnce(type, separation) {
    const simulation = new Simulation();
    const turret = simulation.addStructure(type, "player", 300, 300, { powered: true });
    const target = simulation.addStructure("generator", "enemy", 300 + separation, 300);
    const startingHp = target.hp;
    simulation.updateStaticDefenses(0.25);
    advanceToScheduledImpacts(simulation);
    return { damage: startingHp - target.hp, turret };
  }

  const closeRangeDamage = ["sentry_turret", "sentry_turret_t2", "sentry_turret_t3"]
    .map((type) => fireOnce(type, 180).damage);
  assert.ok(closeRangeDamage[1] > closeRangeDamage[0]);
  assert.ok(closeRangeDamage[2] > closeRangeDamage[1]);

  assert.equal(fireOnce("sentry_turret", 220).damage, 0);
  assert.ok(fireOnce("sentry_turret_t2", 220).damage > 0);
  assert.ok(fireOnce("sentry_turret_t3", 300).damage > 0);
});

test("sentry turrets use the strengthened weapon profiles", () => {
  assert.deepEqual(
    ["sentry_turret", "sentry_turret_t2", "sentry_turret_t3"].map((type) => {
      const definition = STRUCTURE_DEFINITIONS[type];
      return [definition.attackDamage, definition.attackRange, definition.attackCooldown];
    }),
    [
      [18, 185, 0.75],
      [34, 265, 0.68],
      [60, 360, 0.55],
    ],
  );
});

test("mortar turrets enforce minimum and maximum range", () => {
  const closeSimulation = new Simulation({ enemyAiEnabled: false });
  const closeMortar = closeSimulation.addStructure("mortar_turret", "player", 300, 300, {
    powered: true,
  });
  const closeTarget = closeSimulation.addUnit("raider", "enemy", 400, 300);
  const closeStartingHp = closeTarget.hp;

  closeSimulation.updateStaticDefenses(0.25);

  assert.equal(closeTarget.hp, closeStartingHp);
  assert.equal(closeMortar.defenseTargetId, null);
  assert.equal(closeMortar.defenseStatus, "target too close");

  const rangedSimulation = new Simulation({ enemyAiEnabled: false });
  const rangedMortar = rangedSimulation.addStructure("mortar_turret", "player", 300, 300, {
    powered: true,
  });
  const validTarget = rangedSimulation.addUnit("raider", "enemy", 650, 300);
  const outsideTarget = rangedSimulation.addUnit("raider", "enemy", 760, 300);
  const validStartingHp = validTarget.hp;
  const outsideStartingHp = outsideTarget.hp;

  rangedSimulation.updateStaticDefenses(0.25);

  assert.equal(rangedMortar.defenseTargetId, validTarget.id);
  assert.equal(validTarget.hp, validStartingHp);
  advanceToScheduledImpacts(rangedSimulation);
  assert.ok(validTarget.hp < validStartingHp);
  assert.equal(outsideTarget.hp, outsideStartingHp);
});

test("workers can build and upgrade every mortar turret tier", () => {
  assert.ok(BUILD_MENU_BY_TIER[1].includes("mortar_turret"));
  assert.ok(BUILD_MENU_BY_TIER[2].includes("mortar_turret_t2"));
  assert.ok(BUILD_MENU_BY_TIER[3].includes("mortar_turret_t3"));
  assert.equal(getNextStructureTierType("mortar_turret"), "mortar_turret_t2");
  assert.equal(getNextStructureTierType("mortar_turret_t2"), "mortar_turret_t3");
  assert.equal(getNextStructureTierType("mortar_turret_t3"), null);
});

test("higher-tier factories have progressively faster production throughput", () => {
  assert.equal(STRUCTURE_DEFINITIONS.mech_factory_t1.productionRate, 1);
  assert.ok(
    STRUCTURE_DEFINITIONS.mech_factory_t2.productionRate >
      STRUCTURE_DEFINITIONS.mech_factory_t1.productionRate,
  );
  assert.ok(
    STRUCTURE_DEFINITIONS.mech_factory_t3.productionRate >
      STRUCTURE_DEFINITIONS.mech_factory_t2.productionRate,
  );

  const simulation = new Simulation();
  simulation.resources.player.metal = 10_000;
  const tierOne = simulation.addStructure("mech_factory_t1", "player", 200, 200, { powered: true });
  const tierThree = simulation.addStructure("mech_factory_t3", "player", 600, 200, { powered: true });
  simulation.queueProduction(tierOne.id, "scout_mech");
  simulation.queueProduction(tierThree.id, "scout_mech_t3");
  simulation.updateProduction(1);

  assert.equal(tierOne.productionQueue[0].progress, 1);
  assert.equal(tierThree.productionQueue[0].progress, 1.5);
});

test("workers provide reduced tier-specific factory assistance at an added grid cost", () => {
  assert.deepEqual(
    ["worker_drone_t1", "worker_drone_t2", "worker_drone_t3"].map((type) =>
      UNIT_DEFINITIONS[type].productionAssistRate,
    ),
    [
      0.25,
      0.4,
      0.65,
    ],
  );
  const simulation = new Simulation();
  simulation.resources.player.metal = 10_000;
  simulation.addStructure("generator", "player", 80, 200);
  const factory = simulation.addStructure("mech_factory_t1", "player", 240, 200);
  const tierOneWorker = simulation.addUnit("worker_drone_t1", "player", 304, 200);
  const tierThreeWorker = simulation.addUnit("worker_drone_t3", "player", 240, 264);
  simulation.refreshPowerState(0);
  simulation.queueProduction(factory.id, "scout_mech");

  assert.equal(
    simulation.commandAssistProduction([tierOneWorker.id, tierThreeWorker.id], factory.id),
    2,
  );
  assert.equal(tierOneWorker.productionAssistTargetId, factory.id);
  assert.equal(tierThreeWorker.productionAssistTargetId, factory.id);
  assert.deepEqual(simulation.getFactoryProductionAssistState(factory.id), {
    workerCount: 2,
    productionRate:
      UNIT_DEFINITIONS.worker_drone_t1.productionAssistRate +
      UNIT_DEFINITIONS.worker_drone_t3.productionAssistRate,
    powerDemand: 9 * (0.2 + 0.21),
  });
  assert.ok(
    UNIT_DEFINITIONS.worker_drone_t1.productionAssistRate <
      UNIT_DEFINITIONS.worker_drone_t1.buildRate,
  );
  assert.equal(
    simulation.getStructurePowerDemandRate(factory),
    STRUCTURE_DEFINITIONS.mech_factory_t1.powerDemand +
      STRUCTURE_DEFINITIONS.mech_factory_t1.productionPowerDemand +
      9 * (0.2 + 0.21),
  );

  simulation.updateProduction(1);

  assert.equal(
    factory.productionQueue[0].progress,
    STRUCTURE_DEFINITIONS.mech_factory_t1.productionRate +
      UNIT_DEFINITIONS.worker_drone_t1.productionAssistRate +
      UNIT_DEFINITIONS.worker_drone_t3.productionAssistRate,
  );
});

test("worker assistance power draw increases one percentage point per worker", () => {
  const simulation = new Simulation();
  simulation.resources.player.metal = 10_000;
  simulation.addStructure("generator", "player", 80, 200);
  const factory = simulation.addStructure("mech_factory_t1", "player", 240, 200);
  const workers = Array.from({ length: 7 }, (_, index) =>
    simulation.addUnit("worker_drone_t1", "player", 304, 200 + index),
  );
  simulation.refreshPowerState(0);
  simulation.queueProduction(factory.id, "scout_mech");

  assert.equal(
    simulation.commandAssistProduction(workers.map((worker) => worker.id), factory.id),
    workers.length,
  );
  const expectedRatio = [0.2, 0.21, 0.22, 0.23, 0.24, 0.25, 0.26]
    .reduce((total, ratio) => total + ratio, 0);
  assert.equal(
    simulation.getFactoryProductionAssistState(factory.id).powerDemand,
    9 * expectedRatio,
  );
});

test("factory production pauses when its grid cannot cover worker assistance demand", () => {
  const simulation = new Simulation();
  simulation.resources.player.metal = 10_000;
  simulation.addStructure("generator", "player", 80, 200, { storedEnergy: 0 });
  const factory = simulation.addStructure("mech_factory_t1", "player", 240, 200);
  const workers = Array.from({ length: 7 }, (_, index) =>
    simulation.addUnit("worker_drone_t1", "player", 304, 200 + index),
  );
  simulation.refreshPowerState(0);
  simulation.queueProduction(factory.id, "scout_mech");
  simulation.commandAssistProduction(workers.map((worker) => worker.id), factory.id);

  simulation.refreshPowerState(1);
  simulation.updateProduction(1);

  assert.equal(factory.powered, false);
  assert.equal(factory.powerStatus, "no_energy");
  assert.equal(factory.productionQueue[0].progress, 0);
  assert.equal(simulation.getFactoryProductionAssistState(factory.id).workerCount, workers.length);

  simulation.commandStop(workers.map((worker) => worker.id));
  assert.deepEqual(simulation.getFactoryProductionAssistState(factory.id), {
    workerCount: 0,
    productionRate: 0,
    powerDemand: 0,
  });
  simulation.refreshPowerState(1);
  simulation.updateProduction(1);

  assert.equal(factory.powered, true);
  assert.equal(
    factory.productionQueue[0].progress,
    STRUCTURE_DEFINITIONS.mech_factory_t1.productionRate,
  );
});

test("production assistance requires an active friendly factory and overrides worker combat", () => {
  const simulation = new Simulation();
  simulation.resources.player.metal = 10_000;
  simulation.addStructure("generator", "player", 80, 200);
  simulation.addStructure("generator", "player", 80, 280);
  const factory = simulation.addStructure("mech_factory_t1", "player", 240, 200);
  const idleFactory = simulation.addStructure("vehicle_factory_t1", "player", 240, 400, {
    powered: true,
  });
  const worker = simulation.addUnit("worker_drone_t1", "player", 304, 200);
  const combatUnit = simulation.addUnit("scout_mech", "player", 304, 260);
  const enemy = simulation.addUnit("worker_drone_t1", "enemy", 304, 250);
  simulation.refreshPowerState(0);

  assert.equal(simulation.commandAssistProduction([worker.id], idleFactory.id), 0);
  simulation.queueProduction(factory.id, "scout_mech");
  assert.equal(simulation.commandAssistProduction([combatUnit.id], factory.id), 0);
  assert.equal(simulation.commandAssistProduction([worker.id], factory.id), 1);

  simulation.applyDamage(worker, 1, enemy);
  simulation.tick(0.25);

  assert.equal(worker.attackTargetId, null);
  assert.equal(enemy.hp, UNIT_DEFINITIONS.worker_drone_t1.maxHp);
  assert.equal(
    factory.productionQueue[0].progress,
    0.25 * (
      STRUCTURE_DEFINITIONS.mech_factory_t1.productionRate +
      UNIT_DEFINITIONS.worker_drone_t1.productionAssistRate
    ),
  );

  factory.powered = false;
  simulation.updateUnits(0.25);
  assert.equal(worker.productionAssistTargetId, factory.id);

  factory.productionQueue = [];
  simulation.updateUnits(0.25);
  assert.equal(worker.productionAssistTargetId, null);
});

test("completed mech factories globally unlock matching structure upgrades", () => {
  const simulation = new Simulation();
  simulation.resources.player.metal = 10_000;
  const generator = simulation.addStructure("generator", "player", 300, 300, {
    hp: STRUCTURE_DEFINITIONS.generator.maxHp / 2,
    storedEnergy: 50,
  });
  const startingMetal = simulation.resources.player.metal;

  assert.equal(getNextStructureTierType("generator"), "generator_t2");
  assert.equal(getNextStructureTierType("generator_t2"), "generator_t3");
  assert.equal(getNextStructureTierType("mech_factory_t1"), "mech_factory_t2");
  assert.equal(getNextStructureTierType("flak_turret"), "flak_turret_t2");
  assert.equal(getNextStructureTierType("flak_turret_t2"), "flak_turret_t3");
  assert.equal(getNextStructureTierType("supply_complex"), null);
  assert.equal(simulation.getStructureUpgradeInfo(generator.id).valid, false);
  assert.match(simulation.getStructureUpgradeInfo(generator.id).reason, /Tier 2 Mech Factory/);

  const unlockingFactory = simulation.addStructure("mech_factory_t2", "player", 700, 300, {
    complete: false,
    constructionProgress: STRUCTURE_DEFINITIONS.mech_factory_t2.buildTime - 0.25,
  });
  assert.equal(simulation.getStructureUpgradeInfo(generator.id).valid, false);

  const builder = simulation.addUnit("worker_drone_t1", "player", 770, 300);
  simulation.commandBuild([builder.id], unlockingFactory.id);
  simulation.tick(0.25);
  assert.equal(unlockingFactory.complete, true);
  const storedEnergyBeforeUpgrade = generator.storedEnergy;
  const tierTwoUpgrade = simulation.getStructureUpgradeInfo(generator.id);
  assert.equal(tierTwoUpgrade.valid, true);
  assert.equal(
    tierTwoUpgrade.metalCost,
    STRUCTURE_DEFINITIONS.generator_t2.metalCost - STRUCTURE_DEFINITIONS.generator.metalCost,
  );
  assert.equal(simulation.upgradeStructure(generator.id, "player"), true);
  assert.equal(generator.type, "generator_t2");
  assert.equal(generator.hp, STRUCTURE_DEFINITIONS.generator_t2.maxHp / 2);
  assert.equal(generator.storedEnergy, storedEnergyBeforeUpgrade);
  assert.equal(simulation.resources.player.metal, startingMetal - tierTwoUpgrade.metalCost);
  const tierTwoFootprint = structureFootprint(generator.type);
  assert.equal((generator.x - tierTwoFootprint.halfWidth) % SIMULATION_RULES.buildingGridSize, 0);
  assert.equal((generator.y - tierTwoFootprint.halfHeight) % SIMULATION_RULES.buildingGridSize, 0);
  simulation.applyDamage(unlockingFactory, unlockingFactory.hp);
  assert.equal(simulation.getUnlockedStructureTier("player"), 2);

  assert.equal(simulation.getStructureUpgradeInfo(generator.id).valid, false);
  assert.match(simulation.getStructureUpgradeInfo(generator.id).reason, /Tier 3 Mech Factory/);
  simulation.addStructure("mech_factory_t3", "player", 1100, 300);
  assert.equal(simulation.upgradeStructure(generator.id, "player"), true);
  assert.equal(generator.type, "generator_t3");
});

test("structure upgrade unlocks are team-specific and expanded footprints need clear space", () => {
  const simulation = new Simulation();
  simulation.resources.enemy.metal = 10_000;
  const enemyGenerator = simulation.addStructure("generator", "enemy", 300, 300);
  simulation.addStructure("mech_factory_t2", "player", 900, 300);

  assert.equal(simulation.getStructureUpgradeInfo(enemyGenerator.id).valid, false);
  assert.match(simulation.getStructureUpgradeInfo(enemyGenerator.id).reason, /Tier 2 Mech Factory/);

  simulation.addStructure("mech_factory_t2", "enemy", 900, 700);
  for (const [x, y] of [[260, 300], [340, 300], [300, 260], [300, 340]]) {
    simulation.addStructure("battery", "enemy", x, y);
  }
  const startingMetal = simulation.resources.enemy.metal;
  const blockedUpgrade = simulation.getStructureUpgradeInfo(enemyGenerator.id);
  assert.equal(blockedUpgrade.valid, false);
  assert.match(blockedUpgrade.reason, /clear space/i);
  assert.equal(simulation.upgradeStructure(enemyGenerator.id, "enemy"), false);
  assert.equal(enemyGenerator.type, "generator");
  assert.equal(simulation.resources.enemy.metal, startingMetal);
});

test("selected workers upgrade only one tier while preserving their active state", () => {
  const simulation = new Simulation({ enemyAiEnabled: false });
  const tierOneWorker = simulation.addUnit("worker_drone_t1", "player", 100, 100);
  const tierTwoWorker = simulation.addUnit("worker_drone_t2", "player", 140, 100);
  const combatUnit = simulation.addUnit("scout_mech", "player", 180, 100);
  tierOneWorker.hp = UNIT_DEFINITIONS.worker_drone_t1.maxHp / 2;
  tierOneWorker.energy = 400;
  tierOneWorker.moveTarget = { x: 500, y: 500 };
  tierOneWorker.moveMode = "normal";

  let upgrade = simulation.getWorkerUpgradeInfo(
    [tierOneWorker.id, tierTwoWorker.id, combatUnit.id],
    "player",
  );
  assert.equal(upgrade.valid, false);
  assert.match(upgrade.reason, /Tier 2 Mech Factory/);
  assert.equal(simulation.upgradeWorkers([combatUnit.id], "player"), 0);
  assert.equal(combatUnit.type, "scout_mech");

  simulation.addStructure("mech_factory_t2", "player", 320, 320);
  upgrade = simulation.getWorkerUpgradeInfo(
    [tierOneWorker.id, tierTwoWorker.id],
    "player",
  );
  assert.equal(upgrade.valid, true);
  assert.equal(upgrade.count, 1);
  assert.equal(upgrade.targetTier, 2);

  simulation.addStructure("mech_factory_t3", "player", 400, 400);
  const startingCrystal = simulation.resources.player.metal;
  upgrade = simulation.getWorkerUpgradeInfo(
    [tierOneWorker.id, tierTwoWorker.id, combatUnit.id],
    "player",
  );
  assert.equal(upgrade.valid, true);
  assert.equal(upgrade.count, 2);
  assert.equal(upgrade.metalCost, 75);
  assert.equal(upgrade.supplyCost, 2);
  assert.equal(
    simulation.upgradeWorkers(
      [tierOneWorker.id, tierTwoWorker.id, combatUnit.id],
      "player",
    ),
    2,
  );

  assert.equal(tierOneWorker.type, "worker_drone_t2");
  assert.equal(tierTwoWorker.type, "worker_drone_t3");
  assert.equal(combatUnit.type, "scout_mech");
  assert.equal(tierOneWorker.hp, UNIT_DEFINITIONS.worker_drone_t2.maxHp / 2);
  assert.equal(tierOneWorker.energy, 400);
  assert.deepEqual(tierOneWorker.moveTarget, { x: 500, y: 500 });
  assert.equal(tierOneWorker.moveMode, "normal");
  assert.equal(simulation.resources.player.metal, startingCrystal - 75);
  assert.equal(
    simulation.getWorkerUpgradeInfo([tierOneWorker.id], "player").targetTier,
    3,
  );
});

test("enemy AI structure upgrades keep its strategic crystal reserve", () => {
  const simulation = new Simulation();
  const generator = simulation.addStructure("generator", "enemy", 300, 300);
  simulation.addStructure("mech_factory_t2", "enemy", 700, 700);
  const upgradeCost = STRUCTURE_DEFINITIONS.generator_t2.metalCost -
    STRUCTURE_DEFINITIONS.generator.metalCost;
  const strategicReserve = 175;

  simulation.resources.enemy.metal =
    upgradeCost + SIMULATION_RULES.enemyStructureUpgradeMetalReserve + strategicReserve - 1;
  assert.equal(
    simulation.getEnemyStructureUpgradeRequest("enemy", strategicReserve),
    null,
  );

  simulation.resources.enemy.metal += 1;
  const request = simulation.getEnemyStructureUpgradeRequest("enemy", strategicReserve);
  assert.equal(request.structureId, generator.id);
  assert.equal(request.targetType, "generator_t2");
  assert.equal(simulation.upgradeStructure(request.structureId, "enemy"), true);
  assert.equal(
    simulation.resources.enemy.metal,
    SIMULATION_RULES.enemyStructureUpgradeMetalReserve + strategicReserve,
  );
});

test("enemy AI does not upgrade existing Grid Batteries", () => {
  const simulation = new Simulation();
  simulation.resources.enemy.metal = 5000;
  simulation.addStructure("battery", "enemy", 300, 300);
  simulation.addStructure("mech_factory_t2", "enemy", 700, 700);

  assert.equal(simulation.getEnemyStructureUpgradeRequest("enemy"), null);
});

test("enemy AI upgrades existing economy buildings after unlocking their tier", () => {
  const simulation = new Simulation();
  simulation.resources.enemy.metal = 5000;
  const generator = simulation.addStructure("generator", "enemy", 300, 300);
  const mine = simulation.addStructure("metal_mine", "enemy", 500, 300);
  simulation.addStructure("generator_t3", "enemy", 300, 700);
  simulation.addStructure("generator_t3", "enemy", 600, 700);
  simulation.addStructure("mech_factory_t3", "enemy", 900, 900);
  simulation.refreshPowerState(0);

  simulation.aiThinkRemaining = 0;
  simulation.updateAiTeam("enemy", 0);
  assert.equal(generator.type, "generator_t2");
  assert.equal(mine.type, "metal_mine");

  simulation.aiThinkRemaining = 0;
  simulation.updateAiTeam("enemy", 0);
  assert.equal(mine.type, "metal_mine_t2");

  simulation.aiThinkRemaining = 0;
  simulation.updateAiTeam("enemy", 0);
  assert.equal(generator.type, "generator_t3");
});

test("enemy AI purchases an eligible upgrade before routine production consumes its surplus", () => {
  const simulation = new Simulation();
  const generator = simulation.addStructure("generator", "enemy", 300, 300);
  simulation.addStructure("generator", "enemy", 650, 300);
  const factory = simulation.addStructure("mech_factory_t2", "enemy", 900, 700);
  for (let index = 0; index < 5; index += 1) {
    simulation.addUnit("scout_mech", "enemy", 700 + index * 35, 900);
  }
  const upgradeCost = STRUCTURE_DEFINITIONS.generator_t2.metalCost -
    STRUCTURE_DEFINITIONS.generator.metalCost;
  const strategicReserve = STRUCTURE_DEFINITIONS.sentry_turret.metalCost;
  simulation.resources.enemy.metal =
    upgradeCost + SIMULATION_RULES.enemyStructureUpgradeMetalReserve + strategicReserve;

  simulation.aiThinkRemaining = 0;
  simulation.updateAiTeam("enemy", 0);

  assert.equal(generator.type, "generator_t2");
  assert.equal(factory.productionQueue[0]?.unitType, "worker_drone_t2");
});

test("higher-tier Crystal Harvesters still snap to deposits", () => {
  const simulation = new Simulation();
  simulation.resources.player.metal = 10_000;
  const worker = simulation.addUnit("worker_drone_t2", "player", 100, 100);
  const deposit = simulation.addMetalDeposit(300, 300);
  const mine = simulation.startConstruction(
    [worker.id],
    "metal_mine_t2",
    deposit.x + 10,
    deposit.y + 10,
  );

  assert.ok(mine);
  assert.equal(mine.x, deposit.x);
  assert.equal(mine.y, deposit.y);
  assert.equal(mine.depositId, deposit.id);
});

test("the standard battlefield uses the much larger map and separated starting bases", () => {
  const simulation = Simulation.createFieldTest();
  const playerGenerator = simulation.structures.find(
    (structure) => structure.team === "player" && structure.type === "generator",
  );
  const enemyGenerator = simulation.structures.find(
    (structure) => structure.team === "enemy" && structure.type === "generator",
  );

  assert.equal(WORLD_WIDTH, 5200);
  assert.equal(WORLD_HEIGHT, 3200);
  assert.equal(simulation.width, WORLD_WIDTH);
  assert.equal(simulation.height, WORLD_HEIGHT);
  assert.ok(playerGenerator.x < WORLD_WIDTH * 0.25);
  assert.ok(enemyGenerator.x > WORLD_WIDTH * 0.75);
  assert.ok(enemyGenerator.x - playerGenerator.x > WORLD_WIDTH / 2);
  assert.ok(simulation.metalDeposits.length >= 27);
  const remoteDeposits = simulation.metalDeposits.filter((deposit) => deposit.remote);
  assert.equal(remoteDeposits.length, 10);
  assert.deepEqual(
    [...new Set(remoteDeposits.map((deposit) => deposit.cluster))].sort(),
    ["Northern Frontier", "Southern Frontier"],
  );
  assert.ok(
    remoteDeposits.every(
      (deposit) =>
        Math.hypot(deposit.x - playerGenerator.x, deposit.y - playerGenerator.y) > 1800 &&
        Math.hypot(deposit.x - enemyGenerator.x, deposit.y - enemyGenerator.y) > 1800,
    ),
  );
  assert.equal(simulation.terrain.length, TERRAIN_OBSTACLES.length);
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

test("single-player map selection resolves every available battlefield", () => {
  assert.equal(DEFAULT_MAP_ID, "broken_frontier");
  assert.deepEqual(Object.keys(MAP_DEFINITIONS), [
    "broken_frontier",
    "ashen_divide",
    "iron_crossings",
    "ruined_meridian",
    "twin_calderas",
  ]);

  const terrainLayouts = new Set();
  const themes = new Set();
  for (const map of Object.values(MAP_DEFINITIONS)) {
    assert.ok(["grassland", "apocalypse"].includes(map.theme));
    themes.add(map.theme);
    assert.equal(
      resolveMatchMapId({ matchMode: "singleplayer", selectedMapId: map.id }),
      map.id,
    );
    const simulation = Simulation.createFieldTest({ mapId: map.id });
    assert.equal(simulation.mapId, map.id);
    assert.equal(simulation.mapName, map.name);
    assert.equal(simulation.mapTheme, map.theme);
    assert.equal(simulation.width, map.width);
    assert.equal(simulation.height, map.height);
    assert.equal(simulation.units.filter((unit) => unit.team === "player").length, 3);
    assert.equal(simulation.units.filter((unit) => unit.team === "enemy").length, 3);
    assert.equal(
      simulation.structures.filter((structure) => structure.team === "player").length,
      4,
    );
    assert.equal(
      simulation.structures.filter((structure) => structure.team === "enemy").length,
      4,
    );
    assert.ok(simulation.metalDeposits.length >= 19);
    terrainLayouts.add(map.terrain.map(({ x, y, width, height }) => `${x},${y},${width},${height}`).join("|"));
  }
  assert.equal(terrainLayouts.size, Object.keys(MAP_DEFINITIONS).length);
  assert.deepEqual(themes, new Set(["grassland", "apocalypse"]));
});

test("multiplayer ignores a manual map choice and resolves a random shared map", () => {
  assert.equal(
    resolveMatchMapId({
      matchMode: "multiplayer",
      selectedMapId: "iron_crossings",
      randomValue: 0,
    }),
    "broken_frontier",
  );
  assert.equal(
    resolveMatchMapId({
      matchMode: "multiplayer",
      selectedMapId: "broken_frontier",
      randomValue: 0.5,
    }),
    "iron_crossings",
  );
  assert.equal(
    resolveMatchMapId({
      matchMode: "multiplayer",
      selectedMapId: "broken_frontier",
      randomValue: 0.999,
    }),
    "twin_calderas",
  );
});

test("multiplayer snapshots preserve the host-selected map", () => {
  const host = Simulation.createFieldTest({ enemyAiEnabled: false, mapId: "iron_crossings" });
  const guest = Simulation.fromSnapshot(structuredClone(host.createSnapshot()));

  assert.equal(guest.mapId, "iron_crossings");
  assert.equal(guest.mapName, MAP_DEFINITIONS.iron_crossings.name);
  assert.equal(guest.mapTheme, "grassland");
  assert.deepEqual(guest.terrain, host.terrain);
  assert.deepEqual(guest.metalDeposits, host.metalDeposits);
});

test("both starting bases have sparse symmetrical walls with open central gates", () => {
  const startingWalls = TERRAIN_OBSTACLES.filter(
    (obstacle) => obstacle.terrainType === "starting_wall",
  );
  const playerWalls = startingWalls.filter((obstacle) => obstacle.side === "player");
  const enemyWalls = startingWalls.filter((obstacle) => obstacle.side === "enemy");

  assert.equal(playerWalls.length, 4);
  assert.equal(enemyWalls.length, 4);
  for (const wall of startingWalls) {
    assert.equal(Math.min(wall.width, wall.height), SIMULATION_RULES.buildingGridSize);
    assert.equal((wall.x - wall.width / 2) % SIMULATION_RULES.buildingGridSize, 0);
    assert.equal((wall.y - wall.height / 2) % SIMULATION_RULES.buildingGridSize, 0);
  }
  for (const playerWall of playerWalls) {
    assert.ok(
      enemyWalls.some(
        (enemyWall) =>
          enemyWall.x === WORLD_WIDTH - playerWall.x &&
          enemyWall.y === playerWall.y &&
          enemyWall.width === playerWall.width &&
          enemyWall.height === playerWall.height,
      ),
    );
  }

  const simulation = new Simulation({ width: 1400, height: 2200, terrain: playerWalls });
  const unit = simulation.addUnit("scout_mech", "player", 900, 1600);
  simulation.commandMove([unit.id], 1250, 1600);
  advance(simulation, 5);

  assert.ok(unit.x > 1100, "the unit could not pass through the starting wall gate");
  assert.equal(unit.moveTarget, null);
  const blockedPlacement = simulation.evaluatePlacement("generator", 1060, 1400, "player");
  assert.equal(blockedPlacement.valid, false);
  assert.match(blockedPlacement.reason, /impassable terrain/i);
});

test("impassable terrain rejects construction and redirects destinations inside it", () => {
  const terrain = [{ id: "test-ridge", name: "Test Ridge", x: 200, y: 100, width: 80, height: 120 }];
  const simulation = new Simulation({ width: 500, height: 300, terrain });
  const unit = simulation.addUnit("scout_mech", "player", 100, 100);

  const placement = simulation.evaluatePlacement("generator", 200, 100, "player");
  assert.equal(placement.valid, false);
  assert.match(placement.reason, /impassable terrain/i);

  simulation.commandMove([unit.id], 200, 100);
  assert.deepEqual(unit.moveTarget, {
    x: 200 - terrain[0].width / 2 - UNIT_DEFINITIONS.scout_mech.radius,
    y: 100,
  });
});

test("queued move orders hand units through each waypoint in order", () => {
  const simulation = new Simulation({ width: 500, height: 300 });
  const unit = simulation.addUnit("scout_mech", "player", 100, 100);

  assert.equal(simulation.commandMove([unit.id], 180, 100), 1);
  assert.equal(simulation.commandMove([unit.id], 260, 100, { queue: true }), 1);
  assert.equal(simulation.commandMove([unit.id], 340, 100, { queue: true }), 1);
  assert.deepEqual(unit.moveTarget, { x: 180, y: 100 });
  assert.deepEqual(unit.moveQueue, [
    { x: 260, y: 100, mode: "normal" },
    { x: 340, y: 100, mode: "normal" },
  ]);
  const restored = Simulation.fromSnapshot(simulation.createSnapshot());
  assert.deepEqual(restored.getUnit(unit.id).moveQueue, unit.moveQueue);

  advance(simulation, 1);
  assert.deepEqual(unit.moveTarget, { x: 260, y: 100 });
  assert.deepEqual(unit.moveQueue, [{ x: 340, y: 100, mode: "normal" }]);

  advance(simulation, 2);
  assert.equal(unit.moveTarget, null);
  assert.deepEqual(unit.moveQueue, []);
  assert.ok(Math.abs(unit.x - 340) < 8);
});

test("ordinary move orders replace queued waypoints", () => {
  const simulation = new Simulation({ width: 500, height: 300 });
  const unit = simulation.addUnit("scout_mech", "player", 100, 100);

  simulation.commandMove([unit.id], 180, 100);
  simulation.commandMove([unit.id], 260, 100, { queue: true });
  simulation.commandMove([unit.id], 340, 100);

  assert.deepEqual(unit.moveTarget, { x: 340, y: 100 });
  assert.deepEqual(unit.moveQueue, []);
});

test("ground units route around impassable terrain without entering it", () => {
  const obstacle = { id: "test-ridge", name: "Test Ridge", x: 200, y: 100, width: 80, height: 120 };
  const simulation = new Simulation({ width: 500, height: 300, terrain: [obstacle] });
  const unit = simulation.addUnit("scout_mech", "player", 100, 100);
  const clearance = UNIT_DEFINITIONS.scout_mech.radius;

  simulation.commandMove([unit.id], 350, 100);
  for (let tick = 0; tick < 300; tick += 1) {
    simulation.tick(1 / 30);
    const insideExpandedTerrain =
      unit.x > obstacle.x - obstacle.width / 2 - clearance &&
      unit.x < obstacle.x + obstacle.width / 2 + clearance &&
      unit.y > obstacle.y - obstacle.height / 2 - clearance &&
      unit.y < obstacle.y + obstacle.height / 2 + clearance;
    assert.equal(insideExpandedTerrain, false, "the unit entered impassable terrain");
  }

  assert.ok(unit.x > obstacle.x + obstacle.width / 2 + clearance);
  assert.equal(unit.moveTarget, null);
});

test("group movement staggers expensive path replans across simulation ticks", () => {
  const obstacle = { id: "long-ridge", x: 300, y: 200, width: 80, height: 320 };
  const simulation = new Simulation({ width: 700, height: 500, terrain: [obstacle] });
  const units = Array.from({ length: 12 }, (_, index) =>
    simulation.addUnit("scout_mech", "player", 80, 70 + index * 24),
  );

  simulation.commandMove(units.map((unit) => unit.id), 620, 200);
  assert.ok(new Set(units.map((unit) => unit.navigationReplanAt)).size > 8);

  simulation.tick(1 / 30);
  const initiallyPlanned = units.filter((unit) => unit.navigationTarget).length;
  assert.ok(initiallyPlanned > 0);
  assert.ok(initiallyPlanned < units.length);

  advance(simulation, 1);
  assert.ok(units.every((unit) => unit.navigationTarget));
});

test("large formations cap visibility-path searches per simulation tick", () => {
  const obstacle = { id: "wide-ridge", x: 400, y: 300, width: 100, height: 500 };
  const simulation = new Simulation({ width: 900, height: 700, terrain: [obstacle] });
  const units = Array.from({ length: 48 }, (_, index) =>
    simulation.addUnit("scout_mech", "player", 100 + (index % 6) * 24, 80 + Math.floor(index / 6) * 24),
  );

  simulation.commandMove(units.map((unit) => unit.id), 800, 300);
  simulation.updateUnits(1 / 30);

  assert.ok(simulation.lastNavigationSearchCount > 0);
  assert.ok(simulation.lastNavigationSearchCount <= 4);
});

test("formation movement accepts more than 200 units at once", () => {
  const simulation = new Simulation({ width: 2400, height: 1600 });
  const units = Array.from({ length: 240 }, (_, index) =>
    simulation.addUnit(
      "scout_mech",
      "player",
      100 + (index % 24) * 32,
      100 + Math.floor(index / 24) * 32,
    ),
  );

  assert.equal(simulation.commandMove(units.map((unit) => unit.id), 1800, 900), 240);
  assert.ok(units.every((unit) => unit.moveTarget));
});

test("dense expanded bases bound obstacle corners considered by each route search", () => {
  const terrain = Array.from({ length: 80 }, (_, index) => ({
    id: `dense-obstacle-${index}`,
    x: 260 + (index % 10) * 65,
    y: 90 + Math.floor(index / 10) * 70,
    width: 40,
    height: 40,
  }));
  const simulation = new Simulation({ width: 1200, height: 700, terrain });
  const unit = simulation.addUnit("scout_mech", "player", 80, 350);

  simulation.commandMove([unit.id], 1120, 350);
  simulation.updateUnits(1 / 30);

  assert.equal(simulation.terrain.length, 80);
  assert.ok(simulation.lastNavigationSearchCount > 0);
  assert.ok(simulation.lastNavigationNodeObstacleCount > 0);
  assert.ok(simulation.lastNavigationNodeObstacleCount <= 32);
});

test("ground units escape U-shaped terrain instead of dead-ending against the back wall", () => {
  const terrain = [
    { id: "u-back", x: 300, y: 200, width: 40, height: 240 },
    { id: "u-top", x: 200, y: 80, width: 240, height: 40 },
    { id: "u-bottom", x: 200, y: 320, width: 240, height: 40 },
  ];
  const simulation = new Simulation({ width: 600, height: 400, terrain });
  const unit = simulation.addUnit("scout_mech", "player", 200, 200);

  simulation.commandMove([unit.id], 450, 200);
  advance(simulation, 12);

  assert.ok(unit.x > 440, "the unit should route out of the cavity and around the barrier");
  assert.ok(Math.abs(unit.y - 200) < 5);
  assert.equal(unit.moveTarget, null);
});

test("move orders placed on structures resolve to a reachable footprint edge", () => {
  const simulation = new Simulation({ width: 600, height: 400 });
  const structure = simulation.addStructure("generator", "player", 300, 200);
  const unit = simulation.addUnit("scout_mech", "player", 100, 200);
  const footprint = structureFootprint(structure.type);
  const clearance = UNIT_DEFINITIONS[unit.type].radius + SIMULATION_RULES.structureCollisionPadding;

  simulation.commandMove([unit.id], structure.x, structure.y);
  advance(simulation, 6);

  assert.equal(unit.moveTarget, null);
  assert.ok(
    unit.x <= structure.x - footprint.halfWidth - clearance + 0.1 ||
      unit.x >= structure.x + footprint.halfWidth + clearance - 0.1 ||
      unit.y <= structure.y - footprint.halfHeight - clearance + 0.1 ||
      unit.y >= structure.y + footprint.halfHeight + clearance - 0.1,
  );
});

test("aircraft fly directly over terrain, starting walls, and structures", () => {
  const obstacle = { id: "test-ridge", name: "Test Ridge", x: 200, y: 100, width: 80, height: 120 };
  const wall = {
    id: "test-wall", name: "Test Starting Wall", terrainType: "starting_wall",
    x: 275, y: 100, width: 40, height: 160,
  };
  const simulation = new Simulation({ width: 500, height: 300, terrain: [obstacle, wall] });
  simulation.addStructure("generator", "player", 330, 100);
  const aircraft = simulation.addUnit("interceptor_t2", "player", 100, 100);

  simulation.commandMove([aircraft.id], 400, 100);
  advance(simulation, 2.5);

  assert.ok(aircraft.x > 390);
  assert.ok(Math.abs(aircraft.y - 100) < 0.001);
  assert.equal(aircraft.moveTarget, null);
});

test("reclamation drones also route around impassable terrain", () => {
  const obstacle = { id: "test-ridge", name: "Test Ridge", x: 200, y: 100, width: 80, height: 120 };
  const simulation = new Simulation({ width: 500, height: 300, terrain: [obstacle] });
  const yard = simulation.addStructure("salvage_yard", "player", 72, 100);
  const drone = yard.drones[0];
  const target = { x: 350, y: 100 };

  for (let tick = 0; tick < 300; tick += 1) {
    simulation.moveDroneToward(drone, target, 1 / 30);
    const insideExpandedTerrain =
      drone.x > obstacle.x - obstacle.width / 2 - DRONE_DEFINITION.radius &&
      drone.x < obstacle.x + obstacle.width / 2 + DRONE_DEFINITION.radius &&
      drone.y > obstacle.y - obstacle.height / 2 - DRONE_DEFINITION.radius &&
      drone.y < obstacle.y + obstacle.height / 2 + DRONE_DEFINITION.radius;
    assert.equal(insideExpandedTerrain, false, "the drone entered impassable terrain");
  }

  assert.ok(drone.x > obstacle.x + obstacle.width / 2 + DRONE_DEFINITION.radius);
});

test("reclamation drones pathfind out of concave terrain instead of dead-ending", () => {
  const terrain = [
    { id: "u-back", name: "U Back", x: 300, y: 200, width: 40, height: 240 },
    { id: "u-top", name: "U Top", x: 200, y: 80, width: 240, height: 40 },
    { id: "u-bottom", name: "U Bottom", x: 200, y: 320, width: 240, height: 40 },
  ];
  const simulation = new Simulation({ width: 600, height: 400, terrain, enemyAiEnabled: false });
  simulation.addStructure("generator", "player", 120, 200);
  const yard = simulation.addStructure("salvage_yard", "player", 172, 200);
  simulation.addWreck(450, 200, 24);
  const startingMetal = simulation.resources.player.metal;
  let furthestDroneX = Math.max(...yard.drones.map((drone) => drone.x));

  simulation.tick(1 / 30);
  assert.equal(simulation.lastDroneNavigationSearchCount, 2);
  for (let tick = 0; tick < 900; tick += 1) {
    simulation.tick(1 / 30);
    furthestDroneX = Math.max(
      furthestDroneX,
      ...yard.drones.map((drone) => drone.x),
    );
  }

  assert.ok(furthestDroneX > 430);
  assert.equal(simulation.wrecks.length, 0);
  assert.ok(simulation.resources.player.metal >= startingMetal + 23.99);
});

test("reclamation drones fly directly over starting walls", () => {
  const wall = {
    id: "test-wall",
    name: "Test Starting Wall",
    terrainType: "starting_wall",
    x: 200,
    y: 100,
    width: 40,
    height: 160,
  };
  const simulation = new Simulation({ width: 500, height: 300, terrain: [wall] });
  const yard = simulation.addStructure("salvage_yard", "player", 72, 100);
  const drone = yard.drones[0];
  const target = { x: 350, y: 100 };

  for (let tick = 0; tick < 180; tick += 1) {
    simulation.moveDroneToward(drone, target, 1 / 30);
  }

  assert.ok(DRONE_DEFINITION.terrainOverflightTypes.includes("starting_wall"));
  assert.ok(drone.x >= target.x - 0.001);
  assert.ok(Math.abs(drone.y - target.y) < 0.001);
});

test("vehicles are larger than same-tier mechs and tanks are larger than scouts", () => {
  const conventionalRadii = Object.values(UNIT_DEFINITIONS)
    .filter((definition) => !["arsenal_colossus", "hexapod_landship", "zenith_doughnut"].includes(definition.role))
    .map((definition) => definition.radius);

  for (const tier of [1, 2, 3]) {
    const mechDefinitions = STRUCTURE_DEFINITIONS[`mech_factory_t${tier}`].production
      .map((unitType) => UNIT_DEFINITIONS[unitType]);
    const vehicleDefinitions = STRUCTURE_DEFINITIONS[`vehicle_factory_t${tier}`].production
      .map((unitType) => UNIT_DEFINITIONS[unitType]);
    const largestMechRadius = Math.max(...mechDefinitions.map((definition) => definition.radius));
    const scout = vehicleDefinitions.find((definition) => definition.role === "vehicle_scout");
    const tank = vehicleDefinitions.find((definition) => definition.role === "tank");

    assert.ok(vehicleDefinitions.every((definition) => definition.radius > largestMechRadius));
    assert.ok(tank.radius > scout.radius);
    assert.equal(tank.radius, Math.max(...vehicleDefinitions.map((definition) => definition.radius)));
  }

  assert.ok(Math.min(...conventionalRadii) >= 6);
  assert.ok(UNIT_DEFINITIONS.arsenal_colossus.radius > Math.max(...conventionalRadii));
  assert.ok(UNIT_DEFINITIONS.hexapod_landship.radius > UNIT_DEFINITIONS.arsenal_colossus.radius);
  assert.ok(UNIT_DEFINITIONS.zenith_doughnut.radius > UNIT_DEFINITIONS.hexapod_landship.radius);
});

test("higher-tier unit sprites grow and armed variants add visible hardpoints", () => {
  const factoryFamilies = [
    ["mech_factory_t1", "mech_factory_t2", "mech_factory_t3"],
    ["vehicle_factory_t1", "vehicle_factory_t2", "vehicle_factory_t3"],
    ["air_factory_t2", "air_factory_t3"],
  ];

  for (const factoryTypes of factoryFamilies) {
    const definitionsByRole = new Map();
    for (const factoryType of factoryTypes) {
      for (const unitType of STRUCTURE_DEFINITIONS[factoryType].production) {
        const definition = UNIT_DEFINITIONS[unitType];
        const previous = definitionsByRole.get(definition.role);
        if (previous) {
          assert.ok(
            definition.radius * definition.spriteScale > previous.radius * previous.spriteScale,
            `${definition.name} should render larger than ${previous.name}`,
          );
        }
        definitionsByRole.set(definition.role, definition);
      }
    }
  }

  for (const definition of Object.values(UNIT_DEFINITIONS)) {
    const expectedHardpoints =
      definition.unitDomain !== "experimental" && definition.attackDamage > 0
        ? definition.transferRate
          ? definition.tier
          : Math.max(0, definition.tier - 1)
        : 0;
    assert.equal(definition.additionalWeaponHardpoints, expectedHardpoints);
  }

  assert.equal(UNIT_DEFINITIONS.energy_carrier_t3.additionalWeaponHardpoints, 3);
  assert.equal(UNIT_DEFINITIONS.grid_tanker_t3.additionalWeaponHardpoints, 3);
  assert.equal(UNIT_DEFINITIONS.energy_tender_t3.additionalWeaponHardpoints, 3);
  assert.equal(UNIT_DEFINITIONS.dropship_t3.additionalWeaponHardpoints, 0);
});

test("Zenith Doughnuts are enormous and fast strategic aircraft", () => {
  const doughnut = UNIT_DEFINITIONS.zenith_doughnut;

  assert.ok(doughnut.radius >= 70);
  assert.equal(doughnut.speed, 375);
  assert.ok(doughnut.underbellyBeamRadius >= 48);
  assert.equal(doughnut.automaticTargetAcquisitionRange, 400);
  assert.equal(doughnut.underbellyBeamDamagePerSecond, 150);
  assert.equal(doughnut.automaticallyPursuesBeamTargets, true);
  assert.equal(doughnut.weaponSystems.length, 2);
  assert.ok(doughnut.weaponSystems.every((weapon) => weapon.attackRange >= 340));
  assert.ok(doughnut.weaponSystems.every((weapon) => weapon.targetLayer === "air"));
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

test("unit separation exits after one pass when no units overlap", () => {
  const simulation = new Simulation();
  for (let index = 0; index < 120; index += 1) {
    simulation.addUnit(
      "scout_mech",
      "player",
      100 + (index % 20) * 40,
      100 + Math.floor(index / 20) * 40,
    );
  }

  simulation.resolveUnitOverlaps();

  assert.equal(simulation.lastUnitSeparationPasses, 1);
});

test("finished ticks remove destroyed entity tombstones from active collections", () => {
  const simulation = new Simulation({ enemyAiEnabled: false });
  const survivingUnit = simulation.addUnit("scout_mech", "player", 100, 100);
  const destroyedUnits = Array.from({ length: 240 }, (_, index) =>
    simulation.addUnit("scout_mech", "enemy", 600 + index * 2, 600),
  );
  const destroyedStructure = simulation.addStructure("generator", "enemy", 900, 900);

  for (const unit of destroyedUnits) simulation.applyDamage(unit, unit.hp, survivingUnit);
  simulation.applyDamage(destroyedStructure, destroyedStructure.hp, survivingUnit);
  assert.equal(simulation.units.length, 241);
  assert.equal(simulation.structures.length, 1);

  simulation.tick(1 / 30);

  assert.deepEqual(simulation.units, [survivingUnit]);
  assert.equal(simulation.structures.length, 0);
  assert.equal(simulation.getUnit(destroyedUnits[0].id), null);
  assert.equal(simulation.getStructure(destroyedStructure.id), null);
  assert.ok(simulation.wrecks.length <= 8);
  assert.equal(
    simulation.wrecks.reduce((total, wreck) => total + wreck.metal, 0),
    destroyedUnits.length * Math.round(UNIT_DEFINITIONS.scout_mech.metalValue * 0.55),
  );
});

test("idle armies stagger automatic target scans after their initial acquisition", () => {
  const simulation = new Simulation({ enemyAiEnabled: false });
  for (let index = 0; index < 180; index += 1) {
    simulation.addUnit("scout_mech", "player", 100 + index * 30, 100);
  }
  let targetSearches = 0;
  const originalSearch = simulation.getNearbyHostileTargets.bind(simulation);
  simulation.getNearbyHostileTargets = (...args) => {
    targetSearches += 1;
    return originalSearch(...args);
  };

  simulation.assignAutomaticTargets();
  assert.equal(targetSearches, 180);
  targetSearches = 0;
  simulation.assignAutomaticTargets();
  assert.equal(targetSearches, 0);

  simulation.time += SIMULATION_RULES.automaticTargetScanInterval / 2;
  simulation.assignAutomaticTargets();
  assert.ok(targetSearches > 0);
  assert.ok(targetSearches < 180);
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

test("every active unit slowly regenerates to 20 percent energy", () => {
  const simulation = new Simulation({ width: 4000, height: 4000, enemyAiEnabled: false });
  const units = Object.entries(UNIT_DEFINITIONS).map(([type, definition], index) => {
    const threshold = definition.maxEnergy * SIMULATION_RULES.lowEnergyRatio;
    return simulation.addUnit(
      type,
      "player",
      100 + (index % 10) * 200,
      100 + Math.floor(index / 10) * 200,
      { energy: threshold - 1 },
    );
  });

  simulation.updateUnits(1);

  for (const unit of units) {
    const threshold = UNIT_DEFINITIONS[unit.type].maxEnergy * SIMULATION_RULES.lowEnergyRatio;
    assert.ok(Math.abs(unit.energy - threshold) < 0.0001, unit.type);
  }

  simulation.updateUnits(1);

  for (const unit of units) {
    const threshold = UNIT_DEFINITIONS[unit.type].maxEnergy * SIMULATION_RULES.lowEnergyRatio;
    assert.ok(Math.abs(unit.energy - threshold) < 0.0001, unit.type);
  }
});

test("attacking damages the target and spends the attacker's energy", () => {
  const simulation = new Simulation();
  const startingEnergy = UNIT_DEFINITIONS.scout_mech.maxEnergy * SIMULATION_RULES.lowEnergyRatio;
  const attacker = simulation.addUnit("scout_mech", "player", 100, 100, {
    energy: startingEnergy,
  });
  const target = simulation.addUnit("raider", "enemy", 150, 100);
  const startingHp = target.hp;

  assert.equal(simulation.commandAttack([attacker.id], target.id), 1);
  simulation.tick(1 / 30);

  assert.equal(target.hp, startingHp);
  assert.equal(attacker.energy, startingEnergy - UNIT_DEFINITIONS.scout_mech.attackEnergy);
  const firingEvent = simulation.events.find((event) => event.type === "attack");
  assert.ok(firingEvent.impactDelay > 0);
  assert.ok(simulation.pendingImpacts.some(
    (impact) => impact.sourceId === attacker.id && impact.targetId === target.id,
  ));
  assert.deepEqual(
    {
      sourceX: firingEvent.sourceX,
      sourceY: firingEvent.sourceY,
      targetX: firingEvent.targetX,
      targetY: firingEvent.targetY,
    },
    { sourceX: 100, sourceY: 100, targetX: 150, targetY: 100 },
  );

  attacker.x = 140;
  target.x = 220;
  assert.equal(firingEvent.sourceX, 100, "the muzzle origin should remain fixed after firing");
  assert.equal(firingEvent.targetX, 150, "the impact position should remain fixed after firing");

  advanceToScheduledImpacts(simulation);
  assert.equal(target.hp, startingHp - UNIT_DEFINITIONS.scout_mech.attackDamage);
});

test("heavy unit projectiles deal no damage before their visible impact", () => {
  const cases = [
    { type: "battle_tank", separation: 130 },
    { type: "mobile_artillery", separation: 230 },
    { type: "arsenal_colossus", separation: 250 },
  ];

  for (const { type, separation } of cases) {
    const simulation = new Simulation({ enemyAiEnabled: false });
    const attacker = simulation.addUnit(type, "player", 100, 300);
    const target = simulation.addStructure("generator", "enemy", 100 + separation, 300);
    const startingHp = target.hp;

    assert.equal(simulation.commandAttack([attacker.id], target.id), 1);
    simulation.tick(1 / 30);

    const attackEvent = simulation.events.find(
      (event) => event.type === "attack" && event.sourceId === attacker.id,
    );
    assert.ok(attackEvent?.impactDelay > 0, `${type} should schedule projectile travel`);
    assert.equal(target.hp, startingHp, `${type} should not damage at muzzle fire`);

    advanceToScheduledImpacts(simulation);
    assert.ok(target.hp < startingHp, `${type} should damage on impact`);
  }
});

test("long-range projectile events remain visible until their delayed impact", () => {
  const simulation = new Simulation({ enemyAiEnabled: false });
  const mortar = simulation.addStructure("mortar_turret_t3", "player", 300, 300, {
    powered: true,
  });
  const target = simulation.addStructure("generator", "enemy", 990, 300);
  const startingHp = target.hp;

  simulation.updateStaticDefenses(1 / 30);
  const attackEvent = simulation.events.find(
    (event) => event.type === "attack" && event.sourceId === mortar.id,
  );
  assert.ok(attackEvent.impactDelay > 1.2);

  advance(simulation, 1.25, 0.05);
  assert.equal(target.hp, startingHp);
  assert.ok(simulation.events.includes(attackEvent));

  advanceToScheduledImpacts(simulation);
  assert.ok(target.hp < startingHp);
  assert.ok(simulation.events.includes(attackEvent));
});

test("ordinary weapons deal reduced damage to aircraft", () => {
  const simulation = new Simulation();
  const attacker = simulation.addUnit("scout_mech", "player", 100, 100);
  const aircraft = simulation.addUnit("interceptor_t2", "enemy", 150, 100);
  const startingHp = aircraft.hp;

  simulation.commandAttack([attacker.id], aircraft.id);
  simulation.tick(1 / 30);
  assert.equal(aircraft.hp, startingHp);
  advanceToScheduledImpacts(simulation);

  assert.equal(
    aircraft.hp,
    startingHp -
      UNIT_DEFINITIONS.scout_mech.attackDamage * SIMULATION_RULES.normalAirDamageMultiplier,
  );
});

test("Interceptors prioritize aircraft and trade ground damage for air superiority", () => {
  function damageAgainst(interceptorType, targetKind) {
    const simulation = new Simulation({ enemyAiEnabled: false });
    const interceptor = simulation.addUnit(interceptorType, "player", 100, 100);
    const target = targetKind === "structure"
      ? simulation.addStructure("generator", "enemy", 150, 100)
      : simulation.addUnit(targetKind, "enemy", 150, 100);
    const startingHp = target.hp;

    assert.equal(simulation.commandAttack([interceptor.id], target.id), 1);
    simulation.tick(1 / 30);
    assert.equal(target.hp, startingHp);
    advanceToScheduledImpacts(simulation);
    return startingHp - target.hp;
  }

  for (const interceptorType of ["interceptor_t2", "interceptor_t3"]) {
    const definition = UNIT_DEFINITIONS[interceptorType];
    assert.equal(definition.airDamageMultiplier, 2);
    assert.equal(definition.groundDamageMultiplier, 0.5);
    assert.equal(definition.preferredTargetLayer, "air");
    assert.match(definition.roleDescription, /Air-superiority fighter/);
    assert.equal(
      damageAgainst(interceptorType, "gunship_t2"),
      definition.attackDamage * definition.airDamageMultiplier,
    );
    assert.equal(
      damageAgainst(interceptorType, "scout_mech"),
      definition.attackDamage * definition.groundDamageMultiplier,
    );
    assert.equal(
      damageAgainst(interceptorType, "structure"),
      definition.attackDamage * definition.groundDamageMultiplier,
    );
  }

  const targetingSimulation = new Simulation({ enemyAiEnabled: false });
  const interceptor = targetingSimulation.addUnit("interceptor_t2", "player", 100, 100);
  targetingSimulation.addUnit("scout_mech", "enemy", 120, 100);
  const aircraft = targetingSimulation.addUnit("gunship_t2", "enemy", 150, 100);

  targetingSimulation.tick(1 / 30);

  assert.equal(interceptor.attackTargetId, aircraft.id);
  assert.equal(interceptor.attackTargetMode, "automatic");
});

test("dedicated anti-air units deal bonus damage to aircraft", () => {
  function damageAgainst(targetType) {
    const simulation = new Simulation();
    const attacker = simulation.addUnit("skyguard_mech", "player", 100, 100);
    const target = simulation.addUnit(targetType, "enemy", 150, 100);
    const startingHp = target.hp;
    simulation.commandAttack([attacker.id], target.id);
    simulation.tick(1 / 30);
    advanceToScheduledImpacts(simulation);
    return startingHp - target.hp;
  }

  assert.equal(damageAgainst("scout_mech"), UNIT_DEFINITIONS.skyguard_mech.attackDamage);
  assert.equal(
    damageAgainst("interceptor_t2"),
    UNIT_DEFINITIONS.skyguard_mech.attackDamage *
      UNIT_DEFINITIONS.skyguard_mech.airDamageMultiplier,
  );
});

test("flak turrets prioritize aircraft and apply their air damage bonus", () => {
  const simulation = new Simulation();
  const flak = simulation.addStructure("flak_turret", "player", 100, 100, { powered: true });
  const groundTarget = simulation.addUnit("scout_mech", "enemy", 120, 100);
  const aircraft = simulation.addUnit("interceptor_t2", "enemy", 180, 100);
  const groundStartingHp = groundTarget.hp;
  const aircraftStartingHp = aircraft.hp;

  simulation.updateStaticDefenses(1 / 30);

  assert.equal(flak.defenseTargetId, aircraft.id);
  assert.equal(groundTarget.hp, groundStartingHp);
  assert.equal(aircraft.hp, aircraftStartingHp);
  advanceToScheduledImpacts(simulation);
  assert.equal(
    aircraft.hp,
    aircraftStartingHp -
      STRUCTURE_DEFINITIONS.flak_turret.attackDamage *
      STRUCTURE_DEFINITIONS.flak_turret.airDamageMultiplier,
  );
});

test("Raiders are fast harassment units that deal bonus damage to structures", () => {
  const definition = UNIT_DEFINITIONS.raider;
  const vanguard = UNIT_DEFINITIONS.scout_mech;

  assert.ok(definition.speed > vanguard.speed);
  assert.ok(definition.maxHp < vanguard.maxHp);
  assert.ok(definition.movementEnergyPerUnit < vanguard.movementEnergyPerUnit);
  assert.ok(
    definition.attackDamage / definition.attackCooldown <
      vanguard.attackDamage / vanguard.attackCooldown,
  );
  assert.ok(definition.structureDamageMultiplier > 1);

  const unitSimulation = new Simulation();
  const unitRaider = unitSimulation.addUnit("raider", "enemy", 100, 100);
  const unitTarget = unitSimulation.addUnit("scout_mech", "player", 150, 100);
  unitSimulation.commandAttack([unitRaider.id], unitTarget.id);
  unitSimulation.tick(1 / 30);
  advanceToScheduledImpacts(unitSimulation);
  assert.equal(unitTarget.hp, vanguard.maxHp - definition.attackDamage);

  const structureSimulation = new Simulation();
  const structureRaider = structureSimulation.addUnit("raider", "enemy", 100, 100);
  const structureTarget = structureSimulation.addStructure("generator", "player", 150, 100);
  structureSimulation.commandAttack([structureRaider.id], structureTarget.id);
  structureSimulation.tick(1 / 30);
  advanceToScheduledImpacts(structureSimulation);
  assert.equal(
    structureTarget.hp,
    STRUCTURE_DEFINITIONS.generator.maxHp -
      definition.attackDamage * definition.structureDamageMultiplier,
  );
});

test("Raiders automatically prioritize exposed infrastructure", () => {
  const simulation = new Simulation();
  const raider = simulation.addUnit("raider", "enemy", 100, 100);
  simulation.addUnit("scout_mech", "player", 120, 100);
  const generator = simulation.addStructure("generator", "player", 180, 100);
  simulation.addStructure("sentry_turret", "player", 150, 100);

  simulation.assignAutomaticTargets();

  assert.equal(raider.attackTargetId, generator.id);
  assert.equal(raider.attackTargetMode, "automatic");
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
  const startingEnergy = UNIT_DEFINITIONS.scout_mech.maxEnergy * SIMULATION_RULES.lowEnergyRatio;
  simulation.addStructure("generator", "player", 100, 100);
  simulation.addStructure("battery", "player", 175, 100, { storedEnergy: 100 });
  const charger = simulation.addStructure("charger", "player", 250, 100);
  const unit = simulation.addUnit("scout_mech", "player", 260, 100, {
    energy: startingEnergy,
  });

  simulation.tick(0.25);

  assert.equal(charger.powered, true);
  assert.ok(
    Math.abs(
      unit.energy - (startingEnergy + STRUCTURE_DEFINITIONS.charger.chargeRate * 0.25),
    ) < 0.001,
  );
  assert.equal(STRUCTURE_DEFINITIONS.charger.chargeRate, 112);
});

test("the enlarged Induction Charger field reaches 260 world units", () => {
  const simulation = new Simulation();
  const startingEnergy = UNIT_DEFINITIONS.scout_mech.maxEnergy * SIMULATION_RULES.lowEnergyRatio;
  simulation.addStructure("generator", "player", 100, 100);
  simulation.addStructure("battery", "player", 175, 100, { storedEnergy: 100 });
  const charger = simulation.addStructure("charger", "player", 250, 100);
  const edgeUnit = simulation.addUnit("scout_mech", "player", 510, 100, {
    energy: startingEnergy,
  });
  const outsideUnit = simulation.addUnit("scout_mech", "player", 250, 361, {
    energy: startingEnergy,
  });

  simulation.tick(0.25);

  assert.equal(STRUCTURE_DEFINITIONS.charger.chargeRadius, 260);
  assert.ok(edgeUnit.energy > startingEnergy);
  assert.equal(outsideUnit.energy, startingEnergy);
});

test("an Induction Charger charges every unit in its field simultaneously", () => {
  const simulation = new Simulation();
  const startingEnergy = UNIT_DEFINITIONS.scout_mech.maxEnergy * SIMULATION_RULES.lowEnergyRatio;
  simulation.addStructure("generator", "player", 100, 100);
  const charger = simulation.addStructure("charger", "player", 250, 100);
  const units = [
    simulation.addUnit("scout_mech", "player", 235, 100, { energy: startingEnergy }),
    simulation.addUnit("scout_mech", "player", 265, 100, { energy: startingEnergy }),
    simulation.addUnit("scout_mech", "player", 250, 125, { energy: startingEnergy }),
  ];

  simulation.tick(0.25);

  const gains = units.map((unit) => unit.energy - startingEnergy);
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
  const startingEnergy = UNIT_DEFINITIONS.scout_mech.maxEnergy * SIMULATION_RULES.lowEnergyRatio;
  simulation.addStructure("generator", "player", 100, 100);
  simulation.addStructure("battery", "player", 140, 100, { storedEnergy: 100 });
  simulation.addStructure("battery", "player", 175, 100, { storedEnergy: 100 });
  simulation.addStructure("battery", "player", 210, 100, { storedEnergy: 100 });
  simulation.addStructure("charger", "player", 250, 100);
  const units = [
    simulation.addUnit("scout_mech", "player", 235, 100, { energy: startingEnergy }),
    simulation.addUnit("scout_mech", "player", 265, 100, { energy: startingEnergy }),
    simulation.addUnit("scout_mech", "player", 250, 125, { energy: startingEnergy }),
  ];

  simulation.tick(0.25);

  const expectedEnergy = startingEnergy + STRUCTURE_DEFINITIONS.charger.chargeRate * 0.25;
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
      skyguard_mech: 720,
      skyguard_mech_t2: 1020,
      skyguard_mech_t3: 1380,
      radar_mech: 720,
      radar_mech_t2: 990,
      radar_mech_t3: 1350,
      energy_carrier: 2520,
      energy_carrier_t2: 3600,
      energy_carrier_t3: 5100,
      scout_vehicle: 660,
      scout_vehicle_t2: 900,
      scout_vehicle_t3: 1200,
      radar_vehicle: 840,
      radar_vehicle_t2: 1140,
      radar_vehicle_t3: 1500,
      battle_tank: 840,
      battle_tank_t2: 1140,
      battle_tank_t3: 1500,
      mobile_artillery: 780,
      mobile_artillery_t2: 1080,
      mobile_artillery_t3: 1440,
      grid_tanker: 3000,
      grid_tanker_t2: 4200,
      grid_tanker_t3: 6000,
      flak_crawler: 720,
      flak_crawler_t2: 990,
      flak_crawler_t3: 1320,
      interceptor_t2: 900,
      interceptor_t3: 1260,
      gunship_t2: 1140,
      gunship_t3: 1560,
      bomber_t2: 1320,
      bomber_t3: 1800,
      energy_tender_t2: 3900,
      energy_tender_t3: 5700,
      dropship_t2: 2100,
      dropship_t3: 3000,
      radar_aircraft_t2: 1080,
      radar_aircraft_t3: 1470,
      arsenal_colossus: 6000,
      hexapod_landship: 7800,
      zenith_doughnut: 7200,
      raider: 1080,
    },
  );
});

test("a charger outside the generator network cannot charge units", () => {
  const simulation = new Simulation();
  const startingEnergy = UNIT_DEFINITIONS.scout_mech.maxEnergy * SIMULATION_RULES.lowEnergyRatio;
  simulation.addStructure("generator", "player", 50, 50);
  const charger = simulation.addStructure("charger", "player", 700, 700);
  const unit = simulation.addUnit("scout_mech", "player", 700, 700, {
    energy: startingEnergy,
  });

  simulation.tick(0.25);

  assert.equal(charger.powered, false);
  assert.equal(charger.connected, false);
  assert.equal(charger.powerStatus, "disconnected");
  assert.equal(unit.energy, startingEnergy);
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

test("Crystal Harvesters continuously consume their passive power demand", () => {
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

test("every mobile energy supplier transfers its matching output rate", () => {
  for (const [carrierType, allyType] of [
    ["energy_carrier", "scout_mech"],
    ["energy_carrier_t2", "scout_mech_t2"],
    ["energy_carrier_t3", "scout_mech_t3"],
    ["grid_tanker", "scout_vehicle"],
    ["grid_tanker_t2", "scout_vehicle_t2"],
    ["grid_tanker_t3", "scout_vehicle_t3"],
    ["energy_tender_t2", "interceptor_t2"],
    ["energy_tender_t3", "interceptor_t3"],
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

test("every mobile energy supplier carries a tier-improving defensive weapon", () => {
  for (const family of [
    ["energy_carrier", "energy_carrier_t2", "energy_carrier_t3"],
    ["grid_tanker", "grid_tanker_t2", "grid_tanker_t3"],
    ["energy_tender_t2", "energy_tender_t3"],
  ]) {
    const definitions = family.map((type) => UNIT_DEFINITIONS[type]);
    assert.ok(definitions.every((definition) => definition.attackDamage > 0));
    assert.ok(definitions.every((definition) => definition.attackRange > 0));
    assert.ok(definitions.every((definition) => definition.attackEnergy > 0));
    assert.ok(definitions.every((definition) => definition.additionalWeaponHardpoints >= 1));
    for (let index = 1; index < definitions.length; index += 1) {
      assert.ok(definitions[index].attackDamage > definitions[index - 1].attackDamage);
      assert.ok(definitions[index].attackRange > definitions[index - 1].attackRange);
    }
  }

  for (const supportType of ["energy_carrier", "grid_tanker", "energy_tender_t2"]) {
    const simulation = new Simulation();
    const definition = UNIT_DEFINITIONS[supportType];
    const support = simulation.addUnit(supportType, "player", 100, 100);
    const target = simulation.addUnit(
      "raider",
      "enemy",
      100 + Math.min(100, definition.attackRange - 10),
      100,
    );
    const startingHp = target.hp;

    assert.equal(simulation.commandAttack([support.id], target.id), 1);
    advance(simulation, 2);

    assert.ok(target.hp < startingHp, `${definition.name} should fire its defensive weapon`);
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

test("nearby wrecks consolidate into larger resource-conserving scrap piles", () => {
  const simulation = new Simulation();
  const first = simulation.addWreck(100, 100, 20, "player");
  const merged = simulation.addWreck(150, 100, 30, "enemy");
  const distant = simulation.addWreck(
    150 + SIMULATION_RULES.wreckMergeRadius + 1,
    100,
    40,
  );

  assert.equal(merged, first);
  assert.equal(simulation.wrecks.length, 2);
  assert.equal(first.metal, 50);
  assert.equal(first.initialMetal, 50);
  assert.equal(first.x, 130);
  assert.equal(first.team, "neutral");
  assert.equal(distant.metal, 40);
  assert.equal(
    simulation.wrecks.reduce((total, wreck) => total + wreck.metal, 0),
    90,
  );
});

test("wreck consolidation redirects reclamation drones to the surviving pile", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 400, 100);
  const yard = simulation.addStructure("salvage_yard", "player", 320, 100);
  const oldestPile = simulation.addWreck(100, 100, 20);
  const targetedPile = simulation.addWreck(240, 100, 20);
  simulation.tick(1 / 30);

  assert.ok(yard.drones.every((drone) => drone.targetWreckId === targetedPile.id));
  simulation.addWreck(170, 100, 20);

  assert.equal(simulation.wrecks.length, 1);
  assert.equal(simulation.wrecks[0], oldestPile);
  assert.equal(oldestPile.metal, 60);
  assert.ok(yard.drones.every((drone) => drone.targetWreckId === oldestPile.id));
  assert.ok(yard.drones.every((drone) => drone.mode === "to_wreck"));
});

test("a powered salvage yard automatically returns wreck crystal", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  simulation.addStructure("salvage_yard", "player", 240, 100);
  simulation.addWreck(300, 100, 20);
  const startingMetal = simulation.resources.player.metal;

  advance(simulation, 12);

  assert.ok(simulation.resources.player.metal > startingMetal);
  assert.ok(simulation.resources.player.metal <= startingMetal + 20.001);
});

test("multiple reclamation drones can harvest the same crystal scrap pile", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  const yard = simulation.addStructure("salvage_yard", "player", 240, 100);
  const wreck = simulation.addWreck(400, 100, 120);

  simulation.tick(1 / 30);

  assert.equal(yard.drones.length, 3);
  assert.ok(yard.drones.every((drone) => drone.targetWreckId === wreck.id));

  advance(simulation, 3);

  assert.ok(yard.drones.every((drone) => drone.carry > 0));
  assert.ok(wreck.metal >= 0);
});

test("partially loaded reclamation drones visit another crystal scrap pile before returning", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  const yard = simulation.addStructure("salvage_yard", "player", 240, 100);
  const firstPile = simulation.addWreck(330, 100, 4);
  const secondPile = simulation.addWreck(520, 100, 100);

  for (let tick = 0; tick < 180; tick += 1) {
    simulation.tick(1 / 30);
    if (yard.drones.every((drone) => drone.targetWreckId === secondPile.id)) break;
  }

  assert.ok(firstPile.metal <= 0.001);
  assert.ok(yard.drones.some((drone) => drone.carry > 0));
  assert.ok(
    yard.drones.every((drone) => drone.carry < DRONE_DEFINITION.carryCapacity),
  );
  assert.ok(yard.drones.every((drone) => drone.targetWreckId === secondPile.id));
  assert.ok(yard.drones.every((drone) => drone.mode === "to_wreck"));
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
  assert.equal(enemyUnit.hp, enemyStartingHp);
  advanceToScheduledImpacts(simulation);
  assert.ok(enemyUnit.hp < enemyStartingHp);
});

test("worker drones have weak, short-range defensive weapons", () => {
  const vanguard = UNIT_DEFINITIONS.scout_mech;
  const workerDamageByTier = {
    worker_drone_t1: 4,
    worker_drone_t2: 5,
    worker_drone_t3: 6,
  };
  for (const [workerType, expectedDamage] of Object.entries(workerDamageByTier)) {
    const worker = UNIT_DEFINITIONS[workerType];
    assert.ok(worker.attackRange > 0);
    assert.ok(worker.attackRange < vanguard.attackRange);
    assert.ok(worker.attackDamage > 0);
    assert.ok(worker.attackDamage < vanguard.attackDamage);
    assert.equal(worker.attackDamage, expectedDamage);
    assert.ok(worker.attackEnergy > 0);
  }

  const simulation = new Simulation();
  const worker = simulation.addUnit("worker_drone_t1", "player", 100, 100);
  const nearbyEnemy = simulation.addUnit("raider", "enemy", 150, 100);
  const startingHp = nearbyEnemy.hp;
  const startingEnergy = worker.energy;

  simulation.tick(1 / 30);

  assert.equal(nearbyEnemy.hp, startingHp);
  advanceToScheduledImpacts(simulation);
  assert.equal(nearbyEnemy.hp, startingHp - UNIT_DEFINITIONS.worker_drone_t1.attackDamage);
  assert.equal(worker.energy, startingEnergy - UNIT_DEFINITIONS.worker_drone_t1.attackEnergy);
});

test("worker drones do not target or retaliate while constructing", () => {
  const simulation = new Simulation();
  const worker = simulation.addUnit("worker_drone_t1", "player", 100, 100);
  const project = simulation.addStructure("battery", "player", 140, 100, {
    complete: false,
    constructionProgress: 0,
  });
  const aggressor = simulation.addUnit("raider", "enemy", 100, 140);
  const aggressorStartingHp = aggressor.hp;
  simulation.commandBuild([worker.id], project.id);

  simulation.applyDamage(worker, 1, aggressor);
  assert.equal(worker.attackTargetId, null);
  assert.equal(worker.buildTargetId, project.id);

  simulation.tick(1 / 30);

  assert.equal(worker.attackTargetId, null);
  assert.equal(worker.buildTargetId, project.id);
  assert.equal(aggressor.hp, aggressorStartingHp);
  assert.ok(project.constructionProgress > 0);
});

test("worker drones repair damaged friendly units and completed buildings with energy", () => {
  const simulation = new Simulation();
  const worker = simulation.addUnit("worker_drone_t1", "player", 100, 100);
  const ally = simulation.addUnit("scout_mech", "player", 120, 100, { hp: 80 });
  const startingEnergy = worker.energy;
  const definition = UNIT_DEFINITIONS.worker_drone_t1;

  assert.equal(simulation.commandRepair([worker.id], ally.id), 1);
  simulation.tick(0.25);

  const firstRepair = definition.repairRate * 0.25;
  assert.ok(Math.abs(ally.hp - (80 + firstRepair)) < 0.0001);
  assert.ok(
    Math.abs(worker.energy - (startingEnergy - firstRepair * definition.repairEnergyPerHp)) <
      0.0001,
  );
  assert.equal(worker.repairTargetId, ally.id);

  const building = simulation.addStructure("generator", "player", 140, 100, { hp: 100 });
  assert.equal(simulation.commandRepair([worker.id], building.id), 1);
  const buildingStartingHp = building.hp;
  simulation.tick(0.25);

  assert.ok(building.hp > buildingStartingHp);
  assert.ok(building.hp <= STRUCTURE_DEFINITIONS.generator.maxHp);
});

test("idle worker drones automatically repair the nearest damaged friendly target", () => {
  const simulation = new Simulation();
  const worker = simulation.addUnit("worker_drone_t1", "player", 100, 100);
  const nearerBuilding = simulation.addStructure("generator", "player", 140, 100, { hp: 100 });
  const fartherUnit = simulation.addUnit("scout_mech", "player", 280, 100, { hp: 80 });
  const enemy = simulation.addUnit("worker_drone_t1", "enemy", 45, 100);
  const enemyStartingHp = enemy.hp;

  simulation.tick(0.25);

  assert.equal(worker.repairTargetId, nearerBuilding.id);
  assert.ok(nearerBuilding.hp > 100);
  assert.equal(fartherUnit.hp, 80);
  assert.equal(enemy.hp, enemyStartingHp);
  assert.equal(worker.attackTargetId, null);

  nearerBuilding.hp = STRUCTURE_DEFINITIONS.generator.maxHp;
  advance(simulation, 3);

  assert.equal(worker.repairTargetId, fartherUnit.id);
  assert.ok(fartherUnit.hp > 80);
});

test("automatic worker repair respects its service radius and higher-priority orders", () => {
  const simulation = new Simulation();
  const worker = simulation.addUnit("worker_drone_t1", "player", 100, 100);
  const nearbyAlly = simulation.addUnit("scout_mech", "player", 180, 100, { hp: 80 });
  const distantAlly = simulation.addUnit("scout_mech", "player", 500, 100, { hp: 80 });

  simulation.commandMove([worker.id], 100, 300);
  simulation.tick(0.25);
  assert.equal(worker.repairTargetId, null);
  assert.equal(nearbyAlly.hp, 80);

  simulation.commandStop([worker.id], true);
  simulation.tick(0.25);
  assert.equal(worker.repairTargetId, null);
  assert.equal(nearbyAlly.hp, 80);

  simulation.commandStop([worker.id]);
  nearbyAlly.hp = UNIT_DEFINITIONS.scout_mech.maxHp;
  simulation.tick(0.25);
  assert.equal(worker.repairTargetId, null);
  assert.equal(distantAlly.hp, 80);
});

test("active construction takes priority over automatic worker repair", () => {
  const simulation = new Simulation();
  const worker = simulation.addUnit("worker_drone_t1", "player", 100, 100);
  const damagedAlly = simulation.addUnit("scout_mech", "player", 120, 100, { hp: 80 });
  const project = simulation.addStructure("battery", "player", 100, 140, {
    complete: false,
    constructionProgress: 0,
  });

  simulation.commandBuild([worker.id], project.id);
  simulation.tick(0.25);

  assert.equal(worker.buildTargetId, project.id);
  assert.equal(worker.repairTargetId, null);
  assert.equal(damagedAlly.hp, 80);
  assert.ok(project.constructionProgress > 0);
});

test("worker drones can repair one another but can never repair themselves", () => {
  const simulation = new Simulation();
  const repairer = simulation.addUnit("worker_drone_t1", "player", 100, 100, { hp: 50 });
  const damagedWorker = simulation.addUnit("worker_drone_t1", "player", 120, 100, { hp: 40 });
  const enemyWorker = simulation.addUnit("worker_drone_t1", "enemy", 500, 500, { hp: 40 });
  const combatUnit = simulation.addUnit("scout_mech", "player", 80, 100);
  simulation.commandStop([damagedWorker.id], true);

  assert.equal(simulation.commandRepair([repairer.id], repairer.id), 0);
  assert.equal(simulation.commandRepair([repairer.id], enemyWorker.id), 0);
  assert.equal(simulation.commandRepair([combatUnit.id], damagedWorker.id), 0);
  assert.equal(simulation.commandRepair([repairer.id], damagedWorker.id), 1);

  simulation.tick(0.25);

  assert.equal(repairer.hp, 50);
  assert.ok(damagedWorker.hp > 40);
  assert.equal(enemyWorker.hp, 40);
});

test("an active repair assignment takes priority over worker combat", () => {
  const simulation = new Simulation();
  const worker = simulation.addUnit("worker_drone_t1", "player", 100, 100);
  const ally = simulation.addStructure("generator", "player", 140, 100, { hp: 80 });
  const enemy = simulation.addUnit("worker_drone_t1", "enemy", 100, 145);
  const enemyStartingHp = enemy.hp;

  assert.equal(simulation.commandRepair([worker.id], ally.id), 1);
  simulation.applyDamage(worker, 1, enemy);
  simulation.tick(0.25);

  assert.equal(worker.attackTargetId, null);
  assert.equal(worker.repairTargetId, ally.id);
  assert.equal(enemy.hp, enemyStartingHp);
  assert.ok(ally.hp > 80);
});

test("combat units automatically attack hostile structures in weapon range", () => {
  const simulation = new Simulation();
  const playerUnit = simulation.addUnit("scout_mech", "player", 100, 100);
  const enemyStructure = simulation.addStructure("generator", "enemy", 220, 100);
  const startingHp = enemyStructure.hp;

  simulation.tick(1 / 30);

  assert.equal(playerUnit.attackTargetId, enemyStructure.id);
  assert.equal(playerUnit.attackTargetMode, "automatic");
  assert.equal(enemyStructure.hp, startingHp);
  advanceToScheduledImpacts(simulation);
  assert.ok(enemyStructure.hp < startingHp);
});

test("player and enemy units pursue the hostile aggressor that damages them", () => {
  for (const defendingTeam of ["player", "enemy"]) {
    const simulation = new Simulation();
    const attackingTeam = defendingTeam === "player" ? "enemy" : "player";
    const defender = simulation.addUnit("scout_mech", defendingTeam, 100, 100);
    const aggressor = simulation.addUnit("raider", attackingTeam, 500, 100);
    const startingX = defender.x;

    simulation.applyDamage(defender, 1, aggressor);

    assert.equal(defender.attackTargetId, aggressor.id);
    assert.equal(defender.attackTargetMode, "retaliation");
    assert.equal(defender.moveTarget, null);

    simulation.tick(1 / 30);

    assert.ok(defender.x > startingX);
    assert.equal(defender.attackTargetId, aggressor.id);
  }
});

test("force-moving units do not abandon their order to retaliate", () => {
  const simulation = new Simulation();
  const defender = simulation.addUnit("scout_mech", "player", 100, 100);
  const aggressor = simulation.addUnit("raider", "enemy", 500, 100);
  simulation.commandMove([defender.id], 100, 500, { force: true });

  simulation.applyDamage(defender, 1, aggressor);

  assert.equal(defender.attackTargetId, null);
  assert.equal(defender.moveMode, "force");
  assert.deepEqual(defender.moveTarget, { x: 100, y: 500 });
});

test("a moving unit stops to attack and resumes its route after the target is destroyed", () => {
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

  assert.equal(unit.x, commandStartX, "the unit should stop before firing");
  assert.ok(
    simulation.pendingImpacts.some((impact) => impact.targetId === enemy.id),
    "the stopped unit should fire at enemies in range",
  );
  assert.deepEqual(unit.moveTarget, { x: 300, y: 100 });

  advanceToScheduledImpacts(simulation);
  assert.ok(enemy.hp < hpBeforeMove, "the projectile should damage the enemy on impact");

  simulation.tick(1 / 30);
  assert.equal(unit.x, commandStartX, "the unit should remain stopped during its weapon cooldown");

  simulation.applyDamage(enemy, enemy.hp, unit);
  simulation.tick(1 / 30);

  assert.ok(unit.x > commandStartX, "the unit should resume its saved route after the fight");
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

test("power coverage uses the same grid-aligned square cells as network connections", () => {
  const simulation = new Simulation();
  const generator = simulation.addStructure("generator", "player", 320, 800);
  const coverage = powerCoverageBounds(generator.type, generator.x, generator.y);
  const insideSquareOutsideCircle = simulation.addStructure("charger", "player", 520, 1000);
  const justOutsideGrid = simulation.addStructure("sentry_turret", "player", coverage.right, 1000);

  simulation.tick(0.25);

  assert.equal(coverage.left % SIMULATION_RULES.buildingGridSize, 0);
  assert.equal(coverage.right % SIMULATION_RULES.buildingGridSize, 0);
  assert.equal(coverage.top % SIMULATION_RULES.buildingGridSize, 0);
  assert.equal(coverage.bottom % SIMULATION_RULES.buildingGridSize, 0);
  assert.ok(
    Math.hypot(
      insideSquareOutsideCircle.x - generator.x,
      insideSquareOutsideCircle.y - generator.y,
    ) > STRUCTURE_DEFINITIONS.generator.powerRadius,
  );
  assert.equal(insideSquareOutsideCircle.connected, true);
  assert.equal(insideSquareOutsideCircle.powered, true);
  assert.equal(justOutsideGrid.connected, false);
  assert.equal(justOutsideGrid.powered, false);
});

test("powered Crystal Harvesters generate crystal over time", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  const mine = simulation.addStructure("metal_mine", "player", 220, 100);
  const startingMetal = simulation.resources.player.metal;

  advance(simulation, 2);

  assert.equal(mine.powered, true);
  assert.ok(simulation.resources.player.metal >= startingMetal + 9.9);
});

test("bright Rich Crystal Deposits increase a harvester's actual crystal output", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  const richDeposit = simulation.addMetalDeposit(220, 100, {
    rich: true,
    yieldMultiplier: 1.5,
  });
  simulation.addStructure("metal_mine", "player", richDeposit.x, richDeposit.y, {
    depositId: richDeposit.id,
  });
  const startingMetal = simulation.resources.player.metal;

  advance(simulation, 2);

  assert.equal(richDeposit.rich, true);
  assert.equal(richDeposit.yieldMultiplier, 1.5);
  assert.ok(simulation.resources.player.metal >= startingMetal + 14.9);
});

test("each mech factory tier offers improved copies of the same six unit roles", () => {
  const factoryTypes = ["mech_factory_t1", "mech_factory_t2", "mech_factory_t3"];
  const expectedRoles = ["worker", "vanguard", "bulwark", "anti_air_mech", "carrier", "radar_mech"];
  const definitionsByTier = factoryTypes.map((factoryType, index) => {
    const tier = index + 1;
    const production = STRUCTURE_DEFINITIONS[factoryType].production;
    assert.equal(production.length, 6);
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
    assert.ok(currentTier.anti_air_mech.attackDamage > previousTier.anti_air_mech.attackDamage);
    assert.ok(currentTier.carrier.transferRate > previousTier.carrier.transferRate);
    assert.ok(currentTier.radar_mech.radarRange > previousTier.radar_mech.radarRange);
  }
});

test("vehicle factories produce six matching-tier vehicle roles", () => {
  const factoryTypes = ["vehicle_factory_t1", "vehicle_factory_t2", "vehicle_factory_t3"];
  const expectedRoles = ["vehicle_scout", "tank", "artillery", "anti_air_vehicle", "grid_tanker", "radar_vehicle"];
  const definitionsByTier = factoryTypes.map((factoryType, index) => {
    const tier = index + 1;
    const definitions = STRUCTURE_DEFINITIONS[factoryType].production
      .map((unitType) => UNIT_DEFINITIONS[unitType]);
    assert.deepEqual(definitions.map((definition) => definition.role), expectedRoles);
    assert.ok(definitions.every((definition) => definition.tier === tier));
    assert.ok(definitions.every((definition) => definition.movementLayer === "ground"));
    return Object.fromEntries(definitions.map((definition) => [definition.role, definition]));
  });

  for (let index = 1; index < definitionsByTier.length; index += 1) {
    for (const role of expectedRoles) {
      assert.ok(definitionsByTier[index][role].maxHp > definitionsByTier[index - 1][role].maxHp);
      if (role === "grid_tanker") {
        assert.ok(definitionsByTier[index][role].transferRate > definitionsByTier[index - 1][role].transferRate);
      } else if (role === "radar_vehicle") {
        assert.ok(definitionsByTier[index][role].radarRange > definitionsByTier[index - 1][role].radarRange);
      } else {
        assert.ok(definitionsByTier[index][role].attackDamage > definitionsByTier[index - 1][role].attackDamage);
      }
    }
  }
});

test("air factories begin at Tier 2 and produce six matching-tier aircraft roles", () => {
  assert.equal(STRUCTURE_DEFINITIONS.air_factory_t1, undefined);
  assert.ok(!BUILD_MENU.includes("air_factory_t1"));

  const factoryTypes = ["air_factory_t2", "air_factory_t3"];
  const expectedRoles = ["interceptor", "gunship", "bomber", "energy_tender", "radar_aircraft", "transport"];
  const definitionsByTier = factoryTypes.map((factoryType, index) => {
    const tier = index + 2;
    const definitions = STRUCTURE_DEFINITIONS[factoryType].production
      .map((unitType) => UNIT_DEFINITIONS[unitType]);
    assert.deepEqual(definitions.map((definition) => definition.role), expectedRoles);
    assert.ok(definitions.every((definition) => definition.tier === tier));
    assert.ok(definitions.every((definition) => definition.movementLayer === "air"));
    return Object.fromEntries(definitions.map((definition) => [definition.role, definition]));
  });

  for (const role of expectedRoles) {
    assert.ok(definitionsByTier[1][role].maxHp > definitionsByTier[0][role].maxHp);
    if (role === "energy_tender") {
      assert.ok(definitionsByTier[1][role].transferRate > definitionsByTier[0][role].transferRate);
    } else if (role === "transport") {
      assert.ok(definitionsByTier[1][role].speed > definitionsByTier[0][role].speed);
      assert.equal(definitionsByTier[1][role].transportCapacity, 8);
    } else {
      assert.ok(definitionsByTier[1][role].attackDamage > definitionsByTier[0][role].attackDamage);
    }
  }
});

test("all flying units use the faster movement profiles", () => {
  const expectedAircraftSpeeds = {
    interceptor_t2: 270,
    interceptor_t3: 300,
    gunship_t2: 185,
    gunship_t3: 205,
    bomber_t2: 160,
    bomber_t3: 175,
    energy_tender_t2: 210,
    energy_tender_t3: 235,
    radar_aircraft_t2: 235,
    radar_aircraft_t3: 260,
  };
  const standardAircraft = Object.keys(expectedAircraftSpeeds)
    .map((type) => UNIT_DEFINITIONS[type]);

  for (const [type, speed] of Object.entries(expectedAircraftSpeeds)) {
    assert.equal(UNIT_DEFINITIONS[type].speed, speed);
  }
  assert.ok(standardAircraft.every((definition) => definition.maxHp <= 295));
  assert.equal(UNIT_DEFINITIONS.zenith_doughnut.speed, 375);
  assert.equal(DRONE_DEFINITION.speed, 130);
  assert.ok(UNIT_DEFINITIONS.zenith_doughnut.maxHp < UNIT_DEFINITIONS.arsenal_colossus.maxHp);
});

test("Dropships begin at Tier 2 in Air Factories with eight ground-unit cargo slots", () => {
  const transports = ["dropship_t2", "dropship_t3"]
    .map((type) => UNIT_DEFINITIONS[type]);

  assert.equal(UNIT_DEFINITIONS.dropship_t1, undefined);
  assert.deepEqual(transports.map((definition) => definition.tier), [2, 3]);
  assert.ok(transports.every((definition) => definition.role === "transport"));
  assert.ok(transports.every((definition) => definition.movementLayer === "air"));
  assert.ok(transports.every((definition) => definition.transportCapacity === 8));
  assert.ok(!STRUCTURE_DEFINITIONS.mech_factory_t1.production.some((type) => type.startsWith("dropship")));
  assert.ok(!STRUCTURE_DEFINITIONS.mech_factory_t2.production.some((type) => type.startsWith("dropship")));
  assert.ok(!STRUCTURE_DEFINITIONS.mech_factory_t3.production.some((type) => type.startsWith("dropship")));
  assert.ok(STRUCTURE_DEFINITIONS.air_factory_t2.production.includes("dropship_t2"));
  assert.ok(STRUCTURE_DEFINITIONS.air_factory_t3.production.includes("dropship_t3"));
});

test("explicit transport orders reserve eight slots, board nearby units, and unload them", () => {
  const simulation = new Simulation({ width: 1200, height: 900 });
  const transport = simulation.addUnit("dropship_t2", "player", 500, 450);
  const passengers = Array.from({ length: 9 }, (_, index) =>
    simulation.addUnit(
      index === 0 ? "worker_drone_t1" : "scout_mech",
      "player",
      488 + (index % 3) * 8,
      438 + Math.floor(index / 3) * 8,
    ));
  const initialSupply = simulation.getSupplyState("player").used;

  assert.equal(simulation.commandLoadUnits(passengers.map((unit) => unit.id), transport.id), 8);
  assert.equal(passengers.filter((unit) => unit.transportTargetId === transport.id).length, 8);
  simulation.tick(1 / 30);

  assert.equal(transport.cargoUnitIds.length, 8);
  assert.equal(passengers.filter((unit) => unit.carriedById === transport.id).length, 8);
  assert.equal(simulation.getSupplyState("player").used, initialSupply);
  assert.equal(simulation.commandMove([passengers[0].id], 100, 100), 0);

  assert.equal(simulation.commandUnloadTransports([transport.id]), 8);
  assert.equal(transport.cargoUnitIds.length, 0);
  assert.ok(passengers.slice(0, 8).every((unit) => !unit.carriedById));
  assert.ok(passengers.slice(0, 8).every((unit) => simulation.isUnitPositionClear(
    unit,
    unit.type,
    { ignoreUnitIds: [unit.id] },
  )));
});

test("multi-transport filling balances reservations and rejects aircraft cargo", () => {
  const simulation = new Simulation({ width: 1400, height: 900 });
  const first = simulation.addUnit("dropship_t2", "player", 300, 450);
  const second = simulation.addUnit("dropship_t2", "player", 1100, 450);
  const groundUnits = Array.from({ length: 10 }, (_, index) =>
    simulation.addUnit("scout_mech", "player", 560 + index * 18, 450));
  const aircraft = simulation.addUnit("interceptor_t2", "player", 700, 550);
  const enemy = simulation.addUnit("scout_mech", "enemy", 700, 350);

  assert.equal(simulation.commandFillTransports([second.id, first.id]), 10);
  assert.equal(groundUnits.filter((unit) => unit.transportTargetId === first.id).length, 5);
  assert.equal(groundUnits.filter((unit) => unit.transportTargetId === second.id).length, 5);
  assert.equal(simulation.commandLoadUnits([aircraft.id, enemy.id], first.id), 0);
  assert.equal(aircraft.transportTargetId, null);
  assert.equal(enemy.transportTargetId, null);
});

test("destroying a loaded Dropship destroys its passengers and snapshots preserve cargo", () => {
  const simulation = new Simulation({ width: 900, height: 700 });
  const transport = simulation.addUnit("dropship_t3", "player", 450, 350);
  const passenger = simulation.addUnit("battle_tank_t3", "player", 450, 350);
  assert.equal(simulation.commandLoadUnits([passenger.id], transport.id), 1);
  simulation.tick(1 / 30);
  const restored = Simulation.fromSnapshot(structuredClone(simulation.createSnapshot()));

  assert.equal(restored.getUnit(transport.id).cargoUnitIds[0], passenger.id);
  assert.equal(restored.getUnit(passenger.id).carriedById, transport.id);
  simulation.applyDamage(transport, transport.hp);
  assert.equal(transport.alive, false);
  assert.equal(passenger.alive, false);
  assert.equal(simulation.wrecks.length, 1);
  assert.equal(
    simulation.wrecks[0].metal,
    Math.round(UNIT_DEFINITIONS.dropship_t3.metalValue * 0.55) +
      Math.round(UNIT_DEFINITIONS.battle_tank_t3.metalValue * 0.55),
  );
});

test("all units and structures provide a useful deterministic vision range", () => {
  assert.ok(
    Object.values(UNIT_DEFINITIONS).every(
      (definition) => Number.isFinite(definition.visionRange) && definition.visionRange > 0,
    ),
  );
  assert.ok(
    Object.values(STRUCTURE_DEFINITIONS).every(
      (definition) => Number.isFinite(definition.visionRange) && definition.visionRange > 0,
    ),
  );
  assert.ok(DRONE_DEFINITION.visionRange > 0);
});

test("enemy contacts are hidden until they enter current friendly vision", () => {
  const simulation = new Simulation({ width: 1400, height: 800 });
  const scout = simulation.addUnit("scout_mech", "player", 100, 200);
  const enemy = simulation.addUnit("raider", "enemy", 700, 200);

  assert.equal(simulation.isEntityVisibleToTeam("player", scout), true);
  assert.equal(simulation.isEntityVisibleToTeam("player", enemy), false);

  enemy.x = 390;
  assert.equal(simulation.isEntityVisibleToTeam("player", enemy), true);
});

test("powered radar arrays reveal long range and lose that coverage off-grid", () => {
  const simulation = new Simulation({ width: 1800, height: 800 });
  const generator = simulation.addStructure("generator", "player", 100, 300);
  const radar = simulation.addStructure("radar_tower", "player", 220, 300);
  const enemy = simulation.addUnit("raider", "enemy", 1120, 300);

  assert.equal(simulation.isEntityVisibleToTeam("player", enemy), false);
  simulation.tick(0.25);
  assert.equal(radar.powered, true);
  assert.equal(simulation.getEntityVisionRange(radar), STRUCTURE_DEFINITIONS.radar_tower.radarRange);
  assert.equal(simulation.isEntityVisibleToTeam("player", enemy), true);

  generator.alive = false;
  simulation.tick(0.25);
  assert.equal(radar.powered, false);
  assert.equal(simulation.getEntityVisionRange(radar), 340);
  assert.equal(simulation.isEntityVisibleToTeam("player", enemy), false);
});

test("radar towers and mobile radar units improve across every available branch tier", () => {
  for (const tier of [1, 2, 3]) {
    const suffix = tier === 1 ? "" : `_t${tier}`;
    assert.ok(BUILD_MENU_BY_TIER[tier].includes(`radar_tower${suffix}`));
    assert.ok(UNIT_DEFINITIONS[`radar_mech${suffix}`].attackDamage > 0);
    assert.ok(UNIT_DEFINITIONS[`radar_vehicle${suffix}`].attackDamage > 0);
  }
  for (const tier of [2, 3]) {
    const definition = UNIT_DEFINITIONS[`radar_aircraft_t${tier}`];
    assert.ok(definition.attackDamage > 0);
    assert.ok(definition.radarRange > definition.attackRange * 4);
  }
  assert.equal(getNextStructureTierType("radar_tower"), "radar_tower_t2");
  assert.equal(getNextStructureTierType("radar_tower_t2"), "radar_tower_t3");
  assert.equal(getNextStructureTierType("radar_tower_t3"), null);
});

test("enemy AI invests in radar after preserving its opening wave and garrison", () => {
  const simulation = new Simulation();
  const anchor = simulation.addStructure("generator", "enemy", 2600, 900);
  simulation.addStructure("generator", "enemy", 2680, 900);
  simulation.addStructure("mech_factory_t1", "enemy", 2440, 1040);
  simulation.addStructure("battery", "enemy", 2520, 820);
  simulation.addStructure("sentry_turret", "enemy", 2480, 900);
  simulation.addStructure("charger", "enemy", 2520, 980);
  for (let index = 0; index < 4; index += 1) {
    simulation.addUnit("scout_mech", "enemy", 2420 + index * 35, 1120);
  }
  const planPoint = (forward, side = 0) => ({ x: anchor.x - forward, y: anchor.y + side });

  const earlyRequest = simulation.getEnemyStrategicConstructionRequest(
    "enemy",
    anchor,
    [],
    planPoint,
    1,
  );
  assert.notEqual(earlyRequest?.type, "radar_tower");

  simulation.addUnit("scout_mech", "enemy", 2560, 1120);
  const securedRequest = simulation.getEnemyStrategicConstructionRequest(
    "enemy",
    anchor,
    [],
    planPoint,
    1,
  );
  assert.equal(securedRequest.type, "radar_tower");
});

test("direct attack commands cannot target unseen enemies", () => {
  const simulation = new Simulation({ width: 1400, height: 800 });
  const attacker = simulation.addUnit("assault_mech", "player", 100, 200);
  const target = simulation.addUnit("raider", "enemy", 700, 200);

  assert.equal(simulation.commandAttack([attacker.id], target.id, { requireVision: true }), 0);
  assert.equal(attacker.attackTargetId, null);

  target.x = 390;
  assert.equal(simulation.commandAttack([attacker.id], target.id, { requireVision: true }), 1);
  assert.equal(attacker.attackTargetId, target.id);
});

test("vehicle and air factories only queue units from their own tier and branch", () => {
  const simulation = new Simulation();
  simulation.resources.player.metal = 100_000;
  const vehicleFactory = simulation.addStructure("vehicle_factory_t1", "player", 220, 100);
  const airFactory = simulation.addStructure("air_factory_t2", "player", 520, 100);

  for (const unitType of STRUCTURE_DEFINITIONS.vehicle_factory_t1.production) {
    assert.equal(simulation.queueProduction(vehicleFactory.id, unitType), true);
  }
  assert.equal(simulation.queueProduction(vehicleFactory.id, "battle_tank_t2"), false);
  assert.equal(simulation.queueProduction(vehicleFactory.id, "interceptor_t2"), false);

  for (const unitType of STRUCTURE_DEFINITIONS.air_factory_t2.production) {
    assert.equal(simulation.queueProduction(airFactory.id, unitType), true);
  }
  assert.equal(simulation.queueProduction(airFactory.id, "interceptor_t3"), false);
  assert.equal(simulation.queueProduction(airFactory.id, "scout_vehicle_t2"), false);
});

test("vehicle and air factories deploy their completed production orders", () => {
  const simulation = new Simulation();
  simulation.resources.player.metal = 10_000;
  const vehicleFactory = simulation.addStructure("vehicle_factory_t1", "player", 220, 100, {
    powered: true,
  });
  const airFactory = simulation.addStructure("air_factory_t2", "player", 620, 100, {
    powered: true,
  });

  assert.equal(simulation.queueProduction(vehicleFactory.id, "battle_tank"), true);
  assert.equal(simulation.queueProduction(airFactory.id, "interceptor_t2"), true);
  simulation.updateProduction(UNIT_DEFINITIONS.battle_tank.productionTime);

  assert.ok(simulation.units.some((unit) => unit.type === "battle_tank"));
  assert.ok(simulation.units.some((unit) => unit.type === "interceptor_t2"));
  assert.equal(vehicleFactory.productionQueue.length, 0);
  assert.equal(airFactory.productionQueue.length, 0);
});

test("mech factories only queue the six unit variants matching their tier", () => {
  const simulation = new Simulation();
  simulation.resources.player.metal = 10_000;
  const tierOneFactory = simulation.addStructure("mech_factory_t1", "player", 220, 100);
  const tierTwoFactory = simulation.addStructure("mech_factory_t2", "player", 520, 100);

  for (const unitType of STRUCTURE_DEFINITIONS.mech_factory_t1.production) {
    assert.equal(simulation.queueProduction(tierOneFactory.id, unitType), true);
  }
  assert.equal(tierOneFactory.productionQueue.length, 6);
  assert.equal(simulation.queueProduction(tierOneFactory.id, "scout_mech_t2"), false);

  for (const unitType of STRUCTURE_DEFINITIONS.mech_factory_t2.production) {
    assert.equal(simulation.queueProduction(tierTwoFactory.id, unitType), true);
  }
  assert.equal(tierTwoFactory.productionQueue.length, 6);
  assert.equal(simulation.queueProduction(tierTwoFactory.id, "scout_mech"), false);
});

test("matching factory groups route production to the shortest powered queue", () => {
  const simulation = new Simulation();
  simulation.resources.player.metal = 10_000;
  const first = simulation.addStructure("mech_factory_t1", "player", 220, 100, {
    powered: true,
  });
  const second = simulation.addStructure("mech_factory_t1", "player", 420, 100, {
    powered: true,
  });
  const third = simulation.addStructure("mech_factory_t1", "player", 620, 100, {
    powered: true,
  });
  first.productionQueue.push(
    { unitType: "scout_mech", progress: 0 },
    { unitType: "scout_mech", progress: 0 },
  );
  third.productionQueue.push({ unitType: "scout_mech", progress: 0 });

  assert.equal(
    simulation.queueGroupProduction([first.id, second.id, third.id], "scout_mech"),
    second.id,
  );
  assert.equal(first.productionQueue.length, 2);
  assert.equal(second.productionQueue.length, 1);
  assert.equal(third.productionQueue.length, 1);
});

test("repeated group production orders distribute across matching factories", () => {
  const simulation = new Simulation();
  simulation.resources.player.metal = 10_000;
  const factories = [220, 420, 620].map((x) =>
    simulation.addStructure("mech_factory_t1", "player", x, 100, { powered: true })
  );

  const routedFactoryIds = Array.from({ length: 6 }, () =>
    simulation.queueGroupProduction(
      factories.map((factory) => factory.id),
      "worker_drone_t1",
    )
  );

  assert.deepEqual(
    routedFactoryIds,
    [
      factories[0].id,
      factories[1].id,
      factories[2].id,
      factories[0].id,
      factories[1].id,
      factories[2].id,
    ],
  );
  assert.deepEqual(factories.map((factory) => factory.productionQueue.length), [2, 2, 2]);
});

test("group production skips unpowered factories and rejects mixed factory types", () => {
  const simulation = new Simulation();
  simulation.resources.player.metal = 10_000;
  const unpowered = simulation.addStructure("mech_factory_t1", "player", 220, 100, {
    powered: false,
  });
  const powered = simulation.addStructure("mech_factory_t1", "player", 420, 100, {
    powered: true,
  });
  const vehicleFactory = simulation.addStructure("vehicle_factory_t1", "player", 620, 100, {
    powered: true,
  });

  assert.equal(
    simulation.queueGroupProduction([unpowered.id, powered.id], "scout_mech"),
    powered.id,
  );
  assert.equal(unpowered.productionQueue.length, 0);
  const metalBeforeInvalidOrder = simulation.resources.player.metal;
  assert.equal(
    simulation.queueGroupProduction([powered.id, vehicleFactory.id], "scout_mech"),
    null,
  );
  assert.equal(simulation.resources.player.metal, metalBeforeInvalidOrder);
  assert.match(simulation.lastProductionError, /matching completed factories/i);
});

test("a Tier 1 mech factory spends crystal and constructs a worker drone", () => {
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
      skyguard_mech: 5,
      skyguard_mech_t2: 8,
      skyguard_mech_t3: 11,
      radar_mech: 5,
      radar_mech_t2: 7,
      radar_mech_t3: 10,
      energy_carrier: 6,
      energy_carrier_t2: 9,
      energy_carrier_t3: 12,
      scout_vehicle: 3,
      scout_vehicle_t2: 5,
      scout_vehicle_t3: 7,
      radar_vehicle: 5,
      radar_vehicle_t2: 8,
      radar_vehicle_t3: 11,
      battle_tank: 9,
      battle_tank_t2: 13,
      battle_tank_t3: 18,
      mobile_artillery: 7,
      mobile_artillery_t2: 11,
      mobile_artillery_t3: 15,
      grid_tanker: 6,
      grid_tanker_t2: 9,
      grid_tanker_t3: 13,
      flak_crawler: 6,
      flak_crawler_t2: 9,
      flak_crawler_t3: 13,
      interceptor_t2: 5,
      interceptor_t3: 7,
      gunship_t2: 9,
      gunship_t3: 13,
      bomber_t2: 11,
      bomber_t3: 16,
      energy_tender_t2: 8,
      energy_tender_t3: 11,
      dropship_t2: 12,
      dropship_t3: 17,
      radar_aircraft_t2: 7,
      radar_aircraft_t3: 10,
      arsenal_colossus: 70,
      hexapod_landship: 120,
      zenith_doughnut: 95,
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

test("player and enemy factories spread repeated output across rally formations", () => {
  for (const team of ["player", "enemy"]) {
    const simulation = new Simulation({ width: 1200, height: 900 });
    const factoryX = team === "player" ? 300 : 900;
    const factory = simulation.addStructure("mech_factory_t1", team, factoryX, 400);
    simulation.commandRally(factory.id, 600, 400);
    const assignedTargets = new Set();

    while (simulation.units.length < 24) {
      if (factory.productionQueue.length === 0) {
        factory.productionQueue.push({
          unitType: "scout_mech",
          progress: UNIT_DEFINITIONS.scout_mech.productionTime,
        });
      }
      factory.powered = true;
      const previousCount = simulation.units.length;
      simulation.updateProduction(0);
      if (simulation.units.length > previousCount) {
        const produced = simulation.units.at(-1);
        assignedTargets.add(`${produced.moveTarget.x}:${produced.moveTarget.y}`);
      }
      for (let tick = 0; tick < 2; tick += 1) simulation.updateUnits(1 / 30);
    }

    assert.equal(assignedTargets.size, 24);
    advance(simulation, 10);
    for (let firstIndex = 0; firstIndex < simulation.units.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < simulation.units.length; secondIndex += 1) {
        const first = simulation.units[firstIndex];
        const second = simulation.units[secondIndex];
        const minimumDistance =
          UNIT_DEFINITIONS[first.type].radius +
          UNIT_DEFINITIONS[second.type].radius +
          SIMULATION_RULES.unitCollisionPadding;
        assert.ok(
          Math.hypot(first.x - second.x, first.y - second.y) + 0.02 >= minimumDistance,
          `${team} factory output ${first.id} and ${second.id} should not stack`,
        );
      }
    }
  }
});

test("setting a new factory rally point resets its formation slots", () => {
  const simulation = new Simulation();
  const factory = simulation.addStructure("mech_factory_t1", "player", 400, 400);
  simulation.commandRally(factory.id, 700, 400);
  assert.deepEqual(
    simulation.getFactoryRallyDestination(factory, "scout_mech"),
    { x: 700, y: 400 },
  );
  assert.notDeepEqual(
    simulation.getFactoryRallyDestination(factory, "scout_mech"),
    { x: 700, y: 400 },
  );

  simulation.commandRally(factory.id, 800, 500);
  assert.deepEqual(
    simulation.getFactoryRallyDestination(factory, "scout_mech"),
    { x: 800, y: 500 },
  );
});

test("matching factories share an atomic grouped rally point and formation", () => {
  const simulation = new Simulation({ width: 1400, height: 900 });
  const firstFactory = simulation.addStructure("mech_factory_t2", "player", 300, 300);
  const secondFactory = simulation.addStructure("mech_factory_t2", "player", 600, 300);

  firstFactory.rallySequence = 12;
  secondFactory.rallySequence = 9;
  assert.equal(
    simulation.commandGroupRally([firstFactory.id, secondFactory.id], 900, 600),
    2,
  );
  assert.deepEqual(firstFactory.rallyPoint, { x: 900, y: 600 });
  assert.deepEqual(secondFactory.rallyPoint, { x: 900, y: 600 });
  assert.equal(firstFactory.rallySequence, 0);
  assert.equal(secondFactory.rallySequence, 1);
  assert.equal(firstFactory.rallySequenceStride, 2);
  assert.equal(secondFactory.rallySequenceStride, 2);

  const firstDestination = simulation.getFactoryRallyDestination(firstFactory, "scout_mech_t2");
  const secondDestination = simulation.getFactoryRallyDestination(secondFactory, "scout_mech_t2");
  assert.notDeepEqual(firstDestination, secondDestination);
});

test("grouped rally rejects mixed factory types and tiers without changing either", () => {
  const simulation = new Simulation({ width: 1400, height: 900 });
  const tierOneFactory = simulation.addStructure("mech_factory_t1", "player", 300, 300);
  const tierTwoFactory = simulation.addStructure("mech_factory_t2", "player", 600, 300);
  simulation.commandRally(tierOneFactory.id, 700, 500);
  simulation.commandRally(tierTwoFactory.id, 800, 500);

  assert.equal(
    simulation.commandGroupRally([tierOneFactory.id, tierTwoFactory.id], 1000, 600),
    0,
  );
  assert.deepEqual(tierOneFactory.rallyPoint, { x: 700, y: 500 });
  assert.deepEqual(tierTwoFactory.rallyPoint, { x: 800, y: 500 });
});

test("a completed unit waits in a surrounded factory until an exit opens", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 400, 200);
  const factory = simulation.addStructure("mech_factory_t1", "player", 400, 400);
  const spawnDistance =
    STRUCTURE_DEFINITIONS.mech_factory_t1.radius +
    UNIT_DEFINITIONS.scout_mech.radius +
    SIMULATION_RULES.structureCollisionPadding +
    18;
  const blockers = [];
  for (let index = 0; index < 32; index += 1) {
    const angle = (index / 32) * Math.PI * 2;
    blockers.push(
      simulation.addStructure(
        "battery",
        "player",
        factory.x + Math.cos(angle) * spawnDistance,
        factory.y + Math.sin(angle) * spawnDistance,
      ),
    );
  }

  assert.equal(simulation.queueProduction(factory.id, "scout_mech"), true);
  advance(simulation, UNIT_DEFINITIONS.scout_mech.productionTime + 0.2);

  assert.equal(simulation.units.length, 0);
  assert.equal(factory.productionQueue.length, 1);
  assert.ok(factory.productionQueue[0].progress >= UNIT_DEFINITIONS.scout_mech.productionTime);

  for (const blocker of blockers) simulation.applyDamage(blocker, blocker.hp);
  advance(simulation, 0.2);

  assert.equal(simulation.units.length, 1);
  assert.equal(factory.productionQueue.length, 0);
});

test("newly produced combat units engage threats while rallying", () => {
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
  assert.ok(unit.moveTarget, "retaliation should preserve the rally route");
  assert.equal(unit.attackTargetId, enemy.id);
  assert.equal(unit.attackTargetMode, "retaliation");
  assert.ok(enemy.hp < enemyStartingHp, "the unit should engage an enemy along its rally path");

  const stoppedX = unit.x;
  simulation.applyDamage(enemy, enemy.hp, unit);
  simulation.tick(1 / 30);

  assert.ok(unit.x > stoppedX, "the unit should continue toward its rally point after the fight");
});

test("workers spend crystal and complete new structures", () => {
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
  assert.equal(structure.hp, STRUCTURE_DEFINITIONS.power_tower.maxHp);
  assert.equal(worker.buildTargetId, null);
});

test("damage to an unfinished building persists through construction and completion", () => {
  const simulation = new Simulation({ enemyAiEnabled: false });
  const definition = STRUCTURE_DEFINITIONS.power_tower;
  const startingProgress = definition.buildTime / 2;
  const startingHp = definition.maxHp * (
    SIMULATION_RULES.constructionStartingHpRatio +
    (1 - SIMULATION_RULES.constructionStartingHpRatio) *
      (startingProgress / definition.buildTime)
  );
  const worker = simulation.addUnit("worker_drone_t1", "player", 180, 100);
  const foundation = simulation.addStructure("power_tower", "player", 200, 100, {
    complete: false,
    constructionProgress: startingProgress,
    hp: startingHp,
  });
  const incomingDamage = 30;
  simulation.commandBuild([worker.id], foundation.id);

  simulation.applyDamage(foundation, incomingDamage);
  const hpAfterHit = foundation.hp;
  const progressBeforeTick = foundation.constructionProgress;
  simulation.tick(1 / 30);
  const progressAdded = foundation.constructionProgress - progressBeforeTick;
  const expectedDurabilityAdded = definition.maxHp *
    (1 - SIMULATION_RULES.constructionStartingHpRatio) *
    (progressAdded / definition.buildTime);

  assert.ok(Math.abs(foundation.hp - (hpAfterHit + expectedDurabilityAdded)) < 0.0001);

  let safetyTicks = 1000;
  while (!foundation.complete && safetyTicks > 0) {
    simulation.tick(1 / 30);
    safetyTicks -= 1;
  }

  assert.equal(foundation.complete, true);
  assert.ok(safetyTicks > 0);
  assert.ok(Math.abs(foundation.hp - (definition.maxHp - incomingDamage)) < 0.0001);
});

test("Shift-queued construction completes foundations in placement order", () => {
  const simulation = new Simulation();
  simulation.resources.player.metal = 1000;
  const worker = simulation.addUnit("worker_drone_t1", "player", 160, 100);
  const first = simulation.startConstruction(
    [worker.id],
    "power_tower",
    220,
    100,
    { queue: true },
  );
  const second = simulation.startConstruction(
    [worker.id],
    "power_tower",
    260,
    100,
    { queue: true },
  );
  const third = simulation.startConstruction(
    [worker.id],
    "power_tower",
    300,
    100,
    { queue: true },
  );

  assert.ok(first && second && third);
  assert.equal(worker.buildTargetId, first.id);
  assert.deepEqual(worker.buildQueue, [second.id, third.id]);

  let safetyTicks = 3000;
  while (!first.complete && safetyTicks > 0) {
    simulation.tick(1 / 30);
    safetyTicks -= 1;
  }
  assert.equal(first.complete, true);
  assert.equal(second.complete, false);
  assert.equal(third.complete, false);
  assert.equal(worker.buildTargetId, second.id);
  assert.deepEqual(worker.buildQueue, [third.id]);

  while (!second.complete && safetyTicks > 0) {
    simulation.tick(1 / 30);
    safetyTicks -= 1;
  }
  assert.equal(second.complete, true);
  assert.equal(third.complete, false);
  assert.equal(worker.buildTargetId, third.id);

  while (!third.complete && safetyTicks > 0) {
    simulation.tick(1 / 30);
    safetyTicks -= 1;
  }
  assert.equal(third.complete, true);
  assert.equal(worker.buildTargetId, null);
  assert.deepEqual(worker.buildQueue, []);
});

test("ordinary build orders replace queued construction and move orders clear it", () => {
  const simulation = new Simulation();
  simulation.resources.player.metal = 1000;
  const worker = simulation.addUnit("worker_drone_t1", "player", 160, 100);
  const first = simulation.startConstruction([worker.id], "power_tower", 220, 100);
  const queued = simulation.startConstruction(
    [worker.id],
    "power_tower",
    260,
    100,
    { queue: true },
  );
  const replacement = simulation.startConstruction(
    [worker.id],
    "power_tower",
    300,
    100,
  );

  assert.ok(first && queued && replacement);
  assert.equal(worker.buildTargetId, replacement.id);
  assert.deepEqual(worker.buildQueue, []);

  simulation.commandBuild([worker.id], first.id);
  simulation.commandBuild([worker.id], queued.id, { queue: true });
  simulation.commandMove([worker.id], 500, 100);
  assert.equal(worker.buildTargetId, null);
  assert.deepEqual(worker.buildQueue, []);
});

test("cancelling construction removes it from worker queues and advances current work", () => {
  const simulation = new Simulation();
  simulation.resources.player.metal = 1000;
  const worker = simulation.addUnit("worker_drone_t1", "player", 160, 100);
  const first = simulation.startConstruction([worker.id], "power_tower", 220, 100);
  const cancelledQueued = simulation.startConstruction(
    [worker.id],
    "power_tower",
    260,
    100,
    { queue: true },
  );
  const third = simulation.startConstruction(
    [worker.id],
    "power_tower",
    300,
    100,
    { queue: true },
  );

  simulation.cancelConstruction(cancelledQueued.id, "player");
  assert.equal(worker.buildTargetId, first.id);
  assert.deepEqual(worker.buildQueue, [third.id]);

  simulation.cancelConstruction(first.id, "player");
  assert.equal(worker.buildTargetId, third.id);
  assert.deepEqual(worker.buildQueue, []);
});

test("powered sentry turrets automatically defend against nearby enemies", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  const turret = simulation.addStructure("sentry_turret", "player", 220, 100);
  const enemy = simulation.addUnit("raider", "enemy", 300, 100);
  const startingHp = enemy.hp;

  simulation.tick(0.25);

  assert.equal(turret.powered, true);
  assert.equal(enemy.hp, startingHp);
  advanceToScheduledImpacts(simulation);
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
  assert.equal(enemyStructure.hp, startingHp);
  advanceToScheduledImpacts(simulation);
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

test("workers can build and upgrade every Shield Turret tier", () => {
  assert.ok(BUILD_MENU_BY_TIER[1].includes("shield_turret"));
  assert.ok(BUILD_MENU_BY_TIER[2].includes("shield_turret_t2"));
  assert.ok(BUILD_MENU_BY_TIER[3].includes("shield_turret_t3"));
  assert.equal(canWorkerTierBuildStructure(1, "shield_turret"), true);
  assert.equal(canWorkerTierBuildStructure(1, "shield_turret_t2"), false);
  assert.equal(canWorkerTierBuildStructure(2, "shield_turret_t2"), true);
  assert.equal(canWorkerTierBuildStructure(3, "shield_turret_t3"), true);
  assert.equal(getNextStructureTierType("shield_turret"), "shield_turret_t2");
  assert.equal(getNextStructureTierType("shield_turret_t2"), "shield_turret_t3");
  assert.equal(getNextStructureTierType("shield_turret_t3"), null);
});

test("Shield Turret protection radii use the expanded balance values", () => {
  assert.deepEqual(
    ["shield_turret", "shield_turret_t2", "shield_turret_t3"].map(
      (type) => STRUCTURE_DEFINITIONS[type].shieldRadius,
    ),
    [250, 355, 480],
  );
});

test("Shield Turret upgrades retain existing strength and regenerate the added capacity", () => {
  const simulation = new Simulation();
  simulation.resources.player.metal = 10_000;
  simulation.addStructure("mech_factory_t3", "player", 900, 700);
  const shield = simulation.addStructure("shield_turret", "player", 300, 300, {
    shieldStrength: 200,
    powered: true,
  });

  assert.equal(simulation.upgradeStructure(shield.id, "player"), true);
  assert.equal(shield.type, "shield_turret_t2");
  assert.equal(shield.shieldStrength, 200);
  assert.equal(shield.shieldStatus, "regenerating");

  assert.equal(simulation.upgradeStructure(shield.id, "player"), true);
  assert.equal(shield.type, "shield_turret_t3");
  assert.equal(shield.shieldStrength, 200);
  assert.equal(shield.shieldStatus, "regenerating");
});

test("higher-tier Shield Turrets protect targets beyond the Tier 1 field", () => {
  const tierOneSimulation = new Simulation();
  tierOneSimulation.addStructure("shield_turret", "player", 300, 300, { powered: true });
  const exposedUnit = tierOneSimulation.addUnit("raider", "player", 600, 300);
  const exposedHp = exposedUnit.hp;
  tierOneSimulation.applyDamage(exposedUnit, 20);
  assert.equal(exposedUnit.hp, exposedHp - 20);

  const tierTwoSimulation = new Simulation();
  const tierTwoShield = tierTwoSimulation.addStructure(
    "shield_turret_t2",
    "player",
    300,
    300,
    { powered: true },
  );
  const protectedUnit = tierTwoSimulation.addUnit("raider", "player", 600, 300);
  const protectedHp = protectedUnit.hp;
  tierTwoSimulation.applyDamage(protectedUnit, 20);

  assert.equal(protectedUnit.hp, protectedHp);
  assert.equal(
    tierTwoShield.shieldStrength,
    STRUCTURE_DEFINITIONS.shield_turret_t2.shieldCapacity - 20,
  );
});

test("a powered Shield Turret absorbs hits inside its field and spills excess damage through", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  const shield = simulation.addStructure("shield_turret", "player", 220, 100, {
    shieldStrength: 30,
  });
  const protectedUnit = simulation.addUnit("raider", "player", 340, 100);
  const attacker = simulation.addUnit("raider", "enemy", 500, 100);
  const startingHp = protectedUnit.hp;
  simulation.refreshPowerState(0.25);

  simulation.applyDamage(protectedUnit, 50, attacker);

  assert.equal(shield.powered, true);
  assert.equal(shield.shieldStrength, 0);
  assert.equal(protectedUnit.hp, startingHp - 20);
  assert.equal(protectedUnit.attackTargetId, attacker.id);
  assert.ok(simulation.events.some(
    (event) => event.type === "shield_hit" && event.shieldId === shield.id,
  ));
});

test("a powered Shield Turret protects its own structure", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  const shield = simulation.addStructure("shield_turret", "player", 220, 100);
  const startingHp = shield.hp;
  const startingStrength = shield.shieldStrength;
  simulation.refreshPowerState(0.25);

  simulation.applyDamage(shield, 40);

  assert.equal(shield.hp, startingHp);
  assert.equal(shield.shieldStrength, startingStrength - 40);
});

test("Shield Turrets do not intercept attacks outside their field or while unpowered", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  const shield = simulation.addStructure("shield_turret", "player", 220, 100);
  const distantUnit = simulation.addUnit("raider", "player", 500, 100);
  const startingDistantHp = distantUnit.hp;
  simulation.refreshPowerState(0.25);

  simulation.applyDamage(distantUnit, 25);
  assert.equal(distantUnit.hp, startingDistantHp - 25);
  assert.equal(shield.shieldStrength, STRUCTURE_DEFINITIONS.shield_turret.shieldCapacity);

  const isolated = new Simulation();
  const unpoweredShield = isolated.addStructure("shield_turret", "player", 220, 100);
  const nearbyUnit = isolated.addUnit("raider", "player", 300, 100);
  const startingNearbyHp = nearbyUnit.hp;
  isolated.refreshPowerState(0.25);
  isolated.applyDamage(nearbyUnit, 25);

  assert.equal(unpoweredShield.powered, false);
  assert.equal(nearbyUnit.hp, startingNearbyHp - 25);
  assert.equal(
    unpoweredShield.shieldStrength,
    STRUCTURE_DEFINITIONS.shield_turret.shieldCapacity,
  );
});

test("a damaged Shield Turret regenerates slowly by drawing local grid energy", () => {
  const simulation = new Simulation();
  const battery = simulation.addStructure("battery", "player", 100, 100, {
    storedEnergy: 20,
  });
  const shield = simulation.addStructure("shield_turret", "player", 220, 100, {
    shieldStrength: 0,
  });
  const definition = STRUCTURE_DEFINITIONS.shield_turret;

  simulation.tick(0.25);

  assert.equal(shield.powered, true);
  assert.equal(shield.shieldStrength, definition.shieldRegenRate * 0.25);
  assert.equal(
    battery.storedEnergy,
    20 - (definition.powerDemand + definition.shieldRegenRate * definition.shieldEnergyPerPoint) * 0.25,
  );
  assert.equal(shield.shieldStatus, "regenerating");

  battery.storedEnergy = 0;
  const strengthBeforePowerLoss = shield.shieldStrength;
  simulation.tick(0.25);

  assert.equal(shield.powered, false);
  assert.equal(shield.shieldStrength, strengthBeforePowerLoss);
  assert.equal(shield.shieldStatus, "unpowered");
});

test("destroyed reclamation drones drop their carried crystal scrap at the death location", () => {
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

test("both sides start with a Headquarters, three workers, a Tier 1 factory, a generator, and a powered Crystal Harvester", () => {
  const simulation = Simulation.createFieldTest();

  for (const team of ["player", "enemy"]) {
    const units = simulation.units.filter((unit) => unit.alive && unit.team === team);
    const structures = simulation.structures.filter(
      (structure) => structure.alive && structure.team === team,
    );
    const headquarters = structures.find((structure) => structure.type === "headquarters");
    const generator = structures.find((structure) => structure.type === "generator");
    const mine = structures.find((structure) => structure.type === "metal_mine");
    assert.equal(units.length, 3);
    assert.ok(units.every((unit) => unit.type === "worker_drone_t1"));
    assert.deepEqual(
      structures.map((structure) => structure.type).sort(),
      ["generator", "headquarters", "mech_factory_t1", "metal_mine"],
    );
    assert.ok(headquarters);
    assert.ok(generator);
    assert.ok(mine);
    assert.equal(mine.complete, true);
    assert.equal(mine.powered, true);
    assert.ok(simulation.metalDeposits.some((deposit) => deposit.id === mine.depositId));
    assert.ok(
      Math.hypot(mine.x - generator.x, mine.y - generator.y) <=
        STRUCTURE_DEFINITIONS.generator.powerRadius,
    );
    assert.deepEqual(
      STRUCTURE_DEFINITIONS[headquarters.type].production,
      ["worker_drone_t1"],
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

test("Crystal Harvesters can only be placed on unused crystal deposits and snap to them", () => {
  const simulation = new Simulation();
  const worker = simulation.addUnit("worker_drone_t1", "player", 100, 100);
  const deposit = simulation.addMetalDeposit(300, 300);
  const startingMetal = simulation.resources.player.metal;

  const invalidMine = simulation.startConstruction([worker.id], "metal_mine", 100, 400);
  assert.equal(invalidMine, null);
  assert.equal(simulation.resources.player.metal, startingMetal);
  assert.match(simulation.lastPlacementError, /unused crystal deposit/i);

  const mine = simulation.startConstruction([worker.id], "metal_mine", 340, 300);
  assert.ok(mine);
  assert.equal(mine.x, deposit.x);
  assert.equal(mine.y, deposit.y);
  assert.equal(mine.depositId, deposit.id);

  const duplicateMine = simulation.startConstruction([worker.id], "metal_mine", 300, 300);
  assert.equal(duplicateMine, null);
});

test("energy-production buildings can be placed away from crystal deposits", () => {
  const simulation = new Simulation();
  const worker = simulation.addUnit("worker_drone_t1", "player", 100, 100);

  const generator = simulation.startConstruction([worker.id], "generator", 777, 333);

  assert.ok(generator);
  assert.equal(generator.x, 780);
  assert.equal(generator.y, 340);
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

  advance(simulation, STRUCTURE_DEFINITIONS.generator.buildTime + 4);

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
  const worker = simulation.addUnit("worker_drone_t2", "player", 890, 530);
  simulation.commandBuild([worker.id], project.id);

  simulation.tick(1 / 30);

  assert.ok(project.constructionProgress > 0);
});

test("a lower-tier worker cannot resume an advanced foundation", () => {
  const simulation = new Simulation();
  const project = simulation.addStructure("mech_factory_t3", "player", 800, 450, {
    complete: false,
    constructionProgress: 2,
  });
  const tierOneWorker = simulation.addUnit("worker_drone_t1", "player", 890, 530);
  const tierTwoWorker = simulation.addUnit("worker_drone_t2", "player", 910, 530);

  assert.equal(simulation.commandBuild([tierOneWorker.id], project.id), 0);
  assert.equal(simulation.commandBuild([tierTwoWorker.id], project.id), 1);
  assert.equal(tierOneWorker.buildTargetId, null);
  assert.equal(tierTwoWorker.buildTargetId, project.id);
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

  advance(simulation, STRUCTURE_DEFINITIONS.power_tower.buildTime + 14);
  assert.equal(worker.state, "active");
  assert.equal(structure.complete, true);
  assert.equal(worker.buildTargetId, null);
});

test("construction placement rejects foundations that overlap existing buildings", () => {
  const simulation = new Simulation();
  const worker = simulation.addUnit("worker_drone_t1", "player", 100, 100);
  simulation.addStructure("generator", "player", 220, 100);
  const startingMetal = simulation.resources.player.metal;

  const overlapping = simulation.startConstruction([worker.id], "battery", 220, 100);

  assert.equal(overlapping, null);
  assert.equal(simulation.resources.player.metal, startingMetal);
  assert.match(simulation.lastPlacementError, /cannot overlap/i);
});

test("buildings may occupy directly adjacent grid cells without invisible padding", () => {
  const simulation = new Simulation();
  simulation.addStructure("sentry_turret", "player", 220, 220);

  const adjacentSentry = simulation.evaluatePlacement("sentry_turret", 260, 220);
  const adjacentBattery = simulation.evaluatePlacement("battery", 260, 220);

  assert.equal(adjacentSentry.valid, true);
  assert.deepEqual([adjacentSentry.x, adjacentSentry.y], [260, 220]);
  assert.equal(adjacentBattery.valid, true);
  assert.deepEqual([adjacentBattery.x, adjacentBattery.y], [260, 220]);
});

test("friendly units vacate a construction site when its foundation is placed", () => {
  const simulation = new Simulation();
  const builder = simulation.addUnit("worker_drone_t1", "player", 400, 400);
  const ally = simulation.addUnit("scout_mech", "player", 410, 400);
  const startingMetal = simulation.resources.player.metal;
  const expectedPlacement = simulation.evaluatePlacement("generator", 401, 399, "player");

  const structure = simulation.startConstruction([builder.id], "generator", 401, 399);

  assert.ok(structure);
  assert.deepEqual([structure.x, structure.y], [expectedPlacement.x, expectedPlacement.y]);
  assert.equal(builder.buildTargetId, structure.id);
  assert.equal(
    simulation.resources.player.metal,
    startingMetal - STRUCTURE_DEFINITIONS.generator.metalCost,
  );
  const footprint = structureFootprint("generator");
  for (const unit of [builder, ally]) {
    const deltaX = Math.max(Math.abs(unit.x - structure.x) - footprint.halfWidth, 0);
    const deltaY = Math.max(Math.abs(unit.y - structure.y) - footprint.halfHeight, 0);
    assert.ok(
      Math.hypot(deltaX, deltaY) + 0.0001 >=
        UNIT_DEFINITIONS[unit.type].radius + SIMULATION_RULES.structureCollisionPadding,
    );
  }

  simulation.tick(1 / 30);
  assert.ok(structure.constructionProgress > 0);
});

test("construction placement still rejects sites occupied by hostile units", () => {
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
  assert.equal(placement.x, 780);
  assert.equal(placement.y, 340);
  assert.equal((placement.x - SIMULATION_RULES.buildingGridSize / 2) % SIMULATION_RULES.buildingGridSize, 0);
  assert.equal((placement.y - SIMULATION_RULES.buildingGridSize / 2) % SIMULATION_RULES.buildingGridSize, 0);
});

test("odd and even building footprints align every edge to a grid line", () => {
  const simulation = new Simulation();
  const worker = simulation.addUnit("worker_drone_t1", "player", 100, 100);
  const factory = simulation.startConstruction([worker.id], "mech_factory_t1", 777, 333);
  const footprint = structureFootprint("mech_factory_t1");

  assert.ok(factory);
  assert.equal(factory.x, 760);
  assert.equal(factory.y, 320);
  assert.equal((factory.x - footprint.halfWidth) % SIMULATION_RULES.buildingGridSize, 0);
  assert.equal((factory.x + footprint.halfWidth) % SIMULATION_RULES.buildingGridSize, 0);
  assert.equal((factory.y - footprint.halfHeight) % SIMULATION_RULES.buildingGridSize, 0);
  assert.equal((factory.y + footprint.halfHeight) % SIMULATION_RULES.buildingGridSize, 0);
});

test("building classes use distinct grid footprints", () => {
  assert.deepEqual(STRUCTURE_DEFINITIONS.power_tower.footprint, [1, 1]);
  assert.deepEqual(STRUCTURE_DEFINITIONS.power_tower_t2.footprint, [1, 1]);
  assert.deepEqual(STRUCTURE_DEFINITIONS.generator.footprint, [1, 1]);
  assert.deepEqual(STRUCTURE_DEFINITIONS.battery.footprint, [1, 1]);
  assert.deepEqual(STRUCTURE_DEFINITIONS.mech_factory_t1.footprint, [2, 2]);
  assert.deepEqual(STRUCTURE_DEFINITIONS.mech_factory_t2.footprint, [3, 3]);
  assert.deepEqual(STRUCTURE_DEFINITIONS.mech_factory_t3.footprint, [4, 4]);
  assert.equal(SIMULATION_RULES.structureCollisionPadding, 0);
});

test("Crystal Harvester footprints never exceed two grid cells per side", () => {
  const mines = Object.values(STRUCTURE_DEFINITIONS).filter(
    (definition) => definition.family === "metal_mine",
  );

  assert.deepEqual(STRUCTURE_DEFINITIONS.metal_mine.footprint, [1, 1]);
  assert.deepEqual(STRUCTURE_DEFINITIONS.metal_mine_t2.footprint, [2, 2]);
  assert.deepEqual(STRUCTURE_DEFINITIONS.metal_mine_t3.footprint, [2, 2]);
  assert.ok(
    mines.every((definition) => definition.footprint.every((cells) => cells <= 2)),
  );
});

test("the Tier 2 Power Relay Tower stays compact and improves every relay function", () => {
  const tierOne = STRUCTURE_DEFINITIONS.power_tower;
  const tierTwo = STRUCTURE_DEFINITIONS.power_tower_t2;
  const tierOneCoverage = powerCoverageBounds("power_tower", 300, 300);
  const tierTwoCoverage = powerCoverageBounds("power_tower_t2", 300, 300);

  assert.deepEqual(tierTwo.footprint, [1, 1]);
  assert.equal(tierTwo.radius, tierOne.radius);
  assert.ok(tierTwo.relayRadius > tierOne.relayRadius);
  assert.ok(tierTwo.storageCapacity > tierOne.storageCapacity);
  assert.ok(tierTwo.chargeRate > tierOne.chargeRate);
  assert.ok(tierTwo.dischargeRate > tierOne.dischargeRate);
  assert.deepEqual([tierOneCoverage.columns, tierOneCoverage.rows], [13, 13]);
  assert.deepEqual([tierTwoCoverage.columns, tierTwoCoverage.rows], [15, 15]);
});

test("enemy AI searches nearby grid cells when its preferred generator site is occupied", () => {
  const simulation = new Simulation();
  simulation.aiThinkRemaining = 0;
  simulation.aiBuildIndex = 1;
  const anchor = simulation.addStructure("generator", "enemy", 2880, 800);
  simulation.addStructure("mech_factory_t1", "enemy", 2640, 960);
  const worker = simulation.addUnit("worker_drone_t1", "enemy", 2740, 800);

  simulation.tick(1 / 30);

  const generator = simulation.structures.find(
    (structure) =>
      structure.alive &&
      structure.team === "enemy" &&
      structure.type === "generator" &&
      structure.id !== anchor.id,
  );
  const generatorFootprint = structureFootprint("generator");
  assert.ok(generator);
  assert.notDeepEqual([generator.x, generator.y], [2740, 800]);
  assert.equal((generator.x - generatorFootprint.halfWidth) % SIMULATION_RULES.buildingGridSize, 0);
  assert.equal((generator.y - generatorFootprint.halfHeight) % SIMULATION_RULES.buildingGridSize, 0);
  assert.ok(
    Math.hypot(generator.x - worker.x, generator.y - worker.y) + 0.0001 >=
      STRUCTURE_DEFINITIONS.generator.radius +
        UNIT_DEFINITIONS.worker_drone_t1.radius +
        SIMULATION_RULES.structureCollisionPadding,
  );
});

test("enemy AI construction avoids sites controlled by a superior hostile force", () => {
  const simulation = new Simulation({ width: 1400, height: 900 });
  simulation.aiThinkRemaining = 0;
  simulation.aiBuildIndex = 1;
  simulation.resources.enemy.metal = 1000;
  simulation.addStructure("generator", "enemy", 1050, 450);
  simulation.addStructure("mech_factory_t1", "enemy", 1130, 610);
  simulation.addUnit("worker_drone_t1", "enemy", 1100, 450);
  for (const [x, y] of [[790, 390], [790, 450], [790, 510]]) {
    simulation.addUnit("assault_mech", "player", x, y);
  }

  simulation.tick(1 / 30);

  const project = simulation.structures.find(
    (structure) => structure.alive && !structure.complete && structure.team === "enemy",
  );
  if (project) {
    assert.equal(
      simulation.isAiConstructionSiteSafe("enemy", project.type, project.x, project.y),
      true,
    );
    assert.ok(project.x > 1000, "the AI should place behind its base instead of beside the force");
  } else {
    assert.equal(
      simulation.resources.enemy.metal,
      1000,
      "the AI should retain its metal when no safe powered site exists",
    );
  }
});

test("enemy AI remembers recently destroyed construction sites", () => {
  const simulation = new Simulation({ width: 1400, height: 900 });
  const attacker = simulation.addUnit("assault_mech", "player", 500, 450);
  const project = simulation.addStructure("generator", "enemy", 520, 450, {
    complete: false,
    constructionProgress: 1,
    constructionStartedAt: simulation.time,
    hp: 1,
  });

  simulation.applyDamage(project, 100, attacker);
  attacker.alive = false;

  assert.equal(project.alive, false);
  assert.equal(simulation.aiStates.enemy.constructionLosses.length, 1);
  assert.equal(simulation.isAiConstructionSiteSafe("enemy", "generator", 520, 450), false);
  const replacementSite = simulation.findNearestValidBuildSite(
    "generator",
    520,
    450,
    8,
    "enemy",
    { avoidHostileThreats: true },
  );
  assert.equal(replacementSite.valid, true);
  assert.ok(
    Math.hypot(replacementSite.x - project.x, replacementSite.y - project.y) >
      SIMULATION_RULES.enemyConstructionLossRadius,
    "a replacement project should move outside the remembered kill zone",
  );

  simulation.time += SIMULATION_RULES.enemyConstructionLossMemoryDuration + 1;
  assert.equal(simulation.isAiConstructionSiteSafe("enemy", "generator", 520, 450), true);
});

test("enemy AI skips a contested deposit for a safer expansion", () => {
  const simulation = new Simulation({ width: 2400, height: 1400 });
  simulation.teamStarts.enemy = { x: 2000, y: 700 };
  const anchor = simulation.addStructure("generator", "enemy", 2000, 700);
  const contestedDeposit = simulation.addMetalDeposit(1400, 700);
  const safeDeposit = simulation.addMetalDeposit(700, 700);
  for (const [x, y] of [[1340, 660], [1360, 700], [1340, 740]]) {
    simulation.addUnit("assault_mech", "player", x, y);
  }

  const request = simulation.getEnemyExpansionRequest(anchor, "enemy");

  assert.ok(request);
  assert.ok(
    Math.hypot(request.x - safeDeposit.x, request.y - safeDeposit.y) <=
      STRUCTURE_DEFINITIONS.generator.powerRadius,
  );
  assert.ok(
    Math.hypot(request.x - contestedDeposit.x, request.y - contestedDeposit.y) >
      STRUCTURE_DEFINITIONS.generator.powerRadius,
  );
});

test("enemy AI requests generators instead of Grid Batteries at every energy level", () => {
  const simulation = new Simulation();
  const anchor = simulation.addStructure("generator", "enemy", 2600, 900);
  simulation.addStructure("mech_factory_t1", "enemy", 2440, 1040);
  for (let index = 0; index < 6; index += 1) {
    simulation.addStructure("power_tower", "enemy", 2360 + index * 40, 760);
  }
  const planPoint = (forward, side = 0) => ({ x: anchor.x - forward, y: anchor.y + side });

  const earlyRequest = simulation.getEnemyStrategicConstructionRequest(
    "enemy",
    anchor,
    [],
    planPoint,
    1,
  );
  const laterRequest = simulation.getEnemyStrategicConstructionRequest(
    "enemy",
    anchor,
    [],
    planPoint,
    19,
  );

  assert.equal(earlyRequest.type, "generator");
  assert.equal(laterRequest.type, "generator");

  simulation.addStructure("generator", "enemy", 2680, 900);
  simulation.refreshPowerState(0);
  simulation.resources.enemy.energy = simulation.resources.enemy.energyCapacity;
  const recoveredRequest = simulation.getEnemyStrategicConstructionRequest(
    "enemy",
    anchor,
    [],
    planPoint,
    1,
  );
  assert.notEqual(recoveredRequest.type, "battery");

  const rushedTarget = simulation.addUnit("scout_mech", "player", 2300, 900);
  const defensiveRequest = simulation.getEnemyStrategicConstructionRequest(
    "enemy",
    anchor,
    [rushedTarget],
    planPoint,
    2,
  );

  assert.equal(defensiveRequest.type, "sentry_turret");
  assert.ok(defensiveRequest.x < anchor.x, "the defense should face the nearby threat");
});

test("enemy AI proactively maintains multiple paid Pulse Generators", () => {
  const simulation = Simulation.createFieldTest({ enemyAiEnabled: true });
  simulation.aiThinkRemaining = 0;
  simulation.resources.enemy.metal = 5000;

  advance(simulation, 20 * BUILD_DURATION_MULTIPLIER);

  const generators = simulation.structures.filter(
    (structure) =>
      structure.alive &&
      structure.team === "enemy" &&
      STRUCTURE_DEFINITIONS[structure.type].generationRate,
  );
  assert.ok(generators.filter((generator) => generator.complete).length >= 2);
  assert.ok(simulation.resources.enemy.metal < 5000);
});

test("enemy AI scales generator count and output headroom with its consumers", () => {
  const simulation = new Simulation();
  const anchor = simulation.addStructure("generator", "enemy", 2600, 900);
  simulation.addStructure("mech_factory_t1", "enemy", 2440, 1040);
  simulation.addStructure("metal_mine", "enemy", 2520, 720);
  simulation.addStructure("battery", "enemy", 2600, 820);
  simulation.addStructure("sentry_turret", "enemy", 2480, 900);
  simulation.addStructure("charger", "enemy", 2520, 980);
  for (const x of [2360, 2400, 2440]) {
    simulation.addUnit("scout_mech", "enemy", x, 1160);
  }
  const planPoint = (forward, side = 0) => ({ x: anchor.x - forward, y: anchor.y + side });

  const redundancyRequest = simulation.getEnemyStrategicConstructionRequest(
    "enemy",
    anchor,
    [],
    planPoint,
    1,
  );
  assert.equal(redundancyRequest.type, "generator");

  simulation.addStructure("generator", "enemy", 2680, 900);
  const adequatelyPoweredRequest = simulation.getEnemyStrategicConstructionRequest(
    "enemy",
    anchor,
    [],
    planPoint,
    2,
  );
  assert.notEqual(adequatelyPoweredRequest?.type, "generator");

  for (const [index, type] of [
    "vehicle_factory_t1",
    "vehicle_factory_t1",
    "mech_factory_t1",
  ].entries()) {
    simulation.addStructure(type, "enemy", 2200 - index * 120, 760 + index * 120);
  }
  const capacityRequest = simulation.getEnemyStrategicConstructionRequest(
    "enemy",
    anchor,
    [],
    planPoint,
    3,
  );
  assert.equal(capacityRequest.type, "generator");
  assert.ok(
    simulation.getEnemyRequiredGenerationRate("enemy") > simulation.getGenerationRate("enemy"),
  );
});

test("advanced AI economies add generators matching their operational tier", () => {
  const simulation = new Simulation();
  const anchor = simulation.addStructure("generator_t2", "enemy", 2600, 900);
  simulation.addStructure("mech_factory_t2", "enemy", 2400, 1040);
  simulation.addStructure("metal_mine_t2", "enemy", 2520, 720);
  simulation.addStructure("battery_t2", "enemy", 2600, 820);
  simulation.addStructure("sentry_turret_t2", "enemy", 2480, 900);
  simulation.addStructure("charger_t2", "enemy", 2520, 980);
  simulation.addUnit("worker_drone_t2", "enemy", 2520, 1080);
  for (const x of [2360, 2400, 2440]) {
    simulation.addUnit("scout_mech_t2", "enemy", x, 1160);
  }
  const planPoint = (forward, side = 0) => ({ x: anchor.x - forward, y: anchor.y + side });

  const request = simulation.getEnemyStrategicConstructionRequest(
    "enemy",
    anchor,
    [],
    planPoint,
    2,
  );

  assert.equal(request.type, "generator_t2");
});

test("enemy AI waits for its pending generator without adding a Grid Battery", () => {
  const simulation = new Simulation();
  const anchor = simulation.addStructure("generator", "enemy", 2600, 900);
  simulation.addStructure("mech_factory_t1", "enemy", 2440, 1040);
  for (let index = 0; index < 6; index += 1) {
    simulation.addStructure("power_tower", "enemy", 2360 + index * 40, 760);
  }
  simulation.addStructure("generator", "enemy", 2520, 820, {
    complete: false,
    constructionProgress: 0.5,
  });
  const planPoint = (forward, side = 0) => ({ x: anchor.x - forward, y: anchor.y + side });

  const request = simulation.getEnemyStrategicConstructionRequest(
    "enemy",
    anchor,
    [],
    planPoint,
    1,
  );

  assert.notEqual(request.type, "battery");
  assert.notEqual(request.type, "generator");
});

test("enemy AI requests flak when aircraft threaten its base", () => {
  const simulation = new Simulation();
  const anchor = simulation.addStructure("generator", "enemy", 2600, 900);
  simulation.addStructure("mech_factory_t1", "enemy", 2440, 1040);
  simulation.addStructure("battery", "enemy", 2520, 820);
  const aircraft = simulation.addUnit("interceptor_t2", "player", 2300, 900);
  const planPoint = (forward, side = 0) => ({ x: anchor.x - forward, y: anchor.y + side });

  const request = simulation.getEnemyStrategicConstructionRequest(
    "enemy",
    anchor,
    [aircraft],
    planPoint,
    3,
  );

  assert.equal(request.type, "flak_turret");
  assert.ok(request.x < anchor.x, "the flak position should face the incoming aircraft");
});

function establishAiBranchTestEconomy(simulation, teamId, xOffset = 0) {
  simulation.resources[teamId].metal = 5000;
  const anchor = simulation.addStructure("generator", teamId, 1000 + xOffset, 1000);
  simulation.addStructure("generator", teamId, 1160 + xOffset, 920);
  simulation.addStructure("generator", teamId, 1160 + xOffset, 1080);
  simulation.addStructure("mech_factory_t1", teamId, 880 + xOffset, 1160);
  simulation.addStructure("mech_factory_t2", teamId, 1360 + xOffset, 1160);
  simulation.addStructure("battery", teamId, 920 + xOffset, 920);
  simulation.addStructure("sentry_turret", teamId, 920 + xOffset, 1080);
  simulation.addStructure("charger", teamId, 1040 + xOffset, 1160);
  simulation.addStructure("metal_mine", teamId, 760 + xOffset, 760);
  simulation.addStructure("metal_mine", teamId, 840 + xOffset, 760);
  for (let index = 0; index < 3; index += 1) {
    simulation.addUnit("scout_mech", teamId, 880 + xOffset + index * 40, 1240);
  }
  simulation.addUnit("worker_drone_t1", teamId, 1000 + xOffset, 1080);
  simulation.addUnit("worker_drone_t2", teamId, 1040 + xOffset, 1080);
  return {
    anchor,
    planPoint: (forward, side = 0) => ({
      x: anchor.x + forward,
      y: anchor.y + side,
    }),
  };
}

test("a stable AI builds vehicle and air production through each available tier", () => {
  const simulation = new Simulation();
  const { anchor, planPoint } = establishAiBranchTestEconomy(simulation, "enemy");
  const nextRequest = () => simulation.getEnemyStrategicConstructionRequest(
    "enemy",
    anchor,
    [],
    planPoint,
    simulation.aiStates.enemy.decisionIndex,
  );

  assert.equal(nextRequest().type, "vehicle_factory_t1");
  simulation.addStructure("vehicle_factory_t1", "enemy", 1440, 920);
  assert.equal(nextRequest().type, "vehicle_factory_t2");
  simulation.addStructure("vehicle_factory_t2", "enemy", 1560, 920);
  assert.equal(nextRequest().type, "air_factory_t2");
  simulation.addStructure("air_factory_t2", "enemy", 1680, 920);

  simulation.addStructure("metal_mine", "enemy", 920, 760);
  simulation.addStructure("mech_factory_t3", "enemy", 1800, 1160);
  simulation.addUnit("worker_drone_t3", "enemy", 1080, 1080);
  assert.equal(nextRequest().type, "vehicle_factory_t3");
  simulation.addStructure("vehicle_factory_t3", "enemy", 1920, 920);
  assert.equal(nextRequest().type, "air_factory_t3");
});

test("every AI commander independently requests its missing vehicle branch", () => {
  const simulation = new Simulation({ teams: createMatchTeams(4) });
  const aiTeams = simulation.teams.filter((team) => team.kind === "ai");

  for (const [index, team] of aiTeams.entries()) {
    const { anchor, planPoint } = establishAiBranchTestEconomy(
      simulation,
      team.id,
      index * 1200,
    );
    const request = simulation.getEnemyStrategicConstructionRequest(
      team.id,
      anchor,
      [],
      planPoint,
      simulation.aiStates[team.id].decisionIndex,
    );
    assert.equal(request.type, "vehicle_factory_t1", `${team.id} should add vehicles`);
  }
});

test("a mature enemy economy deliberately progresses through Tier 2 and Tier 3 factories", () => {
  const createMatureAi = ({ tierTwo = false } = {}) => {
    const simulation = new Simulation();
    simulation.resources.enemy.metal = 5000;
    simulation.aiThinkRemaining = 0;
    const anchor = simulation.addStructure("generator", "enemy", 1000, 1000);
    for (const [x, y] of [[1160, 920], [1160, 1080], [1320, 920], [1320, 1080]]) {
      simulation.addStructure("generator", "enemy", x, y);
    }
    simulation.addStructure("mech_factory_t1", "enemy", 880, 1160);
    simulation.addStructure("battery", "enemy", 920, 920);
    simulation.addStructure("sentry_turret", "enemy", 920, 1080);
    simulation.addStructure("charger", "enemy", 1040, 1160);
    const mineCount = tierTwo ? 3 : 2;
    for (let index = 0; index < mineCount; index += 1) {
      simulation.addStructure("metal_mine", "enemy", 760 + index * 80, 760);
    }
    for (let index = 0; index < 3; index += 1) {
      simulation.addUnit("scout_mech", "enemy", 880 + index * 40, 1240);
    }
    simulation.addUnit("worker_drone_t1", "enemy", 1000, 1080);
    let advancedWorker = null;
    if (tierTwo) {
      simulation.addStructure("mech_factory_t2", "enemy", 1440, 1160);
      advancedWorker = simulation.addUnit("worker_drone_t2", "enemy", 1040, 1080);
    }
    return { simulation, anchor, advancedWorker };
  };

  const tierTwoMatch = createMatureAi();
  tierTwoMatch.simulation.tick(1 / 30);
  const tierTwoProject = tierTwoMatch.simulation.structures.find(
    (structure) => structure.team === "enemy" && structure.type === "mech_factory_t2",
  );
  assert.ok(tierTwoProject && !tierTwoProject.complete);

  const tierThreeMatch = createMatureAi({ tierTwo: true });
  tierThreeMatch.simulation.tick(1 / 30);
  const tierThreeProject = tierThreeMatch.simulation.structures.find(
    (structure) => structure.team === "enemy" && structure.type === "mech_factory_t3",
  );
  assert.ok(tierThreeProject && !tierThreeProject.complete);
  assert.equal(tierThreeMatch.advancedWorker.buildTargetId, tierThreeProject.id);
});

test("advanced enemy mech factories produce the worker generation needed for the next tier", () => {
  const simulation = new Simulation();
  simulation.resources.enemy.metal = 5000;
  simulation.addUnit("worker_drone_t1", "enemy", 900, 900);
  simulation.addUnit("worker_drone_t1", "enemy", 940, 900);
  simulation.addUnit("worker_drone_t1", "enemy", 980, 900);
  const tierTwoFactory = simulation.addStructure("mech_factory_t2", "enemy", 1100, 1000);

  simulation.aiThinkRemaining = 0;
  simulation.tick(1 / 30);
  assert.equal(tierTwoFactory.productionQueue[0]?.unitType, "worker_drone_t2");

  tierTwoFactory.productionQueue = [];
  simulation.addUnit("worker_drone_t2", "enemy", 1020, 900);
  const tierThreeFactory = simulation.addStructure("mech_factory_t3", "enemy", 1400, 1000);
  simulation.aiThinkRemaining = 0;
  simulation.tick(1 / 30);
  assert.equal(tierThreeFactory.productionQueue[0]?.unitType, "worker_drone_t3");
});

test("enemy AI builds at most one charger and only for depleted staged units", () => {
  const simulation = new Simulation();
  const anchor = simulation.addStructure("generator", "enemy", 2600, 900);
  for (const [x, y] of [[2680, 820], [2680, 900], [2680, 980]]) {
    simulation.addStructure("generator", "enemy", x, y);
  }
  simulation.addStructure("mech_factory_t1", "enemy", 2440, 1040);
  simulation.addStructure("battery", "enemy", 2520, 820);
  simulation.addStructure("sentry_turret", "enemy", 2480, 900);
  const combatUnits = [
    simulation.addUnit("scout_mech", "enemy", 2400, 1040),
    simulation.addUnit("assault_mech", "enemy", 2440, 1100),
    simulation.addUnit("scout_mech", "enemy", 2480, 1100),
  ];
  const planPoint = (forward, side = 0) => ({ x: anchor.x - forward, y: anchor.y + side });

  const fullEnergyRequest = simulation.getEnemyStrategicConstructionRequest(
    "enemy",
    anchor,
    [],
    planPoint,
    1,
  );
  assert.notEqual(fullEnergyRequest?.type, "charger");

  for (const unit of combatUnits.slice(0, 2)) {
    unit.energy = UNIT_DEFINITIONS[unit.type].maxEnergy * 0.4;
  }
  const demandRequest = simulation.getEnemyStrategicConstructionRequest(
    "enemy",
    anchor,
    [],
    planPoint,
    2,
  );
  assert.equal(demandRequest.type, "charger");

  simulation.addStructure(demandRequest.type, "enemy", demandRequest.x, demandRequest.y);
  for (let index = 0; index < 18; index += 1) {
    simulation.addUnit("scout_mech", "enemy", 2200 + (index % 6) * 35, 1160 + index * 4);
  }
  const supportedRequest = simulation.getEnemyStrategicConstructionRequest(
    "enemy",
    anchor,
    [],
    planPoint,
    3,
  );
  assert.notEqual(supportedRequest?.type, "charger");
});

test("enemy AI routes depleted staged units into its charger and waits for recharge", () => {
  const simulation = new Simulation({ enemyAiEnabled: false });
  simulation.addStructure("generator", "enemy", 1000, 900);
  const charger = simulation.addStructure("charger", "enemy", 1040, 900);
  const depletedUnits = [
    simulation.addUnit("scout_mech", "enemy", 1340, 880),
    simulation.addUnit("assault_mech", "enemy", 1380, 920),
  ];
  for (const unit of depletedUnits) {
    unit.energy = UNIT_DEFINITIONS[unit.type].maxEnergy * 0.4;
  }
  simulation.refreshPowerState(0);

  assert.equal(simulation.stageEnemyCombatUnitsForRecharge("enemy"), 2);
  assert.ok(depletedUnits.every((unit) => unit.moveTarget && unit.moveMode === "force"));

  depletedUnits[0].x = charger.x + 120;
  depletedUnits[0].y = charger.y;
  depletedUnits[1].x = charger.x + 160;
  depletedUnits[1].y = charger.y;
  for (const unit of depletedUnits) {
    unit.moveTarget = null;
    unit.moveMode = null;
  }
  assert.equal(simulation.getEnemyStagedCombatUnits("enemy").length, 0);
  assert.equal(
    simulation.getEnemyStagedCombatUnits("enemy", { includeRecharging: true }).length,
    2,
  );

  const startingEnergy = depletedUnits.map((unit) => unit.energy);
  advance(simulation, 1);
  assert.ok(depletedUnits.every((unit, index) => unit.energy > startingEnergy[index]));

  for (const unit of depletedUnits) {
    unit.energy = UNIT_DEFINITIONS[unit.type].maxEnergy * 0.91;
  }
  assert.equal(simulation.getEnemyStagedCombatUnits("enemy").length, 2);
});

test("the standard enemy opening establishes defenses and launches promptly", () => {
  const simulation = Simulation.createFieldTest();

  advance(simulation, 30 * BUILD_DURATION_MULTIPLIER);

  assert.ok(
    simulation.structures.some(
      (structure) =>
        structure.alive &&
        structure.complete &&
        structure.team === "enemy" &&
        structure.type === "sentry_turret",
    ),
    "sentry_turret should be operational during the opening",
  );
  assert.ok(
    simulation.structures.filter(
      (structure) =>
        structure.alive &&
        structure.complete &&
        structure.team === "enemy" &&
        STRUCTURE_DEFINITIONS[structure.type].family === "generator",
    ).length >= 2,
  );
  assert.equal(
    simulation.structures.some(
      (structure) =>
        structure.alive &&
        structure.team === "enemy" &&
        STRUCTURE_DEFINITIONS[structure.type].family === "battery",
    ),
    false,
  );
  assert.ok(
    simulation.structures.filter(
      (structure) =>
        structure.alive &&
        structure.team === "enemy" &&
        STRUCTURE_DEFINITIONS[structure.type].family === "charger",
    ).length <= 1,
    "the opening should never accumulate redundant chargers",
  );
  const enemyCombatUnits = simulation.units.filter(
    (unit) => unit.alive && unit.team === "enemy" && UNIT_DEFINITIONS[unit.type].attackRange > 0,
  );
  assert.ok(enemyCombatUnits.length >= SIMULATION_RULES.enemyAttackWaveSize);
  assert.equal(
    enemyCombatUnits.filter((unit) => unit.moveMode === "advance").length,
    SIMULATION_RULES.enemyAttackWaveSize,
  );
});

test("enemy AI builds generation before spending crystal on an unpowered consumer", () => {
  const simulation = new Simulation();
  simulation.aiThinkRemaining = 0;
  simulation.aiBuildIndex = 3;
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

test("enemy AI places a needed relay on its connected grid", () => {
  const simulation = new Simulation();
  simulation.aiThinkRemaining = 0;
  simulation.aiBuildIndex = 4;
  simulation.resources.enemy.metal = 1000;
  simulation.addStructure("generator", "enemy", 2880, 800);
  simulation.addStructure("generator", "enemy", 2840, 720);
  simulation.addStructure("generator", "enemy", 2840, 880);
  simulation.addStructure("mech_factory_t1", "enemy", 2680, 960);
  simulation.addStructure("generator", "enemy", 2760, 720);
  simulation.addStructure("sentry_turret", "enemy", 2640, 760);
  simulation.addStructure("charger", "enemy", 2720, 840);
  simulation.addStructure("metal_mine", "enemy", 2920, 600);
  simulation.addStructure("metal_mine", "enemy", 3000, 600);
  simulation.addUnit("scout_mech", "enemy", 2760, 960);
  simulation.addUnit("worker_drone_t1", "enemy", 2800, 1000);

  simulation.tick(1 / 30);

  const relay = simulation.structures.find(
    (structure) => structure.alive && structure.team === "enemy" && structure.type === "power_tower",
  );
  assert.ok(relay);
  assert.notDeepEqual([relay.x, relay.y], [2500, 860]);
  assert.equal(
    simulation.isBuildSiteConnectedToPower("power_tower", "enemy", relay.x, relay.y),
    true,
  );
});

test("enemy AI places powered consumers inside its energized grid", () => {
  const simulation = new Simulation();
  simulation.aiThinkRemaining = 0;
  simulation.aiBuildIndex = 3;
  simulation.resources.enemy.metal = 1000;
  simulation.addStructure("generator", "enemy", 2880, 800);
  simulation.addStructure("mech_factory_t1", "enemy", 2680, 920);
  simulation.addStructure("generator", "enemy", 2760, 720);
  simulation.addStructure("sentry_turret", "enemy", 2640, 760);
  const depletedUnits = [
    simulation.addUnit("scout_mech", "enemy", 2720, 980),
    simulation.addUnit("assault_mech", "enemy", 2760, 980),
  ];
  for (const unit of depletedUnits) {
    unit.energy = UNIT_DEFINITIONS[unit.type].maxEnergy * 0.4;
  }
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

  advance(simulation, 15 * BUILD_DURATION_MULTIPLIER);
  assert.equal(charger.complete, true);
  assert.equal(charger.connected, true);
  assert.equal(charger.powered, true);
});

test("enemy AI completes extra generation before projected demand exceeds supply", () => {
  const simulation = new Simulation();
  simulation.aiThinkRemaining = 0;
  simulation.aiBuildIndex = 3;
  simulation.resources.enemy.metal = 5000;
  simulation.addStructure("generator", "enemy", 2880, 800);
  simulation.addStructure("mech_factory_t1", "enemy", 2680, 920);
  simulation.addStructure("metal_mine", "enemy", 2920, 600);
  simulation.addStructure("power_tower", "enemy", 2640, 800);
  simulation.addStructure("battery", "enemy", 2760, 720);
  simulation.addStructure("sentry_turret", "enemy", 2600, 760);
  const depletedUnits = [
    simulation.addUnit("scout_mech", "enemy", 2720, 980),
    simulation.addUnit("assault_mech", "enemy", 2760, 980),
  ];
  for (const unit of depletedUnits) {
    unit.energy = UNIT_DEFINITIONS[unit.type].maxEnergy * 0.4;
  }
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

  advance(simulation, 30 * BUILD_DURATION_MULTIPLIER);
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

test("enemy AI builds an initial combat force before reserving for expensive construction", () => {
  const simulation = new Simulation();
  simulation.aiThinkRemaining = 0;
  simulation.aiBuildIndex = 10;
  simulation.resources.enemy.metal = UNIT_DEFINITIONS.scout_mech.metalCost;
  simulation.addUnit("worker_drone_t1", "enemy", 1200, 600);
  simulation.addUnit("worker_drone_t1", "enemy", 1240, 600);
  simulation.addUnit("worker_drone_t1", "enemy", 1280, 600);
  const factory = simulation.addStructure("mech_factory_t1", "enemy", 1400, 700);

  simulation.tick(1 / 30);

  assert.equal(factory.productionQueue.length, 1);
  assert.equal(factory.productionQueue[0].unitType, "scout_mech");
  assert.equal(simulation.resources.enemy.metal, 0);
});

test("enemy AI balances combat roles and adds energy support as its army grows", () => {
  const simulation = new Simulation();
  simulation.resources.enemy.metal = 5000;
  simulation.addUnit("worker_drone_t1", "enemy", 1200, 600);
  simulation.addUnit("worker_drone_t1", "enemy", 1240, 600);
  simulation.addUnit("worker_drone_t1", "enemy", 1280, 600);
  const factory = simulation.addStructure("mech_factory_t1", "enemy", 1400, 700);

  simulation.aiThinkRemaining = 0;
  simulation.tick(1 / 30);
  simulation.aiThinkRemaining = 0;
  simulation.tick(1 / 30);

  assert.deepEqual(
    factory.productionQueue.map((order) => order.unitType),
    ["scout_mech", "assault_mech"],
  );

  factory.productionQueue = [];
  simulation.addUnit("scout_mech", "enemy", 1320, 600);
  simulation.addUnit("scout_mech", "enemy", 1360, 600);
  simulation.addUnit("assault_mech", "enemy", 1400, 600);
  simulation.aiThinkRemaining = 0;
  simulation.tick(1 / 30);

  assert.equal(factory.productionQueue[0]?.unitType, "energy_carrier");
});

test("enemy AI never exceeds three mobile energy suppliers across all branches", () => {
  const simulation = new Simulation();
  simulation.resources.enemy.metal = 50_000;
  simulation.addUnit("worker_drone_t3", "enemy", 1200, 600);
  simulation.addUnit("worker_drone_t3", "enemy", 1240, 600);
  simulation.addUnit("worker_drone_t3", "enemy", 1280, 600);
  for (let index = 0; index < 24; index += 1) {
    simulation.addUnit("scout_mech_t3", "enemy", 1320 + index * 4, 600);
  }
  simulation.addUnit("grid_tanker_t3", "enemy", 1320, 660);
  simulation.addUnit("energy_tender_t3", "enemy", 1360, 660);
  const factories = [
    simulation.addStructure("mech_factory_t3", "enemy", 1400, 700),
    simulation.addStructure("vehicle_factory_t3", "enemy", 1520, 700),
    simulation.addStructure("air_factory_t3", "enemy", 1640, 700),
  ];

  simulation.aiThinkRemaining = 0;
  simulation.tick(1 / 30);
  simulation.aiThinkRemaining = 0;
  simulation.tick(1 / 30);

  const livingSupport = simulation.units.filter(
    (unit) => unit.alive && unit.team === "enemy" && UNIT_DEFINITIONS[unit.type].transferRate,
  ).length;
  const queuedSupport = factories.reduce(
    (total, factory) => total + factory.productionQueue.filter(
      (order) => UNIT_DEFINITIONS[order.unitType].transferRate,
    ).length,
    0,
  );
  assert.equal(livingSupport, 2);
  assert.equal(queuedSupport, 1);
  assert.equal(livingSupport + queuedSupport, SIMULATION_RULES.enemyMaxMobileEnergySupport);
});

test("enemy AI reserves crystal for its next generator after fielding a combat force", () => {
  const simulation = new Simulation();
  simulation.aiThinkRemaining = 0;
  simulation.aiBuildIndex = 1;
  simulation.resources.enemy.metal = STRUCTURE_DEFINITIONS.generator.metalCost - 10;
  simulation.addUnit("worker_drone_t1", "enemy", 1200, 600);
  simulation.addUnit("worker_drone_t1", "enemy", 1240, 600);
  simulation.addUnit("worker_drone_t1", "enemy", 1280, 600);
  simulation.addUnit("scout_mech", "enemy", 1320, 600);
  simulation.addUnit("scout_mech", "enemy", 1360, 600);
  simulation.addUnit("scout_mech", "enemy", 1400, 600);
  const factory = simulation.addStructure("mech_factory_t1", "enemy", 1400, 700);

  simulation.tick(1 / 30);

  assert.equal(factory.productionQueue.length, 0);
  assert.equal(
    simulation.resources.enemy.metal,
    STRUCTURE_DEFINITIONS.generator.metalCost - 10,
  );
});

test("enemy AI only constructs a Supply Complex when its remaining supply is low", () => {
  const simulation = new Simulation();
  simulation.aiThinkRemaining = 0;
  simulation.aiBuildIndex = 9;
  simulation.resources.enemy.metal = 5000;
  simulation.addStructure("generator", "enemy", 2880, 800);

  simulation.tick(1 / 30);

  assert.equal(
    simulation.structures.some((structure) => structure.type === "supply_complex"),
    false,
  );

  for (let index = 0; index < 57; index += 1) {
    simulation.addUnit(
      "assault_mech_t3",
      "enemy",
      400 + (index % 10) * 40,
      400 + Math.floor(index / 10) * 40,
    );
  }
  assert.ok(
    simulation.getSupplyState("enemy").remaining <=
      simulation.getSupplyState("enemy").capacity * SIMULATION_RULES.enemySupplyLowRatio,
  );
  simulation.addUnit("worker_drone_t1", "enemy", 2800, 800);
  simulation.aiThinkRemaining = 0;
  const startingMetal = simulation.resources.enemy.metal;

  simulation.tick(1 / 30);

  const supplyComplex = simulation.structures.find(
    (structure) => structure.alive && structure.team === "enemy" && structure.type === "supply_complex",
  );
  assert.ok(supplyComplex);
  assert.equal(supplyComplex.complete, false);
  assert.equal(
    simulation.resources.enemy.metal,
    startingMetal - STRUCTURE_DEFINITIONS.supply_complex.metalCost,
  );
});

test("enemy AI establishes a paid outpost and expands to another crystal deposit", () => {
  const simulation = Simulation.createFieldTest();
  simulation.aiThinkRemaining = 0;
  simulation.aiBuildIndex = 4;
  simulation.resources.enemy.metal = 5000;
  const enemyStart = simulation.teamStarts.enemy;
  simulation.addStructure("generator", "enemy", enemyStart.x, enemyStart.y + 160);
  simulation.addStructure("sentry_turret", "enemy", enemyStart.x - 160, enemyStart.y);
  simulation.addStructure("charger", "enemy", enemyStart.x, enemyStart.y - 160);
  simulation.addUnit("scout_mech", "enemy", enemyStart.x - 80, enemyStart.y + 200);
  simulation.addUnit("scout_mech", "enemy", enemyStart.x, enemyStart.y + 200);
  simulation.addUnit("scout_mech", "enemy", enemyStart.x + 80, enemyStart.y + 200);

  simulation.tick(1 / 30);

  const expansionGenerator = simulation.structures.find(
    (structure) =>
      structure.alive &&
      !structure.complete &&
      structure.team === "enemy" &&
      structure.type === "generator",
  );
  assert.ok(expansionGenerator);
  assert.ok(
    simulation.metalDeposits.some(
      (deposit) =>
        deposit.id !== simulation.structures.find(
          (structure) => structure.team === "enemy" && structure.type === "metal_mine",
        ).depositId &&
        Math.hypot(deposit.x - expansionGenerator.x, deposit.y - expansionGenerator.y) <=
          STRUCTURE_DEFINITIONS.generator.powerRadius,
    ),
  );

  advance(simulation, 40 * BUILD_DURATION_MULTIPLIER);

  const enemyMines = simulation.structures.filter(
    (structure) =>
      structure.alive &&
      structure.complete &&
      structure.team === "enemy" &&
      STRUCTURE_DEFINITIONS[structure.type].family === "metal_mine",
  );
  assert.ok(enemyMines.length >= 2);
});

test("fortified opposition accelerates AI expansion beyond two harvesters", () => {
  const simulation = new Simulation({ width: 2200, height: 1400 });
  simulation.teamStarts.enemy = { x: 1800, y: 700 };
  const anchor = simulation.addStructure("generator", "enemy", 1800, 700);
  for (const [index, x] of [1660, 1500].entries()) {
    const deposit = simulation.addMetalDeposit(x, 700);
    simulation.addStructure("metal_mine", "enemy", x, 700, { depositId: deposit.id });
  }
  const openDeposit = simulation.addMetalDeposit(900, 700);
  simulation.resources.enemy.metal = 600;
  simulation.addStructure("sentry_turret", "player", 300, 620);
  simulation.addStructure("sentry_turret", "player", 340, 700);
  simulation.addStructure("sentry_turret", "player", 300, 780);

  const request = simulation.getEnemyExpansionRequest(anchor, "enemy");

  assert.ok(request, "the AI should expand instead of waiting for extreme metal reserves");
  assert.equal(request.urgent, true);
  assert.ok(Math.hypot(request.x - openDeposit.x, request.y - openDeposit.y) <= 220);
});

test("AI strategy requests a sentry at every undefended remote harvester", () => {
  const simulation = new Simulation({ width: 2200, height: 1400 });
  simulation.teamStarts.enemy = { x: 1800, y: 700 };
  const anchor = simulation.addStructure("generator", "enemy", 1800, 700);
  simulation.addStructure("generator", "enemy", 760, 700);
  const deposit = simulation.addMetalDeposit(620, 700);
  const mine = simulation.addStructure("metal_mine", "enemy", 620, 700, {
    depositId: deposit.id,
  });
  simulation.addStructure("mech_factory_t1", "enemy", 1700, 820);
  simulation.addStructure("battery", "enemy", 1740, 620);
  simulation.addStructure("charger", "enemy", 1660, 620);
  simulation.addStructure("sentry_turret", "enemy", 1700, 700);
  simulation.addUnit("scout_mech", "enemy", 1660, 780);
  simulation.addUnit("scout_mech", "enemy", 1700, 780);
  simulation.addUnit("scout_mech", "enemy", 1740, 780);

  const request = simulation.getEnemyOutpostDefenseRequest("enemy", anchor);

  assert.equal(request.type, "sentry_turret");
  assert.equal(request.outpostMineId, mine.id);
  assert.ok(
    Math.hypot(request.x - mine.x, request.y - mine.y) <=
      SIMULATION_RULES.enemyOutpostDefenseRadius,
  );
  const strategicRequest = simulation.getEnemyStrategicConstructionRequest(
    "enemy",
    anchor,
    [],
    (forward, side = 0) => ({ x: anchor.x - forward, y: anchor.y + side }),
    7,
  );
  assert.equal(strategicRequest.type, "sentry_turret");
  assert.equal(strategicRequest.outpostMineId, mine.id);

  simulation.addStructure("sentry_turret", "enemy", request.x, request.y);
  assert.equal(simulation.getEnemyOutpostDefenseRequest("enemy", anchor), null);
});

test("AI outpost garrisons stay out of attack waves and answer local threats", () => {
  const simulation = new Simulation({ width: 2400, height: 1500 });
  simulation.teamStarts.enemy = { x: 2000, y: 750 };
  const anchor = simulation.addStructure("generator", "enemy", 2000, 750);
  simulation.addStructure("generator", "enemy", 880, 750);
  const deposit = simulation.addMetalDeposit(720, 750);
  const mine = simulation.addStructure("metal_mine", "enemy", 720, 750, {
    depositId: deposit.id,
  });
  const combatUnits = Array.from({ length: 5 }, (_, index) =>
    simulation.addUnit("scout_mech", "enemy", 1800 + index * 35, 700),
  );
  const distantTarget = simulation.addStructure("generator", "player", 160, 160);

  simulation.updateEnemyExpansionGarrisons("enemy", anchor, [distantTarget]);
  const garrison = combatUnits.filter((unit) => unit.garrisonStructureId === mine.id);
  assert.equal(garrison.length, SIMULATION_RULES.enemyOutpostGarrisonSize);
  assert.ok(garrison.every((unit) => unit.moveTarget));

  simulation.resources.enemy.metal = 0;
  simulation.aiThinkRemaining = 0;
  simulation.tick(1 / 30);
  const fieldArmy = combatUnits.filter((unit) => !unit.garrisonStructureId);
  assert.equal(fieldArmy.length, SIMULATION_RULES.enemyAttackWaveSize);
  assert.ok(fieldArmy.every((unit) => unit.moveMode === "advance"));
  assert.ok(fieldArmy.every((unit) => unit.moveTarget));
  assert.ok(garrison.every((unit) => unit.moveMode !== "advance"));

  const localThreat = simulation.addUnit("scout_mech", "player", mine.x + 120, mine.y);
  simulation.updateEnemyExpansionGarrisons("enemy", anchor, [distantTarget, localThreat]);
  assert.ok(garrison.every((unit) => unit.attackTargetId === localThreat.id));
});

test("enemy AI expands beyond four harvesters when crystal is low and skips player claims", () => {
  const simulation = new Simulation();
  simulation.aiThinkRemaining = 0;
  simulation.aiBuildIndex = 9;
  simulation.resources.enemy.metal = SIMULATION_RULES.enemyLowMetalThreshold;
  simulation.addStructure("generator", "enemy", 1000, 1000);
  simulation.addStructure("generator", "enemy", 1080, 920);
  simulation.addStructure("generator", "enemy", 1080, 1000);
  simulation.addStructure("mech_factory_t1", "enemy", 840, 1160);
  simulation.addStructure("battery", "enemy", 920, 920);
  simulation.addStructure("sentry_turret", "enemy", 840, 960);
  simulation.addStructure("sentry_turret", "enemy", 800, 920);
  simulation.addStructure("sentry_turret", "enemy", 800, 1000);
  simulation.addStructure("sentry_turret", "enemy", 800, 1080);
  simulation.addStructure("charger", "enemy", 920, 1080);
  simulation.addUnit("scout_mech", "enemy", 840, 1080);
  simulation.addUnit("scout_mech", "enemy", 880, 1080);
  simulation.addUnit("scout_mech", "enemy", 920, 1080);
  simulation.addUnit("worker_drone_t1", "enemy", 920, 1000);

  for (let index = 0; index < 5; index += 1) {
    const deposit = simulation.addMetalDeposit(200 + index * 100, 200);
    simulation.addStructure("metal_mine", "enemy", deposit.x, deposit.y, {
      depositId: deposit.id,
    });
  }
  const claimedDeposit = simulation.addMetalDeposit(1020, 1100);
  simulation.addStructure("metal_mine", "player", claimedDeposit.x, claimedDeposit.y, {
    depositId: claimedDeposit.id,
  });
  const availableDeposit = simulation.addMetalDeposit(1120, 1000);

  simulation.tick(1 / 30);

  const expansionMine = simulation.structures.find(
    (structure) =>
      structure.alive &&
      !structure.complete &&
      structure.team === "enemy" &&
      structure.type === "metal_mine",
  );
  assert.ok(expansionMine);
  assert.equal(expansionMine.depositId, availableDeposit.id);
  assert.notEqual(expansionMine.depositId, claimedDeposit.id);
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
  ];
  simulation.aiThinkRemaining = 0;

  simulation.tick(1 / 30);
  assert.ok(staged.every((unit) => unit.attackTargetId === null));

  const third = simulation.addUnit("scout_mech", "enemy", 1040, 520);
  simulation.aiThinkRemaining = 0;
  simulation.tick(1 / 30);

  assert.equal(SIMULATION_RULES.enemyAttackWaveSize, 3);
  assert.ok([...staged, third].every((unit) => unit.moveMode === "advance"));
  assert.ok([...staged, third].every((unit) => unit.moveTarget));
  assert.ok([...staged, third].every((unit) => unit.moveTarget.x < unit.x));
});

test("enemy AI does not count armed workers as an attack wave", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  const workers = [
    simulation.addUnit("worker_drone_t1", "enemy", 1000, 440),
    simulation.addUnit("worker_drone_t1", "enemy", 1020, 480),
    simulation.addUnit("worker_drone_t1", "enemy", 1040, 520),
  ];
  simulation.aiThinkRemaining = 0;

  simulation.tick(1 / 30);

  assert.ok(workers.every((worker) => worker.moveMode !== "advance"));
  assert.ok(workers.every((worker) => worker.moveTarget === null));
});

test("enemy combat units fire at nearby workers while advancing", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  const attackers = [
    simulation.addUnit("scout_mech", "enemy", 1000, 440),
    simulation.addUnit("scout_mech", "enemy", 1020, 480),
    simulation.addUnit("scout_mech", "enemy", 1040, 520),
  ];
  simulation.aiThinkRemaining = 0;
  simulation.tick(1 / 30);

  const destination = { ...attackers[0].moveTarget };
  const firingPosition = { x: attackers[0].x, y: attackers[0].y };
  const worker = simulation.addUnit("worker_drone_t1", "player", 930, 440);
  const startingHp = worker.hp;
  simulation.tick(1 / 30);

  assert.deepEqual(
    { x: attackers[0].x, y: attackers[0].y },
    firingPosition,
    "an advancing unit should stop before firing",
  );
  assert.equal(attackers[0].attackTargetId, worker.id);
  assert.equal(attackers[0].attackTargetMode, "automatic");
  assert.equal(attackers[0].moveMode, "advance");
  assert.deepEqual(attackers[0].moveTarget, destination);
  assert.equal(worker.hp, startingHp);
  advanceToScheduledImpacts(simulation);
  assert.ok(worker.hp < startingHp);

  simulation.applyDamage(worker, worker.hp, attackers[0]);
  simulation.tick(1 / 30);

  assert.ok(
    Math.hypot(attackers[0].x - destination.x, attackers[0].y - destination.y) <
      Math.hypot(firingPosition.x - destination.x, firingPosition.y - destination.y),
    "the advancing unit should resume its strategic route after the target is destroyed",
  );
});

test("enemy AI holds an outmatched wave until enough attackers are staged", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "enemy", 1800, 800);
  const staged = [
    simulation.addUnit("scout_mech", "enemy", 1260, 720),
    simulation.addUnit("scout_mech", "enemy", 1300, 760),
    simulation.addUnit("scout_mech", "enemy", 1340, 800),
  ];
  simulation.addStructure("sentry_turret", "player", 560, 760);
  simulation.addStructure("sentry_turret", "player", 600, 800);
  simulation.addStructure("sentry_turret", "player", 640, 840);
  simulation.aiThinkRemaining = 0;

  simulation.tick(1 / 30);

  assert.ok(staged.every((unit) => unit.moveTarget === null));
  assert.ok(staged.every((unit) => unit.moveMode !== "advance"));
  assert.ok(!simulation.events.some((event) => event.type === "enemy_wave"));
  assert.ok(!simulation.events.some((event) => event.type === "enemy_retreat"));

  const reinforcement = simulation.addUnit("scout_mech", "enemy", 1380, 840);
  simulation.aiThinkRemaining = 0;
  simulation.tick(1 / 30);

  assert.ok([...staged, reinforcement].every((unit) => unit.moveMode === "advance"));
  const wave = simulation.events.find((event) => event.type === "enemy_wave");
  assert.equal(wave.unitIds.length, 4);
});

test("enemy AI chooses a safer target instead of attacking a defended position", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "enemy", 1800, 800);
  const attackers = [
    simulation.addUnit("scout_mech", "enemy", 1260, 720),
    simulation.addUnit("scout_mech", "enemy", 1300, 760),
    simulation.addUnit("scout_mech", "enemy", 1340, 800),
  ];
  const defendedTarget = simulation.addStructure("generator", "player", 700, 800);
  simulation.addStructure("sentry_turret", "player", 660, 760);
  simulation.addStructure("sentry_turret", "player", 700, 840);
  simulation.addStructure("sentry_turret", "player", 740, 800);
  const saferTarget = simulation.addStructure("generator", "player", 500, 100);
  simulation.aiThinkRemaining = 0;

  simulation.tick(1 / 30);

  assert.ok(attackers.every((unit) => unit.moveMode === "advance"));
  assert.ok(attackers.every(
    (unit) => distance(unit.moveTarget, saferTarget) < distance(unit.moveTarget, defendedTarget),
  ));
  const wave = simulation.events.find((event) => event.type === "enemy_wave");
  assert.equal(wave.targetId, saferTarget.id);
  assert.notEqual(wave.targetId, defendedTarget.id);
});

test("an already dispatched AI assault does not turn around when defenses appear", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "enemy", 1800, 800);
  const target = simulation.addStructure("generator", "player", 100, 800);
  const attackers = [
    simulation.addUnit("scout_mech", "enemy", 860, 760),
    simulation.addUnit("scout_mech", "enemy", 900, 800),
    simulation.addUnit("scout_mech", "enemy", 940, 840),
  ];
  simulation.aiThinkRemaining = 0;
  simulation.tick(1 / 30);
  assert.ok(attackers.every((unit) => unit.moveMode === "advance"));
  const assaultDestinations = attackers.map((unit) => ({ ...unit.moveTarget }));

  simulation.addStructure("sentry_turret", "player", 500, 760);
  simulation.addStructure("sentry_turret", "player", 500, 800);
  simulation.addStructure("sentry_turret", "player", 500, 840);
  simulation.aiThinkRemaining = 0;
  simulation.tick(1 / 30);

  assert.ok(attackers.every((unit) => unit.moveMode === "advance"));
  assert.deepEqual(attackers.map((unit) => unit.moveTarget), assaultDestinations);
  assert.ok(attackers.every(
    (unit) => distance(unit.moveTarget, target) < distance(unit, target),
  ));
  assert.ok(!simulation.events.some((event) => event.type === "enemy_retreat"));
});

test("enemy combat units immediately answer structures rushed near their base as a wave", () => {
  const simulation = new Simulation();
  const enemyGenerator = simulation.addStructure("generator", "enemy", 1000, 800);
  const defenders = [
    simulation.addUnit("scout_mech", "enemy", 1080, 800),
    simulation.addUnit("scout_mech", "enemy", 1080, 840),
    simulation.addUnit("scout_mech", "enemy", 1080, 760),
  ];
  const forwardGenerator = simulation.addStructure("generator", "player", 1500, 800);
  simulation.addStructure("sentry_turret", "player", 1460, 800);
  simulation.aiThinkRemaining = 0;

  simulation.tick(1 / 30);

  assert.ok(
    Math.hypot(forwardGenerator.x - enemyGenerator.x, forwardGenerator.y - enemyGenerator.y) <=
      SIMULATION_RULES.enemyRushResponseRadius,
  );
  assert.ok(defenders.every((defender) => defender.attackTargetId === null));
  assert.ok(defenders.every((defender) => defender.moveMode === "advance"));
  assert.ok(defenders.every((defender) => defender.moveTarget));

  assert.equal(
    simulation.events.find((event) => event.type === "enemy_wave").unitIds.length,
    defenders.length,
  );
});

test("enemy rush responses wait for a coordinated force instead of sending one unit", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "enemy", 1000, 800);
  const defender = simulation.addUnit("scout_mech", "enemy", 1080, 800);
  simulation.addStructure("generator", "player", 1500, 800);
  simulation.aiThinkRemaining = 0;

  simulation.tick(1 / 30);

  assert.equal(defender.moveMode, null);
  assert.equal(defender.moveTarget, null);
  assert.ok(!simulation.events.some((event) => event.type === "enemy_wave"));
});

test("cancelling construction removes the foundation, clears workers, and refunds unbuilt crystal", () => {
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

test("destroying every enemy unit and building ends the match in victory", () => {
  const simulation = new Simulation({ matchRulesEnabled: true });
  simulation.addUnit("worker_drone_t1", "player", 100, 100);
  simulation.addStructure("generator", "player", 160, 100);
  const enemyUnit = simulation.addUnit("scout_mech", "enemy", 700, 100);
  const enemyFoundation = simulation.addStructure("battery", "enemy", 760, 100, {
    complete: false,
    constructionProgress: 1,
  });

  simulation.applyDamage(enemyUnit, enemyUnit.hp);
  assert.equal(simulation.matchResult, null);

  simulation.applyDamage(enemyFoundation, enemyFoundation.hp);
  simulation.tick(1 / 30);
  assert.equal(simulation.matchResult, "victory");
  assert.equal(simulation.events.at(-1).type, "match_complete");
  assert.equal(simulation.events.at(-1).winner, "player");

  const completedAt = simulation.time;
  simulation.tick(1);
  assert.equal(simulation.time, completedAt);
});

test("losing every player unit and building ends the match in defeat", () => {
  const simulation = new Simulation({ matchRulesEnabled: true });
  const playerUnit = simulation.addUnit("worker_drone_t1", "player", 100, 100);
  const playerStructure = simulation.addStructure("generator", "player", 160, 100);
  simulation.addUnit("scout_mech", "enemy", 700, 100);
  simulation.addStructure("generator", "enemy", 760, 100);

  simulation.applyDamage(playerUnit, playerUnit.hp);
  assert.equal(simulation.matchResult, null);

  simulation.applyDamage(playerStructure, playerStructure.hp);
  simulation.tick(1 / 30);
  assert.equal(simulation.matchResult, "defeat");
  assert.equal(simulation.events.at(-1).type, "match_complete");
  assert.equal(simulation.events.at(-1).winner, "enemy");
});

test("destroying a Headquarters instantly eliminates all of that commander's assets", () => {
  const simulation = new Simulation({ matchRulesEnabled: true });
  const headquarters = simulation.addStructure("headquarters", "player", 180, 180);
  simulation.addStructure("generator", "player", 340, 180);
  simulation.addStructure("mech_factory_t1", "player", 500, 180);
  simulation.addUnit("worker_drone_t1", "player", 260, 300);
  simulation.addUnit("scout_mech", "enemy", 900, 500);
  simulation.addStructure("headquarters", "enemy", 1040, 500);

  simulation.applyDamage(headquarters, headquarters.hp);

  assert.ok(simulation.units.filter((unit) => unit.team === "player").every((unit) => !unit.alive));
  assert.ok(
    simulation.structures
      .filter((structure) => structure.team === "player")
      .every((structure) => !structure.alive),
  );
  assert.equal(simulation.matchResult, "defeat");
  assert.equal(simulation.matchWinnerTeamId, "enemy");
  assert.equal(simulation.events.at(-1).type, "match_complete");
});

test("field tests enable elimination while isolated simulations remain opt-in", () => {
  const isolated = new Simulation();
  isolated.addUnit("worker_drone_t1", "player", 100, 100);
  isolated.tick(1 / 30);
  assert.equal(isolated.matchResult, null);

  const fieldTest = Simulation.createFieldTest();
  assert.equal(fieldTest.matchRulesEnabled, true);
  assert.equal(fieldTest.matchResult, null);
});

test("multiplayer field tests disable the enemy commander AI", () => {
  const simulation = Simulation.createFieldTest({ enemyAiEnabled: false });
  const enemyFactory = simulation.structures.find(
    (structure) => structure.team === "enemy" && structure.type === "mech_factory_t1",
  );

  advance(simulation, SIMULATION_RULES.enemyInitialThinkDelay + SIMULATION_RULES.enemyThinkInterval * 2);

  assert.equal(simulation.enemyAiEnabled, false);
  assert.equal(enemyFactory.productionQueue.length, 0);
  assert.equal(simulation.aiBuildIndex, 1);
});

test("simulation snapshots restore a playable multiplayer client state", () => {
  const host = Simulation.createFieldTest({ enemyAiEnabled: false });
  const westernWorker = host.units.find((unit) => unit.team === "player");
  host.commandMove([westernWorker.id], westernWorker.x + 80, westernWorker.y);
  advance(host, 0.5);
  const yard = host.addStructure("salvage_yard", "player", 700, 700);
  const wreck = host.addWreck(760, 700, 25);

  const networkPayload = JSON.parse(JSON.stringify(host.createSnapshot()));
  const guest = Simulation.fromSnapshot(networkPayload);

  assert.equal(guest.enemyAiEnabled, false);
  assert.equal(guest.time, host.time);
  assert.equal(guest.units.length, host.units.length);
  assert.equal(guest.structures.length, host.structures.length);
  assert.deepEqual(guest.resources, host.resources);
  assert.deepEqual(guest.powerLinks, host.powerLinks);
  assert.equal(guest.getUnit(westernWorker.id).x, host.getUnit(westernWorker.id).x);
  assert.equal(guest.getEntity(yard.id), guest.structures.find((structure) => structure.id === yard.id));
  assert.equal(guest.getEntity(yard.drones[0].id), guest.getDrones()[0]);
  assert.equal(guest.getEntity(wreck.id), guest.wrecks.find((candidate) => candidate.id === wreck.id));
  assert.doesNotThrow(() => guest.tick(1 / 30));
});

test("mixed human and AI matches continue until only one command team remains", () => {
  const simulation = Simulation.createFieldTest({ playerCount: 3, enemyAiEnabled: true });
  simulation.teams.find((team) => team.id === "enemy").kind = "human";
  delete simulation.aiStates.enemy;

  for (const unit of simulation.units.filter((entity) => entity.team === "player")) unit.alive = false;
  for (const structure of simulation.structures.filter((entity) => entity.team === "player")) structure.alive = false;
  simulation.tick(1 / 30);
  assert.equal(simulation.matchResult, null);

  for (const unit of simulation.units.filter((entity) => entity.team === "enemy-2")) unit.alive = false;
  for (const structure of simulation.structures.filter((entity) => entity.team === "enemy-2")) structure.alive = false;
  simulation.tick(1 / 30);
  assert.equal(simulation.matchResult, "defeat");
  assert.equal(simulation.matchWinnerTeamId, "enemy");

  const restored = Simulation.fromSnapshot(JSON.parse(JSON.stringify(simulation.createSnapshot())));
  assert.equal(restored.matchWinnerTeamId, "enemy");
});

test("multiplayer lobby codes are exactly ten uppercase letters and numbers", () => {
  const code = generateLobbyCode(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));

  assert.equal(code, "ABCDEFGHJK");
  assert.equal(code.length, 10);
  assert.equal(isValidLobbyCode(code), true);
  assert.equal(normalizeLobbyCode("ab12-cd34 ef"), "AB12CD34EF");
  assert.equal(isValidLobbyCode("TOO-SHORT"), false);
});

test("every player count offers multiple dense and selectable battlefield layouts", () => {
  const allMapIds = new Set();
  for (let playerCount = 2; playerCount <= 8; playerCount += 1) {
    const maps = getMapsForPlayerCount(playerCount);
    assert.ok(maps.length >= 3);
    assert.deepEqual(
      new Set(maps.map((map) => map.theme)),
      new Set(["grassland", "apocalypse"]),
      `${playerCount}-player maps should include green and red environments`,
    );
    for (const map of maps) {
      assert.equal(map.playerCount, playerCount);
      assert.equal(map.starts.length, playerCount);
      assert.ok(map.terrain.length >= 10, `${map.name} should have a substantial terrain layout`);
      const outerTerrain = map.terrain.filter((obstacle) => {
        const normalizedX = (obstacle.x - map.width / 2) / (map.width / 2);
        const normalizedY = (obstacle.y - map.height / 2) / (map.height / 2);
        return Math.hypot(normalizedX, normalizedY) >= 0.65;
      });
      assert.ok(
        outerTerrain.length >= 6,
        `${map.name} should place substantial terrain outside the center of the battlefield`,
      );
      if (playerCount >= 3) {
        assert.equal(
          map.terrain.filter((obstacle) => obstacle.zone === "outer").length,
          playerCount * 2,
          `${map.name} should have two outer landmarks per player sector`,
        );
      }
      assert.ok(map.deposits.length >= playerCount * 2);
      assert.ok(map.deposits.some((deposit) => deposit.rich));
      assert.ok(map.starts.every((start) =>
        start.x >= 0 && start.x <= map.width && start.y >= 0 && start.y <= map.height));
      for (const start of map.starts) {
        const startingPoints = [start, start.generator, start.mine, start.factory, ...start.workers];
        for (const point of startingPoints) {
          assert.equal(map.terrain.some((obstacle) =>
            Math.abs(point.x - obstacle.x) <= obstacle.width / 2 + 40 &&
            Math.abs(point.y - obstacle.y) <= obstacle.height / 2 + 40), false);
        }
      }
      assert.equal(getMatchMap(playerCount, map.id).id, map.id);
      assert.equal(allMapIds.has(map.id), false);
      allMapIds.add(map.id);
      for (const deposit of map.deposits) {
        assert.equal(map.terrain.some((obstacle) =>
          Math.abs(deposit.x - obstacle.x) <= obstacle.width / 2 + 20 &&
          Math.abs(deposit.y - obstacle.y) <= obstacle.height / 2 + 20), false);
      }
    }
    assert.equal(getRandomMatchMap(playerCount, 0).id, maps[0].id);
    assert.equal(getRandomMatchMap(playerCount, 0.999).id, maps.at(-1).id);
  }
  assert.throws(() => getMatchMap(9), /between 2 and 8/);
});

test("the three-player ancient ruins map is a dense ruin complex", () => {
  const map = getMatchMap(3, "3-player-ancient-ruins");

  assert.equal(map.name, "Ancient Triad");
  assert.match(map.description, /ruin/i);
  assert.ok(map.description.includes("outer districts"));
  assert.ok(map.terrain.length >= 16);
  assert.equal(map.terrain.filter((obstacle) => obstacle.zone === "outer").length, 6);
  assert.ok(map.terrain.every((obstacle) => obstacle.terrainType === "ruins"));
});

test("an eight-player match gives every commander the standard starting package", () => {
  const simulation = Simulation.createFieldTest({ playerCount: 8, enemyAiEnabled: false });

  assert.equal(simulation.teams.length, 8);
  assert.equal(Object.keys(simulation.resources).length, 8);
  assert.equal(Object.keys(simulation.aiStates).length, 7);
  assert.equal(
    new Set(Object.values(simulation.aiStates).map((state) => state.thinkRemaining)).size,
    7,
    "AI think cycles should be distributed instead of firing on one simulation tick",
  );
  for (const team of simulation.teams) {
    const units = simulation.units.filter((unit) => unit.alive && unit.team === team.id);
    const structures = simulation.structures.filter(
      (structure) => structure.alive && structure.complete && structure.team === team.id,
    );
    assert.equal(units.filter((unit) => unit.type === "worker_drone_t1").length, 3);
    assert.deepEqual(
      structures.map((structure) => structure.type).sort(),
      ["generator", "headquarters", "mech_factory_t1", "metal_mine"],
    );
    assert.equal(structures.find((structure) => structure.type === "metal_mine").powered, true);
  }
});

test("match teams preserve per-AI difficulty and player-selected alliances", () => {
  const teams = createMatchTeams(4, [
    { allianceId: "alpha" },
    { allianceId: "alpha", difficulty: "easy" },
    { allianceId: "beta", difficulty: "hard" },
    { allianceId: "beta", difficulty: "invalid" },
  ]);

  assert.deepEqual(teams.map((team) => team.allianceId), ["alpha", "alpha", "beta", "beta"]);
  assert.deepEqual(teams.slice(1).map((team) => team.difficulty), ["easy", "hard", "medium"]);

  const duelTeams = createMatchTeams(2, [
    { allianceId: "same" },
    { allianceId: "same", difficulty: "hard" },
  ]);
  assert.deepEqual(duelTeams.map((team) => team.allianceId), ["team-1", "team-2"]);
});

test("AI difficulty changes deterministic decision cadence and attack preparation", () => {
  const simulation = new Simulation({
    teams: createMatchTeams(4, [
      {},
      { difficulty: "easy" },
      { difficulty: "medium" },
      { difficulty: "hard" },
    ]),
  });
  const aiTeams = simulation.teams.filter((team) => team.kind === "ai");
  for (const team of aiTeams) {
    simulation.aiStates[team.id].thinkRemaining = 0;
    simulation.updateAiTeam(team.id, 0);
  }

  assert.deepEqual(
    aiTeams.map((team) => simulation.aiStates[team.id].thinkRemaining),
    [1.8, 1, 0.55],
  );
  assert.deepEqual(aiTeams.map((team) => simulation.getEnemyAttackWaveSize(team.id)), [5, 3, 3]);
});

test("eliminated AI commanders stop running strategic decisions", () => {
  const simulation = new Simulation({ teams: createMatchTeams(3) });
  for (let index = 0; index < 300; index += 1) {
    simulation.addUnit("scout_mech", "player", 100 + index * 20, 100);
  }
  let strategicEvaluations = 0;
  simulation.getEnemyStrategicConstructionRequest = () => {
    strategicEvaluations += 1;
    return null;
  };
  simulation.aiStates.enemy.thinkRemaining = 0;

  simulation.updateAiTeam("enemy", 0);

  assert.equal(strategicEvaluations, 0);
  assert.equal(
    simulation.aiStates.enemy.thinkRemaining,
    SIMULATION_RULES.enemyDifficultyProfiles.medium.thinkInterval,
  );
});

test("allied commanders share vision, reject friendly fire, and win together", () => {
  const teams = createMatchTeams(3, [
    { allianceId: "allies" },
    { allianceId: "allies", difficulty: "medium" },
    { allianceId: "opposition", difficulty: "medium" },
  ]);
  const simulation = new Simulation({ teams, matchRulesEnabled: true, enemyAiEnabled: false });
  const playerUnit = simulation.addUnit("scout_mech", "player", 100, 100);
  const alliedUnit = simulation.addUnit("scout_mech", "enemy", 130, 100);
  const hostileUnit = simulation.addUnit("scout_mech", "enemy-2", 180, 100);

  assert.equal(simulation.isEntityVisibleToTeam("player", alliedUnit), true);
  assert.equal(simulation.commandAttack([playerUnit.id], alliedUnit.id), 0);
  const alliedHp = alliedUnit.hp;
  simulation.applyDamage(alliedUnit, 25, playerUnit);
  assert.equal(alliedUnit.hp, alliedHp);

  simulation.assignAutomaticTargets();
  assert.equal(playerUnit.attackTargetId, hostileUnit.id);
  assert.equal(simulation.updateMatchResult(), null);

  simulation.applyDamage(hostileUnit, hostileUnit.hp, playerUnit);
  simulation.tick(1 / 30);
  assert.equal(simulation.matchResult, "victory");
  assert.equal(alliedUnit.alive, true);
});

test("snapshots preserve AI difficulties and commander alliances", () => {
  const original = Simulation.createFieldTest({
    playerCount: 3,
    commanderOptions: [
      { allianceId: "blue" },
      { allianceId: "blue", difficulty: "easy" },
      { allianceId: "red", difficulty: "hard" },
    ],
  });
  const restored = Simulation.fromSnapshot(original.createSnapshot());

  assert.deepEqual(restored.teams, original.teams);
  assert.equal(restored.getAllianceId("enemy"), "blue");
  assert.equal(restored.getTeam("enemy-2").difficulty, "hard");
});

test("every AI commander makes decisions with independent state and resources", () => {
  const simulation = Simulation.createFieldTest({ playerCount: 4 });
  for (const team of simulation.teams.filter((candidate) => candidate.kind === "ai")) {
    simulation.aiStates[team.id].thinkRemaining = 0;
  }

  simulation.tick(1 / 30);

  for (const team of simulation.teams.filter((candidate) => candidate.kind === "ai")) {
    assert.equal(simulation.aiStates[team.id].decisionIndex, 2);
    assert.ok(simulation.structures.some(
      (structure) =>
        structure.alive &&
        structure.team === team.id &&
        structure.type === "generator" &&
        !structure.complete,
    ));
    assert.equal(simulation.structures.some(
      (structure) =>
        structure.alive &&
        structure.team === team.id &&
        STRUCTURE_DEFINITIONS[structure.type].family === "battery",
    ), false);
    assert.ok(simulation.resources[team.id].metal < 520);
  }
});

test("victory waits until every AI commander has been eliminated", () => {
  const simulation = new Simulation({
    teams: createMatchTeams(3),
    matchRulesEnabled: true,
    enemyAiEnabled: false,
  });
  simulation.addUnit("worker_drone_t1", "player", 100, 100);
  const firstEnemy = simulation.addUnit("scout_mech", "enemy", 600, 100);
  const secondEnemy = simulation.addUnit("scout_mech", "enemy-2", 900, 100);

  simulation.applyDamage(firstEnemy, firstEnemy.hp);
  simulation.tick(1 / 30);
  assert.equal(simulation.matchResult, null);

  simulation.applyDamage(secondEnemy, secondEnemy.hp);
  simulation.tick(1 / 30);
  assert.equal(simulation.matchResult, "victory");
});

test("snapshots preserve multi-AI teams, starts, maps, and decision state", () => {
  const host = Simulation.createFieldTest({ playerCount: 5, enemyAiEnabled: false });
  host.aiStates["enemy-3"].decisionIndex = 6;
  host.aiStates["enemy-3"].constructionLosses = [{ x: 420, y: 360, time: 12 }];
  const restored = Simulation.fromSnapshot(JSON.parse(JSON.stringify(host.createSnapshot())));

  assert.deepEqual(restored.teams, host.teams);
  assert.deepEqual(restored.teamStarts, host.teamStarts);
  assert.deepEqual(restored.aiStates, host.aiStates);
  assert.equal(restored.mapId, host.mapId);
  assert.equal(restored.mapName, host.mapName);
  assert.equal(Object.keys(restored.resources).length, 5);
});

test("tactical minimap crystal markers use bright fog-independent colors", () => {
  assert.deepEqual(minimapDepositMarkerStyle({ rich: false }), {
    fill: "#ff2445",
    stroke: "#ff9aaa",
    radius: 3,
  });
  assert.deepEqual(minimapDepositMarkerStyle({ rich: true }), {
    fill: "#ff4962",
    stroke: "#ffe4e8",
    radius: 4,
  });
});

test("mortar shells travel faster and keep tracking moving targets", () => {
  const simulation = new Simulation({ enemyAiEnabled: false });
  const mortar = simulation.addStructure("mortar_turret", "player", 300, 300, {
    powered: true,
  });
  const target = simulation.addUnit("raider", "enemy", 650, 300);
  const startingHp = target.hp;

  simulation.updateStaticDefenses(1 / 30);

  const attackEvent = simulation.events.find(
    (event) => event.type === "attack" && event.sourceId === mortar.id,
  );
  assert.equal(STRUCTURE_DEFINITIONS.mortar_turret.projectileSpeed, 520);
  assert.equal(attackEvent.tracksTarget, true);
  assert.ok(attackEvent.impactDelay < 0.7);

  target.x = 760;
  target.y = 380;
  advanceToScheduledImpacts(simulation);

  assert.equal(target.hp, startingHp - STRUCTURE_DEFINITIONS.mortar_turret.attackDamage);
});

test("enemy AI assigns spare workers to powered factory production", () => {
  const simulation = new Simulation({ enemyAiEnabled: false });
  simulation.resources.enemy.metal = 10_000;
  simulation.addStructure("generator_t3", "enemy", 120, 200, { powered: true });
  simulation.addStructure("generator_t3", "enemy", 120, 360, { powered: true });
  const factory = simulation.addStructure("mech_factory_t1", "enemy", 320, 280, {
    powered: true,
  });
  const workers = [
    simulation.addUnit("worker_drone_t1", "enemy", 384, 260),
    simulation.addUnit("worker_drone_t1", "enemy", 384, 280),
    simulation.addUnit("worker_drone_t1", "enemy", 384, 300),
  ];
  assert.equal(simulation.queueProduction(factory.id, "scout_mech"), true);
  simulation.resources.enemy.metal = 0;
  simulation.aiThinkRemaining = 0;

  simulation.updateAiTeam("enemy", 0);
  assert.equal(workers.filter((worker) => worker.productionAssistTargetId === factory.id).length, 2);
  assert.equal(workers.filter((worker) => !worker.productionAssistTargetId).length, 1);

  simulation.updateProduction(1);
  assert.equal(
    factory.productionQueue[0].progress,
    STRUCTURE_DEFINITIONS.mech_factory_t1.productionRate +
      UNIT_DEFINITIONS.worker_drone_t1.productionAssistRate * 2,
  );
});

test("enemy AI adds shield coverage after establishing its core force", () => {
  const simulation = new Simulation({ enemyAiEnabled: false });
  simulation.resources.enemy.metal = 300;
  const anchor = simulation.addStructure("generator", "enemy", 300, 300);
  simulation.addStructure("generator", "enemy", 300, 500);
  simulation.addStructure("mech_factory_t1", "enemy", 500, 300);
  simulation.addStructure("sentry_turret", "enemy", 440, 440);
  simulation.addStructure("metal_mine", "enemy", 220, 300);
  simulation.addStructure("metal_mine", "enemy", 220, 500);
  simulation.addUnit("scout_mech", "enemy", 500, 400);
  simulation.addUnit("assault_mech", "enemy", 540, 400);
  simulation.addUnit("skyguard_mech", "enemy", 580, 400);

  const request = simulation.getEnemyStrategicConstructionRequest(
    "enemy",
    anchor,
    [],
    (forward, side = 0) => ({ x: anchor.x + forward, y: anchor.y + side }),
  );

  assert.equal(request.type, "shield_turret");
});
