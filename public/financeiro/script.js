/* =======================================================================
   Livro-Caixa — Controle financeiro (Pessoal & Empresa)
   Vanilla JS. Os dados ficam na conta do usuário (PostgreSQL, rota /api/financeiro)
   e as vendas/comissões do CRM entram aqui como receitas, pra mostrar o lucro.
   ======================================================================= */

/* ----------------------------------------------------------------------- */
/* Personagens & perfis                                                    */
/* ----------------------------------------------------------------------- */
const PROFILE_COLORS = {
  organizadora: { primary: "#2F6F4E", soft: "#E3EEE7", label: "Organizador(a)" },
  recomeco:     { primary: "#2E5FA3", soft: "#E1E9F5", label: "Recomeço" },
  consumista:   { primary: "#C23B72", soft: "#F6E1EB", label: "Consumista" },
  investidora:  { primary: "#C97A2E", soft: "#F5E5D2", label: "Investidor(a)" },
};

const CHARACTERS = [
  { id: "lily",     name: "Lily",     title: "A Empresária",    profile: "organizadora", gender: "f", desc: "Organizada e estratégica, constrói seu negócio e o futuro com inteligência." },
  { id: "julia",    name: "Júlia",    title: "A Endividada",    profile: "recomeco",     gender: "f", desc: "Batalhadora e determinada, está reescrevendo sua história e saindo das dívidas." },
  { id: "maria",    name: "Maria",    title: "A Consumista",    profile: "consumista",   gender: "f", desc: "Apaixonada por compras e experiências, aprendendo a equilibrar desejos e prioridades." },
  { id: "sofia",    name: "Sofia",    title: "A Investidora",   profile: "investidora",  gender: "f", desc: "Focada e visionária, investe com estratégia para conquistar liberdade financeira." },
  { id: "mateus",   name: "Mateus",   title: "O Organizado",    profile: "organizadora", gender: "m", desc: "Disciplinado e planejador, faz o dinheiro trabalhar por seus sonhos." },
  { id: "jonathan", name: "Jonathan", title: "O Endividado",    profile: "recomeco",     gender: "m", desc: "Trabalhador, mas perdido nas dívidas. Está aprendendo a recomeçar." },
  { id: "lucas",    name: "Lucas",    title: "O Consumista",    profile: "consumista",   gender: "m", desc: "Ama tecnologia e conforto, mas está descobrindo que controle financeiro traz liberdade." },
  { id: "rafael",   name: "Rafael",   title: "O Investidor",    profile: "investidora",  gender: "m", desc: "Ambicioso e estratégico, investe hoje para viver a vida que sempre sonhou amanhã." },
];

const TIPS = {
  organizadora: [
    "Continue registrando cada receita e despesa — é isso que te dá controle total.",
    "Que tal criar um orçamento mensal por categoria? Você já tem a disciplina pra seguir.",
    "Revise suas assinaturas: pequenos gastos fixos somam bastante no fim do mês.",
    "Você está no caminho certo. Considere automatizar uma poupança mensal.",
    "Organização é seu ponto forte — aproveite pra planejar os próximos 3 meses.",
  ],
  recomeco: [
    "Um passo de cada vez. Foque em quitar a dívida com maior juros primeiro.",
    "Já pensou em renegociar suas dívidas? Muitas vezes dá pra conseguir condições melhores.",
    "Celebre pequenas vitórias: cada real guardado é um passo pra fora das dívidas.",
    "Evite abrir novos parcelamentos por enquanto — foco em equilibrar o que já existe.",
    "Recomeçar não é fracasso, é coragem. Você está indo bem.",
  ],
  consumista: [
    "Antes de comprar, espere 24h. Muita vontade passa com o tempo.",
    "Que tal definir um limite mensal só pra 'gastos de desejo'? Sem culpa, com controle.",
    "Separe uma meta divertida (tipo uma viagem) pra canalizar a vontade de gastar.",
    "Revise seu extrato de cartão — as pequenas compras impulsivas costumam ser as maiores vilãs.",
    "Controlar não é deixar de viver — é viver sem sustos no fim do mês.",
  ],
  investidora: [
    "Considere diversificar entre renda fixa e variável de acordo com seu perfil de risco.",
    "Reinvista parte dos rendimentos — o efeito composto é seu maior aliado.",
    "Revise a rentabilidade dos seus investimentos a cada trimestre.",
    "Separe uma reserva de emergência antes de aumentar posições de risco.",
    "Cada real investido hoje trabalha por você amanhã. Continue assim.",
  ],
};


/* ----------------------------------------------------------------------- */
/* Constantes gerais                                                       */
/* ----------------------------------------------------------------------- */
// Cores como variáveis do CSS: assim valem no modo claro e no escuro (ver styles.css)
const COLORS = { pessoal: "var(--pessoal)", empresa: "var(--empresa)", gold: "var(--gold)", red: "var(--red)", ink: "var(--ink)" };

const CATEGORIAS_DESPESA = ["Moradia","Alimentação","Transporte","Saúde","Educação","Lazer","Assinaturas","Impostos","Cartão de Crédito","Dívidas","Marketing","Fornecedores","Salários","Comissões","Ferramentas/Software","Aluguel Comercial","Outros"];
const CATEGORIAS_RECEITA = ["Salário","Freelance","Vendas","Serviços Prestados","Comissão","Dividendos","Rendimentos","Reembolso","Outros"];
// Categorias dedutíveis no Imposto de Renda (resumo anual) — as personalizadas podem ser marcadas também
const CATEGORIAS_DEDUTIVEIS = ["Saúde", "Educação"];
// Padrão + as que a pessoa criou (em Meu perfil → Categorias), com "Outros" sempre por último
function categoriasDe(tipo) {
  const base = tipo === "Receita" ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA;
  const minhas = (state.categorias || []).filter((c) => c.tipo === tipo).map((c) => c.nome).filter((n) => n && !base.includes(n));
  return [...base.filter((c) => c !== "Outros"), ...minhas, "Outros"];
}
function ehDedutivel(categoria) {
  return CATEGORIAS_DEDUTIVEIS.includes(categoria) || (state.categorias || []).some((c) => c.nome === categoria && c.dedutivel);
}
const CONTAS = ["Cartão de Crédito","Conta Corrente","Dinheiro","Pix","Boleto"];
const TIPOS_INVEST = ["Renda Fixa","Renda Variável","Fundos","Cripto","Previdência","Outros"];

const uid = () => Math.random().toString(36).slice(2, 10);
const fmtBRL = (n) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
const fmtPct = (n) => `${((n || 0) * 100).toFixed(1).replace(".", ",")}%`;

const monthKey = (d) => (d || "").slice(0, 7);
const brDate = (d) => (d || "").split("-").reverse().join("/");
const monthLabel = (ym) => {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  const meses = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return `${meses[parseInt(m, 10) - 1]}/${y}`;
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const escapeHtml = (s) => (s || "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const addMonths = (ym, n) => {
  const [y, m] = ym.split("-").map(Number);
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
};
const monthsBetween = (a, b) => {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb * 12 + mb) - (ya * 12 + ma);
};

/* ----------------------------------------------------------------------- */
/* Sessão e servidor                                                        */
/* Usa o mesmo login do CRM (token salvo no navegador pelo login.html).     */
/* ----------------------------------------------------------------------- */
const API_BASE = "/api";
const sessionToken = localStorage.getItem("token");
if (!sessionToken) window.location.href = "../login.html";

function sair() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "../login.html";
}
// Servidor acordando ou ocupado (502/503/504): tenta de novo sozinho, sem deslogar.
// GET sempre pode repetir; gravações só quando o servidor avisa que nem chegaram a rodar.
async function api(method, path, body, tentativa = 0) {
  const opts = { method, headers: { Authorization: "Bearer " + sessionToken } };
  if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  const res = await fetch(API_BASE + path, opts);
  if (res.status === 401) { sair(); throw new Error("Sessão expirada."); }
  if (res.status === 402) { window.location.href = "../assinatura.html?de=financeiro"; throw new Error("Sua assinatura não está ativa."); }
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    const acordando = [502, 503, 504].includes(res.status) && (method === "GET" || (data && data.tentarDeNovo));
    if (acordando && tentativa < 2) {
      await new Promise((ok) => setTimeout(ok, tentativa ? 2500 : 1000));
      return api(method, path, body, tentativa + 1);
    }
    throw new Error((data && data.error) || (acordando ? "O servidor está acordando. Tente de novo em alguns segundos." : "Erro de comunicação com o servidor."));
  }
  return data;
}

const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

const state = {
  tab: "dashboard",
  month: mesAtual(),
  scopeFilter: "Todos",
  txs: [],
  cards: [],
  invs: [],
  goals: [],
  profile: null,
  config: { integracaoCrm: "vendas", descontarComissoes: false },
  contas: [],
  transferencias: [],
  dividas: [],
  orcamentos: [],
  categorias: [],
  filtros: { texto: "", tipo: "", categoria: "", status: "", forma: "", todosMeses: false },
  crm: { columns: [], cards: [], contratos: [], carregado: false, erro: null },
  user: null,
};

/* Salvamento: cada alteração marca a seção como "pendente" e, depois de uma pausa
   curta, manda só as seções alteradas pro servidor. Se falhar (sem internet, etc.),
   tenta de novo sozinho e avisa no rodapé da barra lateral. */
const SECAO_ESTADO = { transacoes: "txs", cartoes: "cards", investimentos: "invs", objetivos: "goals", perfil: "profile", config: "config", contas: "contas", transferencias: "transferencias", dividas: "dividas", orcamentos: "orcamentos", categorias: "categorias" };
const salvamento = { pendentes: new Set(), timer: null, salvando: false, erro: null };
function persist(secao) {
  salvamento.pendentes.add(secao);
  clearTimeout(salvamento.timer);
  salvamento.timer = setTimeout(enviarPendentes, 500);
  atualizarStatusSalvamento();
}
async function enviarPendentes() {
  if (salvamento.salvando) { salvamento.timer = setTimeout(enviarPendentes, 400); return; }
  if (!salvamento.pendentes.size) return;
  salvamento.salvando = true;
  atualizarStatusSalvamento();
  const secoes = Array.from(salvamento.pendentes);
  salvamento.pendentes.clear();
  const falharam = [];
  for (const secao of secoes) {
    // carregadoEm: o servidor não apaga as receitas que o CRM criou depois que esta tela carregou
    try { await api("PUT", `/financeiro/${secao}`, { valor: state[SECAO_ESTADO[secao]], carregadoEm: secao === "transacoes" ? state.carregadoEm : undefined }); }
    catch (e) { falharam.push(secao); salvamento.erro = e.message; }
  }
  salvamento.salvando = false;
  if (falharam.length) {
    falharam.forEach((sec) => salvamento.pendentes.add(sec));
    salvamento.timer = setTimeout(enviarPendentes, 5000);
  } else {
    salvamento.erro = null;
  }
  atualizarStatusSalvamento();
}
function atualizarStatusSalvamento() {
  const el = document.getElementById("save-status");
  if (!el) return;
  // só aparece quando algo deu errado (salvar é automático e não precisa de aviso)
  const comErro = !!(salvamento.erro && salvamento.pendentes.size);
  el.textContent = comErro ? "⚠ Não foi possível salvar — tentando de novo…" : "";
  el.className = comErro ? "save-status erro" : "save-status";
  el.parentElement.hidden = !comErro;
}
window.addEventListener("beforeunload", (e) => {
  if (salvamento.pendentes.size || salvamento.salvando) { e.preventDefault(); e.returnValue = ""; }
});

function saveTxs() { persist("transacoes"); }
function saveCards() { persist("cartoes"); }
function saveInvs() { persist("investimentos"); }
function saveGoals() { persist("objetivos"); }
function saveProfile() { persist("perfil"); }
function saveConfig() { persist("config"); }
function saveContas() { persist("contas"); }
function saveTransferencias() { persist("transferencias"); }
function saveDividas() { persist("dividas"); }
function saveOrcamentos() { persist("orcamentos"); }
function saveCategorias() { persist("categorias"); }
// Espera tudo que está pendente chegar no servidor (antes de a IA gravar algo, por exemplo)
async function salvarTudoAgora() {
  clearTimeout(salvamento.timer);
  for (let i = 0; i < 20 && (salvamento.salvando || salvamento.pendentes.size); i++) {
    if (!salvamento.salvando) await enviarPendentes();
    else await new Promise((ok) => setTimeout(ok, 150));
  }
}

