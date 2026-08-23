# Auditoria de fechamento da limpeza

- Typecheck exit: 2
- Tests exit: 1
- Build exit: 2

## Referências aos módulos canônicos antigos
src/services/motors/salesMotor.ts:6:import { parseCompassTargets } from '../canonical/support';
src/services/motors/customerMotor.ts:11:import { parseRcaMap } from '../canonical/support';
src/services/canonicalEngine.ts:8:import { parseActiveRoute, parseCadastro286, parseCompassTargets, parseLegacyClientNetworkRecords, parseLegacyClientOwners, parseLegacyNetworkOwners, parseLegacyNetworkTargets, parsePremises, parsePriceList, parseRcaMap } from './canonical/support';
src/services/canonicalEngine.ts:9:import { applyLaunchList, applyPortfolio, canonicalToInventory, clearPortfolio, inventoryToCanonical, mergePriorPhysical, mergeStock8013, parseSales, parseStock105, refreshTransactionLines } from './canonical/operations';
src/services/canonicalEngine.ts:10:import { buildClients, buildCoordinators, buildDaily, buildLines, buildNetworks, buildVendorResults, businessDayStats, legacySellOut, periodBounds } from './canonical/aggregate';
src/services/canonicalEngine.ts:11:import { buildHistorySummary, mergeHistoryMonths, parse379History } from './canonical/history';
src/services/canonicalEngine.ts:12:import { blockedCheck, numericCheck, reconcileNetworkAssignments, sumRawSales8022 } from './canonical/reconciliation';
src/services/canonicalEngine.ts:13:import { buildRelationshipContext } from './canonical/relationships';
src/services/canonical/support.ts:1:export * from './supportCore';
src/services/canonical/support.ts:4:import { parseCadastro286 as parseCadastro286Core } from './supportCore';
scripts/audit-sources.ts:3:import { processCanonicalFiles } from '../src/services/canonicalEngine.ts';
scripts/audit-relationships.ts:4:import { parseActiveRoute, parseLegacyClientNetworkRecords, parsePremises, parsePriceList } from '../src/services/canonical/support.ts';
scripts/audit-relationships.ts:5:import { parseSales } from '../src/services/canonical/operations.ts';
scripts/audit-relationships.ts:6:import { reconcileNetworkAssignments } from '../src/services/canonical/reconciliation.ts';
scripts/audit-relationships.ts:8:import { buildRelationshipContext } from '../src/services/canonical/relationships.ts';
tests/parsers.test.ts:5:import { parseCadastro286, parseCompassTargets, parsePremises } from '../src/services/canonical/support.ts';
tests/parsers.test.ts:6:import { parseSales, parseStock105 } from '../src/services/canonical/operations.ts';
tests/target-rules.test.ts:4:import { parseCompassTargets } from '../src/services/canonical/support.ts';
tests/customer-intelligence-no-fake-tier.test.ts:4:import { parseActiveRoute } from '../src/services/canonical/supportCore.ts';
tests/utils-and-reconciliation.test.ts:4:import { numericCheck, sumRawSales8022 } from '../src/services/canonical/reconciliation.ts';
tests/utils-and-reconciliation.test.ts:5:import { resolveClientNetwork } from '../src/services/canonical/networkResolution.ts';
tests/customer-intelligence-real-sources-integration.test.ts:9:import { parseActiveRoute, parsePremises } from '../src/services/canonical/supportCore.ts';
tests/customer-intelligence-valid-cnpj-only.test.ts:3:import { parsePremises } from '../src/services/canonical/supportCore.ts';
tests/audit-checkpoint-regression.test.ts:17:  const engine=read('src/services/canonicalEngine.ts');
tests/relationships.test.ts:3:import { buildClients, buildNetworks } from '../src/services/canonical/aggregate.ts';
tests/relationships.test.ts:4:import { reconcileNetworkAssignments } from '../src/services/canonical/reconciliation.ts';
tests/relationships.test.ts:5:import { buildRelationshipContext } from '../src/services/canonical/relationships.ts';
tests/packaging.test.ts:4:import { applyPortfolio, parseStock105 } from '../src/services/canonical/operations.ts';
tests/business-rules.test.ts:4:import { applyLaunchList, applyPortfolio } from '../src/services/canonical/operations.ts';
tests/business-rules.test.ts:5:import { buildCoordinators, buildDaily, buildNetworks, buildVendorResults } from '../src/services/canonical/aggregate.ts';
tests/business-rules.test.ts:6:import { reconcileNetworkAssignments } from '../src/services/canonical/reconciliation.ts';

## Typecheck

> blue-jacket@0.1.0 typecheck
> tsc --noEmit

