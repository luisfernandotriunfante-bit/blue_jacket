import { readFileSync, writeFileSync } from 'node:fs';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

const templatePath = process.argv[2] || 'public/templates/top-redes-padrao.xlsx';

function normalizeWorksheetTarget(target) {
  const clean = String(target || '').replace(/^\//, '').replace(/^\.\//, '');
  return clean.startsWith('xl/') ? clean : `xl/${clean}`;
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name.replace(':','\\:')}="([^"]+)"`));
  return match?.[1] || '';
}

function cellTag(xml, reference) {
  const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return xml.match(new RegExp(`<c\\b[^>]*\\br="${escaped}"[^>]*>`))?.[0] || '';
}

function setCellStyle(xml, reference, styleId) {
  const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return xml.replace(new RegExp(`<c\\b[^>]*\\br="${escaped}"[^>]*>`), tag => {
    if (/\bs="[^"]+"/.test(tag)) return tag.replace(/\bs="[^"]+"/, `s="${styleId}"`);
    return tag.replace(/>$/, ` s="${styleId}">`);
  });
}

function extendConditionalRanges(xml) {
  return xml.replace(/\bsqref="([^"]+)"/g, (full, sqref) => {
    const updated = sqref.split(/\s+/).map(token => token
      .replace(/^F4:F\d+$/, 'F4:F1000')
      .replace(/^G4:G\d+$/, 'G4:G1000')
      .replace(/^H4:H\d+$/, 'H4:H1000')
    ).join(' ');
    return `sqref="${updated}"`;
  });
}

function conditionalDxfIds(sheetXml) {
  const ids = new Set();
  for (const match of sheetXml.matchAll(/<cfRule\b[^>]*\bdxfId="(\d+)"[^>]*>/g)) ids.add(Number(match[1]));
  return ids;
}

function removeConditionalNumberFormats(stylesXml, dxfIds) {
  let index = -1;
  return stylesXml.replace(/<dxf\b[^>]*>[\s\S]*?<\/dxf>/g, dxf => {
    index += 1;
    if (!dxfIds.has(index)) return dxf;
    return dxf
      .replace(/<numFmt\b[^>]*\/>/g, '')
      .replace(/<numFmt\b[^>]*>[\s\S]*?<\/numFmt>/g, '');
  });
}

const files = unzipSync(new Uint8Array(readFileSync(templatePath)));
const workbookXml = strFromU8(files['xl/workbook.xml']);
const relsXml = strFromU8(files['xl/_rels/workbook.xml.rels']);
const sheetTag = workbookXml.match(/<sheet\b[^>]*\bname="Top Redes"[^>]*\/?>(?:<\/sheet>)?/)?.[0];
if (!sheetTag) throw new Error('A aba Top Redes não foi localizada no modelo.');
const relationshipId = attribute(sheetTag, 'r:id');
if (!relationshipId) throw new Error('A relação da aba Top Redes não foi localizada.');
const relationshipTag = Array.from(relsXml.matchAll(/<Relationship\b[^>]*\/>/g)).map(match => match[0]).find(tag => attribute(tag,'Id') === relationshipId);
if (!relationshipTag) throw new Error('O arquivo XML da aba Top Redes não foi localizado.');
const sheetPath = normalizeWorksheetTarget(attribute(relationshipTag, 'Target'));

let sheetXml = strFromU8(files[sheetPath]);
const f4 = cellTag(sheetXml, 'F4');
const i4 = cellTag(sheetXml, 'I4');
const i4Style = attribute(i4, 's');
if (!f4 || !i4Style) throw new Error('As células-modelo F4/I4 não foram localizadas.');

// Realizado deve usar a mesma tipografia/alinhamento dos demais valores financeiros.
sheetXml = setCellStyle(sheetXml, 'F4', i4Style);
// As regras visuais de F/G/H precisam acompanhar todas as redes exportáveis.
sheetXml = extendConditionalRanges(sheetXml);

// O modelo antigo gravava numFmt=General dentro do DXF. No Excel isso sobrepunha
// o formato 0,00% de G/H e mostrava a fração crua. A condicional deve controlar
// apenas cor/preenchimento, nunca o formato numérico da célula.
const dxfIds = conditionalDxfIds(sheetXml);
const stylesXml = removeConditionalNumberFormats(strFromU8(files['xl/styles.xml']), dxfIds);

files[sheetPath] = strToU8(sheetXml);
files['xl/styles.xml'] = strToU8(stylesXml);
writeFileSync(templatePath, Buffer.from(zipSync(files, { level:6 })));
