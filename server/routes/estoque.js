/* /api/estoque — o aplicativo PDV (caixa do dia, venda no balcão, produtos e estoque, compras,
   clientes com fiado e fidelidade, operadores e, para restaurante, os pedidos do cardápio).
   As regras ficam em utils/estoque.js, utils/caixa.js e utils/fidelidade.js.

   Operadores: o cabeçalho x-operador traz quem está no caixa (token do PIN). Com
   "exigir operador" ligado nas configurações do PDV, as ações de caixa precisam de alguém
   entrado e as de gerente (cancelar, configurações, produtos, operadores) precisam de um gerente. */
const express = require('express');
const auth = require('../middleware/auth');
const E = require('../utils/estoque');
const F = require('../utils/fidelidade');
const C = require('../utils/caixa');
const M = require('../utils/comandas');
const { gerarPlanilha } = require('../utils/exportarXlsx');
const P = require('../utils/planilhasPdv');
const N = require('../utils/nfe');
const { analisar } = require('../utils/analises');
const NF = require('../utils/fiscal');
const { hojeBR } = require('../utils/fechamento');
const { criarMiddlewareLimite } = require('../utils/limiteTaxa');
const A = require('../utils/acesso');
const { query } = require('../db/pool');

const router = express.Router();
router.use(auth);

class ErroPermissao extends Error {}
// quem está no caixa e as regras do PDV, para todas as rotas
router.use(async (req, res, next) => {
  try {
    req.pdv = await C.lerPdv(req.userId);
    const rec = (req.assinatura && req.assinatura.recursos) || {};
    if (rec.equipe === false) req.pdv = { ...req.pdv, exigirOperador: false }; // operadores: plano Completo
    if (req.acesso && req.acesso.tipo !== 'dono') {
      // funcionário pelo celular ou aparelho da loja: quem está usando já veio conferido no login
      req.op = (await C.operadorDoPedido(req)) || (req.acesso.operador ? C.operadorObj(req.acesso.operador) : null);
    } else req.op = rec.equipe === false ? null : await C.operadorDoPedido(req);
    next();
  } catch (err) { next(err); }
});
// Com PIN exigido (ou funcionário/aparelho da loja): vale o que a função da pessoa permite
// (utils/acesso.js). "caixa" = mexe com dinheiro (cobrar); "cancelar" = só gestor ou gerente.
const MSG_PERM = {
  config: 'Só o gestor muda as configurações e a equipe.', produtos: 'A sua função não edita produtos nem estoque.', compras: 'A sua função não lança compras.',
  caixa: 'A sua função não mexe no caixa. Peça para quem está no caixa.', vender: 'A sua função não registra vendas.', clientes: 'A sua função não mexe nos clientes.',
  mesas: 'A sua função não mexe nas mesas.', relatorios: 'A sua função não vê os relatórios.', produtosVer: 'A sua função não vê o estoque.',
};
function exigir(req, nivel) {
  const naoDono = req.acesso && req.acesso.tipo !== 'dono';
  if (!req.pdv.exigirOperador && !naoDono) return;
  if (!req.op) throw new ErroPermissao('Entre com o seu PIN de operador para continuar.');
  const perm = A.permissoesDe(req.op);
  const precisa = A.permissaoDoEstoque(req.method, req.path);
  if (precisa !== 'livre' && !perm[precisa]) throw new ErroPermissao(MSG_PERM[precisa] || 'A sua função não pode fazer isso. Fale com o gestor.');
  if (nivel === 'caixa' && !(perm.vender || perm.caixa)) throw new ErroPermissao('Garçom lança pedidos nas mesas, mas não cobra. Peça para quem está no caixa.');
  if (nivel === 'cancelar' && !C.CHEFIA.includes(req.op.papel)) throw new ErroPermissao('Só o gestor ou um gerente pode fazer isso. Peça para um deles entrar com o PIN.');
}
const podeVerCustos = (req) => !(req.op && (req.pdv.exigirOperador || (req.acesso && req.acesso.tipo !== 'dono')) && !A.permissoesDe(req.op).custos);
// quem não vê custos não muda custo de produto sem querer (o formulário dele não tem o campo)
async function semMexerNoCusto(req) {
  const b = { ...(req.body || {}) };
  if (podeVerCustos(req)) return b;
  const atual = req.params.id ? (await E.listarProdutos(req.userId)).find((p) => p.id === req.params.id) : null;
  b.custo = atual ? atual.custo : 0;
  if (Array.isArray(b.variacoes)) b.variacoes = b.variacoes.map((v) => { const va = atual && v.id && atual.variacoes.find((x) => x.id === v.id); return { ...v, custo: va ? va.custo : null }; });
  return b;
}
const nomeDoOperador = (req) => (req.op ? req.op.nome : '');

