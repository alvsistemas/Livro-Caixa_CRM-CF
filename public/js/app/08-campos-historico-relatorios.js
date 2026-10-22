/* ---------- Campos personalizados ---------- */
async function toggleAgendamentoPublicoAtivo(){
  agendamentoPublicoForm.ativo = !agendamentoPublicoForm.ativo;
  renderApp();
}
async function salvarAgendamentoPublico(){
  agendamentoPublicoForm.horaInicio = document.getElementById('ap-hora-inicio').value || agendamentoPublicoForm.horaInicio;
  agendamentoPublicoForm.horaFim = document.getElementById('ap-hora-fim').value || agendamentoPublicoForm.horaFim;
  agendamentoPublicoForm.duracaoMinutos = Number(document.getElementById('ap-duracao').value);
  agendamentoPublicoForm.diasSemana = [...document.querySelectorAll('.ap-dia-semana:checked')].map(el=>Number(el.value));
  agendamentoPublicoForm.colunaDestinoId = document.getElementById('ap-coluna-destino').value;
  try{
    const data = await apiRequest('PUT', '/auth/agendamento-publico', agendamentoPublicoForm);
    currentUser = data.user;
    localStorage.setItem('user', JSON.stringify(currentUser));
    agendamentoPublicoMsg = { tipo:'ok', texto:'Configuração salva.' };
  }catch(e){
    agendamentoPublicoMsg = { tipo:'erro', texto: e.message || 'Não foi possível salvar.' };
  }
  renderApp();
}
function copiarLinkAgendamento(){
  const link = `${window.location.origin}/agendar/${currentUser.id}`;
  navigator.clipboard.writeText(link).then(()=>{
    agendamentoPublicoMsg = { tipo:'ok', texto:'Link copiado!' };
    renderApp();
  });
}
async function loadWebhooksSaida(){
  try{
    const data = await apiRequest('GET', '/webhooks-saida');
    webhooksSaida = data.webhooks || [];
  }catch(e){
    webhooksSaida = [];
  }
  renderApp();
}
async function criarWebhookSaida(){
  const nome = document.getElementById('novo-webhook-nome').value;
  const url = document.getElementById('novo-webhook-url').value;
  const eventos = [...document.querySelectorAll('.novo-webhook-evento:checked')].map(el=>el.value);
  if(!url.trim() || !eventos.length){
    webhooksSaidaMsg = { tipo:'erro', texto:'Preencha a URL e escolha ao menos um evento.' };
    renderApp();
    return;
  }
  try{
    const novo = await apiRequest('POST', '/webhooks-saida', { nome, url, eventos });
    webhooksSaida.unshift(novo);
    webhooksSaidaMsg = { tipo:'ok', texto:'Webhook criado.' };
  }catch(e){
    webhooksSaidaMsg = { tipo:'erro', texto: e.message || 'Não foi possível criar o webhook.' };
  }
  renderApp();
}
async function toggleWebhookSaida(id, ativo){
  try{
    const atualizado = await apiRequest('PUT', `/webhooks-saida/${id}`, { ativo });
    const idx = webhooksSaida.findIndex(w=>w.id===id);
    if(idx>-1) webhooksSaida[idx] = atualizado;
  }catch(e){
    webhooksSaidaMsg = { tipo:'erro', texto:'Não foi possível alterar o webhook.' };
  }
  renderApp();
}
async function excluirWebhookSaida(id){
  showConfirm({
    message: 'Remover esse webhook? Ele para de disparar imediatamente.',
    confirmLabel: 'Remover',
    onConfirm: async ()=>{
      closeConfirm();
      try{
        await apiRequest('DELETE', `/webhooks-saida/${id}`);
        webhooksSaida = webhooksSaida.filter(w=>w.id!==id);
      }catch(e){
        webhooksSaidaMsg = { tipo:'erro', texto:'Não foi possível remover o webhook.' };
      }
      renderApp();
    },
  });
}
async function testarWebhookSaida(id){
  webhooksSaidaMsg = { tipo:'ok', texto:'Enviando teste…' };
  renderApp();
  try{
    await apiRequest('POST', `/webhooks-saida/${id}/testar`);
    webhooksSaidaMsg = { tipo:'ok', texto:'Teste enviado — confira do outro lado.' };
  }catch(e){
    webhooksSaidaMsg = { tipo:'erro', texto: e.message || 'Não foi possível testar esse webhook agora.' };
  }
  renderApp();
}
async function loadCamposPersonalizados(){
  try{
    const data = await apiRequest('GET', '/campos-personalizados');
    camposPersonalizados = data.campos || [];
  }catch(e){
    camposPersonalizados = [];
  }
  camposPersonalizadosCarregados = true;
  renderApp();
}
async function criarCampoPersonalizado(){
  const nome = novoCampoNome.trim();
  if(!nome){
    camposPersonalizadosMsg = { tipo:'erro', texto:'Digite um nome pro campo.' };
    renderApp();
    return;
  }
  try{
    const novo = await apiRequest('POST', '/campos-personalizados', { nome, tipo: novoCampoTipo });
    camposPersonalizados.push(novo);
    novoCampoNome = '';
    camposPersonalizadosMsg = null;
  }catch(e){
    camposPersonalizadosMsg = { tipo:'erro', texto: e.message || 'Não foi possível criar o campo.' };
  }
  renderApp();
}
async function excluirCampoPersonalizado(id){
  const idx = camposPersonalizados.findIndex(c=>c.id===id);
  if(idx===-1) return;
  const [removido] = camposPersonalizados.splice(idx,1);
  renderApp();
  try{
    await apiRequest('DELETE', `/campos-personalizados/${id}`);
  }catch(e){
    camposPersonalizados.splice(idx,0,removido);
    errorMsg = 'Não foi possível excluir o campo.';
    renderApp();
  }
}

