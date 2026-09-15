/**
 * Aether Logic Lab - Automated Logic & Verification Tests
 */

import assert from 'node:assert/strict';
import { SignalState, ComponentType } from './js/types.js';
import { COMPONENT_DEFINITIONS } from './js/components.js';
import { Circuit } from './js/circuit.js';
import { Simulator } from './js/simulator.js';
import { PRESETS } from './js/presets.js';

console.log('🧪 Starting Aether Logic Lab Test Suite...');

// 1. Test Primitive Gate Truth Tables
function testGateTruthTables() {
  console.log('Testing Logic Gate Truth Tables...');

  const NOT = COMPONENT_DEFINITIONS[ComponentType.NOT];
  assert.equal(NOT.evaluate({}, { a: SignalState.LOW }).out, SignalState.HIGH);
  assert.equal(NOT.evaluate({}, { a: SignalState.HIGH }).out, SignalState.LOW);

  const AND = COMPONENT_DEFINITIONS[ComponentType.AND];
  assert.equal(AND.evaluate({}, { a: SignalState.LOW, b: SignalState.LOW }).out, SignalState.LOW);
  assert.equal(AND.evaluate({}, { a: SignalState.HIGH, b: SignalState.LOW }).out, SignalState.LOW);
  assert.equal(AND.evaluate({}, { a: SignalState.LOW, b: SignalState.HIGH }).out, SignalState.LOW);
  assert.equal(AND.evaluate({}, { a: SignalState.HIGH, b: SignalState.HIGH }).out, SignalState.HIGH);

  const NAND = COMPONENT_DEFINITIONS[ComponentType.NAND];
  assert.equal(NAND.evaluate({}, { a: SignalState.HIGH, b: SignalState.HIGH }).out, SignalState.LOW);
  assert.equal(NAND.evaluate({}, { a: SignalState.HIGH, b: SignalState.LOW }).out, SignalState.HIGH);

  const OR = COMPONENT_DEFINITIONS[ComponentType.OR];
  assert.equal(OR.evaluate({}, { a: SignalState.LOW, b: SignalState.LOW }).out, SignalState.LOW);
  assert.equal(OR.evaluate({}, { a: SignalState.HIGH, b: SignalState.LOW }).out, SignalState.HIGH);
  assert.equal(OR.evaluate({}, { a: SignalState.HIGH, b: SignalState.HIGH }).out, SignalState.HIGH);

  const NOR = COMPONENT_DEFINITIONS[ComponentType.NOR];
  assert.equal(NOR.evaluate({}, { a: SignalState.LOW, b: SignalState.LOW }).out, SignalState.HIGH);
  assert.equal(NOR.evaluate({}, { a: SignalState.HIGH, b: SignalState.LOW }).out, SignalState.LOW);

  const XOR = COMPONENT_DEFINITIONS[ComponentType.XOR];
  assert.equal(XOR.evaluate({}, { a: SignalState.LOW, b: SignalState.LOW }).out, SignalState.LOW);
  assert.equal(XOR.evaluate({}, { a: SignalState.HIGH, b: SignalState.LOW }).out, SignalState.HIGH);
  assert.equal(XOR.evaluate({}, { a: SignalState.HIGH, b: SignalState.HIGH }).out, SignalState.LOW);

  const XNOR = COMPONENT_DEFINITIONS[ComponentType.XNOR];
  assert.equal(XNOR.evaluate({}, { a: SignalState.LOW, b: SignalState.LOW }).out, SignalState.HIGH);
  assert.equal(XNOR.evaluate({}, { a: SignalState.HIGH, b: SignalState.LOW }).out, SignalState.LOW);
  assert.equal(XNOR.evaluate({}, { a: SignalState.HIGH, b: SignalState.HIGH }).out, SignalState.HIGH);

  const TRISTATE = COMPONENT_DEFINITIONS[ComponentType.TRISTATE];
  assert.equal(TRISTATE.evaluate({}, { a: SignalState.HIGH, en: SignalState.LOW }).out, SignalState.FLOATING);
  assert.equal(TRISTATE.evaluate({}, { a: SignalState.HIGH, en: SignalState.HIGH }).out, SignalState.HIGH);
  assert.equal(TRISTATE.evaluate({}, { a: SignalState.LOW, en: SignalState.HIGH }).out, SignalState.LOW);

  console.log('✅ Logic Gate Truth Tables passed!');
}

