from pydantic import BaseModel, ConfigDict, EmailStr
from typing import Optional

# Author Schemas
class AuthorBase(BaseModel):
    name: str
    biography: Optional[str] = None

class AuthorCreate(AuthorBase):
    pass

class AuthorUpdate(BaseModel):
    name: Optional[str] = None
    biography: Optional[str] = None

class AuthorResponse(AuthorBase):
    id: int
    
    model_config = ConfigDict(from_attributes=True)

# Category Schemas
class CategoryBase(BaseModel):
    name: str
    description: Optional[str] = None

class CategoryCreate(CategoryBase):
    pass

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class CategoryResponse(CategoryBase):
    id: int

    model_config = ConfigDict(from_attributes=True)

# Book Schemas
class BookBase(BaseModel):
    title: str
    isbn: Optional[str] = None
    published_year: Optional[int] = None
    quantity: int = 1

class BookCreate(BookBase):
    author_id: int
    category_id: int

class BookUpdate(BaseModel):
    title: Optional[str] = None
    isbn: Optional[str] = None
    published_year: Optional[int] = None
    quantity: Optional[int] = None
    author_id: Optional[int] = None
    category_id: Optional[int] = None

class BookResponse(BookBase):
    id: int
    author_id: int
    category_id: int

    model_config = ConfigDict(from_attributes=True)

# Detailed Book Response (Nested Author & Category)
class BookDetailResponse(BookResponse):
    author: AuthorResponse
    category: CategoryResponse

# User Schemas
class UserBase(BaseModel):
    name: str
    email: EmailStr
    role: Optional[str] = "reader"
    is_active: Optional[bool] = True

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None

class UserResponse(UserBase):
    id: int

    model_config = ConfigDict(from_attributes=True)
