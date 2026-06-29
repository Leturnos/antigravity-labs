from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from security import get_current_active_user, check_admin_role
import schemas
import crud
import models

router = APIRouter(prefix="/loans", tags=["Loans"])


@router.post("/", response_model=schemas.LoanResponse)
def create_loan(
    loan: schemas.LoanCreate, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(check_admin_role)
):
    # Validate user exists
    db_user = crud.get_user(db, user_id=loan.user_id)
    if not db_user:
        raise HTTPException(status_code=400, detail="User not found")
        
    try:
        return crud.create_loan(db=db, loan=loan)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{loan_id}/return", response_model=schemas.LoanResponse)
def return_book_loan(
    loan_id: int, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(check_admin_role)
):
    try:
        return crud.return_loan(db=db, loan_id=loan_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=List[schemas.LoanResponse])
def read_loans(
    user_id: Optional[int] = None, 
    book_id: Optional[int] = None, 
    returned: Optional[bool] = None, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_active_user)
):
    # Enforcement of isolation: Readers can only see their own loans
    if current_user.role != "admin":
        user_id = current_user.id
        
    return crud.get_loans(db, user_id=user_id, book_id=book_id, returned=returned)


@router.get("/{loan_id}", response_model=schemas.LoanDetailResponse)
def read_loan_detail(
    loan_id: int, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_active_user)
):
    db_loan = crud.get_loan(db, loan_id=loan_id)
    if not db_loan:
        raise HTTPException(status_code=404, detail="Loan not found")
        
    # Enforce detail boundaries
    if current_user.role != "admin" and db_loan.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You can only view your own loan details."
        )
        
    return db_loan
