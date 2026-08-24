import type { CanonicalState } from '../domain/canonical';
import { TemplateWorkbook, type TemplateCellValue } from './templateWorkbook';

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DAY_NAMES = ['Domingo','Segunda-Feira','Terça-Feira','Quarta-Feira','Quinta-Feira','Sexta-Feira','Sábado'];
// O modelo é versionado na URL para impedir que uma cópia antiga do Excel
// permaneça no cache/service worker depois de uma atualização do sistema.
const PANEL_TEMPLATE = './templates/painel-sell-out-padrao-v2.xlsx';

const ratio = (value:number,target:number) => target > 0 ? value / target : 0;
const ref = (column:string,row:number) => `${column}${row}`;

function periodParts(state:CanonicalState) {
  const [year,month] = state.referenceDate.split('-').map(Number);
  return { year, month, monthName: MONTHS[(month || 1) - 1] || 'Mês', shortYear: String(year || new Date().getFullYear()).slice(-2) };
}

function dateFromIso(value:string):Date {
  const [year,month,day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12);
}

function periodDates(start:string,end:string):string[] {
  if (!start || !end) return [];
  const cursor = dateFromIso(start);
  const limit = dateFromIso(end);
  const result:string[] = [];
  while (cursor <= limit) {
    result.push(`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-${String(cursor.getDate()).padStart(2,'0')}`);
    cursor.setDate(cursor.getDate()+1);
  }
  return result;
}

function generatedDate(state:CanonicalState):Date {
  const value = new Date(state.generatedAt);
  return Number.isNaN(value.getTime()) ? new Date() : value;
}

export interface SellOutNetworkPanelRow {
  key:string;
  name:string;
  target:number;
  invoiced:number;
  toInvoice:number;
  total:number;
  invoicedTrend:number;
  totalTrend:number;
  clients:number;
}

export function buildSellOutNetworkPanel(state:CanonicalState): { networks:SellOutNetworkPanelRow[]; consolidated:SellOutNetworkPanelRow } {
  const summary = state.sellOut;
  const trend = (value:number) => summary.businessDaysElapsed > 0 ? value / summary.businessDaysElapsed * summary.businessDaysTotal : 0;
  const networks = state.networks
    .filter(network => network.key !== 'SEM REDE' && network.networkTarget > 0)
    .sort((left,right) => right.networkTarget-left.networkTarget || right.total-left.total)
    .slice(0,5)
    .map(network => ({
      key:network.key,
      name:network.name,
      target:network.networkTarget,
      invoiced:network.invoiced,
      toInvoice:network.toInvoice,
      total:network.total,
      invoicedTrend:trend(network.invoiced),
      totalTrend:trend(network.total),
      clients:network.clients,
    }));
  const consolidated = networks.reduce<SellOutNetworkPanelRow>((acc,network) => ({
    ...acc,
    target:acc.target+network.target,
    invoiced:acc.invoiced+network.invoiced,
    toInvoice:acc.toInvoice+network.toInvoice,
    total:acc.total+network.total,
    invoicedTrend:acc.invoicedTrend+network.invoicedTrend,
    totalTrend:acc.totalTrend+network.totalTrend,
    clients:acc.clients+network.clients,
  }), { key:'TOP-5',name:'TOP 5 REDES',target:0,invoiced:0,toInvoice:0,total:0,invoicedTrend:0,totalTrend:0,clients:0 });
  return { networks, consolidated };
}

export function buildSellOutTargetPresentation(state:CanonicalState) {
  const summary = state.sellOut;
  const hasSellOutTarget = summary.sellOutTarget > 0;
  const hasPositivityTarget = state.industryPositivityTarget > 0;
  const dailyTarget = hasSellOutTarget && summary.businessDaysTotal > 0 ? summary.sellOutTarget / summary.businessDaysTotal : null;
  return {
    hasSellOutTarget,
    hasPositivityTarget,
    dailyTarget,
    neededDailyAverage: hasSellOutTarget && summary.businessDaysRemaining > 0 ? summary.neededDailyAverage : null,
    attainment: hasSellOutTarget ? summary.attainment : null,
    positivityAttainment: hasPositivityTarget ? summary.positivityAttainment : null,
  };
}

