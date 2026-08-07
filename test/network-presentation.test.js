import assert from "node:assert/strict";
import test from "node:test";

import {
  GUEST_STATE_TRANSITION_MS,
  MULTIPLAYER_STATE_INTERVAL_SECONDS,
  SnapshotPositionSmoother,
} from "../src/network-presentation.js";

test("multiplayer uses Galactic Empires-style state pacing and overlapping smoothing", () => {
  assert.equal(MULTIPLAYER_STATE_INTERVAL_SECONDS, 0.25);
  assert.equal(GUEST_STATE_TRANSITION_MS, 320);
  assert.ok(GUEST_STATE_TRANSITION_MS > MULTIPLAYER_STATE_INTERVAL_SECONDS * 1000);
});

test("guest mobile positions interpolate between authoritative snapshots", () => {
  const smoother = new SnapshotPositionSmoother(320);
  const unit = { id: "unit-1", x: 0, y: 20 };
  smoother.reset([unit], 0);
  smoother.transitionTo([{ ...unit, x: 160, y: 100 }], 0);

  assert.deepEqual(smoother.positionFor(unit, 0), { x: 0, y: 20 });
  assert.deepEqual(smoother.positionFor(unit, 160), { x: 80, y: 60 });
  assert.deepEqual(smoother.positionFor(unit, 320), { x: 160, y: 100 });
});

test("a new snapshot continues from the currently displayed point without jumping", () => {
  const smoother = new SnapshotPositionSmoother(320);
  smoother.reset([{ id: "unit-1", x: 0, y: 0 }], 0);
  smoother.transitionTo([{ id: "unit-1", x: 160, y: 0 }], 0);
  const beforeUpdate = smoother.positionFor({ id: "unit-1", x: 160, y: 0 }, 160);

  smoother.transitionTo([{ id: "unit-1", x: 320, y: 0 }], 160);

  assert.deepEqual(smoother.positionFor({ id: "unit-1", x: 320, y: 0 }, 160), beforeUpdate);
  assert.deepEqual(
    smoother.positionFor({ id: "unit-1", x: 320, y: 0 }, 320),
    { x: 200, y: 0 },
  );
});

test("new mobile entities appear at their authoritative position", () => {
  const smoother = new SnapshotPositionSmoother();
  const reinforcement = { id: "unit-new", x: 700, y: 420 };

  smoother.transitionTo([reinforcement], 1000);

  assert.deepEqual(smoother.positionFor(reinforcement, 1000), { x: 700, y: 420 });
});
