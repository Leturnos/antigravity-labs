/**
 * Real-time Synapse HUD rendering neural network topologies with cached node layouts.
 * Visualizes dynamic NEAT genomes or fixed MLP neural networks with high-DPI crisp rendering,
 * positive/negative synapse weighting, and firing node color coding.
 */
export class BrainVisualizer {
    /**
     * @param {HTMLCanvasElement} canvas - Target canvas for neural HUD rendering
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas ? canvas.getContext('2d') : null;
        this.cachedAgentId = null;
        this.cachedBrainRef = null;
        this.nodePositions = new Map(); // id -> { x, y, type, id, label }
        this.cachedConnections = [];    // array of { inNodeId, outNodeId, weight, enabled }
        this.pulsePhase = 0;
    }

    /**
     * Forces layout recalculation on next render call.
     */
    invalidateCache() {
        this.cachedAgentId = null;
        this.cachedBrainRef = null;
        this.nodePositions.clear();
        this.cachedConnections = [];
    }

    /**
     * Recomputes high-DPI canvas dimensions.
     * @private
     */
    _setupDpi() {
        if (!this.canvas || typeof window === 'undefined') return { width: 320, height: 180 };
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 2;
        const displayWidth = Math.max(300, Math.floor(rect.width || 320));
        const displayHeight = Math.max(160, Math.floor(rect.height || 180));

        if (this.canvas.width !== displayWidth * dpr || this.canvas.height !== displayHeight * dpr) {
            this.canvas.width = displayWidth * dpr;
            this.canvas.height = displayHeight * dpr;
            this.invalidateCache();
        }
        return { width: displayWidth * dpr, height: displayHeight * dpr, dpr };
    }

    /**
     * Recomputes the 2D layout coordinates for all neurons in the network.
     * @private
     * @param {object} brain - Neural network or NEAT genome
     * @param {number} width
     * @param {number} height
     */
    _recomputeLayout(brain, width = 640, height = 360) {
        this.nodePositions.clear();
        this.cachedConnections = [];

        if (!brain) return;

        const paddingX = 70;
        const paddingY = 30;

        const inputLabels = ['Visão E2', 'Visão E1', 'Visão Centro', 'Visão D1', 'Visão D2', 'Velocidade', 'Giro', 'Energia'];
        const outputLabels = ['Aceleração', 'Direção'];

        // Case 1: NEAT Genome with explicit nodes and connections
        if (Array.isArray(brain.nodes) && Array.isArray(brain.connections)) {
            const layers = new Map();
            for (const n of brain.nodes) {
                let layer = n.layerOrder;
                if (layer === undefined) {
                    layer = n.type === 'input' ? 0 : (n.type === 'output' ? 1 : 0.5);
                }
                if (!layers.has(layer)) layers.set(layer, []);
                layers.get(layer).push(n);
            }

            const sortedLayers = [...layers.keys()].sort((a, b) => a - b);
            const layerCount = sortedLayers.length;

            sortedLayers.forEach((layerKey, layerIdx) => {
                const nodesInLayer = layers.get(layerKey);
                const x = layerCount === 1
                    ? width / 2
                    : paddingX + (layerIdx / (layerCount - 1)) * (width - paddingX * 2);

                nodesInLayer.forEach((node, nodeIdx) => {
                    const y = paddingY + ((nodeIdx + 1) / (nodesInLayer.length + 1)) * (height - paddingY * 2);
                    let label = `N${node.id}`;
                    if (node.type === 'input') label = inputLabels[node.id - 1] || `In ${node.id}`;
                    else if (node.type === 'output') label = outputLabels[node.id - (brain.inputCount || 8) - 1] || `Out ${node.id}`;

                    this.nodePositions.set(node.id, {
                        x,
                        y,
                        type: node.type || (layerIdx === 0 ? 'input' : (layerIdx === layerCount - 1 ? 'output' : 'hidden')),
                        id: node.id,
                        label
                    });
                });
            });

            this.cachedConnections = brain.connections.map(c => ({
                inNodeId: c.inNodeId,
                outNodeId: c.outNodeId,
                weight: c.weight,
                enabled: c.enabled !== false
            }));
            return;
        }

        // Case 2: Fixed MLP NeuralNetwork
        if (brain.weightsIH && brain.weightsHO) {
            const inCount = brain.inputSize || 8;
            const hidCount = brain.hiddenSize || 8;
            const outCount = brain.outputSize || 2;

            // Input Nodes
            for (let i = 0; i < inCount; i++) {
                const id = `in_${i}`;
                const x = paddingX;
                const y = paddingY + ((i + 1) / (inCount + 1)) * (height - paddingY * 2);
                this.nodePositions.set(id, { x, y, type: 'input', id, label: inputLabels[i] || `In ${i}` });
            }

            // Hidden Nodes
            for (let h = 0; h < hidCount; h++) {
                const id = `h_${h}`;
                const x = width / 2;
                const y = paddingY + ((h + 1) / (hidCount + 1)) * (height - paddingY * 2);
                this.nodePositions.set(id, { x, y, type: 'hidden', id, label: `H${h + 1}` });
            }

            // Output Nodes
            for (let o = 0; o < outCount; o++) {
                const id = `out_${o}`;
                const x = width - paddingX;
                const y = paddingY + ((o + 1) / (outCount + 1)) * (height - paddingY * 2);
                this.nodePositions.set(id, { x, y, type: 'output', id, label: outputLabels[o] || `Out ${o}` });
            }

            // IH Connections
            for (let h = 0; h < hidCount; h++) {
                for (let i = 0; i < inCount; i++) {
                    const weight = brain.weightsIH[h] ? brain.weightsIH[h][i] : 0;
                    this.cachedConnections.push({
                        inNodeId: `in_${i}`,
                        outNodeId: `h_${h}`,
                        weight,
                        enabled: true
                    });
                }
            }

            // HO Connections
            for (let o = 0; o < outCount; o++) {
                for (let h = 0; h < hidCount; h++) {
                    const weight = brain.weightsHO[o] ? brain.weightsHO[o][h] : 0;
                    this.cachedConnections.push({
                        inNodeId: `h_${h}`,
                        outNodeId: `out_${o}`,
                        weight,
                        enabled: true
                    });
                }
            }
        }
    }

