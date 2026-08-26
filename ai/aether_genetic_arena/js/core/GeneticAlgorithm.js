import { NeuralNetwork } from './NeuralNetwork.js';
import { NEATGenome, InnovationTracker } from './NEATGenome.js';

/**
 * Genetic Algorithm engine managing population turnover, selection strategies,
 * speciation, elitism, crossover, mutation, and generation fitness tracking.
 */
export class GeneticAlgorithm {
    /**
     * @param {object} [config={}]
     * @param {number} [config.popSize=40] - Population size per generation
     * @param {'MLP'|'NEAT'} [config.modelType='NEAT'] - Neural model architecture type
     * @param {number} [config.inputCount=8] - Number of sensory inputs
     * @param {number} [config.outputCount=2] - Number of motor outputs
     * @param {number} [config.elitismRate=0.10] - Fraction of top performers preserved unchanged
     * @param {number} [config.mutationRate=0.8] - Probability of parameter mutation
     * @param {number} [config.mutationAmount=0.25] - Perturbation scale for mutations
     * @param {number} [config.compatibilityThreshold=3.0] - NEAT speciation threshold
     * @param {InnovationTracker} [config.innovationTracker=null] - Tracker instance for NEAT innovations
     */
    constructor(config = {}) {
        this.popSize = config.popSize || 40;
        this.modelType = config.modelType || 'NEAT';
        this.inputCount = config.inputCount || 8;
        this.outputCount = config.outputCount || 2;
        this.elitismRate = config.elitismRate !== undefined ? config.elitismRate : 0.10;
        this.mutationRate = config.mutationRate !== undefined ? config.mutationRate : 0.8;
        this.mutationAmount = config.mutationAmount !== undefined ? config.mutationAmount : 0.25;
        this.compatibilityThreshold = config.compatibilityThreshold || 3.0;
        this.innovationTracker = config.innovationTracker || new InnovationTracker();

        this.generation = 1;
        this.population = [];
        this.species = [];
        this.bestIndividual = null;
        this.allTimeBestFitness = 0;
        this.fitnessHistory = [];

        this._initPopulation();
    }

    /**
     * Initializes the population with fresh random individuals.
     * @private
     */
    _initPopulation() {
        this.population = [];
        for (let i = 0; i < this.popSize; i++) {
            let individual;
            if (this.modelType === 'NEAT') {
                individual = new NEATGenome(this.inputCount, this.outputCount, this.innovationTracker);
            } else {
                individual = new NeuralNetwork(this.inputCount, 8, this.outputCount);
            }
            individual.fitness = 0;
            individual.isElite = false;
            this.population.push(individual);
        }
    }

    /**
     * Tournament selection: samples k individuals and selects the one with the highest fitness.
     * @param {number} [k=3] - Tournament participant count
     * @returns {NeuralNetwork|NEATGenome} Selected individual
     */
    tournamentSelect(k = 3) {
        if (this.population.length === 0) return null;
        const sampleSize = Math.min(k, this.population.length);
        if (sampleSize >= this.population.length) {
            return this.population.reduce((best, ind) => (!best || (ind.fitness || 0) > (best.fitness || 0)) ? ind : best, null);
        }
        let best = null;
        for (let i = 0; i < sampleSize; i++) {
            const ind = this.population[Math.floor(Math.random() * this.population.length)];
            if (!best || (ind.fitness || 0) > (best.fitness || 0)) {
                best = ind;
            }
        }
        return best;
    }

    /**
     * Fitness-proportional roulette wheel selection.
     * @returns {NeuralNetwork|NEATGenome} Selected individual
     */
    rouletteSelect() {
        if (this.population.length === 0) return null;
        const minFitness = Math.min(...this.population.map(p => p.fitness || 0));
        const offset = minFitness < 0 ? -minFitness + 1 : 1;
        const totalFitness = this.population.reduce((sum, ind) => sum + ((ind.fitness || 0) + offset), 0);

        let r = Math.random() * totalFitness;
        for (const ind of this.population) {
            r -= ((ind.fitness || 0) + offset);
            if (r <= 0) return ind;
        }
        return this.population[this.population.length - 1];
    }

