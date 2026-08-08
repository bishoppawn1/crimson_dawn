const moduleVersion = new URL(import.meta.url).searchParams.get("v");
const versionSuffix = moduleVersion ? `?v=${encodeURIComponent(moduleVersion)}` : "";

const {
  DEFAULT_MAP_ID,
  MAP_DEFINITIONS,
} = await import(`./data.js${versionSuffix}`);

export const MIN_MATCH_PLAYERS = 2;
export const MAX_MATCH_PLAYERS = 8;

const MAP_NAMES = Object.freeze({
  2: "Duel Basin",
  3: "Triad Reach",
  4: "Fourfold Front",
  5: "Pentagon Expanse",
  6: "Hex Ring",
  7: "Sevenfold Frontier",
  8: "Octagon Crown",
});

const RUIN_MAP_NAMES = Object.freeze({
  3: "Ancient Triad",
  4: "Ruins of the Four",
  5: "Pentarch Vaults",
  6: "Sixfold Sanctuary",
  7: "Seven Pillars",
  8: "Octagonal Necropolis",
});

const FRACTURE_MAP_NAMES = Object.freeze({
  3: "Threefold Ravine",
  4: "Shattered Quadrants",
  5: "Five-Spoke Fault",
  6: "Broken Hex",
  7: "Fractured Frontier",
  8: "Eightfold Chasm",
});

const GENERATED_VARIANTS = Object.freeze([
  Object.freeze({ id: "crown", terrainType: "crags", theme: "grassland" }),
  Object.freeze({ id: "ruins", terrainType: "ruins", theme: "grassland" }),
  Object.freeze({ id: "fracture", terrainType: "fracture", theme: "apocalypse" }),
]);

function roundToGrid(value) {
  return Math.round(value / 40) * 40;
}

function freezeRecords(records) {
  return Object.freeze(records.map((record) => Object.freeze(record)));
}

function createStart(x, y, centerX, centerY) {
  const deltaX = centerX - x;
  const deltaY = centerY - y;
  const length = Math.hypot(deltaX, deltaY) || 1;
  const inwardX = deltaX / length;
  const inwardY = deltaY / length;
  const tangentX = -inwardY;
  const tangentY = inwardX;
  const point = (forward, side = 0) => ({
    x: roundToGrid(x + inwardX * forward + tangentX * side),
    y: roundToGrid(y + inwardY * forward + tangentY * side),
  });
  return Object.freeze({
    x: roundToGrid(x),
    y: roundToGrid(y),
    inwardX,
    inwardY,
    tangentX,
    tangentY,
    mine: Object.freeze(point(160)),
    factory: Object.freeze(point(160, 80)),
    workers: Object.freeze([
      Object.freeze(point(80, -80)),
      Object.freeze(point(80)),
      Object.freeze(point(80, 80)),
    ]),
  });
}

function createDuelMap(mapId = DEFAULT_MAP_ID) {
  const definition = MAP_DEFINITIONS[mapId] || MAP_DEFINITIONS[DEFAULT_MAP_ID];
  const centerX = definition.width / 2;
  const centerY = definition.height / 2;
  const starts = ["player", "enemy"].map((team) => {
    const source = definition.starts[team];
    const start = createStart(source.generator[0], source.generator[1], centerX, centerY);
    return Object.freeze({
      ...start,
      mine: Object.freeze({ x: source.mine[0], y: source.mine[1] }),
      factory: Object.freeze({ x: source.factory[0], y: source.factory[1] }),
      workers: Object.freeze(source.workers.map(([x, y]) => Object.freeze({ x, y }))),
    });
  });
  return Object.freeze({
    id: definition.id,
    name: definition.name,
    description: definition.description,
    theme: definition.theme,
    playerCount: 2,
    width: definition.width,
    height: definition.height,
    starts: Object.freeze(starts),
    deposits: definition.deposits,
    terrain: definition.terrain,
  });
}

