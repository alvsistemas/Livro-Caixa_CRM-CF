/* =======================================================================
   Dívidas com plano de quitação.
   Dívida: { id, name, credor, saldo, saldoOriginal, juros (% ao mês), parcela
             (pagamento mínimo por mês), pagamentos: [{ data, valor }], quitadaEm? }
   Plano (config.planoDividas): { pagamentoMensal, estrategia: 'avalanche'|'bola-de-neve' }
   ======================================================================= */
const ESTRATEGIAS = {
  avalanche: { nome: "Avalanche", desc: "Paga primeiro a dívida com os juros mais altos. É a que gasta menos com juros no total." },
  "bola-de-neve": { nome: "Bola de neve", desc: "Paga primeiro a menor dívida. Você vê dívidas sumindo mais rápido, o que ajuda a manter o ânimo." },
};
function planoAtual() {
  const p = (state.config && state.config.planoDividas) || {};
  const minimos = state.dividas.filter((d) => d.saldo > 0).reduce((a, d) => a + (Number(d.parcela) || 0), 0);
  return { estrategia: p.estrategia || "avalanche", pagamentoMensal: Math.max(Number(p.pagamentoMensal) || 0, minimos), minimos };
}
function renderDividas() {
  const ativas = state.dividas.filter((d) => d.saldo > 0.005);
  const quitadas = state.dividas.filter((d) => !(d.saldo > 0.005));
  const total = ativas.reduce((a, d) => a + d.saldo, 0);
  const p = planoAtual();
  const plano = Calculos.planoDeQuitacao(ativas, p.pagamentoMensal, p.estrategia);
  const outro = Calculos.planoDeQuitacao(ativas, p.pagamentoMensal, p.estrategia === "avalanche" ? "bola-de-neve" : "avalanche");
  const ordemPorId = Object.fromEntries(plano.ordem.map((o, i) => [o.id, { ...o, pos: i + 1 }]));
  const cartao = (d) => {
    const original = Number(d.saldoOriginal) || d.saldo;
    const pago = Math.max(0, original - d.saldo);
    const pct = original ? pago / original : 0;
    const o = ordemPorId[d.id];
    return `<div class="item-card divida-card" data-id="${d.id}">
      <div class="item-head">
        <div><h3 class="item-title">${o ? `<span class="ordem-num">${o.pos}º</span> ` : ""}${escapeHtml(d.name)}</h3><p class="item-note">${escapeHtml(d.credor || "")}${d.credor ? " · " : ""}${String(Number(d.juros) || 0).replace(".", ",")}% ao mês · mínimo ${fmtBRL(d.parcela)}</p></div>
        <div><button class="icon-btn div-edit" title="Editar">✎</button><button class="icon-btn div-del" title="Excluir">🗑</button></div>
      </div>
      <div class="bar-line"><span>Falta pagar</span><span class="mono" style="font-weight:700;font-size:18px">${fmtBRL(d.saldo)}</span></div>
      ${bar(pct, COLORS.pessoal)}
      <div class="bar-line" style="margin-top:6px;font-size:12px;color:var(--ink-muted)"><span>Já pagou ${fmtBRL(pago)} (${fmtPct(pct)})</span><span>${o ? `quita em <b style="color:var(--ink)">${monthLabel(o.mes)}</b>` : ""}</span></div>
      <button class="btn char btn-mini div-pagar" style="margin-top:10px">Registrar pagamento</button>
    </div>`;
  };
  return `
    <div class="row-between">
      <div><h1 class="page-title">Dívidas</h1><p class="page-sub">Um plano pra ficar livre, com a ordem certa de pagar</p></div>
      <button class="btn pessoal" id="nova-div-btn">+ Nova dívida</button>
    </div>
    ${ativas.length ? `
      <div class="grid grid-3" style="margin-bottom:20px">
        ${statCard("Total devido", fmtBRL(total), COLORS.red, `${ativas.length} dívida${ativas.length > 1 ? "s" : ""}`)}
        ${statCard("Livre das dívidas em", plano.viavel ? monthLabel(plano.livreEm) : "—", plano.viavel ? COLORS.pessoal : COLORS.red, plano.viavel ? `daqui a ${plano.meses} ${plano.meses === 1 ? "mês" : "meses"}` : "com esse valor, as dívidas não diminuem")}
        ${statCard("Juros até quitar", plano.viavel ? fmtBRL(plano.jurosTotal) : "—", COLORS.gold, plano.viavel && outro.viavel && outro.jurosTotal > plano.jurosTotal ? `economiza ${fmtBRL(outro.jurosTotal - plano.jurosTotal)} em relação à ${ESTRATEGIAS[p.estrategia === "avalanche" ? "bola-de-neve" : "avalanche"].nome.toLowerCase()}` : "")}
      </div>
      <div class="card" style="margin-bottom:20px">
        <h2 class="section-title" style="border-color:var(--char)">Seu plano</h2>
        <div class="plano-linha">
          <label class="plano-campo">Quanto você consegue pagar por mês, somando todas?
            <span class="row-gap"><input id="plano-valor" type="number" step="50" min="0" value="${p.pagamentoMensal.toFixed(0)}" class="filtro-busca" style="max-width:160px" /> <span class="stat-sub">mínimo somado: ${fmtBRL(p.minimos)}</span></span>
          </label>
        </div>
        <div class="integ-opcoes" style="margin-top:12px">${Object.entries(ESTRATEGIAS).map(([k, e]) => `
          <button type="button" class="integ-opcao ${p.estrategia === k ? "selected" : ""}" data-estrategia="${k}"><span class="integ-titulo">${e.nome}</span><span class="integ-desc">${e.desc}</span></button>`).join("")}</div>
        ${plano.viavel ? `<ol class="plano-ordem">${plano.ordem.map((o) => `<li><b>${escapeHtml(o.name)}</b> — quitada em ${monthLabel(o.mes)}</li>`).join("")}</ol>
          <p class="stat-sub">Todo mês: pague o mínimo de cada dívida e coloque o que sobrar (${fmtBRL(Math.max(0, p.pagamentoMensal - p.minimos))}) na primeira da lista. Quando ela acabar, o valor dela vai para a próxima.</p>`
          : `<p class="aviso-suave">Com ${fmtBRL(p.pagamentoMensal)} por mês, os juros crescem mais rápido do que os pagamentos. Aumente o valor mensal ou tente renegociar os juros das dívidas mais caras.</p>`}
      </div>
      <div class="grid grid-2">${ativas.sort((a, b) => ((ordemPorId[a.id] || {}).pos || 99) - ((ordemPorId[b.id] || {}).pos || 99)).map(cartao).join("")}</div>
    ` : `
      <div class="vazio-grande">
        <div class="vazio-icone">${quitadas.length ? "🎉" : "⛓"}</div>
        <h2>${quitadas.length ? "Nenhuma dívida em aberto!" : "Cadastre suas dívidas"}</h2>
        <p>${quitadas.length ? "Todas as dívidas cadastradas foram quitadas." : "Cartão, empréstimo, cheque especial, financiamento… Informe quanto falta, os juros e a parcela mínima. O app monta a ordem de pagamento e mostra quando você fica livre."}</p>
        <button class="btn pessoal" id="nova-div-btn-2">+ Cadastrar dívida</button>
      </div>`}
    ${quitadas.length ? `<h2 class="section-title" style="border-color:${COLORS.pessoal};margin-top:20px">Quitadas</h2>
      ${quitadas.map((d) => `<div class="cat-linha" data-id="${d.id}"><span>✅ <b>${escapeHtml(d.name)}</b>${d.quitadaEm ? ` · quitada em ${brDate(d.quitadaEm)}` : ""}</span><span><button class="link-btn div-del-q">excluir</button></span></div>`).join("")}` : ""}
  `;
}
function openDividaModal(existing) {
  const f = existing ? { ...existing } : { name: "", credor: "", saldo: "", juros: "", parcela: "" };
  openModal(existing ? "Editar dívida" : "Nova dívida", `
    <div class="field"><label>Nome</label><input id="f-name" value="${escapeHtml(f.name)}" placeholder="Ex.: Cartão Nubank, Empréstimo" /></div>
    <div class="field"><label>Com quem (opcional)</label><input id="f-credor" value="${escapeHtml(f.credor || "")}" placeholder="Banco, loja, pessoa" /></div>
    <div class="field-row">
      <div class="field"><label>Quanto falta pagar (R$)</label><input id="f-saldo" type="number" step="0.01" inputmode="decimal" value="${f.saldo}" /></div>
      <div class="field"><label>Juros (% ao mês)</label><input id="f-juros" type="number" step="0.01" inputmode="decimal" value="${f.juros}" placeholder="Ex.: 12" /></div>
    </div>
    <div class="field"><label>Pagamento mínimo por mês (R$)</label><input id="f-parcela" type="number" step="0.01" inputmode="decimal" value="${f.parcela}" /></div>
    <p class="field-ajuda">Os juros aparecem no contrato ou na fatura (CET mensal). Cartão de crédito rotativo costuma passar de 10% ao mês; empréstimo consignado fica perto de 2%.</p>
    <button class="btn save-btn pessoal" id="f-save">Salvar dívida</button>`);
  document.getElementById("f-save").addEventListener("click", () => {
    const name = document.getElementById("f-name").value.trim();
    const saldo = parseFloat(document.getElementById("f-saldo").value) || 0;
    if (!name || saldo < 0) return;
    const data = {
      ...(existing || {}), id: f.id || uid(), name, credor: document.getElementById("f-credor").value.trim(),
      saldo, juros: parseFloat(document.getElementById("f-juros").value) || 0, parcela: parseFloat(document.getElementById("f-parcela").value) || 0,
      pagamentos: (existing && existing.pagamentos) || [],
    };
    // saldo original: o maior valor já informado (pra mostrar o progresso)
    data.saldoOriginal = Math.max(Number(existing && existing.saldoOriginal) || 0, saldo, existing ? Number(existing.saldo) || 0 : 0);
    if (saldo > 0.005) delete data.quitadaEm;
    const existe = state.dividas.some((d) => d.id === data.id);
    state.dividas = existe ? state.dividas.map((d) => (d.id === data.id ? data : d)) : [...state.dividas, data];
    saveDividas(); closeModal(); render();
  });
}
function openPagamentoDivida(divida) {
  const f = { valor: (Number(divida.parcela) || 0).toFixed(2), data: todayISO(), lancar: true, contaId: state.contas[0] ? state.contas[0].id : "" };
  const draw = () => {
    openModal(`Pagamento · ${escapeHtml(divida.name)}`, `
      <p class="modal-texto">Falta pagar <b>${fmtBRL(divida.saldo)}</b></p>
      <div class="field-row">
        <div class="field"><label>Valor pago (R$)</label><input id="f-valor" type="number" step="0.01" value="${f.valor}" /></div>
        <div class="field"><label>Data</label><input id="f-data" type="date" value="${f.data}" /></div>
      </div>
      <label class="integ-check"><input type="checkbox" id="f-lancar" ${f.lancar ? "checked" : ""} /> Lançar também como despesa (categoria Dívidas)</label>
      ${f.lancar && state.contas.length ? `<div class="field" style="margin-top:10px"><label>Saiu de qual conta?</label>${chipGroup("conta-div", [...state.contas.map((k) => k.name), "Nenhuma"], (state.contas.find((k) => k.id === f.contaId) || {}).name || "Nenhuma", "var(--char)")}</div>` : ""}
      <p class="field-ajuda">O valor é descontado do que falta. Se o banco mostrar um saldo diferente (por causa dos juros), ajuste em "editar".</p>
      <button class="btn save-btn char" id="f-save" style="margin-top:12px">Registrar</button>`);
    document.getElementById("f-valor").addEventListener("input", (e) => { f.valor = e.target.value; });
    document.getElementById("f-data").addEventListener("change", (e) => { f.data = e.target.value; });
    document.getElementById("f-lancar").addEventListener("change", (e) => { f.lancar = e.target.checked; draw(); });
    wireChipGroup("conta-div", (n) => { f.contaId = (state.contas.find((k) => k.name === n) || {}).id || ""; draw(); });
    document.getElementById("f-save").addEventListener("click", () => {
      const valor = parseFloat(f.valor) || 0;
      if (valor <= 0) return;
      const d = state.dividas.find((x) => x.id === divida.id);
      d.saldo = Math.max(0, Calculos.arred(d.saldo - valor));
      d.pagamentos = [...(d.pagamentos || []), { data: f.data, valor }];
      if (d.saldo <= 0.005) d.quitadaEm = f.data;
      if (f.lancar) {
        const tx = { id: uid(), date: f.data, desc: `Pagamento — ${d.name}`, type: "Despesa", category: "Dívidas", scope: "Pessoal", account: "Pix", status: "Pago", value: valor, recurrence: "unico", dividaId: d.id };
        if (f.contaId) tx.contaId = f.contaId;
        state.txs = [tx, ...state.txs]; saveTxs();
      }
      saveDividas(); closeModal(); render();
      toast(d.saldo <= 0.005 ? `🎉 <b>${escapeHtml(d.name)}</b> quitada! Uma a menos.` : `Pagamento registrado. Falta ${fmtBRL(d.saldo)} de ${escapeHtml(d.name)}.`, "ok");
    });
  };
  draw();
}
TELAS.dividas = {
  render: renderDividas,
  ligar() {
    ["nova-div-btn", "nova-div-btn-2"].forEach((id) => { const b = document.getElementById(id); if (b) b.addEventListener("click", () => openDividaModal(null)); });
    const div = (e) => state.dividas.find((d) => d.id === e.target.closest("[data-id]").dataset.id);
    document.querySelectorAll(".div-edit").forEach((b) => b.addEventListener("click", (e) => openDividaModal(div(e))));
    document.querySelectorAll(".div-pagar").forEach((b) => b.addEventListener("click", (e) => openPagamentoDivida(div(e))));
    document.querySelectorAll(".div-del, .div-del-q").forEach((b) => b.addEventListener("click", async (e) => { const d = div(e); if (await confirmarAcao({ mensagem: `Excluir a dívida "${d.name}"?`, sempre: true })) { state.dividas = state.dividas.filter((x) => x.id !== d.id); saveDividas(); render(); } }));
    document.querySelectorAll("[data-estrategia]").forEach((b) => b.addEventListener("click", () => { state.config = { ...state.config, planoDividas: { ...planoAtual(), estrategia: b.dataset.estrategia } }; saveConfig(); render(); }));
    const valor = document.getElementById("plano-valor");
    if (valor) valor.addEventListener("change", (e) => { state.config = { ...state.config, planoDividas: { ...planoAtual(), pagamentoMensal: parseFloat(e.target.value) || 0 } }; saveConfig(); render(); });
  },
};
