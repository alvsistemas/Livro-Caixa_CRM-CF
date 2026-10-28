// CRM · 16-paginas-equipe.js — Relatórios, Equipes/Gestão, Chat, Automações, Fluxos, Importar, Suporte. Os arquivos js/crm/ são carregados em ordem pelo index.html e
// compartilham as mesmas variáveis globais (é o antigo script.js dividido, como no CRM de consórcio).
/* ---------- página: Relatórios ---------- */
function cardsParaRelatorio(){
  if(!relatorioFunilId) return board.cards;
  const colunaIds = new Set(board.columns.filter(c=>c.funilId===relatorioFunilId).map(c=>c.id));
  return board.cards.filter(c=>colunaIds.has(c.columnId));
}
function renderRelatoriosPage(){
  const cardsRel = cardsParaRelatorio();
  const dados = relatoriosDadosMensais(12, cardsRel);
  const totalGanho = cardsRel.reduce((s,c)=>{ const col=board.columns.find(k=>k.id===c.columnId); return col&&col.tipo==='ganho' ? s+valorVendido(c) : s; },0);
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
        <button class="btn-outline" data-action="exportar-csv">Exportar Excel (.xlsx)</button>
        <button class="btn-outline" data-action="exportar-csv" data-formato="csv">CSV</button>
        <button class="btn-outline" data-action="exportar-relatorio-pdf">Exportar PDF</button>
      </div>
    </div>

    <div class="metric-grid">
      <div class="metric-card"><div class="metric-card-top"><span>Total ganho</span></div><div class="metric-value">${fmtBRL(totalGanho)}</div></div>
      <div class="metric-card"><div class="metric-card-top"><span>Total perdido</span></div><div class="metric-value">${fmtBRL(totalPerdido)}</div></div>
      <div class="metric-card"><div class="metric-card-top"><span>Total de contatos</span></div><div class="metric-value">${cardsRel.length}</div></div>
    </div>

    <div class="rel-graficos">
      <div class="dash-panel">
        <div class="dash-panel-title">Valor ganho por mês</div>
        ${graficoMensal(dados, d=>d.ganhoValor, valorCurto, d=>`${fmtBRL(d.ganhoValor)}${d.ganhoQtd?` · ${d.ganhoQtd} venda${d.ganhoQtd===1?'':'s'}`:''}`, 'Nenhuma venda nos últimos 12 meses.')}
      </div>
      <div class="dash-panel">
        <div class="dash-panel-title">Novos contatos por mês</div>
        ${graficoMensal(dados, d=>d.novos, n=>String(n), d=>`${d.novos} contato${d.novos===1?'':'s'}`, 'Nenhum contato novo nos últimos 12 meses.')}
      </div>
    </div>

    <div class="dash-panel">
      <div class="dash-panel-title">Contatos por qualificação</div>
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

// Valor curto para cima da barra: 15,6 mil · 1,2 mi
function valorCurto(v){
  const f = (n)=> n.toLocaleString('pt-BR', { maximumFractionDigits:1 });
  if(v >= 1e6) return f(v/1e6)+' mi';
  if(v >= 1e3) return f(v/1e3)+' mil';
  return f(v);
}
// Gráfico de barras dos 12 meses (mês sem nada fica só com a base) + a lista só dos meses que tiveram algo
function graficoMensal(dados, valorDe, formatarEixo, textoDoMes, vazio){
  const max = Math.max(0, ...dados.map(valorDe));
  if(!max) return `<p class="dash-empty">${vazio}</p>`;
  const comValor = dados.filter(d=> valorDe(d) > 0).slice().reverse();
  return `
    <div class="rel-grafico" role="img" aria-label="${esc(dados.map(d=>`${monthLabel(d.key)}: ${textoDoMes(d)}`).join('; '))}">
      ${dados.map(d=>{ const v = valorDe(d); return `
        <div class="rel-coluna" title="${esc(monthLabel(d.key))}: ${esc(textoDoMes(d))}">
          <div class="rel-barra-area"><div class="rel-barra" style="height:${v ? Math.max(4, v/max*100) : 0}%">${v ? `<span class="rel-valor ${v===max?'rel-max':''}">${esc(formatarEixo(v))}</span>` : ''}</div></div>
          <span class="rel-mes">${esc(monthLabel(d.key).slice(0,3))}</span>
        </div>`; }).join('')}
    </div>
    <ul class="rel-lista">
      ${comValor.map(d=>`<li><span>${esc(monthLabel(d.key))}</span><b>${esc(textoDoMes(d))}</b></li>`).join('')}
    </ul>`;
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
    ${renderCriarEntrarEquipe()}
  `;
}
function renderCriarEntrarEquipe(){
  const outra = !!equipe;
  return `
    <div class="settings-page-grid">
      <div class="settings-page-section">
        <h3>${outra ? 'Criar outra equipe' : 'Criar uma equipe'}</h3>
        ${temRecurso('equipe') ? `<p class="settings-page-note">Você vira supervisor(a) automaticamente e ganha um código pra convidar outras pessoas. O funil de cada um continua separado — só o chat e a supervisão são compartilhados.</p>
        <div class="field">
          <input type="text" id="equipe-nome-novo" placeholder="Nome da equipe" value="${esc(equipeNomeNovo)}" />
        </div>
        <button class="btn-primary" data-action="criar-equipe">Criar equipe</button>` : avisoPlanoCompleto('Criar e supervisionar uma equipe é do plano Completo', 'Convide pessoas, acompanhe o desempenho de cada uma e converse pelo chat interno.')}
      </div>
      <div class="settings-page-section">
        <h3>${outra ? 'Entrar em mais uma equipe' : 'Entrar numa equipe existente'}</h3>
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
    return `<div class="page-head"><div><h1>Equipes</h1><p>Carregando…</p></div></div>`;
  }
  if(equipeTela === 'equipe' && equipe) return renderEquipeAberta();
  return renderListaDeEquipes();
}

