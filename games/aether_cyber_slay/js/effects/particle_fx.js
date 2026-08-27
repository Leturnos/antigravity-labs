/**
 * Particle & Visual FX Canvas Engine
 * High-performance 2D canvas overlay for cyber particle bursts,
 * laser targeting beams, and floating combat text.
 */
export class ParticleFx {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
        this.particles = [];
        this.floatingTexts = [];
        this.laserBeams = [];
        this.animating = true;
        this.animFrameId = null;

        if (this.canvas) {
            this.resize();
            if (typeof window !== 'undefined') {
                this._resizeHandler = () => this.resize();
                window.addEventListener('resize', this._resizeHandler);
            }
        }

        this.animate = this.animate.bind(this);
        if (typeof requestAnimationFrame === 'function') {
            this.animFrameId = requestAnimationFrame(this.animate);
        }
    }

    resize() {
        if (!this.canvas) return;
        const width = this.canvas.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 800);
        const height = this.canvas.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 600);
        this.canvas.width = width;
        this.canvas.height = height;
    }

    spawnBurst(x, y, color = '#00f0ff', count = 20) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 5 + 2;
            this.particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: Math.random() * 3.5 + 1.5,
                color,
                life: 1.0,
                decay: Math.random() * 0.03 + 0.02
            });
        }
    }

    spawnLaser(x1, y1, x2, y2, color = '#00f0ff', duration = 0.25) {
        this.laserBeams.push({
            x1,
            y1,
            x2,
            y2,
            color,
            life: 1.0,
            decay: 1.0 / (duration * 60)
        });
    }

    spawnFloatingText(x, y, text, color = '#f43f5e', size = 20) {
        this.floatingTexts.push({
            x,
            y,
            text,
            color,
            size,
            vy: -1.5,
            life: 1.0,
            decay: 0.02
        });
    }

    update() {
        // 1. Update Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // 2. Update Laser Beams
        for (let i = this.laserBeams.length - 1; i >= 0; i--) {
            const beam = this.laserBeams[i];
            beam.life -= beam.decay;
            if (beam.life <= 0) {
                this.laserBeams.splice(i, 1);
            }
        }

        // 3. Update Floating Texts
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.y += ft.vy;
            ft.life -= ft.decay;
            if (ft.life <= 0) {
                this.floatingTexts.splice(i, 1);
            }
        }
    }

    draw() {
        if (!this.ctx || !this.canvas) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. Draw Lasers
        for (const beam of this.laserBeams) {
            this.ctx.save();
            this.ctx.globalAlpha = Math.max(0, beam.life);
            this.ctx.strokeStyle = beam.color;
            this.ctx.lineWidth = 4 * beam.life + 1;
            this.ctx.shadowColor = beam.color;
            this.ctx.shadowBlur = 12;
            this.ctx.beginPath();
            this.ctx.moveTo(beam.x1, beam.y1);
            this.ctx.lineTo(beam.x2, beam.y2);
            this.ctx.stroke();
            this.ctx.restore();
        }

        // 2. Draw Particles
        for (const p of this.particles) {
            this.ctx.save();
            this.ctx.globalAlpha = Math.max(0, p.life);
            this.ctx.fillStyle = p.color;
            this.ctx.shadowColor = p.color;
            this.ctx.shadowBlur = 8;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        }

        // 3. Draw Floating Text
        for (const ft of this.floatingTexts) {
            this.ctx.save();
            this.ctx.globalAlpha = Math.max(0, ft.life);
            this.ctx.font = `bold ${ft.size}px 'JetBrains Mono', monospace`;
            this.ctx.fillStyle = ft.color;
            this.ctx.shadowColor = ft.color;
            this.ctx.shadowBlur = 10;
            this.ctx.textAlign = 'center';
            this.ctx.fillText(ft.text, ft.x, ft.y);
            this.ctx.restore();
        }
    }

    animate() {
        if (!this.animating) return;
        this.update();
        this.draw();
        if (typeof requestAnimationFrame === 'function') {
            this.animFrameId = requestAnimationFrame(this.animate);
        }
    }

    stop() {
        this.animating = false;
        if (this.animFrameId && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this.animFrameId);
        }
        if (this._resizeHandler && typeof window !== 'undefined') {
            window.removeEventListener('resize', this._resizeHandler);
        }
    }
}
