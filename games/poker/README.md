# Aether Poker — Texas Hold'em Premium ♦️ (Edição Comando)

Aether Poker é um simulador premium e imersivo de Texas Hold'em desenvolvido com foco em design moderno, jogabilidade fluida e duelabilidade de Inteligência Artificial. Conta com múltiplos perfis de bots dinâmicos, resolução matemática perfeita de potes paralelos (side pots), design Raycast glassmorphic responsivo, atalhos de teclado ágeis e efeitos sonoros sintetizados offline via Web Audio API.

---

## 📂 Estrutura do Projeto

```text
/poker
  ├── css/
  │   └── style.css            # Design System (variáveis de cor Raycast, glassmorphism, glows e micro-interações).
  ├── docs/
  │   └── system_explanation.md # Explicação matemática e arquitetural do avaliador, IA e side pots.
  ├── js/
  │   ├── ai.js                # Perfis de Inteligência Artificial (decisões, cálculo de hand strength e pot odds).
  │   ├── evaluator.js         # Mecanismo de pontuação matemática e kicker resolution de mãos de 5/2 cartas.
  │   ├── poker.js             # Motor principal do jogo (game loop, blinds, turnos, UI rendering e integração API).
  │   └── sounds.js            # Mapeamento do sintetizador retro via Web Audio API.
  ├── index.html               # Estrutura HTML5 semântica e interface do console de jogo.
  └── README.md                # Documentação do projeto (este arquivo).
```

---

## 💎 Principais Recursos

### 🎨 Design Raycast & Visual Glassmorphic
A interface simula uma mesa de feltro moderna com elements translúcidos e bordas refinadas de alta definição, inspirada no visual Raycast e Linear:
- **Painéis Translúcidos (Glassmorphism)**: Efeito de desfoque de fundo e bordas sutis.
- **Seat Positions Dinâmicas**: Suporta de 2 a 6 jogadores (você contra até 5 bots) organizados na mesa de forma circular e limpa.
- **Micro-Animações**: Flip tridimensional das cartas no pre-flop e no showdown, e bolhas de ação animadas para cada jogador.

### 🧠 Inteligência Artificial Adaptativa & Perfis Psicológicos
Os bots não jogam de forma puramente matemática; eles possuem estratégias e perfis bem definidos em [ai.js](js/ai.js):
1. **Shark (Tight-Aggressive)**: Blefa raramente, joga mãos fortes de forma agressiva (raises pesados) e desiste facilmente de mãos fracas.
2. **Fish (Loose-Aggressive / Bluff-prone)**: Adora ver o flop, tem alta propensão a blefes (especialmente no River com 25% de taxa de blefe) e tenta forçar desistências com apostas.
3. **Passive / Caller (Passive Calling Station)**: Raramente faz raises, mas dá call constantemente para tentar acertar cartas.
4. **Random**: IA caótica (opcional) que toma decisões imprevisíveis de aposta e check para fins de simulação recreativa.

### 💰 Resolução Avançada de Potes Paralelos (Side Pots)
Implementação de um algoritmo clássico e robusto no showdown para processar e distribuir as fichas quando múltiplos jogadores estão em All-in com diferentes volumes de fichas apostados na mão. As fichas são agrupadas em potes paralelos qualificados onde apenas os jogadores que contribuíram competem pelo montante do respectivo pote.

### 🎮 Dois Modos de Jogo e Configuração Customizada
- **Cash Game**: Compre fichas na mesa e saia com seus lucros (Cashout) a qualquer momento. Se quebrar, é possível recarregar seu stack instantaneamente.
- **Torneio Sit & Go**: Duelo de eliminação. Os blinds dobram a cada 5 mãos disputadas. O jogo só termina quando resta um único jogador com todas as fichas na mesa.

### 🔊 Sintetizador de Áudio Real-Time (Web Audio API)
Efeitos dinâmicos sintetizados em tempo real diretamente pelo navegador sem carregar arquivos MP3 ou de áudio externos:
- **Deal / Flipped Card**: Varredura de frequência triangular e ruído de fricção simulando papel.
- **Fold / Pass**: Ruído de atrito rápido simulando o descarte da carta no feltro.
- **Chips / Bets**: Sons de moedas/fichas tilintando em frequências de alta ressonância (sine waves).
- **Check**: Batida oca (wood knock) dupla no tampo da mesa utilizando tons graves triangulares.
- **Win Fanfare**: Arpejo retrô ascendente brilhante.

### ⌨️ Atalhos de Teclado & Usabilidade
Ações ágeis utilizando o teclado para jogadores profissionais:
* **F**: Fold (Desistir)
* **C**: Check / Call (Passar / Acompanhar)
* **R**: Raise (Aumentar)
* **Arrow Up / Arrow Down**: Ajustar o tamanho do aumento no Slider.

---

## 🚀 Como Executar

O jogo funciona através do **Servidor Central** unificado na raiz do repositório:

1. Inicialize o servidor na raiz:
   ```bash
   python server.py
   ```
2. Abra o navegador no link correspondente: [http://localhost:8000/games/poker/](http://localhost:8000/games/poker/)

---

## 🛠️ Tecnologias Utilizadas

- **Frontend**: HTML5 Semântico, CSS3 (vanilla) e JavaScript ES6+
- **Backend/Score API**: Python 3 (servidor local de score JSON)
- **Áudio**: Web Audio API (RetroAudioEngine offline)
- **Biblioteca de Ícones**: Fontes Web / Unicode nativos e Google Fonts (Inter, JetBrains Mono)
