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
