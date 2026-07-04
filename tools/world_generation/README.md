# 🗺️ Gerador Procedural de Mundos (Fase 3)

Uma ferramenta baseada no navegador para geração procedural de mundos em 2D, desenvolvida com HTML5 Canvas, CSS Vanilla e JavaScript moderno (ES6+). Ela utiliza ruído de Perlin 2D composto (FBM - Fractal Brownian Motion) para construir matrizes de elevação, umidade e temperatura, combinando-as para classificar biomas geográficos, simular rios por gravidade e propagação de umidade, além de gerar uma camada de civilização com reinos territoriais, cidades e estradas comerciais (via A* Pathfinding), recursos naturais e masmorras procedurais.

---

## 📂 Estrutura de Arquivos
A ferramenta é organizada na seguinte estrutura de arquivos:
```text
tools/world_generation/
├── index.html       # Estrutura do painel de controle e canvas
├── README.md        # Documentação (este arquivo)
├── css/
│   └── style.css    # Tema dark premium com glassmorphism e layout responsivo
└── js/
    ├── script.js    # Arquivo de bootstrap principal (orquestrador)
    ├── generator.js # Regras de biomas, thresholds, rios e cálculo do grid de dados
    ├── noise.js     # Motor matemático de Ruído Perlin 2D e Hashing 32-bit
    ├── renderer.js  # Módulo de renderização no Canvas HTML5, biomas e cores
    ├── ui.js        # Módulo de gerenciamento de inputs da UI e eventos
    └── tests.js     # Suíte de testes unitários (ruído, clima, biomas e rios)
```

---

## 🧮 Modelo Matemático

### 1. Elevação com Warping e Ridge
*   **Distorção de Domínio (Domain Warping)**:
    Para quebrar a rigidez de blocos de biomas arredondados do Perlin clássico, as coordenadas $(x, y)$ são distorcidas por um ruído secundário (`warpNoise` com semente baseada em `seed + 77777`):
    $$dx = Noise_{warp}(x \cdot 0.02, y \cdot 0.02)$$
    $$dy = Noise_{warp}(x \cdot 0.02 + 5.2, y \cdot 0.02 + 1.3)$$
    $$x_{warped} = x + dx \cdot \text{warpStrength}$$
    $$y_{warped} = y + dy \cdot \text{warpStrength}$$
*   **Cristas Montanhosas (Ridge Noise)**:
    As montanhas usam um perfil de crista afiada ($E_{ridge} = 1.0 - |Noise_{elev}|$). Elas são combinadas de forma não-linear com o relevo clássico de FBM ($E_{base}$) apenas em altas altitudes usando uma interpolação manual de `smoothstep`:
    $$t = \text{smoothstep}(0.40, 0.75, E_{base})$$
    $$E_{final} = (1.0 - t) \cdot E_{base} + t \cdot \left( E_{ridge}^2 \cdot 1.25 \right)$$

### 2. Umidade e Efeito da Distância à Costa
*   **Brisa Marinha**: A umidade é atenuada conforme a distância até o oceano ou mar raso ($E < 0.26$) aumenta.
*   **Busca Multi-fonte (BFS)**: Computamos em tempo linear $O(N)$ a menor distância de todas as células de terra firme até o litoral.
*   **Modificação de Umidade**: A distância é normalizada pela maior distância continental encontrada ($maxDist$). A umidade diminui progressivamente em áreas interiores:
    $$M_{final} = M_{base} \cdot (1.0 - dist_{costa\_norm} \cdot 0.50)$$

### 3. Erosão Hidráulica Pós-processada
O relevo é esculpido simulando partículas de gotículas de chuva que caem em terra firme e descem as encostas seguindo o gradiente de altura do grid. O número de iterações é limitado em `Math.min(intensidade * gridSize, 20000)`.
*   Gotículas desgastam encostas íngremes (erosão) e depositam sedimentos quando encontram vales ou descidas suaves (depósito), suavizando cânions e acentuando picos.
*   Gotículas evapora-se e perde velocidade por atrito a cada passo de descida.

### 4. Temperatura ($T$)
A temperatura final ($T$) de qualquer célula combina um fator de clima base ($T_{lat}$) e a atenuação por altitude (elevação $E$):
$$T = T_{lat} \cdot (1.0 - weight_{alt} \cdot E)$$

