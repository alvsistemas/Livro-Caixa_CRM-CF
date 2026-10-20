/* Restaurante de exemplo para o PDV (Painel do dono → "Criar restaurante de exemplo").

   Cria uma conta nova, liberada sem cobrança (cortesia), já com tudo preenchido para mostrar o
   PDV funcionando de ponta a ponta: cardápio digital no ar, produtos com tamanhos e adicionais,
   estoque de bebidas e sobremesas, compras, notas de gasto, clientes com histórico, cartão
   fidelidade, vendas dos últimos 45 dias (algumas viram "sumidas") e pedidos do cardápio
   esperando confirmação. Os dados são fictícios; os telefones dos clientes não existem
   (prefixo 11 90000-…). Os pedidos do cardápio vão para o WhatsApp informado. */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { query } = require('../db/pool');
const { comoSistema, comoUsuario } = require('../db/contexto');
const { seedColunasPadrao } = require('../seed');
const E = require('./estoque');
const F = require('./fidelidade');
const { salvarTaxas, hojeBR } = require('./fechamento');
const A = require('./assinatura');
const C = require('./caixa');
const M = require('./comandas');

const diasAtras = (hoje, n) => F.somarDias(hoje, -n);

async function criarRestauranteDemo({ whatsapp = '' } = {}, agora = new Date()) {
  const sufixo = crypto.randomBytes(3).toString('hex');
  const email = `exemplo-restaurante-${sufixo}@livrocaixa.app`;
  const senha = `cantina-${crypto.randomBytes(3).toString('hex')}`;
  const tel = String(whatsapp || '').replace(/\D/g, '');

  // 1) a conta (como sistema): usuário, funil padrão do CRM e assinatura em cortesia
  const user = await comoSistema(async () => {
    const u = await User.create({ nome: 'Cantina Bella Nonna (exemplo)', email, senhaHash: await bcrypt.hash(senha, 10) });
    await seedColunasPadrao(u._id);
    await query(
      `INSERT INTO assinaturas (user_id, status, teste_ate) VALUES ($1::uuid, 'cortesia', now())
       ON CONFLICT (user_id) DO UPDATE SET status = 'cortesia'`, [String(u._id)]);
    return u;
  });
  const userId = String(user._id);
  if (A.esquecer) A.esquecer(userId);
  const hoje = hojeBR(agora);

  // 2) tudo do PDV, como a própria conta (respeita a segurança por linha)
  const r = await comoUsuario(userId, async () => {
    const negocio = await E.salvarNegocio(userId, {
      tipo: 'restaurante', nome: 'Cantina Bella Nonna', controlaEstoque: true,
      ...(tel.length >= 10 ? { whatsapp: tel, cardapioAtivo: true } : {}),
      slug: `bella-nonna-${sufixo}`, frase: 'Massas e pizzas artesanais, do forno à lenha para a sua mesa',
      cor: '#8C2F1B', horario: 'Ter a dom, das 18h às 23h30', aceitaRetirada: true, aceitaEntrega: true,
      taxaEntrega: 7, pedidoMinimo: 30, categorias: ['Pizzas', 'Massas', 'Bebidas', 'Sobremesas'],
      fidelidade: { modelo: 'selos', selosMeta: 8, selosMinimo: 40, premioValor: 49, premioTexto: 'uma pizza média grátis' },
      checklist: { produto: true, venda: true },
    });
    await salvarTaxas(userId, { debito: 1.5, credito: 3.2, pix: 0 });

    const borda = { nome: 'Borda', tipo: 'um', escolhas: [{ nome: 'Tradicional', preco: 0 }, { nome: 'Catupiry', preco: 9 }, { nome: 'Cheddar', preco: 9 }, { nome: 'Chocolate', preco: 11 }] };
    const extras = { nome: 'Adicionais', tipo: 'varios', escolhas: [{ nome: 'Bacon', preco: 6 }, { nome: 'Azeitona', preco: 3 }, { nome: 'Cebola caramelizada', preco: 5 }] };
    const tamanhos = (grande, custoG) => [{ nome: 'Média (6 fatias)' }, { nome: 'Grande (8 fatias)', preco: grande, custo: custoG }];
    const prod = {};
    const mk = async (chave, d) => { prod[chave] = await E.salvarProduto(userId, d); };
    await mk('margherita', { nome: 'Pizza Margherita', categoria: 'Pizzas', descricao: 'Molho de tomate italiano, muçarela de búfala, manjericão fresco e azeite.', preco: 49, custo: 16, controlaEstoque: false, destaque: true, variacoes: tamanhos(62, 21), opcoes: [borda, extras] });
    await mk('calabresa', { nome: 'Pizza Calabresa', categoria: 'Pizzas', descricao: 'Calabresa artesanal fatiada, cebola roxa e orégano.', preco: 46, custo: 14, controlaEstoque: false, variacoes: tamanhos(58, 18), opcoes: [borda, extras] });
    await mk('portuguesa', { nome: 'Pizza Portuguesa', categoria: 'Pizzas', descricao: 'Presunto, ovos, cebola, ervilha, azeitona e muçarela.', preco: 52, custo: 17, controlaEstoque: false, variacoes: tamanhos(65, 22), opcoes: [borda, extras] });
    await mk('queijos', { nome: 'Pizza Quatro Queijos', categoria: 'Pizzas', descricao: 'Muçarela, provolone, gorgonzola e parmesão.', preco: 55, custo: 19, controlaEstoque: false, variacoes: tamanhos(68, 24), opcoes: [borda] });
    await mk('lasanha', { nome: 'Lasanha à bolonhesa', categoria: 'Massas', descricao: 'Massa fresca, ragu de carne cozido por 6 horas e molho branco gratinado. Serve 1 pessoa.', preco: 44, custo: 13, controlaEstoque: false, destaque: true });
    await mk('nhoque', { nome: 'Nhoque ao sugo', categoria: 'Massas', descricao: 'Nhoque de batata feito na casa com molho de tomate fresco.', preco: 38, custo: 9, controlaEstoque: false, opcoes: [{ nome: 'Extras', tipo: 'varios', escolhas: [{ nome: 'Parmesão extra', preco: 4 }, { nome: 'Almôndegas (3 un.)', preco: 12 }] }] });
    await mk('carbonara', { nome: 'Espaguete à carbonara', categoria: 'Massas', descricao: 'Guanciale, gema, pecorino e pimenta-do-reino.', preco: 47, custo: 12, controlaEstoque: false });
    await mk('refri', { cozinha: false, nome: 'Refrigerante lata 350ml', categoria: 'Bebidas', preco: 7, custo: 3.1, controlaEstoque: true, variacoes: [{ nome: 'Coca-Cola', estoqueInicial: 30, estoqueMinimo: 12 }, { nome: 'Guaraná', estoqueInicial: 8, estoqueMinimo: 12 }, { nome: 'Coca-Cola Zero', estoqueInicial: 18, estoqueMinimo: 6 }] });
    await mk('suco', { nome: 'Suco natural 500ml', categoria: 'Bebidas', descricao: 'Laranja, limão ou abacaxi com hortelã.', preco: 12, custo: 3.5, controlaEstoque: false });
    await mk('agua', { cozinha: false, nome: 'Água mineral 500ml', categoria: 'Bebidas', preco: 5, custo: 1.4, controlaEstoque: true, estoqueInicial: 24, estoqueMinimo: 10, unidade: 'un' });
    await mk('pudim', { cozinha: false, nome: 'Pudim de leite', categoria: 'Sobremesas', descricao: 'Fatia generosa, receita da nonna.', preco: 14, custo: 4, controlaEstoque: true, estoqueInicial: 6, estoqueMinimo: 4 });
    await mk('petit', { nome: 'Petit gâteau com sorvete', categoria: 'Sobremesas', preco: 22, custo: 7, controlaEstoque: true, estoqueInicial: 0, estoqueMinimo: 3 });
    await mk('vinho', { cozinha: false, nome: 'Vinho tinto da casa (taça)', categoria: 'Bebidas', preco: 19, custo: 6, controlaEstoque: false, noCardapio: false });

    const vr = (chave, nome) => prod[chave].variacoes.find((v) => v.nome.startsWith(nome)).id;

    // compras de mercadoria e notas de gasto
    await E.registrarCompra(userId, { fornecedor: 'Distribuidora Paulista', meio: 'pix', data: diasAtras(hoje, 20), frete: 15,
      itens: [{ produtoId: prod.refri.id, variacaoId: vr('refri', 'Coca-Cola'), qtd: 24, custoUnit: 3.0 }, { produtoId: prod.agua.id, qtd: 24, custoUnit: 1.3 }] }, agora);
    await E.registrarCompra(userId, { fornecedor: 'Laticínios Serra Azul', meio: 'boleto', data: diasAtras(hoje, 3), vencimento: F.somarDias(hoje, 12),
      itens: [{ produtoId: prod.pudim.id, qtd: 12, custoUnit: 4.2 }] }, agora);
    for (const [descricao, valor, categoria, dias, pago] of [
      ['Gás de cozinha (2 botijões P45)', 780, 'Fornecedores', 15, true], ['Embalagens para delivery', 214.5, 'Fornecedores', 9, true],
      ['Conta de luz', 642.3, 'Moradia', 2, false], ['Impulsionamento no Instagram', 150, 'Marketing', 6, true],
    ]) await E.registrarGasto(userId, { descricao, valor, categoria, data: diasAtras(hoje, dias), meio: 'pix', pago }, agora);

    // clientes (telefones fictícios) e vendas dos últimos 45 dias
    const cli = {};
    for (const [k, nome, t, participa] of [
      ['ana', 'Ana Beatriz Costa', '11900001101', true], ['bruno', 'Bruno Henrique Lima', '11900001102', true],
      ['carla', 'Carla Mendes', '11900001103', true], ['diego', 'Diego Santos', '11900001104', false],
      ['elisa', 'Elisa Moreira', '11900001105', true], ['fabio', 'Fábio Rocha', '11900001106', true],
    ]) cli[k] = await F.salvarCliente(userId, { nome, telefone: t, participa, endereco: k === 'diego' ? '' : 'Rua das Oliveiras, 120 — Vila Mariana' }, null, hoje);
    const pizzaG = (chave, opcoes = []) => ({ produtoId: prod[chave].id, variacaoId: vr(chave, 'Grande'), qtd: 1, unit: prod[chave].variacoes[1].precoFinal + opcoes.reduce((a, o) => a + o[1], 0), opcoes: opcoes.map((o) => o[0]) });
    const pizzaM = (chave) => ({ produtoId: prod[chave].id, variacaoId: vr(chave, 'Média'), qtd: 1 });
    const coca = (q = 2) => ({ produtoId: prod.refri.id, variacaoId: vr('refri', 'Coca-Cola'), qtd: q });
    const vendas = [
      // Ana: cliente fiel, 8 compras (prêmio liberado)
      ...[44, 38, 31, 24, 17, 12, 6, 2].map((d, i) => ({ dias: d, cliente: 'ana', meio: i % 2 ? 'pix' : 'credito', itens: [pizzaG(i % 2 ? 'calabresa' : 'margherita', [['Catupiry', 9]]), coca(2)], acrescimo: 7 })),
      // Bruno: frequente
      ...[29, 15, 4].map((d) => ({ dias: d, cliente: 'bruno', meio: 'debito', itens: [{ produtoId: prod.lasanha.id, qtd: 2 }, { produtoId: prod.pudim.id, qtd: 2 }, { produtoId: prod.suco.id, qtd: 2 }] })),
      // Carla: sumida (última compra há 40 dias)
      ...[43, 40].map((d) => ({ dias: d, cliente: 'carla', meio: 'pix', itens: [pizzaM('queijos'), { produtoId: prod.agua.id, qtd: 1 }] })),
      // Diego: não participa do programa
      { dias: 10, cliente: 'diego', meio: 'dinheiro', itens: [{ produtoId: prod.carbonara.id, qtd: 1 }, { produtoId: prod.vinho.id, qtd: 2 }] },
      // Elisa e Fábio
      ...[21, 8].map((d) => ({ dias: d, cliente: 'elisa', meio: 'credito', itens: [pizzaG('portuguesa'), pizzaM('margherita'), coca(3)], acrescimo: 7 })),
      { dias: 35, cliente: 'fabio', meio: 'pix', itens: [{ produtoId: prod.nhoque.id, qtd: 1, opcoes: ['Almôndegas (3 un.)'], unit: 50 }, { produtoId: prod.refri.id, variacaoId: vr('refri', 'Guaraná'), qtd: 1 }] },
      // balcão sem cliente cadastrado
      ...[27, 19, 11, 5, 1].map((d, i) => ({ dias: d, meio: ['dinheiro', 'pix', 'debito'][i % 3], cliente: null, itens: [pizzaM(['margherita', 'calabresa', 'portuguesa'][i % 3]), { produtoId: prod.agua.id, qtd: 1 }] })),
      // Diego pendurou uma conta (fiado) há 6 dias
      { dias: 6, cliente: 'diego', meio: 'fiado', itens: [{ produtoId: prod.lasanha.id, qtd: 1 }, { produtoId: prod.vinho.id, qtd: 1 }] },
    ];
    for (const v of vendas) {
      await E.registrarVenda(userId, { meio: v.meio, data: diasAtras(hoje, v.dias), itens: v.itens, acrescimo: v.acrescimo || 0,
        ...(v.cliente ? { clienteId: cli[v.cliente].id } : {}) }, agora);
    }
    // o caixa de hoje, aberto com troco, com vendas (uma com troco, uma dividida) e uma sangria
    await C.abrirCaixa(userId, { trocoInicial: 200 }, 'Marco');
    const hojeVenda = (extra) => E.registrarVenda(userId, { data: hoje, _operador: 'Marco', ...extra }, agora);
    await hojeVenda({ pagamentos: [{ meio: 'dinheiro', valor: 100 }], itens: [pizzaM('margherita'), { produtoId: prod.agua.id, qtd: 1 }] });
    await hojeVenda({ pagamentos: [{ meio: 'pix', valor: 30 }, { meio: 'dinheiro', valor: 100 }], itens: [pizzaG('calabresa'), coca(2)] });
    await hojeVenda({ meio: 'debito', clienteId: cli.bruno.id, itens: [{ produtoId: prod.lasanha.id, qtd: 1 }, { produtoId: prod.suco.id, qtd: 1 }] });
    await C.movimentarCaixa(userId, { tipo: 'sangria', valor: 100, descricao: 'Levado para o cofre' }, 'Marco', agora, E.registrarGasto);
    // salão: 10 mesas, garçom, taxa de serviço; algumas mesas ocupadas e pedidos na cozinha
    await C.salvarPdv(userId, { taxaServico: 10 });
    await C.salvarOperador(userId, { nome: 'Marco', papel: 'gerente', pin: '1234' });
    await C.salvarOperador(userId, { nome: 'Tito', papel: 'garcom', pin: '2222' });
    const mesas = await M.salvarMesas(userId, Array.from({ length: 10 }, (_, i) => ({ nome: `Mesa ${i + 1}` })));
    const pizzaComanda = (chave, tam, borda, extra = []) => ({ produtoId: prod[chave].id, variacaoId: vr(chave, tam), qtd: 1, opcoes: { 0: [borda], 1: extra } });
    const m3 = await M.abrirComanda(userId, { mesaId: mesas[2].id, pessoas: 4 }, 'Tito');
    await M.adicionarItens(userId, m3.id, { itens: [pizzaComanda('margherita', 'Grande', 1), pizzaComanda('calabresa', 'Grande', 0, [2]), { produtoId: prod.refri.id, variacaoId: vr('refri', 'Coca-Cola'), qtd: 3 }, { produtoId: prod.suco.id, qtd: 1, obs: 'laranja, sem açúcar' }] }, 'Tito');
    const m5 = await M.abrirComanda(userId, { mesaId: mesas[4].id, pessoas: 2 }, 'Tito');
    await M.adicionarItens(userId, m5.id, { itens: [{ produtoId: prod.lasanha.id, qtd: 1 }, { produtoId: prod.carbonara.id, qtd: 1, obs: 'sem pimenta' }, { produtoId: prod.vinho.id, qtd: 2 }] }, 'Tito');
    await M.adicionarItens(userId, m5.id, { itens: [{ produtoId: prod.pudim.id, qtd: 2 }] }, 'Tito');
    await M.atualizarComanda(userId, m5.id, { status: 'conta' });
    const m8 = await M.abrirComanda(userId, { mesaId: mesas[7].id, pessoas: 3 }, 'Tito');
    await M.adicionarItens(userId, m8.id, { itens: [{ produtoId: prod.nhoque.id, qtd: 2, opcoes: { 0: [1] } }, { produtoId: prod.agua.id, qtd: 3 }] }, 'Tito');
    // a cozinha já começou a da mesa 5 (pronta) e a da mesa 3 (preparando)
    const coz = (await M.listarCozinha(userId)).tickets;
    const tk = (cid) => coz.find((t) => t.comandaId === cid);
    if (tk(m5.id)) { await M.mudarTicket(userId, tk(m5.id).id, 'preparando'); await M.mudarTicket(userId, tk(m5.id).id, 'pronto'); await M.mudarTicket(userId, tk(m5.id).id, 'entregue'); }
    if (tk(m3.id)) await M.mudarTicket(userId, tk(m3.id).id, 'preparando');
    if (tk(m8.id)) { await M.mudarTicket(userId, tk(m8.id).id, 'preparando'); await M.mudarTicket(userId, tk(m8.id).id, 'pronto'); }
    // ajuste de estoque (perda) para aparecer no histórico
    await E.ajustarEstoque(userId, { produtoId: prod.pudim.id, modo: 'perda', qtd: 1, obs: 'Caiu no chão na hora de servir' });

    // pedidos do cardápio esperando confirmação (um deles quer usar o prêmio)
    const row = (await query('SELECT n.*, u.email FROM estoque_negocio n JOIN usuarios u ON u.id = n.user_id WHERE n.user_id = $1::uuid', [userId])).rows[0];
    const opPizza = () => ({ 0: [1], 1: [0] }); // borda Catupiry + bacon
    await E.criarPedido(row, { nome: 'Ana Beatriz Costa', telefone: '11900001101', tipo: 'entrega', endereco: 'Rua das Oliveiras, 120 — Vila Mariana', pagamento: 'pix', usarBeneficio: true,
      itens: [{ produtoId: prod.margherita.id, variacaoId: vr('margherita', 'Grande'), qtd: 1, opcoes: opPizza() }, { produtoId: prod.refri.id, variacaoId: vr('refri', 'Coca-Cola'), qtd: 2 }] });
    await E.criarPedido(row, { nome: 'Gustavo Pereira', telefone: '11900001107', tipo: 'retirada', pagamento: 'dinheiro', troco: 'R$ 100', participar: true, obs: 'Sem cebola, por favor',
      itens: [{ produtoId: prod.calabresa.id, variacaoId: vr('calabresa', 'Média'), qtd: 1, opcoes: { 0: [0], 1: [] } }, { produtoId: prod.pudim.id, qtd: 1 }] });
    return negocio;
  });
  return { email, senha, slug: r.slug, cardapioAtivo: r.cardapioAtivo };
}

module.exports = { criarRestauranteDemo };
