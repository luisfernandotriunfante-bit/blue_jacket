import { readFileSync, writeFileSync, rmSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const write = (path, value) => writeFileSync(path, value, 'utf8');

function replaceRequired(path, from, to, label) {
  const source = read(path);
  if (!source.includes(from)) throw new Error(`Transformação não encontrada: ${label} em ${path}`);
  write(path, source.replace(from, to));
}

function replaceRegexRequired(path, pattern, to, label) {
  const source = read(path);
  if (!pattern.test(source)) throw new Error(`Transformação regex não encontrada: ${label} em ${path}`);
  write(path, source.replace(pattern, to));
}

replaceRequired(
  'src/domain/canonical.ts',
  "  | 'legacyTopNetworks'\n",
  '',
  'SourceKind legacyTopNetworks',
);

replaceRequired(
  'src/services/canonical/utils.ts',
  "  if (n.includes('TOP REDES')) return 'legacyTopNetworks';\n",
  '',
  'detecção TOP REDES legada',
);
replaceRequired(
  'src/services/canonical/utils.ts',
  "  const preferredSheets: Partial<Record<SourceKind, string[]>> = { compassTargets: ['Metas'], activeRoute: ['Roteiro Ativo'], legacyTopNetworks: ['Top Redes', 'redes', '319', 'Equipe'] };",
  "  const preferredSheets: Partial<Record<SourceKind, string[]>> = { compassTargets: ['Metas'], activeRoute: ['Roteiro Ativo'] };",
  'abas preferenciais TOP REDES',
);

replaceRequired(
  'src/services/motors/unifiedEngine.ts',
  "import {\n  parseLegacyClientNetworks,\n  parseLegacyClientOwners,\n  parseLegacyNetworkOwners,\n  parseLegacyNetworkTargets,\n} from '../canonical/supportCore';\n",
  '',
  'imports supportCore legados',
);
replaceRequired(
  'src/services/motors/unifiedEngine.ts',
  "const isLegacyTopNetworks = (file: File) => has(file, 'TOP REDES');\n",
  '',
  'predicado TOP REDES legado',
);
replaceRequired(
  'src/services/motors/unifiedEngine.ts',
  "  if (isLegacyTopNetworks(file)) return 'LEGACY_TOP_NETWORKS';\n",
  '',
  'sourceType TOP REDES legado',
);
replaceRequired(
  'src/services/motors/unifiedEngine.ts',
  "    case 'LEGACY_TOP_NETWORKS': return 'legacyTopNetworks';\n",
  '',
  'sourceKind TOP REDES legado',
);
replaceRequired(
  'src/services/motors/unifiedEngine.ts',
  "function supportFromUnified(layer: UnifiedDataLayer, legacy: Pick<CanonicalSupportData, 'legacyNetworkTargets' | 'legacyNetworkOwners' | 'legacyClientNetworks' | 'legacyClientOwners'>): CanonicalSupportData {",
  'function supportFromUnified(layer: UnifiedDataLayer): CanonicalSupportData {',
  'assinatura supportFromUnified',
);
replaceRequired(
  'src/services/motors/unifiedEngine.ts',
  "  return {\n    rcas:",
  "  return {\n    ...EMPTY_CANONICAL_SUPPORT,\n    rcas:",
  'defaults support canônico',
);
replaceRequired(
  'src/services/motors/unifiedEngine.ts',
  "    legacyNetworkTargets: legacy.legacyNetworkTargets,\n    legacyNetworkOwners: legacy.legacyNetworkOwners,\n    legacyClientNetworks: legacy.legacyClientNetworks,\n    legacyClientOwners: legacy.legacyClientOwners,\n",
  '',
  'campos support legados',
);
replaceRegexRequired(
  'src/services/motors/unifiedEngine.ts',
  /\nasync function legacyReference\([\s\S]*?\n}\n\nexport async function processUnifiedFiles/,
  '\nexport async function processUnifiedFiles',
  'função legacyReference',
);
replaceRequired(
  'src/services/motors/unifiedEngine.ts',
  "  const legacy = await legacyReference(input.allFiles, cache, input.previous);\n",
  '',
  'chamada legacyReference',
);
replaceRequired(
  'src/services/motors/unifiedEngine.ts',
  '  shell.support = supportFromUnified(layer, legacy);',
  '  shell.support = supportFromUnified(layer);',
  'projeção support sem legacy',
);

replaceRegexRequired(
  'src/pages/ConfiguracoesPage.tsx',
  /\n\s*\{ id: 'legacyTopNetworks',[^\n]*\},/,
  '',
  'fonte TOP REDES legada na Configurações',
);

replaceRequired(
  'src/pages/MetasPage.tsx',
  'Carregue Bússola, Roteiro e TOP REDES em Configurações para iniciar a manutenção das metas.',
  'Carregue Bússola e Roteiro em Configurações para iniciar a manutenção das metas.',
  'empty state Metas',
);
replaceRequired(
  'src/pages/MetasPage.tsx',
  "<div style={{color:'var(--panel-muted)',fontSize:'.67rem',marginTop:'7px'}}>Referência TOP REDES: {brl(network.detectedNetworkTarget)} · Participação atual: {pct(participation)}</div>",
  "<div style={{color:'var(--panel-muted)',fontSize:'.67rem',marginTop:'7px'}}>Participação atual: {pct(participation)}</div>",
  'referência TOP REDES em Metas',
);

rmSync('scripts/apply-definitive-cleanup.mjs');
rmSync('.github/workflows/definitive-cleanup.yml');
