export class StorageManager {
  static STORAGE_KEY = 'aether_shader_studio_current';

  static saveCurrent(code, meta = {}) {
    if (typeof localStorage === 'undefined') return;
    try {
      const payload = {
        code,
        meta,
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }

  static loadCurrent() {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.code || null;
    } catch {
      return null;
    }
  }

  static encodeURLHash(code) {
    if (!code) return '';
    try {
      const encoded = encodeURIComponent(code);
      const b64 = typeof btoa === 'function' ? btoa(encoded) : Buffer.from(encoded).toString('base64');
      return `#shader=${b64}`;
    } catch {
      return '';
    }
  }

  static decodeURLHash(hashString) {
    if (!hashString || typeof hashString !== 'string' || !hashString.includes('#shader=')) return null;
    try {
      const idx = hashString.indexOf('#shader=');
      const b64 = hashString.slice(idx + '#shader='.length).trim();
      const encoded = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf-8');
      return decodeURIComponent(encoded);
    } catch {
      return null;
    }
  }

  static exportJSON(data) {
    return JSON.stringify(data, null, 2);
  }

  static importJSON(jsonStr) {
    return JSON.parse(jsonStr);
  }
}
