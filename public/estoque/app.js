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
  const fmt = (n) => n === undefined && ACESSO && !pode("custos") ? "—" : (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

  function sair(completo) {
    if (window.Acesso) return Acesso.sair(completo === true);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "../login.html";
  }

  async function api(metodo, caminho, corpo, tentativa = 0) {
    const opts = { method: metodo, headers: { Authorization: "Bearer " + token } };
    const tokOp = ehFuncionario() ? null : lerOperador(); if (tokOp && tokOp.token) opts.headers["x-operador"] = tokOp.token;
    if (cabecalhoExtra) Object.assign(opts.headers, cabecalhoExtra);
    if (corpo !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(corpo); }
    let res;
    try { res = await fetch(API + caminho, opts); } catch (e) {
      if (S.negocio && !S.offline) { S.offline = true; setTimeout(desenharFaixaOffline, 0); }
      throw new Error("Sem conexão com o servidor. Confira sua internet.");
    }
    if (S.offline && res.status < 500) { S.offline = false; setTimeout(() => { desenharFaixaOffline(); sincronizarFila(); }, 0); }
    if (res.status < 500 && tokOp && tokOp.local) setTimeout(encerrarSessaoLocal, 0); // o servidor respondeu: volta a valer o PIN online
    if (res.status === 401) { sair(true); throw new Error("Sessão expirada."); }
    if (res.status === 402) { window.location.href = "../assinatura.html?de=estoque"; throw new Error("Sua assinatura não está ativa."); }
    let dados = null;
    try { dados = await res.json(); } catch (e) { /* sem corpo */ }
    if (!res.ok) {
      if (res.status === 403 && dados && dados.operador) { if (S.pdv && pinObrigatorio()) { esquecerOperador(); setTimeout(() => mostrarTrava(dados.error), 0); } }
      const acordando = [502, 503, 504].includes(res.status) && (metodo === "GET" || (dados && dados.tentarDeNovo));
      if (acordando && tentativa < 2) { await new Promise((ok) => setTimeout(ok, tentativa ? 2500 : 1000)); return api(metodo, caminho, corpo, tentativa + 1); }
      throw new Error((dados && dados.error) || (acordando ? "O servidor está acordando. Tente de novo em alguns segundos." : "Erro de comunicação com o servidor."));
    }
    return dados;
  }

  // operador do caixa neste aparelho (o token do PIN)
  const CHAVE_OP = "pdv-operador";
  // (sessão "local" = entrou com o PIN sem internet: não tem token do servidor, só a credencial de venda offline)
  function lerOperador() { try { const o = JSON.parse(localStorage.getItem(CHAVE_OP) || "null"); return o && (o.token || o.local) && o.ate > Date.now() ? o : null; } catch (e) { return null; } }
  function guardarOperador(r) { try { localStorage.setItem(CHAVE_OP, JSON.stringify({ token: r.token, offline: r.offline || null, operador: r.operador, ate: Date.now() + 13.5 * 3600 * 1000 })); } catch (e) { /* sem armazenamento */ } }
  let cabecalhoExtra = null; // usado só ao enviar a fila (a credencial de quem fez a venda sem internet)
  function esquecerOperador() { try { localStorage.removeItem(CHAVE_OP); } catch (e) { /* nada */ } }

  /* ---------- função de quem está usando (utils/acesso.js no servidor) ----------
     dono: tudo (ou, com "Pedir o PIN", o que a função de quem entrou permite);
     funcionário (pelo próprio celular): o token já diz quem é; aparelho da loja: só com o PIN.
     Aqui só se esconde o que a pessoa não usa — quem decide é o servidor. */
  let ACESSO = null;
  const ehFuncionario = () => !!(ACESSO && ACESSO.tipo === "funcionario") || (window.Acesso && Acesso.tipoLocal() === "funcionario");
  const ehLoja = () => !!(ACESSO && ACESSO.tipo === "loja") || (window.Acesso && Acesso.tipoLocal() === "loja");
  const pinObrigatorio = () => !!(S.pdv && S.pdv.exigirOperador) || ehLoja();
  function permsAtuais() {
    if (!ACESSO) return null;
    if (ACESSO.tipo === "dono") return ACESSO.pdv && lerOperador() ? ACESSO.pdv.permissoes : null;
    if (ACESSO.tipo === "loja" && !lerOperador()) return {};
    return ACESSO.permissoes || {};
  }
  function pode(k) { const p = permsAtuais(); return !p || !!p[k]; }
  const PERM_ABA = { vender: ["vender"], caixa: ["vender", "caixa"], produtos: ["produtosVer", "produtos"], compras: ["compras"], relatorios: ["relatorios"], clientes: ["clientes"], config: ["config"], mesas: ["mesas"], cozinha: ["mesas"], pedidos: ["mesas"], cardapio: ["config"] };
  const podeAba = (t) => !PERM_ABA[t] || PERM_ABA[t].some(pode);
  // gestor ou gerente (cancelar, excluir produto): o dono sem PIN de funcionário também
  const ehChefia = () => { if (!permsAtuais()) return true; const o = typeof operadorAtual === "function" ? operadorAtual() : null; return !!(o && ["gestor", "gerente"].includes(o.papel)); };
  const ehGestor = () => !ACESSO || (ACESSO.tipo === "dono" ? !(ACESSO.pdv && lerOperador()) || ACESSO.pdv.operador.papel === "gestor" : !!ACESSO.gestor);
  async function carregarAcesso() {
    try { ACESSO = await api("GET", "/acesso"); } catch (e) { if (!ACESSO) ACESSO = null; }
    return ACESSO;
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
    tab: "caixa", resumo: null,
    pdv: {}, operadores: [], caixa: null, caixas: null, relAba: "vendas", caixaDetalhe: null,
    anPer: "mes", anBase: "lucro", anVar: false, analise: null, // análises (curva ABC, horários)
    fiscal: null, offline: false, // NFC-e e venda sem internet
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
  // recursos do plano (o Essencial não tem restaurante, nota fiscal, equipe nem relatórios avançados)
  const tem = (r) => !S.recursos || S.recursos[r] !== false;
  const NOME_COMPLETO = {
    restaurante: ["Cardápio digital, mesas e cozinha", "O cliente pede pelo cardápio no celular, o garçom lança nas mesas e a cozinha vê tudo numa tela."],
    nfce: ["Nota fiscal (NFC-e)", "Emita a nota da venda e dê entrada nas compras pelo XML da nota do fornecedor."],
    equipe: ["Operadores com PIN", "Cada funcionário entra no caixa com o próprio PIN, e o sistema guarda quem vendeu, quem abriu e quem fechou o caixa."],
    relatorios: ["Relatórios avançados", "Veja quais produtos dão mais lucro, a margem de cada um e os dias e horários mais fortes."],
  };
  function completoHtml(r, compacto = false) {
    const [t, d] = NOME_COMPLETO[r];
    return `<div class="card plano-completo ${compacto ? "compacto" : ""}"><span class="selo-completo">Plano Completo</span><h2 class="secao" style="margin:8px 0 4px">${t}</h2><p class="sub">${d}</p>
      <p class="sub" style="margin-top:6px">Faz parte do plano Completo. O que você já cadastrou fica guardado e volta a aparecer quando mudar de plano.</p>
      <a class="btn acento" style="margin-top:12px" href="../assinatura.html?de=estoque">Ver planos</a></div>`;
  }
  const nomeMeio = (id) => (S.meios.find((m) => m.id === id) || { nome: id }).nome;
  const CURTO = { dinheiro: "Dinheiro", pix: "Pix", debito: "Débito", credito: "Crédito", transferencia: "Transferência", boleto: "Boleto", fiado: "Fiado", outro: "Outro" };
  const meioCurto = (id) => CURTO[id] || nomeMeio(id);
  // "Pix + Débito"; fiado ainda aberto aparece como "Fiado (a receber)"
  const pagamentoTexto = (v) => (v.pagamentos && v.pagamentos.length > 1 ? v.pagamentos.map((p) => meioCurto(p.meio)).join(" + ") : v.meio === "fiado" && v.fiadoAberto ? "Fiado (a receber)" : meioCurto(v.meio));
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
    if (!tem("restaurante")) document.querySelectorAll('.nav-item[data-tab="mesas"], .nav-item[data-tab="cozinha"], .nav-item[data-tab="pedidos"], .nav-item[data-tab="cardapio"]').forEach((el) => { if (!el.querySelector(".selo-completo")) el.insertAdjacentHTML("beforeend", '<span class="selo-completo mini">Completo</span>'); });
    const [doHash, idDoHash] = (location.hash || "").replace("#", "").split("/");
    const ALIAS = { inicio: "caixa", vendas: "relatorios", gastos: "relatorios" };
    if (doHash === "gastos") S.relAba = "despesas";
    const validas = ["caixa", "vender", "produtos", "compras", "relatorios", "clientes", "config", ...(restaurante() ? ["pedidos", "cardapio", "mesas", "cozinha"] : [])];
    const alvo = ALIAS[doHash] || doHash;
    desenharNavCelular();
    atualizarChipOperador();
    irPara(validas.includes(alvo) && podeAba(alvo) ? alvo : primeiraAba() || "vender");
    // link vindo do CRM (#clientes/<id>): abre a ficha desse cliente
    if (alvo === "clientes" && idDoHash && S.tab === "clientes") setTimeout(() => abrirFicha(idDoHash), 300);
    atualizarSelos();
    if (restaurante()) setInterval(atualizarSelos, 60000);
  }
  function primeiraAba() {
    const ordem = ehGarcom() ? ["mesas", "cozinha", "pedidos"] : (S.pdv.exigirCaixa && !S.caixa ? ["caixa"] : []).concat(restaurante() && tem("restaurante") ? ["mesas", "vender"] : ["vender"]);
    return [...ordem, "caixa", "vender", "mesas", "produtos", "compras", "clientes", "relatorios", "config"].find((t) => podeAba(t) && (restaurante() || !["mesas", "cozinha", "pedidos", "cardapio"].includes(t))) || null;
  }
  function irPara(tab) {
    if (!tab || !podeAba(tab)) tab = primeiraAba();
    if (!tab) { semAcessoAoPdv(); return; }
    S.tab = tab;
    if (location.hash !== "#" + tab) history.replaceState(null, "", "#" + tab);
    document.querySelectorAll(".nav-item[data-tab], .nav-cel button[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    const mais = document.querySelector('.nav-cel [data-a="nav-mais"]');
    if (mais) mais.classList.toggle("active", !abasCelular().includes(tab));
    $("#app").classList.remove("menu-aberto");
    render();
    window.scrollTo(0, 0);
    carregarDaAba(tab);
  }
  async function carregarDaAba(tab) {
    if (["pedidos", "mesas", "cozinha", "cardapio"].includes(tab) && !tem("restaurante")) return;
    try {
      if (tab === "caixa") { const [r, c] = await Promise.all([api("GET", "/estoque/resumo"), api("GET", "/estoque/caixa")]); S.resumo = r; S.caixa = c.aberto; }
      else if (tab === "relatorios") {
        if (S.relAba === "vendas") await carregarVendas();
        else if (S.relAba === "produtos" || S.relAba === "horarios") await carregarAnalise();
        else if (S.relAba === "caixas") S.caixas = (await api("GET", "/estoque/caixa/historico")).caixas;
        else S.gastos = (await api("GET", "/estoque/gastos")).gastos;
      }
      else if (tab === "compras") { S.compras = (await api("GET", "/estoque/compras")).compras; }
      else if (tab === "pedidos") { S.pedidos = (await api("GET", "/estoque/pedidos")).pedidos; }
      else if (tab === "mesas") { await carregarMesas(); if (S.tab === "mesas" && !modalAberto()) render(); return; }
      else if (tab === "cozinha") { await carregarCozinha(); if (S.tab === "cozinha" && !modalAberto()) render(); return; }
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
    } catch (e) { if (S.offline && ehErroDeRede(e)) return; toast(esc(e.message), "erro"); }
  }
  async function carregarVendas() {
    const [a, m] = S.mesVendas.split("-").map(Number);
    const ult = new Date(a, m, 0).getDate();
    S.vendas = (await api("GET", `/estoque/vendas?de=${S.mesVendas}-01&ate=${S.mesVendas}-${String(ult).padStart(2, "0")}`)).vendas;
  }
  /* ---------- lixeira de produtos (60 dias para voltar atrás) ---------- */
  let LX = { lista: null, dias: 60, erro: "" };
  async function abrirLixeira() {
    LX = { lista: null, dias: 60, erro: "" };
    abrirModal("Lixeira de produtos", lixeiraHtml());
    try { const r = await api("GET", "/estoque/produtos/lixeira"); LX.lista = r.produtos; LX.dias = r.dias || 60; } catch (e) { LX.erro = e.message; }
    corpoModal(lixeiraHtml());
  }
  function lixeiraHtml() {
    if (LX.erro) return `<p class="erro-form">${esc(LX.erro)}</p>`;
    if (!LX.lista) return `<p class="sub">Carregando…</p>`;
    const intro = `<p class="sub" style="margin-top:0">Produtos excluídos ficam aqui por ${LX.dias} dias. Restaurar traz de volta com o estoque, as variações e o histórico. Depois do prazo, são apagados de vez.</p>`;
    if (!LX.lista.length) return intro + `<div class="vazio" style="padding:24px 0;text-align:center">A lixeira está vazia.</div>`;
    return intro + `<ul class="lista-simples">${LX.lista.map((x) => `<li><span><b>${esc(x.nome)}</b><small class="sub" style="display:block">${esc(x.categoria || "Sem categoria")} · excluído em ${new Date(x.excluidoEm).toLocaleDateString("pt-BR")}${x.excluidoPor ? ` por ${esc(x.excluidoPor)}` : ""} · ${x.diasRestantes === 1 ? "falta 1 dia" : `faltam ${x.diasRestantes} dias`}</small></span>
      <span class="linha"><button class="btn mini claro" data-a="lx-restaurar" data-id="${x.id}">Restaurar</button>${ehChefia() ? `<button class="btn mini perigo" data-a="lx-apagar" data-id="${x.id}">Apagar de vez</button>` : ""}</span></li>`).join("")}</ul>`;
  }
  async function recarregarProdutos() { S.produtos = (await api("GET", "/estoque/produtos")).produtos; atualizarSeloEstoque(); }
  function atualizarSeloEstoque() {
    const n = S.produtos.filter((p) => p.ativo && (p.situacao === "acabou" || p.situacao === "baixo")).length;
    const b = $("#badge-estoque"); b.hidden = !n; b.textContent = n;
  }
  async function atualizarSelos() {
    atualizarSeloEstoque();
    if (!restaurante() || !tem("restaurante")) return;
    try {
      const r = await api("GET", "/estoque/resumo");
      const b = $("#badge-pedidos"); b.hidden = !r.pedidosNovos; b.textContent = r.pedidosNovos;
      const bc = $("#badge-pedidos-cel"); if (bc) { bc.hidden = !r.pedidosNovos; bc.textContent = r.pedidosNovos; }
      if (S.tab === "caixa" && !modalAberto()) { S.resumo = r; render(); }
      if (S.tab === "pedidos" && !modalAberto()) { const ant = (S.pedidos || []).filter((p) => p.status === "novo").length; if (r.pedidosNovos !== ant) carregarDaAba("pedidos"); }
    } catch (e) { /* sem internet: tenta no próximo minuto */ }
  }

  function render() {
    const fn = { caixa: telaCaixa, vender: telaVender, pedidos: telaPedidos, mesas: telaMesas, cozinha: telaCozinha, produtos: telaProdutos, compras: telaCompras, relatorios: telaRelatorios, clientes: telaClientes, cardapio: telaCardapio, config: telaConfig }[S.tab] || telaCaixa;
    if (["pedidos", "mesas", "cozinha", "cardapio"].includes(S.tab) && !tem("restaurante")) { $("#main").innerHTML = completoHtml("restaurante"); return; }
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
    if (c.escondido || !ehGestor()) return "";
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
  /* =====================================================================
     Caixa do dia (a tela inicial do PDV)
     ===================================================================== */
  const NOME_MOV_CX = { sangria: "Sangria", reforco: "Reforço de troco", despesa: "Despesa paga do caixa", fiado: "Fiado recebido" };
  const MEIOS_CAIXA = ["dinheiro", "pix", "debito", "credito", "transferencia", "boleto", "outro"];
  function blocoCaixaHtml() {
    const c = S.caixa;
    if (!c) {
      return `<div class="card caixa-card fechado">
        <div class="caixa-status"><span class="caixa-luz"></span><div><h2 class="secao" style="margin:0">Caixa fechado</h2><p class="sub">Abra o caixa no começo do dia, com o dinheiro de troco que está na gaveta.</p></div></div>
        <div class="caixa-abrir">
          <label class="campo"><span>Troco inicial (dinheiro na gaveta)</span><input id="cx-troco" inputmode="decimal" placeholder="0,00" value="${S.ultimoTroco ? br(S.ultimoTroco) : ""}" /></label>
          <button class="btn acento grande" data-a="cx-abrir">Abrir o caixa</button>
        </div>
      </div>`;
    }
    const cx = c.caixa;
    const horasAberto = (Date.now() - new Date(cx.abertoEm).getTime()) / 3600000;
    // de um dia para o outro: mostra a data e avisa (caixa esquecido aberto mistura as vendas de dias diferentes)
    const hora = horasAberto >= 12 ? new Date(cx.abertoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : new Date(cx.abertoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const avisoEsquecido = horasAberto >= 12 ? `<p class="aviso alerta" role="alert">⚠ Este caixa está aberto há ${horasAberto >= 48 ? `${Math.floor(horasAberto / 24)} dias` : `${Math.floor(horasAberto)} horas`}. Feche e abra um novo no começo de cada dia, para as vendas e o dinheiro da gaveta de cada dia não se misturarem.</p>` : "";
    // a função não cuida do caixa: o servidor não manda os valores (vendas, gaveta, movimentos)
    if (c.restrito) return `<div class="card caixa-card aberto">
      <div class="caixa-status"><span class="caixa-luz"></span><div><h2 class="secao" style="margin:0">Caixa #${cx.numero} aberto</h2><p class="sub">desde ${hora}${cx.abertoPor ? ` · por ${esc(cx.abertoPor)}` : ""}. Os valores do caixa ficam com quem cuida dele.</p></div></div>
      ${avisoEsquecido}
    </div>`;
    const outros = MEIOS_CAIXA.filter((m) => m !== "dinheiro" && c.esperado[m]).map((m) => `<li><span>${meioCurto(m)}</span><b class="num">${fmt(c.esperado[m])}</b></li>`).join("");
    const movs = c.movimentos.lista.slice().reverse().slice(0, 8);
    return `<div class="card caixa-card aberto">
      <div class="caixa-status"><span class="caixa-luz"></span><div><h2 class="secao" style="margin:0">Caixa #${cx.numero} aberto</h2><p class="sub">desde ${hora}${cx.abertoPor ? ` · por ${esc(cx.abertoPor)}` : ""} · troco inicial ${fmt(cx.trocoInicial)}</p></div></div>
      ${avisoEsquecido}
      <div class="caixa-numeros">
        <div><p class="kpi-rotulo">Vendas</p><p class="kpi-valor">${fmt(c.vendas.total)}</p><p class="kpi-nota">${c.vendas.quantidade === 1 ? "1 venda" : `${c.vendas.quantidade} vendas`}${c.vendas.fiado ? ` · ${fmt(c.vendas.fiado)} no fiado` : ""}</p></div>
        <div><p class="kpi-rotulo">Dinheiro na gaveta</p><p class="kpi-valor">${fmt(c.esperado.dinheiro)}</p><p class="kpi-nota">deveria ter agora</p></div>
        <div><p class="kpi-rotulo">Outras formas</p>${outros ? `<ul class="lista-mini">${outros}</ul>` : `<p class="kpi-nota">nada ainda</p>`}</div>
      </div>
      <div class="caixa-acoes">
        <button class="btn claro" data-a="cx-mov" data-v="sangria"><span aria-hidden="true">↑</span> Sangria</button>
        <button class="btn claro" data-a="cx-mov" data-v="reforco"><span aria-hidden="true">↓</span> Reforço</button>
        <button class="btn claro" data-a="cx-mov" data-v="despesa"><span aria-hidden="true">−</span> Despesa</button>
        <button class="btn claro" data-a="cx-fiado"><span aria-hidden="true">✓</span> Receber fiado</button>
        <button class="btn" data-a="cx-fechar">Fechar o caixa</button>
      </div>
      ${movs.length || c.ultimasVendas.length ? `<div class="grade grade-2" style="margin-top:16px">
        <div><p class="bloco-titulo">Últimas vendas</p>${c.ultimasVendas.length ? `<ul class="lista-simples">${c.ultimasVendas.map((v) => `<li class="${v.cancelada ? "riscado" : ""}"><span>#${v.numero} · ${new Date(v.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}${v.cliente ? ` · ${esc(v.cliente)}` : ""}<small class="sub" style="display:block">${(v.pagamentos || []).map((p) => meioCurto(p.meio)).join(" + ")}${v.operador ? ` · ${esc(v.operador)}` : ""}</small></span><b class="num">${fmt(v.total)}</b></li>`).join("")}</ul>` : `<p class="sub">Nenhuma venda ainda.</p>`}</div>
        <div><p class="bloco-titulo">Movimentos do caixa</p>${movs.length ? `<ul class="lista-simples">${movs.map((m) => `<li><span>${NOME_MOV_CX[m.tipo]}${m.descricao && m.tipo !== "sangria" && m.tipo !== "reforco" ? ` · ${esc(m.descricao)}` : ""}<small class="sub" style="display:block">${new Date(m.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · ${meioCurto(m.meio)}${m.operador ? ` · ${esc(m.operador)}` : ""}</small></span><b class="num ${m.tipo === "reforco" || m.tipo === "fiado" ? "positivo" : "negativo"}">${m.tipo === "reforco" || m.tipo === "fiado" ? "+" : "−"} ${fmt(m.valor)}</b></li>`).join("")}</ul>` : `<p class="sub">Sem sangria, reforço ou despesa.</p>`}</div>
      </div>` : ""}
    </div>`;
  }
  function telaCaixa() {
    const r = S.resumo;
    const mes = MESES[new Date().getMonth()];
    const quem = operadorAtual();
    let html = topo(`Olá, ${esc(quem ? String(quem.nome).trim().split(/\s+/)[0] : (S.negocio.nome || ""))}!`, r && r.restrito ? "O caixa e o que precisa da sua atenção hoje." : "O caixa do dia e o resumo do mês. Vendas, despesas e fiado já entram sozinhos no Controle financeiro.",
      `${pode("compras") ? `<button class="btn claro so-desk" data-a="nova-compra">Registrar compra</button>` : ""}${pode("vender") ? `<button class="btn acento so-desk" data-a="ir" data-tab="vender">Nova venda</button>` : ""}`);
    html += primeirosPassos();
    html += blocoCaixaHtml() + `<div class="espaco"></div>`;
    if (!r) return html + carregandoHtml;
    if (r.fiado && r.fiado.total) html += `<div class="faixa"><span><b>${fmt(r.fiado.total)}</b> em fiado a receber de ${r.fiado.clientes === 1 ? "1 cliente" : `${r.fiado.clientes} clientes`}.</span><button class="btn mini claro" data-a="ver-fiado">Ver quem deve</button></div>`;
    if (restaurante() && r.pedidosNovos) html += `<div class="faixa"><span><b>${r.pedidosNovos === 1 ? "1 pedido novo" : `${r.pedidosNovos} pedidos novos`}</b> ${r.pedidosNovos === 1 ? "chegou" : "chegaram"} pelo cardápio digital.</span><button class="btn mini acento" data-a="ir" data-tab="pedidos">Ver pedidos</button></div>`;
    if (r.restrito) {
      const baixo = S.produtos.filter((p) => p.ativo && (p.situacao === "baixo" || p.situacao === "acabou")).length;
      const m = r.minhasHoje || { vendas: 0, total: 0 };
      html += `<div class="grade grade-2">
        <div class="card"><p class="kpi-rotulo">Suas vendas hoje</p><p class="kpi-valor">${fmt(m.total)}</p><p class="kpi-nota">${m.vendas === 1 ? "1 venda" : `${m.vendas} vendas`} com o seu nome</p></div>
        <div class="card"><p class="kpi-rotulo">Estoque baixo</p><p class="kpi-valor">${baixo}</p><p class="kpi-nota">${baixo === 1 ? "produto para repor" : "produtos para repor"}</p></div>
      </div><div class="espaco"></div>
      <div class="grade grade-2">
        <div class="card"><h2 class="secao">Estoque pedindo atenção</h2>${r.alertas.length ? `<ul class="lista-simples">${r.alertas.map((a) => `<li><span>${esc(a.nome)}</span><span class="linha"><span class="num">${fmtN(a.estoque)} ${unid(a.unidade)}</span></span></li>`).join("")}</ul>` : `<p class="vazio" style="padding:18px 0">Tudo certo: nenhum produto abaixo do mínimo.</p>`}</div>
        <div class="card"><h2 class="secao">Mais vendidos em ${mes}</h2>${r.maisVendidos.length ? `<ul class="lista-simples">${r.maisVendidos.map((x, i) => `<li><span>${i + 1}. ${esc(x.nome)}</span><span class="sub">${fmtN(x.qtd)}×</span></li>`).join("")}</ul>` : `<p class="vazio" style="padding:18px 0">Ainda sem vendas este mês.</p>`}</div>
      </div>`;
      return html;
    }
    html += `<div class="grade grade-4">
      <div class="card"><p class="kpi-rotulo">Vendas hoje</p><p class="kpi-valor">${fmt(r.hoje.total)}</p><p class="kpi-nota">${r.hoje.vendas === 1 ? "1 venda" : `${r.hoje.vendas} vendas`}</p></div>
      <div class="card"><p class="kpi-rotulo">Vendido em ${mes}</p><p class="kpi-valor">${fmt(r.mes.total)}</p><p class="kpi-nota">${r.mes.vendas === 1 ? "1 venda" : `${r.mes.vendas} vendas`}${r.mes.vendas ? ` · ticket médio ${fmt(r.mes.total / r.mes.vendas)}` : ""}</p></div>
      ${!pode("custos") ? `<div class="card"><p class="kpi-rotulo">Ticket médio hoje</p><p class="kpi-valor">${r.hoje.vendas ? fmt(r.hoje.total / r.hoje.vendas) : "—"}</p><p class="kpi-nota">quanto cada cliente gastou, em média</p></div>` : `<div class="card"><p class="kpi-rotulo">Lucro bruto em ${mes}</p><p class="kpi-valor ${r.mes.lucroBruto >= 0 ? "positivo" : "negativo"}">${fmt(r.mes.lucroBruto)}</p><p class="kpi-nota">vendas − custo da mercadoria (${fmt(r.mes.cmv)})${r.mes.taxas ? ` − taxas (${fmt(r.mes.taxas)})` : ""}</p></div>`}
      ${!pode("custos") ? (() => { const n = S.produtos.filter((p) => p.ativo && (p.situacao === "baixo" || p.situacao === "acabou")).length; return `<div class="card"><p class="kpi-rotulo">Estoque baixo</p><p class="kpi-valor">${n}</p><p class="kpi-nota">${n === 1 ? "produto para repor" : "produtos para repor"}</p></div>`; })() : `<div class="card"><p class="kpi-rotulo">Compras e gastos em ${mes}</p><p class="kpi-valor">${fmt(r.mes.gastos)}</p><p class="kpi-nota">${S.negocio.controlaEstoque || S.produtos.some((p) => p.controlaEstoque) ? (pode("custos") ? `Estoque parado: ${fmt(r.valorEstoque)} (a preço de custo)` : "Notas de gasto e compras de mercadoria") : "Notas de gasto e compras de mercadoria"}</p></div>`}

    </div><div class="espaco"></div>
    <div class="grade grade-2">
      <div class="card"><h2 class="secao">Estoque pedindo atenção</h2>${r.alertas.length ? `<ul class="lista-simples">${r.alertas.map((a) => `<li><span>${esc(a.nome)}</span><span class="linha"><span class="num">${fmtN(a.estoque)} ${unid(a.unidade)}</span><span class="selo ${a.situacao}">${a.situacao === "acabou" ? "acabou" : "baixo"}</span><button class="btn mini claro" data-a="ajustar" data-id="${a.produtoId}">Ajustar</button></span></li>`).join("")}</ul>`
        : `<p class="vazio" style="padding:18px 0">${r.produtos ? "Tudo certo: nenhum produto abaixo do mínimo." : "Cadastre seus produtos para acompanhar o estoque."}</p>`}</div>
      <div class="card"><h2 class="secao">Mais vendidos em ${mes}</h2>${r.maisVendidos.length ? `<ul class="lista-simples">${r.maisVendidos.map((m, i) => `<li><span>${i + 1}. ${esc(m.nome)}</span><span class="linha"><span class="sub">${fmtN(m.qtd)}×</span><b class="num">${fmt(m.total)}</b></span></li>`).join("")}</ul>`
        : `<p class="vazio" style="padding:18px 0">Ainda sem vendas este mês.</p>`}</div>
    </div>`;
    return html;
  }

  // teclado numérico de valor (centavos): "1","2","3","4" -> 12,34
  function tecladoHtml(alvo) {
    const t = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "⌫"];
    return `<div class="teclado" data-teclado="${alvo}">${t.map((k) => `<button type="button" data-tecla="${k}" aria-label="${k === "⌫" ? "Apagar" : k}">${k}</button>`).join("")}</div>`;
  }
  const centavosDeTexto = (txt) => Number(String(txt || "").replace(/\D/g, "") || 0);
  const textoDeCentavos = (c) => (c / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  function aplicarTecla(valorTxt, tecla) {
    let c = String(centavosDeTexto(valorTxt));
    if (tecla === "⌫") c = c.slice(0, -1);
    else c = (c === "0" ? "" : c) + tecla;
    c = c.replace(/^0+/, "").slice(0, 9);
    return c ? textoDeCentavos(Number(c)) : "";
  }

  let MV = null; // sangria / reforço / despesa
  function abrirMovimento(tipo) {
    MV = { tipo, valor: "", descricao: "", categoria: "Outros", erro: "", salvando: false };
    abrirModal({ sangria: "Sangria (tirar dinheiro)", reforco: "Reforço (pôr troco)", despesa: "Despesa paga com o dinheiro do caixa" }[tipo], movimentoHtml(), { aoFechar: () => { MV = null; } });
  }
  function movimentoHtml() {
    const m = MV;
    const dica = { sangria: "Dinheiro que sai da gaveta para o cofre ou o banco. Não é despesa: só muda de lugar.", reforco: "Dinheiro que entra na gaveta para ter troco.", despesa: "Algo pago agora com o dinheiro da gaveta (gás, entregador, limpeza). Entra como despesa no Controle financeiro." }[m.tipo];
    return `<p class="sub" style="margin-bottom:12px">${dica}</p>
      <div class="valor-grande" data-campo-teclado="valor">${m.valor ? `R$ ${m.valor}` : `<span class="sub">R$ 0,00</span>`}</div>
      ${tecladoHtml("mv")}
      ${m.tipo === "despesa" ? `<div class="campos" style="margin-top:12px"><label class="campo"><span>O que foi</span><input id="mv-desc" value="${esc(m.descricao)}" maxlength="120" placeholder="Ex.: botijão de gás" /></label>
        <label class="campo"><span>Categoria</span><input id="mv-cat" value="${esc(m.categoria)}" list="g-cats2" /><datalist id="g-cats2">${CATEGORIAS_GASTO.map((c) => `<option value="${c}">`).join("")}</datalist></label></div>`
        : `<label class="campo" style="margin-top:12px"><span>Observação (opcional)</span><input id="mv-desc" value="${esc(m.descricao)}" maxlength="120" placeholder="${m.tipo === "sangria" ? "Ex.: depósito no banco" : "Ex.: troco do cofre"}" /></label>`}
      ${m.erro ? `<p class="erro-form">${esc(m.erro)}</p>` : ""}
      <div class="modal-rodape"><button class="btn claro" data-a="fechar-modal">Cancelar</button><button class="btn acento" data-a="mv-ok" ${m.salvando ? "disabled" : ""}>${m.salvando ? "Salvando…" : "Confirmar"}</button></div>`;
  }
  async function salvarMovimento() {
    const m = MV; m.erro = "";
    const d = $("#mv-desc"); if (d) m.descricao = d.value; const c = $("#mv-cat"); if (c) m.categoria = c.value;
    if (!centavosDeTexto(m.valor)) { m.erro = "Digite o valor."; corpoModal(movimentoHtml()); return; }
    m.salvando = true; corpoModal(movimentoHtml());
    try {
      const r = await api("POST", "/estoque/caixa/movimento", { tipo: m.tipo, valor: centavosDeTexto(m.valor) / 100, descricao: m.descricao, categoria: m.categoria });
      S.caixa = r.aberto; fecharModal(); toast(`Registrado: ${NOME_MOV_CX[m.tipo].toLowerCase()} de ${fmt(centavosDeTexto(m.valor) / 100)}.`, "ok"); render();
    } catch (e) { m.salvando = false; m.erro = e.message; corpoModal(movimentoHtml()); }
  }

  let FX = null; // fechamento
  function abrirFechamento() {
    const c = S.caixa; if (!c) return;
    FX = { contado: { dinheiro: "" }, obs: "", erro: "", salvando: false, campo: "dinheiro" };
    MEIOS_CAIXA.filter((m) => m !== "dinheiro" && c.esperado[m]).forEach((m) => { FX.contado[m] = textoDeCentavos(Math.round(c.esperado[m] * 100)); });
    abrirModal(`Fechar o caixa #${c.caixa.numero}`, fechamentoHtml(), { aoFechar: () => { FX = null; } });
  }
  function fechamentoHtml() {
    const c = S.caixa; const f = FX;
    const linhas = Object.keys(f.contado).map((m) => {
      const esp = c.esperado[m] || 0; const cont = centavosDeTexto(f.contado[m]) / 100;
      const dif = f.contado[m] === "" ? null : Math.round((cont - esp) * 100) / 100;
      return `<button type="button" class="fx-linha ${f.campo === m ? "ativa" : ""}" data-a="fx-campo" data-v="${m}">
        <span class="fx-meio">${meioCurto(m)}<small>deveria ter ${fmt(esp)}</small></span>
        <span class="fx-contado num">${f.contado[m] === "" ? `<span class="sub">contar</span>` : `R$ ${f.contado[m]}`}</span>
        <span class="fx-dif num ${dif === null ? "" : dif < 0 ? "negativo" : dif > 0 ? "positivo" : ""}">${dif === null ? "" : dif === 0 ? "ok" : `${dif > 0 ? "+" : "−"} ${fmt(Math.abs(dif))}`}</span>
      </button>`;
    }).join("");
    const difDin = f.contado.dinheiro === "" ? null : Math.round((centavosDeTexto(f.contado.dinheiro) / 100 - (c.esperado.dinheiro || 0)) * 100) / 100;
    return `<p class="sub" style="margin-bottom:12px">Conte o dinheiro da gaveta e confira os outros valores com a maquininha e o extrato do Pix. Toque numa linha para digitar.</p>
      <div class="fx-lista">${linhas}</div>
      ${tecladoHtml("fx")}
      ${difDin !== null && difDin !== 0 ? `<p class="aviso">${difDin < 0 ? `Falta <b>${fmt(-difDin)}</b> no dinheiro. Vira despesa "Quebra de caixa" no Controle financeiro.` : `Sobra <b>${fmt(difDin)}</b> no dinheiro. Vira receita "Sobra de caixa" no Controle financeiro.`}</p>` : ""}
      <label class="campo" style="margin-top:12px"><span>Observação (opcional)</span><input id="fx-obs" value="${esc(f.obs)}" maxlength="300" /></label>
      ${f.erro ? `<p class="erro-form">${esc(f.erro)}</p>` : ""}
      <div class="modal-rodape"><button class="btn claro" data-a="fechar-modal">Cancelar</button><button class="btn acento" data-a="fx-ok" ${f.salvando ? "disabled" : ""}>${f.salvando ? "Fechando…" : "Fechar o caixa"}</button></div>`;
  }
  async function confirmarFechamento() {
    const f = FX; f.erro = ""; const o = $("#fx-obs"); if (o) f.obs = o.value;
    if (f.contado.dinheiro === "") { f.erro = "Conte o dinheiro da gaveta e digite o valor (pode ser 0)."; f.campo = "dinheiro"; corpoModal(fechamentoHtml()); return; }
    f.salvando = true; corpoModal(fechamentoHtml());
    const contado = {}; Object.keys(f.contado).forEach((m) => { if (f.contado[m] !== "") contado[m] = centavosDeTexto(f.contado[m]) / 100; });
    try {
      const r = await api("POST", "/estoque/caixa/fechar", { contado, obs: f.obs });
      S.ultimoTroco = 0; S.caixa = null; FX = null;
      abrirModal(`Caixa #${r.caixa.numero} fechado`, relatorioCaixaHtml(r) + `<div class="modal-rodape"><button class="btn claro" data-a="imprimir-caixa">Imprimir</button><button class="btn acento" data-a="fechar-modal">Pronto</button></div>`, { largo: true });
      S.caixaDetalhe = r;
      carregarDaAba("caixa");
    } catch (e) { f.salvando = false; f.erro = e.message; corpoModal(fechamentoHtml()); }
  }
  // relatório de um caixa (fechado ou aberto)
  function relatorioCaixaHtml(r) {
    const cx = r.caixa;
    const meios = MEIOS_CAIXA.filter((m) => (r.esperado[m] || 0) || (cx.contado && cx.contado[m] !== undefined));
    const h = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
    return `<div class="relatorio-caixa">
      <p class="sub">Aberto em ${h(cx.abertoEm)}${cx.abertoPor ? ` por ${esc(cx.abertoPor)}` : ""} · ${cx.status === "fechado" ? `fechado em ${h(cx.fechadoEm)}${cx.fechadoPor ? ` por ${esc(cx.fechadoPor)}` : ""}` : "ainda aberto"}</p>
      <div class="grade grade-4" style="margin:14px 0">
        <div class="card"><p class="kpi-rotulo">Vendas</p><p class="kpi-valor">${fmt(r.vendas.total)}</p><p class="kpi-nota">${r.vendas.quantidade} vendas</p></div>
        <div class="card"><p class="kpi-rotulo">Fiado vendido</p><p class="kpi-valor">${fmt(r.vendas.fiado)}</p></div>
        <div class="card"><p class="kpi-rotulo">Sangrias</p><p class="kpi-valor">${fmt(r.movimentos.sangria)}</p><p class="kpi-nota">reforços ${fmt(r.movimentos.reforco)}</p></div>
        <div class="card"><p class="kpi-rotulo">Despesas do caixa</p><p class="kpi-valor">${fmt(r.movimentos.despesa)}</p></div>
      </div>
      <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Forma</th><th class="dir">Deveria ter</th><th class="dir">Contado</th><th class="dir">Diferença</th></tr></thead><tbody>
        ${meios.map((m) => { const esp = (cx.status === "fechado" ? cx.esperado[m] : r.esperado[m]) || 0; const cont = cx.contado ? cx.contado[m] : undefined; const dif = cont === undefined ? null : Math.round((cont - esp) * 100) / 100;
          return `<tr><td>${meioCurto(m)}</td><td class="dir num">${fmt(esp)}</td><td class="dir num">${cont === undefined ? "—" : fmt(cont)}</td><td class="dir num ${dif < 0 ? "negativo" : dif > 0 ? "positivo" : ""}">${dif === null ? "—" : dif === 0 ? "ok" : `${dif > 0 ? "+" : "−"} ${fmt(Math.abs(dif))}`}</td></tr>`; }).join("")}
      </tbody></table></div>
      <p class="sub" style="margin-top:10px">Dinheiro: troco inicial ${fmt(cx.trocoInicial)} + vendas e fiado em dinheiro + reforços − sangrias − despesas.${cx.obs ? ` Obs.: ${esc(cx.obs)}` : ""}</p>
    </div>`;
  }

  // Receber fiado: escolhe o cliente (quem deve) e o valor
  let RF = null;
  async function abrirReceberFiado(clienteId = null) {
    RF = { clienteId, conta: null, devedores: null, valor: "", meio: "dinheiro", erro: "", salvando: false };
    abrirModal("Receber fiado", `<p class="sub">Carregando…</p>`, { aoFechar: () => { RF = null; } });
    try {
      if (clienteId) RF.conta = await api("GET", `/estoque/clientes/${clienteId}/fiado`);
      else RF.devedores = (await api("GET", "/estoque/clientes?filtro=fiado")).clientes;
      if (RF) corpoModal(receberFiadoHtml());
    } catch (e) { corpoModal(`<p class="erro-form">${esc(e.message)}</p>`); }
  }
  function receberFiadoHtml() {
    const f = RF;
    if (!f.clienteId) {
      return f.devedores.length ? `<p class="sub" style="margin-bottom:10px">Quem está pagando?</p><div class="opcoes" style="margin:0">${f.devedores.map((c) => `<button type="button" class="opcao" data-a="rf-cliente" data-id="${c.id}"><span style="flex:1"><b>${esc(c.nome)}</b><small>${c.telefone ? telFmt(c.telefone) : ""}</small></span><b class="num negativo">${fmt(c.deve)}</b></button>`).join("")}</div>`
        : `<div class="vazio"><b>Ninguém devendo</b>Quando vender fiado, o cliente aparece aqui.</div>`;
    }
    const conta = f.conta;
    return `<div class="linha entre"><span class="sub">Deve no total</span><b class="num negativo" style="font-size:20px">${fmt(conta.total)}</b></div>
      <ul class="lista-simples" style="margin:8px 0 12px">${conta.vendas.map((v) => `<li><span>Venda #${v.numero} · ${dataBR(v.data)}</span><span class="num">${fmt(v.aberto)}${v.aberto < v.total ? ` <small class="sub">de ${fmt(v.total)}</small>` : ""}</span></li>`).join("")}</ul>
      <div class="chips" style="margin-bottom:10px">${MEIOS_CAIXA.slice(0, 5).map((m) => `<button class="chip ${f.meio === m ? "ativo" : ""}" data-a="rf-meio" data-v="${m}">${meioCurto(m)}</button>`).join("")}</div>
      <div class="linha entre"><div class="valor-grande" style="flex:1">${f.valor ? `R$ ${f.valor}` : `<span class="sub">R$ 0,00</span>`}</div><button class="btn mini claro" data-a="rf-tudo">Tudo (${fmt(conta.total)})</button></div>
      ${tecladoHtml("rf")}
      ${f.erro ? `<p class="erro-form">${esc(f.erro)}</p>` : ""}
      <div class="modal-rodape"><button class="btn claro" data-a="fechar-modal">Cancelar</button><button class="btn acento" data-a="rf-ok" ${f.salvando ? "disabled" : ""}>${f.salvando ? "Recebendo…" : "Receber"}</button></div>`;
  }
  async function confirmarFiado() {
    const f = RF; f.erro = "";
    if (!centavosDeTexto(f.valor)) { f.erro = "Digite o valor recebido."; corpoModal(receberFiadoHtml()); return; }
    f.salvando = true; corpoModal(receberFiadoHtml());
    try {
      const r = await api("POST", `/estoque/clientes/${f.clienteId}/fiado/receber`, { valor: centavosDeTexto(f.valor) / 100, meio: f.meio });
      fecharModal();
      toast(`Recebido ${fmt(r.recebido)}.${r.conta.total ? ` Ainda deve ${fmt(r.conta.total)}.` : " Conta quitada!"}`, "ok");
      if (S.tab === "caixa") carregarDaAba("caixa"); else if (S.tab === "clientes") carregarDaAba("clientes");
      if (FC) recarregarFicha();
    } catch (e) { f.salvando = false; f.erro = e.message; corpoModal(receberFiadoHtml()); }
  }

  /* ---------- operador (PIN) ---------- */
  let TR = null;
  function mostrarTrava(msg = "") {
    if (!S.operadores.filter((o) => o.ativo).length) return;
    TR = { id: null, pin: "", erro: msg && !/^Entre com/.test(msg) ? msg : "", entrando: false };
    desenharTrava();
  }
  function desenharTrava() {
    const t = TR; let el = $("#trava");
    if (!el) { el = document.createElement("div"); el.id = "trava"; document.body.appendChild(el); }
    const ops = S.operadores.filter((o) => o.ativo);
    el.innerHTML = `<div class="trava"><div class="trava-caixa">
      <p class="bv-marca">${esc(S.negocio.nome || "PDV")}</p>
      ${!t.id ? `<h2 class="bv-titulo" style="font-size:22px">Quem vai usar o caixa?</h2>
        <div class="trava-ops">${ops.map((o) => `<button type="button" class="trava-op" data-a="tr-op" data-id="${o.id}"><span class="avatar">${inicial(o.nome)}</span><b>${esc(o.nome)}</b><small>${NOME_PAPEL[o.papel] || o.papel}</small></button>`).join("")}</div>
        ${pinObrigatorio() ? "" : `<button class="link" data-a="tr-fechar" style="margin-top:14px">Continuar sem operador</button>`}`
      : `<button class="link" data-a="tr-voltar">← trocar pessoa</button>
        <h2 class="bv-titulo" style="font-size:22px;margin-top:10px">${esc(ops.find((o) => o.id === t.id).nome)}, digite seu PIN</h2>
        <div class="pin-pontos">${[0, 1, 2, 3, 4, 5].slice(0, Math.max(4, t.pin.length)).map((i) => `<i class="${i < t.pin.length ? "cheio" : ""}"></i>`).join("")}</div>
        ${t.erro ? `<p class="erro-form" style="text-align:center">${esc(t.erro)}</p>` : ""}
        ${tecladoHtml("pin").replace('data-tecla="00" aria-label="00">00', 'data-tecla="⌫" aria-label="Apagar">⌫').replace(/data-tecla="⌫" aria-label="Apagar">⌫<\/button><\/div>$/, `data-tecla="ok" aria-label="Entrar" class="tecla-ok" ${t.pin.length < 4 ? "disabled" : ""}>Entrar</button></div>`)}`}
      ${!t.id && t.erro ? `<p class="erro-form">${esc(t.erro)}</p>` : ""}
    </div></div>`;
  }
  async function entrarComPin() {
    const t = TR; if (t.entrando || t.pin.length < 4) return;
    t.entrando = true;
    const semRede = S.offline || !navigator.onLine;
    try {
      if (semRede) { await entrarSemInternet(t.id, t.pin); return; }
      let r;
      try { r = await api("POST", "/estoque/operadores/entrar", { id: t.id, pin: t.pin }); }
      catch (e) { if (ehErroDeRede(e)) { await entrarSemInternet(t.id, t.pin); return; } throw e; }
      guardarOperador(r);
      guardarPinCofre(t.id, t.pin, r).catch(() => {}); // para poder entrar sem internet depois
      depoisDeEntrar(r.operador, "");
    } catch (e) { t.entrando = false; t.pin = ""; t.erro = e.message; desenharTrava(); }
  }
  async function depoisDeEntrar(op, aviso) {
    TR = null; const el = $("#trava"); if (el) el.remove();
    if (!S.offline) {
      await carregarAcesso();
      try { const d = await api("GET", "/estoque"); S.produtos = d.produtos; } catch (e) { /* fica o que já tinha */ }
    }
    atualizarChipOperador(); desenharNavCelular(); toast(`Olá, ${esc(op.nome)}!${aviso}`, "ok");
    if (op.papel === "garcom" && restaurante() && !["mesas", "cozinha", "pedidos", "clientes"].includes(S.tab)) irPara("mesas"); else irPara(S.tab);
  }
  function semAcessoAoPdv() {
    const o = ACESSO && ACESSO.operador;
    $("#main").innerHTML = `<div class="card vazio" style="margin:24px"><b>Sem acesso ao PDV</b>A sua função${o ? ` (${esc(o.funcao || o.papel)})` : ""} não inclui o PDV. Fale com o gestor se precisar.<br/><br/><a class="btn claro" href="/">Voltar ao início</a>${ehLoja() ? ` <button class="btn claro" data-a="trocar-operador">Trocar pessoa</button>` : ""}</div>`;
  }

  /* PIN sem internet: o PIN NUNCA fica salvo. Ao entrar com internet, o servidor devolve uma credencial
     que só serve para registrar vendas feitas sem internet (vale 7 dias e é conferida de novo no servidor).
     Ela é guardada cifrada (AES-GCM) com uma chave tirada do próprio PIN (PBKDF2, 210 mil rodadas):
     sem o PIN certo não dá para abrir. Com internet de volta, a sessão local acaba e o PIN volta a ser
     conferido pelo servidor. 5 erros seguidos travam o PIN neste aparelho por 5 minutos. */
  const CHAVE_COFRE = () => `pdv-pins-${uidLocal()}`;
  const RODADAS = 210000;
  function lerCofre() { try { return JSON.parse(localStorage.getItem(CHAVE_COFRE()) || "{}") || {}; } catch (e) { return {}; } }
  function gravarCofre(c) { try { localStorage.setItem(CHAVE_COFRE(), JSON.stringify(c)); } catch (e) { /* sem espaço */ } }
  const b64 = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));
  const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function chaveDoPin(pin, sal, opId) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(`${opId}:${pin}`), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: sal, iterations: RODADAS, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  const fimDoJwt = (t) => { try { return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp * 1000; } catch (e) { return 0; } };
  async function guardarPinCofre(opId, pin, r) {
    if (!r.offline || !(window.crypto && crypto.subtle)) return;
    const sal = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12));
    const chave = await chaveDoPin(pin, sal, opId);
    const dados = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, new TextEncoder().encode(JSON.stringify({ c: r.offline, op: r.operador })));
    const cofre = lerCofre();
    cofre[opId] = { sal: b64(sal), iv: b64(iv), dados: b64(dados), ate: fimDoJwt(r.offline) || Date.now() + 7 * 864e5, falhas: 0, travadoAte: 0 };
    gravarCofre(cofre);
  }
  async function entrarSemInternet(opId, pin) {
    const cofre = lerCofre(); const e = cofre[opId];
    if (!e || e.ate <= Date.now()) throw new Error("Sem internet, só entra quem já usou o PIN neste aparelho com internet nos últimos 7 dias.");
    if (!(window.crypto && crypto.subtle)) throw new Error("Este navegador não permite entrar com o PIN sem internet.");
    if (e.travadoAte > Date.now()) throw new Error(`Muitas tentativas. Tente de novo em ${Math.ceil((e.travadoAte - Date.now()) / 60000)} min.`);
    let aberto = null;
    try {
      const chave = await chaveDoPin(pin, deB64(e.sal), opId);
      aberto = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(e.iv) }, chave, deB64(e.dados))));
    } catch (x) { aberto = null; }
    const c2 = lerCofre(); const e2 = c2[opId] || e;
    if (!aberto) {
      e2.falhas = (e2.falhas || 0) + 1;
      if (e2.falhas >= 5) { e2.falhas = 0; e2.travadoAte = Date.now() + 5 * 60000; }
      c2[opId] = e2; gravarCofre(c2);
      throw new Error(e2.travadoAte > Date.now() ? "PIN errado. Muitas tentativas: espere 5 minutos." : "PIN errado.");
    }
    e2.falhas = 0; e2.travadoAte = 0; c2[opId] = e2; gravarCofre(c2);
    const op = aberto.op;
    try { localStorage.setItem(CHAVE_OP, JSON.stringify({ token: null, local: true, offline: aberto.c, operador: op, ate: Math.min(e.ate, Date.now() + 13.5 * 3600 * 1000) })); } catch (x) { /* sem armazenamento */ }
    depoisDeEntrar(op, " (sem internet)");
  }
  // internet de volta: a sessão feita sem internet acaba e o PIN passa a ser conferido pelo servidor
  function encerrarSessaoLocal() {
    const o = lerOperador(); if (!o || !o.local) return;
    esquecerOperador(); atualizarChipOperador(); desenharNavCelular();
    if (S.pdv && pinObrigatorio()) mostrarTrava("A internet voltou: entre de novo com o seu PIN.");
  }
  // tira do cofre quem foi desativado ou removido
  function limparCofre() {
    const ativos = new Set((S.operadores || []).filter((o) => o.ativo).map((o) => o.id));
    const c = lerCofre(); let mudou = false;
    for (const id of Object.keys(c)) if (!ativos.has(id) || c[id].ate <= Date.now()) { delete c[id]; mudou = true; }
    if (mudou) gravarCofre(c);
  }
  function atualizarChipOperador() {
    const el = $("#chip-operador"); if (!el) return;
    const o = lerOperador();
    el.hidden = !S.operadores.filter((x) => x.ativo).length;
    el.innerHTML = o ? `<span class="avatar">${inicial(o.operador.nome)}</span><span>${esc(o.operador.nome)}</span><small>trocar</small>` : `<span class="avatar">?</span><span>Entrar com PIN</span>`;
    if (ehFuncionario()) el.hidden = true; // entrou pelo próprio celular: não troca de pessoa aqui
    // cada função vê só as abas que usa (garçom: mesas, cozinha e pedidos; estoquista: produtos e compras…)
    document.querySelectorAll(".nav-item[data-tab]").forEach((b) => { b.hidden = !podeAba(b.dataset.tab) || (b.hasAttribute("data-so-restaurante") && !restaurante()); });
    const painel = $("#nav-painel"); if (painel) painel.hidden = !ehGestor() || !tem("equipe");
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
      <div class="linha entre carrinho-topo" style="margin-bottom:6px"><h2 class="secao" style="margin:0">Carrinho</h2>${S.carrinho.length ? `<button class="link" data-a="limpar-cart">Limpar</button>` : ""}</div>
      ${S.carrinho.length ? `<div class="cart-itens">${itens}</div>` : `<p class="sub" style="padding:14px 0">Toque nos produtos para adicionar.</p>`}
      <button class="btn claro mini" data-a="avulso" style="margin-top:10px">+ Item avulso</button>
      <div class="cart-sec">
        ${clienteCartHtml(t)}
        <span class="rot">Desconto</span>
        <div class="cart-desc"><input class="inp" data-cart="cartDescValor" value="${esc(S.cartDescValor)}" inputmode="decimal" placeholder="0,00" /><select class="inp" data-cart="cartDescTipo"><option ${S.cartDescTipo === "R$" ? "selected" : ""}>R$</option><option ${S.cartDescTipo === "%" ? "selected" : ""}>%</option></select></div>
        ${S.cartOutraData ? `<label class="campo"><span>Data da venda</span><input type="date" data-cart="cartData" value="${esc(S.cartData || hoje())}" max="${hoje()}" /></label>` : `<button class="link" data-a="outra-data" style="align-self:flex-start;font-size:12.5px">Venda de outro dia?</button>`}
      </div>
      <div style="margin-top:12px">
        <div class="cart-linha"><span>Subtotal</span><span class="num" id="cart-sub">${fmt(t.sub)}</span></div>
        <div class="cart-linha" id="cart-desc-linha" ${t.desc ? "" : "hidden"}><span>Desconto</span><span class="num negativo" id="cart-desc">− ${fmt(t.desc)}</span></div>
        <div class="cart-linha" id="cart-benef-linha" ${t.benef ? "" : "hidden"}><span id="cart-benef-nome">${t.benefNome}</span><span class="num negativo" id="cart-benef">− ${fmt(t.benef)}</span></div>
        <div class="cart-linha total"><span>Total</span><span class="num" id="cart-total">${fmt(t.total)}</span></div>
      </div>
      ${caixaBloqueia() ? `<button class="btn acento grande" data-a="ir" data-tab="caixa" style="margin-top:12px">Abrir o caixa para vender</button>`
        : `<button class="btn acento grande" data-a="finalizar" style="margin-top:12px" ${S.carrinho.length && !S.vendendo ? "" : "disabled"}>Cobrar ${S.carrinho.length ? fmt(t.total) : ""}</button>`}
    </div>`;
  }
  function telaVender() {
    const cats = [...new Set(ativos().map((p) => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const t = totaisCarrinho();
    return topo("Vender", "Venda no balcão: dá baixa no estoque e entra como receita no Controle financeiro.") +
      (caixaBloqueia() ? `<div class="faixa"><span><b>O caixa está fechado.</b> Abra o caixa para começar a vender.</span><button class="btn mini acento" data-a="ir" data-tab="caixa">Abrir o caixa</button></div>` : "") + `
      <div class="pdv">
        <div>
          <div class="pdv-busca">
            <input class="inp" id="busca-pdv" data-busca-pdv value="${esc(S.busca)}" placeholder="Buscar por nome, categoria ou código de barras" autocomplete="off" />
            ${cats.length > 1 ? `<div class="chips" style="margin-top:10px"><button class="chip ${!S.catPdv ? "ativo" : ""}" data-a="cat-pdv" data-v="">Todos</button>${cats.map((c) => `<button class="chip ${S.catPdv === c ? "ativo" : ""}" data-a="cat-pdv" data-v="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : ""}
          </div>
          <div id="grade-pdv">${gradePdvHtml()}</div>
        </div>
        <div class="carrinho" id="carrinho">${ehCelular() ? "" : carrinhoHtml()}</div>
      </div>
      <div class="cart-resumo-mobile" ${S.carrinho.length ? "" : "hidden"}><span><b>${fmtN(t.itens)} ${t.itens === 1 ? "item" : "itens"}</b> · <span class="num" id="cart-total-mob">${fmt(t.total)}</span></span><button class="btn mini" data-a="ver-carrinho">Ver carrinho</button></div>`;
  }
  const ehCelular = () => window.matchMedia("(max-width: 760px)").matches;
  function redesenharCarrinho() {
    const el = $("#carrinho"); if (el) el.innerHTML = ehCelular() ? "" : carrinhoHtml();
    const folha = $("#carrinho-folha"); if (folha) folha.innerHTML = carrinhoHtml();
    const mob = $(".cart-resumo-mobile");
    if (mob) { const t = totaisCarrinho(); mob.hidden = !S.carrinho.length; mob.innerHTML = `<span><b>${fmtN(t.itens)} ${t.itens === 1 ? "item" : "itens"}</b> · <span class="num" id="cart-total-mob">${fmt(t.total)}</span></span><button class="btn mini" data-a="ver-carrinho">Ver carrinho</button>`; }
  }
  const caixaBloqueia = () => !!(S.pdv && S.pdv.exigirCaixa && !S.caixa);
  function atualizarTotais() {
    const t = totaisCarrinho();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("cart-sub", fmt(t.sub)); set("cart-desc", "− " + fmt(t.desc)); set("cart-total", fmt(t.total)); set("cart-total-mob", fmt(t.total));
    const dl = $("#cart-desc-linha"); if (dl) dl.hidden = !t.desc;
    set("cart-benef", "− " + fmt(t.benef)); set("cart-benef-nome", t.benefNome); const bl = $("#cart-benef-linha"); if (bl) bl.hidden = !t.benef;
    S.carrinho.forEach((i, idx) => { const el = document.querySelector(`[data-total-item="${idx}"]`); if (el) el.textContent = fmt(numOu(i.qtd) * numOu(i.unit)); });
    document.querySelectorAll('[data-a="finalizar"]').forEach((fin) => { fin.disabled = !S.carrinho.length || S.vendendo; fin.textContent = `Cobrar ${S.carrinho.length ? fmt(t.total) : ""}`; });
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
  /* ---------- cobrança: formas de pagamento, troco e divisão ---------- */
  let CB = null;
  function finalizarVenda() {
    if (!S.carrinho.length || S.vendendo) return;
    if (caixaBloqueia()) { irPara("caixa"); return; }
    const ruins = S.carrinho.filter((i) => !(numOu(i.qtd, -1) > 0) || Number.isNaN(num(i.unit)) || num(i.unit) < 0);
    if (ruins.length) { toast(`Confira a quantidade e o preço de “${esc(ruins[0].nome)}”.`, "erro"); return; }
    const t = totaisCarrinho();
    CB = { total: t.total, pagos: [], meio: "dinheiro", valor: "", erro: "", salvando: false };
    abrirModal("Cobrar", cobrancaHtml(), { aoFechar: () => { CB = null; } });
  }
  const somaPagos = () => CB.pagos.reduce((a, p) => a + p.c, 0);
  function cobrancaHtml() {
    const c = CB; const totalC = Math.round(c.total * 100);
    const faltaC = Math.max(0, totalC - somaPagos());
    const digitadoC = centavosDeTexto(c.valor);
    const trocoC = c.meio === "dinheiro" && digitadoC > faltaC ? digitadoC - faltaC : 0;
    const cli = c.comanda ? c.cli : S.cartCli;
    const meios = S.meios.filter((m) => m.id !== "fiado" || cli);
    const porPessoa = c.comanda && c.comanda.pessoas > 1 ? `<button class="chip" data-a="cb-pessoa">÷ ${c.comanda.pessoas} pessoas = ${fmt(Math.ceil(totalC / c.comanda.pessoas) / 100)}</button>` : "";
    const notas = [500, 1000, 2000, 5000, 10000, 20000].filter((n) => n >= faltaC).slice(0, 3);
    return `<div class="cob-topo"><div><span class="sub">Total</span><b class="num">${fmt(c.total)}</b></div>
        ${c.pagos.length ? `<div><span class="sub">Falta</span><b class="num ${faltaC ? "negativo" : "positivo"}">${fmt(faltaC / 100)}</b></div>` : ""}
        ${trocoC ? `<div class="cob-troco"><span class="sub">Troco</span><b class="num">${fmt(trocoC / 100)}</b></div>` : ""}</div>
      ${c.pagos.length ? `<ul class="lista-simples cob-pagos">${c.pagos.map((p, i) => `<li><span>${meioCurto(p.meio)}</span><span class="linha"><b class="num">${fmt(p.c / 100)}</b><button class="cart-x" data-a="cb-tirar" data-i="${i}" aria-label="Tirar">×</button></span></li>`).join("")}</ul>` : ""}
      ${faltaC ? `<div class="chips cob-meios">${meios.map((m) => `<button type="button" class="chip ${c.meio === m.id ? "ativo" : ""}" data-a="cb-meio" data-v="${m.id}">${esc(meioCurto(m.id))}</button>`).join("")}</div>
        ${c.meio === "fiado" ? `<p class="aviso">Fica na conta de <b>${esc(cli.nome)}</b>. Receba depois em Caixa → Receber fiado.</p>` : ""}
        <div class="valor-grande">${c.valor ? `R$ ${c.valor}` : `<span class="sub">${c.meio === "dinheiro" ? "Quanto o cliente deu?" : "Valor"} · ${fmt(faltaC / 100)}</span>`}</div>
        ${c.meio === "dinheiro" ? `<div class="chips cob-rapidos"><button class="chip" data-a="cb-rapido" data-v="${faltaC}">Valor exato</button>${notas.map((n) => `<button class="chip" data-a="cb-rapido" data-v="${n}">${fmt(n / 100)}</button>`).join("")}${porPessoa}</div>` : porPessoa ? `<div class="chips cob-rapidos">${porPessoa}</div>` : ""}
        ${tecladoHtml("cb")}
        <button class="btn claro" data-a="cb-dividir" style="width:100%;margin-top:10px;white-space:normal;line-height:1.3" ${digitadoC && digitadoC < faltaC ? "" : "disabled"}>${digitadoC && digitadoC < faltaC ? `Dividir: ${fmt(digitadoC / 100)} em ${meioCurto(c.meio).toLowerCase()} + o resto de outro jeito` : "Dividir o pagamento (digite a 1ª parte)"}</button>` : ""}
      ${c.erro ? `<p class="erro-form">${esc(c.erro)}</p>` : ""}
      <button class="btn acento grande" data-a="cb-ok" style="margin-top:14px" ${c.salvando ? "disabled" : ""}>${c.salvando ? "Registrando…" : trocoC ? `Concluir · troco ${fmt(trocoC / 100)}` : "Concluir venda"}</button>`;
  }
  async function concluirCobranca() {
    const c = CB; c.erro = "";
    const totalC = Math.round(c.total * 100);
    const pagamentos = c.pagos.map((p) => ({ meio: p.meio, valor: p.c / 100 }));
    const faltaC = Math.max(0, totalC - somaPagos());
    if (faltaC > 0) {
      const dig = centavosDeTexto(c.valor);
      const usar = dig || faltaC;
      if (usar < faltaC) { c.erro = `Falta ${fmt((faltaC - usar) / 100)}. Use "Dividir" para pagar o resto de outro jeito.`; corpoModal(cobrancaHtml()); return; }
      if (usar > faltaC && c.meio !== "dinheiro") { c.erro = "Só o dinheiro pode passar do total (para dar troco)."; corpoModal(cobrancaHtml()); return; }
      pagamentos.push({ meio: c.meio, valor: usar / 100 });
    }
    if (!pagamentos.length) pagamentos.push({ meio: "dinheiro", valor: 0.01 > c.total ? 0.01 : c.total });
    if (c.comanda) { // fechar a conta de uma mesa/comanda
      c.salvando = true; corpoModal(cobrancaHtml());
      try {
        const r = await api("POST", `/estoque/comandas/${c.comanda.id}/fechar`, { pagamentos: c.total > 0 ? pagamentos : undefined, meio: c.total > 0 ? undefined : "dinheiro", semTaxa: c.comanda.semTaxa, desconto: c.comanda.desconto || 0 });
        const tel = c.cli ? c.cli.telefone : ""; CB = null;
        vendaConcluida(r, tel, "Pronto");
        carregarMesas().catch(() => {}); recarregarProdutos().catch(() => {});
        api("GET", "/estoque/caixa").then((x) => { S.caixa = x.aberto; }).catch(() => {});
      } catch (e) { if (CB) { c.salvando = false; c.erro = e.message; corpoModal(cobrancaHtml()); } }
      return;
    }
    const t = totaisCarrinho();
    c.salvando = true; S.vendendo = true; corpoModal(cobrancaHtml());
    try {
      const corpoVenda = {
        pagamentos: c.total > 0 ? pagamentos : undefined, meio: c.total > 0 ? undefined : "dinheiro", desconto: t.desc, data: S.cartOutraData ? (S.cartData || hoje()) : undefined,
        ...(S.cartCli ? { clienteId: S.cartCli.id, usarCashback: !!(t.benef && programa().modelo === "cashback"), usarPremio: !!(t.benef && programa().modelo === "selos") } : { cliente: S.cartCliente }),
        itens: S.carrinho.map((i) => (i.avulso ? { nome: i.nome, qtd: numOu(i.qtd), unit: numOu(i.unit) } : { produtoId: i.produtoId, variacaoId: i.variacaoId, qtd: numOu(i.qtd), unit: numOu(i.unit) })),
      };
      // código da venda criado aqui: se a internet cair no meio, reenviar não duplica
      corpoVenda.refCliente = c.ref || (c.ref = novaRef());
      let r;
      try { r = await api("POST", "/estoque/vendas", corpoVenda); }
      catch (e2) { if (!ehErroDeRede(e2)) throw e2; S.offline = true; r = guardarVendaOffline(corpoVenda, c, t); }
      const cliTel = S.cartCli ? S.cartCli.telefone : "";
      S.carrinho = []; S.cartDescValor = ""; S.cartCliente = ""; S.cartOutraData = false; S.cartData = ""; S.cartCli = null; S.cartUsarBenef = false;
      if (S.negocio.checklist) S.negocio.checklist.venda = true;
      S.vendendo = false; CB = null;
      vendaConcluida(r, cliTel);
      if (r.venda.offline) { const g = $("#grade-pdv"); if (g) g.innerHTML = gradePdvHtml(); guardarCache(); }
      else recarregarProdutos().then(() => { if (S.tab === "vender") { const g = $("#grade-pdv"); if (g) g.innerHTML = gradePdvHtml(); } guardarCache(); }).catch(() => {});
      api("GET", "/estoque/caixa").then((x) => { S.caixa = x.aberto; }).catch(() => {});
    } catch (e) { S.vendendo = false; c.salvando = false; c.erro = e.message; corpoModal(cobrancaHtml()); }
    if (S.tab === "vender") redesenharCarrinho();
  }
  // depois de vender: troco em destaque, recibo e nova venda
  function vendaConcluida(r, cliTel, rotuloFim = "Nova venda") {
    const v = r.venda;
    S.ultimaVenda = { venda: v, tel: cliTel };
    const ganhou = v.cashbackGanho ? `🎁 ${esc(v.cliente)} ganhou ${fmt(v.cashbackGanho)} de cashback.` : v.selosGanhos ? `🎁 +1 compra no cartão fidelidade de ${esc(v.cliente)}.` : "";
    const depois = rotuloFim === "Pronto" ? { aoFechar: () => { if (S.tab === "mesas") render(); } } : {};
    abrirModal(v.offline && !v.id ? "Venda guardada neste aparelho" : `Venda #${v.numero} registrada`, `<div class="venda-ok">
        <div class="ok-icone" aria-hidden="true">✓</div>
        <p class="kpi-valor">${fmt(v.total)}</p>
        <p class="sub">${(v.pagamentos || []).map((p) => `${meioCurto(p.meio)} ${fmt(p.valor)}`).join(" + ")}</p>
        ${v.troco ? `<div class="troco-grande"><span>Troco</span><b class="num">${fmt(v.troco)}</b></div>` : ""}
        ${ganhou ? `<p class="aviso info">${ganhou}</p>` : ""}
        ${r.alertas.length ? `<p class="aviso">⚠ ${r.alertas.map(esc).join("<br/>⚠ ")}</p>` : ""}
        ${v.offline ? `<p class="aviso">Sem internet: a venda ficou guardada neste aparelho e vai para o estoque e o financeiro quando a conexão voltar.</p>` : ""}
      </div>
      ${notaFiscalHtml(v)}
      <div class="venda-ok-acoes">
        <button class="btn claro" data-a="recibo-imprimir">Imprimir recibo</button>
        <button class="btn claro" data-a="recibo-whats">Recibo no WhatsApp</button>
        <button class="btn acento grande" data-a="fechar-modal">${rotuloFim}</button>
      </div>`, depois);
    if (fiscalLigado() && S.fiscal.emitir === "sempre" && v.id && !(v.nfce && v.nfce.status)) setTimeout(() => acaoNota("emitir", v.id, document.querySelector('[data-a="nfce-emitir"]')), 50);
  }
  // recibo (não fiscal) para impressora térmica de 58/80 mm ou WhatsApp
  function reciboTexto(v) {
    const linhas = [`*${S.negocio.nome || "Recibo"}*`, `Venda #${v.numero}${v.comandaId && v.cliente ? ` · ${v.cliente}` : ""} · ${dataBR(v.data)} ${new Date(v.criadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`, ""];
    v.itens.forEach((i) => linhas.push(`${fmtN(i.qtd)}x ${i.nome} — ${fmt(i.qtd * i.unit)}`));
    linhas.push("", `Subtotal: ${fmt(v.subtotal)}`);
    if (v.desconto) linhas.push(`Desconto: − ${fmt(v.desconto)}`);
    if (v.cashbackUsado) linhas.push(`Cashback: − ${fmt(v.cashbackUsado)}`);
    if (v.premioValor) linhas.push(`Prêmio fidelidade: − ${fmt(v.premioValor)}`);
    if (v.acrescimo) linhas.push(`${v.comandaId ? "Taxa de serviço" : "Entrega"}: ${fmt(v.acrescimo)}`);
    linhas.push(`*Total: ${fmt(v.total)}*`);
    (v.pagamentos || []).forEach((p) => linhas.push(`${meioCurto(p.meio)}: ${fmt(p.valor)}`));
    if (v.troco) linhas.push(`Recebido em dinheiro: ${fmt(v.recebido)} · troco ${fmt(v.troco)}`);
    if (v.cashbackGanho) linhas.push(`Você ganhou ${fmt(v.cashbackGanho)} de cashback!`);
    linhas.push("", S.pdv.reciboRodape || "Obrigado pela preferência!", "Documento sem valor fiscal.");
    return linhas.join("\n");
  }
  function imprimirRecibo(v) { imprimir80(`Recibo #${v.numero}`, reciboTexto(v)); }
  // impressora térmica de 58/80 mm (ou qualquer impressora): *negrito* vira <b>
  function imprimir80(titulo, texto) {
    const w = window.open("", "_blank", "width=380,height=640");
    if (!w) { toast("Libere as janelas (pop-up) do navegador para imprimir.", "erro"); return; }
    const corpo = esc(texto).replace(/\*([^*]+)\*/g, "<b>$1</b>").replace(/\n/g, "<br/>");
    w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${esc(titulo)}</title>
      <style>@page{size:80mm auto;margin:4mm}body{font-family:ui-monospace,Menlo,monospace;font-size:12px;line-height:1.45;width:72mm;margin:0 auto;color:#000}b{font-size:13px}</style>
      </head><body>${corpo}<script>window.onload=function(){window.print();setTimeout(function(){window.close()},500)}<\/script></body></html>`);
    w.document.close();
  }
  function reciboWhats(v, tel) {
    const t = String(tel || "").replace(/\D/g, "");
    const url = `https://wa.me/${t.length >= 10 ? `55${t}` : ""}?text=${encodeURIComponent(reciboTexto(v))}`;
    window.open(url, "_blank", "noopener");
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
      !pode("produtos") ? "" : `<button class="btn claro" data-a="lixeira-prod" title="Produtos excluídos nos últimos 60 dias">Lixeira</button>${pode("custos") ? `<button class="btn claro so-desk" data-a="importar-prod" title="Cadastrar ou atualizar vários produtos de uma vez por planilha">Importar planilha</button><button class="btn claro so-desk" data-a="exportar-prod">Exportar (.xlsx)</button>` : ""}<button class="btn acento" data-a="novo-produto">Novo produto</button>`);
    html += `<div class="linha" style="margin-bottom:14px"><input class="inp" style="max-width:340px" data-busca-prod value="${esc(S.buscaProd)}" placeholder="Buscar produto" />
      <div class="chips"><button class="chip ${!S.filtroProd ? "ativo" : ""}" data-a="filtro-prod" data-v="">Ativos</button><button class="chip ${S.filtroProd === "atencao" ? "ativo" : ""}" data-a="filtro-prod" data-v="atencao">Estoque baixo${atencao ? ` (${atencao})` : ""}</button><button class="chip ${S.filtroProd === "inativos" ? "ativo" : ""}" data-a="filtro-prod" data-v="inativos">Inativos</button></div></div>`;
    if (!S.produtos.length) return html + `<div class="card vazio"><b>Nenhum produto ainda</b>Cadastre o que você vende: nome, preço, custo e, se quiser, variações como tamanho ou cor.<br/><br/><button class="btn acento" data-a="novo-produto">Cadastrar o primeiro produto</button></div>`;
    if (!lista.length) return html + `<div class="card vazio">Nenhum produto neste filtro.</div>`;
    html += `<div class="card" style="padding:6px 8px"><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Produto</th><th class="dir">Preço</th>${pode("custos") ? `<th class="dir">Custo</th><th class="dir">Margem</th>` : ""}<th class="dir">Estoque</th><th></th></tr></thead><tbody>
      ${lista.map((p) => {
        const m = margem(p);
        const est = !p.controlaEstoque ? `<span class="selo livre">sem controle</span>` : `<span class="num">${fmtN(p.estoque)} ${unid(p.unidade)}</span> <span class="selo ${p.situacao}">${p.situacao === "ok" ? "ok" : p.situacao === "baixo" ? "baixo" : "acabou"}</span>`;
        return `<tr ${pode("produtos") ? `class="clicavel" data-a="editar-produto" data-id="${p.id}"` : ""}>
          <td><div class="prod-cel"><span class="miniatura" ${p.foto ? `style="background-image:url('${esc(p.foto)}')"` : ""}>${p.foto ? "" : inicial(p.nome)}</span><div><div class="prod-nome">${esc(p.nome)}${p.ativo ? "" : ` <span class="selo neutro">inativo</span>`}</div><div class="prod-cat">${esc(p.categoria || "Sem categoria")}${p.variacoes.length ? ` · ${p.variacoes.length} variações` : ""}${restaurante() && !p.noCardapio ? " · fora do cardápio" : ""}</div></div></div></td>
          <td class="dir num">${fmt(p.preco)}</td>${pode("custos") ? `<td class="dir num">${fmt(p.custo)}</td>
          <td class="dir">${m === null ? "—" : `<span class="${m < 0 ? "negativo" : ""}">${m}%</span>`}</td>` : ""}
          <td class="dir" style="white-space:nowrap">${est}</td>
          <td class="dir">${p.controlaEstoque && pode("produtos") ? `<button class="btn mini claro" data-a="ajustar" data-id="${p.id}">Ajustar</button>` : ""}</td>
        </tr>`;
      }).join("")}</tbody></table></div></div>`;
    return html;
  }

  // Edição de produto: cópia em PF, desenhada dentro da janela
  let PF = null;
  function abrirProduto(p) {
    const novo = !p;
    PF = novo
      ? { id: null, nome: "", categoria: "", descricao: "", codigo: "", unidade: "un", preco: "", custo: "", controlaEstoque: S.negocio.controlaEstoque !== false, estoqueInicial: "", estoqueMinimo: "", noCardapio: true, destaque: false, ativo: true, cozinha: true, fiscal: {}, opcoes: [], variacoes: [], foto: "", fotoNova: null, comVariacoes: false, erro: "" }
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
      ${pode("custos") ? `<label><span class="rotulo-mob">Custo</span><input class="inp" data-var="${i}" data-campo="custo" value="${esc(v.custo)}" inputmode="decimal" placeholder="${esc(f.custo || "igual")}" /></label>` : ""}
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
        ${!pode("custos") ? "" : `<label class="campo"><span>Custo</span><input data-pf="custo" value="${esc(f.custo)}" inputmode="decimal" placeholder="0,00" /><small id="pf-margem">${m === null ? "Quanto você paga por ele" : `Margem: ${m}%`}</small></label>`}
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
          <label class="check"><input type="checkbox" data-pf="cozinha" ${f.cozinha !== false ? "checked" : ""} /><span>Vai para a cozinha <small>Desmarque em bebida pronta, sobremesa da vitrine… Não aparece na tela da cozinha.</small></span></label>
          <label class="campo"><span>Descrição</span><textarea data-pf="descricao" maxlength="400" placeholder="Ingredientes, tamanho, serve quantas pessoas…">${esc(f.descricao)}</textarea></label>
        </div>
        <p class="bloco-titulo" style="margin-top:14px">Adicionais e escolhas</p>
        <p class="bloco-sub">Ex.: “Borda” (escolhe 1) ou “Adicionais” (escolhe vários), cada opção com o valor a mais.</p>
        <div class="linhas">${gruposHtml}</div>
        <button class="btn claro mini" data-a="add-grupo" style="margin-top:8px">+ Grupo de adicionais</button>
      </div>` : `<div class="bloco"><label class="campo"><span>Descrição (opcional)</span><textarea data-pf="descricao" maxlength="400">${esc(f.descricao)}</textarea></label></div>`}
      <details class="bloco pf-fiscal" ${f.fiscal && f.fiscal.ncm ? "" : fiscalLigado() ? "open" : ""}><summary class="bloco-titulo">Dados fiscais (para a NFC-e)${f.fiscal && f.fiscal.ncm ? ` · NCM ${esc(f.fiscal.ncm)}` : ""}</summary>
        <div class="campos" style="margin-top:8px">
          <label class="campo"><span>NCM</span><input data-pf-fiscal="ncm" value="${esc((f.fiscal || {}).ncm || "")}" inputmode="numeric" maxlength="10" placeholder="8 números" /><small>Está na nota do fornecedor</small></label>
          <label class="campo"><span>CFOP</span><input data-pf-fiscal="cfop" value="${esc((f.fiscal || {}).cfop || "")}" inputmode="numeric" maxlength="4" placeholder="${esc((S.fiscal && S.fiscal.cfop) || "5102")}" /></label>
          <label class="campo"><span>CSOSN</span><input data-pf-fiscal="csosn" value="${esc((f.fiscal || {}).csosn || "")}" inputmode="numeric" maxlength="3" placeholder="${esc((S.fiscal && S.fiscal.csosn) || "102")}" /></label>
          <label class="campo"><span>CEST</span><input data-pf-fiscal="cest" value="${esc((f.fiscal || {}).cest || "")}" inputmode="numeric" maxlength="9" placeholder="se tiver" /></label>
        </div><p class="bloco-sub">Em branco = o padrão de Configurações → Nota fiscal. Confira com o seu contador.</p>
      </details>
      ${novo ? "" : `<div class="bloco"><label class="check"><input type="checkbox" data-pf="ativo" ${f.ativo ? "checked" : ""} /><span>Produto ativo <small>Desmarque para esconder das vendas sem apagar o histórico.</small></span></label></div>`}
      ${f.erro ? `<p class="erro-form">${esc(f.erro)}</p>` : ""}
      <div class="modal-rodape">
        ${novo || !ehChefia() ? "" : `<button class="btn perigo esq" data-a="excluir-produto">Excluir</button>`}
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
      estoqueInicial: numOu(f.estoqueInicial), noCardapio: f.noCardapio, destaque: f.destaque, ativo: f.ativo, cozinha: f.cozinha !== false, fiscal: Object.fromEntries(Object.entries(f.fiscal || {}).filter(([, v]) => String(v || "").trim())),
      opcoes: f.opcoes.map((g) => ({ ...g, escolhas: g.escolhas.filter((e) => e.nome.trim()).map((e) => ({ nome: e.nome, preco: numOu(e.preco) })) })).filter((g) => g.nome.trim() || g.escolhas.length),
      variacoes: f.comVariacoes ? f.variacoes.filter((v) => v.nome.trim() || v.id).map((v) => ({ id: v.id || undefined, nome: v.nome, codigo: v.codigo || "", preco: v.preco === "" ? null : numOu(v.preco), custo: v.custo === "" ? null : numOu(v.custo), estoqueMinimo: numOu(v.estoqueMinimo), estoqueInicial: numOu(v.estoqueInicial), ativo: v.ativo !== false })) : [],
    };
    if (f.id && !f.comVariacoes && PF.variacoes.some((v) => v.id)) {
      if (!(await confirmarAcao({ mensagem: "As variações deste produto serão apagadas (com o estoque delas). Continuar?", botao: "Continuar", cancelar: "Voltar", sempre: true }))) return;
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
      if (S.tab === "caixa") carregarDaAba("caixa"); else render();
    } catch (e) { a.salvando = false; a.erro = e.message; corpoModal(ajusteHtml()); }
  }

  /* =====================================================================
     Compras de mercadoria
     ===================================================================== */
  function telaCompras() {
    let html = topo("Compras", "Mercadoria que entrou: soma no estoque, atualiza o custo médio e vira despesa “Custo de mercadoria” no Controle financeiro.", `<button class="btn claro" data-a="nfe-abrir" title="Lê o arquivo XML da nota do fornecedor">Importar XML da nota (NF-e)</button><button class="btn acento" data-a="nova-compra">Registrar compra</button>`);
    if (!S.compras) return html + carregandoHtml;
    if (!S.compras.length) return html + `<div class="card vazio"><b>Nenhuma compra registrada</b>Quando chegar mercadoria do fornecedor, registre aqui: o estoque e o financeiro se atualizam juntos.</div>`;
    return html + `<div class="card" style="padding:6px 8px"><div class="tabela-wrap"><table class="tabela"><thead><tr><th class="so-desk">Data</th><th class="so-desk">Fornecedor</th><th>Itens</th><th class="dir">Total</th><th class="so-desk">Pagamento</th><th></th></tr></thead><tbody>
      ${S.compras.map((c) => `<tr class="${c.cancelada ? "cancelada" : ""}"><td class="so-desk">${dataBR(c.data)}</td><td class="so-desk">${esc(c.fornecedor || "—")}${c.nfeNumero ? `<div class="prod-cat">NF-e ${esc(c.nfeNumero)}</div>` : ""}</td><td><span class="so-cel prod-cat">${dataBR(c.data)}${c.fornecedor ? ` · ${esc(c.fornecedor)}` : ""} · ${esc(meioCurto(c.meio))}</span>${c.itens.map((i) => `${fmtN(i.qtd)}× ${esc(i.nome)}`).join(", ")}${c.frete ? ` <span class="prod-cat">+ frete ${fmt(c.frete)}</span>` : ""}</td><td class="dir num">${fmt(c.total)}</td>
        <td class="so-desk">${esc(nomeMeio(c.meio))}${c.vencimento ? `<div class="prod-cat">vence ${dataBR(c.vencimento)}</div>` : ""}</td>
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
      if (S.tab === "compras") carregarDaAba("compras"); else if (S.tab === "caixa") carregarDaAba("caixa"); else render();
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
      carregarDaAba("relatorios");
    } catch (e) { toast(esc(e.message), "erro"); }
  }

  /* =====================================================================
     Vendas (histórico)
     ===================================================================== */
  function telaRelatorios() {
    const abas = [["vendas", "Vendas"], ["produtos", "Produtos (ABC e margem)"], ["horarios", "Dias e horários"], ["caixas", "Fechamentos de caixa"], ["despesas", "Despesas"]].filter(([k]) => pode("custos") || !["produtos", "despesas"].includes(k));
    if (!abas.some(([k]) => k === S.relAba)) S.relAba = "vendas";
    const chips = `<div class="chips rel-abas" style="margin:0">${abas.map(([k, t]) => `<button class="chip ${S.relAba === k ? "ativo" : ""}" data-a="rel-aba" data-v="${k}">${t}</button>`).join("")}</div>`;
    const excel = !pode("custos") ? "" : `<button class="btn claro mini rel-excel" data-a="baixar-xlsx" title="Planilha do mês com vendas, itens, pagamentos, caixas, despesas, estoque e clientes"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Excel (.xlsx) de ${MESES[Number(S.mesVendas.slice(5, 7)) - 1]}</button>`;
    return `<h1 class="so-cel titulo-cel">Relatórios</h1><div class="linha entre rel-topo">${chips}${excel}</div>` + (S.relAba === "caixas" ? telaCaixasHist() : S.relAba === "despesas" ? telaGastos() : S.relAba === "produtos" ? (tem("relatorios") ? telaAnaliseProdutos() : completoHtml("relatorios")) : S.relAba === "horarios" ? (tem("relatorios") ? telaAnaliseHorarios() : completoHtml("relatorios")) : telaVendas());
  }
  function telaCaixasHist() {
    let html = topo("Fechamentos de caixa", "Cada abertura e fechamento, com o que deveria ter e o que foi contado.");
    if (!S.caixas) return html + carregandoHtml;
    if (!S.caixas.length) return html + `<div class="card vazio"><b>Nenhum caixa ainda</b>Abra o caixa na aba Caixa para começar.</div>`;
    const h = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
    return html + `<div class="card" style="padding:6px 8px"><div class="tabela-wrap"><table class="tabela"><thead><tr><th>#</th><th>Abertura</th><th class="so-desk">Fechamento</th><th class="dir">Vendas</th><th class="dir">Diferença</th></tr></thead><tbody>
      ${S.caixas.map((c) => `<tr class="clicavel" data-a="ver-caixa" data-id="${c.id}"><td class="num">${c.numero}</td><td>${h(c.abertoEm)}${c.abertoPor ? `<div class="prod-cat">${esc(c.abertoPor)}</div>` : ""}</td>
        <td class="so-desk">${c.status === "aberto" ? `<span class="selo ok">aberto</span>` : h(c.fechadoEm)}</td><td class="dir num">${fmt(c.total)}<div class="prod-cat">${c.vendas} vendas</div></td>
        <td class="dir num ${c.diferenca < 0 ? "negativo" : c.diferenca > 0 ? "positivo" : ""}">${c.status === "aberto" ? "—" : c.diferenca ? `${c.diferenca > 0 ? "+" : "−"} ${fmt(Math.abs(c.diferenca))}` : "ok"}</td></tr>`).join("")}
    </tbody></table></div></div>`;
  }
  function imprimirHtml(titulo, html) {
    const w = window.open("", "_blank", "width=820,height=900");
    if (!w) { toast("Libere as janelas (pop-up) do navegador para imprimir.", "erro"); return; }
    w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${esc(titulo)}</title><style>
      body{font-family:system-ui,sans-serif;color:#111;margin:24px;font-size:13px}h1{font-size:18px;margin:0 0 6px}.grade{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.card{border:1px solid #ccc;border-radius:8px;padding:8px}
      .kpi-rotulo{font-size:10px;text-transform:uppercase;color:#666;margin:0}.kpi-valor{font-size:16px;font-weight:700;margin:4px 0}.kpi-nota,.sub{color:#666;font-size:11px;margin:0}
      table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left}.dir{text-align:right}</style></head>
      <body><h1>${esc(S.negocio.nome || "PDV")} · ${esc(titulo)}</h1>${html}<script>window.onload=function(){window.print()}<\/script></body></html>`);
    w.document.close();
  }
  function telaVendas() {
    const [a, m] = S.mesVendas.split("-").map(Number);
    const nav = `<div class="linha"><button class="btn claro mini" data-a="mes-vendas" data-d="-1" aria-label="Mês anterior">‹</button><b style="min-width:130px;text-align:center">${MESES[m - 1]} de ${a}</b><button class="btn claro mini" data-a="mes-vendas" data-d="1" aria-label="Próximo mês">›</button></div>`;
    let html = topo("Vendas", "Todas as vendas do balcão e dos pedidos do cardápio. Cancelar devolve ao estoque e tira do financeiro.", nav);
    if (!S.vendas) return html + carregandoHtml;
    const validas = S.vendas.filter((v) => !v.cancelada);
    const tot = validas.reduce((acc, v) => ({ total: acc.total + v.total, cmv: acc.cmv + v.cmv, taxa: acc.taxa + v.taxa, lucro: acc.lucro + v.lucro }), { total: 0, cmv: 0, taxa: 0, lucro: 0 });
    html += `<div class="grade grade-4">
      <div class="card"><p class="kpi-rotulo">Faturamento</p><p class="kpi-valor">${fmt(tot.total)}</p><p class="kpi-nota">${validas.length === 1 ? "1 venda" : `${validas.length} vendas`}${validas.length ? ` · ticket médio ${fmt(tot.total / validas.length)}` : ""}</p></div>
      ${pode("custos") ? `<div class="card"><p class="kpi-rotulo">Custo da mercadoria</p><p class="kpi-valor">${fmt(tot.cmv)}</p><p class="kpi-nota">pelo custo médio de cada produto</p></div>` : ""}
      <div class="card"><p class="kpi-rotulo">Taxas de cartão</p><p class="kpi-valor">${fmt(tot.taxa)}</p><p class="kpi-nota">as % ficam em Configurações</p></div>
      ${pode("custos") ? `<div class="card"><p class="kpi-rotulo">Lucro bruto</p><p class="kpi-valor ${tot.lucro >= 0 ? "positivo" : "negativo"}">${fmt(tot.lucro)}</p><p class="kpi-nota">${tot.total ? `margem de ${Math.round(tot.lucro / tot.total * 100)}%` : "—"}</p></div>` : ""}
    </div><div class="espaco"></div>`;
    if (!S.vendas.length) return html + `<div class="card vazio">Nenhuma venda neste mês.</div>`;
    return html + `<div class="card" style="padding:6px 8px"><div class="tabela-wrap"><table class="tabela"><thead><tr><th class="so-desk">#</th><th class="so-desk">Data</th><th>Itens</th><th class="so-desk">Pagamento</th><th class="dir">Total</th>${pode("custos") ? `<th class="dir so-desk">Lucro</th>` : ""}</tr></thead><tbody>
      ${S.vendas.map((v) => `<tr class="clicavel ${v.cancelada ? "cancelada" : ""}" data-a="ver-venda" data-id="${v.id}"><td class="num so-desk">${v.numero}</td><td class="so-desk">${dataBR(v.data)}</td>
        <td><span class="so-cel prod-cat">#${v.numero} · ${dataBR(v.data)} · ${esc(pagamentoTexto(v))}${v.cancelada ? " · cancelada" : ""}</span>${v.itens.slice(0, 3).map((i) => `${fmtN(i.qtd)}× ${esc(i.nome)}`).join(", ")}${v.itens.length > 3 ? ` +${v.itens.length - 3}` : ""}${v.cliente ? `<div class="prod-cat">${esc(v.cliente)}${v.pedidoId ? " · cardápio" : v.comandaId ? " · mesa" : ""}</div>` : v.pedidoId ? `<div class="prod-cat">cardápio</div>` : ""}</td>
        <td class="so-desk">${esc(pagamentoTexto(v))}${v.cancelada ? ` <span class="selo neutro">cancelada</span>` : ""}</td><td class="dir num">${fmt(v.total)}${pode("custos") ? `<div class="prod-cat so-cel ${v.lucro < 0 ? "negativo" : ""}">lucro ${fmt(v.lucro)}</div></td><td class="dir num so-desk ${v.lucro < 0 ? "negativo" : ""}">${fmt(v.lucro)}` : ""}</td></tr>`).join("")}
    </tbody></table></div></div>`;
  }
  function verVenda(id) {
    const v = (S.vendas || []).find((x) => x.id === id);
    if (!v) return;
    S.ultimaVenda = { venda: v, tel: "" };
    abrirModal(`Venda #${v.numero}`, `<p class="sub">${dataBR(v.data)} · ${(v.pagamentos && v.pagamentos.length ? v.pagamentos : [{ meio: v.meio, valor: v.total }]).map((p) => `${esc(meioCurto(p.meio))} ${fmt(p.valor)}`).join(" + ")}${v.troco ? ` · troco ${fmt(v.troco)}` : ""}${v.cliente ? ` · ${esc(v.cliente)}` : ""}${v.operador ? ` · por ${esc(v.operador)}` : ""}${v.cancelada ? " · <b>cancelada</b>" : ""}${v.fiadoAberto ? ` · <b class="negativo">fiado em aberto ${fmt(v.fiadoAberto)}</b>` : ""}</p>
      <div class="tabela-wrap" style="margin-top:12px"><table class="tabela"><tbody>${v.itens.map((i) => `<tr><td>${fmtN(i.qtd)}× ${esc(i.nome)}${i.opcoes && i.opcoes.length ? `<div class="prod-cat">${i.opcoes.map(esc).join(", ")}</div>` : ""}</td><td class="dir num">${fmt(i.qtd * i.unit)}</td></tr>`).join("")}</tbody></table></div>
      <div style="margin-top:12px">
        <div class="cart-linha"><span>Subtotal</span><span class="num">${fmt(v.subtotal)}</span></div>
        ${v.desconto ? `<div class="cart-linha"><span>Desconto</span><span class="num negativo">− ${fmt(v.desconto)}</span></div>` : ""}
        ${v.cashbackUsado ? `<div class="cart-linha"><span>Cashback usado</span><span class="num negativo">− ${fmt(v.cashbackUsado)}</span></div>` : ""}
        ${v.premioValor ? `<div class="cart-linha"><span>Prêmio do cartão fidelidade</span><span class="num negativo">− ${fmt(v.premioValor)}</span></div>` : ""}
        ${v.acrescimo ? `<div class="cart-linha"><span>Entrega</span><span class="num">${fmt(v.acrescimo)}</span></div>` : ""}
        <div class="cart-linha total"><span>Total</span><span class="num">${fmt(v.total)}</span></div>
        ${pode("custos") ? `<div class="cart-linha"><span class="sub">Custo da mercadoria</span><span class="num sub">${fmt(v.cmv)}</span></div>
        ${v.taxa ? `<div class="cart-linha"><span class="sub">Taxa do cartão</span><span class="num sub">${fmt(v.taxa)}</span></div>` : ""}
        <div class="cart-linha"><span><b>Sobrou (lucro bruto)</b></span><b class="num ${v.lucro < 0 ? "negativo" : "positivo"}">${fmt(v.lucro)}</b></div>` : ""}
      </div>
      ${v.cashbackGanho || v.selosGanhos ? `<p class="aviso info">🎁 ${esc(v.cliente)} ${v.cashbackGanho ? `ganhou ${fmt(v.cashbackGanho)} de cashback` : "ganhou +1 compra no cartão fidelidade"} nesta venda.</p>` : ""}
      ${v.clienteId ? `<p style="margin-top:10px"><button class="link" data-a="cli-ficha" data-id="${v.clienteId}">Ver a ficha de ${esc(v.cliente)}</button></p>` : ""}
      ${v.obs ? `<p class="aviso info">${esc(v.obs)}</p>` : ""}
      ${v.offline ? `<p class="bloco-sub" style="margin-top:8px">Feita sem internet e enviada depois.</p>` : ""}
      ${notaFiscalHtml(v)}
      <div class="modal-rodape">${v.cancelada ? "" : `<button class="btn perigo esq" data-a="cancelar-venda" data-id="${v.id}">Cancelar venda</button>`}${v.cancelada ? "" : `<button class="btn claro" data-a="recibo-imprimir">Recibo</button>`}<button class="btn claro" data-a="fechar-modal">Fechar</button></div>`);
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
      `<button class="btn claro so-desk" data-a="importar-cli">Importar planilha</button><button class="btn claro so-desk" data-a="exportar-cli">Exportar (.xlsx)</button><button class="btn acento" data-a="cli-novo">Novo cliente</button>`);
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
      ${S.fiadoTotal && S.fiadoTotal.total ? `<div class="card"><p class="kpi-rotulo">Fiado a receber</p><p class="kpi-valor negativo">${fmt(S.fiadoTotal.total)}</p><p class="kpi-nota">${S.fiadoTotal.clientes === 1 ? "1 cliente devendo" : `${S.fiadoTotal.clientes} clientes devendo`}</p></div>`
        : `<div class="card"><p class="kpi-rotulo">Ticket médio por cliente</p><p class="kpi-valor">${fmt(todos.reduce((a, c) => a + c.totalGasto, 0) / Math.max(1, todos.reduce((a, c) => a + c.compras, 0)))}</p><p class="kpi-nota">valor médio de cada compra</p></div>`}
    </div><div class="espaco"></div>`;
    html += `<div class="linha" style="margin-bottom:14px"><input class="inp" style="max-width:340px" data-busca-cli value="${esc(S.buscaCli)}" placeholder="Buscar por nome ou telefone" />
      <div class="chips"><button class="chip ${!S.filtroCli ? "ativo" : ""}" data-a="filtro-cli" data-v="">Todos</button><button class="chip ${S.filtroCli === "fiado" ? "ativo" : ""}" data-a="filtro-cli" data-v="fiado">Devendo (fiado)</button><button class="chip ${S.filtroCli === "sumidos" ? "ativo" : ""}" data-a="filtro-cli" data-v="sumidos">Sumidos (+${limite} dias)</button>${prog.modelo !== "nenhum" ? `<button class="chip ${S.filtroCli === "saldo" ? "ativo" : ""}" data-a="filtro-cli" data-v="saldo">${prog.modelo === "cashback" ? "Com cashback" : "Com compras no cartão"}</button>` : ""}</div></div>`;
    if (!todos.length) return html + `<div class="card vazio">${S.buscaCli || S.filtroCli ? "Ninguém neste filtro." : "<b>Nenhum cliente ainda</b>Escolha o cliente no carrinho na hora da venda, ou cadastre aqui. Os pedidos do cardápio entram sozinhos."}</div>`;
    return html + `<div class="card" style="padding:6px 8px"><div class="tabela-wrap"><table class="tabela"><thead><tr><th>Cliente</th><th class="dir so-desk">Compras</th><th class="dir so-desk">Total gasto</th><th>Última compra</th><th class="dir">Fiado</th>${prog.modelo !== "nenhum" ? `<th class="so-desk">${prog.modelo === "cashback" ? "Cashback" : "Cartão"}</th>` : ""}<th class="so-desk"></th></tr></thead><tbody>
      ${todos.map((c) => {
        const d = diasDesde(c.ultimaCompra); const sumido = d !== null && d > limite;
        const w = linkWhats(c, sumido);
        return `<tr class="clicavel" data-a="cli-ficha" data-id="${c.id}">
          <td><div class="prod-nome">${esc(c.nome || "Sem nome")}</div><div class="prod-cat">${c.telefone ? telFmt(c.telefone) : "sem telefone"}</div></td>
          <td class="dir num so-desk">${c.compras}</td><td class="dir num so-desk">${fmt(c.totalGasto)}</td>
          <td>${c.ultimaCompra ? `${dataBR(c.ultimaCompra)}<div class="prod-cat ${sumido ? "negativo" : ""}">${d === 0 ? "hoje" : d === 1 ? "ontem" : `há ${d} dias`}</div>` : `<span class="sub">—</span>`}</td>
          <td class="dir">${c.deve ? `<span class="selo acabou">${fmt(c.deve)}</span>` : `<span class="sub">—</span>`}</td>
          ${prog.modelo !== "nenhum" ? `<td class="so-desk">${fidelidadeCelula(c)}</td>` : ""}
          <td class="dir so-desk">${w ? `<a class="btn mini ${sumido ? "acento" : "claro"}" href="${esc(w)}" target="_blank" rel="noopener">${sumido ? "Chamar de volta" : "WhatsApp"}</a>` : ""}</td>
        </tr>`;
      }).join("")}</tbody></table></div></div>`;
  }

  let FC = null; // ficha aberta
  async function abrirFicha(id) {
    FC = { id, dados: null, edit: null, erro: "", aba: "historico" };
    abrirModal("Cliente", `<p class="sub">Carregando…</p>`, { largo: true, aoFechar: () => { FC = null; } });
    try { FC.dados = await api("GET", `/estoque/clientes/${id}`); if (FC) corpoModal(fichaHtml()); } catch (e) { corpoModal(`<p class="erro-form">${esc(e.message)}</p>`); return; }
    carregarCrmDaFicha(id);
  }
  // A mesma pessoa no CRM (pelo telefone): negociação aberta, compra fechada ou "levar para o CRM"
  async function carregarCrmDaFicha(id) {
    try { const r = await api("GET", `/estoque/clientes/${id}/crm`); if (FC && FC.id === id) { FC.crm = r; if (!FC.edit) corpoModal(fichaHtml()); } } catch (e) { /* sem CRM: a ficha segue igual */ }
  }
  function crmDaFichaHtml() {
    const r = FC.crm;
    if (!r || r.semAcesso) return "";
    const TIPO = { aberto: ["Em negociação", "acento"], ganho: ["Comprou", "acento"], perdido: ["Perdido", "neutro"] };
    if (r.negociacoes.length) return `<div class="bloco"><p class="bloco-titulo">No CRM</p><ul class="lista-simples" style="margin-top:6px">${r.negociacoes.map((n) => {
      const [rot, cls] = TIPO[n.tipo] || [n.etapa, "neutro"];
      return `<li><span><b>${esc(n.cliente)}</b> · ${esc(n.etapa)}${n.funil ? ` <small class="sub">(${esc(n.funil)})</small>` : ""} <span class="selo ${cls}">${rot}</span></span><span class="linha">${n.valor ? `<b class="num">${fmt(n.valor)}</b>` : ""}<a class="btn mini claro" href="../index.html?contato=${esc(n.id)}">Abrir no CRM</a></span></li>`;
    }).join("")}</ul></div>`;
    if (!r.temTelefone) return "";
    return `<div class="bloco"><div class="linha entre"><p class="bloco-titulo" style="margin:0">No CRM</p><button class="btn mini claro" data-a="fc-crm-criar">Levar para o CRM</button></div><p class="sub" style="margin-top:4px">Ainda não tem um contato com este telefone no CRM.</p></div>`;
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
      ${FC.dados.fiado && FC.dados.fiado.total ? `<div class="bloco"><div class="linha entre"><p class="bloco-titulo" style="margin:0">Fiado: deve <span class="negativo">${fmt(FC.dados.fiado.total)}</span></p><button class="btn mini acento" data-a="fc-receber">Receber</button></div>
        <ul class="lista-simples" style="margin-top:6px">${FC.dados.fiado.vendas.map((v) => `<li><span>Venda #${v.numero} · ${dataBR(v.data)}</span><span class="num">${fmt(v.aberto)}${v.aberto < v.total ? ` <small class="sub">de ${fmt(v.total)}</small>` : ""}</span></li>`).join("")}</ul></div>` : ""}
      ${crmDaFichaHtml()}
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
    S.clientes = r.clientes; S.emAberto = r.emAberto; S.fiadoTotal = r.fiado;
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
        ${p.status === "novo" ? `<div class="linha">${p.cozinhaId ? `<span class="selo ok">na cozinha</span>` : `<button class="btn claro mini" data-a="pedido-cozinha" data-id="${p.id}">Mandar para a cozinha</button>`}<button class="btn acento mini" data-a="vender-pedido" data-id="${p.id}">Registrar venda</button>${tel ? `<a class="btn claro mini" href="https://wa.me/${tel.length <= 11 ? "55" + tel : tel}" target="_blank" rel="noopener">WhatsApp do cliente</a>` : ""}<button class="btn perigo mini" data-a="recusar-pedido" data-id="${p.id}">Recusar</button></div>` : ""}
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
      ${caixaConfigHtml()}
      <div class="card">
        <h2 class="secao">Acessibilidade</h2>
        <div data-a11y-painel></div>
      </div>
      ${fiscalCardHtml()}
      ${restaurante() ? `<div class="card">
        <h2 class="secao">Mesas e cozinha</h2>
        <p class="sub">${S.mapa ? `${S.mapa.mesas.length} ${S.mapa.mesas.length === 1 ? "mesa" : "mesas"}. ` : ""}Taxa de serviço ${String(S.pdv.taxaServico ?? 10).replace(".", ",")}%. Os produtos marcados “vai para a cozinha” aparecem na tela da Cozinha quando o garçom manda o pedido.</p>
        <div class="linha" style="margin-top:14px"><button class="btn claro" data-a="ms-editar">Editar mesas e taxa de serviço</button><button class="btn claro" data-a="ir" data-tab="cozinha">Abrir a tela da cozinha</button></div>
      </div>` : ""}
      ${programaCardHtml()}
      <div class="card">
        <h2 class="secao">Taxas de cartão e Pix</h2>
        <p class="sub">As % que a maquininha cobra viram despesa “Taxas de pagamento” a cada venda. Elas ficam no Controle financeiro, aba Lucro → Taxas da venda (as mesmas do fechamento de venda do CRM).</p>
        <div style="margin-top:14px"><a class="btn claro" href="../financeiro/#lucro">Abrir as taxas no financeiro</a></div>
        <div class="bloco"><p class="bloco-titulo">Como entra no Controle financeiro</p>
          <ul class="lista-simples">
            <li><span>Venda no balcão${restaurante() ? " ou conta da mesa" : ""}</span><span class="selo ok">Receita · Vendas</span></li>
            <li><span>Compra de mercadoria</span><span class="selo baixo">Despesa · Custo de mercadoria</span></li>
            <li><span>Nota de gasto</span><span class="selo baixo">Despesa · a categoria escolhida</span></li>
            <li><span>Taxa do cartão</span><span class="selo baixo">Despesa · Taxas de pagamento</span></li>
          </ul>
          <p class="bloco-sub" style="margin-top:8px">O custo da mercadoria vendida não vira despesa de novo (ela já entrou quando você comprou). Ele aparece no lucro de cada venda, aqui e na aba Lucro do financeiro.</p>
        </div>
      </div></div>`;
  }
  // Caixa e operadores (PIN)
  let PC = null;
  function caixaConfigHtml() {
    if (!PC) PC = { exigirCaixa: S.pdv.exigirCaixa !== false, exigirOperador: !!S.pdv.exigirOperador, descontoMaxCaixa: String(S.pdv.descontoMaxCaixa ?? 10).replace(".", ","), reciboRodape: S.pdv.reciboRodape || "", erro: "" };
    const ops = S.operadores;
    return `<div class="card">
      <h2 class="secao">Caixa e operadores</h2>
      <div class="campos" style="grid-template-columns:1fr">
        <label class="check"><input type="checkbox" data-pc="exigirCaixa" ${PC.exigirCaixa ? "checked" : ""} /><span><b>Só vender com o caixa aberto</b><small>Garante que toda venda do balcão entre na conferência do fim do dia.</small></span></label>
        <label class="campo"><span>Mensagem no fim do recibo</span><input data-pc="reciboRodape" value="${esc(PC.reciboRodape)}" maxlength="140" placeholder="Obrigado pela preferência!" /></label>
      </div>
      <div class="bloco">
        ${!tem("equipe") ? `<p class="bloco-titulo" style="margin:0">Operadores (funcionários)</p><p class="bloco-sub" style="margin-top:4px">Cada funcionário entrar com o próprio PIN faz parte do <b>plano Completo</b>. <a href="../assinatura.html?de=estoque">Ver planos</a></p>` : `<div class="linha entre"><p class="bloco-titulo" style="margin:0">Equipe</p><a class="btn mini claro" href="../painel.html">Abrir o Painel do dono</a></div>
        <p class="bloco-sub" style="margin-top:4px">Cadastrar pessoas, trocar PIN, escolher a função de cada uma e o que pode ver fica no <b>Painel do dono</b>.</p>
        <p class="bloco-sub" style="margin-top:4px">Cada pessoa entra no caixa com um PIN. O sistema guarda quem vendeu e quem abriu e fechou o caixa. Gerente cancela vendas e mexe em produtos e configurações; caixa vende e cuida do caixa${restaurante() ? "; garçom lança os pedidos nas mesas" : ""}.</p>
        ${ops.length ? `<ul class="lista-simples">${ops.map((o) => `<li><span><b>${esc(o.nome)}</b> <span class="selo ${["gestor", "gerente"].includes(o.papel) ? "acento" : "neutro"}">${NOME_PAPEL[o.papel] || o.papel}</span>${o.ativo ? "" : ` <span class="selo neutro">inativo</span>`}</span></li>`).join("")}</ul>` : `<p class="sub">Ninguém cadastrado ainda. Sem equipe, quem está logado na conta usa o caixa.</p>`}
        ${ops.length ? `<label class="check" style="margin-top:10px"><input type="checkbox" data-pc="exigirOperador" ${PC.exigirOperador ? "checked" : ""} /><span><b>Pedir o PIN para usar o caixa</b><small>Ninguém vende, cancela ou muda nada sem entrar com o PIN.</small></span></label>
        <label class="campo" style="margin-top:10px;max-width:220px"><span>Desconto máximo do caixa (%)</span><input data-pc="descontoMaxCaixa" value="${esc(PC.descontoMaxCaixa)}" inputmode="decimal" /><small>Acima disso, só o gerente.</small></label>` : ""}`}
      </div>
      ${PC.erro ? `<p class="erro-form">${esc(PC.erro)}</p>` : ""}
      <div class="modal-rodape"><button class="btn acento" data-a="salvar-pc">Salvar</button></div>
    </div>`;
  }
  async function salvarCaixaConfig() {
    const c = PC; c.erro = "";
    try {
      S.pdv = (await api("PUT", "/estoque/pdv", { exigirCaixa: c.exigirCaixa, exigirOperador: c.exigirOperador, descontoMaxCaixa: numOu(c.descontoMaxCaixa, 10), reciboRodape: c.reciboRodape })).pdv;
      PC = null; toast("Salvo.", "ok"); atualizarChipOperador();
      if (S.pdv.exigirOperador && !lerOperador()) mostrarTrava();
    } catch (e) { c.erro = e.message; }
    render();
  }
  let OPF = null;
  const NOME_PAPEL = { gestor: "gestor", gerente: "gerente", vendedor: "vendedor", estoquista: "estoquista", caixa: "caixa", garcom: "garçom" };
  function abrirOperador(o) {
    OPF = o ? { ...o, pin: "", erro: "" } : { id: null, nome: "", papel: S.operadores.some((x) => x.papel === "gerente") ? "caixa" : "gerente", ativo: true, pin: "", erro: "" };
    abrirModal(o ? "Editar operador" : "Novo operador", operadorHtml(), { aoFechar: () => { OPF = null; } });
  }
  function operadorHtml() {
    const o = OPF;
    return `<div class="campos" style="grid-template-columns:1fr">
        <label class="campo"><span>Nome</span><input id="op-nome" value="${esc(o.nome)}" maxlength="60" autofocus /></label>
        <div class="campo"><span>Função</span><div class="chips"><button class="chip ${o.papel === "caixa" ? "ativo" : ""}" data-a="op-papel" data-v="caixa">Caixa</button><button class="chip ${o.papel === "gerente" ? "ativo" : ""}" data-a="op-papel" data-v="gerente">Gerente</button>${restaurante() || o.papel === "garcom" ? `<button class="chip ${o.papel === "garcom" ? "ativo" : ""}" data-a="op-papel" data-v="garcom">Garçom</button>` : ""}</div><small>${o.papel === "gerente" ? "Faz tudo: cancela vendas, mexe em produtos, operadores e configurações." : o.papel === "garcom" ? "Abre mesas, lança pedidos e manda para a cozinha. Não cobra nem mexe no caixa." : "Vende, cobra as mesas e mexe no caixa (abrir, sangria, fechar)."}</small></div>
        <label class="campo"><span>${o.id ? "Novo PIN (deixe em branco para manter)" : "PIN (4 a 6 números)"}</span><input id="op-pin" inputmode="numeric" maxlength="6" autocomplete="off" /></label>
        ${o.id ? `<label class="check"><input type="checkbox" id="op-ativo" ${o.ativo ? "checked" : ""} /><span>Ativo</span></label>` : ""}
      </div>${o.erro ? `<p class="erro-form">${esc(o.erro)}</p>` : ""}
      <div class="modal-rodape">${o.id ? `<button class="btn perigo esq" data-a="op-excluir">Excluir</button>` : ""}<button class="btn claro" data-a="fechar-modal">Cancelar</button><button class="btn acento" data-a="op-salvar">Salvar</button></div>`;
  }
  async function salvarOperadorTela() {
    const o = OPF; o.nome = $("#op-nome").value; o.pin = $("#op-pin").value.trim(); if ($("#op-ativo")) o.ativo = $("#op-ativo").checked;
    try {
      await api(o.id ? "PUT" : "POST", `/estoque/operadores${o.id ? `/${o.id}` : ""}`, { nome: o.nome, papel: o.papel, pin: o.pin || undefined, ativo: o.ativo });
      S.operadores = (await api("GET", "/estoque/operadores")).operadores; PC = null;
      fecharModal(); toast("Operador salvo.", "ok"); atualizarChipOperador(); render();
    } catch (e) { o.erro = e.message; corpoModal(operadorHtml()); }
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
      desenharNavCelular();
      toast(!eraRest && restaurante() ? "Salvo! Agora você tem Mesas, Cozinha, Cardápio digital e Pedidos." : "Salvo.", "ok");
    } catch (e) { c.erro = e.message; }
    render();
  }

  /* =====================================================================
     Mesas, comandas e cozinha (restaurante)
     O garçom abre a mesa, lança os itens (com adicionais e observação) e manda para a
     cozinha; a cozinha vê os pedidos numa tela própria (novo → preparando → pronto);
     o caixa fecha a conta com a mesma cobrança do balcão (taxa de serviço, divisão por
     pessoas, troco, fiado). O estoque só baixa quando a conta fecha.
     ===================================================================== */
  const operadorAtual = () => { const o = lerOperador(); return o ? o.operador : ACESSO && ACESSO.tipo === "funcionario" ? ACESSO.operador : null; };
  // "garçom" = quem lança pedidos mas não cobra (a função não tem vender nem caixa)
  const ehGarcom = () => { const o = operadorAtual(); return permsAtuais() ? !pode("vender") && !pode("caixa") && pode("mesas") : !!(o && o.papel === "garcom"); };
  const minutosDesde = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  const tempoTxt = (iso) => { const m = minutosDesde(iso); return m < 60 ? `${m} min` : m >= 24 * 60 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`; };
  // mesa aberta há mais de 6 h: provavelmente esqueceram de fechar a conta (mesma regra do servidor)
  const mesaEsquecida = (c) => c && minutosDesde(c.abertaEm) >= 6 * 60;
  const relogio = (iso) => { const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const OBS_RAPIDAS = ["sem cebola", "sem tomate", "bem passado", "ao ponto", "sem gelo", "para viagem"];

  // som de aviso (pedido novo na cozinha, prato pronto para o garçom)
  let audioCtx = null;
  const KD = { som: false, filtro: "novo", vistos: null };
  try { KD.som = localStorage.getItem("pdv-som") === "1"; } catch (e) { /* sem armazenamento */ }
  function bip(vezes = 2) {
    if (!KD.som) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      for (let i = 0; i < vezes; i++) {
        const t0 = audioCtx.currentTime + i * 0.32;
        const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
        o.type = "sine"; o.frequency.value = i % 2 ? 1175 : 880;
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
        o.connect(g); g.connect(audioCtx.destination); o.start(t0); o.stop(t0 + 0.3);
      }
    } catch (e) { /* navegador sem áudio */ }
  }

  /* ---------- mapa das mesas ---------- */
  let prontosAntes = null;
  async function carregarMesas() {
    const m = await api("GET", "/estoque/mesas");
    // prato ficou pronto: avisa quem está nas mesas
    const agora = new Map([...m.mesas.filter((x) => x.comanda).map((x) => [x.comanda.id, x.comanda]), ...m.avulsas.map((c) => [c.id, c])]);
    if (prontosAntes) {
      const novos = [...agora.values()].filter((c) => c.prontos > (prontosAntes.get(c.id) || 0));
      if (novos.length) { toast(`🔔 Pronto na cozinha: <b>${novos.map((c) => esc(c.rotulo)).join(", ")}</b>`, "ok"); bip(3); }
    }
    prontosAntes = new Map([...agora.values()].map((c) => [c.id, c.prontos]));
    const mudou = JSON.stringify(m) !== JSON.stringify(S.mapa);
    S.mapa = m;
    if (mudou && S.tab === "mesas" && !modalAberto()) render();
  }
  function mesaTile(m, c) {
    const estado = !c ? "livre" : c.status === "conta" ? "conta" : "ocupada";
    return `<button type="button" class="mesa ${estado} ${c && c.prontos ? "tem-pronto" : ""} ${mesaEsquecida(c) ? "esquecida" : ""}" data-a="${c ? "ms-abrir" : "ms-nova"}" data-id="${c ? c.id : m.id}" ${mesaEsquecida(c) ? `title="Aberta há ${tempoTxt(c.abertaEm)}: confira se a conta já foi fechada"` : ""}>
      <span class="mesa-nome">${esc(m ? m.nome : c.rotulo)}</span>
      ${c ? `<span class="mesa-total num">${fmt(c.total)}</span>
        <span class="mesa-info">${c.pessoas > 1 ? `${c.pessoas} pessoas · ` : ""}${mesaEsquecida(c) ? "⚠ " : ""}${tempoTxt(c.abertaEm)}</span>
        <span class="mesa-selos">${c.status === "conta" ? `<i class="s-conta">pediu a conta</i>` : ""}${c.prontos ? `<i class="s-pronto">🔔 pronto</i>` : c.naCozinha ? `<i class="s-cozinha">na cozinha</i>` : ""}${c.pendentes ? `<i class="s-pend">${c.pendentes} a enviar</i>` : ""}</span>`
        : `<span class="mesa-info">livre</span>`}
    </button>`;
  }
  function telaMesas() {
    const M = S.mapa;
    let html = topo("Mesas", "Toque numa mesa para abrir a conta, lançar os pedidos e mandar para a cozinha.",
      `<button class="btn claro" data-a="ms-avulsa">+ Comanda sem mesa</button>${ehGarcom() ? "" : `<button class="btn claro so-desk" data-a="ms-editar">Editar mesas</button>`}`);
    if (!M) return html + carregandoHtml;
    if (!M.mesas.length && !M.avulsas.length) {
      return html + `<div class="card vazio"><b>Cadastre as mesas do salão</b>Quantas mesas você tem? Dá para mudar os nomes depois (ex.: Varanda 1, Balcão).
        <div class="linha" style="justify-content:center;margin-top:14px"><input class="inp" id="ms-qtd" inputmode="numeric" value="10" style="width:90px;text-align:center" aria-label="Quantidade de mesas" /><button class="btn acento" data-a="ms-criar">Criar mesas</button></div>
        <p class="sub" style="margin-top:12px">Sem mesas? Use “Comanda sem mesa” para balcão, bar ou retirada.</p></div>`;
    }
    const ocupadas = M.mesas.filter((m) => m.comanda);
    const abertas = [...ocupadas.map((m) => m.comanda), ...M.avulsas];
    const emAberto = r2(abertas.reduce((a, c) => a + c.total, 0));
    const prontos = abertas.filter((c) => c.prontos).length;
    html += `<div class="ms-resumo"><span><b>${ocupadas.length}</b> de ${M.mesas.length} ${M.mesas.length === 1 ? "mesa ocupada" : "mesas ocupadas"}</span>${M.avulsas.length ? `<span><b>${M.avulsas.length}</b> sem mesa</span>` : ""}<span>Em aberto <b class="num">${fmt(emAberto)}</b></span>${prontos ? `<span class="s-pronto">🔔 ${prontos === 1 ? "1 mesa com prato pronto" : `${prontos} mesas com prato pronto`}</span>` : ""}</div>`;
    const esquecidas = abertas.filter(mesaEsquecida).length;
    if (esquecidas) html += `<p class="aviso alerta" role="alert" style="margin:0 0 12px">⚠ ${esquecidas === 1 ? "1 conta está aberta" : `${esquecidas} contas estão abertas`} há mais de 6 horas (marcadas em vermelho). Confira se já foram pagas e feche ou cancele.</p>`;
    html += `<div class="mesas-grade">${M.mesas.map((m) => mesaTile(m, m.comanda)).join("")}</div>`;
    if (M.avulsas.length) html += `<h2 class="secao" style="margin-top:22px">Comandas sem mesa</h2><div class="mesas-grade">${M.avulsas.map((c) => mesaTile(null, c)).join("")}</div>`;
    html += `<p class="sub ms-legenda"><i class="leg livre"></i> livre <i class="leg ocupada"></i> ocupada <i class="leg conta"></i> pediu a conta${M.taxaServico ? ` · taxa de serviço ${String(M.taxaServico).replace(".", ",")}%` : ""}</p>`;
    return html;
  }
  // editar a lista de mesas e a taxa de serviço
  let MSE = null;
  async function abrirEditarMesas() {
    if (!S.mapa) { try { S.mapa = await api("GET", "/estoque/mesas"); } catch (e) { toast(esc(e.message), "erro"); return; } }
    MSE = { mesas: (S.mapa ? S.mapa.mesas : []).map((m) => ({ id: m.id, nome: m.nome })), taxa: String(S.pdv.taxaServico ?? 10).replace(".", ","), erro: "", salvando: false };
    abrirModal("Mesas e taxa de serviço", editarMesasHtml(), { aoFechar: () => { MSE = null; } });
  }
  function editarMesasHtml() {
    const e = MSE;
    return `<label class="campo" style="max-width:240px"><span>Taxa de serviço (%)</span><input data-mse-taxa value="${esc(e.taxa)}" inputmode="decimal" /><small>Somada na conta das mesas (0 = sem taxa). Dá para tirar na hora de fechar.</small></label>
      <div class="bloco"><div class="linha entre"><p class="bloco-titulo" style="margin:0">Mesas (${e.mesas.length})</p><button class="btn mini claro" data-a="mse-add">+ Mesa</button></div>
      <div class="mse-lista">${e.mesas.map((m, i) => `<div class="mse-linha"><input class="inp" data-mse="${i}" value="${esc(m.nome)}" maxlength="30" aria-label="Nome da mesa" /><button class="cart-x" data-a="mse-tirar" data-i="${i}" aria-label="Tirar">×</button></div>`).join("")}</div></div>
      ${e.erro ? `<p class="erro-form">${esc(e.erro)}</p>` : ""}
      <div class="modal-rodape"><button class="btn claro" data-a="fechar-modal">Cancelar</button><button class="btn acento" data-a="mse-salvar" ${e.salvando ? "disabled" : ""}>${e.salvando ? "Salvando…" : "Salvar"}</button></div>`;
  }
  async function salvarMesasTela() {
    const e = MSE; e.erro = ""; e.salvando = true; corpoModal(editarMesasHtml());
    try {
      await api("PUT", "/estoque/mesas", { mesas: e.mesas.filter((m) => m.nome.trim() || m.id) });
      S.pdv = (await api("PUT", "/estoque/pdv", { taxaServico: numOu(e.taxa, 0) })).pdv;
      fecharModal(); toast("Mesas salvas.", "ok"); await carregarMesas(); if (S.tab === "config") render();
    } catch (err) { e.salvando = false; e.erro = err.message; corpoModal(editarMesasHtml()); }
  }
  function abrirComandaAvulsa() {
    abrirModal("Comanda sem mesa", `<p class="sub" style="margin-bottom:12px">Para balcão, bar, retirada… Dê um nome para achar depois.</p>
      <div class="campos"><label class="campo"><span>Nome ou número</span><input id="ca-nome" maxlength="40" placeholder="Ex.: Comanda 12, João, Balcão" autofocus /></label>
      <label class="campo"><span>Pessoas</span><input id="ca-pessoas" inputmode="numeric" value="1" /></label></div>
      <div class="modal-rodape"><button class="btn claro" data-a="fechar-modal">Cancelar</button><button class="btn acento" data-a="ca-ok">Abrir comanda</button></div>`);
  }

  /* ---------- a comanda (janela) ---------- */
  let CM = null;
  function abrirComandaTela(id, dados = null, view = "conta") {
    CM = { id, dados, view, busca: "", cat: "", rascunho: [], item: null, semTaxa: false, desconto: "", erro: "", salvando: false, cliRes: null };
    abrirModal("Comanda", dados ? comandaHtml() : `<p class="sub">Carregando…</p>`, { largo: true, aoFechar: () => { CM = null; if (S.tab === "mesas") carregarMesas().catch(() => {}); } });
    tituloComanda();
    if (!dados) api("GET", `/estoque/comandas/${id}`).then((r) => { if (CM && CM.id === id) { CM.dados = r.comanda; redesenharComanda(); } }).catch((e) => corpoModal(`<p class="erro-form">${esc(e.message)}</p>`));
  }
  function tituloComanda() {
    const t = $(".modal-titulo"); if (!t || !CM || !CM.dados) return;
    t.textContent = `${CM.dados.rotulo}${CM.dados.status === "conta" ? " · pediu a conta" : ""}`;
  }
  function redesenharComanda(manterRolagem = true) {
    if (!CM) return;
    const cx = $(".modal-caixa"); const y = cx ? cx.scrollTop : 0;
    corpoModal(comandaHtml()); tituloComanda();
    if (cx && manterRolagem) cx.scrollTop = y; else if (cx) cx.scrollTop = 0;
  }
  function totaisComanda() {
    const c = CM.dados;
    const sub = c.subtotal; const taxa = CM.semTaxa ? 0 : c.taxaServico;
    const desc = Math.min(sub, r2(Math.max(0, numOu(CM.desconto))));
    return { sub, taxa, desc, total: r2(sub - desc + taxa), porPessoa: c.pessoas > 1 ? r2((sub - desc + taxa) / c.pessoas) : null };
  }
  function situacaoItem(i, tickets) {
    if (i.cancelado) return ["cancelado", "cancelado"];
    if (!i.enviadoEm) return ["pend", "a enviar"];
    if (!i.cozinha) return ["ok", "lançado"];
    const t = tickets.get(i.envioId);
    if (!t) return ["ok", "enviado"];
    return { novo: ["fila", "na fila"], preparando: ["prep", "preparando"], pronto: ["pronto", "🔔 pronto"], entregue: ["ok", "entregue"] }[t.status];
  }
  function comandaHtml() {
    const c = CM.dados;
    if (!c) return `<p class="sub">Carregando…</p>`;
    if (CM.view === "add") return comandaAddHtml();
    if (CM.view === "item") return comandaItemHtml();
    if (CM.view === "mesa") return comandaMesaHtml();
    if (CM.view === "cliente") return comandaClienteHtml();
    const tickets = new Map(c.tickets.map((t) => [t.id, t]));
    const prontos = c.tickets.filter((t) => t.status === "pronto");
    const t = totaisComanda();
    const itens = c.itens.map((i) => {
      const [cls, rot] = situacaoItem(i, tickets);
      return `<li class="${i.cancelado ? "cancelado" : ""}">
        <span class="cm-q num">${fmtN(i.qtd)}×</span>
        <span class="cm-n"><b>${esc(i.nome)}</b>${i.opcoes.length ? `<small>${i.opcoes.map(esc).join(", ")}</small>` : ""}${i.obs ? `<small class="cm-obs">⚠ ${esc(i.obs)}</small>` : ""}${i.cancelado && i.canceladoMotivo ? `<small>motivo: ${esc(i.canceladoMotivo)}</small>` : ""}</span>
        <span class="cm-st st-${cls}">${rot}</span>
        <b class="num cm-v">${fmt(i.qtd * i.unit)}</b>
        ${i.cancelado ? `<span></span>` : `<button class="cart-x" data-a="cm-tirar" data-id="${i.id}" aria-label="Tirar ${esc(i.nome)}">×</button>`}
      </li>`;
    }).join("");
    return `<div class="cm-topo">
        <span class="sub">Aberta há ${tempoTxt(c.abertaEm)}${c.abertaPor ? ` por ${esc(c.abertaPor)}` : ""}</span>
        <span class="cm-pessoas"><span class="sub">Pessoas</span><span class="qtd"><button type="button" data-a="cm-pessoas" data-d="-1" aria-label="Menos">−</button><b class="num">${c.pessoas}</b><button type="button" data-a="cm-pessoas" data-d="1" aria-label="Mais">+</button></span></span>
      </div>
      ${prontos.length ? `<div class="faixa ok-faixa"><span>🔔 <b>${prontos.length === 1 ? "Pedido pronto" : `${prontos.length} pedidos prontos`}</b> na cozinha.</span><button class="btn mini acento" data-a="cm-entregue">Já levei na mesa</button></div>` : ""}
      ${c.itens.length ? `<ul class="cm-itens">${itens}</ul>` : `<div class="vazio" style="padding:18px 0"><b>Nada lançado ainda</b>Toque em “Adicionar itens”.</div>`}
      <button class="btn acento grande" data-a="cm-add" style="margin-top:12px">+ Adicionar itens</button>
      ${c.pendentes ? `<button class="btn grande" data-a="cm-enviar" style="margin-top:8px">Enviar para a cozinha (${c.pendentes})</button>` : ""}
      <div class="cm-totais">
        <div class="cart-linha"><span>Subtotal</span><span class="num">${fmt(t.sub)}</span></div>
        ${c.taxaServicoPct ? `<label class="cart-linha check-linha"><span><input type="checkbox" data-cm-taxa ${CM.semTaxa ? "" : "checked"} /> Taxa de serviço (${String(c.taxaServicoPct).replace(".", ",")}%)</span><span class="num">${fmt(t.taxa)}</span></label>` : ""}
        ${ehGarcom() ? "" : `<div class="cart-linha"><span>Desconto (R$)</span><input class="inp cm-desc" data-cm-desc value="${esc(CM.desconto)}" inputmode="decimal" placeholder="0,00" /></div>`}
        <div class="cart-linha total"><span>Total</span><span class="num" id="cm-total">${fmt(t.total)}</span></div>
        ${t.porPessoa ? `<div class="cart-linha"><span class="sub">Por pessoa (${c.pessoas})</span><span class="num sub" id="cm-pp">${fmt(t.porPessoa)}</span></div>` : ""}
      </div>
      <div class="cm-cli">${c.cliente ? `Cliente: <b>${esc(c.cliente.nome)}</b> <button class="link" data-a="cm-cliente">trocar</button>` : `<button class="link" data-a="cm-cliente">+ Cliente (fidelidade ou fiado)</button>`}</div>
      <div class="cm-acoes">
        <button class="btn claro" data-a="cm-conta">${c.status === "conta" ? "Voltar a atender" : "Pediu a conta"}</button>
        <button class="btn claro" data-a="cm-trocar-mesa">Trocar de mesa</button>
        <button class="btn claro" data-a="cm-imprimir">Imprimir conta</button>
        <button class="btn perigo" data-a="cm-cancelar">Cancelar comanda</button>
      </div>
      ${CM.erro ? `<p class="erro-form">${esc(CM.erro)}</p>` : ""}
      ${ehGarcom() ? `<p class="sub" style="margin-top:12px;text-align:center">Quem fecha a conta é o caixa.</p>` : `<button class="btn acento grande" data-a="cm-fechar" style="margin-top:14px" ${c.itens.some((i) => !i.cancelado) ? "" : "disabled"}>Fechar a conta · ${fmt(t.total)}</button>`}`;
  }
  // escolher produtos (com rascunho do pedido antes de mandar)
  function comandaAddHtml() {
    const cats = [...new Set(ativos().map((p) => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const rasc = CM.rascunho;
    const totalR = r2(rasc.reduce((a, i) => a + i.qtd * i.unit, 0));
    return `<div class="cm-add">
      <button class="link" data-a="cm-voltar">← Voltar para a conta</button>
      <input class="inp" data-cm-busca value="${esc(CM.busca)}" placeholder="Buscar no cardápio" autocomplete="off" style="margin-top:10px" />
      ${cats.length > 1 ? `<div class="chips" style="margin-top:10px"><button class="chip ${!CM.cat ? "ativo" : ""}" data-a="cm-cat" data-v="">Todos</button>${cats.map((c) => `<button class="chip ${CM.cat === c ? "ativo" : ""}" data-a="cm-cat" data-v="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : ""}
      <div class="cm-prods" id="cm-prods">${comandaProdutosHtml()}</div>
      ${rasc.length ? `<div class="cm-rascunho">
        <p class="bloco-titulo">Pedido para enviar</p>
        <ul class="cm-itens">${rasc.map((i, n) => `<li><span class="cm-q num">${fmtN(i.qtd)}×</span><span class="cm-n"><b>${esc(i.nome)}</b>${i.opcoesNomes.length ? `<small>${i.opcoesNomes.map(esc).join(", ")}</small>` : ""}${i.obs ? `<small class="cm-obs">⚠ ${esc(i.obs)}</small>` : ""}</span><button class="link" data-a="cm-r-obs" data-i="${n}">obs.</button><b class="num cm-v">${fmt(i.qtd * i.unit)}</b><button class="cart-x" data-a="cm-r-tirar" data-i="${n}" aria-label="Tirar">×</button></li>`).join("")}</ul>
        <button class="btn acento grande" data-a="cm-r-enviar" ${CM.salvando ? "disabled" : ""}>${CM.salvando ? "Enviando…" : `Enviar pedido · ${fmt(totalR)}`}</button>
        <button class="link" data-a="cm-r-lancar" style="margin:8px auto 0;display:block">Só lançar na conta, sem mandar para a cozinha</button>
      </div>` : ""}
      ${CM.erro ? `<p class="erro-form">${esc(CM.erro)}</p>` : ""}
    </div>`;
  }
  function comandaProdutosHtml() {
    const b = CM.busca.trim().toLowerCase();
    const lista = ativos().filter((p) => (!CM.cat || p.categoria === CM.cat) && (!b || p.nome.toLowerCase().includes(b) || p.categoria.toLowerCase().includes(b)));
    if (!lista.length) return `<p class="sub" style="padding:14px 0">Nada encontrado.</p>`;
    return lista.map((p) => {
      const vs = p.variacoes.filter((v) => v.ativo);
      const preco = vs.length ? Math.min(...vs.map((v) => v.precoFinal)) : p.preco;
      const noRasc = CM.rascunho.filter((i) => i.produtoId === p.id).reduce((a, i) => a + i.qtd, 0);
      return `<button type="button" class="cm-prod ${noRasc ? "no-pedido" : ""}" data-a="cm-prod" data-id="${p.id}"><span class="cm-prod-nome">${esc(p.nome)}</span><span class="cm-prod-preco num">${vs.length ? "a partir de " : ""}${fmt(preco)}</span>${p.situacao === "acabou" ? `<span class="pdv-est acabou">sem estoque</span>` : ""}${noRasc ? `<i class="cm-prod-qtd">${fmtN(noRasc)}</i>` : ""}</button>`;
    }).join("");
  }
  // um item com variação, adicionais, quantidade e observação
  function abrirItemComanda(p) {
    const vs = p.variacoes.filter((v) => v.ativo);
    CM.item = { p, variacaoId: vs.length === 1 ? vs[0].id : null, sel: {}, qtd: 1, obs: "", erro: "" };
    (p.opcoes || []).forEach((g, gi) => { if (g.tipo === "um" && g.escolhas.length === 1) CM.item.sel[gi] = [0]; });
    CM.view = "item"; redesenharComanda(false);
  }
  function precoItem(it) {
    const v = it.p.variacoes.find((x) => x.id === it.variacaoId);
    let u = v ? v.precoFinal : it.p.preco;
    (it.p.opcoes || []).forEach((g, gi) => (it.sel[gi] || []).forEach((x) => { u += g.escolhas[x] ? g.escolhas[x].preco : 0; }));
    return r2(u);
  }
  function comandaItemHtml() {
    const it = CM.item; const p = it.p;
    const vs = p.variacoes.filter((v) => v.ativo);
    return `<div class="cm-item">
      <button class="link" data-a="cm-voltar-add">← Voltar</button>
      <h3 class="cm-item-nome">${esc(p.nome)}</h3>${p.descricao ? `<p class="sub">${esc(p.descricao)}</p>` : ""}
      ${vs.length ? `<p class="bloco-titulo">Tamanho / tipo</p><div class="chips">${vs.map((v) => `<button class="chip ${it.variacaoId === v.id ? "ativo" : ""}" data-a="cm-var" data-v="${v.id}">${esc(v.nome)} · ${fmt(v.precoFinal)}</button>`).join("")}</div>` : ""}
      ${(p.opcoes || []).map((g, gi) => `<p class="bloco-titulo">${esc(g.nome)} <small class="sub">${g.tipo === "um" ? "escolha 1" : "opcional"}</small></p>
        <div class="chips">${g.escolhas.map((e, x) => `<button class="chip ${(it.sel[gi] || []).includes(x) ? "ativo" : ""}" data-a="cm-op" data-g="${gi}" data-x="${x}">${esc(e.nome)}${e.preco ? ` +${fmt(e.preco)}` : ""}</button>`).join("")}</div>`).join("")}
      <p class="bloco-titulo">Observação</p>
      <input class="inp" data-cm-obs value="${esc(it.obs)}" maxlength="120" placeholder="Ex.: sem cebola, bem passado" />
      <div class="chips" style="margin-top:8px">${OBS_RAPIDAS.map((o) => `<button class="chip mini-chip" data-a="cm-obs-rapida" data-v="${esc(o)}">${esc(o)}</button>`).join("")}</div>
      <div class="cm-item-rodape">
        <span class="qtd"><button type="button" data-a="cm-item-qtd" data-d="-1" aria-label="Menos">−</button><b class="num">${it.qtd}</b><button type="button" data-a="cm-item-qtd" data-d="1" aria-label="Mais">+</button></span>
        <button class="btn acento grande" data-a="cm-item-ok">Adicionar · ${fmt(precoItem(it) * it.qtd)}</button>
      </div>
      ${it.erro ? `<p class="erro-form">${esc(it.erro)}</p>` : ""}
    </div>`;
  }
  function confirmarItemComanda() {
    const it = CM.item; const p = it.p;
    if (p.variacoes.filter((v) => v.ativo).length && !it.variacaoId) { it.erro = "Escolha o tamanho / tipo."; redesenharComanda(); return; }
    const faltou = (p.opcoes || []).find((g, gi) => g.tipo === "um" && (it.sel[gi] || []).length !== 1);
    if (faltou) { it.erro = `Escolha uma opção em “${faltou.nome}”.`; redesenharComanda(); return; }
    const v = p.variacoes.find((x) => x.id === it.variacaoId);
    const nomes = []; (p.opcoes || []).forEach((g, gi) => (it.sel[gi] || []).forEach((x) => nomes.push(g.escolhas[x].nome)));
    CM.rascunho.push({ produtoId: p.id, variacaoId: it.variacaoId, nome: v ? nomeComVar(p.nome, v) : p.nome, qtd: it.qtd, unit: precoItem(it), opcoes: JSON.parse(JSON.stringify(it.sel)), opcoesNomes: nomes, obs: it.obs.trim() });
    CM.item = null; CM.view = "add"; redesenharComanda(false);
  }
  function adicionarRapido(p) {
    const ja = CM.rascunho.find((i) => i.produtoId === p.id && !i.variacaoId && !i.obs && !i.opcoesNomes.length);
    if (ja) ja.qtd += 1; else CM.rascunho.push({ produtoId: p.id, variacaoId: null, nome: p.nome, qtd: 1, unit: p.preco, opcoes: {}, opcoesNomes: [], obs: "" });
    redesenharComanda();
  }
  async function mandarRascunho(enviar) {
    if (!CM.rascunho.length || CM.salvando) return;
    CM.salvando = true; CM.erro = ""; redesenharComanda();
    try {
      const r = await api("POST", `/estoque/comandas/${CM.id}/itens`, { enviar, itens: CM.rascunho.map((i) => ({ produtoId: i.produtoId, variacaoId: i.variacaoId, qtd: i.qtd, opcoes: i.opcoes, obs: i.obs })) });
      CM.dados = r.comanda; CM.rascunho = []; CM.view = "conta"; CM.salvando = false; redesenharComanda(false);
      toast(enviar ? "Pedido enviado para a cozinha." : "Lançado na conta.", "ok");
    } catch (e) { if (CM) { CM.salvando = false; CM.erro = e.message; redesenharComanda(); } }
  }
  function comandaMesaHtml() {
    const livres = (S.mapa ? S.mapa.mesas : []).filter((m) => !m.comanda);
    return `<button class="link" data-a="cm-voltar">← Voltar para a conta</button>
      <p class="bloco-titulo" style="margin-top:12px">Levar a conta para qual mesa?</p>
      ${livres.length ? `<div class="mesas-grade mini">${livres.map((m) => `<button type="button" class="mesa livre" data-a="cm-mesa-ir" data-id="${m.id}"><span class="mesa-nome">${esc(m.nome)}</span><span class="mesa-info">livre</span></button>`).join("")}</div>` : `<p class="sub">Nenhuma mesa livre agora.</p>`}
      ${CM.dados.mesaId ? `<button class="btn claro" data-a="cm-mesa-ir" data-id="" style="margin-top:14px">Tirar da mesa (vira comanda sem mesa)</button>` : ""}
      ${CM.erro ? `<p class="erro-form">${esc(CM.erro)}</p>` : ""}`;
  }
  function comandaClienteHtml() {
    const res = CM.cliRes;
    return `<button class="link" data-a="cm-voltar">← Voltar para a conta</button>
      <p class="sub" style="margin:10px 0">Ligue a conta a um cliente para contar no programa de fidelidade ou para deixar no fiado.</p>
      <input class="inp" data-cm-cli placeholder="Nome ou telefone" autocomplete="off" autofocus />
      <div class="opcoes" id="cm-cli-res" style="margin-top:10px">${res ? res.map((c) => `<button type="button" class="opcao" data-a="cm-cli-escolher" data-id="${c.id}"><span style="flex:1"><b>${esc(c.nome || "Sem nome")}</b><small>${c.telefone ? telFmt(c.telefone) : ""}${c.compras ? ` · ${c.compras} compras` : ""}</small></span></button>`).join("") : ""}</div>
      <div class="linha" style="margin-top:12px"><button class="btn claro mini" data-a="cm-cli-novo">+ Cadastrar cliente</button>${CM.dados.cliente ? `<button class="btn claro mini" data-a="cm-cli-escolher" data-id="">Tirar o cliente</button>` : ""}</div>
      ${CM.erro ? `<p class="erro-form">${esc(CM.erro)}</p>` : ""}`;
  }
  async function atualizarComanda(corpo, msg = "") {
    try {
      const r = await api("PUT", `/estoque/comandas/${CM.id}`, corpo);
      if (!CM) return; CM.dados = r.comanda; CM.erro = ""; CM.view = "conta"; redesenharComanda(false); if (msg) toast(msg, "ok");
    } catch (e) { if (CM) { CM.erro = e.message; redesenharComanda(); } }
  }
  // pré-conta para levar à mesa (não é recibo)
  function imprimirConta() {
    const c = CM.dados; const t = totaisComanda();
    const linhas = [`*${S.negocio.nome || "Conta"}*`, `${c.rotulo} · ${new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`, ""];
    c.itens.filter((i) => !i.cancelado).forEach((i) => linhas.push(`${fmtN(i.qtd)}x ${i.nome} — ${fmt(i.qtd * i.unit)}`));
    linhas.push("", `Subtotal: ${fmt(t.sub)}`);
    if (t.taxa) linhas.push(`Taxa de serviço (${String(c.taxaServicoPct).replace(".", ",")}%): ${fmt(t.taxa)}`);
    if (t.desc) linhas.push(`Desconto: − ${fmt(t.desc)}`);
    linhas.push(`*Total: ${fmt(t.total)}*`);
    if (t.porPessoa) linhas.push(`Por pessoa (${c.pessoas}): ${fmt(t.porPessoa)}`);
    linhas.push("", "Confira os itens antes de pagar.", "Documento sem valor fiscal.");
    imprimir80(`Conta ${c.rotulo}`, linhas.join("\n"));
  }
  async function fecharContaComanda() {
    const c = CM.dados;
    if (caixaBloqueia()) { toast("Abra o caixa para fechar a conta.", "erro"); fecharModal(); irPara("caixa"); return; }
    if (c.pendentes && !(await confirmarAcao({ mensagem: `${c.pendentes === 1 ? "1 item não foi" : `${c.pendentes} itens não foram`} para a cozinha. Fechar a conta mesmo assim?`, botao: "Fechar a conta", cancelar: "Voltar", perigo: false, sempre: true }))) return;
    const t = totaisComanda();
    const comanda = { id: c.id, semTaxa: CM.semTaxa, desconto: t.desc, pessoas: c.pessoas, rotulo: c.rotulo };
    CM = null;
    CB = { total: t.total, pagos: [], meio: "dinheiro", valor: "", erro: "", salvando: false, comanda, cli: c.cliente };
    abrirModal(`Fechar a conta · ${c.rotulo}`, cobrancaHtml(), { aoFechar: () => { const antes = CB; CB = null; if (antes && antes.comanda) abrirComandaTela(antes.comanda.id); } });
  }

  /* ---------- cozinha ---------- */
  async function carregarCozinha() {
    const k = await api("GET", "/estoque/cozinha");
    const novos = k.tickets.filter((t) => t.status === "novo").map((t) => t.id);
    if (KD.vistos && novos.some((id) => !KD.vistos.has(id))) { bip(2); if (S.tab !== "cozinha") toast("🍳 Pedido novo na cozinha."); }
    KD.vistos = new Set([...(KD.vistos || []), ...novos]);
    const mudou = !S.cozinha || JSON.stringify(k.tickets) !== JSON.stringify(S.cozinha.tickets) || JSON.stringify(k.entregues) !== JSON.stringify(S.cozinha.entregues);
    S.cozinha = k;
    if (mudou && S.tab === "cozinha" && !modalAberto()) render();
  }
  function ticketHtml(t) {
    const prox = { novo: ["preparando", "Começar"], preparando: ["pronto", "Pronto ✓"], pronto: ["entregue", "Entregue"] }[t.status];
    const volta = { preparando: "novo", pronto: "preparando" }[t.status];
    return `<article class="ticket st-${t.status}">
      <header><b class="ticket-num">#${t.numero}</b><span class="ticket-origem">${esc(t.origem)}</span><span class="ticket-tempo" data-desde="${esc(t.criadoEm)}">${relogio(t.criadoEm)}</span></header>
      <ul>${t.itens.map((i) => `<li class="${i.cancelado ? "cancelado" : ""}"><b>${fmtN(i.qtd)}×</b> ${esc(i.nome)}${i.opcoes && i.opcoes.length ? `<small>${i.opcoes.map(esc).join(" · ")}</small>` : ""}${i.obs ? `<em>⚠ ${esc(i.obs)}</em>` : ""}${i.cancelado ? `<em class="canc">CANCELADO${i.motivo ? ` — ${esc(i.motivo)}` : ""}</em>` : ""}</li>`).join("")}</ul>
      <footer>${volta ? `<button class="btn mini claro" data-a="kd-status" data-id="${t.id}" data-v="${volta}" title="Voltar uma etapa" aria-label="Voltar uma etapa">↶</button>` : ""}<button class="btn mini claro" data-a="kd-imprimir" data-id="${t.id}">Imprimir</button><button class="btn acento kd-prox" data-a="kd-status" data-id="${t.id}" data-v="${prox[0]}">${prox[1]}</button></footer>
    </article>`;
  }
  function telaCozinha() {
    const k = S.cozinha;
    let html = `<div class="topo"><div><h1 class="titulo">Cozinha</h1><p class="sub">Os pedidos das mesas e do cardápio chegam sozinhos. Toque para avançar: novo → preparando → pronto → entregue.</p></div>
      <div class="linha"><button class="btn claro" data-a="kd-som">${KD.som ? "🔔 Som ligado" : "🔕 Ligar o som"}</button><button class="btn claro so-desk" data-a="kd-tela-cheia">Tela cheia</button></div></div>`;
    if (!k) return html + carregandoHtml;
    const col = (st) => k.tickets.filter((t) => t.status === st);
    const colunas = [["novo", "Novos"], ["preparando", "Preparando"], ["pronto", "Prontos"]];
    html += `<div class="chips kds-abas so-cel">${colunas.map(([s, t]) => `<button class="chip ${KD.filtro === s ? "ativo" : ""}" data-a="kd-filtro" data-v="${s}">${t} · ${col(s).length}</button>`).join("")}</div>`;
    html += `<div class="kds">${colunas.map(([s, t]) => `<section class="kds-col ${KD.filtro === s ? "atual" : ""}"><h2 class="kds-col-tit">${t} <span>${col(s).length}</span></h2>${col(s).map(ticketHtml).join("") || `<p class="kds-vazio">${s === "novo" ? "Nenhum pedido esperando." : "—"}</p>`}</section>`).join("")}</div>`;
    if (k.entregues.length) html += `<details class="kds-entregues"><summary>Entregues nas últimas horas (${k.entregues.length})</summary>${k.entregues.map((t) => `<div class="kds-ent"><span><b>#${t.numero}</b> · ${esc(t.origem)}</span><span class="sub">${t.itens.filter((i) => !i.cancelado).map((i) => `${fmtN(i.qtd)}× ${esc(i.nome)}`).join(", ")}</span><button class="btn mini claro" data-a="kd-status" data-id="${t.id}" data-v="pronto">Voltar</button></div>`).join("")}</details>`;
    return html;
  }
  function imprimirTicket(t) {
    const linhas = [`*COZINHA #${t.numero}*`, `*${t.origem}*`, new Date(t.criadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), ""];
    t.itens.forEach((i) => { linhas.push(`${i.cancelado ? "[CANCELADO] " : ""}*${fmtN(i.qtd)}x ${i.nome}*`); if (i.opcoes && i.opcoes.length) linhas.push(`   ${i.opcoes.join(", ")}`); if (i.obs) linhas.push(`   >> ${i.obs.toUpperCase()}`); });
    imprimir80(`Cozinha #${t.numero}`, linhas.join("\n"));
  }
  // relógios dos pedidos da cozinha (a cada segundo) e atualização ao vivo (a cada 5 s)
  setInterval(() => {
    document.querySelectorAll(".ticket-tempo[data-desde]").forEach((el) => {
      const m = minutosDesde(el.dataset.desde);
      el.textContent = relogio(el.dataset.desde);
      el.classList.toggle("atencao", m >= 10 && m < 20); el.classList.toggle("atrasado", m >= 20);
    });
  }, 1000);
  let vivoRodando = false;
  async function atualizarAoVivo() {
    if (vivoRodando || document.hidden || !S.negocio || !restaurante() || !tem("restaurante")) return;
    vivoRodando = true;
    try {
      if (S.tab === "cozinha") await carregarCozinha();
      else if (S.tab === "mesas") { await carregarMesas(); if (KD.som) await carregarCozinha(); }
      else if (KD.som && KD.vistos) await carregarCozinha();
    } catch (e) { /* sem internet: tenta de novo */ }
    vivoRodando = false;
  }
  setInterval(atualizarAoVivo, 5000);

  /* ---------- cliques de mesas, comanda e cozinha ---------- */
  document.addEventListener("click", async (ev) => {
    const el = ev.target.closest("[data-a]");
    if (!el) return;
    const a = el.dataset.a; const id = el.dataset.id;
    if (!/^(ms-|mse-|ca-|cm-|kd-|pedido-cozinha|baixar-xlsx|cb-pessoa)/.test(a)) return;
    switch (a) {
      case "ms-abrir": abrirComandaTela(id); break;
      case "ms-nova": {
        const mesa = S.mapa && S.mapa.mesas ? S.mapa.mesas.find((m) => m.id === id) : null;
        if (!(await confirmarAcao({ titulo: "Abrir comanda?", mensagem: `Abrir uma comanda na ${mesa ? mesa.nome : "mesa"}? Ela fica ocupada até a conta ser fechada.`, botao: "Abrir comanda", cancelar: "Voltar", perigo: false, chave: "abrir-comanda" }))) break;
        el.disabled = true;
        try { const r = await api("POST", "/estoque/comandas", { mesaId: id }); abrirComandaTela(r.comanda.id, r.comanda, r.comanda.itens.length ? "conta" : "add"); }
        catch (e) { toast(esc(e.message), "erro"); }
        el.disabled = false; break;
      }
      case "ms-avulsa": abrirComandaAvulsa(); break;
      case "ca-ok": {
        try { const r = await api("POST", "/estoque/comandas", { rotulo: $("#ca-nome").value, pessoas: numOu($("#ca-pessoas").value, 1) }); fecharModal(); abrirComandaTela(r.comanda.id, r.comanda, "add"); }
        catch (e) { toast(esc(e.message), "erro"); }
        break;
      }
      case "ms-criar": {
        const n = Math.max(1, Math.min(200, Math.round(numOu($("#ms-qtd") && $("#ms-qtd").value, 10))));
        try { await api("PUT", "/estoque/mesas", { mesas: Array.from({ length: n }, (_, i) => ({ nome: `Mesa ${i + 1}` })) }); toast(`${n} mesas criadas.`, "ok"); await carregarMesas(); render(); }
        catch (e) { toast(esc(e.message), "erro"); }
        break;
      }
      case "ms-editar": abrirEditarMesas(); break;
      case "mse-add": MSE.mesas.push({ id: null, nome: `Mesa ${MSE.mesas.length + 1}` }); corpoModal(editarMesasHtml()); break;
      case "mse-tirar": MSE.mesas.splice(Number(el.dataset.i), 1); corpoModal(editarMesasHtml()); break;
      case "mse-salvar": salvarMesasTela(); break;
      // comanda
      case "cm-add": CM.view = "add"; CM.erro = ""; redesenharComanda(false); setTimeout(() => { const b = $("[data-cm-busca]"); if (b && !ehCelular()) b.focus(); }, 30); break;
      case "cm-voltar": CM.view = "conta"; CM.erro = ""; redesenharComanda(false); break;
      case "cm-voltar-add": CM.item = null; CM.view = "add"; redesenharComanda(false); break;
      case "cm-cat": CM.cat = el.dataset.v; redesenharComanda(); break;
      case "cm-prod": {
        const p = S.produtos.find((x) => x.id === id); if (!p) break;
        if (p.variacoes.some((v) => v.ativo) || (p.opcoes || []).length) abrirItemComanda(p); else adicionarRapido(p);
        break;
      }
      case "cm-var": CM.item.variacaoId = el.dataset.v; CM.item.erro = ""; redesenharComanda(); break;
      case "cm-op": {
        const gi = Number(el.dataset.g); const x = Number(el.dataset.x); const g = CM.item.p.opcoes[gi];
        const atual = CM.item.sel[gi] || [];
        CM.item.sel[gi] = g.tipo === "um" ? [x] : atual.includes(x) ? atual.filter((y) => y !== x) : [...atual, x];
        CM.item.erro = ""; redesenharComanda(); break;
      }
      case "cm-obs-rapida": { const o = CM.item.obs.trim(); CM.item.obs = o ? (o.toLowerCase().includes(el.dataset.v) ? o : `${o}, ${el.dataset.v}`) : el.dataset.v; redesenharComanda(); break; }
      case "cm-item-qtd": CM.item.qtd = Math.max(1, Math.min(99, CM.item.qtd + Number(el.dataset.d))); redesenharComanda(); break;
      case "cm-item-ok": confirmarItemComanda(); break;
      case "cm-r-tirar": CM.rascunho.splice(Number(el.dataset.i), 1); redesenharComanda(); break;
      case "cm-r-obs": { const i = CM.rascunho[Number(el.dataset.i)]; const o = window.prompt(`Observação para ${i.nome}:`, i.obs); if (o !== null) { i.obs = o.trim().slice(0, 120); redesenharComanda(); } break; }
      case "cm-r-enviar": mandarRascunho(true); break;
      case "cm-r-lancar": mandarRascunho(false); break;
      case "cm-enviar": {
        try { const r = await api("POST", `/estoque/comandas/${CM.id}/enviar`); CM.dados = r.comanda; redesenharComanda(); toast("Enviado para a cozinha.", "ok"); } catch (e) { toast(esc(e.message), "erro"); }
        break;
      }
      case "cm-tirar": {
        const it = CM.dados.itens.find((i) => i.id === id); if (!it) break;
        let motivo = "";
        if (it.enviadoEm) { motivo = window.prompt(`“${it.nome}” já foi para a cozinha. Motivo do cancelamento (a cozinha vai ver):`, "cliente desistiu"); if (motivo === null) break; }
        else if (!(await confirmarAcao({ mensagem: `Tirar “${it.nome}” da conta?`, botao: "Tirar", cancelar: "Voltar", chave: "item-comanda" }))) break;
        try { const r = await api("DELETE", `/estoque/comandas/${CM.id}/itens/${id}`, { motivo }); if (CM) { CM.dados = r.comanda; redesenharComanda(); } } catch (e) { toast(esc(e.message), "erro"); }
        break;
      }
      case "cm-pessoas": atualizarComanda({ pessoas: Math.max(1, Math.min(99, CM.dados.pessoas + Number(el.dataset.d))) }); break;
      case "cm-conta": atualizarComanda({ status: CM.dados.status === "conta" ? "aberta" : "conta" }, CM.dados.status === "conta" ? "" : "Marcada: pediu a conta."); break;
      case "cm-trocar-mesa": CM.view = "mesa"; CM.erro = ""; if (!S.mapa) { try { S.mapa = await api("GET", "/estoque/mesas"); } catch (e) { /* segue */ } } redesenharComanda(false); break;
      case "cm-mesa-ir": atualizarComanda({ mesaId: id || null }, "Conta trocada de mesa."); break;
      case "cm-cliente": CM.view = "cliente"; CM.cliRes = null; CM.erro = ""; redesenharComanda(false); setTimeout(() => { const i = $("[data-cm-cli]"); if (i) i.focus(); }, 30); break;
      case "cm-cli-escolher": atualizarComanda({ clienteId: id || null }); break;
      case "cm-cli-novo": { const cid = CM.id; const prefill = ($("[data-cm-cli]") || {}).value || ""; novoClienteModal(prefill, async (c) => { abrirComandaTela(cid); try { const r = await api("PUT", `/estoque/comandas/${cid}`, { clienteId: c.id }); if (CM && CM.id === cid) { CM.dados = r.comanda; redesenharComanda(); } } catch (e) { toast(esc(e.message), "erro"); } }); break; }
      case "cm-entregue": {
        try { for (const t of CM.dados.tickets.filter((x) => x.status === "pronto")) await api("PUT", `/estoque/cozinha/${t.id}`, { status: "entregue" }); const r = await api("GET", `/estoque/comandas/${CM.id}`); CM.dados = r.comanda; redesenharComanda(); }
        catch (e) { toast(esc(e.message), "erro"); }
        break;
      }
      case "cm-imprimir": imprimirConta(); break;
      case "cm-cancelar": {
        const tem = CM.dados.itens.some((i) => !i.cancelado);
        if (!(await confirmarAcao({ mensagem: tem ? "Cancelar a comanda inteira? Nada vira venda e o que estiver na cozinha sai da tela. Só um gerente pode fazer isso." : "Cancelar esta comanda vazia?", botao: "Cancelar comanda", cancelar: "Voltar", sempre: true }))) break;
        try { await api("POST", `/estoque/comandas/${CM.id}/cancelar`, {}); fecharModal(); toast("Comanda cancelada."); } catch (e) { toast(esc(e.message), "erro"); }
        break;
      }
      case "cm-fechar": fecharContaComanda(); break;
      case "cb-pessoa": if (CB && CB.comanda) { const faltaC = Math.max(0, Math.round(CB.total * 100) - somaPagos()); const parte = Math.min(faltaC, Math.ceil(Math.round(CB.total * 100) / CB.comanda.pessoas)); CB.valor = textoDeCentavos(parte); CB.erro = ""; corpoModal(cobrancaHtml()); } break;
      // cozinha
      case "kd-status": {
        el.disabled = true;
        try { await api("PUT", `/estoque/cozinha/${id}`, { status: el.dataset.v }); await carregarCozinha(); if (S.tab === "cozinha") render(); } catch (e) { el.disabled = false; toast(esc(e.message), "erro"); }
        break;
      }
      case "kd-filtro": KD.filtro = el.dataset.v; render(); break;
      case "kd-som": KD.som = !KD.som; try { localStorage.setItem("pdv-som", KD.som ? "1" : "0"); } catch (e) { /* ok */ } if (KD.som) bip(1); render(); break;
      case "kd-tela-cheia": { const d = document.documentElement; if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen().catch(() => {}); else if (document.exitFullscreen) document.exitFullscreen().catch(() => {}); break; }
      case "kd-imprimir": { const t = S.cozinha && [...S.cozinha.tickets, ...S.cozinha.entregues].find((x) => x.id === id); if (t) imprimirTicket(t); break; }
      case "pedido-cozinha": {
        el.disabled = true;
        try { await api("POST", `/estoque/pedidos/${id}/cozinha`); toast("Pedido na tela da cozinha.", "ok"); carregarDaAba("pedidos"); } catch (e) { el.disabled = false; toast(esc(e.message), "erro"); }
        break;
      }
      case "baixar-xlsx": baixarPlanilha(el); break;
      default: break;
    }
  });
  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (MSE && t.matches("[data-mse]")) { MSE.mesas[Number(t.dataset.mse)].nome = t.value; return; }
    if (MSE && t.matches("[data-mse-taxa]")) { MSE.taxa = t.value; return; }
    if (!CM) return;
    if (t.matches("[data-cm-busca]")) { CM.busca = t.value; const g = $("#cm-prods"); if (g) g.innerHTML = comandaProdutosHtml(); return; }
    if (t.matches("[data-cm-obs]") && CM.item) { CM.item.obs = t.value; return; }
    if (t.matches("[data-cm-desc]")) {
      CM.desconto = t.value; const tt = totaisComanda();
      const a = $("#cm-total"); if (a) a.textContent = fmt(tt.total); const pp = $("#cm-pp"); if (pp && tt.porPessoa) pp.textContent = fmt(tt.porPessoa);
      const b = document.querySelector('[data-a="cm-fechar"]'); if (b) b.textContent = `Fechar a conta · ${fmt(tt.total)}`; return;
    }
    if (t.matches("[data-cm-cli]")) {
      clearTimeout(t._timer); const q = t.value.trim();
      t._timer = setTimeout(async () => {
        if (q.length < 2 || !CM) return;
        try { const r = await api("GET", `/estoque/clientes?busca=${encodeURIComponent(q)}`); if (!CM) return; CM.cliRes = r.clientes.slice(0, 6);
          const box = $("#cm-cli-res"); if (box) box.innerHTML = CM.cliRes.map((c) => `<button type="button" class="opcao" data-a="cm-cli-escolher" data-id="${c.id}"><span style="flex:1"><b>${esc(c.nome || "Sem nome")}</b><small>${c.telefone ? telFmt(c.telefone) : ""}${c.compras ? ` · ${c.compras} compras` : ""}</small></span></button>`).join("") || `<p class="sub">Ninguém encontrado.</p>`;
        } catch (e) { /* sem sugestões */ }
      }, 250);
    }
  });
  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (CM && t.matches("[data-cm-taxa]")) { CM.semTaxa = !t.checked; redesenharComanda(); }
  });

  // planilha do mês (Excel)
  async function baixarPlanilha(botao) {
    const antes = botao.innerHTML; botao.disabled = true; botao.textContent = "Gerando a planilha…";
    try {
      const headers = { Authorization: "Bearer " + token }; const op = lerOperador(); if (op) headers["x-operador"] = op.token;
      const res = await fetch(`${API}/estoque/exportar.xlsx?mes=${S.mesVendas}`, { headers });
      if (!res.ok) { let msg = "Não deu para gerar a planilha."; try { msg = (await res.json()).error || msg; } catch (e) { /* sem corpo */ } throw new Error(msg); }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || ""; const m = cd.match(/filename\*=UTF-8''([^;]+)/);
      const nome = m ? decodeURIComponent(m[1]) : `PDV ${S.mesVendas}.xlsx`;
      const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = nome; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast("Planilha baixada. Abre no Excel, Google Planilhas ou Numbers.", "ok");
    } catch (e) { toast(esc(e.message), "erro"); }
    botao.disabled = false; botao.innerHTML = antes;
  }

  /* =====================================================================
     Fase 3: análises (curva ABC, margem, dias e horários), compra pelo XML da
     NF-e e produtos/clientes em planilha do Excel
     ===================================================================== */
  const pct = (x, casas = 0) => (x === null || x === undefined ? "—" : `${(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas })}%`);
  const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0]; // segunda primeiro
  function periodoAnalise() {
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (S.anPer === "90" || S.anPer === "365") {
      const n = Number(S.anPer); const fim = new Date(); const ini = new Date(); ini.setDate(ini.getDate() - n + 1);
      return { de: iso(ini), ate: iso(fim), rotulo: `últimos ${n === 90 ? "90 dias" : "12 meses"}` };
    }
    const [a, m] = S.mesVendas.split("-").map(Number);
    return { de: `${S.mesVendas}-01`, ate: `${S.mesVendas}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`, rotulo: `${MESES[m - 1]} de ${a}` };
  }
  async function carregarAnalise() {
    if (!tem("relatorios")) return;
    const p = periodoAnalise();
    const chave = `${p.de}|${p.ate}|${S.anBase}|${S.anVar ? 1 : 0}`;
    if (S.analise && S.analise._chave === chave) return;
    const r = await api("GET", `/estoque/analises?de=${p.de}&ate=${p.ate}&base=${S.anBase}${S.anVar ? "&variacoes=1" : ""}`);
    r._chave = chave; S.analise = r;
  }
  function periodoControlesHtml() {
    const [a, m] = S.mesVendas.split("-").map(Number);
    return `<div class="linha an-periodo">
      <div class="chips" style="margin:0">${[["mes", "Mês"], ["90", "90 dias"], ["365", "12 meses"]].map(([k, t]) => `<button class="chip ${S.anPer === k ? "ativo" : ""}" data-a="an-per" data-v="${k}">${t}</button>`).join("")}</div>
      ${S.anPer === "mes" ? `<div class="linha"><button class="btn claro mini" data-a="mes-vendas" data-d="-1" aria-label="Mês anterior">‹</button><b style="min-width:120px;text-align:center">${MESES[m - 1]} de ${a}</b><button class="btn claro mini" data-a="mes-vendas" data-d="1" aria-label="Próximo mês">›</button></div>` : ""}
    </div>`;
  }

  /* ---------- produtos: curva ABC e margem ---------- */
  function telaAnaliseProdutos() {
    let html = topo("Produtos: curva ABC e margem", "Quais produtos sustentam o negócio, quanto sobra de cada um e o que está parado.", periodoControlesHtml());
    const an = S.analise;
    if (!an) return html + carregandoHtml;
    const P = an.produtos; const l = P.lista;
    if (!l.length) return html + `<div class="card vazio"><b>Sem vendas em ${esc(periodoAnalise().rotulo)}</b>Escolha outro período.</div>`;
    const base = an.base === "faturamento" ? "faturamento" : "lucro";
    const margemMedia = P.faturamento > 0 ? P.lucro / P.faturamento : null;
    const baixas = l.filter((x) => x.margem !== null && x.margem < 0.3 && !x.avulso);
    const semCusto = l.filter((x) => x.semCusto);
    const desc = { A: "Os que trazem 80% do " + base + ". Nunca deixe faltar e cuide do preço.", B: "Os próximos 15%. Bons para combos e promoções.", C: "O resto. Revise o preço, divulgue mais ou pense em tirar." };
    html += `<div class="grade grade-4">
      <div class="card"><p class="kpi-rotulo">Faturamento dos produtos</p><p class="kpi-valor">${fmt(P.faturamento)}</p><p class="kpi-nota">${an.vendas} vendas · já sem descontos</p></div>
      <div class="card"><p class="kpi-rotulo">Lucro bruto</p><p class="kpi-valor ${P.lucro >= 0 ? "positivo" : "negativo"}">${fmt(P.lucro)}</p><p class="kpi-nota">faturamento − custo − taxas de cartão</p></div>
      <div class="card"><p class="kpi-rotulo">Margem média</p><p class="kpi-valor">${pct(margemMedia)}</p><p class="kpi-nota">de cada R$ 100 vendidos, sobram ${margemMedia === null ? "—" : fmt(margemMedia * 100)}</p></div>
      <div class="card"><p class="kpi-rotulo">Produtos vendidos</p><p class="kpi-valor">${l.length}</p><p class="kpi-nota">${P.parados.length ? `${P.parados.length} sem nenhuma venda` : "todos venderam"}</p></div>
    </div><div class="espaco"></div>`;
    html += `<div class="grade grade-3 abc-classes">${P.classes.map((c) => `<div class="card abc-card abc-${c.classe.toLowerCase()}">
      <div class="linha entre"><span class="abc-letra">${c.classe}</span><span class="sub">${c.produtos === 1 ? "1 produto" : `${c.produtos} produtos`}</span></div>
      <p class="kpi-valor" style="margin-top:6px">${fmt(c[base])}</p><p class="kpi-nota">${base === "lucro" ? "de lucro" : "faturados"} · ${pct(P[base] > 0 ? Math.max(0, c[base]) / l.reduce((s, x) => s + Math.max(0, x[base]), 0) : 0)} do total</p>
      <p class="bloco-sub" style="margin-top:8px">${desc[c.classe]}</p></div>`).join("")}</div><div class="espaco"></div>`;
    const avisos = [];
    if (baixas.length) avisos.push(`<b>${baixas.length === 1 ? "1 produto" : `${baixas.length} produtos`} com margem abaixo de 30%</b>: ${baixas.slice(0, 5).map((x) => esc(x.nome)).join(", ")}${baixas.length > 5 ? "…" : ""}`);
    if (semCusto.length) avisos.push(`<b>${semCusto.length === 1 ? "1 produto vendido" : `${semCusto.length} produtos vendidos`} sem custo cadastrado</b> (o lucro deles aparece maior do que é): ${semCusto.slice(0, 5).map((x) => esc(x.nome)).join(", ")}`);
    if (avisos.length) html += `<div class="faixa an-aviso"><span>${avisos.join("<br/>")}</span></div>`;
    const maxPart = Math.max(...l.map((x) => x.participacao), 0.0001);
    html += `<div class="card" style="padding:6px 8px">
      <div class="linha entre an-tabela-topo"><div class="chips" style="margin:0"><span class="sub" style="margin-right:4px">Ordenar a curva por</span><button class="chip ${base === "lucro" ? "ativo" : ""}" data-a="an-base" data-v="lucro">Lucro</button><button class="chip ${base === "faturamento" ? "ativo" : ""}" data-a="an-base" data-v="faturamento">Faturamento</button></div>
        <label class="check" style="margin:0"><input type="checkbox" data-an-var ${S.anVar ? "checked" : ""} /><span>Separar as variações</span></label></div>
      <div class="tabela-wrap"><table class="tabela an-tabela"><thead><tr><th>Classe</th><th>Produto</th><th class="dir so-desk">Qtd</th><th class="dir so-desk">Faturamento</th><th class="dir so-desk">Custo</th><th class="dir">Lucro</th><th class="dir">Margem</th><th class="dir so-desk" title="Preço e custo cadastrados hoje">Margem no cadastro</th><th class="so-desk">Peso na curva</th></tr></thead><tbody>
      ${l.map((x) => `<tr>
        <td><span class="abc-selo abc-${x.classe.toLowerCase()}">${x.classe}</span></td>
        <td><div class="prod-nome">${esc(x.nome)}</div><div class="prod-cat">${x.categoria ? esc(x.categoria) + " · " : ""}${fmtN(x.qtd)} vendidos · preço médio ${fmt(x.precoMedio)}</div></td>
        <td class="dir num so-desk">${fmtN(x.qtd)}</td><td class="dir num so-desk">${fmt(x.faturamento)}</td><td class="dir num so-desk">${fmt(x.custo)}</td>
        <td class="dir num ${x.lucro < 0 ? "negativo" : ""}">${fmt(x.lucro)}</td>
        <td class="dir"><span class="margem-selo ${x.margem === null || x.semCusto ? "" : x.margem < 0 ? "ruim" : x.margem < 0.3 ? "baixa" : "boa"}">${pct(x.margem)}</span>${x.semCusto ? `<div class="prod-cat">sem custo</div>` : ""}</td>
        <td class="dir num so-desk">${pct(x.margemCadastro)}</td>
        <td class="so-desk"><div class="barra-peso" title="${pct(x.participacao, 1)} do ${base} · acumulado ${pct(x.acumulado)}"><i style="width:${Math.max(2, Math.round((x.participacao / maxPart) * 100))}%"></i></div><small class="sub">${pct(x.participacao, 1)} · acum. ${pct(x.acumulado)}</small></td>
      </tr>`).join("")}
      </tbody></table></div></div>`;
    html += `<p class="bloco-sub" style="margin-top:10px">Faturamento de cada produto já sem a parte dele nos descontos, cashback e prêmios da venda. Lucro = faturamento − custo médio na hora da venda − a parte dele na taxa do cartão. Taxa de serviço e entrega ficam de fora.</p>`;
    if (P.parados.length) html += `<div class="espaco"></div><div class="card"><h2 class="secao">Sem nenhuma venda em ${esc(periodoAnalise().rotulo)} (${P.parados.length})</h2>
      <div class="chips">${P.parados.slice(0, 60).map((p) => `<span class="chip parado">${esc(p.nome)}${p.estoque !== null ? ` · ${fmtN(p.estoque)} em estoque` : ""}</span>`).join("")}</div>
      <p class="bloco-sub" style="margin-top:8px">Dinheiro parado na prateleira: pense em promoção, combo ou em não comprar de novo.</p></div>`;
    return html;
  }

  /* ---------- dias e horários (mapa de calor) ---------- */
  function telaAnaliseHorarios() {
    let html = topo("Dias e horários", "Quando o seu negócio mais vende: para montar a escala da equipe, o horário de abrir e as promoções dos dias fracos.", periodoControlesHtml());
    const an = S.analise;
    if (!an) return html + carregandoHtml;
    const H = an.horarios;
    if (!an.vendas) return html + `<div class="card vazio"><b>Sem vendas em ${esc(periodoAnalise().rotulo)}</b>Escolha outro período.</div>`;
    const dias = H.dias.filter((d) => d.vendas);
    const forte = dias.slice().sort((a, b) => b.media - a.media)[0];
    const fraco = H.dias.filter((d) => d.media > 0).sort((a, b) => a.media - b.media)[0];
    const hrs = H.horas.filter((h) => h.vendas);
    const hMin = hrs.length ? Math.max(0, Math.min(...hrs.map((h) => h.hora)) - 1) : 8;
    const hMax = hrs.length ? Math.min(23, Math.max(...hrs.map((h) => h.hora)) + 1) : 22;
    const horas = []; for (let h = hMin; h <= hMax; h++) horas.push(h);
    const maxCel = Math.max(...H.grade.flat().map((c) => c.total), 0.01);
    html += `<div class="grade grade-3">
      <div class="card"><p class="kpi-rotulo">Dia mais forte</p><p class="kpi-valor">${forte ? forte.nome : "—"}</p><p class="kpi-nota">${forte ? `média de ${fmt(forte.media)} por ${forte.nome.toLowerCase()} · ${pct(forte.participacao)} do faturamento` : ""}</p></div>
      <div class="card"><p class="kpi-rotulo">Horário de pico</p><p class="kpi-valor">${H.pico ? `${H.pico.de}h às ${H.pico.ate}h` : "—"}</p><p class="kpi-nota">${H.pico ? `${fmt(H.pico.total)} nessas 3 horas` : ""}</p></div>
      <div class="card"><p class="kpi-rotulo">Dia mais fraco</p><p class="kpi-valor">${fraco && fraco !== forte ? fraco.nome : "—"}</p><p class="kpi-nota">${fraco && fraco !== forte ? `média de ${fmt(fraco.media)} · bom para promoção` : ""}</p></div>
    </div><div class="espaco"></div>`;
    html += `<div class="card"><h2 class="secao">Faturamento por dia da semana e hora</h2>
      <div class="calor-wrap"><table class="calor" aria-label="Mapa de calor: faturamento por dia da semana e hora">
        <thead><tr><th></th>${horas.map((h) => `<th scope="col">${h}h</th>`).join("")}</tr></thead>
        <tbody>${ORDEM_DIAS.map((d) => `<tr><th scope="row">${DIAS_SEMANA[d].slice(0, 3)}</th>${horas.map((h) => { const c = H.grade[d][h]; const f = c.total / maxCel; return `<td class="${c.total ? "" : "zero"}" style="--f:${c.total ? Math.round(12 + f * 88) : 0}%" title="${DIAS_SEMANA[d]}, ${h}h: ${fmt(c.total)} · ${c.vendas === 1 ? "1 venda" : `${c.vendas} vendas`}"><span>${c.vendas ? c.vendas : ""}</span></td>`; }).join("")}</tr>`).join("")}</tbody>
      </table></div>
      <div class="calor-legenda"><span>menos</span><i></i><span>mais faturamento</span><span class="sub" style="margin-left:auto">o número em cada quadrado é a quantidade de vendas</span></div>
      ${H.semHora ? `<p class="bloco-sub" style="margin-top:8px">${H.semHora === 1 ? "1 venda lançada" : `${H.semHora} vendas lançadas`} em outro dia ficou fora do mapa (não dá para saber a hora).</p>` : ""}
    </div><div class="espaco"></div>`;
    const maxMedia = Math.max(...H.dias.map((d) => d.media), 0.01);
    const maxHora = Math.max(...horas.map((h) => H.horas[h].total), 0.01);
    html += `<div class="grade grade-2" style="align-items:start">
      <div class="card"><h2 class="secao">Média por dia da semana</h2>
        <ul class="barras-h">${ORDEM_DIAS.map((d) => { const x = H.dias[d]; return `<li title="${x.nome}: ${x.vendas} vendas no período, ticket médio ${fmt(x.ticket)}"><span>${x.nome.slice(0, 3)}</span><div class="barra"><i style="width:${x.media ? Math.max(2, Math.round((x.media / maxMedia) * 100)) : 0}%"></i></div><b class="num">${fmt(x.media)}</b></li>`; }).join("")}</ul>
        <p class="bloco-sub">Média = total do dia da semana ÷ quantas vezes ele apareceu no período.</p></div>
      <div class="card"><h2 class="secao">Por hora do dia</h2>
        <div class="barras-v" role="img" aria-label="Faturamento por hora">${horas.map((h) => { const x = H.horas[h]; return `<div class="hv" title="${h}h: ${fmt(x.total)} · ${x.vendas} vendas · ticket ${fmt(x.ticket)}"><i style="height:${x.total ? Math.max(3, Math.round((x.total / maxHora) * 100)) : 0}%"></i><span>${h}</span></div>`; }).join("")}</div>
        <p class="bloco-sub">Passe o dedo ou o mouse nas barras para ver o valor.</p></div>
    </div>`;
    return html;
  }

  /* ---------- compra pelo XML da NF-e ---------- */
  let NF = null;
  function abrirNFe() {
    NF = { etapa: "arquivo", xml: "", previa: null, itens: [], meio: "", vencimento: "", erro: "", salvando: false, carregando: false };
    abrirModal("Compra pela nota fiscal (XML)", nfeHtml(), { largo: true, aoFechar: () => { NF = null; } });
  }
  const tituloCaso = (s) => String(s || "").toLowerCase().replace(/(^|\s|\/|-)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E|Com)\b/g, (w) => w.toLowerCase());
  function nfeHtml() {
    const n = NF;
    if (n.etapa === "arquivo") {
      return `<p class="sub" style="margin-bottom:12px">Peça ao fornecedor o <b>arquivo XML</b> da nota (ele vem junto com o PDF, no e-mail). Os produtos, quantidades, custos, frete e vencimento entram sozinhos — você só confere.</p>
        <label class="btn acento grande btn-arquivo-pdv">${n.carregando ? "Lendo a nota…" : "Escolher o XML da nota"}<input type="file" data-nf-arquivo accept=".xml,text/xml,application/xml" hidden /></label>
        ${n.erro ? `<p class="erro-form">${esc(n.erro)}</p>` : ""}
        <p class="bloco-sub" style="margin-top:12px">Na próxima nota do mesmo fornecedor, os produtos já vêm ligados (e lembra quantas unidades vêm em cada caixa).</p>`;
    }
    const p = n.previa;
    const ativos2 = S.produtos.filter((x) => x.ativo).slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const usados = n.itens.filter((i) => i.acao !== "ignorar");
    const totalMerc = usados.reduce((s, i) => s + p.itens.find((x) => x.n === i.n).custoTotal, 0);
    const ROT = { antes: "ligado da última nota", codigo: "pelo código de barras", nome: "nome parecido · confira" };
    const linhas = p.itens.map((it) => {
      const e = n.itens.find((x) => x.n === it.n);
      const prod = e.produtoId ? S.produtos.find((x) => x.id === e.produtoId) : null;
      const fator = Number(String(e.fator).replace(",", ".")) || 1;
      const qtdUn = it.qtd * fator;
      return `<div class="nf-item ${e.acao === "ignorar" ? "ignorado" : ""}">
        <div class="nf-item-topo"><div><b>${esc(it.nome)}</b><div class="prod-cat">cód. ${esc(it.codigo)}${it.ean ? ` · EAN ${esc(it.ean)}` : ""} · ${fmtN(it.qtd)} ${esc(it.unidade || "un")} × ${fmt(it.vUnit)}${it.desconto ? ` · desconto ${fmt(it.desconto)}` : ""}${it.impostos ? ` · IPI/ST ${fmt(it.impostos)}` : ""}</div></div><b class="num">${fmt(it.custoTotal)}</b></div>
        <div class="nf-item-ctrl">
          <select class="inp" data-nf-prod="${it.n}" aria-label="Produto do cadastro">
            <option value="__novo" ${e.acao === "novo" ? "selected" : ""}>+ Criar produto novo</option>
            <option value="__ignorar" ${e.acao === "ignorar" ? "selected" : ""}>Não dar entrada (ignorar)</option>
            <optgroup label="Ligar a um produto do cadastro">${ativos2.map((x) => `<option value="${x.id}" ${e.acao === "ligar" && e.produtoId === x.id ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</optgroup>
          </select>
          ${e.acao === "ligar" && prod && prod.variacoes.length ? `<select class="inp" data-nf-var="${it.n}" aria-label="Variação"><option value="">Variação…</option>${prod.variacoes.map((v) => `<option value="${v.id}" ${e.variacaoId === v.id ? "selected" : ""}>${esc(v.nome)}</option>`).join("")}</select>` : ""}
          ${e.acao !== "ignorar" && (it.embalagem || fator !== 1) ? `<label class="nf-fator"><span>Unidades por ${esc(it.unidade || "item")}</span><input class="inp" data-nf-fator="${it.n}" value="${esc(String(e.fator))}" inputmode="decimal" /></label>` : ""}
        </div>
        ${e.acao === "novo" ? `<div class="nf-novo"><input class="inp" data-nf-nome="${it.n}" value="${esc(e.novo.nome)}" maxlength="80" aria-label="Nome do produto novo" /><input class="inp" data-nf-cat="${it.n}" value="${esc(e.novo.categoria)}" placeholder="Categoria" maxlength="60" /><input class="inp" data-nf-preco="${it.n}" value="${esc(e.novo.preco)}" inputmode="decimal" placeholder="Preço de venda" /></div>` : ""}
        ${e.acao !== "ignorar" ? `<p class="nf-conta">Entra no estoque: <b>${fmtN(qtdUn)} ${prod ? unid(prod.unidade) : "un."}</b> · custo <b>${fmt(qtdUn ? it.custoTotal / qtdUn : 0)}</b> cada${e.sug ? ` <span class="selo ${e.sug.por === "nome" ? "baixo" : "ok"}">${ROT[e.sug.por]}</span>` : ""}${e.acao === "novo" && e.novo.preco && qtdUn ? ` · margem ${pct((numOu(e.novo.preco) - it.custoTotal / qtdUn) / numOu(e.novo.preco))}` : ""}</p>` : ""}
      </div>`;
    }).join("");
    const meios = ["boleto", "pix", "dinheiro", "transferencia", "debito", "credito", "outro"];
    return `<div class="nf-cab">
        <div><p class="kpi-rotulo">Fornecedor</p><b>${esc(p.fornecedor.nome)}</b><div class="prod-cat">${p.fornecedor.cnpj ? `CNPJ ${esc(p.fornecedor.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"))}` : ""}</div></div>
        <div><p class="kpi-rotulo">Nota</p><b>NF-e ${esc(p.numero)}${p.serie ? ` · série ${esc(p.serie)}` : ""}</b><div class="prod-cat">emitida em ${dataBR(p.data)}</div></div>
        <div><p class="kpi-rotulo">Total da nota</p><b class="num">${fmt(p.total)}</b><div class="prod-cat">${p.frete ? `frete ${fmt(p.frete)} · ` : ""}${p.itens.length} itens</div></div>
      </div>
      ${p.jaLancada ? `<p class="aviso">⚠ Essa nota já foi lançada em ${dataBR(p.jaLancada)}. Lançar de novo duplicaria o estoque — o sistema não deixa.</p>` : ""}
      <div class="nf-itens">${linhas}</div>
      <div class="campos" style="margin-top:14px">
        <div class="campo"><span>Pagamento</span><div class="chips">${meios.map((m) => `<button class="chip ${n.meio === m ? "ativo" : ""}" data-a="nf-meio" data-v="${m}">${esc(meioCurto(m))}</button>`).join("")}</div></div>
        <label class="campo"><span>Vencimento ${p.vencimentos.length > 1 ? `(1ª de ${p.vencimentos.length} parcelas)` : ""}</span><input type="date" data-nf-venc value="${esc(n.vencimento)}" /><small>Em branco = pago na data da nota.</small></label>
      </div>
      ${n.erro ? `<p class="erro-form">${esc(n.erro)}</p>` : ""}
      ${usados.length === p.itens.length && p.total && Math.abs(totalMerc + p.frete - p.total) > 0.05 ? `<p class="aviso">A soma dos itens + frete (${fmt(totalMerc + p.frete)}) é diferente do total da nota (${fmt(p.total)}). Pode ser seguro, outras despesas ou desconto no total: confira com o boleto.</p>` : ""}
      <div class="modal-rodape"><span class="sub esq">Mercadoria ${fmt(totalMerc)}${p.frete ? ` + frete ${fmt(p.frete)} (dividido no custo)` : ""}</span><button class="btn claro" data-a="fechar-modal">Cancelar</button><button class="btn acento" data-a="nf-ok" ${n.salvando || p.jaLancada || !usados.length ? "disabled" : ""}>${n.salvando ? "Lançando…" : `Dar entrada em ${usados.length} ${usados.length === 1 ? "item" : "itens"}`}</button></div>`;
  }
  async function lerArquivoNFe(file) {
    NF.carregando = true; NF.erro = ""; corpoModal(nfeHtml());
    try {
      const xml = await file.text();
      const p = await api("POST", "/estoque/compras/nfe/previa", { xml });
      await recarregarProdutos();
      NF.xml = xml; NF.previa = p; NF.etapa = "conferir"; NF.carregando = false;
      NF.meio = p.vencimentos.length || p.formaPagamento === "15" ? "boleto" : "pix";
      NF.vencimento = p.vencimentos[0] && p.vencimentos[0].data > (p.data || "") ? p.vencimentos[0].data : "";
      NF.itens = p.itens.map((it) => {
        const s = it.sugestao;
        const ok = s && S.produtos.some((x) => x.id === s.produtoId);
        return { n: it.n, acao: ok ? "ligar" : "novo", produtoId: ok ? s.produtoId : null, variacaoId: ok ? s.variacaoId : null, fator: ok ? String(s.fator).replace(".", ",") : "1", sug: ok ? s : null,
          novo: { nome: tituloCaso(it.nome).slice(0, 80), categoria: "", preco: "" } };
      });
      const t = $(".modal-titulo"); if (t) t.textContent = `Conferir a nota de ${p.fornecedor.nome}`;
    } catch (e) { NF.carregando = false; NF.erro = e.message; }
    corpoModal(nfeHtml());
  }
  async function confirmarNFe() {
    const n = NF; n.erro = "";
    const falta = n.itens.find((e) => e.acao === "ligar" && (() => { const p = S.produtos.find((x) => x.id === e.produtoId); return p && p.variacoes.length && !e.variacaoId; })());
    if (falta) { n.erro = "Escolha a variação dos itens ligados a produtos com variação."; corpoModal(nfeHtml()); return; }
    n.salvando = true; corpoModal(nfeHtml());
    try {
      const r = await api("POST", "/estoque/compras/nfe", { xml: n.xml, meio: n.meio, vencimento: n.vencimento || null,
        itens: n.itens.map((e) => ({ n: e.n, acao: e.acao, produtoId: e.produtoId, variacaoId: e.variacaoId, fator: numOu(e.fator, 1), novo: { nome: e.novo.nome, categoria: e.novo.categoria, preco: numOu(e.novo.preco, 0) } })) });
      fecharModal(); await recarregarProdutos();
      toast(`Nota lançada: ${fmt(r.compra.total)} em ${r.compra.itens.length} ${r.compra.itens.length === 1 ? "item" : "itens"}. Estoque e custo médio atualizados; a despesa entrou no Controle financeiro.`, "ok");
      if (S.tab === "compras") carregarDaAba("compras");
    } catch (e) { if (NF) { n.salvando = false; n.erro = e.message; corpoModal(nfeHtml()); } }
  }

  /* ---------- produtos e clientes em planilha (.xlsx) ---------- */
  let PL = null;
  function abrirImportarPlanilha(tipo) {
    PL = { tipo, arquivo: "", nome: "", previa: null, atualizarEstoque: false, erro: "", carregando: false, salvando: false };
    abrirModal(tipo === "produtos" ? "Importar produtos da planilha" : "Importar clientes da planilha", planilhaHtml(), { largo: true, aoFechar: () => { PL = null; } });
  }
  function planilhaHtml() {
    const p = PL; const prod = p.tipo === "produtos";
    const ROT = { novo: ["Novo", "ok"], atualizar: ["Atualizar", "acento"], igual: ["Sem mudança", "neutro"], erro: ["Erro", "acabou"] };
    let html = `<p class="sub" style="margin-bottom:12px">${prod
      ? "Use a planilha que você baixa em “Exportar” (dá para editar preços, custos e mínimos de uma vez) ou uma sua, com cabeçalho: <b>Produto, Variação, Categoria, Código de barras, Unidade, Preço, Custo, Estoque, Estoque mínimo</b>. O produto é reconhecido pelo ID ou pelo nome."
      : "Use a planilha que você baixa em “Exportar” ou uma sua, com cabeçalho: <b>Nome, Telefone, Endereço, Observações, Participa da fidelidade</b>. O cliente é reconhecido pelo telefone."}</p>
      <div class="linha"><label class="btn ${p.previa ? "claro" : "acento"} btn-arquivo-pdv">${p.carregando ? "Lendo…" : p.nome ? "Trocar a planilha" : "Escolher planilha (.xlsx)"}<input type="file" data-pl-arquivo accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden /></label>
      ${p.nome ? `<span class="sub">${esc(p.nome)}</span>` : ""}<button class="link" data-a="pl-modelo" style="margin-left:auto">Baixar ${prod ? "os produtos atuais" : "os clientes atuais"} (modelo)</button></div>`;
    if (p.erro) html += `<p class="erro-form">${esc(p.erro)}</p>`;
    if (p.previa) {
      const r = p.previa.resumo;
      const comEstoque = prod ? p.previa.itens.filter((x) => x.estoque) : [];
      html += `<div class="chips pl-resumo" style="margin:14px 0 8px">${[["novo", "novo", "novos"], ["atualizar", "para atualizar", "para atualizar"], ["igual", "sem mudança", "sem mudança"], ["erro", "com erro", "com erro"]].filter(([k]) => r[k]).map(([k, t1, t2]) => `<span class="selo ${ROT[k][1]}">${r[k]} ${r[k] === 1 ? t1 : t2}</span>`).join("")}</div>
        ${comEstoque.length ? `<label class="check"><input type="checkbox" data-pl-estoque ${p.atualizarEstoque ? "checked" : ""} /><span><b>Atualizar o estoque pela planilha</b><small>${comEstoque.length === 1 ? "1 produto tem" : `${comEstoque.length} produtos têm`} estoque diferente do sistema. Marque se a planilha é uma contagem nova (vira ajuste, com histórico).</small></span></label>` : ""}
        <div class="tabela-wrap pl-tabela"><table class="tabela"><thead><tr><th class="so-desk">Linha</th><th>${prod ? "Produto" : "Cliente"}</th><th>Situação</th><th>O que muda</th></tr></thead><tbody>
        ${p.previa.itens.filter((x) => x.acao !== "igual" || x.estoque).sort((a, b) => ["erro", "novo", "atualizar", "igual"].indexOf(a.acao) - ["erro", "novo", "atualizar", "igual"].indexOf(b.acao) || a.linha - b.linha).map((x) => `<tr><td class="num so-desk">${x.linha}</td><td>${esc(x.nome || "—")}${!prod && x.telefone ? `<div class="prod-cat">${telFmt(x.telefone)}</div>` : ""}</td><td><span class="selo ${ROT[x.acao][1]}">${ROT[x.acao][0]}</span></td>
          <td class="sub">${x.erro ? `<span class="negativo">${esc(x.erro)}</span>` : x.acao === "novo" ? "cadastra" : x.mudancas.length ? esc(x.mudancas.join(", ")) : ""}${x.estoque ? `<div>estoque: ${esc(x.estoque)}${p.atualizarEstoque ? "" : " (não muda)"}</div>` : ""}</td></tr>`).join("")}
        </tbody></table></div>
        ${r.igual ? `<p class="bloco-sub" style="margin-top:6px">${r.igual === 1 ? "1 linha igual ao cadastro não aparece" : `${r.igual} linhas iguais ao cadastro não aparecem`} na lista.</p>` : ""}
        ${r.erro ? `<p class="aviso">Corrija as linhas com erro na planilha (ou apague-as) e escolha o arquivo de novo.</p>` : ""}`;
      const n = r.novo + r.atualizar + (p.atualizarEstoque ? p.previa.itens.filter((x) => x.acao === "igual" && x.estoque).length : 0);
      html += `<div class="modal-rodape"><button class="btn claro" data-a="fechar-modal">Cancelar</button><button class="btn acento" data-a="pl-ok" ${r.erro || !n || p.salvando ? "disabled" : ""}>${p.salvando ? "Importando…" : `Importar ${n} ${prod ? (n === 1 ? "produto" : "produtos") : (n === 1 ? "cliente" : "clientes")}`}</button></div>`;
    }
    return html;
  }
  async function previaPlanilha() {
    PL.carregando = true; PL.erro = ""; corpoModal(planilhaHtml());
    try { PL.previa = await api("POST", `/estoque/importar/${PL.tipo}`, { arquivo: PL.arquivo, atualizarEstoque: PL.atualizarEstoque }); }
    catch (e) { PL.erro = e.message; PL.previa = null; }
    if (PL) { PL.carregando = false; corpoModal(planilhaHtml()); }
  }
  async function aplicarPlanilha() {
    const p = PL; p.salvando = true; corpoModal(planilhaHtml());
    try {
      const r = await api("POST", `/estoque/importar/${p.tipo}`, { arquivo: p.arquivo, atualizarEstoque: p.atualizarEstoque, aplicar: true });
      fecharModal();
      toast(`Pronto: ${r.resumo.novo} ${r.resumo.novo === 1 ? "novo" : "novos"} e ${r.resumo.atualizar} ${r.resumo.atualizar === 1 ? "atualizado" : "atualizados"}.`, "ok");
      if (p.tipo === "produtos") { await recarregarProdutos(); if (S.tab === "produtos") render(); } else { S.clientes = null; carregarDaAba("clientes"); }
    } catch (e) { if (PL) { p.salvando = false; p.erro = e.message; corpoModal(planilhaHtml()); } }
  }
  async function baixarArquivo(caminho, nomePadrao, botao) {
    const antes = botao ? botao.innerHTML : ""; if (botao) { botao.disabled = true; botao.textContent = "Gerando…"; }
    try {
      const headers = { Authorization: "Bearer " + token }; const op = lerOperador(); if (op) headers["x-operador"] = op.token;
      const res = await fetch(API + caminho, { headers });
      if (!res.ok) { let msg = "Não deu para gerar a planilha."; try { msg = (await res.json()).error || msg; } catch (e) { /* sem corpo */ } throw new Error(msg); }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || ""; const m = cd.match(/filename\*=UTF-8''([^;]+)/) || cd.match(/filename="([^"]+)"/);
      const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = m ? decodeURIComponent(m[1]) : nomePadrao; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) { toast(esc(e.message), "erro"); }
    if (botao) { botao.disabled = false; botao.innerHTML = antes; }
  }

  document.addEventListener("click", async (ev) => {
    const el = ev.target.closest("[data-a]");
    if (!el) return;
    const a = el.dataset.a;
    if (!/^(an-|nf-|pl-|nfe-abrir|exportar-prod|exportar-cli|importar-prod|importar-cli)/.test(a)) return;
    switch (a) {
      case "an-per": S.anPer = el.dataset.v; S.analise = null; render(); carregarDaAba("relatorios"); break;
      case "an-base": S.anBase = el.dataset.v; S.analise = null; render(); carregarDaAba("relatorios"); break;
      case "nfe-abrir": if (!tem("nfce")) { abrirModal("Plano Completo", completoHtml("nfce", true)); break; } abrirNFe(); break;
      case "nf-meio": NF.meio = el.dataset.v; corpoModal(nfeHtml()); break;
      case "nf-ok": confirmarNFe(); break;
      case "exportar-prod": baixarArquivo("/estoque/exportar/produtos.xlsx", "produtos.xlsx", el); break;
      case "exportar-cli": baixarArquivo("/estoque/exportar/clientes.xlsx", "clientes.xlsx", el); break;
      case "importar-prod": abrirImportarPlanilha("produtos"); break;
      case "importar-cli": abrirImportarPlanilha("clientes"); break;
      case "pl-modelo": baixarArquivo(`/estoque/exportar/${PL.tipo}.xlsx`, `${PL.tipo}.xlsx`, null); break;
      case "pl-ok": aplicarPlanilha(); break;
      default: break;
    }
  });
  document.addEventListener("change", async (ev) => {
    const t = ev.target;
    if (t.matches("[data-an-var]")) { S.anVar = t.checked; S.analise = null; render(); carregarDaAba("relatorios"); return; }
    if (PL && t.matches("[data-pl-arquivo]") && t.files[0]) {
      const f = t.files[0];
      if (f.size > 4 * 1024 * 1024) { PL.erro = "Planilha grande demais (máximo 4 MB)."; corpoModal(planilhaHtml()); return; }
      PL.nome = f.name;
      PL.arquivo = await new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => falha(new Error("Não deu para ler o arquivo.")); r.readAsDataURL(f); });
      previaPlanilha(); return;
    }
    if (PL && t.matches("[data-pl-estoque]")) { PL.atualizarEstoque = t.checked; corpoModal(planilhaHtml()); return; }
    if (NF && t.matches("[data-nf-arquivo]") && t.files[0]) { lerArquivoNFe(t.files[0]); return; }
    if (NF && t.matches("[data-nf-prod]")) {
      const e = NF.itens.find((x) => x.n === Number(t.dataset.nfProd));
      if (t.value === "__novo") { e.acao = "novo"; e.produtoId = null; e.variacaoId = null; }
      else if (t.value === "__ignorar") e.acao = "ignorar";
      else { e.acao = "ligar"; e.produtoId = t.value; const p = S.produtos.find((x) => x.id === t.value); e.variacaoId = p && p.variacoes.length === 1 ? p.variacoes[0].id : null; }
      e.sug = null; corpoModal(nfeHtml()); return;
    }
    if (NF && t.matches("[data-nf-var]")) { NF.itens.find((x) => x.n === Number(t.dataset.nfVar)).variacaoId = t.value || null; return; }
    if (NF && t.matches("[data-nf-fator], [data-nf-preco]")) { corpoModal(nfeHtml()); return; }
    if (NF && t.matches("[data-nf-venc]")) { NF.vencimento = t.value; return; }
  });
  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (!NF) return;
    const item = (k) => NF.itens.find((x) => x.n === Number(t.dataset[k]));
    if (t.matches("[data-nf-fator]")) item("nfFator").fator = t.value;
    else if (t.matches("[data-nf-nome]")) item("nfNome").novo.nome = t.value;
    else if (t.matches("[data-nf-cat]")) item("nfCat").novo.categoria = t.value;
    else if (t.matches("[data-nf-preco]")) item("nfPreco").novo.preco = t.value;
  });

  /* =====================================================================
     Fase 4: nota fiscal (NFC-e) e venda sem internet
     ===================================================================== */
  const fiscalLigado = () => !!(S.fiscal && S.fiscal.ativo);

  /* ---------- NFC-e: o quadro da nota na venda ---------- */
  function notaFiscalHtml(v) {
    if (!fiscalLigado() && !(v.nfce && v.nfce.status)) return "";
    const n = v.nfce || {};
    if (v.offline && !v.id) return `<div class="nf-box" id="nf-box"><p class="sub">Venda guardada sem internet. A NFC-e pode ser emitida quando ela for enviada.</p></div>`;
    const homolog = n.ambiente === "homologacao" ? ` <span class="selo baixo">homologação · sem valor fiscal</span>` : "";
    let corpo;
    if (n.status === "autorizada") {
      corpo = `<div class="linha entre"><span><span class="selo ok">NFC-e autorizada</span>${homolog}</span><span class="sub">nº ${esc(n.numero)} · série ${esc(n.serie)}</span></div>
        ${n.chave ? `<p class="prod-cat nf-chave">${esc(String(n.chave).replace(/^NFe/, "").replace(/(\d{4})(?=\d)/g, "$1 "))}</p>` : ""}
        <div class="linha" style="margin-top:8px">${n.danfe ? `<a class="btn mini acento" href="${esc(n.danfe)}" target="_blank" rel="noopener">Ver / imprimir a nota</a>` : ""}<button class="btn mini claro" data-a="nfce-cancelar" data-id="${v.id}">Cancelar a nota</button></div>`;
    } else if (n.status === "processando") {
      corpo = `<div class="linha entre"><span><span class="selo acento">NFC-e em processamento</span>${homolog}</span><button class="btn mini claro" data-a="nfce-consultar" data-id="${v.id}">Atualizar</button></div><p class="bloco-sub">A SEFAZ ainda não respondeu. Toque em Atualizar em alguns segundos.</p>`;
    } else if (n.status === "cancelada") {
      corpo = `<div class="linha entre"><span><span class="selo neutro">NFC-e cancelada</span>${homolog}</span><span class="sub">nº ${esc(n.numero || "")}</span></div>`;
    } else {
      corpo = `${n.status === "erro" ? `<p class="aviso" style="margin-top:0">A nota não saiu: ${esc(n.mensagem || "erro no emissor")}</p>` : ""}
        ${v.cancelada ? "" : `<div class="nf-emitir"><input class="inp" id="nfce-cpf" inputmode="numeric" maxlength="18" placeholder="CPF na nota (opcional)" value="${esc(n.cpf || "")}" />
        <button class="btn acento" data-a="nfce-emitir" data-id="${v.id}">${n.status === "erro" ? "Tentar de novo" : "Emitir NFC-e"}</button></div>
        <p class="bloco-sub">${S.fiscal.ambiente === "producao" ? "Nota de verdade (produção)." : "Ambiente de homologação: nota de teste, sem valor fiscal."}</p>`}`;
    }
    return `<div class="nf-box" id="nf-box"><p class="bloco-titulo" style="margin:0 0 8px">Nota fiscal do consumidor</p>${corpo}</div>`;
  }
  function atualizarNotaNaTela(vendaId, nfce) {
    const listas = [S.vendas || [], S.ultimaVenda ? [S.ultimaVenda.venda] : []];
    let v = null;
    listas.forEach((l) => l.forEach((x) => { if (x.id === vendaId) { x.nfce = nfce; v = x; } }));
    const box = $("#nf-box");
    if (box && v) box.outerHTML = notaFiscalHtml(v);
  }
  async function acaoNota(tipo, vendaId, botao) {
    if (botao) { botao.disabled = true; botao.textContent = tipo === "emitir" ? "Emitindo…" : tipo === "cancelar" ? "Cancelando…" : "Consultando…"; }
    try {
      let r;
      if (tipo === "emitir") r = await api("POST", `/estoque/vendas/${vendaId}/nfce`, { cpf: ($("#nfce-cpf") || {}).value || "" });
      else if (tipo === "consultar") r = await api("GET", `/estoque/vendas/${vendaId}/nfce`);
      else {
        const j = window.prompt("Motivo do cancelamento da nota (mínimo 15 letras). A SEFAZ costuma aceitar até 30 minutos depois da emissão.", "Cliente desistiu da compra");
        if (j === null) { if (botao) { botao.disabled = false; botao.textContent = "Cancelar a nota"; } return; }
        r = await api("POST", `/estoque/vendas/${vendaId}/nfce/cancelar`, { justificativa: j });
      }
      atualizarNotaNaTela(vendaId, r.nfce);
      if (r.nfce.status === "autorizada" && tipo === "emitir") toast("NFC-e autorizada.", "ok");
      if (r.nfce.status === "processando") setTimeout(() => { if ($("#nf-box")) acaoNota("consultar", vendaId, null); }, 4000);
    } catch (e) {
      toast(esc(e.message), "erro");
      const box = $("#nf-box"); const v = [...(S.vendas || []), ...(S.ultimaVenda ? [S.ultimaVenda.venda] : [])].find((x) => x.id === vendaId);
      if (box && v) box.outerHTML = notaFiscalHtml(v);
    }
  }

  /* ---------- Configurações → Nota fiscal ---------- */
  let FS = null;
  function fiscalCardHtml() {
    if (!tem("nfce")) return completoHtml("nfce", true);
    const f = S.fiscal || {};
    if (!FS) FS = { ativo: !!f.ativo, ambiente: f.ambiente || "homologacao", cnpj: f.cnpj || "", csosn: f.csosn || "102", cfop: f.cfop || "5102", ncm: f.ncm || "", pisCofins: f.pisCofins || "49", emitir: f.emitir || "perguntar", infoAdicional: f.infoAdicional || "", token: "", erro: "", msg: "", salvando: false };
    const cnpjFmt = (c) => String(c || "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    return `<div class="card fiscal-card">
      <h2 class="secao">Nota fiscal (NFC-e)</h2>
      <p class="sub">Opcional. MEI que vende para pessoa física normalmente não é obrigado a emitir. Para emitir, você precisa de um <b>parceiro emissor</b> (ex.: Focus NFe, plano de varejo), do <b>certificado digital A1</b> e do <b>CSC</b> da SEFAZ do seu estado — tudo cadastrado no painel do parceiro. Aqui você só cola o token da API.</p>
      <div class="campos" style="margin-top:12px">
        <label class="campo"><span>CNPJ do emitente</span><input data-fs="cnpj" value="${esc(cnpjFmt(FS.cnpj))}" inputmode="numeric" placeholder="00.000.000/0000-00" /></label>
        <label class="campo"><span>Token da API do parceiro ${f.temToken ? `<span class="selo ok">salvo</span>` : ""}</span><input data-fs="token" type="password" autocomplete="off" value="${esc(FS.token)}" placeholder="${f.temToken ? "•••••• (deixe em branco para manter)" : "cole aqui"}" /><small>Fica guardado cifrado e nunca aparece de novo.</small></label>
      </div>
      <div class="campo" style="margin-top:10px"><span>Ambiente</span><div class="chips"><button class="chip ${FS.ambiente === "homologacao" ? "ativo" : ""}" data-a="fs-amb" data-v="homologacao">Homologação (teste)</button><button class="chip ${FS.ambiente === "producao" ? "ativo" : ""}" data-a="fs-amb" data-v="producao">Produção (nota de verdade)</button></div></div>
      <details class="fs-avancado"><summary>Padrões fiscais (Simples Nacional / MEI)</summary>
        <div class="campos" style="margin-top:10px">
          <label class="campo"><span>CSOSN</span><input data-fs="csosn" value="${esc(FS.csosn)}" inputmode="numeric" maxlength="3" /><small>102 = sem permissão de crédito (o mais comum)</small></label>
          <label class="campo"><span>CFOP</span><input data-fs="cfop" value="${esc(FS.cfop)}" inputmode="numeric" maxlength="4" /><small>5102 = venda de mercadoria de terceiros</small></label>
          <label class="campo"><span>NCM padrão</span><input data-fs="ncm" value="${esc(FS.ncm)}" inputmode="numeric" maxlength="10" placeholder="opcional" /><small>Usado nos produtos sem NCM</small></label>
          <label class="campo"><span>CST PIS/COFINS</span><input data-fs="pisCofins" value="${esc(FS.pisCofins)}" inputmode="numeric" maxlength="2" /><small>49 é o usual no Simples</small></label>
        </div>
        <label class="campo" style="margin-top:10px"><span>Informação adicional na nota</span><input data-fs="infoAdicional" value="${esc(FS.infoAdicional)}" maxlength="300" placeholder="Ex.: Documento emitido por ME ou EPP optante pelo Simples Nacional" /></label>
        <p class="bloco-sub">Confirme esses códigos com o seu contador. Regime normal (Lucro Presumido/Real) ainda não é atendido.</p>
      </details>
      <div class="campo" style="margin-top:10px"><span>Quando emitir</span><div class="chips"><button class="chip ${FS.emitir === "perguntar" ? "ativo" : ""}" data-a="fs-emitir" data-v="perguntar">Quando eu tocar em “Emitir”</button><button class="chip ${FS.emitir === "sempre" ? "ativo" : ""}" data-a="fs-emitir" data-v="sempre">Em toda venda</button></div></div>
      <label class="check" style="margin-top:12px"><input type="checkbox" data-fs="ativo" ${FS.ativo ? "checked" : ""} /><span><b>Emitir NFC-e pelo PDV</b><small>Aparece o botão “Emitir NFC-e” depois de cada venda e no detalhe da venda.</small></span></label>
      ${FS.erro ? `<p class="erro-form">${esc(FS.erro)}</p>` : ""}${FS.msg ? `<p class="aviso info">${esc(FS.msg)}</p>` : ""}
      <div class="modal-rodape">${f.temToken ? `<button class="btn claro" data-a="fs-testar">Testar conexão</button>` : ""}<button class="btn acento" data-a="fs-salvar" ${FS.salvando ? "disabled" : ""}>${FS.salvando ? "Salvando…" : "Salvar"}</button></div>
    </div>`;
  }
  async function salvarFiscalTela() {
    const f = FS; f.erro = ""; f.msg = ""; f.salvando = true; render();
    try {
      const corpo = { ativo: f.ativo, ambiente: f.ambiente, cnpj: f.cnpj, csosn: f.csosn, cfop: f.cfop, ncm: f.ncm, pisCofins: f.pisCofins, emitir: f.emitir, infoAdicional: f.infoAdicional };
      if (f.token.trim()) corpo.token = f.token.trim();
      if (f.ambiente === "producao" && !(S.fiscal && S.fiscal.ambiente === "producao") && f.ativo && !(await confirmarAcao({ mensagem: "Produção emite nota fiscal de verdade, com valor para a SEFAZ. Confirma que já testou em homologação e que o seu contador conferiu os códigos?", botao: "Usar produção", cancelar: "Voltar", perigo: false, sempre: true }))) { f.salvando = false; render(); return; }
      S.fiscal = (await api("PUT", "/estoque/fiscal", corpo)).fiscal;
      FS = null; toast("Configuração fiscal salva.", "ok");
    } catch (e) { f.erro = e.message; f.salvando = false; }
    render();
  }

  /* ---------- venda sem internet ---------- */
  // Guarda neste aparelho: o cadastro (para abrir o PDV sem internet) e a fila de vendas a enviar
  // de quem é a fila: o id da conta dentro do token (assim a venda guardada nunca vai para outra conta no mesmo aparelho)
  const uidLocal = () => {
    try { const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); if (p.id || p.userId || p.sub) return String(p.id || p.userId || p.sub); } catch (e) { /* segue */ }
    try { const u = JSON.parse(localStorage.getItem("user") || "{}"); return String(u.id || u._id || "sem-conta"); } catch (e) { return "sem-conta"; }
  };
  const CHAVE_FILA = () => `pdv-fila-${uidLocal()}`;
  const CHAVE_CACHE = () => `pdv-cache-${uidLocal()}`;
  function lerFila() { try { return JSON.parse(localStorage.getItem(CHAVE_FILA()) || "[]"); } catch (e) { return []; } }
  function gravarFila(f) { try { localStorage.setItem(CHAVE_FILA(), JSON.stringify(f)); } catch (e) { toast("Não deu para guardar a venda neste aparelho (memória cheia).", "erro"); } desenharFaixaOffline(); }
  function guardarCache() {
    if (!S.offline) limparCofre();
    try {
      localStorage.setItem(CHAVE_CACHE(), JSON.stringify({ em: Date.now(), negocio: S.negocio, produtos: S.produtos.map((p) => ({ ...p, foto: "" })), meios: S.meios, unidades: S.unidades, pdv: S.pdv, operadores: S.operadores, caixa: S.caixa, fiscal: S.fiscal, recursos: S.recursos }));
    } catch (e) { /* sem espaço: abre só com internet */ }
  }
  function lerCache() { try { return JSON.parse(localStorage.getItem(CHAVE_CACHE()) || "null"); } catch (e) { return null; } }
  const novaRef = () => `off-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const ehErroDeRede = (e) => /Sem conexão com o servidor/.test((e && e.message) || "");
  // a venda vai para a fila (mostra o troco e o recibo normalmente; o número sai quando enviar)
  function guardarVendaOffline(corpo, cobr, t) {
    const fila = lerFila();
    const agora = new Date();
    const sessao = lerOperador();
    const item = { ref: corpo.refCliente, corpo: { ...corpo, feitaEm: agora.toISOString(), data: corpo.data || hoje() }, total: cobr.total, criadoEm: agora.toISOString(), erro: "",
      opOff: sessao && sessao.offline ? sessao.offline : null, operador: sessao ? sessao.operador.nome : "" };
    fila.push(item); gravarFila(fila);
    // baixa o estoque só na tela (o servidor baixa de verdade ao receber)
    corpo.itens.forEach((i) => {
      const p = i.produtoId && S.produtos.find((x) => x.id === i.produtoId); if (!p || !p.controlaEstoque) return;
      const v = i.variacaoId && p.variacoes.find((x) => x.id === i.variacaoId);
      if (v) v.estoque -= i.qtd; else p.estoque -= i.qtd;
    });
    const totC = Math.round(cobr.total * 100);
    const pagos = corpo.pagamentos || [{ meio: corpo.meio, valor: cobr.total }];
    const dinheiro = pagos.filter((p) => p.meio === "dinheiro").reduce((a, p) => a + Math.round(p.valor * 100), 0);
    const somaC = pagos.reduce((a, p) => a + Math.round(p.valor * 100), 0);
    const trocoC = Math.max(0, somaC - totC);
    return { venda: {
      id: null, offline: true, numero: `—`, data: item.corpo.data, criadoEm: item.criadoEm, total: cobr.total, subtotal: t.sub, desconto: t.desc, acrescimo: 0, cashbackUsado: 0, premioValor: 0,
      itens: corpo.itens.map((i) => ({ ...i, nome: i.nome || (S.carrinho.find((c) => c.produtoId === i.produtoId && c.variacaoId === i.variacaoId) || {}).nome || "Item" })),
      pagamentos: pagos.map((p) => ({ meio: p.meio, valor: p.meio === "dinheiro" && trocoC ? r2(p.valor - trocoC / 100) : p.valor })), troco: trocoC / 100, recebido: dinheiro / 100, cliente: S.cartCli ? S.cartCli.nome : (S.cartCliente || ""),
    }, alertas: [] };
  }
  let sincronizando = false;
  async function sincronizarFila(manual = false) {
    if (sincronizando) return;
    const fila = lerFila();
    if (!fila.some((x) => !x.erro || manual)) { desenharFaixaOffline(); return; }
    if (!navigator.onLine && !manual) return;
    sincronizando = true; desenharFaixaOffline();
    let enviadas = 0; const notas = [];
    for (const item of fila.slice()) {
      if (item.erro && !manual) continue;
      try {
        cabecalhoExtra = item.opOff ? { "x-operador-offline": item.opOff } : null;
        let r;
        try { r = await api("POST", "/estoque/vendas", { ...item.corpo, refCliente: item.ref }); } finally { cabecalhoExtra = null; }
        const atual = lerFila().filter((x) => x.ref !== item.ref); gravarFila(atual);
        enviadas += 1; S.offline = false;
        if (fiscalLigado() && S.fiscal.emitir === "sempre" && r.venda && !r.repetida) notas.push(r.venda.id);
      } catch (e) {
        if (ehErroDeRede(e)) { S.offline = true; break; }
        const atual = lerFila(); const x = atual.find((y) => y.ref === item.ref); if (x) { x.erro = e.message; gravarFila(atual); }
      }
    }
    sincronizando = false; desenharFaixaOffline();
    if (enviadas) {
      toast(`${enviadas === 1 ? "1 venda feita sem internet foi enviada" : `${enviadas} vendas feitas sem internet foram enviadas`}: estoque e financeiro atualizados.`, "ok");
      recarregarProdutos().then(() => { if (S.tab === "vender") { const g = $("#grade-pdv"); if (g) g.innerHTML = gradePdvHtml(); } guardarCache(); }).catch(() => {});
      api("GET", "/estoque/caixa").then((x) => { S.caixa = x.aberto; if (S.tab === "caixa" && !modalAberto()) carregarDaAba("caixa"); }).catch(() => {});
      for (const id of notas) { try { await api("POST", `/estoque/vendas/${id}/nfce`, {}); } catch (e) { /* fica para emitir no detalhe da venda */ } }
    }
  }
  function desenharFaixaOffline() {
    let el = $("#faixa-offline");
    const fila = lerFila(); const comErro = fila.filter((x) => x.erro).length; const pendentes = fila.length - comErro;
    const offline = S.offline || !navigator.onLine;
    if (!offline && !fila.length) { if (el) el.remove(); document.body.classList.remove("com-faixa-offline"); return; }
    if (!el) { el = document.createElement("div"); el.id = "faixa-offline"; document.body.appendChild(el); }
    document.body.classList.add("com-faixa-offline");
    el.className = `faixa-offline ${offline ? "sem-rede" : comErro ? "com-erro" : "enviando"}`;
    el.innerHTML = offline
      ? `<span><b>Sem internet.</b> Pode continuar vendendo no balcão: ${pendentes ? `${pendentes === 1 ? "1 venda guardada" : `${pendentes} vendas guardadas`} neste aparelho` : "as vendas ficam guardadas neste aparelho"} e são enviadas quando a conexão voltar.</span>${fila.length ? `<button class="btn mini claro" data-a="off-ver">Ver</button>` : ""}`
      : `<span>${sincronizando ? "Enviando as vendas feitas sem internet…" : pendentes ? `${pendentes === 1 ? "1 venda" : `${pendentes} vendas`} feita${pendentes === 1 ? "" : "s"} sem internet para enviar.` : ""}${comErro ? ` <b>${comErro === 1 ? "1 venda não foi aceita" : `${comErro} vendas não foram aceitas`}</b> pelo servidor.` : ""}</span><button class="btn mini claro" data-a="off-ver">Ver</button>${pendentes && !sincronizando ? `<button class="btn mini acento" data-a="off-enviar">Enviar agora</button>` : ""}`;
  }
  function abrirFilaOffline() {
    const fila = lerFila();
    abrirModal("Vendas feitas sem internet", fila.length ? `<p class="sub" style="margin-bottom:10px">Ficam neste aparelho até chegarem ao servidor. Não feche a conta do navegador nem limpe os dados do site antes de enviar.</p>
      <ul class="lista-simples">${fila.map((x) => `<li><span>${new Date(x.criadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${x.corpo.itens.length} ${x.corpo.itens.length === 1 ? "item" : "itens"}${x.operador ? ` · ${esc(x.operador)}` : ""}${x.erro ? `<small class="negativo" style="display:block">${esc(x.erro)}</small>` : `<small class="sub" style="display:block">aguardando internet</small>`}</span>
        <span class="linha"><b class="num">${fmt(x.total)}</b>${x.erro ? `<button class="btn mini perigo" data-a="off-descartar" data-ref="${esc(x.ref)}">Descartar</button>` : ""}</span></li>`).join("")}</ul>
      <div class="modal-rodape"><button class="btn claro" data-a="fechar-modal">Fechar</button><button class="btn acento" data-a="off-enviar">Tentar enviar agora</button></div>`
      : `<p class="sub">Nenhuma venda esperando para ser enviada.</p>`);
  }
  window.addEventListener("online", () => { S.offline = false; desenharFaixaOffline(); sincronizarFila(); });
  window.addEventListener("offline", () => { S.offline = true; desenharFaixaOffline(); });
  setInterval(() => { if (lerFila().some((x) => !x.erro)) sincronizarFila(); }, 20000);

  document.addEventListener("click", async (ev) => {
    const el = ev.target.closest("[data-a]");
    if (!el) return;
    const a = el.dataset.a;
    if (!/^(nfce-|fs-|off-)/.test(a)) return;
    switch (a) {
      case "nfce-emitir": acaoNota("emitir", el.dataset.id, el); break;
      case "nfce-consultar": acaoNota("consultar", el.dataset.id, el); break;
      case "nfce-cancelar": acaoNota("cancelar", el.dataset.id, el); break;
      case "fs-amb": FS.ambiente = el.dataset.v; render(); break;
      case "fs-emitir": FS.emitir = el.dataset.v; render(); break;
      case "fs-salvar": salvarFiscalTela(); break;
      case "fs-testar": {
        el.disabled = true;
        try { const r = await api("POST", "/estoque/fiscal/testar"); FS.msg = r.mensagem; FS.erro = ""; } catch (e) { FS.erro = e.message; FS.msg = ""; }
        render(); break;
      }
      case "off-ver": abrirFilaOffline(); break;
      case "off-enviar": { await sincronizarFila(true); if (modalAberto() && $(".modal-titulo") && /sem internet/.test($(".modal-titulo").textContent)) abrirFilaOffline(); break; }
      case "off-descartar": {
        if (!(await confirmarAcao({ mensagem: "Descartar esta venda? Ela não vai para o financeiro nem baixa o estoque.", botao: "Descartar", cancelar: "Voltar", sempre: true }))) break;
        gravarFila(lerFila().filter((x) => x.ref !== el.dataset.ref)); abrirFilaOffline(); break;
      }
      default: break;
    }
  });
  document.addEventListener("input", (ev) => { const t = ev.target; if (FS && t.matches("[data-fs]") && t.type !== "checkbox") FS[t.dataset.fs] = t.dataset.fs === "cnpj" ? t.value.replace(/\D/g, "") : t.value; });
  document.addEventListener("change", (ev) => { const t = ev.target; if (FS && t.matches('[data-fs="ativo"]')) FS.ativo = t.checked; });

  /* ---------- teclados na tela ---------- */
  function teclar(alvo, k) {
    if (alvo === "pin") {
      if (!TR || !TR.id) return;
      if (k === "ok") { entrarComPin(); return; }
      TR.pin = k === "⌫" ? TR.pin.slice(0, -1) : (TR.pin + k).slice(0, 6); TR.erro = "";
      desenharTrava(); if (TR.pin.length === 6) entrarComPin();
      return;
    }
    if (k === "ok") { const b = document.querySelector({ mv: '[data-a="mv-ok"]', fx: '[data-a="fx-ok"]', rf: '[data-a="rf-ok"]', cb: '[data-a="cb-ok"]' }[alvo]); if (b) b.click(); return; }
    if (k === "00" && alvo !== "pin") { teclar(alvo, "0"); teclar(alvo, "0"); return; }
    if (alvo === "mv" && MV) { MV.valor = aplicarTecla(MV.valor, k); const d = $("#mv-desc"); if (d) MV.descricao = d.value; const c = $("#mv-cat"); if (c) MV.categoria = c.value; corpoModal(movimentoHtml()); }
    else if (alvo === "fx" && FX) { const o = $("#fx-obs"); if (o) FX.obs = o.value; FX.contado[FX.campo] = aplicarTecla(FX.contado[FX.campo], k); corpoModal(fechamentoHtml()); }
    else if (alvo === "rf" && RF) { RF.valor = aplicarTecla(RF.valor, k); corpoModal(receberFiadoHtml()); }
    else if (alvo === "cb" && CB) { CB.valor = aplicarTecla(CB.valor, k); CB.erro = ""; corpoModal(cobrancaHtml()); }
  }

  /* ---------- celular: barra de abas embaixo, "Mais" e carrinho em folha ---------- */
  const ICONES = {};
  // restaurante: Caixa, Mesas, Cozinha, Pedidos (garçom: sem o Caixa); loja: Caixa, Vender, Produtos, Clientes
  function abasCelular() {
    const base = restaurante() ? (ehGarcom() ? ["mesas", "cozinha", "pedidos", "clientes"] : ["caixa", "mesas", "cozinha", "pedidos"]) : ["caixa", "vender", "produtos", "clientes"];
    const extras = ["vender", "caixa", "produtos", "compras", "clientes", "relatorios"].filter((t) => !base.includes(t));
    return [...base.filter(podeAba), ...extras.filter(podeAba)].slice(0, 4);
  }
  function desenharNavCelular() {
    const nav = $("#nav-cel"); if (!nav) return;
    document.querySelectorAll("#nav .nav-item[data-tab]").forEach((b) => { ICONES[b.dataset.tab] = b.querySelector("svg").outerHTML; });
    const principais = abasCelular();
    const nome = { caixa: "Caixa", vender: "Vender", pedidos: "Pedidos", produtos: "Produtos", clientes: "Clientes", mesas: "Mesas", cozinha: "Cozinha" };
    nav.innerHTML = principais.map((t) => `<button type="button" data-tab="${t}">${ICONES[t] || ""}<span>${nome[t]}</span>${t === "pedidos" ? `<i class="nav-cel-badge" id="badge-pedidos-cel" hidden></i>` : ""}</button>`).join("")
      + `<button type="button" data-a="nav-mais"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg><span>Mais</span></button>`;
  }
  function abrirMais() {
    const principais = abasCelular();
    const itens = [...document.querySelectorAll("#nav .nav-item[data-tab]:not([hidden]), .sidebar-footer .nav-item[data-tab]")].filter((b) => !principais.includes(b.dataset.tab) && podeAba(b.dataset.tab));
    const fundo = document.createElement("div");
    fundo.className = "mais-fundo"; fundo.setAttribute("data-a", "mais-fechar");
    fundo.innerHTML = `<div class="mais-folha" role="dialog" aria-label="Mais opções"><div class="mais-alca"></div>
      <div class="mais-grade">${itens.map((b) => `<button type="button" class="mais-item ${S.tab === b.dataset.tab ? "ativo" : ""}" data-tab="${b.dataset.tab}">${b.querySelector("svg").outerHTML}<span>${esc(b.querySelector("span").textContent)}</span></button>`).join("")}
        <a class="mais-item" href="/">${document.querySelector('.sidebar-footer a[href="/"] svg').outerHTML}<span>Trocar de aplicativo</span></a>
        ${ehGestor() && tem("equipe") ? `<a class="mais-item" href="../painel.html">${$("#nav-painel svg").outerHTML}<span>Painel do dono</span></a>` : ""}
        ${S.operadores.filter((o) => o.ativo).length && !ehFuncionario() ? `<button type="button" class="mais-item" data-a="trocar-operador"><span class="avatar">${lerOperador() ? inicial(lerOperador().operador.nome) : "?"}</span><span>${lerOperador() ? "Trocar operador" : "Entrar com PIN"}</span></button>` : ""}
        <button type="button" class="mais-item sair" id="sair-cel">${$("#sair svg").outerHTML}<span>Sair</span></button>
      </div></div>`;
    document.body.appendChild(fundo);
    fundo.querySelector("#sair-cel").addEventListener("click", sair);
    fundo.addEventListener("click", (e) => { if (e.target.closest(".mais-item")) setTimeout(() => fundo.remove(), 0); });
  }
  function abrirCarrinhoCelular() {
    abrirModal("Carrinho", `<div id="carrinho-folha">${carrinhoHtml()}</div>`, { aoFechar: () => { redesenharCarrinho(); } });
  }

  /* =====================================================================
     Cliques (um ouvinte só)
     ===================================================================== */
  document.addEventListener("click", async (ev) => {
    const nav = ev.target.closest(".nav-item[data-tab], .nav-cel button[data-tab], .mais-item[data-tab]");
    if (nav) { const fm = $(".mais-fundo"); if (fm) fm.remove(); irPara(nav.dataset.tab); return; }
    // teclado numérico na tela (valor, PIN)
    const tecla = ev.target.closest("[data-tecla]");
    if (tecla) { teclar(tecla.closest("[data-teclado]").dataset.teclado, tecla.dataset.tecla); return; }
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
      // produtos
      case "novo-produto": abrirProduto(null); break;
      case "editar-produto": if (ev.target.closest('[data-a="ajustar"]')) break; abrirProduto(S.produtos.find((x) => x.id === id)); break;
      case "filtro-prod": S.filtroProd = el.dataset.v; render(); break;
      case "ajustar": ev.stopPropagation(); abrirAjuste(id); break;
      case "salvar-produto": salvarProduto(); break;
      case "lixeira-prod": abrirLixeira(); break;
      case "lx-restaurar": {
        try { S.produtos = (await api("POST", `/estoque/produtos/${el.dataset.id}/restaurar`)).produtos; atualizarSeloEstoque(); LX.lista = LX.lista.filter((x) => x.id !== el.dataset.id); corpoModal(lixeiraHtml()); toast("Produto restaurado.", "ok"); if (S.tab === "produtos") render(); }
        catch (e) { toast(esc(e.message), "erro"); }
        break;
      }
      case "lx-apagar": {
        const x = LX.lista.find((i) => i.id === el.dataset.id); if (!x) break;
        if (!(await confirmarAcao({ titulo: "Apagar de vez?", mensagem: `“${x.nome}” vai ser apagado para sempre, com o histórico de estoque. As vendas já feitas continuam.`, botao: "Apagar de vez", sempre: true }))) break;
        try { await api("DELETE", `/estoque/produtos/lixeira/${x.id}`); LX.lista = LX.lista.filter((i) => i.id !== x.id); corpoModal(lixeiraHtml()); toast("Produto apagado."); }
        catch (e) { toast(esc(e.message), "erro"); }
        break;
      }
      case "excluir-produto": {
        if (!(await confirmarAcao({ mensagem: `Excluir “${PF.nome}”? Ele vai para a lixeira e pode ser restaurado por 60 dias, com estoque e histórico. Prefere só tirar das vendas? Desmarque “Produto ativo”.`, botao: "Mandar para a lixeira", cancelar: "Voltar", sempre: true }))) break;
        try { await api("DELETE", `/estoque/produtos/${PF.id}`); await recarregarProdutos(); fecharModal(); toast("Produto na lixeira. Para desfazer, abra Produtos → Lixeira.", "ok"); render(); } catch (e) { toast(esc(e.message), "erro"); }
        break;
      }
      case "tirar-foto": if (!(await confirmarAcao({ mensagem: "Tirar a foto deste produto?", botao: "Tirar foto", cancelar: "Voltar", chave: "foto-produto" }))) break; if (PF.id && PF.foto) { try { await api("PUT", `/estoque/produtos/${PF.id}/foto`, { foto: null }); await recarregarProdutos(); } catch (e) { toast(esc(e.message), "erro"); break; } } PF.foto = ""; PF.fotoNova = null; redesenharProduto(); break;
      case "add-var-linha": PF.variacoes.push({ nome: "", preco: "", custo: "", estoqueInicial: "", estoqueMinimo: "" }); redesenharProduto(); break;
      case "tirar-var": {
        const v = PF.variacoes[Number(el.dataset.i)];
        if (v && v.id && v.estoque && !(await confirmarAcao({ mensagem: `A variação “${v.nome}” tem ${fmtN(v.estoque)} em estoque. Tirar mesmo assim?`, botao: "Tirar", cancelar: "Voltar", sempre: true }))) break;
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
        if (!(await confirmarAcao({ mensagem: "Cancelar esta compra? A mercadoria sai do estoque e a despesa sai do Controle financeiro.", botao: "Cancelar compra", cancelar: "Voltar", sempre: true }))) break;
        try { await api("POST", `/estoque/compras/${id}/cancelar`); await recarregarProdutos(); toast("Compra cancelada."); carregarDaAba("compras"); } catch (e) { toast(esc(e.message), "erro"); }
        break;
      }
      // gastos
      case "salvar-gasto": salvarGasto(); break;
      case "excluir-gasto": {
        if (!(await confirmarAcao({ mensagem: "Excluir esta nota de gasto? Ela sai também do Controle financeiro.", botao: "Excluir", cancelar: "Voltar", sempre: true }))) break;
        try { await api("DELETE", `/estoque/gastos/${encodeURIComponent(id)}`); toast("Gasto excluído."); carregarDaAba("relatorios"); } catch (e) { toast(esc(e.message), "erro"); }
        break;
      }
      // vendas
      case "mes-vendas": {
        const [y, m] = S.mesVendas.split("-").map(Number); const d = new Date(y, m - 1 + Number(el.dataset.d), 1);
        S.mesVendas = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; S.vendas = null; S.analise = null; render(); carregarDaAba("relatorios"); break;
      }
      case "ver-venda": verVenda(id); break;
      case "cancelar-venda": {
        if (!(await confirmarAcao({ mensagem: "Cancelar esta venda? Os produtos voltam para o estoque e a receita sai do Controle financeiro.", botao: "Cancelar venda", cancelar: "Voltar", sempre: true }))) break;
        try { await api("POST", `/estoque/vendas/${id}/cancelar`); await recarregarProdutos(); fecharModal(); toast("Venda cancelada."); carregarDaAba("relatorios"); } catch (e) { toast(esc(e.message), "erro"); }
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
        if (!(await confirmarAcao({ mensagem: "Recusar este pedido? Avise o cliente pelo WhatsApp.", botao: "Recusar", cancelar: "Voltar", sempre: true }))) break;
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
      // caixa do dia
      case "cx-abrir": {
        const troco = numOu($("#cx-troco") && $("#cx-troco").value, 0);
        el.disabled = true;
        try { const r = await api("POST", "/estoque/caixa/abrir", { trocoInicial: troco }); S.caixa = r.aberto; toast(`Caixa #${r.aberto.caixa.numero} aberto. Boas vendas!`, "ok"); render(); }
        catch (e) { el.disabled = false; toast(esc(e.message), "erro"); }
        break;
      }
      case "cx-mov": abrirMovimento(el.dataset.v); break;
      case "mv-ok": salvarMovimento(); break;
      case "cx-fechar": abrirFechamento(); break;
      case "fx-campo": { const o = $("#fx-obs"); if (o) FX.obs = o.value; FX.campo = el.dataset.v; corpoModal(fechamentoHtml()); break; }
      case "fx-ok": confirmarFechamento(); break;
      case "imprimir-caixa": if (S.caixaDetalhe) imprimirHtml(`Caixa #${S.caixaDetalhe.caixa.numero}`, relatorioCaixaHtml(S.caixaDetalhe)); break;
      case "ver-caixa": {
        try { const r = await api("GET", `/estoque/caixa/${id}`); S.caixaDetalhe = r;
          abrirModal(`Caixa #${r.caixa.numero}`, relatorioCaixaHtml(r) + `<div class="modal-rodape"><button class="btn claro" data-a="imprimir-caixa">Imprimir</button><button class="btn acento" data-a="fechar-modal">Fechar</button></div>`, { largo: true });
        } catch (e) { toast(esc(e.message), "erro"); }
        break;
      }
      case "cx-fiado": abrirReceberFiado(); break;
      case "fc-receber": abrirReceberFiado(FC.id); break;
      case "rf-cliente": RF.clienteId = id; corpoModal(`<p class="sub">Carregando…</p>`); try { RF.conta = await api("GET", `/estoque/clientes/${id}/fiado`); corpoModal(receberFiadoHtml()); } catch (e) { toast(esc(e.message), "erro"); } break;
      case "rf-meio": RF.meio = el.dataset.v; corpoModal(receberFiadoHtml()); break;
      case "rf-tudo": RF.valor = textoDeCentavos(Math.round(RF.conta.total * 100)); corpoModal(receberFiadoHtml()); break;
      case "rf-ok": confirmarFiado(); break;
      case "ver-fiado": S.filtroCli = "fiado"; S.clientes = null; irPara("clientes"); break;
      case "rel-aba": S.relAba = el.dataset.v; render(); carregarDaAba("relatorios"); break;
      // cobrança
      case "cb-meio": CB.meio = el.dataset.v; CB.valor = ""; CB.erro = ""; corpoModal(cobrancaHtml()); break;
      case "cb-rapido": CB.valor = textoDeCentavos(Number(el.dataset.v)); corpoModal(cobrancaHtml()); break;
      case "cb-dividir": { const c = centavosDeTexto(CB.valor); if (c) { CB.pagos.push({ meio: CB.meio, c }); CB.valor = ""; CB.meio = CB.meio === "dinheiro" ? "pix" : "dinheiro"; CB.erro = ""; corpoModal(cobrancaHtml()); } break; }
      case "cb-tirar": CB.pagos.splice(Number(el.dataset.i), 1); corpoModal(cobrancaHtml()); break;
      case "cb-ok": concluirCobranca(); break;
      case "recibo-imprimir": if (S.ultimaVenda) imprimirRecibo(S.ultimaVenda.venda); break;
      case "recibo-whats": if (S.ultimaVenda) reciboWhats(S.ultimaVenda.venda, S.ultimaVenda.tel); break;
      // operador (PIN)
      case "trocar-operador": esquecerOperador(); atualizarChipOperador(); mostrarTrava(); break;
      case "tr-op": TR.id = id; TR.pin = ""; TR.erro = ""; desenharTrava(); break;
      case "tr-voltar": TR.id = null; TR.pin = ""; TR.erro = ""; desenharTrava(); break;
      case "tr-fechar": { TR = null; const t = $("#trava"); if (t) t.remove(); break; }
      case "op-novo": abrirOperador(null); break;
      case "op-editar": abrirOperador(S.operadores.find((o) => o.id === id)); break;
      case "op-papel": OPF.nome = $("#op-nome").value; OPF.papel = el.dataset.v; corpoModal(operadorHtml()); break;
      case "op-salvar": salvarOperadorTela(); break;
      case "op-excluir": {
        if (!(await confirmarAcao({ mensagem: `Excluir o operador ${OPF.nome}? As vendas dele continuam com o nome registrado.`, botao: "Excluir", cancelar: "Voltar", sempre: true }))) break;
        try { await api("DELETE", `/estoque/operadores/${OPF.id}`); S.operadores = (await api("GET", "/estoque/operadores")).operadores; PC = null; fecharModal(); atualizarChipOperador(); render(); } catch (e) { OPF.erro = e.message; corpoModal(operadorHtml()); }
        break;
      }
      case "salvar-pc": salvarCaixaConfig(); break;
      case "nav-mais": abrirMais(); break;
      case "mais-fechar": { const fm = $(".mais-fundo"); if (fm) fm.remove(); break; }
      case "ver-carrinho": abrirCarrinhoCelular(); break;
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
      case "fc-crm-criar":
        try { const r = await api("POST", `/estoque/clientes/${FC.id}/crm`); toast(r.jaExistia ? "Esse telefone já estava no CRM." : "Contato criado no CRM, na primeira etapa do funil."); await carregarCrmDaFicha(FC.id); } catch (e) { toast(esc(e.message), "erro"); }
        break;
      case "fc-editar": FC.edit = { nome: FC.dados.cliente.nome, telefone: telFmt(FC.dados.cliente.telefone), endereco: FC.dados.cliente.endereco, obs: FC.dados.cliente.obs, participa: FC.dados.cliente.participa }; FC.erro = ""; corpoModal(fichaHtml()); break;
      case "fc-cancelar": FC.edit = null; corpoModal(fichaHtml()); break;
      case "fc-salvar": {
        try { await api("PUT", `/estoque/clientes/${FC.id}`, FC.edit); FC.edit = null; await recarregarFicha(); if (S.tab === "clientes") { await carregarClientes(); } }
        catch (e) { FC.erro = e.message; corpoModal(fichaHtml()); }
        break;
      }
      case "fc-excluir": {
        if (!(await confirmarAcao({ mensagem: `Excluir ${FC.dados.cliente.nome || "este cliente"}? As vendas continuam no histórico, só sem a ligação com ele. O saldo do programa de fidelidade é perdido.`, botao: "Excluir", cancelar: "Voltar", sempre: true }))) break;
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
    if (PF && t.matches("[data-pf-fiscal]")) { PF.fiscal = { ...(PF.fiscal || {}), [t.dataset.pfFiscal]: t.value.replace(/\D/g, "") }; return; }
    if (PF && t.matches("[data-var]")) { PF.variacoes[Number(t.dataset.var)][t.dataset.campo] = t.value; return; }
    if (PF && t.matches("[data-op]") && t.tagName === "INPUT") { PF.opcoes[Number(t.dataset.op)][t.dataset.campo] = t.value; return; }
    if (PF && t.matches("[data-esc]")) { const [g, e] = t.dataset.esc.split(":").map(Number); PF.opcoes[g].escolhas[e][t.dataset.campo] = t.value; return; }
    if (AJ && t.matches("[data-aj]") && t.tagName === "INPUT") { AJ[t.dataset.aj] = t.value; return; }
    if (CP && t.matches("[data-cpl]") && t.tagName === "INPUT") { CP.linhas[Number(t.dataset.cpl)][t.dataset.campo] = t.value; atualizarTotalCompra(); return; }
    if (CP && t.matches("[data-cp]") && t.type !== "checkbox" && t.tagName !== "SELECT") { CP[t.dataset.cp] = t.value; if (t.dataset.cp === "frete") atualizarTotalCompra(); return; }
    if (t.matches("[data-g]") && t.type !== "checkbox" && t.tagName !== "SELECT") { S.gasto[t.dataset.g] = t.value; return; }
    if (CF && t.matches("[data-cf]") && t.type !== "checkbox") { CF[t.dataset.cf] = t.value; return; }
    if (CFG && t.matches("[data-cfg]") && t.type !== "checkbox" && t.tagName !== "SELECT") { CFG[t.dataset.cfg] = t.value; return; }
    if (PC && t.matches("[data-pc]") && t.type !== "checkbox") { PC[t.dataset.pc] = t.value; return; }
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
    if (PC && t.matches("[data-pc]") && t.type === "checkbox") { PC[t.dataset.pc] = t.checked; return; }
  });
  // Enter na busca do balcão: leitor de código de barras (ou um resultado só) cai direto no carrinho
  document.addEventListener("keydown", (ev) => {
    const t = ev.target;
    const teclado = document.querySelector("#trava [data-teclado]") || document.querySelector("#modal [data-teclado]");
    if (teclado && !(t.matches && t.matches("input, textarea, select"))) {
      const alvo = teclado.dataset.teclado;
      if (/^[0-9]$/.test(ev.key)) { ev.preventDefault(); teclar(alvo, ev.key); return; }
      if (ev.key === "Backspace") { ev.preventDefault(); teclar(alvo, "⌫"); return; }
      if (ev.key === "Enter") { ev.preventDefault(); teclar(alvo, "ok"); return; }
    }
    if (ev.key === "Escape" && modalAberto()) { fecharModal(); return; }
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
  // virou celular/computador (girar o tablet, redimensionar a janela): o carrinho muda de lugar
  let rTimer = null;
  window.addEventListener("resize", () => { clearTimeout(rTimer); rTimer = setTimeout(() => { if (S.tab === "vender" && !modalAberto()) redesenharCarrinho(); }, 200); });
  $("#sair").addEventListener("click", sair);
  $("#abrir-menu").addEventListener("click", () => $("#app").classList.add("menu-aberto"));
  $("#menu-fundo").addEventListener("click", () => $("#app").classList.remove("menu-aberto"));

  /* ----------------------------- início ----------------------------- */
  async function iniciar() {
    $("#boas-vindas").innerHTML = `<div class="carregando"><p>Carregando o PDV…</p></div>`;
    try {
      const [d] = await Promise.all([api("GET", "/estoque"), carregarAcesso()]);
      S.negocio = d.negocio; S.produtos = d.produtos; S.meios = d.meios; S.unidades = d.unidades;
      S.pdv = d.pdv || {}; S.recursos = d.recursos || null; S.operadores = tem("equipe") ? (d.operadores || []) : []; S.caixa = d.caixa ? d.caixa.aberto : null;
      S.fiscal = d.fiscal || null;
      if (S.caixa) S.ultimoTroco = 0;
      guardarCache();
    } catch (e) {
      // sem internet: abre com o cadastro guardado neste aparelho (só para vender no balcão)
      const cache = ehErroDeRede(e) ? lerCache() : null;
      if (cache && cache.negocio && cache.negocio.checklist && cache.negocio.checklist.configurado) {
        Object.assign(S, { negocio: cache.negocio, produtos: cache.produtos || [], meios: cache.meios || [], unidades: cache.unidades || [], pdv: cache.pdv || {}, operadores: cache.operadores || [], caixa: cache.caixa || null, fiscal: cache.fiscal || null, recursos: cache.recursos || null, offline: true });
        if (!tem("equipe")) S.operadores = [];
        $("#boas-vindas").innerHTML = "";
        abrirApp(); irPara("vender"); desenharFaixaOffline();
        if (pinObrigatorio() && !lerOperador()) mostrarTrava();
        return;
      }
      const semPermissao = /^O gestor da sua equipe/.test(e.message || "");
      $("#boas-vindas").innerHTML = `<div class="carregando"><p>${esc(e.message)}</p>${semPermissao ? `<p>Peça para o gestor liberar em Equipe → Permissões, no CRM.</p>` : `<button class="btn" id="de-novo">Tentar de novo</button>`}<p><a href="/">Voltar</a></p></div>`;
      const b = $("#de-novo"); if (b) b.addEventListener("click", iniciar);
      return;
    }
    if (!S.negocio || !(S.negocio.checklist && S.negocio.checklist.configurado)) { telaBoasVindas(); return; }
    $("#boas-vindas").innerHTML = "";
    abrirApp();
    if (pinObrigatorio() && !lerOperador() && !ehFuncionario()) mostrarTrava();
    desenharFaixaOffline(); sincronizarFila();
  }
  iniciar();
})();
