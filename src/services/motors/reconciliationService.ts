import type {
  CanonicalReconciliation,
  CanonicalReconciliationCheck,
  CanonicalState,
  ReconciliationLevel,
  ReconciliationStatus,
} from '../../domain/canonical';
import type { CustomerIntelligenceSupport } from '../../domain/customerIntelligenceTypes';
import type { DataQualityIssue, UnifiedDataLayer } from '../../domain/unified';

const sum = <T>(rows: T[], value: (row: T) => number) => rows.reduce((total, row) => total + (Number(value(row)) || 0), 0);
const close = (left: number, right: number, tolerance: number) => Math.abs(left - right) <= tolerance;

function numericCheck(args: {
  id: string;
  level: ReconciliationLevel;
  label: string;
  expected: number;
  calculated: number;
  tolerance?: number;
  source: string;
  note?: string;
  statusWhenDifferent?: ReconciliationStatus;
}): CanonicalReconciliationCheck {
  const tolerance = args.tolerance ?? 0;
  const difference = args.calculated - args.expected;
  return {
    id: args.id,
    level: args.level,
    label: args.label,
    expected: args.expected,
    calculated: args.calculated,
    difference,
    tolerance,
    status: close(args.expected, args.calculated, tolerance) ? 'OK' : (args.statusWhenDifferent || 'DIVERGENT'),
    source: args.source,
    note: args.note,
  };
}

function textCheck(args: {
  id: string;
  level: ReconciliationLevel;
  label: string;
  expected: string;
  calculated: string;
  source: string;
  note?: string;
  statusWhenDifferent?: ReconciliationStatus;
}): CanonicalReconciliationCheck {
  return {
    id: args.id,
    level: args.level,
    label: args.label,
    expected: args.expected,
    calculated: args.calculated,
    difference: null,
    tolerance: 0,
    status: args.expected === args.calculated ? 'OK' : (args.statusWhenDifferent || 'DIVERGENT'),
    source: args.source,
    note: args.note,
  };
}

function blocked(id: string, level: ReconciliationLevel, label: string, source: string, note: string): CanonicalReconciliationCheck {
  return { id, level, label, expected: null, calculated: null, difference: null, tolerance: 0, status: 'BLOCKED', source, note };
}

const issueCount = (issues: DataQualityIssue[], ...codes: string[]) => {
  const wanted = new Set(codes);
  return issues.filter(issue => wanted.has(issue.code)).length;
};

