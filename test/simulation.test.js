import assert from "node:assert/strict";
import test from "node:test";

import {
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
import { Simulation } from "../src/simulation.js";
import { decodeSessionDescription, encodeSessionDescription } from "../src/multiplayer.js";
import { createMatchTeams, getMatchMap } from "../src/maps.js";

function advance(simulation, seconds, step = 1 / 30) {
  const ticks = Math.ceil(seconds / step);
  for (let tick = 0; tick < ticks; tick += 1) simulation.tick(step);
}

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

test("higher-tier Metal Mines still snap to deposits", () => {
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
  ]);

  const terrainLayouts = new Set();
  for (const map of Object.values(MAP_DEFINITIONS)) {
    assert.equal(
      resolveMatchMapId({ matchMode: "singleplayer", selectedMapId: map.id }),
      map.id,
    );
    const simulation = Simulation.createFieldTest({ mapId: map.id });
    assert.equal(simulation.mapId, map.id);
    assert.equal(simulation.mapName, map.name);
    assert.equal(simulation.width, map.width);
    assert.equal(simulation.height, map.height);
    assert.equal(simulation.units.filter((unit) => unit.team === "player").length, 3);
    assert.equal(simulation.units.filter((unit) => unit.team === "enemy").length, 3);
    assert.equal(
      simulation.structures.filter((structure) => structure.team === "player").length,
      3,
    );
    assert.equal(
      simulation.structures.filter((structure) => structure.team === "enemy").length,
      3,
    );
    assert.ok(simulation.metalDeposits.length >= 19);
    terrainLayouts.add(map.terrain.map(({ x, y, width, height }) => `${x},${y},${width},${height}`).join("|"));
  }
  assert.equal(terrainLayouts.size, Object.keys(MAP_DEFINITIONS).length);
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
    "ashen_divide",
  );
  assert.equal(
    resolveMatchMapId({
      matchMode: "multiplayer",
      selectedMapId: "broken_frontier",
      randomValue: 0.999,
    }),
    "iron_crossings",
  );
});

test("multiplayer snapshots preserve the host-selected map", () => {
  const host = Simulation.createFieldTest({ enemyAiEnabled: false, mapId: "iron_crossings" });
  const guest = Simulation.fromSnapshot(structuredClone(host.createSnapshot()));

  assert.equal(guest.mapId, "iron_crossings");
  assert.equal(guest.mapName, MAP_DEFINITIONS.iron_crossings.name);
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
  advance(simulation, 3);

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
  const firingEvent = simulation.events.find((event) => event.type === "attack");
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
  assert.equal(unitTarget.hp, vanguard.maxHp - definition.attackDamage);

  const structureSimulation = new Simulation();
  const structureRaider = structureSimulation.addUnit("raider", "enemy", 100, 100);
  const structureTarget = structureSimulation.addStructure("generator", "player", 150, 100);
  structureSimulation.commandAttack([structureRaider.id], structureTarget.id);
  structureSimulation.tick(1 / 30);
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
  simulation.addStructure("generator", "player", 100, 100);
  simulation.addStructure("battery", "player", 175, 100, { storedEnergy: 100 });
  const charger = simulation.addStructure("charger", "player", 250, 100);
  const unit = simulation.addUnit("scout_mech", "player", 260, 100, { energy: 20 });

  simulation.tick(0.25);

  assert.equal(charger.powered, true);
  assert.ok(Math.abs(unit.energy - (20 + STRUCTURE_DEFINITIONS.charger.chargeRate * 0.25)) < 0.001);
  assert.equal(STRUCTURE_DEFINITIONS.charger.chargeRate, 112);
});

