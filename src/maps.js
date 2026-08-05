import {
  DEFAULT_MAP_ID,
  MAP_DEFINITIONS,
} from "./data.js";

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

function roundToGrid(value) {
  return Math.round(value / 40) * 40;
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
    playerCount: 2,
    width: definition.width,
    height: definition.height,
    starts: Object.freeze(starts),
    deposits: definition.deposits,
    terrain: definition.terrain,
  });
}

function createRingMap(playerCount) {
  const width = 4400 + playerCount * 520;
  const height = 3400 + playerCount * 360;
  const centerX = width / 2;
  const centerY = height / 2;
  const radiusX = width / 2 - 640;
  const radiusY = height / 2 - 560;
  const starts = [];
  const deposits = [];

  for (let slot = 0; slot < playerCount; slot += 1) {
    const angle = Math.PI + (slot / playerCount) * Math.PI * 2;
    const start = createStart(
      centerX + Math.cos(angle) * radiusX,
      centerY + Math.sin(angle) * radiusY,
      centerX,
      centerY,
    );
    starts.push(start);
    for (const side of [-1, 1]) {
      deposits.push(Object.freeze({
        x: roundToGrid(start.x + start.inwardX * 520 + start.tangentX * 260 * side),
        y: roundToGrid(start.y + start.inwardY * 520 + start.tangentY * 260 * side),
        remote: false,
        cluster: null,
      }));
    }
  }

  const centralDepositCount = playerCount * 2;
  const centralRadiusX = Math.min(1500, width * 0.24);
  const centralRadiusY = Math.min(1100, height * 0.24);
  for (let index = 0; index < centralDepositCount; index += 1) {
    const angle = ((index + 0.5) / centralDepositCount) * Math.PI * 2;
    deposits.push(Object.freeze({
      x: roundToGrid(centerX + Math.cos(angle) * centralRadiusX),
      y: roundToGrid(centerY + Math.sin(angle) * centralRadiusY),
      remote: true,
      cluster: "Central Frontier",
    }));
  }

  const terrain = [];
  for (let index = 0; index < playerCount; index += 1) {
    const angle = ((index + 0.5) / playerCount) * Math.PI * 2;
    terrain.push(Object.freeze({
      id: `ring-crags-${playerCount}-${index}`,
      name: "Ring Crags",
      x: roundToGrid(centerX + Math.cos(angle) * width * 0.14),
      y: roundToGrid(centerY + Math.sin(angle) * height * 0.14),
      width: 320 + (index % 2) * 120,
      height: 240 + ((index + 1) % 2) * 120,
    }));
  }

  return Object.freeze({
    id: `${playerCount}-player-${MAP_NAMES[playerCount].toLowerCase().replaceAll(" ", "-")}`,
    name: MAP_NAMES[playerCount],
    playerCount,
    width,
    height,
    starts: Object.freeze(starts),
    deposits: Object.freeze(deposits),
    terrain: Object.freeze(terrain),
  });
}

export const MATCH_MAPS = Object.freeze(Object.fromEntries(
  Array.from({ length: MAX_MATCH_PLAYERS - MIN_MATCH_PLAYERS + 1 }, (_, index) => {
    const playerCount = MIN_MATCH_PLAYERS + index;
    return [playerCount, playerCount === 2 ? createDuelMap() : createRingMap(playerCount)];
  }),
));

export function getMatchMap(playerCount = 2, mapId = DEFAULT_MAP_ID) {
  const normalizedCount = Number(playerCount);
  const map = normalizedCount === 2 ? createDuelMap(mapId) : MATCH_MAPS[normalizedCount];
  if (!map) {
    throw new RangeError(`Player count must be between ${MIN_MATCH_PLAYERS} and ${MAX_MATCH_PLAYERS}.`);
  }
  return map;
}

export function createMatchTeams(playerCount = 2) {
  getMatchMap(playerCount);
  return Object.freeze(Array.from({ length: playerCount }, (_, slot) => Object.freeze({
    id: slot === 0 ? "player" : slot === 1 ? "enemy" : `enemy-${slot}`,
    name: slot === 0 ? "Player" : `AI ${slot}`,
    kind: slot === 0 ? "human" : "ai",
    slot,
  })));
}
