import { GeneticAlgorithm } from '../core/GeneticAlgorithm.js';
import { SpatialGrid, LAYERS } from '../core/SpatialGrid.js';
import { Environment } from './Environment.js';
import { ForagingScenario } from './scenarios/ForagingScenario.js';
import { MazeScenario } from './scenarios/MazeScenario.js';
import { PredatorPreyScenario } from './scenarios/PredatorPreyScenario.js';

/**
 * Simulation orchestrator coordinating fixed-timestep physics, spatial indexing,
 * scenario mechanics, neuroevolution turnovers, and headless instant training.
 */
export class ScenarioManager {
    /**
     * @param {number} [width=800] - Arena width
     * @param {number} [height=600] - Arena height
     */
    constructor(width = 800, height = 600) {
        this.width = width;
        this.height = height;
        this.spatialGrid = new SpatialGrid(width, height, 64);
        this.environment = new Environment(width, height);
        this.ga = null;
        this.scenario = null;
        this.agents = [];
        this.ticks = 0;
        this.maxTicksPerGen = 1200; // 20s @ 60fps
        this.selectedAgent = null;
        this.onGenerationEnd = null;
        this.allTimeBestFitness = 0;
        this.lastGenBestFitness = 0;
    }

    /**
     * Current generation index.
     * @returns {number}
     */
    get generation() {
        return this.ga ? this.ga.generation : 1;
    }

    /**
     * Loads a scenario by type identifier ('foraging', 'maze', 'predator_prey').
     * @param {'foraging'|'maze'|'predator_prey'} [type='foraging']
     * @param {object} [config={}] - Configuration overrides (popSize, modelType, etc.)
     */
    loadScenario(type = 'foraging', config = {}) {
        this.ga = new GeneticAlgorithm({
            popSize: config.popSize || 40,
            modelType: config.modelType || 'NEAT',
            inputCount: 8,
            outputCount: 2
        });

        if (type === 'maze') {
            this.scenario = new MazeScenario(this);
        } else if (type === 'predator_prey') {
            this.scenario = new PredatorPreyScenario(this);
        } else {
            this.scenario = new ForagingScenario(this);
        }

        this.allTimeBestFitness = 0;
        this.lastGenBestFitness = 0;
        this._resetEpoch();
    }

    /**
     * Resets the simulation epoch for a new generation.
     * @private
     */
    _resetEpoch() {
        this.ticks = 0;
        this.environment.registerInGrid(this.spatialGrid);
        this.agents = this.scenario.setup(this.environment, this.ga);
        this.selectedAgent = this.agents[0] || null;
    }

    /**
     * Advances the simulation by a fixed time step dt.
     * @param {number} [dt=1/60] - Timestep in seconds
     */
    step(dt = 1 / 60) {
        this.ticks++;

        // 1. Update living agents in spatial grid
        this.spatialGrid.clearLayer(LAYERS.AGENTS);
        for (const agent of this.agents) {
            if (agent.alive) {
                this.spatialGrid.insert(agent, LAYERS.AGENTS);
            }
        }

        // 2. Sensory, neural, and kinematics updates
        for (const agent of this.agents) {
            agent.update(this.spatialGrid, dt);
        }

        // 3. Scenario-specific objective mechanics & interactions
        if (this.scenario) {
            this.scenario.tick(this.agents, this.environment, this.spatialGrid);
        }

        // 4. Check epoch completion criteria
        const livingCount = this.agents.filter(a => a.alive).length;
        if (this.ticks >= this.maxTicksPerGen || livingCount === 0) {
            this.endGeneration();
        }
    }

    /**
     * Concludes the current generation, evolves population, notifies listeners, and starts new epoch.
     */
    endGeneration() {
        if (!this.ga) return;

        // 1. Transfer fitness to GA population
        for (let i = 0; i < this.ga.population.length; i++) {
            const agent = this.agents[i];
            if (agent) {
                this.ga.population[i].fitness = agent.fitness;
            }
        }

        // 2. Evolve next generation
        const best = this.ga.evolveNextGeneration();
        if (best) {
            this.lastGenBestFitness = best.fitness || 0;
            if (this.lastGenBestFitness > this.allTimeBestFitness) {
                this.allTimeBestFitness = this.lastGenBestFitness;
            }
        }

        // 3. Scenario epoch turnover hook (passing agents list for multi-population setups)
        if (this.scenario && typeof this.scenario.onEpochEnd === 'function') {
            this.scenario.onEpochEnd(this.agents);
        }

        // 4. Notify external listener
        if (typeof this.onGenerationEnd === 'function') {
            this.onGenerationEnd(this.ga.generation, best, this.ga.fitnessHistory);
        }

        // 5. Setup new epoch
        this._resetEpoch();
    }

    /**
     * Executes a complete generation instantaneously in headless mode.
     */
    runInstantGeneration() {
        const startGen = this.generation;
        let safetyCounter = 0;
        const maxSteps = this.maxTicksPerGen + 100;

        while (this.generation === startGen && safetyCounter < maxSteps) {
            this.step(1 / 60);
            safetyCounter++;
        }
    }
}
