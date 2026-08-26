import { Agent } from '../Agent.js';
import { LAYERS } from '../../core/SpatialGrid.js';

/**
 * Procedural maze navigation scenario testing pathfinding and barrier avoidance.
 */
export class MazeScenario {
    constructor(manager) {
        this.manager = manager;
        this.name = 'Procedural Maze Navigation';
        this.description = 'Organisms evolve obstacle avoidance and waypoint navigation through sequential checkpoints.';
        this.checkpoints = [];
    }

    setup(environment, ga) {
        environment.food = [];
        environment.hazards = [];

        // Maze obstacles
        environment.walls = [
            ...environment.walls,
            { id: 'm_w1', x: 260, y: 180, radius: 18 },
            { id: 'm_w2', x: 260, y: 380, radius: 18 },
            { id: 'm_w3', x: 520, y: 220, radius: 18 },
            { id: 'm_w4', x: 520, y: 420, radius: 18 }
        ];

        this.checkpoints = [
            { x: 380, y: 150, radius: 30, index: 1 },
            { x: 380, y: 460, radius: 30, index: 2 },
            { x: 710, y: 280, radius: 35, index: 3 }
        ];

        const agents = [];
        for (let i = 0; i < ga.population.length; i++) {
            const isElite = !!ga.population[i].isElite;
            agents.push(new Agent({
                id: `agent_${i}`,
                x: 80,
                y: 280 + (Math.random() * 40 - 20),
                brain: ga.population[i],
                isElite,
                energy: 140,
                maxEnergy: 160
            }));
            agents[i].currentCheckpoint = 0;
        }
        return agents;
    }

    tick(agents, environment, spatialGrid) {
        for (const agent of agents) {
            if (!agent.alive) continue;
            const target = this.checkpoints[agent.currentCheckpoint || 0];
            if (target) {
                const dx = target.x - agent.x;
                const dy = target.y - agent.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < target.radius + agent.radius) {
                    agent.fitness += 600; // Checkpoint reached bonus
                    agent.energy = Math.min(agent.maxEnergy, agent.energy + 50);
                    agent.currentCheckpoint = (agent.currentCheckpoint || 0) + 1;
                } else {
                    agent.fitness += Math.max(0, (800 - dist) * 0.02);
                }
            }

            const forwardSpeed = (agent.vx * Math.cos(agent.angle) + agent.vy * Math.sin(agent.angle)) / agent.maxSpeed;
            if (forwardSpeed > 0.1) {
                agent.fitness += forwardSpeed * 0.1;
            }
        }
    }
}
