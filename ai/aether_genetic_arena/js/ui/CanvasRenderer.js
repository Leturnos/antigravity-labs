/**
 * 2D Canvas Renderer for the Aether Genetic Arena simulation.
 * Draws glowing food particles, toxic hazards, boundary walls, navigation checkpoints,
 * organisms with directional heading indicators, elite crown halos, and selected agent sensory rays.
 */
export class CanvasRenderer {
    /**
     * @param {HTMLCanvasElement} canvas - Target simulation canvas
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas ? canvas.getContext('2d') : null;
        this.beaconPhase = 0;
    }

    /**
     * Renders the complete simulation state.
     * @param {import('../simulation/Environment.js').Environment|import('../simulation/ScenarioManager.js').ScenarioManager} environmentOrManager
     * @param {import('../simulation/Agent.js').Agent[]} [agentsList]
     * @param {import('../simulation/Agent.js').Agent|null} [selectedAgent]
     */
    render(environmentOrManager, agentsList, selectedAgent) {
        if (!this.ctx || !environmentOrManager) return;

        let environment = environmentOrManager;
        let agents = agentsList || [];
        let selected = selectedAgent || null;
        let scenario = null;

        if (environmentOrManager.environment && Array.isArray(environmentOrManager.agents)) {
            environment = environmentOrManager.environment;
            agents = environmentOrManager.agents;
            selected = environmentOrManager.selectedAgent || null;
            scenario = environmentOrManager.scenario || null;
        }

        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        this.beaconPhase = (this.beaconPhase + 0.05) % (Math.PI * 2);

        // 1. Dark Futuristic Arena Background
        ctx.fillStyle = '#060911';
        ctx.fillRect(0, 0, width, height);

        // 2. Cyberpunk Coordinate Grid
        ctx.strokeStyle = 'rgba(0, 243, 255, 0.04)';
        ctx.lineWidth = 1;
        const gridSize = 40;
        for (let x = 0; x <= width; x += gridSize) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        }
        for (let y = 0; y <= height; y += gridSize) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        }

        // 3. Boundary & Obstacle Walls
        if (environment.walls) {
            ctx.fillStyle = '#1e293b';
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 2;
            for (const w of environment.walls) {
                ctx.beginPath();
                ctx.arc(w.x, w.y, w.radius || 10, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
        }

        // 4. Maze Checkpoints (if active scenario)
        if (scenario && scenario.checkpoints) {
            for (const cp of scenario.checkpoints) {
                ctx.beginPath();
                ctx.arc(cp.x, cp.y, cp.radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 243, 255, 0.08)';
                ctx.fill();
                ctx.strokeStyle = '#00f3ff';
                ctx.setLineDash([4, 4]);
                ctx.stroke();
                ctx.setLineDash([]);

                // Checkpoint index number
                ctx.font = '700 12px monospace';
                ctx.fillStyle = '#00f3ff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`CP ${cp.index || 1}`, cp.x, cp.y);
            }
        }

        // 5. Food Particles (Green Glow)
        if (environment.food) {
            ctx.fillStyle = '#10b981';
            ctx.shadowColor = '#10b981';
            ctx.shadowBlur = 10;
            for (const f of environment.food) {
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.radius || 4.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 6. Toxic Hazards (Red/Rose Glow)
        if (environment.hazards) {
            ctx.fillStyle = '#f43f5e';
            ctx.shadowColor = '#f43f5e';
            ctx.shadowBlur = 12;
            for (const h of environment.hazards) {
                ctx.beginPath();
                ctx.arc(h.x, h.y, h.radius || 9, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.shadowBlur = 0;

        // 7. Organisms (Agents)
        for (const agent of agents) {
            if (!agent.alive) continue;

            const isSelected = selected && selected.id === agent.id;
            const isElite = !!agent.isElite;

            // Vision Raycasting Cones (Selected agent)
            if (isSelected) {
                const startAngle = agent.angle - agent.rayFov / 2;
                const angleStep = agent.rayCount > 1 ? agent.rayFov / (agent.rayCount - 1) : 0;

                for (let i = 0; i < agent.rayCount; i++) {
                    const rayAngle = startAngle + i * angleStep;
                    const len = (agent.raycastOutputs[i] !== undefined ? agent.raycastOutputs[i] : 1.0) * agent.rayMaxDist;
                    const hitType = agent.detectedTypes ? agent.detectedTypes[i] : 0;

                    ctx.beginPath();
                    ctx.moveTo(agent.x, agent.y);
                    const endX = agent.x + Math.cos(rayAngle) * len;
                    const endY = agent.y + Math.sin(rayAngle) * len;
                    ctx.lineTo(endX, endY);

                    // Color code ray based on what it sees
                    if (hitType === 1.0) ctx.strokeStyle = 'rgba(16, 185, 129, 0.7)'; // Food (green)
                    else if (hitType === -1.0) ctx.strokeStyle = 'rgba(244, 63, 94, 0.7)'; // Hazard (red)
                    else ctx.strokeStyle = 'rgba(0, 243, 255, 0.35)'; // Wall or empty (cyan)

                    ctx.lineWidth = 1.5;
                    ctx.stroke();

                    // Impact dot
                    if (len < agent.rayMaxDist) {
                        ctx.beginPath();
                        ctx.arc(endX, endY, 3, 0, Math.PI * 2);
                        ctx.fillStyle = hitType === 1.0 ? '#10b981' : (hitType === -1.0 ? '#f43f5e' : '#00f3ff');
                        ctx.fill();
                    }
                }
            }

            // Elite Champion Halo
            if (isElite) {
                const pulseRadius = agent.radius + 5 + Math.sin(this.beaconPhase) * 2;
                ctx.beginPath();
                ctx.arc(agent.x, agent.y, pulseRadius, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(251, 191, 36, 0.75)'; // Gold
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            // Agent Body
            ctx.save();
            ctx.translate(agent.x, agent.y);
            ctx.rotate(agent.angle);

            ctx.beginPath();
            ctx.arc(0, 0, agent.radius, 0, Math.PI * 2);

            if (agent.type === 'predator') {
                ctx.fillStyle = isElite ? '#ea580c' : '#ef4444';
            } else if (isElite) {
                ctx.fillStyle = '#fbbf24'; // Gold for elite champions
            } else {
                ctx.fillStyle = isSelected ? '#00f3ff' : '#38bdf8';
            }
            ctx.fill();

            ctx.strokeStyle = isSelected ? '#ffffff' : (isElite ? '#fef08a' : '#0f172a');
            ctx.lineWidth = isSelected || isElite ? 2 : 1.5;
            ctx.stroke();

            // Heading Nose Indicator
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(agent.radius + 5, 0);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.restore();
        }
    }
}
