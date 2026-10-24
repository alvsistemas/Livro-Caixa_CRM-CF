-- Várias equipes por pessoa: cada linha é "fulano faz parte da equipe X, com tal papel".
-- usuarios.equipe_id / papel_equipe / supervisor_de_dados continuam existindo e passam a ser
-- o espelho da equipe ABERTA no momento (o que o chat, a gestão e as permissões usam).
-- Sem Row-Level Security, como usuarios e equipes: as rotas de equipe conferem quem pode o quê.
CREATE TABLE IF NOT EXISTS equipe_membros (
  user_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  equipe_id uuid NOT NULL REFERENCES equipes (id) ON DELETE CASCADE,
  papel text NOT NULL DEFAULT 'membro' CHECK (papel IN ('supervisor', 'membro')),
  supervisor_dados boolean NOT NULL DEFAULT false,
  entrou_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, equipe_id)
);
CREATE INDEX IF NOT EXISTS equipe_membros_equipe_idx ON equipe_membros (equipe_id);

-- quem já estava numa equipe continua nela
INSERT INTO equipe_membros (user_id, equipe_id, papel, supervisor_dados)
SELECT id, equipe_id, papel_equipe, coalesce(supervisor_de_dados, false)
  FROM usuarios WHERE equipe_id IS NOT NULL
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'livro_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON equipe_membros TO livro_app;
  END IF;
END $$;
