const express = require('express');
const { isValidId } = require('../db/ids');
const { marcarClienteExcluido } = require('../utils/fechamento');
const { comoSistema, comoUsuario } = require('../db/contexto');
const auth = require('../middleware/auth');
const Card = require('../models/Card');
const Column = require('../models/Column');
const Automacao = require('../models/Automacao');
const Task = require('../models/Task');
const Fluxo = require('../models/Fluxo');
const FluxoExecucao = require('../models/FluxoExecucao');
const Anexo = require('../models/Anexo');
const Contrato = require('../models/Contrato');
const { registrarAuditoria } = require('../utils/auditoria');
const { gerarComissaoAutomaticaSeGanho, cancelarComissaoSePerdidoAposGanho } = require('../utils/comissaoAutomatica');
const { obterRegraPorChave } = require('../utils/regrasComissao');
const { executarAcaoDeAutomacao } = require('../utils/executarAutomacao');
const { dispararWebhooks } = require('../utils/dispararWebhooks');
const { validarAtribuicao, colunaEquivalente, proximaOrdem, transferirCard } = require('../utils/atribuirLead');
const { enviarPush } = require('../utils/push');
const { chaveTelefone } = require('../utils/telefone');
const { comprasNoBalcao } = require('../utils/ligacaoClientes');
const { transacao } = require('../db/pool');
const HistoricoContato = require('../models/HistoricoContato');
const MensagemAgendada = require('../models/MensagemAgendada');
const EventoGoogleExtra = require('../models/EventoGoogleExtra');

const router = express.Router();
router.use(auth); // todas as rotas de card exigem login

// Roda depois que um card entra numa coluna que tem fluxo(s) ativo(s) — inicia a
// execução do zero pra esse cliente (se já não tiver uma rodando pra esse mesmo fluxo).
async function iniciarFluxosDaColuna(userId, colunaId, card) {
  if (!(await require('../utils/assinatura').temRecurso(userId, 'automacoes'))) return; // sequências: plano Completo
  try {
    const fluxos = await Fluxo.find({ userId, colunaGatilhoId: colunaId, ativo: true });
    for (const fluxo of fluxos) {
      if (!fluxo.etapas || !fluxo.etapas.length) continue;
      const jaExiste = await FluxoExecucao.findOne({ fluxoId: fluxo._id, cardId: card._id, concluido: false });
      if (jaExiste) continue;
      await FluxoExecucao.create({ userId, fluxoId: fluxo._id, cardId: card._id, etapaAtual: 0, iniciadoEm: new Date() });
    }
  } catch (e) {
    console.error('Erro ao iniciar fluxos:', e.message);
  }
}

// Roda depois que um card entra numa coluna — nunca deixa erro aqui quebrar a resposta principal
async function executarAutomacoesDaColuna(userId, colunaId, card) {
  try {
    const automacoes = await Automacao.find({
      userId,
      colunaGatilhoId: colunaId,
      ativa: true,
      // automações antigas (de antes desse campo existir) não têm gatilhoTipo salvo — tratamos como entrada_coluna
      $or: [{ gatilhoTipo: 'entrada_coluna' }, { gatilhoTipo: { $exists: false } }],
    });
    for (const auto of automacoes) {
      try {
        await executarAcaoDeAutomacao(userId, auto, card);
      } catch (e) {
        console.error('Erro ao executar automação:', e.message);
      }
    }
  } catch (e) {
    console.error('Erro ao buscar automações:', e.message);
  }
}

const CAMPOS_PERMITIDOS = ['columnId', 'cliente', 'valor', 'temperatura', 'telefone', 'obs', 'mes', 'mesInicioContato', 'etiquetas', 'camposPersonalizados', 'tipoProduto', 'tipoPessoa', 'cnpj', 'razaoSocial', 'inscricaoEstadual', 'ramoAtividade', 'contatoNome', 'contatoCargo'];
function filtrarCampos(body) {
  const dados = {};
  for (const campo of CAMPOS_PERMITIDOS) {
    if (body[campo] !== undefined) dados[campo] = body[campo];
  }
  return dados;
}

/* ---------- contatos duplicados ----------
   Dois contatos são o mesmo quando a chave do telefone é igual (só dígitos, sem 55, sem o 9 extra
   do celular). A tela mostra os grupos; a pessoa escolhe qual manter; o resto é juntado nele. */
