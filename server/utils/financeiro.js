/* Regras do Controle financeiro no servidor: quais seções existem e o que cada uma aceita. */

const SECOES_LISTA = ['transacoes', 'cartoes', 'investimentos', 'objetivos'];
const SECOES_OBJETO = ['perfil', 'config'];
const SECOES = [...SECOES_LISTA, ...SECOES_OBJETO];

const MAX_ITENS = 20000; // por lista — bem acima do uso normal, só pra barrar abuso
const MAX_BYTES_SECAO = 2 * 1024 * 1024; // 2 MB por seção (a foto do perfil já vem reduzida)
const MODOS_INTEGRACAO = ['vendas', 'comissoes', 'nenhum'];

const ehObjetoSimples = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Confere se o valor enviado pra uma seção tem o formato certo.
// Devolve { ok: true, valor } (já normalizado) ou { ok: false, erro }.
function validarSecao(secao, valor) {
  if (!SECOES.includes(secao)) return { ok: false, erro: 'Seção desconhecida.' };

  let tamanho = 0;
  try { tamanho = Buffer.byteLength(JSON.stringify(valor === undefined ? null : valor)); } catch (e) { return { ok: false, erro: 'Dados inválidos.' }; }
  if (tamanho > MAX_BYTES_SECAO) return { ok: false, erro: 'Dados grandes demais para salvar.' };

  if (SECOES_LISTA.includes(secao)) {
    if (!Array.isArray(valor)) return { ok: false, erro: 'Era esperada uma lista.' };
    if (valor.length > MAX_ITENS) return { ok: false, erro: 'Itens demais nessa lista.' };
    if (!valor.every(ehObjetoSimples)) return { ok: false, erro: 'Cada item da lista precisa ser um objeto.' };
    return { ok: true, valor };
  }

  if (secao === 'perfil') {
    if (valor === null) return { ok: true, valor: null };
    if (!ehObjetoSimples(valor)) return { ok: false, erro: 'Perfil inválido.' };
    if (valor.photo != null && !(typeof valor.photo === 'string' && /^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(valor.photo))) {
      return { ok: false, erro: 'Foto inválida.' };
    }
    return { ok: true, valor };
  }

  // config
  if (!ehObjetoSimples(valor)) return { ok: false, erro: 'Configuração inválida.' };
  if (valor.integracaoCrm !== undefined && !MODOS_INTEGRACAO.includes(valor.integracaoCrm)) {
    return { ok: false, erro: 'Modo de integração inválido.' };
  }
  return { ok: true, valor };
}

// Formato devolvido pro front-end, mesmo quando o usuário ainda não salvou nada.
function dadosPadrao() {
  return { transacoes: [], cartoes: [], investimentos: [], objetivos: [], perfil: null, config: {} };
}

function serializar(doc) {
  const base = dadosPadrao();
  if (!doc) return base;
  for (const s of SECOES) if (doc[s] !== undefined) base[s] = doc[s];
  if (base.config === null) base.config = {};
  return base;
}

module.exports = { SECOES, SECOES_LISTA, SECOES_OBJETO, MODOS_INTEGRACAO, validarSecao, dadosPadrao, serializar };
