# Livro-Caixa — CRM e Controle financeiro para qualquer negócio (PostgreSQL + login)

> **Publicar do zero (GitHub → Neon → Render):** veja o arquivo
> [`GUIA-DE-PUBLICACAO.md`](GUIA-DE-PUBLICACAO.md).

## Três aplicativos, um login

Depois do login, a tela `inicio.html` pergunta qual aplicativo abrir:

- **CRM** (`index.html`) — funil de vendas, clientes, conversas, tarefas, comissões.
- **Controle financeiro** (`financeiro/`) — o antigo Livro-Caixa: receitas e despesas
  (únicas, fixas com data de fim ou parceladas, com ajuste "só este mês"), contas e saldo
  real, transferências, contas a pagar e receber (com lembrete no celular), fatura de cada
  cartão, orçamento por categoria, dívidas com plano de quitação, investimentos, objetivos,
  área da Empresa, relatórios (gráficos, resumo anual e ajuda para o IR), importação de
  extrato (OFX/CSV) e do Livro-Caixa antigo, exportação Excel/PDF, comprovantes, categorias
  personalizadas, modo noturno, níveis por perfil e a aba **Lucro**.
  Arquivos: `calculos.js` (todas as contas, usado também pelo servidor), `script.js`
  (núcleo e telas antigas) e um arquivo por tela nova (`contas.js`, `cartoes.js`,
  `orcamento.js`, `dividas.js`, `comprovantes.js`, `importar.js`, `relatorios.js`, `perfil.js`).

- **PDV** (`estoque/`, opcional, para quem tem empresa) — produtos com variações
  e estoque, venda no balcão, clientes com histórico e programa de fidelidade (cartão fidelidade
  ou cashback), compras de mercadoria e notas de gasto, tudo lançado sozinho no
  Controle financeiro. Restaurante ganha o **cardápio digital** (`/c/<endereço>`) com pedido
  pelo WhatsApp (sem pagamento no site). Veja a seção "PDV" no fim.

Os três usam a mesma conta (mesmo token). O botão **Trocar de aplicativo** fica no
fim da barra lateral dos dois. A raiz do site (`/`) é a tela inicial de escolha (`public/inicio.html`); o endereço antigo `/inicio.html` redireciona para `/`.

**Integração CRM → financeiro** (nada é copiado; é lido do CRM a cada abertura e entra
nos cálculos como lançamento só de leitura, com o selo "CRM"). Na aba Lucro a pessoa
escolhe como o CRM entra:

- **Valor das vendas** (padrão, para donos de negócio): cada cliente numa coluna de
  "ganho" vira receita da Empresa, categoria "Vendas", no mês de venda do card.
  Opcional: descontar as comissões do CRM como despesa da Empresa.
- **Minhas comissões** (para vendedores): cada parcela das comissões do CRM vira receita,
  no mês da parcela (respeitando cancelamentos).
- **Não usar o CRM.**

**Onde os dados ficam:** tabelas `financeiro_lancamentos`, `financeiro_cartoes`,
`financeiro_investimentos`, `financeiro_objetivos` e `financeiro_perfis` (perfil e
config). Rotas: `GET /api/financeiro` e `PUT /api/financeiro/:secao` (corpo
`{ "valor": ... }`, validado e gravado por `server/utils/financeiro.js`). O front-end
salva sozinho, meio segundo depois de cada alteração, e mostra "Tudo salvo na sua conta"
no rodapé da barra lateral. O backup (Configurações → Manutenção) inclui o Controle
financeiro (`controleFinanceiro`).

## Banco de dados: PostgreSQL (Neon) com segurança por linha

- **Tabelas de verdade**, com tipos: IDs em UUID, dinheiro em `numeric(14,2)` (centavos
  exatos), datas em `timestamptz`, chaves estrangeiras (apagar uma conta apaga os dados
  dela) e índices. O esquema está em `server/db/migracoes/*.sql`.
- **Migrações automáticas:** toda vez que o servidor sobe, `server/db/migrar.js` aplica os
  arquivos de `db/migracoes/` que ainda não rodaram (registro na tabela `schema_migracoes`).
  Pra mudar o banco no futuro, crie um arquivo novo (`003_....sql`) — nunca edite um que já
  foi aplicado. Pra testar a conexão sem subir o servidor: `cd server && node db/migrar.js`.
- **Row-Level Security (RLS):** toda tabela com `user_id` tem a política `so_o_dono`. Em cada
  transação o servidor diz quem está consultando (`app.user_id`, ou `app.bypass = 'on'` para
  tarefas do sistema) e troca para o papel `livro_app` (sem BYPASSRLS). Assim, numa
  requisição de um usuário logado, o próprio banco recusa linhas de outra pessoa — mesmo
  que alguma rota esqueça o filtro. Quem liga isso é o `middleware/auth.js`
  (`comoUsuario`); trechos que precisam ler dados de outra pessoa da equipe, depois de
  conferir a permissão, usam `comoSistema` (`server/db/contexto.js`).
- **Camada de dados:** `server/db/modelo.js` dá aos modelos (`server/models/`) os mesmos
  métodos de antes (`find`, `findOne`, `findOneAndUpdate`, `save`, `populate`...), traduzindo
  pra SQL. Consultas especiais usam SQL direto (`require('../db/pool').query`).
- **Ver os dados no painel do Neon (SQL Editor):** como o RLS vale também pro dono das
  tabelas, rode antes `SET app.bypass = 'on';` na mesma sessão.
- **Backups antigos** (da época do MongoDB) podem ser importados: os IDs de 24 caracteres
  viram UUID sempre do mesmo jeito, então as ligações entre os dados continuam certas.
- **Testes com banco:** `TEST_DATABASE_URL=postgres://... npm test` roda também
  `test/integracao.test.js` (cadastro, isolamento entre contas, RLS, comissões, equipe,
  financeiro, backup, webhooks, agendadores). O banco de teste é apagado a cada execução.

Por enquanto o Controle financeiro não tem plano pago: todas as abas ficam liberadas.
O sistema de assinatura vai ser refeito depois, com cobrança real.


