-- Livro-Caixa — esquema inicial do PostgreSQL
-- Cada tabela com user_id pertence a um usuário; as políticas de Row-Level Security (no fim
-- do arquivo) fazem o próprio banco recusar linhas de outro usuário.
-- Dinheiro usa numeric(14,2) (centavos exatos). Datas usam timestamptz.

-- User
CREATE TABLE usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL DEFAULT '',
  email text NOT NULL,
  senha_hash text,
  google_id text,
  google_calendar_access_token text,
  google_calendar_refresh_token text,
  google_calendar_expiry_date double precision,
  google_calendar_calendar_id text,
  whatsapp_business_phone_number_id text,
  whatsapp_business_access_token text,
  whatsapp_business_waba_id text,
  whatsapp_business_provedor text NOT NULL DEFAULT 'meta' CHECK (whatsapp_business_provedor IN ('meta', 'ycloud', 'twilio')),
  whatsapp_business_account_sid text,
  whatsapp_business_webhook_token text,
  whatsapp_business_webhook_secret text,
  whatsapp_business_agente_ia_ativo boolean NOT NULL DEFAULT false,
  whatsapp_business_ia_proativa_ativa boolean NOT NULL DEFAULT false,
  instagram_leads_page_id text,
  instagram_leads_page_access_token text,
  instagram_leads_ig_business_id text,
  menu_triagem_ativo boolean NOT NULL DEFAULT false,
  menu_triagem_mensagem_inicial text NOT NULL DEFAULT '',
  menu_triagem_opcoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  equipe_id uuid,
  papel_equipe text NOT NULL DEFAULT 'membro' CHECK (papel_equipe IN ('supervisor', 'membro')),
  supervisor_de_dados boolean NOT NULL DEFAULT false,
  agendamento_publico_ativo boolean NOT NULL DEFAULT false,
  agendamento_publico_hora_inicio text NOT NULL DEFAULT '08:00',
  agendamento_publico_hora_fim text NOT NULL DEFAULT '18:00',
  agendamento_publico_duracao_minutos integer NOT NULL DEFAULT 30,
  agendamento_publico_dias_semana integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  agendamento_publico_coluna_destino_id uuid,
  reset_senha_hash text,
  reset_senha_expira timestamptz,
  backup_automatico_ativo boolean NOT NULL DEFAULT false,
  backup_automatico_ultimo_envio timestamptz,
  token_version integer NOT NULL DEFAULT 0,
  ics_token text,
  avatar_url text,
  two_factor_secret text,
  two_factor_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Equipe
CREATE TABLE equipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  dono_id uuid NOT NULL,
  codigo_convite text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Funil
CREATE TABLE funis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL,
  ordem double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Column
CREATE TABLE colunas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  funil_id uuid,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'aberto' CHECK (tipo IN ('aberto', 'ganho', 'perdido')),
  probabilidade double precision NOT NULL DEFAULT 50,
  ordem double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Card
CREATE TABLE clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  column_id uuid NOT NULL,
  ordem double precision NOT NULL DEFAULT 0,
  cliente text NOT NULL,
  tipo_pessoa text NOT NULL DEFAULT 'fisica' CHECK (tipo_pessoa IN ('fisica', 'juridica')),
  cnpj text NOT NULL DEFAULT '',
  razao_social text NOT NULL DEFAULT '',
  inscricao_estadual text NOT NULL DEFAULT '',
  ramo_atividade text NOT NULL DEFAULT '',
  contato_nome text NOT NULL DEFAULT '',
  contato_cargo text NOT NULL DEFAULT '',
  valor numeric(14,2) NOT NULL DEFAULT 0,
  temperatura text NOT NULL DEFAULT 'morno' CHECK (temperatura IN ('quente', 'morno', 'frio')),
  telefone text NOT NULL DEFAULT '',
  telefone_normalizado text,
  instagram_id text,
  obs text NOT NULL DEFAULT '',
  tipo_produto text NOT NULL DEFAULT 'padrao',
  mes text NOT NULL DEFAULT '',
  mes_inicio_contato text NOT NULL DEFAULT '',
  coluna_desde timestamptz DEFAULT now(),
  automacoes_disparadas uuid[] NOT NULL DEFAULT '{}',
  sugestao_ia_texto text,
  sugestao_ia_tarefa_titulo text,
  sugestao_ia_tarefa_dias integer,
  sugestao_ia_gerada_em timestamptz,
  aguardando_menu_triagem boolean NOT NULL DEFAULT false,
  etiquetas text[] NOT NULL DEFAULT '{}',
  campos_personalizados jsonb NOT NULL DEFAULT '{}'::jsonb,
  arquivado boolean NOT NULL DEFAULT false,
  atribuido_por_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Task
