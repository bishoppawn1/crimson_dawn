export const WORLD_WIDTH = 5200;
export const WORLD_HEIGHT = 3200;

export const TERRAIN_OBSTACLES = Object.freeze([
  Object.freeze({ id: "north-divide", name: "Northern Divide", x: 2600, y: 840, width: 480, height: 880 }),
  Object.freeze({ id: "south-divide", name: "Southern Divide", x: 2600, y: 2360, width: 480, height: 880 }),
  Object.freeze({ id: "western-shelf", name: "Western Shelf", x: 1560, y: 2040, width: 640, height: 240 }),
  Object.freeze({ id: "eastern-shelf", name: "Eastern Shelf", x: 3640, y: 1160, width: 640, height: 240 }),
  Object.freeze({ id: "northwest-crags", name: "Northwest Crags", x: 1040, y: 600, width: 400, height: 320 }),
  Object.freeze({ id: "southeast-crags", name: "Southeast Crags", x: 4160, y: 2600, width: 400, height: 320 }),
  Object.freeze({
    id: "western-start-wall-north",
    name: "Western Start Wall",
    terrainType: "starting_wall",
    side: "player",
    x: 860,
    y: 1260,
    width: 360,
    height: 40,
  }),
  Object.freeze({
    id: "western-start-wall-front-north",
    name: "Western Start Wall",
    terrainType: "starting_wall",
    side: "player",
    x: 1060,
    y: 1400,
    width: 40,
    height: 240,
  }),
  Object.freeze({
    id: "western-start-wall-front-south",
    name: "Western Start Wall",
    terrainType: "starting_wall",
    side: "player",
    x: 1060,
    y: 1800,
    width: 40,
    height: 240,
  }),
  Object.freeze({
    id: "western-start-wall-south",
    name: "Western Start Wall",
    terrainType: "starting_wall",
    side: "player",
    x: 860,
    y: 1940,
    width: 360,
    height: 40,
  }),
  Object.freeze({
    id: "eastern-start-wall-north",
    name: "Eastern Start Wall",
    terrainType: "starting_wall",
    side: "enemy",
    x: 4340,
    y: 1260,
    width: 360,
    height: 40,
  }),
  Object.freeze({
    id: "eastern-start-wall-front-north",
    name: "Eastern Start Wall",
    terrainType: "starting_wall",
    side: "enemy",
    x: 4140,
    y: 1400,
    width: 40,
    height: 240,
  }),
  Object.freeze({
    id: "eastern-start-wall-front-south",
    name: "Eastern Start Wall",
    terrainType: "starting_wall",
    side: "enemy",
    x: 4140,
    y: 1800,
    width: 40,
    height: 240,
  }),
  Object.freeze({
    id: "eastern-start-wall-south",
    name: "Eastern Start Wall",
    terrainType: "starting_wall",
    side: "enemy",
    x: 4340,
    y: 1940,
    width: 360,
    height: 40,
  }),
]);

const SHARED_STARTS = Object.freeze({
  player: Object.freeze({
    generator: Object.freeze([600, 1600]),
    factory: Object.freeze([760, 1680]),
    mine: Object.freeze([760, 1440]),
    workers: Object.freeze([
      Object.freeze([680, 1640]),
      Object.freeze([680, 1720]),
      Object.freeze([760, 1800]),
    ]),
  }),
  enemy: Object.freeze({
    generator: Object.freeze([4600, 1600]),
    factory: Object.freeze([4440, 1680]),
    mine: Object.freeze([4440, 1440]),
    workers: Object.freeze([
      Object.freeze([4520, 1640]),
      Object.freeze([4520, 1720]),
      Object.freeze([4440, 1800]),
    ]),
  }),
});

function frozenRecords(records) {
  return Object.freeze(records.map((record) => Object.freeze(record)));
}

const BROKEN_FRONTIER_DEPOSITS = frozenRecords([
  { x: 900, y: 920 }, { x: 920, y: 2280 }, { x: 1320, y: 1440 },
  { x: 1360, y: 2600 }, { x: 1800, y: 720 }, { x: 1800, y: 1600 },
  { x: 1880, y: 2520 }, { x: 2200, y: 1480 }, { x: 3000, y: 1720 },
  { x: 3320, y: 680 }, { x: 3400, y: 1600 }, { x: 3320, y: 2520 },
  { x: 3880, y: 1440 }, { x: 4200, y: 920 }, { x: 4200, y: 2280 },
  { x: 2200, y: 240, remote: true, cluster: "Northern Frontier" },
  { x: 2400, y: 240, remote: true, cluster: "Northern Frontier" },
  { x: 2600, y: 240, remote: true, cluster: "Northern Frontier" },
  { x: 2800, y: 240, remote: true, cluster: "Northern Frontier" },
  { x: 3000, y: 240, remote: true, cluster: "Northern Frontier" },
  { x: 2200, y: 2960, remote: true, cluster: "Southern Frontier" },
  { x: 2400, y: 2960, remote: true, cluster: "Southern Frontier" },
  { x: 2600, y: 2960, remote: true, cluster: "Southern Frontier" },
  { x: 2800, y: 2960, remote: true, cluster: "Southern Frontier" },
  { x: 3000, y: 2960, remote: true, cluster: "Southern Frontier" },
]);

const ASHEN_DIVIDE_TERRAIN = frozenRecords([
  { id: "ashen-north-spine", name: "Ashen Spine", x: 2600, y: 480, width: 400, height: 560 },
  { id: "ashen-center-spine", name: "Ashen Spine", x: 2600, y: 1600, width: 400, height: 480 },
  { id: "ashen-south-spine", name: "Ashen Spine", x: 2600, y: 2720, width: 400, height: 560 },
  { id: "ashen-west-shelf", name: "Western Ash Shelf", x: 1580, y: 1040, width: 640, height: 200 },
  { id: "ashen-east-shelf", name: "Eastern Ash Shelf", x: 3620, y: 2160, width: 640, height: 200 },
  { id: "ashen-west-crags", name: "Western Ash Crags", x: 1540, y: 2460, width: 360, height: 360 },
  { id: "ashen-east-crags", name: "Eastern Ash Crags", x: 3660, y: 740, width: 360, height: 360 },
]);

