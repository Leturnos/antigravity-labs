# 🗺️ Gerador Procedural de Mundos (Fase 1)

Uma ferramenta baseada no navegador para geração procedural de mundos em 2D, desenvolvida com HTML5 Canvas, CSS Vanilla e JavaScript moderno (ES6+). Ela utiliza ruído de Perlin 2D composto (FBM - Fractal Brownian Motion) para construir matrizes de elevação, umidade e temperatura, combinando-as para classificar biomas geográficos.

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
    ├── script.js    # Arquivo de bootstrap principal: UI, Canvas e loop de renderização
    ├── generator.js # Regras de biomas, thresholds e cálculo do grid de dados
    ├── noise.js     # Motor matemático de Ruído Perlin 2D e Hashing 32-bit
    └── tests.js     # Suíte de testes unitários para ruído, clima e biomas
```

---

## 🧮 Modelo Matemático

### 1. Elevação e Umidade
*   **Elevação ($E$)**: Calculada somando várias oitavas de ruído de Perlin (FBM) baseadas na semente, escala e persistência definidas pelo usuário.
*   **Umidade ($M$)**: Gerada a partir de uma instância independente de ruído de Perlin. Para eliminar qualquer correlação direcional visual com a elevação, sua semente é derivada da semente principal usando a função de hash de 32 bits `hash32(seed + 99999)`.

### 2. Temperatura ($T$)
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

---

## ⚙️ Controles Interativos
*   **Semente (Seed)**: Insira qualquer número ou gere uma semente aleatória de 8 dígitos.
*   **Resolução do Grid**: Slider variando de $50 \times 50$ a $250 \times 250$. O tamanho das células no canvas é calculado dinamicamente como $cellSize = canvasSize / gridSize$.
*   **Modelo de Distribuição**: Dropdown para escolher entre as três dinâmicas de temperatura (Planetário, Inclinado, Ruído Livre).
*   **Controles de Elevação**: Ajuste a escala, oitavas e persistência do ruído.
*   **Controles de Umidade**: Ajuste a escala e oitavas do ruído.
*   **Controles de Temperatura**: Ajuste a atenuação por altitude.
*   **Camadas de Renderização (Tabs)**: Alterne visualizações (Biomas, Elevação, Umidade, Temperatura) instantaneamente.
*   **Feedback Debounced**: Atualiza o canvas automaticamente 100ms após o término dos arrastes de sliders.
*   **Hover Tooltip**: Ao passar o cursor sobre o Canvas, a barra de status inferior exibe as coordenadas, elevação, umidade, temperatura e bioma da célula sob o cursor.
