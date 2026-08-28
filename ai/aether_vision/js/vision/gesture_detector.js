/**
 * @file gesture_detector.js
 * @description Geometric Hand Gesture Classification Engine for Aether Vision Sandbox.
 * Classifies 21 MediaPipe hand landmarks into geometric gestures (Pinch, Open Palm, Fist, Pointing, Peace, Thumbs Up).
 */

export const GESTURES = Object.freeze({
    NONE: 'none',
    PINCH: 'pinch',
    OPEN_PALM: 'open_palm',
    FIST: 'fist',
    POINTING: 'pointing',
    PEACE: 'peace',
    THUMBS_UP: 'thumbs_up'
});

export const LANDMARKS = Object.freeze({
    WRIST: 0,
    THUMB_CMC: 1,
    THUMB_MCP: 2,
    THUMB_IP: 3,
    THUMB_TIP: 4,
    INDEX_MCP: 5,
    INDEX_PIP: 6,
    INDEX_DIP: 7,
    INDEX_TIP: 8,
    MIDDLE_MCP: 9,
    MIDDLE_PIP: 10,
    MIDDLE_DIP: 11,
    MIDDLE_TIP: 12,
    RING_MCP: 13,
    RING_PIP: 14,
    RING_DIP: 15,
    RING_TIP: 16,
    PINKY_MCP: 17,
    PINKY_PIP: 18,
    PINKY_DIP: 19,
    PINKY_TIP: 20
});

export const FINGER_INDICES = Object.freeze({
    index: { mcp: 5, pip: 6, dip: 7, tip: 8 },
    middle: { mcp: 9, pip: 10, dip: 11, tip: 12 },
    ring: { mcp: 13, pip: 14, dip: 15, tip: 16 },
    pinky: { mcp: 17, pip: 18, dip: 19, tip: 20 }
});

export class GestureDetector {
    /**
     * @param {Object} [options={}]
     * @param {number} [options.pinchThreshold=0.06] - Max distance between thumb tip & index tip for pinch
     * @param {number} [options.pinchRatioThreshold=0.35] - Relative distance ratio against palm scale
     */
    constructor(options = {}) {
        this.pinchThreshold = options.pinchThreshold ?? 0.06;
        this.pinchRatioThreshold = options.pinchRatioThreshold ?? 0.35;
    }

