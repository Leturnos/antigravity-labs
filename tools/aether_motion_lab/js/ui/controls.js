/**
 * Aether Motion Lab — UI Controls Manager
 * Binds DOM Sliders, Dropdowns, Shortcuts & State Synchronization
 */

export class ControlsManager {
  constructor() {
    this.defaultParams = {
      particleCount: 15000,
      maxSpeed: 3.0,
      friction: 0.02,
      particleSize: 1.5,
      trailFade: 92,
      fieldType: 'simplex',
      fieldScale: 0.003,
      timeSpeed: 0.002,
      fieldStrength: 1.0,
      palette: 'cyberpunk',
      blendMode: 'lighter',
      bgColor: '#050508',
      brushMode: 'attractor',
      brushRadius: 150,
      brushForce: 2.5
    };

    this.params = { ...this.defaultParams };
    this.onParamsChangeCallbacks = [];
  }

  init() {
    this.bindSliders();
    this.bindSelects();
    this.bindColorPicker();
  }

  bindSliders() {
    const sliderBindings = [
      { id: 'slider-particle-count', label: 'val-particle-count', key: 'particleCount', parse: parseInt, fmt: (v) => v.toLocaleString('pt-BR') },
      { id: 'slider-max-speed', label: 'val-max-speed', key: 'maxSpeed', parse: parseFloat, fmt: (v) => v.toFixed(1) },
      { id: 'slider-friction', label: 'val-friction', key: 'friction', parse: parseFloat, fmt: (v) => v.toFixed(3) },
      { id: 'slider-particle-size', label: 'val-particle-size', key: 'particleSize', parse: parseFloat, fmt: (v) => `${v.toFixed(1)}px` },
      { id: 'slider-trail-fade', label: 'val-trail-fade', key: 'trailFade', parse: parseInt, fmt: (v) => `${v}%` },
      { id: 'slider-field-scale', label: 'val-field-scale', key: 'fieldScale', parse: parseFloat, fmt: (v) => v.toFixed(4) },
      { id: 'slider-time-speed', label: 'val-time-speed', key: 'timeSpeed', parse: parseFloat, fmt: (v) => v.toFixed(3) },
      { id: 'slider-field-strength', label: 'val-field-strength', key: 'fieldStrength', parse: parseFloat, fmt: (v) => v.toFixed(1) },
      { id: 'slider-brush-radius', label: 'val-brush-radius', key: 'brushRadius', parse: parseInt, fmt: (v) => `${v}px` },
      { id: 'slider-brush-force', label: 'val-brush-force', key: 'brushForce', parse: parseFloat, fmt: (v) => v.toFixed(1) }
    ];

    sliderBindings.forEach(({ id, label, key, parse, fmt }) => {
      const slider = document.getElementById(id);
      const labelEl = document.getElementById(label);

      if (slider) {
        slider.addEventListener('input', (e) => {
          const val = parse(e.target.value);
          this.params[key] = val;
          if (labelEl) labelEl.textContent = fmt(val);
          this.notifyChange(key, val);
        });
      }
    });
  }

  bindSelects() {
    const selects = [
      { id: 'select-field-type', key: 'fieldType' },
      { id: 'select-palette', key: 'palette' },
      { id: 'select-blend-mode', key: 'blendMode' },
      { id: 'select-brush-mode', key: 'brushMode' }
    ];

    selects.forEach(({ id, key }) => {
      const select = document.getElementById(id);
      if (select) {
        select.addEventListener('change', (e) => {
          this.params[key] = e.target.value;
          this.notifyChange(key, e.target.value);
        });
      }
    });
  }

  bindColorPicker() {
    const colorPicker = document.getElementById('color-background');
    if (colorPicker) {
      colorPicker.addEventListener('input', (e) => {
        this.params.bgColor = e.target.value;
        this.notifyChange('bgColor', e.target.value);
      });
    }
  }

  onChange(callback) {
    this.onParamsChangeCallbacks.push(callback);
  }

  notifyChange(key, value) {
    this.onParamsChangeCallbacks.forEach((cb) => cb(key, value, this.params));
  }

  randomize() {
    const palettes = ['cyberpunk', 'aurora', 'solar', 'emerald', 'monochrome'];
    const fields = ['simplex', 'lorenz', 'nbodies', 'vortex'];

    this.params.palette = palettes[Math.floor(Math.random() * palettes.length)];
    this.params.fieldType = fields[Math.floor(Math.random() * fields.length)];
    this.params.fieldScale = Math.random() * 0.007 + 0.001;
    this.params.maxSpeed = Math.random() * 5.0 + 1.0;
    this.params.trailFade = Math.floor(Math.random() * 30 + 70);

    this.syncDomFromParams();
    this.notifyChange('randomize', null, this.params);
  }

  resetToDefaults() {
    this.params = { ...this.defaultParams };
    this.syncDomFromParams();
    this.notifyChange('reset', null, this.params);
  }

  syncDomFromParams() {
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };

    setVal('slider-particle-count', this.params.particleCount);
    setVal('slider-max-speed', this.params.maxSpeed);
    setVal('slider-friction', this.params.friction);
    setVal('slider-particle-size', this.params.particleSize);
    setVal('slider-trail-fade', this.params.trailFade);
    setVal('slider-field-scale', this.params.fieldScale);
    setVal('slider-time-speed', this.params.timeSpeed);
    setVal('slider-field-strength', this.params.fieldStrength);
    setVal('select-field-type', this.params.fieldType);
    setVal('select-palette', this.params.palette);
    setVal('select-blend-mode', this.params.blendMode);
    setVal('select-brush-mode', this.params.brushMode);

    const updateLabel = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };

    updateLabel('val-particle-count', this.params.particleCount.toLocaleString('pt-BR'));
    updateLabel('val-max-speed', this.params.maxSpeed.toFixed(1));
    updateLabel('val-friction', this.params.friction.toFixed(3));
    updateLabel('val-particle-size', `${this.params.particleSize.toFixed(1)}px`);
    updateLabel('val-trail-fade', `${this.params.trailFade}%`);
    updateLabel('val-field-scale', this.params.fieldScale.toFixed(4));
    updateLabel('val-time-speed', this.params.timeSpeed.toFixed(3));
    updateLabel('val-field-strength', this.params.fieldStrength.toFixed(1));
    updateLabel('val-brush-radius', `${this.params.brushRadius}px`);
    updateLabel('val-brush-force', this.params.brushForce.toFixed(1));

    const nameEl = document.getElementById('current-preset');
    if (nameEl) nameEl.textContent = 'Quantum Nebula';
  }
}
