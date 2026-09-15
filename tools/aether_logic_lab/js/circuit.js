/**
 * Aether Logic Lab - Circuit Model, Graph & Undo/Redo Management
 */

import { SignalState } from './types.js';
import { COMPONENT_DEFINITIONS } from './components.js';

export class Circuit {
  constructor() {
    this.components = new Map(); // id -> compInstance
    this.wires = []; // Array of wire objects
    this.selectedComponentIds = new Set();
    this.selectedWireIds = new Set();
    this.probedPins = []; // Array of { compId, pinId, label, color }

    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 40;

    this.idCounter = 1;
    this.saveHistoryState();
  }

  generateId(prefix = 'comp') {
    return `${prefix}_${Date.now().toString(36)}_${(this.idCounter++).toString(36)}`;
  }

  addComponent(type, x, y, props = {}) {
    const def = COMPONENT_DEFINITIONS[type];
    if (!def) {
      console.error(`Component definition not found for type: ${type}`);
      return null;
    }

    const id = this.generateId('c');
    const instance = {
      id,
      type,
      x: Math.round(x / 10) * 10, // snap to grid
      y: Math.round(y / 10) * 10,
      width: def.width,
      height: def.height,
      props: { ...def.defaultProps, ...props },
      inputs: JSON.parse(JSON.stringify(def.inputs)),
      outputs: JSON.parse(JSON.stringify(def.outputs)),
      inputStates: {},
      outputStates: {}
    };

    // Initialize pin states to LOW or default
    instance.inputs.forEach(p => instance.inputStates[p.id] = SignalState.LOW);
    instance.outputs.forEach(p => instance.outputStates[p.id] = SignalState.LOW);

    this.components.set(id, instance);
    this.saveHistoryState();
    return instance;
  }

  removeComponent(id) {
    if (!this.components.has(id)) return false;

    // Remove connected wires
    this.wires = this.wires.filter(w => w.fromCompId !== id && w.toCompId !== id);

    // Remove any probes on this component
    this.probedPins = this.probedPins.filter(p => p.compId !== id);

    this.components.delete(id);
    this.selectedComponentIds.delete(id);
    this.saveHistoryState();
    return true;
  }

  addWire(fromCompId, fromPinId, toCompId, toPinId) {
    // Avoid self-connecting to same pin
    if (fromCompId === toCompId && fromPinId === toPinId) return null;

    // Check if wire already exists
    const exists = this.wires.some(w => 
      w.fromCompId === fromCompId && w.fromPinId === fromPinId &&
      w.toCompId === toCompId && w.toPinId === toPinId
    );
    if (exists) return null;

    // Verify pins exist
    const fromComp = this.components.get(fromCompId);
    const toComp = this.components.get(toCompId);
    if (!fromComp || !toComp) return null;

    const fromDef = COMPONENT_DEFINITIONS[fromComp.type];
    const toDef = COMPONENT_DEFINITIONS[toComp.type];
    if (!fromDef || !toDef) return null;

    const fromPin = fromDef.outputs.find(p => p.id === fromPinId) || fromDef.inputs.find(p => p.id === fromPinId);
    const toPin = toDef.inputs.find(p => p.id === toPinId) || toDef.outputs.find(p => p.id === toPinId);
    if (!fromPin || !toPin) return null;

    // Standard direction: from Output to Input
    let srcCompId = fromCompId;
    let srcPinId = fromPinId;
    let dstCompId = toCompId;
    let dstPinId = toPinId;

    if (!fromPin.isOutput && toPin.isOutput) {
      // Swap so src is the output
      srcCompId = toCompId;
      srcPinId = toPinId;
      dstCompId = fromCompId;
      dstPinId = fromPinId;
    }

    const wire = {
      id: this.generateId('w'),
      fromCompId: srcCompId,
      fromPinId: srcPinId,
      toCompId: dstCompId,
      toPinId: dstPinId,
      state: SignalState.LOW
    };

    this.wires.push(wire);
    this.saveHistoryState();
    return wire;
  }

  removeWire(wireId) {
    const initialLen = this.wires.length;
    this.wires = this.wires.filter(w => w.id !== wireId);
    this.selectedWireIds.delete(wireId);
    if (this.wires.length !== initialLen) {
      this.saveHistoryState();
      return true;
    }
    return false;
  }

  getPinAbsolutePos(compId, pinId) {
    const comp = this.components.get(compId);
    if (!comp) return null;
    const def = COMPONENT_DEFINITIONS[comp.type];
    if (!def) return null;

    const pin = [...def.inputs, ...def.outputs].find(p => p.id === pinId);
    if (!pin) return null;

    return {
      x: comp.x + pin.x,
      y: comp.y + pin.y,
      isOutput: pin.isOutput,
      label: pin.label
    };
  }

  findPinAt(worldX, worldY, radius = 12) {
    for (const comp of this.components.values()) {
      const def = COMPONENT_DEFINITIONS[comp.type];
      if (!def) continue;

      const allPins = [...def.inputs, ...def.outputs];
      for (const p of allPins) {
        const px = comp.x + p.x;
        const py = comp.y + p.y;
        const distSq = (worldX - px) ** 2 + (worldY - py) ** 2;
        if (distSq <= radius ** 2) {
          return {
            compId: comp.id,
            pinId: p.id,
            isOutput: p.isOutput,
            label: p.label,
            x: px,
            y: py
          };
        }
      }
    }
    return null;
  }

