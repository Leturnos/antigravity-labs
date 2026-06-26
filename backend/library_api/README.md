# 📚 Library API

Esta é uma API RESTful para o gerenciamento de uma biblioteca, desenvolvida com o objetivo de organizar livros, autores, categorias, leitores e controle de empréstimos.

A API foi projetada em camadas e com arquitetura em etapas para facilitar o desenvolvimento incremental e modular.

---

## 🛠️ Tecnologias Utilizadas

* **Linguagem:** Python 3.10+
* **Framework Web:** FastAPI (assíncrono, alta performance, geração automática de Swagger docs)
* **Banco de Dados:** SQLite (leve, embarcado, ideal para protótipos e experimentação rápida)
* **ORM:** SQLAlchemy 2.0 (mapeamento objeto-relacional para transações seguras)
* **Validação de Dados:** Pydantic v2 (validação de schemas robusta de entrada e saída)
* **Testes:** Pytest & HTTPX (TestClient para simulação de requisições HTTP e banco em memória)

---

## 🚀 Como Executar e Validar o Projeto

### 1. Criar e Ativar Ambiente Virtual
No diretório deste projeto (`backend/library_api/`), crie um ambiente virtual em Python para isolar as dependências:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Instalar Dependências
Instale as bibliotecas requeridas:

```bash
pip install -r requirements.txt
```

### 3. Rodar os Testes Automatizados
A API conta com testes automatizados integrados (TDD). Para rodar toda a suíte de testes utilizando banco SQLite em memória:

```bash
pytest -v
```

### 4. Executar o Servidor de Desenvolvimento
Inicie o servidor local em modo reload:

```bash
uvicorn main:app --reload --port 8000
```

* **API Base:** `http://localhost:8000/api/v1`
* **Health Check:** `http://localhost:8000/api/v1/health`
* **Documentação Swagger (Interativa):** `http://localhost:8000/docs`
* **Documentação ReDoc (Alternativa):** `http://localhost:8000/redoc`

---

## 📂 Estrutura de Arquivos

```text
backend/library_api/
├── database.py       # Configuração da conexão SQLite e instanciamento da sessão ORM
├── models.py         # Modelos de tabelas SQLAlchemy (Authors, Categories, Books)
├── schemas.py        # Modelos Pydantic para tipagem e validação nas rotas
├── crud.py           # Funções auxiliares contendo queries e lógica de persistência
├── main.py           # Inicialização do FastAPI e importação de rotas e tabelas
├── requirements.txt  # Lista de dependências do projeto
├── routes/           # Módulo de controllers / rotas da API
│   ├── __init__.py
│   ├── authors.py    # CRUD de Autores
│   ├── categories.py # CRUD de Categorias
│   └── books.py      # CRUD de Livros
└── tests/            # Suíte de testes automatizados (TDD)
    ├── conftest.py   # Configuração de banco em memória sqlite para isolamento
    ├── test_database.py
    ├── test_models.py
    ├── test_schemas.py
    ├── test_crud.py
    ├── test_routes.py
    └── test_main.py
```

---

## 🗺️ Endpoints Disponíveis (Etapa 1)

### Autores (`/api/v1/authors`)
* `POST /` - Cria um novo autor.
* `GET /` - Retorna a lista de autores (paginada).
* `GET /{author_id}` - Retorna detalhes de um autor específico.
* `PUT /{author_id}` - Atualiza um autor.
* `DELETE /{author_id}` - Exclui um autor (bloqueado se houver livros associados).

### Categorias (`/api/v1/categories`)
* `POST /` - Cria uma nova categoria.
* `GET /` - Retorna a lista de categorias.
* `GET /{category_id}` - Retorna detalhes de uma categoria.
* `PUT /{category_id}` - Atualiza uma categoria.
* `DELETE /{category_id}` - Exclui uma categoria (bloqueado se houver livros associados).

### Livros (`/api/v1/books`)
* `POST /` - Cria um novo livro associado a um autor e categoria existentes.
* `GET /` - Retorna a lista de livros (suporta filtros de busca por título, autor e categoria).
* `GET /{book_id}` - Retorna detalhes do livro e aninha os objetos completos do Autor e Categoria associados.
* `PUT /{book_id}` - Atualiza os dados do livro.
* `DELETE /{book_id}` - Remove o livro do catálogo.

---

## 📈 Planejamento de Desenvolvimento (Próximas Etapas)

* [x] **Etapa 1:** CRUD básico de Livros, Autores e Categorias com SQLite e testes integrados.
* [ ] **Etapa 2:** Cadastro de Leitores/Membros da biblioteca.
* [ ] **Etapa 3:** Autenticação JWT e proteção de rotas administrativas.
* [ ] **Etapa 4:** Registro, Devolução e Controle de Empréstimos de livros com atualização automática de estoque.
