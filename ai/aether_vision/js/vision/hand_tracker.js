/**
 * @file hand_tracker.js
 * @description MediaPipe Hands integration pipeline with Exponential Moving Average (EMA) smoothing and dual-hand tracking.
 */

import { GestureDetector } from './gesture_detector.js';

export class HandTracker {
    /**
     * @param {Object} [options={}]
     * @param {number} [options.maxNumHands=2] - Maximum hands to track simultaneously
     * @param {number} [options.modelComplexity=1] - MediaPipe model complexity (0=Lite, 1=Full)
     * @param {number} [options.minDetectionConfidence=0.5] - Detection confidence threshold
     * @param {number} [options.minTrackingConfidence=0.5] - Tracking confidence threshold
     * @param {number} [options.smoothingAlpha=0.6] - Exponential Moving Average (EMA) factor [0.01, 1.0]
     * @param {Function} [options.locateFile] - MediaPipe asset resolver
     * @param {Function} [options.Hands] - Custom MediaPipe Hands constructor
     * @param {GestureDetector} [options.gestureDetector] - Custom GestureDetector instance
     * @param {Object} [options.gestureOptions] - Options passed to GestureDetector
     */
    constructor(options = {}) {
        this.options = {
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
            smoothingAlpha: 0.6,
            mirrored: true,
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
            ...options
        };

        this.isMirrored = this.options.mirrored !== undefined ? !!this.options.mirrored : true;
        this.smoothingAlpha = Math.max(0.01, Math.min(1.0, this.options.smoothingAlpha));
        this.gestureDetector = options.gestureDetector ?? new GestureDetector(options.gestureOptions);
        this.handsInstance = null;
        this.isInitialized = false;
        this.onResultsCallback = null;

        // EMA smoothing cache per hand: Map<string, Array<{x: number, y: number, z: number}>>
        this.smoothedHands = new Map();
    }

    /**
     * Sets or toggles horizontal mirror inversion for landmark coordinates.
     * @param {boolean} mirrored
     */
    setMirrored(mirrored) {
        this.isMirrored = !!mirrored;
        this.smoothedHands.clear();
    }

    /**
     * Gets current mirror inversion state.
     * @returns {boolean}
     */
    getMirrored() {
        return this.isMirrored;
    }

    /**
     * Sets the Exponential Moving Average smoothing factor.
     * @param {number} alpha - Value between 0.01 (heavy smoothing) and 1.0 (no smoothing/raw)
     */
    setSmoothingAlpha(alpha) {
        if (typeof alpha !== 'number' || isNaN(alpha)) return;
        this.smoothingAlpha = Math.max(0.01, Math.min(1.0, alpha));
    }

    /**
     * Gets current smoothing alpha factor.
     * @returns {number}
     */
    getSmoothingAlpha() {
        return this.smoothingAlpha;
    }

    /**
     * Applies Exponential Moving Average (EMA) filter to 21 hand landmarks.
     * @param {number} handIndex
     * @param {string} handednessLabel
     * @param {Array<{x: number, y: number, z?: number}>} screenLandmarks
     * @returns {Array<{x: number, y: number, z: number}>}
     */
    applySmoothing(handIndex, handednessLabel, screenLandmarks) {
        if (!screenLandmarks || !Array.isArray(screenLandmarks)) {
            return [];
        }

        const handKey = handednessLabel ? `${handednessLabel}_${handIndex}` : `hand_${handIndex}`;
        const prevLandmarks = this.smoothedHands.get(handKey);

        if (!prevLandmarks || prevLandmarks.length !== screenLandmarks.length || this.smoothingAlpha >= 1.0) {
            // Clone initial / raw frame
            const initial = screenLandmarks.map((pt) => ({
                x: pt.x,
                y: pt.y,
                z: pt.z ?? 0
            }));
            this.smoothedHands.set(handKey, initial);
            return initial;
        }

        const alpha = this.smoothingAlpha;
        const oneMinusAlpha = 1.0 - alpha;

        const smoothed = screenLandmarks.map((curr, idx) => {
            const prev = prevLandmarks[idx];
            return {
                x: alpha * curr.x + oneMinusAlpha * prev.x,
                y: alpha * curr.y + oneMinusAlpha * prev.y,
                z: alpha * (curr.z ?? 0) + oneMinusAlpha * (prev.z ?? 0)
            };
        });

        this.smoothedHands.set(handKey, smoothed);
        return smoothed;
    }

