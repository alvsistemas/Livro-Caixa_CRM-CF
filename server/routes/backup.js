const express = require('express');
const { restaurarPdv } = require('../utils/backupPdv');
const auth = require('../middleware/auth');

const User = require('../models/User');
const { montarBackup } = require('../utils/backupDados');
const { emailConfigurado } = require('../utils/email');
const { enviarBackupPorEmail } = require('../utils/backupScheduler');
const RegraComissao = require('../models/RegraComissao');
const Card = require('../models/Card');
const Column = require('../models/Column');
const Funil = require('../models/Funil');
const Task = require('../models/Task');
const Contrato = require('../models/Contrato');
const Message = require('../models/Message');
const Automacao = require('../models/Automacao');
const Fluxo = require('../models/Fluxo');
const FluxoExecucao = require('../models/FluxoExecucao');
const CampoPersonalizado = require('../models/CampoPersonalizado');
const MensagemAgendada = require('../models/MensagemAgendada');
const MetaVendas = require('../models/MetaVendas');
const PossivelLead = require('../models/PossivelLead');
const Anexo = require('../models/Anexo');

const { SECOES, validarSecao, salvarSecaoFinanceiro } = require('../utils/financeiro');
const { normalizarId } = require('../db/ids');

const router = express.Router();
router.use(auth);

