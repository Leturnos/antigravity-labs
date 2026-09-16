export const PRESET_LIBRARY = [
  {
    id: 'starter-template',
    name: 'Starter Template (Didático)',
    description: 'Template minimalista e bem comentado demonstrando coordenadas UV, animação com iTime e mouse.',
    tags: ['Iniciante', 'Tutorial', 'Cores'],
    code: `// Aether Shader Studio - Starter Template
// void mainImage(out vec4 fragColor, in vec2 fragCoord)
// fragCoord: Pixel coordinates of current fragment
// iResolution: vec3(width, height, aspect_ratio)

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    // Normalize coordinates to 0.0 to 1.0 range
    vec2 uv = fragCoord / iResolution.xy;

    // Centered coordinates (-1.0 to 1.0) preserving aspect ratio
    vec2 p = (fragCoord * 2.0 - iResolution.xy) / min(iResolution.x, iResolution.y);

    // Audio sampling if available (iChannel0: Row 0 = FFT, Row 1 = Waveform)
    float audioBass = texture(iChannel0, vec2(0.05, 0.25)).r;

    // Dynamic colored waves
    float dist = length(p);
    float wave = sin(dist * 8.0 - iTime * 3.0 + audioBass * 4.0);
    
    // Linear-style gradient palette
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
// Reactive to audio in iChannel0

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

    // Bass and treble reading from audio channel
    float bass = texture(iChannel0, vec2(0.05, 0.25)).r;
    float treble = texture(iChannel0, vec2(0.8, 0.25)).r;

    // Polar coordinates for infinite tunnel
    float r = length(p);
    float a = atan(p.y, p.x);

    // Perspective and time advance along Z-axis
    float z = 1.0 / (r + 0.001) + iTime * (1.5 + bass * 2.0);
    float u = a / 3.14159265;
    vec2 tunnelUV = vec2(u * 4.0, z * 2.0);

    // Neon cybernetic grid
    vec2 grid = abs(fract(tunnelUV - 0.5) - 0.5) / fwidth(tunnelUV);
    float line = min(grid.x, grid.y);
    float glow = 1.0 - min(line, 1.0);

    // Outrun / Linear neon style colors
    vec3 neonPink = vec3(1.0, 0.05, 0.55);
    vec3 neonCyan = vec3(0.0, 0.95, 1.0);
    vec3 tunnelColor = mix(neonPink, neonCyan, sin(z * 0.5) * 0.5 + 0.5);

    vec3 col = tunnelColor * (glow * 0.8 + 0.1);
    
    // Volumetric fog in center and horizon reflection
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
    code: `// Plasma & Electricity (Tesla Arc FX)
// Procedural electric arc simulation

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

    // Audio-reactive: modulates lightning intensity and frequency
    float wave = texture(iChannel0, vec2(abs(uv.x) + 0.1, 0.75)).r - 0.5;
    float energy = texture(iChannel0, vec2(0.1, 0.25)).r * 1.5;

    // Main beam displacement
    float t = iTime * 4.0;
    vec2 q = uv * 3.0;
    float n = fbm(q + vec2(t * 1.2, 0.0)) - 0.5;
    float beam = abs(uv.y + n * 0.3 + wave * 0.4);

    // Glowing core and electric halo effect
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
// Drag mouse on canvas to alter the complex constant C

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

    // Normalized interactive mouse position
    vec2 m = iMouse.xy / iResolution.xy;
    if (iMouse.z <= 0.0) {
        // Orbital pattern if mouse is not clicked
        m = vec2(0.5 + 0.35 * cos(iTime * 0.4), 0.5 + 0.35 * sin(iTime * 0.3));
    }
    vec2 c = (m - 0.5) * 2.5;

    // Zoom and iteration in the complex plane
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

    // Color band smoothing (Normalized Iteration Count)
    float smoothN = n - log2(max(1.0, log2(dot(z, z)))) + 4.0;
    float t = smoothN * 0.08 + iTime * 0.1;

    // Cosmic palette
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

    // Spectral sampling by angle
    float spec = texture(iChannel0, vec2(normAngle * 0.8 + 0.02, 0.25)).r;
    float wave = texture(iChannel0, vec2(normAngle, 0.75)).r;

    // Center ring base radius
    float baseRadius = 0.28;
    float targetRadius = baseRadius + spec * 0.25;

    // Distance to frequency ring
    float distRing = abs(r - targetRadius);
    float ringIntensity = 0.008 / (distRing + 0.003);

    // Internal oscilloscope
    float waveRadius = 0.15 + (wave - 0.5) * 0.15;
    float distWave = abs(r - waveRadius);
    float waveIntensity = 0.005 / (distWave + 0.004);

    // Radial spectrum bars
    float bars = step(0.5, sin(angle * 32.0));
    float barRing = smoothstep(targetRadius, baseRadius, r) * bars * spec;

    // Futuristic color gradient (Linear indigo + cyan)
    vec3 colorCyan = vec3(0.0, 0.95, 1.0);
    vec3 colorIndigo = vec3(0.37, 0.42, 0.82);
    vec3 colorViolet = vec3(0.7, 0.2, 0.9);

    vec3 finalColor = vec3(0.02, 0.03, 0.05);
    finalColor += colorCyan * ringIntensity;
    finalColor += colorViolet * waveIntensity;
    finalColor += colorIndigo * barRing * 1.5;

    // Soft edge vignette
    finalColor *= smoothstep(0.9, 0.3, r);

    fragColor = vec4(finalColor, 1.0);
}`
  }
];
