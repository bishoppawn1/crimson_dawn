import assert from "node:assert/strict";
import test from "node:test";

import {
  STRATEGIC_ICON_ZOOM_THRESHOLD,
  strategicIconWorldSize,
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

test("strategic icons remain a constant screen size across whole-map zoom levels", () => {
  for (const zoom of [0.1, 0.2, STRATEGIC_ICON_ZOOM_THRESHOLD]) {
    assert.equal(strategicIconWorldSize(zoom, 10) * zoom, 10);
    assert.equal(strategicViewActive(zoom), true);
  }
  assert.equal(strategicViewActive(STRATEGIC_ICON_ZOOM_THRESHOLD + 0.01), false);
});
