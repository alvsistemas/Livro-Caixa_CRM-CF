// CRM · 09-shell.js — barra lateral, barra de baixo e moldura das páginas. Os arquivos js/crm/ são carregados em ordem pelo index.html e
// compartilham as mesmas variáveis globais (é o antigo script.js dividido, como no CRM de consórcio).
/* ---------- render: shell (barra lateral + página atual) ---------- */
// Redesenha a página igual renderApp(), mas guarda e restaura a posição de rolagem
// antes/depois — usado em ações do Pipeline (mover card) que não deveriam "resetar"
// a visão de quem já rolou a tela pra ver um cliente lá embaixo.
function renderAppPreservandoScroll(){
  const mainEl = document.querySelector('main.pipeline-main');
  const scrollHorizontal = mainEl ? mainEl.scrollLeft : null;
  const scrollsColunas = {};
  document.querySelectorAll('.cards[data-col-id]').forEach(el=>{
    scrollsColunas[el.dataset.colId] = el.scrollTop;
  });

  renderApp();

  const mainEl2 = document.querySelector('main.pipeline-main');
  if(mainEl2 && scrollHorizontal!==null) mainEl2.scrollLeft = scrollHorizontal;
  document.querySelectorAll('.cards[data-col-id]').forEach(el=>{
    if(scrollsColunas[el.dataset.colId]!==undefined) el.scrollTop = scrollsColunas[el.dataset.colId];
  });
}

function renderApp(){
  if(window.AssistenteIA && loaded) AssistenteIA.atualizarAlertas();
  const app = document.getElementById('app');
  if(!loaded){ app.innerHTML = '<div class="loading">Carregando painel…</div>'; return; }

  let pageHtml = '';
  // páginas que saíram com a integração do WhatsApp/Instagram: volta pro Dashboard
  if(['conversas', 'disparos', 'agendamentos'].includes(currentPage)) currentPage = 'dashboard';
  // aba que o gestor da equipe não liberou: vai pro Pipeline
  if(typeof paginaBloqueada === 'function' && currentPage !== 'pipeline' && paginaBloqueada(currentPage)) currentPage = 'pipeline';
  if(currentPage === 'dashboard') pageHtml = renderDashboardPage();
  else if(currentPage === 'pipeline') pageHtml = renderPipelinePage();
  else if(currentPage === 'leads') pageHtml = renderLeadsPage();
  else if(currentPage === 'comissoes') pageHtml = renderComissoesPage();
  else if(currentPage === 'relatorios') pageHtml = renderRelatoriosPage();
  else if(currentPage === 'automacoes') pageHtml = renderAutomacoesPage();
  else if(currentPage === 'fluxos') pageHtml = renderFluxosPage();
  else if(currentPage === 'import-export') pageHtml = renderImportExportPage();
  else if(currentPage === 'configuracoes') pageHtml = renderConfiguracoesPage();
  else if(currentPage === 'suporte') pageHtml = renderSuportePage();
  else if(currentPage === 'equipe') pageHtml = renderEquipePage();
  else if(currentPage === 'tarefas') pageHtml = renderTarefasPage();

  const notificacoes = computarNotificacoes();

  app.innerHTML = `
    <div class="app-shell ${sidebarOpen ? 'sidebar-open' : ''}">
      ${renderSidebar()}
      <div class="sidebar-backdrop" data-action="close-sidebar"></div>
      <div class="main-area ${currentPage==='pipeline' ? 'main-area-pipeline' : ''}">
        <div class="main-topbar">
          <button class="hamburger-btn" data-action="toggle-sidebar" title="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div class="topbar-right">
            <button class="notif-btn" data-action="abrir-busca-global" title="Buscar (Ctrl+K)">
              ${ICON_BUSCA}
            </button>
            <div class="notif-wrap">
              <button class="notif-btn" data-action="toggle-notif" title="Notificações">
                ${ICON_BELL}
                ${notificacoes.length ? `<span class="notif-badge">${notificacoes.length > 9 ? '9+' : notificacoes.length}</span>` : ''}
              </button>
              ${notifOpen ? `
                <div class="notif-panel">
                <div class="notif-panel-title">Notificações</div>
                ${notificacoes.length ? notificacoes.slice(0,8).map(n=>`
                  <div class="notif-item" ${n.cardId ? `data-action="open-edit-card" data-card-id="${n.cardId}"` : ''}>
                    <p>${esc(n.texto)}</p>
                    <span>${formatDateHora(n.timestamp)}</span>
                  </div>
                `).join('') : '<p class="settings-page-note" style="padding:12px;">Nenhuma notificação por enquanto.</p>'}
              </div>
            ` : ''}
          </div>
          </div>
        </div>
        ${erroParaMostrar() ? `<div class="error-banner" data-action="dismiss-error" title="Clique para fechar">⚠ ${esc(errorMsg)}</div>` : ''}
        ${renderFaixaTeste()}
        ${atuandoComo ? `
          <div class="atuando-banner" role="status">
            <span>🛠 Você está no funil de <b>${esc(atuandoComo.nome)}</b> — o que você criar, editar, excluir ou mover aqui vale para o funil dele e fica registrado.</span>
            <button type="button" class="btn-outline" data-action="sair-funil-de">Sair do funil</button>
          </div>` : ''}
        <div class="pagina-anim" data-anim-troca="${currentPage}|${currentPage==='equipe' ? equipeTela : ''}">${pageHtml}</div>
      </div>
    </div>
  `;

  bindAppEvents();
}

