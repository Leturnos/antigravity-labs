/**
 * Aether Logic Lab - Canvas 2D World Transform & Schematics Renderer
 */

import { SignalState, getSignalColor } from './types.js';
import { COMPONENT_DEFINITIONS } from './components.js';

export class Renderer {
  constructor(canvas, circuit, simulator) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.circuit = circuit;
    this.simulator = simulator;

    // Camera transform
    this.panX = 100;
    this.panY = 100;
    this.zoom = 1.0;
    this.minZoom = 0.3;
    this.maxZoom = 2.5;

    this.gridSize = 20;
    this.pulseOffset = 0;

    // Interaction highlights
    this.hoveredPin = null;
    this.hoveredComponent = null;
    this.activeWireStart = null; // { compId, pinId, x, y }
    this.currentMouseWorld = { x: 0, y: 0 };
    this.selectionBox = null; // { x1, y1, x2, y2 }
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

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.panX) / this.zoom,
      y: (sy - this.panY) / this.zoom
    };
  }

  worldToScreen(wx, wy) {
    return {
      x: wx * this.zoom + this.panX,
      y: wy * this.zoom + this.panY
    };
  }

  render(now = 0) {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Draw background
    ctx.fillStyle = '#080a10';
    ctx.fillRect(0, 0, this.width, this.height);

    // 2. Apply Camera Transform
    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    // 3. Grid dots
    this.drawGrid(ctx);

    // 4. Draw wires
    this.pulseOffset = (now * 0.04) % 24;
    this.drawWires(ctx);

    // 5. Draw interactive wire under creation
    if (this.activeWireStart) {
      this.drawTempWire(ctx);
    }

    // 6. Draw components
    this.drawComponents(ctx);

    // 7. Draw selection box
    if (this.selectionBox) {
      this.drawSelectionBox(ctx);
    }

    ctx.restore();
    ctx.restore();
  }

  drawGrid(ctx) {
    const startX = Math.floor(-this.panX / this.zoom / this.gridSize) * this.gridSize;
    const endX = startX + (this.width / this.zoom) + this.gridSize * 2;
    const startY = Math.floor(-this.panY / this.zoom / this.gridSize) * this.gridSize;
    const endY = startY + (this.height / this.zoom) + this.gridSize * 2;

    ctx.fillStyle = '#172033';
    for (let x = startX; x <= endX; x += this.gridSize) {
      for (let y = startY; y <= endY; y += this.gridSize) {
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }
  }

  drawWires(ctx) {
    for (const wire of this.circuit.wires) {
      const isSelected = this.circuit.selectedWireIds.has(wire.id);
      const p1 = this.circuit.getPinAbsolutePos(wire.fromCompId, wire.fromPinId);
      const p2 = this.circuit.getPinAbsolutePos(wire.toCompId, wire.toPinId);
      if (!p1 || !p2) continue;

      const isHigh = wire.state === SignalState.HIGH;
      const isError = wire.state === SignalState.ERROR;
      const color = isSelected ? '#a855f7' : getSignalColor(wire.state);

      const midX = (p1.x + p2.x) / 2;

      // Base wire path
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(midX, p1.y);
      ctx.lineTo(midX, p2.y);
      ctx.lineTo(p2.x, p2.y);

      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 3.5 : (isHigh ? 2.5 : 2);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      if (isHigh) {
        ctx.shadowColor = '#00f3ff';
        ctx.shadowBlur = 6;
      } else if (isError) {
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 8;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Animated current particles for active HIGH signals
      if (isHigh && !isSelected) {
        ctx.save();
        ctx.setLineDash([4, 16]);
        ctx.lineDashOffset = -this.pulseOffset;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  drawTempWire(ctx) {
    const p1 = this.activeWireStart;
    const p2 = this.hoveredPin ? { x: this.hoveredPin.x, y: this.hoveredPin.y } : this.currentMouseWorld;
    const midX = (p1.x + p2.x) / 2;

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(midX, p1.y);
    ctx.lineTo(midX, p2.y);
    ctx.lineTo(p2.x, p2.y);

    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawComponents(ctx) {
    for (const comp of this.circuit.components.values()) {
      const isSelected = this.circuit.selectedComponentIds.has(comp.id);
      const def = COMPONENT_DEFINITIONS[comp.type];
      if (!def) continue;

      ctx.save();
      ctx.translate(comp.x, comp.y);

      // Render custom component graphics
      def.draw(ctx, comp, isSelected, comp.inputStates);

      // Render pins
      this.drawComponentPins(ctx, comp, def);

      ctx.restore();
    }
  }

  drawComponentPins(ctx, comp, def) {
    const allPins = [...def.inputs, ...def.outputs];

    allPins.forEach(p => {
      const isHovered = this.hoveredPin && this.hoveredPin.compId === comp.id && this.hoveredPin.pinId === p.id;
      const state = p.isOutput ? (comp.outputStates[p.id] ?? SignalState.LOW) : (comp.inputStates[p.id] ?? SignalState.LOW);
      const isHigh = state === SignalState.HIGH;

      // Check if this pin is probed by oscilloscope
      const isProbed = this.circuit.probedPins.some(pr => pr.compId === comp.id && pr.pinId === p.id);

      ctx.beginPath();
      ctx.arc(p.x, p.y, isHovered ? 6 : 4, 0, Math.PI * 2);

      if (isHigh) {
        ctx.fillStyle = '#00f3ff';
        ctx.shadowColor = '#00f3ff';
        ctx.shadowBlur = 6;
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      if (isHovered) {
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (isProbed) {
        ctx.strokeStyle = '#ec4899';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Pin label if not a single-gate pin
      if (p.label && comp.width > 50) {
        ctx.fillStyle = '#64748b';
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.textAlign = p.isOutput ? 'right' : 'left';
        ctx.textBaseline = 'middle';
        const lx = p.isOutput ? p.x - 7 : p.x + 7;
        ctx.fillText(p.label, lx, p.y);
      }
    });
  }

  drawSelectionBox(ctx) {
    const sb = this.selectionBox;
    const x = Math.min(sb.x1, sb.x2);
    const y = Math.min(sb.y1, sb.y2);
    const w = Math.abs(sb.x2 - sb.x1);
    const h = Math.abs(sb.y2 - sb.y1);

    ctx.fillStyle = 'rgba(0, 243, 255, 0.08)';
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }
}
