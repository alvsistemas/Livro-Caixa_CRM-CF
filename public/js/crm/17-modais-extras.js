// CRM · 17-modais-extras.js — contrato, regras de comissão, automação, fluxo e transferências. Os arquivos js/crm/ são carregados em ordem pelo index.html e
// compartilham as mesmas variáveis globais (é o antigo script.js dividido, como no CRM de consórcio).
/* ---------- modal do contrato de comissão ---------- */
function openNewContrato(){
  contratoModalForm = { __isNew:true, id:null, desc:'', scope:'Pessoal', valorVenda:0, tipoProduto: '', date: comissoesMonth + '-01' };
  renderContratoModal();
}
function openEditContrato(id){
  const c = contratos.find(x=>x.id===id);
  if(!c) return;
  contratoModalForm = { __isNew:false, id:c.id, desc:c.desc, scope:c.scope, valorVenda:c.valorVenda, tipoProduto:c.tipoProduto||'padrao', date:c.date };
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
  const preview = calcComissaoPreviewPorTipo(f.valorVenda, f.tipoProduto);

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
            <input type="text" id="c-desc" value="${esc(f.desc)}" placeholder="Ex: Maria Silva — Projeto do site" />
          </div>
          <div class="field">
            <label>Escopo</label>
            <div class="scope-toggle" id="c-scope-toggle">
              <div class="scope-btn ${f.scope==='Pessoal'?'active':''}" data-scope="Pessoal">Pessoal</div>
              <div class="scope-btn ${f.scope==='Empresa'?'active':''}" data-scope="Empresa">Empresa</div>
            </div>
          </div>
          ${htmlCampoProduto('c', f.tipoProduto||'', { obrigatorio: true })}
          <div class="field">
            <label>Valor da venda</label>
            <div class="money-wrap">
              <span>R$</span>
              <input type="text" inputmode="numeric" id="c-valor-venda" value="${f.valorVenda ? Number(f.valorVenda).toLocaleString('pt-BR') : ''}" placeholder="0" />
            </div>
          </div>
          <div class="field">
            <label>Mês da 1ª parcela</label>
            <input type="month" id="c-mes" value="${(f.date||'').slice(0,7)}" />
            <p class="settings-page-note" id="c-mes-nota">${textoNotaMesContrato(f.tipoProduto)}</p>
          </div>
          <div class="calc-preview" id="c-preview">
            ${previewComissaoHtml(preview)}
          </div>
          <p class="calc-preview-note">O valor de cada parcela é calculado automaticamente a partir do valor da venda e da regra de comissão escolhida.</p>
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

  ligarCampoProduto('c', (chave)=>{
    contratoModalForm.tipoProduto = chave;
    const prev = calcComissaoPreviewPorTipo(contratoModalForm.valorVenda, contratoModalForm.tipoProduto);
    const previewEl = document.getElementById('c-preview');
    if(previewEl) previewEl.innerHTML = previewComissaoHtml(prev);
    const notaMes = document.getElementById('c-mes-nota');
    if(notaMes) notaMes.textContent = textoNotaMesContrato(contratoModalForm.tipoProduto);
  }, { obrigatorio: true });

  const valorVendaInput = document.getElementById('c-valor-venda');
  valorVendaInput.addEventListener('input', (e)=>{
    const { numero, texto } = maskInteiro(e.target.value);
    contratoModalForm.valorVenda = numero;
    e.target.value = texto;
    const prev = calcComissaoPreviewPorTipo(numero, contratoModalForm.tipoProduto);
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
   planilha: cada linha é "N parcelas de X% do valor da venda"). */
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
  regraEditForm = { __isNew:true, id:null, nome:'', mesIndependente:false, base:'final', blocos:[{ parcelas:1, percentual:0 }] };
  renderRegrasModal();
}
function abrirEditarRegra(id){
  const r = regrasComissao.find(x=>x.id===id);
  if(!r) return;
  regraEditForm = {
    __isNew:false, id:r.id, nome:r.nome, mesIndependente:!!r.mesIndependente, base: r.base==='negociado' ? 'negociado' : 'final',
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
        <label>% da venda (por parcela)</label>
        <input type="number" min="0" step="any" class="regra-bloco-percentual" data-idx="${idx}" value="${b.percentual}" />
      </div>
      <button type="button" class="icon-btn" data-action="remover-bloco-regra" data-idx="${idx}" title="Remover linha" ${podeRemover?'':'disabled'}>${ICON_TRASH}</button>
    </div>
  `;
}
function htmlPreviewRegraEditor(f){
  const REF = 100000; // venda de referência só pra simular — o valor real usa o valor de cada contrato
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
          <p class="settings-page-note">Cada produto ou serviço tem a sua comissão, em blocos de parcelas (como uma planilha). Os que você cria digitando no cadastro do cliente também aparecem aqui — ajuste a comissão se precisar. Produto sem comissão (0%) serve só para identificar o que foi vendido.</p>
          ${!regrasComissaoLoaded ? `<div class="tasks-empty">Carregando…</div>` : (regrasComissao.length ? `
            <div class="regras-lista">
              ${regrasComissao.map(r=>`
                <div class="regra-row">
                  <div class="regra-row-info">
                    <div class="regra-row-nome">${esc(r.nome)} ${r.mesIndependente?'<span class="badge badge-neutral" title="O mês da comissão pode ser editado sem alterar o mês do contato">Mês independente</span>':''}</div>
                    <div class="regra-row-blocos">${pctDaRegra(r) > 0 ? (r.blocos||[]).map(b=>`${b.parcelas}x ${(b.percentual*100).toLocaleString('pt-BR',{maximumFractionDigits:6})}%`).join(' · ') : 'Sem comissão'}</div>
                  </div>
                  <div class="regra-row-actions">
                    <button class="icon-btn" data-action="editar-regra" data-regra-id="${r.id}" title="Editar">${ICON_EDIT}</button>
                    <button class="icon-btn" data-action="excluir-regra" data-regra-id="${r.id}" title="Excluir">${ICON_TRASH}</button>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `<div class="tasks-empty">Nenhum produto ou serviço ainda. Crie aqui em "+ Nova regra" ou digitando o nome no cadastro do cliente.</div>`)}
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
            <input type="text" id="re-nome" value="${esc(f.nome)}" placeholder="Ex: Plano mensal" />
          </div>
          <div class="field">
            <label class="checkbox-item"><input type="checkbox" id="re-mes-independente" ${f.mesIndependente?'checked':''} /> Mês da comissão independente do mês do contato (pra pagamentos que demoram a acontecer de verdade)</label>
          </div>
          <div class="field">
            <label for="re-base">Calcular sobre</label>
            <select id="re-base">
              <option value="final" ${f.base!=='negociado'?'selected':''}>Valor final da venda (com desconto) — recomendado</option>
              <option value="negociado" ${f.base==='negociado'?'selected':''}>Valor do card (antes do desconto)</option>
            </select>
            <p class="settings-page-note">O valor final é o que você informa no fechamento da venda. Sem fechamento, vale o valor do card.</p>
          </div>
          <div class="field">
            <label>Blocos de parcelas</label>
            <div class="regra-blocos-cabecalho">
              <span>Parcelas</span><span>% da venda (por parcela)</span><span></span>
            </div>
            <div id="re-blocos-lista">
              ${f.blocos.map((b,idx)=>renderRegraLinhaBloco(b,idx,f.blocos.length>1)).join('')}
            </div>
            <button type="button" class="btn-outline" id="re-add-bloco">+ Adicionar linha</button>
          </div>
          <div class="calc-preview" id="re-preview">${htmlPreviewRegraEditor(f)}</div>
          <p class="calc-preview-note">Simulação com uma venda de R$ 100.000 — o valor real usa o valor de cada contrato.</p>
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
          message: `Excluir a regra "${r?r.nome:''}"? Comissões já lançadas com ela continuam iguais, mas ela deixa de aparecer como opção pra novos contratos e contatos.`,
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
  document.getElementById('re-base').addEventListener('change', (e)=> regraEditForm.base = e.target.value);
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
        message: `Excluir a regra "${f.nome}"? Comissões já lançadas com ela continuam iguais, mas ela deixa de aparecer como opção pra novos contratos e contatos.`,
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
  const payload = { nome: f.nome.trim(), mesIndependente: !!f.mesIndependente, base: f.base==='negociado' ? 'negociado' : 'final', blocos };
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
          <h3>${f.__isNew ? 'Nova ação automática' : 'Editar ação automática'}</h3>
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
      showConfirm({ chave:'acao-automatica',
        message: 'Excluir esta ação automática? Ela para de rodar imediatamente.',
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
    etapas: [{ diasAposInicio:0, tipo:'tarefa', params:{ titulo:'', diasParaVencimento:1 } }],
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
          <h3>${copiando ? 'Copiar' : 'Transferir'} contatos pra "${esc(coluna?coluna.nome:'')}"</h3>
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
            }).join('') : '<p class="dash-empty">Nenhum outro contato cadastrado ainda.</p>'}
          </div>
        </div>
        <div class="modal-foot">
          <span></span>
          <div class="modal-foot-actions">
            <button class="btn-outline" id="cl-pular">Pular por agora</button>
            <button class="btn-save" id="cl-confirmar" ${colunaLeadsMovendo?'disabled':''}>${colunaLeadsMovendo ? (copiando?'Copiando…':'Movendo…') : `${copiando?'Copiar':'Mover'} ${colunaLeadsSelecionados.size} contato(s)`}</button>
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
    return `<p class="settings-page-note">Etapa de envio de WhatsApp: não está mais disponível e é pulada. Troque o tipo ou remova a etapa.</p>`;
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
            ${etapa.tipo==='mensagem' ? `<option value="mensagem" selected disabled>Enviar WhatsApp (indisponível)</option>` : ''}
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
    fluxoModalForm.etapas.push({ diasAposInicio:1, tipo:'tarefa', params:{ titulo:'', diasParaVencimento:1 } });
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
    salvarFluxo();
  });
  if(!fluxoModalForm.__isNew){
    document.getElementById('fx-delete').addEventListener('click', ()=>{
      showConfirm({ chave:'sequencia',
        message: 'Excluir esta sequência? As que estão em andamento para clientes atuais são interrompidas.',
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
          <h3>${f.__isNew ? 'Nova sequência' : 'Editar sequência'}</h3>
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
