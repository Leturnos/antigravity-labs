/**
 * Aether Logic Lab - Curated Preset Circuit Schematics
 */

import { ComponentType } from './types.js';

export const PRESETS = [
  {
    id: 'basic_gates',
    name: '1. Portas Básicas & Tabela Verdade',
    description: 'Dois interruptores de entrada (A e B) alimentando portas AND, OR, XOR e NAND com LEDs indicadores.',
    data: {
      version: '1.0',
      components: [
        { id: 'sw_a', type: ComponentType.SWITCH, x: 80, y: 100, props: { label: 'Entrada A', state: 1 } },
        { id: 'sw_b', type: ComponentType.SWITCH, x: 80, y: 180, props: { label: 'Entrada B', state: 0 } },
        // Gates
        { id: 'gate_and', type: ComponentType.AND, x: 260, y: 60, props: {} },
        { id: 'gate_or', type: ComponentType.OR, x: 260, y: 130, props: {} },
        { id: 'gate_xor', type: ComponentType.XOR, x: 260, y: 200, props: {} },
        { id: 'gate_nand', type: ComponentType.NAND, x: 260, y: 270, props: {} },
        // LEDs
        { id: 'led_and', type: ComponentType.LED, x: 420, y: 58, props: { label: 'A AND B', color: '#00f3ff' } },
        { id: 'led_or', type: ComponentType.LED, x: 420, y: 128, props: { label: 'A OR B', color: '#10b981' } },
        { id: 'led_xor', type: ComponentType.LED, x: 420, y: 198, props: { label: 'A XOR B', color: '#a855f7' } },
        { id: 'led_nand', type: ComponentType.LED, x: 420, y: 268, props: { label: 'A NAND B', color: '#f59e0b' } },
      ],
      wires: [
        // Switch A connections
        { fromCompId: 'sw_a', fromPinId: 'out', toCompId: 'gate_and', toPinId: 'a' },
        { fromCompId: 'sw_a', fromPinId: 'out', toCompId: 'gate_or', toPinId: 'a' },
        { fromCompId: 'sw_a', fromPinId: 'out', toCompId: 'gate_xor', toPinId: 'a' },
        { fromCompId: 'sw_a', fromPinId: 'out', toCompId: 'gate_nand', toPinId: 'a' },
        // Switch B connections
        { fromCompId: 'sw_b', fromPinId: 'out', toCompId: 'gate_and', toPinId: 'b' },
        { fromCompId: 'sw_b', fromPinId: 'out', toCompId: 'gate_or', toPinId: 'b' },
        { fromCompId: 'sw_b', fromPinId: 'out', toCompId: 'gate_xor', toPinId: 'b' },
        { fromCompId: 'sw_b', fromPinId: 'out', toCompId: 'gate_nand', toPinId: 'b' },
        // Output connections to LEDs
        { fromCompId: 'gate_and', fromPinId: 'out', toCompId: 'led_and', toPinId: 'in' },
        { fromCompId: 'gate_or', fromPinId: 'out', toCompId: 'led_or', toPinId: 'in' },
        { fromCompId: 'gate_xor', fromPinId: 'out', toCompId: 'led_xor', toPinId: 'in' },
        { fromCompId: 'gate_nand', fromPinId: 'out', toCompId: 'led_nand', toPinId: 'in' },
      ],
      probedPins: [
        { compId: 'sw_a', pinId: 'out', label: 'Entrada A', color: '#00f3ff' },
        { compId: 'sw_b', pinId: 'out', label: 'Entrada B', color: '#38bdf8' },
        { compId: 'gate_and', pinId: 'out', label: 'AND', color: '#10b981' },
        { compId: 'gate_xor', pinId: 'out', label: 'XOR', color: '#a855f7' }
      ]
    }
  },

  {
    id: 'full_adder',
    name: '2. Somador Completo de 1-Bit (Full Adder)',
    description: 'Soma binária completa A + B + Cin gerando a Soma (S) e o Transporte de Saída (Cout).',
    data: {
      version: '1.0',
      components: [
        { id: 'sw_a', type: ComponentType.SWITCH, x: 60, y: 70, props: { label: 'A', state: 1 } },
        { id: 'sw_b', type: ComponentType.SWITCH, x: 60, y: 130, props: { label: 'B', state: 1 } },
        { id: 'sw_cin', type: ComponentType.SWITCH, x: 60, y: 190, props: { label: 'Cin', state: 0 } },
        { id: 'fa_mod', type: ComponentType.FULL_ADDER, x: 220, y: 90, props: {} },
        { id: 'led_sum', type: ComponentType.LED, x: 380, y: 90, props: { label: 'SOMA (S)', color: '#00f3ff' } },
        { id: 'led_cout', type: ComponentType.LED, x: 380, y: 150, props: { label: 'CARRY (Cout)', color: '#ec4899' } },
      ],
      wires: [
        { fromCompId: 'sw_a', fromPinId: 'out', toCompId: 'fa_mod', toPinId: 'a' },
        { fromCompId: 'sw_b', fromPinId: 'out', toCompId: 'fa_mod', toPinId: 'b' },
        { fromCompId: 'sw_cin', fromPinId: 'out', toCompId: 'fa_mod', toPinId: 'cin' },
        { fromCompId: 'fa_mod', fromPinId: 's', toCompId: 'led_sum', toPinId: 'in' },
        { fromCompId: 'fa_mod', fromPinId: 'cout', toCompId: 'led_cout', toPinId: 'in' },
      ],
      probedPins: [
        { compId: 'sw_a', pinId: 'out', label: 'A', color: '#00f3ff' },
        { compId: 'sw_b', pinId: 'out', label: 'B', color: '#38bdf8' },
        { compId: 'fa_mod', pinId: 's', label: 'SUM', color: '#10b981' },
        { compId: 'fa_mod', pinId: 'cout', label: 'COUT', color: '#ec4899' }
      ]
    }
  },

  {
    id: 'd_flipflop',
    name: '3. Célula de Memória Flip-Flop D',
    description: 'Flip-Flop disparado por borda de subida do Clock sincronizado com o analisador lógico de formas de onda.',
    data: {
      version: '1.0',
      components: [
        { id: 'clk_gen', type: ComponentType.CLOCK, x: 60, y: 150, props: { freq: 2.0, label: 'CLK' } },
        { id: 'sw_data', type: ComponentType.SWITCH, x: 60, y: 70, props: { label: 'DATA (D)', state: 1 } },
        { id: 'dff', type: ComponentType.FLIPFLOP_D, x: 220, y: 90, props: {} },
        { id: 'led_q', type: ComponentType.LED, x: 370, y: 85, props: { label: 'Q (Saída)', color: '#00f3ff' } },
        { id: 'led_qn', type: ComponentType.LED, x: 370, y: 145, props: { label: '~Q (Invert)', color: '#a855f7' } },
      ],
      wires: [
        { fromCompId: 'sw_data', fromPinId: 'out', toCompId: 'dff', toPinId: 'd' },
        { fromCompId: 'clk_gen', fromPinId: 'out', toCompId: 'dff', toPinId: 'clk' },
        { fromCompId: 'dff', fromPinId: 'q', toCompId: 'led_q', toPinId: 'in' },
        { fromCompId: 'dff', fromPinId: 'qn', toCompId: 'led_qn', toPinId: 'in' },
      ],
      probedPins: [
        { compId: 'clk_gen', pinId: 'out', label: 'CLOCK', color: '#f59e0b' },
        { compId: 'sw_data', pinId: 'out', label: 'DATA D', color: '#00f3ff' },
        { compId: 'dff', pinId: 'q', label: 'SAÍDA Q', color: '#10b981' },
        { compId: 'dff', pinId: 'qn', label: '~Q', color: '#a855f7' }
      ]
    }
  },

  {
    id: 'counter_7seg',
    name: '4. Contador 4-Bit com Display de 7 Segmentos',
    description: 'Contador síncrono binário incrementado por clock contínuo, exibindo valores hexadecimais de 0 a F no display digital.',
    data: {
      version: '1.0',
      components: [
        { id: 'clk_gen', type: ComponentType.CLOCK, x: 60, y: 100, props: { freq: 1.5, label: 'CLK' } },
        { id: 'vcc_en', type: ComponentType.VCC, x: 60, y: 150, props: {} },
        { id: 'btn_rst', type: ComponentType.PUSH_BUTTON, x: 60, y: 200, props: { label: 'RESET' } },
        { id: 'cnt4', type: ComponentType.COUNTER_4BIT, x: 190, y: 90, props: {} },
        { id: 'disp7', type: ComponentType.SEVEN_SEGMENT, x: 380, y: 90, props: {} },
        { id: 'bus_disp', type: ComponentType.BUS_DISPLAY, x: 500, y: 90, props: {} }
      ],
      wires: [
        { fromCompId: 'clk_gen', fromPinId: 'out', toCompId: 'cnt4', toPinId: 'clk' },
        { fromCompId: 'vcc_en', fromPinId: 'out', toCompId: 'cnt4', toPinId: 'en' },
        { fromCompId: 'btn_rst', fromPinId: 'out', toCompId: 'cnt4', toPinId: 'rst' },
        // Outputs to 7-segment
        { fromCompId: 'cnt4', fromPinId: 'q0', toCompId: 'disp7', toPinId: 'd0' },
        { fromCompId: 'cnt4', fromPinId: 'q1', toCompId: 'disp7', toPinId: 'd1' },
        { fromCompId: 'cnt4', fromPinId: 'q2', toCompId: 'disp7', toPinId: 'd2' },
        { fromCompId: 'cnt4', fromPinId: 'q3', toCompId: 'disp7', toPinId: 'd3' },
        // Outputs to Bus Display
        { fromCompId: 'cnt4', fromPinId: 'q0', toCompId: 'bus_disp', toPinId: 'd0' },
        { fromCompId: 'cnt4', fromPinId: 'q1', toCompId: 'bus_disp', toPinId: 'd1' },
        { fromCompId: 'cnt4', fromPinId: 'q2', toCompId: 'bus_disp', toPinId: 'd2' },
        { fromCompId: 'cnt4', fromPinId: 'q3', toCompId: 'bus_disp', toPinId: 'd3' },
      ],
      probedPins: [
        { compId: 'clk_gen', pinId: 'out', label: 'CLOCK', color: '#f59e0b' },
        { compId: 'cnt4', pinId: 'q0', label: 'Bit 0 (LSB)', color: '#00f3ff' },
        { compId: 'cnt4', pinId: 'q1', label: 'Bit 1', color: '#38bdf8' },
        { compId: 'cnt4', pinId: 'q2', label: 'Bit 2', color: '#a855f7' },
        { compId: 'cnt4', pinId: 'q3', label: 'Bit 3 (MSB)', color: '#ec4899' }
      ]
    }
  },

  {
    id: 'alu_interactive',
    name: '5. ALU 4-Bit Interativa (Unidade Lógica & Aritmética)',
    description: 'Processador de cálculo com dois teclados de entrada hexadecimal (A e B) e seletor de operações (Soma, Subtração, AND, OR, XOR).',
    data: {
      version: '1.0',
      components: [
        { id: 'hex_a', type: ComponentType.HEX_INPUT, x: 50, y: 70, props: { value: 7 } },
        { id: 'hex_b', type: ComponentType.HEX_INPUT, x: 50, y: 190, props: { value: 3 } },
        // Opcode selector switches (S0, S1, S2)
        { id: 'sw_s0', type: ComponentType.SWITCH, x: 200, y: 320, props: { label: 'OP0', state: 0 } },
        { id: 'sw_s1', type: ComponentType.SWITCH, x: 280, y: 320, props: { label: 'OP1', state: 0 } },
        { id: 'sw_s2', type: ComponentType.SWITCH, x: 360, y: 320, props: { label: 'OP2', state: 0 } },
        // ALU
        { id: 'alu', type: ComponentType.ALU_4BIT, x: 260, y: 110, props: {} },
        // Display result
        { id: 'disp_res', type: ComponentType.BUS_DISPLAY, x: 480, y: 90, props: {} },
        { id: 'disp7_res', type: ComponentType.SEVEN_SEGMENT, x: 610, y: 90, props: {} },
        { id: 'led_zero', type: ComponentType.LED, x: 480, y: 200, props: { label: 'ZERO', color: '#10b981' } },
        { id: 'led_carry', type: ComponentType.LED, x: 480, y: 260, props: { label: 'CARRY', color: '#f59e0b' } },
      ],
      wires: [
        // A bus
        { fromCompId: 'hex_a', fromPinId: 'q0', toCompId: 'alu', toPinId: 'a0' },
        { fromCompId: 'hex_a', fromPinId: 'q1', toCompId: 'alu', toPinId: 'a1' },
        { fromCompId: 'hex_a', fromPinId: 'q2', toCompId: 'alu', toPinId: 'a2' },
        { fromCompId: 'hex_a', fromPinId: 'q3', toCompId: 'alu', toPinId: 'a3' },
        // B bus
        { fromCompId: 'hex_b', fromPinId: 'q0', toCompId: 'alu', toPinId: 'b0' },
        { fromCompId: 'hex_b', fromPinId: 'q1', toCompId: 'alu', toPinId: 'b1' },
        { fromCompId: 'hex_b', fromPinId: 'q2', toCompId: 'alu', toPinId: 'b2' },
        { fromCompId: 'hex_b', fromPinId: 'q3', toCompId: 'alu', toPinId: 'b3' },
        // Opcode bus
        { fromCompId: 'sw_s0', fromPinId: 'out', toCompId: 'alu', toPinId: 's0' },
        { fromCompId: 'sw_s1', fromPinId: 'out', toCompId: 'alu', toPinId: 's1' },
        { fromCompId: 'sw_s2', fromPinId: 'out', toCompId: 'alu', toPinId: 's2' },
        // Result Y to displays
        { fromCompId: 'alu', fromPinId: 'y0', toCompId: 'disp_res', toPinId: 'd0' },
        { fromCompId: 'alu', fromPinId: 'y1', toCompId: 'disp_res', toPinId: 'd1' },
        { fromCompId: 'alu', fromPinId: 'y2', toCompId: 'disp_res', toPinId: 'd2' },
        { fromCompId: 'alu', fromPinId: 'y3', toCompId: 'disp_res', toPinId: 'd3' },
        { fromCompId: 'alu', fromPinId: 'y0', toCompId: 'disp7_res', toPinId: 'd0' },
        { fromCompId: 'alu', fromPinId: 'y1', toCompId: 'disp7_res', toPinId: 'd1' },
        { fromCompId: 'alu', fromPinId: 'y2', toCompId: 'disp7_res', toPinId: 'd2' },
        { fromCompId: 'alu', fromPinId: 'y3', toCompId: 'disp7_res', toPinId: 'd3' },
        // Flags
        { fromCompId: 'alu', fromPinId: 'zero', toCompId: 'led_zero', toPinId: 'in' },
        { fromCompId: 'alu', fromPinId: 'carry', toCompId: 'led_carry', toPinId: 'in' },
      ],
      probedPins: [
        { compId: 'alu', pinId: 'y0', label: 'Resultado Y0', color: '#00f3ff' },
        { compId: 'alu', pinId: 'zero', label: 'Flag Zero', color: '#10b981' },
        { compId: 'alu', pinId: 'carry', label: 'Flag Carry', color: '#f59e0b' }
      ]
    }
  }
];
