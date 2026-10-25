/* Resumo do PDV para quem não está com o PDV aberto: assistente de IA, e-mail de resumo diário e
   os avisos de "caixa/mesa esquecidos". Usa as mesmas contas da tela (utils/estoque.js resumo). */
const { query } = require('../db/pool');
const E = require('./estoque');
const { hojeBR } = require('./fechamento');

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
// Quanto tempo aberto já é "esquecido": caixa de um dia para o outro (12 h) e mesa há mais de 6 h
const HORAS_CAIXA_ESQUECIDO = 12;
const HORAS_MESA_ESQUECIDA = 6;

function ontemDe(hoje) {
  const d = new Date(`${hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
const horasDesde = (quando, agora) => (agora.getTime() - new Date(quando).getTime()) / 3600000;

// Caixa e mesas abertos há tempo demais (para avisar no PDV, no Painel do dono e no e-mail)
async function esquecidos(userId, agora = new Date()) {
  const [cx, ms] = await Promise.all([
    query(`SELECT numero, aberto_em, aberto_por FROM estoque_caixas WHERE user_id = $1::uuid AND status = 'aberto'`, [userId]),
    query(`SELECT c.numero, c.rotulo, c.aberta_em, m.nome AS mesa FROM estoque_comandas c LEFT JOIN estoque_mesas m ON m.user_id = c.user_id AND m.id = c.mesa_id
            WHERE c.user_id = $1::uuid AND c.status IN ('aberta', 'conta') ORDER BY c.aberta_em`, [userId]),
  ]);
  const caixa = cx.rows[0] && horasDesde(cx.rows[0].aberto_em, agora) >= HORAS_CAIXA_ESQUECIDO
    ? { numero: cx.rows[0].numero, desde: cx.rows[0].aberto_em, abertoPor: cx.rows[0].aberto_por || '', horas: Math.floor(horasDesde(cx.rows[0].aberto_em, agora)) } : null;
  const mesas = ms.rows.filter((m) => horasDesde(m.aberta_em, agora) >= HORAS_MESA_ESQUECIDA)
    .map((m) => ({ nome: m.mesa || m.rotulo || `Comanda ${m.numero}`, desde: m.aberta_em, horas: Math.floor(horasDesde(m.aberta_em, agora)) }));
  return { caixa, mesas };
}

async function temPdv(userId) {
  const { rows } = await query('SELECT 1 FROM estoque_negocio WHERE user_id = $1::uuid', [userId]);
  return rows.length > 0;
}

async function resumoDoPdv(userId, agora = new Date()) {
  if (!(await temPdv(userId))) return { temPdv: false };
  const hoje = hojeBR(agora);
  const ontem = ontemDe(hoje);
  const [r, vOntem, cx, fiado, esq] = await Promise.all([
    E.resumo(userId, agora),
    query('SELECT count(*)::int AS n, COALESCE(sum(total),0) AS total FROM estoque_vendas WHERE user_id = $1::uuid AND NOT cancelada AND data = $2', [userId, ontem]),
    query(`SELECT numero, aberto_em, aberto_por FROM estoque_caixas WHERE user_id = $1::uuid AND status = 'aberto'`, [userId]),
    query('SELECT COALESCE(sum(fiado_aberto),0) AS total, count(DISTINCT cliente_id)::int AS clientes FROM estoque_vendas WHERE user_id = $1::uuid AND NOT cancelada AND fiado_aberto > 0', [userId]),
    esquecidos(userId, agora),
  ]);
  return {
    temPdv: true,
    hoje: r.hoje,
    ontem: { data: ontem, vendas: vOntem.rows[0].n, total: r2(vOntem.rows[0].total) },
    mes: { vendas: r.mes.vendas, total: r.mes.total, lucroBruto: r.mes.lucroBruto, ticketMedio: r.mes.vendas ? r2(r.mes.total / r.mes.vendas) : 0 },
    maisVendidos: r.maisVendidos.map((x) => ({ nome: x.nome, quantidade: x.qtd, total: x.total })),
    estoqueBaixo: { quantidade: r.alertas.length, itens: r.alertas.slice(0, 12).map((a) => ({ nome: a.nome, estoque: a.estoque, minimo: a.minimo, situacao: a.situacao === 'acabou' ? 'acabou' : 'baixo' })) },
    caixa: cx.rows[0] ? { aberto: true, numero: cx.rows[0].numero, desde: cx.rows[0].aberto_em, abertoPor: cx.rows[0].aberto_por || '' } : { aberto: false },
    esquecidos: esq,
    pedidosDoCardapioEsperando: r.pedidosNovos,
    fiadoEmAberto: { total: r2(fiado.rows[0].total), clientes: fiado.rows[0].clientes },
  };
}

module.exports = { resumoDoPdv, esquecidos, temPdv, HORAS_CAIXA_ESQUECIDO, HORAS_MESA_ESQUECIDA };
