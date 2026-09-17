# 01 — Inventário visual e funcional da baseline

Baseline: `a6a05a00738585cab2fdeb4596dfdad1e84d02d1`

Método: inventário estático confrontado com a execução da baseline histórica restaurada pelo fluxo oficial de sincronização. **OBSERVADO NA BASELINE** identifica somente telas efetivamente abertas nessa sessão. Estados não acionados continuam comprovados pelo código ou marcados como não reproduzidos; nenhuma mutação destrutiva foi executada.

## Matriz obrigatória

| Área | Aba | Componente/tela | Estado | Como chegar | Dados necessários | Ação disponível | Estado vazio | Loading | Erro | Modal/drawer | Lista/tabela | Observação visual | Observação de linguagem | Observação de navegação | Observação funcional | Captura correspondente |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Sell Out | Resumo | `SellOutPage` / `Summary` | Normal, KPIs, gráfico e tabela diária | Sell Out → Resumo | M1, M2, M3, metas e competência | Exportar Excel/JSON | Não acionado | Leitura de listas | Não acionado | Não acionado | KPIs, cards de linhas, gráfico diário e tabela | KPIs em cards; linhas comerciais visíveis | Termos operacionais preservados | Top tab `resumo` | Mesma base alimenta KPIs, gráfico e exportações | **OBSERVADO NA BASELINE** |
| Sell Out | Redes | `TopRetailNetworksPage` | Normal; sem bundle; loading; erro; bloqueio competência; sem Roteiro Top | Sell Out → Redes | M2, M3, competência, metas de rede | Exportar Excel/JSON | Sem bundle; Roteiro Top ausente | `Carregando Redes` | Erro de leitura | Não observado | KPIs + tabela de redes | Tabela larga e cards | Explicita bloqueio por competência | Top tab `redes` | Não usa fallback legado; exige MATCH da competência | NÃO REPRODUZIDO |
| Sell Out | Gerencial | `SellOutPage` / `Management` | Normal + filtros + conciliação RCA | Sell Out → Gerencial | M1, M2, M3, metas RCA | Filtrar supervisor/RCA | Herdado do gate de Sell Out | Leitura de listas | Erro de listas/competência | Não acionado | Tabelas por supervisor e conciliação | Grupos de supervisor | Distingue Resolvido/Pendente | Top tab `gerencial` | RCA inativo sem operação é retirado da visão operacional | **OBSERVADO NA BASELINE** |
| PEX | estado da baseline | fallback de `main.tsx` | Em construção | PEX | Nenhum dado operacional exigido pelo fallback | Nenhuma | Painel de construção | Não | Não observado | Não | Não | Empty state de página | `PEX em construção` | Sidebar → PEX | Nenhuma funcionalidade PEX inventariada além do fallback | NÃO REPRODUZIDO |
| Estoque | Visão Geral | `EstoquePage` / `StockOverview` | Normal; sem bundle; loading; erro; vazios de treemap/alertas | Estoque → Visão Geral | M1, M3, M4, forecasts | Alternar Físico/Disponível/Projetado | Sem estoque valorizado; sem alertas | Leitura de listas | Falha de listas | Não acionado | KPIs, treemap, forecast cards, alertas | Treemap por linha/sub-brand | Termos físicos, disponíveis e projetados | Top tab `overview` | KPIs e alertas derivados do `stockOverviewModel` | **OBSERVADO NA BASELINE** |
| Estoque | Produtos | `EstoquePage` → `ProductCatalogPage` | Catálogo normal com filtros e consulta | Estoque → Produtos | M1/M3/M4 conforme catálogo | Filtros/consulta conforme componente | Não acionado | Medido na abertura | Não acionado | Não acionado | Catálogo | Grade extensa de produtos | Linguagem reavaliada em runtime | Top tab `products` | Roteamento e carga confirmados | **OBSERVADO NA BASELINE** |
| Estoque | Lançamentos | `LancamentosPage` → `ProductCatalogPage launchesOnly` | Sem bundle; erro; loading; normal | Estoque → Lançamentos | M1, M3, M4 e build ativo | Consulta de catálogo de lançamentos | `Sem bundle canônico ativo` | `Carregando lançamentos` | `Erro ao carregar lançamentos` | Não observado | Catálogo | Empty/loading explícitos | Texto não promete fallback | Top tab `launches` | Leitura passiva de listas canônicas | NÃO REPRODUZIDO |
| Estoque | Entradas e Saídas | `EntradasNotasPage` | Entradas; Saídas; filtros; expansão; saving; sem bases; loading; erro | Estoque → Entradas e Saídas | M1, M3, M4, forecasts, sync opcional | Filtrar, expandir documento, salvar previsão | Sem bases; nenhum resultado por filtro | `Carregando notas` | Falha de listas ou sync da previsão | Expansão inline | Tabelas de recebimentos, devoluções, faturado/a faturar | Mini-nav Entradas/Saídas | Distingue as origens operacionais | Top tab `movements` | Previsão manual integra settings e sync quando pareado | **OBSERVADO NA BASELINE** |
| Atividades | Criação de Combo | `CriacaoComboPage` | Principal mapeado; detalhes de runtime não reproduzidos | Atividades → Criação de Combo | Conforme página | Conforme página | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | Rota confirmada | Sem conclusão além do código disponível | Top tab único `combo` | Tela existe na baseline | NÃO REPRODUZIDO |
| Clientes e Sortimento | Visão Geral | `ClientesSortimentoPage` | Sem build; erro; loading; normal; busca | Clientes e Sortimento → Visão Geral | M1, M2, M3 | Buscar | Sem build | `Lendo M1, M2 e M3` | Alert de erro | Não | Tabela de clientes | KPIs + tabela | Consulta por identificador fiscal ou cliente | Top tab `overview` | Venda no build derivada de SALE | **OBSERVADO NA BASELINE** |
| Clientes e Sortimento | Sortimento | `ClientesSortimentoPage` | Sem build; erro; loading; normal; busca; nenhum item | Clientes e Sortimento → Sortimento | M1, M2, M3 | Buscar | Nenhum item materializado/filtro sem resultado | `Lendo M1, M2 e M3` | Alert de erro | Não | Tabela de produtos | KPIs + tabela | Faixas/canais explícitos | Top tab `assortment` | `parseAssortmentPresence` define presença | NÃO REPRODUZIDO |
| Clientes e Sortimento | Lançamentos | `ClientesSortimentoPage` | Sem build; erro; loading; normal; busca; nenhum item | Clientes e Sortimento → Lançamentos | M1, M2, M3 | Buscar | Nenhum item materializado/filtro sem resultado | `Lendo M1, M2 e M3` | Alert de erro | Não | Tabela de lançamentos | Mesma estrutura de catálogo | Status LANÇAMENTO | Top tab `launches` | `is_launch === true` | NÃO REPRODUZIDO |
| Clientes e Sortimento | Promoções | `ClientesSortimentoPage` | Sem build; erro; loading; normal; busca; nenhuma promoção | Clientes e Sortimento → Promoções | M1, M2, M3 | Buscar | `Nenhuma promoção identificada no contrato v21` | `Lendo M1, M2 e M3` | Alert de erro | Não | Tabela quando houver | Mesma estrutura de catálogo | Declara que não inventa promoções | Top tab `promotions` | Só exibe marcação promocional explícita | NÃO REPRODUZIDO |
| Documentos | Documentos | `DocumentosPage` | Sem build; normal; erro; aviso de download | Documentos | M1–M4 + build ativo | Baixar JSON/CSV | `Sem build canônico ativo` | Leitura das quatro listas | Alert de erro | Não | Tabela M1–M4 | KPIs + tabela | Exportações reproduzíveis | Sidebar → Documentos | Exporta lista selecionada sem fallback | NÃO REPRODUZIDO |
| Administração | Bases | `BasesPage` | Fontes disponíveis, substituições certificadas e build ativo | Administração → Bases | Fontes + registries/targets | Selecionar fontes, processar, certificar/reconciliar/revogar substituição | Não acionado | Não acionado | Não acionado | Não acionado | Inventário de fontes | Readiness, authority e uso no motor visíveis | Contrato de fontes e escopos explícitos | Top tab `bases` | Autoridade e substituições confirmadas | **OBSERVADO NA BASELINE** |
| Administração | Cadastros | `CadastrosPage` | Normal com sub-tabs | Administração → Cadastros | Admin Registry | Alternar RCAs/Lançamentos/Top Varejistas; CRUD interno nos painéis | Depende dos painéis | Depende dos painéis | Depende dos painéis | Depende dos painéis | Registros por sub-tab | Tabs internas | Explicita precedência MANUAL → SOURCE_SEED → física | Top tab `cadastros` | Cadastros participam do build; detalhes internos não executados | NÃO REPRODUZIDO |
| Administração | Metas | `MetasPage` | Competência aberta editável; fechada read-only; busy; preview; warning/error/success | Administração → Metas | CompetenceState, TargetState, Admin Registry, M2 | Salvar metas gerais/RCA, seed Bússola, migração legada | Sem competência corrente gera warning | Carregamentos assíncronos internos | Erros de estado/ações | Formulários inline | Catálogo RCA e metas | Painéis administrativos | Explicita ABERTA/FECHADA e somente leitura | Top tab `metas` | TargetState é autoridade; competência fechada não aceita mutação | **OBSERVADO NA BASELINE** |
| Administração | Competências | `CompetenciasPage` | Competência corrente aberta e anterior fechada | Administração → Competências | CompetenceState, MonthlyClosingState, M3, fontes, targets | Criar, tornar corrente, verificar/fechar, reabrir, exportar certificado | Não acionado | Não acionado | Não acionado | Não acionado | Registry de competências + findings | Linha de competência e fechamento visíveis | Termos ABERTA/FECHADA | Top tab `competencias` | Estados mensal e histórico materializados | **OBSERVADO NA BASELINE** |
| Administração | Auditoria | `AuditoriaPage` | Estado de atenção, findings, filtros e exportação | Administração → Auditoria | Inputs da Auditoria Global | Atualizar, filtrar, exportar JSON, expandir finding | Não acionado | Não acionado | Não acionado | Findings expansíveis | Findings e KPIs | Cards, filtros e detalhes visíveis | Severidades e códigos técnicos visíveis | Top tab `auditoria` | Leitura derivada não corrige automaticamente | **OBSERVADO NA BASELINE** |
| Administração | Dados Canônicos | `ListasCanonicasPage` | Build ativo, M1–M4 válidos e histórico mensal disponível | Administração → Dados Canônicos | M1–M4, manifest, closing history | Preview, exportar Excel/JSON, abrir histórico, backfill | Não acionado | Não acionado | Não acionado | Preview/expansões não acionadas | Cards M1–M4 + tabela histórica | Rastreabilidade forte | Linguagem distingue operacional/histórico | Top tab `canonical` | Histórico local imutável; sem fallback para corrupto | **OBSERVADO NA BASELINE** |
| Administração | Sincronização | `SincronizacaoPage` | Pareado; backup completo; revisão remota; restauração oficial; bundle import | Administração → Sincronização ou deep-link `#sync` | identidade sync, backup remoto, build ativo, fontes locais | Criar/parear, enviar, restaurar, copiar link, importar bundle | Sem backup/build conforme fluxo | `syncing`/operação global | Mensagens específicas de sync/bundle | Não acionado | Status e controles | Painéis de operação | Erros traduzem códigos técnicos | Top tab `sync`; deep-link abre esta aba | Coordena backup v2, recovery e conflito remoto | **OBSERVADO NA BASELINE** |

