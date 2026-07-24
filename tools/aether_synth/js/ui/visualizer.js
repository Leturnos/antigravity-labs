/**
 * 60fps Neon CRT Oscilloscope Canvas Visualizer
 */

export class OscilloscopeVisualizer {
  constructor(canvas, analyser) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.analyser = analyser;
    this.bufferLength = analyser ? analyser.frequencyBinCount : 1024;
    this.dataArray = new Uint8Array(this.bufferLength);
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.draw();
  }

  stop() {
    this.isRunning = false;
  }

  draw() {
    if (!this.isRunning) return;
    requestAnimationFrame(() => this.draw());

    const width = this.canvas.width;
    const height = this.canvas.height;

    if (this.analyser) {
      this.analyser.getByteTimeDomainData(this.dataArray);
    }

    // Dark background with phosphor decay effect (subtle transparency)
    this.ctx.fillStyle = 'rgba(2, 3, 5, 0.25)';
    this.ctx.fillRect(0, 0, width, height);

    // Grid lines retro oscilloscope style
    this.drawGrid(width, height);

    // Neon waveform stroke
    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = '#38bdf8';
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = '#38bdf8';
    this.ctx.beginPath();

    const sliceWidth = width * 1.0 / this.bufferLength;
    let x = 0;

    for (let i = 0; i < this.bufferLength; i++) {
      const v = this.analyser ? (this.dataArray[i] / 128.0) : 1.0;
      const y = (v * height) / 2;

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    this.ctx.lineTo(width, height / 2);
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
  }

  drawGrid(w, h) {
    this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    
    // Horizontal and vertical grid lines
    for (let x = 0; x < w; x += 40) {
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += 30) {
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(w, y);
    }
    this.ctx.stroke();
  }
}
