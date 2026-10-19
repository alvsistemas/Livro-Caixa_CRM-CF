/* Conversa com a API do Asaas (cobranças e assinaturas).

   Variáveis de ambiente (só no Render, NUNCA no código ou no GitHub):
     ASAAS_API_KEY ........ chave da API. Sandbox começa com $aact_hmlg_, produção com $aact_prod_
     ASAAS_AMBIENTE ....... "sandbox" (padrão, dinheiro de mentira) ou "producao" (dinheiro de verdade)
     ASAAS_WEBHOOK_TOKEN .. senha que você inventa e cadastra no webhook do Asaas (confere quem avisa)

   Sem ASAAS_API_KEY a cobrança fica DESLIGADA e o sistema continua liberado pra todo mundo,
   como antes. Ou seja: subir este código não muda nada até você configurar as variáveis. */

const URLS = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  producao: 'https://api.asaas.com/v3',
};

function ambiente() {
  return String(process.env.ASAAS_AMBIENTE || 'sandbox').toLowerCase() === 'producao' ? 'producao' : 'sandbox';
}

// Confere se a chave combina com o ambiente: chave de produção no sandbox (ou o contrário)
// costuma ser engano de configuração, e com dinheiro é melhor parar do que adivinhar.
function problemaNaConfiguracao() {
  const chave = process.env.ASAAS_API_KEY || '';
  if (!chave) return 'ASAAS_API_KEY não definida';
  if (ambiente() === 'producao' && chave.includes('_hmlg_')) return 'ASAAS_AMBIENTE=producao, mas a chave é do sandbox ($aact_hmlg_)';
  if (ambiente() === 'sandbox' && chave.includes('_prod_')) return 'a chave é de produção ($aact_prod_), mas ASAAS_AMBIENTE não é "producao"';
  return null;
}

function asaasConfigurado() {
  return !!process.env.ASAAS_API_KEY && !problemaNaConfiguracao();
}

function urlBase() {
  // ASAAS_URL existe só pros testes automáticos (um Asaas de mentira rodando local)
  return (process.env.ASAAS_URL || URLS[ambiente()]).replace(/\/$/, '');
}

class ErroAsaas extends Error {
  constructor(mensagem, status, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

async function chamar(metodo, caminho, corpo) {
  const problema = problemaNaConfiguracao();
  if (problema) throw new ErroAsaas(`Cobrança não configurada: ${problema}.`, 0);
  let res;
  try {
    res = await fetch(urlBase() + caminho, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        access_token: process.env.ASAAS_API_KEY,
        'User-Agent': 'LivroCaixa/1.0', // o Asaas exige User-Agent em contas novas
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    throw new ErroAsaas('Não foi possível falar com o Asaas agora. Tente de novo em instantes.', 0, err.message);
  }
  const texto = await res.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch (e) { dados = texto; }
  if (!res.ok) {
    // O Asaas devolve { errors: [{ code, description }] } — a descrição já vem em português
    const descricao = dados && Array.isArray(dados.errors) && dados.errors.length
      ? dados.errors.map((e) => e.description).join(' ')
      : `Asaas respondeu ${res.status}`;
    throw new ErroAsaas(descricao, res.status, dados);
  }
  return dados;
}

const asaas = {
  criarCliente: (dados) => chamar('POST', '/customers', dados),
  atualizarCliente: (id, dados) => chamar('PUT', `/customers/${encodeURIComponent(id)}`, dados),
  criarAssinatura: (dados) => chamar('POST', '/subscriptions', dados),
  buscarAssinatura: (id) => chamar('GET', `/subscriptions/${encodeURIComponent(id)}`),
  atualizarAssinatura: (id, dados) => chamar('PUT', `/subscriptions/${encodeURIComponent(id)}`, dados),
  cancelarAssinatura: (id) => chamar('DELETE', `/subscriptions/${encodeURIComponent(id)}`),
  cobrancasDaAssinatura: (id) => chamar('GET', `/subscriptions/${encodeURIComponent(id)}/payments?limit=100`),
  buscarCobranca: (id) => chamar('GET', `/payments/${encodeURIComponent(id)}`),
  // leitura mínima, só pra chave não ficar "sem uso" (o Asaas desativa chaves paradas por 3 meses)
  manterChaveAtiva: () => chamar('GET', '/customers?limit=1'),
};

module.exports = { asaas, asaasConfigurado, problemaNaConfiguracao, ambiente, ErroAsaas };