/* ---------- Histórico de contato (dentro do card) ---------- */
async function loadHistoricoContato(cardId){
  try{
    const data = await apiRequest('GET', `/historico-contato/${cardId}`);
    historicoContatoItens = data.itens || [];
  }catch(e){
    historicoContatoItens = [];
  }
  historicoContatoCarregado = true;
  const lista = document.getElementById('f-historico-lista');
  if(lista){
    lista.innerHTML = renderHistoricoContatoListaHtml();
    ligarBindingsHistoricoContato();
  }
}
function renderHistoricoContatoListaHtml(){
  if(!historicoContatoItens.length) return '<p class="dash-empty">Nenhum registro ainda.</p>';
  return `<div class="historico-lista">${historicoContatoItens.map(i=>{
    if(historicoContatoEditandoId === i.id){
      return `
    <div class="historico-item">
      <div class="field-row-flex" style="flex:1;">
        <input type="text" id="historico-edit-input-${i.id}" value="${esc(i.texto)}" />
        <button class="btn-primary" data-action="salvar-edicao-historico" data-id="${i.id}">Salvar</button>
        <button class="btn-outline" data-action="cancelar-edicao-historico">Cancelar</button>
      </div>
    </div>`;
    }
    return `
    <div class="historico-item">
      <div style="flex:1;">
        <span class="historico-item-texto">${esc(i.texto)}</span>
        <span class="historico-item-data">${formatDateHora(i.createdAt)}</span>
      </div>
      <button class="icon-btn" data-action="editar-historico-contato" data-id="${i.id}" title="Editar">✎</button>
      <button class="icon-btn" data-action="excluir-historico-contato" data-id="${i.id}" title="Excluir">${ICON_TRASH}</button>
    </div>`;
  }).join('')}</div>`;
}
function ligarBindingsHistoricoContato(){
  document.querySelectorAll('[data-action="excluir-historico-contato"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id;
      const idx = historicoContatoItens.findIndex(i=>i.id===id);
      if(idx===-1) return;
      const [removido] = historicoContatoItens.splice(idx,1);
      const lista = document.getElementById('f-historico-lista');
      if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
      try{
        await apiRequest('DELETE', `/historico-contato/${id}`);
      }catch(e){
        historicoContatoItens.splice(idx,0,removido);
        errorMsg = 'Não foi possível excluir o registro.';
        if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
      }
    });
  });
  document.querySelectorAll('[data-action="editar-historico-contato"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      historicoContatoEditandoId = btn.dataset.id;
      const lista = document.getElementById('f-historico-lista');
      if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
      const input = document.getElementById(`historico-edit-input-${historicoContatoEditandoId}`);
      if(input){ input.focus(); input.select(); }
    });
  });
  document.querySelectorAll('[data-action="cancelar-edicao-historico"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      historicoContatoEditandoId = null;
      const lista = document.getElementById('f-historico-lista');
      if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
    });
  });
  document.querySelectorAll('[data-action="salvar-edicao-historico"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.id;
      const input = document.getElementById(`historico-edit-input-${id}`);
      const novoTexto = input ? input.value.trim() : '';
      if(!novoTexto) return;
      const idx = historicoContatoItens.findIndex(i=>i.id===id);
      if(idx===-1) return;
      const anterior = historicoContatoItens[idx].texto;
      historicoContatoItens[idx].texto = novoTexto;
      historicoContatoEditandoId = null;
      const lista = document.getElementById('f-historico-lista');
      if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
      try{
        await apiRequest('PUT', `/historico-contato/${id}`, { texto: novoTexto });
      }catch(e){
        historicoContatoItens[idx].texto = anterior;
        errorMsg = 'Não foi possível editar o registro.';
        if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
      }
    });
  });
}
async function adicionarHistoricoContato(){
  const texto = historicoContatoTexto.trim();
  if(!texto || !modalForm || modalForm.__isNew) return;
  historicoContatoEnviando = true;
  const input = document.getElementById('historico-input');
  if(input) input.disabled = true;
  try{
    const novo = await apiRequest('POST', '/historico-contato', { cardId: modalForm.id, texto });
    historicoContatoItens.unshift(novo);
    historicoContatoTexto = '';
    const lista = document.getElementById('f-historico-lista');
    if(lista){ lista.innerHTML = renderHistoricoContatoListaHtml(); ligarBindingsHistoricoContato(); }
    if(input){ input.value = ''; }
  }catch(e){
    errorMsg = 'Não foi possível salvar o registro.';
    renderApp();
  }
  historicoContatoEnviando = false;
  if(input) input.disabled = false;
}
function formatarTamanhoArquivo(bytes){
  if(!bytes) return '0 KB';
  if(bytes < 1024*1024) return `${Math.round(bytes/1024)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
}
async function loadAnexosDoCard(cardId){
  try{
    const data = await apiRequest('GET', `/cards/${cardId}/anexos`);
    anexosDoCard = data.anexos || [];
  }catch(e){
    anexosDoCard = [];
  }
  anexosCarregados = true;
  const lista = document.getElementById('f-anexos-lista');
  if(lista){
    lista.innerHTML = renderAnexosListaHtml();
    ligarBindingsAnexos();
  }
}
function renderAnexosListaHtml(){
  const msgHtml = anexoMsg ? `<p class="settings-page-msg ${anexoMsg.tipo}">${esc(anexoMsg.texto)}</p>` : '';
  if(!anexosDoCard.length) return `${msgHtml}<p class="settings-page-note">Nenhum anexo ainda.</p>`;
  return `
    ${msgHtml}
    <div class="anexos-lista">
      ${anexosDoCard.map(a=>`
        <div class="anexo-item">
          <a href="${a.dadosBase64}" download="${esc(a.nomeArquivo)}" class="anexo-item-nome">📎 ${esc(a.nomeArquivo)}</a>
          <span class="settings-page-note">${formatarTamanhoArquivo(a.tamanho)}</span>
          <button type="button" class="icon-btn" data-action="excluir-anexo" data-anexo-id="${a.id}" title="Excluir">${ICON_TRASH}</button>
        </div>
      `).join('')}
    </div>
  `;
}
function ligarBindingsAnexos(){
  document.querySelectorAll('[data-action="excluir-anexo"]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const anexoId = btn.dataset.anexoId;
      btn.disabled = true;
      try{
        await apiRequest('DELETE', `/cards/${modalForm.id}/anexos/${anexoId}`);
        anexosDoCard = anexosDoCard.filter(a=>a.id!==anexoId);
        const lista = document.getElementById('f-anexos-lista');
        if(lista){ lista.innerHTML = renderAnexosListaHtml(); ligarBindingsAnexos(); }
      }catch(e){
        errorMsg = 'Não foi possível excluir o anexo.';
        renderApp();
      }
    });
  });
}
function lerArquivoComoBase64(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=> resolve(e.target.result);
    reader.onerror = ()=> reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}
async function handleAnexoFileSelected(file){
  if(!file || !modalForm || modalForm.__isNew) return;
  const btn = document.getElementById('anexo-upload-btn');
  const lista = document.getElementById('f-anexos-lista');
  if(file.size > 3.2 * 1024 * 1024){
    anexoMsg = { tipo:'erro', texto:'Arquivo muito grande. O limite é de aproximadamente 3 MB.' };
    if(lista){ lista.innerHTML = renderAnexosListaHtml(); ligarBindingsAnexos(); }
    return;
  }
  anexoEnviando = true;
  anexoMsg = null;
  if(btn){ btn.disabled = true; btn.textContent = 'Enviando…'; }
  if(lista){ lista.innerHTML = renderAnexosListaHtml(); ligarBindingsAnexos(); }
  try{
    const dadosBase64 = await lerArquivoComoBase64(file);
    const novo = await apiRequest('POST', `/cards/${modalForm.id}/anexos`, {
      nomeArquivo: file.name, tipoMime: file.type, dadosBase64,
    });
    anexosDoCard.unshift(novo);
    anexoMsg = { tipo:'ok', texto:'Anexo enviado.' };
  }catch(e){
    anexoMsg = { tipo:'erro', texto: e.message || 'Não foi possível enviar o anexo.' };
  }
  anexoEnviando = false;
  if(btn){ btn.disabled = false; btn.textContent = '+ Adicionar anexo'; }
  const listaAtualizada = document.getElementById('f-anexos-lista');
  if(listaAtualizada){ listaAtualizada.innerHTML = renderAnexosListaHtml(); ligarBindingsAnexos(); }
}

async function loadTemplates(){
  try{
    const data = await apiRequest('GET', '/whatsapp/templates');
    templatesList = data.templates || [];
  }catch(e){
    templatesList = [];
  }
  templatesCarregados = true;
  renderApp();
}
async function sincronizarTemplates(){
  templatesSincronizando = true;
  templatesMsg = null;
  renderApp();
  try{
    const data = await apiRequest('GET', '/whatsapp/templates');
    templatesList = data.templates || [];
    templatesMsg = { tipo:'ok', texto:'Lista atualizada.' };
  }catch(e){
    templatesMsg = { tipo:'erro', texto: e.message || 'Não foi possível sincronizar.' };
  }
  templatesSincronizando = false;
  renderApp();
}
function openNewTemplateModal(){
  templateModalForm = { nome:'', categoria:'MARKETING', idioma:'pt_BR', texto:'' };
  templateMsg = null;
  renderTemplateModal();
}
function closeTemplateModal(){ templateModalForm = null; document.getElementById('modal-root').innerHTML=''; }
async function enviarNovoTemplate(){
  const f = templateModalForm;
  if(!f.nome.trim() || !f.texto.trim()){
    templateMsg = { tipo:'erro', texto:'Preencha o nome e o texto da mensagem.' };
    renderTemplateModal();
    return;
  }
  templateSalvando = true;
  templateMsg = null;
  renderTemplateModal();
  try{
    await apiRequest('POST', '/whatsapp/templates', {
      nome: f.nome, categoria: f.categoria, idioma: f.idioma || 'pt_BR', texto: f.texto,
    });
    closeTemplateModal();
    await loadTemplates();
  }catch(e){
    templateMsg = { tipo:'erro', texto: e.message || 'Não foi possível enviar o template.' };
    templateSalvando = false;
    renderTemplateModal();
  }
}
function renderTemplateModal(){
  const root = document.getElementById('modal-root');
  if(!templateModalForm){ root.innerHTML=''; return; }
  const f = templateModalForm;
  root.innerHTML = `
    <div class="overlay" id="tpl-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Novo template</h3>
          <button id="tpl-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Nome (só letras minúsculas e "_", sem espaço)</label>
            <input type="text" id="tpl-nome" value="${esc(f.nome)}" placeholder="Ex: boas_vindas" />
          </div>
          <div class="field">
            <label>Categoria</label>
            <select id="tpl-categoria">
              <option value="MARKETING" ${f.categoria==='MARKETING'?'selected':''}>Marketing</option>
              <option value="UTILITY" ${f.categoria==='UTILITY'?'selected':''}>Utilidade</option>
              <option value="AUTHENTICATION" ${f.categoria==='AUTHENTICATION'?'selected':''}>Autenticação</option>
            </select>
          </div>
          <div class="field">
            <label>Idioma</label>
            <input type="text" id="tpl-idioma" value="${esc(f.idioma)}" placeholder="pt_BR" />
          </div>
          <div class="field">
            <label>Texto da mensagem</label>
            <textarea id="tpl-texto" rows="4" placeholder="Use {{1}}, {{2}} pra variáveis. Ex: Olá {{1}}, sua proposta está pronta!">${esc(f.texto)}</textarea>
          </div>
          <p class="settings-page-note">Depois de enviado, a Meta pode levar de minutos a alguns dias pra aprovar. Use "Sincronizar" na lista pra ver o status atualizado.</p>
          ${templateMsg ? `<p class="settings-page-msg ${templateMsg.tipo}">${esc(templateMsg.texto)}</p>` : ''}
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="tpl-cancel">Cancelar</button>
            <button class="btn-save" id="tpl-enviar" ${templateSalvando?'disabled':''}>${templateSalvando?'Enviando…':'Enviar pra aprovação'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('tpl-modal-close').addEventListener('click', closeTemplateModal);
  document.getElementById('tpl-cancel').addEventListener('click', closeTemplateModal);
  document.getElementById('tpl-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='tpl-modal-overlay') closeTemplateModal(); });
  document.getElementById('tpl-nome').addEventListener('input', (e)=> templateModalForm.nome = e.target.value);
  document.getElementById('tpl-categoria').addEventListener('change', (e)=> templateModalForm.categoria = e.target.value);
  document.getElementById('tpl-idioma').addEventListener('input', (e)=> templateModalForm.idioma = e.target.value);
  document.getElementById('tpl-texto').addEventListener('input', (e)=> templateModalForm.texto = e.target.value);
  document.getElementById('tpl-enviar').addEventListener('click', enviarNovoTemplate);
}

/* ---------- Relatórios ---------- */
function relatoriosDadosMensais(mesesAtras, cardsBase){
  const cards = cardsBase || board.cards;
  const buckets = [];
  const agora = new Date();
  for(let i=mesesAtras-1;i>=0;i--){
    const d = new Date(agora.getFullYear(), agora.getMonth()-i, 1);
    buckets.push({ key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, novos:0, ganhoValor:0, ganhoQtd:0 });
  }
  const porKey = new Map(buckets.map(b=>[b.key,b]));
  cards.forEach(c=>{
    if(c.createdAt){
      const bucket = porKey.get(c.createdAt.slice(0,7));
      if(bucket) bucket.novos++;
    }
    if(c.mes){
      const bucketGanho = porKey.get(c.mes.slice(0,7));
      const col = board.columns.find(k=>k.id===c.columnId);
      if(bucketGanho && col && col.tipo==='ganho'){
        bucketGanho.ganhoValor += Number(c.valor)||0;
        bucketGanho.ganhoQtd++;
      }
    }
  });
  return buckets;
}
function baixarCsv(cards, nomeArquivo){
  const linhas = [['Nome','Telefone','Valor','Coluna','Temperatura','Início de contato','Mês de venda'].join(',')];
  cards.forEach(c=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    linhas.push([
      `"${(c.cliente||'').replace(/"/g,'""')}"`,
      `"${(c.telefone||'').replace(/"/g,'""')}"`,
      c.valor||0,
      `"${col?col.nome.replace(/"/g,'""'):''}"`,
      c.temperatura||'',
      c.mesInicioContato||'',
      c.mes||'',
    ].join(','));
  });
  const blob = new Blob([linhas.join('\n')], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function exportarCsv(){
  baixarCsv(cardsParaRelatorio(), `leads_${currentMonthKey()}.csv`);
}
// Exporta os mesmos dados do CSV, mas em planilha do Excel (.xlsx): valor como número e colunas já largas.
function baixarXlsx(cards, nomeArquivo){
  if(typeof XLSX === 'undefined'){
    errorMsg = 'A biblioteca de planilhas não carregou. Confira a internet e recarregue a página.';
    renderApp();
    return;
  }
  const linhas = cards.map(c=>{
    const col = board.columns.find(k=>k.id===c.columnId);
    return {
      'Nome': c.cliente||'',
      'Telefone': c.telefone||'',
      'Valor': Number(c.valor)||0,
      'Coluna': col ? col.nome : '',
      'Temperatura': c.temperatura||'',
      'Início de contato': c.mesInicioContato||'',
      'Mês de venda': c.mes||'',
    };
  });
  const ws = XLSX.utils.json_to_sheet(linhas, { header:['Nome','Telefone','Valor','Coluna','Temperatura','Início de contato','Mês de venda'] });
  ws['!cols'] = [{wch:30},{wch:18},{wch:14},{wch:20},{wch:14},{wch:18},{wch:14}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads');
  XLSX.writeFile(wb, nomeArquivo);
}
function exportarXlsx(){
  baixarXlsx(cardsParaRelatorio(), `leads_${currentMonthKey()}.xlsx`);
}
function exportarRelatorioPdf(){
  const cardsRel = cardsParaRelatorio();
  const dados = relatoriosDadosMensais(6, cardsRel);
  const totalGanho = cardsRel.reduce((s,c)=>{ const col=board.columns.find(k=>k.id===c.columnId); return col&&col.tipo==='ganho' ? s+(Number(c.valor)||0) : s; },0);
  const totalPerdido = cardsRel.reduce((s,c)=>{ const col=board.columns.find(k=>k.id===c.columnId); return col&&col.tipo==='perdido' ? s+(Number(c.valor)||0) : s; },0);
  const porTemp = ['quente','morno','frio'].map(t=>({ temp:t, count: cardsRel.filter(c=>c.temperatura===t).length }));
  const funilNome = relatorioFunilId ? ((funis.find(f=>f.id===relatorioFunilId)||{}).nome || '') : 'Todos os funis';

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 20;
  doc.setFontSize(18);
  doc.text('Relatório — Painel CRM', 14, y); y += 7;
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`${funilNome} — gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, y); y += 12;
  doc.setTextColor(20);

  doc.setFontSize(13);
  doc.text('Resumo', 14, y); y += 8;
  doc.setFontSize(11);
  doc.text(`Total ganho: ${fmtBRL(totalGanho)}`, 14, y); y += 6;
  doc.text(`Total perdido: ${fmtBRL(totalPerdido)}`, 14, y); y += 6;
  doc.text(`Total de leads: ${cardsRel.length}`, 14, y); y += 12;

  doc.setFontSize(13);
  doc.text('Novos leads por mês', 14, y); y += 8;
  doc.setFontSize(11);
  dados.forEach(d=>{
    doc.text(`${monthLabel(d.key)}: ${d.novos}`, 14, y); y += 6;
  });
  y += 6;

  doc.setFontSize(13);
  doc.text('Leads por qualificação', 14, y); y += 8;
  doc.setFontSize(11);
  porTemp.forEach(t=>{
    doc.text(`${TEMPS[t.temp].label}: ${t.count}`, 14, y); y += 6;
  });

  doc.save(`relatorio_${currentMonthKey()}.pdf`);
}
function exportarLeads(){
  baixarCsv(filteredLeads(), `contatos_${currentMonthKey()}.csv`);
}
function exportarLeadsXlsx(){
  baixarXlsx(filteredLeads(), `contatos_${currentMonthKey()}.xlsx`);
}
async function connectGoogleCalendar(){
  try{
    const data = await apiRequest('GET', '/calendar/connect-url');
    window.location.href = data.url;
  }catch(e){
    errorMsg = 'Não foi possível iniciar a conexão com a Google Agenda.';
    renderApp();
  }
}
async function disconnectGoogleCalendar(){
  try{
    await apiRequest('POST', '/calendar/disconnect');
    calendarConnected = false;
  }catch(e){
    errorMsg = 'Não foi possível desconectar da Google Agenda.';
  }
  renderApp();
}
function abrirBackupModal(){
  backupModalAberto = true;
  backupMsg = null;
  renderBackupModal();
}
function closeBackupModal(){
  backupModalAberto = false;
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
}
function renderBackupModal(){
  const root = document.getElementById('modal-root');
  if(!backupModalAberto){ root.innerHTML=''; return; }
  root.innerHTML = `
    <div class="overlay" id="backup-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Backup dos seus dados</h3>
          <button id="backup-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <p class="settings-page-note">Guarda ou restaura uma cópia de todos os seus clientes, tarefas, comissões, mensagens e configurações.</p>
          ${backupMsg ? `<p class="settings-page-msg ${backupMsg.tipo}">${esc(backupMsg.texto)}</p>` : ''}
          <div class="backup-opcoes-row" style="margin-top:14px;">
            <div class="backup-opcao-card">
              <div class="backup-opcao-titulo">⬇ Exportar</div>
              <p class="settings-page-note">Baixa um arquivo .json com tudo, pra guardar num lugar seguro (Google Drive, por exemplo).</p>
              <button class="btn-outline" id="backup-modal-exportar" ${backupGerando?'disabled':''}>${backupGerando?'Gerando…':'Baixar backup completo'}</button>
            </div>
            <div class="backup-opcao-card">
              <div class="backup-opcao-titulo">⬆ Importar</div>
              <p class="settings-page-note">Restaura a partir de um arquivo .json de backup — atualiza o que já existe e cria o que estiver faltando, sem apagar nada.</p>
              <input type="file" id="backup-import-input" accept="application/json" style="display:none;" />
              <button class="btn-outline" id="backup-modal-importar" ${backupImportando?'disabled':''}>${backupImportando?'Importando…':'Escolher arquivo e restaurar'}</button>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="backup-modal-fechar">Fechar</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('backup-modal-close').addEventListener('click', closeBackupModal);
  document.getElementById('backup-modal-fechar').addEventListener('click', closeBackupModal);
  document.getElementById('backup-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='backup-modal-overlay') closeBackupModal(); });
  document.getElementById('backup-modal-exportar').addEventListener('click', baixarBackupCompleto);
  document.getElementById('backup-modal-importar').addEventListener('click', escolherArquivoBackup);
  document.getElementById('backup-import-input').addEventListener('change', (e)=>{
    const file = e.target.files[0];
    e.target.value = '';
    importarArquivoBackup(file);
  });
}
function escolherArquivoBackup(){
  const input = document.getElementById('backup-import-input');
  if(input) input.click();
}
async function importarArquivoBackup(file){
  if(!file) return;
  showConfirm({
    message: 'Restaurar esse backup? Isso atualiza clientes, tarefas e outros dados que já existirem com o mesmo identificador, e cria o que estiver faltando. Nada é apagado.',
    confirmLabel: 'Restaurar',
    danger: false,
    onConfirm: async ()=>{
      closeConfirm();
      backupImportando = true;
      backupMsg = null;
      renderApp();
      if(backupModalAberto) renderBackupModal();
      try{
        const texto = await file.text();
        const dados = JSON.parse(texto);
        const token = getToken();
        const res = await fetch(API_BASE + '/backup/importar-tudo', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify(dados),
        });
        const resposta = await res.json();
        if(!res.ok) throw new Error(resposta.error || 'Não foi possível importar o backup.');
        const totalOk = Object.values(resposta.resultado||{}).reduce((s,r)=>s+(r.ok||0),0);
        const totalErro = Object.values(resposta.resultado||{}).reduce((s,r)=>s+(r.erro||0),0);
        backupMsg = { tipo:'ok', texto: `Backup restaurado: ${totalOk} registro(s) atualizado(s)${totalErro?`, ${totalErro} com erro`:''}.` };
        // recarrega os dados principais da tela, já que podem ter mudado
        await Promise.all([loadBoard(), loadTasks(), loadContratos()]);
      }catch(e){
        backupMsg = { tipo:'erro', texto: e.message || 'Arquivo inválido ou erro ao importar.' };
      }
      backupImportando = false;
      renderApp();
      if(backupModalAberto) renderBackupModal();
    },
  });
}
async function baixarBackupCompleto(){
  if(backupGerando) return;
  backupGerando = true;
  backupMsg = null;
  renderApp();
  if(backupModalAberto) renderBackupModal();
  try{
    const token = getToken();
    const res = await fetch(API_BASE + '/backup/exportar-tudo', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    if(!res.ok) throw new Error('Não foi possível gerar o backup agora.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-painel-crm-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }catch(e){
    backupMsg = { tipo:'erro', texto: e.message || 'Não foi possível gerar o backup agora.' };
  }
  backupGerando = false;
  renderApp();
  if(backupModalAberto) renderBackupModal();
}
async function preencherMesInicioContatoAntigos(){
  preenchendoMesInicioContato = true;
  mesInicioContatoMsg = null;
  renderApp();
  try{
    const data = await apiRequest('POST', '/cards/preencher-mes-inicio-contato');
    // atualiza localmente também, sem precisar recarregar tudo do servidor de novo
    board.cards.forEach(c=>{ if(!c.mesInicioContato && c.mes) c.mesInicioContato = c.mes; });
    mesInicioContatoMsg = { tipo:'ok', texto: data.atualizados
      ? `${data.atualizados} lead(s) atualizado(s).`
      : 'Nenhum lead precisava de atualização — todos já tinham esse campo preenchido.' };
  }catch(e){
    mesInicioContatoMsg = { tipo:'erro', texto:'Não foi possível preencher os leads antigos agora.' };
  }
  preenchendoMesInicioContato = false;
  renderApp();
}
async function verificarAtualizacaoApp(){
  verificandoAtualizacao = true;
  atualizacaoMsg = null;
  renderApp();
  try{
    if('serviceWorker' in navigator){
      const reg = await navigator.serviceWorker.getRegistration();
      if(reg) await reg.update();
    }
    atualizacaoMsg = { tipo:'ok', texto:'Tudo certo! Recarregando a página...' };
    renderApp();
    setTimeout(()=>{ window.location.reload(); }, 700);
  }catch(e){
    atualizacaoMsg = { tipo:'erro', texto:'Não foi possível verificar agora. Tenta fechar e abrir o app de novo.' };
    verificandoAtualizacao = false;
    renderApp();
  }
}
async function syncCalendarNow(){
  if(calendarSyncing) return;
  calendarSyncing = true;
  renderApp();
  try{
    await apiRequest('POST', '/tasks/sync-calendar');
    await loadTasks();
    if(currentPage==='tarefas') await loadAgendaMes(agendaMesAtual); // busca de novo os eventos do Google pro mês em tela
  }catch(e){
    errorMsg = e.message || 'Não foi possível sincronizar com a Google Agenda agora.';
  }
  calendarSyncing = false;
  renderApp();
}
function tratarRetornoDoGoogle(){
  const params = new URLSearchParams(window.location.search);
  const status = params.get('calendar');
  if(!status) return;
  if(status === 'conectado'){ calendarConnected = true; }
  else if(status === 'erro'){ errorMsg = 'Não foi possível conectar com a Google Agenda. Tente novamente.'; }
  window.history.replaceState({}, '', window.location.pathname);
}

