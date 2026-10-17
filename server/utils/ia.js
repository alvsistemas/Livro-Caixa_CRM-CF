/* ================================================================
   Provedor de IA do painel
   ================================================================
   Todo recurso de IA (assistente flutuante, sugestão de mensagem e de tarefa,
   insights do funil, IA proativa/agente do WhatsApp) passa por aqui, então trocar
   de provedor não mexe em mais nenhum arquivo.

   Provedores suportados (escolhidos pelas variáveis de ambiente):
     - Google Gemini (plano gratuito) ........... GEMINI_API_KEY [modelo: GEMINI_MODEL]
     - Groq (plano gratuito, sem cartão) ........ GROQ_API_KEY   [modelo: GROQ_MODEL]
     - Anthropic / Claude (pago por uso) ........ ANTHROPIC_API_KEY
   Se houver mais de uma chave, vale IA_PROVEDOR ("gemini", "groq" ou "anthropic");
   sem IA_PROVEDOR, a ordem de prioridade é Gemini, Groq, Anthropic.
   Sem nenhuma chave, a IA fica desligada e o resto do painel funciona normal.

   Por dentro, tudo fala o "formato Anthropic" (blocos de texto / tool_use). Gemini e Groq
   usam a API "compatível com OpenAI" deles, então um mesmo adaptador traduz de e para
   esse formato.
================================================================ */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODELO_ANTHROPIC = 'claude-haiku-4-5-20251001';
const MODELO_GROQ_PADRAO = 'openai/gpt-oss-120b';
const MODELO_GEMINI_PADRAO = 'gemini-3.5-flash-lite';

const CHAVE_DO_PROVEDOR = { gemini: 'GEMINI_API_KEY', groq: 'GROQ_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };
function provedorAtual(env = process.env) {
  const pedido = String(env.IA_PROVEDOR || '').toLowerCase().trim();
  if (CHAVE_DO_PROVEDOR[pedido] && env[CHAVE_DO_PROVEDOR[pedido]]) return pedido;
  for (const nome of ['gemini', 'groq', 'anthropic']) {
    if (env[CHAVE_DO_PROVEDOR[nome]]) return nome;
  }
  return null;
}
function iaConfigurada(env = process.env) {
  return provedorAtual(env) !== null;
}

// ---------- tradução formato Anthropic -> OpenAI (Groq) ----------
function paraMensagensOpenAI(system, mensagens) {
  const saida = [];
  const nomeDaChamada = {}; // id da chamada -> nome da ferramenta (o Gemini quer o nome na resposta da ferramenta)
  if (system) saida.push({ role: 'system', content: system });
  for (const m of mensagens) {
    if (typeof m.content === 'string') {
      saida.push({ role: m.role, content: m.content });
      continue;
    }
    const blocos = Array.isArray(m.content) ? m.content : [];
    if (m.role === 'assistant') {
      const texto = blocos.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      const chamadas = blocos.filter((b) => b.type === 'tool_use').map((b) => {
        nomeDaChamada[b.id] = b.name;
        const chamada = {
          id: b.id,
          type: 'function',
          function: { name: b.name, arguments: JSON.stringify(b.input || {}) },
        };
        // Gemini 3 exige devolver a "assinatura de raciocínio" da chamada de ferramenta, senão rejeita o pedido seguinte
        if (b.thought_signature) chamada.extra_content = { google: { thought_signature: b.thought_signature } };
        return chamada;
      });
      const msg = { role: 'assistant', content: texto || null };
      if (chamadas.length) msg.tool_calls = chamadas;
      saida.push(msg);
    } else {
      // usuário: resultados de ferramenta viram uma mensagem "tool" cada; texto solto continua "user"
      const textos = [];
      for (const b of blocos) {
        if (b.type === 'tool_result') {
          const msgFerramenta = {
            role: 'tool',
            tool_call_id: b.tool_use_id,
            content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content),
          };
          if (nomeDaChamada[b.tool_use_id]) msgFerramenta.name = nomeDaChamada[b.tool_use_id];
          saida.push(msgFerramenta);
        } else if (b.type === 'text') {
          textos.push(b.text);
        }
      }
      if (textos.length) saida.push({ role: 'user', content: textos.join('\n') });
    }
  }
  return saida;
}

function paraFerramentasOpenAI(tools) {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema || { type: 'object', properties: {} } },
  }));
}

