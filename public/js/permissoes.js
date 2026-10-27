/* Permissões da equipe no CRM.
   - Membros de equipe: some do menu e da tela o que o gestor não liberou (quem garante
     de verdade é o servidor, que responde 403).
   - Gestor: aba Equipe → Permissões, para escolher as abas e funções dos membros.
   Usa as globais do CRM (js/crm/) (equipe, apiRequest, esc, renderApp, currentPage). */

let minhasPermissoes = null; // { abas, funcoes, restrito }
let permForm = null;         // cópia em edição, na aba Equipe → Permissões
let permMsg = null;
let permSalvando = false;

function definirMinhasPermissoes(p) {
  minhasPermissoes = p || null;
  aplicarPermissoesNaTela();
}
// true se pode; sem restrição (ou ainda sem dados) libera tudo
function podeCrm(grupo, chave) {
  const p = minhasPermissoes;
  if (!p || !p.restrito) return true;
  return !(p[grupo] && p[grupo][chave] === false);
}
function paginaBloqueada(pagina) { return !podeCrm('abas', pagina); }

// o que some da tela quando a função está bloqueada
const PERM_SELETORES = {
  excluirClientes: ['#f-delete', '[data-action="leads-bulk-excluir"]'],
  exportarDados: ['[data-action="exportar-leads"]', '[data-action="gerot-exportar-planilha"]', '[data-action="exportar-csv"]', '[data-action="exportar-relatorio-pdf"]',
    '#backup-modal-exportar', '[data-action="backup-auto-alternar"]', '[data-action="backup-auto-agora"]'],
  editarFunis: ['[data-action="edit-funil-name"]', '[data-action="duplicar-funil"]', '[data-action="delete-funil"]', '[data-action="open-new-funil"]',
    '[data-action="start-add-col"]', '[data-action="toggle-col-menu"]'],
  editarRegrasComissao: ['[data-action="open-regras-comissao"]'],
  fechamentoVenda: ['#f-fechamento', '#f-devolucao', '.fech-selo', '.fech-aviso-valor'],
};
function aplicarPermissoesNaTela() {
  const p = minhasPermissoes;
  if (!p || !p.restrito) return;
  for (const [chave, seletores] of Object.entries(PERM_SELETORES)) {
    if (podeCrm('funcoes', chave)) continue;
    document.querySelectorAll(seletores.join(',')).forEach((el) => el.remove());
  }
  for (const [aba, ok] of Object.entries(p.abas || {})) {
    if (!ok) document.querySelectorAll(`[data-action="nav"][data-page="${aba}"]`).forEach((el) => el.remove());
  }
  // o grupo "Mais" sem nenhuma aba liberada some
  document.querySelectorAll('.nav-mais').forEach((g) => { if (!g.querySelector('[data-page]')) g.remove(); });
}
// roda depois de cada redesenho (os botões já foram ligados, então tirar não quebra nada)
new MutationObserver(() => { if (minhasPermissoes && minhasPermissoes.restrito) aplicarPermissoesNaTela(); })
  .observe(document.body, { childList: true, subtree: true });

/* ---------- aba Equipe → Permissões (só gestor) ---------- */
function renderPermissoesEquipe() {
  if (!equipe || !equipe.souSupervisor || !equipe.catalogoPermissoes) return '';
  if (!permForm) permForm = JSON.parse(JSON.stringify(equipe.permissoes || { abas: {}, funcoes: {} }));
  const cat = equipe.catalogoPermissoes;
  const membros = equipe.membros.filter((m) => m.papel !== 'supervisor').length;
  const grupo = (titulo, chaveGrupo, lista) => `
    <fieldset class="perm-grupo">
      <legend>${titulo}</legend>
      ${lista.map((x) => `<label class="perm-item">
        <input type="checkbox" data-perm-grupo="${chaveGrupo}" data-perm="${x.chave}" ${permForm[chaveGrupo][x.chave] !== false ? 'checked' : ''} />
        <span><b>${esc(x.nome)}</b>${x.dica ? `<small>${esc(x.dica)}</small>` : ''}</span>
      </label>`).join('')}
    </fieldset>`;
  return `
    <div class="settings-page-section perm-card">
      <h3 style="margin-top:0">O que os membros podem usar</h3>
      <p class="settings-page-note">Vale para ${membros === 1 ? '1 membro' : `${membros} membros`} da equipe. Gestores sempre têm tudo. As Negociações, o Chat e as Configurações pessoais ficam sempre abertos.</p>
      <div class="perm-colunas">
        ${grupo('Abas', 'abas', cat.abas)}
        ${grupo('Funções', 'funcoes', cat.funcoes)}
      </div>
      ${permMsg ? `<p class="settings-page-note perm-msg" role="status">${esc(permMsg)}</p>` : ''}
      <div class="perm-acoes">
        <button class="btn-outline" data-action="perm-tudo">Liberar tudo</button>
        <button class="btn-save" data-action="perm-salvar" ${permSalvando ? 'disabled' : ''}>${permSalvando ? 'Salvando…' : 'Salvar permissões'}</button>
      </div>
    </div>`;
}
document.addEventListener('change', (e) => {
  const el = e.target.closest && e.target.closest('[data-perm]');
  if (!el || !permForm) return;
  permForm[el.dataset.permGrupo][el.dataset.perm] = el.checked;
  permMsg = null;
});
document.addEventListener('click', async (e) => {
  const tudo = e.target.closest && e.target.closest('[data-action="perm-tudo"]');
  if (tudo && permForm) {
    for (const g of ['abas', 'funcoes']) for (const k of Object.keys(permForm[g])) permForm[g][k] = true;
    permMsg = 'Tudo marcado. Clique em Salvar para valer.';
    renderApp();
    return;
  }
  const salvar = e.target.closest && e.target.closest('[data-action="perm-salvar"]');
  if (!salvar || !permForm || permSalvando) return;
  permSalvando = true; permMsg = null; renderApp();
  try {
    const r = await apiRequest('PUT', '/equipe/permissoes', permForm);
    equipe.permissoes = r.permissoes;
    permForm = JSON.parse(JSON.stringify(r.permissoes));
    permMsg = 'Permissões salvas. Os membros veem a mudança na próxima vez que abrirem o sistema.';
  } catch (err) {
    permMsg = err.message || 'Não foi possível salvar.';
  }
  permSalvando = false;
  renderApp();
});