src/services/canonical/aggregate.ts(1,15): error TS2305: Module '"../../store/DataContext"' has no exported member 'ClienteRanking'.
src/services/canonical/aggregate.ts(1,31): error TS2305: Module '"../../store/DataContext"' has no exported member 'CoordenadorSellOut'.
src/services/canonical/aggregate.ts(1,51): error TS2305: Module '"../../store/DataContext"' has no exported member 'DiaVenda'.
src/services/canonical/aggregate.ts(1,61): error TS2305: Module '"../../store/DataContext"' has no exported member 'SellOutData'.
src/services/canonical/aggregate.ts(1,74): error TS2305: Module '"../../store/DataContext"' has no exported member 'VendedorSellOut'.
src/services/canonical/aggregate.ts(103,1151): error TS2353: Object literal may only specify known properties, and 'teamCode' does not exist in type 'CanonicalNetworkResult'.
src/services/canonical/aggregate.ts(104,33): error TS2339: Property 'detectedNetworkTarget' does not exist on type 'CanonicalNetworkResult'.
src/services/canonical/aggregate.ts(104,57): error TS2339: Property 'detectedNetworkTarget' does not exist on type 'CanonicalNetworkResult'.
src/services/canonical/aggregate.ts(115,97): error TS7006: Parameter 'a' implicitly has an 'any' type.
src/services/canonical/aggregate.ts(115,99): error TS7006: Parameter 'b' implicitly has an 'any' type.
src/services/canonical/operations.ts(171,812): error TS7006: Parameter 'candidate' implicitly has an 'any' type.
src/services/canonical/operations.ts(171,1008): error TS7006: Parameter 'line' implicitly has an 'any' type.
src/services/canonical/operations.ts(189,825): error TS7006: Parameter 'candidate' implicitly has an 'any' type.
src/services/canonical/runtime.ts(1,15): error TS2305: Module '"../../store/DataContext"' has no exported member 'ProdutoEstoque'.
src/services/canonicalEngine.ts(2,15): error TS2305: Module '"../store/DataContext"' has no exported member 'MetricasEstoque'.
src/services/canonicalEngine.ts(2,32): error TS2305: Module '"../store/DataContext"' has no exported member 'ProdutoEstoque'.
src/services/canonicalEngine.ts(2,48): error TS2305: Module '"../store/DataContext"' has no exported member 'SellOutData'.
src/services/canonicalEngine.ts(72,48): error TS2345: Argument of type '"legacyTopNetworks"' is not assignable to parameter of type 'SourceKind'.
src/services/canonicalEngine.ts(72,111): error TS2345: Argument of type '"legacyTopNetworks"' is not assignable to parameter of type 'SourceKind'.
src/services/canonicalEngine.ts(72,200): error TS2339: Property 'legacyNetworkTargets' does not exist on type 'CanonicalSupportData'.
src/services/canonicalEngine.ts(73,47): error TS2345: Argument of type '"legacyTopNetworks"' is not assignable to parameter of type 'SourceKind'.
src/services/canonicalEngine.ts(73,109): error TS2345: Argument of type '"legacyTopNetworks"' is not assignable to parameter of type 'SourceKind'.
src/services/canonicalEngine.ts(73,227): error TS2339: Property 'legacyNetworkOwners' does not exist on type 'CanonicalSupportData'.
src/services/canonicalEngine.ts(74,9): error TS2322: Type 'ReferenceClientNetwork[] | { cnpj: string; cnpjRaw: string; network: unknown; }[]' is not assignable to type 'ReferenceClientNetwork[]'.
  Type '{ cnpj: string; cnpjRaw: string; network: unknown; }[]' is not assignable to type 'ReferenceClientNetwork[]'.
    Type '{ cnpj: string; cnpjRaw: string; network: unknown; }' is not assignable to type 'ReferenceClientNetwork'.
      Types of property 'network' are incompatible.
        Type 'unknown' is not assignable to type 'string'.
src/services/canonicalEngine.ts(74,74): error TS2345: Argument of type '"legacyTopNetworks"' is not assignable to parameter of type 'SourceKind'.
src/services/canonicalEngine.ts(74,143): error TS2345: Argument of type '"legacyTopNetworks"' is not assignable to parameter of type 'SourceKind'.
src/services/canonicalEngine.ts(74,208): error TS2339: Property 'legacyClientNetworks' does not exist on type 'CanonicalSupportData'.
src/services/canonicalEngine.ts(75,46): error TS2345: Argument of type '"legacyTopNetworks"' is not assignable to parameter of type 'SourceKind'.
src/services/canonicalEngine.ts(75,107): error TS2345: Argument of type '"legacyTopNetworks"' is not assignable to parameter of type 'SourceKind'.
src/services/canonicalEngine.ts(75,225): error TS2339: Property 'legacyClientOwners' does not exist on type 'CanonicalSupportData'.
src/services/canonicalEngine.ts(152,224): error TS2353: Object literal may only specify known properties, and 'legacyNetworkTargets' does not exist in type 'CanonicalSupportData'.
src/services/canonicalEngine.ts(160,145): error TS2339: Property 'detectedNetworkTarget' does not exist on type 'CanonicalNetworkResult'.
src/services/documentGenerator.ts(182,50): error TS2339: Property 'vendorCode' does not exist on type 'CanonicalNetworkResult'.
src/services/documentGenerator.ts(184,62): error TS2339: Property 'teamCode' does not exist on type 'CanonicalNetworkResult'.
src/services/documentGenerator.ts(185,54): error TS2339: Property 'vendorCode' does not exist on type 'CanonicalNetworkResult'.
src/services/excelParser.ts(2,10): error TS2305: Module '"../store/DataContext"' has no exported member 'ProdutoEstoque'.
src/services/excelParser.ts(2,26): error TS2305: Module '"../store/DataContext"' has no exported member 'MetricasEstoque'.
src/services/excelParser.ts(2,43): error TS2305: Module '"../store/DataContext"' has no exported member 'SellOutData'.
src/services/excelParser.ts(2,56): error TS2305: Module '"../store/DataContext"' has no exported member 'DiaVenda'.
src/services/excelParser.ts(2,66): error TS2305: Module '"../store/DataContext"' has no exported member 'ClienteRanking'.
src/services/excelParser.ts(2,82): error TS2305: Module '"../store/DataContext"' has no exported member 'VendedorSellOut'.
src/services/excelParser.ts(2,99): error TS2305: Module '"../store/DataContext"' has no exported member 'CoordenadorSellOut'.
src/services/excelParser.ts(263,46): error TS7006: Parameter 'v' implicitly has an 'any' type.
src/services/excelParser.ts(268,249): error TS7006: Parameter 'a' implicitly has an 'any' type.
src/services/excelParser.ts(268,252): error TS7006: Parameter 'b' implicitly has an 'any' type.
src/services/operationalSources.ts(5,15): error TS2305: Module '"../store/DataContext"' has no exported member 'MetricasEstoque'.
src/services/operationalSources.ts(5,32): error TS2305: Module '"../store/DataContext"' has no exported member 'ProdutoEstoque'.