// GET /api/cards/:id/balcao -> compras desse contato no PDV (cliente do PDV com o mesmo telefone)
router.get('/:id/balcao', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });
    const card = await Card.findOne({ _id: req.params.id, userId: req.userId }).select('telefone');
    if (!card) return res.status(404).json({ error: 'Contato não encontrado.' });
    res.json({ clientes: await comprasNoBalcao(req.userId, card.telefone) });
  } catch (err) {
    console.error('Erro ao ler as compras no balcão:', err.message);
    res.status(500).json({ error: 'Não foi possível ler as compras no balcão.' });
  }
});

// GET /api/cards/duplicados -> grupos de contatos com o mesmo telefone
router.get('/duplicados', async (req, res) => {
  try {
    const cards = await Card.find({ userId: req.userId, arquivado: { $ne: true } });
    const colunas = await Column.find({ userId: req.userId });
    const nomeCol = new Map(colunas.map((c) => [String(c._id), c.nome]));
    const grupos = new Map();
    for (const c of cards) {
      const k = chaveTelefone(c.telefone);
      if (!k) continue;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(c);
    }
    const lista = [...grupos.entries()].filter(([, l]) => l.length > 1).map(([chave, l]) => ({
      chave,
      contatos: l.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map((c) => ({
        id: String(c._id), cliente: c.cliente, telefone: c.telefone, valor: Number(c.valor) || 0,
        etapa: nomeCol.get(String(c.columnId)) || '', criadoEm: c.createdAt, etiquetas: c.etiquetas || [],
      })),
    }));
    res.json({ grupos: lista });
  } catch (err) {
    console.error('Erro ao procurar duplicados:', err.message);
    res.status(500).json({ error: 'Erro ao procurar contatos duplicados.' });
  }
});

// POST /api/cards/unificar { manterId, juntarIds: [...] } -> junta tudo no contato mantido e arquiva os outros
const CAMPOS_PARA_COMPLETAR = ['cnpj', 'razaoSocial', 'inscricaoEstadual', 'ramoAtividade', 'contatoNome', 'contatoCargo', 'tipoProduto', 'obs'];
router.post('/unificar', async (req, res) => {
  try {
    const manterId = String((req.body && req.body.manterId) || '');
    const juntarIds = [...new Set(((req.body && req.body.juntarIds) || []).map(String))].filter((id) => id !== manterId);
    if (!isValidId(manterId) || !juntarIds.length || juntarIds.some((id) => !isValidId(id))) {
      return res.status(400).json({ error: 'Escolha o contato que fica e pelo menos um para juntar.' });
    }
    const manter = await Card.findOne({ _id: manterId, userId: req.userId });
    const outros = await Card.find({ _id: { $in: juntarIds }, userId: req.userId });
    if (!manter || outros.length !== juntarIds.length) return res.status(404).json({ error: 'Contato não encontrado.' });
    const chave = chaveTelefone(manter.telefone);
    if (!chave || outros.some((o) => chaveTelefone(o.telefone) !== chave)) {
      return res.status(400).json({ error: 'Só dá para juntar contatos com o mesmo telefone.' });
    }
    // contato com venda (em Ganho ou com fechamento) não vai para os arquivados: a venda continuaria
    // contando no financeiro e nas comissões, mas sumiria do CRM. Quem tem a venda é que fica.
    const colunasGanho = new Set((await Column.find({ userId: req.userId, tipo: 'ganho' })).map((c) => String(c._id)));
    const temVenda = (c) => colunasGanho.has(String(c.columnId)) || !!(c.fechamento && !c.fechamento.cancelado);
    const comVenda = outros.filter(temVenda);
    if (comVenda.length) {
      const nomes = comVenda.map((c) => `"${c.cliente}"`).join(', ');
      return res.status(400).json({ error: temVenda(manter) || comVenda.length > 1
        ? `${nomes} também tem uma venda registrada. Contatos com vendas diferentes não podem ser juntados.`
        : `${nomes} já tem uma venda registrada. Escolha manter esse contato.` });
    }
    await transacao(async () => {
      const ids = outros.map((o) => o._id);
      // histórico, anexos, tarefas e o resto passam para o contato que fica
      await HistoricoContato.updateMany({ userId: req.userId, cardId: { $in: ids } }, { cardId: manter._id });
      await Anexo.updateMany({ userId: req.userId, cardId: { $in: ids } }, { cardId: manter._id });
      await Task.updateMany({ userId: req.userId, leadId: { $in: ids } }, { leadId: manter._id });
      await MensagemAgendada.updateMany({ userId: req.userId, cardId: { $in: ids } }, { cardId: manter._id });
      await EventoGoogleExtra.updateMany({ userId: req.userId, leadId: { $in: ids } }, { leadId: manter._id });
      await Contrato.updateMany({ userId: req.userId, cardId: { $in: ids } }, { cardId: manter._id });
      // etiquetas somadas; campos vazios do mantido completados com os dos outros
      const mudar = { etiquetas: [...new Set([...(manter.etiquetas || []), ...outros.flatMap((o) => o.etiquetas || [])])] };
      for (const campo of CAMPOS_PARA_COMPLETAR) {
        if (!manter[campo]) { const comValor = outros.find((o) => o[campo]); if (comValor) mudar[campo] = comValor[campo]; }
      }
      await Card.updateOne({ _id: manter._id, userId: req.userId }, mudar);
      await Card.updateMany({ _id: { $in: ids }, userId: req.userId }, { arquivado: true });
    });
    await registrarAuditoria(req.userId, 'contatos_unificados', `${outros.length + 1} contatos com o telefone ${manter.telefone || ''} viraram "${manter.cliente}"`);
    const atualizado = await Card.findOne({ _id: manter._id, userId: req.userId });
    res.json({ card: atualizado.toJSON(), arquivados: juntarIds });
  } catch (err) {
    console.error('Erro ao unificar contatos:', err.message);
    res.status(500).json({ error: 'Erro ao juntar os contatos.' });
  }
});

