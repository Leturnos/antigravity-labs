import pytest
from sqlalchemy.orm import Session
from database import get_db

def test_get_db_yields_session():
    db_generator = get_db()
    db = next(db_generator)
    try:
        assert isinstance(db, Session)
    finally:
        db_generator.close()