// Tela "Equipes": as equipes de que a pessoa faz parte. Tocar numa entra nela; o + cria ou entra com código.
function renderListaDeEquipes(){
  const vazio = !minhasEquipes.length;
  const painelAberto = equipeNovaAberta || vazio;
  const cheio = minhasEquipes.length >= limiteEquipes;
  return `
    <div class="page-head equipes-head">
      <div>
        <h1>Equipes</h1>
        <p>${vazio ? 'Você ainda não faz parte de nenhuma equipe' : `Você está em ${minhasEquipes.length} equipe${minhasEquipes.length===1?'':'s'}. Toque numa para entrar.`}</p>
      </div>
      ${vazio ? '' : `<button type="button" class="equipes-mais ${painelAberto?'aberto':''}" data-action="nova-equipe-toggle" aria-expanded="${painelAberto}" aria-controls="equipes-nova" title="Criar ou entrar numa equipe" aria-label="Criar ou entrar numa equipe">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
      </button>`}
    </div>
    ${painelAberto ? `
      <div class="equipes-nova" id="equipes-nova">
        ${cheio ? `<p class="settings-page-note">Você chegou ao limite de ${limiteEquipes} equipes. Saia de alguma para criar ou entrar em outra.</p>` : renderCriarEntrarEquipe()}
      </div>` : ''}
    ${vazio ? '' : `
      <div class="equipes-lista">
        ${minhasEquipes.map(e=>`
          <div class="equipe-card">
            <button type="button" class="equipe-card-abrir" data-action="abrir-equipe-lista" data-equipe-id="${e.id}" aria-label="Entrar na equipe ${esc(e.nome)}">
              <span class="equipe-card-icone" aria-hidden="true">${esc(iniciaisDoNome(e.nome))}</span>
              <span class="equipe-card-info">
                <b>${esc(e.nome)}</b>
                <span>${e.papel==='supervisor'?'⭐ Gestor':'Membro'} · ${e.membros} pessoa${e.membros===1?'':'s'}</span>
              </span>
              <span class="equipe-card-seta" aria-hidden="true">›</span>
            </button>
            <button type="button" class="equipe-card-sair" data-action="sair-equipe-lista" data-equipe-id="${e.id}" data-nome="${esc(e.nome)}">Sair</button>
          </div>`).join('')}
      </div>`}
    ${equipeMsg && !painelAberto ? `<p class="settings-page-msg ${equipeMsg.tipo}" style="margin-top:14px;">${esc(equipeMsg.texto)}</p>` : ''}
  `;
}

