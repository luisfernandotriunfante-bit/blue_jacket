import * as XLSX from 'xlsx';
import contract from './contracts/blueJacketContractV1.json' with { type: 'json' };
import type { CanonicalList } from './types';

type ListId = CanonicalList['id'];
type Field = { field: string; type: string; excel_format?: string };
export type ExportSourceReplacement = { source: string; scope: string };
export type ExportProvenance = {
  motorBuildId: string;
  stagingManifestHash: string;
  adminRegistryHash?: string;
  rcaTargetRegistryHash?: string;
  sourceContractVersion?: string;
  sourceReplacementProofHash?: string;
  sourceReplacements?: ExportSourceReplacement[];
  canonicalInputHash?: string;
  schemaVersion: string;
  engineVersion?: string;
  generatedAt?: string;
};

const schemas = contract.motor_schemas as Record<ListId, Field[]>;
const textTypes = new Set(['TEXT', 'CODE_TEXT', 'DOC_TEXT', 'CNPJ14_TEXT', 'GTIN_TEXT', 'ENUM_TEXT']);
const numberTypes = new Set(['INTEGER', 'DECIMAL', 'CURRENCY_BRL', 'PERCENT_DECIMAL']);
const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};

export function deterministicSourceReplacements(sourceReplacements: ExportSourceReplacement[] | undefined) {
  return [...(sourceReplacements ?? [])].sort((a, b) => `${a.source}|${a.scope}`.localeCompare(`${b.source}|${b.scope}`));
}

export function exportPayload(list: CanonicalList, provenance: ExportProvenance) {
  return {
    motorBuildId: provenance.motorBuildId,
    stagingManifestHash: provenance.stagingManifestHash,
    adminRegistryHash: provenance.adminRegistryHash ?? null,
    rcaTargetRegistryHash: provenance.rcaTargetRegistryHash ?? null,
    sourceContractVersion: provenance.sourceContractVersion ?? null,
    sourceReplacementProofHash: provenance.sourceReplacementProofHash ?? null,
    sourceReplacements: deterministicSourceReplacements(provenance.sourceReplacements),
    canonicalInputHash: provenance.canonicalInputHash ?? null,
    schemaVersion: provenance.schemaVersion,
    engineVersion: provenance.engineVersion ?? null,
    generatedAt: provenance.generatedAt ?? list.generatedAt,
    rowCount: list.records.length,
    listId: list.id,
    records: list.records,
  };
}

export function exportJson(list: CanonicalList, provenance: ExportProvenance) {
  download(new Blob([JSON.stringify(exportPayload(list, provenance), null, 2)], { type: 'application/json' }), `${list.id}.json`);
}

export function createExcelWorkbook(list: CanonicalList, provenance: ExportProvenance) {
  const fields = schemas[list.id];
  const sheet = XLSX.utils.aoa_to_sheet([
    fields.map(field => field.field),
    ...list.records.map(record => fields.map(field => record[field.field] ?? null)),
  ]);
  fields.forEach((field, column) => {
    for (let row = 1; row <= list.records.length; row += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (!cell) continue;
      if (textTypes.has(field.type)) {
        cell.t = 's';
        cell.v = String(cell.v);
      } else if (field.type === 'BOOLEAN') {
        cell.t = 'b';
        cell.v = Boolean(cell.v);
      } else if (field.type === 'DATE' && typeof cell.v === 'string') {
        cell.t = 'd';
        cell.v = new Date(`${cell.v}T00:00:00`);
      } else if (numberTypes.has(field.type) && typeof cell.v === 'number') cell.t = 'n';
      if (field.excel_format) cell.z = field.excel_format;
    }
  });
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: fields.length - 1 } }) };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, list.id.slice(0, 31));
  const sourceReplacements = JSON.stringify(deterministicSourceReplacements(provenance.sourceReplacements));
  const metadata = XLSX.utils.aoa_to_sheet([
    ['key', 'value'],
    ['motorBuildId', provenance.motorBuildId],
    ['stagingManifestHash', provenance.stagingManifestHash],
    ['adminRegistryHash', provenance.adminRegistryHash ?? ''],
    ['rcaTargetRegistryHash', provenance.rcaTargetRegistryHash ?? ''],
    ['sourceContractVersion', provenance.sourceContractVersion ?? ''],
    ['sourceReplacementProofHash', provenance.sourceReplacementProofHash ?? ''],
    ['sourceReplacements', sourceReplacements],
    ['canonicalInputHash', provenance.canonicalInputHash ?? ''],
    ['schemaVersion', provenance.schemaVersion],
    ['engineVersion', provenance.engineVersion ?? ''],
    ['generatedAt', provenance.generatedAt ?? list.generatedAt],
    ['rowCount', list.records.length],
    ['listId', list.id],
  ]);
  XLSX.utils.book_append_sheet(workbook, metadata, 'METADATA');
  return workbook;
}

export function exportExcel(list: CanonicalList, provenance: ExportProvenance) {
  const data = XLSX.write(createExcelWorkbook(list, provenance), { bookType: 'xlsx', type: 'array', cellDates: true });
  download(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${list.id}.xlsx`);
}
