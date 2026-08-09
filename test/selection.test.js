import assert from "node:assert/strict";
import test from "node:test";
import { selectableUnitIdsByExactType } from "../src/selection.js";

test("exact-type selection excludes other tiers, teams, cargo, and destroyed units", () => {
  const units = [
    { id: "t1-a", alive: true, team: "player", type: "assault_mech", carriedById: null },
    { id: "t1-b", alive: true, team: "player", type: "assault_mech", carriedById: null },
    { id: "t2", alive: true, team: "player", type: "assault_mech_t2", carriedById: null },
    { id: "enemy", alive: true, team: "enemy", type: "assault_mech", carriedById: null },
    { id: "cargo", alive: true, team: "player", type: "assault_mech", carriedById: "ship" },
    { id: "destroyed", alive: false, team: "player", type: "assault_mech", carriedById: null },
  ];

  assert.deepEqual(
    selectableUnitIdsByExactType(units, { team: "player", type: "assault_mech" }),
    ["t1-a", "t1-b"],
  );
  assert.deepEqual(
    selectableUnitIdsByExactType(units, { team: "player", type: "assault_mech_t2" }),
    ["t2"],
  );
});

test("exact-type selection rejects incomplete requests", () => {
  assert.deepEqual(selectableUnitIdsByExactType([], { team: "player" }), []);
  assert.deepEqual(selectableUnitIdsByExactType(null, { team: "player", type: "unit" }), []);
});