⚠️ **Testes automatizados:** rode `cd server && npm test` pra rodar os testes
(usa o test runner nativo do Node, não precisa instalar nada a mais). Hoje cobre
o cálculo de comissão (regras editáveis), a normalização
de telefone, a agenda .ics, o login e a recuperação de senha (com o limite de
tentativas), a assinatura dos webhooks da Meta, o e-mail, os lembretes push e
os tokens de redefinição de senha. Vale adicionar teste novo sempre que
corrigir um bug de lógica, pra ele nunca mais voltar sem a gente perceber.
Pra rodar tudo de uma vez (sintaxe, CSS, HTML e testes), use `bash scripts/verificar.sh`.

⚠️ **Monitoramento de erros:** todo erro registrado com `console.error` (é o
que toda rota já faz antes de responder com erro 500) também é guardado no
banco (tabela `erros`, limpa sozinha depois de 30 dias) e aparece pra quem tem
acesso de **supervisor de dados** — uma permissão separada do "Gestor" da
equipe, concedida em Equipe → Gestão → Membros → "Tornar supervisor de dados".
Falhas graves do servidor (`uncaughtException`/`unhandledRejection`/queda do
banco de dados) também disparam um **alerta no Telegram**, se configurado (veja
`TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` no `.env.example` — o passo a passo
completo de como criar o bot está em `server/utils/telegramAlerta.js`). Não
depende da API do WhatsApp Business nem de verificação de empresa na Meta.

⚠️ **Cache do navegador:** `style.css`, `script.js` e `login.js` são
carregados com `?v=AAAAMMDD` no final da URL (ex: `style.css?v=20261082`).
Isso existe só pra forçar o navegador a buscar a versão nova depois de um
deploy — sem isso, quem já tinha o site aberto continua vendo o CSS/JS
antigo em cache, às vezes por dias. **Toda vez que `style.css`, `script.js`
ou `login.js` for alterado, atualize esse número** (nos três arquivos:
`index.html` e `login.html`) pra data do dia, senão a mudança não aparece
pra quem já visitou o site antes.

⚠️ **Cache de quem instalou como "app" no celular (PWA):** o
`public/sw.js` usa estratégia *network-first* — toda vez que o celular tem
internet, ele busca a versão mais nova do servidor primeiro, e só usa o
que está guardado se estiver offline. Isso significa que **atualizações do
site aparecem sozinhas** pra quem já instalou o app, sem precisar
reinstalar — só abrir o app de novo com internet. Não é preciso mexer em
nada no `sw.js` em atualizações normais do site.

## Estrutura

```
livro-caixa/
  public/                <- front-end (servido pelo Express)
    index.html            (painel — exige login)
    login.html             (tela de entrar / criar conta)
    css/style.css
    js/script.js           (lógica do painel)
    js/login.js             (lógica do login/cadastro)
  server/                 <- back-end
    server.js
    seed.js                 (cria o funil padrão para cada novo usuário)
    middleware/
      auth.js                (valida o token JWT)
    models/
      User.js
      Column.js
      Card.js
    routes/
      auth.js                (cadastro, login, /me)
      board.js
      columns.js
      cards.js
    package.json
    .env.example
  scripts/                <- scripts de verificação e empacotamento (uso no dia a dia)
    verificar.sh            (roda todas as checagens antes de subir uma mudança)
    gerar-pacote.sh         (gera o .zip pronto pra enviar/publicar)
    verificar-bindings.js   (checagem auxiliar usada pelo verificar.sh)
```

## Scripts de verificação e empacotamento

A pasta `scripts/` tem os comandos que a gente usa pra conferir se está tudo
certo antes de subir uma mudança, e pra gerar o pacote `.zip` pronto pra
publicar. Rode sempre a partir da raiz do projeto:

```bash
# Confere sintaxe do JS (front e back), CSS, HTML e os testes automatizados.
# Não muda nada, só avisa se algo está quebrado. Rode sempre que mexer em código.
bash scripts/verificar.sh

# Faz tudo de uma vez: roda o verificar.sh, aumenta o número de cache (?v=...)
# em 1, gera o dist/livro-caixa.zip e confere esse .zip numa pasta limpa
# (extrai, "npm install" do zero e roda os testes de novo).
bash scripts/gerar-pacote.sh
```

Se o `verificar.sh` encontrar algum problema, o `gerar-pacote.sh` para e não
gera pacote nenhum — corrija o que foi apontado e rode de novo. O `.zip`
final sempre sai em `dist/livro-caixa.zip`, sem `.git`, sem `node_modules`
e sem nenhum `.env` com senha de verdade.

## Passo a passo

1. Instale as dependências:
   ```
   cd server
   npm install
   ```

2. Configure o banco e o segredo do login:
   ```
   cp .env.example .env
   ```
   Edite `.env`:
   - `DATABASE_URL` com a string de conexão do PostgreSQL (local ou Neon)
   - `JWT_SECRET` com qualquer texto longo e aleatório (usado para assinar os tokens de login)

3. Rode o servidor:
   ```
   npm start
   ```

4. Abra `http://localhost:3000`. Como ainda não há sessão, você cai direto em
   `login.html`. Clique em "Criar conta", preencha e-mail e senha — isso já
   cria o seu funil padrão (Leads, Qualificação, Negociação, Fechado, Perdido)
   e te leva pro painel.

## Como funciona o login

- Senhas nunca são salvas em texto puro — são criptografadas com `bcrypt`
  antes de ir pro banco (campo `senhaHash`).
- Ao entrar ou criar conta, a API devolve um token (JWT) que o front-end
  guarda no `localStorage` do navegador.
- Toda requisição ao painel (`/api/board`, `/api/columns`, `/api/cards`)
  manda esse token no header `Authorization: Bearer <token>`. O servidor
  confere o token e descobre de qual usuário são os dados.
- Cada coluna e cada card tem um `userId` — os dados de um usuário nunca
  aparecem para outro.
- O botão "Sair" no painel apaga o token e volta pra tela de login.

## Configurar o "Continuar com Google" (opcional)

