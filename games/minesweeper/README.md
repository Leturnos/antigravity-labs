# Aether-Sweeper - Campo Minado Premium 💣 (8-Bit Retro Edition)

Um jogo de campo minado premium e imersivo, desenvolvido para simular a faceplate de um console portátil dos anos 80 com estética 8-bit retro arcade. Contém sintetizador de áudio offline em tempo real, dimensionamento de grade para múltiplas dificuldades, persistência de recordes locais via API e efeitos dinâmicos de rumbles e partículas.

---

## 📂 Estrutura do Projeto

```
/minesweeper
  ├── css/
  │   └── style.css          # Design System (temas, bevels, halftone dot-matrix e animações).
  ├── js/
  │   ├── app.js             # Controlador principal do jogo: geração de tabuleiro, loops e placar.
  │   └── sounds.js          # Sintetizador retro chiptune via Web Audio API (100% offline).
  ├── favicon.svg            # Ícone SVG personalizado com mina pixelada.
  ├── index.html             # Estrutura HTML5 semântica e esqueleto do console portátil.
  ├── README.md              # Documentação do projeto (este arquivo).
  └── js/                    # Scripts do jogo.
```

---

## 💎 Principais Recursos

### 🎨 Visual Retro Arcade & Três Paletas Premium
A interface simula o plástico e metal injetado característico dos consoles portáteis e fliperamas clássicos dos anos 80. Clicando na legenda **PALETA** no menu superior, você pode alternar entre:
1. **Clássica Periwinkle (Default)**: O azul-perolado metalizado original com displays em LED vermelho.
2. **Arcadia (Verde)**: Um verde translúcido floresta inspirado nas carcaças clássicas retro, com displays em LED verde.
3. **Vaporwave (Escuro)**: Uma carcaça preta-escura/obsidiana premium com displays roxos neon.

### 🧠 Algoritmo de Primeiro Clique Seguro
Garante 100% de jogabilidade justa. As minas são distribuídas aleatoriamente *após* a primeira jogada, garantindo que o quadrado clicado e seus 8 vizinhos adjacentes estejam completamente livres de perigos.

### 📋 Chording (Varredura Rápida)
Permite uma jogabilidade de nível profissional. Se você revelar um número (ex: 2) e marcar exatamente duas bandeiras em seus vizinhos adjacentes, você pode **clicar no número** para revelar instantaneamente todas as demais casas vizinhas ocultas com total segurança.

### 🔊 Sintetizador de Áudio Real-Time (Web Audio API)
Todos os sons são gerados na hora através da síntese de ondas puras (sem dependências de áudio externas):
- **Clique de Célula**: Um blip curto de onda triangular a 520Hz.
- **Bandeira**: Um som de travamento mecânico por onda senoidal rápida.
- **Chording**: Um arpejo ascendente de duas notas rápidas (C5 a E5).
- **Explosão (Loss)**: Sintetizado por buffer de ruído branco filtrado com passa-baixa e onda dente de serra para o estrondo.
- **Fanfarra (Win)**: Jingle animado de 6 notas em onda quadrada no melhor estilo 8-bit.

### ⚡ Micro-Animações Imersivas
- **Screen Rumble**: A tela do console treme fisicamente através de um efeito de rotação/vibração CSS quando o jogador explode uma mina.
- **Confete de Vitória**: Uma cascata de pequenas partículas coloridas flutuando pela tela quando o tabuleiro é limpo com sucesso.
- **Cell Reveal**: Um leve "pop" com escala que faz as células abrirem de forma dinâmica.

---

## 🚀 Como Executar

O jogo agora é executado a partir do **Servidor Central** na raiz do repositório:

```bash
python server.py
```

Acesse no navegador: [http://localhost:8000/games/minesweeper/](http://localhost:8000/games/minesweeper/)

---

## 🛠️ Tecnologias Utilizadas

- **Frontend**: HTML5 Semântico, CSS3 (vanilla) e JavaScript ES6+
- **Backend/API**: Python 3 (http.server)
- **Áudio**: Web Audio API (offline, gerado via código)
- **Gráficos**: SVGs em linha para favicons e minas.
- **Tipografia**: Google Fonts (Outfit, Silkscreen, VT323)

Divirta-se desarmando campos minados no Aether-Sweeper! 💣