function createGeneratedTerrain(playerCount, variant, width, height) {
  const centerX = width / 2;
  const centerY = height / 2;
  const terrain = [];
  const addObstacle = (
    id,
    name,
    x,
    y,
    obstacleWidth,
    obstacleHeight,
    terrainType,
    zone = "interior",
  ) => {
    terrain.push({
      id,
      name,
      terrainType,
      zone,
      showLabel: false,
      x: roundToGrid(x),
      y: roundToGrid(y),
      width: roundToGrid(obstacleWidth),
      height: roundToGrid(obstacleHeight),
    });
  };

  for (let index = 0; index < playerCount; index += 1) {
    const angle = ((index + 0.5) / playerCount) * Math.PI * 2;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    if (variant.id === "ruins") {
      const archX = centerX + cosine * width * 0.15;
      const archY = centerY + sine * height * 0.15;
      const horizontal = Math.abs(cosine) < Math.abs(sine);
      addObstacle(
        `ruin-arch-${playerCount}-${index}`,
        "Ancient Ruin",
        archX,
        archY,
        horizontal ? 480 : 80,
        horizontal ? 80 : 480,
        "ruins",
      );
      for (const side of [-1, 1]) {
        const sideAngle = angle + side * 0.16;
        addObstacle(
          `ruin-pillar-${playerCount}-${index}-${side}`,
          "Ancient Pillars",
          centerX + Math.cos(sideAngle) * width * 0.235,
          centerY + Math.sin(sideAngle) * height * 0.235,
          120,
          200,
          "ruins",
        );
      }
      addObstacle(
        `ruin-court-${playerCount}-${index}`,
        "Collapsed Courtyard",
        centerX + cosine * width * 0.27,
        centerY + sine * height * 0.27,
        horizontal ? 360 : 120,
        horizontal ? 120 : 360,
        "ruins",
      );
      continue;
    }

    if (variant.id === "fracture") {
      const horizontal = index % 2 === 0;
      addObstacle(
        `fracture-inner-${playerCount}-${index}`,
        "Inner Fault",
        centerX + cosine * width * 0.13,
        centerY + sine * height * 0.13,
        horizontal ? 600 : 160,
        horizontal ? 160 : 600,
        "fracture",
      );
      addObstacle(
        `fracture-outer-${playerCount}-${index}`,
        "Outer Fault",
        centerX + cosine * width * 0.285,
        centerY + sine * height * 0.285,
        horizontal ? 160 : 520,
        horizontal ? 520 : 160,
        "fracture",
      );
      addObstacle(
        `fracture-splinter-${playerCount}-${index}`,
        "Fault Splinter",
        centerX + Math.cos(angle + 0.11) * width * 0.205,
        centerY + Math.sin(angle + 0.11) * height * 0.205,
        horizontal ? 320 : 120,
        horizontal ? 120 : 320,
        "fracture",
      );
      continue;
    }

    addObstacle(
      `ring-crag-inner-${playerCount}-${index}`,
      "Ring Crags",
      centerX + cosine * width * 0.135,
      centerY + sine * height * 0.135,
      320 + (index % 2) * 120,
      240 + ((index + 1) % 2) * 120,
      "crags",
    );
    addObstacle(
      `ring-crag-outer-${playerCount}-${index}`,
      "Outer Crags",
      centerX + Math.cos(angle + 0.12) * width * 0.29,
      centerY + Math.sin(angle + 0.12) * height * 0.29,
      240 + ((index + 1) % 3) * 80,
      200 + (index % 3) * 80,
      "crags",
    );
  }

  // Put substantial terrain between neighboring starting territories so the
  // outer half of a large map has real lanes and landmarks instead of serving
  // only as empty travel space around a decorated center.
  for (let slot = 0; slot < playerCount; slot += 1) {
    const angle = Math.PI + ((slot + 0.5) / playerCount) * Math.PI * 2;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const horizontal = Math.abs(cosine) < Math.abs(sine);
    const mainWidth = variant.id === "ruins" ? 560 : variant.id === "fracture" ? 640 : 480;
    const mainHeight = variant.id === "ruins" ? 160 : variant.id === "fracture" ? 160 : 320;
    addObstacle(
      `${variant.id}-outer-district-${playerCount}-${slot}`,
      variant.id === "ruins"
        ? "Outer Ruin District"
        : variant.id === "fracture"
          ? "Perimeter Fault"
          : "Frontier Crags",
      centerX + cosine * width * 0.4,
      centerY + sine * height * 0.4,
      horizontal ? mainWidth : mainHeight,
      horizontal ? mainHeight : mainWidth,
      variant.terrainType,
      "outer",
    );
    const satelliteAngle = angle + 0.12;
    addObstacle(
      `${variant.id}-outer-satellite-${playerCount}-${slot}`,
      variant.id === "ruins"
        ? "Outer Ruin Pillars"
        : variant.id === "fracture"
          ? "Outer Fault Shard"
          : "Frontier Outcrop",
      centerX + Math.cos(satelliteAngle) * width * 0.345,
      centerY + Math.sin(satelliteAngle) * height * 0.345,
      horizontal ? 240 : 160,
      horizontal ? 160 : 240,
      variant.terrainType,
      "outer",
    );
  }

  if (variant.id === "ruins") {
    for (const [suffix, offsetX, offsetY, obstacleWidth, obstacleHeight] of [
      ["north", 0, -240, 400, 80],
      ["south", 0, 240, 400, 80],
      ["west", -240, 0, 80, 400],
      ["east", 240, 0, 80, 400],
    ]) {
      addObstacle(
        `ruin-sanctum-${playerCount}-${suffix}`,
        "Central Sanctum",
        centerX + offsetX,
        centerY + offsetY,
        obstacleWidth,
        obstacleHeight,
        "ruins",
      );
    }
  } else {
    const terrainType = variant.id === "fracture" ? "fracture" : "crags";
    const name = variant.id === "fracture" ? "Central Fault Shard" : "Central Crown";
    for (const [suffix, offsetX, offsetY] of [
      ["north", 0, -240],
      ["south", 0, 240],
      ["west", -240, 0],
      ["east", 240, 0],
    ]) {
      addObstacle(
        `${variant.id}-center-${playerCount}-${suffix}`,
        name,
        centerX + offsetX,
        centerY + offsetY,
        variant.id === "fracture" && offsetX === 0 ? 240 : 160,
        variant.id === "fracture" && offsetY === 0 ? 240 : 160,
        terrainType,
      );
    }
  }
  return freezeRecords(terrain);
}

