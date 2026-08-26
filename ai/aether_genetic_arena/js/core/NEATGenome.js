/**
 * Global or scenario-level Innovation Tracker for historical marking in NEAT.
 */
export class InnovationTracker {
    constructor() {
        this.currentInnovation = 0;
        this.innovations = new Map(); // `${inNodeId}->${outNodeId}` => innovationNumber
        this.nodeCounter = 0;
    }

    /**
     * Gets an existing innovation number for a directed connection or creates a new one.
     * @param {number} inId - Source node ID
     * @param {number} outId - Target node ID
     * @returns {number} Innovation number
     */
    getInnovation(inId, outId) {
        const key = `${inId}->${outId}`;
        if (!this.innovations.has(key)) {
            this.currentInnovation++;
            this.innovations.set(key, this.currentInnovation);
        }
        return this.innovations.get(key);
    }

    /**
     * Allocates a globally unique node ID.
     * @returns {number} Next node ID
     */
    getNextNodeId() {
        return ++this.nodeCounter;
    }
}

/**
 * Dynamic topology neural genome with historical innovation tracking and topological evaluation.
 */
export class NEATGenome {
    /**
     * @param {number} inputCount - Number of sensory input nodes
     * @param {number} outputCount - Number of motor output nodes
     * @param {InnovationTracker|null} [innovationTracker=null] - Tracker for minimal initialization
     */
    constructor(inputCount, outputCount, innovationTracker = null) {
        this.inputCount = inputCount;
        this.outputCount = outputCount;
        this.nodes = []; // { id, type: 'input'|'hidden'|'output', bias, layerOrder }
        this.connections = []; // { inNodeId, outNodeId, weight, enabled, innovation }
        this.fitness = 0;

        if (innovationTracker) {
            this._initMinimal(innovationTracker);
        }
    }

    /**
     * Initializes a minimal fully-connected topology between inputs and outputs.
     * @private
     * @param {InnovationTracker} tracker
     */
    _initMinimal(tracker) {
        // Create input nodes (layerOrder 0.0)
        for (let i = 0; i < this.inputCount; i++) {
            const id = i + 1;
            this.nodes.push({ id, type: 'input', bias: 0, layerOrder: 0.0 });
            if (id > tracker.nodeCounter) tracker.nodeCounter = id;
        }

        // Create output nodes (layerOrder 1.0)
        for (let o = 0; o < this.outputCount; o++) {
            const id = this.inputCount + o + 1;
            this.nodes.push({ id, type: 'output', bias: 0, layerOrder: 1.0 });
            if (id > tracker.nodeCounter) tracker.nodeCounter = id;
        }

        // Fully connect inputs to outputs
        for (let i = 0; i < this.inputCount; i++) {
            for (let o = 0; o < this.outputCount; o++) {
                const inId = i + 1;
                const outId = this.inputCount + o + 1;
                const innov = tracker.getInnovation(inId, outId);
                this.connections.push({
                    inNodeId: inId,
                    outNodeId: outId,
                    weight: (Math.random() * 2 - 1) * 0.5,
                    enabled: true,
                    innovation: innov
                });
            }
        }
    }

    /**
     * Evaluates feedforward propagation across the dynamic topology.
     * Nodes are evaluated in layerOrder sequence.
     * @param {number[]} inputs
     * @returns {number[]} Output activations in [-1, 1]
     */
    predict(inputs) {
        const nodeValues = new Map();

        // Feed input nodes
        for (let i = 0; i < this.inputCount; i++) {
            const id = i + 1;
            nodeValues.set(id, inputs && inputs[i] !== undefined ? inputs[i] : 0);
        }

        // Initialize non-input nodes
        for (const n of this.nodes) {
            if (n.type !== 'input') {
                nodeValues.set(n.id, n.bias || 0);
            }
        }

        // Sort nodes by layerOrder for topological feedforward traversal
        const sortedNodes = [...this.nodes].sort((a, b) => a.layerOrder - b.layerOrder);

        for (const node of sortedNodes) {
            if (node.type === 'input') continue;

            let sum = node.bias || 0;
            for (const conn of this.connections) {
                if (conn.enabled && conn.outNodeId === node.id) {
                    const inVal = nodeValues.get(conn.inNodeId) || 0;
                    sum += inVal * conn.weight;
                }
            }
            nodeValues.set(node.id, Math.tanh(sum));
        }

        const outputs = [];
        for (let o = 0; o < this.outputCount; o++) {
            const outId = this.inputCount + o + 1;
            outputs.push(nodeValues.get(outId) || 0);
        }
        return outputs;
    }