/* ----------------------------------------------------------------------- */
/* Integração com o CRM                                                     */
/* Nada é copiado: as vendas e comissões são lidas do CRM a cada abertura e */
/* entram nos cálculos como lançamentos "virtuais" (só leitura, selo CRM).  */
/* ----------------------------------------------------------------------- */
async function carregarCrm() {
  try {
    const [board, comissoes] = await Promise.all([api("GET", "/board"), api("GET", "/comissoes")]);
    state.crm = { columns: board.columns || [], cards: board.cards || [], contratos: comissoes.contratos || [], carregado: true, erro: null };
  } catch (e) {
    state.crm = { columns: [], cards: [], contratos: [], carregado: false, erro: e.message };
  }
}
function modoIntegracao() { return (state.config && state.config.integracaoCrm) || "vendas"; }
// mês de venda do card: o campo "Mês de venda" do CRM ("YYYY-MM" ou "YYYY-MM-DD");
// sem ele, a data em que o card entrou na coluna de ganho
function dataVendaDoCard(c) {
  if (/^\d{4}-\d{2}-\d{2}/.test(c.mes || "")) return c.mes.slice(0, 10);
  if (/^\d{4}-\d{2}/.test(c.mes || "")) return c.mes.slice(0, 7) + "-01";
  const ref = c.colunaDesde || c.updatedAt || c.createdAt;
  return ref ? String(ref).slice(0, 10) : todayISO();
}
// valor da parcela "idx" (0 = primeira) de um contrato de comissão do CRM
function parcelaDoContrato(ct, idx) {
  if (Array.isArray(ct.blocos) && ct.blocos.length) {
    let inicio = 0;
    for (const b of ct.blocos) {
      const n = Math.max(1, parseInt(b.parcelas, 10) || 1);
      if (idx < inicio + n) return Number(b.value) || 0;
      inicio += n;
    }
    return 0;
  }
  const p1 = ct.parcelas1 != null ? ct.parcelas1 : ct.parcelas;
  return idx < p1 ? (Number(ct.value) || 0) : (Number(ct.value2) || 0);
}
function crmRowsForMonth(month) {
  const modo = modoIntegracao();
  if (modo === "nenhum" || !state.crm.carregado) return [];
  const rows = [];
  const status = month > mesAtual() ? "Previsto" : "Pago";
  const contratosDoMes = (tipo, categoria, escopoFixo) => {
    state.crm.contratos.forEach((ct) => {
      const anchor = String(ct.date || "").slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(anchor)) return;
      if (ct.canceladoNoMes && month >= ct.canceladoNoMes) return; // cancelado: para de contar a partir desse mês
      const idx = monthsBetween(anchor, month);
      const total = Number(ct.parcelas) || 1;
      if (idx < 0 || idx >= total) return;
      const value = parcelaDoContrato(ct, idx);
      if (value <= 0) return;
      rows.push({
        tx: { id: `crm-comissao-${ct.id}`, origem: "crm", date: `${month}-01`, desc: `${tipo === "Receita" ? "Comissão" : "Comissão paga"} — ${ct.desc || "Contrato"}`, type: tipo, category: categoria, scope: escopoFixo || (ct.scope === "Empresa" ? "Empresa" : "Pessoal"), account: "—", status, value },
        value, badge: `${idx + 1}/${total}`,
      });
    });
  };
  if (modo === "vendas") {
    const ganho = new Set(state.crm.columns.filter((c) => c.tipo === "ganho").map((c) => c.id));
    state.crm.cards.forEach((c) => {
      if (!ganho.has(c.columnId)) return;
      if (c.fechamento) return; // fechamento feito: as parcelas já são lançamentos de verdade
      const data = dataVendaDoCard(c);
      if (monthKey(data) !== month) return;
      const value = Number(c.valor) || 0;
      if (value <= 0) return;
      rows.push({ tx: { id: `crm-venda-${c.id}`, origem: "crm", date: data, desc: `Venda — ${c.cliente || "Cliente"}`, type: "Receita", category: "Vendas", scope: "Empresa", account: "—", status: "Pago", value }, value, badge: null });
    });
    if (state.config.descontarComissoes) contratosDoMes("Despesa", "Comissões", "Empresa");
  } else if (modo === "comissoes") {
    contratosDoMes("Receita", "Comissão");
  }
  return rows;
}
function totalCrm(rows) { return rows.filter((r) => r.tx.origem === "crm" && r.tx.type === "Receita").reduce((a, r) => a + r.value, 0); }