const ASHEN_DIVIDE_DEPOSITS = frozenRecords([
  { x: 900, y: 800 }, { x: 900, y: 2400 }, { x: 1400, y: 1600 },
  { x: 1600, y: 600 }, { x: 1600, y: 2800 }, { x: 2050, y: 920 },
  { x: 2050, y: 2280 }, { x: 3150, y: 920 }, { x: 3150, y: 2280 },
  { x: 3600, y: 400 }, { x: 3600, y: 2600 }, { x: 3800, y: 1600 },
  { x: 4300, y: 800 }, { x: 4300, y: 2400 }, { x: 2600, y: 920 },
  { x: 2600, y: 2240 }, { x: 2600, y: 3120, remote: true, cluster: "Southern Ash Field" },
]);

const IRON_CROSSINGS_TERRAIN = frozenRecords([
  { id: "cross-northwest", name: "Northwest Iron Mass", x: 2180, y: 1040, width: 400, height: 560 },
  { id: "cross-northeast", name: "Northeast Iron Mass", x: 3020, y: 1040, width: 400, height: 560 },
  { id: "cross-southwest", name: "Southwest Iron Mass", x: 2180, y: 2160, width: 400, height: 560 },
  { id: "cross-southeast", name: "Southeast Iron Mass", x: 3020, y: 2160, width: 400, height: 560 },
  { id: "cross-west-gate", name: "Western Gate Ridge", x: 1420, y: 1600, width: 240, height: 720 },
  { id: "cross-east-gate", name: "Eastern Gate Ridge", x: 3780, y: 1600, width: 240, height: 720 },
]);

const IRON_CROSSINGS_DEPOSITS = frozenRecords([
  { x: 920, y: 760 }, { x: 920, y: 2440 }, { x: 1320, y: 960 },
  { x: 1320, y: 2240 }, { x: 1780, y: 480 }, { x: 1780, y: 2720 },
  { x: 1980, y: 1600 }, { x: 2380, y: 1600 }, { x: 2600, y: 480 },
  { x: 2600, y: 1600, remote: true, cluster: "Central Crossing" }, { x: 2600, y: 2720 },
  { x: 2820, y: 1600 }, { x: 3220, y: 1600 }, { x: 3420, y: 480 },
  { x: 3420, y: 2720 }, { x: 3880, y: 960 }, { x: 3880, y: 2240 },
  { x: 4280, y: 760 }, { x: 4280, y: 2440 },
]);

export const DEFAULT_MAP_ID = "broken_frontier";

export const MAP_DEFINITIONS = Object.freeze({
  broken_frontier: Object.freeze({
    id: "broken_frontier",
    name: "Broken Frontier",
    description: "Fortified starting positions, central divides, and rich remote frontier clusters.",
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    terrain: TERRAIN_OBSTACLES,
    starts: SHARED_STARTS,
    deposits: BROKEN_FRONTIER_DEPOSITS,
  }),
  ashen_divide: Object.freeze({
    id: "ashen_divide",
    name: "Ashen Divide",
    description: "A broken central spine creates two major attack lanes and contested crossing fields.",
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    terrain: ASHEN_DIVIDE_TERRAIN,
    starts: SHARED_STARTS,
    deposits: ASHEN_DIVIDE_DEPOSITS,
  }),
  iron_crossings: Object.freeze({
    id: "iron_crossings",
    name: "Iron Crossings",
    description: "Four central iron masses form narrow horizontal and vertical crossroads.",
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    terrain: IRON_CROSSINGS_TERRAIN,
    starts: SHARED_STARTS,
    deposits: IRON_CROSSINGS_DEPOSITS,
  }),
});

export function resolveMatchMapId({
  matchMode = "singleplayer",
  selectedMapId = DEFAULT_MAP_ID,
  randomValue = 0,
} = {}) {
  const mapIds = Object.keys(MAP_DEFINITIONS);
  if (matchMode === "multiplayer") {
    const boundedRandom = Number.isFinite(randomValue)
      ? Math.min(Math.max(randomValue, 0), 1 - Number.EPSILON)
      : 0;
    return mapIds[Math.floor(boundedRandom * mapIds.length)];
  }
  return MAP_DEFINITIONS[selectedMapId] ? selectedMapId : DEFAULT_MAP_ID;
}

function provisionalFactoryUnit({ name, role, roleDescription, unitDomain, tier, ...stats }) {
  return {
    name,
    role,
    roleDescription,
    unitDomain,
    movementLayer: unitDomain === "air" ? "air" : "ground",
    tier,
    ...stats,
    metalValue: stats.metalCost,
    provisionalBalance: true,
  };
}

