/* =======================================================================
   Livro-Caixa — PDV
   Produtos e estoque, venda no balcão, compras, notas de gasto e (restaurante) cardápio
   digital com pedido pelo WhatsApp. Tudo que mexe em dinheiro entra sozinho no Controle
   financeiro (o servidor cria os lançamentos — ver server/utils/estoque.js).
   Vanilla JS: cada aba é uma função que devolve HTML; os cliques passam por um só
   ouvinte (data-a="ação").
   ======================================================================= */
(function () {
  "use strict";

  const API = "/api";
  const token = localStorage.getItem("token");
  if (!token) { window.location.href = "../login.html"; return; }

  /* ----------------------------- utilidades ----------------------------- */
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtN = (n, casas = 3) => (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: casas });
  const num = (v) => { if (v === null || v === undefined || v === "") return NaN; const n = Number(String(v).replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")); return Number.isFinite(n) ? n : NaN; };
  const numOu = (v, padrao = 0) => { const n = num(v); return Number.isNaN(n) ? padrao : n; };
  const r2 = (n) => Math.round(n * 100) / 100;
  const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const dataBR = (iso) => { if (!iso) return ""; const [a, m, d] = String(iso).slice(0, 10).split("-"); return `${d}/${m}/${a}`; };
  const horaBR = (iso) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const UNIDADE_NOME = { un: "unidade", kg: "kg", g: "g", l: "litro", ml: "ml", m: "metro", cx: "caixa", pct: "pacote" };
  const unid = (u) => (u === "un" ? "un." : u);
  const inicial = (s) => esc(String(s || "?").trim().charAt(0).toUpperCase());
  const CATEGORIAS_GASTO = ["Aluguel Comercial", "Fornecedores", "Salários", "Comissões", "Marketing", "Impostos", "Frete", "Taxas de pagamento", "Ferramentas/Software", "Transporte", "Alimentação", "Moradia", "Outros"];

  function sair() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "../login.html";
  }

  async function api(metodo, caminho, corpo, tentativa = 0) {
    const opts = { method: metodo, headers: { Authorization: "Bearer " + token } };
    if (corpo !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(corpo); }
    let res;
    try { res = await fetch(API + caminho, opts); } catch (e) { throw new Error("Sem conexão com o servidor. Confira sua internet."); }
    if (res.status === 401) { sair(); throw new Error("Sessão expirada."); }
    if (res.status === 402) { window.location.href = "../assinatura.html?de=estoque"; throw new Error("Sua assinatura não está ativa."); }
    let dados = null;
    try { dados = await res.json(); } catch (e) { /* sem corpo */ }
    if (!res.ok) {
      const acordando = [502, 503, 504].includes(res.status) && (metodo === "GET" || (dados && dados.tentarDeNovo));
      if (acordando && tentativa < 2) { await new Promise((ok) => setTimeout(ok, tentativa ? 2500 : 1000)); return api(metodo, caminho, corpo, tentativa + 1); }
      throw new Error((dados && dados.error) || (acordando ? "O servidor está acordando. Tente de novo em alguns segundos." : "Erro de comunicação com o servidor."));
    }
    return dados;
  }

  function toast(html, tipo = "") {
    const el = $("#toast");
    el.className = `${tipo} visivel`;
    el.innerHTML = html;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("visivel"), tipo === "erro" ? 6000 : 5200);
  }

  /* ----------------------------- estado ----------------------------- */
  const S = {
    negocio: null, produtos: [], meios: [], unidades: [],
    tab: "inicio", resumo: null,
    vendas: null, mesVendas: hoje().slice(0, 7),
    compras: null, gastos: null, pedidos: null,
    // balcão
    carrinho: [], cartDescValor: "", cartDescTipo: "R$", cartMeio: "dinheiro", cartCliente: "", cartData: "", cartOutraData: false,
    cartCli: null, cartUsarBenef: false, // cliente escolhido no carrinho e se vai usar o cashback/prêmio
    clientes: null, emAberto: null, buscaCli: "", filtroCli: "",
    busca: "", catPdv: "", vendendo: false,
    // produtos
    buscaProd: "", filtroProd: "",
    gasto: { descricao: "", valor: "", categoria: "", data: "", meio: "dinheiro", pago: true },
  };
  const restaurante = () => S.negocio && S.negocio.tipo === "restaurante";
  const nomeMeio = (id) => (S.meios.find((m) => m.id === id) || { nome: id }).nome;
  const CURTO = { dinheiro: "Dinheiro", pix: "Pix", debito: "Débito", credito: "Crédito", transferencia: "Transferência", boleto: "Boleto", fiado: "Fiado", outro: "Outro" };
  const meioCurto = (id) => CURTO[id] || nomeMeio(id);
  // número para um campo de texto: 59.9 -> "59,90"; custo 12.3456 -> "12,3456"
  const br = (n) => { const x = Number(n) || 0; const t = Math.round(x * 100) === Math.round(x * 10000) / 100 ? x.toFixed(2) : String(Math.round(x * 10000) / 10000); return t.replace(".", ","); };
  const nomeComVar = (p, v) => (/[()]/.test(v.nome) ? `${p} · ${v.nome}` : `${p} (${v.nome})`);
  const campoNum = (v) => (typeof v === "number" ? v.toFixed(2).replace(".", ",") : String(v));

  /* ----------------------------- janela (modal) ----------------------------- */
  let aoFecharModal = null;
  function abrirModal(titulo, corpo, { largo = false, aoFechar = null } = {}) {
    aoFecharModal = aoFechar;
    $("#modal").innerHTML = `<div class="modal-fundo" data-a="fundo-modal"><div class="modal-caixa ${largo ? "largo" : ""}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <div class="modal-topo"><h2 class="modal-titulo">${esc(titulo)}</h2><button class="modal-fechar" data-a="fechar-modal" aria-label="Fechar">×</button></div>
      <div id="modal-corpo">${corpo}</div></div></div>`;
    const primeiro = $("#modal-corpo [autofocus]");
    if (primeiro) setTimeout(() => primeiro.focus(), 30);
  }
  function corpoModal(html) { const el = $("#modal-corpo"); if (el) el.innerHTML = html; }
  function fecharModal() { $("#modal").innerHTML = ""; const f = aoFecharModal; aoFecharModal = null; if (f) f(); }
  const modalAberto = () => !!$("#modal").innerHTML.trim();

  /* =====================================================================
     Primeiro acesso: o checklist
     ===================================================================== */
  const BV = { passo: 1, tipo: null, controla: null, nome: "", whatsapp: "", cardapio: true, erro: "", salvando: false };
  const TIPOS = [
    ["restaurante", "🍽️", "Restaurante, lanchonete ou delivery", "Ganha o cardápio digital: o cliente monta o pedido e manda pelo seu WhatsApp."],
    ["loja", "🛍️", "Loja ou comércio", "Roupas, cosméticos, papelaria, mercadinho… produtos com estoque e venda no balcão."],
    ["servicos", "🧰", "Serviços (e vendo alguns produtos)", "Salão, oficina, assistência… registre as vendas e os gastos do negócio."],
    ["outro", "📦", "Outro tipo de negócio", "Caixa e estoque do jeito mais simples."],
  ];
  function telaBoasVindas() {
    const passos = `<div class="bv-passos">${[1, 2, 3].map((p) => `<i class="${p <= BV.passo ? "feito" : ""}"></i>`).join("")}</div>`;
    let corpo = "";
    if (BV.passo === 1) {
      corpo = `<h1 class="bv-titulo">Que tipo de negócio você tem?</h1>
        <p class="sub">Assim o aplicativo já abre com o que faz sentido pra você. Dá pra mudar depois em Configurações.</p>
        <div class="opcoes">${TIPOS.map(([id, ic, t, d]) => `<button type="button" class="opcao ${BV.tipo === id ? "escolhida" : ""}" data-a="bv-tipo" data-v="${id}"><span class="opcao-icone">${ic}</span><span><b>${t}</b><small>${d}</small></span></button>`).join("")}</div>`;
    } else if (BV.passo === 2) {
      corpo = `<h1 class="bv-titulo">Você controla estoque?</h1>
        <p class="sub">Se sim, cada venda dá baixa na quantidade e o aplicativo avisa quando algo está acabando.</p>
        <div class="opcoes">
          <button type="button" class="opcao ${BV.controla === true ? "escolhida" : ""}" data-a="bv-controla" data-v="1"><span class="opcao-icone">📊</span><span><b>Sim, quero saber quanto tenho de cada produto</b><small>Estoque, custo médio, aviso de estoque baixo e compras de mercadoria.</small></span></button>
          <button type="button" class="opcao ${BV.controla === false ? "escolhida" : ""}" data-a="bv-controla" data-v="0"><span class="opcao-icone">🧾</span><span><b>Não, só quero registrar vendas e gastos</b><small>Bom para quem vende sob encomenda ou presta serviço. Dá pra ligar o estoque produto a produto depois.</small></span></button>
        </div>`;
    } else {
      corpo = `<h1 class="bv-titulo">Como se chama o seu negócio?</h1>
        <p class="sub">${BV.tipo === "restaurante" ? "O nome aparece no topo do cardápio digital." : "Aparece no topo do aplicativo."}</p>
        <div class="campos" style="margin-top:18px;grid-template-columns:1fr">
          <label class="campo"><span>Nome do negócio</span><input data-bv="nome" value="${esc(BV.nome)}" maxlength="80" placeholder="Ex.: Doces da Ana" autofocus /></label>
          ${BV.tipo === "restaurante" ? `
          <label class="campo"><span>WhatsApp que recebe os pedidos</span><input data-bv="whatsapp" value="${esc(BV.whatsapp)}" inputmode="tel" placeholder="(11) 98888-7777" /><small>Com DDD. Os pedidos do cardápio chegam aqui, prontos, com itens, endereço e total.</small></label>
          <label class="check"><input type="checkbox" data-bv="cardapio" ${BV.cardapio ? "checked" : ""} /><span>Ligar o cardápio digital agora<small>Sem pagamento no site: o cliente paga na entrega ou na retirada.</small></span></label>` : ""}
        </div>`;
    }
    const pode = (BV.passo === 1 && BV.tipo) || (BV.passo === 2 && BV.controla !== null) || BV.passo === 3;
    $("#boas-vindas").innerHTML = `<div class="bv"><div class="bv-caixa">
      <p class="bv-marca">PDV · primeiro acesso</p>${passos}${corpo}
      ${BV.erro ? `<p class="erro-form">${esc(BV.erro)}</p>` : ""}
      <div class="bv-rodape">
        ${BV.passo > 1 ? `<button class="btn claro" data-a="bv-voltar">Voltar</button>` : `<a class="btn claro" href="/">Agora não</a>`}
        <button class="btn acento" data-a="bv-avancar" ${pode && !BV.salvando ? "" : "disabled"}>${BV.passo === 3 ? (BV.salvando ? "Salvando…" : "Começar a usar") : "Continuar"}</button>
      </div></div></div>`;
  }
  async function concluirBoasVindas() {
    BV.erro = ""; BV.salvando = true; telaBoasVindas();
    try {
      const r = await api("PUT", "/estoque/negocio", {
        tipo: BV.tipo, nome: BV.nome, controlaEstoque: BV.controla,
        ...(BV.tipo === "restaurante" ? { whatsapp: BV.whatsapp, cardapioAtivo: BV.cardapio && !!BV.whatsapp.replace(/\D/g, "") } : {}),
      });
      S.negocio = r.negocio;
      $("#boas-vindas").innerHTML = "";
      abrirApp();
      if (BV.tipo === "restaurante" && BV.cardapio && !BV.whatsapp.replace(/\D/g, "")) toast("O cardápio fica desligado até você informar o WhatsApp, em Cardápio digital.");
    } catch (e) { BV.erro = e.message; }
    BV.salvando = false;
    if (!S.negocio || !S.negocio.checklist || !S.negocio.checklist.configurado) telaBoasVindas();
  }

  /* =====================================================================
     Estrutura
     ===================================================================== */
  function abrirApp() {
    $("#app").hidden = false;
    $("#nome-negocio").textContent = S.negocio.nome || "PDV";
    document.querySelectorAll("[data-so-restaurante]").forEach((el) => { el.hidden = !restaurante(); });
    const doHash = (location.hash || "").replace("#", "");
    const validas = ["inicio", "vender", "produtos", "compras", "gastos", "vendas", "clientes", "config", ...(restaurante() ? ["pedidos", "cardapio"] : [])];
    irPara(validas.includes(doHash) ? doHash : "inicio");
    atualizarSelos();
    if (restaurante()) setInterval(atualizarSelos, 60000);
  }
  function irPara(tab) {
    S.tab = tab;
    if (location.hash !== "#" + tab) history.replaceState(null, "", "#" + tab);
    document.querySelectorAll(".nav-item[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    $("#app").classList.remove("menu-aberto");
    render();
    window.scrollTo(0, 0);
    carregarDaAba(tab);
  }
  async function carregarDaAba(tab) {
    try {
      if (tab === "inicio") { S.resumo = await api("GET", "/estoque/resumo"); }
      else if (tab === "vendas") { await carregarVendas(); }
      else if (tab === "compras") { S.compras = (await api("GET", "/estoque/compras")).compras; }
      else if (tab === "gastos") { S.gastos = (await api("GET", "/estoque/gastos")).gastos; }
      else if (tab === "pedidos") { S.pedidos = (await api("GET", "/estoque/pedidos")).pedidos; }
      else if (tab === "clientes") { await carregarClientes(); }
      else if (tab === "vender" || tab === "produtos") {
        // pode ter mudado em outro aparelho: atualiza sem atrapalhar quem já está digitando
        const antes = JSON.stringify(S.produtos);
        await recarregarProdutos();
        if (antes === JSON.stringify(S.produtos) || S.tab !== tab || modalAberto()) return;
        if (tab === "vender") { const g = $("#grade-pdv"); if (g) g.innerHTML = gradePdvHtml(); return; }
      }
      else return;
      if (S.tab === tab && !modalAberto()) render();
      else if (S.tab === tab) render();
    } catch (e) { toast(esc(e.message), "erro"); }
  }
  async function carregarVendas() {
    const [a, m] = S.mesVendas.split("-").map(Number);
    const ult = new Date(a, m, 0).getDate();
    S.vendas = (await api("GET", `/estoque/vendas?de=${S.mesVendas}-01&ate=${S.mesVendas}-${String(ult).padStart(2, "0")}`)).vendas;
  }
  async function recarregarProdutos() { S.produtos = (await api("GET", "/estoque/produtos")).produtos; atualizarSeloEstoque(); }
  function atualizarSeloEstoque() {
    const n = S.produtos.filter((p) => p.ativo && (p.situacao === "acabou" || p.situacao === "baixo")).length;
    const b = $("#badge-estoque"); b.hidden = !n; b.textContent = n;
  }
  async function atualizarSelos() {
    atualizarSeloEstoque();
    if (!restaurante()) return;
    try {
      const r = await api("GET", "/estoque/resumo");
      const b = $("#badge-pedidos"); b.hidden = !r.pedidosNovos; b.textContent = r.pedidosNovos;
      if (S.tab === "inicio" && !modalAberto()) { S.resumo = r; render(); }
      if (S.tab === "pedidos" && !modalAberto()) { const ant = (S.pedidos || []).filter((p) => p.status === "novo").length; if (r.pedidosNovos !== ant) carregarDaAba("pedidos"); }
    } catch (e) { /* sem internet: tenta no próximo minuto */ }
  }

  function render() {
    const fn = { inicio: telaInicio, vender: telaVender, pedidos: telaPedidos, produtos: telaProdutos, compras: telaCompras, gastos: telaGastos, vendas: telaVendas, clientes: telaClientes, cardapio: telaCardapio, config: telaConfig }[S.tab] || telaInicio;
    $("#main").innerHTML = fn();
    if (S.tab === "cardapio") desenharQr();
  }
  const topo = (titulo, sub, direita = "") => `<div class="topo"><div><h1 class="titulo">${titulo}</h1>${sub ? `<p class="sub">${sub}</p>` : ""}</div>${direita ? `<div class="linha">${direita}</div>` : ""}</div>`;
  const carregandoHtml = `<div class="card vazio">Carregando…</div>`;

  /* =====================================================================
     Início
     ===================================================================== */
  function primeirosPassos() {
    const c = S.negocio.checklist || {};
    if (c.escondido) return "";
    const itens = [
      ["configurado", "Contar sobre o seu negócio", null],
      ["produto", "Cadastrar o primeiro produto", `<button class="btn mini claro" data-a="novo-produto">Cadastrar</button>`],
      ["venda", "Registrar a primeira venda no balcão", `<button class="btn mini claro" data-a="ir" data-tab="vender">Vender</button>`],
      ...(restaurante() ? [["cardapio", "Divulgar o link do cardápio digital", `<button class="btn mini claro" data-a="ir" data-tab="cardapio">Ver link</button>`]] : []),
    ];
    const feitos = itens.filter(([k]) => c[k]).length;
    if (feitos === itens.length) return "";
    return `<div class="card" style="margin-bottom:18px">
      <div class="linha entre" style="margin-bottom:12px"><h2 class="secao" style="margin:0">Primeiros passos · ${feitos} de ${itens.length}</h2><button class="link" data-a="esconder-passos">Esconder</button></div>
      <div class="passos">${itens.map(([k, t, b]) => `<div class="passo ${c[k] ? "feito" : ""}"><span class="passo-marca">${c[k] ? "✓" : ""}</span><span class="passo-texto">${t}</span>${!c[k] && b ? b : ""}</div>`).join("")}</div>
    </div>`;
  }
  function telaInicio() {
    const r = S.resumo;
    const mes = MESES[new Date().getMonth()];
    let html = topo(`Olá${S.negocio.nome ? `, ${esc(S.negocio.nome)}` : ""}!`, "O resumo do caixa, do estoque e dos clientes. As vendas e os gastos daqui já estão no Controle financeiro.",
      `<button class="btn claro" data-a="nova-compra">Registrar compra</button><button class="btn acento" data-a="ir" data-tab="vender">Nova venda</button>`);
    html += primeirosPassos();
    if (!r) return html + carregandoHtml;
    if (restaurante() && r.pedidosNovos) html += `<div class="faixa"><span><b>${r.pedidosNovos === 1 ? "1 pedido novo" : `${r.pedidosNovos} pedidos novos`}</b> ${r.pedidosNovos === 1 ? "chegou" : "chegaram"} pelo cardápio digital.</span><button class="btn mini acento" data-a="ir" data-tab="pedidos">Ver pedidos</button></div>`;
    html += `<div class="grade grade-4">
      <div class="card"><p class="kpi-rotulo">Vendas hoje</p><p class="kpi-valor">${fmt(r.hoje.total)}</p><p class="kpi-nota">${r.hoje.vendas === 1 ? "1 venda" : `${r.hoje.vendas} vendas`}</p></div>
      <div class="card"><p class="kpi-rotulo">Vendido em ${mes}</p><p class="kpi-valor">${fmt(r.mes.total)}</p><p class="kpi-nota">${r.mes.vendas === 1 ? "1 venda" : `${r.mes.vendas} vendas`}${r.mes.vendas ? ` · ticket médio ${fmt(r.mes.total / r.mes.vendas)}` : ""}</p></div>
      <div class="card"><p class="kpi-rotulo">Lucro bruto em ${mes}</p><p class="kpi-valor ${r.mes.lucroBruto >= 0 ? "positivo" : "negativo"}">${fmt(r.mes.lucroBruto)}</p><p class="kpi-nota">vendas − custo da mercadoria (${fmt(r.mes.cmv)})${r.mes.taxas ? ` − taxas (${fmt(r.mes.taxas)})` : ""}</p></div>
      <div class="card"><p class="kpi-rotulo">Compras e gastos em ${mes}</p><p class="kpi-valor">${fmt(r.mes.gastos)}</p><p class="kpi-nota">${S.negocio.controlaEstoque || S.produtos.some((p) => p.controlaEstoque) ? `Estoque parado: ${fmt(r.valorEstoque)} (a preço de custo)` : "Notas de gasto e compras de mercadoria"}</p></div>
    </div><div class="espaco"></div>
    <div class="grade grade-2">
      <div class="card"><h2 class="secao">Estoque pedindo atenção</h2>${r.alertas.length ? `<ul class="lista-simples">${r.alertas.map((a) => `<li><span>${esc(a.nome)}</span><span class="linha"><span class="num">${fmtN(a.estoque)} ${unid(a.unidade)}</span><span class="selo ${a.situacao}">${a.situacao === "acabou" ? "acabou" : "baixo"}</span><button class="btn mini claro" data-a="ajustar" data-id="${a.produtoId}">Ajustar</button></span></li>`).join("")}</ul>`
        : `<p class="vazio" style="padding:18px 0">${r.produtos ? "Tudo certo: nenhum produto abaixo do mínimo." : "Cadastre seus produtos para acompanhar o estoque."}</p>`}</div>
      <div class="card"><h2 class="secao">Mais vendidos em ${mes}</h2>${r.maisVendidos.length ? `<ul class="lista-simples">${r.maisVendidos.map((m, i) => `<li><span>${i + 1}. ${esc(m.nome)}</span><span class="linha"><span class="sub">${fmtN(m.qtd)}×</span><b class="num">${fmt(m.total)}</b></span></li>`).join("")}</ul>`
        : `<p class="vazio" style="padding:18px 0">Ainda sem vendas este mês.</p>`}</div>
    </div>`;
    return html;
  }

  /* =====================================================================
     Vender (balcão)
     ===================================================================== */
  const ativos = () => S.produtos.filter((p) => p.ativo);
  function produtosDoPdv() {
    const b = S.busca.trim().toLowerCase();
    return ativos().filter((p) => (!S.catPdv || p.categoria === S.catPdv) && (!b || p.nome.toLowerCase().includes(b) || (p.codigo && p.codigo.toLowerCase() === b) || p.categoria.toLowerCase().includes(b) || p.variacoes.some((v) => v.codigo && v.codigo.toLowerCase() === b)));
  }
  function estoqueTexto(p) {
    if (!p.controlaEstoque) return "";
    const sit = p.situacao === "acabou" ? "acabou" : p.situacao === "baixo" ? "baixo" : "";
    return `<span class="pdv-est ${sit}">${p.situacao === "acabou" ? "sem estoque" : `${fmtN(p.estoque)} ${unid(p.unidade)} em estoque`}</span>`;
  }
  function gradePdvHtml() {
    const lista = produtosDoPdv();
    if (!S.produtos.length) return `<div class="card vazio"><b>Nenhum produto cadastrado</b>Cadastre seus produtos ou lance um item avulso no carrinho.<br/><br/><button class="btn acento" data-a="novo-produto">Cadastrar produto</button></div>`;
    if (!lista.length) return `<div class="card vazio">Nada encontrado para “${esc(S.busca)}”.</div>`;
    return `<div class="pdv-grade">${lista.map((p) => {
      const preco = p.variacoes.length ? Math.min(...p.variacoes.filter((v) => v.ativo).map((v) => v.precoFinal).concat([p.preco])) : p.preco;
      return `<button type="button" class="pdv-prod" data-a="add-cart" data-id="${p.id}">
        <span class="pdv-foto" ${p.foto ? `style="background-image:url('${esc(p.foto)}')"` : ""}>${p.foto ? "" : inicial(p.nome)}</span>
        <span class="pdv-info"><span class="pdv-nome">${esc(p.nome)}</span><span class="pdv-preco">${p.variacoes.length ? "a partir de " : ""}${fmt(preco)}</span>${estoqueTexto(p)}</span>
      </button>`;
    }).join("")}</div>`;
  }
  const programa = () => (S.negocio && S.negocio.fidelidade) || { modelo: "nenhum" };
  function totaisCarrinho() {
    const sub = r2(S.carrinho.reduce((a, i) => a + r2(numOu(i.qtd) * numOu(i.unit)), 0));
    const dv = numOu(S.cartDescValor);
    let desc = S.cartDescTipo === "%" ? r2(sub * Math.min(100, Math.max(0, dv)) / 100) : r2(Math.max(0, dv));
    if (desc > sub) desc = sub;
    // cashback ou prêmio do cartão fidelidade (o servidor confere de novo)
    let benef = 0; let benefNome = "";
    const c = S.cartCli; const b = c && c.beneficio; const prog = programa();
    if (S.cartUsarBenef && b && c.participa) {
      if (prog.modelo === "cashback" && b.saldo > 0 && !(b.minimoUso && sub - desc < b.minimoUso)) { benef = r2(Math.min(b.saldo, sub - desc)); benefNome = "Cashback"; }
      if (prog.modelo === "selos" && b.podePremio) { benef = r2(Math.min(b.premioValor, sub - desc)); benefNome = "Prêmio fidelidade"; }
    }
    return { sub, desc, benef, benefNome, total: r2(sub - desc - benef), itens: S.carrinho.reduce((a, i) => a + numOu(i.qtd), 0) };
  }
  const telFmt = (t) => { const d = String(t || "").replace(/\D/g, ""); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d; };
  // Bloco do cliente no carrinho: busca, escolhido e o que ele tem no programa
  function clienteCartHtml(t) {
    const c = S.cartCli; const prog = programa();
    if (!c) {
      return `<span class="rot">Cliente</span>
        <div class="cli-busca"><input class="inp" data-cli-busca value="${esc(S.cartCliente)}" maxlength="80" placeholder="Nome ou telefone (opcional)" autocomplete="off" />
        <div class="sugestoes" id="cli-sugestoes" hidden></div></div>`;
    }
    const b = c.beneficio || {};
    let prog_html = "";
    if (prog.modelo !== "nenhum") {
      if (!c.participa) prog_html = `<p class="cli-prog">Não participa do programa de fidelidade. <button class="link" data-a="cart-cli-participa">Incluir (o cliente aceitou)</button></p>`;
      else if (prog.modelo === "cashback") {
        const base = t.sub - t.desc;
        const faltaMin = b.minimoUso && base < b.minimoUso;
        prog_html = b.saldo > 0
          ? `<label class="check cli-prog"><input type="checkbox" data-cart-benef ${S.cartUsarBenef ? "checked" : ""} ${faltaMin ? "disabled" : ""} /><span>Usar o cashback · saldo <b>${fmt(b.saldo)}</b>${faltaMin ? `<small>Só em compras a partir de ${fmt(b.minimoUso)}.</small>` : b.vence ? `<small>${fmt(b.vence.valor)} vence em ${dataBR(b.vence.data)}</small>` : ""}</span></label>`
          : `<p class="cli-prog">Sem cashback para usar. Nesta compra ganha <b>${fmt(r2((t.sub - t.desc) * prog.cashbackPct / 100))}</b>.</p>`;
      } else {
        const marcas = Array.from({ length: prog.selosMeta }, (_, i) => `<i class="${i < b.selos ? "cheio" : ""}"></i>`).join("");
        prog_html = `<div class="selos" title="${b.selos} de ${prog.selosMeta} compras">${marcas}</div>`
          + (b.podePremio ? `<label class="check cli-prog"><input type="checkbox" data-cart-benef ${S.cartUsarBenef ? "checked" : ""} /><span>Usar o prêmio: <b>${esc(prog.premioTexto || fmt(prog.premioValor) + " de desconto")}</b></span></label>`
            : `<p class="cli-prog">${b.selos} de ${prog.selosMeta} compras · faltam ${prog.selosMeta - b.selos} para o prêmio.</p>`);
      }
    }
    return `<span class="rot">Cliente</span>
      <div class="cli-sel"><div><b>${esc(c.nome)}</b><small>${c.telefone ? telFmt(c.telefone) + " · " : ""}${c.compras === 1 ? "1 compra" : `${c.compras} compras`}${c.ultimaCompra ? ` · última em ${dataBR(c.ultimaCompra)}` : ""}</small></div><button class="link" data-a="cart-cli-tirar">Trocar</button></div>
      ${prog_html}`;
  }
  async function escolherClienteNoCarrinho(id) {
    try {
      const f = await api("GET", `/estoque/clientes/${id}`);
      S.cartCli = { ...f.cliente, beneficio: f.beneficio }; S.cartUsarBenef = false; S.cartCliente = "";
      redesenharCarrinho();
    } catch (e) { toast(esc(e.message), "erro"); }
  }
  let buscaCliTimer = null;
  function buscarClienteCarrinho(texto) {
    clearTimeout(buscaCliTimer);
    const box = $("#cli-sugestoes"); if (!box) return;
    const q = texto.trim();
    if (q.length < 2) { box.hidden = true; return; }
    buscaCliTimer = setTimeout(async () => {
      try {
        const r = await api("GET", `/estoque/clientes?busca=${encodeURIComponent(q)}`);
        const box2 = $("#cli-sugestoes"); if (!box2) return;
        box2.innerHTML = r.clientes.slice(0, 5).map((c) => `<button type="button" data-a="cart-cli-escolher" data-id="${c.id}"><b>${esc(c.nome || "Sem nome")}</b><small>${c.telefone ? telFmt(c.telefone) : ""}${c.compras ? ` · ${c.compras} compras` : ""}</small></button>`).join("")
          + `<button type="button" data-a="cart-cli-novo" class="novo">+ Cadastrar ${/\d{6,}/.test(q) ? "cliente" : `“${esc(q)}”`}</button>`;
        box2.hidden = false;
      } catch (e) { /* sem sugestões */ }
    }, 250);
  }
  function novoClienteModal(prefill = "", aoSalvar = null) {
    const ehTel = /\d{6,}/.test(prefill.replace(/\D/g, ""));
    const prog = programa();
    abrirModal("Novo cliente", `<div class="campos" style="grid-template-columns:1fr">
        <label class="campo"><span>Nome</span><input id="nc-nome" maxlength="80" value="${ehTel ? "" : esc(prefill)}" autofocus /></label>
        <label class="campo"><span>Telefone / WhatsApp</span><input id="nc-tel" inputmode="tel" value="${ehTel ? esc(prefill) : ""}" placeholder="(11) 98888-7777" /><small>É pelo telefone que o cliente é reconhecido nas próximas compras e no cardápio.</small></label>
        ${prog.modelo !== "nenhum" ? `<label class="check"><input type="checkbox" id="nc-participa" /><span>O cliente aceitou participar do programa de fidelidade<small>${prog.modelo === "cashback" ? `Ganha ${String(prog.cashbackPct).replace(".", ",")}% de cada compra de volta.` : `A cada ${prog.selosMeta} compras ganha ${esc(prog.premioTexto || fmt(prog.premioValor) + " de desconto")}.`}</small></span></label>` : ""}
      </div><p class="erro-form" id="nc-erro" hidden></p>
      <div class="modal-rodape"><button class="btn claro" data-a="fechar-modal">Cancelar</button><button class="btn acento" data-a="nc-ok">Cadastrar</button></div>`);
    novoClienteModal.aoSalvar = aoSalvar;
  }
  function carrinhoHtml() {
    const t = totaisCarrinho();
    const itens = S.carrinho.map((i, idx) => {
      const p = i.produtoId && S.produtos.find((x) => x.id === i.produtoId);
      const v = p && i.variacaoId && p.variacoes.find((x) => x.id === i.variacaoId);
      const est = p && p.controlaEstoque ? (v ? v.estoque : p.estoque) : null;
      const falta = est !== null && numOu(i.qtd) > est;
      return `<div class="cart-item">
        <div><div class="cart-nome">${esc(i.nome)}</div>${falta ? `<div class="cart-ops negativo">Estoque: ${fmtN(est)} — a venda deixa negativo</div>` : i.avulso ? `<div class="cart-ops">item avulso</div>` : ""}</div>
        <div class="cart-total-item" data-total-item="${idx}">${fmt(numOu(i.qtd) * numOu(i.unit))}</div>
        <div class="cart-ctrl">
          <span class="qtd"><button type="button" data-a="qtd" data-i="${idx}" data-d="-1" aria-label="Menos">−</button><input data-cart-qtd="${idx}" value="${esc(String(i.qtd).replace(".", ","))}" inputmode="decimal" aria-label="Quantidade" /><button type="button" data-a="qtd" data-i="${idx}" data-d="1" aria-label="Mais">+</button></span>
          <span class="sub">×</span><input class="cart-preco" data-cart-preco="${idx}" value="${esc(campoNum(i.unit))}" inputmode="decimal" aria-label="Preço unitário" />
          <button type="button" class="cart-x" data-a="tirar" data-i="${idx}" aria-label="Tirar do carrinho">×</button>
        </div>
      </div>`;
    }).join("");
    return `<div class="card">
      <div class="linha entre" style="margin-bottom:6px"><h2 class="secao" style="margin:0">Carrinho</h2>${S.carrinho.length ? `<button class="link" data-a="limpar-cart">Limpar</button>` : ""}</div>
      ${S.carrinho.length ? `<div class="cart-itens">${itens}</div>` : `<p class="sub" style="padding:14px 0">Toque nos produtos para adicionar.</p>`}
      <button class="btn claro mini" data-a="avulso" style="margin-top:10px">+ Item avulso</button>
      <div class="cart-sec">
        ${clienteCartHtml(t)}
        <span class="rot">Desconto</span>
        <div class="cart-desc"><input class="inp" data-cart="cartDescValor" value="${esc(S.cartDescValor)}" inputmode="decimal" placeholder="0,00" /><select class="inp" data-cart="cartDescTipo"><option ${S.cartDescTipo === "R$" ? "selected" : ""}>R$</option><option ${S.cartDescTipo === "%" ? "selected" : ""}>%</option></select></div>
        <span class="rot">Forma de pagamento</span>
        <div class="chips">${S.meios.map((m) => `<button type="button" class="chip ${S.cartMeio === m.id ? "ativo" : ""}" data-a="meio" data-v="${m.id}">${esc(meioCurto(m.id))}</button>`).join("")}</div>
        ${S.cartMeio === "fiado" ? `<p class="aviso">Fiado entra no financeiro como <b>a receber</b>. Marque como pago lá quando o cliente acertar.</p>` : ""}
        ${S.cartOutraData ? `<label class="campo"><span>Data da venda</span><input type="date" data-cart="cartData" value="${esc(S.cartData || hoje())}" max="${hoje()}" /></label>` : `<button class="link" data-a="outra-data" style="align-self:flex-start;font-size:12.5px">Venda de outro dia?</button>`}
      </div>
      <div style="margin-top:12px">
        <div class="cart-linha"><span>Subtotal</span><span class="num" id="cart-sub">${fmt(t.sub)}</span></div>
        <div class="cart-linha" id="cart-desc-linha" ${t.desc ? "" : "hidden"}><span>Desconto</span><span class="num negativo" id="cart-desc">− ${fmt(t.desc)}</span></div>
        <div class="cart-linha" id="cart-benef-linha" ${t.benef ? "" : "hidden"}><span id="cart-benef-nome">${t.benefNome}</span><span class="num negativo" id="cart-benef">− ${fmt(t.benef)}</span></div>
        <div class="cart-linha total"><span>Total</span><span class="num" id="cart-total">${fmt(t.total)}</span></div>
      </div>
      <button class="btn acento grande" data-a="finalizar" style="margin-top:12px" ${S.carrinho.length && !S.vendendo ? "" : "disabled"}>${S.vendendo ? "Registrando…" : "Finalizar venda"}</button>
    </div>`;
  }
  function telaVender() {
    const cats = [...new Set(ativos().map((p) => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const t = totaisCarrinho();
    return topo("Vender", "Venda no balcão: dá baixa no estoque e entra como receita no Controle financeiro.") + `
      <div class="pdv">
        <div>
          <div class="pdv-busca">
            <input class="inp" id="busca-pdv" data-busca-pdv value="${esc(S.busca)}" placeholder="Buscar por nome, categoria ou código de barras" autocomplete="off" />
            ${cats.length > 1 ? `<div class="chips" style="margin-top:10px"><button class="chip ${!S.catPdv ? "ativo" : ""}" data-a="cat-pdv" data-v="">Todos</button>${cats.map((c) => `<button class="chip ${S.catPdv === c ? "ativo" : ""}" data-a="cat-pdv" data-v="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : ""}
          </div>
          <div id="grade-pdv">${gradePdvHtml()}</div>
        </div>
        <div class="carrinho" id="carrinho">${carrinhoHtml()}</div>
      </div>
      <div class="cart-resumo-mobile" ${S.carrinho.length ? "" : "hidden"}><span><b>${fmtN(t.itens)} ${t.itens === 1 ? "item" : "itens"}</b> · <span class="num" id="cart-total-mob">${fmt(t.total)}</span></span><button class="btn mini" data-a="ver-carrinho">Ver carrinho</button></div>`;
  }
  function redesenharCarrinho() {
    const el = $("#carrinho"); if (el) el.innerHTML = carrinhoHtml();
    const mob = $(".cart-resumo-mobile");
    if (mob) { const t = totaisCarrinho(); mob.hidden = !S.carrinho.length; mob.innerHTML = `<span><b>${fmtN(t.itens)} ${t.itens === 1 ? "item" : "itens"}</b> · <span class="num" id="cart-total-mob">${fmt(t.total)}</span></span><button class="btn mini" data-a="ver-carrinho">Ver carrinho</button>`; }
  }
  function atualizarTotais() {
    const t = totaisCarrinho();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("cart-sub", fmt(t.sub)); set("cart-desc", "− " + fmt(t.desc)); set("cart-total", fmt(t.total)); set("cart-total-mob", fmt(t.total));
    const dl = $("#cart-desc-linha"); if (dl) dl.hidden = !t.desc;
    set("cart-benef", "− " + fmt(t.benef)); set("cart-benef-nome", t.benefNome); const bl = $("#cart-benef-linha"); if (bl) bl.hidden = !t.benef;
    S.carrinho.forEach((i, idx) => { const el = document.querySelector(`[data-total-item="${idx}"]`); if (el) el.textContent = fmt(numOu(i.qtd) * numOu(i.unit)); });
    const fin = document.querySelector('[data-a="finalizar"]'); if (fin) fin.disabled = !S.carrinho.length || S.vendendo;
  }
  function adicionarAoCarrinho(p, v) {
    const chave = `${p.id}|${v ? v.id : ""}`;
    const ja = S.carrinho.find((i) => i.chave === chave);
    if (ja) ja.qtd = r2(numOu(ja.qtd) + 1);
    else S.carrinho.push({ chave, produtoId: p.id, variacaoId: v ? v.id : null, nome: v ? nomeComVar(p.nome, v) : p.nome, unit: v ? v.precoFinal : p.preco, qtd: 1 });
    redesenharCarrinho();
  }
  function escolherVariacao(p) {
    const vs = p.variacoes.filter((v) => v.ativo);
    abrirModal(p.nome, `<p class="sub" style="margin-bottom:12px">Qual variação?</p><div class="opcoes" style="margin:0">${vs.map((v) => `
      <button type="button" class="opcao" data-a="add-var" data-id="${p.id}" data-v="${v.id}"><span style="flex:1"><b>${esc(v.nome)}</b><small>${p.controlaEstoque ? (v.estoque <= 0 ? "sem estoque" : `${fmtN(v.estoque)} ${unid(p.unidade)} em estoque`) : ""}</small></span><b class="num">${fmt(v.precoFinal)}</b></button>`).join("")}</div>`);
  }
  function itemAvulso() {
    abrirModal("Item avulso", `<p class="sub" style="margin-bottom:14px">Para vender algo que não está cadastrado (um serviço, uma taxa, um produto novo). Não mexe no estoque.</p>
      <div class="campos" style="grid-template-columns:1fr">
        <label class="campo"><span>O que foi vendido</span><input id="av-nome" maxlength="80" placeholder="Ex.: Embrulho para presente" autofocus /></label>
      </div><div class="campos" style="margin-top:12px">
        <label class="campo"><span>Preço</span><input id="av-preco" inputmode="decimal" placeholder="0,00" /></label>
        <label class="campo"><span>Quantidade</span><input id="av-qtd" inputmode="decimal" value="1" /></label>
      </div><p class="erro-form" id="av-erro" hidden></p>
      <div class="modal-rodape"><button class="btn claro" data-a="fechar-modal">Cancelar</button><button class="btn acento" data-a="av-ok">Adicionar</button></div>`);
  }
  async function finalizarVenda() {
    if (!S.carrinho.length || S.vendendo) return;
    const ruins = S.carrinho.filter((i) => !(numOu(i.qtd, -1) > 0) || Number.isNaN(num(i.unit)) || num(i.unit) < 0);
    if (ruins.length) { toast(`Confira a quantidade e o preço de “${esc(ruins[0].nome)}”.`, "erro"); return; }
    const t = totaisCarrinho();
    S.vendendo = true; atualizarTotais(); redesenharCarrinho();
    try {
      const r = await api("POST", "/estoque/vendas", {
        meio: S.cartMeio, desconto: t.desc, data: S.cartOutraData ? (S.cartData || hoje()) : undefined,
        ...(S.cartCli ? { clienteId: S.cartCli.id, usarCashback: !!(t.benef && programa().modelo === "cashback"), usarPremio: !!(t.benef && programa().modelo === "selos") } : { cliente: S.cartCliente }),
        itens: S.carrinho.map((i) => (i.avulso ? { nome: i.nome, qtd: numOu(i.qtd), unit: numOu(i.unit) } : { produtoId: i.produtoId, variacaoId: i.variacaoId, qtd: numOu(i.qtd), unit: numOu(i.unit) })),
      });
      S.carrinho = []; S.cartDescValor = ""; S.cartCliente = ""; S.cartOutraData = false; S.cartData = ""; S.cartCli = null; S.cartUsarBenef = false;
      if (S.negocio.checklist) S.negocio.checklist.venda = true;
      const v = r.venda;
      const ganhou = v.cashbackGanho ? `<br/>🎁 ${esc(v.cliente)} ganhou ${fmt(v.cashbackGanho)} de cashback.` : v.selosGanhos ? `<br/>🎁 +1 compra no cartão fidelidade de ${esc(v.cliente)}.` : "";
      toast(`<b>Venda #${r.venda.numero} registrada · ${fmt(r.venda.total)}</b><br/>Já está no Controle financeiro.${ganhou}${r.alertas.length ? `<br/>⚠ ${r.alertas.map(esc).join("<br/>⚠ ")}` : ""}`, r.alertas.length ? "" : "ok");
      await recarregarProdutos();
    } catch (e) { toast(esc(e.message), "erro"); }
    S.vendendo = false;
    if (S.tab === "vender") { const g = $("#grade-pdv"); if (g) g.innerHTML = gradePdvHtml(); redesenharCarrinho(); }
  }

  /* =====================================================================
     Produtos e estoque
     ===================================================================== */
  function margem(p) { const preco = p.preco; return preco > 0 ? Math.round((preco - p.custo) / preco * 100) : null; }
  function telaProdutos() {
    const b = S.buscaProd.trim().toLowerCase();
    const lista = S.produtos.filter((p) => (!b || p.nome.toLowerCase().includes(b) || p.categoria.toLowerCase().includes(b) || (p.codigo || "").toLowerCase().includes(b))
      && (!S.filtroProd || (S.filtroProd === "atencao" ? p.ativo && (p.situacao === "baixo" || p.situacao === "acabou") : S.filtroProd === "inativos" ? !p.ativo : p.ativo)));
    const atencao = S.produtos.filter((p) => p.ativo && (p.situacao === "baixo" || p.situacao === "acabou")).length;
    let html = topo("Produtos e estoque", `${S.produtos.length === 1 ? "1 produto" : `${S.produtos.length} produtos`} cadastrados. Para entrada de mercadoria comprada, use Compras: o custo médio se atualiza sozinho.`,
      `<button class="btn acento" data-a="novo-produto">Novo produto</button>`);
    html += `<div class="linha" style="margin-bottom:14px"><input class="inp" style="max-width:340px" data-busca-prod value="${esc(S.buscaProd)}" placeholder="Buscar produto" />
      <div class="chips"><button class="chip ${!S.filtroProd ? "ativo" : ""}" data-a="filtro-prod" data-v="">Ativos</button><button class="chip ${S.filtroProd === "atencao" ? "ativo" : ""}" data-a="filtro-prod" data-v="atencao">Estoque baixo${atencao ? ` (${atencao})` : ""}</button><button class="chip ${S.filtroProd === "inativos" ? "ativo" : ""}" data-a="filtro-prod" data-v="inativos">Inativos</button></div></div>`;
    if (!S.produtos.length) return html + `<div class="card vazio"><b>Nenhum produto ainda</b>Cadastre o que você vende: nome, preço, custo e, se quiser, variações como tamanho ou cor.<br/><br/><button class="btn acento" data-a="novo-produto">Cadastrar o primeiro produto</button></div>`;
    if (!lista.length) return html + `<div class="card vazio">Nenhum produto neste filtro.</div>`;
    html += `<div class="card" style="padding:6px 8px"><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Produto</th><th class="dir">Preço</th><th class="dir">Custo</th><th class="dir">Margem</th><th class="dir">Estoque</th><th></th></tr></thead><tbody>
      ${lista.map((p) => {
        const m = margem(p);
        const est = !p.controlaEstoque ? `<span class="selo livre">sem controle</span>` : `<span class="num">${fmtN(p.estoque)} ${unid(p.unidade)}</span> <span class="selo ${p.situacao}">${p.situacao === "ok" ? "ok" : p.situacao === "baixo" ? "baixo" : "acabou"}</span>`;
        return `<tr class="clicavel" data-a="editar-produto" data-id="${p.id}">
          <td><div class="prod-cel"><span class="miniatura" ${p.foto ? `style="background-image:url('${esc(p.foto)}')"` : ""}>${p.foto ? "" : inicial(p.nome)}</span><div><div class="prod-nome">${esc(p.nome)}${p.ativo ? "" : ` <span class="selo neutro">inativo</span>`}</div><div class="prod-cat">${esc(p.categoria || "Sem categoria")}${p.variacoes.length ? ` · ${p.variacoes.length} variações` : ""}${restaurante() && !p.noCardapio ? " · fora do cardápio" : ""}</div></div></div></td>
          <td class="dir num">${fmt(p.preco)}</td><td class="dir num">${fmt(p.custo)}</td>
          <td class="dir">${m === null ? "—" : `<span class="${m < 0 ? "negativo" : ""}">${m}%</span>`}</td>
          <td class="dir" style="white-space:nowrap">${est}</td>
          <td class="dir">${p.controlaEstoque ? `<button class="btn mini claro" data-a="ajustar" data-id="${p.id}">Ajustar</button>` : ""}</td>
        </tr>`;
      }).join("")}</tbody></table></div></div>`;
    return html;
  }

  // Edição de produto: cópia em PF, desenhada dentro da janela
  let PF = null;
  function abrirProduto(p) {
    const novo = !p;
    PF = novo
      ? { id: null, nome: "", categoria: "", descricao: "", codigo: "", unidade: "un", preco: "", custo: "", controlaEstoque: S.negocio.controlaEstoque !== false, estoqueInicial: "", estoqueMinimo: "", noCardapio: true, destaque: false, ativo: true, opcoes: [], variacoes: [], foto: "", fotoNova: null, comVariacoes: false, erro: "" }
      : { ...JSON.parse(JSON.stringify(p)), preco: br(p.preco), custo: br(p.custo), estoqueMinimo: p.estoqueMinimo ? String(p.estoqueMinimo).replace(".", ",") : "", fotoNova: null, comVariacoes: p.variacoes.length > 0, erro: "",
        variacoes: p.variacoes.map((v) => ({ ...v, preco: v.preco === null ? "" : br(v.preco), custo: v.custo === null ? "" : br(v.custo), estoqueMinimo: v.estoqueMinimo ? String(v.estoqueMinimo).replace(".", ",") : "" })) };
    abrirModal(novo ? "Novo produto" : "Editar produto", formProdutoHtml(), { largo: true, aoFechar: () => { PF = null; } });
  }
  function formProdutoHtml() {
    const f = PF; const novo = !f.id;
    const cats = [...new Set(S.produtos.map((p) => p.categoria).filter(Boolean).concat(S.negocio.categorias || []))];
    const m = numOu(f.preco) > 0 ? Math.round((numOu(f.preco) - numOu(f.custo)) / numOu(f.preco) * 100) : null;
    const varRows = f.variacoes.map((v, i) => `<div class="linha-ed var">
      <label><span class="rotulo-mob">Nome</span><input class="inp" data-var="${i}" data-campo="nome" value="${esc(v.nome)}" placeholder="Ex.: M ou Azul" maxlength="60" /></label>
      <label><span class="rotulo-mob">Preço</span><input class="inp" data-var="${i}" data-campo="preco" value="${esc(v.preco)}" inputmode="decimal" placeholder="${esc(f.preco || "igual")}" /></label>
      <label><span class="rotulo-mob">Custo</span><input class="inp" data-var="${i}" data-campo="custo" value="${esc(v.custo)}" inputmode="decimal" placeholder="${esc(f.custo || "igual")}" /></label>
      <label><span class="rotulo-mob">${v.id ? "Estoque" : "Estoque inicial"}</span>${v.id ? `<input class="inp" value="${fmtN(v.estoque)}" disabled title="Para mudar, use Ajustar ou Compras" />` : `<input class="inp" data-var="${i}" data-campo="estoqueInicial" value="${esc(v.estoqueInicial || "")}" inputmode="decimal" placeholder="0" ${f.controlaEstoque ? "" : "disabled"} />`}</label>
      <label><span class="rotulo-mob">Mínimo</span><input class="inp" data-var="${i}" data-campo="estoqueMinimo" value="${esc(v.estoqueMinimo)}" inputmode="decimal" placeholder="0" ${f.controlaEstoque ? "" : "disabled"} /></label>
      <button type="button" class="x-linha" data-a="tirar-var" data-i="${i}" aria-label="Tirar variação">×</button>
    </div>`).join("");
    const gruposHtml = f.opcoes.map((g, gi) => `<div class="grupo-op">
      <div class="linha"><input class="inp" style="flex:1;min-width:150px" data-op="${gi}" data-campo="nome" value="${esc(g.nome)}" placeholder="Nome do grupo (ex.: Borda, Adicionais)" maxlength="40" />
        <select class="inp" style="width:auto" data-op="${gi}" data-campo="tipo"><option value="um" ${g.tipo === "um" ? "selected" : ""}>Cliente escolhe 1 (obrigatório)</option><option value="varios" ${g.tipo !== "um" ? "selected" : ""}>Cliente escolhe vários (opcional)</option></select>
        <button type="button" class="x-linha" data-a="tirar-grupo" data-i="${gi}" aria-label="Tirar grupo">×</button></div>
      ${g.escolhas.map((e, ei) => `<div class="escolha-ed"><input class="inp" data-esc="${gi}:${ei}" data-campo="nome" value="${esc(e.nome)}" placeholder="Opção" maxlength="40" /><input class="inp" data-esc="${gi}:${ei}" data-campo="preco" value="${esc(typeof e.preco === "number" ? (e.preco ? br(e.preco) : "") : e.preco || "")}" inputmode="decimal" placeholder="+ R$ 0,00" /><button type="button" class="x-linha" data-a="tirar-escolha" data-i="${gi}:${ei}" aria-label="Tirar opção">×</button></div>`).join("")}
      <button type="button" class="link" data-a="add-escolha" data-i="${gi}" style="align-self:flex-start;font-size:12.5px">+ opção</button>
    </div>`).join("");
    return `
      <div class="foto-ed" style="margin-bottom:16px">
        <span class="miniatura" id="pf-foto" ${f.fotoNova || f.foto ? `style="background-image:url('${esc(f.fotoNova || f.foto)}')"` : ""}>${f.fotoNova || f.foto ? "" : inicial(f.nome || "?")}</span>
        <div class="linha"><label class="btn claro mini" style="cursor:pointer">${f.fotoNova || f.foto ? "Trocar foto" : "Pôr foto"}<input type="file" accept="image/*" data-pf-foto hidden /></label>${f.fotoNova || f.foto ? `<button class="link" data-a="tirar-foto" style="font-size:12.5px">Tirar foto</button>` : ""}</div>
      </div>
      <div class="campos">
        <label class="campo" style="grid-column:span 2"><span>Nome</span><input data-pf="nome" value="${esc(f.nome)}" maxlength="80" placeholder="Ex.: Camiseta básica" ${novo ? "autofocus" : ""} /></label>
        <label class="campo"><span>Categoria</span><input data-pf="categoria" value="${esc(f.categoria)}" maxlength="60" list="pf-cats" placeholder="Ex.: Roupas" /><datalist id="pf-cats">${cats.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
      </div>
      <div class="campos" style="margin-top:12px">
        <label class="campo"><span>Preço de venda</span><input data-pf="preco" value="${esc(f.preco)}" inputmode="decimal" placeholder="0,00" /></label>
        <label class="campo"><span>Custo</span><input data-pf="custo" value="${esc(f.custo)}" inputmode="decimal" placeholder="0,00" /><small id="pf-margem">${m === null ? "Quanto você paga por ele" : `Margem: ${m}%`}</small></label>
        <label class="campo"><span>Unidade</span><select data-pf="unidade">${S.unidades.map((u) => `<option value="${u}" ${f.unidade === u ? "selected" : ""}>${UNIDADE_NOME[u] || u}</option>`).join("")}</select></label>
        <label class="campo"><span>Código / código de barras</span><input data-pf="codigo" value="${esc(f.codigo)}" maxlength="40" placeholder="Opcional" /></label>
      </div>
      <div class="bloco">
        <label class="check"><input type="checkbox" data-pf="controlaEstoque" ${f.controlaEstoque ? "checked" : ""} /><span><b>Controlar o estoque deste produto</b><small>Cada venda dá baixa; o aplicativo avisa quando chegar no mínimo.</small></span></label>
        ${f.controlaEstoque && !f.comVariacoes ? `<div class="campos" style="margin-top:12px">
          ${novo ? `<label class="campo"><span>Quantidade em estoque hoje</span><input data-pf="estoqueInicial" value="${esc(f.estoqueInicial)}" inputmode="decimal" placeholder="0" /></label>` : `<label class="campo"><span>Em estoque</span><input value="${fmtN(f.estoque)} ${unid(f.unidade)}" disabled /><small>Para mudar: <button class="link" data-a="ajustar" data-id="${f.id}">Ajustar</button> ou registre uma compra.</small></label>`}
          <label class="campo"><span>Avisar quando chegar em</span><input data-pf="estoqueMinimo" value="${esc(f.estoqueMinimo)}" inputmode="decimal" placeholder="0" /></label>
        </div>` : ""}
      </div>
      <div class="bloco">
        <label class="check"><input type="checkbox" data-pf="comVariacoes" ${f.comVariacoes ? "checked" : ""} /><span><b>Tem variações</b><small>Tamanho, cor, sabor… cada variação tem o próprio estoque e, se quiser, preço e custo próprios.</small></span></label>
        ${f.comVariacoes ? `<div style="margin-top:12px">
          <div class="linha" style="margin-bottom:10px"><input class="inp" id="pf-gerar" style="flex:1;min-width:200px" placeholder="Criar várias de uma vez: P, M, G, GG" /><button class="btn claro mini" data-a="gerar-var">Criar</button></div>
          ${f.variacoes.length ? `<div class="cab-linhas var"><span>Variação</span><span>Preço</span><span>Custo</span><span>Estoque</span><span>Mínimo</span><span></span></div>` : ""}
          <div class="linhas" style="margin-top:6px">${varRows}</div>
          <button class="link" data-a="add-var-linha" style="margin-top:10px;font-size:12.5px">+ variação</button>
          <p class="bloco-sub" style="margin-top:8px">Preço ou custo em branco = o mesmo do produto.</p>
        </div>` : ""}
      </div>
      ${restaurante() ? `<div class="bloco">
        <p class="bloco-titulo">Cardápio digital</p>
        <div class="campos" style="grid-template-columns:1fr;margin-top:8px">
          <label class="check"><input type="checkbox" data-pf="noCardapio" ${f.noCardapio ? "checked" : ""} /><span>Mostrar no cardápio</span></label>
          <label class="check"><input type="checkbox" data-pf="destaque" ${f.destaque ? "checked" : ""} /><span>Destaque <small>Aparece com selo “mais pedido”.</small></span></label>
          <label class="campo"><span>Descrição</span><textarea data-pf="descricao" maxlength="400" placeholder="Ingredientes, tamanho, serve quantas pessoas…">${esc(f.descricao)}</textarea></label>
        </div>
        <p class="bloco-titulo" style="margin-top:14px">Adicionais e escolhas</p>
        <p class="bloco-sub">Ex.: “Borda” (escolhe 1) ou “Adicionais” (escolhe vários), cada opção com o valor a mais.</p>
        <div class="linhas">${gruposHtml}</div>
        <button class="btn claro mini" data-a="add-grupo" style="margin-top:8px">+ Grupo de adicionais</button>
      </div>` : `<div class="bloco"><label class="campo"><span>Descrição (opcional)</span><textarea data-pf="descricao" maxlength="400">${esc(f.descricao)}</textarea></label></div>`}
      ${novo ? "" : `<div class="bloco"><label class="check"><input type="checkbox" data-pf="ativo" ${f.ativo ? "checked" : ""} /><span>Produto ativo <small>Desmarque para esconder das vendas sem apagar o histórico.</small></span></label></div>`}
      ${f.erro ? `<p class="erro-form">${esc(f.erro)}</p>` : ""}
      <div class="modal-rodape">
        ${novo ? "" : `<button class="btn perigo esq" data-a="excluir-produto">Excluir</button>`}
        <button class="btn claro" data-a="fechar-modal">Cancelar</button>
        <button class="btn acento" data-a="salvar-produto" ${f.salvando ? "disabled" : ""}>${f.salvando ? "Salvando…" : "Salvar"}</button>
      </div>`;
  }
  const redesenharProduto = () => { const y = $(".modal-caixa") ? $(".modal-caixa").scrollTop : 0; corpoModal(formProdutoHtml()); if ($(".modal-caixa")) $(".modal-caixa").scrollTop = y; };
  async function salvarProduto() {
    const f = PF;
    f.erro = "";
    if (!f.nome.trim()) { f.erro = "Dê um nome para o produto."; redesenharProduto(); return; }
    for (const campo of ["preco", "custo"]) if (f[campo] !== "" && Number.isNaN(num(f[campo]))) { f.erro = `${campo === "preco" ? "Preço" : "Custo"} inválido.`; redesenharProduto(); return; }
    const corpo = {
      nome: f.nome, categoria: f.categoria, descricao: f.descricao, codigo: f.codigo, unidade: f.unidade,
      preco: numOu(f.preco), custo: numOu(f.custo), controlaEstoque: f.controlaEstoque, estoqueMinimo: numOu(f.estoqueMinimo),
      estoqueInicial: numOu(f.estoqueInicial), noCardapio: f.noCardapio, destaque: f.destaque, ativo: f.ativo,
      opcoes: f.opcoes.map((g) => ({ ...g, escolhas: g.escolhas.filter((e) => e.nome.trim()).map((e) => ({ nome: e.nome, preco: numOu(e.preco) })) })).filter((g) => g.nome.trim() || g.escolhas.length),
      variacoes: f.comVariacoes ? f.variacoes.filter((v) => v.nome.trim() || v.id).map((v) => ({ id: v.id || undefined, nome: v.nome, codigo: v.codigo || "", preco: v.preco === "" ? null : numOu(v.preco), custo: v.custo === "" ? null : numOu(v.custo), estoqueMinimo: numOu(v.estoqueMinimo), estoqueInicial: numOu(v.estoqueInicial), ativo: v.ativo !== false })) : [],
    };
    if (f.id && !f.comVariacoes && PF.variacoes.some((v) => v.id)) {
      if (!confirm("As variações deste produto serão apagadas (com o estoque delas). Continuar?")) return;
    }
    f.salvando = true; redesenharProduto();
    try {
      const r = f.id ? await api("PUT", `/estoque/produtos/${f.id}`, corpo) : await api("POST", "/estoque/produtos", corpo);
      if (f.fotoNova) await api("PUT", `/estoque/produtos/${r.produto.id}/foto`, { foto: f.fotoNova });
      await recarregarProdutos();
      if (S.negocio.checklist) S.negocio.checklist.produto = true;
      fecharModal();
      toast(f.id ? "Produto salvo." : `“${esc(r.produto.nome)}” cadastrado.`, "ok");
      render();
    } catch (e) { f.salvando = false; f.erro = e.message; redesenharProduto(); }
  }
  // Foto: reduz no navegador (até 900px, JPEG) antes de mandar
  function reduzirFoto(arquivo) {
    return new Promise((ok, falhou) => {
      if (!arquivo || !/^image\//.test(arquivo.type)) { falhou(new Error("Escolha uma imagem.")); return; }
      const leitor = new FileReader();
      leitor.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 900; const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          let q = 0.82; let url = c.toDataURL("image/jpeg", q);
          while (url.length > 550000 && q > 0.4) { q -= 0.12; url = c.toDataURL("image/jpeg", q); }
          ok(url);
        };
        img.onerror = () => falhou(new Error("Não deu para ler essa imagem."));
        img.src = leitor.result;
      };
      leitor.onerror = () => falhou(new Error("Não deu para ler essa imagem."));
      leitor.readAsDataURL(arquivo);
    });
  }

  // Ajuste de estoque
  let AJ = null;
  async function abrirAjuste(id) {
    const p = S.produtos.find((x) => x.id === id);
    if (!p) return;
    PF = null;
    const vs = p.variacoes.filter((v) => v.ativo || v.estoque);
    AJ = { p, variacaoId: vs.length ? vs[0].id : null, modo: "saldo", valor: "", obs: "", movimentos: null, erro: "", salvando: false };
    abrirModal(`Ajustar estoque · ${p.nome}`, ajusteHtml(), { aoFechar: () => { AJ = null; } });
    try { AJ.movimentos = (await api("GET", `/estoque/produtos/${id}/movimentos`)).movimentos; if (AJ) corpoModal(ajusteHtml()); } catch (e) { /* sem histórico */ }
  }
  const NOME_MOV = { inicial: "Estoque inicial", compra: "Compra", venda: "Venda", ajuste: "Ajuste", perda: "Perda", cancelamento: "Cancelamento" };
  function ajusteHtml() {
    const a = AJ; const p = a.p;
    const v = a.variacaoId && p.variacoes.find((x) => x.id === a.variacaoId);
    const atual = v ? v.estoque : p.estoque;
    const modos = [["saldo", "Contei o estoque"], ["entrada", "Entrada (sem compra)"], ["perda", "Perda ou quebra"]];
    const movs = a.movimentos;
    return `${p.variacoes.length ? `<label class="campo" style="margin-bottom:12px"><span>Variação</span><select data-aj="variacaoId">${p.variacoes.map((x) => `<option value="${x.id}" ${x.id === a.variacaoId ? "selected" : ""}>${esc(x.nome)} — ${fmtN(x.estoque)} ${unid(p.unidade)}</option>`).join("")}</select></label>` : ""}
      <p class="sub">Em estoque agora: <b class="num" style="color:var(--ink)">${fmtN(atual)} ${unid(p.unidade)}</b></p>
      <div class="chips" style="margin:12px 0">${modos.map(([k, t]) => `<button class="chip ${a.modo === k ? "ativo" : ""}" data-a="aj-modo" data-v="${k}">${t}</button>`).join("")}</div>
      <div class="campos">
        <label class="campo"><span>${a.modo === "saldo" ? "Quantidade contada" : "Quantidade"}</span><input data-aj="valor" value="${esc(a.valor)}" inputmode="decimal" placeholder="0" autofocus /></label>
        <label class="campo"><span>Observação</span><input data-aj="obs" value="${esc(a.obs)}" maxlength="200" placeholder="Opcional" /></label>
      </div>
      <p class="bloco-sub" style="margin-top:8px">${a.modo === "saldo" ? "O estoque passa a ser exatamente o que você contou." : a.modo === "entrada" ? "Soma ao estoque sem lançar despesa. Mercadoria comprada? Use Compras." : "Tira do estoque (produto vencido, quebrado, usado na casa…)."}</p>
      ${a.erro ? `<p class="erro-form">${esc(a.erro)}</p>` : ""}
      <div class="modal-rodape"><button class="btn claro" data-a="fechar-modal">Cancelar</button><button class="btn acento" data-a="aj-salvar" ${a.salvando ? "disabled" : ""}>${a.salvando ? "Salvando…" : "Confirmar"}</button></div>
      <div class="bloco"><p class="bloco-titulo">Histórico</p>${movs === null ? `<p class="sub">Carregando…</p>` : !movs.length ? `<p class="sub">Sem movimentações.</p>` : `<div class="tabela-wrap"><table class="tabela"><tbody>${movs.slice(0, 40).map((m) => `<tr><td style="white-space:nowrap">${horaBR(m.em)}</td><td>${NOME_MOV[m.tipo] || m.tipo}${m.variacao ? ` · ${esc(m.variacao)}` : ""}${m.obs ? `<div class="prod-cat">${esc(m.obs)}</div>` : ""}</td><td class="dir num ${m.qtd < 0 ? "negativo" : "positivo"}">${m.qtd > 0 ? "+" : ""}${fmtN(m.qtd)}</td><td class="dir num">${fmtN(m.saldo)}</td></tr>`).join("")}</tbody></table></div>`}</div>`;
  }
  async function salvarAjuste() {
    const a = AJ;
    const n = num(a.valor);
    if (Number.isNaN(n) || (a.modo !== "saldo" && n <= 0)) { a.erro = "Informe a quantidade."; corpoModal(ajusteHtml()); return; }
    a.salvando = true; a.erro = ""; corpoModal(ajusteHtml());
    try {
      await api("POST", "/estoque/ajuste", { produtoId: a.p.id, variacaoId: a.variacaoId, modo: a.modo, saldo: n, qtd: n, obs: a.obs });
      await recarregarProdutos();
      fecharModal(); toast("Estoque atualizado.", "ok");
      if (S.tab === "inicio") carregarDaAba("inicio"); else render();
    } catch (e) { a.salvando = false; a.erro = e.message; corpoModal(ajusteHtml()); }
  }

  /* =====================================================================
     Compras de mercadoria
     ===================================================================== */
  function telaCompras() {
    let html = topo("Compras", "Mercadoria que entrou: soma no estoque, atualiza o custo médio e vira despesa “Custo de mercadoria” no Controle financeiro.", `<button class="btn acento" data-a="nova-compra">Registrar compra</button>`);
    if (!S.compras) return html + carregandoHtml;
    if (!S.compras.length) return html + `<div class="card vazio"><b>Nenhuma compra registrada</b>Quando chegar mercadoria do fornecedor, registre aqui: o estoque e o financeiro se atualizam juntos.</div>`;
    return html + `<div class="card" style="padding:6px 8px"><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Data</th><th>Fornecedor</th><th>Itens</th><th class="dir">Total</th><th>Pagamento</th><th></th></tr></thead><tbody>
      ${S.compras.map((c) => `<tr class="${c.cancelada ? "cancelada" : ""}"><td>${dataBR(c.data)}</td><td>${esc(c.fornecedor || "—")}</td><td>${c.itens.map((i) => `${fmtN(i.qtd)}× ${esc(i.nome)}`).join(", ")}${c.frete ? ` <span class="prod-cat">+ frete ${fmt(c.frete)}</span>` : ""}</td><td class="dir num">${fmt(c.total)}</td>
        <td>${esc(nomeMeio(c.meio))}${c.vencimento ? `<div class="prod-cat">vence ${dataBR(c.vencimento)}</div>` : ""}</td>
        <td class="dir">${c.cancelada ? `<span class="selo neutro">cancelada</span>` : `<button class="btn mini perigo" data-a="cancelar-compra" data-id="${c.id}">Cancelar</button>`}</td></tr>`).join("")}
    </tbody></table></div></div>`;
  }
  let CP = null;
  function abrirCompra() {
    if (!S.produtos.length) { toast("Cadastre os produtos antes de registrar a compra."); irPara("produtos"); return; }
    CP = { fornecedor: "", data: hoje(), meio: "pix", pagarDepois: false, vencimento: "", frete: "", linhas: [{ produtoId: "", variacaoId: "", qtd: "", custoUnit: "" }], erro: "", salvando: false };
    abrirModal("Registrar compra", compraHtml(), { largo: true, aoFechar: () => { CP = null; } });
  }
  function compraHtml() {
    const c = CP;
    const opsProd = S.produtos.filter((p) => p.ativo).map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join("");
    const total = r2(c.linhas.reduce((a, l) => a + numOu(l.qtd) * numOu(l.custoUnit), 0) + numOu(c.frete));
    return `<div class="campos">
        <label class="campo"><span>Fornecedor</span><input data-cp="fornecedor" value="${esc(c.fornecedor)}" maxlength="80" placeholder="Opcional" /></label>
        <label class="campo"><span>Data da compra</span><input type="date" data-cp="data" value="${esc(c.data)}" /></label>
        <label class="campo"><span>Forma de pagamento</span><select data-cp="meio">${S.meios.filter((m) => m.id !== "fiado").map((m) => `<option value="${m.id}" ${c.meio === m.id ? "selected" : ""}>${esc(m.nome)}</option>`).join("")}</select></label>
      </div>
      <div class="bloco">
        <div class="cab-linhas compra"><span>Produto</span><span>Variação</span><span>Qtd.</span><span>Custo unit.</span><span>Subtotal</span><span></span></div>
        <div class="linhas" style="margin-top:6px">${c.linhas.map((l, i) => {
          const p = S.produtos.find((x) => x.id === l.produtoId);
          return `<div class="linha-ed compra">
            <label><span class="rotulo-mob">Produto</span><select class="inp" data-cpl="${i}" data-campo="produtoId"><option value="">Escolha…</option>${opsProd.replace(`value="${l.produtoId}"`, `value="${l.produtoId}" selected`)}</select></label>
            <label><span class="rotulo-mob">Variação</span><select class="inp" data-cpl="${i}" data-campo="variacaoId" ${p && p.variacoes.length ? "" : "disabled"}>${p && p.variacoes.length ? `<option value="">Escolha…</option>${p.variacoes.map((v) => `<option value="${v.id}" ${l.variacaoId === v.id ? "selected" : ""}>${esc(v.nome)}</option>`).join("")}` : `<option>—</option>`}</select></label>
            <label><span class="rotulo-mob">Qtd.</span><input class="inp" data-cpl="${i}" data-campo="qtd" value="${esc(l.qtd)}" inputmode="decimal" placeholder="0" /></label>
            <label><span class="rotulo-mob">Custo unit.</span><input class="inp" data-cpl="${i}" data-campo="custoUnit" value="${esc(l.custoUnit)}" inputmode="decimal" placeholder="0,00" /></label>
            <label><span class="rotulo-mob">Subtotal</span><input class="inp num" data-cpl-sub="${i}" value="${fmt(numOu(l.qtd) * numOu(l.custoUnit))}" disabled /></label>
            <button type="button" class="x-linha" data-a="cp-tirar" data-i="${i}" aria-label="Tirar linha" ${c.linhas.length > 1 ? "" : "disabled"}>×</button>
          </div>`;
        }).join("")}</div>
        <button class="link" data-a="cp-add" style="margin-top:10px;font-size:12.5px">+ produto</button>
      </div>
      <div class="bloco campos">
        <label class="campo"><span>Frete</span><input data-cp="frete" value="${esc(c.frete)}" inputmode="decimal" placeholder="0,00" /><small>Entra no custo dos produtos, dividido pelo valor de cada um.</small></label>
        <div class="campo"><span>Pagamento</span><label class="check" style="margin-top:8px"><input type="checkbox" data-cp="pagarDepois" ${c.pagarDepois ? "checked" : ""} /><span>Vou pagar depois</span></label></div>
        ${c.pagarDepois ? `<label class="campo"><span>Vencimento</span><input type="date" data-cp="vencimento" value="${esc(c.vencimento)}" /></label>` : ""}
      </div>
      <div class="cart-linha total"><span>Total da compra</span><span class="num" id="cp-total">${fmt(total)}</span></div>
      ${c.erro ? `<p class="erro-form">${esc(c.erro)}</p>` : ""}
      <div class="modal-rodape"><button class="btn claro" data-a="fechar-modal">Cancelar</button><button class="btn acento" data-a="cp-salvar" ${c.salvando ? "disabled" : ""}>${c.salvando ? "Salvando…" : "Registrar compra"}</button></div>`;
  }
  function atualizarTotalCompra() {
    const c = CP; if (!c) return;
    c.linhas.forEach((l, i) => { const el = document.querySelector(`[data-cpl-sub="${i}"]`); if (el) el.value = fmt(numOu(l.qtd) * numOu(l.custoUnit)); });
    const el = $("#cp-total"); if (el) el.textContent = fmt(r2(c.linhas.reduce((a, l) => a + numOu(l.qtd) * numOu(l.custoUnit), 0) + numOu(c.frete)));
  }
  async function salvarCompra() {
    const c = CP; c.erro = "";
    const linhas = c.linhas.filter((l) => l.produtoId);
    if (!linhas.length) c.erro = "Escolha pelo menos um produto.";
    else if (linhas.some((l) => !(numOu(l.qtd) > 0))) c.erro = "Informe a quantidade de cada produto.";
    else if (linhas.some((l) => { const p = S.produtos.find((x) => x.id === l.produtoId); return p && p.variacoes.length && !l.variacaoId; })) c.erro = "Escolha a variação de cada produto.";
    else if (c.pagarDepois && !c.vencimento) c.erro = "Informe o vencimento.";
    if (c.erro) { corpoModal(compraHtml()); return; }
    c.salvando = true; corpoModal(compraHtml());
    try {
      await api("POST", "/estoque/compras", { fornecedor: c.fornecedor, data: c.data, meio: c.meio, frete: numOu(c.frete), vencimento: c.pagarDepois ? c.vencimento : null,
        itens: linhas.map((l) => ({ produtoId: l.produtoId, variacaoId: l.variacaoId || null, qtd: numOu(l.qtd), custoUnit: numOu(l.custoUnit) })) });
      await recarregarProdutos();
      fecharModal();
      toast("Compra registrada: estoque atualizado e despesa lançada no Controle financeiro.", "ok");
      if (S.tab === "compras") carregarDaAba("compras"); else if (S.tab === "inicio") carregarDaAba("inicio"); else render();
    } catch (e) { c.salvando = false; c.erro = e.message; corpoModal(compraHtml()); }
  }

  /* =====================================================================
     Notas de gasto
     ===================================================================== */
  function telaGastos() {
    const g = S.gasto;
    const mes = hoje().slice(0, 7);
    const doMes = (S.gastos || []).filter((x) => x.data.slice(0, 7) === mes);
    let html = topo("Notas de gasto", "Conta de luz, embalagem, gasolina, manutenção… cada nota vira despesa no Controle financeiro.");
    html += `<div class="card"><h2 class="secao">Nova nota de gasto</h2>
      <div class="campos">
        <label class="campo" style="grid-column:span 2"><span>O que foi</span><input data-g="descricao" value="${esc(g.descricao)}" maxlength="120" placeholder="Ex.: Embalagens para entrega" /></label>
        <label class="campo"><span>Valor</span><input data-g="valor" value="${esc(g.valor)}" inputmode="decimal" placeholder="0,00" /></label>
        <label class="campo"><span>Categoria</span><input data-g="categoria" value="${esc(g.categoria)}" list="g-cats" placeholder="Outros" /><datalist id="g-cats">${CATEGORIAS_GASTO.map((c) => `<option value="${c}">`).join("")}</datalist></label>
      </div>
      <div class="campos" style="margin-top:12px">
        <label class="campo"><span>Data</span><input type="date" data-g="data" value="${esc(g.data || hoje())}" /></label>
        <label class="campo"><span>Pago com</span><select data-g="meio">${S.meios.filter((m) => m.id !== "fiado").map((m) => `<option value="${m.id}" ${g.meio === m.id ? "selected" : ""}>${esc(m.nome)}</option>`).join("")}</select></label>
        <div class="campo"><span>Situação</span><label class="check" style="margin-top:8px"><input type="checkbox" data-g="pago" ${g.pago ? "checked" : ""} /><span>Já está pago</span></label></div>
        <div class="campo" style="justify-content:flex-end"><button class="btn acento" data-a="salvar-gasto">Lançar gasto</button></div>
      </div></div><div class="espaco"></div>`;
    if (!S.gastos) return html + carregandoHtml;
    html += `<div class="linha entre" style="margin-bottom:10px"><h2 class="secao" style="margin:0">Lançadas</h2><span class="sub">Este mês: <b class="num" style="color:var(--ink)">${fmt(doMes.reduce((a, x) => a + x.valor, 0))}</b></span></div>`;
    if (!S.gastos.length) return html + `<div class="card vazio">Nenhuma nota de gasto ainda.</div>`;
    return html + `<div class="card" style="padding:6px 8px"><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Situação</th><th class="dir">Valor</th><th></th></tr></thead><tbody>
      ${S.gastos.map((x) => `<tr><td>${dataBR(x.data)}</td><td>${esc(x.descricao)}</td><td>${esc(x.categoria)}</td><td><span class="selo ${x.status === "Pago" ? "ok" : "baixo"}">${x.status === "Pago" ? "pago" : "a pagar"}</span></td><td class="dir num">${fmt(x.valor)}</td><td class="dir"><button class="btn mini perigo" data-a="excluir-gasto" data-id="${esc(x.id)}">Excluir</button></td></tr>`).join("")}
    </tbody></table></div></div>`;
  }
  async function salvarGasto() {
    const g = S.gasto;
    if (!g.descricao.trim()) { toast("Descreva o gasto.", "erro"); return; }
    if (!(numOu(g.valor) > 0)) { toast("Informe o valor.", "erro"); return; }
    try {
      await api("POST", "/estoque/gastos", { descricao: g.descricao, valor: numOu(g.valor), categoria: g.categoria || "Outros", data: g.data || hoje(), meio: g.meio, pago: g.pago });
      S.gasto = { descricao: "", valor: "", categoria: g.categoria, data: "", meio: g.meio, pago: true };
      toast("Gasto lançado no Controle financeiro.", "ok");
      carregarDaAba("gastos");
    } catch (e) { toast(esc(e.message), "erro"); }
  }

  /* =====================================================================
     Vendas (histórico)
     ===================================================================== */
  function telaVendas() {
    const [a, m] = S.mesVendas.split("-").map(Number);
    const nav = `<div class="linha"><button class="btn claro mini" data-a="mes-vendas" data-d="-1" aria-label="Mês anterior">‹</button><b style="min-width:130px;text-align:center">${MESES[m - 1]} de ${a}</b><button class="btn claro mini" data-a="mes-vendas" data-d="1" aria-label="Próximo mês">›</button></div>`;
    let html = topo("Vendas", "Todas as vendas do balcão e dos pedidos do cardápio. Cancelar devolve ao estoque e tira do financeiro.", nav);
    if (!S.vendas) return html + carregandoHtml;
    const validas = S.vendas.filter((v) => !v.cancelada);
    const tot = validas.reduce((acc, v) => ({ total: acc.total + v.total, cmv: acc.cmv + v.cmv, taxa: acc.taxa + v.taxa, lucro: acc.lucro + v.lucro }), { total: 0, cmv: 0, taxa: 0, lucro: 0 });
    html += `<div class="grade grade-4">
      <div class="card"><p class="kpi-rotulo">Faturamento</p><p class="kpi-valor">${fmt(tot.total)}</p><p class="kpi-nota">${validas.length === 1 ? "1 venda" : `${validas.length} vendas`}${validas.length ? ` · ticket médio ${fmt(tot.total / validas.length)}` : ""}</p></div>
      <div class="card"><p class="kpi-rotulo">Custo da mercadoria</p><p class="kpi-valor">${fmt(tot.cmv)}</p><p class="kpi-nota">pelo custo médio de cada produto</p></div>
      <div class="card"><p class="kpi-rotulo">Taxas de cartão</p><p class="kpi-valor">${fmt(tot.taxa)}</p><p class="kpi-nota">as % ficam em Configurações</p></div>
      <div class="card"><p class="kpi-rotulo">Lucro bruto</p><p class="kpi-valor ${tot.lucro >= 0 ? "positivo" : "negativo"}">${fmt(tot.lucro)}</p><p class="kpi-nota">${tot.total ? `margem de ${Math.round(tot.lucro / tot.total * 100)}%` : "—"}</p></div>
    </div><div class="espaco"></div>`;
    if (!S.vendas.length) return html + `<div class="card vazio">Nenhuma venda neste mês.</div>`;
    return html + `<div class="card" style="padding:6px 8px"><div class="tabela-wrap"><table class="tabela"><thead><tr><th>#</th><th>Data</th><th>Itens</th><th>Pagamento</th><th class="dir">Total</th><th class="dir">Lucro</th></tr></thead><tbody>
      ${S.vendas.map((v) => `<tr class="clicavel ${v.cancelada ? "cancelada" : ""}" data-a="ver-venda" data-id="${v.id}"><td class="num">${v.numero}</td><td>${dataBR(v.data)}</td>
        <td>${v.itens.slice(0, 3).map((i) => `${fmtN(i.qtd)}× ${esc(i.nome)}`).join(", ")}${v.itens.length > 3 ? ` +${v.itens.length - 3}` : ""}${v.cliente ? `<div class="prod-cat">${esc(v.cliente)}${v.pedidoId ? " · cardápio" : ""}</div>` : v.pedidoId ? `<div class="prod-cat">cardápio</div>` : ""}</td>
        <td>${esc(nomeMeio(v.meio))}${v.cancelada ? ` <span class="selo neutro">cancelada</span>` : ""}</td><td class="dir num">${fmt(v.total)}</td><td class="dir num ${v.lucro < 0 ? "negativo" : ""}">${fmt(v.lucro)}</td></tr>`).join("")}
    </tbody></table></div></div>`;
  }
  function verVenda(id) {
    const v = (S.vendas || []).find((x) => x.id === id);
    if (!v) return;
    abrirModal(`Venda #${v.numero}`, `<p class="sub">${dataBR(v.data)} · ${esc(nomeMeio(v.meio))}${v.cliente ? ` · ${esc(v.cliente)}` : ""}${v.cancelada ? " · <b>cancelada</b>" : ""}</p>
      <div class="tabela-wrap" style="margin-top:12px"><table class="tabela"><tbody>${v.itens.map((i) => `<tr><td>${fmtN(i.qtd)}× ${esc(i.nome)}${i.opcoes && i.opcoes.length ? `<div class="prod-cat">${i.opcoes.map(esc).join(", ")}</div>` : ""}</td><td class="dir num">${fmt(i.qtd * i.unit)}</td></tr>`).join("")}</tbody></table></div>
      <div style="margin-top:12px">
        <div class="cart-linha"><span>Subtotal</span><span class="num">${fmt(v.subtotal)}</span></div>
        ${v.desconto ? `<div class="cart-linha"><span>Desconto</span><span class="num negativo">− ${fmt(v.desconto)}</span></div>` : ""}
        ${v.cashbackUsado ? `<div class="cart-linha"><span>Cashback usado</span><span class="num negativo">− ${fmt(v.cashbackUsado)}</span></div>` : ""}
        ${v.premioValor ? `<div class="cart-linha"><span>Prêmio do cartão fidelidade</span><span class="num negativo">− ${fmt(v.premioValor)}</span></div>` : ""}
        ${v.acrescimo ? `<div class="cart-linha"><span>Entrega</span><span class="num">${fmt(v.acrescimo)}</span></div>` : ""}
        <div class="cart-linha total"><span>Total</span><span class="num">${fmt(v.total)}</span></div>
        <div class="cart-linha"><span class="sub">Custo da mercadoria</span><span class="num sub">${fmt(v.cmv)}</span></div>
        ${v.taxa ? `<div class="cart-linha"><span class="sub">Taxa do cartão</span><span class="num sub">${fmt(v.taxa)}</span></div>` : ""}
        <div class="cart-linha"><span><b>Sobrou (lucro bruto)</b></span><b class="num ${v.lucro < 0 ? "negativo" : "positivo"}">${fmt(v.lucro)}</b></div>
      </div>
      ${v.cashbackGanho || v.selosGanhos ? `<p class="aviso info">🎁 ${esc(v.cliente)} ${v.cashbackGanho ? `ganhou ${fmt(v.cashbackGanho)} de cashback` : "ganhou +1 compra no cartão fidelidade"} nesta venda.</p>` : ""}
      ${v.clienteId ? `<p style="margin-top:10px"><button class="link" data-a="cli-ficha" data-id="${v.clienteId}">Ver a ficha de ${esc(v.cliente)}</button></p>` : ""}
      ${v.obs ? `<p class="aviso info">${esc(v.obs)}</p>` : ""}
      <div class="modal-rodape">${v.cancelada ? "" : `<button class="btn perigo esq" data-a="cancelar-venda" data-id="${v.id}">Cancelar venda</button>`}<button class="btn claro" data-a="fechar-modal">Fechar</button></div>`);
  }


  /* =====================================================================
     Clientes (histórico e fidelidade)
     ===================================================================== */
  const diasDesde = (iso) => (iso ? Math.round((new Date(hoje() + "T12:00:00") - new Date(String(iso).slice(0, 10) + "T12:00:00")) / 86400000) : null);
  function fidelidadeCelula(c) {
    const prog = programa();
    if (prog.modelo === "nenhum") return "";
    if (!c.participa) return `<span class="selo neutro">não participa</span>`;
    if (prog.modelo === "cashback") return c.saldo > 0 ? `<span class="selo acento">${fmt(c.saldo)}</span>` : `<span class="sub">—</span>`;
    return c.selos >= prog.selosMeta ? `<span class="selo ok">prêmio liberado</span>` : `<span class="num">${c.selos}/${prog.selosMeta}</span>`;
  }
  function linkWhats(c, sumido) {
    const t = String(c.telefone || "").replace(/\D/g, "");
    if (t.length < 10) return "";
    const nome = (c.nome || "").split(" ")[0];
    const msg = sumido ? `Oi, ${nome}! Aqui é do ${S.negocio.nome || "nosso negócio"}. Faz tempo que você não aparece, sentimos sua falta! 😊` : `Oi, ${nome}! Aqui é do ${S.negocio.nome || "nosso negócio"}.`;
    return `https://wa.me/55${t}?text=${encodeURIComponent(msg)}`;
  }
  function telaClientes() {
    const prog = programa();
    let html = topo("Clientes", "Quem compra com você, quanto já gastou e o que mais pede. O cliente é reconhecido pelo telefone, no balcão e no cardápio.",
      `<button class="btn acento" data-a="cli-novo">Novo cliente</button>`);
    if (prog.modelo === "nenhum") html += `<div class="faixa"><span>Ligue um <b>programa de fidelidade</b> (cartão fidelidade ou cashback) para trazer o cliente de volta.</span><button class="btn mini acento" data-a="ir" data-tab="config">Configurar</button></div>`;
    if (!S.clientes) return html + carregandoHtml;
    const todos = S.clientes;
    const limite = 30;
    const sumidos = todos.filter((c) => c.ultimaCompra && diasDesde(c.ultimaCompra) > limite).length;
    html += `<div class="grade grade-4">
      <div class="card"><p class="kpi-rotulo">Clientes${S.buscaCli || S.filtroCli ? " neste filtro" : ""}</p><p class="kpi-valor">${todos.length}</p><p class="kpi-nota">${todos.filter((c) => c.compras > 1).length} voltaram a comprar</p></div>
      <div class="card"><p class="kpi-rotulo">Sumidos há mais de ${limite} dias</p><p class="kpi-valor">${sumidos}</p><p class="kpi-nota">${sumidos ? "chame pelo WhatsApp" : "ninguém sumido"}</p></div>
      ${prog.modelo === "cashback" ? `<div class="card"><p class="kpi-rotulo">Cashback em aberto</p><p class="kpi-valor">${fmt((S.emAberto || {}).valor)}</p><p class="kpi-nota">${(S.emAberto || {}).clientes || 0} clientes podem usar · validade ${prog.validadeDias ? `${prog.validadeDias} dias` : "sem prazo"}</p></div>`
        : prog.modelo === "selos" ? `<div class="card"><p class="kpi-rotulo">Prêmios liberados</p><p class="kpi-valor">${todos.filter((c) => c.participa && c.selos >= prog.selosMeta).length}</p><p class="kpi-nota">a cada ${prog.selosMeta} compras: ${esc(prog.premioTexto || fmt(prog.premioValor))}</p></div>` : ""}
      <div class="card"><p class="kpi-rotulo">Ticket médio por cliente</p><p class="kpi-valor">${fmt(todos.reduce((a, c) => a + c.totalGasto, 0) / Math.max(1, todos.reduce((a, c) => a + c.compras, 0)))}</p><p class="kpi-nota">valor médio de cada compra</p></div>
    </div><div class="espaco"></div>`;
    html += `<div class="linha" style="margin-bottom:14px"><input class="inp" style="max-width:340px" data-busca-cli value="${esc(S.buscaCli)}" placeholder="Buscar por nome ou telefone" />
      <div class="chips"><button class="chip ${!S.filtroCli ? "ativo" : ""}" data-a="filtro-cli" data-v="">Todos</button><button class="chip ${S.filtroCli === "sumidos" ? "ativo" : ""}" data-a="filtro-cli" data-v="sumidos">Sumidos (+${limite} dias)</button>${prog.modelo !== "nenhum" ? `<button class="chip ${S.filtroCli === "saldo" ? "ativo" : ""}" data-a="filtro-cli" data-v="saldo">${prog.modelo === "cashback" ? "Com cashback" : "Com compras no cartão"}</button>` : ""}</div></div>`;
    if (!todos.length) return html + `<div class="card vazio">${S.buscaCli || S.filtroCli ? "Ninguém neste filtro." : "<b>Nenhum cliente ainda</b>Escolha o cliente no carrinho na hora da venda, ou cadastre aqui. Os pedidos do cardápio entram sozinhos."}</div>`;
    return html + `<div class="card" style="padding:6px 8px"><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Cliente</th><th class="dir">Compras</th><th class="dir">Total gasto</th><th>Última compra</th>${prog.modelo !== "nenhum" ? `<th>${prog.modelo === "cashback" ? "Cashback" : "Cartão"}</th>` : ""}<th></th></tr></thead><tbody>
      ${todos.map((c) => {
        const d = diasDesde(c.ultimaCompra); const sumido = d !== null && d > limite;
        const w = linkWhats(c, sumido);
        return `<tr class="clicavel" data-a="cli-ficha" data-id="${c.id}">
          <td><div class="prod-nome">${esc(c.nome || "Sem nome")}</div><div class="prod-cat">${c.telefone ? telFmt(c.telefone) : "sem telefone"}</div></td>
          <td class="dir num">${c.compras}</td><td class="dir num">${fmt(c.totalGasto)}</td>
          <td>${c.ultimaCompra ? `${dataBR(c.ultimaCompra)}<div class="prod-cat ${sumido ? "negativo" : ""}">${d === 0 ? "hoje" : d === 1 ? "ontem" : `há ${d} dias`}</div>` : `<span class="sub">—</span>`}</td>
          ${prog.modelo !== "nenhum" ? `<td>${fidelidadeCelula(c)}</td>` : ""}
          <td class="dir">${w ? `<a class="btn mini ${sumido ? "acento" : "claro"}" href="${esc(w)}" target="_blank" rel="noopener">${sumido ? "Chamar de volta" : "WhatsApp"}</a>` : ""}</td>
        </tr>`;
      }).join("")}</tbody></table></div></div>`;
  }

  let FC = null; // ficha aberta
  async function abrirFicha(id) {
    FC = { id, dados: null, edit: null, erro: "", aba: "historico" };
    abrirModal("Cliente", `<p class="sub">Carregando…</p>`, { largo: true, aoFechar: () => { FC = null; } });
    try { FC.dados = await api("GET", `/estoque/clientes/${id}`); if (FC) corpoModal(fichaHtml()); } catch (e) { corpoModal(`<p class="erro-form">${esc(e.message)}</p>`); }
  }
  function fichaHtml() {
    const { cliente: c, beneficio: b, vendas, preferidos, cashback } = FC.dados;
    const prog = programa();
    const e = FC.edit;
    const validas = vendas.filter((v) => !v.cancelada);
    let progHtml = "";
    if (prog.modelo !== "nenhum") {
      if (!c.participa) progHtml = `<p class="sub">Não participa do programa de fidelidade.</p><button class="btn mini claro" data-a="fc-participa" style="margin-top:8px">O cliente aceitou participar</button>`;
      else if (prog.modelo === "cashback") progHtml = `<p class="kpi-valor">${fmt(b.saldo)}</p><p class="kpi-nota">${b.vence ? `${fmt(b.vence.valor)} vence em ${dataBR(b.vence.data)}` : "saldo para usar"}</p>
          <div class="linha" style="margin-top:10px"><input class="inp" id="fc-credito" inputmode="decimal" placeholder="R$ 0,00" style="width:110px" /><button class="btn mini claro" data-a="fc-ajuste">Dar crédito</button></div>`;
      else progHtml = `<div class="selos">${Array.from({ length: prog.selosMeta }, (_, i) => `<i class="${i < b.selos ? "cheio" : ""}"></i>`).join("")}</div>
          <p class="kpi-nota">${b.selos} de ${prog.selosMeta} compras${b.podePremio ? " · <b>prêmio liberado</b>" : ""}</p>
          <div class="linha" style="margin-top:10px"><input class="inp" id="fc-selos" inputmode="numeric" value="${b.selos}" style="width:80px" /><button class="btn mini claro" data-a="fc-ajuste">Corrigir</button></div>`;
    }
    const w = linkWhats(c, false);
    return `${e ? `<div class="campos">
        <label class="campo"><span>Nome</span><input data-fce="nome" value="${esc(e.nome)}" maxlength="80" /></label>
        <label class="campo"><span>Telefone</span><input data-fce="telefone" value="${esc(e.telefone)}" inputmode="tel" /></label>
      </div><div class="campos" style="margin-top:12px;grid-template-columns:1fr">
        <label class="campo"><span>Endereço</span><input data-fce="endereco" value="${esc(e.endereco)}" maxlength="200" /></label>
        <label class="campo"><span>Observações</span><input data-fce="obs" value="${esc(e.obs)}" maxlength="300" placeholder="Ex.: alérgico a camarão, prefere entregar no portão" /></label>
        ${prog.modelo !== "nenhum" ? `<label class="check"><input type="checkbox" data-fce="participa" ${e.participa ? "checked" : ""} /><span>Participa do programa de fidelidade</span></label>` : ""}
      </div>${FC.erro ? `<p class="erro-form">${esc(FC.erro)}</p>` : ""}
      <div class="modal-rodape"><button class="btn perigo esq" data-a="fc-excluir">Excluir cliente</button><button class="btn claro" data-a="fc-cancelar">Cancelar</button><button class="btn acento" data-a="fc-salvar">Salvar</button></div>`
      : `<div class="linha entre" style="align-items:flex-start"><div><h3 class="serif" style="font-size:22px;margin:0">${esc(c.nome || "Sem nome")}</h3>
          <p class="sub">${c.telefone ? telFmt(c.telefone) : "sem telefone"}${c.endereco ? ` · ${esc(c.endereco)}` : ""}</p>${c.obs ? `<p class="aviso info">${esc(c.obs)}</p>` : ""}</div>
        <div class="linha">${w ? `<a class="btn mini claro" href="${esc(w)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}<button class="btn mini claro" data-a="fc-editar">Editar</button></div></div>`}
      <div class="grade grade-4" style="margin-top:16px">
        <div class="card"><p class="kpi-rotulo">Compras</p><p class="kpi-valor">${c.compras}</p><p class="kpi-nota">${c.ultimaCompra ? `última em ${dataBR(c.ultimaCompra)}` : "nenhuma ainda"}</p></div>
        <div class="card"><p class="kpi-rotulo">Total gasto</p><p class="kpi-valor">${fmt(c.totalGasto)}</p><p class="kpi-nota">${c.compras ? `ticket médio ${fmt(c.totalGasto / c.compras)}` : "—"}</p></div>
        ${prog.modelo !== "nenhum" ? `<div class="card"><p class="kpi-rotulo">${prog.modelo === "cashback" ? "Cashback" : "Cartão fidelidade"}</p>${progHtml}</div>` : ""}
      </div>
      ${preferidos.length ? `<div class="bloco"><p class="bloco-titulo">O que mais pede</p><div class="chips" style="margin-top:8px">${preferidos.map((x) => `<span class="chip">${esc(x.nome)} · ${fmtN(x.qtd)}×</span>`).join("")}</div></div>` : ""}
      <div class="bloco"><p class="bloco-titulo">Compras</p>${vendas.length ? `<div class="tabela-wrap"><table class="tabela"><tbody>${vendas.slice(0, 40).map((v) => `<tr class="${v.cancelada ? "cancelada" : ""}">
          <td class="num" style="white-space:nowrap">${dataBR(v.data)}</td><td>${v.itens.slice(0, 3).map((i) => `${fmtN(i.qtd)}× ${esc(i.nome)}`).join(", ")}${v.itens.length > 3 ? ` +${v.itens.length - 3}` : ""}
          ${v.cashbackUsado ? `<div class="prod-cat">usou ${fmt(v.cashbackUsado)} de cashback</div>` : v.premioValor ? `<div class="prod-cat">usou o prêmio do cartão</div>` : ""}</td>
          <td class="dir num">${fmt(v.total)}</td><td class="dir">${v.cashbackGanho ? `<span class="selo acento">+${fmt(v.cashbackGanho)}</span>` : v.selosGanhos ? `<span class="selo acento">+1</span>` : ""}</td></tr>`).join("")}</tbody></table></div>` : `<p class="sub">Nenhuma compra ainda.</p>`}</div>
      ${prog.modelo === "cashback" && cashback.length ? `<div class="bloco"><p class="bloco-titulo">Extrato do cashback</p><div class="tabela-wrap"><table class="tabela"><tbody>${cashback.slice(0, 30).map((x) => `<tr><td class="num">${horaBR(x.em)}</td><td>${esc(x.obs || "Crédito")}</td><td class="dir num">+${fmt(x.valor)}</td><td class="dir">${x.vencido ? `<span class="selo neutro">venceu</span>` : x.restante <= 0 ? `<span class="selo neutro">usado</span>` : `<span class="sub">resta ${fmt(x.restante)}${x.expiraEm ? ` até ${dataBR(x.expiraEm)}` : ""}</span>`}</td></tr>`).join("")}</tbody></table></div></div>` : ""}`;
  }
  async function recarregarFicha() {
    if (!FC) return;
    try { FC.dados = await api("GET", `/estoque/clientes/${FC.id}`); corpoModal(fichaHtml()); } catch (e) { toast(esc(e.message), "erro"); }
  }
  async function carregarClientes() {
    const q = new URLSearchParams(); if (S.buscaCli.trim()) q.set("busca", S.buscaCli.trim()); if (S.filtroCli) q.set("filtro", S.filtroCli);
    const r = await api("GET", `/estoque/clientes?${q}`);
    S.clientes = r.clientes; S.emAberto = r.emAberto;
  }

  /* =====================================================================
     Pedidos do cardápio (restaurante)
     ===================================================================== */
  const NOME_PAG = { pix: "Pix", dinheiro: "Dinheiro", cartao: "Cartão" };
  function telaPedidos() {
    let html = topo("Pedidos do cardápio", "O cliente manda o pedido pelo seu WhatsApp e ele também aparece aqui. Confirmou? Registre a venda com um toque: baixa no estoque e receita no financeiro.");
    if (!S.negocio.cardapioAtivo) html += `<div class="faixa"><span>O cardápio digital está desligado.</span><button class="btn mini acento" data-a="ir" data-tab="cardapio">Ligar</button></div>`;
    if (!S.pedidos) return html + carregandoHtml;
    const novos = S.pedidos.filter((p) => p.status === "novo");
    const outros = S.pedidos.filter((p) => p.status !== "novo");
    const card = (p) => {
      const tel = (p.clienteTel || "").replace(/\D/g, "");
      return `<div class="card pedido ${p.status !== "novo" ? "resolvido" : ""}">
        <div class="pedido-topo"><div><span class="pedido-num">#${String(p.numero).padStart(3, "0")}</span> <span class="selo ${p.tipo === "entrega" ? "acento" : "neutro"}">${p.tipo === "entrega" ? "entrega" : "retirada"}</span>${p.status === "vendido" ? ` <span class="selo ok">venda registrada</span>` : p.status === "recusado" ? ` <span class="selo neutro">recusado</span>` : ""}${p.querBeneficio && p.status === "novo" ? ` <span class="selo baixo">🎁 quer usar ${programa().modelo === "selos" ? "o prêmio" : "o cashback"}</span>` : ""}<div class="pedido-dados">${horaBR(p.criadoEm)}</div></div><b class="num" style="font-size:17px">${fmt(p.total)}</b></div>
        <ul class="pedido-itens">${p.itens.map((i) => `<li>${i.qtd}× ${esc(i.nome)} — <span class="num">${fmt(i.qtd * i.unit)}</span>${i.opcoes && i.opcoes.length ? `<small>${i.opcoes.map(esc).join(", ")}</small>` : ""}</li>`).join("")}</ul>
        <div class="pedido-dados"><b style="color:var(--ink)">${esc(p.clienteNome)}</b>${p.clienteTel ? ` · ${esc(p.clienteTel)}` : ""}<br/>${p.endereco ? `${esc(p.endereco)}<br/>` : ""}Pagamento: ${NOME_PAG[p.pagamento] || esc(p.pagamento)}${p.troco ? ` (troco para ${esc(p.troco)})` : ""}${p.taxaEntrega ? ` · entrega ${fmt(p.taxaEntrega)}` : ""}${p.obs ? `<br/>Obs.: ${esc(p.obs)}` : ""}</div>
        ${p.status === "novo" ? `<div class="linha"><button class="btn acento mini" data-a="vender-pedido" data-id="${p.id}">Registrar venda</button>${tel ? `<a class="btn claro mini" href="https://wa.me/${tel.length <= 11 ? "55" + tel : tel}" target="_blank" rel="noopener">WhatsApp do cliente</a>` : ""}<button class="btn perigo mini" data-a="recusar-pedido" data-id="${p.id}">Recusar</button></div>` : ""}
      </div>`;
    };
    html += novos.length ? `<div class="grade grade-2">${novos.map(card).join("")}</div>` : `<div class="card vazio"><b>Nenhum pedido esperando</b>Os pedidos novos aparecem aqui sozinhos.</div>`;
    if (outros.length) html += `<div class="espaco"></div><h2 class="secao">Resolvidos</h2><div class="grade grade-2">${outros.slice(0, 20).map(card).join("")}</div>`;
    return html;
  }
  async function venderPedido(id) {
    const p = S.pedidos.find((x) => x.id === id);
    if (!p) return;
    const sugerido = p.pagamento === "cartao" ? "credito" : p.pagamento === "dinheiro" ? "dinheiro" : "pix";
    const corpo = (benef) => `<p class="sub">${fmt(p.total)} · ${esc(p.clienteNome)}. Como o cliente pagou?</p>
      <div class="chips" style="margin:14px 0" id="vp-meios">${S.meios.map((m) => `<button class="chip ${m.id === sugerido ? "ativo" : ""}" data-a="vp-meio" data-v="${m.id}">${esc(meioCurto(m.id))}</button>`).join("")}</div>
      ${benef || ""}
      <div class="modal-rodape"><button class="btn claro" data-a="fechar-modal">Cancelar</button><button class="btn acento" data-a="vp-ok" data-id="${p.id}">Registrar venda</button></div>`;
    abrirModal(`Registrar venda do pedido #${String(p.numero).padStart(3, "0")}`, corpo(""));
    const prog = programa();
    if (!p.clienteId || prog.modelo === "nenhum") return;
    try {
      const f = await api("GET", `/estoque/clientes/${p.clienteId}`);
      const b = f.beneficio;
      let html = "";
      if (!f.cliente.participa) html = `<p class="aviso info">${esc(f.cliente.nome)} não participa do programa de fidelidade.</p>`;
      else if (prog.modelo === "cashback") html = b.saldo > 0
        ? `<label class="check"><input type="checkbox" id="vp-benef" ${p.querBeneficio ? "checked" : ""} /><span>Usar o cashback do cliente: <b>${fmt(Math.min(b.saldo, p.subtotal))}</b>${p.querBeneficio ? "<small>O cliente pediu para usar.</small>" : ""}</span></label><p class="bloco-sub" style="margin-top:6px">Se usar, avise o cliente do novo total antes de ele pagar.</p>`
        : `<p class="aviso info">Sem cashback para usar. Nesta compra ${esc(f.cliente.nome)} ganha ${fmt(r2(p.subtotal * prog.cashbackPct / 100))}.</p>`;
      else html = b.podePremio
        ? `<label class="check"><input type="checkbox" id="vp-benef" ${p.querBeneficio ? "checked" : ""} /><span>Usar o prêmio do cartão: <b>${esc(prog.premioTexto || fmt(prog.premioValor) + " de desconto")}</b></span></label>`
        : `<p class="aviso info">Cartão fidelidade: ${b.selos} de ${prog.selosMeta} compras.</p>`;
      if ($("#vp-meios")) { const ativo = ($("#vp-meios .chip.ativo") || {}).dataset; corpoModal(corpo(html)); if (ativo) document.querySelectorAll("#vp-meios .chip").forEach((c) => c.classList.toggle("ativo", c.dataset.v === ativo.v)); }
    } catch (e) { /* sem o benefício: registra normal */ }
  }

  /* =====================================================================
     Cardápio digital (restaurante)
     ===================================================================== */
  let CF = null;
  const linkCardapio = () => `${location.origin}/c/${S.negocio.slug || ""}`;
  function telaCardapio() {
    const n = S.negocio;
    if (!CF) CF = { cardapioAtivo: n.cardapioAtivo, slug: n.slug || "", whatsapp: n.whatsapp || "", frase: n.frase || "", cor: n.cor || "#2F5D46", horario: n.horario || "", aceitaRetirada: n.aceitaRetirada, aceitaEntrega: n.aceitaEntrega, taxaEntrega: n.taxaEntrega ? br(n.taxaEntrega) : "", pedidoMinimo: n.pedidoMinimo ? br(n.pedidoMinimo) : "", categorias: (n.categorias || []).join(", "), erro: "" };
    const noCard = S.produtos.filter((p) => p.ativo && p.noCardapio).length;
    let html = topo("Cardápio digital", "O cliente abre o link, monta o pedido e manda pelo seu WhatsApp. Sem pagamento no site: ele paga na entrega ou na retirada.");
    html += `<div class="grade grade-2" style="align-items:start">
      <div class="card">
        <h2 class="secao">Seu link</h2>
        ${n.cardapioAtivo && n.slug ? `<div class="link-box"><code>${esc(linkCardapio())}</code><button class="btn mini" data-a="copiar-link">Copiar</button><a class="btn mini claro" href="${esc(linkCardapio())}" target="_blank" rel="noopener">Abrir</a></div>
          <p class="sub" style="margin:12px 0 8px">QR code para imprimir e colar no balcão ou nas mesas:</p><div id="qr-cardapio"></div>
          <div style="margin-top:8px"><button class="link" data-a="baixar-qr" style="font-size:12.5px">Baixar QR code</button></div>`
          : `<p class="sub">${n.cardapioAtivo ? "Salve as configurações para gerar o link." : "Ligue o cardápio ao lado para gerar o link."}</p>`}
        <div class="bloco"><p class="bloco-titulo">${noCard === 1 ? "1 produto aparece" : `${noCard} produtos aparecem`} no cardápio</p><p class="bloco-sub">Foto, descrição e adicionais de cada um ficam no cadastro do produto. Produto sem estoque aparece como “esgotado”.</p><button class="btn claro mini" data-a="ir" data-tab="produtos">Ir para os produtos</button></div>
      </div>
      <div class="card">
        <h2 class="secao">Configurações</h2>
        <label class="check" style="margin-bottom:14px"><input type="checkbox" data-cf="cardapioAtivo" ${CF.cardapioAtivo ? "checked" : ""} /><span><b>Cardápio no ar</b><small>Desligado, o link mostra “cardápio fora do ar”.</small></span></label>
        <div class="campos" style="grid-template-columns:1fr">
          <label class="campo"><span>Endereço do link</span><div class="prefixo"><span>${esc(location.host)}/c/</span><input data-cf="slug" value="${esc(CF.slug)}" maxlength="40" /></div></label>
          <label class="campo"><span>WhatsApp que recebe os pedidos</span><input data-cf="whatsapp" value="${esc(CF.whatsapp)}" inputmode="tel" placeholder="(11) 98888-7777" /></label>
          <label class="campo"><span>Frase de apresentação</span><input data-cf="frase" value="${esc(CF.frase)}" maxlength="140" placeholder="Ex.: Massas artesanais desde 1998" /></label>
          <label class="campo"><span>Horário de funcionamento</span><input data-cf="horario" value="${esc(CF.horario)}" maxlength="80" placeholder="Ex.: Ter a dom, 18h às 23h" /></label>
        </div>
        <div class="campos" style="margin-top:12px">
          <label class="campo"><span>Cor</span><input type="color" data-cf="cor" value="${esc(CF.cor)}" style="padding:3px;height:40px" /></label>
          <label class="campo"><span>Pedido mínimo</span><input data-cf="pedidoMinimo" value="${esc(CF.pedidoMinimo)}" inputmode="decimal" placeholder="0,00" /></label>
        </div>
        <div class="bloco campos" style="grid-template-columns:1fr">
          <label class="check"><input type="checkbox" data-cf="aceitaRetirada" ${CF.aceitaRetirada ? "checked" : ""} /><span>Aceito retirada no local</span></label>
          <label class="check"><input type="checkbox" data-cf="aceitaEntrega" ${CF.aceitaEntrega ? "checked" : ""} /><span>Faço entrega</span></label>
          ${CF.aceitaEntrega ? `<label class="campo"><span>Taxa de entrega</span><input data-cf="taxaEntrega" value="${esc(CF.taxaEntrega)}" inputmode="decimal" placeholder="0,00 = grátis" /></label>` : ""}
          <label class="campo"><span>Ordem das categorias</span><input data-cf="categorias" value="${esc(CF.categorias)}" placeholder="Ex.: Pizzas, Massas, Bebidas, Sobremesas" /><small>Separe por vírgula. As que faltarem vão para o fim, em ordem alfabética.</small></label>
        </div>
        ${CF.erro ? `<p class="erro-form">${esc(CF.erro)}</p>` : ""}
        <div class="modal-rodape"><button class="btn acento" data-a="salvar-cardapio">Salvar</button></div>
      </div></div>`;
    return html;
  }
  function desenharQr() {
    const el = $("#qr-cardapio");
    if (!el) return;
    const fazer = () => { el.innerHTML = ""; new window.QRCode(el, { text: linkCardapio(), width: 168, height: 168, correctLevel: window.QRCode.CorrectLevel.M }); };
    if (window.QRCode) { fazer(); return; }
    const tag = document.createElement("script");
    tag.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    tag.onload = () => { if ($("#qr-cardapio")) fazer(); };
    document.head.appendChild(tag);
  }
  async function salvarCardapio() {
    const c = CF; c.erro = "";
    try {
      const r = await api("PUT", "/estoque/negocio", {
        cardapioAtivo: c.cardapioAtivo, slug: c.slug, whatsapp: c.whatsapp, frase: c.frase, cor: c.cor, horario: c.horario,
        aceitaRetirada: c.aceitaRetirada, aceitaEntrega: c.aceitaEntrega, taxaEntrega: numOu(c.taxaEntrega), pedidoMinimo: numOu(c.pedidoMinimo),
        categorias: c.categorias.split(",").map((x) => x.trim()).filter(Boolean),
      });
      S.negocio = r.negocio; CF = null;
      toast(S.negocio.cardapioAtivo ? "Cardápio salvo e no ar." : "Configurações salvas. O cardápio está desligado.", "ok");
    } catch (e) { c.erro = e.message; }
    render();
  }
  async function marcarDivulgado() {
    if (S.negocio.checklist && S.negocio.checklist.cardapio) return;
    try { S.negocio = (await api("PUT", "/estoque/negocio", { checklist: { cardapio: true } })).negocio; } catch (e) { /* tanto faz */ }
  }

  /* =====================================================================
     Configurações
     ===================================================================== */
  let CFG = null;
  function telaConfig() {
    const n = S.negocio;
    if (!CFG) CFG = { tipo: n.tipo, nome: n.nome, controlaEstoque: n.controlaEstoque, erro: "" };
    return topo("Configurações", "O seu negócio e como o aplicativo funciona.") + `<div class="grade grade-2" style="align-items:start">
      <div class="card">
        <h2 class="secao">Seu negócio</h2>
        <div class="campos" style="grid-template-columns:1fr">
          <label class="campo"><span>Nome</span><input data-cfg="nome" value="${esc(CFG.nome)}" maxlength="80" /></label>
          <label class="campo"><span>Tipo de negócio</span><select data-cfg="tipo">${TIPOS.map(([id, , t]) => `<option value="${id}" ${CFG.tipo === id ? "selected" : ""}>${t}</option>`).join("")}</select><small>Restaurante ganha o cardápio digital e a aba Pedidos.</small></label>
          <label class="check"><input type="checkbox" data-cfg="controlaEstoque" ${CFG.controlaEstoque ? "checked" : ""} /><span>Controlar estoque nos produtos novos<small>Cada produto pode ligar ou desligar o controle no próprio cadastro.</small></span></label>
        </div>
        ${CFG.erro ? `<p class="erro-form">${esc(CFG.erro)}</p>` : ""}
        <div class="modal-rodape"><button class="btn acento" data-a="salvar-config">Salvar</button></div>
      </div>
      ${programaCardHtml()}
      <div class="card">
        <h2 class="secao">Taxas de cartão e Pix</h2>
        <p class="sub">As % que a maquininha cobra viram despesa “Taxas de pagamento” a cada venda. Elas ficam no Controle financeiro, aba Lucro → Taxas da venda (as mesmas do fechamento de venda do CRM).</p>
        <div style="margin-top:14px"><a class="btn claro" href="../financeiro/#lucro">Abrir as taxas no financeiro</a></div>
        <div class="bloco"><p class="bloco-titulo">Como entra no Controle financeiro</p>
          <ul class="lista-simples">
            <li><span>Venda no balcão</span><span class="selo ok">Receita · Vendas</span></li>
            <li><span>Compra de mercadoria</span><span class="selo baixo">Despesa · Custo de mercadoria</span></li>
            <li><span>Nota de gasto</span><span class="selo baixo">Despesa · a categoria escolhida</span></li>
            <li><span>Taxa do cartão</span><span class="selo baixo">Despesa · Taxas de pagamento</span></li>
          </ul>
          <p class="bloco-sub" style="margin-top:8px">O custo da mercadoria vendida não vira despesa de novo (ela já entrou quando você comprou). Ele aparece no lucro de cada venda, aqui e na aba Lucro do financeiro.</p>
        </div>
      </div></div>`;
  }
  // Programa de fidelidade: o dono escolhe UM modelo
  let FP = null;
  function programaCardHtml() {
    if (!FP) { const f = programa(); FP = { ...f, cashbackPct: br(f.cashbackPct || 5).replace(/,00$/, ""), validadeDias: String(f.validadeDias || 0), minimoUso: f.minimoUso ? br(f.minimoUso) : "", selosMeta: String(f.selosMeta || 10), selosMinimo: f.selosMinimo ? br(f.selosMinimo) : "", premioValor: f.premioValor ? br(f.premioValor) : "", premioTexto: f.premioTexto || "", erro: "" }; }
    const m = FP.modelo;
    const modelos = [["nenhum", "Desligado"], ["selos", "Cartão fidelidade"], ["cashback", "Cashback"]];
    const exemplo = m === "cashback" ? `Ex.: compra de R$ 100 com ${FP.cashbackPct || "5"}% = R$ ${br(100 * numOu(FP.cashbackPct) / 100)} de crédito para a próxima.`
      : m === "selos" ? `Ex.: a cada ${FP.selosMeta || 10} compras, ${FP.premioTexto || "o prêmio"} (vale ${FP.premioValor ? "R$ " + FP.premioValor : "R$ —"} de desconto).` : "";
    return `<div class="card">
      <h2 class="secao">Programa de fidelidade</h2>
      <p class="sub">Vale para o balcão e para o cardápio. Só ganha quem aceitar participar, e quem aplica o benefício é você, na hora da venda.</p>
      <div class="chips" style="margin:14px 0">${modelos.map(([k, t]) => `<button class="chip ${m === k ? "ativo" : ""}" data-a="fp-modelo" data-v="${k}">${t}</button>`).join("")}</div>
      ${m === "selos" ? `<div class="campos">
          <label class="campo"><span>A cada quantas compras</span><input data-fp="selosMeta" value="${esc(FP.selosMeta)}" inputmode="numeric" /></label>
          <label class="campo"><span>Desconto do prêmio (R$)</span><input data-fp="premioValor" value="${esc(FP.premioValor)}" inputmode="decimal" placeholder="Ex.: 30,00" /></label>
        </div><div class="campos" style="margin-top:12px">
          <label class="campo"><span>Como o prêmio aparece</span><input data-fp="premioTexto" value="${esc(FP.premioTexto)}" maxlength="80" placeholder="Ex.: uma pizza média grátis" /></label>
          <label class="campo"><span>Compra mínima para contar</span><input data-fp="selosMinimo" value="${esc(FP.selosMinimo)}" inputmode="decimal" placeholder="0,00 = qualquer valor" /></label>
        </div>` : m === "cashback" ? `<div class="campos">
          <label class="campo"><span>% de volta</span><input data-fp="cashbackPct" value="${esc(FP.cashbackPct)}" inputmode="decimal" /></label>
          <label class="campo"><span>Validade (dias)</span><input data-fp="validadeDias" value="${esc(FP.validadeDias)}" inputmode="numeric" /><small>0 = não vence</small></label>
          <label class="campo"><span>Usar só a partir de</span><input data-fp="minimoUso" value="${esc(FP.minimoUso)}" inputmode="decimal" placeholder="0,00" /></label>
        </div>` : `<p class="sub">Clientes e histórico funcionam do mesmo jeito; só não há recompensa.</p>`}
      ${exemplo ? `<p class="aviso info" id="fp-exemplo">${esc(exemplo)}</p>` : ""}
      ${m === "cashback" ? `<p class="bloco-sub" style="margin-top:10px">No financeiro, o cashback usado entra como desconto da venda. O que os clientes ainda podem usar aparece em Clientes, como “cashback em aberto”.</p>` : ""}
      ${FP.erro ? `<p class="erro-form">${esc(FP.erro)}</p>` : ""}
      <div class="modal-rodape"><button class="btn acento" data-a="salvar-programa">Salvar programa</button></div>
    </div>`;
  }
  async function salvarPrograma() {
    const f = FP; f.erro = "";
    const corpo = { modelo: f.modelo, cashbackPct: numOu(f.cashbackPct), validadeDias: numOu(f.validadeDias), minimoUso: numOu(f.minimoUso), selosMeta: numOu(f.selosMeta), selosMinimo: numOu(f.selosMinimo), premioValor: numOu(f.premioValor), premioTexto: f.premioTexto };
    try {
      const antes = programa().modelo;
      S.negocio = (await api("PUT", "/estoque/negocio", { fidelidade: corpo })).negocio;
      FP = null;
      const novo = programa().modelo;
      toast(novo === "nenhum" ? "Programa de fidelidade desligado." : antes !== novo && antes !== "nenhum" ? "Programa trocado. O que os clientes já tinham continua guardado, caso volte ao modelo anterior." : "Programa de fidelidade salvo.", "ok");
    } catch (e) { f.erro = e.message; }
    render();
  }
  async function salvarConfig() {
    const c = CFG; c.erro = "";
    const eraRest = restaurante();
    try {
      S.negocio = (await api("PUT", "/estoque/negocio", { tipo: c.tipo, nome: c.nome, controlaEstoque: c.controlaEstoque })).negocio;
      CFG = null;
      $("#nome-negocio").textContent = S.negocio.nome || "PDV";
      document.querySelectorAll("[data-so-restaurante]").forEach((el) => { el.hidden = !restaurante(); });
      toast(!eraRest && restaurante() ? "Salvo! Agora você tem o Cardápio digital e a aba Pedidos." : "Salvo.", "ok");
    } catch (e) { c.erro = e.message; }
    render();
  }

  /* =====================================================================
     Cliques (um ouvinte só)
     ===================================================================== */
  document.addEventListener("click", async (ev) => {
    const nav = ev.target.closest(".nav-item[data-tab]");
    if (nav) { irPara(nav.dataset.tab); return; }
    if (!ev.target.closest(".cli-busca")) { const sg = $("#cli-sugestoes"); if (sg) sg.hidden = true; }
    const el = ev.target.closest("[data-a]");
    if (!el) return;
    const a = el.dataset.a; const id = el.dataset.id;
    if (a === "fundo-modal") { if (ev.target === el) fecharModal(); return; }
    switch (a) {
      case "fechar-modal": fecharModal(); break;
      // checklist
      case "bv-tipo": BV.tipo = el.dataset.v; if (BV.tipo === "restaurante" && BV.controla === null) BV.controla = false; telaBoasVindas(); break;
      case "bv-controla": BV.controla = el.dataset.v === "1"; telaBoasVindas(); break;
      case "bv-voltar": BV.passo -= 1; BV.erro = ""; telaBoasVindas(); break;
      case "bv-avancar": if (BV.passo < 3) { BV.passo += 1; telaBoasVindas(); } else concluirBoasVindas(); break;
      // geral
      case "ir": fecharModal(); irPara(el.dataset.tab); break;
      case "esconder-passos": S.negocio.checklist = { ...(S.negocio.checklist || {}), escondido: true }; render(); api("PUT", "/estoque/negocio", { checklist: { escondido: true } }).catch(() => {}); break;
      // vender
      case "cat-pdv": S.catPdv = el.dataset.v; render(); break;
      case "add-cart": {
        const p = S.produtos.find((x) => x.id === id); if (!p) break;
        if (p.variacoes.filter((v) => v.ativo).length) escolherVariacao(p); else adicionarAoCarrinho(p, null);
        break;
      }
      case "add-var": { const p = S.produtos.find((x) => x.id === id); const v = p && p.variacoes.find((x) => x.id === el.dataset.v); if (v) { fecharModal(); adicionarAoCarrinho(p, v); } break; }
      case "qtd": { const i = S.carrinho[Number(el.dataset.i)]; if (!i) break; i.qtd = r2(Math.max(0, numOu(i.qtd) + Number(el.dataset.d))); if (i.qtd <= 0) S.carrinho.splice(Number(el.dataset.i), 1); redesenharCarrinho(); break; }
      case "tirar": S.carrinho.splice(Number(el.dataset.i), 1); redesenharCarrinho(); break;
      case "limpar-cart": S.carrinho = []; S.cartDescValor = ""; redesenharCarrinho(); break;
      case "meio": S.cartMeio = el.dataset.v; redesenharCarrinho(); break;
      case "outra-data": S.cartOutraData = true; S.cartData = hoje(); redesenharCarrinho(); break;
      case "avulso": itemAvulso(); break;
      case "av-ok": {
        const nome = $("#av-nome").value.trim(); const preco = num($("#av-preco").value); const qtd = numOu($("#av-qtd").value, 1);
        if (!nome || Number.isNaN(preco) || !(qtd > 0)) { const e = $("#av-erro"); e.hidden = false; e.textContent = "Informe o nome, o preço e a quantidade."; break; }
        S.carrinho.push({ chave: `av-${Date.now()}`, avulso: true, produtoId: null, variacaoId: null, nome, unit: preco, qtd });
        fecharModal(); redesenharCarrinho(); break;
      }
      case "finalizar": finalizarVenda(); break;
      case "ver-carrinho": $("#carrinho").scrollIntoView({ behavior: "smooth" }); break;
      // produtos
      case "novo-produto": abrirProduto(null); break;
      case "editar-produto": if (ev.target.closest('[data-a="ajustar"]')) break; abrirProduto(S.produtos.find((x) => x.id === id)); break;
      case "filtro-prod": S.filtroProd = el.dataset.v; render(); break;
      case "ajustar": ev.stopPropagation(); abrirAjuste(id); break;
      case "salvar-produto": salvarProduto(); break;
      case "excluir-produto": {
        if (!confirm(`Excluir “${PF.nome}”? O histórico de estoque some; as vendas já feitas continuam. Prefere só desativar? Desmarque “Produto ativo”.`)) break;
        try { await api("DELETE", `/estoque/produtos/${PF.id}`); await recarregarProdutos(); fecharModal(); toast("Produto excluído."); render(); } catch (e) { toast(esc(e.message), "erro"); }
        break;
      }
      case "tirar-foto": if (PF.id && PF.foto) { try { await api("PUT", `/estoque/produtos/${PF.id}/foto`, { foto: null }); await recarregarProdutos(); } catch (e) { toast(esc(e.message), "erro"); break; } } PF.foto = ""; PF.fotoNova = null; redesenharProduto(); break;
      case "add-var-linha": PF.variacoes.push({ nome: "", preco: "", custo: "", estoqueInicial: "", estoqueMinimo: "" }); redesenharProduto(); break;
      case "tirar-var": {
        const v = PF.variacoes[Number(el.dataset.i)];
        if (v && v.id && v.estoque && !confirm(`A variação “${v.nome}” tem ${fmtN(v.estoque)} em estoque. Tirar mesmo assim?`)) break;
        PF.variacoes.splice(Number(el.dataset.i), 1); redesenharProduto(); break;
      }
      case "gerar-var": {
        const nomes = ($("#pf-gerar").value || "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
        const ja = new Set(PF.variacoes.map((v) => v.nome.toLowerCase()));
        nomes.forEach((n) => { if (!ja.has(n.toLowerCase())) { PF.variacoes.push({ nome: n.slice(0, 60), preco: "", custo: "", estoqueInicial: "", estoqueMinimo: "" }); ja.add(n.toLowerCase()); } });
        redesenharProduto(); break;
      }
      case "add-grupo": PF.opcoes.push({ nome: "", tipo: "varios", escolhas: [{ nome: "", preco: "" }] }); redesenharProduto(); break;
      case "tirar-grupo": PF.opcoes.splice(Number(el.dataset.i), 1); redesenharProduto(); break;
      case "add-escolha": PF.opcoes[Number(el.dataset.i)].escolhas.push({ nome: "", preco: "" }); redesenharProduto(); break;
      case "tirar-escolha": { const [g, e] = el.dataset.i.split(":").map(Number); PF.opcoes[g].escolhas.splice(e, 1); redesenharProduto(); break; }
      // ajuste
      case "aj-modo": AJ.modo = el.dataset.v; AJ.erro = ""; corpoModal(ajusteHtml()); break;
      case "aj-salvar": salvarAjuste(); break;
      // compras
      case "nova-compra": abrirCompra(); break;
      case "cp-add": CP.linhas.push({ produtoId: "", variacaoId: "", qtd: "", custoUnit: "" }); corpoModal(compraHtml()); break;
      case "cp-tirar": CP.linhas.splice(Number(el.dataset.i), 1); corpoModal(compraHtml()); break;
      case "cp-salvar": salvarCompra(); break;
      case "cancelar-compra": {
        if (!confirm("Cancelar esta compra? A mercadoria sai do estoque e a despesa sai do Controle financeiro.")) break;
        try { await api("POST", `/estoque/compras/${id}/cancelar`); await recarregarProdutos(); toast("Compra cancelada."); carregarDaAba("compras"); } catch (e) { toast(esc(e.message), "erro"); }
        break;
      }
      // gastos
      case "salvar-gasto": salvarGasto(); break;
      case "excluir-gasto": {
        if (!confirm("Excluir esta nota de gasto? Ela sai também do Controle financeiro.")) break;
        try { await api("DELETE", `/estoque/gastos/${encodeURIComponent(id)}`); toast("Gasto excluído."); carregarDaAba("gastos"); } catch (e) { toast(esc(e.message), "erro"); }
        break;
      }
      // vendas
      case "mes-vendas": {
        const [y, m] = S.mesVendas.split("-").map(Number); const d = new Date(y, m - 1 + Number(el.dataset.d), 1);
        S.mesVendas = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; S.vendas = null; render(); carregarDaAba("vendas"); break;
      }
      case "ver-venda": verVenda(id); break;
      case "cancelar-venda": {
        if (!confirm("Cancelar esta venda? Os produtos voltam para o estoque e a receita sai do Controle financeiro.")) break;
        try { await api("POST", `/estoque/vendas/${id}/cancelar`); await recarregarProdutos(); fecharModal(); toast("Venda cancelada."); carregarDaAba("vendas"); } catch (e) { toast(esc(e.message), "erro"); }
        break;
      }
      // pedidos
      case "vender-pedido": venderPedido(id); break;
      case "vp-meio": document.querySelectorAll("#vp-meios .chip").forEach((c) => c.classList.toggle("ativo", c === el)); break;
      case "vp-ok": {
        const meio = ($("#vp-meios .chip.ativo") || {}).dataset; el.disabled = true;
        try {
          const usar = !!($("#vp-benef") && $("#vp-benef").checked);
          const r = await api("POST", `/estoque/pedidos/${id}/vender`, { meio: meio ? meio.v : undefined, usarCashback: usar && programa().modelo === "cashback", usarPremio: usar && programa().modelo === "selos" });
          fecharModal(); await recarregarProdutos();
          toast(`<b>Venda #${r.venda.numero} registrada · ${fmt(r.venda.total)}</b>${r.alertas.length ? `<br/>⚠ ${r.alertas.map(esc).join("<br/>⚠ ")}` : ""}`, r.alertas.length ? "" : "ok");
          carregarDaAba("pedidos"); atualizarSelos();
        } catch (e) { el.disabled = false; toast(esc(e.message), "erro"); }
        break;
      }
      case "recusar-pedido": {
        if (!confirm("Recusar este pedido? Avise o cliente pelo WhatsApp.")) break;
        try { await api("POST", `/estoque/pedidos/${id}/recusar`); carregarDaAba("pedidos"); atualizarSelos(); } catch (e) { toast(esc(e.message), "erro"); }
        break;
      }
      // cardápio
      case "salvar-cardapio": salvarCardapio(); break;
      case "copiar-link": {
        try { await navigator.clipboard.writeText(linkCardapio()); toast("Link copiado. Cole no Instagram, no WhatsApp ou no Google.", "ok"); }
        catch (e) { prompt("Copie o link:", linkCardapio()); }
        marcarDivulgado(); break;
      }
      case "baixar-qr": {
        const img = $("#qr-cardapio img") || $("#qr-cardapio canvas");
        if (!img) break;
        const link = document.createElement("a"); link.download = `cardapio-${S.negocio.slug}.png`;
        link.href = img.tagName === "CANVAS" ? img.toDataURL("image/png") : img.src; link.click(); marcarDivulgado(); break;
      }
      // configurações
      case "salvar-config": salvarConfig(); break;
      case "fp-modelo": FP.modelo = el.dataset.v; FP.erro = ""; render(); break;
      case "salvar-programa": salvarPrograma(); break;
      // cliente no carrinho
      case "cart-cli-escolher": escolherClienteNoCarrinho(id); break;
      case "cart-cli-novo": novoClienteModal(S.cartCliente, (c) => escolherClienteNoCarrinho(c.id)); break;
      case "cart-cli-tirar": S.cartCli = null; S.cartUsarBenef = false; redesenharCarrinho(); setTimeout(() => { const i = $("[data-cli-busca]"); if (i) i.focus(); }, 30); break;
      case "cart-cli-participa": try { await api("PUT", `/estoque/clientes/${S.cartCli.id}`, { participa: true }); escolherClienteNoCarrinho(S.cartCli.id); } catch (e) { toast(esc(e.message), "erro"); } break;
      case "nc-ok": {
        const erroEl = $("#nc-erro");
        try {
          const r = await api("POST", "/estoque/clientes", { nome: $("#nc-nome").value, telefone: $("#nc-tel").value, participa: !!($("#nc-participa") && $("#nc-participa").checked) });
          const depois = novoClienteModal.aoSalvar; fecharModal();
          toast(`${esc(r.cliente.nome)} cadastrado.`, "ok");
          if (depois) depois(r.cliente);
        } catch (e) { erroEl.hidden = false; erroEl.textContent = e.message; }
        break;
      }
      // clientes
      case "cli-novo": novoClienteModal("", async (c) => { await carregarDaAba("clientes"); abrirFicha(c.id); }); break;
      case "filtro-cli": S.filtroCli = el.dataset.v; S.clientes = null; render(); carregarDaAba("clientes"); break;
      case "cli-ficha": if (ev.target.closest("a")) break; abrirFicha(id); break;
      case "fc-editar": FC.edit = { nome: FC.dados.cliente.nome, telefone: telFmt(FC.dados.cliente.telefone), endereco: FC.dados.cliente.endereco, obs: FC.dados.cliente.obs, participa: FC.dados.cliente.participa }; FC.erro = ""; corpoModal(fichaHtml()); break;
      case "fc-cancelar": FC.edit = null; corpoModal(fichaHtml()); break;
      case "fc-salvar": {
        try { await api("PUT", `/estoque/clientes/${FC.id}`, FC.edit); FC.edit = null; await recarregarFicha(); if (S.tab === "clientes") { await carregarClientes(); } }
        catch (e) { FC.erro = e.message; corpoModal(fichaHtml()); }
        break;
      }
      case "fc-excluir": {
        if (!confirm(`Excluir ${FC.dados.cliente.nome || "este cliente"}? As vendas continuam no histórico, só sem a ligação com ele. O saldo do programa de fidelidade é perdido.`)) break;
        try { await api("DELETE", `/estoque/clientes/${FC.id}`); fecharModal(); toast("Cliente excluído."); if (S.tab === "clientes") carregarDaAba("clientes"); } catch (e) { toast(esc(e.message), "erro"); }
        break;
      }
      case "fc-participa": try { await api("PUT", `/estoque/clientes/${FC.id}`, { participa: true }); await recarregarFicha(); } catch (e) { toast(esc(e.message), "erro"); } break;
      case "fc-ajuste": {
        const corpo = programa().modelo === "cashback" ? { valor: numOu($("#fc-credito").value) } : { selos: numOu($("#fc-selos").value, -1) };
        try { FC.dados = await api("POST", `/estoque/clientes/${FC.id}/ajuste`, corpo); corpoModal(fichaHtml()); toast("Pronto, atualizado.", "ok"); if (S.tab === "clientes") { await carregarClientes(); } } catch (e) { toast(esc(e.message), "erro"); }
        break;
      }
      default: break;
    }
  });

  /* ----------------------------- digitação ----------------------------- */
  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t.matches("[data-bv]")) { if (t.type !== "checkbox") BV[t.dataset.bv] = t.value; return; }
    if (t.matches("[data-cli-busca]")) { S.cartCliente = t.value; buscarClienteCarrinho(t.value); return; }
    if (t.matches("[data-busca-cli]")) {
      S.buscaCli = t.value;
      clearTimeout(t._timer);
      t._timer = setTimeout(async () => {
        try { await carregarClientes(); } catch (e) { return; }
        if (S.tab !== "clientes" || modalAberto()) return;
        const pos = (($("[data-busca-cli]") || {}).selectionStart) || S.buscaCli.length; render();
        const n = $("[data-busca-cli]"); if (n) { n.focus(); n.setSelectionRange(pos, pos); }
      }, 300);
      return;
    }
    if (FC && FC.edit && t.matches("[data-fce]") && t.type !== "checkbox") { FC.edit[t.dataset.fce] = t.value; return; }
    if (FP && t.matches("[data-fp]")) { FP[t.dataset.fp] = t.value; return; }
    if (t.matches("[data-busca-pdv]")) { S.busca = t.value; const g = $("#grade-pdv"); if (g) g.innerHTML = gradePdvHtml(); return; }
    if (t.matches("[data-busca-prod]")) {
      S.buscaProd = t.value; const pos = t.selectionStart; render();
      const n = $("[data-busca-prod]"); if (n) { n.focus(); n.setSelectionRange(pos, pos); }
      return;
    }
    if (t.matches("[data-cart-qtd]")) { const i = S.carrinho[Number(t.dataset.cartQtd)]; if (i) { i.qtd = t.value; atualizarTotais(); } return; }
    if (t.matches("[data-cart-preco]")) { const i = S.carrinho[Number(t.dataset.cartPreco)]; if (i) { i.unit = t.value; atualizarTotais(); } return; }
    if (t.matches("[data-cart]") && t.tagName === "INPUT") { S[t.dataset.cart] = t.value; if (t.dataset.cart === "cartDescValor") atualizarTotais(); return; }
    if (PF && t.matches("[data-pf]") && t.type !== "checkbox" && t.tagName !== "SELECT") {
      PF[t.dataset.pf] = t.value;
      if (t.dataset.pf === "preco" || t.dataset.pf === "custo") { const m = numOu(PF.preco) > 0 ? Math.round((numOu(PF.preco) - numOu(PF.custo)) / numOu(PF.preco) * 100) : null; const el = $("#pf-margem"); if (el) el.textContent = m === null ? "Quanto você paga por ele" : `Margem: ${m}%`; }
      return;
    }
    if (PF && t.matches("[data-var]")) { PF.variacoes[Number(t.dataset.var)][t.dataset.campo] = t.value; return; }
    if (PF && t.matches("[data-op]") && t.tagName === "INPUT") { PF.opcoes[Number(t.dataset.op)][t.dataset.campo] = t.value; return; }
    if (PF && t.matches("[data-esc]")) { const [g, e] = t.dataset.esc.split(":").map(Number); PF.opcoes[g].escolhas[e][t.dataset.campo] = t.value; return; }
    if (AJ && t.matches("[data-aj]") && t.tagName === "INPUT") { AJ[t.dataset.aj] = t.value; return; }
    if (CP && t.matches("[data-cpl]") && t.tagName === "INPUT") { CP.linhas[Number(t.dataset.cpl)][t.dataset.campo] = t.value; atualizarTotalCompra(); return; }
    if (CP && t.matches("[data-cp]") && t.type !== "checkbox" && t.tagName !== "SELECT") { CP[t.dataset.cp] = t.value; if (t.dataset.cp === "frete") atualizarTotalCompra(); return; }
    if (t.matches("[data-g]") && t.type !== "checkbox" && t.tagName !== "SELECT") { S.gasto[t.dataset.g] = t.value; return; }
    if (CF && t.matches("[data-cf]") && t.type !== "checkbox") { CF[t.dataset.cf] = t.value; return; }
    if (CFG && t.matches("[data-cfg]") && t.type !== "checkbox" && t.tagName !== "SELECT") { CFG[t.dataset.cfg] = t.value; return; }
  });
  document.addEventListener("change", async (ev) => {
    const t = ev.target;
    if (t.matches("[data-bv]") && t.type === "checkbox") { BV[t.dataset.bv] = t.checked; return; }
    if (t.matches("[data-cart-qtd], [data-cart-preco]")) { redesenharCarrinho(); return; }
    if (t.matches("[data-cart-benef]")) { S.cartUsarBenef = t.checked; atualizarTotais(); return; }
    if (FC && FC.edit && t.matches("[data-fce]") && t.type === "checkbox") { FC.edit[t.dataset.fce] = t.checked; return; }
    if (t.matches("[data-cart]") && t.tagName === "SELECT") { S[t.dataset.cart] = t.value; atualizarTotais(); return; }
    if (t.matches('[data-cart="cartData"]')) { S.cartData = t.value; return; }
    if (PF && t.matches("[data-pf]")) {
      if (t.type === "checkbox") {
        PF[t.dataset.pf] = t.checked;
        if (t.dataset.pf === "comVariacoes" && t.checked && !PF.variacoes.length) PF.variacoes.push({ nome: "", preco: "", custo: "", estoqueInicial: "", estoqueMinimo: "" });
        if (["controlaEstoque", "comVariacoes"].includes(t.dataset.pf)) redesenharProduto();
      } else PF[t.dataset.pf] = t.value;
      return;
    }
    if (PF && t.matches("[data-op]") && t.tagName === "SELECT") { PF.opcoes[Number(t.dataset.op)].tipo = t.value; return; }
    if (PF && t.matches("[data-pf-foto]")) {
      try {
        const url = await reduzirFoto(t.files[0]);
        if (PF.id) { await api("PUT", `/estoque/produtos/${PF.id}/foto`, { foto: url }); await recarregarProdutos(); const p = S.produtos.find((x) => x.id === PF.id); PF.foto = p ? p.foto : url; }
        else PF.fotoNova = url;
        redesenharProduto();
      } catch (e) { toast(esc(e.message), "erro"); }
      return;
    }
    if (AJ && t.matches('[data-aj="variacaoId"]')) { AJ.variacaoId = t.value; corpoModal(ajusteHtml()); return; }
    if (CP && t.matches("[data-cpl]") && t.tagName === "SELECT") {
      const l = CP.linhas[Number(t.dataset.cpl)];
      l[t.dataset.campo] = t.value;
      if (t.dataset.campo === "produtoId") {
        const p = S.produtos.find((x) => x.id === t.value);
        l.variacaoId = ""; l.custoUnit = p && !p.variacoes.length && p.custo ? br(p.custo) : "";
      } else if (t.dataset.campo === "variacaoId") {
        const p = S.produtos.find((x) => x.id === l.produtoId); const v = p && p.variacoes.find((x) => x.id === t.value);
        if (v && v.custoFinal && !l.custoUnit) l.custoUnit = br(v.custoFinal);
      }
      corpoModal(compraHtml()); return;
    }
    if (CP && t.matches("[data-cp]")) { CP[t.dataset.cp] = t.type === "checkbox" ? t.checked : t.value; if (t.type === "checkbox" || t.tagName === "SELECT") corpoModal(compraHtml()); return; }
    if (t.matches("[data-g]")) { S.gasto[t.dataset.g] = t.type === "checkbox" ? t.checked : t.value; return; }
    if (CF && t.matches("[data-cf]") && t.type === "checkbox") { CF[t.dataset.cf] = t.checked; render(); return; }
    if (CFG && t.matches("[data-cfg]")) { CFG[t.dataset.cfg] = t.type === "checkbox" ? t.checked : t.value; return; }
  });
  // Enter na busca do balcão: leitor de código de barras (ou um resultado só) cai direto no carrinho
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && modalAberto()) { fecharModal(); return; }
    const t = ev.target;
    if (ev.key === "Enter" && t.matches("[data-busca-pdv]")) {
      const b = S.busca.trim().toLowerCase(); if (!b) return;
      let achou = null; let variacao = null;
      for (const p of ativos()) {
        if (p.codigo && p.codigo.toLowerCase() === b) { achou = p; break; }
        const v = p.variacoes.find((x) => x.codigo && x.codigo.toLowerCase() === b);
        if (v) { achou = p; variacao = v; break; }
      }
      if (!achou) { const l = produtosDoPdv(); if (l.length === 1) achou = l[0]; }
      if (!achou) return;
      ev.preventDefault();
      if (variacao || !achou.variacoes.filter((v) => v.ativo).length) adicionarAoCarrinho(achou, variacao);
      else escolherVariacao(achou);
      S.busca = ""; t.value = ""; const g = $("#grade-pdv"); if (g) g.innerHTML = gradePdvHtml();
    }
    if (ev.key === "Enter" && t.closest("#modal") && t.id && t.id.startsWith("av-")) { ev.preventDefault(); const b = document.querySelector('[data-a="av-ok"]'); if (b) b.click(); }
    if (ev.key === "Enter" && t.closest("#modal") && t.id && t.id.startsWith("nc-")) { ev.preventDefault(); const b = document.querySelector('[data-a="nc-ok"]'); if (b) b.click(); }
    // Enter na busca de cliente do carrinho: escolhe o primeiro da lista
    if (ev.key === "Enter" && t.matches("[data-cli-busca]")) { const b = document.querySelector('#cli-sugestoes:not([hidden]) button'); if (b) { ev.preventDefault(); b.click(); } }
  });

  // link para uma aba (#vendas, #compras…) com o aplicativo já aberto
  window.addEventListener("hashchange", () => {
    const tab = (location.hash || "").slice(1);
    if (!S.negocio || $("#app").hidden || tab === S.tab) return;
    if (document.querySelector(`.nav-item[data-tab="${tab}"]:not([hidden])`)) { fecharModal(); irPara(tab); }
  });
  $("#sair").addEventListener("click", sair);
  $("#abrir-menu").addEventListener("click", () => $("#app").classList.add("menu-aberto"));
  $("#menu-fundo").addEventListener("click", () => $("#app").classList.remove("menu-aberto"));

  /* ----------------------------- início ----------------------------- */
  async function iniciar() {
    $("#boas-vindas").innerHTML = `<div class="carregando"><p>Carregando o PDV…</p></div>`;
    try {
      const d = await api("GET", "/estoque");
      S.negocio = d.negocio; S.produtos = d.produtos; S.meios = d.meios; S.unidades = d.unidades;
    } catch (e) {
      const semPermissao = /^O gestor da sua equipe/.test(e.message || "");
      $("#boas-vindas").innerHTML = `<div class="carregando"><p>${esc(e.message)}</p>${semPermissao ? `<p>Peça para o gestor liberar em Equipe → Permissões, no CRM.</p>` : `<button class="btn" id="de-novo">Tentar de novo</button>`}<p><a href="/">Voltar</a></p></div>`;
      const b = $("#de-novo"); if (b) b.addEventListener("click", iniciar);
      return;
    }
    if (!S.negocio || !(S.negocio.checklist && S.negocio.checklist.configurado)) { telaBoasVindas(); return; }
    $("#boas-vindas").innerHTML = "";
    abrirApp();
  }
  iniciar();
})();
