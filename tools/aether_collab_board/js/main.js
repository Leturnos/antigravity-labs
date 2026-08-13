import { CanvasEngine } from './canvas.js';
import { NodeManager } from './nodes.js';
import { MermaidModule } from './mermaid_module.js';
import { ConnectorManager } from './connectors.js';
import { PresentationManager } from './presentation.js';
import { WSClient } from './ws_client.js';

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room') || 'default';

    const canvasEngine = new CanvasEngine('canvas-container', 'canvas-viewport');
    const mermaidModule = new MermaidModule();

    const wsClient = new WSClient(roomId, (msg) => {
        if (msg.type === 'node_create' || msg.type === 'node_update') {
            nodeManager.updateRemote(msg.data);
            connectorManager.renderAll(nodeManager);
        } else if (msg.type === 'node_delete') {
            nodeManager.deleteNode(msg.data.id, false);
            connectorManager.renderAll(nodeManager);
        } else if (msg.type === 'connector_create' || msg.type === 'connector_update') {
            connectorManager.addConnector(msg.data, false);
            connectorManager.renderAll(nodeManager);
        } else if (msg.type === 'connector_delete') {
            connectorManager.deleteConnector(msg.data.id, false);
        } else if (msg.type === 'laser_pointer') {
            presentationManager.addLaserPoint(msg.data.x, msg.data.y);
        }
    });

    const nodeManager = new NodeManager('nodes-layer', wsClient, mermaidModule);
    const connectorManager = new ConnectorManager('svg-connectors', wsClient);
    const presentationManager = new PresentationManager(canvasEngine, wsClient);

    // Active tool state
    let activeTool = 'select';
    const toolButtons = document.querySelectorAll('.tool-btn');

    function setActiveTool(toolName) {
        activeTool = toolName;
        toolButtons.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tool') === toolName);
        });
    }

    toolButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            setActiveTool(btn.getAttribute('data-tool'));
        });
    });

    // Keyboard Shortcuts (V, S, M, F, C)
    window.addEventListener('keydown', (e) => {
        if (e.target.isContentEditable || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
        const key = e.key.toLowerCase();
        if (key === 'v') setActiveTool('select');
        else if (key === 's') {
            setActiveTool('sticky');
            addStickyNote();
        } else if (key === 'm') {
            setActiveTool('mermaid');
            openMermaidModal();
        } else if (key === 'f') {
            setActiveTool('frame');
            addFrameNode();
        } else if (key === 'c') setActiveTool('connector');
    });

    function addStickyNote() {
        const center = canvasEngine.screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
        nodeManager.createNode({
            id: `sticky-${Date.now()}`,
            board_id: roomId,
            type: 'sticky',
            x: center.x - 90,
            y: center.y - 90,
            width: 180,
            height: 180,
            content: 'Nova Nota Adesiva',
            color: '#fef08a'
        });
    }

    function addFrameNode() {
        const center = canvasEngine.screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
        const count = Array.from(nodeManager.nodes.values()).filter(n => n.data.type === 'frame').length + 1;
        nodeManager.createNode({
            id: `frame-${Date.now()}`,
            board_id: roomId,
            type: 'frame',
            x: center.x - 300,
            y: center.y - 200,
            width: 600,
            height: 400,
            content: `Slide ${count}: Arquitetura`
        });
    }

    // Mermaid Modal Handling
    const mermaidModal = document.getElementById('mermaid-modal');
    const btnCloseMermaid = document.getElementById('btn-close-mermaid');
    const btnSaveMermaid = document.getElementById('btn-save-mermaid');

    function openMermaidModal() {
        if (mermaidModal) mermaidModal.classList.remove('hidden');
    }

    if (btnCloseMermaid) {
        btnCloseMermaid.addEventListener('click', () => mermaidModal.classList.add('hidden'));
    }

    if (btnSaveMermaid) {
        btnSaveMermaid.addEventListener('click', () => {
            const code = document.getElementById('mermaid-code').value;
            if (!code.trim()) return;

            const center = canvasEngine.screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
            nodeManager.createNode({
                id: `mermaid-${Date.now()}`,
                board_id: roomId,
                type: 'mermaid',
                x: center.x - 200,
                y: center.y - 150,
                width: 400,
                height: 300,
                content: code
            });

            mermaidModal.classList.add('hidden');
        });
    }

    // Presentation Controls
    document.getElementById('btn-present').addEventListener('click', () => presentationManager.startPresentation(nodeManager));
    document.getElementById('btn-next-slide').addEventListener('click', () => presentationManager.nextSlide());
    document.getElementById('btn-prev-slide').addEventListener('click', () => presentationManager.prevSlide());
    document.getElementById('btn-exit-present').addEventListener('click', () => presentationManager.exitPresentation());

    // Export Canvas JSON Backup
    document.getElementById('btn-export').addEventListener('click', () => {
        const boardData = {
            roomId,
            nodes: Array.from(nodeManager.nodes.values()).map(n => n.data),
            connectors: Array.from(connectorManager.connectors.values())
        };
        const blob = new Blob([JSON.stringify(boardData, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `aether_collab_board_${roomId}.json`;
        a.click();
    });

    // Fetch initial board state from REST API
    try {
        const res = await fetch(`/api/collab-board/boards/${roomId}`);
        if (res.ok) {
            const data = await res.json();
            if (data.nodes) {
                data.nodes.forEach(n => nodeManager.createNode(n, false));
            }
            if (data.connectors) {
                data.connectors.forEach(c => connectorManager.addConnector(c, false));
            }
            connectorManager.renderAll(nodeManager);
        }
    } catch (e) {
        console.warn("Collab board offline fallback mode active.");
    }
});
