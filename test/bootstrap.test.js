import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("the static bootstrap requests a fresh, consistent local module set", async () => {
  const [index, game, maps, simulation] = await Promise.all([
    source("../index.html"),
    source("../src/game.js"),
    source("../src/maps.js"),
    source("../src/simulation.js"),
  ]);

  assert.match(index, /Date\.now\(\)\.toString\(36\)/);
  assert.match(index, /import\(`\.\/src\/game\.js\?v=\$\{version\}`\)/);
  for (const moduleSource of [game, maps, simulation]) {
    assert.match(moduleSource, /new URL\(import\.meta\.url\)\.searchParams\.get\("v"\)/);
    assert.match(moduleSource, /versionSuffix/);
  }
  assert.match(game, /`\.\/maps\.js\$\{versionSuffix\}`/);
  assert.match(game, /`\.\/minimap\.js\$\{versionSuffix\}`/);
  assert.match(game, /`\.\/simulation\.js\$\{versionSuffix\}`/);
  assert.match(game, /`\.\/simulation-clock\.js\$\{versionSuffix\}`/);
  assert.match(game, /`\.\/network-presentation\.js\$\{versionSuffix\}`/);
  assert.match(game, /`\.\/determinism\.js\$\{versionSuffix\}`/);
  assert.match(game, /`\.\/queue-status\.js\$\{versionSuffix\}`/);
  assert.match(game, /`\.\/command-indicators\.js\$\{versionSuffix\}`/);
  assert.match(game, /`\.\/strategic-view\.js\$\{versionSuffix\}`/);
  assert.match(game, /snapshotSendRemaining = MULTIPLAYER_STATE_INTERVAL_SECONDS/);
  assert.match(game, /motionSendRemaining = MULTIPLAYER_MOTION_INTERVAL_SECONDS/);
  assert.match(game, /createMultiplayerMotionUpdate\(/);
  assert.match(game, /guestPositionSmoother\.transitionTo/);
  assert.match(maps, /`\.\/data\.js\$\{versionSuffix\}`/);
  assert.match(simulation, /`\.\/maps\.js\$\{versionSuffix\}`/);
  assert.match(simulation, /`\.\/determinism\.js\$\{versionSuffix\}`/);
  assert.match(game, /processAuthoritativeCommands\(simulation\.tickNumber \+ 1\)/);
  assert.match(game, /simulation\.fixedTick\(\)/);
  assert.match(game, /createDeterministicStateMessage\(\{/);
});

test("the tactical minimap routes right-clicks into unit moves and factory rallies", async () => {
  const [index, game] = await Promise.all([
    source("../index.html"),
    source("../src/game.js"),
  ]);

  assert.match(game, /minimapWorldPoint\(minimapLayout, screenPoint\)/);
  assert.match(game, /issueSelectedFactoryRally\(minimapTarget\)/);
  assert.match(game, /issueSelectedUnitMove\(minimapTarget, event\.shiftKey\)/);
  assert.match(game, /queue: Boolean\(queue\)/);
  assert.match(game, /TACTICAL MAP · L:CENTER · R:MOVE\/RALLY/);
  assert.match(index, /right-click it with units selected to move them or with factories selected to set their rally point/);
});

test("the Patrol command records an arbitrary closed route before issuing it", async () => {
  const [index, game, simulation] = await Promise.all([
    source("../index.html"),
    source("../src/game.js"),
    source("../src/simulation.js"),
  ]);

  assert.match(index, /id="patrol-button"/);
  assert.match(index, /P · Patrol/);
  assert.match(index, /Press <b>P<\/b> or click <b>Patrol<\/b>/);
  assert.match(game, /function togglePatrolRecording\(\)/);
  assert.match(game, /function recordPatrolPoint\(point\)/);
  assert.match(game, /patrolDraft\.points\.push/);
  assert.match(game, /patrolDraft\.points\.length < 2/);
  assert.match(game, /issueGameCommand\(\{ type: "patrol", orders \}\)/);
  assert.match(game, /patrolButton\.addEventListener\("click", togglePatrolRecording\)/);
  assert.match(game, /key === "p" && !event\.repeat[\s\S]*?event\.preventDefault\(\);[\s\S]*?togglePatrolRecording\(\)/);
  assert.match(game, /if \(patrolDraft\) \{\s*recordPatrolPoint\(minimapTarget\)/);
  assert.match(game, /movementOrderLoops\(unit\)/);
  assert.match(game, /case "patrol"/);
  assert.match(simulation, /commandPatrol\(unitIds, points\)/);
});

test("nuclear launcher controls authorize construction, targeting, and launch", async () => {
  const [index, game] = await Promise.all([
    source("../index.html"),
    source("../src/game.js"),
  ]);

  assert.match(index, /id="construct-nuclear-missile-button"/);
  assert.match(index, /id="launch-nuclear-missile-button"/);
  assert.match(game, /case "nuclear_construct"/);
  assert.match(game, /case "nuclear_target"/);
  assert.match(game, /case "nuclear_launch"/);
  assert.match(game, /issueSelectedNuclearTarget\(minimapTarget\)/);
  assert.match(game, /issueSelectedNuclearTarget\(point\)/);
  assert.match(game, /simulation\.queueNuclearMissile\(structure\.id\)/);
  assert.match(game, /simulation\.setNuclearTarget\(structure\.id, command\.x, command\.y\)/);
  assert.match(game, /simulation\.launchNuclearMissile\(structure\.id\)/);
});

test("the Frontline Annihilator uses the sentry turret renderer", async () => {
  const [data, game] = await Promise.all([
    source("../src/data.js"),
    source("../src/game.js"),
  ]);

  assert.match(data, /spawn_fortress_turret:[\s\S]*?renderFamily: "sentry_turret"/);
  assert.match(game, /const renderFamily = definition\.renderFamily \|\| family/);
  assert.match(game, /renderFamily === "sentry_turret"\) drawSentryBuilding/);
});

test("unit command authorization accepts the complete simulated army", async () => {
  const game = await source("../src/game.js");
  const authorization = game.match(
    /function boundedUnitCommandEntries[\s\S]*?function issueGameCommand/,
  );

  assert.ok(authorization);
  assert.match(authorization[0], /entries\.slice\(0, simulation\.units\.length\)/);
  assert.match(authorization[0], /boundedUnitCommandEntries\(command\.orders\)/);
  assert.doesNotMatch(authorization[0], /ids\.slice\(0, 200\)/);
  assert.doesNotMatch(authorization[0], /command\.orders\.slice\(0, 200\)/);
});

test("double-click selection uses exact unit type without crossing tiers", async () => {
  const [index, game] = await Promise.all([
    source("../index.html"),
    source("../src/game.js"),
  ]);

  assert.match(game, /`\.\/selection\.js\$\{versionSuffix\}`/);
  assert.match(game, /canvas\.addEventListener\("dblclick"/);
  assert.match(game, /selectableUnitIdsByExactTypeNear\(simulation\.units/);
  assert.match(game, /type: unit\.type/);
  assert.match(game, /x: unit\.x/);
  assert.match(game, /y: unit\.y/);
  assert.match(game, /if \(!event\.shiftKey\) selectedUnitIds\.clear\(\)/);
  assert.match(index, /Double-click a unit to select nearby deployed units of that exact type and tier/);
});

test("Dropship fill commands stay on keyboard shortcuts while Drop All remains contextual", async () => {
  const [index, game, styles] = await Promise.all([
    source("../index.html"),
    source("../src/game.js"),
    source("../styles.css"),
  ]);

  assert.doesNotMatch(index, /id="transport-load-button"|F · Fill One/);
  assert.doesNotMatch(index, /id="transport-fill-button"|L · Fill All/);
  assert.match(index, /id="transport-drop-button"[^>]*>[\s\S]*?U · Drop All/);
  assert.match(styles, /\.command-grid\[hidden\]\s*\{\s*display: none;/);
  assert.doesNotMatch(game, /transportLoadButton|transportFillButton/);
  assert.match(game, /case "load"/);
  assert.match(game, /case "fill_transports"/);
  assert.match(game, /case "unload_transports"/);
  assert.match(game, /key === "f" && hasSelectedTransport[\s\S]*?event\.preventDefault\(\);[\s\S]*?fillOneSelectedTransport/);
  assert.match(game, /key === "l" && hasSelectedTransport[\s\S]*?event\.preventDefault\(\);[\s\S]*?fillAllSelectedTransports/);
  assert.match(game, /key === "u" && hasSelectedTransport[\s\S]*?event\.preventDefault\(\);[\s\S]*?unloadSelectedTransports/);
  assert.match(game, /unit\.state === "active"[\s\S]*?unit\.team === transport\.team[\s\S]*?!definition\.transportCapacity/);
  assert.match(game, /\["w", "a", "s", "d"\]\.includes\(key\)[\s\S]*?cameraKeys\.add\(key\)/);
  assert.doesNotMatch(game, /key === "d"[\s\S]*?unloadSelectedTransports/);
});

test("the battlefield, minimap, effects, and targeting share fog visibility", async () => {
  const [index, game] = await Promise.all([
    source("../index.html"),
    source("../src/game.js"),
  ]);

  assert.match(game, /renderVisionSources = simulation\.getVisionSources\(localTeam\)/);
  assert.match(game, /drawFogOfWar\(\)/);
  assert.match(game, /drawFogOfWar\(\);\s*drawCrystalDepositBeacons\(occupiedDepositIds\)/);
  assert.match(game, /fogContext\.globalCompositeOperation = "destination-out"/);
  assert.match(game, /context\.drawImage\(fogCanvas, 0, 0\)/);
  assert.match(game, /minimapFogContext\.globalCompositeOperation = "destination-out"/);
  assert.match(
    game,
    /context\.drawImage\(minimapFogCanvas, layout\.mapLeft, layout\.mapTop\);\s*drawMinimapCrystalDeposits\(layout\)/,
  );
  assert.match(game, /entityIsVisibleToLocalTeam\(structure\)/);
  assert.match(game, /pointIsVisibleToLocalTeam\(eventPosition\.x, eventPosition\.y, 20\)/);
  assert.match(
    game,
    /function attackEventTargetPosition[\s\S]*event\.tracksTarget[\s\S]*presentedPosition\(target\)/,
  );
  assert.match(game, /findEnemyAt[\s\S]*entityIsVisibleToLocalTeam\(entity\)/);
  assert.match(game, /command\.unitIds,[\s\S]*requireVision: true/);
  assert.doesNotMatch(game, /reducedDetailViewActive|drawReducedDetailEntities|PERFORMANCE DETAIL/);
  assert.match(index, /Fog of war hides enemy contacts/);
});

test("fog masks batch large-army vision circles into one fill operation", async () => {
  const game = await source("../src/game.js");
  const battlefieldFog = game.match(
    /function drawFogOfWar\(\) \{[\s\S]*?function worldRectIsVisible/,
  );

  assert.ok(battlefieldFog);
  assert.match(
    battlefieldFog[0],
    /fogContext\.beginPath\(\);[\s\S]*?for \(const source of renderVisionSources\)[\s\S]*?fogContext\.arc\([\s\S]*?\n  \}[\s\S]*?fogContext\.fill\(\);/,
  );
  assert.match(
    game,
    /minimapFogContext\.beginPath\(\);[\s\S]*?for \(const source of renderVisionSources\)[\s\S]*?minimapFogContext\.arc\([\s\S]*?\n  \}[\s\S]*?minimapFogContext\.fill\(\);/,
  );
});

test("completed Shield Turrets always render their cyan shield-strength bar", async () => {
  const game = await source("../src/game.js");
  const shieldBarBlock = game.match(
    /if \(definition\.shieldCapacity && structure\.complete\) \{[\s\S]*?colors\.shield,[\s\S]*?\n  \}/,
  );

  assert.ok(shieldBarBlock, "the renderer should draw a cyan bar for every completed shield");
  assert.doesNotMatch(shieldBarBlock[0], /selectedStructureIds/);
});

test("the Hexapod renderer uses an elongated hull, tri-claw feet, and armored turrets", async () => {
  const game = await source("../src/game.js");
  const renderer = game.match(
    /const HEXAPOD_FOOT_CLAW_COUNT[\s\S]*?function drawZenithDoughnutSprite/,
  );

  assert.ok(renderer);
  assert.match(renderer[0], /HEXAPOD_FOOT_CLAW_COUNT = 3/);
  assert.match(renderer[0], /clawIndex \* \(\(Math\.PI \* 2\) \/ HEXAPOD_FOOT_CLAW_COUNT\)/);
  assert.match(renderer[0], /function drawHexapodFoot/);
  assert.match(renderer[0], /context\.arc\(0, 0, 0\.12, 0, Math\.PI \* 2\)/);
  assert.match(renderer[0], /HEXAPOD_HULL_FRONT = -1\.2/);
  assert.match(renderer[0], /HEXAPOD_HULL_REAR = 1\.18/);
  assert.match(renderer[0], /function drawHexapodTurret/);
  assert.match(renderer[0], /baseRadius: 0\.27/);
  assert.match(renderer[0], /bodyHalfWidth: 0\.24/);
  assert.match(renderer[0], /HEXAPOD_FLAK_MOUNTS = Object\.freeze/);
  assert.match(renderer[0], /function drawHexapodFlakTurret/);
  assert.match(renderer[0], /for \(const barrelX of \[-0\.038, 0\.038\]\)/);
  assert.match(game, /definition\.footprintHitbox \? definition\.radius : renderedRadius/);
});

test("conventional mechs and the Arsenal Colossus keep their feet hidden while moving", async () => {
  const game = await source("../src/game.js");
  const conventionalRenderer = game.match(
    /function drawMechSprite[\s\S]*?(?=\nfunction drawDrone)/,
  );
  const colossusRenderer = game.match(
    /function drawArsenalColossusSprite[\s\S]*?(?=\nconst HEXAPOD_FOOT_CLAW_COUNT)/,
  );

  assert.ok(conventionalRenderer);
  assert.ok(colossusRenderer);
  assert.doesNotMatch(conventionalRenderer[0], /pose\.moving|pose\.stride|footY/);
  assert.doesNotMatch(colossusRenderer[0], /pose\.moving|pose\.stride|footY/);
});

test("Spawn Wars controls show synchronized waves and uncapped upgrades", async () => {
  const game = await source("../src/game.js");

  assert.match(game, /spawns with each \$\{spawnWarsInterval\(unitDefinition\)\}s income payment/);
  assert.match(game, /next income \+ synchronized wave/);
  assert.match(game, /\$\{SPAWN_PAD_UPGRADES\[category\]\.label\} · Level \$\{level\}/);
  assert.match(game, /affects future spawns · no level cap/);
  assert.match(game, /const incomeCost = spawnWarsIncomeUpgradeCost\(incomeLevel\)/);
  assert.match(game, /raise income to level \$\{incomeLevel \+ 1\}/);
  assert.doesNotMatch(game, /Income level 3 maximum reached/);
  assert.doesNotMatch(game, /maximumUpgradeLevel/);
});

test("the Zenith Doughnut renderer shows two dorsal anti-air batteries", async () => {
  const game = await source("../src/game.js");
  const renderer = game.match(
    /const ZENITH_AA_MOUNT_OFFSETS[\s\S]*?function drawZenithUnderbellyBeam/,
  );

  assert.ok(renderer);
  assert.match(renderer[0], /Object\.freeze\(\[-0\.58, 0\.58\]\)/);
  assert.match(renderer[0], /for \(const mountX of ZENITH_AA_MOUNT_OFFSETS\)/);
  assert.match(renderer[0], /for \(const barrelOffset of \[-0\.055, 0\.055\]\)/);
});

test("higher-tier armed sprites render their data-driven weapon attachments", async () => {
  const [data, game] = await Promise.all([
    source("../src/data.js"),
    source("../src/game.js"),
  ]);

  assert.match(data, /spriteScale: definition\.spriteScale/);
  assert.match(data, /additionalWeaponHardpoints: definition\.additionalWeaponHardpoints/);
  assert.match(game, /context\.scale\(spriteScale, spriteScale\)/);
  assert.match(game, /drawUnitSprite\([\s\S]*?drawTierWeaponAttachments\(/);
  assert.match(game, /function drawTierWeaponAttachments\(/);
});

test("right-clicking an active friendly factory sends selected workers to assist production", async () => {
  const game = await source("../src/game.js");

  assert.match(game, /type: "assist_production"/);
  assert.match(game, /simulation\.commandAssistProduction\(/);
  assert.match(game, /simulation\.isFactoryActivelyProducing\(friendlyStructure\.id\)/);
});

test("worker controls upgrade one tier and keep only one construction tier open", async () => {
  const [index, game] = await Promise.all([
    source("../index.html"),
    source("../src/game.js"),
  ]);

  assert.match(index, /id="worker-upgrade-button"/);
  assert.match(index, /id="build-command-grid"/);
  assert.match(game, /case "worker_upgrade"/);
  assert.match(game, /simulation\.upgradeWorkers\(/);
  assert.match(game, /type: "worker_upgrade"/);
  assert.match(game, /className = "build-tier-tabs"/);
  assert.match(game, /className = "build-tier-panels"/);
  assert.match(
    game,
    /for \(const \[otherTier, controls\] of buildTierControls\)[\s\S]*?controls\.toggle\.setAttribute\("aria-expanded", "false"\);[\s\S]*?controls\.grid\.hidden = true;/,
  );
});

test("selected completed buildings expose an authorized destroy command", async () => {
  const [index, game] = await Promise.all([
    source("../index.html"),
    source("../src/game.js"),
  ]);

  assert.match(index, /id="destroy-structure-button"[\s\S]*?Destroy Building/);
  assert.match(game, /case "destroy_structure"[\s\S]*?simulation\.destroyStructure\(structure\.id, team\)/);
  assert.match(game, /selectedStructures\.length === 1 && selectedStructure\?\.complete/);
  assert.match(game, /type: "destroy_structure"/);
  assert.match(game, /destroyStructureButton\.addEventListener\("click", destroySelectedStructure\)/);
});

test("Spawn Wars platforms expose authoritative move and refund controls", async () => {
  const [index, game, simulation, spawnWars] = await Promise.all([
    source("../index.html"),
    source("../src/game.js"),
    source("../src/simulation.js"),
    source("../src/spawn-wars.js"),
  ]);

  assert.match(index, /id="spawn-pad-move-button"[\s\S]*?Move Building/);
  assert.match(index, /destroy it for a 75% crystal refund/);
  assert.match(game, /case "spawn_pad_move"[\s\S]*?simulation\.moveSpawnPad\(/);
  assert.match(game, /type: "spawn_pad_move"/);
  assert.match(game, /spawnPadMoveButton\.addEventListener\("click"/);
  assert.match(simulation, /spawnWarsPadDestroyRefund\(padCost\)/);
  assert.match(simulation, /moveSpawnPad\(structureId, x, y, teamId\)/);
  assert.match(spawnWars, /padDestroyRefundRatio: 0\.75/);
});

test("the interface and battlefield present the economy as crimson crystal", async () => {
  const [index, game, data, styles] = await Promise.all([
    source("../index.html"),
    source("../src/game.js"),
    source("../src/data.js"),
    source("../styles.css"),
  ]);

  assert.match(index, /class="crystal-icon"/);
  assert.match(index, />Crystal <strong id="crystal-value"/);
  assert.doesNotMatch(index, />Metal\b/);
  assert.match(data, /name: "Crystal Harvester"/);
  assert.match(game, /drawCrystalDeposits\(\)/);
  assert.match(game, /drawCrystalRemnants\(visibleBounds\)/);
  assert.match(game, /CRYSTAL SCRAP/);
  assert.match(styles, /\.crystal-icon/);
});

test("production controls disclose ground damage penalties", async () => {
  const game = await source("../src/game.js");

  assert.match(game, /definition\.groundDamageMultiplier[\s\S]*?× vs ground/);
});

test("unit selection is concise and uses one compact shared construction queue", async () => {
  const [index, game, styles] = await Promise.all([
    source("../index.html"),
    source("../src/game.js"),
    source("../styles.css"),
  ]);
  const singleUnitSummary = game.match(
    /else if \(selectedUnits\.length === 1\) \{[\s\S]*?\n  \} else \{/,
  );
  const constructionQueue = game.match(
    /function renderSelectionConstructionQueue[\s\S]*?function updateInterface/,
  );

  assert.ok(singleUnitSummary);
  assert.match(singleUnitSummary[0], /integrity[^`]*energy[^`]*IN STASIS[^`]*ACTIVE/);
  assert.doesNotMatch(singleUnitSummary[0], /roleDescription|visionRange|attackDamage|buildQueue/);
  assert.ok(constructionQueue);
  assert.match(constructionQueue[0], /describeSharedConstructionQueue/);
  assert.match(constructionQueue[0], /className = `construction-queue-icon/);
  assert.doesNotMatch(constructionQueue[0], /Worker queue/);
  assert.match(index, /id="selection-construction-queue"/);
  assert.match(styles, /\.construction-queue-icon[\s\S]*?width: 38px;[\s\S]*?height: 38px;/);
});

test("match setup exposes per-AI difficulty and team assignment controls", async () => {
  const [index, game, maps] = await Promise.all([
    source("../index.html"),
    source("../src/game.js"),
    source("../src/maps.js"),
  ]);

  assert.match(index, /id="single-player-commanders"/);
  assert.match(index, /id="unit-tester-commanders"/);
  assert.match(game, /AI_DIFFICULTIES/);
  assert.match(game, /difficulty\.dataset\.difficulty/);
  assert.match(game, /alliance\.dataset\.alliance/);
  assert.match(game, /commanderOptions: roster\.map/);
  assert.match(maps, /AI_DIFFICULTIES = Object\.freeze\(\["easy", "medium", "hard"\]\)/);
});
