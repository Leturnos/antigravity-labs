import pytest
from pydantic import ValidationError
from schemas import AuthorCreate, CategoryCreate, BookCreate, BookDetailResponse

def test_author_schema_validation():
    with pytest.raises(ValidationError):
        # Name is required
        AuthorCreate(biography="Bio without name")
        
    author = AuthorCreate(name="Tolkien", biography="Classic author")
    assert author.name == "Tolkien"

def test_book_detail_response_schema():
    author_data = {"id": 1, "name": "Tolkien", "biography": "Bio"}
    category_data = {"id": 1, "name": "Fantasy", "description": "F"}
    
    book_detail = BookDetailResponse(
        id=1,
        title="The Hobbit",
        isbn="12345",
        published_year=1937,
        quantity=5,
        author_id=1,
        category_id=1,
        author=author_data,
        category=category_data
    )
    assert book_detail.author.name == "Tolkien"
    assert book_detail.category.name == "Fantasy"
