import {
  BUILD_MENU_BY_TIER,
  canWorkerTierBuildStructure,
  DRONE_DEFINITION,
  SIMULATION_RULES,
  STRUCTURE_DEFINITIONS,
  UNIT_DEFINITIONS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  powerCoverageBounds,
  structureFootprint,
} from "./data.js";
import { energyRatio, Simulation } from "./simulation.js";

const canvas = document.querySelector("#battlefield");
const context = canvas.getContext("2d");
const metalValue = document.querySelector("#metal-value");
const energyValue = document.querySelector("#energy-value");
const supplyValue = document.querySelector("#supply-value");
const selectionName = document.querySelector("#selection-name");
const selectionDetails = document.querySelector("#selection-details");
const overdriveButton = document.querySelector("#overdrive-button");
const stopButton = document.querySelector("#stop-button");
const holdButton = document.querySelector("#hold-button");
const unitCommands = document.querySelector("#unit-commands");
const buildCommands = document.querySelector("#build-commands");
const buildCommandGrid = document.querySelector("#build-command-grid");
const productionCommands = document.querySelector("#production-commands");
const productionCommandGrid = document.querySelector("#production-command-grid");
const structureCommands = document.querySelector("#structure-commands");
const cancelConstructionButton = document.querySelector("#cancel-construction-button");
const cancelRefundValue = document.querySelector("#cancel-refund-value");
const supplyUpgradeButton = document.querySelector("#supply-upgrade-button");
const supplyUpgradeTitle = document.querySelector("#supply-upgrade-title");
const supplyUpgradeDetails = document.querySelector("#supply-upgrade-details");
const buildingUpgradeButton = document.querySelector("#building-upgrade-button");
const buildingUpgradeTitle = document.querySelector("#building-upgrade-title");
const buildingUpgradeDetails = document.querySelector("#building-upgrade-details");
const pauseButton = document.querySelector("#pause-button");
const resetButton = document.querySelector("#reset-button");
const statusBanner = document.querySelector("#status-banner");

let simulation = Simulation.createFieldTest();
let selectedUnitIds = new Set();
let selectedStructureId = null;
let selectionDrag = null;
let placementStructureType = null;
let placementMessage = null;
let placementCursor = null;
let pointerScreen = null;
let forceMoveArmed = false;
let paused = false;
let lastFrameTime = performance.now();
let accumulator = 0;
const fixedStep = 1 / 30;
const camera = {
  x: canvas.width / 2,
  y: WORLD_HEIGHT / 2,
  zoom: 1,
};
const cameraKeys = new Set();
const cameraPanSpeed = 700;
const minCameraZoom = 0.5;
const maxCameraZoom = 2;

const colors = {
  background: "#10141a",
  gridFine: "#181f27",
  gridStrong: "#232c35",
  player: "#7fd4ef",
  playerDark: "#24627c",
  enemy: "#e65a64",
  enemyDark: "#772e38",
  energy: "#52d1ff",
  metal: "#d0c9b9",
  health: "#6fe28d",
  stasis: "#e4b44c",
  selection: "#f6ee8d",
  disconnected: "#ff6675",
};

const buildButtons = new Map();
for (const tier of [1, 2, 3]) {
  const tierGroup = document.createElement("section");
  tierGroup.className = "build-tier-group";
  const tierLabel = document.createElement("p");
  tierLabel.className = "build-tier-label";
  tierLabel.textContent = `Tier ${tier}`;
  const tierGrid = document.createElement("div");
  tierGrid.className = "command-grid build-tier-grid";
  tierGroup.append(tierLabel, tierGrid);
  buildCommandGrid.append(tierGroup);

  for (const structureType of BUILD_MENU_BY_TIER[tier]) {
    const definition = STRUCTURE_DEFINITIONS[structureType];
    const button = document.createElement("button");
    button.className = "command-button";
    button.innerHTML = `${definition.name}<small>${definition.metalCost} metal · T${definition.minimumWorkerTier} worker</small>`;
    button.addEventListener("click", () => {
      placementStructureType = placementStructureType === structureType ? null : structureType;
      placementMessage = null;
      updateInterface();
    });
    tierGrid.append(button);
    buildButtons.set(structureType, button);
  }
}

const productionButtons = new Map();
const producibleUnitTypes = [
  ...new Set(
    Object.values(STRUCTURE_DEFINITIONS).flatMap((definition) => definition.production || []),
  ),
];
for (const unitType of producibleUnitTypes) {
  const definition = UNIT_DEFINITIONS[unitType];
  const button = document.createElement("button");
  button.className = "command-button";
  button.innerHTML = `${definition.name}<small>${definition.metalCost} metal · ${definition.supplyCost} supply</small>`;
  button.addEventListener("click", () => {
    if (selectedStructureId) simulation.queueProduction(selectedStructureId, unitType);
    updateInterface();
  });
  productionCommandGrid.append(button);
  productionButtons.set(unitType, button);
}

function resetGame() {
  simulation = Simulation.createFieldTest();
  selectedUnitIds = new Set();
  selectedStructureId = null;
  selectionDrag = null;
  placementStructureType = null;
  placementMessage = null;
  placementCursor = null;
  pointerScreen = null;
  forceMoveArmed = false;
  cameraKeys.clear();
  resetCamera();
  paused = false;
  pauseButton.textContent = "Pause simulation";
  accumulator = 0;
  updateInterface();
}

function frame(now) {
  const elapsed = Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  updateCamera(elapsed);
  if (!paused) {
    accumulator += elapsed;
    while (accumulator >= fixedStep) {
      simulation.tick(fixedStep);
      accumulator -= fixedStep;
    }
  }

  pruneSelection();
  render();
  updateInterface();
  requestAnimationFrame(frame);
}

function render() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.scale(camera.zoom, camera.zoom);
  context.translate(-camera.x, -camera.y);
  drawTerrain();
  drawMetalDeposits();
  drawPowerNetwork();
  drawCommandIndicators();

  for (const wreck of simulation.wrecks) drawWreck(wreck);
  for (const structure of simulation.structures) {
    if (structure.alive) drawStructure(structure);
  }
  for (const drone of simulation.getDrones()) {
    if (drone.alive) drawDrone(drone);
  }
  for (const unit of simulation.units) {
    if (unit.alive) drawUnit(unit);
  }
  drawPlacementPreview();
  drawEvents();
  drawSelectionBox();
  context.restore();
  drawCameraHud();
}

function resetCamera() {
  camera.x = canvas.width / 2;
  camera.y = WORLD_HEIGHT / 2;
  camera.zoom = 1;
  clampCamera();
}

function updateCamera(elapsed) {
  const horizontal = Number(cameraKeys.has("d")) - Number(cameraKeys.has("a"));
  const vertical = Number(cameraKeys.has("s")) - Number(cameraKeys.has("w"));
  if (horizontal === 0 && vertical === 0) return;

  const magnitude = Math.hypot(horizontal, vertical);
  const movement = (cameraPanSpeed * elapsed) / camera.zoom;
  camera.x += (horizontal / magnitude) * movement;
  camera.y += (vertical / magnitude) * movement;
  clampCamera();
  syncPointerToCamera();
}

function clampCamera() {
  const halfViewWidth = canvas.width / (2 * camera.zoom);
  const halfViewHeight = canvas.height / (2 * camera.zoom);
  camera.x = halfViewWidth >= WORLD_WIDTH / 2
    ? WORLD_WIDTH / 2
    : clampValue(camera.x, halfViewWidth, WORLD_WIDTH - halfViewWidth);
  camera.y = halfViewHeight >= WORLD_HEIGHT / 2
    ? WORLD_HEIGHT / 2
    : clampValue(camera.y, halfViewHeight, WORLD_HEIGHT - halfViewHeight);
}

function drawCameraHud() {
  const label = `WASD PAN · WHEEL ZOOM · ${Math.round(camera.zoom * 100)}%`;
  context.font = "700 12px ui-monospace, monospace";
  context.fillStyle = "#080a0dcc";
  context.fillRect(14, canvas.height - 38, context.measureText(label).width + 20, 25);
  context.fillStyle = "#aeb8c2";
  context.fillText(label, 24, canvas.height - 21);
}

