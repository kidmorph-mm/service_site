from __future__ import annotations

import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .db import get_db
from . import models, schemas
from .security import hash_password, verify_password, create_access_token, decode_token

router = APIRouter(prefix="/api/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

REQUIRE_AUTH = os.environ.get("KIDMORPH_REQUIRE_AUTH", "0") == "1"

def get_current_user_optional(db: Session = Depends(get_db), token: str | None = Depends(oauth2_scheme)):
    if not REQUIRE_AUTH:
        # 인증 강제 안 하면: 토큰 없어도 OK
        if not token:
            return None
    if not token:
        raise HTTPException(status_code=401, detail="missing_token")

    try:
        payload = decode_token(token)
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(status_code=401, detail="invalid_token")
        user = db.query(models.User).filter(models.User.username == sub).first()
        if not user:
            raise HTTPException(status_code=401, detail="user_not_found")
        return user
    except Exception:
        raise HTTPException(status_code=401, detail="invalid_token")

@router.post("/register", response_model=schemas.TokenOut)
def register(body: schemas.RegisterIn, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == body.email).first():
        raise HTTPException(status_code=400, detail="email_exists")
    if db.query(models.User).filter(models.User.username == body.username).first():
        raise HTTPException(status_code=400, detail="username_exists")

    u = models.User(
        email=body.email,
        username=body.username,
        password_hash=hash_password(body.password),
    )
    db.add(u)
    db.commit()

    token = create_access_token(sub=u.username)
    return schemas.TokenOut(access_token=token)

@router.post("/login", response_model=schemas.TokenOut)
def login(body: schemas.LoginIn, db: Session = Depends(get_db)):
    q = db.query(models.User).filter(
        (models.User.email == body.emailOrUsername) | (models.User.username == body.emailOrUsername)
    )
    u = q.first()
    if not u or not verify_password(body.password, u.password_hash):
        raise HTTPException(status_code=401, detail="invalid_credentials")

    token = create_access_token(sub=u.username)
    return schemas.TokenOut(access_token=token)