CREATE TABLE tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  titulo text NOT NULL,
  vencimento timestamptz,
  prioridade text NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta')),
  lead_id uuid,
  descricao text NOT NULL DEFAULT '',
  concluida boolean NOT NULL DEFAULT false,
  google_event_id text,
  lembrete_push_enviado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Anexo
CREATE TABLE anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  card_id uuid NOT NULL,
  nome_arquivo text NOT NULL,
  tipo_mime text NOT NULL DEFAULT 'application/octet-stream',
  dados_base64 text NOT NULL,
  tamanho integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Message
CREATE TABLE mensagens_whatsapp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  card_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  canal text NOT NULL DEFAULT 'whatsapp' CHECK (canal IN ('whatsapp', 'instagram')),
  texto text NOT NULL DEFAULT '',
  status text,
  whatsapp_message_id text,
  instagram_message_id text,
  timestamp timestamptz DEFAULT now(),
  enviado_por_agente boolean NOT NULL DEFAULT false,
  anexo_id uuid,
  midia_tipo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Contrato
CREATE TABLE contratos_comissao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  card_id uuid,
  gerado_automaticamente boolean NOT NULL DEFAULT false,
  "desc" text NOT NULL,
  scope text NOT NULL DEFAULT 'Pessoal' CHECK (scope IN ('Pessoal', 'Empresa')),
  date timestamptz NOT NULL,
  valor_venda numeric(14,2) NOT NULL,
  tipo_produto text NOT NULL DEFAULT 'padrao',
  regra_nome text NOT NULL DEFAULT '',
  parcelas integer NOT NULL,
  parcelas1 integer NOT NULL,
  value numeric(14,2) NOT NULL,
  value2 numeric(14,2) NOT NULL,
  blocos jsonb,
  cancelado_no_mes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RegraComissao
CREATE TABLE regras_comissao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  chave text NOT NULL,
  nome text NOT NULL,
  blocos jsonb NOT NULL,
  mes_independente boolean NOT NULL DEFAULT false,
  padrao boolean NOT NULL DEFAULT false,
  ordem double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- HistoricoContato