    /**
     * Mutates weights of connections and biases of hidden/output nodes.
     * @param {number} rate - Probability of mutation per parameter
     * @param {number} amount - Max perturbation magnitude
     */
    mutateWeights(rate = 0.8, amount = 0.2) {
        for (const conn of this.connections) {
            if (Math.random() < rate) {
                conn.weight += (Math.random() * 2 - 1) * amount;
            }
        }
        for (const node of this.nodes) {
            if (node.type !== 'input' && Math.random() < rate) {
                node.bias = (node.bias || 0) + (Math.random() * 2 - 1) * amount;
            }
        }
    }

    /**
     * Adds a new connection between two existing unconnected nodes where inNode.layerOrder < outNode.layerOrder.
     * @param {InnovationTracker} tracker
     */
    mutateAddConnection(tracker) {
        const inNodes = this.nodes.filter(n => n.type !== 'output');
        const outNodes = this.nodes.filter(n => n.type !== 'input');
        if (inNodes.length === 0 || outNodes.length === 0) return;

        // Shuffle candidate inNodes to find an available connection
        const shuffledIn = [...inNodes].sort(() => Math.random() - 0.5);

        for (const inNode of shuffledIn) {
            const outCandidates = outNodes.filter(n => n.id !== inNode.id && n.layerOrder > inNode.layerOrder);
            if (outCandidates.length === 0) continue;

            const existingOutIds = new Set(
                this.connections
                    .filter(c => c.inNodeId === inNode.id)
                    .map(c => c.outNodeId)
            );

            const availableOut = outCandidates.filter(n => !existingOutIds.has(n.id));
            if (availableOut.length > 0) {
                const outNode = availableOut[Math.floor(Math.random() * availableOut.length)];
                const innov = tracker.getInnovation(inNode.id, outNode.id);
                this.connections.push({
                    inNodeId: inNode.id,
                    outNodeId: outNode.id,
                    weight: (Math.random() * 2 - 1) * 0.5,
                    enabled: true,
                    innovation: innov
                });
                return;
            }
        }
    }

    /**
     * Adds a new node by splitting an existing enabled connection.
     * @param {InnovationTracker} tracker
     */
    mutateAddNode(tracker) {
        const enabledConns = this.connections.filter(c => c.enabled);
        if (enabledConns.length === 0) return;

        const conn = enabledConns[Math.floor(Math.random() * enabledConns.length)];
        conn.enabled = false;

        const inNode = this.nodes.find(n => n.id === conn.inNodeId);
        const outNode = this.nodes.find(n => n.id === conn.outNodeId);

        const newId = tracker.getNextNodeId();
        const inLayer = inNode ? inNode.layerOrder : 0.0;
        const outLayer = outNode ? outNode.layerOrder : 1.0;
        const newLayer = (inLayer + outLayer) / 2;

        this.nodes.push({
            id: newId,
            type: 'hidden',
            bias: 0,
            layerOrder: newLayer
        });

        const innov1 = tracker.getInnovation(conn.inNodeId, newId);
        const innov2 = tracker.getInnovation(newId, conn.outNodeId);

        this.connections.push({
            inNodeId: conn.inNodeId,
            outNodeId: newId,
            weight: 1.0,
            enabled: true,
            innovation: innov1
        });
        this.connections.push({
            inNodeId: newId,
            outNodeId: conn.outNodeId,
            weight: conn.weight,
            enabled: true,
            innovation: innov2
        });
    }