function internalChecks(canonical: CanonicalState, unified: UnifiedDataLayer): CanonicalReconciliationCheck[] {
  const checks: CanonicalReconciliationCheck[] = [];
  const assignedTarget = sum(unified.targets.filter(row => row.assignmentStatus === 'RESOLVED'), row => row.salesTarget);
  const unassignedTarget = sum(unified.targets.filter(row => row.assignmentStatus === 'UNRESOLVED_RCA'), row => row.salesTarget);
  const officialRcaIds = new Set(unified.rcas.filter(row => row.isColgate).map(row => row.rcaCanonicalId));
  const resolvedOfficialSales = sum(unified.salesFacts.filter(row => row.rcaCanonicalId && officialRcaIds.has(row.rcaCanonicalId)), row => row.value);
  const validCnpjSales = sum(unified.salesFacts.filter(row => Boolean(row.cnpj)), row => row.value);
  const historicalApplicable = unified.historicalSalesFacts.filter(row => row.movementClass === 'SALE' || row.movementClass === 'RETURN');
  const historicalExpected = sum(historicalApplicable.filter(row => row.movementClass === 'SALE'), row => row.valueRaw)
    - sum(historicalApplicable.filter(row => row.movementClass === 'RETURN'), row => row.valueRaw);
  const historicalCalculated = sum(historicalApplicable, row => row.signedValue);
  const inboundExpectedCases = sum(unified.inboundOrders, row => row.orderQtyCases + row.billQtyCases);
  const inboundCalculatedCases = sum(unified.inboundOrders, row => row.pipelineQtyCases);
  const classifiedLineSales = sum(canonical.lines, row => row.total);
  const unclassifiedLineSales = Math.max(canonical.sellOut.total - classifiedLineSales, 0);
  const networkSales = sum(canonical.networks, row => row.total);

  checks.push(numericCheck({
    id: 'INTERNAL_SELL_OUT_CLOSURE', level: 'INTERNAL', label: 'Sell Out = Faturado + A Faturar',
    expected: canonical.sellOut.invoiced + canonical.sellOut.toInvoice, calculated: canonical.sellOut.total, tolerance: .01,
    source: 'Projeção canônica', note: 'Confere o fechamento do KPI sem reler arquivo bruto.',
  }));
  checks.push(numericCheck({
    id: 'INTERNAL_SALES_FACT_PROJECTION', level: 'INTERNAL', label: 'SALES_FACT fecha com transações projetadas',
    expected: sum(unified.salesFacts, row => row.value), calculated: sum(canonical.transactions, row => row.value), tolerance: .01,
    source: 'SALES_FACT → CanonicalState', note: 'Nenhum valor de venda pode desaparecer na projeção de tela/exportação.',
  }));
  checks.push(numericCheck({
    id: 'INTERNAL_STOCK_PROJECTION', level: 'INTERNAL', label: 'ITEM_MASTER fecha com estoque físico projetado',
    expected: sum(unified.items, row => row.physicalStockUnits), calculated: canonical.stock.physicalUnits, tolerance: .001,
    source: 'ITEM_MASTER → Estoque canônico', note: 'Qt.Est. do 105 permanece a quantidade física canônica.',
  }));
  checks.push(numericCheck({
    id: 'INTERNAL_TARGET_CLOSURE', level: 'INTERNAL', label: 'Meta indústria = atribuída + não atribuída',
    expected: sum(unified.targets, row => row.salesTarget), calculated: assignedTarget + unassignedTarget, tolerance: .01,
    source: 'TARGET_FACT', note: 'Meta sem RCA resolvido permanece no total e nunca é redistribuída silenciosamente.',
  }));
  checks.push(numericCheck({
    id: 'INTERNAL_VENDOR_PROJECTION', level: 'INTERNAL', label: 'Venda atribuída a RCA oficial fecha com vendedores',
    expected: resolvedOfficialSales, calculated: sum(canonical.vendors, row => row.total), tolerance: .01,
    source: 'SALES_FACT × RCA_MASTER', note: 'Vendas sem RCA oficial continuam no Sell Out, mas não são inventadas em um vendedor.',
  }));
  checks.push(numericCheck({
    id: 'INTERNAL_CUSTOMER_PROJECTION', level: 'INTERNAL', label: 'Venda com CNPJ válido fecha com clientes',
    expected: validCnpjSales, calculated: sum(canonical.clients, row => row.total), tolerance: .01,
    source: 'SALES_FACT × CUSTOMER_MASTER', note: 'Venda sem CNPJ canônico é preservada no total e fica fora da positivação/visão por cliente.',
  }));
  checks.push(numericCheck({
    id: 'INTERNAL_NETWORK_PROJECTION', level: 'INTERNAL', label: 'Redes + SEM REDE fecham venda com CNPJ válido',
    expected: validCnpjSales, calculated: networkSales, tolerance: .01,
    source: 'SALES_FACT × PREMISSAS', note: 'CNPJ sem Rede Premissas permanece explicitamente no bucket SEM REDE; Roteiro não é usado como fallback de taxonomia.',
  }));
  checks.push(numericCheck({
    id: 'INTERNAL_LINE_CLOSURE', level: 'INTERNAL', label: 'Linhas classificadas + sem classificação = Sell Out',
    expected: canonical.sellOut.total, calculated: classifiedLineSales + unclassifiedLineSales, tolerance: .01,
    source: 'SALES_FACT × ITEM_MASTER', note: `Venda classificada nas cinco linhas: ${classifiedLineSales.toFixed(2)}; sem classificação explícita: ${unclassifiedLineSales.toFixed(2)}.`,
  }));
  checks.push(numericCheck({
    id: 'INTERNAL_LINE_UNCLASSIFIED', level: 'INTERNAL', label: 'Venda sem classificação de linha',
    expected: 0, calculated: unclassifiedLineSales, tolerance: .01, statusWhenDifferent: 'BLOCKED',
    source: 'SALES_FACT × ITEM_MASTER', note: unclassifiedLineSales > .01 ? 'Há venda preservada no Sell Out sem item/linha canônica suficiente. O motor não inventa uma das cinco linhas para fechar o total.' : 'Todo o Sell Out foi classificado em uma das cinco linhas comerciais.',
  }));
  checks.push(numericCheck({
    id: 'INTERNAL_HISTORICAL_SIGN', level: 'INTERNAL', label: 'Histórico líquido aplica sinal de devolução',
    expected: historicalExpected, calculated: historicalCalculated, tolerance: .01,
    source: 'HISTORICAL_SALES_FACT', note: 'SALE entra positivo; RETURN entra negativo; OTHER não participa do Sell Out histórico.',
  }));
  checks.push(numericCheck({
    id: 'INTERNAL_INBOUND_PIPELINE', level: 'INTERNAL', label: 'Carteira = Order Qty + Bill Qty',
    expected: inboundExpectedCases, calculated: inboundCalculatedCases, tolerance: .001,
    source: 'INBOUND_ORDER_FACT', note: 'Carteira Colgate é pipeline de entrada e nunca compõe Sell Out.',
  }));
  return checks;
}

