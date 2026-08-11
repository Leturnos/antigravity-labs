/**
 * Aether Motion Lab — Mathematical Vector Fields & Canvas Brush Physics
 * Implements Simplex Noise 3D, Lorenz Chaotic Attractors, N-Bodies & Interactive Brush Forces.
 */

// Lightweight Fast Simplex Noise 3D Implementation
class SimplexNoise {
  constructor() {
    this.grad3 = [
      [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
      [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
      [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
    ];
    this.p = new Uint8Array(256);
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    this.seed(Math.random());
  }

  seed(seedVal) {
    for (let i = 0; i < 256; i++) {
      this.p[i] = Math.floor((Math.sin(seedVal * 9999 + i) * 0.5 + 0.5) * 256);
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = this.p[i & 255];
      this.permMod12[i] = (this.perm[i] % 12);
    }
  }

  noise3D(xin, yin, zin) {
    let n0, n1, n2, n3;
    const s = (xin + yin + zin) / 3.0;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) / 6.0;
    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;
    const z0 = zin - Z0;

    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
      else if (x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
      else { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
    } else {
      if (y0 < z0) { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
      else if (x0 < z0) { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
      else { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
    }

    const x1 = x0 - i1 + 1/6.0; const y1 = y0 - j1 + 1/6.0; const z1 = z0 - k1 + 1/6.0;
    const x2 = x0 - i2 + 1/3.0; const y2 = y0 - j2 + 1/3.0; const z2 = z0 - k2 + 1/3.0;
    const x3 = x0 - 1.0 + 0.5;   const y3 = y0 - 1.0 + 0.5;   const z3 = z0 - 1.0 + 0.5;

    const ii = i & 255; const jj = j & 255; const kk = k & 255;

    let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
    if (t0 < 0) n0 = 0.0;
    else {
      t0 *= t0;
      const gi0 = this.permMod12[ii+this.perm[jj+this.perm[kk]]];
      const g0 = this.grad3[gi0];
      n0 = t0 * t0 * (g0[0]*x0 + g0[1]*y0 + g0[2]*z0);
    }

    let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
    if (t1 < 0) n1 = 0.0;
    else {
      t1 *= t1;
      const gi1 = this.permMod12[ii+i1+this.perm[jj+j1+this.perm[kk+k1]]];
      const g1 = this.grad3[gi1];
      n1 = t1 * t1 * (g1[0]*x1 + g1[1]*y1 + g1[2]*z1);
    }

    let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
    if (t2 < 0) n2 = 0.0;
    else {
      t2 *= t2;
      const gi2 = this.permMod12[ii+i2+this.perm[jj+j2+this.perm[kk+k2]]];
      const g2 = this.grad3[gi2];
      n2 = t2 * t2 * (g2[0]*x2 + g2[1]*y2 + g2[2]*z2);
    }

    let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
    if (t3 < 0) n3 = 0.0;
    else {
      t3 *= t3;
      const gi3 = this.permMod12[ii+1+this.perm[jj+1+this.perm[kk+1]]];
      const g3 = this.grad3[gi3];
      n3 = t3 * t3 * (g3[0]*x3 + g3[1]*y3 + g3[2]*z3);
    }

    return 32.0 * (n0 + n1 + n2 + n3);
  }
}

export class VectorFields {
  constructor() {
    this.simplex = new SimplexNoise();
    this.zTime = 0;
  }

  getForce(x, y, width, height, params) {
    const mode = params.fieldType || 'simplex';
    this.zTime += params.timeSpeed || 0.002;

    switch (mode) {
      case 'lorenz':
        return this.getLorenzForce(x, y, width, height, params);
      case 'nbodies':
        return this.getNBodiesForce(x, y, width, height, params);
      case 'vortex':
        return this.getVortexForce(x, y, width, height, params);
      case 'simplex':
      default:
        return this.getSimplexForce(x, y, params);
    }
  }

  getSimplexForce(x, y, params) {
    const scale = params.fieldScale || 0.003;
    const strength = params.fieldStrength || 1.0;

    const angle = this.simplex.noise3D(x * scale, y * scale, this.zTime) * Math.PI * 2;
    return {
      x: Math.cos(angle) * strength * 0.4,
      y: Math.sin(angle) * strength * 0.4
    };
  }

  getLorenzForce(x, y, width, height, params) {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const dx = (x - cx) * 0.05;
    const dy = (y - cy) * 0.05;

    const sigma = 10.0;
    const rho = 28.0;

    const fx = sigma * (dy - dx);
    const fy = dx * (rho - 20) - dy;

    const strength = (params.fieldStrength || 1.0) * 0.02;
    return {
      x: fx * strength,
      y: fy * strength
    };
  }

  getNBodiesForce(x, y, width, height, params) {
    const cx = width * 0.5;
    const cy = height * 0.5;

    // 2 Gravitational Well centers
    const wells = [
      { x: cx - width * 0.2, y: cy },
      { x: cx + width * 0.2, y: cy }
    ];

    let fx = 0;
    let fy = 0;

    wells.forEach((well) => {
      const dx = well.x - x;
      const dy = well.y - y;
      const distSq = dx * dx + dy * dy + 100;
      const force = (params.fieldStrength * 1000) / distSq;
      fx += dx * force * 0.01;
      fy += dy * force * 0.01;
    });

    return { x: fx, y: fy };
  }

  getVortexForce(x, y, width, height, params) {
    const cx = width * 0.5;
    const cy = height * 0.5;

    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) + 1;

    const strength = (params.fieldStrength || 1.0) * 0.5;
    return {
      x: (-dy / dist) * strength,
      y: (dx / dist) * strength
    };
  }
}

export class MouseBrush {
  constructor(canvas) {
    this.canvas = canvas;
    this.x = 0;
    this.y = 0;
    this.active = false;
    this.mode = 'attractor';
    this.radius = 150;
    this.force = 2.5;

    this.bindEvents();
  }

  bindEvents() {
    const updatePos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.x = e.clientX - rect.left;
      this.y = e.clientY - rect.top;
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      this.active = true;
      updatePos(e);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (this.active) updatePos(e);
    });

    this.canvas.addEventListener('pointerup', () => {
      this.active = false;
    });

    this.canvas.addEventListener('pointerleave', () => {
      this.active = false;
    });
  }

  getForce(particleX, particleY) {
    if (!this.active || this.mode === 'none') return { x: 0, y: 0 };

    const dx = this.x - particleX;
    const dy = this.y - particleY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > this.radius || dist < 1) return { x: 0, y: 0 };

    const normDist = 1.0 - dist / this.radius;
    const mag = normDist * this.force;

    if (this.mode === 'attractor') {
      return { x: (dx / dist) * mag, y: (dy / dist) * mag };
    } else if (this.mode === 'repeller') {
      return { x: (-dx / dist) * mag, y: (-dy / dist) * mag };
    } else if (this.mode === 'vortex') {
      return { x: (-dy / dist) * mag, y: (dx / dist) * mag };
    }

    return { x: 0, y: 0 };
  }
}
