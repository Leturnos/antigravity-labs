/* Aether Event Hub - Frontend Application Logic (pt-BR) */

let currentFilter = "ALL";
let ws = null;

document.addEventListener("DOMContentLoaded", () => {
  fetchMetrics();
  fetchTasks();
  initWebSocket();
});

function getApiUrl(endpoint) {
  return endpoint;
}

function initWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws/events`;
  
  const badge = document.getElementById("ws-status");
  const badgeText = document.getElementById("ws-status-text");

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (badge && badgeText) {
        badge.className = "status-badge live";
        badgeText.textContent = "Conectado ao Vivo";
        badge.title = "Servidor e motor da fila ativos em tempo real";
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "metrics_tick") {
          updateMetricsUI(msg.data);
        } else if (msg.type === "task_created" || msg.type === "task_status_changed") {
          fetchMetrics();
          fetchTasks();
        }
      } catch (e) {
        console.error("Erro ao processar mensagem do WebSocket", e);
      }
    };

    ws.onclose = () => {
      if (badge && badgeText) {
        badge.className = "status-badge offline";
        badgeText.textContent = "Desconectado";
        badge.title = "Servidor em background off-line. Execute no terminal: uv run uvicorn backend.aether_event_hub.main:app --reload --port 8000 (ou python server.py)";
      }
      setTimeout(initWebSocket, 4000);
    };

    ws.onerror = () => {
      if (badge && badgeText) {
        badge.className = "status-badge offline";
        badgeText.textContent = "WS Off-line";
        badge.title = "Não foi possível conectar ao WebSocket. Execute no terminal: uv run uvicorn backend.aether_event_hub.main:app --reload --port 8000 (ou python server.py)";
      }
    };
  } catch (err) {
    if (badge && badgeText) {
      badge.className = "status-badge offline";
      badgeText.textContent = "Erro WS";
    }
  }
}

async function fetchMetrics() {
  try {
    const res = await fetch(getApiUrl("/api/metrics"));
    if (!res.ok) return;
    const data = await res.json();
    updateMetricsUI(data);
  } catch (err) {
    console.error("Falha ao buscar métricas", err);
  }
}

function updateMetricsUI(data) {
  if (!data) return;
  const workersEl = document.getElementById("metric-workers");
  if (workersEl) {
    workersEl.textContent = `${data.active_workers || 0} / ${data.max_concurrent_workers || 5}`;
  }
  
  if (data.counts) {
    const pending = (data.counts.PENDING || 0) + (data.counts.RETRYING || 0);
    const completed = data.counts.COMPLETED || 0;
    const failed = (data.counts.FAILED || 0) + (data.counts.DLQ || 0);
    
    const pendingEl = document.getElementById("metric-pending");
    const completedEl = document.getElementById("metric-completed");
    const failedEl = document.getElementById("metric-failed");
    
    if (pendingEl) pendingEl.textContent = pending;
    if (completedEl) completedEl.textContent = completed;
    if (failedEl) failedEl.textContent = failed;
  }
  
  const latencyEl = document.getElementById("metric-latency");
  if (latencyEl && data.avg_latency_ms !== undefined) {
    latencyEl.textContent = `${data.avg_latency_ms} ms`;
  }
}

async function fetchTasks() {
  try {
    let url = getApiUrl("/api/tasks?limit=50");
    if (currentFilter !== "ALL") {
      url += `&status=${currentFilter}`;
    }
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    renderTasksTable(data.tasks || []);
  } catch (err) {
    console.error("Falha ao buscar tarefas", err);
  }
}

function setFilter(status, btnElement) {
  currentFilter = status;
  document.querySelectorAll(".filter-btn").forEach(btn => btn.classList.remove("active"));
  if (btnElement) btnElement.classList.add("active");
  fetchTasks();
}

function renderTasksTable(tasks) {
  const tbody = document.getElementById("tasks-table-body");
  if (!tbody) return;
  
  if (!tasks || tasks.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhuma tarefa encontrada na fila.</td></tr>`;
    return;
  }

  tbody.innerHTML = tasks.map(t => {
    const statusLower = (t.status || "pending").toLowerCase();
    const badgeClass = `badge-${statusLower}`;
    const duration = (t.execution_time_ms !== null && t.execution_time_ms !== undefined) ? `${t.execution_time_ms.toFixed(1)} ms` : "-";
    const nextSched = t.scheduled_at ? new Date(t.scheduled_at).toLocaleTimeString() : "-";
    const shortId = t.id ? t.id.substring(0, 8) : "";
    const taskJson = JSON.stringify(t).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

    return `
      <tr>
        <td><span class="task-id" title="${t.id}">${shortId}</span></td>
        <td><strong>${t.name}</strong></td>
        <td><span class="badge" style="background: rgba(255,255,255,0.06);">${t.priority}</span></td>
        <td><span class="badge ${badgeClass}">${t.status}</span></td>
        <td>${duration}</td>
        <td style="font-size: 0.8rem; color: var(--text-secondary);">${nextSched}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick='openModalRaw(${taskJson})'>📋 Logs</button>
          ${(t.status === "FAILED" || t.status === "DLQ") ? `<button class="btn btn-primary btn-sm" onclick="retryTask('${t.id}')">🔄 Reexecutar</button>` : ""}
          ${(t.status === "PENDING" || t.status === "RETRYING") ? `<button class="btn btn-secondary btn-sm" style="color: var(--accent-rose);" onclick="cancelTask('${t.id}')">❌ Cancelar</button>` : ""}
        </td>
      </tr>
    `;
  }).join("");
}