const FACTORY_UNIT_DEFINITIONS = Object.freeze({
  scout_vehicle: provisionalFactoryUnit({
    name: "Tier 1 Scout Vehicle", role: "vehicle_scout", roleDescription: "Fast ground reconnaissance",
    unitDomain: "vehicle", tier: 1, radius: 9, maxHp: 135, maxEnergy: 660, speed: 108,
    movementEnergyPerUnit: 0.05, attackRange: 120, attackDamage: 11, attackEnergy: 5,
    attackCooldown: 0.65, metalCost: 80, productionTime: 6, supplyCost: 3,
  }),
  scout_vehicle_t2: provisionalFactoryUnit({
    name: "Tier 2 Scout Vehicle", role: "vehicle_scout", roleDescription: "Fast ground reconnaissance",
    unitDomain: "vehicle", tier: 2, radius: 10, maxHp: 190, maxEnergy: 900, speed: 116,
    movementEnergyPerUnit: 0.045, attackRange: 135, attackDamage: 16, attackEnergy: 6,
    attackCooldown: 0.58, metalCost: 125, productionTime: 7.5, supplyCost: 5,
  }),
  scout_vehicle_t3: provisionalFactoryUnit({
    name: "Tier 3 Scout Vehicle", role: "vehicle_scout", roleDescription: "Fast ground reconnaissance",
    unitDomain: "vehicle", tier: 3, radius: 11, maxHp: 260, maxEnergy: 1200, speed: 125,
    movementEnergyPerUnit: 0.04, attackRange: 150, attackDamage: 22, attackEnergy: 7,
    attackCooldown: 0.5, metalCost: 180, productionTime: 9, supplyCost: 7,
  }),
  battle_tank: provisionalFactoryUnit({
    name: "Tier 1 Battle Tank", role: "tank", roleDescription: "Armored direct-fire combat",
    unitDomain: "vehicle", tier: 1, radius: 12, maxHp: 310, maxEnergy: 840, speed: 58,
    movementEnergyPerUnit: 0.07, attackRange: 145, attackDamage: 30, attackEnergy: 12,
    attackCooldown: 1.4, metalCost: 180, productionTime: 12, supplyCost: 9,
  }),
  battle_tank_t2: provisionalFactoryUnit({
    name: "Tier 2 Battle Tank", role: "tank", roleDescription: "Armored direct-fire combat",
    unitDomain: "vehicle", tier: 2, radius: 13, maxHp: 440, maxEnergy: 1140, speed: 62,
    movementEnergyPerUnit: 0.064, attackRange: 160, attackDamage: 43, attackEnergy: 14,
    attackCooldown: 1.28, metalCost: 275, productionTime: 14.5, supplyCost: 13,
  }),
  battle_tank_t3: provisionalFactoryUnit({
    name: "Tier 3 Battle Tank", role: "tank", roleDescription: "Armored direct-fire combat",
    unitDomain: "vehicle", tier: 3, radius: 13, maxHp: 610, maxEnergy: 1500, speed: 66,
    movementEnergyPerUnit: 0.058, attackRange: 175, attackDamage: 59, attackEnergy: 17,
    attackCooldown: 1.15, metalCost: 410, productionTime: 18, supplyCost: 18,
  }),
  mobile_artillery: provisionalFactoryUnit({
    name: "Tier 1 Mobile Artillery", role: "artillery", roleDescription: "Long-range fire support",
    unitDomain: "vehicle", tier: 1, radius: 11, maxHp: 135, maxEnergy: 780, speed: 54,
    movementEnergyPerUnit: 0.06, attackRange: 260, attackDamage: 40, attackEnergy: 16,
    attackCooldown: 2.2, metalCost: 170, productionTime: 13, supplyCost: 7,
  }),
  mobile_artillery_t2: provisionalFactoryUnit({
    name: "Tier 2 Mobile Artillery", role: "artillery", roleDescription: "Long-range fire support",
    unitDomain: "vehicle", tier: 2, radius: 12, maxHp: 195, maxEnergy: 1080, speed: 58,
    movementEnergyPerUnit: 0.055, attackRange: 295, attackDamage: 57, attackEnergy: 19,
    attackCooldown: 2, metalCost: 260, productionTime: 15.5, supplyCost: 11,
  }),
  mobile_artillery_t3: provisionalFactoryUnit({
    name: "Tier 3 Mobile Artillery", role: "artillery", roleDescription: "Long-range fire support",
    unitDomain: "vehicle", tier: 3, radius: 13, maxHp: 275, maxEnergy: 1440, speed: 62,
    movementEnergyPerUnit: 0.05, attackRange: 335, attackDamage: 78, attackEnergy: 23,
    attackCooldown: 1.8, metalCost: 390, productionTime: 19, supplyCost: 15,
  }),
  grid_tanker: provisionalFactoryUnit({
    name: "Tier 1 Grid Tanker", role: "grid_tanker", roleDescription: "Armored mobile energy support",
    unitDomain: "vehicle", tier: 1, radius: 11, maxHp: 190, maxEnergy: 3000, speed: 70,
    movementEnergyPerUnit: 0.045, attackRange: 0, attackDamage: 0, attackEnergy: 0,
    attackCooldown: 0, metalCost: 140, productionTime: 10, supplyCost: 6,
    transferRange: 100, transferRate: 32, protectedReserve: 80,
  }),
  grid_tanker_t2: provisionalFactoryUnit({
    name: "Tier 2 Grid Tanker", role: "grid_tanker", roleDescription: "Armored mobile energy support",
    unitDomain: "vehicle", tier: 2, radius: 12, maxHp: 275, maxEnergy: 4200, speed: 75,
    movementEnergyPerUnit: 0.04, attackRange: 0, attackDamage: 0, attackEnergy: 0,
    attackCooldown: 0, metalCost: 210, productionTime: 13, supplyCost: 9,
    transferRange: 120, transferRate: 48, protectedReserve: 110,
  }),
  grid_tanker_t3: provisionalFactoryUnit({
    name: "Tier 3 Grid Tanker", role: "grid_tanker", roleDescription: "Armored mobile energy support",
    unitDomain: "vehicle", tier: 3, radius: 13, maxHp: 380, maxEnergy: 6000, speed: 80,
    movementEnergyPerUnit: 0.036, attackRange: 0, attackDamage: 0, attackEnergy: 0,
    attackCooldown: 0, metalCost: 310, productionTime: 16, supplyCost: 13,
    transferRange: 145, transferRate: 68, protectedReserve: 150,
  }),
  interceptor_t2: provisionalFactoryUnit({
    name: "Tier 2 Interceptor", role: "interceptor", roleDescription: "Fast aerial combat",
    unitDomain: "air", tier: 2, radius: 9, maxHp: 145, maxEnergy: 900, speed: 150,
    movementEnergyPerUnit: 0.08, attackRange: 155, attackDamage: 18, attackEnergy: 8,
    attackCooldown: 0.55, metalCost: 150, productionTime: 8, supplyCost: 5,
  }),
  interceptor_t3: provisionalFactoryUnit({
    name: "Tier 3 Interceptor", role: "interceptor", roleDescription: "Fast aerial combat",
    unitDomain: "air", tier: 3, radius: 10, maxHp: 205, maxEnergy: 1260, speed: 165,
    movementEnergyPerUnit: 0.072, attackRange: 175, attackDamage: 26, attackEnergy: 10,
    attackCooldown: 0.46, metalCost: 225, productionTime: 10, supplyCost: 7,
  }),
  gunship_t2: provisionalFactoryUnit({
    name: "Tier 2 Gunship", role: "gunship", roleDescription: "Durable aerial assault",
    unitDomain: "air", tier: 2, radius: 12, maxHp: 270, maxEnergy: 1140, speed: 98,
    movementEnergyPerUnit: 0.095, attackRange: 175, attackDamage: 25, attackEnergy: 11,
    attackCooldown: 0.82, metalCost: 240, productionTime: 13, supplyCost: 9,
  }),
  gunship_t3: provisionalFactoryUnit({
    name: "Tier 3 Gunship", role: "gunship", roleDescription: "Durable aerial assault",
    unitDomain: "air", tier: 3, radius: 13, maxHp: 390, maxEnergy: 1560, speed: 108,
    movementEnergyPerUnit: 0.086, attackRange: 200, attackDamage: 36, attackEnergy: 14,
    attackCooldown: 0.7, metalCost: 360, productionTime: 16, supplyCost: 13,
  }),
  bomber_t2: provisionalFactoryUnit({
    name: "Tier 2 Bomber", role: "bomber", roleDescription: "Heavy aerial strike",
    unitDomain: "air", tier: 2, radius: 13, maxHp: 235, maxEnergy: 1320, speed: 82,
    movementEnergyPerUnit: 0.11, attackRange: 190, attackDamage: 56, attackEnergy: 22,
    attackCooldown: 2.3, metalCost: 285, productionTime: 15, supplyCost: 11,
  }),
  bomber_t3: provisionalFactoryUnit({
    name: "Tier 3 Bomber", role: "bomber", roleDescription: "Heavy aerial strike",
    unitDomain: "air", tier: 3, radius: 13, maxHp: 340, maxEnergy: 1800, speed: 90,
    movementEnergyPerUnit: 0.1, attackRange: 215, attackDamage: 82, attackEnergy: 28,
    attackCooldown: 2.05, metalCost: 430, productionTime: 19, supplyCost: 16,
  }),
  energy_tender_t2: provisionalFactoryUnit({
    name: "Tier 2 Energy Tender", role: "energy_tender", roleDescription: "Airborne mobile energy support",
    unitDomain: "air", tier: 2, radius: 11, maxHp: 180, maxEnergy: 3900, speed: 115,
    movementEnergyPerUnit: 0.085, attackRange: 0, attackDamage: 0, attackEnergy: 0,
    attackCooldown: 0, metalCost: 220, productionTime: 12, supplyCost: 8,
    transferRange: 125, transferRate: 45, protectedReserve: 100,
  }),
  energy_tender_t3: provisionalFactoryUnit({
    name: "Tier 3 Energy Tender", role: "energy_tender", roleDescription: "Airborne mobile energy support",
    unitDomain: "air", tier: 3, radius: 12, maxHp: 260, maxEnergy: 5700, speed: 128,
    movementEnergyPerUnit: 0.075, attackRange: 0, attackDamage: 0, attackEnergy: 0,
    attackCooldown: 0, metalCost: 330, productionTime: 15, supplyCost: 11,
    transferRange: 150, transferRate: 65, protectedReserve: 140,
  }),
});

