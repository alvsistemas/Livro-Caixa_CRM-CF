-- PDV, fase 3: entrada de compras pelo XML da NF-e do fornecedor.

-- a nota que gerou a compra (não deixa importar a mesma nota duas vezes)
ALTER TABLE estoque_compras
  ADD COLUMN IF NOT EXISTS nfe_chave text,
  ADD COLUMN IF NOT EXISTS nfe_numero text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS estoque_compras_nfe ON estoque_compras (user_id, nfe_chave) WHERE nfe_chave IS NOT NULL AND NOT cancelada;

-- "o código X deste fornecedor é o meu produto Y": na próxima nota já vem ligado
CREATE TABLE IF NOT EXISTS estoque_nfe_mapa (
  user_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  cnpj text NOT NULL,
  codigo text NOT NULL,           -- cProd do fornecedor
  produto_id uuid NOT NULL,
  variacao_id uuid,
  fator numeric(12,3) NOT NULL DEFAULT 1 CHECK (fator > 0), -- 1 CX do fornecedor = fator unidades minhas
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, cnpj, codigo)
);

ALTER TABLE estoque_nfe_mapa ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_nfe_mapa FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'estoque_nfe_mapa' AND policyname = 'so_o_dono') THEN
    CREATE POLICY so_o_dono ON estoque_nfe_mapa USING (app_pode_acessar(user_id)) WITH CHECK (app_pode_acessar(user_id));
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'livro_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON estoque_nfe_mapa TO livro_app;
  END IF;
END $$;
