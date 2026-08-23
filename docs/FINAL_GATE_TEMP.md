# Gate final temporário
TYPECHECK=0
TESTS=1
BUILD=0

## Typecheck

> blue-jacket@0.1.0 typecheck
> tsc --noEmit


## Falhas de testes
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/runner/work/blue_jacket/blue_jacket/src/services/canonical/operations.ts' imported from /home/runner/work/blue_jacket/blue_jacket/tests/business-rules.test.ts
  code: 'ERR_MODULE_NOT_FOUND',
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/runner/work/blue_jacket/blue_jacket/src/services/canonical/operations.ts' imported from /home/runner/work/blue_jacket/blue_jacket/tests/packaging.test.ts
  code: 'ERR_MODULE_NOT_FOUND',
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/runner/work/blue_jacket/blue_jacket/src/services/canonical/support.ts' imported from /home/runner/work/blue_jacket/blue_jacket/tests/parsers.test.ts
  code: 'ERR_MODULE_NOT_FOUND',
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/runner/work/blue_jacket/blue_jacket/src/services/canonical/aggregate.ts' imported from /home/runner/work/blue_jacket/blue_jacket/tests/relationships.test.ts
  code: 'ERR_MODULE_NOT_FOUND',
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/runner/work/blue_jacket/blue_jacket/src/services/canonical/reconciliation.ts' imported from /home/runner/work/blue_jacket/blue_jacket/tests/utils-and-reconciliation.test.ts
  code: 'ERR_MODULE_NOT_FOUND',
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /loadManualConfiguration\(localStorage,competence/. Input:
    code: 'ERR_ASSERTION',
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /values\[ref\('K',row\)\] = network\.networkAttainment/. Input:
    code: 'ERR_ASSERTION',
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /warnings:Array\.from\(new Set\(\[\.\.\.normalized\.warnings,manualConfigPersistenceError\]\)\)/. Input:
    code: 'ERR_ASSERTION',
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /applyReceiptReconciliation/. Input:
    code: 'ERR_ASSERTION',

## Resíduos proibidos no runtime

## Build

> blue-jacket@0.1.0 build
> tsc --noEmit && vite build

[36mvite v8.2.1 [32mbuilding client environment for production...[36m[39m
[2Ktransforming...✓ 79 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.71 kB │ gzip:   0.40 kB
dist/assets/index-CYfqs_hg.css   28.07 kB │ gzip:   5.80 kB
dist/assets/index-e_sUjV3-.js   987.12 kB │ gzip: 309.41 kB

[33m[plugin builtin:vite-reporter] 
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.[39m
[32m✓ built in 397ms[39m
