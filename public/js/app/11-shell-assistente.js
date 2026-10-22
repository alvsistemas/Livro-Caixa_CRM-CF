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
/* ---------- Assistente flutuante (bolinha de ajuda) ---------- */
function renderAssistente(){
  const root = document.getElementById('assistente-root');
  if(!root) return;
  if(!getToken()){ root.innerHTML=''; return; } // só aparece logado
  if(!integracoesConfig.assistenteIA){ root.innerHTML=''; return; } // servidor sem ANTHROPIC_API_KEY configurada

  const posBolha = assistenteBolhaX!=null ? `left:${assistenteBolhaX}px; top:${assistenteBolhaY}px; right:auto; bottom:auto;` : '';

  root.innerHTML = `
    <button id="assistente-bolha" class="assistente-bolha" style="${posBolha}" title="${esc(assistenteNome)}">${assistenteAberto ? '✕' : '💬'}</button>
    ${assistenteAberto ? `
      <div class="assistente-painel${assistenteAnimando ? ' '+assistenteAnimando : ''}" id="assistente-painel">
        <div class="assistente-painel-head">
          ${assistenteEditandoNome
            ? `<span class="assistente-nome-edit">✨ <input type="text" id="assistente-nome-input" maxlength="30" value="${esc(assistenteNome)}" aria-label="Nome do assistente" /></span>`
            : `<span class="assistente-nome">✨ <span class="assistente-nome-txt">${esc(assistenteNome)}</span><button id="assistente-editar-nome" class="assistente-editar-nome" title="Editar nome" aria-label="Editar nome do assistente">${ICON_EDIT}</button></span>`}
          <button id="assistente-fechar" title="Fechar">✕</button>
        </div>
        <div class="assistente-mensagens" id="assistente-mensagens-lista">
          ${!assistenteMensagens.length ? `<div class="assistente-msg assistente-msg-assistant">Oi! Eu sou ${esc(assistenteNome)}. Pode perguntar qualquer coisa sobre como usar o CRM — Pipeline, Agenda, GEROT, Comissões, Fluxos, o que precisar.</div>` : ''}
          ${assistenteMensagens.map(m=>`<div class="assistente-msg assistente-msg-${m.role}">${esc(m.content)}</div>`).join('')}
          ${assistenteEnviando ? `<div class="assistente-msg assistente-msg-assistant assistente-digitando">Digitando…</div>` : ''}
        </div>
        <div class="assistente-input-row">
          <input type="text" id="assistente-input" placeholder="Pergunte algo…" ${assistenteEnviando?'disabled':''} />
          <button id="assistente-enviar" ${assistenteEnviando?'disabled':''} title="Enviar">➤</button>
        </div>
      </div>
    ` : ''}
  `;
  if(assistenteAberto) posicionarPainelAssistente();
  ligarBindingsAssistente();
  assistenteAnimando = null; // a animação roda uma vez; re-renders seguintes (ex.: nova mensagem) não repetem
  if(assistenteEditandoNome){ const ni = document.getElementById('assistente-nome-input'); if(ni){ ni.focus(); ni.select(); } }
  const lista = document.getElementById('assistente-mensagens-lista');
  if(lista) lista.scrollTop = lista.scrollHeight;
}
// Posiciona o painel de conversa perto de onde a bolinha estiver no momento (ela pode
// ter sido arrastada pra qualquer canto), sempre mantendo ele inteiro dentro da tela.
function posicionarPainelAssistente(){
  const bolha = document.getElementById('assistente-bolha');
  const painel = document.getElementById('assistente-painel');
  if(!bolha || !painel) return;
  const rectBolha = bolha.getBoundingClientRect();
  const largura = 336, altura = 460;
  let left = rectBolha.right - largura;
  let top = rectBolha.top - altura - 12;
  if(top < 12) top = rectBolha.bottom + 12; // não cabe em cima, abre embaixo da bolinha
  left = Math.min(Math.max(12, left), window.innerWidth - largura - 12);
  top = Math.min(Math.max(12, top), window.innerHeight - altura - 12);
  painel.style.left = left+'px';
  painel.style.top = top+'px';
  // cresce/encolhe a partir da bolinha
  painel.style.transformOrigin = (rectBolha.left + rectBolha.width/2 - left)+'px '+(rectBolha.top + rectBolha.height/2 - top)+'px';
}
function alternarAssistente(){
  if(assistenteAberto){
    if(assistenteAnimando==='fechando') return;
    const painel = document.getElementById('assistente-painel');
    const reduz = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!painel || reduz){ assistenteAberto = false; assistenteEditandoNome = false; renderAssistente(); return; }
    assistenteAnimando = 'fechando';
    painel.classList.add('fechando');
    const bolha = document.getElementById('assistente-bolha');
    if(bolha) bolha.textContent = '💬';
    setTimeout(()=>{ assistenteAberto = false; assistenteEditandoNome = false; assistenteAnimando = null; renderAssistente(); }, 220);
  } else {
    assistenteAberto = true;
    assistenteAnimando = 'abrindo';
    renderAssistente();
  }
}
function salvarNomeAssistente(){
  const ni = document.getElementById('assistente-nome-input');
  if(ni){
    const novo = ni.value.trim().slice(0,30) || ASSISTENTE_NOME_PADRAO;
    assistenteNome = novo;
    try{ localStorage.setItem('assistente-nome', novo); }catch(err){}
  }
  assistenteEditandoNome = false;
  renderAssistente();
}
async function enviarMensagemAssistente(){
  const input = document.getElementById('assistente-input');
  if(!input) return;
  const texto = input.value.trim();
  if(!texto || assistenteEnviando) return;
  assistenteMensagens.push({ role:'user', content: texto });
  input.value = '';
  assistenteEnviando = true;
  renderAssistente();
  try{
    const data = await apiRequest('POST', '/ai/assistente', { mensagens: assistenteMensagens }, 45000);
    assistenteMensagens.push({ role:'assistant', content: data.resposta || '(sem resposta)' });
  }catch(e){
    assistenteMensagens.push({ role:'assistant', content: 'Não consegui responder agora — ' + (e.message||'tenta de novo em instantes.') });
  }
  assistenteEnviando = false;
  renderAssistente();
}
function ligarBindingsAssistente(){
  const bolha = document.getElementById('assistente-bolha');
  if(bolha){
    bolha.addEventListener('pointerdown', (e)=>{
      assistenteDrag = {
        startX:e.clientX, startY:e.clientY,
        bolhaXInicial: bolha.getBoundingClientRect().left, bolhaYInicial: bolha.getBoundingClientRect().top,
        moveu:false, pointerId:e.pointerId,
      };
      try{ bolha.setPointerCapture(e.pointerId); }catch(err){}
    });
    bolha.addEventListener('pointermove', (e)=>{
      if(!assistenteDrag || assistenteDrag.pointerId!==e.pointerId) return;
      const dx = e.clientX - assistenteDrag.startX;
      const dy = e.clientY - assistenteDrag.startY;
      if(!assistenteDrag.moveu && Math.sqrt(dx*dx+dy*dy) < 5) return; // tremedeira do dedo/mão, não é arrastar de verdade ainda
      assistenteDrag.moveu = true;
      let novoX = assistenteDrag.bolhaXInicial + dx;
      let novoY = assistenteDrag.bolhaYInicial + dy;
      novoX = Math.min(Math.max(4, novoX), window.innerWidth - bolha.offsetWidth - 4);
      novoY = Math.min(Math.max(4, novoY), window.innerHeight - bolha.offsetHeight - 4);
      bolha.style.left = novoX+'px';
      bolha.style.top = novoY+'px';
      bolha.style.right = 'auto';
      bolha.style.bottom = 'auto';
      const painel = document.getElementById('assistente-painel');
      if(painel) posicionarPainelAssistente();
    });
    const soltar = (e)=>{
      if(!assistenteDrag || assistenteDrag.pointerId!==e.pointerId) return;
      if(assistenteDrag.moveu){
        assistenteBolhaX = parseFloat(bolha.style.left);
        assistenteBolhaY = parseFloat(bolha.style.top);
        try{ localStorage.setItem('assistente-bolha-pos', JSON.stringify({x:assistenteBolhaX, y:assistenteBolhaY})); }catch(err){}
      } else {
        alternarAssistente();
      }
      assistenteDrag = null;
    };
    bolha.addEventListener('pointerup', soltar);
    bolha.addEventListener('pointercancel', ()=>{ assistenteDrag = null; });
  }
  const fecharBtn = document.getElementById('assistente-fechar');
  if(fecharBtn) fecharBtn.addEventListener('click', alternarAssistente);
  const editarNomeBtn = document.getElementById('assistente-editar-nome');
  if(editarNomeBtn) editarNomeBtn.addEventListener('click', ()=>{ assistenteEditandoNome = true; renderAssistente(); });
  const nomeInput = document.getElementById('assistente-nome-input');
  if(nomeInput){
    let cancelado = false;
    nomeInput.addEventListener('keydown', (e)=>{
      if(e.key==='Enter'){ e.preventDefault(); nomeInput.blur(); }
      else if(e.key==='Escape'){ cancelado = true; assistenteEditandoNome = false; renderAssistente(); }
    });
    nomeInput.addEventListener('blur', ()=>{ if(!cancelado && assistenteEditandoNome) salvarNomeAssistente(); });
  }
  const enviarBtn = document.getElementById('assistente-enviar');
  if(enviarBtn) enviarBtn.addEventListener('click', enviarMensagemAssistente);
  const input = document.getElementById('assistente-input');
  if(input){
    input.addEventListener('keydown', (e)=>{ if(e.key==='Enter') enviarMensagemAssistente(); });
  }
}
window.addEventListener('resize', ()=>{ if(assistenteAberto) posicionarPainelAssistente(); });

