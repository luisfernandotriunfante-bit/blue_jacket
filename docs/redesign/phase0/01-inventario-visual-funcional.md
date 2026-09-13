# 01 — Inventário visual e funcional da baseline

Baseline: `a6a05a00738585cab2fdeb4596dfdad1e84d02d1`

Método: inventário estático diretamente no código da baseline. Quando um estado depende da execução, do IndexedDB/localStorage ou de dados operacionais não disponíveis neste ambiente, ele é marcado como **NÃO REPRODUZIDO**. Nenhuma captura da main atual foi usada como substituta da baseline.

## Matriz obrigatória

| Área | Aba | Componente/tela | Estado | Como chegar | Dados necessários | Ação disponível | Estado vazio | Loading | Erro | Modal/drawer | Lista/tabela | Observação visual | Observação de linguagem | Observação de navegação | Observação funcional | Captura correspondente |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Sell Out | Resumo | `SellOutPage` / `Summary` | **Observado na sessão pública**: normal, KPIs, gráfico e tabela diária | Sell Out → Resumo | M1, M2, M3, metas e competência | Exportar Excel/JSON | Não observado na sessão | Leitura de listas | Não observado na sessão | Não observado | KPIs, cards de linhas, gráfico diário e tabela | KPIs em cards; linhas comerciais visíveis | Termos operacionais preservados | Top tab `resumo` | Mesma base alimenta KPIs, gráfico e exportações | Sessão observada; não baseline |
| Sell Out | Redes | `TopRetailNetworksPage` | Normal; sem bundle; loading; erro; bloqueio competência; sem Roteiro Top | Sell Out → Redes | M2, M3, competência, metas de rede | Exportar Excel/JSON | Sem bundle; Roteiro Top ausente | `Carregando Redes` | Erro de leitura | Não observado | KPIs + tabela de redes | Tabela larga e cards | Explicita bloqueio por competência | Top tab `redes` | Não usa fallback legado; exige MATCH da competência | NÃO REPRODUZIDO |
| Sell Out | Gerencial | `SellOutPage` / `Management` | Normal + filtros + conciliação RCA | Sell Out → Gerencial | M1, M2, M3, metas RCA | Filtrar supervisor/RCA | Herdado do gate de Sell Out | Leitura de listas | Erro de listas/competência | Não observado | Tabelas por supervisor e conciliação | Grupos de supervisor | Distingue Resolvido/Pendente | Top tab `gerencial` | RCA inativo sem operação é retirado da visão operacional | NÃO REPRODUZIDO |
| PEX | estado da baseline | fallback de `main.tsx` | Em construção | PEX | Nenhum dado operacional exigido pelo fallback | Nenhuma | Painel de construção | Não | Não observado | Não | Não | Empty state de página | `PEX em construção` | Sidebar → PEX | Nenhuma funcionalidade PEX inventariada além do fallback | NÃO REPRODUZIDO |
| Estoque | Visão Geral | `EstoquePage` / `StockOverview` | Normal; sem bundle; loading; erro; vazios de treemap/alertas | Estoque → Visão Geral | M1, M3, M4, forecasts | Alternar Físico/Disponível/Projetado | Sem estoque valorizado; sem alertas | Leitura de listas | Falha de listas | Não observado | KPIs, treemap, forecast cards, alertas | Treemap por linha/sub-brand | Termos físicos, disponíveis e projetados | Top tab `overview` | KPIs e alertas derivados do `stockOverviewModel` | NÃO REPRODUZIDO |
| Estoque | Produtos | `EstoquePage` → `ProductCatalogPage` | Principal mapeado; estados internos não executados | Estoque → Produtos | M1/M3/M4 conforme catálogo | Filtros/consulta conforme componente | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | Catálogo | Rota comprovada; detalhe visual não executado | Linguagem não reavaliada em runtime | Top tab `products` | Roteamento confirmado no código | NÃO REPRODUZIDO |
| Estoque | Lançamentos | `LancamentosPage` → `ProductCatalogPage launchesOnly` | Sem bundle; erro; loading; normal | Estoque → Lançamentos | M1, M3, M4 e build ativo | Consulta de catálogo de lançamentos | `Sem bundle canônico ativo` | `Carregando lançamentos` | `Erro ao carregar lançamentos` | Não observado | Catálogo | Empty/loading explícitos | Texto não promete fallback | Top tab `launches` | Leitura passiva de listas canônicas | NÃO REPRODUZIDO |
| Estoque | Entradas e Saídas | `EntradasNotasPage` | Entradas; Saídas; filtros; expansão; saving; sem bases; loading; erro | Estoque → Entradas e Saídas | M1, M3, M4, forecasts, sync opcional | Filtrar, expandir NF, salvar previsão | Sem bases; nenhum resultado por filtro | `Carregando notas` | Falha de listas ou sync da previsão | Expansão inline de NF | Tabelas de recebimentos, devoluções, faturado/a faturar | Mini-nav Entradas/Saídas | Distingue 218/12.322/8022 | Top tab `movements` | Previsão manual integra settings e sync quando pareado | NÃO REPRODUZIDO |
| Atividades | Criação de Combo | `CriacaoComboPage` | Principal mapeado; detalhes de runtime não reproduzidos | Atividades → Criação de Combo | Conforme página | Conforme página | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | NÃO REPRODUZIDO | Rota confirmada | Sem conclusão além do código disponível | Top tab único `combo` | Tela existe na baseline | NÃO REPRODUZIDO |
| Clientes e Sortimento | Visão Geral | `ClientesSortimentoPage` | Sem build; erro; loading; normal; busca | Clientes e Sortimento → Visão Geral | M1, M2, M3 | Buscar | Sem build | `Lendo M1, M2 e M3` | Alert de erro | Não | Tabela de clientes | KPIs + tabela | Consulta por CNPJ/cliente | Top tab `overview` | Venda no build derivada de SALE | NÃO REPRODUZIDO |
| Clientes e Sortimento | Sortimento | `ClientesSortimentoPage` | Sem build; erro; loading; normal; busca; nenhum item | Clientes e Sortimento → Sortimento | M1, M2, M3 | Buscar | Nenhum item materializado/filtro sem resultado | `Lendo M1, M2 e M3` | Alert de erro | Não | Tabela de produtos | KPIs + tabela | Faixas/canais explícitos | Top tab `assortment` | `parseAssortmentPresence` define presença | NÃO REPRODUZIDO |
| Clientes e Sortimento | Lançamentos | `ClientesSortimentoPage` | Sem build; erro; loading; normal; busca; nenhum item | Clientes e Sortimento → Lançamentos | M1, M2, M3 | Buscar | Nenhum item materializado/filtro sem resultado | `Lendo M1, M2 e M3` | Alert de erro | Não | Tabela de lançamentos | Mesma estrutura de catálogo | Status LANÇAMENTO | Top tab `launches` | `is_launch === true` | NÃO REPRODUZIDO |
| Clientes e Sortimento | Promoções | `ClientesSortimentoPage` | Sem build; erro; loading; normal; busca; nenhuma promoção | Clientes e Sortimento → Promoções | M1, M2, M3 | Buscar | `Nenhuma promoção identificada no contrato v21` | `Lendo M1, M2 e M3` | Alert de erro | Não | Tabela quando houver | Mesma estrutura de catálogo | Declara que não inventa promoções | Top tab `promotions` | Só exibe marcação promocional explícita | NÃO REPRODUZIDO |
| Documentos | Documentos | `DocumentosPage` | Sem build; normal; erro; aviso de download | Documentos | M1–M4 + build ativo | Baixar JSON/CSV | `Sem build canônico ativo` | Leitura das quatro listas | Alert de erro | Não | Tabela M1–M4 | KPIs + tabela | Exportações reproduzíveis | Sidebar → Documentos | Exporta lista selecionada sem fallback | NÃO REPRODUZIDO |
| Administração | Bases | `BasesPage` | **Observado na sessão pública**: 19/19 disponíveis, 2 substituições ativas e build ativo | Administração → Bases | 19 fontes + registries/targets | Selecionar fontes, processar, certificar/reconciliar/revogar substituição | Não observado na sessão | Não observado na sessão | Não observado na sessão | Não observado | Inventário de fontes | Readiness, authority e uso no motor visíveis | Contrato 19/19 e escopos explícitos | Top tab `bases` | 15 hard-required + 4 replaceable | Sessão observada; não baseline |
| Administração | Cadastros | `CadastrosPage` | Normal com sub-tabs | Administração → Cadastros | Admin Registry | Alternar RCAs/Lançamentos/Top Varejistas; CRUD interno nos painéis | Depende dos painéis | Depende dos painéis | Depende dos painéis | Depende dos painéis | Registros por sub-tab | Tabs internas | Explicita precedência MANUAL → SOURCE_SEED → física | Top tab `cadastros` | Cadastros participam do build; detalhes internos não executados | NÃO REPRODUZIDO |
| Administração | Metas | `MetasPage` | Competência aberta editável; fechada read-only; busy; preview; warning/error/success | Administração → Metas | CompetenceState, TargetState, Admin Registry, M2 | Salvar metas gerais/RCA, seed Bússola, migração legada | Sem competência corrente gera warning | Carregamentos assíncronos internos | Erros de estado/ações | Formulários inline | Catálogo RCA e metas | Painéis administrativos | Explicita ABERTA/FECHADA e somente leitura | Top tab `metas` | TargetState é autoridade; competência fechada não aceita mutação | NÃO REPRODUZIDO |
| Administração | Competências | `CompetenciasPage` | **Observado na sessão pública**: corrente 09/2026 ABERTA e 08/2026 FECHADA r1 | Administração → Competências | CompetenceState, MonthlyClosingState, M3, fontes, targets | Criar, tornar corrente, verificar/fechar, reabrir, exportar certificado | Não observado na sessão | Não observado na sessão | Não observado na sessão | Não observado | Registry de competências + findings | Linha de competência e fechamento visíveis | Termos ABERTA/FECHADA | Top tab `competencias` | Estado observado na sessão; não materializado na baseline | Sessão observada; não baseline |
| Administração | Auditoria | `AuditoriaPage` | **Observado na sessão pública**: ATTENTION, 135 findings, filtros e exportação | Administração → Auditoria | Inputs da Auditoria Global | Atualizar, filtrar, exportar JSON, expandir finding | Não observado na sessão | Não observado na sessão | Não observado na sessão | Findings expansíveis | Findings e KPIs | Cards, filtros e detalhes visíveis | Severidades e códigos técnicos visíveis | Top tab `auditoria` | Leitura derivada não corrige automaticamente | Sessão observada; não baseline |
| Administração | Dados Canônicos | `ListasCanonicasPage` | **Observado na sessão pública**: build ativo, M1–M4 válidos e histórico 08/2026 disponível | Administração → Dados Canônicos | M1–M4, manifest, closing history | Preview, exportar Excel/JSON, abrir histórico, backfill | Não observado na sessão | Não observado na sessão | Não observado na sessão | Preview/expansões não acionadas | Cards M1–M4 + tabela histórica | Rastreabilidade forte | Linguagem distingue operacional/histórico | Top tab `canonical` | Histórico local imutável; sem fallback para corrupto | Sessão observada; não baseline |
| Administração | Sincronização | `SincronizacaoPage` | Pareado/não pareado; syncing; remote newer; erro/status; bundle import | Administração → Sincronização ou deep-link `#sync` | identidade sync, backup remoto, build ativo, fontes locais | Criar/parear, enviar, restaurar, copiar link, importar bundle | Sem backup/build conforme fluxo | `syncing`/operação global | Mensagens específicas de sync/bundle | Não observado | Status e controles | Painéis de operação | Erros traduzem códigos técnicos | Top tab `sync`; deep-link abre esta aba | Coordena backup v2, recovery e conflito remoto | NÃO REPRODUZIDO |

