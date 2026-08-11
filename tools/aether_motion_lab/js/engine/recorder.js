/**
 * Aether Motion Lab — High-Resolution Export Pipeline & WebM Video Recorder
 * Supports 4K Ultra HD PNG Snapshots and 60 FPS WebM MediaRecorder Loops.
 */

export class ExportRecorder {
  constructor(canvas) {
    this.canvas = canvas;
    this.isRecording = false;
  }

  exportSnapshot4K(width, height, bgColor = '#050508') {
    const offscreen = document.createElement('canvas');
    const targetW = 3840;
    const targetH = 2160;

    offscreen.width = targetW;
    offscreen.height = targetH;
    const offCtx = offscreen.getContext('2d');

    // Fill background
    offCtx.fillStyle = bgColor;
    offCtx.fillRect(0, 0, targetW, targetH);

    // Draw main canvas scaled to 4K
    offCtx.drawImage(this.canvas, 0, 0, targetW, targetH);

    // Trigger download
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const link = document.createElement('a');
    link.download = `aether-motion-lab-4k-${timestamp}.png`;
    link.href = offscreen.toDataURL('image/png');
    link.click();
  }

  recordWebM(durationSeconds = 5, onStart = null, onProgress = null, onComplete = null) {
    if (this.isRecording) return;
    this.isRecording = true;

    const stream = this.canvas.captureStream(60);
    const options = { mimeType: 'video/webm;codecs=vp9' };
    let mediaRecorder;

    try {
      mediaRecorder = new MediaRecorder(stream, options);
    } catch (e) {
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    }

    const chunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      this.isRecording = false;
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      const link = document.createElement('a');
      link.download = `aether-motion-lab-loop-${timestamp}.webm`;
      link.href = url;
      link.click();

      if (onComplete) onComplete();
    };

    mediaRecorder.start();
    if (onStart) onStart();

    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed++;
      if (onProgress) onProgress(elapsed, durationSeconds);

      if (elapsed >= durationSeconds) {
        clearInterval(interval);
        mediaRecorder.stop();
      }
    }, 1000);
  }
}