/* ----------------------------------------------------------------------- */
/* Tema dinâmico                                                            */
/* ----------------------------------------------------------------------- */
// Cor de destaque: a do personagem (padrão), a mesma do CRM, ou uma escolhida em Meu perfil.
// O modo escuro é o mesmo do CRM (fica salvo no navegador e vale nos dois aplicativos).
const ACCENT_PRESETS = ["#141414", "#1D4E89", "#1F4D3A", "#6E1E2B", "#9C6B12", "#4A2E6F"]; // as cores do CRM
const modoEscuro = () => { try { return localStorage.getItem("darkMode") === "1"; } catch (e) { return false; } };
function definirModoEscuro(ligado) {
  try { localStorage.setItem("darkMode", ligado ? "1" : "0"); } catch (e) { /* ignora */ }
  document.documentElement.setAttribute("data-theme", ligado ? "dark" : "light");
}
function corDeDestaque() {
  // padrão: a mesma cor do CRM (os dois aplicativos ficam com a mesma cara)
  const escolha = (state.config && state.config.corDestaque) || "crm";
  if (escolha === "crm") { try { return localStorage.getItem("accentColor") || ACCENT_PRESETS[0]; } catch (e) { return ACCENT_PRESETS[0]; } }
  if (/^#[0-9a-f]{6}$/i.test(escolha)) return escolha;
  const char = getCharacter();
  return (char ? PROFILE_COLORS[char.profile] : PROFILE_COLORS.organizadora).primary;
}
function luminancia(hex) {
  const c = hex.replace("#", "").match(/.{2}/g).map((x) => { const v = parseInt(x, 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function clarear(hex, quanto) {
  const c = hex.replace("#", "").match(/.{2}/g).map((x) => parseInt(x, 16));
  return "#" + c.map((v) => Math.round(v + (255 - v) * quanto).toString(16).padStart(2, "0")).join("");
}
function applyTheme() {
  const escuro = modoEscuro();
  document.documentElement.setAttribute("data-theme", escuro ? "dark" : "light");
  let cor = corDeDestaque();
  // no escuro, uma cor muito escura (preto, por exemplo) sumiria no fundo: clareia um pouco
  if (escuro && luminancia(cor) < 0.12) cor = clarear(cor, 0.38);
  document.documentElement.style.setProperty("--char", cor);
  document.documentElement.style.setProperty("--char-soft", `color-mix(in srgb, ${cor} ${escuro ? 22 : 13}%, var(--ivory))`);
}
function getCharacter() {
  if (!state.profile || !state.profile.character) return null;
  return CHARACTERS.find((c) => c.id === state.profile.character) || null;
}

/* ----------------------------------------------------------------------- */
/* Motor de ocorrências (único / fixo / parcelado)                         */
/* ----------------------------------------------------------------------- */
// Linhas de um mês: { tx, value, badge, status, data, mes, ajustada }. A regra de cada
// lançamento (único, fixo com fim, parcelado, ajustes de um mês só) fica em calculos.js.
function occurrencesForMonth(month, scope) {
  const rows = [];
  Calculos.ocorrenciasDoMes(state.txs, month).forEach((o) => {
    if (scope && scope !== "Todos" && o.tx.scope !== scope) return;
    rows.push({ tx: o.tx, value: o.valor, badge: o.parcela, status: o.status, data: o.data, mes: month, ajustada: o.ajustada });
  });
  crmRowsForMonth(month).forEach((r) => {
    if (scope && scope !== "Todos" && r.tx.scope !== scope) return;
    rows.push({ ...r, status: r.tx.status, data: r.tx.date, mes: month });
  });
  return rows;
}
// Muda o status de um lançamento num mês. Fixo/parcelado: só naquele mês (os outros meses
// continuam com o status padrão). Único: muda o próprio lançamento.
function definirStatusNoMes(tx, mes, status) {
  if (tx.recurrence === "fixo" || tx.recurrence === "parcelado") {
    tx.excecoes = { ...(tx.excecoes || {}) };
    const atual = { ...(tx.excecoes[mes] || {}) };
    if (status === tx.status) delete atual.status; else atual.status = status;
    if (Object.keys(atual).length) tx.excecoes[mes] = atual; else delete tx.excecoes[mes];
  } else {
    tx.status = status;
  }
  if (status === "Pago") tx.pagoEm = { ...(tx.pagoEm || {}), [mes]: todayISO() };
}
function sumsFromOccurrences(rows) {
  const rec = rows.filter((r) => r.tx.type === "Receita").reduce((a, r) => a + r.value, 0);
  const desp = rows.filter((r) => r.tx.type === "Despesa").reduce((a, r) => a + r.value, 0);
  return { rec, desp, saldo: rec - desp };
}
/* Lançamento parcelado: todas as parcelas têm o mesmo valor (tx.value). Os campos
   parcelas1/value2 só existem em comissões antigas, de antes da integração com o CRM. */
function parcelaValue(tx, idx) {
  if (tx.parcelas1 == null) return tx.value;
  return idx < tx.parcelas1 ? tx.value : (tx.value2 != null ? tx.value2 : tx.value);
}
// Fatura de um cartão que vence no mês e limite usado de verdade (ver calculos.js)
function faturaDoMes(cartao, mes) {
  const f = Calculos.faturasDoCartao(cartao, state.txs, state.cards, { ateMes: Calculos.somarMeses(mes, 1) })[mes];
  return f || { mes, itens: [], total: 0 };
}
function limiteUsadoDoCartao(cartao) { return Calculos.limiteUsado(cartao, state.txs, state.cards); }
// Os dados no formato que calculos.js espera
function dadosParaCalculo() { return { transacoes: state.txs, cartoes: state.cards, contas: state.contas, transferencias: state.transferencias }; }

/* ----------------------------------------------------------------------- */
/* Navegação                                                                */
/* ----------------------------------------------------------------------- */
["nav", "nav-rodape"].forEach((id) => document.getElementById(id).addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-item[data-tab]");
  if (!btn) return;
  state.tab = btn.dataset.tab;
  document.querySelectorAll(".nav-item[data-tab]").forEach((b) => b.classList.toggle("active", b === btn));
  fecharMenu();
  render();
  window.scrollTo(0, 0);
}));
// No celular a barra lateral vira uma gaveta aberta pelo botão de menu (igual ao CRM)
function fecharMenu() { document.getElementById("app-root").classList.remove("sidebar-open"); }
document.getElementById("abrir-menu").addEventListener("click", () => document.getElementById("app-root").classList.add("sidebar-open"));
document.getElementById("menu-fundo").addEventListener("click", fecharMenu);
// "Olá, Nome" e a foto no topo da barra lateral
function atualizarCabecalho() {
  const nome = (state.profile && state.profile.name) || primeiroNome() || "";
  document.getElementById("sidebar-nome").textContent = nome || "você";
  const av = document.getElementById("sidebar-avatar");
  const foto = state.profile && state.profile.photo;
  if (foto) av.innerHTML = `<img src="${foto}" alt="" />`;
  else av.textContent = nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
}

// Telas que ficam em arquivos próprios (contas.js, cartoes.js, orcamento.js...) se
// registram aqui: TELAS.nome = { render, ligar }
const TELAS = {};
function render() {
  if (state.tab === "assistente") state.tab = "dashboard"; // a aba Assistente virou só a bolinha
  applyTheme();
  atualizarCabecalho();
  const main = document.getElementById("main");
  if (TELAS[state.tab]) main.innerHTML = TELAS[state.tab].render();
  else if (state.tab === "dashboard") main.innerHTML = renderDashboard();
  else if (state.tab === "lancamentos") main.innerHTML = renderLancamentos();
  else if (state.tab === "investimentos") main.innerHTML = renderInvestimentos();
  else if (state.tab === "empresa") main.innerHTML = renderEmpresa();
  else if (state.tab === "objetivos") main.innerHTML = renderObjetivos();
  else if (state.tab === "lucro") main.innerHTML = renderLucro();
  else if (state.tab === "cadastro") main.innerHTML = renderCadastro();
  attachMainEvents();
  if (typeof atualizarBadgeAPagar === "function") atualizarBadgeAPagar();
  if (window.AssistenteIA) AssistenteIA.atualizarAlertas();
}

/* ----------------------------------------------------------------------- */
/* Componentes                                                              */
/* ----------------------------------------------------------------------- */
function statCard(label, value, color, sub) {
  return `<div class="card"><div class="stat-row"><span class="stat-label">${label}</span></div>
    <div class="stat-value" style="color:${color}">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ""}</div>`;
}
function bar(pct, color) {
  const clamped = Math.max(0, Math.min(1, pct || 0));
  return `<div class="bar-track"><div class="bar-fill" style="width:${clamped * 100}%;background:${color}"></div></div>`;
}
function scopeTag(scope) { return `<span class="tag ${scope === "Empresa" ? "empresa" : "pessoal"}">${scope}</span>`; }
function recurBadge(badge) {
  if (!badge) return "";
  if (badge === "Fixo") return `<span class="tag fixo">Fixo</span>`;
  return `<span class="tag parcelado">${badge}</span>`;
}
const STATUS_OPTIONS = ["Pago", "Pendente", "Agendado"];
const STATUS_COLORS = {
  Previsto: { text: "var(--azul)", bg: "var(--azul-soft)" },
  Pago: { text: "var(--pessoal)", bg: "var(--pessoal-soft)" },
  Pendente: { text: "var(--red)", bg: "var(--red-soft)" },
  Agendado: { text: "var(--azul)", bg: "var(--azul-soft)" },
};
// status da linha (no mês da linha — fixo/parcelado têm status por mês)
function statusSelect(row) {
  const st = row.status || row.tx.status;
  const opts = STATUS_OPTIONS.map((o) => `<option value="${o}" ${o === st ? "selected" : ""}>${o}</option>`).join("");
  return `<select class="status-select status-${(st || "Pago").toLowerCase()}" data-id="${row.tx.id}" data-mes="${row.mes || ""}" title="${row.tx.recurrence && row.tx.recurrence !== "unico" ? "Muda só neste mês" : ""}">${opts}</select>`;
}
function categorySelect(tx) {
  const cats = categoriasDe(tx.type);
  if (tx.category && !cats.includes(tx.category)) cats.unshift(tx.category);
  const opts = cats.map((c) => `<option value="${escapeHtml(c)}" ${c === tx.category ? "selected" : ""}>${escapeHtml(c)}</option>`).join("");
  return `<select class="status-select cat-select neutro" data-id="${tx.id}">${opts}</select>`;
}
function scopeSelectInline(tx) {
  const opts = ["Pessoal", "Empresa"].map((s) => `<option value="${s}" ${s === tx.scope ? "selected" : ""}>${s}</option>`).join("");
  return `<select class="status-select scope-select ${tx.scope === "Empresa" ? "escopo-empresa" : "escopo-pessoal"}" data-id="${tx.id}">${opts}</select>`;
}
function accountSelectInline(tx) {
  const opts = CONTAS.map((c) => `<option value="${c}" ${c === tx.account ? "selected" : ""}>${c}</option>`).join("");
  return `<select class="status-select account-select neutro" data-id="${tx.id}">${opts}</select>`;
}
// "Nubank" / "Conta Itaú" embaixo da forma de pagamento
function origemDoLancamento(tx) {
  if (tx.crmFechamento) return `<a href="../index.html" class="origem-crm" title="Criado pelo fechamento da venda no CRM">CRM · venda</a>`;
  if (tx.account === Calculos.CARTAO) { const c = Calculos.cartaoDoLancamento(tx, state.cards); return c ? `💳 ${escapeHtml(c.name)}` : (state.cards.length > 1 ? `<span class="aviso-mini">escolha o cartão</span>` : ""); }
  const conta = tx.contaId && state.contas.find((k) => k.id === tx.contaId);
  return conta ? `🏦 ${escapeHtml(conta.name)}` : "";
}
function valueInputInline(tx, displayValue) {
  const v = displayValue != null ? displayValue : tx.value;
  const isReceita = tx.type === "Receita";
  return `<span class="value-inline-wrap ${isReceita ? "val-receita" : "val-despesa"}">${isReceita ? "+" : "−"}
    <input type="number" step="0.01" class="value-inline" data-id="${tx.id}" value="${(v || 0).toFixed(2)}" /></span>`;
}
function scopePills() {
  return `<div class="row-gap">
    <button class="pill ${state.scopeFilter === "Todos" ? "active" : ""}" style="${state.scopeFilter === "Todos" ? `background:${COLORS.ink}` : ""}" data-scope="Todos">Todos</button>
    <button class="pill ${state.scopeFilter === "Pessoal" ? "active" : ""}" style="${state.scopeFilter === "Pessoal" ? `background:${COLORS.pessoal}` : ""}" data-scope="Pessoal">Pessoal</button>
    <button class="pill ${state.scopeFilter === "Empresa" ? "active" : ""}" style="${state.scopeFilter === "Empresa" ? `background:${COLORS.empresa}` : ""}" data-scope="Empresa">Empresa</button>
  </div>`;
}
function monthNav(inputId) {
  return `<div class="month-nav">
    <button data-monthdelta="-1">‹</button>
    <span>${monthLabel(state.month)}</span>
    <button data-monthdelta="1">›</button>
  </div>`;
}
// Linha de um lançamento que vem do CRM: só leitura — pra mudar, edita no próprio CRM
function crmRowHtml(r) {
  const isReceita = r.tx.type === "Receita";
  const st = STATUS_COLORS[r.tx.status] || STATUS_COLORS.Agendado;
  return `<tr class="crm-row" data-crm="1">
      <td class="mono" style="color:var(--ink-muted);white-space:nowrap;font-size:12px">${brDate(r.tx.date)}</td>
      <td>${escapeHtml(r.tx.desc)} <span class="tag crm" title="Vem do CRM — edite lá">CRM</span> ${recurBadge(r.badge)}</td>
      <td style="font-size:13px">${escapeHtml(r.tx.category)}</td>
      <td>${scopeTag(r.tx.scope)}</td>
      <td style="font-size:13px;color:var(--ink-muted)">—</td>
      <td class="mono ${isReceita ? "val-receita" : "val-despesa"}" style="font-weight:700;white-space:nowrap">${isReceita ? "+" : "−"} ${fmtBRL(r.value)}</td>
      <td><span class="status-chip" style="color:${st.text};background:${st.bg}">${r.tx.status}</span></td>
      <td><a class="icon-btn" href="../index.html" title="Abrir no CRM">↗</a></td>
    </tr>`;
}
function occTable(rows) {
  if (rows.length === 0) return `<div class="table-wrap"><p class="empty-msg">Nenhum lançamento neste filtro/mês.</p></div>`;
  const sorted = rows.slice().sort((a, b) => ((a.data || a.tx.date) < (b.data || b.tx.date) ? 1 : -1));
  const trs = sorted.map((r) => r.tx.origem === "crm" ? crmRowHtml(r) : `
    <tr data-id="${r.tx.id}" data-mes="${r.mes || ""}">
      <td class="mono" style="color:var(--ink-muted);white-space:nowrap;font-size:12px">${brDate(r.data || r.tx.date)}</td>
      <td>${escapeHtml(r.tx.desc)} ${recurBadge(r.badge)}${r.ajustada ? ` <span class="tag ajuste" title="Valor ou status mudado só neste mês">ajustado</span>` : ""}${(r.tx.comprovantes || []).length ? ` <button class="icon-btn tx-comprovantes" title="Ver comprovante">📎</button>` : ""}</td>
      <td>${categorySelect(r.tx)}</td>
      <td>${scopeSelectInline(r.tx)}</td>
      <td>${accountSelectInline(r.tx)}<div class="origem-mini">${origemDoLancamento(r.tx)}</div></td>
      <td>${valueInputInline(r.tx, r.value)}</td>
      <td>${statusSelect(r)}</td>
      <td style="white-space:nowrap"><button class="icon-btn tx-edit" title="Editar">✎</button><button class="icon-btn tx-del" title="Excluir">🗑</button></td>
    </tr>`).join("");
  return `<div class="table-wrap"><table>
    <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Escopo</th><th>Forma</th><th>Valor</th><th>Status</th><th></th></tr></thead>
    <tbody>${trs}</tbody></table></div>`;
}

/* ----------------------------------------------------------------------- */
/* Painel (Dashboard)                                                       */
/* ----------------------------------------------------------------------- */
function renderDashboard() {
  const rows = occurrencesForMonth(state.month, state.scopeFilter);
  const dashSums = sumsFromOccurrences(rows);

  const catMap = {};
  rows.filter((r) => r.tx.type === "Despesa").forEach((r) => { catMap[r.tx.category] = (catMap[r.tx.category] || 0) + r.value; });
  const catTotals = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const maxCat = catTotals.length ? catTotals[0][1] : 1;

  const investTotals = state.invs.reduce((a, i) => ({ applied: a.applied + i.applied, current: a.current + i.current }), { applied: 0, current: 0 });
  const rentMedia = investTotals.applied ? (investTotals.current - investTotals.applied) / investTotals.applied : 0;
  const char = getCharacter();
  const tipOfDay = char ? TIPS[char.profile][new Date().getDate() % TIPS[char.profile].length] : null;

  return `
    <div class="row-between">
      <div>
        <h1 class="page-title">Painel financeiro</h1>
        <p class="page-sub">Resumo de ${monthLabel(state.month)}${char ? ` · Olá, ${escapeHtml(state.profile.name || "")}` : ""}</p>
      </div>
      <div class="row-gap">
        ${monthNav()}
        ${scopePills()}
      </div>
    </div>

    ${tipOfDay ? `<div class="card" style="margin-bottom:20px;border-color:var(--char);display:flex;gap:12px;align-items:center">
      <div style="width:34px;height:34px;border-radius:50%;background:var(--char);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0">✦</div>
      <div><div class="stat-label">Dica do dia · ${escapeHtml(nomeDoPersonagem())}</div><div style="font-size:14px;margin-top:2px">${tipOfDay}</div></div>
    </div>` : ""}

    <div class="grid grid-3" style="margin-bottom:20px">
      ${statCard("Receitas do mês", fmtBRL(dashSums.rec), COLORS.pessoal, totalCrm(rows) > 0 ? `inclui ${fmtBRL(totalCrm(rows))} vindos do CRM` : "")}
      ${statCard("Despesas do mês", fmtBRL(dashSums.desp), COLORS.red)}
      ${statCard("Lucro do mês", fmtBRL(dashSums.saldo), dashSums.saldo < 0 ? COLORS.red : COLORS.gold, `<a href="#" class="link-lucro" data-goto="lucro">Ver de onde vem e para onde vai →</a>`)}
    </div>

    ${resumoDoDiaADia()}

    <div class="grid grid-2" style="margin-bottom:20px">
      <div class="card">
        <h2 class="section-title" style="border-color:${COLORS.pessoal}">Despesas por categoria</h2>
        ${catTotals.length === 0 ? `<p style="color:var(--ink-muted);font-size:14px">Sem despesas neste filtro.</p>` :
          catTotals.map(([cat, val]) => `<div style="margin-bottom:12px"><div class="bar-line"><span>${cat}</span><span class="mono">${fmtBRL(val)}</span></div>${bar(val / maxCat, COLORS.empresa)}</div>`).join("")}
      </div>
      <div class="card">
        <h2 class="section-title" style="border-color:${COLORS.gold}">Objetivos em andamento</h2>
        ${state.goals.length ? "" : `<p style="color:var(--ink-muted);font-size:14px">Nenhum objetivo ainda. <a href="#" class="link-lucro" data-goto="objetivos">Criar um objetivo →</a></p>`}
        ${state.goals.map((g) => { const pct = g.target ? g.current / g.target : 0; return `
          <div style="margin-bottom:14px"><div class="bar-line"><span>${escapeHtml(g.name)} <span style="font-size:12px;color:${g.scope === "Empresa" ? COLORS.empresa : COLORS.pessoal}">· ${g.scope}</span></span><span class="mono" style="font-size:12px;color:var(--ink-muted)">${fmtPct(pct)}</span></div>${bar(pct, pct >= 1 ? COLORS.pessoal : COLORS.gold)}</div>`; }).join("")}
      </div>
    </div>

    <div class="grid grid-3">
      ${statCard("Limite livre dos cartões", fmtBRL(state.cards.reduce((a, c) => a + (c.limit || 0) - limiteUsadoDoCartao(c), 0)), COLORS.pessoal, state.cards.length ? `de ${fmtBRL(state.cards.reduce((a, c) => a + (c.limit || 0), 0))} no total` : `<a href="#" class="link-lucro" data-goto="cartoes">Cadastrar cartão →</a>`)}
      ${statCard("Total investido", fmtBRL(investTotals.applied), COLORS.pessoal, `Valor atual: ${fmtBRL(investTotals.current)}`)}
      ${statCard("Rentabilidade média", fmtPct(rentMedia), COLORS.gold)}
    </div>
  `;
}

// Saldo nas contas, o que vence nos próximos 7 dias e como está o orçamento do mês
function resumoDoDiaADia() {
  const dados = dadosParaCalculo();
  const saldo = state.contas.reduce((a, k) => a + Calculos.saldoDaConta(k, dados), 0);
  const semana = Calculos.aPagarEReceber(dados, { dias: 7 });
  const pagar = semana.filter((p) => p.tipo === "pagar");
  const atrasado = pagar.filter((p) => p.atrasado);
  const orc = window.resumoDoOrcamento ? resumoDoOrcamento(state.month) : null;
  return `<div class="grid grid-3" style="margin-bottom:20px">
    ${state.contas.length
      ? statCard("Saldo nas contas", fmtBRL(saldo), saldo < 0 ? COLORS.red : COLORS.pessoal, `<a href="#" class="link-lucro" data-goto="contas">${state.contas.length} conta${state.contas.length > 1 ? "s" : ""} →</a>`)
      : statCard("Saldo nas contas", "—", "var(--ink-muted)", `<a href="#" class="link-lucro" data-goto="contas">Cadastre suas contas pra ver quanto você tem →</a>`)}
    ${statCard("A pagar em 7 dias", fmtBRL(pagar.reduce((a, p) => a + p.valor, 0)), atrasado.length ? COLORS.red : "var(--ink)", atrasado.length ? `<span style="color:${COLORS.red}">${atrasado.length} em atraso</span> · <a href="#" class="link-lucro" data-goto="apagar">ver</a>` : `<a href="#" class="link-lucro" data-goto="apagar">${pagar.length ? `${pagar.length} conta${pagar.length > 1 ? "s" : ""} →` : "Nada vencendo →"}</a>`)}
    ${orc && orc.categorias
      ? statCard("Orçamento do mês", `${fmtBRL(orc.gasto)}`, orc.estourados ? COLORS.red : COLORS.gold, `de ${fmtBRL(orc.limite)} · ${orc.estourados ? `<span style="color:${COLORS.red}">${orc.estourados} categoria${orc.estourados > 1 ? "s" : ""} estourada${orc.estourados > 1 ? "s" : ""}</span>` : "dentro do planejado"} · <a href="#" class="link-lucro" data-goto="orcamento">ver</a>`)
      : statCard("Orçamento do mês", "—", "var(--ink-muted)", `<a href="#" class="link-lucro" data-goto="orcamento">Defina quanto gastar em cada categoria →</a>`)}
  </div>`;
}

/* ----------------------------------------------------------------------- */
/* Lançamentos                                                              */
/* ----------------------------------------------------------------------- */
// Busca e filtros: valem pro mês em tela ou, marcando "todos os meses", pra todos os lançamentos
const semAcento = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function linhasFiltradas() {
  const fl = state.filtros;
  let rows;
  if (fl.todosMeses) {
    rows = state.txs.filter((tx) => state.scopeFilter === "Todos" || tx.scope === state.scopeFilter)
      .map((tx) => ({ tx, value: Number(tx.value) || 0, badge: tx.recurrence === "fixo" ? "Fixo" : tx.recurrence === "parcelado" ? `${tx.parcelas}x` : null, status: tx.status, data: tx.date, mes: Calculos.anoMes(tx.date) }));
  } else {
    rows = occurrencesForMonth(state.month, state.scopeFilter);
  }
  const busca = semAcento(fl.texto).trim();
  return rows.filter((r) => {
    if (busca && !semAcento(`${r.tx.desc} ${r.tx.category} ${r.value.toFixed(2).replace(".", ",")}`).includes(busca)) return false;
    if (fl.tipo && r.tx.type !== fl.tipo) return false;
    if (fl.categoria && r.tx.category !== fl.categoria) return false;
    if (fl.status && (r.status || r.tx.status) !== fl.status) return false;
    if (fl.forma && r.tx.account !== fl.forma) return false;
    return true;
  });
}
function filtrosHtml() {
  const fl = state.filtros;
  const cats = [...new Set([...categoriasDe("Despesa"), ...categoriasDe("Receita")])];
  const sel = (id, rotulo, opcoes, valor) => `<select id="${id}" class="filtro-select" aria-label="${rotulo}"><option value="">${rotulo}</option>${opcoes.map((o) => `<option value="${escapeHtml(o)}" ${o === valor ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}</select>`;
  const ativos = ["texto", "tipo", "categoria", "status", "forma"].filter((k) => fl[k]).length;
  return `<div class="filtros">
    <input type="search" id="filtro-texto" class="filtro-busca" placeholder="Buscar por descrição, categoria ou valor" value="${escapeHtml(fl.texto)}" aria-label="Buscar lançamentos" />
    ${sel("filtro-tipo", "Receitas e despesas", ["Receita", "Despesa"], fl.tipo)}
    ${sel("filtro-categoria", "Todas as categorias", cats, fl.categoria)}
    ${sel("filtro-status", "Qualquer status", STATUS_OPTIONS, fl.status)}
    ${sel("filtro-forma", "Qualquer forma", CONTAS, fl.forma)}
    <label class="filtro-check"><input type="checkbox" id="filtro-todos" ${fl.todosMeses ? "checked" : ""} /> Todos os meses</label>
    ${ativos || fl.todosMeses ? `<button type="button" class="link-btn" id="filtro-limpar">Limpar filtros</button>` : ""}
  </div>`;
}
function renderLancamentos() {
  const rows = linhasFiltradas();
  const s = sumsFromOccurrences(rows);
  const filtrando = ["texto", "tipo", "categoria", "status", "forma"].some((k) => state.filtros[k]) || state.filtros.todosMeses;
  return `
    <div class="row-between">
      <h1 class="page-title">Lançamentos</h1>
      <div class="row-gap">
        ${state.filtros.todosMeses ? "" : monthNav()}
        ${scopePills()}
        <button class="btn ghost" id="importar-extrato-btn" title="Importar o extrato do banco (CSV ou OFX)">⇪ Importar extrato</button>
        <button class="btn ghost" id="exportar-btn" title="Baixar em Excel ou PDF">⇩ Exportar</button>
        <button class="btn pessoal" id="new-tx-btn">+ Novo</button>
      </div>
    </div>
    ${filtrosHtml()}
    <p class="lanc-resumo">${rows.length} lançamento${rows.length === 1 ? "" : "s"}${filtrando ? " encontrados" : ""} · <span class="val-receita">+ ${fmtBRL(s.rec)}</span> · <span class="val-despesa">− ${fmtBRL(s.desp)}</span>${state.filtros.todosMeses ? " · valores de cada lançamento (por mês, nos fixos e parcelados)" : ""}</p>
    <p style="font-size:12px;color:var(--ink-muted);margin:0 0 16px">Contas <span class="tag fixo">Fixo</span> repetem todo mês. Contas <span class="tag parcelado">Parcelado</span> aparecem automaticamente até acabar as parcelas. Mudou o valor ou o status de um fixo na tabela? Dá pra aplicar só naquele mês.</p>
    ${occTable(rows)}
  `;
}
function ligarFiltros() {
  const busca = document.getElementById("filtro-texto");
  if (!busca) return;
  let t = null;
  busca.addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => { state.filtros.texto = e.target.value; const pos = e.target.selectionStart; render(); const b = document.getElementById("filtro-texto"); if (b) { b.focus(); b.setSelectionRange(pos, pos); } }, 220);
  });
  [["filtro-tipo", "tipo"], ["filtro-categoria", "categoria"], ["filtro-status", "status"], ["filtro-forma", "forma"]].forEach(([id, k]) => {
    document.getElementById(id).addEventListener("change", (e) => { state.filtros[k] = e.target.value; render(); });
  });
  document.getElementById("filtro-todos").addEventListener("change", (e) => { state.filtros.todosMeses = e.target.checked; render(); });
  const limpar = document.getElementById("filtro-limpar");
  if (limpar) limpar.addEventListener("click", () => { state.filtros = { texto: "", tipo: "", categoria: "", status: "", forma: "", todosMeses: false }; render(); });
  const imp = document.getElementById("importar-extrato-btn");
  if (imp) imp.addEventListener("click", () => window.abrirImportarExtrato && abrirImportarExtrato());
  const exp = document.getElementById("exportar-btn");
  if (exp) exp.addEventListener("click", () => window.abrirExportar && abrirExportar());
}

/* ----------------------------------------------------------------------- */
/* Investimentos                                                           */
/* ----------------------------------------------------------------------- */
function renderInvestimentos() {
  const rows = state.invs.map((i) => {
    const rent = i.applied ? (i.current - i.applied) / i.applied : 0;
    return `<tr data-id="${i.id}">
      <td>${escapeHtml(i.name)}<div style="font-size:12px;color:var(--ink-muted)">${escapeHtml(i.institution || "")}</div></td>
      <td style="font-size:12px;color:var(--ink-muted)">${i.type}</td>
      <td>${scopeTag(i.scope)}</td>
      <td class="mono">${fmtBRL(i.applied)}</td>
      <td class="mono">${fmtBRL(i.current)}</td>
      <td class="mono" style="font-weight:700;color:${rent >= 0 ? COLORS.pessoal : COLORS.red}">${fmtPct(rent)}</td>
      <td><button class="icon-btn inv-edit" title="Editar">✎</button><button class="icon-btn inv-del" title="Excluir">🗑</button></td>
    </tr>`;
  }).join("");
  return `<div class="row-between"><h1 class="page-title">Investimentos</h1><button class="btn pessoal" id="new-inv-btn">+ Novo</button></div>
    <div class="table-wrap"><table><thead><tr><th>Ativo</th><th>Tipo</th><th>Escopo</th><th>Aplicado</th><th>Atual</th><th>Rentab.</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7"><p class="empty-msg">Nenhum investimento cadastrado.</p></td></tr>`}</tbody></table></div>`;
}

/* ----------------------------------------------------------------------- */
/* Empresa                                                                  */
/* ----------------------------------------------------------------------- */
function renderEmpresa() {
  const rows = occurrencesForMonth(state.month, "Empresa");
  const s = sumsFromOccurrences(rows);
  return `
    <div class="row-between">
      <div><h1 class="page-title" style="color:${COLORS.empresa}">Empresa</h1><p class="page-sub">Área separada do seu CNPJ · ${monthLabel(state.month)}</p></div>
      <div class="row-gap">${monthNav()}<button class="btn empresa" id="new-tx-emp-btn">+ Novo</button></div>
    </div>
    <div class="grid grid-3" style="margin-bottom:24px">
      ${statCard("Receitas", fmtBRL(s.rec), COLORS.empresa)}
      ${statCard("Despesas", fmtBRL(s.desp), COLORS.red)}
      ${statCard("Saldo", fmtBRL(s.saldo), COLORS.gold)}
    </div>
    <h2 class="section-title" style="border-color:${COLORS.empresa}">Lançamentos da empresa</h2>
    ${occTable(rows)}
  `;
}

/* ----------------------------------------------------------------------- */
/* Objetivos                                                                */
/* ----------------------------------------------------------------------- */
function renderObjetivos() {
  const items = state.goals.map((g) => {
    const pct = g.target ? g.current / g.target : 0;
    const done = pct >= 1;
    const late = !done && new Date(g.deadline) < new Date();
    const statusLabel = done ? "Concluído" : late ? "Atrasado" : "Em andamento";
    const statusColor = done ? COLORS.pessoal : late ? COLORS.red : "var(--ink-muted)";
    return `<div class="item-card" data-id="${g.id}">
      <div class="item-head">
        <div><h3 class="item-title">${escapeHtml(g.name)}</h3>${scopeTag(g.scope)}</div>
        <div><button class="icon-btn goal-edit" title="Editar">✎</button><button class="icon-btn goal-del" title="Excluir">🗑</button></div>
      </div>
      <div class="bar-line"><span class="mono">${fmtBRL(g.current)} de ${fmtBRL(g.target)}</span><span class="mono" style="font-weight:700">${fmtPct(pct)}</span></div>
      ${bar(pct, done ? COLORS.pessoal : late ? COLORS.red : COLORS.gold)}
      <div class="bar-line" style="margin-top:8px;font-size:12px;color:var(--ink-muted)"><span>Prazo: ${brDate(g.deadline)}</span><span style="color:${statusColor};font-weight:600">${statusLabel}</span></div>
    </div>`;
  }).join("");
  return `<div class="row-between"><h1 class="page-title">Objetivos futuros</h1><button class="btn gold" id="new-goal-btn">+ Novo objetivo</button></div>
    <div class="grid grid-2">${items || `<p class="empty-msg">Nenhum objetivo cadastrado.</p>`}</div>`;
}

/* ----------------------------------------------------------------------- */
/* Lucro — de onde vem e para onde vai o dinheiro (com as vendas do CRM)    */
/* ----------------------------------------------------------------------- */
function opcoesIntegracaoHtml() {
  const modo = modoIntegracao();
  const opcoes = [
    ["vendas", "Valor das vendas", "Sou dono(a) do negócio: cada venda fechada no CRM entra como receita da Empresa, com o valor final e as parcelas que você informa ao fechar."],
    ["comissoes", "Minhas comissões", "Sou vendedor(a): as parcelas de comissão do CRM entram como minha receita."],
    ["nenhum", "Não usar o CRM", "Só os lançamentos feitos aqui no Controle financeiro."],
  ];
  return `<div class="integ-opcoes">${opcoes.map(([v, t, d]) => `
      <button type="button" class="integ-opcao ${modo === v ? "selected" : ""}" data-integracao="${v}">
        <span class="integ-titulo">${t}</span><span class="integ-desc">${d}</span>
      </button>`).join("")}</div>
    ${modo === "vendas" ? `<label class="integ-check"><input type="checkbox" id="descontar-comissoes" ${state.config.descontarComissoes ? "checked" : ""} /> Descontar as comissões cadastradas no CRM como despesa da Empresa (comissão paga a vendedores)</label>` : ""}
    ${state.crm.erro ? `<p class="integ-aviso">⚠ Não foi possível ler os dados do CRM agora (${escapeHtml(state.crm.erro)}). Os números abaixo estão sem as vendas do CRM.</p>` : ""}`;
}
function renderLucro() {
  const rows = occurrencesForMonth(state.month, state.scopeFilter);
  const s = sumsFromOccurrences(rows);
  const margem = s.rec > 0 ? s.saldo / s.rec : 0;
  const doCrm = totalCrm(rows);

  // de onde vem: receitas por origem/categoria
  const origemMap = {};
  rows.filter((r) => r.tx.type === "Receita").forEach((r) => {
    const chave = r.tx.origem === "crm" ? `${r.tx.category} (CRM)` : r.tx.category;
    origemMap[chave] = (origemMap[chave] || 0) + r.value;
  });
  const origens = Object.entries(origemMap).sort((a, b) => b[1] - a[1]);

  // para onde vai: despesas por categoria
  const catMap = {};
  rows.filter((r) => r.tx.type === "Despesa").forEach((r) => { catMap[r.tx.category] = (catMap[r.tx.category] || 0) + r.value; });
  const cats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

  // últimos 6 meses
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const m = addMonths(state.month, -i);
    const sm = sumsFromOccurrences(occurrencesForMonth(m, state.scopeFilter));
    meses.push({ m, ...sm });
  }
  const maxAbs = Math.max(1, ...meses.map((x) => Math.max(x.rec, x.desp)));

  const listaBarras = (lista, total, cor, vazio) => lista.length === 0
    ? `<p style="color:var(--ink-muted);font-size:14px">${vazio}</p>`
    : lista.map(([nome, val]) => `<div style="margin-bottom:12px"><div class="bar-line"><span>${escapeHtml(nome)}</span><span class="mono">${fmtBRL(val)} <span style="color:var(--ink-muted);font-size:12px">· ${fmtPct(total ? val / total : 0)}</span></span></div>${bar(total ? val / total : 0, cor)}</div>`).join("");

  return `
    <div class="row-between">
      <div><h1 class="page-title">Lucro</h1><p class="page-sub">De onde vem e para onde vai o dinheiro · ${monthLabel(state.month)}</p></div>
      <div class="row-gap">${monthNav()}${scopePills()}</div>
    </div>

    <div class="grid grid-4" style="margin-bottom:20px">
      ${statCard("Receitas", fmtBRL(s.rec), COLORS.pessoal, doCrm > 0 ? `${fmtBRL(doCrm)} vindos do CRM` : "")}
      ${statCard("Despesas", fmtBRL(s.desp), COLORS.red)}
      ${statCard("Lucro", fmtBRL(s.saldo), s.saldo < 0 ? COLORS.red : COLORS.gold, s.saldo < 0 ? "o mês está no prejuízo" : "")}
      ${statCard("Margem de lucro", s.rec > 0 ? fmtPct(margem) : "—", margem < 0 ? COLORS.red : COLORS.ink, "lucro ÷ receitas")}
    </div>

    <div class="grid grid-2" style="margin-bottom:20px">
      <div class="card">
        <h2 class="section-title" style="border-color:${COLORS.pessoal}">De onde vem o dinheiro</h2>
        ${listaBarras(origens, s.rec, COLORS.pessoal, "Nenhuma receita neste mês.")}
      </div>
      <div class="card">
        <h2 class="section-title" style="border-color:${COLORS.red}">Para onde vai o dinheiro</h2>
        ${listaBarras(cats, s.desp, COLORS.empresa, "Nenhuma despesa neste mês.")}
        ${cats.length && s.rec > 0 ? `<p class="stat-sub" style="margin-top:6px">As despesas consomem <b>${fmtPct(s.desp / s.rec)}</b> do que entra.</p>` : ""}
      </div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <h2 class="section-title" style="border-color:${COLORS.gold}">Últimos 6 meses</h2>
      <div class="table-wrap" style="border:none;box-shadow:none"><table class="tabela-lucro">
        <thead><tr><th>Mês</th><th>Receitas</th><th>Despesas</th><th>Lucro</th><th>Margem</th><th style="width:34%"></th></tr></thead>
        <tbody>${meses.map((x) => `<tr class="${x.m === state.month ? "mes-atual" : ""}">
          <td style="font-weight:600">${monthLabel(x.m)}</td>
          <td class="mono">${fmtBRL(x.rec)}</td>
          <td class="mono">${fmtBRL(x.desp)}</td>
          <td class="mono" style="font-weight:700;color:${x.saldo < 0 ? COLORS.red : COLORS.pessoal}">${fmtBRL(x.saldo)}</td>
          <td class="mono" style="color:var(--ink-muted)">${x.rec > 0 ? fmtPct(x.saldo / x.rec) : "—"}</td>
          <td><div class="mini-barras" title="Receitas × despesas">
            <div class="mini-barra" style="width:${(x.rec / maxAbs) * 100}%;background:${COLORS.pessoal}"></div>
            <div class="mini-barra" style="width:${(x.desp / maxAbs) * 100}%;background:${COLORS.red}"></div>
          </div></td>
        </tr>`).join("")}</tbody>
      </table></div>
      <p class="stat-sub" style="margin-top:8px"><span class="legenda" style="background:${COLORS.pessoal}"></span> Receitas &nbsp; <span class="legenda" style="background:${COLORS.red}"></span> Despesas</p>
    </div>

    <div class="card">
      <h2 class="section-title" style="border-color:var(--char)">Como o CRM entra no seu financeiro</h2>
      ${opcoesIntegracaoHtml()}
    </div>
  `;
}

/* ----------------------------------------------------------------------- */
/* Assistente (baseado em regras + dados reais)                            */
/* ----------------------------------------------------------------------- */
// Alertas do sininho da bolinha de IA. Sempre sobre o mês atual (não o mês em tela).
// Texto simples (a bolinha escapa o HTML); "goto" = aba que abre ao clicar no alerta.
function buildAlerts() {
  const alerts = [];
  const mes = mesAtual();
  const rows = occurrencesForMonth(mes);
  const s = sumsFromOccurrences(rows);
  const pendencias = Calculos.aPagarEReceber(dadosParaCalculo(), { dias: 7 });
  const atrasadas = pendencias.filter((p) => p.atrasado && p.tipo === "pagar");
  if (atrasadas.length) alerts.push({ type: "warn", text: `${atrasadas.length} conta${atrasadas.length > 1 ? "s" : ""} em atraso, somando ${fmtBRL(atrasadas.reduce((a, p) => a + p.valor, 0))}.`, goto: "apagar" });
  const semana = pendencias.filter((p) => !p.atrasado && p.tipo === "pagar");
  if (semana.length) alerts.push({ type: "info", text: `${semana.length} conta${semana.length > 1 ? "s vencem" : " vence"} nos próximos 7 dias (${fmtBRL(semana.reduce((a, p) => a + p.valor, 0))}).`, goto: "apagar" });
  if (s.saldo < 0) alerts.push({ type: "warn", text: `O mês está no vermelho: ${fmtBRL(s.saldo)}. Vale revisar os gastos.`, goto: "lucro" });
  state.cards.forEach((c) => {
    const pct = c.limit ? limiteUsadoDoCartao(c) / c.limit : 0;
    if (pct > 0.8) alerts.push({ type: "warn", text: `O cartão ${c.name} está com ${fmtPct(pct)} do limite comprometido.`, goto: "cartoes" });
  });
  if (window.alertasDeOrcamento) alertasDeOrcamento(mes).forEach((a) => alerts.push({ ...a, goto: "orcamento" }));
  state.goals.forEach((g) => {
    const pct = g.target ? g.current / g.target : 0;
    const diasRestantes = (new Date(g.deadline) - new Date()) / 86400000;
    if (pct < 1 && diasRestantes >= 0 && diasRestantes <= 30) alerts.push({ type: "warn", text: `A meta "${g.name}" vence em breve e está em ${fmtPct(pct)}.`, goto: "objetivos" });
    if (pct >= 1) alerts.push({ type: "ok", text: `Meta "${g.name}" concluída! 🎉`, goto: "objetivos" });
  });
  const comissaoMes = rows.filter((r) => r.tx.category === "Comissão").reduce((a, r) => a + r.value, 0);
  if (comissaoMes > 0) alerts.push({ type: "info", text: `Você tem ${fmtBRL(comissaoMes)} de comissão prevista para ${monthLabel(mes)}.`, goto: "lucro" });
  const crmMes = totalCrm(rows);
  if (crmMes > 0) alerts.push({ type: "info", text: `Entraram ${fmtBRL(crmMes)} do CRM em ${monthLabel(mes)}.`, goto: "lucro" });
  return alerts;
}
// Perguntas prontas do carrossel da bolinha
const SUGESTOES_IA = [
  { texto: "✏️ Lançar um gasto", preencher: "Gastei R$ " },
  { texto: "Meu saldo", pergunta: "Qual é o meu saldo este mês?" },
  { texto: "Meu lucro", pergunta: "Qual foi meu lucro este mês e quanto veio do CRM?" },
  { texto: "Para onde vai meu dinheiro", pergunta: "Em que categorias eu mais gastei este mês?" },
  { texto: "Contas a pagar", pergunta: "Quais contas vencem nos próximos dias?" },
  { texto: "Meus cartões", pergunta: "Como estão as faturas e o limite dos meus cartões?" },
  { texto: "Meus objetivos", pergunta: "Como estão meus objetivos?" },
  { texto: "Uma dica", pergunta: "Me dá uma dica para o meu perfil financeiro." },
];

/* ----------------------------------------------------------------------- */
/* Cadastro                                                                 */
/* ----------------------------------------------------------------------- */
function renderCadastro() {
  const char = getCharacter();
  const photo = state.profile && state.profile.photo;
  return `
    <h1 class="page-title">Meu perfil</h1>
    <p class="page-sub" style="margin-bottom:22px">Suas informações e seu personagem</p>

    <div class="profile-header">
      ${photo ? `<img class="profile-photo" src="${photo}" />` : `<div class="profile-photo-placeholder">${(state.profile && state.profile.name ? state.profile.name[0] : "?").toUpperCase()}</div>`}
      <div>
        <h2 style="font-family:Georgia,serif;margin:0 0 4px">${escapeHtml((state.profile && state.profile.name) || "Sem nome")}</h2>
        <p style="margin:0;font-size:13px;color:var(--ink-muted)">${char ? `Personagem: ${escapeHtml(nomeDoPersonagem())} · ${escapeHtml(char.title)}` : "Nenhum personagem escolhido"}</p>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <h2 class="section-title" style="border-color:var(--char)">Dados</h2>
      <div class="field"><label>Nome</label><input id="f-profile-name" value="${escapeHtml((state.profile && state.profile.name) || "")}" /></div>
      <div class="field"><label>Foto</label><input id="f-profile-photo" type="file" accept="image/*" /></div>
      <button class="btn char save-btn" id="save-profile-btn">Salvar dados</button>
    </div>

    <div class="card" style="margin-bottom:20px">
      <h2 class="section-title" style="border-color:var(--char)">Personagem</h2>
      ${char ? `<p style="font-size:14px;margin:0 0 4px"><strong>${escapeHtml(nomeDoPersonagem())}</strong> · ${escapeHtml(char.title)}</p><p style="font-size:13px;color:var(--ink-muted);margin-top:0">${escapeHtml(char.desc)}</p>` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn char" id="change-char-btn">Trocar personagem</button>
        <button class="btn ghost" id="redo-quiz-btn">Refazer as perguntas</button>
      </div>
    </div>

    ${typeof secoesDoPerfil === "function" ? secoesDoPerfil() : ""}
  `;
}

/* ----------------------------------------------------------------------- */
/* Eventos da tela principal                                                */
/* ----------------------------------------------------------------------- */
function attachMainEvents() {
  document.querySelectorAll("[data-scope]").forEach((btn) => btn.addEventListener("click", () => { state.scopeFilter = btn.dataset.scope; render(); }));
  document.querySelectorAll("[data-monthdelta]").forEach((btn) => btn.addEventListener("click", () => { state.month = addMonths(state.month, parseInt(btn.dataset.monthdelta, 10)); render(); }));


  const newTxBtn = document.getElementById("new-tx-btn") || document.getElementById("new-tx-emp-btn");
  if (newTxBtn) newTxBtn.addEventListener("click", () => openTxModal(null, state.tab === "empresa" ? "Empresa" : undefined));
  document.querySelectorAll(".tx-edit").forEach((b) => b.addEventListener("click", (e) => { const id = e.target.closest("tr").dataset.id; openTxModal(state.txs.find((t) => t.id === id)); }));
  document.querySelectorAll(".tx-del").forEach((b) => b.addEventListener("click", (e) => {
    const tr = e.target.closest("tr");
    const tx = state.txs.find((t) => t.id === tr.dataset.id);
    if (tx) excluirLancamento(tx, tr.dataset.mes || state.month);
  }));
  document.querySelectorAll(".tx-comprovantes").forEach((b) => b.addEventListener("click", (e) => {
    const tx = state.txs.find((t) => t.id === e.target.closest("tr").dataset.id);
    if (tx && window.abrirComprovantes) abrirComprovantes(tx);
  }));
  document.querySelectorAll(".status-select:not(.cat-select):not(.scope-select):not(.account-select)").forEach((sel) => sel.addEventListener("change", (e) => {
    const tx = state.txs.find((t) => t.id === e.target.dataset.id);
    if (!tx) return;
    definirStatusNoMes(tx, e.target.dataset.mes || state.month, e.target.value);
    saveTxs();
    render();
  }));
  document.querySelectorAll(".cat-select").forEach((sel) => sel.addEventListener("change", (e) => {
    const id = e.target.dataset.id;
    const tx = state.txs.find((t) => t.id === id);
    if (!tx) return;
    tx.category = e.target.value;
    saveTxs();
    render();
  }));
  document.querySelectorAll(".scope-select").forEach((sel) => sel.addEventListener("change", (e) => {
    const id = e.target.dataset.id;
    const tx = state.txs.find((t) => t.id === id);
    if (!tx) return;
    tx.scope = e.target.value;
    saveTxs();
    render();
  }));
  document.querySelectorAll(".account-select").forEach((sel) => sel.addEventListener("change", (e) => {
    const id = e.target.dataset.id;
    const tx = state.txs.find((t) => t.id === id);
    if (!tx) return;
    tx.account = e.target.value;
    saveTxs();
    render();
  }));
  document.querySelectorAll(".value-inline").forEach((inp) => inp.addEventListener("change", (e) => {
    const tx = state.txs.find((t) => t.id === e.target.dataset.id);
    if (!tx) return;
    const mes = e.target.closest("tr").dataset.mes || state.month;
    mudarValorDoLancamento(tx, mes, parseFloat(e.target.value) || 0);
  }));

  const newInvBtn = document.getElementById("new-inv-btn");
  if (newInvBtn) newInvBtn.addEventListener("click", () => openInvModal(null));
  document.querySelectorAll(".inv-edit").forEach((b) => b.addEventListener("click", (e) => { const id = e.target.closest("tr").dataset.id; openInvModal(state.invs.find((i) => i.id === id)); }));
  document.querySelectorAll(".inv-del").forEach((b) => b.addEventListener("click", (e) => { const id = e.target.closest("tr").dataset.id; if (confirm("Excluir este investimento?")) { state.invs = state.invs.filter((i) => i.id !== id); saveInvs(); render(); } }));

  const newGoalBtn = document.getElementById("new-goal-btn");
  if (newGoalBtn) newGoalBtn.addEventListener("click", () => openGoalModal(null));
  document.querySelectorAll(".goal-edit").forEach((b) => b.addEventListener("click", (e) => { const id = e.target.closest(".item-card").dataset.id; openGoalModal(state.goals.find((g) => g.id === id)); }));
  document.querySelectorAll(".goal-del").forEach((b) => b.addEventListener("click", (e) => { const id = e.target.closest(".item-card").dataset.id; if (confirm("Excluir este objetivo?")) { state.goals = state.goals.filter((g) => g.id !== id); saveGoals(); render(); } }));

  /* Lucro / integração com o CRM */
  document.querySelectorAll("[data-goto]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); irParaAba(a.dataset.goto); }));
  document.querySelectorAll("[data-integracao]").forEach((btn) => btn.addEventListener("click", () => {
    state.config = { ...state.config, integracaoCrm: btn.dataset.integracao, integracaoCrmPerguntado: true };
    saveConfig(); render();
  }));
  const descontar = document.getElementById("descontar-comissoes");
  if (descontar) descontar.addEventListener("change", (e) => { state.config = { ...state.config, descontarComissoes: e.target.checked }; saveConfig(); render(); });

  /* Cadastro */
  const saveProfileBtn = document.getElementById("save-profile-btn");
  if (saveProfileBtn) saveProfileBtn.addEventListener("click", () => {
    state.profile.name = document.getElementById("f-profile-name").value;
    saveProfile(); render();
  });
  const photoInput = document.getElementById("f-profile-photo");
  if (photoInput) photoInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    reduzirFoto(file).then((dataUrl) => { state.profile.photo = dataUrl; saveProfile(); render(); }).catch(() => alert("Não foi possível usar essa imagem."));
  });
  const changeCharBtn = document.getElementById("change-char-btn");
  if (changeCharBtn) changeCharBtn.addEventListener("click", () => openCharacterPicker());
  const redoQuizBtn = document.getElementById("redo-quiz-btn");
  if (redoQuizBtn) redoQuizBtn.addEventListener("click", () => openQuiz(true));

  if (state.tab === "lancamentos") ligarFiltros();
  if (TELAS[state.tab] && TELAS[state.tab].ligar) TELAS[state.tab].ligar();
  if (state.tab === "cadastro") Object.values(TELAS).forEach((t) => t.ligarNoPerfil && t.ligarNoPerfil());
}

/* ----------------------------------------------------------------------- */
/* Fixo/parcelado: "só este mês", "daqui em diante" ou "todos os meses"     */
/* ----------------------------------------------------------------------- */
// Pergunta o alcance de uma mudança. opcoes: [[valor, rótulo, descrição]]. Resolve com o valor ou null.
function perguntarAlcance(titulo, texto, opcoes) {
  return new Promise((resolve) => {
    openModal(titulo, `<p class="modal-texto">${texto}</p>
      <div class="alcance-opcoes">${opcoes.map(([v, r, d]) => `<button type="button" class="alcance-opcao" data-alcance="${v}"><strong>${r}</strong>${d ? `<span>${d}</span>` : ""}</button>`).join("")}</div>`);
    let respondeu = false;
    document.querySelectorAll("[data-alcance]").forEach((b) => b.addEventListener("click", () => { respondeu = true; closeModal(); resolve(b.dataset.alcance); }));
    const fechar = () => { if (!respondeu) resolve(null); };
    document.getElementById("modal-close").addEventListener("click", fechar);
    document.getElementById("modal-overlay").addEventListener("click", (e) => { if (e.target.id === "modal-overlay") fechar(); });
  });
}
// Divide um fixo em dois a partir de "mes": o original termina no mês anterior e um novo
// começa em "mes" com as mudanças. Devolve o novo.
function dividirFixo(tx, mes, mudancas) {
  const excAntes = {}; const excDepois = {};
  Object.entries(tx.excecoes || {}).forEach(([m, v]) => { (m < mes ? excAntes : excDepois)[m] = v; });
  const novo = { ...tx, ...mudancas, id: uid(), date: Calculos.diaNoMes(mes, parseInt(String(tx.date).slice(8, 10), 10)), excecoes: excDepois, comprovantes: [] };
  tx.fimEm = Calculos.somarMeses(mes, -1);
  tx.excecoes = excAntes;
  state.txs = [novo, ...state.txs];
  return novo;
}
async function mudarValorDoLancamento(tx, mes, valor) {
  if (tx.recurrence === "fixo" || tx.recurrence === "parcelado") {
    const fixo = tx.recurrence === "fixo";
    const alcance = await perguntarAlcance("Mudar o valor", `Novo valor: <b>${fmtBRL(valor)}</b>. Onde aplicar?`, fixo ? [
      ["mes", "Só em " + monthLabel(mes), "Os outros meses continuam como estão."],
      ["daqui", "De " + monthLabel(mes) + " em diante", "Os meses anteriores ficam com o valor antigo."],
      ["todos", "Em todos os meses", ""],
    ] : [
      ["mes", "Só nesta parcela", ""],
      ["todos", "Em todas as parcelas", ""],
    ]);
    if (!alcance) { render(); return; }
    if (alcance === "mes") {
      tx.excecoes = { ...(tx.excecoes || {}), [mes]: { ...((tx.excecoes || {})[mes] || {}), value: valor } };
    } else if (alcance === "daqui" && Calculos.anoMes(tx.date) < mes) {
      dividirFixo(tx, mes, { value: valor });
    } else {
      tx.value = valor;
      if (tx.excecoes) Object.values(tx.excecoes).forEach((e) => { delete e.value; });
    }
  } else {
    tx.value = valor;
  }
  saveTxs(); render();
  avisarOrcamento(tx, mes);
}
async function excluirLancamento(tx, mes) {
  if (tx.recurrence === "fixo" || tx.recurrence === "parcelado") {
    const fixo = tx.recurrence === "fixo";
    const alcance = await perguntarAlcance("Excluir lançamento", `<b>${escapeHtml(tx.desc)}</b> se repete. O que excluir?`, fixo ? [
      ["mes", "Só " + monthLabel(mes), "Some apenas deste mês."],
      ["daqui", "De " + monthLabel(mes) + " em diante", "Os meses anteriores continuam registrados."],
      ["todos", "Todos os meses", "Apaga o lançamento inteiro."],
    ] : [
      ["mes", "Só esta parcela", ""],
      ["todos", "Todas as parcelas", "Apaga o lançamento inteiro."],
    ]);
    if (!alcance) return;
    if (alcance === "mes") {
      tx.excecoes = { ...(tx.excecoes || {}), [mes]: { ...((tx.excecoes || {})[mes] || {}), removido: true } };
    } else if (alcance === "daqui" && Calculos.anoMes(tx.date) < mes) {
      tx.fimEm = Calculos.somarMeses(mes, -1);
    } else {
      apagarLancamento(tx);
    }
  } else {
    if (!confirm(`Excluir "${tx.desc}"?`)) return;
    apagarLancamento(tx);
  }
  saveTxs(); render();
}
function apagarLancamento(tx) {
  state.txs = state.txs.filter((t) => t.id !== tx.id);
  if ((tx.comprovantes || []).length) api("DELETE", `/financeiro/comprovantes/do-lancamento?lancamento=${encodeURIComponent(tx.id)}`).catch(() => {});
}

/* ----------------------------------------------------------------------- */
/* Avisos rápidos (toast) e alerta de orçamento                             */
/* ----------------------------------------------------------------------- */
function toast(texto, tipo = "info") {
  let el = document.getElementById("toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.className = `toast toast-${tipo} visivel`;
  el.innerHTML = texto;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("visivel"), 5200);
}
// Depois de lançar uma despesa: avisa quando a categoria passa de 80% ou de 100% do orçamento
function avisarOrcamento(tx, mes) {
  if (!tx || tx.type !== "Despesa" || !window.situacaoDoOrcamento) return;
  const sit = situacaoDoOrcamento(tx.category, mes || Calculos.anoMes(tx.date));
  if (!sit) return;
  if (sit.pct >= 1) toast(`⚠️ <b>${escapeHtml(tx.category)}</b> passou do orçamento de ${monthLabel(sit.mes)}: ${fmtBRL(sit.gasto)} de ${fmtBRL(sit.limite)}.`, "erro");
  else if (sit.pct >= 0.8) toast(`Atenção: <b>${escapeHtml(tx.category)}</b> já usou ${fmtPct(sit.pct)} do orçamento de ${monthLabel(sit.mes)}.`, "aviso");
}

// Reduz a foto pra no máximo 256px (JPEG) antes de salvar na conta
function reduzirFoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const lado = 256;
      const escala = Math.min(1, lado / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("imagem inválida")); };
    img.src = url;
  });
}

