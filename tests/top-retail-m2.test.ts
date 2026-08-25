import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeTopRetailRouteInM2 } from '../src/canonical/topRetailM2.ts';
import type { CanonicalList, ParsedSource, RawTyped } from '../src/canonical/types.ts';

const rt = (typed: unknown): RawTyped => ({ raw: typed, typed });
const base = { sources: ['Nova Base de Premissas - Q3.xlsx'], generatedAt: '2026-08-25T00:00:00Z', competence: '2026-08', snapshotDate: '2026-08-25', warnings: [], errors: [] };
const m2: CanonicalList = { ...base, id: 'M2_CLIENTE_RCA', records: [{ customer_canonical_id: 'CUSTOMER:00111111000100', cnpj: '00111111000100', customer_name: 'CLIENTE TESTE', premise_network: 'REDE PREMISSAS' }] };
const route: ParsedSource = {
  source: "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx",
  fileName: 'roteiro.xlsx',
  sheet: 'Roteiro Ativo',
  rows: [{
    cnpj: rt('00111111000100'),
    top_network: rt('REDE TOP'),
    banner: rt('BANDEIRA TOP'),
    manager_cnpj: rt('00999999000100'),
    group_code: rt('GRUPO TOP'),
    top_category: rt('OURO'),
    top_target: rt(1234.56),
    store_name: rt('LOJA TOP'),
  }],
  audits: [],
};

test('Roteiro Ativo entra no M2 persistido sem substituir a rede de Premissas e preserva o gestor', () => {
  const result = materializeTopRetailRouteInM2(m2, [route]);
  const customer = result.records.find(row => row.cnpj === '00111111000100')!;
  assert.equal(customer.premise_network, 'REDE PREMISSAS');
  assert.equal(customer.top_network, 'REDE TOP');
  assert.equal(customer.top_banner, 'BANDEIRA TOP');
  assert.equal(customer.manager_cnpj, '00999999000100');
  assert.equal(customer.top_group_code, 'GRUPO TOP');
  assert.equal(customer.top_category, 'OURO');
  assert.equal(customer.top_target, 1234.56);
  assert.ok(result.sources.includes("08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx"));
});