O fator de clima base ($T_{lat}$) é calculado através de um dos três modelos disponíveis na UI:
*   **Planetário (Equador Central)**:
    Equador central quente e pólos frios lineares nas bordas superior e inferior do mapa.
    $$T_{lat} = 1.0 - \left| 2 \cdot \frac{y}{Y_{max}} - 1 \right|$$
*   **Inclinado (Rotacionado por Seed)**:
    Um equador diagonal ou vertical inclinado por um ângulo determinístico $\theta$ e com o centro do mapa transladado de forma aleatória com base na semente (seed).
    *   $\theta = (hash32(seed + 101) \% 360) \cdot \frac{\pi}{180}$
    *   Distância perpendicular de qualquer célula $(x, y)$ à reta: $d = -\sin\theta \cdot (x - centerX) + \cos\theta \cdot (y - centerY)$
    *   Temperatura normalizada usando a diagonal máxima do grid ($maxDist = \sqrt{2} \cdot size$):
        $$T_{lat} = 1.0 - \min\left(1.0, \frac{|d|}{maxDist / 2}\right)$$
*   **Ruído Livre (Zonas de Fantasia)**:
    A temperatura básica é gerada por uma terceira camada de ruído Perlin independente de baixa frequência (escala térmica suave correspondente a $1/3$ da escala do relevo) e 2 oitavas para criar bolsas de clima orgânicas e não-lineares.
    *   $T_{lat} = \text{tempNoiseFBM}(x \cdot \text{freq}, y \cdot \text{freq})$ normalizado entre $[0.0, 1.0]$.

### 5. Geração de Rios por Gravidade e Propagação de Umidade (Fase 2)
*   **Seleção de Sementes/Nascentes**: Células terrestres ($E \ge 0.26$) com maior pontuação ($Score = E \cdot M$) são priorizadas. O espalhamento das nascentes é garantido por uma distância mínima (Manhattan) dinâmica calculada sobre a resolução do grid:
    $$minDist = \max(10, \lfloor gridSize \cdot 0.08 \rfloor)$$
*   **Caminho do Curso d'Água (Gradient Descent)**: A partir de cada nascente, simulamos a água correndo colina abaixo. O rio caminha passo a passo em direção ao vizinho terrestre com menor elevação. A simulação encerra ao encontrar o oceano ($E < 0.26$) ou ao cair em uma depressão local (formando um `LAKE`).
*   **Propagação de Umidade (BFS)**: A partir de todas as células de rio e lago terrestres, rodamos uma BFS com limite de profundidade igual ao raio selecionado ($R$). Células terrestres visitadas a uma distância $d \le R$ ganham um incremento linear de umidade:
    $$\Delta M = \text{Força} \cdot \left(1.0 - \frac{d}{R + 1}\right)$$
    $$M_{final} = \min(1.0, M_{atual} + \Delta M)$$

### 6. Civilizações, Reinos e Estradas Comerciais (Fase 3)
*   **Geração de Assentamentos (Cidades e Vilas)**: Células planas terrestres ($E \ge 0.26$, evitando montanhas $E > 0.80$) com alta proximidade a fontes de água doce (rios e lagos) são selecionadas como polos de desenvolvimento. Elas são classificadas deterministicamente como Capitais, Cidades ou Vilas. Os nomes das cidades e reinos são gerados usando hashes determinísticos da semente.
*   **Territórios e Fronteiras (BFS Territorial)**: A partir das Capitais, os territórios dos reinos expandem-se simulando crescimento populacional em áreas terrestres através de uma busca em largura (BFS) coordenada. Quando territórios de reinos distintos entram em contato, a célula de colisão é marcada como fronteira comercial (`isFrontier`).
*   **Rotas Comerciais e Estradas (A* Pathfinding)**: As cidades e capitais próximas são conectadas por estradas. O trajeto é calculado usando o algoritmo $A^*$ com uma função de custo heurística inteligente:
    $$Custo = C_{base} + \Delta E \cdot 15.0 + Penalidade_{Bioma} + Penalidade_{Rio} - Desconto_{Estrada}$$
    *   $C_{base}$ é $1.0$ para movimentos ortogonais e $1.414$ para diagonais.
    *   $\Delta E$ é a diferença de altitude acumulada.
    *   Penalidades adicionais são aplicadas para cruzar rios (+4), pântanos (+6), selvas (+2), desertos (+1.5) e picos nevados (+20, intransponível).
    *   Se a estrada já existe, o custo é reduzido drasticamente para $0.15$ para incentivar o compartilhamento de trechos de rotas comerciais.
    *   Estradas são bloqueadas de cruzar oceanos e lagos.