## Evidência de rotas e composição

- `src/navigation.ts` confirma as 7 áreas principais e as 7 abas de Administração.
- `src/main.tsx` confirma as tabs de Sell Out, Estoque, Atividades e Clientes e Sortimento, além do fallback PEX em construção.
- `src/pages/admin/AdminPage.tsx` confirma o roteamento interno de Bases, Cadastros, Metas, Competências, Auditoria, Dados Canônicos e Sincronização.

## Problemas observados na baseline

Os itens abaixo são os problemas descritos no diagnóstico visual do Plano Diretor e nos inventários técnicos já versionados. Como o gate de identidade da sessão operacional não foi aprovado no checkout `a6a05a0`, cada item mantém a indicação de que a confirmação runtime desta baseline ainda está pendente. A ausência de reprodução nesta execução não é classificada como defeito.

### VISUAL

| ID | Área | Aba | Descrição objetiva | Evidência | Impacto | Classificação |
|---|---|---|---|---|---|---|
| V-01 | Estrutura geral | Todas | Cabeçalho alto, excesso de bordas, textos pequenos e densidade elevada. | Diagnóstico do Plano Diretor, seção 3, “Estrutura geral”. | Reduz área útil e aumenta esforço de leitura. | Diagnóstico da baseline; confirmação runtime pendente. |
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
| F-01 | Estoque | Produtos/Lançamentos | Centenas de cartões são montados de uma vez; a tela pode ficar vazia durante o carregamento e precisa de paginação ou virtualização. | Diagnóstico do Plano Diretor, seção 3; inventário técnico de Estoque. | Pode degradar abertura, rolagem e consulta. | Diagnóstico da baseline; confirmação runtime pendente. |
| F-02 | Estoque | Entradas e Saídas | Milhares de elementos ficam na mesma tela; filtros e tabela precisam permanecer acessíveis e falta resumo por situação. | Diagnóstico do Plano Diretor, seção 3, “Entradas e Saídas”. | Aumenta o custo de localizar uma NF ou situação. | Diagnóstico da baseline; confirmação runtime pendente. |
| F-03 | Clientes e Sortimento | Visão Geral | Lista de 8.749 clientes e quatro números em blocos altos exigem filtros, paginação e detalhe lateral. | Diagnóstico do Plano Diretor, seção 3, “Clientes e Sortimento”. | Pode pesar a renderização e alongar a busca. | Diagnóstico da baseline; confirmação runtime pendente. |
| F-04 | Estoque | Visão Geral | Falta um caminho simples para entender a origem de cada número do estoque e dos alertas. | Diagnóstico do Plano Diretor, seção 3, “Estoque — Visão Geral”. | Reduz a capacidade de agir sobre um alerta. | Diagnóstico da baseline; confirmação runtime pendente. |

## Problemas não confirmados nesta execução

Nenhum defeito de aplicação é afirmado apenas por ausência de execução. As limitações desta própria execução não são classificadas como problemas do produto. Caso futuras reproduções encontrem problemas do produto, usar **somente** estas categorias:

- VISUAL
- LINGUAGEM
- NAVEGAÇÃO
- FUNCIONALIDADE

## Limitação de cobertura

A matriz acima prova a existência e diversos estados pelo código, e a sessão pública forneceu evidência operacional adicional para algumas telas. Isso não substitui a inspeção da baseline histórica com identidade comprovada. Capturas, dimensões reais, scroll, modais disparados por interação, dados de Redes/Estoque/Metas e desempenho permanecem NÃO REPRODUZIDOS como baseline.
