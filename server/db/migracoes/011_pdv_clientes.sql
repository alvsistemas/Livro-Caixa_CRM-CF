-- PDV: clientes (histórico), programa de fidelidade (cartão fidelidade OU cashback).
-- O cliente é reconhecido pelo telefone (só números), sem login.

CREATE TABLE IF NOT EXISTS estoque_clientes (
  user_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL DEFAULT '' CHECK (length(nome) <= 80),
  telefone text NOT NULL DEFAULT '' CHECK (telefone ~ '^[0-9]{0,13}$'),
  endereco text NOT NULL DEFAULT '' CHECK (length(endereco) <= 200),
  obs text NOT NULL DEFAULT '' CHECK (length(obs) <= 300),
  -- aceitou participar do programa de fidelidade (LGPD: no cardápio é a caixinha marcada)
  participa boolean NOT NULL DEFAULT false,
  selos integer NOT NULL DEFAULT 0 CHECK (selos >= 0),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
-- um telefone por cliente em cada negócio (sem telefone pode repetir)
CREATE UNIQUE INDEX IF NOT EXISTS estoque_clientes_telefone ON estoque_clientes (user_id, telefone) WHERE telefone <> '';

-- Cashback ganho: cada linha é um crédito, que vai sendo usado do mais antigo para o mais novo
CREATE TABLE IF NOT EXISTS estoque_cashback (
  user_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  venda_id uuid,                 -- NULL = ajuste manual
  valor numeric(12,2) NOT NULL CHECK (valor > 0),
  restante numeric(12,2) NOT NULL CHECK (restante >= 0),
  expira_em date,                -- NULL = não expira
  obs text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, cliente_id) REFERENCES estoque_clientes (user_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS estoque_cashback_cliente ON estoque_cashback (user_id, cliente_id, criado_em);

ALTER TABLE estoque_negocio
  -- { modelo: 'nenhum'|'selos'|'cashback', cashbackPct, validadeDias, minimoUso,
  --   selosMeta, selosMinimo, premioTexto, premioValor }
  ADD COLUMN IF NOT EXISTS fidelidade jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE estoque_vendas
  ADD COLUMN IF NOT EXISTS cliente_id uuid,
  ADD COLUMN IF NOT EXISTS cashback_usado numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cashback_ganho numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS premio_valor numeric(12,2) NOT NULL DEFAULT 0,  -- desconto do prêmio do cartão fidelidade
  ADD COLUMN IF NOT EXISTS selos_ganhos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selos_usados integer NOT NULL DEFAULT 0,
  -- de quais créditos saiu o cashback usado: [{ id, valor }] (pra devolver se cancelar)
  ADD COLUMN IF NOT EXISTS cashback_consumo jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS estoque_vendas_cliente ON estoque_vendas (user_id, cliente_id) WHERE cliente_id IS NOT NULL;

ALTER TABLE estoque_pedidos
  ADD COLUMN IF NOT EXISTS cliente_id uuid,
  ADD COLUMN IF NOT EXISTS quer_beneficio boolean NOT NULL DEFAULT false;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['estoque_clientes', 'estoque_cashback'] LOOP
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON estoque_clientes, estoque_cashback TO livro_app;
  END IF;
END $$;
