// CRM · 18-produto-servico.js — campo "Produto / serviço" (digitar com sugestões) e a pergunta da venda fechada.
// Os arquivos js/crm/ são carregados em ordem pelo index.html e compartilham as mesmas variáveis globais.
//
// Cada produto/serviço do CRM é uma "regra de comissão" (Comissões ⚙): nome + comissão (pode ser 0%).
// O contato guarda a chave em card.tipoProduto ('' = sem produto) e um detalhe livre em card.produtoDetalhe.
// - O campo começa vazio. Ao tocar, sugere os produtos já criados e, se o usuário tiver o PDV, os produtos de lá.
// - Digitou um nome novo: "+ Criar", com a comissão opcional (em branco = sem comissão).
// - Escolher um produto do PDV que ainda não existe no CRM cria o produto aqui, sem comissão.
// - Venda fechada sem produto numa conta que usa comissões: pergunta qual foi (dá para pular).

let produtosPdvCache = null; // [{ nome, preco }] — null = ainda não buscou
function carregarProdutosPdv(){
  if(produtosPdvCache !== null) return Promise.resolve(produtosPdvCache);
  produtosPdvCache = [];
  return apiRequest('GET', '/estoque/produtos')
    .then(r=>{ produtosPdvCache = ((r && r.produtos) || []).filter(p=> p && p.nome && !p.excluido && p.ativo !== false).map(p=>({ nome: String(p.nome), preco: Number(p.preco) || 0 })); return produtosPdvCache; })
    .catch(()=> produtosPdvCache);
}

const pctDaRegra = (r)=> (r && Array.isArray(r.blocos) ? r.blocos : []).reduce((s,b)=> s + (Number(b.percentual)||0) * Math.max(1, parseInt(b.parcelas,10)||1), 0);
// a conta usa comissões: tem algum produto com comissão ou algum contrato em Comissões
function usaComissoes(){
  return regrasComissao.some(r=> pctDaRegra(r) > 0) || (Array.isArray(contratos) && contratos.length > 0);
}
function nomeDoProduto(chave){
  if(!chave) return '';
  const r = regrasComissao.find(x=> x.chave === chave);
  return r ? r.nome : (chave === 'padrao' ? 'Padrão' : chave);
}
const fmtPctProduto = (p)=> (p*100).toLocaleString('pt-BR', { maximumFractionDigits:2 }) + '%';
function textoComissaoDoProduto(chave){
  const r = regrasComissao.find(x=> x.chave === chave);
  if(!r) return '';
  const pct = pctDaRegra(r);
  if(!(pct > 0)) return 'Sem comissão.';
  const blocos = r.blocos || [];
  const parcelas = blocos.reduce((s,b)=> s + Math.max(1, parseInt(b.parcelas,10)||1), 0);
  return `Comissão: ${fmtPctProduto(pct)}${parcelas > 1 ? ` em ${parcelas} parcelas` : ' em 1 parcela'}, quando for vendido.`;
}
const semAcento = (s)=> String(s||'').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// HTML do campo. prefixo: id único na tela ('f', 'c', 'fv'…). op.detalhe = valor do campo Detalhe (undefined = sem esse campo).
function htmlCampoProduto(prefixo, chave, op = {}){
  const comissoes = usaComissoes();
  const dica = chave
    ? (comissoes ? textoComissaoDoProduto(chave) : '')
    : (op.obrigatorio ? 'Obrigatório: é o produto que define a comissão.' : (comissoes ? 'Opcional. É o produto que define a comissão.' : ''));
  return `
    <div class="field ps-field" data-ps="${prefixo}">
      <label for="${prefixo}-ps-input">Produto / serviço${op.obrigatorio ? '' : ''}</label>
      <div class="ps-wrap">
        ${chave ? `
          <div class="ps-escolhido"><span class="ps-escolhido-nome">${esc(nomeDoProduto(chave))}</span>
            <button type="button" class="ps-limpar" data-ps-limpar aria-label="Trocar o produto ou serviço">✕</button></div>
        ` : `
          <input type="text" class="ps-input" id="${prefixo}-ps-input" autocomplete="off" maxlength="80"
            placeholder="Digite ou escolha um produto ou serviço" role="combobox" aria-expanded="false" aria-controls="${prefixo}-ps-lista" />
        `}
        <div class="ps-lista" id="${prefixo}-ps-lista" role="listbox" hidden></div>
      </div>
      ${dica ? `<p class="ps-dica">${esc(dica)}</p>` : ''}
    </div>
    ${op.detalhe !== undefined ? `
      <div class="field">
        <label for="${prefixo}-detalhe">Detalhe (opcional)</label>
        <input type="text" id="${prefixo}-detalhe" maxlength="140" value="${esc(op.detalhe||'')}" placeholder="Ex.: 2 aparelhos de 12 mil BTUs, com suporte" />
      </div>` : ''}`;
}

