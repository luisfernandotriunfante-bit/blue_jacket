# Gate final 3
TYPECHECK=0
TEST_COMMAND=0
BUILD=0
TESTS_TOTAL=unknown
TESTS_PASS=unknown
TESTS_FAIL=unknown

## Falhas / resumo de testes

## Resíduos proibidos no runtime

## Typecheck output

> blue-jacket@0.1.0 typecheck
> tsc --noEmit


## Build output

> blue-jacket@0.1.0 build
> tsc --noEmit && vite build

[36mvite v8.2.1 [32mbuilding client environment for production...[36m[39m
[2Ktransforming...✓ 79 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.71 kB │ gzip:   0.40 kB
dist/assets/index-CYfqs_hg.css   28.07 kB │ gzip:   5.80 kB
dist/assets/index-e_sUjV3-.js   987.12 kB │ gzip: 309.41 kB

[32m✓ built in 406ms[39m
[33m[plugin builtin:vite-reporter] 
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.[39m
