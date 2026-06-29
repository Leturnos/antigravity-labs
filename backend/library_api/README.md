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
├── models.py         # Modelos de tabelas SQLAlchemy (Authors, Categories, Books, Users)
├── schemas.py        # Modelos Pydantic para tipagem e validação nas rotas (inclui Users)
├── security.py       # Utilidades de segurança, hashing (bcrypt) e tokens JWT
├── crud.py           # Funções auxiliares contendo queries e lógica de persistência (com hashing de senhas)
├── main.py           # Inicialização do FastAPI, tabelas e roteadores
├── requirements.txt  # Lista de dependências do projeto (FastAPI, SQLAlchemy, PyJWT, passlib, etc.)
├── routes/           # Módulo de controllers / rotas da API
│   ├── __init__.py
│   ├── auth.py       # Login e geração de Token JWT
│   ├── authors.py    # CRUD de Autores
│   ├── categories.py # CRUD de Categorias
│   ├── books.py      # CRUD de Livros
│   └── users.py      # CRUD de Usuários/Leitores
└── tests/            # Suíte de testes automatizados (TDD)
    ├── conftest.py   # Configuração de banco em memória sqlite para isolamento
    ├── test_auth.py  # Testes de autenticação, login e controle de papéis (RBAC)
    ├── test_database.py
    ├── test_models.py
    ├── test_schemas.py
    ├── test_security.py # Testes locais de hashing de senha
    ├── test_crud.py
    ├── test_routes.py
    ├── test_users.py
    └── test_main.py
```

---

## 🗺️ Endpoints Disponíveis (Etapas 1, 2 & 3)

### Autenticação (`/api/v1/auth`)
* `POST /login` - Recebe e-mail (`username`) e senha (Form Data), retorna o Token de Acesso JWT.

### Autores (`/api/v1/authors`)
* `POST /` `[Protegido - Autenticado]` - Cria um novo autor.
* `GET /` - Retorna a lista de autores (paginada).
* `GET /{author_id}` - Retorna detalhes de um autor específico.
* `PUT /{author_id}` `[Protegido - Admin]` - Atualiza um autor.
* `DELETE /{author_id}` `[Protegido - Admin]` - Exclui um autor (bloqueado se houver livros associados).

### Categorias (`/api/v1/categories`)
* `POST /` `[Protegido - Admin]` - Cria uma nova categoria.
* `GET /` - Retorna a lista de categorias.
* `GET /{category_id}` - Retorna detalhes de uma categoria.
* `PUT /{category_id}` `[Protegido - Admin]` - Atualiza uma categoria.
* `DELETE /{category_id}` `[Protegido - Admin]` - Exclui uma categoria (bloqueado se houver livros associados).

### Livros (`/api/v1/books`)
* `POST /` `[Protegido - Autenticado]` - Cria um novo livro associado a um autor e categoria existentes.
* `GET /` - Retorna a lista de livros (suporta filtros de busca por título, autor e categoria).
* `GET /{book_id}` - Retorna detalhes do livro e aninha os objetos completos do Autor e Categoria associados.
* `PUT /{book_id}` `[Protegido - Admin]` - Atualiza os dados do livro.
* `DELETE /{book_id}` `[Protegido - Admin]` - Remove o livro do catálogo.

### Usuários (`/api/v1/users`)
* `POST /` (Cadastro de Leitores) - Cria um novo usuário/leitor (com hash bcrypt automático da senha).
* `GET /` `[Protegido - Admin]` - Retorna a lista de todos os usuários (paginada).
* `GET /{user_id}` `[Protegido - Perfil Próprio ou Admin]` - Retorna detalhes de um usuário específico.
* `PUT /{user_id}` `[Protegido - Perfil Próprio ou Admin]` - Atualiza dados do usuário (nome, e-mail, senha).
* `DELETE /{user_id}` `[Protegido - Admin]` - Deleta um usuário do sistema.

---

## 📈 Planejamento de Desenvolvimento (Próximas Etapas)

* [x] **Etapa 1:** CRUD básico de Livros, Autores e Categorias com SQLite e testes integrados.
* [x] **Etapa 2:** Cadastro de Leitores/Membros da biblioteca.
* [x] **Etapa 3:** Autenticação JWT e proteção de rotas administrativas.
* [ ] **Etapa 4:** Registro, Devolução e Controle de Empréstimos de livros com atualização automática de estoque.