    /**
     * Organizes genomes into species based on compatibility distance.
     * @param {number} [threshold=this.compatibilityThreshold]
     */
    speciate(threshold = this.compatibilityThreshold) {
        if (this.modelType !== 'NEAT') {
            this.species = [];
            return;
        }

        for (const spec of this.species) {
            spec.members = [];
        }

        for (const genome of this.population) {
            let placed = false;
            for (const spec of this.species) {
                if (spec.representative && genome.compatibilityDistance(spec.representative) < threshold) {
                    spec.members.push(genome);
                    placed = true;
                    break;
                }
            }

            if (!placed) {
                this.species.push({
                    id: this.species.length + 1,
                    representative: genome.clone(),
                    members: [genome]
                });
            }
        }

        this.species = this.species.filter(s => s.members.length > 0);
        for (const spec of this.species) {
            if (spec.members.length > 0) {
                spec.representative = spec.members[Math.floor(Math.random() * spec.members.length)].clone();
            }
        }
    }

    /**
     * Evaluates the current generation, preserves elites, produces offspring via
     * crossover and mutation, records metrics, and transitions to the next generation.
     * @returns {NeuralNetwork|NEATGenome} Deep clone of the generation's best individual
     */
    evolveNextGeneration() {
        if (this.population.length === 0) return null;

        // Sort descending by fitness
        this.population.sort((a, b) => (b.fitness || 0) - (a.fitness || 0));

        // Save best performer
        this.bestIndividual = this.population[0].clone();
        this.bestIndividual.fitness = this.population[0].fitness;
        if (this.bestIndividual.fitness > this.allTimeBestFitness) {
            this.allTimeBestFitness = this.bestIndividual.fitness;
        }

        // Record generation stats
        const totalFitness = this.population.reduce((sum, ind) => sum + (ind.fitness || 0), 0);
        const avgFitness = totalFitness / this.population.length;

        this.fitnessHistory.push({
            gen: this.generation,
            max: this.bestIndividual.fitness,
            avg: avgFitness
        });

        // Speciation
        if (this.modelType === 'NEAT') {
            this.speciate(this.compatibilityThreshold);
        }

        const nextPop = [];
        const eliteCount = Math.max(1, Math.floor(this.popSize * this.elitismRate));

        // Elitism: copy top performers directly and tag as elite
        for (let i = 0; i < eliteCount && i < this.population.length; i++) {
            const elite = this.population[i].clone();
            elite.fitness = 0;
            elite.isElite = true;
            nextPop.push(elite);
        }

        // Produce remaining children
        while (nextPop.length < this.popSize) {
            const parentA = this.tournamentSelect(3);
            const parentB = this.tournamentSelect(3);

            let child;
            if (this.modelType === 'NEAT' && parentA && parentB && parentA.crossover) {
                child = parentA.crossover(parentB);
                if (Math.random() < 0.08) child.mutateAddNode(this.innovationTracker);
                if (Math.random() < 0.15) child.mutateAddConnection(this.innovationTracker);
                child.mutateWeights(this.mutationRate, this.mutationAmount);
            } else if (parentA) {
                child = parentA.clone();
                child.mutate(this.mutationRate, this.mutationAmount);
            } else {
                child = this.modelType === 'NEAT'
                    ? new NEATGenome(this.inputCount, this.outputCount, this.innovationTracker)
                    : new NeuralNetwork(this.inputCount, 8, this.outputCount);
            }

            child.fitness = 0;
            child.isElite = false;
            nextPop.push(child);
        }

        this.population = nextPop;
        this.generation++;
        return this.bestIndividual;
    }
}