// Liga o campo. aoEscolher(chave) é chamado ao escolher/criar/limpar. op.aoDetalhe(texto) para o campo Detalhe.
function ligarCampoProduto(prefixo, aoEscolher, op = {}){
  const raiz = document.querySelector(`.ps-field[data-ps="${prefixo}"]`);
  if(!raiz) return;
  const detalheEl = document.getElementById(`${prefixo}-detalhe`);
  if(detalheEl && op.aoDetalhe && !detalheEl.dataset.ligado){ detalheEl.dataset.ligado = '1'; detalheEl.addEventListener('input', (e)=> op.aoDetalhe(e.target.value)); }
  const redesenhar = (chave)=>{
    const novo = document.createElement('div');
    novo.innerHTML = htmlCampoProduto(prefixo, chave, { obrigatorio: op.obrigatorio });
    raiz.replaceWith(novo.firstElementChild);
    ligarCampoProduto(prefixo, aoEscolher, op);
  };
  const escolher = (chave)=>{ aoEscolher(chave); redesenhar(chave); if(!chave){ const i = document.getElementById(`${prefixo}-ps-input`); if(i) i.focus(); } };

  const limpar = raiz.querySelector('[data-ps-limpar]');
  if(limpar){ limpar.addEventListener('click', ()=> escolher('')); return; }

  const input = raiz.querySelector('.ps-input');
  const lista = raiz.querySelector('.ps-lista');
  let ativo = 0, itens = [], criando = false;

  function opcoes(){
    const q = semAcento(input.value);
    const meus = regrasComissao.filter(r=> !q || semAcento(r.nome).includes(q));
    const nomesMeus = new Set(regrasComissao.map(r=> semAcento(r.nome)));
    const pdv = (produtosPdvCache || []).filter(p=> !nomesMeus.has(semAcento(p.nome)) && (!q || semAcento(p.nome).includes(q))).slice(0, 8);
    const exato = q && (regrasComissao.some(r=> semAcento(r.nome) === q) || (produtosPdvCache||[]).some(p=> semAcento(p.nome) === q));
    return { meus, pdv, criar: q && !exato ? input.value.trim() : '' };
  }
  function desenhar(){
    if(criando) return;
    const { meus, pdv, criar } = opcoes();
    const comissoes = usaComissoes();
    itens = [...meus.map(r=>({ tipo:'meu', r })), ...pdv.map(p=>({ tipo:'pdv', p })), ...(criar ? [{ tipo:'criar', nome: criar }] : [])];
    if(!itens.length){
      lista.innerHTML = `<div class="ps-vazio">${regrasComissao.length ? 'Nenhum produto com esse nome.' : 'Você ainda não tem produtos ou serviços. Digite um nome para criar.'}</div>`;
    } else {
      let n = 0;
      lista.innerHTML = `
        ${meus.length ? `<div class="ps-grupo">Seus produtos e serviços</div>${meus.map(r=>`<button type="button" class="ps-item ${n===ativo?'on':''}" data-i="${n++}" role="option"><span>${esc(r.nome)}</span>${comissoes ? `<small>${pctDaRegra(r) > 0 ? 'comissão ' + fmtPctProduto(pctDaRegra(r)) : 'sem comissão'}</small>` : ''}</button>`).join('')}` : ''}
        ${pdv.length ? `<div class="ps-grupo">Do PDV</div>${pdv.map(p=>`<button type="button" class="ps-item ${n===ativo?'on':''}" data-i="${n++}" role="option"><span>${esc(p.nome)}</span><small>${p.preco ? fmtBRL(p.preco) : ''}</small></button>`).join('')}` : ''}
        ${criar ? `<button type="button" class="ps-criar ${n===ativo?'on':''}" data-i="${n++}">+ Criar <b>“${esc(criar)}”</b></button>` : ''}`;
    }
    lista.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    lista.querySelectorAll('[data-i]').forEach(b=>{
      b.addEventListener('mousedown', (e)=> e.preventDefault()); // não tira o foco do campo antes do clique
      b.addEventListener('click', ()=> usar(itens[Number(b.dataset.i)]));
    });
  }
  function fechar(){ if(criando) return; lista.hidden = true; input.setAttribute('aria-expanded', 'false'); }

  async function criarProduto(nome, pctTexto){
    const pct = parseFloat(String(pctTexto||'').replace(',', '.'));
    const percentual = Number.isFinite(pct) && pct > 0 ? pct : 0;
    try{
      const r = await apiRequest('POST', '/regras-comissao', { nome, blocos:[{ parcelas:1, percentual }] });
      regrasComissao = [...regrasComissao, r];
      return r.chave;
    }catch(e){
      errorMsg = (e && e.message) || 'Não foi possível criar o produto ou serviço.';
      renderApp();
      return null;
    }
  }
  function mostrarCriar(nome){
    criando = true;
    lista.innerHTML = `
      <div class="ps-novo-form">
        <b>Novo: “${esc(nome)}”</b>
        <label class="ps-novo-pct">Comissão (opcional)
          <span><input type="text" inputmode="decimal" id="${prefixo}-ps-pct" placeholder="0" maxlength="6" /> %</span>
        </label>
        <small>Em branco: sem comissão. Dá para mudar depois em Comissões ⚙.</small>
        <div class="ps-novo-botoes">
          <button type="button" class="btn-outline" data-ps-cancelar>Voltar</button>
          <button type="button" class="btn-save" data-ps-criar>Criar</button>
        </div>
      </div>`;
    lista.hidden = false;
    const pctEl = document.getElementById(`${prefixo}-ps-pct`);
    pctEl.focus();
    const confirmar = async ()=>{
      const btn = lista.querySelector('[data-ps-criar]'); if(btn) btn.disabled = true;
      const chave = await criarProduto(nome, pctEl.value);
      criando = false;
      if(chave) escolher(chave); else desenhar();
    };
    lista.querySelector('[data-ps-criar]').addEventListener('click', confirmar);
    lista.querySelector('[data-ps-cancelar]').addEventListener('click', ()=>{ criando = false; input.focus(); desenhar(); });
    pctEl.addEventListener('keydown', (e)=>{ if(e.key === 'Enter'){ e.preventDefault(); confirmar(); } if(e.key === 'Escape'){ e.preventDefault(); criando = false; input.focus(); desenhar(); } });
  }
  async function usar(item){
    if(!item) return;
    if(item.tipo === 'meu') escolher(item.r.chave);
    else if(item.tipo === 'pdv'){ const chave = await criarProduto(item.p.nome, 0); if(chave) escolher(chave); }
    else mostrarCriar(item.nome);
  }

  input.addEventListener('focus', ()=>{ ativo = 0; desenhar(); carregarProdutosPdv().then(()=>{ if(document.activeElement === input) desenhar(); }); });
  input.addEventListener('input', ()=>{ ativo = 0; desenhar(); });
  input.addEventListener('blur', ()=> setTimeout(()=>{ if(!raiz.contains(document.activeElement)) fechar(); }, 120));
  input.addEventListener('keydown', (e)=>{
    if(e.key === 'ArrowDown'){ e.preventDefault(); ativo = Math.min(itens.length - 1, ativo + 1); desenhar(); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); ativo = Math.max(0, ativo - 1); desenhar(); }
    else if(e.key === 'Enter'){ if(!lista.hidden && itens.length){ e.preventDefault(); usar(itens[ativo]); } }
    else if(e.key === 'Escape'){ if(!lista.hidden){ e.preventDefault(); e.stopPropagation(); fechar(); } }
  });
}

