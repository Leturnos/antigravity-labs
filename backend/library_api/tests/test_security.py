import pytest
from security import get_password_hash, verify_password

def test_password_hashing():
    plain_password = "mysecretpassword"
    hashed = get_password_hash(plain_password)
    
    assert hashed != plain_password
    assert verify_password(plain_password, hashed) is True
    assert verify_password("wrongpassword", hashed) is False
