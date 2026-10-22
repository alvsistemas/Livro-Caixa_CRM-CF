/* ---------- página: Conversas ---------- */
function renderConversasPage(){
  if(!conversasLoaded){
    return `<div class="page-head"><div><h1>Conversas</h1><p>Carregando…</p></div></div>`;
  }
  if(!whatsappConnected){
    return `
      <div class="page-head"><div><h1>Conversas</h1><p>Nenhuma conversa ainda</p></div></div>
      <div class="tasks-empty">Conecte o WhatsApp Business em Configurações → Integrações para ver as conversas aqui.</div>
    `;
  }
  const busca = conversaBusca.trim().toLowerCase();
  const listaFiltrada = busca ? conversas.filter(cv=> (cv.card.cliente||'').toLowerCase().includes(busca) || (cv.card.telefone||'').includes(busca)) : conversas;
  const card = conversaSelecionadaCardId ? board.cards.find(c=>c.id===conversaSelecionadaCardId) : null;
  const automacoesRelevantes = card ? automacoes.filter(a=>a.colunaGatilhoId===card.columnId && a.ativa!==false) : [];

  return `
    <div class="page-head">
      <div>
        <h1>Conversas</h1>
        <p>${conversas.length} conversa${conversas.length===1?'':'s'} no WhatsApp</p>
      </div>
      <div class="page-head-actions">
        <button class="btn-outline" data-action="abrir-overlay-conversas" data-overlay="automacoes">⚡ Automações</button>
        <button class="btn-outline" data-action="abrir-overlay-conversas" data-overlay="disparos">📣 Disparos</button>
        <button class="btn-outline" data-action="abrir-overlay-conversas" data-overlay="agendamentos">🕐 Agendar Mensagem</button>
      </div>
    </div>
    <div class="conversas-3col">
      <div class="conversas-col-lista">
        <input type="text" class="conversas-busca" id="conversas-busca-input" placeholder="Buscar por nome ou telefone…" value="${esc(conversaBusca)}" />
        <div class="conversas-lista-scroll">
          ${listaFiltrada.length ? listaFiltrada.map(cv=>`
            <div class="conversa-item ${conversaSelecionadaCardId===cv.card.id?'conversa-item-ativa':''}" data-action="selecionar-conversa" data-card-id="${cv.card.id}">
              <div class="conversa-item-main">
                <span class="conversa-item-nome">${cv.canal==='instagram'?'📷':'💬'} ${esc(cv.card.cliente) || 'Sem nome'}</span>
                <span class="conversa-item-preview">${cv.direcaoUltima==='out' ? 'Você: ' : ''}${esc((cv.ultimaMensagem||'').slice(0,60))}</span>
              </div>
              <span class="conversa-item-hora">${formatDateHora(cv.ultimaMensagemEm)}</span>
            </div>
          `).join('') : `<p class="dash-empty" style="padding:16px;">Nenhuma conversa encontrada.</p>`}
        </div>
      </div>

      <div class="conversas-col-chat">
        ${!card ? `
          <div class="conversas-vazio">Escolha uma conversa à esquerda pra começar.</div>
        ` : `
          <div class="conversas-chat-head">
            <span class="conversa-item-nome">${esc(card.cliente)||'Sem nome'}</span>
            <span class="settings-page-note">${esc(card.telefone||'')}</span>
          </div>
          ${!conversaMensagensLoaded ? `<p class="settings-page-note" style="padding:16px;">Carregando conversa…</p>` : `
            <div class="wa-conversa-lista conversas-chat-lista" id="conversas-chat-lista">
              ${conversaMensagens.length ? conversaMensagens.map(m=>`
                <div class="wa-msg wa-msg-${m.direction}">
                  ${renderConteudoMensagem(m)}
                  <span>${new Date(m.timestamp).toLocaleString('pt-BR')} ${m.direction==='out' ? statusMensagemIcone(m.status) : ''}</span>
                </div>
              `).join('') : '<p class="settings-page-note">Nenhuma mensagem ainda.</p>'}
            </div>
          `}
          <div class="wa-conversa-input-row">
            <input type="text" id="conversas-nova-msg" placeholder="Digite uma mensagem..." value="${esc(conversaTexto)}" />
            <button type="button" class="btn-primary" id="conversas-enviar-btn" ${conversaEnviando?'disabled':''}>Enviar</button>
          </div>
        `}
      </div>

      <div class="conversas-col-detalhes">
        ${!card ? `<div class="conversas-vazio">—</div>` : `
          <div class="settings-page-subtitle">Detalhes do cliente</div>
          <div class="field">
            <label>Nome</label>
            <input type="text" id="cv-det-nome" value="${esc(card.cliente)}" />
          </div>
          <div class="field">
            <label>Telefone</label>
            <input type="text" id="cv-det-telefone" value="${esc(card.telefone||'')}" />
          </div>
          <div class="field">
            <label>Valor</label>
            <div class="money-wrap">
              <span>R$</span>
              <input type="text" inputmode="numeric" id="cv-det-valor" value="${card.valor ? Number(card.valor).toLocaleString('pt-BR') : ''}" />
            </div>
          </div>
          <div class="field">
            <label>Qualificação</label>
            <select id="cv-det-temp">
              <option value="quente" ${card.temperatura==='quente'?'selected':''}>🔥 Quente</option>
              <option value="morno" ${card.temperatura==='morno'?'selected':''}>☀️ Morno</option>
              <option value="frio" ${card.temperatura==='frio'?'selected':''}>❄️ Frio</option>
            </select>
          </div>
          <button class="btn-outline" data-action="open-edit-card" data-card-id="${card.id}" style="width:100%; margin-top:4px;">Ver ficha completa</button>

          <div class="settings-sep-line"></div>
          <div class="settings-page-subtitle">Automações dessa etapa</div>
          ${automacoesRelevantes.length ? automacoesRelevantes.map(a=>`
            <div class="conversas-automacao-item">
              <span>${esc(a.nome)}</span>
              <div class="settings-btn-row">
                <button class="btn-outline" data-action="executar-automacao-manual" data-automacao-id="${a.id}" title="Executar agora nesse cliente">▶</button>
                <button class="icon-btn" data-action="editar-automacao-conversa" data-automacao-id="${a.id}" title="Editar">${ICON_EDIT}</button>
              </div>
            </div>
          `).join('') : `<p class="settings-page-note">Nenhuma automação configurada pra coluna atual desse cliente.</p>`}
          <button class="btn-outline" data-action="open-new-automacao-conversa" style="width:100%; margin-top:8px;">+ Nova automação</button>
        `}
      </div>
    </div>
    ${conversasOverlay ? `
      <div class="conversas-overlay-backdrop" data-action="fechar-overlay-conversas">
        <div class="conversas-overlay-painel" onclick="event.stopPropagation()">
          <button class="icon-btn conversas-overlay-fechar" data-action="fechar-overlay-conversas" title="Fechar">✕</button>
          ${conversasOverlay==='automacoes' ? renderAutomacoesPage() : ''}
          ${conversasOverlay==='disparos' ? renderDisparosPage() : ''}
          ${conversasOverlay==='agendamentos' ? renderAgendamentosPage() : ''}
        </div>
      </div>
    ` : ''}
  `;
}