function fillPanelSummary(workbook:TemplateWorkbook,state:CanonicalState) {
  const sheet = 'SELL OUT - Milenio 2026';
  const summary = state.sellOut;
  const parts = periodParts(state);
  const daily = new Map(state.daily.map(day => [day.date,day]));
  const targetPresentation = buildSellOutTargetPresentation(state);
  const positivityTrend = summary.businessDaysElapsed > 0 ? summary.totalPositivation/summary.businessDaysElapsed*summary.businessDaysTotal : 0;
  const values:Record<string,TemplateCellValue> = {
    G1: dateFromIso(state.periodStart), G2: dateFromIso(state.periodEnd), T1: parts.year, F3: summary.businessDaysTotal,
    F4: summary.businessDaysElapsed, E5: generatedDate(state), E6: parts.monthName.toUpperCase(),
    M3: targetPresentation.dailyTarget ?? '', M4: summary.totalDailyAverage, N4: targetPresentation.dailyTarget ? ratio(summary.totalDailyAverage,targetPresentation.dailyTarget) : '',
    M5: targetPresentation.neededDailyAverage ?? '', N5: targetPresentation.dailyTarget && targetPresentation.neededDailyAverage !== null ? ratio(targetPresentation.neededDailyAverage,targetPresentation.dailyTarget) : '',
    M8: targetPresentation.hasSellOutTarget ? summary.sellOutTarget : '', M9: summary.invoiced, N9: targetPresentation.hasSellOutTarget ? ratio(summary.invoiced,summary.sellOutTarget) : '',
    M10: summary.invoicedTrend, N10: targetPresentation.hasSellOutTarget ? ratio(summary.invoicedTrend,summary.sellOutTarget) : '',
    M11: summary.total, N11: targetPresentation.attainment ?? '',
    M12: summary.totalTrend, N12: targetPresentation.hasSellOutTarget ? ratio(summary.totalTrend,summary.sellOutTarget) : '',
    M15: state.history.sameMonthLastYear ?? '', N15: state.history.sameMonthLastYear ? summary.invoicedTrend/state.history.sameMonthLastYear-1 : '',
    M16: state.history.average3ClosedMonths ?? '', N16: state.history.average3ClosedMonths ? summary.invoicedTrend/state.history.average3ClosedMonths-1 : '',
    L19: state.stock.saleValue, L20: state.stock.coverageCurrentDays, M20: state.stock.coverageTargetDays, N20: state.stock.coverageTargetDays-state.stock.coverageCurrentDays,
    L21: state.stock.pendingPurchaseSale, L22: state.stock.projectedSaleValue, L23: state.stock.coverageProjectedDays,
    L26: state.stock.costValue, L27: state.stock.coverageCostCurrentDays, M27: state.stock.coverageTargetDays, N27: state.stock.coverageTargetDays-state.stock.coverageCostCurrentDays,
    L28: state.stock.pendingPurchaseCost, L29: state.stock.projectedCostValue, L30: state.stock.coverageCostProjectedDays,
    L33: targetPresentation.hasPositivityTarget ? state.industryPositivityTarget : '', L34: summary.totalPositivation, M34: targetPresentation.positivityAttainment ?? '',
    L35: positivityTrend, M35: targetPresentation.hasPositivityTarget ? ratio(positivityTrend,state.industryPositivityTarget) : '', L36: '', M36: '',
    E39: summary.total, F39: summary.invoiced, G39: summary.totalPositivation, F40: summary.invoiced, G40: summary.totalPositivation,
    E41: summary.toInvoice, F41: 0, G41: 0, L24:'', B27:'',
  };

  workbook.clearRows(sheet,8,38,3,7);
  periodDates(state.periodStart,state.periodEnd).slice(0,31).forEach((date,index) => {
    const row = 8+index;
    const point = daily.get(date);
    values[ref('C',row)] = dateFromIso(date);
    values[ref('D',row)] = DAY_NAMES[dateFromIso(date).getDay()];
    values[ref('E',row)] = point?.total || 0;
    values[ref('F',row)] = point?.invoiced || 0;
    values[ref('G',row)] = point?.totalPositivation || 0;
  });

  const lineColumns = ['J','K','L','M','N'];
  const lineTrend = (value:number) => summary.businessDaysElapsed > 0 ? value/summary.businessDaysElapsed*summary.businessDaysTotal : 0;
  state.lines.slice(0,5).forEach((line,index) => {
    const column = lineColumns[index];
    values[`${column}38`] = line.name; values[`${column}39`] = line.target; values[`${column}40`] = line.total;
    values[`${column}41`] = line.attainment; values[`${column}42`] = lineTrend(line.total);
    values[`${column}53`] = line.name; values[`${column}54`] = line.target; values[`${column}55`] = line.total;
    values[`${column}56`] = line.attainment; values[`${column}57`] = lineTrend(line.total); values[`${column}58`] = 0; values[`${column}59`] = 0;
  });
  values.I52 = state.lines.reduce((sum,line)=>sum+line.total,0);
  values.I54 = state.lines.reduce((sum,line)=>sum+line.target,0);
  values.I53 = 0;

  const networkPanel = buildSellOutNetworkPanel(state);
  workbook.clearRows(sheet,6,40,17,18);
  values.Q3 = networkPanel.consolidated.target;
  values.Q4 = networkPanel.consolidated.invoiced;
  values.R4 = ratio(networkPanel.consolidated.invoiced,networkPanel.consolidated.target);
  const blocks = [6,13,20,27,34];
  blocks.forEach((start,index) => {
    const network = networkPanel.networks[index];
    if (!network) return;
    values[ref('Q',start)] = network.name; values[ref('P',start+1)] = network.name;
    values[ref('Q',start+2)] = network.target; values[ref('R',start+2)] = '';
    values[ref('Q',start+3)] = network.invoiced; values[ref('R',start+3)] = ratio(network.invoiced,network.target);
    values[ref('Q',start+4)] = network.invoicedTrend; values[ref('R',start+4)] = ratio(network.invoicedTrend,network.target);
    values[ref('Q',start+5)] = network.total; values[ref('R',start+5)] = ratio(network.total,network.target);
    values[ref('Q',start+6)] = network.totalTrend; values[ref('R',start+6)] = ratio(network.totalTrend,network.target);
  });
  workbook.patchCells(sheet,values);
}

