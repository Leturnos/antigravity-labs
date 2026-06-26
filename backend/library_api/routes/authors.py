from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from database import get_db
import schemas
import crud

router = APIRouter(prefix="/authors", tags=["Authors"])

@router.post("/", response_model=schemas.AuthorResponse)
def create_author(author: schemas.AuthorCreate, db: Session = Depends(get_db)):
    return crud.create_author(db=db, author=author)

@router.get("/", response_model=List[schemas.AuthorResponse])
def read_authors(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_authors(db, skip=skip, limit=limit)

@router.get("/{author_id}", response_model=schemas.AuthorResponse)
def read_author(author_id: int, db: Session = Depends(get_db)):
    db_author = crud.get_author(db, author_id=author_id)
    if db_author is None:
        raise HTTPException(status_code=404, detail="Author not found")
    return db_author

@router.put("/{author_id}", response_model=schemas.AuthorResponse)
def update_author(author_id: int, author: schemas.AuthorUpdate, db: Session = Depends(get_db)):
    db_author = crud.update_author(db, author_id=author_id, author=author)
    if db_author is None:
        raise HTTPException(status_code=404, detail="Author not found")
    return db_author

@router.delete("/{author_id}")
def delete_author(author_id: int, db: Session = Depends(get_db)):
    db_author = crud.get_author(db, author_id)
    if not db_author:
        raise HTTPException(status_code=404, detail="Author not found")
    if db_author.books:
        raise HTTPException(
            status_code=400, 
            detail="Cannot delete author with books associated to them. Please delete the books first."
        )
    crud.delete_author(db, author_id=author_id)
    return {"detail": "Author deleted successfully"}