/* ----------------------------------------------------------------------- */
/* Modal genérico                                                           */
/* ----------------------------------------------------------------------- */
function closeModal() { document.getElementById("modal-root").innerHTML = ""; }
function openModal(title, bodyHtml) {
  document.getElementById("modal-root").innerHTML = `<div class="modal-overlay" id="modal-overlay"><div class="modal-box">
    <div class="modal-head"><h3 class="modal-title">${title}</h3><button class="icon-btn" id="modal-close">✕</button></div>${bodyHtml}
  </div></div>`;
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-overlay").addEventListener("click", (e) => { if (e.target.id === "modal-overlay") closeModal(); });
}
function chipGroup(name, options, selected, color) {
  return `<div class="chip-group" data-chipgroup="${name}">${options.map((o) => `<button type="button" class="chip ${o === selected ? "selected" : ""}" data-value="${o}" style="${o === selected ? `background:${color};border-color:${color}` : ""}">${o}</button>`).join("")}</div>`;
}
function wireChipGroup(name, onChange) {
  document.querySelectorAll(`[data-chipgroup="${name}"] .chip`).forEach((chip) => chip.addEventListener("click", () => onChange(chip.dataset.value)));
}

/* ---- Lançamento (com recorrência, conta, cartão e comprovantes) ----
   O mesmo formulário serve pra criar e editar. Num fixo/parcelado, o que muda aqui vale
   pra todos os meses; pra mudar um mês só, edite o valor ou o status direto na tabela. */