// resposta OpenAI -> mesmo formato que a API da Anthropic devolve
function deOpenAIParaAnthropic(data) {
  const escolha = (data.choices && data.choices[0]) || {};
  const msg = escolha.message || {};
  const content = [];
  if (msg.content) content.push({ type: 'text', text: msg.content });
  const chamadas = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
  for (const c of chamadas) {
    let input = {};
    try { input = JSON.parse((c.function && c.function.arguments) || '{}'); } catch (e) { input = {}; }
    const bloco = { type: 'tool_use', id: c.id, name: c.function && c.function.name, input };
    const assinatura = c.extra_content && c.extra_content.google && c.extra_content.google.thought_signature;
    if (assinatura) bloco.thought_signature = assinatura;
    content.push(bloco);
  }
  return { content, stop_reason: chamadas.length ? 'tool_use' : 'end_turn' };
}

const NOME_EXIBICAO = { gemini: 'Gemini', groq: 'Groq', anthropic: 'Anthropic' };
function mensagemDeErro(status, corpo, provedor = 'groq') {
  if (status === 429) return 'A IA gratuita atingiu o limite de uso por agora. Tente de novo em alguns minutos.';
  if (status === 401 || status === 403) {
    return `A chave da IA configurada no servidor foi recusada (${NOME_EXIBICAO[provedor] || provedor}). Confira a variável ${CHAVE_DO_PROVEDOR[provedor] || 'da chave'}.`;
  }
  if (status === 404 && provedor === 'gemini') return 'Modelo do Gemini não encontrado. Confira a variável GEMINI_MODEL.';
  const detalhe = corpo && (corpo.error && corpo.error.message || (Array.isArray(corpo) && corpo[0] && corpo[0].error && corpo[0].error.message));
  return detalhe || 'Erro ao consultar a IA.';
}

// Gemini e Groq falam o mesmo "dialeto" (OpenAI chat/completions); só mudam URL, chave e ajustes do modelo.
async function chamarCompativelOpenAI(provedor, { system, mensagens, maxTokens, tools }, env) {
  const gemini = provedor === 'gemini';
  const modelo = gemini ? (env.GEMINI_MODEL || MODELO_GEMINI_PADRAO) : (env.GROQ_MODEL || MODELO_GROQ_PADRAO);
  const corpo = {
    model: modelo,
    messages: paraMensagensOpenAI(system, mensagens),
  };
  // modelos que "pensam" gastam parte do limite de tokens raciocinando; damos folga pra resposta não vir cortada/vazia
  const limite = maxTokens + 600;
  if (gemini) {
    corpo.max_tokens = limite;
    corpo.reasoning_effort = 'low';
  } else {
    corpo.max_completion_tokens = limite;
    if (modelo.startsWith('openai/gpt-oss')) corpo.reasoning_effort = 'low';
  }
  if (tools && tools.length) corpo.tools = paraFerramentasOpenAI(tools);

  const res = await fetch(gemini ? GEMINI_URL : GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${gemini ? env.GEMINI_API_KEY : env.GROQ_API_KEY}` },
    body: JSON.stringify(corpo),
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* corpo vazio */ }
  if (!res.ok) throw new Error(mensagemDeErro(res.status, data, provedor));
  return deOpenAIParaAnthropic(data);
}

async function chamarAnthropic({ system, mensagens, maxTokens, tools }, env) {
  const corpo = { model: MODELO_ANTHROPIC, max_tokens: maxTokens, messages: mensagens };
  if (system) corpo.system = system;
  if (tools && tools.length) corpo.tools = tools;
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(corpo),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data.error && data.error.message) || 'Erro ao consultar a IA.');
  return data;
}

// Chamada de baixo nível — devolve { content: [...blocos], stop_reason } no formato Anthropic.
async function chamarIA({ system, mensagens, maxTokens = 300, tools } = {}, env = process.env) {
  const provedor = provedorAtual(env);
  if (!provedor) throw new Error('A integração com IA não está configurada neste servidor.');
  const args = { system, mensagens, maxTokens, tools };
  return provedor === 'anthropic' ? chamarAnthropic(args, env) : chamarCompativelOpenAI(provedor, args, env);
}

async function perguntarIA(prompt, { maxTokens = 300, system, mensagens } = {}) {
  const data = await chamarIA({
    system,
    mensagens: mensagens && mensagens.length ? mensagens : [{ role: 'user', content: prompt }],
    maxTokens,
  });
  const bloco = (data.content || []).find((b) => b.type === 'text');
  return bloco ? bloco.text.trim() : '';
}

module.exports = {
  provedorAtual, iaConfigurada, chamarIA, perguntarIA,
  paraMensagensOpenAI, paraFerramentasOpenAI, deOpenAIParaAnthropic, mensagemDeErro,
};
