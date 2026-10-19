-- Etapa 2 do fechamento da venda: custos e lucro por venda.
-- Cada regra de comissão escolhe sobre qual valor calcula:
--   'final'     = valor final do fechamento (com desconto) — padrão
--   'negociado' = valor do card (antes do desconto)
ALTER TABLE regras_comissao
  ADD COLUMN IF NOT EXISTS base text NOT NULL DEFAULT 'final' CHECK (base IN ('final', 'negociado'));
