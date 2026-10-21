/* =======================================================================
   Relatórios: evolução do patrimônio, despesas mês a mês, resumo anual
   (com ajuda para o Imposto de Renda) e exportação para Excel e PDF.
   ======================================================================= */
let relatorioAno = new Date().getFullYear();
let relatorioCategoria = "";

const fimDoMes = (ym) => `${ym}-${String(Calculos.diasNoMes(ym)).padStart(2, "0")}`;
function ultimosMeses(n, ate) { const out = []; for (let i = n - 1; i >= 0; i--) out.push(Calculos.somarMeses(ate || mesAtual(), -i)); return out; }

/* ---------- gráfico de linha (uma série) ---------- */
function graficoLinha(id, pontos, { formato = fmtBRL, rotulo } = {}) {
  if (pontos.length < 2) {
    const p = pontos[0];
    return `<div class="grafico-vazio"><div class="stat-value">${p ? formato(p.valor) : "—"}</div><p class="stat-sub">${p ? `em ${monthLabel(p.mes)}. ` : ""}A linha aparece a partir do segundo mês acompanhado.</p></div>`;
  }
  const W = 640, H = 220, M = { t: 16, r: 16, b: 28, l: 64 };
  const valores = pontos.map((p) => p.valor);
  let min = Math.min(0, ...valores), max = Math.max(0, ...valores);
  if (max === min) max = min + 1;
  const pad = (max - min) * 0.08; min -= min < 0 ? pad : 0; max += pad;
  const x = (i) => M.l + (pontos.length === 1 ? (W - M.l - M.r) / 2 : (i * (W - M.l - M.r)) / (pontos.length - 1));
  const y = (v) => M.t + (H - M.t - M.b) * (1 - (v - min) / (max - min));
  const ticks = [min, (min + max) / 2, max].map((v) => Math.round(v / 10) * 10);
  const caminho = pontos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(" ");
  const largura = (W - M.l - M.r) / Math.max(1, pontos.length - 1);
  return `<div class="grafico" id="${id}" data-tipo="linha">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(rotulo || "")}">
      ${ticks.map((t) => `<line x1="${M.l}" x2="${W - M.r}" y1="${y(t)}" y2="${y(t)}" class="g-grade"/><text x="${M.l - 8}" y="${y(t) + 4}" class="g-eixo" text-anchor="end">${formatoCurto(t)}</text>`).join("")}
      ${min < 0 ? `<line x1="${M.l}" x2="${W - M.r}" y1="${y(0)}" y2="${y(0)}" class="g-zero"/>` : ""}
      <path d="${caminho}" class="g-linha"/>
      ${pontos.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.valor)}" r="4" class="g-ponto"/>`).join("")}
      ${pontos.map((p, i) => `<text x="${x(i)}" y="${H - 8}" class="g-eixo" text-anchor="middle">${monthLabel(p.mes).slice(0, 3)}</text>`).join("")}
      ${pontos.map((p, i) => `<rect x="${x(i) - largura / 2}" y="${M.t}" width="${largura}" height="${H - M.t - M.b}" class="g-alvo" data-i="${i}" data-x="${x(i)}"/>`).join("")}
      <line class="g-mira" x1="0" x2="0" y1="${M.t}" y2="${H - M.b}" style="display:none"/>
    </svg>
    <div class="g-dica" hidden></div>
    <script type="application/json" class="g-dados">${JSON.stringify(pontos.map((p) => ({ t: monthLabel(p.mes), v: formato(p.valor) })))}</script>
  </div>`;
}
/* ---------- gráfico de barras (uma série) com linha de média ---------- */
function graficoBarras(id, pontos, { rotulo, destaque } = {}) {
  const W = 640, H = 220, M = { t: 16, r: 16, b: 28, l: 64 };
  const max = Math.max(1, ...pontos.map((p) => p.valor)) * 1.1;
  const passo = (W - M.l - M.r) / pontos.length;
  const largura = Math.min(36, passo * 0.62);
  const y = (v) => M.t + (H - M.t - M.b) * (1 - v / max);
  const comValor = pontos.filter((p) => p.valor > 0);
  const media = comValor.length ? comValor.reduce((a, p) => a + p.valor, 0) / comValor.length : 0;
  const ticks = [0, max / 2, max * 0.95].map((v) => Math.round(v / 10) * 10);
  return `<div class="grafico" id="${id}" data-tipo="barras">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(rotulo || "")}">
      ${ticks.map((t) => `<line x1="${M.l}" x2="${W - M.r}" y1="${y(t)}" y2="${y(t)}" class="g-grade"/><text x="${M.l - 8}" y="${y(t) + 4}" class="g-eixo" text-anchor="end">${formatoCurto(t)}</text>`).join("")}
      ${pontos.map((p, i) => { const cx = M.l + passo * i + passo / 2; const h = Math.max(0, H - M.b - y(p.valor)); return `<path d="${barraArredondada(cx - largura / 2, H - M.b - h, largura, h)}" class="g-barra ${p.mes === destaque ? "atual" : ""}"/><text x="${cx}" y="${H - 8}" class="g-eixo" text-anchor="middle">${monthLabel(p.mes).slice(0, 3)}</text>`; }).join("")}
      ${media ? `<line x1="${M.l}" x2="${W - M.r}" y1="${y(media)}" y2="${y(media)}" class="g-media"/><text x="${W - M.r}" y="${y(media) - 5}" class="g-eixo" text-anchor="end">média ${formatoCurto(media)}</text>` : ""}
      ${pontos.map((p, i) => `<rect x="${M.l + passo * i}" y="${M.t}" width="${passo}" height="${H - M.t - M.b}" class="g-alvo" data-i="${i}" data-x="${M.l + passo * i + passo / 2}"/>`).join("")}
    </svg>
    <div class="g-dica" hidden></div>
    <script type="application/json" class="g-dados">${JSON.stringify(pontos.map((p) => ({ t: monthLabel(p.mes), v: fmtBRL(p.valor), extra: media && comValor.length > 1 && p.valor > 0 ? (Math.abs(p.valor / media - 1) < 0.005 ? "na média" : p.valor > media ? `${fmtPct(p.valor / media - 1)} acima da média` : `${fmtPct(1 - p.valor / media)} abaixo da média`) : "" })))}</script>
  </div>`;
}
// barra com cantos de 4px só no topo (a base fica reta, no eixo)
function barraArredondada(x, y, w, h) {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}
function formatoCurto(v) {
  const a = Math.abs(v);
  const s = a >= 1e6 ? (a / 1e6).toFixed(1).replace(".", ",") + " mi" : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(".", ",") + " mil" : String(Math.round(a));
  return (v < 0 ? "−" : "") + "R$ " + s;
}
// dica ao passar o mouse (ou tocar) em cima de um mês
function ligarGraficos() {
  document.querySelectorAll(".grafico").forEach((g) => {
    const dados = JSON.parse(g.querySelector(".g-dados").textContent);
    const dica = g.querySelector(".g-dica");
    const mira = g.querySelector(".g-mira");
    const svg = g.querySelector("svg");
    const mostrar = (alvo) => {
      const d = dados[+alvo.dataset.i];
      dica.innerHTML = `<b>${escapeHtml(d.t)}</b><span class="mono">${escapeHtml(d.v)}</span>${d.extra ? `<small>${escapeHtml(d.extra)}</small>` : ""}`;
      dica.hidden = false;
      const larguraSvg = svg.getBoundingClientRect().width / (window.zoomDaTela ? window.zoomDaTela() : 1);
      const escala = larguraSvg / 640;
      const px = +alvo.dataset.x * escala;
      dica.style.left = Math.min(Math.max(px, 70), larguraSvg - 70) + "px";
      if (mira) { mira.setAttribute("x1", alvo.dataset.x); mira.setAttribute("x2", alvo.dataset.x); mira.style.display = ""; }
      g.querySelectorAll(".g-alvo").forEach((a) => a.classList.toggle("ativo", a === alvo));
    };
    const esconder = () => { dica.hidden = true; if (mira) mira.style.display = "none"; g.querySelectorAll(".g-alvo").forEach((a) => a.classList.remove("ativo")); };
    g.querySelectorAll(".g-alvo").forEach((a) => { a.addEventListener("mouseenter", () => mostrar(a)); a.addEventListener("click", () => mostrar(a)); });
    svg.addEventListener("mouseleave", esconder);
  });
}

/* ---------- dados ---------- */
function patrimonioHoje() {
  const dados = dadosParaCalculo();
  const contas = state.contas.reduce((a, k) => a + Calculos.saldoDaConta(k, dados), 0);
  const invest = state.invs.reduce((a, i) => a + (Number(i.current) || 0), 0);
  const dividas = state.dividas.reduce((a, d) => a + (Number(d.saldo) || 0), 0);
  return { contas, invest, dividas, total: contas + invest - dividas };
}
function evolucaoPatrimonio(meses) {
  const dados = dadosParaCalculo();
  if (state.contas.length) {
    // só a partir do mês em que a primeira conta começou a ser acompanhada
    const inicio = state.contas.map((k) => Calculos.anoMes(k.dataSaldo || todayISO())).sort()[0];
    const desde = meses.filter((m) => m >= inicio);
    return { titulo: "Saldo nas contas no fim de cada mês", pontos: (desde.length ? desde : [mesAtual()]).map((m) => ({ mes: m, valor: state.contas.reduce((a, k) => a + Calculos.saldoDaConta(k, dados, m === mesAtual() ? todayISO() : fimDoMes(m)), 0) })) };
  }
  let acumulado = 0;
  const antes = Calculos.primeiroMes(state.txs);
  if (antes) for (let m = antes; m < meses[0]; m = Calculos.somarMeses(m, 1)) acumulado += sumsFromOccurrences(resultadoDoMes(m)).saldo;
  return { titulo: "Quanto sobrou, somando mês a mês", pontos: meses.map((m) => { acumulado += sumsFromOccurrences(resultadoDoMes(m)).saldo; return { mes: m, valor: acumulado }; }) };
}
function despesasPorMes(meses, categoria) {
  return meses.map((m) => ({ mes: m, valor: resultadoDoMes(m).filter((r) => r.tx.type === "Despesa" && (!categoria || r.tx.category === categoria)).reduce((a, r) => a + r.value, 0) }));
}
function resumoDoAno(ano) {
  const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);
  const porMes = meses.map((m) => ({ mes: m, ...sumsFromOccurrences(resultadoDoMes(m)) }));
  const linhas = meses.flatMap((m) => occurrencesForMonth(m));
  const somarPor = (tipo) => { const mapa = {}; linhas.filter((r) => r.tx.type === tipo).forEach((r) => { mapa[r.tx.category] = (mapa[r.tx.category] || 0) + r.value; }); return Object.entries(mapa).sort((a, b) => b[1] - a[1]); };
  const dedutiveis = linhas.filter((r) => r.tx.type === "Despesa" && ehDedutivel(r.tx.category) && r.tx.scope !== "Empresa");
  const previdencia = state.invs.filter((i) => i.type === "Previdência" && String(i.date || "").startsWith(String(ano)));
  return {
    ano, porMes, linhas,
    rec: porMes.reduce((a, x) => a + x.rec, 0), desp: porMes.reduce((a, x) => a + x.desp, 0),
    receitas: somarPor("Receita"), despesas: somarPor("Despesa"),
    dedutiveis, previdencia,
  };
}

/* ---------- tela ---------- */
function renderRelatorios() {
  const meses = ultimosMeses(12);
  const p = patrimonioHoje();
  const evo = evolucaoPatrimonio(meses);
  const desp = despesasPorMes(meses, relatorioCategoria);
  const r = resumoDoAno(relatorioAno);
  const anos = [...new Set([new Date().getFullYear(), ...state.txs.map((t) => parseInt(String(t.date).slice(0, 4), 10)).filter(Boolean)])].sort((a, b) => b - a);
  const cats = categoriasDe("Despesa");
  const dedPorCat = {};
  r.dedutiveis.forEach((x) => { dedPorCat[x.tx.category] = (dedPorCat[x.tx.category] || 0) + x.value; });
  return `
    <div class="row-between"><div><h1 class="page-title">Relatórios</h1><p class="page-sub">Como seu dinheiro evoluiu e o resumo do ano</p></div>
      <button class="btn ghost" id="exportar-rel-btn">⇩ Exportar</button></div>

    <div class="grid grid-4" style="margin-bottom:20px">
      ${statCard("Patrimônio hoje", fmtBRL(p.total), p.total < 0 ? COLORS.red : "var(--ink)", "contas + investimentos − dívidas")}
      ${statCard("Nas contas", fmtBRL(p.contas), "var(--ink)", state.contas.length ? "" : `<a href="#" class="link-lucro" data-goto="contas">cadastrar contas →</a>`)}
      ${statCard("Investido", fmtBRL(p.invest), COLORS.pessoal)}
      ${statCard("Dívidas", fmtBRL(p.dividas), p.dividas ? COLORS.red : "var(--ink-muted)")}
    </div>

    <div class="grid grid-2" style="margin-bottom:20px;align-items:start">
      <div class="card">
        <h2 class="section-title" style="border-color:var(--char)">${evo.titulo}</h2>
        ${graficoLinha("g-patrimonio", evo.pontos, { rotulo: evo.titulo })}
        ${!state.contas.length ? `<p class="stat-sub">Cadastre suas contas (aba Contas e saldo) para ver o saldo real mês a mês.</p>` : ""}
      </div>
      <div class="card">
        <div class="row-between" style="margin-bottom:0"><h2 class="section-title" style="border-color:${COLORS.red};margin-bottom:8px">Despesas mês a mês</h2>
          <select id="rel-cat" class="filtro-select" aria-label="Categoria"><option value="">Todas as categorias</option>${cats.map((c) => `<option ${c === relatorioCategoria ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}</select></div>
        ${graficoBarras("g-despesas", desp, { rotulo: "Despesas mês a mês", destaque: mesAtual() })}
      </div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <div class="row-between"><h2 class="section-title" style="border-color:${COLORS.gold};margin-bottom:0">Resumo de ${r.ano}</h2>
        <div class="row-gap"><select id="rel-ano" class="filtro-select" aria-label="Ano">${anos.map((a) => `<option ${a === relatorioAno ? "selected" : ""}>${a}</option>`).join("")}</select>
          <button class="btn ghost btn-mini" id="rel-pdf">PDF do ano</button><button class="btn ghost btn-mini" id="rel-xlsx">Excel do ano</button></div></div>
      <div class="grid grid-3" style="margin:14px 0">
        ${statCard("Receitas no ano", fmtBRL(r.rec), COLORS.pessoal)}
        ${statCard("Despesas no ano", fmtBRL(r.desp), COLORS.red)}
        ${statCard("Resultado", fmtBRL(r.rec - r.desp), r.rec - r.desp < 0 ? COLORS.red : COLORS.gold, r.rec ? (r.rec >= r.desp ? `guardou ${fmtPct((r.rec - r.desp) / r.rec)} do que entrou` : `gastou ${fmtPct((r.desp - r.rec) / r.rec)} a mais do que entrou`) : "")}
      </div>
      <div class="table-wrap" style="border:none;box-shadow:none"><table class="tabela-lucro">
        <thead><tr><th>Mês</th><th>Receitas</th><th>Despesas</th><th>Resultado</th></tr></thead>
        <tbody>${r.porMes.map((x) => `<tr><td style="font-weight:600">${monthLabel(x.mes)}</td><td class="mono">${fmtBRL(x.rec)}</td><td class="mono">${fmtBRL(x.desp)}</td><td class="mono" style="font-weight:700;color:${x.saldo < 0 ? COLORS.red : COLORS.pessoal}">${fmtBRL(x.saldo)}</td></tr>`).join("")}
          <tr class="linha-total"><td>Total</td><td class="mono">${fmtBRL(r.rec)}</td><td class="mono">${fmtBRL(r.desp)}</td><td class="mono">${fmtBRL(r.rec - r.desp)}</td></tr></tbody>
      </table></div>
      <div class="grid grid-2" style="margin-top:16px;align-items:start">
        <div><h3 class="sub-titulo">Receitas por categoria</h3>${r.receitas.length ? r.receitas.map(([c, v]) => `<div class="bar-line linha-fina"><span>${escapeHtml(c)}</span><span class="mono">${fmtBRL(v)}</span></div>`).join("") : `<p class="empty-msg">Nenhuma receita.</p>`}</div>
        <div><h3 class="sub-titulo">Despesas por categoria</h3>${r.despesas.length ? r.despesas.map(([c, v]) => `<div class="bar-line linha-fina"><span>${escapeHtml(c)}</span><span class="mono">${fmtBRL(v)}</span></div>`).join("") : `<p class="empty-msg">Nenhuma despesa.</p>`}</div>
      </div>
    </div>

    <div class="card">
      <h2 class="section-title" style="border-color:var(--char)">Ajuda para o Imposto de Renda ${r.ano}</h2>
      <p class="stat-sub" style="margin-top:0">Despesas pessoais que costumam ser dedutíveis (Saúde, Educação e as categorias que você marcou em Meu perfil) e aportes em previdência. É um apoio para juntar os comprovantes: confira as regras do ano com um contador ou no programa da Receita.</p>
      <div class="grid grid-2" style="align-items:start">
        <div>
          <h3 class="sub-titulo">Despesas dedutíveis</h3>
          ${Object.keys(dedPorCat).length ? Object.entries(dedPorCat).map(([c, v]) => `<div class="bar-line linha-fina"><span>${escapeHtml(c)}</span><span class="mono">${fmtBRL(v)}</span></div>`).join("") + `<div class="bar-line linha-fina linha-total"><span>Total</span><span class="mono">${fmtBRL(r.dedutiveis.reduce((a, x) => a + x.value, 0))}</span></div>` : `<p class="empty-msg">Nenhuma despesa dedutível lançada em ${r.ano}.</p>`}
          ${r.previdencia.length ? `<h3 class="sub-titulo" style="margin-top:14px">Previdência (aportes no ano)</h3>${r.previdencia.map((i) => `<div class="bar-line linha-fina"><span>${escapeHtml(i.name)}</span><span class="mono">${fmtBRL(i.applied)}</span></div>`).join("")}` : ""}
        </div>
        <div>
          <h3 class="sub-titulo">Lançamentos (para conferir os comprovantes)</h3>
          <div class="ir-lista">${r.dedutiveis.length ? r.dedutiveis.sort((a, b) => (a.data < b.data ? -1 : 1)).map((x) => `<div class="ir-item"><span class="mono">${brDate(x.data)}</span><span>${escapeHtml(x.tx.desc)}${(x.tx.comprovantes || []).length ? " 📎" : ` <span class="aviso-mini">sem comprovante</span>`}</span><span class="mono">${fmtBRL(x.value)}</span></div>`).join("") : `<p class="empty-msg">—</p>`}</div>
        </div>
      </div>
    </div>`;
}
TELAS.relatorios = {
  render: renderRelatorios,
  ligar() {
    ligarGraficos();
    const cat = document.getElementById("rel-cat"); if (cat) cat.addEventListener("change", (e) => { relatorioCategoria = e.target.value; render(); });
    const ano = document.getElementById("rel-ano"); if (ano) ano.addEventListener("change", (e) => { relatorioAno = parseInt(e.target.value, 10); render(); });
    const exp = document.getElementById("exportar-rel-btn"); if (exp) exp.addEventListener("click", abrirExportar);
    const pdf = document.getElementById("rel-pdf"); if (pdf) pdf.addEventListener("click", () => exportarPDF({ tipo: "ano", ano: relatorioAno }));
    const xl = document.getElementById("rel-xlsx"); if (xl) xl.addEventListener("click", () => exportarExcel({ tipo: "ano", ano: relatorioAno }));
  },
};

/* ---------- exportar ---------- */
const scriptsCarregados = {};
function carregarScript(url) {
  if (!scriptsCarregados[url]) scriptsCarregados[url] = new Promise((ok, falha) => { const s = document.createElement("script"); s.src = url; s.onload = ok; s.onerror = () => { delete scriptsCarregados[url]; falha(new Error("Não foi possível carregar a ferramenta de exportação. Confira a internet.")); }; document.head.appendChild(s); });
  return scriptsCarregados[url];
}
function linhasDoPeriodo(periodo) {
  let meses;
  if (periodo.tipo === "mes") meses = [state.month];
  else if (periodo.tipo === "ano") meses = Array.from({ length: 12 }, (_, i) => `${periodo.ano}-${String(i + 1).padStart(2, "0")}`);
  else { const ini = Calculos.primeiroMes(state.txs) || mesAtual(); meses = []; for (let m = ini; m <= mesAtual(); m = Calculos.somarMeses(m, 1)) meses.push(m); }
  return meses.flatMap((m) => occurrencesForMonth(m)).sort((a, b) => ((a.data || a.tx.date) < (b.data || b.tx.date) ? -1 : 1));
}
const nomePeriodo = (p) => (p.tipo === "mes" ? monthLabel(state.month) : p.tipo === "ano" ? String(p.ano) : "todo o período");
const nomeDeArquivo = (p) => `livro-caixa-${semAcento(nomePeriodo(p)).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
function origemTexto(tx) {
  if (tx.origem === "crm") return "CRM";
  if (tx.account === Calculos.CARTAO) { const c = Calculos.cartaoDoLancamento(tx, state.cards); return c ? c.name : ""; }
  const k = tx.contaId && state.contas.find((x) => x.id === tx.contaId);
  return k ? k.name : "";
}
async function exportarExcel(periodo) {
  try {
    await carregarScript("https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js");
    const linhas = linhasDoPeriodo(periodo);
    const dados = linhas.map((r) => ({ Data: brDate(r.data || r.tx.date), "Descrição": r.tx.desc, Tipo: r.tx.type, Categoria: r.tx.category, Escopo: r.tx.scope, Forma: r.tx.account, "Conta/Cartão": origemTexto(r.tx), Status: r.status || r.tx.status, Parcela: r.badge || "", Valor: (r.tx.type === "Despesa" ? -1 : 1) * Calculos.arred(r.value) }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dados);
    ws["!cols"] = [{ wch: 11 }, { wch: 36 }, { wch: 9 }, { wch: 20 }, { wch: 9 }, { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 8 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, "Lançamentos");
    const porCat = {};
    linhas.forEach((r) => { const k = `${r.tx.type}|${r.tx.category}`; porCat[k] = (porCat[k] || 0) + r.value; });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.entries(porCat).sort().map(([k, v]) => ({ Tipo: k.split("|")[0], Categoria: k.split("|")[1], Total: Calculos.arred(v) }))), "Por categoria");
    if (periodo.tipo === "ano") {
      const r = resumoDoAno(periodo.ano);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.porMes.map((x) => ({ "Mês": monthLabel(x.mes), Receitas: Calculos.arred(x.rec), Despesas: Calculos.arred(x.desp), Resultado: Calculos.arred(x.saldo) }))), "Mês a mês");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.dedutiveis.map((x) => ({ Data: brDate(x.data), "Descrição": x.tx.desc, Categoria: x.tx.category, Valor: Calculos.arred(x.value), Comprovante: (x.tx.comprovantes || []).length ? "sim" : "não" }))), "Dedutíveis IR");
    }
    XLSX.writeFile(wb, `${nomeDeArquivo(periodo)}.xlsx`);
  } catch (e) { toast("⚠ " + e.message, "erro"); }
}
async function exportarPDF(periodo) {
  try {
    await carregarScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    const { jsPDF } = window.jspdf;
    const fmt = (v) => fmtBRL(v).replace(/\u2212/g, "-").replace(/\u00a0/g, " ");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const linhas = linhasDoPeriodo(periodo);
    const s = sumsFromOccurrences(linhas);
    let y = 18;
    const novaPagina = () => { doc.addPage(); y = 18; };
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text(`Livro-Caixa · ${nomePeriodo(periodo)}`, 14, y); y += 7;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(110);
    doc.text(`${(state.profile && state.profile.name) || ""} · gerado em ${brDate(todayISO())}`, 14, y); y += 10;
    doc.setTextColor(20); doc.setFontSize(11);
    doc.text(`Receitas: ${fmt(s.rec)}`, 14, y); doc.text(`Despesas: ${fmt(s.desp)}`, 80, y); doc.text(`Resultado: ${fmt(s.saldo)}`, 146, y); y += 10;
    if (periodo.tipo === "ano") {
      const r = resumoDoAno(periodo.ano);
      doc.setFont("helvetica", "bold"); doc.text("Mês a mês", 14, y); y += 6; doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      r.porMes.forEach((x) => { doc.text(monthLabel(x.mes), 14, y); doc.text(fmt(x.rec), 60, y, { align: "right" }); doc.text(fmt(x.desp), 100, y, { align: "right" }); doc.text(fmt(x.saldo), 140, y, { align: "right" }); y += 5; });
      y += 4;
      if (r.dedutiveis.length) {
        doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.text("Despesas dedutíveis (IR)", 14, y); y += 6; doc.setFont("helvetica", "normal"); doc.setFontSize(9);
        r.dedutiveis.forEach((x) => { if (y > 282) novaPagina(); doc.text(brDate(x.data), 14, y); doc.text(doc.splitTextToSize(`${x.tx.desc} (${x.tx.category})`, 120)[0], 36, y); doc.text(fmt(x.value), 196, y, { align: "right" }); y += 5; });
        y += 4;
      }
    }
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); if (y > 270) novaPagina(); doc.text("Lançamentos", 14, y); y += 6;
    doc.setFontSize(8.5); doc.setFont("helvetica", "bold");
    const cab = () => { doc.text("Data", 14, y); doc.text("Descrição", 34, y); doc.text("Categoria", 112, y); doc.text("Status", 150, y); doc.text("Valor", 196, y, { align: "right" }); y += 2; doc.setDrawColor(200); doc.line(14, y, 196, y); y += 4; doc.setFont("helvetica", "normal"); };
    cab();
    linhas.forEach((r) => {
      if (y > 285) { novaPagina(); doc.setFont("helvetica", "bold"); cab(); }
      doc.text(brDate(r.data || r.tx.date), 14, y);
      doc.text(doc.splitTextToSize(String(r.tx.desc || ""), 74)[0], 34, y);
      doc.text(doc.splitTextToSize(String(r.tx.category || ""), 36)[0], 112, y);
      doc.text(String(r.status || r.tx.status || ""), 150, y);
      doc.text(`${r.tx.type === "Despesa" ? "-" : "+"} ${fmt(r.value)}`, 196, y, { align: "right" });
      y += 4.6;
    });
    doc.save(`${nomeDeArquivo(periodo)}.pdf`);
  } catch (e) { toast("⚠ " + e.message, "erro"); }
}
function abrirExportar() {
  const f = { periodo: "mes", ano: new Date().getFullYear() };
  const draw = () => {
    const anos = [...new Set([new Date().getFullYear(), ...state.txs.map((t) => parseInt(String(t.date).slice(0, 4), 10)).filter(Boolean)])].sort((a, b) => b - a);
    openModal("Exportar lançamentos", `
      <div class="field"><label>Período</label>${chipGroup("exp-periodo", [`Mês (${monthLabel(state.month)})`, "Um ano", "Tudo"], f.periodo === "mes" ? `Mês (${monthLabel(state.month)})` : f.periodo === "ano" ? "Um ano" : "Tudo", "var(--char)")}</div>
      ${f.periodo === "ano" ? `<div class="field"><label>Ano</label><select id="exp-ano" class="filtro-select">${anos.map((a) => `<option ${a === f.ano ? "selected" : ""}>${a}</option>`).join("")}</select></div>` : ""}
      <div class="row-gap" style="margin-top:6px">
        <button class="btn char" id="exp-xlsx">Baixar Excel (.xlsx)</button>
        <button class="btn ghost" id="exp-pdf">Baixar PDF</button>
      </div>
      <p class="field-ajuda" style="margin-top:12px">O Excel traz uma aba com os lançamentos e outra com o total por categoria${f.periodo === "ano" ? ", além do mês a mês e das despesas dedutíveis" : ""}.</p>`);
    wireChipGroup("exp-periodo", (v) => { f.periodo = v.startsWith("Mês") ? "mes" : v === "Um ano" ? "ano" : "tudo"; draw(); });
    const ano = document.getElementById("exp-ano"); if (ano) ano.addEventListener("change", (e) => { f.ano = parseInt(e.target.value, 10); });
    const periodo = () => ({ tipo: f.periodo, ano: f.ano });
    document.getElementById("exp-xlsx").addEventListener("click", () => { exportarExcel(periodo()); closeModal(); });
    document.getElementById("exp-pdf").addEventListener("click", () => { exportarPDF(periodo()); closeModal(); });
  };
  draw();
}