async function submitTask(event) {
  event.preventDefault();
  const name = document.getElementById("task-name").value;
  const priority = parseInt(document.getElementById("task-priority").value, 10);
  const cron = document.getElementById("task-cron").value.trim() || null;
  const interval = parseInt(document.getElementById("task-interval").value, 10) || null;
  const timeout = parseInt(document.getElementById("task-timeout").value, 10) || 60;
  
  let payload = {};
  try {
    payload = JSON.parse(document.getElementById("task-payload").value);
  } catch (e) {
    alert("Formato de JSON inválido no campo Payload");
    return;
  }

  const body = {
    name,
    payload,
    priority,
    cron_expression: cron,
    interval_seconds: interval,
    timeout_sec: timeout
  };

  try {
    const res = await fetch(getApiUrl("/api/tasks"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      fetchMetrics();
      fetchTasks();
    } else {
      const err = await res.json();
      alert(`Erro ao enfileirar tarefa: ${err.detail || "Erro desconhecido"}`);
    }
  } catch (err) {
    console.error("Erro ao enviar tarefa", err);
  }
}

async function retryTask(taskId) {
  try {
    const res = await fetch(getApiUrl(`/api/tasks/${taskId}/retry`), { method: "POST" });
    if (res.ok) {
      fetchMetrics();
      fetchTasks();
    }
  } catch (e) {
    console.error("Falha ao reexecutar tarefa", e);
  }
}

async function cancelTask(taskId) {
  try {
    const res = await fetch(getApiUrl(`/api/tasks/${taskId}/cancel`), { method: "POST" });
    if (res.ok) {
      fetchMetrics();
      fetchTasks();
    }
  } catch (e) {
    console.error("Falha ao cancelar tarefa", e);
  }
}

function openModalRaw(task) {
  document.getElementById("modal-title").textContent = `Tarefa ${task.name} (${task.id ? task.id.substring(0, 8) : ""})`;
  document.getElementById("modal-payload").textContent = JSON.stringify(task.payload || {}, null, 2);
  document.getElementById("modal-result").textContent = task.result ? JSON.stringify(task.result, null, 2) : "Nenhum";
  document.getElementById("modal-error").textContent = task.error_log || "Nenhum";
  document.getElementById("log-modal").classList.add("active");
}

function closeModal(event) {
  document.getElementById("log-modal").classList.remove("active");
}
