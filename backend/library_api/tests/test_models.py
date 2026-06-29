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


def test_loan_model_creation(db_session):
    from datetime import date, timedelta
    from models import Loan

    # Setup dependencies
    author = Author(name="Author Test")
    category = Category(name="Category Test")
    db_session.add(author)
    db_session.add(category)
    db_session.commit()
    
    book = Book(title="Book Test", author_id=author.id, category_id=category.id, quantity=5)
    user = User(name="User Test", email="test_loan@example.com", hashed_password="pwd", role="reader")
    db_session.add(book)
    db_session.add(user)
    db_session.commit()
    
    # Create Loan
    loan = Loan(
        user_id=user.id,
        book_id=book.id,
        loan_date=date.today(),
        due_date=date.today() + timedelta(days=14)
    )
    db_session.add(loan)
    db_session.commit()
    
    # Verify Relationships
    assert loan.id is not None
    assert loan.user.name == "User Test"
    assert loan.book.title == "Book Test"
