/* Confirmação antes de apagar — a mesma janela nos três aplicativos.

   confirmarAcao({ mensagem, titulo, botao, cancelar, perigo, chave, sempre }) -> Promise<boolean>
   - cancelar: false -> só um botão (aviso, sem escolha)
   - sempre: true  -> coisas importantes (cliente/contato, lançamento, venda, produto…): pergunta sempre,
                      sem a opção de "não perguntar de novo".
   - chave: 'tarefa' (sem "sempre") -> mostra "Não perguntar de novo"; marcado, da próxima vez apaga direto.
   As escolhas ficam neste aparelho (localStorage "naoPerguntar") e voltam pelo painel de
   Acessibilidade ("Voltar a perguntar"). */
(function () {
  const CHAVE = 'naoPerguntar';
  const ler = () => { try { return JSON.parse(localStorage.getItem(CHAVE) || '{}') || {}; } catch (e) { return {}; } };
  const gravar = (o) => { try { localStorage.setItem(CHAVE, JSON.stringify(o)); } catch (e) { /* sem armazenamento */ } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let aberta = null;

  function pulada(chave) { return !!(chave && ler()[chave]); }
  function pular(chave) { if (!chave) return; const o = ler(); o[chave] = 1; gravar(o); }
  function quantasPuladas() { return Object.keys(ler()).length; }
  function voltarTodas() { gravar({}); }

  function perguntar(op) {
    const o = typeof op === 'string' ? { mensagem: op } : (op || {});
    const podePular = !!(o.chave && !o.sempre);
    if (podePular && pulada(o.chave)) return Promise.resolve(true);
    if (aberta) aberta.fechar(false);
    return new Promise((resolver) => {
      const anterior = document.activeElement;
      const raiz = document.createElement('div');
      raiz.className = 'cf-fundo';
      const id = 'cf-' + Date.now();
      raiz.innerHTML = `<div class="cf-caixa" role="alertdialog" aria-modal="true" aria-labelledby="${id}-t" aria-describedby="${id}-m">
        <h2 class="cf-titulo" id="${id}-t">${esc(o.titulo || (o.perigo === false ? 'Confirmar' : 'Tem certeza?'))}</h2>
        <p class="cf-msg" id="${id}-m">${esc(o.mensagem || '')}</p>
        ${podePular ? `<label class="cf-pular"><input type="checkbox" /> <span>Não perguntar de novo para isto</span></label>` : ''}
        <div class="cf-botoes">
          ${o.cancelar === false ? '' : `<button type="button" class="cf-nao">${esc(o.cancelar || 'Cancelar')}</button>`}
          <button type="button" class="cf-sim ${o.perigo === false ? '' : 'cf-perigo'}">${esc(o.botao || 'Excluir')}</button>
        </div>
      </div>`;
      document.body.appendChild(raiz);
      const fechar = (sim) => {
        if (!aberta) return;
        const pularMarcado = sim && podePular && raiz.querySelector('.cf-pular input') && raiz.querySelector('.cf-pular input').checked;
        if (pularMarcado) pular(o.chave);
        aberta = null; raiz.remove(); document.removeEventListener('keydown', tecla, true);
        if (anterior && anterior.focus) { try { anterior.focus(); } catch (e) { /* elemento saiu da tela */ } }
        resolver(!!sim);
      };
      const tecla = (ev) => {
        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); fechar(false); }
        if (ev.key === 'Tab') { // o foco fica dentro da janela
          const f = [...raiz.querySelectorAll('button, input')]; const i = f.indexOf(document.activeElement);
          if (ev.shiftKey && i <= 0) { ev.preventDefault(); f[f.length - 1].focus(); } else if (!ev.shiftKey && i === f.length - 1) { ev.preventDefault(); f[0].focus(); }
        }
      };
      aberta = { fechar };
      document.addEventListener('keydown', tecla, true);
      raiz.addEventListener('click', (ev) => { if (ev.target === raiz) fechar(false); });
      const nao = raiz.querySelector('.cf-nao');
      if (nao) nao.addEventListener('click', () => fechar(false));
      raiz.querySelector('.cf-sim').addEventListener('click', () => fechar(true));
      (nao || raiz.querySelector('.cf-sim')).focus(); // o padrão é não apagar
    });
  }

  window.Confirmacao = { perguntar, pulada, pular, quantasPuladas, voltarTodas };
  window.confirmarAcao = perguntar;
})();
