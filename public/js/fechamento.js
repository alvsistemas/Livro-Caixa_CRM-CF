/* Fechamento da venda (CRM -> Controle financeiro).
   Quando um card entra numa coluna de ganho, abre uma janela pedindo o valor final
   (com desconto) e como o cliente vai pagar. Ao confirmar, o servidor cria uma Receita
   por parcela no financeiro, ligada ao card. "Agora não" deixa o selo
   "falta o fechamento" no card, que reabre a janela.
   Usa as funções e variáveis globais do CRM (js/crm/) (board, apiRequest, esc, fmtBRL, renderApp). */

const FECH_MEIOS = [
  ['pix', 'Pix'], ['dinheiro', 'Dinheiro'], ['credito', 'Cartão de crédito'], ['debito', 'Cartão de débito'],
  ['boleto', 'Boleto'], ['transferencia', 'Transferência'], ['outro', 'Outro'],
];
const FECH_FORMAS = [['avista', 'À vista'], ['parcelado', 'Parcelado'], ['entrada', 'Entrada + parcelas']];

let fechModo = null; // { modo, perguntado, taxas, descontarComissoes } — lido do servidor
const FECH_NOME_TAXA = {
  credito: 'do cartão de crédito', creditoParcelado: 'do crédito parcelado', debito: 'do cartão de débito',
  pix: 'do Pix', boleto: 'do boleto', transferencia: 'da transferência', outro: 'do pagamento',
};
const fechChaveTaxa = (meio, forma) => (meio === 'credito' && forma !== 'avista' ? 'creditoParcelado' : meio);
const fechPctTxt = (n) => String(n).replace('.', ',');
let fechForm = null;
let fechSalvando = false;
let fechErro = '';

function fechHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// "1.234,56" / "1234,56" / "1234.56" -> número (NaN se vazio/inválido)
function fechNumero(txt) {
  let s = String(txt == null ? '' : txt).trim().replace(/\s|R\$/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return Number(s);
}
function fechMoedaTxt(n) {
  return Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}
function fechSomarMeses(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}
function fechDividir(totalCent, n) {
  const base = Math.floor(totalCent / n);
  const partes = Array(n).fill(base);
  partes[0] += totalCent - base * n;
  return partes;
}
function fechDataBR(iso) { return iso ? iso.split('-').reverse().join('/') : ''; }

async function fechCarregarModo(forcar) {
  if (fechModo && !forcar) return fechModo;
  try { fechModo = await apiRequest('GET', '/financeiro/fechamento/modo'); } catch (e) { fechModo = null; }
  return fechModo;
}

function fechColunaEhGanho(colId) {
  const col = board.columns.find((c) => c.id === colId);
  return !!(col && col.tipo === 'ganho');
}

const fechValendo = (card) => !!(card && card.fechamento && !card.fechamento.cancelado);

// Chamada depois que um card muda de coluna (arrastar, menu "mover", ficha do cliente):
// entrou em Ganho -> pede o fechamento; saiu de Ganho com fechamento -> pergunta se a venda foi desfeita
async function talvezPedirFechamento(card, colunaAnteriorId) {
  if (!card) return;
  const entrou = fechColunaEhGanho(card.columnId) && !fechColunaEhGanho(colunaAnteriorId);
  const saiu = !fechColunaEhGanho(card.columnId) && fechColunaEhGanho(colunaAnteriorId);
  // gestor no funil de um consultor: o financeiro é do consultor. O fechamento fica pendente
  // (selo "Falta o fechamento" no card dele) e quem faz é o próprio consultor.
  if (typeof atuandoComo !== 'undefined' && atuandoComo) {
    if (entrou && !fechValendo(card)) {
      try {
        const modo = await apiRequest('GET', '/financeiro/fechamento/modo');
        if (modo && (!modo.perguntado || modo.modo === 'vendas')) {
          const r = await apiRequest('POST', `/financeiro/fechamento/${card.id}/depois`);
          fechAtualizarCard(r.card);
          errorMsg = `Venda marcada. O fechamento (valores e parcelas) fica para ${atuandoComo.nome} fazer no Controle financeiro dele.`;
          renderApp();
        }
      } catch (e) { /* o selo é só um lembrete */ }
    } else if (saiu && fechValendo(card)) {
      errorMsg = `Essa venda já tinha fechamento no financeiro de ${atuandoComo.nome}. Peça para ele conferir se a venda foi desfeita.`;
      renderApp();
    }
    return;
  }
  // venda fechada sem produto/serviço numa conta que usa comissões: pergunta qual foi (dá para pular)
  if (entrou && !card.tipoProduto && typeof usaComissoes === 'function' && usaComissoes() && typeof perguntarProdutoDaVenda === 'function') {
    await perguntarProdutoDaVenda(card);
    card = board.cards.find((c) => c.id === card.id) || card;
  }
  if (saiu) { if (fechValendo(card) && !(typeof podeCrm === 'function' && !podeCrm('funcoes', 'fechamentoVenda'))) abrirVendaDesfeita(card.id); return; }
  if (!entrou || fechValendo(card)) return;
  if (typeof podeCrm === 'function' && !podeCrm('funcoes', 'fechamentoVenda')) return; // o gestor não liberou
  const modo = await fechCarregarModo();
  if (!modo) return;
  if (modo.perguntado && modo.modo !== 'vendas') return;
  abrirFechamento(card.id);
}

function fechSoDoConsultor() {
  if (typeof atuandoComo === 'undefined' || !atuandoComo) return false;
  errorMsg = `O fechamento da venda é feito pelo próprio ${atuandoComo.nome}, no Controle financeiro dele.`;
  renderApp();
  return true;
}

async function abrirFechamento(cardId) {
  const card = board.cards.find((c) => c.id === cardId);
  if (!card || fechSoDoConsultor()) return;
  // modo e taxas sempre frescos (podem ter mudado no financeiro); regra da comissão do card
  const [modo, info] = await Promise.all([
    fechCarregarModo(true),
    apiRequest('GET', `/financeiro/fechamento/${cardId}`).catch(() => null),
  ]);
  const f = fechValendo(card) ? card.fechamento : null; // venda desfeita: o novo fechamento começa do zero
  const cu = (f && f.custos) || {};
  const valorCard = Number(card.valor) || 0;
  fechErro = '';
  fechSalvando = false;
  fechForm = {
    regra: info && info.regra,
    comissaoManual: info ? info.comissaoManual : null,
    produtoTxt: cu.produto ? fechMoedaTxt(cu.produto) : '',
    freteTxt: cu.frete ? fechMoedaTxt(cu.frete) : '',
    // null = usa o % guardado; texto = a pessoa está mudando ("mudar taxa?")
    taxaTxt: cu.taxaPct != null ? fechPctTxt(cu.taxaPct) : null,
    impostoTxt: cu.impostoPct != null ? fechPctTxt(cu.impostoPct) : null,
    cardId,
    etapa: modo && !modo.perguntado ? 'modo' : 'form',
    refazendo: !!f,
    valorCard,
    tipoDesconto: f && f.descontoPct != null ? 'pct' : 'valor',
    valorFinalTxt: fechMoedaTxt(f ? f.valorFinal : valorCard) || '',
    descontoPctTxt: f && f.descontoPct != null ? String(f.descontoPct).replace('.', ',') : '',
    forma: f ? f.forma : 'avista',
    parcelas: f && f.forma !== 'avista' ? f.parcelas : 2,
    entradaTxt: f && f.entrada ? fechMoedaTxt(f.entrada) : '',
    primeiraData: f ? f.primeiraData : fechHoje(),
    meio: f ? f.meio : 'pix',
    recebido: f ? false : true, // boleto: começa desmarcado (quase nunca é pago no mesmo dia)
    recebidoMexido: false,
  };
  renderFechamento();
}

function fecharFechamento() {
  fechForm = null;
  const root = document.getElementById('fechamento-root');
  if (root) root.innerHTML = '';
}

// valor final e parcelas calculados a partir do que está na janela
function fechCalculo(f) {
  const origCent = Math.round(f.valorCard * 100);
  let finalCent;
  if (f.tipoDesconto === 'pct') {
    const pct = fechNumero(f.descontoPctTxt);
    finalCent = Number.isFinite(pct) ? Math.round(origCent * (100 - pct) / 100) : origCent;
  } else {
    const v = fechNumero(f.valorFinalTxt);
    finalCent = Number.isFinite(v) ? Math.round(v * 100) : NaN;
  }
  const r = { origCent, finalCent, parcelas: [] };
  if (!(finalCent > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(f.primeiraData || '')) return r;
  const n = Math.max(1, parseInt(f.parcelas, 10) || 1);
  if (f.forma === 'avista') r.parcelas = [{ data: f.primeiraData, cent: finalCent, rotulo: 'À vista' }];
  else if (f.forma === 'parcelado') r.parcelas = fechDividir(finalCent, Math.max(2, n)).map((c, i, arr) => ({ data: fechSomarMeses(f.primeiraData, i), cent: c, rotulo: `${i + 1}/${arr.length}` }));
  else {
    const ent = Math.round((fechNumero(f.entradaTxt) || 0) * 100);
    if (ent > 0 && ent < finalCent) {
      r.parcelas = [{ data: f.primeiraData, cent: ent, rotulo: 'Entrada' },
        ...fechDividir(finalCent - ent, n).map((c, i) => ({ data: fechSomarMeses(f.primeiraData, i + 1), cent: c, rotulo: `${i + 1}/${n}` }))];
    }
  }
  return r;
}

function renderFechamento() {
  let root = document.getElementById('fechamento-root');
  if (!root) { root = document.createElement('div'); root.id = 'fechamento-root'; document.body.appendChild(root); }
  const f = fechForm;
  if (!f) { root.innerHTML = ''; return; }
  const card = board.cards.find((c) => c.id === f.cardId);
  if (!card) { fecharFechamento(); return; }
  const nome = esc(card.cliente || 'Cliente');

  if (f.etapa === 'modo') {
    root.innerHTML = `
      <div class="overlay" id="fech-overlay">
        <div class="modal fech-modal" role="dialog" aria-modal="true" aria-labelledby="fech-titulo">
          <div class="modal-head"><h3 id="fech-titulo">Venda fechada 🎉</h3><button id="fech-x" aria-label="Fechar">✕</button></div>
          <div class="modal-body">
            <p class="fech-texto">Antes de seguir: como o Controle financeiro deve tratar o que você fecha aqui no CRM? Você só responde isso uma vez (dá pra mudar depois nas configurações do financeiro).</p>
            <div class="fech-opcoes-modo">
              <button type="button" class="fech-opcao" data-modo="vendas"><b>Eu vendo produtos ou serviços</b><span>Cada venda fechada vira receita no financeiro, com o valor final e as parcelas.</span></button>
              <button type="button" class="fech-opcao" data-modo="comissoes"><b>Eu ganho comissão sobre as vendas</b><span>Entra no financeiro só a sua comissão (aba Comissões).</span></button>
              <button type="button" class="fech-opcao" data-modo="nenhum"><b>Não quero ligar ao financeiro</b><span>O CRM e o financeiro ficam separados.</span></button>
            </div>
            ${fechErro ? `<p class="fech-erro" role="alert">${esc(fechErro)}</p>` : ''}
          </div>
        </div>
      </div>`;
    root.querySelector('#fech-x').addEventListener('click', fecharFechamento);
    root.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', async () => {
      try {
        fechModo = await apiRequest('PUT', '/financeiro/fechamento/modo', { modo: b.dataset.modo });
      } catch (e) { fechErro = e.message || 'Não foi possível salvar.'; renderFechamento(); return; }
      if (fechModo.modo === 'vendas') { f.etapa = 'form'; fechErro = ''; renderFechamento(); } else fecharFechamento();
    }));
    return;
  }

  const calc = fechCalculo(f);
  const descontoCent = Number.isFinite(calc.finalCent) ? calc.origCent - calc.finalCent : 0;
  const temCard = calc.origCent > 0;
  const ehFuturo = f.primeiraData > fechHoje();
  const rotuloData = f.forma === 'entrada' ? 'Data da entrada' : (f.forma === 'parcelado' ? 'Data da 1ª parcela' : 'Data do pagamento');
  root.innerHTML = `
    <div class="overlay" id="fech-overlay">
      <div class="modal fech-modal" role="dialog" aria-modal="true" aria-labelledby="fech-titulo">
        <div class="modal-head"><h3 id="fech-titulo">${f.refazendo ? 'Refazer o fechamento' : 'Fechamento da venda'}</h3><button id="fech-x" aria-label="Fechar">✕</button></div>
        <div class="modal-body">
          <p class="fech-texto"><b>${nome}</b>${temCard ? ` · valor no card: <span class="fech-mono">${fmtBRL(calc.origCent / 100)}</span>` : ''}</p>
          <div class="field">
            <label>Quanto o cliente vai pagar de fato</label>
            ${temCard ? `<div class="temp-toggle fech-seg" role="radiogroup" aria-label="Informar valor final ou desconto">
              <div class="temp-btn ${f.tipoDesconto === 'valor' ? 'fech-ativo' : ''}" data-tipo-desc="valor" role="radio" tabindex="0" aria-checked="${f.tipoDesconto === 'valor'}">Valor final (R$)</div>
              <div class="temp-btn ${f.tipoDesconto === 'pct' ? 'fech-ativo' : ''}" data-tipo-desc="pct" role="radio" tabindex="0" aria-checked="${f.tipoDesconto === 'pct'}">Desconto (%)</div>
            </div>` : ''}
            ${f.tipoDesconto === 'pct' && temCard
              ? `<div class="money-wrap fech-pct"><input type="text" inputmode="decimal" id="fech-pct" value="${esc(f.descontoPctTxt)}" placeholder="0" aria-label="Desconto em porcentagem" /><span>%</span></div>`
              : `<div class="money-wrap"><span>R$</span><input type="text" inputmode="decimal" id="fech-valor" value="${esc(f.valorFinalTxt)}" placeholder="0,00" aria-label="Valor final" /></div>`}
            <p class="fech-nota" id="fech-resumo-valor">${Number.isFinite(calc.finalCent) && calc.finalCent > 0
              ? `Valor final: <b class="fech-mono">${fmtBRL(calc.finalCent / 100)}</b>${temCard && descontoCent > 0 ? ` · desconto de <span class="fech-mono">${fmtBRL(descontoCent / 100)}</span>` : ''}${temCard && descontoCent < 0 ? ' · acima do valor do card' : ''}`
              : 'Informe o valor final.'}</p>
          </div>
          <div class="field">
            <label>Como vai receber</label>
            <div class="temp-toggle fech-seg" role="radiogroup" aria-label="Forma de recebimento">
              ${FECH_FORMAS.map(([k, t]) => `<div class="temp-btn ${f.forma === k ? 'fech-ativo' : ''}" data-forma="${k}" role="radio" tabindex="0" aria-checked="${f.forma === k}">${t}</div>`).join('')}
            </div>
          </div>
          ${f.forma !== 'avista' ? `<div class="field-row">
            ${f.forma === 'entrada' ? `<div class="field"><label for="fech-entrada">Entrada</label><div class="money-wrap"><span>R$</span><input type="text" inputmode="decimal" id="fech-entrada" value="${esc(f.entradaTxt)}" placeholder="0,00" /></div></div>` : ''}
            <div class="field"><label for="fech-parcelas">${f.forma === 'entrada' ? 'Parcelas depois' : 'Parcelas'}</label>
              <select id="fech-parcelas">${Array.from({ length: 48 }, (_, i) => i + 1).filter((n) => f.forma === 'entrada' || n >= 2).map((n) => `<option value="${n}" ${Number(f.parcelas) === n ? 'selected' : ''}>${n}x</option>`).join('')}</select></div>
          </div>` : ''}
          <div class="field-row">
            <div class="field"><label for="fech-data">${rotuloData}</label><input type="date" id="fech-data" value="${esc(f.primeiraData)}" /></div>
            <div class="field"><label for="fech-meio">Meio de pagamento</label>
              <select id="fech-meio">${FECH_MEIOS.map(([k, t]) => `<option value="${k}" ${f.meio === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          </div>
          ${!ehFuturo ? `<label class="fech-check"><input type="checkbox" id="fech-recebido" ${f.recebido ? 'checked' : ''} /> ${f.forma === 'entrada' ? 'Já recebi a entrada' : (f.forma === 'parcelado' ? 'Já recebi a 1ª parcela' : 'Já recebi o pagamento')}</label>` : ''}
          <div id="fech-parcelas-box">${fechParcelasHtml(calc)}</div>
          ${fechCustosHtml(f)}
          <p class="fech-nota">${f.refazendo
            ? 'As parcelas e os custos que este fechamento criou no financeiro serão trocados pelos novos. O que você já marcou como pago continua pago.'
            : 'Cada parcela vira uma receita, e cada custo uma despesa, no Controle financeiro. Dá pra refazer depois pela ficha do cliente.'}</p>
          ${fechErro ? `<p class="fech-erro" role="alert">${esc(fechErro)}</p>` : ''}
        </div>
        <div class="fech-sobra" id="fech-sobra" aria-live="polite">${fechResumoHtml(f)}</div>
        <div class="modal-foot">
          <button class="btn-outline" id="fech-depois" ${fechSalvando ? 'disabled' : ''}>${f.refazendo ? 'Cancelar' : 'Agora não'}</button>
          <button class="btn-save" id="fech-salvar" ${fechSalvando ? 'disabled' : ''}>${fechSalvando ? 'Lançando…' : (f.refazendo ? 'Refazer no financeiro' : 'Lançar no financeiro')}</button>
        </div>
      </div>
    </div>`;

  const redesenhar = (focoId) => {
    const ativo = document.activeElement;
    const pos = ativo && ativo.id === focoId && typeof ativo.selectionStart === 'number' ? ativo.selectionStart : null;
    renderFechamento();
    if (focoId) { const el = document.getElementById(focoId); if (el) { el.focus(); if (pos != null) try { el.setSelectionRange(pos, pos); } catch (e) { /* ignora */ } } }
  };
  // texto digitado: só atualiza o resumo (redesenhar tudo atrapalharia a digitação)
  const atualizarResumo = () => {
    const box = document.getElementById('fech-parcelas-box');
    if (box) box.innerHTML = fechParcelasHtml(fechCalculo(f));
    const sobra = document.getElementById('fech-sobra');
    if (sobra) sobra.innerHTML = fechResumoHtml(f);
    root.querySelectorAll('[data-valor-custo]').forEach((el) => { el.textContent = fechValorCustoTxt(f, el.dataset.valorCusto); });
    const c = fechCalculo(f);
    const el = document.getElementById('fech-resumo-valor');
    const d = Number.isFinite(c.finalCent) ? c.origCent - c.finalCent : 0;
    if (el) el.innerHTML = Number.isFinite(c.finalCent) && c.finalCent > 0
      ? `Valor final: <b class="fech-mono">${fmtBRL(c.finalCent / 100)}</b>${c.origCent > 0 && d > 0 ? ` · desconto de <span class="fech-mono">${fmtBRL(d / 100)}</span>` : ''}${c.origCent > 0 && d < 0 ? ' · acima do valor do card' : ''}`
      : 'Informe o valor final.';
  };
  const ligarTexto = (id, campo) => {
    const el = root.querySelector('#' + id);
    if (!el) return;
    el.addEventListener('input', (e) => { f[campo] = e.target.value; atualizarResumo(); });
    // digitar não redesenha a janela (o clique no próximo campo não pode se perder):
    // só o resumo, a lista de parcelas e os custos calculados são atualizados
  };
  root.querySelector('#fech-x').addEventListener('click', fecharFechamento);
  root.querySelector('#fech-overlay').addEventListener('click', (e) => { if (e.target.id === 'fech-overlay') fecharFechamento(); });
  ligarTexto('fech-valor', 'valorFinalTxt');
  ligarTexto('fech-pct', 'descontoPctTxt');
  ligarTexto('fech-entrada', 'entradaTxt');
  const escolher = (sel, fn) => root.querySelectorAll(sel).forEach((b) => {
    b.addEventListener('click', () => fn(b));
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(b); } });
  });
  escolher('[data-tipo-desc]', (b) => {
    if (f.tipoDesconto === b.dataset.tipoDesc) return;
    // troca mantendo o mesmo valor final
    const c = fechCalculo(f);
    if (b.dataset.tipoDesc === 'pct' && c.origCent > 0 && Number.isFinite(c.finalCent)) {
      const pct = Math.round((1 - c.finalCent / c.origCent) * 10000) / 100;
      f.descontoPctTxt = pct > 0 ? String(pct).replace('.', ',') : '';
    } else if (Number.isFinite(c.finalCent)) f.valorFinalTxt = fechMoedaTxt(c.finalCent / 100);
    f.tipoDesconto = b.dataset.tipoDesc;
    redesenhar(b.dataset.tipoDesc === 'pct' ? 'fech-pct' : 'fech-valor');
  });
  escolher('[data-forma]', (b) => {
    const chaveAntes = fechChaveTaxa(f.meio, f.forma);
    f.forma = b.dataset.forma;
    if (fechChaveTaxa(f.meio, f.forma) !== chaveAntes) f.taxaTxt = null;
    if (f.forma === 'parcelado' && Number(f.parcelas) < 2) f.parcelas = 2;
    redesenhar();
  });
  const sel = (id, campo, depois) => { const el = root.querySelector('#' + id); if (el) el.addEventListener('change', (e) => { f[campo] = e.target.value; if (depois) depois(); redesenhar(); }); };
  sel('fech-parcelas', 'parcelas');
  sel('fech-data', 'primeiraData');
  sel('fech-meio', 'meio', () => { if (!f.recebidoMexido) f.recebido = f.meio !== 'boleto'; f.taxaTxt = null; });
  const det = root.querySelector('.fech-custos');
  if (det) det.addEventListener('toggle', () => { f.custosAberto = det.open; });
  ligarTexto('fech-produto', 'produtoTxt');
  ligarTexto('fech-frete', 'freteTxt');
  ligarTexto('fech-taxa', 'taxaTxt');
  ligarTexto('fech-imposto', 'impostoTxt');
  root.querySelectorAll('[data-abrir]').forEach((b) => b.addEventListener('click', () => {
    const campo = b.dataset.abrir; // 'taxa' | 'imposto'
    const guardado = fechGuardado(f, campo);
    f[campo + 'Txt'] = guardado != null ? fechPctTxt(guardado) : '';
    redesenhar('fech-' + campo);
  }));
  const rec = root.querySelector('#fech-recebido');
  if (rec) rec.addEventListener('change', (e) => { f.recebido = e.target.checked; f.recebidoMexido = true; });

  root.querySelector('#fech-depois').addEventListener('click', async () => {
    if (f.refazendo) { fecharFechamento(); return; }
    fecharFechamento();
    try {
      const r = await apiRequest('POST', `/financeiro/fechamento/${card.id}/depois`);
      fechAtualizarCard(r.card);
    } catch (e) { /* o selo é só um lembrete: sem ele, nada se perde */ }
  });
  root.querySelector('#fech-salvar').addEventListener('click', salvarFechamentoDaJanela);
}

function fechAtualizarCard(atualizado) {
  if (!atualizado) return;
  const i = board.cards.findIndex((c) => c.id === atualizado.id);
  if (i > -1) board.cards[i] = { ...board.cards[i], ...atualizado };
  if (typeof renderAppPreservandoScroll === 'function') renderAppPreservandoScroll(); else renderApp();
}

async function salvarFechamentoDaJanela() {
  const f = fechForm;
  if (!f || fechSalvando) return;
  const calc = fechCalculo(f);
  const corpo = {
    forma: f.forma,
    parcelas: f.forma === 'avista' ? 1 : Number(f.parcelas),
    primeiraData: f.primeiraData,
    meio: f.meio,
    recebido: f.primeiraData <= fechHoje() && !!f.recebido,
  };
  if (f.tipoDesconto === 'pct' && calc.origCent > 0) {
    const pct = fechNumero(f.descontoPctTxt);
    corpo.descontoPct = Number.isFinite(pct) ? pct : 0;
  } else corpo.valorFinal = calc.finalCent / 100;
  if (f.forma === 'entrada') corpo.entrada = fechNumero(f.entradaTxt);
  const custos = fechCustos(f);
  corpo.custos = { produto: custos.produto, frete: custos.frete, taxaPct: custos.taxaPct, impostoPct: custos.impostoPct };
  if ([custos.produto, custos.frete].some((v) => Number.isNaN(v))) { fechErro = 'Confira os custos: use só números.'; renderFechamento(); return; }
  fechSalvando = true; fechErro = '';
  renderFechamento();
  try {
    const r = await apiRequest('POST', `/financeiro/fechamento/${f.cardId}`, corpo);
    fecharFechamento();
    fechAtualizarCard(r.card);
  } catch (e) {
    fechSalvando = false;
    fechErro = (e && e.message) || 'Não foi possível lançar. Tente de novo.';
    renderFechamento();
  }
}

function fechParcelasHtml(calc) {
  if (calc.parcelas.length <= 1) return '';
  return `<div class="fech-parcelas" aria-label="Parcelas que vão para o financeiro">
    ${calc.parcelas.slice(0, 6).map((p) => `<div><span>${esc(p.rotulo)} · ${fechDataBR(p.data)}</span><span class="fech-mono">${fmtBRL(p.cent / 100)}</span></div>`).join('')}
    ${calc.parcelas.length > 6 ? `<div class="fech-mais">… e mais ${calc.parcelas.length - 6} até ${fechDataBR(calc.parcelas[calc.parcelas.length - 1].data)}</div>` : ''}
  </div>`;
}

/* ---------- custos da venda ---------- */
function fechGuardado(f, campo) {
  const t = (fechModo && fechModo.taxas) || {};
  const v = campo === 'imposto' ? t.imposto : t[fechChaveTaxa(f.meio, f.forma)];
  return v === undefined ? null : v;
}
// % em uso: o que está sendo digitado, ou o guardado
function fechPct(f, campo) {
  const txt = f[campo + 'Txt'];
  if (txt !== null && txt !== undefined) { const n = fechNumero(txt); return Number.isFinite(n) ? n : null; }
  return campo === 'taxa' && f.meio === 'dinheiro' ? null : fechGuardado(f, campo);
}
function fechCustos(f) {
  const calc = fechCalculo(f);
  const finalCent = Number.isFinite(calc.finalCent) && calc.finalCent > 0 ? calc.finalCent : 0;
  const din = (txt) => { if (!String(txt || '').trim()) return 0; const n = fechNumero(txt); return Number.isFinite(n) ? n : NaN; };
  const taxaPct = fechPct(f, 'taxa');
  const impostoPct = fechPct(f, 'imposto');
  const produto = din(f.produtoTxt);
  const frete = din(f.freteTxt);
  const taxa = taxaPct ? Math.round(finalCent * taxaPct / 100) / 100 : 0;
  const imposto = impostoPct ? Math.round(finalCent * impostoPct / 100) / 100 : 0;
  // comissão: só entra como custo quando o financeiro desconta comissões
  let comissao = 0;
  if (fechModo && fechModo.descontarComissoes) {
    if (f.comissaoManual != null) comissao = Number(f.comissaoManual) || 0;
    else if (f.regra) {
      const base = f.regra.base === 'negociado' ? calc.origCent : finalCent;
      comissao = Math.round(base * f.regra.percentualTotal) / 100;
    }
  }
  const total = [produto, frete, taxa, imposto, comissao].reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
  return { produto, frete, taxaPct, taxa, impostoPct, imposto, comissao, total, finalCent };
}
function fechValorCustoTxt(f, campo) {
  const c = fechCustos(f);
  return fmtBRL(c[campo] || 0);
}
function fechResumoHtml(f) {
  if (typeof podeCrm === 'function' && !podeCrm('funcoes', 'verCustos')) return '';
  const c = fechCustos(f);
  if (!c.finalCent) return '';
  const entra = c.finalCent / 100;
  const sobra = Math.round((entra - c.total) * 100) / 100;
  const margem = entra > 0 ? Math.round(sobra / entra * 1000) / 10 : 0;
  return `<span>Entra <b class="fech-mono">${fmtBRL(entra)}</b></span>
    <span>Custos <b class="fech-mono">${fmtBRL(c.total)}</b></span>
    <span class="${sobra < 0 ? 'fech-neg' : ''}">Sobra <b class="fech-mono">${fmtBRL(sobra)}</b> <small>(${String(margem).replace('.', ',')}%)</small></span>`;
}
function fechCustosHtml(f) {
  if (typeof podeCrm === 'function' && !podeCrm('funcoes', 'verCustos')) return ''; // o gestor não liberou custos e margem
  const c = fechCustos(f);
  const ehCartao = f.meio === 'credito' || f.meio === 'debito';
  const linhaPct = (campo, rotulo, rotuloInput, dica, abrirTxt) => {
    const editando = f[campo + 'Txt'] !== null && f[campo + 'Txt'] !== undefined;
    const guardado = fechGuardado(f, campo);
    if (editando || (campo === 'taxa' && ehCartao && guardado == null)) {
      return `<div class="field"><label for="fech-${campo}">${rotuloInput}</label>
        <div class="money-wrap fech-pct"><input type="text" inputmode="decimal" id="fech-${campo}" value="${esc(f[campo + 'Txt'] || '')}" placeholder="0" /><span>%</span></div>
        <p class="fech-nota">= <b class="fech-mono" data-valor-custo="${campo}">${fmtBRL(c[campo])}</b> nesta venda. ${dica}</p></div>`;
    }
    if (guardado != null && guardado > 0) {
      return `<div class="fech-custo-linha"><span>${rotulo} (${fechPctTxt(guardado)}%)</span><span class="fech-mono" data-valor-custo="${campo}">${fmtBRL(c[campo])}</span></div>
        <button type="button" class="fech-link" data-abrir="${campo}">mudar ${campo === 'taxa' ? 'taxa' : 'imposto'}?</button>`;
    }
    return `<button type="button" class="fech-link" data-abrir="${campo}">${abrirTxt}</button>`;
  };
  const nomeTaxa = FECH_NOME_TAXA[fechChaveTaxa(f.meio, f.forma)] || 'do pagamento';
  const comissaoHtml = fechModo && fechModo.descontarComissoes && (f.regra || f.comissaoManual != null)
    ? `<div class="fech-custo-linha"><span>Comissão ${f.comissaoManual != null ? '(lançada à mão em Comissões)' : `(regra ${esc(f.regra.nome)}, sobre o valor ${f.regra.base === 'negociado' ? 'do card' : 'final'})`}</span><span class="fech-mono" data-valor-custo="comissao">${fmtBRL(c.comissao)}</span></div>`
    : '';
  const aberto = f.custosAberto !== undefined ? f.custosAberto : (c.total - c.comissao) > 0;
  return `<details class="fech-custos" ${aberto ? 'open' : ''}>
    <summary>Custos da venda <span>(opcional)</span></summary>
    <div class="field-row">
      <div class="field"><label for="fech-produto">Custo do produto</label><div class="money-wrap"><span>R$</span><input type="text" inputmode="decimal" id="fech-produto" value="${esc(f.produtoTxt)}" placeholder="0,00" /></div></div>
      <div class="field"><label for="fech-frete">Frete que você paga</label><div class="money-wrap"><span>R$</span><input type="text" inputmode="decimal" id="fech-frete" value="${esc(f.freteTxt)}" placeholder="0,00" /></div></div>
    </div>
    ${f.meio === 'dinheiro' ? '' : linhaPct('taxa', `Taxa ${nomeTaxa}`, `Taxa ${nomeTaxa} (%)`, 'Fica guardada para as próximas vendas com esse meio de pagamento.', `+ Tem taxa ${nomeTaxa}?`)}
    ${linhaPct('imposto', 'Imposto sobre a venda', 'Imposto sobre a venda (%)', 'Fica guardado para as próximas vendas. MEI paga o DAS fixo por mês: nesse caso, deixe em branco.', '+ Descontar imposto sobre a venda?')}
    ${comissaoHtml}
  </details>`;
}

/* ---------- etapa 3: venda desfeita e devolução ---------- */
let fechDialogo = null; // { tipo: 'desfeita'|'devolucao', ... }

function fechRoot() {
  let root = document.getElementById('fechamento-root');
  if (!root) { root = document.createElement('div'); root.id = 'fechamento-root'; document.body.appendChild(root); }
  return root;
}
function fecharDialogo() { fechDialogo = null; fechRoot().innerHTML = ''; }

async function abrirVendaDesfeita(cardId) {
  if (fechSoDoConsultor()) return;
  const card = board.cards.find((c) => c.id === cardId);
  if (!card) return;
  let info;
  try { info = await apiRequest('GET', `/financeiro/fechamento/${cardId}`); } catch (e) { return; }
  const l = info.lancamentos || [];
  const soma = (lista) => Math.round(lista.reduce((a, x) => a + x.valor, 0) * 100) / 100;
  const receitas = l.filter((x) => x.tipoLancamento === 'Receita');
  const recebido = soma(receitas.filter((x) => x.status === 'Pago'));
  const aReceber = receitas.filter((x) => x.status !== 'Pago');
  const custosAbertos = l.filter((x) => x.tipoLancamento === 'Despesa' && x.status !== 'Pago' && x.tipo !== 'devolucao');
  const jaDevolvido = soma(l.filter((x) => x.tipo === 'devolucao'));
  fechDialogo = { tipo: 'desfeita', cardId, recebido, aReceber: soma(aReceber), nAReceber: aReceber.length, custosAbertos: soma(custosAbertos),
    devolver: false, devolucaoTxt: fechMoedaTxt(Math.max(0, recebido - jaDevolvido)), limiteDevolucao: Math.max(0, recebido - jaDevolvido), salvando: false, erro: '' };
  renderDialogo();
}

function abrirDevolucao(cardId) {
  if (fechSoDoConsultor()) return;
  const card = board.cards.find((c) => c.id === cardId);
  if (!card || !card.fechamento) return;
  fechDialogo = { tipo: 'devolucao', cardId, valorTxt: '', data: fechHoje(), motivo: '', salvando: false, erro: '', feito: null };
  renderDialogo();
}

function renderDialogo() {
  const d = fechDialogo;
  const root = fechRoot();
  if (!d) { root.innerHTML = ''; return; }
  const card = board.cards.find((c) => c.id === d.cardId);
  if (!card) { fecharDialogo(); return; }
  const nome = esc(card.cliente || 'Cliente');
  const erroHtml = d.erro ? `<p class="fech-erro" role="alert">${esc(d.erro)}</p>` : '';
  let corpo; let pe;
  if (d.tipo === 'desfeita') {
    const nada = !d.aReceber && !d.custosAbertos && !d.recebido;
    corpo = `
      <p class="fech-texto"><b>${nome}</b> saiu de Ganho. No Controle financeiro, essa venda tem:</p>
      <div class="fech-parcelas">
        <div><span>Já recebido</span><span class="fech-mono">${fmtBRL(d.recebido)}</span></div>
        <div><span>Falta receber${d.nAReceber ? ` (${d.nAReceber} ${d.nAReceber === 1 ? 'parcela' : 'parcelas'})` : ''}</span><span class="fech-mono">${fmtBRL(d.aReceber)}</span></div>
        <div><span>Custos ainda não pagos</span><span class="fech-mono">${fmtBRL(d.custosAbertos)}</span></div>
      </div>
      <p class="fech-nota">${nada ? 'Não há nada pendente para cancelar.' : '“Cancelar o que falta receber” apaga as parcelas e os custos ainda não pagos. O que já foi recebido fica no financeiro.'}</p>
      ${d.limiteDevolucao > 0 ? `
        <label class="fech-check"><input type="checkbox" id="dlg-devolver" ${d.devolver ? 'checked' : ''} /> Devolvi dinheiro ao cliente</label>
        ${d.devolver ? `<div class="field"><label for="dlg-dev-valor">Valor devolvido</label><div class="money-wrap"><span>R$</span><input type="text" inputmode="decimal" id="dlg-dev-valor" value="${esc(d.devolucaoTxt)}" /></div>
          <p class="fech-nota">Vira uma despesa “Devoluções” ligada a essa venda. Até ${fmtBRL(d.limiteDevolucao)}.</p></div>` : ''}` : ''}
      ${erroHtml}`;
    pe = `<button class="btn-outline" id="dlg-manter" ${d.salvando ? 'disabled' : ''}>Manter tudo como está</button>
      <button class="btn-save" id="dlg-ok" ${d.salvando ? 'disabled' : ''}>${d.salvando ? 'Cancelando…' : 'Cancelar o que falta receber'}</button>`;
  } else if (d.feito) {
    corpo = `<p class="fech-texto">Devolução de <b class="fech-mono">${fmtBRL(d.feito.valor)}</b> registrada no Controle financeiro, ligada à venda de <b>${nome}</b>.</p>`;
    pe = `<span></span><button class="btn-save" id="dlg-fechar">Ok</button>`;
  } else {
    const f = card.fechamento;
    corpo = `
      <p class="fech-texto">Devolução para <b>${nome}</b> · venda de <span class="fech-mono">${fmtBRL(f.valorFinal)}</span></p>
      <div class="field-row">
        <div class="field"><label for="dlg-valor">Valor devolvido</label><div class="money-wrap"><span>R$</span><input type="text" inputmode="decimal" id="dlg-valor" value="${esc(d.valorTxt)}" placeholder="0,00" /></div></div>
        <div class="field"><label for="dlg-data">Data</label><input type="date" id="dlg-data" value="${esc(d.data)}" /></div>
      </div>
      <div class="field"><label for="dlg-motivo">Motivo (opcional)</label><input type="text" id="dlg-motivo" maxlength="120" value="${esc(d.motivo)}" placeholder="Ex.: troca, peça com defeito" /></div>
      <p class="fech-nota">Vira uma despesa “Devoluções” no financeiro, e o lucro dessa venda é recalculado. A venda continua valendo; se ela foi desfeita inteira, mova o cliente para fora de Ganho.</p>
      ${erroHtml}`;
    pe = `<button class="btn-outline" id="dlg-fechar" ${d.salvando ? 'disabled' : ''}>Cancelar</button>
      <button class="btn-save" id="dlg-ok" ${d.salvando ? 'disabled' : ''}>${d.salvando ? 'Registrando…' : 'Registrar devolução'}</button>`;
  }
  root.innerHTML = `
    <div class="overlay" id="dlg-overlay">
      <div class="modal fech-modal" role="dialog" aria-modal="true" aria-labelledby="dlg-titulo">
        <div class="modal-head"><h3 id="dlg-titulo">${d.tipo === 'desfeita' ? 'A venda foi desfeita?' : 'Registrar devolução'}</h3><button id="dlg-x" aria-label="Fechar">✕</button></div>
        <div class="modal-body">${corpo}</div>
        <div class="modal-foot">${pe}</div>
      </div>
    </div>`;
  const on = (id, ev, fn) => { const el = root.querySelector('#' + id); if (el) el.addEventListener(ev, fn); };
  on('dlg-x', 'click', fecharDialogo);
  on('dlg-fechar', 'click', fecharDialogo);
  on('dlg-manter', 'click', fecharDialogo);
  on('dlg-devolver', 'change', (e) => { d.devolver = e.target.checked; renderDialogo(); if (d.devolver) { const el = document.getElementById('dlg-dev-valor'); if (el) el.focus(); } });
  on('dlg-dev-valor', 'input', (e) => { d.devolucaoTxt = e.target.value; });
  on('dlg-valor', 'input', (e) => { d.valorTxt = e.target.value; });
  on('dlg-data', 'change', (e) => { d.data = e.target.value; });
  on('dlg-motivo', 'input', (e) => { d.motivo = e.target.value; });
  on('dlg-ok', 'click', () => (d.tipo === 'desfeita' ? confirmarDesfeita() : confirmarDevolucao()));
  const primeiro = root.querySelector('#dlg-valor') || root.querySelector('#dlg-ok');
  if (primeiro && !d.erro) primeiro.focus();
}

async function confirmarDesfeita() {
  const d = fechDialogo;
  if (!d || d.salvando) return;
  const corpo = {};
  if (d.devolver) {
    const v = fechNumero(d.devolucaoTxt);
    if (!(v > 0)) { d.erro = 'Informe o valor devolvido.'; renderDialogo(); return; }
    corpo.devolucao = { valor: v };
  }
  d.salvando = true; d.erro = ''; renderDialogo();
  try {
    const r = await apiRequest('POST', `/financeiro/fechamento/${d.cardId}/cancelar`, corpo);
    fecharDialogo();
    fechAtualizarCard(r.card);
  } catch (e) { d.salvando = false; d.erro = e.message || 'Não foi possível cancelar.'; renderDialogo(); }
}

async function confirmarDevolucao() {
  const d = fechDialogo;
  if (!d || d.salvando) return;
  const v = fechNumero(d.valorTxt);
  if (!(v > 0)) { d.erro = 'Informe o valor devolvido.'; renderDialogo(); return; }
  d.salvando = true; d.erro = ''; renderDialogo();
  try {
    d.feito = await apiRequest('POST', `/financeiro/fechamento/${d.cardId}/devolucao`, { valor: v, data: d.data, motivo: d.motivo });
    d.salvando = false; renderDialogo();
  } catch (e) { d.salvando = false; d.erro = e.message || 'Não foi possível registrar.'; renderDialogo(); }
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (fechForm && !fechSalvando) fecharFechamento();
  else if (fechDialogo && !fechDialogo.salvando) fecharDialogo();
});
