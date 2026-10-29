// CRM · 10-paginas-crm.js — Visão geral, Negociações, Contatos, Agenda e Comissões. Os arquivos js/crm/ são carregados em ordem pelo index.html e
// compartilham as mesmas variáveis globais (é o antigo script.js dividido, como no CRM de consórcio).
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
  const eventosSemHoraDash = (agendaLoaded && !visualizandoDashboardDe && !atuandoComo) ? agendaEventosGoogle.filter(e=>e.diaInteiro && !e.concluida).map(e=>({ tipo:'evento', id:e.id, titulo:e.titulo, data:e.inicio })) : [];
  const abertas = [...tarefasSemHora, ...eventosSemHoraDash].sort((a,b)=> new Date(a.data||'2999-01-01') - new Date(b.data||'2999-01-01')).slice(0,5);

  return `
    ${visualizandoDashboardDe ? `
      <div class="dashboard-readonly-banner">
        <span>👁️ Você está vendo a visão geral de <b>${esc(visualizandoDashboardDe.nome)}</b> — somente leitura, nada aqui pode ser alterado.</span>
        <button type="button" class="btn-outline" data-action="sair-dashboard-membro">← Voltar</button>
      </div>
    ` : ''}
    <div class="page-head">
      <div>
        <h1>Visão geral</h1>
        <p>Como estão as suas vendas</p>
      </div>
      <div class="period-toggle">
        ${[['7dias','7 dias'],['mes','Mês'],['trimestre','Trimestre'],['ano','Ano']].map(([key,label])=>`
          <button class="tab-btn ${dashboardPeriod===key?'active':''}" data-action="set-dash-period" data-period="${key}">${label}</button>
        `).join('')}
      </div>
    </div>

    <div class="metric-grid" data-anim-grupo="dash-periodo" data-anim-troca="${dashboardPeriod}" data-anim-ordem="${['7dias','mes','trimestre','ano'].indexOf(dashboardPeriod)}">
      <div class="metric-card">
        <div class="metric-card-top"><span>Novos contatos</span><span class="metric-icon">${ICON_USERS}</span></div>
        <div class="metric-value">${m.novosLeads}</div>
        <div class="metric-sub">no período</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-top"><span>Em negociação</span><span class="metric-icon">${ICON_DOLLAR}</span></div>
        <div class="metric-value">${fmtBRL(m.emNegociacaoValor)}</div>
        <div class="metric-sub">${m.emNegociacaoCount} ${m.emNegociacaoCount===1?'negócio':'negócios'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-top"><span>Ganho</span><span class="metric-icon">${ICON_TROPHY}</span></div>
        <div class="metric-value">${fmtBRL(m.ganhoValor)}</div>
        <div class="metric-sub">${m.ganhoCount} fechados</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-top"><span>Aproveitamento</span><span class="metric-icon">${ICON_TREND}</span></div>
        <div class="metric-value">${m.conversao}%</div>
        <div class="metric-sub">das negociações encerradas viraram venda</div>
      </div>
    </div>

    <div class="dash-grid" style="margin-bottom:20px;">
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
        ${renderCabecalhoPainelDashboard('leads-captados', 'Novos contatos')}
        ${envolverConteudoPainel('leads-captados', renderLeadsChart())}
      </div>
      <div class="dash-panel">
        ${renderCabecalhoPainelDashboard('pipeline-etapa', 'Negociações por etapa')}
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
        ${renderCabecalhoPainelDashboard('ultimos-leads', 'Últimos contatos')}
        ${envolverConteudoPainel('ultimos-leads', recentes.length ? `<div class="recent-list">${recentes.map(c=>`
          <div class="recent-item"><span class="recent-name">${esc(c.cliente) || 'Sem nome'}</span><span class="recent-value">${fmtBRL(c.valor)}</span></div>
        `).join('')}</div>` : '<p class="dash-empty">Nenhum contato neste período.</p>')}
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
    return `<div class="page-head"><div><h1>Negociações</h1><p>Carregando…</p></div></div>`;
  }
  const months = monthsList();
  const funilAtual = funis.find(f=>f.id===funilAtualId);
  const columnsDoFunil = board.columns.filter(c=>c.funilId===funilAtualId);
  return `
    <div class="page-head">
      <div>
        <h1>Negociações</h1>
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
      <button class="tab-btn ${filtroEsfriando?'active':''}" data-action="toggle-esfriando" title="Contatos em aberto sem atividade há mais de 7 dias">🧊 Esfriando</button>
      <div class="pipeline-ordenar-row">
        ${pipelineOrdenando ? `<span class="settings-page-note">Reordenando…</span>` : ''}
        ${renderBotaoOrdenar('pipeline', pipelineOrdenarPor, 'Ordem manual (arrastar)')}
      </div>
    </div>

    <div class="stats-wrap-fixo">
      <div class="stats-wrap">
        <div class="stats">
          <div class="stats-label">Resumo · ${filterMonth ? monthLabel(filterMonth, true) : 'Geral (todos os meses)'}</div>
          <div class="stats-row">
            ${renderStatItem('aberto', 'Em negociação', fmtBRL(sumByTipo('aberto')), `${countByTipo('aberto')} ${countByTipo('aberto')===1?'cliente':'clientes'}`)}
            ${renderStatItem('ganho', 'Vendido', fmtBRL(sumByTipo('ganho')), `${countByTipo('ganho')} ${countByTipo('ganho')===1?'cliente':'clientes'}`)}
            ${renderStatItem('perdido', 'Perdido', fmtBRL(sumByTipo('perdido')), `${countByTipo('perdido')} ${countByTipo('perdido')===1?'cliente':'clientes'}`, 'rgba(255,255,255,.45)')}
            ${renderStatItem('quentes', 'Contatos quentes', quentesAtivos())}
            ${renderStatItem('ticket', 'Ticket médio', fmtBRL(ticketMedioFunil()))}
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

    ${(()=>{ const ativa = etapaAtivaMobile(columnsDoFunil); return `
    <div class="etapas-chips-mobile" id="etapas-chips-mobile" role="tablist" aria-label="Etapas do funil">
      ${columnsDoFunil.map(col=>`<button type="button" role="tab" class="etapa-chip-mobile ${col.id===ativa?'active':''}" data-action="etapa-mobile" data-col-id="${col.id}" aria-selected="${col.id===ativa}">${esc(col.nome)} <span class="etapa-chip-qtd">${cardsOf(col.id).length}</span></button>`).join('')}
    </div>
    <p class="etapas-dica-mobile">Para mudar um cliente de etapa, segure o cartão e arraste até o nome da etapa, em cima.</p>`; })()}

    <main class="pipeline-main" data-anim-grupo="funil" data-anim-troca="${funilAtualId}|${filterMonth||''}|${filtroEsfriando?1:0}">
      <div class="board" data-anim-grupo="etapa" data-anim-troca="${funilAtualId}|${etapaAtivaMobile(columnsDoFunil)}" data-anim-ordem="${Math.max(0, columnsDoFunil.findIndex(c=>c.id===etapaAtivaMobile(columnsDoFunil)))}">
        ${columnsDoFunil.map(col => renderColumn(col, col.id === etapaAtivaMobile(columnsDoFunil))).join('')}
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

