-- Caixa e Estoque: o terceiro aplicativo (opcional). Produtos com variações e estoque,
-- venda no balcão, compra de mercadoria e nota de gasto. Tudo que mexe em dinheiro vira
-- lançamento no Controle financeiro (extras.estoque = { origem, ... }).
-- Para restaurante: cardápio digital público (/c/<slug>) com pedido pelo WhatsApp.

-- Um por conta: o checklist do primeiro acesso e os dados do cardápio
CREATE TABLE IF NOT EXISTS estoque_negocio (
  user_id uuid PRIMARY KEY REFERENCES usuarios (id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'loja' CHECK (tipo IN ('restaurante', 'loja', 'servicos', 'outro')),
  nome text NOT NULL DEFAULT '' CHECK (length(nome) <= 80),
  controla_estoque boolean NOT NULL DEFAULT true,
  -- cardápio digital (só restaurante)
  slug text UNIQUE CHECK (slug IS NULL OR slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  cardapio_ativo boolean NOT NULL DEFAULT false,
  whatsapp text NOT NULL DEFAULT '',
  frase text NOT NULL DEFAULT '' CHECK (length(frase) <= 140),
  cor text NOT NULL DEFAULT '#2F5D46' CHECK (cor ~ '^#[0-9a-fA-F]{6}$'),
  horario text NOT NULL DEFAULT '' CHECK (length(horario) <= 80),
  aceita_retirada boolean NOT NULL DEFAULT true,
  aceita_entrega boolean NOT NULL DEFAULT true,
  taxa_entrega numeric(10,2) NOT NULL DEFAULT 0 CHECK (taxa_entrega >= 0),
  pedido_minimo numeric(10,2) NOT NULL DEFAULT 0 CHECK (pedido_minimo >= 0),
  categorias text[] NOT NULL DEFAULT '{}',
  seq_venda integer NOT NULL DEFAULT 0,
  seq_pedido integer NOT NULL DEFAULT 0,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS estoque_produtos (
  user_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (length(nome) BETWEEN 1 AND 80),
  categoria text NOT NULL DEFAULT '' CHECK (length(categoria) <= 60),
  descricao text NOT NULL DEFAULT '' CHECK (length(descricao) <= 400),
  codigo text NOT NULL DEFAULT '' CHECK (length(codigo) <= 40),
  unidade text NOT NULL DEFAULT 'un' CHECK (unidade IN ('un', 'kg', 'g', 'l', 'ml', 'm', 'cx', 'pct')),
  preco numeric(12,2) NOT NULL DEFAULT 0 CHECK (preco >= 0),
  custo numeric(12,4) NOT NULL DEFAULT 0 CHECK (custo >= 0),
  controla_estoque boolean NOT NULL DEFAULT true,
  estoque numeric(14,3) NOT NULL DEFAULT 0,
  estoque_minimo numeric(14,3) NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0),
  -- adicionais do cardápio: [{ nome, tipo: 'um'|'varios', escolhas: [{ nome, preco }] }]
  opcoes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(opcoes) = 'array'),
  no_cardapio boolean NOT NULL DEFAULT true,
  destaque boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  foto bytea,
  foto_tipo text,
  posicao integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

-- Produto com variações: o estoque, o custo e (se tiver) o preço ficam em cada variação
CREATE TABLE IF NOT EXISTS estoque_variacoes (
  user_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL,
  nome text NOT NULL CHECK (length(nome) BETWEEN 1 AND 60),
  codigo text NOT NULL DEFAULT '' CHECK (length(codigo) <= 40),
  preco numeric(12,2) CHECK (preco IS NULL OR preco >= 0), -- NULL = preço do produto
  custo numeric(12,4) CHECK (custo IS NULL OR custo >= 0),  -- NULL = custo do produto
  estoque numeric(14,3) NOT NULL DEFAULT 0,
  estoque_minimo numeric(14,3) NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0),
  ativo boolean NOT NULL DEFAULT true,
  posicao integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, produto_id) REFERENCES estoque_produtos (user_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS estoque_variacoes_produto ON estoque_variacoes (user_id, produto_id);

-- Toda mudança de estoque (entrada, venda, ajuste, perda, cancelamento)
CREATE TABLE IF NOT EXISTS estoque_movimentos (
  user_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  id bigserial,
  produto_id uuid NOT NULL,
  variacao_id uuid,
  tipo text NOT NULL CHECK (tipo IN ('inicial', 'compra', 'venda', 'ajuste', 'perda', 'cancelamento')),
  qtd numeric(14,3) NOT NULL,           -- com sinal: + entrou, - saiu
  saldo numeric(14,3) NOT NULL,         -- estoque depois do movimento
  custo_unit numeric(12,4),
  ref text,                             -- venda/compra que causou
  obs text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, produto_id) REFERENCES estoque_produtos (user_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS estoque_movimentos_produto ON estoque_movimentos (user_id, produto_id, criado_em DESC);

-- Vendas do balcão (e pedidos do cardápio confirmados)
CREATE TABLE IF NOT EXISTS estoque_vendas (
  user_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  numero integer NOT NULL,
  data date NOT NULL,
  -- [{ produtoId, variacaoId, nome, qtd, unit, custoUnit, opcoes: [texto] }]
  itens jsonb NOT NULL CHECK (jsonb_typeof(itens) = 'array'),
  subtotal numeric(12,2) NOT NULL,
  desconto numeric(12,2) NOT NULL DEFAULT 0,
  acrescimo numeric(12,2) NOT NULL DEFAULT 0, -- taxa de entrega
  total numeric(12,2) NOT NULL,
  cmv numeric(12,2) NOT NULL DEFAULT 0,
  taxa numeric(12,2) NOT NULL DEFAULT 0,      -- taxa da maquininha (vira despesa)
  meio text NOT NULL,
  cliente text NOT NULL DEFAULT '',
  obs text NOT NULL DEFAULT '',
  pedido_id uuid,
  lancamento_ids text[] NOT NULL DEFAULT '{}',
  cancelada boolean NOT NULL DEFAULT false,
  cancelada_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS estoque_vendas_data ON estoque_vendas (user_id, data DESC);

-- Compras de mercadoria (entrada no estoque + despesa)
CREATE TABLE IF NOT EXISTS estoque_compras (
  user_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  data date NOT NULL,
  fornecedor text NOT NULL DEFAULT '',
  itens jsonb NOT NULL CHECK (jsonb_typeof(itens) = 'array'), -- [{ produtoId, variacaoId, nome, qtd, custoUnit }]
  frete numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL,
  meio text NOT NULL,
  vencimento date,
  lancamento_ids text[] NOT NULL DEFAULT '{}',
  cancelada boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

-- Pedidos que chegaram pelo cardápio (o cliente manda pelo WhatsApp; aqui fica a lista)
CREATE TABLE IF NOT EXISTS estoque_pedidos (
  user_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  numero integer NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('retirada', 'entrega')),
  cliente_nome text NOT NULL DEFAULT '',
  cliente_tel text NOT NULL DEFAULT '',
  endereco text NOT NULL DEFAULT '',
  pagamento text NOT NULL DEFAULT '',
  obs text NOT NULL DEFAULT '',
  itens jsonb NOT NULL CHECK (jsonb_typeof(itens) = 'array'),
  subtotal numeric(12,2) NOT NULL,
  taxa_entrega numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'vendido', 'recusado')),
  venda_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS estoque_pedidos_status ON estoque_pedidos (user_id, status, criado_em DESC);

-- lançamentos do financeiro que vieram daqui
CREATE INDEX IF NOT EXISTS financeiro_lancamentos_estoque_idx
  ON financeiro_lancamentos (user_id, ((extras->'estoque'->>'origem')))
  WHERE extras ? 'estoque';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['estoque_negocio', 'estoque_produtos', 'estoque_variacoes', 'estoque_movimentos',
                           'estoque_vendas', 'estoque_compras', 'estoque_pedidos'] LOOP
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON estoque_negocio, estoque_produtos, estoque_variacoes, estoque_movimentos,
      estoque_vendas, estoque_compras, estoque_pedidos TO livro_app;
    GRANT USAGE, SELECT ON SEQUENCE estoque_movimentos_id_seq TO livro_app;
  END IF;
END $$;