function sourceChecks(unified: UnifiedDataLayer): CanonicalReconciliationCheck[] {
  const checks: CanonicalReconciliationCheck[] = [];
  const sourceTypes = new Set(unified.sources.map(source => source.sourceType));
  const has = (sourceType: string) => sourceTypes.has(sourceType);

  const unresolved105 = issueCount(unified.qualityIssues, 'STOCK_105_CODE_NOT_IN_ITEM_MASTER');
  checks.push(has('105') && has('286')
    ? numericCheck({
        id: 'SOURCE_105_286_IDENTITY', level: 'SOURCE', label: 'Posição 105 encontra Cadastro 286',
        expected: 0, calculated: unresolved105, source: '105 × 286', statusWhenDifferent: 'BLOCKED',
        note: unresolved105 ? 'Há códigos do 105 sem cadastro 286 na fotografia atual. O estoque desses fatos não é atribuído silenciosamente.' : 'Todos os códigos físicos carregados encontraram identidade no ITEM_MASTER.',
      })
    : blocked('SOURCE_105_286_IDENTITY', 'SOURCE', 'Posição 105 encontra Cadastro 286', '105 × 286', 'Carregue 105 e 286 na base unificada para executar este teste.'));

  const salesItemUnresolved = issueCount(unified.qualityIssues, 'SALES_ITEM_UNRESOLVED');
  checks.push(has('8022') && has('286')
    ? numericCheck({
        id: 'SOURCE_8022_ITEM_IDENTITY', level: 'SOURCE', label: '8022 encontra ITEM_MASTER',
        expected: 0, calculated: salesItemUnresolved, source: '8022 × ITEM_MASTER', statusWhenDifferent: 'BLOCKED',
        note: salesItemUnresolved ? 'As vendas são preservadas, mas existem itens sem identidade canônica na fotografia carregada.' : 'As vendas atuais encontram identidade de item sem descarte.',
      })
    : blocked('SOURCE_8022_ITEM_IDENTITY', 'SOURCE', '8022 encontra ITEM_MASTER', '8022 × ITEM_MASTER', 'Carregue 8022 e Cadastro 286 para executar o teste de identidade de produto.'));

  const salesRcaUnresolved = issueCount(unified.qualityIssues, 'SALES_RCA_NOT_OFFICIAL');
  checks.push(has('8022') && has('NOVOS_RCAS')
    ? numericCheck({
        id: 'SOURCE_8022_RCA_IDENTITY', level: 'SOURCE', label: '8022 encontra RCA_MASTER oficial',
        expected: 0, calculated: salesRcaUnresolved, source: '8022 × NOVOS RCAS', statusWhenDifferent: 'BLOCKED',
        note: salesRcaUnresolved ? 'A venda continua no total; vendedor não oficial não é criado automaticamente.' : 'Todos os códigos de vendedor aplicáveis encontraram RCA oficial.',
      })
    : blocked('SOURCE_8022_RCA_IDENTITY', 'SOURCE', '8022 encontra RCA_MASTER oficial', '8022 × NOVOS RCAS', 'Carregue 8022 e Novos RCAs para executar o teste.'));

  const unresolvedTargetRows = unified.targets.filter(row => row.assignmentStatus === 'UNRESOLVED_RCA');
  const unassignedTargets = unresolvedTargetRows.length;
  const unresolvedTargetCodes = Array.from(new Set(unresolvedTargetRows.map(row => row.legacyRcaCode).filter(Boolean)));
  const unresolvedTargetPreview = unresolvedTargetCodes.slice(0, 8).join(', ');
  const unresolvedTargetSuffix = unresolvedTargetCodes.length > 8 ? ` e mais ${unresolvedTargetCodes.length - 8}` : '';
  checks.push(has('BUSSOLA') && has('NOVOS_RCAS')
    ? numericCheck({
        id: 'SOURCE_TARGET_RCA_IDENTITY', level: 'SOURCE', label: 'Bússola encontra RCA legado oficial',
        expected: 0, calculated: unassignedTargets, source: 'Bússola × NOVOS RCAS', statusWhenDifferent: 'BLOCKED',
        note: unassignedTargets
          ? `Há ${unassignedTargets} meta(s) sem RCA oficial. Código(s) legados não encontrados: ${unresolvedTargetPreview || 'não informado'}${unresolvedTargetSuffix}. Atualize a Bússola ou preserve o código legado no NOVOS RCAS e reprocesse o lote; a meta permanece em Meta Indústria e não é redistribuída.`
          : 'Todas as metas carregadas foram atribuídas por código legado oficial.',
      })
    : blocked('SOURCE_TARGET_RCA_IDENTITY', 'SOURCE', 'Bússola encontra RCA legado oficial', 'Bússola × NOVOS RCAS', 'Carregue Bússola e Novos RCAs para executar o teste.'));

  if (has('LISTA_PRECO_COLGATE')) {
    const materialized = unified.items.filter(item => Boolean(item.sourceKeys?.LISTA_PRECO)).length;
    checks.push(textCheck({
      id: 'SOURCE_COLGATE_PRICE_LIST_MATERIALIZED', level: 'SOURCE', label: 'Lista de Preço Colgate materializada no ITEM_MASTER',
      expected: 'COM ITENS', calculated: materialized > 0 ? 'COM ITENS' : 'VAZIA', source: 'Lista de Preço Colgate',
      note: `${materialized} item(ns) receberam identidade/logística da lista industrial.`,
    }));
  } else {
    checks.push(blocked('SOURCE_COLGATE_PRICE_LIST_MATERIALIZED', 'SOURCE', 'Lista de Preço Colgate materializada no ITEM_MASTER', 'Lista de Preço Colgate', 'Fonte não carregada na fotografia atual.'));
  }

  // Ausências transitórias de preço e conversão ficam registradas como INFO
  // no painel de qualidade. Não bloqueiam a reconciliação: o dado canônico é
  // preservado e a mensagem desaparece automaticamente na próxima carga.

  const has310 = has('310');
  const has379 = has('379');
  const historicalFailures = issueCount(unified.qualityIssues, 'HISTORICAL_310_RECONCILIATION_FAILURE');
  checks.push(has310 && has379
    ? numericCheck({
        id: 'SOURCE_310_379_RECONCILIATION', level: 'SOURCE', label: '310 é reproduzido pelo Motor Histórico 379',
        expected: 0, calculated: historicalFailures, source: '310 × 379',
        note: historicalFailures ? 'A divergência permanece explícita para diagnóstico de versão/fotografia ou cálculo; nenhuma linha é corrigida por aproximação.' : 'Nenhuma divergência agregada 310 × 379 foi sinalizada.',
      })
    : blocked('SOURCE_310_379_RECONCILIATION', 'SOURCE', '310 é reproduzido pelo Motor Histórico 379', '310 × 379', 'Carregue 310 e 379 para executar a reconciliação histórica.'));

  return checks;
}