export const UNIT_DEFINITIONS = Object.freeze({
  worker_drone_t1: {
    name: "Tier 1 Worker Drone",
    role: "worker",
    tier: 1,
    radius: 6,
    maxHp: 70,
    maxEnergy: 690,
    speed: 72,
    movementEnergyPerUnit: 0.035,
    attackRange: 0,
    attackDamage: 0,
    attackEnergy: 0,
    attackCooldown: 0,
    metalValue: 45,
    metalCost: 45,
    productionTime: 5,
    supplyCost: 1,
    workerTier: 1,
    buildRate: 1,
  },
  worker_drone_t2: {
    name: "Tier 2 Worker Drone",
    role: "worker",
    tier: 2,
    radius: 7,
    maxHp: 95,
    maxEnergy: 990,
    speed: 78,
    movementEnergyPerUnit: 0.03,
    attackRange: 0,
    attackDamage: 0,
    attackEnergy: 0,
    attackCooldown: 0,
    metalValue: 75,
    metalCost: 75,
    productionTime: 5,
    supplyCost: 2,
    workerTier: 2,
    buildRate: 1.65,
  },
  worker_drone_t3: {
    name: "Tier 3 Worker Drone",
    role: "worker",
    tier: 3,
    radius: 8,
    maxHp: 125,
    maxEnergy: 1380,
    speed: 84,
    movementEnergyPerUnit: 0.026,
    attackRange: 0,
    attackDamage: 0,
    attackEnergy: 0,
    attackCooldown: 0,
    metalValue: 120,
    metalCost: 120,
    productionTime: 5,
    supplyCost: 3,
    workerTier: 3,
    buildRate: 2.6,
  },
  scout_mech: {
    name: "Tier 1 Vanguard Mech",
    role: "vanguard",
    tier: 1,
    radius: 9,
    maxHp: 120,
    maxEnergy: 600,
    speed: 92,
    movementEnergyPerUnit: 0.055,
    attackRange: 125,
    attackDamage: 13,
    attackEnergy: 6,
    attackCooldown: 0.8,
    metalValue: 85,
    metalCost: 85,
    productionTime: 7,
    supplyCost: 4,
    provisionalBalance: true,
  },
  scout_mech_t2: {
    name: "Tier 2 Vanguard Mech",
    role: "vanguard",
    tier: 2,
    radius: 10,
    maxHp: 165,
    maxEnergy: 870,
    speed: 98,
    movementEnergyPerUnit: 0.05,
    attackRange: 135,
    attackDamage: 18,
    attackEnergy: 7,
    attackCooldown: 0.72,
    metalValue: 130,
    metalCost: 130,
    productionTime: 8.5,
    supplyCost: 6,
    provisionalBalance: true,
  },
  scout_mech_t3: {
    name: "Tier 3 Vanguard Mech",
    role: "vanguard",
    tier: 3,
    radius: 11,
    maxHp: 220,
    maxEnergy: 1200,
    speed: 105,
    movementEnergyPerUnit: 0.045,
    attackRange: 145,
    attackDamage: 24,
    attackEnergy: 8,
    attackCooldown: 0.64,
    metalValue: 190,
    metalCost: 190,
    productionTime: 10,
    supplyCost: 8,
    provisionalBalance: true,
  },
  assault_mech: {
    name: "Tier 1 Bulwark Mech",
    role: "bulwark",
    tier: 1,
    radius: 11,
    maxHp: 190,
    maxEnergy: 780,
    speed: 68,
    movementEnergyPerUnit: 0.07,
    attackRange: 150,
    attackDamage: 24,
    attackEnergy: 10,
    attackCooldown: 1.25,
    metalValue: 140,
    metalCost: 140,
    productionTime: 11,
    supplyCost: 8,
    abilities: {
      overdrive: {
        name: "Overdrive",
        energyCost: 30,
        duration: 6,
        speedMultiplier: 1.65,
        cooldownMultiplier: 0.65,
      },
    },
    provisionalBalance: true,
  },
  assault_mech_t2: {
    name: "Tier 2 Bulwark Mech",
    role: "bulwark",
    tier: 2,
    radius: 12,
    maxHp: 270,
    maxEnergy: 1080,
    speed: 72,
    movementEnergyPerUnit: 0.064,
    attackRange: 165,
    attackDamage: 34,
    attackEnergy: 12,
    attackCooldown: 1.15,
    metalValue: 210,
    metalCost: 210,
    productionTime: 13,
    supplyCost: 12,
    abilities: {
      overdrive: {
        name: "Overdrive",
        energyCost: 34,
        duration: 6,
        speedMultiplier: 1.65,
        cooldownMultiplier: 0.65,
      },
    },
    provisionalBalance: true,
  },
  assault_mech_t3: {
    name: "Tier 3 Bulwark Mech",
    role: "bulwark",
    tier: 3,
    radius: 13,
    maxHp: 370,
    maxEnergy: 1440,
    speed: 76,
    movementEnergyPerUnit: 0.058,
    attackRange: 180,
    attackDamage: 46,
    attackEnergy: 14,
    attackCooldown: 1.05,
    metalValue: 310,
    metalCost: 310,
    productionTime: 16,
    supplyCost: 16,
    abilities: {
      overdrive: {
        name: "Overdrive",
        energyCost: 40,
        duration: 6,
        speedMultiplier: 1.65,
        cooldownMultiplier: 0.65,
      },
    },
    provisionalBalance: true,
  },
  energy_carrier: {
    name: "Tier 1 Arc Energy Carrier",
    role: "carrier",
    tier: 1,
    radius: 10,
    maxHp: 145,
    maxEnergy: 2520,
    speed: 62,
    movementEnergyPerUnit: 0.04,
    attackRange: 0,
    attackDamage: 0,
    attackEnergy: 0,
    attackCooldown: 0,
    metalValue: 120,
    metalCost: 120,
    productionTime: 9,
    supplyCost: 6,
    transferRange: 105,
    transferRate: 35,
    protectedReserve: 70,
    provisionalBalance: true,
  },
  energy_carrier_t2: {
    name: "Tier 2 Arc Energy Carrier",
    role: "carrier",
    tier: 2,
    radius: 11,
    maxHp: 205,
    maxEnergy: 3600,
    speed: 66,
    movementEnergyPerUnit: 0.036,
    attackRange: 0,
    attackDamage: 0,
    attackEnergy: 0,
    attackCooldown: 0,
    metalValue: 180,
    metalCost: 180,
    productionTime: 11,
    supplyCost: 9,
    transferRange: 120,
    transferRate: 50,
    protectedReserve: 90,
    provisionalBalance: true,
  },
  energy_carrier_t3: {
    name: "Tier 3 Arc Energy Carrier",
    role: "carrier",
    tier: 3,
    radius: 12,
    maxHp: 285,
    maxEnergy: 5100,
    speed: 70,
    movementEnergyPerUnit: 0.032,
    attackRange: 0,
    attackDamage: 0,
    attackEnergy: 0,
    attackCooldown: 0,
    metalValue: 260,
    metalCost: 260,
    productionTime: 14,
    supplyCost: 12,
    transferRange: 140,
    transferRate: 70,
    protectedReserve: 120,
    provisionalBalance: true,
  },
  ...FACTORY_UNIT_DEFINITIONS,
  raider: {
    name: "Hostile Raider",
    role: "raider",
    tier: 1,
    radius: 9,
    maxHp: 105,
    maxEnergy: 1080,
    speed: 108,
    movementEnergyPerUnit: 0.025,
    attackRange: 120,
    attackDamage: 10,
    attackEnergy: 4,
    attackCooldown: 1.1,
    structureDamageMultiplier: 1.75,
    preferredStructureFamilies: Object.freeze([
      "generator",
      "battery",
      "power_tower",
      "charger",
      "metal_mine",
      "salvage_yard",
      "supply_complex",
      "factory",
    ]),
    metalValue: 90,
    metalCost: 90,
    productionTime: 7,
    supplyCost: 4,
    provisionalBalance: true,
  },
});

