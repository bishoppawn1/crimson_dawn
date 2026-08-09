import assert from "node:assert/strict";
import test from "node:test";

import {
  STRATEGIC_ICON_ZOOM_THRESHOLD,
  strategicIconWorldSize,
  strategicUnitCode,
  strategicUnitWorldRadius,
  strategicViewActive,
  strategicZoomMinimum,
} from "../src/strategic-view.js";

test("strategic zoom fits the complete battlefield inside the viewport", () => {
  const zoom = strategicZoomMinimum(1200, 720, 8560, 6280);

  assert.equal(zoom, 720 / 6280);
  assert.ok(8560 * zoom <= 1200);
  assert.ok(6280 * zoom <= 720);
  assert.equal(strategicZoomMinimum(1200, 720, 600, 400), 1);
});

test("strategic label sizing stays readable across whole-map zoom levels", () => {
  for (const zoom of [0.1, 0.2, STRATEGIC_ICON_ZOOM_THRESHOLD]) {
    assert.equal(strategicIconWorldSize(zoom, 10) * zoom, 10);
    assert.equal(strategicViewActive(zoom), true);
  }
  assert.equal(strategicViewActive(STRATEGIC_ICON_ZOOM_THRESHOLD + 0.01), false);
});

test("strategic unit markers preserve actual world size", () => {
  const worker = { radius: 6 };
  const battleship = { radius: 44 };

  assert.equal(strategicUnitWorldRadius(worker), 6);
  assert.equal(strategicUnitWorldRadius(battleship), 44);
  assert.equal(
    strategicUnitWorldRadius(battleship) / strategicUnitWorldRadius(worker),
    44 / 6,
  );
  assert.equal(strategicUnitWorldRadius({}), 1);
});

test("strategic unit tags identify role and tier with compact markers", () => {
  assert.equal(strategicUnitCode({ role: "worker", tier: 1 }), "W1");
  assert.equal(strategicUnitCode({ role: "tank", tier: 2 }), "TK2");
  assert.equal(strategicUnitCode({ role: "anti_air_mech", tier: 3 }), "AA3");
  assert.equal(strategicUnitCode({ role: "bomber", tier: 2 }), "BM2");
  assert.equal(strategicUnitCode({ role: "hexapod_landship", tier: 3 }), "HL3");
  assert.equal(strategicUnitCode({ role: "unknown" }), "U");
});
