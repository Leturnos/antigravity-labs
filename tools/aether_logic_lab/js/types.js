/**
 * Aether Logic Lab - Types and Core Constants
 */

export const SignalState = {
  LOW: 0,
  HIGH: 1,
  FLOATING: -1, // High-Impedance (Z)
  ERROR: -2,    // Contention / Conflict (X)
};

export function isSignalActive(state) {
  return state === SignalState.HIGH;
}

export function formatSignal(state) {
  switch (state) {
    case SignalState.HIGH: return '1 (HIGH)';
    case SignalState.LOW: return '0 (LOW)';
    case SignalState.FLOATING: return 'Z (Hi-Z)';
    case SignalState.ERROR: return 'X (Error)';
    default: return '?';
  }
}

export function getSignalColor(state) {
  switch (state) {
    case SignalState.HIGH: return '#00f3ff'; // Neon Cyan
    case SignalState.LOW: return '#242e42';  // Inactive slate
    case SignalState.FLOATING: return '#64748b'; // Dim gray dashed
    case SignalState.ERROR: return '#ef4444'; // Bright crimson
    default: return '#334155';
  }
}

export const ComponentType = {
  // Inputs / Sources
  SWITCH: 'SWITCH',
  PUSH_BUTTON: 'PUSH_BUTTON',
  CLOCK: 'CLOCK',
  VCC: 'VCC',
  GND: 'GND',
  HEX_INPUT: 'HEX_INPUT',

  // Gates
  BUFFER: 'BUFFER',
  NOT: 'NOT',
  AND: 'AND',
  OR: 'OR',
  NAND: 'NAND',
  NOR: 'NOR',
  XOR: 'XOR',
  XNOR: 'XNOR',
  TRISTATE: 'TRISTATE',

  // Outputs / Displays
  LED: 'LED',
  SEVEN_SEGMENT: 'SEVEN_SEGMENT',
  BUS_DISPLAY: 'BUS_DISPLAY',
  PROBE: 'PROBE',
  BUZZER: 'BUZZER',

  // Integrated Modules
  LATCH_SR: 'LATCH_SR',
  FLIPFLOP_D: 'FLIPFLOP_D',
  FLIPFLOP_JK: 'FLIPFLOP_JK',
  COUNTER_4BIT: 'COUNTER_4BIT',
  MUX_2TO1: 'MUX_2TO1',
  MUX_4TO1: 'MUX_4TO1',
  HALF_ADDER: 'HALF_ADDER',
  FULL_ADDER: 'FULL_ADDER',
  ALU_4BIT: 'ALU_4BIT',
};

export const ToolMode = {
  SELECT: 'SELECT',
  WIRE: 'WIRE',
  PAN: 'PAN',
  DELETE: 'DELETE',
};
