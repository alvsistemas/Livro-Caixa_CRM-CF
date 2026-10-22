-- Equipe com funções: gestor, gerente, vendedor, estoquista, caixa e garçom.
-- O funcionário entra no aparelho da loja (PIN) ou no próprio celular (código da loja + nome + PIN).

ALTER TABLE estoque_operadores DROP CONSTRAINT IF EXISTS estoque_operadores_papel_check;
ALTER TABLE estoque_operadores ADD CONSTRAINT estoque_operadores_papel_check
  CHECK (papel IN ('gestor', 'gerente', 'vendedor', 'estoquista', 'caixa', 'garcom'));
ALTER TABLE estoque_operadores
  -- ajustes por pessoa em cima da função: { "custos": true, "crm": false, ... }
  ADD COLUMN IF NOT EXISTS permissoes jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- muda quando o PIN, a função ou o "ativo" mudam: derruba os acessos abertos no celular
  ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_acesso timestamptz;

ALTER TABLE estoque_negocio
  -- código que o funcionário digita para entrar pelo próprio celular (único entre todas as contas)
  ADD COLUMN IF NOT EXISTS codigo_equipe text,
  -- opções da equipe: { "crmTodos": true }
  ADD COLUMN IF NOT EXISTS equipe jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS estoque_negocio_codigo_equipe ON estoque_negocio (codigo_equipe) WHERE codigo_equipe IS NOT NULL;

-- quem da equipe cadastrou o contato no CRM (para "o vendedor vê só os contatos dele")
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS responsavel_op_id uuid;
CREATE INDEX IF NOT EXISTS clientes_responsavel_op ON clientes (user_id, responsavel_op_id) WHERE responsavel_op_id IS NOT NULL;

-- o "gerente" de antes podia tudo no PDV (inclusive configurações e operadores): vira gestor
UPDATE estoque_operadores SET papel = 'gestor' WHERE papel = 'gerente';