function pointClearOfTerrain(point, terrain, margin = 80) {
  return terrain.every((obstacle) => (
    Math.abs(point.x - obstacle.x) > obstacle.width / 2 + margin ||
    Math.abs(point.y - obstacle.y) > obstacle.height / 2 + margin
  ));
}

function createGeneratedDeposits(playerCount, starts, terrain, width, height, variant) {
  const centerX = width / 2;
  const centerY = height / 2;
  const deposits = [];
  for (const start of starts) {
    for (const side of [-1, 1]) {
      let placed = false;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const forward = 480 + (attempt % 4) * 120;
        const lateral = 240 + Math.floor(attempt / 4) * 160;
        const point = {
          x: roundToGrid(start.x + start.inwardX * forward + start.tangentX * lateral * side),
          y: roundToGrid(start.y + start.inwardY * forward + start.tangentY * lateral * side),
        };
        if (!pointClearOfTerrain(point, terrain, 40)) continue;
        if (deposits.some((deposit) => Math.hypot(deposit.x - point.x, deposit.y - point.y) < 180)) {
          continue;
        }
        deposits.push({ ...point, remote: false, cluster: null });
        placed = true;
        break;
      }
      if (!placed) throw new Error(`Could not place a starting expansion on ${playerCount}-player ${variant.id}.`);
    }
  }

  const addClearRing = ({ count, radiusX, radiusY, angleOffset, rich = false }) => {
    for (let index = 0; index < count; index += 1) {
      let placed = false;
      for (let attempt = 0; attempt < count * 3; attempt += 1) {
        const angle = angleOffset + ((index + attempt * 0.37) / count) * Math.PI * 2;
        const point = {
          x: roundToGrid(centerX + Math.cos(angle) * radiusX),
          y: roundToGrid(centerY + Math.sin(angle) * radiusY),
        };
        if (!pointClearOfTerrain(point, terrain)) continue;
        if (deposits.some((deposit) => Math.hypot(deposit.x - point.x, deposit.y - point.y) < 180)) {
          continue;
        }
        deposits.push({
          ...point,
          remote: true,
          cluster: rich ? "Rich Core" : variant.id === "ruins" ? "Ruined Commons" : "Central Frontier",
          rich,
          yieldMultiplier: rich ? 1.5 : 1,
        });
        placed = true;
        break;
      }
      if (!placed) {
        throw new Error(`Could not place a ${rich ? "rich" : "standard"} deposit on ${playerCount}-player ${variant.id}.`);
      }
    }
  };

  addClearRing({
    count: playerCount * 2,
    radiusX: Math.min(1700, width * 0.225),
    radiusY: Math.min(1250, height * 0.225),
    angleOffset: Math.PI / (playerCount * 2),
  });
  addClearRing({
    count: Math.max(2, Math.ceil(playerCount / 2)),
    radiusX: Math.min(760, width * 0.085),
    radiusY: Math.min(580, height * 0.085),
    angleOffset: variant.id === "ruins" ? Math.PI / 4 : 0,
    rich: true,
  });
  return freezeRecords(deposits);
}

