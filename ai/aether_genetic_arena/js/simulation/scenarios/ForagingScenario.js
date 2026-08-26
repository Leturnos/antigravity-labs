import { Agent } from '../Agent.js';
import { LAYERS } from '../../core/SpatialGrid.js';

/**
 * Foraging scenario where agents compete to find food while avoiding toxic hazards.
 */
export class ForagingScenario {
    /**
     * @param {object} manager - Reference to parent ScenarioManager
     */
    constructor(manager) {
        this.manager = manager;
        this.name = 'Foraging & Survival';
        this.description = 'Organisms evolve sensory navigation to locate food resources while evading hazards.';
    }

    /**
     * Sets up the environment and agents for an epoch.
     * @param {import('../Environment.js').Environment} environment
     * @param {import('../../core/GeneticAlgorithm.js').GeneticAlgorithm} ga
     * @returns {Agent[]} List of initialized agents
     */
    setup(environment, ga) {
        environment.populateForaging(55, 14);
        const agents = [];
        const padding = 80;

        for (let i = 0; i < ga.population.length; i++) {
            const isElite = !!ga.population[i].isElite;
            agents.push(new Agent({
                id: `agent_${i}`,
                x: padding + Math.random() * (environment.width - padding * 2),
                y: padding + Math.random() * (environment.height - padding * 2),
                brain: ga.population[i],
                isElite,
                energy: 100,
                maxEnergy: 160
            }));
        }
        return agents;
    }

    /**
     * Executes scenario-specific logic per fixed simulation step.
     * @param {Agent[]} agents
     * @param {import('../Environment.js').Environment} environment
     * @param {import('../../core/SpatialGrid.js').SpatialGrid} spatialGrid
     */
    tick(agents, environment, spatialGrid) {
        for (const agent of agents) {
            if (!agent.alive) continue;

            // 1. Food eating
            const nearbyFood = spatialGrid.queryRadius(agent.x, agent.y, agent.radius + 6, LAYERS.FOOD);
            for (const f of nearbyFood) {
                agent.energy = Math.min(agent.maxEnergy, agent.energy + (f.energyValue || 45));
                agent.fitness += 250; // Major reward for collecting food

                // Remove eaten food from environment & spatial grid
                environment.food = environment.food.filter(item => item.id !== f.id);
                spatialGrid.remove(f, LAYERS.FOOD);

                // Respawn replacement food
                const padding = 40;
                const newFood = {
                    id: `f_resp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                    x: padding + Math.random() * (environment.width - padding * 2),
                    y: padding + Math.random() * (environment.height - padding * 2),
                    radius: 4.5,
                    energyValue: 45
                };
                environment.food.push(newFood);
                spatialGrid.insert(newFood, LAYERS.FOOD);
            }

            // 2. Hazard damage
            const nearbyHazards = spatialGrid.queryRadius(agent.x, agent.y, agent.radius + 7, LAYERS.HAZARDS);
            for (const h of nearbyHazards) {
                agent.energy -= (h.damageValue || 50);
                agent.fitness = Math.max(0, agent.fitness - 100);
                if (agent.energy <= 0) {
                    agent.energy = 0;
                    agent.alive = false;
                }
            }

            // 3. Exploration reward & Anti-Spinning penalty
            const forwardSpeed = (agent.vx * Math.cos(agent.angle) + agent.vy * Math.sin(agent.angle)) / agent.maxSpeed;
            if (forwardSpeed > 0.1) {
                agent.fitness += forwardSpeed * 0.15; // Reward active movement
            }
            if (Math.abs(agent.angularVelocity) > 0.08 && Math.abs(forwardSpeed) < 0.1) {
                agent.fitness = Math.max(0, agent.fitness - 0.08); // Penalize spinning in place
            }
        }
    }
}
