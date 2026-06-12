# Aether Chess - Xadrez Premium ♟️

Um jogo de xadrez premium e dinâmico, desenvolvido para rodar diretamente no seu navegador contra uma inteligência artificial local. Possui interface moderna com estilo translúcido (Glassmorphism), efeitos sonoros sintetizados em tempo real, animações de peças, relógio de xadrez Fischer, exportação PGN, 5 temas de peças e 4 temas de tabuleiro.

---

## 📂 Estrutura do Projeto

```
/chess
  ├── css/
  │   └── style.css          # Design System, temas, animações e responsividade.
  ├── js/
  │   ├── app.js             # Controlador principal: eventos, modais, timer, PGN, confetti.
  │   ├── engine.js          # Motor de xadrez: Minimax, Quiescence, Zobrist, Iterative Deepening.
  │   ├── pieces.js          # SVGs vetoriais das peças e sistema de temas.
  │   └── sounds.js          # Sintetizador de áudio via Web Audio API (100% offline).
  ├── .gitignore             # Arquivos ignorados pelo Git.
  ├── favicon.svg            # Ícone SVG do aplicativo (peça de rei estilizada).
  ├── index.html             # Estrutura HTML5 semântica do jogo.
  ├── README.md              # Documentação do projeto (este arquivo).
  ├── scores.json            # Placar local persistente em JSON.
  └── server.py              # Servidor HTTP Python com API REST (GET/POST/DELETE).
```

---

## 💎 Principais Recursos

### 🧠 Inteligência Artificial Avançada

| Técnica | Descrição |
|---------|-----------|
| **Minimax + Alpha-Beta** | Busca em árvore com poda para descartar ramos irrelevantes |
| **Quiescence Search** | Continua avaliando capturas além do horizonte para evitar erros |
| **Tabela de Transposição** | Cache de posições via Zobrist Hashing (até 500k entradas) |
| **Iterative Deepening** | Busca progressiva de profundidade 1 até o alvo |
| **King Endgame PST** | Tabela posicional separada para o rei no final de jogo |
| **Mobility Bonus** | Bônus por mobilidade de peças (3cp por movimento disponível) |
| **Move Ordering** | Ordenação por MVV-LVA e melhor jogada anterior |

**Níveis de dificuldade**: Fácil (1), Médio (2), Difícil (3), Mestre (4).

### 🎨 Visual e Animações

- **Animação suave de peças** — Slide CSS com transição cúbica ao mover.
- **Efeito de captura** — Shake na casa ao capturar uma peça adversária.
- **Confetti de vitória** — Explosão de partículas CSS puro ao vencer.
- **Entrada cascata** — Peças aparecem com staggered fade-in ao iniciar partida.
- **Glow pulsante no rei** — Destaque animado quando o rei está em xeque.
- **5 temas de peças**: Clássico, Neon Glow, Minimalista, Rústico e **Staunton** (premium dourado).
- **4 temas de tabuleiro**: Modern Dark, Emerald Forest, Neon Cyberpunk e Ice Midnight.

### ⏱️ Relógio de Xadrez (Fischer)

- Controles de tempo configuráveis no lobby:
  - 1 min (Bullet), 3 min, 3+2, 5 min, 5+3 (Blitz)
  - 10 min, 10+5, 15+10 (Rápido), 30 min (Clássico)
- Incremento Fischer automático por jogada.
- Display visual com alerta pulsante em vermelho quando tempo baixo (< 30s).
- Derrota por tempo com popup dedicado.

### 📋 Exportar PGN

- Botão "Exportar PGN" copia a partida completa para a área de transferência.
- Formato PGN padrão com headers (Event, Date, White, Black, Result).
- Compatível com qualquer analisador de xadrez (Lichess, Chess.com, etc).

### 🎮 Movimentos e Interação

- **Drag & Drop** nativo + seleção por clique.
- **Setas táticas** — Botão direito + arrastar desenha setas indicativas.
- **Marcações de casa** — Clique direito marca casas com círculo laranja.
- Desfazer jogada (desfaz em par no modo vs CPU).
- Pedir dica com destaque dourado pulsante.

### 🔊 Sons Sintetizados

- Todos os sons gerados em tempo real via **Web Audio API** (100% offline):
  - Mover peça, capturar, xeque, início de partida, fim de jogo (vitória/derrota).

### ♚ Regras Completas

- Roques (Rei e Rainha), En Passant, Promoção (com modal de escolha).
- Xeque-mate, Afogamento, Empate por material insuficiente.
- Regra de 50 lances e Repetição de 3 posições (Threefold Repetition).

### 📊 Placar Local Persistente

- Armazenamento em `scores.json` (vitórias, derrotas, empates).
- API REST completa: `GET /api/score`, `POST /api/score`, `DELETE /api/score` (reset).

---

## 🚀 Como Executar

O jogo requer apenas **Python 3** instalado:

```bash
cd games/chess
python server.py
```

Acesse: [http://localhost:8000/](http://localhost:8000/)

---

## 🛠️ Tecnologias

- **Frontend**: HTML5, CSS3 (vanilla), JavaScript ES6+
- **Backend**: Python 3 (http.server)
- **Audio**: Web Audio API (sem arquivos externos)
- **Gráficos**: SVG inline (sem imagens externas)
- **Fonts**: Google Fonts (Outfit, JetBrains Mono)

---

Divirta-se jogando e aprimorando suas táticas no Aether Chess! ♟️
