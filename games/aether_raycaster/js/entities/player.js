export class Player {
  constructor(x = 2.5, y = 2.5) {
    this.x = x;
    this.y = y;
    this.hp = 100;
    this.maxHp = 100;
    this.shield = 50;
    this.maxShield = 50;
    this.ammo = 50;
    this.maxAmmo = 100;
    this.hasKey = false;
    this.score = 0;
    this.multiplier = 1;
    this.streakTimer = 0;
    this.overchargeTimer = 0;
    this.shieldRegenDelay = 0;
  }

  takeDamage(amount) {
    this.shieldRegenDelay = 4.0; // 4s cooldown before shield recovers
    if (this.shield > 0) {
      if (this.shield >= amount) {
        this.shield -= amount;
        amount = 0;
      } else {
        amount -= this.shield;
        this.shield = 0;
      }
    }
    this.hp = Math.max(0, this.hp - amount);
    return this.hp <= 0;
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  addAmmo(amount) {
    this.ammo = Math.min(this.maxAmmo, this.ammo + amount);
  }

  addScore(points) {
    this.score += points * this.multiplier;
    this.streakTimer = 3.0;
    this.multiplier = Math.min(5, this.multiplier + 1);
  }

  update(dt) {
    if (this.overchargeTimer > 0) {
      this.overchargeTimer -= dt;
    }
    if (this.streakTimer > 0) {
      this.streakTimer -= dt;
      if (this.streakTimer <= 0) {
        this.multiplier = 1;
      }
    }
    if (this.shieldRegenDelay > 0) {
      this.shieldRegenDelay -= dt;
      if (this.shieldRegenDelay < 0) {
        const remainingDt = -this.shieldRegenDelay;
        if (this.shield < this.maxShield) {
          this.shield = Math.min(this.maxShield, this.shield + 15 * remainingDt);
        }
        this.shieldRegenDelay = 0;
      }
    } else if (this.shield < this.maxShield) {
      this.shield = Math.min(this.maxShield, this.shield + 15 * dt);
    }
  }

  canShoot() {
    return this.overchargeTimer > 0 || this.ammo > 0;
  }

  consumeAmmo() {
    if (this.overchargeTimer <= 0) {
      this.ammo = Math.max(0, this.ammo - 1);
    }
  }
}
