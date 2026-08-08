export const STRATEGIC_ICON_ZOOM_THRESHOLD = 0.45;
export const STRATEGIC_UNIT_MARKER_SCREEN_RADIUS = 2.25;
export const STRATEGIC_DRONE_MARKER_SCREEN_RADIUS = 1.5;
export const STRATEGIC_UNIT_CODE_SCREEN_SIZE = 11;

const STRATEGIC_UNIT_ROLE_CODES = Object.freeze({
  worker: "W",
  vanguard: "V",
  bulwark: "B",
  anti_air_mech: "AA",
  carrier: "EC",
  vehicle_scout: "SV",
  tank: "TK",
  artillery: "AR",
  grid_tanker: "GT",
  anti_air_vehicle: "FL",
  interceptor: "IN",
  gunship: "GS",
  bomber: "BM",
  energy_tender: "ET",
  arsenal_colossus: "AC",
  hexapod_landship: "HL",
  zenith_doughnut: "ZD",
  raider: "RD",
});

export function strategicZoomMinimum(
  viewportWidth,
  viewportHeight,
  worldWidth,
  worldHeight,
) {
  if (
    ![viewportWidth, viewportHeight, worldWidth, worldHeight].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  ) {
    return 1;
  }
  return Math.min(1, viewportWidth / worldWidth, viewportHeight / worldHeight);
}

export function strategicViewActive(zoom) {
  return Number.isFinite(zoom) && zoom <= STRATEGIC_ICON_ZOOM_THRESHOLD;
}

export function strategicIconWorldSize(zoom, screenPixels = 10) {
  if (!Number.isFinite(zoom) || zoom <= 0) return screenPixels;
  return screenPixels / zoom;
}

export function strategicUnitCode(definition) {
  const roleCode = STRATEGIC_UNIT_ROLE_CODES[definition?.role] || "U";
  const tier = Number.isInteger(definition?.tier) && definition.tier >= 1 && definition.tier <= 3
    ? definition.tier
    : "";
  return `${roleCode}${tier}`;
}