// Conta que já vem marcada num lançamento novo: a última usada com essa forma de pagamento
// (ou a primeira conta cadastrada)
function contaSugerida(forma) {
  const ultima = state.txs.find((tx) => tx.contaId && tx.account === forma && state.contas.some((k) => k.id === tx.contaId))
    || state.txs.find((tx) => tx.contaId && state.contas.some((k) => k.id === tx.contaId));
  return ultima ? ultima.contaId : (state.contas[0] ? state.contas[0].id : "");
}
const ROTULO_RECORRENCIA = { unico: "Único", fixo: "Fixo (todo mês)", parcelado: "Parcelado" };
function openTxModal(existing, defaultScope, preenchido) {
  const base = { date: todayISO(), desc: "", type: "Despesa", category: categoriasDe("Despesa")[0], scope: defaultScope || "Pessoal", account: CONTAS[0], status: "Pago", value: "", recurrence: "unico", parcelas: 2, fimEm: "", cardId: "", contaId: contaSugerida(CONTAS[0]), comprovantes: [] };
  const f = existing ? { ...base, ...existing, fimEm: existing.fimEm || "", cardId: existing.cardId || "", contaId: existing.contaId || "" } : { ...base, ...(preenchido || {}) };
  if (!f.id) f.id = uid();
  const isEdit = !!existing;
  const enviadosAgora = []; // comprovantes enviados neste formulário (apagados se cancelar um lançamento novo)
  const draw = () => {
    const cats = categoriasDe(f.type);
    if (f.category && !cats.includes(f.category)) cats.unshift(f.category);
    const recorrente = f.recurrence !== "unico";
    const noCartao = f.account === Calculos.CARTAO;
    if (noCartao && !f.cardId && state.cards.length === 1) f.cardId = state.cards[0].id;
    openModal(isEdit ? "Editar lançamento" : "Novo lançamento", `
      <div class="field"><label>Descrição</label><input id="f-desc" value="${escapeHtml(f.desc)}" placeholder="Ex.: Supermercado" /></div>
      <div class="field-row">
        <div class="field"><label>Valor ${recorrente ? (f.recurrence === "parcelado" ? "(de cada parcela)" : "(por mês)") : ""} (R$)</label><input id="f-value" type="number" step="0.01" inputmode="decimal" value="${f.value}" placeholder="0,00" /></div>
        <div class="field"><label>Tipo</label>${chipGroup("type", ["Despesa","Receita"], f.type, f.type === "Receita" ? COLORS.pessoal : COLORS.red)}</div>
      </div>
      <div class="field"><label>Data ${recorrente ? "(primeiro mês)" : ""}</label><input id="f-date" type="date" value="${f.date}" /></div>
      <div class="field"><label>Recorrência</label>${chipGroup("recurrence", Object.values(ROTULO_RECORRENCIA), ROTULO_RECORRENCIA[f.recurrence], COLORS.gold)}</div>
      ${f.recurrence === "parcelado" ? `<div class="field"><label>Número de parcelas</label><input id="f-parcelas" type="number" min="2" max="120" value="${f.parcelas || 2}" /></div>` : ""}
      ${f.recurrence === "fixo" ? `<div class="field"><label>Repete até (opcional)</label><input id="f-fim" type="month" value="${f.fimEm || ""}" /><p class="field-ajuda">Deixe em branco pra repetir sem data para acabar.</p></div>` : ""}
      <div class="field"><label>Escopo</label>${chipGroup("scope", ["Pessoal","Empresa"], f.scope, f.scope === "Empresa" ? COLORS.empresa : COLORS.pessoal)}</div>
      <div class="field"><label>Categoria</label>${chipGroup("category", cats, f.category, COLORS.gold)}
        <button type="button" class="link-btn" id="f-nova-cat">+ Nova categoria</button></div>
      <div class="field"><label>Forma de pagamento</label>${chipGroup("account", CONTAS, f.account, "var(--char)")}</div>
      ${noCartao ? (state.cards.length
        ? `<div class="field"><label>Cartão</label>${chipGroup("card", state.cards.map((c) => c.name), (state.cards.find((c) => c.id === f.cardId) || {}).name, "var(--char)")}${f.type === "Despesa" && f.cardId ? `<p class="field-ajuda">Entra na fatura que vence em ${monthLabel(Calculos.faturaDaCompra(state.cards.find((c) => c.id === f.cardId), f.date))}.</p>` : ""}</div>`
        : `<p class="field-ajuda">Cadastre seus cartões na aba Cartões pra ver a fatura de cada um.</p>`) : ""}
      ${!noCartao && state.contas.length ? `<div class="field"><label>Conta ${f.type === "Receita" ? "onde entra" : "de onde sai"}</label>${chipGroup("conta", ["Nenhuma", ...state.contas.map((k) => k.name)], (state.contas.find((k) => k.id === f.contaId) || {}).name || "Nenhuma", "var(--char)")}</div>` : ""}
      <div class="field"><label>${recorrente ? "Status padrão (cada mês pode ser marcado à parte)" : "Status"}</label>${chipGroup("status", STATUS_OPTIONS, f.status, COLORS.pessoal)}</div>
      ${window.comprovantesNoFormulario ? comprovantesNoFormulario(f) : ""}
      <button ${!f.desc || f.value === "" ? "disabled" : ""} class="btn save-btn" id="f-save" style="background:${f.scope === "Empresa" ? COLORS.empresa : COLORS.pessoal}">Salvar lançamento</button>
    `);
    document.getElementById("f-desc").addEventListener("input", (e) => { f.desc = e.target.value; atualizarBotao(); });
    document.getElementById("f-value").addEventListener("input", (e) => { f.value = e.target.value; atualizarBotao(); });
    document.getElementById("f-date").addEventListener("change", (e) => { f.date = e.target.value; if (noCartao) draw(); });
    const parcelasInput = document.getElementById("f-parcelas");
    if (parcelasInput) parcelasInput.addEventListener("input", (e) => { f.parcelas = e.target.value; });
    const fimInput = document.getElementById("f-fim");
    if (fimInput) fimInput.addEventListener("change", (e) => { f.fimEm = e.target.value; });
    wireChipGroup("recurrence", (label) => { f.recurrence = Object.keys(ROTULO_RECORRENCIA).find((k) => ROTULO_RECORRENCIA[k] === label); draw(); });
    wireChipGroup("type", (v) => { f.type = v; f.category = categoriasDe(v)[0]; draw(); });
    wireChipGroup("scope", (v) => { f.scope = v; draw(); });
    wireChipGroup("category", (v) => { f.category = v; draw(); });
    wireChipGroup("account", (v) => { f.account = v; if (!isEdit && !f.contaId) f.contaId = contaSugerida(v); draw(); });
    wireChipGroup("card", (nome) => { f.cardId = (state.cards.find((c) => c.name === nome) || {}).id || ""; draw(); });
    wireChipGroup("conta", (nome) => { f.contaId = (state.contas.find((k) => k.name === nome) || {}).id || ""; draw(); });
    wireChipGroup("status", (v) => { f.status = v; draw(); });
    document.getElementById("f-nova-cat").addEventListener("click", () => {
      const nome = (prompt(`Nome da nova categoria de ${f.type === "Receita" ? "receita" : "despesa"}:`) || "").trim().slice(0, 40);
      if (!nome) return;
      if (!categoriasDe(f.type).includes(nome)) { state.categorias = [...state.categorias, { id: uid(), nome, tipo: f.type, dedutivel: false }]; saveCategorias(); }
      f.category = nome; draw();
    });
    if (window.ligarComprovantesNoFormulario) ligarComprovantesNoFormulario(f, enviadosAgora, draw);
    const fecharSemSalvar = () => { if (!isEdit && enviadosAgora.length) enviadosAgora.forEach((id) => api("DELETE", `/financeiro/comprovantes/${id}`).catch(() => {})); };
    document.getElementById("modal-close").addEventListener("click", fecharSemSalvar);
    document.getElementById("modal-overlay").addEventListener("click", (e) => { if (e.target.id === "modal-overlay") fecharSemSalvar(); });
    document.getElementById("f-save").addEventListener("click", () => {
      if (!f.desc || f.value === "") return;
      const data = { ...f, value: parseFloat(f.value) || 0, parcelas: f.recurrence === "parcelado" ? (parseInt(f.parcelas, 10) || 2) : null };
      if (data.recurrence !== "fixo" || !data.fimEm) delete data.fimEm;
      if (data.account !== Calculos.CARTAO) delete data.cardId; else delete data.contaId;
      if (!data.cardId) delete data.cardId;
      if (!data.contaId) delete data.contaId;
      if (data.recurrence === "unico") delete data.excecoes;
      const exists = state.txs.some((t) => t.id === data.id);
      state.txs = exists ? state.txs.map((t) => (t.id === data.id ? data : t)) : [data, ...state.txs];
      saveTxs(); closeModal(); render();
      avisarOrcamento(data, Calculos.anoMes(data.date));
    });
  };
  const atualizarBotao = () => { const b = document.getElementById("f-save"); if (b) b.disabled = !f.desc || f.value === ""; };
  draw();
}

