/* =======================================================================
   Meu perfil: aparência (modo escuro e cor de destaque, como no CRM) e
   evolução por níveis, com missões ligadas ao perfil do personagem.
   ======================================================================= */

/* ---------------- Aparência ---------------- */
TELAS.aparencia = {
  ordemNoPerfil: 20,
  noPerfil() {
    const escolha = (state.config && state.config.corDestaque) || "crm";
    const char = getCharacter();
    const corPersonagem = (char ? PROFILE_COLORS[char.profile] : PROFILE_COLORS.organizadora).primary;
    let corCrm = ACCENT_PRESETS[0];
    try { corCrm = localStorage.getItem("accentColor") || ACCENT_PRESETS[0]; } catch (e) { /* ignora */ }
    const ativo = (v) => (escolha.toLowerCase() === v.toLowerCase() ? "active" : "");
    return `<div class="card" style="margin-bottom:20px">
      <h2 class="section-title" style="border-color:var(--char)">Aparência</h2>
      <label class="settings-toggle-row"><span>Modo noturno <small class="stat-sub">(vale também no CRM)</small></span>
        <button type="button" class="switch ${modoEscuro() ? "on" : ""}" id="toggle-escuro" role="switch" aria-checked="${modoEscuro()}"><span class="switch-knob"></span></button></label>
      <div class="sub-titulo" style="margin-top:14px">Cor de destaque</div>
      <div class="cor-opcoes">
        <button type="button" class="cor-opcao ${ativo("personagem")}" data-cor="personagem"><span class="cor-amostra" style="background:${corPersonagem}"></span>Cor do personagem</button>
        <button type="button" class="cor-opcao ${ativo("crm")}" data-cor="crm"><span class="cor-amostra" style="background:${corCrm}"></span>A mesma do CRM</button>
      </div>
      <div class="theme-swatches">${ACCENT_PRESETS.map((c) => `<button type="button" class="theme-swatch ${ativo(c)}" data-cor="${c}" style="background:${c}" title="${c}" aria-label="Cor ${c}"></button>`).join("")}
        <label class="theme-custom-label">Outra cor <input type="color" id="cor-livre" value="${/^#/.test(escolha) ? escolha : corPersonagem}" /></label></div>
      <div class="sub-titulo" style="margin-top:18px">Acessibilidade</div>
      <div data-a11y-painel style="margin-top:8px"></div>
    </div>`;
  },
  ligarNoPerfil() {
    const t = document.getElementById("toggle-escuro");
    if (!t) return;
    t.addEventListener("click", () => { definirModoEscuro(!modoEscuro()); render(); });
    const escolher = (v) => { state.config = { ...state.config, corDestaque: v }; saveConfig(); render(); };
    document.querySelectorAll("[data-cor]").forEach((b) => b.addEventListener("click", () => escolher(b.dataset.cor)));
    document.getElementById("cor-livre").addEventListener("change", (e) => escolher(e.target.value));
  },
};

/* ---------------- Assinatura ---------------- */
TELAS.assinatura = {
  ordemNoPerfil: 5,
  noPerfil() {
    const s = state.assinatura;
    if (!s || !s.cobranca || s.status === "cortesia") return "";
    const plano = (s.planos || []).find((p) => p.id === s.plano);
    const data = (v) => (v ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + "T12:00:00" : v).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
    const rotulos = { aguardando: "aguardando pagamento", ativa: "ativa", atrasada: "pagamento atrasado", cancelada: "cancelada" };
    const texto = s.emTeste
      ? `Teste grátis até ${data(s.testeAte)} — tudo liberado.`
      : `${plano ? "Plano " + plano.nome : "Assinatura"}: ${rotulos[s.status] || s.status}${s.pagoAte ? ` · ${s.status === "cancelada" ? "acesso até" : "pago até"} ${data(s.pagoAte)}` : ""}.`;
    return `<div class="card" style="margin-bottom:20px">
      <h2 class="section-title" style="border-color:var(--char)">Assinatura</h2>
      <p style="font-size:14px;margin:0 0 12px">${escapeHtml(texto)}</p>
      <a class="btn char" href="../assinatura.html?de=financeiro" style="display:inline-block;text-decoration:none">${s.temAssinatura ? "Gerenciar assinatura" : "Ver planos e assinar"}</a>
    </div>`;
  },
};

/* ---------------- Lembretes de vencimento ---------------- */
TELAS.lembretes = {
  ordemNoPerfil: 25,
  noPerfil() {
    const ligado = !(state.config && state.config.lembretesVencimento === false);
    return `<div class="card" style="margin-bottom:20px">
      <h2 class="section-title" style="border-color:var(--char)">Lembretes</h2>
      <label class="settings-toggle-row"><span>Avisar no celular as contas que vencem hoje e amanhã</span>
        <button type="button" class="switch ${ligado ? "on" : ""}" id="toggle-lembretes" role="switch" aria-checked="${ligado}"><span class="switch-knob"></span></button></label>
      <p class="stat-sub">Um aviso por dia, de manhã. Pra receber, ative as notificações neste aparelho no CRM, em <b>Configurações → Notificações</b>.</p>
    </div>`;
  },
  ligarNoPerfil() {
    const t = document.getElementById("toggle-lembretes");
    if (t) t.addEventListener("click", () => { state.config = { ...state.config, lembretesVencimento: state.config.lembretesVencimento === false }; saveConfig(); render(); });
  },
};