O botão já está pronto no código, mas precisa de um Client ID seu pra
funcionar — sem isso, ele mostra uma mensagem discreta em vez do botão.
O Client ID vem do servidor (`GOOGLE_CLIENT_ID` no ambiente) — **não precisa
editar nenhum arquivo do código**.

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   e crie um projeto (ou use um existente).
2. Configure a "Tela de consentimento OAuth" (tipo "Externo" funciona
   para a maioria dos casos).
3. Em "Credenciais" → "Criar credenciais" → "ID do cliente OAuth":
   - Tipo de aplicativo: **Aplicativo da Web**
   - Em "Origens JavaScript autorizadas", adicione a URL do seu site
     (ex: `https://seudominio.com.br` e, para testar local,
     `http://localhost:3000`)
4. Copie o Client ID gerado (termina em `.apps.googleusercontent.com`).
5. Cole no `.env` do servidor (ou nas variáveis de ambiente do Render):
   `GOOGLE_CLIENT_ID=seu-client-id-aqui`
6. Reinicie o servidor (ou refaça o deploy). O botão aparece sozinho.

Quem entrar com Google e já tiver uma conta com o mesmo e-mail cadastrada
por senha continua na mesma conta (o Google só é "linkado" a ela).

## Configurar a sincronização com a Google Agenda (opcional)

Usa o mesmo projeto do Google Cloud de cima, mas precisa de **duas coisas a
mais** além do Client ID que você já tem:

1. Volte em **Credenciais** → clique no ID do cliente OAuth que você já
   criou (o mesmo do login) → em **"URIs de redirecionamento
   autorizados"**, adicione:
   - `https://seudominio.com.br/api/calendar/callback` (produção)
   - `http://localhost:3000/api/calendar/callback` (se for testar local)

   ⚠️ Isso é diferente das "Origens JavaScript autorizadas" que você já
   preencheu pro login — sem essa URL de redirecionamento cadastrada, o
   Google recusa a conexão com erro `redirect_uri_mismatch`.

2. Na mesma tela, copie o **Client Secret** (fica visível ao lado do
   Client ID) e adicione no `.env`:
   ```
   GOOGLE_CLIENT_SECRET=seu-client-secret-aqui
   ```
   (No Render, adicione como variável de ambiente também, igual às outras.)

3. Se a tela de consentimento OAuth do seu projeto ainda estiver em modo
   **"Testando"** (comum pra projetos pessoais), adicione seu e-mail em
   **"Usuários de teste"** — senão o Google recusa a conexão.

Depois disso, é só clicar em **Conectar Google Agenda** dentro do painel
(ícone de engrenagem → seção "Google Agenda"). Um calendário novo chamado
**"Livro-Caixa — Tarefas"** é criado automaticamente na sua conta
Google — só ele é usado, seus outros compromissos não são tocados.

⚠️ **Limitação do modo "Testando":** enquanto o projeto não passar pela
verificação do Google (processo à parte, opcional), a conexão expira a
cada 7 dias e você precisa clicar em "Conectar" de novo. Pra uso pessoal
isso costuma ser tranquilo; se incomodar, me avise que vejo com você o
processo de verificação.

⚠️ **Erro "Acesso bloqueado: a solicitação desse app é inválida":** o
servidor monta a URL de retorno automaticamente a partir do protocolo da
requisição (`req.protocol`). Atrás de um proxy (Render e a maioria dos
serviços de hospedagem funcionam assim), sem `app.set('trust proxy', 1)`
configurado, o Express enxerga a conexão como HTTP mesmo em produção — a
URL enviada ao Google fica `http://...` em vez de `https://...`, não bate
com o que está cadastrado no Google Cloud Console, e o Google bloqueia.
Isso já está corrigido no `server.js`; só vira problema de novo se algum
dia migrar pra uma hospedagem com proxy configurado de um jeito diferente.

## Estrutura de páginas (front-end)

O painel agora tem uma barra lateral com 5 páginas (tudo dentro do mesmo
`script.js`, sem recarregar a página):
- **Dashboard** — métricas do período (leads, em negociação, ganho,
  conversão), gráfico de leads captados, pipeline por etapa, últimos
  leads e tarefas abertas
- **Pipeline** — o quadro kanban original (arrastar cards, colunas,
  filtro por mês, WhatsApp, etc.), agora dividido em **funis** — abas
  no topo da página, cada uma com seu próprio conjunto de colunas e
  clientes. Dá pra ter, por exemplo, um funil "Produtos" e
  outro "Serviços" totalmente separados. Contas criadas antes
  desse recurso ganham automaticamente um "Funil Principal" com as
  colunas que já existiam — nada se perde. O botão "+" no cabeçalho
  de cada coluna agora pergunta primeiro entre três opções: "Novo
  cliente", "Transferir cliente existente" (move de verdade, some de
  onde estava) ou "Copiar cliente existente" (cria uma cópia
  independente aqui, mantendo o original intacto onde já estava —
  útil pra acompanhar a mesma pessoa em mais de um funil). As duas
  últimas usam o mesmo seletor (um por um, ou "Selecionar todos"),
  disponível a qualquer momento, em qualquer coluna.
  As estatísticas incluem **Ticket médio** (o "Valor ponderado" e a
  "chance de fechar" das colunas foram retirados). Tem também
  um filtro **"🧊 Esfriando"** que mostra só os leads em aberto sem
  nenhuma atualização há mais de 7 dias
- **Leads** — todos os clientes em formato de tabela, com busca,
  filtro por etapa e um botão de **exportar** em CSV
- **Comissões** — contratos de comissão por mês, com cálculo automático
  das parcelas a partir do valor da venda. As regras de comissão são
  **editáveis** (ícone de engrenagem na própria aba): a regra "Padrão" é
  5% do valor da venda numa parcela só, e você pode criar outras por
  produto, serviço ou linha de venda
- **Tarefas** — lista de tarefas com prioridade, vencimento e lead
  relacionado
- **Relatórios** — novos leads por mês (últimos 6 meses), leads por
  qualificação, totais de ganho/perdido, e exportação em CSV. Tem um
  seletor para ver "Todos os funis" ou um específico
