import * as XLSX from 'xlsx';
import type { CanonicalState } from '../domain/canonical';

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const BRL = 'R$ #,##0.00';
const PCT = '0.0%';
const INT = '#,##0';

function periodLabel(state: CanonicalState) {
  const [year, month] = state.referenceDate.split('-').map(Number);
  return `${MONTHS[(month || 1) - 1] || 'Mês'}'${String(year || new Date().getFullYear()).slice(-2)}`;
}

function applyFormat(ws: XLSX.WorkSheet, column: string, startRow: number, endRow: number, format: string) {
  for (let row = startRow; row <= endRow; row++) {
    const cell = ws[`${column}${row}`] as XLSX.CellObject | undefined;
    if (cell && typeof cell.v === 'number') cell.z = format;
  }
}

function setCols(ws: XLSX.WorkSheet, widths: number[]) {
  ws['!cols'] = widths.map(wch => ({ wch }));
}

function appendSheet(wb: XLSX.WorkBook, name: string, rows: unknown[][], widths: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  setCols(ws, widths);
  XLSX.utils.book_append_sheet(wb, ws, name);
  return ws;
}

export function downloadSellOutDocument(state: CanonicalState) {
  const wb = XLSX.utils.book_new();
  const s = state.sellOut;

  const summaryRows: unknown[][] = [
    ['PAINEL SELL OUT MILENIO'],
    ['Período', state.periodStart, state.periodEnd, 'Atualizado em', new Date(state.generatedAt).toLocaleString('pt-BR')],
    [],
    ['INDICADORES GERENCIAIS', 'VALOR'],
    ['Meta Sell Out (T&C)', s.sellOutTarget],
    ['Meta Indústria', state.industryTarget],
    ['Faturado', s.invoiced],
    ['A Faturar', s.toInvoice],
    ['Sell Out Total', s.total],
    ['% Meta Sell Out', s.attainment],
    ['Positivação Faturada', s.invoicedPositivation],
    ['Positivação A Faturar', s.futurePositivation],
    ['Positivação Total', s.totalPositivation],
    ['Meta Positivação Indústria', state.industryPositivityTarget],
    ['% Meta Positivação', s.positivityAttainment],
    ['Dias úteis do mês', s.businessDaysTotal],
    ['Dias úteis decorridos', s.businessDaysElapsed],
    ['Dias úteis restantes', s.businessDaysRemaining],
    ['Média diária atual', s.totalDailyAverage],
    ['Média diária necessária', s.neededDailyAverage],
    ['Tendência Sell Out', s.totalTrend],
    [],
    ['ESTOQUE', 'VALOR'],
    ['Estoque P. Custo', state.stock.costValue],
    ['Estoque P. Venda', state.stock.saleValue],
    ['Carteira / Em trânsito P. Custo', state.stock.pendingPurchaseCost],
    ['Carteira / Em trânsito P. Venda', state.stock.pendingPurchaseSale],
    ['Estoque + Carteira P. Custo', state.stock.projectedCostValue],
    ['Estoque + Carteira P. Venda', state.stock.projectedSaleValue],
    ['Cobertura atual (dias)', state.stock.coverageCurrentDays],
    ['Cobertura projetada (dias)', state.stock.coverageProjectedDays],
    ['Meta cobertura (dias)', state.stock.coverageTargetDays],
  ];
  const summary = appendSheet(wb, 'SELL OUT - Milenio 2026', summaryRows, [36, 19, 19, 20, 24]);
  applyFormat(summary, 'B', 5, 9, BRL); applyFormat(summary, 'B', 10, 10, PCT); applyFormat(summary, 'B', 11, 14, INT); applyFormat(summary, 'B', 15, 15, PCT); applyFormat(summary, 'B', 16, 18, INT); applyFormat(summary, 'B', 19, 21, BRL); applyFormat(summary, 'B', 24, 29, BRL); applyFormat(summary, 'B', 30, 32, INT);
  summary['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];

  const dailyRows: unknown[][] = [['Data','Faturado','A Faturar','Sell Out Total','Positivação Faturada','Positivação Total']];
  state.daily.forEach(d => dailyRows.push([d.date, d.invoiced, d.toInvoice, d.total, d.invoicedPositivation, d.totalPositivation]));
  const daily = appendSheet(wb, 'MOVIMENTO DIARIO', dailyRows, [14, 18, 18, 18, 20, 18]);
  if (state.daily.length) { applyFormat(daily, 'B', 2, state.daily.length + 1, BRL); applyFormat(daily, 'C', 2, state.daily.length + 1, BRL); applyFormat(daily, 'D', 2, state.daily.length + 1, BRL); applyFormat(daily, 'E', 2, state.daily.length + 1, INT); applyFormat(daily, 'F', 2, state.daily.length + 1, INT); }
  daily['!autofilter'] = { ref: `A1:F${Math.max(state.daily.length + 1, 1)}` };

  const lineRows: unknown[][] = [['Linha','Participação Meta','Meta','Faturado','A Faturar','Total','% Meta']];
  state.lines.forEach(line => lineRows.push([line.name, line.share, line.target, line.invoiced, line.toInvoice, line.total, line.attainment]));
  const lines = appendSheet(wb, 'LINHAS', lineRows, [30, 18, 18, 18, 18, 18, 14]);
  if (state.lines.length) { applyFormat(lines, 'B', 2, state.lines.length + 1, PCT); ['C','D','E','F'].forEach(col => applyFormat(lines, col, 2, state.lines.length + 1, BRL)); applyFormat(lines, 'G', 2, state.lines.length + 1, PCT); }

  const vendorRows: unknown[][] = [['Coordenador','Cód. Atual','Cód. Antigo','Vendedor','Meta Venda','Faturado','A Faturar','Total','% Meta','Ideal Hoje','Gap Ideal','Falta Meta','Meta Pos.','Pos. Fat.','Pos. A Fat.','Pos. Total','% Pos.','Ideal Pos. Hoje','Gap Pos. Ideal','Falta Pos.','Target Pos./Dia']];
  state.vendors.forEach(v => vendorRows.push([v.coordinatorName, v.newCode, v.oldCode, v.name, v.salesTarget, v.invoiced, v.toInvoice, v.total, v.attainment, v.idealSalesToday, v.salesGapToIdeal, v.salesGapToTarget, v.positivityTarget, v.invoicedPositivation, v.futurePositivation, v.totalPositivation, v.positivityAttainment, v.idealPositivationToday, v.positivityGapToIdeal, v.positivityGapToTarget, v.positivityDailyTarget]));
  const vendors = appendSheet(wb, 'EQUIPES', vendorRows, [20, 12, 12, 28, 16, 16, 16, 16, 12, 16, 16, 16, 12, 12, 13, 12, 12, 16, 15, 13, 15]);
  if (state.vendors.length) {
    ['E','F','G','H','J','K','L'].forEach(col => applyFormat(vendors, col, 2, state.vendors.length + 1, BRL));
    ['I','Q'].forEach(col => applyFormat(vendors, col, 2, state.vendors.length + 1, PCT));
    ['M','N','O','P','R','S','T','U'].forEach(col => applyFormat(vendors, col, 2, state.vendors.length + 1, INT));
  }
  vendors['!autofilter'] = { ref: `A1:U${Math.max(state.vendors.length + 1, 1)}` };

  const coordRows: unknown[][] = [['Coordenador','Meta Venda','Faturado','A Faturar','Total','% Meta','Meta Pos.','Pos. Fat.','Pos. A Fat.','Pos. Total','% Pos.']];
  state.coordinators.forEach(c => coordRows.push([c.name, c.salesTarget, c.invoiced, c.toInvoice, c.total, c.attainment, c.positivityTarget, c.invoicedPositivation, c.futurePositivation, c.totalPositivation, c.positivityAttainment]));
  const coords = appendSheet(wb, 'GERENCIAL', coordRows, [26, 18, 18, 18, 18, 12, 14, 13, 13, 13, 12]);
  if (state.coordinators.length) { ['B','C','D','E'].forEach(col => applyFormat(coords, col, 2, state.coordinators.length + 1, BRL)); ['F','K'].forEach(col => applyFormat(coords, col, 2, state.coordinators.length + 1, PCT)); ['G','H','I','J'].forEach(col => applyFormat(coords, col, 2, state.coordinators.length + 1, INT)); }

  const stockRows: unknown[][] = [['Código','Descrição','EAN','Estoque','Custo Unit.','Venda Unit.','Estoque Custo','Estoque Venda','Qtd. Carteira','Carteira Custo','Carteira Venda','Lançamento']];
  state.inventory.forEach(p => stockRows.push([p.code, p.description, p.ean, p.quantity, p.costUnit, p.saleUnit, p.quantity * p.costUnit, p.quantity * p.saleUnit, p.pendingQty, p.pendingCost, p.pendingSale, p.isLaunch ? 'SIM' : '']));
  const stock = appendSheet(wb, 'ESTOQUE', stockRows, [14, 44, 16, 14, 14, 14, 18, 18, 15, 18, 18, 12]);
  if (state.inventory.length) { applyFormat(stock, 'D', 2, state.inventory.length + 1, INT); ['E','F','G','H','J','K'].forEach(col => applyFormat(stock, col, 2, state.inventory.length + 1, BRL)); applyFormat(stock, 'I', 2, state.inventory.length + 1, INT); }
  stock['!autofilter'] = { ref: `A1:L${Math.max(state.inventory.length + 1, 1)}` };

  XLSX.writeFile(wb, `Painel Sell Out MILENIO-${periodLabel(state)}.xlsx`, { bookType: 'xlsx', compression: true });
}

export function downloadTopNetworksDocument(state: CanonicalState) {
  const wb = XLSX.utils.book_new();
  const rows: unknown[][] = [['REDE','META REDES','META TOPS','REALIZADO R$','% REDES','% TOPS','A FATURAR R$','FALTA GAP','REAL + A FATURAR','% FAT + A FAT REDES','% FAT + A FAT TOPS','CLIENTES']];
  state.networks.filter(n => n.networkTarget > 0 || n.topTarget > 0 || n.total > 0).forEach(n => rows.push([n.name, n.networkTarget, n.topTarget, n.invoiced, n.networkTarget > 0 ? n.invoiced / n.networkTarget : 0, n.topTarget > 0 ? n.invoiced / n.topTarget : 0, n.toInvoice, n.gapToNetworkTarget, n.total, n.networkAttainment, n.topAttainment, n.clients]));
  const top = appendSheet(wb, 'Top Redes', rows, [28, 18, 18, 18, 13, 13, 18, 18, 19, 20, 20, 11]);
  const endTop = Math.max(rows.length, 2); ['B','C','D','G','H','I'].forEach(col => applyFormat(top, col, 2, endTop, BRL)); ['E','F','J','K'].forEach(col => applyFormat(top, col, 2, endTop, PCT)); applyFormat(top, 'L', 2, endTop, INT); top['!autofilter'] = { ref: `A1:L${endTop}` };

  const stores: unknown[][] = [['REDE','CNPJ','LOJA','FANTASIA','CIDADE','CNPJ GESTOR','AGRUPAMENTO','CATEGORIA','TIPO LOJA','META TOP','REALIZADO','A FATURAR','TOTAL','% META TOP']];
  state.networks.forEach(network => network.stores.forEach(store => stores.push([network.name, store.cnpj, store.name, store.fantasyName, store.city, store.managerCnpj, store.groupingCode, store.tier, store.storeType, store.topTarget, store.invoiced, store.toInvoice, store.total, store.topTarget > 0 ? store.total / store.topTarget : 0])));
  const loja = appendSheet(wb, 'Loja a Loja', stores, [26, 18, 34, 28, 20, 18, 16, 13, 15, 16, 16, 16, 16, 14]);
  const endStores = Math.max(stores.length, 2); ['J','K','L','M'].forEach(col => applyFormat(loja, col, 2, endStores, BRL)); applyFormat(loja, 'N', 2, endStores, PCT); loja['!autofilter'] = { ref: `A1:N${endStores}` };

  const teamRows: unknown[][] = [['COORDENADOR','CÓDIGO','VENDEDOR','META','REALIZADO','A FATURAR','TOTAL','% META','META POS.','POS. TOTAL','% POS.']];
  state.vendors.forEach(v => teamRows.push([v.coordinatorName, v.newCode, v.name, v.salesTarget, v.invoiced, v.toInvoice, v.total, v.attainment, v.positivityTarget, v.totalPositivation, v.positivityAttainment]));
  const team = appendSheet(wb, 'Equipe', teamRows, [22, 12, 30, 16, 16, 16, 16, 12, 13, 12, 12]);
  const endTeam = Math.max(teamRows.length, 2); ['D','E','F','G'].forEach(col => applyFormat(team, col, 2, endTeam, BRL)); ['H','K'].forEach(col => applyFormat(team, col, 2, endTeam, PCT)); applyFormat(team, 'I', 2, endTeam, INT); applyFormat(team, 'J', 2, endTeam, INT);
  team['!autofilter'] = { ref: `A1:K${endTeam}` };

  XLSX.writeFile(wb, `TOP REDES ${periodLabel(state)}.xlsb`, { bookType: 'xlsb', compression: true });
}
