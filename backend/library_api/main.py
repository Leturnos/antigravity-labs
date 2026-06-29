from fastapi import FastAPI
from database import engine, Base
from routes.authors import router as authors_router
from routes.categories import router as categories_router
from routes.books import router as books_router
from routes.users import router as users_router
from routes.auth import router as auth_router
from routes.loans import router as loans_router

# Create Database tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Library API",
    description="API for managing books, authors, categories, users, and loans",
    version="1.0.0"
)

# Root/Health check
@app.get("/api/v1/health", tags=["System"])
def health_check():
    return {"status": "healthy", "service": "Library API"}

# Include Routers
app.include_router(auth_router, prefix="/api/v1")
app.include_router(authors_router, prefix="/api/v1")
app.include_router(categories_router, prefix="/api/v1")
app.include_router(books_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(loans_router, prefix="/api/v1")
