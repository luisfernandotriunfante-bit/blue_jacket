import type { CanonicalInventoryProduct, CanonicalProductSupport, CanonicalSalesTransaction } from './canonical';

export type ReservationPositionMode = 'POSICAO_LIQUIDA' | 'POSICAO_BRUTA' | 'INDETERMINADA' | 'SEM_EVIDENCIA';
export type StockMovementDirection = 'ENTRADA' | 'SAIDA';
export type StockMovementStage = 'REALIZADA' | 'PREVISTA' | 'RESERVADA';
export type StockMovementKind =
  | 'ENTRADA_REALIZADA'
  | 'ENTRADA_PREVISTA_CARTEIRA'
  | 'DEVOLUCAO_CLIENTE'
  | 'TRANSFERENCIA_RECEBIDA'
  | 'AJUSTE_POSITIVO'
  | 'SAIDA_FATURADA'
  | 'SAIDA_RESERVADA_PEDIDO'
  | 'DEVOLUCAO_FORNECEDOR'
  | 'TRANSFERENCIA_ENVIADA'
  | 'AJUSTE_NEGATIVO';

export type StockAlertSeverity = 'critical' | 'warning' | 'info';
export type StockAlertKind =
  | 'RUPTURA'
  | 'ESTOQUE_ZERADO'
  | 'RISCO_RUPTURA'
  | 'BAIXO_ESTOQUE'
  | 'RECOMPOSICAO_PREVISTA'
  | 'EXCESSO_ESTOQUE'
  | 'SEM_WINTHOR'
  | 'SEM_EAN'
  | 'SEM_CONVERSAO_CAIXA'
  | 'RESERVADO_ACIMA_FISICO'
  | 'DIVERGENCIA_QUANTIDADE'
  | 'LANCAMENTO_SEM_ESTOQUE'
  | 'LANCAMENTO_SEM_VENDA';

export interface StockAlertConfiguration {
  zeroStockAsRupture: boolean;
  riskCoverageDays: number | null;
  lowCoverageDays: number | null;
  excessCoverageDays: number | null;
}

export const DEFAULT_STOCK_ALERT_CONFIGURATION: StockAlertConfiguration = {
  zeroStockAsRupture: true,
  riskCoverageDays: null,
  lowCoverageDays: null,
  excessCoverageDays: null,
};

export interface StockMovement {
  id: string;
  direction: StockMovementDirection;
  stage: StockMovementStage;
  kind: StockMovementKind;
  status: string;
  movement: string;
  date: string;
  document: string;
  order: string;
  invoice: string;
  sku: string;
  ean: string;
  product: string;
  partner: string;
  partnerDocument: string;
  cases: number;
  looseUnits: number;
  totalUnits: number;
  value: number;
  origin: string;
}

export interface StockAlert {
  id: string;
  kind: StockAlertKind;
  severity: StockAlertSeverity;
  sku: string;
  ean: string;
  product: string;
  message: string;
}

export interface StockProductView {
  code: string;
  factoryCode: string;
  ean: string;
  description: string;
  brand: string;
  category: string;
  subcategory: string;
  line: string;
  /** Un/CX interno, exclusivamente para decompor o físico do 105. */
  unitsPerCase: number;
  /** Un/CX indústria, exclusivamente para converter a Carteira Colgate. */
  industryUnitsPerCase: number;
  positionUnits: number;
  physicalCases: number;
  looseUnits: number;
  physicalTotalUnits: number;
  equivalentCases: number | null;
  reservedUnits: number;
  availableUnits: number;
  pendingCases: number;
  pendingUnits: number;
  projectedUnits: number;
  costUnit: number;
  saleUnit: number;
  positionCostValue: number;
  positionSaleValue: number;
  soldUnits: number;
  averageDailyUnits: number;
  coverageDays: number | null;
  projectedCoverageDays: number | null;
  grossKg: number;
  isLaunch: boolean;
  hasWinthor: boolean;
  quantityDifference: number;
  alerts: StockAlert[];
}

export interface ReservationReconciliation {
  mode: ReservationPositionMode;
  evidenceRows: number;
  grossMatches: number;
  netMatches: number;
  conflictingRows: number;
  unresolvedReservedUnits: number;
  note: string;
}

