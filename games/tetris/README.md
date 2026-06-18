# Aether Tetris - Tetris Premium 🌌 (Linear Edition)

Um jogo de Tetris premium e imersivo, desenvolvido com a estética moderna e refinada da **Linear.app** (dark-mode com detalhes roxo-lavanda). Conta com sintetizador de áudio chiptune 8-bit offline em tempo real, suporte a múltiplos modos de jogo e níveis de velocidade, projeção de sombra (ghost piece), hold, controles de toque responsivos para dispositivos móveis e persistência local de recordes via API Python.

---

## 📂 Estrutura do Projeto

```
/games/tetris
  ├── css/
  │   └── style.css            # Design System (temas escuros, grids responsivos, botões de toque).
  ├── js/
  │   ├── app.js               # Controlador do jogo (loop, rotação SRS, hold, pontuação, colisões).
  │   └── sounds.js            # Sintetizador chiptune via Web Audio API (100% offline).
  ├── docs/
  │   └── system_explanation.md # Explicação técnica e arquitetura do jogo.
  ├── favicon.svg              # Ícone personalizado em formato SVG.
  ├── index.html               # Estrutura HTML5 semântica e containers do console.
  └── js/                      # Scripts do jogo.
```

---

## 💎 Principais Recursos

### 🎨 Visual Linear Premium & Dark Theme
A interface adota a identidade minimalista e refinada do Linear:
*   Fundo no tom de preto profundo (`#010102`).
*   Painéis suspensos com bordas de 1px finas (`#23252a`).
*   Destaques e botões interativos no tom roxo-lavanda (`#5e6ad2`).
*   Blocos coloridos com cantos arredondados, gradientes de volume e realce luminoso superior.

### 🎮 Três Modos de Jogo
*   **Clássico**: O modo tradicional. A velocidade de queda aumenta progressivamente a cada 10 linhas eliminadas. O objetivo é fazer a maior pontuação possível.
*   **Contrarrelógio (Time Attack)**: Corrida de velocidade contra o relógio para limpar **40 linhas** o mais rápido possível.
*   **Zen**: Modo relaxante sem aceleração (velocidade do nível 1 fixa). Ao bater no topo, a metade superior do tabuleiro é limpa automaticamente para continuar jogando sem Game Over.

### ⚡ Recursos Modernos de Jogabilidade
*   **Ghost Piece (Sombra)**: Projeta o contorno brilhante da peça ativa no fundo do tabuleiro, permitindo posicionamento rápido e seguro.
*   **Sistema de Hold**: Permite guardar uma peça na reserva (pressione `C` ou `Shift`) para ser usada no momento oportuno.
*   **Super Rotation System (SRS)**: Rotação inteligente que empurra as peças para fora de paredes e pilhas de blocos (Wall Kicks) para evitar travamentos injustos.

### 🔊 Sintetizador de Áudio Real-Time (Web Audio API)
Todos os sons são gerados sinteticamente na placa de som do navegador (100% offline, sem arquivos externos pesados):
*   **Movimento**: Onda triangular curta de baixa frequência (`120Hz` caindo para `80Hz`).
*   **Rotação**: Onda senoidal rápida de tom ascendente (`300Hz` a `420Hz`).
*   **Fixação**: Impacto simulado com onda triangular e pitch descendente.
*   **Limpeza de Linha**: Arpejo clássico de 3 notas curtas (onda quadrada).
*   **Tetris (4 Linhas)**: Explosão com arpejo de 4 notas associado a ruído branco filtrado.
*   **Fim de Jogo**: Sequência descendente triste de 4 notas.

### 📱 Controles Móveis (Mobile Touch)
Em telas de tablets ou smartphones, o layout se reorganiza: os painéis laterais sobem, o tabuleiro se adapta ao tamanho da tela e um painel de **botões de toque confortáveis** surge na parte inferior para jogabilidade rápida com os polegares.

---

## 🚀 Como Executar

O jogo agora é executado a partir do **Servidor Central** na raiz do repositório:

```bash
python server.py
```

Acesse no navegador: [http://localhost:8000/games/tetris/](http://localhost:8000/games/tetris/)

*Dica: Se você não iniciar o servidor Python e abrir o `index.html` diretamente no navegador, o jogo funcionará normalmente salvando as estatísticas no `localStorage`.*

---

## 🛠️ Tecnologias Utilizadas

*   **Frontend**: HTML5 Semântico, CSS3 (vanilla) e JavaScript ES6.
*   **Renderização**: Elementos HTML5 `<canvas>` individuais de alta performance para o tabuleiro, hold e next piece.
*   **Backend/API**: Python 3 (módulo nativo `http.server`).
*   **Áudio**: Web Audio API do navegador.
*   **Tipografia**: Google Fonts (Inter e JetBrains Mono).
