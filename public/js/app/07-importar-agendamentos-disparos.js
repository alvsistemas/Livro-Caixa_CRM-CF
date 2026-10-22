/* ---------- Importar/Exportar (planilha -> possíveis leads) ---------- */
/* animação do painel da planilha: desce ao escolher o arquivo, sobe ao clicar no X */
function animarAberturaPainelImport(){
  const el = document.querySelector('.import-painel');
  importPainelAbrindo = false;
  if(!el) return;
  void el.offsetHeight; // força o navegador a registrar o estado fechado antes de abrir
  requestAnimationFrame(()=> el.classList.add('aberto'));
}
function limparPlanilhaImport(manterMsg){
  importPlanilhaLinhas = [];
  importPlanilhaColunas = [];
  importPlanilhaNomeArquivo = '';
  importMapNome = ''; importMapTelefone = ''; importMapServico = '';
  if(!manterMsg) importPlanilhaMsg = null;
  importPainelFechando = false;
  renderApp();
}
function fecharPlanilhaImport(manterMsg){
  if(importPainelFechando) return;
  const el = document.querySelector('.import-painel');
  if(!el){ limparPlanilhaImport(manterMsg); return; }
  importPainelFechando = true;
  el.classList.remove('aberto'); // sobe; ao terminar, a página volta ao estado original
  setTimeout(()=> limparPlanilhaImport(manterMsg), 380);
}
function baixarPlanilhaModelo(){
  const cab = ['Nome', 'Telefone', 'Serviço desejado'];
  const exemplos = [['Maria Souza', '(15) 98805-3447', 'Consórcio de imóvel'], ['João Lima', '(15) 99999-0000', 'Consórcio de veículo']];
  if(typeof XLSX === 'undefined'){
    const csv = [cab, ...exemplos].map(l=>l.map(c=>`"${c}"`).join(';')).join('\r\n');
    const blob = new Blob(['\ufeff'+csv], { type:'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'planilha-modelo-leads.csv';
    document.body.appendChild(a); a.click(); a.remove();
    return;
  }
  const ws = XLSX.utils.aoa_to_sheet([cab, ...exemplos]);
  ws['!cols'] = [{ wch:28 }, { wch:20 }, { wch:28 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads');
  XLSX.writeFile(wb, 'planilha-modelo-leads.xlsx');
}
function handlePlanilhaFileSelected(file){
  if(!file) return;
  importPlanilhaMsg = null;
  importPlanilhaNomeArquivo = file.name;
  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      const workbook = XLSX.read(e.target.result, { type:'array' });
      const primeiraAba = workbook.SheetNames[0];
      const linhas = XLSX.utils.sheet_to_json(workbook.Sheets[primeiraAba], { defval:'' });
      if(!linhas.length){
        importPlanilhaMsg = { tipo:'erro', texto:'A planilha parece estar vazia.' };
        importPlanilhaLinhas = [];
        importPlanilhaColunas = [];
        renderApp();
        return;
      }
      importPlanilhaLinhas = linhas;
      importPlanilhaColunas = Object.keys(linhas[0]);
      // tenta adivinhar as colunas certas pelo nome, só pra facilitar — usuário confirma/ajusta de qualquer forma
      const achar = (padroes)=> importPlanilhaColunas.find(c=> padroes.some(p=> c.toLowerCase().includes(p))) || '';
      importMapNome = achar(['nome']);
      importMapTelefone = achar(['telefone','celular','fone','whats']);
      importMapServico = achar(['serviço','servico','produto','interesse','tipo']);
      importPlanilhaMsg = null;
      importPainelAbrindo = true; // desenha o painel fechado e logo abaixo anima a descida
    }catch(err){
      importPlanilhaMsg = { tipo:'erro', texto:'Não foi possível ler esse arquivo. Confira se é um .csv ou .xlsx válido.' };
      importPlanilhaLinhas = [];
      importPlanilhaColunas = [];
    }
    renderApp();
  };
  reader.readAsArrayBuffer(file);
}
async function confirmarImportPlanilha(){
  if(!importMapNome && !importMapTelefone){
    importPlanilhaMsg = { tipo:'erro', texto:'Escolha ao menos a coluna de nome ou de telefone.' };
    renderApp();
    return;
  }
  const linhas = importPlanilhaLinhas.map(linha=>({
    nome: importMapNome ? linha[importMapNome] : '',
    telefone: importMapTelefone ? linha[importMapTelefone] : '',
    tipoServico: importMapServico ? linha[importMapServico] : '',
  }));
  importandoPlanilha = true;
  importPlanilhaMsg = null;
  renderApp();
  try{
    const data = await apiRequest('POST', '/possiveis-leads/importar', { linhas, origemArquivo: importPlanilhaNomeArquivo });
    importPlanilhaMsg = { tipo:'ok', texto:`${data.total} possível lead(s) importado(s).` };
    importandoPlanilha = false;
    await loadPossiveisLeads();
    fecharPlanilhaImport(true); // painel sobe e a mensagem de sucesso fica
    return;
  }catch(e){
    importPlanilhaMsg = { tipo:'erro', texto: e.message || 'Não foi possível importar a planilha.' };
  }
  importandoPlanilha = false;
  renderApp();
}
async function loadPossiveisLeads(){
  try{
    const data = await apiRequest('GET', '/possiveis-leads');
    possiveisLeads = data.leads || [];
  }catch(e){
    possiveisLeads = [];
  }
  possiveisLeadsCarregados = true;
  renderApp();
}
async function descartarPossivelLead(id){
  const idx = possiveisLeads.findIndex(l=>l.id===id);
  if(idx===-1) return;
  const [removido] = possiveisLeads.splice(idx,1);
  renderApp();
  try{
    await apiRequest('DELETE', `/possiveis-leads/${id}`);
  }catch(e){
    possiveisLeads.splice(idx,0,removido);
    errorMsg = 'Não foi possível descartar.';
    renderApp();
  }
}
// opções de destino para o gestor (ele mesmo + o resto da equipe)
function opcoesDestinoEquipe(selecionado, incluirEu){
  const membros = (equipe && equipe.membros) || [];
  return [
    ...(incluirEu ? [`<option value="" ${!selecionado?'selected':''}>Para mim</option>`] : []),
    ...membros.filter(m=>!m.souEu).map(m=>`<option value="${m.id}" ${selecionado===m.id?'selected':''}>${esc(m.nome||m.email)}</option>`),
  ].join('');
}
async function passarPossiveisParaLeads(todos){
  if(possiveisPassandoLote) return;
  const ids = todos ? [] : [...possiveisSelecionados];
  if(!todos && !ids.length) return;
  possiveisPassandoLote = true; possiveisLoteMsg = null; renderApp();
  try{
    const r = await apiRequest('POST', '/possiveis-leads/promover-lote', { ids, atribuirParaId: possiveisDestinoId || undefined });
    (r.cards||[]).forEach(c=>board.cards.push(c));
    const idsFeitos = new Set(todos ? possiveisLeads.map(l=>l.id) : ids);
    possiveisLeads = possiveisLeads.filter(l=>!idsFeitos.has(l.id));
    possiveisSelecionados.clear();
    possiveisLoteMsg = { tipo:'ok', texto: r.destinoNome
      ? `${r.total} lead(s) enviado(s) para ${r.destinoNome}.`
      : `${r.total} lead(s) adicionado(s) aos Leads, com início de contato de hoje.` };
  }catch(e){
    possiveisLoteMsg = { tipo:'erro', texto: e.message || 'Não foi possível passar os leads.' };
  }
  possiveisPassandoLote = false;
  renderApp();
}
function abrirCompletarLead(id){
  const lead = possiveisLeads.find(l=>l.id===id);
  if(!lead) return;
  completarLeadModalForm = {
    possivelLeadId: lead.id, nome: lead.nome||'', telefone: lead.telefone||'',
    tipoServico: lead.tipoServico||'', columnId: ((board.columns.find(c=>c.tipo==='aberto')||board.columns[0]||{}).id)||'',
    valor: 0, temperatura:'morno',
  };
  completarLeadMsg = null;
  renderCompletarLeadModal();
}
function closeCompletarLeadModal(){ completarLeadModalForm = null; document.getElementById('modal-root').innerHTML=''; }
async function salvarCompletarLead(){
  const f = completarLeadModalForm;
  if(!f.nome.trim()){
    completarLeadMsg = { tipo:'erro', texto:'Informe o nome do cliente.' };
    renderCompletarLeadModal();
    return;
  }
  if(!f.columnId){
    completarLeadMsg = { tipo:'erro', texto:'Escolha a coluna de destino.' };
    renderCompletarLeadModal();
    return;
  }
  completarLeadSalvando = true;
  completarLeadMsg = null;
  renderCompletarLeadModal();
  try{
    const novoCard = await apiRequest('POST', `/possiveis-leads/${f.possivelLeadId}/promover`, {
      nome: f.nome, telefone: f.telefone, columnId: f.columnId, valor: f.valor,
      temperatura: f.temperatura, obs: f.tipoServico ? `Serviço de interesse: ${f.tipoServico}` : '',
    });
    board.cards.push(novoCard);
    possiveisLeads = possiveisLeads.filter(l=>l.id!==f.possivelLeadId);
    closeCompletarLeadModal();
    renderApp();
  }catch(e){
    completarLeadMsg = { tipo:'erro', texto: e.message || 'Não foi possível adicionar aos Leads.' };
    completarLeadSalvando = false;
    renderCompletarLeadModal();
  }
}
function renderCompletarLeadModal(){
  const root = document.getElementById('modal-root');
  if(!completarLeadModalForm){ root.innerHTML=''; return; }
  const f = completarLeadModalForm;
  root.innerHTML = `
    <div class="overlay" id="cl-lead-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Completar e adicionar aos Leads</h3>
          <button id="cl-lead-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field"><label>Nome</label><input type="text" id="cl-lead-nome" value="${esc(f.nome)}" /></div>
          <div class="field"><label>Telefone</label><input type="text" id="cl-lead-telefone" value="${esc(f.telefone)}" /></div>
          ${f.tipoServico ? `<p class="settings-page-note">Serviço de interesse (da planilha): <b>${esc(f.tipoServico)}</b></p>` : ''}
          <div class="field">
            <label>Coluna de destino</label>
            <select id="cl-lead-coluna">
              ${board.columns.map(c=>`<option value="${c.id}" ${f.columnId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
            </select>
          </div>
          <div class="field-row">
            <div class="field"><label>Valor (opcional)</label><input type="number" id="cl-lead-valor" value="${f.valor}" min="0" step="0.01" /></div>
            <div class="field">
              <label>Temperatura</label>
              <select id="cl-lead-temp">
                <option value="frio" ${f.temperatura==='frio'?'selected':''}>Frio</option>
                <option value="morno" ${f.temperatura==='morno'?'selected':''}>Morno</option>
                <option value="quente" ${f.temperatura==='quente'?'selected':''}>Quente</option>
              </select>
            </div>
          </div>
          ${completarLeadMsg ? `<p class="settings-page-msg ${completarLeadMsg.tipo}">${esc(completarLeadMsg.texto)}</p>` : ''}
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="cl-lead-cancel">Cancelar</button>
            <button class="btn-save" id="cl-lead-salvar" ${completarLeadSalvando?'disabled':''}>${completarLeadSalvando?'Adicionando…':'Adicionar aos Leads'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('cl-lead-close').addEventListener('click', closeCompletarLeadModal);
  document.getElementById('cl-lead-cancel').addEventListener('click', closeCompletarLeadModal);
  document.getElementById('cl-lead-overlay').addEventListener('click', (e)=>{ if(e.target.id==='cl-lead-overlay') closeCompletarLeadModal(); });
  document.getElementById('cl-lead-nome').addEventListener('input', (e)=> completarLeadModalForm.nome = e.target.value);
  document.getElementById('cl-lead-telefone').addEventListener('input', (e)=> completarLeadModalForm.telefone = e.target.value);
  document.getElementById('cl-lead-coluna').addEventListener('change', (e)=> completarLeadModalForm.columnId = e.target.value);
  document.getElementById('cl-lead-valor').addEventListener('input', (e)=> completarLeadModalForm.valor = parseFloat(e.target.value)||0);
  document.getElementById('cl-lead-temp').addEventListener('change', (e)=> completarLeadModalForm.temperatura = e.target.value);
  document.getElementById('cl-lead-salvar').addEventListener('click', salvarCompletarLead);
}

/* ---------- Agendamentos ---------- */
async function loadAgendamentos(){
  try{
    const data = await apiRequest('GET', '/agendamentos');
    agendamentos = data.mensagens || [];
    agendamentosContagem = data.contagem || { pendente:0, enviada:0, cancelada:0, falhou:0 };
  }catch(e){
    agendamentos = [];
  }
  agendamentosLoaded = true;
  renderApp();
}
function agendamentoStatusLabel(status){
  if(status==='enviada') return '✓ Enviada';
  if(status==='cancelada') return 'Cancelada';
  if(status==='falhou') return '⚠ Falhou';
  return '⏳ A enviar';
}
function openNewAgendamento(){
  agendamentoModalForm = { cardId:'', texto:'', data:'', hora:'' };
  agendamentoMsg = null;
  renderAgendamentoModal();
}
function closeAgendamentoModal(){ agendamentoModalForm = null; document.getElementById('modal-root').innerHTML=''; }
async function salvarAgendamento(){
  const f = agendamentoModalForm;
  if(!f.cardId || !f.texto.trim() || !f.data || !f.hora){
    agendamentoMsg = { tipo:'erro', texto:'Preencha o cliente, a data, a hora e a mensagem.' };
    renderAgendamentoModal();
    return;
  }
  const agendadoPara = new Date(`${f.data}T${f.hora}:00`);
  agendamentoSalvando = true;
  agendamentoMsg = null;
  renderAgendamentoModal();
  try{
    await apiRequest('POST', '/agendamentos', { cardId: f.cardId, texto: f.texto, agendadoPara: agendadoPara.toISOString() });
    closeAgendamentoModal();
    await loadAgendamentos();
  }catch(e){
    agendamentoMsg = { tipo:'erro', texto: e.message || 'Não foi possível agendar a mensagem.' };
    agendamentoSalvando = false;
    renderAgendamentoModal();
  }
}
async function cancelarAgendamento(id){
  try{
    await apiRequest('POST', `/agendamentos/${id}/cancelar`);
    await loadAgendamentos();
  }catch(e){
    errorMsg = 'Não foi possível cancelar o agendamento.';
    renderApp();
  }
}
async function excluirAgendamento(id){
  const idx = agendamentos.findIndex(a=>a.id===id);
  if(idx===-1) return;
  const [removido] = agendamentos.splice(idx,1);
  renderApp();
  try{
    await apiRequest('DELETE', `/agendamentos/${id}`);
    await loadAgendamentos(); // recarrega pra atualizar a contagem por status também
  }catch(e){
    if(e && /não encontrado/i.test(e.message || '')){
      // já tinha sido excluído (ex.: dois cliques seguidos ou outra aba): some da lista e pronto
      await loadAgendamentos();
      return;
    }
    agendamentos.splice(idx,0,removido);
    errorMsg = 'Não foi possível excluir o agendamento' + (e && e.message ? ` (${e.message})` : '.');
    renderApp();
  }
}
function renderAgendamentoModal(){
  const root = document.getElementById('modal-root');
  if(!agendamentoModalForm){ root.innerHTML=''; return; }
  const f = agendamentoModalForm;
  const candidatos = board.cards.filter(c=>c.telefone);
  root.innerHTML = `
    <div class="overlay" id="ag-modal-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Nova mensagem agendada</h3>
          <button id="ag-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Cliente</label>
            <select id="ag-cliente">
              <option value="">Selecione</option>
              ${candidatos.map(c=>`<option value="${c.id}" ${f.cardId===c.id?'selected':''}>${esc(c.cliente)}</option>`).join('')}
            </select>
          </div>
          <div class="field-row">
            <div class="field"><label>Data</label><input type="date" id="ag-data" value="${f.data}" /></div>
            <div class="field"><label>Hora</label><input type="time" id="ag-hora" value="${f.hora}" /></div>
          </div>
          <div class="field">
            <label>Mensagem</label>
            <textarea id="ag-texto" rows="4" placeholder="Texto que será enviado pelo WhatsApp...">${esc(f.texto)}</textarea>
          </div>
          ${agendamentoMsg ? `<p class="settings-page-msg ${agendamentoMsg.tipo}">${esc(agendamentoMsg.texto)}</p>` : ''}
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="ag-cancel">Cancelar</button>
            <button class="btn-save" id="ag-salvar" ${agendamentoSalvando?'disabled':''}>${agendamentoSalvando?'Agendando…':'Agendar'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('ag-modal-close').addEventListener('click', closeAgendamentoModal);
  document.getElementById('ag-cancel').addEventListener('click', closeAgendamentoModal);
  document.getElementById('ag-modal-overlay').addEventListener('click', (e)=>{ if(e.target.id==='ag-modal-overlay') closeAgendamentoModal(); });
  document.getElementById('ag-cliente').addEventListener('change', (e)=> agendamentoModalForm.cardId = e.target.value);
  document.getElementById('ag-data').addEventListener('input', (e)=> agendamentoModalForm.data = e.target.value);
  document.getElementById('ag-hora').addEventListener('input', (e)=> agendamentoModalForm.hora = e.target.value);
  document.getElementById('ag-texto').addEventListener('input', (e)=> agendamentoModalForm.texto = e.target.value);
  document.getElementById('ag-salvar').addEventListener('click', salvarAgendamento);
}

async function criarEquipe(){
  const nome = equipeNomeNovo.trim();
  if(!nome){ equipeMsg = { tipo:'erro', texto:'Digite um nome para a equipe.' }; renderApp(); return; }
  try{
    await apiRequest('POST', '/equipe', { nome });
    equipeNomeNovo = '';
    equipeMsg = null;
    await loadEquipe();
  }catch(e){
    equipeMsg = { tipo:'erro', texto: e.message || 'Não foi possível criar a equipe.' };
    renderApp();
  }
}
async function entrarNaEquipe(){
  const codigo = equipeCodigoEntrar.trim();
  if(!codigo){ equipeMsg = { tipo:'erro', texto:'Digite o código de convite.' }; renderApp(); return; }
  try{
    await apiRequest('POST', '/equipe/entrar', { codigo });
    equipeCodigoEntrar = '';
    equipeMsg = null;
    await loadEquipe();
  }catch(e){
    equipeMsg = { tipo:'erro', texto: e.message || 'Não foi possível entrar na equipe.' };
    renderApp();
  }
}
async function enviarConviteEquipe(){
  const email = conviteEmailNovo.trim();
  if(!email){ equipeMsg = { tipo:'erro', texto:'Digite o e-mail da pessoa.' }; renderApp(); return; }
  try{
    const r = await apiRequest('POST', '/equipe/convites', { email });
    conviteEmailNovo = '';
    equipeMsg = { tipo:'ok', texto: (r && r.emailEnviado)
      ? `Convite enviado para ${email} (a pessoa também recebeu um e-mail). Ela precisa aceitar na aba Equipe do CRM.`
      : `Convite criado para ${email}. O e-mail de aviso não foi enviado (o servidor não tem e-mail configurado), então avise a pessoa: ela precisa entrar no CRM e aceitar na aba Equipe.` };
    await loadEquipe();
  }catch(e){
    equipeMsg = { tipo:'erro', texto: e.message || 'Não foi possível enviar o convite.' };
    renderApp();
  }
}
async function definirMetaMembro(userId, valor){
  try{
    await apiRequest('PUT', `/equipe/membro/${userId}/meta-vendas`, { valorMeta: valor });
    fecharMetaMembroModal();
    await loadSupervisao();
  }catch(e){
    errorMsg = e.message || 'Não foi possível salvar a meta.';
    renderApp();
  }
}
function fecharMetaMembroModal(){
  const r = document.getElementById('modal-root'); if(r) r.innerHTML = '';
}
function abrirMetaMembroModal(userId, nome, atual){
  const r = document.getElementById('modal-root'); if(!r) return;
  r.innerHTML = `
    <div class="overlay" id="meta-membro-overlay">
      <div class="modal" style="max-width:420px;">
        <div class="modal-head"><h3>Meta do mês — ${esc(nome)}</h3></div>
        <div class="modal-body">
        <p class="settings-page-note">Quanto essa pessoa deve vender neste mês (em R$). Use 0 para tirar a meta.</p>
        <div class="field"><input type="number" id="meta-membro-valor" min="0" step="0.01" value="${atual||0}" /></div>
        <div class="settings-btn-row">
          <button class="btn-outline" id="meta-membro-cancelar">Cancelar</button>
          <button class="btn-primary" id="meta-membro-salvar">Salvar</button>
        </div>
        </div>
      </div>
    </div>`;
  document.getElementById('meta-membro-cancelar').addEventListener('click', fecharMetaMembroModal);
  document.getElementById('meta-membro-overlay').addEventListener('click', (e)=>{ if(e.target.id==='meta-membro-overlay') fecharMetaMembroModal(); });
  document.getElementById('meta-membro-salvar').addEventListener('click', ()=>{
    const v = parseFloat(document.getElementById('meta-membro-valor').value);
    definirMetaMembro(userId, isFinite(v) && v>=0 ? v : 0);
  });
  const inp = document.getElementById('meta-membro-valor'); if(inp){ inp.focus(); inp.select(); }
}
async function salvarRodizio(ativo, membros){
  try{
    const r = await apiRequest('PUT', '/equipe/rodizio', { ativo, membros });
    equipe.rodizio = { ativo: r.ativo, membros: r.membros };
    equipeMsg = { tipo:'ok', texto: r.ativo ? `Rodízio ligado com ${r.membros.length} pessoa(s).` : 'Rodízio desligado.' };
  }catch(e){
    equipeMsg = { tipo:'erro', texto: e.message || 'Não foi possível salvar o rodízio.' };
  }
  renderApp();
}
function rodizioDoFormulario(){
  const ativo = !!(document.getElementById('rodizio-ativo')||{}).checked;
  const membros = Array.from(document.querySelectorAll('.rodizio-membro:checked')).map(el=>el.value);
  return { ativo, membros };
}
async function cancelarConviteEquipe(id){
  try{
    await apiRequest('DELETE', `/equipe/convites/${id}`);
    await loadEquipe();
  }catch(e){
    errorMsg = e.message || 'Não foi possível cancelar o convite.';
    renderApp();
  }
}
async function responderConviteEquipe(id, aceitar){
  try{
    await apiRequest('POST', `/equipe/convites/${id}/${aceitar?'aceitar':'recusar'}`);
    equipeMsg = null;
    await loadEquipe();
  }catch(e){
    equipeMsg = { tipo:'erro', texto: e.message || 'Não foi possível responder ao convite.' };
    renderApp();
  }
}
async function sairDaEquipe(){
  try{
    await apiRequest('POST', '/equipe/sair');
    equipe = null;
    chatMensagens = [];
    chatLoaded = false;
    supervisaoMembros = [];
    supervisaoLoaded = false;
    renderApp();
  }catch(e){
    errorMsg = 'Não foi possível sair da equipe.';
    renderApp();
  }
}
async function regenerarCodigoEquipe(){
  try{
    const data = await apiRequest('POST', '/equipe/regenerar-codigo');
    if(equipe) equipe.codigoConvite = data.codigoConvite;
  }catch(e){
    errorMsg = 'Não foi possível gerar um novo código.';
  }
  renderApp();
}
async function alterarPapelMembro(userId, papel){
  try{
    await apiRequest('PUT', `/equipe/membro/${userId}/papel`, { papel });
    await loadEquipe();
  }catch(e){
    errorMsg = 'Não foi possível alterar o papel do membro.';
    renderApp();
  }
}
async function alterarSupervisorDeDados(userId, ativo){
  try{
    await apiRequest('PUT', `/equipe/membro/${userId}/supervisor-dados`, { ativo });
    await loadEquipe();
  }catch(e){
    errorMsg = 'Não foi possível alterar o acesso de supervisor de dados.';
    renderApp();
  }
}
async function removerMembro(userId, destinoLeads){
  try{
    const resp = await apiRequest('DELETE', `/equipe/membro/${userId}${destinoLeads ? `?destinoLeads=${encodeURIComponent(destinoLeads)}` : ''}`);
    await loadEquipe();
    if(resp && resp.leadsPassados){
      equipeMsg = { tipo:'ok', texto:`Membro removido. ${resp.leadsPassados} lead(s) foram passados para a outra pessoa.` };
      renderApp();
    }
    return true;
  }catch(e){
    errorMsg = e.message || 'Não foi possível remover o membro.';
    renderApp();
    return false;
  }
}

// Janela de "Remover da equipe": o gestor escolhe deixar os leads com quem sai ou passar todos pra outra pessoa.
async function abrirRemoverMembroModal(userId){
  const membro = (equipe && equipe.membros || []).find(m=>m.id===userId);
  if(!membro) return;
  const outros = equipe.membros.filter(m=>m.id!==userId);
  let totalLeads = null;
  try{ totalLeads = (await apiRequest('GET', `/equipe/membro/${userId}/leads`)).total; }catch(e){ totalLeads = null; }
  const nome = membro.nome || membro.email;
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="overlay" id="rm-membro-overlay">
      <div class="modal">
        <div class="modal-head">
          <h3>Remover ${esc(nome)} da equipe</h3>
          <button id="rm-membro-close">✕</button>
        </div>
        <div class="modal-body">
          <p class="settings-page-note" style="margin:0">${esc(nome)} perde o acesso ao chat e à supervisão da equipe. A conta e o funil dela continuam existindo.${totalLeads!==null ? ` Ela tem <b>${totalLeads}</b> lead(s).` : ''}</p>
          <div class="field">
            <label><input type="radio" name="rm-leads" value="manter" checked /> Deixar os leads com ${esc(nome)}</label>
            <label style="margin-top:8px"><input type="radio" name="rm-leads" value="passar" ${totalLeads===0?'disabled':''} /> Passar todos os leads para outra pessoa</label>
            <select id="rm-destino" style="margin-top:8px" disabled>
              <option value="">Escolha quem recebe…</option>
              ${outros.map(m=>`<option value="${m.id}">${esc(m.nome||m.email)}${m.souEu?' (você)':''}</option>`).join('')}
            </select>
            <p class="settings-page-note" style="margin:6px 0 0">Conversas, anexos, tarefas, agendamentos e contratos dos leads vão junto. Cada lead cai na coluna de mesmo nome da pessoa escolhida (ou na primeira em aberto).</p>
          </div>
          <p class="settings-page-msg erro" id="rm-membro-erro" style="display:none"></p>
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="rm-membro-cancelar">Cancelar</button>
            <button class="btn-save" id="rm-membro-confirmar">Remover</button>
          </div>
        </div>
      </div>
    </div>
  `;
  const fechar = ()=>{ root.innerHTML=''; };
  const erro = (t)=>{ const el = document.getElementById('rm-membro-erro'); el.textContent = t; el.style.display = 'block'; };
  document.getElementById('rm-membro-close').addEventListener('click', fechar);
  document.getElementById('rm-membro-cancelar').addEventListener('click', fechar);
  document.getElementById('rm-membro-overlay').addEventListener('click', (e)=>{ if(e.target.id==='rm-membro-overlay') fechar(); });
  const destinoSel = document.getElementById('rm-destino');
  root.querySelectorAll('input[name="rm-leads"]').forEach(r=>{
    r.addEventListener('change', ()=>{ destinoSel.disabled = root.querySelector('input[name="rm-leads"]:checked').value !== 'passar'; });
  });
  document.getElementById('rm-membro-confirmar').addEventListener('click', async ()=>{
    const passar = root.querySelector('input[name="rm-leads"]:checked').value === 'passar';
    if(passar && !destinoSel.value){ erro('Escolha quem vai receber os leads.'); return; }
    const btn = document.getElementById('rm-membro-confirmar');
    btn.disabled = true; btn.textContent = 'Removendo…';
    const ok = await removerMembro(userId, passar ? destinoSel.value : null);
    if(ok) fechar(); else { btn.disabled = false; btn.textContent = 'Remover'; }
  });
}
async function enviarMensagemChat(){
  if(!chatTexto.trim()) return;
  chatEnviando = true;
  renderApp();
  try{
    await apiRequest('POST', '/equipe/chat', { texto: chatTexto });
    chatTexto = '';
    await loadChat();
  }catch(e){
    errorMsg = e.message || 'Não foi possível enviar a mensagem.';
  }
  chatEnviando = false;
  renderApp();
}
async function abrirConversaIndividual(userId){
  dmDestinatarioId = userId;
  dmLoaded = false;
  dmMensagens = [];
  renderApp();
  try{
    const data = await apiRequest('GET', `/equipe/chat/${userId}`);
    dmMensagens = data.mensagens || [];
  }catch(e){
    dmMensagens = [];
    errorMsg = e.message || 'Não foi possível carregar a conversa.';
  }
  dmLoaded = true;
  renderApp();
}
async function enviarMensagemIndividual(){
  if(!dmTexto.trim() || !dmDestinatarioId) return;
  dmEnviando = true;
  renderApp();
  try{
    await apiRequest('POST', `/equipe/chat/${dmDestinatarioId}`, { texto: dmTexto });
    dmTexto = '';
    const data = await apiRequest('GET', `/equipe/chat/${dmDestinatarioId}`);
    dmMensagens = data.mensagens || [];
  }catch(e){
    errorMsg = e.message || 'Não foi possível enviar a mensagem.';
  }
  dmEnviando = false;
  renderApp();
}

// Notificações são calculadas na hora, a partir do que já está carregado
// (tarefas, leads e conversas) — não existe uma tabela própria pra isso.
function computarNotificacoes(){
  const notifs = [];
  const fimHoje = new Date(); fimHoje.setHours(23,59,59,999);
  tasks.forEach(t=>{
    if(!t.concluida && t.vencimento && new Date(t.vencimento) <= fimHoje){
      notifs.push({ texto:`Tarefa: ${t.titulo}`, timestamp: t.vencimento, cardId: t.leadId || null });
    }
  });
  const ontem = new Date(Date.now() - 24*60*60*1000);
  board.cards.forEach(c=>{
    if(c.createdAt && new Date(c.createdAt) >= ontem){
      notifs.push({ texto:`Novo lead: ${c.cliente}`, timestamp:c.createdAt, cardId:c.id });
    }
  });
  const doisDias = new Date(Date.now() - 48*60*60*1000);
  conversas.forEach(cv=>{
    if(cv.direcaoUltima==='in' && cv.ultimaMensagemEm && new Date(cv.ultimaMensagemEm) >= doisDias){
      notifs.push({ texto:`${cv.card.cliente}: ${(cv.ultimaMensagem||'').slice(0,60)}`, timestamp:cv.ultimaMensagemEm, cardId:cv.card.id });
    }
  });
  return notifs.sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));
}

/* ---------- Disparos (mensagem em massa) ---------- */
async function enviarDisparo(){
  if(disparoSelecionados.size===0) return;
  if(disparoUsarTemplate){
    if(!disparoTemplateNome.trim()) return;
  } else if(!disparoTexto.trim()){
    return;
  }
  disparoEnviando = true;
  disparoResultado = null;
  renderApp();
  try{
    const corpo = { cardIds: Array.from(disparoSelecionados) };
    if(disparoUsarTemplate){
      corpo.usarTemplate = true;
      corpo.templateName = disparoTemplateNome.trim();
      corpo.idioma = disparoTemplateIdioma.trim() || 'pt_BR';
      corpo.variaveis = disparoTemplateVariaveis.trim() ? disparoTemplateVariaveis.split(',').map(v=>v.trim()) : [];
    } else {
      corpo.texto = disparoTexto;
    }
    const data = await apiRequest('POST', '/whatsapp/disparo', corpo);
    disparoResultado = data;
  }catch(e){
    errorMsg = e.message || 'Não foi possível enviar os disparos.';
  }
  disparoEnviando = false;
  renderApp();
}
async function carregarTemplatesDisponiveis(){
  try{
    const data = await apiRequest('GET', '/whatsapp/templates');
    disparoTemplatesDisponiveis = (data.templates || []).filter(t=>t.status==='APPROVED');
  }catch(e){
    errorMsg = e.message || 'Não foi possível carregar os modelos.';
  }
  renderApp();
}

/* ---------- Templates (página) ---------- */
function renderMenuTriagemOpcao(op, idx){
  return `
    <div class="mt-opcao-card">
      <div class="field-row">
        <div class="field mt-opcao-numero-field">
          <label>Número</label>
          <input type="text" class="mt-opcao-numero" data-idx="${idx}" value="${esc(op.numero)}" maxlength="3" />
        </div>
        <div class="field" style="flex:1;">
          <label>Coluna de destino</label>
          <select class="mt-opcao-coluna" data-idx="${idx}">
            ${board.columns.map(c=>`<option value="${c.id}" ${op.colunaDestinoId===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}
          </select>
        </div>
        <button type="button" class="icon-btn mt-opcao-remover" data-idx="${idx}" title="Remover opção">${ICON_TRASH}</button>
      </div>
      <div class="field">
        <label>Mensagem de confirmação (opcional)</label>
        <input type="text" class="mt-opcao-confirmacao" data-idx="${idx}" value="${esc(op.respostaConfirmacao||'')}" placeholder="Ex: Perfeito! Já te chamo por aqui." />
      </div>
    </div>
  `;
}
function statusTemplateLabel(status){
  if(status==='APPROVED') return '✓ Aprovado';
  if(status==='PENDING') return '⏳ Em análise';
  if(status==='REJECTED') return '✕ Rejeitado';
  return status || '—';
}

