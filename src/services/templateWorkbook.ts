import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export type TemplateCellValue = string | number | boolean | Date | null | undefined;

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const DAY_MS = 86_400_000;

type SheetDocument = { path: string; document: XMLDocument };

function parseXml(value: Uint8Array, label: string): XMLDocument {
  const document = new DOMParser().parseFromString(strFromU8(value), 'application/xml');
  const error = document.getElementsByTagName('parsererror')[0];
  if (error) throw new Error(`Não foi possível ler ${label}: ${error.textContent || 'XML inválido'}`);
  return document;
}

function excelSerial(value: Date): number {
  const localAsUtc = Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), value.getHours(), value.getMinutes(), value.getSeconds(), value.getMilliseconds());
  return (localAsUtc - Date.UTC(1899, 11, 30)) / DAY_MS;
}

function columnNumber(reference: string): number {
  const letters = reference.replace(/[^A-Z]/gi, '').toUpperCase();
  let result = 0;
  for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
  return result;
}

function cellColumn(reference: string): string {
  return reference.replace(/\d+/g, '').toUpperCase();
}

function childElements(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter(child => child.localName === localName);
}

function rowNumber(row: Element): number {
  return Number(row.getAttribute('r')) || 0;
}

function clearCell(cell: Element) {
  Array.from(cell.children).forEach(child => cell.removeChild(child));
  cell.removeAttribute('t');
}

function setCellValue(document: XMLDocument, cell: Element, value: TemplateCellValue) {
  clearCell(cell);
  if (value === null || value === undefined || value === '') return;

  if (value instanceof Date) value = excelSerial(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return;
    const node = document.createElementNS(MAIN_NS, 'v');
    node.textContent = String(value);
    cell.appendChild(node);
    return;
  }
  if (typeof value === 'boolean') {
    cell.setAttribute('t', 'b');
    const node = document.createElementNS(MAIN_NS, 'v');
    node.textContent = value ? '1' : '0';
    cell.appendChild(node);
    return;
  }

  cell.setAttribute('t', 'inlineStr');
  const inline = document.createElementNS(MAIN_NS, 'is');
  const text = document.createElementNS(MAIN_NS, 't');
  text.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  text.textContent = String(value);
  inline.appendChild(text);
  cell.appendChild(inline);
}

function findRow(sheetData: Element, targetRow: number): Element | undefined {
  return childElements(sheetData, 'row').find(row => rowNumber(row) === targetRow);
}

function insertRow(sheetData: Element, row: Element, targetRow: number) {
  const next = childElements(sheetData, 'row').find(candidate => rowNumber(candidate) > targetRow);
  if (next) sheetData.insertBefore(row, next);
  else sheetData.appendChild(row);
}

function ensureRow(document: XMLDocument, sheetData: Element, targetRow: number, styleRow?: number): Element {
  const existing = findRow(sheetData, targetRow);
  if (existing) return existing;

  const source = styleRow ? findRow(sheetData, styleRow) : undefined;
  const row = source ? source.cloneNode(true) as Element : document.createElementNS(MAIN_NS, 'row');
  row.setAttribute('r', String(targetRow));
  childElements(row, 'c').forEach(cell => {
    cell.setAttribute('r', `${cellColumn(cell.getAttribute('r') || 'A')}${targetRow}`);
    clearCell(cell);
  });
  insertRow(sheetData, row, targetRow);
  return row;
}

function ensureCell(document: XMLDocument, row: Element, reference: string, styleSource?: Element): Element {
  const existing = childElements(row, 'c').find(cell => cell.getAttribute('r') === reference);
  if (existing) return existing;

  const column = cellColumn(reference);
  const source = styleSource ? childElements(styleSource, 'c').find(cell => cellColumn(cell.getAttribute('r') || '') === column) : undefined;
  const cell = source ? source.cloneNode(true) as Element : document.createElementNS(MAIN_NS, 'c');
  cell.setAttribute('r', reference);
  clearCell(cell);
  const targetColumn = columnNumber(reference);
  const next = childElements(row, 'c').find(candidate => columnNumber(candidate.getAttribute('r') || '') > targetColumn);
  if (next) row.insertBefore(cell, next);
  else row.appendChild(cell);
  return cell;
}

