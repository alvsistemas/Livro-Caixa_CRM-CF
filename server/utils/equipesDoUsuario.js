/* Várias equipes por pessoa.
   A tabela equipe_membros é a fonte da verdade (quem está em qual equipe e com que papel).
   usuarios.equipe_id / papel_equipe / supervisor_de_dados são o espelho da equipe ABERTA —
   é o que o chat, a gestão, as permissões e o resto do sistema já liam, então continuam iguais.
   O funil de cada pessoa é um só; trocar de equipe só muda chat, gestão e monitoramento. */
const { query, transacao } = require('../db/pool');
const User = require('../models/User');

const LIMITE_EQUIPES = 10;
const id = (v) => (v == null ? null : String(v));

async function membroDe(equipeId, userId) {
  if (!equipeId || !userId) return null;
  const { rows } = await query('SELECT papel, supervisor_dados FROM equipe_membros WHERE equipe_id = $1 AND user_id = $2', [id(equipeId), id(userId)]);
  return rows[0] ? { papel: rows[0].papel, supervisorDeDados: rows[0].supervisor_dados } : null;
}

// Pessoas da equipe (documentos de User, com papel e supervisorDeDados DESSA equipe).
// Só para leitura: quem muda papel usa definirPapel/definirSupervisorDados.
async function membrosDe(equipeId) {
  if (!equipeId) return [];
  const { rows } = await query('SELECT user_id, papel, supervisor_dados FROM equipe_membros WHERE equipe_id = $1 ORDER BY entrou_em', [id(equipeId)]);
  if (!rows.length) return [];
  const users = await User.find({ _id: { $in: rows.map((r) => r.user_id) } });
  const porId = new Map(users.map((u) => [String(u._id), u]));
  return rows.filter((r) => porId.has(String(r.user_id))).map((r) => {
    const u = porId.get(String(r.user_id));
    u.papelEquipe = r.papel;
    u.supervisorDeDados = r.supervisor_dados;
    return u;
  });
}

// Uma pessoa específica, se for da equipe (com o papel dela nessa equipe)
async function membroComoUser(equipeId, userId) {
  const m = await membroDe(equipeId, userId);
  if (!m) return null;
  const u = await User.findById(userId);
  if (!u) return null;
  u.papelEquipe = m.papel;
  u.supervisorDeDados = m.supervisorDeDados;
  return u;
}

// Todas as equipes da pessoa, para a lista "Minhas equipes"
async function equipesDe(userId) {
  const { rows } = await query(
    `SELECT e.id, e.nome, m.papel, m.supervisor_dados,
            (SELECT count(*)::int FROM equipe_membros x WHERE x.equipe_id = e.id) AS membros
       FROM equipe_membros m JOIN equipes e ON e.id = m.equipe_id
      WHERE m.user_id = $1 ORDER BY m.entrou_em`, [id(userId)]);
  return rows.map((r) => ({ id: String(r.id), nome: r.nome, papel: r.papel, supervisorDeDados: r.supervisor_dados, membros: r.membros }));
}

async function quantasEquipes(userId) {
  const { rows } = await query('SELECT count(*)::int AS n FROM equipe_membros WHERE user_id = $1', [id(userId)]);
  return rows[0].n;
}

// Copia o papel da equipe aberta para o usuário (o espelho). equipeId null = nenhuma aberta.
async function espelhar(userId, equipeId) {
  const m = equipeId ? await membroDe(equipeId, userId) : null;
  if (!m) {
    await query("UPDATE usuarios SET equipe_id = NULL, papel_equipe = 'membro', supervisor_de_dados = false WHERE id = $1", [id(userId)]);
    return null;
  }
  await query('UPDATE usuarios SET equipe_id = $2, papel_equipe = $3, supervisor_de_dados = $4 WHERE id = $1', [id(userId), id(equipeId), m.papel, m.supervisorDeDados]);
  return m;
}

// Entra numa equipe (ou atualiza o papel, se já estiver) e já deixa ela aberta
async function entrar(userId, equipeId, papel = 'membro', supervisorDeDados = false) {
  return transacao(async () => {
    const ja = await membroDe(equipeId, userId);
    if (!ja && (await quantasEquipes(userId)) >= LIMITE_EQUIPES) {
      throw Object.assign(new Error(`Você pode fazer parte de até ${LIMITE_EQUIPES} equipes. Saia de alguma antes de entrar em outra.`), { status: 400 });
    }
    if (!ja) {
      await query('INSERT INTO equipe_membros (user_id, equipe_id, papel, supervisor_dados) VALUES ($1, $2, $3, $4)', [id(userId), id(equipeId), papel, !!supervisorDeDados]);
    }
    await espelhar(userId, equipeId);
    return { jaEstava: !!ja };
  });
}

// Troca a equipe aberta. false = a pessoa não faz parte dessa equipe.
async function abrir(userId, equipeId) {
  if (!(await membroDe(equipeId, userId))) return false;
  await espelhar(userId, equipeId);
  return true;
}

// Sai de uma equipe. Se era a aberta, abre a próxima (ou nenhuma).
async function sair(userId, equipeId) {
  return transacao(async () => {
    const { rowCount } = await query('DELETE FROM equipe_membros WHERE user_id = $1 AND equipe_id = $2', [id(userId), id(equipeId)]);
    const { rows } = await query('SELECT equipe_id FROM usuarios WHERE id = $1', [id(userId)]);
    if (rows[0] && id(rows[0].equipe_id) === id(equipeId)) {
      const prox = await query('SELECT equipe_id FROM equipe_membros WHERE user_id = $1 ORDER BY entrou_em LIMIT 1', [id(userId)]);
      await espelhar(userId, prox.rows[0] ? prox.rows[0].equipe_id : null);
    }
    return rowCount > 0;
  });
}

// Muda o papel de alguém numa equipe (e o espelho, se for a equipe aberta dessa pessoa)
async function atualizarMembro(equipeId, userId, campos) {
  const sets = [];
  const params = [id(equipeId), id(userId)];
  if (campos.papel) { params.push(campos.papel); sets.push(`papel = $${params.length}`); }
  if (campos.supervisorDeDados !== undefined) { params.push(!!campos.supervisorDeDados); sets.push(`supervisor_dados = $${params.length}`); }
  if (!sets.length) return false;
  const { rowCount } = await query(`UPDATE equipe_membros SET ${sets.join(', ')} WHERE equipe_id = $1 AND user_id = $2`, params);
  if (!rowCount) return false;
  const { rows } = await query('SELECT equipe_id FROM usuarios WHERE id = $1', [id(userId)]);
  if (rows[0] && id(rows[0].equipe_id) === id(equipeId)) await espelhar(userId, equipeId);
  return true;
}
const definirPapel = (equipeId, userId, papel) => atualizarMembro(equipeId, userId, { papel });
const definirSupervisorDados = (equipeId, userId, ativo) => atualizarMembro(equipeId, userId, { supervisorDeDados: !!ativo });

// Ninguém mais na equipe? (para apagar a equipe quando o último sai)
async function totalDeMembros(equipeId) {
  const { rows } = await query('SELECT count(*)::int AS n FROM equipe_membros WHERE equipe_id = $1', [id(equipeId)]);
  return rows[0].n;
}

module.exports = {
  LIMITE_EQUIPES, membroDe, membrosDe, membroComoUser, equipesDe, quantasEquipes,
  entrar, abrir, sair, definirPapel, definirSupervisorDados, totalDeMembros, espelhar,
};
