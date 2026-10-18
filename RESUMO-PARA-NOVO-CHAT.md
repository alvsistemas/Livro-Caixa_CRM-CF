# Livro-Caixa — resumo para continuar em outro chat

> Anexe este arquivo junto com o `livro-caixa.zip` num chat novo.

## O que é
**Livro-Caixa** = dois aplicativos com um login só:
- **CRM** (`public/index.html` + `public/js/script.js`): funil, clientes, conversas, tarefas, comissões. Veio do CRM de consórcio, já generalizado para qualquer negócio.
- **Controle financeiro** (`public/financeiro/`): o antigo Livro-Caixa (que antes salvava no navegador), agora salvando na conta (PostgreSQL, em tabelas próprias).
- Depois do login abre `public/inicio.html` (escolha do aplicativo). A raiz `/` redireciona para lá. Os dois apps têm "Trocar de aplicativo" na barra lateral.
- Back-end Node/Express em `server/` com **PostgreSQL** (Neon em produção, variável `DATABASE_URL`). As tabelas são criadas sozinhas pelas migrações em `server/db/migracoes/` quando o servidor sobe.
- Idioma: interface, commits e explicações em português (Brasil).
- Testes: `cd server && node --test` (151 de unidade; com `TEST_DATABASE_URL` roda também os 16 de integração com banco de verdade) · checagens: `bash scripts/verificar.sh` (126) · pacote: `bash scripts/gerar-pacote.sh` → `dist/livro-caixa.zip`.
- Publicação do zero: `GUIA-DE-PUBLICACAO.md` (GitHub → Neon → Render, com e-mail novo). Repositório: alvsistemas/Livro-Caixa_CRM-CF.

## Integração CRM → Controle financeiro
- Na aba **Lucro** do financeiro, a pessoa escolhe: **Valor das vendas** (padrão; clientes em coluna de "ganho" viram receita da Empresa no mês de venda; opção de descontar comissões do CRM como despesa), **Minhas comissões** (parcelas das comissões do CRM viram receita) ou **Não usar o CRM**.
- Nada é copiado: o financeiro lê `/api/board` e `/api/comissoes` ao abrir e mostra esses lançamentos só para leitura (selo "CRM").
- Aba Lucro: receitas (quanto veio do CRM), despesas, lucro, margem, de onde vem e para onde vai o dinheiro, últimos 6 meses.

## Banco de dados (PostgreSQL)
- Migrou do MongoDB para PostgreSQL. Camada `server/db/` (pool, contexto, modelo, ids, migrar); os modelos em `server/models/` mantêm a mesma API de antes (find, findOneAndUpdate, save, populate...).
- Dinheiro em `numeric(14,2)`, IDs em UUID, chaves estrangeiras e índices.
- **Row-Level Security**: em requisição logada, toda consulta roda com `app.user_id` e papel `livro_app` (sem BYPASSRLS); o banco só mostra as linhas do dono. Trechos de equipe que leem dados de outra pessoa usam `comoSistema` depois de conferir a permissão.
- No SQL Editor do Neon, rode `SET app.bypass = 'on';` antes de consultar (senão não aparece nada).
- Importação de backup aceita os arquivos antigos do MongoDB (IDs de 24 caracteres viram UUID).
- Campo com valor padrão é NOT NULL no banco: se a rota mandar null (ex.: texto vazio), a camada grava o padrão (`nuloViraPadrao` em `db/modelo.js`). Sem isso, criar tarefa pelo site dava erro 500.
- Modal do dia na Agenda: seção fixa **Tarefas do dia** (sem horário) no topo, com adicionar rápido; os horários vêm abaixo como detalhe.
- Correção no caminho: trocar a coluna pela ficha do cliente para "ganho" agora gera a comissão (antes só arrastando).

## Back-end novo
- Controle financeiro em tabelas: `financeiro_lancamentos`, `financeiro_cartoes`, `financeiro_investimentos`, `financeiro_objetivos`, `financeiro_perfis`.
- Rotas `GET /api/financeiro` e `PUT /api/financeiro/:secao` (validação em `server/utils/financeiro.js`).
- Backup/restauração incluem o Controle financeiro. A importação aceita backups do CRM de consórcio antigo (converte `tipoCarta`→`tipoProduto` e `creditoValor`→`valorVenda`).

## Personagens do Controle financeiro
- 1º acesso: questionário de 6 perguntas (`QUIZ` em `public/financeiro/script.js`); cada resposta soma pontos para um dos 4 perfis (organizadora, recomeco, consumista, investidora); a última pergunta escolhe feminino/masculino; empate decide pelo "objetivo principal".
- O resultado escolhe um dos 8 modelos de `CHARACTERS`, mostrado só pela palavra (`title`: "O Organizado", "A Investidora"...). A pessoa dá um nome ao personagem (digitado ou de `NOMES_PRONTOS`), salvo em `perfil.characterName`; respostas em `perfil.quiz`.
- Meu perfil: "Trocar personagem" (modelos → nome) e "Refazer as perguntas". Perfis antigos sem `characterName` usam o nome original do modelo.

## O que saiu do Livro-Caixa antigo
- Dados de exemplo (seeds): conta nova começa vazia.
- A aba "Comissões" de consórcio (fórmula da carta de crédito): as comissões agora vêm do CRM.

## Pendências
- **Premium do financeiro ainda é simulado** (a própria pessoa ativa em "Meu perfil"); falta cobrança real e ligar com os planos da página de divulgação.
- Dados do Livro-Caixa antigo (salvos no navegador) não são importados automaticamente.
- Trocar `SEU-APP.onrender.com` pelo endereço real (página de divulgação, README, `.env.example`, `utils/email.js`).
- E-mails de contato em `privacidade.html` e `termos.html` ainda são `SEU-EMAIL-DE-CONTATO-AQUI`.
- WhatsApp oficial exige empresa verificada na Meta; na YCloud, cadastrar o webhook novo.
- Login às vezes volta para a tela de login (antigo, não diagnosticado).