function renderApp(){
  const app = document.getElementById('app');
  if(!loaded){ app.innerHTML = '<div class="loading">Carregando painel…</div>'; return; }

  let pageHtml = '';
  if(currentPage === 'dashboard') pageHtml = renderDashboardPage();
  else if(currentPage === 'pipeline') pageHtml = renderPipelinePage();
  else if(currentPage === 'leads') pageHtml = renderLeadsPage();
  else if(currentPage === 'conversas') pageHtml = renderConversasPage();
  else if(currentPage === 'comissoes') pageHtml = renderComissoesPage();
  else if(currentPage === 'relatorios') pageHtml = renderRelatoriosPage();
  else if(currentPage === 'disparos') pageHtml = renderDisparosPage();
  else if(currentPage === 'automacoes') pageHtml = renderAutomacoesPage();
  else if(currentPage === 'fluxos') pageHtml = renderFluxosPage();
  else if(currentPage === 'agendamentos') pageHtml = renderAgendamentosPage();
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
        ${pageHtml}
      </div>
    </div>
  `;

  bindAppEvents();
}

const NAV_COMPLETO = [
  ['dashboard', 'Dashboard', ICON_DASHBOARD],
  ['pipeline', 'Pipeline', ICON_PIPELINE],
  ['leads', 'Leads', ICON_LEADS],
  ['conversas', 'Conversas', ICON_CONVERSAS],
  ['comissoes', 'Comissões', ICON_COMISSOES],
  ['relatorios', 'Relatórios', ICON_RELATORIOS],
  ['fluxos', 'Fluxos', ICON_FLUXOS],
  ['import-export', 'Importar/Exportar', ICON_IMPORT_EXPORT],
  ['equipe', 'Equipe', ICON_CHAT_INTERNO],
  ['tarefas', 'Agenda/Tarefas', ICON_TASKS],
];
// na versão administrativa (recrutamento) não existe a aba Comissões
function navPadrao(){ return perfilRH() ? NAV_COMPLETO.filter(i=>i[0]!=='comissoes') : NAV_COMPLETO; }
function getOrdemNavSalva(){
  try{ return JSON.parse(localStorage.getItem('navOrdem') || 'null'); }catch(e){ return null; }
}
// Devolve o NAV na ordem escolhida pelo usuário — se ele nunca reordenou, ou se um
// item novo foi adicionado depois (ex: uma página nova), cai no padrão / vai pro fim.
function getNavOrdenado(){
  const ordemSalva = getOrdemNavSalva();
  if(!ordemSalva || !ordemSalva.length) return navPadrao();
  const porChave = Object.fromEntries(navPadrao().map(item=>[item[0], item]));
  const resultado = ordemSalva.map(chave=>porChave[chave]).filter(Boolean);
  navPadrao().forEach(item=>{ if(!ordemSalva.includes(item[0])) resultado.push(item); });
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
  const porChave = Object.fromEntries(navPadrao().map(item=>[item[0], item]));
  root.innerHTML = `
    <div class="overlay" id="reordenar-nav-overlay">
      <div class="modal reordenar-nav-modal">
        <div class="modal-head">
          <h3>Reordenar abas</h3>
          <button id="reordenar-nav-close">✕</button>
        </div>
        <div class="modal-body">
          <p class="settings-page-note" style="margin-bottom:12px;">Use as setinhas pra mudar a ordem que as abas aparecem no menu.</p>
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

function renderSidebar(){
  const NAV = getNavOrdenado();
  return `
    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="sidebar-avatar">${currentUser && currentUser.avatarUrl ? `<img src="${currentUser.avatarUrl}" alt="" />` : esc(iniciaisDoNome((currentUser&&currentUser.nome)||''))}</span>
        <span class="sidebar-greeting">Olá, <span class="sidebar-brand-name">${esc((currentUser && currentUser.nome) || 'visitante')}</span></span>
      </div>
      <nav class="sidebar-nav">
        ${NAV.map(([key,label,icon])=>`
          <button class="nav-item ${currentPage===key?'active':''}" data-action="nav" data-page="${key}">${icon}<span>${label}</span></button>
        `).join('')}
      </nav>
      <div class="nav-reordenar-wrap">
        <button class="nav-item nav-reordenar-btn" data-action="abrir-reordenar-nav" title="Mudar a ordem das abas">${ICON_REORDER}<span>Reordenar abas</span></button>
      </div>
      <div class="sidebar-footer">
        <button class="nav-item ${currentPage==='suporte'?'active':''}" data-action="nav" data-page="suporte">${ICON_SUPORTE}<span>Suporte</span></button>
        <button class="nav-item ${currentPage==='configuracoes'?'active':''}" data-action="nav" data-page="configuracoes">${ICON_SETTINGS}<span>Configurações</span></button>
        <button class="nav-item logout-item" data-action="logout">${ICON_LOGOUT}<span>Sair</span></button>
      </div>
    </aside>
  `;
}

