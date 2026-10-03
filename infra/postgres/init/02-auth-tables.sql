-- Auth.js (Drizzle adapter) tables — mirrors apps/web/src/db/schema.ts.
-- Runs automatically on first DB init; `make auth-tables` re-applies it on an
-- existing DB. Idempotent. Alembic skips auth_* tables, so this is their only
-- source of DDL besides drizzle-kit.
CREATE TABLE IF NOT EXISTS auth_users (
    id              text PRIMARY KEY,
    name            text,
    email           text UNIQUE,
    "emailVerified" timestamp,
    image           text
);

CREATE TABLE IF NOT EXISTS auth_accounts (
    "userId"            text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    type                text NOT NULL,
    provider            text NOT NULL,
    "providerAccountId" text NOT NULL,
    refresh_token       text,
    access_token        text,
    expires_at          integer,
    token_type          text,
    scope               text,
    id_token            text,
    session_state       text,
    PRIMARY KEY (provider, "providerAccountId")
);

CREATE TABLE IF NOT EXISTS auth_verification_tokens (
    identifier text NOT NULL,
    token      text NOT NULL,
    expires    timestamp NOT NULL,
    PRIMARY KEY (identifier, token)
);