export type StockReconciliationStatus = 'OK' | 'DIVERGENT' | 'BLOCKED';
export interface StockReconciliationCheck {
  id: string;
  label: string;
  expected: number | string | null;
  calculated: number | string | null;
  difference: number | null;
  status: StockReconciliationStatus;
  source: string;
  note?: string;
}

export interface StockPresentationSummary {
  costValue: number;
  saleValue: number;
  physicalUnits: number;
  physicalCases: number;
  looseUnits: number;
  /** Unidades físicas do 105 sem fator interno suficiente para decomposição em caixas/avulsas. */
  unconvertedPhysicalUnits: number;
  reservedUnits: number;
  availableUnits: number;
  pendingUnits: number;
  pendingCases: number;
  projectedUnits: number;
  skuCount: number;
  zeroSkuCount: number;
  launchCount: number;
  noWinthorCount: number;
  quantityDifferenceUnits: number;
}

export interface StockPresentation {
  products: StockProductView[];
  movements: StockMovement[];
  alerts: StockAlert[];
  reservation: ReservationReconciliation;
  summary: StockPresentationSummary;
  reconciliation: StockReconciliationCheck[];
}

export interface StockPresentationInput {
  inventory: CanonicalInventoryProduct[];
  productSupport?: CanonicalProductSupport[];
  transactions?: CanonicalSalesTransaction[];
  businessDaysElapsed?: number;
  stockCostValue?: number;
  stockSaleValue?: number;
  /** Indica que a posição física canônica veio do 105. */
  hasStock105?: boolean;
  /** @deprecated 8013 é somente auditoria logística e não define estoque físico. */
  hasStock8013?: boolean;
  alertConfiguration?: StockAlertConfiguration;
}

type InventoryCanonicalPacking = CanonicalInventoryProduct & {
  internalUnitsPerCase?: number | null;
  industryUnitsPerCase?: number | null;
  physicalSource105?: boolean;
};

const TOLERANCE = 0.001;
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
const code = (value: unknown) => String(value ?? '').trim().replace(/^0+/, '');
const nonNegative = (value: unknown) => Math.max(Number(value) || 0, 0);

export function isOperationalNoWinthor(product: Pick<StockProductView, 'hasWinthor' | 'pendingUnits' | 'pendingCases'>): boolean {
  return !product.hasWinthor && (nonNegative(product.pendingUnits) > 0 || nonNegative(product.pendingCases) > 0);
}

export function prioritizeStockAlerts(alerts: StockAlert[], limit = 30): StockAlert[] {
  const rank: Record<StockAlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return [...alerts]
    .sort((left, right) => rank[left.severity] - rank[right.severity]
      || left.kind.localeCompare(right.kind)
      || left.sku.localeCompare(right.sku)
      || left.id.localeCompare(right.id))
    .slice(0, Math.max(Math.trunc(limit), 0));
}

function numericCheck(input: { id: string; label: string; expected: number; calculated: number; source: string; tolerance?: number; note?: string }): StockReconciliationCheck {
  const tolerance = input.tolerance ?? TOLERANCE;
  const difference = input.calculated - input.expected;
  return { id: input.id, label: input.label, expected: input.expected, calculated: input.calculated, difference, status: Math.abs(difference) <= tolerance ? 'OK' : 'DIVERGENT', source: input.source, note: input.note };
}

function blockedCheck(id: string, label: string, source: string, note: string, calculated: number | string | null = null): StockReconciliationCheck {
  return { id, label, expected: null, calculated, difference: null, status: 'BLOCKED', source, note };
}

function buildProductIndex(inventory: CanonicalInventoryProduct[]) {
  const byCode = new Map<string, CanonicalInventoryProduct>();
  const byFactory = new Map<string, CanonicalInventoryProduct>();
  const byEan = new Map<string, CanonicalInventoryProduct>();
  inventory.forEach(item => {
    const internal = code(item.code); const factory = code(item.factoryCode); const ean = digits(item.ean);
    if (internal) byCode.set(internal, item);
    if (factory && !byFactory.has(factory)) byFactory.set(factory, item);
    if (ean && !byEan.has(ean)) byEan.set(ean, item);
  });
  return { byCode, byFactory, byEan };
}

