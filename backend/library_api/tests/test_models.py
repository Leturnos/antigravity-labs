from models import Author, Category, Book, User

def test_create_and_link_models(db_session):
    # Create Author
    author = Author(name="J.K. Rowling", biography="British author")
    db_session.add(author)
    db_session.commit()
    
    # Create Category
    category = Category(name="Fantasy", description="Magic and dragons")
    db_session.add(category)
    db_session.commit()
    
    # Create Book
    book = Book(
        title="Harry Potter and the Philosopher's Stone",
        isbn="9780747532699",
        published_year=1997,
        quantity=3,
        author_id=author.id,
        category_id=category.id
    )
    db_session.add(book)
    db_session.commit()
    
    # Verify relations
    assert book.author.name == "J.K. Rowling"
    assert book.category.name == "Fantasy"
    assert author.books[0].title == "Harry Potter and the Philosopher's Stone"
    assert category.books[0].title == "Harry Potter and the Philosopher's Stone"

def test_create_user_model(db_session):
    user = User(
        name="John Doe",
        email="john@example.com",
        hashed_password="fakehashedpassword",
        role="reader",
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    
    db_user = db_session.query(User).filter(User.email == "john@example.com").first()
    assert db_user is not None
    assert db_user.name == "John Doe"
    assert db_user.role == "reader"
    assert db_user.is_active is True