// 2. Test Full Adder Arithmetic
function testFullAdder() {
  console.log('Testing Full Adder...');
  const FA = COMPONENT_DEFINITIONS[ComponentType.FULL_ADDER];

  for (let a = 0; a <= 1; a++) {
    for (let b = 0; b <= 1; b++) {
      for (let cin = 0; cin <= 1; cin++) {
        const expectedSum = (a ^ b ^ cin) & 1;
        const expectedCout = ((a & b) | (cin & (a ^ b))) & 1;

        const res = FA.evaluate({}, {
          a: a ? SignalState.HIGH : SignalState.LOW,
          b: b ? SignalState.HIGH : SignalState.LOW,
          cin: cin ? SignalState.HIGH : SignalState.LOW
        });

        assert.equal(res.s, expectedSum ? SignalState.HIGH : SignalState.LOW);
        assert.equal(res.cout, expectedCout ? SignalState.HIGH : SignalState.LOW);
      }
    }
  }
  console.log('✅ Full Adder 8-case truth table passed!');
}

// 3. Test Flip-Flop D Edge-Triggering
function testFlipFlopD() {
  console.log('Testing D Flip-Flop Edge Triggering...');
  const DFF = COMPONENT_DEFINITIONS[ComponentType.FLIPFLOP_D];
  const comp = { props: { q: 0, prevClock: 0 } };

  // Clock LOW, Data HIGH -> should not latch yet
  let res = DFF.evaluate(comp, { d: SignalState.HIGH, clk: SignalState.LOW });
  assert.equal(res.q, SignalState.LOW);
  assert.equal(res.qn, SignalState.HIGH);

  // Clock RISING EDGE (0 -> 1) with Data HIGH -> latches 1!
  res = DFF.evaluate(comp, { d: SignalState.HIGH, clk: SignalState.HIGH });
  assert.equal(res.q, SignalState.HIGH);
  assert.equal(res.qn, SignalState.LOW);

  // Clock remains HIGH, Data changes to LOW -> does not latch until next rising edge
  res = DFF.evaluate(comp, { d: SignalState.LOW, clk: SignalState.HIGH });
  assert.equal(res.q, SignalState.HIGH);

  // Clock FALLING EDGE (1 -> 0) -> maintains state
  res = DFF.evaluate(comp, { d: SignalState.LOW, clk: SignalState.LOW });
  assert.equal(res.q, SignalState.HIGH);

  // Next Clock RISING EDGE with Data LOW -> latches 0!
  res = DFF.evaluate(comp, { d: SignalState.LOW, clk: SignalState.HIGH });
  assert.equal(res.q, SignalState.LOW);
  assert.equal(res.qn, SignalState.HIGH);

  console.log('✅ D Flip-Flop rising edge behavior passed!');
}

// 4. Test 4-bit Counter
function test4BitCounter() {
  console.log('Testing 4-Bit Counter Module...');
  const CNT = COMPONENT_DEFINITIONS[ComponentType.COUNTER_4BIT];
  const comp = { props: { count: 0, prevClock: 0 } };

  // Pulse 16 clocks
  for (let cycle = 1; cycle <= 16; cycle++) {
    // Rising edge
    const res = CNT.evaluate(comp, { clk: SignalState.HIGH, en: SignalState.HIGH, rst: SignalState.LOW });
    const expectedCount = cycle % 16;
    const bit0 = (expectedCount & 1) ? SignalState.HIGH : SignalState.LOW;
    const bit1 = (expectedCount & 2) ? SignalState.HIGH : SignalState.LOW;
    const bit2 = (expectedCount & 4) ? SignalState.HIGH : SignalState.LOW;
    const bit3 = (expectedCount & 8) ? SignalState.HIGH : SignalState.LOW;

    assert.equal(res.q0, bit0);
    assert.equal(res.q1, bit1);
    assert.equal(res.q2, bit2);
    assert.equal(res.q3, bit3);

    // Falling edge
    CNT.evaluate(comp, { clk: SignalState.LOW, en: SignalState.HIGH, rst: SignalState.LOW });
  }

  // Test Reset
  const resReset = CNT.evaluate(comp, { clk: SignalState.HIGH, en: SignalState.HIGH, rst: SignalState.HIGH });
  assert.equal(resReset.q0, SignalState.LOW);
  assert.equal(resReset.q3, SignalState.LOW);

  console.log('✅ 4-Bit Counter cycle & reset passed!');
}

