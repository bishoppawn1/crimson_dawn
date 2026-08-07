import assert from "node:assert/strict";
import test from "node:test";

import { FixedStepSimulationClock } from "../src/simulation-clock.js";
import { Simulation } from "../src/simulation.js";

test("the authoritative clock moves remote units without animation frames or camera visibility", () => {
  const simulation = new Simulation({ width: 1200, height: 600, enemyAiEnabled: false });
  const remoteUnit = simulation.addUnit("scout_mech", "enemy", 900, 300);
  const startingX = remoteUnit.x;
  simulation.commandMove([remoteUnit.id], 1100, 300);

  const clock = new FixedStepSimulationClock();
  clock.reset(0);
  for (let now = 1000 / 30; now <= 1000 + 0.001; now += 1000 / 30) {
    clock.advance(now, true, (step) => simulation.tick(step));
  }

  assert.ok(remoteUnit.x > startingX + 50);
  assert.ok(simulation.time >= 0.99);
});

test("a delayed host heartbeat catches up canonical simulation time", () => {
  const clock = new FixedStepSimulationClock();
  let simulatedSeconds = 0;
  clock.reset(0);

  const update = clock.advance(1000, true, (step) => {
    simulatedSeconds += step;
  });

  assert.equal(update.steps, 30);
  assert.ok(Math.abs(simulatedSeconds - 1) < 0.000001);
});

test("paused clocks discard elapsed time instead of catching it up later", () => {
  const clock = new FixedStepSimulationClock();
  let steps = 0;
  clock.reset(0);

  clock.advance(5000, false, () => { steps += 1; });
  clock.advance(5034, true, () => { steps += 1; });

  assert.equal(steps, 1);
});