    /**
     * Processes MediaPipe results callback: smooths landmarks and detects geometric gestures.
     * @param {Object} results - MediaPipe Hands output object
     * @returns {{
     *   hands: Array<{
     *     index: number,
     *     handedness: string,
     *     score: number,
     *     landmarks: Array<{x: number, y: number, z: number}>,
     *     rawLandmarks: Array<{x: number, y: number, z?: number}>,
     *     gesture: Object,
     *     pinch: Object,
     *     palmCenter: {x: number, y: number, z: number},
     *     palmScale: number
     *   }>,
     *   timestamp: number,
     *   rawResults: Object
     * }}
     */
    processResults(results) {
        const hands = [];
        const rawLandmarksList = results?.multiHandLandmarks || [];
        const handednessList = results?.multiHandedness || [];

        if (rawLandmarksList.length === 0) {
            this.smoothedHands.clear();
        }

        const activeKeys = new Set();

        for (let i = 0; i < rawLandmarksList.length; i++) {
            const rawLms = rawLandmarksList[i];
            const handednessInfo = handednessList[i];
            
            // MediaPipe Hands detects handedness from the observer's perspective of an un-mirrored selfie stream.
            // For a user facing their webcam, their physical Right hand appears on camera left and is labeled 'Left'.
            // Therefore, we map to the user's actual physical hand:
            const rawLabel = handednessInfo?.label || (i === 0 ? 'Left' : 'Right');
            const handedness = (rawLabel === 'Left') ? 'Right' : 'Left';
            const score = handednessInfo?.score ?? 1.0;
            const handKey = `${handedness}_${i}`;
            activeKeys.add(handKey);

            // Transform raw landmarks to screen coordinates based on mirror mode
            const screenLms = rawLms.map((pt) => ({
                x: this.isMirrored ? (1.0 - pt.x) : pt.x,
                y: pt.y,
                z: pt.z ?? 0
            }));

            // 1. Exponential Smoothing on screen coordinates
            const smoothedLms = this.applySmoothing(i, handedness, screenLms);

            // 2. Gesture Detection on smoothed landmarks
            const gestureResult = this.gestureDetector.classify(smoothedLms);

            hands.push({
                index: i,
                handedness,
                score,
                landmarks: smoothedLms,
                rawLandmarks: screenLms,
                gesture: gestureResult,
                pinch: gestureResult.pinch,
                palmCenter: gestureResult.palmCenter,
                palmScale: gestureResult.palmScale
            });
        }

        // Clean up stale smoothed keys
        for (const key of this.smoothedHands.keys()) {
            if (!activeKeys.has(key)) {
                this.smoothedHands.delete(key);
            }
        }

        return {
            hands,
            timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
            rawResults: results
        };
    }

    /**
     * Initializes MediaPipe Hands and connects the results pipeline.
     * @param {HTMLVideoElement} videoEl
     * @param {Function} onResults - Callback receiving processed results
     * @returns {Promise<HandTracker>}
     */
    async init(videoEl, onResults) {
        this.onResultsCallback = onResults;

        const HandsClass = this.options.Hands ||
            (typeof window !== 'undefined' ? window.Hands : null) ||
            (typeof globalThis !== 'undefined' ? globalThis.Hands : null);

        if (!HandsClass) {
            throw new Error('MediaPipe Hands library is not loaded. Ensure window.Hands is available or pass Hands in options.');
        }

        this.handsInstance = new HandsClass({
            locateFile: this.options.locateFile
        });

        this.handsInstance.setOptions({
            maxNumHands: this.options.maxNumHands ?? 2,
            modelComplexity: this.options.modelComplexity ?? 1,
            minDetectionConfidence: this.options.minDetectionConfidence ?? 0.5,
            minTrackingConfidence: this.options.minTrackingConfidence ?? 0.5
        });

        this.handsInstance.onResults((results) => {
            const processed = this.processResults(results);
            if (this.onResultsCallback) {
                this.onResultsCallback(processed);
            }
        });

        this.isInitialized = true;
        return this;
    }

    /**
     * Sends a video frame to MediaPipe for inference.
     * @param {HTMLVideoElement|Object} videoEl
     * @returns {Promise<void>}
     */
    async sendFrame(videoEl) {
        if (!this.handsInstance) {
            throw new Error('HandTracker is not initialized. Call init() first.');
        }
        if (!videoEl) {
            throw new Error('Video element is required for sendFrame()');
        }
        return await this.handsInstance.send({ image: videoEl });
    }

    /**
     * Resets smoothing cache.
     */
    reset() {
        this.smoothedHands.clear();
    }

    /**
     * Closes MediaPipe instance and cleans up resources.
     */
    destroy() {
        if (this.handsInstance && typeof this.handsInstance.close === 'function') {
            this.handsInstance.close();
        }
        this.handsInstance = null;
        this.isInitialized = false;
        this.onResultsCallback = null;
        this.smoothedHands.clear();
    }
}
