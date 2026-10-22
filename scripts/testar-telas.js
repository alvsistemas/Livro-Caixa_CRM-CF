#!/usr/bin/env node
/* ================================================================
   Teste automático de telas (Playwright + API simulada)
   ================================================================
   Abre o painel num Chromium sem cabeça, serve a pasta public/ e
   responde às chamadas /api/* com dados de mentira. Confere que:
     - o painel carrega sem erro de JavaScript (inclui a divisão em
       vários arquivos de js/app/);
     - todas as páginas abrem sem estourar erro;
     - o gestor vê rodízio, metas por pessoa e remoção de membro;
     - o convite recebido (sem equipe) aparece;
     - sessão inválida (401) volta pro login, mas erro 503 não.
   Uso:  node scripts/testar-telas.js
   Precisa do pacote "playwright" e do Chromium (variáveis opcionais:
   PLAYWRIGHT_PATH, CHROMIUM_PATH).
================================================================ */
const fs = require('fs');
const path = require('path');
const http = require('http');

function carregarPlaywright() {
  const candidatos = [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node-tools/node_modules/playwright', '/home/claude/.npm-global/lib/node_modules/playwright'].filter(Boolean);
  for (const c of candidatos) { try { return require(c); } catch (_) { /* tenta o próximo */ } }
  console.log('⚠ Playwright não encontrado — teste de telas pulado.');
  process.exit(0);
}
const { chromium } = carregarPlaywright();
const PUBLIC = path.join(__dirname, '..', 'public');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function servidor() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const arq = path.join(PUBLIC, rel === '/' ? 'index.html' : rel);
      if (!arq.startsWith(PUBLIC) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end('nao'); }
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream' });
      fs.createReadStream(arq).pipe(res);
    }).listen(0, () => ok({ s, url: `http://127.0.0.1:${s.address().port}` }));
  });
}

const mes = new Date().toISOString().slice(0, 7);
const colunas = [
  { id: 'c1', nome: 'Novos', tipo: 'aberto', ordem: 0, cor: '#888' },
  { id: 'c2', nome: 'Ganho', tipo: 'ganho', ordem: 1, cor: '#2a2' },
  { id: 'c3', nome: 'Perdido', tipo: 'perdido', ordem: 2, cor: '#a22' },
];
const cards = [
  { id: 'k1', columnId: 'c1', cliente: 'Maria Teste', telefone: '15988053447', valor: 50000, temperatura: 'morno', mes: '', mesInicioContato: mes, ordem: 0 },
  { id: 'k2', columnId: 'c2', cliente: 'João Ganho', telefone: '15911112222', valor: 80000, temperatura: 'quente', mes, mesInicioContato: mes, ordem: 0 },
];

function respostas(cenario) {
  const equipeGestor = {
    id: 'eq1', nome: 'Equipe Teste', codigoConvite: 'ABC123', souSupervisor: true, souSupervisorDeDados: false,
    membros: [
      { id: 'u1', nome: 'Gestor Teste', email: 'g@x.com', papel: 'supervisor', souEu: true },
      { id: 'u2', nome: 'Ana Vendas', email: 'ana@x.com', papel: 'membro', souEu: false },
    ],
    rodizio: { ativo: false, membros: [] },
    convitesPendentes: [{ id: 'cv1', email: 'novo@x.com' }],
  };
  const semEquipe = { equipe: null, convitesRecebidos: [{ id: 'cv9', equipeNome: 'Equipe X', convidadoPor: 'Chefe' }] };
  return {
    'GET /api/auth/me': { user: { id: 'u1', nome: 'Gestor Teste', email: 'g@x.com', perfil: cenario === 'rh' ? 'rh' : 'consorcio' } },
    'GET /api/board': { columns: colunas, cards },
    'GET /api/funis': { funis: [] },
    'GET /api/tasks': { tasks: [] },
    'GET /api/calendar/status': { connected: false },
    'GET /api/equipe': cenario === 'semEquipe' ? semEquipe : { equipe: cenario === 'membro' ? { ...equipeGestor, souSupervisor: false, rodizio: null, convitesPendentes: [], codigoConvite: null } : equipeGestor, convitesRecebidos: [] },
    'GET /api/equipe/supervisao': { mes, membros: [
      { userId: 'u1', nome: 'Gestor Teste', papel: 'supervisor', totalLeads: 2, ganhoValor: 80000, perdidoValor: 0, abertoValor: 50000, vendidoNoMes: 80000, metaMes: 0 },
      { userId: 'u2', nome: 'Ana Vendas', papel: 'membro', totalLeads: 5, ganhoValor: 30000, perdidoValor: 1000, abertoValor: 9000, vendidoNoMes: 30000, metaMes: 60000 },
    ] },
    'GET /api/equipe/membro/u2/leads': { total: 5 },
    'GET /api/possiveis-leads': { leads: [{ id: 'p1', nome: 'Pedro', telefone: '1511', tipoServico: 'auto' }, { id: 'p2', nome: 'Paula', telefone: '1522', tipoServico: '' }] },
    'GET /api/resumo-diario': { ativo: false, emailDisponivel: true, email: 'g@x.com' },
    'GET /api/tasks/config/email': { ativo: true, emailDisponivel: true, email: 'g@x.com' },
    'GET /api/backup/automatico': { disponivel: true, ativo: false, ultimoEnvio: null, email: 'g@x.com' },
    'GET /api/whatsapp/status': { connected: false, provedor: 'meta' },
    'GET /api/metas/': { valorMeta: 0 },
    'GET /api/equipe/meta-vendas/': { valorMeta: 100000, vendidoNoMes: 80000, souGestor: true },
  };
}