function drawTerrain() {
  context.fillStyle = colors.background;
  context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  const gridSize = SIMULATION_RULES.buildingGridSize;
  context.lineWidth = placementStructureType ? 1.5 : 1;
  for (let x = 0; x <= WORLD_WIDTH; x += gridSize) {
    context.strokeStyle = placementStructureType
      ? x % (gridSize * 5) === 0
        ? "#496170"
        : "#2f414d"
      : x % (gridSize * 5) === 0
        ? colors.gridStrong
        : colors.gridFine;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, WORLD_HEIGHT);
    context.stroke();
  }
  for (let y = 0; y <= WORLD_HEIGHT; y += gridSize) {
    context.strokeStyle = placementStructureType
      ? y % (gridSize * 5) === 0
        ? "#496170"
        : "#2f414d"
      : y % (gridSize * 5) === 0
        ? colors.gridStrong
        : colors.gridFine;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(WORLD_WIDTH, y);
    context.stroke();
  }

  context.fillStyle = "#6f303018";
  context.beginPath();
  context.ellipse(WORLD_WIDTH - 480, WORLD_HEIGHT / 2, 520, 700, -0.2, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#236b7a10";
  context.beginPath();
  context.ellipse(480, WORLD_HEIGHT / 2, 560, 720, 0.15, 0, Math.PI * 2);
  context.fill();

  drawImpassableTerrain();

  context.fillStyle = "#83909d";
  context.font = "700 12px ui-monospace, monospace";
  context.fillText("FRIENDLY GRID", 55, 500);
  context.fillStyle = "#a56a70";
  context.fillText("HOSTILE APPROACH", WORLD_WIDTH - 235, 500);
}

function drawImpassableTerrain() {
  for (const obstacle of simulation.terrain) {
    const left = obstacle.x - obstacle.width / 2;
    const top = obstacle.y - obstacle.height / 2;
    context.save();
    context.fillStyle = "#252b31";
    context.strokeStyle = "#59636b";
    context.lineWidth = 4;
    context.fillRect(left, top, obstacle.width, obstacle.height);
    context.strokeRect(left, top, obstacle.width, obstacle.height);
    context.beginPath();
    context.rect(left, top, obstacle.width, obstacle.height);
    context.clip();
    context.strokeStyle = "#77818a28";
    context.lineWidth = 2;
    for (
      let offset = -obstacle.height;
      offset < obstacle.width + obstacle.height;
      offset += SIMULATION_RULES.buildingGridSize
    ) {
      context.beginPath();
      context.moveTo(left + offset, top + obstacle.height);
      context.lineTo(left + offset + obstacle.height, top);
      context.stroke();
    }
    context.restore();
    drawLabel(obstacle.x, obstacle.y, `${obstacle.name} · Impassable`, true, "#9aa3aa");
  }
}

function drawPlacementPreview() {
  if (!placementStructureType || !placementCursor) return;
  const definition = STRUCTURE_DEFINITIONS[placementStructureType];
  const footprint = structureFootprint(placementStructureType);
  const placement = simulation.evaluatePlacement(
    placementStructureType,
    placementCursor.x,
    placementCursor.y,
    "player",
  );
  const previewColor = placement.valid ? colors.health : colors.disconnected;
  const powerCoverageRadius = definition.powerRadius || definition.relayRadius || 0;

  if (powerCoverageRadius > 0) {
    drawPowerCoverage(
      placementStructureType,
      placement.x,
      placement.y,
      placement.valid ? colors.energy : colors.disconnected,
      true,
    );
    const coverage = powerCoverageBounds(placementStructureType, placement.x, placement.y);
    drawLabel(
      placement.x,
      Math.max(18, coverage.top - 12),
      `Power grid · ${coverage.columns}×${coverage.rows} cells`,
      true,
      placement.valid ? colors.energy : colors.disconnected,
    );
  }

  context.save();
  context.translate(placement.x, placement.y);
  context.fillStyle = `${previewColor}24`;
  context.strokeStyle = previewColor;
  context.lineWidth = 3;
  context.fillRect(
    -footprint.halfWidth,
    -footprint.halfHeight,
    footprint.width,
    footprint.height,
  );
  context.strokeRect(
    -footprint.halfWidth,
    -footprint.halfHeight,
    footprint.width,
    footprint.height,
  );
  context.beginPath();
  context.moveTo(-8, 0);
  context.lineTo(8, 0);
  context.moveTo(0, -8);
  context.lineTo(0, 8);
  context.stroke();
  context.restore();

  const createsGrid = Boolean(definition.generationRate);
  const gridConnected = simulation.isBuildSiteConnectedToPower(
    placementStructureType,
    "player",
    placement.x,
    placement.y,
  );
  drawLabel(
    placement.x,
    placement.y + footprint.halfHeight + (placement.valid ? 24 : 46),
    createsGrid ? "Creates power grid" : gridConnected ? "Inside power grid" : "Outside power grid",
    true,
    createsGrid || gridConnected ? colors.energy : colors.disconnected,
  );

  if (!placement.valid && placement.reason) {
    drawLabel(
      placement.x,
      placement.y + footprint.halfHeight + 24,
      placement.reason,
      true,
      previewColor,
    );
  }
}

