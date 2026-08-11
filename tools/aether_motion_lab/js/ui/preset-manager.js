/**
 * Aether Motion Lab — Preset Manager
 * Built-in presets, JSON Export/Import, & LocalStorage Persistence
 */

export class PresetManager {
  constructor() {
    this.presets = {
      'quantum-nebula': {
        name: 'Quantum Nebula',
        particleCount: 20000,
        maxSpeed: 3.5,
        friction: 0.02,
        particleSize: 1.5,
        trailFade: 92,
        fieldType: 'simplex',
        fieldScale: 0.003,
        timeSpeed: 0.002,
        fieldStrength: 1.2,
        palette: 'cyberpunk',
        blendMode: 'lighter',
        bgColor: '#050508',
        brushMode: 'attractor',
        brushRadius: 150,
        brushForce: 2.5
      },
      'lorenz-attractor': {
        name: 'Lorenz Attractor',
        particleCount: 25000,
        maxSpeed: 4.0,
        friction: 0.015,
        particleSize: 1.2,
        trailFade: 95,
        fieldType: 'lorenz',
        fieldScale: 0.002,
        timeSpeed: 0.001,
        fieldStrength: 2.0,
        palette: 'emerald',
        blendMode: 'lighter',
        bgColor: '#020d08',
        brushMode: 'attractor',
        brushRadius: 180,
        brushForce: 3.0
      },
      'solar-flare': {
        name: 'Solar Flare',
        particleCount: 18000,
        maxSpeed: 5.0,
        friction: 0.025,
        particleSize: 2.0,
        trailFade: 88,
        fieldType: 'nbodies',
        fieldScale: 0.004,
        timeSpeed: 0.003,
        fieldStrength: 2.5,
        palette: 'solar',
        blendMode: 'lighter',
        bgColor: '#0f0505',
        brushMode: 'vortex',
        brushRadius: 200,
        brushForce: 4.0
      },
      'cyber-silk': {
        name: 'Cyber Silk',
        particleCount: 15000,
        maxSpeed: 2.5,
        friction: 0.01,
        particleSize: 1.0,
        trailFade: 97,
        fieldType: 'simplex',
        fieldScale: 0.0015,
        timeSpeed: 0.001,
        fieldStrength: 0.8,
        palette: 'cyberpunk',
        blendMode: 'lighter',
        bgColor: '#05030a',
        brushMode: 'repeller',
        brushRadius: 160,
        brushForce: 2.0
      },
      'vortex-portal': {
        name: 'Vortex Portal',
        particleCount: 30000,
        maxSpeed: 6.0,
        friction: 0.03,
        particleSize: 1.5,
        trailFade: 90,
        fieldType: 'vortex',
        fieldScale: 0.005,
        timeSpeed: 0.004,
        fieldStrength: 3.0,
        palette: 'aurora',
        blendMode: 'lighter',
        bgColor: '#040b14',
        brushMode: 'vortex',
        brushRadius: 250,
        brushForce: 5.0
      }
    };
  }

  getPreset(key) {
    return this.presets[key] || this.presets['quantum-nebula'];
  }

  applyPreset(key, uiControls, particleEngine, width, height) {
    const preset = this.getPreset(key);
    Object.assign(uiControls.params, preset);

    uiControls.syncDomFromParams();
    particleEngine.setCount(preset.particleCount, width, height);
    particleEngine.clear(width, height, preset.bgColor);

    const nameEl = document.getElementById('current-preset');
    if (nameEl) nameEl.textContent = preset.name;
  }

  exportPresetJSON(params) {
    const jsonStr = JSON.stringify(params, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.download = `aether-preset-${params.fieldType || 'custom'}.json`;
    link.href = url;
    link.click();
  }

  importPresetJSON(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedParams = JSON.parse(e.target.result);
        if (callback) callback(importedParams);
      } catch (err) {
        alert('Erro ao importar arquivo JSON de Preset. Verifique o formato.');
      }
    };
    reader.readAsText(file);
  }
}
