/* =======================================================================
   Importar: extrato do banco (CSV ou OFX) e dados do Livro-Caixa antigo.
   ======================================================================= */

/* ---------- leitura do arquivo (bancos brasileiros às vezes usam Windows-1252) ---------- */
function lerTexto(file, codificacao) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error("Não foi possível ler o arquivo.")); r.readAsText(file, codificacao); });
}
async function lerTextoDoExtrato(file) {
  let texto = await lerTexto(file, "utf-8");
  if (texto.includes("�") || /CHARSET:\s*1252|ENCODING:\s*USASCII/i.test(texto.slice(0, 400))) texto = await lerTexto(file, "windows-1252");
  return texto.replace(/^﻿/, "");
}

/* ---------- números e datas no formato brasileiro ---------- */
function numeroBR(v) {
  if (v === null || v === undefined) return NaN;
  let t = String(v).trim().replace(/R\$|\s/g, "");
  let negativo = false;
  if (/^\(.*\)$/.test(t)) { negativo = true; t = t.slice(1, -1); }
  if (/-$/.test(t)) { negativo = true; t = t.slice(0, -1); }
  if (t.startsWith("-")) { negativo = !negativo; t = t.slice(1); }
  if (t.startsWith("+")) t = t.slice(1);
  if (/^\d{1,3}(\.\d{3})*,\d+$/.test(t) || /^\d+,\d+$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})*\.\d+$/.test(t)) t = t.replace(/,/g, "");
  const n = parseFloat(t);
  return isNaN(n) ? NaN : (negativo ? -n : n);
}
function dataBR(v) {
  const t = String(v || "").trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) { const ano = m[3].length === 2 ? "20" + m[3] : m[3]; return `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  m = t.match(/^(\d{4})(\d{2})(\d{2})/); // OFX: 20261018120000[-3:BRT]
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/* ---------- OFX ---------- */
function lerOFX(texto) {
  const blocos = texto.split(/<STMTTRN>/i).slice(1);
  const campo = (bloco, nome) => { const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, "i")); return m ? m[1].trim() : ""; };
  return blocos.map((b) => {
    const valor = numeroBR(campo(b, "TRNAMT").replace(",", "."));
    return { data: dataBR(campo(b, "DTPOSTED")), descricao: campo(b, "MEMO") || campo(b, "NAME") || "Lançamento", valor, idBanco: campo(b, "FITID") };
  }).filter((l) => l.data && !isNaN(l.valor));
}

/* ---------- Excel (.xlsx/.xls): vira a mesma tabela do CSV ---------- */
async function lerPlanilhaExcel(file) {
  await carregarScript("https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  // a aba "Lançamentos" (planilha exportada daqui) ou a primeira
  const nome = wb.SheetNames.find((n) => /lan[cç]amento|extrato|movimenta/i.test(n)) || wb.SheetNames[0];
  const matriz = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: "", raw: true });
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const tabela = matriz.map((l) => l.map((c) => (c instanceof Date ? iso(new Date(c.getTime() + 12 * 3600 * 1000)) : typeof c === "number" ? String(c) : String(c ?? "").trim())));
  let idx = tabela.findIndex((l) => l.some((c) => /data|date/i.test(c)) && l.some((c) => /valor|amount|quantia|montante|cr[ée]dito|d[ée]bito/i.test(c)));
  if (idx < 0) idx = 0;
  return { cabecalho: tabela[idx] || [], linhas: tabela.slice(idx + 1).filter((l) => l.some((c) => c)) };
}

/* ---------- CSV ---------- */
function lerCSV(texto) {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) return { cabecalho: [], linhas: [] };
  const amostra = linhas.slice(0, 5).join("\n");
  const sep = [";", "\t", ","].sort((a, b) => amostra.split(b).length - amostra.split(a).length)[0];
  const quebrar = (linha) => {
    const out = []; let atual = ""; let aspas = false;
    for (let i = 0; i < linha.length; i++) {
      const ch = linha[i];
      if (ch === '"') { if (aspas && linha[i + 1] === '"') { atual += '"'; i++; } else aspas = !aspas; }
      else if (ch === sep && !aspas) { out.push(atual.trim()); atual = ""; }
      else atual += ch;
    }
    out.push(atual.trim());
    return out;
  };
  const tabela = linhas.map(quebrar);
  // cabeçalho: a primeira linha que tem algo parecido com "data" e "valor"
  let idx = tabela.findIndex((l) => l.some((c) => /data|date/i.test(c)) && l.some((c) => /valor|amount|quantia|montante|cr[ée]dito|d[ée]bito/i.test(c)));
  if (idx < 0) idx = 0;
  return { cabecalho: tabela[idx], linhas: tabela.slice(idx + 1).filter((l) => l.some((c) => c)) };
}
function adivinharColunas(cabecalho) {
  const acha = (re) => cabecalho.findIndex((c) => re.test(semAcento(c)));
  return {
    data: acha(/^data|date|dt\b/),
    descricao: acha(/descri|hist|lanca|memo|estabelec|titulo|title|detalhe|identifica/),
    valor: acha(/^valor|amount|quantia|montante|valor \(r\$\)/),
    credito: acha(/credito|entrada/),
    debito: acha(/debito|saida/),
    // planilha do próprio Livro-Caixa (ou parecida): tipo, categoria, escopo, forma e status vêm prontos
    tipo: acha(/^tipo$/), categoria: acha(/^categoria/), escopo: acha(/^escopo/), forma: acha(/^forma/), status: acha(/^status|^situa/),
  };
}

/* ---------- categoria pelo nome (e pelo que a pessoa já usou antes) ---------- */
const PISTAS_CATEGORIA = [
  [/mercad|supermerc|padaria|ifood|restaur|lanchon|acougue|hortifr|rappi|burger|pizza|cafe/, "Alimentação"],
  [/uber|\b99\b|99app|posto|combust|estacion|pedagio|metro|onibus|shell|ipiranga|petrobras/, "Transporte"],
  [/farmac|drogar|droga raia|hospital|clinic|unimed|amil|laborat|odonto|medic/, "Saúde"],
  [/escola|colegio|curso|faculd|universid|udemy|alura|livrar/, "Educação"],
  [/netflix|spotify|prime video|disney|hbo|max\b|deezer|youtube premium|icloud|google one|assinatura/, "Assinaturas"],
  [/aluguel|condomin|energia|enel|cemig|copel|light|sabesp|agua|gas natural|comgas|internet|vivo|claro|\btim\b|oi fibra/, "Moradia"],
  [/cinema|ingresso|show|bar\b|viagem|hotel|airbnb|steam|playstation/, "Lazer"],
  [/iof|imposto|darf|das\b|ipva|iptu/, "Impostos"],
];
function adivinharCategoria(descricao, tipo) {
  const d = semAcento(descricao);
  const igual = state.txs.find((tx) => tx.type === tipo && semAcento(tx.desc) === d);
  if (igual) return igual.category;
  if (tipo === "Receita") {
    if (/salario|folha|pagto salar/.test(d)) return "Salário";
    if (/rendimento|juros|dividend/.test(d)) return "Rendimentos";
    if (/reembolso|estorno/.test(d)) return "Reembolso";
    return "Outros";
  }
  const pista = PISTAS_CATEGORIA.find(([re]) => re.test(d));
  return pista && categoriasDe("Despesa").includes(pista[1]) ? pista[1] : "Outros";
}

/* ---------- tela de importação do extrato ---------- */
function abrirImportarExtrato() {
  const estado = { etapa: "arquivo", linhas: [], csv: null, colunas: null, positivosSaoDespesa: false, contaId: state.contas[0] ? state.contas[0].id : "", forma: "Pix", cardId: state.cards[0] ? state.cards[0].id : "", scope: "Pessoal", erro: "" };
  const montarLinhas = () => {
    let brutas = [];
    if (estado.csv) {
      const c = estado.colunas;
      brutas = estado.csv.linhas.map((l) => {
        let valor = c.valor >= 0 ? numeroBR(l[c.valor]) : NaN;
        if (isNaN(valor) && (c.credito >= 0 || c.debito >= 0)) {
          const cr = c.credito >= 0 ? numeroBR(l[c.credito]) : NaN, db = c.debito >= 0 ? numeroBR(l[c.debito]) : NaN;
          valor = (!isNaN(cr) && cr ? Math.abs(cr) : 0) - (!isNaN(db) && db ? Math.abs(db) : 0);
        }
        // coluna "Tipo" (Receita/Despesa) manda no sinal: na planilha exportada a despesa já vem negativa
        if (c.tipo >= 0 && !isNaN(valor)) { const t = semAcento(l[c.tipo] || ""); if (/despesa|saida|debito/.test(t)) valor = -Math.abs(valor); else if (/receita|entrada|credito/.test(t)) valor = Math.abs(valor); }
        const extra = {};
        if (c.categoria >= 0 && l[c.categoria]) extra.categoria = String(l[c.categoria]).trim();
        if (c.escopo >= 0 && /empresa/i.test(l[c.escopo])) extra.scope = "Empresa"; else if (c.escopo >= 0 && /pessoal/i.test(l[c.escopo])) extra.scope = "Pessoal";
        if (c.forma >= 0) { const f = CONTAS.find((k) => semAcento(k) === semAcento(l[c.forma] || "")); if (f) extra.forma = f; }
        if (c.status >= 0) { const st = semAcento(l[c.status] || ""); extra.status = /pend|a pagar|a receber|aberto/.test(st) ? "Pendente" : /agend/.test(st) ? "Agendado" : "Pago"; }
        return { data: dataBR(l[c.data]), descricao: (l[c.descricao] || "").trim() || "Lançamento", valor, idBanco: "", ...extra };
      }).filter((l) => l.data && !isNaN(l.valor) && l.valor !== 0);
    } else {
      brutas = estado.ofx;
    }
    estado.linhas = brutas.map((l) => {
      const valor = estado.positivosSaoDespesa ? -l.valor : l.valor;
      const tipo = valor >= 0 ? "Receita" : "Despesa";
      const chave = l.idBanco || `${l.data}|${Math.abs(valor).toFixed(2)}|${semAcento(l.descricao)}`;
      const repetido = state.txs.some((tx) => tx.importId === chave || (tx.date === l.data && Math.abs((Number(tx.value) || 0) - Math.abs(valor)) < 0.005 && semAcento(tx.desc) === semAcento(l.descricao)));
      const categoria = l.categoria && categoriasDe(tipo).includes(l.categoria) ? l.categoria : adivinharCategoria(l.descricao, tipo);
      return { ...l, valor: Math.abs(valor), tipo, categoria, chave, repetido, incluir: !repetido };
    });
  };
  const draw = () => {
    if (estado.etapa === "arquivo") {
      openModal("Importar extrato do banco", `
        <p class="modal-texto">No app ou site do banco, exporte o extrato em <b>OFX</b> (melhor opção, quase todo banco tem), <b>CSV</b> ou <b>Excel (.xlsx)</b>. Depois escolha o arquivo aqui.</p>
        <p class="modal-texto">Também dá para trazer uma <b>planilha de lançamentos</b>: a que você baixa em Exportar volta igualzinha (tipo, categoria, escopo, forma e status).</p>
        <label class="btn char save-btn" style="display:block;text-align:center">Escolher arquivo<input type="file" id="f-extrato" accept=".ofx,.csv,.txt,.xlsx,.xls,text/csv,application/x-ofx" hidden /></label>
        <button class="btn ghost" id="f-modelo" style="display:block;width:100%;margin-top:8px">Baixar planilha modelo (.xlsx)</button>
        ${estado.erro ? `<p class="aviso-suave" style="margin-top:12px">⚠ ${escapeHtml(estado.erro)}</p>` : ""}
        <p class="field-ajuda" style="margin-top:12px">Nada é lançado antes de você conferir. Lançamentos que já existem aparecem desmarcados.</p>`);
      document.getElementById("f-extrato").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          if (/\.xlsx?$/i.test(file.name)) {
            estado.csv = await lerPlanilhaExcel(file); estado.colunas = adivinharColunas(estado.csv.cabecalho); estado.ofx = null;
            if (!estado.csv.linhas.length) throw new Error("A planilha está vazia.");
            if (estado.colunas.data < 0 || estado.colunas.descricao < 0 || (estado.colunas.valor < 0 && estado.colunas.credito < 0 && estado.colunas.debito < 0)) { estado.etapa = "colunas"; draw(); return; }
            estado.erro = ""; montarLinhas(); estado.etapa = "conferir"; draw(); return;
          }
          const texto = await lerTextoDoExtrato(file);
          if (/<OFX>|<STMTTRN>/i.test(texto)) {
            estado.ofx = lerOFX(texto); estado.csv = null;
            if (!estado.ofx.length) throw new Error("Não encontrei lançamentos nesse arquivo OFX.");
          } else {
            estado.csv = lerCSV(texto); estado.colunas = adivinharColunas(estado.csv.cabecalho);
            if (!estado.csv.linhas.length) throw new Error("O arquivo está vazio.");
            if (estado.colunas.data < 0 || estado.colunas.descricao < 0 || (estado.colunas.valor < 0 && estado.colunas.credito < 0 && estado.colunas.debito < 0)) { estado.etapa = "colunas"; draw(); return; }
          }
          estado.erro = ""; montarLinhas(); estado.etapa = "conferir"; draw();
        } catch (err) { estado.erro = err.message; draw(); }
      });
      document.getElementById("f-modelo").addEventListener("click", baixarModeloLancamentos);
    } else if (estado.etapa === "colunas") {
      const opcoes = (sel) => `<option value="-1">—</option>` + estado.csv.cabecalho.map((c, i) => `<option value="${i}" ${i === sel ? "selected" : ""}>${escapeHtml(c || `Coluna ${i + 1}`)}</option>`).join("");
      openModal("Quais colunas são quais?", `
        <p class="modal-texto">Não reconheci as colunas desse arquivo sozinho. Indique abaixo:</p>
        <div class="field"><label>Data</label><select id="col-data" class="filtro-select">${opcoes(estado.colunas.data)}</select></div>
        <div class="field"><label>Descrição</label><select id="col-desc" class="filtro-select">${opcoes(estado.colunas.descricao)}</select></div>
        <div class="field"><label>Valor</label><select id="col-valor" class="filtro-select">${opcoes(estado.colunas.valor)}</select></div>
        <p class="field-ajuda">Primeira linha: ${escapeHtml((estado.csv.linhas[0] || []).join(" | "))}</p>
        <button class="btn char save-btn" id="f-ok">Continuar</button>`);
      document.getElementById("f-ok").addEventListener("click", () => {
        estado.colunas = { ...estado.colunas, data: +document.getElementById("col-data").value, descricao: +document.getElementById("col-desc").value, valor: +document.getElementById("col-valor").value };
        montarLinhas();
        if (!estado.linhas.length) { estado.erro = "Com essas colunas não consegui ler nenhum lançamento."; estado.etapa = "arquivo"; } else estado.etapa = "conferir";
        draw();
      });
    } else {
      const sel = estado.linhas.filter((l) => l.incluir);
      const noCartao = estado.forma === Calculos.CARTAO;
      openModal("Conferir antes de importar", `
        ${estado.csv && estado.colunas && (estado.colunas.escopo >= 0 || estado.colunas.forma >= 0 || estado.colunas.status >= 0) ? `<p class="field-ajuda" style="margin-top:0">A planilha já traz ${[estado.colunas.forma >= 0 ? "a forma" : "", estado.colunas.escopo >= 0 ? "o escopo" : "", estado.colunas.status >= 0 ? "o status" : ""].filter(Boolean).join(", ")} de cada linha: as escolhas abaixo valem só para as linhas em branco.</p>` : ""}
        <div class="importar-opcoes">
          <label class="integ-check"><input type="checkbox" id="f-invertido" ${estado.positivosSaoDespesa ? "checked" : ""} /> É fatura de cartão (valores positivos são compras)</label>
          <div class="field"><label>Forma de pagamento</label>${chipGroup("imp-forma", CONTAS, estado.forma, "var(--char)")}</div>
          ${noCartao && state.cards.length ? `<div class="field"><label>Cartão</label>${chipGroup("imp-cartao", state.cards.map((c) => c.name), (state.cards.find((c) => c.id === estado.cardId) || {}).name, "var(--char)")}</div>` : ""}
          ${!noCartao && state.contas.length ? `<div class="field"><label>Conta</label>${chipGroup("imp-conta", [...state.contas.map((k) => k.name), "Nenhuma"], (state.contas.find((k) => k.id === estado.contaId) || {}).name || "Nenhuma", "var(--char)")}</div>` : ""}
          <div class="field"><label>Escopo</label>${chipGroup("imp-escopo", ["Pessoal", "Empresa"], estado.scope, estado.scope === "Empresa" ? COLORS.empresa : COLORS.pessoal)}</div>
        </div>
        <div class="importar-tabela"><table><thead><tr><th><input type="checkbox" id="imp-todos" ${sel.length === estado.linhas.length ? "checked" : ""} aria-label="Marcar todos" /></th><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead>
          <tbody>${estado.linhas.map((l, i) => `<tr class="${l.repetido ? "repetido" : ""}" data-i="${i}">
            <td><input type="checkbox" class="imp-inc" ${l.incluir ? "checked" : ""} /></td>
            <td class="mono" style="font-size:12px">${brDate(l.data)}</td>
            <td>${escapeHtml(l.descricao)}${l.repetido ? ` <span class="tag ajuste">já existe</span>` : ""}</td>
            <td><select class="imp-cat filtro-select">${categoriasDe(l.tipo).map((c) => `<option ${c === l.categoria ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}</select></td>
            <td class="mono ${l.tipo === "Receita" ? "val-receita" : "val-despesa"}" style="white-space:nowrap">${l.tipo === "Receita" ? "+" : "−"} ${fmtBRL(l.valor)}</td></tr>`).join("")}</tbody></table></div>
        <button class="btn char save-btn" id="f-importar" ${sel.length ? "" : "disabled"}>Importar ${sel.length} lançamento${sel.length === 1 ? "" : "s"}</button>`);
      document.querySelector(".modal-box").classList.add("modal-largo");
      document.getElementById("f-invertido").addEventListener("change", (e) => { estado.positivosSaoDespesa = e.target.checked; if (e.target.checked) estado.forma = Calculos.CARTAO; montarLinhas(); draw(); });
      wireChipGroup("imp-forma", (v) => { estado.forma = v; draw(); });
      wireChipGroup("imp-cartao", (n) => { estado.cardId = state.cards.find((c) => c.name === n).id; draw(); });
      wireChipGroup("imp-conta", (n) => { estado.contaId = (state.contas.find((k) => k.name === n) || {}).id || ""; draw(); });
      wireChipGroup("imp-escopo", (v) => { estado.scope = v; draw(); });
      document.getElementById("imp-todos").addEventListener("change", (e) => { estado.linhas.forEach((l) => { l.incluir = e.target.checked; }); draw(); });
      document.querySelectorAll(".imp-inc").forEach((cb) => cb.addEventListener("change", (e) => { estado.linhas[+e.target.closest("tr").dataset.i].incluir = e.target.checked; draw(); }));
      document.querySelectorAll(".imp-cat").forEach((s) => s.addEventListener("change", (e) => { estado.linhas[+e.target.closest("tr").dataset.i].categoria = e.target.value; }));
      document.getElementById("f-importar").addEventListener("click", () => {
        const novos = estado.linhas.filter((l) => l.incluir).map((l) => {
          const forma = l.forma || estado.forma;
          const tx = { id: uid(), date: l.data, desc: l.descricao.slice(0, 140), type: l.tipo, category: l.categoria, scope: l.scope || estado.scope, account: forma, status: l.status || "Pago", value: l.valor, recurrence: "unico", importId: l.chave };
          if (forma === Calculos.CARTAO) { if (estado.cardId) tx.cardId = estado.cardId; } else if (estado.contaId) tx.contaId = estado.contaId;
          return tx;
        });
        state.txs = [...novos, ...state.txs];
        saveTxs(); closeModal();
        const meses = [...new Set(novos.map((t) => Calculos.anoMes(t.date)))].sort();
        if (meses.length) state.month = meses[meses.length - 1];
        render();
        toast(`${novos.length} lançamento${novos.length === 1 ? "" : "s"} importado${novos.length === 1 ? "" : "s"}.`, "ok");
      });
    }
  };
  draw();
}

