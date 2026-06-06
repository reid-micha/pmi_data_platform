-- Runs once on a fresh Postgres volume (docker-entrypoint-initdb.d), connected
-- to POSTGRES_DB (= the pmi database). pmi-core's alembic 0001 also runs
-- `CREATE EXTENSION IF NOT EXISTS vector` so this is belt-and-suspenders, but
-- having it here means the extensions exist even before the first `migrate`.
CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector for embeddings
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- trigram search (keyword matching)
CREATE EXTENSION IF NOT EXISTS btree_gin;  -- composite indexes on ARRAY columns
