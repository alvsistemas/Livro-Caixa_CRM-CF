/* =======================================================================
   Cartões de crédito: fatura de cada cartão pela data de compra e pelo dia de
   fechamento, próxima fatura, limite livre de verdade e pagamento da fatura.
   ======================================================================= */
const SITUACAO_FATURA = {
  aberta: { rotulo: "Aberta", classe: "aberta" },
  fechada: { rotulo: "Fechada · a pagar", classe: "fechada" },
  vencida: { rotulo: "Vencida", classe: "vencida" },
  paga: { rotulo: "Paga", classe: "paga" },
};
// A fatura "atual" de um cartão: a mais antiga ainda não paga (ou a do mês, se tudo pago)
function faturaAtualDoCartao(cartao) {
  const hoje = todayISO();
  const faturas = Calculos.faturasDoCartao(cartao, state.txs, state.cards);
  const pendentes = Object.values(faturas).filter((f) => f.total > 0 && !(cartao.faturasPagas || {})[f.mes] && f.mes <= Calculos.somarMeses(hoje.slice(0, 7), 1)).sort((a, b) => (a.mes < b.mes ? -1 : 1));
  let atual = pendentes[0];
  if (!atual) {
    // nada pendente: mostra a fatura que está aberta agora (pode estar zerada)
    const mes = Calculos.faturaDaCompra(cartao, hoje);
    atual = faturas[mes] || { mes, itens: [], total: 0 };
  }
  const proxima = faturas[Calculos.somarMeses(atual.mes, 1)] || { mes: Calculos.somarMeses(atual.mes, 1), itens: [], total: 0 };
  return { atual, proxima, faturas };
}
function renderCartoes() {
  const semCartao = state.cards.length > 1 ? state.txs.filter((tx) => tx.account === Calculos.CARTAO && tx.type === "Despesa" && !Calculos.cartaoDoLancamento(tx, state.cards)) : [];
  const items = state.cards.map((c) => {
    const { atual, proxima } = faturaAtualDoCartao(c);
    const sit = SITUACAO_FATURA[Calculos.situacaoDaFatura(c, atual.mes)];
    const datas = Calculos.datasDaFatura(c, atual.mes);
    const usado = limiteUsadoDoCartao(c);
    const pct = c.limit ? usado / c.limit : 0;
    return `<div class="item-card cartao-card" data-id="${c.id}">
      <div class="item-head">
        <div><h3 class="item-title">${escapeHtml(c.name)}</h3><p class="item-note">Fecha dia ${Calculos.diaFechamento(c)} · vence dia ${c.dueDay || "?"}</p></div>
        <div><button class="icon-btn card-edit" title="Editar">✎</button><button class="icon-btn card-del" title="Excluir">🗑</button></div>
      </div>
      <div class="fatura-bloco">
        <div class="bar-line"><span>Fatura de ${monthLabel(atual.mes)} <span class="sit-fatura ${sit.classe}">${sit.rotulo}</span></span><span class="mono" style="font-weight:700;font-size:18px">${fmtBRL(atual.total)}</span></div>
        <p class="item-note">${sit.classe === "aberta" ? `Fecha em ${brDate(datas.fechamento)} · ` : ""}Vence em ${brDate(datas.vencimento)}</p>
        <div class="row-gap" style="margin-top:8px">
          <button class="btn ghost btn-mini ver-fatura" data-mes="${atual.mes}">Ver compras (${atual.itens.length})</button>
          ${atual.total > 0 && sit.classe !== "paga" ? `<button class="btn char btn-mini pagar-fatura" data-mes="${atual.mes}">Paguei a fatura</button>` : ""}
          ${sit.classe === "paga" ? `<button class="link-btn desfazer-pagamento" data-mes="${atual.mes}">desfazer pagamento</button>` : ""}
        </div>
      </div>
      <div class="bar-line" style="margin-top:12px;font-size:13px"><span>Próxima fatura (${monthLabel(proxima.mes)})</span><span class="mono">${fmtBRL(proxima.total)}</span></div>
      <div style="margin-top:12px">${bar(pct, pct > 0.8 ? COLORS.red : COLORS.pessoal)}</div>
      <div class="bar-line" style="margin-top:6px;font-size:12px;color:var(--ink-muted)"><span>Limite ${fmtBRL(c.limit)} · usado ${fmtBRL(usado)}</span><span><b style="color:var(--ink)">Livre ${fmtBRL((c.limit || 0) - usado)}</b></span></div>
    </div>`;
  }).join("");
  return `<div class="row-between"><div><h1 class="page-title">Cartões de crédito</h1><p class="page-sub">A fatura certa de cada cartão, pela data da compra</p></div><button class="btn pessoal" id="new-card-btn">+ Novo cartão</button></div>
    ${semCartao.length ? `<p class="aviso-suave">⚠ ${semCartao.length} compra${semCartao.length > 1 ? "s" : ""} no cartão sem cartão escolhido (de quando havia um campo só). <button class="link-btn" id="atribuir-cartao">Escolher o cartão delas</button></p>` : ""}
    <div class="grid grid-2">${items || `<div class="vazio-grande" style="grid-column:1/-1"><div class="vazio-icone">💳</div><h2>Nenhum cartão cadastrado</h2><p>Cadastre seus cartões com o dia de fechamento e o de vencimento. Cada compra no cartão cai na fatura certa, e o limite livre considera as parcelas que ainda vão vir.</p></div>`}</div>
    <p class="stat-sub" style="margin-top:14px">Compras feitas até o dia do fechamento entram na fatura do mês; depois disso, na seguinte. O limite usado inclui todas as parcelas futuras de compras parceladas.</p>`;
}
function openCardModal(existing) {
  const f = existing ? { ...existing, closingDay: Calculos.diaFechamento(existing) } : { name: "", limit: "", closingDay: "", dueDay: "" };
  openModal(existing ? "Editar cartão" : "Novo cartão", `
    <div class="field"><label>Nome do cartão</label><input id="f-name" value="${escapeHtml(f.name)}" placeholder="Ex.: Nubank, Inter" /></div>
    <div class="field"><label>Limite (R$)</label><input id="f-limit" type="number" step="0.01" inputmode="decimal" value="${f.limit}" /></div>
    <div class="field-row">
      <div class="field"><label>Dia do fechamento</label><input id="f-close" type="number" min="1" max="31" value="${f.closingDay}" /></div>
      <div class="field"><label>Dia do vencimento</label><input id="f-due" type="number" min="1" max="31" value="${f.dueDay}" /></div>
    </div>
    <p class="field-ajuda">O fechamento aparece no app do banco. Comprar logo depois dele é o "melhor dia de compra": a compra só é cobrada na fatura seguinte.</p>
    <button class="btn save-btn pessoal" id="f-save">Salvar cartão</button>`);
  document.getElementById("f-save").addEventListener("click", () => {
    const name = document.getElementById("f-name").value.trim();
    const fecha = Math.min(31, Math.max(1, parseInt(document.getElementById("f-close").value, 10) || 1));
    const vence = Math.min(31, Math.max(1, parseInt(document.getElementById("f-due").value, 10) || 10));
    if (!name) return;
    const data = { ...(existing || {}), id: f.id || uid(), name, limit: parseFloat(document.getElementById("f-limit").value) || 0, closingDay: fecha, dueDay: vence, bestDay: fecha === 31 ? 1 : fecha + 1 };
    const exists = state.cards.some((c) => c.id === data.id);
    state.cards = exists ? state.cards.map((c) => (c.id === data.id ? data : c)) : [...state.cards, data];
    saveCards(); closeModal(); render();
  });
}
function abrirFatura(cartao, mes) {
  const faturas = Calculos.faturasDoCartao(cartao, state.txs, state.cards, { ateMes: Calculos.somarMeses(mes, 1) });
  const f = faturas[mes] || { itens: [], total: 0 };
  const meses = Object.keys(Calculos.faturasDoCartao(cartao, state.txs, state.cards)).sort();
  const i = meses.indexOf(mes);
  openModal(`${escapeHtml(cartao.name)} · fatura de ${monthLabel(mes)}`, `
    <div class="row-between" style="margin-bottom:10px">
      <button class="btn ghost btn-mini" id="fat-ant" ${i <= 0 ? "disabled" : ""}>‹ Anterior</button>
      <span class="mono" style="font-weight:700;font-size:18px">${fmtBRL(f.total)}</span>
      <button class="btn ghost btn-mini" id="fat-prox" ${i < 0 || i >= meses.length - 1 ? "disabled" : ""}>Próxima ›</button>
    </div>
    ${f.itens.length ? `<div class="fatura-itens">${f.itens.slice().sort((a, b) => (a.data < b.data ? -1 : 1)).map((o) => `
      <div class="fatura-item"><span class="mono">${brDate(o.data).slice(0, 5)}</span><span>${escapeHtml(o.tx.desc)} ${o.parcela && o.parcela !== "Fixo" ? `<span class="tag parcelado">${o.parcela}</span>` : o.parcela ? `<span class="tag fixo">Fixo</span>` : ""}</span><span class="mono">${fmtBRL(o.valor)}</span></div>`).join("")}</div>`
      : `<p class="empty-msg">Nenhuma compra nesta fatura.</p>`}`);
  const ant = document.getElementById("fat-ant"), prox = document.getElementById("fat-prox");
  if (ant && i > 0) ant.addEventListener("click", () => abrirFatura(cartao, meses[i - 1]));
  if (prox && i >= 0 && i < meses.length - 1) prox.addEventListener("click", () => abrirFatura(cartao, meses[i + 1]));
}
function openPagarFatura(cartao, mes) {
  const total = faturaDoMes(cartao, mes).total;
  const f = { valor: total.toFixed(2), data: todayISO(), contaId: state.contas[0] ? state.contas[0].id : "" };
  const draw = () => {
    openModal(`Pagar fatura · ${escapeHtml(cartao.name)}`, `
      <p class="modal-texto">Fatura de ${monthLabel(mes)}: <b>${fmtBRL(total)}</b></p>
      <div class="field-row">
        <div class="field"><label>Valor pago (R$)</label><input id="f-valor" type="number" step="0.01" value="${f.valor}" /></div>
        <div class="field"><label>Data</label><input id="f-data" type="date" value="${f.data}" /></div>
      </div>
      ${state.contas.length ? `<div class="field"><label>Pago com qual conta?</label>${chipGroup("conta-fat", [...state.contas.map((k) => k.name), "Nenhuma"], (state.contas.find((k) => k.id === f.contaId) || {}).name || "Nenhuma", "var(--char)")}</div>` : ""}
      <p class="field-ajuda">As compras já foram contadas como despesa no mês em que você comprou; pagar a fatura só tira o dinheiro da conta.</p>
      <button class="btn save-btn char" id="f-save">Confirmar pagamento</button>`);
    document.getElementById("f-valor").addEventListener("input", (e) => { f.valor = e.target.value; });
    document.getElementById("f-data").addEventListener("change", (e) => { f.data = e.target.value; });
    wireChipGroup("conta-fat", (n) => { f.contaId = (state.contas.find((k) => k.name === n) || {}).id || ""; draw(); });
    document.getElementById("f-save").addEventListener("click", () => {
      const c = state.cards.find((x) => x.id === cartao.id);
      c.faturasPagas = { ...(c.faturasPagas || {}), [mes]: { valor: parseFloat(f.valor) || 0, data: f.data || todayISO(), contaId: f.contaId || null } };
      saveCards(); closeModal(); render();
      toast(`Fatura de ${monthLabel(mes)} do ${escapeHtml(c.name)} marcada como paga.`, "ok");
    });
  };
  draw();
}
function openAtribuirCartao() {
  const lista = state.txs.filter((tx) => tx.account === Calculos.CARTAO && tx.type === "Despesa" && !Calculos.cartaoDoLancamento(tx, state.cards));
  openModal("Escolher o cartão das compras", `
    <p class="modal-texto">Escolha em qual cartão foi cada compra:</p>
    <div class="atribuir-lista">${lista.map((tx) => `
      <div class="atribuir-item"><div><b>${escapeHtml(tx.desc)}</b><div class="item-note">${brDate(tx.date)} · ${fmtBRL(tx.value)}</div></div>
        <select data-tx="${tx.id}" class="filtro-select"><option value="">—</option>${state.cards.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select></div>`).join("")}</div>
    <button class="btn save-btn char" id="f-save">Salvar</button>`);
  document.getElementById("f-save").addEventListener("click", () => {
    document.querySelectorAll("[data-tx]").forEach((sel) => { if (sel.value) { const tx = state.txs.find((t) => t.id === sel.dataset.tx); if (tx) tx.cardId = sel.value; } });
    saveTxs(); closeModal(); render();
  });
}
TELAS.cartoes = {
  render: renderCartoes,
  ligar() {
    const novo = document.getElementById("new-card-btn");
    if (novo) novo.addEventListener("click", () => openCardModal(null));
    const atrib = document.getElementById("atribuir-cartao");
    if (atrib) atrib.addEventListener("click", openAtribuirCartao);
    const cartaoDe = (e) => state.cards.find((c) => c.id === e.target.closest(".item-card").dataset.id);
    document.querySelectorAll(".card-edit").forEach((b) => b.addEventListener("click", (e) => openCardModal(cartaoDe(e))));
    document.querySelectorAll(".card-del").forEach((b) => b.addEventListener("click", async (e) => {
      const c = cartaoDe(e);
      if (!(await confirmarAcao({ mensagem: `Excluir o cartão "${c.name}"? As compras continuam nos lançamentos.`, sempre: true }))) return;
      state.cards = state.cards.filter((x) => x.id !== c.id);
      state.txs.forEach((tx) => { if (tx.cardId === c.id) delete tx.cardId; });
      saveCards(); saveTxs(); render();
    }));
    document.querySelectorAll(".ver-fatura").forEach((b) => b.addEventListener("click", (e) => abrirFatura(cartaoDe(e), b.dataset.mes)));
    document.querySelectorAll(".pagar-fatura").forEach((b) => b.addEventListener("click", (e) => openPagarFatura(cartaoDe(e), b.dataset.mes)));
    document.querySelectorAll(".desfazer-pagamento").forEach((b) => b.addEventListener("click", (e) => {
      const c = cartaoDe(e);
      const pagas = { ...(c.faturasPagas || {}) }; delete pagas[b.dataset.mes];
      c.faturasPagas = pagas; saveCards(); render();
    }));
  },
};