function renderColumn(col, ativaNoCelular){
  const cards = cardsOf(col.id);
  const tipo = TIPOS[col.tipo] || TIPOS.aberto;
  const total = cards.reduce((s,c)=> s + (col.tipo==='ganho' ? valorVendido(c) : (Number(c.valor)||0)), 0);
  const isEditing = editingColId === col.id;
  const menuOpen = openMenuColId === col.id;

  return `
    <div class="column ${ativaNoCelular ? 'col-ativa-mobile' : ''}" data-col-id="${col.id}">
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
const STAT_KEYS = ['aberto','ganho','perdido','quentes','ticket'];
const STAT_LARGURA_PADRAO = 220;
const STAT_LARGURA_MIN = 130;
function getLargurasStats(){
  let salvo = {};
  try{ salvo = JSON.parse(localStorage.getItem('statsLargura') || '{}'); }catch(e){ salvo = {}; }
  return salvo;
}
let statsLargura = getLargurasStats();
// Os cartões sem largura escolhida pela pessoa se dividem pela faixa via CSS (flex); mantido
// só porque outras partes ainda chamam esta função depois de desenhar.
function ajustarLargurasStatsPadrao(){}
function renderStatItem(chave, label, valor, contagem, corValor){
  // sem largura escolhida pela pessoa, os cartões dividem a faixa (antes o último era cortado em telas de ~1366px)
  const largura = statsLargura[chave];
  return `
    <div class="stat ${largura ? 'stat-fixo' : ''}" data-stat-key="${chave}" ${largura ? `style="width:${largura}px;"` : ''}>
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
  const delta = (e.pageX - resizeStatState.startX) / (window.zoomDaTela ? window.zoomDaTela() : 1);
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
      resizeStatState = { key: handle.dataset.statKey, startX: e.pageX, startWidth: statEl.getBoundingClientRect().width / (window.zoomDaTela ? window.zoomDaTela() : 1) };
    });
  });
}