/* ---------------- Evolução: níveis com missões do perfil ---------------- */
// Média de despesas por mês nos últimos 3 meses (pra metas de reserva)
function despesaMediaMensal() {
  let t = 0; for (let i = 1; i <= 3; i++) t += sumsFromOccurrences(occurrencesForMonth(Calculos.somarMeses(mesAtual(), -i))).desp;
  return t / 3;
}
// Quantos dos últimos meses fechados (até 6) seguidos ficaram dentro do orçamento
function mesesSeguidosNoOrcamento() {
  let n = 0;
  for (let i = 1; i <= 6; i++) { if (window.mesDentroDoOrcamento && mesDentroDoOrcamento(Calculos.somarMeses(mesAtual(), -i))) n++; else break; }
  return n;
}
function mesesComLancamento() { return new Set(state.txs.map((t) => Calculos.anoMes(t.date))).size; }
function mesesPositivosSeguidos() {
  let n = 0;
  for (let i = 1; i <= 6; i++) { const s = sumsFromOccurrences(occurrencesForMonth(Calculos.somarMeses(mesAtual(), -i))); if (s.rec > 0 && s.saldo > 0) n++; else break; }
  return n;
}
const reservaEmMeses = () => { const media = despesaMediaMensal(); if (!media) return 0; const dados = dadosParaCalculo(); const guardado = state.contas.filter((k) => /Poupança|Investimento/.test(k.tipo || "")).reduce((a, k) => a + Calculos.saldoDaConta(k, dados), 0) + state.invs.reduce((a, i) => a + (Number(i.current) || 0), 0); return guardado / media; };
const dividaQuitada = () => state.dividas.some((d) => d.quitadaEm || (d.pagamentos && d.pagamentos.length && !(d.saldo > 0.005)));

// Missões por perfil: cada nível tem uma meta concreta. O nível 1 é o começo.
const MISSOES = {
  organizadora: [
    { titulo: "Registrar receitas e despesas em 2 meses diferentes", feito: () => mesesComLancamento() >= 2 },
    { titulo: "Definir orçamento para pelo menos 3 categorias", feito: () => state.orcamentos.length >= 3 },
    { titulo: "Fechar um mês dentro do orçamento", feito: () => mesesSeguidosNoOrcamento() >= 1 },
    { titulo: "Ter uma reserva de 3 meses de despesas (poupança ou investimentos)", feito: () => reservaEmMeses() >= 3 },
  ],
  recomeco: [
    { titulo: "Cadastrar suas dívidas na aba Dívidas", feito: () => state.dividas.length >= 1 },
    { titulo: "Registrar um pagamento de dívida", feito: () => state.dividas.some((d) => (d.pagamentos || []).length) },
    { titulo: "Fechar um mês com mais receitas do que despesas", feito: () => mesesPositivosSeguidos() >= 1 },
    { titulo: "Quitar uma dívida", feito: dividaQuitada },
  ],
  consumista: [
    { titulo: "Definir um orçamento (comece por Lazer ou Compras)", feito: () => state.orcamentos.length >= 1 },
    { titulo: "Fechar um mês sem estourar nenhum orçamento", feito: () => mesesSeguidosNoOrcamento() >= 1 },
    { titulo: "Criar um objetivo pra juntar dinheiro", feito: () => state.goals.length >= 1 },
    { titulo: "Ficar 3 meses seguidos dentro do orçamento", feito: () => mesesSeguidosNoOrcamento() >= 3 },
  ],
  investidora: [
    { titulo: "Cadastrar suas contas com o saldo atual", feito: () => state.contas.length >= 1 },
    { titulo: "Cadastrar um investimento", feito: () => state.invs.length >= 1 },
    { titulo: "Ter uma reserva de emergência de 6 meses de despesas", feito: () => reservaEmMeses() >= 6 },
    { titulo: "Fechar 3 meses seguidos guardando dinheiro", feito: () => mesesPositivosSeguidos() >= 3 },
  ],
};
function missoesDoPerfil() {
  const char = getCharacter();
  return MISSOES[(char && char.profile) || "organizadora"];
}
// Nível = 1 + missões cumpridas EM ORDEM (a missão seguinte só conta depois da anterior)
function computeLevel() {
  let nivel = 1;
  for (const m of missoesDoPerfil()) { if (m.feito()) nivel++; else break; }
  return nivel;
}
TELAS.niveis = {
  ordemNoPerfil: 10,
  noPerfil() {
    const missoes = missoesDoPerfil();
    const nivel = computeLevel();
    const char = getCharacter();
    return `<div class="card" style="margin-bottom:20px">
      <h2 class="section-title" style="border-color:var(--char)">Evolução</h2>
      <p style="font-size:13px;color:var(--ink-muted);margin-top:0">Nível ${nivel} de ${missoes.length + 1}${char ? ` · missões do perfil "${escapeHtml(char.title)}"` : ""}</p>
      <div class="level-track">${missoes.concat([null]).map((_, i) => `<div class="level-dot ${i + 1 <= nivel ? "done" : ""}">${i + 1}</div>`).join("")}</div>
      <ol class="missoes">${missoes.map((m, i) => {
        const feito = i + 2 <= nivel;
        const atual = i + 2 === nivel + 1;
        return `<li class="${feito ? "feita" : atual ? "atual" : ""}"><span class="missao-check">${feito ? "✓" : i + 2}</span><span>${escapeHtml(m.titulo)}${atual ? ` <span class="tag ajuste">próxima</span>` : ""}</span></li>`;
      }).join("")}</ol>
      ${nivel > missoes.length ? `<p class="aviso-suave ok">🎉 Você completou todas as missões do seu perfil. Que tal refazer as perguntas e ver se seu perfil mudou?</p>` : ""}
    </div>`;
  },
};

// Seções extras de Meu perfil, na ordem
function secoesDoPerfil() {
  return Object.values(TELAS).filter((t) => t.noPerfil).sort((a, b) => (a.ordemNoPerfil || 99) - (b.ordemNoPerfil || 99)).map((t) => t.noPerfil()).join("");
}
