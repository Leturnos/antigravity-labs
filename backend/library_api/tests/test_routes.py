import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import get_db
from routes.authors import router as authors_router
from routes.categories import router as categories_router
from routes.books import router as books_router

import models
from security import get_current_active_user, check_admin_role

# Setup test app
app = FastAPI()
app.include_router(authors_router, prefix="/api/v1")
app.include_router(categories_router, prefix="/api/v1")
app.include_router(books_router, prefix="/api/v1")

@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    
    def mock_get_current_user():
        return models.User(id=1, email="admin@example.com", name="Admin User", role="admin", is_active=True)

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_active_user] = mock_get_current_user
    app.dependency_overrides[check_admin_role] = mock_get_current_user
    yield TestClient(app)
    app.dependency_overrides.clear()

def test_routes_workflow(client):
    # Test Create Author
    response = client.post("/api/v1/authors", json={"name": "George RR Martin", "biography": "ASOIAF"})
    assert response.status_code == 200
    author_id = response.json()["id"]
    
    # Test Create Category
    response = client.post("/api/v1/categories", json={"name": "Epic Fantasy", "description": "Dragons"})
    assert response.status_code == 200
    category_id = response.json()["id"]
    
    # Test Create Book
    response = client.post("/api/v1/books", json={
        "title": "A Game of Thrones",
        "isbn": "9780553103540",
        "published_year": 1996,
        "quantity": 10,
        "author_id": author_id,
        "category_id": category_id
    })
    assert response.status_code == 200
    assert response.json()["title"] == "A Game of Thrones"
    book_id = response.json()["id"]
    
    # Test Detail Book
    response = client.get(f"/api/v1/books/{book_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["author"]["name"] == "George RR Martin"
    assert data["category"]["name"] == "Epic Fantasy"
