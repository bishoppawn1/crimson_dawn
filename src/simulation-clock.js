const CLOCK_EPSILON = 1e-9;

export class FixedStepSimulationClock {
  constructor({
    stepSeconds = 1 / 30,
    maximumElapsedSeconds = 1,
  } = {}) {
    if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) {
      throw new Error("Simulation clock step must be positive.");
    }
    if (!Number.isFinite(maximumElapsedSeconds) || maximumElapsedSeconds < stepSeconds) {
      throw new Error("Simulation clock catch-up window must contain at least one step.");
    }
    this.stepSeconds = stepSeconds;
    this.maximumElapsedSeconds = maximumElapsedSeconds;
    this.maximumStepsPerAdvance = Math.ceil(maximumElapsedSeconds / stepSeconds);
    this.lastTimeMs = null;
    this.accumulatorSeconds = 0;
  }

  reset(nowMs = null) {
    this.lastTimeMs = Number.isFinite(nowMs) ? nowMs : null;
    this.accumulatorSeconds = 0;
  }

  advance(nowMs, running, tick) {
    if (!Number.isFinite(nowMs)) return { elapsedSeconds: 0, steps: 0 };
    if (!running || typeof tick !== "function") {
      this.reset(nowMs);
      return { elapsedSeconds: 0, steps: 0 };
    }
    if (!Number.isFinite(this.lastTimeMs)) {
      this.lastTimeMs = nowMs;
      return { elapsedSeconds: 0, steps: 0 };
    }

    const elapsedSeconds = Math.min(
      this.maximumElapsedSeconds,
      Math.max(0, (nowMs - this.lastTimeMs) / 1000),
    );
    this.lastTimeMs = nowMs;
    this.accumulatorSeconds += elapsedSeconds;

    let steps = 0;
    while (
      this.accumulatorSeconds + CLOCK_EPSILON >= this.stepSeconds &&
      steps < this.maximumStepsPerAdvance
    ) {
      tick(this.stepSeconds);
      this.accumulatorSeconds = Math.max(0, this.accumulatorSeconds - this.stepSeconds);
      steps += 1;
    }
    return { elapsedSeconds, steps };
  }
}