// modelo com as colunas que voltam inteiras (as mesmas da exportação)
async function baixarModeloLancamentos() {
  try {
    await carregarScript("https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js");
    const hoje = todayISO();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Data", "Descrição", "Tipo", "Categoria", "Escopo", "Forma", "Status", "Valor"],
      [brDate(hoje), "Salário", "Receita", "Salário", "Pessoal", "Conta Corrente", "Pago", 5000],
      [brDate(hoje), "Aluguel", "Despesa", "Moradia", "Pessoal", "Pix", "Pendente", -1800],
      [brDate(hoje), "Venda para cliente", "Receita", "Vendas", "Empresa", "Pix", "Pago", 750],
    ]);
    ws["!cols"] = [{ wch: 11 }, { wch: 30 }, { wch: 9 }, { wch: 18 }, { wch: 9 }, { wch: 18 }, { wch: 10 }, { wch: 12 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Lançamentos");
    XLSX.writeFile(wb, "modelo-lancamentos-livro-caixa.xlsx");
  } catch (e) { toast("⚠ " + e.message, "erro"); }
}

/* ---------- dados do Livro-Caixa antigo ---------- */
function abrirImportarAntigo() {
  openModal("Trazer dados do Livro-Caixa antigo", `
    <ol class="passos">
      <li>Abra o Livro-Caixa antigo, no mesmo navegador em que você usava.</li>
      <li>Clique em <b>Exportar meus dados</b>, no fim da barra lateral. Um arquivo <code>.json</code> é baixado.</li>
      <li>Escolha esse arquivo aqui:</li>
    </ol>
    <label class="btn char save-btn" style="display:block;text-align:center">Escolher arquivo<input type="file" id="f-antigo" accept=".json,application/json" hidden /></label>
    <p class="field-ajuda" id="antigo-status" style="margin-top:10px"></p>`);
  document.getElementById("f-antigo").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const status = document.getElementById("antigo-status");
    try {
      const json = JSON.parse(await lerTexto(file, "utf-8"));
      // aceita o arquivo do botão "Exportar" e também as chaves do navegador coladas direto
      const d = json.app === "livro-caixa-antigo" ? json.dados : {
        transacoes: json.finance_transactions || json.transacoes, cartoes: json.finance_cards || json.cartoes,
        investimentos: json.finance_investments || json.investimentos, objetivos: json.finance_goals || json.objetivos,
      };
      const lista = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
      const dados = { transacoes: lista(d.transacoes), cartoes: lista(d.cartoes), investimentos: lista(d.investimentos), objetivos: lista(d.objetivos) };
      const total = Object.values(dados).reduce((a, l) => a + l.length, 0);
      if (!total) throw new Error("Esse arquivo não tem dados do Livro-Caixa.");
      confirmarImportacaoAntiga(dados);
    } catch (err) {
      status.textContent = "⚠ " + (err instanceof SyntaxError ? "Esse arquivo não é o exportado pelo Livro-Caixa antigo." : err.message);
    }
  });
}
function confirmarImportacaoAntiga(dados) {
  const nomes = { transacoes: "lançamentos", cartoes: "cartões", investimentos: "investimentos", objetivos: "objetivos" };
  const temAlgo = state.txs.length + state.cards.length + state.invs.length + state.goals.length > 0;
  openModal("Trazer dados do Livro-Caixa antigo", `
    <p class="modal-texto">Encontrei no arquivo:</p>
    <ul class="lista-simples">${Object.entries(dados).filter(([, l]) => l.length).map(([k, l]) => `<li><b>${l.length}</b> ${nomes[k]}</li>`).join("")}</ul>
    <p class="field-ajuda">Se você nunca usou o app antigo de verdade, ele pode ter só os dados de exemplo que vinham nele.</p>
    ${temAlgo ? `<div class="alcance-opcoes">
      <button class="alcance-opcao" data-modo="juntar"><strong>Juntar com o que já tenho aqui</strong><span>Os dados antigos entram junto com os atuais.</span></button>
      <button class="alcance-opcao" data-modo="substituir"><strong>Substituir</strong><span>Apaga lançamentos, cartões, investimentos e objetivos atuais e fica só com os do arquivo.</span></button>
    </div>` : `<button class="btn char save-btn" data-modo="juntar">Importar</button>`}`);
  document.querySelectorAll("[data-modo]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.modo === "substituir" && !confirm("Apagar os dados atuais e ficar só com os do arquivo?")) return;
    const juntar = b.dataset.modo === "juntar";
    const mapa = { transacoes: "txs", cartoes: "cards", investimentos: "invs", objetivos: "goals" };
    Object.entries(mapa).forEach(([secao, chave]) => {
      const atuais = juntar ? state[chave] : [];
      const ids = new Set(atuais.map((x) => x.id));
      const novos = dados[secao].map((x) => ({ ...x, id: x.id && !ids.has(x.id) ? String(x.id) : uid() }));
      state[chave] = [...atuais, ...novos];
      persist(secao);
    });
    closeModal(); render();
    toast("Dados do Livro-Caixa antigo importados.", "ok");
  }));
}

/* ---------- cartão "Importar dados" em Meu perfil ---------- */
TELAS.importar = {
  ordemNoPerfil: 40,
  noPerfil() {
    return `<div class="card" style="margin-bottom:20px">
      <h2 class="section-title" style="border-color:var(--char)">Importar dados</h2>
      <p class="stat-sub" style="margin-top:0">Traga o histórico que você já tem, sem digitar tudo de novo.</p>
      <div class="row-gap">
        <button class="btn ghost" id="imp-extrato-perfil">⇪ Extrato do banco ou planilha (OFX, CSV ou Excel)</button>
        <button class="btn ghost" id="imp-antigo-perfil">⇪ Livro-Caixa antigo</button>
      </div>
    </div>`;
  },
  ligarNoPerfil() {
    const a = document.getElementById("imp-extrato-perfil"); if (a) a.addEventListener("click", abrirImportarExtrato);
    const b = document.getElementById("imp-antigo-perfil"); if (b) b.addEventListener("click", abrirImportarAntigo);
  },
};