    /**
     * Calculates Euclidean distance between two 2D/3D points.
     * @param {{x: number, y: number, z?: number}} p1
     * @param {{x: number, y: number, z?: number}} p2
     * @param {boolean} [use3D=true]
     * @returns {number}
     */
    static calculateDistance(p1, p2, use3D = true) {
        if (!p1 || !p2) return 0;
        const dx = (p1.x ?? 0) - (p2.x ?? 0);
        const dy = (p1.y ?? 0) - (p2.y ?? 0);
        const dz = use3D ? ((p1.z ?? 0) - (p2.z ?? 0)) : 0;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Calculates the geometric center of the palm.
     * @param {Array<{x: number, y: number, z?: number}>} landmarks
     * @returns {{x: number, y: number, z: number}}
     */
    static getPalmCenter(landmarks) {
        if (!landmarks || landmarks.length < 21) {
            return { x: 0, y: 0, z: 0 };
        }
        // Palm base/MCP indices: Wrist(0), Index MCP(5), Middle MCP(9), Ring MCP(13), Pinky MCP(17)
        const keyIndices = [0, 5, 9, 13, 17];
        let sumX = 0, sumY = 0, sumZ = 0;
        for (const idx of keyIndices) {
            const pt = landmarks[idx];
            sumX += pt.x ?? 0;
            sumY += pt.y ?? 0;
            sumZ += pt.z ?? 0;
        }
        const count = keyIndices.length;
        return {
            x: sumX / count,
            y: sumY / count,
            z: sumZ / count
        };
    }

    /**
     * Calculates the approximate palm scale (reference distance).
     * @param {Array<{x: number, y: number, z?: number}>} landmarks
     * @returns {number}
     */
    static getPalmScale(landmarks) {
        if (!landmarks || landmarks.length < 21) return 1.0;
        const wristToMiddle = GestureDetector.calculateDistance(landmarks[LANDMARKS.WRIST], landmarks[LANDMARKS.MIDDLE_MCP]);
        const indexToPinky = GestureDetector.calculateDistance(landmarks[LANDMARKS.INDEX_MCP], landmarks[LANDMARKS.PINKY_MCP]);
        return Math.max(wristToMiddle, indexToPinky, 0.001);
    }

    /**
     * Checks if a standard finger (index, middle, ring, pinky) is extended.
     * @param {Array<{x: number, y: number, z?: number}>} landmarks
     * @param {string} fingerName - 'index' | 'middle' | 'ring' | 'pinky'
     * @returns {boolean}
     */
    isFingerExtended(landmarks, fingerName) {
        const indices = FINGER_INDICES[fingerName];
        if (!indices || !landmarks || landmarks.length < 21) return false;

        const wrist = landmarks[LANDMARKS.WRIST];
        const mcp = landmarks[indices.mcp];
        const pip = landmarks[indices.pip];
        const dip = landmarks[indices.dip];
        const tip = landmarks[indices.tip];

        const distTipWrist = GestureDetector.calculateDistance(tip, wrist);
        const distPipWrist = GestureDetector.calculateDistance(pip, wrist);
        const distTipMcp = GestureDetector.calculateDistance(tip, mcp);
        const distPipMcp = GestureDetector.calculateDistance(pip, mcp);
        const distTipDip = GestureDetector.calculateDistance(tip, dip);

        // Extended condition: tip is furthest from wrist & MCP compared to PIP
        const isExtendedAway = distTipWrist > distPipWrist && distTipMcp > distPipMcp;
        // Curled condition: tip is closer to MCP than DIP or curled towards wrist
        const isFolded = distTipWrist < distPipWrist || distTipMcp < distPipMcp;

        return isExtendedAway && !isFolded;
    }

    /**
     * Checks if the thumb is extended.
     * @param {Array<{x: number, y: number, z?: number}>} landmarks
     * @returns {boolean}
     */
    isThumbExtended(landmarks) {
        if (!landmarks || landmarks.length < 21) return false;

        const thumbTip = landmarks[LANDMARKS.THUMB_TIP];
        const thumbIp = landmarks[LANDMARKS.THUMB_IP];
        const thumbMcp = landmarks[LANDMARKS.THUMB_MCP];
        const indexMcp = landmarks[LANDMARKS.INDEX_MCP];
        const pinkyMcp = landmarks[LANDMARKS.PINKY_MCP];
        const wrist = landmarks[LANDMARKS.WRIST];

        const distTipPinky = GestureDetector.calculateDistance(thumbTip, pinkyMcp);
        const distIpPinky = GestureDetector.calculateDistance(thumbIp, pinkyMcp);
        const distTipIndex = GestureDetector.calculateDistance(thumbTip, indexMcp);
        const distMcpIndex = GestureDetector.calculateDistance(thumbMcp, indexMcp);
        const distTipWrist = GestureDetector.calculateDistance(thumbTip, wrist);
        const distMcpWrist = GestureDetector.calculateDistance(thumbMcp, wrist);

        return (distTipPinky > distIpPinky || distTipIndex > distMcpIndex) && distTipWrist > distMcpWrist;
    }

    /**
     * Checks if hand pose matches Thumbs Up.
     * @param {Array<{x: number, y: number, z?: number}>} landmarks
     * @param {Object} fingers
     * @returns {boolean}
     */
    isThumbsUp(landmarks, fingers) {
        if (!fingers.thumb.extended) return false;
        // All other 4 fingers must be curled
        if (fingers.index.extended || fingers.middle.extended || fingers.ring.extended || fingers.pinky.extended) {
            return false;
        }

        const thumbTip = landmarks[LANDMARKS.THUMB_TIP];
        const thumbIp = landmarks[LANDMARKS.THUMB_IP];
        const thumbMcp = landmarks[LANDMARKS.THUMB_MCP];
        const indexMcp = landmarks[LANDMARKS.INDEX_MCP];

        // In screen coordinates (y=0 top), pointing up means smaller y
        const isPointingUp = thumbTip.y < thumbIp.y && thumbIp.y < thumbMcp.y;
        const isHigherThanIndexMcp = thumbTip.y < indexMcp.y;

        return isPointingUp && isHigherThanIndexMcp;
    }

    /**
     * Computes pinch metrics between thumb tip and index tip.
     * @param {Array<{x: number, y: number, z?: number}>} landmarks
     * @param {number} palmScale
     * @returns {{isPinching: boolean, distance: number, normalizedDistance: number, position: {x: number, y: number, z: number}}}
     */
    checkPinch(landmarks, palmScale) {
        if (!landmarks || landmarks.length < 21) {
            return {
                isPinching: false,
                distance: 1.0,
                normalizedDistance: 1.0,
                position: { x: 0, y: 0, z: 0 }
            };
        }

        const thumbTip = landmarks[LANDMARKS.THUMB_TIP];
        const indexTip = landmarks[LANDMARKS.INDEX_TIP];

        const distance = GestureDetector.calculateDistance(thumbTip, indexTip);
        const normalizedDistance = distance / (palmScale || 1.0);
        const isPinching = distance <= this.pinchThreshold || normalizedDistance <= this.pinchRatioThreshold;

        return {
            isPinching,
            distance,
            normalizedDistance,
            position: {
                x: ((thumbTip.x ?? 0) + (indexTip.x ?? 0)) / 2,
                y: ((thumbTip.y ?? 0) + (indexTip.y ?? 0)) / 2,
                z: (((thumbTip.z ?? 0) + (indexTip.z ?? 0)) / 2)
            }
        };
    }

    /**
     * Classifies hand landmarks into a geometric gesture.
     * @param {Array<{x: number, y: number, z?: number}>} landmarks - 21 normalized hand landmarks
     * @returns {{
     *   name: string,
     *   confidence: number,
     *   fingers: {
     *     thumb: { extended: boolean, tip: {x: number, y: number, z: number} },
     *     index: { extended: boolean, tip: {x: number, y: number, z: number} },
     *     middle: { extended: boolean, tip: {x: number, y: number, z: number} },
     *     ring: { extended: boolean, tip: {x: number, y: number, z: number} },
     *     pinky: { extended: boolean, tip: {x: number, y: number, z: number} }
     *   },
     *   pinch: { isPinching: boolean, distance: number, normalizedDistance: number, position: {x: number, y: number, z: number} },
     *   palmCenter: { x: number, y: number, z: number },
     *   palmScale: number
     * }}
     */
    classify(landmarks) {
        if (!landmarks || landmarks.length < 21) {
            return {
                name: GESTURES.NONE,
                confidence: 0,
                fingers: {
                    thumb: { extended: false, tip: { x: 0, y: 0, z: 0 } },
                    index: { extended: false, tip: { x: 0, y: 0, z: 0 } },
                    middle: { extended: false, tip: { x: 0, y: 0, z: 0 } },
                    ring: { extended: false, tip: { x: 0, y: 0, z: 0 } },
                    pinky: { extended: false, tip: { x: 0, y: 0, z: 0 } }
                },
                pinch: { isPinching: false, distance: 1.0, normalizedDistance: 1.0, position: { x: 0, y: 0, z: 0 } },
                palmCenter: { x: 0, y: 0, z: 0 },
                palmScale: 1.0
            };
        }

        const palmCenter = GestureDetector.getPalmCenter(landmarks);
        const palmScale = GestureDetector.getPalmScale(landmarks);

        const fingers = {
            thumb: {
                extended: this.isThumbExtended(landmarks),
                tip: landmarks[LANDMARKS.THUMB_TIP]
            },
            index: {
                extended: this.isFingerExtended(landmarks, 'index'),
                tip: landmarks[LANDMARKS.INDEX_TIP]
            },
            middle: {
                extended: this.isFingerExtended(landmarks, 'middle'),
                tip: landmarks[LANDMARKS.MIDDLE_TIP]
            },
            ring: {
                extended: this.isFingerExtended(landmarks, 'ring'),
                tip: landmarks[LANDMARKS.RING_TIP]
            },
            pinky: {
                extended: this.isFingerExtended(landmarks, 'pinky'),
                tip: landmarks[LANDMARKS.PINKY_TIP]
            }
        };

        const pinch = this.checkPinch(landmarks, palmScale);
        const isActivelyPinching = pinch.isPinching && (fingers.index.extended || fingers.thumb.extended);

        const allFourFingersCurled = !fingers.index.extended &&
            !fingers.middle.extended &&
            !fingers.ring.extended &&
            !fingers.pinky.extended;

        let name = GESTURES.NONE;
        let confidence = 0.0;

        // 1. All 4 main fingers curled -> Thumbs Up or Fist
        if (allFourFingersCurled) {
            if (this.isThumbsUp(landmarks, fingers)) {
                name = GESTURES.THUMBS_UP;
                confidence = 0.95;
            } else {
                name = GESTURES.FIST;
                confidence = 0.95;
            }
        }
        // 2. Pinch detection (thumb and index meet while actively engaging)
        else if (isActivelyPinching) {
            name = GESTURES.PINCH;
            confidence = Math.max(0.6, Math.min(1.0, 1.0 - (pinch.distance / (this.pinchThreshold * 1.5))));
        }
        // 3. Pointing (index extended only, middle/ring/pinky curled)
        else if (fingers.index.extended && !fingers.middle.extended && !fingers.ring.extended && !fingers.pinky.extended) {
            name = GESTURES.POINTING;
            confidence = 0.95;
        }
        // 4. Peace / Victory (index & middle extended, ring & pinky curled)
        else if (fingers.index.extended && fingers.middle.extended && !fingers.ring.extended && !fingers.pinky.extended) {
            name = GESTURES.PEACE;
            confidence = 0.95;
        }
        // 5. Open Palm (all 4 main fingers extended)
        else if (fingers.index.extended && fingers.middle.extended && fingers.ring.extended && fingers.pinky.extended) {
            name = GESTURES.OPEN_PALM;
            confidence = fingers.thumb.extended ? 0.98 : 0.90;
        }

        return {
            name,
            confidence,
            fingers,
            pinch,
            palmCenter,
            palmScale
        };
    }
}
