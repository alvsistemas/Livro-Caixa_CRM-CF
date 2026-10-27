// CRM · 08-busca-ia.js — busca global e assistente. Os arquivos js/crm/ são carregados em ordem pelo index.html e
// compartilham as mesmas variáveis globais (é o antigo script.js dividido, como no CRM de consórcio).
/* ---------- busca global (Ctrl+K) ---------- */
function abrirBuscaGlobal(){
  buscaGlobalAberta = true;
  buscaGlobalTexto = '';
  renderBuscaGlobalModal();
  setTimeout(()=>{ const el = document.getElementById('busca-global-input'); if(el) el.focus(); }, 0);
}
function closeBuscaGlobal(){
  buscaGlobalAberta = false;
  document.getElementById('modal-root').innerHTML = '';
}
function renderBuscaGlobalModal(){
  const root = document.getElementById('modal-root');
  if(!buscaGlobalAberta){ root.innerHTML=''; return; }
  const termo = buscaGlobalTexto.trim().toLowerCase();
  let leadsResultado = [];
  let tarefasResultado = [];
  if(termo){
    leadsResultado = board.cards.filter(c=>
      (c.cliente||'').toLowerCase().includes(termo) || (c.telefone||'').includes(termo)
    ).slice(0,8);
    tarefasResultado = tasks.filter(t=> (t.titulo||'').toLowerCase().includes(termo)).slice(0,8);
  }
  root.innerHTML = `
    <div class="overlay" id="busca-global-overlay">
      <div class="modal modal-lg busca-global-modal">
        <div class="busca-global-input-row">
          ${ICON_BUSCA}
          <input type="text" id="busca-global-input" placeholder="Buscar cliente ou tarefa..." value="${esc(buscaGlobalTexto)}" />
          <button id="busca-global-close" title="Fechar (Esc)">✕</button>
        </div>
        <div class="busca-global-resultados">
          ${!termo ? `<p class="settings-page-note" style="padding:16px;">Digite pra buscar clientes e tarefas. Atalho: Ctrl+K (ou ⌘K no Mac).</p>` : `
            ${leadsResultado.length ? `
              <div class="busca-global-grupo-titulo">Clientes</div>
              ${leadsResultado.map(c=>`
                <button type="button" class="busca-global-item" data-action="busca-global-abrir-lead" data-card-id="${c.id}">
                  <span class="busca-global-item-nome">${esc(c.cliente)||'Sem nome'}</span>
                  <span class="settings-page-note">${esc(telefoneBonito(c.telefone))}</span>
                </button>
              `).join('')}
            ` : ''}
            ${tarefasResultado.length ? `
              <div class="busca-global-grupo-titulo">Tarefas</div>
              ${tarefasResultado.map(t=>`
                <button type="button" class="busca-global-item" data-action="busca-global-abrir-tarefa" data-task-id="${t.id}">
                  <span class="busca-global-item-nome">${esc(t.titulo)}</span>
                  ${t.vencimento ? `<span class="settings-page-note">${formatDate(t.vencimento)}</span>` : ''}
                </button>
              `).join('')}
            ` : ''}
            ${!leadsResultado.length && !tarefasResultado.length ? `<p class="settings-page-note" style="padding:16px;">Nada encontrado.</p>` : ''}
          `}
        </div>
      </div>
    </div>
  `;
  document.getElementById('busca-global-close').addEventListener('click', closeBuscaGlobal);
  document.getElementById('busca-global-overlay').addEventListener('click', (e)=>{ if(e.target.id==='busca-global-overlay') closeBuscaGlobal(); });
  const inputEl = document.getElementById('busca-global-input');
  inputEl.addEventListener('input', (e)=>{
    buscaGlobalTexto = e.target.value;
    renderBuscaGlobalModal();
    const novo = document.getElementById('busca-global-input');
    if(novo){ novo.focus(); novo.setSelectionRange(novo.value.length, novo.value.length); }
  });
  inputEl.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeBuscaGlobal(); });
  document.querySelectorAll('[data-action="busca-global-abrir-lead"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ closeBuscaGlobal(); openEditCard(btn.dataset.cardId); });
  });
  document.querySelectorAll('[data-action="busca-global-abrir-tarefa"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ closeBuscaGlobal(); goToPage('tarefas'); });
  });
}
document.addEventListener('keydown', (e)=>{
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k'){
    e.preventDefault();
    if(getToken() && !buscaGlobalAberta) abrirBuscaGlobal();
  }
});

function iniciaisDoNome(nome){
  const partes = (nome||'').trim().split(/\s+/).filter(Boolean);
  if(!partes.length) return '?';
  if(partes.length === 1) return partes[0][0].toUpperCase();
  return (partes[0][0] + partes[partes.length-1][0]).toUpperCase();
}
function redimensionarImagem(file, tamanho){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        const canvas = document.createElement('canvas');
        canvas.width = tamanho;
        canvas.height = tamanho;
        const ctx = canvas.getContext('2d');
        const lado = Math.min(img.width, img.height);
        const sx = (img.width - lado)/2;
        const sy = (img.height - lado)/2;
        ctx.drawImage(img, sx, sy, lado, lado, 0, 0, tamanho, tamanho);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = ()=> reject(new Error('Não foi possível ler a imagem.'));
      img.src = e.target.result;
    };
    reader.onerror = ()=> reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}
