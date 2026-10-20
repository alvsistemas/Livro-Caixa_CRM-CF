/* /api/estoque — o aplicativo PDV (produtos, venda no balcão, compras,
   notas de gasto e, para restaurante, os pedidos do cardápio digital).
   As regras ficam em utils/estoque.js. */
const express = require('express');
const auth = require('../middleware/auth');
const E = require('../utils/estoque');
const F = require('../utils/fidelidade');
const { hojeBR } = require('../utils/fechamento');

const router = express.Router();
router.use(auth);

// Embrulha cada rota: erro de regra vira 400 com a mensagem; o resto, 500
const rota = (fn, msg) => async (req, res) => {
  try { res.json(await fn(req, res)); } catch (err) {
    if (err instanceof E.ErroEstoque || err instanceof F.ErroFidelidade) return res.status(400).json({ error: err.message });
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
}), 'Erro ao carregar o PDV'));

router.get('/resumo', rota((req) => E.resumo(req.userId), 'Erro ao carregar o resumo'));

router.put('/negocio', rota(async (req) => ({ negocio: await E.salvarNegocio(req.userId, req.body || {}) }), 'Erro ao salvar'));

// Produtos
router.get('/produtos', rota(async (req) => ({ produtos: await E.listarProdutos(req.userId) }), 'Erro ao carregar os produtos'));
router.post('/produtos', rota(async (req) => ({ produto: await E.salvarProduto(req.userId, req.body || {}) }), 'Erro ao salvar o produto'));
router.put('/produtos/:id', rota(async (req) => ({ produto: await E.salvarProduto(req.userId, req.body || {}, req.params.id) }), 'Erro ao salvar o produto'));
router.delete('/produtos/:id', rota(async (req) => { await E.excluirProduto(req.userId, req.params.id); return { ok: true }; }, 'Erro ao excluir o produto'));
router.put('/produtos/:id/foto', rota(async (req) => {
  await E.salvarFoto(req.userId, req.params.id, req.body ? req.body.foto : undefined);
  return { produto: await E.produtoPorId(req.userId, req.params.id) };
}, 'Erro ao salvar a foto'));
router.get('/produtos/:id/movimentos', rota(async (req) => ({ movimentos: await E.movimentosDe(req.userId, req.params.id) }), 'Erro ao carregar o histórico'));
router.post('/ajuste', rota(async (req) => {
  const r = await E.ajustarEstoque(req.userId, req.body || {});
  return { ...r, produto: await E.produtoPorId(req.userId, req.body.produtoId) };
}, 'Erro ao ajustar o estoque'));

// Vendas do balcão
router.get('/vendas', rota(async (req) => ({ vendas: await E.listarVendas(req.userId, { de: req.query.de, ate: req.query.ate }) }), 'Erro ao carregar as vendas'));
router.post('/vendas', rota((req) => E.registrarVenda(req.userId, req.body || {}), 'Erro ao registrar a venda'));
router.post('/vendas/:id/cancelar', rota(async (req) => ({ venda: await E.cancelarVenda(req.userId, req.params.id) }), 'Erro ao cancelar a venda'));

// Compras de mercadoria
router.get('/compras', rota(async (req) => ({ compras: await E.listarCompras(req.userId) }), 'Erro ao carregar as compras'));
router.post('/compras', rota(async (req) => ({ compra: await E.registrarCompra(req.userId, req.body || {}) }), 'Erro ao registrar a compra'));
router.post('/compras/:id/cancelar', rota(async (req) => ({ compra: await E.cancelarCompra(req.userId, req.params.id) }), 'Erro ao cancelar a compra'));

// Notas de gasto
router.get('/gastos', rota(async (req) => ({ gastos: await E.listarGastos(req.userId) }), 'Erro ao carregar os gastos'));
router.post('/gastos', rota(async (req) => ({ gasto: await E.registrarGasto(req.userId, req.body || {}) }), 'Erro ao registrar o gasto'));
router.delete('/gastos/:id', rota(async (req) => { await E.excluirGasto(req.userId, req.params.id); return { ok: true }; }, 'Erro ao excluir o gasto'));

// Clientes e programa de fidelidade
const programaDoUsuario = async (userId) => F.programaDe(((await E.lerNegocio(userId)) || {}).fidelidade);
router.get('/clientes', rota(async (req) => ({
  clientes: await F.listarClientes(req.userId, { busca: req.query.busca, filtro: req.query.filtro }, hojeBR()),
  emAberto: await F.cashbackEmAberto(req.userId, hojeBR()),
}), 'Erro ao carregar os clientes'));
router.get('/clientes/:id', rota(async (req) => F.fichaCliente(req.userId, req.params.id, await programaDoUsuario(req.userId), hojeBR()), 'Erro ao carregar o cliente'));
router.post('/clientes', rota(async (req) => ({ cliente: await F.salvarCliente(req.userId, req.body || {}, null, hojeBR()) }), 'Erro ao salvar o cliente'));
router.put('/clientes/:id', rota(async (req) => ({ cliente: await F.salvarCliente(req.userId, req.body || {}, req.params.id, hojeBR()) }), 'Erro ao salvar o cliente'));
router.delete('/clientes/:id', rota(async (req) => { await F.excluirCliente(req.userId, req.params.id); return { ok: true }; }, 'Erro ao excluir o cliente'));
router.post('/clientes/:id/ajuste', rota(async (req) => F.ajustarBeneficio(req.userId, req.params.id, req.body || {}, await programaDoUsuario(req.userId), hojeBR()), 'Erro ao ajustar'));

// Pedidos do cardápio (restaurante)
router.get('/pedidos', rota(async (req) => ({ pedidos: await E.listarPedidos(req.userId) }), 'Erro ao carregar os pedidos'));
router.post('/pedidos/:id/vender', rota((req) => E.venderPedido(req.userId, req.params.id, req.body || {}), 'Erro ao registrar a venda do pedido'));
router.post('/pedidos/:id/recusar', rota(async (req) => ({ pedido: await E.recusarPedido(req.userId, req.params.id) }), 'Erro ao recusar o pedido'));

module.exports = router;
