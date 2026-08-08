const moduleVersion = new URL(import.meta.url).searchParams.get("v");
const versionSuffix = moduleVersion ? `?v=${encodeURIComponent(moduleVersion)}` : "";

const {
  BUILD_MENU_BY_TIER,
  canWorkerTierBuildStructure,
  DEFAULT_MAP_ID,
  DRONE_DEFINITION,
  SIMULATION_RULES,
  STRUCTURE_DEFINITIONS,
  UNIT_DEFINITIONS,
  powerCoverageBounds,
  projectileKinetics,
  structureFootprint,
} = await import(`./data.js${versionSuffix}`);
const { getMapsForPlayerCount, getMatchMap, getRandomMatchMap } = await import(
  `./maps.js${versionSuffix}`
);
const { energyRatio, Simulation } = await import(`./simulation.js${versionSuffix}`);
const { FixedStepSimulationClock } = await import(`./simulation-clock.js${versionSuffix}`);
const {
  createMultiplayerMotionUpdate,
  multiplayerMotionUpdateIsValid,
  MULTIPLAYER_MOTION_INTERVAL_SECONDS,
  MULTIPLAYER_STATE_INTERVAL_SECONDS,
  SnapshotPositionSmoother,
} = await import(`./network-presentation.js${versionSuffix}`);
const {
  createDeterministicStateMessage,
  deterministicStateMessageIsValid,
  DeterministicCommandScheduler,
  SIMULATION_STEP_SECONDS,
} = await import(`./determinism.js${versionSuffix}`);
const { describeConstructionQueue, describeProductionQueue } = await import(
  `./queue-status.js${versionSuffix}`
);
const {
  calculateMinimapLayout,
  minimapContains,
  minimapPoint,
  minimapViewport,
  minimapWorldPoint,
} = await import(`./minimap.js${versionSuffix}`);
const {
  isValidLobbyCode,
  MatchStartHandshake,
  normalizeLobbyCode,
  PeerMultiplayerSession,
} = await import(`./multiplayer.js${versionSuffix}`);
const {
  strategicIconWorldSize,
  strategicViewActive,
  strategicZoomMinimum,
} = await import(`./strategic-view.js${versionSuffix}`);

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
const unitTesterButton = document.querySelector("#unit-tester-button");
const unitTesterSetup = document.querySelector("#unit-tester-setup");
const unitTesterCount = document.querySelector("#unit-tester-count");
const unitTesterMap = document.querySelector("#unit-tester-map");
const unitTesterMapDescription = document.querySelector("#unit-tester-map-description");
const startUnitTesterButton = document.querySelector("#start-unit-tester-button");
const backFromUnitTesterButton = document.querySelector("#back-from-unit-tester-button");
const multiplayerButton = document.querySelector("#multiplayer-button");
const multiplayerSetup = document.querySelector("#multiplayer-setup");
const createHostButton = document.querySelector("#create-host-button");
const joinLobbyButton = document.querySelector("#join-lobby-button");
const copyLobbyCodeButton = document.querySelector("#copy-lobby-code-button");
const backToModesButton = document.querySelector("#back-to-modes-button");
const hostLobbyCode = document.querySelector("#host-lobby-code");
const joinLobbyCode = document.querySelector("#join-lobby-code");
const connectionStatus = document.querySelector("#connection-status");
const lobbyPanel = document.querySelector("#lobby-panel");
const visibleLobbyCode = document.querySelector("#visible-lobby-code");
const lobbyPlayerCount = document.querySelector("#lobby-player-count");
const lobbyPlayerList = document.querySelector("#lobby-player-list");
const lobbyHostControls = document.querySelector("#lobby-host-controls");
const addAiButton = document.querySelector("#add-ai-button");
const removeAiButton = document.querySelector("#remove-ai-button");
const lobbyMap = document.querySelector("#lobby-map");
const lobbyMapSummary = document.querySelector("#lobby-map-summary");
const startLobbyMatchButton = document.querySelector("#start-lobby-match-button");
const matchModeLabel = document.querySelector("#match-mode");
const crystalValue = document.querySelector("#crystal-value");
const energyValue = document.querySelector("#energy-value");
const supplyValue = document.querySelector("#supply-value");
const selectionName = document.querySelector("#selection-name");
const selectionDetails = document.querySelector("#selection-details");
const selectionQueue = document.querySelector("#selection-queue");
const overdriveButton = document.querySelector("#overdrive-button");
const stopButton = document.querySelector("#stop-button");
const holdButton = document.querySelector("#hold-button");
const transportCommands = document.querySelector("#transport-commands");
const transportLoadButton = document.querySelector("#transport-load-button");
const transportFillButton = document.querySelector("#transport-fill-button");
const transportDropButton = document.querySelector("#transport-drop-button");
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
const testerSpawnCommands = document.querySelector("#tester-spawn-commands");
const testerSpawnTeam = document.querySelector("#tester-spawn-team");
const testerSpawnStructure = document.querySelector("#tester-spawn-structure");
const testerSpawnUnit = document.querySelector("#tester-spawn-unit");
const testerPlaceStructureButton = document.querySelector("#tester-place-structure-button");
const testerPlaceUnitButton = document.querySelector("#tester-place-unit-button");
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
let lobbyRole = null;
let multiplayerLobby = null;
let matchStartHandshake = null;
let snapshotSendRemaining = 0;
let motionSendRemaining = 0;
let nextGuestCommandId = 1;
let lastProcessedGuestCommandId = 0;
let lastQueuedGuestCommandId = 0;
let nextLocalCommandSequence = 1;
let nextHostStateSequence = 1;
let lastHostStateSequence = 0;
let lastHostStateReceivedAt = 0;
let pendingGuestCommands = new Map();
let multiplayerSyncMessage = null;
const authoritativeCommands = new DeterministicCommandScheduler();
let selectedUnitIds = new Set();
let selectedStructureId = null;
let selectedStructureIds = new Set();
let selectionQueueSignature = null;
let selectionDrag = null;
let placementStructureType = null;
let testerSpawnPlacement = null;
let placementMessage = null;
let placementCursor = null;
let pointerScreen = null;
let forceMoveArmed = false;
let paused = false;
const fixedStep = SIMULATION_STEP_SECONDS;
const authoritativeSimulationClock = new FixedStepSimulationClock({
  stepSeconds: fixedStep,
  maximumElapsedSeconds: 1,
});
let lastFrameTime = performance.now();
authoritativeSimulationClock.reset(lastFrameTime);
const interfaceRefreshInterval = 0.1;
let interfaceRefreshRemaining = 0;
const camera = {
  x: canvas.width / 2,
  y: simulation.height / 2,
  zoom: 1,
};
let renderViewBounds = null;
let renderTeamPalettes = new Map();
let renderTimestamp = performance.now();
const guestPositionSmoother = new SnapshotPositionSmoother();
const cameraKeys = new Set();
const cameraPanSpeed = 700;
const maxCameraZoom = 2;

const colors = {
  player: "#7fd4ef",
  playerDark: "#24627c",
  enemy: "#e65a64",
  enemyDark: "#772e38",
  energy: "#52d1ff",
  crystal: "#ef4058",
  health: "#6fe28d",
  shield: "#65d8ff",
  stasis: "#e4b44c",
  selection: "#f6ee8d",
  disconnected: "#ff6675",
};

const battlefieldThemePalettes = Object.freeze({
  apocalypse: Object.freeze({
    background: "#503537",
    minimapGround: "#482f32",
    groundPatches: Object.freeze([
      Object.freeze({ x: 0.12, y: 0.5, radiusX: 0.11, radiusY: 0.26, rotation: 0.1, color: "#6b423d" }),
      Object.freeze({ x: 0.29, y: 0.22, radiusX: 0.15, radiusY: 0.12, rotation: -0.18, color: "#59383b" }),
      Object.freeze({ x: 0.4, y: 0.74, radiusX: 0.18, radiusY: 0.13, rotation: 0.14, color: "#733f42" }),
      Object.freeze({ x: 0.56, y: 0.33, radiusX: 0.16, radiusY: 0.14, rotation: -0.08, color: "#5f383d" }),
      Object.freeze({ x: 0.72, y: 0.77, radiusX: 0.15, radiusY: 0.13, rotation: 0.2, color: "#704044" }),
      Object.freeze({ x: 0.88, y: 0.5, radiusX: 0.11, radiusY: 0.26, rotation: -0.1, color: "#63383b" }),
    ]),
    mottle: "#a4545728",
    gridFine: "#493033",
    gridStrong: "#70474b",
    placementGridFine: "#9a6b70",
    placementGridStrong: "#d2a1a5",
    cliff: Object.freeze({
      top: "#5a3c41", topLight: "#795058", face: "#38272b", edge: "#9d626d",
      highlight: "#efadb84d", detail: "#241a1dcc", accent: "#b85868", minimap: "#674047",
    }),
    fracture: Object.freeze({
      top: "#482a31", topLight: "#6c3944", face: "#2d1c22", edge: "#b74d60",
      highlight: "#ff82924f", detail: "#211419dd", accent: "#ef5b72", minimap: "#763d48",
    }),
    ruins: Object.freeze({
      top: "#5a484a", topLight: "#806467", face: "#382e30", edge: "#aa8588",
      highlight: "#e3c2c354", detail: "#292526bb", accent: "#8f6e71", minimap: "#70565a",
    }),
  }),
  grassland: Object.freeze({
    background: "#526a43",
    minimapGround: "#4b603b",
    groundPatches: Object.freeze([
      Object.freeze({ x: 0.12, y: 0.48, radiusX: 0.13, radiusY: 0.27, rotation: 0.08, color: "#61794c" }),
      Object.freeze({ x: 0.28, y: 0.2, radiusX: 0.17, radiusY: 0.13, rotation: -0.16, color: "#465c3b" }),
      Object.freeze({ x: 0.4, y: 0.76, radiusX: 0.2, radiusY: 0.14, rotation: 0.12, color: "#698050" }),
      Object.freeze({ x: 0.58, y: 0.34, radiusX: 0.18, radiusY: 0.15, rotation: -0.1, color: "#5c7447" }),
      Object.freeze({ x: 0.73, y: 0.78, radiusX: 0.17, radiusY: 0.14, rotation: 0.18, color: "#48603c" }),
      Object.freeze({ x: 0.88, y: 0.5, radiusX: 0.12, radiusY: 0.28, rotation: -0.08, color: "#647b4b" }),
    ]),
    mottle: "#9bb77a26",
    gridFine: "#45583b",
    gridStrong: "#71845a",
    placementGridFine: "#99ae78",
    placementGridStrong: "#d5e6b4",
    cliff: Object.freeze({
      top: "#5c6152", topLight: "#7f8670", face: "#3d4338", edge: "#929b82",
      highlight: "#dce6c45c", detail: "#293027c4", accent: "#779458", minimap: "#626957",
    }),
    fracture: Object.freeze({
      top: "#555a4e", topLight: "#777e69", face: "#373d34", edge: "#8e9780",
      highlight: "#d8e1c357", detail: "#282e27cc", accent: "#829b63", minimap: "#5c6353",
    }),
    ruins: Object.freeze({
      top: "#65675c", topLight: "#898c7c", face: "#41443d", edge: "#9ea290",
      highlight: "#e5e8d35c", detail: "#30342fbd", accent: "#718b55", minimap: "#6b6e60",
    }),
  }),
});

function battlefieldThemePalette() {
  return battlefieldThemePalettes[simulation.mapTheme] || battlefieldThemePalettes.apocalypse;
}

function terrainVisualPalette(obstacle, theme = battlefieldThemePalette()) {
  if (obstacle.terrainType === "starting_wall") {
    return {
      top: "#52615d", topLight: "#7f9189", face: "#323d3a", edge: "#9cad9f",
      highlight: "#dce9df66", detail: "#26302dcc", accent: "#7f998b", minimap: "#718078",
    };
  }
  if (obstacle.terrainType === "ruins") return theme.ruins;
  if (obstacle.terrainType === "fracture") return theme.fracture;
  return theme.cliff;
}

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
  const cached = renderTeamPalettes.get(teamId);
  if (cached) return cached;
  if (teamId === localTeam) return teamPalettes[0];
  const opponentIndex = simulation.teams
    .filter((team) => team.id !== localTeam)
    .findIndex((team) => team.id === teamId);
  return teamPalettes[Math.max(1, opponentIndex + 1) % teamPalettes.length];
}

function populateMapSelect(select, playerCount, selectedMapId = null) {
  const maps = getMapsForPlayerCount(playerCount);
  const selectedMap = maps.find((map) => map.id === selectedMapId) || maps[0];
  select.replaceChildren(...maps.map((map) => {
    const option = document.createElement("option");
    option.value = map.id;
    option.textContent = `${map.name} · ${map.theme === "grassland" ? "Green Grassland" : "Red Wasteland"}`;
    return option;
  }));
  select.value = selectedMap.id;
  return selectedMap;
}
populateMapSelect(singlePlayerMap, 2, DEFAULT_MAP_ID);
updateSinglePlayerMapDescription();
populateMapSelect(unitTesterMap, 2, DEFAULT_MAP_ID);
updateUnitTesterMapDescription();

for (const [tier, definitions] of Object.entries(
  Object.entries(STRUCTURE_DEFINITIONS).reduce((groups, entry) => {
    if (entry[1].testerSpawnable === false) return groups;
    const buildTier = entry[1].buildTier || entry[1].tier || 1;
    (groups[buildTier] ||= []).push(entry);
    return groups;
  }, {}),
)) {
  const group = document.createElement("optgroup");
  group.label = `Tier ${tier} buildings`;
  for (const [structureType, definition] of definitions.sort((left, right) =>
    left[1].name.localeCompare(right[1].name)
  )) {
    const option = document.createElement("option");
    option.value = structureType;
    option.textContent = definition.name;
    group.append(option);
  }
  testerSpawnStructure.append(group);
}

