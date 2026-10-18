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

## Assistente de IA (um só para os dois apps)
- Componente compartilhado: `public/js/assistente-ia.js` + `public/css/assistente-ia.css` (bolinha arrastável no canto inferior direito). Cada app só define as cores em `#assistente-root` (variáveis `--ai-*`): CRM usa a cor de destaque; financeiro usa a cor do personagem.
- Mesmo nome (localStorage `assistente-nome`, padrão "Assistente do Livro-Caixa") e a mesma conversa (sessionStorage `assistente-conversa`), que continua ao trocar de aplicativo. Botão ↺ começa conversa nova.
- Rota `POST /api/ai/assistente` recebe `contexto` ('crm' | 'financeiro'); o system prompt descreve os dois apps e inclui o app atual e o perfil/personagem do financeiro (`contextoDaPessoa`).
- Ferramentas novas do financeiro: `resumo_financeiro`, `lancamentos_financeiros`, `cartoes_objetivos_investimentos` (contas em `server/utils/financeiroResumo.js`, espelhando a aba Lucro, incluindo vendas/comissões do CRM).
- Aba Assistente do financeiro: alertas + atalhos que mandam a pergunta para a bolinha. O antigo robô de palavras-chave saiu.

## Animação de abrir/fechar aplicativo
- `public/js/transicao-apps.js` + `public/css/transicao-apps.css`, carregados no `<head>` de `inicio.html`, `index.html` e `financeiro/index.html`.
- Abrir: na tela de escolha, o cartão vira uma "caixa" (ícone + nome) que cresce até a tela cheia e então navega; o app chega coberto da mesma cor e a caixa some aos poucos.
- Fechar: o clique em qualquer link para `inicio.html` (delegado) cobre a tela com a caixa do app; na escolha, ela encolhe até o cartão.
- Passa entre páginas pelo sessionStorage (`transicao-app`, vale 8 s). Sem animação com prefers-reduced-motion; Ctrl/Cmd+clique abre normal; trata o voltar do navegador (pageshow).

## Controle financeiro completo (versão 20261109)
- `public/financeiro/calculos.js`: regra única de lançamentos (único / fixo com `fimEm` / parcelado, `excecoes[AAAA-MM]` = { status, value, removido }), faturas por cartão (fechamento → mês de vencimento), limite usado (inclui parcelas futuras), saldo de conta, a pagar e receber, plano de quitação (avalanche / bola de neve). Usado pelo site E pelo servidor (IA e lembretes). Testes em `server/test/calculosFinanceiro.test.js`.
- Telas novas (um arquivo cada, registradas em `TELAS`): A pagar e receber + Contas e saldo (`contas.js`), Cartões (`cartoes.js`), Orçamento + Categorias (`orcamento.js`), Dívidas (`dividas.js`), Comprovantes (`comprovantes.js`), Importar extrato OFX/CSV e Livro-Caixa antigo (`importar.js`), Relatórios/gráficos/resumo anual/IR/exportar Excel-PDF (`relatorios.js`), Aparência/Lembretes/Níveis (`perfil.js`).
- Status de fixo/parcelado é por mês; mudar valor ou excluir pergunta "só este mês / daqui em diante / todos".
- Banco: migração `003_financeiro_novo.sql` — `financeiro_itens` (listas contas, transferencias, dividas, orcamentos, categorias; uma linha por item, jsonb) e `financeiro_comprovantes` (arquivo em bytea, até 3 MB, confere a assinatura do arquivo). Rotas `/api/financeiro/comprovantes`.
- Cores: config.corDestaque = 'personagem' | 'crm' | '#hex'; modo noturno compartilhado com o CRM (localStorage darkMode). Cores do JS viraram variáveis CSS (tema escuro em styles.css).
- IA: ferramenta `criar_lancamento` (lança pela bolinha); a bolinha salva o pendente antes (`antesDeEnviar`) e o financeiro recarrega depois (`depoisDeAlterar`, resposta com `dadosAlterados`).
- Lembrete diário de contas (push, 8h de Brasília): `server/utils/lembreteFinanceiro.js`; marca `config.lembreteEnviadoEm` (o servidor preserva essa chave quando o site salva a config); desliga em Meu perfil → Lembretes.
- Livro-Caixa antigo: versão com botão "Exportar meus dados" em `livro-caixa-antigo-com-exportar.zip`; no novo, Meu perfil → Importar dados.
- Login que voltava pra tela de login: erro do banco no `middleware/auth.js` virava 401 (agora 503 + "tentarDeNovo"); senha atual/código 2FA errados em rotas logadas também davam 401 (agora 400). O site repete sozinho em 502/503/504. `db/pool.js` repete a consulta só quando a conexão caiu antes de rodar e descarta conexões quebradas.

## Layout do financeiro igual ao CRM + bolinha nova (versão 20261110)
- Financeiro com a mesma estrutura do CRM: barra lateral fixa (avatar + "Olá, nome", ícones em SVG, rodapé com Trocar de aplicativo / Meu perfil / Sair), fontes Fraunces + IBM Plex, mesmos tons claro/escuro, gaveta com botão de menu abaixo de 1024px. Cor de destaque padrão = a do CRM (config.corDestaque, "personagem" continua como opção).
- Aba Assistente removida do financeiro (quem abria a aba vai pro Painel).
- Bolinha (`js/assistente-ia.js`): sininho no lugar do X do cabeçalho (fecha pela própria bolinha); alertas com contador na bolinha e no sininho (opção `alertas`), clique no alerta abre a tela certa; carrossel de perguntas acima do campo (opção `sugestoes`: `{texto, pergunta}` envia, `{texto, preencher}` só escreve no campo); ícones em SVG brancos (X, enviar). `AssistenteIA.atualizarAlertas()` só redesenha quando os alertas mudam e preserva o que está sendo digitado.
- Financeiro: alertas = `buildAlerts()` (mês atual, texto simples + `goto`); sugestões = `SUGESTOES_IA`. CRM: alertas = `computarNotificacoes()`, sugestões próprias.

## O que saiu do Livro-Caixa antigo
- Dados de exemplo (seeds): conta nova começa vazia.
- A aba "Comissões" de consórcio (fórmula da carta de crédito): as comissões agora vêm do CRM.

## Pendências
- **Plano premium removido por enquanto** (a pedido): todas as abas do financeiro liberadas, sem cadeados, sem tela de bloqueio e sem o cartão "Plano". Refazer depois como sistema de assinatura de verdade (cobrança real, ligado aos planos da página de divulgação). O campo `perfil.plan` de contas antigas fica salvo, mas não é usado.
- Trocar `SEU-APP.onrender.com` pelo endereço real (página de divulgação, README, `.env.example`, `utils/email.js`).
- E-mails de contato em `privacidade.html` e `termos.html` ainda são `SEU-EMAIL-DE-CONTATO-AQUI`.
- WhatsApp oficial exige empresa verificada na Meta; na YCloud, cadastrar o webhook novo.