const NAV_PADRAO = [
  ['dashboard', 'Visão geral', ICON_DASHBOARD],
  ['pipeline', 'Negociações', ICON_PIPELINE],
  ['leads', 'Contatos', ICON_LEADS],
  ['tarefas', 'Agenda/Tarefas', ICON_TASKS],
  ['comissoes', 'Comissões', ICON_COMISSOES],
  ['relatorios', 'Relatórios', ICON_RELATORIOS],
  ['automacoes', 'Ações automáticas', ICON_AUTOMACOES],
  ['fluxos', 'Sequências', ICON_FLUXOS],
  ['import-export', 'Importar/Exportar', ICON_IMPORT_EXPORT],
  ['equipe', 'Equipe', ICON_CHAT_INTERNO],
];
// As do dia a dia ficam sempre à mostra; as outras ficam no grupo "Mais" (abre e fecha)
const NAV_PRINCIPAIS = ['dashboard', 'pipeline', 'leads', 'tarefas', 'comissoes'];
const ICON_MAIS = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>';
// abre com as abas descendo uma a uma; fecha subindo rapidinho
function animarGrupoMais(grupo, abrir){
  clearTimeout(grupo._t);
  grupo.classList.remove('animar', 'fechando');
  if(abrir){ grupo.classList.add('aberto'); void grupo.offsetWidth; grupo.classList.add('animar'); grupo._t = setTimeout(()=> grupo.classList.remove('animar'), 700); }
  else { grupo.classList.add('fechando'); grupo._t = setTimeout(()=> grupo.classList.remove('aberto', 'fechando'), 170); }
}
// recursos do plano (o Essencial não tem ações automáticas, sequências nem criar equipe)
function temRecurso(r){ const rec = assinaturaInfo && assinaturaInfo.recursos; return !rec || rec[r] !== false; }
function avisoPlanoCompleto(titulo, texto){
  return `<div class="plano-completo-aviso"><span class="selo-completo">Plano Completo</span><b>${esc(titulo)}</b><p>${esc(texto)} O que você já criou fica guardado e volta a funcionar quando mudar de plano.</p><a class="btn-primary" href="assinatura.html?de=crm">Ver planos</a></div>`;
}
function navMaisAberto(){
  if(NAV_PADRAO.some(([k])=> k===currentPage && !NAV_PRINCIPAIS.includes(k))) return true; // está numa aba de "Mais"
  try{ return localStorage.getItem('navMais') === '1'; }catch(e){ return false; }
}
function getOrdemNavSalva(){
  try{ return JSON.parse(localStorage.getItem('navOrdem') || 'null'); }catch(e){ return null; }
}
// Devolve o NAV na ordem escolhida pelo usuário — se ele nunca reordenou, ou se um
// item novo foi adicionado depois (ex: uma página nova), cai no padrão / vai pro fim.
function getNavOrdenado(){
  const ordemSalva = getOrdemNavSalva();
  if(!ordemSalva || !ordemSalva.length) return NAV_PADRAO;
  const porChave = Object.fromEntries(NAV_PADRAO.map(item=>[item[0], item]));
  const resultado = ordemSalva.map(chave=>porChave[chave]).filter(Boolean);
  NAV_PADRAO.forEach(item=>{ if(!ordemSalva.includes(item[0])) resultado.push(item); });
  return resultado;
}
let reordenarNavAberto = false;
let reordenarNavOrdemTemp = null;

