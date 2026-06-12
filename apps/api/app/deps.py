from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Role, User, UserStatus
from app.settings import settings


async def require_internal_key(
    x_internal_key: Annotated[str | None, Header(alias="X-Internal-Key")] = None,
) -> None:
    """Next.js BFF must include shared secret on every call."""
    if not x_internal_key or x_internal_key != settings.api_internal_key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad internal key")


async def current_user_unverified(
    x_user_id: Annotated[str | None, Header(alias="X-User-Id")] = None,
    session: AsyncSession = Depends(get_session),
    _: None = Depends(require_internal_key),
) -> User:
    """Resolve the user WITHOUT the approved-gate. For status/onboarding endpoints."""
    if not x_user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing user id")
    try:
        uid = UUID(x_user_id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "bad user id") from e
    user = await session.get(User, uid)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found")
    return user


async def current_user(user: User = Depends(current_user_unverified)) -> User:
    """Approved-only user. Blocks pending/banned accounts."""
    if user.status != UserStatus.approved:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "account pending approval")
    return user


async def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin only")
    return user


async def require_setter(user: User = Depends(current_user)) -> User:
    if user.role not in (Role.admin, Role.setter):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "setter or admin only")
    return user
