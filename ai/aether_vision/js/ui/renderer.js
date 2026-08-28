/**
 * Aether Vision Sandbox - UI Canvas 2D Overlay Engine & Particle System
 * High-performance 60+ FPS overlay renderer for hand skeletons, neon bone connections,
 * particle dynamics, gesture halos, musical grid visualizers, and arcade targets.
 */

export const THEME_COLORS = {
    leftHand: '#00f3ff',        // Cyan
    leftHandGlow: 'rgba(0, 243, 255, 0.45)',
    rightHand: '#ec4899',       // Magenta / Pink
    rightHandGlow: 'rgba(236, 72, 153, 0.45)',
    accentPurple: '#8b5cf6',    // Violet
    accentPurpleGlow: 'rgba(139, 92, 246, 0.45)',
    accentGold: '#fbbf24',      // Amber
    accentGreen: '#10b981',     // Emerald
    accentRed: '#ef4444',       // Rose
    boneDefault: 'rgba(255, 255, 255, 0.65)',
    jointDefault: '#ffffff',
    pinchTether: '#fbbf24',
    grid: 'rgba(0, 243, 255, 0.06)',
    bgDark: '#060911',
    textMain: '#f8fafc',
    textMuted: '#94a3b8'
};

/**
 * Standard MediaPipe Hands 21-landmark topology graph connections.
 */
export const HAND_CONNECTIONS = [
    // Thumb: Wrist (0) -> CMC (1) -> MCP (2) -> IP (3) -> TIP (4)
    [0, 1], [1, 2], [2, 3], [3, 4],
    // Index: Wrist (0) -> MCP (5) -> PIP (6) -> DIP (7) -> TIP (8)
    [0, 5], [5, 6], [6, 7], [7, 8],
    // Middle: Index MCP (5) -> Middle MCP (9) -> PIP (10) -> DIP (11) -> TIP (12)
    [5, 9], [9, 10], [10, 11], [11, 12],
    // Ring: Middle MCP (9) -> Ring MCP (13) -> PIP (14) -> DIP (15) -> TIP (16)
    [9, 13], [13, 14], [14, 15], [15, 16],
    // Pinky: Ring MCP (13) -> Pinky MCP (17) -> PIP (18) -> DIP (19) -> TIP (20)
    [13, 17], [17, 18], [18, 19], [19, 20],
    // Palm Base Closure: Wrist (0) -> Pinky MCP (17)
    [0, 17]
];

export const FINGERTIP_INDICES = [4, 8, 12, 16, 20];

/**
 * High-performance 2D Canvas Overlay Renderer.
 */
export class CanvasRenderer {
    /**
     * @param {HTMLCanvasElement} canvas - Canvas element for overlay rendering
     * @param {Object} [options] - Renderer configuration options
     */
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
        this.options = {
            maxParticles: 300,
            glowEnabled: true,
            pixelRatio: 1,
            fadeTrails: false,
            ...options
        };