// GET /api/backup/exportar-tudo -> baixa um arquivo com todos os dados do usuário logado
// (clientes, tarefas, comissões, mensagens, automações, anexos, etc.), pra guardar como cópia de segurança.
router.get('/exportar-tudo', async (req, res) => {
  try {
    const backup = await montarBackup(req.userId, { incluirAnexos: true });
    const nomeArquivo = `backup-painel-crm-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    console.error('Erro ao gerar backup:', err);
    res.status(500).json({ error: 'Erro ao gerar o backup. Tente novamente.' });
  }
});

// GET /api/backup/automatico -> estado do backup semanal por e-mail
router.get('/automatico', async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('backupAutomatico email');
    res.json({
      disponivel: emailConfigurado(), // o servidor tem e-mail configurado?
      ativo: !!(user && user.backupAutomatico && user.backupAutomatico.ativo),
      ultimoEnvio: (user && user.backupAutomatico && user.backupAutomatico.ultimoEnvio) || null,
      email: user ? user.email : '',
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar a configuração do backup automático.' });
  }
});

// PUT /api/backup/automatico -> { ativo } liga/desliga o backup semanal por e-mail
router.put('/automatico', async (req, res) => {
  try {
    if (!emailConfigurado()) {
      return res.status(503).json({ error: 'O envio de e-mail não está configurado neste servidor.' });
    }
    const ativo = !!(req.body && req.body.ativo);
    await User.updateOne({ _id: req.userId }, { 'backupAutomatico.ativo': ativo });
    res.json({ ativo });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar a configuração do backup automático.' });
  }
});

// POST /api/backup/automatico/enviar-agora -> manda um backup por e-mail agora mesmo (pra testar)
router.post('/automatico/enviar-agora', async (req, res) => {
  try {
    if (!emailConfigurado()) {
      return res.status(503).json({ error: 'O envio de e-mail não está configurado neste servidor.' });
    }
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const r = await enviarBackupPorEmail(user);
    res.json({ enviado: true, ...r });
  } catch (err) {
    console.error('Erro ao enviar backup por e-mail:', err.message);
    res.status(500).json({ error: 'Não foi possível enviar o e-mail. Confira a configuração do Resend.' });
  }
});

// Restaura uma lista de documentos (do jeito que saem do backup, com "id" em vez de
// "_id") de volta no banco — usa o MESMO _id de antes, então os vínculos entre
// coleções (tarefa -> cliente, mensagem -> cliente, etc.) continuam funcionando.
// Sempre força o dado a pertencer ao usuário que está importando, nunca ao que
// estava gravado no arquivo — evita qualquer chance de um backup "vestir" outra conta.
async function restaurarColecao(Model, itens, userId) {
  let ok = 0;
  let erro = 0;
  for (const item of itens || []) {
    try {
      const { id, ...resto } = item;
      if (!id || !normalizarId(id)) { erro++; continue; }
      // só os campos que este modelo conhece (backups antigos podem ter campos a mais)
      const dados = {};
      for (const [k, v] of Object.entries(resto)) if (Model.temCampo(k)) dados[k] = v;
      delete dados.userId;
      dados.userId = userId;
      const gravar = () => Model.findOneAndUpdate(
        { _id: id },
        { $set: dados },
        { upsert: true, setDefaultsOnInsert: true, runValidators: true }
      );
      try {
        await gravar();
      } catch (e) {
        // ligação com algo que não existe mais (ex.: tarefa de um cliente já apagado):
        // limpa os vínculos opcionais e tenta de novo
        if (e.code !== '23503' || !Model.idsOpcionais.length) throw e;
        Model.idsOpcionais.forEach((campo) => { if (campo in dados) dados[campo] = null; });
        await gravar();
      }
      ok++;
    } catch (e) {
      erro++;
    }
  }
  return { ok, erro };
}

// Converte os nomes de campo do CRM antigo (tipoCarta / creditoValor) pros atuais
// (tipoProduto / valorVenda). Não mexe em nada se o backup já for da versão nova.
function converterBackupAntigo(backup) {
  const renomear = (item, antigo, novo) => {
    if (item && typeof item === 'object' && item[antigo] !== undefined && item[novo] === undefined) {
      item[novo] = item[antigo];
      delete item[antigo];
    }
  };
  (Array.isArray(backup.clientes) ? backup.clientes : []).forEach((c) => renomear(c, 'tipoCarta', 'tipoProduto'));
  (Array.isArray(backup.comissoes) ? backup.comissoes : []).forEach((c) => {
    renomear(c, 'tipoCarta', 'tipoProduto');
    renomear(c, 'creditoValor', 'valorVenda');
  });
  // IDs do MongoDB (24 caracteres hexadecimais) guardados DENTRO de configurações, como
  // a coluna de destino de uma automação ou de um fluxo, viram o UUID equivalente — os IDs
  // dos próprios registros já são convertidos na gravação.
  const converterIds = (v) => {
    if (typeof v === 'string') return /^[0-9a-f]{24}$/i.test(v) ? normalizarId(v) : v;
    if (Array.isArray(v)) return v.map(converterIds);
    if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) v[k] = converterIds(v[k]);
      return v;
    }
    return v;
  };
  ['automacoes', 'fluxos'].forEach((chave) => {
    (Array.isArray(backup[chave]) ? backup[chave] : []).forEach((item) => {
      if (item && item.acaoParams) item.acaoParams = converterIds(item.acaoParams);
      if (item && item.etapas) item.etapas = converterIds(item.etapas);
    });
  });
  return backup;
}

// POST /api/backup/importar-tudo -> restaura um backup gerado por /exportar-tudo.
// Não apaga nada que já existe — atualiza o que já tinha o mesmo id, e cria o que
// for novo (upsert). Sempre associado à conta de quem está fazendo a importação.
router.post('/importar-tudo', async (req, res) => {
  try {
    const backup = req.body;
    if (!backup || typeof backup !== 'object') {
      return res.status(400).json({ error: 'Arquivo de backup inválido.' });
    }
    const userId = req.userId;

    // ordem importa: cada coleção vem depois das que ela referencia (funil -> coluna -> cliente...)
    const mapaColecoes = [
      ['funis', Funil],
      ['colunas', Column],
      ['clientes', Card],
      ['anexos', Anexo],
      ['tarefas', Task],
      ['comissoes', Contrato],
      ['regrasDeComissao', RegraComissao],
      ['mensagensWhatsapp', Message],
      ['automacoes', Automacao],
      ['fluxos', Fluxo],
      ['execucoesDeFluxo', FluxoExecucao],
      ['camposPersonalizados', CampoPersonalizado],
      ['mensagensAgendadas', MensagemAgendada],
      ['metasDeVendas', MetaVendas],
      ['possiveisLeads', PossivelLead],
    ];

    // Backups do CRM de consórcio (versão antiga) usam outros nomes de campo — converte
    // pra que clientes e comissões antigos entrem certinho nesta versão.
    converterBackupAntigo(backup);

    const resultado = {};
    for (const [chave, Model] of mapaColecoes) {
      resultado[chave] = await restaurarColecao(Model, backup[chave], userId);
    }

    // PDV: produtos, estoque, clientes, vendas, caixas, mesas… (backups de antes desta versão só
    // tinham uma cópia para consulta, em "caixaEstoque", que não dá para restaurar)
    if (backup.pdv && typeof backup.pdv === 'object') {
      resultado.pdv = await restaurarPdv(userId, backup.pdv);
    } else if (backup.caixaEstoque) {
      resultado.pdv = { aviso: 'Este backup é de uma versão antiga: o PDV veio só para consulta e não foi restaurado.' };
    }

    // Controle financeiro: substitui as seções que vieram no arquivo.
    if (backup.controleFinanceiro && typeof backup.controleFinanceiro === 'object') {
      const atualizacao = {};
      let erro = 0;
      for (const secao of SECOES) {
        if (backup.controleFinanceiro[secao] === undefined) continue;
        const r = validarSecao(secao, backup.controleFinanceiro[secao]);
        if (r.ok) atualizacao[secao] = r.valor; else erro++;
      }
      try {
        for (const [secao, valor] of Object.entries(atualizacao)) await salvarSecaoFinanceiro(userId, secao, valor);
        resultado.controleFinanceiro = { ok: Object.keys(atualizacao).length, erro };
      } catch (e) {
        resultado.controleFinanceiro = { ok: 0, erro: erro + 1 };
      }
    }

    res.json({ resultado });
  } catch (err) {
    console.error('Erro ao importar backup:', err);
    res.status(500).json({ error: 'Erro ao importar o backup. Confira se o arquivo é o correto.' });
  }
});

module.exports = router;
module.exports.converterBackupAntigo = converterBackupAntigo;