    /**
     * Renders the neural network synapse HUD on the 2D canvas with crisp vector rendering.
     * @param {object|null} agent - Selected organism containing a neural brain
     */
    render(agent) {
        if (!this.ctx) return;

        const { width, height } = this._setupDpi();
        const ctx = this.ctx;
        this.pulsePhase = (this.pulsePhase + 0.04) % 1.0;

        ctx.clearRect(0, 0, width, height);

        // Dark background
        ctx.fillStyle = '#060911';
        ctx.fillRect(0, 0, width, height);

        // Subtle decorative background grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        for (let x = 0; x < width; x += 30) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        }
        for (let y = 0; y < height; y += 30) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        }

        if (!agent || !agent.brain) {
            ctx.fillStyle = '#64748b';
            ctx.font = '600 13px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Clique em um organismo para inspecionar o cérebro', width / 2, height / 2);
            return;
        }

        const brain = agent.brain;
        if (this.cachedAgentId !== agent.id || this.nodePositions.size === 0) {
            this._recomputeLayout(brain, width, height);
            this.cachedAgentId = agent.id;
        }

        // Draw connections
        for (const conn of this.cachedConnections) {
            if (!conn.enabled) continue;
            const p1 = this.nodePositions.get(conn.inNodeId);
            const p2 = this.nodePositions.get(conn.outNodeId);
            if (!p1 || !p2) continue;

            const isPositive = conn.weight >= 0;
            const absW = Math.min(5, Math.max(0.8, Math.abs(conn.weight) * 2.5));

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.lineWidth = absW;
            ctx.strokeStyle = isPositive
                ? `rgba(0, 243, 255, ${Math.min(0.85, 0.2 + Math.abs(conn.weight) * 0.4)})`
                : `rgba(244, 63, 94, ${Math.min(0.85, 0.2 + Math.abs(conn.weight) * 0.4)})`;
            ctx.stroke();

            // Animated traveling pulse
            const pulseT = (this.pulsePhase + (conn.weight * 0.3)) % 1.0;
            const px = p1.x + (p2.x - p1.x) * pulseT;
            const py = p1.y + (p2.y - p1.y) * pulseT;

            ctx.beginPath();
            ctx.arc(px, py, Math.max(1.5, absW * 0.7), 0, Math.PI * 2);
            ctx.fillStyle = isPositive ? '#00f3ff' : '#f43f5e';
            ctx.fill();
        }

        // Draw nodes
        for (const [id, pos] of this.nodePositions.entries()) {
            const isInput = pos.type === 'input';
            const isOutput = pos.type === 'output';
            const nodeRadius = isInput || isOutput ? 6 : 5;

            // Outer glow
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, nodeRadius + 3, 0, Math.PI * 2);
            ctx.fillStyle = isInput ? 'rgba(56, 189, 248, 0.2)' : (isOutput ? 'rgba(236, 72, 153, 0.25)' : 'rgba(168, 85, 247, 0.2)');
            ctx.fill();

            // Node core
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, nodeRadius, 0, Math.PI * 2);
            ctx.fillStyle = isInput ? '#38bdf8' : (isOutput ? '#ec4899' : '#a855f7');
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Crisp Typography Labels
            if (pos.label) {
                ctx.font = '600 9px monospace';
                ctx.fillStyle = '#cbd5e1';
                ctx.textBaseline = 'middle';

                if (isInput) {
                    ctx.textAlign = 'right';
                    ctx.fillText(pos.label, pos.x - 10, pos.y);
                } else if (isOutput) {
                    ctx.textAlign = 'left';
                    ctx.fillText(pos.label, pos.x + 10, pos.y);
                }
            }
        }

        // Top Status Header in canvas
        ctx.font = '700 10px monospace';
        ctx.fillStyle = agent.isElite ? '#fbbf24' : '#00f3ff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`${agent.isElite ? '👑 ELITE' : 'ORGANISMO'} [${agent.id}] — Fitness: ${agent.fitness.toFixed(1)}`, 10, 8);
    }
}
