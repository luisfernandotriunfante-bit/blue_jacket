import { strToU8, zipSync } from 'fflate';
import type { CanonicalState } from '../domain/canonical';
import { buildStockPresentation, DEFAULT_STOCK_ALERT_CONFIGURATION } from '../domain/stockModel';
import { LEGACY_STOCK_REFERENCE } from './legacyStockReference';

export interface LegacyStockReportRow {
  code: string;
  ean: string;
  description: string;
  unitsPerCase: number | null;
  multiple: number | null;
  unitPrice: number | null;
  unitPriceSt: number | null;
  boxPrice: number | null;
  boxPriceSt: number | null;
  stockCases: number | null;
  launch: string;
  stPercent: number | null;
}

const xmlEscape = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const positiveOrNull = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

function numericCodeSort(left: string, right: string) {
  const a = Number(left); const b = Number(right);
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
  return left.localeCompare(right, 'pt-BR');
}

export function buildLegacyStockReportRows(state: CanonicalState): LegacyStockReportRow[] {
  const hasStock8013 = state.sources.some(source => source.kind === 'stock8013' && source.loaded);
  const presentation = buildStockPresentation({
    inventory: state.inventory,
    productSupport: state.support.products,
    itemCodeSupport: state.support.itemCodes,
    transactions: state.transactions,
    businessDaysElapsed: state.sellOut.businessDaysElapsed,
    stockCostValue: state.stock.costValue,
    stockSaleValue: state.stock.saleValue,
    hasStock8013,
    alertConfiguration: DEFAULT_STOCK_ALERT_CONFIGURATION,
  });

  return presentation.products
    .filter(product => product.hasWinthor && /^\d+$/.test(product.code))
    .map(product => {
      const [multiple, stPercent] = LEGACY_STOCK_REFERENCE[product.code] || [null, null];
      const unitPrice = positiveOrNull(product.saleUnit);
      const unitsPerCase = positiveOrNull(product.unitsPerCase);
      const unitPriceSt = unitPrice !== null && stPercent !== null ? unitPrice * (1 + stPercent / 100) : null;
      const boxPrice = unitPrice !== null && unitsPerCase !== null ? unitPrice * unitsPerCase : null;
      const boxPriceSt = unitPriceSt !== null && unitsPerCase !== null ? unitPriceSt * unitsPerCase : null;
      return {
        code: product.code,
        ean: product.ean || '',
        description: product.description || '',
        unitsPerCase,
        multiple: numberOrNull(multiple),
        unitPrice,
        unitPriceSt,
        boxPrice,
        boxPriceSt,
        // O relatório antigo chama esta coluna de ESTOQUE CX. Só usamos a
        // evidência explícita de caixas do 8013; sem essa fonte não convertemos
        // unidades em caixas por aproximação.
        stockCases: hasStock8013 ? Math.max(Number(product.physicalCases) || 0, 0) : null,
        launch: product.isLaunch ? 'X' : '',
        stPercent: numberOrNull(stPercent),
      } satisfies LegacyStockReportRow;
    })
    .sort((left, right) => numericCodeSort(left.code, right.code));
}

