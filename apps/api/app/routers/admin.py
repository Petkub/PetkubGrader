from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.db import get_session
from app.deps import require_admin
from app.models import AuditLog, Role, User, UserStatus

router = APIRouter(prefix="/admin", tags=["admin"])


class UserListOut(BaseModel):
    id: UUID
    email: str
    name: str
    role: Role
    status: UserStatus
    created_at: datetime


@router.get("/users", response_model=list[UserListOut])
async def list_users(
    status: UserStatus | None = Query(default=None),
    _admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> list[User]:
    stmt = select(User)
    if status is not None:
        stmt = stmt.where(User.status == status)
    return list((await session.exec(stmt.order_by(User.created_at.desc()))).all())


@router.get("/users/pending", response_model=list[UserListOut])
async def list_pending(
    _admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> list[User]:
    return list(
        (await session.exec(select(User).where(User.status == UserStatus.pending))).all()
    )


@router.post("/users/{user_id}/approve", response_model=UserListOut)
async def approve_user(
    user_id: UUID,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> User:
    u = await session.get(User, user_id)
    if u is None:
        raise HTTPException(404, "user not found")
    u.status = UserStatus.approved
    u.approved_at = datetime.now(tz=timezone.utc)
    u.approved_by_id = admin.id
    session.add(AuditLog(actor_id=admin.id, action="user.approve", target_kind="user", target_id=str(u.id)))
    await session.commit()
    await session.refresh(u)
    return u


@router.post("/users/{user_id}/ban", response_model=UserListOut)
async def ban_user(
    user_id: UUID,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> User:
    u = await session.get(User, user_id)
    if u is None:
        raise HTTPException(404, "user not found")
    if u.id == admin.id:
        raise HTTPException(400, "cannot ban yourself")
    u.status = UserStatus.banned
    session.add(AuditLog(actor_id=admin.id, action="user.ban", target_kind="user", target_id=str(u.id)))
    await session.commit()
    await session.refresh(u)
    return u


@router.post("/users/{user_id}/role/{role}", response_model=UserListOut)
async def set_role(
    user_id: UUID,
    role: Role,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> User:
    u = await session.get(User, user_id)
    if u is None:
        raise HTTPException(404, "user not found")
    u.role = role
    session.add(AuditLog(actor_id=admin.id, action="user.set_role", target_kind="user", target_id=str(u.id), meta={"role": role.value}))
    await session.commit()
    await session.refresh(u)
    return u
