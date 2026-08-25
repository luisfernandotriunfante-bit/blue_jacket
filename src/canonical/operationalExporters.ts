import * as XLSX from 'xlsx';
import type { SellOutViewModel, TopNetworksViewModel } from './operationalViewModels';
import { fetchTemplate, fillSellOutTemplateBytes, fillTopNetworksTemplateBytes } from './reportTemplates';

const download = (blob: Blob, name: string) => { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); };
const money = 'R$ #,##0.00';
const pct = '0.0%';

export function sellOutExportRows(view: SellOutViewModel) {
  return view.vendorRows.map(row => ({ RCA: row.label, rca_canonical_id: row.rcaCanonicalId, codigo_origem: row.rawRcaCode, status_relacionamento: row.resolutionStatus, Meta: row.salesTarget, Faturado: row.invoiced, 'A faturar': row.toInvoice, Realizado: row.realized, 'Clientes positivos': row.positiveCustomers, Atingimento: row.achievement, 'Atingimento positivação': row.positivityAchievement }));
}
export function topNetworksExportRows(view: TopNetworksViewModel) {
  return view.rows.map(row => ({ Rede: row.network, status_relacionamento: row.resolutionStatus, Clientes: row.customers, Faturado: row.invoiced, 'A faturar': row.toInvoice, Realizado: row.realized, Participação: row.share }));
}
function metadata(view: { motorBuildId: string; stagingManifestHash: string; generatedAt: string; competence: string }, kind: string, rowCount: number) {
  return [['key', 'value'], ['report', kind], ['motorBuildId', view.motorBuildId], ['stagingManifestHash', view.stagingManifestHash], ['generatedAt', view.generatedAt], ['competence', view.competence], ['rowCount', rowCount]];
}
function style(sheet: XLSX.WorkSheet, headers: string[]) { headers.forEach((header, col) => { for (let row = 1; ; row += 1) { const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })]; if (!cell) break; if (['Meta', 'Faturado', 'A faturar', 'Realizado'].includes(header)) { cell.t = 'n'; cell.z = money; } if (['Atingimento', 'Atingimento positivação', 'Participação'].includes(header)) { cell.t = 'n'; cell.z = pct; } if (['Clientes positivos', 'Clientes'].includes(header)) cell.t = 'n'; if (['RCA', 'rca_canonical_id', 'codigo_origem', 'status_relacionamento', 'Rede'].includes(header)) { cell.t = 's'; cell.v = String(cell.v ?? ''); } } }); sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }) }; }
function workbook(rows: Record<string, unknown>[], view: { motorBuildId: string; stagingManifestHash: string; generatedAt: string; competence: string }, report: string) { const headers = Object.keys(rows[0] ?? {}); const sheet = XLSX.utils.json_to_sheet(rows, { header: headers }); style(sheet, headers); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, sheet, report.slice(0, 31)); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metadata(view, report, rows.length)), 'METADATA'); return wb; }
export function createSellOutWorkbook(view: SellOutViewModel) { return workbook(sellOutExportRows(view), view, 'Sell Out'); }
export function createTopNetworksWorkbook(view: TopNetworksViewModel) { return workbook(topNetworksExportRows(view), view, 'Top Redes'); }
export function sellOutExportPayload(view: SellOutViewModel) { return { motorBuildId: view.motorBuildId, stagingManifestHash: view.stagingManifestHash, generatedAt: view.generatedAt, competence: view.competence, rowCount: view.vendorRows.length, totals: view.totals, records: sellOutExportRows(view) }; }
export function topNetworksExportPayload(view: TopNetworksViewModel) { return { motorBuildId: view.motorBuildId, stagingManifestHash: view.stagingManifestHash, generatedAt: view.generatedAt, competence: view.competence, rowCount: view.rows.length, totals: view.totals, records: topNetworksExportRows(view) }; }
function competenceName(competence: string) { const [year, month] = competence.split('-').map(Number); return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year || 2026, (month || 1) - 1, 1))).replace(/^./, value => value.toUpperCase()); }
const reportMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const templateUrl = (fileName: string) => new URL(`templates/${fileName}`, document.baseURI).toString();

export async function exportSellOutExcel(view: SellOutViewModel) { const template = await fetchTemplate(templateUrl('painel-sell-out-padrao.xlsx')); const data = fillSellOutTemplateBytes(template, view); download(new Blob([data], { type: reportMime }), `Painel Sell Out MILENIO - ${competenceName(view.competence)}.xlsx`); }
export async function exportTopNetworksExcel(view: TopNetworksViewModel) { const template = await fetchTemplate(templateUrl('top-redes-padrao.xlsx')); const data = fillTopNetworksTemplateBytes(template, view); download(new Blob([data], { type: reportMime }), `Top Redes MILENIO - ${competenceName(view.competence)}.xlsx`); }
export function exportSellOutJson(view: SellOutViewModel) { download(new Blob([JSON.stringify(sellOutExportPayload(view), null, 2)], { type: 'application/json' }), 'Sell_Out.json'); }
export function exportTopNetworksJson(view: TopNetworksViewModel) { download(new Blob([JSON.stringify(topNetworksExportPayload(view), null, 2)], { type: 'application/json' }), 'Top_Redes.json'); }
