const OUTER_MARGIN = 18;
const INNER_PADDING = 10;
const HEADER_HEIGHT = 26;
const MAX_MAP_WIDTH = 240;
const MAX_MAP_HEIGHT = 160;
const REGULAR_DEPOSIT_MARKER = Object.freeze({
  fill: "#ff2445",
  stroke: "#ff9aaa",
  radius: 3,
});
const RICH_DEPOSIT_MARKER = Object.freeze({
  fill: "#ff4962",
  stroke: "#ffe4e8",
  radius: 4,
});

export function calculateMinimapLayout(canvasWidth, canvasHeight, worldWidth, worldHeight) {
  if (
    canvasWidth <= 0 ||
    canvasHeight <= 0 ||
    worldWidth <= 0 ||
    worldHeight <= 0
  ) {
    throw new RangeError("Minimap dimensions must be positive.");
  }

  const availableWidth = Math.min(MAX_MAP_WIDTH, canvasWidth - OUTER_MARGIN * 2 - INNER_PADDING * 2);
  const availableHeight = Math.min(
    MAX_MAP_HEIGHT,
    canvasHeight - OUTER_MARGIN * 2 - HEADER_HEIGHT - INNER_PADDING,
  );
  const scale = Math.min(availableWidth / worldWidth, availableHeight / worldHeight);
  const mapWidth = worldWidth * scale;
  const mapHeight = worldHeight * scale;
  const panelWidth = mapWidth + INNER_PADDING * 2;
  const panelHeight = HEADER_HEIGHT + mapHeight + INNER_PADDING;
  const left = canvasWidth - OUTER_MARGIN - panelWidth;
  const top = OUTER_MARGIN;

  return Object.freeze({
    left,
    top,
    width: panelWidth,
    height: panelHeight,
    mapLeft: left + INNER_PADDING,
    mapTop: top + HEADER_HEIGHT,
    mapWidth,
    mapHeight,
    scale,
    worldWidth,
    worldHeight,
  });
}

export function minimapPoint(layout, worldX, worldY) {
  return {
    x: layout.mapLeft + worldX * layout.scale,
    y: layout.mapTop + worldY * layout.scale,
  };
}

export function minimapDepositMarkerStyle(deposit) {
  return deposit?.rich ? RICH_DEPOSIT_MARKER : REGULAR_DEPOSIT_MARKER;
}

export function minimapViewport(layout, worldBounds) {
  const topLeft = minimapPoint(layout, worldBounds.left, worldBounds.top);
  const bottomRight = minimapPoint(layout, worldBounds.right, worldBounds.bottom);
  return {
    left: topLeft.x,
    top: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

export function minimapWorldPoint(layout, screenPoint) {
  if (
    screenPoint.x < layout.mapLeft ||
    screenPoint.x > layout.mapLeft + layout.mapWidth ||
    screenPoint.y < layout.mapTop ||
    screenPoint.y > layout.mapTop + layout.mapHeight
  ) {
    return null;
  }
  return {
    x: (screenPoint.x - layout.mapLeft) / layout.scale,
    y: (screenPoint.y - layout.mapTop) / layout.scale,
  };
}

export function minimapContains(layout, screenPoint) {
  return (
    screenPoint.x >= layout.left &&
    screenPoint.x <= layout.left + layout.width &&
    screenPoint.y >= layout.top &&
    screenPoint.y <= layout.top + layout.height
  );
}
