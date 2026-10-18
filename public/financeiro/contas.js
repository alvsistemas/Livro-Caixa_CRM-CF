/* =======================================================================
   Contas e saldo (banco, carteira, poupança...) + transferências
   e Contas a pagar e a receber.
   ======================================================================= */
const TIPOS_CONTA = ["Conta corrente", "Poupança", "Carteira", "Conta digital", "Investimento", "Outra"];

/* ---------------- Contas e saldo ---------------- */
function renderContas() {
  const dados = dadosParaCalculo();
  const saldos = state.contas.map((k) => ({ conta: k, saldo: Calculos.saldoDaConta(k, dados) }));
  const total = saldos.reduce((a, x) => a + x.saldo, 0);
  const semConta = state.txs.filter((tx) => !tx.contaId && tx.account !== Calculos.CARTAO).length;
  const transf = state.transferencias.slice().sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 15);
  const nomeConta = (id) => { const k = state.contas.find((x) => x.id === id); return k ? escapeHtml(k.name) : "(conta apagada)"; };
  return `
    <div class="row-between">
      <div><h1 class="page-title">Contas e saldo</h1><p class="page-sub">Quanto você tem hoje em cada lugar</p></div>
      <div class="row-gap">
        ${state.contas.length >= 2 ? `<button class="btn ghost" id="nova-transf-btn">⇄ Transferir</button>` : ""}
        <button class="btn pessoal" id="nova-conta-btn">+ Nova conta</button>
      </div>
    </div>
    ${state.contas.length ? `
      <div class="card saldo-total" style="margin-bottom:20px">
        <div class="stat-label">Saldo total hoje</div>
        <div class="stat-value" style="color:${total < 0 ? COLORS.red : "var(--ink)"}">${fmtBRL(total)}</div>
        <div class="stat-sub">Soma das contas abaixo. Só entra o que está marcado como <b>Pago</b>.</div>
      </div>
      <div class="grid grid-2" style="margin-bottom:20px">
        ${saldos.map(({ conta, saldo }) => `
          <div class="item-card" data-id="${conta.id}">
            <div class="item-head">
              <div><h3 class="item-title">${escapeHtml(conta.name)}</h3><p class="item-note">${escapeHtml(conta.tipo || "Conta")} · ${conta.scope === "Empresa" ? "Empresa" : "Pessoal"}</p></div>
              <div><button class="icon-btn conta-edit" title="Editar">✎</button><button class="icon-btn conta-del" title="Excluir">🗑</button></div>
            </div>
            <div class="conta-saldo mono" style="color:${saldo < 0 ? COLORS.red : "var(--ink)"}">${fmtBRL(saldo)}</div>
            <p class="item-note">Saldo inicial de ${fmtBRL(conta.saldoInicial)} em ${brDate(conta.dataSaldo)}</p>
          </div>`).join("")}
      </div>
      ${semConta ? `<p class="aviso-suave">💡 ${semConta} lançamento${semConta > 1 ? "s" : ""} não ${semConta > 1 ? "estão ligados" : "está ligado"} a nenhuma conta e não ${semConta > 1 ? "entram" : "entra"} no saldo. Ao editar um lançamento, escolha a conta de onde o dinheiro sai ou para onde entra.</p>` : ""}
      ${transf.length ? `
        <h2 class="section-title" style="border-color:var(--char);margin-top:8px">Transferências recentes</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>Data</th><th>De</th><th>Para</th><th>Valor</th><th>Observação</th><th></th></tr></thead>
          <tbody>${transf.map((t) => `<tr data-id="${t.id}">
            <td class="mono" style="font-size:12px;color:var(--ink-muted)">${brDate(t.data)}</td>
            <td>${nomeConta(t.deContaId)}</td><td>${nomeConta(t.paraContaId)}</td>
            <td class="mono" style="font-weight:700">${fmtBRL(t.valor)}</td>
            <td style="font-size:13px;color:var(--ink-muted)">${escapeHtml(t.obs || "")}</td>
            <td><button class="icon-btn transf-del" title="Excluir">🗑</button></td></tr>`).join("")}</tbody>
        </table></div>` : ""}
    ` : `
      <div class="vazio-grande">
        <div class="vazio-icone">🏦</div>
        <h2>Cadastre onde seu dinheiro fica</h2>
        <p>Conta do banco, poupança, carteira… Informe o saldo de hoje e o app vai atualizando sozinho a cada receita e despesa paga.</p>
        <button class="btn pessoal" id="nova-conta-btn-2">+ Cadastrar a primeira conta</button>
      </div>`}
  `;
}
function openContaModal(existing) {
  const f = existing ? { ...existing } : { name: "", tipo: TIPOS_CONTA[0], scope: "Pessoal", saldoInicial: "", dataSaldo: todayISO() };
  const draw = () => {
    openModal(existing ? "Editar conta" : "Nova conta", `
      <div class="field"><label>Nome</label><input id="f-name" value="${escapeHtml(f.name)}" placeholder="Ex.: Nubank, Itaú, Carteira" /></div>
      <div class="field"><label>Tipo</label>${chipGroup("tipo", TIPOS_CONTA, f.tipo, "var(--char)")}</div>
      <div class="field"><label>Escopo</label>${chipGroup("scope", ["Pessoal", "Empresa"], f.scope, f.scope === "Empresa" ? COLORS.empresa : COLORS.pessoal)}</div>
      <div class="field-row">
        <div class="field"><label>Saldo (R$)</label><input id="f-saldo" type="number" step="0.01" inputmode="decimal" value="${f.saldoInicial}" placeholder="0,00" /></div>
        <div class="field"><label>Saldo do dia</label><input id="f-data" type="date" value="${f.dataSaldo}" /></div>
      </div>
      <p class="field-ajuda">Confira o saldo no app do banco e informe aqui com a data. Daí em diante, o que você marcar como pago nesta conta atualiza o saldo.</p>
      <button class="btn save-btn pessoal" id="f-save" ${!f.name ? "disabled" : ""}>Salvar conta</button>`);
    document.getElementById("f-name").addEventListener("input", (e) => { f.name = e.target.value; document.getElementById("f-save").disabled = !f.name.trim(); });
    document.getElementById("f-saldo").addEventListener("input", (e) => { f.saldoInicial = e.target.value; });
    document.getElementById("f-data").addEventListener("change", (e) => { f.dataSaldo = e.target.value; });
    wireChipGroup("tipo", (v) => { f.tipo = v; draw(); });
    wireChipGroup("scope", (v) => { f.scope = v; draw(); });
    document.getElementById("f-save").addEventListener("click", () => {
      if (!f.name.trim()) return;
      const data = { ...f, name: f.name.trim(), saldoInicial: parseFloat(f.saldoInicial) || 0, dataSaldo: f.dataSaldo || todayISO(), id: f.id || uid() };
      const existe = state.contas.some((k) => k.id === data.id);
      state.contas = existe ? state.contas.map((k) => (k.id === data.id ? data : k)) : [...state.contas, data];
      saveContas(); closeModal(); render();
    });
  };
  draw();
}
function openTransferenciaModal() {
  const f = { data: todayISO(), deContaId: state.contas[0].id, paraContaId: state.contas[1].id, valor: "", obs: "" };
  const draw = () => {
    const nome = (id) => (state.contas.find((k) => k.id === id) || {}).name;
    openModal("Transferir entre contas", `
      <div class="field"><label>De</label>${chipGroup("de", state.contas.map((k) => k.name), nome(f.deContaId), COLORS.red)}</div>
      <div class="field"><label>Para</label>${chipGroup("para", state.contas.map((k) => k.name), nome(f.paraContaId), COLORS.pessoal)}</div>
      <div class="field-row">
        <div class="field"><label>Valor (R$)</label><input id="f-valor" type="number" step="0.01" inputmode="decimal" value="${f.valor}" /></div>
        <div class="field"><label>Data</label><input id="f-data" type="date" value="${f.data}" /></div>
      </div>
      <div class="field"><label>Observação (opcional)</label><input id="f-obs" value="${escapeHtml(f.obs)}" placeholder="Ex.: guardar na poupança" /></div>
      <p class="field-ajuda">Transferência não é receita nem despesa: só muda o dinheiro de lugar.</p>
      ${f.deContaId === f.paraContaId ? `<p class="aviso-suave">Escolha contas diferentes.</p>` : ""}
      <button class="btn save-btn pessoal" id="f-save">Transferir</button>`);
    document.getElementById("f-valor").addEventListener("input", (e) => { f.valor = e.target.value; });
    document.getElementById("f-data").addEventListener("change", (e) => { f.data = e.target.value; });
    document.getElementById("f-obs").addEventListener("input", (e) => { f.obs = e.target.value; });
    wireChipGroup("de", (n) => { f.deContaId = state.contas.find((k) => k.name === n).id; draw(); });
    wireChipGroup("para", (n) => { f.paraContaId = state.contas.find((k) => k.name === n).id; draw(); });
    document.getElementById("f-save").addEventListener("click", () => {
      const valor = parseFloat(f.valor) || 0;
      if (valor <= 0 || f.deContaId === f.paraContaId) return;
      state.transferencias = [...state.transferencias, { id: uid(), data: f.data || todayISO(), deContaId: f.deContaId, paraContaId: f.paraContaId, valor, obs: f.obs.trim() }];
      saveTransferencias(); closeModal(); render();
      toast(`Transferido ${fmtBRL(valor)} de ${escapeHtml(nome(f.deContaId))} para ${escapeHtml(nome(f.paraContaId))}.`, "ok");
    });
  };
  draw();
}
TELAS.contas = {
  render: renderContas,
  ligar() {
    ["nova-conta-btn", "nova-conta-btn-2"].forEach((id) => { const b = document.getElementById(id); if (b) b.addEventListener("click", () => openContaModal(null)); });
    const t = document.getElementById("nova-transf-btn");
    if (t) t.addEventListener("click", openTransferenciaModal);
    document.querySelectorAll(".conta-edit").forEach((b) => b.addEventListener("click", (e) => openContaModal(state.contas.find((k) => k.id === e.target.closest(".item-card").dataset.id))));
    document.querySelectorAll(".conta-del").forEach((b) => b.addEventListener("click", (e) => {
      const id = e.target.closest(".item-card").dataset.id;
      const k = state.contas.find((x) => x.id === id);
      const usados = state.txs.filter((tx) => tx.contaId === id).length;
      if (!confirm(`Excluir a conta "${k.name}"?${usados ? `\n\n${usados} lançamento(s) estão ligados a ela: eles continuam, mas sem conta.` : ""}`)) return;
      state.contas = state.contas.filter((x) => x.id !== id);
      if (usados) { state.txs.forEach((tx) => { if (tx.contaId === id) delete tx.contaId; }); saveTxs(); }
      saveContas(); render();
    }));
    document.querySelectorAll(".transf-del").forEach((b) => b.addEventListener("click", (e) => {
      if (!confirm("Excluir esta transferência?")) return;
      const id = e.target.closest("tr").dataset.id;
      state.transferencias = state.transferencias.filter((t) => t.id !== id);
      saveTransferencias(); render();
    }));
  },
};