## Testes (últimas 300 linhas)
    '      console.error(message, error);\n' +
    '    }\n' +
    '  };\n' +
    '\n' +
    '  return (\n' +
    '    <DataContext.Provider value={{ canonical, setCanonical, manualConfig, setManualConfig }}>\n' +
    '      {children}\n' +
    '    </DataContext.Provider>\n' +
    '  );\n' +
    '};\n' +
    '\n' +
    'export const useData = () => useContext(DataContext);\n'
  
      at TestContext.<anonymous> (file:///home/runner/work/blue_jacket/blue_jacket/tests/receipt-reconciliation.test.ts:73:10)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: "import React, { createContext, useContext, useMemo, useState, type ReactNode } from 'react';\nimport { applyManualConfiguration, type CanonicalState, DEFAULT_MANUAL_CONFIGURATION, type ManualConfiguration } from '../domain/canonical';\nimport { isUnifiedCanonicalState } from '../services/motors/unifiedEngine';\nimport { clearCanonicalState, loadCanonicalState, saveCanonicalState } from './canonicalPersistence';\nimport { competenceFromCanonical, loadManualConfiguration, normalizeManualConfiguration, saveManualConfiguration } from './competencePersistence';\n\ninterface DataContextType {\n  canonical: CanonicalState | null;\n  setCanonical: (data: CanonicalState | null) => void;\n  manualConfig: ManualConfiguration;\n  setManualConfig: (config: ManualConfiguration) => void;\n}\n\nconst DataContext = createContext<DataContextType>({\n  canonical: null,\n  setCanonical: () => {},\n  manualConfig: DEFAULT_MANUAL_CONFIGURATION,\n  setManualConfig: () => {},\n});\n\nexport const DataProvider = ({ children }: { children: ReactNode }) => {\n  const [canonicalBase, setCanonicalBase] = useState<CanonicalState | null>(null);\n  const [manualConfig, setManualConfigState] = useState<ManualConfiguration>(DEFAULT_MANUAL_CONFIGURATION);\n  const [manualConfigPersistenceError, setManualConfigPersistenceError] = useState('');\n\n  React.useEffect(() => {\n    let cancelled = false;\n    const hydrate = async () => {\n      const stored = await loadCanonicalState();\n      const storedCanonical = stored && isUnifiedCanonicalState(stored) ? stored : null;\n      if (stored && !storedCanonical) await clearCanonicalState();\n      const competence = competenceFromCanonical(storedCanonical);\n      const manualLoad = loadManualConfiguration(localStorage, competence, { migrateLegacy: false });\n      if (cancelled) return;\n      setCanonicalBase(storedCanonical);\n      setManualConfigState(manualLoad.config);\n      setManualConfigPersistenceError(manualLoad.persistenceError || '');\n    };\n    void hydrate().catch(error => console.error('Não foi possível restaurar a base canônica.', error));\n    return () => { cancelled = true; };\n  }, []);\n\n  const activeCompetence = useMemo(() => competenceFromCanonical(canonicalBase), [canonicalBase]);\n  const canonical = useMemo(() => {\n    const configured = applyManualConfiguration(canonicalBase, manualConfig);\n    if (!configured || !manualConfigPersistenceError) return configured;\n    return { ...configured, warnings: Array.from(new Set([...configured.warnings, manualConfigPersistenceError])) };\n  }, [canonicalBase, manualConfig, manualConfigPersistenceError]);\n\n  const setCanonical = (data: CanonicalState | null) => {\n    if (data && !isUnifiedCanonicalState(data)) {\n      console.error('Snapshot rejeitado: o Blue Jacket aceita somente UnifiedDataLayer.');\n      return;\n    }\n\n    const nextCompetence = competenceFromCanonical(data);\n    setCanonicalBase(data);\n    if (data) {\n      void saveCanonicalState(data).catch(error => console.error('Não foi possível persistir a base canônica no IndexedDB.', error));\n      if (nextCompetence && nextCompetence !== activeCompetence) {\n        const nextLoad = loadManualConfiguration(localStorage, nextCompetence, { migrateLegacy: false });\n        setManualConfigState(nextLoad.config);\n        setManualConfigPersistenceError(nextLoad.persistenceError || '');\n      }\n    } else {\n      setManualConfigPersistenceError('');\n      void clearCanonicalState();\n    }\n  };\n\n  const setManualConfig = (config: ManualConfiguration) => {\n    const normalized = normalizeManualConfiguration(config);\n    setManualConfigState(normalized);\n    if (!activeCompetence) return;\n    try {\n      saveManualConfiguration(localStorage, activeCompetence, normalized);\n      setManualConfigPersistenceError('');\n    } catch (error) {\n      const message = `Configuração ${activeCompetence}: falha ao persistir alterações (${error instanceof Error ? error.message : 'erro desconhecido'}).`;\n      setManualConfigPersistenceError(message);\n      console.error(message, error);\n    }\n  };\n\n  return (\n    <DataContext.Provider value={{ canonical, setCanonical, manualConfig, setManualConfig }}>\n      {children}\n    </DataContext.Provider>\n  );\n};\n\nexport const useData = () => useContext(DataContext);\n",
    expected: /applyReceiptReconciliation/,
    operator: 'match',
    diff: 'simple'
  }

