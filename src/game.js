import {
  BUILD_MENU_BY_TIER,
  canWorkerTierBuildStructure,
  DEFAULT_MAP_ID,
  DRONE_DEFINITION,
  MAP_DEFINITIONS,
  resolveMatchMapId,
  SIMULATION_RULES,
  STRUCTURE_DEFINITIONS,
  UNIT_DEFINITIONS,
  powerCoverageBounds,
  structureFootprint,
} from "./data.js";
import { getMatchMap } from "./maps.js";
import { energyRatio, Simulation } from "./simulation.js";
import { PeerMultiplayerSession } from "./multiplayer.js";

const canvas = document.querySelector("#battlefield");
const context = canvas.getContext("2d");
const startMenu = document.querySelector("#start-menu");
const gameShell = document.querySelector("#game-shell");
const modeChoices = document.querySelector("#mode-choices");
const singlePlayerButton = document.querySelector("#single-player-button");
const singlePlayerSetup = document.querySelector("#single-player-setup");
const singlePlayerCount = document.querySelector("#single-player-count");
const singlePlayerMap = document.querySelector("#single-player-map");
const singlePlayerMapDescription = document.querySelector("#single-player-map-description");
const startSinglePlayerButton = document.querySelector("#start-single-player-button");
const backFromSinglePlayerButton = document.querySelector("#back-from-single-player-button");
const multiplayerButton = document.querySelector("#multiplayer-button");
const multiplayerSetup = document.querySelector("#multiplayer-setup");
const createHostButton = document.querySelector("#create-host-button");
const createGuestButton = document.querySelector("#create-guest-button");
const acceptAnswerButton = document.querySelector("#accept-answer-button");
const backToModesButton = document.querySelector("#back-to-modes-button");
const hostOfferCode = document.querySelector("#host-offer-code");
const guestAnswerCode = document.querySelector("#guest-answer-code");
const joinOfferCode = document.querySelector("#join-offer-code");
const guestResponseCode = document.querySelector("#guest-response-code");
const connectionStatus = document.querySelector("#connection-status");
const matchModeLabel = document.querySelector("#match-mode");
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
const matchResultPanel = document.querySelector("#match-result");
const matchResultTitle = document.querySelector("#match-result-title");
const matchResultDetails = document.querySelector("#match-result-details");
const restartMatchButton = document.querySelector("#restart-match-button");

let simulation = Simulation.createFieldTest({ enemyAiEnabled: false });
let matchMode = "menu";
let localTeam = "player";
let activeMapId = DEFAULT_MAP_ID;
let activePlayerCount = 2;
let peerSession = null;
let multiplayerConnected = false;
let snapshotSendRemaining = 0;
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
  y: simulation.height / 2,
  zoom: 1,
};
const cameraKeys = new Set();
const cameraPanSpeed = 700;
const minCameraZoom = 0.5;
const maxCameraZoom = 2;