function openInvModal(existing) {
  const f = existing ? { ...existing } : { name: "", type: TIPOS_INVEST[0], scope: "Pessoal", institution: "", date: todayISO(), applied: "", current: "" };
  const draw = () => {
    openModal(existing ? "Editar investimento" : "Novo investimento", `
      <div class="field"><label>Ativo / Aplicação</label><input id="f-name" value="${escapeHtml(f.name)}" /></div>
      <div class="field"><label>Tipo</label>${chipGroup("type", TIPOS_INVEST, f.type, COLORS.pessoal)}</div>
      <div class="field"><label>Escopo</label>${chipGroup("scope", ["Pessoal","Empresa"], f.scope, f.scope === "Empresa" ? COLORS.empresa : COLORS.pessoal)}</div>
      <div class="field"><label>Instituição</label><input id="f-inst" value="${escapeHtml(f.institution || "")}" /></div>
      <div class="field"><label>Data da aplicação</label><input id="f-date" type="date" value="${f.date}" /></div>
      <div class="field-row">
        <div class="field"><label>Valor aplicado (R$)</label><input id="f-applied" type="number" value="${f.applied}" /></div>
        <div class="field"><label>Valor atual (R$)</label><input id="f-current" type="number" value="${f.current}" /></div>
      </div>
      <button class="btn save-btn pessoal" id="f-save">Salvar investimento</button>
    `);
    document.getElementById("f-name").addEventListener("input", (e) => { f.name = e.target.value; });
    document.getElementById("f-inst").addEventListener("input", (e) => { f.institution = e.target.value; });
    document.getElementById("f-date").addEventListener("change", (e) => { f.date = e.target.value; });
    document.getElementById("f-applied").addEventListener("input", (e) => { f.applied = e.target.value; });
    document.getElementById("f-current").addEventListener("input", (e) => { f.current = e.target.value; });
    wireChipGroup("type", (v) => { f.type = v; draw(); });
    wireChipGroup("scope", (v) => { f.scope = v; draw(); });
    document.getElementById("f-save").addEventListener("click", () => {
      if (!f.name) return;
      const data = { ...f, applied: parseFloat(f.applied) || 0, current: parseFloat(f.current) || 0, id: f.id || uid() };
      const exists = state.invs.some((i) => i.id === data.id);
      state.invs = exists ? state.invs.map((i) => (i.id === data.id ? data : i)) : [...state.invs, data];
      saveInvs(); closeModal(); render();
    });
  };
  draw();
}
function openGoalModal(existing) {
  const f = existing ? { ...existing } : { name: "", scope: "Pessoal", target: "", current: "", deadline: "2026-12-31" };
  const draw = () => {
    openModal(existing ? "Editar objetivo" : "Novo objetivo", `
      <div class="field"><label>Objetivo</label><input id="f-name" value="${escapeHtml(f.name)}" placeholder="Ex.: Reserva de emergência" /></div>
      <div class="field"><label>Escopo</label>${chipGroup("scope", ["Pessoal","Empresa"], f.scope, f.scope === "Empresa" ? COLORS.empresa : COLORS.pessoal)}</div>
      <div class="field-row">
        <div class="field"><label>Valor meta (R$)</label><input id="f-target" type="number" value="${f.target}" /></div>
        <div class="field"><label>Valor atual (R$)</label><input id="f-current" type="number" value="${f.current}" /></div>
      </div>
      <div class="field"><label>Prazo</label><input id="f-deadline" type="date" value="${f.deadline}" /></div>
      <button class="btn save-btn gold" id="f-save">Salvar objetivo</button>
    `);
    document.getElementById("f-name").addEventListener("input", (e) => { f.name = e.target.value; });
    document.getElementById("f-target").addEventListener("input", (e) => { f.target = e.target.value; });
    document.getElementById("f-current").addEventListener("input", (e) => { f.current = e.target.value; });
    document.getElementById("f-deadline").addEventListener("change", (e) => { f.deadline = e.target.value; });
    wireChipGroup("scope", (v) => { f.scope = v; draw(); });
    document.getElementById("f-save").addEventListener("click", () => {
      if (!f.name) return;
      const data = { ...f, target: parseFloat(f.target) || 0, current: parseFloat(f.current) || 0, id: f.id || uid() };
      const exists = state.goals.some((g) => g.id === data.id);
      state.goals = exists ? state.goals.map((g) => (g.id === data.id ? data : g)) : [...state.goals, data];
      saveGoals(); closeModal(); render();
    });
  };
  draw();
}