## Evidência de rotas e composição

- `src/navigation.ts` confirma as 7 áreas principais e as 7 abas de Administração.
- `src/main.tsx` confirma as tabs de Sell Out, Estoque, Atividades e Clientes e Sortimento, além do fallback PEX em construção.
- `src/pages/admin/AdminPage.tsx` confirma o roteamento interno de Bases, Cadastros, Metas, Competências, Auditoria, Dados Canônicos e Sincronização.

## Problemas observados na baseline

Os itens abaixo combinam o diagnóstico visual do Plano Diretor, os inventários técnicos e a execução da baseline restaurada. A classificação registra a origem da evidência; estados não acionados não são apresentados como defeitos observados.

### VISUAL

| ID | Área | Aba | Descrição objetiva | Evidência | Impacto | Classificação |
|---|---|---|---|---|---|---|
| V-01 | Estrutura geral | Todas | Cabeçalho alto, excesso de bordas, textos pequenos e densidade elevada. | Diagnóstico do Plano Diretor e execução restaurada. | Reduz área útil e aumenta esforço de leitura. | **OBSERVADO NA BASELINE** nas telas inspecionadas. |
| V-02 | Estoque | Visão Geral | Treemap usa cores concorrentes e alertas/explicações disputam espaço com os KPIs. | Diagnóstico do Plano Diretor, seção 3, “Estoque — Visão Geral”. | Dificulta localizar o risco operacional principal. | Diagnóstico da baseline; confirmação runtime pendente. |
| V-03 | Estoque | Produtos/Lançamentos | Cartões repetitivos, tipografia pequena e informação horizontal densa. | Diagnóstico do Plano Diretor, seção 3, “Estoque — Produtos” e “Lançamentos”. | Torna a consulta de muitos itens cansativa. | Diagnóstico da baseline; confirmação runtime pendente. |

