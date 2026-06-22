# Aether Tic-Tac-Toe - Jogo da Velha Premium ❌ (Minimax AI Edition)

Um jogo da velha premium e imersivo, desenvolvido com foco na simulação e duelo contra Inteligência Artificial. Utiliza o algoritmo Minimax com poda Alpha-Beta para garantir decisões perfeitas e instantâneas (abaixo de 1ms). Conta com visual glassmorphic, efeitos sonoros sintetizados offline em tempo real e persistência de recordes globais via API local.

---

## 📂 Estrutura do Projeto

```
/tictactoe
  ├── css/
  │   └── style.css          # Design System (efeitos de glow, glassmorphism e temas visuais).
  ├── docs/
  │   └── system_explanation.md # Explicação técnica da inteligência artificial Minimax e sons.
  ├── js/
  │   ├── app.js             # Lógica principal, renderização do grid, animações e o solver Minimax.
  │   └── sounds.js          # Mapeamento do sintetizador retro via Web Audio API.
  ├── favicon.svg            # Ícone SVG personalizado com grade de neon e marcadores.
  ├── index.html             # Estrutura HTML5 semântica e interface do console.
  └── README.md              # Documentação do projeto (este arquivo).
```

---

## 💎 Principais Recursos

### 🎨 Design Glassmorphic & Quatro Temas Cromáticos
A interface se baseia em painéis translúcidos com efeito blur e bordas refinadas. As marcas X e O são desenhadas via CSS e emitem brilho em neon dinamicamente de acordo com o tema selecionado:
1. **Cyberpunk (Default)**: Visual escuro cyberpunk com X em rosa magenta e O em azul ciano.
2. **Neon Glow (Moderno)**: Tons de roxo profundo e azul aether com glows elegantes.
3. **Retro Arcade (Verde)**: Verde fósforo clássico de fliperama e laranja amber.
4. **Glass Sólido (Minimalista)**: Visual monocromático limpo com reflexos brancos puros e sem glows excessivos.

### 🧠 Algoritmo Minimax com Poda Alpha-Beta
A IA simula e pontua todas as ramificações possíveis de jogadas do tabuleiro a partir da célula atual:
* **Minimax**: A IA tenta maximizar sua nota final enquanto assume que o oponente tentará minimizá-la. Possui pontuação ponderada por profundidade, fazendo a IA preferir vencer mais rápido (win-fast) e atrasar a derrota (delay-loss).
* **Poda Alpha-Beta**: Descarta ramos da árvore de decisão que comprovadamente não alterarão o resultado final da jogada, otimizando o processamento para menos de **1ms**.
* **Níveis de Dificuldade**:
  * *Fácil*: IA faz apenas movimentos aleatórios.
  * *Médio*: IA tem 50% de chance de usar a melhor jogada do Minimax e 50% de cometer uma falha aleatória.
  * *Impossível*: IA imbatível que joga perfeitamente (resultando sempre em empate ou derrota para o jogador).

### 👥 Três Modos de Jogo
* **Humano vs IA**: Enfrente o motor inteligente com dificuldade customizável e escolha quem joga primeiro.
* **PvP Local**: Jogue localmente no mesmo teclado/tela contra um amigo, alternando os turnos de X e O.
* **Simulação**: Assista a duas IAs jogarem de forma contínua com controle de velocidade de ticks (Lento, Normal, Rápido, Hyper).

### 🔊 Sintetizador de Áudio Real-Time (Web Audio API)
Efeitos gerados matematicamente na hora:
- **Jogada do X**: Onda quadrada curta aguda a 440Hz subindo para 550Hz.
- **Jogada do O**: Onda triangular curta caindo de 330Hz para 220Hz.
- **Vitória**: Arpejo alegre ascendente em tom maior.
- **Derrota**: Arpejo lento descendente em tom menor.
- **Empate**: Cliques mecânicos gêmeos.

### 📋 Diagnósticos Científicos da IA
O painel direito detalha métricas reais da busca:
- Algoritmo ativo.
- Número de nós analisados na jogada.
- Tempo de cálculo exato em milissegundos.
- Coordenadas de decisão avaliada (ex: "Linha 1, Coluna 2").

---

## 🚀 Como Executar

O jogo é executado a partir do **Servidor Central** na raiz do repositório:

```bash
python server.py
```

Acesse no navegador: [http://localhost:8000/games/tictactoe/](http://localhost:8000/games/tictactoe/)

---

## 🛠️ Tecnologias Utilizadas

- **Frontend**: HTML5 Semântico, CSS3 (vanilla) e JavaScript ES6+
- **Backend/API**: Python 3 (http.server)
- **Áudio**: Web Audio API (offline, gerado via código)
- **Desenhos**: SVGs em linha para favicons e linhas de corte de vitória.
- **Tipografia**: Google Fonts (Inter, JetBrains Mono)

Divirta-se jogando (ou testando seu algoritmo contra) o Aether Tic-Tac-Toe! ❌