// O + gira e vira X; o painel de criar/entrar desce ao abrir e sobe ao fechar (como no Importar)
let equipesPainelAnimando = false;
function alternarNovaEquipe(){
  if(!minhasEquipes.length || equipesPainelAnimando) return; // sem equipe, o painel fica sempre aberto
  equipeMsg = null;
  const parado = semMovimento();
  if(!equipeNovaAberta){
    equipeNovaAberta = true;
    renderApp();
    const btn = document.querySelector('[data-action="nova-equipe-toggle"]');
    const el = document.getElementById('equipes-nova');
    if(!parado && btn){ btn.classList.remove('aberto'); void btn.offsetWidth; btn.classList.add('aberto'); } // a rotação acontece agora
    if(!parado && el){
      equipesPainelAnimando = true;
      el.classList.add('entrando');
      alturaAnimada(el, 0, el.scrollHeight, 380, ()=>{ equipesPainelAnimando = false; });
      setTimeout(()=> el.classList.remove('entrando'), 700);
    }
    const c = document.getElementById('equipe-nome-novo'); if(c && !ehCelular()) c.focus({ preventScroll:true });
    return;
  }
  const btn = document.querySelector('[data-action="nova-equipe-toggle"]');
  const el = document.getElementById('equipes-nova');
  const fechar = ()=>{ equipeNovaAberta = false; equipesPainelAnimando = false; renderApp(); };
  if(parado || !el) return fechar();
  equipesPainelAnimando = true;
  if(btn){ btn.classList.remove('aberto'); btn.setAttribute('aria-expanded', 'false'); }
  el.classList.add('saindo');
  alturaAnimada(el, el.offsetHeight, 0, 300, fechar);
}

