/* Painel do dono: resumo do negócio, equipe (funções e o que cada um pode usar), entrada pelo
   celular (código da loja) e aparelho da loja. Dados: GET /api/gestao; a equipe usa as rotas de
   operadores do PDV (/api/estoque/operadores). Só o dono (ou quem tem a função de gestor). */
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => Comum.esc(s); // js/comum.js
  const fmt = (v) => (Number.isFinite(Number(v)) ? Comum.dinheiro(v) : '—');
  const quando = (d) => {
    if (!d) return 'nunca';
    const t = new Date(d); const min = Math.round((Date.now() - t.getTime()) / 60000);
    if (min < 2) return 'agora há pouco'; if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60); if (h < 24) return `há ${h} h`;
    return t.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };
  if (!localStorage.getItem('token')) { window.location.href = 'login.html'; return; }

  let D = null; let ED = null;
  /* Abas: Resumo, Equipe e Acessos. A escolhida fica no endereço (#equipe) e neste aparelho. */
  const ABAS = [['resumo', 'Resumo'], ['equipe', 'Equipe'], ['acessos', 'Acessos']];
  let aba = (() => {
    const h = (location.hash || '').slice(1);
    if (ABAS.some(([id]) => id === h)) return h;
    try { const g = localStorage.getItem('painel-aba'); if (ABAS.some(([id]) => id === g)) return g; } catch (e) { /* nada */ }
    return 'resumo';
  })();

  // chamada com o PIN, quando o servidor pedir (PDV com PIN exigido): mostra "quem está usando" e tenta de novo
  async function api(metodo, caminho, corpo, tentou = false) {
    try { return await Acesso.chamar(metodo, caminho, corpo); }
    catch (e) {
      if (e.status === 401) { Acesso.sair(); throw e; }
      if (e.status === 403 && e.dados && e.dados.operador && !tentou) {
        const ok = await Acesso.garantirPessoa(true);
        if (ok) return api(metodo, caminho, corpo, true);
      }
      throw e;
    }
  }

  async function carregar() {
    const i = await Acesso.info(true);
    if (!i.gestor) {
      $('#pd-sub').textContent = '';
      $('#pd-conteudo').innerHTML = `<div class="ass-cartao"><p class="ass-texto" style="margin:0">O Painel do dono é só do gestor do negócio. ${i.operador ? `Você está usando como <b>${esc(i.operador.nome)}</b> (${esc(i.operador.funcao)}).` : ''}</p></div>`;
      return;
    }
    try { D = await api('GET', '/gestao'); }
    catch (e) { $('#pd-conteudo').innerHTML = `<p class="ass-erro">${esc(e.message)}</p>`; return; }
    $('#pd-sub').textContent = D.negocio.nome ? `${D.negocio.nome} · o seu negócio e a sua equipe` : 'O seu negócio e a sua equipe';
    desenhar();
  }

  /* ---------------- telas ---------------- */
  function resumoHtml() {
    const r = D.resumo;
    const kpi = (rot, val, sub, cls = '') => `<div class="dono-kpi ${cls}"><p class="dono-kpi-rotulo">${rot}</p><p class="dono-kpi-valor">${val}</p>${sub ? `<p class="dono-kpi-sub">${sub}</p>` : ''}</div>`;
    const v = r.vendidoNoMes; const f = r.financeiro;
    const negocio = v ? `<section aria-labelledby="t-negocio"><h2 class="pd-h3" id="t-negocio">O negócio no mês</h2><div class="dono-kpis pd-kpis">
      ${kpi('Vendido no mês', fmt(v.total), `balcão ${fmt(v.balcao)} · CRM ${fmt(v.crm)}`)}
      ${f ? kpi('Resultado da Empresa', fmt(f.empresa.saldo), `receitas ${fmt(f.empresa.receitas)} · despesas ${fmt(f.empresa.despesas)} · <a href="financeiro/#lucro" style="color:inherit;font-weight:600">ver no Controle financeiro</a>`, f.empresa.saldo < 0 ? 'alerta' : '') : ''}
      ${f && f.pendente ? kpi('Ainda a pagar/receber', fmt(f.pendente), 'lançamentos do mês que não estão pagos') : ''}
    </div></section>` : '';
    return `${negocio}<section aria-labelledby="t-vendas"><h2 class="pd-h3" id="t-vendas">Vendas no balcão (PDV)</h2><div class="dono-kpis pd-kpis">
      ${kpi('Hoje', fmt(r.hoje.total), `${r.hoje.vendas} ${r.hoje.vendas === 1 ? 'venda' : 'vendas'} no balcão`)}
      ${kpi('No mês', fmt(r.mes.total), `${r.mes.vendas} vendas · ticket médio ${fmt(r.mes.ticket)}`)}
      ${r.mes.lucro !== undefined ? kpi('Lucro bruto no mês', fmt(r.mes.lucro), 'vendas menos o custo da mercadoria e as taxas', r.mes.lucro < 0 ? 'alerta' : '') : ''}
    </div></section>
    <section aria-labelledby="t-agora"><h2 class="pd-h3" id="t-agora">Agora</h2><div class="dono-kpis pd-kpis">
      ${kpi('Caixa', r.caixa ? (r.caixa.esquecido ? `Aberto há ${r.caixa.horas >= 48 ? Math.floor(r.caixa.horas / 24) + ' dias' : r.caixa.horas + ' h'}` : 'Aberto') : 'Fechado', r.caixa ? `nº ${r.caixa.numero}${r.caixa.abertoPor ? ` · por ${esc(r.caixa.abertoPor)}` : ''} · ${quando(r.caixa.desde)}${r.caixa.esquecido ? ' · feche no PDV para conferir o dia' : ''}` : 'nenhum caixa aberto agora', r.caixa && r.caixa.esquecido ? 'alerta' : '')}
      ${r.mesasEsquecidas && r.mesasEsquecidas.length ? kpi('Mesas abertas há muito tempo', String(r.mesasEsquecidas.length), `${r.mesasEsquecidas.slice(0, 3).map((m) => esc(m.nome)).join(', ')}${r.mesasEsquecidas.length > 3 ? '…' : ''} · mais de 6 horas`, 'alerta') : ''}
      ${kpi('CRM no mês', `${r.crm.novos} ${r.crm.novos === 1 ? 'contato novo' : 'contatos novos'}`, `${r.crm.ganhos} ${r.crm.ganhos === 1 ? 'negociação ganha' : 'negociações ganhas'} · ${fmt(r.crm.ganhosValor)}`)}
      ${kpi('Cancelamentos no mês', String(r.canceladas.vendas), `${fmt(r.canceladas.total)} · descontos ${fmt(r.mes.descontos)}`, r.canceladas.vendas >= 5 ? 'alerta' : '')}
    </div></section>`;
  }
  function equipeHtml() {
    if (D.recursos && D.recursos.equipe === false) {
      return `<section aria-labelledby="t-equipe"><h2 class="ass-h2" id="t-equipe">Equipe</h2><div class="ass-cartao pd-completo"><span class="ass-selo">Plano Completo</span>
        <p class="ass-texto">Cadastre a equipe com funções (gerente, vendedor, estoquista, caixa, garçom), escolha o que cada pessoa pode ver e deixe cada uma entrar pelo próprio celular com um PIN. Faz parte do plano Completo.</p>
        <div class="ass-acoes"><a class="ass-btn ass-btn-forte" href="assinatura.html">Ver planos</a></div></div></section>`;
    }
    const linhas = D.equipe.map((o) => `<tr class="pd-linha" data-a="editar" data-id="${esc(o.id)}">
      <td><b>${esc(o.nome)}</b>${o.ativo ? '' : ' <span class="ass-selo">inativo</span>'}</td>
      <td>${esc(o.funcao)}${Object.keys(o.permissoes || {}).length ? ' <span class="pd-ajuste" title="Com ajustes nesta pessoa">ajustado</span>' : ''}</td>
      <td>${quando(o.ultimoAcesso)}</td>
      <td class="num pd-so-largo">${o.mes.vendas ? `${o.mes.vendas} · ${fmt(o.mes.total)}` : '—'}</td>
      <td><button type="button" class="ass-btn pd-mini" data-a="editar" data-id="${esc(o.id)}">Editar</button></td></tr>`).join('');
    return `<section aria-labelledby="t-equipe"><div class="pd-titulo-linha"><div><h2 class="pd-h3" id="t-equipe">Quem trabalha com você</h2><p class="ass-miudo" style="margin:2px 0 0">Cada pessoa tem uma função e um PIN. Toque em Editar para trocar a função, o PIN ou o que ela pode ver.</p></div><button type="button" class="ass-btn ass-btn-forte" data-a="novo">+ Adicionar pessoa</button></div>
      ${D.equipe.length ? `<div class="dono-tabela-wrap"><table class="dono-tabela pd-tabela"><thead><tr><th>Nome</th><th>Função</th><th>Último acesso</th><th class="pd-so-largo">Vendas no mês</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>${linhas}</tbody></table></div>`
        : `<div class="ass-cartao"><p class="ass-texto" style="margin:0">Ninguém cadastrado ainda. Adicione as pessoas que trabalham com você: cada uma recebe uma função e um PIN.</p></div>`}
      ${D.semOperador.vendas ? `<p class="ass-miudo">Vendas sem funcionário identificado no mês: ${D.semOperador.vendas} · ${fmt(D.semOperador.total)} (feitas com a sua conta, sem PIN).</p>` : ''}
      <details class="pd-funcoes"><summary>O que cada função pode fazer</summary>${matrizHtml()}</details>
    </section>`;
  }
  function matrizHtml() {
    const P = D.funcoes.permissoes; const papeis = D.funcoes.papeis;
    const chaves = Object.keys(P).filter((k) => k !== 'config');
    return `<div class="dono-tabela-wrap" style="margin-top:10px"><table class="dono-tabela pd-matriz"><thead><tr><th></th>${papeis.map((p) => `<th>${esc(p.nome)}</th>`).join('')}</tr></thead><tbody>
      ${chaves.map((k) => `<tr><td>${esc(P[k][0])}</td>${papeis.map((p) => `<td class="pd-c">${p.padrao[k] ? '<span class="pd-sim" aria-label="sim">✓</span>' : '<span class="pd-nao" aria-label="não">—</span>'}</td>`).join('')}</tr>`).join('')}
      <tr><td>${esc(P.config[0])}</td>${papeis.map((p) => `<td class="pd-c">${p.id === 'gestor' ? '<span class="pd-sim" aria-label="sim">✓</span>' : '<span class="pd-nao" aria-label="não">—</span>'}</td>`).join('')}</tr>
    </tbody></table></div><p class="ass-miudo">Dá para ajustar pessoa por pessoa em "Editar" (por exemplo, deixar um gerente ver o lucro).</p>`;
  }
  function entradaHtml() {
    if (D.recursos && D.recursos.equipe === false) return '';
    const link = `${location.origin}/funcionario.html?c=${encodeURIComponent(D.codigo)}`;
    const msg = `Para entrar no sistema da ${D.negocio.nome || 'loja'} pelo seu celular: ${link} (código ${D.codigo}). Use o PIN que eu te passei.`;
    return `<section aria-labelledby="t-entrada"><h2 class="pd-h3" id="t-entrada">Entrada pelo celular</h2><div class="ass-cartao">
      <p class="ass-texto" style="margin-top:0">Cada pessoa abre o link no próprio celular, escolhe o nome e digita o PIN. Não precisa da sua senha, e ela só vê o que a função permite.</p>
      <div class="pd-codigo"><span class="pd-codigo-rotulo">Código da loja</span><span class="pd-codigo-valor">${esc(D.codigo)}</span></div>
      <p class="ass-miudo pd-link">${esc(link)}</p>
      <div class="ass-acoes pd-acoes-esq">
        <button type="button" class="ass-btn" data-a="copiar" data-link="${esc(link)}">Copiar link</button>
        <a class="ass-btn" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Enviar pelo WhatsApp</a>
        <button type="button" class="ass-btn ass-btn-perigo" data-a="novo-codigo">Gerar outro código</button>
      </div>
    </div></section>`;
  }
  function opcoesHtml() {
    if (D.recursos && D.recursos.equipe === false) return '';
    const ligado = D.opcoes.crmTodos !== false;
    return `<section aria-labelledby="t-opcoes"><h2 class="pd-h3" id="t-opcoes">Contatos no CRM</h2><div class="ass-cartao">
      <label class="settings-toggle-row pd-toggle pd-toggle-solto"><span><b>Vendedores veem os contatos de todos</b><small>${ligado ? 'Ligado: todo vendedor vê todos os contatos e negociações da loja.' : 'Desligado: cada vendedor vê só os contatos que ele mesmo cadastrou.'}</small></span>
        <button type="button" class="switch ${ligado ? 'on' : ''}" data-a="crm-todos" role="switch" aria-checked="${ligado}" aria-label="Vendedores veem os contatos de todos"><span class="switch-knob"></span></button></label>
    </div></section>`;
  }
  function aparelhoHtml() {
    if (D.recursos && D.recursos.equipe === false) return '';
    const loja = Acesso.tipoLocal() === 'loja';
    return `<section aria-labelledby="t-aparelho"><h2 class="pd-h3" id="t-aparelho">Aparelho da loja</h2><div class="ass-cartao">
      ${loja ? `<p class="ass-texto" style="margin-top:0"><b>Este aparelho é da loja.</b> Quem for usar escolhe o nome e digita o PIN, e só vê o que a função dele permite (vale para o PDV, o CRM e o Controle financeiro).</p>
        <div class="ass-acoes pd-acoes-esq"><button type="button" class="ass-btn" data-a="aparelho-normal">Voltar a ser um aparelho normal</button></div>
        <p class="ass-miudo">Só um gestor, entrado com o PIN, tira o modo loja. O "Sair" do dia a dia só encerra a vez de quem estava usando. Aqui o CRM mostra os contatos da loja e não tem a aba Equipe (que é de quem entra com e-mail e senha).</p>`
      : `<p class="ass-texto" style="margin-top:0">O computador do caixa ou o tablet do balcão é usado por várias pessoas? Transforme-o em aparelho da loja: cada um entra com o próprio PIN e não consegue abrir o que a função não permite, como o lucro e o Controle financeiro.</p>
        <p class="ass-miudo">Use no aparelho da loja, não no seu celular. Antes, cadastre você mesmo na equipe com a função Gestor, para conseguir entrar com tudo liberado.</p>
        <div class="ass-acoes pd-acoes-esq"><button type="button" class="ass-btn ass-btn-forte" data-a="aparelho-loja">Usar este aparelho como aparelho da loja</button></div>`}
    </div></section>`;
  }
  function atividadeHtml() {
    const NOME = { cancelada: 'Venda cancelada', desconto: 'Desconto na venda', caixa: 'Diferença no fechamento do caixa' };
    const itens = D.atividade.map((a) => `<li class="dono-linha"><span>${NOME[a.tipo] || a.tipo} nº ${a.numero}${a.quem ? ` · ${esc(a.quem)}` : ''}</span><span>${fmt(a.valor)} · ${quando(a.quando)}</span></li>`).join('');
    return `<section aria-labelledby="t-ativ"><h2 class="pd-h3" id="t-ativ">Para ficar de olho</h2><div class="ass-cartao">
      ${itens ? `<ul class="pd-lista">${itens}</ul>` : '<p class="ass-texto" style="margin:0">Nenhum cancelamento, desconto ou diferença de caixa recente.</p>'}</div></section>`;
  }
  function abasHtml() {
    const conta = { equipe: D.equipe.filter((o) => o.ativo).length, resumo: D.atividade.length };
    return `<div class="pd-abas" role="tablist" aria-label="Partes do painel">${ABAS.map(([id, nome]) => `<button type="button" role="tab" class="pd-aba" id="aba-${id}" data-aba="${id}" aria-selected="${aba === id}" aria-controls="painel-aba" tabindex="${aba === id ? 0 : -1}">${nome}${id === 'equipe' && conta.equipe ? ` <span class="pd-conta">${conta.equipe}</span>` : ''}${id === 'resumo' && conta.resumo ? ` <span class="pd-conta pd-conta-alerta" title="Itens para ficar de olho">${conta.resumo}</span>` : ''}</button>`).join('')}</div>`;
  }
  function desenhar() {
    const corpo = aba === 'equipe' ? equipeHtml()
      : aba === 'acessos' ? `<div class="pd-grade">${entradaHtml()}${aparelhoHtml()}</div>${opcoesHtml()}`
      : resumoHtml() + atividadeHtml();
    $('#pd-conteudo').innerHTML = abasHtml() + `<div class="pd-painel" id="painel-aba" role="tabpanel" aria-labelledby="aba-${aba}">${corpo}</div>`;
  }
  function trocarAba(id, foco) {
    if (!ABAS.some(([x]) => x === id) || !D) return;
    aba = id;
    try { localStorage.setItem('painel-aba', id); } catch (e) { /* nada */ }
    try { history.replaceState(null, '', '#' + id); } catch (e) { /* nada */ }
    desenhar();
    if (foco) { const b = document.getElementById('aba-' + id); if (b) b.focus(); }
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-aba]'); if (b) trocarAba(b.dataset.aba); });
  window.addEventListener('hashchange', () => { const h = (location.hash || '').slice(1); if (h !== aba) trocarAba(h); });
  document.addEventListener('keydown', (e) => {
    const b = e.target.closest && e.target.closest('[data-aba]'); if (!b) return;
    const i = ABAS.findIndex(([x]) => x === b.dataset.aba);
    if (e.key === 'ArrowRight') { e.preventDefault(); trocarAba(ABAS[(i + 1) % ABAS.length][0], true); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); trocarAba(ABAS[(i + ABAS.length - 1) % ABAS.length][0], true); }
  });

  /* ---------------- editar pessoa ---------------- */
  function modal(html) {
    $('#pd-modal').innerHTML = `<div class="ass-modal-fundo" data-a="fechar-fundo"><div class="ass-modal pd-modal" role="dialog" aria-modal="true" aria-labelledby="pd-modal-t">${html}</div></div>`;
    const f = $('#pd-modal input'); if (f) f.focus();
  }
  const fecharModal = () => { $('#pd-modal').innerHTML = ''; ED = null; };
  function efetivasDe(papel, ajustes) {
    const base = (D.funcoes.papeis.find((p) => p.id === papel) || D.funcoes.papeis[0]).padrao;
    if (papel === 'gestor') return { ...base };
    const r = { ...base, ...ajustes }; if (r.produtos) r.produtosVer = true; return r;
  }
  function editarHtml() {
    const e = ED; const P = D.funcoes.permissoes;
    const ef = efetivasDe(e.papel, e.ajustes); const base = (D.funcoes.papeis.find((p) => p.id === e.papel) || {}).padrao || {};
    const chaves = Object.keys(P).filter((k) => k !== 'config');
    return `<h2 class="ass-h2" id="pd-modal-t" style="margin-top:0">${e.id ? `Editar ${esc(e.nome)}` : 'Adicionar pessoa'}</h2>
      <label class="ass-campo">Nome<input id="ed-nome" value="${esc(e.nome)}" maxlength="60" autocomplete="off" /></label>
      <label class="ass-campo">Função<select id="ed-papel" class="pd-select">${D.funcoes.papeis.map((p) => `<option value="${p.id}" ${p.id === e.papel ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
      <label class="ass-campo">${e.id ? 'Novo PIN (deixe em branco para manter)' : 'PIN (4 a 6 números)'}<input id="ed-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" /></label>
      ${e.id ? `<label class="settings-toggle-row pd-toggle"><span><b>Ativo</b><small>Desativado, a pessoa não entra mais (nem no celular).</small></span><button type="button" class="switch ${e.ativo ? 'on' : ''}" data-a="ed-ativo" role="switch" aria-checked="${e.ativo}"><span class="switch-knob"></span></button></label>` : ''}
      <p class="pd-sub-t">O que pode usar</p>
      ${e.papel === 'gestor' ? '<p class="ass-miudo">O gestor pode tudo, inclusive configurações, equipe e assinatura.</p>' : `<div class="pd-perms">${chaves.map((k) => `<label class="pd-perm"><input type="checkbox" data-perm="${k}" ${ef[k] ? 'checked' : ''} ${k === 'produtosVer' && ef.produtos ? 'disabled' : ''} /><span><b>${esc(P[k][0])}</b>${ef[k] !== !!base[k] ? ' <em class="pd-ajuste">ajustado</em>' : ''}<small>${esc(P[k][1])}</small></span></label>`).join('')}</div>`}
      ${e.erro ? `<p class="ass-erro" role="alert">${esc(e.erro)}</p>` : ''}
      <div class="ass-acoes pd-acoes-modal">${e.id ? '<button type="button" class="ass-btn ass-btn-perigo" data-a="ed-excluir">Excluir</button>' : '<span></span>'}
        <span class="pd-dir"><button type="button" class="ass-btn" data-a="fechar">Cancelar</button><button type="button" class="ass-btn ass-btn-forte" data-a="ed-salvar" ${e.salvando ? 'disabled' : ''}>${e.salvando ? 'Salvando…' : 'Salvar'}</button></span></div>`;
  }
  function abrirEdicao(o) {
    ED = o ? { id: o.id, nome: o.nome, papel: o.papel, ativo: o.ativo, ajustes: { ...(o.permissoes || {}) }, erro: '' }
      : { id: null, nome: '', papel: 'vendedor', ativo: true, ajustes: {}, erro: '' };
    modal(editarHtml());
  }
  function lerForm() {
    const n = $('#ed-nome'); if (n) ED.nome = n.value;
    const p = $('#ed-pin'); if (p) ED.pin = p.value;
  }
  async function salvar() {
    lerForm(); ED.erro = '';
    if (!ED.nome.trim()) { ED.erro = 'Informe o nome.'; modal(editarHtml()); return; }
    if (!ED.id && !/^\d{4,6}$/.test(ED.pin || '')) { ED.erro = 'Crie um PIN de 4 a 6 números.'; modal(editarHtml()); return; }
    ED.salvando = true; modal(editarHtml());
    const corpo = { nome: ED.nome.trim(), papel: ED.papel, ativo: ED.ativo, permissoes: ED.papel === 'gestor' ? {} : ED.ajustes, ...(ED.pin ? { pin: ED.pin } : {}) };
    try {
      await api(ED.id ? 'PUT' : 'POST', ED.id ? `/estoque/operadores/${ED.id}` : '/estoque/operadores', corpo);
      fecharModal(); await carregar();
    } catch (e) { ED.salvando = false; ED.erro = e.message; modal(editarHtml()); }
  }

  /* ---------------- cliques ---------------- */
  document.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-a]'); if (!el) return;
    const a = el.dataset.a;
    if (a === 'fechar-fundo' && ev.target !== el) return;
    switch (a) {
      case 'novo': abrirEdicao(null); break;
      case 'editar': abrirEdicao(D.equipe.find((o) => o.id === el.dataset.id)); break;
      case 'fechar': case 'fechar-fundo': fecharModal(); break;
      case 'ed-ativo': lerForm(); ED.ativo = !ED.ativo; modal(editarHtml()); break;
      case 'ed-salvar': salvar(); break;
      case 'ed-excluir': {
        const nome = ED.nome; const id = ED.id;
        if (!(await confirmarAcao({ mensagem: `Excluir ${nome} da equipe? Ela não entra mais, e as vendas que fez continuam com o nome registrado. Prefere só desativar?`, sempre: true }))) break;
        try { await api('DELETE', `/estoque/operadores/${id}`); fecharModal(); await carregar(); } catch (e) { ED.erro = e.message; modal(editarHtml()); }
        break;
      }
      case 'copiar': try { await navigator.clipboard.writeText(el.dataset.link); el.textContent = 'Copiado!'; setTimeout(() => { el.textContent = 'Copiar link'; }, 1600); } catch (e) { window.prompt('Copie o link:', el.dataset.link); } break;
      case 'novo-codigo':
        if (!(await confirmarAcao({ titulo: 'Gerar outro código?', mensagem: 'O código e o link de agora param de funcionar para quem ainda não entrou. Quem já entrou continua entrado.', botao: 'Gerar outro', perigo: false, sempre: true }))) break;
        try { D.codigo = (await api('POST', '/gestao/codigo')).codigo; desenhar(); } catch (e) { alertar(e.message); }
        break;
      case 'crm-todos':
        try { D.opcoes = (await api('PUT', '/gestao/opcoes', { crmTodos: !(D.opcoes.crmTodos !== false) })).opcoes; desenhar(); } catch (e) { alertar(e.message); }
        break;
      case 'aparelho-loja':
        if (!D.equipe.some((o) => o.ativo && o.papel === 'gestor')) { alertar('Antes, adicione você mesmo na equipe com a função Gestor (e um PIN). Senão ninguém consegue entrar com tudo liberado neste aparelho.'); break; }
        if (!(await confirmarAcao({ titulo: 'Usar como aparelho da loja?', mensagem: 'Daqui em diante, quem usar este aparelho vai escolher o nome e digitar o PIN, e só vai ver o que a função permite. No CRM, quem entra com PIN usa os contatos da loja; a aba Equipe do CRM (chat, gestão de consultores) fica só para quem entra com o próprio e-mail e senha. Seu celular continua normal.', botao: 'Usar como aparelho da loja', perigo: false, sempre: true }))) break;
        try { const r = await api('POST', '/acesso/aparelho-loja'); localStorage.setItem('token', r.token); localStorage.removeItem('pdv-operador'); window.location.href = '/'; } catch (e) { alertar(e.message); }
        break;
      case 'aparelho-normal':
        if (!(await confirmarAcao({ titulo: 'Voltar a ser um aparelho normal?', mensagem: 'Este aparelho sai da conta. Para usar de novo, entre com o e-mail e a senha do dono (ou pelo link da equipe, com o seu PIN).', botao: 'Sair do modo loja', perigo: false, sempre: true }))) break;
        try { await api('POST', '/acesso/aparelho-normal'); ['token', 'user', 'pdv-operador'].forEach((k) => localStorage.removeItem(k)); window.location.href = '/login.html'; } catch (e) { alertar(e.message); }
        break;
      default: break;
    }
  });
  document.addEventListener('change', (ev) => {
    if (!ED) return;
    if (ev.target.id === 'ed-papel') { lerForm(); ED.papel = ev.target.value; ED.ajustes = {}; modal(editarHtml()); return; }
    const k = ev.target.dataset.perm; if (!k) return;
    lerForm();
    const base = (D.funcoes.papeis.find((p) => p.id === ED.papel) || {}).padrao || {};
    if (ev.target.checked === !!base[k]) delete ED.ajustes[k]; else ED.ajustes[k] = ev.target.checked;
    modal(editarHtml());
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ED) fecharModal(); });
  function alertar(t) { confirmarAcao({ titulo: 'Atenção', mensagem: t, botao: 'Entendi', cancelar: false, perigo: false, sempre: true }); }
  $('#pd-atualizar').addEventListener('click', carregar);

  Acesso.garantirPessoa().then(carregar);
})();
