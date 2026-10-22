/* /api/gestao — o Painel do dono: um resumo do negócio e a equipe (funções, ajustes, código de acesso).
   Só o dono da conta (ou um funcionário com a função de gestor): o middleware de login exige a
   permissão "config" para qualquer caminho que não esteja mapeado, e este não está. */
const express = require('express');
const auth = require('../middleware/auth');
const A = require('../utils/acesso');
const C = require('../utils/caixa');
const { query } = require('../db/pool');
const { hojeBR } = require('../utils/fechamento');

const router = express.Router();
router.use(auth);

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

router.get('/', async (req, res) => {
  try {
    const u = req.userId;
    const hoje = hojeBR(); const mes = hoje.slice(0, 7); const inicioMes = `${mes}-01`;
    const [neg, ops, vHoje, vMes, porOp, caixa, crmNovos, crmGanhos, cancel, atividade, opcoes, codigo] = await Promise.all([
      query('SELECT nome, tipo FROM estoque_negocio WHERE user_id = $1::uuid', [u]),
      query('SELECT * FROM estoque_operadores WHERE user_id = $1::uuid ORDER BY ativo DESC, nome', [u]),
      query('SELECT count(*)::int AS n, COALESCE(sum(total),0) AS total FROM estoque_vendas WHERE user_id = $1::uuid AND NOT cancelada AND data = $2', [u, hoje]),
      query('SELECT count(*)::int AS n, COALESCE(sum(total),0) AS total, COALESCE(sum(total - cmv - taxa),0) AS lucro, COALESCE(sum(desconto),0) AS descontos FROM estoque_vendas WHERE user_id = $1::uuid AND NOT cancelada AND data >= $2', [u, inicioMes]),
      query(`SELECT operador, count(*)::int AS n, COALESCE(sum(total),0) AS total FROM estoque_vendas WHERE user_id = $1::uuid AND NOT cancelada AND data >= $2 GROUP BY operador`, [u, inicioMes]),
      query(`SELECT numero, aberto_por, aberto_em FROM estoque_caixas WHERE user_id = $1::uuid AND status = 'aberto'`, [u]),
      query('SELECT count(*)::int AS n FROM clientes WHERE user_id = $1::uuid AND created_at >= $2::date', [u, inicioMes]),
      query(`SELECT count(*)::int AS n, COALESCE(sum(c.valor),0) AS total FROM clientes c JOIN colunas k ON k.id = c.column_id
             WHERE c.user_id = $1::uuid AND k.tipo = 'ganho' AND c.mes LIKE $2`, [u, `${mes}%`]),
      query('SELECT count(*)::int AS n, COALESCE(sum(total),0) AS total FROM estoque_vendas WHERE user_id = $1::uuid AND cancelada AND data >= $2', [u, inicioMes]),
      query(`(SELECT 'cancelada' AS tipo, cancelada_em AS quando, numero, total AS valor, operador AS quem FROM estoque_vendas WHERE user_id = $1::uuid AND cancelada AND cancelada_em IS NOT NULL ORDER BY cancelada_em DESC LIMIT 6)
             UNION ALL (SELECT 'desconto', criado_em, numero, desconto, operador FROM estoque_vendas WHERE user_id = $1::uuid AND NOT cancelada AND desconto > 0 ORDER BY criado_em DESC LIMIT 6)
             UNION ALL (SELECT 'caixa', fechado_em, numero, diferenca, fechado_por FROM estoque_caixas WHERE user_id = $1::uuid AND status = 'fechado' AND diferenca <> 0 ORDER BY fechado_em DESC LIMIT 6)
             ORDER BY quando DESC LIMIT 10`, [u]),
      A.opcoesDaEquipe(u),
      A.codigoDaLoja(u),
    ]);
    const vendasPor = new Map(porOp.rows.map((r) => [r.operador, { vendas: r.n, total: r2(r.total) }]));
    const verCustos = !req.acesso || req.acesso.perm.custos;
    res.json({
      negocio: { nome: (neg.rows[0] && neg.rows[0].nome) || '', tipo: (neg.rows[0] && neg.rows[0].tipo) || '' },
      resumo: {
        hoje: { vendas: vHoje.rows[0].n, total: r2(vHoje.rows[0].total) },
        mes: { vendas: vMes.rows[0].n, total: r2(vMes.rows[0].total), ticket: vMes.rows[0].n ? r2(vMes.rows[0].total / vMes.rows[0].n) : 0, descontos: r2(vMes.rows[0].descontos), ...(verCustos ? { lucro: r2(vMes.rows[0].lucro) } : {}) },
        canceladas: { vendas: cancel.rows[0].n, total: r2(cancel.rows[0].total) },
        caixa: caixa.rows[0] ? { numero: caixa.rows[0].numero, abertoPor: caixa.rows[0].aberto_por || '', desde: caixa.rows[0].aberto_em } : null,
        crm: { novos: crmNovos.rows[0].n, ganhos: crmGanhos.rows[0].n, ganhosValor: r2(crmGanhos.rows[0].total) },
      },
      atividade: atividade.rows.map((r) => ({ tipo: r.tipo, quando: r.quando, numero: r.numero, valor: r2(r.valor), quem: r.quem || '' })),
      equipe: ops.rows.map((o) => ({
        ...C.operadorObj(o), funcao: A.NOME_PAPEL[o.papel] || o.papel, efetivas: A.permissoesDe(o),
        mes: vendasPor.get(o.nome) || { vendas: 0, total: 0 },
      })),
      semOperador: vendasPor.get('') || { vendas: 0, total: 0 },
      opcoes, codigo,
      funcoes: { papeis: A.PAPEIS.map((p) => ({ id: p, nome: A.NOME_PAPEL[p], padrao: A.PADRAO[p] })), permissoes: A.PERMISSOES },
      recursos: (req.assinatura && req.assinatura.recursos) || {},
    });
  } catch (err) {
    console.error('Painel do dono:', err.message);
    res.status(500).json({ error: 'Não foi possível carregar o painel. Tente de novo.' });
  }
});

router.put('/opcoes', async (req, res) => {
  try {
    const b = req.body || {};
    const atual = await A.opcoesDaEquipe(req.userId);
    const novo = { ...atual, ...(b.crmTodos !== undefined ? { crmTodos: !!b.crmTodos } : {}) };
    await query('INSERT INTO estoque_negocio (user_id) VALUES ($1::uuid) ON CONFLICT (user_id) DO NOTHING', [req.userId]);
    await query('UPDATE estoque_negocio SET equipe = $2::jsonb, updated_at = now() WHERE user_id = $1::uuid', [req.userId, JSON.stringify(novo)]);
    res.json({ opcoes: novo });
  } catch (err) { res.status(500).json({ error: 'Não foi possível salvar.' }); }
});

router.post('/codigo', async (req, res) => {
  try { res.json({ codigo: await A.codigoDaLoja(req.userId, { trocar: true }) }); }
  catch (err) { res.status(500).json({ error: 'Não foi possível gerar outro código.' }); }
});

module.exports = router;
