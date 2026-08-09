import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCAL_TYPE_SELECTION_RADIUS,
  selectableUnitIdsByExactTypeNear,
} from "../src/selection.js";

test("exact-type selection excludes autonomous Spawn Wars units and invalid matches", () => {
  const units = [
    { id: "t1-a", alive: true, team: "player", type: "assault_mech", x: 100, y: 100, carriedById: null },
    { id: "t1-b", alive: true, team: "player", type: "assault_mech", x: 200, y: 100, carriedById: null },
    { id: "t2", alive: true, team: "player", type: "assault_mech_t2", x: 100, y: 100, carriedById: null },
    { id: "enemy", alive: true, team: "enemy", type: "assault_mech", x: 100, y: 100, carriedById: null },
    { id: "cargo", alive: true, team: "player", type: "assault_mech", x: 100, y: 100, carriedById: "ship" },
    { id: "spawned", alive: true, team: "player", type: "assault_mech", x: 100, y: 100, spawnWarsSpawned: true },
    { id: "destroyed", alive: false, team: "player", type: "assault_mech", x: 100, y: 100, carriedById: null },
  ];

  assert.deepEqual(
    selectableUnitIdsByExactTypeNear(units, {
      team: "player",
      type: "assault_mech",
      x: 100,
      y: 100,
    }),
    ["t1-a", "t1-b"],
  );
  assert.deepEqual(
    selectableUnitIdsByExactTypeNear(units, {
      team: "player",
      type: "assault_mech_t2",
      x: 100,
      y: 100,
    }),
    ["t2"],
  );
});

test("exact-type selection includes the local boundary and excludes distant groups", () => {
  const units = [
    { id: "clicked", alive: true, team: "player", type: "scout_mech", x: 100, y: 100 },
    {
      id: "boundary",
      alive: true,
      team: "player",
      type: "scout_mech",
      x: 100 + LOCAL_TYPE_SELECTION_RADIUS,
      y: 100,
    },
    {
      id: "distant-group",
      alive: true,
      team: "player",
      type: "scout_mech",
      x: 101 + LOCAL_TYPE_SELECTION_RADIUS,
      y: 100,
    },
  ];

  assert.deepEqual(
    selectableUnitIdsByExactTypeNear(units, {
      team: "player",
      type: "scout_mech",
      x: 100,
      y: 100,
    }),
    ["clicked", "boundary"],
  );
});

test("exact-type selection rejects incomplete requests", () => {
  assert.deepEqual(selectableUnitIdsByExactTypeNear([], { team: "player" }), []);
  assert.deepEqual(
    selectableUnitIdsByExactTypeNear(null, { team: "player", type: "unit", x: 0, y: 0 }),
    [],
  );
});
