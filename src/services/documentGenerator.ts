import type { CanonicalNetworkResult, CanonicalState } from '../domain/canonical';
import { TemplateWorkbook, type TemplateCellValue } from './templateWorkbook';

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DAY_NAMES = ['Domingo','Segunda-Feira','Terça-Feira','Quarta-Feira','Quinta-Feira','Sexta-Feira','Sábado'];
// Caminhos relativos acompanham a pasta-base do app: / no desenvolvimento e
// /blue_jacket/ no GitHub Pages.
const PANEL_TEMPLATE = './templates/painel-sell-out-padrao.xlsx';
const NETWORK_TEMPLATE = './templates/top-redes-padrao.xlsx';

const ratio = (value:number,target:number) => target > 0 ? value / target : 0;
const gap = (target:number,value:number) => Math.max(target - value, 0);
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
    // TOP REDES é uma visão de redes com meta. Venda sem Meta Redes e sem Meta Tops
    // continua existindo no Sell Out geral, mas não deve criar linha nesta planilha.
    .filter(network => network.key !== 'SEM REDE' && (network.networkTarget > 0 || network.topTarget > 0))
    .sort((left,right) => right.networkTarget-left.networkTarget || right.topTarget-left.topTarget || right.total-left.total);
}

function currentVendorFor(state:CanonicalState, code:string) {
  if (!code) return undefined;
  return state.vendors.find(vendor => vendor.newCode === code || vendor.oldCode === code);
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

function fillTopNetworks(workbook:TemplateWorkbook,state:CanonicalState) {
  const sheet = 'Top Redes';
  const parts = periodParts(state);
  const networks = officialNetworks(state);
  const networkTarget = networks.reduce((sum,network)=>sum+network.networkTarget,0); const topTarget = networks.reduce((sum,network)=>sum+network.topTarget,0);
  const invoiced = networks.reduce((sum,network)=>sum+network.invoiced,0); const toInvoice = networks.reduce((sum,network)=>sum+network.toInvoice,0); const total = invoiced+toInvoice;
  const values:Record<string,TemplateCellValue> = {
    B2:parts.monthName.toUpperCase(), D2:networkTarget, E2:topTarget, F2:invoiced, G2:ratio(invoiced,networkTarget), H2:ratio(invoiced,topTarget),
    I2:toInvoice, J2:networks.reduce((sum,network)=>sum+network.gapToNetworkTarget,0), K2:ratio(total,networkTarget), L2:ratio(total,topTarget), M2:generatedDate(state),
  };
  workbook.clearRows(sheet,4,1000,1,13);
  networks.forEach((network,index) => {
    const row = 4+index;
    const owner = currentVendorFor(state,network.vendorCode);
    values[ref('A',row)] = network.name;
    values[ref('B',row)] = owner?.coordinatorCode || network.teamCode;
    values[ref('C',row)] = owner?.newCode || network.vendorCode;
    values[ref('D',row)] = network.networkTarget; values[ref('E',row)] = network.topTarget; values[ref('F',row)] = network.invoiced;
    values[ref('G',row)] = ratio(network.invoiced,network.networkTarget); values[ref('H',row)] = ratio(network.invoiced,network.topTarget);
    values[ref('I',row)] = network.toInvoice; values[ref('J',row)] = network.gapToNetworkTarget;
    // K/L consomem os derivados materializados do motor canônico. A exportação
    // não possui uma terceira regra para atingimento total de Redes/Tops.
    values[ref('K',row)] = network.networkAttainment; values[ref('L',row)] = network.topAttainment; values[ref('M',row)] = '';
  });
  workbook.patchCells(sheet,values,4);

  const detailRows = networks.map((_,index) => 4+index);
  const networkPercentageRefs = ['G2','H2', ...detailRows.flatMap(row => [ref('G',row),ref('H',row)])];
  const attainmentPercentageRefs = ['K2','L2', ...detailRows.flatMap(row => [ref('K',row),ref('L',row)])];
  const currencyRefs = ['D2','E2','F2','I2','J2', ...detailRows.flatMap(row => [ref('D',row),ref('E',row),ref('F',row),ref('I',row),ref('J',row)])];
  workbook.copyNumberFormat(sheet,'K4',networkPercentageRefs);
  workbook.copyNumberFormat(sheet,'K4',attainmentPercentageRefs);
  workbook.copyNumberFormat(sheet,'F4',currencyRefs);
}

function fillNetworkStores(workbook:TemplateWorkbook,state:CanonicalState) {
  const sheet = 'Loja a Loja';
  const networks = officialNetworks(state); const stores = networks.flatMap(network => network.stores.map(store => ({network,store})));
  const values:Record<string,TemplateCellValue> = { F1:networks.reduce((sum,network)=>sum+network.networkTarget,0), G1:stores.reduce((sum,item)=>sum+item.store.invoiced,0) };
  workbook.clearRows(sheet,3,50000,1,7);
  stores.forEach(({network,store},index) => {
    const row = 3+index;
    values[ref('A',row)] = store.cnpj; values[ref('B',row)] = store.name; values[ref('C',row)] = network.name;
    values[ref('D',row)] = store.fantasyName; values[ref('E',row)] = store.city; values[ref('F',row)] = network.networkTarget; values[ref('G',row)] = store.invoiced;
  });
  workbook.patchCells(sheet,values,3);
}

function fillNetworkClients(workbook:TemplateWorkbook,state:CanonicalState) {
  const sheet = 'redes';
  const results = new Map(state.clients.map(client=>[client.cnpj,client])); const route = new Map(state.support.activeRoute.map(store=>[store.cnpj,store]));
  const clients = state.support.clients.length ? state.support.clients : state.clients.map(client=>({cnpj:client.cnpj,name:client.name,city:client.city,network:client.network,profile:'',isTop:false}));
  const values:Record<string,TemplateCellValue> = {};
  workbook.clearRows(sheet,2,50000,1,7);
  clients.forEach((client,index) => {
    const row = 2+index; const result = results.get(client.cnpj);
    values[ref('A',row)] = client.cnpj; values[ref('B',row)] = client.name; values[ref('C',row)] = client.city;
    values[ref('D',row)] = result?.network || client.network;
    values[ref('E',row)] = route.get(client.cnpj)?.fantasyName || client.name; values[ref('F',row)] = result?.invoiced || 0; values[ref('G',row)] = result?.toInvoice || 0;
  });
  workbook.patchCells(sheet,values,2);
}

function fillNetworkTeam(workbook:TemplateWorkbook,state:CanonicalState) {
  const sheet = 'Equipe'; const values:Record<string,TemplateCellValue> = {};
  workbook.clearRows(sheet,2,1000,1,5);
  state.vendors.forEach((vendor,index) => {
    const row = 2+index;
    values[ref('A',row)] = vendor.newCode; values[ref('B',row)] = vendor.name; values[ref('C',row)] = vendor.coordinatorCode;
    values[ref('D',row)] = vendor.coordinatorName; values[ref('E',row)] = '';
  });
  workbook.patchCells(sheet,values,2);
}

function fillNetworkAuxiliarySheets(workbook:TemplateWorkbook,state:CanonicalState) {
  // 319 e 12.326 exigem campos que o estado canônico ainda não preserva
  // (peso/caixa e razão completo de pedido/setor, respectivamente). Manter uma
  // aproximação por CNPJ/RCA fabricaria um documento operacional. As áreas de
  // dados são limpas e ficam explicitamente pendentes até a fonte correta existir.
  workbook.clearRows('319',2,50000,1,19);
  workbook.clearRows('12.326',2,50000,1,22);

  // 12.326ana usa somente granularidade item-a-item efetivamente preservada pelo
  // 8022. Não preenche campos ausentes nem sintetiza pedido/setor.
  const pending = state.transactions.filter(transaction=>transaction.status==='A FATURAR');
  const pendingRows:Record<string,TemplateCellValue> = {};
  workbook.clearRows('12.326ana',2,50000,1,13);
  pending.forEach((transaction,index) => {
    const row = 2+index;
    pendingRows[ref('A',row)] = transaction.internalProductCode || transaction.manufacturerCode; pendingRows[ref('B',row)] = transaction.productDescription;
    pendingRows[ref('C',row)] = transaction.value; pendingRows[ref('E',row)] = transaction.units;
    pendingRows[ref('F',row)] = transaction.units ? transaction.value/transaction.units : transaction.value;
    pendingRows[ref('L',row)] = transaction.vendorCode; pendingRows[ref('M',row)] = transaction.cnpj;
  });
  workbook.patchCells('12.326ana',pendingRows,2);
}

export async function downloadTopNetworksDocument(state:CanonicalState) {
  const workbook = await TemplateWorkbook.load(NETWORK_TEMPLATE);
  fillTopNetworks(workbook,state);
  fillNetworkStores(workbook,state);
  fillNetworkClients(workbook,state);
  fillNetworkTeam(workbook,state);
  fillNetworkAuxiliarySheets(workbook,state);
  const parts = periodParts(state);
  workbook.download(`TOP REDES ${parts.monthName}'${parts.shortYear}.xlsx`);
}
