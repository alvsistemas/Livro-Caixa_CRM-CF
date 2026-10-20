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
    process.env.LIMITE_CADASTROS_POR_HORA = '1000'; // os testes criam muitas contas do mesmo IP
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

  test('preços públicos para a página de divulgação (sem login) e cabeçalhos de segurança', async () => {
    const res = await fetch(base + '/api/publico/precos');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    const d = await res.json();
    assert.deepEqual(d.planos.map((p) => [p.id, p.valor, p.valorAnual]), [['essencial', 29.9, 300], ['completo', 39.9, 400]]);
    assert.equal(d.diasTeste, 7);
    assert.equal(d.promocao, null);
    // a raiz É a tela inicial do sistema; a divulgação fica em /conheca
    const raiz = await fetch(base + '/', { redirect: 'manual' });
    assert.equal(raiz.status, 200);
    assert.match(await raiz.text(), /O que vamos abrir hoje/);
    const antigo = await fetch(base + '/inicio.html', { redirect: 'manual' });
    assert.equal(antigo.status, 301);
    assert.equal(antigo.headers.get('location'), '/');
    const siteRes = await fetch(base + '/conheca');
    assert.equal(siteRes.status, 200);
    const html = await siteRes.text();
    assert.match(html, /Começar 7 dias grátis/);
    assert.match(html, /og:image" content="https:\/\/meulivrocaixaapp\.com\.br\/site\/img\/dashboard\.jpg/);
    assert.equal((await fetch(base + '/site/img/dashboard.jpg')).status, 200);
    for (const velho of ['/site', '/site/']) {
      const r = await fetch(base + velho, { redirect: 'manual' });
      assert.equal(r.status, 301);
      assert.equal(r.headers.get('location'), '/conheca');
    }
    const ag = await fetch(base + '/agendar/qualquer');
    assert.equal(ag.headers.get('x-frame-options'), null); // a página de agendamento pode ser incorporada
  });

  test('todas as listagens respondem sem erro', async () => {
    const t = contas.ana.token;
    const rotas = ['/api/auth/me', '/api/funis', '/api/tasks', '/api/comissoes', '/api/regras-comissao',
      '/api/auditoria', '/api/automacoes', '/api/fluxos', '/api/campos-personalizados', '/api/possiveis-leads',
      '/api/webhooks-saida', '/api/calendar/status', '/api/calendar/ics-status', '/api/config/integracoes',
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
    // Do jeito que o site manda: campos vazios ('' vira null na rota) e sem horário
    const doSite = await api('POST', '/api/tasks', { titulo: 'Tarefa do dia', vencimento: '2026-10-18', prioridade: 'media', leadId: null, descricao: '' }, t);
    assert.equal(doSite.status, 201, JSON.stringify(doSite.dados));
    assert.equal(doSite.dados.descricao, '');
    const editada = await api('PUT', `/api/tasks/${doSite.dados.id}`, { titulo: 'Tarefa do dia', descricao: '', leadId: '' }, t);
    assert.equal(editada.status, 200, JSON.stringify(editada.dados));
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

  test('IA: ferramentas do Controle financeiro leem os dados da própria pessoa', async () => {
    const { comoUsuario } = require('../db/contexto');
    const { executarFerramenta, contextoDaPessoa } = require('../routes/ai');
    const t = contas.ana.token;
    const mes = new Date().toISOString().slice(0, 7);
    await api('PUT', '/api/financeiro/transacoes', { valor: [
      { id: 'ia1', date: `${mes}-02`, desc: 'Salário', type: 'Receita', category: 'Salário', scope: 'Pessoal', status: 'Pago', value: 4000, recurrence: 'unico' },
      { id: 'ia2', date: `${mes}-03`, desc: 'Mercado', type: 'Despesa', category: 'Alimentação', scope: 'Pessoal', status: 'Pago', value: 650.35, recurrence: 'unico' },
    ] }, t);
    await api('PUT', '/api/financeiro/perfil', { valor: { name: 'Ana', character: 'jonathan', characterName: 'Pedro', plan: 'gratis', photo: null } }, t);
    await api('PUT', '/api/financeiro/config', { valor: { integracaoCrm: 'vendas' } }, t);
    await api('PUT', '/api/financeiro/objetivos', { valor: [{ id: 'g1', name: 'Reserva', scope: 'Pessoal', target: 1000, current: 250 }] }, t);

    const resumo = await comoUsuario(contas.ana.id, () => executarFerramenta('resumo_financeiro', {}, contas.ana.id));
    assert.equal(resumo.mes, mes);
    assert.ok(resumo.total.receitas >= 4000, JSON.stringify(resumo)); // + vendas do CRM no mês, se houver
    assert.equal(resumo.pessoal.despesas, 650.35);
    assert.equal(resumo.maioresDespesas[0].categoria, 'Alimentação');
    const lista = await comoUsuario(contas.ana.id, () => executarFerramenta('lancamentos_financeiros', { tipo: 'Despesa' }, contas.ana.id));
    assert.deepEqual(lista.lancamentos.map((l) => l.descricao), ['Mercado']);
    const metas = await comoUsuario(contas.ana.id, () => executarFerramenta('cartoes_objetivos_investimentos', {}, contas.ana.id));
    assert.equal(metas.objetivos[0].progresso, '25%');
    const ctx = await comoUsuario(contas.ana.id, () => contextoDaPessoa(contas.ana.id, 'financeiro'));
    assert.match(ctx, /Controle financeiro/);
    assert.match(ctx, /O Endividado/);
    assert.match(ctx, /Pedro/);
    // outra pessoa: a mesma ferramenta não enxerga os dados da Ana
    const daBia = await comoUsuario(contas.bia.id, () => executarFerramenta('resumo_financeiro', {}, contas.bia.id));
    assert.equal(daBia.pessoal.despesas, 0);
  });

  test('Controle financeiro: listas novas, comprovantes e lançar pela IA', async () => {
    const t = contas.ana.token;
    // listas novas (contas, transferências, dívidas, orçamentos, categorias)
    const contasFin = [{ id: 'k1', name: 'Nubank', tipo: 'Conta digital', saldoInicial: 1000.5, dataSaldo: '2026-10-01' }, { id: 'k2', name: 'Poupança', tipo: 'Poupança', saldoInicial: 0, dataSaldo: '2026-10-01' }];
    assert.equal((await api('PUT', '/api/financeiro/contas', { valor: contasFin }, t)).status, 200);
    assert.equal((await api('PUT', '/api/financeiro/transferencias', { valor: [{ id: 'tr1', data: '2026-10-05', deContaId: 'k1', paraContaId: 'k2', valor: 300 }] }, t)).status, 200);
    assert.equal((await api('PUT', '/api/financeiro/dividas', { valor: [{ id: 'd1', name: 'Cartão', saldo: 2000, juros: 12, parcela: 150 }] }, t)).status, 200);
    assert.equal((await api('PUT', '/api/financeiro/orcamentos', { valor: [{ id: 'o1', category: 'Alimentação', limite: 800 }] }, t)).status, 200);
    assert.equal((await api('PUT', '/api/financeiro/categorias', { valor: [{ id: 'c1', nome: 'Pet', tipo: 'Despesa', dedutivel: false }] }, t)).status, 200);
    const r = await api('GET', '/api/financeiro', undefined, t);
    assert.deepEqual(r.dados.dados.contas.map((k) => k.name), ['Nubank', 'Poupança']);
    assert.equal(r.dados.dados.contas[0].saldoInicial, 1000.5);
    assert.equal(r.dados.dados.transferencias[0].valor, 300);
    assert.equal(r.dados.dados.dividas[0].juros, 12);
    assert.equal(r.dados.dados.orcamentos[0].category, 'Alimentação');
    assert.equal(r.dados.dados.categorias[0].nome, 'Pet');
    // remover um item da lista apaga
    await api('PUT', '/api/financeiro/contas', { valor: [contasFin[0]] }, t);
    assert.equal((await api('GET', '/api/financeiro', undefined, t)).dados.dados.contas.length, 1);
    // outra pessoa não vê
    assert.equal((await api('GET', '/api/financeiro', undefined, contas.bia.token)).dados.dados.dividas.length, 0);

    // comprovantes
    const png = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString('base64');
    const up = await api('POST', '/api/financeiro/comprovantes', { lancamentoId: 'ia2', nome: 'recibo.png', tipo: 'image/png', dados: png }, t);
    assert.equal(up.status, 201, JSON.stringify(up.dados));
    const falso = await api('POST', '/api/financeiro/comprovantes', { lancamentoId: 'ia2', nome: 'x.pdf', tipo: 'application/pdf', dados: png }, t);
    assert.equal(falso.status, 400); // diz que é PDF mas não é
    const arquivo = await fetch(`${base}/api/financeiro/comprovantes/${up.dados.id}`, { headers: { Authorization: `Bearer ${t}` } });
    assert.equal(arquivo.status, 200);
    assert.equal(arquivo.headers.get('content-type'), 'image/png');
    const daBia = await fetch(`${base}/api/financeiro/comprovantes/${up.dados.id}`, { headers: { Authorization: `Bearer ${contas.bia.token}` } });
    assert.equal(daBia.status, 404); // Row-Level Security: não existe pra ela
    const lista = await api('GET', '/api/financeiro/comprovantes?lancamento=ia2', undefined, t);
    assert.equal(lista.dados.comprovantes.length, 1);
    assert.equal((await api('DELETE', `/api/financeiro/comprovantes/${up.dados.id}`, undefined, t)).status, 204);

    // a IA cria um lançamento (validando o que ela manda)
    const { comoUsuario } = require('../db/contexto');
    const { executarFerramenta } = require('../routes/ai');
    const criado = await comoUsuario(contas.ana.id, () => executarFerramenta('criar_lancamento', { descricao: 'Mercado', valor: 52.3, categoria: 'alimentacao', forma: 'Conta Corrente', conta: 'nubank' }, contas.ana.id));
    assert.equal(criado.ok, true, JSON.stringify(criado));
    assert.equal(criado.lancamento.categoria, 'Alimentação');
    const depois = (await api('GET', '/api/financeiro', undefined, t)).dados.dados.transacoes;
    const tx = depois.find((x) => x.desc === 'Mercado' && x.criadoPelaIA);
    assert.ok(tx);
    assert.equal(tx.value, 52.3);
    assert.equal(tx.contaId, 'k1');
    assert.ok(depois.some((x) => x.id === 'ia1'), 'os lançamentos que já existiam continuam');
    const invalido = await comoUsuario(contas.ana.id, () => executarFerramenta('criar_lancamento', { descricao: 'X', valor: -0 }, contas.ana.id));
    assert.ok(invalido.erro);

    // o lembrete diário não é apagado quando o site salva a configuração
    const { query } = require('../db/pool');
    const { comoSistema } = require('../db/contexto');
    await comoSistema(() => query(`UPDATE financeiro_perfis SET config = config || '{"lembreteEnviadoEm":"2026-10-18"}' WHERE user_id = $1::uuid`, [contas.ana.id]));
    await api('PUT', '/api/financeiro/config', { valor: { integracaoCrm: 'vendas', corDestaque: '#1D4E89' } }, t);
    const cfg = (await api('GET', '/api/financeiro', undefined, t)).dados.dados.config;
    assert.equal(cfg.lembreteEnviadoEm, '2026-10-18');
    assert.equal(cfg.corDestaque, '#1D4E89');
  });

  test('fechamento da venda: vira receitas no financeiro, refaz sem duplicar e sobrevive a uma tela velha', async () => {
    const reg = await api('POST', '/api/auth/register', { nome: 'Edu', email: 'edu.fechamento@teste.com', senha: 'senha123' });
    const t = reg.dados.token;
    const board = await api('GET', '/api/board', undefined, t);
    const leads = board.dados.columns.find((c) => c.tipo === 'aberto');
    const ganho = board.dados.columns.find((c) => c.tipo === 'ganho');
    // modo: ainda não perguntado
    let modo = await api('GET', '/api/financeiro/fechamento/modo', undefined, t);
    assert.deepEqual(modo.dados, { modo: 'vendas', perguntado: false, taxas: {}, descontarComissoes: false });
    // a tela do financeiro abre ANTES da venda (vai ficar velha)
    const telaVelha = await api('GET', '/api/financeiro', undefined, t);
    assert.ok(telaVelha.dados.carregadoEm);
    await api('PUT', '/api/financeiro/transacoes', { valor: [{ id: 'm1', date: '2026-10-01', desc: 'Luz', type: 'Despesa', value: 100 }], carregadoEm: telaVelha.dados.carregadoEm }, t);

    const c = await api('POST', '/api/cards', { cliente: 'Loja da Rua', columnId: leads.id, valor: 1000 }, t);
    // fora da coluna de ganho não fecha
    const cedo = await api('POST', `/api/financeiro/fechamento/${c.dados.id}`, { valorFinal: 900, forma: 'avista', primeiraData: '2026-10-19', meio: 'pix' }, t);
    assert.equal(cedo.status, 400);
    await api('PUT', `/api/cards/${c.dados.id}/move`, { columnId: ganho.id }, t);
    // "Agora não" marca o selo
    const depois = await api('POST', `/api/financeiro/fechamento/${c.dados.id}/depois`, undefined, t);
    assert.equal(depois.dados.card.fechamentoPendente, true);
    // dados errados
    const ruim = await api('POST', `/api/financeiro/fechamento/${c.dados.id}`, { valorFinal: 900, forma: 'entrada', entrada: 900, parcelas: 2, primeiraData: '2026-10-19', meio: 'pix' }, t);
    assert.equal(ruim.status, 400);
    assert.match(ruim.dados.error, /entrada/);
    // fecha: 10% de desconto, entrada de 300 + 2 parcelas
    const ok = await api('POST', `/api/financeiro/fechamento/${c.dados.id}`, { descontoPct: 10, forma: 'entrada', entrada: 300, parcelas: 2, primeiraData: '2026-10-19', meio: 'pix', recebido: true }, t);
    assert.equal(ok.status, 200, JSON.stringify(ok.dados));
    assert.equal(ok.dados.card.fechamento.valorFinal, 900);
    assert.equal(ok.dados.card.fechamento.desconto, 100);
    assert.equal(ok.dados.card.fechamentoPendente, false);
    assert.equal(ok.dados.lancamentos, 3);
    let fin = await api('GET', '/api/financeiro', undefined, t);
    let vendas = fin.dados.dados.transacoes.filter((x) => x.crmFechamento);
    assert.deepEqual(vendas.map((x) => [x.desc, x.value, x.status, x.date]), [
      ['Venda — Loja da Rua (entrada)', 300, 'Pago', '2026-10-19'],
      ['Venda — Loja da Rua (1/2)', 300, 'Agendado', '2026-11-19'],
      ['Venda — Loja da Rua (2/2)', 300, 'Agendado', '2026-12-19'],
    ]);
    assert.equal(vendas[0].type, 'Receita');
    assert.equal(vendas[0].category, 'Vendas');

    // a tela velha (que não conhecia as receitas) salva: as receitas NÃO somem
    await api('PUT', '/api/financeiro/transacoes', { valor: telaVelha.dados.dados.transacoes.concat([{ id: 'm1', date: '2026-10-01', desc: 'Luz', type: 'Despesa', value: 120 }]), carregadoEm: telaVelha.dados.carregadoEm }, t);
    fin = await api('GET', '/api/financeiro', undefined, t);
    assert.equal(fin.dados.dados.transacoes.filter((x) => x.crmFechamento).length, 3);
    assert.equal(fin.dados.dados.transacoes.find((x) => x.id === 'm1').value, 120);
    // tela antiga sem carregadoEm também não apaga
    await api('PUT', '/api/financeiro/transacoes', { valor: [{ id: 'm1', date: '2026-10-01', desc: 'Luz', type: 'Despesa', value: 120 }] }, t);
    fin = await api('GET', '/api/financeiro', undefined, t);
    assert.equal(fin.dados.dados.transacoes.filter((x) => x.crmFechamento).length, 3);

    // a pessoa marca a 1ª parcela como recebida no financeiro (tela atualizada)
    const atual = fin.dados;
    const editadas = atual.dados.transacoes.map((x) => (x.crmFechamento && x.crmFechamento.parcela === 2 ? { ...x, status: 'Pago' } : x));
    await api('PUT', '/api/financeiro/transacoes', { valor: editadas, carregadoEm: atual.carregadoEm }, t);

    // refaz: 850 em 2x no boleto — troca as 3 parcelas por 2, sem duplicar; as já recebidas (1ª e 2ª) continuam recebidas
    const refaz = await api('POST', `/api/financeiro/fechamento/${c.dados.id}`, { valorFinal: 850, forma: 'parcelado', parcelas: 2, primeiraData: '2026-10-19', meio: 'boleto' }, t);
    assert.equal(refaz.dados.substituidos, 3);
    fin = await api('GET', '/api/financeiro', undefined, t);
    vendas = fin.dados.dados.transacoes.filter((x) => x.crmFechamento);
    assert.deepEqual(vendas.map((x) => [x.value, x.status, x.account]), [[425, 'Pago', 'Boleto'], [425, 'Pago', 'Boleto']]);
    // a tela "atual" de antes do refazer salva de novo: as parcelas antigas não voltam
    await api('PUT', '/api/financeiro/transacoes', { valor: editadas, carregadoEm: atual.carregadoEm }, t);
    fin = await api('GET', '/api/financeiro', undefined, t);
    assert.deepEqual(fin.dados.dados.transacoes.filter((x) => x.crmFechamento).map((x) => x.value), [425, 425]);
    // apagar pelo financeiro, numa tela que já conhecia a receita, apaga de verdade
    await api('PUT', '/api/financeiro/transacoes', { valor: fin.dados.dados.transacoes.filter((x) => !(x.crmFechamento && x.crmFechamento.parcela === 2)), carregadoEm: fin.dados.carregadoEm }, t);
    fin = await api('GET', '/api/financeiro', undefined, t);
    assert.equal(fin.dados.dados.transacoes.filter((x) => x.crmFechamento).length, 1);

    // ficha do card e lançamentos ligados
    const ver = await api('GET', `/api/financeiro/fechamento/${c.dados.id}`, undefined, t);
    assert.equal(ver.dados.fechamento.valorFinal, 850);
    assert.equal(ver.dados.lancamentos.length, 1);
    // outra pessoa não vê nem fecha o card
    assert.equal((await api('GET', `/api/financeiro/fechamento/${c.dados.id}`, undefined, contas.bia.token)).status, 404);
    assert.equal((await api('POST', `/api/financeiro/fechamento/${c.dados.id}`, { valorFinal: 1, forma: 'avista', primeiraData: '2026-10-19', meio: 'pix' }, contas.bia.token)).status, 404);
    // painel da equipe/CRM usa o valor final: o board devolve o fechamento
    const b2 = await api('GET', '/api/board', undefined, t);
    assert.equal(b2.dados.cards.find((x) => x.id === c.dados.id).fechamento.valorFinal, 850);

    // modo: escolher grava sem apagar o resto da configuração
    await api('PUT', '/api/financeiro/config', { valor: { descontarComissoes: true } }, t);
    assert.equal((await api('PUT', '/api/financeiro/fechamento/modo', { modo: 'quebrado' }, t)).status, 400);
    modo = await api('PUT', '/api/financeiro/fechamento/modo', { modo: 'comissoes' }, t);
    assert.deepEqual(modo.dados, { modo: 'comissoes', perguntado: true });
    fin = await api('GET', '/api/financeiro', undefined, t);
    assert.equal(fin.dados.dados.config.descontarComissoes, true);
    assert.equal(fin.dados.dados.config.integracaoCrm, 'comissoes');
  });

  test('custos da venda: despesas ligadas, taxa guardada, comissão sobre o valor final', async () => {
    const reg = await api('POST', '/api/auth/register', { nome: 'Fabi', email: 'fabi.custos@teste.com', senha: 'senha123' });
    const t = reg.dados.token;
    const board = await api('GET', '/api/board', undefined, t);
    const leads = board.dados.columns.find((c) => c.tipo === 'aberto');
    const ganho = board.dados.columns.find((c) => c.tipo === 'ganho');
    const c = await api('POST', '/api/cards', { cliente: 'Maria Souza', columnId: leads.id, valor: 10000 }, t);
    await api('PUT', `/api/cards/${c.dados.id}/move`, { columnId: ganho.id }, t);
    await new Promise((ok) => setTimeout(ok, 400)); // comissão gerada pelo Pipeline (5% de 10.000)
    let com = await api('GET', '/api/comissoes', undefined, t);
    assert.equal(com.dados.contratos.find((x) => x.cardId === c.dados.id).value, 500);
    // a janela recebe a regra da comissão
    const ver = await api('GET', `/api/financeiro/fechamento/${c.dados.id}`, undefined, t);
    assert.deepEqual(ver.dados.regra, { nome: 'Padrão', base: 'final', percentualTotal: 0.05 });
    // taxa fora da faixa
    assert.equal((await api('PUT', '/api/financeiro/fechamento/taxas', { credito: 50 }, t)).status, 400);
    assert.equal((await api('PUT', '/api/financeiro/fechamento/taxas', { inventada: 1 }, t)).status, 400);
    await api('PUT', '/api/financeiro/fechamento/taxas', { debito: 1.5 }, t);
    // a tela do financeiro abre antes (vai salvar a config sem as taxas)
    const telaVelha = await api('GET', '/api/financeiro', undefined, t);
    const r = await api('POST', `/api/financeiro/fechamento/${c.dados.id}`, {
      descontoPct: 5, forma: 'parcelado', parcelas: 3, primeiraData: '2026-12-15', meio: 'credito',
      custos: { produto: 6000, frete: 300, taxaPct: 4.99, impostoPct: 6 },
    }, t);
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal(r.dados.fechamento.custos.total, 7344.05);
    assert.equal(r.dados.fechamento.comissao, 475); // 5% de 9.500 (valor final)
    assert.equal(r.dados.lancamentos, 7); // 3 receitas + produto, frete, taxa, imposto
    com = await api('GET', '/api/comissoes', undefined, t);
    const ct = com.dados.contratos.find((x) => x.cardId === c.dados.id);
    assert.equal(ct.valorVenda, 9500);
    assert.equal(ct.value, 475);
    // os % usados ficam guardados (e o que já estava, também)
    let modo = await api('GET', '/api/financeiro/fechamento/modo', undefined, t);
    assert.deepEqual(modo.dados.taxas, { debito: 1.5, creditoParcelado: 4.99, imposto: 6 });
    // a tela velha salva a config: as taxas continuam
    await api('PUT', '/api/financeiro/config', { valor: { ...telaVelha.dados.dados.config, descontarComissoes: true } }, t);
    modo = await api('GET', '/api/financeiro/fechamento/modo', undefined, t);
    assert.equal(modo.dados.taxas.imposto, 6);
    assert.equal(modo.dados.descontarComissoes, true);
    // apagar uma taxa guardada
    await api('PUT', '/api/financeiro/fechamento/taxas', { debito: null }, t);
    modo = await api('GET', '/api/financeiro/fechamento/modo', undefined, t);
    assert.equal(modo.dados.taxas.debito, undefined);
    // despesas no financeiro, ligadas ao cliente
    let fin = await api('GET', '/api/financeiro', undefined, t);
    const desp = fin.dados.dados.transacoes.filter((x) => x.crmFechamento && x.type === 'Despesa');
    assert.deepEqual(desp.map((x) => [x.crmFechamento.tipo, x.value]).sort(), [['frete', 300], ['imposto', 570], ['produto', 6000], ['taxa', 474.05]]);
    // a pessoa paga o imposto no financeiro; refazer sem frete: frete some, imposto continua pago
    const marcado = fin.dados.dados.transacoes.map((x) => (x.crmFechamento && x.crmFechamento.tipo === 'imposto' ? { ...x, status: 'Pago' } : x));
    await api('PUT', '/api/financeiro/transacoes', { valor: marcado, carregadoEm: fin.dados.carregadoEm }, t);
    await api('POST', `/api/financeiro/fechamento/${c.dados.id}`, {
      descontoPct: 5, forma: 'parcelado', parcelas: 3, primeiraData: '2026-12-15', meio: 'credito',
      custos: { produto: 6000, taxaPct: 4.99, impostoPct: 6 },
    }, t);
    fin = await api('GET', '/api/financeiro', undefined, t);
    const d2 = fin.dados.dados.transacoes.filter((x) => x.crmFechamento && x.type === 'Despesa');
    assert.equal(d2.some((x) => x.crmFechamento.tipo === 'frete'), false);
    assert.equal(d2.find((x) => x.crmFechamento.tipo === 'imposto').status, 'Pago');
    // regra sobre o valor negociado: a comissão volta a usar o valor do card
    const regras = await api('GET', '/api/regras-comissao', undefined, t);
    const padrao = (regras.dados.regras || regras.dados).find((x) => x.chave === 'padrao');
    const mud = await api('PUT', `/api/regras-comissao/${padrao.id}`, { base: 'negociado' }, t);
    assert.equal(mud.dados.base, 'negociado');
    const r3 = await api('POST', `/api/financeiro/fechamento/${c.dados.id}`, { descontoPct: 5, forma: 'avista', primeiraData: '2026-12-15', meio: 'pix' }, t);
    assert.equal(r3.dados.fechamento.comissao, 500);
    // card ganho sem valor (sem comissão do Pipeline): o fechamento cria a comissão pelo valor final
    const semValor = await api('POST', '/api/cards', { cliente: 'Sem valor no card', columnId: leads.id, valor: 0 }, t);
    await api('PUT', `/api/cards/${semValor.dados.id}/move`, { columnId: ganho.id }, t);
    await api('PUT', `/api/regras-comissao/${padrao.id}`, { base: 'final' }, t);
    const r4 = await api('POST', `/api/financeiro/fechamento/${semValor.dados.id}`, { valorFinal: 2000, forma: 'avista', primeiraData: '2026-12-15', meio: 'pix' }, t);
    assert.equal(r4.dados.fechamento.comissao, 100);
  });

  test('venda desfeita, devolução e cliente excluído', async () => {
    const reg = await api('POST', '/api/auth/register', { nome: 'Gabi', email: 'gabi.desfeita@teste.com', senha: 'senha123' });
    const t = reg.dados.token;
    const board = await api('GET', '/api/board', undefined, t);
    const leads = board.dados.columns.find((c) => c.tipo === 'aberto');
    const ganho = board.dados.columns.find((c) => c.tipo === 'ganho');
    const perdido = board.dados.columns.find((c) => c.tipo === 'perdido');
    const c = await api('POST', '/api/cards', { cliente: 'Cliente Desistiu', columnId: leads.id, valor: 3000 }, t);
    await api('PUT', `/api/cards/${c.dados.id}/move`, { columnId: ganho.id }, t);
    await new Promise((ok) => setTimeout(ok, 400));
    await api('POST', `/api/financeiro/fechamento/${c.dados.id}`, { valorFinal: 3000, forma: 'parcelado', parcelas: 3, primeiraData: '2026-10-10', meio: 'pix', recebido: true, custos: { produto: 1000, impostoPct: 5 } }, t);
    // devolução pela ficha: não passa do valor da venda
    assert.equal((await api('POST', `/api/financeiro/fechamento/${c.dados.id}/devolucao`, { valor: 3500 }, t)).status, 400);
    const dev = await api('POST', `/api/financeiro/fechamento/${c.dados.id}/devolucao`, { valor: 200, motivo: 'peça com defeito' }, t);
    assert.equal(dev.status, 201, JSON.stringify(dev.dados));
    // refazer o fechamento não apaga a devolução
    await api('POST', `/api/financeiro/fechamento/${c.dados.id}`, { valorFinal: 3000, forma: 'parcelado', parcelas: 3, primeiraData: '2026-10-10', meio: 'pix', recebido: true, custos: { produto: 1000, impostoPct: 5 } }, t);
    let fin = await api('GET', '/api/financeiro', undefined, t);
    let lig = fin.dados.dados.transacoes.filter((x) => x.crmFechamento);
    const devs = lig.filter((x) => x.crmFechamento.tipo === 'devolucao');
    assert.equal(devs.length, 1);
    assert.equal(devs[0].category, 'Devoluções');
    assert.equal(devs[0].desc, 'Devolução — Cliente Desistiu (peça com defeito)');
    // ainda em Ganho: não dá pra desfazer
    assert.equal((await api('POST', `/api/financeiro/fechamento/${c.dados.id}/cancelar`, {}, t)).status, 400);
    // sai de Ganho: apaga o que falta receber/pagar (parcelas 2 e 3 e o imposto); fica a 1ª parcela, o produto e a devolução
    await api('PUT', `/api/cards/${c.dados.id}/move`, { columnId: perdido.id }, t);
    await new Promise((ok) => setTimeout(ok, 400)); // a comissão é cortada logo depois de responder
    // devolução maior que o recebido é recusada
    assert.equal((await api('POST', `/api/financeiro/fechamento/${c.dados.id}/cancelar`, { devolucao: { valor: 1500 } }, t)).status, 400);
    // recebido 1.000 menos os 200 já devolvidos: no máximo 800
    assert.equal((await api('POST', `/api/financeiro/fechamento/${c.dados.id}/cancelar`, { devolucao: { valor: 801 } }, t)).status, 400);
    const canc = await api('POST', `/api/financeiro/fechamento/${c.dados.id}/cancelar`, { devolucao: { valor: 800 } }, t);
    assert.equal(canc.status, 200, JSON.stringify(canc.dados));
    assert.equal(canc.dados.cancelado.aReceberCancelado, 2000);
    assert.equal(canc.dados.cancelado.recebidoMantido, 1000);
    assert.equal(canc.dados.cancelado.devolvido, 800);
    assert.ok(canc.dados.card.fechamento.cancelado);
    assert.equal((await api('POST', `/api/financeiro/fechamento/${c.dados.id}/cancelar`, {}, t)).status, 400); // só uma vez
    fin = await api('GET', '/api/financeiro', undefined, t);
    lig = fin.dados.dados.transacoes.filter((x) => x.crmFechamento);
    assert.deepEqual(lig.map((x) => [x.crmFechamento.tipo, x.value, x.status]).sort(), [
      ['devolucao', 200, 'Pago'], ['devolucao', 800, 'Pago'], ['produto', 1000, 'Pago'], ['receita', 1000, 'Pago'],
    ]);
    // a comissão foi cortada ao ir para Perdido
    const com = await api('GET', '/api/comissoes', undefined, t);
    assert.ok(com.dados.contratos.find((x) => x.cardId === c.dados.id).canceladoNoMes);
    // voltou para Ganho: refazer conta como venda nova e limpa o "desfeita"
    await api('PUT', `/api/cards/${c.dados.id}/move`, { columnId: ganho.id }, t);
    const refeita = await api('POST', `/api/financeiro/fechamento/${c.dados.id}`, { valorFinal: 1000, forma: 'avista', primeiraData: '2026-10-10', meio: 'pix' }, t);
    assert.equal(refeita.dados.fechamento.cancelado, undefined);
    // excluir o card: os lançamentos ficam, marcados
    assert.equal((await api('DELETE', `/api/cards/${c.dados.id}`, undefined, t)).status, 204);
    fin = await api('GET', '/api/financeiro', undefined, t);
    lig = fin.dados.dados.transacoes.filter((x) => x.crmFechamento);
    assert.ok(lig.length >= 3);
    assert.ok(lig.every((x) => x.crmFechamento.clienteExcluido === true && x.crmFechamento.clienteNome === 'Cliente Desistiu'));
  });

  test('permissões da equipe: gestor e dono do sistema escolhem; o servidor aplica', async () => {
    const antes = process.env.DONOS_EMAILS;
    process.env.DONOS_EMAILS = 'suporte.perm@teste.com';
    try {
      const reg = async (nome, email) => (await api('POST', '/api/auth/register', { nome, email, senha: 'senha123' })).dados;
      const gestor = await reg('Gestora', 'gestora.perm@teste.com');
      const membro = await reg('Vendedor', 'vendedor.perm@teste.com');
      const suporte = await reg('Suporte', 'suporte.perm@teste.com');
      const eq = await api('POST', '/api/equipe', { nome: 'Time Permissões' }, gestor.token);
      assert.equal((await api('POST', '/api/equipe/entrar', { codigo: eq.dados.codigoConvite }, membro.token)).status, 204);
      // padrão: tudo liberado
      let ver = await api('GET', '/api/equipe', undefined, membro.token);
      assert.equal(ver.dados.minhasPermissoes.restrito, true);
      assert.equal(ver.dados.minhasPermissoes.funcoes.excluirClientes, true);
      assert.equal(ver.dados.equipe.catalogoPermissoes.abas.length, 10);
      // membro não muda permissões; chave desconhecida é recusada
      assert.equal((await api('PUT', '/api/equipe/permissoes', { funcoes: { excluirClientes: false } }, membro.token)).status, 403);
      assert.equal((await api('PUT', '/api/equipe/permissoes', { funcoes: { voar: false } }, gestor.token)).status, 400);
      const put = await api('PUT', '/api/equipe/permissoes', { abas: { automacoes: false, financeiro: false }, funcoes: { excluirClientes: false, fechamentoVenda: false, editarFunis: false } }, gestor.token);
      assert.equal(put.status, 200, JSON.stringify(put.dados));
      // o membro fica sem; a gestora continua com tudo
      const bm = await api('GET', '/api/board', undefined, membro.token);
      const col = bm.dados.columns[0];
      const card = await api('POST', '/api/cards', { cliente: 'Lead do vendedor', columnId: col.id, valor: 100 }, membro.token);
      const del = await api('DELETE', `/api/cards/${card.dados.id}`, undefined, membro.token);
      assert.equal(del.status, 403);
      assert.match(del.dados.error, /Excluir clientes/);
      assert.equal((await api('GET', '/api/automacoes', undefined, membro.token)).status, 403);
      assert.equal((await api('GET', '/api/financeiro', undefined, membro.token)).status, 403);
      assert.equal((await api('GET', '/api/financeiro/fechamento/modo', undefined, membro.token)).status, 200); // o CRM precisa saber o modo
      assert.equal((await api('POST', `/api/financeiro/fechamento/${card.dados.id}`, { valorFinal: 1, forma: 'avista', primeiraData: '2026-10-19', meio: 'pix' }, membro.token)).status, 403);
      assert.equal((await api('POST', '/api/columns', { nome: 'Nova', funilId: col.funilId }, membro.token)).status, 403);
      assert.equal((await api('GET', '/api/regras-comissao', undefined, membro.token)).status, 200); // ler a lista fica liberado
      assert.equal((await api('GET', '/api/automacoes', undefined, gestor.token)).status, 200);
      ver = await api('GET', '/api/equipe', undefined, membro.token);
      assert.equal(ver.dados.minhasPermissoes.abas.automacoes, false);
      // a gestora vira gestora também do vendedor? Não: promover o vendedor a gestor libera tudo pra ele
      await api('PUT', `/api/equipe/membro/${membro.user.id}/papel`, { papel: 'supervisor' }, gestor.token);
      assert.equal((await api('GET', '/api/automacoes', undefined, membro.token)).status, 200);
      await api('PUT', `/api/equipe/membro/${membro.user.id}/papel`, { papel: 'membro' }, gestor.token);
      assert.equal((await api('GET', '/api/automacoes', undefined, membro.token)).status, 403);

      // dono do sistema: vê as equipes e libera de novo (fica na auditoria da gestora)
      assert.equal((await api('GET', '/api/dono/equipes', undefined, membro.token)).status, 403);
      const eqs = await api('GET', '/api/dono/equipes', undefined, suporte.token);
      assert.equal(eqs.status, 200, JSON.stringify(eqs.dados));
      const minha = eqs.dados.equipes.find((e) => e.nome === 'Time Permissões');
      assert.equal(minha.membros, 2);
      assert.equal(minha.permissoes.abas.automacoes, false);
      assert.equal((await api('PUT', `/api/dono/equipes/${minha.id}/permissoes`, { abas: {}, funcoes: {} }, suporte.token)).status, 200);
      assert.equal((await api('GET', '/api/automacoes', undefined, membro.token)).status, 200);
      const aud = await api('GET', '/api/auditoria', undefined, gestor.token);
      const lista = aud.dados.logs || aud.dados.auditoria || aud.dados;
      assert.ok(JSON.stringify(lista).includes('pelo suporte do Livro-Caixa (suporte.perm@teste.com)'));

      // regras de comissão de um cliente, pelo Painel do dono
      const rg = await api('GET', `/api/dono/clientes/${membro.user.id}/regras`, undefined, suporte.token);
      assert.equal(rg.status, 200, JSON.stringify(rg.dados));
      const padrao = rg.dados.regras.find((r) => r.chave === 'padrao');
      assert.equal(padrao.descricao, '1x 5%, sobre o valor final');
      assert.equal((await api('PUT', `/api/dono/clientes/${membro.user.id}/regras/${padrao.id}`, { blocos: [] }, suporte.token)).status, 400);
      const ed = await api('PUT', `/api/dono/clientes/${membro.user.id}/regras/${padrao.id}`, { blocos: [{ parcelas: 2, percentual: 1.5 }], base: 'negociado' }, suporte.token);
      assert.equal(ed.status, 200, JSON.stringify(ed.dados));
      assert.equal(ed.dados.descricao, '2x 1,5%, sobre o valor do card');
      const nova = await api('POST', `/api/dono/clientes/${membro.user.id}/regras`, { nome: 'Consórcio', blocos: [{ parcelas: 1, percentual: 3 }] }, suporte.token);
      assert.equal(nova.status, 201, JSON.stringify(nova.dados));
      // o cliente vê as regras novas e o registro na auditoria dele
      const doCliente = await api('GET', '/api/regras-comissao', undefined, membro.token);
      assert.equal(doCliente.dados.regras.length, 2);
      assert.equal(doCliente.dados.regras.find((r) => r.chave === 'padrao').blocos[0].percentual, 0.015);
      const audC = await api('GET', '/api/auditoria', undefined, membro.token);
      const txt = JSON.stringify(audC.dados);
      assert.ok(txt.includes('Antes: 1x 5%, sobre o valor final. Depois: 2x 1,5%, sobre o valor do card.'));
      assert.ok(txt.includes('Regra de comissão \\"Consórcio\\" criada pelo suporte'));
      // quem não é dono não mexe
      assert.equal((await api('GET', `/api/dono/clientes/${membro.user.id}/regras`, undefined, gestor.token)).status, 403);
    } finally {
      if (antes === undefined) delete process.env.DONOS_EMAILS; else process.env.DONOS_EMAILS = antes;
    }
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

  test('WhatsApp e Instagram foram retirados: rotas fora do ar e fluxo sem etapa de mensagem', async () => {
    const t = contas.ana.token;
    for (const rota of ['/api/whatsapp/status', '/api/whatsapp/conversas', '/api/instagram/status', '/api/agendamentos']) {
      const r = await api('GET', rota, undefined, t);
      assert.equal(r.status, 404, rota);
    }
    assert.equal((await api('POST', '/api/whatsapp/webhook', { entry: [] })).status, 404);
    const board = await api('GET', '/api/board', undefined, t);
    const col = board.dados.columns[0];
    const f = await api('POST', '/api/fluxos', { nome: 'Antigo', colunaGatilhoId: col.id, etapas: [{ diasAposInicio: 0, tipo: 'mensagem', params: { texto: 'oi' } }] }, t);
    assert.equal(f.status, 400);
    assert.match(f.dados.error, /WhatsApp/);
    const cfg = await api('GET', '/api/config/integracoes');
    assert.equal(cfg.dados.whatsappWebhook, undefined);
  });

  test('agendadores rodam sem erro (automação por tempo, fluxos, lembretes)', async () => {
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

  test('assinatura com o Asaas (falso): teste grátis, bloqueio, pagamento pelo aviso, plano e cancelamento', async () => {
    const http = require('http');
    const A = require('../utils/assinatura');
    const { query } = require('../db/pool');
    // Asaas de mentira: guarda clientes, assinaturas e cobranças em memória
    const fake = { clientes: {}, assinaturas: {}, cobrancas: [], semChave: 0 };
    let n = 0;
    const asaasFalso = http.createServer((req, res) => {
      let corpo = '';
      req.on('data', (c) => { corpo += c; });
      req.on('end', () => {
        if (!String(req.headers.access_token || '').startsWith('$aact_hmlg_')) { fake.semChave++; res.writeHead(401); return res.end('{}'); }
        const dados = corpo ? JSON.parse(corpo) : {};
        const url = req.url.split('?')[0];
        const responder = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
        let m;
        if (req.method === 'POST' && url === '/customers') { const id = `cus_${++n}`; fake.clientes[id] = { id, ...dados }; return responder(200, fake.clientes[id]); }
        if (req.method === 'PUT' && (m = url.match(/^\/customers\/(.+)$/))) { Object.assign(fake.clientes[m[1]], dados); return responder(200, fake.clientes[m[1]]); }
        if (req.method === 'POST' && url === '/subscriptions') {
          if (!fake.clientes[dados.customer]) return responder(400, { errors: [{ code: 'invalid_customer', description: 'Cliente inexistente.' }] });
          const id = `sub_${++n}`;
          fake.assinaturas[id] = { id, status: 'ACTIVE', deleted: false, ...dados };
          fake.cobrancas.push({ id: `pay_${++n}`, subscription: id, status: 'PENDING', dueDate: dados.nextDueDate, value: dados.value, invoiceUrl: `https://sandbox.asaas.com/i/${n}` });
          return responder(200, fake.assinaturas[id]);
        }
        if ((m = url.match(/^\/subscriptions\/([^/]+)\/payments$/))) return responder(200, { data: fake.cobrancas.filter((c) => c.subscription === m[1]) });
        if ((m = url.match(/^\/subscriptions\/([^/]+)$/))) {
          const a = fake.assinaturas[m[1]];
          if (!a) return responder(404, { errors: [{ description: 'Não encontrada' }] });
          if (req.method === 'GET') return responder(200, a);
          if (req.method === 'PUT') { Object.assign(a, dados); if (dados.updatePendingPayments) fake.cobrancas.filter((c) => c.subscription === a.id && c.status === 'PENDING').forEach((c) => { c.value = dados.value; }); return responder(200, a); }
          if (req.method === 'DELETE') { a.deleted = true; fake.cobrancas = fake.cobrancas.filter((c) => !(c.subscription === a.id && c.status === 'PENDING')); return responder(200, { deleted: true, id: a.id }); }
        }
        return responder(404, { errors: [{ description: `rota falsa inexistente ${req.method} ${url}` }] });
      });
    });
    await new Promise((ok) => asaasFalso.listen(0, ok));
    const antes = { ...process.env };
    process.env.ASAAS_API_KEY = '$aact_hmlg_teste';
    process.env.ASAAS_URL = `http://127.0.0.1:${asaasFalso.address().port}`;
    process.env.ASAAS_WEBHOOK_TOKEN = 'token-do-webhook-teste';
    process.env.ASSINATURA_DIAS_TESTE = '7';
    try {
      const r = await api('POST', '/api/auth/register', { nome: 'Dani', email: 'dani@teste.com', senha: 'senha123' });
      const t = r.dados.token; const id = r.dados.user.id;
      let s = await api('GET', '/api/assinatura', undefined, t);
      assert.equal(s.status, 200);
      assert.equal(s.dados.cobranca, true);
      assert.equal(s.dados.emTeste, true);
      assert.equal(s.dados.diasDeTeste, 7);
      assert.equal(s.dados.ambiente, 'sandbox');
      // a pessoa logada NÃO consegue gravar na própria assinatura (RLS: só o sistema grava)
      const { comoUsuario } = require('../db/contexto');
      const gravou = await comoUsuario(id, () => query("UPDATE assinaturas SET status = 'cortesia' WHERE user_id = $1", [id]));
      assert.equal(gravou.rowCount, 0);

      assert.equal((await api('POST', '/api/assinatura/assinar', { plano: 'completo', nome: 'Dani Souza', cpfCnpj: '529.982.247-24' }, t)).status, 400);
      const ass = await api('POST', '/api/assinatura/assinar', { plano: 'completo', nome: 'Dani Souza', cpfCnpj: '529.982.247-25' }, t);
      assert.equal(ass.status, 200, JSON.stringify(ass.dados));
      assert.match(ass.dados.link, /^https:\/\/sandbox\.asaas\.com\/i\//);
      const sub = Object.values(fake.assinaturas)[0];
      assert.equal(sub.billingType, 'UNDEFINED');
      assert.equal(sub.value, 39.9);
      assert.equal(sub.cycle, 'MONTHLY');
      assert.equal(sub.nextDueDate, A.hojeEmBrasilia(new Date(Date.now() + 7 * 86400000)), '1ª cobrança vence no fim do teste');
      assert.equal(fake.clientes[sub.customer].cpfCnpj, '52998224725');
      assert.equal((await api('POST', '/api/assinatura/assinar', { plano: 'completo', nome: 'Dani Souza', cpfCnpj: '52998224725' }, t)).status, 409, 'não cria duas');

      // teste acabou há 10 dias e não pagou: bloqueia tudo, menos assinatura e exportar dados
      await query("UPDATE assinaturas SET teste_ate = now() - interval '10 days' WHERE user_id = $1", [id]);
      A.esquecer(id);
      const bloq = await api('GET', '/api/board', undefined, t);
      assert.equal(bloq.status, 402);
      assert.equal(bloq.dados.motivo, 'aguardando_pagamento');
      assert.equal((await api('GET', '/api/assinatura', undefined, t)).dados.liberado, false);
      assert.equal((await api('GET', '/api/backup/exportar-tudo', undefined, t)).status, 200);

      // aviso falso (token errado) é recusado; aviso dizendo "pago" sem o Asaas confirmar não libera
      const aviso = (corpo, token) => fetch(`${base}/api/assinatura/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'asaas-access-token': token }, body: JSON.stringify(corpo) });
      assert.equal((await aviso({ id: 'evt_x', event: 'PAYMENT_RECEIVED', payment: { subscription: sub.id, status: 'RECEIVED' } }, 'errado')).status, 401);
      assert.equal((await aviso({ id: 'evt_0', event: 'PAYMENT_RECEIVED', payment: { subscription: sub.id, status: 'RECEIVED' } }, 'token-do-webhook-teste')).status, 200);
      await new Promise((ok) => setTimeout(ok, 300));
      assert.equal((await api('GET', '/api/board', undefined, t)).status, 402, 'o servidor confere no Asaas, não confia no aviso');

      // agora o Asaas confirma o pagamento
      fake.cobrancas[0].status = 'RECEIVED';
      const ok = await aviso({ id: 'evt_1', event: 'PAYMENT_RECEIVED', payment: { id: fake.cobrancas[0].id, subscription: sub.id } }, 'token-do-webhook-teste');
      assert.equal(ok.status, 200);
      await new Promise((r2) => setTimeout(r2, 300));
      s = await api('GET', '/api/assinatura', undefined, t);
      assert.equal(s.dados.status, 'ativa');
      assert.equal(s.dados.liberado, true);
      assert.equal((await api('GET', '/api/board', undefined, t)).status, 200);
      const repetido = await (await aviso({ id: 'evt_1', event: 'PAYMENT_RECEIVED', payment: { subscription: sub.id } }, 'token-do-webhook-teste')).json();
      assert.equal(repetido.repetido, true);

      // validação de saque: recusa sempre, com ou sem token certo
      process.env.ASAAS_SAQUE_TOKEN = 'token-saque-teste';
      for (const tk of ['token-saque-teste', 'errado']) {
        const vs = await fetch(`${base}/api/assinatura/validar-saque`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'asaas-access-token': tk }, body: JSON.stringify({ type: 'TRANSFER', transfer: { id: 'tr_1', value: 5000 } }) });
        assert.equal(vs.status, 200);
        assert.equal((await vs.json()).status, 'REFUSED');
      }

      // estorno: o acesso pago some; pago de novo: volta
      fake.cobrancas[0].status = 'REFUNDED';
      assert.equal((await api('POST', '/api/assinatura/atualizar', {}, t)).dados.situacao.liberado, false);
      fake.cobrancas[0].status = 'RECEIVED';
      assert.equal((await api('POST', '/api/assinatura/atualizar', {}, t)).dados.situacao.liberado, true);

      // troca pro Essencial: o sistema cria uma assinatura nova (a partir do próximo vencimento)
      // e apaga a antiga; o mês já pago continua valendo
      const ativa = (clienteId) => Object.values(fake.assinaturas).filter((a) => a.customer === clienteId && !a.deleted);
      const troca = await api('POST', '/api/assinatura/trocar-plano', { plano: 'essencial' }, t);
      assert.equal(troca.status, 200, JSON.stringify(troca.dados));
      assert.equal(fake.assinaturas[sub.id].deleted, true, 'a antiga é apagada');
      const sub2 = ativa(sub.customer);
      assert.equal(sub2.length, 1, 'só uma assinatura ativa');
      assert.equal(sub2[0].value, 29.9);
      assert.equal(sub2[0].cycle, 'MONTHLY');
      assert.equal(sub2[0].nextDueDate, A.somarMeses(sub.nextDueDate, 1), 'começa quando o mês pago acaba');
      assert.equal(troca.dados.situacao.liberado, true);
      assert.equal(troca.dados.situacao.plano, 'essencial');
      const ia = await api('POST', '/api/ai/assistente', { mensagens: [{ role: 'user', content: 'oi' }] }, t);
      assert.equal(ia.status, 403);
      assert.equal(ia.dados.recurso, 'ia');
      // aviso da assinatura antiga apagada chega depois: é ignorado
      assert.equal((await aviso({ id: 'evt_old', event: 'SUBSCRIPTION_DELETED', subscription: { id: sub.id, deleted: true } }, 'token-do-webhook-teste')).status, 200);
      await new Promise((r2) => setTimeout(r2, 200));
      assert.equal((await api('GET', '/api/assinatura', undefined, t)).dados.status, 'ativa', 'troca com mês pago continua em dia');

      // vira anual: nova assinatura YEARLY de R$ 300, começando no fim do período pago
      const anual = await api('POST', '/api/assinatura/trocar-plano', { plano: 'essencial', ciclo: 'anual' }, t);
      assert.equal(anual.status, 200, JSON.stringify(anual.dados));
      const sub3 = ativa(sub.customer);
      assert.equal(sub3.length, 1);
      assert.equal(sub3[0].cycle, 'YEARLY');
      assert.equal(sub3[0].value, 300);
      assert.equal(anual.dados.situacao.ciclo, 'anual');
      assert.equal(anual.dados.situacao.liberado, true);

      // cancela: as próximas cobranças somem, mas o período pago continua valendo
      const canc = await api('POST', '/api/assinatura/cancelar', {}, t);
      assert.equal(canc.status, 200, JSON.stringify(canc.dados));
      assert.equal(ativa(sub.customer).length, 0);
      assert.equal(canc.dados.situacao.status, 'cancelada');
      assert.equal(canc.dados.situacao.liberado, true);
      assert.equal((await aviso({ id: 'evt_2', event: 'SUBSCRIPTION_DELETED', subscription: { id: sub3[0].id, deleted: true } }, 'token-do-webhook-teste')).status, 200);
      await new Promise((r2) => setTimeout(r2, 300));
      s = await api('GET', '/api/assinatura', undefined, t);
      assert.equal(s.dados.status, 'cancelada');
      assert.equal(s.dados.liberado, true, 'cancelar não pode tirar o mês já pago');
      assert.ok(s.dados.pagoAte);

      // assina de novo: não perde o período pago, a 1ª fatura vence quando ele acaba
      const volta = await api('POST', '/api/assinatura/assinar', { plano: 'completo', nome: 'Dani Souza', cpfCnpj: '52998224725' }, t);
      assert.equal(volta.status, 200, JSON.stringify(volta.dados));
      assert.equal(volta.dados.situacao.liberado, true, 'voltar a assinar não tira o período já pago');
      assert.equal(volta.dados.vencimento, A.somarMeses(sub.nextDueDate, 1));

      // ---- desconto pessoal dado pelo dono: 50% por 2 meses ----
      process.env.DONOS_EMAILS = 'dona@teste.com';
      const dona = await api('POST', '/api/auth/register', { nome: 'Dona', email: 'dona@teste.com', senha: 'senha123' });
      const td = dona.dados.token;
      assert.equal((await api('PUT', `/api/dono/clientes/${id}/desconto`, { percentual: 50, meses: 2 }, t)).status, 403, 'cliente não dá desconto');
      const desc = await api('PUT', `/api/dono/clientes/${id}/desconto`, { percentual: 50, meses: 2 }, td);
      assert.equal(desc.status, 200, JSON.stringify(desc.dados));
      let s4 = ativa(sub.customer);
      assert.equal(s4.length, 1);
      assert.equal(s4[0].value, 19.95, '50% de R$ 39,90');
      s = await api('GET', '/api/assinatura', undefined, t);
      assert.equal(s.dados.desconto.percentual, 50);
      assert.equal(s.dados.desconto.origem, 'pessoal');
      assert.equal(s.dados.valorAtual, 19.95);
      // os 2 meses passaram: na próxima conferência o valor volta ao normal
      await query("UPDATE assinaturas SET desconto_ate = (now() - interval '1 day')::date WHERE user_id = $1", [id]);
      await api('POST', '/api/assinatura/atualizar', {}, t);
      s4 = ativa(sub.customer);
      assert.equal(s4.length, 1);
      assert.equal(s4[0].value, 39.9, 'desconto acabou: preço cheio');
      // tirar o desconto de vez
      assert.equal((await api('PUT', `/api/dono/clientes/${id}/desconto`, { percentual: 0 }, td)).status, 200);

      // ---- promoção para novos: 20% para sempre ----
      assert.equal((await api('PUT', '/api/dono/promocao', { ativa: true, percentual: 95 }, td)).status, 400);
      const promo = await api('PUT', '/api/dono/promocao', { ativa: true, percentual: 20, meses: null }, td);
      assert.equal(promo.status, 200, JSON.stringify(promo.dados));
      const novo = await api('POST', '/api/auth/register', { nome: 'Edu', email: 'edu@teste.com', senha: 'senha123' });
      const te = novo.dados.token;
      const precos = await api('GET', '/api/assinatura', undefined, te);
      assert.equal(precos.dados.ofertas.completo.mensal.final, 31.92, '20% de R$ 39,90');
      assert.equal(precos.dados.ofertas.essencial.anual.final, 240, '20% de R$ 300');
      assert.equal(precos.dados.desconto.origem, 'promocao');
      const assEdu = await api('POST', '/api/assinatura/assinar', { plano: 'essencial', ciclo: 'anual', nome: 'Edu Lima', cpfCnpj: '11.222.333/0001-81' }, te);
      assert.equal(assEdu.status, 200, JSON.stringify(assEdu.dados));
      assert.equal(assEdu.dados.valor, 240);
      const subEdu = Object.values(fake.assinaturas).find((a) => fake.clientes[a.customer].cpfCnpj === '11222333000181');
      assert.equal(subEdu.cycle, 'YEARLY');
      assert.equal(subEdu.value, 240);
      // promoção desligada depois: quem já assinou mantém (para sempre)
      await api('PUT', '/api/dono/promocao', { ativa: false }, td);
      const edu2 = await api('POST', '/api/assinatura/atualizar', {}, te);
      assert.equal(edu2.dados.situacao.desconto.percentual, 20);
      assert.equal(Object.values(fake.assinaturas).filter((a) => a.customer === subEdu.customer && !a.deleted)[0].value, 240);
      // pago o anual: acesso por 12 meses
      fake.cobrancas.find((c) => c.subscription === subEdu.id).status = 'CONFIRMED';
      const edu3 = await api('POST', '/api/assinatura/atualizar', {}, te);
      assert.equal(edu3.dados.situacao.pagoAte.slice(0, 7), A.somarMeses(subEdu.nextDueDate, 12).slice(0, 7));
      // painel do dono: receita em equivalente mensal e anuais contados
      const resumo = await api('GET', '/api/dono/resumo', undefined, td);
      assert.equal(resumo.status, 200);
      assert.equal(resumo.dados.totais.anuais >= 1, true);
      assert.equal(resumo.dados.clientes.find((c) => c.email === 'edu@teste.com').desconto.percentual, 20);
      assert.equal(fake.semChave, 0);
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in antes)) delete process.env[k];
      Object.assign(process.env, antes);
      await new Promise((ok) => asaasFalso.close(ok));
    }
  });

  test('painel do dono: só donos abrem, donos fixos e adicionados, números dos clientes', async () => {
    const antes = process.env.DONOS_EMAILS;
    process.env.DONOS_EMAILS = 'Chefe@Teste.com';
    try {
      const chefe = await api('POST', '/api/auth/register', { nome: 'Chefe', email: 'chefe@teste.com', senha: 'senha123' });
      const socio = await api('POST', '/api/auth/register', { nome: 'Sócio', email: 'socio@teste.com', senha: 'senha123' });
      const tc = chefe.dados.token; const ts = socio.dados.token;
      assert.equal((await api('GET', '/api/dono/sou', undefined, tc)).dados.dono, true);
      assert.equal((await api('GET', '/api/dono/sou', undefined, ts)).dados.dono, false);
      assert.equal((await api('GET', '/api/dono/resumo', undefined, ts)).status, 403);
      assert.equal((await api('GET', '/api/dono/saude', undefined, ts)).status, 403);
      const r = await api('GET', '/api/dono/resumo', undefined, tc);
      assert.equal(r.status, 200, JSON.stringify(r.dados));
      assert.ok(r.dados.totais.cadastros >= 2);
      assert.equal(r.dados.clientes.find((c) => c.email === 'chefe@teste.com').situacao, 'dono');
      assert.equal(r.dados.clientes.find((c) => c.email === 'socio@teste.com').situacao, 'livre');
      const sa = await api('GET', '/api/dono/saude', undefined, tc);
      assert.equal(sa.status, 200, JSON.stringify(sa.dados));
      assert.equal(sa.dados.banco.ok, true);
      assert.equal(typeof sa.dados.erros.ultimas24h, 'number');
      // adiciona o sócio como dono
      assert.equal((await api('POST', '/api/dono/donos', { email: 'nao-e-email' }, tc)).status, 400);
      const add = await api('POST', '/api/dono/donos', { email: ' SOCIO@teste.com ' }, tc);
      assert.equal(add.status, 200);
      assert.deepEqual(add.dados.donos.map((d) => [d.email, d.fixo]), [['chefe@teste.com', true], ['socio@teste.com', false]]);
      assert.equal((await api('GET', '/api/dono/resumo', undefined, ts)).status, 200);
      // o dono fixo não pode ser removido pelo painel; ninguém remove a si mesmo
      assert.equal((await api('DELETE', '/api/dono/donos/chefe@teste.com', undefined, ts)).status, 400);
      assert.equal((await api('DELETE', '/api/dono/donos/socio@teste.com', undefined, ts)).status, 400);
      assert.equal((await api('DELETE', '/api/dono/donos/socio@teste.com', undefined, tc)).status, 200);
      assert.equal((await api('GET', '/api/dono/resumo', undefined, ts)).status, 403);
    } finally {
      if (antes === undefined) delete process.env.DONOS_EMAILS; else process.env.DONOS_EMAILS = antes;
    }
  });

  test('avisos por e-mail da assinatura: teste acabando, fatura vencendo, nunca duas vezes', async () => {
    const { enviarAvisosAssinatura } = require('../utils/avisosAssinatura');
    const A = require('../utils/assinatura');
    const { query } = require('../db/pool');
    const antes = { ...process.env };
    const fetchReal = global.fetch;
    const enviados = [];
    global.fetch = async (url, opts) => {
      if (String(url).includes('resend.com')) { enviados.push(JSON.parse(opts.body)); return new Response('{"id":"x"}', { status: 200 }); }
      return fetchReal(url, opts);
    };
    Object.assign(process.env, { ASAAS_API_KEY: '$aact_hmlg_avisos', RESEND_API_KEY: 're_teste', EMAIL_FROM: 'Livro-Caixa <oi@teste.com>', APP_URL: 'https://app.teste', DONOS_EMAILS: 'chefe-avisos@teste.com' });
    try {
      const mk = async (nome, email) => { const r = await api('POST', '/api/auth/register', { nome, email, senha: 'senha123' }); await api('GET', '/api/assinatura', undefined, r.dados.token); return r.dados.user.id; };
      const fabi = await mk('Fabi Rocha', 'fabi@teste.com');
      const gui = await mk('Gui', 'gui@teste.com');
      const chefe = await mk('Chefe', 'chefe-avisos@teste.com');
      const meioDia = new Date();
      meioDia.setUTCHours(15, 0, 0, 0); // 12h em Brasília
      await query("UPDATE assinaturas SET teste_ate = $2::timestamptz + interval '1 day' WHERE user_id = ANY($1)", [[fabi, chefe], meioDia.toISOString()]);
      const venc = A.hojeEmBrasilia(new Date(meioDia.getTime() + 2 * 86400000));
      await query("UPDATE assinaturas SET teste_ate = now() - interval '20 days', status = 'aguardando', asaas_assinatura_id = 'sub_gui', plano = 'essencial', valor_contratado = 29.9, proximo_vencimento = $2, ultimo_link_pagamento = 'https://asaas/i/gui' WHERE user_id = $1", [gui, venc]);
      const n = await enviarAvisosAssinatura(meioDia);
      const para = enviados.map((e) => `${e.to[0]}|${e.subject}`);
      assert.ok(para.some((x) => x.startsWith('fabi@teste.com|') && /acaba em 2 dias/.test(x)), para.join('\n'));
      assert.ok(para.some((x) => x.startsWith('gui@teste.com|') && /vence em/.test(x)), para.join('\n'));
      assert.ok(!para.some((x) => x.startsWith('chefe-avisos@')), 'dono não recebe aviso de cobrança');
      assert.ok(enviados.find((e) => e.to[0] === 'gui@teste.com').html.includes('R$'));
      assert.equal(n, enviados.length);
      // de novo: nada repetido
      const quantos = enviados.length;
      await enviarAvisosAssinatura(meioDia);
      assert.equal(enviados.length, quantos, 'o mesmo aviso não sai duas vezes');
      // de madrugada não manda nada
      const madrugada = new Date(meioDia); madrugada.setUTCHours(6, 0, 0, 0);
      assert.equal(await enviarAvisosAssinatura(madrugada), 0);
    } finally {
      global.fetch = fetchReal;
      for (const k of Object.keys(process.env)) if (!(k in antes)) delete process.env[k];
      Object.assign(process.env, antes);
    }
  });

  test('Caixa e Estoque: checklist, produtos com variação, venda, compra, gasto e financeiro', async () => {
    const reg = async (n) => { const r = await api('POST', '/api/auth/register', { nome: n, email: `${n}@teste.com`, senha: 'senha123' }); assert.equal(r.status, 201); return r.dados.token; };
    const t = await reg('lojinha');
    const t2 = await reg('outraloja');
    // primeiro acesso: ainda sem negócio
    let r = await api('GET', '/api/estoque', undefined, t);
    assert.equal(r.status, 200);
    assert.equal(r.dados.negocio, null);
    r = await api('PUT', '/api/estoque/negocio', { tipo: 'loja', nome: 'Loja da Lu', controlaEstoque: true, cardapioAtivo: true }, t);
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal(r.dados.negocio.cardapioAtivo, false, 'loja não tem cardápio');
    assert.equal(r.dados.negocio.checklist.configurado, true);
    // produto simples e produto com variações
    r = await api('POST', '/api/estoque/produtos', { nome: 'Caneca', preco: 30, custo: 12, estoqueInicial: 10, estoqueMinimo: 3 }, t);
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    const caneca = r.dados.produto;
    assert.equal(caneca.estoque, 10);
    r = await api('POST', '/api/estoque/produtos', { nome: 'Camiseta', preco: 50, custo: 20, variacoes: [{ nome: 'P', estoqueInicial: 2 }, { nome: 'G', preco: 55, estoqueInicial: 5 }] }, t);
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    const cam = r.dados.produto;
    assert.equal(cam.estoque, 7);
    const [p, g] = cam.variacoes;
    assert.equal(g.precoFinal, 55);
    // outra conta não enxerga
    assert.equal((await api('GET', '/api/estoque/produtos', undefined, t2)).dados.produtos.length, 0);
    assert.equal((await api('PUT', `/api/estoque/produtos/${caneca.id}`, { nome: 'x' }, t2)).status, 400);
    // taxa do débito guardada (a mesma do fechamento do CRM)
    await api('PUT', '/api/financeiro/fechamento/taxas', { debito: 2 }, t);
    // venda no balcão
    r = await api('POST', '/api/estoque/vendas', { meio: 'debito', desconto: 5, cliente: 'Rita', itens: [
      { produtoId: caneca.id, qtd: 8 }, { produtoId: cam.id, variacaoId: g.id, qtd: 1 }, { nome: 'Embrulho', qtd: 1, unit: 3 }] }, t);
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    const venda = r.dados.venda;
    assert.equal(venda.subtotal, 298); // 240 + 55 + 3
    assert.equal(venda.total, 293);
    assert.equal(venda.cmv, 116); // 8*12 + 20
    assert.equal(venda.taxa, 5.86);
    assert.ok(r.dados.alertas.some((a) => /Caneca: estoque baixo/.test(a)), JSON.stringify(r.dados.alertas));
    // sem variação escolhida: erro
    assert.equal((await api('POST', '/api/estoque/vendas', { meio: 'pix', itens: [{ produtoId: cam.id, qtd: 1 }] }, t)).status, 400);
    // estoque baixou e o financeiro recebeu a receita (com CMV) e a taxa
    let prods = (await api('GET', '/api/estoque/produtos', undefined, t)).dados.produtos;
    assert.equal(prods.find((x) => x.id === caneca.id).estoque, 2);
    assert.equal(prods.find((x) => x.id === caneca.id).situacao, 'baixo');
    let fin = (await api('GET', '/api/financeiro', undefined, t)).dados;
    const rec = fin.dados.transacoes.find((x) => x.estoque && x.estoque.origem === 'venda');
    assert.ok(rec, 'receita da venda');
    assert.equal(rec.type || rec.tipo, 'Receita');
    assert.equal(rec.estoque.cmv, 116);
    assert.ok(fin.dados.transacoes.some((x) => x.estoque && x.estoque.origem === 'taxa' && (x.value || x.valor) === 5.86));
    // uma tela velha do financeiro salvando sem a venda NÃO apaga os lançamentos do estoque
    const semEstoque = fin.dados.transacoes.filter((x) => !x.estoque);
    const velho = new Date(Date.now() - 60000).toISOString();
    assert.equal((await api('PUT', '/api/financeiro/transacoes', { valor: semEstoque, carregadoEm: velho }, t)).status, 200);
    fin = (await api('GET', '/api/financeiro', undefined, t)).dados;
    assert.equal(fin.dados.transacoes.filter((x) => x.estoque).length, 2);
    // compra: entra no estoque, custo médio com frete, despesa no financeiro
    r = await api('POST', '/api/estoque/compras', { fornecedor: 'Atacado Sul', meio: 'pix', frete: 10, itens: [{ produtoId: caneca.id, qtd: 10, custoUnit: 14 }] }, t);
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal(r.dados.compra.total, 150);
    prods = (await api('GET', '/api/estoque/produtos', undefined, t)).dados.produtos;
    const c2 = prods.find((x) => x.id === caneca.id);
    assert.equal(c2.estoque, 12);
    assert.equal(c2.custo, 14.5); // (2*12 + 10*15) / 12
    fin = (await api('GET', '/api/financeiro', undefined, t)).dados;
    assert.ok(fin.dados.transacoes.some((x) => x.estoque && x.estoque.origem === 'compra' && (x.category || x.categoria) === 'Custo de mercadoria'));
    // nota de gasto
    r = await api('POST', '/api/estoque/gastos', { descricao: 'Conta de luz', valor: 120.5, categoria: 'Moradia' }, t);
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal((await api('GET', '/api/estoque/gastos', undefined, t)).dados.gastos.length, 1);
    // resumo
    const res = (await api('GET', '/api/estoque/resumo', undefined, t)).dados;
    assert.equal(res.hoje.total, 293);
    assert.equal(res.mes.lucroBruto, 171.14);
    assert.equal(res.mes.gastos, 270.5);
    // cancelar a venda devolve o estoque e tira do financeiro
    r = await api('POST', `/api/estoque/vendas/${venda.id}/cancelar`, {}, t);
    assert.equal(r.dados.venda.cancelada, true);
    prods = (await api('GET', '/api/estoque/produtos', undefined, t)).dados.produtos;
    assert.equal(prods.find((x) => x.id === caneca.id).estoque, 20);
    assert.equal(prods.find((x) => x.id === cam.id).variacoes.find((v) => v.nome === 'G').estoque, 5);
    fin = (await api('GET', '/api/financeiro', undefined, t)).dados;
    assert.ok(!fin.dados.transacoes.some((x) => x.estoque && ['venda', 'taxa'].includes(x.estoque.origem)));
    // ajuste: contei e tem 18
    r = await api('POST', '/api/estoque/ajuste', { produtoId: caneca.id, modo: 'saldo', saldo: 18 }, t);
    assert.equal(r.dados.saldo, 18);
    const mov = (await api('GET', `/api/estoque/produtos/${caneca.id}/movimentos`, undefined, t)).dados.movimentos;
    assert.deepEqual(mov.map((m) => m.tipo), ['ajuste', 'cancelamento', 'compra', 'venda', 'inicial']);
    // membro de equipe sem a aba: 403 (permissão nova "estoque" existe)
    const { ABAS } = require('../utils/permissoes');
    assert.ok(ABAS.some((a) => a.chave === 'estoque'));
  });

  test('Cardápio do restaurante: página pública, pedido pelo WhatsApp e pedido vira venda', async () => {
    const r0 = await api('POST', '/api/auth/register', { nome: 'Resto', email: 'resto@teste.com', senha: 'senha123' });
    const t = r0.dados.token;
    let r = await api('PUT', '/api/estoque/negocio', { tipo: 'restaurante', nome: 'Cantina da Nona', cardapioAtivo: true }, t);
    assert.equal(r.status, 400, 'sem WhatsApp não liga o cardápio');
    r = await api('PUT', '/api/estoque/negocio', { tipo: 'restaurante', nome: 'Cantina da Nona', cardapioAtivo: true, whatsapp: '(11) 98888-7777', taxaEntrega: 6, controlaEstoque: false }, t);
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal(r.dados.negocio.slug, 'cantina-da-nona');
    r = await api('POST', '/api/estoque/produtos', { nome: 'Pizza', categoria: 'Pizzas', preco: 40, custo: 15, controlaEstoque: false,
      variacoes: [{ nome: 'Média' }, { nome: 'Grande', preco: 55, custo: 20 }],
      opcoes: [{ nome: 'Borda', tipo: 'um', escolhas: [{ nome: 'Sem borda', preco: 0 }, { nome: 'Catupiry', preco: 8 }] }, { nome: 'Extras', tipo: 'varios', escolhas: [{ nome: 'Bacon', preco: 5 }] }] }, t);
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    const pizza = r.dados.produto;
    await api('POST', '/api/estoque/produtos', { nome: 'Rascunho', preco: 1, noCardapio: false, controlaEstoque: false }, t);
    const refri = (await api('POST', '/api/estoque/produtos', { nome: 'Refri lata', categoria: 'Bebidas', preco: 6, custo: 3, estoqueInicial: 1 }, t)).dados.produto;
    // página pública
    const pag = await fetch(base + '/c/cantina-da-nona');
    assert.equal(pag.status, 200);
    r = await api('GET', '/api/publico/cardapio/cantina-da-nona');
    assert.equal(r.status, 200);
    assert.deepEqual(r.dados.produtos.map((x) => x.nome).sort(), ['Pizza', 'Refri lata']);
    assert.equal(r.dados.produtos.find((x) => x.nome === 'Pizza').variacoes.length, 2);
    assert.equal((await api('GET', '/api/publico/cardapio/nao-existe')).status, 404);
    // pedido: o preço vem do servidor (o "unit" mandado pela página é ignorado)
    const grande = pizza.variacoes.find((v) => v.nome === 'Grande');
    r = await api('POST', '/api/publico/cardapio/cantina-da-nona/pedido', { nome: 'João', telefone: '11 97777-6666', tipo: 'entrega', endereco: 'Rua A, 10', pagamento: 'dinheiro', troco: '100',
      itens: [{ produtoId: pizza.id, variacaoId: grande.id, qtd: 1, unit: 1, opcoes: { 0: [1], 1: [0] } }, { produtoId: refri.id, qtd: 1 }] });
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal(r.dados.total, 80); // 55 + 8 + 5 + 6 + entrega 6
    assert.match(r.dados.whatsapp, /^https:\/\/wa\.me\/5511988887777\?text=/);
    assert.match(r.dados.mensagem, /Catupiry, Bacon/);
    // borda é obrigatória; refri sem estoque suficiente
    assert.equal((await api('POST', '/api/publico/cardapio/cantina-da-nona/pedido', { nome: 'X', tipo: 'retirada', itens: [{ produtoId: pizza.id, variacaoId: grande.id, qtd: 1 }] })).status, 400);
    assert.equal((await api('POST', '/api/publico/cardapio/cantina-da-nona/pedido', { nome: 'X', tipo: 'retirada', itens: [{ produtoId: refri.id, qtd: 2 }] })).status, 400);
    // painel: o pedido aparece e vira venda
    const peds = (await api('GET', '/api/estoque/pedidos', undefined, t)).dados.pedidos;
    assert.equal(peds.length, 1);
    assert.equal(peds[0].status, 'novo');
    r = await api('POST', `/api/estoque/pedidos/${peds[0].id}/vender`, {}, t);
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal(r.dados.venda.total, 80);
    assert.equal(r.dados.venda.meio, 'dinheiro');
    assert.equal(r.dados.venda.acrescimo, 6);
    assert.equal((await api('POST', `/api/estoque/pedidos/${peds[0].id}/vender`, {}, t)).status, 400, 'não vende duas vezes');
    const prods = (await api('GET', '/api/estoque/produtos', undefined, t)).dados.produtos;
    assert.equal(prods.find((x) => x.id === refri.id).estoque, 0);
    r = await api('GET', '/api/publico/cardapio/cantina-da-nona');
    assert.equal(r.dados.produtos.find((x) => x.nome === 'Refri lata').esgotado, true);
    // cardápio desligado some do ar
    await api('PUT', '/api/estoque/negocio', { cardapioAtivo: false }, t);
    assert.equal((await api('GET', '/api/publico/cardapio/cantina-da-nona')).status, 404);
  });

  test('PDV: clientes, histórico, cashback e cartão fidelidade', async () => {
    const r0 = await api('POST', '/api/auth/register', { nome: 'Fid', email: 'fidelidade@teste.com', senha: 'senha123' });
    const t = r0.dados.token;
    await api('PUT', '/api/estoque/negocio', { tipo: 'restaurante', nome: 'Bistrô Fiel', whatsapp: '11977776666', cardapioAtivo: true, aceitaEntrega: false }, t);
    const prato = (await api('POST', '/api/estoque/produtos', { nome: 'Prato do dia', preco: 50, custo: 20, controlaEstoque: false }, t)).dados.produto;
    // programa inválido e válido
    assert.equal((await api('PUT', '/api/estoque/negocio', { fidelidade: { modelo: 'cashback', cashbackPct: 90 } }, t)).status, 400);
    let r = await api('PUT', '/api/estoque/negocio', { fidelidade: { modelo: 'cashback', cashbackPct: 10, validadeDias: 30, minimoUso: 0 } }, t);
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal(r.dados.negocio.fidelidade.modelo, 'cashback');
    // cliente
    r = await api('POST', '/api/estoque/clientes', { nome: 'Carla', telefone: '(11) 95555-4444', participa: true }, t);
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    const carla = r.dados.cliente;
    assert.equal(carla.telefone, '11955554444');
    assert.equal((await api('POST', '/api/estoque/clientes', { nome: 'Outra', telefone: '11955554444' }, t)).status, 400, 'telefone repetido');
    // compra 1: ganha 10% = R$ 10
    r = await api('POST', '/api/estoque/vendas', { meio: 'pix', clienteId: carla.id, itens: [{ produtoId: prato.id, qtd: 2 }] }, t);
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal(r.dados.venda.cashbackGanho, 10);
    // compra 2: usa o cashback (R$ 10) e ganha 10% do que pagou (R$ 4)
    r = await api('POST', '/api/estoque/vendas', { meio: 'pix', clienteId: carla.id, usarCashback: true, itens: [{ produtoId: prato.id, qtd: 1 }] }, t);
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    const v2 = r.dados.venda;
    assert.equal(v2.cashbackUsado, 10);
    assert.equal(v2.total, 40);
    assert.equal(v2.cashbackGanho, 4);
    let ficha = (await api('GET', `/api/estoque/clientes/${carla.id}`, undefined, t)).dados;
    assert.equal(ficha.beneficio.saldo, 4);
    assert.equal(ficha.cliente.compras, 2);
    assert.equal(ficha.cliente.totalGasto, 140);
    assert.equal(ficha.preferidos[0].nome, 'Prato do dia');
    // o financeiro recebeu R$ 40 (o cashback é desconto)
    const fin = (await api('GET', '/api/financeiro', undefined, t)).dados.dados.transacoes;
    assert.ok(fin.some((x) => x.estoque && x.estoque.vendaId === v2.id && (x.value || x.valor) === 40));
    // cancelar a venda 2: o cashback usado volta e o ganho some
    await api('POST', `/api/estoque/vendas/${v2.id}/cancelar`, {}, t);
    ficha = (await api('GET', `/api/estoque/clientes/${carla.id}`, undefined, t)).dados;
    assert.equal(ficha.beneficio.saldo, 10);
    // cliente que não participa não ganha
    const semPrograma = (await api('POST', '/api/estoque/clientes', { nome: 'Davi', telefone: '11944443333', participa: false }, t)).dados.cliente;
    r = await api('POST', '/api/estoque/vendas', { meio: 'dinheiro', clienteId: semPrograma.id, itens: [{ produtoId: prato.id, qtd: 1 }] }, t);
    assert.equal(r.dados.venda.cashbackGanho, 0);
    // cliente novo direto no caixa
    r = await api('POST', '/api/estoque/vendas', { meio: 'dinheiro', clienteNovo: { nome: 'Eva', telefone: '11933332222', participa: true }, itens: [{ produtoId: prato.id, qtd: 1 }] }, t);
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.equal(r.dados.venda.cliente, 'Eva');
    assert.equal(r.dados.venda.cashbackGanho, 5);
    // cashback vencido não conta
    await pool.query("UPDATE estoque_cashback SET expira_em = '2020-01-01' WHERE cliente_id = $1", [carla.id]);
    ficha = (await api('GET', `/api/estoque/clientes/${carla.id}`, undefined, t)).dados;
    assert.equal(ficha.beneficio.saldo, 0);
    assert.ok(ficha.cashback.some((c) => c.vencido));
    let lista = (await api('GET', '/api/estoque/clientes?busca=955', undefined, t)).dados;
    assert.deepEqual(lista.clientes.map((c) => c.nome), ['Carla']);
    assert.equal(lista.emAberto.valor, 5);
    // página pública: consulta pelo telefone mostra só valores
    r = await api('POST', '/api/publico/cardapio/bistro-fiel/fidelidade', { telefone: '11933332222' });
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.deepEqual([r.dados.modelo, r.dados.participa, r.dados.saldo], ['cashback', true, 5]);
    assert.equal(r.dados.nome, undefined);
    // pedido do cardápio com cliente novo que aceitou participar e quer usar o benefício
    r = await api('POST', '/api/publico/cardapio/bistro-fiel/pedido', { nome: 'Fábio', telefone: '11922221111', tipo: 'retirada', participar: true, usarBeneficio: true, itens: [{ produtoId: prato.id, qtd: 1 }] });
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.match(r.dados.mensagem, /Quero usar meu cashback/);
    const ped = (await api('GET', '/api/estoque/pedidos', undefined, t)).dados.pedidos[0];
    assert.ok(ped.clienteId);
    assert.equal(ped.querBeneficio, true);
    r = await api('POST', `/api/estoque/pedidos/${ped.id}/vender`, {}, t);
    assert.equal(r.dados.venda.clienteId, ped.clienteId);
    assert.equal(r.dados.venda.cashbackGanho, 5);
    // cartão fidelidade: a cada 2 compras, R$ 15 de desconto
    r = await api('PUT', '/api/estoque/negocio', { fidelidade: { modelo: 'selos', selosMeta: 2, premioValor: 15, premioTexto: 'R$ 15 de desconto', selosMinimo: 30 } }, t);
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    for (let i = 0; i < 2; i++) await api('POST', '/api/estoque/vendas', { meio: 'pix', clienteId: carla.id, itens: [{ produtoId: prato.id, qtd: 1 }] }, t);
    ficha = (await api('GET', `/api/estoque/clientes/${carla.id}`, undefined, t)).dados;
    assert.deepEqual([ficha.beneficio.selos, ficha.beneficio.podePremio], [2, true]);
    // compra abaixo do mínimo não ganha selo
    const barato = (await api('POST', '/api/estoque/vendas', { meio: 'pix', clienteId: carla.id, itens: [{ nome: 'Café', qtd: 1, unit: 6 }] }, t)).dados.venda;
    assert.equal(barato.selosGanhos, 0);
    r = await api('POST', '/api/estoque/vendas', { meio: 'pix', clienteId: carla.id, usarPremio: true, itens: [{ produtoId: prato.id, qtd: 1 }] }, t);
    assert.equal(r.status, 200, JSON.stringify(r.dados));
    assert.deepEqual([r.dados.venda.premioValor, r.dados.venda.total, r.dados.venda.selosUsados, r.dados.venda.selosGanhos], [15, 35, 2, 1]);
    ficha = (await api('GET', `/api/estoque/clientes/${carla.id}`, undefined, t)).dados;
    assert.equal(ficha.beneficio.selos, 1);
    assert.equal((await api('POST', '/api/estoque/vendas', { meio: 'pix', clienteId: carla.id, usarPremio: true, itens: [{ produtoId: prato.id, qtd: 1 }] }, t)).status, 400, 'sem selos suficientes');
    // ajuste manual de selos e exclusão do cliente (vendas ficam)
    r = await api('POST', `/api/estoque/clientes/${carla.id}/ajuste`, { selos: 5 }, t);
    assert.equal(r.dados.beneficio.selos, 5);
    assert.equal((await api('DELETE', `/api/estoque/clientes/${carla.id}`, undefined, t)).status, 200);
    const vendas = (await api('GET', '/api/estoque/vendas', undefined, t)).dados.vendas;
    assert.ok(vendas.some((v) => v.cliente === 'Carla' && v.clienteId === null));
  });

  test('sair de todos os aparelhos invalida o token antigo', async () => {
    const t = contas.caio.token;
    assert.equal((await api('POST', '/api/auth/logout-all', {}, t)).status, 204);
    assert.equal((await api('GET', '/api/board', undefined, t)).status, 401);
  });
});
