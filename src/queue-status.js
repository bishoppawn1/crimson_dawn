function progressPercent(progress, duration) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const safeProgress = Number.isFinite(progress) ? progress : 0;
  return Math.max(0, Math.min(100, Math.floor((safeProgress / duration) * 100)));
}

export function describeProductionQueue(factory, unitDefinitions) {
  const orders = factory?.productionQueue || [];
  if (orders.length === 0) return null;

  const currentOrder = orders[0];
  const currentDefinition = unitDefinitions[currentOrder.unitType];
  if (!currentDefinition) return null;
  const progress = progressPercent(currentOrder.progress, currentDefinition.productionTime);
  const status = !factory.complete
    ? "Waiting for factory completion"
    : !factory.powered
      ? "Waiting for power"
      : progress >= 100
        ? "Ready · waiting for a clear exit"
        : "In production";

  return {
    kind: "production",
    current: {
      name: currentDefinition.name,
      progress,
      status,
    },
    upcoming: orders.slice(1).map((order) => ({
      name: unitDefinitions[order.unitType]?.name || order.unitType,
    })),
  };
}

export function describeConstructionQueue(worker, simulation, structureDefinitions) {
  const currentStructure = simulation.getStructure(worker?.buildTargetId);
  const current = currentStructure?.alive && !currentStructure.complete
    ? currentStructure
    : null;
  const upcoming = (worker?.buildQueue || [])
    .map((structureId) => simulation.getStructure(structureId))
    .filter((structure) => structure?.alive && !structure.complete);
  if (!current && upcoming.length === 0) return null;

  const currentDefinition = current ? structureDefinitions[current.type] : null;
  return {
    kind: "construction",
    current: current && currentDefinition
      ? {
        name: currentDefinition.name,
        progress: progressPercent(
          current.constructionProgress,
          currentDefinition.buildTime,
        ),
        status: worker.state === "stasis" ? "Worker in stasis" : "Construction assigned",
      }
      : null,
    upcoming: upcoming.map((structure) => ({
      name: structureDefinitions[structure.type]?.name || structure.type,
    })),
  };
}
