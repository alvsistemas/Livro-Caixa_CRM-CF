-- PDV, fase 4: nota fiscal ao consumidor (NFC-e, por um parceiro emissor) e vendas feitas sem internet.

-- configuração fiscal (o token do parceiro fica cifrado em coluna separada e nunca volta para a tela)
ALTER TABLE estoque_negocio
  ADD COLUMN IF NOT EXISTS fiscal jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS fiscal_token text;

-- dados fiscais do produto: { ncm, cfop, csosn, origem, cest }
ALTER TABLE estoque_produtos ADD COLUMN IF NOT EXISTS fiscal jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE estoque_vendas
  -- { status: processando|autorizada|erro|cancelada, ref, chave, numero, serie, danfe, xml, mensagem, ambiente, emitidaEm, cpf }
  ADD COLUMN IF NOT EXISTS nfce jsonb,
  -- venda feita sem internet: o aparelho manda um código próprio (não duplica se reenviar)
  ADD COLUMN IF NOT EXISTS ref_cliente text,
  ADD COLUMN IF NOT EXISTS offline boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS estoque_vendas_ref_cliente ON estoque_vendas (user_id, ref_cliente) WHERE ref_cliente IS NOT NULL;
