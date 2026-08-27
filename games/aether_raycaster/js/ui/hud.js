export class HUD {
  constructor() {
    this.bannerText = '';
    this.bannerTimer = 0;
  }

  showNotification(text, duration = 3.0) {
    this.bannerText = text;
    this.bannerTimer = duration;
  }

  update(dt) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
    }
  }

  render(ctx, player, sectorNum, width, height) {
    if (!ctx) return;

    ctx.save();

    // Top-left Status Panel
    ctx.fillStyle = 'rgba(10, 15, 25, 0.85)';
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 1.5;
    ctx.fillRect(16, 16, 240, 96);
    ctx.strokeRect(16, 16, 240, 96);

    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.fillStyle = '#00ffff';
    ctx.fillText(`SETOR: 0${sectorNum} // ATIVO`, 26, 34);

    // HP Bar
    const hpRatio = player.maxHp > 0 ? Math.max(0, Math.min(1, player.hp / player.maxHp)) : 0;
    ctx.fillStyle = '#ff1744';
    ctx.fillRect(26, 42, hpRatio * 120, 10);
    ctx.strokeStyle = '#ff5252';
    ctx.strokeRect(26, 42, 120, 10);
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px "Courier New", monospace';
    ctx.fillText(`VIDA ${Math.ceil(player.hp)}`, 152, 51);

    // Shield Bar
    const shieldRatio = player.maxShield > 0 ? Math.max(0, Math.min(1, player.shield / player.maxShield)) : 0;
    ctx.fillStyle = '#00e5ff';
    ctx.fillRect(26, 58, shieldRatio * 120, 8);
    ctx.strokeStyle = '#80d8ff';
    ctx.strokeRect(26, 58, 120, 8);
    ctx.fillText(`ESC ${Math.ceil(player.shield)}`, 152, 66);

    // Ammo & Key
    ctx.fillStyle = player.ammo < 10 ? '#ff1744' : '#ffd600';
    ctx.fillText(
      `MUNIÇÃO: ${player.ammo}/${player.maxAmmo} ${player.overchargeTimer > 0 ? '[SOBRECARGA!]' : ''}`,
      26,
      82
    );
    ctx.fillStyle = player.hasKey ? '#00e676' : '#757575';
    ctx.fillText(`CHAVE CYBER: ${player.hasKey ? 'COLETADA' : 'NECESSÁRIA'}`, 26, 98);

    // Score & Multiplier (Top Right)
    ctx.fillStyle = 'rgba(10, 15, 25, 0.85)';
    ctx.strokeStyle = '#ff007f';
    ctx.fillRect(width - 220, 16, 204, 50);
    ctx.strokeRect(width - 220, 16, 204, 50);

    ctx.fillStyle = '#ff007f';
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.fillText(`PONTOS: ${player.score}`, width - 208, 38);
    ctx.fillStyle = '#ffea00';
    ctx.font = '12px "Courier New", monospace';
    ctx.fillText(`COMBO: x${player.multiplier}`, width - 208, 54);

    // Center Crosshair
    const cx = width / 2;
    const cy = height / 2;
    ctx.strokeStyle = player.overchargeTimer > 0 ? '#ffd600' : 'rgba(0, 255, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy);
    ctx.lineTo(cx + 8, cy);
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx, cy + 8);
    ctx.stroke();

    // Banner Notification
    if (this.bannerTimer > 0) {
      ctx.fillStyle = 'rgba(15, 5, 25, 0.9)';
      ctx.fillRect(cx - 200, height - 120, 400, 32);
      ctx.strokeStyle = '#00ffff';
      ctx.strokeRect(cx - 200, height - 120, 400, 32);
      ctx.fillStyle = '#00ffff';
      ctx.font = 'bold 12px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.bannerText, cx, height - 100);
      ctx.textAlign = 'left';
    }

    ctx.restore();
  }
}