        this.width = canvas ? (canvas.width || 1280) : 1280;
        this.height = canvas ? (canvas.height || 720) : 720;
        this.particles = [];
        this.particlePool = [];
        this.trails = new Map();
        this.phase = 0;
    }

    /**
     * Resizes canvas internal buffer dimensions.
     * @param {number} width 
     * @param {number} height 
     * @param {number} [pixelRatio=1] 
     * @returns {{ width: number, height: number }}
     */
    resize(width, height, pixelRatio = 1) {
        this.width = width;
        this.height = height;
        this.options.pixelRatio = pixelRatio;

        if (this.canvas) {
            this.canvas.width = Math.round(width * pixelRatio);
            this.canvas.height = Math.round(height * pixelRatio);
        }

        return { width: this.width, height: this.height };
    }

    /**
     * Clears the canvas buffer.
     * @param {string|null} [color=null] - Optional background fill color
     */
    clear(color = null) {
        if (!this.ctx) return;
        if (color) {
            this.ctx.fillStyle = color;
            if (typeof this.ctx.fillRect === 'function') {
                this.ctx.fillRect(0, 0, this.width, this.height);
            }
        } else if (typeof this.ctx.clearRect === 'function') {
            this.ctx.clearRect(0, 0, this.width, this.height);
        }
    }

    /**
     * Draws video feed frame onto the canvas.
     * @param {HTMLVideoElement|CanvasImageSource} videoEl 
     * @param {Object} [options] 
     */
    drawVideo(videoEl, options = {}) {
        if (!this.ctx || !videoEl) return;
        const {
            mirrored = false,
            opacity = 1.0,
            filter = 'none'
        } = options;

        if (typeof this.ctx.save === 'function') this.ctx.save();

        if (opacity < 1.0) {
            this.ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
        }
        if (filter && filter !== 'none') {
            this.ctx.filter = filter;
        }

        if (mirrored) {
            if (typeof this.ctx.translate === 'function') this.ctx.translate(this.width, 0);
            if (typeof this.ctx.scale === 'function') this.ctx.scale(-1, 1);
        }

        if (typeof this.ctx.drawImage === 'function') {
            this.ctx.drawImage(videoEl, 0, 0, this.width, this.height);
        }

        if (typeof this.ctx.restore === 'function') this.ctx.restore();
    }

    /**
     * Draws complete 21-landmark hand skeleton with neon glow, bone connections,
     * joint circles, fingertip pulses, and pinch arcs.
     * @param {Object} hand - Processed hand object from HandTracker
     * @param {Object} [options] - Custom rendering options
     */
    drawHandSkeleton(hand, options = {}) {
        if (!this.ctx || !hand || !Array.isArray(hand.landmarks) || hand.landmarks.length < 21) {
            return;
        }

        const {
            handedness = 'Left',
            landmarks,
            gesture,
            pinch,
            palmCenter
        } = hand;

        const isLeft = handedness === 'Left';
        const primaryColor = options.color || (isLeft ? THEME_COLORS.leftHand : THEME_COLORS.rightHand);
        const glowColor = isLeft ? THEME_COLORS.leftHandGlow : THEME_COLORS.rightHandGlow;
        const showBadge = options.showGestureBadge !== false;
        const showPinchAura = options.showPinchAura !== false;

        // Convert normalized landmarks to canvas pixel coordinates
        const pixelPoints = landmarks.map(lm => ({
            x: lm.x * this.width,
            y: lm.y * this.height,
            z: lm.z || 0
        }));

        this.phase = (this.phase + 0.05) % (Math.PI * 2);

        // 1. Draw Bone Connections
        if (typeof this.ctx.save === 'function') this.ctx.save();
        this.ctx.strokeStyle = primaryColor;
        this.ctx.lineWidth = options.lineWidth || 2.5;
        this.ctx.shadowColor = primaryColor;
        this.ctx.shadowBlur = this.options.glowEnabled ? 10 : 0;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        for (const [idx1, idx2] of HAND_CONNECTIONS) {
            const p1 = pixelPoints[idx1];
            const p2 = pixelPoints[idx2];
            if (p1 && p2) {
                if (typeof this.ctx.beginPath === 'function') this.ctx.beginPath();
                if (typeof this.ctx.moveTo === 'function') this.ctx.moveTo(p1.x, p1.y);
                if (typeof this.ctx.lineTo === 'function') this.ctx.lineTo(p2.x, p2.y);
                if (typeof this.ctx.stroke === 'function') this.ctx.stroke();
            }
        }
        if (typeof this.ctx.restore === 'function') this.ctx.restore();

        // 2. Draw Landmark Joint Nodes
        if (typeof this.ctx.save === 'function') this.ctx.save();
        for (let i = 0; i < pixelPoints.length; i++) {
            const pt = pixelPoints[i];
            const isFingertip = FINGERTIP_INDICES.includes(i);
            const isWrist = i === 0;

            const radius = isFingertip ? 6 : (isWrist ? 7 : 4);
            const fillColor = isFingertip ? '#ffffff' : primaryColor;

            if (typeof this.ctx.beginPath === 'function') this.ctx.beginPath();
            if (typeof this.ctx.arc === 'function') this.ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
            this.ctx.fillStyle = fillColor;
            this.ctx.shadowColor = primaryColor;
            this.ctx.shadowBlur = this.options.glowEnabled ? (isFingertip ? 12 : 6) : 0;
            if (typeof this.ctx.fill === 'function') this.ctx.fill();

            // Additional outer ring for fingertips
            if (isFingertip && typeof this.ctx.arc === 'function') {
                const pulseR = radius + 3 + Math.sin(this.phase + i) * 1.5;
                if (typeof this.ctx.beginPath === 'function') this.ctx.beginPath();
                this.ctx.arc(pt.x, pt.y, pulseR, 0, Math.PI * 2);
                this.ctx.strokeStyle = primaryColor;
                this.ctx.lineWidth = 1.5;
                if (typeof this.ctx.stroke === 'function') this.ctx.stroke();
            }
        }
        if (typeof this.ctx.restore === 'function') this.ctx.restore();

        // 3. Draw Pinch Arc / Energy Tether
        if (pinch && pinch.isPinching && showPinchAura) {
            const thumbTip = pixelPoints[4];
            const indexTip = pixelPoints[8];

            if (thumbTip && indexTip) {
                const midX = (thumbTip.x + indexTip.x) / 2;
                const midY = (thumbTip.y + indexTip.y) / 2;

                // Glowing connecting line
                if (typeof this.ctx.save === 'function') this.ctx.save();
                this.ctx.strokeStyle = THEME_COLORS.pinchTether;
                this.ctx.lineWidth = 3;
                this.ctx.shadowColor = THEME_COLORS.pinchTether;
                this.ctx.shadowBlur = 15;
                if (typeof this.ctx.beginPath === 'function') this.ctx.beginPath();
                if (typeof this.ctx.moveTo === 'function') this.ctx.moveTo(thumbTip.x, thumbTip.y);
                if (typeof this.ctx.lineTo === 'function') this.ctx.lineTo(indexTip.x, indexTip.y);
                if (typeof this.ctx.stroke === 'function') this.ctx.stroke();

                // Pulsing energy burst at midpoint
                if (typeof this.ctx.arc === 'function') {
                    const auraRadius = 10 + Math.sin(this.phase * 3) * 3;
                    if (typeof this.ctx.beginPath === 'function') this.ctx.beginPath();
                    this.ctx.arc(midX, midY, auraRadius, 0, Math.PI * 2);
                    this.ctx.fillStyle = 'rgba(251, 191, 36, 0.4)';
                    if (typeof this.ctx.fill === 'function') this.ctx.fill();
                    this.ctx.strokeStyle = THEME_COLORS.pinchTether;
                    this.ctx.lineWidth = 2;
                    if (typeof this.ctx.stroke === 'function') this.ctx.stroke();
                }
                if (typeof this.ctx.restore === 'function') this.ctx.restore();
            }
        }

        // 4. Draw Floating Gesture / Handedness Badge
        if (showBadge && gesture && gesture.name && gesture.name !== 'none') {
            const badgeAnchor = palmCenter
                ? { x: palmCenter.x * this.width, y: palmCenter.y * this.height }
                : pixelPoints[0];

            this.drawGestureBadge(badgeAnchor.x, badgeAnchor.y - 35, {
                gestureName: gesture.name,
                handedness: handedness,
                confidence: gesture.confidence || hand.score || 0.9,
                color: primaryColor
            });
        }
    }

    /**
     * Draws a sci-fi floating glassmorphism badge with gesture name and confidence.
     * @param {number} x 
     * @param {number} y 
     * @param {Object} info 
     */
    drawGestureBadge(x, y, info) {
        if (!this.ctx) return;
        const label = `${info.handedness[0]}: ${info.gestureName.toUpperCase()}`;

        if (typeof this.ctx.save === 'function') this.ctx.save();
        this.ctx.font = '600 12px "JetBrains Mono", monospace';
        const textMetrics = typeof this.ctx.measureText === 'function' ? this.ctx.measureText(label) : { width: 80 };
        const boxWidth = (textMetrics.width || 80) + 20;
        const boxHeight = 22;
        const boxX = x - boxWidth / 2;
        const boxY = y - boxHeight / 2;

        // Background pill
        this.ctx.fillStyle = 'rgba(6, 9, 17, 0.75)';
        this.ctx.strokeStyle = info.color || THEME_COLORS.leftHand;
        this.ctx.lineWidth = 1;
        this.ctx.shadowColor = info.color || THEME_COLORS.leftHand;
        this.ctx.shadowBlur = 6;

        if (typeof this.ctx.roundRect === 'function') {
            if (typeof this.ctx.beginPath === 'function') this.ctx.beginPath();
            this.ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 4);
            if (typeof this.ctx.fill === 'function') this.ctx.fill();
            if (typeof this.ctx.stroke === 'function') this.ctx.stroke();
        } else if (typeof this.ctx.rect === 'function') {
            if (typeof this.ctx.beginPath === 'function') this.ctx.beginPath();
            this.ctx.rect(boxX, boxY, boxWidth, boxHeight);
            if (typeof this.ctx.fill === 'function') this.ctx.fill();
            if (typeof this.ctx.stroke === 'function') this.ctx.stroke();
        } else if (typeof this.ctx.fillRect === 'function') {
            this.ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
            if (typeof this.ctx.strokeRect === 'function') {
                this.ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
            }
        }

        // Badge Text
        this.ctx.fillStyle = '#ffffff';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.shadowBlur = 0;
        if (typeof this.ctx.fillText === 'function') {
            this.ctx.fillText(label, x, y);
        }
        if (typeof this.ctx.restore === 'function') this.ctx.restore();
    }

    /**
     * Emits a burst of glowing neon particles.
     * @param {number} x - Pixel X
     * @param {number} y - Pixel Y
     * @param {number} [count=10] - Number of particles
     * @param {Object} [options] - Particle options
     */
    emitParticles(x, y, count = 10, options = {}) {
        const {
            color = THEME_COLORS.leftHand,
            speed = 4.0,
            spread = Math.PI * 2,
            baseAngle = 0,
            life = 1.0,
            decay = 0.02,
            size = 3.5,
            shrink = 0.96,
            gravity = 0.1,
            vx = null,
            vy = null
        } = options;

        for (let i = 0; i < count; i++) {
            if (this.particles.length >= this.options.maxParticles) {
                break;
            }

            const angle = baseAngle + (Math.random() - 0.5) * spread;
            const spd = speed * (0.4 + Math.random() * 0.8);

            let p = this.particlePool.pop();
            if (!p) {
                p = {};
            }

            p.x = x;
            p.y = y;
            p.vx = vx !== null ? vx + (Math.random() - 0.5) * 2 : Math.cos(angle) * spd;
            p.vy = vy !== null ? vy + (Math.random() - 0.5) * 2 : Math.sin(angle) * spd;
            p.color = color;
            p.life = life;
            p.maxLife = life;
            p.decay = decay;
            p.size = size * (0.6 + Math.random() * 0.8);
            p.initialSize = p.size;
            p.shrink = shrink;
            p.gravity = gravity;

            this.particles.push(p);
        }
    }

    /**
     * Updates physics integration for all active particles.
     * @param {number} [dt=0.016] - Delta time in seconds
     * @returns {number} Active particle count
     */
    updateParticles(dt = 0.016) {
        const scale = dt * 60;
        const active = [];

        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.x += p.vx * scale;
            p.y += p.vy * scale;
            p.vy += (p.gravity || 0) * scale;
            p.life -= p.decay * scale;
            p.size = Math.max(0.1, p.size * (p.shrink || 0.97));

            if (p.life > 0 && p.size > 0.2) {
                active.push(p);
            } else {
                this.particlePool.push(p);
            }
        }

        this.particles = active;
        return this.particles.length;
    }

    /**
     * Renders all active particles to the canvas.
     */
    renderParticles() {
        if (!this.ctx || this.particles.length === 0) return;

        if (typeof this.ctx.save === 'function') this.ctx.save();
        this.ctx.globalCompositeOperation = 'lighter';

        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));

            if (typeof this.ctx.beginPath === 'function') this.ctx.beginPath();
            if (typeof this.ctx.arc === 'function') {
                this.ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, Math.PI * 2);
            }
            this.ctx.fillStyle = p.color;
            this.ctx.globalAlpha = alpha;
            this.ctx.shadowColor = p.color;
            this.ctx.shadowBlur = this.options.glowEnabled ? 8 : 0;
            if (typeof this.ctx.fill === 'function') this.ctx.fill();
        }

        if (typeof this.ctx.restore === 'function') this.ctx.restore();
    }

    /**
     * Draws a glowing neon circle.
     * @param {number} x 
     * @param {number} y 
     * @param {number} radius 
     * @param {string} color 
     * @param {number} [glowBlur=10] 
     * @param {boolean} [fill=true] 
     */
    drawGlowCircle(x, y, radius, color, glowBlur = 10, fill = true) {
        if (!this.ctx) return;
        if (typeof this.ctx.save === 'function') this.ctx.save();
        if (typeof this.ctx.beginPath === 'function') this.ctx.beginPath();
        if (typeof this.ctx.arc === 'function') this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = this.options.glowEnabled ? glowBlur : 0;
        if (fill) {
            this.ctx.fillStyle = color;
            if (typeof this.ctx.fill === 'function') this.ctx.fill();
        } else {
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2;
            if (typeof this.ctx.stroke === 'function') this.ctx.stroke();
        }
        if (typeof this.ctx.restore === 'function') this.ctx.restore();
    }

    /**
     * Draws a glowing neon line segment.
     * @param {number} x1 
     * @param {number} y1 
     * @param {number} x2 
     * @param {number} y2 
     * @param {string} color 
     * @param {number} [lineWidth=2] 
     * @param {number} [glowBlur=8] 
     */
    drawGlowLine(x1, y1, x2, y2, color, lineWidth = 2, glowBlur = 8) {
        if (!this.ctx) return;
        if (typeof this.ctx.save === 'function') this.ctx.save();
        if (typeof this.ctx.beginPath === 'function') this.ctx.beginPath();
        if (typeof this.ctx.moveTo === 'function') this.ctx.moveTo(x1, y1);
        if (typeof this.ctx.lineTo === 'function') this.ctx.lineTo(x2, y2);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = this.options.glowEnabled ? glowBlur : 0;
        this.ctx.lineCap = 'round';
        if (typeof this.ctx.stroke === 'function') this.ctx.stroke();
        if (typeof this.ctx.restore === 'function') this.ctx.restore();
    }

    /**
     * Draws cyberpunk coordinate grid.
     * @param {number} [gridSize=40] 
     * @param {string} [color=THEME_COLORS.grid] 
     */
    drawGrid(gridSize = 40, color = THEME_COLORS.grid) {
        if (!this.ctx) return;
        if (typeof this.ctx.save === 'function') this.ctx.save();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 1;

        for (let x = 0; x <= this.width; x += gridSize) {
            if (typeof this.ctx.beginPath === 'function') this.ctx.beginPath();
            if (typeof this.ctx.moveTo === 'function') this.ctx.moveTo(x, 0);
            if (typeof this.ctx.lineTo === 'function') this.ctx.lineTo(x, this.height);
            if (typeof this.ctx.stroke === 'function') this.ctx.stroke();
        }
        for (let y = 0; y <= this.height; y += gridSize) {
            if (typeof this.ctx.beginPath === 'function') this.ctx.beginPath();
            if (typeof this.ctx.moveTo === 'function') this.ctx.moveTo(0, y);
            if (typeof this.ctx.lineTo === 'function') this.ctx.lineTo(this.width, y);
            if (typeof this.ctx.stroke === 'function') this.ctx.stroke();
        }
        if (typeof this.ctx.restore === 'function') this.ctx.restore();
    }

    /**
     * Draws musical scale fret lanes and active note indicator for Air Theremin mode.
     * @param {Array<Object>} notesList - Array of scale note definitions
     * @param {number} [activeNoteIndex=-1] - Currently sounding note index
     */
    drawThereminGrid(notesList = [], activeNoteIndex = -1) {
        if (!this.ctx || !Array.isArray(notesList) || notesList.length === 0) return;

        const count = notesList.length;
        const laneWidth = this.width / count;

        if (typeof this.ctx.save === 'function') this.ctx.save();
        for (let i = 0; i < count; i++) {
            const note = notesList[i];
            const laneX = i * laneWidth;
            const isActive = i === activeNoteIndex;

            // Lane Divider
            this.ctx.strokeStyle = isActive ? 'rgba(0, 243, 255, 0.4)' : 'rgba(255, 255, 255, 0.08)';
            this.ctx.lineWidth = isActive ? 2 : 1;
            if (typeof this.ctx.beginPath === 'function') this.ctx.beginPath();
            if (typeof this.ctx.moveTo === 'function') this.ctx.moveTo(laneX, 0);
            if (typeof this.ctx.lineTo === 'function') this.ctx.lineTo(laneX, this.height);
            if (typeof this.ctx.stroke === 'function') this.ctx.stroke();

            // Active Lane Glow Fill
            if (isActive && typeof this.ctx.fillRect === 'function') {
                this.ctx.fillStyle = 'rgba(0, 243, 255, 0.12)';
                this.ctx.fillRect(laneX, 0, laneWidth, this.height);
            }

            // Note Name Tag at bottom
            this.ctx.fillStyle = isActive ? '#00f3ff' : '#64748b';
            this.ctx.font = isActive ? '700 14px "JetBrains Mono", monospace' : '500 12px "JetBrains Mono", monospace';
            this.ctx.textAlign = 'center';
            if (typeof this.ctx.fillText === 'function') {
                this.ctx.fillText(note.noteName || '', laneX + laneWidth / 2, this.height - 24);
            }
        }
        if (typeof this.ctx.restore === 'function') this.ctx.restore();
    }

    /**
     * Draws an interactive arcade target / orb.
     * @param {Object} target - Target definition with { x, y, radius, type, color, points, pulse }
     */
    drawTarget(target) {
        if (!this.ctx || !target) return;
        const {
            x,
            y,
            radius = 35,
            color = THEME_COLORS.accentGreen,
            points = 100,
            pulse = 0
        } = target;

        const dynamicR = radius + Math.sin(pulse || 0) * 3;

        if (typeof this.ctx.save === 'function') this.ctx.save();
        // Outer glowing halo
        if (typeof this.ctx.beginPath === 'function') this.ctx.beginPath();
        if (typeof this.ctx.arc === 'function') this.ctx.arc(x, y, dynamicR, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(6, 9, 17, 0.7)';
        if (typeof this.ctx.fill === 'function') this.ctx.fill();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2.5;
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 12;
        if (typeof this.ctx.stroke === 'function') this.ctx.stroke();

        // Inner core
        if (typeof this.ctx.beginPath === 'function') this.ctx.beginPath();
        if (typeof this.ctx.arc === 'function') this.ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2);
        this.ctx.fillStyle = color;
        if (typeof this.ctx.fill === 'function') this.ctx.fill();

        // Points readout
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '700 12px "JetBrains Mono", monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.shadowBlur = 0;
        if (typeof this.ctx.fillText === 'function') {
            this.ctx.fillText(`+${points}`, x, y);
        }
        if (typeof this.ctx.restore === 'function') this.ctx.restore();
    }

    /**
     * Draws glowing laser blade / slice polygon across trajectory points.
     * @param {Array<Object>} trailPoints - Array of recent trajectory points
     * @param {string} [color=THEME_COLORS.leftHand]
     */
    drawSliceBlade(trailPoints = [], color = THEME_COLORS.leftHand) {
        if (!this.ctx || !Array.isArray(trailPoints) || trailPoints.length < 2) return;

        if (typeof this.ctx.save === 'function') this.ctx.save();
        this.ctx.strokeStyle = color;
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 14;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        for (let i = 0; i < trailPoints.length - 1; i++) {
            const p1 = trailPoints[i];
            const p2 = trailPoints[i + 1];
            const width = Math.max(1, 8 * (1 - i / trailPoints.length));

            this.ctx.lineWidth = width;
            if (typeof this.ctx.beginPath === 'function') this.ctx.beginPath();
            if (typeof this.ctx.moveTo === 'function') this.ctx.moveTo(p1.x, p1.y);
            if (typeof this.ctx.lineTo === 'function') this.ctx.lineTo(p2.x, p2.y);
            if (typeof this.ctx.stroke === 'function') this.ctx.stroke();
        }
        if (typeof this.ctx.restore === 'function') this.ctx.restore();
    }

    /**
     * Returns total active particle count.
     * @returns {number}
     */
    getParticleCount() {
        return this.particles.length;
    }

    /**
     * Resets active particles, pools, and motion trails.
     */
    reset() {
        this.particles = [];
        this.particlePool = [];
        this.trails.clear();
    }

    /**
     * Cleans up all resources.
     */
    destroy() {
        this.reset();
        this.canvas = null;
        this.ctx = null;
    }
}
