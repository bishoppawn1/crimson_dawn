import assert from "node:assert/strict";
import test from "node:test";

import {
  createMultiplayerMotionUpdate,
  GUEST_STATE_TRANSITION_MS,
  multiplayerMotionUpdateIsValid,
  MULTIPLAYER_MOTION_INTERVAL_SECONDS,
  MULTIPLAYER_STATE_INTERVAL_SECONDS,
  SnapshotPositionSmoother,
} from "../src/network-presentation.js";

test("multiplayer combines canonical snapshots with frequent overlapping motion updates", () => {
  assert.equal(MULTIPLAYER_STATE_INTERVAL_SECONDS, 0.25);
  assert.equal(MULTIPLAYER_MOTION_INTERVAL_SECONDS, 1 / 15);
  assert.equal(GUEST_STATE_TRANSITION_MS, 120);
  assert.ok(GUEST_STATE_TRANSITION_MS > MULTIPLAYER_MOTION_INTERVAL_SECONDS * 1000);
  assert.ok(GUEST_STATE_TRANSITION_MS < MULTIPLAYER_STATE_INTERVAL_SECONDS * 1000);
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
  assert.ok(smoother.positionFor({ id: "unit-1", x: 320, y: 0 }, 161).x > beforeUpdate.x);
  assert.deepEqual(smoother.positionFor({ id: "unit-1", x: 320, y: 0 }, 480), {
    x: 320,
    y: 0,
  });
});

test("tick-timed motion updates preserve displayed velocity across corrections", () => {
  const smoother = new SnapshotPositionSmoother(120);
  smoother.reset([{ id: "unit-1", x: 0, y: 0 }], 0, 0);
  smoother.transitionTo([{ id: "unit-1", x: 12, y: 0 }], 100, 3);
  const before = smoother.motionFor({ id: "unit-1", x: 12, y: 0 }, 160);

  assert.equal(
    smoother.transitionTo([{ id: "unit-1", x: 24, y: 0 }], 160, 6),
    true,
  );
  const after = smoother.motionFor({ id: "unit-1", x: 24, y: 0 }, 160);

  assert.ok(Math.abs(after.x - before.x) < 1e-9);
  assert.ok(Math.abs(after.velocityX - before.velocityX) < 1e-9);
});

test("stale motion ticks cannot pull presentation backward", () => {
  const smoother = new SnapshotPositionSmoother(120);
  smoother.reset([{ id: "unit-1", x: 0, y: 0 }], 0, 10);
  assert.equal(smoother.transitionTo([{ id: "unit-1", x: 20, y: 0 }], 100, 12), true);
  assert.equal(smoother.transitionTo([{ id: "unit-1", x: 5, y: 0 }], 110, 11), false);
  assert.ok(smoother.positionFor({ id: "unit-1", x: 20, y: 0 }, 220).x > 20);
});

test("compact motion messages contain only validated mobile coordinates", () => {
  const message = createMultiplayerMotionUpdate(42, [
    { id: "unit-1", x: 10, y: 20, hp: 100, attackTargetId: "unit-2" },
    { id: "invalid", x: Number.NaN, y: 0 },
  ]);

  assert.deepEqual(message, {
    type: "motion",
    tick: 42,
    entities: [{ id: "unit-1", x: 10, y: 20 }],
  });
  assert.equal(multiplayerMotionUpdateIsValid(message), true);
  assert.equal(multiplayerMotionUpdateIsValid({ ...message, tick: -1 }), false);
  assert.equal(multiplayerMotionUpdateIsValid({
    ...message,
    entities: [...message.entities, message.entities[0]],
  }), false);
});

test("new mobile entities appear at their authoritative position", () => {
  const smoother = new SnapshotPositionSmoother();
  const reinforcement = { id: "unit-new", x: 700, y: 420 };

  smoother.transitionTo([reinforcement], 1000, 30);

  assert.deepEqual(smoother.positionFor(reinforcement, 1000), { x: 700, y: 420 });
});