  findComponentAt(worldX, worldY) {
    // Reverse search so top-most component is selected
    const comps = Array.from(this.components.values()).reverse();
    for (const comp of comps) {
      if (worldX >= comp.x && worldX <= comp.x + comp.width &&
          worldY >= comp.y && worldY <= comp.y + comp.height) {
        return comp;
      }
    }
    return null;
  }

  findWireAt(worldX, worldY, tolerance = 6) {
    for (const wire of this.wires) {
      const p1 = this.getPinAbsolutePos(wire.fromCompId, wire.fromPinId);
      const p2 = this.getPinAbsolutePos(wire.toCompId, wire.toPinId);
      if (!p1 || !p2) continue;

      // Distance to orthogonal line segments
      const midX = (p1.x + p2.x) / 2;
      const d1 = distToSegment(worldX, worldY, p1.x, p1.y, midX, p1.y);
      const d2 = distToSegment(worldX, worldY, midX, p1.y, midX, p2.y);
      const d3 = distToSegment(worldX, worldY, midX, p2.y, p2.x, p2.y);

      if (Math.min(d1, d2, d3) <= tolerance) {
        return wire;
      }
    }
    return null;
  }

  toggleProbe(compId, pinId) {
    const existingIdx = this.probedPins.findIndex(p => p.compId === compId && p.pinId === pinId);
    if (existingIdx >= 0) {
      this.probedPins.splice(existingIdx, 1);
      return false; // Removed
    } else {
      const comp = this.components.get(compId);
      const def = COMPONENT_DEFINITIONS[comp?.type];
      const pin = [...(def?.inputs || []), ...(def?.outputs || [])].find(p => p.id === pinId);
      const label = `${comp?.props?.label || def?.name || 'Pin'}.${pin?.label || pinId}`;
      
      const colors = ['#00f3ff', '#a855f7', '#10b981', '#f59e0b', '#ec4899', '#38bdf8'];
      const color = colors[this.probedPins.length % colors.length];

      this.probedPins.push({ compId, pinId, label, color });
      return true; // Added
    }
  }

  saveHistoryState() {
    const snapshot = this.serialize();
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = []; // Clear redo on new action
  }

  undo() {
    if (this.undoStack.length <= 1) return false;
    const current = this.undoStack.pop();
    this.redoStack.push(current);
    const previous = this.undoStack[this.undoStack.length - 1];
    this.deserialize(previous, false);
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    const next = this.redoStack.pop();
    this.undoStack.push(next);
    this.deserialize(next, false);
    return true;
  }

  serialize() {
    return {
      version: '1.0',
      timestamp: Date.now(),
      components: Array.from(this.components.values()).map(c => ({
        id: c.id,
        type: c.type,
        x: c.x,
        y: c.y,
        props: { ...c.props }
      })),
      wires: this.wires.map(w => ({
        id: w.id,
        fromCompId: w.fromCompId,
        fromPinId: w.fromPinId,
        toCompId: w.toCompId,
        toPinId: w.toPinId
      })),
      probedPins: [...this.probedPins]
    };
  }

  deserialize(data, recordHistory = true) {
    if (!data || !Array.isArray(data.components)) return false;

    this.components.clear();
    this.wires = [];
    this.selectedComponentIds.clear();
    this.selectedWireIds.clear();
    this.probedPins = data.probedPins || [];

    data.components.forEach(item => {
      const def = COMPONENT_DEFINITIONS[item.type];
      if (!def) return;
      const instance = {
        id: item.id,
        type: item.type,
        x: item.x,
        y: item.y,
        width: def.width,
        height: def.height,
        props: { ...def.defaultProps, ...item.props },
        inputs: JSON.parse(JSON.stringify(def.inputs)),
        outputs: JSON.parse(JSON.stringify(def.outputs)),
        inputStates: {},
        outputStates: {}
      };
      instance.inputs.forEach(p => instance.inputStates[p.id] = SignalState.LOW);
      instance.outputs.forEach(p => instance.outputStates[p.id] = SignalState.LOW);
      this.components.set(instance.id, instance);
    });

    if (Array.isArray(data.wires)) {
      data.wires.forEach(w => {
        if (this.components.has(w.fromCompId) && this.components.has(w.toCompId)) {
          this.wires.push({
            id: w.id || this.generateId('w'),
            fromCompId: w.fromCompId,
            fromPinId: w.fromPinId,
            toCompId: w.toCompId,
            toPinId: w.toPinId,
            state: SignalState.LOW
          });
        }
      });
    }

    if (recordHistory) {
      this.saveHistoryState();
    }
    return true;
  }

  clear() {
    this.components.clear();
    this.wires = [];
    this.selectedComponentIds.clear();
    this.selectedWireIds.clear();
    this.probedPins = [];
    this.saveHistoryState();
  }
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}
