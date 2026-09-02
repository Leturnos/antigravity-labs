export const PRESET_LIBRARY = [
  {
    id: 'starter-template',
    name: 'Starter Template (Didático)',
    description: 'Template minimalista e bem comentado demonstrando coordenadas UV, animação com iTime e mouse.',
    tags: ['Iniciante', 'Tutorial', 'Cores'],
    code: `// Aether Shader Studio - Starter Template
// void mainImage(out vec4 fragColor, in vec2 fragCoord)
// fragCoord: Coordenadas em pixels do pixel atual
// iResolution: vec3(largura, altura, aspect_ratio)

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    // Normaliza coordenadas para o intervalo 0.0 a 1.0
    vec2 uv = fragCoord / iResolution.xy;

    // Coordenadas centralizadas (-1.0 a 1.0) mantendo a proporção de tela
    vec2 p = (fragCoord * 2.0 - iResolution.xy) / min(iResolution.x, iResolution.y);

    // Amostragem de áudio se disponível (iChannel0: Linha 0 = FFT, Linha 1 = Waveform)
    float audioBass = texture(iChannel0, vec2(0.05, 0.25)).r;

    // Dinâmica de ondas coloridas
    float dist = length(p);
    float wave = sin(dist * 8.0 - iTime * 3.0 + audioBass * 4.0);
    
    // Paleta de gradiente Linear-style
    vec3 col1 = vec3(0.05, 0.07, 0.12);
    vec3 col2 = vec3(0.37, 0.42, 0.82); // Linear Indigo
    vec3 col3 = vec3(0.00, 0.95, 1.00); // Neon Cyan

    vec3 finalColor = mix(col1, col2, smoothstep(-0.5, 0.5, wave));
    finalColor += col3 * (0.02 / (abs(wave) + 0.02));

    fragColor = vec4(finalColor, 1.0);
}`
  },
  {
    id: 'neon-tunnel',
    name: 'Neon Synthwave Cyber-Tunnel',
    description: 'Túnel infinito com raymarching cilíndrico, grid geométrico e pulsação reativa ao áudio.',
    tags: ['3D', 'Raymarching', 'Synthwave', 'Audio'],
    code: `// Neon Synthwave Cyber-Tunnel
// Reativo ao áudio em iChannel0

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

    // Leitura dos graves e agudos do canal de áudio
    float bass = texture(iChannel0, vec2(0.05, 0.25)).r;
    float treble = texture(iChannel0, vec2(0.8, 0.25)).r;

    // Coordenadas polares para o túnel infinito
    float r = length(p);
    float a = atan(p.y, p.x);

    // Perspectiva e avanço temporal no eixo Z
    float z = 1.0 / (r + 0.001) + iTime * (1.5 + bass * 2.0);
    float u = a / 3.14159265;
    vec2 tunnelUV = vec2(u * 4.0, z * 2.0);

    // Grade cibernética neon
    vec2 grid = abs(fract(tunnelUV - 0.5) - 0.5) / fwidth(tunnelUV);
    float line = min(grid.x, grid.y);
    float glow = 1.0 - min(line, 1.0);

    // Cores néon estilo Outrun / Linear
    vec3 neonPink = vec3(1.0, 0.05, 0.55);
    vec3 neonCyan = vec3(0.0, 0.95, 1.0);
    vec3 tunnelColor = mix(neonPink, neonCyan, sin(z * 0.5) * 0.5 + 0.5);

    vec3 col = tunnelColor * (glow * 0.8 + 0.1);
    
    // Névoa volumétrica no centro e reflexo no horizonte
    col *= smoothstep(0.0, 0.4, r);
    col += vec3(0.05, 0.08, 0.15) * (1.0 - smoothstep(0.0, 0.5, r));
    col += neonCyan * pow(treble, 2.0) * 0.5;

    fragColor = vec4(col, 1.0);
}`
  },
  {
    id: 'tesla-arc',
    name: 'Plasma & Eletricidade (Tesla Arc)',
    description: 'Descargas elétricas procedurais com movimento browniano fractal (FBM) e arco reativo ao áudio.',
    tags: ['Plasma', 'FX', 'Eletricidade', 'FBM'],
    code: `// Plasma & Eletricidade (Tesla Arc FX)
// Simulação de arcos voltaicos procedurais

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p = rot * p * 2.0;
        a *= 0.5;
    }
    return v;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

    // Áudio reativo: modula a intensidade e frequência do raio
    float wave = texture(iChannel0, vec2(abs(uv.x) + 0.1, 0.75)).r - 0.5;
    float energy = texture(iChannel0, vec2(0.1, 0.25)).r * 1.5;

    // Deslocamento do feixe principal
    float t = iTime * 4.0;
    vec2 q = uv * 3.0;
    float n = fbm(q + vec2(t * 1.2, 0.0)) - 0.5;
    float beam = abs(uv.y + n * 0.3 + wave * 0.4);

    // Efeito de núcleo brilhante e halo elétrico
    float core = 0.012 / (beam + 0.005);
    float glow = 0.08 / (beam + 0.04);

    vec3 elecBlue = vec3(0.1, 0.7, 1.0);
    vec3 elecCore = vec3(0.9, 0.95, 1.0);
    vec3 elecPurple = vec3(0.6, 0.2, 0.9);

    vec3 col = elecBlue * glow + elecCore * core + elecPurple * (energy * 0.3);

    fragColor = vec4(col, 1.0);
}`
  },
  {
    id: 'mandelbrot-julia',
    name: 'Mandelbrot & Julia Interactive Fractal',
    description: 'Explorador fractal dinâmico. O clique e arrasto do mouse modulam o plano complexo do conjunto de Julia.',
    tags: ['Fractal', 'Matemática', 'Interativo', 'Mouse'],
    code: `// Mandelbrot & Julia Interactive Fractal
// Arraste o mouse no canvas para alterar a constante complexa C

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

    // Posição interativa do mouse normalizada
    vec2 m = iMouse.xy / iResolution.xy;
    if (iMouse.z <= 0.0) {
        // Padrão orbital se o mouse não estiver clicado
        m = vec2(0.5 + 0.35 * cos(iTime * 0.4), 0.5 + 0.35 * sin(iTime * 0.3));
    }
    vec2 c = (m - 0.5) * 2.5;

    // Zoom e iteração no plano complexo
    vec2 z = uv * 2.6;
    float n = 0.0;
    const float MAX_ITER = 90.0;

    for (float i = 0.0; i < MAX_ITER; i++) {
        if (dot(z, z) > 4.0) {
            n = i;
            break;
        }
        // z = z^2 + c
        z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    }

    if (n == 0.0) {
        fragColor = vec4(0.04, 0.05, 0.08, 1.0);
        return;
    }

    // Suavização das bandas de cor (Normalized Iteration Count)
    float smoothN = n - log2(max(1.0, log2(dot(z, z)))) + 4.0;
    float t = smoothN * 0.08 + iTime * 0.1;

    // Paleta cósmica
    vec3 col = 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
    fragColor = vec4(col, 1.0);
}`
  },
  {
    id: 'audio-visualizer',
    name: 'Hi-Tech Spectrum Audio Visualizer',
    description: 'Visualizador espectral 3D radial com anéis circulares de frequência, reflexo e bloom procedural.',
    tags: ['Áudio', 'Visualizer', 'Radial', 'Hi-Tech'],
    code: `// Hi-Tech Spectrum Audio Visualizer
// Radial FFT & Waveform Analyzer

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / min(iResolution.x, iResolution.y);

    float r = length(uv);
    float angle = atan(uv.y, uv.x);
    float normAngle = abs(angle) / 3.14159265;

    // Amostragem espectral pelo ângulo
    float spec = texture(iChannel0, vec2(normAngle * 0.8 + 0.02, 0.25)).r;
    float wave = texture(iChannel0, vec2(normAngle, 0.75)).r;

    // Raio base do anel central
    float baseRadius = 0.28;
    float targetRadius = baseRadius + spec * 0.25;

    // Distância até o anel de frequência
    float distRing = abs(r - targetRadius);
    float ringIntensity = 0.008 / (distRing + 0.003);

    // Osciloscópio interno
    float waveRadius = 0.15 + (wave - 0.5) * 0.15;
    float distWave = abs(r - waveRadius);
    float waveIntensity = 0.005 / (distWave + 0.004);

    // Barras radiais de espectro
    float bars = step(0.5, sin(angle * 32.0));
    float barRing = smoothstep(targetRadius, baseRadius, r) * bars * spec;

    // Gradiente de cor futurista (Linear indigo + ciano)
    vec3 colorCyan = vec3(0.0, 0.95, 1.0);
    vec3 colorIndigo = vec3(0.37, 0.42, 0.82);
    vec3 colorViolet = vec3(0.7, 0.2, 0.9);

    vec3 finalColor = vec3(0.02, 0.03, 0.05);
    finalColor += colorCyan * ringIntensity;
    finalColor += colorViolet * waveIntensity;
    finalColor += colorIndigo * barRing * 1.5;

    // Vinheta suave nas bordas
    finalColor *= smoothstep(0.9, 0.3, r);

    fragColor = vec4(finalColor, 1.0);
}`
  }
];
