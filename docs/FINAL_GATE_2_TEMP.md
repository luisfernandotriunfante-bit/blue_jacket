# Gate 2
TYPECHECK=0
TESTS=1
BUILD=0

## Testes

> blue-jacket@0.1.0 test:run
> node --test --experimental-strip-types --import ./tests/register-loader.mjs tests/*.test.ts

✔ checkpoint: configuração manual continua isolada por competência (3.138301ms)
✖ checkpoint: Meta T&C continua separada da Meta Indústria na camada canônica atual (6.229343ms)
✔ checkpoint: exportação de Redes usa o contrato canônico atual sem 319 ou 12.326 (1.377744ms)
✔ checkpoint: auditoria oficial é a reconciliação canônica em três níveis (2.387057ms)
✔ checkpoint: CI mantém ordem typecheck → testes → build antes da publicação (0.377765ms)

node:internal/modules/run_main:107
    triggerUncaughtException(
    ^
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/runner/work/blue_jacket/blue_jacket/src/services/receiptReconciliation.ts' imported from /home/runner/work/blue_jacket/blue_jacket/tests/audit-p0-receipt-pipeline.test.ts
    at finalizeResolution (node:internal/modules/esm/resolve:271:11)
    at moduleResolve (node:internal/modules/esm/resolve:865:10)
    at defaultResolve (node:internal/modules/esm/resolve:992:11)
    at nextResolve (node:internal/modules/esm/hooks:785:28)
    at resolve (file:///home/runner/work/blue_jacket/blue_jacket/tests/ts-loader.mjs:2:20)
    at nextResolve (node:internal/modules/esm/hooks:785:28)
    at AsyncLoaderHooksOnLoaderHookWorker.resolve (node:internal/modules/esm/hooks:269:30)
    at MessagePort.handleMessage (node:internal/modules/esm/worker:251:24)
    at [nodejs.internal.kHybridDispatch] (node:internal/event_target:856:20)
    at MessagePort.<anonymous> (node:internal/per_context/messageport:23:28) {
  code: 'ERR_MODULE_NOT_FOUND',
  url: 'file:///home/runner/work/blue_jacket/blue_jacket/src/services/receiptReconciliation.ts'
}

Node.js v24.19.0
✖ tests/audit-p0-receipt-pipeline.test.ts (255.466241ms)
✔ Configurações usa checks canônicos da reconciliação (1.274343ms)
✔ painel exibe nível, esperado, calculado, diferença e status (0.321973ms)
✔ workbook de Redes nasce apenas do estado canônico e exclui SEM REDE da planilha comercial (4.178841ms)
✔ workbook de Redes preserva loja Top e linhagem da fonte sem abas 319/12.326 (0.779385ms)
✔ escrita auxiliar não apaga outras chaves para contornar quota (1.234203ms)
✔ DataContext persiste a base canônica somente no IndexedDB (0.806004ms)
✔ hidratação rejeita snapshot anterior à UnifiedDataLayer em vez de reaplicar overlays (0.351576ms)
✔ normaliza CNPJ digitado ou vindo do Excel sem perder zeros à esquerda (1.366428ms)
✔ extrai lista única de CNPJs de TXT, CSV ou planilha (1.071675ms)
✔ vínculo automático usa clientCode do 8022 e preserva conflitos para resolução manual (11.634685ms)
✔ Excel do combo possui exatamente as abas Produtos e Clientes com as colunas solicitadas (2.153615ms)
✔ exportacao pode omitir clientes e colunas opcionais (3.667919ms)
✔ cada coluna opcional pode ser marcada de forma independente (1.038486ms)
✔ cliente sem código Winthor não bloqueia a exportação do combo (1.27954ms)
✔ codigo digitado manualmente aceita Winthor, EAN ou codigo de fabrica (1.378676ms)
✔ codigo manual inexistente nao encontra produto (0.33367ms)
✔ preço praticado aceita formato brasileiro e valor zero (1.338877ms)
✔ desconto compara preço praticado com preço de tabela (0.236247ms)
✔ combo aceita EAN, código Winthor ou fábrica e exige preço válido do 105 (1.344646ms)
✔ criação de combo exclui produto diretamente na própria linha da tabela (1.108129ms)
✔ código importado não encontrado fica na mesma tabela e também pode ser excluído (0.207034ms)
✔ filtro de entrada não cria uma segunda lista visual de códigos (0.200474ms)
✔ competência é derivada do início do período e rejeita mês inválido (1.34754ms)
✔ agosto e setembro mantêm configurações independentes (0.972639ms)
✔ competência sem configuração não herda silenciosamente o mês anterior (1.028421ms)
✔ configuração global antiga só migra quando a competência conhecida autoriza (2.608212ms)
✔ feriados removidos permanecem removidos dentro da competência (0.332468ms)
✔ configurações lista explicitamente todas as novas fontes operacionais (1.176809ms)
✔ configurações separa fontes por frequência de atualização (0.220133ms)
✔ cada fonte pode selecionar arquivo diretamente da própria linha (0.305078ms)
✔ Carteira canônica soma Order Qty + Bill Qty e converte exclusivamente pelo Un/CX industrial (2.923936ms)
✔ Carteira sem Un/CX industrial preserva caixas e não inventa unidades (0.554234ms)
✔ 218 reduz somente o pipeline correspondente e materializa recebimento parcial no Motor de Vendas (0.794948ms)
✔ Lançamento é redefinido exclusivamente pela lista oficial por EAN (1.883707ms)
✔ positivação atual conta CNPJs distintos válidos e Sell Out soma faturado + a faturar (0.471964ms)
✔ Bússola preserva meta sem RCA resolvido e mapeia somente pelo código legado (2.317135ms)
✔ 310 TXT real é reconhecido pelo conteúdo, recompõe CNPJ e mantém Produto como código legado (5.922942ms)
✔ 310 TXT mantém Valor Compras como líquido e V.Devoluções apenas para reconciliação (1.47685ms)
✔ 310 TXT não transforma identificador de 11 dígitos em CNPJ positivável (0.419156ms)
✔ fontes globais conhecidas deixam de aparecer como UNKNOWN (0.314342ms)
✔ um único upload aceita vários documentos e processa cada arquivo independentemente (8.600647ms)
✔ erro em um arquivo não bloqueia os documentos seguintes do mesmo lote (0.66678ms)
✔ 322 complementa somente correspondência e não altera recomendação oficial (2.896506ms)
✔ falha de um documento não deixa o botão preso nem impede o restante do lote de ser processado (4.397372ms)
✔ Exportação PDVs respeita TIPO e nunca transforma CPF/código inválido em cliente CNPJ (2.408468ms)
✔ venda detalhada no 8022 confirma adoção mesmo antes de aparecer no 310 consolidado (7.752421ms)
✔ SKU antigo em migração não duplica o denominador com o SKU sucessor vigente (1.391495ms)
✔ arquivo apenas de Julho não é promovido silenciosamente para Agosto/Setembro (1.8101ms)
✔ categoria OURO do Roteiro permanece categoria e não vira faixa (4.030132ms)
✔ valor 5 continua recomendado pela regra de negócio mesmo quando controle declarado da fonte o exclui (6.791258ms)
✔ 310 primeiro e perfil depois mantém compras e segmentação (59.929256ms)
✔ perfil exige CNPJ de 14 dígitos canônicos (3.403891ms)
✔ Exportação PDVs é fonte de perfil mesmo sem 310 (2.161506ms)
✔ Exportação PDVs isolada fornece Ambiente, Perfil, Faixa, Rede e canal por CNPJ (3.770192ms)
✔ Premissas não deixa código de cliente curto como 11846 virar CNPJ selecionável (0.618469ms)
✔ Roteiro rejeita identificador curto e mantém OURO apenas como categoria (0.842979ms)
✔ nomes reais variantes de Julho e Agosto/Setembro são reconhecidos sem inventar competência (0.716263ms)
✔ 310 TXT atualiza compras sem apagar a segmentação e mantém Valor Compras como líquido (34.99931ms)
✔ perfil + 310 + sortimento oficial de agosto produzem ficha usando Valor Compras líquido (30.50302ms)
✔ Configurações expõe as fontes necessárias de Clientes & Sortimento na ingestão global (2.474075ms)
✔ arquivos auxiliares reais do módulo são reconhecidos pelo papel correto em vez de UNKNOWN (1.274493ms)
✔ excluir 310 não apaga segmentação carregada por CUSTOMER_PROFILE (1.577499ms)
✔ função de migração remove somente a fonte UNKNOWN solicitada (1.669955ms)
✔ função de migração da base 310 não toca no Sortimento Oficial (0.984867ms)
✔ função de migração do Sortimento Oficial limpa somente sortimento e linhagem (0.335273ms)
✔ fonte inexistente não altera o estado (0.160526ms)
✔ UI ativa não permite exclusão ou persistência paralela de fontes (0.545162ms)
✔ Clientes & Sortimento não possui upload próprio e as fontes entram por Configurações (0.909106ms)
✔ Premissas aceita CNPJ declarado com zero inicial perdido e rejeita código curto (4.859304ms)
✔ mapeamento de faixa é regra de domínio e cobre as seis faixas conhecidas (1.382682ms)
✔ sortimento oficial é versionado por competência e preserva controles da fonte (9.963086ms)
✔ 310 recompõe CNPJ em 14 dígitos e valor líquido não desconta desconto (1.241945ms)
✔ motor por CNPJ separa oficial, executável, lançamento, bloqueio e compra histórica (20.792636ms)
✔ Clientes & Sortimento preserva Carteira em caixas quando Un/CX é desconhecido sem fabricar unidades (44.020236ms)
✔ código Winthor escrito apenas no sortimento oficial não altera o fato cadastral hasWinthor (1.131894ms)
✔ dossiê exporta exatamente caixas, unidades e origem Un/CX materializadas pelo motor (6.7486ms)
✔ design system possui uma única família de tokens e navegação touch explícita (1.629976ms)
✔ fontes e contratos substituídos não podem voltar ao runtime (0.744915ms)
✔ páginas operacionais consomem apenas canonical (2.643687ms)
✔ arquivos e templates substituídos foram removidos (0.308503ms)
✔ exports atuais nascem da base canônica (0.280002ms)
✔ hasWinthor continua falso para item cadastralmente sem Winthor mesmo fora da Carteira (4.409743ms)
✔ Sem Winthor operacional conta somente item sem Winthor efetivamente presente na Carteira (20.104865ms)
✔ configuração de competência corrompida retorna erro explícito sem fingir ausência (1.803822ms)
✖ DataContext propaga erro de persistência manual para warnings visíveis (4.049994ms)
✔ identifica variações de nome do relatório 12.322 (1.320121ms)
✔ não confunde outros arquivos com 12.322 (0.198962ms)

node:internal/modules/run_main:107
    triggerUncaughtException(
    ^
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/runner/work/blue_jacket/blue_jacket/src/services/receiptReconciliation' imported from /home/runner/work/blue_jacket/blue_jacket/tests/operational-sources.test.ts
    at finalizeResolution (node:internal/modules/esm/resolve:271:11)
    at moduleResolve (node:internal/modules/esm/resolve:865:10)
    at defaultResolve (node:internal/modules/esm/resolve:992:11)
    at nextResolve (node:internal/modules/esm/hooks:785:28)
    at resolve (file:///home/runner/work/blue_jacket/blue_jacket/tests/ts-loader.mjs:2:20)
    at nextResolve (node:internal/modules/esm/hooks:785:28)
    at AsyncLoaderHooksOnLoaderHookWorker.resolve (node:internal/modules/esm/hooks:269:30)
    at MessagePort.handleMessage (node:internal/modules/esm/worker:251:24)
    at [nodejs.internal.kHybridDispatch] (node:internal/event_target:856:20)
    at MessagePort.<anonymous> (node:internal/per_context/messageport:23:28) {
  code: 'ERR_MODULE_NOT_FOUND',
  url: 'file:///home/runner/work/blue_jacket/blue_jacket/src/services/receiptReconciliation'
}

Node.js v24.19.0
✖ tests/operational-sources.test.ts (273.006099ms)
✔ JSON operacional corrompido retorna erro explícito de persistência (1.312792ms)
✔ continuidade da Carteira corrompida é distinguida de ausência de snapshot (0.324597ms)
✔ Clientes & Sortimento não possui mais catch silencioso que retorna base vazia (0.690126ms)
✔ extrai a data do snapshot pelo nome da Carteira mesmo quando o maior Order Date é anterior (4.602054ms)
✔ roll-forward mantém pedidos acompanhados, inclui pedidos novos e elimina histórico retroativo (2.142394ms)
✔ checkpoint aprovado 17/08 reproduz a leitura comparável da Carteira 20/08 (0.98473ms)
✔ sem snapshot persistido, uma Carteira posterior a 17/08 usa o checkpoint aprovado como âncora de migração (0.434129ms)
✔ Configurações aplica a continuidade antes de recalcular Estoque e persiste a Carteira filtrada (3.773866ms)
✔ auditoria resume OK, divergente e bloqueado separadamente (1.803555ms)
✔ três níveis possuem nomenclatura exigida pela auditoria (0.203049ms)
✔ esperado, calculado e diferença permanecem apresentáveis sem fabricar valor (21.665267ms)
✔ janela diária preserva a data selecionada ao desmontar e remontar a aba (1.217092ms)
✔ botão Atual seleciona explicitamente o último dia da carga (0.227475ms)
✔ arquivo Sell Out usa RCA atual na aba EQUIPES (1.234016ms)
✔ normaliza códigos copiados de TXT, CSV ou Excel (1.423866ms)
✔ extrai lista única ignorando textos sem número (1.29776ms)
✔ filtro aceita código Winthor, código fábrica ou EAN (0.435962ms)
✔ informa quantos códigos importados existem no catálogo (0.349265ms)
✔ estoque decompõe caixas completas e unidades avulsas sem descartar o residual (23.62709ms)
✔ posição bruta subtrai a reserva exatamente uma vez (1.006091ms)
✔ posição líquida preserva o saldo exportado e impede dupla subtração (0.517492ms)
✔ reserva indeterminada não é subtraída silenciosamente (0.479205ms)
✔ Carteira entra como movimento de entrada prevista e participa somente do projetado (0.572112ms)
✔ 8022 gera saídas faturadas e reservadas sem inventar documento ou NF (1.794061ms)
✔ estoque zero com Winthor permanece ruptura por padrão e limites de cobertura continuam configuráveis (0.858253ms)
✔ reconciliação não esconde ausência de conversão nem reserva sem SKU (0.862029ms)
✔ configuração de alertas de estoque é persistida por competência (1.127049ms)
✔ motor de estoque usa Master/Un-CX carregado no inventário mesmo sem Lista de Preços (23.824811ms)
✔ flag legado de 8013 sem evidência física não zera a posição 105 (5.716145ms)
✔ Carteira é reconciliada por SKU e regra Order Qty + Bill Qty está validada (20.59765ms)
✔ Carteira preserva Order Qty e Bill Qty linha a linha na movimentação (0.939783ms)
✔ lançamento persistido no suporte reaparece após novo snapshot de estoque (1.018059ms)
✔ lançamento marcado no suporte prevalece sobre flag zerada do snapshot (0.445485ms)
✔ movimento usa caixas e calcula somente o residual comprovável como unidade avulsa (0.856451ms)
✔ hasWinthor permanece factual e Sem Winthor operacional só conta item efetivamente presente na Carteira (1.464676ms)
✔ item sem Winthor não entra como ruptura (1.380121ms)
✔ estoque zerado com Winthor é ruptura (0.198092ms)
✔ item com estoque mas sem saída faturada fica sem giro (0.272711ms)
✔ cobertura abaixo da meta e sem carteira é risco (0.14253ms)
✔ carteira Colgate remove o item da classificação de risco (0.155699ms)
✔ cobertura igual ou acima da meta é OK (0.153687ms)
✔ filtro de risco continua independente do filtro de catálogo na tela reformulada (2.591545ms)
✔ PCTABPR usa Preço 1 (PVENDA1 / coluna S), prioriza sobre PTABELA e normaliza para 2 casas (2.053122ms)
✔ Bússola considera somente MCD + Colgate (3.935277ms)
✔ Meta T&C não herda automaticamente a meta da indústria (0.266182ms)
✔ alterar Meta Redes Geral redistribui proporcionalmente e fecha exatamente o total (0.446568ms)
✔ editar uma rede mantém Meta Redes Geral e redistribui saldo proporcionalmente (0.410764ms)
✔ redistribuição fecha exatamente mesmo com pesos que geram dízima (0.315254ms)
✔ Configurações possui um único orquestrador canônico e não reaplica overlays antigos (1.708314ms)
✔ DataContext aceita somente UnifiedDataLayer e não restaura projeções locais antigas (0.317868ms)
✔ rota ativa de Clientes & Sortimento é consumidora da base unificada e não possui uploader próprio (0.415852ms)
✔ serviço de cálculo não usa base.inventory como fallback de negócio (0.27224ms)
✔ motor unificado recebe 105, lançamentos, PCTABPR e Bússola diretamente (2.742126ms)
✔ Motor Histórico classifica exatamente as combinações aprovadas de venda e devolução (1.795352ms)
✔ 379 aceita código histórico de oito dígitos fora do prefixo 111 sem transformá-lo em Winthor (1.177844ms)
✔ devolução histórica recebe sinal negativo e OTHER permanece preservado com sinal zero (0.684458ms)
✔ PCTABPR canônica lê aba bruta e filtra somente NUMREGIAO=11 usando PVENDA1 (3.102507ms)
✔ Motor de Itens preserva layout compacto aprovado de 286 e 105 (1.625202ms)
✔ Motor de Itens reconhece layout expandido atual do 105 com P. Venda pontuado (0.389533ms)
✔ Lista Oficial de Lançamentos é a autoridade de isLaunch por EAN (0.348763ms)
ℹ tests 154
ℹ suites 0
ℹ pass 150
ℹ fail 4
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5182.71119

✖ failing tests:

test at tests/audit-checkpoint-regression.test.ts:16:1
✖ checkpoint: Meta T&C continua separada da Meta Indústria na camada canônica atual (6.229343ms)
  AssertionError [ERR_ASSERTION]: The input was expected to not match the regular expression /industryTarget/. Input:
  
  'export const LINE_NAMES = [\n' +
    "  'Creme Dental',\n" +
    "  'Esc + Enx + Fio',\n" +
    "  'Sabonetes',\n" +
    "  'Hair',\n" +
    "  'Limpeza',\n" +
    '] as const;\n' +
    '\n' +
    'export type LineName = (typeof LINE_NAMES)[number];\n' +
    '\n' +
    'export interface ManualConfiguration {\n' +
    '  sellOutTarget: number;\n' +
    '  coverageTargetDays: number;\n' +
    '  portfolioSaleMarkup: number;\n' +
    '  networkTargets: Record<string, number>;\n' +
    '  holidays: string[];\n' +
    '  lineShares: Record<LineName, number>;\n' +
    '}\n' +
    '\n' +
    'export const DEFAULT_MANUAL_CONFIGURATION: ManualConfiguration = {\n' +
    '  sellOutTarget: 0,\n' +
    '  coverageTargetDays: 60,\n' +
    '  portfolioSaleMarkup: 0.31530488350705,\n' +
    '  networkTargets: {},\n' +
    '  holidays: [\n' +
    "    '2026-01-01', '2026-04-03', '2026-04-21', '2026-05-01',\n" +
    "    '2026-06-04', '2026-06-13', '2026-08-26', '2026-09-07',\n" +
    "    '2026-10-11', '2026-10-12', '2026-11-02', '2026-11-15',\n" +
    "    '2026-11-20', '2026-12-25',\n" +
    '  ],\n' +
    '  lineShares: {\n' +
    "    'Creme Dental': 0.525,\n" +
    "    'Esc + Enx + Fio': 0.095,\n" +
    "    'Sabonetes': 0.20,\n" +
    '    Hair: 0.095,\n' +
    '    Limpeza: 0.085,\n' +
    '  },\n' +
    '};\n' +
    '\n' +
    'export type SourceKind =\n' +
    "  | 'sales8022'\n" +
    "  | 'stock105'\n" +
    "  | 'stock8013'\n" +
    "  | 'items286'\n" +
    "  | 'purchasePortfolio'\n" +
    "  | 'rcaMap'\n" +
    "  | 'priceList'\n" +
    "  | 'launchList'\n" +
    "  | 'premises'\n" +
    "  | 'compassTargets'\n" +
    "  | 'activeRoute'\n" +
    "  | 'history379_2025'\n" +
    "  | 'history379_2026'\n" +
    "  | 'unknown';\n" +
    '\n' +
    'export interface CanonicalSalesTransaction {\n' +
    '  date: string;\n' +
    "  status: 'FATURADO' | 'A FATURAR';\n" +
    '  clientCode: string;\n' +
    '  clientName: string;\n' +
    '  cnpj: string;\n' +
    '  cnpjRaw?: string;\n' +
    '  cnpjNormalizationStatus?: CnpjNormalizationStatus;\n' +
    '  city: string;\n' +
    '  vendorCode: string;\n' +
    '  vendorName: string;\n' +
    '  supervisorCode: string;\n' +
    '  supervisorName: string;\n' +
    '  manufacturerCode: string;\n' +
    '  ean: string;\n' +
    '  internalProductCode: string;\n' +
    '  productDescription: string;\n' +
    '  cases: number;\n' +
    '  units: number;\n' +
    '  value: number;\n' +
    '  saleType: string;\n' +
    "  line: LineName | '';\n" +
    '}\n' +
    '\n' +
    'export interface CanonicalInventoryProduct {\n' +
    '  code: string;\n' +
    '  description: string;\n' +
    '  ean: string;\n' +
    '  quantity: number;\n' +
    '  costUnit: number;\n' +
    '  saleUnit: number;\n' +
    '  pendingQty: number;\n' +
    '  pendingCases: number;\n' +
    '  pendingCost: number;\n' +
    '  pendingSale: number;\n' +
    '  isLaunch: boolean;\n' +
    '  hasWinthor: boolean;\n' +
    '  factoryCode: string;\n' +
    '  physicalCases: number;\n' +
    '  physicalUnits: number;\n' +
    '  grossKg: number;\n' +
    '}\n' +
    '\n' +
    'export interface CanonicalRcaSupport { newCode:string; oldCode:string; name:string; coordinatorCode:string; coordinatorName:string; }\n' +
    'export interface CanonicalVendorTargetSupport { oldCode:string; name:string; supervisorName:string; salesTarget:number; positivityTarget:number; }\n' +
    'export interface CanonicalClientSupport { cnpj:string; cnpjRaw?:string; cnpjNormalizationStatus?:CnpjNormalizationStatus; name:string; city:string; network:string; profile:string; isTop:boolean; }\n' +
    'export interface CanonicalRouteStoreSupport { cnpj:string; cnpjRaw?:string; cnpjNormalizationStatus?:CnpjNormalizationStatus; name:string; fantasyName:string; city:string; networkRaw:string; managerCnpj:string; managerCnpjRaw?:string; managerCnpjNormalizationStatus?:CnpjNormalizationStatus; groupingCode:string; tier:string; storeType:string; target:number; }\n' +
    "export interface CanonicalProductSupport { sku:string; ean:string; description:string; category:string; subcategory:string; brand:string; isLaunch:boolean; boxPrice:number; unitPrice:number; unitsPerCase:number; line:LineName|''; }\n" +
    'export interface CanonicalItemCodeSupport { internalCode:string; description:string; ean:string; factoryCode:string; }\n' +
    '\n' +
    'export interface CanonicalSupportData {\n' +
    '  rcas: CanonicalRcaSupport[];\n' +
    '  vendorTargets: CanonicalVendorTargetSupport[];\n' +
    '  clients: CanonicalClientSupport[];\n' +
    '  activeRoute: CanonicalRouteStoreSupport[];\n' +
    '  products: CanonicalProductSupport[];\n' +
    '  itemCodes: CanonicalItemCodeSupport[];\n' +
    '}\n' +
    '\n' +
    'export const EMPTY_CANONICAL_SUPPORT: CanonicalSupportData = { rcas:[], vendorTargets:[], clients:[], activeRoute:[], products:[], itemCodes:[] };\n' +
    '\n' +
    'export interface SourceAudit {\n' +
    '  kind: SourceKind;\n' +
    '  fileName: string;\n' +
    '  loaded: boolean;\n' +
    '  rows: number;\n' +
    '  note?: string;\n' +
    '  updatedAt?: string;\n' +
    '  fileModifiedAt?: string;\n' +
    '}\n' +
    '\n' +
    'export interface CanonicalHistoryMonth {\n' +
    '  key: string;\n' +
    '  year: number;\n' +
    '  month: number;\n' +
    '  value: number;\n' +
    '  grossSales: number;\n' +
    '  returns: number;\n' +
    '}\n' +
    '\n' +
    'export interface CanonicalHistorySummary {\n' +
    '  months: CanonicalHistoryMonth[];\n' +
    '  sameMonthLastYear: number | null;\n' +
    '  sameMonthLastYearKey: string;\n' +
    '  average3ClosedMonths: number | null;\n' +
    '  average3MonthKeys: string[];\n' +
    '}\n' +
    '\n' +
    "export type ReconciliationLevel = 'INTERNAL' | 'SOURCE' | 'SPREADSHEET';\n" +
    "export type ReconciliationStatus = 'OK' | 'DIVERGENT' | 'BLOCKED';\n" +
    "export type CnpjNormalizationStatus = 'EMPTY' | 'EXACT_14' | 'PADDED_EXCEL' | 'TRIMMED_LEADING_ZERO' | 'CPF_OR_AMBIGUOUS' | 'INVALID_LENGTH';\n" +
    "export type CnpjRelationshipSource = '8022' | 'PREMISSAS' | 'ROTEIRO' | 'REFERENCIA';\n" +
    '\n' +
    'export interface CanonicalReconciliationCheck {\n' +
    '  id:string;\n' +
    '  level:ReconciliationLevel;\n' +
    '  label:string;\n' +
    '  expected:number | string | null;\n' +
    '  calculated:number | string | null;\n' +
    '  difference:number | null;\n' +
    '  tolerance:number;\n' +
    '  status:ReconciliationStatus;\n' +
    '  source:string;\n' +
    '  note?:string;\n' +
    '}\n' +
    '\n' +
    "export type NetworkAssignmentSource = 'PREMISSAS' | 'ROTEIRO' | 'REFERENCIA' | 'SEM_REDE';\n" +
    'export interface CanonicalNetworkAssignmentAudit {\n' +
    '  cnpj:string;\n' +
    '  value:number;\n' +
    '  network:string;\n' +
    '  source:NetworkAssignmentSource;\n' +
    '  divergentSources:string[];\n' +
    '  sourcePresence?:Partial<Record<CnpjRelationshipSource,boolean>>;\n' +
    "  sourceNetworks?:Partial<Record<Exclude<CnpjRelationshipSource,'8022'>,string>>;\n" +
    '  originalCnpjs?:Partial<Record<CnpjRelationshipSource,string[]>>;\n' +
    '  normalizationIssues?:string[];\n' +
    '}\n' +
    '\n' +
    'export interface CanonicalCnpjSourceSummary {\n' +
    '  source:CnpjRelationshipSource;\n' +
    '  rows:number;\n' +
    '  uniqueCanonical:number;\n' +
    '  exact14:number;\n' +
    '  paddedExcel:number;\n' +
    '  trimmedLeadingZero:number;\n' +
    '  cpfOrAmbiguous:number;\n' +
    '  invalidLength:number;\n' +
    '  duplicateCnpjs:number;\n' +
    '  conflictingNetworkCnpjs:number;\n' +
    '  matchedSalesCnpjs:number;\n' +
    '  matchedSalesValue:number;\n' +
    '}\n' +
    '\n' +
    'export interface CanonicalCnpjIssue {\n' +
    '  source:CnpjRelationshipSource;\n' +
    '  raw:string;\n' +
    '  canonical:string;\n' +
    '  status:CnpjNormalizationStatus;\n' +
    '  note:string;\n' +
    '}\n' +
    '\n' +
    'export interface CanonicalNetworkSourceConflict {\n' +
    '  source:CnpjRelationshipSource;\n' +
    '  cnpj:string;\n' +
    '  networks:string[];\n' +
    '}\n' +
    '\n' +
    'export interface CanonicalRelationshipAudit {\n' +
    '  sourceSummaries:CanonicalCnpjSourceSummary[];\n' +
    '  normalizationIssues:CanonicalCnpjIssue[];\n' +
    '  networkConflicts:CanonicalNetworkSourceConflict[];\n' +
    '}\n' +
    '\n' +
    'export interface CanonicalReconciliation {\n' +
    '  checks:CanonicalReconciliationCheck[];\n' +
    '  networkAssignments:CanonicalNetworkAssignmentAudit[];\n' +
    '  relationships?:CanonicalRelationshipAudit;\n' +
    '  blockedRules:string[];\n' +
    '}\n' +
    '\n' +
    'export interface CanonicalDailyMovement { date:string; invoiced:number; toInvoice:number; total:number; invoicedPositivation:number; totalPositivation:number; }\n' +
    'export interface CanonicalClientResult { cnpj:string; name:string; city:string; network:string; invoiced:number; toInvoice:number; total:number; }\n' +
    '\n' +
    'export interface CanonicalVendorResult {\n' +
    '  newCode:string; oldCode:string; name:string; coordinatorCode:string; coordinatorName:string;\n' +
    '  salesTarget:number; positivityTarget:number; invoiced:number; toInvoice:number; total:number; attainment:number;\n' +
    '  invoicedPositivation:number; futurePositivation:number; totalPositivation:number; positivityAttainment:number;\n' +
    '  idealSalesToday:number; salesGapToIdeal:number; salesGapToTarget:number; idealPositivationToday:number;\n' +
    '  positivityGapToIdeal:number; positivityGapToTarget:number; positivityDailyTarget:number;\n' +
    '}\n' +
    '\n' +
    'export interface CanonicalCoordinatorResult {\n' +
    '  code:string; name:string; salesTarget:number; positivityTarget:number; invoiced:number; toInvoice:number; total:number;\n' +
    '  attainment:number; invoicedPositivation:number; futurePositivation:number; totalPositivation:number; positivityAttainment:number; vendors:CanonicalVendorResult[];\n' +
    '}\n' +
    '\n' +
    'export interface CanonicalNetworkStore { cnpj:string; name:string; fantasyName:string; city:string; managerCnpj:string; groupingCode:string; tier:string; storeType:string; topTarget:number; invoiced:number; toInvoice:number; total:number; }\n' +
    'export interface CanonicalNetworkResult { key:string; name:string; networkTarget:number; topTarget:number; invoiced:number; toInvoice:number; total:number; networkAttainment:number; topAttainment:number; gapToNetworkTarget:number; gapToTopTarget:number; clients:number; stores:CanonicalNetworkStore[]; }\n' +
    'export interface CanonicalLineResult { name:LineName; share:number; target:number; invoiced:number; toInvoice:number; total:number; attainment:number; }\n' +
    '\n' +
    'export interface CanonicalStockSummary {\n' +
    '  costValue:number; saleValue:number; pendingPurchaseCost:number; pendingPurchaseSale:number; projectedCostValue:number; projectedSaleValue:number;\n' +
    '  physicalUnits:number; physicalCases:number; grossKg:number;\n' +
    '  coverageCurrentDays:number; coverageProjectedDays:number;\n' +
    '  coverageCostCurrentDays:number; coverageCostProjectedDays:number;\n' +
    '  coverageTargetDays:number;\n' +
    '}\n' +
    '\n' +
    'export interface CanonicalSellOutSummary {\n' +
    '  invoiced:number; toInvoice:number; total:number; sellOutTarget:number; attainment:number;\n' +
    '  invoicedPositivation:number; futurePositivation:number; totalPositivation:number; industryPositivityTarget:number; positivityAttainment:number;\n' +
    '  ticketAverage:number; businessDaysTotal:number; businessDaysElapsed:number; businessDaysRemaining:number;\n' +
    '  invoicedDailyAverage:number; totalDailyAverage:number; neededDailyAverage:number; invoicedTrend:number; totalTrend:number;\n' +
    '}\n' +
    '\n' +
    'export interface CanonicalState {\n' +
    '  schemaVersion: 2;\n' +
    '  generatedAt:string; referenceDate:string; periodStart:string; periodEnd:string;\n' +
    '  sources:SourceAudit[]; support:CanonicalSupportData; transactions:CanonicalSalesTransaction[]; inventory:CanonicalInventoryProduct[]; daily:CanonicalDailyMovement[];\n' +
    '  history:CanonicalHistorySummary;\n' +
    '  industryTarget:number; industryPositivityTarget:number; sellOut:CanonicalSellOutSummary; stock:CanonicalStockSummary;\n' +
    '  vendors:CanonicalVendorResult[]; coordinators:CanonicalCoordinatorResult[]; clients:CanonicalClientResult[]; networks:CanonicalNetworkResult[]; lines:CanonicalLineResult'... 5594 more characters
  
      at TestContext.<anonymous> (file:///home/runner/work/blue_jacket/blue_jacket/tests/audit-checkpoint-regression.test.ts:20:10)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: "export const LINE_NAMES = [\n  'Creme Dental',\n  'Esc + Enx + Fio',\n  'Sabonetes',\n  'Hair',\n  'Limpeza',\n] as const;\n\nexport type LineName = (typeof LINE_NAMES)[number];\n\nexport interface ManualConfiguration {\n  sellOutTarget: number;\n  coverageTargetDays: number;\n  portfolioSaleMarkup: number;\n  networkTargets: Record<string, number>;\n  holidays: string[];\n  lineShares: Record<LineName, number>;\n}\n\nexport const DEFAULT_MANUAL_CONFIGURATION: ManualConfiguration = {\n  sellOutTarget: 0,\n  coverageTargetDays: 60,\n  portfolioSaleMarkup: 0.31530488350705,\n  networkTargets: {},\n  holidays: [\n    '2026-01-01', '2026-04-03', '2026-04-21', '2026-05-01',\n    '2026-06-04', '2026-06-13', '2026-08-26', '2026-09-07',\n    '2026-10-11', '2026-10-12', '2026-11-02', '2026-11-15',\n    '2026-11-20', '2026-12-25',\n  ],\n  lineShares: {\n    'Creme Dental': 0.525,\n    'Esc + Enx + Fio': 0.095,\n    'Sabonetes': 0.20,\n    Hair: 0.095,\n    Limpeza: 0.085,\n  },\n};\n\nexport type SourceKind =\n  | 'sales8022'\n  | 'stock105'\n  | 'stock8013'\n  | 'items286'\n  | 'purchasePortfolio'\n  | 'rcaMap'\n  | 'priceList'\n  | 'launchList'\n  | 'premises'\n  | 'compassTargets'\n  | 'activeRoute'\n  | 'history379_2025'\n  | 'history379_2026'\n  | 'unknown';\n\nexport interface CanonicalSalesTransaction {\n  date: string;\n  status: 'FATURADO' | 'A FATURAR';\n  clientCode: string;\n  clientName: string;\n  cnpj: string;\n  cnpjRaw?: string;\n  cnpjNormalizationStatus?: CnpjNormalizationStatus;\n  city: string;\n  vendorCode: string;\n  vendorName: string;\n  supervisorCode: string;\n  supervisorName: string;\n  manufacturerCode: string;\n  ean: string;\n  internalProductCode: string;\n  productDescription: string;\n  cases: number;\n  units: number;\n  value: number;\n  saleType: string;\n  line: LineName | '';\n}\n\nexport interface CanonicalInventoryProduct {\n  code: string;\n  description: string;\n  ean: string;\n  quantity: number;\n  costUnit: number;\n  saleUnit: number;\n  pendingQty: number;\n  pendingCases: number;\n  pendingCost: number;\n  pendingSale: number;\n  isLaunch: boolean;\n  hasWinthor: boolean;\n  factoryCode: string;\n  physicalCases: number;\n  physicalUnits: number;\n  grossKg: number;\n}\n\nexport interface CanonicalRcaSupport { newCode:string; oldCode:string; name:string; coordinatorCode:string; coordinatorName:string; }\nexport interface CanonicalVendorTargetSupport { oldCode:string; name:string; supervisorName:string; salesTarget:number; positivityTarget:number; }\nexport interface CanonicalClientSupport { cnpj:string; cnpjRaw?:string; cnpjNormalizationStatus?:CnpjNormalizationStatus; name:string; city:string; network:string; profile:string; isTop:boolean; }\nexport interface CanonicalRouteStoreSupport { cnpj:string; cnpjRaw?:string; cnpjNormalizationStatus?:CnpjNormalizationStatus; name:string; fantasyName:string; city:string; networkRaw:string; managerCnpj:string; managerCnpjRaw?:string; managerCnpjNormalizationStatus?:CnpjNormalizationStatus; groupingCode:string; tier:string; storeType:string; target:number; }\nexport interface CanonicalProductSupport { sku:string; ean:string; description:string; category:string; subcategory:string; brand:string; isLaunch:boolean; boxPrice:number; unitPrice:number; unitsPerCase:number; line:LineName|''; }\nexport interface CanonicalItemCodeSupport { internalCode:string; description:string; ean:string; factoryCode:string; }\n\nexport interface CanonicalSupportData {\n  rcas: CanonicalRcaSupport[];\n  vendorTargets: CanonicalVendorTargetSupport[];\n  clients: CanonicalClientSupport[];\n  activeRoute: CanonicalRouteStoreSupport[];\n  products: CanonicalProductSupport[];\n  itemCodes: CanonicalItemCodeSupport[];\n}\n\nexport const EMPTY_CANONICAL_SUPPORT: CanonicalSupportData = { rcas:[], vendorTargets:[], clients:[], activeRoute:[], products:[], itemCodes:[] };\n\nexport interface SourceAudit {\n  kind: SourceKind;\n  fileName: string;\n  loaded: boolean;\n  rows: number;\n  note?: string;\n  updatedAt?: string;\n  fileModifiedAt?: string;\n}\n\nexport interface CanonicalHistoryMonth {\n  key: string;\n  year: number;\n  month: number;\n  value: number;\n  grossSales: number;\n  returns: number;\n}\n\nexport interface CanonicalHistorySummary {\n  months: CanonicalHistoryMonth[];\n  sameMonthLastYear: number | null;\n  sameMonthLastYearKey: string;\n  average3ClosedMonths: number | null;\n  average3MonthKeys: string[];\n}\n\nexport type ReconciliationLevel = 'INTERNAL' | 'SOURCE' | 'SPREADSHEET';\nexport type ReconciliationStatus = 'OK' | 'DIVERGENT' | 'BLOCKED';\nexport type CnpjNormalizationStatus = 'EMPTY' | 'EXACT_14' | 'PADDED_EXCEL' | 'TRIMMED_LEADING_ZERO' | 'CPF_OR_AMBIGUOUS' | 'INVALID_LENGTH';\nexport type CnpjRelationshipSource = '8022' | 'PREMISSAS' | 'ROTEIRO' | 'REFERENCIA';\n\nexport interface CanonicalReconciliationCheck {\n  id:string;\n  level:ReconciliationLevel;\n  label:string;\n  expected:number | string | null;\n  calculated:number | string | null;\n  difference:number | null;\n  tolerance:number;\n  status:ReconciliationStatus;\n  source:string;\n  note?:string;\n}\n\nexport type NetworkAssignmentSource = 'PREMISSAS' | 'ROTEIRO' | 'REFERENCIA' | 'SEM_REDE';\nexport interface CanonicalNetworkAssignmentAudit {\n  cnpj:string;\n  value:number;\n  network:string;\n  source:NetworkAssignmentSource;\n  divergentSources:string[];\n  sourcePresence?:Partial<Record<CnpjRelationshipSource,boolean>>;\n  sourceNetworks?:Partial<Record<Exclude<CnpjRelationshipSource,'8022'>,string>>;\n  originalCnpjs?:Partial<Record<CnpjRelationshipSource,string[]>>;\n  normalizationIssues?:string[];\n}\n\nexport interface CanonicalCnpjSourceSummary {\n  source:CnpjRelationshipSource;\n  rows:number;\n  uniqueCanonical:number;\n  exact14:number;\n  paddedExcel:number;\n  trimmedLeadingZero:number;\n  cpfOrAmbiguous:number;\n  invalidLength:number;\n  duplicateCnpjs:number;\n  conflictingNetworkCnpjs:number;\n  matchedSalesCnpjs:number;\n  matchedSalesValue:number;\n}\n\nexport interface CanonicalCnpjIssue {\n  source:CnpjRelationshipSource;\n  raw:string;\n  canonical:string;\n  status:CnpjNormalizationStatus;\n  note:string;\n}\n\nexport interface CanonicalNetworkSourceConflict {\n  source:CnpjRelationshipSource;\n  cnpj:string;\n  networks:string[];\n}\n\nexport interface CanonicalRelationshipAudit {\n  sourceSummaries:CanonicalCnpjSourceSummary[];\n  normalizationIssues:CanonicalCnpjIssue[];\n  networkConflicts:CanonicalNetworkSourceConflict[];\n}\n\nexport interface CanonicalReconciliation {\n  checks:CanonicalReconciliationCheck[];\n  networkAssignments:CanonicalNetworkAssignmentAudit[];\n  relationships?:CanonicalRelationshipAudit;\n  blockedRules:string[];\n}\n\nexport interface CanonicalDailyMovement { date:string; invoiced:number; toInvoice:number; total:number; invoicedPositivation:number; totalPositivation:number; }\nexport interface CanonicalClientResult { cnpj:string; name:string; city:string; network:string; invoiced:number; toInvoice:number; total:number; }\n\nexport interface CanonicalVendorResult {\n  newCode:string; oldCode:string; name:string; coordinatorCode:string; coordinatorName:string;\n  salesTarget:number; positivityTarget:number; invoiced:number; toInvoice:number; total:number; attainment:number;\n  invoicedPositivation:number; futurePositivation:number; totalPositivation:number; positivityAttainment:number;\n  idealSalesToday:number; salesGapToIdeal:number; salesGapToTarget:number; idealPositivationToday:number;\n  positivityGapToIdeal:number; positivityGapToTarget:number; positivityDailyTarget:number;\n}\n\nexport interface CanonicalCoordinatorResult {\n  code:string; name:string; salesTarget:number; positivityTarget:number; invoiced:number; toInvoice:number; total:number;\n  attainment:number; invoicedPositivation:number; futurePositivation:number; totalPositivation:number; positivityAttainment:number; vendors:CanonicalVendorResult[];\n}\n\nexport interface CanonicalNetworkStore { cnpj:string; name:string; fantasyName:string; city:string; managerCnpj:string; groupingCode:string; tier:string; storeType:string; topTarget:number; invoiced:number; toInvoice:number; total:number; }\nexport interface CanonicalNetworkResult { key:string; name:string; networkTarget:number; topTarget:number; invoiced:number; toInvoice:number; total:number; networkAttainment:number; topAttainment:number; gapToNetworkTarget:number; gapToTopTarget:number; clients:number; stores:CanonicalNetworkStore[]; }\nexport interface CanonicalLineResult { name:LineName; share:number; target:number; invoiced:number; toInvoice:number; total:number; attainment:number; }\n\nexport interface CanonicalStockSummary {\n  costValue:number; saleValue:number; pendingPurchaseCost:number; pendingPurchaseSale:number; projectedCostValue:number; projectedSaleValue:number;\n  physicalUnits:number; physicalCases:number; grossKg:number;\n  coverageCurrentDays:number; coverageProjectedDays:number;\n  coverageCostCurrentDays:number; coverageCostProjectedDays:number;\n  coverageTargetDays:number;\n}\n\nexport interface CanonicalSellOutSummary {\n  invoiced:number; toInvoice:number; total:number; sellOutTarget:number; attainment:number;\n  invoicedPositivation:number; futurePositivation:number; totalPositivation:number; industryPositivityTarget:number; positivityAttainment:number;\n  ticketAverage:number; businessDaysTotal:number; businessDaysElapsed:number; businessDaysRemaining:number;\n  invoicedDailyAverage:number; totalDailyAverage:number; neededDailyAverage:number; invoicedTrend:number; totalTrend:number;\n}\n\nexport interface CanonicalState {\n  schemaVersion: 2;\n  generatedAt:string; referenceDate:string; periodStart:string; periodEnd:string;\n  sources:SourceAudit[]; support:CanonicalSupportData; transactions:CanonicalSalesTransaction[]; inventory:CanonicalInventoryProduct[]; daily:CanonicalDailyMovement[];\n  history:CanonicalHistorySummary;\n  industryTarget:number; industryPositivityTarget:number; sellOut:CanonicalSellOutSummary; stock:CanonicalStockSummary;\n  vendors:CanonicalVendorResult[]; coordinators:CanonicalCoordinatorResult[]; clients:CanonicalClientResult[]; networks:CanonicalNetworkResult[]; lines:CanonicalLineResult"... 5594 more characters,
    expected: /industryTarget/,
    operator: 'doesNotMatch',
    diff: 'simple'
  }

test at tests/audit-p0-receipt-pipeline.test.ts:1:1
✖ tests/audit-p0-receipt-pipeline.test.ts (255.466241ms)
  'test failed'

test at tests/manual-config-persistence-audit.test.ts:21:1
✖ DataContext propaga erro de persistência manual para warnings visíveis (4.049994ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /warnings:Array\.from\(new Set\(\[\.\.\.normalized\.warnings,manualConfigPersistenceError\]\)\)/. Input:
  
  "import React, { createContext, useContext, useMemo, useState, type ReactNode } from 'react';\n" +
    "import { applyManualConfiguration, type CanonicalState, DEFAULT_MANUAL_CONFIGURATION, type ManualConfiguration } from '../domain/canonical';\n" +
    "import { isUnifiedCanonicalState } from '../services/motors/unifiedEngine';\n" +
    "import { clearCanonicalState, loadCanonicalState, saveCanonicalState } from './canonicalPersistence';\n" +
    "import { competenceFromCanonical, loadManualConfiguration, normalizeManualConfiguration, saveManualConfiguration } from './competencePersistence';\n" +
    '\n' +
    'interface DataContextType {\n' +
    '  canonical: CanonicalState | null;\n' +
    '  setCanonical: (data: CanonicalState | null) => void;\n' +
    '  manualConfig: ManualConfiguration;\n' +
    '  setManualConfig: (config: ManualConfiguration) => void;\n' +
    '}\n' +
    '\n' +
    'const DataContext = createContext<DataContextType>({\n' +
    '  canonical: null,\n' +
    '  setCanonical: () => {},\n' +
    '  manualConfig: DEFAULT_MANUAL_CONFIGURATION,\n' +
    '  setManualConfig: () => {},\n' +
    '});\n' +
    '\n' +
    'export const DataProvider = ({ children }: { children: ReactNode }) => {\n' +
    '  const [canonicalBase, setCanonicalBase] = useState<CanonicalState | null>(null);\n' +
    '  const [manualConfig, setManualConfigState] = useState<ManualConfiguration>(DEFAULT_MANUAL_CONFIGURATION);\n' +
    "  const [manualConfigPersistenceError, setManualConfigPersistenceError] = useState('');\n" +
    '\n' +
    '  React.useEffect(() => {\n' +
    '    let cancelled = false;\n' +
    '    const hydrate = async () => {\n' +
    '      const stored = await loadCanonicalState();\n' +
    '      const storedCanonical = stored && isUnifiedCanonicalState(stored) ? stored : null;\n' +
    '      if (stored && !storedCanonical) await clearCanonicalState();\n' +
    '      const competence = competenceFromCanonical(storedCanonical);\n' +
    '      const manualLoad = loadManualConfiguration(localStorage, competence, { migrateLegacy: false });\n' +
    '      if (cancelled) return;\n' +
    '      setCanonicalBase(storedCanonical);\n' +
    '      setManualConfigState(manualLoad.config);\n' +
    "      setManualConfigPersistenceError(manualLoad.persistenceError || '');\n" +
    '    };\n' +
    "    void hydrate().catch(error => console.error('Não foi possível restaurar a base canônica.', error));\n" +
    '    return () => { cancelled = true; };\n' +
    '  }, []);\n' +
    '\n' +
    '  const activeCompetence = useMemo(() => competenceFromCanonical(canonicalBase), [canonicalBase]);\n' +
    '  const canonical = useMemo(() => {\n' +
    '    const configured = applyManualConfiguration(canonicalBase, manualConfig);\n' +
    '    if (!configured || !manualConfigPersistenceError) return configured;\n' +
    '    return { ...configured, warnings: Array.from(new Set([...configured.warnings, manualConfigPersistenceError])) };\n' +
    '  }, [canonicalBase, manualConfig, manualConfigPersistenceError]);\n' +
    '\n' +
    '  const setCanonical = (data: CanonicalState | null) => {\n' +
    '    if (data && !isUnifiedCanonicalState(data)) {\n' +
    "      console.error('Snapshot rejeitado: o Blue Jacket aceita somente UnifiedDataLayer.');\n" +
    '      return;\n' +
    '    }\n' +
    '\n' +
    '    const nextCompetence = competenceFromCanonical(data);\n' +
    '    setCanonicalBase(data);\n' +
    '    if (data) {\n' +
    "      void saveCanonicalState(data).catch(error => console.error('Não foi possível persistir a base canônica no IndexedDB.', error));\n" +
    '      if (nextCompetence && nextCompetence !== activeCompetence) {\n' +
    '        const nextLoad = loadManualConfiguration(localStorage, nextCompetence, { migrateLegacy: false });\n' +
    '        setManualConfigState(nextLoad.config);\n' +
    "        setManualConfigPersistenceError(nextLoad.persistenceError || '');\n" +
    '      }\n' +
    '    } else {\n' +
    "      setManualConfigPersistenceError('');\n" +
    '      void clearCanonicalState();\n' +
    '    }\n' +
    '  };\n' +
    '\n' +
    '  const setManualConfig = (config: ManualConfiguration) => {\n' +
    '    const normalized = normalizeManualConfiguration(config);\n' +
    '    setManualConfigState(normalized);\n' +
    '    if (!activeCompetence) return;\n' +
    '    try {\n' +
    '      saveManualConfiguration(localStorage, activeCompetence, normalized);\n' +
    "      setManualConfigPersistenceError('');\n" +
    '    } catch (error) {\n' +
    "      const message = `Configuração ${activeCompetence}: falha ao persistir alterações (${error instanceof Error ? error.message : 'erro desconhecido'}).`;\n" +
    '      setManualConfigPersistenceError(message);\n' +
    '      console.error(message, error);\n' +
    '    }\n' +
    '  };\n' +
    '\n' +
    '  return (\n' +
    '    <DataContext.Provider value={{ canonical, setCanonical, manualConfig, setManualConfig }}>\n' +
    '      {children}\n' +
    '    </DataContext.Provider>\n' +
    '  );\n' +
    '};\n' +
    '\n' +
    'export const useData = () => useContext(DataContext);\n'
  
      at TestContext.<anonymous> (file:///home/runner/work/blue_jacket/blue_jacket/tests/manual-config-persistence-audit.test.ts:25:10)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: "import React, { createContext, useContext, useMemo, useState, type ReactNode } from 'react';\nimport { applyManualConfiguration, type CanonicalState, DEFAULT_MANUAL_CONFIGURATION, type ManualConfiguration } from '../domain/canonical';\nimport { isUnifiedCanonicalState } from '../services/motors/unifiedEngine';\nimport { clearCanonicalState, loadCanonicalState, saveCanonicalState } from './canonicalPersistence';\nimport { competenceFromCanonical, loadManualConfiguration, normalizeManualConfiguration, saveManualConfiguration } from './competencePersistence';\n\ninterface DataContextType {\n  canonical: CanonicalState | null;\n  setCanonical: (data: CanonicalState | null) => void;\n  manualConfig: ManualConfiguration;\n  setManualConfig: (config: ManualConfiguration) => void;\n}\n\nconst DataContext = createContext<DataContextType>({\n  canonical: null,\n  setCanonical: () => {},\n  manualConfig: DEFAULT_MANUAL_CONFIGURATION,\n  setManualConfig: () => {},\n});\n\nexport const DataProvider = ({ children }: { children: ReactNode }) => {\n  const [canonicalBase, setCanonicalBase] = useState<CanonicalState | null>(null);\n  const [manualConfig, setManualConfigState] = useState<ManualConfiguration>(DEFAULT_MANUAL_CONFIGURATION);\n  const [manualConfigPersistenceError, setManualConfigPersistenceError] = useState('');\n\n  React.useEffect(() => {\n    let cancelled = false;\n    const hydrate = async () => {\n      const stored = await loadCanonicalState();\n      const storedCanonical = stored && isUnifiedCanonicalState(stored) ? stored : null;\n      if (stored && !storedCanonical) await clearCanonicalState();\n      const competence = competenceFromCanonical(storedCanonical);\n      const manualLoad = loadManualConfiguration(localStorage, competence, { migrateLegacy: false });\n      if (cancelled) return;\n      setCanonicalBase(storedCanonical);\n      setManualConfigState(manualLoad.config);\n      setManualConfigPersistenceError(manualLoad.persistenceError || '');\n    };\n    void hydrate().catch(error => console.error('Não foi possível restaurar a base canônica.', error));\n    return () => { cancelled = true; };\n  }, []);\n\n  const activeCompetence = useMemo(() => competenceFromCanonical(canonicalBase), [canonicalBase]);\n  const canonical = useMemo(() => {\n    const configured = applyManualConfiguration(canonicalBase, manualConfig);\n    if (!configured || !manualConfigPersistenceError) return configured;\n    return { ...configured, warnings: Array.from(new Set([...configured.warnings, manualConfigPersistenceError])) };\n  }, [canonicalBase, manualConfig, manualConfigPersistenceError]);\n\n  const setCanonical = (data: CanonicalState | null) => {\n    if (data && !isUnifiedCanonicalState(data)) {\n      console.error('Snapshot rejeitado: o Blue Jacket aceita somente UnifiedDataLayer.');\n      return;\n    }\n\n    const nextCompetence = competenceFromCanonical(data);\n    setCanonicalBase(data);\n    if (data) {\n      void saveCanonicalState(data).catch(error => console.error('Não foi possível persistir a base canônica no IndexedDB.', error));\n      if (nextCompetence && nextCompetence !== activeCompetence) {\n        const nextLoad = loadManualConfiguration(localStorage, nextCompetence, { migrateLegacy: false });\n        setManualConfigState(nextLoad.config);\n        setManualConfigPersistenceError(nextLoad.persistenceError || '');\n      }\n    } else {\n      setManualConfigPersistenceError('');\n      void clearCanonicalState();\n    }\n  };\n\n  const setManualConfig = (config: ManualConfiguration) => {\n    const normalized = normalizeManualConfiguration(config);\n    setManualConfigState(normalized);\n    if (!activeCompetence) return;\n    try {\n      saveManualConfiguration(localStorage, activeCompetence, normalized);\n      setManualConfigPersistenceError('');\n    } catch (error) {\n      const message = `Configuração ${activeCompetence}: falha ao persistir alterações (${error instanceof Error ? error.message : 'erro desconhecido'}).`;\n      setManualConfigPersistenceError(message);\n      console.error(message, error);\n    }\n  };\n\n  return (\n    <DataContext.Provider value={{ canonical, setCanonical, manualConfig, setManualConfig }}>\n      {children}\n    </DataContext.Provider>\n  );\n};\n\nexport const useData = () => useContext(DataContext);\n",
    expected: /warnings:Array\.from\(new Set\(\[\.\.\.normalized\.warnings,manualConfigPersistenceError\]\)\)/,
    operator: 'match',
    diff: 'simple'
  }

test at tests/operational-sources.test.ts:1:1
✖ tests/operational-sources.test.ts (273.006099ms)
  'test failed'

## Typecheck

> blue-jacket@0.1.0 typecheck
> tsc --noEmit


## Build

> blue-jacket@0.1.0 build
> tsc --noEmit && vite build

[36mvite v8.2.1 [32mbuilding client environment for production...[36m[39m
[2Ktransforming...✓ 79 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.71 kB │ gzip:   0.40 kB
dist/assets/index-CYfqs_hg.css   28.07 kB │ gzip:   5.80 kB
dist/assets/index-e_sUjV3-.js   987.12 kB │ gzip: 309.41 kB

[32m✓ built in 435ms[39m
[33m[plugin builtin:vite-reporter] 
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.[39m

## Resíduos runtime
