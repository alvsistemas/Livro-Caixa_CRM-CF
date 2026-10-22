/* ---------- página: Dashboard ---------- */
// Painéis recolhíveis do Dashboard — o estado (aberto/fechado) fica salvo no
// localStorage do navegador, então continua do jeito que a pessoa deixou mesmo
// depois de fechar e abrir o CRM de novo.
function painelDashboardAberto(id){
  try{
    const v = localStorage.getItem('dash-painel-'+id);
    return v === null ? true : v === '1'; // aberto por padrão, antes da primeira vez que a pessoa mexe
  }catch(e){ return true; }
}
function renderCabecalhoPainelDashboard(id, titulo, extraHtml){
  const aberto = painelDashboardAberto(id);
  return `
    <div class="dash-panel-title dash-panel-title-recolhivel" style="${aberto?'':'margin-bottom:0;'}">
      <button type="button" class="dash-panel-toggle" data-action="toggle-painel-dashboard" data-painel-id="${id}">
        <span class="dash-panel-seta ${aberto?'':'fechada'}">▾</span> ${titulo}
      </button>
      ${extraHtml||''}
    </div>
  `;
}
// Envolve o conteúdo de um painel numa estrutura que anima o recolher/abrir suavemente
// (usa grid-template-rows 1fr↔0fr, que consegue animar até uma altura "automática"
// sem precisar saber o tamanho do conteúdo de antemão — ao contrário de max-height,
// que precisa de um valor fixo chutado). O conteúdo fica sempre no DOM; é só a altura
// visível que encolhe a zero quando fechado.
function envolverConteudoPainel(id, conteudoHtml){
  const aberto = painelDashboardAberto(id);
  return `
    <div class="dash-panel-collapse" id="dash-collapse-${id}" style="max-height:${aberto ? 'none' : '0px'};">
      <div class="dash-panel-collapse-inner">${conteudoHtml}</div>
    </div>
  `;
}
// Abre/fecha um painel específico do Dashboard sem redesenhar a página inteira — se
// redesenhasse tudo (como o resto do app costuma fazer), o elemento nasceria de novo
// já no estado final, sem um "antes" pra animação partir. Mede a altura real do
// conteúdo em pixels (em vez de usar grid-template-rows com fr, que tem suporte menos
// confiável entre navegadores) e anima o max-height até lá.
function alternarPainelDashboard(id, btn){
  const vaiAbrir = !painelDashboardAberto(id);
  try{ localStorage.setItem('dash-painel-'+id, vaiAbrir ? '1' : '0'); }catch(e){}

  const seta = btn.querySelector('.dash-panel-seta');
  if(seta) seta.classList.toggle('fechada', !vaiAbrir);
  const tituloEl = btn.closest('.dash-panel-title-recolhivel');
  if(tituloEl) tituloEl.style.marginBottom = vaiAbrir ? '' : '0';

  const colapseEl = document.getElementById('dash-collapse-'+id);
  if(!colapseEl) return;
  const innerEl = colapseEl.querySelector('.dash-panel-collapse-inner');

  if(vaiAbrir){
    const alturaFinal = innerEl.scrollHeight;
    colapseEl.style.maxHeight = alturaFinal + 'px';
    colapseEl.addEventListener('transitionend', function liberar(e){
      if(e.propertyName !== 'max-height') return;
      if(painelDashboardAberto(id)) colapseEl.style.maxHeight = 'none'; // libera de vez, pro conteúdo poder crescer depois sem ficar cortado
      colapseEl.removeEventListener('transitionend', liberar);
    });
  } else {
    colapseEl.style.maxHeight = colapseEl.scrollHeight + 'px'; // trava num valor explícito — estava em "none", que não é animável
    colapseEl.offsetHeight; // força o navegador a registrar esse valor antes da próxima mudança
    requestAnimationFrame(()=>{
      colapseEl.style.maxHeight = '0px';
    });
  }
}
function renderDashboardPage(){
  const m = dashMetrics();
  const stages = stageTotals();
  const maxStage = Math.max(1, ...stages.map(s=>s.total));
  const recentes = [...cardsInPeriod()].sort((a,b)=> new Date(b.createdAt||0) - new Date(a.createdAt||0)).slice(0,5);
  const tarefasSemHora = tasksLoaded ? tasks.filter(t=>!t.concluida && !horaLocalDaTarefaOuNull(t.vencimento)).map(t=>({ tipo:'tarefa', id:t.id, titulo:t.titulo, data:t.vencimento })) : [];
  // eventos do Google são pessoais do próprio gestor — não fazem sentido (e vazariam
  // dados privados) quando ele está olhando o dashboard de outra pessoa
  const eventosSemHoraDash = (agendaLoaded && !visualizandoDashboardDe) ? agendaEventosGoogle.filter(e=>e.diaInteiro && !e.concluida).map(e=>({ tipo:'evento', id:e.id, titulo:e.titulo, data:e.inicio })) : [];
  const abertas = [...tarefasSemHora, ...eventosSemHoraDash].sort((a,b)=> new Date(a.data||'2999-01-01') - new Date(b.data||'2999-01-01')).slice(0,5);

  return `
    ${visualizandoDashboardDe ? `
      <div class="dashboard-readonly-banner">
        <span>👁️ Você está vendo o dashboard de <b>${esc(visualizandoDashboardDe.nome)}</b> — somente leitura, nada aqui pode ser alterado.</span>
        <button type="button" class="btn-outline" data-action="sair-dashboard-membro">← Voltar</button>
      </div>
    ` : ''}
    <div class="page-head">
      <div>
        <h1>Dashboard</h1>
        <p>Visão geral do seu funil de vendas</p>
      </div>
      <div class="period-toggle">
        ${[['7dias','7 dias'],['mes','Mês'],['trimestre','Trimestre'],['ano','Ano']].map(([key,label])=>`
          <button class="tab-btn ${dashboardPeriod===key?'active':''}" data-action="set-dash-period" data-period="${key}">${label}</button>
        `).join('')}
      </div>
    </div>

    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-card-top"><span>Novos leads</span><span class="metric-icon">${ICON_USERS}</span></div>
        <div class="metric-value">${m.novosLeads}</div>
        <div class="metric-sub">no período</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-top"><span>Em negociação</span><span class="metric-icon">${ICON_DOLLAR}</span></div>
        <div class="metric-value">${perfilRH() ? m.emNegociacaoCount : fmtBRL(m.emNegociacaoValor)}</div>
        <div class="metric-sub">${m.emNegociacaoCount} ${m.emNegociacaoCount===1?'negócio':'negócios'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-top"><span>Ganho</span><span class="metric-icon">${ICON_TROPHY}</span></div>
        <div class="metric-value">${perfilRH() ? m.ganhoCount : fmtBRL(m.ganhoValor)}</div>
        <div class="metric-sub">${m.ganhoCount} fechados</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-top"><span>Conversão</span><span class="metric-icon">${ICON_TREND}</span></div>
        <div class="metric-value">${m.conversao}%</div>
        <div class="metric-sub">ganhos / fechados</div>
      </div>
    </div>

    <div class="dash-grid" style="margin-bottom:20px;${perfilRH()?'display:none;':''}">
      <div class="dash-panel">
        ${renderCabecalhoPainelDashboard('meta-individual', 'Meta de vendas do mês', (!editandoMetaVendas && !visualizandoDashboardDe) ? `<button class="icon-btn" data-action="editar-meta-vendas" title="Editar meta">${ICON_EDIT}</button>` : '')}
        ${envolverConteudoPainel('meta-individual', !metaVendasCarregada ? `<p class="settings-page-note">Carregando…</p>` : (editandoMetaVendas ? `
          <div class="field-row" style="align-items:flex-end;">
            <div class="field"><label>Meta do mês (R$)</label><input type="number" id="meta-vendas-input" value="${metaVendasValor||0}" min="0" step="0.01" /></div>
            <button class="btn-primary" id="meta-vendas-salvar" style="margin-bottom:14px;">Salvar</button>
          </div>
        ` : (metaVendasValor > 0 ? `
          <div class="meta-vendas-track"><div class="meta-vendas-fill" style="width:${Math.min(100, (vendidoNoMesAtual()/metaVendasValor*100))}%"></div></div>
          <p class="settings-page-note">${fmtBRL(vendidoNoMesAtual())} de ${fmtBRL(metaVendasValor)} — ${Math.round(Math.min(999,vendidoNoMesAtual()/metaVendasValor*100))}%</p>
        ` : `<p class="dash-empty">Nenhuma meta definida pra este mês.</p>`)))}
      </div>
      ${equipe ? `
        <div class="dash-panel">
          ${renderCabecalhoPainelDashboard('meta-equipe', 'Meta de vendas da equipe', (equipe.souSupervisor && !editandoMetaVendasEquipe && !visualizandoDashboardDe) ? `<button class="icon-btn" data-action="editar-meta-vendas-equipe" title="Editar meta">${ICON_EDIT}</button>` : '')}
          ${envolverConteudoPainel('meta-equipe', !metaVendasEquipeCarregada ? `<p class="settings-page-note">Carregando…</p>` : (editandoMetaVendasEquipe ? `
            <div class="field-row" style="align-items:flex-end;">
              <div class="field"><label>Meta da equipe no mês (R$)</label><input type="number" id="meta-vendas-equipe-input" value="${metaVendasEquipeValor||0}" min="0" step="0.01" /></div>
              <button class="btn-primary" id="meta-vendas-equipe-salvar" style="margin-bottom:14px;">Salvar</button>
            </div>
          ` : `
            <div class="meta-vendas-track"><div class="meta-vendas-fill" style="width:${metaVendasEquipeValor ? Math.min(100, (metaVendasEquipeVendido/metaVendasEquipeValor*100)) : 0}%"></div></div>
            <p class="settings-page-note">${fmtBRL(metaVendasEquipeVendido)} de ${fmtBRL(metaVendasEquipeValor)} — ${metaVendasEquipeValor ? Math.round(Math.min(999,metaVendasEquipeVendido/metaVendasEquipeValor*100)) : 0}%</p>
          `))}
        </div>
      ` : ''}
    </div>

    <div class="dash-grid">
      <div class="dash-panel">
        ${renderCabecalhoPainelDashboard('leads-captados', 'Leads captados')}
        ${envolverConteudoPainel('leads-captados', renderLeadsChart())}
      </div>
      <div class="dash-panel">
        ${renderCabecalhoPainelDashboard('pipeline-etapa', 'Pipeline por etapa')}
        ${envolverConteudoPainel('pipeline-etapa', `
        <div class="stage-list">
          ${stages.length ? stages.map(s=>`
            <div class="stage-row">
              <div class="stage-row-top"><span>${esc(s.col.nome)}</span><span>${fmtBRL(s.total)}</span></div>
              <div class="stage-bar-track"><div class="stage-bar-fill" style="width:${maxStage ? (s.total/maxStage*100) : 0}%"></div></div>
            </div>
          `).join('') : '<p class="dash-empty">Nenhuma coluna criada ainda.</p>'}
        </div>
        `)}
      </div>
    </div>

    <div class="dash-grid">
      <div class="dash-panel">
        ${renderCabecalhoPainelDashboard('ultimos-leads', 'Últimos leads')}
        ${envolverConteudoPainel('ultimos-leads', recentes.length ? `<div class="recent-list">${recentes.map(c=>`
          <div class="recent-item"><span class="recent-name">${esc(c.cliente) || 'Sem nome'}</span><span class="recent-value">${fmtBRL(c.valor)}</span></div>
        `).join('')}</div>` : '<p class="dash-empty">Nenhum lead neste período.</p>')}
      </div>
      <div class="dash-panel">
        ${renderCabecalhoPainelDashboard('tarefas-abertas', 'Tarefas abertas')}
        ${envolverConteudoPainel('tarefas-abertas', abertas.length ? `<div class="recent-list">${abertas.map(t=>`
          <div class="task-mini-item">
            ${t.tipo==='evento'
              ? `<span class="check-circle" data-action="toggle-evento" data-evento-id="${t.id}"></span>`
              : (visualizandoDashboardDe ? `<span class="check-circle" style="cursor:default;"></span>` : `<span class="check-circle" data-action="toggle-task" data-task-id="${t.id}"></span>`)
            }
            <span class="task-mini-title">${esc(t.titulo)}</span>
            ${t.data ? `<span class="metric-sub">${formatDate(t.data)}</span>` : ''}
          </div>
        `).join('')}</div>` : '<p class="dash-empty">Tudo em dia por aqui.</p>')}
      </div>
    </div>
  `;
}

