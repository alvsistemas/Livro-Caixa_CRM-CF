-- Papel (role) usado pela aplicação em TODAS as consultas.
-- No Neon, o usuário dono do banco (neondb_owner) pode ter o atributo BYPASSRLS, que faria o
-- PostgreSQL ignorar as políticas de segurança por linha. Por isso o servidor, a cada
-- transação, troca para este papel sem BYPASSRLS (SET LOCAL ROLE livro_app) — assim o
-- Row-Level Security vale sempre, não importa com que usuário a conexão foi aberta.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'livro_app') THEN
    CREATE ROLE livro_app NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
  -- quem conecta precisa poder "virar" livro_app (no PostgreSQL 16+ isso é a opção SET)
  IF current_setting('server_version_num')::int >= 160000 THEN
    IF NOT pg_has_role(current_user, 'livro_app', 'SET') THEN
      EXECUTE format('GRANT livro_app TO %I WITH SET TRUE, INHERIT FALSE', current_user);
    END IF;
  ELSIF NOT pg_has_role(current_user, 'livro_app', 'MEMBER') THEN
    EXECUTE format('GRANT livro_app TO %I', current_user);
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Sem permissão para criar o papel livro_app — o servidor usa o próprio usuário da conexão.';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'livro_app') THEN
    GRANT USAGE ON SCHEMA public TO livro_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO livro_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO livro_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO livro_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO livro_app;
  END IF;
END $$;