const structureDefinitions = {
  generator: {
    name: "Pulse Generator",
    family: "generator",
    buildTier: 1,
    minimumWorkerTier: 1,
    radius: 18,
    footprint: [1, 1],
    maxHp: 500,
    powerRadius: 245,
    generationRate: 14,
    storageCapacity: 80,
    chargeRate: 14,
    dischargeRate: 40,
    metalCost: 120,
    buildTime: 8,
    provisionalBalance: true,
  },
  battery: {
    name: "Grid Battery",
    family: "battery",
    buildTier: 1,
    minimumWorkerTier: 1,
    radius: 18,
    footprint: [1, 1],
    maxHp: 380,
    powerRadius: 225,
    storageCapacity: 360,
    chargeRate: 48,
    dischargeRate: 180,
    metalCost: 100,
    buildTime: 7,
    provisionalBalance: true,
  },
  power_tower: {
    name: "Power Relay Tower",
    family: "power_tower",
    buildTier: 1,
    minimumWorkerTier: 1,
    radius: 18,
    footprint: [1, 1],
    maxHp: 270,
    powerDemand: 0.5,
    relayRadius: 245,
    storageCapacity: 30,
    chargeRate: 8,
    dischargeRate: 12,
    metalCost: 55,
    buildTime: 5,
    provisionalBalance: true,
  },
  charger: {
    name: "Induction Charger",
    family: "charger",
    buildTier: 1,
    minimumWorkerTier: 1,
    radius: 18,
    footprint: [1, 1],
    maxHp: 360,
    powerDemand: 3,
    chargeRadius: 260,
    chargeRate: 112,
    metalCost: 90,
    buildTime: 7,
    provisionalBalance: true,
  },
  metal_mine: {
    name: "Metal Mine",
    family: "metal_mine",
    buildTier: 1,
    minimumWorkerTier: 1,
    radius: 18,
    footprint: [1, 1],
    maxHp: 410,
    powerDemand: 2,
    metalRate: 5,
    metalCost: 110,
    buildTime: 8,
  },
  mech_factory_t1: {
    name: "Tier 1 Mech Factory",
    family: "factory",
    factoryBranch: "mech",
    buildTier: 1,
    minimumWorkerTier: 1,
    radius: 34,
    footprint: [2, 2],
    maxHp: 650,
    powerDemand: 3,
    productionPowerDemand: 6,
    productionRate: 1,
    tier: 1,
    production: ["worker_drone_t1", "scout_mech", "assault_mech", "energy_carrier"],
    metalCost: 180,
    buildTime: 12,
  },
  mech_factory_t2: {
    name: "Tier 2 Mech Factory",
    family: "factory",
    factoryBranch: "mech",
    buildTier: 2,
    minimumWorkerTier: 1,
    radius: 52,
    footprint: [3, 3],
    maxHp: 820,
    powerDemand: 5,
    productionPowerDemand: 10,
    productionRate: 1.25,
    tier: 2,
    production: ["worker_drone_t2", "scout_mech_t2", "assault_mech_t2", "energy_carrier_t2"],
    metalCost: 340,
    buildTime: 18,
  },
  mech_factory_t3: {
    name: "Tier 3 Mech Factory",
    family: "factory",
    factoryBranch: "mech",
    buildTier: 3,
    minimumWorkerTier: 2,
    radius: 72,
    footprint: [4, 4],
    maxHp: 1050,
    powerDemand: 8,
    productionPowerDemand: 16,
    productionRate: 1.5,
    tier: 3,
    production: ["worker_drone_t3", "scout_mech_t3", "assault_mech_t3", "energy_carrier_t3"],
    metalCost: 600,
    buildTime: 25,
  },
  supply_complex: {
    name: "Strategic Supply Complex",
    family: "supply_complex",
    buildTier: 1,
    minimumWorkerTier: 1,
    radius: 160,
    footprint: [8, 6],
    maxHp: 2400,
    powerDemand: 6,
    upgradePowerDemand: 6,
    metalCost: 1200,
    buildTime: 40,
    supplyLevels: [
      { capacity: 5000 },
      { capacity: 10000, metalCost: 800, upgradeTime: 25 },
      { capacity: 20000, metalCost: 1600, upgradeTime: 40 },
    ],
    provisionalBalance: true,
  },
  sentry_turret: {
    name: "Sentry Turret",
    family: "sentry_turret",
    buildTier: 1,
    minimumWorkerTier: 1,
    radius: 18,
    footprint: [1, 1],
    maxHp: 390,
    powerDemand: 0,
    attackRange: 185,
    attackDamage: 12,
    attackEnergy: 3,
    attackCooldown: 0.85,
    capacitorCapacity: 12,
    capacitorChargeRate: 8,
    metalCost: 85,
    buildTime: 6,
  },
  salvage_yard: {
    name: "Salvage Reclamation Yard",
    family: "salvage_yard",
    buildTier: 1,
    minimumWorkerTier: 1,
    radius: 34,
    footprint: [2, 2],
    maxHp: 430,
    powerDemand: 2,
    droneCount: 3,
    droneReplacementTime: 8,
    metalCost: 150,
    buildTime: 10,
  },
};

