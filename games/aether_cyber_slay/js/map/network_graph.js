export const NODE_TYPES = {
    COMBAT: 'COMBAT',
    ELITE: 'ELITE',
    SHOP: 'SHOP',
    REST: 'REST',
    EVENT: 'EVENT',
    BOSS: 'BOSS'
};

export class NetworkGraph {
    constructor() {
        this.currentSector = 1;
        this.mapData = null;
        this.currentNodeId = null;
        this.history = [];
    }

    generateSector(sectorNumber = 1) {
        this.currentSector = sectorNumber;
        this.currentNodeId = null;
        this.history = [];
        const layers = [];
        const layerCount = 8;

        for (let layerIdx = 0; layerIdx < layerCount; layerIdx++) {
            const layer = [];
            if (layerIdx === 0) {
                // 3 starting entry nodes
                for (let i = 0; i < 3; i++) {
                    layer.push(this.createNode(layerIdx, i, NODE_TYPES.COMBAT, 'Gateway de Sub-rotina', 'Invasão inicial da sub-rede'));
                }
            } else if (layerIdx === 3) {
                // Elite firewall layer
                const eliteCount = Math.random() > 0.5 ? 2 : 3;
                for (let i = 0; i < eliteCount; i++) {
                    layer.push(this.createNode(layerIdx, i, NODE_TYPES.ELITE, 'Firewall Pesado ICE', 'Alerta de intrusão máxima'));
                }
            } else if (layerIdx === 6) {
                // Pre-boss rest station
                for (let i = 0; i < 2; i++) {
                    layer.push(this.createNode(layerIdx, i, NODE_TYPES.REST, 'Estação de Patch de Sistema', 'Ponto de manutenção pré-IA'));
                }
            } else if (layerIdx === 7) {
                // Final Boss
                layer.push(this.createNode(layerIdx, 0, NODE_TYPES.BOSS, 'Núcleo IA Central Apex', 'Ameaça final do setor'));
            } else {
                // Intermediate mixed layers with organic distribution
                const nodeCount = Math.floor(Math.random() * 2) + 2; // 2 or 3
                const pool = [
                    { type: NODE_TYPES.COMBAT, name: 'Sub-rotina de Dados', sub: 'Patrulha de segurança' },
                    { type: NODE_TYPES.COMBAT, name: 'Porta de Acesso', sub: 'Criptografia leve' },
                    { type: NODE_TYPES.SHOP, name: 'Mercado Negro', sub: 'Terminal de compra/purga' },
                    { type: NODE_TYPES.EVENT, name: 'Terminal Desconhecido', sub: 'Fragmento de memória' },
                    { type: NODE_TYPES.REST, name: 'Estação de Patch', sub: 'Recuperação térmica' }
                ];
                for (let i = 0; i < nodeCount; i++) {
                    const picked = pool[Math.floor(Math.random() * pool.length)];
                    layer.push(this.createNode(layerIdx, i, picked.type, picked.name, picked.sub));
                }
            }
            layers.push(layer);
        }

        // Apply organic offsets and varied vertical/horizontal jitter
        layers.forEach((layer, lIdx) => {
            const count = layer.length;
            layer.forEach((node, idx) => {
                // Spread evenly across layer with natural organic jitter
                const baseRatio = (idx + 1) / (count + 1);
                const jitter = (Math.random() - 0.5) * 0.12;
                node.xRatio = Math.max(0.15, Math.min(0.85, baseRatio + jitter));
                node.yOffset = (Math.random() - 0.5) * 16; // Pixels vertical jitter
            });
        });

        // Generate forward edges with guaranteed connectivity
        for (let l = 0; l < layerCount - 1; l++) {
            const currentLayer = layers[l];
            const nextLayer = layers[l + 1];

            currentLayer.forEach((node, idx) => {
                // Connect to nearest node based on xRatio
                const sortedNext = [...nextLayer].sort((a, b) => Math.abs(a.xRatio - node.xRatio) - Math.abs(b.xRatio - node.xRatio));
                
                const primaryTargetId = sortedNext[0].id;
                if (!node.connections.includes(primaryTargetId)) {
                    node.connections.push(primaryTargetId);
                }
                
                // Add secondary organic branch
                if (sortedNext[1] && Math.random() > 0.35) {
                    const secTargetId = sortedNext[1].id;
                    if (!node.connections.includes(secTargetId)) {
                        node.connections.push(secTargetId);
                    }
                }
            });

            // Ensure every node in nextLayer has at least 1 incoming edge
            nextLayer.forEach(nextN => {
                const hasIncoming = currentLayer.some(cN => cN.connections.includes(nextN.id));
                if (!hasIncoming) {
                    const nearestSource = [...currentLayer].sort((a, b) => Math.abs(a.xRatio - nextN.xRatio) - Math.abs(b.xRatio - nextN.xRatio))[0];
                    if (!nearestSource.connections.includes(nextN.id)) {
                        nearestSource.connections.push(nextN.id);
                    }
                }
            });
        }

        this.mapData = { sector: sectorNumber, layers };
        return this.mapData;
    }

    createNode(layer, index, type, name, subName = '') {
        return {
            id: `node_${layer}_${index}`,
            layer,
            index,
            type,
            name,
            subName,
            connections: [],
            cleared: false,
            xRatio: 0.5,
            yOffset: 0
        };
    }

    getNode(nodeId) {
        if (!this.mapData || !this.mapData.layers) return null;
        for (const layer of this.mapData.layers) {
            for (const node of layer) {
                if (node.id === nodeId) return node;
            }
        }
        return null;
    }

    getCurrentNode() {
        if (!this.currentNodeId) return null;
        return this.getNode(this.currentNodeId);
    }

    getReachableNodes() {
        if (!this.mapData || !this.mapData.layers || this.mapData.layers.length === 0) return [];
        if (!this.currentNodeId) {
            // If at start, layer 0 entry nodes are reachable
            return [...this.mapData.layers[0]];
        }
        const current = this.getNode(this.currentNodeId);
        if (!current || !current.connections) return [];
        return current.connections.map(id => this.getNode(id)).filter(Boolean);
    }

    moveToNode(nodeId) {
        const reachable = this.getReachableNodes();
        const target = reachable.find(n => n.id === nodeId);
        if (!target) {
            return { success: false, reason: 'Node not reachable' };
        }
        this.currentNodeId = target.id;
        this.history.push(target.id);
        return { success: true, node: target };
    }

    completeCurrentNode() {
        const node = this.getCurrentNode();
        if (node) {
            node.cleared = true;
        }
    }

    verifyAllPathsToBoss(mapData = this.mapData) {
        if (!mapData || !mapData.layers || mapData.layers.length === 0) return false;
        const bossId = mapData.layers[mapData.layers.length - 1][0].id;
        const nodeMap = new Map();
        mapData.layers.flat().forEach(n => nodeMap.set(n.id, n));

        function canReach(currentId, visited = new Set()) {
            if (currentId === bossId) return true;
            if (visited.has(currentId)) return false;
            visited.add(currentId);

            const node = nodeMap.get(currentId);
            if (!node || !node.connections || node.connections.length === 0) return false;
            return node.connections.some(cId => canReach(cId, new Set(visited)));
        }

        return mapData.layers[0].every(startNode => canReach(startNode.id));
    }
}
