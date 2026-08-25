import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { buildSellOutViewModel } from '../src/canonical/operationalViewModels.ts';
import { fillSellOutTemplateBytes } from '../src/canonical/reportTemplates.ts';

const base = { sources: [], generatedAt: '2026-08-25T00:00:00Z', competence: '2026-08', snapshotDate: '2026-08-25', warnings: [], errors: [] };
const m2 = { ...base, id: 'M2_CLIENTE_RCA' as const, records: [] };
const m3 = { ...base, id: 'M3_MOVIMENTO_VENDAS' as const, records: [] };

const rows = ['Creme Dental', 'Esc + Enx + Fio', 'Sabonetes', 'Hair', 'Limpeza'].map((line, index) => ({
  line,
  invoiced: (index + 1) * 10,
  toInvoice: 0,
  realized: (index + 1) * 10,
  share: (index + 1) / 15,
  resolutionStatus: 'CLASSIFIED' as const,
}));

test('Excel oficial preserva os nomes das cinco linhas canônicas sem transformar a quinta em pendência', () => {
  const baseView = buildSellOutViewModel({ m2, m3, generatedAt: '2026-08-25T00:00:00Z' });
  const view = { ...baseView, salesByLine: rows, totals: { ...baseView.totals, realized: 150, invoiced: 150 } };
  const bytes = fillSellOutTemplateBytes(new Uint8Array(readFileSync('public/templates/painel-sell-out-padrao.xlsx')), view);
  const reopened = XLSX.read(bytes, { type: 'array', cellDates: true });
  const sheet = reopened.Sheets['SELL OUT - Milenio 2026']!;
  assert.deepEqual(['J40', 'K40', 'L40', 'M40', 'N40'].map(address => sheet[address]?.v), ['Creme Dental', 'Esc + Enx + Fio', 'Sabonetes', 'Hair', 'Limpeza']);
  assert.equal(sheet.N41?.v, 50);
});
