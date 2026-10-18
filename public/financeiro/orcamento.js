/* =======================================================================
   Orçamento por categoria (quanto pode gastar em cada uma por mês) e
   categorias personalizadas (em Meu perfil).
   Orçamento: { id, category, limite }  — vale para todos os meses.
   ======================================================================= */
function gastosPorCategoria(mes) {
  const mapa = {};
  occurrencesForMonth(mes).forEach((r) => { if (r.tx.type === "Despesa") mapa[r.tx.category] = (mapa[r.tx.category] || 0) + r.value; });
  return mapa;
}
function situacaoDoOrcamento(categoria, mes) {
  const o = state.orcamentos.find((x) => x.category === categoria);
  if (!o || !(o.limite > 0)) return null;
  const gasto = gastosPorCategoria(mes)[categoria] || 0;
  return { mes, gasto, limite: o.limite, pct: gasto / o.limite };
}
function resumoDoOrcamento(mes) {
  const gastos = gastosPorCategoria(mes);
  const lista = state.orcamentos.filter((o) => o.limite > 0);
  return {
    categorias: lista.length,
    limite: lista.reduce((a, o) => a + o.limite, 0),
    gasto: lista.reduce((a, o) => a + (gastos[o.category] || 0), 0),
    estourados: lista.filter((o) => (gastos[o.category] || 0) > o.limite).length,
  };
}
// Mês "dentro do orçamento": nenhuma categoria com orçamento passou do limite
function mesDentroDoOrcamento(mes) {
  if (!state.orcamentos.length) return false;
  const temLancamento = occurrencesForMonth(mes).some((r) => r.tx.type === "Despesa");
  return temLancamento && resumoDoOrcamento(mes).estourados === 0;
}
function alertasDeOrcamento(mes) {
  const gastos = gastosPorCategoria(mes);
  const out = [];
  state.orcamentos.forEach((o) => {
    if (!(o.limite > 0)) return;
    const pct = (gastos[o.category] || 0) / o.limite;
    if (pct >= 1) out.push({ type: "warn", text: `<b>${escapeHtml(o.category)}</b> passou do orçamento: ${fmtBRL(gastos[o.category])} de ${fmtBRL(o.limite)}.` });
    else if (pct >= 0.8) out.push({ type: "info", text: `<b>${escapeHtml(o.category)}</b> já usou ${fmtPct(pct)} do orçamento do mês.` });
  });
  return out;
}