Object.assign(structureDefinitions, {
  vehicle_factory_t1: {
    name: "Tier 1 Vehicle Factory", family: "factory", factoryBranch: "vehicle",
    buildTier: 1, minimumWorkerTier: 1, tier: 1, radius: 34, footprint: [2, 2],
    maxHp: 700, powerDemand: 4, productionPowerDemand: 7,
    production: ["scout_vehicle", "battle_tank", "mobile_artillery", "grid_tanker"],
    productionRate: 1,
    metalCost: 200, buildTime: 13, provisionalBalance: true,
  },
  generator_t2: {
    ...structureDefinitions.generator, name: "Tier 2 Pulse Generator", buildTier: 2,
    minimumWorkerTier: 2, radius: 34, footprint: [2, 2], maxHp: 750, powerRadius: 285,
    generationRate: 25, storageCapacity: 150, chargeRate: 25, dischargeRate: 70,
    metalCost: 240, buildTime: 14,
  },
  battery_t2: {
    ...structureDefinitions.battery, name: "Tier 2 Grid Battery", buildTier: 2,
    minimumWorkerTier: 2, radius: 34, footprint: [2, 2], maxHp: 570, powerRadius: 260,
    storageCapacity: 650, chargeRate: 80, dischargeRate: 280, metalCost: 190, buildTime: 12,
  },
  power_tower_t2: {
    ...structureDefinitions.power_tower, name: "Tier 2 Power Relay Tower", buildTier: 2,
    minimumWorkerTier: 2, radius: 18, footprint: [1, 1], maxHp: 400, powerDemand: 0.75, relayRadius: 285,
    storageCapacity: 55, chargeRate: 14, dischargeRate: 22, metalCost: 100, buildTime: 8,
  },
  charger_t2: {
    ...structureDefinitions.charger, name: "Tier 2 Induction Charger", buildTier: 2,
    minimumWorkerTier: 2, radius: 34, footprint: [2, 2], maxHp: 540, powerDemand: 5,
    chargeRadius: 310, chargeRate: 170, metalCost: 175, buildTime: 12,
  },
  metal_mine_t2: {
    ...structureDefinitions.metal_mine, name: "Tier 2 Metal Mine", buildTier: 2,
    minimumWorkerTier: 2, radius: 34, footprint: [2, 2], maxHp: 620, powerDemand: 3,
    metalRate: 8, metalCost: 210, buildTime: 13, provisionalBalance: true,
  },
  mech_factory_t2: structureDefinitions.mech_factory_t2,
  vehicle_factory_t2: {
    name: "Tier 2 Vehicle Factory", family: "factory", factoryBranch: "vehicle",
    buildTier: 2, minimumWorkerTier: 2, tier: 2, radius: 52, footprint: [3, 3],
    maxHp: 900, powerDemand: 7, productionPowerDemand: 12,
    production: ["scout_vehicle_t2", "battle_tank_t2", "mobile_artillery_t2", "grid_tanker_t2"],
    productionRate: 1.25,
    metalCost: 380, buildTime: 20, provisionalBalance: true,
  },
  air_factory_t2: {
    name: "Tier 2 Air Factory", family: "factory", factoryBranch: "air",
    buildTier: 2, minimumWorkerTier: 2, tier: 2, radius: 52, footprint: [3, 3],
    maxHp: 810, powerDemand: 8, productionPowerDemand: 14,
    production: ["interceptor_t2", "gunship_t2", "bomber_t2", "energy_tender_t2"],
    productionRate: 1.25,
    metalCost: 420, buildTime: 21, provisionalBalance: true,
  },
  sentry_turret_t2: {
    ...structureDefinitions.sentry_turret, name: "Tier 2 Sentry Turret", buildTier: 2,
    minimumWorkerTier: 2, radius: 28, footprint: [2, 2], maxHp: 570, attackRange: 250, attackDamage: 24,
    attackEnergy: 6, attackCooldown: 0.75, capacitorCapacity: 30, capacitorChargeRate: 20,
    metalCost: 160, buildTime: 10, provisionalBalance: true,
  },
  salvage_yard_t2: {
    ...structureDefinitions.salvage_yard, name: "Tier 2 Salvage Reclamation Yard", buildTier: 2,
    minimumWorkerTier: 2, radius: 52, footprint: [3, 3], maxHp: 620, powerDemand: 3,
    droneCount: 4, droneReplacementTime: 7, metalCost: 280, buildTime: 16,
    provisionalBalance: true,
  },
  generator_t3: {
    ...structureDefinitions.generator, name: "Tier 3 Pulse Generator", buildTier: 3,
    minimumWorkerTier: 3, radius: 52, footprint: [3, 3], maxHp: 1100, powerRadius: 330,
    generationRate: 45, storageCapacity: 280, chargeRate: 45, dischargeRate: 120,
    metalCost: 480, buildTime: 22,
  },
  battery_t3: {
    ...structureDefinitions.battery, name: "Tier 3 Grid Battery", buildTier: 3,
    minimumWorkerTier: 3, radius: 52, footprint: [3, 3], maxHp: 840, powerRadius: 300,
    storageCapacity: 1100, chargeRate: 130, dischargeRate: 430, metalCost: 360, buildTime: 19,
  },
  power_tower_t3: {
    ...structureDefinitions.power_tower, name: "Tier 3 Power Relay Tower", buildTier: 3,
    minimumWorkerTier: 3, radius: 38, footprint: [3, 3], maxHp: 590, powerDemand: 1,
    relayRadius: 330, storageCapacity: 100, chargeRate: 24, dischargeRate: 38,
    metalCost: 180, buildTime: 12,
  },
  charger_t3: {
    ...structureDefinitions.charger, name: "Tier 3 Induction Charger", buildTier: 3,
    minimumWorkerTier: 3, radius: 52, footprint: [3, 3], maxHp: 800, powerDemand: 8,
    chargeRadius: 360, chargeRate: 250, metalCost: 330, buildTime: 19,
  },
  metal_mine_t3: {
    ...structureDefinitions.metal_mine, name: "Tier 3 Metal Mine", buildTier: 3,
    minimumWorkerTier: 3, radius: 52, footprint: [3, 3], maxHp: 900, powerDemand: 5,
    metalRate: 12, metalCost: 390, buildTime: 20, provisionalBalance: true,
  },
  mech_factory_t3: structureDefinitions.mech_factory_t3,
  vehicle_factory_t3: {
    name: "Tier 3 Vehicle Factory", family: "factory", factoryBranch: "vehicle",
    buildTier: 3, minimumWorkerTier: 3, tier: 3, radius: 72, footprint: [4, 4],
    maxHp: 1180, powerDemand: 11, productionPowerDemand: 19,
    production: ["scout_vehicle_t3", "battle_tank_t3", "mobile_artillery_t3", "grid_tanker_t3"],
    productionRate: 1.5,
    metalCost: 680, buildTime: 28, provisionalBalance: true,
  },
  air_factory_t3: {
    name: "Tier 3 Air Factory", family: "factory", factoryBranch: "air",
    buildTier: 3, minimumWorkerTier: 3, tier: 3, radius: 72, footprint: [4, 4],
    maxHp: 1050, powerDemand: 13, productionPowerDemand: 22,
    production: ["interceptor_t3", "gunship_t3", "bomber_t3", "energy_tender_t3"],
    productionRate: 1.5,
    metalCost: 740, buildTime: 30, provisionalBalance: true,
  },
  sentry_turret_t3: {
    ...structureDefinitions.sentry_turret, name: "Tier 3 Sentry Turret", buildTier: 3,
    minimumWorkerTier: 3, radius: 38, footprint: [3, 3], maxHp: 820, attackRange: 340,
    attackDamage: 42, attackEnergy: 10, attackCooldown: 0.6, capacitorCapacity: 60,
    capacitorChargeRate: 35,
    metalCost: 300, buildTime: 16, provisionalBalance: true,
  },
  salvage_yard_t3: {
    ...structureDefinitions.salvage_yard, name: "Tier 3 Salvage Reclamation Yard", buildTier: 3,
    minimumWorkerTier: 3, radius: 72, footprint: [4, 4], maxHp: 900, powerDemand: 5,
    droneCount: 5, droneReplacementTime: 6, metalCost: 500, buildTime: 24,
    provisionalBalance: true,
  },
  experimental_factory: {
    name: "Experimental Factory", family: "factory", factoryBranch: "experimental",
    buildTier: 3, minimumWorkerTier: 3, tier: 3, radius: 90, footprint: [5, 5],
    maxHp: 1500, powerDemand: 18, productionPowerDemand: 30, production: [],
    metalCost: 1000, buildTime: 36, provisionalBalance: true,
  },
});