/* ----------------------------------------------------------------------- */
/* Onboarding — perguntas rápidas que definem o personagem                 */
/* ----------------------------------------------------------------------- */
/* No 1º acesso a pessoa responde perguntas curtas; cada resposta soma pontos
   para um dos 4 perfis. O perfil vencedor + a preferência (feminino/masculino)
   escolhe um dos modelos de CHARACTERS, e a pessoa dá um nome ao personagem.
   Os modelos também aparecem em "Trocar personagem" (Meu perfil), só pela
   palavra que os representa ("O Organizado", "A Investidora"...). */
const QUIZ = [
  {
    pergunta: "Quando o dinheiro cai na conta, o que costuma acontecer?",
    opcoes: [
      { texto: "Já está tudo planejado", pontos: { organizadora: 2 } },
      { texto: "Pago as contas e o resto vai embora", pontos: { consumista: 2 } },
      { texto: "Boa parte já está comprometida com dívidas", pontos: { recomeco: 2 } },
      { texto: "Separo uma parte para investir", pontos: { investidora: 2 } },
    ],
  },
  {
    pergunta: "Como estão suas dívidas hoje?",
    opcoes: [
      { texto: "Não tenho, ou estão sob controle", pontos: { organizadora: 1, investidora: 1 } },
      { texto: "Tenho algumas parcelas, mas dou conta", pontos: { consumista: 1 } },
      { texto: "Estão me apertando", pontos: { recomeco: 3 } },
    ],
  },
  {
    pergunta: "Aparece uma promoção imperdível. Você…",
    opcoes: [
      { texto: "Compra na hora", pontos: { consumista: 3 } },
      { texto: "Só compra se já estava nos planos", pontos: { organizadora: 2 } },
      { texto: "Pensa em quanto aquilo renderia investido", pontos: { investidora: 2 } },
      { texto: "Nem olha: o orçamento não permite", pontos: { recomeco: 2 } },
    ],
  },
  {
    pergunta: "Você tem dinheiro guardado ou investido?",
    opcoes: [
      { texto: "Tenho investimentos e acompanho", pontos: { investidora: 3 } },
      { texto: "Tenho uma reserva para emergências", pontos: { organizadora: 2 } },
      { texto: "Pouco ou nada", pontos: { consumista: 1, recomeco: 1 } },
      { texto: "Não, estou no vermelho", pontos: { recomeco: 2 } },
    ],
  },
  {
    pergunta: "Qual é o seu principal objetivo agora?",
    opcoes: [
      { texto: "Organizar as contas", pontos: { organizadora: 3 } },
      { texto: "Sair das dívidas", pontos: { recomeco: 3 } },
      { texto: "Gastar com mais consciência", pontos: { consumista: 3 } },
      { texto: "Fazer o dinheiro render", pontos: { investidora: 3 } },
    ],
    desempate: true, // em caso de empate, vale o perfil do objetivo
  },
  {
    pergunta: "Como você prefere o seu personagem?",
    opcoes: [
      { texto: "Feminino", genero: "f" },
      { texto: "Masculino", genero: "m" },
    ],
  },
];

const NOMES_PRONTOS = {
  f: ["Lily", "Júlia", "Maria", "Sofia", "Ana", "Clara", "Helena", "Laura"],
  m: ["Mateus", "Jonathan", "Lucas", "Rafael", "Pedro", "Gabriel", "Davi", "Miguel"],
};

// Resultado do questionário: { perfil, genero, character } a partir das respostas (índices).
function resultadoDoQuiz(respostas) {
  const placar = { organizadora: 0, recomeco: 0, consumista: 0, investidora: 0 };
  let genero = "f";
  let desempate = null;
  QUIZ.forEach((q, i) => {
    const op = q.opcoes[respostas[i]];
    if (!op) return;
    if (op.genero) genero = op.genero;
    if (op.pontos) for (const [p, n] of Object.entries(op.pontos)) placar[p] += n;
    if (q.desempate && op.pontos) desempate = Object.keys(op.pontos)[0];
  });
  const maior = Math.max(...Object.values(placar));
  const empatados = Object.keys(placar).filter((p) => placar[p] === maior);
  const perfil = empatados.includes(desempate) ? desempate : empatados[0];
  const character = CHARACTERS.find((c) => c.profile === perfil && c.gender === genero) || CHARACTERS[0];
  return { perfil, genero, character };
}

// Nome do personagem: o que a pessoa escolheu, ou o nome original do modelo.
function nomeDoPersonagem() {
  const char = getCharacter();
  if (!char) return "";
  return (state.profile && state.profile.characterName) || char.name;
}