/* ---------------- Contas a pagar e a receber ---------------- */
let diasAPagar = 30;
function renderAPagar() {
  const itens = Calculos.aPagarEReceber(dadosParaCalculo(), { dias: diasAPagar });
  const pagar = itens.filter((i) => i.tipo === "pagar");
  const receber = itens.filter((i) => i.tipo === "receber");
  const soma = (l) => l.reduce((a, i) => a + i.valor, 0);
  const atrasadas = pagar.filter((i) => i.atrasado);
  const hoje = todayISO();
  const quando = (data) => {
    const dias = Math.round((new Date(data + "T12:00:00") - new Date(hoje + "T12:00:00")) / 86400000);
    if (dias < 0) return `<span class="quando atrasado">${-dias} dia${dias === -1 ? "" : "s"} de atraso</span>`;
    if (dias === 0) return `<span class="quando hoje">vence hoje</span>`;
    if (dias === 1) return `<span class="quando">amanhã</span>`;
    return `<span class="quando">em ${dias} dias</span>`;
  };
  const linha = (i, idx) => `
    <div class="pagar-item ${i.atrasado ? "atrasado" : ""}" data-idx="${idx}">
      <div class="pagar-data mono">${brDate(i.data).slice(0, 5)}</div>
      <div class="pagar-info">
        <div class="pagar-desc">${escapeHtml(i.descricao)} ${i.origem === "fatura" ? `<span class="tag fatura">fatura</span>` : i.ocorrencia && i.ocorrencia.parcela ? recurBadge(i.ocorrencia.parcela) : ""}</div>
        <div class="pagar-sub">${quando(i.data)}${i.ocorrencia ? ` · ${escapeHtml(i.ocorrencia.tx.category || "")}` : ""}</div>
      </div>
      <div class="pagar-valor mono ${i.tipo === "receber" ? "val-receita" : "val-despesa"}">${fmtBRL(i.valor)}</div>
      <button class="btn ${i.tipo === "receber" ? "pessoal" : "char"} pagar-btn">${i.tipo === "receber" ? "Recebi" : "Paguei"}</button>
    </div>`;
  window._itensAPagar = itens;
  return `
    <div class="row-between">
      <div><h1 class="page-title">A pagar e receber</h1><p class="page-sub">O que ainda não foi pago, do mais antigo ao mais novo</p></div>
      <div class="row-gap">${[7, 15, 30, 60].map((d) => `<button class="pill ${diasAPagar === d ? "active" : ""}" data-dias="${d}" style="${diasAPagar === d ? "background:var(--ink)" : ""}">${d} dias</button>`).join("")}</div>
    </div>
    <div class="grid grid-3" style="margin-bottom:20px">
      ${statCard("A pagar", fmtBRL(soma(pagar)), COLORS.red, `${pagar.length} conta${pagar.length === 1 ? "" : "s"} nos próximos ${diasAPagar} dias`)}
      ${statCard("Em atraso", fmtBRL(soma(atrasadas)), atrasadas.length ? COLORS.red : "var(--ink-muted)", atrasadas.length ? `${atrasadas.length} conta${atrasadas.length > 1 ? "s" : ""}` : "nada atrasado 🎉")}
      ${statCard("A receber", fmtBRL(soma(receber)), COLORS.pessoal, `${receber.length} recebimento${receber.length === 1 ? "" : "s"}`)}
    </div>
    <div class="grid grid-2" style="align-items:start">
      <div><h2 class="section-title" style="border-color:${COLORS.red}">A pagar</h2>
        ${pagar.length ? pagar.map((i) => linha(i, itens.indexOf(i))).join("") : `<p class="empty-msg">Nada a pagar nesse período.</p>`}</div>
      <div><h2 class="section-title" style="border-color:${COLORS.pessoal}">A receber</h2>
        ${receber.length ? receber.map((i) => linha(i, itens.indexOf(i))).join("") : `<p class="empty-msg">Nada a receber nesse período.</p>`}</div>
    </div>
    <p class="stat-sub" style="margin-top:16px">Entram aqui os lançamentos com status <b>Pendente</b> ou <b>Agendado</b> e as faturas de cartão ainda não pagas. Nos fixos, cada mês é marcado à parte.</p>
  `;
}
// "Paguei" / "Recebi": marca só aquela ocorrência (e, se tiver contas, pergunta de qual saiu)
function marcarComoPago(item) {
  if (item.origem === "fatura") { if (window.openPagarFatura) openPagarFatura(item.cartao, item.mes); return; }
  const o = item.ocorrencia;
  const tx = state.txs.find((t) => t.id === o.tx.id);
  if (!tx) return;
  const concluir = (contaId) => {
    if (contaId !== undefined) { if (contaId) tx.contaId = contaId; else delete tx.contaId; }
    definirStatusNoMes(tx, o.mes, "Pago");
    saveTxs(); closeModal(); render();
    toast(`${tx.type === "Receita" ? "Recebimento" : "Pagamento"} de ${fmtBRL(o.valor)} registrado.`, "ok");
  };
  if (!state.contas.length) { concluir(); return; }
  let escolhida = tx.contaId || state.contas[0].id;
  const draw = () => {
    openModal(tx.type === "Receita" ? "Registrar recebimento" : "Registrar pagamento", `
      <p class="modal-texto"><b>${escapeHtml(tx.desc)}</b> · ${fmtBRL(o.valor)} · ${brDate(o.data)}</p>
      <div class="field"><label>${tx.type === "Receita" ? "Entrou em qual conta?" : "Saiu de qual conta?"}</label>${chipGroup("conta-pg", [...state.contas.map((k) => k.name), "Nenhuma"], (state.contas.find((k) => k.id === escolhida) || {}).name || "Nenhuma", "var(--char)")}</div>
      <button class="btn save-btn char" id="f-save">Confirmar</button>`);
    wireChipGroup("conta-pg", (n) => { escolhida = (state.contas.find((k) => k.name === n) || {}).id || ""; draw(); });
    document.getElementById("f-save").addEventListener("click", () => concluir(escolhida));
  };
  draw();
}
TELAS.apagar = {
  render: renderAPagar,
  ligar() {
    document.querySelectorAll("[data-dias]").forEach((b) => b.addEventListener("click", () => { diasAPagar = parseInt(b.dataset.dias, 10); render(); }));
    document.querySelectorAll(".pagar-btn").forEach((b) => b.addEventListener("click", (e) => {
      const item = (window._itensAPagar || [])[parseInt(e.target.closest(".pagar-item").dataset.idx, 10)];
      if (item) marcarComoPago(item);
    }));
  },
};

// Contador de contas atrasadas no menu
function atualizarBadgeAPagar() {
  const el = document.getElementById("badge-apagar");
  if (!el) return;
  const n = Calculos.aPagarEReceber(dadosParaCalculo(), { dias: 0 }).filter((i) => i.tipo === "pagar" && (i.atrasado || i.data === todayISO())).length;
  el.hidden = !n;
  el.textContent = n;
}
