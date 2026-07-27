/**
 * 60fps Neon CRT Canvas Visualizer (Oscilloscope & FFT Spectrum Multimode)
 */

export class OscilloscopeVisualizer {
  constructor(canvas, analyser) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.analyser = analyser;
    this.bufferLength = analyser ? analyser.frequencyBinCount : 1024;
    this.dataArray = new Uint8Array(this.bufferLength);
    this.freqArray = new Uint8Array(64);
    this.peaksArray = new Float32Array(64);
    this.mode = 'oscilloscope'; // 'oscilloscope' or 'spectrum'
    this.isRunning = false;
  }

  setMode(mode) {
    this.mode = mode;
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

    // Dark background with phosphor decay effect
    this.ctx.fillStyle = 'rgba(2, 3, 5, 0.25)';
    this.ctx.fillRect(0, 0, width, height);

    this.drawGrid(width, height);

    if (this.mode === 'spectrum') {
      this.drawSpectrum(width, height);
    } else {
      this.drawOscilloscope(width, height);
    }
  }

  drawOscilloscope(width, height) {
    if (this.analyser) {
      this.analyser.getByteTimeDomainData(this.dataArray);
    }

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

  drawSpectrum(width, height) {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.freqArray);
    }

    const numBars = 64;
    const barWidth = (width / numBars) - 2;

    for (let i = 0; i < numBars; i++) {
      const val = this.analyser ? this.freqArray[i] : 0;
      const barHeight = (val / 255.0) * (height - 20);

      // Peak retention decay calculation
      this.peaksArray[i] = Math.max(barHeight, this.peaksArray[i] * 0.95);

      const x = i * (barWidth + 2);
      const y = height - barHeight;

      // Draw neon bar
      this.ctx.fillStyle = '#8b5cf6';
      this.ctx.fillRect(x, y, barWidth, barHeight);

      // Draw peak indicator line
      this.ctx.fillStyle = '#38bdf8';
      this.ctx.fillRect(x, height - this.peaksArray[i] - 2, barWidth, 2);
    }
  }

  drawGrid(w, h) {
    this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    
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