// POST /api/cards -> cria um novo cliente/card para o usuário logado
router.post('/', async (req, res) => {
  try {
    const dados = filtrarCampos(req.body);
    if (req.acesso && req.acesso.operador) dados.responsavelOpId = req.acesso.operador.id; // quem da equipe cadastrou
    if (!dados.mesInicioContato) dados.mesInicioContato = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()); // início de contato: hoje
    if (!dados.cliente || !dados.cliente.trim()) {
      return res.status(400).json({ error: 'Nome do cliente é obrigatório.' });
    }
    if (!dados.columnId || !isValidId(dados.columnId)) {
      return res.status(400).json({ error: 'Coluna inválida.' });
    }
    // garante que a coluna de destino pertence a este usuário
    const coluna = await Column.findOne({ _id: dados.columnId, userId: req.userId });
    if (!coluna) return res.status(404).json({ error: 'Coluna não encontrada.' });

    // modo gestor: o lead nasce já na conta de outra pessoa da equipe
    const atribuirParaId = req.body.atribuirParaId;
    if (atribuirParaId && String(atribuirParaId) !== String(req.userId)) {
      let alvoInfo;
      try { alvoInfo = await validarAtribuicao(req.userId, atribuirParaId); } catch (e) { return res.status(e.status || 400).json({ error: e.mensagem || e.message }); }
      const colunaAlvo = await colunaEquivalente(dados.columnId, alvoInfo.alvo._id);
      if (!colunaAlvo) return res.status(400).json({ error: 'A pessoa escolhida não tem uma coluna "em aberto" pra receber o lead.' });
      const ordemAlvo = await proximaOrdem(colunaAlvo._id, alvoInfo.alvo._id);
      // o lead nasce na conta de outra pessoa: grava como sistema (gestor já validado acima)
      const cardAtribuido = await comoSistema(() => Card.create({
        ...dados,
        userId: alvoInfo.alvo._id,
        columnId: colunaAlvo._id,
        ordem: ordemAlvo,
        atribuidoPorId: req.userId,
      }));
      res.status(201).json({ ...cardAtribuido.toJSON(), transferido: true, atribuidoParaNome: alvoInfo.alvo.nome || alvoInfo.alvo.email });
      enviarPush(alvoInfo.alvo._id, { titulo: 'Novo lead pra você', corpo: `${alvoInfo.gestor.nome || 'O gestor'} passou o lead "${cardAtribuido.cliente}" pra você.`, tag: `lead-${cardAtribuido._id}`, url: '/index.html', tipo: 'lead' });
      // o que acontece depois (automações, fluxos, comissão, webhooks) roda na conta de quem recebeu
      comoUsuario(alvoInfo.alvo._id, () => {
        executarAutomacoesDaColuna(alvoInfo.alvo._id, colunaAlvo._id, cardAtribuido);
        iniciarFluxosDaColuna(alvoInfo.alvo._id, colunaAlvo._id, cardAtribuido);
        gerarComissaoAutomaticaSeGanho(alvoInfo.alvo._id, cardAtribuido, colunaAlvo._id);
      });
      comoUsuario(alvoInfo.alvo._id, () => dispararWebhooks(alvoInfo.alvo._id, 'lead.criado', { id: cardAtribuido._id.toString(), cliente: cardAtribuido.cliente, telefone: cardAtribuido.telefone, valor: cardAtribuido.valor, columnId: cardAtribuido.columnId.toString() }));
      return;
    }

    const ultimoCard = await Card.findOne({ columnId: dados.columnId, userId: req.userId }).sort('-ordem');
    dados.ordem = ultimoCard ? ultimoCard.ordem + 1000 : 1000;

    const card = await Card.create({ ...dados, userId: req.userId });
    res.status(201).json(card.toJSON());
    executarAutomacoesDaColuna(req.userId, dados.columnId, card);
    iniciarFluxosDaColuna(req.userId, dados.columnId, card);
    gerarComissaoAutomaticaSeGanho(req.userId, card, dados.columnId);
    dispararWebhooks(req.userId, 'lead.criado', { id: card._id.toString(), cliente: card.cliente, telefone: card.telefone, valor: card.valor, columnId: card.columnId.toString() });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar cliente.' });
  }
});