function spreadsheetChecks(unified: UnifiedDataLayer, support: CustomerIntelligenceSupport): CanonicalReconciliationCheck[] {
  const sourceTypes = new Set(unified.sources.map(source => source.sourceType));
  const has310 = sourceTypes.has('310') && support.purchases.length > 0;
  const has379 = sourceTypes.has('379') && unified.historicalCustomerProduct.length > 0;
  const labels = [
    ['SPREADSHEET_310_NET_VALUE', '310 Valor Compras = vendas − devoluções do 379'],
    ['SPREADSHEET_310_RETURN_VALUE', '310 V.Devoluções = devoluções do 379'],
    ['SPREADSHEET_310_VOLUMES', '310 Volumes = ABS(quantidade líquida 379)'],
    ['SPREADSHEET_310_RETURN_VOLUME', '310 Vol Dev = quantidade devolvida 379'],
    ['SPREADSHEET_310_PURCHASE_COUNT', '310 Qtd Cpa = NFs de venda distintas 379'],
  ] as const;
  if (!has310 || !has379) {
    const missing = !has310 && !has379 ? '310 e 379 não estão materializados' : !has310 ? '310 não está materializado' : '379 não está materializado';
    return labels.map(([id, label]) => blocked(id, 'SPREADSHEET', label, 'Planilha 310 × Motor Histórico 379', `${missing}; o teste não recebe OK sem referência.`));
  }

  const aggregate = new Map(unified.historicalCustomerProduct.map(row => [`${row.cnpj}:${row.legacyProductCode}`, row]));
  let missingPairs = 0;
  let netValueMismatch = 0;
  let returnValueMismatch = 0;
  let volumesMismatch = 0;
  let returnVolumeMismatch = 0;
  let purchaseCountMismatch = 0;

  for (const purchase of support.purchases) {
    const legacy = purchase.legacyProductCode || purchase.winthorCode;
    const row = aggregate.get(`${purchase.cnpj}:${legacy}`);
    if (!row) { missingPairs += 1; continue; }
    if (!close(purchase.netValue, row.netSalesValue, .02)) netValueMismatch += 1;
    if (!close(purchase.returnValue, row.returnValue, .02)) returnValueMismatch += 1;
    if (!close(purchase.volumes, Math.abs(row.netSignedUnits), .001)) volumesMismatch += 1;
    if (!close(purchase.returnVolume, row.returnUnits, .001)) returnVolumeMismatch += 1;
    if (!close(purchase.quantity, row.purchaseInvoiceCount, .001)) purchaseCountMismatch += 1;
  }

  const withMissing = (mismatch: number) => mismatch + missingPairs;
  const note = missingPairs ? `${missingPairs} combinação(ões) CNPJ × produto do 310 não foram encontradas no agregado 379 e contam como divergência em cada regra.` : 'Comparação feita por CNPJ × código legado, sem usar Código Winthor atual como substituto.';
  return [
    numericCheck({ id: labels[0][0], level: 'SPREADSHEET', label: labels[0][1], expected: 0, calculated: withMissing(netValueMismatch), source: 'Planilha 310 × Motor Histórico 379', note }),
    numericCheck({ id: labels[1][0], level: 'SPREADSHEET', label: labels[1][1], expected: 0, calculated: withMissing(returnValueMismatch), source: 'Planilha 310 × Motor Histórico 379', note }),
    numericCheck({ id: labels[2][0], level: 'SPREADSHEET', label: labels[2][1], expected: 0, calculated: withMissing(volumesMismatch), source: 'Planilha 310 × Motor Histórico 379', note: `${note} Volumes usa ABS(vendas − devoluções); nunca quantidade bruta de venda.` }),
    numericCheck({ id: labels[3][0], level: 'SPREADSHEET', label: labels[3][1], expected: 0, calculated: withMissing(returnVolumeMismatch), source: 'Planilha 310 × Motor Histórico 379', note }),
    numericCheck({ id: labels[4][0], level: 'SPREADSHEET', label: labels[4][1], expected: 0, calculated: withMissing(purchaseCountMismatch), source: 'Planilha 310 × Motor Histórico 379', note: `${note} Qtd Cpa é contagem de NFs de SALE distintas por CNPJ × produto.` }),
  ];
}

export function buildCanonicalReconciliation(
  canonical: CanonicalState,
  unified: UnifiedDataLayer,
  support: CustomerIntelligenceSupport,
): CanonicalReconciliation {
  const checks = [
    ...internalChecks(canonical, unified),
    ...sourceChecks(unified),
    ...spreadsheetChecks(unified, support),
  ];
  return {
    checks,
    networkAssignments: canonical.reconciliation?.networkAssignments || [],
    relationships: canonical.reconciliation?.relationships,
    blockedRules: checks.filter(check => check.status === 'BLOCKED').map(check => `${check.label}: ${check.note || 'referência indisponível'}`),
  };
}
