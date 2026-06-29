import pytest
from datetime import timedelta
import jwt
from fastapi import FastAPI
from fastapi.testclient import TestClient
from security import create_access_token, SECRET_KEY, ALGORITHM
from database import get_db
from routes.auth import router as auth_router
from routes.books import router as books_router
from routes.authors import router as authors_router
from routes.categories import router as categories_router
from routes.users import router as users_router
import crud
from schemas import UserCreate

app = FastAPI()
app.include_router(auth_router, prefix="/api/v1")

@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()

def test_create_access_token():
    data = {"sub": "test@example.com", "role": "admin"}
    token = create_access_token(data=data, expires_delta=timedelta(minutes=10))
    
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    assert payload["sub"] == "test@example.com"
    assert payload["role"] == "admin"
    assert "exp" in payload

def test_login_workflow(client, db_session):
    # Register a user
    user_in = UserCreate(name="Alice", email="alice@example.com", password="alicepassword", role="admin")
    crud.create_user(db_session, user_in)
    
    # Successful Login
    response = client.post("/api/v1/auth/login", data={"username": "alice@example.com", "password": "alicepassword"})
    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    assert "access_token" in response.json()
    
    # Failed Login - Wrong Password
    response = client.post("/api/v1/auth/login", data={"username": "alice@example.com", "password": "wrongpassword"})
    assert response.status_code == 400



# Setup comprehensive test app
full_app = FastAPI()
full_app.include_router(auth_router, prefix="/api/v1")
full_app.include_router(books_router, prefix="/api/v1")
full_app.include_router(authors_router, prefix="/api/v1")
full_app.include_router(categories_router, prefix="/api/v1")
full_app.include_router(users_router, prefix="/api/v1")

@pytest.fixture(scope="function")
def full_client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    full_app.dependency_overrides[get_db] = override_get_db
    yield TestClient(full_app)
    full_app.dependency_overrides.clear()

def test_catalog_rbac_workflow(full_client, db_session):
    # Register two users: one admin and one reader
    admin_in = UserCreate(name="Admin", email="admin@example.com", password="adminpassword", role="admin")
    reader_in = UserCreate(name="Reader", email="reader@example.com", password="readerpassword", role="reader")
    crud.create_user(db_session, admin_in)
    crud.create_user(db_session, reader_in)
    
    # 1. Login to get tokens
    admin_token = full_client.post("/api/v1/auth/login", data={"username": "admin@example.com", "password": "adminpassword"}).json()["access_token"]
    reader_token = full_client.post("/api/v1/auth/login", data={"username": "reader@example.com", "password": "readerpassword"}).json()["access_token"]
    
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    reader_headers = {"Authorization": f"Bearer {reader_token}"}
    
    # 2. Test Author Creation
    # Unauthenticated post should fail (401)
    res = full_client.post("/api/v1/authors", json={"name": "George Orwell"})
    assert res.status_code == 401
    
    # Reader can create (Stage 2 requirements: suggest authors)
    res = full_client.post("/api/v1/authors", json={"name": "George Orwell"}, headers=reader_headers)
    assert res.status_code == 200
    author_id = res.json()["id"]
    
    # 3. Test Category Creation
    # Reader cannot create categories
    res = full_client.post("/api/v1/categories", json={"name": "Sci-Fi"}, headers=reader_headers)
    assert res.status_code == 403
    
    # Admin can create categories
    res = full_client.post("/api/v1/categories", json={"name": "Sci-Fi"}, headers=admin_headers)
    assert res.status_code == 200
    category_id = res.json()["id"]
    
    # 4. Test Book Creation
    # Reader can create/suggest books
    res = full_client.post("/api/v1/books", json={
        "title": "1984",
        "isbn": "9780451524935",
        "author_id": author_id,
        "category_id": category_id
    }, headers=reader_headers)
    assert res.status_code == 200
    book_id = res.json()["id"]
    
    # 5. Test Book Deletion
    # Reader cannot delete book
    res = full_client.delete(f"/api/v1/books/{book_id}", headers=reader_headers)
    assert res.status_code == 403
    
    # Admin can delete book
    res = full_client.delete(f"/api/v1/books/{book_id}", headers=admin_headers)
    assert res.status_code == 200

def test_user_profile_isolation(full_client, db_session):
    # Register readers and admin
    admin_in = UserCreate(name="Admin", email="admin_user@example.com", password="password", role="admin")
    reader_a = UserCreate(name="Reader A", email="a@example.com", password="password", role="reader")
    reader_b = UserCreate(name="Reader B", email="b@example.com", password="password", role="reader")
    
    crud.create_user(db_session, admin_in)
    db_a = crud.create_user(db_session, reader_a)
    db_b = crud.create_user(db_session, reader_b)
    
    # Logins
    token_a = full_client.post("/api/v1/auth/login", data={"username": "a@example.com", "password": "password"}).json()["access_token"]
    token_admin = full_client.post("/api/v1/auth/login", data={"username": "admin_user@example.com", "password": "password"}).json()["access_token"]
    
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_admin = {"Authorization": f"Bearer {token_admin}"}
    
    # 1. Test List (Admin Only)
    res = full_client.get("/api/v1/users", headers=headers_a)
    assert res.status_code == 403 # Reader Banned
    
    res = full_client.get("/api/v1/users", headers=headers_admin)
    assert res.status_code == 200
    assert len(res.json()) >= 3
    
    # 2. Test Get Detail (Self or Admin)
    # Reader A fetching Reader A profile -> Success
    res = full_client.get(f"/api/v1/users/{db_a.id}", headers=headers_a)
    assert res.status_code == 200
    
    # Reader A fetching Reader B profile -> Forbidden
    res = full_client.get(f"/api/v1/users/{db_b.id}", headers=headers_a)
    assert res.status_code == 403
    
    # Admin fetching Reader B profile -> Success
    res = full_client.get(f"/api/v1/users/{db_b.id}", headers=headers_admin)
    assert res.status_code == 200
    
    # 3. Test Delete (Admin Only)
    # Reader A deleting Reader A profile -> Forbidden (only admins delete)
    res = full_client.delete(f"/api/v1/users/{db_a.id}", headers=headers_a)
    assert res.status_code == 403
    
    # Admin deleting Reader A -> Success
    res = full_client.delete(f"/api/v1/users/{db_a.id}", headers=headers_admin)
    assert res.status_code == 200