function fillPanelTeam(workbook:TemplateWorkbook,state:CanonicalState) {
  const sheet = 'EQUIPES';
  const parts = periodParts(state);
  const vendors = state.vendors;
  const sum = (selector:(vendor:(typeof vendors)[number])=>number) => vendors.reduce((total,vendor)=>total+selector(vendor),0);
  const salesTarget = sum(vendor=>vendor.salesTarget); const positivityTarget = sum(vendor=>vendor.positivityTarget);
  const invoiced = sum(vendor=>vendor.invoiced); const toInvoice = sum(vendor=>vendor.toInvoice); const total = invoiced+toInvoice;
  const invoicedPos = sum(vendor=>vendor.invoicedPositivation); const futurePos = sum(vendor=>vendor.futurePositivation); const totalPos = invoicedPos+futurePos;
  const hasSalesTarget = salesTarget > 0;
  const hasPositivityTarget = positivityTarget > 0;
  const values:Record<string,TemplateCellValue> = {
    A1:'ATUALIZADO:', B1:generatedDate(state), E1:hasSalesTarget ? salesTarget : '', F1:invoiced, G1:hasSalesTarget ? ratio(invoiced,salesTarget) : '', H1:toInvoice, I1:total, J1:hasSalesTarget ? ratio(total,salesTarget) : '',
    K1:hasSalesTarget ? sum(vendor=>vendor.idealSalesToday) : '', L1:hasSalesTarget ? sum(vendor=>vendor.salesGapToIdeal) : '', M1:hasSalesTarget ? sum(vendor=>vendor.salesGapToTarget) : '',
    N1:hasPositivityTarget ? positivityTarget : '', O1:invoicedPos, P1:hasPositivityTarget ? ratio(invoicedPos,positivityTarget) : '', Q1:futurePos, R1:totalPos, S1:hasPositivityTarget ? ratio(totalPos,positivityTarget) : '',
    T1:hasPositivityTarget ? sum(vendor=>vendor.idealPositivationToday) : '', U1:hasPositivityTarget ? sum(vendor=>vendor.positivityGapToIdeal) : '', V1:hasPositivityTarget ? sum(vendor=>vendor.positivityGapToTarget) : '', W1:hasPositivityTarget && state.sellOut.businessDaysRemaining > 0 ? sum(vendor=>vendor.positivityDailyTarget) : '',
    E2:`SELL-OUT MÊS ${parts.monthName.toUpperCase()}`, N2:`POSITIVAÇÃO ${parts.monthName.toUpperCase()}`,
  };
  workbook.clearRows(sheet,4,1000,1,23);
  vendors.forEach((vendor,index) => {
    const row = 4+index;
    const vendorHasSalesTarget = vendor.salesTarget > 0;
    const vendorHasPositivityTarget = vendor.positivityTarget > 0;
    values[ref('A',row)] = vendor.coordinatorCode; values[ref('B',row)] = vendor.coordinatorName;
    values[ref('C',row)] = vendor.newCode; values[ref('D',row)] = vendor.name;
    values[ref('E',row)] = vendorHasSalesTarget ? vendor.salesTarget : ''; values[ref('F',row)] = vendor.invoiced; values[ref('G',row)] = vendorHasSalesTarget ? ratio(vendor.invoiced,vendor.salesTarget) : '';
    values[ref('H',row)] = vendor.toInvoice; values[ref('I',row)] = vendor.total; values[ref('J',row)] = vendorHasSalesTarget ? vendor.attainment : '';
    values[ref('K',row)] = vendorHasSalesTarget && vendor.salesGapToIdeal > 0 ? vendor.idealSalesToday : ''; values[ref('L',row)] = vendorHasSalesTarget && vendor.salesGapToIdeal > 0 ? vendor.salesGapToIdeal : '';
    values[ref('M',row)] = vendorHasSalesTarget ? vendor.salesGapToTarget : ''; values[ref('N',row)] = vendorHasPositivityTarget ? vendor.positivityTarget : ''; values[ref('O',row)] = vendor.invoicedPositivation;
    values[ref('P',row)] = vendorHasPositivityTarget ? ratio(vendor.invoicedPositivation,vendor.positivityTarget) : ''; values[ref('Q',row)] = vendor.futurePositivation;
    values[ref('R',row)] = vendor.totalPositivation; values[ref('S',row)] = vendorHasPositivityTarget ? vendor.positivityAttainment : '';
    values[ref('T',row)] = vendorHasPositivityTarget && vendor.positivityGapToIdeal > 0 ? vendor.idealPositivationToday : ''; values[ref('U',row)] = vendorHasPositivityTarget && vendor.positivityGapToIdeal > 0 ? vendor.positivityGapToIdeal : '';
    values[ref('V',row)] = vendorHasPositivityTarget ? vendor.positivityGapToTarget : ''; values[ref('W',row)] = vendorHasPositivityTarget && state.sellOut.businessDaysRemaining > 0 ? vendor.positivityDailyTarget : '';
  });
  workbook.patchCells(sheet,values,4);
}

export async function downloadSellOutDocument(state:CanonicalState) {
  const workbook = await TemplateWorkbook.load(PANEL_TEMPLATE);
  fillPanelSummary(workbook,state);
  fillPanelTeam(workbook,state);
  const parts = periodParts(state);
  workbook.download(`Painel Sell Out MILENIO-${parts.monthName}'${parts.shortYear}.xlsx`);
}
