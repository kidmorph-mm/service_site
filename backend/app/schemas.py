from __future__ import annotations
from pydantic import BaseModel
from typing import Optional, List, Any, Dict

class ArtifactItem(BaseModel):
    id: str
    kind: str
    label: str
    url: str

class JobItem(BaseModel):
    id: str
    title: str
    pipelineType: str
    presetId: str
    status: str
    progress: float
    message: str
    createdAt: str
    updatedAt: str
    input: Dict[str, Any]
    artifacts: List[ArtifactItem] = []

class JobsList(BaseModel):
    items: List[JobItem]

class RegisterIn(BaseModel):
    email: str
    username: str
    password: str

class LoginIn(BaseModel):
    emailOrUsername: str
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"