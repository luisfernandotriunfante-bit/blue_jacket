import { createHash } from 'node:crypto';
import { canonicalInputHash as canonicalInputHashV1 } from '../src/canonical/adminRegistryIdentity.ts';
import { canonicalInputHashV2 } from '../src/canonical/targetIdentity.ts';
import { canonicalInputHashV3 } from '../src/canonical/sourceReplacementIdentity.ts';
import {
  HARD_REQUIRED_SOURCE_IDS,
  SUPPORTED_SOURCE_IDS,
  type SourceReplacementScope,
} from '../src/canonical/sourceContract.ts';
import { EMPTY_SOURCE_REPLACEMENT_PROOF, type SourceReplacementState } from '../src/canonical/sourceReplacementState.ts';
import type { ActiveCanonicalBundle } from '../src/canonical/runtime.ts';
import type { SourceStorageSnapshotV1, SourceStorageSnapshotV2, StoredStage } from '../src/canonical/sourceImport.ts';
import type { ParsedSource } from '../src/canonical/types.ts';

export const V19_ENGINE = 'browser-stage4-product-assortment-v19-admin-registry-authority';
export const V20_ENGINE = 'browser-stage4-product-assortment-v20-targets-by-competence';
export const V21_ENGINE = 'browser-stage4-product-assortment-v21-source-replacement';

const PARSER_VERSIONS: Record<string, string> = {
  'cadastro-itens-286.xls': 'browser-v2-286-physical-column-layout',
  '310 total 2026.txt': 'browser-v2-rca310',
  "08.26 Roteiro Ativo Top Varejistas Ago'26 - Final.xlsx": 'browser-v3-route-monthly-meta',
  'entrada-notas-218.xls': 'browser-v3-invoice-items-physical-layout',
  'Bussola de Metas AGOSTO - 2026 DEFINITIVA.xlsx': 'browser-v3-bussola-current-code-context',
  "Sortimento Recomendado - Q3'26.xlsx": 'browser-v4-jul-optional-blank-before-ean',
  'CARTEIRA 24.08.xlsx': 'browser-v5-portfolio-current-snapshot',
};

export const parserVersionForFixture = (source: string) => PARSER_VERSIONS[source] ?? 'browser-v1';
export const sha256Fixture = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

export function parsedSourceFixture(source: string, rows: ParsedSource['rows'] = []): ParsedSource {
  return { source, fileName: source, sheet: 'Sheet1', rows, audits: [] };
}

export function storedStageFixture(source: string, overrides: Partial<StoredStage> = {}): StoredStage {
  const parsed = overrides.parsed ?? parsedSourceFixture(source);
  return {
    source,
    parsed,
    manifest: overrides.manifest ?? {
      source,
      fileName: source,
      fileHash: sha256Fixture(`physical:${source}`),
      parserVersion: parserVersionForFixture(source),
      schemaVersion: 'v1',
      parsedRows: parsed.rows.length,
      warnings: 0,
      errors: 0,
      updatedAt: '2026-09-06T00:00:00.000Z',
      status: 'VALID',
    },
  };
}

export function sourceStorageV1Fixture(overrides: Partial<Record<string, Partial<StoredStage>>> = {}): SourceStorageSnapshotV1 {
  return {
    format: 'blue-jacket-source-storage/v1',
    exportedAt: '2026-09-06T00:00:00.000Z',
    staging: SUPPORTED_SOURCE_IDS.map(source => storedStageFixture(source, overrides[source] ?? {})),
  };
}

export function sourceStorageV2Fixture(options: { presentSources?: readonly string[]; overrides?: Partial<Record<string, Partial<StoredStage>>> } = {}): SourceStorageSnapshotV2 {
  const present = options.presentSources ?? SUPPORTED_SOURCE_IDS;
  return {
    format: 'blue-jacket-source-storage/v2',
    exportedAt: '2026-09-06T00:00:00.000Z',
    staging: present.map(source => storedStageFixture(source, options.overrides?.[source] ?? {})),
  };
}

export function sourceStorageV2HardOnlyFixture() {
  return sourceStorageV2Fixture({ presentSources: HARD_REQUIRED_SOURCE_IDS });
}

export function emptyReplacementStateFixture(): SourceReplacementState {
  return { format: 'blue-jacket-source-replacement-state/v1', certificates: [] };
}

