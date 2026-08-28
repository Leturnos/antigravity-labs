/**
 * Aether Vision Sandbox - Gesture Arcade Experience Mode
 * 
 * Provides high-energy gesture minigames:
 * 1. Air Deflect (Cyber Pong):
 *    - Physics-based cyber ball bounce off arena walls and player palm paddle.
 *    - Hand deflection physics calculating impact angle and momentum.
 *    - Floating bonus targets, combo multipliers, lives system, and retro synth hits.
 * 2. Particle Slash (Cyber Blade):
 *    - Trajectory laser blade created by high-speed index fingertip movement.
 *    - Line segment-to-circle mathematical collision detection for precise slicing.
 *    - Dynamic orb spawning, bomb hazard avoidance, combos, and particle explosion bursts.
 */

import { synthEngine } from '../audio/synth_engine.js';
import { appState } from '../core/state.js';
import { THEME_COLORS } from '../ui/renderer.js';

export class ArcadeMode {
    /**
     * @param {Object} [options={}] - Mode configuration options
     * @param {import('../audio/synth_engine.js').SynthEngine} [options.synth] - Web Audio synthesizer engine
     * @param {import('../core/state.js').StateManager} [options.state] - State manager instance
     * @param {import('../ui/renderer.js').CanvasRenderer} [options.renderer] - Canvas overlay renderer
     * @param {import('../ui/hud.js').HudManager} [options.hud] - HUD telemetry manager
     * @param {'deflect'|'slice'} [options.subMode='deflect'] - Active arcade minigame
     * @param {number} [options.width=1280] - Arena width
     * @param {number} [options.height=720] - Arena height
     */
    constructor(options = {}) {
        this.synth = options.synth || synthEngine;
        this.state = options.state || appState;
        this.renderer = options.renderer || null;
        this.hud = options.hud || null;

        this.isActive = false;
        this.subMode = options.subMode || (this.state ? this.state.get('arcadeMode', 'deflect') : 'deflect');
        this.width = options.width || 1280;
        this.height = options.height || 720;

        // Gameplay Metrics
        this.score = 0;
        this.combo = 0;
        this.multiplier = 1;
        this.highScore = 0;
        this.lives = 3;
        this.isGameOver = false;

        // Deflect Mode (Cyber Pong) state
        this.ball = {
            x: this.width / 2,
            y: this.height / 3,
            vx: 320,
            vy: 280,
            radius: 14,
            baseSpeed: 420,
            color: THEME_COLORS.leftHand,
            trail: []
        };

        this.paddle = {
            x: this.width / 2,
            y: this.height * 0.85,
            width: 130,
            height: 22,
            prevX: this.width / 2,
            prevY: this.height * 0.85,
            vx: 0,
            color: THEME_COLORS.rightHand
        };

        /** @type {Array<Object>} */
        this.deflectTargets = [];

        // Slice Mode (Particle Slash) state
        /** @type {Array<Object>} */
        this.sliceTargets = [];
        /** @type {Array<{ x: number, y: number, age: number, handedness?: string }>} */
        this.bladeTrail = [];
        this.sliceSpawnTimer = 0;
        this.sliceSpawnInterval = 1.2;

        this.targetIdCounter = 0;
        this.lastTrackedHands = [];

        this.resetGame();
    }

    /**
     * Line segment to circle intersection detection helper.
     * Computes distance from circle center to closest point on segment p1-p2.
     * 
     * @param {{x: number, y: number}} p1 - Segment start point
     * @param {{x: number, y: number}} p2 - Segment end point
     * @param {{x: number, y: number, radius: number}} circle - Target circle
     * @returns {{ hit: boolean, distance: number, point: { x: number, y: number } }}
     */
    static checkSegmentCircleIntersection(p1, p2, circle) {
        if (!p1 || !p2 || !circle) {
            return { hit: false, distance: 9999, point: { x: 0, y: 0 } };
        }

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lenSq = dx * dx + dy * dy;

        let t = 0;
        if (lenSq > 0.0001) {
            t = ((circle.x - p1.x) * dx + (circle.y - p1.y) * dy) / lenSq;
            t = Math.max(0, Math.min(1, t));
        }

        const closestX = p1.x + t * dx;
        const closestY = p1.y + t * dy;

        const distSq = (circle.x - closestX) * (circle.x - closestX) + (circle.y - closestY) * (circle.y - closestY);
        const radiusSq = circle.radius * circle.radius;
        const distance = Math.sqrt(distSq);

        return {
            hit: distSq <= radiusSq,
            distance,
            point: { x: closestX, y: closestY }
        };
    }

