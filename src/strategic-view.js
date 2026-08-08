export const STRATEGIC_ICON_ZOOM_THRESHOLD = 0.45;

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
