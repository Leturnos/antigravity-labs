export const BIOME_COLORS = {
  DEEP_OCEAN: '#0d1b2a',
  SHALLOW_OCEAN: '#1b4965',
  BEACH: '#e9c46a',
  SNOW_MOUNTAIN: '#e0e1dd',
  TUNDRA: '#a8dadc',
  GRASSLAND: '#52b788',
  TEMP_FOREST: '#2d6a4f',
  SWAMP: '#1a3a2b',
  DESERT: '#f4a261',
  SAVANNA: '#ccd5ae',
  JUNGLE: '#081c15',
  RIVER: '#00b4d8',
  LAKE: '#0077b6'
};

export const BIOME_NAMES = {
  DEEP_OCEAN: 'Oceano Profundo',
  SHALLOW_OCEAN: 'Mar Raso',
  BEACH: 'Praia',
  SNOW_MOUNTAIN: 'Montanha de Neve',
  TUNDRA: 'Tundra',
  GRASSLAND: 'Planície',
  TEMP_FOREST: 'Floresta Temperada',
  SWAMP: 'Pântano',
  DESERT: 'Deserto',
  SAVANNA: 'Savana',
  JUNGLE: 'Floresta Tropical',
  RIVER: 'Rio',
  LAKE: 'Lago'
};