function buildSupportIndex(productSupport: CanonicalProductSupport[] = []) {
  const bySku = new Map<string, CanonicalProductSupport>();
  const byEan = new Map<string, CanonicalProductSupport>();
  productSupport.forEach(item => {
    const sku = code(item.sku); const ean = digits(item.ean);
    if (sku && !bySku.has(sku)) bySku.set(sku, item);
    if (ean && !byEan.has(ean)) byEan.set(ean, item);
  });
  return { bySku, byEan };
}

function resolveInventoryProduct(transaction: CanonicalSalesTransaction, index: ReturnType<typeof buildProductIndex>): CanonicalInventoryProduct | undefined {
  const internal = code(transaction.internalProductCode); const factory = code(transaction.manufacturerCode); const ean = digits(transaction.ean);
  return (internal ? index.byCode.get(internal) : undefined) || (factory ? index.byFactory.get(factory) : undefined) || (ean ? index.byEan.get(ean) : undefined);
}

function supportForProduct(item: CanonicalInventoryProduct, support: ReturnType<typeof buildSupportIndex>): CanonicalProductSupport | undefined {
  const factory = code(item.factoryCode); const ean = digits(item.ean);
  return (factory ? support.bySku.get(factory) : undefined) || (ean ? support.byEan.get(ean) : undefined);
}

function hasExplicitCanonicalPacking(item: CanonicalInventoryProduct): boolean {
  return Object.prototype.hasOwnProperty.call(item, 'internalUnitsPerCase') || Object.prototype.hasOwnProperty.call(item, 'industryUnitsPerCase');
}

function internalFactor(item: CanonicalInventoryProduct, master?: CanonicalProductSupport): number {
  const extended = item as InventoryCanonicalPacking;
  const explicit = nonNegative(extended.internalUnitsPerCase);
  if (explicit > 0) return explicit;
  // Compatibilidade apenas para objetos de teste/snapshots anteriores; a UnifiedDataLayer atual sempre materializa os dois campos.
  return hasExplicitCanonicalPacking(item) ? 0 : nonNegative(master?.unitsPerCase);
}

function industryFactor(item: CanonicalInventoryProduct, master?: CanonicalProductSupport): number {
  const extended = item as InventoryCanonicalPacking;
  const explicit = nonNegative(extended.industryUnitsPerCase);
  if (explicit > 0) return explicit;
  return hasExplicitCanonicalPacking(item) ? 0 : nonNegative(master?.unitsPerCase);
}

function reservationLabel(mode: ReservationPositionMode): string {
  if (mode === 'POSICAO_BRUTA') return 'Posição 105 física; reserva 8022 subtraída exatamente uma vez';
  if (mode === 'POSICAO_LIQUIDA') return 'Posição previamente líquida da reserva';
  if (mode === 'INDETERMINADA') return 'Relação entre posição e reserva não pôde ser determinada';
  return 'Sem posição 105 comprovada para calcular disponibilidade';
}

function buildReservation(inventory: CanonicalInventoryProduct[], transactions: CanonicalSalesTransaction[], hasStock105: boolean) {
  const index = buildProductIndex(inventory);
  const reservedByCode = new Map<string, number>();
  let unresolvedReservedUnits = 0;
  transactions.forEach(transaction => {
    if (transaction.status !== 'A FATURAR') return;
    const units = nonNegative(transaction.units); if (units <= 0) return;
    const item = resolveInventoryProduct(transaction, index);
    if (!item) { unresolvedReservedUnits += units; return; }
    reservedByCode.set(item.code, (reservedByCode.get(item.code) || 0) + units);
  });

  if (!hasStock105) {
    return {
      reservedByCode,
      reconciliation: {
        mode: 'SEM_EVIDENCIA' as ReservationPositionMode,
        evidenceRows: reservedByCode.size,
        grossMatches: 0,
        netMatches: 0,
        conflictingRows: 0,
        unresolvedReservedUnits,
        note: `${reservationLabel('SEM_EVIDENCIA')}. O disponível não é reduzido sem uma posição física canônica.`,
      },
    };
  }

  return {
    reservedByCode,
    reconciliation: {
      mode: 'POSICAO_BRUTA' as ReservationPositionMode,
      evidenceRows: reservedByCode.size,
      grossMatches: reservedByCode.size,
      netMatches: 0,
      conflictingRows: 0,
      unresolvedReservedUnits,
      note: `${reservationLabel('POSICAO_BRUTA')}. O 8013 não decide o saldo físico; seus campos de estoque permanecem apenas como auditoria logística.`,
    },
  };
}