let falhas = 0, total = 0;
function checar(nome, cond, detalhe) {
  total++;
  if (cond) console.log('  ✔', nome);
  else { falhas++; console.log('  ✘', nome, detalhe ? `— ${detalhe}` : ''); }
}

async function abrir(browser, url, cenario, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const erros = [];
  const chamadas = [];
  page.on('pageerror', (e) => erros.push(e.message + ' @ ' + String(e.stack || '').split('\n').slice(1, 3).join(' ').trim()));
  if (extra.perfil) await page.addInitScript((p) => { window.__perfilTeste = p; }, extra.perfil);
  await page.addInitScript(() => { if (sessionStorage.getItem('semeado')) return; sessionStorage.setItem('semeado', '1'); localStorage.setItem('token', 'tok'); localStorage.setItem('user', JSON.stringify({ nome: 'Gestor Teste', email: 'g@x.com', perfil: window.__perfilTeste || 'consorcio' })); });
  const mapa = respostas(cenario);
  // a biblioteca de planilhas vem de um CDN; no teste entra uma versão mínima
  await page.route('**/xlsx.full.min.js', (route) => route.fulfill({ contentType: 'text/javascript', body: "window.XLSX={read:()=>({SheetNames:['A'],Sheets:{A:1}}),utils:{sheet_to_json:()=>[{Nome:'Ana',Telefone:'1511',Serviço:'imóvel'},{Nome:'Beto',Telefone:'1522',Serviço:'auto'}],aoa_to_sheet:()=>({}),book_new:()=>({}),book_append_sheet:()=>{}},writeFile:(wb,n)=>{window.__baixou=n;}};" }));
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const chave = `${req.method()} ${u.pathname}`;
    chamadas.push({ metodo: req.method(), caminho: u.pathname, corpo: req.postData() });
    if (extra.interceptar) { const r = extra.interceptar(req.method(), u.pathname); if (r) return route.fulfill(r); }
    let corpo = mapa[chave];
    if (corpo === undefined) { const k = Object.keys(mapa).find((x) => x.endsWith('/') && chave.startsWith(x)); if (k) corpo = mapa[k]; }
    if (req.method() === 'PUT' && /meta-vendas$/.test(u.pathname)) corpo = { mes, valorMeta: JSON.parse(req.postData() || '{}').valorMeta };
    if (req.method() === 'PUT' && /\/equipe\/rodizio$/.test(u.pathname)) corpo = JSON.parse(req.postData() || '{}');
    if (corpo === undefined) {
      // resposta genérica: toda lista que o painel espera vem vazia
      corpo = {};
      for (const k of ['anexos', 'automacoes', 'blocos', 'campos', 'contratos', 'conversas', 'erros', 'eventos', 'eventosGoogle', 'fluxos', 'funis', 'insights', 'itens', 'leads', 'membros', 'mensagens', 'regras', 'tarefas', 'tasks', 'templates', 'webhooks', 'agendamentos', 'possiveisLeads']) corpo[k] = [];
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
  });
  await page.goto(url + '/index.html');
  await page.waitForTimeout(700);
  return { ctx, page, erros, chamadas };
}

