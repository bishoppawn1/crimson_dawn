import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeterministicStateMessage,
  deterministicStateHash,
  deterministicStateMessageIsValid,
  DeterministicCommandScheduler,
} from "../src/determinism.js";
import { Simulation } from "../src/simulation.js";

test("scheduled commands execute in tick, player-slot, and sequence order", () => {
  const scheduler = new DeterministicCommandScheduler();
  const executed = [];
  const enqueue = (executeTick, playerSlot, sequence, label) => scheduler.enqueue({
    executeTick,
    playerSlot,
    sequence,
    team: `team-${playerSlot}`,
    command: { type: "test", label },
  });

  assert.equal(enqueue(4, 1, 2, "guest-second"), true);
  assert.equal(enqueue(3, 1, 1, "guest-first"), true);
  assert.equal(enqueue(4, 0, 2, "host-second"), true);
  assert.equal(enqueue(4, 0, 1, "host-first"), true);

  scheduler.drain(3, ({ command }) => executed.push(command.label));
  assert.deepEqual(executed, ["guest-first"]);
  scheduler.drain(4, ({ command }) => executed.push(command.label));
  assert.deepEqual(executed, [
    "guest-first",
    "host-first",
    "host-second",
    "guest-second",
  ]);
});

test("state hashes ignore object key insertion order and detect gameplay changes", () => {
  assert.equal(
    deterministicStateHash({ beta: 2, alpha: { y: 4, x: 3 } }),
    deterministicStateHash({ alpha: { x: 3, y: 4 }, beta: 2 }),
  );
  assert.notEqual(
    deterministicStateHash({ units: [{ id: "unit-1", x: 100 }] }),
    deterministicStateHash({ units: [{ id: "unit-1", x: 101 }] }),
  );
});

test("deterministic state messages bind their tick and complete snapshot", () => {
  const simulation = new Simulation({ enemyAiEnabled: false });
  simulation.addUnit("scout_mech", "player", 100, 100);
  simulation.fixedTick();
  const snapshot = simulation.createSnapshot();
  const message = createDeterministicStateMessage({
    sequence: 7,
    lastGuestCommandId: 3,
    snapshot,
  });

  assert.equal(snapshot.version, 2);
  assert.equal(message.tick, 1);
  assert.equal(deterministicStateMessageIsValid(message), true);
  const restored = Simulation.fromSnapshot(message.snapshot);
  assert.equal(restored.tickNumber, simulation.tickNumber);
  assert.equal(restored.time, simulation.time);
  simulation.units[0].x += 10;
  assert.notEqual(message.snapshot.units[0].x, simulation.units[0].x);
  assert.equal(deterministicStateMessageIsValid(message), true);
  message.snapshot.units[0].x += 1;
  assert.equal(deterministicStateMessageIsValid(message), false);
});

test("identical tick-scheduled command streams produce identical simulation hashes", () => {
  const run = (destinationX = 900) => {
    const simulation = new Simulation({ width: 1200, height: 700, enemyAiEnabled: false });
    const scheduler = new DeterministicCommandScheduler();
    const player = simulation.addUnit("scout_mech", "player", 120, 180);
    const enemy = simulation.addUnit("scout_mech", "enemy", 1080, 520);
    const commands = [
      { executeTick: 1, playerSlot: 0, sequence: 1, team: "player", command: {
        type: "move", unitId: player.id, x: destinationX, y: 180,
      } },
      { executeTick: 1, playerSlot: 1, sequence: 1, team: "enemy", command: {
        type: "move", unitId: enemy.id, x: 300, y: 520,
      } },
      { executeTick: 75, playerSlot: 0, sequence: 2, team: "player", command: {
        type: "move", unitId: player.id, x: destinationX - 300, y: 350,
      } },
    ];
    for (const command of commands.reverse()) scheduler.enqueue(command);

    for (let tick = 1; tick <= 180; tick += 1) {
      scheduler.drain(tick, ({ command }) => {
        if (command.type === "move") {
          simulation.commandMove([command.unitId], command.x, command.y);
        }
      });
      simulation.fixedTick();
    }
    assert.equal(simulation.tickNumber, 180);
    assert.equal(simulation.time, 6);
    return deterministicStateHash(simulation.createSnapshot());
  };

  assert.equal(run(), run());
  assert.notEqual(run(), run(850));
});
