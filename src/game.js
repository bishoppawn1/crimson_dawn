import {
  DRONE_DEFINITION,
  SIMULATION_RULES,
  STRUCTURE_DEFINITIONS,
  UNIT_DEFINITIONS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "./data.js";
import { energyRatio, Simulation } from "./simulation.js";

const canvas = document.querySelector("#battlefield");
const context = canvas.getContext("2d");
const metalValue = document.querySelector("#metal-value");
const energyValue = document.querySelector("#energy-value");
const selectionName = document.querySelector("#selection-name");
const selectionDetails = document.querySelector("#selection-details");
const overdriveButton = document.querySelector("#overdrive-button");
const pauseButton = document.querySelector("#pause-button");
const resetButton = document.querySelector("#reset-button");
const statusBanner = document.querySelector("#status-banner");

let simulation = Simulation.createFieldTest();
let selectedUnitIds = new Set();
let paused = false;
let lastFrameTime = performance.now();
let accumulator = 0;
const fixedStep = 1 / 30;

const colors = {
  background: "#10141a",
  gridFine: "#181f27",
  gridStrong: "#232c35",
  player: "#7fd4ef",
  playerDark: "#24627c",
  enemy: "#e65a64",
  enemyDark: "#772e38",
  energy: "#52d1ff",
  metal: "#d0c9b9",
  health: "#6fe28d",
  stasis: "#e4b44c",
  selection: "#f6ee8d",
};

function resetGame() {
  simulation = Simulation.createFieldTest();
  selectedUnitIds = new Set();
  paused = false;
  pauseButton.textContent = "Pause simulation";
  accumulator = 0;
  updateInterface();
}

function frame(now) {
  const elapsed = Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  if (!paused) {
    accumulator += elapsed;
    while (accumulator >= fixedStep) {
      simulation.tick(fixedStep);
      accumulator -= fixedStep;
    }
  }

  pruneSelection();
  render();
  updateInterface();
  requestAnimationFrame(frame);
}

function render() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawTerrain();
  drawPowerNetwork();
  drawCommandIndicators();

  for (const wreck of simulation.wrecks) drawWreck(wreck);
  for (const structure of simulation.structures) {
    if (structure.alive) drawStructure(structure);
  }
  for (const drone of simulation.getDrones()) {
    if (drone.alive) drawDrone(drone);
  }
  for (const unit of simulation.units) {
    if (unit.alive) drawUnit(unit);
  }
  drawEvents();
}

function drawTerrain() {
  context.fillStyle = colors.background;
  context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  context.lineWidth = 1;
  for (let x = 0; x <= WORLD_WIDTH; x += 40) {
    context.strokeStyle = x % 200 === 0 ? colors.gridStrong : colors.gridFine;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, WORLD_HEIGHT);
    context.stroke();
  }
  for (let y = 0; y <= WORLD_HEIGHT; y += 40) {
    context.strokeStyle = y % 200 === 0 ? colors.gridStrong : colors.gridFine;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(WORLD_WIDTH, y);
    context.stroke();
  }

  context.fillStyle = "#6f303018";
  context.beginPath();
  context.ellipse(1260, 455, 270, 350, -0.35, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#236b7a10";
  context.beginPath();
  context.ellipse(280, 500, 330, 390, 0.15, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#83909d";
  context.font = "700 12px ui-monospace, monospace";
  context.fillText("FRIENDLY GRID", 30, 38);
  context.fillStyle = "#a56a70";
  context.fillText("HOSTILE APPROACH", 1430, 38);
}

function drawPowerNetwork() {
  const generators = simulation.structures.filter(
    (structure) => structure.alive && structure.type === "generator",
  );
  for (const generator of generators) {
    context.save();
    context.strokeStyle = `${colors.energy}22`;
    context.setLineDash([8, 12]);
    context.beginPath();
    context.arc(
      generator.x,
      generator.y,
      STRUCTURE_DEFINITIONS.generator.powerRadius,
      0,
      Math.PI * 2,
    );
    context.stroke();
    context.restore();
  }

  for (const structure of simulation.structures) {
    if (!structure.alive || structure.type === "generator") continue;
    const generator = generators.find(
      (candidate) =>
        candidate.team === structure.team &&
        Math.hypot(candidate.x - structure.x, candidate.y - structure.y) <=
          STRUCTURE_DEFINITIONS.generator.powerRadius,
    );
    if (!generator) continue;
    context.strokeStyle = structure.powered ? `${colors.energy}3d` : "#a33b3b44";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(generator.x, generator.y);
    context.lineTo(structure.x, structure.y);
    context.stroke();
  }
}

function drawCommandIndicators() {
  for (const unit of simulation.units) {
    if (!selectedUnitIds.has(unit.id) || !unit.alive) continue;
    if (unit.moveTarget) {
      context.strokeStyle = `${colors.selection}45`;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(unit.x, unit.y);
      context.lineTo(unit.moveTarget.x, unit.moveTarget.y);
      context.stroke();
      drawDestination(unit.moveTarget.x, unit.moveTarget.y, colors.selection);
    }
    const target = simulation.getEntity(unit.attackTargetId);
    if (target?.alive) {
      context.strokeStyle = "#ef596466";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(unit.x, unit.y);
      context.lineTo(target.x, target.y);
      context.stroke();
    }
  }
}

function drawDestination(x, y, color) {
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x, y, 8, 0, Math.PI * 2);
  context.moveTo(x - 12, y);
  context.lineTo(x + 12, y);
  context.moveTo(x, y - 12);
  context.lineTo(x, y + 12);
  context.stroke();
}

