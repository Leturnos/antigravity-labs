# 🗺️ Gerador Procedural de Mundos (Fase 6)

Uma ferramenta baseada no navegador para geração procedural de mundos em 2D e 3D, desenvolvida com HTML5 Canvas, CSS Vanilla e JavaScript moderno (ES6+). Ela utiliza ruído de Perlin 2D composto (FBM - Fractal Brownian Motion) para construir matrizes de elevação, umidade e temperatura, combinando-as para classificar biomas geográficos, simular rios por gravidade e propagação de umidade, além de gerar uma camada de civilização com reinos territoriais, cidades e estradas comerciais (A*). A Fase 4 implementa uma simulação histórica interativa e dinâmica, com timeline visual, desastres climáticos, expedições de masmorra, eventos animados no Canvas e crônicas clicáveis que revelam a localização dos eventos no mapa. A Fase 5 adiciona exportação completa do mundo gerado em JSON, incluindo todos os dados do grid, civilizações, crônicas e metadados de geração. A Fase 6 adiciona uma visualização tridimensional interativa com o motor Three.js, oferecendo renderização voxel de terreno, sombras projetadas dinâmicas, controle de órbita da câmera, raycasting para hover interativo nas células e um sistema de partículas 3D para eventos históricos em tempo real.

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
    ├── renderer3d.js# Módulo de renderização 3D tridimensional com Three.js e OrbitControls
    ├── ui.js        # Módulo de gerenciamento de inputs da UI e eventos
    └── tests.js     # Suíte de testes unitários e de integração (incluindo ciclo 3D)
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

### 7. Simulação Histórica Dinâmica, Eventos do Canvas e Timeline (Fase 4)
*   **Log de Crônicas com Coordenadas**: Todos os eventos relevantes gerados na simulação histórica possuem coordenadas $(x, y)$ mapeadas. Isso permite ligar a história textual à sua manifestação física no mapa de biomas.
*   **Indicadores Visuais Temporários (Canvas Animation Loop)**: Quando eventos ocorrem (guerra, comércio, fundação, fome, expedições), um laço de repintura é acionado a cada 100ms no Canvas. Ele desenha círculos de calor e emojis correspondentes que sobem e sofrem *fade-out* (decaimento dinâmico de `age` de 10.0 a 0).
*   **Eventos Históricos Ambientais e de Exploração**:
    *   *Desastres Climáticos (Seca/Praga)*: Chance anual de 2%. Escolhe uma cidade ativa de forma aleatória, esgota seu estoque de comida e dizima 10% da sua população.
    *   *Expedições de Masmorra*: Chance anual de 4%. Os reinos enviam tropas para conquistar masmorras próximas. Se o poder militar do reino superar a barreira da masmorra, o reino ganha bônus de recursos. Caso contrário, a expedição falha com baixas de soldados (perda de população).
*   **Crônicas Clicáveis Interativas**: Os logs gerados na UI suportam escuta de cliques. Ao clicar em um evento do log lateral, um evento global `highlight-cell` é emitido, desenhando um retículo de foco pulsante duplo na coordenada do evento no Canvas por 1,5 segundos.
*   **Timeline Gráfica de Progresso**: Um elemento slider progressivo na UI indica visualmente o progresso temporal em tempo real, sincronizado de forma reativa a cada incremento de ano na simulação.

### 8. Exportação de Mundo em JSON (Fase 5)
*   **Serialização Completa (`serializeWorld`)**: A função `serializeWorld(grid, params)` em `generator.js` serializa todo o estado do mundo atual em um objeto JSON puro (sem referências circulares), pronto para uso externo ou arquivamento.
*   **Estrutura do JSON exportado**:
    *   `metadata`: informações de geração (generator, versão, seed, tamanho do grid, ano histórico atual, parâmetros de geração completos).
    *   `stats`: contagens resumidas de cidades, reinos, masmorras, rios, rotas e crônicas.
    *   `cities`, `kingdoms`, `dungeons`, `rivers`, `routes`: arrays com os dados de cada entidade civilizatória.
    *   `chronicles`: histórico completo de eventos da simulação com ano, descrição e coordenadas.
    *   `grid`: matriz completa de células com elevação, umidade, temperatura, bioma, recursos e informações territoriais.
