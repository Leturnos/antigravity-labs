import { ScenarioManager } from './simulation/ScenarioManager.js';
import { CanvasRenderer } from './ui/CanvasRenderer.js';
import { BrainVisualizer } from './ui/BrainVisualizer.js';
import { ChartVisualizer } from './ui/ChartVisualizer.js';
import { GodModeTools } from './ui/GodModeTools.js';
import { SoundFX } from './audio/SoundFX.js';
import { StateManager } from './core/StateManager.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Canvases and Audio Engine
    const simCanvas = document.getElementById('simCanvas');
    const brainCanvas = document.getElementById('brainCanvas');
    const chartCanvas = document.getElementById('chartCanvas');

    const sound = new SoundFX();
    const sm = new ScenarioManager(simCanvas.width, simCanvas.height);
    const renderer = new CanvasRenderer(simCanvas);
    const brainVis = new BrainVisualizer(brainCanvas);
    const chartVis = new ChartVisualizer(chartCanvas);
    const godTools = new GodModeTools(simCanvas, sm, sound);

    let simSpeed = 1;
    let toastTimeout = null;

    // 2. UI Elements
    const statGen = document.getElementById('statGen');
    const statAllTime = document.getElementById('statAllTime');
    const statLastGen = document.getElementById('statLastGen');
    const statLiving = document.getElementById('statLiving');
    const statFitness = document.getElementById('statFitness');
    const statTicks = document.getElementById('statTicks');
    const epochProgressBar = document.getElementById('epochProgressBar');

    const scenarioSelect = document.getElementById('scenarioSelect');
    const modelSelect = document.getElementById('modelSelect');
    const btnSound = document.getElementById('btnSound');
    const btnExport = document.getElementById('btnExport');
    const btnImport = document.getElementById('btnImport');
    const fileInput = document.getElementById('fileInput');

    const toastEl = document.getElementById('arenaToast');
    const toastIcon = document.getElementById('toastIcon');
    const toastMessage = document.getElementById('toastMessage');

    /**
     * Displays a floating toast notification.
     * @param {string} msg
     * @param {string} [icon='✨']
     */
    function showToast(msg, icon = '✨') {
        if (!toastEl) return;
        if (toastTimeout) clearTimeout(toastTimeout);

        toastIcon.textContent = icon;
        toastMessage.textContent = msg;
        toastEl.classList.add('visible');

        toastTimeout = setTimeout(() => {
            toastEl.classList.remove('visible');
        }, 3200);
    }

    /**
     * Updates real-time simulation statistics on the sidebar HUD.
     */
    function updateStats() {
        if (!sm.ga) return;

        statGen.textContent = `#${sm.generation}`;
        const living = sm.agents.filter(a => a.alive);
        statLiving.textContent = `${living.length} / ${sm.agents.length}`;

        const currentMaxFit = sm.agents.length > 0
            ? Math.max(...sm.agents.map(a => a.fitness))
            : 0;

        statFitness.textContent = currentMaxFit.toFixed(1);

        if (statAllTime) {
            statAllTime.textContent = Math.max(sm.allTimeBestFitness, currentMaxFit).toFixed(1);
        }
        if (statLastGen) {
            statLastGen.textContent = sm.lastGenBestFitness.toFixed(1);
        }

        const progress = Math.min(100, (sm.ticks / sm.maxTicksPerGen) * 100);
        if (statTicks) {
            statTicks.textContent = `${Math.round(progress)}%`;
        }
        if (epochProgressBar) {
            epochProgressBar.style.width = `${progress}%`;
        }
    }

    // 3. Generation Turnover Callback
    sm.onGenerationEnd = (gen, best, history) => {
        sound.playNewGen();
        chartVis.render(history);
        brainVis.invalidateCache();
        updateStats();

        // Autosave snapshot to localStorage
        const snapshot = {
            scenario: scenarioSelect.value,
            modelType: modelSelect.value,
            generation: gen,
            allTimeBestFitness: sm.allTimeBestFitness,
            lastGenBestFitness: sm.lastGenBestFitness,
            fitnessHistory: history,
            populationGenomes: sm.ga.population.map(p => p.toJSON())
        };
        StateManager.saveToLocalStorage('aether_genetic_arena_autosave', snapshot);
    };

    // 4. Initial Scenario Load
    sm.loadScenario(scenarioSelect.value, { modelType: modelSelect.value });
    updateStats();
    chartVis.render(sm.ga.fitnessHistory);

    // 5. Scenario & Model Selection Handlers
    scenarioSelect.addEventListener('change', () => {
        sm.loadScenario(scenarioSelect.value, { modelType: modelSelect.value });
        brainVis.invalidateCache();
        chartVis.render(sm.ga.fitnessHistory);
        updateStats();
        showToast(`Cenário carregado: ${scenarioSelect.options[scenarioSelect.selectedIndex].text}`, '🌀');
    });

    modelSelect.addEventListener('change', () => {
        const confirmed = confirm('Alterar a arquitetura neural reiniciará a evolução da população. Deseja continuar?');
        if (confirmed) {
            sm.loadScenario(scenarioSelect.value, { modelType: modelSelect.value });
            brainVis.invalidateCache();
            chartVis.render(sm.ga.fitnessHistory);
            updateStats();
            showToast(`Arquitetura neural alterada para ${modelSelect.value}`, '🧠');
        } else {
            modelSelect.value = sm.ga.modelType;
        }
    });

    // 6. Speed Multipliers Controls
    document.querySelectorAll('#speedControls button[data-speed]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#speedControls button[data-speed]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            simSpeed = parseInt(btn.dataset.speed, 10);
            sound.playClick();
        });
    });

    document.getElementById('btnInstantGen').addEventListener('click', () => {
        sound.playClick();
        sm.runInstantGeneration();
        chartVis.render(sm.ga.fitnessHistory);
        brainVis.invalidateCache();
        updateStats();
        showToast(`Geração #${sm.generation - 1} concluída! Campeão: ${sm.lastGenBestFitness.toFixed(1)}`, '⚡');
    });

    // 7. God Mode Interactive Tools
    document.querySelectorAll('#godTools button[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#godTools button[data-tool]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            godTools.activeTool = btn.dataset.tool;
            sound.playClick();

            const toolNames = {
                inspect: 'Inspecionar',
                food: 'Pincel de Alimento (+E)',
                poison: 'Pincel de Veneno (-E)',
                wall: 'Construir Barreiras',
                kill: 'Raio Desintegrador'
            };
            showToast(`Ferramenta ativada: ${toolNames[btn.dataset.tool] || btn.dataset.tool}`, '🛠️');
        });
    });

    // 8. Procedural Audio Toggle
    btnSound.addEventListener('click', () => {
        sound.muted = !sound.muted;
        btnSound.textContent = sound.muted ? '🔇 Mudo' : '🔊 Áudio';
        btnSound.classList.toggle('active', !sound.muted);
        showToast(sound.muted ? 'Áudio desativado' : 'Áudio ativado', sound.muted ? '🔇' : '🔊');
    });

    // 9. Export State Snapshot to JSON
    btnExport.addEventListener('click', () => {
        sound.playClick();
        const data = StateManager.serialize({
            scenario: scenarioSelect.value,
            modelType: modelSelect.value,
            generation: sm.generation,
            allTimeBestFitness: sm.allTimeBestFitness,
            lastGenBestFitness: sm.lastGenBestFitness,
            fitnessHistory: sm.ga.fitnessHistory,
            populationGenomes: sm.ga.population.map(p => p.toJSON())
        });

        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aether-genetic-arena-gen-${sm.generation}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`Snapshot da Geração #${sm.generation} exportado em JSON!`, '💾');
    });

    // 10. Import State Snapshot from JSON
    btnImport.addEventListener('click', () => {
        sound.playClick();
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const state = StateManager.deserialize(evt.target.result);
            if (state) {
                scenarioSelect.value = state.scenario || 'foraging';
                modelSelect.value = state.modelType || 'NEAT';

                sm.loadScenario(state.scenario, { modelType: state.modelType });
                sm.ga.generation = state.generation || 1;
                sm.allTimeBestFitness = state.allTimeBestFitness || 0;
                sm.lastGenBestFitness = state.lastGenBestFitness || 0;
                sm.ga.fitnessHistory = state.fitnessHistory || [];

                chartVis.render(sm.ga.fitnessHistory);
                brainVis.invalidateCache();
                updateStats();
                showToast(`Sessão restaurada com sucesso na Geração #${sm.generation}!`, '📂');
            } else {
                showToast('Erro ao importar arquivo JSON: formato inválido.', '⚠️');
            }
            fileInput.value = '';
        };
        reader.readAsText(file);
    });

    // 11. Main 60 FPS Animation & Simulation Loop
    function loop() {
        for (let i = 0; i < simSpeed; i++) {
            sm.step(1 / 60);
        }

        renderer.render(sm, sm.agents, sm.selectedAgent);
        brainVis.render(sm.selectedAgent);
        updateStats();

        requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
});
