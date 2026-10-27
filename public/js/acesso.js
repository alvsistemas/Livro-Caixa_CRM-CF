/* Acesso da equipe no navegador — usado pela tela de escolha, CRM, Controle financeiro e Painel do dono
   (o PDV tem a sua própria trava de PIN, que usa a mesma sessão "pdv-operador").

   - Funcionário (entrou pelo próprio celular): o token já diz quem é; o servidor confere tudo.
   - Aparelho da loja: sem alguém entrado com o PIN, a tela pede "Quem vai usar?" e o PIN.
   - Dono: nada muda.
   O servidor é quem decide (utils/acesso.js); aqui só se mostra o que a pessoa pode usar. */
(function () {
  const CHAVE_OP = 'pdv-operador';
  const esc = (s) => Comum.esc(s); // js/comum.js
  const lerToken = () => { try { return localStorage.getItem('token') || ''; } catch (e) { return ''; } };
  function payload() {
    try { return JSON.parse(atob(lerToken().split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) || {}; } catch (e) { return {}; }
  }
  const tipoLocal = () => { const p = payload(); return p.func ? 'funcionario' : p.loja ? 'loja' : 'dono'; };
  function sessaoOp() {
    try { const o = JSON.parse(localStorage.getItem(CHAVE_OP) || 'null'); return o && o.token && o.ate > Date.now() ? o : null; } catch (e) { return null; }
  }
  function cabecalhos() { const o = tipoLocal() === 'funcionario' ? null : sessaoOp(); return o ? { 'x-operador': o.token } : {}; }
  async function chamar(metodo, caminho, corpo) {
    const r = await fetch('/api' + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + lerToken(), ...cabecalhos() }, body: corpo ? JSON.stringify(corpo) : undefined });
    let d = null; try { d = await r.json(); } catch (e) { /* sem corpo */ }
    if (!r.ok) { const e = new Error((d && d.error) || 'Erro de comunicação.'); e.status = r.status; e.dados = d; throw e; }
    return d;
  }
  let cache = null;
  /* O último acesso fica guardado neste aparelho (para a mesma conta e a mesma pessoa): as telas
     já abrem só com o que a função permite, sem mostrar tudo por um instante. O servidor confere
     tudo de novo; isto só evita o "pisca". */
  const CHAVE_GUARDADO = 'acesso-guardado';
  const assinatura = () => lerToken().slice(-24) + '|' + (((tipoLocal() === 'funcionario' ? null : sessaoOp()) || {}).token || '').slice(-24);
  function guardada() {
    try { const o = JSON.parse(localStorage.getItem(CHAVE_GUARDADO) || 'null'); return o && o.a === assinatura() ? o.d : null; } catch (e) { return null; }
  }
  function pronto() { document.documentElement.classList.remove('acesso-pendente'); }
  async function info(forcar = false) {
    if (cache && !forcar) return cache;
    try {
      cache = await chamar('GET', '/acesso');
      try { localStorage.setItem(CHAVE_GUARDADO, JSON.stringify({ a: assinatura(), d: cache })); } catch (e) { /* sem armazenamento */ }
    } catch (e) { cache = { tipo: tipoLocal(), apps: { pdv: true, crm: true, financeiro: true }, permissoes: {}, gestor: tipoLocal() === 'dono', erro: e }; }
    pronto();
    return cache;
  }
  // equipe sem acesso guardado: esconde menus e cartões até saber o que a função permite
  if (tipoLocal() !== 'dono' && !guardada()) {
    document.documentElement.classList.add('acesso-pendente');
    const s = document.createElement('style');
    s.textContent = 'html.acesso-pendente [data-action="nav"],html.acesso-pendente .nav-mais,html.acesso-pendente .inicio-app,html.acesso-pendente #inicio-painel{visibility:hidden}';
    document.head.appendChild(s);
    setTimeout(pronto, 8000); // sem resposta do servidor: mostra o que tiver
  }
  // completo === true: sai da conta (sessão expirou). No aparelho da loja, o "Sair" normal só
  // encerra a vez de quem estava usando: o aparelho continua da loja e pede "Quem vai usar?".
  function sair(completo) {
    if (completo !== true && tipoLocal() === 'loja') {
      try { localStorage.removeItem(CHAVE_OP); } catch (e) { /* nada */ }
      cache = null; window.location.href = '/'; return;
    }
    try { ['token', 'user', CHAVE_OP].forEach((k) => localStorage.removeItem(k)); } catch (e) { /* nada */ }
    window.location.href = tipoLocal() === 'funcionario' ? '/funcionario.html' : '/login.html';
  }
  function trocarPessoa() { try { localStorage.removeItem(CHAVE_OP); } catch (e) { /* nada */ } cache = null; window.location.reload(); }

  /* ---------- aparelho da loja: "Quem vai usar?" + PIN ---------- */
  function estilos() {
    if (document.getElementById('acesso-estilos')) return;
    const s = document.createElement('style'); s.id = 'acesso-estilos';
    s.textContent = `.ac-fundo{position:fixed;inset:0;z-index:9000;background:var(--bg,#F7F7F5);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto}
.ac-caixa{width:min(440px,100%);background:var(--paper,var(--bg,#fff));color:var(--ink,#141414);border:1px solid var(--line,var(--rule,#E6E6E6));border-radius:18px;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,.12);font-family:'IBM Plex Sans',system-ui,sans-serif}
.ac-caixa h2{font-family:'Fraunces',Georgia,serif;font-size:22px;margin:4px 0 6px}.ac-caixa p{margin:0;font-size:14px;line-height:1.5;color:var(--ink-soft,var(--muted,#6E6E6E))}
.ac-ops{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-top:16px}
.ac-op{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 8px;min-height:44px;border:1px solid var(--line,var(--rule,#E6E6E6));border-radius:14px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.ac-op b{font-size:14px}.ac-op small{font-size:12px;color:var(--ink-soft,var(--muted,#6E6E6E))}
.ac-av{width:40px;height:40px;border-radius:50%;background:var(--ink,#141414);color:var(--paper,#fff);display:flex;align-items:center;justify-content:center;font-weight:700}
.ac-pin{display:block;width:100%;box-sizing:border-box;margin-top:14px;min-height:52px;font-size:24px;letter-spacing:10px;text-align:center;border-radius:12px;border:1px solid var(--line,var(--rule,#D6D6D6));background:var(--bg,#fff);color:inherit}
.ac-botoes{display:flex;gap:10px;justify-content:space-between;margin-top:16px;flex-wrap:wrap}
.ac-btn{min-height:44px;padding:0 18px;border-radius:10px;border:1px solid var(--line,var(--rule,#D6D6D6));background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer}
.ac-btn.forte{background:var(--ink,#141414);color:var(--paper,#fff);border-color:transparent}
.ac-erro{color:var(--danger,var(--red,#B42318))!important;margin-top:10px!important}
.ac-marca{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft,#6E6E6E)}`;
    document.head.appendChild(s);
  }
  // resolve quando alguém entrou (ou na hora, se não for aparelho da loja)
  // forcar: o servidor pediu o PIN (ex.: o PDV exige PIN e a ação é de gestor)
  function garantirPessoa(forcar = false) {
    if (!forcar && (tipoLocal() !== 'loja' || sessaoOp())) return Promise.resolve();
    estilos();
    return new Promise((pronto) => {
      const fundo = document.createElement('div'); fundo.className = 'ac-fundo'; fundo.setAttribute('role', 'dialog'); fundo.setAttribute('aria-modal', 'true');
      document.body.appendChild(fundo);
      let ops = []; let escolhido = null; let erro = '';
      const desenhar = () => {
        fundo.innerHTML = `<div class="ac-caixa"><p class="ac-marca">${tipoLocal() === 'loja' ? 'Aparelho da loja' : 'Confirme quem está usando'}</p>
          ${!escolhido ? `<h2>Quem vai usar?</h2><p>Escolha o seu nome e digite o seu PIN.</p>
            <div class="ac-ops">${ops.map((o) => `<button type="button" class="ac-op" data-op="${esc(o.id)}"><span class="ac-av" aria-hidden="true">${esc((o.nome || '?').trim().charAt(0).toUpperCase())}</span><b>${esc(o.nome)}</b><small>${esc(o.funcao || '')}</small></button>`).join('') || '<p>Carregando…</p>'}</div>`
          : `<h2>${esc(escolhido.nome)}, digite o seu PIN</h2>
            <input class="ac-pin" id="ac-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="6" aria-label="PIN" />
            ${erro ? `<p class="ac-erro" role="alert">${esc(erro)}</p>` : ''}
            <div class="ac-botoes"><button type="button" class="ac-btn" data-ac="voltar">← Trocar pessoa</button><button type="button" class="ac-btn forte" data-ac="entrar">Entrar</button></div>`}
          ${!escolhido && erro ? `<p class="ac-erro" role="alert">${esc(erro)}</p>` : ''}
          ${!escolhido && forcar && tipoLocal() !== 'loja' ? '<div class="ac-botoes"><button type="button" class="ac-btn" data-ac="cancelar">Cancelar</button></div>' : ''}
        </div>`;
        const pin = fundo.querySelector('#ac-pin');
        if (pin) { pin.focus(); pin.addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(); }); }
      };
      const entrar = async () => {
        const pin = (fundo.querySelector('#ac-pin') || {}).value || '';
        if (pin.length < 4) { erro = 'O PIN tem de 4 a 6 números.'; desenhar(); return; }
        try {
          const r = await chamar('POST', '/estoque/operadores/entrar', { id: escolhido.id, pin });
          localStorage.setItem(CHAVE_OP, JSON.stringify({ token: r.token, offline: r.offline || null, operador: r.operador, ate: Date.now() + 13.5 * 3600 * 1000 }));
          cache = null; fundo.remove(); pronto(true);
        } catch (e) { erro = e.message; desenhar(); }
      };
      fundo.addEventListener('click', (e) => {
        const b = e.target.closest('[data-op]'); if (b) { escolhido = ops.find((o) => o.id === b.dataset.op); erro = ''; desenhar(); return; }
        const a = e.target.closest('[data-ac]'); if (!a) return;
        if (a.dataset.ac === 'cancelar') { fundo.remove(); pronto(false); return; }
        if (a.dataset.ac === 'voltar') { escolhido = null; erro = ''; desenhar(); } else entrar();
      });
      desenhar();
      const NOMES = { gestor: 'Gestor', gerente: 'Gerente', vendedor: 'Vendedor', estoquista: 'Estoquista', caixa: 'Caixa', garcom: 'Garçom' };
      chamar('GET', '/estoque/operadores').then((r) => { ops = (r.operadores || []).filter((o) => o.ativo).map((o) => ({ ...o, funcao: NOMES[o.papel] || o.papel })); if (!ops.length) erro = 'Nenhum funcionário cadastrado. O gestor cadastra a equipe no Painel do dono.'; desenhar(); })
        .catch((e) => { erro = e.message; desenhar(); });
    });
  }

  /* ---------- tela de "sem acesso" ---------- */
  function semAcesso(texto) {
    estilos();
    const fundo = document.createElement('div'); fundo.className = 'ac-fundo';
    fundo.innerHTML = `<div class="ac-caixa"><p class="ac-marca">Acesso da equipe</p><h2>Sem acesso a esta parte</h2><p>${esc(texto)}</p>
      <div class="ac-botoes"><a class="ac-btn forte" href="/" style="display:inline-flex;align-items:center;text-decoration:none">Voltar ao início</a>${tipoLocal() === 'loja' ? '<button type="button" class="ac-btn" data-ac="trocar">Trocar pessoa</button>' : ''}</div></div>`;
    fundo.addEventListener('click', (e) => { if (e.target.closest('[data-ac="trocar"]')) trocarPessoa(); });
    document.body.appendChild(fundo);
  }
  // para o CRM e o financeiro: garante alguém (aparelho da loja) e confere se a função abre este aplicativo
  async function exigirApp(app, nome) {
    await garantirPessoa();
    const i = await info(true);
    if (i.apps && i.apps[app] === false) { semAcesso(`A sua função (${i.operador ? i.operador.funcao : 'equipe'}) não inclui ${nome}. Fale com o gestor se precisar.`); return false; }
    return true;
  }

  window.Acesso = { info, guardada, tipoLocal, sessaoOp, cabecalhos, garantirPessoa, exigirApp, sair, trocarPessoa, chamar };
})();