function createAlert(kind: StockAlertKind, severity: StockAlertSeverity, item: Pick<StockProductView, 'code' | 'ean' | 'description'>, message: string, idSuffix = ''): StockAlert {
  return { id: `${kind}:${item.code}${idSuffix ? `:${idSuffix}` : ''}`, kind, severity, sku: item.code, ean: item.ean, product: item.description, message };
}

function buildAlertsForProduct(product: Omit<StockProductView, 'alerts'>, configuration: StockAlertConfiguration): StockAlert[] {
  const alerts: StockAlert[] = [];
  if (isOperationalNoWinthor(product)) alerts.push(createAlert('SEM_WINTHOR', 'warning', product, 'Item da Carteira sem correspondência confirmada no Cadastro 286 / Winthor.'));
  if (!product.ean) alerts.push(createAlert('SEM_EAN', 'warning', product, 'Produto sem EAN conciliado.'));
  if (product.physicalTotalUnits > 0 && product.unitsPerCase <= 0) alerts.push(createAlert('SEM_CONVERSAO_CAIXA', 'warning', product, 'Físico do 105 preservado em unidades, mas falta Un/CX interno do 8013 para decompor caixas completas e avulsas.', 'INTERNO'));
  if (product.pendingCases > 0 && product.industryUnitsPerCase <= 0) alerts.push(createAlert('SEM_CONVERSAO_CAIXA', 'warning', product, 'Carteira preservada em caixas, mas falta Un/CX indústria da Lista de Preço Colgate para convertê-la em unidades.', 'INDUSTRIA'));
  if (product.reservedUnits > product.physicalTotalUnits + TOLERANCE) alerts.push(createAlert('RESERVADO_ACIMA_FISICO', 'critical', product, 'Quantidade reservada no 8022 A Faturar supera o estoque físico 105.'));
  if (Math.abs(product.quantityDifference) > TOLERANCE) alerts.push(createAlert('DIVERGENCIA_QUANTIDADE', 'critical', product, `Caixas internas × Un/CX interno + avulsas diverge do físico 105 em ${product.quantityDifference.toLocaleString('pt-BR')} un.`));
  if (product.isLaunch && product.physicalTotalUnits <= 0) alerts.push(createAlert('LANCAMENTO_SEM_ESTOQUE', 'warning', product, 'Lançamento oficial sem estoque físico identificado.'));
  if (product.isLaunch && product.physicalTotalUnits > 0 && product.soldUnits <= 0) alerts.push(createAlert('LANCAMENTO_SEM_VENDA', 'info', product, 'Lançamento com estoque e sem saída faturada na competência.'));
  // Ruptura exige item Winthor. Produto sem Winthor continua visível como bloqueio cadastral e não vira ruptura artificial.
  if (product.hasWinthor && product.physicalTotalUnits <= 0) {
    if (configuration.zeroStockAsRupture) alerts.push(createAlert('RUPTURA', 'critical', product, 'Estoque zerado; classificado como ruptura conforme a regra validada do módulo de Estoque.'));
    else alerts.push(createAlert('ESTOQUE_ZERADO', 'warning', product, 'Estoque físico zerado; a classificação de ruptura foi desativada explicitamente na configuração do Estoque.'));
  }
  const coverage = product.coverageDays;
  if (coverage !== null) {
    const risk = configuration.riskCoverageDays; const low = configuration.lowCoverageDays; const excess = configuration.excessCoverageDays;
    if (risk !== null && coverage < risk) alerts.push(createAlert('RISCO_RUPTURA', 'critical', product, `Cobertura de ${coverage.toFixed(1)} dias abaixo do limite configurado de risco (${risk} dias).`));
    else if (low !== null && coverage < low) alerts.push(createAlert('BAIXO_ESTOQUE', 'warning', product, `Cobertura de ${coverage.toFixed(1)} dias abaixo do limite configurado de baixo estoque (${low} dias).`));
    if (excess !== null && coverage > excess) alerts.push(createAlert('EXCESSO_ESTOQUE', 'info', product, `Cobertura de ${coverage.toFixed(1)} dias acima do limite configurado de excesso (${excess} dias).`));
    const recoveryTarget = [risk, low].filter((value): value is number => value !== null && value > 0).sort((a, b) => b - a)[0];
    if (recoveryTarget && coverage < recoveryTarget && product.pendingUnits > 0 && product.projectedCoverageDays !== null && product.projectedCoverageDays >= recoveryTarget) alerts.push(createAlert('RECOMPOSICAO_PREVISTA', 'info', product, `A Carteira eleva a cobertura projetada para ${product.projectedCoverageDays.toFixed(1)} dias, recompondo o limite configurado de ${recoveryTarget} dias.`));
  }
  return alerts;
}