const colors = {
  background: "#4a593d",
  gridFine: "#405037",
  gridStrong: "#667358",
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

const teamPalettes = Object.freeze([
  Object.freeze({ bright: "#7fd4ef", dark: "#24627c" }),
  Object.freeze({ bright: "#e65a64", dark: "#772e38" }),
  Object.freeze({ bright: "#f39a52", dark: "#87461f" }),
  Object.freeze({ bright: "#e5cf58", dark: "#756522" }),
  Object.freeze({ bright: "#b995ef", dark: "#56387e" }),
  Object.freeze({ bright: "#72d49a", dark: "#286843" }),
  Object.freeze({ bright: "#ef7dc4", dark: "#7c3766" }),
  Object.freeze({ bright: "#d8e2e9", dark: "#63717b" }),
]);

function teamPalette(teamId) {
  if (teamId === localTeam) return teamPalettes[0];
  const opponentIndex = simulation.teams
    .filter((team) => team.id !== localTeam)
    .findIndex((team) => team.id === teamId);
  return teamPalettes[Math.max(1, opponentIndex + 1) % teamPalettes.length];
}

for (const map of Object.values(MAP_DEFINITIONS)) {
  const option = document.createElement("option");
  option.value = map.id;
  option.textContent = map.name;
  singlePlayerMap.append(option);
}
singlePlayerMap.value = DEFAULT_MAP_ID;
updateSinglePlayerMapDescription();

const buildButtons = new Map();
for (const tier of [1, 2, 3]) {
  const tierGroup = document.createElement("section");
  tierGroup.className = "build-tier-group";
  const tierToggle = document.createElement("button");
  tierToggle.type = "button";
  tierToggle.className = "build-tier-toggle";
  tierToggle.setAttribute("aria-expanded", "false");
  const tierLabel = document.createElement("span");
  tierLabel.className = "build-tier-label";
  tierLabel.textContent = `Tier ${tier}`;
  const tierChevron = document.createElement("span");
  tierChevron.className = "build-tier-chevron";
  tierChevron.setAttribute("aria-hidden", "true");
  tierChevron.textContent = "›";
  tierToggle.append(tierLabel, tierChevron);
  const tierGrid = document.createElement("div");
  tierGrid.className = "command-grid build-tier-grid";
  tierGrid.id = `build-tier-${tier}-options`;
  tierGrid.hidden = true;
  tierToggle.setAttribute("aria-controls", tierGrid.id);
  tierToggle.addEventListener("click", () => {
    const expanded = tierToggle.getAttribute("aria-expanded") === "true";
    tierToggle.setAttribute("aria-expanded", String(!expanded));
    tierGrid.hidden = expanded;
  });
  tierGroup.append(tierToggle, tierGrid);
  buildCommandGrid.append(tierGroup);

  for (const structureType of BUILD_MENU_BY_TIER[tier]) {
    const definition = STRUCTURE_DEFINITIONS[structureType];
    const button = document.createElement("button");
    button.className = "command-button build-command-button";
    const roleSummary = describeStructureRole(definition);
    button.innerHTML = `${definition.name}<small>${definition.metalCost} metal · T${definition.minimumWorkerTier} worker${roleSummary ? ` · ${roleSummary}` : ""}</small>`;
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
  const roleSummary = definition.roleDescription ? ` · ${definition.roleDescription}` : "";
  const combatSummary = definition.attackRange
    ? ` · ${definition.attackDamage} damage · ${definition.attackRange} range`
    : "";
  button.innerHTML = `${definition.name}<small>${definition.metalCost} metal · ${definition.supplyCost} supply${roleSummary}${combatSummary}</small>`;
  button.addEventListener("click", () => {
    if (selectedStructureId) {
      issueGameCommand({
        type: "production",
        structureId: selectedStructureId,
        unitType,
      });
    }
    updateInterface();
  });
  productionCommandGrid.append(button);
  productionButtons.set(unitType, button);
}

function resetPresentation() {
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

function resetGame() {
  simulation = Simulation.createFieldTest({
    enemyAiEnabled: matchMode === "single_player",
    mapId: activeMapId,
    playerCount: matchMode === "single_player" ? activePlayerCount : 2,
  });
  resetPresentation();
}

function updateSinglePlayerMapDescription() {
  const playerCount = Number(singlePlayerCount.value);
  const map = getMatchMap(playerCount, singlePlayerMap.value);
  singlePlayerMap.disabled = playerCount > 2;
  singlePlayerMapDescription.textContent = playerCount === 2
    ? (MAP_DEFINITIONS[map.id]?.description || map.name)
    : `${map.name} is the dedicated ${playerCount}-player battlefield. All ${playerCount - 1} AI commanders use independent bases, economies, and armies.`;
}

function showSinglePlayerSetup() {
  modeChoices.hidden = true;
  multiplayerSetup.hidden = true;
  singlePlayerSetup.hidden = false;
  singlePlayerCount.value = String(activePlayerCount);
  singlePlayerMap.value = activeMapId;
  updateSinglePlayerMapDescription();
}

function isMultiplayer() {
  return matchMode === "multiplayer_host" || matchMode === "multiplayer_guest";
}

function setConnectionStatus(message, error = false) {
  connectionStatus.textContent = message;
  connectionStatus.classList.toggle("error", error);
}

function showGame() {
  startMenu.hidden = true;
  gameShell.setAttribute("aria-hidden", "false");
  gameShell.removeAttribute("inert");
}

function startSinglePlayer() {
  peerSession?.close();
  peerSession = null;
  multiplayerConnected = false;
  matchMode = "single_player";
  localTeam = "player";
  activeMapId = resolveMatchMapId({
    matchMode: "singleplayer",
    selectedMapId: singlePlayerMap.value,
  });
  activePlayerCount = Number(singlePlayerCount.value);
  resetGame();
  matchModeLabel.textContent = `SINGLE PLAYER · ${activePlayerCount} PLAYERS · ${simulation.mapName.toUpperCase()}`;
  showGame();
}

function startMultiplayerMatch(role) {
  matchMode = role === "host" ? "multiplayer_host" : "multiplayer_guest";
  localTeam = role === "host" ? "player" : "enemy";
  multiplayerConnected = true;
  if (role === "host") {
    activeMapId = resolveMatchMapId({
      matchMode: "multiplayer",
      randomValue: Math.random(),
    });
  }
  simulation = Simulation.createFieldTest({ enemyAiEnabled: false, mapId: activeMapId });
  matchModeLabel.textContent = role === "host"
    ? `MULTIPLAYER HOST · ${simulation.mapName.toUpperCase()} · WESTERN COMMAND`
    : "MULTIPLAYER GUEST · RECEIVING RANDOM MAP · EASTERN COMMAND";
  resetPresentation();
  pauseButton.disabled = true;
  resetButton.textContent = "Leave multiplayer";
  restartMatchButton.textContent = "Return to menu";
  showGame();
  if (role === "host") sendMultiplayerSnapshot();
}

function returnToMenu() {
  peerSession?.close();
  peerSession = null;
  multiplayerConnected = false;
  matchMode = "menu";
  localTeam = "player";
  activePlayerCount = 2;
  simulation = Simulation.createFieldTest({ enemyAiEnabled: false });
  resetPresentation();
  resetButton.textContent = "Reset field test";
  restartMatchButton.textContent = "Restart match";
  multiplayerSetup.hidden = true;
  singlePlayerSetup.hidden = true;
  modeChoices.hidden = false;
  startMenu.hidden = false;
  gameShell.setAttribute("aria-hidden", "true");
  gameShell.setAttribute("inert", "");
  hostOfferCode.value = "";
  guestAnswerCode.value = "";
  joinOfferCode.value = "";
  guestResponseCode.value = "";
  acceptAnswerButton.disabled = true;
  matchModeLabel.textContent = "MATCH SETUP";
  setConnectionStatus("Choose Host or Join to begin.");
}

function multiplayerHandlers(role) {
  return {
    onOpen() {
      if (matchMode === "menu") startMultiplayerMatch(role);
    },
    onMessage(message) {
      if (role === "host" && message.type === "command") {
        applyAuthorizedCommand(message.command, "enemy");
      } else if (role === "guest" && message.type === "state") {
        try {
          simulation = Simulation.fromSnapshot(message.snapshot);
          activeMapId = simulation.mapId;
          matchModeLabel.textContent = `MULTIPLAYER GUEST · ${simulation.mapName.toUpperCase()} · EASTERN COMMAND`;
          pruneSelection();
        } catch {
          setConnectionStatus("The host sent an incompatible match state.", true);
        }
      }
    },
    onClose() {
      if (!multiplayerConnected) return;
      multiplayerConnected = false;
      paused = true;
      statusBanner.hidden = false;
      statusBanner.textContent = "MULTIPLAYER CONNECTION LOST · LEAVE MATCH TO RECONNECT";
    },
  };
}

async function createHostMatch() {
  createHostButton.disabled = true;
  setConnectionStatus("Generating a direct host offer…");
  try {
    peerSession?.close();
    const created = await PeerMultiplayerSession.createHost(multiplayerHandlers("host"));
    peerSession = created.session;
    hostOfferCode.value = created.offerCode;
    acceptAnswerButton.disabled = !guestAnswerCode.value.trim();
    setConnectionStatus("Send the host offer to the guest, then paste their answer.");
  } catch (error) {
    setConnectionStatus(error.message || "Could not create the host connection.", true);
  } finally {
    createHostButton.disabled = false;
  }
}

async function createGuestMatch() {
  createGuestButton.disabled = true;
  setConnectionStatus("Creating a guest answer…");
  try {
    peerSession?.close();
    const created = await PeerMultiplayerSession.createGuest(
      joinOfferCode.value,
      multiplayerHandlers("guest"),
    );
    peerSession = created.session;
    guestResponseCode.value = created.answerCode;
    setConnectionStatus("Send this answer to the host. The match starts when the host connects.");
  } catch (error) {
    setConnectionStatus(error.message || "Could not join that match.", true);
  } finally {
    createGuestButton.disabled = false;
  }
}

async function acceptGuestAnswer() {
  if (!peerSession) return;
  acceptAnswerButton.disabled = true;
  setConnectionStatus("Connecting to the guest…");
  try {
    await peerSession.acceptAnswer(guestAnswerCode.value);
    setConnectionStatus("Answer accepted. Establishing the direct connection…");
  } catch (error) {
    setConnectionStatus(error.message || "Could not accept that guest answer.", true);
    acceptAnswerButton.disabled = false;
  }
}

function ownedUnitIds(ids, team) {
  if (!Array.isArray(ids)) return [];
  return ids.slice(0, 200).filter((id) => {
    const unit = simulation.getUnit(id);
    return unit?.alive && unit.team === team;
  });
}

function ownedStructure(id, team) {
  const structure = simulation.getStructure(id);
  return structure?.alive && structure.team === team ? structure : null;
}

function applyAuthorizedCommand(command, team) {
  if (!command || typeof command.type !== "string") return false;
  switch (command.type) {
    case "move": {
      if (!Array.isArray(command.orders)) return false;
      let moved = false;
      for (const order of command.orders.slice(0, 200)) {
        if (!Number.isFinite(order?.x) || !Number.isFinite(order?.y)) continue;
        const unitIds = ownedUnitIds([order.unitId], team);
        if (unitIds.length === 0) continue;
        moved = simulation.commandMove(unitIds, order.x, order.y, { force: Boolean(command.force) }) || moved;
      }
      return moved;
    }
    case "attack": {
      const target = simulation.getEntity(command.targetId);
      if (!target?.alive || target.team === team) return false;
      return simulation.commandAttack(ownedUnitIds(command.unitIds, team), target.id) > 0;
    }
    case "stop":
      return simulation.commandStop(
        ownedUnitIds(command.unitIds, team),
        Boolean(command.holdPosition),
      ) > 0;
    case "build": {
      const structure = ownedStructure(command.structureId, team);
      if (!structure || structure.complete) return false;
      return simulation.commandBuild(
        ownedUnitIds(command.unitIds, team),
        structure.id,
        { queue: Boolean(command.queue) },
      ) > 0;
    }
    case "construct": {
      if (!STRUCTURE_DEFINITIONS[command.structureType]) return false;
      if (!Number.isFinite(command.x) || !Number.isFinite(command.y)) return false;
      return simulation.startConstruction(
        ownedUnitIds(command.workerIds, team),
        command.structureType,
        command.x,
        command.y,
        { queue: Boolean(command.queue) },
      );
    }
    case "production": {
      const structure = ownedStructure(command.structureId, team);
      if (!structure || !UNIT_DEFINITIONS[command.unitType]) return false;
      return simulation.queueProduction(structure.id, command.unitType);
    }
    case "rally": {
      const structure = ownedStructure(command.structureId, team);
      if (!structure || !Number.isFinite(command.x) || !Number.isFinite(command.y)) return false;
      return simulation.commandRally(structure.id, command.x, command.y);
    }
    case "ability": {
      if (command.abilityId !== "overdrive") return false;
      return simulation.activateAbility(
        ownedUnitIds(command.unitIds, team),
        command.abilityId,
      ) > 0;
    }
    case "cancel_construction": {
      const structure = ownedStructure(command.structureId, team);
      return structure ? simulation.cancelConstruction(structure.id, team) : false;
    }
    case "supply_upgrade": {
      const structure = ownedStructure(command.structureId, team);
      return structure ? simulation.queueSupplyUpgrade(structure.id) : false;
    }
    case "structure_upgrade": {
      const structure = ownedStructure(command.structureId, team);
      return structure ? simulation.upgradeStructure(structure.id, team) : false;
    }
    default:
      return false;
  }
}

function issueGameCommand(command) {
  if (matchMode === "multiplayer_guest") {
    return peerSession?.send({ type: "command", command }) || false;
  }
  return applyAuthorizedCommand(command, localTeam);
}

function sendMultiplayerSnapshot() {
  if (matchMode !== "multiplayer_host" || !multiplayerConnected) return false;
  return peerSession?.send({
    type: "state",
    snapshot: simulation.createSnapshot(),
  }) || false;
}

function describeStructureRole(definition) {
  if (definition.capacitorCapacity) {
    const damagePerSecond = definition.attackDamage / definition.attackCooldown;
    return `${definition.attackDamage} damage · ${definition.attackRange} range · ${damagePerSecond.toFixed(1)} DPS`;
  }
  if (definition.chargeRadius) {
    return `${definition.chargeRate}/s recharge · ${definition.chargeRadius} radius`;
  }
  if (definition.metalRate) return `+${definition.metalRate} metal/s`;
  if (definition.droneCount) {
    return `${definition.droneCount} drones · ${definition.droneReplacementTime}s rebuild`;
  }
  if (definition.factoryBranch) {
    return `T${definition.tier} units · ${Math.round((definition.productionRate || 1) * 100)}% production speed`;
  }
  if (definition.generationRate) {
    return `+${definition.generationRate} energy/s · ${definition.powerRadius} grid reach`;
  }
  if (definition.family === "battery") {
    return `${definition.storageCapacity} storage · ${definition.dischargeRate}/s discharge`;
  }
  if (definition.relayRadius) {
    return `${definition.relayRadius} relay reach · ${definition.storageCapacity} buffer`;
  }
  return "";
}

function frame(now) {
  const elapsed = Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  updateCamera(elapsed);
  if (matchMode !== "menu" && !paused) {
    accumulator += elapsed;
    while (accumulator >= fixedStep) {
      simulation.tick(fixedStep);
      accumulator -= fixedStep;
    }
    if (matchMode === "multiplayer_host") {
      snapshotSendRemaining -= elapsed;
      if (snapshotSendRemaining <= 0) {
        sendMultiplayerSnapshot();
        snapshotSendRemaining = 0.1;
      }
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
  const start = simulation.teamStarts[localTeam];
  camera.x = start?.x ?? (localTeam === "player" ? canvas.width / 2 : simulation.width - canvas.width / 2);
  camera.y = start?.y ?? simulation.height / 2;
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
  camera.x = halfViewWidth >= simulation.width / 2
    ? simulation.width / 2
    : clampValue(camera.x, halfViewWidth, simulation.width - halfViewWidth);
  camera.y = halfViewHeight >= simulation.height / 2
    ? simulation.height / 2
    : clampValue(camera.y, halfViewHeight, simulation.height - halfViewHeight);
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
  context.fillRect(0, 0, simulation.width, simulation.height);

  const groundPatches = [
    { x: 0.12, y: 0.5, radiusX: 0.11, radiusY: 0.26, rotation: 0.1, color: "#66583e" },
    { x: 0.29, y: 0.22, radiusX: 0.15, radiusY: 0.12, rotation: -0.18, color: "#596343" },
    { x: 0.4, y: 0.74, radiusX: 0.18, radiusY: 0.13, rotation: 0.14, color: "#6d5c3d" },
    { x: 0.56, y: 0.33, radiusX: 0.16, radiusY: 0.14, rotation: -0.08, color: "#566443" },
    { x: 0.72, y: 0.77, radiusX: 0.15, radiusY: 0.13, rotation: 0.2, color: "#705f40" },
    { x: 0.88, y: 0.5, radiusX: 0.11, radiusY: 0.26, rotation: -0.1, color: "#65543b" },
  ];
  for (const patch of groundPatches) {
    context.fillStyle = patch.color;
    context.beginPath();
    context.ellipse(
      patch.x * simulation.width,
      patch.y * simulation.height,
      patch.radiusX * simulation.width,
      patch.radiusY * simulation.height,
      patch.rotation,
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  // Small deterministic mottles keep the field organic without shimmering as
  // the camera moves or introducing simulation-side randomness.
  context.fillStyle = "#8a76512b";
  for (let y = 80; y < simulation.height; y += 160) {
    for (let x = 80; x < simulation.width; x += 160) {
      if ((x / 160 + y / 160) % 3 === 0) continue;
      const offsetX = ((x * 7 + y * 3) % 41) - 20;
      const offsetY = ((x * 5 + y * 11) % 37) - 18;
      context.beginPath();
      context.ellipse(x + offsetX, y + offsetY, 18, 8, (x + y) * 0.002, 0, Math.PI * 2);
      context.fill();
    }
  }

  const gridSize = SIMULATION_RULES.buildingGridSize;
  context.lineWidth = placementStructureType ? 1.5 : 1;
  for (let x = 0; x <= simulation.width; x += gridSize) {
    context.strokeStyle = placementStructureType
      ? x % (gridSize * 5) === 0
        ? "#b6c69a"
        : "#81936f"
      : x % (gridSize * 5) === 0
        ? colors.gridStrong
        : colors.gridFine;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, simulation.height);
    context.stroke();
  }
  for (let y = 0; y <= simulation.height; y += gridSize) {
    context.strokeStyle = placementStructureType
      ? y % (gridSize * 5) === 0
        ? "#b6c69a"
        : "#81936f"
      : y % (gridSize * 5) === 0
        ? colors.gridStrong
        : colors.gridFine;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(simulation.width, y);
    context.stroke();
  }

  drawImpassableTerrain();

  context.font = "700 12px ui-monospace, monospace";
  for (const team of simulation.teams) {
    const start = simulation.teamStarts[team.id];
    if (!start) continue;
    context.fillStyle = teamPalette(team.id).bright;
    context.textAlign = "center";
    context.fillText(team.id === localTeam ? "YOUR COMMAND" : team.name.toUpperCase(), start.x, start.y - 300);
  }
  context.textAlign = "start";
}

function drawImpassableTerrain() {
  for (const obstacle of simulation.terrain) {
    const left = obstacle.x - obstacle.width / 2;
    const top = obstacle.y - obstacle.height / 2;
    const isStartingWall = obstacle.terrainType === "starting_wall";
    context.save();
    context.fillStyle = isStartingWall ? "#465451" : "#4b4234";
    context.strokeStyle = isStartingWall ? "#879b92" : "#75654a";
    context.lineWidth = 4;
    context.fillRect(left, top, obstacle.width, obstacle.height);
    context.strokeRect(left, top, obstacle.width, obstacle.height);
    context.beginPath();
    context.rect(left, top, obstacle.width, obstacle.height);
    context.clip();
    context.strokeStyle = isStartingWall ? "#d1ded653" : "#b69d7040";
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
    if (!isStartingWall) {
      drawLabel(obstacle.x, obstacle.y, `${obstacle.name} · Impassable`, true, "#9aa3aa");
    }
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
    localTeam,
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
    localTeam,
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
      if (node.team !== localTeam || !node.connected) continue;
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
  const teamColor = teamPalette(structure.team).bright;
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
  const palette = teamPalette(unit.team);
  const teamColor = palette.bright;
  const darkColor = palette.dark;
  const selected = selectedUnitIds.has(unit.id);
  const lowEnergy = energyRatio(unit) <= SIMULATION_RULES.lowEnergyRatio;
  const overdrive = unit.abilityActiveUntil.overdrive > simulation.time;
  const activeBuildTarget = getActiveConstructionTarget(unit);

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

  drawUnitGroundShadow(definition);
  const pose = getUnitRenderPose(unit, activeBuildTarget);
  context.rotate(pose.facing);
  drawUnitSprite(definition, teamColor, darkColor, unit.state === "stasis", pose);
  context.restore();

  if (activeBuildTarget) {
    drawWorkerConstructionEffect(unit, activeBuildTarget, pose, teamColor);
  }

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

function getActiveConstructionTarget(unit) {
  const definition = UNIT_DEFINITIONS[unit.type];
  const buildTarget = simulation.getStructure(unit.buildTargetId);
  if (
    !definition.workerTier ||
    unit.state !== "active" ||
    !buildTarget?.alive ||
    buildTarget.complete ||
    buildTarget.team !== unit.team
  ) {
    return null;
  }
  const footprint = structureFootprint(buildTarget.type);
  const deltaX = Math.max(Math.abs(unit.x - buildTarget.x) - footprint.halfWidth, 0);
  const deltaY = Math.max(Math.abs(unit.y - buildTarget.y) - footprint.halfHeight, 0);
  return Math.hypot(deltaX, deltaY) <= 24.001 ? buildTarget : null;
}

function getUnitRenderPose(unit, activeBuildTarget = null) {
  const attackTarget = simulation.getEntity(unit.attackTargetId);
  const buildTarget = simulation.getStructure(unit.buildTargetId);
  const transferTarget = unit.energyTransferTargetIds?.length
    ? simulation.getUnit(unit.energyTransferTargetIds[0])
    : null;
  const target = attackTarget?.alive
    ? attackTarget
    : unit.moveTarget || (buildTarget?.alive ? buildTarget : null) || (transferTarget?.alive ? transferTarget : null);
  const start = simulation.teamStarts[unit.team];
  const fallbackFacing = start
    ? Math.atan2(start.inwardY, start.inwardX) + Math.PI / 2
    : unit.team === "player" ? Math.PI / 2 : -Math.PI / 2;
  const facing = target
    ? Math.atan2(target.y - unit.y, target.x - unit.x) + Math.PI / 2
    : fallbackFacing;
  const moving = unit.state === "active" && Boolean(unit.moveTarget);
  const phase = [...unit.id].reduce((total, character) => total + character.charCodeAt(0), 0) * 0.31;
  return {
    facing,
    moving,
    building: Boolean(activeBuildTarget),
    workCycle: Math.sin(simulation.time * 13 + phase),
    phase,
    stride: moving ? Math.sin(simulation.time * 9 + phase) : 0,
  };
}

function drawWorkerConstructionEffect(unit, structure, pose, teamColor) {
  const definition = UNIT_DEFINITIONS[unit.type];
  const footprint = structureFootprint(structure.type);
  const deltaX = structure.x - unit.x;
  const deltaY = structure.y - unit.y;
  const length = Math.hypot(deltaX, deltaY);
  const directionX = length > 0.0001 ? deltaX / length : 0;
  const directionY = length > 0.0001 ? deltaY / length : -1;
  const boundaryDistance = Math.min(
    Math.abs(directionX) > 0.0001 ? footprint.halfWidth / Math.abs(directionX) : Infinity,
    Math.abs(directionY) > 0.0001 ? footprint.halfHeight / Math.abs(directionY) : Infinity,
  );
  const start = {
    x: unit.x + directionX * definition.radius * 0.75,
    y: unit.y + directionY * definition.radius * 0.75,
  };
  const impact = {
    x: structure.x - directionX * boundaryDistance,
    y: structure.y - directionY * boundaryDistance,
  };
  const pulse = 0.5 + Math.sin(simulation.time * 17 + pose.phase) * 0.5;

  context.save();
  const beam = context.createLinearGradient(start.x, start.y, impact.x, impact.y);
  beam.addColorStop(0, `${teamColor}70`);
  beam.addColorStop(0.7, `${colors.energy}b8`);
  beam.addColorStop(1, "#ffe2a8e8");
  context.strokeStyle = beam;
  context.lineWidth = 1.2 + pulse * 1.3;
  context.setLineDash([4, 3]);
  context.lineDashOffset = -simulation.time * 24;
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(impact.x, impact.y);
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = "#fff1c8";
  context.globalAlpha = 0.65 + pulse * 0.35;
  context.beginPath();
  context.arc(impact.x, impact.y, 1.8 + pulse * 1.5, 0, Math.PI * 2);
  context.fill();

  for (let index = 0; index < 4; index += 1) {
    const sparkPhase = (simulation.time * 5.5 + pose.phase + index * 0.23) % 1;
    const sparkAngle = pose.phase + index * 1.83 + sparkPhase * 0.8;
    const sparkDistance = 3 + sparkPhase * 10;
    context.globalAlpha = 1 - sparkPhase;
    context.strokeStyle = index % 2 === 0 ? "#ffe29a" : colors.metal;
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(impact.x, impact.y);
    context.lineTo(
      impact.x + Math.cos(sparkAngle) * sparkDistance,
      impact.y + Math.sin(sparkAngle) * sparkDistance,
    );
    context.stroke();
  }
  context.restore();
}

function drawUnitGroundShadow(definition) {
  const airborne = definition.unitDomain === "air";
  context.save();
  context.translate(airborne ? 7 : 3, airborne ? 10 : 5);
  context.fillStyle = airborne ? "#10151038" : "#10151070";
  context.beginPath();
  context.ellipse(
    0,
    0,
    definition.radius * (airborne ? 1.05 : 0.86),
    definition.radius * (airborne ? 0.58 : 0.62),
    -0.18,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.restore();
}

function unitSurfaceGradient(light, base, dark) {
  const gradient = context.createLinearGradient(-0.8, -0.9, 0.85, 0.95);
  gradient.addColorStop(0, light);
  gradient.addColorStop(0.42, base);
  gradient.addColorStop(1, dark);
  return gradient;
}

function drawUnitSprite(definition, teamColor, darkColor, stasis, pose) {
  if (definition.workerTier) {
    drawWorkerDroneSprite(definition, teamColor, darkColor, stasis, pose);
    return;
  }
  if (definition.unitDomain === "vehicle") {
    drawVehicleSprite(definition, teamColor, darkColor, stasis);
    return;
  }
  if (definition.unitDomain === "air") {
    drawAircraftSprite(definition, teamColor, darkColor, stasis);
    return;
  }
  drawMechSprite(definition, teamColor, darkColor, stasis, pose);
}

function drawWorkerDroneSprite(definition, teamColor, darkColor, stasis, pose) {
  const outline = stasis ? "#2b2924" : "#172027";
  const armor = stasis ? "#5b554b" : "#899395";
  const armorLight = stasis ? "#766e61" : "#cbd1cd";
  const armorDark = stasis ? "#37332d" : "#424d50";
  const joint = stasis ? "#2d2a25" : "#222b30";
  const accent = stasis ? `${teamColor}88` : teamColor;
  const toolSwing = pose.building
    ? pose.workCycle * 0.22
    : pose.moving
      ? pose.stride * 0.1
      : Math.sin(simulation.time * 2.2) * 0.025;
  context.save();
  context.scale(definition.radius, definition.radius);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = outline;
  context.lineWidth = 0.1;

  // Four independently articulated work arms make the drone read as practical
  // construction machinery rather than a flat icon.
  for (const side of [-1, 1]) {
    for (const rear of [-1, 1]) {
      const shoulderX = side * 0.37;
      const shoulderY = rear < 0 ? -0.2 : 0.22;
      const elbowX = side * (rear < 0 ? 0.72 : 0.67);
      const elbowY = rear < 0 ? -0.55 + toolSwing * side : 0.57 - toolSwing * side;
      const tipX = side * (rear < 0 ? 0.98 : 0.88);
      const tipY = rear < 0 ? -0.72 + toolSwing * side : 0.82 - toolSwing * side;
      context.strokeStyle = joint;
      context.lineWidth = 0.2;
      context.beginPath();
      context.moveTo(shoulderX, shoulderY);
      context.lineTo(elbowX, elbowY);
      context.lineTo(tipX, tipY);
      context.stroke();
      context.strokeStyle = armorLight;
      context.lineWidth = 0.065;
      context.beginPath();
      context.moveTo(shoulderX, shoulderY - 0.025);
      context.lineTo(elbowX, elbowY - 0.025);
      context.stroke();
      context.fillStyle = joint;
      for (const jointPoint of [[shoulderX, shoulderY], [elbowX, elbowY]]) {
        context.beginPath();
        context.arc(jointPoint[0], jointPoint[1], 0.11, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = outline;
        context.lineWidth = 0.045;
        context.stroke();
      }
      context.strokeStyle = rear < 0 ? accent : armorLight;
      context.lineWidth = 0.08;
      context.beginPath();
      context.moveTo(tipX, tipY);
      context.lineTo(tipX - side * 0.15, tipY - 0.12);
      context.moveTo(tipX, tipY);
      context.lineTo(tipX - side * 0.02, tipY + 0.15);
      context.stroke();
    }
  }

  context.fillStyle = unitSurfaceGradient(armorLight, armor, armorDark);
  context.strokeStyle = outline;
  context.lineWidth = 0.1;
  context.beginPath();
  context.moveTo(0, -0.64);
  context.lineTo(0.46, -0.38);
  context.lineTo(0.5, 0.35);
  context.lineTo(0.26, 0.58);
  context.lineTo(-0.26, 0.58);
  context.lineTo(-0.5, 0.35);
  context.lineTo(-0.46, -0.38);
  context.closePath();
  context.fill();
  context.stroke();

  // A recessed sensor bar faces forward; the rear grille and access plate show
  // which end houses the motor and battery.
  context.fillStyle = stasis ? "#5d5540" : "#152f39";
  context.fillRect(-0.25, -0.42, 0.5, 0.12);
  context.fillStyle = accent;
  context.fillRect(-0.19, -0.39, 0.38, 0.045);
  context.fillStyle = armorDark;
  context.fillRect(-0.3, 0.24, 0.6, 0.22);
  context.strokeStyle = armorLight;
  context.lineWidth = 0.04;
  for (const ventX of [-0.18, -0.06, 0.06, 0.18]) {
    context.beginPath();
    context.moveTo(ventX, 0.28);
    context.lineTo(ventX, 0.42);
    context.stroke();
  }
  context.strokeStyle = armorDark;
  context.strokeRect(-0.32, -0.14, 0.64, 0.3);
  context.fillStyle = accent;
  context.fillRect(-0.32, 0.05, 0.64, 0.07);
  context.fillStyle = stasis ? colors.stasis : "#f0b957";
  context.beginPath();
  context.arc(0.34, -0.2, 0.055, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawVehicleSprite(definition, teamColor, darkColor, stasis) {
  const outline = stasis ? "#24231f" : "#171d23";
  const armor = stasis ? "#555047" : "#90999a";
  const armorLight = stasis ? "#777066" : "#d1d6d2";
  const armorDark = stasis ? "#35322d" : "#4c575a";
  const accent = stasis ? `${teamColor}88` : teamColor;
  const artillery = definition.role === "artillery";
  const scout = definition.role === "vehicle_scout";
  const tanker = definition.role === "grid_tanker";
  context.save();
  context.scale(definition.radius, definition.radius);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = outline;
  context.lineWidth = 0.1;

  context.fillStyle = stasis ? "#33302b" : "#242d30";
  for (const side of [-1, 1]) {
    if (scout) {
      for (const wheelY of [-0.48, 0.45]) {
        context.beginPath();
        context.ellipse(side * 0.58, wheelY, 0.22, 0.3, 0, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.fillStyle = armorDark;
        context.beginPath();
        context.arc(side * 0.58, wheelY, 0.09, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = stasis ? "#33302b" : "#242d30";
      }
      continue;
    }
    context.beginPath();
    context.roundRect(side * 0.55 - 0.19, -0.74, 0.38, 1.48, 0.15);
    context.fill();
    context.stroke();
    context.fillStyle = armorDark;
    for (const rollerY of [-0.48, -0.16, 0.16, 0.48]) {
      context.beginPath();
      context.arc(side * 0.55, rollerY, 0.105, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = armorLight;
      context.lineWidth = 0.035;
      context.stroke();
    }
    context.strokeStyle = armorLight;
    context.lineWidth = 0.04;
    for (let tread = -0.62; tread <= 0.62; tread += 0.21) {
      context.beginPath();
      context.moveTo(side * 0.72, tread);
      context.lineTo(side * 0.38, tread);
      context.stroke();
    }
    context.strokeStyle = outline;
    context.lineWidth = 0.1;
  }

  context.fillStyle = unitSurfaceGradient(armorLight, armor, armorDark);
  context.beginPath();
  context.moveTo(0, -0.82);
  context.lineTo(0.48, -0.52);
  context.lineTo(0.45, 0.63);
  context.lineTo(0, 0.82);
  context.lineTo(-0.45, 0.63);
  context.lineTo(-0.48, -0.52);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = armorLight;
  context.beginPath();
  context.moveTo(-0.33, -0.48);
  context.lineTo(0, -0.68);
  context.lineTo(0, 0.58);
  context.lineTo(-0.29, 0.48);
  context.closePath();
  context.fill();

  context.strokeStyle = armorDark;
  context.lineWidth = 0.055;
  context.beginPath();
  context.moveTo(-0.31, -0.38);
  context.lineTo(0, -0.56);
  context.lineTo(0.31, -0.38);
  context.moveTo(-0.31, 0.25);
  context.lineTo(0.31, 0.25);
  context.moveTo(-0.2, 0.48);
  context.lineTo(0.2, 0.48);
  context.stroke();
  context.fillStyle = armorDark;
  for (const side of [-1, 1]) {
    context.beginPath();
    context.arc(side * 0.31, -0.4, 0.055, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = accent;
  context.fillRect(-0.32, 0.5, 0.64, 0.11);

  // The rear engine deck carries service grilles, exhausts, and paired marker
  // lights instead of reading as an undifferentiated slab.
  context.fillStyle = armorDark;
  context.fillRect(-0.3, 0.31, 0.6, 0.18);
  context.strokeStyle = armorLight;
  context.lineWidth = 0.035;
  for (const ventX of [-0.2, -0.07, 0.07, 0.2]) {
    context.beginPath();
    context.moveTo(ventX, 0.33);
    context.lineTo(ventX, 0.46);
    context.stroke();
  }
  context.fillStyle = outline;
  for (const side of [-1, 1]) {
    context.beginPath();
    context.arc(side * 0.34, 0.57, 0.055, 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = stasis ? "#746c5d" : "#e7dda5";
  for (const side of [-1, 1]) {
    context.fillRect(side * 0.3 - 0.035, -0.56, 0.07, 0.08);
  }

  if (tanker) {
    context.fillStyle = stasis ? "#403b32" : "#183642";
    context.strokeStyle = accent;
    context.lineWidth = 0.08;
    for (const side of [-1, 1]) {
      context.beginPath();
      context.roundRect(side * 0.25 - 0.18, -0.42, 0.36, 0.76, 0.12);
      context.fill();
      context.stroke();
    }
    context.fillStyle = accent;
    context.fillRect(-0.08, -0.52, 0.16, 0.98);
  } else {
    context.fillStyle = unitSurfaceGradient(armor, armorDark, outline);
    context.beginPath();
    const turretY = artillery ? 0.08 : -0.08;
    const turretHalfWidth = scout ? 0.24 : 0.31;
    context.moveTo(-turretHalfWidth, turretY - 0.25);
    context.lineTo(turretHalfWidth, turretY - 0.25);
    context.lineTo(turretHalfWidth + 0.07, turretY + 0.16);
    context.lineTo(0.16, turretY + 0.29);
    context.lineTo(-0.16, turretY + 0.29);
    context.lineTo(-turretHalfWidth - 0.07, turretY + 0.16);
    context.closePath();
    context.fill();
    context.stroke();

    // A dark breech, armored barrel sleeve, and muzzle brake give the weapon a
    // credible mechanical assembly while the narrow team stripe identifies it.
    context.strokeStyle = outline;
    context.lineWidth = artillery ? 0.19 : 0.16;
    context.beginPath();
    context.moveTo(0, artillery ? -0.02 : -0.18);
    context.lineTo(0, artillery ? -1.25 : scout ? -0.82 : -1.05);
    context.stroke();
    context.strokeStyle = armorLight;
    context.lineWidth = artillery ? 0.105 : 0.085;
    context.beginPath();
    context.moveTo(0, artillery ? -0.1 : -0.22);
    context.lineTo(0, artillery ? -1.14 : scout ? -0.72 : -0.94);
    context.stroke();
    context.fillStyle = outline;
    context.fillRect(artillery ? -0.14 : -0.11, artillery ? -1.28 : scout ? -0.87 : -1.09, artillery ? 0.28 : 0.22, 0.11);
    context.fillStyle = accent;
    context.fillRect(-turretHalfWidth, turretY + 0.12, turretHalfWidth * 2, 0.07);
  }
  if (artillery) {
    context.lineWidth = 0.08;
    context.beginPath();
    context.moveTo(-0.3, 0.35);
    context.lineTo(-0.72, 0.86);
    context.moveTo(0.3, 0.35);
    context.lineTo(0.72, 0.86);
    context.stroke();
  }
  context.restore();
}

function drawAircraftSprite(definition, teamColor, darkColor, stasis) {
  const outline = stasis ? "#24231f" : "#171d23";
  const armor = stasis ? "#59544b" : "#9da7a9";
  const armorLight = stasis ? "#777066" : "#d9ddda";
  const armorDark = stasis ? "#39352f" : "#526064";
  const accent = stasis ? `${teamColor}88` : teamColor;
  const bomber = definition.role === "bomber";
  const gunship = definition.role === "gunship";
  const tender = definition.role === "energy_tender";
  const wingSpan = bomber ? 1.08 : tender ? 1 : gunship ? 0.94 : 0.82;
  context.save();
  context.scale(definition.radius, definition.radius);
  context.lineJoin = "round";
  context.strokeStyle = outline;
  context.lineWidth = 0.09;

  context.fillStyle = unitSurfaceGradient(armorLight, armor, armorDark);
  context.beginPath();
  context.moveTo(0, -1.08);
  context.lineTo(0.2, -0.48);
  context.lineTo(wingSpan, 0.18);
  context.lineTo(0.38, 0.3);
  context.lineTo(0.28, 0.82);
  context.lineTo(0, 0.62);
  context.lineTo(-0.28, 0.82);
  context.lineTo(-0.38, 0.3);
  context.lineTo(-wingSpan, 0.18);
  context.lineTo(-0.2, -0.48);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = armorLight;
  context.beginPath();
  context.moveTo(-0.05, -0.92);
  context.lineTo(0.05, -0.92);
  context.lineTo(0.16, 0.57);
  context.lineTo(0, 0.48);
  context.lineTo(-0.16, 0.57);
  context.closePath();
  context.fill();

  context.strokeStyle = armorDark;
  context.lineWidth = 0.05;
  context.beginPath();
  context.moveTo(-wingSpan * 0.82, 0.15);
  context.lineTo(-0.26, 0.02);
  context.lineTo(-0.15, 0.52);
  context.moveTo(wingSpan * 0.82, 0.15);
  context.lineTo(0.26, 0.02);
  context.lineTo(0.15, 0.52);
  context.moveTo(-0.13, -0.31);
  context.lineTo(0.13, -0.31);
  context.stroke();
  context.fillStyle = armorDark;
  for (const side of [-1, 1]) {
    context.beginPath();
    context.ellipse(side * wingSpan * 0.5, 0.2, 0.12, 0.2, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = outline;
    context.lineWidth = 0.045;
    context.stroke();
    context.fillStyle = outline;
    context.beginPath();
    context.ellipse(side * wingSpan * 0.5, 0.34, 0.075, 0.1, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = armorDark;
  }

  context.fillStyle = stasis ? "#6d6249" : "#183642";
  context.beginPath();
  context.ellipse(0, -0.43, gunship ? 0.2 : 0.14, gunship ? 0.34 : 0.27, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = armorLight;
  context.beginPath();
  context.ellipse(-0.055, -0.52, 0.04, gunship ? 0.2 : 0.15, -0.18, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = accent;
  context.lineWidth = 0.1;
  context.beginPath();
  context.moveTo(-wingSpan * 0.74, 0.13);
  context.lineTo(-wingSpan * 0.3, 0.18);
  context.moveTo(wingSpan * 0.74, 0.13);
  context.lineTo(wingSpan * 0.3, 0.18);
  context.stroke();

  // Conventional navigation lights, trailing control-surface hinges, and
  // under-wing hardpoints make the aircraft feel built rather than symbolic.
  context.fillStyle = stasis ? "#746c5d" : "#d94f4f";
  context.beginPath();
  context.arc(-wingSpan * 0.93, 0.18, 0.055, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = stasis ? "#746c5d" : "#62d77c";
  context.beginPath();
  context.arc(wingSpan * 0.93, 0.18, 0.055, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = armorDark;
  context.lineWidth = 0.035;
  for (const side of [-1, 1]) {
    context.beginPath();
    context.moveTo(side * 0.23, 0.34);
    context.lineTo(side * (wingSpan * 0.72), 0.22);
    context.stroke();
    context.fillStyle = outline;
    context.fillRect(side * wingSpan * 0.64 - 0.045, 0.2, 0.09, 0.17);
  }

  if (gunship) {
    context.fillStyle = armorDark;
    for (const side of [-1, 1]) {
      context.beginPath();
      context.roundRect(side * 0.6 - 0.14, -0.02, 0.28, 0.42, 0.08);
      context.fill();
      context.strokeStyle = outline;
      context.stroke();
      context.strokeStyle = armorLight;
      context.lineWidth = 0.055;
      context.beginPath();
      context.moveTo(side * 0.6, 0.02);
      context.lineTo(side * 0.6, -0.32);
      context.stroke();
    }
  } else if (bomber) {
    context.fillStyle = armorDark;
    context.fillRect(-0.32, 0.25, 0.64, 0.2);
    context.strokeStyle = armorLight;
    context.lineWidth = 0.035;
    context.strokeRect(-0.28, 0.29, 0.56, 0.12);
    context.fillStyle = accent;
    context.fillRect(-0.28, 0.37, 0.56, 0.05);
  } else if (tender) {
    context.fillStyle = stasis ? "#403b32" : "#183642";
    context.strokeStyle = accent;
    context.lineWidth = 0.07;
    for (const side of [-1, 1]) {
      context.beginPath();
      context.roundRect(side * 0.63 - 0.14, -0.02, 0.28, 0.58, 0.1);
      context.fill();
      context.stroke();
      context.strokeStyle = armorLight;
      context.lineWidth = 0.035;
      context.beginPath();
      context.moveTo(side * 0.55, 0.06);
      context.lineTo(side * 0.71, 0.06);
      context.moveTo(side * 0.55, 0.28);
      context.lineTo(side * 0.71, 0.28);
      context.stroke();
    }
  }
  context.restore();
}

function drawMechSprite(definition, teamColor, darkColor, stasis, pose) {
  const role = definition.role || "vanguard";
  const heavy = role === "bulwark";
  const carrier = role === "carrier";
  const raider = role === "raider";
  const outline = stasis ? "#24231f" : "#171d23";
  const armor = stasis ? "#555047" : "#9ba4a5";
  const armorDark = stasis ? "#35322d" : "#4c575c";
  const armorLight = stasis ? "#777066" : "#d5dad6";
  const joint = stasis ? "#292721" : "#20272e";
  const accent = stasis ? `${teamColor}88` : teamColor;
  const glass = stasis ? "#776b4d" : "#183642";
  context.save();
  context.scale(definition.radius, definition.radius);
  context.lineCap = "round";
  context.lineJoin = "bevel";
  context.strokeStyle = outline;
  context.lineWidth = 0.1;

  for (const side of [-1, 1]) {
    context.save();
    context.translate(side * 0.3, 0.28);
    context.rotate(side * pose.stride * 0.09);
    context.translate(-side * 0.3, -0.28);
    // Hip pivots remain partially visible beneath the torso.
    context.fillStyle = joint;
    context.beginPath();
    context.arc(side * 0.3, 0.28, 0.17, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    // Thigh and lower-leg plates narrow as they extend behind the chassis.
    context.fillStyle = armorDark;
    context.beginPath();
    context.moveTo(side * 0.16, 0.25);
    context.lineTo(side * 0.45, 0.24);
    context.lineTo(side * 0.49, 0.59);
    context.lineTo(side * 0.23, 0.64);
    context.closePath();
    context.fill();
    context.stroke();

    context.fillStyle = armor;
    context.beginPath();
    context.moveTo(side * 0.23, 0.59);
    context.lineTo(side * 0.49, 0.55);
    context.lineTo(side * 0.52, 0.91);
    context.lineTo(side * 0.2, 0.96);
    context.closePath();
    context.fill();
    context.stroke();

    context.fillStyle = joint;
    context.beginPath();
    context.arc(side * 0.36, 0.59, 0.11, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    // A bright outer edge reads as the top surface of each trailing foot.
    context.fillStyle = armorDark;
    context.beginPath();
    context.moveTo(side * 0.18, 0.84);
    context.lineTo(side * 0.54, 0.79);
    context.lineTo(side * 0.58, 1.02);
    context.lineTo(side * 0.16, 1.05);
    context.closePath();
    context.fill();
    context.stroke();
    context.strokeStyle = armorLight;
    context.lineWidth = 0.055;
    context.beginPath();
    context.moveTo(side * 0.26, 0.68);
    context.lineTo(side * 0.43, 0.88);
    context.stroke();
    context.strokeStyle = joint;
    context.lineWidth = 0.045;
    context.beginPath();
    context.moveTo(side * 0.2, 0.45);
    context.lineTo(side * 0.47, 0.43);
    context.moveTo(side * 0.21, 0.82);
    context.lineTo(side * 0.51, 0.78);
    context.stroke();
    context.fillStyle = armorLight;
    context.beginPath();
    context.arc(side * 0.33, 0.37, 0.04, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = outline;
    context.lineWidth = 0.1;
    context.restore();
  }

  // The broad shoulder deck, inset cockpit roof, and rear engine plate are all
  // visible from above; no vertical chest or face plane is exposed.
  context.fillStyle = joint;
  context.beginPath();
  context.ellipse(0, 0.08, 0.58, 0.48, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = unitSurfaceGradient(armorLight, armor, armorDark);
  context.beginPath();
  context.moveTo(0, -0.78);
  context.lineTo(0.47, -0.61);
  context.lineTo(0.62, -0.2);
  context.lineTo(0.46, 0.4);
  context.lineTo(0, 0.52);
  context.lineTo(-0.46, 0.4);
  context.lineTo(-0.62, -0.2);
  context.lineTo(-0.47, -0.61);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = armorLight;
  context.beginPath();
  context.moveTo(-0.42, -0.54);
  context.lineTo(0, -0.69);
  context.lineTo(0, 0.39);
  context.lineTo(-0.34, 0.29);
  context.lineTo(-0.5, -0.15);
  context.closePath();
  context.fill();

  // Panel seams, a reinforced center spine, and rear cooling vents remain
  // legible as bright/dark breaks even when the mech is only a few pixels wide.
  context.strokeStyle = armorDark;
  context.lineWidth = 0.055;
  context.beginPath();
  context.moveTo(-0.4, -0.43);
  context.lineTo(-0.13, -0.14);
  context.lineTo(0, 0.28);
  context.lineTo(0.13, -0.14);
  context.lineTo(0.4, -0.43);
  context.moveTo(0, 0.06);
  context.lineTo(0, 0.4);
  context.stroke();

  context.fillStyle = armorDark;
  context.beginPath();
  context.moveTo(-0.4, 0.28);
  context.lineTo(0, 0.42);
  context.lineTo(0.4, 0.28);
  context.lineTo(0.31, 0.5);
  context.lineTo(-0.31, 0.5);
  context.closePath();
  context.fill();
  context.stroke();
  context.strokeStyle = armorLight;
  context.lineWidth = 0.045;
  for (const ventX of [-0.18, 0, 0.18]) {
    context.beginPath();
    context.moveTo(ventX - 0.06, 0.36);
    context.lineTo(ventX + 0.06, 0.4);
    context.stroke();
  }

  // Paired exhaust bells and a bolted dorsal access plate give the torso a
  // credible powertrain and a clear rear side.
  context.fillStyle = outline;
  for (const side of [-1, 1]) {
    context.beginPath();
    context.ellipse(side * 0.26, 0.48, 0.075, 0.11, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = armorLight;
    context.lineWidth = 0.035;
    context.stroke();
  }
  context.strokeStyle = armorDark;
  context.lineWidth = 0.04;
  context.strokeRect(-0.2, 0.09, 0.4, 0.19);
  context.fillStyle = armorLight;
  for (const side of [-1, 1]) {
    context.beginPath();
    context.arc(side * 0.16, 0.13, 0.025, 0, Math.PI * 2);
    context.fill();
  }

  // The cockpit canopy is a narrow roof window that points toward the nose.
  context.fillStyle = glass;
  context.beginPath();
  context.moveTo(0, -0.66);
  context.lineTo(0.25, -0.39);
  context.lineTo(0.2, -0.05);
  context.lineTo(0, 0.08);
  context.lineTo(-0.2, -0.05);
  context.lineTo(-0.25, -0.39);
  context.closePath();
  context.fill();
  context.stroke();
  context.fillStyle = accent;
  context.beginPath();
  context.moveTo(-0.22, -0.43);
  context.lineTo(0, -0.54);
  context.lineTo(0.22, -0.43);
  context.lineTo(0.2, -0.35);
  context.lineTo(0, -0.45);
  context.lineTo(-0.2, -0.35);
  context.closePath();
  context.fill();

  const shoulderWidth = heavy ? 0.42 : carrier ? 0.34 : 0.3;
  for (const side of [-1, 1]) {
    context.fillStyle = unitSurfaceGradient(armor, armorDark, outline);
    context.beginPath();
    context.moveTo(side * 0.44, -0.52);
    context.lineTo(side * (0.48 + shoulderWidth), -0.47);
    context.lineTo(side * (0.55 + shoulderWidth), -0.05);
    context.lineTo(side * 0.55, 0.03);
    context.closePath();
    context.fill();
    context.strokeStyle = outline;
    context.lineWidth = 0.1;
    context.stroke();

    context.fillStyle = accent;
    context.beginPath();
    context.moveTo(side * 0.57, -0.43);
    context.lineTo(side * (0.42 + shoulderWidth), -0.38);
    context.lineTo(side * (0.46 + shoulderWidth), -0.26);
    context.lineTo(side * 0.58, -0.3);
    context.closePath();
    context.fill();
    context.fillStyle = armorLight;
    context.beginPath();
    context.arc(side * (0.54 + shoulderWidth * 0.55), -0.17, 0.045, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = joint;
    context.lineWidth = 0.045;
    context.beginPath();
    context.moveTo(side * 0.58, -0.08);
    context.lineTo(side * (0.49 + shoulderWidth), -0.16);
    context.stroke();
  }

  if (heavy) {
    // From above, the Bulwark's shield covers its left flank while a braced
    // twin-barrel cannon projects forward from the right shoulder.
    context.fillStyle = armor;
    context.beginPath();
    context.moveTo(-1.03, -0.62);
    context.lineTo(-0.73, -0.55);
    context.lineTo(-0.71, 0.34);
    context.lineTo(-0.95, 0.47);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = accent;
    context.fillRect(-0.97, -0.45, 0.07, 0.65);
    context.strokeStyle = armorDark;
    context.lineWidth = 0.05;
    context.strokeRect(-0.94, -0.34, 0.15, 0.58);
    context.fillStyle = armorLight;
    for (const rivetY of [-0.24, 0.14]) {
      context.beginPath();
      context.arc(-0.865, rivetY, 0.035, 0, Math.PI * 2);
      context.fill();
    }
    context.strokeStyle = joint;
    context.lineWidth = 0.11;
    for (const offset of [-0.08, 0.08]) {
      context.beginPath();
      context.moveTo(0.79 + offset, -0.18);
      context.lineTo(0.79 + offset, -1.08);
      context.stroke();
    }
    context.strokeStyle = armorLight;
    context.lineWidth = 0.045;
    context.beginPath();
    context.moveTo(0.68, -0.2);
    context.lineTo(0.9, -0.42);
    context.stroke();
  } else if (carrier) {
    // Carriers replace weapons with paired dorsal capacitor drums and a visible
    // energy core centered on the upper deck.
    context.fillStyle = armorDark;
    for (const side of [-1, 1]) {
      context.beginPath();
      context.ellipse(side * 0.72, 0.12, 0.16, 0.4, 0, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.fillStyle = accent;
      context.fillRect(side * 0.72 - 0.08, -0.03, 0.16, 0.08);
      context.strokeStyle = armorLight;
      context.lineWidth = 0.045;
      context.beginPath();
      context.moveTo(side * 0.62, -0.08);
      context.lineTo(side * 0.82, -0.08);
      context.moveTo(side * 0.62, 0.24);
      context.lineTo(side * 0.82, 0.24);
      context.stroke();
      context.fillStyle = armorDark;
    }
    context.strokeStyle = stasis ? colors.stasis : colors.energy;
    context.lineWidth = 0.1;
    context.beginPath();
    context.arc(0, 0.02, 0.23, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = stasis ? colors.stasis : colors.energy;
    context.beginPath();
    context.arc(0, 0.02, 0.1, 0, Math.PI * 2);
    context.fill();
  } else {
    // Vanguards and raiders carry a compact gun along the right side of the
    // chassis. Its forward barrel makes the overhead facing unmistakable.
    context.fillStyle = armorDark;
    context.beginPath();
    context.moveTo(-0.65, -0.3);
    context.lineTo(-0.86, -0.2);
    context.lineTo(-0.84, 0.32);
    context.lineTo(-0.63, 0.24);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = joint;
    context.beginPath();
    context.arc(-0.72, 0.02, 0.08, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = armor;
    context.beginPath();
    context.moveTo(0.66, 0.22);
    context.lineTo(0.94, 0.16);
    context.lineTo(0.91, -0.62);
    context.lineTo(0.72, -0.64);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = armorDark;
    context.fillRect(0.72, -0.52, 0.2, 0.32);
    context.fillStyle = joint;
    context.beginPath();
    context.arc(0.77, -0.02, 0.11, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = outline;
    context.lineWidth = 0.12;
    context.beginPath();
    context.moveTo(0.82, -0.55);
    context.lineTo(0.82, -1.08);
    context.stroke();
    context.fillStyle = armorLight;
    context.fillRect(0.775, -0.77, 0.09, 0.2);
    context.fillStyle = outline;
    context.fillRect(0.72, -1.13, 0.2, 0.09);
    context.strokeStyle = armorLight;
    context.lineWidth = 0.045;
    context.beginPath();
    context.moveTo(0.74, -0.44);
    context.lineTo(0.88, -0.44);
    context.moveTo(0.74, -0.18);
    context.lineTo(0.88, -0.18);
    context.stroke();
    if (raider) {
      context.fillStyle = armorDark;
      context.beginPath();
      context.moveTo(-0.28, 0.35);
      context.lineTo(-0.58, 0.72);
      context.lineTo(-0.17, 0.5);
      context.closePath();
      context.fill();
      context.stroke();
      context.beginPath();
      context.moveTo(0.28, 0.35);
      context.lineTo(0.58, 0.72);
      context.lineTo(0.17, 0.5);
      context.closePath();
      context.fill();
      context.stroke();
    }
  }

  context.fillStyle = accent;
  const pipCount = Math.max(1, definition.tier || 1);
  for (let pip = 0; pip < pipCount; pip += 1) {
    context.fillRect(-0.2 + pip * 0.16, 0.31, 0.1, 0.08);
  }

  // Sparse edge wear catches the light without turning the sprite into noise.
  context.strokeStyle = stasis ? "#857a68" : "#e1e4df";
  context.lineWidth = 0.025;
  context.beginPath();
  context.moveTo(-0.43, -0.5);
  context.lineTo(-0.23, -0.61);
  context.moveTo(0.31, 0.28);
  context.lineTo(0.41, 0.2);
  context.stroke();
  context.restore();
}

function drawDrone(drone) {
  const yard = simulation.getStructure(drone.yardId);
  let flightTarget = null;
  if (drone.targetWreckId) {
    const wreck = simulation.getWreck(drone.targetWreckId);
    if (wreck) {
      flightTarget = wreck;
      context.strokeStyle = "#c5c0aa28";
      context.setLineDash([4, 7]);
      context.beginPath();
      context.moveTo(drone.x, drone.y);
      context.lineTo(wreck.x, wreck.y);
      context.stroke();
      context.setLineDash([]);
    }
  } else if (yard && drone.mode === "returning") {
    flightTarget = yard;
    context.strokeStyle = "#c5c0aa20";
    context.beginPath();
    context.moveTo(drone.x, drone.y);
    context.lineTo(yard.x, yard.y);
    context.stroke();
  }

  context.save();
  context.translate(drone.x, drone.y);
  context.fillStyle = "#10151045";
  context.beginPath();
  context.ellipse(4, 7, DRONE_DEFINITION.radius * 1.05, DRONE_DEFINITION.radius * 0.62, -0.18, 0, Math.PI * 2);
  context.fill();
  const facing = flightTarget
    ? Math.atan2(flightTarget.y - drone.y, flightTarget.x - drone.x) + Math.PI / 2
    : drone.slot * ((Math.PI * 2) / 3);
  context.rotate(facing);
  context.scale(DRONE_DEFINITION.radius, DRONE_DEFINITION.radius);
  context.lineJoin = "round";
  context.fillStyle = unitSurfaceGradient("#d0d3ce", "#858e8e", "#3e4749");
  context.strokeStyle = "#172027";
  context.lineWidth = 0.1;
  context.beginPath();
  context.moveTo(0, -0.82);
  context.lineTo(0.42, -0.2);
  context.lineTo(0.32, 0.58);
  context.lineTo(0, 0.72);
  context.lineTo(-0.32, 0.58);
  context.lineTo(-0.42, -0.2);
  context.closePath();
  context.fill();
  context.stroke();
  context.fillStyle = "#252e31";
  for (const side of [-1, 1]) {
    context.fillRect(side * 0.52 - 0.26, -0.1, 0.52, 0.14);
    context.beginPath();
    context.arc(side * 0.75, -0.03, 0.25, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#aeb6b2";
    context.lineWidth = 0.035;
    context.beginPath();
    context.moveTo(side * 0.96, -0.03);
    context.lineTo(side * 0.54, -0.03);
    context.moveTo(side * 0.75, -0.24);
    context.lineTo(side * 0.75, 0.18);
    context.stroke();
  }
  context.fillStyle = colors.metal;
  context.fillRect(-0.2, 0.32, 0.4, 0.13);
  context.strokeStyle = "#1b2428";
  context.lineWidth = 0.08;
  context.beginPath();
  context.moveTo(-0.2, 0.52);
  context.lineTo(-0.4, 0.78);
  context.moveTo(0.2, 0.52);
  context.lineTo(0.4, 0.78);
  context.stroke();
  context.fillStyle = colors.energy;
  context.fillRect(-0.18, -0.54, 0.36, 0.07);
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
  const matchEnded = Boolean(simulation.matchResult);
  matchResultPanel.hidden = !matchEnded;
  if (matchEnded) {
    const westernVictory = simulation.matchResult === "victory";
    const victory = localTeam === "player" ? westernVictory : !westernVictory;
    matchResultTitle.textContent = victory ? "You win." : "You lose.";
    matchResultDetails.textContent = victory
      ? "All opposing buildings and units have been destroyed."
      : "All of your buildings and units have been destroyed.";
  }
  pauseButton.disabled = matchEnded || isMultiplayer();

  const localResources = simulation.resources[localTeam];
  metalValue.textContent = Math.floor(localResources.metal).toLocaleString();
  const netEnergyRate = simulation.getNetEnergyRate(localTeam);
  const netEnergyText = netEnergyRate.toLocaleString(undefined, { maximumFractionDigits: 1 });
  energyValue.textContent = `${netEnergyRate >= 0 ? "+" : ""}${netEnergyText}/s · ${Math.floor(localResources.energy)}/${localResources.energyCapacity}`;
  const playerSupply = simulation.getSupplyState(localTeam);
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
    const relayText = definition.relayRadius
      ? ` · ${definition.relayRadius} relay range · ${definition.chargeRate}/s buffer charge · ${definition.dischargeRate}/s discharge`
      : "";
    const defenseText = definition.capacitorCapacity
      ? ` · ${definition.attackDamage} damage · ${definition.attackRange} range · ${(definition.attackDamage / definition.attackCooldown).toFixed(1)} DPS · ${Math.floor(selectedStructure.weaponEnergy)}/${definition.capacitorCapacity} capacitor · ${selectedStructure.defenseStatus.toUpperCase()}`
      : "";
    const chargerText = definition.chargeRadius
      ? ` · ${definition.chargeRate}/s unit recharge · ${definition.chargeRadius} field radius`
      : "";
    const mineText = definition.metalRate ? ` · +${definition.metalRate} metal/s` : "";
    const salvageText = definition.droneCount
      ? ` · ${definition.droneCount} reclamation drones · ${definition.droneReplacementTime}s rebuild`
      : "";
    const factoryText = definition.factoryBranch
      ? ` · ${Math.round((definition.productionRate || 1) * 100)}% production speed`
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
    selectionDetails.textContent = `${Math.ceil(selectedStructure.hp)}/${definition.maxHp} integrity · ${status}${storageText}${generatorText}${relayText}${chargerText}${mineText}${demandText}${defenseText}${salvageText}${factoryText}${supplyComplexText}${builderText}${queueText}${rallyText}`;
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
    const buildQueueText = unit.buildQueue?.length
      ? ` · ${unit.buildQueue.length} BUILD${unit.buildQueue.length === 1 ? "" : "S"} QUEUED`
      : "";
    const supplyText = definition.transferRate
      ? unit.energyTransferTargetIds?.length
        ? ` · SUPPLYING ${unit.energyTransferTargetIds.length} UNIT${unit.energyTransferTargetIds.length === 1 ? "" : "S"}`
        : ` · NO UNIT IN ${definition.transferRange} RANGE`
      : "";
    const roleText = definition.roleDescription ? ` · ${definition.roleDescription}` : "";
    const combatText = definition.attackRange
      ? ` · ${definition.attackDamage} damage · ${definition.attackRange} range · ${definition.speed} speed`
      : "";
    selectionName.textContent = definition.name;
    selectionDetails.textContent = `${Math.ceil(unit.hp)}/${definition.maxHp} integrity · ${Math.ceil(unit.energy)}/${definition.maxEnergy} energy · ${unit.state.toUpperCase()}${roleText}${combatText}${emergencyRecoveryText}${supplyText}${orderText}${buildQueueText}`;
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
  unitCommands.hidden = matchEnded || selectedUnits.length === 0;

  const selectedWorkers = selectedUnits.filter((unit) => UNIT_DEFINITIONS[unit.type].workerTier);
  buildCommands.hidden = matchEnded || selectedWorkers.length === 0;
  const selectedWorkerTier = selectedWorkers.reduce(
    (highest, unit) => Math.max(highest, UNIT_DEFINITIONS[unit.type].workerTier),
    0,
  );
  for (const [structureType, button] of buildButtons) {
    const definition = STRUCTURE_DEFINITIONS[structureType];
    const workerCanBuild = canWorkerTierBuildStructure(selectedWorkerTier, structureType);
    const canAfford = localResources.metal >= definition.metalCost;
    const canBuild = workerCanBuild && canAfford;
    button.disabled = !canBuild;
    button.classList.toggle("available", canBuild);
    button.classList.toggle("locked", !workerCanBuild);
    button.classList.toggle("unaffordable", workerCanBuild && !canAfford);
    button.title = !workerCanBuild
      ? `Requires a Tier ${definition.minimumWorkerTier} Worker Drone`
      : !canAfford
        ? `Requires ${definition.metalCost.toLocaleString()} metal`
        : `Build ${definition.name}`;
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
  productionCommands.hidden = matchEnded || availableProduction.length === 0;
  for (const [unitType, button] of productionButtons) {
    const available = availableProduction.includes(unitType);
    const unitDefinition = UNIT_DEFINITIONS[unitType];
    button.hidden = !available;
    button.disabled =
      !selectedStructure?.powered ||
      localResources.metal < unitDefinition.metalCost ||
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
      supplyUpgradeButton.disabled = localResources.metal < upgrade.metalCost;
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
    const roleSummary = describeStructureRole(targetDefinition);
    buildingUpgradeDetails.textContent = buildingUpgrade.valid
      ? `${buildingUpgrade.metalCost.toLocaleString()} metal · immediate${roleSummary ? ` · ${roleSummary}` : ""}`
      : buildingUpgrade.reason;
    buildingUpgradeButton.disabled = !buildingUpgrade.valid;
  }
  structureCommands.hidden =
    matchEnded || (!canCancelConstruction && !canShowSupplyUpgrade && !canShowBuildingUpgrade);

  const lowEnergyUnits = simulation.units.filter(
    (unit) => unit.alive && unit.team === localTeam && energyRatio(unit) <= SIMULATION_RULES.lowEnergyRatio,
  );
  const stasisUnits = lowEnergyUnits.filter((unit) => unit.state === "stasis");
  const disconnectedStructures = simulation.structures.filter(
    (structure) =>
      structure.alive &&
      structure.complete &&
      structure.team === localTeam &&
      !STRUCTURE_DEFINITIONS[structure.type].generationRate &&
      !structure.connected,
  );
  if (forceMoveArmed) {
    statusBanner.hidden = false;
    statusBanner.textContent = "FORCE MOVE ARMED · RIGHT-CLICK DESTINATION · ESC TO CANCEL";
  } else if (placementStructureType) {
    statusBanner.hidden = false;
    statusBanner.textContent = placementMessage || `PLACE ${STRUCTURE_DEFINITIONS[placementStructureType].name.toUpperCase()} · HOLD SHIFT TO QUEUE · RIGHT-CLICK TO CANCEL`;
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
      return unit?.alive && unit.team === localTeam;
    }),
  );
  const structure = simulation.getStructure(selectedStructureId);
  if (!structure?.alive || structure.team !== localTeam) selectedStructureId = null;
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
      localTeam,
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
    ...simulation.units.filter((entity) => entity.alive && entity.team !== localTeam),
    ...simulation.structures.filter((entity) => entity.alive && entity.team !== localTeam),
    ...simulation.getDrones().filter((entity) => entity.alive && entity.team !== localTeam),
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
  if (simulation.matchResult || event.button !== 0) return;
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

function placeConstruction(point, queue = false) {
  if (!placementStructureType) return false;
  const workers = [...selectedUnitIds].filter((id) => {
    const unit = simulation.getUnit(id);
    return unit && UNIT_DEFINITIONS[unit.type].workerTier;
  });
  const placement = simulation.evaluatePlacement(
    placementStructureType,
    point.x,
    point.y,
    localTeam,
  );
  if (!placement.valid) {
    placementMessage = placement.reason.toUpperCase();
    updateInterface();
    return false;
  }
  const accepted = issueGameCommand({
    type: "construct",
    workerIds: workers,
    structureType: placementStructureType,
    x: placement.x,
    y: placement.y,
    queue,
  });
  if (accepted) {
    placementMessage = null;
    if (!queue) {
      placementStructureType = null;
      placementCursor = null;
    }
  } else {
    placementMessage = (simulation.lastPlacementError || "Invalid construction location.").toUpperCase();
  }
  updateInterface();
  return Boolean(accepted);
}

canvas.addEventListener("mouseup", (event) => {
  if (event.button !== 0 || !selectionDrag) return;
  const drag = selectionDrag;
  selectionDrag = null;

  if (placementStructureType) {
    placeConstruction(drag.current, drag.shift);
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
        unit.team === localTeam &&
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
    const unit = findUnitAt(drag.current, localTeam);
    const structure = unit ? null : findStructureAt(drag.current, localTeam);
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

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  if (simulation.matchResult) return;
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
    selectedStructure?.team === localTeam &&
    STRUCTURE_DEFINITIONS[selectedStructure.type].production &&
    issueGameCommand({
      type: "rally",
      structureId: selectedStructure.id,
      x: point.x,
      y: point.y,
    })
  ) {
    updateInterface();
    return;
  }
  if (selectedUnitIds.size === 0) return;
  const forceMove = forceMoveArmed;
  if (!forceMove) {
    const friendlyStructure = findStructureAt(point, localTeam);
    if (
      friendlyStructure &&
      !friendlyStructure.complete &&
      issueGameCommand({
        type: "build",
        unitIds: [...selectedUnitIds],
        structureId: friendlyStructure.id,
        queue: false,
      })
    ) {
      updateInterface();
      return;
    }
    const enemy = findEnemyAt(point);
    if (enemy) {
      issueGameCommand({
        type: "attack",
        unitIds: [...selectedUnitIds],
        targetId: enemy.id,
      });
      return;
    }
  }

  const selected = [...selectedUnitIds];
  const columns = Math.ceil(Math.sqrt(selected.length));
  const orders = selected.map((id, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const offsetX = (column - (columns - 1) / 2) * 44;
    const offsetY = (row - (Math.ceil(selected.length / columns) - 1) / 2) * 44;
    return { unitId: id, x: point.x + offsetX, y: point.y + offsetY };
  });
  issueGameCommand({ type: "move", orders, force: forceMove });
  forceMoveArmed = false;
  updateInterface();
});

function activateOverdrive() {
  issueGameCommand({
    type: "ability",
    unitIds: [...selectedUnitIds],
    abilityId: "overdrive",
  });
  updateInterface();
}

function cancelSelectedConstruction() {
  if (!selectedStructureId) return false;
  const result = issueGameCommand({
    type: "cancel_construction",
    structureId: selectedStructureId,
  });
  if (!result) return false;
  selectedStructureId = null;
  updateInterface();
  return true;
}

overdriveButton.addEventListener("click", activateOverdrive);
cancelConstructionButton.addEventListener("click", cancelSelectedConstruction);
supplyUpgradeButton.addEventListener("click", () => {
  if (selectedStructureId) {
    issueGameCommand({ type: "supply_upgrade", structureId: selectedStructureId });
  }
  updateInterface();
});
buildingUpgradeButton.addEventListener("click", () => {
  if (selectedStructureId) {
    issueGameCommand({ type: "structure_upgrade", structureId: selectedStructureId });
  }
  updateInterface();
});
stopButton.addEventListener("click", () => issueGameCommand({
  type: "stop",
  unitIds: [...selectedUnitIds],
  holdPosition: false,
}));
holdButton.addEventListener("click", () => issueGameCommand({
  type: "stop",
  unitIds: [...selectedUnitIds],
  holdPosition: true,
}));
pauseButton.addEventListener("click", () => {
  if (isMultiplayer()) return;
  paused = !paused;
  pauseButton.textContent = paused ? "Resume simulation" : "Pause simulation";
});
resetButton.addEventListener("click", () => {
  if (isMultiplayer()) returnToMenu();
  else resetGame();
});
restartMatchButton.addEventListener("click", () => {
  if (isMultiplayer()) returnToMenu();
  else resetGame();
});

singlePlayerButton.addEventListener("click", showSinglePlayerSetup);
singlePlayerCount.addEventListener("change", updateSinglePlayerMapDescription);
singlePlayerMap.addEventListener("change", updateSinglePlayerMapDescription);
startSinglePlayerButton.addEventListener("click", startSinglePlayer);
backFromSinglePlayerButton.addEventListener("click", () => {
  singlePlayerSetup.hidden = true;
  modeChoices.hidden = false;
});
multiplayerButton.addEventListener("click", () => {
  modeChoices.hidden = true;
  singlePlayerSetup.hidden = true;
  multiplayerSetup.hidden = false;
  setConnectionStatus("Choose Host or Join to begin.");
});
backToModesButton.addEventListener("click", returnToMenu);
createHostButton.addEventListener("click", createHostMatch);
createGuestButton.addEventListener("click", createGuestMatch);
acceptAnswerButton.addEventListener("click", acceptGuestAnswer);
guestAnswerCode.addEventListener("input", () => {
  acceptAnswerButton.disabled = !peerSession || !guestAnswerCode.value.trim();
});

window.addEventListener("keydown", (event) => {
  if (matchMode === "menu") return;
  const key = event.key.toLowerCase();
  if (simulation.matchResult) return;
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
  get mode() {
    return matchMode;
  },
  get localTeam() {
    return localTeam;
  },
  reset: resetGame,
};

gameShell.setAttribute("inert", "");
updateInterface();
requestAnimationFrame(frame);