*   **Distribuição de Recursos**: Recursos são gerados deterministicamente com base na aptidão do bioma: `wood` (madeira em florestas e selvas), `ore` (minério em montanhas de neve), `stone` (pedra/areia em desertos e tundras), `crops` (agricultura em savanas e planícies), `fish` (pesca em águas rasas).
*   **Masmorras (Dungeons) e POIs**: Estruturas abandonadas (`temple` ou `ruins`) são geradas proceduralmente em áreas remotas e inóspitas, distantes das rotas comerciais e das cidades.

---

## 🌿 Tabela de Classificação de Biomas
Um objeto de configuração unificado (`BIOME_THRESHOLDS`) no topo de `js/generator.js` define as transições:
1.  **Oceano Profundo**: $E < 0.15$
2.  **Mar Raso**: $0.15 \le E < 0.22$
3.  **Praia**: $0.22 \le E < 0.26$
4.  **Terra Firme**: $E \ge 0.26$
    *   **Picos Nevados (Montanha)**: $E > 0.80$ (picos gelados independente da latitude devido à atenuação da altitude)
    *   **Região Fria** ($T < 0.35$): **Tundra**
    *   **Região Temperada** ($0.35 \le T < 0.70$):
        *   Seco ($M < 0.33$): **Planície (Grassland)**
        *   Úmido ($0.33 \le M < 0.66$): **Floresta Temperada**
        *   Muito Úmido ($M \ge 0.66$): **Pântano** (se $E < 0.45$) ou **Floresta Temperada** (caso contrário)
    *   **Região Quente** ($T \ge 0.70$):
        *   Seco ($M < 0.30$): **Deserto**
        *   Úmido-Médio ($0.30 \le M < 0.60$): **Savana**
        *   Muito Úmido ($M \ge 0.60$): **Floresta Tropical (Jungle)**
5.  **Rio**: Células terrestres que formam os canais de fluxo de água doce (cor `#00b4d8`).
6.  **Lago**: Células terrestres em depressões onde a água de rio se acumula sem vazão (cor `#0077b6`).

---

## ⚙️ Controles Interativos
*   **Semente (Seed)**: Insira qualquer número ou gere uma semente aleatória de 8 dígitos.
*   **Resolução do Grid**: Slider variando de $50 \times 50$ a $250 \times 250$. O tamanho das células no canvas é calculado dinamicamente como $cellSize = canvasSize / gridSize$.
*   **Rios e Lagos (Fase 2)**: Sliders para regular a Quantidade de Rios, o Raio de Umidade (alcance da BFS) e a Força da Umidade (ganho de moisture) no relevo.
*   **Modelo de Distribuição**: Dropdown para escolher entre as três dinâmicas de temperatura (Planetário, Inclinado, Ruído Livre).
*   **Refinamentos Avançados**:
    *   *Distorção (Warp)*: Controla o nível de dobramento e desalinhamento de biomas e relevos, gerando litorais mais recortados e orgânicos.
    *   *Erosão Hidráulica*: Controla a intensidade do pós-processamento erosivo que simula gotas de chuva desgastando picos e suavizando ravinas.
*   **Controles de Elevação**: Ajuste a escala, oitavas e persistência do ruído.
*   **Controles de Umidade**: Ajuste a escala e oitavas do ruído.
*   **Controles de Temperatura**: Ajuste a atenuação por altitude.
*   **Camadas de Renderização (Tabs)**: Alterne visualizações (Biomas, Elevação, Umidade, Temperatura) instantaneamente.
*   **Civilizações & Recursos (Fase 3)**:
    *   *Quantidade de Cidades*: Slider para definir quantos núcleos urbanos serão semeados no mapa terrestre.
    *   *Camadas de Exibição (Checkboxes)*: Permite renderizar overlays independentes de Cidades e Rotas Comerciais, Recursos Naturais, Reinos e Fronteiras, e Dungeons no Canvas sem necessitar do re-cálculo da matriz de biomas (redesenho dinâmico).
*   **Feedback Debounced**: Atualiza o canvas automaticamente 100ms após o término dos arrastes de sliders.
*   **Hover Tooltip Ampliado**: Ao passar o cursor sobre o Canvas, a barra de status inferior exibe de forma reativa a coordenada, elevação, umidade, temperatura, bioma detalhado (incluindo o nome e tipo de cidades/vilas/dungeons da célula), recurso ativo com sua densidade, e o nome do reino correspondente (indicando se é uma área de fronteira territorial).
