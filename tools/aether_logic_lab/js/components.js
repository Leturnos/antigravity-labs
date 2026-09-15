/**
 * Aether Logic Lab - Component Definitions, Schematics & Logic Evaluations
 */

import { SignalState, ComponentType } from './types.js';

export const COMPONENT_DEFINITIONS = {};

/**
 * Helper to define pin positions
 */
function pin(id, label, x, y, isOutput = false, description = '') {
  return { id, label, x, y, isOutput, description };
}

// -------------------------------------------------------------
// 1. INPUTS & SOURCES
// -------------------------------------------------------------

COMPONENT_DEFINITIONS[ComponentType.SWITCH] = {
  type: ComponentType.SWITCH,
  category: 'inputs',
  name: 'Chave Liga/Desliga',
  width: 60,
  height: 40,
  inputs: [],
  outputs: [pin('out', 'Q', 60, 20, true, 'Saída')],
  defaultProps: { state: 0, label: 'SW' },
  evaluate(comp) {
    return { out: comp.props.state ? SignalState.HIGH : SignalState.LOW };
  },
  draw(ctx, comp, isSelected) {
    const isOn = comp.props.state === 1;
    // Base box
    ctx.fillStyle = '#121726';
    ctx.strokeStyle = isSelected ? '#00f3ff' : '#2a364f';
    ctx.lineWidth = isSelected ? 2 : 1.5;
    ctx.beginPath();
    ctx.roundRect(0, 0, comp.width, comp.height, 6);
    ctx.fill();
    ctx.stroke();

    // Toggle slider track
    ctx.fillStyle = isOn ? 'rgba(0, 243, 255, 0.2)' : '#1e2638';
    ctx.beginPath();
    ctx.roundRect(10, 12, 40, 16, 8);
    ctx.fill();

    // Toggle knob
    const knobX = isOn ? 38 : 14;
    ctx.fillStyle = isOn ? '#00f3ff' : '#64748b';
    if (isOn) {
      ctx.shadowColor = '#00f3ff';
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.arc(knobX, 20, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(comp.props.label || 'SW', 30, 36);
  }
};

COMPONENT_DEFINITIONS[ComponentType.PUSH_BUTTON] = {
  type: ComponentType.PUSH_BUTTON,
  category: 'inputs',
  name: 'Botão Pulsador',
  width: 50,
  height: 40,
  inputs: [],
  outputs: [pin('out', 'Q', 50, 20, true, 'Saída')],
  defaultProps: { pressed: false, label: 'BTN' },
  evaluate(comp) {
    return { out: comp.props.pressed ? SignalState.HIGH : SignalState.LOW };
  },
  draw(ctx, comp, isSelected) {
    const isPressed = comp.props.pressed;
    ctx.fillStyle = '#121726';
    ctx.strokeStyle = isSelected ? '#00f3ff' : '#2a364f';
    ctx.lineWidth = isSelected ? 2 : 1.5;
    ctx.beginPath();
    ctx.roundRect(0, 0, comp.width, comp.height, 6);
    ctx.fill();
    ctx.stroke();

    // Button cap
    ctx.fillStyle = isPressed ? '#00f3ff' : '#a855f7';
    if (isPressed) {
      ctx.shadowColor = '#00f3ff';
      ctx.shadowBlur = 10;
    }
    ctx.beginPath();
    ctx.arc(22, 20, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = isPressed ? '#08090d' : '#ffffff';
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', 22, 20);
  }
};

COMPONENT_DEFINITIONS[ComponentType.CLOCK] = {
  type: ComponentType.CLOCK,
  category: 'inputs',
  name: 'Gerador de Clock',
  width: 60,
  height: 40,
  inputs: [],
  outputs: [pin('out', 'CLK', 60, 20, true, 'Pulso de Clock')],
  defaultProps: { freq: 1.0, state: 0, label: 'CLK' },
  evaluate(comp) {
    return { out: comp.props.state ? SignalState.HIGH : SignalState.LOW };
  },
  draw(ctx, comp, isSelected) {
    const isHigh = comp.props.state === 1;
    ctx.fillStyle = '#121726';
    ctx.strokeStyle = isSelected ? '#00f3ff' : '#2a364f';
    ctx.lineWidth = isSelected ? 2 : 1.5;
    ctx.beginPath();
    ctx.roundRect(0, 0, comp.width, comp.height, 6);
    ctx.fill();
    ctx.stroke();

    // Square wave symbol
    ctx.strokeStyle = isHigh ? '#00f3ff' : '#64748b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(12, 24);
    ctx.lineTo(18, 24);
    ctx.lineTo(18, 14);
    ctx.lineTo(26, 14);
    ctx.lineTo(26, 24);
    ctx.lineTo(34, 24);
    ctx.stroke();

    // Frequency label
    ctx.fillStyle = isHigh ? '#00f3ff' : '#94a3b8';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${comp.props.freq}Hz`, 30, 34);
  }
};

COMPONENT_DEFINITIONS[ComponentType.VCC] = {
  type: ComponentType.VCC,
  category: 'inputs',
  name: 'Constante VCC (1)',
  width: 40,
  height: 30,
  inputs: [],
  outputs: [pin('out', '1', 40, 15, true, 'Nível Lógico 1 (VCC)')],
  defaultProps: {},
  evaluate() {
    return { out: SignalState.HIGH };
  },
  draw(ctx, comp, isSelected) {
    ctx.fillStyle = '#121726';
    ctx.strokeStyle = isSelected ? '#00f3ff' : '#2a364f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(0, 0, comp.width, comp.height, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#00f3ff';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('1', 20, 15);
  }
};

COMPONENT_DEFINITIONS[ComponentType.GND] = {
  type: ComponentType.GND,
  category: 'inputs',
  name: 'Constante GND (0)',
  width: 40,
  height: 30,
  inputs: [],
  outputs: [pin('out', '0', 40, 15, true, 'Nível Lógico 0 (GND)')],
  defaultProps: {},
  evaluate() {
    return { out: SignalState.LOW };
  },
  draw(ctx, comp, isSelected) {
    ctx.fillStyle = '#121726';
    ctx.strokeStyle = isSelected ? '#00f3ff' : '#2a364f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(0, 0, comp.width, comp.height, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('0', 20, 15);
  }
};

COMPONENT_DEFINITIONS[ComponentType.HEX_INPUT] = {
  type: ComponentType.HEX_INPUT,
  category: 'inputs',
  name: 'Teclado Hexadecimal 4-Bit',
  width: 70,
  height: 90,
  inputs: [],
  outputs: [
    pin('q0', 'b0', 70, 20, true, 'Bit 0 (LSB)'),
    pin('q1', 'b1', 70, 40, true, 'Bit 1'),
    pin('q2', 'b2', 70, 60, true, 'Bit 2'),
    pin('q3', 'b3', 70, 80, true, 'Bit 3 (MSB)')
  ],
  defaultProps: { value: 0 },
  evaluate(comp) {
    const val = comp.props.value & 0xF;
    return {
      q0: (val & 1) ? SignalState.HIGH : SignalState.LOW,
      q1: (val & 2) ? SignalState.HIGH : SignalState.LOW,
      q2: (val & 4) ? SignalState.HIGH : SignalState.LOW,
      q3: (val & 8) ? SignalState.HIGH : SignalState.LOW,
    };
  },
  draw(ctx, comp, isSelected) {
    ctx.fillStyle = '#121726';
    ctx.strokeStyle = isSelected ? '#00f3ff' : '#2a364f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(0, 0, comp.width, comp.height, 6);
    ctx.fill();
    ctx.stroke();

    // Value display box
    ctx.fillStyle = '#0a0d17';
    ctx.beginPath();
    ctx.roundRect(10, 15, 34, 34, 4);
    ctx.fill();
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#00f3ff';
    ctx.font = 'bold 22px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(comp.props.value.toString(16).toUpperCase(), 27, 32);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText('HEX IN', 27, 65);
    ctx.fillText('(clique)', 27, 78);
  }
};

// -------------------------------------------------------------
// 2. LOGIC GATES
// -------------------------------------------------------------

COMPONENT_DEFINITIONS[ComponentType.BUFFER] = {
  type: ComponentType.BUFFER,
  category: 'gates',
  name: 'Porta BUFFER',
  width: 60,
  height: 40,
  inputs: [pin('a', 'A', 0, 20, false)],
  outputs: [pin('out', 'Q', 60, 20, true)],
  defaultProps: {},
  evaluate(comp, inVals) {
    return { out: inVals.a === SignalState.HIGH ? SignalState.HIGH : SignalState.LOW };
  },
  draw(ctx, comp, isSelected) {
    drawGateBody(ctx, comp, isSelected, (c) => {
      c.beginPath();
      c.moveTo(15, 8);
      c.lineTo(45, 20);
      c.lineTo(15, 32);
      c.closePath();
    });
  }
};

COMPONENT_DEFINITIONS[ComponentType.NOT] = {
  type: ComponentType.NOT,
  category: 'gates',
  name: 'Porta NOT (Inversor)',
  width: 60,
  height: 40,
  inputs: [pin('a', 'A', 0, 20, false)],
  outputs: [pin('out', 'Q', 60, 20, true)],
  defaultProps: {},
  evaluate(comp, inVals) {
    return { out: inVals.a === SignalState.HIGH ? SignalState.LOW : SignalState.HIGH };
  },
  draw(ctx, comp, isSelected) {
    drawGateBody(ctx, comp, isSelected, (c) => {
      c.beginPath();
      c.moveTo(14, 8);
      c.lineTo(40, 20);
      c.lineTo(14, 32);
      c.closePath();
    }, true, 44, 20);
  }
};

COMPONENT_DEFINITIONS[ComponentType.AND] = {
  type: ComponentType.AND,
  category: 'gates',
  name: 'Porta AND',
  width: 60,
  height: 40,
  inputs: [
    pin('a', 'A', 0, 12, false),
    pin('b', 'B', 0, 28, false)
  ],
  outputs: [pin('out', 'Q', 60, 20, true)],
  defaultProps: {},
  evaluate(comp, inVals) {
    const res = inVals.a === SignalState.HIGH && inVals.b === SignalState.HIGH;
    return { out: res ? SignalState.HIGH : SignalState.LOW };
  },
  draw(ctx, comp, isSelected) {
    drawGateBody(ctx, comp, isSelected, (c) => {
      c.beginPath();
      c.moveTo(14, 8);
      c.lineTo(30, 8);
      c.arc(30, 20, 12, -Math.PI / 2, Math.PI / 2);
      c.lineTo(14, 32);
      c.closePath();
    });
  }
};

COMPONENT_DEFINITIONS[ComponentType.NAND] = {
  type: ComponentType.NAND,
  category: 'gates',
  name: 'Porta NAND',
  width: 64,
  height: 40,
  inputs: [
    pin('a', 'A', 0, 12, false),
    pin('b', 'B', 0, 28, false)
  ],
  outputs: [pin('out', 'Q', 64, 20, true)],
  defaultProps: {},
  evaluate(comp, inVals) {
    const isAnd = inVals.a === SignalState.HIGH && inVals.b === SignalState.HIGH;
    return { out: !isAnd ? SignalState.HIGH : SignalState.LOW };
  },
  draw(ctx, comp, isSelected) {
    drawGateBody(ctx, comp, isSelected, (c) => {
      c.beginPath();
      c.moveTo(14, 8);
      c.lineTo(30, 8);
      c.arc(30, 20, 12, -Math.PI / 2, Math.PI / 2);
      c.lineTo(14, 32);
      c.closePath();
    }, true, 46, 20);
  }
};

COMPONENT_DEFINITIONS[ComponentType.OR] = {
  type: ComponentType.OR,
  category: 'gates',
  name: 'Porta OR',
  width: 60,
  height: 40,
  inputs: [
    pin('a', 'A', 0, 12, false),
    pin('b', 'B', 0, 28, false)
  ],
  outputs: [pin('out', 'Q', 60, 20, true)],
  defaultProps: {},
  evaluate(comp, inVals) {
    const res = inVals.a === SignalState.HIGH || inVals.b === SignalState.HIGH;
    return { out: res ? SignalState.HIGH : SignalState.LOW };
  },
  draw(ctx, comp, isSelected) {
    drawGateBody(ctx, comp, isSelected, (c) => {
      c.beginPath();
      c.moveTo(12, 8);
      c.quadraticCurveTo(28, 8, 44, 20);
      c.quadraticCurveTo(28, 32, 12, 32);
      c.quadraticCurveTo(20, 20, 12, 8);
      c.closePath();
    });
  }
};

COMPONENT_DEFINITIONS[ComponentType.NOR] = {
  type: ComponentType.NOR,
  category: 'gates',
  name: 'Porta NOR',
  width: 64,
  height: 40,
  inputs: [
    pin('a', 'A', 0, 12, false),
    pin('b', 'B', 0, 28, false)
  ],
  outputs: [pin('out', 'Q', 64, 20, true)],
  defaultProps: {},
  evaluate(comp, inVals) {
    const isOr = inVals.a === SignalState.HIGH || inVals.b === SignalState.HIGH;
    return { out: !isOr ? SignalState.HIGH : SignalState.LOW };
  },
  draw(ctx, comp, isSelected) {
    drawGateBody(ctx, comp, isSelected, (c) => {
      c.beginPath();
      c.moveTo(12, 8);
      c.quadraticCurveTo(26, 8, 42, 20);
      c.quadraticCurveTo(26, 32, 12, 32);
      c.quadraticCurveTo(18, 20, 12, 8);
      c.closePath();
    }, true, 46, 20);
  }
};

COMPONENT_DEFINITIONS[ComponentType.XOR] = {
  type: ComponentType.XOR,
  category: 'gates',
  name: 'Porta XOR',
  width: 64,
  height: 40,
  inputs: [
    pin('a', 'A', 0, 12, false),
    pin('b', 'B', 0, 28, false)
  ],
  outputs: [pin('out', 'Q', 64, 20, true)],
  defaultProps: {},
  evaluate(comp, inVals) {
    const a = inVals.a === SignalState.HIGH ? 1 : 0;
    const b = inVals.b === SignalState.HIGH ? 1 : 0;
    return { out: (a ^ b) ? SignalState.HIGH : SignalState.LOW };
  },
  draw(ctx, comp, isSelected) {
    // Back arc
    ctx.strokeStyle = isSelected ? '#00f3ff' : '#64748b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, 8);
    ctx.quadraticCurveTo(18, 20, 10, 32);
    ctx.stroke();

    drawGateBody(ctx, comp, isSelected, (c) => {
      c.beginPath();
      c.moveTo(16, 8);
      c.quadraticCurveTo(32, 8, 48, 20);
      c.quadraticCurveTo(32, 32, 16, 32);
      c.quadraticCurveTo(24, 20, 16, 8);
      c.closePath();
    });
  }
};

COMPONENT_DEFINITIONS[ComponentType.XNOR] = {
  type: ComponentType.XNOR,
  category: 'gates',
  name: 'Porta XNOR',
  width: 68,
  height: 40,
  inputs: [
    pin('a', 'A', 0, 12, false),
    pin('b', 'B', 0, 28, false)
  ],
  outputs: [pin('out', 'Q', 68, 20, true)],
  defaultProps: {},
  evaluate(comp, inVals) {
    const a = inVals.a === SignalState.HIGH ? 1 : 0;
    const b = inVals.b === SignalState.HIGH ? 1 : 0;
    return { out: !(a ^ b) ? SignalState.HIGH : SignalState.LOW };
  },
  draw(ctx, comp, isSelected) {
    ctx.strokeStyle = isSelected ? '#00f3ff' : '#64748b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, 8);
    ctx.quadraticCurveTo(18, 20, 10, 32);
    ctx.stroke();

    drawGateBody(ctx, comp, isSelected, (c) => {
      c.beginPath();
      c.moveTo(16, 8);
      c.quadraticCurveTo(30, 8, 46, 20);
      c.quadraticCurveTo(30, 32, 16, 32);
      c.quadraticCurveTo(22, 20, 16, 8);
      c.closePath();
    }, true, 50, 20);
  }
};

COMPONENT_DEFINITIONS[ComponentType.TRISTATE] = {
  type: ComponentType.TRISTATE,
  category: 'gates',
  name: 'Buffer Tri-State',
  width: 60,
  height: 40,
  inputs: [
    pin('a', 'A', 0, 20, false, 'Entrada de Dados'),
    pin('en', 'EN', 30, 40, false, 'Habilita (Ativo em 1)')
  ],
  outputs: [pin('out', 'Q', 60, 20, true)],
  defaultProps: {},
  evaluate(comp, inVals) {
    if (inVals.en !== SignalState.HIGH) {
      return { out: SignalState.FLOATING };
    }
    return { out: inVals.a === SignalState.HIGH ? SignalState.HIGH : SignalState.LOW };
  },
  draw(ctx, comp, isSelected) {
    drawGateBody(ctx, comp, isSelected, (c) => {
      c.beginPath();
      c.moveTo(15, 8);
      c.lineTo(45, 20);
      c.lineTo(15, 32);
      c.closePath();
    });
    // Enable line to bottom
    ctx.strokeStyle = '#64748b';
    ctx.beginPath();
    ctx.moveTo(30, 25);
    ctx.lineTo(30, 40);
    ctx.stroke();
  }
};

function drawGateBody(ctx, comp, isSelected, pathFn, hasInvertCircle = false, circX = 0, circY = 0) {
  ctx.fillStyle = '#121726';
  ctx.strokeStyle = isSelected ? '#00f3ff' : '#38bdf8';
  ctx.lineWidth = isSelected ? 2.5 : 1.8;

  pathFn(ctx);
  ctx.fill();
  ctx.stroke();

  if (hasInvertCircle) {
    ctx.fillStyle = '#121726';
    ctx.beginPath();
    ctx.arc(circX, circY, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

// -------------------------------------------------------------
// 3. OUTPUTS & INDICATORS
// -------------------------------------------------------------

COMPONENT_DEFINITIONS[ComponentType.LED] = {
  type: ComponentType.LED,
  category: 'outputs',
  name: 'LED Indicador',
  width: 44,
  height: 44,
  inputs: [pin('in', 'IN', 0, 22, false)],
  outputs: [],
  defaultProps: { color: '#00f3ff', label: 'LED' },
  evaluate() { return {}; },
  draw(ctx, comp, isSelected, inVals) {
    const isOn = inVals.in === SignalState.HIGH;
    const color = comp.props.color || '#00f3ff';

    // Enclosure
    ctx.fillStyle = '#121726';
    ctx.strokeStyle = isSelected ? '#00f3ff' : '#2a364f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(0, 0, comp.width, comp.height, 6);
    ctx.fill();
    ctx.stroke();

    // LED diode bulb
    ctx.beginPath();
    ctx.arc(22, 22, 12, 0, Math.PI * 2);
    if (isOn) {
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner specular glare
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.arc(19, 19, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#1a2233';
      ctx.strokeStyle = '#2d3b55';
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
    }
  }
};

COMPONENT_DEFINITIONS[ComponentType.SEVEN_SEGMENT] = {
  type: ComponentType.SEVEN_SEGMENT,
  category: 'outputs',
  name: 'Display de 7 Segmentos (BCD)',
  width: 70,
  height: 90,
  inputs: [
    pin('d0', 'b0', 0, 20, false, 'Bit 0 (LSB)'),
    pin('d1', 'b1', 0, 40, false, 'Bit 1'),
    pin('d2', 'b2', 0, 60, false, 'Bit 2'),
    pin('d3', 'b3', 0, 80, false, 'Bit 3 (MSB)')
  ],
  outputs: [],
  defaultProps: {},
  evaluate() { return {}; },
  draw(ctx, comp, isSelected, inVals) {
    const b0 = inVals.d0 === SignalState.HIGH ? 1 : 0;
    const b1 = inVals.d1 === SignalState.HIGH ? 2 : 0;
    const b2 = inVals.d2 === SignalState.HIGH ? 4 : 0;
    const b3 = inVals.d3 === SignalState.HIGH ? 8 : 0;
    const val = b0 | b1 | b2 | b3;

    ctx.fillStyle = '#0a0d17';
    ctx.strokeStyle = isSelected ? '#00f3ff' : '#2a364f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(0, 0, comp.width, comp.height, 8);
    ctx.fill();
    ctx.stroke();

    // Standard 7-seg decoding table for 0-F
    // Segments: a, b, c, d, e, f, g
    const SEG_MAP = [
      0b1111110, // 0
      0b0110000, // 1
      0b1101101, // 2
      0b1111001, // 3
      0b0110011, // 4
      0b1011011, // 5
      0b1011111, // 6
      0b1110000, // 7
      0b1111111, // 8
      0b1111011, // 9
      0b1110111, // A
      0b0011111, // b
      0b1001110, // C
      0b0111101, // d
      0b1001111, // E
      0b1000111  // F
    ];
    const mask = SEG_MAP[val] || 0;

    drawSevenSegmentBevel(ctx, 35, 14, mask);
  }
};

function drawSevenSegmentBevel(ctx, ox, oy, mask) {
  const litColor = '#00f3ff';
  const offColor = '#141d2e';

  // Segment positions: a, b, c, d, e, f, g
  const segments = [
    { bit: 6, x: ox - 12, y: oy, w: 24, h: 5 },       // a (top)
    { bit: 5, x: ox + 10, y: oy + 4, w: 5, h: 22 },   // b (top-right)
    { bit: 4, x: ox + 10, y: oy + 28, w: 5, h: 22 },  // c (bot-right)
    { bit: 3, x: ox - 12, y: oy + 48, w: 24, h: 5 },  // d (bottom)
    { bit: 2, x: ox - 15, y: oy + 28, w: 5, h: 22 },  // e (bot-left)
    { bit: 1, x: ox - 15, y: oy + 4, w: 5, h: 22 },   // f (top-left)
    { bit: 0, x: ox - 12, y: oy + 24, w: 24, h: 5 },  // g (center)
  ];

  segments.forEach(seg => {
    const isLit = (mask & (1 << seg.bit)) !== 0;
    ctx.fillStyle = isLit ? litColor : offColor;
    if (isLit) {
      ctx.shadowColor = litColor;
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.roundRect(seg.x, seg.y, seg.w, seg.h, 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });
}

COMPONENT_DEFINITIONS[ComponentType.BUS_DISPLAY] = {
  type: ComponentType.BUS_DISPLAY,
  category: 'outputs',
  name: 'Display de Barramento 4-Bit',
  width: 90,
  height: 80,
  inputs: [
    pin('d0', 'b0', 0, 15, false, 'LSB'),
    pin('d1', 'b1', 0, 32, false),
    pin('d2', 'b2', 0, 48, false),
    pin('d3', 'b3', 0, 65, false, 'MSB')
  ],
  outputs: [],
  defaultProps: {},
  evaluate() { return {}; },
  draw(ctx, comp, isSelected, inVals) {
    const b0 = inVals.d0 === SignalState.HIGH ? 1 : 0;
    const b1 = inVals.d1 === SignalState.HIGH ? 2 : 0;
    const b2 = inVals.d2 === SignalState.HIGH ? 4 : 0;
    const b3 = inVals.d3 === SignalState.HIGH ? 8 : 0;
    const val = b0 | b1 | b2 | b3;

    ctx.fillStyle = '#0a0d17';
    ctx.strokeStyle = isSelected ? '#00f3ff' : '#2a364f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(0, 0, comp.width, comp.height, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#00f3ff';
    ctx.font = 'bold 16px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`0x${val.toString(16).toUpperCase()}`, 52, 26);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText(`DEC: ${val}`, 52, 46);
    ctx.fillText(`BIN: ${val.toString(2).padStart(4, '0')}`, 52, 64);
  }
};

COMPONENT_DEFINITIONS[ComponentType.PROBE] = {
  type: ComponentType.PROBE,
  category: 'outputs',
  name: 'Sonda Lógica (Probe)',
  width: 44,
  height: 36,
  inputs: [pin('in', 'IN', 0, 18, false)],
  outputs: [],
  defaultProps: { label: 'PRB' },
  evaluate() { return {}; },
  draw(ctx, comp, isSelected, inVals) {
    const val = inVals.in;
    ctx.fillStyle = '#121726';
    ctx.strokeStyle = isSelected ? '#00f3ff' : '#2a364f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(0, 0, comp.width, comp.height, 4);
    ctx.fill();
    ctx.stroke();

    let txt = '?';
    let col = '#64748b';
    if (val === SignalState.HIGH) { txt = '1'; col = '#00f3ff'; }
    else if (val === SignalState.LOW) { txt = '0'; col = '#94a3b8'; }
    else if (val === SignalState.FLOATING) { txt = 'Z'; col = '#eab308'; }
    else if (val === SignalState.ERROR) { txt = 'X'; col = '#ef4444'; }

    ctx.fillStyle = col;
    ctx.font = 'bold 14px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, 24, 18);
  }
};

COMPONENT_DEFINITIONS[ComponentType.BUZZER] = {
  type: ComponentType.BUZZER,
  category: 'outputs',
  name: 'Buzzer Sonoro',
  width: 50,
  height: 40,
  inputs: [pin('in', 'IN', 0, 20, false)],
  outputs: [],
  defaultProps: { freq: 440 },
  evaluate() { return {}; },
  draw(ctx, comp, isSelected, inVals) {
    const isOn = inVals.in === SignalState.HIGH;
    ctx.fillStyle = '#121726';
    ctx.strokeStyle = isSelected ? '#00f3ff' : '#2a364f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(0, 0, comp.width, comp.height, 6);
    ctx.fill();
    ctx.stroke();

    // Speaker icon
    ctx.fillStyle = isOn ? '#ec4899' : '#64748b';
    if (isOn) {
      ctx.shadowColor = '#ec4899';
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.moveTo(16, 16);
    ctx.lineTo(24, 12);
    ctx.lineTo(24, 28);
    ctx.lineTo(16, 24);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    if (isOn) {
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(28, 20, 5, -Math.PI / 3, Math.PI / 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(32, 20, 9, -Math.PI / 3, Math.PI / 3);
      ctx.stroke();
    }
  }
};

// -------------------------------------------------------------
// 4. MEMORY & SEQUENTIAL MODULES
// -------------------------------------------------------------

COMPONENT_DEFINITIONS[ComponentType.LATCH_SR] = {
  type: ComponentType.LATCH_SR,
  category: 'modules',
  name: 'Latch SR (NAND)',
  width: 80,
  height: 60,
  inputs: [
    pin('s', 'S', 0, 16, false, 'Set (Ativo em 1)'),
    pin('r', 'R', 0, 44, false, 'Reset (Ativo em 1)')
  ],
  outputs: [
    pin('q', 'Q', 80, 16, true),
    pin('qn', '~Q', 80, 44, true)
  ],
  defaultProps: { q: 0 },
  evaluate(comp, inVals) {
    const s = inVals.s === SignalState.HIGH;
    const r = inVals.r === SignalState.HIGH;
    let q = comp.props.q ?? 0;

    if (s && r) {
      // Invalid/Contention
      return { q: SignalState.ERROR, qn: SignalState.ERROR };
    } else if (s && !r) {
      q = 1;
    } else if (!s && r) {
      q = 0;
    }
    comp.props.q = q;
    return {
      q: q ? SignalState.HIGH : SignalState.LOW,
      qn: q ? SignalState.LOW : SignalState.HIGH
    };
  },
  draw(ctx, comp, isSelected) {
    drawICBox(ctx, comp, isSelected, 'SR LATCH');
  }
};

COMPONENT_DEFINITIONS[ComponentType.FLIPFLOP_D] = {
  type: ComponentType.FLIPFLOP_D,
  category: 'modules',
  name: 'Flip-Flop D (Borda de Subida)',
  width: 80,
  height: 60,
  inputs: [
    pin('d', 'D', 0, 16, false, 'Entrada de Dados'),
    pin('clk', 'CLK', 0, 44, false, 'Clock (Borda de Subida)')
  ],
  outputs: [
    pin('q', 'Q', 80, 16, true, 'Saída Q'),
    pin('qn', '~Q', 80, 44, true, 'Saída Invertida ~Q')
  ],
  defaultProps: { q: 0, prevClock: 0 },
  evaluate(comp, inVals) {
    const curClk = inVals.clk === SignalState.HIGH ? 1 : 0;
    const prevClk = comp.props.prevClock ?? 0;
    const isRisingEdge = prevClk === 0 && curClk === 1;

    let q = comp.props.q ?? 0;
    if (isRisingEdge) {
      q = inVals.d === SignalState.HIGH ? 1 : 0;
      comp.props.q = q;
    }
    comp.props.prevClock = curClk;

    return {
      q: q ? SignalState.HIGH : SignalState.LOW,
      qn: q ? SignalState.LOW : SignalState.HIGH
    };
  },
  draw(ctx, comp, isSelected) {
    drawICBox(ctx, comp, isSelected, 'D-FF');
    // Draw clock triangle at pin (0, 44)
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(1, 38);
    ctx.lineTo(9, 44);
    ctx.lineTo(1, 50);
    ctx.stroke();
  }
};

COMPONENT_DEFINITIONS[ComponentType.FLIPFLOP_JK] = {
  type: ComponentType.FLIPFLOP_JK,
  category: 'modules',
  name: 'Flip-Flop JK (Borda de Subida)',
  width: 80,
  height: 70,
  inputs: [
    pin('j', 'J', 0, 15, false),
    pin('clk', 'CLK', 0, 35, false),
    pin('k', 'K', 0, 55, false)
  ],
  outputs: [
    pin('q', 'Q', 80, 20, true),
    pin('qn', '~Q', 80, 50, true)
  ],
  defaultProps: { q: 0, prevClock: 0 },
  evaluate(comp, inVals) {
    const curClk = inVals.clk === SignalState.HIGH ? 1 : 0;
    const prevClk = comp.props.prevClock ?? 0;
    const isRisingEdge = prevClk === 0 && curClk === 1;

    let q = comp.props.q ?? 0;
    if (isRisingEdge) {
      const j = inVals.j === SignalState.HIGH ? 1 : 0;
      const k = inVals.k === SignalState.HIGH ? 1 : 0;
      if (j && !k) q = 1;
      else if (!j && k) q = 0;
      else if (j && k) q = 1 - q; // Toggle!
      comp.props.q = q;
    }
    comp.props.prevClock = curClk;

    return {
      q: q ? SignalState.HIGH : SignalState.LOW,
      qn: q ? SignalState.LOW : SignalState.HIGH
    };
  },
  draw(ctx, comp, isSelected) {
    drawICBox(ctx, comp, isSelected, 'JK-FF');
    // Clock triangle
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(1, 29);
    ctx.lineTo(9, 35);
    ctx.lineTo(1, 41);
    ctx.stroke();
  }
};

COMPONENT_DEFINITIONS[ComponentType.COUNTER_4BIT] = {
  type: ComponentType.COUNTER_4BIT,
  category: 'modules',
  name: 'Contador Binário 4-Bit (74LS161)',
  width: 90,
  height: 100,
  inputs: [
    pin('clk', 'CLK', 0, 20, false, 'Clock (Subida)'),
    pin('en', 'EN', 0, 50, false, 'Habilita'),
    pin('rst', 'RST', 0, 80, false, 'Reset (Ativo em 1)')
  ],
  outputs: [
    pin('q0', 'Q0', 90, 20, true, 'Bit 0 (LSB)'),
    pin('q1', 'Q1', 90, 40, true, 'Bit 1'),
    pin('q2', 'Q2', 90, 60, true, 'Bit 2'),
    pin('q3', 'Q3', 90, 80, true, 'Bit 3 (MSB)')
  ],
  defaultProps: { count: 0, prevClock: 0 },
  evaluate(comp, inVals) {
    if (inVals.rst === SignalState.HIGH) {
      comp.props.count = 0;
    } else {
      const curClk = inVals.clk === SignalState.HIGH ? 1 : 0;
      const prevClk = comp.props.prevClock ?? 0;
      const isRisingEdge = prevClk === 0 && curClk === 1;
      const isEn = inVals.en !== SignalState.LOW; // Default enable if not low

      if (isRisingEdge && isEn) {
        comp.props.count = (comp.props.count + 1) & 0xF;
      }
      comp.props.prevClock = curClk;
    }

    const c = comp.props.count;
    return {
      q0: (c & 1) ? SignalState.HIGH : SignalState.LOW,
      q1: (c & 2) ? SignalState.HIGH : SignalState.LOW,
      q2: (c & 4) ? SignalState.HIGH : SignalState.LOW,
      q3: (c & 8) ? SignalState.HIGH : SignalState.LOW,
    };
  },
  draw(ctx, comp, isSelected) {
    drawICBox(ctx, comp, isSelected, 'COUNT-4');
  }
};

COMPONENT_DEFINITIONS[ComponentType.HALF_ADDER] = {
  type: ComponentType.HALF_ADDER,
  category: 'modules',
  name: 'Meio Somador (Half Adder)',
  width: 80,
  height: 60,
  inputs: [
    pin('a', 'A', 0, 18, false),
    pin('b', 'B', 0, 42, false)
  ],
  outputs: [
    pin('s', 'S', 80, 18, true, 'Soma'),
    pin('c', 'C', 80, 42, true, 'Carry Out')
  ],
  defaultProps: {},
  evaluate(comp, inVals) {
    const a = inVals.a === SignalState.HIGH ? 1 : 0;
    const b = inVals.b === SignalState.HIGH ? 1 : 0;
    return {
      s: (a ^ b) ? SignalState.HIGH : SignalState.LOW,
      c: (a & b) ? SignalState.HIGH : SignalState.LOW,
    };
  },
  draw(ctx, comp, isSelected) {
    drawICBox(ctx, comp, isSelected, 'HALF ADD');
  }
};

COMPONENT_DEFINITIONS[ComponentType.FULL_ADDER] = {
  type: ComponentType.FULL_ADDER,
  category: 'modules',
  name: 'Somador Completo (Full Adder)',
  width: 90,
  height: 80,
  inputs: [
    pin('a', 'A', 0, 18, false),
    pin('b', 'B', 0, 40, false),
    pin('cin', 'Cin', 0, 62, false, 'Carry In')
  ],
  outputs: [
    pin('s', 'S', 90, 25, true, 'Soma (A ^ B ^ Cin)'),
    pin('cout', 'Cout', 90, 55, true, 'Carry Out')
  ],
  defaultProps: {},
  evaluate(comp, inVals) {
    const a = inVals.a === SignalState.HIGH ? 1 : 0;
    const b = inVals.b === SignalState.HIGH ? 1 : 0;
    const cin = inVals.cin === SignalState.HIGH ? 1 : 0;
    const sum = (a ^ b ^ cin) & 1;
    const cout = ((a & b) | (cin & (a ^ b))) & 1;

    return {
      s: sum ? SignalState.HIGH : SignalState.LOW,
      cout: cout ? SignalState.HIGH : SignalState.LOW,
    };
  },
  draw(ctx, comp, isSelected) {
    drawICBox(ctx, comp, isSelected, 'FULL ADD');
  }
};

COMPONENT_DEFINITIONS[ComponentType.MUX_2TO1] = {
  type: ComponentType.MUX_2TO1,
  category: 'modules',
  name: 'Multiplexador 2:1',
  width: 70,
  height: 70,
  inputs: [
    pin('i0', 'I0', 0, 18, false),
    pin('i1', 'I1', 0, 52, false),
    pin('sel', 'S', 35, 70, false, 'Seletor')
  ],
  outputs: [pin('out', 'Y', 70, 35, true)],
  defaultProps: {},
  evaluate(comp, inVals) {
    const isSel = inVals.sel === SignalState.HIGH;
    return { out: isSel ? inVals.i1 : inVals.i0 };
  },
  draw(ctx, comp, isSelected) {
    ctx.fillStyle = '#121726';
    ctx.strokeStyle = isSelected ? '#00f3ff' : '#2a364f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(10, 8);
    ctx.lineTo(60, 20);
    ctx.lineTo(60, 50);
    ctx.lineTo(10, 62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MUX', 35, 38);
  }
};

COMPONENT_DEFINITIONS[ComponentType.ALU_4BIT] = {
  type: ComponentType.ALU_4BIT,
  category: 'modules',
  name: 'ALU 4-Bit (Unidade Aritmética & Lógica)',
  width: 120,
  height: 140,
  inputs: [
    // Operando A (0..3)
    pin('a0', 'A0', 0, 18, false),
    pin('a1', 'A1', 0, 32, false),
    pin('a2', 'A2', 0, 46, false),
    pin('a3', 'A3', 0, 60, false),
    // Operando B (0..3)
    pin('b0', 'B0', 0, 80, false),
    pin('b1', 'B1', 0, 94, false),
    pin('b2', 'B2', 0, 108, false),
    pin('b3', 'B3', 0, 122, false),
    // Opcode S0..S2
    pin('s0', 'S0', 30, 140, false),
    pin('s1', 'S1', 60, 140, false),
    pin('s2', 'S2', 90, 140, false),
  ],
  outputs: [
    // Resultado Y (0..3)
    pin('y0', 'Y0', 120, 25, true),
    pin('y1', 'Y1', 120, 45, true),
    pin('y2', 'Y2', 120, 65, true),
    pin('y3', 'Y3', 120, 85, true),
    // Flags
    pin('zero', 'ZR', 120, 105, true, 'Zero Flag'),
    pin('carry', 'CY', 120, 125, true, 'Carry Flag'),
  ],
  defaultProps: {},
  evaluate(comp, inVals) {
    const a = (inVals.a0 === SignalState.HIGH ? 1 : 0) |
              (inVals.a1 === SignalState.HIGH ? 2 : 0) |
              (inVals.a2 === SignalState.HIGH ? 4 : 0) |
              (inVals.a3 === SignalState.HIGH ? 8 : 0);

    const b = (inVals.b0 === SignalState.HIGH ? 1 : 0) |
              (inVals.b1 === SignalState.HIGH ? 2 : 0) |
              (inVals.b2 === SignalState.HIGH ? 4 : 0) |
              (inVals.b3 === SignalState.HIGH ? 8 : 0);

    const s = (inVals.s0 === SignalState.HIGH ? 1 : 0) |
              (inVals.s1 === SignalState.HIGH ? 2 : 0) |
              (inVals.s2 === SignalState.HIGH ? 4 : 0);

    let res = 0;
    let carry = 0;

    switch (s) {
      case 0: // ADD
        res = a + b;
        carry = (res > 15) ? 1 : 0;
        break;
      case 1: // SUB
        res = a - b;
        carry = (res < 0) ? 1 : 0;
        break;
      case 2: // AND
        res = a & b;
        break;
      case 3: // OR
        res = a | b;
        break;
      case 4: // XOR
        res = a ^ b;
        break;
      case 5: // NOT A
        res = (~a) & 0xF;
        break;
      case 6: // SHIFT LEFT A
        res = a << 1;
        carry = (res > 15) ? 1 : 0;
        break;
      case 7: // PASS A
        res = a;
        break;
    }

    const yVal = res & 0xF;
    const isZero = (yVal === 0) ? 1 : 0;

    return {
      y0: (yVal & 1) ? SignalState.HIGH : SignalState.LOW,
      y1: (yVal & 2) ? SignalState.HIGH : SignalState.LOW,
      y2: (yVal & 4) ? SignalState.HIGH : SignalState.LOW,
      y3: (yVal & 8) ? SignalState.HIGH : SignalState.LOW,
      zero: isZero ? SignalState.HIGH : SignalState.LOW,
      carry: carry ? SignalState.HIGH : SignalState.LOW,
    };
  },
  draw(ctx, comp, isSelected) {
    drawICBox(ctx, comp, isSelected, 'ALU 4-BIT');
  }
};

function drawICBox(ctx, comp, isSelected, title) {
  ctx.fillStyle = '#0f1422';
  ctx.strokeStyle = isSelected ? '#00f3ff' : '#2a364f';
  ctx.lineWidth = isSelected ? 2 : 1.5;
  ctx.beginPath();
  ctx.roundRect(0, 0, comp.width, comp.height, 6);
  ctx.fill();
  ctx.stroke();

  // Top notch indicator
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(comp.width / 2, 0, 5, 0, Math.PI);
  ctx.fill();

  // Label
  ctx.fillStyle = '#00f3ff';
  ctx.font = 'bold 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, comp.width / 2, comp.height / 2);
}
