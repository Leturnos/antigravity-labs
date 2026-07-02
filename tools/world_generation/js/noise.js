// Secure 32-bit integer hash function to avoid floating-point overflow and entropy loss in JS
export function hash32(value) {
  let h = value | 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return (h ^ (h >>> 16)) >>> 0;
}

export class ImprovedNoise {
  constructor(seed) {
    this.perm = new Uint8Array(512);
    this.init(seed);
  }
  
  init(seed) {
    // Generate initial state from the hashed seed
    let seedVal = hash32(seed);
    const hash = () => {
      // Standard LCG parameters implemented safely via Math.imul
      seedVal = (Math.imul(seedVal, 1664525) + 1013904223) | 0;
      return (seedVal >>> 0) / 4294967296;
    };
    
    // Initialize permutation table
    const permutation = Array.from({length: 256}, (_, i) => i);
    
    // Deterministically shuffle permutation using Fisher-Yates with LCG seed
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(hash() * (i + 1));
      [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
    }
    
    // Duplicate the permutation array to avoid boundary checks
    for (let i = 0; i < 256; i++) {
      this.perm[i] = permutation[i];
      this.perm[i + 256] = permutation[i];
    }
  }

  fade(t) { 
    return t * t * t * (t * (t * 6 - 15) + 10); 
  }
  
  lerp(t, a, b) { 
    return a + t * (b - a); 
  }
  
  grad(hash, x, y) {
    // Choose one of 8 gradient vectors in 2D: (1,1), (-1,1), (1,-1), (-1,-1), (2,0), (-2,0), (0,2), (0,-2)
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -2.0 * v : 2.0 * v);
  }

  noise(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    
    const u = this.fade(xf);
    const v = this.fade(yf);
    
    const aa = this.perm[this.perm[X] + Y];
    const ab = this.perm[this.perm[X] + Y + 1];
    const ba = this.perm[this.perm[X + 1] + Y];
    const bb = this.perm[this.perm[X + 1] + Y + 1];
    
    return this.lerp(v, this.lerp(u, this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf)),
                        this.lerp(u, this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1)));
  }
}
