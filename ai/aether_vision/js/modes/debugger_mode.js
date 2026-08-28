/**
 * Aether Vision Sandbox - Vision Debugger Experience Mode
 * 
 * Provides in-depth anatomical and geometric diagnostics:
 * - Analytical 21-landmark inspection with joint ID numbering, 3D coordinates, and color-coded fingers.
 * - Dashed distance measurement lines with pixel & normalized distance annotations:
 *   (Pinch distance 4-8, Palm Length 0-9, Palm Width 5-17, Hand Span 4-20, Finger Gap 8-12).
 * - Joint angle monitors measuring degrees of flexion/extension across PIP, DIP, and MCP joints.
 * - Bounding box computation with sci-fi glassmorphism brackets and velocity tracking.
 * - Real-time gesture confidence telemetry card and finger extension status table.
 */

import { GestureDetector, GESTURES, LANDMARKS } from '../vision/gesture_detector.js';
import { appState } from '../core/state.js';
import { THEME_COLORS, HAND_CONNECTIONS, FINGERTIP_INDICES } from '../ui/renderer.js';

export const FINGER_PALETTE = {
    thumb: '#f59e0b',      // Amber
    index: '#00f3ff',      // Cyan
    middle: '#8b5cf6',     // Violet
    ring: '#ec4899',       // Pink
    pinky: '#10b981',      // Emerald
    palm: '#ffffff'        // White
};

export class DebuggerMode {
    /**
     * @param {Object} [options={}] - Mode configuration options
     * @param {import('../core/state.js').StateManager} [options.state] - State manager
     * @param {import('../ui/renderer.js').CanvasRenderer} [options.renderer] - Canvas overlay renderer
     * @param {import('../ui/hud.js').HudManager} [options.hud] - HUD telemetry manager
     * @param {number} [options.width=1280] - Display width
     * @param {number} [options.height=720] - Display height
     * @param {boolean} [options.showLandmarkIndices=true] - Display 0-20 joint numbers
     * @param {boolean} [options.showDistanceLines=true] - Draw dashed measurement lines
     * @param {boolean} [options.showJointAngles=true] - Draw joint flexion angles
     * @param {boolean} [options.showBoundingBox=true] - Draw bounding boxes
     * @param {boolean} [options.showTelemetryCard=true] - Draw glassmorphism overlay card
     */
    constructor(options = {}) {
        this.state = options.state || appState;
        this.renderer = options.renderer || null;
        this.hud = options.hud || null;

        this.width = options.width || 1280;
        this.height = options.height || 720;
        this.isActive = false;

        this.showLandmarkIndices = options.showLandmarkIndices ?? true;
        this.showDistanceLines = options.showDistanceLines ?? true;
        this.showJointAngles = options.showJointAngles ?? true;
        this.showBoundingBox = options.showBoundingBox ?? true;
        this.showTelemetryCard = options.showTelemetryCard ?? true;

        this.gestureDetector = new GestureDetector();
        this.lastTrackedHands = [];
        this.previousWristPositions = new Map();
        this.velocities = new Map();
    }