function renderOrcamento() {
  const gastos = gastosPorCategoria(state.month);
  const resumo = resumoDoOrcamento(state.month);
  const dia = state.month === mesAtual() ? new Date().getDate() : null;
  const diasMes = Calculos.diasNoMes(state.month);
  const linhas = state.orcamentos.slice().sort((a, b) => ((gastos[b.category] || 0) / (b.limite || 1)) - ((gastos[a.category] || 0) / (a.limite || 1))).map((o) => {
    const gasto = gastos[o.category] || 0;
    const pct = o.limite ? gasto / o.limite : 0;
    const cor = pct >= 1 ? COLORS.red : pct >= 0.8 ? COLORS.gold : COLORS.pessoal;
    const situacao = pct >= 1 ? `<span style="color:${COLORS.red};font-weight:600">passou ${fmtBRL(gasto - o.limite)}</span>` : `sobram ${fmtBRL(o.limite - gasto)}`;
    // ritmo: no mês atual, compara o quanto já gastou com o quanto do mês já passou
    const ritmo = dia && o.limite && pct < 1 && pct > (dia / diasMes) + 0.15 ? ` · <span style="color:${COLORS.gold}">gastando mais rápido que o mês</span>` : "";
    return `<div class="orc-linha" data-id="${o.id}">
      <div class="bar-line"><span><b>${escapeHtml(o.category)}</b></span><span class="mono">${fmtBRL(gasto)} <span style="color:var(--ink-muted)">de ${fmtBRL(o.limite)}</span></span></div>
      <div class="orc-barra">${bar(pct, cor)}${dia ? `<span class="orc-hoje" style="left:${(dia / diasMes) * 100}%" title="Hoje"></span>` : ""}</div>
      <div class="bar-line orc-sub"><span>${fmtPct(pct)} usado · ${situacao}${ritmo}</span><span><button class="link-btn orc-edit">editar</button> · <button class="link-btn orc-del">remover</button></span></div>
    </div>`;
  }).join("");
  const semOrcamento = Object.entries(gastos).filter(([cat]) => !state.orcamentos.some((o) => o.category === cat)).sort((a, b) => b[1] - a[1]);
  return `
    <div class="row-between">
      <div><h1 class="page-title">Orçamento</h1><p class="page-sub">Quanto você pode gastar em cada categoria · ${monthLabel(state.month)}</p></div>
      <div class="row-gap">${monthNav()}<button class="btn pessoal" id="novo-orc-btn">+ Definir orçamento</button></div>
    </div>
    ${state.orcamentos.length ? `
      <div class="grid grid-3" style="margin-bottom:20px">
        ${statCard("Planejado", fmtBRL(resumo.limite), "var(--ink)", `${resumo.categorias} categoria${resumo.categorias > 1 ? "s" : ""}`)}
        ${statCard("Gasto", fmtBRL(resumo.gasto), resumo.gasto > resumo.limite ? COLORS.red : COLORS.gold, resumo.limite ? `${fmtPct(resumo.gasto / resumo.limite)} do planejado` : "")}
        ${statCard("Estouradas", String(resumo.estourados), resumo.estourados ? COLORS.red : COLORS.pessoal, resumo.estourados ? "categorias acima do limite" : "tudo dentro do planejado 🎉")}
      </div>
      <div class="card" style="margin-bottom:20px">${linhas}
        ${dia ? `<p class="stat-sub" style="margin-top:8px">A marquinha na barra mostra o quanto do mês já passou: se a barra passou dela, você está gastando mais rápido que o planejado.</p>` : ""}</div>
    ` : `
      <div class="vazio-grande">
        <div class="vazio-icone">◔</div>
        <h2>Defina quanto gastar em cada categoria</h2>
        <p>Ex.: R$ 800 em Alimentação, R$ 300 em Lazer. O app mostra quanto já foi, avisa aos 80% e quando passar do limite.</p>
        <button class="btn pessoal" id="novo-orc-btn-2">+ Definir o primeiro orçamento</button>
      </div>`}
    ${semOrcamento.length ? `<div class="card"><h2 class="section-title" style="border-color:var(--char)">Gastos sem orçamento neste mês</h2>
      ${semOrcamento.map(([cat, v]) => `<div class="bar-line" style="margin-bottom:8px"><span>${escapeHtml(cat)}</span><span><span class="mono">${fmtBRL(v)}</span> <button class="link-btn orc-sugerir" data-cat="${escapeHtml(cat)}" data-valor="${Math.ceil(v / 50) * 50}">definir orçamento</button></span></div>`).join("")}</div>` : ""}
  `;
}
function openOrcamentoModal(existing, sugestao) {
  const usadas = new Set(state.orcamentos.filter((o) => !existing || o.id !== existing.id).map((o) => o.category));
  const cats = categoriasDe("Despesa").filter((c) => !usadas.has(c));
  const f = existing ? { ...existing } : { category: (sugestao && sugestao.category) || cats[0], limite: (sugestao && sugestao.limite) || "" };
  // média dos últimos 3 meses, pra ajudar a escolher o valor
  const media = (cat) => { let t = 0; for (let i = 1; i <= 3; i++) t += gastosPorCategoria(Calculos.somarMeses(mesAtual(), -i))[cat] || 0; return t / 3; };
  const draw = () => {
    const m = media(f.category);
    openModal(existing ? "Editar orçamento" : "Definir orçamento", `
      <div class="field"><label>Categoria</label>${existing ? `<p><b>${escapeHtml(f.category)}</b></p>` : chipGroup("orc-cat", cats, f.category, COLORS.gold)}</div>
      <div class="field"><label>Limite por mês (R$)</label><input id="f-limite" type="number" step="10" inputmode="decimal" value="${f.limite}" /></div>
      ${m > 0 ? `<p class="field-ajuda">Nos últimos 3 meses você gastou em média <b>${fmtBRL(m)}</b> com ${escapeHtml(f.category)}. <button type="button" class="link-btn" id="usar-media">usar esse valor</button></p>` : ""}
      <button class="btn save-btn pessoal" id="f-save">Salvar</button>`);
    document.getElementById("f-limite").addEventListener("input", (e) => { f.limite = e.target.value; });
    wireChipGroup("orc-cat", (v) => { f.category = v; draw(); });
    const usar = document.getElementById("usar-media");
    if (usar) usar.addEventListener("click", () => { f.limite = Math.ceil(m / 10) * 10; draw(); });
    document.getElementById("f-save").addEventListener("click", () => {
      const limite = parseFloat(f.limite) || 0;
      if (!f.category || limite <= 0) return;
      const data = { id: f.id || uid(), category: f.category, limite };
      const existe = state.orcamentos.some((o) => o.id === data.id);
      state.orcamentos = existe ? state.orcamentos.map((o) => (o.id === data.id ? data : o)) : [...state.orcamentos, data];
      saveOrcamentos(); closeModal(); render();
    });
  };
  draw();
}
TELAS.orcamento = {
  render: renderOrcamento,
  ligar() {
    ["novo-orc-btn", "novo-orc-btn-2"].forEach((id) => { const b = document.getElementById(id); if (b) b.addEventListener("click", () => openOrcamentoModal(null)); });
    const orc = (e) => state.orcamentos.find((o) => o.id === e.target.closest(".orc-linha").dataset.id);
    document.querySelectorAll(".orc-edit").forEach((b) => b.addEventListener("click", (e) => openOrcamentoModal(orc(e))));
    document.querySelectorAll(".orc-del").forEach((b) => b.addEventListener("click", (e) => { const o = orc(e); if (confirm(`Remover o orçamento de ${o.category}?`)) { state.orcamentos = state.orcamentos.filter((x) => x.id !== o.id); saveOrcamentos(); render(); } }));
    document.querySelectorAll(".orc-sugerir").forEach((b) => b.addEventListener("click", () => openOrcamentoModal(null, { category: b.dataset.cat, limite: b.dataset.valor })));
  },
};

