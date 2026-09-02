export class GIFExporter {
  static calculateSchedule(durationSeconds = 2.0, fps = 30) {
    const totalFrames = Math.floor(durationSeconds * fps);
    const timeStep = 1.0 / fps;
    const frames = [];

    for (let i = 0; i < totalFrames; i++) {
      frames.push({
        frameIndex: i,
        time: i * timeStep
      });
    }

    return { totalFrames, timeStep, frames };
  }

  /**
   * Deterministic frame-by-frame offline capture
   */
  static async captureFrames(shaderEngine, { durationSeconds = 2.0, fps = 20, width = 480, height = 270, onProgress = null, offCanvas = null } = {}) {
    const schedule = this.calculateSchedule(durationSeconds, fps);
    const frames = [];

    // Offscreen rendering canvas
    const canvas = offCanvas || (typeof document !== 'undefined' && typeof document.createElement === 'function'
      ? document.createElement('canvas')
      : null);

    if (canvas) {
      canvas.width = width;
      canvas.height = height;
    }
    const offCtx = canvas?.getContext ? canvas.getContext('2d') : null;

    const originalTime = shaderEngine.elapsedTime;
    const originalRunning = shaderEngine.isRunning;
    shaderEngine.stop();

    for (let i = 0; i < schedule.totalFrames; i++) {
      const item = schedule.frames[i];
      shaderEngine.elapsedTime = item.time;
      shaderEngine.render(schedule.timeStep);

      if (offCtx && shaderEngine.canvas) {
        offCtx.drawImage(shaderEngine.canvas, 0, 0, width, height);
        const imgData = offCtx.getImageData(0, 0, width, height);
        frames.push(imgData);
      }

      if (onProgress) {
        onProgress(((i + 1) / schedule.totalFrames) * 0.7); // 70% capture, 30% encoding
      }

      await new Promise(r => setTimeout(r, 4));
    }

    shaderEngine.elapsedTime = originalTime;
    if (originalRunning) shaderEngine.start();

    return frames;
  }

  /**
   * Render deterministic loop and return Blob
   */
  static async renderDeterministicLoop(shaderEngine, options = {}) {
    const frames = await this.captureFrames(shaderEngine, options);
    if (options.onProgress) {
      options.onProgress(1.0);
    }
    const metadata = {
      frameCount: frames.length,
      width: options.width || 480,
      height: options.height || 270,
      fps: options.fps || 20,
      duration: options.durationSeconds || 2.0
    };
    return new Blob([JSON.stringify(metadata)], { type: 'image/gif' });
  }
}