// Embrulha cada rota: erro de regra vira 400 com a mensagem; permissão, 403; o resto, 500
const rota = (fn, msg, nivel = null) => async (req, res) => {
  try {
    if (nivel) exigir(req, nivel);
    res.json(await fn(req, res));
  } catch (err) {
    if (err instanceof ErroPermissao) return res.status(403).json({ error: err.message, operador: true });
    if (err instanceof E.ErroEstoque || err instanceof F.ErroFidelidade || err instanceof C.ErroCaixa || err instanceof M.ErroComanda || err instanceof P.ErroPlanilha || err instanceof N.ErroNFe || err instanceof NF.ErroFiscal) return res.status(400).json({ error: err.message });
    console.error(`${msg}:`, err.message);
    res.status(500).json({ error: `${msg}. Tente de novo.` });
  }
};

// Tudo que a tela precisa ao abrir
router.get('/', rota(async (req) => ({
  negocio: await E.lerNegocio(req.userId),
  produtos: await E.listarProdutos(req.userId),
  meios: E.MEIOS_VENDA.map((id) => ({ id, nome: E.NOME_MEIO[id] })),
  unidades: E.UNIDADES,
  pdv: req.pdv,
  recursos: (req.assinatura && req.assinatura.recursos) || {},
  operadores: await C.listarOperadores(req.userId),
  operador: req.op,
  caixa: await C.situacaoCaixa(req.userId),
  fiscal: await NF.lerConfig(req.userId),
}), 'Erro ao carregar o PDV'));

// o que a pessoa que está usando pode ver (null = tudo: o dono, sem PIN de funcionário)
function permsDoPedido(req) {
  if (req.acesso && req.acesso.tipo !== 'dono') return req.acesso.perm || A.NADA;
  if (req.op && req.pdv && req.pdv.exigirOperador) return A.permissoesDe(req.op);
  return null;
}
router.get('/resumo', rota(async (req) => {
  const r = { ...(await E.resumo(req.userId)), fiado: await C.fiadoEmAberto(req.userId) };
  const p = permsDoPedido(req);
  if (!p) return r;
  // totais da loja (dia, mês, valor do estoque, quanto rende cada produto) só com "Relatórios"
  if (!p.relatorios) {
    const nome = req.op ? req.op.nome : '';
    const hoje = hojeBR();
    const minhas = nome ? (await query(`SELECT count(*)::int AS n, COALESCE(sum(total), 0)::float AS t FROM estoque_vendas WHERE user_id = $1::uuid AND NOT cancelada AND data = $2 AND operador = $3`, [req.userId, hoje, nome])).rows[0] : { n: 0, t: 0 };
    r.minhasHoje = { vendas: minhas.n, total: Math.round(minhas.t * 100) / 100 };
    r.maisVendidos = r.maisVendidos.map((m) => ({ nome: m.nome, qtd: m.qtd }));
    delete r.hoje; delete r.mes; delete r.valorEstoque;
    r.restrito = true;
  }
  if (!p.clientes) delete r.fiado;
  return r;
}, 'Erro ao carregar o resumo'));

router.put('/negocio', rota(async (req) => ({ negocio: await E.salvarNegocio(req.userId, req.body || {}) }), 'Erro ao salvar', 'gerente'));
router.put('/pdv', rota(async (req) => {
  const semEquipe = ((req.assinatura && req.assinatura.recursos) || {}).equipe === false;
  const corpo = { ...(req.body || {}) };
  if (semEquipe && corpo.exigirOperador) throw new C.ErroCaixa('Pedir o PIN dos operadores faz parte do plano Completo.');
  if (semEquipe) delete corpo.exigirOperador;
  const pdv = await C.salvarPdv(req.userId, corpo);
  return { pdv: semEquipe ? { ...pdv, exigirOperador: false } : pdv };
}, 'Erro ao salvar', 'gerente'));