/* ---------------- Categorias personalizadas (Meu perfil) ---------------- */
TELAS.categorias = {
  ordemNoPerfil: 30,
  noPerfil() {
    const linha = (c) => `<div class="cat-linha" data-id="${c.id}"><span>${escapeHtml(c.nome)} <span class="tag ${c.tipo === "Receita" ? "pessoal" : "empresa"}">${c.tipo}</span>${c.dedutivel ? ` <span class="tag ajuste" title="Entra no resumo para o Imposto de Renda">dedutível no IR</span>` : ""}</span>
      <span><button class="link-btn cat-ir">${c.dedutivel ? "não é dedutível" : "marcar dedutível"}</button> · <button class="link-btn cat-ren">renomear</button> · <button class="link-btn cat-del">excluir</button></span></div>`;
    return `<div class="card" style="margin-bottom:20px">
      <h2 class="section-title" style="border-color:var(--char)">Categorias</h2>
      <p class="stat-sub" style="margin-top:0">Além das categorias padrão, crie as suas. Marque como dedutível as que entram no resumo do Imposto de Renda (Saúde e Educação já são).</p>
      ${state.categorias.length ? state.categorias.map(linha).join("") : `<p class="empty-msg" style="padding:8px 0">Nenhuma categoria criada ainda.</p>`}
      <div class="row-gap" style="margin-top:10px">
        <input id="nova-cat-nome" class="filtro-busca" placeholder="Nome da categoria" maxlength="40" style="flex:1;min-width:160px" />
        <select id="nova-cat-tipo" class="filtro-select"><option>Despesa</option><option>Receita</option></select>
        <button class="btn char" id="nova-cat-btn">Criar</button>
      </div>
    </div>`;
  },
  ligarNoPerfil() {
    const criar = document.getElementById("nova-cat-btn");
    if (!criar) return;
    criar.addEventListener("click", () => {
      const nome = document.getElementById("nova-cat-nome").value.trim().slice(0, 40);
      const tipo = document.getElementById("nova-cat-tipo").value;
      if (!nome) return;
      if (categoriasDe(tipo).includes(nome)) { toast("Essa categoria já existe.", "aviso"); return; }
      state.categorias = [...state.categorias, { id: uid(), nome, tipo, dedutivel: false }];
      saveCategorias(); render();
    });
    const cat = (e) => state.categorias.find((c) => c.id === e.target.closest(".cat-linha").dataset.id);
    document.querySelectorAll(".cat-ir").forEach((b) => b.addEventListener("click", (e) => { const c = cat(e); c.dedutivel = !c.dedutivel; saveCategorias(); render(); }));
    document.querySelectorAll(".cat-ren").forEach((b) => b.addEventListener("click", (e) => {
      const c = cat(e);
      const novo = (prompt("Novo nome:", c.nome) || "").trim().slice(0, 40);
      if (!novo || novo === c.nome) return;
      const antigo = c.nome;
      c.nome = novo;
      let mudou = 0;
      state.txs.forEach((tx) => { if (tx.category === antigo && tx.type === c.tipo) { tx.category = novo; mudou++; } });
      state.orcamentos.forEach((o) => { if (o.category === antigo) o.category = novo; });
      saveCategorias(); if (mudou) saveTxs(); saveOrcamentos(); render();
    }));
    document.querySelectorAll(".cat-del").forEach((b) => b.addEventListener("click", (e) => {
      const c = cat(e);
      const usados = state.txs.filter((tx) => tx.category === c.nome && tx.type === c.tipo).length;
      if (!confirm(`Excluir a categoria "${c.nome}"?${usados ? `\n\n${usados} lançamento(s) usam ela e vão para "Outros".` : ""}`)) return;
      state.txs.forEach((tx) => { if (tx.category === c.nome && tx.type === c.tipo) tx.category = "Outros"; });
      state.categorias = state.categorias.filter((x) => x.id !== c.id);
      state.orcamentos = state.orcamentos.filter((o) => o.category !== c.nome);
      saveCategorias(); if (usados) saveTxs(); saveOrcamentos(); render();
    }));
  },
};