test at tests/templates.test.ts:12:1
✖ modelo TOP REDES preserva todas as abas operacionais (0.298491ms)
  Error: ENOENT: no such file or directory, open 'public/templates/top-redes-padrao.xlsx'
      at Object.openSync (node:fs:622:18)
      at readFileSync (node:fs:488:35)
      at TestContext.<anonymous> (file:///home/runner/work/blue_jacket/blue_jacket/tests/templates.test.ts:13:28)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: 'public/templates/top-redes-padrao.xlsx'
  }

test at tests/templates.test.ts:17:1
✖ limpeza estática está programada para remover calcChain e connections (0.438791ms)
  Error: ENOENT: no such file or directory, open 'public/templates/top-redes-padrao.xlsx'
      at Object.openSync (node:fs:622:18)
      at readFileSync (node:fs:488:35)
      at TestContext.<anonymous> (file:///home/runner/work/blue_jacket/blue_jacket/tests/templates.test.ts:20:45)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: 'public/templates/top-redes-padrao.xlsx'
  }

test at tests/top-networks-model.test.ts:25:1
✖ modelo TOP REDES expõe cabeçalhos e áreas operacionais para auditoria de conteúdo (1.322728ms)
  Error: ENOENT: no such file or directory, open 'public/templates/top-redes-padrao.xlsx'
      at Object.openSync (node:fs:622:18)
      at readFileSync (node:fs:488:35)
      at TestContext.<anonymous> (file:///home/runner/work/blue_jacket/blue_jacket/tests/top-networks-model.test.ts:26:28)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.start (node:internal/test_runner/test:1242:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: 'public/templates/top-redes-padrao.xlsx'
  }

test at tests/top-networks-model.test.ts:38:1
✖ cabeçalhos definem K como REDES e L como TOPS e o gerador respeita essa ordem (0.225597ms)
  Error: ENOENT: no such file or directory, open 'public/templates/top-redes-padrao.xlsx'
      at Object.openSync (node:fs:622:18)
      at readFileSync (node:fs:488:35)
      at TestContext.<anonymous> (file:///home/runner/work/blue_jacket/blue_jacket/tests/top-networks-model.test.ts:39:28)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: 'public/templates/top-redes-padrao.xlsx'
  }

test at tests/top-networks-model.test.ts:70:1
✖ TOP REDES padroniza percentuais e valores sem substituir o estilo visual das células (0.215377ms)
  Error: ENOENT: no such file or directory, open 'public/templates/top-redes-padrao.xlsx'
      at Object.openSync (node:fs:622:18)
      at readFileSync (node:fs:488:35)
      at TestContext.<anonymous> (file:///home/runner/work/blue_jacket/blue_jacket/tests/top-networks-model.test.ts:71:28)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: 'public/templates/top-redes-padrao.xlsx'
  }

test at tests/top-networks-model.test.ts:102:1
✖ modelo mantém granularidade operacional significativa nas abas auxiliares (0.251459ms)
  Error: ENOENT: no such file or directory, open 'public/templates/top-redes-padrao.xlsx'
      at Object.openSync (node:fs:622:18)
      at readFileSync (node:fs:488:35)
      at TestContext.<anonymous> (file:///home/runner/work/blue_jacket/blue_jacket/tests/top-networks-model.test.ts:103:28)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'open',
    path: 'public/templates/top-redes-padrao.xlsx'
  }

