import { LAYERS } from '../core/SpatialGrid.js';

/**
 * Interactive God Mode tools for real-time user experimentation on the arena canvas.
 * Supports inspecting organisms, spawning food, spawning poison hazards, placing barrier walls,
 * and disintegrating organisms.
 */
export class GodModeTools {
    /**
     * @param {HTMLCanvasElement} canvas - Target simulation canvas
     * @param {import('../simulation/ScenarioManager.js').ScenarioManager} scenarioManager - Simulation controller
     * @param {import('../audio/SoundFX.js').SoundFX|null} [soundFX=null] - Procedural sound effects
     */
    constructor(canvas, scenarioManager, soundFX = null) {
        this.canvas = canvas;
        this.sm = scenarioManager;
        this.sound = soundFX;
        this.activeTool = 'inspect'; // 'inspect' | 'food' | 'poison' | 'wall' | 'kill'
        this._clickHandler = this._handleClick.bind(this);
        this._bindEvents();
    }

    /**
     * Sets the active tool.
     * @param {'inspect'|'food'|'poison'|'wall'|'kill'} tool
     */
    setTool(tool) {
        this.activeTool = tool;
    }

    /**
     * Binds mouse/pointer click events on the canvas.
     * @private
     */
    _bindEvents() {
        if (!this.canvas || typeof this.canvas.addEventListener !== 'function') return;
        this.canvas.addEventListener('click', this._clickHandler);
    }

    /**
     * Removes event listeners from canvas.
     */
    destroy() {
        if (!this.canvas || typeof this.canvas.removeEventListener !== 'function') return;
        this.canvas.removeEventListener('click', this._clickHandler);
    }

    /**
     * Handles canvas click event.
     * @private
     * @param {MouseEvent} e
     */
    _handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / (rect.width || this.canvas.width || 1);
        const scaleY = this.canvas.height / (rect.height || this.canvas.height || 1);
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        this.handleInteraction(x, y, this.activeTool);
    }

    /**
     * Directly executes a God Mode tool interaction at the given arena coordinates.
     * @param {number} x - Arena X coordinate
     * @param {number} y - Arena Y coordinate
     * @param {string} [tool=this.activeTool] - Tool identifier
     * @returns {object|null} Interaction result or spawned entity
     */
    handleInteraction(x, y, tool = this.activeTool) {
        if (!this.sm) return null;

        const env = this.sm.environment;
        const agents = this.sm.agents || [];
        const grid = this.sm.spatialGrid;

        switch (tool) {
            case 'inspect': {
                let closest = null;
                let minDSq = Infinity;

                for (const agent of agents) {
                    const dx = agent.x - x;
                    const dy = agent.y - y;
                    const dSq = dx * dx + dy * dy;
                    const radius = (agent.radius || 7) + 15;
                    if (dSq <= radius * radius && dSq < minDSq) {
                        minDSq = dSq;
                        closest = agent;
                    }
                }

                if (closest) {
                    this.sm.selectedAgent = closest;
                    if (this.sound) this.sound.playLaser();
                    return closest;
                }
                return null;
            }

            case 'food': {
                const food = {
                    id: `f_user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    x,
                    y,
                    radius: 5,
                    energyValue: 40
                };
                if (env && Array.isArray(env.food)) {
                    env.food.push(food);
                }
                if (grid) {
                    grid.insert(food, LAYERS.FOOD);
                }
                if (this.sound) this.sound.playEat();
                return food;
            }

            case 'poison': {
                const hazard = {
                    id: `h_user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    x,
                    y,
                    radius: 9,
                    damageValue: 50
                };
                if (env && Array.isArray(env.hazards)) {
                    env.hazards.push(hazard);
                }
                if (grid) {
                    grid.insert(hazard, LAYERS.HAZARDS);
                }
                if (this.sound) this.sound.playHazard();
                return hazard;
            }

            case 'wall': {
                const wall = {
                    id: `w_user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    x,
                    y,
                    radius: 14
                };
                if (env && Array.isArray(env.walls)) {
                    env.walls.push(wall);
                }
                if (grid) {
                    grid.insert(wall, LAYERS.WALLS);
                }
                if (this.sound) this.sound.playClick();
                return wall;
            }

            case 'kill': {
                let target = null;
                let minDSq = Infinity;

                for (const agent of agents) {
                    if (!agent.alive) continue;
                    const dx = agent.x - x;
                    const dy = agent.y - y;
                    const dSq = dx * dx + dy * dy;
                    const radius = (agent.radius || 7) + 20;
                    if (dSq <= radius * radius && dSq < minDSq) {
                        minDSq = dSq;
                        target = agent;
                    }
                }

                if (target) {
                    target.alive = false;
                    target.energy = 0;
                    if (grid) {
                        grid.remove(target, LAYERS.AGENTS);
                    }
                    if (this.sound) this.sound.playLaser();
                    return target;
                }
                return null;
            }

            default:
                return null;
        }
    }
}
