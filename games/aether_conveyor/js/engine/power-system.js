/**
 * PowerSystem — Electrical Grid Graph, Transmission Wires & Satisfaction Calculation
 */

import { BUILDINGS } from '../config.js';

export class PowerSystem {
  /**
   * @param {WorldGrid} grid
   */
  constructor(grid) {
    this.grid = grid;
    this.poles = new Map(); // id -> pole building
    this.generators = new Map(); // id -> generator building
    this.wires = []; // [{ fromX, fromY, toX, toY }] for rendering
    this.totalGeneration = 0;
    this.totalDemand = 0;
    this.satisfactionRatio = 1.0; // 0.0 to 1.0
  }

  clear() {
    this.poles.clear();
    this.generators.clear();
    this.wires = [];
    this.totalGeneration = 0;
    this.totalDemand = 0;
    this.satisfactionRatio = 1.0;
  }

  /**
   * Registers a power pole, solar panel, or dynamo generator.
   */
  register(building) {
    if (building.type === 'POWER_POLE') {
      this.poles.set(building.id, building);
      this.recalculateWires();
    } else if (building.type === 'SOLAR_PANEL' || building.type === 'DYNAMO_GENERATOR') {
      this.generators.set(building.id, building);
    }
  }

  /**
   * Unregisters a building from the power system.
   */
  unregister(buildingId) {
    this.poles.delete(buildingId);
    this.generators.delete(buildingId);
    this.recalculateWires();
  }

  /**
   * Recalculates wire connections between power poles based on distance.
   */
  recalculateWires() {
    this.wires = [];
    const poleList = Array.from(this.poles.values());
    const maxDist = 7.5; // Max wire span in tiles
    const maxDistSq = maxDist * maxDist;

    for (let i = 0; i < poleList.length; i++) {
      const p1 = poleList[i];
      for (let j = i + 1; j < poleList.length; j++) {
        const p2 = poleList[j];
        const dx = p1.gx - p2.gx;
        const dy = p1.gy - p2.gy;
        const distSq = dx * dx + dy * dy;

        if (distSq <= maxDistSq) {
          this.wires.push({
            fromX: p1.gx * 48 + 24,
            fromY: p1.gy * 48 + 24,
            toX: p2.gx * 48 + 24,
            toY: p2.gy * 48 + 24,
          });
        }
      }
    }
  }

  /**
   * Updates generation, demand, and computes the global satisfaction ratio.
   * @param {Map<string, object>} machines
   * @param {Map<string, object>} inserters
   */
  update(machines, inserters) {
    let gen = 0;

    // Baseline auxiliary micro-reactor from Tech Hub so players can power starter drills
    gen += 80;

    for (const generator of this.generators.values()) {
      if (generator.type === 'SOLAR_PANEL') {
        gen += (BUILDINGS.SOLAR_PANEL.powerGeneration || 50);
      } else if (generator.type === 'DYNAMO_GENERATOR') {
        if (generator.isGenerating) {
          gen += (BUILDINGS.DYNAMO_GENERATOR.powerGeneration || 160);
        }
      }
    }

    let demand = 0;
    for (const machine of machines.values()) {
      if (machine.active) {
        const conf = BUILDINGS[machine.type];
        demand += (conf && conf.powerUsage) ? conf.powerUsage : 40;
      }
    }

    for (const inserter of inserters.values()) {
      if (inserter.state !== 'IDLE') {
        demand += 15;
      }
    }

    this.totalGeneration = gen;
    this.totalDemand = demand;

    if (demand === 0) {
      this.satisfactionRatio = 1.0;
    } else {
      this.satisfactionRatio = Math.max(0.1, Math.min(1.0, gen / demand));
    }
  }
}
