# 🖧 Aether Logic Lab

Laboratório interativo de simulação de circuitos digitais, portas lógicas, células de memória, módulos integrados e analisador lógico de formas de onda (osciloscópio digital) em tempo real da suíte **Antigravity Labs**.

---

## ✨ Funcionalidades

- **Motor de Simulação Reativo de 4 Estados:**
  - `HIGH (1)`: Nível lógico alto com brilho neon cyan e partículas de corrente em movimento.
  - `LOW (0)`: Nível lógico baixo inativo.
  - `FLOATING (Z)`: Alta impedância (tristate desabilitado).
  - `ERROR (X)`: Contenção de sinal / curto-circuito em vermelho.
  - Algoritmo de relaxação com detecção automática de oscilação em anel sem travar o navegador.
- **Catálogo Abrangente de Componentes:**
  - **Fontes & Entradas:** Chave Liga/Desliga (Switch), Botão Pulsador, Gerador de Clock (0.5 Hz a 20 Hz e passo manual), Constantes VCC (1) e GND (0), Teclado Hexadecimal de 4 bits.
  - **Portas Lógicas (Padrão ANSI/IEEE):** BUFFER, NOT, AND, OR, NAND, NOR, XOR, XNOR, Buffer Tri-State.
  - **Saídas & Visores:** LED colorido (brilho dinâmico), Display de 7 Segmentos (decodificador BCD 0-F), Display de Barramento (Hex/Dec/Bin), Sonda Lógica (Probe), Buzzer Sonoro.
  - **Módulos & Memória:** Latch SR, Flip-Flop D com trigger de borda de subida, Flip-Flop JK, Contador Binário de 4 Bits (74LS161), Meio Somador, Somador Completo (Full Adder), Multiplexador 2:1, ALU de 4 Bits (Soma, Subtração, AND, OR, XOR, NOT, Shift, Pass).
- **Roteamento Inteligente & Fiação Magnética:**
  - Traçado ortogonal limpo com magnetismo snap-to-pin.
  - Linhas tracejadas durante a conexão e partículas animadas indicando fluxo de corrente.
- **Analisador Lógico / Osciloscópio Digital (Waveform Drawer):**
  - Painel inferior retrátil que traça formas de onda digitais quadradas dos pinos monitorados em tempo real, sincronizados com os ciclos de clock.
- **Biblioteca de Presets Curados:**
  1. *Portas Básicas & Tabela Verdade*
  2. *Somador Completo de 1-Bit (Full Adder)*
  3. *Célula de Memória Flip-Flop D*
  4. *Contador 4-Bit com Display de 7 Segmentos*
  5. *ALU 4-Bit Interativa com Teclado Hexadecimal*
- **Áudio Procedural com Web Audio API:**
  - Sons de cliques táteis em chaves e relés, pulsos de clock e oscilador sonoro do Buzzer.
- **Persistência & Exportação:**
  - Salvar / Carregar circuito em formato JSON.
  - Exportar imagem PNG de alta resolução do esquema.
  - Histórico completo de Undo / Redo (`Ctrl+Z` / `Ctrl+Y`).

---

## ⌨️ Atalhos de Teclado & Controles

| Comando | Ação |
| :--- | :--- |
| **Espaço + Arrastar** ou **Botão do Meio** | Pan (mover câmera pelo canvas) |
| **Scroll do Mouse** | Zoom (ampliar/reduzir centrado no cursor) |
| **Clique no Switch / Botão / Hex** | Alternar estado ou incrementar valor |
| **Arrastar de um Pino para outro** | Conectar fio magnético |
| **Botão Direito no Pino** | Adicionar / Remover Sonda do Osciloscópio |
| **Botão Direito no Fio / Componente** | Excluir fio ou componente |
| **Delete / Backspace** | Excluir seleção |
| **Ctrl + Z / Ctrl + Y** | Desfazer / Refazer |
| **Ctrl + A** | Selecionar Todos |
| **Esc** | Cancelar fiação ou desmarcar seleção |

---

## 🚀 Como Acessar

Inicie o servidor unificado do Antigravity Labs:

```bash
python server.py
```

Acesse no navegador:
* [http://localhost:8000/tools/aether_logic_lab/index.html](http://localhost:8000/tools/aether_logic_lab/index.html)