function drawStructure(structure) {
  const definition = STRUCTURE_DEFINITIONS[structure.type];
  const teamColor = structure.team === "player" ? colors.player : colors.enemy;
  context.save();
  context.translate(structure.x, structure.y);

  if (structure.type === "charger") {
    context.strokeStyle = structure.powered ? `${colors.energy}30` : "#a34e4e20";
    context.lineWidth = 3;
    context.beginPath();
    context.arc(0, 0, definition.chargeRadius, 0, Math.PI * 2);
    context.stroke();
  }

  context.fillStyle = "#171d24";
  context.strokeStyle = structure.powered ? teamColor : "#6e4a4e";
  context.lineWidth = 4;
  context.beginPath();
  if (structure.type === "salvage_yard") {
    polygon(6, definition.radius, Math.PI / 6);
  } else {
    context.rect(-definition.radius, -definition.radius, definition.radius * 2, definition.radius * 2);
  }
  context.fill();
  context.stroke();

  context.strokeStyle = structure.powered ? colors.energy : "#7b5558";
  context.lineWidth = 3;
  if (structure.type === "generator") {
    context.beginPath();
    context.arc(0, 0, 16, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(-7, 0);
    context.lineTo(0, -16);
    context.lineTo(7, 0);
    context.lineTo(0, 16);
    context.stroke();
  } else if (structure.type === "charger") {
    context.beginPath();
    context.arc(0, 0, 18, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = structure.powered ? colors.energy : "#6b4d50";
    context.fillRect(-3, -12, 6, 24);
    context.fillRect(-12, -3, 24, 6);
  } else {
    context.beginPath();
    context.moveTo(-19, 10);
    context.lineTo(0, -15);
    context.lineTo(19, 10);
    context.stroke();
  }
  context.restore();

  drawLabel(structure.x, structure.y + definition.radius + 20, definition.name, structure.powered);
  drawBar(structure.x, structure.y - definition.radius - 11, 70, structure.hp / definition.maxHp, colors.health);
}

function drawUnit(unit) {
  const definition = UNIT_DEFINITIONS[unit.type];
  const teamColor = unit.team === "player" ? colors.player : colors.enemy;
  const darkColor = unit.team === "player" ? colors.playerDark : colors.enemyDark;
  const selected = selectedUnitIds.has(unit.id);
  const lowEnergy = energyRatio(unit) <= SIMULATION_RULES.lowEnergyRatio;
  const overdrive = unit.abilityActiveUntil.overdrive > simulation.time;

  context.save();
  context.translate(unit.x, unit.y);
  if (selected) {
    context.strokeStyle = colors.selection;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, definition.radius + 7, 0, Math.PI * 2);
    context.stroke();
  }
  if (overdrive) {
    context.strokeStyle = "#ff6d76a0";
    context.lineWidth = 4;
    context.beginPath();
    context.arc(0, 0, definition.radius + 4 + Math.sin(simulation.time * 9) * 2, 0, Math.PI * 2);
    context.stroke();
  }

  context.rotate(Math.PI / 4);
  context.fillStyle = unit.state === "stasis" ? "#403b32" : darkColor;
  context.strokeStyle = unit.state === "stasis" ? colors.stasis : teamColor;
  context.lineWidth = 3;
  context.beginPath();
  if (unit.type === "energy_carrier") {
    context.rect(-definition.radius, -definition.radius, definition.radius * 2, definition.radius * 2);
  } else {
    polygon(4, definition.radius);
  }
  context.fill();
  context.stroke();
  context.rotate(-Math.PI / 4);

  if (unit.type === "energy_carrier") {
    context.strokeStyle = colors.energy;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(0, 0, 9, 0, Math.PI * 2);
    context.stroke();
  } else {
    context.fillStyle = unit.state === "stasis" ? colors.stasis : teamColor;
    context.fillRect(5, -3, definition.radius + 8, 6);
  }
  context.restore();

  const barWidth = Math.max(46, definition.radius * 2.3);
  drawBar(unit.x, unit.y - definition.radius - 12, barWidth, unit.hp / definition.maxHp, colors.health);
  drawBar(
    unit.x,
    unit.y - definition.radius - 6,
    barWidth,
    unit.energy / definition.maxEnergy,
    lowEnergy ? colors.stasis : colors.energy,
  );
  if (unit.state === "stasis") drawLabel(unit.x, unit.y + definition.radius + 17, "STASIS", false, colors.stasis);
}

function drawDrone(drone) {
  const yard = simulation.getStructure(drone.yardId);
  if (drone.targetWreckId) {
    const wreck = simulation.getWreck(drone.targetWreckId);
    if (wreck) {
      context.strokeStyle = "#c5c0aa28";
      context.setLineDash([4, 7]);
      context.beginPath();
      context.moveTo(drone.x, drone.y);
      context.lineTo(wreck.x, wreck.y);
      context.stroke();
      context.setLineDash([]);
    }
  } else if (yard && drone.mode === "returning") {
    context.strokeStyle = "#c5c0aa20";
    context.beginPath();
    context.moveTo(drone.x, drone.y);
    context.lineTo(yard.x, yard.y);
    context.stroke();
  }

  context.save();
  context.translate(drone.x, drone.y);
  context.rotate(simulation.time * 2 + drone.slot);
  context.fillStyle = "#292b2b";
  context.strokeStyle = colors.metal;
  context.lineWidth = 2;
  context.beginPath();
  polygon(3, DRONE_DEFINITION.radius);
  context.fill();
  context.stroke();
  context.restore();
  if (drone.carry > 0) {
    drawBar(
      drone.x,
      drone.y - 14,
      24,
      drone.carry / DRONE_DEFINITION.carryCapacity,
      colors.metal,
    );
  }
}

function drawWreck(wreck) {
  const ratio = wreck.initialMetal > 0 ? wreck.metal / wreck.initialMetal : 0;
  context.save();
  context.translate(wreck.x, wreck.y);
  context.rotate((wreck.x + wreck.y) * 0.01);
  context.fillStyle = "#35383a";
  context.strokeStyle = "#9f998c";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(-15, 9);
  context.lineTo(-10, -12);
  context.lineTo(4, -8);
  context.lineTo(16, 5);
  context.lineTo(2, 13);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
  drawBar(wreck.x, wreck.y - 22, 40, ratio, colors.metal);
  context.fillStyle = "#bdb5a5";
  context.font = "600 10px ui-monospace, monospace";
  context.textAlign = "center";
  context.fillText(`${Math.ceil(wreck.metal)}M`, wreck.x, wreck.y + 28);
  context.textAlign = "start";
}

function drawEvents() {
  for (const event of simulation.events) {
    const age = simulation.time - event.time;
    const alpha = Math.max(0, 1 - age / 1.2);
    if (event.type === "attack") {
      const source = simulation.getEntity(event.sourceId);
      if (!source) continue;
      context.strokeStyle = `rgba(255, 110, 115, ${alpha})`;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(source.x, source.y);
      context.lineTo(event.x, event.y);
      context.stroke();
    } else {
      const eventColor = event.type === "stasis" ? colors.stasis : colors.energy;
      context.globalAlpha = alpha;
      context.strokeStyle = eventColor;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(event.x, event.y, 15 + age * 35, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
    }
  }
}

function drawBar(x, y, width, ratio, fill) {
  const safeRatio = Math.max(0, Math.min(1, ratio));
  context.fillStyle = "#050608c9";
  context.fillRect(x - width / 2, y, width, 4);
  context.fillStyle = fill;
  context.fillRect(x - width / 2, y, width * safeRatio, 4);
}

function drawLabel(x, y, text, active = true, color = null) {
  context.fillStyle = color || (active ? "#aeb8c2" : "#8f6669");
  context.font = "600 10px ui-monospace, monospace";
  context.textAlign = "center";
  context.fillText(text.toUpperCase(), x, y);
  context.textAlign = "start";
}

function polygon(sides, radius, rotation = 0) {
  for (let side = 0; side < sides; side += 1) {
    const angle = rotation + (side / sides) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (side === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

function updateInterface() {
  metalValue.textContent = Math.floor(simulation.resources.player.metal).toLocaleString();
  energyValue.textContent = Math.floor(simulation.resources.player.energy).toLocaleString();

  const selectedUnits = [...selectedUnitIds]
    .map((id) => simulation.getUnit(id))
    .filter(Boolean);
  if (selectedUnits.length === 0) {
    selectionName.textContent = "No units selected";
    selectionDetails.textContent = "Select a friendly unit on the battlefield.";
  } else if (selectedUnits.length === 1) {
    const unit = selectedUnits[0];
    const definition = UNIT_DEFINITIONS[unit.type];
    selectionName.textContent = definition.name;
    selectionDetails.textContent = `${Math.ceil(unit.hp)}/${definition.maxHp} integrity · ${Math.ceil(unit.energy)}/${definition.maxEnergy} energy · ${unit.state.toUpperCase()}`;
  } else {
    const activeCount = selectedUnits.filter((unit) => unit.state === "active").length;
    selectionName.textContent = `${selectedUnits.length} units selected`;
    selectionDetails.textContent = `${activeCount} active · ${selectedUnits.length - activeCount} in stasis`;
  }

  const canOverdrive = selectedUnits.some((unit) => {
    const ability = UNIT_DEFINITIONS[unit.type].abilities?.overdrive;
    return ability && unit.state === "active" && unit.energy >= ability.energyCost;
  });
  overdriveButton.disabled = !canOverdrive;

  const lowEnergyUnits = simulation.units.filter(
    (unit) => unit.alive && unit.team === "player" && energyRatio(unit) <= SIMULATION_RULES.lowEnergyRatio,
  );
  const stasisUnits = lowEnergyUnits.filter((unit) => unit.state === "stasis");
  if (stasisUnits.length > 0) {
    statusBanner.hidden = false;
    statusBanner.textContent = `${stasisUnits.length} UNIT${stasisUnits.length === 1 ? "" : "S"} IN STASIS`;
  } else if (lowEnergyUnits.length > 0) {
    statusBanner.hidden = false;
    statusBanner.textContent = `${lowEnergyUnits.length} UNIT${lowEnergyUnits.length === 1 ? "" : "S"} LOW ON ENERGY`;
  } else {
    statusBanner.hidden = true;
  }
}

function pruneSelection() {
  selectedUnitIds = new Set(
    [...selectedUnitIds].filter((id) => {
      const unit = simulation.getUnit(id);
      return unit?.alive && unit.team === "player";
    }),
  );
}

function canvasPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
    y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
  };
}

function findUnitAt(point, team = null) {
  const candidates = simulation.units.filter((unit) => {
    if (!unit.alive || (team && unit.team !== team)) return false;
    return Math.hypot(unit.x - point.x, unit.y - point.y) <= UNIT_DEFINITIONS[unit.type].radius + 8;
  });
  return candidates.at(-1) || null;
}

function findEnemyAt(point) {
  const candidates = [
    ...simulation.units.filter((entity) => entity.alive && entity.team === "enemy"),
    ...simulation.structures.filter((entity) => entity.alive && entity.team === "enemy"),
    ...simulation.getDrones().filter((entity) => entity.alive && entity.team === "enemy"),
  ];
  return (
    candidates.find((entity) => {
      const radius =
        entity.kind === "unit"
          ? UNIT_DEFINITIONS[entity.type].radius
          : entity.kind === "structure"
            ? STRUCTURE_DEFINITIONS[entity.type].radius
            : DRONE_DEFINITION.radius;
      return Math.hypot(entity.x - point.x, entity.y - point.y) <= radius + 10;
    }) || null
  );
}

canvas.addEventListener("click", (event) => {
  const point = canvasPoint(event);
  const unit = findUnitAt(point, "player");
  if (!event.shiftKey) selectedUnitIds.clear();
  if (unit) {
    if (event.shiftKey && selectedUnitIds.has(unit.id)) selectedUnitIds.delete(unit.id);
    else selectedUnitIds.add(unit.id);
  }
  updateInterface();
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  if (selectedUnitIds.size === 0) return;
  const point = canvasPoint(event);
  const enemy = findEnemyAt(point);
  if (enemy) {
    simulation.commandAttack([...selectedUnitIds], enemy.id);
    return;
  }

  const selected = [...selectedUnitIds];
  const columns = Math.ceil(Math.sqrt(selected.length));
  selected.forEach((id, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const offsetX = (column - (columns - 1) / 2) * 44;
    const offsetY = (row - (Math.ceil(selected.length / columns) - 1) / 2) * 44;
    simulation.commandMove([id], point.x + offsetX, point.y + offsetY);
  });
});

function activateOverdrive() {
  simulation.activateAbility([...selectedUnitIds], "overdrive");
  updateInterface();
}

overdriveButton.addEventListener("click", activateOverdrive);
pauseButton.addEventListener("click", () => {
  paused = !paused;
  pauseButton.textContent = paused ? "Resume simulation" : "Pause simulation";
});
resetButton.addEventListener("click", resetGame);

window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "q" && !event.repeat) activateOverdrive();
  if (event.code === "Space" && !event.repeat) {
    event.preventDefault();
    pauseButton.click();
  }
});

window.crimsonDawn = {
  get simulation() {
    return simulation;
  },
  reset: resetGame,
};

updateInterface();
requestAnimationFrame(frame);