function drawMetalDeposits() {
  const occupiedIds = new Set(
    simulation.structures
      .filter(
        (structure) =>
          structure.alive && STRUCTURE_DEFINITIONS[structure.type].metalRate && structure.depositId,
      )
      .map((structure) => structure.depositId),
  );
  for (const deposit of simulation.metalDeposits) {
    const available = !occupiedIds.has(deposit.id);
    const remote = Boolean(deposit.remote);
    const emphasized = Boolean(
      placementStructureType &&
      STRUCTURE_DEFINITIONS[placementStructureType].metalRate &&
      available,
    );
    context.save();
    context.translate(deposit.x, deposit.y);
    context.strokeStyle = emphasized
      ? colors.selection
      : remote && available
        ? "#d8b76fbb"
        : available
          ? "#aaa39170"
          : "#5e5a5240";
    context.fillStyle = emphasized ? "#d0c9b91c" : remote ? "#d8b76f18" : "#8b867a10";
    context.lineWidth = emphasized || remote ? 3 : 2;
    context.beginPath();
    context.arc(0, 0, remote ? 49 : 43, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    if (remote) {
      context.strokeStyle = "#d8b76f66";
      context.setLineDash([8, 7]);
      context.beginPath();
      context.arc(0, 0, 58, 0, Math.PI * 2);
      context.stroke();
    }
    context.fillStyle = available ? "#77776f" : "#444540";
    context.beginPath();
    context.moveTo(-21, 14);
    context.lineTo(-11, -17);
    context.lineTo(0, 7);
    context.lineTo(12, -23);
    context.lineTo(23, 14);
    context.closePath();
    context.fill();
    context.restore();
    if (available) {
      drawLabel(
        deposit.x,
        deposit.y + (remote ? 70 : 57),
        remote ? `${deposit.cluster} · Remote Deposit` : "Metal Deposit",
        true,
        emphasized ? colors.selection : remote ? "#d8b76f" : "#8f8b82",
      );
    }
  }
}

function drawPowerNetwork() {
  const nodes = simulation.structures.filter(
    (structure) => {
      const definition = STRUCTURE_DEFINITIONS[structure.type];
      return Boolean(
        structure.alive &&
        structure.complete &&
        (definition.generationRate || definition.powerRadius || definition.relayRadius),
      );
    },
  );
  if (placementStructureType) {
    for (const node of nodes) {
      if (node.team !== "player" || !node.connected) continue;
      const definition = STRUCTURE_DEFINITIONS[node.type];
      const reach = definition.powerRadius || definition.relayRadius;
      if (reach) drawPowerCoverage(node.type, node.x, node.y, colors.energy);
    }
  }
  for (const link of simulation.powerLinks || []) {
    const from = simulation.getStructure(link.fromId);
    const to = simulation.getStructure(link.toId);
    if (!from?.alive || !to?.alive) continue;
    context.save();
    context.strokeStyle = from.connected && to.connected ? `${colors.energy}4d` : `${colors.disconnected}55`;
    context.lineWidth = 2;
    if (!from.connected || !to.connected) context.setLineDash([5, 7]);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
  }
  for (const node of nodes) {
    const nodeDefinition = STRUCTURE_DEFINITIONS[node.type];
    const reach = nodeDefinition.powerRadius || nodeDefinition.relayRadius;
    if (selectedStructureId === node.id) {
      if (reach) drawPowerCoverage(node.type, node.x, node.y, colors.energy, true);
    }
  }
}

function drawPowerCoverage(structureType, x, y, color, emphasized = false) {
  const coverage = powerCoverageBounds(structureType, x, y);
  if (!coverage) return;
  const gridSize = SIMULATION_RULES.buildingGridSize;
  context.save();
  context.fillStyle = `${color}${emphasized ? "1d" : "0c"}`;
  context.strokeStyle = `${color}${emphasized ? "58" : "24"}`;
  context.lineWidth = 1;
  for (let cellX = coverage.left; cellX < coverage.right; cellX += gridSize) {
    for (let cellY = coverage.top; cellY < coverage.bottom; cellY += gridSize) {
      context.fillRect(cellX + 1, cellY + 1, gridSize - 2, gridSize - 2);
      context.strokeRect(cellX + 0.5, cellY + 0.5, gridSize - 1, gridSize - 1);
    }
  }
  context.strokeStyle = `${color}${emphasized ? "dd" : "70"}`;
  context.lineWidth = emphasized ? 2.5 : 1.5;
  context.setLineDash(emphasized ? [10, 7] : [6, 10]);
  context.strokeRect(coverage.left, coverage.top, coverage.width, coverage.height);
  context.restore();
}

function drawSelectionBox() {
  if (!selectionDrag || !selectionDrag.moved) return;
  const left = Math.min(selectionDrag.start.x, selectionDrag.current.x);
  const top = Math.min(selectionDrag.start.y, selectionDrag.current.y);
  const width = Math.abs(selectionDrag.current.x - selectionDrag.start.x);
  const height = Math.abs(selectionDrag.current.y - selectionDrag.start.y);
  context.fillStyle = `${colors.selection}16`;
  context.strokeStyle = colors.selection;
  context.lineWidth = 2;
  context.fillRect(left, top, width, height);
  context.strokeRect(left, top, width, height);
}

function drawCommandIndicators() {
  const selectedStructure = simulation.getStructure(selectedStructureId);
  if (
    selectedStructure?.alive &&
    STRUCTURE_DEFINITIONS[selectedStructure.type].production &&
    selectedStructure.rallyPoint
  ) {
    context.save();
    context.strokeStyle = `${colors.selection}70`;
    context.lineWidth = 2;
    context.setLineDash([7, 7]);
    context.beginPath();
    context.moveTo(selectedStructure.x, selectedStructure.y);
    context.lineTo(selectedStructure.rallyPoint.x, selectedStructure.rallyPoint.y);
    context.stroke();
    context.restore();
    drawDestination(selectedStructure.rallyPoint.x, selectedStructure.rallyPoint.y, colors.selection);
  }

  for (const unit of simulation.units) {
    if (!selectedUnitIds.has(unit.id) || !unit.alive) continue;
    const buildTarget = simulation.getStructure(unit.buildTargetId);
    if (buildTarget?.alive && !buildTarget.complete) {
      context.save();
      context.strokeStyle = `${colors.metal}80`;
      context.lineWidth = 2;
      context.setLineDash([5, 6]);
      context.beginPath();
      context.moveTo(unit.x, unit.y);
      context.lineTo(buildTarget.x, buildTarget.y);
      context.stroke();
      context.restore();
    }
    if (unit.moveTarget) {
      context.strokeStyle = `${colors.selection}45`;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(unit.x, unit.y);
      context.lineTo(unit.moveTarget.x, unit.moveTarget.y);
      context.stroke();
      drawDestination(unit.moveTarget.x, unit.moveTarget.y, colors.selection);
    }
    const target = simulation.getEntity(unit.attackTargetId);
    if (target?.alive) {
      context.strokeStyle = "#ef596466";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(unit.x, unit.y);
      context.lineTo(target.x, target.y);
      context.stroke();
    }
  }
}

function drawDestination(x, y, color) {
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x, y, 8, 0, Math.PI * 2);
  context.moveTo(x - 12, y);
  context.lineTo(x + 12, y);
  context.moveTo(x, y - 12);
  context.lineTo(x, y + 12);
  context.stroke();
}

