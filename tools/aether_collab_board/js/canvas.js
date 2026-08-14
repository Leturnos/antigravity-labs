export class CanvasEngine {
    constructor(containerId, viewportId) {
        this.container = document.getElementById(containerId);
        this.viewport = document.getElementById(viewportId);
        
        this.panX = 0;
        this.panY = 0;
        this.scale = 1.0;
        
        this.minScale = 0.1;
        this.maxScale = 4.0;
        
        this.isPanning = false;
        this.isSpacePressed = false;
        this.startX = 0;
        this.startY = 0;
        this.hasMovedDuringRightClick = false;
        
        this.initEvents();
        this.updateTransform();
    }
    
    initEvents() {
        // Wheel & Trackpad Pinch/Pan Zoom
        this.container.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.ctrlKey) {
                // Pinch zoom on trackpads
                const zoomFactor = e.deltaY < 0 ? 1.05 : 0.95;
                this.zoomAtPoint(e.clientX, e.clientY, zoomFactor);
            } else {
                // Standard scroll wheel zoom or trackpad pan
                if (e.shiftKey) {
                    this.panX -= e.deltaY;
                    this.updateTransform();
                } else {
                    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
                    this.zoomAtPoint(e.clientX, e.clientY, zoomFactor);
                }
            }
        }, { passive: false });
        
        // Track Spacebar modifier key globally
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT' && !e.target.isContentEditable) {
                this.isSpacePressed = true;
                document.body.style.cursor = 'grabbing';
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                this.isSpacePressed = false;
                if (!this.isPanning) {
                    document.body.style.cursor = 'default';
                }
            }
        });

        // Right click context menu suppression if panning occurred
        this.container.addEventListener('contextmenu', (e) => {
            if (this.hasMovedDuringRightClick) {
                e.preventDefault();
                this.hasMovedDuringRightClick = false;
            }
        });

        // Global Mouse Down for camera panning (Spacebar, Middle Click, Right Click, or Shift)
        window.addEventListener('mousedown', (e) => {
            const isMiddleClick = e.button === 1 || e.buttons === 4;
            const isRightClick = e.button === 2;
            const isShiftKey = e.shiftKey;

            if (this.isSpacePressed || isMiddleClick || isRightClick || isShiftKey) {
                this.isPanning = true;
                this.hasMovedDuringRightClick = false;
                this.startX = e.clientX - this.panX;
                this.startY = e.clientY - this.panY;
                document.body.style.cursor = 'grabbing';
            }
        }, true);
        
        window.addEventListener('mousemove', (e) => {
            if (this.isPanning) {
                this.hasMovedDuringRightClick = true;
                this.panX = e.clientX - this.startX;
                this.panY = e.clientY - this.startY;
                this.updateTransform();
            }
        });
        
        window.addEventListener('mouseup', () => {
            if (this.isPanning) {
                this.isPanning = false;
                if (!this.isSpacePressed) {
                    document.body.style.cursor = 'default';
                }
            }
        });

        // HUD Controls
        const btnZoomIn = document.getElementById('btn-zoom-in');
        const btnZoomOut = document.getElementById('btn-zoom-out');
        const btnResetView = document.getElementById('btn-reset-view');

        if (btnZoomIn) {
            btnZoomIn.addEventListener('click', () => {
                const rect = this.container.getBoundingClientRect();
                this.zoomAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.2);
            });
        }

        if (btnZoomOut) {
            btnZoomOut.addEventListener('click', () => {
                const rect = this.container.getBoundingClientRect();
                this.zoomAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, 0.833);
            });
        }

        if (btnResetView) {
            btnResetView.addEventListener('click', () => this.resetView());
        }
    }
    
    zoomAtPoint(clientX, clientY, factor) {
        const rect = this.container.getBoundingClientRect();
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;
        
        const newScale = Math.min(Math.max(this.scale * factor, this.minScale), this.maxScale);
        const actualFactor = newScale / this.scale;
        
        this.panX = mouseX - (mouseX - this.panX) * actualFactor;
        this.panY = mouseY - (mouseY - this.panY) * actualFactor;
        this.scale = newScale;
        
        this.updateTransform();
    }
    
    updateTransform() {
        this.viewport.style.transform = `matrix(${this.scale}, 0, 0, ${this.scale}, ${this.panX}, ${this.panY})`;
        const zoomText = document.getElementById('zoom-indicator');
        if (zoomText) {
            zoomText.textContent = `${Math.round(this.scale * 100)}%`;
        }
    }
    
    screenToCanvas(screenX, screenY) {
        const rect = this.container.getBoundingClientRect();
        const x = (screenX - rect.left - this.panX) / this.scale;
        const y = (screenY - rect.top - this.panY) / this.scale;
        return { x, y };
    }
    
    resetView() {
        this.panX = 0;
        this.panY = 0;
        this.scale = 1.0;
        this.updateTransform();
    }

    focusFrame(x, y, width, height) {
        const containerWidth = this.container.clientWidth;
        const containerHeight = this.container.clientHeight;
        
        const scaleX = (containerWidth * 0.8) / width;
        const scaleY = (containerHeight * 0.8) / height;
        const targetScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.3), 2.0);
        
        this.scale = targetScale;
        this.panX = (containerWidth / 2) - (x + width / 2) * targetScale;
        this.panY = (containerHeight / 2) - (y + height / 2) * targetScale;
        this.updateTransform();
    }
}