*   **Download via Browser**: O botão **📦 Exportar Mundo (JSON)** na interface dispara o download automático de um arquivo `.json` nomeado como `world_{N}x{N}_seed_{seed}_year_{ano}.json`. Grids grandes (ex.: 250×250) podem gerar arquivos de 15 MB ou mais.
*   **Testes de Serialização**: A suíte de testes em `tests.js` inclui `runExportTests()`, que valida a integridade do JSON (ausência de referências circulares, presença de todos os nós obrigatórios, coerência de contagens e estrutura dos dados de rios e crônicas).

### 9. Visualização Tridimensional Interativa com Three.js (Fase 6)
*   **Carregamento Sob Demanda (Lazy Loading)**: As bibliotecas **Three.js**, **OrbitControls**, **BufferGeometryUtils** e **Tween.js** são injetadas dinamicamente via CDN apenas quando o Modo 3D é ativado, mantendo o boot inicial da página leve.
*   **Renderização Voxel Otimizada (`InstancedMesh`)**: O terreno tridimensional usa uma malha instanciada (`THREE.InstancedMesh`) com cubos padrão (`THREE.BoxGeometry`). Cada célula do grid é posicionada e escalada no eixo Y proporcionalmente à sua elevação ($Height = \max(0.1, E \cdot 15.0)$), reduzindo os draw calls de milhares para apenas 1, garantindo 60 FPS estáveis mesmo em resoluções de $250 \times 250$.
*   **Plano de Água Translúcido Premium**: O oceano é representado por uma malha plana (`THREE.PlaneGeometry`) com material físico tridimensional (`THREE.MeshStandardMaterial`) ajustado na altura correspondente à linha costeira ($E = 0.22$), com opacidade parcial ($75\%$) e parâmetros de rugosidade baixos (`roughness: 0.15`, `metalness: 0.2`) resultando em um visual sofisticado de "reflective glass".
*   **Representação 3D de Elementos Civis e Naturais (Com Modelos Low-Poly e Escala Proporcional)**:
    *   *Escala Dinâmica Proporcional*: Todas as estruturas 3D, recursos e árvores são dimensionados a partir de um fator de escala dinâmico proporcional à resolução do grid: `modelScale = Math.max(1.0, gridSize / 80)`, mantendo a visibilidade e o destaque de longe em mapas grandes sem afundar ou flutuar sobre o terreno.
    *   *Cidades e Capitais (Low-Poly)*: As cidades são modeladas de forma procedural. Capitais são castelos completos com muralha circular, 4 torres de canto com telhados cônicos coloridos na cor do reino correspondente e uma torre de menagem central. Cidades são clusters de 3 casinhas com telhados piramidais. Vilas são casinhas individuais. Cidades abandonadas viram ruínas cinzas achatadas.
    *   *Dungeons e POIs*: Modeladas como torres de pedra em ruínas cinza escuras com um portal de cubo emissivo vermelho brilhante (`#ef4444`) na base.
    *   *Estradas e Rotas (Geometrias Mergeadas)*: As estradas são modeladas de forma ultra otimizada. Os segmentos de planos direcionais são rotacionados, posicionados por transformações de matrizes e fundidos em apenas 2 meshes unificados (`roadMesh` marrom e `tradeRoadMesh` dourado) através de `THREE.BufferGeometryUtils.mergeBufferGeometries`, diminuindo de centenas para apenas 2 draw calls na cena.
    *   *Árvores e Florestas Instanciadas*: O recurso de madeira (`wood`) gera florestas tridimensionais otimizadas via `THREE.InstancedMesh`. Uma única geometria composta de tronco cilíndrico e copa cônica é instanciada sobre as células apropriadas com escala ligeiramente aleatória para um visual orgânico.
    *   *Recursos*: Outros recursos terrestres geram pequenos marcadores de esferas com cores correspondentes.