- **Automações** — cria regras com dois gatilhos possíveis: "quando o
  cliente entra numa coluna" (na hora) ou "quando fica X dias parado
  numa coluna" (checado a cada hora pelo servidor). A ação pode ser
  criar uma tarefa ou mover pra outra coluna
- **Fluxos** — uma versão mais forte das automações: em vez de uma
  ação só, uma **sequência de etapas no tempo**, cada uma "X dias
  depois do início" (criar tarefa ou mover de coluna). Começa quando o cliente entra na coluna
  escolhida, e o servidor confere a cada hora se já chegou a hora da
  próxima etapa de cada cliente
- **Chat Interno** — um canal de conversa único por equipe, entre quem
  faz parte dela
- **Supervisão** — visível só pra quem é supervisor(a) da equipe:
  código de convite, gerenciar membros (promover/rebaixar/remover) e
  um resumo do desempenho de cada um (leads, em negociação, ganho,
  perdido) — nunca os clientes/negociações em si, só os totais
- **Suporte** — perguntas frequentes e um link de contato por e-mail.
  Fica no rodapé da barra lateral, junto com Configurações
- **Configurações** — uma página só, em três seções na ordem Perfil →
  Integrações → Aparência. Os botões no topo rolam a tela até a seção
  correspondente. O botão de acesso fica no rodapé da barra lateral,
  separado dos outros, acima do "Sair". Inclui **foto de perfil**
  (redimensionada automaticamente pro navegador antes de enviar, com
  fallback nas iniciais do nome quando não há foto) e **"Sessões
  ativas"**, um botão que invalida todos os tokens de login já
  emitidos — útil se perdeu um aparelho ou compartilhou a senha

Também tem um **sino de notificações** no topo de todas as páginas,
com tarefas vencendo, leads novos e mensagens recebidas nas últimas
48h — calculado na hora a partir do que já está carregado, sem
nenhuma tabela nova no banco.

## WhatsApp e Instagram (retirados por enquanto)

A integração com a API do WhatsApp (Meta, YCloud, Twilio), o Instagram (captação de leads e
mensagens diretas), a aba Conversas, disparos, templates, menu de triagem, agente/IA proativa,
mensagens agendadas e a etapa "Enviar mensagem" dos fluxos foram retirados: exigiam configurar a
empresa de cada cliente na Meta. Ficou só o **botão de WhatsApp** em cada cliente (abre `wa.me`
no WhatsApp da própria pessoa).

- Os dados antigos continuam no banco (tabelas `mensagens_whatsapp` e `mensagens_agendadas`,
  campos `whatsapp_*`/`instagram_*` em `usuarios`) e no backup; nada foi apagado.
- Fluxos antigos com etapa de mensagem: a etapa é pulada e precisa ser trocada para salvar o fluxo.
- Para trazer de volta, o código está no histórico do Git (antes da versão 20261118).
- **Automações** (criar tarefa / mover coluna) ganharam item próprio no menu (antes só abriam pela aba Conversas).

## Funis, equipe, PWA e guia de uso

- **Duplicar funil** — botão "⧉" nas abas do Pipeline, ao lado de
  renomear/excluir. Copia a estrutura de colunas (nome, tipo,
  probabilidade) pra um funil novo — os clientes não são duplicados,
  só a estrutura
- **Ranking de desempenho** — em Supervisão, acima da tabela
  detalhada que já existia: lista os membros da equipe ordenados por
  valor ganho, com barra comparando cada um contra quem está na
  frente
- **Modo arquivado** — no modal do cliente, botão "📦 Arquivar" tira
  ele de vista do Pipeline e da aba Leads sem excluir nada. Na aba
  Leads, o botão "📦 Ver arquivados" alterna pra ver só os
  arquivados (com opção de desarquivar a qualquer momento)
- **PWA (instalável no celular)** — `manifest.json` + service worker
  mínimo (`public/sw.js`) + ícones em `public/icons/`. As chamadas de
  API nunca ficam em cache (sempre buscam dado atual do servidor);
  só a "casca" do app (html/css/js) é cacheada, pra abrir mais rápido
  em visitas seguintes. Pra instalar: abra o site no celular e use
  "Adicionar à tela inicial" (Android) ou "Adicionar à Tela de
  Início" (iPhone)
- **Guia rápido de uso** — `docs/guia-rapido-livro-caixa.docx`, um
  documento Word separado do README (que é técnico, pra quem mexe no
  código) — esse é voltado pra quem vai usar o painel no dia a dia:
  cadastrar cliente, mover pelo funil, WhatsApp, tarefas, proposta,
  busca rápida e importar planilha. Bom pra treinar gente nova da
  equipe

## Propostas, meta de vendas, PDF, 2FA e auditoria

- **Propostas em PDF** — no modal do cliente, botão "📄 Gerar proposta":
  informa produto/serviço, valor total, número de parcelas e validade, e baixa um
  PDF pronto (usa a biblioteca **jsPDF**, carregada via CDN)
- **Meta de vendas** — no Dashboard, defina uma meta de valor pro mês
  e acompanhe uma barra de progresso comparando com o que já foi
  vendido (soma dos clientes na(s) coluna(s) "ganho") naquele mês
- **Exportar relatório em PDF** — botão "Exportar PDF" na página
  Relatórios, mesma biblioteca jsPDF
- **Verificação em duas etapas (2FA)** — em Configurações → Login e
  segurança. Usa o padrão TOTP (compatível com Google Authenticator,
  Authy, etc.), **implementado do zero usando só o `crypto` nativo do
  Node** — nenhuma dependência nova no `package.json`. O QR code é
  desenhado no navegador via a biblioteca `qrcodejs` (CDN). Ao entrar
  numa conta com 2FA ativo, o login pede o código antes de liberar o
  token de verdade — o token intermediário dessa etapa dura só 5
  minutos e nunca dá acesso a nenhuma rota normal da API
- **Log de auditoria** — na mesma seção de Login e segurança, mostra
  os últimos 100 eventos de segurança da própria conta (login,
  desconectar todos os dispositivos, cliente excluído, membro
  removido da equipe, 2FA ativado/desativado)

