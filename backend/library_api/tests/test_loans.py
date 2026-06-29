import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import get_db
from routes.loans import router as loans_router
from routes.auth import router as auth_router
import crud
import schemas

app = FastAPI()
app.include_router(auth_router, prefix="/api/v1")
app.include_router(loans_router, prefix="/api/v1")


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


def test_loans_routing_workflow(client, db_session):
    # Setup entities
    author = crud.create_author(db_session, schemas.AuthorCreate(name="Tolkien"))
    category = crud.create_category(db_session, schemas.CategoryCreate(name="Adventure"))
    book = crud.create_book(db_session, schemas.BookCreate(
        title="The Hobbit", isbn="9999", author_id=author.id, category_id=category.id, quantity=2
    ))
    
    # Register 3 users
    admin_in = schemas.UserCreate(name="Admin User", email="admin_loan@example.com", password="password", role="admin")
    reader_a_in = schemas.UserCreate(name="Alice", email="alice_loan@example.com", password="password", role="reader")
    reader_b_in = schemas.UserCreate(name="Bob", email="bob_loan@example.com", password="password", role="reader")
    
    crud.create_user(db_session, admin_in)
    db_alice = crud.create_user(db_session, reader_a_in)
    db_bob = crud.create_user(db_session, reader_b_in)
    
    # Get Auth Tokens
    token_admin = client.post("/api/v1/auth/login", data={"username": "admin_loan@example.com", "password": "password"}).json()["access_token"]
    token_alice = client.post("/api/v1/auth/login", data={"username": "alice_loan@example.com", "password": "password"}).json()["access_token"]
    
    headers_admin = {"Authorization": f"Bearer {token_admin}"}
    headers_alice = {"Authorization": f"Bearer {token_alice}"}
    
    # 1. Test creation permissions
    # Alice (reader) trying to create a loan -> Should fail (403)
    res = client.post("/api/v1/loans/", json={"user_id": db_alice.id, "book_id": book.id}, headers=headers_alice)
    assert res.status_code == 403
    
    # Admin creates loan for Alice -> Success (200)
    res = client.post("/api/v1/loans/", json={"user_id": db_alice.id, "book_id": book.id}, headers=headers_admin)
    assert res.status_code == 200
    loan_alice_id = res.json()["id"]
    
    # Admin creates loan for Bob -> Success (200)
    res = client.post("/api/v1/loans/", json={"user_id": db_bob.id, "book_id": book.id}, headers=headers_admin)
    assert res.status_code == 200
    loan_bob_id = res.json()["id"]
    
    # 2. Test isolation of GET lists
    # Alice fetches list -> Sees only 1 loan (Alice's own loan)
    res = client.get("/api/v1/loans/", headers=headers_alice)
    assert res.status_code == 200
    assert len(res.json()) == 1
    assert res.json()[0]["user_id"] == db_alice.id
    
    # Admin fetches list -> Sees all loans (2 loans)
    res = client.get("/api/v1/loans/", headers=headers_admin)
    assert res.status_code == 200
    assert len(res.json()) >= 2
    
    # 3. Test detail endpoint isolation
    # Alice views Alice's loan -> Success
    res = client.get(f"/api/v1/loans/{loan_alice_id}", headers=headers_alice)
    assert res.status_code == 200
    
    # Alice views Bob's loan -> Forbidden (403)
    res = client.get(f"/api/v1/loans/{loan_bob_id}", headers=headers_alice)
    assert res.status_code == 403
    
    # Admin views Bob's loan -> Success (200)
    res = client.get(f"/api/v1/loans/{loan_bob_id}", headers=headers_admin)
    assert res.status_code == 200
    
    # 4. Test Return/Finishing
    # Alice trying to return Bob's book -> Forbidden (403)
    res = client.post(f"/api/v1/loans/{loan_bob_id}/return", headers=headers_alice)
    assert res.status_code == 403
    
    # Admin returns Bob's book -> Success (200)
    res = client.post(f"/api/v1/loans/{loan_bob_id}/return", headers=headers_admin)
    assert res.status_code == 200
