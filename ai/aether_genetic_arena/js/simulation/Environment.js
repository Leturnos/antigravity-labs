import { LAYERS } from '../core/SpatialGrid.js';

export class Environment {
    constructor(width = 800, height = 600) {
        this.width = width;
        this.height = height;
        this.food = [];
        this.hazards = [];
        this.walls = [];
        this._initBounds();
    }

    _initBounds() {
        const thickness = 10;
        this.walls = [
            { id: 'bound_top', x: this.width / 2, y: thickness / 2, width: this.width, height: thickness, radius: 10 },
            { id: 'bound_bot', x: this.width / 2, y: this.height - thickness / 2, width: this.width, height: thickness, radius: 10 },
            { id: 'bound_left', x: thickness / 2, y: this.height / 2, width: thickness, height: this.height, radius: 10 },
            { id: 'bound_right', x: this.width - thickness / 2, y: this.height / 2, width: thickness, height: this.height, radius: 10 }
        ];
    }

    populateForaging(foodCount = 40, hazardCount = 12) {
        this.food = [];
        this.hazards = [];
        const padding = 30;

        for (let i = 0; i < foodCount; i++) {
            this.food.push({
                id: `f_${i}`,
                x: padding + Math.random() * (this.width - padding * 2),
                y: padding + Math.random() * (this.height - padding * 2),
                radius: 4,
                energyValue: 30
            });
        }

        for (let i = 0; i < hazardCount; i++) {
            this.hazards.push({
                id: `h_${i}`,
                x: padding + Math.random() * (this.width - padding * 2),
                y: padding + Math.random() * (this.height - padding * 2),
                radius: 9,
                damageValue: 45
            });
        }
    }

    registerInGrid(spatialGrid) {
        if (!spatialGrid) return;
        spatialGrid.clearAll();
        for (const w of this.walls) spatialGrid.insert(w, LAYERS.WALLS);
        for (const f of this.food) spatialGrid.insert(f, LAYERS.FOOD);
        for (const h of this.hazards) spatialGrid.insert(h, LAYERS.HAZARDS);
    }
}
