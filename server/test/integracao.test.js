/* Testes de ponta a ponta com um PostgreSQL de verdade.

   Só rodam quando TEST_DATABASE_URL aponta pra um banco de TESTE (ele é apagado e recriado):
     TEST_DATABASE_URL=postgres://usuario:senha@127.0.0.1:5432/livro_teste node --test
   Sem essa variável (ex.: no Render), são pulados. O usuário do banco precisa poder criar
   papéis (CREATEROLE) pra migração criar o papel livro_app, que é o que garante o RLS. */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

const URL_TESTE = process.env.TEST_DATABASE_URL;
const pular = !URL_TESTE && 'defina TEST_DATABASE_URL para rodar os testes com banco';

describe('API com PostgreSQL (integração)', { skip: pular }, () => {
  let servidor;
  let base;
  let pool;
  const api = async (metodo, caminho, corpo, token) => {
    const res = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    let dados = null;
    const texto = await res.text();
    try { dados = texto ? JSON.parse(texto) : null; } catch (e) { dados = texto; }
    return { status: res.status, dados };
  };
  const contas = {};

  before(async () => {
    process.env.DATABASE_URL = URL_TESTE;
    process.env.JWT_SECRET = 'segredo-de-teste';
    const { obterPool } = require('../db/pool');
    pool = obterPool();
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await require('../db/migrar').migrar({ silencioso: true });
    const papel = await pool.query("SELECT 1 FROM pg_roles WHERE rolname = 'livro_app'");
    assert.equal(papel.rows.length, 1, 'a migração não criou o papel livro_app');
    const { app } = require('../server');
    await new Promise((ok) => { servidor = app.listen(0, ok); });
    base = `http://127.0.0.1:${servidor.address().port}`;
  });

  after(async () => {
    if (servidor) await new Promise((ok) => servidor.close(ok));
    await require('../db/pool').encerrar();
  });

  test('cadastro e login criam o funil padrão', async () => {
    for (const nome of ['ana', 'bia', 'caio']) {
      const r = await api('POST', '/api/auth/register', { nome: nome.toUpperCase(), email: `${nome}@teste.com`, senha: 'senha123' });
      assert.equal(r.status, 201, JSON.stringify(r.dados));
      contas[nome] = { token: r.dados.token, id: r.dados.user.id };
    }
    const dup = await api('POST', '/api/auth/register', { email: 'ANA@teste.com', senha: 'senha123' });
    assert.equal(dup.status, 409);
    const login = await api('POST', '/api/auth/login', { email: 'ana@teste.com', senha: 'senha123' });
    assert.equal(login.status, 200);
    const board = await api('GET', '/api/board', undefined, contas.ana.token);
    assert.equal(board.status, 200);
    assert.equal(board.dados.columns.length, 5);
    contas.ana.colunas = board.dados.columns;
  });

  test('todas as listagens respondem sem erro', async () => {
    const t = contas.ana.token;
    const rotas = ['/api/auth/me', '/api/funis', '/api/tasks', '/api/comissoes', '/api/regras-comissao', '/api/agendamentos',
      '/api/auditoria', '/api/automacoes', '/api/fluxos', '/api/campos-personalizados', '/api/possiveis-leads',
      '/api/webhooks-saida', '/api/whatsapp/status', '/api/whatsapp/menu-triagem', '/api/whatsapp/conversas',
      '/api/instagram/status', '/api/calendar/status', '/api/calendar/ics-status', '/api/config/integracoes',
      '/api/equipe', '/api/metas/2026-10', '/api/gerot/2026-10-12', '/api/backup/automatico', '/api/financeiro',
      '/api/push/chave'];
    for (const rota of rotas) {
      const r = await api('GET', rota, undefined, t);
      const esperado = r.status < 500 || (rota === '/api/push/chave' && r.status === 503); // 503 = push não configurado
      assert.ok(esperado, `${rota} respondeu ${r.status}: ${JSON.stringify(r.dados)}`);
    }
  });

  test('cliente: criar, editar, mover para ganho gera comissão; dinheiro com centavos exatos', async () => {
    const t = contas.ana.token;
    const leads = contas.ana.colunas.find((c) => c.nome === 'Leads');
    const ganho = contas.ana.colunas.find((c) => c.tipo === 'ganho');
    const c = await api('POST', '/api/cards', { cliente: 'João Silva', columnId: leads.id, valor: 10000.555, telefone: '(15) 99999-1234', etiquetas: ['vip'] }, t);
    assert.equal(c.status, 201, JSON.stringify(c.dados));
    assert.equal(c.dados.valor, 10000.56);
    contas.ana.card = c.dados;
    const ed = await api('PUT', `/api/cards/${c.dados.id}`, { obs: 'cliente bom', temperatura: 'quente' }, t);
    assert.equal(ed.status, 200, JSON.stringify(ed.dados));
    assert.equal(ed.dados.temperatura, 'quente');
    const mv = await api('PUT', `/api/cards/${c.dados.id}/move`, { columnId: ganho.id, ordem: 1000 }, t);
    assert.equal(mv.status, 200, JSON.stringify(mv.dados));
    await new Promise((ok) => setTimeout(ok, 400)); // comissão é gerada logo depois de responder
    const com = await api('GET', '/api/comissoes', undefined, t);
    assert.equal(com.dados.contratos.length, 1);
    assert.equal(com.dados.contratos[0].valorVenda, 10000.56);
    assert.equal(com.dados.contratos[0].value, 500.03); // 5% da regra padrão
    const inval = await api('PUT', '/api/cards/nao-e-um-id', { obs: 'x' }, t);
    assert.equal(inval.status, 400);
  });

  test('trocar a coluna pela ficha do cliente também gera a comissão', async () => {
    const t = contas.ana.token;
    const leads = contas.ana.colunas.find((c) => c.nome === 'Leads');
    const ganho = contas.ana.colunas.find((c) => c.tipo === 'ganho');
    const c = await api('POST', '/api/cards', { cliente: 'Pela ficha', columnId: leads.id, valor: 2000 }, t);
    const ed = await api('PUT', `/api/cards/${c.dados.id}`, { columnId: ganho.id, valor: 2000 }, t);
    assert.equal(ed.status, 200, JSON.stringify(ed.dados));
    assert.match(ed.dados.mes, /^\d{4}-\d{2}/);
    const com = await api('GET', '/api/comissoes', undefined, t);
    assert.ok(com.dados.contratos.some((x) => x.desc === 'Pela ficha'));
    await api('DELETE', `/api/cards/${c.dados.id}`, undefined, t);
  });

  test('isolamento: outra pessoa não vê nem altera os dados', async () => {
    const card = contas.ana.card;
    const bia = contas.bia.token;
    const board = await api('GET', '/api/board', undefined, bia);
    assert.ok(!board.dados.cards.some((c) => c.id === card.id));
    const ed = await api('PUT', `/api/cards/${card.id}`, { obs: 'invadido' }, bia);
    assert.equal(ed.status, 404);
    const del = await api('DELETE', `/api/cards/${card.id}`, undefined, bia);
    assert.ok([404, 204, 200].includes(del.status));
    const conf = await api('GET', '/api/board', undefined, contas.ana.token);
    const ainda = conf.dados.cards.find((c) => c.id === card.id);
    assert.ok(ainda, 'o card da Ana sumiu depois que a Bia tentou apagar');
    assert.equal(ainda.obs, 'cliente bom');
  });

  test('o banco barra acesso cruzado mesmo sem filtro no código (Row-Level Security)', async () => {
    const { comoUsuario } = require('../db/contexto');
    const Card = require('../models/Card');
    const todosDaBia = await comoUsuario(contas.bia.id, () => Card.find({}));
    assert.equal(todosDaBia.length, 0);
    const todosDaAna = await comoUsuario(contas.ana.id, () => Card.find({}));
    assert.equal(todosDaAna.length, 1);
    const r = await comoUsuario(contas.bia.id, () => Card.updateMany({}, { obs: 'hack' }));
    assert.equal(r.modifiedCount, 0);
  });

  test('tarefas, histórico, regras de comissão, rotina, metas, campos e automações', async () => {
    const t = contas.ana.token;
    const card = contas.ana.card;
    const tk = await api('POST', '/api/tasks', { titulo: 'Ligar amanhã', leadId: card.id, prioridade: 'alta', vencimento: '2026-10-20' }, t);
    assert.equal(tk.status, 201, JSON.stringify(tk.dados));
    const tg = await api('PUT', `/api/tasks/${tk.dados.id}/toggle`, {}, t);
    assert.equal(tg.status, 200);
    assert.equal(tg.dados.concluida, true);
    const hist = await api('POST', '/api/historico-contato', { cardId: card.id, texto: 'Ligou e pediu proposta' }, t);
    assert.ok(hist.status < 300, JSON.stringify(hist.dados));
    const lh = await api('GET', `/api/historico-contato/${card.id}`, undefined, t);
    assert.ok(lh.status < 300);
    const regra = await api('POST', '/api/regras-comissao', { nome: 'Serviço Premium', blocos: [{ parcelas: 3, percentual: 2 }] }, t);
    assert.ok(regra.status < 300, JSON.stringify(regra.dados));
    const meta = await api('PUT', '/api/metas/2026-10', { valorMeta: 50000.5 }, t);
    assert.equal(meta.status, 200);
    const metaL = await api('GET', '/api/metas/2026-10', undefined, t);
    assert.equal(metaL.dados.valorMeta, 50000.5);
    const bloco = await api('PUT', '/api/gerot', { semanaInicio: '2026-10-12', diaSemana: 0, horarioInicio: '08:00', horarioFim: '09:00', texto: 'Prospecção' }, t);
    assert.ok(bloco.status < 300, JSON.stringify(bloco.dados));
    const campo = await api('POST', '/api/campos-personalizados', { nome: 'CPF', tipo: 'texto' }, t);
    assert.ok(campo.status < 300, JSON.stringify(campo.dados));
    const leads = contas.ana.colunas.find((c) => c.nome === 'Leads');
    const auto = await api('POST', '/api/automacoes', { nome: 'Tarefa ao entrar', colunaGatilhoId: leads.id, acaoTipo: 'criar_tarefa', acaoParams: { titulo: 'Primeiro contato', dias: 1 } }, t);
    assert.ok(auto.status < 300, JSON.stringify(auto.dados));
    const c2 = await api('POST', '/api/cards', { cliente: 'Maria', columnId: leads.id }, t);
    assert.equal(c2.status, 201);
    await new Promise((ok) => setTimeout(ok, 400));
    const tarefas = await api('GET', '/api/tasks', undefined, t);
    assert.ok(tarefas.dados.tasks.some((x) => x.titulo === 'Primeiro contato'), 'a automação não criou a tarefa');
  });

  test('Controle financeiro: salva em tabelas e devolve igual, com centavos exatos', async () => {
    const t = contas.ana.token;
    const txs = [
      { id: 'a1', date: '2026-10-05', desc: 'Aluguel', type: 'Despesa', category: 'Aluguel Comercial', scope: 'Empresa', account: 'Boleto', status: 'Pago', value: 2200.1, recurrence: 'fixo', parcelas: null },
      { id: 'a2', date: '2026-10-07', desc: 'Notebook', type: 'Despesa', category: 'Ferramentas/Software', scope: 'Pessoal', account: 'Cartão de Crédito', status: 'Pago', value: 0.1 + 0.2, recurrence: 'parcelado', parcelas: 10, campoNovo: 'fica nos extras' },
    ];
    assert.equal((await api('PUT', '/api/financeiro/transacoes', { valor: txs }, t)).status, 200);
    assert.equal((await api('PUT', '/api/financeiro/perfil', { valor: { name: 'Ana', character: 'lily', plan: 'gratis', photo: null } }, t)).status, 200);
    assert.equal((await api('PUT', '/api/financeiro/config', { valor: { integracaoCrm: 'vendas' } }, t)).status, 200);
    assert.equal((await api('PUT', '/api/financeiro/cartoes', { valor: [{ id: 'c1', name: 'Nubank', limit: 5000, dueDay: 10, bestDay: 3 }] }, t)).status, 200);
    const r = await api('GET', '/api/financeiro', undefined, t);
    assert.equal(r.dados.dados.transacoes.length, 2);
    const nb = r.dados.dados.transacoes.find((x) => x.id === 'a2');
    assert.equal(nb.value, 0.3);
    assert.equal(nb.campoNovo, 'fica nos extras');
    assert.equal(nb.parcelas, 10);
    assert.equal(r.dados.dados.perfil.character, 'lily');
    assert.equal(r.dados.dados.cartoes[0].limit, 5000);
    // remover um item da lista apaga a linha
    assert.equal((await api('PUT', '/api/financeiro/transacoes', { valor: [txs[0]] }, t)).status, 200);
    const r2 = await api('GET', '/api/financeiro', undefined, t);
    assert.deepEqual(r2.dados.dados.transacoes.map((x) => x.id), ['a1']);
    // outra pessoa não vê nada
    const rb = await api('GET', '/api/financeiro', undefined, contas.bia.token);
    assert.equal(rb.dados.dados.transacoes.length, 0);
    assert.equal(rb.dados.dados.perfil, null);
    assert.equal((await api('PUT', '/api/financeiro/senhas', { valor: [] }, t)).status, 400);
  });

  test('equipe: gestor vê o resumo dos membros e passa um lead pra outra pessoa', async () => {
    const ana = contas.ana.token;
    const eq = await api('POST', '/api/equipe', { nome: 'Time A' }, ana);
    assert.equal(eq.status, 201, JSON.stringify(eq.dados));
    const entrar = await api('POST', '/api/equipe/entrar', { codigo: eq.dados.codigoConvite }, contas.bia.token);
    assert.equal(entrar.status, 204);
    const sup = await api('GET', '/api/equipe/supervisao', undefined, ana);
    assert.equal(sup.status, 200);
    assert.equal(sup.dados.membros.length, 2);
    const dashBia = await api('GET', `/api/equipe/supervisao/${contas.bia.id}/dashboard`, undefined, ana);
    assert.equal(dashBia.status, 200, JSON.stringify(dashBia.dados));
    assert.equal(dashBia.dados.columns.length, 5);
    const naoGestor = await api('GET', '/api/equipe/supervisao', undefined, contas.bia.token);
    assert.equal(naoGestor.status, 403);
    // lead novo nasce direto na conta da Bia
    const leads = contas.ana.colunas.find((c) => c.nome === 'Leads');
    const novo = await api('POST', '/api/cards', { cliente: 'Lead da Bia', columnId: leads.id, atribuirParaId: contas.bia.id }, ana);
    assert.equal(novo.status, 201, JSON.stringify(novo.dados));
    assert.equal(novo.dados.transferido, true);
    // lead existente da Ana vai pra Bia com a tarefa junto
    const transf = await api('PUT', `/api/cards/${contas.ana.card.id}`, { atribuirParaId: contas.bia.id }, ana);
    assert.equal(transf.status, 200, JSON.stringify(transf.dados));
    const boardBia = await api('GET', '/api/board', undefined, contas.bia.token);
    const nomes = boardBia.dados.cards.map((c) => c.cliente);
    assert.ok(nomes.includes('Lead da Bia') && nomes.includes('João Silva'), JSON.stringify(nomes));
    const tarefasBia = await api('GET', '/api/tasks', undefined, contas.bia.token);
    assert.ok(tarefasBia.dados.tasks.some((x) => x.titulo === 'Ligar amanhã'), 'a tarefa não foi junto com o lead');
    const metaEq = await api('GET', '/api/equipe/meta-vendas/2026-10', undefined, contas.bia.token);
    assert.equal(metaEq.status, 200);
    const chat = await api('POST', '/api/equipe/chat', { texto: 'Bom dia, time!' }, contas.bia.token);
    assert.ok(chat.status < 300, JSON.stringify(chat.dados));
    const lerChat = await api('GET', '/api/equipe/chat', undefined, ana);
    assert.equal(lerChat.dados.mensagens.length, 1);
  });

  test('backup: exporta e importa de volta (inclusive backups antigos com IDs do MongoDB)', async () => {
    const t = contas.caio.token;
    const board = await api('GET', '/api/board', undefined, t);
    const colunaId = board.dados.columns[0].id;
    await api('POST', '/api/cards', { cliente: 'Cliente do Caio', columnId: colunaId, valor: 1500 }, t);
    const exp = await api('GET', '/api/backup/exportar-tudo', undefined, t);
    assert.equal(exp.status, 200);
    assert.equal(exp.dados.clientes.length, 1);
    const imp = await api('POST', '/api/backup/importar-tudo', exp.dados, t);
    assert.equal(imp.status, 200, JSON.stringify(imp.dados));
    assert.equal(imp.dados.resultado.clientes.erro, 0);
    // backup no formato antigo (MongoDB)
    const antigo = {
      versao: 1,
      funis: [{ id: '64f000000000000000000001', nome: 'Funil antigo', ordem: 0 }],
      colunas: [{ id: '64f000000000000000000002', funilId: '64f000000000000000000001', nome: 'Antiga', tipo: 'aberto', ordem: 0, __v: 0 }],
      clientes: [{ id: '64f000000000000000000003', columnId: '64f000000000000000000002', cliente: 'Do Mongo', valor: 99.9, tipoCarta: 'imovel', campoQueNaoExisteMais: 1 }],
      tarefas: [{ id: '64f000000000000000000004', titulo: 'Tarefa órfã', leadId: '64f0000000000000000000ff' }],
      comissoes: [{ id: '64f000000000000000000005', desc: 'Antiga', date: '2026-01-01T00:00:00.000Z', creditoValor: 100000, tipoCarta: 'imovel', parcelas: 13, parcelas1: 10, value: 103.39, value2: 190.56 }],
    };
    const imp2 = await api('POST', '/api/backup/importar-tudo', antigo, t);
    assert.equal(imp2.status, 200, JSON.stringify(imp2.dados));
    for (const k of ['funis', 'colunas', 'clientes', 'tarefas', 'comissoes']) assert.equal(imp2.dados.resultado[k].erro, 0, `${k}: ${JSON.stringify(imp2.dados.resultado)}`);
    const b2 = await api('GET', '/api/board', undefined, t);
    const doMongo = b2.dados.cards.find((c) => c.cliente === 'Do Mongo');
    assert.ok(doMongo);
    assert.equal(doMongo.tipoProduto, 'imovel');
    assert.equal(doMongo.columnId, '00000000-64f0-0000-0000-000000000002');
    // a Ana não ganhou nada do backup do Caio
    const boardAna = await api('GET', '/api/board', undefined, contas.ana.token);
    assert.ok(!boardAna.dados.cards.some((c) => c.cliente === 'Do Mongo'));
  });

  test('WhatsApp: mensagem recebida cria o lead e aparece nas conversas', async () => {
    const User = require('../models/User');
    await User.findByIdAndUpdate(contas.caio.id, { 'whatsappBusiness.phoneNumberId': 'PN-TESTE', 'whatsappBusiness.accessToken': 'tk' });
    const webhook = {
      entry: [{ changes: [{ field: 'messages', value: {
        metadata: { phone_number_id: 'PN-TESTE' },
        contacts: [{ profile: { name: 'Zé do Teste' }, wa_id: '5515999990001' }],
        messages: [{ from: '5515999990001', id: 'wamid.teste1', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Olá, quero um orçamento' } }],
      } }] }],
    };
    const r = await api('POST', '/api/whatsapp/webhook', webhook);
    assert.equal(r.status, 200);
    await new Promise((ok) => setTimeout(ok, 600));
    const login = await api('POST', '/api/auth/login', { email: 'caio@teste.com', senha: 'senha123' });
    contas.caio.token = login.dados.token;
    const conv = await api('GET', '/api/whatsapp/conversas', undefined, contas.caio.token);
    assert.equal(conv.status, 200, JSON.stringify(conv.dados));
    assert.equal(conv.dados.conversas.length, 1, JSON.stringify(conv.dados));
    assert.equal(conv.dados.conversas[0].ultimaMensagem, 'Olá, quero um orçamento');
    const hist = await api('GET', `/api/whatsapp/conversas/${conv.dados.conversas[0].card.id}`, undefined, contas.caio.token);
    assert.equal(hist.dados.mensagens.length, 1);
    // repetir o mesmo evento não duplica a mensagem
    await api('POST', '/api/whatsapp/webhook', webhook);
    await new Promise((ok) => setTimeout(ok, 400));
    const hist2 = await api('GET', `/api/whatsapp/conversas/${conv.dados.conversas[0].card.id}`, undefined, contas.caio.token);
    assert.equal(hist2.dados.mensagens.length, 1);
  });

  test('agendadores rodam sem erro (automação por tempo, fluxos, mensagens, lembretes)', async () => {
    const t = contas.ana.token;
    const board = await api('GET', '/api/board', undefined, t);
    const leads = board.dados.columns.find((c) => c.nome === 'Leads');
    const qualif = board.dados.columns.find((c) => c.nome === 'Qualificação');
    const auto = await api('POST', '/api/automacoes', { nome: 'Parado 1 dia', colunaGatilhoId: leads.id, gatilhoTipo: 'tempo_parado', acaoTipo: 'mover_coluna', acaoParams: { colunaDestinoId: qualif.id, diasParado: 1 } }, t);
    assert.ok(auto.status < 300, JSON.stringify(auto.dados));
    const fluxo = await api('POST', '/api/fluxos', { nome: 'Boas-vindas', colunaGatilhoId: qualif.id, etapas: [{ diasAposInicio: 0, tipo: 'tarefa', params: { titulo: 'Tarefa do fluxo' } }] }, t);
    assert.ok(fluxo.status < 300, JSON.stringify(fluxo.dados));
    const card = await api('POST', '/api/cards', { cliente: 'Parado', columnId: leads.id }, t);
    const { comoSistema } = require('../db/contexto');
    const { query } = require('../db/pool');
    await comoSistema(() => query("UPDATE clientes SET coluna_desde = now() - interval '2 days' WHERE id = $1::uuid", [card.dados.id]));
    const erros = [];
    const original = console.error;
    console.error = (...a) => { erros.push(a.join(' ')); };
    try {
      await require('../utils/automacaoScheduler').verificarAutomacoesPorTempo();
      await new Promise((ok) => setTimeout(ok, 300));
      await require('../utils/fluxoScheduler').processarFluxos();
      await require('../utils/agendamentoScheduler').processarAgendamentos();
      await require('../utils/lembreteScheduler').enviarLembretesDeTarefas();
      await require('../utils/backupScheduler').enviarBackupsSemanais();
    } finally {
      console.error = original;
    }
    assert.deepEqual(erros, []);
    const b2 = await api('GET', '/api/board', undefined, t);
    assert.equal(b2.dados.cards.find((c) => c.id === card.dados.id).columnId, qualif.id, 'a automação por tempo não moveu o cliente');
    const fl = await api('GET', '/api/fluxos', undefined, t);
    assert.ok(fl.dados.fluxos.some((f) => f.emAndamento >= 0));
  });

  test('agendamento público e importação de planilha', async () => {
    const t = contas.ana.token;
    const board = await api('GET', '/api/board', undefined, t);
    const leads = board.dados.columns.find((c) => c.nome === 'Leads');
    const cfg = await api('PUT', '/api/auth/agendamento-publico', { ativo: true, horaInicio: '08:00', horaFim: '18:00', duracaoMinutos: 30, diasSemana: [0, 1, 2, 3, 4, 5, 6], colunaDestinoId: leads.id }, t);
    assert.ok(cfg.status < 300, JSON.stringify(cfg.dados));
    const pub = await api('GET', `/api/agendamento-publico/${contas.ana.id}/config`);
    assert.equal(pub.status, 200, JSON.stringify(pub.dados));
    const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const disp = await api('GET', `/api/agendamento-publico/${contas.ana.id}/disponibilidade?data=${amanha}`);
    assert.equal(disp.status, 200, JSON.stringify(disp.dados));
    const res = await api('POST', `/api/agendamento-publico/${contas.ana.id}/reservar`, { data: amanha, hora: '10:00', nome: 'Cliente Público', telefone: '(11) 98888-7777' });
    assert.ok(res.status < 300, JSON.stringify(res.dados));
    const linhas = Array.from({ length: 450 }, (_, i) => ({ nome: `Pessoa ${i}`, telefone: `1199999${String(i).padStart(4, '0')}` }));
    const imp = await api('POST', '/api/possiveis-leads/importar', { linhas, origemArquivo: 'teste.csv' }, t);
    assert.equal(imp.status, 201, JSON.stringify(imp.dados));
    assert.equal(imp.dados.total, 450);
    const lista = await api('GET', '/api/possiveis-leads', undefined, t);
    const um = (lista.dados.possiveisLeads || lista.dados.leads || lista.dados)[0];
    const prom = await api('POST', `/api/possiveis-leads/${um.id}/promover`, { columnId: leads.id, nome: um.nome, telefone: um.telefone }, t);
    assert.ok(prom.status < 300, JSON.stringify(prom.dados));
  });

  test('funis, colunas, anexos, arquivar e apagar cliente', async () => {
    const t = contas.ana.token;
    const funis = await api('GET', '/api/funis', undefined, t);
    const dup = await api('POST', `/api/funis/${funis.dados.funis[0].id}/duplicar`, {}, t);
    assert.ok(dup.status < 300, JSON.stringify(dup.dados));
    const novoFunil = await api('POST', '/api/funis', { nome: 'Funil 2' }, t);
    assert.ok(novoFunil.status < 300, JSON.stringify(novoFunil.dados));
    const col = await api('POST', '/api/columns', { nome: 'Nova coluna', funilId: novoFunil.dados.id }, t);
    assert.ok(col.status < 300, JSON.stringify(col.dados));
    const card = await api('POST', '/api/cards', { cliente: 'Com anexo', columnId: col.dados.id }, t);
    const anexo = await api('POST', `/api/cards/${card.dados.id}/anexos`, { nomeArquivo: 'a.txt', tipoMime: 'text/plain', dadosBase64: 'data:text/plain;base64,b2k=' }, t);
    assert.ok(anexo.status < 300, JSON.stringify(anexo.dados));
    assert.equal((await api('GET', `/api/cards/${card.dados.id}/anexos`, undefined, t)).dados.anexos.length, 1);
    assert.equal((await api('PUT', `/api/cards/${card.dados.id}/arquivar`, {}, t)).status, 200);
    assert.equal((await api('PUT', `/api/cards/${card.dados.id}/desarquivar`, {}, t)).status, 200);
    const del = await api('DELETE', `/api/cards/${card.dados.id}`, undefined, t);
    assert.ok(del.status < 300, JSON.stringify(del.dados));
    const delCol = await api('DELETE', `/api/columns/${col.dados.id}`, undefined, t);
    assert.ok(delCol.status < 300, JSON.stringify(delCol.dados));
    const delFunil = await api('DELETE', `/api/funis/${novoFunil.dados.id}`, undefined, t);
    assert.ok(delFunil.status < 300, JSON.stringify(delFunil.dados));
  });

  test('comissões manuais, regras, webhooks de saída, mensagens agendadas e perfil', async () => {
    const t = contas.bia.token;
    const nova = await api('POST', '/api/comissoes', { desc: 'Venda avulsa', scope: 'Empresa', date: '2026-10-01', valorVenda: 20000, tipoProduto: 'padrao' }, t);
    assert.ok(nova.status < 300, JSON.stringify(nova.dados));
    const ed = await api('PUT', `/api/comissoes/${nova.dados.id}`, { valorVenda: 30000 }, t);
    assert.ok(ed.status < 300, JSON.stringify(ed.dados));
    assert.equal(ed.dados.value, 1500);
    assert.ok((await api('DELETE', `/api/comissoes/${nova.dados.id}`, undefined, t)).status < 300);
    const regras = await api('GET', '/api/regras-comissao', undefined, t);
    const r1 = regras.dados.regras[0];
    const er = await api('PUT', `/api/regras-comissao/${r1.id}`, { nome: 'Padrão novo', blocos: [{ parcelas: 2, percentual: 3 }] }, t);
    assert.ok(er.status < 300, JSON.stringify(er.dados));
    const wh = await api('POST', '/api/webhooks-saida', { nome: 'Teste', url: 'https://example.com/x', eventos: ['lead.criado'] }, t);
    assert.ok(wh.status < 300, JSON.stringify(wh.dados));
    assert.ok((await api('PUT', `/api/webhooks-saida/${wh.dados.id}`, { ativo: false }, t)).status < 300);
    assert.ok((await api('DELETE', `/api/webhooks-saida/${wh.dados.id}`, undefined, t)).status < 300);
    const board = await api('GET', '/api/board', undefined, t);
    const agend = await api('POST', '/api/agendamentos', { cardId: board.dados.cards[0].id, texto: 'Lembrete', agendadoPara: new Date(Date.now() + 3600000).toISOString() }, t);
    assert.ok(agend.status < 300, JSON.stringify(agend.dados));
    assert.ok((await api('POST', `/api/agendamentos/${agend.dados.id}/cancelar`, {}, t)).status < 300);
    assert.ok((await api('PUT', '/api/auth/nome', { nome: 'Bia Souza' }, t)).status < 300);
    const me = await api('GET', '/api/auth/me', undefined, t);
    assert.equal(me.dados.user.nome, 'Bia Souza');
    assert.equal(me.dados.user.senhaHash, undefined);
    const copia = await api('POST', '/api/gerot/copiar', { semanaOrigem: '2026-10-05', semanaDestino: '2026-10-12' }, t);
    assert.ok(copia.status < 500, JSON.stringify(copia.dados));
    const ics = await api('POST', '/api/calendar/ics/gerar', {}, t);
    assert.ok(ics.status < 300, JSON.stringify(ics.dados));
    const status = await api('GET', '/api/calendar/ics-status', undefined, t);
    const token = status.dados.token || (status.dados.url || '').split('/').pop().replace('.ics', '');
    if (token) {
      const feed = await fetch(`${base}/api/calendar/ics/${token}`);
      assert.equal(feed.status, 200);
      assert.match(await feed.text(), /BEGIN:VCALENDAR/);
    }
  });

  test('sair de todos os aparelhos invalida o token antigo', async () => {
    const t = contas.caio.token;
    assert.equal((await api('POST', '/api/auth/logout-all', {}, t)).status, 204);
    assert.equal((await api('GET', '/api/board', undefined, t)).status, 401);
  });
});