// Operadores (PIN)
router.get('/operadores', rota(async (req) => ({ operadores: await C.listarOperadores(req.userId) }), 'Erro ao carregar os operadores'));
router.post('/operadores', rota(async (req) => ({ operador: await C.salvarOperador(req.userId, req.body || {}) }), 'Erro ao salvar o operador', 'gerente'));
router.put('/operadores/:id', rota(async (req) => ({ operador: await C.salvarOperador(req.userId, req.body || {}, req.params.id) }), 'Erro ao salvar o operador', 'gerente'));
router.delete('/operadores/:id', rota(async (req) => { await C.excluirOperador(req.userId, req.params.id); return { ok: true }; }, 'Erro ao excluir o operador', 'gerente'));
const limitePin = criarMiddlewareLimite({ janelaMs: 10 * 60 * 1000, max: 10, chaveDe: (req) => `${req.userId}:${req.ip}`, mensagem: 'Muitas tentativas de PIN. Espere alguns minutos.' });
router.post('/operadores/entrar', limitePin, rota((req) => C.entrarOperador(req.userId, req.body || {}), 'Erro ao entrar'));

// Caixa do dia
router.get('/caixa', rota(async (req) => {
  const sit = await C.situacaoCaixa(req.userId);
  const p = permsDoPedido(req);
  // os valores do caixa (vendas, gaveta, movimentos) ficam com quem cuida do caixa
  if (p && !p.caixa && sit.aberto) sit.aberto = { caixa: { id: sit.aberto.caixa.id, numero: sit.aberto.caixa.numero, abertoEm: sit.aberto.caixa.abertoEm, abertoPor: sit.aberto.caixa.abertoPor }, restrito: true };
  return sit;
}, 'Erro ao carregar o caixa'));
router.get('/caixa/historico', rota(async (req) => ({ caixas: await C.historicoCaixas(req.userId) }), 'Erro ao carregar os fechamentos'));
router.get('/caixa/:id', rota((req) => C.caixaPorId(req.userId, req.params.id), 'Erro ao carregar o caixa'));
router.post('/caixa/abrir', rota((req) => C.abrirCaixa(req.userId, req.body || {}, nomeDoOperador(req)), 'Erro ao abrir o caixa', 'caixa'));
router.post('/caixa/movimento', rota((req) => C.movimentarCaixa(req.userId, req.body || {}, nomeDoOperador(req), new Date(), E.registrarGasto), 'Erro ao registrar o movimento', 'caixa'));
router.post('/caixa/fechar', rota((req) => C.fecharCaixa(req.userId, req.body || {}, nomeDoOperador(req)), 'Erro ao fechar o caixa', 'caixa'));

