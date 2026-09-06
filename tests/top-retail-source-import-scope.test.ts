import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourceImport = fs.readFileSync(new URL('../src/canonical/sourceImport.ts', import.meta.url), 'utf8');
const topRetailM2 = fs.readFileSync(new URL('../src/canonical/topRetailM2.ts', import.meta.url), 'utf8');

test('Roteiro Top/Registry é materializado no M2 antes de salvar o build ativo v21; v20 é legado', () => {
  const buildIndex = sourceImport.indexOf('const bundle = buildCanonicalBundleFromStaging(parsedSources);');
  const registryAuthorityIndex = sourceImport.indexOf('applyAdminRegistryCanonicalAuthority(bundle, parsedSources, registry);', buildIndex);
  const topIndex = sourceImport.indexOf('bundle.lists.M2_CLIENTE_RCA = materializeTopRetailRouteInM2', registryAuthorityIndex);
  const saveIndex = sourceImport.indexOf('await saveGeneratedBuild(active, lists', topIndex);

  assert.ok(buildIndex >= 0);
  assert.ok(registryAuthorityIndex > buildIndex);
  assert.ok(topIndex > registryAuthorityIndex);
  assert.ok(saveIndex > topIndex);
  assert.ok(sourceImport.includes('browser-stage4-product-assortment-v21-source-replacement'));
  assert.match(sourceImport, /sourceReplacementProofHash/);
  assert.match(topRetailM2, /routeCompetence === targetCompetence/);
  assert.match(topRetailM2, /resolveTopAuthority\(registry, targetCompetence, cnpj, imported\)/);
  assert.match(topRetailM2, /SOURCE_PRESERVED/);
});