// PUT /api/cards/:id -> atualiza os dados do cliente (edição via modal)
router.put('/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    const dados = filtrarCampos(req.body);
    if (dados.columnId) {
      const coluna = await Column.findOne({ _id: dados.columnId, userId: req.userId });
      if (!coluna) return res.status(404).json({ error: 'Coluna inválida.' });
    }

    // modo gestor: salva as alterações e passa o lead (com tudo que está ligado a ele) pra outra pessoa da equipe
    const atribuirParaId = req.body.atribuirParaId;
    if (atribuirParaId && String(atribuirParaId) !== String(req.userId)) {
      let alvoInfo;
      try { alvoInfo = await validarAtribuicao(req.userId, atribuirParaId); } catch (e) { return res.status(e.status || 400).json({ error: e.mensagem || e.message }); }
      const doGestor = await Card.findOneAndUpdate({ _id: req.params.id, userId: req.userId }, dados, { new: true, runValidators: true });
      if (!doGestor) return res.status(404).json({ error: 'Cliente não encontrado.' });
      let transferido;
      try { transferido = await transferirCard(doGestor, alvoInfo.alvo, req.userId); } catch (e) { return res.status(e.status || 500).json({ error: e.mensagem || e.message }); }
      res.json({ ...transferido.toJSON(), transferido: true, atribuidoParaNome: alvoInfo.alvo.nome || alvoInfo.alvo.email });
      enviarPush(alvoInfo.alvo._id, { titulo: 'Lead passado pra você', corpo: `${alvoInfo.gestor.nome || 'O gestor'} passou o lead "${transferido.cliente}" pra você.`, tag: `lead-${transferido._id}`, url: '/index.html', tipo: 'lead' });
      return;
    }

    // guarda o estado anterior do "mês de venda" só quando ele está sendo alterado
    // nessa edição — usado depois pra saber se está passando de vazio pra
    // preenchido de verdade (não simplesmente sendo reenviado igual)
    let mesAntesDoUpdate = null;
    let colunaAntesDoUpdate = null;
    if (dados.mes !== undefined || dados.columnId !== undefined) {
      const cardAntes = await Card.findOne({ _id: req.params.id, userId: req.userId }).select('mes columnId');
      mesAntesDoUpdate = cardAntes && dados.mes !== undefined ? cardAntes.mes : null;
      colunaAntesDoUpdate = cardAntes ? String(cardAntes.columnId) : null;
    }

    let card = await Card.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      dados,
      { new: true, runValidators: true }
    );
    if (!card) return res.status(404).json({ error: 'Cliente não encontrado.' });

    // trocar a coluna pela ficha do cliente tem o mesmo efeito de arrastar no Pipeline:
    // entrar em "ganho" gera a comissão; ir pra "perdido" depois de ganho corta a comissão
    if (dados.columnId && colunaAntesDoUpdate && String(dados.columnId) !== colunaAntesDoUpdate) {
      await gerarComissaoAutomaticaSeGanho(req.userId, card, dados.columnId);
      await cancelarComissaoSePerdidoAposGanho(req.userId, card, dados.columnId);
      const recarregado = await Card.findOne({ _id: card._id, userId: req.userId }); // a comissão pode ter preenchido o mês de venda
      if (recarregado) card = recarregado;
    }

    // Mesmo mecanismo de sincronização de mês da rota de comissões, no sentido
    // contrário: editar o mês aqui no lead também atualiza o contrato vinculado —
    // exceto quando a regra marca o mês como independente. Aceita
    // tanto "YYYY-MM" quanto "YYYY-MM-DD" (com dia) — a comissão sempre usa o dia 1
    // do mês correspondente, já que trabalha em parcelas mensais.
    if (dados.mes && /^\d{4}-\d{2}/.test(dados.mes)) {
      const contratoVinculado = await Contrato.findOne({ cardId: card._id, userId: req.userId });
      const regraVinculada = contratoVinculado ? await obterRegraPorChave(req.userId, contratoVinculado.tipoProduto) : null;
      if (contratoVinculado && !(regraVinculada && regraVinculada.mesIndependente)) {
        contratoVinculado.date = new Date(Number(dados.mes.slice(0, 4)), Number(dados.mes.slice(5, 7)) - 1, 1);
        await contratoVinculado.save();
      }
    }

    // Preencher a data de venda pela primeira vez leva o lead direto pra "Ganho" —
    // só dispara na transição de vazio pra preenchido (nunca em leads que já tinham
    // esse campo preenchido antes de agora, então não afeta leads antigos à toa).
    if (mesAntesDoUpdate !== null && !mesAntesDoUpdate && dados.mes && /^\d{4}-\d{2}/.test(dados.mes)) {
      const colunaAtual = await Column.findOne({ _id: card.columnId, userId: req.userId });
      if (colunaAtual && colunaAtual.tipo !== 'ganho') {
        const colunaGanho = await Column.findOne({ userId: req.userId, funilId: colunaAtual.funilId, tipo: 'ganho' });
        if (colunaGanho) {
          const ultimoCard = await Card.findOne({ columnId: colunaGanho._id, userId: req.userId }).sort('-ordem');
          card.columnId = colunaGanho._id;
          card.ordem = ultimoCard ? ultimoCard.ordem + 1000 : 1000;
          await card.save();
          gerarComissaoAutomaticaSeGanho(req.userId, card, colunaGanho._id);
        }
      }
    }

    res.json(card.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar cliente.' });
  }
});

