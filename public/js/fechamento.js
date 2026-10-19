/* Fechamento da venda (CRM -> Controle financeiro).
   Quando um card entra numa coluna de ganho, abre uma janela pedindo o valor final
   (com desconto) e como o cliente vai pagar. Ao confirmar, o servidor cria uma Receita
   por parcela no financeiro, ligada ao card. "Agora não" deixa o selo
   "falta o fechamento" no card, que reabre a janela.
   Usa as funções e variáveis globais do script.js (board, apiRequest, esc, fmtBRL, renderApp). */

const FECH_MEIOS = [
  ['pix', 'Pix'], ['dinheiro', 'Dinheiro'], ['credito', 'Cartão de crédito'], ['debito', 'Cartão de débito'],
  ['boleto', 'Boleto'], ['transferencia', 'Transferência'], ['outro', 'Outro'],
];
const FECH_FORMAS = [['avista', 'À vista'], ['parcelado', 'Parcelado'], ['entrada', 'Entrada + parcelas']];

let fechModo = null; // { modo, perguntado } — lido do servidor uma vez
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

// Chamada depois que um card muda de coluna (arrastar, menu "mover", ficha do cliente)
async function talvezPedirFechamento(card, colunaAnteriorId) {
  if (!card || card.fechamento) return;
  if (!fechColunaEhGanho(card.columnId) || fechColunaEhGanho(colunaAnteriorId)) return;
  const modo = await fechCarregarModo();
  if (!modo) return;
  if (modo.perguntado && modo.modo !== 'vendas') return;
  abrirFechamento(card.id);
}

async function abrirFechamento(cardId) {
  const card = board.cards.find((c) => c.id === cardId);
  if (!card) return;
  const modo = await fechCarregarModo();
  const f = card.fechamento || null;
  const valorCard = Number(card.valor) || 0;
  fechErro = '';
  fechSalvando = false;
  fechForm = {
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
          ${calc.parcelas.length > 1 ? `<div class="fech-parcelas" aria-label="Parcelas que vão para o financeiro">
            ${calc.parcelas.slice(0, 6).map((p) => `<div><span>${esc(p.rotulo)} · ${fechDataBR(p.data)}</span><span class="fech-mono">${fmtBRL(p.cent / 100)}</span></div>`).join('')}
            ${calc.parcelas.length > 6 ? `<div class="fech-mais">… e mais ${calc.parcelas.length - 6} até ${fechDataBR(calc.parcelas[calc.parcelas.length - 1].data)}</div>` : ''}
          </div>` : ''}
          <p class="fech-nota">${f.refazendo
            ? 'As parcelas que este fechamento criou no financeiro serão trocadas pelas novas. As que você já marcou como recebidas continuam recebidas.'
            : 'Cada parcela vira uma receita no Controle financeiro (categoria Vendas). Dá pra refazer depois pela ficha do cliente.'}</p>
          ${fechErro ? `<p class="fech-erro" role="alert">${esc(fechErro)}</p>` : ''}
        </div>
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
    el.addEventListener('change', () => redesenhar());
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
    f.forma = b.dataset.forma;
    if (f.forma === 'parcelado' && Number(f.parcelas) < 2) f.parcelas = 2;
    redesenhar();
  });
  const sel = (id, campo, depois) => { const el = root.querySelector('#' + id); if (el) el.addEventListener('change', (e) => { f[campo] = e.target.value; if (depois) depois(); redesenhar(); }); };
  sel('fech-parcelas', 'parcelas');
  sel('fech-data', 'primeiraData');
  sel('fech-meio', 'meio', () => { if (!f.recebidoMexido) f.recebido = f.meio !== 'boleto'; });
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

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && fechForm && !fechSalvando) fecharFechamento(); });
