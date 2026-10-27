/* =======================================================================
   Assistente de IA do Livro-Caixa — a bolinha no canto inferior direito.
   O mesmo componente roda no CRM e no Controle financeiro: mesma IA
   (rota /api/ai/assistente), mesmo nome e a mesma conversa — ela continua
   quando a pessoa troca de aplicativo (fica guardada na aba do navegador).

   Uso:  AssistenteIA.iniciar({ contexto: 'crm' | 'financeiro', saudacao,
           sugestoes: [{ texto, pergunta } | { texto, preencher }],  // carrossel embaixo
           alertas: () => [{ tipo: 'aviso'|'info'|'ok', texto, acao? }] })   // sininho
         AssistenteIA.definirHabilitado(true/false)   // servidor sem chave de IA
         AssistenteIA.atualizarAlertas()               // quando os dados do app mudam
   ======================================================================= */
(function () {
  const NOME_PADRAO = 'Assistente do Livro-Caixa';
  const NOMES_ANTIGOS = ['Assistente do CRM']; // nome padrão de antes: vira o novo
  const CHAVE_CONVERSA = 'assistente-conversa';
  const svg = (d, t = 18) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONE_FECHAR = svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', 24);
  const ICONE_ENVIAR = svg('<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/>', 17);
  const ICONE_SINO = svg('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>', 17);
  const ICONE_VOLTAR = svg('<path d="m15 18-6-6 6-6"/>', 16);
  const ICONE_NOVA = svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>', 16);
  const ICONE_SETA_ESQ = svg('<path d="m15 18-6-6 6-6"/>', 15);
  const ICONE_SETA_DIR = svg('<path d="m9 18 6-6-6-6"/>', 15);
  const ICONE_EDITAR = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  const lerLocal = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const gravarLocal = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* navegador sem armazenamento */ } };
  const esc = (s) => Comum.esc(s); // js/comum.js

  const st = {
    contexto: 'crm',
    saudacao: null,
    antesDeEnviar: null, // o app pode terminar de salvar o que está pendente antes (a IA pode gravar dados)
    depoisDeAlterar: null, // chamado quando a IA gravou algo (ex.: criou um lançamento) pra o app recarregar
    habilitado: true,
    aberto: false,
    animando: null, // 'abrindo' | 'fechando' | null
    enviando: false,
    editandoNome: false,
    nome: NOME_PADRAO,
    mensagens: [],
    sugestoes: [],
    alertas: null, // função do app que devolve os alertas (sininho)
    vendoAlertas: false,
    alertasVistos: '', // assinatura dos alertas já vistos (pra o contador sumir)
    bolhaX: null, // null = posição padrão (canto inferior direito) até a pessoa arrastar
    bolhaY: null,
    drag: null,
  };

  function carregarPreferencias() {
    const nome = (lerLocal('assistente-nome') || '').trim().slice(0, 30);
    st.nome = nome && !NOMES_ANTIGOS.includes(nome) ? nome : NOME_PADRAO;
    try {
      const pos = JSON.parse(lerLocal('assistente-bolha-pos') || 'null');
      if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        // mantém dentro da tela (a janela pode ter mudado de tamanho desde a última vez)
        st.bolhaX = Math.min(Math.max(4, pos.x), window.innerWidth / (window.zoomDaTela ? window.zoomDaTela() : 1) - 60);
        st.bolhaY = Math.min(Math.max(4, pos.y), window.innerHeight / (window.zoomDaTela ? window.zoomDaTela() : 1) - 60);
      }
    } catch (e) { /* posição salva inválida: usa a padrão */ }
    try {
      const salvas = JSON.parse(sessionStorage.getItem(CHAVE_CONVERSA) || '[]');
      if (Array.isArray(salvas)) st.mensagens = salvas.filter((m) => m && typeof m.content === 'string').slice(-40);
    } catch (e) { /* sem conversa salva */ }
  }
  function guardarConversa() {
    try { sessionStorage.setItem(CHAVE_CONVERSA, JSON.stringify(st.mensagens.slice(-40))); } catch (e) { /* ignora */ }
  }

  const token = () => lerLocal('token');

  function root() {
    let el = document.getElementById('assistente-root');
    if (!el) { el = document.createElement('div'); el.id = 'assistente-root'; document.body.appendChild(el); }
    return el;
  }

  function saudacao() {
    if (typeof st.saudacao === 'function') { try { return st.saudacao(st.nome); } catch (e) { /* usa a padrão */ } }
    const quem = st.nome === NOME_PADRAO ? 'o assistente do Livro-Caixa' : st.nome;
    return st.contexto === 'financeiro'
      ? `Oi! Eu sou ${quem}. Pergunte sobre seus gastos, saldo, lucro, cartões e objetivos, peça uma dica, ou me diga um gasto pra eu lançar (ex.: "gastei 52 no mercado no débito"). Também ajudo com o CRM.`
      : `Oi! Eu sou ${quem}. Pode perguntar qualquer coisa sobre como usar o CRM — Negociações, Contatos, Agenda, Comissões, Sequências — e também sobre o Controle financeiro.`;
  }

  function listaDeAlertas() {
    if (typeof st.alertas !== 'function') return [];
    try { return (st.alertas() || []).filter((a) => a && a.texto); } catch (e) { return []; }
  }
  const assinatura = (lista) => lista.filter((a) => a.tipo !== 'ok').map((a) => a.texto).join('|');
  const ICONE_TIPO = { aviso: '⚠️', info: 'ℹ️', ok: '✅' };
  function htmlAlertas(lista) {
    if (!lista.length) return '<div class="assistente-vazio">Nenhum alerta no momento. ✅</div>';
    return lista.map((a, i) => `<${a.acao ? 'button type="button"' : 'div'} class="assistente-alerta ${a.tipo || 'info'}" data-alerta="${i}"><span>${ICONE_TIPO[a.tipo] || ICONE_TIPO.info}</span><span>${esc(a.texto)}</span>${a.acao ? '<span class="assistente-alerta-ir">›</span>' : ''}</${a.acao ? 'button' : 'div'}>`).join('');
  }
  function htmlSugestoes() {
    if (!st.sugestoes.length || st.vendoAlertas) return '';
    return `<div class="assistente-sugestoes">
      <button type="button" class="assistente-sug-seta" data-rolar="-1" aria-label="Sugestões anteriores">${ICONE_SETA_ESQ}</button>
      <div class="assistente-sug-trilho" id="assistente-sug-trilho">${st.sugestoes.map((s, i) => `<button type="button" class="assistente-sug" data-sug="${i}" ${st.enviando ? 'disabled' : ''}>${esc(s.texto)}</button>`).join('')}</div>
      <button type="button" class="assistente-sug-seta" data-rolar="1" aria-label="Mais sugestões">${ICONE_SETA_DIR}</button>
    </div>`;
  }

  function render() {
    const el = root();
    if (!token() || !st.habilitado) { el.innerHTML = ''; return; }
    // preserva o que está sendo digitado (o painel pode ser redesenhado a qualquer momento)
    const antes = document.getElementById('assistente-input');
    const digitado = antes ? { valor: antes.value, foco: document.activeElement === antes, pos: antes.selectionStart } : null;
    const alertas = listaDeAlertas();
    const novos = typeof st.alertas === 'function' && assinatura(alertas) !== st.alertasVistos ? alertas.filter((a) => a.tipo !== 'ok').length : 0;
    if (st.vendoAlertas) st.alertasVistos = assinatura(alertas);
    const posBolha = st.bolhaX != null ? `left:${st.bolhaX}px; top:${st.bolhaY}px; right:auto; bottom:auto;` : '';
    el.innerHTML = `
      <button id="assistente-bolha" class="assistente-bolha ${st.aberto ? 'aberta' : ''}" style="${posBolha}" title="${st.aberto ? 'Fechar' : esc(st.nome)}" aria-label="${st.aberto ? 'Fechar' : 'Abrir'} ${esc(st.nome)}">${st.aberto ? ICONE_FECHAR : '💬'}${!st.aberto && novos ? `<span class="assistente-bolha-badge">${novos}</span>` : ''}</button>
      ${st.aberto ? `
        <div class="assistente-painel${st.animando ? ' ' + st.animando : ''}" id="assistente-painel" role="dialog" aria-label="${esc(st.nome)}">
          <div class="assistente-painel-head">
            ${st.vendoAlertas
              ? `<button type="button" class="assistente-voltar" id="assistente-voltar">${ICONE_VOLTAR}<span>Alertas</span></button>`
              : st.editandoNome
              ? `<span class="assistente-nome-edit">✨ <input type="text" id="assistente-nome-input" maxlength="30" value="${esc(st.nome)}" aria-label="Nome do assistente" /></span>`
              : `<span class="assistente-nome">✨ <span class="assistente-nome-txt">${esc(st.nome)}</span><button id="assistente-editar-nome" class="assistente-editar-nome" title="Editar nome" aria-label="Editar nome do assistente">${ICONE_EDITAR}</button></span>`}
            <span class="assistente-head-acoes">
              ${st.mensagens.length && !st.vendoAlertas ? `<button id="assistente-limpar" title="Começar uma conversa nova" aria-label="Começar uma conversa nova">${ICONE_NOVA}</button>` : ''}
              ${typeof st.alertas === 'function' ? `<button id="assistente-sino" class="assistente-sino ${st.vendoAlertas ? 'ativo' : ''}" title="Alertas" aria-label="Alertas${novos ? ` (${novos} novos)` : ''}" aria-pressed="${st.vendoAlertas}">${ICONE_SINO}${novos && !st.vendoAlertas ? `<span class="assistente-sino-badge">${novos}</span>` : ''}</button>` : ''}
            </span>
          </div>
          ${st.vendoAlertas ? `<div class="assistente-mensagens assistente-alertas" id="assistente-alertas">${htmlAlertas(alertas)}</div>` : `
          <div class="assistente-mensagens" id="assistente-mensagens-lista">
            ${!st.mensagens.length ? `<div class="assistente-msg assistente-msg-assistant">${esc(saudacao())}</div>` : ''}
            ${st.mensagens.map((m) => `<div class="assistente-msg assistente-msg-${m.role === 'user' ? 'user' : 'assistant'}">${esc(m.content)}</div>`).join('')}
            ${st.enviando ? '<div class="assistente-msg assistente-msg-assistant assistente-digitando">Digitando…</div>' : ''}
          </div>
          ${htmlSugestoes()}
          <div class="assistente-input-row">
            <input type="text" id="assistente-input" placeholder="Pergunte algo…" maxlength="2000" ${st.enviando ? 'disabled' : ''} />
            <button id="assistente-enviar" ${st.enviando ? 'disabled' : ''} title="Enviar" aria-label="Enviar">${ICONE_ENVIAR}</button>
          </div>`}
        </div>` : ''}`;
    if (st.aberto) posicionarPainel();
    ligarEventos();
    st.animando = null; // a animação roda uma vez; re-renders seguintes não repetem
    if (st.editandoNome) { const ni = document.getElementById('assistente-nome-input'); if (ni) { ni.focus(); ni.select(); } }
    const lista = document.getElementById('assistente-mensagens-lista');
    if (lista) lista.scrollTop = lista.scrollHeight;
    const trilho = document.getElementById('assistente-sug-trilho');
    if (trilho) { trilho.scrollLeft = st.rolagemSugestoes || 0; atualizarSetas(); }
    const novoInput = document.getElementById('assistente-input');
    if (digitado && novoInput && digitado.valor && !novoInput.value) {
      novoInput.value = digitado.valor;
      if (digitado.foco) { novoInput.focus(); try { novoInput.setSelectionRange(digitado.pos, digitado.pos); } catch (e) { /* ignora */ } }
      return;
    }
    if (st.aberto && !st.enviando && !st.editandoNome && !st.vendoAlertas) { const inp = document.getElementById('assistente-input'); if (inp && window.matchMedia('(pointer:fine)').matches) inp.focus(); }
  }

  // Abre o painel perto de onde a bolinha estiver (ela pode ter sido arrastada), sempre inteiro na tela.
  function posicionarPainel() {
    const bolha = document.getElementById('assistente-bolha');
    const painel = document.getElementById('assistente-painel');
    if (!bolha || !painel) return;
    const rb = bolha.getBoundingClientRect();
    const z = (window.zoomDaTela ? window.zoomDaTela() : 1); // letra maior (acessibilidade)
    const largura = (painel.offsetWidth || 336) * z;
    const altura = (painel.offsetHeight || 460) * z;
    let left = rb.right - largura;
    let top = rb.top - altura - 12;
    if (top < 12) top = rb.bottom + 12; // não cabe em cima: abre embaixo
    left = Math.min(Math.max(12, left), window.innerWidth - largura - 12);
    top = Math.min(Math.max(12, top), window.innerHeight - altura - 12);
    painel.style.left = left / z + 'px';
    painel.style.top = top / z + 'px';
    painel.style.transformOrigin = `${rb.left + rb.width / 2 - left}px ${rb.top + rb.height / 2 - top}px`;
  }

  function alternar() {
    if (st.aberto) {
      if (st.animando === 'fechando') return;
      const painel = document.getElementById('assistente-painel');
      const reduz = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!painel || reduz) { st.aberto = false; st.editandoNome = false; render(); return; }
      st.animando = 'fechando';
      painel.classList.add('fechando');
      const bolha = document.getElementById('assistente-bolha');
      if (bolha) bolha.textContent = '💬';
      setTimeout(() => { st.aberto = false; st.editandoNome = false; st.animando = null; render(); }, 220);
    } else {
      st.aberto = true;
      st.animando = 'abrindo';
      render();
    }
  }

  function salvarNome() {
    const ni = document.getElementById('assistente-nome-input');
    if (ni) {
      st.nome = ni.value.trim().slice(0, 30) || NOME_PADRAO;
      gravarLocal('assistente-nome', st.nome);
    }
    st.editandoNome = false;
    render();
  }

  async function enviar() {
    const input = document.getElementById('assistente-input');
    if (!input) return;
    const texto = input.value.trim();
    if (!texto || st.enviando) return;
    st.mensagens.push({ role: 'user', content: texto });
    input.value = '';
    guardarConversa();
    st.enviando = true;
    render();
    const controle = new AbortController();
    const limite = setTimeout(() => controle.abort(), 45000);
    try {
      if (typeof st.antesDeEnviar === 'function') { try { await st.antesDeEnviar(); } catch (e) { /* segue mesmo assim */ } }
      const res = await fetch('/api/ai/assistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({ mensagens: st.mensagens, contexto: st.contexto }),
        signal: controle.signal,
      });
      let data = null;
      try { data = await res.json(); } catch (e) { /* resposta sem JSON */ }
      if (res.status === 401) throw new Error('sua sessão expirou. Entre de novo.');
      if (!res.ok) throw new Error((data && data.error) || 'tenta de novo em instantes.');
      st.mensagens.push({ role: 'assistant', content: (data && data.resposta) || '(sem resposta)' });
      if (data && data.dadosAlterados && typeof st.depoisDeAlterar === 'function') { try { st.depoisDeAlterar(); } catch (e) { /* ignora */ } }
    } catch (e) {
      const msg = e.name === 'AbortError' ? 'demorou demais para responder. Tenta de novo?' : (e.message || 'tenta de novo em instantes.');
      st.mensagens.push({ role: 'assistant', content: 'Não consegui responder agora — ' + msg, erro: true });
    } finally {
      clearTimeout(limite);
    }
    st.enviando = false;
    guardarConversa();
    render();
  }

  function ligarEventos() {
    const bolha = document.getElementById('assistente-bolha');
    if (bolha) {
      bolha.addEventListener('pointerdown', (e) => {
        const r = bolha.getBoundingClientRect();
        st.drag = { x0: e.clientX, y0: e.clientY, bx: r.left, by: r.top, moveu: false, id: e.pointerId };
        try { bolha.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
      });
      bolha.addEventListener('pointermove', (e) => {
        const d = st.drag;
        if (!d || d.id !== e.pointerId) return;
        const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
        if (!d.moveu && Math.sqrt(dx * dx + dy * dy) < 5) return; // tremidinha, ainda não é arrastar
        d.moveu = true;
        const z = (window.zoomDaTela ? window.zoomDaTela() : 1);
        const x = Math.min(Math.max(4, d.bx + dx), window.innerWidth - bolha.offsetWidth * z - 4);
        const y = Math.min(Math.max(4, d.by + dy), window.innerHeight - bolha.offsetHeight * z - 4);
        Object.assign(bolha.style, { left: x / z + 'px', top: y / z + 'px', right: 'auto', bottom: 'auto' });
        if (document.getElementById('assistente-painel')) posicionarPainel();
      });
      bolha.addEventListener('pointerup', (e) => {
        const d = st.drag;
        if (!d || d.id !== e.pointerId) return;
        if (d.moveu) {
          st.bolhaX = parseFloat(bolha.style.left);
          st.bolhaY = parseFloat(bolha.style.top);
          gravarLocal('assistente-bolha-pos', JSON.stringify({ x: st.bolhaX, y: st.bolhaY }));
        } else {
          alternar();
        }
        st.drag = null;
      });
      bolha.addEventListener('pointercancel', () => { st.drag = null; });
      bolha.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); } });
    }
    const sino = document.getElementById('assistente-sino');
    if (sino) sino.addEventListener('click', () => { st.vendoAlertas = !st.vendoAlertas; render(); });
    const voltar = document.getElementById('assistente-voltar');
    if (voltar) voltar.addEventListener('click', () => { st.vendoAlertas = false; render(); });
    document.querySelectorAll('[data-alerta]').forEach((b) => b.addEventListener('click', () => {
      const a = listaDeAlertas()[+b.dataset.alerta];
      if (a && typeof a.acao === 'function') { st.vendoAlertas = false; alternar(); try { a.acao(); } catch (e) { /* ignora */ } }
    }));
    const trilho = document.getElementById('assistente-sug-trilho');
    if (trilho) trilho.addEventListener('scroll', () => { st.rolagemSugestoes = trilho.scrollLeft; atualizarSetas(); }, { passive: true });
    document.querySelectorAll('[data-rolar]').forEach((b) => b.addEventListener('click', () => {
      const t = document.getElementById('assistente-sug-trilho');
      if (t) t.scrollBy({ left: +b.dataset.rolar * Math.max(160, t.clientWidth * 0.7), behavior: 'smooth' });
    }));
    document.querySelectorAll('[data-sug]').forEach((b) => b.addEventListener('click', () => {
      const sug = st.sugestoes[+b.dataset.sug];
      const input = document.getElementById('assistente-input');
      if (!sug || !input || st.enviando) return;
      if (sug.preencher) { input.value = sug.preencher; input.focus(); input.setSelectionRange(input.value.length, input.value.length); return; }
      input.value = sug.pergunta || sug.texto;
      enviar();
    }));
    const limpar = document.getElementById('assistente-limpar');
    if (limpar) limpar.addEventListener('click', () => { st.mensagens = []; guardarConversa(); render(); });
    const editar = document.getElementById('assistente-editar-nome');
    if (editar) editar.addEventListener('click', () => { st.editandoNome = true; render(); });
    const ni = document.getElementById('assistente-nome-input');
    if (ni) {
      let cancelado = false;
      ni.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); ni.blur(); }
        else if (e.key === 'Escape') { cancelado = true; st.editandoNome = false; render(); }
      });
      ni.addEventListener('blur', () => { if (!cancelado && st.editandoNome) salvarNome(); });
    }
    const btn = document.getElementById('assistente-enviar');
    if (btn) btn.addEventListener('click', enviar);
    const input = document.getElementById('assistente-input');
    if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(); });
  }

  // Setas do carrossel: some a da esquerda no começo e a da direita no fim
  function atualizarSetas() {
    const t = document.getElementById('assistente-sug-trilho');
    if (!t) return;
    const [esq, dir] = document.querySelectorAll('[data-rolar]');
    if (esq) esq.disabled = t.scrollLeft <= 2;
    if (dir) dir.disabled = t.scrollLeft + t.clientWidth >= t.scrollWidth - 2;
  }
  window.addEventListener('resize', () => { if (st.aberto) posicionarPainel(); });

  window.AssistenteIA = {
    iniciar(opcoes = {}) {
      st.contexto = opcoes.contexto === 'financeiro' ? 'financeiro' : 'crm';
      st.saudacao = opcoes.saudacao || null;
      st.antesDeEnviar = opcoes.antesDeEnviar || null;
      st.sugestoes = Array.isArray(opcoes.sugestoes) ? opcoes.sugestoes : [];
      st.alertas = typeof opcoes.alertas === 'function' ? opcoes.alertas : null;
      st.depoisDeAlterar = opcoes.depoisDeAlterar || null;
      carregarPreferencias();
      render();
    },
    definirHabilitado(sim) { st.habilitado = !!sim; render(); },
    // os dados do app mudaram: redesenha (contador de alertas do sininho) sem mexer na conversa
    atualizarAlertas() {
      if (st.editandoNome || typeof st.alertas !== 'function') return;
      const agora = assinatura(listaDeAlertas());
      if (agora === st.ultimaAssinatura) return; // nada mudou: não mexe na tela
      st.ultimaAssinatura = agora;
      const t = document.getElementById('assistente-sug-trilho'); if (t) st.rolagemSugestoes = t.scrollLeft;
      const lista = document.getElementById('assistente-mensagens-lista');
      const rolagem = lista ? lista.scrollTop : null;
      render();
      const nova = document.getElementById('assistente-mensagens-lista');
      if (nova && rolagem !== null) nova.scrollTop = rolagem;
    },
    render,
    abrir() { if (!st.aberto) alternar(); },
    // Abre a conversa e já manda uma pergunta (ex.: atalhos da aba Assistente do financeiro)
    perguntar(texto) {
      if (!st.habilitado || st.enviando || !String(texto || '').trim()) return;
      if (!st.aberto) { st.aberto = true; st.animando = 'abrindo'; render(); }
      const input = document.getElementById('assistente-input');
      if (input) { input.value = String(texto).slice(0, 2000); enviar(); }
    },
  };
})();