function stripWorksheetFormulas(document: XMLDocument) {
  Array.from(document.getElementsByTagNameNS(MAIN_NS, 'f')).forEach(formula => formula.parentNode?.removeChild(formula));
}

function normalizeTarget(target: string): string {
  const clean = target.replace(/^\//, '');
  return clean.startsWith('xl/') ? clean : `xl/${clean.replace(/^\.\//, '')}`;
}

export class TemplateWorkbook {
  private readonly files: Record<string, Uint8Array>;
  private readonly sheets = new Map<string, SheetDocument>();
  private workbookDocument?: XMLDocument;
  private relationDocument?: XMLDocument;

  private constructor(files: Record<string, Uint8Array>) {
    this.files = files;
  }

  static async load(url: string): Promise<TemplateWorkbook> {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Modelo não encontrado (${response.status}).`);
    return new TemplateWorkbook(unzipSync(new Uint8Array(await response.arrayBuffer())));
  }

  private getWorkbookDocument(): XMLDocument {
    if (!this.workbookDocument) this.workbookDocument = parseXml(this.files['xl/workbook.xml'], 'xl/workbook.xml');
    return this.workbookDocument;
  }

  private getRelationDocument(): XMLDocument {
    if (!this.relationDocument) this.relationDocument = parseXml(this.files['xl/_rels/workbook.xml.rels'], 'xl/_rels/workbook.xml.rels');
    return this.relationDocument;
  }

  private getSheet(name: string): SheetDocument {
    const cached = this.sheets.get(name);
    if (cached) return cached;

    const workbook = this.getWorkbookDocument();
    const sheet = Array.from(workbook.getElementsByTagNameNS(MAIN_NS, 'sheet')).find(candidate => candidate.getAttribute('name') === name);
    if (!sheet) throw new Error(`A aba “${name}” não existe no modelo.`);
    const relationshipId = sheet.getAttributeNS(REL_NS, 'id') || sheet.getAttribute('r:id');
    const relation = Array.from(this.getRelationDocument().getElementsByTagName('Relationship')).find(candidate => candidate.getAttribute('Id') === relationshipId);
    if (!relation) throw new Error(`Não foi possível localizar a aba “${name}” no pacote Excel.`);
    const path = normalizeTarget(relation.getAttribute('Target') || '');
    const result = { path, document: parseXml(this.files[path], path) };
    this.sheets.set(name, result);
    return result;
  }

  patchCells(sheetName: string, values: Record<string, TemplateCellValue>, styleRow?: number) {
    const { document } = this.getSheet(sheetName);
    const sheetData = document.getElementsByTagNameNS(MAIN_NS, 'sheetData')[0];
    if (!sheetData) throw new Error(`A aba “${sheetName}” não possui área de dados.`);
    const styleSource = styleRow ? findRow(sheetData, styleRow) : undefined;

    for (const [reference, value] of Object.entries(values)) {
      const targetRow = Number(reference.match(/\d+$/)?.[0] || 0);
      if (!targetRow) continue;
      const row = ensureRow(document, sheetData, targetRow, styleRow);
      const cell = ensureCell(document, row, reference, styleSource);
      setCellValue(document, cell, value);
    }
  }

  clearRows(sheetName: string, startRow: number, endRow: number, startColumn = 1, endColumn = 16384) {
    const { document } = this.getSheet(sheetName);
    const sheetData = document.getElementsByTagNameNS(MAIN_NS, 'sheetData')[0];
    if (!sheetData) return;
    childElements(sheetData, 'row').forEach(row => {
      const number = rowNumber(row);
      if (number < startRow || number > endRow) return;
      childElements(row, 'c').forEach(cell => {
        const column = columnNumber(cell.getAttribute('r') || '');
        if (column >= startColumn && column <= endColumn) clearCell(cell);
      });
    });
  }

  private serializeSheets() {
    for (const [path, bytes] of Object.entries(this.files)) {
      if (!/^xl\/worksheets\/[^/]+\.xml$/.test(path)) continue;
      const cached = Array.from(this.sheets.values()).find(sheet => sheet.path === path);
      const document = cached?.document || parseXml(bytes, path);
      stripWorksheetFormulas(document);
      this.files[path] = strToU8(new XMLSerializer().serializeToString(document));
    }
  }

  download(fileName: string) {
    this.serializeSheets();
    const blob = new Blob([zipSync(this.files, { level: 6 })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 2_000);
  }
}