(async () => {
  const { s, url } = await servidor();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  try {
    console.log('Painel carrega e todas as páginas abrem');
    let t = await abrir(browser, url, 'gestor');
    checar('carregou sem erro de JavaScript', t.erros.length === 0, t.erros[0]);
    checar('menu lateral apareceu', (await t.page.locator('[data-action="nav"]').count()) > 3);
    const paginas = await t.page.$$eval('[data-action="nav"]', (els) => els.map((e) => e.dataset.page));
    for (const pg of paginas) {
      await t.page.click(`[data-action="nav"][data-page="${pg}"]`);
      await t.page.waitForTimeout(250);
      checar(`página "${pg}" abre sem erro`, t.erros.length === 0, t.erros[t.erros.length - 1]);
    }

    console.log('Gestor: rodízio, metas e remoção de membro');
    await t.page.click('[data-action="nav"][data-page="equipe"]').catch(() => {});
    await t.page.waitForTimeout(300);
    await t.page.click('[data-action="set-equipe-subtab"][data-subtab="supervisao"]').catch(() => {});
    await t.page.waitForTimeout(500);
    const temEquipe = await t.page.locator('#rodizio-ativo').count();
    checar('seção de rodízio aparece na página Equipe', temEquipe === 1);
    if (temEquipe) {
      await t.page.check('#rodizio-ativo');
      await t.page.check('.rodizio-membro >> nth=1');
      await t.page.click('[data-action="salvar-rodizio"]');
      await t.page.waitForTimeout(300);
      const put = t.chamadas.find((c) => c.metodo === 'PUT' && c.caminho === '/api/equipe/rodizio');
      checar('salvar rodízio envia ativo + membro escolhido', !!put && JSON.parse(put.corpo).ativo === true && JSON.parse(put.corpo).membros.includes('u2'), put && put.corpo);
    }
    checar('tabela mostra coluna "Meta do mês"', (await t.page.locator('th', { hasText: 'Meta do mês' }).count()) >= 1);
    const defMeta = t.page.locator('[data-action="definir-meta-membro"]').first();
    if (await defMeta.count()) {
      await defMeta.click();
      checar('modal de meta abre', (await t.page.locator('#meta-membro-valor').count()) === 1);
      await t.page.fill('#meta-membro-valor', '45000');
      await t.page.click('#meta-membro-salvar');
      await t.page.waitForTimeout(300);
      const putMeta = t.chamadas.find((c) => c.metodo === 'PUT' && /\/equipe\/membro\/.+\/meta-vendas$/.test(c.caminho));
      checar('salvar meta envia o valor digitado', !!putMeta && JSON.parse(putMeta.corpo).valorMeta === 45000, putMeta && putMeta.corpo);
      checar('modal de meta fecha', (await t.page.locator('#meta-membro-valor').count()) === 0);
    } else checar('botão Definir meta existe', false);
    const rem = t.page.locator('[data-action="remover-membro"]').first();
    if (await rem.count()) {
      await rem.click();
      await t.page.waitForTimeout(400);
      checar('janela de remover membro abre (manter / passar leads)', (await t.page.locator('#rm-destino').count()) >= 1 || (await t.page.locator('input[type=radio]').count()) >= 2);
    } else checar('botão Remover existe', false);
    checar('sem erro de JavaScript na página Equipe', t.erros.length === 0, t.erros[t.erros.length - 1]);

    console.log('Importar/Exportar: possíveis leads em lote');
    await t.page.evaluate(() => { document.getElementById('modal-root').innerHTML = ''; });
    await t.page.click('[data-action="nav"][data-page="import-export"]');
    await t.page.waitForTimeout(500);
    checar('gestor vê "Passar todos para Leads"', (await t.page.locator('[data-action="possiveis-passar-todos"]').count()) === 1);
    checar('gestor escolhe o destino (Para mim / pessoa)', (await t.page.locator('#possiveis-destino').count()) === 1);
    await t.page.check('[data-action="possiveis-select-um"] >> nth=0');
    await t.page.waitForTimeout(150);
    checar('selecionar habilita "Passar selecionados (1)"', (await t.page.locator('[data-action="possiveis-passar-selecionados"]').innerText()).includes('(1)'));
    await t.page.selectOption('#possiveis-destino', 'u2');
    await t.page.click('[data-action="possiveis-passar-selecionados"]');
    await t.page.waitForTimeout(400);
    const lote = t.chamadas.find((c) => c.caminho === '/api/possiveis-leads/promover-lote');
    checar('envia ids selecionados e a pessoa escolhida', !!lote && JSON.parse(lote.corpo).ids.length === 1 && JSON.parse(lote.corpo).atribuirParaId === 'u2', lote && lote.corpo);
    console.log('Configurações: aba E-mail em Integrações');
    await t.page.click('[data-action="nav"][data-page="configuracoes"]');
    await t.page.waitForTimeout(300);
    await t.page.click('[data-action="set-config-categoria"][data-categoria="email"]');
    await t.page.waitForTimeout(700);
    checar('aba "E-mail" existe no grupo Integrações', (await t.page.locator('[data-action="set-config-categoria"][data-categoria="email"]').count()) === 1);
    checar('aba E-mail traz resumo diário, tarefas e backup por e-mail', (await t.page.locator('[data-action="resumo-diario-alternar"]').count()) === 1 && (await t.page.locator('[data-action="email-tarefas-alternar"]').count()) === 1 && (await t.page.locator('[data-action="backup-auto-alternar"]').count()) === 1);
    await t.page.click('[data-action="resumo-diario-alternar"]');
    await t.page.waitForTimeout(300);
    checar('ligar resumo diário chama a API', t.chamadas.some((c) => c.metodo === 'PUT' && c.caminho === '/api/resumo-diario'));
    await t.page.click('[data-action="set-config-categoria"][data-categoria="manutencao"]');
    await t.page.waitForTimeout(300);
    checar('Manutenção não tem mais os blocos de e-mail', (await t.page.locator('[data-action="resumo-diario-alternar"]').count()) === 0 && (await t.page.locator('[data-action="backup-auto-alternar"]').count()) === 0);
    await t.page.evaluate(() => { document.getElementById('modal-root').innerHTML = ''; });
    await t.page.click('[data-action="nav"][data-page="import-export"]');
    await t.page.waitForTimeout(400);
    console.log('Importar planilha: painel desce, X faz subir e volta ao original');
    checar('botão "Baixar planilha modelo" fica no canto direito', await t.page.evaluate(() => { const b = document.querySelector('.import-modelo').getBoundingClientRect(); const e = document.querySelector('[data-action="escolher-planilha"]').getBoundingClientRect(); return b.left > e.right + 200; }));
    await t.page.click('[data-action="baixar-modelo-planilha"]');
    checar('baixar modelo gera o arquivo .xlsx', (await t.page.evaluate(() => window.__baixou)) === 'planilha-modelo-leads.xlsx');
    await t.page.setInputFiles('#planilha-input', { name: 'contatos.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
    await t.page.waitForSelector('.import-painel');
    const altIni = await t.page.evaluate(() => document.querySelector('.import-painel').getBoundingClientRect().height);
    await t.page.waitForTimeout(600);
    const altFim = await t.page.evaluate(() => document.querySelector('.import-painel').getBoundingClientRect().height);
    checar('painel da planilha desce (altura cresce com animação)', altFim > 150 && altIni < altFim, `${altIni} -> ${altFim}`);
    checar('nome do arquivo e X aparecem', (await t.page.locator('.import-nome').innerText()) === 'contatos.xlsx' && (await t.page.locator('[data-action="fechar-planilha"]').count()) === 1);
    checar('prévia mostra as linhas da planilha', (await t.page.locator('.import-previa tbody tr').count()) === 2);
    await t.page.click('[data-action="fechar-planilha"]');
    await t.page.waitForTimeout(120);
    const altMeio = await t.page.evaluate(() => (document.querySelector('.import-painel') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height);
    checar('ao clicar no X o painel começa a subir', altMeio < altFim, `${altMeio} < ${altFim}`);
    await t.page.waitForTimeout(600);
    checar('página volta ao estado original', (await t.page.locator('.import-painel').count()) === 0 && (await t.page.locator('.import-arquivo').innerText()).includes('Nenhum arquivo escolhido'));
    await t.page.screenshot({ path: '/tmp/import-final.png' });
    console.log('Leads: gestor passa em lote e exclui; membro não exclui');
    await t.page.click('[data-action="nav"][data-page="leads"]');
    await t.page.waitForTimeout(300);
    await t.page.click('[data-action="leads-select-um"] >> nth=0');
    await t.page.waitForTimeout(150);
    checar('gestor tem "Passar para…" e Excluir na barra', (await t.page.locator('#leads-bulk-gestor-destino').count()) === 1 && (await t.page.locator('[data-action="leads-bulk-excluir"]').count()) === 1);
    await t.ctx.close();
    t = await abrir(browser, url, 'membro');
    await t.page.click('[data-action="nav"][data-page="leads"]');
    await t.page.waitForTimeout(400);
    await t.page.click('[data-action="leads-select-um"] >> nth=0');
    await t.page.waitForTimeout(150);
    checar('membro de equipe NÃO vê Excluir nem Passar para…', (await t.page.locator('[data-action="leads-bulk-excluir"]').count()) === 0 && (await t.page.locator('#leads-bulk-gestor-destino').count()) === 0);
    checar('membro ainda vê Arquivar', (await t.page.locator('[data-action="leads-bulk-arquivar"]').count()) === 1);
    checar('sem erro de JavaScript (membro)', t.erros.length === 0, t.erros[0]);
    await t.ctx.close();

    console.log('Versão administrativa (/adm): vocabulário de recrutamento');
    t = await abrir(browser, url, 'rh', { perfil: 'rh' });
    const nav = await t.page.locator('.sidebar-nav').innerText();
    checar('menu fala "Candidatos" e "Processo seletivo"', /Candidatos/.test(nav) && /Processo seletivo/.test(nav), nav.replace(/\n/g, ' | '));
    checar('menu não tem Comissões nem "Leads"', !/Comiss/.test(nav) && !/\bLeads\b/.test(nav), nav.replace(/\n/g, ' | '));
    await t.page.click('[data-action="nav"][data-page="dashboard"]');
    await t.page.waitForTimeout(400);
    const dash = await t.page.locator('main, .main-area').first().innerText();
    checar('dashboard sem meta de vendas e sem "leads"', !/Meta de vendas/.test(dash) && !/\bNovos leads\b/.test(dash), dash.slice(0, 200).replace(/\n/g, ' | '));
    await t.page.click('[data-action="nav"][data-page="leads"]');
    await t.page.waitForTimeout(400);
    await t.page.click('[data-action="add-lead"], .btn-primary >> nth=0').catch(() => {});
    checar('sem erro de JavaScript (rh)', t.erros.length === 0, t.erros[0]);
    await t.ctx.close();

    console.log('Sem equipe: convite recebido');
    t = await abrir(browser, url, 'semEquipe');
    await t.page.click('[data-action="nav"][data-page="equipe"]').catch(() => {});
    await t.page.waitForTimeout(400);
    checar('convite recebido aparece com aceitar/recusar', (await t.page.locator('[data-action="aceitar-convite-equipe"]').count()) === 1 && (await t.page.locator('[data-action="recusar-convite-equipe"]').count()) === 1);
    checar('sem erro de JavaScript', t.erros.length === 0, t.erros[0]);
    await t.ctx.close();

    console.log('Sessão: 401 volta pro login, 503 não');
    t = await abrir(browser, url, 'gestor', { interceptar: (m, p) => p === '/api/board' ? { status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Sessão inválida.', codigo: 'sessao_invalida' }) } : null });
    await t.page.waitForTimeout(1500);
    checar('401 com sessao_invalida vai para o login', /login\.html/.test(t.page.url()), t.page.url());
    await t.ctx.close();
    t = await abrir(browser, url, 'gestor', { interceptar: (m, p) => p === '/api/board' ? { status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'O servidor está acordando.' }) } : null });
    await t.page.waitForTimeout(8000);
    checar('503 NÃO derruba a sessão', /index\.html/.test(t.page.url()), t.page.url());
    await t.ctx.close();
  } catch (e) {
    falhas++; console.log('  ✘ erro inesperado no teste:', e.message);
  } finally {
    await browser.close(); s.close();
  }
  console.log(falhas ? `\n✘ ${falhas} de ${total} checagens falharam.` : `\n✔ ${total}/${total} checagens de tela passaram.`);
  process.exit(falhas ? 1 : 0);
})();