function buildMovements(inventory: CanonicalInventoryProduct[], transactions: CanonicalSalesTransaction[]): StockMovement[] {
  const index = buildProductIndex(inventory); const movements: StockMovement[] = [];
  inventory.forEach(item => {
    const pendingUnits = nonNegative(item.pendingQty); const pendingCases = nonNegative(item.pendingCases); const pendingCost = nonNegative(item.pendingCost);
    if (pendingUnits <= 0 && pendingCases <= 0 && pendingCost <= 0) return;
    movements.push({ id: `CARTEIRA:${item.code}`, direction: 'ENTRADA', stage: 'PREVISTA', kind: 'ENTRADA_PREVISTA_CARTEIRA', status: 'Entrada prevista', movement: 'Entrada prevista — Carteira', date: '', document: '', order: '', invoice: '', sku: item.code, ean: item.ean || '', product: item.description, partner: 'Colgate → Milênio', partnerDocument: '', cases: pendingCases, looseUnits: 0, totalUnits: pendingUnits, value: pendingCost, origin: 'CARTEIRA' });
  });
  transactions.forEach((transaction, transactionIndex) => {
    const item = resolveInventoryProduct(transaction, index);
    const sku = item?.code || transaction.internalProductCode || transaction.manufacturerCode || `SEM-SKU-${transactionIndex + 1}`;
    const reserved = transaction.status === 'A FATURAR';
    const order = transaction.orderNumber || '';
    const invoice = transaction.invoiceNumber || '';
    movements.push({
      id: `8022:${transactionIndex}:${transaction.status}:${sku}`,
      direction: 'SAIDA',
      stage: reserved ? 'RESERVADA' : 'REALIZADA',
      kind: reserved ? 'SAIDA_RESERVADA_PEDIDO' : 'SAIDA_FATURADA',
      status: reserved ? 'Saída reservada' : 'Saída faturada',
      movement: reserved ? 'Saída reservada — pedido a faturar' : 'Saída faturada',
      date: transaction.date || transaction.invoiceDate || '',
      document: invoice || order,
      order,
      invoice,
      sku,
      ean: item?.ean || transaction.ean || '',
      product: item?.description || transaction.productDescription,
      partner: transaction.clientName,
      partnerDocument: transaction.cnpj,
      cases: Number(transaction.cases) || 0,
      looseUnits: 0,
      totalUnits: Number(transaction.units) || 0,
      value: Number(transaction.value) || 0,
      origin: '8022',
    });
  });
  return movements.sort((left, right) => { if (left.date && right.date && left.date !== right.date) return right.date.localeCompare(left.date); if (left.date && !right.date) return -1; if (!left.date && right.date) return 1; return left.id.localeCompare(right.id); });
}

