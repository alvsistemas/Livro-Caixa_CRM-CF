const test = require('node:test');
const assert = require('node:assert');
const ia = require('../utils/ia');

test('provedorAtual', async (t) => {
  await t.test('sem chaves, a IA fica desligada', () => {
    assert.strictEqual(ia.provedorAtual({}), null);
    assert.strictEqual(ia.iaConfigurada({}), false);
  });
  await t.test('só uma chave: usa a que existe', () => {
    assert.strictEqual(ia.provedorAtual({ GROQ_API_KEY: 'g' }), 'groq');
    assert.strictEqual(ia.provedorAtual({ ANTHROPIC_API_KEY: 'a' }), 'anthropic');
  });
  await t.test('as duas: Groq por padrão, IA_PROVEDOR escolhe', () => {
    const env = { GROQ_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' };
    assert.strictEqual(ia.provedorAtual(env), 'groq');
    assert.strictEqual(ia.provedorAtual({ ...env, IA_PROVEDOR: 'anthropic' }), 'anthropic');
  });
  await t.test('Gemini tem prioridade quando há mais de uma chave; IA_PROVEDOR pode mudar isso', () => {
    const env = { GEMINI_API_KEY: 'm', GROQ_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' };
    assert.strictEqual(ia.provedorAtual(env), 'gemini');
    assert.strictEqual(ia.provedorAtual({ ...env, IA_PROVEDOR: 'groq' }), 'groq');
    assert.strictEqual(ia.provedorAtual({ GEMINI_API_KEY: 'm' }), 'gemini');
  });
  await t.test('IA_PROVEDOR sem a chave correspondente é ignorado', () => {
    assert.strictEqual(ia.provedorAtual({ GROQ_API_KEY: 'g', IA_PROVEDOR: 'anthropic' }), 'groq');
  });
});

test('tradução de mensagens para o formato OpenAI', () => {
  const historico = [
    { role: 'user', content: 'Quantos leads eu tenho?' },
    { role: 'assistant', content: [
      { type: 'text', text: 'Vou conferir.' },
      { type: 'tool_use', id: 'call_1', name: 'resumo_pipeline', input: {} },
    ] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '{"totalClientes":11}' }] },
  ];
  const r = ia.paraMensagensOpenAI('Seja breve.', historico);
  assert.deepStrictEqual(r[0], { role: 'system', content: 'Seja breve.' });
  assert.deepStrictEqual(r[1], { role: 'user', content: 'Quantos leads eu tenho?' });
  assert.strictEqual(r[2].role, 'assistant');
  assert.strictEqual(r[2].content, 'Vou conferir.');
  assert.deepStrictEqual(r[2].tool_calls, [{ id: 'call_1', type: 'function', function: { name: 'resumo_pipeline', arguments: '{}' } }]);
  assert.deepStrictEqual(r[3], { role: 'tool', tool_call_id: 'call_1', content: '{"totalClientes":11}', name: 'resumo_pipeline' });
});

test('ferramentas e resposta do Groq voltam no formato Anthropic', () => {
  const f = ia.paraFerramentasOpenAI([{ name: 'buscar_lead', description: 'x', input_schema: { type: 'object', properties: { nome: { type: 'string' } } } }]);
  assert.strictEqual(f[0].type, 'function');
  assert.strictEqual(f[0].function.name, 'buscar_lead');
  assert.deepStrictEqual(f[0].function.parameters.properties.nome, { type: 'string' });

  const texto = ia.deOpenAIParaAnthropic({ choices: [{ message: { content: 'Olá!' } }] });
  assert.deepStrictEqual(texto, { content: [{ type: 'text', text: 'Olá!' }], stop_reason: 'end_turn' });

  const chamada = ia.deOpenAIParaAnthropic({ choices: [{ message: { content: null, tool_calls: [{ id: 'c9', function: { name: 'buscar_lead', arguments: '{"nome":"Ana"}' } }] } }] });
  assert.strictEqual(chamada.stop_reason, 'tool_use');
  assert.deepStrictEqual(chamada.content[0], { type: 'tool_use', id: 'c9', name: 'buscar_lead', input: { nome: 'Ana' } });

  const quebrada = ia.deOpenAIParaAnthropic({ choices: [{ message: { tool_calls: [{ id: 'c1', function: { name: 'x', arguments: '{lixo' } }] } }] });
  assert.deepStrictEqual(quebrada.content[0].input, {});
});