    /**
     * Calculates angle in degrees at vertex joint B formed by lines AB and BC in 2D or 3D space.
     * 
     * @param {{x: number, y: number, z?: number}} a - Point A
     * @param {{x: number, y: number, z?: number}} b - Vertex Joint B
     * @param {{x: number, y: number, z?: number}} c - Point C
     * @param {boolean} [use3D=true]
     * @returns {number} Angle in degrees [0 to 180]
     */
    static calculateAngle(a, b, c, use3D = true) {
        if (!a || !b || !c) return 0;

        const v1x = a.x - b.x;
        const v1y = a.y - b.y;
        const v1z = use3D ? ((a.z || 0) - (b.z || 0)) : 0;

        const v2x = c.x - b.x;
        const v2y = c.y - b.y;
        const v2z = use3D ? ((c.z || 0) - (b.z || 0)) : 0;

        const dot = v1x * v2x + v1y * v2y + v1z * v2z;
        const mag1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z);
        const mag2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z);

        if (mag1 < 0.00001 || mag2 < 0.00001) return 0;

        const cosVal = Math.max(-1.0, Math.min(1.0, dot / (mag1 * mag2)));
        return (Math.acos(cosVal) * 180) / Math.PI;
    }

    /**
     * Computes all primary joint flexion angles for a hand.
     * 
     * @param {Array<{x: number, y: number, z?: number}>} landmarks - 21 hand landmarks
     * @returns {Object} Angles in degrees
     */
    static calculateHandAngles(landmarks) {
        if (!landmarks || landmarks.length < 21) {
            return {
                thumbMcp: 0,
                thumbIp: 0,
                indexPip: 0,
                indexDip: 0,
                middlePip: 0,
                middleDip: 0,
                ringPip: 0,
                ringDip: 0,
                pinkyPip: 0,
                pinkyDip: 0
            };
        }

        return {
            thumbMcp: Math.round(DebuggerMode.calculateAngle(landmarks[1], landmarks[2], landmarks[3])),
            thumbIp: Math.round(DebuggerMode.calculateAngle(landmarks[2], landmarks[3], landmarks[4])),
            indexPip: Math.round(DebuggerMode.calculateAngle(landmarks[5], landmarks[6], landmarks[7])),
            indexDip: Math.round(DebuggerMode.calculateAngle(landmarks[6], landmarks[7], landmarks[8])),
            middlePip: Math.round(DebuggerMode.calculateAngle(landmarks[9], landmarks[10], landmarks[11])),
            middleDip: Math.round(DebuggerMode.calculateAngle(landmarks[10], landmarks[11], landmarks[12])),
            ringPip: Math.round(DebuggerMode.calculateAngle(landmarks[13], landmarks[14], landmarks[15])),
            ringDip: Math.round(DebuggerMode.calculateAngle(landmarks[14], landmarks[15], landmarks[16])),
            pinkyPip: Math.round(DebuggerMode.calculateAngle(landmarks[17], landmarks[18], landmarks[19])),
            pinkyDip: Math.round(DebuggerMode.calculateAngle(landmarks[18], landmarks[19], landmarks[20]))
        };
    }

    /**
     * Calculates pixel and normalized bounding box with center and padding.
     * 
     * @param {Array<{x: number, y: number, z?: number}>} landmarks 
     * @param {number} [width=1280] 
     * @param {number} [height=720] 
     * @param {number} [padding=20] 
     * @returns {Object}
     */
    static calculateBoundingBox(landmarks, width = 1280, height = 720, padding = 20) {
        if (!landmarks || landmarks.length < 21) {
            return {
                minX: 0, minY: 0, maxX: 0, maxY: 0,
                width: 0, height: 0, centerX: 0, centerY: 0,
                normalized: { minX: 0, minY: 0, maxX: 0, maxY: 0 }
            };
        }

        let normMinX = 1, normMaxX = 0, normMinY = 1, normMaxY = 0;

        for (const lm of landmarks) {
            const x = lm.x ?? 0;
            const y = lm.y ?? 0;
            if (x < normMinX) normMinX = x;
            if (x > normMaxX) normMaxX = x;
            if (y < normMinY) normMinY = y;
            if (y > normMaxY) normMaxY = y;
        }

        const minX = Math.max(0, normMinX * width - padding);
        const minY = Math.max(0, normMinY * height - padding);
        const maxX = Math.min(width, normMaxX * width + padding);
        const maxY = Math.min(height, normMaxY * height + padding);

        return {
            minX,
            minY,
            maxX,
            maxY,
            width: maxX - minX,
            height: maxY - minY,
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2,
            normalized: {
                minX: normMinX,
                minY: normMinY,
                maxX: normMaxX,
                maxY: normMaxY
            }
        };
    }

    /**
     * Activates Vision Debugger mode.
     */
    activate() {
        this.isActive = true;
        if (this.state) {
            this.state.set('activeMode', 'debugger');
        }
        if (this.hud) {
            this.hud.setActiveMode('debugger');
        }
    }

    /**
     * Deactivates Vision Debugger mode.
     */
    deactivate() {
        this.isActive = false;
        this.lastTrackedHands = [];
        this.previousWristPositions.clear();
        this.velocities.clear();
    }

    /**
     * Updates analytical measurements from tracking results.
     * 
     * @param {Object} trackingResults - HandTracker results
     * @param {number} [dt=0.016] - Delta time in seconds
     * @returns {Object} Analytical metrics snapshot
     */
    update(trackingResults, dt = 0.016) {
        if (!this.isActive) {
            return { isActive: false, handsMetrics: [] };
        }

        const rawHands = trackingResults?.hands || [];
        this.lastTrackedHands = rawHands;

        const handsMetrics = [];

        for (let i = 0; i < rawHands.length; i++) {
            const hand = rawHands[i];
            const landmarks = hand.landmarks || [];
            if (landmarks.length < 21) continue;

            const handKey = `${hand.handedness || 'Hand'}_${i}`;

            // 1. Joint angles
            const angles = DebuggerMode.calculateHandAngles(landmarks);

            // 2. Bounding Box
            const bbox = DebuggerMode.calculateBoundingBox(landmarks, this.width, this.height);

            // 3. Velocity tracking (Wrist displacement)
            const currentWrist = landmarks[LANDMARKS.WRIST];
            const prevWrist = this.previousWristPositions.get(handKey);
            let velocity = { vx: 0, vy: 0, vz: 0, speed: 0 };

            if (prevWrist && dt > 0.0001) {
                const vx = ((currentWrist.x - prevWrist.x) * this.width) / dt;
                const vy = ((currentWrist.y - prevWrist.y) * this.height) / dt;
                const vz = (((currentWrist.z || 0) - (prevWrist.z || 0)) * this.width) / dt;
                const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
                velocity = { vx: Math.round(vx), vy: Math.round(vy), vz: Math.round(vz), speed: Math.round(speed) };
            }

            this.previousWristPositions.set(handKey, { ...currentWrist });
            this.velocities.set(handKey, velocity);

            // 4. Distances
            const pinchDist = GestureDetector.calculateDistance(landmarks[4], landmarks[8]);
            const palmLength = GestureDetector.calculateDistance(landmarks[0], landmarks[9]);
            const palmWidth = GestureDetector.calculateDistance(landmarks[5], landmarks[17]);
            const handSpan = GestureDetector.calculateDistance(landmarks[4], landmarks[20]);

            // 5. Gesture Classification
            const gestureInfo = hand.gesture || this.gestureDetector.classify(landmarks);

            handsMetrics.push({
                handIndex: i,
                handedness: hand.handedness || 'Unknown',
                score: hand.score || 0.95,
                gesture: gestureInfo,
                angles,
                bbox,
                velocity,
                distances: {
                    pinchDist: Math.round(pinchDist * 1000) / 1000,
                    palmLength: Math.round(palmLength * 1000) / 1000,
                    palmWidth: Math.round(palmWidth * 1000) / 1000,
                    handSpan: Math.round(handSpan * 1000) / 1000
                },
                palmCenter: GestureDetector.getPalmCenter(landmarks),
                palmScale: GestureDetector.getPalmScale(landmarks)
            });
        }

        if (this.hud) {
            this.hud.updateTelemetry({
                handsCount: handsMetrics.length,
                leftGesture: handsMetrics.find(h => h.handedness === 'Left')?.gesture?.name || 'NONE',
                rightGesture: handsMetrics.find(h => h.handedness === 'Right')?.gesture?.name || 'NONE',
                activeMode: 'debugger'
            });
        }

        return {
            isActive: this.isActive,
            handsCount: handsMetrics.length,
            handsMetrics
        };
    }

    /**
     * Helper to return finger group color for a landmark index.
     * @param {number} idx - Landmark index [0..20]
     * @returns {string} Color hex
     */
    static getLandmarkColor(idx) {
        if (idx >= 1 && idx <= 4) return FINGER_PALETTE.thumb;
        if (idx >= 5 && idx <= 8) return FINGER_PALETTE.index;
        if (idx >= 9 && idx <= 12) return FINGER_PALETTE.middle;
        if (idx >= 13 && idx <= 16) return FINGER_PALETTE.ring;
        if (idx >= 17 && idx <= 20) return FINGER_PALETTE.pinky;
        return FINGER_PALETTE.palm; // Wrist (0)
    }

    /**
     * Renders full analytical debugger visual overlays.
     * @param {import('../ui/renderer.js').CanvasRenderer} [renderer=this.renderer]
     */
    render(renderer = this.renderer) {
        if (!renderer || !this.isActive) return;
        const ctx = renderer.ctx;
        if (!ctx) return;

        const w = renderer.width || this.width;
        const h = renderer.height || this.height;

        for (let handIdx = 0; handIdx < this.lastTrackedHands.length; handIdx++) {
            const hand = this.lastTrackedHands[handIdx];
            const landmarks = hand.landmarks || [];
            if (landmarks.length < 21) continue;

            const pixelPoints = landmarks.map(lm => ({
                x: lm.x * w,
                y: lm.y * h,
                z: lm.z || 0
            }));

            // 1. Draw Skeleton Bone Connections
            if (typeof ctx.save === 'function') ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 2;
            for (const [i1, i2] of HAND_CONNECTIONS) {
                const p1 = pixelPoints[i1];
                const p2 = pixelPoints[i2];
                if (p1 && p2) {
                    if (typeof ctx.beginPath === 'function') ctx.beginPath();
                    if (typeof ctx.moveTo === 'function') ctx.moveTo(p1.x, p1.y);
                    if (typeof ctx.lineTo === 'function') ctx.lineTo(p2.x, p2.y);
                    if (typeof ctx.stroke === 'function') ctx.stroke();
                }
            }
            if (typeof ctx.restore === 'function') ctx.restore();

            // 2. Draw Landmark Joint Nodes & Index Labels
            for (let i = 0; i < pixelPoints.length; i++) {
                const pt = pixelPoints[i];
                const color = DebuggerMode.getLandmarkColor(i);
                const isFingertip = FINGERTIP_INDICES.includes(i);

                if (typeof ctx.save === 'function') ctx.save();
                if (typeof ctx.beginPath === 'function') ctx.beginPath();
                if (typeof ctx.arc === 'function') ctx.arc(pt.x, pt.y, isFingertip ? 6 : 4, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.shadowColor = color;
                ctx.shadowBlur = 8;
                if (typeof ctx.fill === 'function') ctx.fill();

                if (this.showLandmarkIndices) {
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '700 10px "JetBrains Mono", monospace';
                    ctx.shadowBlur = 0;
                    if (typeof ctx.fillText === 'function') {
                        ctx.fillText(`${i}`, pt.x + 8, pt.y + 3);
                    }
                }
                if (typeof ctx.restore === 'function') ctx.restore();
            }

            // 3. Draw Dashed Measurement Distance Lines
            if (this.showDistanceLines) {
                this.drawDistanceMeasurement(ctx, pixelPoints[4], pixelPoints[8], 'PINCH', THEME_COLORS.accentGold);
                this.drawDistanceMeasurement(ctx, pixelPoints[0], pixelPoints[9], 'PALM_L', 'rgba(0, 243, 255, 0.7)');
                this.drawDistanceMeasurement(ctx, pixelPoints[5], pixelPoints[17], 'PALM_W', 'rgba(236, 72, 153, 0.7)');
                this.drawDistanceMeasurement(ctx, pixelPoints[4], pixelPoints[20], 'SPAN', 'rgba(16, 185, 129, 0.7)');
            }

            // 4. Draw Joint Angles at PIP joints
            if (this.showJointAngles) {
                const angles = DebuggerMode.calculateHandAngles(landmarks);
                this.drawAngleArc(ctx, pixelPoints[5], pixelPoints[6], pixelPoints[7], `${angles.indexPip}°`, FINGER_PALETTE.index);
                this.drawAngleArc(ctx, pixelPoints[9], pixelPoints[10], pixelPoints[11], `${angles.middlePip}°`, FINGER_PALETTE.middle);
                this.drawAngleArc(ctx, pixelPoints[13], pixelPoints[14], pixelPoints[15], `${angles.ringPip}°`, FINGER_PALETTE.ring);
                this.drawAngleArc(ctx, pixelPoints[17], pixelPoints[18], pixelPoints[19], `${angles.pinkyPip}°`, FINGER_PALETTE.pinky);
            }

            // 5. Draw Sci-Fi Bounding Box with Corner Brackets
            if (this.showBoundingBox) {
                const bbox = DebuggerMode.calculateBoundingBox(landmarks, w, h);
                this.drawSciFiBoundingBox(ctx, bbox, hand.handedness === 'Left' ? THEME_COLORS.leftHand : THEME_COLORS.rightHand);
            }

            // 6. Draw Real-time Analytical Telemetry HUD Card
            if (this.showTelemetryCard) {
                const cardX = hand.handedness === 'Left' ? 24 : w - 280;
                const cardY = 24 + handIdx * 240;
                this.drawTelemetryCard(ctx, cardX, cardY, hand, DebuggerMode.calculateHandAngles(landmarks));
            }
        }
    }

    /**
     * Draws a dashed distance line between two points with label.
     * @private
     */
    drawDistanceMeasurement(ctx, p1, p2, label, color) {
        if (!p1 || !p2 || !ctx) return;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const distPx = Math.round(Math.sqrt(dx * dx + dy * dy));
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        if (typeof ctx.save === 'function') ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        if (typeof ctx.setLineDash === 'function') ctx.setLineDash([4, 4]);

        if (typeof ctx.beginPath === 'function') ctx.beginPath();
        if (typeof ctx.moveTo === 'function') ctx.moveTo(p1.x, p1.y);
        if (typeof ctx.lineTo === 'function') ctx.lineTo(p2.x, p2.y);
        if (typeof ctx.stroke === 'function') ctx.stroke();

        ctx.fillStyle = color;
        ctx.font = '600 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        if (typeof ctx.fillText === 'function') {
            ctx.fillText(`${label}: ${distPx}px`, midX, midY - 6);
        }
        if (typeof ctx.restore === 'function') ctx.restore();
    }

    /**
     * Draws an angle arc indicator and degree text at vertex B.
     * @private
     */
    drawAngleArc(ctx, a, b, c, label, color) {
        if (!a || !b || !c || !ctx) return;

        if (typeof ctx.save === 'function') ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.5;

        if (typeof ctx.beginPath === 'function') ctx.beginPath();
        if (typeof ctx.arc === 'function') ctx.arc(b.x, b.y, 14, 0, Math.PI * 2);
        if (typeof ctx.stroke === 'function') ctx.stroke();

        ctx.font = '700 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        if (typeof ctx.fillText === 'function') {
            ctx.fillText(label, b.x, b.y - 18);
        }
        if (typeof ctx.restore === 'function') ctx.restore();
    }

    /**
     * Draws bounding box with corner brackets.
     * @private
     */
    drawSciFiBoundingBox(ctx, bbox, color) {
        if (!bbox || !ctx) return;
        const { minX, minY, maxX, maxY } = bbox;
        const bLen = 16;

        if (typeof ctx.save === 'function') ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;

        // Top-Left corner
        if (typeof ctx.beginPath === 'function') ctx.beginPath();
        if (typeof ctx.moveTo === 'function') ctx.moveTo(minX, minY + bLen);
        if (typeof ctx.lineTo === 'function') ctx.lineTo(minX, minY);
        if (typeof ctx.lineTo === 'function') ctx.lineTo(minX + bLen, minY);
        if (typeof ctx.stroke === 'function') ctx.stroke();

        // Top-Right corner
        if (typeof ctx.beginPath === 'function') ctx.beginPath();
        if (typeof ctx.moveTo === 'function') ctx.moveTo(maxX - bLen, minY);
        if (typeof ctx.lineTo === 'function') ctx.lineTo(maxX, minY);
        if (typeof ctx.lineTo === 'function') ctx.lineTo(maxX, minY + bLen);
        if (typeof ctx.stroke === 'function') ctx.stroke();

        // Bottom-Left corner
        if (typeof ctx.beginPath === 'function') ctx.beginPath();
        if (typeof ctx.moveTo === 'function') ctx.moveTo(minX, maxY - bLen);
        if (typeof ctx.lineTo === 'function') ctx.lineTo(minX, maxY);
        if (typeof ctx.lineTo === 'function') ctx.lineTo(minX + bLen, maxY);
        if (typeof ctx.stroke === 'function') ctx.stroke();

        // Bottom-Right corner
        if (typeof ctx.beginPath === 'function') ctx.beginPath();
        if (typeof ctx.moveTo === 'function') ctx.moveTo(maxX - bLen, maxY);
        if (typeof ctx.lineTo === 'function') ctx.lineTo(maxX, maxY);
        if (typeof ctx.lineTo === 'function') ctx.lineTo(maxX, maxY - bLen);
        if (typeof ctx.stroke === 'function') ctx.stroke();

        if (typeof ctx.restore === 'function') ctx.restore();
    }

    /**
     * Draws glassmorphism telemetry summary card.
     * @private
     */
    drawTelemetryCard(ctx, x, y, hand, angles) {
        if (!ctx || !hand) return;
        const handedness = hand.handedness || 'Right';
        const gestureName = hand.gesture?.name || 'NONE';
        const confidence = Math.round((hand.gesture?.confidence || hand.score || 0.95) * 100);

        const cardWidth = 250;
        const cardHeight = 210;

        if (typeof ctx.save === 'function') ctx.save();
        ctx.fillStyle = 'rgba(6, 9, 17, 0.85)';
        ctx.strokeStyle = handedness === 'Left' ? THEME_COLORS.leftHand : THEME_COLORS.rightHand;
        ctx.lineWidth = 1;

        if (typeof ctx.fillRect === 'function') ctx.fillRect(x, y, cardWidth, cardHeight);
        if (typeof ctx.strokeRect === 'function') ctx.strokeRect(x, y, cardWidth, cardHeight);

        // Header
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 13px "JetBrains Mono", monospace';
        if (typeof ctx.fillText === 'function') {
            ctx.fillText(`ANALYTICS // ${handedness.toUpperCase()}`, x + 14, y + 22);
        }

        ctx.font = '500 11px "JetBrains Mono", monospace';
        ctx.fillStyle = '#94a3b8';
        if (typeof ctx.fillText === 'function') {
            ctx.fillText(`Gesture: ${gestureName.toUpperCase()} (${confidence}%)`, x + 14, y + 46);
            ctx.fillText(`Score: ${((hand.score || 0.95) * 100).toFixed(1)}%`, x + 14, y + 66);
            ctx.fillText(`Index PIP: ${angles.indexPip}° | DIP: ${angles.indexDip}°`, x + 14, y + 90);
            ctx.fillText(`Middle PIP: ${angles.middlePip}° | DIP: ${angles.middleDip}°`, x + 14, y + 110);
            ctx.fillText(`Ring PIP: ${angles.ringPip}° | Pinky: ${angles.pinkyPip}°`, x + 14, y + 130);
            ctx.fillText(`Thumb MCP: ${angles.thumbMcp}° | IP: ${angles.thumbIp}°`, x + 14, y + 150);

            const isPinching = hand.pinch?.isPinching ? 'YES' : 'NO';
            ctx.fillText(`Pinching: ${isPinching} (dist: ${(hand.pinch?.distance || 0).toFixed(3)})`, x + 14, y + 174);
            ctx.fillText(`Palm Scale: ${(hand.palmScale || 0.15).toFixed(3)}`, x + 14, y + 194);
        }

        if (typeof ctx.restore === 'function') ctx.restore();
    }

    /**
     * Returns current debugger telemetry state.
     * @returns {Object}
     */
    getState() {
        return {
            isActive: this.isActive,
            showLandmarkIndices: this.showLandmarkIndices,
            showDistanceLines: this.showDistanceLines,
            showJointAngles: this.showJointAngles,
            showBoundingBox: this.showBoundingBox,
            showTelemetryCard: this.showTelemetryCard,
            trackedHandsCount: this.lastTrackedHands.length
        };
    }

    /**
     * Cleans up resources.
     */
    destroy() {
        this.deactivate();
        this.state = null;
        this.renderer = null;
        this.hud = null;
    }
}