### LINGUAGEM

| ID | Área | Aba | Descrição objetiva | Evidência | Impacto | Classificação |
|---|---|---|---|---|---|---|
| L-01 | Sell Out | Resumo/Gerencial | Aviso técnico domina a tela e códigos internos aparecem para o usuário. | Diagnóstico do Plano Diretor, seção 3, “Sell Out — Resumo” e “Gerencial”. | O usuário vê implementação antes de impacto e ação. | Diagnóstico da baseline; confirmação runtime pendente. |
| L-02 | Documentos | Documentos | M1–M4, JSON, engine e build aparecem como informação principal. | Diagnóstico do Plano Diretor, seção 3, “Documentos”. | Dificulta escolher o documento pelo objetivo operacional. | Diagnóstico da baseline; confirmação runtime pendente. |
| L-03 | Administração | Auditoria/Sincronização | Findings, PASS, WARNING, engine, protocolo, bytes e AES-GCM aparecem na superfície comum. | Diagnóstico do Plano Diretor, seção 3, “Auditoria” e “Sincronização”. | Aumenta a carga técnica antes da explicação de negócio. | Diagnóstico da baseline; confirmação runtime pendente. |

### NAVEGAÇÃO

| ID | Área | Aba | Descrição objetiva | Evidência | Impacto | Classificação |
|---|---|---|---|---|---|---|
| N-01 | Atividades | Criação de Combo | Seleção de produtos, clientes e desconto ficam reunidos em uma página longa, sem processo guiado. | Diagnóstico do Plano Diretor, seção 3, “Atividades — Criação de Combo”. | Dificulta saber a sequência e o estado da criação. | Diagnóstico da baseline; confirmação runtime pendente. |
| N-02 | Administração | Competências | Abertura, fechamento e histórico precisam de uma linha do tempo simples com consequências explícitas. | Diagnóstico do Plano Diretor, seção 3, “Administração — Competências”. | Aumenta o risco de executar a ação mensal errada. | Diagnóstico da baseline; confirmação runtime pendente. |
| N-03 | Administração | Dados Canônicos/Sincronização | Superfícies técnicas disputam espaço com a navegação operacional comum. | Diagnóstico do Plano Diretor, seção 3, “Dados Canônicos” e “Sincronização”. | Mistura investigação técnica com tarefas do dia a dia. | Diagnóstico da baseline; confirmação runtime pendente. |

