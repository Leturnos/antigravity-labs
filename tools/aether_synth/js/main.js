import { AudioEngine } from './audio/engine.js';
import { SynthVoice } from './audio/synth.js';
import { DrumSynth } from './audio/drums.js';
import { Sequencer } from './audio/sequencer.js';
import { OscilloscopeVisualizer } from './ui/visualizer.js';
import { SFXGenerator } from './audio/sfxr.js';
import { TrackerManager } from './audio/tracker.js';

document.addEventListener('DOMContentLoaded', () => {
  const audioEngine = new AudioEngine();
  const synthVoice = new SynthVoice();
  const drumSynth = new DrumSynth(synthVoice);
  const sequencer = new Sequencer(audioEngine, synthVoice, drumSynth);
  const sfxGenerator = new SFXGenerator();
  const trackerManager = new TrackerManager(sequencer);

  // Mode Tab Navigation
  const btnModeModular = document.getElementById('btn-mode-modular');
  const btnModeSfxr = document.getElementById('btn-mode-sfxr');
  const btnModeTracker = document.getElementById('btn-mode-tracker');

  const panelModular = document.getElementById('panel-modular');
  const panelSfxr = document.getElementById('panel-sfxr');
  const panelTracker = document.getElementById('panel-tracker');
  const sequencerSection = document.querySelector('.sequencer-section');

  function switchMode(mode) {
    btnModeModular?.classList.toggle('active', mode === 'modular');
    btnModeSfxr?.classList.toggle('active', mode === 'sfxr');
    btnModeTracker?.classList.toggle('active', mode === 'tracker');

    panelModular?.classList.toggle('hidden', mode !== 'modular');
    panelSfxr?.classList.toggle('hidden', mode !== 'sfxr');
    panelTracker?.classList.toggle('hidden', mode !== 'tracker');

    if (mode === 'sfxr') {
      sequencerSection?.classList.add('hidden');
    } else {
      sequencerSection?.classList.remove('hidden');
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
      osc1Type: document.getElementById('osc1-type')?.value || 'square',
      osc2Type: document.getElementById('osc2-type')?.value || 'sine',
      osc2DetuneSemitones: parseFloat(document.getElementById('osc2-detune')?.value || 7),
      fmDepth: parseFloat(document.getElementById('fm-depth')?.value || 0),
      amDepth: parseFloat(document.getElementById('am-depth')?.value || 0),
      attack: parseFloat(document.getElementById('env-attack')?.value || 0.01),
      decay: parseFloat(document.getElementById('env-decay')?.value || 0.2),
      sustain: parseFloat(document.getElementById('env-sustain')?.value || 0.5),
      release: parseFloat(document.getElementById('env-release')?.value || 0.3),
      cutoff: parseFloat(document.getElementById('filter-cutoff')?.value || 4000),
      resonance: parseFloat(document.getElementById('filter-res')?.value || 2),
      lfoRate: parseFloat(document.getElementById('lfo-rate')?.value || 4),
      lfoDepth: parseFloat(document.getElementById('lfo-depth')?.value || 0),
      lfoTarget: document.getElementById('lfo-target')?.value || 'filter'
    };
  }

  function setSynthParamsUI(params) {
    if (!params) return;
    if (params.osc1Type) document.getElementById('osc1-type').value = params.osc1Type;
    if (params.osc2Type) document.getElementById('osc2-type').value = params.osc2Type;
    if (params.osc2DetuneSemitones !== undefined) document.getElementById('osc2-detune').value = params.osc2DetuneSemitones;
    if (params.fmDepth !== undefined) document.getElementById('fm-depth').value = params.fmDepth;
    if (params.amDepth !== undefined) document.getElementById('am-depth').value = params.amDepth;
    if (params.attack !== undefined) document.getElementById('env-attack').value = params.attack;
    if (params.decay !== undefined) document.getElementById('env-decay').value = params.decay;
    if (params.sustain !== undefined) document.getElementById('env-sustain').value = params.sustain;
    if (params.release !== undefined) document.getElementById('env-release').value = params.release;
    if (params.cutoff !== undefined) document.getElementById('filter-cutoff').value = params.cutoff;
    if (params.resonance !== undefined) document.getElementById('filter-res').value = params.resonance;
    if (params.lfoRate !== undefined) document.getElementById('lfo-rate').value = params.lfoRate;
    if (params.lfoDepth !== undefined) document.getElementById('lfo-depth').value = params.lfoDepth;
    if (params.lfoTarget) document.getElementById('lfo-target').value = params.lfoTarget;
  }

  // Transport Control Events
  btnPlay?.addEventListener('click', () => {
    audioEngine.init();
    if (!visualizer) {
      visualizer = new OscilloscopeVisualizer(canvas, audioEngine.analyser);
      visualizer.start();
    }
    sequencer.bpm = parseInt(inputBpm.value) || 120;
    sequencer.swing = parseInt(inputSwing.value) || 0;
    sequencer.start(getSynthParams);
  });

  btnStop?.addEventListener('click', () => {
    sequencer.stop();
  });

  inputBpm?.addEventListener('change', () => {
    sequencer.bpm = parseInt(inputBpm.value) || 120;
  });

  inputSwing?.addEventListener('input', () => {
    const val = parseInt(inputSwing.value) || 0;
    valSwing.textContent = `${val}%`;
    sequencer.swing = val;
  });

  inputMasterVol?.addEventListener('input', () => {
    audioEngine.setMasterVolume(parseFloat(inputMasterVol.value));
  });

  // WAV Exporter via OfflineAudioContext
  btnExportWav?.addEventListener('click', async () => {
    btnExportWav.disabled = true;
    btnExportWav.textContent = '⏳ GRAVANDO...';

    audioEngine.init();
    const synthParams = getSynthParams();

    const wavBlob = await audioEngine.renderOfflineWav((offlineCtx, offlineDestination) => {
      // Re-schedule the full sequence for offline rendering
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
    }, 4);

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

  [sfxWave, sfxFreq, sfxSlide, sfxAttack, sfxSustain, sfxDecay, sfxDuty, sfxVibDepth].forEach(input => {
    input?.addEventListener('input', () => {
      readSFXControlsUI();
    });
  });

  // --- TRACKER & TIMELINE ARRANGER CONTROLS ---

  const patternButtons = document.querySelectorAll('.btn-pattern');
  const btnToggleSongmode = document.getElementById('btn-toggle-songmode');
  const timelineSlotsContainer = document.getElementById('timeline-slots');
  const btnAddTimelineSlot = document.getElementById('btn-add-timeline-slot');
  const btnClearTimeline = document.getElementById('btn-clear-timeline');

  const btnDemoCyberpunk = document.getElementById('demo-cyberpunk');
  const btnDemoChiptune = document.getElementById('demo-chiptune');
  const btnExportJson = document.getElementById('btn-export-json');
  const btnImportJson = document.getElementById('btn-import-json');
  const inputJsonFile = document.getElementById('input-json-file');

  // Switch Active Pattern (1 to 4)
  function updatePatternSelectorUI() {
    patternButtons.forEach(btn => {
      const pid = parseInt(btn.getAttribute('data-pattern'));
      btn.classList.toggle('active', pid === trackerManager.activePatternId);
    });
  }

  patternButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = parseInt(btn.getAttribute('data-pattern'));
      trackerManager.saveActiveSequencerPattern();
      trackerManager.loadPatternToSequencer(pid);
      updatePatternSelectorUI();
      renderSequencerUI(sequencer);
    });
  });

  // Toggle Song Mode vs Current Pattern Mode
  btnToggleSongmode?.addEventListener('click', () => {
    trackerManager.songMode = !trackerManager.songMode;
    if (trackerManager.songMode) {
      btnToggleSongmode.textContent = '🎵 MÚSICA COMPLETA (SONG)';
      btnToggleSongmode.classList.remove('primary');
      btnToggleSongmode.classList.add('action');
    } else {
      btnToggleSongmode.textContent = '🔁 PADRÃO ATUAL (LOOP)';
      btnToggleSongmode.classList.remove('action');
      btnToggleSongmode.classList.add('primary');
    }
  });

  // Render Timeline Sequence Slots
  function renderTimelineUI() {
    if (!timelineSlotsContainer) return;
    timelineSlotsContainer.innerHTML = '';

    trackerManager.songSequence.forEach((patternId, index) => {
      const slot = document.createElement('div');
      slot.className = 'timeline-slot';
      if (trackerManager.songMode && trackerManager.currentTimelineIndex === index) {
        slot.classList.add('current');
      }

      const label = document.createElement('span');
      label.textContent = `#${index + 1}:`;

      const select = document.createElement('select');
      [1, 2, 3, 4].forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = `PADRÃO ${p}`;
        if (p === patternId) opt.selected = true;
        select.appendChild(opt);
      });

      select.addEventListener('change', (e) => {
        trackerManager.songSequence[index] = parseInt(e.target.value);
        trackerManager.saveToLocalStorage(getSynthParams());
      });

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-remove-slot';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => {
        trackerManager.songSequence.splice(index, 1);
        if (trackerManager.songSequence.length === 0) {
          trackerManager.songSequence = [1];
        }
        renderTimelineUI();
        trackerManager.saveToLocalStorage(getSynthParams());
      });

      slot.appendChild(label);
      slot.appendChild(select);
      slot.appendChild(removeBtn);
      timelineSlotsContainer.appendChild(slot);
    });
  }

  btnAddTimelineSlot?.addEventListener('click', () => {
    trackerManager.songSequence.push(trackerManager.activePatternId);
    renderTimelineUI();
    trackerManager.saveToLocalStorage(getSynthParams());
  });

  btnClearTimeline?.addEventListener('click', () => {
    trackerManager.songSequence = [1];
    renderTimelineUI();
    trackerManager.saveToLocalStorage(getSynthParams());
  });

  // Trigger Song Timeline Advancement on Loop Completion
  sequencer.onLoopComplete(() => {
    if (trackerManager.songMode) {
      trackerManager.advanceSongTimeline();
      updatePatternSelectorUI();
      renderSequencerUI(sequencer);
      renderTimelineUI();
    }
  });

  // Demo Songs
  btnDemoCyberpunk?.addEventListener('click', () => {
    trackerManager.loadDemoCyberpunk();
    if (inputBpm) inputBpm.value = sequencer.bpm;
    if (inputSwing) inputSwing.value = sequencer.swing;
    if (valSwing) valSwing.textContent = `${sequencer.swing}%`;
    updatePatternSelectorUI();
    renderSequencerUI(sequencer);
    renderTimelineUI();
  });

  btnDemoChiptune?.addEventListener('click', () => {
    trackerManager.loadDemoChiptune();
    if (inputBpm) inputBpm.value = sequencer.bpm;
    if (inputSwing) inputSwing.value = sequencer.swing;
    if (valSwing) valSwing.textContent = `${sequencer.swing}%`;
    updatePatternSelectorUI();
    renderSequencerUI(sequencer);
    renderTimelineUI();
  });

  // Export JSON
  btnExportJson?.addEventListener('click', () => {
    const jsonStr = trackerManager.exportProjectJSON(getSynthParams());
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aether_synth_project_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import JSON
  btnImportJson?.addEventListener('click', () => {
    inputJsonFile?.click();
  });

  inputJsonFile?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const loadedData = trackerManager.importProjectJSON(event.target.result);
        if (loadedData.synthParams) setSynthParamsUI(loadedData.synthParams);
        if (inputBpm) inputBpm.value = sequencer.bpm;
        if (inputSwing) inputSwing.value = sequencer.swing;
        if (valSwing) valSwing.textContent = `${sequencer.swing}%`;

        updatePatternSelectorUI();
        renderSequencerUI(sequencer);
        renderTimelineUI();
      } catch (err) {
        alert('Erro ao carregar o projeto JSON. Verifique o formato do arquivo.');
      }
    };
    reader.readAsText(file);
  });

  // Initial LocalStorage Restoration or Render
  const restoredData = trackerManager.loadFromLocalStorage();
  if (restoredData && restoredData.synthParams) {
    setSynthParamsUI(restoredData.synthParams);
    if (inputBpm) inputBpm.value = sequencer.bpm;
    if (inputSwing) inputSwing.value = sequencer.swing;
    if (valSwing) valSwing.textContent = `${sequencer.swing}%`;
  }
  updatePatternSelectorUI();
  renderTimelineUI();

  // Step Grid UI Renderer
  function renderSequencerUI(seq) {
    const indicatorsContainer = document.getElementById('step-indicators');
    const gridContainer = document.getElementById('seq-grid');

    if (!indicatorsContainer || !gridContainer) return;

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
          trackerManager.saveToLocalStorage(getSynthParams());
        });

        stepsContainer.appendChild(stepBtn);
      }

      trackRow.appendChild(label);
      trackRow.appendChild(stepsContainer);
      gridContainer.appendChild(trackRow);
    });
  }
});
