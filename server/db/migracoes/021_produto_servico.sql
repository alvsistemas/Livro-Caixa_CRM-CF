-- Produto/serviço do contato: passa a começar vazio (antes começava na regra "Padrão" de 5%)
-- e ganha um "detalhe" livre (ex.: "2 aparelhos de 12 mil BTUs"), que não mexe na comissão.
-- Contatos que já existem continuam com o que tinham.
ALTER TABLE clientes ALTER COLUMN tipo_produto SET DEFAULT '';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS produto_detalhe text NOT NULL DEFAULT '';