function ajustarAlturaColunasPipeline(){
  if(currentPage !== 'pipeline') return;
  const resumoFixo = document.querySelector('.stats-wrap-fixo');
  if(!resumoFixo) return;
  const alturaResumo = resumoFixo.getBoundingClientRect().height;
  const margemExtra = 12; // respiro entre o resumo e o topo das colunas + a barra de rolagem horizontal
  document.documentElement.style.setProperty('--altura-coluna-pipeline', `calc((100vh - ${Math.ceil(alturaResumo + margemExtra)}px) / var(--zoom, 1))`);
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
      <div class="card-faixa">
        <div class="card-drag-handle" title="Arraste para mover">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="3" r="1.4"/><circle cx="11" cy="3" r="1.4"/>
            <circle cx="5" cy="8" r="1.4"/><circle cx="11" cy="8" r="1.4"/>
            <circle cx="5" cy="13" r="1.4"/><circle cx="11" cy="13" r="1.4"/>
          </svg>
        </div>
        <div class="card-move-wrap">
          <button class="card-move-btn" data-action="toggle-move-menu" data-card-id="${card.id}" title="Mover pra outra etapa" aria-label="Mover pra outra etapa">${ICON_MOVE}</button>
        </div>
      </div>
      <div class="card-main">
        <div class="card-perf"></div>
        <div class="card-body" data-action="open-edit-card" data-card-id="${card.id}">
          <div class="card-top">
            <span class="card-name">${card.tipoPessoa==='juridica' ? '🏢 ' : ''}${esc(card.cliente) || 'Sem nome'}</span>
            <span class="temp-badge" style="color:${temp.color};background:${temp.bg}">${temp.emoji} ${temp.label}</span>
          </div>
          <div class="card-value-row">
            ${card.fechamento && !card.fechamento.cancelado && Number(card.fechamento.valorFinal) !== Number(card.valor)
              ? `<span class="card-value" title="Valor final do fechamento (no card: ${fmtBRL(card.valor)})">${fmtBRL(card.fechamento.valorFinal)}</span>`
              : `<span class="card-value">${fmtBRL(card.valor)}</span>`}
            ${showMonth ? `<span class="month-badge">${monthLabel(card.mesInicioContato)}</span>` : ''}
          </div>
          ${(!card.fechamento || card.fechamento.cancelado) && card.fechamentoPendente && (board.columns.find(c=>c.id===card.columnId)||{}).tipo==='ganho'
            ? `<button type="button" class="fech-selo" data-action="abrir-fechamento" data-card-id="${card.id}" title="Informar o valor final e as parcelas">Falta o fechamento</button>` : ''}
          ${valorMudouDepoisDoFechamento(card) && (board.columns.find(c=>c.id===card.columnId)||{}).tipo==='ganho'
            ? `<button type="button" class="fech-selo" data-action="abrir-fechamento" data-card-id="${card.id}" title="No fechamento, o valor do card era ${fmtBRL(card.fechamento.valorOriginal)}">Valor mudou · refazer fechamento?</button>` : ''}
          ${(card.telefone || card.obs) ? `
            <div class="card-extra">
              ${card.telefone ? `
                <div class="card-phone-row">
                  <span class="phone-text">☎ ${esc(telefoneBonito(card.telefone))}</span>
                  <button class="wa-btn wa-btn-icone" data-action="open-whatsapp" data-phone="${esc(card.telefone)}" title="Abrir conversa no WhatsApp" aria-label="WhatsApp de ${esc(card.cliente||'contato')}">
                    ${WA_ICON}
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
        <h1>Contatos</h1>
        <p>${board.cards.length} ${board.cards.length===1?'contato':'contatos'} na sua base</p>
      </div>
      <div class="page-head-actions">
        <button class="btn-outline ${mostrarArquivados?'active':''}" data-action="toggle-mostrar-arquivados" style="display:inline-flex; align-items:center; gap:6px;">${ICON_BAU} ${mostrarArquivados?'Voltar aos ativos':'Ver arquivados'}</button>
        <button class="btn-primary" data-action="open-new-lead">+ Novo contato</button>
      </div>
    </div>

    <div class="leads-toolbar">
      <input type="text" class="leads-search" id="leads-search-input" placeholder="Buscar por nome ou telefone" value="${esc(leadsSearch)}" />
      <select class="leads-filter" id="leads-status-filter" aria-label="Filtrar por situação">
        <option value="">Todos os status</option>
        ${board.columns.map(c=>`<option value="${c.id}" ${leadsStatusFilter===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
      </select>
      ${renderBotaoOrdenar('leads', leadsOrdenarPor)}
      <button class="btn-outline" data-action="exportar-leads" title="Baixa a lista em Excel (.xlsx)">Exportar (.xlsx)</button>
      ${(()=>{ const n = gruposDuplicadosLocal(); return n && (!acessoCrm || acessoCrm.gestor) ? `<button class="btn-outline" data-action="abrir-duplicados" title="Contatos com o mesmo telefone">Duplicados (${n})</button>` : ''; })()}
    </div>

    ${leadsSelecionados.size ? `
      <div class="leads-bulk-bar">
        <span>${leadsSelecionados.size} selecionado${leadsSelecionados.size===1?'':'s'}</span>
        <select id="leads-bulk-coluna">
          <option value="">Mover para…</option>
          ${board.columns.map(c=>`<option value="${c.id}">${esc(c.nome)}</option>`).join('')}
        </select>
        <button class="btn-outline" data-action="leads-bulk-etiqueta">+ Etiqueta</button>
        ${leadsBulkEtiquetaAberta ? `
          <input type="text" id="leads-bulk-etiqueta-input" placeholder="Nome da etiqueta" value="${esc(leadsBulkEtiquetaValor)}" style="width:140px;" autofocus />
          <button class="btn-primary" data-action="leads-bulk-etiqueta-confirmar">Aplicar</button>
        ` : ''}
        <button class="btn-outline" data-action="leads-bulk-arquivar">📦 Arquivar</button>
        <button class="delete-link" data-action="leads-bulk-excluir">🗑 Excluir</button>
        <button class="icon-btn" data-action="leads-bulk-limpar" title="Cancelar seleção" style="margin-left:auto;">✕</button>
      </div>
    ` : ''}

    ${(()=>{
      const tipoDe = (c)=>{ const col = board.columns.find(k=>k.id===c.columnId); return col ? col.tipo : 'aberto'; };
      const lista = leadsTipoMobile ? leads.filter(c=> tipoDe(c) === leadsTipoMobile) : leads;
      const chips = [['', 'Todos'], ['aberto', 'Em negociação'], ['ganho', 'Vendidos'], ['perdido', 'Perdidos']];
      return `
    <div class="leads-chips-mobile" role="tablist" aria-label="Filtrar contatos">
      ${chips.map(([k,l])=>`<button type="button" role="tab" class="etapa-chip-mobile ${leadsTipoMobile===k?'active':''}" data-action="leads-tipo-mobile" data-tipo="${k}" aria-selected="${leadsTipoMobile===k}">${l} <span class="etapa-chip-qtd">${k ? leads.filter(c=> tipoDe(c)===k).length : leads.length}</span></button>`).join('')}
    </div>
    <div class="leads-cards-mobile" data-anim-grupo="leads-tipo" data-anim-troca="${leadsTipoMobile}" data-anim-ordem="${chips.findIndex(([k])=> k===leadsTipoMobile)}">
      ${lista.length ? lista.map(c=>{
        const col = board.columns.find(k=>k.id===c.columnId);
        const tipo = col ? (TIPOS[col.tipo] || TIPOS.aberto) : TIPOS.aberto;
        const ini = (String(c.cliente||'?').trim().split(/\s+/).slice(0,2).map(p=>p.charAt(0)).join('') || '?').toUpperCase();
        return `
        <div class="lead-card-mobile" data-action="open-edit-card" data-card-id="${c.id}" role="button" tabindex="0">
          <span class="lead-card-avatar" aria-hidden="true">${esc(ini)}</span>
          <span class="lead-card-info">
            <span class="lead-card-top"><span class="lead-card-nome">${c.tipoPessoa==='juridica' ? '🏢 ' : ''}${esc(c.cliente) || 'Sem nome'}</span><span class="lead-card-valor">${fmtBRL(c.valor)}</span></span>
            <span class="lead-card-bot"><span class="lead-card-tel">${c.telefone ? esc(telefoneBonito(c.telefone)) : 'Sem telefone'}</span><span class="badge" style="color:${tipo.color};background:${tipo.bg};${tipo.strike?'text-decoration:line-through;':''}">${col ? esc(col.nome) : '—'}</span></span>
          </span>
          ${c.telefone ? `<button type="button" class="lead-card-wa" data-action="open-whatsapp" data-phone="${esc(c.telefone)}" aria-label="WhatsApp de ${esc(c.cliente||'contato')}">${WA_ICON}</button>` : ''}
        </div>`;
      }).join('') : `<p class="dash-empty" style="padding:24px 4px;">Nenhum contato aqui. Cadastre no botão "Novo contato".</p>`}
    </div>
    <button type="button" class="fab-novo-lead" data-action="open-new-lead">+ Novo contato</button>`;
    })()}

    <div class="leads-table-wrap" data-anim-grupo="leads-filtro" data-anim-troca="${leadsStatusFilter}|${leadsOrdenarPor}">
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
                <td class="clickable" data-action="open-edit-card" data-card-id="${c.id}">${c.telefone ? esc(telefoneBonito(c.telefone)) : '—'}</td>
                <td class="clickable" data-action="open-edit-card" data-card-id="${c.id}"><span class="badge" style="color:${tipo.color};background:${tipo.bg};${tipo.strike?'text-decoration:line-through;':''}">${col ? esc(col.nome) : '—'}</span></td>
                <td class="clickable" data-action="open-edit-card" data-card-id="${c.id}">${fmtBRL(c.valor)}</td>
                <td>
                  <div class="leads-row-actions">
                    ${c.telefone ? `<button class="icon-btn" data-action="open-whatsapp" data-phone="${esc(c.telefone)}" title="WhatsApp">${WA_ICON}</button>` : ''}
                  </div>
                </td>
              </tr>
            `;
          }).join('') : `<tr class="leads-empty-row"><td colspan="6">Nenhum contato encontrado. Cadastre o primeiro no botão "Novo contato".</td></tr>`}
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
// "Tarefas do dia": cria na hora uma tarefa sem horário (só a data) direto do modal do
// dia, sem abrir o formulário completo. Os horários continuam sendo os detalhes.
let salvandoTarefaRapida = false;
async function adicionarTarefaRapidaDoDia(diaISO){
  const input = document.getElementById('agenda-dia-tarefa-rapida-input');
  const titulo = input ? input.value.trim() : '';
  if(!titulo || salvandoTarefaRapida) return;
  salvandoTarefaRapida = true;
  if(input) input.disabled = true;
  try{
    const nova = await apiRequest('POST', '/tasks', { titulo, vencimento: diaISO, prioridade:'media', leadId:null, descricao:'' });
    tasks.push(nova);
    atualizarTarefaNaAgendaLocal(nova);
    salvandoTarefaRapida = false;
    renderApp();
    if(agendaDiaSelecionado) renderAgendaDiaModalPreservandoScroll();
    const novoInput = document.getElementById('agenda-dia-tarefa-rapida-input');
    if(novoInput) novoInput.focus();
  }catch(e){
    salvandoTarefaRapida = false;
    if(input){ input.disabled = false; input.focus(); }
    errorMsg = 'Não foi possível adicionar a tarefa.';
    renderApp();
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
          <div class="agenda-dia-tarefas">
            <div class="agenda-dia-tarefas-head">
              <div class="settings-page-subtitle" style="margin:0;">Tarefas do dia</div>
              ${(tarefasSemHora.length + eventosSemHora.length) ? `<span class="agenda-dia-tarefas-progresso">${tarefasSemHora.filter(t=>t.concluida).length + eventosSemHora.filter(e=>e.concluida).length} de ${tarefasSemHora.length + eventosSemHora.length} concluída${(tarefasSemHora.length + eventosSemHora.length)===1?'':'s'}</span>` : ''}
            </div>
            ${eventosSemHora.map(e=>`
              <div class="agenda-dia-item" data-copiar-evento="${e.id}" data-editar-evento="${e.id}">
                <span class="check-circle ${e.concluida?'checked':''}" data-evento-toggle="${e.id}">${e.concluida?ICON_CHECK:''}</span>
                <div class="agenda-dia-item-titulo ${e.concluida?'concluida':''}" style="flex:1;">${esc(e.titulo)}</div>
              </div>
            `).join('')}
            ${tarefasSemHora.map(renderTarefaMini).join('')}
            ${(tarefasSemHora.length + eventosSemHora.length) ? '' : `<p class="agenda-dia-tarefas-vazio">Nenhuma tarefa para este dia ainda. Anote abaixo o que precisa ser feito.</p>`}
            <form class="agenda-dia-tarefa-rapida" id="agenda-dia-tarefa-rapida" autocomplete="off">
              <input type="text" id="agenda-dia-tarefa-rapida-input" maxlength="200" placeholder="+ Adicionar tarefa do dia" aria-label="Adicionar tarefa do dia" />
              <button type="submit" class="btn-outline">Adicionar</button>
            </form>
          </div>
          <div class="settings-page-subtitle" style="margin:0 0 8px;">Horários</div>
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
  const tarefaRapidaForm = document.getElementById('agenda-dia-tarefa-rapida');
  if(tarefaRapidaForm) tarefaRapidaForm.addEventListener('submit', (ev)=>{
    ev.preventDefault();
    adicionarTarefaRapidaDoDia(diaISO);
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
  const abas = atuandoComo ? [['calendario','Calendário']] : [['calendario','Calendário'],['gerot','Rotina']]; // a rotina é pessoal de quem está logado
  if(atuandoComo && agendaSubTab !== 'calendario') agendaSubTab = 'calendario';
  return `
    <div class="page-head">
      <div>
        <h1>Agenda/Tarefas</h1>
        <p>Tarefas do CRM, compromissos do Google Agenda e sua rotina semanal</p>
      </div>
      ${agendaSubTab==='calendario' ? `
        <div class="page-head-actions">
          ${calendarConnected && !atuandoComo ? `<button class="btn-outline" data-action="sync-calendar-now" ${calendarSyncing?'disabled':''}>${calendarSyncing?'Sincronizando…':'📅 Sincronizar Agenda'}</button>` : ''}
          <button class="btn-primary" data-action="open-new-task">+ Nova tarefa</button>
        </div>
      ` : ''}
    </div>
    <div class="funil-tabs" style="margin-bottom:20px;">
      ${abas.map(([key,label])=>`<button class="tab-btn ${agendaSubTab===key?'active':''}" data-action="set-agenda-subtab" data-subtab="${key}">${label}</button>`).join('')}
    </div>
    <div data-anim-grupo="agenda-sub" data-anim-troca="${agendaSubTab}" data-anim-ordem="${agendaSubTab==='calendario'?0:1}">${agendaSubTab==='calendario' ? renderCalendarioConteudo() : renderGerotConteudo()}</div>
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
  const hojeISO = hojeLocalISO();
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
      <span data-anim-grupo="agenda-mes-rotulo" data-anim-troca="${agendaMesAtual}" data-anim-ordem="${ordemDoMes(agendaMesAtual)}">${monthLabel(agendaMesAtual, true)}</span>
      <button class="icon-btn" data-action="agenda-mes" data-delta="1" title="Próximo mês">›</button>
      <button class="btn-outline" data-action="agenda-hoje" style="margin-left:10px;">Hoje</button>
    </div>

    ${semData.length ? `
      <div class="agenda-sem-data">
        <span class="agenda-sem-data-label">Sem data:</span>
        ${semData.map(t=>`<button class="etiqueta-pill" data-action="open-edit-task" data-task-id="${t.id}">${esc(t.titulo)}</button>`).join('')}
      </div>
    ` : ''}

    <div class="agenda-grid" data-anim-grupo="agenda-mes" data-anim-troca="${agendaMesAtual}" data-anim-ordem="${ordemDoMes(agendaMesAtual)}">
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
          <span data-anim-grupo="comissoes-mes-rotulo" data-anim-troca="${comissoesMonth}" data-anim-ordem="${ordemDoMes(comissoesMonth)}">${monthLabel(comissoesMonth, true)}</span>
          <button class="icon-btn" data-action="comissoes-mes" data-delta="1" title="Próximo mês">›</button>
        </div>
        ${renderBotaoOrdenar('comissoes', comissoesOrdenarPor, null, true)}
        <button class="icon-btn" data-action="open-regras-comissao" title="Regras de comissão">${ICON_SETTINGS}</button>
        <button class="btn-primary" data-action="open-new-contrato">+ Novo contrato</button>
      </div>
    </div>

    <div class="metric-grid" data-anim-grupo="comissoes-mes" data-anim-troca="${comissoesMonth}" data-anim-ordem="${ordemDoMes(comissoesMonth)}">
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
            <span>· ${c.parcelas}x parcelas · Valor da venda: ${fmtBRL(c.valorVenda)}</span>
            ${c.geradoAutomaticamente ? `<span class="badge badge-neutral" title="Criada automaticamente quando o cliente entrou numa coluna de fechamento em Negociações">⚡ Gerada pelas Negociações</span>` : ''}
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