test("the enlarged Induction Charger field reaches 260 world units", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  simulation.addStructure("battery", "player", 175, 100, { storedEnergy: 100 });
  const charger = simulation.addStructure("charger", "player", 250, 100);
  const edgeUnit = simulation.addUnit("scout_mech", "player", 510, 100, { energy: 20 });
  const outsideUnit = simulation.addUnit("scout_mech", "player", 250, 361, { energy: 20 });

  simulation.tick(0.25);

  assert.equal(STRUCTURE_DEFINITIONS.charger.chargeRadius, 260);
  assert.ok(edgeUnit.energy > 20);
  assert.equal(outsideUnit.energy, 20);
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
      scout_vehicle: 660,
      scout_vehicle_t2: 900,
      scout_vehicle_t3: 1200,
      battle_tank: 840,
      battle_tank_t2: 1140,
      battle_tank_t3: 1500,
      mobile_artillery: 780,
      mobile_artillery_t2: 1080,
      mobile_artillery_t3: 1440,
      grid_tanker: 3000,
      grid_tanker_t2: 4200,
      grid_tanker_t3: 6000,
      interceptor_t2: 900,
      interceptor_t3: 1260,
      gunship_t2: 1140,
      gunship_t3: 1560,
      bomber_t2: 1320,
      bomber_t3: 1800,
      energy_tender_t2: 3900,
      energy_tender_t3: 5700,
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
  assert.ok(simulation.resources.player.metal <= startingMetal + 20.001);
});

test("multiple reclamation drones can harvest the same scrap pile", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "player", 100, 100);
  const yard = simulation.addStructure("salvage_yard", "player", 240, 100);
  const wreck = simulation.addWreck(400, 100, 120);

  simulation.tick(1 / 30);

  assert.equal(yard.drones.length, 3);
  assert.ok(yard.drones.every((drone) => drone.targetWreckId === wreck.id));

  advance(simulation, 2.5);

  assert.ok(yard.drones.every((drone) => drone.carry > 0));
  assert.ok(wreck.metal >= 0);
});

test("partially loaded reclamation drones visit another scrap pile before returning", () => {
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

test("vehicle factories produce four matching-tier vehicle roles", () => {
  const factoryTypes = ["vehicle_factory_t1", "vehicle_factory_t2", "vehicle_factory_t3"];
  const expectedRoles = ["vehicle_scout", "tank", "artillery", "grid_tanker"];
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
      } else {
        assert.ok(definitionsByTier[index][role].attackDamage > definitionsByTier[index - 1][role].attackDamage);
      }
    }
  }
});

test("air factories begin at Tier 2 and produce four matching-tier aircraft roles", () => {
  assert.equal(STRUCTURE_DEFINITIONS.air_factory_t1, undefined);
  assert.ok(!BUILD_MENU.includes("air_factory_t1"));

  const factoryTypes = ["air_factory_t2", "air_factory_t3"];
  const expectedRoles = ["interceptor", "gunship", "bomber", "energy_tender"];
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
    } else {
      assert.ok(definitionsByTier[1][role].attackDamage > definitionsByTier[0][role].attackDamage);
    }
  }
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
      scout_vehicle: 3,
      scout_vehicle_t2: 5,
      scout_vehicle_t3: 7,
      battle_tank: 9,
      battle_tank_t2: 13,
      battle_tank_t3: 18,
      mobile_artillery: 7,
      mobile_artillery_t2: 11,
      mobile_artillery_t3: 15,
      grid_tanker: 6,
      grid_tanker_t2: 9,
      grid_tanker_t3: 13,
      interceptor_t2: 5,
      interceptor_t3: 7,
      gunship_t2: 9,
      gunship_t3: 13,
      bomber_t2: 11,
      bomber_t3: 16,
      energy_tender_t2: 8,
      energy_tender_t3: 11,
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
  assert.equal(unit.moveTarget, null);
  assert.equal(unit.attackTargetId, enemy.id);
  assert.equal(unit.attackTargetMode, "retaliation");
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
  const worker = simulation.addUnit("worker_drone_t1", "player", 890, 530);
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