test('chamarIA (fetch simulado)', async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });

  await t.test('Groq: URL, chave, modelo e reasoning_effort corretos; texto volta', async () => {
    let visto;
    global.fetch = async (url, opts) => { visto = { url, headers: opts.headers, corpo: JSON.parse(opts.body) }; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Oi' } }] }) }; };
    const r = await ia.chamarIA({ system: 'S', mensagens: [{ role: 'user', content: 'oi' }], maxTokens: 80 }, { GROQ_API_KEY: 'gsk_x' });
    assert.strictEqual(visto.url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.strictEqual(visto.headers.Authorization, 'Bearer gsk_x');
    assert.strictEqual(visto.corpo.model, 'openai/gpt-oss-120b');
    assert.strictEqual(visto.corpo.reasoning_effort, 'low');
    assert.ok(visto.corpo.max_completion_tokens >= 80);
    assert.strictEqual(visto.corpo.messages[0].role, 'system');
    assert.strictEqual(r.content[0].text, 'Oi');
  });

  await t.test('GROQ_MODEL diferente não leva reasoning_effort', async () => {
    let corpo;
    global.fetch = async (url, opts) => { corpo = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'x' } }] }) }; };
    await ia.chamarIA({ mensagens: [{ role: 'user', content: 'a' }] }, { GROQ_API_KEY: 'k', GROQ_MODEL: 'qwen/qwen3.8-27b' });
    assert.strictEqual(corpo.model, 'qwen/qwen3.8-27b');
    assert.strictEqual(corpo.reasoning_effort, undefined);
  });

  await t.test('limite (429) vira mensagem amigável em português', async () => {
    global.fetch = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'rate limit' } }) });
    await assert.rejects(() => ia.chamarIA({ mensagens: [{ role: 'user', content: 'a' }] }, { GROQ_API_KEY: 'k' }), /limite de uso/);
  });

  await t.test('chave recusada (401) orienta a conferir a variável', async () => {
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
    await assert.rejects(() => ia.chamarIA({ mensagens: [{ role: 'user', content: 'a' }] }, { GROQ_API_KEY: 'k' }), /GROQ_API_KEY/);
  });

  await t.test('Anthropic continua funcionando quando é o provedor', async () => {
    let visto;
    global.fetch = async (url, opts) => { visto = { url, headers: opts.headers }; return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }) }; };
    const r = await ia.chamarIA({ mensagens: [{ role: 'user', content: 'a' }] }, { ANTHROPIC_API_KEY: 'sk-ant' });
    assert.strictEqual(visto.url, 'https://api.anthropic.com/v1/messages');
    assert.strictEqual(visto.headers['x-api-key'], 'sk-ant');
    assert.strictEqual(r.content[0].text, 'ok');
  });

  await t.test('sem nenhuma chave: erro claro', async () => {
    await assert.rejects(() => ia.chamarIA({ mensagens: [] }, {}), /não está configurada/);
  });

  await t.test('Gemini: endpoint compatível, chave Bearer, modelo padrão, max_tokens e reasoning_effort', async () => {
    let visto;
    global.fetch = async (url, opts) => { visto = { url, headers: opts.headers, corpo: JSON.parse(opts.body) }; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Olá' } }] }) }; };
    const r = await ia.chamarIA({ system: 'S', mensagens: [{ role: 'user', content: 'oi' }], maxTokens: 100 }, { GEMINI_API_KEY: 'AIza_x' });
    assert.strictEqual(visto.url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    assert.strictEqual(visto.headers.Authorization, 'Bearer AIza_x');
    assert.strictEqual(visto.corpo.model, 'gemini-3.5-flash-lite');
    assert.strictEqual(visto.corpo.reasoning_effort, 'low');
    assert.ok(visto.corpo.max_tokens >= 100);
    assert.strictEqual(visto.corpo.max_completion_tokens, undefined);
    assert.strictEqual(r.content[0].text, 'Olá');
  });

  await t.test('GEMINI_MODEL troca o modelo; 404 orienta a conferir a variável', async () => {
    let corpo;
    global.fetch = async (url, opts) => { corpo = JSON.parse(opts.body); return { ok: false, status: 404, json: async () => ({}) }; };
    await assert.rejects(() => ia.chamarIA({ mensagens: [{ role: 'user', content: 'a' }] }, { GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-3.8-flash' }), /GEMINI_MODEL/);
    assert.strictEqual(corpo.model, 'gemini-3.8-flash');
  });

  await t.test('Gemini: 429 e 401 têm mensagens em português', async () => {
    global.fetch = async () => ({ ok: false, status: 429, json: async () => ([{ error: { message: 'quota' } }]) });
    await assert.rejects(() => ia.chamarIA({ mensagens: [{ role: 'user', content: 'a' }] }, { GEMINI_API_KEY: 'k' }), /limite de uso/);
    global.fetch = async () => ({ ok: false, status: 400, json: async () => ([{ error: { message: 'API key not valid' } }]) });
    await assert.rejects(() => ia.chamarIA({ mensagens: [{ role: 'user', content: 'a' }] }, { GEMINI_API_KEY: 'k' }), /API key not valid/);
    global.fetch = async () => ({ ok: false, status: 403, json: async () => ({}) });
    await assert.rejects(() => ia.chamarIA({ mensagens: [{ role: 'user', content: 'a' }] }, { GEMINI_API_KEY: 'k' }), /GEMINI_API_KEY/);
  });
});

test('assinatura de raciocínio do Gemini volta na chamada seguinte, e o nome vai na resposta da ferramenta', () => {
  const resposta = ia.deOpenAIParaAnthropic({ choices: [{ message: { content: null, tool_calls: [
    { id: 'c1', function: { name: 'resumo_pipeline', arguments: '{}' }, extra_content: { google: { thought_signature: 'SIG123' } } },
  ] } }] });
  assert.strictEqual(resposta.content[0].thought_signature, 'SIG123');
  const hist = [
    { role: 'user', content: 'e o funil?' },
    { role: 'assistant', content: resposta.content },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: '{"ok":1}' }] },
  ];
  const msgs = ia.paraMensagensOpenAI('S', hist);
  assert.deepStrictEqual(msgs[2].tool_calls[0].extra_content, { google: { thought_signature: 'SIG123' } });
  assert.strictEqual(msgs[3].name, 'resumo_pipeline');
  assert.strictEqual(msgs[3].tool_call_id, 'c1');
});
