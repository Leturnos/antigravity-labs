export class TextureGenerator {
  static createTextureCanvas(width = 64, height = 64) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  static generateAll() {
    const textures = {};
    if (typeof document === 'undefined') return textures;

    // 1: Cyber Concrete Wall (Dark carbon grid with cyan neon conduits)
    const c1 = this.createTextureCanvas();
    const ctx1 = c1.getContext('2d');
    ctx1.fillStyle = '#0a0d14';
    ctx1.fillRect(0, 0, 64, 64);
    ctx1.strokeStyle = '#052a38';
    ctx1.lineWidth = 1;
    for (let i = 0; i < 64; i += 16) {
      ctx1.strokeRect(i, 0, 16, 64);
      ctx1.strokeRect(0, i, 64, 16);
    }
    ctx1.strokeStyle = '#00ffcc';
    ctx1.lineWidth = 2;
    ctx1.beginPath();
    ctx1.moveTo(0, 32); ctx1.lineTo(64, 32);
    ctx1.moveTo(32, 0); ctx1.lineTo(32, 64);
    ctx1.stroke();
    ctx1.fillStyle = '#00ffff';
    ctx1.fillRect(30, 30, 4, 4);
    textures[1] = c1;

    // 2: Data Core / Server Wall (Magenta cyber circuits)
    const c2 = this.createTextureCanvas();
    const ctx2 = c2.getContext('2d');
    ctx2.fillStyle = '#12051a';
    ctx2.fillRect(0, 0, 64, 64);
    ctx2.strokeStyle = '#ff007f';
    ctx2.lineWidth = 2;
    ctx2.strokeRect(4, 4, 56, 56);
    ctx2.strokeRect(12, 12, 40, 40);
    ctx2.fillStyle = '#ff00aa';
    for (let y = 16; y < 48; y += 8) {
      for (let x = 16; x < 48; x += 8) {
        ctx2.fillRect(x, y, 4, 4);
      }
    }
    textures[2] = c2;

    // 3: Hazard / Yellow Holo Wall
    const c3 = this.createTextureCanvas();
    const ctx3 = c3.getContext('2d');
    ctx3.fillStyle = '#1a1600';
    ctx3.fillRect(0, 0, 64, 64);
    ctx3.fillStyle = '#ffe600';
    for (let i = -64; i < 128; i += 16) {
      ctx3.beginPath();
      ctx3.moveTo(i, 0);
      ctx3.lineTo(i + 8, 0);
      ctx3.lineTo(i - 8, 64);
      ctx3.lineTo(i - 16, 64);
      ctx3.closePath();
      ctx3.fill();
    }
    textures[3] = c3;

    // 4: Automatic Blast Door
    const c4 = this.createTextureCanvas();
    const ctx4 = c4.getContext('2d');
    ctx4.fillStyle = '#1b2028';
    ctx4.fillRect(0, 0, 64, 64);
    ctx4.strokeStyle = '#00e5ff';
    ctx4.lineWidth = 3;
    ctx4.strokeRect(2, 2, 60, 60);
    ctx4.strokeRect(16, 8, 32, 48);
    ctx4.fillStyle = '#00e5ff';
    ctx4.fillRect(28, 28, 8, 8);
    textures[4] = c4;

    // 5: Locked Cyber Door (Red Security Lock)
    const c5 = this.createTextureCanvas();
    const ctx5 = c5.getContext('2d');
    ctx5.fillStyle = '#200808';
    ctx5.fillRect(0, 0, 64, 64);
    ctx5.strokeStyle = '#ff1744';
    ctx5.lineWidth = 3;
    ctx5.strokeRect(2, 2, 60, 60);
    ctx5.fillStyle = '#ff1744';
    ctx5.fillRect(24, 24, 16, 16);
    textures[5] = c5;

    // 9: Elevator / Exit Portal (Green Neon Warp Gate)
    const c9 = this.createTextureCanvas();
    const ctx9 = c9.getContext('2d');
    ctx9.fillStyle = '#051a0a';
    ctx9.fillRect(0, 0, 64, 64);
    ctx9.strokeStyle = '#00e676';
    ctx9.lineWidth = 4;
    ctx9.beginPath();
    ctx9.arc(32, 32, 24, 0, Math.PI * 2);
    ctx9.stroke();
    ctx9.fillStyle = '#69f0ae';
    ctx9.fillRect(28, 28, 8, 8);
    textures[9] = c9;

    return textures;
  }

  static generateSprites() {
    const sprites = {};
    if (typeof document === 'undefined') return sprites;

    // Drone: Flying cyber sentinel saucer with glowing eye and thruster
    const sDrone = this.createTextureCanvas(64, 64);
    const ctxD = sDrone.getContext('2d');
    ctxD.clearRect(0, 0, 64, 64);
    // Outer glow ring
    ctxD.strokeStyle = '#00e5ff';
    ctxD.lineWidth = 3;
    ctxD.beginPath();
    ctxD.ellipse(32, 30, 24, 12, 0, 0, Math.PI * 2);
    ctxD.stroke();
    // Metallic chassis
    ctxD.fillStyle = '#1e293b';
    ctxD.beginPath();
    ctxD.ellipse(32, 30, 20, 10, 0, 0, Math.PI * 2);
    ctxD.fill();
    // Glowing central optic lens
    ctxD.fillStyle = '#ff0055';
    ctxD.beginPath();
    ctxD.arc(32, 28, 7, 0, Math.PI * 2);
    ctxD.fill();
    ctxD.fillStyle = '#ffffff';
    ctxD.beginPath();
    ctxD.arc(30, 26, 2.5, 0, Math.PI * 2);
    ctxD.fill();
    // Bottom thruster jet
    ctxD.fillStyle = '#00ffff';
    ctxD.beginPath();
    ctxD.moveTo(28, 40); ctxD.lineTo(36, 40); ctxD.lineTo(32, 54); ctxD.closePath();
    ctxD.fill();
    sprites['drone'] = sDrone;

    // Heavy Sentinel: Armored battle mecha with dual shoulder plasma cannons
    const sHeavy = this.createTextureCanvas(64, 64);
    const ctxH = sHeavy.getContext('2d');
    ctxH.clearRect(0, 0, 64, 64);
    // Shoulder cannons
    ctxH.fillStyle = '#0f172a';
    ctxH.fillRect(10, 12, 10, 20);
    ctxH.fillRect(44, 12, 10, 20);
    ctxH.fillStyle = '#ff1744';
    ctxH.fillRect(12, 8, 6, 4);
    ctxH.fillRect(46, 8, 6, 4);
    // Main armored torso
    ctxH.fillStyle = '#1e293b';
    ctxH.strokeStyle = '#ff0055';
    ctxH.lineWidth = 2;
    ctxH.beginPath();
    ctxH.moveTo(16, 24); ctxH.lineTo(48, 24); ctxH.lineTo(44, 56); ctxH.lineTo(20, 56); ctxH.closePath();
    ctxH.fill();
    ctxH.stroke();
    // Glowing red visor bar
    ctxH.fillStyle = '#ff1744';
    ctxH.fillRect(22, 28, 20, 6);
    ctxH.fillStyle = '#ffffff';
    ctxH.fillRect(28, 29, 8, 4);
    // Core reactor in chest
    ctxH.fillStyle = '#ff007f';
    ctxH.beginPath();
    ctxH.arc(32, 44, 6, 0, Math.PI * 2);
    ctxH.fill();
    sprites['heavy'] = sHeavy;

    // Ammo Pack: High-tech glowing battery cell with bolt icon
    const sAmmo = this.createTextureCanvas(64, 64);
    const ctxA = sAmmo.getContext('2d');
    ctxA.clearRect(0, 0, 64, 64);
    ctxA.fillStyle = '#1a1805';
    ctxA.strokeStyle = '#ffd600';
    ctxA.lineWidth = 3;
    ctxA.beginPath();
    ctxA.roundRect ? ctxA.roundRect(16, 16, 32, 40, 6) : ctxA.rect(16, 16, 32, 40);
    ctxA.fill();
    ctxA.stroke();
    // Battery terminals
    ctxA.fillStyle = '#ffd600';
    ctxA.fillRect(26, 10, 12, 6);
    // Lightning symbol
    ctxA.fillStyle = '#ffee55';
    ctxA.beginPath();
    ctxA.moveTo(34, 22);
    ctxA.lineTo(24, 36);
    ctxA.lineTo(32, 36);
    ctxA.lineTo(30, 50);
    ctxA.lineTo(40, 34);
    ctxA.lineTo(32, 34);
    ctxA.closePath();
    ctxA.fill();
    sprites['ammo'] = sAmmo;

    // Health / Medkit: Nanite medical container with green cross
    const sMed = this.createTextureCanvas(64, 64);
    const ctxM = sMed.getContext('2d');
    ctxM.clearRect(0, 0, 64, 64);
    ctxM.fillStyle = '#062010';
    ctxM.strokeStyle = '#00e676';
    ctxM.lineWidth = 3;
    ctxM.beginPath();
    ctxM.roundRect ? ctxM.roundRect(14, 16, 36, 38, 6) : ctxM.rect(14, 16, 36, 38);
    ctxM.fill();
    ctxM.stroke();
    // Latch
    ctxM.fillStyle = '#69f0ae';
    ctxM.fillRect(28, 12, 8, 4);
    // Green Cross
    ctxM.fillStyle = '#00e676';
    ctxM.fillRect(28, 24, 8, 22);
    ctxM.fillRect(21, 31, 22, 8);
    ctxM.fillStyle = '#ffffff';
    ctxM.fillRect(30, 26, 4, 18);
    ctxM.fillRect(23, 33, 18, 4);
    sprites['health'] = sMed;

    // Cyber Key: Holographic glowing data card
    const sKey = this.createTextureCanvas(64, 64);
    const ctxK = sKey.getContext('2d');
    ctxK.clearRect(0, 0, 64, 64);
    ctxK.fillStyle = '#051820';
    ctxK.strokeStyle = '#00e5ff';
    ctxK.lineWidth = 3;
    ctxK.beginPath();
    ctxK.roundRect ? ctxK.roundRect(18, 12, 28, 44, 4) : ctxK.rect(18, 12, 28, 44);
    ctxK.fill();
    ctxK.stroke();
    // Microchip
    ctxK.fillStyle = '#ffd600';
    ctxK.fillRect(24, 20, 16, 12);
    // Key silhouette
    ctxK.fillStyle = '#00e5ff';
    ctxK.beginPath();
    ctxK.arc(32, 40, 5, 0, Math.PI * 2);
    ctxK.fill();
    ctxK.fillRect(30, 42, 4, 10);
    ctxK.fillRect(34, 46, 4, 3);
    sprites['key'] = sKey;

    // Overcharge Core: Blazing golden nuclear/plasma core
    const sOver = this.createTextureCanvas(64, 64);
    const ctxO = sOver.getContext('2d');
    ctxO.clearRect(0, 0, 64, 64);
    // Orbit rings
    ctxO.strokeStyle = '#e040fb';
    ctxO.lineWidth = 2;
    ctxO.beginPath();
    ctxO.ellipse(32, 32, 26, 10, Math.PI / 4, 0, Math.PI * 2);
    ctxO.stroke();
    ctxO.beginPath();
    ctxO.ellipse(32, 32, 26, 10, -Math.PI / 4, 0, Math.PI * 2);
    ctxO.stroke();
    // Core sphere
    ctxO.fillStyle = '#ffd600';
    ctxO.beginPath();
    ctxO.arc(32, 32, 14, 0, Math.PI * 2);
    ctxO.fill();
    ctxO.fillStyle = '#ffffff';
    ctxO.beginPath();
    ctxO.arc(30, 30, 5, 0, Math.PI * 2);
    ctxO.fill();
    sprites['overcharge'] = sOver;

    return sprites;
  }
}
