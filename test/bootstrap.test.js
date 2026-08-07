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
  assert.match(game, /`\.\/queue-status\.js\$\{versionSuffix\}`/);
  assert.match(maps, /`\.\/data\.js\$\{versionSuffix\}`/);
  assert.match(simulation, /`\.\/maps\.js\$\{versionSuffix\}`/);
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