function drawStructure(structure) {
  const definition = STRUCTURE_DEFINITIONS[structure.type];
  const family = definition.family;
  const footprint = structureFootprint(structure.type);
  const footprintInset = 5;
  const teamColor = structure.team === "player" ? colors.player : colors.enemy;
  context.save();
  context.translate(structure.x, structure.y);
  context.globalAlpha = structure.complete ? 1 : 0.58;

  if (selectedStructureId === structure.id) {
    context.strokeStyle = colors.selection;
    context.lineWidth = 2;
    context.strokeRect(
      -footprint.halfWidth - 5,
      -footprint.halfHeight - 5,
      footprint.width + 10,
      footprint.height + 10,
    );
  }

  if (family === "charger") {
    context.strokeStyle = structure.powered ? `${colors.energy}30` : "#a34e4e20";
    context.lineWidth = 3;
    context.beginPath();
    context.arc(0, 0, definition.chargeRadius, 0, Math.PI * 2);
    context.stroke();
  }

  if (family === "sentry_turret" && selectedStructureId === structure.id) {
    context.strokeStyle = "#ef596455";
    context.lineWidth = 2;
    context.setLineDash([7, 9]);
    context.beginPath();
    context.arc(0, 0, definition.attackRange, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
  }

  context.fillStyle = "#171d24";
  context.strokeStyle = structure.powered ? teamColor : "#6e4a4e";
  context.lineWidth = 4;
  context.beginPath();
  if (family === "metal_mine") {
    polygon(6, Math.min(footprint.halfWidth, footprint.halfHeight) - footprintInset, Math.PI / 6);
  } else if (family === "power_tower" || family === "sentry_turret") {
    context.arc(0, 0, Math.min(footprint.halfWidth, footprint.halfHeight) - footprintInset, 0, Math.PI * 2);
  } else {
    context.rect(
      -footprint.halfWidth + footprintInset,
      -footprint.halfHeight + footprintInset,
      footprint.width - footprintInset * 2,
      footprint.height - footprintInset * 2,
    );
  }
  context.fill();
  context.stroke();

  context.strokeStyle = structure.powered ? colors.energy : "#7b5558";
  context.lineWidth = 3;
  if (family === "generator") {
    context.beginPath();
    context.arc(0, 0, 16, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(-7, 0);
    context.lineTo(0, -16);
    context.lineTo(7, 0);
    context.lineTo(0, 16);
    context.stroke();
  } else if (family === "charger") {
    context.beginPath();
    context.arc(0, 0, 18, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = structure.powered ? colors.energy : "#6b4d50";
    context.fillRect(-3, -12, 6, 24);
    context.fillRect(-12, -3, 24, 6);
  } else if (family === "power_tower") {
    context.beginPath();
    context.moveTo(0, -15);
    context.lineTo(-11, 14);
    context.moveTo(0, -15);
    context.lineTo(11, 14);
    context.moveTo(-7, 4);
    context.lineTo(7, 4);
    context.stroke();
  } else if (family === "battery") {
    context.strokeRect(-14, -18, 28, 36);
    context.fillStyle = structure.storedEnergy > 0 ? colors.energy : "#6b4d50";
    const batteryRatio = structure.storedEnergy / definition.storageCapacity;
    context.fillRect(-9, 13 - batteryRatio * 26, 18, batteryRatio * 26);
  } else if (family === "metal_mine") {
    context.beginPath();
    context.moveTo(-15, 12);
    context.lineTo(-8, -12);
    context.lineTo(0, 2);
    context.lineTo(9, -15);
    context.lineTo(16, 12);
    context.stroke();
  } else if (family === "factory") {
    const bayWidth = footprint.width * 0.58;
    const bayHeight = footprint.height * 0.48;
    context.strokeRect(-bayWidth / 2, -bayHeight / 2, bayWidth, bayHeight);
    context.beginPath();
    context.moveTo(-bayWidth * 0.36, bayHeight * 0.2);
    context.lineTo(bayWidth * 0.36, bayHeight * 0.2);
    context.moveTo(-bayWidth * 0.36, 0);
    context.lineTo(bayWidth * 0.36, 0);
    context.stroke();
  } else if (family === "supply_complex") {
    const level = structure.supplyLevel || 1;
    const coreWidth = footprint.width * 0.5;
    const coreHeight = footprint.height * 0.5;
    context.strokeRect(-coreWidth / 2, -coreHeight / 2, coreWidth, coreHeight);
    for (let column = -1; column <= 1; column += 1) {
      context.strokeRect(column * 46 - 13, -coreHeight * 0.7, 26, coreHeight * 1.4);
    }
    context.fillStyle = structure.powered ? colors.energy : "#6b4d50";
    for (let marker = 0; marker < level; marker += 1) {
      context.fillRect((marker - (level - 1) / 2) * 22 - 6, -6, 12, 12);
    }
  } else if (family === "sentry_turret") {
    const defenseTarget = simulation.getEntity(structure.defenseTargetId);
    if (defenseTarget?.alive) {
      context.rotate(Math.atan2(defenseTarget.y - structure.y, defenseTarget.x - structure.x));
    }
    context.beginPath();
    context.arc(0, 0, 10, 0, Math.PI * 2);
    context.moveTo(7, -4);
    context.lineTo(28, -4);
    context.lineTo(28, 4);
    context.lineTo(7, 4);
    context.stroke();
  } else {
    context.beginPath();
    context.moveTo(-19, 10);
    context.lineTo(0, -15);
    context.lineTo(19, 10);
    context.stroke();
  }
  if (structure.complete && !definition.generationRate && !structure.connected) {
    context.strokeStyle = colors.disconnected;
    context.lineWidth = 3;
    context.setLineDash([5, 6]);
    context.strokeRect(
      -footprint.halfWidth - 5,
      -footprint.halfHeight - 5,
      footprint.width + 10,
      footprint.height + 10,
    );
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(-8, -8);
    context.lineTo(8, 8);
    context.moveTo(8, -8);
    context.lineTo(-8, 8);
    context.stroke();
  }
  context.restore();

  drawLabel(
    structure.x,
    structure.y + footprint.halfHeight + 20,
    structure.complete ? definition.name : `Constructing ${definition.name}`,
    structure.powered || !structure.complete,
  );
  const structureBarWidth = Math.max(46, Math.min(120, footprint.width - 10));
  drawBar(
    structure.x,
    structure.y - footprint.halfHeight - 11,
    structureBarWidth,
    structure.hp / definition.maxHp,
    colors.health,
  );
  if (!structure.complete) {
    drawBar(
      structure.x,
      structure.y - footprint.halfHeight - 5,
      structureBarWidth,
      structure.constructionProgress / definition.buildTime,
      colors.metal,
    );
    const assignedBuilders = simulation.units.filter(
      (unit) => unit.alive && unit.buildTargetId === structure.id,
    ).length;
    drawLabel(
      structure.x,
      structure.y + footprint.halfHeight + 33,
      assignedBuilders > 0
        ? `${assignedBuilders} worker${assignedBuilders === 1 ? "" : "s"} building`
        : "paused - right-click with worker",
      assignedBuilders > 0,
      assignedBuilders > 0 ? colors.metal : colors.stasis,
    );
  } else if (definition.storageCapacity) {
    drawBar(
      structure.x,
      structure.y - footprint.halfHeight - 5,
      structureBarWidth,
      structure.storedEnergy / definition.storageCapacity,
      structure.powerStatus === "discharging" ? "#bdaaff" : colors.energy,
    );
  } else if (family === "sentry_turret") {
    drawBar(
      structure.x,
      structure.y - footprint.halfHeight - 5,
      structureBarWidth,
      structure.weaponEnergy / definition.capacitorCapacity,
      colors.energy,
    );
  }
  if (structure.complete && structure.powerStatus !== "online" && structure.powerStatus !== "generating") {
    const warning = structure.powerStatus === "disconnected" || structure.powerStatus === "no_energy";
    drawLabel(
      structure.x,
      structure.y + footprint.halfHeight + 33,
      structure.powerStatus.replace("_", " "),
      !warning,
      warning ? colors.disconnected : structure.powerStatus === "discharging" ? "#bdaaff" : colors.energy,
    );
  } else if (structure.complete && family === "sentry_turret" && selectedStructureId === structure.id) {
    drawLabel(
      structure.x,
      structure.y + footprint.halfHeight + 33,
      structure.defenseStatus,
      structure.defenseStatus !== "unpowered",
      structure.defenseStatus === "unpowered" ? colors.disconnected : colors.energy,
    );
  }
}

function drawUnit(unit) {
  const definition = UNIT_DEFINITIONS[unit.type];
  const teamColor = unit.team === "player" ? colors.player : colors.enemy;
  const darkColor = unit.team === "player" ? colors.playerDark : colors.enemyDark;
  const selected = selectedUnitIds.has(unit.id);
  const lowEnergy = energyRatio(unit) <= SIMULATION_RULES.lowEnergyRatio;
  const overdrive = unit.abilityActiveUntil.overdrive > simulation.time;

  if (definition.transferRate && selected) {
    context.save();
    context.strokeStyle = `${colors.energy}80`;
    context.fillStyle = `${colors.energy}0b`;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(unit.x, unit.y, definition.transferRange, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  }
  if (definition.transferRate && unit.energyTransferTargetIds?.length) {
    context.save();
    context.strokeStyle = `${colors.energy}a0`;
    context.lineWidth = 2;
    for (const targetId of unit.energyTransferTargetIds) {
      const target = simulation.getUnit(targetId);
      if (!target?.alive) continue;
      context.beginPath();
      context.moveTo(unit.x, unit.y);
      context.lineTo(target.x, target.y);
      context.stroke();
    }
    context.restore();
  }

  context.save();
  context.translate(unit.x, unit.y);
  if (selected) {
    context.strokeStyle = colors.selection;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, definition.radius + 7, 0, Math.PI * 2);
    context.stroke();
  }
  if (overdrive) {
    context.strokeStyle = "#ff6d76a0";
    context.lineWidth = 4;
    context.beginPath();
    context.arc(0, 0, definition.radius + 4 + Math.sin(simulation.time * 9) * 2, 0, Math.PI * 2);
    context.stroke();
  }

  drawUnitSprite(definition, teamColor, darkColor, unit.state === "stasis");
  context.restore();

  const barWidth = Math.max(24, definition.radius * 2.3);
  drawBar(unit.x, unit.y - definition.radius - 12, barWidth, unit.hp / definition.maxHp, colors.health);
  drawBar(
    unit.x,
    unit.y - definition.radius - 6,
    barWidth,
    unit.energy / definition.maxEnergy,
    lowEnergy ? colors.stasis : colors.energy,
  );
  if (unit.state === "stasis") drawLabel(unit.x, unit.y + definition.radius + 17, "STASIS", false, colors.stasis);
}

function drawUnitSprite(definition, teamColor, darkColor, stasis) {
  if (definition.workerTier) {
    drawWorkerDroneSprite(definition, teamColor, darkColor, stasis);
    return;
  }
  drawMechSprite(definition, teamColor, darkColor, stasis);
}

function drawWorkerDroneSprite(definition, teamColor, darkColor, stasis) {
  const outline = stasis ? colors.stasis : teamColor;
  const body = stasis ? "#403b32" : darkColor;
  context.save();
  context.scale(definition.radius, definition.radius);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = outline;
  context.fillStyle = body;
  context.lineWidth = 0.18;

  context.beginPath();
  context.moveTo(-0.35, -0.12);
  context.lineTo(-0.9, -0.62);
  context.moveTo(0.35, -0.12);
  context.lineTo(0.9, -0.62);
  context.moveTo(-0.38, 0.18);
  context.lineTo(-0.82, 0.72);
  context.moveTo(0.38, 0.18);
  context.lineTo(0.82, 0.72);
  context.stroke();

  context.beginPath();
  polygon(6, 0.58, Math.PI / 6);
  context.fill();
  context.stroke();
  context.fillStyle = stasis ? colors.stasis : teamColor;
  context.fillRect(-0.18, -0.18, 0.36, 0.36);

  context.lineWidth = 0.12;
  context.beginPath();
  context.moveTo(-0.9, -0.62);
  context.lineTo(-1, -0.42);
  context.moveTo(-0.9, -0.62);
  context.lineTo(-0.7, -0.72);
  context.moveTo(0.9, -0.62);
  context.lineTo(1, -0.42);
  context.moveTo(0.9, -0.62);
  context.lineTo(0.7, -0.72);
  context.stroke();
  context.restore();
}

function drawMechSprite(definition, teamColor, darkColor, stasis) {
  const role = definition.role || "vanguard";
  const heavy = role === "bulwark";
  const carrier = role === "carrier";
  const raider = role === "raider";
  const outline = stasis ? "#24231f" : "#171d23";
  const armor = stasis ? "#555047" : "#68727c";
  const armorDark = stasis ? "#35322d" : "#343d46";
  const armorLight = stasis ? "#777066" : "#9ca6af";
  const joint = stasis ? "#292721" : "#20272e";
  const accent = stasis ? `${teamColor}88` : teamColor;
  const glass = stasis ? "#776b4d" : "#183642";
  context.save();
  context.scale(definition.radius, definition.radius);
  context.lineCap = "butt";
  context.lineJoin = "bevel";
  context.strokeStyle = outline;
  context.lineWidth = 0.1;

  // Wide planted feet, segmented shins, and exposed knee joints give the unit
  // a load-bearing mechanical stance instead of a single icon-like body shape.
  for (const side of [-1, 1]) {
    context.fillStyle = armorDark;
    context.beginPath();
    context.moveTo(side * 0.18, 0.78);
    context.lineTo(side * 0.58, 0.78);
    context.lineTo(side * 0.68, 0.98);
    context.lineTo(side * 0.16, 0.98);
    context.closePath();
    context.fill();
    context.stroke();

    context.fillStyle = armor;
    context.beginPath();
    context.moveTo(side * 0.2, 0.28);
    context.lineTo(side * 0.51, 0.28);
    context.lineTo(side * 0.57, 0.78);
    context.lineTo(side * 0.18, 0.78);
    context.closePath();
    context.fill();
    context.stroke();

    context.fillStyle = joint;
    context.beginPath();
    context.arc(side * 0.36, 0.25, 0.13, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.fillStyle = armorDark;
    context.beginPath();
    context.moveTo(side * 0.17, -0.12);
    context.lineTo(side * 0.53, -0.08);
    context.lineTo(side * 0.45, 0.2);
    context.lineTo(side * 0.25, 0.2);
    context.closePath();
    context.fill();
    context.stroke();

    context.strokeStyle = armorLight;
    context.lineWidth = 0.055;
    context.beginPath();
    context.moveTo(side * 0.27, 0.39);
    context.lineTo(side * 0.43, 0.67);
    context.stroke();
    context.strokeStyle = outline;
    context.lineWidth = 0.1;
  }

  // Pelvis and torso use layered armor plates over a darker internal chassis.
  context.fillStyle = joint;
  context.fillRect(-0.46, -0.18, 0.92, 0.32);
  context.strokeRect(-0.46, -0.18, 0.92, 0.32);
  context.fillStyle = armor;
  context.beginPath();
  context.moveTo(-0.58, -0.63);
  context.lineTo(-0.36, -0.79);
  context.lineTo(0.36, -0.79);
  context.lineTo(0.58, -0.63);
  context.lineTo(0.46, -0.15);
  context.lineTo(0, 0.08);
  context.lineTo(-0.46, -0.15);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = armorLight;
  context.beginPath();
  context.moveTo(-0.36, -0.7);
  context.lineTo(0, -0.78);
  context.lineTo(0, -0.1);
  context.lineTo(-0.35, -0.25);
  context.closePath();
  context.fill();

  // Compact cockpit with dark glazing; team color is limited to identification
  // panels on the brow, shoulders, chest, and tier pips.
  context.fillStyle = glass;
  context.beginPath();
  context.moveTo(-0.23, -0.86);
  context.lineTo(-0.14, -1.02);
  context.lineTo(0.14, -1.02);
  context.lineTo(0.23, -0.86);
  context.lineTo(0.15, -0.72);
  context.lineTo(-0.15, -0.72);
  context.closePath();
  context.fill();
  context.stroke();
  context.fillStyle = accent;
  context.fillRect(-0.18, -0.88, 0.36, 0.075);

  const shoulderWidth = heavy ? 0.42 : carrier ? 0.34 : 0.3;
  for (const side of [-1, 1]) {
    context.fillStyle = armorDark;
    context.beginPath();
    context.moveTo(side * 0.5, -0.67);
    context.lineTo(side * (0.5 + shoulderWidth), -0.6);
    context.lineTo(side * (0.54 + shoulderWidth), -0.28);
    context.lineTo(side * 0.54, -0.22);
    context.closePath();
    context.fill();
    context.stroke();

    context.fillStyle = accent;
    context.beginPath();
    context.moveTo(side * 0.56, -0.6);
    context.lineTo(side * (0.43 + shoulderWidth), -0.54);
    context.lineTo(side * (0.46 + shoulderWidth), -0.43);
    context.lineTo(side * 0.57, -0.46);
    context.closePath();
    context.fill();
  }

  context.fillStyle = accent;
  context.beginPath();
  context.moveTo(-0.25, -0.3);
  context.lineTo(0, -0.17);
  context.lineTo(0.25, -0.3);
  context.lineTo(0.18, -0.18);
  context.lineTo(0, -0.07);
  context.lineTo(-0.18, -0.18);
  context.closePath();
  context.fill();

  if (heavy) {
    // Bulwarks carry a thick left forearm shield and a braced twin-barrel cannon.
    context.fillStyle = armor;
    context.fillRect(-1.02, -0.48, 0.28, 0.64);
    context.strokeRect(-1.02, -0.48, 0.28, 0.64);
    context.fillStyle = accent;
    context.fillRect(-0.98, -0.4, 0.08, 0.45);
    context.strokeStyle = joint;
    context.lineWidth = 0.11;
    for (const offset of [-0.07, 0.07]) {
      context.beginPath();
      context.moveTo(0.8 + offset, -0.38);
      context.lineTo(1.14 + offset, -0.76);
      context.stroke();
    }
  } else if (carrier) {
    // Carriers replace weapons with protected capacitor drums and a visible core.
    context.fillStyle = armorDark;
    for (const side of [-1, 1]) {
      context.fillRect(side * 0.7 - 0.1, -0.2, 0.2, 0.48);
      context.strokeRect(side * 0.7 - 0.1, -0.2, 0.2, 0.48);
      context.fillStyle = accent;
      context.fillRect(side * 0.7 - 0.07, -0.14, 0.14, 0.08);
      context.fillStyle = armorDark;
    }
    context.strokeStyle = stasis ? colors.stasis : colors.energy;
    context.lineWidth = 0.1;
    context.beginPath();
    context.arc(0, -0.43, 0.22, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = stasis ? colors.stasis : colors.energy;
    context.beginPath();
    context.arc(0, -0.43, 0.1, 0, Math.PI * 2);
    context.fill();
  } else {
    // Vanguards and raiders use a compact articulated gun arm.
    context.fillStyle = armor;
    context.beginPath();
    context.moveTo(0.73, -0.36);
    context.lineTo(0.93, -0.31);
    context.lineTo(1.12, -0.72);
    context.lineTo(1.01, -0.79);
    context.lineTo(0.79, -0.5);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = joint;
    context.beginPath();
    context.arc(0.78, -0.39, 0.1, 0, Math.PI * 2);
    context.fill();
    if (raider) {
      context.fillStyle = armorDark;
      context.beginPath();
      context.moveTo(-0.18, -0.98);
      context.lineTo(-0.43, -1.15);
      context.lineTo(-0.28, -0.86);
      context.closePath();
      context.fill();
      context.stroke();
      context.beginPath();
      context.moveTo(0.18, -0.98);
      context.lineTo(0.43, -1.15);
      context.lineTo(0.28, -0.86);
      context.closePath();
      context.fill();
      context.stroke();
    }
  }

  context.fillStyle = accent;
  const pipCount = Math.max(1, definition.tier || 1);
  for (let pip = 0; pip < pipCount; pip += 1) {
    context.fillRect(-0.2 + pip * 0.16, 0.08, 0.1, 0.08);
  }
  context.restore();
}

function drawDrone(drone) {
  const yard = simulation.getStructure(drone.yardId);
  if (drone.targetWreckId) {
    const wreck = simulation.getWreck(drone.targetWreckId);
    if (wreck) {
      context.strokeStyle = "#c5c0aa28";
      context.setLineDash([4, 7]);
      context.beginPath();
      context.moveTo(drone.x, drone.y);
      context.lineTo(wreck.x, wreck.y);
      context.stroke();
      context.setLineDash([]);
    }
  } else if (yard && drone.mode === "returning") {
    context.strokeStyle = "#c5c0aa20";
    context.beginPath();
    context.moveTo(drone.x, drone.y);
    context.lineTo(yard.x, yard.y);
    context.stroke();
  }

  context.save();
  context.translate(drone.x, drone.y);
  context.rotate(simulation.time * 2 + drone.slot);
  context.fillStyle = "#292b2b";
  context.strokeStyle = colors.metal;
  context.lineWidth = 2;
  context.beginPath();
  polygon(3, DRONE_DEFINITION.radius);
  context.fill();
  context.stroke();
  context.restore();
  if (drone.carry > 0) {
    drawBar(
      drone.x,
      drone.y - 14,
      24,
      drone.carry / DRONE_DEFINITION.carryCapacity,
      colors.metal,
    );
  }
}

function drawWreck(wreck) {
  const ratio = wreck.initialMetal > 0 ? wreck.metal / wreck.initialMetal : 0;
  context.save();
  context.translate(wreck.x, wreck.y);
  context.rotate((wreck.x + wreck.y) * 0.01);
  context.fillStyle = "#35383a";
  context.strokeStyle = "#9f998c";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(-15, 9);
  context.lineTo(-10, -12);
  context.lineTo(4, -8);
  context.lineTo(16, 5);
  context.lineTo(2, 13);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
  drawBar(wreck.x, wreck.y - 22, 40, ratio, colors.metal);
  context.fillStyle = "#bdb5a5";
  context.font = "600 10px ui-monospace, monospace";
  context.textAlign = "center";
  context.fillText(`${Math.ceil(wreck.metal)}M`, wreck.x, wreck.y + 28);
  context.textAlign = "start";
}

function drawEvents() {
  for (const event of simulation.events) {
    const age = simulation.time - event.time;
    const alpha = Math.max(0, 1 - age / 1.2);
    if (event.type === "attack") {
      const source = simulation.getEntity(event.sourceId);
      if (!source) continue;
      context.strokeStyle = `rgba(255, 110, 115, ${alpha})`;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(source.x, source.y);
      context.lineTo(event.x, event.y);
      context.stroke();
    } else {
      const eventColor = event.type === "stasis" ? colors.stasis : colors.energy;
      context.globalAlpha = alpha;
      context.strokeStyle = eventColor;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(event.x, event.y, 15 + age * 35, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
    }
  }
}

function drawBar(x, y, width, ratio, fill) {
  const safeRatio = Math.max(0, Math.min(1, ratio));
  context.fillStyle = "#050608c9";
  context.fillRect(x - width / 2, y, width, 4);
  context.fillStyle = fill;
  context.fillRect(x - width / 2, y, width * safeRatio, 4);
}

function drawLabel(x, y, text, active = true, color = null) {
  context.fillStyle = color || (active ? "#aeb8c2" : "#8f6669");
  context.font = "600 10px ui-monospace, monospace";
  context.textAlign = "center";
  context.fillText(text.toUpperCase(), x, y);
  context.textAlign = "start";
}

function polygon(sides, radius, rotation = 0) {
  for (let side = 0; side < sides; side += 1) {
    const angle = rotation + (side / sides) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (side === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

function updateInterface() {
  metalValue.textContent = Math.floor(simulation.resources.player.metal).toLocaleString();
  const netEnergyRate = simulation.getNetEnergyRate("player");
  const netEnergyText = netEnergyRate.toLocaleString(undefined, { maximumFractionDigits: 1 });
  energyValue.textContent = `${netEnergyRate >= 0 ? "+" : ""}${netEnergyText}/s · ${Math.floor(simulation.resources.player.energy)}/${simulation.resources.player.energyCapacity}`;
  const playerSupply = simulation.getSupplyState("player");
  supplyValue.textContent = `${playerSupply.used.toLocaleString()}/${playerSupply.capacity.toLocaleString()}`;
  supplyValue.title = `${playerSupply.unitSupply.toLocaleString()} active · ${playerSupply.reservedSupply.toLocaleString()} queued`;

  const selectedUnits = [...selectedUnitIds]
    .map((id) => simulation.getUnit(id))
    .filter(Boolean);
  const selectedStructure = simulation.getStructure(selectedStructureId);
  if (selectedStructure) {
    const definition = STRUCTURE_DEFINITIONS[selectedStructure.type];
    selectionName.textContent = definition.name;
    const queueText = selectedStructure.productionQueue.length
      ? ` · ${selectedStructure.productionQueue.length} queued`
      : "";
    const rallyText = definition.production && selectedStructure.rallyPoint
      ? ` · rally ${Math.round(selectedStructure.rallyPoint.x)},${Math.round(selectedStructure.rallyPoint.y)}`
      : "";
    const status = selectedStructure.complete
      ? selectedStructure.powerStatus.replace("_", " ").toUpperCase()
      : `${Math.floor((selectedStructure.constructionProgress / definition.buildTime) * 100)}% BUILT`;
    const storageText = definition.storageCapacity
      ? ` · ${Math.floor(selectedStructure.storedEnergy)}/${definition.storageCapacity} stored energy`
      : "";
    const generatorText = definition.generationRate
      ? ` · +${definition.generationRate} energy/s constant · ${Math.floor(selectedStructure.energyGenerated)} generated`
      : "";
    const defenseText = definition.capacitorCapacity
      ? ` · ${Math.floor(selectedStructure.weaponEnergy)}/${definition.capacitorCapacity} capacitor · ${selectedStructure.defenseStatus.toUpperCase()}`
      : "";
    const builderCount = selectedStructure.complete
      ? 0
      : simulation.units.filter((unit) => unit.alive && unit.buildTargetId === selectedStructure.id).length;
    const builderText = selectedStructure.complete
      ? ""
      : builderCount > 0
        ? ` · ${builderCount} worker${builderCount === 1 ? "" : "s"} assigned`
        : " · paused—right-click with a worker to resume";
    const demandText = definition.powerDemand
      ? ` · ${simulation.getStructurePowerDemandRate(selectedStructure)} energy/s demand`
      : "";
    const supplyComplexText = definition.supplyLevels
      ? selectedStructure.supplyUpgrade
        ? ` · SUPPLY LEVEL ${selectedStructure.supplyLevel} · UPGRADING TO ${selectedStructure.supplyUpgrade.targetLevel}`
        : ` · SUPPLY LEVEL ${selectedStructure.supplyLevel} · +${definition.supplyLevels[selectedStructure.supplyLevel - 1].capacity.toLocaleString()} capacity`
      : "";
    selectionDetails.textContent = `${Math.ceil(selectedStructure.hp)}/${definition.maxHp} integrity · ${status}${storageText}${generatorText}${demandText}${defenseText}${supplyComplexText}${builderText}${queueText}${rallyText}`;
  } else if (selectedUnits.length === 0) {
    selectionName.textContent = "No units selected";
    selectionDetails.textContent = "Select friendly units or a structure on the battlefield.";
  } else if (selectedUnits.length === 1) {
    const unit = selectedUnits[0];
    const definition = UNIT_DEFINITIONS[unit.type];
    const emergencyRecoveryText =
      unit.state === "active" && unit.energy < SIMULATION_RULES.lowEnergyRegenerationThreshold
        ? ` · EMERGENCY REGEN +${SIMULATION_RULES.lowEnergyRegenerationRate}/s`
        : "";
    const buildTarget = simulation.getStructure(unit.buildTargetId);
    const orderText = buildTarget?.alive && !buildTarget.complete
      ? ` · BUILDING ${STRUCTURE_DEFINITIONS[buildTarget.type].name.toUpperCase()}`
      : "";
    const supplyText = definition.transferRate
      ? unit.energyTransferTargetIds?.length
        ? ` · SUPPLYING ${unit.energyTransferTargetIds.length} UNIT${unit.energyTransferTargetIds.length === 1 ? "" : "S"}`
        : ` · NO UNIT IN ${definition.transferRange} RANGE`
      : "";
    selectionName.textContent = definition.name;
    selectionDetails.textContent = `${Math.ceil(unit.hp)}/${definition.maxHp} integrity · ${Math.ceil(unit.energy)}/${definition.maxEnergy} energy · ${unit.state.toUpperCase()}${emergencyRecoveryText}${supplyText}${orderText}`;
  } else {
    const activeCount = selectedUnits.filter((unit) => unit.state === "active").length;
    selectionName.textContent = `${selectedUnits.length} units selected`;
    selectionDetails.textContent = `${activeCount} active · ${selectedUnits.length - activeCount} in stasis`;
  }

  const canOverdrive = selectedUnits.some((unit) => {
    const ability = UNIT_DEFINITIONS[unit.type].abilities?.overdrive;
    return ability && unit.state === "active" && unit.energy >= ability.energyCost;
  });
  overdriveButton.disabled = !canOverdrive;
  unitCommands.hidden = selectedUnits.length === 0;

  const selectedWorkers = selectedUnits.filter((unit) => UNIT_DEFINITIONS[unit.type].workerTier);
  buildCommands.hidden = selectedWorkers.length === 0;
  const selectedWorkerTier = selectedWorkers.reduce(
    (highest, unit) => Math.max(highest, UNIT_DEFINITIONS[unit.type].workerTier),
    0,
  );
  for (const [structureType, button] of buildButtons) {
    const definition = STRUCTURE_DEFINITIONS[structureType];
    const workerCanBuild = canWorkerTierBuildStructure(selectedWorkerTier, structureType);
    button.disabled = !workerCanBuild || simulation.resources.player.metal < definition.metalCost;
    button.classList.toggle("locked", !workerCanBuild);
    button.title = workerCanBuild
      ? ""
      : `Requires a Tier ${definition.minimumWorkerTier} Worker Drone`;
    button.classList.toggle("active", placementStructureType === structureType);
  }
  if (
    placementStructureType &&
    !canWorkerTierBuildStructure(selectedWorkerTier, placementStructureType)
  ) {
    placementStructureType = null;
    placementMessage = null;
    placementCursor = null;
  }

  const factoryDefinition = selectedStructure && STRUCTURE_DEFINITIONS[selectedStructure.type];
  const availableProduction = factoryDefinition?.production || [];
  productionCommands.hidden = availableProduction.length === 0;
  for (const [unitType, button] of productionButtons) {
    const available = availableProduction.includes(unitType);
    const unitDefinition = UNIT_DEFINITIONS[unitType];
    button.hidden = !available;
    button.disabled =
      !selectedStructure?.powered ||
      simulation.resources.player.metal < unitDefinition.metalCost ||
      playerSupply.remaining < unitDefinition.supplyCost;
  }

  const canCancelConstruction = Boolean(selectedStructure && !selectedStructure.complete);
  cancelConstructionButton.hidden = !canCancelConstruction;
  if (canCancelConstruction) {
    const definition = STRUCTURE_DEFINITIONS[selectedStructure.type];
    const unbuiltRatio = 1 - selectedStructure.constructionProgress / definition.buildTime;
    cancelRefundValue.textContent = Math.floor(
      definition.metalCost *
      unbuiltRatio *
      SIMULATION_RULES.constructionCancelRefundRate,
    ).toLocaleString();
  }
  const supplyDefinition = selectedStructure && STRUCTURE_DEFINITIONS[selectedStructure.type];
  const canShowSupplyUpgrade = Boolean(
    selectedStructure?.complete &&
    supplyDefinition?.supplyLevels &&
    (selectedStructure.supplyUpgrade || selectedStructure.supplyLevel < supplyDefinition.supplyLevels.length),
  );
  supplyUpgradeButton.hidden = !canShowSupplyUpgrade;
  if (canShowSupplyUpgrade) {
    const targetLevel = selectedStructure.supplyUpgrade?.targetLevel || selectedStructure.supplyLevel + 1;
    const upgrade = supplyDefinition.supplyLevels[targetLevel - 1];
    if (selectedStructure.supplyUpgrade) {
      const progress = Math.floor((selectedStructure.supplyUpgrade.progress / upgrade.upgradeTime) * 100);
      supplyUpgradeTitle.textContent = `Upgrading to Supply Level ${targetLevel}`;
      supplyUpgradeDetails.textContent = `${progress}% · ${selectedStructure.powered ? "in progress" : "waiting for power"}`;
      supplyUpgradeButton.disabled = true;
    } else {
      supplyUpgradeTitle.textContent = `Upgrade to Supply Level ${targetLevel}`;
      supplyUpgradeDetails.textContent = `${upgrade.metalCost.toLocaleString()} metal · ${upgrade.upgradeTime}s · ${upgrade.capacity.toLocaleString()} capacity`;
      supplyUpgradeButton.disabled = simulation.resources.player.metal < upgrade.metalCost;
    }
  }
  const buildingUpgrade = selectedStructure?.complete
    ? simulation.getStructureUpgradeInfo(selectedStructure.id)
    : null;
  const canShowBuildingUpgrade = Boolean(buildingUpgrade?.targetType);
  buildingUpgradeButton.hidden = !canShowBuildingUpgrade;
  if (canShowBuildingUpgrade) {
    const targetDefinition = STRUCTURE_DEFINITIONS[buildingUpgrade.targetType];
    buildingUpgradeTitle.textContent = `Upgrade to ${targetDefinition.name}`;
    buildingUpgradeDetails.textContent = buildingUpgrade.valid
      ? `${buildingUpgrade.metalCost.toLocaleString()} metal · immediate in-place upgrade`
      : buildingUpgrade.reason;
    buildingUpgradeButton.disabled = !buildingUpgrade.valid;
  }
  structureCommands.hidden =
    !canCancelConstruction && !canShowSupplyUpgrade && !canShowBuildingUpgrade;

  const lowEnergyUnits = simulation.units.filter(
    (unit) => unit.alive && unit.team === "player" && energyRatio(unit) <= SIMULATION_RULES.lowEnergyRatio,
  );
  const stasisUnits = lowEnergyUnits.filter((unit) => unit.state === "stasis");
  const disconnectedStructures = simulation.structures.filter(
    (structure) =>
      structure.alive &&
      structure.complete &&
      structure.team === "player" &&
      !STRUCTURE_DEFINITIONS[structure.type].generationRate &&
      !structure.connected,
  );
  if (forceMoveArmed) {
    statusBanner.hidden = false;
    statusBanner.textContent = "FORCE MOVE ARMED · RIGHT-CLICK DESTINATION · ESC TO CANCEL";
  } else if (placementStructureType) {
    statusBanner.hidden = false;
    statusBanner.textContent = placementMessage || `PLACE ${STRUCTURE_DEFINITIONS[placementStructureType].name.toUpperCase()} · RIGHT-CLICK TO CANCEL`;
  } else if (playerSupply.used >= playerSupply.capacity) {
    statusBanner.hidden = false;
    statusBanner.textContent = "SUPPLY LIMIT REACHED · BUILD OR UPGRADE A STRATEGIC SUPPLY COMPLEX";
  } else if (stasisUnits.length > 0) {
    statusBanner.hidden = false;
    statusBanner.textContent = `${stasisUnits.length} UNIT${stasisUnits.length === 1 ? "" : "S"} IN STASIS`;
  } else if (disconnectedStructures.length > 0) {
    statusBanner.hidden = false;
    statusBanner.textContent = `${disconnectedStructures.length} STRUCTURE${disconnectedStructures.length === 1 ? "" : "S"} DISCONNECTED FROM POWER`;
  } else if (lowEnergyUnits.length > 0) {
    statusBanner.hidden = false;
    statusBanner.textContent = `${lowEnergyUnits.length} UNIT${lowEnergyUnits.length === 1 ? "" : "S"} LOW ON ENERGY`;
  } else {
    statusBanner.hidden = true;
  }
}

function pruneSelection() {
  selectedUnitIds = new Set(
    [...selectedUnitIds].filter((id) => {
      const unit = simulation.getUnit(id);
      return unit?.alive && unit.team === "player";
    }),
  );
  const structure = simulation.getStructure(selectedStructureId);
  if (!structure?.alive || structure.team !== "player") selectedStructureId = null;
}

function canvasScreenPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
    y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
  };
}

function screenToWorld(point) {
  return {
    x: camera.x + (point.x - canvas.width / 2) / camera.zoom,
    y: camera.y + (point.y - canvas.height / 2) / camera.zoom,
  };
}

function canvasPoint(event) {
  return screenToWorld(canvasScreenPoint(event));
}

function syncPointerToCamera() {
  if (!pointerScreen) return;
  placementCursor = screenToWorld(pointerScreen);
  if (placementStructureType) {
    const placement = simulation.evaluatePlacement(
      placementStructureType,
      placementCursor.x,
      placementCursor.y,
      "player",
    );
    placementMessage = placement.valid ? null : placement.reason.toUpperCase();
  }
  if (!selectionDrag) return;
  selectionDrag.current = placementCursor;
  selectionDrag.currentScreen = pointerScreen;
  selectionDrag.moved = Math.hypot(
    selectionDrag.currentScreen.x - selectionDrag.startScreen.x,
    selectionDrag.currentScreen.y - selectionDrag.startScreen.y,
  ) > 8;
}

function clampValue(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function findUnitAt(point, team = null) {
  const candidates = simulation.units.filter((unit) => {
    if (!unit.alive || (team && unit.team !== team)) return false;
    return Math.hypot(unit.x - point.x, unit.y - point.y) <= UNIT_DEFINITIONS[unit.type].radius + 8;
  });
  return candidates.at(-1) || null;
}

function findStructureAt(point, team = null) {
  const candidates = simulation.structures.filter((structure) => {
    if (!structure.alive || (team && structure.team !== team)) return false;
    const footprint = structureFootprint(structure.type);
    return (
      Math.abs(structure.x - point.x) <= footprint.halfWidth + 7 &&
      Math.abs(structure.y - point.y) <= footprint.halfHeight + 7
    );
  });
  return candidates.at(-1) || null;
}

function findEnemyAt(point) {
  const candidates = [
    ...simulation.units.filter((entity) => entity.alive && entity.team === "enemy"),
    ...simulation.structures.filter((entity) => entity.alive && entity.team === "enemy"),
    ...simulation.getDrones().filter((entity) => entity.alive && entity.team === "enemy"),
  ];
  return (
    candidates.find((entity) => {
      const radius =
        entity.kind === "unit"
          ? UNIT_DEFINITIONS[entity.type].radius
          : entity.kind === "structure"
            ? STRUCTURE_DEFINITIONS[entity.type].radius
            : DRONE_DEFINITION.radius;
      return Math.hypot(entity.x - point.x, entity.y - point.y) <= radius + 10;
    }) || null
  );
}

canvas.addEventListener("mousedown", (event) => {
  if (event.button !== 0) return;
  pointerScreen = canvasScreenPoint(event);
  const point = screenToWorld(pointerScreen);
  selectionDrag = {
    start: point,
    current: point,
    startScreen: pointerScreen,
    currentScreen: pointerScreen,
    moved: false,
    shift: event.shiftKey,
  };
});

canvas.addEventListener("mousemove", (event) => {
  pointerScreen = canvasScreenPoint(event);
  syncPointerToCamera();
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  pointerScreen = canvasScreenPoint(event);
  const worldBeforeZoom = screenToWorld(pointerScreen);
  const boundedDelta = clampValue(event.deltaY, -100, 100);
  camera.zoom = clampValue(
    camera.zoom * Math.exp(-boundedDelta * 0.002),
    minCameraZoom,
    maxCameraZoom,
  );
  camera.x = worldBeforeZoom.x - (pointerScreen.x - canvas.width / 2) / camera.zoom;
  camera.y = worldBeforeZoom.y - (pointerScreen.y - canvas.height / 2) / camera.zoom;
  clampCamera();
  syncPointerToCamera();
}, { passive: false });

function placeConstruction(point) {
  if (!placementStructureType) return false;
  const workers = [...selectedUnitIds].filter((id) => {
    const unit = simulation.getUnit(id);
    return unit && UNIT_DEFINITIONS[unit.type].workerTier;
  });
  const structure = simulation.startConstruction(
    workers,
    placementStructureType,
    point.x,
    point.y,
  );
  if (structure) {
    placementStructureType = null;
    placementMessage = null;
    placementCursor = null;
  } else {
    placementMessage = (simulation.lastPlacementError || "Invalid construction location.").toUpperCase();
  }
  updateInterface();
  return Boolean(structure);
}

canvas.addEventListener("mouseup", (event) => {
  if (event.button !== 0 || !selectionDrag) return;
  const drag = selectionDrag;
  selectionDrag = null;

  if (placementStructureType) {
    placeConstruction(drag.current);
    return;
  }

  if (drag.moved) {
    const left = Math.min(drag.start.x, drag.current.x);
    const right = Math.max(drag.start.x, drag.current.x);
    const top = Math.min(drag.start.y, drag.current.y);
    const bottom = Math.max(drag.start.y, drag.current.y);
    if (!drag.shift) selectedUnitIds.clear();
    for (const unit of simulation.units) {
      if (
        unit.alive &&
        unit.team === "player" &&
        unit.x >= left &&
        unit.x <= right &&
        unit.y >= top &&
        unit.y <= bottom
      ) {
        selectedUnitIds.add(unit.id);
      }
    }
    selectedStructureId = null;
  } else {
    const unit = findUnitAt(drag.current, "player");
    const structure = unit ? null : findStructureAt(drag.current, "player");
    if (!drag.shift) {
      selectedUnitIds.clear();
      selectedStructureId = null;
    }
    if (unit) {
      if (drag.shift && selectedUnitIds.has(unit.id)) selectedUnitIds.delete(unit.id);
      else selectedUnitIds.add(unit.id);
      selectedStructureId = null;
    } else if (structure) {
      selectedStructureId = structure.id;
      selectedUnitIds.clear();
    }
  }
  updateInterface();
});

canvas.addEventListener("click", (event) => {
  if (placementStructureType) placeConstruction(canvasPoint(event));
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  if (placementStructureType) {
    placementStructureType = null;
    placementMessage = null;
    placementCursor = null;
    updateInterface();
    return;
  }
  const point = canvasPoint(event);
  const selectedStructure = simulation.getStructure(selectedStructureId);
  if (
    selectedStructure?.team === "player" &&
    STRUCTURE_DEFINITIONS[selectedStructure.type].production &&
    simulation.commandRally(selectedStructure.id, point.x, point.y)
  ) {
    updateInterface();
    return;
  }
  if (selectedUnitIds.size === 0) return;
  const forceMove = forceMoveArmed;
  if (!forceMove) {
    const friendlyStructure = findStructureAt(point, "player");
    if (
      friendlyStructure &&
      !friendlyStructure.complete &&
      simulation.commandBuild([...selectedUnitIds], friendlyStructure.id) > 0
    ) {
      updateInterface();
      return;
    }
    const enemy = findEnemyAt(point);
    if (enemy) {
      simulation.commandAttack([...selectedUnitIds], enemy.id);
      return;
    }
  }

  const selected = [...selectedUnitIds];
  const columns = Math.ceil(Math.sqrt(selected.length));
  selected.forEach((id, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const offsetX = (column - (columns - 1) / 2) * 44;
    const offsetY = (row - (Math.ceil(selected.length / columns) - 1) / 2) * 44;
    simulation.commandMove([id], point.x + offsetX, point.y + offsetY, { force: forceMove });
  });
  forceMoveArmed = false;
  updateInterface();
});

function activateOverdrive() {
  simulation.activateAbility([...selectedUnitIds], "overdrive");
  updateInterface();
}

function cancelSelectedConstruction() {
  if (!selectedStructureId) return false;
  const result = simulation.cancelConstruction(selectedStructureId, "player");
  if (!result) return false;
  selectedStructureId = null;
  updateInterface();
  return true;
}

overdriveButton.addEventListener("click", activateOverdrive);
cancelConstructionButton.addEventListener("click", cancelSelectedConstruction);
supplyUpgradeButton.addEventListener("click", () => {
  if (selectedStructureId) simulation.queueSupplyUpgrade(selectedStructureId);
  updateInterface();
});
buildingUpgradeButton.addEventListener("click", () => {
  if (selectedStructureId) simulation.upgradeStructure(selectedStructureId, "player");
  updateInterface();
});
stopButton.addEventListener("click", () => simulation.commandStop([...selectedUnitIds], false));
holdButton.addEventListener("click", () => simulation.commandStop([...selectedUnitIds], true));
pauseButton.addEventListener("click", () => {
  paused = !paused;
  pauseButton.textContent = paused ? "Resume simulation" : "Pause simulation";
});
resetButton.addEventListener("click", resetGame);

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["w", "a", "s", "d"].includes(key)) {
    event.preventDefault();
    cameraKeys.add(key);
  }
  if (key === "q" && !event.repeat) activateOverdrive();
  if (key === "c" && !event.repeat) cancelSelectedConstruction();
  if (key === "g" && !event.repeat) {
    forceMoveArmed = true;
    placementStructureType = null;
    placementMessage = null;
    placementCursor = null;
    updateInterface();
  }
  if (event.key === "Escape") {
    forceMoveArmed = false;
    placementStructureType = null;
    placementMessage = null;
    placementCursor = null;
    selectionDrag = null;
    updateInterface();
  }
  if (event.code === "Space" && !event.repeat) {
    event.preventDefault();
    pauseButton.click();
  }
});

window.addEventListener("keyup", (event) => {
  cameraKeys.delete(event.key.toLowerCase());
});

window.addEventListener("blur", () => {
  cameraKeys.clear();
});

window.crimsonDawn = {
  get simulation() {
    return simulation;
  },
  get camera() {
    return { ...camera };
  },
  reset: resetGame,
};

updateInterface();
requestAnimationFrame(frame);