/* ---------- página: Disparos ---------- */
function renderDisparosPage(){
  const filtrados = board.cards.filter(c=>{
    if(disparoFiltroColuna && c.columnId !== disparoFiltroColuna) return false;
    if(disparoFiltroTemp && c.temperatura !== disparoFiltroTemp) return false;
    return !!c.telefone;
  });
  return `
    <div class="page-head">
      <div>
        <h1>Disparos</h1>
        <p>Envie a mesma mensagem para vários leads de uma vez</p>
      </div>
    </div>
    ${!whatsappConnected ? `<div class="tasks-empty">Conecte o WhatsApp Business em Configurações → Integrações para usar os disparos.</div>` : `
      <div class="settings-page-section" style="margin-bottom:20px;">
        <h3>Filtrar leads</h3>
        <div class="field-row">
          <div class="field">
            <label>Coluna</label>
            <select id="disparo-coluna">
              <option value="">Todas</option>
              ${board.columns.map(c=>`<option value="${c.id}" ${disparoFiltroColuna===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Qualificação</label>
            <select id="disparo-temp">
              <option value="">Todas</option>
              <option value="quente" ${disparoFiltroTemp==='quente'?'selected':''}>Quente</option>
              <option value="morno" ${disparoFiltroTemp==='morno'?'selected':''}>Morno</option>
              <option value="frio" ${disparoFiltroTemp==='frio'?'selected':''}>Frio</option>
            </select>
          </div>
        </div>
        <p class="settings-page-note">${filtrados.length} lead(s) com telefone encontrados. Marque quem vai receber:</p>
        <div class="disparo-lista-leads">
          ${filtrados.length ? filtrados.map(c=>`
            <label class="disparo-lead-item">
              <input type="checkbox" class="disparo-lead-checkbox" data-card-id="${c.id}" ${disparoSelecionados.has(c.id)?'checked':''} />
              <span>${esc(c.cliente)} <span class="settings-page-note">${esc(c.telefone)}</span></span>
            </label>
          `).join('') : '<p class="dash-empty">Nenhum lead encontrado com esse filtro.</p>'}
        </div>
        <div class="settings-btn-row" style="margin-top:10px;">
          <button class="btn-outline" data-action="disparo-selecionar-todos">Selecionar todos</button>
          <button class="btn-outline" data-action="disparo-limpar-selecao">Limpar seleção</button>
        </div>
      </div>

      <div class="settings-page-section">
        <h3>Mensagem</h3>
        <label class="settings-toggle-row">
          <span>Usar modelo de mensagem (alcança leads frios)</span>
          <span class="switch ${disparoUsarTemplate?'on':''}" data-action="toggle-disparo-template">
            <span class="switch-knob"></span>
          </span>
        </label>
        ${disparoUsarTemplate ? `
          <div class="field-row">
            <div class="field">
              <label>Nome do modelo</label>
              <input type="text" id="disparo-template-nome" value="${esc(disparoTemplateNome)}" placeholder="ex: boas_vindas" />
            </div>
            <div class="field">
              <label>Idioma</label>
              <input type="text" id="disparo-template-idioma" value="${esc(disparoTemplateIdioma)}" placeholder="pt_BR" />
            </div>
          </div>
          <div class="field">
            <label>Variáveis do modelo (opcional, separadas por vírgula, na ordem certa)</label>
            <input type="text" id="disparo-template-variaveis" value="${esc(disparoTemplateVariaveis)}" placeholder="Ex: João, 15/08" />
          </div>
          <button class="btn-outline" data-action="carregar-templates">Carregar modelos aprovados</button>
          ${disparoTemplatesDisponiveis.length ? `<p class="settings-page-note">Modelos encontrados: ${disparoTemplatesDisponiveis.map(t=>esc(t.nome)).join(', ')}</p>` : ''}
        ` : `
          <div class="field">
            <textarea id="disparo-texto" rows="4" placeholder="Escreva a mensagem que será enviada...">${esc(disparoTexto)}</textarea>
          </div>
        `}
        <p class="settings-page-note">⚠️ Texto livre só chega pra quem te escreveu nas últimas 24h — regra da própria Meta. Modelo de mensagem funciona pra qualquer lead, inclusive frio, mas precisa estar aprovado no Meta Business Manager antes.</p>
        ${disparoResultado ? `<p class="settings-page-msg ${disparoResultado.falha ? 'erro' : 'ok'}">${disparoResultado.sucesso} enviada(s)${disparoResultado.falha ? `, ${disparoResultado.falha} falharam` : ''}.</p>` : ''}
        ${disparoResultado && disparoResultado.detalhesFalha && disparoResultado.detalhesFalha.length ? `
          <div class="settings-page-section" style="margin-top:0;">
            <div class="settings-page-subtitle">Detalhes das falhas</div>
            ${disparoResultado.detalhesFalha.map(d=>`<p class="settings-page-note">• ${esc(d.cliente||'')}: ${esc(d.erro||'')}</p>`).join('')}
          </div>
        ` : ''}
        <button class="btn-primary" data-action="enviar-disparo" ${disparoEnviando?'disabled':''}>${disparoEnviando ? 'Enviando…' : `Enviar para ${disparoSelecionados.size} lead(s)`}</button>
      </div>
    `}
  `;
}

/* ---------- página: Relatórios ---------- */
function cardsParaRelatorio(){
  if(!relatorioFunilId) return board.cards;
  const colunaIds = new Set(board.columns.filter(c=>c.funilId===relatorioFunilId).map(c=>c.id));
  return board.cards.filter(c=>colunaIds.has(c.columnId));
}
function renderRelatoriosPage(){
  const cardsRel = cardsParaRelatorio();
  const dados = relatoriosDadosMensais(12, cardsRel);
  const maxNovos = Math.max(1, ...dados.map(d=>d.novos));
  const maxGanhoValor = Math.max(1, ...dados.map(d=>d.ganhoValor));
  const totalGanho = cardsRel.reduce((s,c)=>{ const col=board.columns.find(k=>k.id===c.columnId); return col&&col.tipo==='ganho' ? s+(Number(c.valor)||0) : s; },0);
  const totalPerdido = cardsRel.reduce((s,c)=>{ const col=board.columns.find(k=>k.id===c.columnId); return col&&col.tipo==='perdido' ? s+(Number(c.valor)||0) : s; },0);
  const porTemp = ['quente','morno','frio'].map(t=>({ temp:t, count: cardsRel.filter(c=>c.temperatura===t).length }));

  return `
    <div class="page-head">
      <div>
        <h1>Relatórios</h1>
        <p>Visão consolidada dos últimos 12 meses</p>
      </div>
      <div class="page-head-actions">
        <select id="relatorio-funil-select" class="leads-filter">
          <option value="">Todos os funis</option>
          ${funis.map(f=>`<option value="${f.id}" ${relatorioFunilId===f.id?'selected':''}>${esc(f.nome)}</option>`).join('')}
        </select>
        <button class="btn-outline" data-action="exportar-csv">Exportar CSV</button>
        <button class="btn-outline" data-action="exportar-xlsx">Exportar Excel</button>
        <button class="btn-outline" data-action="exportar-relatorio-pdf">Exportar PDF</button>
      </div>
    </div>

    <div class="metric-grid">
      <div class="metric-card"><div class="metric-card-top"><span>Total ganho</span></div><div class="metric-value">${fmtBRL(totalGanho)}</div></div>
      <div class="metric-card"><div class="metric-card-top"><span>Total perdido</span></div><div class="metric-value">${fmtBRL(totalPerdido)}</div></div>
      <div class="metric-card"><div class="metric-card-top"><span>Total de leads</span></div><div class="metric-value">${cardsRel.length}</div></div>
    </div>

    <div class="dash-panel">
      <div class="dash-panel-title">Valor ganho por mês (histórico)</div>
      <div class="stage-list">
        ${dados.map(d=>`
          <div class="stage-row">
            <div class="stage-row-top"><span>${monthLabel(d.key)}</span><span>${fmtBRL(d.ganhoValor)} ${d.ganhoQtd?`· ${d.ganhoQtd} venda${d.ganhoQtd===1?'':'s'}`:''}</span></div>
            <div class="stage-bar-track"><div class="stage-bar-fill" style="width:${d.ganhoValor/maxGanhoValor*100}%"></div></div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="dash-panel">
      <div class="dash-panel-title">Novos leads por mês</div>
      <div class="stage-list">
        ${dados.map(d=>`
          <div class="stage-row">
            <div class="stage-row-top"><span>${monthLabel(d.key)}</span><span>${d.novos}</span></div>
            <div class="stage-bar-track"><div class="stage-bar-fill" style="width:${d.novos/maxNovos*100}%"></div></div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="dash-panel">
      <div class="dash-panel-title">Leads por qualificação</div>
      <div class="stage-list">
        ${porTemp.map(t=>`
          <div class="stage-row">
            <div class="stage-row-top"><span>${TEMPS[t.temp].label}</span><span>${t.count}</span></div>
            <div class="stage-bar-track"><div class="stage-bar-fill" style="width:${cardsRel.length ? (t.count/cardsRel.length*100) : 0}%"></div></div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/* ---------- tela compartilhada: criar/entrar numa equipe ---------- */
function renderEquipeSetup(tituloPagina, subtitulo){
  return `
    <div class="page-head">
      <div>
        <h1>${tituloPagina}</h1>
        <p>${subtitulo}</p>
      </div>
    </div>
    ${convitesRecebidos.length ? `
    <div class="settings-page-section" style="margin-bottom:20px;">
      <h3>Convites para você</h3>
      <p class="settings-page-note">Ao aceitar, o gestor passa a ver seu desempenho e você entra no chat da equipe. Seu funil continua só seu.</p>
      ${convitesRecebidos.map(c=>`
        <div class="settings-page-row">
          <span>${esc(c.convidadoPor)} convidou você para a equipe <b>${esc(c.equipeNome)}</b></span>
          <span class="settings-btn-row">
            <button class="btn-primary" data-action="aceitar-convite-equipe" data-convite-id="${c.id}">Aceitar</button>
            <button class="btn-outline" data-action="recusar-convite-equipe" data-convite-id="${c.id}">Recusar</button>
          </span>
        </div>`).join('')}
    </div>` : ''}
    <div class="settings-page-grid">
      <div class="settings-page-section">
        <h3>Criar uma equipe</h3>
        <p class="settings-page-note">Você vira supervisor(a) automaticamente e ganha um código pra convidar outras pessoas. O funil de cada um continua separado — só o chat e a supervisão são compartilhados.</p>
        <div class="field">
          <input type="text" id="equipe-nome-novo" placeholder="Nome da equipe" value="${esc(equipeNomeNovo)}" />
        </div>
        <button class="btn-primary" data-action="criar-equipe">Criar equipe</button>
      </div>
      <div class="settings-page-section">
        <h3>Entrar numa equipe existente</h3>
        <p class="settings-page-note">Peça o código de convite pra quem já criou a equipe.</p>
        <div class="field">
          <input type="text" id="equipe-codigo-entrar" placeholder="Código de convite" value="${esc(equipeCodigoEntrar)}" />
        </div>
        <button class="btn-outline" data-action="entrar-equipe">Entrar</button>
      </div>
    </div>
    ${equipeMsg ? `<p class="settings-page-msg ${equipeMsg.tipo}" style="margin-top:14px;">${esc(equipeMsg.texto)}</p>` : ''}
  `;
}

/* ---------- página: Chat Interno ---------- */
function renderMensagensEInput(mensagens, carregado, inputId, enviarAction, valorInput, enviando, vazioTexto){
  return `
    ${!carregado ? `<p class="settings-page-note">Carregando conversa…</p>` : `
      <div class="chat-interno-mensagens" id="${inputId}-mensagens">
        ${mensagens.length ? mensagens.map(m=>`
          <div class="wa-msg ${m.remetenteId===(currentUser&&currentUser.id)?'wa-msg-out':'wa-msg-in'}">
            <p><b>${m.remetenteId===(currentUser&&currentUser.id)?'Você':esc(m.remetenteNome)}:</b> ${esc(m.texto)}</p>
            <span>${formatDateHora(m.timestamp)}</span>
          </div>
        `).join('') : `<p class="settings-page-note">${vazioTexto}</p>`}
      </div>
      <div class="wa-conversa-input-row">
        <input type="text" id="${inputId}" placeholder="Escreva uma mensagem..." value="${esc(valorInput)}" />
        <button class="btn-primary" data-action="${enviarAction}" ${enviando?'disabled':''}>Enviar</button>
      </div>
    `}
  `;
}
function renderChatInternoConteudo(){
  const conversandoComOutro = !!dmDestinatarioId;
  const outro = conversandoComOutro ? equipe.membros.find(m=>m.id===dmDestinatarioId) : null;
  return `
    <div class="chat-interno-wrap">
      <div class="chat-interno-membros">
        <div class="settings-page-subtitle">Conversas</div>
        <button class="chat-membro-item chat-membro-btn ${!conversandoComOutro?'chat-membro-ativo':''}" data-action="fechar-conversa-individual">💬 Chat da equipe</button>
        ${equipe.membros.filter(m=>!m.souEu).map(m=>`
          <button class="chat-membro-item chat-membro-btn ${dmDestinatarioId===m.id?'chat-membro-ativo':''}" data-action="abrir-conversa-individual" data-user-id="${m.id}">${esc(m.nome||m.email)}${m.papel==='supervisor'?' ⭐':''}</button>
        `).join('')}
        ${equipe.membros.filter(m=>m.souEu).map(m=>`<div class="chat-membro-item chat-membro-eu">${esc(m.nome||m.email)} (você)</div>`).join('')}
      </div>
      <div class="chat-interno-main">
        <div class="settings-page-subtitle">${conversandoComOutro ? `Conversa com ${esc(outro ? (outro.nome||outro.email) : '')}` : 'Chat da equipe'}</div>
        ${conversandoComOutro
          ? renderMensagensEInput(dmMensagens, dmLoaded, 'chat-individual-input', 'enviar-chat-individual', dmTexto, dmEnviando, 'Nenhuma mensagem ainda.')
          : renderMensagensEInput(chatMensagens, chatLoaded, 'chat-interno-input', 'enviar-chat-interno', chatTexto, chatEnviando, 'Nenhuma mensagem ainda. Diga oi pra equipe!')
        }
      </div>
    </div>
  `;
}
function renderEquipePage(){
  if(!equipeLoaded){
    return `<div class="page-head"><div><h1>Equipe</h1><p>Carregando…</p></div></div>`;
  }
  if(!equipe){
    return renderEquipeSetup('Equipe', 'Você ainda não faz parte de uma equipe');
  }
  const abas = [['chat','Chat']];
  if(equipe.souSupervisor) abas.push(['supervisao','Gestão']);
  if(equipe.souSupervisorDeDados) abas.push(['monitoramento','Monitoramento']);
  return `
    <div class="page-head">
      <div>
        <h1>Equipe</h1>
        <p>${esc(equipe.nome)} · ${equipe.membros.length} membro${equipe.membros.length===1?'':'s'}</p>
      </div>
    </div>
    ${abas.length > 1 ? `
      <div class="funil-tabs" style="margin-bottom:20px;">
        ${abas.map(([key,label])=>`<button class="tab-btn ${equipeSubTab===key?'active':''}" data-action="set-equipe-subtab" data-subtab="${key}">${label}</button>`).join('')}
      </div>
    ` : ''}
    ${equipeSubTab==='chat' ? renderChatInternoConteudo() : ''}
    ${equipeSubTab==='supervisao' && equipe.souSupervisor ? renderSupervisaoConteudo() : ''}
    ${equipeSubTab==='monitoramento' && equipe.souSupervisorDeDados ? renderMonitoramentoConteudo() : ''}
  `;
}

/* ---------- página: Supervisão ---------- */
// Supervisor sempre primeiro, os demais em ordem alfabética por nome
function membrosOrdenados(membros){
  return [...membros].sort((a,b)=>{
    if(a.papel==='supervisor' && b.papel!=='supervisor') return -1;
    if(b.papel==='supervisor' && a.papel!=='supervisor') return 1;
    return (a.nome||'').localeCompare(b.nome||'', 'pt-BR');
  });
}
// Ranking de vendas: supervisor(es) destacado(s) à parte, fora da disputa por valor
// (o papel dele é apoiar a equipe, não vender — não é justo rankeá-lo pelo mesmo critério).
// Os demais membros continuam ordenados por valor ganho entre si.
function renderRankingSupervisao(membros){
  const supervisores = membros.filter(m=>m.papel==='supervisor');
  const resto = membros.filter(m=>m.papel!=='supervisor').sort((a,b)=>b.ganhoValor-a.ganhoValor);
  const maxGanho = Math.max(1, ...membros.map(x=>x.ganhoValor));
  let html = '';
  if(supervisores.length){
    html += supervisores.map(m=>`
      <div class="ranking-supervisor-card">
        <div class="stage-row-top"><span>⭐ ${esc(m.nome)} <span class="settings-page-note">— Gestor, fora do ranking de vendas</span></span><span>${fmtBRL(m.ganhoValor)}</span></div>
        <div class="stage-bar-track"><div class="stage-bar-fill" style="width:${(m.ganhoValor/maxGanho*100)}%"></div></div>
      </div>
    `).join('');
  }
  if(resto.length){
    html += `
      <div class="stage-list" style="margin-top:${supervisores.length?'14px':'0'};">
        ${resto.map((m,idx)=>`
          <div class="stage-row">
            <div class="stage-row-top">
              <span>${idx+1}º — ${esc(m.nome)}</span>
              <span style="display:flex; align-items:center; gap:10px;">
                ${fmtBRL(m.ganhoValor)}
                <button type="button" class="btn-outline" style="padding:4px 10px; font-size:11px;" data-action="ver-dashboard-membro" data-user-id="${m.userId}" data-nome="${esc(m.nome)}">Ver Dashboard</button>
              </span>
            </div>
            <div class="stage-bar-track"><div class="stage-bar-fill" style="width:${(m.ganhoValor/maxGanho*100)}%"></div></div>
          </div>
        `).join('')}
      </div>
    `;
  }
  return html || '<p class="dash-empty">Nenhum membro ainda.</p>';
}
function renderSupervisaoConteudo(){
  return `
    <div class="settings-page-section" style="margin-bottom:20px;">
      <h3>Adicionar pessoas</h3>
      <p class="settings-page-note">Convide pelo e-mail: a pessoa vê o convite na aba Equipe do CRM dela e entra quando aceitar. O funil de cada um continua separado.</p>
      <div class="field">
        <input type="email" id="convite-email-novo" placeholder="E-mail da pessoa (o mesmo do cadastro dela)" value="${esc(conviteEmailNovo)}" />
      </div>
      <button class="btn-primary" data-action="enviar-convite-equipe">Enviar convite</button>
      ${(equipe.convitesPendentes||[]).length ? `
        <div class="settings-page-subtitle" style="margin-top:14px;">Convites pendentes</div>
        ${equipe.convitesPendentes.map(c=>`
          <div class="settings-page-row">
            <span>${esc(c.email)}</span>
            <button class="btn-outline" data-action="cancelar-convite-equipe" data-convite-id="${c.id}">Cancelar</button>
          </div>`).join('')}
      ` : ''}
      ${equipeMsg ? `<p class="settings-page-msg ${equipeMsg.tipo}">${esc(equipeMsg.texto)}</p>` : ''}
      <div class="settings-sep-line"></div>
      <h3>Ou use o código</h3>
      <p class="settings-page-note">Compartilhe esse código — quem entrar com ele vira membro da equipe, mantendo o funil próprio dele:</p>
      <div class="settings-page-row"><span>Código de convite</span><span style="font-family:'IBM Plex Mono',monospace; font-weight:700; letter-spacing:.05em;">${esc(equipe.codigoConvite||'')}</span></div>
      <button class="btn-outline" data-action="regenerar-codigo-equipe">Gerar novo código</button>
    </div>

    <div class="settings-page-section" style="margin-bottom:20px;">
      <h3>Rodízio de leads novos</h3>
      <p class="settings-page-note">Com o rodízio ligado, cada lead novo que chegar pelo seu WhatsApp ou por formulário de anúncio vai para a próxima pessoa da lista, uma de cada vez. O menu de triagem e a IA não rodam nesses leads. Se a pessoa não tiver WhatsApp próprio conectado, ela responde pelo seu número.</p>
      <label class="settings-page-row" style="cursor:pointer;"><span>Rodízio ligado</span><input type="checkbox" id="rodizio-ativo" ${(equipe.rodizio&&equipe.rodizio.ativo)?'checked':''} /></label>
      <div class="settings-page-subtitle" style="margin-top:10px;">Quem participa</div>
      ${membrosOrdenados(equipe.membros).map(m=>`
        <label class="settings-page-row" style="cursor:pointer;"><span>${esc(m.nome||m.email)}${m.souEu?' (você)':''}</span><input type="checkbox" class="rodizio-membro" value="${m.id}" ${((equipe.rodizio&&equipe.rodizio.membros)||[]).includes(String(m.id))?'checked':''} /></label>
      `).join('')}
      <button class="btn-primary" data-action="salvar-rodizio" style="margin-top:10px;">Salvar rodízio</button>
    </div>

    <div class="settings-page-section" style="margin-bottom:20px;">
      <h3>Membros</h3>
      <div class="disparo-lista-leads" style="max-height:none;">
        ${membrosOrdenados(equipe.membros).map(m=>`
          <div class="disparo-lead-item ${m.papel==='supervisor'?'membro-supervisor-destaque':''}" style="cursor:default; flex-direction:column; align-items:stretch; gap:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span>${esc(m.nome||m.email)} — ${m.papel==='supervisor'?'⭐ Gestor':'Membro'}${m.supervisorDeDados?' · 🛠 Supervisor de dados':''}${m.souEu?' (você)':''}</span>
              ${!m.souEu ? `
                <div class="settings-btn-row">
                  <button class="btn-outline" data-action="alterar-papel-membro" data-user-id="${m.id}" data-papel="${m.papel==='supervisor'?'membro':'supervisor'}">${m.papel==='supervisor'?'Rebaixar':'Promover'}</button>
                  <button class="btn-outline" data-action="toggle-supervisor-dados" data-user-id="${m.id}" data-ativo="${m.supervisorDeDados?'0':'1'}">${m.supervisorDeDados?'Remover supervisor de dados':'Tornar supervisor de dados'}</button>
                  <button class="btn-outline" data-action="remover-membro" data-user-id="${m.id}">Remover</button>
                </div>
              ` : ''}
            </div>
          </div>
        `).join('')}
      </div>
      <button class="btn-outline" data-action="sair-equipe" style="margin-top:10px;">Sair da equipe</button>
    </div>

    <div class="settings-page-section" style="margin-bottom:20px;">
      <h3>Ranking de desempenho (por valor ganho)</h3>
      ${!supervisaoLoaded ? `<p class="settings-page-note">Carregando…</p>` : (supervisaoMembros.length ? renderRankingSupervisao(supervisaoMembros) : `<p class="dash-empty">Nenhum membro ainda.</p>`)}
    </div>

    <div class="settings-page-section">
      <h3>Desempenho por membro</h3>
      ${!supervisaoLoaded ? `<p class="settings-page-note">Carregando…</p>` : `
        <div class="leads-table-wrap" style="border:none;">
          <table class="leads-table">
            <thead><tr><th>Nome</th><th>Leads</th><th>Em negociação</th><th>Ganho</th><th>Perdido</th><th>Meta do mês</th></tr></thead>
            <tbody>
              ${membrosOrdenados(supervisaoMembros).map(m=>`
                <tr class="${m.papel==='supervisor'?'membro-supervisor-destaque':''}">
                  <td>${esc(m.nome)} ${m.papel==='supervisor'?'⭐':''}</td>
                  <td>${m.totalLeads}</td>
                  <td>${fmtBRL(m.abertoValor)}</td>
                  <td>${fmtBRL(m.ganhoValor)}</td>
                  <td>${fmtBRL(m.perdidoValor)}</td>
                  <td>
                    ${m.metaMes>0 ? `<div class="meta-vendas-track" style="margin:0 0 4px;"><div class="meta-vendas-fill" style="width:${Math.min(100,(m.vendidoNoMes||0)/m.metaMes*100)}%"></div></div>
                    <span class="settings-page-note">${fmtBRL(m.vendidoNoMes||0)} de ${fmtBRL(m.metaMes)} (${Math.round(Math.min(999,(m.vendidoNoMes||0)/m.metaMes*100))}%)</span>` : `<span class="settings-page-note">Sem meta</span>`}
                    <button type="button" class="btn-outline" style="padding:3px 8px; font-size:11px; margin-left:6px;" data-action="definir-meta-membro" data-user-id="${m.userId}" data-nome="${esc(m.nome)}" data-meta="${m.metaMes||0}">${m.metaMes>0?'Editar':'Definir'}</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}
function renderMonitoramentoConteudo(){
  return `
    <div class="settings-page-section">
      <h3>Monitoramento de erros do sistema</h3>
      <p class="settings-page-note">Erros técnicos registrados automaticamente nos últimos 30 dias — útil pra perceber se algo quebrou sem precisar esperar alguém reclamar.</p>
      <div class="settings-btn-row" style="margin-bottom:14px;">
        <button class="btn-outline" data-action="atualizar-monitoramento">Atualizar</button>
        <button class="delete-link" data-action="limpar-monitoramento">🗑 Limpar log</button>
      </div>
      ${!monitoramentoLoaded ? `<p class="settings-page-note">Carregando…</p>` : (monitoramentoErros.length ? `
        <div class="historico-lista">
          ${monitoramentoErros.map(e=>`
            <div class="historico-item" style="align-items:flex-start; flex-direction:column; gap:4px;">
              <div style="display:flex; justify-content:space-between; width:100%;">
                <span class="badge" style="background:${e.tipo==='rota'?'var(--badge-neutral-bg)':'var(--danger-soft)'};color:${e.tipo==='rota'?'var(--ink-soft)':'var(--danger)'};">${e.tipo==='excecao_nao_tratada'?'Exceção crítica':e.tipo==='promise_rejeitada'?'Promise sem tratamento':'Erro de rota'}</span>
                <span class="historico-item-data">${formatDateHora(e.createdAt)}</span>
              </div>
              <span class="historico-item-texto">${esc(e.mensagem)}</span>
            </div>
          `).join('')}
        </div>
      ` : `<p class="dash-empty">Nenhum erro registrado — tudo tranquilo por aqui.</p>`)}
    </div>
  `;
}

/* ---------- página: Automações ---------- */
function renderAutomacoesPage(){
  if(!automacoesLoaded){
    return `<div class="page-head"><div><h1>Automações</h1><p>Carregando…</p></div></div>`;
  }
  return `
    <div class="page-head">
      <div>
        <h1>Automações</h1>
        <p>Ações automáticas quando um cliente entra numa coluna</p>
      </div>
      <button class="btn-primary" data-action="open-new-automacao">+ Nova automação</button>
    </div>
    ${automacoes.length ? `
      <div class="automacoes-list">
        ${automacoes.map(a=>{
          const coluna = board.columns.find(c=>c.id===a.colunaGatilhoId);
          const gatilhoTexto = a.gatilhoTipo === 'tempo_parado'
            ? `fica <b>${(a.acaoParams&&a.acaoParams.diasParado)||5}+ dias parado</b> em`
            : `entra em`;
          const acaoTexto = a.acaoTipo === 'criar_tarefa'
            ? `cria a tarefa "${esc((a.acaoParams&&a.acaoParams.titulo)||'Follow-up automático')}"`
            : `move pra "${esc((board.columns.find(c=>c.id===(a.acaoParams&&a.acaoParams.colunaDestinoId))||{}).nome || '—')}"`;
          return `
            <div class="automacao-card ${a.ativa?'':'automacao-inativa'}">
              <div class="contrato-card-head">
                <div>
                  <h3 class="contrato-card-title">${esc(a.nome)}</h3>
                  <p class="contrato-card-note">Quando o cliente ${gatilhoTexto} <b>${esc(coluna?coluna.nome:'coluna removida')}</b> → ${acaoTexto}</p>
                </div>
                <div class="contrato-card-actions">
                  <span class="switch ${a.ativa?'on':''}" data-action="toggle-automacao" data-automacao-id="${a.id}" title="${a.ativa?'Ativa':'Inativa'}"><span class="switch-knob"></span></span>
                  <button class="icon-btn" data-action="open-edit-automacao" data-automacao-id="${a.id}" title="Editar">${ICON_EDIT}</button>
                  <button class="icon-btn" data-action="delete-automacao" data-automacao-id="${a.id}" title="Excluir">${ICON_TRASH}</button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    ` : `<div class="tasks-empty">Nenhuma automação criada ainda.</div>`}
  `;
}

/* ---------- página: Fluxos ---------- */
function renderFluxosPage(){
  if(!fluxosLoaded){
    return `<div class="page-head"><div><h1>Fluxos</h1><p>Carregando…</p></div></div>`;
  }
  return `
    <div class="page-head">
      <div>
        <h1>Fluxos</h1>
        <p>Sequências de etapas ao longo do tempo, a partir de quando o cliente entra numa coluna</p>
      </div>
      <button class="btn-primary" data-action="open-new-fluxo">+ Novo fluxo</button>
    </div>
    ${fluxos.length ? `
      <div class="automacoes-list">
        ${fluxos.map(f=>{
          const coluna = board.columns.find(c=>c.id===f.colunaGatilhoId);
          const temMensagem = (f.etapas||[]).some(e=>e.tipo==='mensagem');
          return `
            <div class="automacao-card ${f.ativo?'':'automacao-inativa'}">
              <div class="contrato-card-head">
                <div>
                  <h3 class="contrato-card-title">${esc(f.nome)}</h3>
                  <p class="contrato-card-note">
                    Começa quando entra em <b>${esc(coluna?coluna.nome:'coluna removida')}</b> ·
                    ${(f.etapas||[]).length} etapa${(f.etapas||[]).length===1?'':'s'} ·
                    ${f.emAndamento||0} cliente${(f.emAndamento||0)===1?'':'s'} em andamento
                    ${temMensagem ? ' · <span style="color:var(--danger)">envia WhatsApp</span>' : ''}
                  </p>
                </div>
                <div class="contrato-card-actions">
                  <span class="switch ${f.ativo?'on':''}" data-action="toggle-fluxo" data-fluxo-id="${f.id}" title="${f.ativo?'Ativo':'Inativo'}"><span class="switch-knob"></span></span>
                  <button class="icon-btn" data-action="open-edit-fluxo" data-fluxo-id="${f.id}" title="Editar">${ICON_EDIT}</button>
                  <button class="icon-btn" data-action="delete-fluxo" data-fluxo-id="${f.id}" title="Excluir">${ICON_TRASH}</button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    ` : `<div class="tasks-empty">Nenhum fluxo criado ainda.</div>`}
  `;
}

/* ---------- página: Agendamentos ---------- */
function renderAgendamentosPage(){
  if(!agendamentosLoaded){
    return `<div class="page-head"><div><h1>Agendar Mensagem</h1><p>Carregando…</p></div></div>`;
  }
  return `
    <div class="page-head">
      <div>
        <h1>Agendar Mensagem</h1>
        <p>Tudo que está programado pra enviar, o que já saiu, e o que foi cancelado ou falhou</p>
      </div>
      <button class="btn-primary" data-action="open-new-agendamento">+ Nova mensagem</button>
    </div>
    <div class="metric-grid">
      <div class="metric-card"><div class="metric-card-top"><span>A enviar</span></div><div class="metric-value">${agendamentosContagem.pendente||0}</div></div>
      <div class="metric-card"><div class="metric-card-top"><span>Enviadas</span></div><div class="metric-value">${agendamentosContagem.enviada||0}</div></div>
      <div class="metric-card"><div class="metric-card-top"><span>Canceladas</span></div><div class="metric-value">${agendamentosContagem.cancelada||0}</div></div>
      <div class="metric-card"><div class="metric-card-top"><span>Falhas</span></div><div class="metric-value">${agendamentosContagem.falhou||0}</div></div>
    </div>
    ${agendamentos.length ? `
      <div class="leads-table-wrap">
        <table class="leads-table">
          <thead><tr><th>Cliente</th><th>Mensagem</th><th>Data/hora</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            ${agendamentos.map(a=>`
              <tr>
                <td>${esc(a.clienteNome)}</td>
                <td>${esc((a.texto||'').slice(0,60))}${(a.texto||'').length>60?'…':''}</td>
                <td>${formatDateHora(a.agendadoPara)}</td>
                <td>${agendamentoStatusLabel(a.status)}${a.status==='falhou' && a.erro ? ` <span class="settings-page-note">(${esc(a.erro)})</span>` : ''}</td>
                <td>
                  ${a.status==='pendente' ? `<button class="icon-btn" data-action="cancelar-agendamento" data-agendamento-id="${a.id}" title="Cancelar">✕</button>` : ''}
                  <button class="icon-btn" data-action="excluir-agendamento" data-agendamento-id="${a.id}" title="Excluir permanentemente">${ICON_TRASH}</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : `<div class="tasks-empty">Nenhuma mensagem agendada ainda.</div>`}
  `;
}

/* ---------- página: Importar/Exportar ---------- */
function renderImportExportPage(){
  return `
    <div class="page-head">
      <div>
        <h1>Importar/Exportar</h1>
        <p>Importe uma planilha (.csv ou .xlsx) — os dados viram "possíveis leads" até você completar e confirmar cada um.</p>
      </div>
    </div>

    <div class="settings-page-section">
      <h3>1. Importar planilha</h3>
      <div class="import-linha">
        <input type="file" id="planilha-input" accept=".csv,.xlsx,.xls" hidden />
        <button type="button" class="btn-outline" data-action="escolher-planilha">Escolher planilha (.xlsx ou .csv)</button>
        <span class="import-arquivo">${importPlanilhaNomeArquivo ? `
          <span class="import-nome" title="${esc(importPlanilhaNomeArquivo)}">${esc(importPlanilhaNomeArquivo)}</span>
          <button type="button" class="icon-btn import-x" data-action="fechar-planilha" title="Remover planilha" ${importandoPlanilha?'disabled':''}>✕</button>
        ` : 'Nenhum arquivo escolhido'}</span>
        <button type="button" class="import-modelo" data-action="baixar-modelo-planilha">Baixar planilha modelo</button>
      </div>
      ${importPlanilhaColunas.length ? `
        <div class="import-painel ${importPainelAbrindo?'':'aberto'}">
          <div class="import-painel-inner">
            <p class="settings-page-note" style="margin-top:14px;">${importPlanilhaLinhas.length} linha(s) encontrada(s). Escolha qual coluna da planilha é qual campo:</p>
            <div class="field-row">
              <div class="field">
                <label>Coluna do nome</label>
                <select id="map-nome">
                  <option value="">(nenhuma)</option>
                  ${importPlanilhaColunas.map(c=>`<option value="${esc(c)}" ${importMapNome===c?'selected':''}>${esc(c)}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label>Coluna do telefone</label>
                <select id="map-telefone">
                  <option value="">(nenhuma)</option>
                  ${importPlanilhaColunas.map(c=>`<option value="${esc(c)}" ${importMapTelefone===c?'selected':''}>${esc(c)}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label>Coluna do serviço desejado</label>
                <select id="map-servico">
                  <option value="">(nenhuma)</option>
                  ${importPlanilhaColunas.map(c=>`<option value="${esc(c)}" ${importMapServico===c?'selected':''}>${esc(c)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="leads-table-wrap import-previa">
              <table class="leads-table">
                <thead><tr>${importPlanilhaColunas.slice(0,6).map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead>
                <tbody>
                  ${importPlanilhaLinhas.slice(0,5).map(l=>`<tr>${importPlanilhaColunas.slice(0,6).map(c=>`<td>${esc(String(l[c]==null?'':l[c]))}</td>`).join('')}</tr>`).join('')}
                </tbody>
              </table>
            </div>
            ${importPlanilhaLinhas.length>5 ? `<p class="settings-page-note">Mostrando as 5 primeiras de ${importPlanilhaLinhas.length} linhas.</p>` : ''}
            ${importPlanilhaMsg ? `<p class="settings-page-msg ${importPlanilhaMsg.tipo}">${esc(importPlanilhaMsg.texto)}</p>` : ''}
            <button class="btn-primary" id="confirmar-import-planilha" ${importandoPlanilha?'disabled':''}>${importandoPlanilha?'Importando…':'Importar planilha'}</button>
          </div>
        </div>
      ` : (importPlanilhaMsg ? `<p class="settings-page-msg ${importPlanilhaMsg.tipo}">${esc(importPlanilhaMsg.texto)}</p>` : '')}
    </div>

    <div class="settings-page-section">
      <h3>2. Possíveis leads (${possiveisLeads.length})</h3>
      <p class="settings-page-note">Complete as informações de cada um, ou passe vários de uma vez para os Leads. O início de contato fica com a data de hoje e o mês de venda em branco.</p>
      ${(possiveisLeadsCarregados && possiveisLeads.length) ? `
        <div class="settings-btn-row" style="margin-bottom:10px; align-items:center; flex-wrap:wrap;">
          ${podeAtribuirLeads() ? `<select id="possiveis-destino" title="Para quem vão os leads">${opcoesDestinoEquipe(possiveisDestinoId, true)}</select>` : ''}
          <button class="btn-primary" data-action="possiveis-passar-todos" ${possiveisPassandoLote?'disabled':''}>Passar todos para Leads (${possiveisLeads.length})</button>
          <button class="btn-outline" data-action="possiveis-passar-selecionados" ${(possiveisPassandoLote||!possiveisSelecionados.size)?'disabled':''}>Passar selecionados (${possiveisSelecionados.size})</button>
        </div>` : ''}
      ${possiveisLoteMsg ? `<p class="settings-page-msg ${possiveisLoteMsg.tipo}">${esc(possiveisLoteMsg.texto)}</p>` : ''}
      ${!possiveisLeadsCarregados ? `<p class="settings-page-note">Carregando…</p>` : (possiveisLeads.length ? `
        <div class="leads-table-wrap">
          <table class="leads-table">
            <thead><tr><th style="width:34px;"><input type="checkbox" data-action="possiveis-select-all" ${(possiveisLeads.length && possiveisLeads.every(l=>possiveisSelecionados.has(l.id)))?'checked':''} /></th><th>Nome</th><th>Telefone</th><th>Serviço desejado</th><th>Ações</th></tr></thead>
            <tbody>
              ${possiveisLeads.map(l=>`
                <tr>
                  <td><input type="checkbox" data-action="possiveis-select-um" data-lead-id="${l.id}" ${possiveisSelecionados.has(l.id)?'checked':''} /></td>
                  <td>${esc(l.nome)||'—'}</td>
                  <td>${esc(l.telefone)||'—'}</td>
                  <td>${esc(l.tipoServico)||'—'}</td>
                  <td>
                    <button class="btn-outline" data-action="completar-possivel-lead" data-lead-id="${l.id}">Completar</button>
                    <button class="icon-btn" data-action="descartar-possivel-lead" data-lead-id="${l.id}" title="Descartar">${ICON_TRASH}</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `<div class="tasks-empty">Nenhum possível lead pendente.</div>`)}
    </div>

    <div class="settings-page-section">
      <h3>3. Exportar</h3>
      <p class="settings-page-note">Baixa todos os clientes já confirmados (que estão na aba Leads), em Excel (.xlsx) ou CSV.</p>
      <div class="settings-btn-row">
        <button class="btn-outline" data-action="exportar-leads-xlsx">Exportar Leads (.xlsx)</button>
        <button class="btn-outline" data-action="exportar-leads">Exportar Leads (CSV)</button>
      </div>
    </div>
  `;
}

/* ---------- página: Suporte ---------- */
function renderSuportePage(){
  return `
    <div class="page-head">
      <div>
        <h1>Suporte</h1>
        <p>Dúvidas e contato</p>
      </div>
    </div>
    <div class="settings-page-grid">
      <div class="settings-page-section">
        <h3>Perguntas frequentes</h3>
        <p class="settings-page-note"><b>Como conecto o WhatsApp Business?</b><br/>Configurações → Integrações → WhatsApp Business API, seguindo o passo a passo do README do projeto.</p>
        <p class="settings-page-note"><b>Por que uma mensagem de Disparo não chegou?</b><br/>A API do WhatsApp só permite texto livre pra quem te escreveu nas últimas 24h.</p>
        <p class="settings-page-note"><b>Como mudo a cor do painel?</b><br/>Configurações → Aparência.</p>
        <p class="settings-page-note"><b>Como conecto a Google Agenda?</b><br/>Configurações → Integrações → Google Agenda.</p>
      </div>
      <div class="settings-page-section">
        <h3>Contato</h3>
        <p class="settings-page-note">Encontrou um problema ou tem uma sugestão pro painel? Fale com quem administra esse CRM.</p>
        <a class="btn-primary" href="mailto:?subject=Painel%20CRM%20-%20Suporte" style="display:inline-block; text-decoration:none; text-align:center;">Enviar e-mail</a>
      </div>
    </div>
  `;
}

/* ---------- modal do contrato de comissão ---------- */
function openNewContrato(){
  contratoModalForm = { __isNew:true, id:null, desc:'', scope:'Pessoal', creditoValor:0, tipoCarta:'imovel', date: comissoesMonth + '-01' };
  renderContratoModal();
}
function openEditContrato(id){
  const c = contratos.find(x=>x.id===id);
  if(!c) return;
  contratoModalForm = { __isNew:false, id:c.id, desc:c.desc, scope:c.scope, creditoValor:c.creditoValor, tipoCarta:c.tipoCarta||'imovel', date:c.date };
  renderContratoModal();
}
function closeContratoModal(){ contratoModalForm = null; document.getElementById('modal-root').innerHTML=''; }

// Genérico pra N blocos — funciona pra qualquer regra, inclusive as que o usuário criar
// na engrenagem (2 blocos, 1 bloco, 5 blocos, o que for).
function previewComissaoHtml(prev){
  const linhas = prev.blocos.map(b=>
    b.parcelas === 1
      ? `🔹 Parcela única: <b>${fmtBRL(b.value)}</b>`
      : `🔹 ${b.parcelas} parcelas: <b>${fmtBRL(b.value)}</b> cada`
  ).join('<br/>');
  return `
    ${linhas}<br/>
    Total: ${prev.parcelas}x parcela${prev.parcelas===1?'':'s'} · Total líquido da comissão: <b>${fmtBRL(prev.total)}</b>
  `;
}
function renderContratoModal(){
  const root = document.getElementById('modal-root');
  if(!contratoModalForm){ root.innerHTML=''; return; }
  const f = contratoModalForm;
  const preview = calcComissaoPreviewPorTipo(f.creditoValor, f.tipoCarta);

  root.innerHTML = `
    <div class="overlay" id="contrato-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>${f.__isNew ? 'Novo contrato de comissão' : 'Editar contrato'}</h3>
          <button id="contrato-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Cliente / contrato</label>
            <input type="text" id="c-desc" value="${esc(f.desc)}" placeholder="Ex: Consórcio — Contrato Imóvel 118" />
          </div>
          <div class="field">
            <label>Escopo</label>
            <div class="scope-toggle" id="c-scope-toggle">
              <div class="scope-btn ${f.scope==='Pessoal'?'active':''}" data-scope="Pessoal">Pessoal</div>
              <div class="scope-btn ${f.scope==='Empresa'?'active':''}" data-scope="Empresa">Empresa</div>
            </div>
          </div>
          <div class="field">
            <label>Tipo de carta de crédito</label>
            <select id="c-tipo-carta">
              ${renderOpcoesTipoCarta(f.tipoCarta)}
            </select>
          </div>
          <div class="field">
            <label>Valor da carta de crédito vendida</label>
            <div class="money-wrap">
              <span>R$</span>
              <input type="text" inputmode="numeric" id="c-credito" value="${f.creditoValor ? Number(f.creditoValor).toLocaleString('pt-BR') : ''}" placeholder="0" />
            </div>
          </div>
          <div class="field">
            <label>Mês da 1ª parcela</label>
            <input type="month" id="c-mes" value="${(f.date||'').slice(0,7)}" />
            <p class="settings-page-note" id="c-mes-nota">${textoNotaMesContrato(f.tipoCarta)}</p>
          </div>
          <div class="calc-preview" id="c-preview">
            ${previewComissaoHtml(preview)}
          </div>
          <p class="calc-preview-note">O valor de cada parcela é calculado automaticamente a partir da carta de crédito, já líquido.</p>
        </div>
        <div class="modal-foot">
          ${!f.__isNew ? `<button class="delete-link" id="c-delete">🗑 Excluir</button>` : '<span></span>'}
          <div class="modal-foot-actions">
            <button class="btn-outline" id="c-cancel">Cancelar</button>
            <button class="btn-save" id="c-save">${f.__isNew ? 'Criar contrato' : 'Salvar alterações'}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('contrato-modal-close').addEventListener('click', closeContratoModal);
  document.getElementById('c-cancel').addEventListener('click', closeContratoModal);
  document.getElementById('contrato-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='contrato-modal-overlay') closeContratoModal(); });

  document.getElementById('c-desc').addEventListener('input', (e)=> contratoModalForm.desc = e.target.value);
  document.getElementById('c-mes').addEventListener('change', (e)=> contratoModalForm.date = e.target.value + '-01');

  document.querySelectorAll('#c-scope-toggle .scope-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      contratoModalForm.scope = btn.dataset.scope;
      document.querySelectorAll('#c-scope-toggle .scope-btn').forEach(b=>{
        b.classList.toggle('active', b.dataset.scope===contratoModalForm.scope);
      });
    });
  });

  document.getElementById('c-tipo-carta').addEventListener('change', (e)=>{
    contratoModalForm.tipoCarta = e.target.value;
    const prev = calcComissaoPreviewPorTipo(contratoModalForm.creditoValor, contratoModalForm.tipoCarta);
    const previewEl = document.getElementById('c-preview');
    if(previewEl) previewEl.innerHTML = previewComissaoHtml(prev);
    const notaMes = document.getElementById('c-mes-nota');
    if(notaMes) notaMes.textContent = textoNotaMesContrato(contratoModalForm.tipoCarta);
  });

  const creditoInput = document.getElementById('c-credito');
  creditoInput.addEventListener('input', (e)=>{
    const { numero, texto } = maskInteiro(e.target.value);
    contratoModalForm.creditoValor = numero;
    e.target.value = texto;
    const prev = calcComissaoPreviewPorTipo(numero, contratoModalForm.tipoCarta);
    const previewEl = document.getElementById('c-preview');
    if(previewEl) previewEl.innerHTML = previewComissaoHtml(prev);
  });

  document.getElementById('c-save').addEventListener('click', saveContratoFromModal);
  if(!f.__isNew){
    document.getElementById('c-delete').addEventListener('click', ()=>{
      showConfirm({
        message: 'Excluir este contrato de comissão? Essa ação não pode ser desfeita.',
        onConfirm: ()=>{ deleteContratoById(f.id); closeContratoModal(); closeConfirm(); },
      });
    });
  }
}

/* ---------- modal: Regras de Comissão (engrenagem em Comissões) ----------
   Duas telas dentro do mesmo modal: lista (todas as regras do usuário) e editor
   (uma regra por vez — nome, mês independente e os blocos de parcelas, como uma
   planilha: cada linha é "N parcelas de X% da carta"). */
function openRegrasComissaoModal(){
  regrasModalAberto = true;
  regraEditForm = null;
  renderRegrasModal();
  if(!regrasComissaoLoaded) loadRegrasComissao();
}
function closeRegrasComissaoModal(){
  regrasModalAberto = false;
  regraEditForm = null;
  document.getElementById('modal-root').innerHTML = '';
  renderApp(); // a lista de contratos usa as regras pra mostrar nome/blocos — garante que reflita qualquer alteração
}
function abrirNovaRegra(){
  regraEditForm = { __isNew:true, id:null, nome:'', mesIndependente:false, blocos:[{ parcelas:1, percentual:0 }] };
  renderRegrasModal();
}
function abrirEditarRegra(id){
  const r = regrasComissao.find(x=>x.id===id);
  if(!r) return;
  regraEditForm = {
    __isNew:false, id:r.id, nome:r.nome, mesIndependente:!!r.mesIndependente,
    // o back-end guarda percentual como fração (0.016); no formulário mostramos "humano" (1.6)
    blocos: (r.blocos||[]).map(b=>({ parcelas:b.parcelas, percentual: Math.round(b.percentual*100*1000000)/1000000 })),
  };
  renderRegrasModal();
}
function renderRegraLinhaBloco(b, idx, podeRemover){
  return `
    <div class="regra-bloco-row">
      <div class="field">
        <label>Parcelas</label>
        <input type="number" min="1" step="1" class="regra-bloco-parcelas" data-idx="${idx}" value="${b.parcelas}" />
      </div>
      <div class="field">
        <label>% da carta (por parcela)</label>
        <input type="number" min="0" step="any" class="regra-bloco-percentual" data-idx="${idx}" value="${b.percentual}" />
      </div>
      <button type="button" class="icon-btn" data-action="remover-bloco-regra" data-idx="${idx}" title="Remover linha" ${podeRemover?'':'disabled'}>${ICON_TRASH}</button>
    </div>
  `;
}
function htmlPreviewRegraEditor(f){
  const REF = 100000; // carta de referência só pra simular — o valor real usa a carta de cada contrato
  const blocos = f.blocos.map(b=>({
    parcelas: Math.max(1, parseInt(b.parcelas,10)||1),
    value: Math.round(REF * ((parseFloat(b.percentual)||0)/100) * 100) / 100,
  }));
  const total = Math.round(blocos.reduce((s,b)=>s+b.value*b.parcelas,0)*100)/100;
  const totalParcelas = blocos.reduce((s,b)=>s+b.parcelas,0);
  const linhas = blocos.map(b=> b.parcelas===1
    ? `🔹 Parcela única: <b>${fmtBRL(b.value)}</b>`
    : `🔹 ${b.parcelas} parcelas: <b>${fmtBRL(b.value)}</b> cada`
  ).join('<br/>');
  return `${linhas}<br/>Total: ${totalParcelas}x parcela${totalParcelas===1?'':'s'} · Total líquido: <b>${fmtBRL(total)}</b>`;
}
function atualizarPreviewRegraEditor(){
  const el = document.getElementById('re-preview');
  if(el && regraEditForm) el.innerHTML = htmlPreviewRegraEditor(regraEditForm);
}
function htmlRegrasLista(){
  return `
    <div class="overlay" id="regras-modal-overlay">
      <div class="modal modal-lg">
        <div class="modal-head">
          <h3>Regras de comissão</h3>
          <button id="regras-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <p class="settings-page-note">Cada regra define como uma comissão é calculada, em blocos de parcelas — como uma planilha. Crie, renomeie, edite ou exclua regras à vontade: comissões já lançadas guardam o cálculo da época e não mudam retroativamente.</p>
          ${!regrasComissaoLoaded ? `<div class="tasks-empty">Carregando…</div>` : (regrasComissao.length ? `
            <div class="regras-lista">
              ${regrasComissao.map(r=>`
                <div class="regra-row">
                  <div class="regra-row-info">
                    <div class="regra-row-nome">${esc(r.nome)} ${r.mesIndependente?'<span class="badge badge-neutral" title="O mês da comissão pode ser editado sem alterar o mês do lead">Mês independente</span>':''}</div>
                    <div class="regra-row-blocos">${(r.blocos||[]).map(b=>`${b.parcelas}x ${(b.percentual*100).toLocaleString('pt-BR',{maximumFractionDigits:6})}%`).join(' · ')}</div>
                  </div>
                  <div class="regra-row-actions">
                    <button class="icon-btn" data-action="editar-regra" data-regra-id="${r.id}" title="Editar">${ICON_EDIT}</button>
                    <button class="icon-btn" data-action="excluir-regra" data-regra-id="${r.id}" title="Excluir">${ICON_TRASH}</button>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `<div class="tasks-empty">Nenhuma regra cadastrada ainda.</div>`)}
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="regras-modal-close-2">Fechar</button>
            <button class="btn-save" data-action="nova-regra">+ Nova regra</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
function htmlRegraEditor(){
  const f = regraEditForm;
  return `
    <div class="overlay" id="regras-modal-overlay">
      <div class="modal modal-lg">
        <div class="modal-head">
          <h3>${f.__isNew ? 'Nova regra de comissão' : 'Editar regra'}</h3>
          <button id="regras-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Nome</label>
            <input type="text" id="re-nome" value="${esc(f.nome)}" placeholder="Ex: Consórcio Pesado" />
          </div>
          <div class="field">
            <label class="checkbox-item"><input type="checkbox" id="re-mes-independente" ${f.mesIndependente?'checked':''} /> Mês da comissão independente do mês do lead (pra pagamentos que demoram a acontecer de verdade)</label>
          </div>
          <div class="field">
            <label>Blocos de parcelas</label>
            <div class="regra-blocos-cabecalho">
              <span>Parcelas</span><span>% da carta (por parcela)</span><span></span>
            </div>
            <div id="re-blocos-lista">
              ${f.blocos.map((b,idx)=>renderRegraLinhaBloco(b,idx,f.blocos.length>1)).join('')}
            </div>
            <button type="button" class="btn-outline" id="re-add-bloco">+ Adicionar linha</button>
          </div>
          <div class="calc-preview" id="re-preview">${htmlPreviewRegraEditor(f)}</div>
          <p class="calc-preview-note">Simulação com uma carta de R$ 100.000 — o valor real usa a carta de cada contrato.</p>
        </div>
        <div class="modal-foot">
          ${!f.__isNew ? `<button class="delete-link" id="re-delete">🗑 Excluir</button>` : '<span></span>'}
          <div class="modal-foot-actions">
            <button class="btn-outline" id="re-cancel">‹ Voltar</button>
            <button class="btn-save" id="re-save">${f.__isNew ? 'Criar regra' : 'Salvar alterações'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
function renderRegrasModal(){
  const root = document.getElementById('modal-root');
  if(!regrasModalAberto){ root.innerHTML=''; return; }
  root.innerHTML = regraEditForm ? htmlRegraEditor() : htmlRegrasLista();
  ligarBindingsRegrasModal();
}
function ligarBindingsRegrasModal(){
  const closeBtn = document.getElementById('regras-modal-close');
  if(closeBtn) closeBtn.addEventListener('click', closeRegrasComissaoModal);
  const overlay = document.getElementById('regras-modal-overlay');
  if(overlay) overlay.addEventListener('click', (e)=>{ if(e.target.id==='regras-modal-overlay') closeRegrasComissaoModal(); });

  if(!regraEditForm){
    const closeBtn2 = document.getElementById('regras-modal-close-2');
    if(closeBtn2) closeBtn2.addEventListener('click', closeRegrasComissaoModal);
    document.querySelectorAll('[data-action="editar-regra"]').forEach(btn=>{
      btn.addEventListener('click', ()=> abrirEditarRegra(btn.dataset.regraId));
    });
    document.querySelectorAll('[data-action="excluir-regra"]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.dataset.regraId;
        const r = regrasComissao.find(x=>x.id===id);
        showConfirm({
          message: `Excluir a regra "${r?r.nome:''}"? Comissões já lançadas com ela continuam iguais, mas ela deixa de aparecer como opção pra novos contratos e leads.`,
          confirmLabel: 'Excluir',
          onConfirm: async ()=>{
            closeConfirm();
            try{
              await apiRequest('DELETE', `/regras-comissao/${id}`);
              regrasComissao = regrasComissao.filter(x=>x.id!==id);
              renderRegrasModal();
            }catch(e){
              errorMsg = e.message || 'Não foi possível excluir essa regra.';
              renderApp();
            }
          },
        });
      });
    });
    const novaBtn = document.querySelector('[data-action="nova-regra"]');
    if(novaBtn) novaBtn.addEventListener('click', abrirNovaRegra);
    return;
  }

  document.getElementById('re-nome').addEventListener('input', (e)=> regraEditForm.nome = e.target.value);
  document.getElementById('re-mes-independente').addEventListener('change', (e)=> regraEditForm.mesIndependente = e.target.checked);
  document.querySelectorAll('.regra-bloco-parcelas').forEach(inp=>{
    inp.addEventListener('input', (e)=>{
      regraEditForm.blocos[parseInt(e.target.dataset.idx,10)].parcelas = e.target.value;
      atualizarPreviewRegraEditor();
    });
  });
  document.querySelectorAll('.regra-bloco-percentual').forEach(inp=>{
    inp.addEventListener('input', (e)=>{
      regraEditForm.blocos[parseInt(e.target.dataset.idx,10)].percentual = e.target.value;
      atualizarPreviewRegraEditor();
    });
  });
  document.querySelectorAll('[data-action="remover-bloco-regra"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(regraEditForm.blocos.length<=1) return; // sempre precisa de ao menos 1 bloco
      regraEditForm.blocos.splice(parseInt(btn.dataset.idx,10),1);
      renderRegrasModal();
    });
  });
  const addBtn = document.getElementById('re-add-bloco');
  if(addBtn) addBtn.addEventListener('click', ()=>{
    regraEditForm.blocos.push({ parcelas:1, percentual:0 });
    renderRegrasModal();
  });
  document.getElementById('re-cancel').addEventListener('click', ()=>{ regraEditForm=null; renderRegrasModal(); });
  if(!regraEditForm.__isNew){
    document.getElementById('re-delete').addEventListener('click', ()=>{
      const f = regraEditForm;
      showConfirm({
        message: `Excluir a regra "${f.nome}"? Comissões já lançadas com ela continuam iguais, mas ela deixa de aparecer como opção pra novos contratos e leads.`,
        confirmLabel: 'Excluir',
        onConfirm: async ()=>{
          closeConfirm();
          try{
            await apiRequest('DELETE', `/regras-comissao/${f.id}`);
            regrasComissao = regrasComissao.filter(x=>x.id!==f.id);
            regraEditForm = null;
            renderRegrasModal();
          }catch(e){
            errorMsg = e.message || 'Não foi possível excluir essa regra.';
            renderApp();
          }
        },
      });
    });
  }
  document.getElementById('re-save').addEventListener('click', salvarRegraComissao);
}
async function salvarRegraComissao(){
  const f = regraEditForm;
  if(!f.nome || !f.nome.trim()){
    errorMsg = 'Dê um nome pra essa regra de comissão.';
    renderApp();
    return;
  }
  const blocos = f.blocos.map(b=>({ parcelas: parseInt(b.parcelas,10)||1, percentual: parseFloat(b.percentual)||0 }));
  const payload = { nome: f.nome.trim(), mesIndependente: !!f.mesIndependente, blocos };
  const saveBtn = document.getElementById('re-save');
  if(saveBtn){ saveBtn.disabled = true; saveBtn.textContent = 'Salvando…'; }
  try{
    let regra;
    if(f.__isNew){
      regra = await apiRequest('POST', '/regras-comissao', payload);
      regrasComissao = [...regrasComissao, regra].sort((a,b)=>a.ordem-b.ordem);
    }else{
      regra = await apiRequest('PUT', `/regras-comissao/${f.id}`, payload);
      regrasComissao = regrasComissao.map(r=> r.id===regra.id ? regra : r).sort((a,b)=>a.ordem-b.ordem);
    }
    regraEditForm = null;
    renderRegrasModal();
  }catch(e){
    errorMsg = e.message || 'Não foi possível salvar essa regra.';
    renderApp();
    if(saveBtn){ saveBtn.disabled=false; saveBtn.textContent = f.__isNew?'Criar regra':'Salvar alterações'; }
  }
}

/* ---------- modal de automação ---------- */
function openNewAutomacao(colunaPreSelecionada){
  automacaoModalForm = {
    __isNew:true, id:null, nome:'',
    colunaGatilhoId: colunaPreSelecionada || (board.columns[0]||{}).id || '',
    gatilhoTipo:'entrada_coluna',
    acaoTipo:'criar_tarefa',
    acaoParams:{ titulo:'', diasParaVencimento:3, diasParado:5, colunaDestinoId:(board.columns[0]||{}).id || '' },
  };
  renderAutomacaoModal();
}
function openEditAutomacao(id){
  const a = automacoes.find(x=>x.id===id);
  if(!a) return;
  automacaoModalForm = {
    __isNew:false, id:a.id, nome:a.nome, colunaGatilhoId:a.colunaGatilhoId,
    gatilhoTipo: a.gatilhoTipo || 'entrada_coluna', acaoTipo:a.acaoTipo,
    acaoParams:{ titulo:'', diasParaVencimento:3, diasParado:5, colunaDestinoId:'', ...(a.acaoParams||{}) },
  };
  renderAutomacaoModal();
}
function closeAutomacaoModal(){ automacaoModalForm = null; document.getElementById('modal-root').innerHTML=''; }

function renderAutomacaoAcaoParams(f){
  if(f.acaoTipo === 'criar_tarefa'){
    return `
      <div class="field">
        <label>Título da tarefa</label>
        <input type="text" id="am-tarefa-titulo" value="${esc(f.acaoParams.titulo||'')}" placeholder="Ex: Ligar pra confirmar interesse" />
      </div>
      <div class="field">
        <label>Vencimento (dias a partir de quando a tarefa é criada)</label>
        <input type="number" id="am-tarefa-dias" value="${f.acaoParams.diasParaVencimento||3}" min="1" />
      </div>
    `;
  }
  return `
    <div class="field">
      <label>Coluna de destino</label>
      <select id="am-coluna-destino">
        ${board.columns.map(c=>`<option value="${c.id}" ${f.acaoParams.colunaDestinoId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
      </select>
    </div>
  `;
}
function bindAutomacaoAcaoParams(){
  const tituloEl = document.getElementById('am-tarefa-titulo');
  if(tituloEl) tituloEl.addEventListener('input', (e)=> automacaoModalForm.acaoParams.titulo = e.target.value);
  const diasEl = document.getElementById('am-tarefa-dias');
  if(diasEl) diasEl.addEventListener('input', (e)=> automacaoModalForm.acaoParams.diasParaVencimento = parseInt(e.target.value,10)||3);
  const destinoEl = document.getElementById('am-coluna-destino');
  if(destinoEl) destinoEl.addEventListener('change', (e)=> automacaoModalForm.acaoParams.colunaDestinoId = e.target.value);
}

function renderAutomacaoModal(){
  const root = document.getElementById('modal-root');
  if(!automacaoModalForm){ root.innerHTML=''; return; }
  const f = automacaoModalForm;

  root.innerHTML = `
    <div class="overlay" id="automacao-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>${f.__isNew ? 'Nova automação' : 'Editar automação'}</h3>
          <button id="automacao-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Nome</label>
            <input type="text" id="am-nome" value="${esc(f.nome)}" placeholder="Ex: Agendar follow-up de propostas" />
          </div>
          <div class="field">
            <label>Coluna</label>
            <select id="am-coluna-gatilho">
              ${board.columns.map(c=>`<option value="${c.id}" ${f.colunaGatilhoId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Disparar quando</label>
            <select id="am-gatilho-tipo">
              <option value="entrada_coluna" ${f.gatilhoTipo==='entrada_coluna'?'selected':''}>O cliente entrar nessa coluna</option>
              <option value="tempo_parado" ${f.gatilhoTipo==='tempo_parado'?'selected':''}>O cliente ficar parado nessa coluna por X dias</option>
            </select>
          </div>
          <div id="am-dias-parado-wrap" style="${f.gatilhoTipo==='tempo_parado'?'':'display:none;'}">
            <div class="field">
              <label>Depois de quantos dias parado</label>
              <input type="number" id="am-dias-parado" value="${f.acaoParams.diasParado||5}" min="1" />
            </div>
            <p class="settings-page-note">Checado a cada hora pelo servidor — não é em tempo real.</p>
          </div>
          <div class="field">
            <label>Ação</label>
            <select id="am-acao-tipo">
              <option value="criar_tarefa" ${f.acaoTipo==='criar_tarefa'?'selected':''}>Criar uma tarefa</option>
              <option value="mover_coluna" ${f.acaoTipo==='mover_coluna'?'selected':''}>Mover pra outra coluna</option>
            </select>
          </div>
          <div id="am-acao-params">${renderAutomacaoAcaoParams(f)}</div>
        </div>
        <div class="modal-foot">
          ${!f.__isNew ? `<button class="delete-link" id="am-delete">🗑 Excluir</button>` : '<span></span>'}
          <div class="modal-foot-actions">
            <button class="btn-outline" id="am-cancel">Cancelar</button>
            <button class="btn-save" id="am-save">Salvar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('automacao-modal-close').addEventListener('click', closeAutomacaoModal);
  document.getElementById('am-cancel').addEventListener('click', closeAutomacaoModal);
  document.getElementById('automacao-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='automacao-modal-overlay') closeAutomacaoModal(); });

  document.getElementById('am-nome').addEventListener('input', (e)=> automacaoModalForm.nome = e.target.value);
  document.getElementById('am-coluna-gatilho').addEventListener('change', (e)=> automacaoModalForm.colunaGatilhoId = e.target.value);
  document.getElementById('am-gatilho-tipo').addEventListener('change', (e)=>{
    automacaoModalForm.gatilhoTipo = e.target.value;
    const wrap = document.getElementById('am-dias-parado-wrap');
    if(wrap) wrap.style.display = e.target.value === 'tempo_parado' ? '' : 'none';
  });
  const diasParadoEl = document.getElementById('am-dias-parado');
  if(diasParadoEl) diasParadoEl.addEventListener('input', (e)=> automacaoModalForm.acaoParams.diasParado = parseInt(e.target.value,10)||5);
  document.getElementById('am-acao-tipo').addEventListener('change', (e)=>{
    automacaoModalForm.acaoTipo = e.target.value;
    document.getElementById('am-acao-params').innerHTML = renderAutomacaoAcaoParams(automacaoModalForm);
    bindAutomacaoAcaoParams();
  });
  bindAutomacaoAcaoParams();

  document.getElementById('am-save').addEventListener('click', salvarAutomacao);
  if(!f.__isNew){
    document.getElementById('am-delete').addEventListener('click', ()=>{
      showConfirm({
        message: 'Excluir esta automação? Ela para de rodar imediatamente.',
        onConfirm: ()=>{ excluirAutomacao(f.id); closeAutomacaoModal(); closeConfirm(); },
      });
    });
  }
}

/* ---------- modal de fluxo ---------- */
function openNewFluxo(){
  fluxoModalForm = {
    __isNew:true, id:null, nome:'',
    colunaGatilhoId: (board.columns[0]||{}).id || '',
    etapas: [{ diasAposInicio:0, tipo:'mensagem', params:{ texto:'' } }],
  };
  renderFluxoModal();
}
function openEditFluxo(id){
  const f = fluxos.find(x=>x.id===id);
  if(!f) return;
  fluxoModalForm = {
    __isNew:false, id:f.id, nome:f.nome, colunaGatilhoId:f.colunaGatilhoId,
    etapas: (f.etapas||[]).map(e=>({ diasAposInicio:e.diasAposInicio, tipo:e.tipo, params:{...(e.params||{})} })),
  };
  renderFluxoModal();
}
function closeFluxoModal(){ fluxoModalForm = null; document.getElementById('modal-root').innerHTML=''; }

/* ---------- modal: escolher entre novo cliente ou transferir existente ---------- */
function abrirEscolhaAdicionarLead(colId){
  const root = document.getElementById('modal-root');
  const coluna = board.columns.find(c=>c.id===colId);
  root.innerHTML = `
    <div class="overlay" id="add-lead-choice-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Adicionar cliente em "${esc(coluna?coluna.nome:'')}"</h3>
          <button id="add-lead-choice-close">✕</button>
        </div>
        <div class="modal-body">
          <button type="button" class="add-lead-choice-btn" id="add-lead-choice-novo">
            <span class="add-lead-choice-title">+ Novo cliente</span>
            <span class="add-lead-choice-desc">Cadastrar um cliente que ainda não existe no CRM</span>
          </button>
          <button type="button" class="add-lead-choice-btn" id="add-lead-choice-transferir">
            <span class="add-lead-choice-title">Transferir cliente existente</span>
            <span class="add-lead-choice-desc">Mover pra cá quem já está cadastrado em outra coluna ou funil</span>
          </button>
          <button type="button" class="add-lead-choice-btn" id="add-lead-choice-copiar">
            <span class="add-lead-choice-title">Copiar cliente existente</span>
            <span class="add-lead-choice-desc">Cria uma cópia aqui, mantendo o original intacto no outro lugar</span>
          </button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('add-lead-choice-close').addEventListener('click', ()=>{ root.innerHTML=''; });
  document.getElementById('add-lead-choice-overlay').addEventListener('click', (e)=>{ if(e.target.id==='add-lead-choice-overlay') root.innerHTML=''; });
  document.getElementById('add-lead-choice-novo').addEventListener('click', ()=> openNewCard(colId));
  document.getElementById('add-lead-choice-transferir').addEventListener('click', ()=> abrirPickerLeadsParaColuna(colId, 'transferir'));
  document.getElementById('add-lead-choice-copiar').addEventListener('click', ()=> abrirPickerLeadsParaColuna(colId, 'copiar'));
}

/* ---------- modal: puxar leads existentes pra uma coluna (transferir ou copiar) ---------- */
function abrirPickerLeadsParaColuna(colId, modo){
  colunaLeadsPickerColId = colId;
  colunaLeadsPickerModo = modo || 'transferir';
  colunaLeadsSelecionados = new Set();
  renderColunaLeadsPickerModal();
}
function closeColunaLeadsPickerModal(){
  colunaLeadsPickerColId = null;
  document.getElementById('modal-root').innerHTML = '';
}
async function confirmarMoverLeadsParaColuna(){
  if(colunaLeadsSelecionados.size === 0){ closeColunaLeadsPickerModal(); return; }
  const colId = colunaLeadsPickerColId;
  const copiando = colunaLeadsPickerModo === 'copiar';
  colunaLeadsMovendo = true;
  renderColunaLeadsPickerModal();
  for(const cardId of Array.from(colunaLeadsSelecionados)){
    try{
      if(copiando){
        const original = board.cards.find(c=>c.id===cardId);
        if(!original) continue;
        const copia = await apiRequest('POST', '/cards', {
          columnId: colId, cliente: original.cliente, valor: original.valor,
          temperatura: original.temperatura, telefone: original.telefone,
          obs: original.obs, mes: original.mes, mesInicioContato: original.mesInicioContato,
        });
        board.cards.push(copia);
      } else {
        const atualizado = await apiRequest('PUT', `/cards/${cardId}/move`, { columnId: colId });
        const idx = board.cards.findIndex(c=>c.id===cardId);
        if(idx>-1) board.cards[idx] = atualizado;
      }
    }catch(e){ /* segue tentando os demais selecionados */ }
  }
  colunaLeadsMovendo = false;
  closeColunaLeadsPickerModal();
  renderApp();
}
function renderColunaLeadsPickerModal(){
  const root = document.getElementById('modal-root');
  if(!colunaLeadsPickerColId){ root.innerHTML=''; return; }
  const coluna = board.columns.find(c=>c.id===colunaLeadsPickerColId);
  const copiando = colunaLeadsPickerModo === 'copiar';
  const candidatos = copiando ? board.cards.slice() : board.cards.filter(c=>c.columnId !== colunaLeadsPickerColId);

  root.innerHTML = `
    <div class="overlay" id="cl-picker-overlay">
      <div class="modal modal-lg">
        <div class="modal-head">
          <h3>${copiando ? 'Copiar' : 'Transferir'} leads pra "${esc(coluna?coluna.nome:'')}"</h3>
          <button id="cl-picker-close">✕</button>
        </div>
        <div class="modal-body">
          <p class="settings-page-note">${copiando
            ? 'Escolha quem você quer copiar pra essa coluna. O original continua intacto onde já está.'
            : 'Escolha quem você quer mover pra essa coluna agora. Dá pra pular e arrastar manualmente depois, se preferir.'}</p>
          <div class="settings-btn-row" style="margin-bottom:10px;">
            <button class="btn-outline" id="cl-selecionar-todos">Selecionar todos</button>
            <button class="btn-outline" id="cl-limpar-selecao">Limpar seleção</button>
          </div>
          <div class="disparo-lista-leads" style="max-height:320px;">
            ${candidatos.length ? candidatos.map(c=>{
              const colAtual = board.columns.find(k=>k.id===c.columnId);
              return `
                <label class="disparo-lead-item">
                  <input type="checkbox" class="cl-lead-checkbox" data-card-id="${c.id}" ${colunaLeadsSelecionados.has(c.id)?'checked':''} />
                  <span>${esc(c.cliente)||'Sem nome'} <span class="settings-page-note">${colAtual?esc(colAtual.nome):''}</span></span>
                </label>
              `;
            }).join('') : '<p class="dash-empty">Nenhum outro lead cadastrado ainda.</p>'}
          </div>
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="cl-pular">Pular por agora</button>
            <button class="btn-save" id="cl-confirmar" ${colunaLeadsMovendo?'disabled':''}>${colunaLeadsMovendo ? (copiando?'Copiando…':'Movendo…') : `${copiando?'Copiar':'Mover'} ${colunaLeadsSelecionados.size} lead(s)`}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('cl-picker-close').addEventListener('click', closeColunaLeadsPickerModal);
  document.getElementById('cl-pular').addEventListener('click', closeColunaLeadsPickerModal);
  document.getElementById('cl-picker-overlay').addEventListener('click', (e)=>{ if(e.target.id==='cl-picker-overlay') closeColunaLeadsPickerModal(); });
  document.getElementById('cl-selecionar-todos').addEventListener('click', ()=>{
    candidatos.forEach(c=>colunaLeadsSelecionados.add(c.id));
    renderColunaLeadsPickerModal();
  });
  document.getElementById('cl-limpar-selecao').addEventListener('click', ()=>{
    colunaLeadsSelecionados.clear();
    renderColunaLeadsPickerModal();
  });
  document.querySelectorAll('.cl-lead-checkbox').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      if(cb.checked) colunaLeadsSelecionados.add(cb.dataset.cardId);
      else colunaLeadsSelecionados.delete(cb.dataset.cardId);
      renderColunaLeadsPickerModal();
    });
  });
  document.getElementById('cl-confirmar').addEventListener('click', confirmarMoverLeadsParaColuna);
}

function renderFluxoEtapaParams(etapa, idx){
  if(etapa.tipo === 'mensagem'){
    return `<div class="field"><label>Mensagem</label><textarea class="fx-etapa-texto" data-idx="${idx}" rows="2" placeholder="Texto que será enviado pelo WhatsApp...">${esc((etapa.params&&etapa.params.texto)||'')}</textarea></div>`;
  }
  if(etapa.tipo === 'tarefa'){
    return `
      <div class="field-row">
        <div class="field"><label>Título da tarefa</label><input type="text" class="fx-etapa-titulo" data-idx="${idx}" value="${esc((etapa.params&&etapa.params.titulo)||'')}" placeholder="Ex: Ligar pra confirmar" /></div>
        <div class="field"><label>Vencimento (dias)</label><input type="number" class="fx-etapa-dias-venc" data-idx="${idx}" value="${(etapa.params&&etapa.params.diasParaVencimento)||1}" min="1" /></div>
      </div>
    `;
  }
  return `
    <div class="field">
      <label>Coluna de destino</label>
      <select class="fx-etapa-coluna-destino" data-idx="${idx}">
        ${board.columns.map(c=>`<option value="${c.id}" ${(etapa.params&&etapa.params.colunaDestinoId)===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
      </select>
    </div>
  `;
}
function renderFluxoEtapa(etapa, idx){
  return `
    <div class="fluxo-etapa-card">
      <div class="fluxo-etapa-head">
        <span class="fluxo-etapa-numero">${idx+1}</span>
        <div class="field fluxo-etapa-dias-field">
          <label>Dias após o início</label>
          <input type="number" class="fx-etapa-dias" data-idx="${idx}" value="${etapa.diasAposInicio}" min="0" />
        </div>
        <div class="field" style="flex:1;">
          <label>O que fazer</label>
          <select class="fx-etapa-tipo" data-idx="${idx}">
            <option value="mensagem" ${etapa.tipo==='mensagem'?'selected':''}>Enviar mensagem de WhatsApp</option>
            <option value="tarefa" ${etapa.tipo==='tarefa'?'selected':''}>Criar tarefa</option>
            <option value="mover_coluna" ${etapa.tipo==='mover_coluna'?'selected':''}>Mover pra outra coluna</option>
          </select>
        </div>
        <button type="button" class="icon-btn fx-etapa-remover" data-idx="${idx}" title="Remover etapa">${ICON_TRASH}</button>
      </div>
      ${renderFluxoEtapaParams(etapa, idx)}
    </div>
  `;
}

function bindFluxoModalEvents(){
  document.getElementById('fluxo-modal-close').addEventListener('click', closeFluxoModal);
  document.getElementById('fx-cancel').addEventListener('click', closeFluxoModal);
  document.getElementById('fluxo-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='fluxo-modal-overlay') closeFluxoModal(); });

  document.getElementById('fx-nome').addEventListener('input', (e)=> fluxoModalForm.nome = e.target.value);
  document.getElementById('fx-coluna-gatilho').addEventListener('change', (e)=> fluxoModalForm.colunaGatilhoId = e.target.value);

  document.getElementById('fx-add-etapa').addEventListener('click', ()=>{
    fluxoModalForm.etapas.push({ diasAposInicio:1, tipo:'mensagem', params:{ texto:'' } });
    renderFluxoModal();
  });
  document.querySelectorAll('.fx-etapa-remover').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      fluxoModalForm.etapas.splice(parseInt(btn.dataset.idx,10),1);
      renderFluxoModal();
    });
  });
  document.querySelectorAll('.fx-etapa-dias').forEach(el=>{
    el.addEventListener('input', (e)=>{ fluxoModalForm.etapas[parseInt(el.dataset.idx,10)].diasAposInicio = parseInt(e.target.value,10)||0; });
  });
  document.querySelectorAll('.fx-etapa-tipo').forEach(el=>{
    el.addEventListener('change', (e)=>{
      const idx = parseInt(el.dataset.idx,10);
      fluxoModalForm.etapas[idx].tipo = e.target.value;
      fluxoModalForm.etapas[idx].params = {};
      renderFluxoModal();
    });
  });
  document.querySelectorAll('.fx-etapa-texto').forEach(el=>{
    el.addEventListener('input', (e)=>{
      const idx = parseInt(el.dataset.idx,10);
      fluxoModalForm.etapas[idx].params.texto = e.target.value;
    });
  });
  document.querySelectorAll('.fx-etapa-titulo').forEach(el=>{
    el.addEventListener('input', (e)=>{
      const idx = parseInt(el.dataset.idx,10);
      fluxoModalForm.etapas[idx].params.titulo = e.target.value;
    });
  });
  document.querySelectorAll('.fx-etapa-dias-venc').forEach(el=>{
    el.addEventListener('input', (e)=>{
      const idx = parseInt(el.dataset.idx,10);
      fluxoModalForm.etapas[idx].params.diasParaVencimento = parseInt(e.target.value,10)||1;
    });
  });
  document.querySelectorAll('.fx-etapa-coluna-destino').forEach(el=>{
    el.addEventListener('change', (e)=>{
      const idx = parseInt(el.dataset.idx,10);
      fluxoModalForm.etapas[idx].params.colunaDestinoId = e.target.value;
    });
  });

  document.getElementById('fx-save').addEventListener('click', ()=>{
    const temMensagem = fluxoModalForm.etapas.some(e=>e.tipo==='mensagem');
    if(fluxoModalForm.__isNew && temMensagem){
      showConfirm({
        message: 'Este fluxo já nasce ativo e tem etapa(s) de envio de WhatsApp automático, sem revisão sua antes de mandar. Quer criar mesmo assim?',
        confirmLabel: 'Criar mesmo assim',
        onConfirm: ()=>{ salvarFluxo(); closeConfirm(); },
      });
    } else {
      salvarFluxo();
    }
  });
  if(!fluxoModalForm.__isNew){
    document.getElementById('fx-delete').addEventListener('click', ()=>{
      showConfirm({
        message: 'Excluir este fluxo? As execuções em andamento pra clientes atuais são interrompidas.',
        onConfirm: ()=>{ excluirFluxo(fluxoModalForm.id); closeFluxoModal(); closeConfirm(); },
      });
    });
  }
}

function renderFluxoModal(){
  const root = document.getElementById('modal-root');
  if(!fluxoModalForm){ root.innerHTML=''; return; }
  const f = fluxoModalForm;

  root.innerHTML = `
    <div class="overlay" id="fluxo-modal-overlay">
      <div class="modal modal-lg">
        <div class="modal-head">
          <h3>${f.__isNew ? 'Novo fluxo' : 'Editar fluxo'}</h3>
          <button id="fluxo-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Nome</label>
            <input type="text" id="fx-nome" value="${esc(f.nome)}" placeholder="Ex: Sequência de boas-vindas" />
          </div>
          <div class="field">
            <label>Começa quando o cliente entra nesta coluna</label>
            <select id="fx-coluna-gatilho">
              ${board.columns.map(c=>`<option value="${c.id}" ${f.colunaGatilhoId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
            </select>
          </div>
          <p class="settings-page-msg erro">⚠️ Etapas de "Enviar mensagem" mandam pelo WhatsApp automaticamente, sem você revisar antes. Se você responder o cliente manualmente, o fluxo fica em silêncio por 30 min naquela conversa.</p>
          <div class="fluxo-etapas-lista">
            ${f.etapas.map((etapa, idx)=>renderFluxoEtapa(etapa, idx)).join('')}
          </div>
          <button type="button" class="btn-outline" id="fx-add-etapa">+ Adicionar etapa</button>
        </div>
        <div class="modal-foot">
          ${!f.__isNew ? `<button class="delete-link" id="fx-delete">🗑 Excluir</button>` : '<span></span>'}
          <div class="modal-foot-actions">
            <button class="btn-outline" id="fx-cancel">Cancelar</button>
            <button class="btn-save" id="fx-save">Salvar</button>
          </div>
        </div>
      </div>
    </div>
  `;
  bindFluxoModalEvents();
}

/* ---------- confirmação genérica ---------- */
function showConfirm({ message, onConfirm, confirmLabel, cancelLabel, danger }){
  confirmState = { message, onConfirm };
  const root = document.getElementById('confirm-root');
  const rotuloConfirmar = confirmLabel || 'Excluir'; // "Excluir" continua sendo o padrão, pra não quebrar quem já chama sem passar isso
  const rotuloCancelar = cancelLabel || 'Cancelar';
  const classeConfirmar = danger===false ? 'btn-primary' : 'btn-danger';
  root.innerHTML = `
    <div class="overlay" id="confirm-overlay" style="z-index:90">
      <div class="confirm-box">
        <p>${esc(message)}</p>
        <div class="confirm-actions">
          <button class="btn-outline" id="confirm-cancel">${esc(rotuloCancelar)}</button>
          <button class="${classeConfirmar}" id="confirm-ok">${esc(rotuloConfirmar)}</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);
  document.getElementById('confirm-overlay').addEventListener('click', (e)=>{ if(e.target.id==='confirm-overlay') closeConfirm(); });
  document.getElementById('confirm-ok').addEventListener('click', ()=> confirmState.onConfirm());
}
function closeConfirm(){ confirmState = null; document.getElementById('confirm-root').innerHTML=''; }

/* ---------- start ---------- */
if(getToken()){
  renderAssistente();
  tratarRetornoDoGoogle();
  loadBoard();
  loadFunis();
  loadTasks();
  loadCalendarStatus();
  loadContratos();
  loadRegrasComissao();
  loadIntegracoesConfig();
  loadWhatsappStatus();
  loadInstagramStatus();
  loadTemplates();
  loadAgendamentos();
  loadMenuTriagem();
  loadCamposPersonalizados();
  loadPossiveisLeads();
  loadMetaVendas();
  loadMetaVendasEquipe();
  if(!agendaLoaded) loadAgendaMes(agendaMesAtual); // carrega em segundo plano — o Dashboard também usa eventos do Google em "Tarefas abertas"
  loadConversas();
  loadEquipe();
  loadAutomacoes();
  loadFluxos();
  loadWebhooksSaida();
}
