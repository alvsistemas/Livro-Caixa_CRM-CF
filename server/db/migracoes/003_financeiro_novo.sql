-- Controle financeiro: listas novas (contas, transferências, dívidas, orçamentos,
-- categorias personalizadas) e comprovantes dos lançamentos.
--
-- As listas novas ficam numa tabela só (financeiro_itens), uma linha por item, separadas
-- pela coluna "secao". Os campos de cada item ficam em "dados" (jsonb). Os comprovantes
-- (fotos e PDFs) ficam em tabela própria, fora dessas listas, pra não pesar o salvamento.

CREATE TABLE IF NOT EXISTS financeiro_itens (
  user_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  secao text NOT NULL CHECK (secao IN ('contas', 'transferencias', 'dividas', 'orcamentos', 'categorias')),
  id text NOT NULL,
  posicao integer NOT NULL DEFAULT 0,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, secao, id)
);

CREATE TABLE IF NOT EXISTS financeiro_comprovantes (
  user_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lancamento_id text NOT NULL,
  nome text NOT NULL DEFAULT '',
  tipo text NOT NULL CHECK (tipo IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  tamanho integer NOT NULL DEFAULT 0,
  conteudo bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS financeiro_comprovantes_lancamento_idx ON financeiro_comprovantes (user_id, lancamento_id);

-- Mesma regra de todas as tabelas: cada pessoa só enxerga e grava as próprias linhas
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['financeiro_itens', 'financeiro_comprovantes'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'so_o_dono') THEN
      EXECUTE format('CREATE POLICY so_o_dono ON %I USING (app_pode_acessar(user_id)) WITH CHECK (app_pode_acessar(user_id))', t);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'livro_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON financeiro_itens, financeiro_comprovantes TO livro_app;
  END IF;
END $$;