export function buildStockPresentation(input: StockPresentationInput): StockPresentation {
  const inventory = input.inventory || [];
  const transactions = input.transactions || [];
  const support = buildSupportIndex(input.productSupport || []);
  const hasStock105 = Boolean(input.hasStock105);
  const alertConfiguration = input.alertConfiguration || DEFAULT_STOCK_ALERT_CONFIGURATION;
  const elapsed = nonNegative(input.businessDaysElapsed);
  const { reservedByCode, reconciliation: reservation } = buildReservation(inventory, transactions, hasStock105);

  const soldByCode = new Map<string, number>();
  const productIndex = buildProductIndex(inventory);
  transactions.forEach(transaction => {
    if (transaction.status !== 'FATURADO') return;
    const units = nonNegative(transaction.units); if (units <= 0) return;
    const item = resolveInventoryProduct(transaction, productIndex); if (!item) return;
    soldByCode.set(item.code, (soldByCode.get(item.code) || 0) + units);
  });

  const products: StockProductView[] = inventory.map(item => {
    const master = supportForProduct(item, support);
    const unitsPerCase = internalFactor(item, master);
    const industryUnitsPerCase = industryFactor(item, master);
    const positionUnits = nonNegative(item.quantity);

    // REGRA CANÔNICA: físico é sempre Qt.Est. do 105. O 8013 não substitui essa quantidade.
    const physicalTotalUnits = positionUnits;
    let physicalCases = 0;
    let looseUnits = 0;
    let quantityDifference = 0;
    if (unitsPerCase > 0) {
      physicalCases = Math.floor((physicalTotalUnits + TOLERANCE) / unitsPerCase);
      const residual = physicalTotalUnits - physicalCases * unitsPerCase;
      if (residual >= -TOLERANCE && residual < unitsPerCase + TOLERANCE) looseUnits = Math.max(residual, 0);
      else quantityDifference = residual;
    }

    const reservedUnits = reservedByCode.get(item.code) || 0;
    const availableUnits = reservation.mode === 'POSICAO_BRUTA' ? Math.max(positionUnits - reservedUnits, 0) : positionUnits;
    const pendingUnits = nonNegative(item.pendingQty);
    const pendingCases = nonNegative(item.pendingCases);
    const projectedUnits = availableUnits + pendingUnits;
    const soldUnits = soldByCode.get(item.code) || 0;
    const averageDailyUnits = elapsed > 0 ? soldUnits / elapsed : 0;
    const coverageDays = averageDailyUnits > 0 ? availableUnits / averageDailyUnits : null;
    const projectedCoverageDays = averageDailyUnits > 0 ? projectedUnits / averageDailyUnits : null;

    const withoutAlerts: Omit<StockProductView, 'alerts'> = {
      code: item.code,
      factoryCode: item.factoryCode || master?.sku || '',
      ean: item.ean || master?.ean || '',
      description: item.description || master?.description || '',
      brand: master?.brand || '',
      category: master?.category || '',
      subcategory: master?.subcategory || '',
      line: master?.line || '',
      unitsPerCase,
      industryUnitsPerCase,
      positionUnits,
      physicalCases,
      looseUnits,
      physicalTotalUnits,
      equivalentCases: unitsPerCase > 0 ? physicalTotalUnits / unitsPerCase : null,
      reservedUnits,
      availableUnits,
      pendingCases,
      pendingUnits,
      projectedUnits,
      costUnit: nonNegative(item.costUnit),
      saleUnit: nonNegative(item.saleUnit),
      positionCostValue: positionUnits * nonNegative(item.costUnit),
      positionSaleValue: positionUnits * nonNegative(item.saleUnit),
      soldUnits,
      averageDailyUnits,
      coverageDays,
      projectedCoverageDays,
      grossKg: nonNegative(item.grossKg),
      isLaunch: Boolean(item.isLaunch),
      hasWinthor: item.hasWinthor !== false,
      quantityDifference,
    };
    return { ...withoutAlerts, alerts: buildAlertsForProduct(withoutAlerts, alertConfiguration) };
  });

  const movements = buildMovements(inventory, transactions);
  const alerts = products.flatMap(product => product.alerts);
  const summary: StockPresentationSummary = {
    costValue: products.reduce((total, product) => total + product.positionCostValue, 0),
    saleValue: products.reduce((total, product) => total + product.positionSaleValue, 0),
    physicalUnits: products.reduce((total, product) => total + product.physicalTotalUnits, 0),
    physicalCases: products.reduce((total, product) => total + product.physicalCases, 0),
    looseUnits: products.reduce((total, product) => total + product.looseUnits, 0),
    unconvertedPhysicalUnits: products.filter(product => product.unitsPerCase <= 0).reduce((total, product) => total + product.physicalTotalUnits, 0),
    reservedUnits: products.reduce((total, product) => total + product.reservedUnits, 0),
    availableUnits: products.reduce((total, product) => total + product.availableUnits, 0),
    pendingUnits: products.reduce((total, product) => total + product.pendingUnits, 0),
    pendingCases: products.reduce((total, product) => total + product.pendingCases, 0),
    projectedUnits: products.reduce((total, product) => total + product.projectedUnits, 0),
    skuCount: products.length,
    zeroSkuCount: products.filter(product => product.hasWinthor && product.physicalTotalUnits <= 0).length,
    launchCount: products.filter(product => product.isLaunch).length,
    noWinthorCount: products.filter(isOperationalNoWinthor).length,
    quantityDifferenceUnits: products.reduce((total, product) => total + product.quantityDifference, 0),
  };

  const validPhysicalConversions = products.filter(product => product.physicalTotalUnits > 0 && product.unitsPerCase > 0);
  const expectedFormulaUnits = validPhysicalConversions.reduce((total, product) => total + product.physicalTotalUnits, 0);
  const calculatedFormulaUnits = validPhysicalConversions.reduce((total, product) => total + product.physicalCases * product.unitsPerCase + product.looseUnits, 0);
  const missingInternalConversions = products.filter(product => product.physicalTotalUnits > 0 && product.unitsPerCase <= 0);
  const missingIndustryConversions = products.filter(product => product.pendingCases > 0 && product.industryUnitsPerCase <= 0);
  const validPortfolioConversions = products.filter(product => product.pendingCases > 0 && product.industryUnitsPerCase > 0);
  const expectedPortfolioUnits = validPortfolioConversions.reduce((total, product) => total + product.pendingCases * product.industryUnitsPerCase, 0);
  const calculatedPortfolioUnits = validPortfolioConversions.reduce((total, product) => total + product.pendingUnits, 0);
  const pendingProducts = products.filter(product => product.pendingCases > 0 || product.pendingUnits > 0);
  const unvaluedPortfolio = pendingProducts.filter(product => product.pendingUnits <= 0 || product.saleUnit <= 0);
  const portfolioMovements = movements.filter(movement => movement.kind === 'ENTRADA_PREVISTA_CARTEIRA');
  const reservedMovements = movements.filter(movement => movement.kind === 'SAIDA_RESERVADA_PEDIDO' && movement.totalUnits > 0);

  const checks: StockReconciliationCheck[] = [
    numericCheck({ id: 'stock.quantity.formula', label: 'Caixas internas × Un/CX interno + avulsas = físico 105', expected: expectedFormulaUnits, calculated: calculatedFormulaUnits, source: '105 + 8013 (embalagem interna)', tolerance: TOLERANCE, note: `${validPhysicalConversions.length} SKU(s) com Un/CX interno comprovado.` }),
    missingInternalConversions.length === 0
      ? numericCheck({ id: 'stock.quantity.internal-conversion', label: 'SKUs físicos sem Un/CX interno', expected: 0, calculated: 0, source: '105 × 8013', tolerance: 0 })
      : blockedCheck('stock.quantity.internal-conversion', 'SKUs físicos sem Un/CX interno', '105 × 8013', `${missingInternalConversions.length} SKU(s) preservam o físico em unidades, mas não podem ser decompostos em caixas/avulsas.`, missingInternalConversions.length),
    missingIndustryConversions.length === 0
      ? numericCheck({ id: 'stock.quantity.industry-conversion', label: 'SKUs da Carteira sem Un/CX indústria', expected: 0, calculated: 0, source: 'Carteira × Lista de Preço Colgate', tolerance: 0 })
      : blockedCheck('stock.quantity.industry-conversion', 'SKUs da Carteira sem Un/CX indústria', 'Carteira × Lista de Preço Colgate', `${missingIndustryConversions.length} SKU(s) continuam em caixas porque falta o fator industrial; unidades não foram inventadas.`, missingIndustryConversions.length),
    numericCheck({ id: 'stock.portfolio.conversion', label: 'Carteira em caixas × Un/CX indústria = unidades', expected: expectedPortfolioUnits, calculated: calculatedPortfolioUnits, source: 'Carteira × Lista de Preço Colgate', tolerance: TOLERANCE, note: `${validPortfolioConversions.length} SKU(s) com conversão industrial comprovada.` }),
    unvaluedPortfolio.length === 0
      ? numericCheck({ id: 'stock.portfolio.sale-valuation', label: 'Carteira valorizada exclusivamente por PVENDA1', expected: 0, calculated: 0, source: 'Carteira × PCTABPR Região 11 / PVENDA1', tolerance: 0, note: `${pendingProducts.length} SKU(s) pendente(s) possuem unidades e PVENDA1 suficientes para valorização.` })
      : blockedCheck('stock.portfolio.sale-valuation', 'Carteira valorizada exclusivamente por PVENDA1', 'Carteira × PCTABPR Região 11 / PVENDA1', `${unvaluedPortfolio.length} SKU(s) da Carteira não podem ser valorizados a venda porque falta conversão em unidades e/ou PVENDA1. Nenhum acréscimo estimado foi usado.`, unvaluedPortfolio.length),
    numericCheck({ id: 'stock.projected.units', label: 'Estoque projetado = disponível + entradas previstas', expected: summary.availableUnits + summary.pendingUnits, calculated: summary.projectedUnits, source: '105 + 8022 A Faturar + Carteira', tolerance: TOLERANCE }),
    numericCheck({ id: 'stock.portfolio.units', label: 'Σ Carteira por SKU = total de entradas previstas', expected: summary.pendingUnits, calculated: portfolioMovements.reduce((total, movement) => total + nonNegative(movement.totalUnits), 0), source: 'Carteira', tolerance: TOLERANCE }),
    numericCheck({ id: 'stock.reserved.units', label: 'Σ reservado por SKU = saídas reservadas do 8022', expected: summary.reservedUnits, calculated: reservedMovements.reduce((total, movement) => total + nonNegative(movement.totalUnits), 0) - reservation.unresolvedReservedUnits, source: '8022 A Faturar', tolerance: TOLERANCE, note: reservation.unresolvedReservedUnits > 0 ? `${reservation.unresolvedReservedUnits} un. do A Faturar não foram conciliadas a SKU do estoque.` : 'Todas as unidades reservadas foram conciliadas.' }),
    reservation.unresolvedReservedUnits <= TOLERANCE
      ? numericCheck({ id: 'stock.reserved.unresolved', label: 'Reserva sem SKU conciliado', expected: 0, calculated: 0, source: '8022 × ITEM_MASTER', tolerance: TOLERANCE })
      : blockedCheck('stock.reserved.unresolved', 'Reserva sem SKU conciliado', '8022 × ITEM_MASTER', 'Há unidades A Faturar sem SKU conciliado; elas permanecem explícitas e não foram descontadas silenciosamente.', reservation.unresolvedReservedUnits),
    numericCheck({ id: 'stock.value.cost', label: 'Σ valor dos SKUs a custo = total da Visão Geral', expected: Number(input.stockCostValue ?? summary.costValue), calculated: summary.costValue, source: 'Posição 105', tolerance: 0.01 }),
    numericCheck({ id: 'stock.value.sale', label: 'Σ valor dos SKUs a venda = total da Visão Geral', expected: Number(input.stockSaleValue ?? summary.saleValue), calculated: summary.saleValue, source: '105 × PCTABPR Região 11 / PVENDA1', tolerance: 0.01 }),
    reservation.mode === 'POSICAO_BRUTA'
      ? { id: 'stock.reservation.mode', label: 'Tratamento da reserva na posição física', expected: '105 físico - 8022 A Faturar', calculated: '105 físico - 8022 A Faturar', difference: null, status: 'OK', source: '105 × 8022', note: reservation.note }
      : blockedCheck('stock.reservation.mode', 'Tratamento da reserva na posição física', '105 × 8022', reservation.note, reservation.mode),
    blockedCheck('stock.movement.balance', 'Saldo anterior + entradas - saídas = saldo atual', 'Relatório detalhado de movimentações', 'A arquitetura de movimentos está pronta, mas esta reconciliação exige o razão completo de notas, devoluções, transferências e ajustes.'),
  ];

  return { products, movements, alerts, reservation, summary, reconciliation: checks };
}
