import { AudioEngine } from './audio/engine.js';
import { SynthVoice } from './audio/synth.js';
import { DrumSynth } from './audio/drums.js';
import { Sequencer } from './audio/sequencer.js';
import { OscilloscopeVisualizer } from './ui/visualizer.js';
import { SFXGenerator } from './audio/sfxr.js';

document.addEventListener('DOMContentLoaded', () => {
  const audioEngine = new AudioEngine();
  const synthVoice = new SynthVoice();
  const drumSynth = new DrumSynth(synthVoice);
  const sequencer = new Sequencer(audioEngine, synthVoice, drumSynth);
  const sfxGenerator = new SFXGenerator();

  // Mode Tab Navigation
  const btnModeModular = document.getElementById('btn-mode-modular');
  const btnModeSfxr = document.getElementById('btn-mode-sfxr');
  const btnModeTracker = document.getElementById('btn-mode-tracker');

  const panelModular = document.getElementById('panel-modular');
  const panelSfxr = document.getElementById('panel-sfxr');
  const sequencerSection = document.querySelector('.sequencer-section');

  function switchMode(mode) {
    btnModeModular.classList.toggle('active', mode === 'modular');
    btnModeSfxr.classList.toggle('active', mode === 'sfxr');
    btnModeTracker.classList.toggle('active', mode === 'tracker');

    panelModular.classList.toggle('hidden', mode !== 'modular');
    panelSfxr.classList.toggle('hidden', mode !== 'sfxr');

    if (mode === 'sfxr') {
      sequencerSection.classList.add('hidden');
    } else {
      sequencerSection.classList.remove('hidden');
    }
  }

  btnModeModular?.addEventListener('click', () => switchMode('modular'));
  btnModeSfxr?.addEventListener('click', () => switchMode('sfxr'));
  btnModeTracker?.addEventListener('click', () => switchMode('tracker'));

  // DOM Elements - Modular Synth & Sequencer Controls
  const btnPlay = document.getElementById('btn-play');
  const btnStop = document.getElementById('btn-stop');
  const inputBpm = document.getElementById('input-bpm');
  const inputSwing = document.getElementById('input-swing');
  const valSwing = document.getElementById('val-swing');
  const inputMasterVol = document.getElementById('input-master-vol');
  const btnExportWav = document.getElementById('btn-export-wav');
  const canvas = document.getElementById('oscillator-canvas');

  // Initialize Sequencer UI
  renderSequencerUI(sequencer);

  // Initialize Oscilloscope
  let visualizer = null;

  // Helper to read synthesizer parameter values from UI controls
  function getSynthParams() {
    return {
      osc1Type: document.getElementById('osc1-type').value,
      osc2Type: document.getElementById('osc2-type').value,
      osc2DetuneSemitones: parseFloat(document.getElementById('osc2-detune').value),
      fmDepth: parseFloat(document.getElementById('fm-depth').value),
      amDepth: parseFloat(document.getElementById('am-depth').value),
      attack: parseFloat(document.getElementById('env-attack').value),
      decay: parseFloat(document.getElementById('env-decay').value),
      sustain: parseFloat(document.getElementById('env-sustain').value),
      release: parseFloat(document.getElementById('env-release').value),
      cutoff: parseFloat(document.getElementById('filter-cutoff').value),
      resonance: parseFloat(document.getElementById('filter-res').value),
      lfoRate: parseFloat(document.getElementById('lfo-rate').value),
      lfoDepth: parseFloat(document.getElementById('lfo-depth').value),
      lfoTarget: document.getElementById('lfo-target').value
    };
  }

  // Transport Control Events
  btnPlay.addEventListener('click', () => {
    audioEngine.init();
    if (!visualizer) {
      visualizer = new OscilloscopeVisualizer(canvas, audioEngine.analyser);
      visualizer.start();
    }
    sequencer.bpm = parseInt(inputBpm.value) || 120;
    sequencer.swing = parseInt(inputSwing.value) || 0;
    sequencer.start(getSynthParams);
  });

  btnStop.addEventListener('click', () => {
    sequencer.stop();
  });

  inputBpm.addEventListener('change', () => {
    sequencer.bpm = parseInt(inputBpm.value) || 120;
  });

  inputSwing.addEventListener('input', () => {
    const val = parseInt(inputSwing.value) || 0;
    valSwing.textContent = `${val}%`;
    sequencer.swing = val;
  });

  inputMasterVol.addEventListener('input', () => {
    audioEngine.setMasterVolume(parseFloat(inputMasterVol.value));
  });

  // WAV Exporter via OfflineAudioContext
  btnExportWav.addEventListener('click', async () => {
    btnExportWav.disabled = true;
    btnExportWav.textContent = '⏳ GRAVANDO...';

    audioEngine.init();
    const synthParams = getSynthParams();

    const wavBlob = await audioEngine.renderOfflineWav((offlineCtx, offlineDestination) => {
      // Re-schedule the full 16-step sequence for offline rendering context
      const bpm = sequencer.bpm;
      const stepDuration = (60.0 / bpm) / 4.0;
      
      for (let step = 0; step < 16; step++) {
        const time = step * stepDuration;
        sequencer.tracks.forEach(track => {
          if (track.steps[step]) {
            if (track.type === 'drum') {
              drumSynth.trigger(offlineCtx, offlineDestination, track.id, time);
            } else if (track.type === 'synth') {
              const noteName = track.notes[step] || 'C4';
              synthVoice.triggerNote(offlineCtx, offlineDestination, 261.63, time, 0.15, synthParams);
            }
          }
        });
      }
    }, 4); // Record 4 seconds of audio

    // Download WAV file
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aether-synth-${Date.now()}.wav`;
    a.click();
    URL.revokeObjectURL(url);

    btnExportWav.disabled = false;
    btnExportWav.textContent = '💾 GRAVAR WAV';
  });

  // --- SFX 8-BIT GENERATOR CONTROLS ---
  const sfxWave = document.getElementById('sfx-wave');
  const sfxFreq = document.getElementById('sfx-freq');
  const sfxSlide = document.getElementById('sfx-slide');
  const sfxAttack = document.getElementById('sfx-attack');
  const sfxSustain = document.getElementById('sfx-sustain');
  const sfxDecay = document.getElementById('sfx-decay');
  const sfxDuty = document.getElementById('sfx-duty');
  const sfxVibDepth = document.getElementById('sfx-vib-depth');

  function updateSFXControlsUI() {
    const p = sfxGenerator.params;
    if (sfxWave) sfxWave.value = p.waveType;
    if (sfxFreq) sfxFreq.value = p.startFrequency;
    if (sfxSlide) sfxSlide.value = p.slide;
    if (sfxAttack) sfxAttack.value = p.attackTime;
    if (sfxSustain) sfxSustain.value = p.sustainTime;
    if (sfxDecay) sfxDecay.value = p.decayTime;
    if (sfxDuty) sfxDuty.value = p.squareDuty;
    if (sfxVibDepth) sfxVibDepth.value = p.vibratoDepth;
  }

  function readSFXControlsUI() {
    const p = sfxGenerator.params;
    if (sfxWave) p.waveType = sfxWave.value;
    if (sfxFreq) p.startFrequency = parseFloat(sfxFreq.value);
    if (sfxSlide) p.slide = parseFloat(sfxSlide.value);
    if (sfxAttack) p.attackTime = parseFloat(sfxAttack.value);
    if (sfxSustain) p.sustainTime = parseFloat(sfxSustain.value);
    if (sfxDecay) p.decayTime = parseFloat(sfxDecay.value);
    if (sfxDuty) p.squareDuty = parseFloat(sfxDuty.value);
    if (sfxVibDepth) p.vibratoDepth = parseFloat(sfxVibDepth.value);
  }

  function playSFX() {
    audioEngine.init();
    if (!visualizer) {
      visualizer = new OscilloscopeVisualizer(canvas, audioEngine.analyser);
      visualizer.start();
    }
    readSFXControlsUI();
    sfxGenerator.play(audioEngine.ctx, audioEngine.masterGain);
  }

  // SFX Presets
  document.getElementById('sfx-laser')?.addEventListener('click', () => {
    sfxGenerator.presetLaser();
    updateSFXControlsUI();
    playSFX();
  });

  document.getElementById('sfx-explosion')?.addEventListener('click', () => {
    sfxGenerator.presetExplosion();
    updateSFXControlsUI();
    playSFX();
  });

  document.getElementById('sfx-coin')?.addEventListener('click', () => {
    sfxGenerator.presetCoin();
    updateSFXControlsUI();
    playSFX();
  });

  document.getElementById('sfx-jump')?.addEventListener('click', () => {
    sfxGenerator.presetJump();
    updateSFXControlsUI();
    playSFX();
  });

  document.getElementById('sfx-powerup')?.addEventListener('click', () => {
    sfxGenerator.presetPowerup();
    updateSFXControlsUI();
    playSFX();
  });

  document.getElementById('sfx-hit')?.addEventListener('click', () => {
    sfxGenerator.presetHit();
    updateSFXControlsUI();
    playSFX();
  });

  // SFX Actions
  document.getElementById('sfx-mutate')?.addEventListener('click', () => {
    sfxGenerator.mutate();
    updateSFXControlsUI();
    playSFX();
  });

  document.getElementById('sfx-random')?.addEventListener('click', () => {
    sfxGenerator.randomize();
    updateSFXControlsUI();
    playSFX();
  });

  document.getElementById('sfx-play')?.addEventListener('click', () => {
    playSFX();
  });

  document.getElementById('sfx-export-wav')?.addEventListener('click', () => {
    audioEngine.init();
    readSFXControlsUI();
    sfxGenerator.exportWAV(audioEngine.ctx);
  });

  // Attach input event listeners for live tweaking
  [sfxWave, sfxFreq, sfxSlide, sfxAttack, sfxSustain, sfxDecay, sfxDuty, sfxVibDepth].forEach(input => {
    input?.addEventListener('input', () => {
      readSFXControlsUI();
    });
  });

  // Step Grid UI Renderer
  function renderSequencerUI(seq) {
    const indicatorsContainer = document.getElementById('step-indicators');
    const gridContainer = document.getElementById('seq-grid');

    indicatorsContainer.innerHTML = '';
    gridContainer.innerHTML = '';

    // Top LEDs
    const leds = [];
    for (let i = 0; i < 16; i++) {
      const led = document.createElement('div');
      led.className = 'step-led';
      indicatorsContainer.appendChild(led);
      leds.push(led);
    }

    seq.onStepChange(currentStep => {
      leds.forEach((led, idx) => {
        led.classList.toggle('active', idx === currentStep);
      });
    });

    // Tracks
    seq.tracks.forEach(track => {
      const trackRow = document.createElement('div');
      trackRow.className = 'seq-track';

      const label = document.createElement('div');
      label.className = 'track-label';
      label.textContent = track.label;

      const stepsContainer = document.createElement('div');
      stepsContainer.className = 'track-steps';

      for (let i = 0; i < 16; i++) {
        const stepBtn = document.createElement('button');
        stepBtn.className = 'step-btn';
        if (track.steps[i]) stepBtn.classList.add('active');

        stepBtn.addEventListener('click', () => {
          track.steps[i] = !track.steps[i];
          stepBtn.classList.toggle('active', track.steps[i]);
        });

        stepsContainer.appendChild(stepBtn);
      }

      trackRow.appendChild(label);
      trackRow.appendChild(stepsContainer);
      gridContainer.appendChild(trackRow);
    });
  }
});