export const STRUCTURE_DEFINITIONS = Object.freeze(structureDefinitions);

export const BUILD_MENU_BY_TIER = Object.freeze({
  1: Object.freeze([
    "generator", "battery", "power_tower", "charger", "metal_mine",
    "mech_factory_t1", "vehicle_factory_t1",
    "sentry_turret", "salvage_yard", "supply_complex",
  ]),
  2: Object.freeze([
    "generator_t2", "battery_t2", "power_tower_t2", "charger_t2", "metal_mine_t2",
    "mech_factory_t2", "vehicle_factory_t2", "air_factory_t2",
    "sentry_turret_t2", "salvage_yard_t2",
  ]),
  3: Object.freeze([
    "generator_t3", "battery_t3", "power_tower_t3", "charger_t3", "metal_mine_t3",
    "mech_factory_t3", "vehicle_factory_t3", "air_factory_t3",
    "sentry_turret_t3", "salvage_yard_t3", "experimental_factory",
  ]),
});

export const BUILD_MENU = Object.freeze(Object.values(BUILD_MENU_BY_TIER).flat());

export function canWorkerTierBuildStructure(workerTier, structureType) {
  const definition = STRUCTURE_DEFINITIONS[structureType];
  return Boolean(definition && workerTier >= (definition.minimumWorkerTier || definition.buildTier || 1));
}