/* ---------- página: Pipeline (o quadro kanban, como já era) ---------- */
function renderPipelinePage(){
  if(!funisLoaded){
    return `<div class="page-head"><div><h1>Pipeline</h1><p>Carregando…</p></div></div>`;
  }
  const months = monthsList();
  const funilAtual = funis.find(f=>f.id===funilAtualId);
  const columnsDoFunil = board.columns.filter(c=>c.funilId===funilAtualId);
  return `
    <div class="page-head">
      <div>
        <h1>Pipeline</h1>
        <p>Arraste os clientes para mudar de coluna</p>
      </div>
    </div>

    <div class="funil-tabs">
      ${funis.map(f=>{
        if(editingFunilId===f.id){
          return `<input class="funil-name-input" id="funil-rename-${f.id}" value="${esc(editingFunilName)}" />`;
        }
        return `<button class="tab-btn ${funilAtualId===f.id?'active':''}" data-action="set-funil" data-funil-id="${f.id}">${esc(f.nome)}</button>`;
      }).join('')}
      ${funilAtual ? `
        <button class="icon-btn" data-action="edit-funil-name" data-funil-id="${funilAtual.id}" title="Renomear funil">${ICON_EDIT}</button>
        <button class="icon-btn" data-action="duplicar-funil" data-funil-id="${funilAtual.id}" title="Duplicar funil (só a estrutura de colunas)">⧉</button>
        ${funis.length > 1 ? `<button class="icon-btn" data-action="delete-funil" data-funil-id="${funilAtual.id}" title="Excluir funil">${ICON_TRASH}</button>` : ''}
      ` : ''}
      <button class="tab-btn" data-action="open-new-funil" title="Criar novo funil">+ Funil</button>
    </div>

    <div class="tabs">
      <button class="tab-btn ${filterMonth===null?'active':''}" data-action="set-month" data-month="">Geral</button>
      <div class="date-wrap">
        <button class="tab-btn ${filterMonth?'active':''}" data-action="toggle-date-menu">
          📅 ${filterMonth ? monthLabel(filterMonth) : 'Escolher data'}
        </button>
        ${dateMenuOpen ? `
          <div class="date-menu">
            <div class="date-menu-title">Meses com dados</div>
            ${months.length ? `
              <div class="date-menu-list">
                ${months.map(m=>`<button class="date-menu-item ${filterMonth===m?'active':''}" data-action="set-month" data-month="${m}">${monthLabel(m, true)}</button>`).join('')}
              </div>
            ` : `<p class="date-menu-empty">Nenhum mês com dados ainda.</p>`}
            <div class="date-menu-sep"></div>
            <label class="date-menu-custom-label">
              Ir para outro mês
              <input type="month" id="goto-month-input" value="${filterMonth||''}" />
            </label>
          </div>
        ` : ''}
      </div>
      <button class="tab-btn ${filtroEsfriando?'active':''}" data-action="toggle-esfriando" title="Leads em aberto sem atividade há mais de 7 dias">🧊 Esfriando</button>
    </div>

    <div class="stats-wrap-fixo">
      <div class="stats-wrap">
        <div class="stats">
          <div class="stats-label">Resumo · ${filterMonth ? monthLabel(filterMonth, true) : 'Geral (todos os meses)'}</div>
          <div class="stats-row">
            ${renderStatItem('aberto', 'Em negociação', fmtBRL(sumByTipo('aberto')), `${countByTipo('aberto')} ${countByTipo('aberto')===1?'cliente':'clientes'}`)}
            ${renderStatItem('ganho', 'Vendido', fmtBRL(sumByTipo('ganho')), `${countByTipo('ganho')} ${countByTipo('ganho')===1?'cliente':'clientes'}`)}
            ${renderStatItem('perdido', 'Perdido', fmtBRL(sumByTipo('perdido')), `${countByTipo('perdido')} ${countByTipo('perdido')===1?'cliente':'clientes'}`, 'rgba(255,255,255,.45)')}
            ${renderStatItem('quentes', 'Leads quentes', quentesAtivos())}
            ${renderStatItem('ticket', 'Ticket médio', fmtBRL(ticketMedioFunil()))}
            ${renderStatItem('ponderado', 'Valor ponderado', fmtBRL(valorPonderadoFunil()))}
          </div>
        </div>
      </div>
    </div>

    ${integracoesConfig.assistenteIA ? `<div class="pipeline-insights-bar">
      <button class="pipeline-insights-toggle" data-action="toggle-insights-pipeline">
        <span>${ICON_SPARKLE} Insights da IA sobre esse funil</span>
        <span class="auditoria-toggle-seta ${insightsPipelineExpandido?'aberta':''}">▾</span>
      </button>
      ${insightsPipelineExpandido ? `
        <div class="pipeline-insights-conteudo">
          <button class="btn-outline" data-action="gerar-insights" ${insightsCarregando?'disabled':''}>${insightsCarregando?'Gerando…':'Gerar'}</button>
          ${aiInsights.length
            ? `<ul class="ai-insights-list">${aiInsights.map(i=>`<li>${esc(i)}</li>`).join('')}</ul>`
            : `<p class="dash-empty">Clique em "Gerar" para receber alertas sobre esse funil.</p>`
          }
        </div>
      ` : ''}
    </div>` : ''}

    <div class="pipeline-ordenar-row">
      ${renderBotaoOrdenar('pipeline', pipelineOrdenarPor, 'Ordem manual (arrastar)')}
      ${pipelineOrdenando ? `<span class="settings-page-note">Reordenando…</span>` : ''}
    </div>

    <main class="pipeline-main">
      <div class="board">
        ${columnsDoFunil.map(col => renderColumn(col)).join('')}
        <div class="add-col-wrap">
          ${addingCol ? `
            <div class="add-col-form">
              <input type="text" id="new-col-input" placeholder="Nome da coluna" value="${esc(newColNameVal)}" />
              <select id="new-col-tipo" class="add-col-tipo-select">
                ${Object.entries(TIPOS).map(([key,t])=>`<option value="${key}" ${newColTipoVal===key?'selected':''}>${t.label}</option>`).join('')}
              </select>
              <div class="add-col-actions">
                <button class="btn-primary" data-action="confirm-add-col">Adicionar</button>
                <button class="btn-ghost" data-action="cancel-add-col">Cancelar</button>
              </div>
            </div>
          ` : `
            <button class="add-col-btn" data-action="start-add-col">+ Nova coluna</button>
          `}
        </div>
      </div>
    </main>
  `;
}

function renderColumn(col){
  const cards = cardsOf(col.id);
  const tipo = TIPOS[col.tipo] || TIPOS.aberto;
  const total = cards.reduce((s,c)=> s + (Number(c.valor)||0), 0);
  const isEditing = editingColId === col.id;
  const menuOpen = openMenuColId === col.id;

  return `
    <div class="column" data-col-id="${col.id}">
      <div class="col-head">
        <div class="col-head-top">
          <span class="grip" draggable="true" data-action="drag-col-handle" data-col-id="${col.id}" title="Arraste para reordenar">⠿</span>
          ${isEditing
            ? `<input class="col-name-input" id="col-rename-${col.id}" value="${esc(editingColName)}" />`
            : `<span class="col-name" data-action="edit-col-name" data-col-id="${col.id}" title="Clique para renomear">${esc(col.nome)}</span>`
          }
          <button class="col-add-btn" data-action="open-add-lead-choice" data-col-id="${col.id}" title="Adicionar cliente">+</button>
          <button class="col-menu-btn" data-action="toggle-col-menu" data-col-id="${col.id}">▾</button>
        </div>
        <div class="col-meta">
          <span class="badge" style="color:${tipo.color};background:${tipo.bg};${tipo.strike ? 'text-decoration:line-through;' : ''}">${tipo.label}</span>
          <span class="col-total">${fmtBRL(total)}</span>
        </div>
        ${menuOpen ? `
          <div class="col-menu">
            <div class="col-menu-title">Marcar coluna como</div>
            ${Object.entries(TIPOS).map(([key,t])=>`
              <button class="col-menu-item" data-action="set-col-tipo" data-col-id="${col.id}" data-tipo="${key}">
                <span class="dot" style="background:${t.color}"></span>${t.label} ${col.tipo===key?'✓':''}
              </button>
            `).join('')}
            ${col.tipo==='aberto' ? `
              <div class="col-menu-sep">
                <label class="col-menu-prob-label">
                  Chance de fechar (%) — usado no valor ponderado
                  <input type="number" class="col-menu-prob-input" data-col-id="${col.id}" value="${col.probabilidade!=null?col.probabilidade:50}" min="0" max="100" />
                </label>
              </div>
            ` : ''}
            <div class="col-menu-sep">
              <button class="col-menu-item danger" data-action="delete-col" data-col-id="${col.id}">🗑 Excluir coluna</button>
            </div>
          </div>
        ` : ''}
      </div>

      <div class="cards" data-col-id="${col.id}">
        ${cards.length===0 ? '<p class="empty-col">Nenhum cliente aqui ainda</p>' : cards.map(card=>renderCard(card)).join('')}
      </div>
    </div>
  `;
}

