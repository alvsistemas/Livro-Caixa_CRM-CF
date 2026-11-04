-- Caixa do PDV com horário de funcionamento ou turnos (24 horas).
--   turno          nome do turno (modo 24 horas), ex.: "Manhã"
--   previsto_fim   quando o horário/turno deste caixa termina (para avisar e, no horário de
--                  funcionamento, fechar sozinho)
--   aberto_auto    o sistema abriu sozinho
--   fechado_auto   o sistema fechou sozinho (ninguém contou a gaveta)
--   conferir       fechado sem contagem: falta conferir a gaveta
--   troco_conferir aberto sozinho com o troco que deveria estar na gaveta: falta contar
--   troco_de       o caixa (fechado sozinho) de onde veio esse troco
--   conferido_em / conferido_por   quando e quem conferiu depois
ALTER TABLE estoque_caixas ADD COLUMN IF NOT EXISTS turno text NOT NULL DEFAULT '';
ALTER TABLE estoque_caixas ADD COLUMN IF NOT EXISTS previsto_fim timestamptz;
ALTER TABLE estoque_caixas ADD COLUMN IF NOT EXISTS aberto_auto boolean NOT NULL DEFAULT false;
ALTER TABLE estoque_caixas ADD COLUMN IF NOT EXISTS fechado_auto boolean NOT NULL DEFAULT false;
ALTER TABLE estoque_caixas ADD COLUMN IF NOT EXISTS conferir boolean NOT NULL DEFAULT false;
ALTER TABLE estoque_caixas ADD COLUMN IF NOT EXISTS troco_conferir boolean NOT NULL DEFAULT false;
ALTER TABLE estoque_caixas ADD COLUMN IF NOT EXISTS troco_de uuid;
ALTER TABLE estoque_caixas ADD COLUMN IF NOT EXISTS conferido_em timestamptz;
ALTER TABLE estoque_caixas ADD COLUMN IF NOT EXISTS conferido_por text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS estoque_caixas_conferir ON estoque_caixas (user_id) WHERE conferir;
