const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const ErrorLog = require('../models/ErrorLog');
const { query } = require('../db/pool');

// "Supervisor de dados" em qualquer uma das equipes da pessoa (não só na que está aberta)
async function podeVer(userId) {
  const user = await User.findById(userId).select('supervisorDeDados');
  if (user && user.supervisorDeDados) return true;
  const { rows } = await query('SELECT 1 FROM equipe_membros WHERE user_id = $1 AND supervisor_dados LIMIT 1', [String(userId)]);
  return rows.length > 0;
}

const router = express.Router();
router.use(auth);

// GET /api/monitoramento/erros -> últimos erros registrados no sistema (só supervisor de dados)
router.get('/erros', async (req, res) => {
  try {
    if (!(await podeVer(req.userId))) {
      return res.status(403).json({ error: 'Só quem tem acesso de supervisor de dados pode ver o monitoramento de erros.' });
    }
    const erros = await ErrorLog.find({}).sort({ createdAt: -1 }).limit(100);
    res.json({ erros: erros.map((e) => e.toJSON()) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar o monitoramento.' });
  }
});

// DELETE /api/monitoramento/erros -> limpa o log (só supervisor de dados)
router.delete('/erros', async (req, res) => {
  try {
    if (!(await podeVer(req.userId))) {
      return res.status(403).json({ error: 'Só quem tem acesso de supervisor de dados pode limpar o monitoramento de erros.' });
    }
    await ErrorLog.deleteMany({});
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao limpar o monitoramento.' });
  }
});

module.exports = router;
