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
  zeroStockAsRupture: false,
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
  unitsPerCase: number;
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
  hasStock8013?: boolean;
  alertConfiguration?: StockAlertConfiguration;
}

const TOLERANCE = 0.001;
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
const code = (value: unknown) => String(value ?? '').trim().replace(/^0+/, '');
const nonNegative = (value: unknown) => Math.max(Number(value) || 0, 0);
const closeEnough = (left: number, right: number) => Math.abs(left - right) <= TOLERANCE;

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

function reservationLabel(mode: ReservationPositionMode): string {
  if (mode === 'POSICAO_LIQUIDA') return 'Posição 105 já líquida da reserva';
  if (mode === 'POSICAO_BRUTA') return 'Posição 105 bruta; reserva subtraída uma única vez';
  if (mode === 'INDETERMINADA') return 'Relação entre posição e reserva não pôde ser determinada';
  return 'Sem evidência suficiente para determinar a relação entre posição e reserva';
}

function buildReservation(inventory: CanonicalInventoryProduct[], transactions: CanonicalSalesTransaction[], hasStock8013: boolean) {
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
  if (!hasStock8013) {
    return { reservedByCode, reconciliation: { mode: 'SEM_EVIDENCIA' as ReservationPositionMode, evidenceRows: 0, grossMatches: 0, netMatches: 0, conflictingRows: 0, unresolvedReservedUnits, note: `${reservationLabel('SEM_EVIDENCIA')}. O disponível preserva a posição exportada para impedir dupla subtração.` } };
  }
  let evidenceRows = 0; let grossMatches = 0; let netMatches = 0; let conflictingRows = 0;
  inventory.forEach(item => {
    const reserved = reservedByCode.get(item.code) || 0; if (reserved <= 0) return;
    const position = nonNegative(item.quantity); const physical = nonNegative(item.physicalUnits); evidenceRows += 1;
    const gross = closeEnough(position, physical); const net = closeEnough(position + reserved, physical);
    if (gross) grossMatches += 1; if (net) netMatches += 1; if (!gross && !net) conflictingRows += 1;
  });
  let mode: ReservationPositionMode = 'SEM_EVIDENCIA';
  if (evidenceRows > 0 && grossMatches === evidenceRows && netMatches === 0) mode = 'POSICAO_BRUTA';
  else if (evidenceRows > 0 && netMatches === evidenceRows && grossMatches === 0) mode = 'POSICAO_LIQUIDA';
  else if (evidenceRows > 0) mode = 'INDETERMINADA';
  return { reservedByCode, reconciliation: { mode, evidenceRows, grossMatches, netMatches, conflictingRows, unresolvedReservedUnits, note: `${reservationLabel(mode)}.${mode === 'INDETERMINADA' || mode === 'SEM_EVIDENCIA' ? ' O disponível preserva a posição exportada para impedir dupla subtração.' : ''}` } };
}

function createAlert(kind: StockAlertKind, severity: StockAlertSeverity, item: Pick<StockProductView, 'code' | 'ean' | 'description'>, message: string): StockAlert {
  return { id: `${kind}:${item.code}`, kind, severity, sku: item.code, ean: item.ean, product: item.description, message };
}