CREATE TABLE historico_contato (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  card_id uuid NOT NULL,
  texto text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- MensagemAgendada
CREATE TABLE mensagens_agendadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  card_id uuid NOT NULL,
  texto text NOT NULL,
  agendado_para timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviada', 'cancelada', 'falhou')),
  erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Automacao
CREATE TABLE automacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL,
  coluna_gatilho_id uuid NOT NULL,
  gatilho_tipo text NOT NULL DEFAULT 'entrada_coluna' CHECK (gatilho_tipo IN ('entrada_coluna', 'tempo_parado')),
  acao_tipo text NOT NULL CHECK (acao_tipo IN ('criar_tarefa', 'mover_coluna')),
  acao_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Fluxo
CREATE TABLE fluxos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL,
  coluna_gatilho_id uuid NOT NULL,
  etapas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- FluxoExecucao
CREATE TABLE fluxo_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fluxo_id uuid NOT NULL,
  card_id uuid NOT NULL,
  etapa_atual integer NOT NULL DEFAULT 0,
  iniciado_em timestamptz DEFAULT now(),
  concluido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- CampoPersonalizado
CREATE TABLE campos_personalizados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto', 'numero', 'data')),
  ordem double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- PossivelLead
CREATE TABLE possiveis_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL DEFAULT '',
  telefone text NOT NULL DEFAULT '',
  tipo_servico text NOT NULL DEFAULT '',
  origem_arquivo text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- MetaVendas
CREATE TABLE metas_vendas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mes text NOT NULL,
  valor_meta numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- MetaVendasEquipe
CREATE TABLE metas_vendas_equipe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id uuid NOT NULL,
  mes text NOT NULL,
  valor_meta numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- EventoGoogleExtra
CREATE TABLE eventos_google_extra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_id text NOT NULL,
  prioridade text NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta')),
  lead_id uuid,
  concluida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- GerotBloco
CREATE TABLE rotina_blocos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  semana_inicio text NOT NULL,
  dia_semana integer NOT NULL,
  horario_inicio text NOT NULL,
  horario_fim text NOT NULL,
  texto text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- WebhookSaida
CREATE TABLE webhooks_saida (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL DEFAULT '',
  url text NOT NULL,
  eventos text[] NOT NULL DEFAULT '{}',
  ativo boolean NOT NULL DEFAULT true,
  secreto text NOT NULL,
  ultimo_envio_em timestamptz,
  ultimo_envio_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- PushSubscription
CREATE TABLE inscricoes_push (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  keys_p256dh text NOT NULL,
  keys_auth text NOT NULL,
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ChatMensagem
CREATE TABLE chat_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id uuid NOT NULL,
  remetente_id uuid NOT NULL,
  remetente_nome text NOT NULL DEFAULT '',
  destinatario_id uuid,
  texto text NOT NULL,
  timestamp timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- AuditLog
CREATE TABLE auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  acao text NOT NULL,
  detalhe text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ErrorLog
CREATE TABLE erros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem text NOT NULL,
  stack text NOT NULL DEFAULT '',
  rota text NOT NULL DEFAULT '',
  user_id uuid,
  tipo text NOT NULL DEFAULT 'rota' CHECK (tipo IN ('rota', 'excecao_nao_tratada', 'promise_rejeitada')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Controle financeiro (o antigo Livro-Caixa)
-- ---------------------------------------------------------------------------
CREATE TABLE financeiro_lancamentos (
  user_id uuid NOT NULL,
  id text NOT NULL,                 -- id gerado no navegador
  posicao integer NOT NULL DEFAULT 0, -- ordem na lista
  data date,
  descricao text NOT NULL DEFAULT '',
  tipo text NOT NULL DEFAULT 'Despesa' CHECK (tipo IN ('Receita', 'Despesa')),
  categoria text NOT NULL DEFAULT '',
  escopo text NOT NULL DEFAULT 'Pessoal' CHECK (escopo IN ('Pessoal', 'Empresa')),
  forma text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Pago',
  valor numeric(14,2) NOT NULL DEFAULT 0,
  recorrencia text NOT NULL DEFAULT 'unico' CHECK (recorrencia IN ('unico', 'fixo', 'parcelado')),
  parcelas integer,
  extras jsonb NOT NULL DEFAULT '{}'::jsonb, -- campos antigos/raros (ex.: comissões da versão anterior)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE financeiro_cartoes (
  user_id uuid NOT NULL,
  id text NOT NULL,
  posicao integer NOT NULL DEFAULT 0,
  nome text NOT NULL DEFAULT '',
  limite numeric(14,2) NOT NULL DEFAULT 0,
  dia_vencimento integer,
  melhor_dia integer,
  extras jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE financeiro_investimentos (
  user_id uuid NOT NULL,
  id text NOT NULL,
  posicao integer NOT NULL DEFAULT 0,
  nome text NOT NULL DEFAULT '',
  tipo text NOT NULL DEFAULT '',
  escopo text NOT NULL DEFAULT 'Pessoal' CHECK (escopo IN ('Pessoal', 'Empresa')),
  instituicao text NOT NULL DEFAULT '',
  data date,
  aplicado numeric(14,2) NOT NULL DEFAULT 0,
  atual numeric(14,2) NOT NULL DEFAULT 0,
  extras jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE financeiro_objetivos (
  user_id uuid NOT NULL,
  id text NOT NULL,
  posicao integer NOT NULL DEFAULT 0,
  nome text NOT NULL DEFAULT '',
  escopo text NOT NULL DEFAULT 'Pessoal' CHECK (escopo IN ('Pessoal', 'Empresa')),
  meta numeric(14,2) NOT NULL DEFAULT 0,
  atual numeric(14,2) NOT NULL DEFAULT 0,
  prazo date,
  extras jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE financeiro_perfis (
  user_id uuid PRIMARY KEY,
  perfil jsonb,                                -- nome, personagem, plano, foto
  config jsonb NOT NULL DEFAULT '{}'::jsonb,   -- ex.: como as vendas do CRM entram no financeiro
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Valores únicos
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX usuarios_email_unico ON usuarios (email);
CREATE UNIQUE INDEX usuarios_google_id_unico ON usuarios (google_id) WHERE google_id IS NOT NULL;
CREATE UNIQUE INDEX usuarios_ics_token_unico ON usuarios (ics_token) WHERE ics_token IS NOT NULL;
CREATE UNIQUE INDEX equipes_codigo_convite_unico ON equipes (codigo_convite);
CREATE UNIQUE INDEX regras_comissao_chave_unica ON regras_comissao (user_id, chave);
CREATE UNIQUE INDEX metas_vendas_mes_unico ON metas_vendas (user_id, mes);
CREATE UNIQUE INDEX metas_vendas_equipe_mes_unico ON metas_vendas_equipe (equipe_id, mes);
CREATE UNIQUE INDEX eventos_google_extra_unico ON eventos_google_extra (user_id, event_id);
CREATE UNIQUE INDEX inscricoes_push_endpoint_unico ON inscricoes_push (endpoint);

-- ---------------------------------------------------------------------------
-- Chaves estrangeiras (apagar um usuário apaga os dados dele)
-- ---------------------------------------------------------------------------
ALTER TABLE usuarios ADD FOREIGN KEY (equipe_id) REFERENCES equipes (id) ON DELETE SET NULL;
ALTER TABLE equipes ADD FOREIGN KEY (dono_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE funis ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE colunas ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE colunas ADD FOREIGN KEY (funil_id) REFERENCES funis (id) ON DELETE SET NULL;
ALTER TABLE clientes ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE clientes ADD FOREIGN KEY (column_id) REFERENCES colunas (id) ON DELETE CASCADE;
ALTER TABLE clientes ADD FOREIGN KEY (atribuido_por_id) REFERENCES usuarios (id) ON DELETE SET NULL;
ALTER TABLE tarefas ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE tarefas ADD FOREIGN KEY (lead_id) REFERENCES clientes (id) ON DELETE SET NULL;
ALTER TABLE anexos ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE anexos ADD FOREIGN KEY (card_id) REFERENCES clientes (id) ON DELETE CASCADE;
ALTER TABLE mensagens_whatsapp ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE mensagens_whatsapp ADD FOREIGN KEY (card_id) REFERENCES clientes (id) ON DELETE CASCADE;
ALTER TABLE mensagens_whatsapp ADD FOREIGN KEY (anexo_id) REFERENCES anexos (id) ON DELETE SET NULL;
ALTER TABLE contratos_comissao ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE contratos_comissao ADD FOREIGN KEY (card_id) REFERENCES clientes (id) ON DELETE SET NULL;
ALTER TABLE regras_comissao ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE historico_contato ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE historico_contato ADD FOREIGN KEY (card_id) REFERENCES clientes (id) ON DELETE CASCADE;
ALTER TABLE mensagens_agendadas ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE mensagens_agendadas ADD FOREIGN KEY (card_id) REFERENCES clientes (id) ON DELETE CASCADE;
ALTER TABLE automacoes ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE automacoes ADD FOREIGN KEY (coluna_gatilho_id) REFERENCES colunas (id) ON DELETE CASCADE;
ALTER TABLE fluxos ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE fluxos ADD FOREIGN KEY (coluna_gatilho_id) REFERENCES colunas (id) ON DELETE CASCADE;
ALTER TABLE fluxo_execucoes ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE fluxo_execucoes ADD FOREIGN KEY (fluxo_id) REFERENCES fluxos (id) ON DELETE CASCADE;
ALTER TABLE fluxo_execucoes ADD FOREIGN KEY (card_id) REFERENCES clientes (id) ON DELETE CASCADE;
ALTER TABLE campos_personalizados ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE possiveis_leads ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE metas_vendas ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE metas_vendas_equipe ADD FOREIGN KEY (equipe_id) REFERENCES equipes (id) ON DELETE CASCADE;
ALTER TABLE eventos_google_extra ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE eventos_google_extra ADD FOREIGN KEY (lead_id) REFERENCES clientes (id) ON DELETE SET NULL;
ALTER TABLE rotina_blocos ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE webhooks_saida ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE inscricoes_push ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE chat_mensagens ADD FOREIGN KEY (equipe_id) REFERENCES equipes (id) ON DELETE CASCADE;
ALTER TABLE chat_mensagens ADD FOREIGN KEY (remetente_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE chat_mensagens ADD FOREIGN KEY (destinatario_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE auditoria ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE erros ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE SET NULL;
ALTER TABLE financeiro_lancamentos ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE financeiro_cartoes ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE financeiro_investimentos ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE financeiro_objetivos ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;
ALTER TABLE financeiro_perfis ADD FOREIGN KEY (user_id) REFERENCES usuarios (id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Índices das buscas mais comuns
-- ---------------------------------------------------------------------------
CREATE INDEX funis_user_idx ON funis (user_id);
CREATE INDEX colunas_user_idx ON colunas (user_id, funil_id);
CREATE INDEX clientes_user_coluna_idx ON clientes (user_id, column_id);
CREATE INDEX clientes_coluna_idx ON clientes (column_id);
CREATE INDEX clientes_telefone_idx ON clientes (telefone_normalizado) WHERE telefone_normalizado IS NOT NULL;
CREATE INDEX clientes_instagram_idx ON clientes (instagram_id) WHERE instagram_id IS NOT NULL;
CREATE INDEX tarefas_user_idx ON tarefas (user_id, vencimento);
CREATE INDEX tarefas_lead_idx ON tarefas (lead_id);
CREATE INDEX anexos_card_idx ON anexos (card_id);
CREATE INDEX mensagens_card_idx ON mensagens_whatsapp (user_id, card_id, timestamp);
CREATE INDEX mensagens_wamid_idx ON mensagens_whatsapp (whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;
CREATE INDEX contratos_user_idx ON contratos_comissao (user_id);
CREATE INDEX contratos_card_idx ON contratos_comissao (card_id);
CREATE INDEX historico_card_idx ON historico_contato (user_id, card_id, created_at DESC);
CREATE INDEX mensagens_agendadas_status_idx ON mensagens_agendadas (status, agendado_para);
CREATE INDEX mensagens_agendadas_user_idx ON mensagens_agendadas (user_id);
CREATE INDEX automacoes_user_idx ON automacoes (user_id);
CREATE INDEX fluxos_user_idx ON fluxos (user_id);
CREATE INDEX fluxo_execucoes_idx ON fluxo_execucoes (user_id, concluido);
CREATE INDEX campos_personalizados_user_idx ON campos_personalizados (user_id);
CREATE INDEX possiveis_leads_user_idx ON possiveis_leads (user_id);
CREATE INDEX rotina_blocos_idx ON rotina_blocos (user_id, semana_inicio, dia_semana);
CREATE INDEX webhooks_saida_user_idx ON webhooks_saida (user_id);
CREATE INDEX inscricoes_push_user_idx ON inscricoes_push (user_id);
CREATE INDEX chat_mensagens_equipe_idx ON chat_mensagens (equipe_id, timestamp);
CREATE INDEX auditoria_user_idx ON auditoria (user_id, created_at DESC);
CREATE INDEX erros_criado_idx ON erros (created_at);
CREATE INDEX usuarios_equipe_idx ON usuarios (equipe_id);
CREATE INDEX usuarios_webhook_token_idx ON usuarios (whatsapp_business_webhook_token) WHERE whatsapp_business_webhook_token IS NOT NULL;
CREATE INDEX usuarios_page_id_idx ON usuarios (instagram_leads_page_id) WHERE instagram_leads_page_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Segurança por linha (Row-Level Security)
-- O servidor diz, em cada transação, quem está consultando:
--   app.user_id = usuário logado  |  app.bypass = 'on' (tarefas do sistema)
-- Sem uma das duas, nenhuma linha dessas tabelas aparece.
-- ---------------------------------------------------------------------------
CREATE FUNCTION app_pode_acessar(dono uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.bypass', true), '') = 'on'
      OR dono = nullif(current_setting('app.user_id', true), '')::uuid
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'funis', 'colunas', 'clientes', 'tarefas', 'anexos', 'mensagens_whatsapp', 'contratos_comissao',
    'regras_comissao', 'historico_contato', 'mensagens_agendadas', 'automacoes', 'fluxos',
    'fluxo_execucoes', 'campos_personalizados', 'possiveis_leads', 'metas_vendas',
    'eventos_google_extra', 'rotina_blocos', 'webhooks_saida', 'inscricoes_push', 'auditoria',
    'financeiro_lancamentos', 'financeiro_cartoes', 'financeiro_investimentos',
    'financeiro_objetivos', 'financeiro_perfis'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY so_o_dono ON %I USING (app_pode_acessar(user_id)) WITH CHECK (app_pode_acessar(user_id))', t);
  END LOOP;
END $$;
