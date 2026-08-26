import { Agent } from '../Agent.js';
import { GeneticAlgorithm } from '../../core/GeneticAlgorithm.js';

/**
 * Coevolution scenario where Predators and Prey evolve concurrently in the same arena.
 */
export class PredatorPreyScenario {
    constructor(manager) {
        this.manager = manager;
        this.name = 'Predator vs Prey Coevolution';
        this.description = 'Asymmetric coevolution: Prey evolve evasion & grazing while Predators evolve pursuit & interception.';
        this.predatorGA = null;
    }

    setup(environment, preyGA) {
        environment.populateForaging(45, 0);

        if (!this.predatorGA) {
            this.predatorGA = new GeneticAlgorithm({
                popSize: Math.max(6, Math.floor(preyGA.popSize * 0.3)),
                modelType: preyGA.modelType,
                inputCount: preyGA.inputCount,
                outputCount: preyGA.outputCount
            });
        }

        const agents = [];
        // 1. Spawn Prey
        for (let i = 0; i < preyGA.population.length; i++) {
            const isElite = !!preyGA.population[i].isElite;
            agents.push(new Agent({
                id: `prey_${i}`,
                type: 'prey',
                x: 100 + Math.random() * (environment.width - 200),
                y: 100 + Math.random() * (environment.height - 200),
                brain: preyGA.population[i],
                isElite,
                maxSpeed: 3.9,
                energy: 100,
                maxEnergy: 150
            }));
        }

        // 2. Spawn Predators
        for (let i = 0; i < this.predatorGA.population.length; i++) {
            const isElite = !!this.predatorGA.population[i].isElite;
            agents.push(new Agent({
                id: `pred_${i}`,
                type: 'predator',
                x: 50 + Math.random() * (environment.width - 100),
                y: 50 + Math.random() * (environment.height - 100),
                brain: this.predatorGA.population[i],
                isElite,
                maxSpeed: 3.5,
                radius: 9,
                energy: 140,
                maxEnergy: 180
            }));
        }

        return agents;
    }

    tick(agents, environment, spatialGrid) {
        const predators = agents.filter(a => a.type === 'predator' && a.alive);
        const preys = agents.filter(a => a.type === 'prey' && a.alive);

        // Predator hunting
        for (const pred of predators) {
            for (const prey of preys) {
                const dx = prey.x - pred.x;
                const dy = prey.y - pred.y;
                const distSq = dx * dx + dy * dy;
                const hitDist = pred.radius + prey.radius;

                if (distSq <= hitDist * hitDist) {
                    pred.fitness += 300; // Reward for catching prey
                    pred.energy = Math.min(pred.maxEnergy, pred.energy + 50);
                    prey.alive = false;
                    prey.energy = 0;
                }
            }
            const forwardSpeed = (pred.vx * Math.cos(pred.angle) + pred.vy * Math.sin(pred.angle)) / pred.maxSpeed;
            if (forwardSpeed > 0.1) pred.fitness += forwardSpeed * 0.1;
        }

        // Prey grazing & survival
        for (const prey of preys) {
            const forwardSpeed = (prey.vx * Math.cos(prey.angle) + prey.vy * Math.sin(prey.angle)) / prey.maxSpeed;
            if (forwardSpeed > 0.1) prey.fitness += forwardSpeed * 0.15;
        }
    }

    onEpochEnd(agents = null) {
        if (this.predatorGA) {
            if (Array.isArray(agents)) {
                const predatorAgents = agents.filter(a => a.type === 'predator');
                for (let i = 0; i < this.predatorGA.population.length; i++) {
                    if (predatorAgents[i]) {
                        this.predatorGA.population[i].fitness = predatorAgents[i].fitness;
                    }
                }
            }
            this.predatorGA.evolveNextGeneration();
        }
    }
}
