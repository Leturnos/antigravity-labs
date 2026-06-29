import pytest
from schemas import AuthorCreate, CategoryCreate, BookCreate, UserCreate, UserUpdate
import crud

def test_author_crud_operations(db_session):
    # Create
    author_in = AuthorCreate(name="George Orwell", biography="1984 writer")
    db_author = crud.create_author(db_session, author_in)
    assert db_author.id is not None
    assert db_author.name == "George Orwell"
    
    # Read list
    authors = crud.get_authors(db_session, skip=0, limit=10)
    assert len(authors) == 1
    
    # Read single
    author = crud.get_author(db_session, db_author.id)
    assert author.name == "George Orwell"

def test_category_crud_operations(db_session):
    category_in = CategoryCreate(name="Sci-Fi", description="Science Fiction")
    db_category = crud.create_category(db_session, category_in)
    assert db_category.id is not None
    
    db_category_by_name = crud.get_category_by_name(db_session, "Sci-Fi")
    assert db_category_by_name is not None
    
    categories = crud.get_categories(db_session)
    assert len(categories) == 1

def test_book_crud_operations(db_session):
    author_in = AuthorCreate(name="George Orwell")
    db_author = crud.create_author(db_session, author_in)
    
    category_in = CategoryCreate(name="Dystopian")
    db_category = crud.create_category(db_session, category_in)
    
    book_in = BookCreate(
        title="1984", 
        isbn="111111", 
        author_id=db_author.id, 
        category_id=db_category.id
    )
    db_book = crud.create_book(db_session, book_in)
    assert db_book.id is not None
    assert db_book.title == "1984"
    
    books = crud.get_books(db_session)
    assert len(books) == 1

def test_user_crud_operations(db_session):
    # Create
    user_in = UserCreate(name="Jane Doe", email="jane@example.com", password="mypassword", role="admin")
    db_user = crud.create_user(db_session, user_in)
    assert db_user.id is not None
    assert db_user.email == "jane@example.com"
    assert db_user.hashed_password != "mypassword" # Verify hashing
    
    # Read single by email
    user_by_email = crud.get_user_by_email(db_session, "jane@example.com")
    assert user_by_email.id == db_user.id
    
    # Update password and role
    old_hashed_password = db_user.hashed_password
    user_up = UserUpdate(password="newpassword", role="reader")
    updated_user = crud.update_user(db_session, db_user.id, user_up)
    assert updated_user.role == "reader"
    assert updated_user.hashed_password != old_hashed_password
