import assert from 'node:assert/strict';
import test from 'node:test';
import { SOURCE_IDS } from '../src/canonical/parsers.ts';
import { sourceDependencyMatrix, sourceOmissionMatrix } from '../src/canonical/sourceDependencyContract.ts';
import type { ParsedSource } from '../src/canonical/types.ts';

const stage = (source: string): ParsedSource => ({
  source,
  fileName: source,
  sheet: 'omission-proof',
  rows: [],
  audits: [],
});

test('D32B — cada uma das 19 fontes é realmente omitida individualmente no diagnóstico de domínio', () => {
  const completeStages = SOURCE_IDS.map(stage);
  const contracts = new Map(sourceDependencyMatrix().map(contract => [contract.id, contract]));

  assert.equal(completeStages.length, 19);

  for (const sourceId of SOURCE_IDS) {
    const omittedStages = completeStages.filter(current => current.source !== sourceId);
    assert.equal(omittedStages.length, 18, sourceId);
    assert.equal(omittedStages.some(current => current.source === sourceId), false, sourceId);

    const matrix = sourceOmissionMatrix(omittedStages, null, null);
    assert.equal(matrix.length, 19, sourceId);
    const diagnostic = matrix.find(entry => entry.sourceId === sourceId);
    assert.ok(diagnostic, sourceId);
    assert.equal(diagnostic.silentDefaultRisk, true, sourceId);
    assert.ok(diagnostic.functionsWithoutInput.length > 0, sourceId);

    const contract = contracts.get(sourceId)!;
    if (contract.replacementCandidate) {
      assert.equal(diagnostic.classification, 'UNRESOLVED_DEPENDENCY', sourceId);
      assert.notEqual(diagnostic.replacementStatus, 'READY', sourceId);
    } else {
      assert.equal(diagnostic.classification, 'HARD_REQUIRED', sourceId);
      assert.equal(diagnostic.replacementStatus, 'NOT_APPLICABLE', sourceId);
    }
  }
});
