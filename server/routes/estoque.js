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
const { hojeBR } = require('../utils/fechamento');
const { criarMiddlewareLimite } = require('../utils/limiteTaxa');

const router = express.Router();
router.use(auth);

class ErroPermissao extends Error {}
// quem está no caixa e as regras do PDV, para todas as rotas
router.use(async (req, res, next) => {
  try {
    req.pdv = await C.lerPdv(req.userId);
    req.op = await C.operadorDoPedido(req);
    next();
  } catch (err) { next(err); }
});
function exigir(req, nivel) {
  if (!req.pdv.exigirOperador) return;
  if (!req.op) throw new ErroPermissao('Entre com o seu PIN de operador para continuar.');
  if (nivel === 'gerente' && req.op.papel !== 'gerente') throw new ErroPermissao('Só um gerente pode fazer isso. Peça para um gerente entrar com o PIN.');
  if (nivel === 'caixa' && req.op.papel === 'garcom') throw new ErroPermissao('Garçom lança pedidos nas mesas, mas não mexe no caixa. Peça para quem está no caixa.');
}
const nomeDoOperador = (req) => (req.op ? req.op.nome : '');

// Embrulha cada rota: erro de regra vira 400 com a mensagem; permissão, 403; o resto, 500
const rota = (fn, msg, nivel = null) => async (req, res) => {
  try {
    if (nivel) exigir(req, nivel);
    res.json(await fn(req, res));
  } catch (err) {
    if (err instanceof ErroPermissao) return res.status(403).json({ error: err.message, operador: true });
    if (err instanceof E.ErroEstoque || err instanceof F.ErroFidelidade || err instanceof C.ErroCaixa || err instanceof M.ErroComanda || err instanceof P.ErroPlanilha || err instanceof N.ErroNFe) return res.status(400).json({ error: err.message });
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
  operadores: await C.listarOperadores(req.userId),
  operador: req.op,
  caixa: await C.situacaoCaixa(req.userId),
}), 'Erro ao carregar o PDV'));

router.get('/resumo', rota(async (req) => ({ ...(await E.resumo(req.userId)), fiado: await C.fiadoEmAberto(req.userId) }), 'Erro ao carregar o resumo'));

router.put('/negocio', rota(async (req) => ({ negocio: await E.salvarNegocio(req.userId, req.body || {}) }), 'Erro ao salvar', 'gerente'));
router.put('/pdv', rota(async (req) => ({ pdv: await C.salvarPdv(req.userId, req.body || {}) }), 'Erro ao salvar', 'gerente'));

// Operadores (PIN)
router.get('/operadores', rota(async (req) => ({ operadores: await C.listarOperadores(req.userId) }), 'Erro ao carregar os operadores'));
router.post('/operadores', rota(async (req) => ({ operador: await C.salvarOperador(req.userId, req.body || {}) }), 'Erro ao salvar o operador', 'gerente'));
router.put('/operadores/:id', rota(async (req) => ({ operador: await C.salvarOperador(req.userId, req.body || {}, req.params.id) }), 'Erro ao salvar o operador', 'gerente'));
router.delete('/operadores/:id', rota(async (req) => { await C.excluirOperador(req.userId, req.params.id); return { ok: true }; }, 'Erro ao excluir o operador', 'gerente'));
const limitePin = criarMiddlewareLimite({ janelaMs: 10 * 60 * 1000, max: 10, chaveDe: (req) => `${req.userId}:${req.ip}`, mensagem: 'Muitas tentativas de PIN. Espere alguns minutos.' });
router.post('/operadores/entrar', limitePin, rota((req) => C.entrarOperador(req.userId, req.body || {}), 'Erro ao entrar'));

// Caixa do dia
router.get('/caixa', rota((req) => C.situacaoCaixa(req.userId), 'Erro ao carregar o caixa'));
router.get('/caixa/historico', rota(async (req) => ({ caixas: await C.historicoCaixas(req.userId) }), 'Erro ao carregar os fechamentos'));
router.get('/caixa/:id', rota((req) => C.caixaPorId(req.userId, req.params.id), 'Erro ao carregar o caixa'));
router.post('/caixa/abrir', rota((req) => C.abrirCaixa(req.userId, req.body || {}, nomeDoOperador(req)), 'Erro ao abrir o caixa', 'caixa'));
router.post('/caixa/movimento', rota((req) => C.movimentarCaixa(req.userId, req.body || {}, nomeDoOperador(req), new Date(), E.registrarGasto), 'Erro ao registrar o movimento', 'caixa'));
router.post('/caixa/fechar', rota((req) => C.fecharCaixa(req.userId, req.body || {}, nomeDoOperador(req)), 'Erro ao fechar o caixa', 'caixa'));