// DELETE /api/cards/:id/sugestao-ia -> descarta a sugestão da IA proativa daquele card
router.delete('/:id/sugestao-ia', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    const card = await Card.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { sugestaoIA: { texto: null, tarefaTitulo: null, tarefaDias: null, geradaEm: null } },
      { new: true }
    );
    if (!card) return res.status(404).json({ error: 'Cliente não encontrado.' });
    res.json(card.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao descartar a sugestão.' });
  }
});

// PUT /api/cards/:id/arquivar -> tira o cliente de vista sem excluir
router.put('/:id/arquivar', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });
    const card = await Card.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { arquivado: true },
      { new: true }
    );
    if (!card) return res.status(404).json({ error: 'Cliente não encontrado.' });
    res.json(card.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao arquivar cliente.' });
  }
});

// PUT /api/cards/:id/desarquivar -> traz o cliente de volta pra vista normal
router.put('/:id/desarquivar', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });
    const card = await Card.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { arquivado: false },
      { new: true }
    );
    if (!card) return res.status(404).json({ error: 'Cliente não encontrado.' });
    res.json(card.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao desarquivar cliente.' });
  }
});

// PUT /api/cards/:id/move -> usado no drag and drop entre colunas
router.put('/:id/move', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    const { columnId, ordem } = req.body;
    if (!columnId || !isValidId(columnId)) {
      return res.status(400).json({ error: 'Coluna de destino inválida.' });
    }
    const coluna = await Column.findOne({ _id: columnId, userId: req.userId });
    if (!coluna) return res.status(404).json({ error: 'Coluna não encontrada.' });

    let ordemFinal = ordem;
    if (typeof ordemFinal !== 'number') {
      // sem posição específica (ex: usando o menu "Mover para") — vai pro fim da coluna
      const ultimoCard = await Card.findOne({ columnId, userId: req.userId }).sort('-ordem');
      ordemFinal = ultimoCard ? ultimoCard.ordem + 1000 : 1000;
    }

    const card = await Card.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { columnId, ordem: ordemFinal },
      { new: true }
    );
    if (!card) return res.status(404).json({ error: 'Cliente não encontrado.' });
    res.json(card.toJSON());
    executarAutomacoesDaColuna(req.userId, columnId, card);
    iniciarFluxosDaColuna(req.userId, columnId, card);
    gerarComissaoAutomaticaSeGanho(req.userId, card, columnId);
    cancelarComissaoSePerdidoAposGanho(req.userId, card, columnId);
    const dadosWebhook = { id: card._id.toString(), cliente: card.cliente, telefone: card.telefone, valor: card.valor, columnId: card.columnId.toString(), colunaNome: coluna.nome };
    dispararWebhooks(req.userId, 'lead.movido', dadosWebhook);
    if (coluna.tipo === 'ganho') dispararWebhooks(req.userId, 'lead.ganho', dadosWebhook);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao mover cliente.' });
  }
});