    /**
     * Circle to circle intersection check.
     * @param {{x: number, y: number, radius: number}} c1 
     * @param {{x: number, y: number, radius: number}} c2 
     * @returns {boolean}
     */
    static checkCircleCircleIntersection(c1, c2) {
        if (!c1 || !c2) return false;
        const dx = c1.x - c2.x;
        const dy = c1.y - c2.y;
        const radSum = c1.radius + c2.radius;
        return (dx * dx + dy * dy) <= (radSum * radSum);
    }

    /**
     * Circle to oriented rectangle intersection check.
     * @param {{x: number, y: number, radius: number}} circle 
     * @param {{x: number, y: number, width: number, height: number}} rect 
     * @returns {boolean}
     */
    static checkCircleRectIntersection(circle, rect) {
        if (!circle || !rect) return false;
        const halfW = rect.width / 2;
        const halfH = rect.height / 2;

        const distX = Math.abs(circle.x - rect.x);
        const distY = Math.abs(circle.y - rect.y);

        if (distX > (halfW + circle.radius)) return false;
        if (distY > (halfH + circle.radius)) return false;

        if (distX <= halfW) return true;
        if (distY <= halfH) return true;

        const cornerDistSq = (distX - halfW) * (distX - halfW) + (distY - halfH) * (distY - halfH);
        return cornerDistSq <= (circle.radius * circle.radius);
    }

    /**
     * Activates Arcade minigame mode.
     * @param {'deflect'|'slice'} [subMode] 
     */
    activate(subMode = null) {
        this.isActive = true;
        if (subMode && (subMode === 'deflect' || subMode === 'slice')) {
            this.subMode = subMode;
        }

        if (this.state) {
            this.state.set('activeMode', 'arcade');
            this.state.set('arcadeMode', this.subMode);
        }

        if (this.hud) {
            this.hud.setActiveMode('arcade');
            this.hud.updateArcade({
                score: this.score,
                combo: this.combo,
                multiplier: this.multiplier,
                highScore: this.highScore,
                lives: this.lives
            });
        }
    }

    /**
     * Deactivates Arcade minigame mode.
     */
    deactivate() {
        this.isActive = false;
        this.bladeTrail = [];
    }

    /**
     * Switches minigame sub-mode ('deflect' | 'slice').
     * @param {'deflect'|'slice'} subMode 
     */
    setSubMode(subMode) {
        if (subMode === 'deflect' || subMode === 'slice') {
            this.subMode = subMode;
            this.resetGame();
            if (this.state) {
                this.state.set('arcadeMode', subMode);
            }
        }
    }

    /**
     * Resets current minigame state.
     */
    resetGame() {
        this.score = 0;
        this.combo = 0;
        this.multiplier = 1;
        this.lives = 3;
        this.isGameOver = false;

        this.bladeTrail = [];
        this.sliceTargets = [];
        this.sliceSpawnTimer = 0;

        this.resetBall();
        this.initDeflectTargets();

        if (this.subMode === 'slice') {
            // Spawn initial starter targets
            for (let i = 0; i < 3; i++) {
                this.spawnTarget({
                    x: this.width * (0.25 + i * 0.25),
                    y: this.height * 0.4 + (Math.random() - 0.5) * 80
                });
            }
        }

        if (this.hud) {
            this.hud.updateArcade({
                score: this.score,
                combo: this.combo,
                multiplier: this.multiplier,
                highScore: this.highScore,
                lives: this.lives
            });
        }
    }

