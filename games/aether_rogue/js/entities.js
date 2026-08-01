/**
 * Aether Rogue - Entities, Enemy AI Archetypes & Item Classes
 */

import { checkLineOfSight } from './fov.js';
import { findPathAStar } from './pathfinding.js';

export class Entity {
  constructor(x, y, name, symbol, color) {
    this.x = x;
    this.y = y;
    this.name = name;
    this.symbol = symbol;
    this.color = color;
    this.dead = false;
  }
}

export class Player extends Entity {
  constructor(x, y) {
    super(x, y, 'Cyber Rogue', '@', '#00f3ff');
    this.hp = 100;
    this.maxHp = 100;
    this.energy = 50;
    this.maxEnergy = 50;
    this.cyberChips = 0;
    this.nanites = 2;
    this.keycards = []; // Array of keycard colors e.g. ['RED']
    this.inventory = []; // Array of Item objects
    this.talents = new Set(); // Unlocked talent IDs
    this.dodgeChance = 0.05;
    this.stealthTurns = 0;
  }

  takeDamage(amount) {
    if (this.stealthTurns > 0) this.stealthTurns = 0; // Break stealth on damage
    if (Math.random() < this.dodgeChance) {
      return { damage: 0, dodged: true };
    }
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp === 0) this.dead = true;
    return { damage: amount, dodged: false };
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  restoreEnergy(amount) {
    this.energy = Math.min(this.maxEnergy, this.energy + amount);
  }
}

export class Enemy extends Entity {
  constructor(x, y, name, symbol, color, hp, attack, xpValue, chipValue) {
    super(x, y, name, symbol, color);
    this.hp = hp;
    this.maxHp = hp;
    this.attack = attack;
    this.xpValue = xpValue;
    this.chipValue = chipValue;
    this.state = 'PATROL'; // PATROL, HUNT, ATTACK
    this.stunTurns = 0;
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp === 0) this.dead = true;
  }

  updateAI(dungeon, player, logCallback) {
    if (this.dead) return;
    if (this.stunTurns > 0) {
      this.stunTurns--;
      logCallback(`${this.name} está atordoado por EMP!`, 'info');
      return;
    }

    // Ignore player if player is stealthed
    if (player.stealthTurns > 0) {
      this._patrolWander(dungeon);
      return;
    }

    const dist = Math.hypot(player.x - this.x, player.y - this.y);
    const hasLOS = checkLineOfSight(this.x, this.y, player.x, player.y, (x, y) => {
      const tile = dungeon.getTile(x, y);
      return !tile || tile.isOpaque();
    });

    if (dist <= 8 && hasLOS) {
      this.state = 'HUNT';
    }

    if (this.state === 'HUNT') {
      this.executeHuntTurn(dungeon, player, dist, hasLOS, logCallback);
    } else {
      this._patrolWander(dungeon);
    }
  }

  executeHuntTurn(dungeon, player, dist, hasLOS, logCallback) {
    // Default melee behavior: move towards player via A*
    if (dist <= 1.5) {
      // Melee attack
      const result = player.takeDamage(this.attack);
      if (result.dodged) {
        logCallback(`Você esquivou do ataque de ${this.name}!`, 'info');
      } else {
        logCallback(`${this.name} atacou você causando ${this.attack} de dano!`, 'combat');
      }
    } else {
      const path = findPathAStar(dungeon, { x: this.x, y: this.y }, { x: player.x, y: player.y });
      if (path.length > 0) {
        this.x = path[0].x;
        this.y = path[0].y;
      }
    }
  }

  _patrolWander(dungeon) {
    if (Math.random() < 0.5) return;
    const dirs = [
      { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }
    ];
    const d = dirs[Math.floor(Math.random() * dirs.length)];
    const nx = this.x + d.x;
    const ny = this.y + d.y;
    const tile = dungeon.getTile(nx, ny);
    if (tile && tile.isWalkable()) {
      this.x = nx;
      this.y = ny;
    }
  }
}

export class ScoutDrone extends Enemy {
  constructor(x, y) {
    super(x, y, 'Scout Drone', 'D', '#ff007f', 30, 8, 15, 2);
  }

  executeHuntTurn(dungeon, player, dist, hasLOS, logCallback) {
    if (dist <= 3 && hasLOS) {
      // Ranged laser attack
      const result = player.takeDamage(this.attack);
      if (result.dodged) {
        logCallback(`Você esquivou do feixe laser do Scout Drone!`, 'info');
      } else {
        logCallback(`Scout Drone disparou laser causando ${this.attack} de dano!`, 'combat');
      }
    } else {
      super.executeHuntTurn(dungeon, player, dist, hasLOS, logCallback);
    }
  }
}

export class CyberBeast extends Enemy {
  constructor(x, y) {
    super(x, y, 'Cyber-Beast', 'B', '#ff5500', 60, 15, 30, 4);
  }
}

export class SentryTurret extends Enemy {
  constructor(x, y) {
    super(x, y, 'Sentry Turret', 'T', '#ffd700', 45, 12, 25, 3);
  }

  executeHuntTurn(dungeon, player, dist, hasLOS, logCallback) {
    if (dist <= 7 && hasLOS) {
      const result = player.takeDamage(this.attack);
      if (result.dodged) {
        logCallback(`Você esquivou do tiro sniper da Sentry Turret!`, 'info');
      } else {
        logCallback(`Sentry Turret disparou tiro sniper causando ${this.attack} de dano!`, 'combat');
      }
    }
  }
}

export class BossArchon extends Enemy {
  constructor(x, y) {
    super(x, y, 'Aether Archon (BOSS)', 'A', '#9d4edd', 180, 25, 150, 20);
  }
}

export class Item {
  constructor(x, y, name, symbol, color, type) {
    this.x = x;
    this.y = y;
    this.name = name;
    this.symbol = symbol;
    this.color = color;
    this.type = type; // MEDKIT, NANITE, KEYCARD, CHIP, CHEST
  }
}