export function certificateFixture(input: {
  sourceId: string;
  scope?: SourceReplacementScope;
  replacementAuthority?: 'AdminRegistry.RCAs' | 'AdminRegistry.Lançamentos' | 'AdminRegistry.TopRetailers' | 'TargetState.RcaTargets';
  sourceFileHash?: string;
  coverageKeys?: string[];
  coverageHash?: string;
  certifiedAt?: string;
}) {
  const sourceId = input.sourceId;
  const scope = input.scope ?? 'GLOBAL';
  const authority = input.replacementAuthority ?? (sourceId === 'NOVOS RCAS.xlsx' ? 'AdminRegistry.RCAs' : sourceId === 'lançamentos.xlsx' ? 'AdminRegistry.Lançamentos' : sourceId.includes('Roteiro Ativo Top') ? 'AdminRegistry.TopRetailers' : 'TargetState.RcaTargets');
  const coverageKeys = [...(input.coverageKeys ?? ['FIXTURE_KEY'])].sort();
  return {
    id: `CERT:${sourceId}:${scope}`,
    sourceId,
    scope,
    replacementAuthority: authority,
    sourceFileHash: input.sourceFileHash ?? sha256Fixture(`physical:${sourceId}`),
    sourceParserVersion: parserVersionForFixture(sourceId),
    sourceSchemaVersion: 'v1',
    sourceRows: 0,
    coverageKeys,
    coverageHash: input.coverageHash ?? sha256Fixture(['blue-jacket-source-replacement-coverage/v1', ...coverageKeys]),
    proofVersion: 'blue-jacket-source-replacement-proof/v1' as const,
    certifiedAt: input.certifiedAt ?? '2026-09-06T00:00:00.000Z',
  };
}

const rowCounts = { M1_ITEM_ESTOQUE: 1, M2_CLIENTE_RCA: 1, M3_MOVIMENTO_VENDAS: 1, M4_HISTORICO_TRANSICAO: 1 };
const factTypeCounts = { SALE: 1, INBOUND_ORDER: 0, RECEIPT: 0, TARGET: 0 };

export async function activeV21Fixture(options: {
  motorBuildId?: string;
  stagingManifestHash?: string;
  adminRegistryHash?: string;
  rcaTargetRegistryHash?: string;
  sourceReplacementProofHash?: string;
  sourceReplacements?: Array<{ source: string; scope: string }>;
} = {}): Promise<ActiveCanonicalBundle> {
  const stagingManifestHash = options.stagingManifestHash ?? sha256Fixture('staging-v2');
  const adminRegistryHash = options.adminRegistryHash ?? sha256Fixture('admin');
  const rcaTargetRegistryHash = options.rcaTargetRegistryHash ?? sha256Fixture('targets');
  const sourceReplacementProofHash = options.sourceReplacementProofHash ?? EMPTY_SOURCE_REPLACEMENT_PROOF;
  const sourceReplacements = [...(options.sourceReplacements ?? [])].sort((a, b) => `${a.source}|${a.scope}`.localeCompare(`${b.source}|${b.scope}`));
  const canonicalInputHash = await canonicalInputHashV3(stagingManifestHash, adminRegistryHash, rcaTargetRegistryHash, sourceReplacementProofHash);
  return {
    status: 'ACTIVE',
    motorBuildId: options.motorBuildId ?? `motor-v21-${canonicalInputHash.slice(0, 16)}`,
    stagingManifestHash,
    adminRegistryHash,
    rcaTargetRegistryHash,
    canonicalInputHash,
    sourceContractVersion: 'v2',
    sourceReplacementProofHash,
    sourceReplacements,
    schemaVersion: 'v1',
    engineVersion: V21_ENGINE,
    approvedAt: '2026-09-06T00:00:00.000Z',
    rowCounts,
    factTypeCounts,
  };
}

export async function activeV20Fixture(options: { motorBuildId?: string; stagingManifestHash?: string; adminRegistryHash?: string; rcaTargetRegistryHash?: string } = {}): Promise<ActiveCanonicalBundle> {
  const stagingManifestHash = options.stagingManifestHash ?? sha256Fixture('staging-v1');
  const adminRegistryHash = options.adminRegistryHash ?? sha256Fixture('admin');
  const rcaTargetRegistryHash = options.rcaTargetRegistryHash ?? sha256Fixture('targets');
  const canonicalInputHash = await canonicalInputHashV2(stagingManifestHash, adminRegistryHash, rcaTargetRegistryHash);
  return { status: 'ACTIVE', motorBuildId: options.motorBuildId ?? 'motor-v20-fixture', stagingManifestHash, adminRegistryHash, rcaTargetRegistryHash, canonicalInputHash, schemaVersion: 'v1', engineVersion: V20_ENGINE, approvedAt: '2026-09-06T00:00:00.000Z', rowCounts, factTypeCounts };
}

export async function activeV19Fixture(options: { motorBuildId?: string; stagingManifestHash?: string; adminRegistryHash?: string } = {}): Promise<ActiveCanonicalBundle> {
  const stagingManifestHash = options.stagingManifestHash ?? sha256Fixture('staging-v1');
  const adminRegistryHash = options.adminRegistryHash ?? sha256Fixture('admin');
  const canonicalInputHash = await canonicalInputHashV1(stagingManifestHash, adminRegistryHash);
  return { status: 'ACTIVE', motorBuildId: options.motorBuildId ?? 'motor-v19-fixture', stagingManifestHash, adminRegistryHash, canonicalInputHash, schemaVersion: 'v1', engineVersion: V19_ENGINE, approvedAt: '2026-09-06T00:00:00.000Z', rowCounts, factTypeCounts };
}

export const testFixtureHelpers = { rowCounts, factTypeCounts };
