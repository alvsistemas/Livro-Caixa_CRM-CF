-- Assinatura paga (Asaas): uma linha por pessoa com o plano e até quando o acesso está pago.
--
-- Quem decide o que está pago é SEMPRE o Asaas: o servidor só grava aqui o que o Asaas
-- confirmou (pelo webhook ou consultando a API). A pessoa logada pode LER a própria linha,
-- mas nunca gravar: toda gravação roda como "sistema" (app.bypass), depois das conferências.

CREATE TABLE IF NOT EXISTS assinaturas (
  user_id uuid PRIMARY KEY REFERENCES usuarios (id) ON DELETE CASCADE,
  -- plano escolhido: essencial | completo
  plano text NOT NULL DEFAULT 'completo' CHECK (plano IN ('essencial', 'completo')),
  -- teste: no período grátis | aguardando: assinou e a 1ª cobrança não foi paga |
  -- ativa: pagando | atrasada: cobrança venceu | cancelada: cancelou (vale até pago_ate) |
  -- cortesia: liberada à mão, sem cobrança
  status text NOT NULL DEFAULT 'teste' CHECK (status IN ('teste', 'aguardando', 'ativa', 'atrasada', 'cancelada', 'cortesia')),
  teste_ate timestamptz NOT NULL,
  pago_ate timestamptz,
  asaas_cliente_id text,
  asaas_assinatura_id text UNIQUE,
  proximo_vencimento date,
  ultimo_link_pagamento text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Cada aviso do Asaas (webhook) tem um id. Guardar o id evita processar o mesmo aviso
-- duas vezes (o Asaas pode reenviar). Tabela só do sistema: ninguém logado lê ou grava.
CREATE TABLE IF NOT EXISTS assinatura_eventos (
  id text PRIMARY KEY,
  tipo text NOT NULL,
  user_id uuid REFERENCES usuarios (id) ON DELETE SET NULL,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  recebido_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE assinaturas FORCE ROW LEVEL SECURITY;
ALTER TABLE assinatura_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE assinatura_eventos FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assinaturas' AND policyname = 'dono_le') THEN
    CREATE POLICY dono_le ON assinaturas FOR SELECT USING (app_pode_acessar(user_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assinaturas' AND policyname = 'sistema_grava') THEN
    CREATE POLICY sistema_grava ON assinaturas FOR ALL
      USING (coalesce(current_setting('app.bypass', true), '') = 'on')
      WITH CHECK (coalesce(current_setting('app.bypass', true), '') = 'on');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'assinatura_eventos' AND policyname = 'so_sistema') THEN
    CREATE POLICY so_sistema ON assinatura_eventos FOR ALL
      USING (coalesce(current_setting('app.bypass', true), '') = 'on')
      WITH CHECK (coalesce(current_setting('app.bypass', true), '') = 'on');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'livro_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON assinaturas, assinatura_eventos TO livro_app;
  END IF;
END $$;
