export class ConnectorManager {
    constructor(svgId, wsClient) {
        this.svg = document.getElementById(svgId);
        this.wsClient = wsClient;
        this.connectors = new Map(); // id -> connectorData
        this.isConnecting = false;
        this.connectStartNodeId = null;

        this.initSvgDefs();
    }

    initSvgDefs() {
        if (!this.svg) return;
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = `
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
            </marker>
        `;
        this.svg.appendChild(defs);
    }

    addConnector(data, emitSync = true) {
        this.connectors.set(data.id, data);
        if (emitSync && this.wsClient) {
            this.wsClient.send('connector_create', data);
        }
    }

    updateConnector(id, label, style, color) {
        const conn = this.connectors.get(id);
        if (conn) {
            if (label !== undefined) conn.label = label;
            if (style !== undefined) conn.style = style;
            if (color !== undefined) conn.color = color;
            if (this.wsClient) {
                this.wsClient.send('connector_update', conn);
            }
        }
    }

    deleteConnector(id, emitSync = true) {
        this.connectors.delete(id);
        const pathEl = this.svg.querySelector(`#conn-${id}`);
        if (pathEl) this.svg.removeChild(pathEl);
        if (emitSync && this.wsClient) {
            this.wsClient.send('connector_delete', { id });
        }
    }

    renderAll(nodeManager) {
        if (!this.svg) return;

        this.connectors.forEach((conn) => {
            const fromNodeItem = nodeManager.nodes.get(conn.from_node_id);
            const toNodeItem = nodeManager.nodes.get(conn.to_node_id);

            if (!fromNodeItem || !toNodeItem) return;

            const fromNode = fromNodeItem.data;
            const toNode = toNodeItem.data;

            const fromCenter = { x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height / 2 };
            const toCenter = { x: toNode.x + toNode.width / 2, y: toNode.y + toNode.height / 2 };

            let pathEl = this.svg.querySelector(`#conn-${conn.id}`);
            if (!pathEl) {
                pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                pathEl.setAttribute('id', `conn-${conn.id}`);
                pathEl.setAttribute('stroke', conn.color || '#94a3b8');
                pathEl.setAttribute('stroke-width', '2.5');
                pathEl.setAttribute('fill', 'none');
                pathEl.setAttribute('marker-end', 'url(#arrowhead)');
                this.svg.appendChild(pathEl);
            }

            let d = '';
            if (conn.style === 'orthogonal') {
                const midX = (fromCenter.x + toCenter.x) / 2;
                d = `M ${fromCenter.x} ${fromCenter.y} L ${midX} ${fromCenter.y} L ${midX} ${toCenter.y} L ${toCenter.x} ${toCenter.y}`;
            } else if (conn.style === 'curved') {
                const deltaX = Math.abs(toCenter.x - fromCenter.x) / 2;
                d = `M ${fromCenter.x} ${fromCenter.y} C ${fromCenter.x + deltaX} ${fromCenter.y}, ${toCenter.x - deltaX} ${toCenter.y}, ${toCenter.x} ${toCenter.y}`;
            } else {
                d = `M ${fromCenter.x} ${fromCenter.y} L ${toCenter.x} ${toCenter.y}`;
            }

            pathEl.setAttribute('d', d);
        });
    }
}