async function handleAvatarFileSelected(file){
  if(!file) return;
  avatarMsg = null;
  try{
    const dataUrl = await redimensionarImagem(file, 128);
    avatarSalvando = true;
    renderApp();
    await apiRequest('PUT', '/auth/avatar', { avatarUrl: dataUrl });
    await refreshCurrentUser();
    avatarMsg = { tipo:'ok', texto:'Foto atualizada.' };
  }catch(e){
    avatarMsg = { tipo:'erro', texto: e.message || 'Não foi possível enviar a foto.' };
  }
  avatarSalvando = false;
  renderApp();
}
async function removerAvatar(){
  avatarSalvando = true;
  avatarMsg = null;
  renderApp();
  try{
    await apiRequest('PUT', '/auth/avatar', { avatarUrl: null });
    await refreshCurrentUser();
    avatarMsg = { tipo:'ok', texto:'Foto removida.' };
  }catch(e){
    avatarMsg = { tipo:'erro', texto: e.message || 'Não foi possível remover a foto.' };
  }
  avatarSalvando = false;
  renderApp();
}
async function desconectarTodosDispositivos(){
  logoutAllEnviando = true;
  logoutAllMsg = null;
  renderApp();
  try{
    await apiRequest('POST', '/auth/logout-all');
    logout(true); // esse dispositivo também precisa entrar de novo
  }catch(e){
    logoutAllMsg = { tipo:'erro', texto: e.message || 'Não foi possível desconectar os dispositivos.' };
    logoutAllEnviando = false;
    renderApp();
  }
}
async function salvarSenha(){
  if(!senhaNovaVal || senhaNovaVal.length < 6){
    senhaMsg = { tipo:'erro', texto:'A nova senha precisa ter ao menos 6 caracteres.' };
    renderApp();
    if(modalAlterarSenhaAberto) renderAlterarSenhaModal();
    return;
  }
  senhaSalvando = true;
  senhaMsg = null;
  renderApp();
  if(modalAlterarSenhaAberto) renderAlterarSenhaModal();
  try{
    await apiRequest('PUT', '/auth/password', { senhaAtual: senhaAtualVal, senhaNova: senhaNovaVal });
    senhaMsg = { tipo:'ok', texto:'Senha salva com sucesso.' };
    senhaAtualVal = ''; senhaNovaVal = '';
    await refreshCurrentUser();
  }catch(e){
    senhaMsg = { tipo:'erro', texto: e.message || 'Não foi possível salvar a senha.' };
  }
  senhaSalvando = false;
  renderApp();
  if(modalAlterarSenhaAberto) renderAlterarSenhaModal();
}

// Parser simples de CSV: "Nome,Telefone,Valor", uma linha por lead.
// Não lida com campos entre aspas contendo vírgulas — suficiente pro uso esperado.
function parseCsvLeads(texto){
  const linhas = texto.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if(!linhas.length) return [];
  const inicio = /nome/i.test(linhas[0]) ? 1 : 0;
  const out = [];
  for(let i=inicio;i<linhas.length;i++){
    const partes = linhas[i].split(',').map(p=>p.trim().replace(/^"|"$/g,''));
    if(!partes[0]) continue;
    const valorTexto = (partes[2]||'0').replace(/[^\d,.-]/g,'').replace(/\.(?=\d{3})/g,'').replace(',','.');
    out.push({ nome: partes[0], telefone: partes[1]||'', valor: parseFloat(valorTexto) || 0 });
  }
  return out;
}
async function importarLeadsCsv(){
  const fileInput = document.getElementById('import-arquivo');
  const file = fileInput && fileInput.files && fileInput.files[0];
  if(!file){ errorMsg = 'Escolha um arquivo (.xlsx ou .csv) primeiro.'; renderApp(); return; }
  const columnId = importColumnId || (document.getElementById('import-coluna') || {}).value;
  if(!columnId){ errorMsg = 'Escolha a coluna de destino.'; renderApp(); return; }

  importando = true;
  importResultado = null;
  renderApp();

  let linhas;
  if(/\.xlsx?$/i.test(file.name)){
    try{ await carregarBiblioteca('xlsx'); }catch(e){ importando = false; errorMsg = e.message; renderApp(); return; }
    const wb = XLSX.read(await file.arrayBuffer(), { type:'array' });
    const matriz = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:'', raw:false });
    const inicio = matriz.length && /nome/i.test(String(matriz[0][0])) ? 1 : 0;
    linhas = matriz.slice(inicio).filter(l=> String(l[0]||'').trim()).map(l=>{
      const v = String(l[2]||'0').replace(/[^\d,.-]/g,'');
      const valor = /,\d{1,2}$/.test(v) ? parseFloat(v.replace(/\./g,'').replace(',','.')) : parseFloat(v.replace(/,/g,''));
      return { nome: String(l[0]).trim(), telefone: String(l[1]||'').trim(), valor: valor || 0 };
    });
  } else linhas = parseCsvLeads(await file.text());
  let sucesso = 0, falha = 0;
  for(const linha of linhas){
    try{
      const novo = await apiRequest('POST', '/cards', {
        columnId, cliente: linha.nome, telefone: linha.telefone, valor: linha.valor,
        temperatura: 'morno', obs: '', mes: currentMonthKey(),
      });
      board.cards.push(novo);
      sucesso++;
    }catch(e){ falha++; }
  }
  importResultado = { sucesso, falha };
  importando = false;
  renderApp();
}

