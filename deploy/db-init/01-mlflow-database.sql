-- MLflow keeps its tracking + Prompt Registry schema in its own database so its
-- alembic migrations never collide with pmi-core's. Created here on first boot;
-- MLflow server runs `db upgrade` against it on startup.
SELECT 'CREATE DATABASE mlflow'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'mlflow')\gexec
