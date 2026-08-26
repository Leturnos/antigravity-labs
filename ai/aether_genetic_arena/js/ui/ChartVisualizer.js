/**
 * Real-time chart visualizer rendering neuroevolution fitness progression curves.
 * Displays max fitness (neon cyan glow with gradient area fill) and population average fitness
 * across historical generations with High-DPI crisp antialiased vector rendering.
 */
export class ChartVisualizer {
    /**
     * @param {HTMLCanvasElement} canvas - Target canvas element for chart rendering
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas ? canvas.getContext('2d') : null;
        this.padding = { top: 28, right: 25, bottom: 25, left: 45 };
    }

    /**
     * Recomputes high-DPI canvas dimensions.
     * @private
     */
    _setupDpi() {
        if (!this.canvas || typeof window === 'undefined') return { width: 320, height: 160 };
        const rect = typeof this.canvas.getBoundingClientRect === 'function' ? this.canvas.getBoundingClientRect() : { width: 320, height: 160 };
        const dpr = window.devicePixelRatio || 2;
        const displayWidth = Math.max(300, Math.floor(rect.width || 320));
        const displayHeight = Math.max(140, Math.floor(rect.height || 160));

        if (this.canvas.width !== displayWidth * dpr || this.canvas.height !== displayHeight * dpr) {
            this.canvas.width = displayWidth * dpr;
            this.canvas.height = displayHeight * dpr;
        }
        return { width: displayWidth * dpr, height: displayHeight * dpr, dpr };
    }

    /**
     * Renders the fitness evolution history chart with high resolution.
     * @param {Array<{ generation?: number, max?: number, avg?: number }|number>} history
     */
    render(history) {
        if (!this.ctx) return;

        const { width, height } = this._setupDpi();
        const ctx = this.ctx;

        ctx.clearRect(0, 0, width, height);

        // Dark Chart Background
        ctx.fillStyle = '#060911';
        ctx.fillRect(0, 0, width, height);

        if (!history || history.length === 0) {
            ctx.fillStyle = '#64748b';
            ctx.font = '600 12px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Aguardando conclusão da 1ª geração...', width / 2, height / 2);
            return;
        }

        const padLeft = this.padding.left * 1.5;
        const padRight = this.padding.right * 1.5;
        const padTop = this.padding.top * 1.5;
        const padBottom = this.padding.bottom * 1.5;

        const chartW = width - padLeft - padRight;
        const chartH = height - padTop - padBottom;

        // Extract normalized data points
        const points = history.map((h, i) => {
            if (typeof h === 'number') {
                return { gen: i + 1, max: h, avg: h };
            }
            return {
                gen: h.gen !== undefined ? h.gen : (h.generation !== undefined ? h.generation : i + 1),
                max: h.max !== undefined ? h.max : 0,
                avg: h.avg !== undefined ? h.avg : 0
            };
        });

        const maxVal = Math.max(50, ...points.map(p => Math.max(p.max, p.avg)));
        const pointCount = points.length;

        // 1. Draw Grid Lines and Y-Axis Scale
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 10px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        const ySteps = 3;
        for (let s = 0; s <= ySteps; s++) {
            const ratio = s / ySteps;
            const y = padTop + chartH * (1 - ratio);
            const val = Math.round(ratio * maxVal);

            ctx.beginPath();
            ctx.moveTo(padLeft, y);
            ctx.lineTo(width - padRight, y);
            ctx.stroke();

            ctx.fillText(`${val}`, padLeft - 8, y);
        }

        // 2. Draw Axes
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(padLeft, padTop);
        ctx.lineTo(padLeft, height - padBottom);
        ctx.lineTo(width - padRight, height - padBottom);
        ctx.stroke();

        // 3. Draw Gradient Fill Under Max Fitness Curve
        if (pointCount > 1 && typeof ctx.createLinearGradient === 'function') {
            const grad = ctx.createLinearGradient(0, padTop, 0, height - padBottom);
            grad.addColorStop(0, 'rgba(0, 243, 255, 0.35)');
            grad.addColorStop(1, 'rgba(0, 243, 255, 0.0)');

            ctx.beginPath();
            points.forEach((pt, i) => {
                const x = padLeft + (i / (pointCount - 1)) * chartW;
                const y = (height - padBottom) - (pt.max / maxVal) * chartH;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.lineTo(padLeft + chartW, height - padBottom);
            ctx.lineTo(padLeft, height - padBottom);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
        }

        // 4. Draw Average Fitness Curve (Dashed Purple)
        ctx.beginPath();
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 1.5;
        if (typeof ctx.setLineDash === 'function') {
            ctx.setLineDash([4, 4]);
        }
        points.forEach((pt, i) => {
            const x = pointCount === 1 ? padLeft + chartW / 2 : padLeft + (i / (pointCount - 1)) * chartW;
            const y = (height - padBottom) - (pt.avg / maxVal) * chartH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        if (typeof ctx.setLineDash === 'function') {
            ctx.setLineDash([]);
        }

        // 5. Draw Max Fitness Curve (Solid Cyan Glow)
        ctx.beginPath();
        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#00f3ff';
        ctx.shadowBlur = 8;
        points.forEach((pt, i) => {
            const x = pointCount === 1 ? padLeft + chartW / 2 : padLeft + (i / (pointCount - 1)) * chartW;
            const y = (height - padBottom) - (pt.max / maxVal) * chartH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 6. Draw Points on Peaks
        points.forEach((pt, i) => {
            const x = pointCount === 1 ? padLeft + chartW / 2 : padLeft + (i / (pointCount - 1)) * chartW;
            const y = (height - padBottom) - (pt.max / maxVal) * chartH;
            ctx.beginPath();
            ctx.arc(x, y, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = '#00f3ff';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });

        // 7. Legend and Header
        const lastPt = points[points.length - 1];
        ctx.font = '700 10px monospace';
        ctx.fillStyle = '#00f3ff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`● Max: ${lastPt.max.toFixed(1)}`, padLeft, 8);

        ctx.fillStyle = '#c084fc';
        ctx.fillText(`● Média: ${lastPt.avg.toFixed(1)}`, padLeft + 100, 8);

        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'right';
        ctx.fillText(`Geração #${lastPt.gen}`, width - padRight, 8);
    }
}
