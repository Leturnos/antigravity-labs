import { LAYERS } from '../core/SpatialGrid.js';

export class Agent {
    constructor(config = {}) {
        this.id = config.id || Math.random().toString(36).substring(2, 9);
        this.x = config.x !== undefined ? config.x : 400;
        this.y = config.y !== undefined ? config.y : 300;
        this.radius = config.radius !== undefined ? config.radius : 7;
        this.mass = config.mass !== undefined ? config.mass : 1.0;
        this.angle = config.angle !== undefined ? config.angle : Math.random() * Math.PI * 2;
        this.vx = config.vx || 0;
        this.vy = config.vy || 0;
        this.angularVelocity = config.angularVelocity || 0;
        this.maxSpeed = config.maxSpeed || 3.8;
        this.maxForce = config.maxForce || 0.35;
        this.maxTorque = config.maxTorque || 0.18;
        this.drag = config.drag !== undefined ? config.drag : 0.94;
        this.angularDrag = config.angularDrag !== undefined ? config.angularDrag : 0.88;

        this.energy = config.energy !== undefined ? config.energy : 100;
        this.maxEnergy = config.maxEnergy || 150;
        this.alive = config.alive !== undefined ? config.alive : true;
        this.fitness = config.fitness || 0;
        this.isElite = !!config.isElite;
        this.type = config.type || 'prey'; // 'prey' | 'predator'

        this.brain = config.brain || null;
        this.rayCount = config.rayCount || 5;
        this.rayFov = config.rayFov || (Math.PI * 0.7); // ~126 degrees
        this.rayMaxDist = config.rayMaxDist || 160;
        this.raycastOutputs = new Array(this.rayCount).fill(1.0);
        this.detectedTypes = new Array(this.rayCount).fill(0);
        this.compositeSensors = new Array(this.rayCount).fill(0);
        this.currentCheckpoint = config.currentCheckpoint || 0;
    }

    castSensors(spatialGrid) {
        if (!spatialGrid) return;
        const startAngle = this.angle - this.rayFov / 2;
        const angleStep = this.rayCount > 1 ? this.rayFov / (this.rayCount - 1) : 0;
        const mask = LAYERS.WALLS | LAYERS.FOOD | LAYERS.HAZARDS | LAYERS.AGENTS;

        for (let i = 0; i < this.rayCount; i++) {
            const rayAngle = startAngle + i * angleStep;
            const dirX = Math.cos(rayAngle);
            const dirY = Math.sin(rayAngle);

            const hit = spatialGrid.castRay(this.x, this.y, dirX, dirY, this.rayMaxDist, mask);
            if (hit.hit && hit.entity && hit.entity.id !== this.id) {
                const distRatio = hit.distance / this.rayMaxDist;
                this.raycastOutputs[i] = distRatio;
                const proximity = 1.0 - distRatio;

                if (hit.entity._gridLayer === LAYERS.FOOD) {
                    this.detectedTypes[i] = 1.0;
                    this.compositeSensors[i] = proximity; // Positive signal for food
                } else if (hit.entity._gridLayer === LAYERS.HAZARDS) {
                    this.detectedTypes[i] = -1.0;
                    this.compositeSensors[i] = -proximity; // Negative signal for hazards
                } else if (hit.entity._gridLayer === LAYERS.WALLS) {
                    this.detectedTypes[i] = 0.0;
                    this.compositeSensors[i] = -proximity * 0.6; // Negative signal for walls
                } else {
                    this.detectedTypes[i] = 0.5; // Other agents
                    this.compositeSensors[i] = this.type === 'predator' ? proximity : -proximity * 0.3;
                }
            } else {
                this.raycastOutputs[i] = 1.0;
                this.detectedTypes[i] = 0.0;
                this.compositeSensors[i] = 0.0;
            }
        }
    }

    update(spatialGrid, dt = 1/60) {
        if (!this.alive) return;

        // 1. Sensory perception
        if (spatialGrid) {
            this.castSensors(spatialGrid);
        }

        // 2. Compute motion metrics
        const forwardSpeed = (this.vx * Math.cos(this.angle) + this.vy * Math.sin(this.angle)) / this.maxSpeed;
        const normalizedAngularVel = Math.max(-1, Math.min(1, this.angularVelocity / this.maxTorque));
        const normalizedEnergy = this.energy / this.maxEnergy;

        // 3. Neural feedforward
        const inputs = [
            ...this.compositeSensors, // 5 sensory signals with sign (+food, -hazard/wall, 0 empty)
            forwardSpeed,             // 6: Forward velocity [-1, 1]
            normalizedAngularVel,     // 7: Angular rate [-1, 1]
            normalizedEnergy          // 8: Energy level [0, 1]
        ];

        const outputs = this.brain ? this.brain.predict(inputs) : [0.5, 0];
        const rawThrust = outputs[0] !== undefined ? outputs[0] : 0.5;
        const steerTorque = outputs[1] !== undefined ? outputs[1] : 0;

        // Map thrust: [-1, 1] -> [-0.2, 1.0] with forward exploration bias
        const forwardThrust = (rawThrust + 0.3) * 0.8;

        // 4. Apply physics
        this.angularVelocity += steerTorque * this.maxTorque;
        this.angularVelocity *= this.angularDrag;
        this.angle += this.angularVelocity;

        const forceMagnitude = Math.max(-0.2, Math.min(1.0, forwardThrust)) * this.maxForce;
        this.vx += Math.cos(this.angle) * forceMagnitude;
        this.vy += Math.sin(this.angle) * forceMagnitude;

        this.vx *= this.drag;
        this.vy *= this.drag;

        this.x += this.vx;
        this.y += this.vy;

        // Keep inside arena boundaries
        const pad = this.radius + 12;
        if (this.x < pad) { this.x = pad; this.vx = Math.abs(this.vx) * 0.4; }
        if (this.x > 800 - pad) { this.x = 800 - pad; this.vx = -Math.abs(this.vx) * 0.4; }
        if (this.y < pad) { this.y = pad; this.vy = Math.abs(this.vy) * 0.4; }
        if (this.y > 560 - pad) { this.y = 560 - pad; this.vy = -Math.abs(this.vy) * 0.4; }

        // 5. Energy metabolism
        const moveCost = (Math.abs(forceMagnitude) + Math.abs(steerTorque)) * 0.04;
        this.energy -= (0.04 + moveCost);

        if (this.energy <= 0) {
            this.energy = 0;
            this.alive = false;
        }
    }
}
