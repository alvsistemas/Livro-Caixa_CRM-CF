-- Lixeira de produtos: excluir não apaga na hora. O produto fica escondido e pode ser restaurado
-- por 60 dias (com estoque, variações e histórico); depois disso é apagado de vez.
ALTER TABLE estoque_produtos
  ADD COLUMN IF NOT EXISTS excluido_em timestamptz,
  ADD COLUMN IF NOT EXISTS excluido_por text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS estoque_produtos_lixeira ON estoque_produtos (user_id, excluido_em) WHERE excluido_em IS NOT NULL;
