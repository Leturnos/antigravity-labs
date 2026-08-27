export class DoorManager {
  constructor(doorList = []) {
    this.doors = new Map();
    for (const d of doorList) {
      this.doors.set(`${d.x},${d.y}`, {
        x: d.x,
        y: d.y,
        type: d.type, // 4 = automatic, 5 = locked security
        openRatio: d.openRatio || 0.0,
        state: d.state || 'closed', // 'closed', 'opening', 'open', 'closing', 'locked'
        stayOpenTimer: 0,
        unlocked: d.type === 4,
      });
    }
  }

  getDoorRatio(x, y) {
    const door = this.doors.get(`${x},${y}`);
    return door ? door.openRatio : 0.0;
  }

  getDoorStates() {
    const states = {};
    for (const [key, door] of this.doors.entries()) {
      states[key] = door.openRatio;
    }
    return states;
  }

  tryUnlock(x, y, hasKey) {
    const door = this.doors.get(`${x},${y}`);
    if (door && door.type === 5 && !door.unlocked) {
      if (hasKey) {
        door.unlocked = true;
        door.state = 'opening';
        return { success: true, message: 'SECURITY OVERRIDE GRANTED' };
      }
      return { success: false, message: 'ACCESS DENIED: KEYCARD REQUIRED' };
    }
    return { success: true, message: '' };
  }

  update(dt, playerX, playerY, enemies = []) {
    const OPEN_SPEED = 2.5; // full open in 0.4s
    const CLOSE_SPEED = 1.5;
    const PROXIMITY_DIST = 2.2;

    for (const door of this.doors.values()) {
      if (door.type === 5 && !door.unlocked) {
        door.openRatio = 0.0;
        continue;
      }

      // Check distance to player
      const distPlayer = Math.hypot(door.x + 0.5 - playerX, door.y + 0.5 - playerY);
      let entityNearby = distPlayer < PROXIMITY_DIST;

      // Check distance to enemies
      if (!entityNearby) {
        for (const e of enemies) {
          if (e.alive && Math.hypot(door.x + 0.5 - e.x, door.y + 0.5 - e.y) < PROXIMITY_DIST) {
            entityNearby = true;
            break;
          }
        }
      }

      if (entityNearby) {
        door.state = 'opening';
        door.stayOpenTimer = 2.0; // Stay open for 2s after entity leaves
        door.openRatio = Math.min(1.0, door.openRatio + OPEN_SPEED * dt);
        if (door.openRatio >= 1.0) door.state = 'open';
      } else {
        if (door.openRatio > 0) {
          door.stayOpenTimer -= dt;
          if (door.stayOpenTimer <= 0) {
            door.state = 'closing';
            door.openRatio = Math.max(0.0, door.openRatio - CLOSE_SPEED * dt);
            if (door.openRatio <= 0.0) door.state = 'closed';
          }
        }
      }
    }
  }
}