function inlineCell(reference: string, value: string, style: number) {
  if (!value) return `<c r="${reference}" s="${style}" t="inlineStr"><is><t></t></is></c>`;
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function numericCell(reference: string, value: number | null, style: number) {
  return value === null || !Number.isFinite(value)
    ? `<c r="${reference}" s="${style}"/>`
    : `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
}

function worksheetXml(rows: LegacyStockReportRow[]) {
  const endRow = Math.max(rows.length + 2, 3);
  const dataRows = rows.map((item, index) => {
    const row = index + 3;
    return `<row r="${row}" ht="15" customHeight="1">`
      + inlineCell(`A${row}`, item.code, 4)
      + inlineCell(`B${row}`, item.ean, 8)
      + inlineCell(`C${row}`, item.description, 4)
      + numericCell(`D${row}`, item.unitsPerCase, 5)
      + numericCell(`E${row}`, item.multiple, 5)
      + numericCell(`F${row}`, item.unitPrice, 6)
      + numericCell(`G${row}`, item.unitPriceSt, 6)
      + numericCell(`H${row}`, item.boxPrice, 6)
      + numericCell(`I${row}`, item.boxPriceSt, 6)
      + numericCell(`J${row}`, item.stockCases, 5)
      + inlineCell(`K${row}`, item.launch, item.launch ? 7 : 5)
      + `</row>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:K${endRow}"/>
<sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A3" sqref="A3"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>
<col min="1" max="1" width="10.109375" customWidth="1"/><col min="2" max="2" width="16.77734375" customWidth="1"/>
<col min="3" max="3" width="54" customWidth="1"/><col min="4" max="4" width="17.77734375" customWidth="1"/>
<col min="5" max="5" width="15.88671875" customWidth="1"/><col min="6" max="6" width="18.6640625" customWidth="1"/>
<col min="7" max="7" width="21.44140625" customWidth="1"/><col min="8" max="8" width="16.77734375" customWidth="1"/>
<col min="9" max="9" width="19.6640625" customWidth="1"/><col min="10" max="10" width="17.88671875" customWidth="1"/>
<col min="11" max="11" width="20.88671875" customWidth="1"/>
</cols>
<sheetData>
<row r="1" ht="20" customHeight="1">${inlineCell('A1','INFORMAÇÕES DO ITEM',1)}${inlineCell('F1','PREÇOS',1)}${inlineCell('J1','ESTOQUE',1)}${inlineCell('K1','LANÇAMENTOS',2)}</row>
<row r="2" ht="18" customHeight="1">${['COD','EAN','DESCRIÇÃO','QUANT EMB','MULTIPLO','PREÇO UND','PREÇO UND ST','PREÇO CX','PREÇO CX ST','ESTOQUE CX','LANÇAMENTOS'].map((value,index)=>inlineCell(`${String.fromCharCode(65+index)}2`,value,3)).join('')}</row>
${dataRows}
</sheetData>
<mergeCells count="2"><mergeCell ref="A1:E1"/><mergeCell ref="F1:I1"/></mergeCells>
<autoFilter ref="A2:K${endRow}"/>
<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00"/></numFmts>
<fonts count="3">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><color rgb="FFFF0000"/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFBFBFBF"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE7E6E6"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFE699"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="23256" windowHeight="12456"/></bookViews><sheets><sheet name="PREÇO" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029"/></workbook>`;
const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Blue Jacket</Application><AppVersion>1.0</AppVersion></Properties>`;

function coreXml(state: CanonicalState) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Relatório de Estoque - Padrão Antigo</dc:title><dc:creator>Blue Jacket</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${xmlEscape(state.generatedAt || new Date().toISOString())}</dcterms:created></cp:coreProperties>`;
}

export function buildLegacyStockReportXlsx(state: CanonicalState): Uint8Array {
  const rows = buildLegacyStockReportRows(state);
  if (!rows.length) throw new Error('Não há produtos Winthor disponíveis para gerar o relatório de estoque.');
  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rootRels),
    'docProps/app.xml': strToU8(appXml),
    'docProps/core.xml': strToU8(coreXml(state)),
    'xl/workbook.xml': strToU8(workbookXml),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRels),
    'xl/styles.xml': strToU8(stylesXml),
    'xl/worksheets/sheet1.xml': strToU8(worksheetXml(rows)),
  }, { level: 6 });
}

export function downloadLegacyStockReport(state: CanonicalState) {
  const bytes = buildLegacyStockReportXlsx(state);
  const copied = new Uint8Array(bytes.byteLength);
  copied.set(bytes);
  const blob = new Blob([copied.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `Relatorio Estoque Colgate - ${state.referenceDate || 'atual'}.xlsx`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2_000);
}