import { strToU8, unzipSync, zipSync } from 'fflate';
import type { SellOutViewModel, TopNetworksViewModel } from './operationalViewModels';

const XML = new TextDecoder(); const UTF8 = new TextEncoder();
type CellValue = string | number | null;
type WorkbookEntries = Record<string, Uint8Array>;
const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const money = (value: number | null | undefined) => Number.isFinite(value) ? value! : null;

function sheetPath(entries: WorkbookEntries, sheetName: string) {
  const workbook = XML.decode(entries['xl/workbook.xml'] ?? new Uint8Array());
  const relationshipId = workbook.match(new RegExp(`<sheet\\b[^>]*\\bname="${sheetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*\\br:id="([^"]+)"`, 'i'))?.[1];
  if (!relationshipId) throw new Error(`REPORT_TEMPLATE_SHEET_MISSING:${sheetName}`);
  const rels = XML.decode(entries['xl/_rels/workbook.xml.rels'] ?? new Uint8Array());
  const target = rels.match(new RegExp(`<Relationship\\b(?=[^>]*\\bId="${relationshipId}")[^>]*\\bTarget="([^"]+)"`, 'i'))?.[1];
  if (!target) throw new Error(`REPORT_TEMPLATE_RELATIONSHIP_MISSING:${sheetName}`);
  return `xl/${target.replace(/^\/+/, '').replace(/^\.\//, '')}`;
}