// Planilha do mês em Excel (.xlsx)
router.get('/exportar.xlsx', async (req, res) => {
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
  try { enviarXlsx(res, await P.exportarProdutos(req.userId), `produtos-${hojeBR()}.xlsx`); }
  catch (err) { console.error('Erro ao exportar produtos:', err.message); res.status(500).json({ error: 'Erro ao gerar a planilha. Tente de novo.' }); }
});
router.get('/exportar/clientes.xlsx', async (req, res) => {
  try { enviarXlsx(res, await P.exportarClientes(req.userId), `clientes-${hojeBR()}.xlsx`); }
  catch (err) { console.error('Erro ao exportar clientes:', err.message); res.status(500).json({ error: 'Erro ao gerar a planilha. Tente de novo.' }); }
});
router.post('/importar/produtos', rota((req) => { if ((req.body || {}).aplicar) exigir(req, 'gerente'); return P.importarProdutos(req.userId, req.body || {}); }, 'Erro ao importar a planilha'));
router.post('/importar/clientes', rota((req) => { if ((req.body || {}).aplicar) exigir(req, 'caixa'); return P.importarClientes(req.userId, req.body || {}); }, 'Erro ao importar a planilha'));

// Análises (curva ABC, margem, horários)
router.get('/analises', rota((req) => analisar(req.userId, { de: req.query.de, ate: req.query.ate, base: req.query.base, agruparVariacoes: req.query.variacoes !== '1' }), 'Erro ao carregar as análises'));

// Compra pelo XML da NF-e: prévia (sugere os produtos) e importar
router.post('/compras/nfe/previa', rota((req) => N.previa(req.userId, (req.body || {}).xml), 'Erro ao ler a nota'));
router.post('/compras/nfe', rota((req) => N.importar(req.userId, req.body || {}), 'Erro ao lançar a nota', 'caixa'));

// Produtos
router.get('/produtos', rota(async (req) => ({ produtos: await E.listarProdutos(req.userId) }), 'Erro ao carregar os produtos'));
router.post('/produtos', rota(async (req) => ({ produto: await E.salvarProduto(req.userId, req.body || {}) }), 'Erro ao salvar o produto', 'gerente'));
router.put('/produtos/:id', rota(async (req) => ({ produto: await E.salvarProduto(req.userId, req.body || {}, req.params.id) }), 'Erro ao salvar o produto', 'gerente'));
router.delete('/produtos/:id', rota(async (req) => { await E.excluirProduto(req.userId, req.params.id); return { ok: true }; }, 'Erro ao excluir o produto', 'gerente'));
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
  _descontoMax: req.op && req.op.papel === 'caixa' ? req.pdv.descontoMaxCaixa : undefined,
}), 'Erro ao registrar a venda', 'caixa'));
router.post('/vendas/:id/cancelar', rota(async (req) => {
  const venda = await E.cancelarVenda(req.userId, req.params.id);
  if (venda.comandaId) await M.reabrirPelaVenda(req.userId, venda.comandaId); // a conta da mesa volta para cobrar de novo
  return { venda };
}, 'Erro ao cancelar a venda', 'gerente'));

// Compras de mercadoria
router.get('/compras', rota(async (req) => ({ compras: await E.listarCompras(req.userId) }), 'Erro ao carregar as compras'));
router.post('/compras', rota(async (req) => ({ compra: await E.registrarCompra(req.userId, req.body || {}) }), 'Erro ao registrar a compra', 'caixa'));
router.post('/compras/:id/cancelar', rota(async (req) => ({ compra: await E.cancelarCompra(req.userId, req.params.id) }), 'Erro ao cancelar a compra', 'gerente'));

// Notas de gasto (despesas que não saem do caixa)
router.get('/gastos', rota(async (req) => ({ gastos: await E.listarGastos(req.userId) }), 'Erro ao carregar os gastos'));
router.post('/gastos', rota(async (req) => ({ gasto: await E.registrarGasto(req.userId, req.body || {}) }), 'Erro ao registrar o gasto', 'caixa'));
router.delete('/gastos/:id', rota(async (req) => { await E.excluirGasto(req.userId, req.params.id); return { ok: true }; }, 'Erro ao excluir o gasto', 'gerente'));

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
router.delete('/clientes/:id', rota(async (req) => { await F.excluirCliente(req.userId, req.params.id); return { ok: true }; }, 'Erro ao excluir o cliente', 'gerente'));
router.post('/clientes/:id/ajuste', rota(async (req) => F.ajustarBeneficio(req.userId, req.params.id, req.body || {}, await programaDoUsuario(req.userId), hojeBR()), 'Erro ao ajustar', 'gerente'));
router.get('/clientes/:id/fiado', rota((req) => C.contaFiado(req.userId, req.params.id), 'Erro ao carregar o fiado'));
router.post('/clientes/:id/fiado/receber', rota((req) => C.receberFiado(req.userId, req.params.id, req.body || {}, nomeDoOperador(req)), 'Erro ao receber o fiado', 'caixa'));

