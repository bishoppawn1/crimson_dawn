import assert from "node:assert/strict";
import test from "node:test";

import {
  describeConstructionQueue,
  describeProductionQueue,
  describeSharedConstructionQueue,
} from "../src/queue-status.js";

const unitDefinitions = {
  scout: { name: "Scout Mech", productionTime: 10 },
  tank: { name: "Battle Tank", productionTime: 20 },
  carrier: { name: "Energy Carrier", productionTime: 15 },
};

test("production queue status shows the active progress and ordered next items", () => {
  const queue = describeProductionQueue(
    {
      complete: true,
      powered: true,
      productionQueue: [
        { unitType: "scout", progress: 4.9 },
        { unitType: "tank", progress: 0 },
        { unitType: "carrier", progress: 0 },
      ],
    },
    unitDefinitions,
  );

  assert.deepEqual(queue, {
    kind: "production",
    current: {
      name: "Scout Mech",
      progress: 49,
      status: "In production",
    },
    upcoming: [
      { name: "Battle Tank" },
      { name: "Energy Carrier" },
    ],
  });
});

test("production queue status explains power and blocked-exit waits", () => {
  const unpowered = describeProductionQueue(
    {
      complete: true,
      powered: false,
      productionQueue: [{ unitType: "scout", progress: 2 }],
    },
    unitDefinitions,
  );
  const blocked = describeProductionQueue(
    {
      complete: true,
      powered: true,
      productionQueue: [{ unitType: "scout", progress: 10 }],
    },
    unitDefinitions,
  );

  assert.equal(unpowered.current.status, "Waiting for power");
  assert.equal(blocked.current.progress, 100);
  assert.equal(blocked.current.status, "Ready · waiting for a clear exit");
});

test("construction queue status shows foundation progress and placement order", () => {
  const structures = new Map([
    ["current", {
      id: "current",
      type: "generator",
      alive: true,
      complete: false,
      constructionProgress: 3,
    }],
    ["next", {
      id: "next",
      type: "battery",
      alive: true,
      complete: false,
      constructionProgress: 0,
    }],
  ]);
  const queue = describeConstructionQueue(
    {
      state: "active",
      buildTargetId: "current",
      buildQueue: ["next"],
    },
    { getStructure: (id) => structures.get(id) || null },
    {
      generator: { name: "Pulse Generator", buildTime: 12 },
      battery: { name: "Grid Battery", buildTime: 8 },
    },
  );

  assert.deepEqual(queue, {
    kind: "construction",
    current: {
      name: "Pulse Generator",
      progress: 25,
      status: "Construction assigned",
    },
    upcoming: [{ name: "Grid Battery" }],
  });
});

test("a shared worker construction queue lists each foundation only once", () => {
  const structures = new Map([
    ["current", {
      id: "current",
      type: "generator",
      alive: true,
      complete: false,
      constructionProgress: 6,
    }],
    ["next", {
      id: "next",
      type: "battery",
      alive: true,
      complete: false,
      constructionProgress: 0,
    }],
  ]);
  const workers = [
    { buildTargetId: "current", buildQueue: ["next"] },
    { buildTargetId: "current", buildQueue: ["next"] },
    { buildTargetId: "current", buildQueue: ["next"] },
  ];

  assert.deepEqual(
    describeSharedConstructionQueue(
      workers,
      { getStructure: (id) => structures.get(id) || null },
      {
        generator: { name: "Pulse Generator", buildTime: 12 },
        battery: { name: "Grid Battery", buildTime: 8 },
      },
    ),
    {
      kind: "construction",
      items: [
        {
          id: "current",
          type: "generator",
          name: "Pulse Generator",
          progress: 50,
          active: true,
        },
        {
          id: "next",
          type: "battery",
          name: "Grid Battery",
          progress: 0,
          active: false,
        },
      ],
    },
  );
});