// DELETE /api/cards/:id -> remove o cliente (só se for do usuário logado)
router.delete('/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    const card = await Card.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!card) return res.status(404).json({ error: 'Cliente não encontrado.' });
    registrarAuditoria(req.userId, 'card_excluido', `Cliente "${card.cliente}" excluído`);
    // lançamentos do fechamento da venda ficam no financeiro, marcados "cliente excluído"
    if (card.fechamento) await marcarClienteExcluido(req.userId, card._id, card.cliente).catch((e) => console.error('Erro ao marcar lançamentos do cliente excluído:', e.message));
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir cliente.' });
  }
});

// GET /api/cards/:id/anexos -> lista os anexos de um cliente (com o arquivo já incluso — arquivos são pequenos)
router.get('/:id/anexos', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });
    const card = await Card.findOne({ _id: req.params.id, userId: req.userId });
    if (!card) return res.status(404).json({ error: 'Cliente não encontrado.' });
    const anexos = await Anexo.find({ cardId: card._id, userId: req.userId }).sort({ createdAt: -1 });
    res.json({ anexos: anexos.map((a) => a.toJSON()) });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar os anexos.' });
  }
});

// POST /api/cards/:id/anexos -> sobe um anexo novo (já em base64, gerado no navegador)
router.post('/:id/anexos', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });
    const { nomeArquivo, tipoMime, dadosBase64 } = req.body;
    if (!nomeArquivo || !dadosBase64) return res.status(400).json({ error: 'Arquivo inválido.' });
    if (dadosBase64.length > 4 * 1024 * 1024) {
      return res.status(400).json({ error: 'Arquivo muito grande. O limite é de aproximadamente 3 MB por anexo.' });
    }
    const card = await Card.findOne({ _id: req.params.id, userId: req.userId });
    if (!card) return res.status(404).json({ error: 'Cliente não encontrado.' });

    const anexo = await Anexo.create({
      userId: req.userId,
      cardId: card._id,
      nomeArquivo,
      tipoMime: tipoMime || 'application/octet-stream',
      dadosBase64,
      tamanho: Math.round((dadosBase64.length * 3) / 4), // estimativa do tamanho original a partir do base64
    });
    res.status(201).json(anexo.toJSON());
  } catch (err) {
    res.status(500).json({ error: 'Erro ao subir o anexo.' });
  }
});

// DELETE /api/cards/:id/anexos/:anexoId -> remove um anexo
router.delete('/:id/anexos/:anexoId', async (req, res) => {
  try {
    if (!isValidId(req.params.anexoId)) return res.status(400).json({ error: 'ID inválido.' });
    const anexo = await Anexo.findOneAndDelete({ _id: req.params.anexoId, cardId: req.params.id, userId: req.userId });
    if (!anexo) return res.status(404).json({ error: 'Anexo não encontrado.' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir o anexo.' });
  }
});

module.exports = router;
