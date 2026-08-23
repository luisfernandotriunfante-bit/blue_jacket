import type { CanonicalNetworkResult, CanonicalState } from '../domain/canonical';
import { TemplateWorkbook, type TemplateCellValue } from './templateWorkbook';

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DAY_NAMES = ['Domingo','Segunda-Feira','Terça-Feira','Quarta-Feira','Quinta-Feira','Sexta-Feira','Sábado'];
const PANEL_TEMPLATE = './templates/painel-sell-out-padrao.xlsx';

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

function officialNetworks(state:CanonicalState):CanonicalNetworkResult[] {
  return state.networks
    .filter(network => network.key !== 'SEM REDE' && (network.networkTarget > 0 || network.topTarget > 0))
    .sort((left,right) => right.networkTarget-left.networkTarget || right.topTarget-left.topTarget || right.total-left.total);
}

function fillPanelSummary(workbook:TemplateWorkbook,state:CanonicalState) {
  const sheet = 'SELL OUT - Milenio 2026';
  const summary = state.sellOut;
  const parts = periodParts(state);
  const daily = new Map(state.daily.map(day => [day.date,day]));
  const dailyTarget = summary.businessDaysTotal > 0 ? summary.sellOutTarget / summary.businessDaysTotal : 0;
  const positivityTrend = summary.businessDaysElapsed > 0 ? summary.totalPositivation/summary.businessDaysElapsed*summary.businessDaysTotal : 0;
  const values:Record<string,TemplateCellValue> = {
    G1: dateFromIso(state.periodStart), G2: dateFromIso(state.periodEnd), T1: parts.year, F3: summary.businessDaysTotal,
    F4: summary.businessDaysElapsed, E5: generatedDate(state), E6: parts.monthName.toUpperCase(),
    M3: dailyTarget, M4: summary.totalDailyAverage, N4: ratio(summary.totalDailyAverage,dailyTarget),
    M5: summary.neededDailyAverage, N5: ratio(summary.neededDailyAverage,dailyTarget),
    M8: summary.sellOutTarget, M9: summary.invoiced, N9: ratio(summary.invoiced,summary.sellOutTarget),
    M10: summary.invoicedTrend, N10: ratio(summary.invoicedTrend,summary.sellOutTarget),
    M11: summary.total, N11: summary.attainment,
    M12: summary.totalTrend, N12: ratio(summary.totalTrend,summary.sellOutTarget),
    M15: state.history.sameMonthLastYear ?? '', N15: state.history.sameMonthLastYear ? summary.invoicedTrend/state.history.sameMonthLastYear-1 : '',
    M16: state.history.average3ClosedMonths ?? '', N16: state.history.average3ClosedMonths ? summary.invoicedTrend/state.history.average3ClosedMonths-1 : '',
    L19: state.stock.saleValue, L20: state.stock.coverageCurrentDays, M20: state.stock.coverageTargetDays, N20: state.stock.coverageTargetDays-state.stock.coverageCurrentDays,
    L21: state.stock.pendingPurchaseSale, L22: state.stock.projectedSaleValue, L23: state.stock.coverageProjectedDays,
    L26: state.stock.costValue, L27: state.stock.coverageCostCurrentDays, M27: state.stock.coverageTargetDays, N27: state.stock.coverageTargetDays-state.stock.coverageCostCurrentDays,
    L28: state.stock.pendingPurchaseCost, L29: state.stock.projectedCostValue, L30: state.stock.coverageCostProjectedDays,
    L33: state.industryPositivityTarget, L34: summary.totalPositivation, M34: summary.positivityAttainment,
    L35: positivityTrend, M35: ratio(positivityTrend,state.industryPositivityTarget), L36: '', M36: '',
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

  const topFive = officialNetworks(state).slice(0,5);
  workbook.clearRows(sheet,6,40,17,18);
  values.Q3 = topFive.reduce((sum,network)=>sum+(network.topTarget||network.networkTarget),0);
  values.Q4 = topFive.reduce((sum,network)=>sum+network.invoiced,0);
  values.R4 = ratio(Number(values.Q4)||0,Number(values.Q3)||0);
  const blocks = [6,13,20,27,34];
  blocks.forEach((start,index) => {
    const network = topFive[index];
    if (!network) return;
    const target = network.topTarget || network.networkTarget;
    const invTrend = summary.businessDaysElapsed > 0 ? network.invoiced/summary.businessDaysElapsed*summary.businessDaysTotal : 0;
    const totalTrend = summary.businessDaysElapsed > 0 ? network.total/summary.businessDaysElapsed*summary.businessDaysTotal : 0;
    values[ref('Q',start)] = network.name; values[ref('P',start+1)] = network.name;
    values[ref('Q',start+2)] = target; values[ref('R',start+2)] = '';
    values[ref('Q',start+3)] = network.invoiced; values[ref('R',start+3)] = ratio(network.invoiced,target);
    values[ref('Q',start+4)] = invTrend; values[ref('R',start+4)] = ratio(invTrend,target);
    values[ref('Q',start+5)] = network.total; values[ref('R',start+5)] = target === network.networkTarget ? network.networkAttainment : network.topAttainment;
    values[ref('Q',start+6)] = totalTrend; values[ref('R',start+6)] = ratio(totalTrend,target);
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
  const values:Record<string,TemplateCellValue> = {
    A1:'ATUALIZADO:', B1:generatedDate(state), E1:salesTarget, F1:invoiced, G1:ratio(invoiced,salesTarget), H1:toInvoice, I1:total, J1:ratio(total,salesTarget),
    K1:sum(vendor=>vendor.idealSalesToday), L1:sum(vendor=>vendor.salesGapToIdeal), M1:sum(vendor=>vendor.salesGapToTarget),
    N1:positivityTarget, O1:invoicedPos, P1:ratio(invoicedPos,positivityTarget), Q1:futurePos, R1:totalPos, S1:ratio(totalPos,positivityTarget),
    T1:sum(vendor=>vendor.idealPositivationToday), U1:sum(vendor=>vendor.positivityGapToIdeal), V1:sum(vendor=>vendor.positivityGapToTarget), W1:sum(vendor=>vendor.positivityDailyTarget),
    E2:`SELL-OUT MÊS ${parts.monthName.toUpperCase()}`, N2:`POSITIVAÇÃO ${parts.monthName.toUpperCase()}`,
  };
  workbook.clearRows(sheet,4,1000,1,23);
  vendors.forEach((vendor,index) => {
    const row = 4+index;
    values[ref('A',row)] = vendor.coordinatorCode; values[ref('B',row)] = vendor.coordinatorName;
    values[ref('C',row)] = vendor.newCode; values[ref('D',row)] = vendor.name;
    values[ref('E',row)] = vendor.salesTarget; values[ref('F',row)] = vendor.invoiced; values[ref('G',row)] = ratio(vendor.invoiced,vendor.salesTarget);
    values[ref('H',row)] = vendor.toInvoice; values[ref('I',row)] = vendor.total; values[ref('J',row)] = vendor.attainment;
    values[ref('K',row)] = vendor.salesGapToIdeal > 0 ? vendor.idealSalesToday : ''; values[ref('L',row)] = vendor.salesGapToIdeal > 0 ? vendor.salesGapToIdeal : '';
    values[ref('M',row)] = vendor.salesGapToTarget; values[ref('N',row)] = vendor.positivityTarget; values[ref('O',row)] = vendor.invoicedPositivation;
    values[ref('P',row)] = ratio(vendor.invoicedPositivation,vendor.positivityTarget); values[ref('Q',row)] = vendor.futurePositivation;
    values[ref('R',row)] = vendor.totalPositivation; values[ref('S',row)] = vendor.positivityAttainment;
    values[ref('T',row)] = vendor.positivityGapToIdeal > 0 ? vendor.idealPositivationToday : ''; values[ref('U',row)] = vendor.positivityGapToIdeal > 0 ? vendor.positivityGapToIdeal : '';
    values[ref('V',row)] = vendor.positivityGapToTarget; values[ref('W',row)] = vendor.positivityDailyTarget;
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