// Deixa o total da coluna (quando o valor é grande demais e fica cortado)
// arrastável com o mouse, além do toque/trackpad que o overflow-x já dá de graça.
// mousemove/mouseup ficam registrados uma única vez (fora do render) pra não
// acumular ouvintes a cada nova renderização — só o mousedown é religado por
// elemento, já que os elementos em si são recriados a cada render.
let arrasteHorizontalState = null;
document.addEventListener('mousemove', (e)=>{
  if(!arrasteHorizontalState) return;
  e.preventDefault();
  arrasteHorizontalState.el.scrollLeft = arrasteHorizontalState.scrollInicial - (e.pageX - arrasteHorizontalState.inicioX);
});
document.addEventListener('mouseup', ()=>{
  if(!arrasteHorizontalState) return;
  arrasteHorizontalState.el.classList.remove('dragging');
  arrasteHorizontalState = null;
});
// Mede a altura de verdade do bloco fixo do resumo (em vez de chutar um valor em
// pixels) e usa isso pra calcular exatamente quanto sobra de tela pra coluna — sem
// esse cálculo, ou a coluna fica curta demais (sobra espaço vazio embaixo) ou alta
// demais (esconde atrás do resumo ao rolar até o fim da página).
/* ---------- resumo do Pipeline: largura de cada número, redimensionável ---------- */
const STAT_KEYS = ['aberto','ganho','perdido','quentes','ticket','ponderado'];
const STAT_LARGURA_PADRAO = 220;
const STAT_LARGURA_MIN = 130;
function getLargurasStats(){
  let salvo = {};
  try{ salvo = JSON.parse(localStorage.getItem('statsLargura') || '{}'); }catch(e){ salvo = {}; }
  return salvo;
}
let statsLargura = getLargurasStats();
// Só ajusta quem NUNCA foi redimensionado manualmente pelo usuário — distribui o
// espaço da caixa azul igualmente entre eles, sem nunca deixar menor que o padrão
// (pra nenhum número começar cortado) nem deixar espaço vazio sobrando.
function ajustarLargurasStatsPadrao(){
  if(currentPage !== 'pipeline') return;
  const statsEl = document.querySelector('.stats');
  if(!statsEl) return;
  const chavesNaoCustomizadas = STAT_KEYS.filter(k => statsLargura[k] === undefined);
  if(!chavesNaoCustomizadas.length) return; // tudo já foi ajustado manualmente, respeita a escolha do usuário
  const larguraTotalCustomizada = STAT_KEYS.reduce((s,k)=> s + (statsLargura[k] || 0), 0);
  const larguraDisponivel = statsEl.getBoundingClientRect().width - larguraTotalCustomizada;
  const larguraIdeal = Math.max(STAT_LARGURA_PADRAO, Math.floor(larguraDisponivel / chavesNaoCustomizadas.length));
  chavesNaoCustomizadas.forEach(chave=>{
    const statEl = document.querySelector(`.stat[data-stat-key="${chave}"]`);
    if(statEl) statEl.style.width = larguraIdeal + 'px';
  });
}
function renderStatItem(chave, label, valor, contagem, corValor){
  const largura = statsLargura[chave] || STAT_LARGURA_PADRAO;
  return `
    <div class="stat" data-stat-key="${chave}" style="width:${largura}px;">
      <span class="lbl">${esc(label)}</span>
      <span class="val" ${corValor ? `style="color:${corValor}"` : ''}>${valor}</span>
      ${contagem ? `<span class="cnt">${esc(contagem)}</span>` : ''}
      <div class="stat-resize-handle" data-stat-key="${chave}" title="Arraste para redimensionar"></div>
    </div>
  `;
}
let resizeStatState = null;
document.addEventListener('mousemove', (e)=>{
  if(!resizeStatState) return;
  e.preventDefault();
  const delta = e.pageX - resizeStatState.startX;
  const novaLargura = Math.max(STAT_LARGURA_MIN, Math.round(resizeStatState.startWidth + delta));
  statsLargura[resizeStatState.key] = novaLargura;
  const statEl = document.querySelector(`.stat[data-stat-key="${resizeStatState.key}"]`);
  if(statEl) statEl.style.width = novaLargura + 'px';
});
document.addEventListener('mouseup', ()=>{
  if(!resizeStatState) return;
  resizeStatState = null;
  localStorage.setItem('statsLargura', JSON.stringify(statsLargura));
});
function ativarRedimensionarStats(){
  document.querySelectorAll('.stat-resize-handle').forEach(handle=>{
    handle.addEventListener('mousedown', (e)=>{
      e.preventDefault();
      e.stopPropagation();
      const statEl = handle.closest('.stat');
      resizeStatState = { key: handle.dataset.statKey, startX: e.pageX, startWidth: statEl.getBoundingClientRect().width };
    });
  });
}

function ajustarAlturaColunasPipeline(){
  if(currentPage !== 'pipeline') return;
  const resumoFixo = document.querySelector('.stats-wrap-fixo');
  if(!resumoFixo) return;
  const alturaResumo = resumoFixo.getBoundingClientRect().height;
  const margemExtra = 12; // respiro entre o resumo e o topo das colunas + a barra de rolagem horizontal
  document.documentElement.style.setProperty('--altura-coluna-pipeline', `calc(100vh - ${Math.ceil(alturaResumo + margemExtra)}px)`);
}
window.addEventListener('resize', ()=>{ ajustarAlturaColunasPipeline(); ajustarLargurasStatsPadrao(); });

