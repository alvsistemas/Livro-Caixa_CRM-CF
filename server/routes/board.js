const express = require('express');
const auth = require('../middleware/auth');
const Column = require('../models/Column');
const Card = require('../models/Card');

const router = express.Router();
// vendedor com "vê só os contatos dele" (opção do gestor): só os que ele cadastrou
function filtroDeContatos(req) {
  const a = req.acesso;
  if (a && a.tipo !== 'dono' && a.operador && !a.perm.config && a.soMeusContatos) return { userId: req.userId, responsavelOpId: a.operador.id };
  return { userId: req.userId };
}

// GET /api/board -> colunas + cards, só do usuário logado
router.get('/', auth, async (req, res) => {
  try {
    const [columns, cards] = await Promise.all([
      Column.find({ userId: req.userId }).sort({ ordem: 1, createdAt: 1 }),
      Card.find(filtroDeContatos(req)).sort({ createdAt: 1 }),
    ]);
    res.json({
      columns: columns.map((c) => c.toJSON()),
      cards: cards.map((c) => c.toJSON()),
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar o quadro.' });
  }
});

module.exports = router;
