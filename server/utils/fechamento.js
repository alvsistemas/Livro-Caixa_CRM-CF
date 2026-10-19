/* Fechamento da venda: liga o card ganho do CRM ao Controle financeiro.
   A pessoa informa o valor final (com desconto) e como vai receber; cada parcela vira
   um lançamento de Receita de verdade no financeiro, marcado com extras.crmFechamento
   = { clienteId, fechamentoId, parcela, total, meio }. Refazer o fechamento troca os
   lançamentos antigos pelos novos (mantendo como "Pago" as parcelas já marcadas assim). */
const crypto = require('crypto');
const { query, transacao } = require('../db/pool');

const FORMAS = ['avista', 'parcelado', 'entrada'];
// como o cliente pagou -> forma de pagamento do lançamento no financeiro.
// Cartão da maquininha cai na conta do banco (no financeiro, "Cartão de Crédito" é o
// cartão da própria pessoa, usado pra despesas).
const MEIOS = {
  pix: { nome: 'Pix', conta: 'Pix' },
  dinheiro: { nome: 'Dinheiro', conta: 'Dinheiro' },
  credito: { nome: 'Cartão de crédito', conta: 'Conta Corrente' },
  debito: { nome: 'Cartão de débito', conta: 'Conta Corrente' },
  boleto: { nome: 'Boleto', conta: 'Boleto' },
  transferencia: { nome: 'Transferência', conta: 'Conta Corrente' },
  outro: { nome: 'Outro', conta: 'Conta Corrente' },
};
const MAX_PARCELAS = 48;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

class ErroFechamento extends Error {}
const erro = (m) => new ErroFechamento(m);
const centavos = (v) => Math.round(Number(v) * 100);

