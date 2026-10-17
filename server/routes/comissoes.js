const express = require('express');
const { isValidId } = require('../db/ids');
const auth = require('../middleware/auth');
const Contrato = require('../models/Contrato');
const Card = require('../models/Card');
const { calcComissaoPorRegra } = require('../utils/comissaoCalc');
const { obterRegraPorChave } = require('../utils/regrasComissao');

const router = express.Router();
router.use(auth); // todas as rotas de comissão exigem login

// GET /api/comissoes -> todos os contratos do usuário logado
router.get('/', async (req, res) => {
  try {
    const contratos = await Contrato.find({ userId: req.userId }).sort({ date: -1, createdAt: -1 });
    res.json({ contratos: contratos.map((c) => c.toJSON()) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar comissões.' });
  }
});

// POST /api/comissoes -> cria um novo contrato (calcula as parcelas automaticamente)
router.post('/', async (req, res) => {
  try {
    const { desc, scope, date, valorVenda, tipoProduto } = req.body;
    if (!desc || !desc.trim()) {
      return res.status(400).json({ error: 'Descrição do contrato é obrigatória.' });
    }
    if (!date) {
      return res.status(400).json({ error: 'Mês da 1ª parcela é obrigatório.' });
    }
    const valorNum = parseFloat(valorVenda) || 0;
    if (valorNum <= 0) {
      return res.status(400).json({ error: 'Valor da venda é obrigatório.' });
    }
    const tipo = tipoProduto && String(tipoProduto).trim() ? String(tipoProduto).trim() : 'padrao';
    const regra = await obterRegraPorChave(req.userId, tipo);

    const { parcelas, parcelas1, value, value2, blocos } = calcComissaoPorRegra(valorNum, regra);
    const contrato = await Contrato.create({
      userId: req.userId,
      desc: desc.trim(),
      scope: scope === 'Empresa' ? 'Empresa' : 'Pessoal',
      date: new Date(date),
      valorVenda: valorNum,
      tipoProduto: tipo,
      regraNome: regra.nome || '',
      parcelas,
      parcelas1,
      value,
      value2,
      blocos,
    });
    res.status(201).json(contrato.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar contrato.' });
  }
});

// PUT /api/comissoes/:id -> edita um contrato (recalcula as parcelas se o valor da venda ou o tipo mudar)
router.put('/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    const { desc, scope, date, valorVenda, tipoProduto } = req.body;
    const updates = {};
    if (typeof desc === 'string') updates.desc = desc.trim();
    if (scope) updates.scope = scope === 'Empresa' ? 'Empresa' : 'Pessoal';
    if (date) updates.date = new Date(date);
    if (Object.prototype.hasOwnProperty.call(req.body, 'canceladoNoMes')) {
      updates.canceladoNoMes = req.body.canceladoNoMes || null;
    }
    if (valorVenda !== undefined || tipoProduto !== undefined) {
      const contratoAtual = await Contrato.findOne({ _id: req.params.id, userId: req.userId }).select('valorVenda tipoProduto');
      if (!contratoAtual) return res.status(404).json({ error: 'Contrato não encontrado.' });
      const valorNum = valorVenda !== undefined ? (parseFloat(valorVenda) || 0) : contratoAtual.valorVenda;
      const tipo = tipoProduto !== undefined
        ? (String(tipoProduto).trim() || 'padrao')
        : (contratoAtual.tipoProduto || 'padrao');
      const regra = await obterRegraPorChave(req.userId, tipo);
      const { parcelas, parcelas1, value, value2, blocos } = calcComissaoPorRegra(valorNum, regra);
      updates.valorVenda = valorNum;
      updates.tipoProduto = tipo;
      updates.regraNome = regra.nome || '';
      updates.value = value;
      updates.value2 = value2;
      updates.parcelas = parcelas;
      updates.parcelas1 = parcelas1;
      updates.blocos = blocos;
    }

    const contrato = await Contrato.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      updates,
      { new: true, runValidators: true }
    );
    if (!contrato) return res.status(404).json({ error: 'Contrato não encontrado.' });

    // O mês do contrato e o mês do lead ficam sincronizados nos dois sentidos — exceto quando
    // a regra dessa comissão marca o mês como independente (pagamentos que podem demorar a
    // acontecer de verdade).
    const regraDoContrato = await obterRegraPorChave(req.userId, contrato.tipoProduto);
    if (date && contrato.cardId && !regraDoContrato.mesIndependente) {
      const novoMes = contrato.date.toISOString().slice(0, 10); // "YYYY-MM-DD" — o contrato sempre usa o dia 1, mas mantém o formato de data completa igual ao do lead
      await Card.findOneAndUpdate({ _id: contrato.cardId, userId: req.userId }, { mes: novoMes });
    }

    res.json(contrato.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar contrato.' });
  }
});

// DELETE /api/comissoes/:id -> remove o contrato
router.delete('/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    const contrato = await Contrato.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!contrato) return res.status(404).json({ error: 'Contrato não encontrado.' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir contrato.' });
  }
});

module.exports = router;