// Dentro de uma equipe: chat para todos; gestão e permissões para o gestor
function renderEquipeAberta(){
  const abas = [['chat','Chat']];
  if(equipe.souSupervisor) abas.push(['supervisao','Gestão']); // membros, adicionar pessoas, desempenho e permissões ficam dentro
  if(!abas.some(([k])=> k === equipeSubTab)) equipeSubTab = 'chat';
  return `
    <button type="button" class="equipes-voltar" data-action="equipes-voltar">‹ Equipes</button>
    <div class="page-head">
      <div>
        <h1>${esc(equipe.nome)}</h1>
        <p>${equipe.membros.length} membro${equipe.membros.length===1?'':'s'} · você é ${equipe.souSupervisor ? '⭐ Gestor' : 'Membro'}</p>
      </div>
    </div>
    ${abas.length > 1 ? `
      <div class="funil-tabs" style="margin-bottom:20px;">
        ${abas.map(([key,label])=>`<button class="tab-btn ${equipeSubTab===key?'active':''}" data-action="set-equipe-subtab" data-subtab="${key}">${label}</button>`).join('')}
      </div>
    ` : ''}
    ${equipeSubTab==='chat' ? renderChatInternoConteudo() : ''}
    ${equipeSubTab==='supervisao' && equipe.souSupervisor ? renderSupervisaoConteudo() : ''}
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
                <button type="button" class="btn-primary" style="padding:4px 10px; font-size:11px;" data-action="atuar-como-membro" data-user-id="${m.userId}" data-nome="${esc(m.nome)}" title="Trabalhar no funil dessa pessoa (fica registrado)">Abrir funil</button>
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
// Gestão da equipe organizada como Configurações: lista de seções à esquerda (no celular, uma
// lista que abre cada seção) e o conteúdo da escolhida
const GESTAO_SECOES = [
  { grupo:'Pessoas', itens:[['membros','Membros'], ['adicionar','Adicionar pessoas']] },
  { grupo:'Acompanhamento', itens:[['desempenho','Desempenho']] },
  { grupo:'Regras', itens:[['permissoes','Permissões']] },
];
function renderSupervisaoConteudo(){
  const conteudo = { membros: renderGestaoMembros, adicionar: renderGestaoAdicionar, desempenho: renderGestaoDesempenho,
    permissoes: ()=> typeof renderPermissoesEquipe === 'function' ? renderPermissoesEquipe() : '' }[gestaoSecao] || renderGestaoMembros;
  return `
    <div class="config-layout gestao-layout ${gestaoMobileConteudo ? 'mostrando-conteudo' : 'mostrando-lista'}">
      <div class="config-sidebar">
        ${GESTAO_SECOES.map(g=>`
          <div class="config-sidebar-grupo">${g.grupo}</div>
          ${g.itens.map(([k,l])=>`<button class="config-sidebar-item ${gestaoSecao===k?'active':''}" data-action="set-gestao-secao" data-secao="${k}">${l}${k==='membros' ? ` <span class="gestao-conta">${equipe.membros.length}</span>` : ''}</button>`).join('')}
        `).join('')}
      </div>
      <div class="config-content">
        <button type="button" class="config-voltar-mobile" data-action="gestao-voltar-mobile">‹ Gestão</button>
        ${conteudo()}
      </div>
    </div>`;
}
// Gestão > Membros: as ações de cada pessoa ficam numa janela por cima (botão "Opções"),
// cada uma com uma frase explicando. Chama as mesmas funções de antes.
function abrirOpcoesMembroModal(userId){
  const m = (equipe && equipe.membros || []).find(x=> String(x.id) === String(userId));
  if(!m || m.souEu) return;
  const nome = m.nome || m.email;
  const ehGestor = m.papel === 'supervisor';
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="overlay" id="opcoes-membro-overlay">
      <div class="modal modal-opcoes-membro" role="dialog" aria-label="Opções de ${esc(nome)}">
        <div class="modal-head"><h3>${esc(nome)}</h3><button type="button" id="opcoes-membro-close" aria-label="Fechar">✕</button></div>
        <div class="modal-body">
          <p class="settings-page-note" style="margin:0">${ehGestor?'⭐ Gestor':'Membro'}${m.supervisorDeDados?' · 🛠 Supervisor de dados':''}</p>
          <button type="button" class="opcao-membro" id="opcao-papel"><b>${ehGestor?'Tirar de gestor':'Tornar gestor'}</b><span>${ehGestor?'Deixa de ver e gerir a equipe.':'Passa a ver e gerir a equipe.'}</span></button>
          <button type="button" class="opcao-membro" id="opcao-dados"><b>${m.supervisorDeDados?'Tirar supervisor de dados':'Tornar supervisor de dados'}</b><span>Acesso ao monitoramento de erros, em Configurações.</span></button>
          <button type="button" class="opcao-membro opcao-perigo" id="opcao-remover"><b>Remover da equipe</b><span>O funil dele continua intocado; só perde acesso ao chat e à gestão.</span></button>
        </div>
      </div>
    </div>`;
  const fechar = ()=>{ root.innerHTML = ''; };
  document.getElementById('opcoes-membro-close').addEventListener('click', fechar);
  document.getElementById('opcoes-membro-overlay').addEventListener('click', (e)=>{ if(e.target.id === 'opcoes-membro-overlay') fechar(); });
  document.getElementById('opcao-papel').addEventListener('click', ()=>{ fechar(); alterarPapelMembro(m.id, ehGestor ? 'membro' : 'supervisor'); });
  document.getElementById('opcao-dados').addEventListener('click', ()=>{ fechar(); alterarSupervisorDeDados(m.id, !m.supervisorDeDados); });
  document.getElementById('opcao-remover').addEventListener('click', ()=>{
    fechar();
    showConfirm({
      message: 'Remover esse membro da equipe? O funil dele continua intocado, só perde acesso ao chat e à supervisão.',
      onConfirm: ()=>{ removerMembro(m.id); closeConfirm(); },
    });
  });
}
function renderGestaoMembros(){
  return `
    <div class="settings-page-section">
      <div class="gestao-titulo-linha"><h3>Membros</h3><button class="btn-outline gestao-mini" data-action="set-gestao-secao" data-secao="adicionar">+ Adicionar pessoas</button></div>
      <div class="membros-lista">
        ${membrosOrdenados(equipe.membros).map(m=>`
          <div class="membro-card ${m.papel==='supervisor'?'gestor':''}">
            <span class="membro-avatar" aria-hidden="true">${esc(iniciaisDoNome(m.nome||m.email||'?'))}</span>
            <div class="membro-info">
              <b>${esc(m.nome||m.email)}${m.souEu?' <span class="membro-voce">(você)</span>':''}</b>
              <span>${esc(m.email||'')}</span>
              <span class="membro-selos"><span class="membro-selo ${m.papel==='supervisor'?'forte':''}">${m.papel==='supervisor'?'⭐ Gestor':'Membro'}</span>${m.supervisorDeDados?'<span class="membro-selo">🛠 Supervisor de dados</span>':''}</span>
            </div>
            ${!m.souEu ? `<button type="button" class="btn-outline membro-opcoes-btn" data-action="abrir-opcoes-membro" data-user-id="${m.id}" aria-label="Opções de ${esc(m.nome||m.email)}">Opções</button>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
    <div class="settings-page-section">
      <h3>Sair da equipe</h3>
      <p class="settings-page-note">Você deixa de ver o chat e a gestão desta equipe. Seu funil continua igual.</p>
      <button class="btn-outline" data-action="sair-equipe">Sair da equipe</button>
    </div>`;
}
function renderGestaoAdicionar(){
  const f = novoMembroForm;
  return `
    <div class="settings-page-section">
      <h3>Criar conta para alguém</h3>
      <p class="settings-page-note">A pessoa entra direto nesta equipe, com o próprio CRM, e recebe por e-mail um link para criar a senha (vale 7 dias). A conta é dela, com a própria assinatura (começa no teste grátis).</p>
      <div class="field-row">
        <div class="field"><label for="nm-nome">Nome</label><input type="text" id="nm-nome" value="${esc(f.nome)}" maxlength="80" placeholder="Ex.: Ana Souza" /></div>
        <div class="field"><label for="nm-email">E-mail</label><input type="email" id="nm-email" value="${esc(f.email)}" maxlength="200" placeholder="ana@exemplo.com" /></div>
      </div>
      <button class="btn-primary" data-action="criar-conta-membro" ${f.enviando?'disabled':''}>${f.enviando?'Criando…':'Criar conta'}</button>
      ${f.msg ? `<p class="settings-page-msg ${f.msg.tipo}" style="margin-top:12px;">${esc(f.msg.texto)}</p>` : ''}
      ${f.link ? `<div class="gestao-link"><input type="text" readonly value="${esc(f.link)}" aria-label="Link para criar a senha" /><button class="btn-outline gestao-mini" data-action="copiar-link-membro">Copiar</button></div>` : ''}
    </div>
    <div class="settings-page-section">
      <h3>Código de convite</h3>
      <p class="settings-page-note">Para quem já tem conta: a pessoa digita o código em Equipe → + → Entrar numa equipe e vira membro, mantendo o funil dela.</p>
      <div class="gestao-codigo"><span>${esc(equipe.codigoConvite||'')}</span><button class="btn-outline gestao-mini" data-action="copiar-codigo-equipe">Copiar</button></div>
      <button class="btn-outline" data-action="regenerar-codigo-equipe" style="margin-top:10px;">Gerar novo código</button>
    </div>`;
}
function renderGestaoDesempenho(){
  if(!supervisaoLoaded) return `<div class="settings-page-section"><h3>Desempenho</h3><p class="settings-page-note">Carregando…</p></div>`;
  return `
    <div class="settings-page-section">
      <h3>Ranking (por valor ganho)</h3>
      ${supervisaoMembros.length ? renderRankingSupervisao(supervisaoMembros) : `<p class="dash-empty">Nenhum membro ainda.</p>`}
    </div>
    <div class="settings-page-section">
      <h3>Desempenho por membro</h3>
      <div class="leads-table-wrap" style="border:none;">
        <table class="leads-table">
          <thead><tr><th>Nome</th><th>Contatos</th><th>Em negociação</th><th>Ganho</th><th>Perdido</th></tr></thead>
          <tbody>
            ${membrosOrdenados(supervisaoMembros).map(m=>`
              <tr class="${m.papel==='supervisor'?'membro-supervisor-destaque':''}">
                <td>${esc(m.nome)} ${m.papel==='supervisor'?'⭐':''}</td>
                <td>${m.totalLeads}</td>
                <td>${fmtBRL(m.abertoValor)}</td>
                <td>${fmtBRL(m.ganhoValor)}</td>
                <td>${fmtBRL(m.perdidoValor)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}
async function criarContaMembro(){
  const f = novoMembroForm;
  const nome = (document.getElementById('nm-nome')||{}).value || f.nome;
  const email = (document.getElementById('nm-email')||{}).value || f.email;
  f.nome = nome; f.email = email; f.link = null;
  if(!nome.trim() || !email.trim()){ f.msg = { tipo:'erro', texto:'Preencha o nome e o e-mail.' }; renderApp(); return; }
  f.enviando = true; f.msg = null; renderApp();
  try{
    const r = await apiRequest('POST', '/equipe/criar-membro', { nome, email });
    novoMembroForm = { nome:'', email:'', enviando:false, link: r.link || null,
      msg: { tipo:'ok', texto: r.emailEnviado ? `Conta criada! ${r.membro.nome} recebeu um e-mail para criar a senha.` : `Conta criada! O e-mail não pôde ser enviado: copie o link abaixo e mande para ${r.membro.nome} (vale ${r.validadeDias} dias).` } };
    await loadEquipe();
  }catch(e){
    f.enviando = false; f.msg = { tipo:'erro', texto: e.message || 'Não foi possível criar a conta.' };
    renderApp();
  }
}

// Monitoramento de erros (em Configurações → Sistema): só quem é "supervisor de dados" em alguma equipe
function podeVerMonitoramento(){
  if(acessoCrm && acessoCrm.tipo !== 'dono') return false;
  return minhasEquipes.some(e=> e.supervisorDeDados) || !!(equipe && equipe.souSupervisorDeDados);
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
    return `<div class="page-head"><div><h1>Ações automáticas</h1><p>Carregando…</p></div></div>`;
  }
  return `
    <div class="page-head">
      <div>
        <h1>Ações automáticas</h1>
        <p>Tarefas e movimentos que acontecem sozinhos quando um cliente entra numa coluna</p>
      </div>
      ${temRecurso('automacoes') ? `<button class="btn-primary" data-action="open-new-automacao">+ Nova ação automática</button>` : ''}
    </div>
    ${temRecurso('automacoes') ? '' : avisoPlanoCompleto('Ações automáticas fazem parte do plano Completo', 'Crie tarefas e mova clientes sozinho quando eles entram numa coluna ou ficam parados.')}
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
    ` : `<div class="tasks-empty">Nenhuma ação automática criada ainda.</div>`}
  `;
}

/* ---------- página: Fluxos ---------- */
function renderFluxosPage(){
  if(!fluxosLoaded){
    return `<div class="page-head"><div><h1>Sequências</h1><p>Carregando…</p></div></div>`;
  }
  return `
    <div class="page-head">
      <div>
        <h1>Sequências</h1>
        <p>Passos que acontecem ao longo dos dias, a partir de quando o cliente entra numa coluna</p>
      </div>
      ${temRecurso('automacoes') ? `<button class="btn-primary" data-action="open-new-fluxo">+ Nova sequência</button>` : ''}
    </div>
    ${temRecurso('automacoes') ? '' : avisoPlanoCompleto('Sequências fazem parte do plano Completo', 'Programe tarefas e movimentos para acontecerem ao longo dos dias depois que o cliente entra numa coluna.')}
    ${fluxos.length ? `
      <div class="automacoes-list">
        ${fluxos.map(f=>{
          const coluna = board.columns.find(c=>c.id===f.colunaGatilhoId);
          return `
            <div class="automacao-card ${f.ativo?'':'automacao-inativa'}">
              <div class="contrato-card-head">
                <div>
                  <h3 class="contrato-card-title">${esc(f.nome)}</h3>
                  <p class="contrato-card-note">
                    Começa quando entra em <b>${esc(coluna?coluna.nome:'coluna removida')}</b> ·
                    ${(f.etapas||[]).length} etapa${(f.etapas||[]).length===1?'':'s'} ·
                    ${f.emAndamento||0} cliente${(f.emAndamento||0)===1?'':'s'} em andamento
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
    ` : `<div class="tasks-empty">Nenhuma sequência criada ainda.</div>`}
  `;
}


/* ---------- página: Importar/Exportar ---------- */
function renderImportExportPage(){
  return `
    <div class="page-head">
      <div>
        <h1>Importar/Exportar</h1>
        <p>Importe uma planilha (.csv ou .xlsx) — os dados viram "possíveis contatos" até você completar e confirmar cada um.</p>
      </div>
    </div>

    <div class="settings-page-section">
      <h3>1. Importar planilha</h3>
      <div class="arquivo-linha">
        <label class="btn-outline btn-arquivo">Escolher planilha (.xlsx ou .csv)<input type="file" id="planilha-input" accept=".csv,.xlsx,.xls" hidden /></label>
        ${importPlanilhaNomeArquivo
          ? `<span class="arquivo-escolhido ${importAnimarEntrada?'entrando':''}"><span class="arquivo-escolhido-nome" title="${esc(importPlanilhaNomeArquivo)}">${esc(importPlanilhaNomeArquivo)}</span><button type="button" class="arquivo-tirar" data-action="tirar-planilha" aria-label="Tirar a planilha ${esc(importPlanilhaNomeArquivo)}" title="Tirar a planilha">×</button></span>`
          : `<span class="arquivo-nome">Nenhum arquivo escolhido</span>`}
        <button class="btn-link arquivo-modelo" data-action="modelo-planilha-leads">Baixar planilha modelo</button>
      </div>
      ${importPlanilhaNomeArquivo ? `<div class="import-detalhe" id="import-detalhe">` : ''}
      ${importPlanilhaColunas.length ? `
        <p class="settings-page-note" style="margin-top:10px;">${importPlanilhaLinhas.length} linha(s) encontrada(s) em "${esc(importPlanilhaNomeArquivo)}". Escolha qual coluna da planilha é qual campo:</p>
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
        ${importPlanilhaMsg ? `<p class="settings-page-msg ${importPlanilhaMsg.tipo}">${esc(importPlanilhaMsg.texto)}</p>` : ''}
        <button class="btn-primary" id="confirmar-import-planilha" ${importandoPlanilha?'disabled':''}>${importandoPlanilha?'Importando…':'Importar planilha'}</button>
      ` : (importPlanilhaMsg ? `<p class="settings-page-msg ${importPlanilhaMsg.tipo}">${esc(importPlanilhaMsg.texto)}</p>` : '')}
      ${importPlanilhaNomeArquivo ? `</div>` : ''}
    </div>

    <div class="settings-page-section">
      <h3>2. Possíveis contatos (${possiveisLeads.length})</h3>
      <p class="settings-page-note">Complete as informações de cada um pra adicioná-lo de vez aos Contatos.</p>
      ${!possiveisLeadsCarregados ? `<p class="settings-page-note">Carregando…</p>` : (possiveisLeads.length ? `
        <div class="leads-table-wrap">
          <table class="leads-table">
            <thead><tr><th>Nome</th><th>Telefone</th><th>Serviço desejado</th><th>Ações</th></tr></thead>
            <tbody>
              ${possiveisLeads.map(l=>`
                <tr>
                  <td>${esc(l.nome)||'—'}</td>
                  <td>${l.telefone ? esc(telefoneBonito(l.telefone)) : '—'}</td>
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
      ` : `<div class="tasks-empty">Nenhum possível contato pendente.</div>`)}
    </div>

    <div class="settings-page-section">
      <h3>3. Exportar</h3>
      <p class="settings-page-note">Baixa todos os clientes já confirmados (que estão na aba Contatos) em Excel (.xlsx) ou CSV.</p>
      <div class="arquivo-linha">
        <button class="btn-outline" data-action="exportar-leads">Exportar contatos (.xlsx)</button>
        <button class="btn-outline" data-action="exportar-leads" data-formato="csv">Exportar contatos (CSV)</button>
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
        <p class="settings-page-note"><b>Como mudo a cor do painel?</b><br/>Configurações → Aparência e acessibilidade.</p>
        <p class="settings-page-note"><b>Por que não aparece a aba Equipe?</b><br/>A Equipe do CRM (chat, gestão e "Abrir funil" dos consultores) é para quem entra com o próprio e-mail e senha. Quem entra com nome e PIN (funcionário da loja ou aparelho da loja) usa os contatos da loja e não vê essa aba. Para usar a equipe, entre com o seu e-mail e senha.</p>
        <p class="settings-page-note"><b>Como deixo a letra maior?</b><br/>Configurações → Aparência e acessibilidade → Tamanho da letra. Lá também tem alto contraste e menos animação.</p>
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
