-- PDV, fase 1: caixa do dia (abertura, sangria, reforço, despesa paga do caixa, fechamento com
-- conferência), pagamento dividido com troco, fiado como conta do cliente e operadores com PIN.

-- Operadores do caixa (funcionários). O dono da conta é sempre gerente.
CREATE TABLE IF NOT EXISTS estoque_operadores (
  user_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (length(nome) BETWEEN 1 AND 60),
  pin_hash text NOT NULL,
  papel text NOT NULL DEFAULT 'caixa' CHECK (papel IN ('caixa', 'gerente')),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

-- Uma sessão de caixa (do abrir ao fechar)
CREATE TABLE IF NOT EXISTS estoque_caixas (
  user_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  numero integer NOT NULL,
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'fechado')),
  troco_inicial numeric(12,2) NOT NULL DEFAULT 0 CHECK (troco_inicial >= 0),
  aberto_em timestamptz NOT NULL DEFAULT now(),
  aberto_por text NOT NULL DEFAULT '',
  fechado_em timestamptz,
  fechado_por text NOT NULL DEFAULT '',
  esperado jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { dinheiro: 0, pix: 0, ... } calculado no fechamento
  contado jsonb NOT NULL DEFAULT '{}'::jsonb,    -- o que a pessoa contou
  diferenca numeric(12,2) NOT NULL DEFAULT 0,    -- no dinheiro: contado − esperado
  obs text NOT NULL DEFAULT '',
  lancamento_ids text[] NOT NULL DEFAULT '{}',   -- quebra ou sobra de caixa no financeiro
  PRIMARY KEY (user_id, id)
);
-- só um caixa aberto por conta
CREATE UNIQUE INDEX IF NOT EXISTS estoque_caixas_um_aberto ON estoque_caixas (user_id) WHERE status = 'aberto';

-- Movimentos do caixa que não são venda
CREATE TABLE IF NOT EXISTS estoque_caixa_mov (
  user_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  caixa_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('sangria', 'reforco', 'despesa', 'fiado')),
  meio text NOT NULL DEFAULT 'dinheiro',
  valor numeric(12,2) NOT NULL CHECK (valor > 0),
  descricao text NOT NULL DEFAULT '',
  operador text NOT NULL DEFAULT '',
  ref text,                                      -- lançamento/cliente ligado
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, caixa_id) REFERENCES estoque_caixas (user_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS estoque_caixa_mov_caixa ON estoque_caixa_mov (user_id, caixa_id, criado_em);

ALTER TABLE estoque_vendas
  ADD COLUMN IF NOT EXISTS caixa_id uuid,
  ADD COLUMN IF NOT EXISTS operador text NOT NULL DEFAULT '',
  -- [{ meio, valor }] (valor líquido: o dinheiro já sem o troco)
  ADD COLUMN IF NOT EXISTS pagamentos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recebido numeric(12,2) NOT NULL DEFAULT 0,  -- o que o cliente entregou em dinheiro
  ADD COLUMN IF NOT EXISTS troco numeric(12,2) NOT NULL DEFAULT 0,
  -- fiado: quanto desta venda ainda falta o cliente pagar
  ADD COLUMN IF NOT EXISTS fiado_aberto numeric(12,2) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS estoque_vendas_caixa ON estoque_vendas (user_id, caixa_id) WHERE caixa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS estoque_vendas_fiado ON estoque_vendas (user_id, cliente_id) WHERE fiado_aberto > 0;

-- vendas antigas: o pagamento era um meio só
UPDATE estoque_vendas SET pagamentos = jsonb_build_array(jsonb_build_object('meio', meio, 'valor', total))
 WHERE pagamentos = '[]'::jsonb;
UPDATE estoque_vendas SET fiado_aberto = total WHERE meio = 'fiado' AND NOT cancelada AND fiado_aberto = 0;

ALTER TABLE estoque_negocio
  -- { exigirCaixa, exigirOperador, descontoMaxCaixa (%), recibo: { rodape } }
  ADD COLUMN IF NOT EXISTS pdv jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS seq_caixa integer NOT NULL DEFAULT 0;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['estoque_operadores', 'estoque_caixas', 'estoque_caixa_mov'] LOOP
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON estoque_operadores, estoque_caixas, estoque_caixa_mov TO livro_app;
  END IF;
END $$;
