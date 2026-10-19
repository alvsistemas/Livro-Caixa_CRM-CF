const express = require('express');
const { isValidId } = require('../db/ids');
const { query } = require('../db/pool');
const auth = require('../middleware/auth');
const Fluxo = require('../models/Fluxo');
const FluxoExecucao = require('../models/FluxoExecucao');
const Column = require('../models/Column');

const router = express.Router();
router.use(auth); // todas as rotas de fluxo exigem login

// 'mensagem' (envio pelo WhatsApp) saiu junto com a integração; fluxos antigos com ela precisam trocar a etapa
const TIPOS_ETAPA = ['tarefa', 'mover_coluna'];

function validarEtapas(etapas) {
  if (!Array.isArray(etapas) || !etapas.length) return 'Adicione ao menos uma etapa.';
  for (const etapa of etapas) {
    if (etapa.tipo === 'mensagem') return 'A etapa de enviar WhatsApp não está mais disponível. Troque o tipo dela ou remova.';
    if (!TIPOS_ETAPA.includes(etapa.tipo)) return 'Tipo de etapa inválido.';
    if (typeof etapa.diasAposInicio !== 'number' || etapa.diasAposInicio < 0) return 'Dias inválidos numa das etapas.';
    if (etapa.tipo === 'mover_coluna' && (!etapa.params || !etapa.params.colunaDestinoId)) {
      return 'Escolha a coluna de destino em todas as etapas de mover coluna.';
    }
  }
  return null;
}

// GET /api/fluxos -> lista os fluxos do usuário, com quantos clientes estão em andamento em cada um
router.get('/', async (req, res) => {
  try {
    const fluxos = await Fluxo.find({ userId: req.userId }).sort({ createdAt: -1 });
    const { rows: contagens } = await query(
      'SELECT fluxo_id, count(*)::int AS total FROM fluxo_execucoes WHERE user_id = $1::uuid AND concluido = false GROUP BY fluxo_id',
      [req.userId]
    );
    const mapaContagem = new Map(contagens.map((c) => [String(c.fluxo_id), c.total]));
    res.json({
      fluxos: fluxos.map((f) => {
        const json = f.toJSON();
        json.emAndamento = mapaContagem.get(f._id.toString()) || 0;
        return json;
      }),
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar fluxos.' });
  }
});

// POST /api/fluxos -> cria um novo fluxo
router.post('/', async (req, res) => {
  try {
    const { nome, colunaGatilhoId, etapas } = req.body;
    if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome do fluxo é obrigatório.' });
    if (!colunaGatilhoId || !isValidId(colunaGatilhoId)) {
      return res.status(400).json({ error: 'Coluna de gatilho inválida.' });
    }
    const erroEtapas = validarEtapas(etapas);
    if (erroEtapas) return res.status(400).json({ error: erroEtapas });

    const coluna = await Column.findOne({ _id: colunaGatilhoId, userId: req.userId });
    if (!coluna) return res.status(404).json({ error: 'Coluna de gatilho não encontrada.' });

    const fluxo = await Fluxo.create({
      userId: req.userId,
      nome: nome.trim(),
      colunaGatilhoId,
      etapas: etapas.map((e) => ({ diasAposInicio: e.diasAposInicio, tipo: e.tipo, params: e.params || {} })),
    });
    res.status(201).json(fluxo.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar fluxo.' });
  }
});

// PUT /api/fluxos/:id -> edita nome, coluna de gatilho, etapas ou ativo/inativo
router.put('/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });
    const updates = {};
    if (typeof req.body.nome === 'string') updates.nome = req.body.nome.trim();
    if (typeof req.body.ativo === 'boolean') updates.ativo = req.body.ativo;
    if (req.body.etapas) {
      const erroEtapas = validarEtapas(req.body.etapas);
      if (erroEtapas) return res.status(400).json({ error: erroEtapas });
      updates.etapas = req.body.etapas.map((e) => ({ diasAposInicio: e.diasAposInicio, tipo: e.tipo, params: e.params || {} }));
    }
    if (req.body.colunaGatilhoId && isValidId(req.body.colunaGatilhoId)) {
      const coluna = await Column.findOne({ _id: req.body.colunaGatilhoId, userId: req.userId });
      if (!coluna) return res.status(404).json({ error: 'Coluna de gatilho não encontrada.' });
      updates.colunaGatilhoId = req.body.colunaGatilhoId;
    }

    const fluxo = await Fluxo.findOneAndUpdate({ _id: req.params.id, userId: req.userId }, updates, { new: true, runValidators: true });
    if (!fluxo) return res.status(404).json({ error: 'Fluxo não encontrado.' });
    res.json(fluxo.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar fluxo.' });
  }
});

// DELETE /api/fluxos/:id -> exclui o fluxo e as execuções em andamento dele
router.delete('/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });
    const fluxo = await Fluxo.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!fluxo) return res.status(404).json({ error: 'Fluxo não encontrado.' });
    await FluxoExecucao.deleteMany({ fluxoId: fluxo._id });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir fluxo.' });
  }
});

module.exports = router;
