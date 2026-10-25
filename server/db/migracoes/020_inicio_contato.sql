-- Contatos criados antes de o "mês de início de contato" ser preenchido sozinho (ou vindos de
-- backups antigos) ficavam sem ele e sumiam do Pipeline no filtro do mês. Usa a data em que o
-- contato foi criado (no horário de Brasília).
UPDATE clientes
   SET mes_inicio_contato = to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')
 WHERE (mes_inicio_contato IS NULL OR mes_inicio_contato = '') AND created_at IS NOT NULL;
