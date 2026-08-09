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

test("the tactical minimap routes right-clicks into selected-unit move orders", async () => {
  const [index, game] = await Promise.all([
    source("../index.html"),
    source("../src/game.js"),
  ]);

  assert.match(game, /minimapWorldPoint\(minimapLayout, screenPoint\)/);
  assert.match(game, /issueSelectedUnitMove\(minimapTarget\)/);
  assert.match(game, /TACTICAL MAP · L:CENTER · R:MOVE/);
  assert.match(index, /right-click it with units selected to move them/);
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

test("Dropship controls expose explicit, balanced, and unload command paths", async () => {
  const [index, game] = await Promise.all([
    source("../index.html"),
    source("../src/game.js"),
  ]);

  assert.match(index, /id="transport-load-button"[^>]*>[\s\S]*?F · Fill One/);
  assert.match(index, /id="transport-fill-button"[^>]*>[\s\S]*?L · Fill All/);
  assert.match(index, /id="transport-drop-button"[^>]*>[\s\S]*?U · Drop All/);
  assert.match(game, /case "load"/);
  assert.match(game, /case "fill_transports"/);
  assert.match(game, /case "unload_transports"/);
  assert.match(game, /key === "f"[\s\S]*?fillOneSelectedTransport/);
  assert.match(game, /key === "l"[\s\S]*?fillAllSelectedTransports/);
  assert.match(game, /key === "u"[\s\S]*?unloadSelectedTransports/);
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
  assert.match(game, /entityIsVisibleToLocalTeam\(structure\)/);
  assert.match(game, /pointIsVisibleToLocalTeam\(event\.x, event\.y, 20\)/);
  assert.match(game, /findEnemyAt[\s\S]*entityIsVisibleToLocalTeam\(entity\)/);
  assert.match(game, /command\.unitIds,[\s\S]*requireVision: true/);
  assert.match(game, /reducedDetailViewActive\(camera\.zoom, visibleRenderEntityCount\(\)\)/);
  assert.match(game, /drawReducedDetailEntities\(\)/);
  assert.match(index, /Fog of war hides enemy contacts/);
});

test("completed Shield Turrets always render their cyan shield-strength bar", async () => {
  const game = await source("../src/game.js");
  const shieldBarBlock = game.match(
    /if \(definition\.shieldCapacity && structure\.complete\) \{[\s\S]*?colors\.shield,[\s\S]*?\n  \}/,
  );

  assert.ok(shieldBarBlock, "the renderer should draw a cyan bar for every completed shield");
  assert.doesNotMatch(shieldBarBlock[0], /selectedStructureIds/);
});

test("right-clicking an active friendly factory sends selected workers to assist production", async () => {
  const game = await source("../src/game.js");

  assert.match(game, /type: "assist_production"/);
  assert.match(game, /simulation\.commandAssistProduction\(/);
  assert.match(game, /simulation\.isFactoryActivelyProducing\(friendlyStructure\.id\)/);
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
