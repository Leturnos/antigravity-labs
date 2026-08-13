export class PresentationManager {
    constructor(canvasEngine, wsClient) {
        this.canvasEngine = canvasEngine;
        this.wsClient = wsClient;
        this.isPresenting = false;
        this.currentSlideIndex = 0;
        this.frames = [];
        this.laserActive = false;
        this.laserCanvas = document.getElementById('laser-canvas');
        this.laserCtx = this.laserCanvas ? this.laserCanvas.getContext('2d') : null;

        this.laserTrail = [];

        this.initEvents();
        this.startLaserAnimationLoop();
    }

    initEvents() {
        const btnLaser = document.getElementById('btn-laser-toggle');
        if (btnLaser) {
            btnLaser.addEventListener('click', () => {
                this.laserActive = !this.laserActive;
                btnLaser.classList.toggle('active', this.laserActive);
            });
        }

        const container = document.getElementById('canvas-container');
        if (container) {
            container.addEventListener('mousemove', (e) => {
                if (!this.laserActive) return;
                const pos = this.canvasEngine.screenToCanvas(e.clientX, e.clientY);
                this.addLaserPoint(pos.x, pos.y);

                if (this.wsClient) {
                    this.wsClient.send('laser_pointer', { x: pos.x, y: pos.y });
                }
            });
        }
    }

    addLaserPoint(x, y) {
        this.laserTrail.push({ x, y, alpha: 1.0, radius: 8 });
        if (this.laserTrail.length > 25) {
            this.laserTrail.shift();
        }
    }

    startLaserAnimationLoop() {
        const render = () => {
            if (this.laserCtx && this.laserCanvas) {
                if (this.laserCanvas.width !== this.laserCanvas.clientWidth) {
                    this.laserCanvas.width = this.laserCanvas.clientWidth || 20000;
                    this.laserCanvas.height = this.laserCanvas.clientHeight || 20000;
                }

                this.laserCtx.clearRect(0, 0, this.laserCanvas.width, this.laserCanvas.height);

                for (let i = 0; i < this.laserTrail.length; i++) {
                    const pt = this.laserTrail[i];
                    pt.alpha -= 0.03;
                    pt.radius *= 0.96;

                    if (pt.alpha > 0) {
                        this.laserCtx.beginPath();
                        this.laserCtx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
                        this.laserCtx.fillStyle = `rgba(239, 68, 68, ${pt.alpha})`;
                        this.laserCtx.shadowColor = '#ef4444';
                        this.laserCtx.shadowBlur = 12;
                        this.laserCtx.fill();
                    }
                }

                this.laserTrail = this.laserTrail.filter(pt => pt.alpha > 0);
            }
            requestAnimationFrame(render);
        };
        requestAnimationFrame(render);
    }

    startPresentation(nodeManager) {
        this.frames = Array.from(nodeManager.nodes.values())
            .filter(n => n.data.type === 'frame')
            .map(n => n.data);

        if (this.frames.length === 0) {
            alert('Crie ao menos um Frame (F) no canvas para iniciar a apresentação!');
            return;
        }

        this.isPresenting = true;
        this.currentSlideIndex = 0;
        document.getElementById('presentation-hud').classList.remove('hidden');
        document.querySelector('.top-bar').classList.add('hidden');
        this.showCurrentSlide();
    }

    showCurrentSlide() {
        if (!this.isPresenting || this.frames.length === 0) return;
        const frame = this.frames[this.currentSlideIndex];
        this.canvasEngine.focusFrame(frame.x, frame.y, frame.width, frame.height);
        const indicator = document.getElementById('slide-indicator');
        if (indicator) {
            indicator.textContent = `Slide ${this.currentSlideIndex + 1} de ${this.frames.length}`;
        }
    }

    nextSlide() {
        if (this.currentSlideIndex < this.frames.length - 1) {
            this.currentSlideIndex++;
            this.showCurrentSlide();
        }
    }

    prevSlide() {
        if (this.currentSlideIndex > 0) {
            this.currentSlideIndex--;
            this.showCurrentSlide();
        }
    }

    exitPresentation() {
        this.isPresenting = false;
        this.laserActive = false;
        const btnLaser = document.getElementById('btn-laser-toggle');
        if (btnLaser) btnLaser.classList.remove('active');

        document.getElementById('presentation-hud').classList.add('hidden');
        document.querySelector('.top-bar').classList.remove('hidden');
    }
}