for (const [groupName, definitions] of Object.entries(
  Object.entries(UNIT_DEFINITIONS).reduce((groups, entry) => {
    const definition = entry[1];
    const domain = definition.unitDomain || (definition.workerTier ? "mech" : "other");
    const label = `${domain} · Tier ${definition.tier || 1}`;
    (groups[label] ||= []).push(entry);
    return groups;
  }, {}),
).sort(([left], [right]) => left.localeCompare(right))) {
  const group = document.createElement("optgroup");
  group.label = groupName.replace(/^./, (letter) => letter.toUpperCase());
  for (const [unitType, definition] of definitions.sort((left, right) =>
    left[1].name.localeCompare(right[1].name)
  )) {
    const option = document.createElement("option");
    option.value = unitType;
    option.textContent = definition.name;
    group.append(option);
  }
  testerSpawnUnit.append(group);
}

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
    button.innerHTML = `${definition.name}<small>${definition.metalCost} crystal · T${definition.minimumWorkerTier} worker${roleSummary ? ` · ${roleSummary}` : ""}</small>`;
    button.addEventListener("click", () => {
      testerSpawnPlacement = null;
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
  const combatSummary = definition.underbellyBeamRadius
    ? ` · ${definition.underbellyBeamDamagePerSecond}/s underbelly beam · ${definition.underbellyBeamRadius} radius${definition.automaticTargetAcquisitionRange ? ` · seeks ground targets within ${definition.automaticTargetAcquisitionRange}` : ""}`
    : definition.attackRange
      ? ` · ${definition.attackDamage} damage · ${definition.attackRange} range${definition.airDamageMultiplier ? ` · ${definition.airDamageMultiplier}× vs air` : ""}`
      : "";
  button.innerHTML = `${definition.name}<small>${definition.metalCost} crystal · ${definition.supplyCost} supply${roleSummary}${combatSummary}</small>`;
  button.addEventListener("click", () => {
    const selectedFactories = getSelectedStructures();
    if (selectedFactories.length > 0) {
      issueGameCommand({
        type: "production",
        structureIds: selectedFactories.map((factory) => factory.id),
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
  selectedStructureIds = new Set();
  selectionQueueSignature = null;
  selectionDrag = null;
  placementStructureType = null;
  testerSpawnPlacement = null;
  placementMessage = null;
  placementCursor = null;
  pointerScreen = null;
  forceMoveArmed = false;
  refreshTesterSpawnTeams();
  cameraKeys.clear();
  resetCamera();
  paused = false;
  pauseButton.textContent = "Pause simulation";
  authoritativeSimulationClock.reset(performance.now());
  guestPositionSmoother.reset(
    mobileSimulationEntities(),
    performance.now(),
    simulation.tickNumber,
  );
  interfaceRefreshRemaining = 0;
  updateInterface();
}

function getSelectedStructures() {
  return [...selectedStructureIds]
    .map((id) => simulation.getStructure(id))
    .filter((structure) => structure?.alive && structure.team === localTeam);
}

function selectStructures(structures) {
  selectedStructureIds = new Set(structures.map((structure) => structure.id));
  selectedStructureId = structures[0]?.id || null;
}

function refreshTesterSpawnTeams() {
  const previousTeam = testerSpawnTeam.value;
  const opposingTeams = simulation.teams.filter((team) => team.id !== localTeam);
  testerSpawnTeam.replaceChildren(...opposingTeams.map((team) => {
    const option = document.createElement("option");
    option.value = team.id;
    option.textContent = team.name;
    return option;
  }));
  if (opposingTeams.some((team) => team.id === previousTeam)) {
    testerSpawnTeam.value = previousTeam;
  }
  const unavailable = opposingTeams.length === 0;
  testerSpawnTeam.disabled = unavailable;
  testerPlaceStructureButton.disabled = unavailable;
  testerPlaceUnitButton.disabled = unavailable;
}

function activeStructurePlacement() {
  if (placementStructureType) {
    return { structureType: placementStructureType, team: localTeam, testerSpawn: false };
  }
  if (testerSpawnPlacement?.kind === "structure") {
    return {
      structureType: testerSpawnPlacement.type,
      team: testerSpawnPlacement.team,
      testerSpawn: true,
    };
  }
  return null;
}

function placementIsActive() {
  return Boolean(placementStructureType || testerSpawnPlacement);
}

function resetGame() {
  const isAiMatch = matchMode === "single_player" || matchMode === "unit_tester";
  simulation = Simulation.createFieldTest({
    enemyAiEnabled: isAiMatch,
    mapId: activeMapId,
    playerCount: isAiMatch ? activePlayerCount : 2,
    testerTeams: matchMode === "unit_tester" ? [localTeam] : [],
  });
  resetAuthoritativeCommands();
  resetPresentation();
}

function resetAuthoritativeCommands() {
  authoritativeCommands.clear();
  nextLocalCommandSequence = 1;
  lastQueuedGuestCommandId = 0;
}

function updateSinglePlayerMapDescription() {
  const playerCount = Number(singlePlayerCount.value);
  const map = populateMapSelect(singlePlayerMap, playerCount, singlePlayerMap.value);
  singlePlayerMap.disabled = false;
  singlePlayerMapDescription.textContent = `${map.description} ${playerCount - 1} AI commander${playerCount === 2 ? "" : "s"} will use independent bases, economies, and armies.`;
}

function showSinglePlayerSetup() {
  modeChoices.hidden = true;
  multiplayerSetup.hidden = true;
  unitTesterSetup.hidden = true;
  singlePlayerSetup.hidden = false;
  singlePlayerCount.value = String(activePlayerCount);
  populateMapSelect(singlePlayerMap, activePlayerCount, activeMapId);
  updateSinglePlayerMapDescription();
}

function updateUnitTesterMapDescription() {
  const playerCount = Number(unitTesterCount.value);
  const map = populateMapSelect(unitTesterMap, playerCount, unitTesterMap.value);
  unitTesterMap.disabled = false;
  unitTesterMapDescription.textContent = `${map.description} ${playerCount - 1} AI commander${playerCount === 2 ? "" : "s"} will use normal resources, power, construction, production, and combat logic.`;
}

function showUnitTesterSetup() {
  modeChoices.hidden = true;
  multiplayerSetup.hidden = true;
  singlePlayerSetup.hidden = true;
  unitTesterSetup.hidden = false;
  unitTesterCount.value = String(activePlayerCount);
  populateMapSelect(unitTesterMap, activePlayerCount, activeMapId);
  updateUnitTesterMapDescription();
}

function isMultiplayer() {
  return matchMode === "multiplayer_host" || matchMode === "multiplayer_guest";
}

function setConnectionStatus(message, error = false) {
  connectionStatus.textContent = message;
  connectionStatus.classList.toggle("error", error);
}

function lobbyRoster(state = multiplayerLobby) {
  if (!state) return [];
  const roster = [{ name: "Host", role: "Human · Host" }];
  if (state.guestConnected) roster.push({ name: "Player 2", role: "Human · Guest" });
  for (let index = 0; index < state.botCount; index += 1) {
    roster.push({ name: `AI Bot ${index + 1}`, role: "Computer" });
  }
  return roster;
}

function renderMultiplayerLobby() {
  const roster = lobbyRoster();
  lobbyPanel.hidden = !multiplayerLobby;
  if (!multiplayerLobby) return;
  visibleLobbyCode.textContent = multiplayerLobby.code;
  lobbyPlayerCount.textContent = `${roster.length} / 8`;
  lobbyPlayerList.replaceChildren(...roster.map((player, index) => {
    const item = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = `${index + 1}. ${player.name}`;
    const role = document.createElement("small");
    role.textContent = player.role;
    item.append(name, role);
    return item;
  }));

  const playerCount = roster.length;
  const matchStarting = Boolean(matchStartHandshake?.waiting);
  const eligibleMaps = getMapsForPlayerCount(Math.max(2, playerCount));
  const randomOption = document.createElement("option");
  randomOption.value = "random";
  randomOption.textContent = `Random map · ${eligibleMaps.length} available`;
  lobbyMap.replaceChildren(randomOption);
  lobbyHostControls.hidden = lobbyRole !== "host";
  lobbyMap.value = "random";
  lobbyMap.disabled = true;
  addAiButton.disabled = matchStarting || playerCount >= 8;
  removeAiButton.disabled = matchStarting || multiplayerLobby.botCount === 0;
  startLobbyMatchButton.disabled = matchStarting || playerCount < 2;
  lobbyMapSummary.textContent = matchStarting
    ? "Waiting for Player 2 to load and acknowledge the match…"
    : playerCount < 2
    ? "Add an AI bot or wait for a guest before starting."
    : `One of ${eligibleMaps.length} ${playerCount}-player green grassland or red wasteland battlefields will be selected randomly when the match starts.`;
}

function sendLobbyState() {
  if (lobbyRole !== "host" || !multiplayerLobby?.guestConnected) return;
  peerSession?.send({ type: "lobby_state", lobby: multiplayerLobby });
}

function updateHostedLobby(update) {
  if (lobbyRole !== "host" || !multiplayerLobby) return;
  multiplayerLobby = { ...multiplayerLobby, ...update };
  renderMultiplayerLobby();
  sendLobbyState();
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
  matchStartHandshake = null;
  matchMode = "single_player";
  localTeam = "player";
  activePlayerCount = Number(singlePlayerCount.value);
  activeMapId = getMatchMap(activePlayerCount, singlePlayerMap.value).id;
  resetGame();
  matchModeLabel.textContent = `SINGLE PLAYER · ${activePlayerCount} PLAYERS · ${simulation.mapName.toUpperCase()}`;
  showGame();
}

function startUnitTester() {
  peerSession?.close();
  peerSession = null;
  multiplayerConnected = false;
  matchStartHandshake = null;
  matchMode = "unit_tester";
  localTeam = "player";
  activePlayerCount = Number(unitTesterCount.value);
  activeMapId = getMatchMap(activePlayerCount, unitTesterMap.value).id;
  resetGame();
  matchModeLabel.textContent = `UNIT TESTER · ${activePlayerCount} PLAYERS · ${simulation.mapName.toUpperCase()} · INSTANT PLAYER ASSETS`;
  resetButton.textContent = "Reset unit tester";
  restartMatchButton.textContent = "Restart unit tester";
  showGame();
}

function configureGuestTeam(sim) {
  const guestTeam = sim.teams.find((team) => team.id === "enemy");
  if (!guestTeam) return;
  guestTeam.kind = "human";
  guestTeam.name = "Player 2";
  delete sim.aiStates.enemy;
}

function enterMultiplayerMatch(role) {
  matchMode = role === "host" ? "multiplayer_host" : "multiplayer_guest";
  localTeam = role === "host" ? "player" : "enemy";
  multiplayerConnected = Boolean(peerSession?.opened);
  snapshotSendRemaining = 0;
  motionSendRemaining = 0;
  nextGuestCommandId = 1;
  lastProcessedGuestCommandId = 0;
  resetAuthoritativeCommands();
  nextHostStateSequence = 1;
  lastHostStateSequence = 0;
  lastHostStateReceivedAt = role === "guest" ? performance.now() : 0;
  pendingGuestCommands = new Map();
  multiplayerSyncMessage = null;
  activeMapId = simulation.mapId;
  activePlayerCount = simulation.teams.length;
  matchModeLabel.textContent = `${role === "host" ? "MULTIPLAYER HOST" : "MULTIPLAYER GUEST"} · ${simulation.mapName.toUpperCase()} · ${localTeam === "player" ? "WESTERN" : "EASTERN"} COMMAND`;
  resetPresentation();
  pauseButton.disabled = true;
  resetButton.textContent = "Leave multiplayer";
  restartMatchButton.textContent = "Return to menu";
  showGame();
}

function startHostedLobbyMatch() {
  if (lobbyRole !== "host" || !multiplayerLobby) return;
  const playerCount = lobbyRoster().length;
  if (playerCount < 2) return;
  const map = getRandomMatchMap(playerCount, Math.random());
  const hasGuest = multiplayerLobby.guestConnected;
  simulation = Simulation.createFieldTest({
    enemyAiEnabled: multiplayerLobby.botCount > 0,
    mapId: map.id,
    playerCount,
  });
  if (hasGuest) configureGuestTeam(simulation);
  if (hasGuest) {
    matchStartHandshake ||= new MatchStartHandshake("host");
    const message = matchStartHandshake.begin(simulation.createSnapshot());
    if (!peerSession?.send(message)) {
      matchStartHandshake.reset();
      setConnectionStatus("Could not deliver the match start. Check the guest connection and try again.", true);
      renderMultiplayerLobby();
      return;
    }
    setConnectionStatus("Match setup sent. Waiting for Player 2 to finish loading…");
    renderMultiplayerLobby();
    return;
  }
  if (!hasGuest) {
    peerSession?.close();
    peerSession = null;
  }
  enterMultiplayerMatch("host");
}

function returnToMenu() {
  peerSession?.close();
  peerSession = null;
  multiplayerConnected = false;
  matchStartHandshake = null;
  pendingGuestCommands.clear();
  resetAuthoritativeCommands();
  multiplayerSyncMessage = null;
  lobbyRole = null;
  multiplayerLobby = null;
  matchMode = "menu";
  localTeam = "player";
  activePlayerCount = 2;
  simulation = Simulation.createFieldTest({ enemyAiEnabled: false });
  resetPresentation();
  resetButton.textContent = "Reset field test";
  restartMatchButton.textContent = "Restart match";
  multiplayerSetup.hidden = true;
  singlePlayerSetup.hidden = true;
  unitTesterSetup.hidden = true;
  modeChoices.hidden = false;
  startMenu.hidden = false;
  gameShell.setAttribute("aria-hidden", "true");
  gameShell.setAttribute("inert", "");
  hostLobbyCode.value = "";
  joinLobbyCode.value = "";
  copyLobbyCodeButton.disabled = true;
  joinLobbyButton.disabled = true;
  matchModeLabel.textContent = "MATCH SETUP";
  lobbyPanel.hidden = true;
  setConnectionStatus("Create a lobby or enter a lobby code to begin.");
}

function multiplayerHandlers(role) {
  return {
    onOpen() {
      multiplayerConnected = true;
      if (role === "host") {
        const previousBotCount = multiplayerLobby?.botCount || 0;
        const botCount = Math.min(previousBotCount, 6);
        updateHostedLobby({ guestConnected: true, botCount });
        setConnectionStatus(botCount < previousBotCount
          ? "Player joined the final slot; the last AI bot was removed."
          : "Player joined. The host can now start the match.");
      } else {
        setConnectionStatus("Lobby joined. Waiting for the host to start the match…");
      }
    },
    onMessage(message) {
      const matchStartEvent = matchStartHandshake?.inspect(message);
      if (role === "host" && matchStartEvent?.kind === "acknowledged" && matchMode === "menu") {
        enterMultiplayerMatch("host");
        sendMultiplayerSnapshot();
      } else if (role === "host" && matchStartEvent?.kind === "rejected" && matchMode === "menu") {
        setConnectionStatus(matchStartEvent.reason, true);
        renderMultiplayerLobby();
      } else if (role === "guest" && matchStartEvent?.kind === "repeat") {
        peerSession?.send(matchStartEvent.acknowledgement);
      } else if (role === "guest" && matchStartEvent?.kind === "offered" && matchMode === "menu") {
        try {
          simulation = Simulation.fromSnapshot(matchStartEvent.snapshot);
          const acknowledgement = matchStartHandshake.accept(matchStartEvent.startId);
          enterMultiplayerMatch("guest");
          if (!peerSession?.send(acknowledgement)) {
            multiplayerSyncMessage = "WAITING TO CONFIRM MATCH START WITH HOST";
          }
        } catch {
          peerSession?.send(matchStartHandshake.reject(
            matchStartEvent.startId,
            "The guest could not load this match setup. Refresh both games and try again.",
          ));
          setConnectionStatus("The host sent an incompatible match setup.", true);
        }
      } else if (role === "host" && message.type === "command") {
        const commandId = Number.isSafeInteger(message.commandId) && message.commandId > 0
          ? message.commandId
          : lastQueuedGuestCommandId + 1;
        if (commandId <= lastQueuedGuestCommandId) return;
        const queued = queueAuthoritativeCommand(message.command, "enemy", {
          sequence: commandId,
          metadata: { guestCommandId: commandId },
        });
        if (queued) lastQueuedGuestCommandId = commandId;
        else {
          peerSession?.send({
            type: "command_result",
            commandId,
            accepted: false,
            reason: "The host rejected that malformed command.",
          });
        }
      } else if (role === "guest" && message.type === "lobby_state" && matchMode === "menu") {
        multiplayerLobby = { ...message.lobby };
        renderMultiplayerLobby();
      } else if (
        role === "guest" &&
        message.type === "motion" &&
        matchMode === "multiplayer_guest" &&
        multiplayerMotionUpdateIsValid(message)
      ) {
        guestPositionSmoother.transitionTo(
          message.entities,
          performance.now(),
          message.tick,
        );
      } else if (role === "guest" && message.type === "state") {
        const sequence = Number.isSafeInteger(message.sequence)
          ? message.sequence
          : lastHostStateSequence + 1;
        if (sequence <= lastHostStateSequence) {
          peerSession?.send({ type: "state_ack", sequence });
          return;
        }
        try {
          if (!deterministicStateMessageIsValid(message)) {
            throw new Error("Deterministic state verification failed.");
          }
          const receivedAt = performance.now();
          const nextSimulation = Simulation.fromSnapshot(message.snapshot);
          guestPositionSmoother.transitionTo(
            mobileSimulationEntities(nextSimulation),
            receivedAt,
            nextSimulation.tickNumber,
          );
          simulation = nextSimulation;
          lastHostStateSequence = sequence;
          lastHostStateReceivedAt = receivedAt;
          multiplayerSyncMessage = null;
          if (Number.isSafeInteger(message.lastGuestCommandId)) {
            for (const commandId of pendingGuestCommands.keys()) {
              if (commandId <= message.lastGuestCommandId) {
                pendingGuestCommands.delete(commandId);
              }
            }
          }
          for (const { command } of pendingGuestCommands.values()) {
            applyAuthorizedCommand(command, localTeam);
          }
          activeMapId = simulation.mapId;
          matchModeLabel.textContent = `MULTIPLAYER GUEST · ${simulation.mapName.toUpperCase()} · EASTERN COMMAND`;
          pruneSelection();
          peerSession?.send({ type: "state_ack", sequence });
        } catch {
          multiplayerSyncMessage = "HOST STATE VERIFICATION FAILED · WAITING FOR A NEW SNAPSHOT";
          peerSession?.send({ type: "state_ack", sequence });
          setConnectionStatus("The host sent an incompatible match state.", true);
        }
      } else if (role === "guest" && message.type === "command_result") {
        const pending = pendingGuestCommands.get(message.commandId);
        if (!pending) return;
        pendingGuestCommands.delete(message.commandId);
        if (!message.accepted) {
          multiplayerSyncMessage = String(message.reason || "The host rejected that command.").toUpperCase();
          if (pending.command.type === "construct") {
            placementStructureType = pending.command.structureType;
            placementCursor = { x: pending.command.x, y: pending.command.y };
            placementMessage = multiplayerSyncMessage;
          }
        }
      }
    },
    onClose() {
      if (!multiplayerConnected) return;
      multiplayerConnected = false;
      if (matchMode === "menu") {
        if (role === "host") {
          matchStartHandshake?.reset();
          updateHostedLobby({ guestConnected: false });
          setConnectionStatus("The guest disconnected before the match started. The lobby is still open.", true);
        } else {
          setConnectionStatus("The host closed the lobby.", true);
        }
        return;
      }
      paused = true;
      multiplayerSyncMessage = "MULTIPLAYER CONNECTION LOST · LEAVE MATCH TO RECONNECT";
      statusBanner.hidden = false;
      statusBanner.textContent = multiplayerSyncMessage;
    },
    onError(message) {
      if (isMultiplayer()) multiplayerSyncMessage = String(message).toUpperCase();
      setConnectionStatus(message, true);
    },
  };
}

async function createHostMatch() {
  createHostButton.disabled = true;
  copyLobbyCodeButton.disabled = true;
  hostLobbyCode.value = "";
  setConnectionStatus("Creating lobby…");
  try {
    peerSession?.close();
    const created = await PeerMultiplayerSession.createHost(multiplayerHandlers("host"));
    peerSession = created.session;
    matchStartHandshake = new MatchStartHandshake("host");
    lobbyRole = "host";
    multiplayerLobby = {
      code: created.lobbyCode,
      guestConnected: false,
      botCount: 0,
      mapId: DEFAULT_MAP_ID,
    };
    hostLobbyCode.value = created.lobbyCode;
    copyLobbyCodeButton.disabled = false;
    setConnectionStatus(`Lobby ${created.lobbyCode} is open. Waiting for another player…`);
    renderMultiplayerLobby();
  } catch (error) {
    setConnectionStatus(error.message || "Could not create the lobby.", true);
  } finally {
    createHostButton.disabled = false;
  }
}

async function joinMultiplayerLobby() {
  const lobbyCode = normalizeLobbyCode(joinLobbyCode.value);
  joinLobbyCode.value = lobbyCode;
  if (!isValidLobbyCode(lobbyCode)) {
    setConnectionStatus("Enter the host's 10-character lobby code.", true);
    return;
  }
  joinLobbyButton.disabled = true;
  setConnectionStatus(`Joining lobby ${lobbyCode}…`);
  try {
    peerSession?.close();
    const created = await PeerMultiplayerSession.createGuest(
      lobbyCode,
      multiplayerHandlers("guest"),
    );
    peerSession = created.session;
    matchStartHandshake = new MatchStartHandshake("guest");
    lobbyRole = "guest";
    multiplayerLobby = {
      code: created.lobbyCode,
      guestConnected: true,
      botCount: 0,
      mapId: DEFAULT_MAP_ID,
    };
    renderMultiplayerLobby();
    setConnectionStatus(`Connecting to lobby ${created.lobbyCode}…`);
  } catch (error) {
    setConnectionStatus(error.message || "Could not join that lobby.", true);
  } finally {
    joinLobbyButton.disabled = !isValidLobbyCode(joinLobbyCode.value);
  }
}

async function copyLobbyCode() {
  if (!isValidLobbyCode(hostLobbyCode.value)) return;
  try {
    await navigator.clipboard.writeText(hostLobbyCode.value);
    setConnectionStatus(`Lobby code ${hostLobbyCode.value} copied. Waiting for another player…`);
  } catch {
    hostLobbyCode.focus();
    hostLobbyCode.select();
    setConnectionStatus("Lobby code selected. Copy it with Ctrl+C or Command+C.");
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
    case "load": {
      const transport = simulation.getUnit(command.transportId);
      if (!transport?.alive || transport.team !== team) return false;
      return simulation.commandLoadUnits(
        ownedUnitIds(command.unitIds, team),
        transport.id,
      ) > 0;
    }
    case "fill_transports": {
      const transportIds = ownedUnitIds(command.transportIds, team);
      return transportIds.length > 0 && simulation.commandFillTransports(transportIds) > 0;
    }
    case "unload_transports": {
      const transportIds = ownedUnitIds(command.transportIds, team);
      return transportIds.length > 0 && simulation.commandUnloadTransports(transportIds) > 0;
    }
    case "build": {
      const structure = ownedStructure(command.structureId, team);
      if (!structure || structure.complete) return false;
      return simulation.commandBuild(
        ownedUnitIds(command.unitIds, team),
        structure.id,
        { queue: Boolean(command.queue) },
      ) > 0;
    }
    case "repair": {
      const target = simulation.getEntity(command.targetId);
      if (!target?.alive || target.team !== team) return false;
      return simulation.commandRepair(
        ownedUnitIds(command.unitIds, team),
        target.id,
      ) > 0;
    }
    case "assist_production": {
      const factory = ownedStructure(command.structureId, team);
      if (!factory) return false;
      return simulation.commandAssistProduction(
        ownedUnitIds(command.unitIds, team),
        factory.id,
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
    case "tester_spawn_structure": {
      if (!STRUCTURE_DEFINITIONS[command.structureType]) return false;
      if (!Number.isFinite(command.x) || !Number.isFinite(command.y)) return false;
      return simulation.spawnTesterStructure(
        team,
        command.ownerTeam,
        command.structureType,
        command.x,
        command.y,
      );
    }
    case "tester_spawn_unit": {
      if (!UNIT_DEFINITIONS[command.unitType]) return false;
      if (!Number.isFinite(command.x) || !Number.isFinite(command.y)) return false;
      return simulation.spawnTesterUnit(
        team,
        command.ownerTeam,
        command.unitType,
        command.x,
        command.y,
      );
    }
    case "production": {
      const structureIds = Array.isArray(command.structureIds)
        ? [...new Set(command.structureIds)].slice(0, 200)
        : [command.structureId];
      const structures = structureIds.map((structureId) => ownedStructure(structureId, team));
      if (
        structures.length === 0 ||
        structures.some((structure) => !structure) ||
        !UNIT_DEFINITIONS[command.unitType]
      ) {
        return false;
      }
      return Boolean(simulation.queueGroupProduction(structureIds, command.unitType));
    }
    case "rally": {
      const structureIds = Array.isArray(command.structureIds)
        ? [...new Set(command.structureIds)].slice(0, 200)
        : [command.structureId];
      const structures = structureIds.map((structureId) => ownedStructure(structureId, team));
      if (
        structures.length === 0 ||
        structures.some((structure) => !structure) ||
        !Number.isFinite(command.x) ||
        !Number.isFinite(command.y)
      ) {
        return false;
      }
      return simulation.commandGroupRally(structureIds, command.x, command.y) === structures.length;
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
    const commandId = nextGuestCommandId;
    const sent = peerSession?.send({
      type: "command",
      commandId,
      requestedTick: simulation.tickNumber + 1,
      command,
    }) || false;
    if (!sent) {
      multiplayerSyncMessage = "COMMAND NOT SENT · CHECK THE MULTIPLAYER CONNECTION";
      return false;
    }
    multiplayerSyncMessage = null;
    nextGuestCommandId += 1;
    pendingGuestCommands.set(commandId, { command });
    applyAuthorizedCommand(command, localTeam);
    return true;
  }
  return queueAuthoritativeCommand(command, localTeam);
}

function queueAuthoritativeCommand(command, team, { sequence = null, metadata = null } = {}) {
  const playerSlot = simulation.teams.find((candidate) => candidate.id === team)?.slot;
  if (!Number.isSafeInteger(playerSlot)) return false;
  const commandSequence = Number.isSafeInteger(sequence)
    ? sequence
    : nextLocalCommandSequence;
  const queued = authoritativeCommands.enqueue({
    executeTick: simulation.tickNumber + 1,
    playerSlot,
    sequence: commandSequence,
    team,
    command,
    metadata,
  });
  if (queued && sequence === null) nextLocalCommandSequence += 1;
  return queued;
}

function processAuthoritativeCommands(executeTick) {
  let processedGuestCommand = false;
  const results = authoritativeCommands.drain(executeTick, (entry) => {
    const accepted = Boolean(applyAuthorizedCommand(entry.command, entry.team));
    return {
      accepted,
      reason: accepted
        ? null
        : simulation.lastPlacementError ||
          simulation.lastProductionError ||
          simulation.lastUpgradeError ||
          "The host rejected that command.",
    };
  });
  for (const { entry, result } of results) {
    const commandId = entry.metadata?.guestCommandId;
    if (!Number.isSafeInteger(commandId)) continue;
    lastProcessedGuestCommandId = Math.max(lastProcessedGuestCommandId, commandId);
    processedGuestCommand = true;
    peerSession?.send({
      type: "command_result",
      commandId,
      executeTick: entry.executeTick,
      accepted: result.accepted,
      reason: result.reason,
    });
  }
  return processedGuestCommand;
}

function sendMultiplayerSnapshot() {
  if (matchMode !== "multiplayer_host" || !multiplayerConnected) return false;
  const sequence = nextHostStateSequence;
  nextHostStateSequence += 1;
  const snapshot = simulation.createSnapshot();
  const sent = peerSession?.sendState(createDeterministicStateMessage({
    sequence,
    lastGuestCommandId: lastProcessedGuestCommandId,
    snapshot,
  })) || false;
  if (sent) {
    multiplayerSyncMessage = null;
    snapshotSendRemaining = MULTIPLAYER_STATE_INTERVAL_SECONDS;
  }
  return sent;
}

function sendMultiplayerMotion() {
  if (matchMode !== "multiplayer_host" || !multiplayerConnected) return false;
  const sent = peerSession?.sendMotion(createMultiplayerMotionUpdate(
    simulation.tickNumber,
    mobileSimulationEntities(),
  )) || false;
  if (sent) motionSendRemaining = MULTIPLAYER_MOTION_INTERVAL_SECONDS;
  return sent;
}

function runAuthoritativeSimulationHeartbeat(now = performance.now()) {
  const running = matchMode !== "menu" && matchMode !== "multiplayer_guest" && !paused;
  const { elapsedSeconds } = authoritativeSimulationClock.advance(
    now,
    running,
    () => {
      const processedGuestCommand = processAuthoritativeCommands(simulation.tickNumber + 1);
      simulation.fixedTick();
      if (processedGuestCommand && matchMode === "multiplayer_host") {
        sendMultiplayerSnapshot();
      }
    },
  );
  if (!running || matchMode !== "multiplayer_host") return;

  snapshotSendRemaining -= elapsedSeconds;
  if (snapshotSendRemaining <= 0) {
    sendMultiplayerSnapshot();
  }
  motionSendRemaining -= elapsedSeconds;
  if (motionSendRemaining <= 0) {
    sendMultiplayerMotion();
  }
}

function describeStructureRole(definition) {
  if (definition.shieldCapacity) {
    return `${definition.shieldCapacity} shield · ${definition.shieldRadius} radius · ${definition.shieldRegenRate}/s regen`;
  }
  if (definition.capacitorCapacity) {
    const damagePerSecond = definition.attackDamage / definition.attackCooldown;
    const range = definition.minimumAttackRange
      ? `${definition.minimumAttackRange}–${definition.attackRange} range`
      : `${definition.attackRange} range`;
    const airBonus = definition.airDamageMultiplier
      ? ` · ${definition.airDamageMultiplier}× vs air`
      : "";
    return `${definition.attackDamage} damage · ${range} · ${damagePerSecond.toFixed(1)} DPS${airBonus}`;
  }
  if (definition.chargeRadius) {
    return `${definition.chargeRate}/s recharge · ${definition.chargeRadius} radius`;
  }
  if (definition.metalRate) return `+${definition.metalRate} crystal/s`;
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
  if (matchMode === "menu" && lobbyRole === "host" && matchStartHandshake?.waiting) {
    const startEvent = matchStartHandshake.poll();
    if (startEvent?.kind === "retry") {
      peerSession?.send(startEvent.message);
    } else if (startEvent?.kind === "timeout") {
      setConnectionStatus("Player 2 did not confirm the match start. Check their connection and try again.", true);
      renderMultiplayerLobby();
    }
  }
  pruneSelection();
  render(now);
  interfaceRefreshRemaining -= elapsed;
  if (interfaceRefreshRemaining <= 0) {
    updateInterface();
    interfaceRefreshRemaining = interfaceRefreshInterval;
  }
  requestAnimationFrame(frame);
}

function render(now = performance.now()) {
  renderTimestamp = now;
  renderViewBounds = visibleWorldBounds();
  renderTeamPalettes = new Map([[localTeam, teamPalettes[0]]]);
  let opponentPaletteIndex = 1;
  for (const team of simulation.teams) {
    if (team.id === localTeam) continue;
    renderTeamPalettes.set(team.id, teamPalettes[opponentPaletteIndex % teamPalettes.length]);
    opponentPaletteIndex += 1;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.scale(camera.zoom, camera.zoom);
  context.translate(-camera.x, -camera.y);
  const strategicView = strategicViewActive(camera.zoom);
  drawTerrain();
  drawCrystalDeposits();
  drawPowerNetwork();
  drawShieldFields();
  drawCommandIndicators();

  if (strategicView) {
    drawStrategicEntities();
  } else {
    for (const wreck of simulation.wrecks) {
      if (worldPointIsVisible(wreck.x, wreck.y, 80)) drawWreck(wreck);
    }
    for (const structure of simulation.structures) {
      if (!structure.alive) continue;
      const footprint = structureFootprint(structure.type);
      if (worldPointIsVisible(structure.x, structure.y, Math.max(footprint.width, footprint.height))) {
        drawStructure(structure);
      }
    }
    for (const drone of simulation.getDrones()) {
      if (!drone.alive) continue;
      const displayedDrone = presentedEntity(drone);
      if (worldPointIsVisible(displayedDrone.x, displayedDrone.y, 70)) drawDrone(displayedDrone);
    }
    for (const unit of simulation.units) {
      if (!unit.alive || unit.carriedById) continue;
      const displayedUnit = presentedEntity(unit);
      if (worldPointIsVisible(displayedUnit.x, displayedUnit.y, 100)) drawUnit(displayedUnit);
    }
    drawEvents();
  }
  drawPlacementPreview();
  drawSelectionBox();
  context.restore();
  drawCameraHud();
  drawMinimap();
}

function drawStrategicEntities() {
  const lineWidth = strategicIconWorldSize(camera.zoom, 1.5);
  for (const structure of simulation.structures) {
    if (!structure.alive || !worldPointIsVisible(structure.x, structure.y, 100)) continue;
    const definition = STRUCTURE_DEFINITIONS[structure.type];
    const palette = teamPalette(structure.team);
    const size = strategicIconWorldSize(camera.zoom, definition.headquarters ? 13 : 9);
    context.save();
    context.translate(structure.x, structure.y);
    context.fillStyle = palette.dark;
    context.strokeStyle = selectedStructureIds.has(structure.id) ? colors.selection : palette.bright;
    context.lineWidth = lineWidth;
    context.beginPath();
    if (definition.headquarters) {
      context.moveTo(0, -size);
      context.lineTo(size, 0);
      context.lineTo(0, size);
      context.lineTo(-size, 0);
      context.closePath();
    } else {
      context.rect(-size * 0.72, -size * 0.72, size * 1.44, size * 1.44);
    }
    context.fill();
    context.stroke();
    if (definition.headquarters) {
      context.beginPath();
      context.arc(0, 0, size * 1.35, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }

  const drawMobileIcon = (entity, drone = false) => {
    const displayed = presentedEntity(entity);
    if (!worldPointIsVisible(displayed.x, displayed.y, 80)) return;
    const definition = entity.kind === "unit" ? UNIT_DEFINITIONS[entity.type] : DRONE_DEFINITION;
    const palette = teamPalette(entity.team);
    const selected = selectedUnitIds.has(entity.id);
    const size = strategicIconWorldSize(camera.zoom, drone ? 4 : selected ? 8 : 6);
    context.save();
    context.translate(displayed.x, displayed.y);
    context.fillStyle = palette.bright;
    context.strokeStyle = selected ? colors.selection : palette.dark;
    context.lineWidth = lineWidth;
    context.beginPath();
    if (definition.movementLayer === "air") {
      context.moveTo(0, -size);
      context.lineTo(size * 0.82, size * 0.78);
      context.lineTo(-size * 0.82, size * 0.78);
      context.closePath();
    } else {
      context.arc(0, 0, size, 0, Math.PI * 2);
    }
    context.fill();
    context.stroke();
    context.restore();
  };
  for (const drone of simulation.getDrones()) {
    if (drone.alive) drawMobileIcon(drone, true);
  }
  for (const unit of simulation.units) {
    if (unit.alive && !unit.carriedById) drawMobileIcon(unit);
  }
}

function drawShieldFields() {
  for (const shield of simulation.structures) {
    const definition = STRUCTURE_DEFINITIONS[shield.type];
    if (!shield.alive || !shield.complete || !definition.shieldCapacity) continue;
    const selected = selectedStructureIds.has(shield.id);
    const active = shield.powered && shield.shieldStrength > 0.01;
    if (!active && !selected) continue;
    const strengthRatio = Math.max(0, Math.min(1, shield.shieldStrength / definition.shieldCapacity));
    const pulse = 0.5 + Math.sin(renderTimestamp * 0.0025 + shield.x * 0.01) * 0.5;
    context.save();
    context.translate(shield.x, shield.y);
    if (active) {
      context.fillStyle = `${colors.shield}${Math.round(10 + strengthRatio * 14).toString(16).padStart(2, "0")}`;
      context.beginPath();
      context.arc(0, 0, definition.shieldRadius, 0, Math.PI * 2);
      context.fill();
    }
    context.strokeStyle = active
      ? `${colors.shield}${selected ? "aa" : Math.round(55 + pulse * 35).toString(16)}`
      : "#8c99a566";
    context.lineWidth = selected ? 2.5 : 1.5;
    if (!active) context.setLineDash([7, 9]);
    context.beginPath();
    context.arc(0, 0, definition.shieldRadius, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }
}

function mobileSimulationEntities(source = simulation) {
  return [...source.units, ...source.getDrones()];
}

function presentedPosition(entity) {
  if (matchMode !== "multiplayer_guest" || !entity?.id) {
    return { x: entity.x, y: entity.y };
  }
  return guestPositionSmoother.positionFor(entity, renderTimestamp);
}

function presentedEntity(entity) {
  if (!entity?.id || !Number.isFinite(entity.x) || !Number.isFinite(entity.y)) return entity;
  const position = presentedPosition(entity);
  if (position.x === entity.x && position.y === entity.y) return entity;
  return { ...entity, ...position };
}

function visibleWorldBounds(margin = 0) {
  const halfWidth = canvas.width / (2 * camera.zoom) + margin;
  const halfHeight = canvas.height / (2 * camera.zoom) + margin;
  return {
    left: Math.max(0, camera.x - halfWidth),
    right: Math.min(simulation.width, camera.x + halfWidth),
    top: Math.max(0, camera.y - halfHeight),
    bottom: Math.min(simulation.height, camera.y + halfHeight),
  };
}

function worldPointIsVisible(x, y, margin = 0) {
  const bounds = renderViewBounds || visibleWorldBounds();
  return (
    x >= bounds.left - margin &&
    x <= bounds.right + margin &&
    y >= bounds.top - margin &&
    y <= bounds.bottom + margin
  );
}

function worldRectIsVisible(left, top, right, bottom, margin = 0) {
  const bounds = renderViewBounds || visibleWorldBounds();
  return (
    right >= bounds.left - margin &&
    left <= bounds.right + margin &&
    bottom >= bounds.top - margin &&
    top <= bounds.bottom + margin
  );
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

function minimumCameraZoom() {
  return strategicZoomMinimum(
    canvas.width,
    canvas.height,
    simulation.width,
    simulation.height,
  );
}

function drawCameraHud() {
  const viewMode = strategicViewActive(camera.zoom) ? " · STRATEGIC ICONS" : "";
  const label = `WASD PAN · WHEEL ZOOM · ${Math.round(camera.zoom * 100)}%${viewMode}`;
  context.font = "700 12px ui-monospace, monospace";
  context.fillStyle = "#080a0dcc";
  context.fillRect(14, canvas.height - 38, context.measureText(label).width + 20, 25);
  context.fillStyle = "#aeb8c2";
  context.fillText(label, 24, canvas.height - 21);
}

function currentMinimapLayout() {
  return calculateMinimapLayout(
    canvas.width,
    canvas.height,
    simulation.width,
    simulation.height,
  );
}

function drawMinimap() {
  const layout = currentMinimapLayout();
  const theme = battlefieldThemePalette();
  context.save();
  context.shadowColor = "#000b";
  context.shadowBlur = 18;
  context.fillStyle = "#080b10e8";
  context.fillRect(layout.left, layout.top, layout.width, layout.height);
  context.shadowBlur = 0;
  context.strokeStyle = "#66747f";
  context.lineWidth = 2;
  context.strokeRect(layout.left, layout.top, layout.width, layout.height);

  context.fillStyle = "#b7c4ce";
  context.font = "700 12px ui-monospace, monospace";
  context.textAlign = "left";
  context.fillText("TACTICAL MAP · L:CENTER · R:MOVE", layout.mapLeft, layout.top + 18);

  context.beginPath();
  context.rect(layout.mapLeft, layout.mapTop, layout.mapWidth, layout.mapHeight);
  context.clip();
  context.fillStyle = theme.minimapGround;
  context.fillRect(layout.mapLeft, layout.mapTop, layout.mapWidth, layout.mapHeight);

  for (const obstacle of simulation.terrain) {
    const point = minimapPoint(
      layout,
      obstacle.x - obstacle.width / 2,
      obstacle.y - obstacle.height / 2,
    );
    context.fillStyle = terrainVisualPalette(obstacle, theme).minimap;
    context.fillRect(
      point.x,
      point.y,
      Math.max(1, obstacle.width * layout.scale),
      Math.max(1, obstacle.height * layout.scale),
    );
  }

  for (const deposit of simulation.metalDeposits) {
    const point = minimapPoint(layout, deposit.x, deposit.y);
    context.fillStyle = deposit.rich ? "#ff7b8c" : "#d83452";
    context.shadowColor = deposit.rich ? "#ff8b99" : "#c91f3f";
    context.shadowBlur = deposit.rich ? 7 : 4;
    context.beginPath();
    context.arc(point.x, point.y, deposit.rich ? 3 : 2, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
  }

  for (const structure of simulation.structures) {
    if (!structure.alive) continue;
    const point = minimapPoint(layout, structure.x, structure.y);
    const palette = teamPalette(structure.team);
    context.fillStyle = palette.dark;
    context.strokeStyle = palette.bright;
    context.lineWidth = 1;
    context.fillRect(point.x - 3, point.y - 3, 6, 6);
    context.strokeRect(point.x - 3, point.y - 3, 6, 6);
  }

  const drawUnitDot = (entity) => {
    const position = presentedPosition(entity);
    const point = minimapPoint(layout, position.x, position.y);
    const palette = teamPalette(entity.team);
    context.fillStyle = palette.bright;
    context.beginPath();
    context.arc(point.x, point.y, 3.25, 0, Math.PI * 2);
    context.fill();
  };
  for (const unit of simulation.units) {
    if (unit.alive && !unit.carriedById) drawUnitDot(unit);
  }
  for (const drone of simulation.getDrones()) {
    if (drone.alive) drawUnitDot(drone);
  }

  const viewport = minimapViewport(layout, visibleWorldBounds());
  context.strokeStyle = "#f4f7ef";
  context.lineWidth = 2;
  context.strokeRect(viewport.left, viewport.top, viewport.width, viewport.height);
  context.restore();
}

function drawTerrain() {
  const theme = battlefieldThemePalette();
  const strategicView = strategicViewActive(camera.zoom);
  context.fillStyle = theme.background;
  context.fillRect(0, 0, simulation.width, simulation.height);

  for (const patch of theme.groundPatches) {
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

  const visibleBounds = visibleWorldBounds(80);
  if (!strategicView) {
    // Small deterministic mottles keep the field organic without shimmering as
    // the camera moves or introducing simulation-side randomness.
    context.fillStyle = theme.mottle;
    const firstMottleX = Math.max(80, Math.floor(visibleBounds.left / 160) * 160 + 80);
    const firstMottleY = Math.max(80, Math.floor(visibleBounds.top / 160) * 160 + 80);
    for (let y = firstMottleY; y <= visibleBounds.bottom; y += 160) {
      for (let x = firstMottleX; x <= visibleBounds.right; x += 160) {
        if ((x / 160 + y / 160) % 3 === 0) continue;
        const offsetX = ((x * 7 + y * 3) % 41) - 20;
        const offsetY = ((x * 5 + y * 11) % 37) - 18;
        context.beginPath();
        context.ellipse(x + offsetX, y + offsetY, 18, 8, (x + y) * 0.002, 0, Math.PI * 2);
        context.fill();
      }
    }
    if (simulation.mapTheme === "grassland") drawGrassTufts(visibleBounds);
    else drawCrystalRemnants(visibleBounds);
  }

  const gridSize = strategicView && !placementIsActive()
    ? SIMULATION_RULES.buildingGridSize * 5
    : SIMULATION_RULES.buildingGridSize;
  context.lineWidth = placementIsActive() ? 1.5 : 1;
  const firstGridX = Math.floor(visibleBounds.left / gridSize) * gridSize;
  const firstGridY = Math.floor(visibleBounds.top / gridSize) * gridSize;
  for (let x = firstGridX; x <= visibleBounds.right; x += gridSize) {
    context.strokeStyle = placementIsActive()
      ? x % (gridSize * 5) === 0
        ? theme.placementGridStrong
        : theme.placementGridFine
      : x % (gridSize * 5) === 0
        ? theme.gridStrong
        : theme.gridFine;
    context.beginPath();
    context.moveTo(x, visibleBounds.top);
    context.lineTo(x, visibleBounds.bottom);
    context.stroke();
  }
  for (let y = firstGridY; y <= visibleBounds.bottom; y += gridSize) {
    context.strokeStyle = placementIsActive()
      ? y % (gridSize * 5) === 0
        ? theme.placementGridStrong
        : theme.placementGridFine
      : y % (gridSize * 5) === 0
        ? theme.gridStrong
        : theme.gridFine;
    context.beginPath();
    context.moveTo(visibleBounds.left, y);
    context.lineTo(visibleBounds.right, y);
    context.stroke();
  }

  drawImpassableTerrain(strategicView);

  context.font = "700 12px ui-monospace, monospace";
  for (const team of simulation.teams) {
    const start = simulation.teamStarts[team.id];
    if (!start || !worldPointIsVisible(start.x, start.y - 300, 100)) continue;
    context.fillStyle = teamPalette(team.id).bright;
    context.textAlign = "center";
    context.fillText(team.id === localTeam ? "YOUR COMMAND" : team.name.toUpperCase(), start.x, start.y - 300);
  }
  context.textAlign = "start";
}

function drawImpassableTerrain(strategicView = false) {
  const theme = battlefieldThemePalette();
  for (const obstacle of simulation.terrain) {
    const left = obstacle.x - obstacle.width / 2;
    const top = obstacle.y - obstacle.height / 2;
    if (!worldRectIsVisible(left, top, left + obstacle.width, top + obstacle.height, 40)) continue;
    const isStartingWall = obstacle.terrainType === "starting_wall";
    const isRuins = obstacle.terrainType === "ruins";
    const isFracture = obstacle.terrainType === "fracture";
    const palette = terrainVisualPalette(obstacle, theme);
    const depth = isStartingWall
      ? 5
      : Math.max(8, Math.min(18, Math.min(obstacle.width, obstacle.height) * 0.16));
    const surfaceWidth = Math.max(4, obstacle.width - depth);
    const surfaceHeight = Math.max(4, obstacle.height - depth);
    const surfaceRight = left + surfaceWidth;
    const surfaceBottom = top + surfaceHeight;
    context.save();

    if (strategicView) {
      context.fillStyle = palette.top;
      context.strokeStyle = palette.highlight;
      context.lineWidth = strategicIconWorldSize(camera.zoom, 1.5);
      context.fillRect(left, top, obstacle.width, obstacle.height);
      context.strokeRect(left, top, obstacle.width, obstacle.height);
      context.restore();
      continue;
    }

    // The shadow and two interior rock faces make the obstacle read as raised
    // terrain without changing its exact rectangular collision footprint.
    context.shadowColor = "#101612a8";
    context.shadowBlur = 12;
    context.shadowOffsetX = 7;
    context.shadowOffsetY = 9;
    context.fillStyle = palette.face;
    context.fillRect(left, top, obstacle.width, obstacle.height);
    context.shadowColor = "transparent";
    context.shadowBlur = 0;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;

    const topGradient = context.createLinearGradient(left, top, surfaceRight, surfaceBottom);
    topGradient.addColorStop(0, palette.topLight);
    topGradient.addColorStop(0.42, palette.top);
    topGradient.addColorStop(1, palette.face);
    context.fillStyle = topGradient;
    context.fillRect(left, top, surfaceWidth, surfaceHeight);

    context.fillStyle = palette.face;
    context.beginPath();
    context.moveTo(surfaceRight, top);
    context.lineTo(left + obstacle.width, top + depth);
    context.lineTo(left + obstacle.width, top + obstacle.height);
    context.lineTo(surfaceRight, surfaceBottom);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(left, surfaceBottom);
    context.lineTo(surfaceRight, surfaceBottom);
    context.lineTo(left + obstacle.width, top + obstacle.height);
    context.lineTo(left + depth, top + obstacle.height);
    context.closePath();
    context.fill();

    context.strokeStyle = palette.highlight;
    context.lineWidth = isStartingWall ? 2 : 3;
    context.beginPath();
    context.moveTo(left + 2, surfaceBottom - 1);
    context.lineTo(left + 2, top + 2);
    context.lineTo(surfaceRight - 1, top + 2);
    context.stroke();
    context.strokeStyle = palette.edge;
    context.beginPath();
    context.moveTo(surfaceRight, top);
    context.lineTo(surfaceRight, surfaceBottom);
    context.lineTo(left, surfaceBottom);
    context.stroke();

    context.beginPath();
    context.rect(left, top, surfaceWidth, surfaceHeight);
    context.clip();

    if (isStartingWall) {
      context.strokeStyle = palette.detail;
      context.lineWidth = 1.5;
      const horizontal = obstacle.width >= obstacle.height;
      const length = horizontal ? obstacle.width : obstacle.height;
      for (let offset = 40; offset < length; offset += 40) {
        context.beginPath();
        if (horizontal) {
          context.moveTo(left + offset, top + 3);
          context.lineTo(left + offset, surfaceBottom - 3);
        } else {
          context.moveTo(left + 3, top + offset);
          context.lineTo(surfaceRight - 3, top + offset);
        }
        context.stroke();
      }
      context.fillStyle = palette.highlight;
      for (let offset = 20; offset < length; offset += 40) {
        const boltX = horizontal ? left + offset : left + surfaceWidth / 2;
        const boltY = horizontal ? top + surfaceHeight / 2 : top + offset;
        context.beginPath();
        context.arc(boltX, boltY, 1.7, 0, Math.PI * 2);
        context.fill();
      }
    } else if (isRuins) {
      context.strokeStyle = palette.detail;
      context.lineWidth = 2;
      for (let y = top + 28; y < surfaceBottom; y += 42) {
        context.beginPath();
        context.moveTo(left, y);
        context.lineTo(surfaceRight, y);
        context.stroke();
      }
      for (let row = 0, y = top; y < surfaceBottom; row += 1, y += 42) {
        const offset = row % 2 === 0 ? 0 : 32;
        for (let x = left + offset; x < surfaceRight; x += 64) {
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x, Math.min(y + 28, surfaceBottom));
          context.stroke();
        }
      }
      context.strokeStyle = palette.accent;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(left + 8, top + 9);
      context.lineTo(surfaceRight - 7, top + 9);
      context.stroke();
    } else {
      const seed = stableVisualSeed(obstacle.id);
      context.strokeStyle = palette.detail;
      context.lineWidth = 2;
      const facetCount = Math.max(2, Math.floor((surfaceWidth + surfaceHeight) / 115));
      for (let facet = 0; facet < facetCount; facet += 1) {
        const x = left + 12 + ((seed + facet * 67) % Math.max(20, surfaceWidth - 24));
        const y = top + 12 + ((seed * 3 + facet * 43) % Math.max(20, surfaceHeight - 24));
        const reach = 12 + ((seed + facet * 19) % 24);
        context.fillStyle = facet % 2 === 0 ? palette.highlight : palette.detail;
        context.globalAlpha = facet % 2 === 0 ? 0.22 : 0.13;
        context.beginPath();
        context.moveTo(x - reach, y - reach * 0.22);
        context.lineTo(x, y);
        context.lineTo(x + reach * 0.72, y - reach * 0.5);
        context.lineTo(x + reach * 0.24, y + reach * 0.42);
        context.closePath();
        context.fill();
        context.globalAlpha = 1;
        context.beginPath();
        context.moveTo(x - reach, y - reach * 0.22);
        context.lineTo(x, y);
        context.lineTo(x + reach * 0.72, y - reach * 0.5);
        context.stroke();
      }
      context.strokeStyle = palette.highlight;
      context.lineWidth = 1.5;
      const inset = Math.min(15, surfaceWidth / 5, surfaceHeight / 5);
      context.strokeRect(
        left + inset,
        top + inset,
        Math.max(1, surfaceWidth - inset * 2),
        Math.max(1, surfaceHeight - inset * 2),
      );
      if (isFracture) {
        context.strokeStyle = palette.accent;
        context.lineWidth = 2.5;
        for (let crack = 0; crack < 3; crack += 1) {
          const startX = left + surfaceWidth * (0.2 + crack * 0.28);
          const startY = top + 3;
          context.beginPath();
          context.moveTo(startX, startY);
          context.lineTo(startX - 9 + crack * 4, top + surfaceHeight * 0.35);
          context.lineTo(startX + 8 - crack * 3, top + surfaceHeight * 0.68);
          context.lineTo(startX - 4, surfaceBottom - 3);
          context.stroke();
        }
      } else if (simulation.mapTheme === "grassland") {
        context.strokeStyle = palette.accent;
        context.lineWidth = 4;
        context.beginPath();
        context.moveTo(left + 4, top + 7);
        context.lineTo(surfaceRight - 6, top + 7);
        context.stroke();
      }
    }
    context.restore();

    context.save();
    context.strokeStyle = palette.detail;
    context.lineWidth = 1.5;
    for (let x = left + 18; x < surfaceRight; x += 34) {
      context.beginPath();
      context.moveTo(x, surfaceBottom + 2);
      context.lineTo(x + 6, top + obstacle.height - 2);
      context.stroke();
    }
    for (let y = top + 18; y < surfaceBottom; y += 34) {
      context.beginPath();
      context.moveTo(surfaceRight + 2, y);
      context.lineTo(left + obstacle.width - 2, y + 6);
      context.stroke();
    }
    context.strokeStyle = palette.edge;
    context.lineWidth = 2.5;
    context.strokeRect(left, top, obstacle.width, obstacle.height);
    context.restore();
    if (!isStartingWall && obstacle.showLabel !== false) {
      drawLabel(obstacle.x, obstacle.y, `${obstacle.name} · Impassable`, true, "#9aa3aa");
    }
  }
}

function drawGrassTufts(visibleBounds) {
  const spacing = 150;
  const firstX = Math.max(50, Math.floor(visibleBounds.left / spacing) * spacing + 60);
  const firstY = Math.max(50, Math.floor(visibleBounds.top / spacing) * spacing + 60);
  context.save();
  context.lineWidth = 1.25;
  for (let y = firstY; y <= visibleBounds.bottom; y += spacing) {
    for (let x = firstX; x <= visibleBounds.right; x += spacing) {
      const signature = Math.abs(Math.floor(x / spacing) * 43 + Math.floor(y / spacing) * 71);
      if (signature % 3 === 0) continue;
      const tuftX = x + (signature % 47) - 23;
      const tuftY = y + ((signature * 5) % 39) - 19;
      const height = 5 + signature % 5;
      context.strokeStyle = signature % 2 === 0 ? "#263d2859" : "#92aa6e4d";
      context.beginPath();
      context.moveTo(tuftX, tuftY);
      context.lineTo(tuftX - 3, tuftY - height);
      context.moveTo(tuftX, tuftY);
      context.lineTo(tuftX + 1, tuftY - height - 2);
      context.moveTo(tuftX, tuftY);
      context.lineTo(tuftX + 4, tuftY - height + 1);
      context.stroke();
    }
  }
  context.restore();
}

function drawCrystalRemnants(visibleBounds) {
  const spacing = 220;
  const firstX = Math.max(50, Math.floor(visibleBounds.left / spacing) * spacing + 70);
  const firstY = Math.max(50, Math.floor(visibleBounds.top / spacing) * spacing + 70);
  for (let y = firstY; y <= visibleBounds.bottom; y += spacing) {
    for (let x = firstX; x <= visibleBounds.right; x += spacing) {
      const signature = Math.abs(Math.floor(x / spacing) * 37 + Math.floor(y / spacing) * 61);
      if (signature % 4 === 0) continue;
      const shardX = x + (signature % 53) - 26;
      const shardY = y + ((signature * 7) % 47) - 23;
      const shardCount = signature % 5 === 0 ? 2 : 1;
      for (let shard = 0; shard < shardCount; shard += 1) {
        drawCrystalShard(
          shardX + shard * 8,
          shardY + shard * 3,
          3 + ((signature + shard) % 4),
          (signature + shard * 19) * 0.08,
          { alpha: 0.22 },
        );
      }
    }
  }
}

function drawCrystalShard(x, y, size, rotation = 0, { alpha = 1, rich = false } = {}) {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.globalAlpha *= alpha;
  if (alpha > 0.5) {
    context.shadowColor = rich ? "#ff7587" : "#df2648";
    context.shadowBlur = rich ? 12 : 7;
  }
  context.fillStyle = rich ? "#ff6379" : "#ca2947";
  context.strokeStyle = rich ? "#ffd0d5" : "#f17a88";
  context.lineWidth = Math.max(0.75, size * 0.12);
  context.beginPath();
  context.moveTo(0, -size * 1.35);
  context.lineTo(size * 0.58, -size * 0.18);
  context.lineTo(size * 0.28, size);
  context.lineTo(-size * 0.36, size * 0.78);
  context.lineTo(-size * 0.6, -size * 0.12);
  context.closePath();
  context.fill();
  context.stroke();
  context.strokeStyle = rich ? "#fff0f2aa" : "#ffacb566";
  context.beginPath();
  context.moveTo(0, -size * 1.2);
  context.lineTo(-size * 0.08, size * 0.65);
  context.stroke();
  context.restore();
}

function drawPlacementPreview() {
  if (!placementCursor) return;
  if (testerSpawnPlacement?.kind === "unit") {
    const definition = UNIT_DEFINITIONS[testerSpawnPlacement.type];
    const placement = simulation.evaluateUnitPlacement(
      testerSpawnPlacement.type,
      placementCursor.x,
      placementCursor.y,
    );
    const previewColor = placement.valid
      ? teamPalette(testerSpawnPlacement.team).bright
      : colors.disconnected;
    context.save();
    context.translate(placement.x, placement.y);
    context.fillStyle = `${previewColor}32`;
    context.strokeStyle = previewColor;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(0, 0, definition.radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
    const teamName = simulation.teams.find((team) => team.id === testerSpawnPlacement.team)?.name;
    drawLabel(
      placement.x,
      placement.y + definition.radius + 22,
      placement.valid
        ? `${teamName} · ${definition.name}`
        : placement.reason,
      true,
      previewColor,
    );
    return;
  }

  const activePlacement = activeStructurePlacement();
  if (!activePlacement) return;
  const { structureType, team } = activePlacement;
  const definition = STRUCTURE_DEFINITIONS[structureType];
  const footprint = structureFootprint(structureType);
  const placement = simulation.evaluatePlacement(
    structureType,
    placementCursor.x,
    placementCursor.y,
    team,
  );
  const previewColor = placement.valid
    ? activePlacement.testerSpawn ? teamPalette(team).bright : colors.health
    : colors.disconnected;
  const powerCoverageRadius = definition.powerRadius || definition.relayRadius || 0;

  if (powerCoverageRadius > 0) {
    drawPowerCoverage(
      structureType,
      placement.x,
      placement.y,
      placement.valid ? colors.energy : colors.disconnected,
      true,
    );
    const coverage = powerCoverageBounds(structureType, placement.x, placement.y);
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
    structureType,
    team,
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

function drawCrystalDeposits() {
  const placement = activeStructurePlacement();
  const occupiedIds = new Set(
    simulation.structures
      .filter(
        (structure) =>
          structure.alive && STRUCTURE_DEFINITIONS[structure.type].metalRate && structure.depositId,
      )
      .map((structure) => structure.depositId),
  );
  for (const deposit of simulation.metalDeposits) {
    if (!worldPointIsVisible(deposit.x, deposit.y, 100)) continue;
    const available = !occupiedIds.has(deposit.id);
    const rich = Boolean(deposit.rich);
    const emphasized = Boolean(
      placement &&
      STRUCTURE_DEFINITIONS[placement.structureType].metalRate &&
      available,
    );
    context.save();
    context.translate(deposit.x, deposit.y);
    if (strategicViewActive(camera.zoom)) {
      const size = strategicIconWorldSize(camera.zoom, rich ? 5 : 3.5);
      context.fillStyle = rich ? "#ff7b8c" : "#d83452";
      context.strokeStyle = rich ? "#ffd2d8" : "#8e2439";
      context.lineWidth = strategicIconWorldSize(camera.zoom, 1);
      context.beginPath();
      context.moveTo(0, -size);
      context.lineTo(size, 0);
      context.lineTo(0, size);
      context.lineTo(-size, 0);
      context.closePath();
      context.fill();
      context.stroke();
      context.restore();
      continue;
    }
    context.strokeStyle = emphasized
      ? colors.selection
      : rich && available
        ? "#ff7183dd"
        : available
          ? "#d52f4d99"
          : "#5e343b55";
    context.fillStyle = emphasized ? "#f7e68d1c" : rich ? "#ff526b20" : "#bd264118";
    context.lineWidth = emphasized || rich ? 3 : 2;
    context.beginPath();
    context.arc(0, 0, rich ? 49 : 43, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    if (rich) {
      context.strokeStyle = "#ff718377";
      context.setLineDash([8, 7]);
      context.beginPath();
      context.arc(0, 0, 58, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
    }
    context.globalAlpha = available ? 1 : 0.28;
    const shards = rich
      ? [
        [-19, 10, 10, -0.34],
        [-7, -5, 15, -0.08],
        [10, 5, 12, 0.24],
        [21, 13, 8, 0.42],
        [5, 18, 7, 0.08],
      ]
      : [
        [-15, 11, 8, -0.34],
        [-4, -3, 12, -0.08],
        [11, 8, 9, 0.26],
        [20, 16, 6, 0.42],
      ];
    for (const [x, y, size, rotation] of shards) {
      drawCrystalShard(x, y, size, rotation, { rich });
    }
    context.restore();
    if (available) {
      drawLabel(
        deposit.x,
        deposit.y + (rich ? 70 : 57),
        rich
          ? `Rich Crimson Crystal Deposit · ${deposit.yieldMultiplier.toFixed(1)}× output`
          : deposit.cluster
            ? `${deposit.cluster} · Crimson Crystal Deposit`
            : "Crimson Crystal Deposit",
        true,
        emphasized ? colors.selection : rich ? "#ff8493" : "#df5267",
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
  const placement = activeStructurePlacement();
  if (placement) {
    for (const node of nodes) {
      if (node.team !== placement.team || !node.connected) continue;
      const definition = STRUCTURE_DEFINITIONS[node.type];
      const reach = definition.powerRadius || definition.relayRadius;
      if (reach && worldPointIsVisible(node.x, node.y, reach)) {
        drawPowerCoverage(node.type, node.x, node.y, colors.energy);
      }
    }
  }
  for (const link of simulation.powerLinks || []) {
    const from = simulation.getStructure(link.fromId);
    const to = simulation.getStructure(link.toId);
    if (!from?.alive || !to?.alive) continue;
    if (!worldRectIsVisible(
      Math.min(from.x, to.x),
      Math.min(from.y, to.y),
      Math.max(from.x, to.x),
      Math.max(from.y, to.y),
      20,
    )) continue;
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
    if (selectedStructureIds.has(node.id)) {
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
  const selectedFactories = getSelectedStructures().filter(
    (structure) => STRUCTURE_DEFINITIONS[structure.type].production && structure.rallyPoint,
  );
  for (const factory of selectedFactories) {
    context.save();
    context.strokeStyle = `${colors.selection}70`;
    context.lineWidth = 2;
    context.setLineDash([7, 7]);
    context.beginPath();
    context.moveTo(factory.x, factory.y);
    context.lineTo(factory.rallyPoint.x, factory.rallyPoint.y);
    context.stroke();
    context.restore();
  }
  const displayedRallyPoints = new Set();
  for (const factory of selectedFactories) {
    const rallyKey = `${factory.rallyPoint.x}:${factory.rallyPoint.y}`;
    if (displayedRallyPoints.has(rallyKey)) continue;
    displayedRallyPoints.add(rallyKey);
    drawDestination(factory.rallyPoint.x, factory.rallyPoint.y, colors.selection);
  }

  for (const unit of simulation.units) {
    if (!selectedUnitIds.has(unit.id) || !unit.alive || unit.carriedById) continue;
    const unitPosition = presentedPosition(unit);
    const buildTarget = simulation.getStructure(unit.buildTargetId);
    if (buildTarget?.alive && !buildTarget.complete) {
      context.save();
      context.strokeStyle = `${colors.crystal}80`;
      context.lineWidth = 2;
      context.setLineDash([5, 6]);
      context.beginPath();
      context.moveTo(unitPosition.x, unitPosition.y);
      context.lineTo(buildTarget.x, buildTarget.y);
      context.stroke();
      context.restore();
    }
    const repairTarget = simulation.getEntity(unit.repairTargetId);
    if (repairTarget?.alive) {
      const repairPosition = presentedPosition(repairTarget);
      context.save();
      context.strokeStyle = `${colors.health}90`;
      context.lineWidth = 2;
      context.setLineDash([4, 5]);
      context.beginPath();
      context.moveTo(unitPosition.x, unitPosition.y);
      context.lineTo(repairPosition.x, repairPosition.y);
      context.stroke();
      context.restore();
    }
    const productionAssistTarget = simulation.getStructure(unit.productionAssistTargetId);
    if (productionAssistTarget?.alive) {
      context.save();
      context.strokeStyle = `${colors.energy}90`;
      context.lineWidth = 2;
      context.setLineDash([4, 5]);
      context.beginPath();
      context.moveTo(unitPosition.x, unitPosition.y);
      context.lineTo(productionAssistTarget.x, productionAssistTarget.y);
      context.stroke();
      context.restore();
    }
    if (unit.moveTarget) {
      context.strokeStyle = `${colors.selection}45`;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(unitPosition.x, unitPosition.y);
      context.lineTo(unit.moveTarget.x, unit.moveTarget.y);
      context.stroke();
      drawDestination(unit.moveTarget.x, unit.moveTarget.y, colors.selection);
    }
    const indicatedTargets = new Map();
    const primaryTarget = simulation.getEntity(unit.attackTargetId);
    if (primaryTarget?.alive) indicatedTargets.set(primaryTarget.id, primaryTarget);
    for (const weaponSystem of unit.weaponSystems || []) {
      const target = simulation.getEntity(weaponSystem.targetId);
      if (target?.alive) indicatedTargets.set(target.id, target);
    }
    for (const target of indicatedTargets.values()) {
      const targetPosition = presentedPosition(target);
      context.strokeStyle = "#ef596466";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(unitPosition.x, unitPosition.y);
      context.lineTo(targetPosition.x, targetPosition.y);
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

function traceChamferedRect(x, y, width, height, chamfer = 5) {
  const cut = Math.min(chamfer, width / 4, height / 4);
  context.beginPath();
  context.moveTo(x + cut, y);
  context.lineTo(x + width - cut, y);
  context.lineTo(x + width, y + cut);
  context.lineTo(x + width, y + height - cut);
  context.lineTo(x + width - cut, y + height);
  context.lineTo(x + cut, y + height);
  context.lineTo(x, y + height - cut);
  context.lineTo(x, y + cut);
  context.closePath();
}

function structureMetalGradient(light = "#778184", middle = "#414c50", dark = "#222a2e") {
  const gradient = context.createLinearGradient(-70, -70, 70, 70);
  gradient.addColorStop(0, light);
  gradient.addColorStop(0.42, middle);
  gradient.addColorStop(1, dark);
  return gradient;
}

function drawRoofPanel(x, y, width, height, chamfer = 4) {
  context.save();
  context.translate(3, 4);
  context.fillStyle = "#080c0f75";
  traceChamferedRect(x, y, width, height, chamfer);
  context.fill();
  context.restore();
  context.fillStyle = structureMetalGradient();
  context.strokeStyle = "#11181b";
  context.lineWidth = 2;
  traceChamferedRect(x, y, width, height, chamfer);
  context.fill();
  context.stroke();
  context.strokeStyle = "#c4cdca45";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x + chamfer + 2, y + 2);
  context.lineTo(x + width - chamfer - 2, y + 2);
  context.moveTo(x + 2, y + chamfer + 2);
  context.lineTo(x + 2, y + height - chamfer - 2);
  context.stroke();
}

function drawFasteners(x, y, width, height, color = "#b8c0bd") {
  context.fillStyle = color;
  for (const [boltX, boltY] of [
    [x + 5, y + 5], [x + width - 5, y + 5],
    [x + 5, y + height - 5], [x + width - 5, y + height - 5],
  ]) {
    context.beginPath();
    context.arc(boltX, boltY, 1.4, 0, Math.PI * 2);
    context.fill();
  }
}

function drawHazardStripe(x, y, width, height) {
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.fillStyle = "#d2a43a";
  context.fillRect(x, y, width, height);
  context.strokeStyle = "#25231f";
  context.lineWidth = 4;
  for (let offset = -height; offset < width + height; offset += 9) {
    context.beginPath();
    context.moveTo(x + offset, y + height);
    context.lineTo(x + offset + height, y);
    context.stroke();
  }
  context.restore();
}

function drawStructureFoundation(footprint, teamColor, powered) {
  const x = -footprint.halfWidth + 4;
  const y = -footprint.halfHeight + 4;
  const width = footprint.width - 8;
  const height = footprint.height - 8;
  context.save();
  context.translate(6, 8);
  context.fillStyle = "#070b0d80";
  traceChamferedRect(x, y, width, height, 6);
  context.fill();
  context.restore();
  context.fillStyle = structureMetalGradient("#50595a", "#323b3d", "#1b2326");
  context.strokeStyle = powered ? teamColor : "#704d50";
  context.lineWidth = 3;
  traceChamferedRect(x, y, width, height, 6);
  context.fill();
  context.stroke();
  context.strokeStyle = "#101619";
  context.lineWidth = 2;
  traceChamferedRect(x + 5, y + 5, width - 10, height - 10, 4);
  context.stroke();
  drawFasteners(x, y, width, height, powered ? teamColor : "#74575a");
}

function drawConstructionFrame(footprint, teamColor) {
  const x = -footprint.halfWidth + 10;
  const y = -footprint.halfHeight + 10;
  const width = footprint.width - 20;
  const height = footprint.height - 20;
  context.fillStyle = "#171d20";
  context.fillRect(x, y, width, height);
  context.strokeStyle = teamColor;
  context.lineWidth = 2;
  for (let railX = x; railX <= x + width; railX += 20) {
    context.beginPath();
    context.moveTo(railX, y);
    context.lineTo(railX, y + height);
    context.stroke();
  }
  context.strokeStyle = "#c0b58a";
  context.strokeRect(x, y, width, height);
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x + width, y + height);
  context.moveTo(x + width, y);
  context.lineTo(x, y + height);
  context.stroke();
  drawHazardStripe(x, y + height - 6, width, 6);
}

function drawGeneratorBuilding(definition, footprint, powered, teamColor) {
  const size = Math.min(footprint.width, footprint.height);
  const housing = size * 0.68;
  drawRoofPanel(-housing / 2, -housing / 2, housing, housing, size * 0.07);
  context.fillStyle = "#20292d";
  context.strokeStyle = "#101619";
  for (const side of [-1, 1]) {
    context.fillRect(side * housing * 0.31 - 4, -housing * 0.3, 8, housing * 0.6);
    context.strokeRect(side * housing * 0.31 - 4, -housing * 0.3, 8, housing * 0.6);
  }
  const core = size * 0.19;
  context.fillStyle = "#121b20";
  context.strokeStyle = "#0c1215";
  context.lineWidth = 4;
  context.beginPath();
  context.arc(0, 0, core, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.strokeStyle = powered ? colors.energy : "#745357";
  context.lineWidth = Math.max(2, size * 0.03);
  context.beginPath();
  context.arc(0, 0, core * 0.7, 0, Math.PI * 2);
  context.stroke();
  for (let spoke = 0; spoke < 6; spoke += 1) {
    const angle = spoke * Math.PI / 3;
    context.beginPath();
    context.moveTo(Math.cos(angle) * core * 0.32, Math.sin(angle) * core * 0.32);
    context.lineTo(Math.cos(angle) * core * 0.95, Math.sin(angle) * core * 0.95);
    context.stroke();
  }
  context.fillStyle = powered ? "#c8f5ff" : "#5e4f52";
  context.beginPath();
  context.arc(0, 0, core * 0.25, 0, Math.PI * 2);
  context.fill();
  drawFasteners(-housing / 2, -housing / 2, housing, housing);
}

function drawBatteryBuilding(structure, definition, footprint, powered, teamColor) {
  const width = footprint.width * 0.7;
  const height = footprint.height * 0.72;
  drawRoofPanel(-width / 2, -height / 2, width, height, 4);
  const cells = (definition.buildTier || 1) + 1;
  const gap = Math.max(3, width * 0.035);
  const cellWidth = (width - gap * (cells + 1)) / cells;
  const ratio = Math.max(0, Math.min(1, structure.storedEnergy / definition.storageCapacity));
  for (let cell = 0; cell < cells; cell += 1) {
    const cellX = -width / 2 + gap + cell * (cellWidth + gap);
    const cellY = -height * 0.31;
    const cellHeight = height * 0.61;
    context.fillStyle = "#11191e";
    context.strokeStyle = "#090f12";
    context.fillRect(cellX, cellY, cellWidth, cellHeight);
    context.strokeRect(cellX, cellY, cellWidth, cellHeight);
    context.fillStyle = ratio > 0 ? `${colors.energy}b8` : "#594b4e";
    context.fillRect(cellX + 3, cellY + cellHeight - 3 - (cellHeight - 6) * ratio, cellWidth - 6, (cellHeight - 6) * ratio);
  }
  context.strokeStyle = powered ? teamColor : "#745357";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(-width * 0.36, -height * 0.38);
  context.lineTo(width * 0.36, -height * 0.38);
  context.stroke();
  drawFasteners(-width / 2, -height / 2, width, height);
}

function drawRelayBuilding(definition, footprint, powered, teamColor) {
  const size = Math.min(footprint.width, footprint.height);
  const base = size * 0.5;
  drawRoofPanel(-base / 2, -base / 2, base, base, base * 0.16);
  context.strokeStyle = "#11181b";
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(-base * 0.25, base * 0.3);
  context.lineTo(0, -size * 0.38);
  context.lineTo(base * 0.25, base * 0.3);
  context.stroke();
  context.strokeStyle = "#95a09d";
  context.lineWidth = 1.5;
  for (let brace = -0.22; brace <= 0.2; brace += 0.14) {
    const halfWidth = base * (0.08 + (brace + 0.22) * 0.38);
    context.beginPath();
    context.moveTo(-halfWidth, size * brace);
    context.lineTo(halfWidth, size * brace);
    context.stroke();
  }
  context.fillStyle = powered ? colors.energy : "#645053";
  context.strokeStyle = powered ? teamColor : "#745357";
  context.beginPath();
  context.ellipse(0, -size * 0.23, size * 0.17, size * 0.08, -0.25, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  for (let ring = 0; ring < (definition.buildTier || 1); ring += 1) {
    context.beginPath();
    context.arc(0, -size * 0.23, size * (0.1 + ring * 0.05), 0, Math.PI * 2);
    context.stroke();
  }
}

function drawChargerBuilding(footprint, powered, teamColor) {
  const size = Math.min(footprint.width, footprint.height);
  const platform = size * 0.72;
  drawRoofPanel(-platform / 2, -platform / 2, platform, platform, platform * 0.13);
  context.strokeStyle = "#b87940";
  context.lineWidth = Math.max(2, size * 0.025);
  for (let coil = 0; coil < 4; coil += 1) {
    const angle = coil * Math.PI / 2;
    const x = Math.cos(angle) * size * 0.26;
    const y = Math.sin(angle) * size * 0.26;
    context.beginPath();
    context.arc(x, y, size * 0.08, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(Math.cos(angle) * size * 0.1, Math.sin(angle) * size * 0.1);
    context.lineTo(x, y);
    context.stroke();
  }
  context.strokeStyle = powered ? colors.energy : "#735357";
  context.lineWidth = Math.max(2, size * 0.035);
  context.beginPath();
  context.arc(0, 0, size * 0.2, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = powered ? "#c4f3ff" : "#5d5052";
  context.strokeStyle = powered ? teamColor : "#745357";
  context.beginPath();
  context.arc(0, 0, size * 0.08, 0, Math.PI * 2);
  context.fill();
  context.stroke();
}

function drawCrystalHarvesterBuilding(definition, footprint, powered, teamColor) {
  const width = footprint.width * 0.74;
  const height = footprint.height * 0.72;
  drawRoofPanel(-width / 2, -height / 2, width, height, Math.min(width, height) * 0.13);
  context.fillStyle = "#0c0f10";
  context.strokeStyle = "#151918";
  context.lineWidth = 4;
  context.beginPath();
  context.ellipse(-width * 0.13, 0, width * 0.23, height * 0.28, -0.2, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.strokeStyle = powered ? teamColor : "#745357";
  context.lineWidth = 3;
  for (let tooth = 0; tooth < 6; tooth += 1) {
    const angle = tooth * Math.PI / 3;
    context.beginPath();
    context.moveTo(-width * 0.13 + Math.cos(angle) * width * 0.18, Math.sin(angle) * height * 0.21);
    context.lineTo(-width * 0.13 + Math.cos(angle) * width * 0.25, Math.sin(angle) * height * 0.29);
    context.stroke();
  }
  context.fillStyle = "#252c2e";
  context.strokeStyle = "#101619";
  context.fillRect(width * 0.02, -height * 0.11, width * 0.41, height * 0.22);
  context.strokeRect(width * 0.02, -height * 0.11, width * 0.41, height * 0.22);
  context.strokeStyle = "#929890";
  for (let roller = width * 0.06; roller < width * 0.4; roller += 8) {
    context.beginPath();
    context.moveTo(roller, -height * 0.09);
    context.lineTo(roller, height * 0.09);
    context.stroke();
  }
  for (let crystal = 0; crystal < (definition.buildTier || 1) + 2; crystal += 1) {
    drawCrystalShard(
      width * 0.3 + (crystal % 2) * 6,
      -height * 0.2 + Math.floor(crystal / 2) * 6,
      3.5,
      crystal * 0.22,
      { rich: definition.buildTier >= 3 },
    );
  }
}

function drawFactoryBuilding(structure, definition, footprint, powered, teamColor) {
  const width = footprint.width * 0.82;
  const height = footprint.height * 0.8;
  drawRoofPanel(-width / 2, -height / 2, width, height, Math.min(width, height) * 0.07);
  const branch = definition.factoryBranch || "mech";
  const bayWidth = width * (branch === "air" ? 0.56 : 0.48);
  const bayHeight = height * 0.62;
  context.fillStyle = "#0b1215";
  context.strokeStyle = "#10181b";
  context.lineWidth = 3;
  context.fillRect(-bayWidth / 2, -bayHeight * 0.34, bayWidth, bayHeight);
  context.strokeRect(-bayWidth / 2, -bayHeight * 0.34, bayWidth, bayHeight);
  context.fillStyle = "#303a3e";
  for (let door = 0; door < 5; door += 1) {
    context.fillRect(-bayWidth / 2 + 3, -bayHeight * 0.31 + door * bayHeight * 0.12, bayWidth - 6, 2);
  }
  drawHazardStripe(-bayWidth / 2, bayHeight * 0.61, bayWidth, Math.max(5, height * 0.045));

  context.strokeStyle = powered ? teamColor : "#745357";
  context.lineWidth = 3;
  if (branch === "vehicle") {
    for (const trackX of [-bayWidth * 0.24, bayWidth * 0.24]) {
      context.beginPath();
      context.moveTo(trackX, -bayHeight * 0.25);
      context.lineTo(trackX, bayHeight * 0.55);
      context.stroke();
    }
  } else if (branch === "air") {
    context.setLineDash([7, 6]);
    context.beginPath();
    context.moveTo(0, -bayHeight * 0.26);
    context.lineTo(0, bayHeight * 0.55);
    context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(-bayWidth * 0.28, bayHeight * 0.15);
    context.lineTo(0, -bayHeight * 0.05);
    context.lineTo(bayWidth * 0.28, bayHeight * 0.15);
    context.stroke();
  } else if (branch === "experimental") {
    context.fillStyle = powered ? `${colors.energy}70` : "#4e4145";
    context.lineWidth = 4;
    context.beginPath();
    context.arc(0, bayHeight * 0.05, Math.min(bayWidth, bayHeight) * 0.24, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  } else {
    for (const side of [-1, 1]) {
      context.strokeRect(side * bayWidth * 0.23 - 6, -bayHeight * 0.12, 12, bayHeight * 0.38);
      context.beginPath();
      context.arc(side * bayWidth * 0.23, bayHeight * 0.08, 4, 0, Math.PI * 2);
      context.stroke();
    }
  }

  const vents = Math.max(2, (definition.tier || 1) + 1);
  context.fillStyle = "#192226";
  context.strokeStyle = "#0b1114";
  for (let vent = 0; vent < vents; vent += 1) {
    const ventX = (vent - (vents - 1) / 2) * Math.min(24, width / (vents + 1));
    context.fillRect(ventX - 7, -height * 0.43, 14, 7);
    context.strokeRect(ventX - 7, -height * 0.43, 14, 7);
  }
  drawFasteners(-width / 2, -height / 2, width, height);
}

function drawSupplyComplexBuilding(structure, footprint, powered, teamColor) {
  const width = footprint.width * 0.9;
  const height = footprint.height * 0.84;
  drawRoofPanel(-width / 2, -height / 2, width, height, 9);
  const warehouseWidth = width * 0.19;
  for (let column = -1; column <= 1; column += 1) {
    const x = column * width * 0.27 - warehouseWidth / 2;
    drawRoofPanel(x, -height * 0.35, warehouseWidth, height * 0.52, 3);
    context.strokeStyle = "#172025";
    for (let seam = 1; seam < 4; seam += 1) {
      const seamY = -height * 0.35 + seam * height * 0.13;
      context.beginPath();
      context.moveTo(x + 3, seamY);
      context.lineTo(x + warehouseWidth - 3, seamY);
      context.stroke();
    }
  }
  context.fillStyle = "#151e22";
  context.strokeStyle = "#0a1114";
  for (const tankX of [-width * 0.34, width * 0.34]) {
    context.beginPath();
    context.ellipse(tankX, height * 0.29, width * 0.08, height * 0.13, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.strokeStyle = "#8d9895";
    context.beginPath();
    context.arc(tankX, height * 0.29, width * 0.055, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = "#0a1114";
  }
  const level = structure.supplyLevel || 1;
  context.fillStyle = powered ? colors.energy : "#6e5559";
  for (let marker = 0; marker < level; marker += 1) {
    context.fillRect((marker - (level - 1) / 2) * 18 - 5, height * 0.26, 10, 10);
  }
  context.strokeStyle = powered ? teamColor : "#745357";
  context.lineWidth = 3;
  context.strokeRect(-width * 0.13, height * 0.18, width * 0.26, height * 0.24);
  drawHazardStripe(-width * 0.13, height * 0.37, width * 0.26, 6);
}

function drawSentryBuilding(structure, definition, footprint, powered, teamColor) {
  const size = Math.min(footprint.width, footprint.height);
  const base = size * 0.31;
  context.fillStyle = structureMetalGradient();
  context.strokeStyle = "#10171a";
  context.lineWidth = 3;
  polygon(8, base, Math.PI / 8);
  context.fill();
  context.stroke();
  context.strokeStyle = powered ? teamColor : "#745357";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(0, 0, base * 0.72, 0, Math.PI * 2);
  context.stroke();
  const target = presentedEntity(simulation.getEntity(structure.defenseTargetId));
  if (target?.alive) context.rotate(Math.atan2(target.y - structure.y, target.x - structure.x));
  context.fillStyle = "#273236";
  context.strokeStyle = "#10171a";
  context.beginPath();
  context.ellipse(0, 0, base * 0.64, base * 0.47, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  const firingAge = recentAttackAge(structure.id);
  const recoil = firingAge === null ? 0 : Math.sin((firingAge / 0.18) * Math.PI) * size * 0.08;
  const barrels = (definition.buildTier || 1) >= 2 ? [-4, 4] : [0];
  for (const barrelY of barrels) {
    const barrelLength = size * 0.42 - recoil;
    context.fillStyle = "#303b3f";
    context.fillRect(base * 0.2, barrelY - 2.5, barrelLength, 5);
    context.strokeRect(base * 0.2, barrelY - 2.5, barrelLength, 5);
    context.fillStyle = "#080c0e";
    context.fillRect(base * 0.2 + barrelLength - 3, barrelY - 3.5, 5, 7);
  }
  context.fillStyle = powered ? colors.energy : "#645053";
  context.fillRect(-base * 0.42, -3, base * 0.35, 6);
}

function drawShieldTurretBuilding(structure, definition, footprint, powered, teamColor) {
  const size = Math.min(footprint.width, footprint.height);
  const base = size * 0.31;
  const tier = definition.buildTier || 1;
  context.fillStyle = structureMetalGradient();
  context.strokeStyle = "#10171a";
  context.lineWidth = 3;
  polygon(8, base, Math.PI / 8);
  context.fill();
  context.stroke();

  context.strokeStyle = powered ? teamColor : "#745357";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(0, 0, base * 0.72, 0, Math.PI * 2);
  context.stroke();

  const strengthRatio = structure.shieldStrength / definition.shieldCapacity;
  context.fillStyle = "#202a2f";
  context.strokeStyle = "#0c1114";
  context.lineWidth = 3;
  const armCount = tier === 1 ? 4 : tier === 2 ? 6 : 8;
  for (let arm = 0; arm < armCount; arm += 1) {
    context.save();
    context.rotate(arm * Math.PI * 2 / armCount);
    context.fillRect(base * 0.1, -base * 0.11, base * 0.55, base * 0.22);
    context.strokeRect(base * 0.1, -base * 0.11, base * 0.55, base * 0.22);
    context.restore();
  }

  context.fillStyle = powered && strengthRatio > 0 ? colors.shield : "#62565b";
  context.shadowColor = powered ? colors.shield : "transparent";
  context.shadowBlur = powered ? 10 + strengthRatio * 8 : 0;
  context.beginPath();
  context.arc(0, 0, base * (0.26 + tier * 0.04), 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = powered ? `${colors.shield}cc` : "#745357";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(0, 0, base * (0.42 + strengthRatio * 0.08), 0, Math.PI * 2);
  context.stroke();
}

function drawMortarBuilding(structure, definition, footprint, powered, teamColor) {
  const size = Math.min(footprint.width, footprint.height);
  const base = size * 0.3;
  context.fillStyle = structureMetalGradient();
  context.strokeStyle = "#10171a";
  context.lineWidth = 3;
  polygon(8, base, Math.PI / 8);
  context.fill();
  context.stroke();
  context.strokeStyle = powered ? teamColor : "#745357";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(0, 0, base * 0.72, 0, Math.PI * 2);
  context.stroke();

  const target = presentedEntity(simulation.getEntity(structure.defenseTargetId));
  if (target?.alive) context.rotate(Math.atan2(target.y - structure.y, target.x - structure.x));
  const firingAge = recentAttackAge(structure.id);
  const recoil = firingAge === null ? 0 : Math.sin((firingAge / 0.18) * Math.PI) * size * 0.06;
  context.fillStyle = "#202a2e";
  context.strokeStyle = "#0c1113";
  context.lineWidth = 3;
  context.beginPath();
  context.ellipse(-base * 0.08, 0, base * 0.56, base * 0.46, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  const tubeLength = size * 0.48 - recoil;
  const tubeWidth = Math.max(8, size * 0.13);
  context.fillStyle = "#39464a";
  context.fillRect(-base * 0.05, -tubeWidth / 2, tubeLength, tubeWidth);
  context.strokeRect(-base * 0.05, -tubeWidth / 2, tubeLength, tubeWidth);
  context.fillStyle = "#070b0d";
  context.beginPath();
  context.ellipse(tubeLength - base * 0.05, 0, tubeWidth * 0.34, tubeWidth * 0.62, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = powered ? colors.energy : "#645053";
  context.lineWidth = 2;
  for (const offset of [0.15, 0.3]) {
    context.beginPath();
    context.moveTo(tubeLength * offset, -tubeWidth / 2);
    context.lineTo(tubeLength * offset, tubeWidth / 2);
    context.stroke();
  }
}

function drawFlakBuilding(structure, definition, footprint, powered, teamColor) {
  const size = Math.min(footprint.width, footprint.height);
  const base = size * 0.31;
  context.fillStyle = structureMetalGradient();
  context.strokeStyle = "#10171a";
  context.lineWidth = 3;
  polygon(8, base, Math.PI / 8);
  context.fill();
  context.stroke();
  context.strokeStyle = powered ? teamColor : "#745357";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(0, 0, base * 0.72, 0, Math.PI * 2);
  context.stroke();

  const target = presentedEntity(simulation.getEntity(structure.defenseTargetId));
  if (target?.alive) context.rotate(Math.atan2(target.y - structure.y, target.x - structure.x));
  context.fillStyle = "#273236";
  context.strokeStyle = "#10171a";
  context.beginPath();
  context.roundRect(-base * 0.52, -base * 0.42, base * 1.04, base * 0.84, base * 0.18);
  context.fill();
  context.stroke();

  const firingAge = recentAttackAge(structure.id);
  const recoil = firingAge === null ? 0 : Math.sin((firingAge / 0.18) * Math.PI) * size * 0.045;
  const barrelOffsets = (definition.buildTier || 1) >= 2 ? [-7, -2.5, 2.5, 7] : [-3, 3];
  for (const barrelY of barrelOffsets) {
    const barrelLength = size * 0.34 - recoil;
    context.fillStyle = "#344247";
    context.fillRect(base * 0.16, barrelY - 1.8, barrelLength, 3.6);
    context.strokeRect(base * 0.16, barrelY - 1.8, barrelLength, 3.6);
    context.fillStyle = "#080c0e";
    context.fillRect(base * 0.16 + barrelLength - 2, barrelY - 2.5, 4, 5);
  }
  context.fillStyle = powered ? colors.energy : "#645053";
  context.beginPath();
  context.arc(-base * 0.19, 0, base * 0.13, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = powered ? colors.energy : "#645053";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(-base * 0.31, -base * 0.52, base * 0.2, Math.PI * 0.15, Math.PI * 0.85);
  context.stroke();
}

function drawSalvageYardBuilding(definition, footprint, powered, teamColor) {
  const width = footprint.width * 0.82;
  const height = footprint.height * 0.78;
  drawRoofPanel(-width / 2, -height / 2, width, height, 6);
  context.fillStyle = "#171c1b";
  context.strokeStyle = "#0c1110";
  for (const side of [-1, 1]) {
    context.fillRect(side * width * 0.22 - width * 0.15, height * 0.08, width * 0.3, height * 0.24);
    context.strokeRect(side * width * 0.22 - width * 0.15, height * 0.08, width * 0.3, height * 0.24);
  }
  for (let scrap = 0; scrap < 10 + (definition.buildTier || 1) * 3; scrap += 1) {
    const side = scrap % 2 === 0 ? -1 : 1;
    drawCrystalShard(
      side * width * (0.14 + (scrap % 3) * 0.035),
      height * (0.13 + (scrap % 4) * 0.045),
      2.5 + (scrap % 3),
      scrap * 0.31,
      { alpha: 0.82, rich: scrap % 5 === 0 },
    );
  }
  context.strokeStyle = "#171f20";
  context.lineWidth = 6;
  context.beginPath();
  context.moveTo(-width * 0.37, height * 0.24);
  context.lineTo(-width * 0.37, -height * 0.32);
  context.lineTo(width * 0.23, -height * 0.32);
  context.stroke();
  context.strokeStyle = powered ? teamColor : "#745357";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(-width * 0.37, -height * 0.26);
  context.lineTo(width * 0.23, -height * 0.26);
  context.stroke();
  context.strokeStyle = colors.crystal;
  context.beginPath();
  context.moveTo(width * 0.18, -height * 0.27);
  context.lineTo(width * 0.18, -height * 0.02);
  context.stroke();
  context.fillStyle = "#292f2e";
  context.beginPath();
  context.arc(width * 0.18, 0, 7, 0, Math.PI * 2);
  context.fill();
}

function drawHeadquartersBuilding(structure, footprint, powered, teamColor) {
  const width = footprint.width * 0.78;
  const height = footprint.height * 0.72;
  context.fillStyle = structureMetalGradient();
  context.strokeStyle = "#10171a";
  context.lineWidth = 4;
  context.beginPath();
  context.roundRect(-width / 2, -height / 2, width, height, 12);
  context.fill();
  context.stroke();

  context.fillStyle = "#18252b";
  context.strokeStyle = teamColor;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(0, -height * 0.36);
  context.lineTo(width * 0.3, 0);
  context.lineTo(0, height * 0.36);
  context.lineTo(-width * 0.3, 0);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = powered ? colors.energy : "#6b5558";
  context.shadowColor = powered ? colors.energy : "transparent";
  context.shadowBlur = powered ? 14 : 0;
  context.beginPath();
  context.arc(0, 0, Math.min(width, height) * 0.13, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;

  context.fillStyle = teamColor;
  for (const side of [-1, 1]) {
    context.fillRect(side * width * 0.35 - 5, -height * 0.34, 10, height * 0.68);
  }
  drawFasteners(0, 0, width * 0.86, height * 0.78, powered ? colors.energy : "#70797b");
}

function drawCompletedBuilding(structure, definition, footprint, family, powered, teamColor) {
  if (family === "headquarters") drawHeadquartersBuilding(structure, footprint, powered, teamColor);
  else if (family === "generator") drawGeneratorBuilding(definition, footprint, powered, teamColor);
  else if (family === "battery") drawBatteryBuilding(structure, definition, footprint, powered, teamColor);
  else if (family === "power_tower") drawRelayBuilding(definition, footprint, powered, teamColor);
  else if (family === "charger") drawChargerBuilding(footprint, powered, teamColor);
  else if (family === "metal_mine") drawCrystalHarvesterBuilding(definition, footprint, powered, teamColor);
  else if (family === "factory") drawFactoryBuilding(structure, definition, footprint, powered, teamColor);
  else if (family === "supply_complex") drawSupplyComplexBuilding(structure, footprint, powered, teamColor);
  else if (family === "sentry_turret") drawSentryBuilding(structure, definition, footprint, powered, teamColor);
  else if (family === "shield_turret") drawShieldTurretBuilding(structure, definition, footprint, powered, teamColor);
  else if (family === "mortar_turret") drawMortarBuilding(structure, definition, footprint, powered, teamColor);
  else if (family === "flak_turret") drawFlakBuilding(structure, definition, footprint, powered, teamColor);
  else if (family === "salvage_yard") drawSalvageYardBuilding(definition, footprint, powered, teamColor);
}

function drawStructure(structure) {
  const definition = STRUCTURE_DEFINITIONS[structure.type];
  const family = definition.family;
  const footprint = structureFootprint(structure.type);
  const teamColor = teamPalette(structure.team).bright;
  context.save();
  context.translate(structure.x, structure.y);
  context.globalAlpha = structure.complete ? 1 : 0.58;

  if (selectedStructureIds.has(structure.id)) {
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

  if (definition.capacitorCapacity && selectedStructureIds.has(structure.id)) {
    context.strokeStyle = "#ef596455";
    context.lineWidth = 2;
    context.setLineDash([7, 9]);
    context.beginPath();
    context.arc(0, 0, definition.attackRange, 0, Math.PI * 2);
    context.stroke();
    if (definition.minimumAttackRange) {
      context.strokeStyle = "#ffc46b88";
      context.fillStyle = "#ffc46b0b";
      context.beginPath();
      context.arc(0, 0, definition.minimumAttackRange, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
    context.setLineDash([]);
  }

  drawStructureFoundation(footprint, teamColor, structure.powered);
  if (structure.complete) {
    drawCompletedBuilding(
      structure,
      definition,
      footprint,
      family,
      structure.powered,
      teamColor,
    );
  } else {
    drawConstructionFrame(footprint, teamColor);
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
  if (definition.shieldCapacity && structure.complete) {
    drawBar(
      structure.x,
      structure.y - footprint.halfHeight - 17,
      structureBarWidth,
      structure.shieldStrength / definition.shieldCapacity,
      colors.shield,
    );
  }
  if (!structure.complete) {
    drawBar(
      structure.x,
      structure.y - footprint.halfHeight - 5,
      structureBarWidth,
      structure.constructionProgress / definition.buildTime,
      colors.crystal,
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
      assignedBuilders > 0 ? colors.crystal : colors.stasis,
    );
  } else if (definition.storageCapacity) {
    drawBar(
      structure.x,
      structure.y - footprint.halfHeight - 5,
      structureBarWidth,
      structure.storedEnergy / definition.storageCapacity,
      structure.powerStatus === "discharging" ? "#bdaaff" : colors.energy,
    );
  } else if (definition.capacitorCapacity) {
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
  } else if (
    structure.complete &&
    definition.capacitorCapacity &&
    selectedStructureIds.has(structure.id)
  ) {
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
  const activeRepairTarget = getActiveRepairTarget(unit);
  const displayedRepairTarget = presentedEntity(activeRepairTarget);
  const activeProductionAssistTarget = getActiveProductionAssistTarget(unit);

  if (definition.underbellyBeamRadius) {
    drawZenithUnderbellyBeam(unit, definition, selected);
  }

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
      const targetPosition = presentedPosition(target);
      context.beginPath();
      context.moveTo(unit.x, unit.y);
      context.lineTo(targetPosition.x, targetPosition.y);
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
  const pose = getUnitRenderPose(
    unit,
    activeBuildTarget,
    displayedRepairTarget,
    activeProductionAssistTarget,
  );
  context.rotate(pose.facing);
  context.translate(0, pose.recoil * definition.radius);
  drawUnitSprite(definition, teamColor, darkColor, unit.state === "stasis", pose);
  context.restore();

  if (activeBuildTarget) {
    drawWorkerConstructionEffect(unit, activeBuildTarget, pose, teamColor);
  } else if (displayedRepairTarget) {
    drawWorkerRepairEffect(unit, displayedRepairTarget, pose, teamColor);
  } else if (activeProductionAssistTarget) {
    drawWorkerConstructionEffect(unit, activeProductionAssistTarget, pose, teamColor);
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

function getActiveRepairTarget(unit) {
  const definition = UNIT_DEFINITIONS[unit.type];
  const repairTarget = simulation.getEntity(unit.repairTargetId);
  if (
    !definition.workerTier ||
    unit.state !== "active" ||
    !repairTarget?.alive ||
    !["unit", "structure"].includes(repairTarget.kind) ||
    repairTarget.id === unit.id ||
    repairTarget.team !== unit.team ||
    (repairTarget.kind === "structure" && !repairTarget.complete) ||
    repairTarget.hp >= maximumEntityHp(repairTarget)
  ) {
    return null;
  }
  if (repairTarget.kind === "structure") {
    const footprint = structureFootprint(repairTarget.type);
    const deltaX = Math.max(Math.abs(unit.x - repairTarget.x) - footprint.halfWidth, 0);
    const deltaY = Math.max(Math.abs(unit.y - repairTarget.y) - footprint.halfHeight, 0);
    return Math.hypot(deltaX, deltaY) <= definition.repairRange + 0.001
      ? repairTarget
      : null;
  }
  const separation = Math.max(
    0,
    Math.hypot(unit.x - repairTarget.x, unit.y - repairTarget.y) -
      UNIT_DEFINITIONS[repairTarget.type].radius,
  );
  return separation <= definition.repairRange + 0.001 ? repairTarget : null;
}

function getActiveProductionAssistTarget(unit) {
  const definition = UNIT_DEFINITIONS[unit.type];
  const factory = simulation.getStructure(unit.productionAssistTargetId);
  const order = factory?.productionQueue?.[0];
  const unitDefinition = order ? UNIT_DEFINITIONS[order.unitType] : null;
  if (
    !definition.workerTier ||
    unit.state !== "active" ||
    !factory?.alive ||
    !factory.complete ||
    !factory.powered ||
    factory.team !== unit.team ||
    !STRUCTURE_DEFINITIONS[factory.type].production ||
    !unitDefinition ||
    order.progress >= unitDefinition.productionTime
  ) {
    return null;
  }
  const footprint = structureFootprint(factory.type);
  const deltaX = Math.max(Math.abs(unit.x - factory.x) - footprint.halfWidth, 0);
  const deltaY = Math.max(Math.abs(unit.y - factory.y) - footprint.halfHeight, 0);
  return Math.hypot(deltaX, deltaY) <= SIMULATION_RULES.workerProductionAssistRange + 0.001
    ? factory
    : null;
}

function getUnitRenderPose(
  unit,
  activeBuildTarget = null,
  activeRepairTarget = null,
  activeProductionAssistTarget = null,
) {
  const attackTarget = presentedEntity(simulation.getEntity(unit.attackTargetId));
  const buildTarget = simulation.getStructure(unit.buildTargetId);
  const repairTarget = presentedEntity(simulation.getEntity(unit.repairTargetId));
  const productionAssistTarget = simulation.getStructure(unit.productionAssistTargetId);
  const transferTarget = unit.energyTransferTargetIds?.length
    ? presentedEntity(simulation.getUnit(unit.energyTransferTargetIds[0]))
    : null;
  const target = attackTarget?.alive
    ? attackTarget
    : unit.moveTarget ||
      (buildTarget?.alive ? buildTarget : null) ||
      (repairTarget?.alive ? repairTarget : null) ||
      (productionAssistTarget?.alive ? productionAssistTarget : null) ||
      (transferTarget?.alive ? transferTarget : null);
  const start = simulation.teamStarts[unit.team];
  const fallbackFacing = start
    ? Math.atan2(start.inwardY, start.inwardX) + Math.PI / 2
    : unit.team === "player" ? Math.PI / 2 : -Math.PI / 2;
  const facing = target
    ? Math.atan2(target.y - unit.y, target.x - unit.x) + Math.PI / 2
    : fallbackFacing;
  const moving =
    unit.state === "active" &&
    Boolean(
      unit.moveTarget ||
      (repairTarget?.alive && !activeRepairTarget) ||
      (productionAssistTarget?.alive && !activeProductionAssistTarget)
    ) &&
    !simulation.isUnitStoppedToAttack(unit);
  const phase = [...unit.id].reduce((total, character) => total + character.charCodeAt(0), 0) * 0.31;
  const firingAge = recentAttackAge(unit.id);
  const weaponSystemFacings = (unit.weaponSystems || []).map((weaponSystem) => {
    const weaponTarget = presentedEntity(simulation.getEntity(weaponSystem.targetId));
    if (!weaponTarget?.alive) return 0;
    const targetFacing = Math.atan2(weaponTarget.y - unit.y, weaponTarget.x - unit.x) + Math.PI / 2;
    return Math.atan2(Math.sin(targetFacing - facing), Math.cos(targetFacing - facing));
  });
  const weaponSystemRecoils = (unit.weaponSystems || []).map((weaponSystem, index) => {
    const weaponFiringAge = recentAttackAge(unit.id, index);
    return weaponFiringAge === null
      ? 0
      : Math.sin((weaponFiringAge / 0.18) * Math.PI) * 0.12;
  });
  return {
    facing,
    moving,
    building: Boolean(
      activeBuildTarget || activeRepairTarget || activeProductionAssistTarget
    ),
    workCycle: Math.sin(simulation.time * 13 + phase),
    phase,
    stride: moving ? Math.sin(simulation.time * 9 + phase) : 0,
    landshipStep: moving ? (simulation.time * 0.58 + phase * 0.013) % 1 : null,
    recoil: unit.weaponSystems?.length || firingAge === null
      ? 0
      : Math.sin((firingAge / 0.18) * Math.PI) * 0.12,
    weaponSystemFacings,
    weaponSystemRecoils,
  };
}

function drawWorkerRepairEffect(unit, target, pose, teamColor) {
  const definition = UNIT_DEFINITIONS[unit.type];
  const deltaX = target.x - unit.x;
  const deltaY = target.y - unit.y;
  const length = Math.hypot(deltaX, deltaY);
  const directionX = length > 0.0001 ? deltaX / length : 0;
  const directionY = length > 0.0001 ? deltaY / length : -1;
  let targetBoundaryDistance = target.kind === "unit"
    ? UNIT_DEFINITIONS[target.type].radius
    : 0;
  if (target.kind === "structure") {
    const footprint = structureFootprint(target.type);
    targetBoundaryDistance = Math.min(
      Math.abs(directionX) > 0.0001 ? footprint.halfWidth / Math.abs(directionX) : Infinity,
      Math.abs(directionY) > 0.0001 ? footprint.halfHeight / Math.abs(directionY) : Infinity,
    );
  }
  const start = {
    x: unit.x + directionX * definition.radius * 0.75,
    y: unit.y + directionY * definition.radius * 0.75,
  };
  const impact = {
    x: target.x - directionX * targetBoundaryDistance,
    y: target.y - directionY * targetBoundaryDistance,
  };
  const pulse = 0.5 + Math.sin(simulation.time * 15 + pose.phase) * 0.5;

  context.save();
  const beam = context.createLinearGradient(start.x, start.y, impact.x, impact.y);
  beam.addColorStop(0, `${teamColor}75`);
  beam.addColorStop(0.65, `${colors.health}d0`);
  beam.addColorStop(1, "#d9ffe8f0");
  context.strokeStyle = beam;
  context.lineWidth = 1.4 + pulse;
  context.setLineDash([3, 2]);
  context.lineDashOffset = -simulation.time * 20;
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(impact.x, impact.y);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = colors.health;
  context.globalAlpha = 0.65 + pulse * 0.35;
  context.beginPath();
  context.arc(impact.x, impact.y, 2 + pulse * 1.4, 0, Math.PI * 2);
  context.fill();
  context.restore();
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
    context.strokeStyle = index % 2 === 0 ? "#ffe29a" : colors.crystal;
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
  const circularAircraft = definition.role === "zenith_doughnut";
  context.save();
  context.translate(airborne ? 7 : 3, airborne ? 10 : 5);
  context.fillStyle = airborne ? "#10151038" : "#10151070";
  context.beginPath();
  context.ellipse(
    0,
    0,
    definition.radius * (airborne ? 1.05 : 0.86),
    definition.radius * (circularAircraft ? 0.94 : airborne ? 0.58 : 0.62),
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
  if (definition.role === "arsenal_colossus") {
    drawArsenalColossusSprite(definition, teamColor, stasis, pose);
    return;
  }
  if (definition.role === "hexapod_landship") {
    drawHexapodLandshipSprite(definition, teamColor, stasis, pose);
    return;
  }
  if (definition.role === "zenith_doughnut") {
    drawZenithDoughnutSprite(definition, teamColor, stasis);
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

function experimentalUnitPalette(teamColor, stasis) {
  return {
    outline: stasis ? "#26231f" : "#151c21",
    armor: stasis ? "#5f594f" : "#889397",
    armorLight: stasis ? "#777064" : "#c5ccca",
    armorDark: stasis ? "#3d3932" : "#414d52",
    joint: stasis ? "#302d28" : "#222b30",
    accent: stasis ? `${teamColor}88` : teamColor,
    energy: stasis ? "#655e4e" : colors.energy,
  };
}

function drawArsenalColossusSprite(definition, teamColor, stasis, pose) {
  const palette = experimentalUnitPalette(teamColor, stasis);
  context.save();
  context.scale(definition.radius, definition.radius);
  context.lineCap = "round";
  context.lineJoin = "round";

  // Like conventional mechs, the Colossus carries its walking assembly beneath
  // the hull. Only compact rear actuator and foot tips emerge while it moves;
  // fully extended legs made the overhead sprite read like a side-view figure.
  if (pose.moving) {
    for (const side of [-1, 1]) {
      const step = Math.max(0, side * pose.stride);
      const footY = 0.5 + step * 0.2;
      context.fillStyle = "#080c0f70";
      context.beginPath();
      context.ellipse(side * 0.34, footY + 0.22, 0.2, 0.1, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = palette.armorDark;
      context.strokeStyle = palette.outline;
      context.lineWidth = 0.1;
      context.beginPath();
      context.roundRect(side * 0.34 - 0.14, footY - 0.08, 0.28, 0.38, 0.08);
      context.fill();
      context.stroke();
      context.strokeStyle = palette.armorLight;
      context.lineWidth = 0.05;
      context.beginPath();
      context.moveTo(side * 0.34 - 0.1, footY + 0.21);
      context.lineTo(side * 0.34 + 0.1, footY + 0.21);
      context.stroke();
    }
  }

  context.fillStyle = palette.armorDark;
  context.strokeStyle = palette.outline;
  context.lineWidth = 0.09;
  context.beginPath();
  context.roundRect(-0.52, 0.3, 1.04, 0.28, 0.09);
  context.fill();
  context.stroke();
  context.fillStyle = palette.accent;
  context.fillRect(-0.4, 0.45, 0.8, 0.06);

  context.fillStyle = unitSurfaceGradient(palette.armorLight, palette.armor, palette.armorDark);
  context.strokeStyle = palette.outline;
  context.lineWidth = 0.09;
  context.beginPath();
  context.moveTo(-0.58, 0.48);
  context.lineTo(-0.7, -0.3);
  context.lineTo(-0.42, -0.7);
  context.lineTo(0.42, -0.7);
  context.lineTo(0.7, -0.3);
  context.lineTo(0.58, 0.48);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = palette.accent;
  context.fillRect(-0.49, 0.31, 0.98, 0.11);
  context.fillRect(-0.09, -0.69, 0.18, 0.88);

  // Six cannons plus two shoulder missile pods sell the unit as an entire
  // eight-system arsenal on legs.
  for (const side of [-1, 1]) {
    for (const xOffset of [0.36, 0.52, 0.68]) {
      const x = side * xOffset;
      context.strokeStyle = palette.outline;
      context.lineWidth = 0.16;
      context.beginPath();
      context.moveTo(x, -0.18);
      context.lineTo(x, -0.94);
      context.stroke();
      context.strokeStyle = palette.armorLight;
      context.lineWidth = 0.075;
      context.stroke();
      context.fillStyle = palette.outline;
      context.fillRect(x - 0.11, -1.02, 0.22, 0.12);
    }
  }
  context.fillStyle = palette.armorDark;
  for (const side of [-1, 1]) {
    context.fillRect(side * 0.46 - 0.2, -0.5, 0.4, 0.36);
    context.fillStyle = palette.accent;
    context.fillRect(side * 0.46 - 0.16, -0.42, 0.32, 0.07);
    context.fillStyle = palette.armorDark;
  }
  context.fillStyle = palette.joint;
  context.beginPath();
  context.arc(0, -0.2, 0.27, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = palette.energy;
  context.lineWidth = 0.06;
  context.beginPath();
  context.arc(0, -0.2, 0.14, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawHexapodLandshipSprite(definition, teamColor, stasis, pose) {
  const palette = experimentalUnitPalette(teamColor, stasis);
  context.save();
  context.scale(definition.radius, definition.radius);
  context.lineCap = "round";
  context.lineJoin = "round";

  const legStations = [-0.62, 0, 0.62];
  for (const side of [-1, 1]) {
    legStations.forEach((legY, index) => {
      const stepPhase = pose.landshipStep === null
        ? 0.37
        : (pose.landshipStep + index / legStations.length + (side === 1 ? 0.5 : 0)) % 1;
      const planted = stepPhase < 0.74 || pose.landshipStep === null;
      const stanceProgress = Math.min(1, stepPhase / 0.74);
      const swingProgress = Math.max(0, (stepPhase - 0.74) / 0.26);
      const easedSwing = swingProgress * swingProgress * (3 - 2 * swingProgress);
      const footTravel = pose.landshipStep === null
        ? 0
        : planted
          ? -0.22 + stanceProgress * 0.44
          : 0.22 - easedSwing * 0.44;
      const footLift = planted ? 0 : Math.sin(swingProgress * Math.PI) * 0.18;
      const kneeX = side * (0.88 - footLift * 0.18);
      const kneeY = legY + footTravel * 0.48 - footLift;
      const footX = side * 1.08;
      const footY = legY + footTravel - footLift * 0.35;

      context.strokeStyle = palette.outline;
      context.lineWidth = 0.21;
      context.beginPath();
      context.moveTo(side * 0.48, legY);
      context.lineTo(kneeX, kneeY);
      context.lineTo(footX, footY);
      context.stroke();
      context.strokeStyle = palette.armorDark;
      context.lineWidth = 0.11;
      context.stroke();

      if (planted && pose.landshipStep !== null) {
        context.strokeStyle = `${palette.accent}80`;
        context.lineWidth = 0.035;
        context.beginPath();
        context.arc(footX, footY, 0.23, 0.15 * Math.PI, 0.85 * Math.PI);
        context.stroke();
      }
      context.fillStyle = palette.outline;
      context.beginPath();
      context.ellipse(footX, footY, 0.18, 0.11, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = palette.armorDark;
      context.beginPath();
      context.ellipse(footX, footY - 0.01, 0.1, 0.055, 0, 0, Math.PI * 2);
      context.fill();
    });
  }

  context.fillStyle = unitSurfaceGradient(palette.armorLight, palette.armor, palette.armorDark);
  context.strokeStyle = palette.outline;
  context.lineWidth = 0.1;
  context.beginPath();
  context.moveTo(0, -1.08);
  context.lineTo(0.5, -0.76);
  context.lineTo(0.6, 0.8);
  context.lineTo(0.34, 1.05);
  context.lineTo(-0.34, 1.05);
  context.lineTo(-0.6, 0.8);
  context.lineTo(-0.5, -0.76);
  context.closePath();
  context.fill();
  context.stroke();
  context.fillStyle = palette.accent;
  context.fillRect(-0.51, 0.68, 1.02, 0.12);

  context.fillStyle = palette.armorDark;
  context.fillRect(-0.43, -0.3, 0.86, 0.7);
  const cannons = [
    { x: 0, mountY: -0.34, muzzleY: -1.5, width: 0.24 },
    { x: -0.34, mountY: 0.1, muzzleY: -1.18, width: 0.17 },
    { x: 0.34, mountY: 0.1, muzzleY: -1.18, width: 0.17 },
  ];
  for (const [index, cannon] of cannons.entries()) {
    context.save();
    context.translate(cannon.x, cannon.mountY);
    context.rotate(pose.weaponSystemFacings?.[index] || 0);
    context.fillStyle = palette.joint;
    context.strokeStyle = palette.outline;
    context.lineWidth = 0.07;
    context.beginPath();
    context.arc(0, 0, cannon.width * 0.95, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.strokeStyle = palette.outline;
    context.lineWidth = cannon.width;
    context.beginPath();
    context.moveTo(0, -0.05);
    context.lineTo(0, cannon.muzzleY - cannon.mountY + (pose.weaponSystemRecoils?.[index] || 0));
    context.stroke();
    context.strokeStyle = palette.armorLight;
    context.lineWidth = cannon.width * 0.48;
    context.stroke();
    context.fillStyle = palette.outline;
    context.fillRect(
      -cannon.width * 0.7,
      cannon.muzzleY - cannon.mountY - 0.07 + (pose.weaponSystemRecoils?.[index] || 0),
      cannon.width * 1.4,
      0.14,
    );
    context.restore();
  }

  for (const side of [-1, 1]) {
    context.strokeStyle = palette.outline;
    context.lineWidth = 0.08;
    context.beginPath();
    context.moveTo(side * 0.5, -0.54);
    context.lineTo(side * 0.5, 0.52);
    context.stroke();
    context.fillStyle = palette.accent;
    context.fillRect(side * 0.49 - 0.09, 0.46, 0.18, 0.09);
  }
  context.restore();
}

function drawZenithDoughnutSprite(definition, teamColor, stasis) {
  const palette = experimentalUnitPalette(teamColor, stasis);
  context.save();
  context.scale(definition.radius, definition.radius);
  context.fillStyle = unitSurfaceGradient(palette.armorLight, palette.armor, palette.armorDark);
  context.strokeStyle = palette.outline;
  context.lineWidth = 0.1;
  context.beginPath();
  context.arc(0, 0, 1.05, 0, Math.PI * 2);
  context.arc(0, 0, 0.38, 0, Math.PI * 2, true);
  context.fill("evenodd");
  context.stroke();
  context.beginPath();
  context.arc(0, 0, 0.38, 0, Math.PI * 2);
  context.stroke();

  context.strokeStyle = palette.armorDark;
  context.lineWidth = 0.07;
  for (let segment = 0; segment < 8; segment += 1) {
    const angle = (segment / 8) * Math.PI * 2;
    context.beginPath();
    context.moveTo(Math.cos(angle) * 0.3, Math.sin(angle) * 0.3);
    context.lineTo(Math.cos(angle) * 0.95, Math.sin(angle) * 0.95);
    context.stroke();
  }
  context.strokeStyle = palette.accent;
  context.lineWidth = 0.13;
  context.beginPath();
  context.arc(0, 0, 0.75, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = palette.energy;
  context.lineWidth = 0.08;
  context.beginPath();
  context.arc(0, 0, 0.31, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = palette.armorLight;
  context.globalAlpha = 0.55;
  context.lineWidth = 0.11;
  context.beginPath();
  context.arc(0, 0, 0.9, Math.PI * 1.05, Math.PI * 1.65);
  context.stroke();
  context.restore();
}

function drawZenithUnderbellyBeam(unit, definition, selected) {
  const radius = definition.underbellyBeamRadius;
  context.save();
  context.translate(unit.x, unit.y);
  if (selected) {
    context.fillStyle = "#52eaff0c";
    context.strokeStyle = "#6cf4ff70";
    context.lineWidth = 1.5;
    context.setLineDash([5, 6]);
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.setLineDash([]);
  }
  if (!unit.underbellyBeamActive) {
    context.restore();
    return;
  }

  const pulse = 0.88 + Math.sin(simulation.time * 16) * 0.12;
  const glow = context.createRadialGradient(0, 0, 1, 0, 0, radius);
  glow.addColorStop(0, "#f4fffffa");
  glow.addColorStop(0.18, "#b8fbfff0");
  glow.addColorStop(0.48, "#49e8ffc0");
  glow.addColorStop(1, "#20b9db08");
  context.globalCompositeOperation = "lighter";
  context.globalAlpha = pulse;
  context.fillStyle = glow;
  context.shadowColor = "#4cecff";
  context.shadowBlur = 24;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 0.9;
  context.strokeStyle = "#d9ffff";
  context.lineWidth = 3.5;
  context.beginPath();
  context.arc(0, 0, radius * 0.48, 0, Math.PI * 2);
  context.stroke();
  context.restore();
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
  const antiAir = definition.role === "anti_air_vehicle";
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

    if (antiAir) {
      // Four short autocannons and a rear tracking dish distinguish the flak
      // crawler from the single-gun direct-fire vehicles.
      context.strokeStyle = outline;
      context.lineWidth = 0.11;
      for (const barrelX of [-0.18, -0.06, 0.06, 0.18]) {
        context.beginPath();
        context.moveTo(barrelX, -0.19);
        context.lineTo(barrelX, -0.91);
        context.stroke();
        context.fillStyle = outline;
        context.fillRect(barrelX - 0.055, -0.96, 0.11, 0.09);
      }
      context.strokeStyle = accent;
      context.lineWidth = 0.07;
      context.beginPath();
      context.arc(0, 0.19, 0.22, Math.PI * 0.12, Math.PI * 0.88);
      context.stroke();
    } else {
      // A dark breech, armored barrel sleeve, and muzzle brake give the weapon
      // a credible mechanical assembly while the narrow team stripe identifies it.
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
    }
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
  const palette = {
    outline: stasis ? "#24231f" : "#171d23",
    armor: stasis ? "#59544b" : "#9da7a9",
    armorLight: stasis ? "#777066" : "#d9ddda",
    armorDark: stasis ? "#39352f" : "#526064",
    accent: stasis ? `${teamColor}88` : teamColor,
    glass: stasis ? "#6d6249" : "#183642",
    energy: stasis ? "#625b49" : colors.energy,
  };
  context.save();
  context.scale(definition.radius, definition.radius);
  context.lineJoin = "round";
  context.lineCap = "round";
  context.strokeStyle = palette.outline;
  context.lineWidth = 0.09;
  if (definition.role === "gunship") drawGunshipAircraft(definition, palette, stasis);
  else if (definition.role === "bomber") drawBomberAircraft(definition, palette, stasis);
  else if (definition.role === "energy_tender") drawEnergyTenderAircraft(definition, palette, stasis);
  else if (definition.role === "transport") drawTransportAircraft(definition, palette, stasis);
  else drawInterceptorAircraft(definition, palette, stasis);
  context.restore();
}

function drawTransportAircraft(definition, palette, stasis) {
  context.fillStyle = palette.armorDark;
  context.strokeStyle = palette.outline;
  context.beginPath();
  context.moveTo(-1.15, -0.16);
  context.lineTo(-0.52, -0.55);
  context.lineTo(-0.34, -0.92);
  context.lineTo(-0.12, -0.92);
  context.lineTo(-0.18, -0.36);
  context.lineTo(0.18, -0.36);
  context.lineTo(0.12, -0.92);
  context.lineTo(0.34, -0.92);
  context.lineTo(0.52, -0.55);
  context.lineTo(1.15, -0.16);
  context.lineTo(1.04, 0.2);
  context.lineTo(0.48, 0.08);
  context.lineTo(0.38, 0.72);
  context.lineTo(-0.38, 0.72);
  context.lineTo(-0.48, 0.08);
  context.lineTo(-1.04, 0.2);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = palette.armor;
  context.beginPath();
  context.moveTo(0, -0.78);
  context.bezierCurveTo(0.28, -0.62, 0.42, -0.2, 0.4, 0.52);
  context.lineTo(0.22, 0.82);
  context.lineTo(-0.22, 0.82);
  context.lineTo(-0.4, 0.52);
  context.bezierCurveTo(-0.42, -0.2, -0.28, -0.62, 0, -0.78);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = palette.armorLight;
  context.fillRect(-0.31, 0.12, 0.62, 0.3);
  context.strokeRect(-0.31, 0.12, 0.62, 0.3);
  context.strokeStyle = palette.accent;
  context.lineWidth = 0.08;
  for (const x of [-0.19, 0, 0.19]) {
    context.beginPath();
    context.moveTo(x, 0.16);
    context.lineTo(x, 0.38);
    context.stroke();
  }
  drawAircraftCanopy(0, -0.38, 0.2, 0.26, palette);
  drawAircraftNavigationLights(-1.02, 1.02, 0.03, stasis);
  drawAircraftTierMarks(definition.tier, 0.61, palette);
}

function drawAircraftCanopy(x, y, radiusX, radiusY, palette) {
  context.fillStyle = palette.glass;
  context.strokeStyle = palette.outline;
  context.lineWidth = 0.055;
  context.beginPath();
  context.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = palette.armorLight;
  context.globalAlpha = 0.58;
  context.beginPath();
  context.ellipse(x - radiusX * 0.3, y - radiusY * 0.2, radiusX * 0.22, radiusY * 0.58, -0.18, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
}

function drawAircraftNavigationLights(leftX, rightX, y, stasis) {
  context.fillStyle = stasis ? "#746c5d" : "#d94f4f";
  context.beginPath();
  context.arc(leftX, y, 0.055, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = stasis ? "#746c5d" : "#62d77c";
  context.beginPath();
  context.arc(rightX, y, 0.055, 0, Math.PI * 2);
  context.fill();
}

function drawAircraftTierMarks(tier, y, palette) {
  context.fillStyle = palette.accent;
  const markCount = Math.max(1, tier - 1);
  for (let mark = 0; mark < markCount; mark += 1) {
    context.fillRect((mark - (markCount - 1) / 2) * 0.15 - 0.05, y, 0.1, 0.055);
  }
}

function drawInterceptorAircraft(definition, palette, stasis) {
  // A long nose, aggressively swept delta wings, and separated twin tails make
  // the interceptor read as speed-first even at normal battlefield zoom.
  context.fillStyle = unitSurfaceGradient(palette.armorLight, palette.armor, palette.armorDark);
  context.strokeStyle = palette.outline;
  context.lineWidth = 0.09;
  context.beginPath();
  context.moveTo(0, -1.2);
  context.lineTo(0.2, -0.42);
  context.lineTo(0.84, 0.42);
  context.lineTo(0.27, 0.2);
  context.lineTo(0.18, 0.87);
  context.lineTo(0, 0.68);
  context.lineTo(-0.18, 0.87);
  context.lineTo(-0.27, 0.2);
  context.lineTo(-0.84, 0.42);
  context.lineTo(-0.2, -0.42);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = palette.armorLight;
  context.beginPath();
  context.moveTo(0, -1.08);
  context.lineTo(0.08, -0.31);
  context.lineTo(0.11, 0.57);
  context.lineTo(0, 0.67);
  context.lineTo(-0.11, 0.57);
  context.lineTo(-0.08, -0.31);
  context.closePath();
  context.fill();
  drawAircraftCanopy(0, -0.46, 0.12, 0.28, palette);

  context.fillStyle = palette.armorDark;
  context.strokeStyle = palette.outline;
  for (const side of [-1, 1]) {
    context.beginPath();
    context.moveTo(side * 0.11, 0.43);
    context.lineTo(side * 0.39, 0.72);
    context.lineTo(side * 0.22, 0.1);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = palette.outline;
    context.beginPath();
    context.ellipse(side * 0.13, 0.67, 0.07, 0.13, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = palette.armorDark;
  }

  context.strokeStyle = palette.accent;
  context.lineWidth = 0.085;
  context.beginPath();
  context.moveTo(-0.68, 0.35);
  context.lineTo(-0.3, 0.16);
  context.moveTo(0.68, 0.35);
  context.lineTo(0.3, 0.16);
  context.stroke();
  if (definition.tier >= 3) {
    context.fillStyle = palette.armorDark;
    for (const side of [-1, 1]) {
      context.beginPath();
      context.moveTo(side * 0.15, -0.42);
      context.lineTo(side * 0.43, -0.18);
      context.lineTo(side * 0.17, -0.1);
      context.closePath();
      context.fill();
      context.stroke();
    }
  }
  drawAircraftNavigationLights(-0.79, 0.79, 0.41, stasis);
  drawAircraftTierMarks(definition.tier, 0.49, palette);
}

function drawGunshipAircraft(definition, palette, stasis) {
  // Gunships use a short armored fuselage, straight weapon wings, and two large
  // engine nacelles, producing a blocky silhouette unlike the other aircraft.
  context.fillStyle = unitSurfaceGradient(palette.armorLight, palette.armor, palette.armorDark);
  context.strokeStyle = palette.outline;
  context.lineWidth = 0.09;
  context.beginPath();
  context.moveTo(0, -0.94);
  context.lineTo(0.31, -0.48);
  context.lineTo(0.43, -0.2);
  context.lineTo(1.03, -0.05);
  context.lineTo(1.01, 0.43);
  context.lineTo(0.42, 0.34);
  context.lineTo(0.34, 0.84);
  context.lineTo(0, 0.7);
  context.lineTo(-0.34, 0.84);
  context.lineTo(-0.42, 0.34);
  context.lineTo(-1.01, 0.43);
  context.lineTo(-1.03, -0.05);
  context.lineTo(-0.43, -0.2);
  context.lineTo(-0.31, -0.48);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = palette.armorDark;
  for (const side of [-1, 1]) {
    context.beginPath();
    context.roundRect(side * 0.66 - 0.17, -0.34, 0.34, 0.92, 0.12);
    context.fill();
    context.stroke();
    context.fillStyle = palette.outline;
    context.beginPath();
    context.ellipse(side * 0.66, 0.46, 0.11, 0.14, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = palette.armorDark;
    context.strokeStyle = palette.armorLight;
    context.lineWidth = 0.05;
    context.beginPath();
    context.moveTo(side * 0.66, -0.28);
    context.lineTo(side * 0.66, -0.62);
    context.stroke();
    context.strokeStyle = palette.outline;
  }
  drawAircraftCanopy(0, -0.39, 0.22, 0.32, palette);
  context.fillStyle = palette.armorDark;
  context.fillRect(-0.23, 0.18, 0.46, 0.32);
  context.strokeRect(-0.23, 0.18, 0.46, 0.32);
  context.strokeStyle = palette.accent;
  context.lineWidth = 0.09;
  context.beginPath();
  context.moveTo(-0.92, 0.03);
  context.lineTo(-0.48, 0.01);
  context.moveTo(0.92, 0.03);
  context.lineTo(0.48, 0.01);
  context.stroke();
  // Visible chin cannon and paired wing guns reinforce its close-assault role.
  context.strokeStyle = palette.outline;
  context.lineWidth = 0.1;
  context.beginPath();
  context.moveTo(0, -0.62);
  context.lineTo(0, -1.16);
  context.moveTo(-0.83, -0.08);
  context.lineTo(-0.83, -0.46);
  context.moveTo(0.83, -0.08);
  context.lineTo(0.83, -0.46);
  context.stroke();
  if (definition.tier >= 3) {
    context.fillStyle = palette.accent;
    context.fillRect(-0.35, 0.62, 0.7, 0.07);
  }
  drawAircraftNavigationLights(-1, 1, 0.18, stasis);
  drawAircraftTierMarks(definition.tier, 0.32, palette);
}

function drawBomberAircraft(definition, palette, stasis) {
  // The bomber is a broad tailless flying wing with a recessed payload spine;
  // its width and swept trailing edge remain obvious even in a dense formation.
  context.fillStyle = unitSurfaceGradient(palette.armorLight, palette.armor, palette.armorDark);
  context.strokeStyle = palette.outline;
  context.lineWidth = 0.09;
  context.beginPath();
  context.moveTo(0, -0.91);
  context.lineTo(0.76, -0.4);
  context.lineTo(1.2, 0.08);
  context.lineTo(0.72, 0.52);
  context.lineTo(0.2, 0.31);
  context.lineTo(0, 0.76);
  context.lineTo(-0.2, 0.31);
  context.lineTo(-0.72, 0.52);
  context.lineTo(-1.2, 0.08);
  context.lineTo(-0.76, -0.4);
  context.closePath();
  context.fill();
  context.stroke();
  context.fillStyle = palette.armorLight;
  context.beginPath();
  context.moveTo(0, -0.76);
  context.lineTo(0.2, 0.14);
  context.lineTo(0.12, 0.55);
  context.lineTo(-0.12, 0.55);
  context.lineTo(-0.2, 0.14);
  context.closePath();
  context.fill();
  drawAircraftCanopy(0, -0.36, 0.16, 0.25, palette);

  context.strokeStyle = palette.armorDark;
  context.lineWidth = 0.055;
  for (const side of [-1, 1]) {
    context.beginPath();
    context.moveTo(side * 0.18, 0.14);
    context.lineTo(side * 0.92, 0.18);
    context.lineTo(side * 0.68, 0.43);
    context.stroke();
  }
  context.fillStyle = palette.armorDark;
  context.fillRect(-0.38, 0.13, 0.76, 0.25);
  context.strokeStyle = palette.outline;
  context.strokeRect(-0.38, 0.13, 0.76, 0.25);
  context.strokeStyle = palette.accent;
  context.lineWidth = 0.075;
  context.beginPath();
  context.moveTo(-0.91, 0.02);
  context.lineTo(-0.35, 0.16);
  context.moveTo(0.91, 0.02);
  context.lineTo(0.35, 0.16);
  context.stroke();
  context.fillStyle = palette.outline;
  const exhausts = definition.tier >= 3 ? [-0.38, -0.13, 0.13, 0.38] : [-0.25, 0.25];
  for (const exhaustX of exhausts) {
    context.beginPath();
    context.ellipse(exhaustX, 0.4, 0.08, 0.11, 0, 0, Math.PI * 2);
    context.fill();
  }
  drawAircraftNavigationLights(-1.13, 1.13, 0.09, stasis);
  drawAircraftTierMarks(definition.tier, 0.22, palette);
}

function drawEnergyTenderAircraft(definition, palette, stasis) {
  // Long external energy cylinders dominate the tender's silhouette, with a
  // narrow transport fuselage and squared stabilizers identifying it as support.
  context.fillStyle = unitSurfaceGradient(palette.armorLight, palette.armor, palette.armorDark);
  context.strokeStyle = palette.outline;
  context.lineWidth = 0.09;
  context.beginPath();
  context.moveTo(0, -1.08);
  context.lineTo(0.3, -0.52);
  context.lineTo(0.34, -0.2);
  context.lineTo(0.84, 0.02);
  context.lineTo(0.83, 0.31);
  context.lineTo(0.31, 0.28);
  context.lineTo(0.28, 0.82);
  context.lineTo(0, 0.7);
  context.lineTo(-0.28, 0.82);
  context.lineTo(-0.31, 0.28);
  context.lineTo(-0.83, 0.31);
  context.lineTo(-0.84, 0.02);
  context.lineTo(-0.34, -0.2);
  context.lineTo(-0.3, -0.52);
  context.closePath();
  context.fill();
  context.stroke();
  drawAircraftCanopy(0, -0.55, 0.15, 0.26, palette);

  for (const side of [-1, 1]) {
    context.fillStyle = stasis ? "#403b32" : "#17343e";
    context.strokeStyle = palette.accent;
    context.lineWidth = 0.075;
    context.beginPath();
    context.roundRect(side * 0.66 - 0.17, -0.5, 0.34, 1.14, 0.16);
    context.fill();
    context.stroke();
    context.strokeStyle = palette.armorLight;
    context.lineWidth = 0.04;
    for (const bandY of [-0.29, 0.04, 0.37]) {
      context.beginPath();
      context.moveTo(side * 0.51, bandY);
      context.lineTo(side * 0.81, bandY);
      context.stroke();
    }
    context.fillStyle = palette.energy;
    context.beginPath();
    context.arc(side * 0.66, -0.12, 0.07, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = palette.outline;
    context.beginPath();
    context.moveTo(side * 0.49, 0.56);
    context.lineTo(side * 0.49, 0.87);
    context.lineTo(side * 0.78, 0.62);
    context.closePath();
    context.stroke();
  }
  context.strokeStyle = palette.energy;
  context.lineWidth = 0.055;
  context.beginPath();
  context.moveTo(-0.49, -0.11);
  context.lineTo(-0.2, -0.11);
  context.lineTo(0, 0.18);
  context.lineTo(0.2, -0.11);
  context.lineTo(0.49, -0.11);
  context.stroke();
  context.fillStyle = palette.armorDark;
  context.fillRect(-0.21, 0.25, 0.42, 0.3);
  context.strokeStyle = palette.outline;
  context.strokeRect(-0.21, 0.25, 0.42, 0.3);
  if (definition.tier >= 3) {
    context.strokeStyle = palette.accent;
    context.lineWidth = 0.06;
    context.strokeRect(-0.16, 0.3, 0.32, 0.2);
  }
  drawAircraftNavigationLights(-0.84, 0.84, 0.17, stasis);
  drawAircraftTierMarks(definition.tier, 0.37, palette);
}

function drawMechSprite(definition, teamColor, darkColor, stasis, pose) {
  const role = definition.role || "vanguard";
  const heavy = role === "bulwark";
  const carrier = role === "carrier";
  const raider = role === "raider";
  const antiAir = role === "anti_air_mech";
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

  // From directly above, the chassis hides almost the entire walking assembly.
  // Movement briefly exposes alternating rear actuator and foot tips without
  // swinging anything sideways, avoiding the old swimming/paddling silhouette.
  if (pose.moving) {
    for (const side of [-1, 1]) {
      const step = Math.max(0, side * pose.stride);
      const footY = 0.53 + step * 0.24;
      context.fillStyle = "#080c0f70";
      context.beginPath();
      context.ellipse(side * 0.27, footY + 0.14, 0.16, 0.09, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = outline;
      context.lineWidth = 0.08;
      context.fillStyle = armorDark;
      context.beginPath();
      context.roundRect(side * 0.27 - 0.11, footY - 0.08, 0.22, 0.3, 0.07);
      context.fill();
      context.stroke();
      context.strokeStyle = armorLight;
      context.lineWidth = 0.045;
      context.beginPath();
      context.moveTo(side * 0.19, footY + 0.14);
      context.lineTo(side * 0.35, footY + 0.14);
      context.stroke();
    }
  }

  // The rear hip bar remains a small overhead machinery cue, but the torso
  // overlaps its roots so it no longer reads as a pair of exposed legs.
  context.fillStyle = armorDark;
  context.beginPath();
  context.roundRect(-0.5, 0.28, 1, 0.24, 0.08);
  context.fill();
  context.stroke();
  context.fillStyle = accent;
  context.fillRect(-0.37, 0.4, 0.74, 0.05);

  // The broad shoulder deck, inset cockpit roof, and rear engine plate are all
  // visible from above; no vertical chest or face plane is exposed.
  context.fillStyle = joint;
  context.beginPath();
  context.ellipse(0, 0.08, 0.58, 0.48, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = unitSurfaceGradient(armorLight, armor, armorDark);
  context.beginPath();
  if (heavy) {
    context.moveTo(-0.28, -0.69);
    context.lineTo(0.39, -0.69);
    context.lineTo(0.68, -0.48);
    context.lineTo(0.72, 0.3);
    context.lineTo(0.43, 0.56);
    context.lineTo(-0.43, 0.56);
    context.lineTo(-0.72, 0.3);
    context.lineTo(-0.68, -0.48);
  } else if (carrier) {
    context.moveTo(0, -0.72);
    context.lineTo(0.5, -0.55);
    context.lineTo(0.64, -0.12);
    context.lineTo(0.48, 0.45);
    context.lineTo(0, 0.58);
    context.lineTo(-0.48, 0.45);
    context.lineTo(-0.64, -0.12);
    context.lineTo(-0.5, -0.55);
  } else {
    context.moveTo(0, -0.9);
    context.lineTo(0.36, -0.64);
    context.lineTo(0.51, -0.17);
    context.lineTo(0.34, 0.4);
    context.lineTo(0, 0.52);
    context.lineTo(-0.34, 0.4);
    context.lineTo(-0.51, -0.17);
    context.lineTo(-0.36, -0.64);
  }
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = armorLight;
  context.beginPath();
  if (heavy) {
    context.moveTo(-0.52, -0.49);
    context.lineTo(-0.07, -0.57);
    context.lineTo(-0.07, 0.38);
    context.lineTo(-0.49, 0.28);
    context.lineTo(-0.58, -0.2);
  } else if (carrier) {
    context.moveTo(-0.43, -0.49);
    context.lineTo(0, -0.63);
    context.lineTo(0, 0.42);
    context.lineTo(-0.35, 0.32);
    context.lineTo(-0.52, -0.1);
  } else {
    context.moveTo(-0.32, -0.62);
    context.lineTo(0, -0.8);
    context.lineTo(0, 0.35);
    context.lineTo(-0.25, 0.27);
    context.lineTo(-0.4, -0.17);
  }
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
  if (heavy) {
    context.moveTo(-0.2, -0.56);
    context.lineTo(0.25, -0.56);
    context.lineTo(0.31, -0.27);
    context.lineTo(0.18, -0.06);
    context.lineTo(-0.18, -0.06);
    context.lineTo(-0.31, -0.27);
  } else if (carrier) {
    context.moveTo(0, -0.6);
    context.lineTo(0.27, -0.34);
    context.lineTo(0.2, 0.01);
    context.lineTo(0, 0.13);
    context.lineTo(-0.2, 0.01);
    context.lineTo(-0.27, -0.34);
  } else {
    context.moveTo(0, -0.78);
    context.lineTo(0.19, -0.45);
    context.lineTo(0.14, -0.05);
    context.lineTo(0, 0.07);
    context.lineTo(-0.14, -0.05);
    context.lineTo(-0.19, -0.45);
  }
  context.closePath();
  context.fill();
  context.stroke();
  context.fillStyle = accent;
  context.beginPath();
  if (heavy) {
    context.rect(-0.26, -0.5, 0.52, 0.08);
  } else if (carrier) {
    context.arc(0, -0.34, 0.17, Math.PI, 0);
    context.lineTo(0.13, -0.28);
    context.arc(0, -0.34, 0.13, 0, Math.PI, true);
  } else {
    context.moveTo(-0.16, -0.49);
    context.lineTo(0, -0.66);
    context.lineTo(0.16, -0.49);
    context.lineTo(0.13, -0.4);
    context.lineTo(0, -0.54);
    context.lineTo(-0.13, -0.4);
  }
  context.closePath();
  context.fill();

  const shoulderWidth = heavy ? 0.42 : carrier ? 0.34 : antiAir ? 0.38 : 0.3;
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
  } else if (antiAir) {
    // Paired shoulder missile racks and a central tracking dish give the
    // Skyguard a broad, unmistakable anti-air equipment profile.
    for (const side of [-1, 1]) {
      context.fillStyle = armorDark;
      context.strokeStyle = outline;
      context.lineWidth = 0.08;
      context.beginPath();
      context.roundRect(side * 0.72 - 0.18, -0.55, 0.36, 0.62, 0.08);
      context.fill();
      context.stroke();
      context.fillStyle = outline;
      for (const missileX of [-0.09, 0.09]) {
        for (const missileY of [-0.39, -0.14]) {
          context.beginPath();
          context.arc(side * 0.72 + missileX, missileY, 0.045, 0, Math.PI * 2);
          context.fill();
        }
      }
      context.fillStyle = accent;
      context.fillRect(side * 0.72 - 0.14, -0.02, 0.28, 0.055);
    }
    context.strokeStyle = stasis ? colors.stasis : colors.energy;
    context.lineWidth = 0.07;
    context.beginPath();
    context.arc(0, -0.05, 0.24, Math.PI * 0.12, Math.PI * 0.88);
    context.stroke();
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
  context.fillStyle = colors.crystal;
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
      colors.crystal,
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
  const visibleScrap = Math.max(1, Math.ceil(ratio * 5));
  for (let shard = 0; shard < visibleScrap; shard += 1) {
    drawCrystalShard(
      -10 + shard * 5,
      5 - (shard % 2) * 7,
      3 + (shard % 3),
      shard * 0.38,
      { rich: shard % 4 === 0 },
    );
  }
  context.restore();
  drawBar(wreck.x, wreck.y - 22, 40, ratio, colors.crystal);
  context.fillStyle = "#ff9ca8";
  context.font = "600 10px ui-monospace, monospace";
  context.textAlign = "center";
  context.fillText(`${Math.ceil(wreck.metal)}C · CRYSTAL SCRAP`, wreck.x, wreck.y + 28);
  context.textAlign = "start";
}

function drawEvents() {
  for (const event of simulation.events) {
    const age = simulation.time - event.time;
    if (event.type === "attack") {
      drawAttackEvent(event, age);
    } else {
      const alpha = Math.max(0, 1 - age / 1.2);
      const eventColor = event.type === "stasis"
        ? colors.stasis
        : event.type === "shield_hit"
          ? colors.shield
          : colors.energy;
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

function drawAttackEvent(event, age) {
  const source = simulation.getEntity(event.sourceId);
  const profile = attackPresentation(source, event);
  const sourceX = event.sourceX ?? source?.x;
  const sourceY = event.sourceY ?? source?.y;
  const targetX = event.targetX ?? event.x;
  const targetY = event.targetY ?? event.y;
  if (![sourceX, sourceY, targetX, targetY].every(Number.isFinite)) return;

  const deltaX = targetX - sourceX;
  const deltaY = targetY - sourceY;
  const separation = Math.max(0.0001, Math.hypot(deltaX, deltaY));
  const directionX = deltaX / separation;
  const directionY = deltaY / separation;
  const sourceRadius = event.sourceRadius || (source ? entityRenderRadius(source) : 8);
  const muzzleDistance = Math.max(5, sourceRadius * 0.72);
  const impactInset = Math.max(2, (event.targetRadius || 8) * 0.3);
  const lateralMuzzleOffset = event.weaponSystemIndex === 1
    ? -sourceRadius * 0.34
    : event.weaponSystemIndex === 2
      ? sourceRadius * 0.34
      : 0;
  const startX = sourceX + directionX * muzzleDistance - directionY * lateralMuzzleOffset;
  const startY = sourceY + directionY * muzzleDistance + directionX * lateralMuzzleOffset;
  const endX = targetX - directionX * impactInset;
  const endY = targetY - directionY * impactInset;
  const flightDistance = Math.hypot(endX - startX, endY - startY);
  const travelTime = event.impactDelay > 0
    ? event.impactDelay
    : Math.max(profile.minimumTravelTime, flightDistance / profile.speed);

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalCompositeOperation = "lighter";
  if (profile.beam) {
    const beamProgress = Math.min(1, age / profile.beamDuration);
    const alpha = Math.sin(beamProgress * Math.PI) ** 0.45;
    context.globalAlpha = alpha * 0.28;
    context.strokeStyle = profile.glowColor;
    context.lineWidth = profile.trailWidth * 4.5;
    context.shadowColor = profile.glowColor;
    context.shadowBlur = profile.glow * 2;
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();
    context.globalAlpha = alpha;
    context.strokeStyle = profile.projectileColor;
    context.lineWidth = profile.trailWidth;
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();
    drawWeaponImpact(event, endX, endY, age, profile);
    context.restore();
    return;
  }
  const salvoCount = profile.salvoCount || 1;
  const salvoSpread = profile.salvoSpread || 0;
  const perpendicularX = -directionY;
  const perpendicularY = directionX;
  if (age <= profile.muzzleDuration) {
    const muzzleAlpha = 1 - age / profile.muzzleDuration;
    for (let shot = 0; shot < salvoCount; shot += 1) {
      const shotOffset = (shot - (salvoCount - 1) / 2) * salvoSpread;
      drawMuzzleFlash(
        startX + perpendicularX * shotOffset,
        startY + perpendicularY * shotOffset,
        directionX,
        directionY,
        profile,
        muzzleAlpha,
      );
    }
  }

  if (age < travelTime) {
    const progress = Math.max(0, age / travelTime);
    const trailProgress = Math.max(0, progress - profile.trailFraction);
    const projectileHeight = Math.sin(progress * Math.PI) * profile.arcHeight;
    const trailHeight = Math.sin(trailProgress * Math.PI) * profile.arcHeight;
    const projectileX = lerp(startX, endX, progress);
    const projectileY = lerp(startY, endY, progress) - projectileHeight * 0.28;
    const trailX = lerp(startX, endX, trailProgress);
    const trailY = lerp(startY, endY, trailProgress) - trailHeight * 0.28;

    if (profile.arcHeight > 0) {
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 0.2;
      context.fillStyle = "#050609";
      context.beginPath();
      context.ellipse(
        projectileX + projectileHeight * 0.12,
        lerp(startY, endY, progress) + projectileHeight * 0.12,
        profile.projectileSize * 1.25,
        profile.projectileSize * 0.65,
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.globalCompositeOperation = "lighter";
      context.globalAlpha = 1;
    }

    for (let shot = 0; shot < salvoCount; shot += 1) {
      const shotOffset = (shot - (salvoCount - 1) / 2) * salvoSpread;
      const projectileOffset = shotOffset * (1 - progress);
      const trailOffset = shotOffset * (1 - trailProgress);
      context.strokeStyle = profile.trailColor;
      context.lineWidth = profile.trailWidth;
      context.beginPath();
      context.moveTo(trailX + perpendicularX * trailOffset, trailY + perpendicularY * trailOffset);
      context.lineTo(
        projectileX + perpendicularX * projectileOffset,
        projectileY + perpendicularY * projectileOffset,
      );
      context.stroke();
      context.fillStyle = profile.projectileColor;
      context.shadowColor = profile.glowColor;
      context.shadowBlur = profile.glow;
      context.beginPath();
      context.arc(
        projectileX + perpendicularX * projectileOffset,
        projectileY + perpendicularY * projectileOffset,
        profile.projectileSize,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  } else {
    drawWeaponImpact(event, endX, endY, age - travelTime, profile);
  }
  context.restore();
}

function drawMuzzleFlash(x, y, directionX, directionY, profile, alpha) {
  const perpendicularX = -directionY;
  const perpendicularY = directionX;
  const length = profile.muzzleSize * (0.75 + alpha * 0.45);
  const width = profile.muzzleSize * 0.36;
  context.globalAlpha = alpha;
  context.fillStyle = profile.muzzleColor;
  context.shadowColor = profile.glowColor;
  context.shadowBlur = profile.glow * 1.4;
  context.beginPath();
  context.moveTo(x + directionX * length, y + directionY * length);
  context.lineTo(x - directionX * length * 0.2 + perpendicularX * width, y - directionY * length * 0.2 + perpendicularY * width);
  context.lineTo(x - directionX * length * 0.2 - perpendicularX * width, y - directionY * length * 0.2 - perpendicularY * width);
  context.closePath();
  context.fill();
  context.beginPath();
  context.arc(x, y, width * 0.8, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
}

function drawWeaponImpact(event, x, y, impactAge, profile) {
  if (impactAge > profile.impactDuration) return;
  const progress = impactAge / profile.impactDuration;
  const alpha = 1 - progress;
  context.globalAlpha = alpha;
  context.strokeStyle = profile.impactColor;
  context.lineWidth = Math.max(1, profile.trailWidth * (1 - progress * 0.5));
  context.beginPath();
  context.arc(x, y, profile.impactSize * (0.3 + progress * 0.9), 0, Math.PI * 2);
  context.stroke();

  const seed = stableVisualSeed(`${event.sourceId}:${event.targetId}:${event.time}`);
  context.strokeStyle = profile.sparkColor;
  context.lineWidth = 1.4;
  for (let spark = 0; spark < profile.sparkCount; spark += 1) {
    const angle = (seed * 0.017 + spark * 2.39996) % (Math.PI * 2);
    const inner = profile.impactSize * 0.18 * progress;
    const outer = profile.impactSize * (0.35 + ((seed + spark * 17) % 31) / 50) * progress;
    context.beginPath();
    context.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
    context.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
    context.stroke();
  }

  if (profile.smoke) {
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = alpha * 0.2;
    context.fillStyle = "#8c8984";
    context.beginPath();
    context.arc(x + progress * 4, y - progress * 7, profile.impactSize * (0.28 + progress * 0.5), 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function attackPresentation(source, event = null) {
  const definition = source?.kind === "structure"
    ? STRUCTURE_DEFINITIONS[source.type]
    : source?.kind === "unit"
      ? UNIT_DEFINITIONS[source.type]
      : null;
  const kinetics = projectileKinetics(definition) || {
    speed: 980,
    minimumTravelTime: 0.055,
  };
  const role = definition?.role;
  if (role === "mortar") {
    return {
      speed: kinetics.speed, minimumTravelTime: kinetics.minimumTravelTime,
      trailFraction: 0.08, arcHeight: 105,
      projectileSize: 5.2, trailWidth: 3.2, muzzleDuration: 0.14, muzzleSize: 15,
      impactDuration: 0.52, impactSize: 34, sparkCount: 13, glow: 17, smoke: true,
      projectileColor: "#fff0b8", trailColor: "#e89245", muzzleColor: "#ffe5a0",
      glowColor: "#ff7138", impactColor: "#ff9848", sparkColor: "#ffd68a",
    };
  }
  if (role === "arsenal_colossus") {
    return {
      salvoCount: definition.salvoCount || 5, salvoSpread: 8,
      speed: kinetics.speed, minimumTravelTime: kinetics.minimumTravelTime,
      trailFraction: 0.1, arcHeight: 8,
      projectileSize: 2.8, trailWidth: 1.8, muzzleDuration: 0.11, muzzleSize: 10,
      impactDuration: 0.36, impactSize: 22, sparkCount: 11, glow: 13, smoke: true,
      projectileColor: "#fff8d1", trailColor: "#ffc96d", muzzleColor: "#fff0a6",
      glowColor: "#ff8d3d", impactColor: "#ffb15b", sparkColor: "#ffe4a5",
    };
  }
  if (role === "hexapod_landship") {
    return {
      salvoCount: event?.weaponSystemIndex === undefined ? definition.salvoCount || 1 : 1,
      salvoSpread: 0,
      speed: kinetics.speed,
      minimumTravelTime: kinetics.minimumTravelTime,
      trailFraction: 0.08, arcHeight: 18,
      projectileSize: 5.2, trailWidth: 3.5, muzzleDuration: 0.14, muzzleSize: 17,
      impactDuration: 0.5, impactSize: 36, sparkCount: 15, glow: 18, smoke: true,
      projectileColor: "#fff4c0", trailColor: "#ffad50", muzzleColor: "#fff0a6",
      glowColor: "#ff7733", impactColor: "#ff9f43", sparkColor: "#ffe0a0",
    };
  }
  if (role === "artillery" || role === "bomber") {
    return {
      speed: kinetics.speed, minimumTravelTime: kinetics.minimumTravelTime,
      trailFraction: 0.11, arcHeight: 42,
      projectileSize: 3.8, trailWidth: 2.4, muzzleDuration: 0.1, muzzleSize: 12,
      impactDuration: 0.42, impactSize: 24, sparkCount: 9, glow: 13, smoke: true,
      projectileColor: "#fff3c4", trailColor: "#ffb65f", muzzleColor: "#fff1b0",
      glowColor: "#ff8d3d", impactColor: "#ffb45b", sparkColor: "#ffe2a0",
    };
  }
  if (role === "tank" || role === "bulwark") {
    return {
      speed: kinetics.speed, minimumTravelTime: kinetics.minimumTravelTime,
      trailFraction: 0.09, arcHeight: 5,
      projectileSize: 3, trailWidth: 2.2, muzzleDuration: 0.085, muzzleSize: 10,
      impactDuration: 0.3, impactSize: 16, sparkCount: 7, glow: 11, smoke: true,
      projectileColor: "#fff5ce", trailColor: "#ffc36d", muzzleColor: "#fff0a6",
      glowColor: "#ff963f", impactColor: "#ffb15b", sparkColor: "#ffe4a5",
    };
  }
  return {
    speed: kinetics.speed, minimumTravelTime: kinetics.minimumTravelTime,
    trailFraction: 0.13, arcHeight: 0,
    projectileSize: 2.1, trailWidth: 1.6, muzzleDuration: 0.06, muzzleSize: 7,
    impactDuration: 0.2, impactSize: 10, sparkCount: 5, glow: 9, smoke: false,
    projectileColor: "#fffbe0", trailColor: "#ffcf79", muzzleColor: "#fff4b8",
    glowColor: "#ff9e4d", impactColor: "#ffd17b", sparkColor: "#fff0b6",
  };
}

function recentAttackAge(sourceId, weaponSystemIndex = null) {
  for (let index = simulation.events.length - 1; index >= 0; index -= 1) {
    const event = simulation.events[index];
    if (event.type !== "attack" || event.sourceId !== sourceId) continue;
    if (weaponSystemIndex !== null && event.weaponSystemIndex !== weaponSystemIndex) continue;
    const age = simulation.time - event.time;
    return age <= 0.18 ? age : null;
  }
  return null;
}

function entityRenderRadius(entity) {
  if (entity.kind === "unit") return UNIT_DEFINITIONS[entity.type]?.radius || 8;
  if (entity.kind === "structure") return STRUCTURE_DEFINITIONS[entity.type]?.radius || 12;
  return 8;
}

function stableVisualSeed(value) {
  let seed = 2166136261;
  for (const character of value) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
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

function createQueueCard(label, queue) {
  const card = document.createElement("div");
  card.className = "queue-card";

  const title = document.createElement("div");
  title.className = "queue-title";
  title.textContent = label;
  card.append(title);

  if (queue?.current) {
    const heading = document.createElement("div");
    heading.className = "queue-current-heading";
    const name = document.createElement("strong");
    name.textContent = queue.current.name;
    const percentage = document.createElement("span");
    percentage.textContent = `${queue.current.progress}%`;
    heading.append(name, percentage);

    const progress = document.createElement("progress");
    progress.className = "queue-progress";
    progress.max = 100;
    progress.value = queue.current.progress;
    progress.setAttribute(
      "aria-label",
      `${queue.current.name} ${queue.current.progress}% complete`,
    );

    const status = document.createElement("div");
    status.className = "queue-status";
    status.textContent = queue.current.status;
    card.append(heading, progress, status);
  } else {
    const empty = document.createElement("div");
    empty.className = "queue-empty";
    empty.textContent = "No active job";
    card.append(empty);
  }

  const nextLabel = document.createElement("div");
  nextLabel.className = "queue-next-label";
  nextLabel.textContent = "Next";
  card.append(nextLabel);

  if (queue?.upcoming.length) {
    const list = document.createElement("ol");
    list.className = "queue-next-list";
    for (const upcoming of queue.upcoming) {
      const item = document.createElement("li");
      item.textContent = upcoming.name;
      list.append(item);
    }
    card.append(list);
  } else {
    const empty = document.createElement("div");
    empty.className = "queue-empty";
    empty.textContent = "No additional items queued";
    card.append(empty);
  }

  return card;
}

function renderSelectionQueues(selectedStructures, selectedUnits) {
  const factoryEntries = selectedStructures
    .filter((structure) => STRUCTURE_DEFINITIONS[structure.type].production)
    .map((structure) => ({
      structure,
      queue: describeProductionQueue(structure, UNIT_DEFINITIONS),
    }));
  const workerEntries = selectedUnits
    .filter((unit) => UNIT_DEFINITIONS[unit.type].workerTier)
    .map((unit) => ({
      unit,
      queue: describeConstructionQueue(
        unit,
        simulation,
        STRUCTURE_DEFINITIONS,
      ),
    }))
    .filter((entry) => entry.queue);
  const hasVisibleQueue =
    factoryEntries.some((entry) => entry.queue) || workerEntries.length > 0;
  const displayEntries = [
    ...factoryEntries.map((entry, index) => ({
      label: factoryEntries.length > 1
        ? `${STRUCTURE_DEFINITIONS[entry.structure.type].name} ${index + 1}`
        : "Production queue",
      queue: entry.queue,
    })),
    ...workerEntries.map((entry, index) => ({
      label: workerEntries.length > 1
        ? `Worker queue ${index + 1}`
        : "Construction queue",
      queue: entry.queue,
    })),
  ];
  const nextSignature = hasVisibleQueue ? JSON.stringify(displayEntries) : "";
  if (selectionQueueSignature === nextSignature) return;
  selectionQueueSignature = nextSignature;

  if (!hasVisibleQueue) {
    selectionQueue.replaceChildren();
    selectionQueue.hidden = true;
    return;
  }

  const cards = displayEntries.map((entry) => createQueueCard(entry.label, entry.queue));
  selectionQueue.replaceChildren(...cards);
  selectionQueue.hidden = false;
}

function updateInterface() {
  const matchEnded = Boolean(simulation.matchResult);
  matchResultPanel.hidden = !matchEnded;
  if (matchEnded) {
    const victory = simulation.matchWinnerTeamId
      ? simulation.matchWinnerTeamId === localTeam
      : localTeam === "player"
        ? simulation.matchResult === "victory"
        : simulation.matchResult === "defeat";
    matchResultTitle.textContent = victory ? "You win." : "You lose.";
    matchResultDetails.textContent = victory
      ? "All opposing buildings and units have been destroyed."
      : "All of your buildings and units have been destroyed.";
  }
  pauseButton.disabled = matchEnded || isMultiplayer();

  const localResources = simulation.resources[localTeam];
  const unitTesterActive = simulation.isTesterTeam(localTeam);
  testerSpawnCommands.hidden = matchEnded || !unitTesterActive;
  crystalValue.textContent = unitTesterActive
    ? "∞"
    : Math.floor(localResources.metal).toLocaleString();
  const netEnergyRate = simulation.getNetEnergyRate(localTeam);
  const netEnergyText = netEnergyRate.toLocaleString(undefined, { maximumFractionDigits: 1 });
  energyValue.textContent = unitTesterActive
    ? "∞"
    : `${netEnergyRate >= 0 ? "+" : ""}${netEnergyText}/s · ${Math.floor(localResources.energy)}/${localResources.energyCapacity}`;
  const playerSupply = simulation.getSupplyState(localTeam);
  supplyValue.textContent = unitTesterActive
    ? `${playerSupply.used.toLocaleString()}/∞`
    : `${playerSupply.used.toLocaleString()}/${playerSupply.capacity.toLocaleString()}`;
  supplyValue.title = `${playerSupply.unitSupply.toLocaleString()} active · ${playerSupply.reservedSupply.toLocaleString()} queued`;

  const selectedUnits = [...selectedUnitIds]
    .map((id) => simulation.getUnit(id))
    .filter((unit) => unit && !unit.carriedById);
  const selectedStructures = getSelectedStructures();
  const selectedStructure = simulation.getStructure(selectedStructureId);
  if (selectedStructures.length > 1) {
    const definition = STRUCTURE_DEFINITIONS[selectedStructure.type];
    const poweredCount = selectedStructures.filter((structure) => structure.powered).length;
    const queuedCount = selectedStructures.reduce(
      (total, structure) => total + structure.productionQueue.length,
      0,
    );
    const firstRally = selectedStructures[0].rallyPoint;
    const hasSharedRally = Boolean(
      firstRally && selectedStructures.every(
        (structure) =>
          structure.rallyPoint?.x === firstRally.x && structure.rallyPoint?.y === firstRally.y,
      ),
    );
    const rallyText = hasSharedRally
      ? ` · shared rally ${Math.round(firstRally.x)},${Math.round(firstRally.y)}`
      : " · right-click terrain to set shared rally";
    selectionName.textContent = `${selectedStructures.length} × ${definition.name}`;
    selectionDetails.textContent = `${poweredCount}/${selectedStructures.length} powered · ${queuedCount} total queued · new units use shortest queue${rallyText}`;
  } else if (selectedStructure) {
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
      ? ` · ${definition.attackDamage} damage · ${definition.minimumAttackRange ? `${definition.minimumAttackRange}–` : ""}${definition.attackRange} range · ${(definition.attackDamage / definition.attackCooldown).toFixed(1)} DPS${definition.airDamageMultiplier ? ` · ${definition.airDamageMultiplier}× VS AIR` : ""} · ${Math.floor(selectedStructure.weaponEnergy)}/${definition.capacitorCapacity} capacitor · ${selectedStructure.defenseStatus.toUpperCase()}`
      : "";
    const shieldText = definition.shieldCapacity
      ? ` · ${Math.ceil(selectedStructure.shieldStrength)}/${definition.shieldCapacity} shield · ${definition.shieldRadius} field radius · ${definition.shieldRegenRate}/s regen · ${definition.shieldEnergyPerPoint} energy/point · ${selectedStructure.shieldStatus.toUpperCase()}`
      : "";
    const chargerText = definition.chargeRadius
      ? ` · ${definition.chargeRate}/s unit recharge · ${definition.chargeRadius} field radius`
      : "";
    const mineDeposit = definition.metalRate
      ? simulation.metalDeposits.find((deposit) => deposit.id === selectedStructure.depositId)
      : null;
    const mineRate = definition.metalRate * (mineDeposit?.yieldMultiplier || 1);
    const mineText = definition.metalRate
      ? ` · +${mineRate} crystal/s${mineDeposit?.rich ? " · RICH DEPOSIT" : ""}`
      : "";
    const salvageText = definition.droneCount
      ? ` · ${definition.droneCount} reclamation drones · ${definition.droneReplacementTime}s rebuild`
      : "";
    const productionAssist = definition.production
      ? simulation.getFactoryProductionAssistState(selectedStructure.id)
      : { workerCount: 0, productionRate: 0 };
    const factoryText = definition.factoryBranch
      ? productionAssist.workerCount > 0
        ? ` · ${Math.round((definition.productionRate || 1) * 100)}% base production speed · ${productionAssist.workerCount} worker${productionAssist.workerCount === 1 ? "" : "s"} assisting · ${Math.round(((definition.productionRate || 1) + productionAssist.productionRate) * 100)}% current speed`
        : ` · ${Math.round((definition.productionRate || 1) * 100)}% production speed`
      : "";
    const headquartersText = definition.headquarters
      ? " · CRITICAL—LOSS ELIMINATES THIS COMMANDER · BUILDS TIER 1 WORKERS"
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
    selectionDetails.textContent = `${Math.ceil(selectedStructure.hp)}/${definition.maxHp} integrity · ${status}${storageText}${generatorText}${relayText}${chargerText}${mineText}${demandText}${defenseText}${shieldText}${salvageText}${factoryText}${headquartersText}${supplyComplexText}${builderText}${queueText}${rallyText}`;
  } else if (selectedUnits.length === 0) {
    selectionName.textContent = "No units selected";
    selectionDetails.textContent = "Select friendly units or a structure on the battlefield.";
  } else if (selectedUnits.length === 1) {
    const unit = selectedUnits[0];
    const definition = UNIT_DEFINITIONS[unit.type];
    const emergencyRecoveryText =
      unit.state === "active" && energyRatio(unit) < SIMULATION_RULES.lowEnergyRatio
        ? ` · EMERGENCY REGEN +${SIMULATION_RULES.lowEnergyRegenerationRate}/s`
        : "";
    const buildTarget = simulation.getStructure(unit.buildTargetId);
    const orderText = buildTarget?.alive && !buildTarget.complete
      ? ` · BUILDING ${STRUCTURE_DEFINITIONS[buildTarget.type].name.toUpperCase()}`
      : "";
    const repairTarget = simulation.getEntity(unit.repairTargetId);
    const repairDefinition = repairTarget?.kind === "unit"
      ? UNIT_DEFINITIONS[repairTarget.type]
      : repairTarget?.kind === "structure"
        ? STRUCTURE_DEFINITIONS[repairTarget.type]
        : null;
    const repairText = repairTarget?.alive && repairDefinition
      ? ` · REPAIRING ${repairDefinition.name.toUpperCase()}`
      : "";
    const productionAssistTarget = simulation.getStructure(unit.productionAssistTargetId);
    const productionAssistText = productionAssistTarget?.alive
      ? ` · ASSISTING ${STRUCTURE_DEFINITIONS[productionAssistTarget.type].name.toUpperCase()} PRODUCTION`
      : "";
    const buildQueueText = unit.buildQueue?.length
      ? ` · ${unit.buildQueue.length} BUILD${unit.buildQueue.length === 1 ? "" : "S"} QUEUED`
      : "";
    const supplyText = definition.transferRate
      ? unit.energyTransferTargetIds?.length
        ? ` · SUPPLYING ${unit.energyTransferTargetIds.length} UNIT${unit.energyTransferTargetIds.length === 1 ? "" : "S"}`
        : ` · NO UNIT IN ${definition.transferRange} RANGE`
      : "";
    const transportText = definition.transportCapacity
      ? ` · ${(unit.cargoUnitIds || []).length}/${definition.transportCapacity} CARGO`
      : "";
    const roleText = definition.roleDescription ? ` · ${definition.roleDescription}` : "";
    const combatText = definition.underbellyBeamRadius
      ? ` · ${definition.underbellyBeamDamagePerSecond} damage/s underbelly beam · ${definition.underbellyBeamRadius} radius · ${definition.speed} speed${definition.automaticTargetAcquisitionRange ? ` · ${definition.automaticTargetAcquisitionRange} LOCAL ACQUISITION` : ""}`
      : definition.weaponSystems?.length
        ? ` · ${definition.weaponSystems.length} independent cannons · ${definition.attackDamage} combined damage · ${definition.attackRange} maximum range · ${definition.speed} speed`
      : definition.attackRange
        ? ` · ${definition.attackDamage} damage · ${definition.attackRange} range · ${definition.speed} speed${definition.airDamageMultiplier ? ` · ${definition.airDamageMultiplier}× VS AIR` : ""}`
        : "";
    selectionName.textContent = definition.name;
    selectionDetails.textContent = `${Math.ceil(unit.hp)}/${definition.maxHp} integrity · ${Math.ceil(unit.energy)}/${definition.maxEnergy} energy · ${unit.state.toUpperCase()}${roleText}${combatText}${emergencyRecoveryText}${supplyText}${transportText}${orderText}${repairText}${productionAssistText}${buildQueueText}`;
  } else {
    const activeCount = selectedUnits.filter((unit) => unit.state === "active").length;
    const cargoCount = selectedUnits.reduce(
      (total, unit) => total + (unit.cargoUnitIds || []).length,
      0,
    );
    selectionName.textContent = `${selectedUnits.length} units selected`;
    selectionDetails.textContent = `${activeCount} active · ${selectedUnits.length - activeCount} in stasis${cargoCount ? ` · ${cargoCount} cargo aboard` : ""}`;
  }
  renderSelectionQueues(selectedStructures, selectedUnits);

  const canOverdrive = selectedUnits.some((unit) => {
    const ability = UNIT_DEFINITIONS[unit.type].abilities?.overdrive;
    return ability && unit.state === "active" && unit.energy >= ability.energyCost;
  });
  overdriveButton.disabled = !canOverdrive;
  unitCommands.hidden = matchEnded || selectedUnits.length === 0;
  const selectedTransportUnits = selectedUnits.filter(
    (unit) => UNIT_DEFINITIONS[unit.type].transportCapacity,
  );
  const primaryTransport = selectedTransportUnits[0];
  transportCommands.hidden = matchEnded || selectedTransportUnits.length === 0;
  transportLoadButton.disabled = !primaryTransport ||
    simulation.transportReservedSlots(primaryTransport) >=
      UNIT_DEFINITIONS[primaryTransport.type].transportCapacity;
  transportFillButton.disabled = selectedTransportUnits.length === 0 ||
    selectedTransportUnits.every(
      (unit) =>
        simulation.transportReservedSlots(unit) >= UNIT_DEFINITIONS[unit.type].transportCapacity,
    );
  transportDropButton.disabled = !selectedTransportUnits.some(
    (unit) => (unit.cargoUnitIds || []).length > 0,
  );

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
        ? `Requires ${definition.metalCost.toLocaleString()} crystal`
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
  const hasMatchingFactorySelection = Boolean(
    selectedStructures.length > 0 &&
    factoryDefinition?.production &&
    selectedStructures.every(
      (structure) =>
        structure.complete &&
        structure.type === selectedStructure.type &&
        STRUCTURE_DEFINITIONS[structure.type].production,
    )
  );
  const availableProduction = hasMatchingFactorySelection
    ? factoryDefinition.production
    : [];
  const hasPoweredSelectedFactory = selectedStructures.some((structure) => structure.powered);
  productionCommands.hidden = matchEnded || availableProduction.length === 0;
  for (const [unitType, button] of productionButtons) {
    const available = availableProduction.includes(unitType);
    const unitDefinition = UNIT_DEFINITIONS[unitType];
    button.hidden = !available;
    button.disabled =
      !hasPoweredSelectedFactory ||
      localResources.metal < unitDefinition.metalCost ||
      playerSupply.remaining < unitDefinition.supplyCost;
  }

  const canCancelConstruction = Boolean(
    selectedStructures.length === 1 && selectedStructure && !selectedStructure.complete,
  );
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
    selectedStructures.length === 1 &&
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
      supplyUpgradeDetails.textContent = `${upgrade.metalCost.toLocaleString()} crystal · ${upgrade.upgradeTime}s · ${upgrade.capacity.toLocaleString()} capacity`;
      supplyUpgradeButton.disabled = localResources.metal < upgrade.metalCost;
    }
  }
  const buildingUpgrade = selectedStructures.length === 1 && selectedStructure?.complete
    ? simulation.getStructureUpgradeInfo(selectedStructure.id)
    : null;
  const canShowBuildingUpgrade = Boolean(buildingUpgrade?.targetType);
  buildingUpgradeButton.hidden = !canShowBuildingUpgrade;
  if (canShowBuildingUpgrade) {
    const targetDefinition = STRUCTURE_DEFINITIONS[buildingUpgrade.targetType];
    buildingUpgradeTitle.textContent = `Upgrade to ${targetDefinition.name}`;
    const roleSummary = describeStructureRole(targetDefinition);
    buildingUpgradeDetails.textContent = buildingUpgrade.valid
      ? `${buildingUpgrade.metalCost.toLocaleString()} crystal · immediate${roleSummary ? ` · ${roleSummary}` : ""}`
      : buildingUpgrade.reason;
    buildingUpgradeButton.disabled = !buildingUpgrade.valid;
  }
  structureCommands.hidden =
    matchEnded || (!canCancelConstruction && !canShowSupplyUpgrade && !canShowBuildingUpgrade);

  const lowEnergyUnits = simulation.units.filter(
    (unit) =>
      unit.alive &&
      !unit.carriedById &&
      unit.team === localTeam &&
      energyRatio(unit) <= SIMULATION_RULES.lowEnergyRatio,
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
  const guestStateDelayed =
    matchMode === "multiplayer_guest" &&
    multiplayerConnected &&
    performance.now() - lastHostStateReceivedAt > 3000;
  if (isMultiplayer() && peerSession && !multiplayerConnected) {
    statusBanner.hidden = false;
    statusBanner.textContent = "MULTIPLAYER CONNECTION LOST · LEAVE MATCH TO RECONNECT";
  } else if (guestStateDelayed) {
    statusBanner.hidden = false;
    statusBanner.textContent = "WAITING FOR HOST STATE · INPUTS REMAIN QUEUED";
  } else if (multiplayerSyncMessage) {
    statusBanner.hidden = false;
    statusBanner.textContent = multiplayerSyncMessage;
  } else if (forceMoveArmed) {
    statusBanner.hidden = false;
    statusBanner.textContent = "FORCE MOVE ARMED · RIGHT-CLICK DESTINATION · ESC TO CANCEL";
  } else if (testerSpawnPlacement) {
    const definition = testerSpawnPlacement.kind === "structure"
      ? STRUCTURE_DEFINITIONS[testerSpawnPlacement.type]
      : UNIT_DEFINITIONS[testerSpawnPlacement.type];
    const teamName = simulation.teams.find((team) => team.id === testerSpawnPlacement.team)?.name;
    statusBanner.hidden = false;
    statusBanner.textContent = placementMessage || `PLACE ${teamName?.toUpperCase()} ${definition.name.toUpperCase()} · HOLD SHIFT FOR MORE · RIGHT-CLICK TO CANCEL`;
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
      return unit?.alive && !unit.carriedById && unit.team === localTeam;
    }),
  );
  selectStructures(getSelectedStructures());
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
  if (testerSpawnPlacement?.kind === "unit") {
    const placement = simulation.evaluateUnitPlacement(
      testerSpawnPlacement.type,
      placementCursor.x,
      placementCursor.y,
    );
    placementMessage = placement.valid ? null : placement.reason.toUpperCase();
  } else {
    const activePlacement = activeStructurePlacement();
    if (activePlacement) {
      const placement = simulation.evaluatePlacement(
        activePlacement.structureType,
        placementCursor.x,
        placementCursor.y,
        activePlacement.team,
      );
      placementMessage = placement.valid ? null : placement.reason.toUpperCase();
    }
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
    if (!unit.alive || unit.carriedById || (team && unit.team !== team)) return false;
    const position = presentedPosition(unit);
    const hitRadius = Math.max(
      UNIT_DEFINITIONS[unit.type].radius + 8,
      strategicIconWorldSize(camera.zoom, 10),
    );
    return Math.hypot(position.x - point.x, position.y - point.y) <= hitRadius;
  });
  return candidates.sort((left, right) => {
    const leftDefinition = UNIT_DEFINITIONS[left.type];
    const rightDefinition = UNIT_DEFINITIONS[right.type];
    const layerPriority = (definition) =>
      definition.transportCapacity ? 2 : definition.movementLayer === "air" ? 1 : 0;
    return layerPriority(leftDefinition) - layerPriority(rightDefinition);
  }).at(-1) || null;
}

function findStructureAt(point, team = null) {
  const candidates = simulation.structures.filter((structure) => {
    if (!structure.alive || (team && structure.team !== team)) return false;
    const footprint = structureFootprint(structure.type);
    const hitPadding = Math.max(7, strategicIconWorldSize(camera.zoom, 7));
    return (
      Math.abs(structure.x - point.x) <= footprint.halfWidth + hitPadding &&
      Math.abs(structure.y - point.y) <= footprint.halfHeight + hitPadding
    );
  });
  return candidates.at(-1) || null;
}

function maximumEntityHp(entity) {
  if (entity?.kind === "unit") return UNIT_DEFINITIONS[entity.type]?.maxHp || 0;
  if (entity?.kind === "structure") return STRUCTURE_DEFINITIONS[entity.type]?.maxHp || 0;
  return 0;
}

function matchingFactoryGroup(factories) {
  const groups = new Map();
  for (const factory of factories) {
    const group = groups.get(factory.type) || [];
    group.push(factory);
    groups.set(factory.type, group);
  }
  return [...groups.values()].reduce(
    (largest, group) => group.length > largest.length ? group : largest,
    [],
  );
}

function findEnemyAt(point) {
  const candidates = [
    ...simulation.units.filter(
      (entity) => entity.alive && !entity.carriedById && entity.team !== localTeam,
    ),
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
      const position = presentedPosition(entity);
      const hitRadius = Math.max(
        radius + 10,
        strategicIconWorldSize(camera.zoom, entity.kind === "structure" ? 11 : 9),
      );
      return Math.hypot(position.x - point.x, position.y - point.y) <= hitRadius;
    }) || null
  );
}

canvas.addEventListener("mousedown", (event) => {
  if (simulation.matchResult || event.button !== 0) return;
  pointerScreen = canvasScreenPoint(event);
  const minimapLayout = currentMinimapLayout();
  if (minimapContains(minimapLayout, pointerScreen)) {
    const minimapTarget = minimapWorldPoint(minimapLayout, pointerScreen);
    if (minimapTarget) {
      camera.x = minimapTarget.x;
      camera.y = minimapTarget.y;
      clampCamera();
      syncPointerToCamera();
    }
    selectionDrag = null;
    return;
  }
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
    minimumCameraZoom(),
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

function placeTesterSpawn(point, keepActive = false) {
  if (!testerSpawnPlacement) return false;
  const command = testerSpawnPlacement.kind === "structure"
    ? {
      type: "tester_spawn_structure",
      ownerTeam: testerSpawnPlacement.team,
      structureType: testerSpawnPlacement.type,
      x: point.x,
      y: point.y,
    }
    : {
      type: "tester_spawn_unit",
      ownerTeam: testerSpawnPlacement.team,
      unitType: testerSpawnPlacement.type,
      x: point.x,
      y: point.y,
    };
  const accepted = issueGameCommand(command);
  if (accepted) {
    placementMessage = null;
    if (!keepActive) {
      testerSpawnPlacement = null;
      placementCursor = null;
    }
  } else {
    placementMessage = (simulation.lastPlacementError || "Invalid tester spawn location.").toUpperCase();
  }
  updateInterface();
  return Boolean(accepted);
}

canvas.addEventListener("mouseup", (event) => {
  if (event.button !== 0 || !selectionDrag) return;
  const drag = selectionDrag;
  selectionDrag = null;

  if (testerSpawnPlacement) {
    placeTesterSpawn(drag.current, drag.shift);
    return;
  }

  if (placementStructureType) {
    placeConstruction(drag.current, drag.shift);
    return;
  }

  if (drag.moved) {
    const left = Math.min(drag.start.x, drag.current.x);
    const right = Math.max(drag.start.x, drag.current.x);
    const top = Math.min(drag.start.y, drag.current.y);
    const bottom = Math.max(drag.start.y, drag.current.y);
    const boxedUnits = simulation.units.filter((unit) => {
      if (!unit.alive || unit.carriedById || unit.team !== localTeam) return false;
      const position = presentedPosition(unit);
      return position.x >= left && position.x <= right && position.y >= top && position.y <= bottom;
    });
    const boxedFactories = simulation.structures.filter((structure) => {
      const definition = STRUCTURE_DEFINITIONS[structure.type];
      return (
        structure.alive &&
        structure.complete &&
        structure.team === localTeam &&
        definition.production &&
        structure.x >= left &&
        structure.x <= right &&
        structure.y >= top &&
        structure.y <= bottom
      );
    });
    const factoryGroup = matchingFactoryGroup(boxedFactories);
    const selectFactoryGroup = factoryGroup.length > 1 || (factoryGroup.length === 1 && boxedUnits.length === 0);
    if (selectFactoryGroup) {
      const existingStructures = getSelectedStructures();
      const matchingExisting = drag.shift && existingStructures.every(
        (structure) => structure.type === factoryGroup[0].type,
      )
        ? existingStructures
        : [];
      selectStructures([...new Map(
        [...matchingExisting, ...factoryGroup].map((structure) => [structure.id, structure]),
      ).values()]);
      selectedUnitIds.clear();
    } else {
      if (!drag.shift) selectedUnitIds.clear();
      for (const unit of boxedUnits) selectedUnitIds.add(unit.id);
      selectStructures([]);
    }
  } else {
    const unit = findUnitAt(drag.current, localTeam);
    const structure = unit ? null : findStructureAt(drag.current, localTeam);
    if (!drag.shift) {
      selectedUnitIds.clear();
      selectStructures([]);
    }
    if (unit) {
      if (drag.shift && selectedUnitIds.has(unit.id)) selectedUnitIds.delete(unit.id);
      else selectedUnitIds.add(unit.id);
      selectStructures([]);
    } else if (structure) {
      selectStructures([structure]);
      selectedUnitIds.clear();
    }
  }
  updateInterface();
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  if (simulation.matchResult) return;
  const screenPoint = canvasScreenPoint(event);
  const minimapLayout = currentMinimapLayout();
  if (minimapContains(minimapLayout, screenPoint)) {
    const minimapTarget = minimapWorldPoint(minimapLayout, screenPoint);
    if (
      minimapTarget &&
      selectedUnitIds.size > 0 &&
      !testerSpawnPlacement &&
      !placementStructureType
    ) {
      issueSelectedUnitMove(minimapTarget);
    }
    return;
  }
  if (testerSpawnPlacement || placementStructureType) {
    testerSpawnPlacement = null;
    placementStructureType = null;
    placementMessage = null;
    placementCursor = null;
    updateInterface();
    return;
  }
  const point = canvasPoint(event);
  const selectedStructures = getSelectedStructures();
  const selectedStructure = selectedStructures[0];
  if (
    selectedStructure?.team === localTeam &&
    STRUCTURE_DEFINITIONS[selectedStructure.type].production &&
    issueGameCommand({
      type: "rally",
      structureIds: selectedStructures.map((structure) => structure.id),
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
    const friendlyUnit = findUnitAt(point, localTeam);
    const friendlyStructure = findStructureAt(point, localTeam);
    if (
      friendlyUnit &&
      UNIT_DEFINITIONS[friendlyUnit.type].transportCapacity &&
      issueGameCommand({
        type: "load",
        unitIds: [...selectedUnitIds].filter((id) => id !== friendlyUnit.id),
        transportId: friendlyUnit.id,
      })
    ) {
      updateInterface();
      return;
    }
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
    const hasSelectedWorker = [...selectedUnitIds].some((id) => {
      const unit = simulation.getUnit(id);
      return unit?.alive && UNIT_DEFINITIONS[unit.type].workerTier;
    });
    if (
      hasSelectedWorker &&
      friendlyStructure?.complete &&
      STRUCTURE_DEFINITIONS[friendlyStructure.type].production &&
      simulation.isFactoryActivelyProducing(friendlyStructure.id)
    ) {
      issueGameCommand({
        type: "assist_production",
        unitIds: [...selectedUnitIds],
        structureId: friendlyStructure.id,
      });
      updateInterface();
      return;
    }
    const repairTarget = friendlyUnit || friendlyStructure;
    if (
      hasSelectedWorker &&
      repairTarget?.alive &&
      repairTarget.hp < maximumEntityHp(repairTarget)
    ) {
      issueGameCommand({
        type: "repair",
        unitIds: [...selectedUnitIds],
        targetId: repairTarget.id,
      });
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

  issueSelectedUnitMove(point);
});

function issueSelectedUnitMove(point) {
  const selected = [...selectedUnitIds];
  if (selected.length === 0) return false;
  const forceMove = forceMoveArmed;
  const columns = Math.ceil(Math.sqrt(selected.length));
  const orders = selected.map((id, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const offsetX = (column - (columns - 1) / 2) * 44;
    const offsetY = (row - (Math.ceil(selected.length / columns) - 1) / 2) * 44;
    return { unitId: id, x: point.x + offsetX, y: point.y + offsetY };
  });
  const accepted = issueGameCommand({ type: "move", orders, force: forceMove });
  forceMoveArmed = false;
  updateInterface();
  return Boolean(accepted);
}

function selectedTransports() {
  return [...selectedUnitIds]
    .map((id) => simulation.getUnit(id))
    .filter(
      (unit) =>
        unit?.alive &&
        !unit.carriedById &&
        UNIT_DEFINITIONS[unit.type].transportCapacity,
    );
}

function fillOneSelectedTransport() {
  const transport = selectedTransports()[0];
  if (!transport) return false;
  const selectedPassengers = [...selectedUnitIds].filter((id) => {
    const unit = simulation.getUnit(id);
    const definition = unit && UNIT_DEFINITIONS[unit.type];
    return (
      unit?.alive &&
      unit.id !== transport.id &&
      !unit.carriedById &&
      definition.movementLayer !== "air" &&
      !definition.transportCapacity
    );
  });
  const accepted = issueGameCommand(
    selectedPassengers.length > 0
      ? { type: "load", unitIds: selectedPassengers, transportId: transport.id }
      : { type: "fill_transports", transportIds: [transport.id] },
  );
  updateInterface();
  return Boolean(accepted);
}

function fillAllSelectedTransports() {
  const transports = selectedTransports();
  if (transports.length === 0) return false;
  const accepted = issueGameCommand({
    type: "fill_transports",
    transportIds: transports.map((transport) => transport.id),
  });
  updateInterface();
  return Boolean(accepted);
}

function unloadSelectedTransports() {
  const transports = selectedTransports();
  if (transports.length === 0) return false;
  const accepted = issueGameCommand({
    type: "unload_transports",
    transportIds: transports.map((transport) => transport.id),
  });
  updateInterface();
  return Boolean(accepted);
}

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
  selectStructures([]);
  updateInterface();
  return true;
}

overdriveButton.addEventListener("click", activateOverdrive);
transportLoadButton.addEventListener("click", fillOneSelectedTransport);
transportFillButton.addEventListener("click", fillAllSelectedTransports);
transportDropButton.addEventListener("click", unloadSelectedTransports);
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
function armTesterSpawn(kind) {
  if (!simulation.isTesterTeam(localTeam) || !testerSpawnTeam.value) return;
  placementStructureType = null;
  testerSpawnPlacement = {
    kind,
    team: testerSpawnTeam.value,
    type: kind === "structure" ? testerSpawnStructure.value : testerSpawnUnit.value,
  };
  placementMessage = null;
  placementCursor = pointerScreen ? screenToWorld(pointerScreen) : null;
  forceMoveArmed = false;
  updateInterface();
}
testerPlaceStructureButton.addEventListener("click", () => armTesterSpawn("structure"));
testerPlaceUnitButton.addEventListener("click", () => armTesterSpawn("unit"));
testerSpawnTeam.addEventListener("change", () => {
  if (testerSpawnPlacement) testerSpawnPlacement.team = testerSpawnTeam.value;
  syncPointerToCamera();
  updateInterface();
});
testerSpawnStructure.addEventListener("change", () => {
  if (testerSpawnPlacement?.kind === "structure") {
    testerSpawnPlacement.type = testerSpawnStructure.value;
    syncPointerToCamera();
    updateInterface();
  }
});
testerSpawnUnit.addEventListener("change", () => {
  if (testerSpawnPlacement?.kind === "unit") {
    testerSpawnPlacement.type = testerSpawnUnit.value;
    syncPointerToCamera();
    updateInterface();
  }
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
unitTesterButton.addEventListener("click", showUnitTesterSetup);
unitTesterCount.addEventListener("change", updateUnitTesterMapDescription);
unitTesterMap.addEventListener("change", updateUnitTesterMapDescription);
startUnitTesterButton.addEventListener("click", startUnitTester);
backFromUnitTesterButton.addEventListener("click", () => {
  unitTesterSetup.hidden = true;
  modeChoices.hidden = false;
});
multiplayerButton.addEventListener("click", () => {
  modeChoices.hidden = true;
  singlePlayerSetup.hidden = true;
  unitTesterSetup.hidden = true;
  multiplayerSetup.hidden = false;
  setConnectionStatus("Create a lobby or enter a lobby code to begin.");
});
backToModesButton.addEventListener("click", returnToMenu);
createHostButton.addEventListener("click", createHostMatch);
copyLobbyCodeButton.addEventListener("click", copyLobbyCode);
joinLobbyButton.addEventListener("click", joinMultiplayerLobby);
addAiButton.addEventListener("click", () => {
  const playerCount = lobbyRoster().length;
  if (playerCount < 8) updateHostedLobby({ botCount: multiplayerLobby.botCount + 1 });
});
removeAiButton.addEventListener("click", () => {
  if (multiplayerLobby?.botCount > 0) {
    updateHostedLobby({ botCount: multiplayerLobby.botCount - 1 });
  }
});
startLobbyMatchButton.addEventListener("click", startHostedLobbyMatch);
joinLobbyCode.addEventListener("input", () => {
  joinLobbyCode.value = normalizeLobbyCode(joinLobbyCode.value);
  joinLobbyButton.disabled = !isValidLobbyCode(joinLobbyCode.value);
});
joinLobbyCode.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !isValidLobbyCode(joinLobbyCode.value)) return;
  event.preventDefault();
  joinMultiplayerLobby();
});

window.addEventListener("keydown", (event) => {
  if (matchMode === "menu") return;
  const key = event.key.toLowerCase();
  if (simulation.matchResult) return;
  const transportHotkeyActive = key === "d" && selectedTransports().length > 0;
  if (["w", "a", "s", "d"].includes(key) && !transportHotkeyActive) {
    event.preventDefault();
    cameraKeys.add(key);
  }
  if (key === "q" && !event.repeat) activateOverdrive();
  if (key === "f" && !event.repeat) fillOneSelectedTransport();
  if (key === "l" && !event.repeat) fillAllSelectedTransports();
  if (key === "d" && transportHotkeyActive && !event.repeat) {
    event.preventDefault();
    cameraKeys.delete("d");
    unloadSelectedTransports();
  }
  if (key === "c" && !event.repeat) cancelSelectedConstruction();
  if (key === "g" && !event.repeat) {
    forceMoveArmed = true;
    testerSpawnPlacement = null;
    placementStructureType = null;
    placementMessage = null;
    placementCursor = null;
    updateInterface();
  }
  if (event.key === "Escape") {
    forceMoveArmed = false;
    testerSpawnPlacement = null;
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
setInterval(runAuthoritativeSimulationHeartbeat, fixedStep * 1000);
requestAnimationFrame(frame);
