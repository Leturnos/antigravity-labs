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

    const nodeManager = new NodeManager('nodes-layer', wsClient, mermaidModule, canvasEngine);
    const connectorManager = new ConnectorManager('svg-connectors', wsClient);
    const presentationManager = new PresentationManager(canvasEngine, wsClient);

    // Re-render connector paths whenever nodes move
    window.addEventListener('mousemove', () => {
        connectorManager.renderAll(nodeManager);
    });

    // Active Tool State (Default: select 🖱️)
    let activeTool = 'select';
    let pendingPlacementPos = null;
    let connectorStartNodeId = null;
    let clipboardNodeData = null;

    const toolButtons = document.querySelectorAll('.tool-btn');

    function setActiveTool(toolName) {
        activeTool = toolName;
        connectorStartNodeId = null;
        toolButtons.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tool') === toolName);
        });
    }

    // HTML5 Drag & Drop from top toolbar onto Canvas
    toolButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const tool = btn.getAttribute('data-tool');
            setActiveTool(tool);

            if (tool === 'sticky') {
                addStickyNoteAt();
                setActiveTool('select');
            } else if (tool === 'frame') {
                addFrameNodeAt();
                setActiveTool('select');
            } else if (tool === 'mermaid') {
                openMermaidModal();
            }
        });

        btn.addEventListener('dragstart', (e) => {
            const tool = btn.getAttribute('data-tool');
            e.dataTransfer.setData('text/plain', tool);
            setActiveTool(tool);
        });
    });

    const container = document.getElementById('canvas-container');
    
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        const tool = e.dataTransfer.getData('text/plain') || activeTool;
        const pos = canvasEngine.screenToCanvas(e.clientX, e.clientY);

        if (tool === 'sticky') {
            addStickyNoteAt(pos.x, pos.y);
        } else if (tool === 'frame') {
            addFrameNodeAt(pos.x, pos.y);
        } else if (tool === 'mermaid') {
            pendingPlacementPos = pos;
            openMermaidModal();
        }
        setActiveTool('select');
    });

    // Canvas click event for dropping elements or connecting nodes
    container.addEventListener('click', (e) => {
        if (canvasEngine.isSpacePressed || canvasEngine.isPanning || canvasEngine.hasMovedDuringRightClick) return;
        if (e.target.id === 'canvas-container' || e.target.id === 'canvas-viewport' || e.target.tagName === 'svg') {
            const pos = canvasEngine.screenToCanvas(e.clientX, e.clientY);
            
            if (activeTool === 'sticky') {
                addStickyNoteAt(pos.x, pos.y);
                setActiveTool('select');
            } else if (activeTool === 'frame') {
                addFrameNodeAt(pos.x, pos.y);
                setActiveTool('select');
            } else if (activeTool === 'mermaid') {
                pendingPlacementPos = pos;
                openMermaidModal();
            }
        }
    });

    // Node click handler for Connector tool
    nodeManager.layer.addEventListener('click', (e) => {
        const nodeEl = e.target.closest('.canvas-node');
        if (!nodeEl) return;
        const nodeId = nodeEl.id.replace('node-', '');

        if (activeTool === 'connector') {
            e.stopPropagation();
            if (!connectorStartNodeId) {
                connectorStartNodeId = nodeId;
                nodeEl.classList.add('selected');
            } else if (connectorStartNodeId !== nodeId) {
                connectorManager.addConnector({
                    id: `conn-${Date.now()}`,
                    board_id: roomId,
                    from_node_id: connectorStartNodeId,
                    to_node_id: nodeId,
                    label: '',
                    style: 'orthogonal',
                    color: '#94a3b8'
                });
                connectorManager.renderAll(nodeManager);
                connectorStartNodeId = null;
                nodeManager.deselectAll();
                setActiveTool('select');
            }
        }
    });

    // Keyboard Shortcuts (V, S, M, F, C, 0, Copy/Paste)
    window.addEventListener('keydown', (e) => {
        if (e.target.isContentEditable || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
        
        const key = e.key.toLowerCase();
        
        // Copy Node (Ctrl+C / Cmd+C)
        if ((e.ctrlKey || e.metaKey) && key === 'c') {
            if (nodeManager.selectedNodeId) {
                const item = nodeManager.nodes.get(nodeManager.selectedNodeId);
                if (item) {
                    clipboardNodeData = { ...item.data };
                }
            }
            return;
        }

        // Paste Node (Ctrl+V / Cmd+V)
        if ((e.ctrlKey || e.metaKey) && key === 'v') {
            if (clipboardNodeData) {
                const center = canvasEngine.screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
                const newNode = {
                    ...clipboardNodeData,
                    id: `${clipboardNodeData.type}-${Date.now()}`,
                    x: center.x,
                    y: center.y
                };
                nodeManager.createNode(newNode);
                connectorManager.renderAll(nodeManager);
            }
            return;
        }

        if (key === 'v') setActiveTool('select');
        else if (key === 's') {
            setActiveTool('sticky');
            addStickyNoteAt();
            setActiveTool('select');
        } else if (key === 'm') {
            setActiveTool('mermaid');
            openMermaidModal();
        } else if (key === 'f') {
            setActiveTool('frame');
            addFrameNodeAt();
            setActiveTool('select');
        } else if (key === 'c') setActiveTool('connector');
        else if (key === '0') canvasEngine.resetView();
    });

    function addStickyNoteAt(x, y) {
        if (x === undefined || y === undefined) {
            const center = canvasEngine.screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
            x = center.x - 90;
            y = center.y - 90;
        } else {
            x = x - 90;
            y = y - 90;
        }

        nodeManager.createNode({
            id: `sticky-${Date.now()}`,
            board_id: roomId,
            type: 'sticky',
            x,
            y,
            width: 180,
            height: 180,
            content: 'Nova Nota Adesiva',
            color: '#fef08a'
        });
        connectorManager.renderAll(nodeManager);
    }

    function addFrameNodeAt(x, y) {
        if (x === undefined || y === undefined) {
            const center = canvasEngine.screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
            x = center.x - 300;
            y = center.y - 200;
        } else {
            x = x - 300;
            y = y - 200;
        }

        const count = Array.from(nodeManager.nodes.values()).filter(n => n.data.type === 'frame').length + 1;
        nodeManager.createNode({
            id: `frame-${Date.now()}`,
            board_id: roomId,
            type: 'frame',
            x,
            y,
            width: 600,
            height: 400,
            content: `Slide ${count}: Arquitetura`
        });
        connectorManager.renderAll(nodeManager);
    }

    // Mermaid Modal Handling
    const mermaidModal = document.getElementById('mermaid-modal');
    const btnCloseMermaid = document.getElementById('btn-close-mermaid');
    const btnSaveMermaid = document.getElementById('btn-save-mermaid');
    const codeTextarea = document.getElementById('mermaid-code');
    const previewContainer = document.getElementById('mermaid-modal-preview');

    function openMermaidModal() {
        if (!mermaidModal) return;
        if (codeTextarea && !codeTextarea.value.trim()) {
            codeTextarea.value = mermaidModule.getTemplate('microservices');
        }
        if (codeTextarea && previewContainer) {
            mermaidModule.renderDiagram(codeTextarea.value, previewContainer);
        }
        mermaidModal.classList.remove('hidden');
    }

    if (btnCloseMermaid) {
        btnCloseMermaid.addEventListener('click', () => {
            mermaidModal.classList.add('hidden');
            setActiveTool('select');
        });
    }

    if (btnSaveMermaid) {
        btnSaveMermaid.addEventListener('click', () => {
            const code = codeTextarea ? codeTextarea.value : '';
            if (!code.trim()) return;

            let pos = pendingPlacementPos;
            if (!pos) {
                pos = canvasEngine.screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
                pos.x -= 200;
                pos.y -= 150;
            } else {
                pos.x -= 200;
                pos.y -= 150;
            }

            nodeManager.createNode({
                id: `mermaid-${Date.now()}`,
                board_id: roomId,
                type: 'mermaid',
                x: pos.x,
                y: pos.y,
                width: 400,
                height: 300,
                content: code
            });

            connectorManager.renderAll(nodeManager);
            pendingPlacementPos = null;
            mermaidModal.classList.add('hidden');
            setActiveTool('select');
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