/* ---------- IA ---------- */
async function gerarInsightsIA(){
  insightsCarregando = true;
  renderApp();
  try{
    const data = await apiRequest('POST', '/ai/insights', { funilId: funilAtualId });
    aiInsights = data.insights || [];
  }catch(e){
    errorMsg = e.message || 'Não foi possível gerar os insights.';
  }
  insightsCarregando = false;
  renderApp();
}

async function sugerirMensagemIA(){
  if(!modalForm || modalForm.__isNew) return;
  const btn = document.getElementById('f-ai-mensagem');
  const resultBox = document.getElementById('f-ai-mensagem-result');
  if(btn){ btn.disabled = true; btn.innerHTML = `${ICON_SPARKLE} Gerando…`; }
  try{
    const data = await apiRequest('POST', '/ai/mensagem', { cardId: modalForm.id });
    if(resultBox){
      resultBox.style.display = 'block';
      resultBox.innerHTML = `
        <p>${esc(data.mensagem)}</p>
        <div class="ai-result-actions">
          <button type="button" class="btn-outline" id="f-ai-copiar">Copiar</button>
          <button type="button" class="wa-btn" id="f-ai-abrir-wa">${WA_ICON} Abrir com essa mensagem</button>
        </div>
      `;
      const copiarBtn = document.getElementById('f-ai-copiar');
      if(copiarBtn) copiarBtn.addEventListener('click', ()=>{
        navigator.clipboard.writeText(data.mensagem).catch(()=>{});
      });
      const abrirBtn = document.getElementById('f-ai-abrir-wa');
      if(abrirBtn) abrirBtn.addEventListener('click', ()=>{
        const link = waLink(modalForm.telefone);
        if(link) window.open(link + '?text=' + encodeURIComponent(data.mensagem), '_blank', 'noopener');
      });
    }
  }catch(e){
    errorMsg = e.message || 'Não foi possível gerar a mensagem.';
    renderApp();
  }
  if(btn){ btn.disabled = false; btn.innerHTML = `${ICON_SPARKLE} Sugerir mensagem`; }
}

async function sugerirTarefaIA(){
  if(!modalForm || modalForm.__isNew) return;
  const btn = document.getElementById('f-ai-tarefa');
  const resultBox = document.getElementById('f-ai-tarefa-result');
  if(btn){ btn.disabled = true; btn.innerHTML = `${ICON_SPARKLE} Pensando…`; }
  try{
    const data = await apiRequest('POST', '/ai/sugerir-tarefa', { cardId: modalForm.id });
    const dataVenc = new Date();
    dataVenc.setDate(dataVenc.getDate() + data.dias);
    const vencISO = hojeLocalISO(dataVenc);
    if(resultBox){
      resultBox.style.display = 'block';
      resultBox.innerHTML = `
        <p><b>${esc(data.titulo)}</b> — vencimento sugerido: ${formatDate(vencISO)}</p>
        <div class="ai-result-actions">
          <button type="button" class="btn-outline" id="f-ai-criar-tarefa">Criar essa tarefa</button>
        </div>
      `;
      const criarBtn = document.getElementById('f-ai-criar-tarefa');
      if(criarBtn) criarBtn.addEventListener('click', async ()=>{
        criarBtn.disabled = true;
        try{
          const nova = await apiRequest('POST', '/tasks', {
            titulo: data.titulo, vencimento: vencISO, prioridade:'media', leadId: modalForm.id, descricao:'',
          });
          tasks.push(nova);
          resultBox.innerHTML = '<p>✓ Tarefa criada.</p>';
        }catch(e){
          errorMsg = 'Não foi possível criar a tarefa.';
          renderApp();
        }
      });
    }
  }catch(e){
    errorMsg = e.message || 'Não foi possível sugerir uma tarefa.';
    renderApp();
  }
  if(btn){ btn.disabled = false; btn.innerHTML = `${ICON_SPARKLE} Sugerir tarefa de acompanhamento`; }
}