    /**
     * Combines genes of this genome (parent A) and parent B.
     * Disjoint/excess genes are inherited from the fitter parent.
     * @param {NEATGenome} parentB
     * @returns {NEATGenome} Child genome
     */
    crossover(parentB) {
        const fitter = parentB && parentB.fitness > this.fitness ? parentB : this;
        const lessFit = fitter === this ? parentB : this;

        const child = new NEATGenome(this.inputCount, this.outputCount);
        // Inherit node topology from the fitter parent
        child.nodes = JSON.parse(JSON.stringify(fitter.nodes));

        const lessFitMap = new Map(lessFit.connections.map(c => [c.innovation, c]));

        for (const connFitter of fitter.connections) {
            if (lessFitMap.has(connFitter.innovation)) {
                // Matching gene: choose randomly from either parent
                const connLessFit = lessFitMap.get(connFitter.innovation);
                const chosen = Math.random() < 0.5 ? connFitter : connLessFit;
                child.connections.push({ ...chosen });
            } else {
                // Disjoint or excess gene: inherit from fitter parent
                child.connections.push({ ...connFitter });
            }
        }

        return child;
    }

    /**
     * Measures compatibility distance between two genomes for speciation.
     * @param {NEATGenome} other
     * @param {number} [c1=1.0] - Disjoint excess coefficient
     * @param {number} [c2=1.0] - Disjoint coefficient
     * @param {number} [c3=0.4] - Weight difference coefficient
     * @returns {number} Compatibility distance
     */
    compatibilityDistance(other, c1 = 1.0, c2 = 1.0, c3 = 0.4) {
        let matching = 0;
        let weightDiff = 0;
        const otherMap = new Map(other.connections.map(c => [c.innovation, c]));

        let disjointExcess = 0;
        for (const c of this.connections) {
            if (otherMap.has(c.innovation)) {
                matching++;
                weightDiff += Math.abs(c.weight - otherMap.get(c.innovation).weight);
            } else {
                disjointExcess++;
            }
        }
        for (const c of other.connections) {
            if (!this.connections.some(myC => myC.innovation === c.innovation)) {
                disjointExcess++;
            }
        }

        const n = Math.max(1, Math.max(this.connections.length, other.connections.length));
        const avgWeightDiff = matching > 0 ? weightDiff / matching : 0;
        return (c1 * disjointExcess) / n + c3 * avgWeightDiff;
    }

    /**
     * Deep clone of the genome.
     * @returns {NEATGenome}
     */
    clone() {
        const g = new NEATGenome(this.inputCount, this.outputCount);
        g.nodes = JSON.parse(JSON.stringify(this.nodes));
        g.connections = JSON.parse(JSON.stringify(this.connections));
        g.fitness = this.fitness;
        return g;
    }

    /**
     * Serializes genome to JSON-compatible object.
     * @returns {object}
     */
    toJSON() {
        return {
            type: 'NEAT',
            inputCount: this.inputCount,
            outputCount: this.outputCount,
            nodes: JSON.parse(JSON.stringify(this.nodes)),
            connections: JSON.parse(JSON.stringify(this.connections)),
            fitness: this.fitness
        };
    }

    /**
     * Restores genome from JSON-compatible object.
     * @param {object} data
     * @returns {NEATGenome}
     */
    static fromJSON(data) {
        const g = new NEATGenome(data.inputCount, data.outputCount);
        g.nodes = JSON.parse(JSON.stringify(data.nodes));
        g.connections = JSON.parse(JSON.stringify(data.connections));
        g.fitness = data.fitness || 0;
        return g;
    }
}
