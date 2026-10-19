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
- **Fechamento da venda (versão 20261119, etapa 1 da proposta):** no modo "Valor das vendas", quando um card entra numa coluna de ganho abre a janela "Fechamento da venda" (`public/js/fechamento.js`): valor final ou desconto %, à vista / parcelado / entrada + parcelas, data, meio de pagamento, "já recebi". Confirmar cria **lançamentos de verdade** (uma Receita por parcela, categoria Vendas, escopo Empresa) com `extras.crmFechamento = { clienteId, fechamentoId, parcela, total, meio }`; o card guarda o resumo em `clientes.fechamento` (jsonb). "Agora não" marca `fechamento_pendente` e o card mostra o selo "Falta o fechamento". Card com fechamento não gera mais a linha virtual `crm-venda-…`. Refazer troca as parcelas (as já "Pago" continuam pagas). Rotas em `/api/financeiro/fechamento/…`; lógica em `server/utils/fechamento.js`; migração `007_fechamento_venda.sql`.
- O PUT `/api/financeiro/transacoes` recebe `carregadoEm` (vem no GET): não apaga receitas do CRM criadas depois que a tela abriu e não deixa voltar parcela que o fechamento já trocou.
- Primeiro acesso: o financeiro (ou a própria janela do CRM, o que vier antes) pergunta o modo uma vez (`config.integracaoCrmPerguntado`). Totais de "ganho" no CRM e no resumo da equipe usam o valor final do fechamento.
- **Custos da venda (versão 20261120, etapa 2):** a janela tem "Custos da venda (opcional)": custo do produto e frete (despesas Pagas no dia da venda), taxa do meio de pagamento e imposto em % sobre o valor final (despesas na data da 1ª parcela). Os % ficam guardados em `config.taxasVenda` (chaves credito, creditoParcelado, debito, pix, boleto, transferencia, dinheiro, outro, imposto) — mudar na janela ("mudar taxa?") ou na aba Lucro (PUT `/api/financeiro/fechamento/taxas`); o salvamento da config pelo financeiro nunca mexe nelas. Cada custo é Despesa com `extras.crmFechamento.tipo` = produto|frete|taxa|imposto. A comissão do Pipeline é recalculada no fechamento: cada regra tem `base` ('final' padrão = valor final; 'negociado' = valor do card); comissão feita à mão não muda. A comissão só aparece como custo quando "Descontar as comissões" está ligado. Aba Lucro: "Lucro por venda" (vendas fechadas no mês: valor final, custos + comissão, sobrou, margem) e "Taxas usadas no fechamento da venda". Migração `008_custos_venda.sql`.
- **Venda desfeita e devolução (versão 20261121, etapa 3):** card que sai de Ganho com fechamento abre "A venda foi desfeita?" (mostra recebido / falta receber / custos não pagos). "Cancelar o que falta receber" (POST `/api/financeiro/fechamento/:id/cancelar`) apaga as parcelas e custos ainda não pagos, mantém o recebido, e pode registrar a devolução (até o recebido menos o já devolvido); grava `fechamento.cancelado`. Voltar para Ganho pede um fechamento novo. Botão "↩ Devolução" na ficha (POST `.../devolucao`): Despesa "Devoluções" com `crmFechamento.tipo = 'devolucao'`, até o valor final menos o já devolvido; refazer o fechamento não apaga devoluções. Selo "Valor mudou · refazer fechamento?" no card e aviso na ficha quando o valor do card ≠ `fechamento.valorOriginal`. Card excluído: lançamentos ficam, com `crmFechamento.clienteExcluido` e `clienteNome` (etiqueta "CRM · cliente excluído"). Lucro por venda mostra "desfeita" e "devolvido", e a comissão conta só até o mês em que foi cortada.
- Etapa 4 (converter vendas antigas) ficou adiada: ainda não há usuários com vendas de antes do fechamento.
- **Permissões da equipe (versão 20261122):** `equipes.permissoes` (jsonb; {} = tudo liberado), catálogo em `server/utils/permissoes.js` (abas: dashboard, leads, automacoes, comissoes, relatorios, fluxos, import-export, tarefas, financeiro; funções: excluirClientes, exportarDados, editarFunis, editarRegrasComissao, fechamentoVenda, verCustos). Valem só para membros (gestor e quem não tem equipe têm tudo). O servidor aplica em `middleware/auth.js` (`regraDoCaminho` → 403 "O gestor da sua equipe não liberou: …"); o CRM esconde menu e botões (`public/js/permissoes.js`, MutationObserver). O gestor edita em Equipe → Permissões (PUT `/api/equipe/permissoes`); o dono do sistema em Painel do dono → Equipes (PUT `/api/dono/equipes/:id/permissoes`, registrado na auditoria do gestor). Migração `009_permissoes_equipe.sql`.
- **Regras de comissão pelo Painel do dono:** botão "Regras" em cada cliente (GET/POST/PUT `/api/dono/clientes/:id/regras`), com confirmação de consentimento; cada mudança vai para a auditoria do cliente ("alterada pelo suporte do Livro-Caixa (email). Antes: … Depois: …"). Termos de uso (seções 7 Equipes e 8 Suporte) e Privacidade explicam isso.
- Próximas etapas (proposta no Claude Docs "Venda do CRM no Controle financeiro — proposta"): 4) converter vendas antigas. Também decidido: permissões da equipe por aba/função (gestor e dono do sistema) e dono editar regras de comissão de um cliente (com registro e aviso nos termos).
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
- **WhatsApp API e Instagram retirados** (exigiam configurar a empresa de cada cliente na Meta): sem aba Conversas, disparos, templates, triagem, agente/IA proativa, mensagens agendadas nem etapa de mensagem nos fluxos; rotas e utils apagados (ficam no histórico do Git). Ficou só o botão `wa.me`. Automações ganharam item no menu. Dados antigos seguem no banco. Plano Completo = IA + Google Agenda.
- **Anual, descontos e e-mails da assinatura:** anual R$ 300/R$ 400 (YEARLY); desconto pessoal e promoção para novos (N meses ou para sempre) pelo Painel do dono; qualquer mudança de valor recria a assinatura no Asaas (`recriarAssinatura`, cria nova → apaga antiga, `pago_ate_base` guarda o pago); e-mails próprios (`utils/avisosAssinatura.js`) desligam os avisos do Asaas. Migração 006. Plano Equipe por usuário ainda não existe (membros liberados à mão).
- **Painel do dono** (`public/dono.html`, `/api/dono/*`): clientes por situação (teste, pagando, atrasado, cancelou, bloqueado, cortesia/dono), receita estimada, conversão do teste, saúde (servidor, banco, Asaas, integrações, erros). Donos = `DONOS_EMAILS` (fixos) + tabela `donos` (adicionados pelo painel, migração 005). Donos não pagam. Monitoramento da aba Equipe mantido.
- **Assinatura real pelo Asaas** (substitui o antigo "premium", que foi removido; `perfil.plan` antigo não é usado): planos Essencial R$ 29,90 (CRM + financeiro) e Completo R$ 39,90 (+ IA, API do WhatsApp, Google Agenda); 7 dias grátis com tudo; tolerância de 3 dias; `billingType: UNDEFINED` (a pessoa escolhe Pix/boleto/cartão na fatura do Asaas). Desligada sem `ASAAS_API_KEY`. Webhook só dispara a consulta: o servidor confere no Asaas (`sincronizar`) e recalcula por `situacaoPelasCobrancas`; conferência de hora em hora em `sincronizarPendentes`. Bloqueio no `middleware/auth.js` (402; 403 por recurso). Tela `public/assinatura.html`. Testes em `server/test/assinatura.test.js` e no integracao.test.js (Asaas falso). Detalhes no README, seção "Assinatura paga (Asaas)".
- Trocar `SEU-APP.onrender.com` pelo endereço real no README, `.env.example` e `utils/email.js` (na página de divulgação já foi trocado por livro-caixa-crm-cf.onrender.com).
- E-mail de contato em `privacidade.html` e `termos.html`: alvsistemas.1710@gmail.com.