    /**
     * Resets the cyber pong ball to launch position with randomized upward velocity.
     * @private
     */
    resetBall() {
        this.ball.x = this.width / 2;
        this.ball.y = this.height * 0.35;
        const angle = (Math.PI / 4) + Math.random() * (Math.PI / 2); // 45 to 135 deg downwards
        const speed = this.ball.baseSpeed;
        this.ball.vx = Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1);
        this.ball.vy = Math.abs(Math.sin(angle) * speed);
        this.ball.trail = [];
    }

    /**
     * Initializes floating bonus targets for Deflect mode.
     * @private
     */
    initDeflectTargets() {
        this.deflectTargets = [];
        const cols = 5;
        const spacingX = this.width / (cols + 1);
        const colors = [THEME_COLORS.accentGreen, THEME_COLORS.accentPurple, THEME_COLORS.accentGold, THEME_COLORS.leftHand, THEME_COLORS.rightHand];

        for (let i = 0; i < cols; i++) {
            this.deflectTargets.push({
                id: ++this.targetIdCounter,
                x: spacingX * (i + 1),
                y: this.height * 0.15 + (i % 2) * 45,
                radius: 26,
                points: 150,
                color: colors[i % colors.length],
                active: true,
                pulse: Math.random() * Math.PI * 2
            });
        }
    }

    /**
     * Spawns an arcade target orb for Particle Slash or Deflect modes.
     * 
     * @param {Object} [options={}] - Custom spawn options
     * @returns {Object} Spawned target
     */
    spawnTarget(options = {}) {
        const isBomb = options.type === 'bomb' || (Math.random() < 0.15 && !options.type);
        const isBonus = options.type === 'bonus' || (Math.random() < 0.20 && !isBomb);

        const target = {
            id: ++this.targetIdCounter,
            x: options.x ?? (this.width * (0.15 + Math.random() * 0.7)),
            y: options.y ?? (this.height + 40),
            vx: options.vx ?? ((Math.random() - 0.5) * 140),
            vy: options.vy ?? (-(380 + Math.random() * 200)),
            radius: options.radius ?? (isBomb ? 32 : (isBonus ? 24 : 30)),
            points: options.points ?? (isBomb ? -200 : (isBonus ? 300 : 100)),
            type: isBomb ? 'bomb' : (isBonus ? 'bonus' : 'orb'),
            color: isBomb ? THEME_COLORS.accentRed : (isBonus ? THEME_COLORS.accentGold : THEME_COLORS.accentGreen),
            sliced: false,
            active: true,
            pulse: 0
        };

        if (this.subMode === 'slice') {
            this.sliceTargets.push(target);
        } else {
            this.deflectTargets.push(target);
        }

        return target;
    }

    /**
     * Main update routine dispatching to active minigame sub-mode.
     * 
     * @param {Object} trackingResults - Output from HandTracker
     * @param {number} [dt=0.016] - Delta time in seconds
     * @returns {Object} Game telemetry snapshot
     */
    update(trackingResults, dt = 0.016) {
        if (!this.isActive) {
            return this.getState();
        }

        const clampedDt = Math.max(0.001, Math.min(0.1, dt));
        this.lastTrackedHands = trackingResults?.hands || [];

        // Check for restart gesture on Game Over (e.g. Open Palm or Peace)
        if (this.isGameOver) {
            const hasRestartGesture = this.lastTrackedHands.some(h => 
                h.gesture?.name === 'open_palm' || h.gesture?.name === 'peace' || h.gesture?.name === 'thumbs_up'
            );
            if (hasRestartGesture) {
                this.resetGame();
            }
            return this.getState();
        }

        if (this.subMode === 'deflect') {
            this.updateDeflect(trackingResults, clampedDt);
        } else if (this.subMode === 'slice') {
            this.updateSlice(trackingResults, clampedDt);
        }

        // Update multiplier based on current combo
        this.multiplier = Math.min(10, 1 + Math.floor(this.combo / 5));

        // High score tracking
        if (this.score > this.highScore) {
            this.highScore = this.score;
        }

        // Update HUD & State Store
        if (this.hud) {
            this.hud.updateArcade({
                score: this.score,
                combo: this.combo,
                multiplier: this.multiplier,
                highScore: this.highScore,
                lives: this.lives
            });
            this.hud.updateTelemetry({
                handsCount: this.lastTrackedHands.length,
                activeMode: 'arcade'
            });
        }

        if (this.state) {
            this.state.update({
                arcadeScore: this.score,
                arcadeCombo: this.combo,
                arcadeLives: this.lives,
                arcadeGameOver: this.isGameOver,
                arcadeHighScore: this.highScore
            });
        }

        return this.getState();
    }

    /**
     * Updates Air Deflect (Cyber Pong) physics, wall reflections, paddle collision, and scoring.
     * 
     * @param {Object} trackingResults 
     * @param {number} [dt=0.016] 
     */
    updateDeflect(trackingResults, dt = 0.016) {
        const hands = trackingResults?.hands || [];
        const primaryHand = hands[0] || null;

        // 1. Update Hand Paddle Position & Velocity
        if (primaryHand) {
            const palm = primaryHand.palmCenter || (primaryHand.landmarks ? primaryHand.landmarks[9] : { x: 0.5, y: 0.85 });
            const targetX = (palm.x ?? 0.5) * this.width;
            const targetY = (palm.y ?? 0.85) * this.height;

            this.paddle.prevX = this.paddle.x;
            this.paddle.prevY = this.paddle.y;
            this.paddle.x += (targetX - this.paddle.x) * 0.65;
            this.paddle.y += (targetY - this.paddle.y) * 0.65;
            this.paddle.vx = (this.paddle.x - this.paddle.prevX) / dt;
        }

        // 2. Update Ball Motion & Trail
        this.ball.x += this.ball.vx * dt;
        this.ball.y += this.ball.vy * dt;

        this.ball.trail.push({ x: this.ball.x, y: this.ball.y });
        if (this.ball.trail.length > 8) {
            this.ball.trail.shift();
        }

        // 3. Wall Collisions (Left, Right, Top)
        if (this.ball.x - this.ball.radius <= 0) {
            this.ball.x = this.ball.radius;
            this.ball.vx = Math.abs(this.ball.vx);
            if (this.renderer) {
                this.renderer.emitParticles(this.ball.x, this.ball.y, 6, { color: THEME_COLORS.leftHand });
            }
        } else if (this.ball.x + this.ball.radius >= this.width) {
            this.ball.x = this.width - this.ball.radius;
            this.ball.vx = -Math.abs(this.ball.vx);
            if (this.renderer) {
                this.renderer.emitParticles(this.ball.x, this.ball.y, 6, { color: THEME_COLORS.leftHand });
            }
        }

        if (this.ball.y - this.ball.radius <= 0) {
            this.ball.y = this.ball.radius;
            this.ball.vy = Math.abs(this.ball.vy);
            if (this.renderer) {
                this.renderer.emitParticles(this.ball.x, this.ball.y, 6, { color: THEME_COLORS.leftHand });
            }
        }

        // 4. Paddle Deflection Collision
        if (this.ball.vy > 0 && ArcadeMode.checkCircleRectIntersection(this.ball, this.paddle)) {
            // Deflect ball upwards
            this.ball.y = this.paddle.y - this.paddle.height / 2 - this.ball.radius;
            
            // Calculate rebound angle based on impact offset from paddle center + hand movement velocity
            const hitOffset = (this.ball.x - this.paddle.x) / (this.paddle.width / 2); // [-1 to 1]
            const angle = (-Math.PI / 2) + hitOffset * (Math.PI / 3.5); // Spread upwards
            const currentSpeed = Math.min(750, Math.sqrt(this.ball.vx * this.ball.vx + this.ball.vy * this.ball.vy) * 1.04);

            this.ball.vx = Math.cos(angle) * currentSpeed + this.paddle.vx * 0.15;
            this.ball.vy = Math.sin(angle) * currentSpeed;

            // Score & Combo Update
            this.combo++;
            this.multiplier = Math.min(10, 1 + Math.floor(this.combo / 5));
            this.score += 100 * this.multiplier;

            if (this.synth) {
                this.synth.playArcadeHit('deflect');
                if (this.combo > 0 && this.combo % 5 === 0) {
                    this.synth.playArcadeHit('combo');
                }
            }

            if (this.renderer) {
                this.renderer.emitParticles(this.ball.x, this.ball.y, 16, {
                    color: THEME_COLORS.accentGreen,
                    speed: 5.5,
                    spread: Math.PI
                });
            }
        }

        // 5. Bonus Target Collisions
        for (const target of this.deflectTargets) {
            if (target.active) {
                target.pulse = (target.pulse + dt * 3) % (Math.PI * 2);
                if (ArcadeMode.checkCircleCircleIntersection(this.ball, target)) {
                    target.active = false;
                    this.score += target.points * this.multiplier;

                    if (this.synth) {
                        this.synth.playArcadeHit('score');
                    }

                    if (this.renderer) {
                        this.renderer.emitParticles(target.x, target.y, 22, {
                            color: target.color,
                            speed: 6.0
                        });
                    }
                }
            }
        }

        // Respawn targets if all are cleared
        if (this.deflectTargets.every(t => !t.active)) {
            this.initDeflectTargets();
            this.score += 500 * this.multiplier;
            if (this.synth) {
                this.synth.playArcadeHit('combo');
            }
        }

        // 6. Bottom Edge Miss (Lose Life)
        if (this.ball.y - this.ball.radius > this.height) {
            this.lives--;
            this.combo = 0;
            this.multiplier = 1;

            if (this.lives <= 0) {
                this.isGameOver = true;
                if (this.synth) {
                    this.synth.playArcadeHit('game_over');
                }
            } else {
                if (this.synth) {
                    this.synth.playArcadeHit('laser');
                }
                this.resetBall();
            }
        }
    }

    /**
     * Updates Particle Slash (Cyber Blade) trajectory trails, target physics, slicing, and combos.
     * 
     * @param {Object} trackingResults 
     * @param {number} [dt=0.016] 
     */
    updateSlice(trackingResults, dt = 0.016) {
        const hands = trackingResults?.hands || [];

        // 1. Record Blade Trajectory Points from active fingertips
        for (const hand of hands) {
            const tip = hand.landmarks ? hand.landmarks[8] : hand.palmCenter;
            if (tip) {
                const px = (tip.x ?? 0.5) * this.width;
                const py = (tip.y ?? 0.5) * this.height;

                this.bladeTrail.push({
                    x: px,
                    y: py,
                    age: 0,
                    handedness: hand.handedness
                });
            }
        }

        // 2. Age and Prune Blade Trail Points
        for (let i = 0; i < this.bladeTrail.length; i++) {
            this.bladeTrail[i].age += dt;
        }
        this.bladeTrail = this.bladeTrail.filter(pt => pt.age < 0.22);

        // 3. Spawn floating targets periodically
        this.sliceSpawnTimer += dt;
        if (this.sliceSpawnTimer >= this.sliceSpawnInterval && this.sliceTargets.length < 8) {
            this.sliceSpawnTimer = 0;
            this.spawnTarget();
        }

        // 4. Update Target Physics & Gravity
        const remainingTargets = [];
        for (const target of this.sliceTargets) {
            target.x += target.vx * dt;
            target.y += target.vy * dt;
            target.vy += 120 * dt; // Gravity arc
            target.pulse = (target.pulse + dt * 4) % (Math.PI * 2);

            // 5. Slicing Collision Detection
            if (!target.sliced && this.bladeTrail.length >= 2) {
                for (let i = 0; i < this.bladeTrail.length - 1; i++) {
                    const p1 = this.bladeTrail[i];
                    const p2 = this.bladeTrail[i + 1];

                    const intersection = ArcadeMode.checkSegmentCircleIntersection(p1, p2, target);
                    if (intersection.hit) {
                        target.sliced = true;

                        if (target.type === 'bomb') {
                            // Bomb Hit!
                            this.lives--;
                            this.combo = 0;
                            this.multiplier = 1;
                            this.score = Math.max(0, this.score + target.points);

                            if (this.synth) {
                                this.synth.playArcadeHit('game_over');
                            }
                            if (this.renderer) {
                                this.renderer.emitParticles(target.x, target.y, 35, {
                                    color: THEME_COLORS.accentRed,
                                    speed: 8.0,
                                    size: 5
                                });
                            }

                            if (this.lives <= 0) {
                                this.isGameOver = true;
                            }
                        } else {
                            // Successful Slice!
                            this.combo++;
                            this.multiplier = Math.min(10, 1 + Math.floor(this.combo / 5));
                            this.score += target.points * this.multiplier;

                            if (this.synth) {
                                this.synth.playArcadeHit('slice');
                                if (this.combo > 0 && this.combo % 5 === 0) {
                                    this.synth.playArcadeHit('combo');
                                }
                            }

                            if (this.renderer) {
                                this.renderer.emitParticles(target.x, target.y, 25, {
                                    color: target.color,
                                    speed: 6.5,
                                    size: 4
                                });
                            }
                        }
                        break;
                    }
                }
            }

            // Target out of screen bounds check
            if (target.y - target.radius > this.height + 60) {
                // If an unsliced regular target fell off screen, combo drops
                if (!target.sliced && target.type !== 'bomb') {
                    this.combo = 0;
                    this.multiplier = 1;
                }
            } else if (!target.sliced) {
                remainingTargets.push(target);
            }
        }

        this.sliceTargets = remainingTargets;
    }

    /**
     * Renders minigame arena, balls, targets, laser blades, and scoreboard.
     * @param {import('../ui/renderer.js').CanvasRenderer} [renderer=this.renderer]
     */
    render(renderer = this.renderer) {
        if (!renderer || !this.isActive) return;

        // 1. Draw Hand Skeletons
        for (const hand of this.lastTrackedHands) {
            renderer.drawHandSkeleton(hand, {
                color: hand.handedness === 'Left' ? THEME_COLORS.leftHand : THEME_COLORS.rightHand,
                showGestureBadge: true
            });
        }

        // 2. Render Deflect Mode Arena
        if (this.subMode === 'deflect') {
            // Draw Deflect Targets
            for (const target of this.deflectTargets) {
                if (target.active) {
                    renderer.drawTarget(target);
                }
            }

            // Draw Hand Paddle Glow
            if (renderer.ctx && typeof renderer.ctx.save === 'function') {
                renderer.ctx.save();
                renderer.ctx.fillStyle = this.paddle.color;
                renderer.ctx.shadowColor = this.paddle.color;
                renderer.ctx.shadowBlur = 15;
                if (typeof renderer.ctx.fillRect === 'function') {
                    renderer.ctx.fillRect(
                        this.paddle.x - this.paddle.width / 2,
                        this.paddle.y - this.paddle.height / 2,
                        this.paddle.width,
                        this.paddle.height
                    );
                }
                renderer.ctx.restore();
            }

            // Draw Ball & Ball Trail
            for (let i = 0; i < this.ball.trail.length; i++) {
                const pt = this.ball.trail[i];
                const alpha = (i + 1) / this.ball.trail.length;
                renderer.drawGlowCircle(pt.x, pt.y, this.ball.radius * 0.7 * alpha, this.ball.color, 8);
            }
            renderer.drawGlowCircle(this.ball.x, this.ball.y, this.ball.radius, '#ffffff', 16);
        }

        // 3. Render Slice Mode Arena
        if (this.subMode === 'slice') {
            // Draw Blade Trail
            renderer.drawSliceBlade(this.bladeTrail, THEME_COLORS.leftHand);

            // Draw Floating Targets
            for (const target of this.sliceTargets) {
                renderer.drawTarget(target);
            }
        }

        // 4. Update & Render Particles
        renderer.updateParticles(0.016);
        renderer.renderParticles();

        // 5. Game Over Banner
        if (this.isGameOver && renderer.ctx) {
            if (typeof renderer.ctx.save === 'function') renderer.ctx.save();
            renderer.ctx.fillStyle = 'rgba(6, 9, 17, 0.85)';
            if (typeof renderer.ctx.fillRect === 'function') {
                renderer.ctx.fillRect(0, 0, this.width, this.height);
            }

            renderer.ctx.font = '700 48px "JetBrains Mono", monospace';
            renderer.ctx.fillStyle = THEME_COLORS.accentRed;
            renderer.ctx.textAlign = 'center';
            renderer.ctx.shadowColor = THEME_COLORS.accentRed;
            renderer.ctx.shadowBlur = 20;
            if (typeof renderer.ctx.fillText === 'function') {
                renderer.ctx.fillText('GAME OVER', this.width / 2, this.height / 2 - 20);
            }

            renderer.ctx.font = '600 20px "JetBrains Mono", monospace';
            renderer.ctx.fillStyle = '#ffffff';
            renderer.ctx.shadowBlur = 0;
            if (typeof renderer.ctx.fillText === 'function') {
                renderer.ctx.fillText(`Final Score: ${this.score}  |  High Score: ${this.highScore}`, this.width / 2, this.height / 2 + 30);
                renderer.ctx.fillText('Show OPEN PALM to Play Again', this.width / 2, this.height / 2 + 70);
            }
            if (typeof renderer.ctx.restore === 'function') renderer.ctx.restore();
        }
    }

    /**
     * Returns current arcade game telemetry state.
     * @returns {Object}
     */
    getState() {
        return {
            isActive: this.isActive,
            subMode: this.subMode,
            score: this.score,
            combo: this.combo,
            multiplier: this.multiplier,
            highScore: this.highScore,
            lives: this.lives,
            isGameOver: this.isGameOver,
            targetsCount: this.subMode === 'slice' ? this.sliceTargets.length : this.deflectTargets.filter(t => t.active).length,
            ballPosition: { x: Math.round(this.ball.x), y: Math.round(this.ball.y) },
            paddlePosition: { x: Math.round(this.paddle.x), y: Math.round(this.paddle.y) }
        };
    }

    /**
     * Cleans up mode resources.
     */
    destroy() {
        this.deactivate();
        this.synth = null;
        this.state = null;
        this.renderer = null;
        this.hud = null;
        this.deflectTargets = [];
        this.sliceTargets = [];
        this.bladeTrail = [];
    }
}
