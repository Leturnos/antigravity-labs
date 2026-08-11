/**
 * Aether Motion Lab — Particle System Engine
 * Uses zero-allocation Float32Array buffers for high performance (50,000+ particles @ 60 FPS).
 */

export class ParticleSystem {
  constructor(maxParticles = 50000) {
    this.maxParticles = maxParticles;
    this.activeCount = 15000;

    // Contiguous memory buffers
    this.positions = new Float32Array(maxParticles * 2);
    this.velocities = new Float32Array(maxParticles * 2);
    this.attributes = new Float32Array(maxParticles * 3); // [life, maxLife, colorVal]

    this.isPaused = false;
    this.pendingFullClear = false;
  }

  init(count, width, height) {
    this.activeCount = Math.min(count, this.maxParticles);

    for (let i = 0; i < this.activeCount; i++) {
      this.resetParticle(i, width, height, true);
    }
  }

  resetParticle(i, width, height, randomPosition = false) {
    const i2 = i * 2;
    const i3 = i * 3;

    if (randomPosition) {
      this.positions[i2] = Math.random() * width;
      this.positions[i2 + 1] = Math.random() * height;
    } else {
      this.positions[i2] = width * 0.5 + (Math.random() - 0.5) * 100;
      this.positions[i2 + 1] = height * 0.5 + (Math.random() - 0.5) * 100;
    }

    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 2 + 0.5;
    this.velocities[i2] = Math.cos(angle) * speed;
    this.velocities[i2 + 1] = Math.sin(angle) * speed;

    const maxLife = Math.random() * 200 + 100;
    this.attributes[i3] = maxLife;
    this.attributes[i3 + 1] = maxLife;
    this.attributes[i3 + 2] = Math.random();
  }

  setCount(newCount, width, height) {
    const oldCount = this.activeCount;
    this.activeCount = Math.min(newCount, this.maxParticles);

    if (this.activeCount > oldCount) {
      for (let i = oldCount; i < this.activeCount; i++) {
        this.resetParticle(i, width, height, true);
      }
    }
  }

  update(width, height, params, forceField = null, mouseBrush = null) {
    if (this.isPaused) return;

    const maxSpeed = params.maxSpeed || 3.0;
    const friction = 1.0 - (params.friction || 0.02);

    for (let i = 0; i < this.activeCount; i++) {
      const i2 = i * 2;
      const i3 = i * 3;

      let px = this.positions[i2];
      let py = this.positions[i2 + 1];
      let vx = this.velocities[i2];
      let vy = this.velocities[i2 + 1];

      // 1. Field force
      if (forceField) {
        const force = forceField.getForce(px, py, width, height, params);
        vx += force.x;
        vy += force.y;
      }

      // 2. Mouse Brush force
      if (mouseBrush && mouseBrush.active) {
        const brushForce = mouseBrush.getForce(px, py);
        vx += brushForce.x;
        vy += brushForce.y;
      }

      // 3. Friction & speed limit
      vx *= friction;
      vy *= friction;

      const currentSpeed = Math.sqrt(vx * vx + vy * vy);
      if (currentSpeed > maxSpeed) {
        const scale = maxSpeed / currentSpeed;
        vx *= scale;
        vy *= scale;
      }

      // Update position
      px += vx;
      py += vy;

      // Lifespan & boundaries
      let life = this.attributes[i3] - 1;

      if (life <= 0 || px < 0 || px > width || py < 0 || py > height) {
        this.resetParticle(i, width, height, false);
      } else {
        this.positions[i2] = px;
        this.positions[i2 + 1] = py;
        this.velocities[i2] = vx;
        this.velocities[i2 + 1] = vy;
        this.attributes[i3] = life;
      }
    }
  }

  render(ctx, width, height, params, mouseBrush = null) {
    ctx.save();

    // Full clear if pending
    if (this.pendingFullClear) {
      ctx.fillStyle = params.bgColor || '#050508';
      ctx.fillRect(0, 0, width, height);
      this.pendingFullClear = false;
    } else {
      // Trail decay
      const fadeOpacity = (100 - params.trailFade) / 100;
      const bgColor = params.bgColor || '#050508';
      ctx.fillStyle = this.hexToRgba(bgColor, Math.max(fadeOpacity, 0.04));
      ctx.fillRect(0, 0, width, height);
    }

    // Blend Mode
    ctx.globalCompositeOperation = params.blendMode || 'lighter';

    // Render Particles
    const particleSize = params.particleSize || 1.5;
    const palette = this.getPaletteColors(params.palette);

    for (let i = 0; i < this.activeCount; i++) {
      const i2 = i * 2;
      const i3 = i * 3;

      const px = this.positions[i2];
      const py = this.positions[i2 + 1];
      const colorRatio = this.attributes[i3 + 2];

      const color = this.samplePalette(palette, colorRatio);

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, particleSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Render Mouse Brush Guidance Ring
    if (mouseBrush && mouseBrush.active) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.arc(mouseBrush.x, mouseBrush.y, mouseBrush.radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 242, 254, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(mouseBrush.x, mouseBrush.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 242, 254, 0.8)';
      ctx.fill();
    }

    ctx.restore();
  }

  hexToRgba(hex, alpha) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const num = parseInt(c, 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
  }

  getPaletteColors(name) {
    const palettes = {
      cyberpunk: ['#00f2fe', '#4facfe', '#ff007f', '#9b51e0'],
      aurora: ['#00ff88', '#00f2fe', '#00b4d8', '#7209b7'],
      solar: ['#ff007f', '#ff4e50', '#f9d423', '#ff8000'],
      emerald: ['#00ff88', '#10b981', '#064e3b', '#ffffff'],
      monochrome: ['#ffffff', '#8a99ad', '#4a5568', '#cbd5e1']
    };

    return palettes[name] || palettes.cyberpunk;
  }

  samplePalette(palette, ratio) {
    const idx = Math.floor(ratio * palette.length);
    return palette[Math.min(idx, palette.length - 1)];
  }

  clear(width, height) {
    this.pendingFullClear = true;
    for (let i = 0; i < this.activeCount; i++) {
      this.resetParticle(i, width, height, true);
    }
  }
}