### FUNCIONALIDADE

| ID | Área | Aba | Descrição objetiva | Evidência | Impacto | Classificação |
|---|---|---|---|---|---|---|
| F-01 | Estoque | Produtos/Lançamentos | Centenas de cartões são montados de uma vez; a tela pode ficar vazia durante o carregamento e precisa de paginação ou virtualização. | Diagnóstico do Plano Diretor, inventário técnico e medição restaurada de Produtos. | Pode degradar abertura, rolagem e consulta. | **OBSERVADO NA BASELINE** em Produtos; Lançamentos comprovado por código. |
| F-02 | Estoque | Entradas e Saídas | Milhares de elementos ficam na mesma tela; filtros e tabela precisam permanecer acessíveis e falta resumo por situação. | Diagnóstico do Plano Diretor e medição restaurada. | Aumenta o custo de localizar um documento ou situação. | **OBSERVADO NA BASELINE**. |
| F-03 | Clientes e Sortimento | Visão Geral | Lista extensa e números em blocos altos exigem filtros, paginação e detalhe lateral. | Diagnóstico do Plano Diretor e medição restaurada. | Pode pesar a renderização e alongar a busca. | **OBSERVADO NA BASELINE**. |
| F-04 | Estoque | Visão Geral | Falta um caminho simples para entender a origem de cada número do estoque e dos alertas. | Diagnóstico do Plano Diretor, seção 3, “Estoque — Visão Geral”. | Reduz a capacidade de agir sobre um alerta. | Diagnóstico da baseline; confirmação runtime pendente. |

## Problemas não confirmados nesta execução

Nenhum defeito de aplicação é afirmado apenas por ausência de execução. As limitações desta própria execução não são classificadas como problemas do produto. Caso futuras reproduções encontrem problemas do produto, usar **somente** estas categorias:

- VISUAL
- LINGUAGEM
- NAVEGAÇÃO
- FUNCIONALIDADE

## Limitação de cobertura

A matriz reconcilia as 21 visões com código e runtime da baseline histórica de identidade comprovada. Doze visões foram abertas na baseline; nove permanecem comprovadas por código, sem inspeção visual individual. Estados destrutivos, erros forçados, modais e detalhes que exigiriam mutação não foram acionados. A cobertura de capturas continua pendente, e as medições de Administração → Bases e Administração → Auditoria ainda não têm três execuções válidas.
