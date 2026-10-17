# Livro-Caixa — resumo para continuar em outro chat

> Anexe este arquivo junto com o `livro-caixa.zip` num chat novo.

## O que é
**Livro-Caixa** = dois aplicativos com um login só:
- **CRM** (`public/index.html` + `public/js/script.js`): funil, clientes, conversas, tarefas, comissões. Veio do CRM de consórcio, já generalizado para qualquer negócio.
- **Controle financeiro** (`public/financeiro/`): o antigo Livro-Caixa (que antes salvava no navegador), agora salvando na conta (MongoDB).
- Depois do login abre `public/inicio.html` (escolha do aplicativo). A raiz `/` redireciona para lá. Os dois apps têm "Trocar de aplicativo" na barra lateral.
- Back-end Node/Express/Mongoose em `server/`. Banco padrão: `livro_caixa`.
- Idioma: interface, commits e explicações em português (Brasil).
- Testes: `cd server && node --test` (151) · checagens: `bash scripts/verificar.sh` (119) · pacote: `bash scripts/gerar-pacote.sh` → `dist/livro-caixa.zip`.
- Publicação do zero: `GUIA-DE-PUBLICACAO.md` (GitHub → MongoDB Atlas → Render, com e-mail novo).

## Integração CRM → Controle financeiro
- Na aba **Lucro** do financeiro, a pessoa escolhe: **Valor das vendas** (padrão; clientes em coluna de "ganho" viram receita da Empresa no mês de venda; opção de descontar comissões do CRM como despesa), **Minhas comissões** (parcelas das comissões do CRM viram receita) ou **Não usar o CRM**.
- Nada é copiado: o financeiro lê `/api/board` e `/api/comissoes` ao abrir e mostra esses lançamentos só para leitura (selo "CRM").
- Aba Lucro: receitas (quanto veio do CRM), despesas, lucro, margem, de onde vem e para onde vai o dinheiro, últimos 6 meses.

## Back-end novo
- Modelo `Financeiro` (1 documento por usuário: transacoes, cartoes, investimentos, objetivos, perfil, config).
- Rotas `GET /api/financeiro` e `PUT /api/financeiro/:secao` (validação em `server/utils/financeiro.js`).
- Backup/restauração incluem o Controle financeiro. A importação aceita backups do CRM de consórcio antigo (converte `tipoCarta`→`tipoProduto` e `creditoValor`→`valorVenda`).

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
