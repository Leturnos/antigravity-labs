export class VideoRecorder {
  constructor(canvas, audioReactor = null) {
    this.canvas = canvas;
    this.audioReactor = audioReactor;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
    this.recordInterval = null;
  }

  isSupported() {
    return typeof MediaRecorder !== 'undefined' && typeof this.canvas?.captureStream === 'function';
  }

  async record({ durationSeconds = 0, fps = 60, onProgress = null } = {}) {
    if (!this.isSupported()) {
      throw new Error('MediaRecorder or canvas.captureStream is not supported');
    }

    const stream = this.canvas.captureStream(fps);

    // If audio is playing and destination exists, add audio track
    if (this.audioReactor?.analyser && this.audioReactor.ctx) {
      try {
        const dest = this.audioReactor.ctx.createMediaStreamDestination();
        this.audioReactor.analyser.connect(dest);
        const audioTrack = dest.stream.getAudioTracks()[0];
        if (audioTrack) stream.addTrack(audioTrack);
      } catch (e) {
        console.warn('Could not attach audio track:', e);
      }
    }

    const mimeType = (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9'))
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    this.recordedChunks = [];
    this.mediaRecorder = new MediaRecorder(stream, { mimeType });

    this.mediaRecorder.ondataavailable = (e) => {
      const size = e?.data?.size ?? e?.data?.byteLength ?? e?.data?.length ?? 0;
      if (e?.data && size > 0) this.recordedChunks.push(e.data);
    };

    return new Promise((resolve, reject) => {
      this.mediaRecorder.onstop = () => {
        this.isRecording = false;
        const blob = new Blob(this.recordedChunks, { type: mimeType });
        resolve(blob);
      };

      this.mediaRecorder.onerror = (e) => {
        this.isRecording = false;
        reject(e);
      };

      this.isRecording = true;
      this.mediaRecorder.start(100);

      if (durationSeconds > 0) {
        let elapsed = 0;
        this.recordInterval = setInterval(() => {
          elapsed += 0.2;
          if (onProgress) onProgress(Math.min(1.0, elapsed / durationSeconds));
          if (elapsed >= durationSeconds) {
            clearInterval(this.recordInterval);
            this.recordInterval = null;
            if (this.isRecording) this.stop();
          }
        }, 200);
      }
    });
  }

  start(options = {}) {
    const durationSeconds = options.durationSeconds ?? options.duration ?? 0;
    return this.record({ ...options, durationSeconds });
  }

  stop() {
    if (this.recordInterval) {
      clearInterval(this.recordInterval);
      this.recordInterval = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.isRecording = false;
  }
}