## Importar/Exportar (planilha → possíveis leads)

Página própria na barra lateral, separada do "Importar leads" simples
que já existia em Configurações (aquele continua existindo, pra quando
você já sabe exatamente pra qual coluna vai cada linha). Esta é pra
quando os dados vêm crus e ainda faltam informações:

1. Suba um arquivo **.csv ou .xlsx** — lido no próprio navegador, sem
   precisar de nenhum programa
2. O sistema detecta as colunas da planilha e tenta adivinhar quais
   são nome/telefone/serviço (pelo nome da coluna) — mas você pode
   trocar qualquer uma antes de confirmar
3. Depois de importar, cada linha vira um **"possível lead"**, numa
   lista separada da aba Leads — nada é adicionado ao Pipeline ainda
4. Clique em "Completar" pra revisar/corrigir nome e telefone, definir
   valor, temperatura e a coluna de destino — só então ele vira um
   cliente de verdade na aba Leads. "Descartar" remove um possível
   lead sem promovê-lo (duplicado, contato errado, etc.)

A leitura da planilha usa a biblioteca SheetJS (versão 0.20.3, carregada do
CDN oficial `cdn.sheetjs.com` no `index.html` — as versões 0.18.x tinham uma
falha de segurança conhecida) — trata .csv e .xlsx da mesma forma no navegador.

## Busca global, histórico, etiquetas, campos e anexos

- **Busca global** — atalho **Ctrl+K** (⌘K no Mac) ou o ícone de lupa
  no topo da página, abre uma busca rápida por cliente ou tarefa
- **Histórico de atividades** — botão "🕘 Ver histórico" no modal do
  cliente, mostra uma linha do tempo com criação do cliente e
  tarefas, mais recentes primeiro. É calculado na
  hora a partir do que já existe — não é uma tabela nova no banco
- **Etiquetas** — campo livre no modal do cliente (separadas por
  vírgula), aparecem como pílulas no card do Pipeline e no modal
- **Campos personalizados** — em Configurações → Integrações, crie
  campos extras (texto, número ou data) que passam a aparecer no
  modal de todos os clientes. Excluir um campo não apaga os valores
  já preenchidos nos clientes, só para de mostrar
- **Anexos** — no modal do cliente, suba arquivos (imagem ou PDF, até
  ~3 MB cada). Ficam guardados como base64 direto no banco (tabela `anexos`) — não
  precisa de nenhum serviço de armazenamento externo, mas por isso o
  limite de tamanho é mais apertado que um serviço de arquivos de
  verdade ofereceria

## Equipes (Chat Interno e Supervisão)

**Permissões:** o gestor escolhe, em Equipe → Permissões, quais abas (Dashboard,
Leads, Automações, Comissões, Relatórios, Fluxos, Importar/Exportar, Agenda,
Controle financeiro) e funções (excluir clientes, exportar dados, editar funis e
colunas, editar regras de comissão, fechamento da venda, ver custos e margem) os
membros usam. O padrão é tudo liberado; gestores sempre têm tudo. Quem garante é o
servidor (`server/utils/permissoes.js` + `middleware/auth.js`); o site só esconde.
O dono do sistema também ajusta pelo Painel do dono → Equipes.

Diferente de tudo mais no projeto, isso não é uma funcionalidade "por
usuário" — é uma camada nova, sem mexer em nenhum dado que já existia:

- Cada pessoa continua com seu **funil totalmente separado** (colunas,
  clientes, tarefas — nada disso é compartilhado)
- Uma equipe é só um agrupamento: quem cria vira **supervisor(a)**
  automaticamente e ganha um código de convite
- Quem entra com o código vira **membro** — o funil dele continua
  100% dele, só ganha acesso ao chat interno da equipe
- Só supervisores veem a página **Supervisão**, com um resumo agregado
  (quantos leads, quanto está em negociação/ganho/perdido) de cada
  membro — nunca os clientes individuais de ninguém
- Uma pessoa só pode estar em **uma equipe por vez**. Sair da equipe
  (ou ser removido) não apaga nada do funil dela

## Página de divulgação

A página de divulgação é uma área à parte, em `/conheca` (arquivo `public/site/index.html`,
imagens em `public/site/img/`; `/site` antigo redireciona para lá). A raiz do site (`/`) é a tela
inicial do sistema, que manda para o login quem não está logado. Os botões da divulgação levam ao cadastro com teste grátis ou com o plano
escolhido; preços, dias de teste e promoção vêm de `GET /api/publico/precos`.

## Fechamento da venda (CRM → Controle financeiro)

Quem usa o financeiro no modo **Valor das vendas** (pergunta feita uma vez, no
primeiro acesso) vê a janela **Fechamento da venda** quando um cliente entra numa
coluna de ganho: valor final (ou desconto em %), à vista / parcelado / entrada +
parcelas, data do primeiro pagamento e meio de pagamento. Confirmar cria uma
**Receita por parcela** no financeiro (categoria Vendas, escopo Empresa, selo
"CRM · venda"), que a pessoa pode marcar como recebida, editar ou apagar lá.
"Agora não" deixa o selo **Falta o fechamento** no card; a ficha do cliente tem o
botão pra refazer. Os totais de ganho do CRM passam a usar o valor final.

- Código: `public/js/fechamento.js`, `server/utils/fechamento.js`, rotas
  `/api/financeiro/fechamento/...`, migração `007_fechamento_venda.sql`.
