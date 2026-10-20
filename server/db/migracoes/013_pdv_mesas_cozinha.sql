-- PDV, fase 2 (restaurante): mesas, comandas, pedido pelo garçom e tela da cozinha.

-- operador "garçom": lança pedidos nas mesas, não cobra
ALTER TABLE estoque_operadores DROP CONSTRAINT IF EXISTS estoque_operadores_papel_check;
ALTER TABLE estoque_operadores ADD CONSTRAINT estoque_operadores_papel_check CHECK (papel IN ('caixa', 'gerente', 'garcom'));

-- produto que vai para a cozinha (bebida pronta não precisa)
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS cozinha boolean NOT NULL DEFAULT true;

ALTER TABLE estoque_negocio
  ADD COLUMN IF NOT EXISTS seq_comanda integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seq_cozinha integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS estoque_mesas (
  user_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (length(nome) BETWEEN 1 AND 30),
  posicao integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, id)
);

-- Comanda: a conta de uma mesa (ou avulsa: balcão, bar, "comanda 12")
CREATE TABLE IF NOT EXISTS estoque_comandas (
  user_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  numero integer NOT NULL,
  mesa_id uuid,
  rotulo text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'conta', 'fechada', 'cancelada')),
  pessoas integer NOT NULL DEFAULT 1 CHECK (pessoas BETWEEN 1 AND 99),
  cliente_id uuid,
  aberta_em timestamptz NOT NULL DEFAULT now(),
  aberta_por text NOT NULL DEFAULT '',
  fechada_em timestamptz,
  fechada_por text NOT NULL DEFAULT '',
  venda_id uuid,
  obs text NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, id)
);
-- uma comanda em aberto por mesa
CREATE UNIQUE INDEX IF NOT EXISTS estoque_comandas_mesa_aberta ON estoque_comandas (user_id, mesa_id) WHERE status IN ('aberta', 'conta') AND mesa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS estoque_comandas_abertas ON estoque_comandas (user_id) WHERE status IN ('aberta', 'conta');

CREATE TABLE IF NOT EXISTS estoque_comanda_itens (
  user_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  comanda_id uuid NOT NULL,
  produto_id uuid,
  variacao_id uuid,
  nome text NOT NULL,
  qtd numeric(12,3) NOT NULL CHECK (qtd > 0),
  unit numeric(12,2) NOT NULL CHECK (unit >= 0),
  opcoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  obs text NOT NULL DEFAULT '',
  cozinha boolean NOT NULL DEFAULT true,
  enviado_em timestamptz,          -- null = ainda não foi para a cozinha
  envio_id uuid,
  cancelado boolean NOT NULL DEFAULT false,
  cancelado_motivo text NOT NULL DEFAULT '',
  criado_por text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, comanda_id) REFERENCES estoque_comandas (user_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS estoque_comanda_itens_comanda ON estoque_comanda_itens (user_id, comanda_id, criado_em);

-- Tela da cozinha: cada envio é um "ticket" (de uma comanda ou de um pedido do cardápio)
CREATE TABLE IF NOT EXISTS estoque_cozinha (
  user_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  numero integer NOT NULL,
  comanda_id uuid,
  pedido_id uuid,
  origem text NOT NULL DEFAULT '',              -- "Mesa 4", "Pedido #12 · entrega"
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,       -- [{ nome, qtd, opcoes, obs, cancelado }]
  status text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'preparando', 'pronto', 'entregue')),
  operador text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL DEFAULT now(),
  inicio_em timestamptz,
  pronto_em timestamptz,
  entregue_em timestamptz,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS estoque_cozinha_ativos ON estoque_cozinha (user_id, criado_em) WHERE status <> 'entregue';

ALTER TABLE estoque_pedidos ADD COLUMN IF NOT EXISTS cozinha_id uuid;
ALTER TABLE estoque_vendas ADD COLUMN IF NOT EXISTS comanda_id uuid;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['estoque_mesas', 'estoque_comandas', 'estoque_comanda_itens', 'estoque_cozinha'] LOOP
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON estoque_mesas, estoque_comandas, estoque_comanda_itens, estoque_cozinha TO livro_app;
  END IF;
END $$;