function abrirReordenarNav(){
  reordenarNavOrdemTemp = getNavOrdenado().map(item=>item[0]);
  reordenarNavAberto = true;
  renderReordenarNavModal();
}
function closeReordenarNavModal(){
  reordenarNavAberto = false;
  reordenarNavOrdemTemp = null;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
function moverItemNavOrdem(chave, direcao){
  const idx = reordenarNavOrdemTemp.indexOf(chave);
  const novoIdx = idx + direcao;
  if(idx===-1 || novoIdx < 0 || novoIdx >= reordenarNavOrdemTemp.length) return;
  [reordenarNavOrdemTemp[idx], reordenarNavOrdemTemp[novoIdx]] = [reordenarNavOrdemTemp[novoIdx], reordenarNavOrdemTemp[idx]];
  renderReordenarNavModal();
}
function salvarOrdemNav(){
  localStorage.setItem('navOrdem', JSON.stringify(reordenarNavOrdemTemp));
  closeReordenarNavModal();
  renderApp();
}
function restaurarOrdemNavPadrao(){
  localStorage.removeItem('navOrdem');
  closeReordenarNavModal();
  renderApp();
}
function renderReordenarNavModal(){
  const root = document.getElementById('modal-root');
  if(!reordenarNavAberto){ root.innerHTML=''; return; }
  const porChave = Object.fromEntries(NAV_PADRAO.map(item=>[item[0], item]));
  root.innerHTML = `
    <div class="overlay" id="reordenar-nav-overlay">
      <div class="modal reordenar-nav-modal">
        <div class="modal-head">
          <h3>Reordenar abas</h3>
          <button id="reordenar-nav-close">✕</button>
        </div>
        <div class="modal-body">
          <p class="settings-page-note" style="margin-bottom:12px;">Use as setinhas pra mudar a ordem que as abas aparecem no menu. As do grupo “Mais” continuam dentro dele.</p>
          <div class="reordenar-nav-lista">
            ${reordenarNavOrdemTemp.map((chave, idx)=>{
              const item = porChave[chave];
              if(!item) return '';
              const [key, label, icon] = item;
              return `
                <div class="reordenar-nav-item">
                  ${icon}
                  <span>${esc(label)}</span>
                  <div class="reordenar-nav-setas">
                    <button class="icon-btn" data-mover="${key}" data-dir="-1" ${idx===0?'disabled':''} title="Mover pra cima">↑</button>
                    <button class="icon-btn" data-mover="${key}" data-dir="1" ${idx===reordenarNavOrdemTemp.length-1?'disabled':''} title="Mover pra baixo">↓</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        <div class="modal-foot">
          <button class="delete-link" id="reordenar-nav-restaurar">Restaurar padrão</button>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="reordenar-nav-cancelar">Cancelar</button>
            <button class="btn-save" id="reordenar-nav-salvar">Salvar ordem</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('reordenar-nav-close').addEventListener('click', closeReordenarNavModal);
  document.getElementById('reordenar-nav-cancelar').addEventListener('click', closeReordenarNavModal);
  document.getElementById('reordenar-nav-overlay').addEventListener('click', (e)=>{ if(e.target.id==='reordenar-nav-overlay') closeReordenarNavModal(); });
  document.getElementById('reordenar-nav-salvar').addEventListener('click', salvarOrdemNav);
  document.getElementById('reordenar-nav-restaurar').addEventListener('click', restaurarOrdemNavPadrao);
  root.querySelectorAll('[data-mover]').forEach(btn=>{
    btn.addEventListener('click', ()=> moverItemNavOrdem(btn.dataset.mover, parseInt(btn.dataset.dir,10)));
  });
}

// Ícone do botão "Trocar de aplicativo" (CRM ⇄ Controle financeiro)
const ICON_TROCAR_APP = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
// etapa visível no celular (uma por vez): a escolhida, ou a primeira do funil
function etapaAtivaMobile(columnsDoFunil){
  if(pipelineEtapaMobileId && columnsDoFunil.some(c=>c.id===pipelineEtapaMobileId)) return pipelineEtapaMobileId;
  return columnsDoFunil.length ? columnsDoFunil[0].id : null;
}
// Troca a etapa aberta no celular. Durante o arrasto, só mexe nas classes (sem redesenhar a
// tela), pra não perder o cliente que está na mão.
function trocarEtapaMobile(colId, durante){
  pipelineEtapaMobileId = colId;
  if(!durante){ renderApp(); return; }
  document.querySelectorAll('.column').forEach(c=> c.classList.toggle('col-ativa-mobile', c.dataset.colId === colId));
  const boardEl = document.querySelector('.board[data-anim-grupo="etapa"]');
  if(boardEl) boardEl.dataset.animTroca = `${funilAtualId}|${colId}`;
  if(window.Animar) Animar.marcar('etapa', `${funilAtualId}|${colId}`, [...document.querySelectorAll('.column')].findIndex(c=> c.dataset.colId === colId));
  document.querySelectorAll('.etapa-chip-mobile').forEach(c=>{
    const ativo = c.dataset.colId === colId;
    c.classList.toggle('active', ativo);
    c.setAttribute('aria-selected', ativo ? 'true' : 'false');
    // sem rolar a fileira aqui: o dedo está em cima do chip e ele não pode fugir debaixo do dedo
  });
}
// arrastando um cliente no celular: parado ~0,4 s em cima do chip de outra etapa, abre aquela etapa
let chipHoverTimer = null;
function verificarChipDeEtapaSobDedo(x, y){
  if(!cardTouchDrag || !ehCelular()) return;
  const sob = document.elementFromPoint(x, y);
  const chip = sob && sob.closest ? sob.closest('#etapas-chips-mobile .etapa-chip-mobile') : null;
  document.querySelectorAll('.etapa-chip-mobile.etapa-chip-alvo').forEach(c=>{ if(c!==chip) c.classList.remove('etapa-chip-alvo'); });
  const id = chip ? chip.dataset.colId : null;
  if(id === cardTouchDrag.chipHover) return;
  clearTimeout(chipHoverTimer);
  cardTouchDrag.chipHover = id;
  if(!chip) return;
  chip.classList.add('etapa-chip-alvo');
  chipHoverTimer = setTimeout(()=>{
    if(cardTouchDrag && cardTouchDrag.chipHover === id){
      trocarEtapaMobile(id, true);
      if(navigator.vibrate) navigator.vibrate(10);
    }
  }, 400);
}

function renderSidebar(){
  const NAV = getNavOrdenado().filter(([key])=> !atuandoComo || PAGINAS_ATUANDO_COMO.includes(key));
  return `
    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="sidebar-avatar">${currentUser && currentUser.avatarUrl ? `<img src="${currentUser.avatarUrl}" alt="" />` : esc(iniciaisDoNome((currentUser&&currentUser.nome)||''))}</span>
        <span class="sidebar-greeting">Olá, <span class="sidebar-brand-name">${esc((currentUser && currentUser.nome) || 'visitante')}</span></span>
      </div>
      <nav class="sidebar-nav">
        ${NAV.filter(([key])=> NAV_PRINCIPAIS.includes(key)).map(([key,label,icon])=>`
          <button class="nav-item ${currentPage===key?'active':''}" data-action="nav" data-page="${key}">${icon}<span>${label}</span></button>
        `).join('')}
        <div class="nav-mais ${navMaisAberto()?'aberto':''}">
          <button type="button" class="nav-item nav-mais-btn" data-action="nav-mais" aria-expanded="${navMaisAberto()}">${ICON_MAIS}<span>Mais</span><span class="nav-mais-seta" aria-hidden="true">▾</span></button>
          <div class="nav-mais-lista">
            ${NAV.filter(([key])=> !NAV_PRINCIPAIS.includes(key)).map(([key,label,icon])=>`
              <button class="nav-item ${currentPage===key?'active':''}" data-action="nav" data-page="${key}">${icon}<span>${label}</span>${(key==='automacoes'||key==='fluxos') && !temRecurso('automacoes') ? '<span class="selo-completo mini">Completo</span>' : ''}</button>
            `).join('')}
          </div>
        </div>
      </nav>
      <div class="nav-reordenar-wrap">
        <button class="nav-item nav-reordenar-btn" data-action="abrir-reordenar-nav" title="Mudar a ordem das abas">${ICON_REORDER}<span>Reordenar abas</span></button>
      </div>
      <div class="sidebar-footer">
        <a class="nav-item trocar-app-item" href="/" title="Abrir o Controle financeiro ou voltar para a escolha de aplicativo">${ICON_TROCAR_APP}<span>Trocar de aplicativo</span></a>
        ${atuandoComo ? '' : `<button class="nav-item ${currentPage==='suporte'?'active':''}" data-action="nav" data-page="suporte">${ICON_SUPORTE}<span>Suporte</span></button>
        <button class="nav-item ${currentPage==='configuracoes'?'active':''}" data-action="nav" data-page="configuracoes">${ICON_SETTINGS}<span>Configurações</span></button>`}
        <button class="nav-item logout-item" data-action="logout">${ICON_LOGOUT}<span>Sair</span></button>
      </div>
    </aside>
  `;
}
