/**
 * Latency Analytics & Canvas Chart Component for Aether API Workbench.
 * Interactive HTML5 Canvas chart plotting RTT latency history, Min/Max/Avg/P95 metrics, and throughput.
 */

import { formatMs, formatBytes, escapeHtml } from '../utils/formatters.js';

let chartCanvas = null;
let chartCtx = null;
let chartHistoryData = [];
let chartLimit = 30;
let hoveredPoint = null;

/**
 * Render Latency Analytics view inside container.
 * @param {HTMLElement} container - Target tab pane element.
 */
export async function renderLatencyAnalytics(container) {
  container.innerHTML = `
    <div class="latency-analytics-container">
      <!-- Top Metrics Summary Cards -->
      <div class="metrics-summary-grid">
        <div class="glass-card metric-card">
          <div class="metric-icon-box avg">⚡</div>
          <div class="metric-data">
            <span class="metric-title">Média de Latência</span>
            <span class="metric-val" id="metric-avg-latency">-- ms</span>
            <span class="metric-sub">Tempo médio RTT</span>
          </div>
        </div>

        <div class="glass-card metric-card">
          <div class="metric-icon-box p95">🎯</div>
          <div class="metric-data">
            <span class="metric-title">Percentil 95 (P95)</span>
            <span class="metric-val" id="metric-p95-latency">-- ms</span>
            <span class="metric-sub">95% das reqs abaixo de</span>
          </div>
        </div>

        <div class="glass-card metric-card">
          <div class="metric-icon-box min">🟢</div>
          <div class="metric-data">
            <span class="metric-title">Latência Mínima</span>
            <span class="metric-val" id="metric-min-latency">-- ms</span>
            <span class="metric-sub">Melhor tempo</span>
          </div>
        </div>

        <div class="glass-card metric-card">
          <div class="metric-icon-box max">🔴</div>
          <div class="metric-data">
            <span class="metric-title">Latência Máxima</span>
            <span class="metric-val" id="metric-max-latency">-- ms</span>
            <span class="metric-sub">Pior tempo</span>
          </div>
        </div>

        <div class="glass-card metric-card">
          <div class="metric-icon-box total">📊</div>
          <div class="metric-data">
            <span class="metric-title">Total de Requisições</span>
            <span class="metric-val" id="metric-total-reqs">0</span>
            <span class="metric-sub" id="metric-success-rate">Taxa de Sucesso: --%</span>
          </div>
        </div>
      </div>

      <!-- Main Canvas Chart Card -->
      <div class="glass-card chart-container-card">
        <div class="chart-header-bar">
          <div class="chart-title-group">
            <h3>Gráfico de Latência RTT (ms)</h3>
            <span class="sub-label">Monitoramento contínuo em tempo real</span>
          </div>

          <div class="chart-controls">
            <label class="control-label">Amostras:</label>
            <select id="chart-limit-select" class="input-select input-sm">
              <option value="15">Últimas 15</option>
              <option value="30" selected>Últimas 30</option>
              <option value="50">Últimas 50</option>
              <option value="100">Últimas 100</option>
            </select>
            <button id="btn-refresh-metrics" class="btn btn-sm btn-secondary">
              <span>🔄</span> Atualizar
            </button>
          </div>
        </div>

        <div class="canvas-wrapper" id="canvas-wrapper">
          <canvas id="latency-canvas"></canvas>
          <div id="chart-tooltip" class="chart-tooltip hidden"></div>
        </div>
      </div>

      <!-- Execution Log Breakdown Table -->
      <div class="glass-card log-table-card">
        <div class="card-header-flex">
          <h4>Últimas Execuções Analisadas</h4>
        </div>
        <div class="table-responsive">
          <table class="analytics-table" id="analytics-table">
            <thead>
              <tr>
                <th>Método</th>
                <th>Status</th>
                <th>URL / Endpoint</th>
                <th>Latência RTT</th>
                <th>Horário</th>
              </tr>
            </thead>
            <tbody id="analytics-table-body">
              <tr>
                <td colspan="5" class="empty-table-msg">Nenhum dado registrado para análise.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  attachLatencyChartEvents(container);
  await fetchAndRenderChart();
}

/**
 * Attach Canvas and Control events.
 */
function attachLatencyChartEvents(container) {
  const limitSelect = container.querySelector('#chart-limit-select');
  const refreshBtn = container.querySelector('#btn-refresh-metrics');
  chartCanvas = container.querySelector('#latency-canvas');

  if (chartCanvas) {
    chartCtx = chartCanvas.getContext('2d');
    setupCanvasHover();
  }

  if (limitSelect) {
    limitSelect.addEventListener('change', (e) => {
      chartLimit = parseInt(e.target.value, 10);
      fetchAndRenderChart();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      fetchAndRenderChart();
    });
  }

  // Cross-component listeners
  window.addEventListener('aether:request-executed', () => {
    fetchAndRenderChart();
  });

  window.addEventListener('aether:tab-changed', (e) => {
    if (e.detail && e.detail.tab === 'latency') {
      setTimeout(() => {
        resizeCanvas();
        drawChart();
      }, 50);
    }
  });

  window.addEventListener('aether:history-cleared', () => {
    chartHistoryData = [];
    calculateMetrics([]);
    drawChart();
    renderLogTable([]);
  });

  window.addEventListener('resize', () => {
    resizeCanvas();
    drawChart();
  });
}

/**
 * Fetch recent history and compute metrics.
 */
async function fetchAndRenderChart() {
  try {
    const res = await fetch(`/api/history?limit=${chartLimit}`);
    if (res.ok) {
      const data = await res.json();
      chartHistoryData = Array.isArray(data) ? data.reverse() : [];
      calculateMetrics(chartHistoryData);
      resizeCanvas();
      drawChart();
      renderLogTable(chartHistoryData);
    }
  } catch (err) {
    console.error('Failed to fetch history for latency chart:', err);
  }
}

/**
 * Calculate statistical metrics (Min, Max, Avg, P95, Success rate).
 */
function calculateMetrics(data) {
  const avgEl = document.getElementById('metric-avg-latency');
  const p95El = document.getElementById('metric-p95-latency');
  const minEl = document.getElementById('metric-min-latency');
  const maxEl = document.getElementById('metric-max-latency');
  const totalEl = document.getElementById('metric-total-reqs');
  const successRateEl = document.getElementById('metric-success-rate');

  if (!data || data.length === 0) {
    if (avgEl) avgEl.innerText = '-- ms';
    if (p95El) p95El.innerText = '-- ms';
    if (minEl) minEl.innerText = '-- ms';
    if (maxEl) maxEl.innerText = '-- ms';
    if (totalEl) totalEl.innerText = '0';
    if (successRateEl) successRateEl.innerText = 'Taxa de Sucesso: --%';
    return;
  }

  const latencies = data.map(d => Number(d.execution_time_ms) || 0).sort((a, b) => a - b);
  const total = latencies.length;
  const sum = latencies.reduce((acc, v) => acc + v, 0);
  const avg = sum / total;
  const min = latencies[0];
  const max = latencies[total - 1];

  // P95 calculation
  const p95Index = Math.min(total - 1, Math.floor(total * 0.95));
  const p95 = latencies[p95Index];

  // Success rate (2xx/3xx)
  const successCount = data.filter(d => d.response_status >= 200 && d.response_status < 400).length;
  const successRate = Math.round((successCount / total) * 100);

  if (avgEl) avgEl.innerText = formatMs(avg);
  if (p95El) p95El.innerText = formatMs(p95);
  if (minEl) minEl.innerText = formatMs(min);
  if (maxEl) maxEl.innerText = formatMs(max);
  if (totalEl) totalEl.innerText = String(total);
  if (successRateEl) successRateEl.innerText = `Taxa de Sucesso: ${successRate}% (${successCount}/${total})`;
}

/**
 * Handle Canvas Retina / High DPI sizing.
 */
function resizeCanvas() {
  if (!chartCanvas) return;
  const wrapper = document.getElementById('canvas-wrapper');
  if (!wrapper) return;

  const rect = wrapper.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  const width = Math.max(300, Math.floor(rect.width));
  const height = Math.max(220, Math.floor(rect.height || 280));

  chartCanvas.width = width * dpr;
  chartCanvas.height = height * dpr;
  chartCanvas.style.width = `${width}px`;
  chartCanvas.style.height = `${height}px`;

  if (chartCtx) {
    chartCtx.scale(dpr, dpr);
  }
}

/**
 * Draw smooth curved line chart on HTML5 Canvas.
 */
function drawChart() {
  if (!chartCanvas || !chartCtx) return;
  const wrapper = document.getElementById('canvas-wrapper');
  if (!wrapper) return;

  const rect = wrapper.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height || 280;

  chartCtx.clearRect(0, 0, width, height);

  if (chartHistoryData.length === 0) {
    chartCtx.fillStyle = '#64748b';
    chartCtx.font = '14px Plus Jakarta Sans, sans-serif';
    chartCtx.textAlign = 'center';
    chartCtx.fillText('Nenhuma requisição registrada para plotagem gráfica.', width / 2, height / 2);
    return;
  }

  const paddingLeft = 55;
  const paddingRight = 30;
  const paddingTop = 25;
  const paddingBottom = 40;

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  const latencies = chartHistoryData.map(d => Number(d.execution_time_ms) || 0);
  const maxLatency = Math.max(10, Math.ceil(Math.max(...latencies) * 1.2));

  // Draw Horizontal Grid Lines & Y-Axis Labels
  const gridLines = 4;
  chartCtx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  chartCtx.lineWidth = 1;
  chartCtx.fillStyle = '#64748b';
  chartCtx.font = '11px JetBrains Mono, monospace';
  chartCtx.textAlign = 'right';

  for (let i = 0; i <= gridLines; i++) {
    const yVal = Math.round((maxLatency / gridLines) * (gridLines - i));
    const yPos = paddingTop + (chartH / gridLines) * i;

    chartCtx.beginPath();
    chartCtx.moveTo(paddingLeft, yPos);
    chartCtx.lineTo(width - paddingRight, yPos);
    chartCtx.stroke();

    chartCtx.fillText(`${yVal} ms`, paddingLeft - 10, yPos + 4);
  }

  // Calculate Points Coordinates
  const count = chartHistoryData.length;
  const stepX = count > 1 ? chartW / (count - 1) : chartW / 2;

  const points = chartHistoryData.map((d, i) => {
    const lat = Number(d.execution_time_ms) || 0;
    const x = count === 1 ? paddingLeft + chartW / 2 : paddingLeft + i * stepX;
    const y = paddingTop + chartH - (lat / maxLatency) * chartH;
    return { x, y, data: d, latency: lat };
  });

  // Store coordinates for hover interaction
  chartCanvas._plottedPoints = points;

  // Draw Gradient Area Fill under curve
  if (points.length > 1) {
    const gradient = chartCtx.createLinearGradient(0, paddingTop, 0, paddingTop + chartH);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.35)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0.00)');

    chartCtx.beginPath();
    chartCtx.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpx = (p0.x + p1.x) / 2;
      chartCtx.bezierCurveTo(cpx, p0.y, cpx, p1.y, p1.x, p1.y);
    }

    chartCtx.lineTo(points[points.length - 1].x, paddingTop + chartH);
    chartCtx.lineTo(points[0].x, paddingTop + chartH);
    chartCtx.closePath();
    chartCtx.fillStyle = gradient;
    chartCtx.fill();
  }

  // Draw Line
  chartCtx.beginPath();
  chartCtx.strokeStyle = '#6366f1';
  chartCtx.lineWidth = 2.5;

  if (points.length === 1) {
    chartCtx.arc(points[0].x, points[0].y, 4, 0, Math.PI * 2);
  } else {
    chartCtx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpx = (p0.x + p1.x) / 2;
      chartCtx.bezierCurveTo(cpx, p0.y, cpx, p1.y, p1.x, p1.y);
    }
  }
  chartCtx.stroke();

  // Draw Data Points
  points.forEach((pt, idx) => {
    const isHovered = hoveredPoint && hoveredPoint.idx === idx;
    const isError = pt.data.response_status >= 400 || !pt.data.response_status;

    chartCtx.beginPath();
    chartCtx.arc(pt.x, pt.y, isHovered ? 6 : 3.5, 0, Math.PI * 2);
    chartCtx.fillStyle = isError ? '#ef4444' : '#10b981';
    chartCtx.fill();
    chartCtx.lineWidth = isHovered ? 3 : 1.5;
    chartCtx.strokeStyle = '#ffffff';
    chartCtx.stroke();
  });

  // Draw Crosshair if Hovered
  if (hoveredPoint && hoveredPoint.pt) {
    const hp = hoveredPoint.pt;
    chartCtx.save();
    chartCtx.setLineDash([4, 4]);
    chartCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    chartCtx.lineWidth = 1;

    chartCtx.beginPath();
    chartCtx.moveTo(hp.x, paddingTop);
    chartCtx.lineTo(hp.x, paddingTop + chartH);
    chartCtx.stroke();
    chartCtx.restore();
  }
}

/**
 * Setup mouse hover tooltip for canvas points.
 */
function setupCanvasHover() {
  const tooltip = document.getElementById('chart-tooltip');
  if (!chartCanvas || !tooltip) return;

  chartCanvas.addEventListener('mousemove', (e) => {
    const rect = chartCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const points = chartCanvas._plottedPoints || [];
    let closest = null;
    let minDistance = 24;

    points.forEach((pt, idx) => {
      const dist = Math.hypot(pt.x - mouseX, pt.y - mouseY);
      if (dist < minDistance) {
        minDistance = dist;
        closest = { pt, idx };
      }
    });

    if (closest) {
      hoveredPoint = closest;
      drawChart();

      const d = closest.pt.data;
      const statusClass = d.response_status ? `s${String(d.response_status)[0]}xx` : 's5xx';

      tooltip.innerHTML = `
        <div class="tooltip-header">
          <span class="badge-method ${(d.request_method || 'GET').toLowerCase()}">${escapeHtml(d.request_method || 'GET')}</span>
          <span class="badge-status ${statusClass}">${d.response_status || 'ERR'}</span>
          <span class="tooltip-latency">${formatMs(d.execution_time_ms)}</span>
        </div>
        <div class="tooltip-url">${escapeHtml(d.request_url || '')}</div>
      `;

      tooltip.style.left = `${closest.pt.x}px`;
      tooltip.style.top = `${closest.pt.y - 10}px`;
      tooltip.classList.remove('hidden');
    } else {
      if (hoveredPoint) {
        hoveredPoint = null;
        drawChart();
      }
      tooltip.classList.add('hidden');
    }
  });

  chartCanvas.addEventListener('mouseleave', () => {
    if (hoveredPoint) {
      hoveredPoint = null;
      drawChart();
    }
    tooltip.classList.add('hidden');
  });
}

/**
 * Render log breakdown table underneath chart.
 */
function renderLogTable(data) {
  const tbody = document.getElementById('analytics-table-body');
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-table-msg">Nenhum dado registrado para análise.</td></tr>`;
    return;
  }

  let html = '';
  // Show in reverse chronological order for table
  const reversed = [...data].reverse();
  reversed.forEach(log => {
    const method = (log.request_method || 'GET').toUpperCase();
    const status = log.response_status || 0;
    const statusClass = status ? `s${String(status)[0]}xx` : 's5xx';
    const dateStr = log.created_at ? new Date(log.created_at).toLocaleTimeString() : '--:--';

    html += `
      <tr>
        <td><span class="badge-method ${method.toLowerCase()}">${method}</span></td>
        <td><span class="badge-status ${statusClass}">${status || 'ERR'}</span></td>
        <td class="table-url-cell" title="${escapeHtml(log.request_url || '')}">${escapeHtml(log.request_url || '')}</td>
        <td class="table-latency-cell font-mono">${formatMs(log.execution_time_ms || 0)}</td>
        <td class="table-time-cell">${dateStr}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}