test("enemy AI searches nearby grid cells when its preferred site is occupied", () => {
  const simulation = new Simulation();
  simulation.aiThinkRemaining = 0;
  simulation.aiBuildIndex = 1;
  simulation.addStructure("generator", "enemy", 2880, 800);
  simulation.addStructure("mech_factory_t1", "enemy", 2640, 960);
  const worker = simulation.addUnit("worker_drone_t1", "enemy", 2740, 800);

  simulation.tick(1 / 30);

  const battery = simulation.structures.find(
    (structure) => structure.alive && structure.team === "enemy" && structure.type === "battery",
  );
  const batteryFootprint = structureFootprint("battery");
  assert.ok(battery);
  assert.notDeepEqual([battery.x, battery.y], [2740, 800]);
  assert.equal((battery.x - batteryFootprint.halfWidth) % SIMULATION_RULES.buildingGridSize, 0);
  assert.equal((battery.y - batteryFootprint.halfHeight) % SIMULATION_RULES.buildingGridSize, 0);
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

test("enemy AI chooses buildings from current strategic needs instead of a build index", () => {
  const simulation = new Simulation();
  const anchor = simulation.addStructure("generator", "enemy", 2600, 900);
  simulation.addStructure("mech_factory_t1", "enemy", 2440, 1040);
  const planPoint = (forward, side = 0) => ({ x: anchor.x - forward, y: anchor.y + side });

  const earlyRequest = simulation.getEnemyStrategicConstructionRequest(
    "enemy",
    anchor,
    [],
    planPoint,
    1,
  );
  const laterCounterRequest = simulation.getEnemyStrategicConstructionRequest(
    "enemy",
    anchor,
    [],
    planPoint,
    19,
  );

  assert.equal(earlyRequest.type, "battery");
  assert.equal(laterCounterRequest.type, "battery");

  simulation.addStructure("battery", "enemy", 2520, 820);
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

test("the standard enemy opening establishes defenses and launches promptly", () => {
  const simulation = Simulation.createFieldTest();

  advance(simulation, 30);

  for (const structureType of ["battery", "sentry_turret", "charger"]) {
    assert.ok(
      simulation.structures.some(
        (structure) =>
          structure.alive &&
          structure.complete &&
          structure.team === "enemy" &&
          structure.type === structureType,
      ),
      `${structureType} should be operational during the opening`,
    );
  }
  const enemyCombatUnits = simulation.units.filter(
    (unit) => unit.alive && unit.team === "enemy" && UNIT_DEFINITIONS[unit.type].attackRange > 0,
  );
  assert.ok(enemyCombatUnits.length >= SIMULATION_RULES.enemyAttackWaveSize);
  assert.equal(
    enemyCombatUnits.filter((unit) => unit.attackTargetMode === "explicit").length,
    SIMULATION_RULES.enemyAttackWaveSize,
  );
});

test("enemy AI builds generation before spending metal on an unpowered consumer", () => {
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
  simulation.addStructure("battery", "enemy", 2760, 720);
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
  simulation.addStructure("battery", "enemy", 2760, 720);
  simulation.addStructure("sentry_turret", "enemy", 2640, 760);
  simulation.addUnit("scout_mech", "enemy", 2720, 980);
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
  simulation.aiBuildIndex = 3;
  simulation.resources.enemy.metal = 5000;
  simulation.addStructure("generator", "enemy", 2880, 800);
  simulation.addStructure("mech_factory_t1", "enemy", 2680, 920);
  simulation.addStructure("metal_mine", "enemy", 2920, 600);
  simulation.addStructure("power_tower", "enemy", 2640, 800);
  simulation.addStructure("battery", "enemy", 2760, 720);
  simulation.addStructure("sentry_turret", "enemy", 2600, 760);
  simulation.addUnit("scout_mech", "enemy", 2720, 980);
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

  advance(simulation, 30);
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

test("enemy AI reserves metal for its next building after fielding a combat force", () => {
  const simulation = new Simulation();
  simulation.aiThinkRemaining = 0;
  simulation.aiBuildIndex = 1;
  simulation.resources.enemy.metal = STRUCTURE_DEFINITIONS.battery.metalCost - 10;
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
    STRUCTURE_DEFINITIONS.battery.metalCost - 10,
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

test("enemy AI establishes a paid outpost and expands to another metal deposit", () => {
  const simulation = Simulation.createFieldTest();
  simulation.aiThinkRemaining = 0;
  simulation.aiBuildIndex = 4;
  simulation.resources.enemy.metal = 5000;
  const enemyStart = simulation.teamStarts.enemy;
  simulation.addStructure("battery", "enemy", enemyStart.x, enemyStart.y + 160);
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

  advance(simulation, 40);

  const enemyMines = simulation.structures.filter(
    (structure) =>
      structure.alive &&
      structure.complete &&
      structure.team === "enemy" &&
      STRUCTURE_DEFINITIONS[structure.type].metalRate,
  );
  assert.ok(enemyMines.length >= 2);
});

test("enemy AI expands beyond four mines when metal is low and skips player claims", () => {
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
  assert.ok([...staged, third].every((unit) => unit.attackTargetId === target.id));
  assert.ok([...staged, third].every((unit) => unit.attackTargetMode === "explicit"));
});

test("enemy combat units form a larger wave against clustered static defenses", () => {
  const simulation = new Simulation();
  simulation.addStructure("generator", "enemy", 1800, 800);
  const staged = [
    simulation.addUnit("scout_mech", "enemy", 1260, 720),
    simulation.addUnit("scout_mech", "enemy", 1300, 760),
    simulation.addUnit("scout_mech", "enemy", 1340, 800),
    simulation.addUnit("scout_mech", "enemy", 1380, 840),
  ];
  simulation.addStructure("sentry_turret", "player", 560, 760);
  simulation.addStructure("sentry_turret", "player", 600, 800);
  simulation.addStructure("sentry_turret", "player", 640, 840);
  simulation.aiThinkRemaining = 0;

  simulation.tick(1 / 30);

  assert.ok(staged.every((unit) => unit.attackTargetId === null));

  const fifth = simulation.addUnit("scout_mech", "enemy", 1420, 880);
  simulation.aiThinkRemaining = 0;
  simulation.tick(1 / 30);

  assert.equal(
    SIMULATION_RULES.enemyAttackWaveSize + SIMULATION_RULES.enemyHeavyDefenseWaveBonus,
    5,
  );
  assert.ok([...staged, fifth].every((unit) => unit.attackTargetMode === "explicit"));
});

test("an enemy assault force retreats when nearby combat strength clearly outmatches it", () => {
  const simulation = new Simulation();
  const enemyGenerator = simulation.addStructure("generator", "enemy", 1800, 800);
  const attackers = [
    simulation.addUnit("scout_mech", "enemy", 860, 760),
    simulation.addUnit("scout_mech", "enemy", 900, 800),
    simulation.addUnit("scout_mech", "enemy", 940, 840),
  ];
  const target = simulation.addStructure("sentry_turret", "player", 500, 800);
  simulation.addStructure("sentry_turret", "player", 500, 760);
  simulation.addStructure("sentry_turret", "player", 500, 840);
  simulation.commandAttack(attackers.map((unit) => unit.id), target.id);
  simulation.aiThinkRemaining = 0;

  simulation.tick(1 / 30);

  assert.ok(attackers.every((unit) => unit.attackTargetId === null));
  assert.ok(attackers.every((unit) => unit.moveMode === "force"));
  assert.ok(attackers.every((unit) => unit.moveTarget.x < enemyGenerator.x));
  assert.ok(attackers.every((unit) => unit.moveTarget.x > unit.x));
  assert.equal(simulation.events.at(-1).type, "enemy_retreat");
});

test("enemy combat units immediately answer structures rushed near their base", () => {
  const simulation = new Simulation();
  const enemyGenerator = simulation.addStructure("generator", "enemy", 1000, 800);
  const defender = simulation.addUnit("scout_mech", "enemy", 1080, 800);
  const forwardGenerator = simulation.addStructure("generator", "player", 1500, 800);
  simulation.addStructure("sentry_turret", "player", 1460, 800);
  simulation.aiThinkRemaining = 0;
  const startingDistance = Math.hypot(
    defender.x - forwardGenerator.x,
    defender.y - forwardGenerator.y,
  );

  simulation.tick(1 / 30);

  assert.ok(
    Math.hypot(forwardGenerator.x - enemyGenerator.x, forwardGenerator.y - enemyGenerator.y) <=
      SIMULATION_RULES.enemyRushResponseRadius,
  );
  assert.ok(defender.attackTargetId);
  assert.equal(defender.attackTargetMode, "explicit");
  assert.equal(defender.moveTarget, null);

  advance(simulation, 1);
  assert.ok(
    Math.hypot(defender.x - forwardGenerator.x, defender.y - forwardGenerator.y) <
      startingDistance,
  );
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

  const networkPayload = JSON.parse(JSON.stringify(host.createSnapshot()));
  const guest = Simulation.fromSnapshot(networkPayload);

  assert.equal(guest.enemyAiEnabled, false);
  assert.equal(guest.time, host.time);
  assert.equal(guest.units.length, host.units.length);
  assert.equal(guest.structures.length, host.structures.length);
  assert.deepEqual(guest.resources, host.resources);
  assert.deepEqual(guest.powerLinks, host.powerLinks);
  assert.equal(guest.getUnit(westernWorker.id).x, host.getUnit(westernWorker.id).x);
  assert.doesNotThrow(() => guest.tick(1 / 30));
});

test("manual multiplayer connection codes round-trip session descriptions", () => {
  const description = { type: "offer", sdp: "v=0\r\na=ice-ufrag:test+/=\r\n" };
  const code = encodeSessionDescription(description);

  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeSessionDescription(code, "offer"), { ...description, roomId: null });
  assert.throws(() => decodeSessionDescription(code, "answer"), /Expected a valid answer/);
  assert.throws(() => decodeSessionDescription("not a code", "offer"), /not valid/);
});

test("single-player counts from two through eight resolve dedicated battlefield layouts", () => {
  const generatedMapIds = new Set();
  for (let playerCount = 2; playerCount <= 8; playerCount += 1) {
    const map = getMatchMap(playerCount);
    assert.equal(map.playerCount, playerCount);
    assert.equal(map.starts.length, playerCount);
    assert.ok(map.deposits.length >= playerCount * 2);
    assert.ok(map.starts.every((start) =>
      start.x >= 0 && start.x <= map.width && start.y >= 0 && start.y <= map.height));
    if (playerCount > 2) generatedMapIds.add(map.id);
  }
  assert.equal(generatedMapIds.size, 6);
  assert.throws(() => getMatchMap(9), /between 2 and 8/);
});

test("an eight-player match gives every commander the standard starting package", () => {
  const simulation = Simulation.createFieldTest({ playerCount: 8, enemyAiEnabled: false });

  assert.equal(simulation.teams.length, 8);
  assert.equal(Object.keys(simulation.resources).length, 8);
  assert.equal(Object.keys(simulation.aiStates).length, 7);
  for (const team of simulation.teams) {
    const units = simulation.units.filter((unit) => unit.alive && unit.team === team.id);
    const structures = simulation.structures.filter(
      (structure) => structure.alive && structure.complete && structure.team === team.id,
    );
    assert.equal(units.filter((unit) => unit.type === "worker_drone_t1").length, 3);
    assert.deepEqual(
      structures.map((structure) => structure.type).sort(),
      ["generator", "mech_factory_t1", "metal_mine"],
    );
    assert.equal(structures.find((structure) => structure.type === "metal_mine").powered, true);
  }
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
      (structure) => structure.alive && structure.team === team.id && structure.type === "battery",
    ));
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
  const restored = Simulation.fromSnapshot(JSON.parse(JSON.stringify(host.createSnapshot())));

  assert.deepEqual(restored.teams, host.teams);
  assert.deepEqual(restored.teamStarts, host.teamStarts);
  assert.deepEqual(restored.aiStates, host.aiStates);
  assert.equal(restored.mapId, host.mapId);
  assert.equal(restored.mapName, host.mapName);
  assert.equal(Object.keys(restored.resources).length, 5);
});
