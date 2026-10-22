-- E-mails do CRM (Configurações → Integrações → E-mail): resumo diário e tarefas por e-mail.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS resumo_diario_email boolean NOT NULL DEFAULT false,
  -- AAAA-MM-DD do último resumo enviado (evita mandar duas vezes no mesmo dia)
  ADD COLUMN IF NOT EXISTS resumo_diario_ultimo text,
  ADD COLUMN IF NOT EXISTS email_tarefas boolean NOT NULL DEFAULT false;
ALTER TABLE tarefas
  ADD COLUMN IF NOT EXISTS lembrete_email_enviado boolean NOT NULL DEFAULT false;
