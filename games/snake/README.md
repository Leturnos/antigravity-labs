# Aether Snake - Cobrinha Inteligente 🐍 (IA Autopilot Edition)

Um jogo de cobrinha premium e interativo, desenvolvido com foco na simulação visual de Inteligência Artificial em tempo real. Possui design minimalista inspirado no Raycast, controle de velocidade e visualização de nós buscados, sintetizador de som offline em tempo real, além de integração com servidor central para persistência de recordes.

---

## 📂 Estrutura do Projeto

```
/snake
  ├── css/
  │   └── style.css          # Design System (temas neon, cyberpunk, classic, grids e animações).
  ├── docs/
  │   └── system_explanation.md # Explicação detalhada da IA e engenharia de som do jogo.
  ├── js/
  │   ├── app.js             # Lógica do jogo, renderização em Canvas e algoritmos de IA (BFS, Flood Fill).
  │   └── sounds.js          # Mapeamento do sintetizador retro via Web Audio API.
  ├── favicon.svg            # Ícone SVG personalizado com cobra verde neon.
  ├── index.html             # Estrutura HTML5 semântica e interface do console de controle.
  └── README.md              # Documentação do projeto (este arquivo).
```

---

## 💎 Principais Recursos

### 🎨 Visual Raycast & Quatro Temas Premium
A interface utiliza o tema escuro característico do Raycast.com, com foco em painéis translúcidos e fontes nítidas. O jogo conta com quatro temas cromáticos selecionáveis na lateral esquerda:
1. **Neon Glow (Moderno)**: Corpo em degradê verde neon brilhante com cabeça branca.
2. **Retro Arcade (Verde)**: Segmentos verde-fósforo simples delimitados pela grade do monitor CRT.
3. **Cyberpunk (Rosa/Ciano)**: Corpo rosa neon com rastro ciano e faíscas amarelas.
4. **Classic Block (Sólido)**: Visual plano monocromático em cinza e branco para foco máximo.

### 🧠 Algoritmos da Inteligência Artificial (Autopilot)
O jogo possui uma IA integrada capaz de preencher o tabuleiro por completo automaticamente através de quatro heurísticas acopladas:
* **Busca em Largura (BFS)**: Traça a rota mais curta matemática até a comida.
* **Simulação Virtual de Segurança (Virtual Safety Check)**: Antes de dar um passo até a comida, a IA clona a si mesma e simula comer a fruta. No estado simulado, ela verifica se a cauda ainda é alcançável. Se for, executa o movimento; se não for, recusa a fruta temporariamente para evitar encurralamentos.
* **Seguimento de Cauda (Tail-Following)**: Se a rota para a comida não for segura, a IA segue sua própria cauda. À medida que o corpo se move, blocos são liberados, garantindo sobrevivência perpétua.
* **Flood Fill de Emergência**: Se tanto a comida quanto a cauda estiverem inacessíveis, a IA analisa os vizinhos livres e move-se na direção da maior área conectada livre para postergar a colisão.

### 🔊 Sintetizador de Áudio Real-Time (Web Audio API)
Sons gerados sob demanda utilizando a placa de som (100% offline):
- **Comer Fruta (`Eat`)**: Um arpejo ascendente de duas notas senoidais curtas (C5 a E5).
- **Colisão (`Crash`)**: Ruído branco misturado com filtro passa-baixas abaixando de 1000Hz para 40Hz em 350ms, simulando um abafamento mecânico de impacto.
- **Pausa / Retomada**: Cliques de onda triangular com frequências alternadas.

### ⚡ Diagnósticos em Tempo Real
Exibe estatísticas úteis ao desenvolvedor e entusiastas:
- Número de nós verificados pelo algoritmo BFS a cada tick.
- Tamanho exato da rota calculada.
- Status atual da IA (ex: "SEGUINDO COMIDA", "SEGUINDO CAUDA", "MODO EMERGÊNCIA").
- Taxa de frames (FPS) e pontuação de sessão.

---

## 🚀 Como Executar

O jogo é executado a partir do **Servidor Central** na raiz do repositório:

```bash
python server.py
```

Acesse no navegador: [http://localhost:8000/games/snake/](http://localhost:8000/games/snake/)

---

## 🛠️ Tecnologias Utilizadas

- **Frontend**: HTML5 Semântico, CSS3 (vanilla) e JavaScript ES6+
- **Renderização**: Canvas HTML5
- **Backend/API**: Python 3 (http.server)
- **Áudio**: Web Audio API (offline, gerado via código)
- **Tipografia**: Google Fonts (Inter, JetBrains Mono)

Divirta-se assistindo a IA bater recordes ou teste seus reflexos no modo manual! 🐍
