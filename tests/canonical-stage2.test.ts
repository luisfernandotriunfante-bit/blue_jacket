import test from 'node:test';
import assert from 'node:assert/strict';
import { gtin, typed } from '../src/canonical/normalization.ts';

test('normalization preserves codes and money types',()=>{assert.equal(gtin('7.50955E+12'),'7509550000000');assert.equal(typed('R$ 1.234,56','CURRENCY_BRL').typed,1234.56);assert.equal(typed('759.0','CODE_TEXT').typed,'759')});
test.skip('physical source parser integration belongs to the controlled ingestion stage',()=>{});
