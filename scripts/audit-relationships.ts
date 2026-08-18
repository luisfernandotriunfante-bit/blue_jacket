import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { detectSource, readWorkbook, sheetRows } from '../src/services/canonical/utils.ts';
import { parseActiveRoute, parseLegacyClientNetworkRecords, parsePremises, parsePriceList } from '../src/services/canonical/support.ts';
import { parseSales } from '../src/services/canonical/operations.ts';
import { reconcileNetworkAssignments } from '../src/services/canonical/reconciliation.ts';
import type { PremiseClient, ReferenceClientNetwork, RouteStore, SalesTransaction } from '../src/services/canonical/runtime.ts';
import { buildRelationshipContext } from '../src/services/canonical/relationships.ts';

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error('Uso: node scripts/audit-relationships.ts <arquivo1> <arquivo2> ...');
  process.exit(2);
}

const files: File[] = [];
for (const path of paths) {
  const [buffer, metadata] = await Promise.all([readFile(path), stat(path)]);
  files.push(new File([buffer], basename(path), { lastModified: metadata.mtimeMs }));
}

let premises: PremiseClient[] = [];
let routeStores: RouteStore[] = [];
let transactions: SalesTransaction[] = [];
let referenceRecords:ReferenceClientNetwork[] = [];
let priceList = { bySku: new Map(), byEan: new Map() } as ReturnType<typeof parsePriceList>;

const loaded: Array<{ file: string; kind: string; rows: number }> = [];
for (const file of files) {
  const kind = detectSource(file.name);
  if (kind === 'unknown' || kind.startsWith('history')) continue;
  const workbook = await readWorkbook(file, kind);
  const rows = sheetRows(workbook);
  loaded.push({ file: file.name, kind, rows: rows.length });
  if (kind === 'priceList') priceList = parsePriceList(rows);
  if (kind === 'premises') premises = parsePremises(rows);
  if (kind === 'activeRoute') routeStores = parseActiveRoute(workbook);
  if (kind === 'legacyTopNetworks') referenceRecords = parseLegacyClientNetworkRecords(workbook);
  if (kind === 'sales8022') transactions = parseSales(rows, priceList);
}

function duplicateSummary<T extends { cnpj: string }>(rows: T[], network: (row: T) => string) {
  const byCnpj = new Map<string, T[]>();
  rows.forEach(row => {
    const current = byCnpj.get(row.cnpj) || [];
    current.push(row);
    byCnpj.set(row.cnpj, current);
  });
  const duplicates = Array.from(byCnpj.entries()).filter(([, values]) => values.length > 1);
  const conflicts = duplicates.filter(([, values]) => new Set(values.map(network).filter(Boolean)).size > 1);
  return {
    rows: rows.length,
    unique: byCnpj.size,
    duplicateCnpjs: duplicates.length,
    conflictingNetworkCnpjs: conflicts.map(([cnpj, values]) => ({ cnpj, networks: [...new Set(values.map(network).filter(Boolean))] })),
  };
}

const relationships=buildRelationshipContext(transactions,premises,routeStores,referenceRecords);
const assignments = reconcileNetworkAssignments(transactions, relationships.premisesByCnpj, Array.from(relationships.routeByCnpj.values()), relationships.referenceNetworks, relationships.referenceByCnpj);
const transactionCnpjs = new Set(transactions.map(row => row.cnpj));
const transactionValues = new Map<string, number>();
transactions.forEach(row => transactionValues.set(row.cnpj, (transactionValues.get(row.cnpj) || 0) + row.value));

const sourceCoverage = (source: Set<string>) => {
  const matched = [...transactionCnpjs].filter(cnpj => source.has(cnpj));
  return {
    cnpjs: matched.length,
    value: matched.reduce((sum, cnpj) => sum + (transactionValues.get(cnpj) || 0), 0),
  };
};

const result = {
  loaded,
  sources: {
    sales8022: { rows: transactions.length, uniqueCnpjs: transactionCnpjs.size },
    premises: duplicateSummary(premises, row => row.network),
    activeRoute: duplicateSummary(routeStores, row => row.networkRaw),
    reference: { rows:referenceRecords.length, unique: relationships.referenceByCnpj.size },
  },
  coverageOfSales: {
    premises: sourceCoverage(new Set(premises.map(row => row.cnpj))),
    activeRoute: sourceCoverage(new Set(routeStores.map(row => row.cnpj))),
    reference: sourceCoverage(new Set(relationships.referenceNetworks.keys())),
  },
  assignments: {
    bySource: Object.fromEntries(['PREMISSAS', 'ROTEIRO', 'REFERENCIA', 'SEM_REDE'].map(source => {
      const rows = assignments.filter(row => row.source === source);
      return [source, { cnpjs: rows.length, value: rows.reduce((sum, row) => sum + row.value, 0) }];
    })),
    divergences: assignments.filter(row => row.divergentSources.length > 0),
    total: assignments.reduce((sum, row) => sum + row.value, 0),
  },
  relationshipAudit:relationships.audit,
};

console.log(JSON.stringify(result, null, 2));
