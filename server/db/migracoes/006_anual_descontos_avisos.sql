-- Plano anual, descontos (por pessoa e promoção para novos) e avisos por e-mail da assinatura.

ALTER TABLE assinaturas
  ADD COLUMN IF NOT EXISTS ciclo text NOT NULL DEFAULT 'mensal' CHECK (ciclo IN ('mensal', 'anual')),
  -- preço da tabela quando a pessoa assinou (mudar o preço depois não muda o de quem já assina)
  ADD COLUMN IF NOT EXISTS valor_contratado numeric(10,2),
  -- desconto em %: 0 = sem desconto
  ADD COLUMN IF NOT EXISTS desconto_percentual numeric(5,2) NOT NULL DEFAULT 0 CHECK (desconto_percentual >= 0 AND desconto_percentual <= 100),
  -- por quantos meses o desconto vale (NULL = para sempre); vira uma data quando a assinatura começa
  ADD COLUMN IF NOT EXISTS desconto_meses integer CHECK (desconto_meses IS NULL OR desconto_meses > 0),
  -- cobranças que vencem ANTES desta data têm desconto (NULL = sem fim)
  ADD COLUMN IF NOT EXISTS desconto_ate date,
  -- de onde veio: '' (nenhum) | 'pessoal' (dado pelo dono) | 'promocao' (promoção para novos)
  ADD COLUMN IF NOT EXISTS desconto_origem text NOT NULL DEFAULT '',
  -- período já pago numa assinatura anterior (troca de plano/ciclo, cancelou e voltou): nunca se perde
  ADD COLUMN IF NOT EXISTS pago_ate_base timestamptz,
  -- os avisos de cobrança do próprio Asaas foram desligados (o Livro-Caixa manda os seus)
  ADD COLUMN IF NOT EXISTS avisos_asaas_desligados boolean NOT NULL DEFAULT false;

-- Configurações do sistema que o dono muda pelo painel (ex.: promoção para novos clientes)
CREATE TABLE IF NOT EXISTS configuracoes_sistema (
  chave text PRIMARY KEY,
  valor jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- E-mails de assinatura já enviados (pra não mandar o mesmo aviso duas vezes)
CREATE TABLE IF NOT EXISTS assinatura_avisos (
  user_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  tipo text NOT NULL,
  referencia text NOT NULL,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tipo, referencia)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['configuracoes_sistema', 'assinatura_avisos'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'so_sistema') THEN
      EXECUTE format($p$CREATE POLICY so_sistema ON %I FOR ALL
        USING (coalesce(current_setting('app.bypass', true), '') = 'on')
        WITH CHECK (coalesce(current_setting('app.bypass', true), '') = 'on')$p$, t);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'livro_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON configuracoes_sistema, assinatura_avisos TO livro_app;
  END IF;
END $$;