export function renderWorld(grid, mode, recentEvents = []) {
  const canvas = document.getElementById('world-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = grid.length;
  const cellSize = canvas.width / size;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // 1. Renderização base do grid
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = grid[y][x];
      let color = '#000000';
      
      if (mode === 'biome') {
        color = BIOME_COLORS[cell.biome] || '#000000';
      } else if (mode === 'elevation') {
        const val = Math.floor(cell.elevation * 255);
        color = `rgb(${val}, ${val}, ${val})`;
      } else if (mode === 'moisture') {
        const r = Math.floor(244 + (33 - 244) * cell.moisture);
        const g = Math.floor(210 + (100 - 210) * cell.moisture);
        const b = Math.floor(150 + (243 - 150) * cell.moisture);
        color = `rgb(${r}, ${g}, ${b})`;
      } else if (mode === 'temperature') {
        const r = Math.floor(33 + (230 - 33) * cell.temperature);
        const g = Math.floor(150 + (57 - 150) * cell.temperature);
        const b = Math.floor(243 + (70 - 243) * cell.temperature);
        color = `rgb(${r}, ${g}, ${b})`;
      }
      
      ctx.fillStyle = color;
      ctx.fillRect(x * cellSize, y * cellSize, Math.ceil(cellSize), Math.ceil(cellSize));
    }
  }

  // 2. Camadas adicionais da Fase 3 (somente na visualização de Biomas)
  if (mode === 'biome') {
    const showKingdoms = document.getElementById('show-kingdoms')?.checked ?? false;
    const showResources = document.getElementById('show-resources')?.checked ?? false;
    const showCities = document.getElementById('show-cities-routes')?.checked ?? false;
    const showDungeons = document.getElementById('show-dungeons')?.checked ?? false;

    // A. Reinos: territórios semitransparentes
    if (showKingdoms && grid.kingdoms) {
      const KINGDOM_COLORS = [
        'rgba(230, 57, 70, 0.15)',  // Vermelho
        'rgba(69, 123, 157, 0.15)', // Azul
        'rgba(131, 56, 236, 0.15)', // Roxo
        'rgba(244, 162, 97, 0.15)', // Laranja
        'rgba(42, 157, 143, 0.15)', // Verde-turquesa
      ];
      
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const cell = grid[y][x];
          if (cell.kingdomId !== undefined) {
            ctx.fillStyle = KINGDOM_COLORS[cell.kingdomId % KINGDOM_COLORS.length];
            ctx.fillRect(x * cellSize, y * cellSize, Math.ceil(cellSize), Math.ceil(cellSize));
          }
        }
      }

      // Fronteiras
      const KINGDOM_BORDER_COLORS = ['#e63946', '#457b9d', '#8338ec', '#f4a261', '#2a9d8f'];
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const cell = grid[y][x];
          if (cell.isFrontier) {
            ctx.strokeStyle = KINGDOM_BORDER_COLORS[cell.kingdomId % KINGDOM_BORDER_COLORS.length];
            ctx.lineWidth = Math.max(1, cellSize * 0.15);
            ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);
          }
        }
      }
    }

    // B. Recursos Naturais
    if (showResources) {
      const resourceEmojis = { wood: '🪵', ore: '⛏️', fish: '🐟', stone: '🧱', crops: '🌾' };
      const resourceColors = { wood: '#8b5a2b', ore: '#a9a9a9', fish: '#90e0ef', stone: '#d3d3d3', crops: '#ffd166' };

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const cell = grid[y][x];
          if (cell.resource && cell.resourceDensity > 0.6) {
            const cx = x * cellSize + cellSize / 2;
            const cy = y * cellSize + cellSize / 2;

            if (cellSize >= 10) {
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.font = `${Math.floor(cellSize * 0.75)}px Arial`;
              ctx.fillText(resourceEmojis[cell.resource], cx, cy);
            } else {
              ctx.fillStyle = resourceColors[cell.resource];
              ctx.beginPath();
              ctx.arc(cx, cy, Math.max(1, cellSize * 0.2), 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
    }

    // C. Rotas Comerciais (Estradas)
    if (showCities && grid.routes) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (const route of grid.routes) {
        if (route.isTradeRoute) {
          ctx.strokeStyle = '#eab308'; // Dourado para rotas comerciais ativas
          ctx.lineWidth = Math.max(2.2, cellSize * 0.35);
        } else {
          ctx.strokeStyle = '#4a3728'; // Marrom padrão para estradas
          ctx.lineWidth = Math.max(1.5, cellSize * 0.25);
        }

        ctx.beginPath();
        route.path.forEach((pt, idx) => {
          const px = pt.x * cellSize + cellSize / 2;
          const py = pt.y * cellSize + cellSize / 2;
          if (idx === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        });
        ctx.stroke();
      }
    }

    // D. Dungeons e POIs
    if (showDungeons && grid.dungeons) {
      for (const dung of grid.dungeons) {
        const cx = dung.x * cellSize + cellSize / 2;
        const cy = dung.y * cellSize + cellSize / 2;

        if (cellSize >= 8) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `${Math.floor(cellSize * 1.1)}px Arial`;
          ctx.fillText(dung.type === 'temple' ? '⛩️' : '🏛️', cx, cy);
        } else {
          ctx.fillStyle = '#ff3333';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1;
          const w = Math.max(3, cellSize * 0.8);
          ctx.fillRect(cx - w/2, cy - w/2, w, w);
          ctx.strokeRect(cx - w/2, cy - w/2, w, w);
        }
      }
    }

    // E. Cidades e Assentamentos
    if (showCities && grid.cities) {
      for (const city of grid.cities) {
        const cx = city.x * cellSize + cellSize / 2;
        const cy = city.y * cellSize + cellSize / 2;

        // Se for abandonada
        if (city.isAbandoned) {
          if (cellSize >= 8) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `${Math.floor(cellSize * 1.3)}px Arial`;
            ctx.fillText('💀', cx, cy);
          } else {
            ctx.fillStyle = '#475569'; // Cinza escuro
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            const r = Math.max(2, cellSize * 0.6);
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          continue;
        }

        if (cellSize >= 8) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `${Math.floor(cellSize * 1.3)}px Arial`;
          ctx.fillText(city.type === 'capital' ? '👑' : city.type === 'city' ? '🏰' : '🏠', cx, cy);
        } else {
          ctx.fillStyle = city.type === 'capital' ? '#ff3333' : city.type === 'city' ? '#ffaa00' : '#ffff00';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1;
          const r = Math.max(2, cellSize * 0.6);
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
    
    // F. Drawing of Recent History Events and Highlights (Phase 4)
    if (recentEvents && recentEvents.length > 0) {
      recentEvents.forEach(evt => {
        const cx = evt.x * cellSize + cellSize / 2;
        const cy = evt.y * cellSize + cellSize / 2;
        const alpha = Math.max(0, evt.age / 10.0);
        
        ctx.save();
        ctx.globalAlpha = alpha;
        
        // Draw pulsing heat circle
        ctx.beginPath();
        const pulseRadius = cellSize * (1.2 + (10.0 - Math.min(10.0, evt.age)) * 0.35);
        ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
        
        if (evt.type === 'war-msg') {
          ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
          ctx.strokeStyle = '#ef4444';
        } else if (evt.type === 'trade-msg') {
          ctx.fillStyle = 'rgba(234, 179, 8, 0.35)';
          ctx.strokeStyle = '#eab308';
        } else if (evt.type === 'growth-msg') {
          ctx.fillStyle = 'rgba(34, 197, 94, 0.35)';
          ctx.strokeStyle = '#22c55e';
        } else if (evt.type === 'highlight') {
          ctx.fillStyle = 'rgba(99, 102, 241, 0.18)';
          ctx.strokeStyle = '#6366f1';
        } else {
          // decay-msg, disasters
          ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
          ctx.strokeStyle = '#94a3b8';
        }
        
        ctx.fill();
        ctx.lineWidth = Math.max(1, cellSize * 0.08);
        ctx.stroke();
        
        // Extra effect for Highlight (Chronicle click)
        if (evt.type === 'highlight') {
          ctx.beginPath();
          ctx.arc(cx, cy, pulseRadius * 1.6, 0, Math.PI * 2);
          ctx.stroke();
        }
        
        // Draw floating emojis that rise as event ages
        if (cellSize >= 10 && evt.type !== 'highlight') {
          ctx.font = `${Math.floor(cellSize * 1.5)}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          let emoji = '✨';
          if (evt.type === 'war-msg') emoji = '⚔️';
          else if (evt.type === 'trade-msg') emoji = '🪙';
          else if (evt.type === 'growth-msg') emoji = '📈';
          else if (evt.type === 'decay-msg') emoji = '💀';
          
          // Emojis rise slightly
          const floatOffset = (10.0 - Math.min(10.0, evt.age)) * (cellSize * 0.15);
          ctx.fillText(emoji, cx, cy - floatOffset);
        }
        
        ctx.restore();
      });
    }
  }
}