- Cartão da maquininha entra como "Conta Corrente" (no financeiro, "Cartão de
  Crédito" é o cartão da própria pessoa, para despesas).
- Uma tela do financeiro aberta antes do fechamento não apaga as receitas novas
  ao salvar (o servidor compara com a hora em que a tela carregou).
- **Custos da venda (opcional):** custo do produto e frete viram despesas pagas no
  dia da venda; a taxa do meio de pagamento e o imposto são % sobre o valor final,
  guardados uma vez ("mudar taxa?" na janela, ou na aba Lucro) e lançados na data
  da 1ª parcela. A comissão do Pipeline é recalculada pelo valor final — cada regra
  de comissão pode trocar para "valor do card" em "Calcular sobre".
- A aba **Lucro** mostra o **lucro por venda** do mês (valor final, custos +
  comissão, quanto sobrou e a margem).
- **Venda desfeita:** tirar de Ganho um cliente com fechamento pergunta se a venda
  foi desfeita; "Cancelar o que falta receber" apaga as parcelas e custos ainda não
  pagos (o recebido fica) e pode registrar a devolução ao cliente.
- **Devolução parcial:** botão "↩ Devolução" na ficha do cliente; vira uma despesa
  "Devoluções" ligada à venda.
- **Valor mudou:** se o valor do card mudar depois do fechamento, o card e a ficha
  avisam ("refazer o fechamento?"); os lançamentos não mudam sozinhos.
- **Cliente excluído:** os lançamentos ficam no financeiro, com a etiqueta
  "CRM · cliente excluído".

## Comissão automática ao fechar venda

Quando um cliente entra numa coluna do tipo **"ganho"** (fechado) — seja
arrastando no Pipeline, criando direto nela, transferindo, copiando, ou
promovendo de um possível lead — o sistema cria a comissão dele
automaticamente na aba **Comissões**, usando o valor da venda cadastrado no
cliente. Some ao "Ganho" gerado, aparece com a marcação **"⚡ Gerada pelo
Pipeline"** pra diferenciar de uma comissão criada manualmente.

Só gera **uma vez por cliente** — mover o mesmo cliente entre colunas
"ganho" diferentes, ou editá-lo depois, não duplica. Se o cliente não tiver
valor cadastrado (R$ 0), nada é gerado automaticamente; dá pra criar a
comissão manualmente depois, como sempre.

⚠️ Mover o cliente de volta pra fora da coluna "ganho" **não** apaga a
comissão já gerada — ela fica registrada normalmente, e só pode ser
removida manualmente em Comissões.

## Recursos de IA

Funcionam com **Google Gemini (plano gratuito)**, **Groq (plano gratuito)** ou
com a **API da Anthropic (Claude, pago por uso)** — o provedor é escolhido pelas
variáveis de ambiente:

- `GEMINI_API_KEY` — crie em https://aistudio.google.com/apikey. Modelo padrão
  `gemini-3.5-flash-lite`; dá pra trocar com `GEMINI_MODEL`.
- `GROQ_API_KEY` — crie em https://console.groq.com/keys. Modelo padrão
  `openai/gpt-oss-120b`; dá pra trocar com `GROQ_MODEL`.
- `ANTHROPIC_API_KEY` — gere em https://console.anthropic.com/settings/keys
  (usa o Claude Haiku).
- `IA_PROVEDOR` — só é preciso se houver mais de uma chave (`gemini`, `groq` ou
  `anthropic`); sem ele, a prioridade é Gemini, depois Groq, depois Anthropic.

Sem nenhuma das chaves, a IA fica desligada: o assistente flutuante, os
botões de sugestão e os insights somem da tela
e o resto do painel funciona normalmente. Nos planos gratuitos (Gemini e Groq) há limite
de uso; ao atingir, a IA responde "limite de uso" e volta sozinha no dia
seguinte (nada mais do painel é afetado). Todo o código de IA está em
`server/utils/ia.js`.

⚠️ Os textos enviados à IA incluem trechos de conversas e dados de clientes —
leia a política de uso de dados do provedor escolhido antes de ligar. No plano
gratuito do Gemini, o Google informa que o conteúdo enviado pode ser usado para
melhorar os produtos dele (no plano pago, não).

- **Sugerir mensagem** — no modal de editar cliente, ao lado do botão
  do WhatsApp: gera um rascunho de mensagem de retomada de contato
  personalizado, com opção de copiar ou já abrir o WhatsApp com o
  texto preenchido
- **Sugerir tarefa de acompanhamento** — no modal de editar cliente,
  perto de Observações: sugere uma tarefa com prazo, que pode ser
  criada com um clique
- **Insights da IA** — no Dashboard, um painel com botão "Gerar" que
  lista de 2 a 4 alertas curtos sobre o estado atual do funil (não
  gera sozinho, só quando você pede — pra não pesar a tela nem gastar
  chamadas de API à toa)

## Assinatura paga (Asaas)

Cobrança mensal por Pix, boleto ou cartão, com teste grátis. Tutorial completo (o que é, como
funciona, sandbox → produção) no documento "Assinatura com o Asaas".

- **Desligada por padrão:** sem `ASAAS_API_KEY` nada muda (tudo liberado). Variáveis no `server/.env.example`.
- **Planos:** Essencial (R$ 29,90: CRM + financeiro) e Completo (R$ 39,90: + IA e
  Google Agenda), iguais aos da página de divulgação. Preço muda por variável de ambiente.
- **Teste grátis:** 7 dias a partir do primeiro acesso depois de ligar a cobrança, com tudo do Completo.
- **Quem diz o que foi pago é o Asaas:** o webhook (`POST /api/assinatura/webhook`, token no
  header `asaas-access-token`) só avisa; o servidor consulta o Asaas e recalcula. Uma conferência
  de hora em hora corrige avisos perdidos.
- **Bloqueio:** sem pagamento (fora do teste e da tolerância de 3 dias), a API responde 402 e o
  site leva pra `assinatura.html`. Continuam abertos: login, assinatura e exportar os dados.
  Recursos do Completo respondem 403 no Essencial.
- **Banco:** migração `004_assinaturas.sql` (`assinaturas`: a pessoa só LÊ a própria linha, só o
  sistema grava; `assinatura_eventos`: avisos já processados, pra não repetir).
- **Arquivos:** `server/utils/asaas.js`, `server/utils/assinatura.js`, `server/routes/assinatura.js`,
  `public/assinatura.html`, `public/js/assinatura.js`, `public/css/assinatura.css`.
- **Plano anual:** R$ 300 (Essencial) e R$ 400 (Completo), cycle YEARLY no Asaas; acesso de 12 meses por cobrança paga.
- **Descontos:** pessoal (Painel do dono → Desconto) ou promoção para novos (Painel do dono), por N meses ou para sempre. Campos `desconto_*` em `assinaturas`; promoção em `configuracoes_sistema` (migração `006`). Preço contratado guardado em `valor_contratado`.
- **Valor mudou → assinatura nova:** a API do Asaas não garante mudar o valor; `recriarAssinatura` cria a nova a partir do próximo vencimento e só então apaga a antiga (desfaz se falhar). Período pago anterior fica em `pago_ate_base`. A sincronização confere se o valor da próxima fatura bate com `valorDevido` (fim de desconto) e corrige sozinha.
- **E-mails da assinatura** (`server/utils/avisosAssinatura.js`, com Resend configurado): teste acabando/acabou, fatura próxima/vencida, pagamento confirmado; uma vez cada (tabela `assinatura_avisos`), das 9h às 20h. Com eles ligados, `notificationDisabled` desliga os avisos do Asaas (`ASSINATURA_AVISOS=asaas` mantém o Asaas avisando).
- **Validação de saque (Asaas → Mecanismos de segurança):** `POST /api/assinatura/validar-saque` recusa todo saque pedido pela API (o sistema nunca saca) e alerta nos erros/Telegram. Token em `ASAAS_SAQUE_TOKEN`. A chave é usada 1x por dia (`manterChaveAtiva`) porque o Asaas desativa chaves paradas por 3 meses.
- **Liberar alguém sem cobrança:** `ASSINATURA_LIBERADOS` (e-mails) ou, no Neon,
  `SELECT set_config('app.bypass', 'on', false); UPDATE assinaturas SET status = 'cortesia' WHERE user_id = (SELECT id FROM usuarios WHERE email = 'pessoa@email.com');` (a primeira parte libera o comando por causa do RLS)

## Painel do dono

Página `dono.html` (link "Painel do dono" na tela inicial, só para donos): cadastros, quem está no
teste, quem paga e em qual plano, receita mensal estimada, conversão do teste, atrasados,
cancelamentos, lista de clientes com filtros e busca, e a saúde do sistema (servidor, banco,
cobrança/avisos do Asaas, integrações, erros recentes).

- **Donos fixos:** `DONOS_EMAILS` no Render (não podem ser removidos pelo painel).
- **Outros donos:** adicionados e removidos no próprio painel (tabela `donos`, migração `005_donos.sql`, só o sistema lê/grava). Ninguém remove a si mesmo.
- Donos nunca pagam assinatura. Rotas em `server/routes/dono.js` (`/api/dono/*`), conferência em `server/utils/donos.js`.
- O monitoramento de erros da aba Equipe continua como estava.

## Recuperação de senha por e-mail ("Esqueci minha senha")

Usa o [Resend](https://resend.com) (API HTTP, sem biblioteca extra). Sem as
variáveis abaixo o link "Esqueci minha senha" simplesmente não aparece.

- `RESEND_API_KEY` — chave da API do Resend
- `EMAIL_FROM` — remetente, ex: `Livro-Caixa <nao-responda@seudominio.com.br>`
  (o domínio precisa estar verificado no Resend)
- `APP_URL` — endereço público do painel, ex: `https://SEU-APP.onrender.com`

O link enviado vale 60 minutos e só funciona uma vez; o banco guarda apenas o
hash dele. Ao trocar a senha, todos os aparelhos são desconectados e a pessoa
recebe um aviso por e-mail. Login, código do 2FA e "esqueci minha senha" têm
limite de tentativas por IP (e por e-mail, no caso da recuperação).

Rotas: `POST /api/auth/esqueci-senha` (`{ email }`) e
`POST /api/auth/redefinir-senha` (`{ token, senhaNova }`).

## Notificações push (app fechado)

Avisam no celular/computador na hora das tarefas. Gere as chaves uma vez:

```
cd server && npx web-push generate-vapid-keys
```

e coloque no ambiente: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e
`VAPID_SUBJECT` (ex: `mailto:voce@email.com`; se faltar usa o `APP_URL`).
Cada pessoa ativa em **Configurações → Notificações → Ativar neste aparelho**.
No iPhone é preciso antes adicionar o painel à Tela de Início.

⚠️ Os lembretes de tarefa são verificados por um agendador dentro do próprio
servidor. No plano gratuito do Render o servidor "dorme" sem acessos, e aí os
lembretes não saem na hora — use um plano que não durma.

Rotas (exigem login): `GET /api/push/chave`, `POST /api/push/inscrever`,
`POST /api/push/cancelar`, `POST /api/push/testar`.

## Backup automático por e-mail

Em **Configurações → Manutenção** dá pra ativar o envio semanal de uma cópia
dos dados (JSON) para o e-mail da conta, e disparar um envio na hora. Usa as
mesmas variáveis do Resend. Arquivos até 20 MB vão anexados; acima disso
chega um aviso para baixar pelo botão Backup. **Os anexos dos clientes ficam
fora desse arquivo** (use o Backup manual se quiser incluí-los).
Rotas: `GET/PUT /api/backup/automatico` e `POST /api/backup/automatico/enviar-agora`.


## PDV (terceiro aplicativo)

Opcional, ligado só ao Controle financeiro (não ao CRM). Na primeira versão se chamava Caixa e Estoque. Primeiro acesso: um checklist
pergunta o tipo de negócio (restaurante, loja, serviços, outro), se a pessoa controla estoque
e o nome. Restaurante ganha as abas **Pedidos** e **Cardápio digital**.

| Ação | No estoque | No Controle financeiro |
| --- | --- | --- |
| Venda no balcão (ou pedido do cardápio confirmado) | baixa | Receita "Vendas" (Empresa), com o custo da mercadoria (CMV) junto; taxa do cartão como Despesa "Taxas de pagamento" |
| Compra de mercadoria | entrada + custo médio (frete rateado) | Despesa "Custo de mercadoria" (paga ou agendada no vencimento) |
| Nota de gasto | — | Despesa na categoria escolhida |
| Cancelar venda / compra | desfaz | apaga os lançamentos |

O CMV não é lançado como despesa (a mercadoria já foi despesa quando foi comprada); ele aparece
no lucro de cada venda e em Lucro → "Vendas do balcão". Os lançamentos levam
`extras.estoque = { origem, ... }` e o salvamento do financeiro não os apaga por engano.

Cardápio digital: `GET /c/:slug` (página `public/cardapio.html`), dados em
`GET /api/publico/cardapio/:slug`, pedido em `POST /api/publico/cardapio/:slug/pedido`
(preço e estoque conferidos no servidor; devolve o link `wa.me` com a mensagem pronta; 12
pedidos a cada 10 minutos por IP). Sai do ar se o dono desligar ou se a assinatura dele não
estiver ativa. Rotas do app: `/api/estoque/*` (`server/routes/estoque.js`, regras em
`server/utils/estoque.js`), migração `010_caixa_estoque.sql`. Permissão da equipe: aba
"PDV".

### Caixa do dia, fiado e operadores (versão 20261137)

- **Caixa** (primeira aba): abrir com o troco da gaveta, sangria e reforço (só mudam o dinheiro de
  lugar), despesa paga com o dinheiro do caixa, receber fiado e fechar conferindo cada forma de
  pagamento. Diferença no dinheiro vira "Quebra de caixa" (despesa) ou "Sobra de caixa" (receita)
  no Controle financeiro. Histórico em Relatórios → Fechamentos de caixa.
- **Cobrar:** teclado numérico, notas rápidas, troco calculado e pagamento dividido (uma receita
  por forma). Depois da venda: recibo impresso (80 mm) ou pelo WhatsApp.
- **Fiado:** só com cliente; fica como receita pendente e aparece em Clientes ("Deve"). Ao
  receber, vira receita paga na data do recebimento.
- **Operadores com PIN:** caixa ou gerente; com "Exigir PIN" ligado, o servidor só aceita ações
  de quem entrou (gerente cancela, mexe em produtos e configurações; caixa tem limite de desconto).
- **Celular:** barra de navegação embaixo, menu "Mais", carrinho em folha e botões grandes.

Servidor: `server/utils/caixa.js`, rotas `/api/estoque/caixa*`, `/api/estoque/operadores*`,
`/api/estoque/clientes/:id/fiado*`, migração `012_pdv_caixa.sql`.

### Excel em todo o site e relatórios do PDV (versão 20261139)

- **Planilhas:** CRM (importar leads de .xlsx/.csv, exportar em .xlsx ou CSV), Controle financeiro
  (importar extrato OFX/CSV/Excel e a própria planilha de lançamentos; exportar em Excel/PDF) e
  PDV (planilha do mês; importar e exportar produtos e clientes, com prévia antes de gravar).
- **Curva ABC e margem:** quais produtos trazem 80% do lucro, margem real de cada um, os que
  vendem abaixo do custo, sem custo cadastrado ou parados.
- **Dias e horários:** mapa de calor de faturamento por dia da semana e hora.
- **Compra pelo XML da NF-e:** a nota do fornecedor vira compra (estoque, custo médio e despesa),
  com sugestão automática dos produtos e conversão de caixa para unidade.

Servidor: `server/utils/analises.js`, `server/utils/nfe.js`, `server/utils/planilhasPdv.js`,
migração `014_pdv_nfe.sql`.

### Mesas, cozinha e planilha do Excel (versão 20261138)

- **Mesas** (restaurante): mapa do salão com mesas livres, ocupadas, pedindo a conta e com prato
  pronto. O garçom abre a mesa, lança os itens com tamanho, adicionais e observação e manda para a
  cozinha. Também há comandas sem mesa (balcão, bar).
- **Cozinha:** tela com os pedidos em Novos, Preparando e Prontos, tempo de espera, observações
  em destaque, impressão do pedido e aviso sonoro. Pedidos do cardápio digital também podem ir
  para lá. Produto marcado "não vai para a cozinha" (bebida pronta) não aparece.
- **Fechar a conta:** mesma cobrança do caixa, com taxa de serviço (padrão 10%, configurável),
  desconto e divisão por pessoas. Vira uma venda normal (estoque e financeiro).
- **Garçom:** novo tipo de operador; lança pedidos, mas não cobra nem mexe no caixa.
- **Excel:** em Relatórios, o botão baixa a planilha do mês (.xlsx) com vendas, itens, pagamentos,
  caixas, despesas, compras, estoque e clientes.

Servidor: `server/utils/comandas.js`, `server/utils/exportarXlsx.js`, rotas `/api/estoque/mesas`,
`/api/estoque/comandas*`, `/api/estoque/cozinha*`, `/api/estoque/exportar.xlsx`, migração
`013_pdv_mesas_cozinha.sql`. Dependência nova: `exceljs`.

### Clientes e programa de fidelidade

Aba **Clientes** (todos os tipos de negócio): o cliente é reconhecido pelo telefone, no balcão
e no cardápio. Ficha com compras, total gasto, o que mais pede e o extrato do cashback; filtro
de "sumidos há mais de 30 dias" com botão de WhatsApp. Em Configurações → Programa de
fidelidade o dono escolhe **um** modelo:

- **Cartão fidelidade:** a cada N compras (acima de um valor mínimo, se quiser), um prêmio em
  R$ de desconto.
- **Cashback:** X% do que o cliente pagou volta como crédito, com validade e valor mínimo para
  usar. O crédito é usado do que vence primeiro.

Só ganha quem aceitou participar. O benefício é aplicado por quem vende (o cardápio só mostra o
saldo, porque não há login). Cashback usado e prêmio entram como desconto da venda, então a
receita no financeiro já sai menor; o cashback dado não é despesa (o total "em aberto" aparece
em Clientes). Cancelar a venda devolve tudo. Regras em `server/utils/fidelidade.js`, rotas
`/api/estoque/clientes*`, consulta pública `POST /api/publico/cardapio/:slug/fidelidade` (só
valores; 20 consultas a cada 10 minutos por IP), migração `011_pdv_clientes.sql`.