function ativarArrasteHorizontal(){
  document.querySelectorAll('.col-total').forEach(el=>{
    el.addEventListener('mousedown', (e)=>{
      arrasteHorizontalState = { el, inicioX: e.pageX, scrollInicial: el.scrollLeft };
      el.classList.add('dragging');
    });
  });
}
function renderCard(card){
  const temp = TEMPS[card.temperatura] || TEMPS.frio;
  const showMonth = filterMonth === null && card.mesInicioContato;
  return `
    <div class="card" draggable="true" data-card-id="${card.id}">
      <div class="card-drag-handle" title="Arraste para mover">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="3" r="1.4"/><circle cx="11" cy="3" r="1.4"/>
          <circle cx="5" cy="8" r="1.4"/><circle cx="11" cy="8" r="1.4"/>
          <circle cx="5" cy="13" r="1.4"/><circle cx="11" cy="13" r="1.4"/>
        </svg>
      </div>
      <div class="card-move-wrap">
        <button class="card-move-btn" data-action="toggle-move-menu" data-card-id="${card.id}" title="Mover pra outra coluna">${ICON_MOVE}</button>
      </div>
      <div class="card-main">
        <div class="card-perf"></div>
        <div class="card-body" data-action="open-edit-card" data-card-id="${card.id}">
          <div class="card-top">
            <span class="card-name">${card.tipoPessoa==='juridica' ? '🏢 ' : ''}${esc(card.cliente) || 'Sem nome'}</span>
            <span class="temp-badge" style="color:${temp.color};background:${temp.bg}">${temp.emoji} ${temp.label}</span>
          </div>
          <div class="card-value-row">
            <span class="card-value">${fmtBRL(card.valor)}</span>
            ${showMonth ? `<span class="month-badge">${monthLabel(card.mesInicioContato)}</span>` : ''}
          </div>
          ${(card.telefone || card.obs) ? `
            <div class="card-extra">
              ${card.telefone ? `
                <div class="card-phone-row">
                  <span class="phone-text">☎ ${esc(card.telefone)}</span>
                  <button class="wa-btn" data-action="open-whatsapp" data-phone="${esc(card.telefone)}" title="Abrir conversa no WhatsApp">
                    ${WA_ICON} WhatsApp
                  </button>
                </div>
              ` : ''}
              ${card.obs ? `<p>${esc(card.obs)}</p>` : ''}
            </div>
          ` : ''}
          ${(card.etiquetas||[]).length ? `<div class="etiquetas-pills">${card.etiquetas.map(et=>`<span class="etiqueta-pill">${esc(et)}</span>`).join('')}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

/* ---------- página: Leads ---------- */
function renderLeadsPage(){
  const leads = filteredLeads();
  const idsVisiveis = leads.map(c=>c.id);
  const todosSelecionados = idsVisiveis.length>0 && idsVisiveis.every(id=>leadsSelecionados.has(id));
  return `
    <div class="page-head">
      <div>
        <h1>Leads</h1>
        <p>${board.cards.length} ${board.cards.length===1?'contato':'contatos'} na sua base</p>
      </div>
      <div class="page-head-actions">
        <button class="btn-outline ${mostrarArquivados?'active':''}" data-action="toggle-mostrar-arquivados" style="display:inline-flex; align-items:center; gap:6px;">${ICON_BAU} ${mostrarArquivados?'Voltar aos ativos':'Ver arquivados'}</button>
        <button class="btn-primary" data-action="open-new-lead">+ Novo lead</button>
      </div>
    </div>

    <div class="leads-toolbar">
      <input type="text" class="leads-search" id="leads-search-input" placeholder="Buscar por nome ou telefone" value="${esc(leadsSearch)}" />
      <select class="leads-filter" id="leads-status-filter">
        <option value="">Todos os status</option>
        ${board.columns.map(c=>`<option value="${c.id}" ${leadsStatusFilter===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
      </select>
      ${renderBotaoOrdenar('leads', leadsOrdenarPor)}
      <button class="btn-outline" data-action="exportar-leads">Exportar CSV</button>
      <button class="btn-outline" data-action="exportar-leads-xlsx">Exportar Excel</button>
    </div>

    ${leadsSelecionados.size ? `
      <div class="leads-bulk-bar">
        <span>${leadsSelecionados.size} selecionado${leadsSelecionados.size===1?'':'s'}</span>
        <select id="leads-bulk-coluna">
          <option value="">Mover para…</option>
          ${board.columns.map(c=>`<option value="${c.id}">${esc(c.nome)}</option>`).join('')}
        </select>
        ${podeAtribuirLeads() ? `<select id="leads-bulk-gestor-destino"><option value="">Passar para…</option>${opcoesDestinoEquipe('', false)}</select>` : ''}
        <button class="btn-outline" data-action="leads-bulk-etiqueta">+ Etiqueta</button>
        ${leadsBulkEtiquetaAberta ? `
          <input type="text" id="leads-bulk-etiqueta-input" placeholder="Nome da etiqueta" value="${esc(leadsBulkEtiquetaValor)}" style="width:140px;" autofocus />
          <button class="btn-primary" data-action="leads-bulk-etiqueta-confirmar">Aplicar</button>
        ` : ''}
        <button class="btn-outline" data-action="leads-bulk-arquivar">📦 Arquivar</button>
        ${podeExcluirLeads() ? `<button class="delete-link" data-action="leads-bulk-excluir">🗑 Excluir</button>` : ''}
        <button class="icon-btn" data-action="leads-bulk-limpar" title="Cancelar seleção" style="margin-left:auto;">✕</button>
      </div>
    ` : ''}

    <div class="leads-table-wrap">
      <table class="leads-table">
        <thead>
          <tr>
            <th style="width:34px;"><span class="check-circle ${todosSelecionados?'checked':''}" data-action="leads-select-all">${todosSelecionados?ICON_CHECK:''}</span></th>
            <th>Nome</th><th>Contato</th><th>Etapa</th><th>Valor</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${leads.length ? leads.map(c=>{
            const col = board.columns.find(k=>k.id===c.columnId);
            const tipo = col ? (TIPOS[col.tipo] || TIPOS.aberto) : TIPOS.aberto;
            const marcado = leadsSelecionados.has(c.id);
            return `
              <tr class="${marcado?'lead-row-selecionada':''}">
                <td><span class="check-circle ${marcado?'checked':''}" data-action="leads-select-um" data-card-id="${c.id}">${marcado?ICON_CHECK:''}</span></td>
                <td class="clickable" data-action="open-edit-card" data-card-id="${c.id}">${c.tipoPessoa==='juridica' ? '🏢 ' : ''}${esc(c.cliente) || 'Sem nome'}</td>
                <td class="clickable" data-action="open-edit-card" data-card-id="${c.id}">${c.telefone ? esc(c.telefone) : '—'}</td>
                <td class="clickable" data-action="open-edit-card" data-card-id="${c.id}"><span class="badge" style="color:${tipo.color};background:${tipo.bg};${tipo.strike?'text-decoration:line-through;':''}">${col ? esc(col.nome) : '—'}</span></td>
                <td class="clickable" data-action="open-edit-card" data-card-id="${c.id}">${fmtBRL(c.valor)}</td>
                <td>
                  <div class="leads-row-actions">
                    ${c.telefone ? `<button class="icon-btn" data-action="open-whatsapp" data-phone="${esc(c.telefone)}" title="WhatsApp">${WA_ICON}</button>` : ''}
                  </div>
                </td>
              </tr>
            `;
          }).join('') : `<tr class="leads-empty-row"><td colspan="6">Nenhum lead encontrado. Cadastre o primeiro no botão "Novo lead".</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

/* ---------- página: Tarefas ---------- */
function closeAgendaDiaModal(){
  agendaDiaSelecionado = null;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
// Redesenha o modal do dia preservando a posição de rolagem da linha do tempo —
// usado depois de ações que não deveriam "pular" a visão de volta pro topo
// (colar, copiar, marcar como concluída).
function renderAgendaDiaModalPreservandoScroll(){
  const timelineEl = document.getElementById('agenda-dia-timeline');
  const scrollAnterior = timelineEl ? timelineEl.scrollTop : null;
  renderAgendaDiaModal();
  if(scrollAnterior!==null){
    const timelineEl2 = document.getElementById('agenda-dia-timeline');
    if(timelineEl2) timelineEl2.scrollTop = scrollAnterior;
  }
}
function renderAgendaDiaModal(){
  const root = document.getElementById('modal-root');
  if(!agendaDiaSelecionado){ root.innerHTML=''; return; }
  const diaISO = agendaDiaSelecionado;
  const { tarefasDoDia, eventosDoDia } = itensDoDiaAgenda(diaISO);
  const dataObj = new Date(diaISO + 'T00:00:00');
  const dataLabel = dataObj.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' });

  function horaDaTarefa(t){
    const d = new Date(t.vencimento);
    if(isNaN(d.getTime()) || (d.getUTCHours()===0 && d.getUTCMinutes()===0)) return null;
    return d.getHours();
  }
  function horaDoEvento(e){
    if(e.diaInteiro || !e.inicio) return null;
    const d = new Date(e.inicio);
    return isNaN(d.getTime()) ? null : d.getHours();
  }

  const tarefasSemHora = tarefasDoDia.filter(t=>horaDaTarefa(t)===null);
  const eventosSemHora = eventosDoDia.filter(e=>horaDoEvento(e)===null);
  const porHora = Array.from({length:24}, ()=>({ tarefas:[], eventos:[] }));
  tarefasDoDia.forEach(t=>{ const h=horaDaTarefa(t); if(h!==null) porHora[h].tarefas.push(t); });
  eventosDoDia.forEach(e=>{ const h=horaDoEvento(e); if(h!==null) porHora[h].eventos.push(e); });

  function renderTarefaMini(t){
    return `
      <div class="agenda-dia-item" data-copiar-tarefa="${t.id}">
        <span class="check-circle ${t.concluida?'checked':''}" data-task-toggle="${t.id}">${t.concluida?ICON_CHECK:''}</span>
        <div style="flex:1;">
          <div class="agenda-dia-item-titulo ${t.concluida?'concluida':''}">${esc(t.titulo)}</div>
          ${t.clienteNome ? `<div class="agenda-dia-item-hora">👤 ${esc(t.clienteNome)}</div>` : ''}
        </div>
        <button class="icon-btn" data-task-edit="${t.id}" title="Editar">${ICON_EDIT}</button>
      </div>
    `;
  }
  function renderEventoMini(e){
    return `<div class="agenda-hora-evento" data-copiar-evento="${e.id}" data-editar-evento="${e.id}">📅 ${esc(e.titulo)}${e.clienteNome ? ` <span style="opacity:.7;">· 👤 ${esc(e.clienteNome)}</span>` : ''}</div>`;
  }

  const horaAtual = new Date().getHours();

  root.innerHTML = `
    <div class="overlay" id="agenda-dia-overlay">
      <div class="modal agenda-dia-modal">
        <div class="modal-head">
          <h3 style="text-transform:capitalize;">${esc(dataLabel)}</h3>
          <button id="agenda-dia-close">✕</button>
        </div>
        <div class="modal-body">
          ${tarefaCopiada ? `
            <div class="agenda-clipboard-hint">
              <span>Copiado: <b>${esc(tarefaCopiada.titulo)}</b> — ${modoSelecaoMultipla ? `selecione os horários e clique em "Colar" (${horariosSelecionados.size} marcado${horariosSelecionados.size===1?'':'s'})` : 'clique num horário vazio pra colar aqui'}</span>
              <button class="btn-outline" data-action="toggle-selecao-multipla">${modoSelecaoMultipla ? 'Cancelar seleção' : '☑ Selecionar vários'}</button>
              <button class="icon-btn" data-action="cancelar-tarefa-copiada" title="Cancelar cópia">✕</button>
            </div>
          ` : ''}
          ${(tarefasSemHora.length || eventosSemHora.length) ? `
            <div class="settings-page-subtitle">Sem horário definido</div>
            ${eventosSemHora.map(e=>`
              <div class="agenda-dia-item" data-copiar-evento="${e.id}" data-editar-evento="${e.id}">
                <span class="check-circle ${e.concluida?'checked':''}" data-evento-toggle="${e.id}">${e.concluida?ICON_CHECK:''}</span>
                <div class="agenda-dia-item-titulo" style="flex:1;">${esc(e.titulo)}</div>
              </div>
            `).join('')}
            ${tarefasSemHora.map(renderTarefaMini).join('')}
            <div class="settings-sep-line"></div>
          ` : ''}
          <div class="agenda-dia-timeline" id="agenda-dia-timeline">
            ${porHora.map((conteudo, h)=>{
              const horaStr = `${String(h).padStart(2,'0')}:00`;
              const selecionada = horariosSelecionados.has(horaStr);
              return `
              <div class="agenda-hora-row ${h===horaAtual?'agenda-hora-atual':''} ${tarefaCopiada?'agenda-hora-colavel':''} ${selecionada?'agenda-hora-selecionada':''}" id="agenda-hora-${h}" data-action="nova-tarefa-nesta-hora" data-hora="${horaStr}">
                <span class="agenda-hora-label">${horaStr}</span>
                <div class="agenda-hora-conteudo">
                  ${conteudo.eventos.map(renderEventoMini).join('')}
                  ${conteudo.tarefas.map(t=>`
                    <span class="agenda-hora-tarefa ${t.concluida?'concluida':''}" data-task-edit-hora="${t.id}" data-copiar-tarefa="${t.id}">✓ ${esc(t.titulo)}</span>
                  `).join('')}
                  ${tarefaCopiada ? `<span class="agenda-hora-colar-hint">${modoSelecaoMultipla ? (selecionada?'✓ Selecionado':'+ Selecionar') : '+ Colar aqui'}</span>` : ''}
                </div>
              </div>
            `;}).join('')}
          </div>
        </div>
        <div class="modal-foot">
          ${(tarefasDoDia.length || eventosDoDia.length) ? `<button class="delete-link" id="agenda-dia-excluir-tudo">🗑 Excluir tudo desse dia</button>` : '<span></span>'}
          <div class="modal-foot-actions">
            ${modoSelecaoMultipla
              ? `<button class="btn-save" id="agenda-dia-colar-selecionados" ${horariosSelecionados.size===0?'disabled':''}>📥 Colar em ${horariosSelecionados.size} horário${horariosSelecionados.size===1?'':'s'}</button>`
              : `<button class="btn-save" id="agenda-dia-nova-tarefa">${tarefaCopiada ? 'Colar aqui' : '+ Nova tarefa nesse dia'}</button>`
            }
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('agenda-dia-close').addEventListener('click', closeAgendaDiaModal);
  document.getElementById('agenda-dia-overlay').addEventListener('click', (e)=>{ if(e.target.id==='agenda-dia-overlay') closeAgendaDiaModal(); });
  const excluirTudoBtn = document.getElementById('agenda-dia-excluir-tudo');
  if(excluirTudoBtn) excluirTudoBtn.addEventListener('click', ()=> excluirTudoDoDia(diaISO, tarefasDoDia, eventosDoDia));
  const novaTarefaBtn = document.getElementById('agenda-dia-nova-tarefa');
  if(novaTarefaBtn) novaTarefaBtn.addEventListener('click', ()=>{
    if(tarefaCopiada){ colarTarefaEm(diaISO); return; }
    closeAgendaDiaModal();
    openNewTask(diaISO);
  });
  const toggleSelecaoBtn = root.querySelector('[data-action="toggle-selecao-multipla"]');
  if(toggleSelecaoBtn) toggleSelecaoBtn.addEventListener('click', ()=>{
    modoSelecaoMultipla = !modoSelecaoMultipla;
    horariosSelecionados.clear();
    renderAgendaDiaModal();
  });
  const colarSelecionadosBtn = document.getElementById('agenda-dia-colar-selecionados');
  if(colarSelecionadosBtn) colarSelecionadosBtn.addEventListener('click', colarEmHorariosSelecionados);
  root.querySelectorAll('[data-action="nova-tarefa-nesta-hora"]').forEach(row=>{
    row.addEventListener('click', ()=>{
      const hora = row.dataset.hora;
      if(modoSelecaoMultipla){
        if(horariosSelecionados.has(hora)) horariosSelecionados.delete(hora);
        else horariosSelecionados.add(hora);
        renderAgendaDiaModalPreservandoScroll();
        return;
      }
      if(tarefaCopiada){
        colarTarefaEm(diaISO, hora);
        return;
      }
      closeAgendaDiaModal();
      openNewTask(diaISO, hora);
    });
  });
  root.querySelectorAll('[data-task-edit-hora]').forEach(el=>{
    el.addEventListener('click', (e)=>{
      e.stopPropagation(); // não deixa o clique "vazar" pra linha da hora (que abriria nova tarefa)
      openEditTask(el.dataset.taskEditHora);
    });
  });
  root.querySelectorAll('[data-task-toggle]').forEach(el=>{
    el.addEventListener('click', async (e)=>{
      e.stopPropagation();
      await toggleTaskConcluida(el.dataset.taskToggle);
      renderAgendaDiaModalPreservandoScroll();
    });
  });
  root.querySelectorAll('[data-evento-toggle]').forEach(el=>{
    el.addEventListener('click', async (e)=>{
      e.stopPropagation();
      await toggleEventoConcluido(el.dataset.eventoToggle);
      renderAgendaDiaModalPreservandoScroll();
    });
  });
  root.querySelectorAll('[data-task-edit]').forEach(el=>{
    el.addEventListener('click', ()=>{
      openEditTask(el.dataset.taskEdit);
    });
  });
  ligarGestoDeCopiar(root.querySelectorAll('[data-copiar-tarefa]'), (el)=> copiarTarefa(el.dataset.copiarTarefa, el));
  ligarGestoDeCopiar(root.querySelectorAll('[data-copiar-evento]'), (el)=> copiarEvento(el.dataset.copiarEvento, el));
  root.querySelectorAll('[data-editar-evento]').forEach(el=>{
    el.addEventListener('click', (e)=>{
      e.stopPropagation(); // não deixa o clique vazar pra linha da hora (que abriria nova tarefa em branco)
      openEditEventoGoogle(el.dataset.editarEvento);
    });
  });
  const cancelarCopiaBtn = root.querySelector('[data-action="cancelar-tarefa-copiada"]');
  if(cancelarCopiaBtn) cancelarCopiaBtn.addEventListener('click', cancelarTarefaCopiada);

  // Rola a linha do tempo até perto da hora atual (ou a 1ª hora com algo marcado, se for antes)
  const primeiraComItem = porHora.findIndex(c=>c.tarefas.length||c.eventos.length);
  const horaAlvo = primeiraComItem !== -1 && primeiraComItem < horaAtual ? primeiraComItem : horaAtual;
  const linhaAlvo = document.getElementById(`agenda-hora-${Math.max(0, horaAlvo-1)}`);
  if(linhaAlvo) linhaAlvo.scrollIntoView({ block:'start' });
}

function renderTarefasPage(){
  const abas = [['calendario','Calendário'],['gerot','GEROT']];
  return `
    <div class="page-head">
      <div>
        <h1>Agenda/Tarefas</h1>
        <p>Tarefas do CRM, compromissos do Google Agenda e sua rotina semanal</p>
      </div>
      ${agendaSubTab==='calendario' ? `
        <div class="page-head-actions">
          ${calendarConnected ? `<button class="btn-outline" data-action="sync-calendar-now" ${calendarSyncing?'disabled':''}>${calendarSyncing?'Sincronizando…':'📅 Sincronizar Agenda'}</button>` : ''}
          <button class="btn-primary" data-action="open-new-task">+ Nova tarefa</button>
        </div>
      ` : ''}
    </div>
    <div class="funil-tabs" style="margin-bottom:20px;">
      ${abas.map(([key,label])=>`<button class="tab-btn ${agendaSubTab===key?'active':''}" data-action="set-agenda-subtab" data-subtab="${key}">${label}</button>`).join('')}
    </div>
    ${agendaSubTab==='calendario' ? renderCalendarioConteudo() : renderGerotConteudo()}
  `;
}
const GEROT_DIAS = ['Segunda','Terça','Quarta','Quinta','Sexta'];
const GEROT_HORARIOS = (()=>{ const lista=[]; for(let h=8; h<=19; h++){ lista.push(`${String(h).padStart(2,'0')}:00`); if(h<19) lista.push(`${String(h).padStart(2,'0')}:30`); } return lista; })();
const GEROT_LIMITES = [...GEROT_HORARIOS, '19:30']; // 24 limites (23 horários de início + o fim do último bloco) — usado pra calcular quantas linhas um bloco ocupa

// Monta, pra cada dia, um mapa horário -> { tipo: 'inicio'|'coberto'|'vazio', bloco, rowspan }.
// "inicio" é onde a célula mesclada nasce (rowspan cobre o resto); "coberto" são as
// linhas por baixo dela, que não desenham nada (já fazem parte da célula de cima).
function calcularGradeGerot(){
  const grade = {};
  for(let diaIdx=0; diaIdx<5; diaIdx++){
    grade[diaIdx] = {};
    GEROT_HORARIOS.forEach(h => grade[diaIdx][h] = { tipo:'vazio' });
    gerotBlocos.filter(b=>b.diaSemana===diaIdx).forEach(b=>{
      const idxInicio = GEROT_HORARIOS.indexOf(b.horarioInicio);
      const idxFim = GEROT_LIMITES.indexOf(b.horarioFim);
      if(idxInicio===-1 || idxFim===-1 || idxFim<=idxInicio) return;
      const rowspan = idxFim - idxInicio;
      grade[diaIdx][b.horarioInicio] = { tipo:'inicio', bloco:b, rowspan };
      for(let i=1;i<rowspan;i++) grade[diaIdx][GEROT_HORARIOS[idxInicio+i]] = { tipo:'coberto' };
    });
  }
  return grade;
}
function renderGerotConteudo(){
  const [ano,mes,dia] = gerotSemanaAtual.split('-').map(Number);
  const segunda = new Date(ano, mes-1, dia);
  const datasDaSemana = GEROT_DIAS.map((_,i)=>{ const d = new Date(segunda); d.setDate(d.getDate()+i); return d; });
  const labelSemana = `${datasDaSemana[0].toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})} a ${datasDaSemana[4].toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}`;
  const grade = calcularGradeGerot();

  return `
    <div class="settings-page-section" style="margin-bottom:16px;">
      <p class="settings-page-note">Sua rotina semanal — planeje o que fazer em cada horário, de segunda a sexta. Diferente do calendário, isso não é sobre um dia específico: pense nela como um "molde" da sua semana ideal, que você ajusta quando precisar. Clique num horário livre pra criar um bloco (pode escolher até que horas ele vai), ou num bloco já preenchido pra editar.</p>
    </div>
    <div class="month-step-nav" style="margin-bottom:10px;">
      <button class="icon-btn" data-action="gerot-semana" data-delta="-1" title="Semana anterior">‹</button>
      <span>${labelSemana}</span>
      <button class="icon-btn" data-action="gerot-semana" data-delta="1" title="Próxima semana">›</button>
      <button class="btn-outline" data-action="gerot-hoje" style="margin-left:10px;">Essa semana</button>
      <button class="btn-outline" data-action="gerot-copiar-semana" style="margin-left:auto;" ${gerotCopiando?'disabled':''}>${gerotCopiando?'Copiando…':'📋 Copiar semana anterior'}</button>
    </div>
    <div style="display:flex; gap:8px; justify-content:flex-end; margin-bottom:16px;">
      <button class="btn-outline" data-action="gerot-exportar-planilha">⬇️ Exportar planilha</button>
      <input type="file" id="gerot-importar-input" accept=".xlsx,.xls" style="display:none;" />
      <button class="btn-outline" data-action="gerot-importar-planilha" ${gerotImportando?'disabled':''}>${gerotImportando?'Importando…':'⬆️ Importar planilha'}</button>
    </div>
    ${gerotImportMsg ? `<p class="settings-page-msg ${gerotImportMsg.tipo}" style="margin-bottom:14px;">${esc(gerotImportMsg.texto)}</p>` : ''}
    ${!gerotLoaded ? `<p class="settings-page-note">Carregando…</p>` : `
      <div class="gerot-grid-wrap">
        <table class="gerot-tabela">
          <thead>
            <tr>
              <th class="gerot-col-hora"></th>
              ${GEROT_DIAS.map((d,i)=>`<th>${d}<br><span class="gerot-data-cabecalho">${datasDaSemana[i].toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</span></th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${GEROT_HORARIOS.map(horario=>`
              <tr>
                <td class="gerot-col-hora">${horario}</td>
                ${GEROT_DIAS.map((_,diaIdx)=>{
                  const info = grade[diaIdx][horario];
                  if(info.tipo==='coberto') return '';
                  if(info.tipo==='inicio'){
                    const b = info.bloco;
                    return `<td class="gerot-celula gerot-celula-preenchida" rowspan="${info.rowspan}">
                      <button class="gerot-celula-btn" data-action="gerot-abrir-editor" data-dia="${diaIdx}" data-horario="${horario}" data-bloco-id="${b.id}">
                        <span class="gerot-bloco-horario">${b.horarioInicio}–${b.horarioFim}</span>
                        <span class="gerot-bloco-texto">${esc(b.texto)}</span>
                      </button>
                    </td>`;
                  }
                  return `<td class="gerot-celula"><button class="gerot-celula-btn" data-action="gerot-abrir-editor" data-dia="${diaIdx}" data-horario="${horario}"></button></td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${gerotEditor ? renderGerotEditorHtml() : ''}
    `}
  `;
}
function renderCalendarioConteudo(){
  if(!agendaLoaded){
    return `<p class="settings-page-note">Carregando…</p>`;
  }
  const [ano, mesNum] = agendaMesAtual.split('-').map(Number);
  const primeiroDia = new Date(ano, mesNum-1, 1);
  const diasNoMes = new Date(ano, mesNum, 0).getDate();
  const offsetInicio = primeiroDia.getDay(); // 0 = domingo
  const hojeISO = new Date().toISOString().slice(0,10);
  const semData = agendaTarefas.filter(t=>!t.vencimento);

  let celulas = [];
  for(let i=0;i<offsetInicio;i++) celulas.push(null);
  for(let d=1; d<=diasNoMes; d++) celulas.push(d);
  while(celulas.length % 7 !== 0) celulas.push(null);

  return `
    ${tarefaCopiada ? `
      <div class="agenda-clipboard-hint" style="margin-bottom:16px;">
        Copiado: <b>${esc(tarefaCopiada.titulo)}</b> — abra qualquer dia e clique num horário vazio pra colar
        <button class="icon-btn" data-action="cancelar-tarefa-copiada" title="Cancelar cópia">✕</button>
      </div>
    ` : ''}

    <div class="month-step-nav" style="margin-bottom:16px;">
      <button class="icon-btn" data-action="agenda-mes" data-delta="-1" title="Mês anterior">‹</button>
      <span>${monthLabel(agendaMesAtual, true)}</span>
      <button class="icon-btn" data-action="agenda-mes" data-delta="1" title="Próximo mês">›</button>
      <button class="btn-outline" data-action="agenda-hoje" style="margin-left:10px;">Hoje</button>
    </div>

    ${semData.length ? `
      <div class="agenda-sem-data">
        <span class="agenda-sem-data-label">Sem data:</span>
        ${semData.map(t=>`<button class="etiqueta-pill" data-action="open-edit-task" data-task-id="${t.id}">${esc(t.titulo)}</button>`).join('')}
      </div>
    ` : ''}

    <div class="agenda-grid">
      ${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d=>`<div class="agenda-grid-header">${d}</div>`).join('')}
      ${celulas.map(dia=>{
        if(dia===null) return `<div class="agenda-cell agenda-cell-vazia"></div>`;
        const diaISO = `${ano}-${String(mesNum).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        const { tarefasDoDia, eventosDoDia } = itensDoDiaAgenda(diaISO);
        const totalItens = tarefasDoDia.length + eventosDoDia.length;
        const itensPreview = [
          ...eventosDoDia.map(e=>({tipo:'evento', texto: e.diaInteiro ? e.titulo : `${e.titulo}${e.inicio ? ' - '+formatHora(e.inicio) : ''}`})),
          ...tarefasDoDia.map(t=>({tipo:'tarefa', texto: t.titulo, concluida: t.concluida})),
        ].slice(0,3);
        const isHoje = diaISO === hojeISO;
        return `
          <div class="agenda-cell ${isHoje?'agenda-cell-hoje':''} ${totalItens?'tem-itens':''} ${diaISO===agendaDiaDestacado?'agenda-cell-destacada':''}" data-action="abrir-dia-agenda" data-dia="${diaISO}">
            <span class="agenda-cell-numero">${dia}</span>
            ${totalItens ? `
              <div class="agenda-cell-itens">
                ${itensPreview.map(it=>`<div class="agenda-item-mini agenda-item-${it.tipo} ${it.concluida?'concluida':''}">${esc(it.texto)}</div>`).join('')}
                ${totalItens > 3 ? `<div class="agenda-item-mais">+${totalItens-3} mais</div>` : ''}
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* ---------- página: Comissões ---------- */
function renderComissoesPage(){
  if(!contratosLoaded){
    return `<div class="page-head"><div><h1>Comissões</h1><p>Carregando…</p></div></div>`;
  }
  const stats = comissoesStats();
  return `
    <div class="page-head">
      <div>
        <h1>Comissões</h1>
        <p>Previsão de recebimento por mês · ${monthLabel(comissoesMonth, true)}</p>
      </div>
      <div class="page-head-actions">
        <div class="month-step-nav">
          <button class="icon-btn" data-action="comissoes-mes" data-delta="-1" title="Mês anterior">‹</button>
          <span>${monthLabel(comissoesMonth, true)}</span>
          <button class="icon-btn" data-action="comissoes-mes" data-delta="1" title="Próximo mês">›</button>
        </div>
        ${renderBotaoOrdenar('comissoes', comissoesOrdenarPor, null, true)}
        <button class="icon-btn" data-action="open-regras-comissao" title="Regras de comissão">${ICON_SETTINGS}</button>
        <button class="btn-primary" data-action="open-new-contrato">+ Novo contrato</button>
      </div>
    </div>

    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-card-top"><span>Previsto este mês</span></div>
        <div class="metric-value">${fmtBRL(stats.previstoMes)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-top"><span>Total ativo a receber</span></div>
        <div class="metric-value">${fmtBRL(stats.totalAtivo)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-top"><span>Contratos cadastrados</span></div>
        <div class="metric-value">${stats.total}</div>
      </div>
    </div>

    ${contratos.length ? `
      <div class="contratos-list">
        ${ordenarPorCriterio(contratos, comissoesOrdenarPor, 'desc', null, 'date').map(c=>renderContratoCard(c)).join('')}
      </div>
    ` : `<div class="tasks-empty">Nenhum contrato de comissão cadastrado ainda.</div>`}
  `;
}

function renderContratoCard(c){
  const anchor = (c.date||'').slice(0,7);
  const idx = monthsBetween(anchor, comissoesMonth);
  const idxCancelamento = contratoIdxCancelamento(c);
  const parcelaAtual = Math.min(Math.max(idx+1, 0), c.parcelas, idxCancelamento===Infinity?c.parcelas:idxCancelamento);
  const limiteBarra = Math.min(c.parcelas, idxCancelamento);
  const pct = Math.max(0, Math.min(1, idx / limiteBarra));
  const status = c.canceladoNoMes
    ? `Cancelado a partir de ${monthLabel(c.canceladoNoMes, true)}`
    : (idx >= c.parcelas ? 'Contrato quitado' : idx < 0 ? 'Ainda não iniciado' : `Parcela ${parcelaAtual}/${c.parcelas} este mês`);
  const escopo = ESCOPOS[c.scope] || ESCOPOS.Pessoal;
  // contratos novos guardam o detalhe completo em "blocos" (N linhas, da regra usada);
  // contratos criados antes das regras editáveis não têm isso e caem no formato antigo
  const p2 = c.parcelas - c.parcelas1;
  const blocosHtml = (Array.isArray(c.blocos) && c.blocos.length)
    ? c.blocos.map(b=>`<div>🔹 ${b.parcelas} parcela${b.parcelas===1?'':'s'} de ${fmtBRL(b.value)} cada</div>`).join('')
    : (p2 > 0
      ? `<div>🔹 ${c.parcelas1} parcela${c.parcelas1===1?'':'s'} de ${fmtBRL(c.value)} cada</div><div>🔹 ${p2} parcela${p2===1?'':'s'} de ${fmtBRL(c.value2)} cada</div>`
      : `<div>🔹 ${c.parcelas1} parcela${c.parcelas1===1?'':'s'} de ${fmtBRL(c.value)} cada</div>`);
  return `
    <div class="contrato-card ${c.canceladoNoMes?'contrato-card-cancelado':''}">
      <div class="contrato-card-head">
        <div>
          <h3 class="contrato-card-title">${esc(c.desc)}</h3>
          <p class="contrato-card-note">
            <span class="badge" style="color:${escopo.color};background:${escopo.bg}">${escopo.label}</span>
            <span>· ${c.parcelas}x parcelas · Carta de crédito: ${fmtBRL(c.creditoValor)}</span>
            ${c.geradoAutomaticamente ? `<span class="badge badge-neutral" title="Criada automaticamente quando o cliente entrou numa coluna de fechamento no Pipeline">⚡ Gerada pelo Pipeline</span>` : ''}
            ${c.canceladoNoMes ? `<span class="badge" style="color:var(--danger);background:var(--danger-soft)">Cancelado</span>` : ''}
          </p>
        </div>
        <div class="contrato-card-actions">
          <button class="icon-btn" data-action="${c.canceladoNoMes?'reativar-contrato':'cancelar-contrato'}" data-contrato-id="${c.id}" title="${c.canceladoNoMes?'Reativar comissão':'Marcar como cancelada'}">${c.canceladoNoMes?ICON_REATIVAR:ICON_CANCELAR}</button>
          <button class="icon-btn" data-action="open-edit-contrato" data-contrato-id="${c.id}" title="Editar">${ICON_EDIT}</button>
          <button class="icon-btn" data-action="delete-contrato" data-contrato-id="${c.id}" title="Excluir">${ICON_TRASH}</button>
        </div>
      </div>
      <div class="contrato-card-blocks">
        ${blocosHtml}
        <div class="contrato-card-total">Total líquido da comissão: ${fmtBRL(contratoTotal(c))}</div>
      </div>
      <div class="stage-bar-track"><div class="stage-bar-fill" style="width:${pct*100}%"></div></div>
      <div class="contrato-card-status">
        <span>${status}</span>
        <span>Início: ${monthLabel(anchor, true)}</span>
      </div>
    </div>
  `;
}

/* ---------- página: Configurações ---------- */
const CONFIG_CATEGORIAS = [
  { grupo: 'Conta', itens: [
    ['perfil', 'Seu perfil'],
    ['seguranca', 'Login e segurança'],
    ['aparencia', 'Aparência'],
    ['notificacoes', 'Notificações'],
  ]},
  { grupo: 'Integrações', itens: [
    ['whatsapp', 'WhatsApp Business'],
    ['google-agenda', 'Google Agenda'],
    ['instagram', 'Instagram'],
    ['email', 'E-mail'],
    ['webhooks', 'Webhooks'],
    ['agendamento', 'Link de agendamento'],
  ]},
  { grupo: 'Dados', itens: [
    ['campos', 'Campos personalizados'],
    ['importar', 'Importar leads'],
  ]},
  { grupo: 'Sistema', itens: [
    ['manutencao', 'Manutenção'],
  ]},
];

function renderConfigPerfil(){
  const temFoto = !!(currentUser && currentUser.avatarUrl);
  return `
    <div class="settings-page-section">
      <h3>Seu perfil</h3>
      <div class="avatar-upload-row">
        <div class="avatar-preview avatar-preview-interativo" id="avatar-preview" title="${temFoto?'Segure pra ver a foto · clique pra trocar':'Clique pra adicionar uma foto'}">
          ${temFoto ? `<img src="${currentUser.avatarUrl}" alt="Foto de perfil" />` : esc(iniciaisDoNome((currentUser&&currentUser.nome)||''))}
          <div class="avatar-hover-overlay">${ICON_CAMERA}</div>
        </div>
        <div>
          <input type="file" id="avatar-input" accept="image/png,image/jpeg,image/webp" style="display:none;" />
          <div class="settings-btn-row">
            <button class="btn-outline" data-action="abrir-editar-perfil" ${avatarSalvando?'disabled':''}>${avatarSalvando?'Enviando…':'Editar perfil'}</button>
            ${temFoto ? `<button class="btn-outline" id="avatar-remover-btn" ${avatarSalvando?'disabled':''}>Remover foto</button>` : ''}
          </div>
          <p class="settings-page-note">Clique na foto pra trocar${temFoto?', ou segure pra ver ela maior':''}.</p>
        </div>
      </div>
      ${avatarMsg ? `<p class="settings-page-msg ${avatarMsg.tipo}">${esc(avatarMsg.texto)}</p>` : ''}
      <div class="settings-page-row"><span>Nome</span><span>${esc((currentUser && currentUser.nome) || '—')}</span></div>
      <div class="settings-page-row"><span>E-mail</span><span>${esc((currentUser && currentUser.email) || '—')}</span></div>

      <div class="settings-sep-line"></div>

      <div class="settings-page-subtitle">Sessões ativas</div>
      <p class="settings-page-note">Desconecte todos os dispositivos onde você está logado — útil se perdeu um aparelho ou compartilhou sua senha. Você vai precisar entrar de novo aqui também.</p>
      ${logoutAllMsg ? `<p class="settings-page-msg ${logoutAllMsg.tipo}">${esc(logoutAllMsg.texto)}</p>` : ''}
      <button class="btn-danger" data-action="desconectar-todos" ${logoutAllEnviando?'disabled':''}>${logoutAllEnviando?'Desconectando…':'Desconectar todos os dispositivos'}</button>
    </div>
  `;
}

function renderConfigSeguranca(){
  return `
    <div class="settings-page-section">
      <h3>Login e segurança</h3>
      <div class="settings-page-row">
        <span>Senha</span>
        <button class="btn-outline" data-action="abrir-alterar-senha">Mudar senha</button>
      </div>

      <div class="settings-sep-line"></div>

      <div class="settings-page-subtitle">Verificação em duas etapas (2FA)</div>
      ${renderSecao2FA()}

      <div class="settings-sep-line"></div>

      <button class="settings-page-row auditoria-toggle" data-action="toggle-auditoria" style="width:100%; border:none; border-bottom:1px solid var(--line); background:none; cursor:pointer; font-family:inherit;">
        <span class="settings-page-subtitle" style="margin:0;">Log de auditoria</span>
        <span class="auditoria-toggle-seta ${auditoriaExpandida?'aberta':''}">▾</span>
      </button>
      ${auditoriaExpandida ? `
        <p class="settings-page-note">Últimos eventos de segurança da sua conta.</p>
        ${!auditoriaCarregada ? `<p class="settings-page-note">Carregando…</p>` : (auditoriaEventos.length ? `
          <div class="historico-lista">
            ${auditoriaEventos.map(e=>`
              <div class="historico-item">
                <span class="historico-item-texto">${esc(e.detalhe || e.acao)}</span>
                <span class="historico-item-data">${formatDateHora(e.createdAt)}</span>
              </div>
            `).join('')}
          </div>
        ` : `<p class="dash-empty">Nenhum evento registrado ainda.</p>`)}
      ` : ''}
    </div>
  `;
}

function renderConfigAparencia(){
  return `
    <div class="settings-page-section">
      <h3>Modo noturno e cor de destaque</h3>
      <label class="settings-toggle-row">
        <span>Modo noturno</span>
        <span class="switch ${getDarkMode()?'on':''}" data-action="toggle-dark-mode">
          <span class="switch-knob"></span>
        </span>
      </label>
      <div class="settings-page-subtitle">Cor de destaque</div>
      <div class="theme-swatches">
        ${ACCENT_PRESETS.map(cor=>`<button class="theme-swatch ${getAccentColor().toLowerCase()===cor.toLowerCase()?'active':''}" data-action="set-accent" data-color="${cor}" style="background:${cor}" title="${cor}"></button>`).join('')}
      </div>
      <label class="theme-custom-label">
        Outra cor
        <input type="color" id="theme-custom-input" value="${getAccentColor()}" />
      </label>
    </div>
  `;
}

function renderConfigWhatsapp(){
  return `
    <div class="settings-page-section">
      <h3>WhatsApp Business API</h3>
      <div class="settings-page-row">
        <span>Status</span>
        <span>${whatsappConnected ? '✓ Conectado' : 'Não conectado'}</span>
      </div>
      ${whatsappConnected ? `
        <p class="settings-page-note">Conversas ficam registradas dentro do card de cada cliente. Pra reconfigurar, desconecte e conecte de novo com os dados atualizados.</p>
        ${whatsappProvedor==='ycloud' ? `
        <div class="settings-page-row"><span>Provedor</span><span>YCloud</span></div>
        ${whatsappYcloudWebhookPath ? `
        <div class="field">
          <label>Endereço do webhook (cole na YCloud)</label>
          <input type="text" readonly value="${esc(location.origin + whatsappYcloudWebhookPath)}" onclick="this.select()" />
        </div>
        <p class="settings-page-note">Na YCloud: Developers → Webhooks → criar endpoint com esse endereço, marcando os eventos <b>whatsapp.inbound_message.received</b>, <b>whatsapp.message.updated</b> e <b>whatsapp.smb.message.echoes</b> (o que você digita no celular). Para histórico e alertas, marque também <b>whatsapp.smb.history</b>, <b>whatsapp.template.reviewed</b>, <b>whatsapp.phone_number.quality_updated</b>, <b>whatsapp.business_account.updated</b> e <b>whatsapp.business_account.reviewed</b>. Depois de criar, a YCloud mostra o secret (whsec_…): clique em “Adicionar secret” abaixo.</p>` : ''}
        <div class="settings-page-row">
          <span>Secret do webhook</span>
          <span style="display:flex;align-items:center;gap:10px;">
            <span class="${whatsappYcloudSecretOk?'':'wa-secret-pendente'}" style="font-size:12px;">${whatsappYcloudSecretOk ? '✓ Secret adicionado' : '⚠️ Secret ainda não adicionado'}</span>
            <button class="btn-outline" data-action="abrir-ycloud-secret">${whatsappYcloudSecretOk ? 'Trocar secret' : 'Adicionar secret'}</button>
          </span>
        </div>
        ` : ''}
        ${integracoesConfig.assistenteIA ? `
        <div class="settings-page-row">
          <span>Agente IA (responde clientes sozinho)</span>
          <span class="switch ${agenteIaAtivo?'on':''}" data-action="toggle-agente-ia" title="${agenteIaAtivo?'Ativado':'Desativado'}"><span class="switch-knob"></span></span>
        </div>
        ${agenteIaAtivo ? `<p class="settings-page-msg erro">⚠️ O agente está respondendo mensagens automaticamente, sem revisão sua. Ele fica em silêncio por 30 min sempre que você responder um cliente manualmente. Desative quando quiser assumir de vez.</p>` : `<p class="settings-page-note">Quando ativado, a IA responde sozinha as mensagens novas do WhatsApp — sem você revisar antes de enviar.</p>`}

        <div class="settings-sep-line"></div>

        <div class="settings-page-row">
          <span>IA proativa (sugestões automáticas)</span>
          <span class="switch ${iaProativaAtiva?'on':''}" data-action="toggle-ia-proativa" title="${iaProativaAtiva?'Ativada':'Desativada'}"><span class="switch-knob"></span></span>
        </div>
        <p class="settings-page-note">Analisa a conversa quando o cliente responde e deixa uma sugestão de mensagem e tarefa prontas no card — nunca envia nada sozinha, é sempre você quem decide usar.</p>
        ` : ''}

        <button class="btn-outline" data-action="desconectar-whatsapp">Desconectar</button>
      ` : `
        <div class="field">
          <label>Provedor</label>
          <select id="wa-provedor">
            <option value="meta" ${whatsappProvedorEscolhido==='meta'?'selected':''}>Meta (API oficial direta)</option>
            <option value="ycloud" ${whatsappProvedorEscolhido==='ycloud'?'selected':''}>YCloud</option>
          </select>
        </div>
        ${whatsappProvedorEscolhido==='ycloud' ? `
        <div class="field">
          <label>Número do WhatsApp conectado na YCloud</label>
          <input type="text" id="wa-yc-numero" placeholder="Ex: 5515988053447 (com DDI e DDD)" />
        </div>
        <div class="field">
          <label>API Key da YCloud</label>
          <input type="password" id="wa-yc-apikey" placeholder="Developers → API Keys" />
        </div>
        <div class="field">
          <label>Secret do webhook (whsec_…)</label>
          <input type="password" id="wa-yc-secret" placeholder="Mostrado pela YCloud ao criar o webhook" />
        </div>
        <p class="settings-page-note">Depois de conectar, o painel mostra o endereço do webhook pra você colar na YCloud. Pode deixar o secret em branco agora: a YCloud só mostra o secret depois de criar o endpoint, e você cola ele aqui depois de conectar.</p>
        ` : `
        <div class="field">
          <label>Phone Number ID</label>
          <input type="text" id="wa-phone-id" placeholder="Ex: 109xxxxxxxxxxxx" />
        </div>
        <div class="field">
          <label>Access Token</label>
          <input type="password" id="wa-token" placeholder="Token permanente gerado no Meta" />
        </div>
        <div class="field">
          <label>WABA ID (opcional)</label>
          <input type="text" id="wa-waba-id" placeholder="ID da conta comercial do WhatsApp" />
        </div>`}
        ${whatsappConfigMsg ? `<p class="settings-page-msg ${whatsappConfigMsg.tipo}">${esc(whatsappConfigMsg.texto)}</p>` : ''}
        <button class="btn-primary" data-action="salvar-whatsapp-config" ${whatsappSalvando?'disabled':''}>${whatsappSalvando?'Salvando…':'Conectar'}</button>
      `}
      <p class="settings-page-note">${whatsappProvedorEscolhido==='ycloud' ? 'Requer conta na YCloud com um número de WhatsApp conectado. Passo a passo no README.' : 'Requer conta comercial no Meta com o produto WhatsApp ativado. Passo a passo completo no README.'}</p>
    </div>

    <div class="settings-page-section">
      <h3>Menu de triagem (primeiro contato)</h3>
      <p class="settings-page-note">Quando alguém escreve pela primeira vez, manda esse menu automaticamente e move o lead pra coluna certa conforme a resposta (digitando o número da opção).</p>
      <div class="field">
        <label>Mensagem inicial</label>
        <textarea id="mt-mensagem" rows="3" placeholder="Ex: Oi! Sobre o que você quer falar?&#10;1 - Simulação&#10;2 - Já sou cliente&#10;3 - Outro assunto">${esc(menuTriagem.mensagemInicial)}</textarea>
      </div>
      <div class="mt-opcoes-lista">
        ${menuTriagem.opcoes.map((op, idx)=>renderMenuTriagemOpcao(op, idx)).join('')}
      </div>
      <button type="button" class="btn-outline" id="mt-add-opcao">+ Adicionar opção</button>

      <div class="settings-sep-line"></div>

      <div class="settings-page-row">
        <span>Ativar menu de triagem</span>
        <span class="switch ${menuTriagem.ativo?'on':''}" data-action="toggle-menu-triagem"><span class="switch-knob"></span></span>
      </div>
      ${menuTriagem.ativo ? `<p class="settings-page-msg erro">⚠️ O menu é enviado automaticamente pra qualquer contato novo, sem revisão sua.</p>` : ''}
      ${menuTriagemMsg ? `<p class="settings-page-msg ${menuTriagemMsg.tipo}">${esc(menuTriagemMsg.texto)}</p>` : ''}
      <button class="btn-primary" id="mt-salvar" ${menuTriagemSalvando?'disabled':''}>${menuTriagemSalvando?'Salvando…':'Salvar menu'}</button>
    </div>

    <div class="settings-page-section">
      <h3>Templates de mensagem</h3>
      <p class="settings-page-note">Crie modelos e envie pra aprovação da Meta. "Sincronizar" atualiza o status de cada um (aprovado, em análise ou rejeitado).</p>
      <div class="settings-btn-row">
        <button class="btn-outline" data-action="sincronizar-templates" ${templatesSincronizando?'disabled':''}>${templatesSincronizando?'Sincronizando…':'Sincronizar da Meta'}</button>
        <button class="btn-primary" data-action="open-new-template">+ Novo template</button>
      </div>
      ${templatesMsg ? `<p class="settings-page-msg ${templatesMsg.tipo}">${esc(templatesMsg.texto)}</p>` : ''}
      ${!templatesCarregados ? `<p class="settings-page-note">Carregando…</p>` : (templatesList.length ? `
        <div class="templates-list">
          ${templatesList.map(t=>`
            <div class="template-item">
              <span class="template-item-nome">${esc(t.nome)}</span>
              <span class="template-item-status template-status-${(t.status||'').toLowerCase()}">${statusTemplateLabel(t.status)}</span>
            </div>
          `).join('')}
        </div>
      ` : `<p class="dash-empty">Nenhum template ainda. Crie o primeiro pra começar.</p>`)}
    </div>
  `;
}

function renderConfigGoogleAgenda(){
  return `
    <div class="settings-page-section">
      <h3>Google Agenda</h3>
      <div class="settings-page-row">
        <span>Status</span>
        <span>${calendarConnected ? '✓ Conectada' : 'Não conectada'}</span>
      </div>
      ${calendarConnected
        ? `
          <div class="settings-btn-row">
            <button class="btn-outline" data-action="sync-calendar-now" ${calendarSyncing?'disabled':''}>${calendarSyncing?'Sincronizando…':'Sincronizar agora'}</button>
            <button class="btn-outline" data-action="disconnect-calendar">Desconectar</button>
          </div>
        `
        : (integracoesConfig.googleAgenda
          ? `<button class="btn-primary" data-action="connect-calendar">Conectar Google Agenda</button>`
          : `<p class="settings-page-note">Essa integração não está configurada neste servidor — use o link de agenda abaixo como alternativa (funciona com Google, Apple, Outlook e outros).</p>`)
      }
      <p class="settings-page-note">O botão do WhatsApp de abrir conversa já funciona em todos os clientes com telefone cadastrado, sem precisar conectar nada.</p>
    </div>
    <div class="settings-page-section">
      <h3>Agenda por link (.ics)</h3>
      <p class="settings-page-note">Gera um link que qualquer app de calendário (Google, Apple, Outlook…) pode "assinar" pra ver suas tarefas automaticamente — sem precisar conectar conta nenhuma. É a alternativa que não depende de nenhuma configuração especial deste servidor.</p>
      ${icsCarregando ? `<p class="settings-page-note">Carregando…</p>` : (icsStatus && icsStatus.ativo ? `
        <div class="field">
          <label>Seu link de agenda</label>
          <input type="text" id="ics-url" value="${esc(icsStatus.url)}" readonly onclick="this.select()" />
        </div>
        <div class="settings-btn-row">
          <button class="btn-outline" data-action="copiar-link-ics">Copiar link</button>
          <button class="btn-outline" data-action="gerar-link-ics" ${icsGerando?'disabled':''}>${icsGerando?'Gerando…':'Gerar novo link'}</button>
          <button class="btn-outline" data-action="revogar-link-ics">Revogar</button>
        </div>
      ` : `<button class="btn-primary" data-action="gerar-link-ics" ${icsGerando?'disabled':''}>${icsGerando?'Gerando…':'Gerar link de agenda'}</button>`)}
    </div>
  `;
}

function renderConfigInstagram(){
  return `
    <div class="settings-page-section">
      <h3>Instagram (captação de leads)</h3>
      <div class="settings-page-row">
        <span>Status</span>
        <span>${instagramConnected ? '✓ Conectado' : 'Não conectado'}</span>
      </div>
      ${instagramConnected ? `
        <p class="settings-page-note">Formulário de anúncio preenchido = lead novo automático. Mensagens diretas (DM) também chegam direto na aba Conversas, junto com as do WhatsApp.</p>
        <button class="btn-outline" data-action="desconectar-instagram">Desconectar</button>
      ` : `
        <div class="field">
          <label>Page ID</label>
          <input type="text" id="ig-page-id" placeholder="ID da sua Página do Facebook" />
        </div>
        <div class="field">
          <label>Access Token da página</label>
          <input type="password" id="ig-page-token" placeholder="Token com permissão leads_retrieval e instagram_manage_messages" />
        </div>
        <div class="field">
          <label>ID da conta comercial do Instagram (opcional, pra receber DMs)</label>
          <input type="text" id="ig-business-id" placeholder="ID da conta profissional do Instagram vinculada" />
        </div>
        ${instagramConfigMsg ? `<p class="settings-page-msg ${instagramConfigMsg.tipo}">${esc(instagramConfigMsg.texto)}</p>` : ''}
        <button class="btn-primary" data-action="salvar-instagram-config" ${instagramSalvando?'disabled':''}>${instagramSalvando?'Salvando…':'Conectar'}</button>
      `}
      <p class="settings-page-note">Requer o produto Marketing API no mesmo App do Meta usado no WhatsApp, com sua Página (e Instagram profissional vinculado) conectados. Passo a passo completo no README.</p>
    </div>
  `;
}

function renderConfigWebhooks(){
  return `
    <div class="settings-page-section">
      <h3>Webhooks (Zapier, Make, n8n...)</h3>
      <p class="settings-page-note">Conecte o painel com qualquer outra ferramenta que aceite receber um POST — Zapier ("Webhooks by Zapier"), Make, n8n, ou o que você já usa. Toda vez que o evento escolhido acontecer, mandamos os dados pra sua URL.</p>
      ${webhooksSaidaMsg ? `<p class="settings-page-msg ${webhooksSaidaMsg.tipo}">${esc(webhooksSaidaMsg.texto)}</p>` : ''}
      <div class="disparo-lista-leads" style="max-height:none; margin-bottom:12px;">
        ${webhooksSaida.length ? webhooksSaida.map(w=>`
          <div class="disparo-lead-item" style="cursor:default; flex-direction:column; align-items:stretch; gap:6px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span><b>${esc(w.nome||'Sem nome')}</b> ${!w.ativo?'<span class="settings-page-note">(pausado)</span>':''}</span>
              <div class="settings-btn-row">
                <button class="btn-outline" data-action="testar-webhook-saida" data-webhook-id="${w.id}">Testar</button>
                <button class="btn-outline" data-action="toggle-webhook-saida" data-webhook-id="${w.id}" data-ativo="${w.ativo?'0':'1'}">${w.ativo?'Pausar':'Ativar'}</button>
                <button class="delete-link" data-action="excluir-webhook-saida" data-webhook-id="${w.id}">🗑</button>
              </div>
            </div>
            <span class="settings-page-note" style="word-break:break-all;">${esc(w.url)}</span>
            <span class="settings-page-note">Eventos: ${w.eventos.map(ev=>ROTULOS_EVENTOS_WEBHOOK[ev]||ev).join(', ')}${w.ultimoEnvioEm?` · Último disparo: ${formatDateHora(w.ultimoEnvioEm)} (${w.ultimoEnvioStatus==='ok'?'✅':'⚠️'})`:''}</span>
          </div>
        `).join('') : '<p class="dash-empty">Nenhum webhook cadastrado ainda.</p>'}
      </div>
      <div class="field">
        <label>Nome (só pra identificar)</label>
        <input type="text" id="novo-webhook-nome" placeholder="Ex: Zapier - novo lead" />
      </div>
      <div class="field">
        <label>URL de destino</label>
        <input type="text" id="novo-webhook-url" placeholder="https://hooks.zapier.com/..." />
      </div>
      <div class="field">
        <label>Quando disparar</label>
        <div class="checkbox-group">
          ${Object.entries(ROTULOS_EVENTOS_WEBHOOK).map(([key,label])=>`
            <label class="checkbox-item"><input type="checkbox" class="novo-webhook-evento" value="${key}" /> ${label}</label>
          `).join('')}
        </div>
      </div>
      <button class="btn-outline" data-action="criar-webhook-saida">+ Adicionar webhook</button>
    </div>
  `;
}

function renderConfigAgendamento(){
  return `
    <div class="settings-page-section">
      <h3>Link de agendamento</h3>
      <p class="settings-page-note">Um link público onde o cliente escolhe um horário livre e marca sozinho — sem precisar trocar mensagem pra combinar dia e hora. Confere disponibilidade nas suas tarefas e, se conectado, no seu Google Agenda também.</p>
      ${agendamentoPublicoMsg ? `<p class="settings-page-msg ${agendamentoPublicoMsg.tipo}">${esc(agendamentoPublicoMsg.texto)}</p>` : ''}
      <div class="settings-page-row">
        <span>Ativar link de agendamento</span>
        <span class="switch ${agendamentoPublicoForm.ativo?'on':''}" data-action="toggle-agendamento-publico-ativo"><span class="switch-knob"></span></span>
      </div>
      ${agendamentoPublicoForm.ativo ? `
        <div class="settings-page-row">
          <span>Seu link</span>
          <span style="display:flex; gap:8px; align-items:center;">
            <span class="settings-page-note" style="font-family:'IBM Plex Mono',monospace;">${window.location.origin}/agendar/${currentUser.id}</span>
            <button class="btn-outline" data-action="copiar-link-agendamento">Copiar</button>
          </span>
        </div>
      ` : ''}
      <div class="field-row" style="margin-top:12px;">
        <div class="field"><label>Início do expediente</label><input type="time" id="ap-hora-inicio" value="${agendamentoPublicoForm.horaInicio}" /></div>
        <div class="field"><label>Fim do expediente</label><input type="time" id="ap-hora-fim" value="${agendamentoPublicoForm.horaFim}" /></div>
        <div class="field">
          <label>Duração de cada horário</label>
          <select id="ap-duracao">
            ${[15,30,45,60].map(min=>`<option value="${min}" ${agendamentoPublicoForm.duracaoMinutos===min?'selected':''}>${min} min</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <label>Dias da semana</label>
        <div class="checkbox-group" style="flex-direction:row; flex-wrap:wrap; gap:12px;">
          ${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((label,i)=>`
            <label class="checkbox-item"><input type="checkbox" class="ap-dia-semana" value="${i}" ${agendamentoPublicoForm.diasSemana.includes(i)?'checked':''}/> ${label}</label>
          `).join('')}
        </div>
      </div>
      <div class="field">
        <label>Cliente novo entra em qual coluna do funil?</label>
        <select id="ap-coluna-destino">
          <option value="">Não criar cliente novo automaticamente</option>
          ${board.columns.map(c=>`<option value="${c.id}" ${agendamentoPublicoForm.colunaDestinoId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
        </select>
      </div>
      <button class="btn-outline" data-action="salvar-agendamento-publico">Salvar</button>
    </div>
  `;
}

function renderConfigCampos(){
  return `
    <div class="settings-page-section">
      <h3>Campos personalizados</h3>
      <p class="settings-page-note">Campos extras que aparecem no modal de cada cliente (ex: CPF, data de nascimento).</p>
      ${!camposPersonalizadosCarregados ? `<p class="settings-page-note">Carregando…</p>` : (camposPersonalizados.length ? `
        <div class="campos-lista">
          ${camposPersonalizados.map(c=>`
            <div class="campo-item">
              <span>${esc(c.nome)} <span class="settings-page-note">(${c.tipo})</span></span>
              <button class="icon-btn" data-action="excluir-campo-personalizado" data-campo-id="${c.id}" title="Excluir">${ICON_TRASH}</button>
            </div>
          `).join('')}
        </div>
      ` : `<p class="dash-empty">Nenhum campo personalizado ainda.</p>`)}
      <div class="field-row" style="margin-top:12px;">
        <div class="field"><label>Nome do campo</label><input type="text" id="novo-campo-nome" value="${esc(novoCampoNome)}" placeholder="Ex: CPF" /></div>
        <div class="field">
          <label>Tipo</label>
          <select id="novo-campo-tipo">
            <option value="texto" ${novoCampoTipo==='texto'?'selected':''}>Texto</option>
            <option value="numero" ${novoCampoTipo==='numero'?'selected':''}>Número</option>
            <option value="data" ${novoCampoTipo==='data'?'selected':''}>Data</option>
          </select>
        </div>
      </div>
      ${camposPersonalizadosMsg ? `<p class="settings-page-msg ${camposPersonalizadosMsg.tipo}">${esc(camposPersonalizadosMsg.texto)}</p>` : ''}
      <button class="btn-outline" data-action="criar-campo-personalizado">+ Adicionar campo</button>
    </div>
  `;
}

function renderConfigImportar(){
  return `
    <div class="settings-page-section">
      <h3>Importar leads</h3>
      <p class="settings-page-note">Envie um arquivo CSV ou Excel (.xlsx) com as colunas <b>Nome, Telefone, Valor</b> (nessa ordem, cabeçalho na primeira linha).</p>
      <div class="field">
        <label>Coluna de destino</label>
        <select id="import-coluna">
          ${board.columns.map(c=>`<option value="${c.id}" ${importColumnId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Arquivo (CSV ou Excel)</label>
        <input type="file" id="import-arquivo" accept=".csv,text/csv,.xlsx,.xls" />
      </div>
      ${importResultado ? `<p class="settings-page-msg ok">${importResultado.sucesso} lead(s) importado(s)${importResultado.falha ? `, ${importResultado.falha} falharam` : ''}.</p>` : ''}
      <button class="btn-primary" id="import-btn" ${importando?'disabled':''}>${importando?'Importando…':'Importar'}</button>
    </div>
  `;
}