function dataValida(s) {
  if (typeof s !== 'string' || !DATA_RE.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// mesma data, n meses depois (dia 31 em mês de 30 dias vira o último dia do mês)
function somarMeses(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

// divide um total (em centavos) em n partes; a sobra dos centavos fica na primeira
function dividir(totalCent, n) {
  const base = Math.floor(totalCent / n);
  const partes = Array(n).fill(base);
  partes[0] += totalCent - base * n;
  return partes;
}

/* Confere o que veio da tela e devolve o fechamento normalizado (valores em reais).
   entrada: { valorFinal | descontoPct, forma, parcelas, entrada, primeiraData, meio, recebido } */
function normalizarFechamento(dados, valorOriginal) {
  if (!dados || typeof dados !== 'object') throw erro('Dados do fechamento inválidos.');
  const originalCent = Math.max(0, centavos(valorOriginal) || 0);

  let finalCent;
  let descontoPct = null;
  if (dados.descontoPct !== undefined && dados.descontoPct !== null && dados.descontoPct !== '') {
    descontoPct = Number(dados.descontoPct);
    if (!Number.isFinite(descontoPct) || descontoPct < 0 || descontoPct >= 100) throw erro('O desconto precisa ficar entre 0% e 99%.');
    if (!originalCent) throw erro('Esse cliente está sem valor. Informe o valor final em reais.');
    finalCent = Math.round(originalCent * (100 - descontoPct) / 100);
  } else {
    finalCent = centavos(dados.valorFinal);
    if (!Number.isFinite(finalCent)) throw erro('Informe o valor final da venda.');
  }
  if (finalCent <= 0) throw erro('O valor final precisa ser maior que zero.');
  if (finalCent > 100000000000) throw erro('Valor alto demais.');

  const forma = FORMAS.includes(dados.forma) ? dados.forma : null;
  if (!forma) throw erro('Escolha como o cliente vai pagar.');
  const meio = MEIOS[dados.meio] ? dados.meio : null;
  if (!meio) throw erro('Escolha o meio de pagamento.');
  if (!dataValida(dados.primeiraData)) throw erro(forma === 'entrada' ? 'Informe a data da entrada.' : 'Informe a data do primeiro pagamento.');

  let parcelas = 1;
  let entradaCent = 0;
  if (forma === 'parcelado') {
    parcelas = parseInt(dados.parcelas, 10);
    if (!(parcelas >= 2 && parcelas <= MAX_PARCELAS)) throw erro(`Parcelado: escolha de 2 a ${MAX_PARCELAS} parcelas.`);
  } else if (forma === 'entrada') {
    parcelas = parseInt(dados.parcelas, 10);
    if (!(parcelas >= 1 && parcelas <= MAX_PARCELAS)) throw erro(`Escolha de 1 a ${MAX_PARCELAS} parcelas depois da entrada.`);
    entradaCent = centavos(dados.entrada);
    if (!(entradaCent > 0)) throw erro('Informe o valor da entrada.');
    if (entradaCent >= finalCent) throw erro('A entrada precisa ser menor que o valor final.');
  }

  return {
    valorOriginal: originalCent / 100,
    valorFinal: finalCent / 100,
    desconto: Math.max(0, originalCent - finalCent) / 100,
    descontoPct,
    forma,
    parcelas,
    entrada: forma === 'entrada' ? entradaCent / 100 : null,
    primeiraData: dados.primeiraData,
    meio,
    recebido: !!dados.recebido,
  };
}

// Parcelas (data e valor) de um fechamento já normalizado
function montarParcelas(f) {
  const finalCent = centavos(f.valorFinal);
  if (f.forma === 'avista') return [{ data: f.primeiraData, valor: f.valorFinal, rotulo: '' }];
  if (f.forma === 'parcelado') {
    return dividir(finalCent, f.parcelas).map((c, i) => ({ data: somarMeses(f.primeiraData, i), valor: c / 100, rotulo: `${i + 1}/${f.parcelas}` }));
  }
  const entradaCent = centavos(f.entrada);
  const resto = dividir(finalCent - entradaCent, f.parcelas).map((c, i) => ({ data: somarMeses(f.primeiraData, i + 1), valor: c / 100, rotulo: `${i + 1}/${f.parcelas}` }));
  return [{ data: f.primeiraData, valor: entradaCent / 100, rotulo: 'entrada' }, ...resto];
}

// Situação de cada parcela no financeiro: a primeira pode já ter sido recebida;
// o que vence no futuro fica "Agendado"; o que já venceu e não foi recebido, "Pendente".
function statusDaParcela(i, data, hoje, recebido) {
  if (i === 0 && recebido) return 'Pago';
  return data > hoje ? 'Agendado' : 'Pendente';
}

function hojeBR(agora = new Date()) {
  return new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

// Lançamentos que o servidor cria no financeiro pra um fechamento
function montarLancamentos(card, f, fechamentoId, hoje, pagosAntes = new Set()) {
  const parcelas = montarParcelas(f);
  const nome = String(card.cliente || 'Cliente').slice(0, 120);
  return parcelas.map((p, i) => ({
    id: `crmv-${fechamentoId}-${i + 1}`,
    data: p.data,
    descricao: `Venda — ${nome}${p.rotulo ? ` (${p.rotulo})` : ''}`,
    tipo: 'Receita',
    categoria: 'Vendas',
    escopo: 'Empresa',
    forma: MEIOS[f.meio].conta,
    status: pagosAntes.has(i) ? 'Pago' : statusDaParcela(i, p.data, hoje, f.recebido),
    valor: p.valor,
    extras: { crmFechamento: { clienteId: String(card._id || card.id), fechamentoId, parcela: i + 1, total: parcelas.length, meio: f.meio } },
  }));
}

/* ---------------- banco ---------------- */

async function lancamentosDoCard(userId, cardId) {
  const { rows } = await query(
    `SELECT id, data, descricao, status, valor, extras FROM financeiro_lancamentos
      WHERE user_id = $1::uuid AND extras ? 'crmFechamento' AND extras->'crmFechamento'->>'clienteId' = $2
      ORDER BY (extras->'crmFechamento'->>'parcela')::int`,
    [userId, String(cardId)]
  );
  return rows.map((r) => ({
    id: r.id,
    data: r.data instanceof Date ? r.data.toISOString().slice(0, 10) : String(r.data || '').slice(0, 10),
    descricao: r.descricao,
    status: r.status,
    valor: Number(r.valor),
    parcela: Number(r.extras.crmFechamento.parcela) || null,
  }));
}

// Cria (ou refaz) o fechamento de um card: grava os lançamentos e o resumo no card
async function salvarFechamento(userId, card, dados, agora = new Date()) {
  const f = normalizarFechamento(dados, card.valor);
  const fechamentoId = crypto.randomBytes(6).toString('hex');
  const hoje = hojeBR(agora);
  return transacao(async () => {
    const antigos = await lancamentosDoCard(userId, card._id);
    // parcela que a pessoa já marcou como recebida continua recebida
    const pagosAntes = new Set(antigos.filter((l) => l.status === 'Pago' && l.parcela).map((l) => l.parcela - 1));
    const novos = montarLancamentos(card, f, fechamentoId, hoje, pagosAntes);
    if (antigos.length) {
      await query(`DELETE FROM financeiro_lancamentos WHERE user_id = $1::uuid AND id = ANY($2::text[])`, [userId, antigos.map((l) => l.id)]);
    }
    const { rows } = await query('SELECT COALESCE(max(posicao), -1)::int AS p FROM financeiro_lancamentos WHERE user_id = $1::uuid', [userId]);
    let posicao = rows[0].p + 1;
    for (const l of novos) {
      await query(
        `INSERT INTO financeiro_lancamentos (user_id, id, posicao, data, descricao, tipo, categoria, escopo, forma, status, valor, recorrencia, parcelas, extras)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'unico', NULL, $12::jsonb)`,
        [userId, l.id, posicao++, l.data, l.descricao, l.tipo, l.categoria, l.escopo, l.forma, l.status, l.valor, JSON.stringify(l.extras)]
      );
    }
    const anterior = card.fechamento || null;
    const resumo = {
      id: fechamentoId,
      valorOriginal: f.valorOriginal,
      valorFinal: f.valorFinal,
      desconto: f.desconto,
      descontoPct: f.descontoPct,
      forma: f.forma,
      parcelas: f.parcelas,
      entrada: f.entrada,
      primeiraData: f.primeiraData,
      meio: f.meio,
      lancamentoIds: novos.map((l) => l.id),
      criadoEm: (anterior && anterior.criadoEm) || agora.toISOString(),
      atualizadoEm: agora.toISOString(),
    };
    await query('UPDATE clientes SET fechamento = $3::jsonb, fechamento_pendente = false, updated_at = now() WHERE user_id = $1::uuid AND id = $2::uuid',
      [userId, String(card._id), JSON.stringify(resumo)]);
    return { fechamento: resumo, lancamentos: novos, substituidos: antigos.length };
  });
}

// Modo da integração (o que o financeiro faz com o CRM) e se a pessoa já escolheu
async function lerModo(userId) {
  const { rows } = await query('SELECT config FROM financeiro_perfis WHERE user_id = $1::uuid', [userId]);
  const config = (rows[0] && rows[0].config) || {};
  return {
    modo: ['vendas', 'comissoes', 'nenhum'].includes(config.integracaoCrm) ? config.integracaoCrm : 'vendas',
    perguntado: !!config.integracaoCrmPerguntado || config.integracaoCrm !== undefined,
  };
}
async function definirModo(userId, modo) {
  if (!['vendas', 'comissoes', 'nenhum'].includes(modo)) throw erro('Modo inválido.');
  const extra = JSON.stringify({ integracaoCrm: modo, integracaoCrmPerguntado: true });
  await query(
    `INSERT INTO financeiro_perfis (user_id, config) VALUES ($1::uuid, $2::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET config = COALESCE(financeiro_perfis.config, '{}'::jsonb) || $2::jsonb, updated_at = now()`,
    [userId, extra]
  );
  return { modo, perguntado: true };
}

module.exports = {
  FORMAS, MEIOS, MAX_PARCELAS, ErroFechamento,
  normalizarFechamento, montarParcelas, montarLancamentos, statusDaParcela, somarMeses, dividir, hojeBR,
  lancamentosDoCard, salvarFechamento, lerModo, definirModo,
};
