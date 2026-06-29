import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import get_db
from routes.users import router as users_router

import models
from security import get_current_active_user, check_admin_role

app = FastAPI()
app.include_router(users_router, prefix="/api/v1")

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

def test_user_routes_workflow(client):
    # Test Create
    response = client.post("/api/v1/users", json={
        "name": "Bob Martin",
        "email": "bob@example.com",
        "password": "bobsecretpassword",
        "role": "reader"
    })
    assert response.status_code == 200
    assert response.json()["email"] == "bob@example.com"
    user_id = response.json()["id"]
    
    # Test Duplicate Email Error
    response = client.post("/api/v1/users", json={
        "name": "Another Bob",
        "email": "bob@example.com",
        "password": "bobsecretpassword"
    })
    assert response.status_code == 400
    
    # Test Get List
    response = client.get("/api/v1/users")
    assert response.status_code == 200
    assert len(response.json()) == 1
    
    # Test Get Single
    response = client.get(f"/api/v1/users/{user_id}")
    assert response.status_code == 200
    assert response.json()["name"] == "Bob Martin"
    
    # Test Update
    response = client.put(f"/api/v1/users/{user_id}", json={"name": "Uncle Bob"})
    assert response.status_code == 200
    assert response.json()["name"] == "Uncle Bob"
    
    # Test Delete
    response = client.delete(f"/api/v1/users/{user_id}")
    assert response.status_code == 200
    
    response = client.get(f"/api/v1/users/{user_id}")
    assert response.status_code == 404