function generatedMapIdentity(playerCount, variant) {
  if (variant.id === "ruins") {
    return {
      id: `${playerCount}-player-ancient-ruins`,
      name: RUIN_MAP_NAMES[playerCount],
      description: playerCount === 3
        ? "Overgrown green fields surround a dense three-way ruin complex stretching into ancient outer districts."
        : "Green fields reclaim ancient courtyards, collapsed arches, and outer ruin districts across the whole map.",
    };
  }
  if (variant.id === "fracture") {
    return {
      id: `${playerCount}-player-fracture`,
      name: FRACTURE_MAP_NAMES[playerCount],
      description: "A red apocalyptic wasteland where long fault walls split the battlefield into spokes and risky shortcuts.",
    };
  }
  return {
    id: `${playerCount}-player-${MAP_NAMES[playerCount].toLowerCase().replaceAll(" ", "-")}`,
    name: MAP_NAMES[playerCount],
    description: "Open green grasslands, central crowns, and frontier crags create fighting lanes from edge to edge.",
  };
}

function createGeneratedMap(playerCount, variant) {
  const width = 4400 + playerCount * 520;
  const height = 3400 + playerCount * 360;
  const centerX = width / 2;
  const centerY = height / 2;
  const radiusX = width / 2 - 640;
  const radiusY = height / 2 - 560;
  const starts = Object.freeze(Array.from({ length: playerCount }, (_, slot) => {
    const angle = Math.PI + (slot / playerCount) * Math.PI * 2;
    return createStart(
      centerX + Math.cos(angle) * radiusX,
      centerY + Math.sin(angle) * radiusY,
      centerX,
      centerY,
    );
  }));
  const terrain = createGeneratedTerrain(playerCount, variant, width, height);
  const deposits = createGeneratedDeposits(playerCount, starts, terrain, width, height, variant);
  const identity = generatedMapIdentity(playerCount, variant);
  return Object.freeze({
    ...identity,
    theme: variant.theme,
    playerCount,
    width,
    height,
    starts,
    deposits,
    terrain,
  });
}

export const MATCH_MAPS = Object.freeze(Object.fromEntries(
  Array.from({ length: MAX_MATCH_PLAYERS - MIN_MATCH_PLAYERS + 1 }, (_, index) => {
    const playerCount = MIN_MATCH_PLAYERS + index;
    const maps = playerCount === 2
      ? Object.keys(MAP_DEFINITIONS).map((mapId) => createDuelMap(mapId))
      : GENERATED_VARIANTS.map((variant) => createGeneratedMap(playerCount, variant));
    return [playerCount, Object.freeze(maps)];
  }),
));

export function getMapsForPlayerCount(playerCount = 2) {
  const maps = MATCH_MAPS[Number(playerCount)];
  if (!maps) {
    throw new RangeError(`Player count must be between ${MIN_MATCH_PLAYERS} and ${MAX_MATCH_PLAYERS}.`);
  }
  return maps;
}

export function getMatchMap(playerCount = 2, mapId = DEFAULT_MAP_ID) {
  const maps = getMapsForPlayerCount(playerCount);
  return maps.find((map) => map.id === mapId) || maps[0];
}

export function getRandomMatchMap(playerCount = 2, randomValue = 0) {
  const maps = getMapsForPlayerCount(playerCount);
  const boundedRandom = Number.isFinite(randomValue)
    ? Math.min(Math.max(randomValue, 0), 1 - Number.EPSILON)
    : 0;
  return maps[Math.floor(boundedRandom * maps.length)];
}

export function createMatchTeams(playerCount = 2) {
  getMapsForPlayerCount(playerCount);
  return Object.freeze(Array.from({ length: playerCount }, (_, slot) => Object.freeze({
    id: slot === 0 ? "player" : slot === 1 ? "enemy" : `enemy-${slot}`,
    name: slot === 0 ? "Player" : `AI ${slot}`,
    kind: slot === 0 ? "human" : "ai",
    slot,
  })));
}
