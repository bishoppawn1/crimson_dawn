import assert from "node:assert/strict";
import test from "node:test";

import { movementOrderDestinations } from "../src/command-indicators.js";

test("movement indicators include active and Shift-queued destinations immediately", () => {
  const unit = {
    moveTarget: { x: 180, y: 100 },
    moveQueue: [
      { x: 260, y: 120, mode: "normal" },
      { x: 340, y: 160, mode: "force" },
    ],
  };

  assert.deepEqual(movementOrderDestinations(unit), [
    { x: 180, y: 100 },
    { x: 260, y: 120 },
    { x: 340, y: 160 },
  ]);
});

test("movement indicators are empty without an active move order", () => {
  assert.deepEqual(
    movementOrderDestinations({ moveTarget: null, moveQueue: [{ x: 260, y: 120 }] }),
    [],
  );
});