// Planilha do mês em Excel (.xlsx)
router.get('/exportar.xlsx', async (req, res) => {
  if (!podeVerCustos(req)) return res.status(403).json({ error: 'A planilha do mês tem custos e lucro: só quem vê custos pode baixar.', funcao: true });
  try {
    const { buffer, nome } = await gerarPlanilha(req.userId, req.query.mes);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nome.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nome)}`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (err) {
    console.error('Erro ao gerar a planilha:', err.message);
    res.status(500).json({ error: 'Erro ao gerar a planilha. Tente de novo.' });
  }
});

// Produtos e clientes em planilha (.xlsx): exportar e importar (prévia, depois aplicar)
function enviarXlsx(res, buffer, nome) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
}
router.get('/exportar/produtos.xlsx', async (req, res) => {
  if (!podeVerCustos(req)) return res.status(403).json({ error: 'A planilha de produtos tem os custos: só quem vê custos pode baixar.', funcao: true });
  try { enviarXlsx(res, await P.exportarProdutos(req.userId), `produtos-${hojeBR()}.xlsx`); }
  catch (err) { console.error('Erro ao exportar produtos:', err.message); res.status(500).json({ error: 'Erro ao gerar a planilha. Tente de novo.' }); }
});
router.get('/exportar/clientes.xlsx', async (req, res) => {
  try { enviarXlsx(res, await P.exportarClientes(req.userId), `clientes-${hojeBR()}.xlsx`); }
  catch (err) { console.error('Erro ao exportar clientes:', err.message); res.status(500).json({ error: 'Erro ao gerar a planilha. Tente de novo.' }); }
});
router.post('/importar/produtos', rota((req) => {
  if ((req.body || {}).aplicar) exigir(req, 'gerente');
  if (!podeVerCustos(req)) throw new ErroPermissao('A planilha de produtos tem os custos: só quem vê custos pode importar.');
  return P.importarProdutos(req.userId, req.body || {});
}, 'Erro ao importar a planilha'));
router.post('/importar/clientes', rota((req) => { if ((req.body || {}).aplicar) exigir(req, 'caixa'); return P.importarClientes(req.userId, req.body || {}); }, 'Erro ao importar a planilha'));

// Nota fiscal ao consumidor (NFC-e) por parceiro emissor
router.get('/fiscal', rota(async (req) => ({ fiscal: await NF.lerConfig(req.userId) }), 'Erro ao carregar a configuração fiscal'));
router.put('/fiscal', rota(async (req) => ({ fiscal: await NF.salvarConfig(req.userId, req.body || {}) }), 'Erro ao salvar a configuração fiscal', 'gerente'));
router.post('/fiscal/testar', rota((req) => NF.testar(req.userId), 'Erro ao testar o emissor', 'gerente'));
router.post('/vendas/:id/nfce', rota(async (req) => ({ nfce: await NF.emitir(req.userId, req.params.id, req.body || {}, E.vendaObj) }), 'Erro ao emitir a NFC-e', 'caixa'));
router.get('/vendas/:id/nfce', rota(async (req) => ({ nfce: await NF.consultar(req.userId, req.params.id) }), 'Erro ao consultar a NFC-e'));
router.post('/vendas/:id/nfce/cancelar', rota(async (req) => ({ nfce: await NF.cancelar(req.userId, req.params.id, req.body || {}) }), 'Erro ao cancelar a NFC-e', 'cancelar'));

// Análises (curva ABC, margem, horários)
router.get('/analises', rota((req) => analisar(req.userId, { de: req.query.de, ate: req.query.ate, base: req.query.base, agruparVariacoes: req.query.variacoes !== '1' }), 'Erro ao carregar as análises'));

// Compra pelo XML da NF-e: prévia (sugere os produtos) e importar
router.post('/compras/nfe/previa', rota((req) => N.previa(req.userId, (req.body || {}).xml), 'Erro ao ler a nota'));
router.post('/compras/nfe', rota((req) => N.importar(req.userId, req.body || {}), 'Erro ao lançar a nota', 'caixa'));

// Produtos
router.get('/produtos', rota(async (req) => ({ produtos: await E.listarProdutos(req.userId) }), 'Erro ao carregar os produtos'));
// lixeira: quem edita produtos vê e restaura; apagar de vez é do gestor ou gerente
router.get('/produtos/lixeira', rota(async (req) => ({ produtos: await E.lixeiraDeProdutos(req.userId), dias: E.DIAS_LIXEIRA }), 'Erro ao carregar a lixeira', 'gerente'));
router.post('/produtos/:id/restaurar', rota(async (req) => { await E.restaurarProduto(req.userId, req.params.id); return { produtos: await E.listarProdutos(req.userId) }; }, 'Erro ao restaurar o produto', 'gerente'));
router.delete('/produtos/lixeira/:id', rota(async (req) => { await E.excluirDeVez(req.userId, req.params.id); return { ok: true }; }, 'Erro ao apagar o produto', 'cancelar'));
router.post('/produtos', rota(async (req) => ({ produto: await E.salvarProduto(req.userId, await semMexerNoCusto(req)) }), 'Erro ao salvar o produto', 'gerente'));
router.put('/produtos/:id', rota(async (req) => ({ produto: await E.salvarProduto(req.userId, await semMexerNoCusto(req), req.params.id) }), 'Erro ao salvar o produto', 'gerente'));
// excluir manda para a lixeira (dá para restaurar); só gestor ou gerente
router.delete('/produtos/:id', rota(async (req) => { await E.excluirProduto(req.userId, req.params.id, nomeDoOperador(req)); return { ok: true, dias: E.DIAS_LIXEIRA }; }, 'Erro ao excluir o produto', 'cancelar'));
router.put('/produtos/:id/foto', rota(async (req) => {
  await E.salvarFoto(req.userId, req.params.id, req.body ? req.body.foto : undefined);
  return { produto: await E.produtoPorId(req.userId, req.params.id) };
}, 'Erro ao salvar a foto', 'gerente'));
router.get('/produtos/:id/movimentos', rota(async (req) => ({ movimentos: await E.movimentosDe(req.userId, req.params.id) }), 'Erro ao carregar o histórico'));
router.post('/ajuste', rota(async (req) => {
  const r = await E.ajustarEstoque(req.userId, req.body || {});
  return { ...r, produto: await E.produtoPorId(req.userId, req.body.produtoId) };
}, 'Erro ao ajustar o estoque', 'gerente'));

// Vendas do balcão
router.get('/vendas', rota(async (req) => ({ vendas: await E.listarVendas(req.userId, { de: req.query.de, ate: req.query.ate }) }), 'Erro ao carregar as vendas'));
router.post('/vendas', rota((req) => E.registrarVenda(req.userId, {
  ...(req.body || {}),
  _operador: nomeDoOperador(req),
  _descontoMax: req.op && !C.CHEFIA.includes(req.op.papel) ? req.pdv.descontoMaxCaixa : undefined,
}), 'Erro ao registrar a venda', 'caixa'));
router.post('/vendas/:id/cancelar', rota(async (req) => {
  const venda = await E.cancelarVenda(req.userId, req.params.id);
  if (venda.comandaId) await M.reabrirPelaVenda(req.userId, venda.comandaId); // a conta da mesa volta para cobrar de novo
  return { venda };
}, 'Erro ao cancelar a venda', 'cancelar'));

// Compras de mercadoria
router.get('/compras', rota(async (req) => ({ compras: await E.listarCompras(req.userId) }), 'Erro ao carregar as compras'));
router.post('/compras', rota(async (req) => ({ compra: await E.registrarCompra(req.userId, req.body || {}) }), 'Erro ao registrar a compra', 'caixa'));
router.post('/compras/:id/cancelar', rota(async (req) => ({ compra: await E.cancelarCompra(req.userId, req.params.id) }), 'Erro ao cancelar a compra', 'cancelar'));

// Notas de gasto (despesas que não saem do caixa)
router.get('/gastos', rota(async (req) => ({ gastos: await E.listarGastos(req.userId) }), 'Erro ao carregar os gastos'));
router.post('/gastos', rota(async (req) => ({ gasto: await E.registrarGasto(req.userId, req.body || {}) }), 'Erro ao registrar o gasto', 'caixa'));
router.delete('/gastos/:id', rota(async (req) => { await E.excluirGasto(req.userId, req.params.id); return { ok: true }; }, 'Erro ao excluir o gasto', 'cancelar'));

// Clientes, fiado e programa de fidelidade
const programaDoUsuario = async (userId) => F.programaDe(((await E.lerNegocio(userId)) || {}).fidelidade);
router.get('/clientes', rota(async (req) => {
  const [clientes, emAberto, fiado] = await Promise.all([
    F.listarClientes(req.userId, { busca: req.query.busca, filtro: req.query.filtro === 'fiado' ? '' : req.query.filtro }, hojeBR()),
    F.cashbackEmAberto(req.userId, hojeBR()), C.fiadoEmAberto(req.userId),
  ]);
  let lista = clientes.map((c) => ({ ...c, deve: fiado.porCliente[c.id] || 0 }));
  if (req.query.filtro === 'fiado') lista = lista.filter((c) => c.deve > 0);
  return { clientes: lista, emAberto, fiado: { total: fiado.total, clientes: fiado.clientes } };
}, 'Erro ao carregar os clientes'));
router.get('/clientes/:id', rota(async (req) => ({
  ...(await F.fichaCliente(req.userId, req.params.id, await programaDoUsuario(req.userId), hojeBR())),
  fiado: await C.contaFiado(req.userId, req.params.id),
}), 'Erro ao carregar o cliente'));
router.post('/clientes', rota(async (req) => ({ cliente: await F.salvarCliente(req.userId, req.body || {}, null, hojeBR()) }), 'Erro ao salvar o cliente', 'caixa'));
router.put('/clientes/:id', rota(async (req) => ({ cliente: await F.salvarCliente(req.userId, req.body || {}, req.params.id, hojeBR()) }), 'Erro ao salvar o cliente', 'caixa'));
router.delete('/clientes/:id', rota(async (req) => { await F.excluirCliente(req.userId, req.params.id); return { ok: true }; }, 'Erro ao excluir o cliente', 'cancelar'));
router.post('/clientes/:id/ajuste', rota(async (req) => F.ajustarBeneficio(req.userId, req.params.id, req.body || {}, await programaDoUsuario(req.userId), hojeBR()), 'Erro ao ajustar', 'cancelar'));
router.get('/clientes/:id/fiado', rota((req) => C.contaFiado(req.userId, req.params.id), 'Erro ao carregar o fiado'));
router.post('/clientes/:id/fiado/receber', rota((req) => C.receberFiado(req.userId, req.params.id, req.body || {}, nomeDoOperador(req)), 'Erro ao receber o fiado', 'caixa'));

// Pedidos do cardápio (restaurante)
router.get('/pedidos', rota(async (req) => ({ pedidos: await E.listarPedidos(req.userId) }), 'Erro ao carregar os pedidos'));
router.post('/pedidos/:id/vender', rota((req) => E.venderPedido(req.userId, req.params.id, req.body || {}), 'Erro ao registrar a venda do pedido', 'caixa'));
router.post('/pedidos/:id/recusar', rota(async (req) => ({ pedido: await E.recusarPedido(req.userId, req.params.id) }), 'Erro ao recusar o pedido', 'caixa'));

router.post('/pedidos/:id/cozinha', rota(async (req) => ({ ticket: await M.pedidoParaCozinha(req.userId, req.params.id, nomeDoOperador(req)) }), 'Erro ao mandar para a cozinha', 'atender'));

// Mesas e comandas (restaurante). Garçom lança e manda para a cozinha; cobrar é do caixa.
router.get('/mesas', rota((req) => M.mapa(req.userId), 'Erro ao carregar as mesas'));
router.put('/mesas', rota(async (req) => ({ mesas: await M.salvarMesas(req.userId, (req.body || {}).mesas) }), 'Erro ao salvar as mesas', 'cancelar'));
router.get('/comandas/historico', rota(async (req) => ({ comandas: await M.historicoComandas(req.userId) }), 'Erro ao carregar as comandas'));
router.post('/comandas', rota(async (req) => ({ comanda: await M.abrirComanda(req.userId, req.body || {}, nomeDoOperador(req)) }), 'Erro ao abrir a comanda', 'atender'));
router.get('/comandas/:id', rota(async (req) => ({ comanda: await M.comandaPorId(req.userId, req.params.id) }), 'Erro ao carregar a comanda'));
router.put('/comandas/:id', rota(async (req) => ({ comanda: await M.atualizarComanda(req.userId, req.params.id, req.body || {}) }), 'Erro ao salvar a comanda', 'atender'));
router.post('/comandas/:id/itens', rota(async (req) => ({ comanda: await M.adicionarItens(req.userId, req.params.id, req.body || {}, nomeDoOperador(req)) }), 'Erro ao lançar os itens', 'atender'));
router.post('/comandas/:id/enviar', rota(async (req) => ({ comanda: await M.enviarCozinha(req.userId, req.params.id, nomeDoOperador(req)) }), 'Erro ao mandar para a cozinha', 'atender'));
router.delete('/comandas/:id/itens/:itemId', rota(async (req) => {
  const it = await M.itemDaComanda(req.userId, req.params.id, req.params.itemId);
  exigir(req, it.enviadoEm ? 'cancelar' : 'atender'); // o que já foi para a cozinha só o gestor ou o gerente cancela
  return { comanda: await M.removerItem(req.userId, req.params.id, req.params.itemId, req.body || {}) };
}, 'Erro ao tirar o item'));
router.post('/comandas/:id/fechar', rota((req) => M.fecharComanda(req.userId, req.params.id, req.body || {}, nomeDoOperador(req),
  { _descontoMax: req.op && !C.CHEFIA.includes(req.op.papel) ? req.pdv.descontoMaxCaixa : undefined }), 'Erro ao fechar a conta', 'caixa'));
router.post('/comandas/:id/cancelar', rota(async (req) => {
  exigir(req, (await M.comandaTemItensValidos(req.userId, req.params.id)) ? 'cancelar' : 'atender'); // aberta por engano, vazia: qualquer um
  return M.cancelarComanda(req.userId, req.params.id, req.body || {}, nomeDoOperador(req));
}, 'Erro ao cancelar a comanda'));

// Tela da cozinha
router.get('/cozinha', rota((req) => M.listarCozinha(req.userId), 'Erro ao carregar a cozinha'));
router.put('/cozinha/:id', rota(async (req) => ({ ticket: await M.mudarTicket(req.userId, req.params.id, (req.body || {}).status) }), 'Erro ao atualizar o pedido', 'atender'));

module.exports = router;