function buildAlertsForProduct(product: Omit<StockProductView, 'alerts'>, configuration: StockAlertConfiguration): StockAlert[] {
  const alerts: StockAlert[] = [];
  if (!product.hasWinthor && product.pendingUnits > 0) alerts.push(createAlert('SEM_WINTHOR', 'warning', product, 'Item da Carteira sem correspondência confirmada no Cadastro 286 / Winthor.'));
  if (!product.ean) alerts.push(createAlert('SEM_EAN', 'warning', product, 'Produto sem EAN conciliado.'));
  if (product.unitsPerCase <= 0 && (product.physicalTotalUnits > 0 || product.pendingCases > 0)) alerts.push(createAlert('SEM_CONVERSAO_CAIXA', 'warning', product, 'Não há fator Un/CX confirmado para decompor caixas e unidades avulsas.'));
  if (product.reservedUnits > product.physicalTotalUnits + TOLERANCE) alerts.push(createAlert('RESERVADO_ACIMA_FISICO', 'critical', product, 'Quantidade reservada no 8022 A Faturar supera o estoque físico identificado.'));
  if (Math.abs(product.quantityDifference) > TOLERANCE) alerts.push(createAlert('DIVERGENCIA_QUANTIDADE', 'critical', product, `Caixas × Un/CX + avulsas diverge do total físico em ${product.quantityDifference.toLocaleString('pt-BR')} un.`));
  if (product.isLaunch && product.physicalTotalUnits <= 0) alerts.push(createAlert('LANCAMENTO_SEM_ESTOQUE', 'warning', product, 'Lançamento oficial sem estoque físico identificado.'));
  if (product.isLaunch && product.physicalTotalUnits > 0 && product.soldUnits <= 0) alerts.push(createAlert('LANCAMENTO_SEM_VENDA', 'info', product, 'Lançamento com estoque e sem saída faturada na competência.'));
  if (product.physicalTotalUnits <= 0) {
    if (configuration.zeroStockAsRupture) alerts.push(createAlert('RUPTURA', 'critical', product, 'Estoque zerado; classificado como ruptura porque essa regra foi ativada na configuração do Estoque.'));
    else alerts.push(createAlert('ESTOQUE_ZERADO', 'warning', product, 'Estoque físico zerado. A classificação oficial de ruptura permanece desativada até existir regra confirmada.'));
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
    const item = resolveInventoryProduct(transaction, index); const sku = item?.code || transaction.internalProductCode || transaction.manufacturerCode || `SEM-SKU-${transactionIndex + 1}`; const reserved = transaction.status === 'A FATURAR';
    movements.push({ id: `8022:${transactionIndex}:${transaction.status}:${sku}`, direction: 'SAIDA', stage: reserved ? 'RESERVADA' : 'REALIZADA', kind: reserved ? 'SAIDA_RESERVADA_PEDIDO' : 'SAIDA_FATURADA', status: reserved ? 'Saída reservada' : 'Saída faturada', movement: reserved ? 'Saída reservada — pedido a faturar' : 'Saída faturada', date: transaction.date || '', document: '', order: '', invoice: '', sku, ean: item?.ean || transaction.ean || '', product: item?.description || transaction.productDescription, partner: transaction.clientName, partnerDocument: transaction.cnpj, cases: Number(transaction.cases) || 0, looseUnits: 0, totalUnits: Number(transaction.units) || 0, value: Number(transaction.value) || 0, origin: '8022' });
  });
  return movements.sort((left, right) => { if (left.date && right.date && left.date !== right.date) return right.date.localeCompare(left.date); if (left.date && !right.date) return -1; if (!left.date && right.date) return 1; return left.id.localeCompare(right.id); });
}

