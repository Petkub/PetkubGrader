"""Async Alembic env for SQLModel."""
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlmodel import SQLModel

import app.models  # noqa: F401  -- registers tables
from app.settings import settings

config = context.config
config.set_main_option(
    "sqlalchemy.url",
    settings.database_url.replace("+asyncpg", "+psycopg"),  # sync driver (psycopg3)
)
if config.config_file_name:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def include_name(name, type_, parent_names):
    # auth_* tables are owned by Next.js/Drizzle, not Alembic. Never touch them.
    if type_ == "table" and name is not None and name.startswith("auth_"):
        return False
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        include_name=include_name,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = AsyncEngine(
        engine_from_config(
            config.get_section(config.config_ini_section, {}),
            prefix="sqlalchemy.",
            poolclass=pool.NullPool,
            future=True,
        )
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    # alembic.ini sqlalchemy.url here is sync — use sync engine path.
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        do_run_migrations(connection)


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
