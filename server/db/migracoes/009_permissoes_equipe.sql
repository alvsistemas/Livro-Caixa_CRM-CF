-- Permissões da equipe: quais abas e funções os membros (não gestores) podem usar.
-- {} = tudo liberado (como era antes). Ver server/utils/permissoes.js.
ALTER TABLE equipes ADD COLUMN IF NOT EXISTS permissoes jsonb NOT NULL DEFAULT '{}'::jsonb;