function escolhaDeNomeHtml(char, nomeAtual) {
  const prontos = [char.name, ...NOMES_PRONTOS[char.gender].filter((n) => n !== char.name)];
  return `
    <div class="nome-personagem">
      <label class="nome-personagem-label" for="onb-char-name">Dê um nome ao seu personagem</label>
      <input id="onb-char-name" class="onb-name-input" maxlength="30" placeholder="Digite um nome" value="${escapeHtml(nomeAtual)}" />
      <p class="nome-personagem-ou">ou escolha um pronto</p>
      <div class="nomes-prontos">${prontos.map((n) => `<button type="button" class="nome-pronto ${n === nomeAtual ? "selected" : ""}" data-nome="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join("")}</div>
    </div>`;
}
function ligarEscolhaDeNome(root) {
  const input = root.querySelector("#onb-char-name");
  const marcar = () => root.querySelectorAll(".nome-pronto").forEach((b) => b.classList.toggle("selected", b.dataset.nome === input.value.trim()));
  root.querySelectorAll(".nome-pronto").forEach((b) => b.addEventListener("click", () => { input.value = b.dataset.nome; marcar(); }));
  input.addEventListener("input", marcar);
  return () => input.value.trim();
}

function renderCharacterCard(c, selectedId) {
  const colors = PROFILE_COLORS[c.profile];
  const palavra = c.title.split(" ").slice(1).join(" ");
  return `<button type="button" class="char-card ${c.id === selectedId ? "selected" : ""}" data-char="${c.id}" style="--sel-color:${colors.primary};--sel-color-soft:${colors.soft}">
    <div class="char-avatar" style="background:${colors.primary}">${escapeHtml(palavra[0] || "?")}</div>
    <p class="char-name">${escapeHtml(c.title)}</p>
    <p class="char-desc">${escapeHtml(c.desc)}</p>
  </button>`;
}

// Seletor de modelos: primeiro Feminino ou Masculino, depois só as 4 opções daquele gênero.
function seletorDeModelos(genero, selecionado) {
  const lista = CHARACTERS.filter((c) => c.gender === genero);
  return `<div class="genero-escolha" role="radiogroup" aria-label="Personagem feminino ou masculino">
      <button type="button" class="genero-opcao ${genero === "f" ? "ativo" : ""}" data-genero="f" role="radio" aria-checked="${genero === "f"}">Feminino</button>
      <button type="button" class="genero-opcao ${genero === "m" ? "ativo" : ""}" data-genero="m" role="radio" aria-checked="${genero === "m"}">Masculino</button>
    </div>
    <div class="onb-grid modelos-grid">${lista.map((c) => renderCharacterCard(c, selecionado)).join("")}</div>`;
}
// Liga o seletor: trocar o gênero redesenha; escolher um modelo chama aoEscolher(personagem)
function ligarSeletorDeModelos(root, redesenhar, aoEscolher) {
  root.querySelectorAll("[data-genero]").forEach((b) => b.addEventListener("click", () => redesenhar(b.dataset.genero)));
  root.querySelectorAll("[data-char]").forEach((b) => b.addEventListener("click", () => aoEscolher(CHARACTERS.find((c) => c.id === b.dataset.char))));
}

// Questionário (1º acesso em tela cheia; "Refazer as perguntas" abre em janela).
function openQuiz(isRefazer) {
  const root = isRefazer ? null : document.getElementById("onboarding-root");
  const respostas = [];
  let passo = 0;
  let resultado = null;

  const montar = (html) => {
    if (isRefazer) {
      openModal("Refazer as perguntas", `<div class="quiz quiz-modal">${html}</div>`);
      return document.getElementById("modal-root");
    }
    root.innerHTML = `<div class="onb-wrap quiz">${html}</div>`;
    return root;
  };

  const desenharPergunta = () => {
    const q = QUIZ[passo];
    const el = montar(`
      ${!isRefazer && passo === 0 ? `<div class="onb-head"><h1>Vamos montar seu perfil</h1><p>Responda ${QUIZ.length} perguntas rápidas. As dicas e a cor do painel vão acompanhar o seu jeito de lidar com dinheiro.</p></div>` : ""}
      <div class="quiz-card">
        <div class="quiz-progresso" aria-hidden="true">${QUIZ.map((_, i) => `<span class="${i < passo ? "feito" : i === passo ? "atual" : ""}"></span>`).join("")}</div>
        <p class="quiz-contador">Pergunta ${passo + 1} de ${QUIZ.length}</p>
        <h2 class="quiz-pergunta">${escapeHtml(q.pergunta)}</h2>
        <div class="quiz-opcoes">${q.opcoes.map((o, i) => `<button type="button" class="quiz-opcao ${respostas[passo] === i ? "selected" : ""}" data-opcao="${i}">${escapeHtml(o.texto)}</button>`).join("")}</div>
        ${passo > 0 ? `<button type="button" class="quiz-voltar" id="quiz-voltar">← Voltar</button>` : ""}
      </div>`);
    el.querySelectorAll("[data-opcao]").forEach((b) => b.addEventListener("click", () => {
      respostas[passo] = parseInt(b.dataset.opcao, 10);
      if (passo < QUIZ.length - 1) { passo++; desenharPergunta(); }
      else { resultado = resultadoDoQuiz(respostas); desenharResultado(resultado.character); }
    }));
    const voltar = el.querySelector("#quiz-voltar");
    if (voltar) voltar.addEventListener("click", () => { passo--; desenharPergunta(); });
  };

  const desenharResultado = (char) => {
    const colors = PROFILE_COLORS[char.profile];
    const nomeAtual = isRefazer && state.profile && state.profile.character === char.id ? nomeDoPersonagem() : char.name;
    const el = montar(`
      <div class="quiz-card quiz-resultado" style="--sel-color:${colors.primary};--sel-color-soft:${colors.soft}">
        <p class="quiz-contador">Seu perfil</p>
        <h2 class="quiz-perfil" style="color:${colors.primary}">${escapeHtml(char.title)}</h2>
        <p class="quiz-perfil-desc">${escapeHtml(char.desc)}</p>
        ${escolhaDeNomeHtml(char, nomeAtual)}
        <button class="btn char save-btn" id="quiz-confirmar" style="background:${colors.primary};border-color:${colors.primary}">${isRefazer ? "Usar este personagem" : "Começar"}</button>
        <div class="quiz-links">
          <button type="button" class="quiz-voltar" id="quiz-refazer">Refazer as perguntas</button>
          <button type="button" class="quiz-voltar" id="quiz-outro">Prefiro escolher outro</button>
        </div>
      </div>`);
    const lerNome = ligarEscolhaDeNome(el);
    el.querySelector("#quiz-refazer").addEventListener("click", () => { respostas.length = 0; passo = 0; desenharPergunta(); });
    el.querySelector("#quiz-outro").addEventListener("click", () => desenharModelos(char.id));
    el.querySelector("#quiz-confirmar").addEventListener("click", () => concluir(char, lerNome()));
  };

  const desenharModelos = (selecionado, genero) => {
    const sel = CHARACTERS.find((c) => c.id === selecionado);
    const g = genero || (sel ? sel.gender : resultado.genero) || "f";
    const el = montar(`
      <div class="quiz-card">
        <h2 class="quiz-pergunta">Escolha o personagem</h2>
        ${seletorDeModelos(g, selecionado)}
        <button type="button" class="quiz-voltar" id="quiz-voltar-resultado">← Voltar para o resultado</button>
      </div>`);
    ligarSeletorDeModelos(el, (novo) => desenharModelos(selecionado, novo), (c) => desenharResultado(c));
    el.querySelector("#quiz-voltar-resultado").addEventListener("click", () => desenharResultado(resultado.character));
  };

  const concluir = (char, nome) => {
    const quiz = { respostas: respostas.slice(), perfilSugerido: resultado.perfil, respondidoEm: todayISO() };
    if (isRefazer) {
      Object.assign(state.profile, { character: char.id, characterName: nome || char.name, quiz });
      saveProfile(); closeModal(); applyTheme(); render();
    } else {
      state.profile = { name: primeiroNome() || "Você", character: char.id, characterName: nome || char.name, photo: null, quiz };
      saveProfile();
      startApp();
    }
  };

  desenharPergunta();
}

// "Trocar personagem": modelos pela palavra que os representa; depois, o nome.
function openCharacterPicker() {
  let selectedId = state.profile ? state.profile.character : null;
  const atual = CHARACTERS.find((c) => c.id === selectedId);
  let genero = atual ? atual.gender : "f";
  const desenharModelos = () => {
    openModal("Trocar personagem", `
      <p class="quiz-modal-sub">Escolha o personagem que mais combina com você agora.</p>
      ${seletorDeModelos(genero, selectedId)}`);
    ligarSeletorDeModelos(document.getElementById("modal-root"), (g) => { genero = g; desenharModelos(); }, (c) => { selectedId = c.id; desenharNome(); });
  };
  const desenharNome = () => {
    const char = CHARACTERS.find((c) => c.id === selectedId);
    const colors = PROFILE_COLORS[char.profile];
    const nomeAtual = state.profile.character === char.id ? nomeDoPersonagem() : char.name;
    openModal("Trocar personagem", `
      <div class="quiz-resultado" style="--sel-color:${colors.primary};--sel-color-soft:${colors.soft}">
        <h2 class="quiz-perfil" style="color:${colors.primary}">${escapeHtml(char.title)}</h2>
        <p class="quiz-perfil-desc">${escapeHtml(char.desc)}</p>
        ${escolhaDeNomeHtml(char, nomeAtual)}
        <button class="btn char save-btn" id="troca-confirmar" style="background:${colors.primary};border-color:${colors.primary}">Trocar personagem</button>
        <div class="quiz-links"><button type="button" class="quiz-voltar" id="troca-voltar">← Escolher outro</button></div>
      </div>`);
    const root = document.getElementById("modal-root");
    const lerNome = ligarEscolhaDeNome(root);
    root.querySelector("#troca-voltar").addEventListener("click", desenharModelos);
    root.querySelector("#troca-confirmar").addEventListener("click", () => {
      Object.assign(state.profile, { character: char.id, characterName: lerNome() || char.name });
      saveProfile(); closeModal(); applyTheme(); render();
    });
  };
  desenharModelos();
}

/* ----------------------------------------------------------------------- */
/* Inicialização                                                            */
/* ----------------------------------------------------------------------- */
function primeiroNome() {
  const nome = state.user && state.user.nome ? String(state.user.nome).trim() : "";
  return nome ? nome.split(/\s+/)[0] : "";
}
function irParaAba(tab) {
  state.tab = tab;
  document.querySelectorAll(".nav-item[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  render();
  window.scrollTo(0, 0);
}
function startApp() {
  document.getElementById("onboarding-root").style.display = "none";
  document.getElementById("onboarding-root").innerHTML = "";
  document.getElementById("app-root").style.display = "flex";
  applyTheme();
  render();
  atualizarStatusSalvamento();
  ligarAssistenteIA();
  perguntarModoCrm();
}

// Primeiro acesso: como o financeiro trata o que vem do CRM (uma vez só; muda depois em Lucro)
function perguntarModoCrm() {
  const c = state.config || {};
  if (c.integracaoCrmPerguntado || state.modoCrmJaSalvo) return;
  const opcoes = [
    ["vendas", "Eu vendo produtos ou serviços", "Cada venda fechada no CRM vira receita aqui, com o valor final e as parcelas."],
    ["comissoes", "Eu ganho comissão sobre as vendas", "Entra aqui só a sua comissão, da aba Comissões do CRM."],
    ["nenhum", "Não quero ligar ao CRM", "O CRM e o financeiro ficam separados."],
  ];
  openModal("Uma pergunta rápida", `
    <p class="modo-crm-texto">O Livro-Caixa também tem um CRM. Como o financeiro deve tratar o que você fecha lá? Dá pra mudar depois na aba Lucro.</p>
    <div class="integ-opcoes modo-crm-opcoes">${opcoes.map(([k, t, d]) => `<button type="button" class="integ-opcao" data-modo-crm="${k}"><span class="integ-titulo">${t}</span><span class="integ-desc">${d}</span></button>`).join("")}</div>`);
  document.querySelectorAll("[data-modo-crm]").forEach((b) => b.addEventListener("click", () => {
    state.config = { ...state.config, integracaoCrm: b.dataset.modoCrm, integracaoCrmPerguntado: true };
    saveConfig(); closeModal(); render();
  }));
  // fechar sem responder: pergunta de novo na próxima vez
}

// Voltou pra esta aba (ex.: fechou uma venda no CRM em outra aba): busca os lançamentos de novo
async function recarregarAoVoltar() {
  if (document.visibilityState !== "visible" || !state.carregadoEm) return;
  if (salvamento.pendentes.size || salvamento.salvando) return;
  if (document.getElementById("modal-root").innerHTML.trim()) return; // não mexe com janela aberta
  try {
    const [fin] = await Promise.all([api("GET", "/financeiro"), carregarCrm()]);
    if (salvamento.pendentes.size || salvamento.salvando) return; // mexeram enquanto buscava
    state.txs = (fin.dados && fin.dados.transacoes) || state.txs;
    state.carregadoEm = fin.carregadoEm || state.carregadoEm;
    render();
  } catch (e) { /* sem internet: fica com o que tem */ }
}
document.addEventListener("visibilitychange", recarregarAoVoltar);
// Assistente de IA (bolinha): o mesmo do CRM, em ../js/assistente-ia.js
let iaDisponivel = true;
function ligarAssistenteIA() {
  if (!window.AssistenteIA) { iaDisponivel = false; return; }
  AssistenteIA.iniciar({
    contexto: "financeiro",
    sugestoes: SUGESTOES_IA,
    alertas: () => buildAlerts().map((a) => ({ tipo: a.type === "warn" ? "aviso" : a.type, texto: a.text, acao: a.goto ? () => irParaAba(a.goto) : null })),
    antesDeEnviar: salvarTudoAgora,
    // a IA criou um lançamento: busca os dados de novo e redesenha
    depoisDeAlterar: async () => {
      try {
        await salvarTudoAgora();
        const fin = await api("GET", "/financeiro");
        state.txs = (fin.dados && fin.dados.transacoes) || state.txs;
        if (fin.carregadoEm) state.carregadoEm = fin.carregadoEm;
        render();
        toast("Lançamento criado pela conversa. Confira em Lançamentos.", "ok");
      } catch (e) { /* na próxima abertura aparece */ }
    },
  });
  fetch(API_BASE + "/config/integracoes").then((r) => (r.ok ? r.json() : null)).then((cfg) => {
    if (!cfg || cfg.assistenteIA !== false) return;
    iaDisponivel = false;
    AssistenteIA.definirHabilitado(false);
  }).catch(() => { /* sem resposta: mantém visível */ });
  // plano sem IA (Essencial): a bolinha some
  api("GET", "/assinatura").then((s) => {
    state.assinatura = s;
    if (s && s.recursos && s.recursos.ia === false) { iaDisponivel = false; AssistenteIA.definirHabilitado(false); }
    if (state.tab === "cadastro") render();
  }).catch(() => { /* sem resposta: mantém como está */ });
}
function telaDeErro(msg) {
  document.getElementById("onboarding-root").innerHTML = `<div class="carregando"><p>${escapeHtml(msg)}</p><button class="btn char" id="tentar-de-novo">Tentar de novo</button><p><a href="../inicio.html">Voltar</a></p></div>`;
  document.getElementById("tentar-de-novo").addEventListener("click", iniciar);
}
async function iniciar() {
  document.getElementById("onboarding-root").innerHTML = `<div class="carregando"><p>Carregando seu financeiro…</p></div>`;
  try {
    try { state.user = JSON.parse(localStorage.getItem("user") || "null"); } catch (e) {}
    const [me, fin] = await Promise.all([api("GET", "/auth/me").catch(() => null), api("GET", "/financeiro"), carregarCrm()]);
    if (me && me.user) { state.user = me.user; localStorage.setItem("user", JSON.stringify(me.user)); }
    const d = fin.dados || {};
    state.carregadoEm = fin.carregadoEm || null;
    state.txs = d.transacoes || [];
    state.cards = d.cartoes || [];
    state.invs = d.investimentos || [];
    state.goals = d.objetivos || [];
    state.profile = d.perfil || null;
    state.config = { integracaoCrm: "vendas", descontarComissoes: false, ...(d.config || {}) };
    state.modoCrmJaSalvo = !!(d.config && d.config.integracaoCrm !== undefined); // escolheu antes desta pergunta existir
    state.contas = d.contas || [];
    state.transferencias = d.transferencias || [];
    state.dividas = d.dividas || [];
    state.orcamentos = d.orcamentos || [];
    state.categorias = d.categorias || [];
  } catch (e) {
    telaDeErro(e.message || "Não foi possível carregar seus dados.");
    return;
  }
  document.getElementById("onboarding-root").innerHTML = "";
  if (state.profile && state.profile.character) startApp();
  else { document.getElementById("app-root").style.display = "none"; openQuiz(false); }
}
document.getElementById("logout-btn").addEventListener("click", () => {
  if (salvamento.pendentes.size || salvamento.salvando) { if (!confirm("Ainda há alterações sendo salvas. Sair mesmo assim?")) return; }
  sair();
});
iniciar();