// Pedidos do cardápio (restaurante)
router.get('/pedidos', rota(async (req) => ({ pedidos: await E.listarPedidos(req.userId) }), 'Erro ao carregar os pedidos'));
router.post('/pedidos/:id/vender', rota((req) => E.venderPedido(req.userId, req.params.id, req.body || {}), 'Erro ao registrar a venda do pedido', 'caixa'));
router.post('/pedidos/:id/recusar', rota(async (req) => ({ pedido: await E.recusarPedido(req.userId, req.params.id) }), 'Erro ao recusar o pedido', 'caixa'));

router.post('/pedidos/:id/cozinha', rota(async (req) => ({ ticket: await M.pedidoParaCozinha(req.userId, req.params.id, nomeDoOperador(req)) }), 'Erro ao mandar para a cozinha', 'atender'));

// Mesas e comandas (restaurante). Garçom lança e manda para a cozinha; cobrar é do caixa.
router.get('/mesas', rota((req) => M.mapa(req.userId), 'Erro ao carregar as mesas'));
router.put('/mesas', rota(async (req) => ({ mesas: await M.salvarMesas(req.userId, (req.body || {}).mesas) }), 'Erro ao salvar as mesas', 'gerente'));
router.get('/comandas/historico', rota(async (req) => ({ comandas: await M.historicoComandas(req.userId) }), 'Erro ao carregar as comandas'));
router.post('/comandas', rota(async (req) => ({ comanda: await M.abrirComanda(req.userId, req.body || {}, nomeDoOperador(req)) }), 'Erro ao abrir a comanda', 'atender'));
router.get('/comandas/:id', rota(async (req) => ({ comanda: await M.comandaPorId(req.userId, req.params.id) }), 'Erro ao carregar a comanda'));
router.put('/comandas/:id', rota(async (req) => ({ comanda: await M.atualizarComanda(req.userId, req.params.id, req.body || {}) }), 'Erro ao salvar a comanda', 'atender'));
router.post('/comandas/:id/itens', rota(async (req) => ({ comanda: await M.adicionarItens(req.userId, req.params.id, req.body || {}, nomeDoOperador(req)) }), 'Erro ao lançar os itens', 'atender'));
router.post('/comandas/:id/enviar', rota(async (req) => ({ comanda: await M.enviarCozinha(req.userId, req.params.id, nomeDoOperador(req)) }), 'Erro ao mandar para a cozinha', 'atender'));
router.delete('/comandas/:id/itens/:itemId', rota(async (req) => {
  const it = await M.itemDaComanda(req.userId, req.params.id, req.params.itemId);
  exigir(req, it.enviadoEm ? 'gerente' : 'atender'); // o que já foi para a cozinha só o gerente cancela
  return { comanda: await M.removerItem(req.userId, req.params.id, req.params.itemId, req.body || {}) };
}, 'Erro ao tirar o item'));
router.post('/comandas/:id/fechar', rota((req) => M.fecharComanda(req.userId, req.params.id, req.body || {}, nomeDoOperador(req),
  { _descontoMax: req.op && req.op.papel === 'caixa' ? req.pdv.descontoMaxCaixa : undefined }), 'Erro ao fechar a conta', 'caixa'));
router.post('/comandas/:id/cancelar', rota(async (req) => {
  exigir(req, (await M.comandaTemItensValidos(req.userId, req.params.id)) ? 'gerente' : 'atender'); // aberta por engano, vazia: qualquer um
  return M.cancelarComanda(req.userId, req.params.id, req.body || {}, nomeDoOperador(req));
}, 'Erro ao cancelar a comanda'));

// Tela da cozinha
router.get('/cozinha', rota((req) => M.listarCozinha(req.userId), 'Erro ao carregar a cozinha'));
router.put('/cozinha/:id', rota(async (req) => ({ ticket: await M.mudarTicket(req.userId, req.params.id, (req.body || {}).status) }), 'Erro ao atualizar o pedido', 'atender'));

module.exports = router;