// 5. Test 4-bit ALU Operations
function testALU() {
  console.log('Testing 4-Bit ALU Operations...');
  const ALU = COMPONENT_DEFINITIONS[ComponentType.ALU_4BIT];

  // Helper to pack 4 bits
  function pack(val) {
    return {
      a0: (val & 1) ? SignalState.HIGH : SignalState.LOW,
      a1: (val & 2) ? SignalState.HIGH : SignalState.LOW,
      a2: (val & 4) ? SignalState.HIGH : SignalState.LOW,
      a3: (val & 8) ? SignalState.HIGH : SignalState.LOW,
    };
  }

  // ADD 5 + 3 = 8
  const inAdd = {
    ...pack(5),
    b0: SignalState.HIGH, b1: SignalState.HIGH, b2: SignalState.LOW, b3: SignalState.LOW, // 3
    s0: SignalState.LOW, s1: SignalState.LOW, s2: SignalState.LOW // S = 0 (ADD)
  };
  const resAdd = ALU.evaluate({}, inAdd);
  assert.equal(resAdd.y3, SignalState.HIGH); // 8 is bit 3
  assert.equal(resAdd.zero, SignalState.LOW);
  assert.equal(resAdd.carry, SignalState.LOW);

  // SUB 5 - 5 = 0 (Zero Flag set)
  const inSub = {
    ...pack(5),
    b0: SignalState.HIGH, b1: SignalState.LOW, b2: SignalState.HIGH, b3: SignalState.LOW, // 5
    s0: SignalState.HIGH, s1: SignalState.LOW, s2: SignalState.LOW // S = 1 (SUB)
  };
  const resSub = ALU.evaluate({}, inSub);
  assert.equal(resSub.zero, SignalState.HIGH);

  console.log('✅ 4-Bit ALU operations passed!');
}

// 6. Test Circuit Simulation Graph & Signal Propagation
function testCircuitSimulation() {
  console.log('Testing Circuit Graph & End-to-End Simulation...');
  const circuit = new Circuit();

  const sw = circuit.addComponent(ComponentType.SWITCH, 0, 0, { state: 1 });
  const notGate = circuit.addComponent(ComponentType.NOT, 100, 0);
  const led = circuit.addComponent(ComponentType.LED, 200, 0);

  circuit.addWire(sw.id, 'out', notGate.id, 'a');
  circuit.addWire(notGate.id, 'out', led.id, 'in');

  const sim = new Simulator(circuit);
  sim.update(100);

  // Switch is 1, NOT output is 0, LED input is 0
  assert.equal(notGate.outputStates['out'], SignalState.LOW);
  assert.equal(led.inputStates['in'], SignalState.LOW);

  // Switch to 0
  sw.props.state = 0;
  sim.update(200);

  // Switch is 0, NOT output is 1, LED input is 1
  assert.equal(notGate.outputStates['out'], SignalState.HIGH);
  assert.equal(led.inputStates['in'], SignalState.HIGH);

  console.log('✅ End-to-End Circuit Simulation passed!');
}

// 7. Verify All Presets
function testPresetsIntegrity() {
  console.log('Testing Presets Integrity...');
  assert.ok(PRESETS.length >= 5, 'Should have at least 5 presets');

  PRESETS.forEach(preset => {
    const circuit = new Circuit();
    const success = circuit.deserialize(preset.data, false);
    assert.ok(success, `Preset ${preset.id} failed to deserialize`);
    assert.ok(circuit.components.size > 0, `Preset ${preset.id} has no components`);
    assert.ok(circuit.wires.length > 0, `Preset ${preset.id} has no wires`);

    const sim = new Simulator(circuit);
    sim.update(100);
  });
  console.log(`✅ All ${PRESETS.length} presets loaded and simulated successfully!`);
}

// Run All
testGateTruthTables();
testFullAdder();
testFlipFlopD();
test4BitCounter();
testALU();
testCircuitSimulation();
testPresetsIntegrity();

console.log('\n🎉 ALL LOGIC LAB TESTS PASSED SUCCESSFULLY!');
