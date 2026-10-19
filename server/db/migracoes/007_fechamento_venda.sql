-- Fechamento da venda: quando um card vai pra coluna de ganho, a pessoa informa o valor
-- final (com desconto) e como vai receber. Isso vira lançamentos de verdade no
-- Controle financeiro (um por parcela), ligados ao card.

ALTER TABLE clientes
  -- { id, valorOriginal, valorFinal, desconto, descontoPct, forma, parcelas, entrada,
  --   primeiraData, meio, lancamentoIds, criadoEm, atualizadoEm }  (NULL = sem fechamento)
  ADD COLUMN IF NOT EXISTS fechamento jsonb,
  -- a pessoa clicou "Agora não": o card mostra o selo "falta o fechamento"
  ADD COLUMN IF NOT EXISTS fechamento_pendente boolean NOT NULL DEFAULT false;

-- lançamentos que vieram de um fechamento (pra achar rápido os de um card)
CREATE INDEX IF NOT EXISTS financeiro_lancamentos_crm_idx
  ON financeiro_lancamentos (user_id, ((extras->'crmFechamento'->>'clienteId')))
  WHERE extras ? 'crmFechamento';
