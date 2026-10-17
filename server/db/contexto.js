/* Contexto de quem está fazendo cada consulta ao banco.

   - Dentro de uma requisição autenticada, o middleware de login chama comoUsuario(userId, ...)
     e TODA consulta feita dali em diante (inclusive as que nascem em funções chamadas pela
     rota) roda no PostgreSQL com "app.user_id" = esse usuário. As políticas de segurança por
     linha (Row-Level Security) do banco só deixam ler e gravar linhas desse usuário — mesmo
     que alguma rota esqueça o filtro por userId.
   - Fora de requisição autenticada (agendadores, webhooks, login, página pública) não há
     usuário: as consultas rodam como "sistema", e o código continua filtrando por userId
     como sempre.
   - Quando uma rota autenticada PRECISA mexer em dados de outra pessoa (gestor vendo a
     equipe, lead passado a outro membro), envolve só esse trecho em comoSistema(...),
     depois de conferir a permissão. */
const { AsyncLocalStorage } = require('async_hooks');

const armazenamento = new AsyncLocalStorage();

function atual() {
  return armazenamento.getStore() || null;
}

// "await fn()" dentro do run garante que consultas devolvidas sem await (ex.: Card.find())
// também executem dentro deste contexto
function comoUsuario(userId, fn) {
  return armazenamento.run({ userId: String(userId), sistema: false, cliente: null }, async () => await fn());
}

function comoSistema(fn) {
  return armazenamento.run({ userId: null, sistema: true, cliente: null }, async () => await fn());
}

module.exports = { armazenamento, atual, comoUsuario, comoSistema };
