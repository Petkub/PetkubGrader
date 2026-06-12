-- Enabled at first DB init.
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- fuzzy search
CREATE EXTENSION IF NOT EXISTS citext;      -- case-insensitive email
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- uuid_generate_v4()