*   **Ciclo Dia/Noite Sincronizado**: Controle orbital da iluminação direcional (sol) e ambiente associado determinísticamente à timeline/anos da simulação. O sol rotaciona no céu gerando transições de amanhecer (tons quentes de sol laranja e luar azulado), meio-dia (luz forte e clara) e noite (sol desativado, luz ambiente azul escuro simulando luar), onde as masmorras e portais se destacam devido à sua emissividade vermelha. O ciclo pode ser ativado/desativado na UI.
*   **Interatividade por Raycasting**: Um raio é projetado a partir da posição do mouse (`THREE.Raycaster`) na tela em direção à malha instanciada do terreno. A interseção descobre o índice da célula no grid, permitindo atualizar reativamente a barra de status com coordenadas, biomas, reinos e estatísticas. Um contorno wireframe (`hoverHelper`) destaca a célula inspecionada.
*   **Transições Suaves de Câmera (Tween.js)**: Ao clicar em logs de crônicas ou destaques de mapa, a câmera e o target do OrbitControls realizam transições de pan e foco amortecidos muito elegantes usando curvas de easing Cubic Out. Tweens concorrentes em andamento são interrompidos automaticamente para evitar conflitos de movimento.
*   **Ciclo de Descarte (Memory Cleanup)**: Ao alternar de volta para o Modo 2D, o contexto WebGL é completamente limpo (`destroyRenderer3D`). Todas as geometrias, materiais, texturas e listeners de redimensionamento são descartados via `.dispose()` para garantir que não haja vazamentos de memória.

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
*   **Simulação Histórica & Timeline (Fase 4)**:
    *   *Controles de Reprodução*: Botões para Iniciar/Pausar a simulação automática (velocidade de 450ms por ano), avançar passo a passo (+1 Ano) ou reiniciar o mundo (Reset).
    *   *Linha do Tempo Visual*: Uma barra de progresso horizontal que reflete a passagem dos anos em tempo real.
    *   *Logs de Crônicas Interativas*: Clique em qualquer entrada do log lateral para fazer a câmera destacar a localização exata do acontecimento no Canvas.
*   **Exportação de Mundo (Fase 5)**:
    *   *Botão 📦 Exportar Mundo (JSON)*: Serializa o estado completo do mundo gerado (grid, civilizações, crônicas e metadados) e inicia o download de um arquivo `.json` nomeado com o tamanho do grid, seed e ano histórico corrente.
*   **Visualização 3D Interativa (Fase 6)**:
    *   *Modo 2D/3D (Tabs)*: Alterne livremente entre o canvas bidimensional clássico e o espaço tridimensional com Three.js.
    *   *OrbitControls*: Use o mouse para navegar (botão esquerdo para rotacionar o mundo, scroll para zoom, botão direito para mover a câmera).
    *   *Sombras 3D (Checkbox)*: Ativa projeção de sombras em tempo real no terreno (pode afetar o desempenho em computadores mais modestos).
    *   *Resetar Câmera (Botão)*: Reposiciona a câmera e o foco de controle no centro do mapa.
*   **Feedback Debounced**: Atualiza o canvas ou redesenha a cena 3D automaticamente 100ms após o término dos arrastes de sliders.
*   **Hover Tooltip Ampliado**: Ao passar o cursor sobre o Canvas 2D ou o contêiner 3D, a barra de status inferior exibe de forma reativa a coordenada, elevação, umidade, temperatura, bioma detalhado (incluindo o nome e tipo de cidades/vilas/dungeons da célula), recurso ativo com sua densidade, e o nome do reino correspondente (indicando se é uma área de fronteira territorial).