export function getNextStructureTierType(structureType) {
  const definition = STRUCTURE_DEFINITIONS[structureType];
  if (!definition) return null;
  const nextTier = (definition.buildTier || definition.tier || 1) + 1;
  const match = Object.entries(STRUCTURE_DEFINITIONS).find(([, candidate]) => {
    if ((candidate.buildTier || candidate.tier || 1) !== nextTier) return false;
    if (candidate.family !== definition.family) return false;
    if (definition.family !== "factory") return true;
    return candidate.factoryBranch === definition.factoryBranch;
  });
  return match?.[0] || null;
}

export const DRONE_DEFINITION = Object.freeze({
  name: "Reclamation Drone",
  radius: 5,
  maxHp: 35,
  speed: 85,
  terrainOverflightTypes: Object.freeze(["starting_wall"]),
  carryCapacity: 24,
  collectionRate: 8,
});

export const SIMULATION_RULES = Object.freeze({
  baseSupplyCapacity: 1000,
  stasisRegenerationRate: 2.5,
  lowEnergyRegenerationRate: 1.5,
  lowEnergyRegenerationThreshold: 18,
  reactivationThreshold: 18,
  lowEnergyRatio: 0.2,
  structureCollisionPadding: 0,
  unitCollisionPadding: 2,
  rallyFormationSpacing: 32,
  buildingGridSize: 40,
  constructionCancelRefundRate: 0.75,
  enemyInitialThinkDelay: 1,
  enemyThinkInterval: 1,
  enemyAttackWaveSize: 3,
  enemyRushResponseRadius: 800,
  enemySupplyLowRatio: 0.1,
  enemyLowMetalThreshold: 400,
  enemyExpansionSurplusMetal: 900,
  enemyHeavyDefenseCount: 3,
  enemyHeavyDefenseRadius: 420,
  enemyHeavyDefenseWaveBonus: 2,
  enemyRetreatEvaluationRadius: 520,
  enemyRetreatStrengthRatio: 1.5,
});

export function gridCoverageBounds(x, y, reach) {
  if (!Number.isFinite(reach) || reach <= 0) return null;
  const gridSize = SIMULATION_RULES.buildingGridSize;
  const halfCell = gridSize / 2;
  const minimumColumn = Math.ceil((x - reach - halfCell) / gridSize);
  const maximumColumn = Math.floor((x + reach - halfCell) / gridSize);
  const minimumRow = Math.ceil((y - reach - halfCell) / gridSize);
  const maximumRow = Math.floor((y + reach - halfCell) / gridSize);
  const left = minimumColumn * gridSize;
  const right = (maximumColumn + 1) * gridSize;
  const top = minimumRow * gridSize;
  const bottom = (maximumRow + 1) * gridSize;
  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
    columns: maximumColumn - minimumColumn + 1,
    rows: maximumRow - minimumRow + 1,
  };
}

export function powerCoverageBounds(structureType, x, y) {
  const definition = STRUCTURE_DEFINITIONS[structureType];
  const reach = definition?.relayRadius || definition?.powerRadius || 0;
  return gridCoverageBounds(x, y, reach);
}

export function pointInGridCoverage(bounds, x, y) {
  return Boolean(
    bounds &&
    x >= bounds.left &&
    x < bounds.right &&
    y >= bounds.top &&
    y < bounds.bottom
  );
}

export function structureFootprint(structureType) {
  const definition = STRUCTURE_DEFINITIONS[structureType];
  const [columns = 1, rows = 1] = definition?.footprint || [];
  const width = columns * SIMULATION_RULES.buildingGridSize;
  const height = rows * SIMULATION_RULES.buildingGridSize;
  return {
    columns,
    rows,
    width,
    height,
    halfWidth: width / 2,
    halfHeight: height / 2,
  };
}
