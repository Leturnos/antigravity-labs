export class NodeManager {
    constructor(nodesLayerId, wsClient, mermaidModule, canvasEngine) {
        this.layer = document.getElementById(nodesLayerId);
        this.wsClient = wsClient;
        this.mermaidModule = mermaidModule;
        this.canvasEngine = canvasEngine;
        this.nodes = new Map(); // id -> { el, data }
        this.selectedNodeId = null;

        this.initGlobalEvents();
    }

    initGlobalEvents() {
        // Deselect when clicking empty canvas
        document.getElementById('canvas-container').addEventListener('mousedown', (e) => {
            if (e.target.id === 'canvas-container' || e.target.id === 'canvas-viewport' || e.target.tagName === 'svg') {
                this.deselectAll();
            }
        });

        // Delete selected node on Delete / Backspace key
        window.addEventListener('keydown', (e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedNodeId) {
                if (document.activeElement.isContentEditable || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') {
                    return;
                }
                this.deleteNode(this.selectedNodeId);
            }
        });
    }

    deselectAll() {
        this.nodes.forEach(item => item.el.classList.remove('selected'));
        this.selectedNodeId = null;
    }

    selectNode(id) {
        this.deselectAll();
        const item = this.nodes.get(id);
        if (item) {
            item.el.classList.add('selected');
            this.selectedNodeId = id;
        }
    }

    createNode(data, emitSync = true) {
        if (this.nodes.has(data.id)) return;

        const el = document.createElement('div');
        el.id = `node-${data.id}`;
        el.className = `canvas-node ${data.type}-node`;
        el.style.left = `${data.x}px`;
        el.style.top = `${data.y}px`;
        el.style.width = `${data.width}px`;
        el.style.height = `${data.height}px`;
        el.style.backgroundColor = data.color || (data.type === 'sticky' ? '#fef08a' : 'transparent');
        el.style.zIndex = data.z_index || 1;

        if (data.type === 'sticky') {
            const contentDiv = document.createElement('div');
            contentDiv.className = 'node-content';
            contentDiv.contentEditable = 'true';
            contentDiv.innerText = data.content || 'Nova Nota';

            contentDiv.addEventListener('input', () => {
                data.content = contentDiv.innerText;
                if (this.wsClient) {
                    this.wsClient.send('node_update', data);
                }
            });

            el.appendChild(contentDiv);
        } else if (data.type === 'frame') {
            const titleDiv = document.createElement('div');
            titleDiv.className = 'frame-title';
            titleDiv.contentEditable = 'true';
            titleDiv.innerText = data.content || 'Slide Frame';

            titleDiv.addEventListener('input', () => {
                data.content = titleDiv.innerText;
                if (this.wsClient) {
                    this.wsClient.send('node_update', data);
                }
            });

            el.appendChild(titleDiv);
        } else if (data.type === 'mermaid') {
            const renderBox = document.createElement('div');
            renderBox.className = 'mermaid-render-box';
            el.appendChild(renderBox);

            if (this.mermaidModule && data.content) {
                this.mermaidModule.renderDiagram(data.content, renderBox);
            }
        }

        // Add Resize Handle to all node types
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';
        el.appendChild(resizeHandle);
        this.makeResizable(el, resizeHandle, data);

        this.makeDraggable(el, data);

        el.addEventListener('mousedown', (e) => {
            if (this.canvasEngine && this.canvasEngine.isSpacePressed) return;
            e.stopPropagation();
            this.selectNode(data.id);
        });

        this.layer.appendChild(el);
        this.nodes.set(data.id, { el, data });

        if (emitSync && this.wsClient) {
            this.wsClient.send('node_create', data);
        }
    }

    makeDraggable(el, data) {
        let isDragging = false;
        let startX, startY;

        el.addEventListener('mousedown', (e) => {
            if (e.target.isContentEditable || e.target.classList.contains('resize-handle')) return;
            if (this.canvasEngine && (this.canvasEngine.isSpacePressed || this.canvasEngine.isPanning)) return;
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const zoomText = document.getElementById('zoom-indicator');
            const scale = zoomText ? parseFloat(zoomText.textContent) / 100 : 1.0;

            const dx = (e.clientX - startX) / scale;
            const dy = (e.clientY - startY) / scale;
            startX = e.clientX;
            startY = e.clientY;

            data.x += dx;
            data.y += dy;
            el.style.left = `${data.x}px`;
            el.style.top = `${data.y}px`;

            if (this.wsClient) {
                this.wsClient.send('node_update', data);
            }
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    makeResizable(el, handle, data) {
        let isResizing = false;
        let startX, startY, startW, startH;

        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startW = data.width;
            startH = data.height;
        });

        window.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const zoomText = document.getElementById('zoom-indicator');
            const scale = zoomText ? parseFloat(zoomText.textContent) / 100 : 1.0;

            const dw = (e.clientX - startX) / scale;
            const dh = (e.clientY - startY) / scale;

            const minWidth = data.type === 'frame' ? 200 : 120;
            const minHeight = data.type === 'frame' ? 150 : 120;

            data.width = Math.max(minWidth, startW + dw);
            data.height = Math.max(minHeight, startH + dh);

            el.style.width = `${data.width}px`;
            el.style.height = `${data.height}px`;

            if (this.wsClient) {
                this.wsClient.send('node_update', data);
            }
        });

        window.addEventListener('mouseup', () => {
            isResizing = false;
        });
    }

    updateRemote(data) {
        const item = this.nodes.get(data.id);
        if (item) {
            item.data = data;
            item.el.style.left = `${data.x}px`;
            item.el.style.top = `${data.y}px`;
            item.el.style.width = `${data.width}px`;
            item.el.style.height = `${data.height}px`;

            if (data.type === 'sticky') {
                const contentDiv = item.el.querySelector('.node-content');
                if (contentDiv && contentDiv !== document.activeElement) {
                    contentDiv.innerText = data.content;
                }
            } else if (data.type === 'frame') {
                const titleDiv = item.el.querySelector('.frame-title');
                if (titleDiv && titleDiv !== document.activeElement) {
                    titleDiv.innerText = data.content;
                }
            } else if (data.type === 'mermaid') {
                const renderBox = item.el.querySelector('.mermaid-render-box');
                if (renderBox && this.mermaidModule) {
                    this.mermaidModule.renderDiagram(data.content, renderBox);
                }
            }
        } else {
            this.createNode(data, false);
        }
    }

    deleteNode(id, emitSync = true) {
        const item = this.nodes.get(id);
        if (item) {
            this.layer.removeChild(item.el);
            this.nodes.delete(id);
            if (this.selectedNodeId === id) {
                this.selectedNodeId = null;
            }

            if (emitSync && this.wsClient) {
                this.wsClient.send('node_delete', { id });
            }
        }
    }
}
