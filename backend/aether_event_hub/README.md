# ⚙️ Aether Event Hub & Task Queue

Sistema leve de agendamento de tarefas e fila de eventos distribuídos em background construído em Python com **FastAPI**, **Asyncio**, **SQLite WAL** (via `aiosqlite`) e **WebSockets**.

---

## 🌟 Funcionalidades e Mecânicas

- **Persistência Leve em SQLite WAL:** Zero dependências de servidores externos (como Redis ou RabbitMQ). Opera com `PRAGMA journal_mode=WAL;` e `aiosqlite` para garantir operações 100% não-bloqueantes no event loop do FastAPI.
- **Abstração de Executores (`BaseTaskExecutor`):** Interface desacoplada que permite alternar a execução de tarefas entre trabalhadores `asyncio`, `multiprocessing` ou trabalhadores distribuídos remotos.
- **Métricas em Tempo Real via WebSockets:** Transmissão instantânea de telemetry (`metrics_tick`, `task_created`, `task_status_changed`) para um Dashboard moderno com estética Dark Glassmorphism.
- **Agendamento Flexível:** Suporta tarefas instantâneas, agendadas por data/hora futura e recorrentes (estilo **Cron** ou **Intervalos fixos**).
- **Tolerância a Falhas & DLQ Resiliente:**
  - **Reserva Atômica:** Prevenção contra race conditions no polling amarrada à capacidade (`available_slots`).
  - **Recuperação de Órfãos:** Reenfileiramento automático no startup de tarefas interrompidas em estado `RUNNING`.
  - **Timeouts por Tarefa:** Envelopamento em `asyncio.wait_for(...)`.
  - **Backoff Exponencial com Teto:** Retries exponenciais limitados por `max_backoff_sec`.
  - **Proteção de Recorrência:** Tarefas recorrentes que atingem a fila de erros DLQ continuam tendo suas futuras execuções reagendadas automaticamente.

---

## 📂 Estrutura do Projeto

```text
backend/aether_event_hub/
├── api/
│   ├── routes_tasks.py       # Endpoints REST (Criar, Listar, Detalhar, Cancelar, Retry, Métricas)
│   └── websockets.py         # Endpoint WebSocket (/ws/events)
├── core/
│   ├── engine.py             # TaskQueueEngine (Scheduler, Poller, Atomic Claim, Recovery, DLQ)
│   ├── event_hub.py          # Pub/Sub em memória para WebSockets
│   └── executors/
│       ├── base.py           # BaseTaskExecutor e TaskResult (Contrato Abstrato)
│       └── asyncio_executor.py # Implementação padrão Asyncio
├── database/
│   └── connection.py         # Gerenciador de conexões aiosqlite e Schema da tabela tasks
├── static/
│   ├── index.html            # Dashboard Visual Aether
│   ├── style.css             # Design System Dark Glassmorphism
│   └── app.js                # Cliente JS WebSocket + REST
├── tests/                    # Suíte de Testes Automatizados com Pytest
│   ├── test_database.py
│   ├── test_executor.py
│   ├── test_engine.py
│   ├── test_event_hub.py
│   └── test_api.py
├── main.py                   # Servidor FastAPI Principal
└── requirements.txt          # Dependências
```

---

## 🚀 Como Executar

### 1. Usando `uv` (Recomendado)

```bash
# Criar o ambiente e instalar dependências
uv venv backend/aether_event_hub/.venv
uv pip install -p backend/aether_event_hub/.venv -r backend/aether_event_hub/requirements.txt

# Iniciar o servidor Uvicorn com o uv
uv run uvicorn backend.aether_event_hub.main:app --reload --port 8000
```

Acesse o Dashboard diretamente em [http://localhost:8000](http://localhost:8000) (ou [http://localhost:8000/backend/aether_event_hub/static/](http://localhost:8000/backend/aether_event_hub/static/)).

---

## 🧪 Executando os Testes

```bash
uv run pytest backend/aether_event_hub/tests/ -v
```

---

## 📡 Endpoints REST Principais

- `POST /api/tasks`: Enfileirar nova tarefa.
- `GET /api/tasks`: Listar tarefas com filtros e paginação.
- `GET /api/tasks/{task_id}`: Obter detalhes e logs de execução.
- `POST /api/tasks/{task_id}/retry`: Forçar tentativa manual de reexecução.
- `POST /api/tasks/{task_id}/cancel`: Cancelar tarefa pendente.
- `GET /api/metrics`: Obter estatísticas em tempo real da fila.
- `WS /ws/events`: Feixe de transmissão WebSocket para o Dashboard.