// Aviso de erro logo acima da caixa do produto (em vez do aviso no canto da tela).
// Some sozinho quando um produto é escolhido (o campo é redesenhado).
function marcarErroProduto(prefixo, texto){
  const raiz = document.querySelector(`.ps-field[data-ps="${prefixo}"]`);
  if(!raiz) { errorMsg = texto; renderApp(); return; }
  raiz.classList.add('com-erro');
  let msg = raiz.querySelector('.ps-erro-msg');
  if(!msg){
    msg = document.createElement('p');
    msg.className = 'ps-erro-msg';
    msg.setAttribute('role', 'alert');
    raiz.querySelector('label').after(msg);
  }
  msg.textContent = '⚠ ' + texto;
  raiz.scrollIntoView({ block:'center', behavior: (window.Animar && Animar.semMovimento()) ? 'auto' : 'smooth' });
  const input = raiz.querySelector('.ps-input');
  if(input){ input.setAttribute('aria-invalid', 'true'); input.focus({ preventScroll:true }); }
}

/* ---------- venda fechada sem produto: qual foi? ---------- */
// Só aparece se a conta usa comissões e o contato está sem produto. Devolve uma Promise (resolve ao fechar).
function perguntarProdutoDaVenda(card){
  return new Promise((resolver)=>{
    let chave = '';
    let raiz = document.getElementById('produto-venda-root');
    if(!raiz){ raiz = document.createElement('div'); raiz.id = 'produto-venda-root'; document.body.appendChild(raiz); }
    raiz.innerHTML = `
      <div class="overlay" id="produto-venda-overlay">
        <div class="modal produto-venda-modal" role="dialog" aria-modal="true" aria-labelledby="pv-titulo">
          <div class="modal-head"><h3 id="pv-titulo">Qual foi o produto ou serviço?</h3><button type="button" id="pv-x" aria-label="Fechar">✕</button></div>
          <div class="modal-body">
            <p class="settings-page-note" style="margin:0">Venda de <b>${esc(card.cliente || 'cliente')}</b>. O produto ou serviço é o que define a comissão: sem ele, esta venda fica sem comissão (dá para escolher depois na ficha do cliente).</p>
            ${htmlCampoProduto('pv', '')}
          </div>
          <div class="modal-foot">
            <span></span>
            <div class="modal-foot-actions">
              <button type="button" class="btn-outline" id="pv-depois">Agora não</button>
              <button type="button" class="btn-save" id="pv-salvar" disabled>Salvar</button>
            </div>
          </div>
        </div>
      </div>`;
    const salvarBtn = document.getElementById('pv-salvar');
    ligarCampoProduto('pv', (c)=>{ chave = c; salvarBtn.disabled = !c; });
    const fechar = ()=>{ raiz.innerHTML = ''; resolver(); };
    document.getElementById('pv-x').addEventListener('click', fechar);
    document.getElementById('pv-depois').addEventListener('click', fechar);
    document.getElementById('produto-venda-overlay').addEventListener('click', (e)=>{ if(e.target.id === 'produto-venda-overlay') fechar(); });
    salvarBtn.addEventListener('click', async ()=>{
      if(!chave) return;
      salvarBtn.disabled = true;
      try{
        const atualizado = await apiRequest('PUT', `/cards/${card.id}`, { tipoProduto: chave });
        const i = board.cards.findIndex(c=> c.id === card.id);
        if(i >= 0) board.cards[i] = { ...board.cards[i], ...atualizado };
        if(typeof loadContratos === 'function') loadContratos();
        renderApp();
      }catch(e){ errorMsg = 'Não foi possível salvar o produto. Tente de novo pela ficha do cliente.'; renderApp(); }
      fechar();
    });
    setTimeout(()=>{ const i = document.getElementById('pv-ps-input'); if(i) i.focus(); }, 60);
  });
}
