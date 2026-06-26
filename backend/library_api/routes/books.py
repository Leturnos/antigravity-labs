from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
import schemas
import crud

router = APIRouter(prefix="/books", tags=["Books"])

@router.post("/", response_model=schemas.BookResponse)
def create_book(book: schemas.BookCreate, db: Session = Depends(get_db)):
    db_author = crud.get_author(db, author_id=book.author_id)
    if not db_author:
        raise HTTPException(status_code=400, detail="Author does not exist")
    db_category = crud.get_category(db, category_id=book.category_id)
    if not db_category:
        raise HTTPException(status_code=400, detail="Category does not exist")
    
    if book.isbn:
        db_book = crud.get_book_by_isbn(db, isbn=book.isbn)
        if db_book:
            raise HTTPException(status_code=400, detail="Book with this ISBN already registered")
            
    return crud.create_book(db=db, book=book)

@router.get("/", response_model=List[schemas.BookResponse])
def read_books(
    skip: int = 0, 
    limit: int = 100, 
    title: Optional[str] = None, 
    author_id: Optional[int] = None, 
    category_id: Optional[int] = None, 
    db: Session = Depends(get_db)
):
    return crud.get_books(db, skip=skip, limit=limit, title=title, author_id=author_id, category_id=category_id)

@router.get("/{book_id}", response_model=schemas.BookDetailResponse)
def read_book(book_id: int, db: Session = Depends(get_db)):
    db_book = crud.get_book(db, book_id=book_id)
    if db_book is None:
        raise HTTPException(status_code=404, detail="Book not found")
    return db_book

@router.put("/{book_id}", response_model=schemas.BookResponse)
def update_book(book_id: int, book: schemas.BookUpdate, db: Session = Depends(get_db)):
    if book.author_id:
        db_author = crud.get_author(db, author_id=book.author_id)
        if not db_author:
            raise HTTPException(status_code=400, detail="Author does not exist")
    if book.category_id:
        db_category = crud.get_category(db, category_id=book.category_id)
        if not db_category:
            raise HTTPException(status_code=400, detail="Category does not exist")
            
    db_book = crud.update_book(db, book_id=book_id, book=book)
    if db_book is None:
        raise HTTPException(status_code=404, detail="Book not found")
    return db_book

@router.delete("/{book_id}")
def delete_book(book_id: int, db: Session = Depends(get_db)):
    success = crud.delete_book(db, book_id=book_id)
    if not success:
        raise HTTPException(status_code=404, detail="Book not found")
    return {"detail": "Book deleted successfully"}