test at tests/top-networks-template-format-regression.test.ts:44:1
✖ TOP REDES mantém F com a mesma tipografia/alinhamento estrutural dos demais valores (1.122145ms)
  Error: ENOENT: no such file or directory, copyfile 'public/templates/top-redes-padrao.xlsx' -> '/tmp/bj-top-redes-wfun1E/top-redes-padrao.xlsx'
      at copyFileSync (node:fs:3177:11)
      at preparedTemplate (file:///home/runner/work/blue_jacket/blue_jacket/tests/top-networks-template-format-regression.test.ts:21:3)
      at TestContext.<anonymous> (file:///home/runner/work/blue_jacket/blue_jacket/tests/top-networks-template-format-regression.test.ts:45:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.start (node:internal/test_runner/test:1242:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'copyfile',
    path: 'public/templates/top-redes-padrao.xlsx',
    dest: '/tmp/bj-top-redes-wfun1E/top-redes-padrao.xlsx'
  }

test at tests/top-networks-template-format-regression.test.ts:52:1
✖ TOP REDES mantém G e H como percentual depois da preparação do modelo (0.318388ms)
  Error: ENOENT: no such file or directory, copyfile 'public/templates/top-redes-padrao.xlsx' -> '/tmp/bj-top-redes-CXkPky/top-redes-padrao.xlsx'
      at copyFileSync (node:fs:3177:11)
      at preparedTemplate (file:///home/runner/work/blue_jacket/blue_jacket/tests/top-networks-template-format-regression.test.ts:21:3)
      at TestContext.<anonymous> (file:///home/runner/work/blue_jacket/blue_jacket/tests/top-networks-template-format-regression.test.ts:53:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'copyfile',
    path: 'public/templates/top-redes-padrao.xlsx',
    dest: '/tmp/bj-top-redes-CXkPky/top-redes-padrao.xlsx'
  }

test at tests/top-networks-template-format-regression.test.ts:62:1
✖ TOP REDES estende a formatação condicional de F G H e não deixa dxf trocar percentual por General (0.369215ms)
  Error: ENOENT: no such file or directory, copyfile 'public/templates/top-redes-padrao.xlsx' -> '/tmp/bj-top-redes-5hYiFC/top-redes-padrao.xlsx'
      at copyFileSync (node:fs:3177:11)
      at preparedTemplate (file:///home/runner/work/blue_jacket/blue_jacket/tests/top-networks-template-format-regression.test.ts:21:3)
      at TestContext.<anonymous> (file:///home/runner/work/blue_jacket/blue_jacket/tests/top-networks-template-format-regression.test.ts:63:20)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7) {
    errno: -2,
    code: 'ENOENT',
    syscall: 'copyfile',
    path: 'public/templates/top-redes-padrao.xlsx',
    dest: '/tmp/bj-top-redes-5hYiFC/top-redes-padrao.xlsx'
  }

test at tests/unified-architecture.test.ts:19:1
✖ base unificada remove projeções locais legadas sem impedir hidratação de snapshots antigos (2.122918ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /clearLegacyProjectionCache/. Input:
  
  "import React, { createContext, useContext, useMemo, useState, type ReactNode } from 'react';\n" +
    "import { applyManualConfiguration, type CanonicalState, DEFAULT_MANUAL_CONFIGURATION, type ManualConfiguration } from '../domain/canonical';\n" +
    "import { isUnifiedCanonicalState } from '../services/motors/unifiedEngine';\n" +
    "import { clearCanonicalState, loadCanonicalState, saveCanonicalState } from './canonicalPersistence';\n" +
    "import { competenceFromCanonical, loadManualConfiguration, normalizeManualConfiguration, saveManualConfiguration } from './competencePersistence';\n" +
    '\n' +
    'interface DataContextType {\n' +
    '  canonical: CanonicalState | null;\n' +
    '  setCanonical: (data: CanonicalState | null) => void;\n' +
    '  manualConfig: ManualConfiguration;\n' +
    '  setManualConfig: (config: ManualConfiguration) => void;\n' +
    '}\n' +
    '\n' +
    'const DataContext = createContext<DataContextType>({\n' +
    '  canonical: null,\n' +
    '  setCanonical: () => {},\n' +
    '  manualConfig: DEFAULT_MANUAL_CONFIGURATION,\n' +
    '  setManualConfig: () => {},\n' +
    '});\n' +
    '\n' +
    'export const DataProvider = ({ children }: { children: ReactNode }) => {\n' +
    '  const [canonicalBase, setCanonicalBase] = useState<CanonicalState | null>(null);\n' +
    '  const [manualConfig, setManualConfigState] = useState<ManualConfiguration>(DEFAULT_MANUAL_CONFIGURATION);\n' +
    "  const [manualConfigPersistenceError, setManualConfigPersistenceError] = useState('');\n" +
    '\n' +
    '  React.useEffect(() => {\n' +
    '    let cancelled = false;\n' +
    '    const hydrate = async () => {\n' +
    '      const stored = await loadCanonicalState();\n' +
    '      const storedCanonical = stored && isUnifiedCanonicalState(stored) ? stored : null;\n' +
    '      if (stored && !storedCanonical) await clearCanonicalState();\n' +
    '      const competence = competenceFromCanonical(storedCanonical);\n' +
    '      const manualLoad = loadManualConfiguration(localStorage, competence, { migrateLegacy: false });\n' +
    '      if (cancelled) return;\n' +
    '      setCanonicalBase(storedCanonical);\n' +
    '      setManualConfigState(manualLoad.config);\n' +
    "      setManualConfigPersistenceError(manualLoad.persistenceError || '');\n" +
    '    };\n' +
    "    void hydrate().catch(error => console.error('Não foi possível restaurar a base canônica.', error));\n" +
    '    return () => { cancelled = true; };\n' +
    '  }, []);\n' +
    '\n' +
    '  const activeCompetence = useMemo(() => competenceFromCanonical(canonicalBase), [canonicalBase]);\n' +
    '  const canonical = useMemo(() => {\n' +
    '    const configured = applyManualConfiguration(canonicalBase, manualConfig);\n' +
    '    if (!configured || !manualConfigPersistenceError) return configured;\n' +
    '    return { ...configured, warnings: Array.from(new Set([...configured.warnings, manualConfigPersistenceError])) };\n' +
    '  }, [canonicalBase, manualConfig, manualConfigPersistenceError]);\n' +
    '\n' +
    '  const setCanonical = (data: CanonicalState | null) => {\n' +
    '    if (data && !isUnifiedCanonicalState(data)) {\n' +
    "      console.error('Snapshot rejeitado: o Blue Jacket aceita somente UnifiedDataLayer.');\n" +
    '      return;\n' +
    '    }\n' +
    '\n' +
    '    const nextCompetence = competenceFromCanonical(data);\n' +
    '    setCanonicalBase(data);\n' +
    '    if (data) {\n' +
    "      void saveCanonicalState(data).catch(error => console.error('Não foi possível persistir a base canônica no IndexedDB.', error));\n" +
    '      if (nextCompetence && nextCompetence !== activeCompetence) {\n' +
    '        const nextLoad = loadManualConfiguration(localStorage, nextCompetence, { migrateLegacy: false });\n' +
    '        setManualConfigState(nextLoad.config);\n' +
    "        setManualConfigPersistenceError(nextLoad.persistenceError || '');\n" +
    '      }\n' +
    '    } else {\n' +
    "      setManualConfigPersistenceError('');\n" +
    '      void clearCanonicalState();\n' +
    '    }\n' +
    '  };\n' +
    '\n' +
    '  const setManualConfig = (config: ManualConfiguration) => {\n' +
    '    const normalized = normalizeManualConfiguration(config);\n' +
    '    setManualConfigState(normalized);\n' +
    '    if (!activeCompetence) return;\n' +
    '    try {\n' +
    '      saveManualConfiguration(localStorage, activeCompetence, normalized);\n' +
    "      setManualConfigPersistenceError('');\n" +
    '    } catch (error) {\n' +
    "      const message = `Configuração ${activeCompetence}: falha ao persistir alterações (${error instanceof Error ? error.message : 'erro desconhecido'}).`;\n" +
    '      setManualConfigPersistenceError(message);\n' +
    '      console.error(message, error);\n' +
    '    }\n' +
    '  };\n' +
    '\n' +
    '  return (\n' +
    '    <DataContext.Provider value={{ canonical, setCanonical, manualConfig, setManualConfig }}>\n' +
    '      {children}\n' +
    '    </DataContext.Provider>\n' +
    '  );\n' +
    '};\n' +
    '\n' +
    'export const useData = () => useContext(DataContext);\n'
  
      at TestContext.<anonymous> (file:///home/runner/work/blue_jacket/blue_jacket/tests/unified-architecture.test.ts:21:10)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: "import React, { createContext, useContext, useMemo, useState, type ReactNode } from 'react';\nimport { applyManualConfiguration, type CanonicalState, DEFAULT_MANUAL_CONFIGURATION, type ManualConfiguration } from '../domain/canonical';\nimport { isUnifiedCanonicalState } from '../services/motors/unifiedEngine';\nimport { clearCanonicalState, loadCanonicalState, saveCanonicalState } from './canonicalPersistence';\nimport { competenceFromCanonical, loadManualConfiguration, normalizeManualConfiguration, saveManualConfiguration } from './competencePersistence';\n\ninterface DataContextType {\n  canonical: CanonicalState | null;\n  setCanonical: (data: CanonicalState | null) => void;\n  manualConfig: ManualConfiguration;\n  setManualConfig: (config: ManualConfiguration) => void;\n}\n\nconst DataContext = createContext<DataContextType>({\n  canonical: null,\n  setCanonical: () => {},\n  manualConfig: DEFAULT_MANUAL_CONFIGURATION,\n  setManualConfig: () => {},\n});\n\nexport const DataProvider = ({ children }: { children: ReactNode }) => {\n  const [canonicalBase, setCanonicalBase] = useState<CanonicalState | null>(null);\n  const [manualConfig, setManualConfigState] = useState<ManualConfiguration>(DEFAULT_MANUAL_CONFIGURATION);\n  const [manualConfigPersistenceError, setManualConfigPersistenceError] = useState('');\n\n  React.useEffect(() => {\n    let cancelled = false;\n    const hydrate = async () => {\n      const stored = await loadCanonicalState();\n      const storedCanonical = stored && isUnifiedCanonicalState(stored) ? stored : null;\n      if (stored && !storedCanonical) await clearCanonicalState();\n      const competence = competenceFromCanonical(storedCanonical);\n      const manualLoad = loadManualConfiguration(localStorage, competence, { migrateLegacy: false });\n      if (cancelled) return;\n      setCanonicalBase(storedCanonical);\n      setManualConfigState(manualLoad.config);\n      setManualConfigPersistenceError(manualLoad.persistenceError || '');\n    };\n    void hydrate().catch(error => console.error('Não foi possível restaurar a base canônica.', error));\n    return () => { cancelled = true; };\n  }, []);\n\n  const activeCompetence = useMemo(() => competenceFromCanonical(canonicalBase), [canonicalBase]);\n  const canonical = useMemo(() => {\n    const configured = applyManualConfiguration(canonicalBase, manualConfig);\n    if (!configured || !manualConfigPersistenceError) return configured;\n    return { ...configured, warnings: Array.from(new Set([...configured.warnings, manualConfigPersistenceError])) };\n  }, [canonicalBase, manualConfig, manualConfigPersistenceError]);\n\n  const setCanonical = (data: CanonicalState | null) => {\n    if (data && !isUnifiedCanonicalState(data)) {\n      console.error('Snapshot rejeitado: o Blue Jacket aceita somente UnifiedDataLayer.');\n      return;\n    }\n\n    const nextCompetence = competenceFromCanonical(data);\n    setCanonicalBase(data);\n    if (data) {\n      void saveCanonicalState(data).catch(error => console.error('Não foi possível persistir a base canônica no IndexedDB.', error));\n      if (nextCompetence && nextCompetence !== activeCompetence) {\n        const nextLoad = loadManualConfiguration(localStorage, nextCompetence, { migrateLegacy: false });\n        setManualConfigState(nextLoad.config);\n        setManualConfigPersistenceError(nextLoad.persistenceError || '');\n      }\n    } else {\n      setManualConfigPersistenceError('');\n      void clearCanonicalState();\n    }\n  };\n\n  const setManualConfig = (config: ManualConfiguration) => {\n    const normalized = normalizeManualConfiguration(config);\n    setManualConfigState(normalized);\n    if (!activeCompetence) return;\n    try {\n      saveManualConfiguration(localStorage, activeCompetence, normalized);\n      setManualConfigPersistenceError('');\n    } catch (error) {\n      const message = `Configuração ${activeCompetence}: falha ao persistir alterações (${error instanceof Error ? error.message : 'erro desconhecido'}).`;\n      setManualConfigPersistenceError(message);\n      console.error(message, error);\n    }\n  };\n\n  return (\n    <DataContext.Provider value={{ canonical, setCanonical, manualConfig, setManualConfig }}>\n      {children}\n    </DataContext.Provider>\n  );\n};\n\nexport const useData = () => useContext(DataContext);\n",
    expected: /clearLegacyProjectionCache/,
    operator: 'match',
    diff: 'simple'
  }

## Build

> blue-jacket@0.1.0 build
> tsc --noEmit && vite build

src/services/canonical/aggregate.ts(1,15): error TS2305: Module '"../../store/DataContext"' has no exported member 'ClienteRanking'.
src/services/canonical/aggregate.ts(1,31): error TS2305: Module '"../../store/DataContext"' has no exported member 'CoordenadorSellOut'.
src/services/canonical/aggregate.ts(1,51): error TS2305: Module '"../../store/DataContext"' has no exported member 'DiaVenda'.
src/services/canonical/aggregate.ts(1,61): error TS2305: Module '"../../store/DataContext"' has no exported member 'SellOutData'.
src/services/canonical/aggregate.ts(1,74): error TS2305: Module '"../../store/DataContext"' has no exported member 'VendedorSellOut'.
src/services/canonical/aggregate.ts(103,1151): error TS2353: Object literal may only specify known properties, and 'teamCode' does not exist in type 'CanonicalNetworkResult'.
src/services/canonical/aggregate.ts(104,33): error TS2339: Property 'detectedNetworkTarget' does not exist on type 'CanonicalNetworkResult'.
src/services/canonical/aggregate.ts(104,57): error TS2339: Property 'detectedNetworkTarget' does not exist on type 'CanonicalNetworkResult'.
src/services/canonical/aggregate.ts(115,97): error TS7006: Parameter 'a' implicitly has an 'any' type.
src/services/canonical/aggregate.ts(115,99): error TS7006: Parameter 'b' implicitly has an 'any' type.
src/services/canonical/operations.ts(171,812): error TS7006: Parameter 'candidate' implicitly has an 'any' type.
src/services/canonical/operations.ts(171,1008): error TS7006: Parameter 'line' implicitly has an 'any' type.
src/services/canonical/operations.ts(189,825): error TS7006: Parameter 'candidate' implicitly has an 'any' type.
src/services/canonical/runtime.ts(1,15): error TS2305: Module '"../../store/DataContext"' has no exported member 'ProdutoEstoque'.
src/services/canonicalEngine.ts(2,15): error TS2305: Module '"../store/DataContext"' has no exported member 'MetricasEstoque'.
src/services/canonicalEngine.ts(2,32): error TS2305: Module '"../store/DataContext"' has no exported member 'ProdutoEstoque'.
src/services/canonicalEngine.ts(2,48): error TS2305: Module '"../store/DataContext"' has no exported member 'SellOutData'.
src/services/canonicalEngine.ts(72,48): error TS2345: Argument of type '"legacyTopNetworks"' is not assignable to parameter of type 'SourceKind'.
src/services/canonicalEngine.ts(72,111): error TS2345: Argument of type '"legacyTopNetworks"' is not assignable to parameter of type 'SourceKind'.
src/services/canonicalEngine.ts(72,200): error TS2339: Property 'legacyNetworkTargets' does not exist on type 'CanonicalSupportData'.
src/services/canonicalEngine.ts(73,47): error TS2345: Argument of type '"legacyTopNetworks"' is not assignable to parameter of type 'SourceKind'.
src/services/canonicalEngine.ts(73,109): error TS2345: Argument of type '"legacyTopNetworks"' is not assignable to parameter of type 'SourceKind'.
src/services/canonicalEngine.ts(73,227): error TS2339: Property 'legacyNetworkOwners' does not exist on type 'CanonicalSupportData'.
src/services/canonicalEngine.ts(74,9): error TS2322: Type 'ReferenceClientNetwork[] | { cnpj: string; cnpjRaw: string; network: unknown; }[]' is not assignable to type 'ReferenceClientNetwork[]'.
  Type '{ cnpj: string; cnpjRaw: string; network: unknown; }[]' is not assignable to type 'ReferenceClientNetwork[]'.
    Type '{ cnpj: string; cnpjRaw: string; network: unknown; }' is not assignable to type 'ReferenceClientNetwork'.
      Types of property 'network' are incompatible.
        Type 'unknown' is not assignable to type 'string'.
src/services/canonicalEngine.ts(74,74): error TS2345: Argument of type '"legacyTopNetworks"' is not assignable to parameter of type 'SourceKind'.
src/services/canonicalEngine.ts(74,143): error TS2345: Argument of type '"legacyTopNetworks"' is not assignable to parameter of type 'SourceKind'.
src/services/canonicalEngine.ts(74,208): error TS2339: Property 'legacyClientNetworks' does not exist on type 'CanonicalSupportData'.
src/services/canonicalEngine.ts(75,46): error TS2345: Argument of type '"legacyTopNetworks"' is not assignable to parameter of type 'SourceKind'.
src/services/canonicalEngine.ts(75,107): error TS2345: Argument of type '"legacyTopNetworks"' is not assignable to parameter of type 'SourceKind'.
src/services/canonicalEngine.ts(75,225): error TS2339: Property 'legacyClientOwners' does not exist on type 'CanonicalSupportData'.
src/services/canonicalEngine.ts(152,224): error TS2353: Object literal may only specify known properties, and 'legacyNetworkTargets' does not exist in type 'CanonicalSupportData'.
src/services/canonicalEngine.ts(160,145): error TS2339: Property 'detectedNetworkTarget' does not exist on type 'CanonicalNetworkResult'.
src/services/documentGenerator.ts(182,50): error TS2339: Property 'vendorCode' does not exist on type 'CanonicalNetworkResult'.
src/services/documentGenerator.ts(184,62): error TS2339: Property 'teamCode' does not exist on type 'CanonicalNetworkResult'.
src/services/documentGenerator.ts(185,54): error TS2339: Property 'vendorCode' does not exist on type 'CanonicalNetworkResult'.
src/services/excelParser.ts(2,10): error TS2305: Module '"../store/DataContext"' has no exported member 'ProdutoEstoque'.
src/services/excelParser.ts(2,26): error TS2305: Module '"../store/DataContext"' has no exported member 'MetricasEstoque'.
src/services/excelParser.ts(2,43): error TS2305: Module '"../store/DataContext"' has no exported member 'SellOutData'.
src/services/excelParser.ts(2,56): error TS2305: Module '"../store/DataContext"' has no exported member 'DiaVenda'.
src/services/excelParser.ts(2,66): error TS2305: Module '"../store/DataContext"' has no exported member 'ClienteRanking'.
src/services/excelParser.ts(2,82): error TS2305: Module '"../store/DataContext"' has no exported member 'VendedorSellOut'.
src/services/excelParser.ts(2,99): error TS2305: Module '"../store/DataContext"' has no exported member 'CoordenadorSellOut'.
src/services/excelParser.ts(263,46): error TS7006: Parameter 'v' implicitly has an 'any' type.
src/services/excelParser.ts(268,249): error TS7006: Parameter 'a' implicitly has an 'any' type.
src/services/excelParser.ts(268,252): error TS7006: Parameter 'b' implicitly has an 'any' type.
src/services/operationalSources.ts(5,15): error TS2305: Module '"../store/DataContext"' has no exported member 'MetricasEstoque'.
src/services/operationalSources.ts(5,32): error TS2305: Module '"../store/DataContext"' has no exported member 'ProdutoEstoque'.
