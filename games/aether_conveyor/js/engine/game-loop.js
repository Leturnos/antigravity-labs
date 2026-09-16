/**
 * GameLoop — Fixed-Timestep Deterministic Simulation & Variable-Rate Rendering Loop
 */

import { SIMULATION_TICK_RATE, SIMULATION_DT } from '../config.js';

export class GameLoop {
  /**
   * @param {Function} onTick Callback for deterministic simulation update(dt)
   * @param {Function} onRender Callback for rendering(interpolationAlpha)
   */
  constructor(onTick, onRender) {
    this.onTick = onTick;
    this.onRender = onRender;

    this.isRunning = false;
    this.isPaused = false;
    this.speedMultiplier = 1.0;

    this.lastTime = 0;
    this.accumulator = 0;
    this.rafId = null;

    // Metrics
    this.fps = 60;
    this.ups = 60;
    this.frameCount = 0;
    this.tickCount = 0;
    this.metricsTimer = 0;
  }

  /**
   * Starts the game loop.
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this._frame.bind(this));
  }

  /**
   * Stops the game loop.
   */
  stop() {
    this.isRunning = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Toggles pause state.
   */
  togglePause() {
    this.isPaused = !this.isPaused;
    return this.isPaused;
  }

  /**
   * Explicitly pauses the simulation.
   */
  pause() {
    this.isPaused = true;
    return this.isPaused;
  }

  /**
   * Explicitly resumes the simulation.
   */
  resume() {
    this.isPaused = false;
    return this.isPaused;
  }

  /**
   * Sets simulation speed (1x, 2x, 5x).
   */
  setSpeed(multiplier) {
    this.speedMultiplier = Math.max(0.1, Math.min(10.0, multiplier));
  }

  /**
   * Main requestAnimationFrame handler.
   * @private
   */
  _frame(currentTime) {
    if (!this.isRunning) return;

    let delta = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // Clamp delta to avoid spiral of death after backgrounding
    if (delta > 0.25) delta = 0.25;

    // Metrics aggregation every 1s
    this.metricsTimer += delta;
    this.frameCount++;
    if (this.metricsTimer >= 1.0) {
      this.fps = this.frameCount;
      this.ups = this.tickCount;
      this.frameCount = 0;
      this.tickCount = 0;
      this.metricsTimer -= 1.0;
    }

    if (!this.isPaused) {
      this.accumulator += delta * this.speedMultiplier;

      // Execute deterministic ticks
      while (this.accumulator >= SIMULATION_DT) {
        this.onTick(SIMULATION_DT);
        this.accumulator -= SIMULATION_DT;
        this.tickCount++;
      }
    }

    // Alpha for rendering interpolation between ticks
    const alpha = this.isPaused ? 0.0 : (this.accumulator / SIMULATION_DT);
    this.onRender(alpha);

    this.rafId = requestAnimationFrame(this._frame.bind(this));
  }
}
