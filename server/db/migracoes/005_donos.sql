-- Donos do sistema: quem pode abrir o Painel do dono (clientes, assinaturas e saúde do servidor).
-- Os donos fixos vêm da variável DONOS_EMAILS (não aparecem aqui e não podem ser removidos pelo
-- painel, pra ninguém se trancar fora). Esta tabela guarda os que foram adicionados pelo painel.
-- Só o sistema lê e grava: ninguém logado acessa direto.

CREATE TABLE IF NOT EXISTS donos (
  email text PRIMARY KEY,
  adicionado_por text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE donos ENABLE ROW LEVEL SECURITY;
ALTER TABLE donos FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'donos' AND policyname = 'so_sistema') THEN
    CREATE POLICY so_sistema ON donos FOR ALL
      USING (coalesce(current_setting('app.bypass', true), '') = 'on')
      WITH CHECK (coalesce(current_setting('app.bypass', true), '') = 'on');
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'livro_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON donos TO livro_app;
  END IF;
END $$;
