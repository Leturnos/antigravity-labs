/**
 * Layer bitmasks for spatial entity filtering
 */
export const LAYERS = {
    WALLS: 1 << 0,   // 1
    FOOD: 1 << 1,    // 2
    HAZARDS: 1 << 2, // 4
    AGENTS: 1 << 3,  // 8
    ALL: 0xFFFF
};

export class SpatialGrid {
    constructor(width = 800, height = 600, cellSize = 64) {
        this.width = width;
        this.height = height;
        this.cellSize = cellSize;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        this.buckets = new Map(); // key -> Map<layer, Set<entity>>
    }

    _getKey(col, row) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return null;
        return `${col},${row}`;
    }

    _getBucket(key) {
        if (!this.buckets.has(key)) {
            this.buckets.set(key, new Map());
        }
        return this.buckets.get(key);
    }

    _getLayerSet(bucket, layer) {
        if (!bucket.has(layer)) {
            bucket.set(layer, new Set());
        }
        return bucket.get(layer);
    }

    insert(entity, layer) {
        const col = Math.floor(entity.x / this.cellSize);
        const row = Math.floor(entity.y / this.cellSize);
        const key = this._getKey(col, row);
        if (!key) return;

        const bucket = this._getBucket(key);
        const layerSet = this._getLayerSet(bucket, layer);
        layerSet.add(entity);
        entity._gridKey = key;
        entity._gridLayer = layer;
    }

    remove(entity, layer = entity._gridLayer) {
        if (!entity._gridKey) return;
        const bucket = this.buckets.get(entity._gridKey);
        if (bucket && bucket.has(layer)) {
            bucket.get(layer).delete(entity);
        }
        entity._gridKey = null;
    }

    clearLayer(layer) {
        for (const bucket of this.buckets.values()) {
            if (bucket.has(layer)) {
                bucket.get(layer).clear();
            }
        }
    }

    clearAll() {
        this.buckets.clear();
    }

    queryRadius(x, y, radius, layerMask = LAYERS.ALL) {
        const results = [];
        const minCol = Math.max(0, Math.floor((x - radius) / this.cellSize));
        const maxCol = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize));
        const minRow = Math.max(0, Math.floor((y - radius) / this.cellSize));
        const maxRow = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize));

        for (let c = minCol; c <= maxCol; c++) {
            for (let r = minRow; r <= maxRow; r++) {
                const key = `${c},${r}`;
                const bucket = this.buckets.get(key);
                if (!bucket) continue;

                for (const [layer, entities] of bucket.entries()) {
                    if ((layer & layerMask) === 0) continue;
                    for (const ent of entities) {
                        const dx = ent.x - x;
                        const dy = ent.y - y;
                        const distSq = dx * dx + dy * dy;
                        const totalR = radius + (ent.radius || 0);
                        if (distSq <= totalR * totalR) {
                            results.push(ent);
                        }
                    }
                }
            }
        }
        return results;
    }

    castRay(startX, startY, dirX, dirY, maxDist, layerMask = LAYERS.ALL) {
        const stepSize = this.cellSize * 0.5;
        const totalSteps = Math.ceil(maxDist / stepSize);
        let closestHit = { hit: false, distance: maxDist, point: null, entity: null };

        for (let i = 0; i <= totalSteps; i++) {
            const currentDist = Math.min(i * stepSize, maxDist);
            const cx = startX + dirX * currentDist;
            const cy = startY + dirY * currentDist;

            const col = Math.floor(cx / this.cellSize);
            const row = Math.floor(cy / this.cellSize);
            const key = this._getKey(col, row);
            if (!key) continue;

            const bucket = this.buckets.get(key);
            if (!bucket) continue;

            for (const [layer, entities] of bucket.entries()) {
                if ((layer & layerMask) === 0) continue;
                for (const ent of entities) {
                    const ex = ent.x;
                    const ey = ent.y;
                    const er = ent.radius || 5;

                    // Ray-circle intersection
                    const toCircleX = ex - startX;
                    const toCircleY = ey - startY;
                    const proj = toCircleX * dirX + toCircleY * dirY;
                    if (proj < 0 || proj > maxDist) continue;

                    const perpSq = (toCircleX * toCircleX + toCircleY * toCircleY) - (proj * proj);
                    if (perpSq <= er * er) {
                        const d = Math.max(0, proj - Math.sqrt(er * er - perpSq));
                        if (d < closestHit.distance) {
                            closestHit = {
                                hit: true,
                                distance: d,
                                point: { x: startX + dirX * d, y: startY + dirY * d },
                                entity: ent
                            };
                        }
                    }
                }
            }
            if (closestHit.hit && closestHit.distance <= currentDist) {
                break;
            }
        }
        return closestHit;
    }
}
