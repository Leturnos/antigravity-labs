/**
 * Aether Vision Sandbox - Camera Stream Manager
 * 
 * Manages WebRTC video stream acquisition, video element lifecycle,
 * mirror transforms, resolution negotiation, and stream termination.
 */

export class CameraManager {
    /**
     * @param {object} [defaultOptions={}] - Default camera configuration
     */
    constructor(defaultOptions = {}) {
        /** @type {HTMLVideoElement|null} */
        this.videoElement = null;

        /** @type {MediaStream|null} */
        this.stream = null;

        /** @type {boolean} */
        this.isActive = false;

        /** @type {boolean} */
        this.isMirrored = defaultOptions.mirrored !== undefined ? !!defaultOptions.mirrored : true;

        /** @type {object} */
        this.options = {
            width: 1280,
            height: 720,
            facingMode: 'user',
            mirrored: true,
            frameRate: { ideal: 60, min: 30 },
            ...defaultOptions
        };
    }

    /**
     * Initializes camera video stream and binds to the specified HTMLVideoElement.
     * 
     * @param {HTMLVideoElement|string} videoTarget - Video element or query selector string
     * @param {object} [options={}] - Custom constraints and configuration overrides
     * @returns {Promise<{ video: HTMLVideoElement, stream: MediaStream, width: number, height: number }>}
     */
    async init(videoTarget, options = {}) {
        // Stop any currently running stream before re-initializing
        if (this.isActive) {
            this.stop();
        }

        // Resolve video element target
        if (typeof videoTarget === 'string') {
            if (typeof document !== 'undefined' && document.querySelector) {
                this.videoElement = document.querySelector(videoTarget);
            }
        } else if (videoTarget && typeof videoTarget === 'object') {
            this.videoElement = videoTarget;
        }

        if (!this.videoElement) {
            throw new Error('CameraManager: A valid HTMLVideoElement must be provided.');
        }

        const mergedOpts = { ...this.options, ...options };
        this.isMirrored = mergedOpts.mirrored !== undefined ? !!mergedOpts.mirrored : this.isMirrored;

        // Verify mediaDevices support
        if (!navigator || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
            throw new Error('CameraManager: WebRTC navigator.mediaDevices.getUserMedia is not supported on this platform.');
        }

        // Configure video element attributes for seamless autoplay across modern browsers (iOS/Safari/Chrome)
        this.videoElement.autoplay = true;
        this.videoElement.playsInline = true;
        this.videoElement.muted = true;

        // Apply mirror CSS transform
        this.applyMirrorTransform();

        // Attempt stream acquisition with progressive fallback
        try {
            const constraints = {
                video: {
                    width: { ideal: mergedOpts.width || 1280 },
                    height: { ideal: mergedOpts.height || 720 },
                    facingMode: mergedOpts.facingMode || 'user',
                    frameRate: mergedOpts.frameRate || { ideal: 60, min: 30 }
                },
                audio: false
            };
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (initialErr) {
            console.warn('CameraManager: Primary constraints failed, attempting fallback constraints:', initialErr);
            try {
                this.stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: mergedOpts.facingMode || 'user' },
                    audio: false
                });
            } catch (fallbackErr) {
                console.warn('CameraManager: Secondary constraints failed, attempting simple video: true:', fallbackErr);
                this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            }
        }

        this.videoElement.srcObject = this.stream;

        // Wait for video metadata to load and start playback
        await new Promise((resolve) => {
            if (this.videoElement.videoWidth > 0 && this.videoElement.videoHeight > 0) {
                return resolve();
            }

            const onLoaded = () => {
                if (this.videoElement.removeEventListener) {
                    this.videoElement.removeEventListener('loadedmetadata', onLoaded);
                }
                resolve();
            };

            if (this.videoElement.addEventListener) {
                this.videoElement.addEventListener('loadedmetadata', onLoaded, { once: true });
            } else {
                this.videoElement.onloadedmetadata = onLoaded;
            }

            // Fallback timeout in case event is missed
            setTimeout(resolve, 500);
        });

        // Trigger playback
        try {
            const playPromise = this.videoElement.play();
            if (playPromise && typeof playPromise.then === 'function') {
                await playPromise;
            }
        } catch (playErr) {
            console.warn('CameraManager: video.play() auto-play warning:', playErr);
        }

        this.isActive = true;

        return {
            video: this.videoElement,
            stream: this.stream,
            width: this.videoElement.videoWidth || mergedOpts.width || 1280,
            height: this.videoElement.videoHeight || mergedOpts.height || 720
        };
    }

    /**
     * Toggles or sets the mirror inversion (horizontal flip) state of the camera.
     * @param {boolean} [forceValue] - If provided, sets mirror to this explicit boolean
     * @returns {boolean} New mirror state
     */
    toggleMirror(forceValue) {
        this.isMirrored = forceValue !== undefined ? !!forceValue : !this.isMirrored;
        this.applyMirrorTransform();
        return this.isMirrored;
    }

    /**
     * Applies the appropriate CSS transform for horizontal mirroring.
     * @private
     */
    applyMirrorTransform() {
        if (!this.videoElement || !this.videoElement.style) return;
        this.videoElement.style.transform = this.isMirrored ? 'scaleX(-1)' : 'none';
    }

    /**
     * Stops the active media stream and releases camera hardware locks.
     */
    stop() {
        if (this.stream) {
            const tracks = this.stream.getTracks ? this.stream.getTracks() : [];
            for (const track of tracks) {
                if (track && typeof track.stop === 'function') {
                    track.stop();
                }
            }
            this.stream = null;
        }

        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }

        this.isActive = false;
    }

    /**
     * Returns the active video element dimensions.
     * @returns {{ width: number, height: number }}
     */
    getDimensions() {
        return {
            width: this.videoElement?.videoWidth || 0,
            height: this.videoElement?.videoHeight || 0
        };
    }

    /**
     * Returns the active MediaStream object.
     * @returns {MediaStream|null}
     */
    getStream() {
        return this.stream;
    }

    /**
     * Returns the bound HTMLVideoElement.
     * @returns {HTMLVideoElement|null}
     */
    getVideoElement() {
        return this.videoElement;
    }

    /**
     * Returns whether the camera stream is actively producing frames.
     * @returns {boolean}
     */
    isStreamActive() {
        return this.isActive && !!this.stream && !!this.videoElement && !this.videoElement.paused;
    }
}
