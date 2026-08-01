/**
 * Aether Rogue - Active Cyberware Skills & Passive Talent Tree Manager
 */

export class CyberwareManager {
  constructor() {
    this.skills = [
      {
        id: 'dash',
        name: 'Overclock Dash (1)',
        desc: 'Avança 3 tiles em linha reta causando dano aos inimigos.',
        cost: 10,
        cdMax: 4,
        cdCurrent: 0,
        hotkey: '1'
      },
      {
        id: 'plasma',
        name: 'Plasma Burst (2)',
        desc: 'Explosão de plasma em área (3x3) que causa dano e repele inimigos.',
        cost: 15,
        cdMax: 5,
        cdCurrent: 0,
        hotkey: '2'
      },
      {
        id: 'emp',
        name: 'EMP Nova (3)',
        desc: 'Pulso eletromagnético que atordoa robôs em raio 4 por 3 turnos.',
        cost: 20,
        cdMax: 6,
        cdCurrent: 0,
        hotkey: '3'
      },
      {
        id: 'stealth',
        name: 'Stealth Cloak (4)',
        desc: 'Camuflagem óptica que torna o jogador invisível por 4 turnos.',
        cost: 15,
        cdMax: 8,
        cdCurrent: 0,
        hotkey: '4'
      },
      {
        id: 'nano',
        name: 'Nano Rebuild (5)',
        desc: 'Consome 1 Carga Nanite para restaurar 40% da vida máxima.',
        cost: 0,
        cdMax: 0,
        cdCurrent: 0,
        hotkey: '5'
      }
    ];

    this.talents = [
      {
        id: 'matrixDodge',
        name: 'Reflexos da Matrix',
        desc: 'Aumenta a chance de esquivar de ataques inimigos em +15%.',
        cost: 5,
        unlocked: false
      },
      {
        id: 'overcharge',
        name: 'Sobrecarga Plasma',
        desc: 'Aumenta o dano de todas as habilidades ativas em +25%.',
        cost: 8,
        unlocked: false
      },
      {
        id: 'vampiric',
        name: 'Nano-bots Vampíricos',
        desc: 'Regenera 5 de HP a cada inimigo derrotado.',
        cost: 10,
        unlocked: false
      },
      {
        id: 'sensor',
        name: 'Array de Sensores',
        desc: 'Expand os sensores (+2 no raio de visão).',
        cost: 6,
        unlocked: false
      }
    ];
  }

  tickCooldowns() {
    this.skills.forEach(s => {
      if (s.cdCurrent > 0) s.cdCurrent--;
    });
  }

  useSkill(skillId, player, dungeon, enemies, logCallback) {
    const skill = this.skills.find(s => s.id === skillId);
    if (!skill) return false;

    if (skill.cdCurrent > 0) {
      logCallback(`${skill.name} está em recarga! (${skill.cdCurrent} turnos restantes)`, 'warn');
      return false;
    }

    if (skill.id === 'nano') {
      if (player.nanites <= 0) {
        logCallback(`Sem cargas Nanite disponíveis!`, 'warn');
        return false;
      }
      player.nanites--;
      player.heal(Math.floor(player.maxHp * 0.4));
      logCallback(`Nano Rebuild ativado! Restaurado HP.`, 'item');
      return true;
    }

    if (player.energy < skill.cost) {
      logCallback(`Energia insuficiente para ${skill.name}!`, 'warn');
      return false;
    }

    player.energy -= skill.cost;
    skill.cdCurrent = skill.cdMax;

    let skillMultiplier = player.talents.has('overcharge') ? 1.25 : 1.0;

    switch (skill.id) {
      case 'dash':
        logCallback(`Overclock Dash ativado!`, 'combat');
        // Dash 3 tiles forward in current direction or towards nearest enemy
        enemies.forEach(e => {
          if (Math.hypot(e.x - player.x, e.y - player.y) <= 3) {
            e.takeDamage(Math.floor(25 * skillMultiplier));
            logCallback(`Dash atingiu ${e.name}!`, 'combat');
          }
        });
        break;

      case 'plasma':
        logCallback(`Plasma Burst liberado!`, 'combat');
        enemies.forEach(e => {
          if (Math.abs(e.x - player.x) <= 1 && Math.abs(e.y - player.y) <= 1) {
            e.takeDamage(Math.floor(35 * skillMultiplier));
            logCallback(`Plasma Burst atingiu ${e.name}!`, 'combat');
          }
        });
        break;

      case 'emp':
        logCallback(`EMP Nova disparado!`, 'combat');
        enemies.forEach(e => {
          if (Math.hypot(e.x - player.x, e.y - player.y) <= 4) {
            e.stunTurns = 3;
            e.takeDamage(Math.floor(15 * skillMultiplier));
            logCallback(`${e.name} atordoado por EMP!`, 'combat');
          }
        });
        break;

      case 'stealth':
        player.stealthTurns = 4;
        logCallback(`Camuflagem óptica ativada por 4 turnos!`, 'info');
        break;
    }

    return true;
  }
}
