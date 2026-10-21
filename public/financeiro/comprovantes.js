/* =======================================================================
   Comprovantes: foto do recibo ou PDF anexados a um lançamento.
   O arquivo fica no servidor (tabela própria); o lançamento guarda só a lista
   { id, nome, tipo } em tx.comprovantes.
   ======================================================================= */
const MAX_PDF = 3 * 1024 * 1024;

function comprovantesNoFormulario(f) {
  const lista = f.comprovantes || [];
  return `<div class="field"><label>Comprovantes</label>
    <div class="comprov-lista">${lista.map((c) => `<span class="comprov-item" data-cid="${c.id}"><button type="button" class="link-btn comprov-ver">${c.tipo === "application/pdf" ? "📄" : "🖼"} ${escapeHtml(c.nome)}</button><button type="button" class="icon-btn comprov-del" title="Remover">✕</button></span>`).join("")}</div>
    <label class="btn ghost btn-mini comprov-add">📎 Anexar foto ou PDF<input type="file" id="f-comprov" accept="image/*,application/pdf" hidden /></label>
    <span class="field-ajuda" id="comprov-status"></span>
  </div>`;
}
// Reduz fotos grandes (celular tira fotos de 4 a 8 MB) pra no máximo 1600px, em JPEG
function prepararImagem(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não foi possível ler essa imagem.")); };
    img.src = url;
  });
}
function lerComoDataUrl(file) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error("Não foi possível ler o arquivo.")); r.readAsDataURL(file); });
}
async function enviarComprovante(lancamentoId, file) {
  let tipo, dados, nome = file.name || "comprovante";
  if (file.type === "application/pdf") {
    if (file.size > MAX_PDF) throw new Error("PDF grande demais (máximo 3 MB).");
    tipo = "application/pdf"; dados = await lerComoDataUrl(file);
  } else if (file.type.startsWith("image/")) {
    tipo = "image/jpeg"; dados = await prepararImagem(file); nome = nome.replace(/\.[^.]+$/, "") + ".jpg";
  } else {
    throw new Error("Envie uma foto ou um PDF.");
  }
  return api("POST", "/financeiro/comprovantes", { lancamentoId, nome, tipo, dados });
}
function ligarComprovantesNoFormulario(f, enviadosAgora, redesenhar) {
  const input = document.getElementById("f-comprov");
  if (!input) return;
  // num lançamento que já existe, o anexo é gravado na hora (mesmo que feche sem salvar)
  const gravarNoLancamento = () => {
    const tx = state.txs.find((t) => t.id === f.id);
    if (tx) { tx.comprovantes = f.comprovantes.slice(); saveTxs(); }
  };
  input.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const status = document.getElementById("comprov-status");
    status.textContent = "Enviando…";
    try {
      const c = await enviarComprovante(f.id, file);
      f.comprovantes = [...(f.comprovantes || []), { id: c.id, nome: c.nome, tipo: c.tipo }];
      enviadosAgora.push(c.id);
      gravarNoLancamento();
      redesenhar();
    } catch (err) {
      status.textContent = "⚠ " + err.message;
    }
  });
  document.querySelectorAll(".comprov-ver").forEach((b) => b.addEventListener("click", (e) => {
    const c = (f.comprovantes || []).find((x) => x.id === e.target.closest(".comprov-item").dataset.cid);
    if (c) verComprovante(c);
  }));
  document.querySelectorAll(".comprov-del").forEach((b) => b.addEventListener("click", async (e) => {
    const id = e.target.closest(".comprov-item").dataset.cid;
    if (!(await confirmarAcao({ mensagem: "Remover este comprovante?", botao: "Remover", chave: "comprovante" }))) return;
    try { await api("DELETE", `/financeiro/comprovantes/${id}`); } catch (err) { /* já pode ter sido apagado */ }
    f.comprovantes = (f.comprovantes || []).filter((x) => x.id !== id);
    gravarNoLancamento();
    redesenhar();
  }));
}
// Abre o arquivo (a rota exige login, então baixa com o token e mostra a partir da memória)
async function verComprovante(c) {
  const janela = document.createElement("div");
  janela.className = "comprov-visor";
  janela.innerHTML = `<div class="comprov-visor-barra"><span>${escapeHtml(c.nome)}</span><span><a id="comprov-baixar" class="btn ghost btn-mini">Baixar</a> <button class="btn ghost btn-mini" id="comprov-fechar">Fechar</button></span></div><div class="comprov-visor-corpo"><p>Carregando…</p></div>`;
  document.body.appendChild(janela);
  let url = null;
  const fechar = () => { janela.remove(); if (url) URL.revokeObjectURL(url); document.removeEventListener("keydown", esc); };
  const esc = (e) => { if (e.key === "Escape") fechar(); };
  document.addEventListener("keydown", esc);
  janela.querySelector("#comprov-fechar").addEventListener("click", fechar);
  try {
    const res = await fetch(`${API_BASE}/financeiro/comprovantes/${c.id}`, { headers: { Authorization: "Bearer " + sessionToken } });
    if (!res.ok) throw new Error("Não foi possível abrir o comprovante.");
    url = URL.createObjectURL(await res.blob());
    const corpo = janela.querySelector(".comprov-visor-corpo");
    corpo.innerHTML = c.tipo === "application/pdf" ? `<iframe src="${url}" title="${escapeHtml(c.nome)}"></iframe>` : `<img src="${url}" alt="${escapeHtml(c.nome)}" />`;
    const baixar = janela.querySelector("#comprov-baixar");
    baixar.href = url; baixar.download = c.nome;
  } catch (err) {
    janela.querySelector(".comprov-visor-corpo").innerHTML = `<p>${escapeHtml(err.message)}</p>`;
  }
}
// Botão 📎 da tabela: um comprovante abre direto; vários, mostra a lista
function abrirComprovantes(tx) {
  const lista = tx.comprovantes || [];
  if (lista.length === 1) { verComprovante(lista[0]); return; }
  openModal(`Comprovantes · ${escapeHtml(tx.desc)}`, `<div class="comprov-lista">${lista.map((c) => `<button class="btn ghost comprov-abrir" data-cid="${c.id}">${c.tipo === "application/pdf" ? "📄" : "🖼"} ${escapeHtml(c.nome)}</button>`).join("")}</div>`);
  document.querySelectorAll(".comprov-abrir").forEach((b) => b.addEventListener("click", () => { closeModal(); verComprovante(lista.find((c) => c.id === b.dataset.cid)); }));
}
