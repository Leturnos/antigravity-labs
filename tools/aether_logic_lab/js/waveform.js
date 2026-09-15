/**
 * Aether Logic Lab - Multichannel Digital Logic Analyzer & Waveform Visualizer
 */

import { SignalState } from './types.js';

export class WaveformAnalyzer {
  constructor(canvas, circuit, simulator) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.circuit = circuit;
    this.simulator = simulator;
    this.channelHeight = 36;
    this.timeScale = 1.2; // pixels per millisecond/sample
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = rect.height;
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const probes = this.circuit.probedPins;
    if (probes.length === 0) {
      ctx.fillStyle = '#475569';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Nenhuma sonda conectada. Clique com botão direito em qualquer pino ou use "Adicionar Sonda" para monitorar formas de onda.', this.width / 2, this.height / 2);
      return;
    }

    const labelWidth = 120;
    const graphWidth = this.width - labelWidth;

    // Draw time grid
    ctx.strokeStyle = '#172033';
    ctx.lineWidth = 1;
    for (let x = labelWidth; x < this.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }

    // Draw channels
    probes.forEach((probe, idx) => {
      const topY = idx * this.channelHeight + 8;
      const botY = topY + this.channelHeight - 12;
      const key = `${probe.compId}_${probe.pinId}`;
      const samples = this.simulator.waveformHistory.get(key) || [];

      // Channel background separator
      ctx.fillStyle = idx % 2 === 0 ? 'rgba(15, 23, 42, 0.4)' : 'rgba(11, 15, 25, 0.4)';
      ctx.fillRect(0, topY - 4, this.width, this.channelHeight);

      // Channel label
      ctx.fillStyle = probe.color || '#00f3ff';
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(probe.label, 12, topY + 16);

      // Channel baseline guide
      ctx.strokeStyle = '#1e293b';
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(labelWidth, botY);
      ctx.lineTo(this.width, botY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw digital trace
      if (samples.length > 1) {
        ctx.strokeStyle = probe.color || '#00f3ff';
        ctx.lineWidth = 2;
        ctx.shadowColor = probe.color || '#00f3ff';
        ctx.shadowBlur = 4;
        ctx.beginPath();

        const stepX = graphWidth / this.simulator.maxWaveformSamples;

        for (let i = 0; i < samples.length; i++) {
          const sample = samples[i];
          const x = labelWidth + i * stepX;
          const y = (sample.val === SignalState.HIGH) ? topY + 4 : botY;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            const prevSample = samples[i - 1];
            const prevY = (prevSample.val === SignalState.HIGH) ? topY + 4 : botY;
            // Draw vertical step on transition
            if (prevY !== y) {
              ctx.lineTo(x, prevY);
            }
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    });
  }
}