function cellXml(address: string, value: CellValue, style?: string) {
  const styleAttr = style ? ` s="${style}"` : '';
  if (value === null || value === undefined) return `<c r="${address}"${styleAttr}/>`;
  if (typeof value === 'number') return `<c r="${address}"${styleAttr}><v>${value}</v></c>`;
  return `<c r="${address}"${styleAttr} t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function setCells(xml: string, cells: Record<string, CellValue>) {
  let result = xml;
  for (const [address, value] of Object.entries(cells)) {
    const row = Number(address.match(/\d+$/)?.[0]); if (!row) throw new Error(`REPORT_TEMPLATE_CELL_INVALID:${address}`);
    const cellPattern = new RegExp(`<c\\b([^>]*\\br="${address}"[^>]*)>(?:[\\s\\S]*?)<\\/c>|<c\\b([^>]*\\br="${address}"[^>]*)\\/>`, 'i');
    const found = result.match(cellPattern); const style = found ? (found[1] ?? found[2] ?? '').match(/\bs="([^"]+)"/)?.[1] : undefined;
    if (found) { result = result.replace(cellPattern, cellXml(address, value, style)); continue; }
    const rowPattern = new RegExp(`(<row\\b[^>]*\\br="${row}"[^>]*>)([\\s\\S]*?)(<\\/row>)`, 'i');
    if (rowPattern.test(result)) result = result.replace(rowPattern, (_, start, body, end) => `${start}${body}${cellXml(address, value)}${end}`);
    else result = result.replace('</sheetData>', `<row r="${row}">${cellXml(address, value)}</row></sheetData>`);
  }
  return result;
}

function replaceDataRows(xml: string, startRow: number, rows: CellValue[][]) {
  const kept = [...xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/gi)].filter(match => Number(match[1]) < startRow).map(match => match[0]).join('');
  const generated = rows.map((row, index) => `<row r="${startRow + index}">${row.map((value, col) => cellXml(`${columnName(col)}${startRow + index}`, value)).join('')}</row>`).join('');
  return xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/i, `<sheetData>${kept}${generated}</sheetData>`);
}
function columnName(index: number) { let n = index + 1; let output = ''; while (n) { const remainder = (n - 1) % 26; output = String.fromCharCode(65 + remainder) + output; n = Math.floor((n - 1) / 26); } return output; }
function patch(entries: WorkbookEntries, name: string, fn: (xml: string) => string) { const path = sheetPath(entries, name); entries[path] = UTF8.encode(fn(XML.decode(entries[path] ?? new Uint8Array()))); }
function updateCoreProperties(entries: WorkbookEntries, title: string, description: string) { const path = 'docProps/core.xml'; if (!entries[path]) return; let xml = XML.decode(entries[path]); xml = xml.replace(/<dc:title>[\s\S]*?<\/dc:title>/, `<dc:title>${escapeXml(title)}</dc:title>`).replace(/<dc:description>[\s\S]*?<\/dc:description>/, `<dc:description>${escapeXml(description)}</dc:description>`); entries[path] = UTF8.encode(xml); }
function staticSnapshot(entries: WorkbookEntries, keepSheets: string[]) {
  const workbookPath = 'xl/workbook.xml'; const relsPath = 'xl/_rels/workbook.xml.rels'; let workbook = XML.decode(entries[workbookPath]); let rels = XML.decode(entries[relsPath]);
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"[^>]*\/?>(?:<\/sheet>)?/gi)];
  const keptIds = new Set<string>(); const removedTargets: string[] = [];
  for (const sheet of sheets) { const name = sheet[1]; const id = sheet[2]; const relationship = rels.match(new RegExp(`<Relationship\\b(?=[^>]*\\bId="${id}")[^>]*\\bTarget="([^"]+)"[^>]*/>`, 'i')); if (keepSheets.includes(name)) keptIds.add(id); else if (relationship?.[1]) removedTargets.push(`xl/${relationship[1].replace(/^\/+/, '').replace(/^\.\//, '')}`); }
  workbook = workbook.replace(/<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"[^>]*\/?>(?:<\/sheet>)?/gi, (match, name, id) => keepSheets.includes(name) ? match : '');
  rels = rels.replace(/<Relationship\b(?=[^>]*\bId="([^"]+)")[^>]*\/>/gi, (match, id) => keptIds.has(id) || !sheets.some(sheet => sheet[2] === id) ? match : '');
  entries[workbookPath] = UTF8.encode(workbook.replace(/<definedNames>[\s\S]*?<\/definedNames>/i, '')); entries[relsPath] = UTF8.encode(rels);
  for (const target of removedTargets) { delete entries[target]; const relationPath = target.replace('xl/worksheets/', 'xl/worksheets/_rels/') + '.rels'; delete entries[relationPath]; }
  for (const path of Object.keys(entries)) {
    if (path === 'xl/calcChain.xml' || path === 'xl/connections.xml' || path === 'xl/vbaProject.bin' || path.startsWith('xl/externalLinks/') || path.startsWith('xl/queryTables/')) delete entries[path];
    else if (path.startsWith('xl/worksheets/') && path.endsWith('.xml')) entries[path] = UTF8.encode(XML.decode(entries[path]).replace(/<f(?:\s[^>]*)?>[\s\S]*?<\/f>|<f(?:\s[^>]*)?\/>/gi, ''));
  }
  if (entries['[Content_Types].xml']) { let types = XML.decode(entries['[Content_Types].xml']); for (const target of removedTargets) types = types.replace(new RegExp(`<Override PartName="/${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`, 'g'), ''); types = types.replace(/<Override PartName="\/xl\/(calcChain|connections)\.xml"[^>]*\/>/g, '').replace(/<Override PartName="\/xl\/externalLinks\/[^>]*>/g, ''); entries['[Content_Types].xml'] = UTF8.encode(types); }
}
function workbookBytes(bytes: Uint8Array, keepSheets: string[], mutate: (entries: WorkbookEntries) => void) { const entries = unzipSync(bytes); mutate(entries); staticSnapshot(entries, keepSheets); return zipSync(entries, { level: 6 }); }

function sellOutCells(view: SellOutViewModel): Record<string, CellValue> {
  const topLines = [...view.salesByLine.slice(0, 4)]; const remainder = view.salesByLine.slice(4).reduce((sum, row) => sum + row.realized, 0); if (remainder > 0) topLines.push({ line: 'PENDENTE / DEMAIS LINHAS', invoiced: 0, toInvoice: 0, realized: remainder, share: remainder / view.totals.realized, resolutionStatus: 'UNCLASSIFIED' });
  const cells: Record<string, CellValue> = { G1: view.competence, G2: view.competence, F3: view.totals.daysWithSales, F4: view.totals.daysWithSales, E6: 'MILÊNIO', F6: view.competence, M3: view.totals.daysWithSales ? view.totals.salesTarget / view.totals.daysWithSales : null, M4: view.totals.daysWithSales ? view.totals.realized / view.totals.daysWithSales : null, M5: null, M8: view.totals.salesTarget, M9: view.totals.invoiced, J10: 'A Faturar', M10: view.totals.toInvoice, M11: view.totals.realized, M12: null, M15: null, M16: null, L19: money(view.stock?.atSale), L20: null, L21: null, L22: null, L23: null, L26: money(view.stock?.atCost), L27: null, L28: null, L29: null, L30: null, L34: view.totals.positivityTarget, L35: view.totals.positiveCustomers, L36: null, L37: null, E40: view.totals.realized, F40: view.totals.invoiced, G40: view.totals.positiveCustomers, E41: view.totals.realized, F41: view.totals.invoiced, G41: view.totals.positiveCustomers };
  for (let day = 1; day <= 31; day += 1) { const date = `${view.competence}-${String(day).padStart(2, '0')}`; const row = view.dailyRows.find(item => item.date === date); const target = 7 + day; cells[`C${target}`] = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000) + 25569; cells[`E${target}`] = row?.realized ?? 0; cells[`F${target}`] = row?.invoiced ?? 0; cells[`G${target}`] = 0; }
  for (let index = 0; index < 5; index += 1) { const row = topLines[index]; const col = columnName(9 + index); cells[`${col}40`] = row?.line ?? null; cells[`${col}41`] = row?.realized ?? 0; cells[`${col}42`] = row?.share ?? null; cells[`${col}43`] = null; }
  const sellPercent = view.totals.salesAchievement; cells.N4 = view.totals.daysWithSales ? view.totals.realized / view.totals.daysWithSales / (view.totals.salesTarget / view.totals.daysWithSales) : null; cells.N8 = sellPercent; cells.N9 = sellPercent; cells.N10 = null; cells.N11 = sellPercent; cells.N12 = null;
  const topNetworks = view.networkRows.slice(0, 5); const blocks = [7, 14, 21, 28, 35]; cells.Q3 = null; cells.Q4 = null; cells.R4 = null;
  blocks.forEach((start, index) => { const row = topNetworks[index]; cells[`Q${start - 1}`] = row?.network ?? null; cells[`R${start - 1}`] = row?.realized ?? null; cells[`P${start}`] = row?.network ?? null; cells[`Q${start + 1}`] = row?.networkTarget; cells[`R${start + 1}`] = row?.achievement; cells[`Q${start + 2}`] = row?.invoiced ?? null; cells[`R${start + 2}`] = row?.networkTarget ? row.invoiced / row.networkTarget : null; cells[`Q${start + 3}`] = null; cells[`R${start + 3}`] = null; cells[`Q${start + 4}`] = row?.realized ?? null; cells[`R${start + 4}`] = row?.networkTarget ? row.realized / row.networkTarget : null; cells[`Q${start + 5}`] = null; cells[`R${start + 5}`] = null; });
  return cells;
}

export function fillSellOutTemplateBytes(template: Uint8Array, view: SellOutViewModel) { return workbookBytes(template, ['SELL OUT - Milenio 2026', 'EQUIPES'], entries => { patch(entries, 'SELL OUT - Milenio 2026', xml => setCells(xml, sellOutCells(view))); const teamRows = view.vendorRows.map(row => [row.label, row.salesTarget, row.invoiced, row.toInvoice, row.realized, row.positiveCustomers, row.achievement]); patch(entries, 'EQUIPES', xml => replaceDataRows(xml, 3, [['RCA', 'META', 'FATURADO', 'A FATURAR', 'SELL OUT', 'POSITIVAÇÃO', 'ATINGIMENTO'], ...teamRows])); updateCoreProperties(entries, 'Painel Sell Out MILENIO', `Snapshot estático do build ${view.motorBuildId}; competência ${view.competence}`); }); }

function topRows(view: TopNetworksViewModel) { return view.rows.map(row => [row.network, '—', '—', row.networkTarget, row.topTarget, row.invoiced, row.networkTarget ? row.invoiced / row.networkTarget : null, row.topTarget ? row.invoiced / row.topTarget : null, row.toInvoice, row.networkTarget === null ? null : row.networkTarget - row.realized, row.networkTarget ? row.realized / row.networkTarget : null, row.topTarget ? row.realized / row.topTarget : null, view.generatedAt]); }
export function fillTopNetworksTemplateBytes(template: Uint8Array, view: TopNetworksViewModel) { return workbookBytes(template, ['Top Redes'], entries => { patch(entries, 'Top Redes', xml => { let next = replaceDataRows(xml, 3, [['REDE', 'EQUIPE', 'CÓD RCA', 'META REDES', 'META TOPS', 'FATURADO R$', '% FAT. REDES', '% FAT. TOPS', 'A FATURAR R$', 'GAP R$', '% FAT. + A FATURAR REDES', '% FAT. + A FATURAR TOPS', 'ATUALIZADO'], ...topRows(view)]); return setCells(next, { B2: view.competence, D2: view.totals.networkTarget === null ? 'Não configurada' : view.totals.networkTarget, E2: view.rows.reduce((sum, row) => sum + (row.topTarget ?? 0), 0), F2: view.totals.invoiced, I2: view.totals.toInvoice, M2: view.generatedAt }); }); updateCoreProperties(entries, 'Top Redes MILENIO', `Snapshot estático do build ${view.motorBuildId}; competência ${view.competence}`); }); }

export async function fetchTemplate(path: string) { const response = await fetch(path); if (!response.ok) throw new Error(`REPORT_TEMPLATE_LOAD_FAILED:${path}`); return new Uint8Array(await response.arrayBuffer()); }