export function buildStockPresentation(input: StockPresentationInput): StockPresentation {
  const inventory = input.inventory || []; const transactions = input.transactions || []; const support = buildSupportIndex(input.productSupport || []); const hasStock8013 = Boolean(input.hasStock8013); const alertConfiguration = input.alertConfiguration || DEFAULT_STOCK_ALERT_CONFIGURATION; const elapsed = nonNegative(input.businessDaysElapsed);
  const { reservedByCode, reconciliation: reservation } = buildReservation(inventory, transactions, hasStock8013);
  const soldByCode = new Map<string, number>(); const productIndex = buildProductIndex(inventory);
  transactions.forEach(transaction => { if (transaction.status !== 'FATURADO') return; const units = nonNegative(transaction.units); if (units <= 0) return; const item = resolveInventoryProduct(transaction, productIndex); if (!item) return; soldByCode.set(item.code, (soldByCode.get(item.code) || 0) + units); });
  const products: StockProductView[] = inventory.map(item => {
    const master = supportForProduct(item, support); const unitsPerCase = nonNegative(master?.unitsPerCase); const positionUnits = nonNegative(item.quantity); const physicalTotalUnits = hasStock8013 ? nonNegative(item.physicalUnits) : positionUnits;
    let physicalCases = hasStock8013 ? nonNegative(item.physicalCases) : 0; let looseUnits = 0; let quantityDifference = 0;
    if (unitsPerCase > 0) { if (!hasStock8013) physicalCases = Math.floor(physicalTotalUnits / unitsPerCase); const residual = physicalTotalUnits - physicalCases * unitsPerCase; if (residual >= -TOLERANCE) looseUnits = Math.max(residual, 0); else quantityDifference = residual; }
    const reservedUnits = reservedByCode.get(item.code) || 0; const availableUnits = reservation.mode === 'POSICAO_BRUTA' ? Math.max(positionUnits - reservedUnits, 0) : positionUnits; const pendingUnits = nonNegative(item.pendingQty); const pendingCases = nonNegative(item.pendingCases); const projectedUnits = availableUnits + pendingUnits; const soldUnits = soldByCode.get(item.code) || 0; const averageDailyUnits = elapsed > 0 ? soldUnits / elapsed : 0; const coverageDays = averageDailyUnits > 0 ? availableUnits / averageDailyUnits : null; const projectedCoverageDays = averageDailyUnits > 0 ? projectedUnits / averageDailyUnits : null;
    const withoutAlerts: Omit<StockProductView, 'alerts'> = { code: item.code, factoryCode: item.factoryCode || master?.sku || '', ean: item.ean || master?.ean || '', description: item.description || master?.description || '', brand: master?.brand || '', category: master?.category || '', subcategory: master?.subcategory || '', line: master?.line || '', unitsPerCase, positionUnits, physicalCases, looseUnits, physicalTotalUnits, equivalentCases: unitsPerCase > 0 ? physicalTotalUnits / unitsPerCase : null, reservedUnits, availableUnits, pendingCases, pendingUnits, projectedUnits, costUnit: nonNegative(item.costUnit), saleUnit: nonNegative(item.saleUnit), positionCostValue: positionUnits * nonNegative(item.costUnit), positionSaleValue: positionUnits * nonNegative(item.saleUnit), soldUnits, averageDailyUnits, coverageDays, projectedCoverageDays, grossKg: nonNegative(item.grossKg), isLaunch: Boolean(item.isLaunch), hasWinthor: item.hasWinthor !== false, quantityDifference };
    return { ...withoutAlerts, alerts: buildAlertsForProduct(withoutAlerts, alertConfiguration) };
  });
  const movements = buildMovements(inventory, transactions); const alerts = products.flatMap(product => product.alerts);
  const summary: StockPresentationSummary = { costValue: products.reduce((sum, product) => sum + product.positionCostValue, 0), saleValue: products.reduce((sum, product) => sum + product.positionSaleValue, 0), physicalUnits: products.reduce((sum, product) => sum + product.physicalTotalUnits, 0), physicalCases: products.reduce((sum, product) => sum + product.physicalCases, 0), looseUnits: products.reduce((sum, product) => sum + product.looseUnits, 0), reservedUnits: products.reduce((sum, product) => sum + product.reservedUnits, 0), availableUnits: products.reduce((sum, product) => sum + product.availableUnits, 0), pendingUnits: products.reduce((sum, product) => sum + product.pendingUnits, 0), pendingCases: products.reduce((sum, product) => sum + product.pendingCases, 0), projectedUnits: products.reduce((sum, product) => sum + product.projectedUnits, 0), skuCount: products.length, zeroSkuCount: products.filter(product => product.physicalTotalUnits <= 0).length, launchCount: products.filter(product => product.isLaunch).length, noWinthorCount: products.filter(product => !product.hasWinthor && product.pendingUnits > 0).length, quantityDifferenceUnits: products.reduce((sum, product) => sum + product.quantityDifference, 0) };
  const validConversionProducts = products.filter(product => product.unitsPerCase > 0); const expectedFormulaUnits = validConversionProducts.reduce((sum, product) => sum + product.physicalTotalUnits, 0); const calculatedFormulaUnits = validConversionProducts.reduce((sum, product) => sum + product.physicalCases * product.unitsPerCase + product.looseUnits, 0); const missingConversions = products.filter(product => product.unitsPerCase <= 0 && (product.physicalTotalUnits > 0 || product.pendingCases > 0)); const portfolioMovements = movements.filter(movement => movement.kind === 'ENTRADA_PREVISTA_CARTEIRA'); const reservedMovements = movements.filter(movement => movement.kind === 'SAIDA_RESERVADA_PEDIDO' && movement.totalUnits > 0);
  const checks: StockReconciliationCheck[] = [
    numericCheck({ id: 'stock.quantity.formula', label: 'Caixas × Un/CX + unidades avulsas = total físico', expected: expectedFormulaUnits, calculated: calculatedFormulaUnits, source: '8013 + Lista de Preços / cadastro de embalagem', tolerance: TOLERANCE, note: `${validConversionProducts.length} SKU(s) com conversão confirmada.` }),
    missingConversions.length === 0 ? numericCheck({ id: 'stock.quantity.conversion', label: 'SKUs com estoque/carteira sem conversão Un/CX', expected: 0, calculated: 0, source: 'Lista de Preços / cadastro de embalagem', tolerance: 0 }) : blockedCheck('stock.quantity.conversion', 'SKUs com estoque/carteira sem conversão Un/CX', 'Lista de Preços / cadastro de embalagem', `${missingConversions.length} SKU(s) não podem ter a decomposição caixas/avulsas comprovada.`, missingConversions.length),
    numericCheck({ id: 'stock.projected.units', label: 'Estoque projetado = disponível + entradas previstas', expected: summary.availableUnits + summary.pendingUnits, calculated: summary.projectedUnits, source: 'Posição + 8022 A Faturar + Carteira', tolerance: TOLERANCE }),
    numericCheck({ id: 'stock.portfolio.units', label: 'Σ Carteira por SKU = total de entradas previstas', expected: summary.pendingUnits, calculated: portfolioMovements.reduce((sum, movement) => sum + nonNegative(movement.totalUnits), 0), source: 'Carteira', tolerance: TOLERANCE }),
    numericCheck({ id: 'stock.reserved.units', label: 'Σ reservado por SKU = saídas reservadas do 8022', expected: summary.reservedUnits, calculated: reservedMovements.reduce((sum, movement) => sum + nonNegative(movement.totalUnits), 0) - reservation.unresolvedReservedUnits, source: '8022 A Faturar', tolerance: TOLERANCE, note: reservation.unresolvedReservedUnits > 0 ? `${reservation.unresolvedReservedUnits} un. do A Faturar não foram conciliadas a SKU do estoque.` : 'Todas as unidades reservadas foram conciliadas.' }),
    reservation.unresolvedReservedUnits <= TOLERANCE ? numericCheck({ id: 'stock.reserved.unresolved', label: 'Reserva sem SKU conciliado', expected: 0, calculated: 0, source: '8022 × estoque', tolerance: TOLERANCE }) : blockedCheck('stock.reserved.unresolved', 'Reserva sem SKU conciliado', '8022 × estoque', 'Há unidades A Faturar sem SKU conciliado; elas permanecem explícitas e não foram descontadas silenciosamente.', reservation.unresolvedReservedUnits),
    numericCheck({ id: 'stock.value.cost', label: 'Σ valor dos SKUs a custo = total da Visão Geral', expected: Number(input.stockCostValue ?? summary.costValue), calculated: summary.costValue, source: 'Posição 105', tolerance: 0.01 }),
    numericCheck({ id: 'stock.value.sale', label: 'Σ valor dos SKUs a venda = total da Visão Geral', expected: Number(input.stockSaleValue ?? summary.saleValue), calculated: summary.saleValue, source: 'Posição 105', tolerance: 0.01 }),
    reservation.mode === 'POSICAO_BRUTA' || reservation.mode === 'POSICAO_LIQUIDA' ? { id: 'stock.reservation.mode', label: 'Tratamento da reserva na posição exportada', expected: reservation.mode, calculated: reservation.mode, difference: null, status: 'OK', source: '105 × 8013 × 8022', note: reservation.note } : blockedCheck('stock.reservation.mode', 'Tratamento da reserva na posição exportada', '105 × 8013 × 8022', reservation.note, reservation.mode),
    blockedCheck('stock.movement.balance', 'Saldo anterior + entradas - saídas = saldo atual', 'Relatório detalhado de movimentações', 'A arquitetura de movimentos está pronta, mas esta reconciliação exige o razão completo de notas, devoluções, transferências e ajustes.'),
  ];
  return { products, movements, alerts, reservation, summary, reconciliation: checks };
}
