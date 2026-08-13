export class MermaidModule {
    constructor() {
        this.mermaid = window.mermaid;
        if (this.mermaid) {
            this.mermaid.initialize({
                startOnLoad: false,
                theme: 'dark',
                securityLevel: 'loose',
                fontFamily: 'Plus Jakarta Sans, sans-serif'
            });
        }
        this.templates = {
            microservices: `graph TD
    Client[📱 Client App] --> Gateway[⚡ API Gateway]
    Gateway --> Auth[🔐 Auth Service]
    Gateway --> Hub[📡 Event Hub Service]
    Hub --> DB[(🗄️ SQLite DB)]`,
            sequence: `sequenceDiagram
    autonumber
    actor User as Usuario
    participant UI as Collab Board UI
    participant WS as WebSocket Server
    participant DB as SQLite DB

    User->>UI: Mover Sticky Note
    UI->>WS: Send node_update
    WS->>DB: Persistir Coordenadas
    WS-->>UI: Broadcast Peers`,
            c4: `graph TB
    subgraph Aether Suite
        UI[Aether Collab Board Frontend]
        WS[FastAPI WebSockets Router]
        DB[(SQLite Collab DB)]
    end
    UI -->|JSON Sync| WS
    WS -->|aiosqlite| DB`,
            erd: `erDiagram
    BOARDS ||--o{ NODES : contains
    BOARDS ||--o{ CONNECTORS : connects
    NODES {
        string id PK
        string type
        float x
        float y
        string content
    }`
        };

        this.initModalEvents();
    }

    initModalEvents() {
        const tplButtons = document.querySelectorAll('.tpl-btn');
        const codeTextarea = document.getElementById('mermaid-code');
        const previewContainer = document.getElementById('mermaid-modal-preview');

        tplButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tplKey = btn.getAttribute('data-template');
                const templateCode = this.getTemplate(tplKey);
                if (codeTextarea) {
                    codeTextarea.value = templateCode;
                    this.renderDiagram(templateCode, previewContainer);
                }
            });
        });

        if (codeTextarea && previewContainer) {
            let debounceTimer;
            codeTextarea.addEventListener('input', () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this.renderDiagram(codeTextarea.value, previewContainer);
                }, 400);
            });
        }
    }

    async renderDiagram(code, targetEl) {
        if (!this.mermaid || !targetEl || !code.trim()) return;
        try {
            const uniqueId = `mermaid-svg-${Math.random().toString(36).substr(2, 9)}`;
            const { svg } = await this.mermaid.render(uniqueId, code);
            targetEl.innerHTML = svg;
        } catch (err) {
            targetEl.innerHTML = `<pre style="color: #f87171; font-size: 0.8rem; font-family: monospace;">Erro Mermaid:\n${err.message || err}</pre>`;
        }
    }

    getTemplate(name) {
        return this.templates[name] || this.templates.microservices;
    }
}
