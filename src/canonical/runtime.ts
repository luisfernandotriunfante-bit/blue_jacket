import type { CanonicalList } from './types';

export type ActiveCanonicalBundle={
  status:'ACTIVE';
  motorBuildId:string;
  stagingManifestHash:string;
  /** Obrigatório para builds v19+; ausente somente em builds legados reconhecidos para migração. */
  adminRegistryHash?:string;
  /** Obrigatório para builds v20+; identidade semântica exclusiva das metas RCA. */
  rcaTargetRegistryHash?:string;
  /** Obrigatório para builds v19+; v19=input/v1, v20=input/v2 e v21=input/v3. */
  canonicalInputHash?:string;
  /** Obrigatório no v21: contrato físico PRESENT/REPLACED. */
  sourceContractVersion?:'v2';
  /** Obrigatório no v21: prova semântica dos certificados realmente usados. */
  sourceReplacementProofHash?:string;
  /** Obrigatório no v21; lista determinística das substituições efetivas do build. */
  sourceReplacements?:Array<{source:string;scope:string}>;
  schemaVersion:string;
  engineVersion:string;
  approvedAt:string;
  rowCounts:Record<CanonicalList['id'],number>;
  factTypeCounts:Record<'SALE'|'INBOUND_ORDER'|'RECEIPT'|'TARGET',number>;
};
export type CompleteCanonicalInputBundle=ActiveCanonicalBundle & {adminRegistryHash:string;canonicalInputHash:string};
export type CompleteCanonicalInputBundleV20=CompleteCanonicalInputBundle & {rcaTargetRegistryHash:string};
export type CompleteCanonicalInputBundleV21=CompleteCanonicalInputBundleV20 & {sourceContractVersion:'v2';sourceReplacementProofHash:string;sourceReplacements:Array<{source:string;scope:string}>};
type Deactivated={status:'NONE';deactivatedAt:string};
const ACTIVE_KEY='blue-jacket-v3:active-canonical-build';
const LEGACY_KEY='blue-jacket-v2:canonical-bundle';
const V19_ENGINE='browser-stage4-product-assortment-v19-admin-registry-authority';
const V20_ENGINE='browser-stage4-product-assortment-v20-targets-by-competence';
const V21_ENGINE='browser-stage4-product-assortment-v21-source-replacement';
export const APPROVED_CANONICAL_BUILD:ActiveCanonicalBundle={status:'ACTIVE',motorBuildId:'motor-1787651967348',stagingManifestHash:'24cd8c8f794bc5387a3a4c199289cf84360c1912035c41ce52eb7ef5a049085b',schemaVersion:'v1',engineVersion:'stage3-v1',approvedAt:'2026-08-25T10:00:00.000Z',rowCounts:{M1_ITEM_ESTOQUE:744,M2_CLIENTE_RCA:8748,M3_MOVIMENTO_VENDAS:4291,M4_HISTORICO_TRANSICAO:316772},factTypeCounts:{SALE:3652,INBOUND_ORDER:542,RECEIPT:69,TARGET:28}};

export function hasCompleteCanonicalInputIdentity(value:ActiveCanonicalBundle):value is CompleteCanonicalInputBundle{return typeof value.adminRegistryHash==='string'&&Boolean(value.adminRegistryHash)&&typeof value.canonicalInputHash==='string'&&Boolean(value.canonicalInputHash)}
export function hasCompleteCanonicalInputIdentityV20(value:ActiveCanonicalBundle):value is CompleteCanonicalInputBundleV20{return hasCompleteCanonicalInputIdentity(value)&&typeof value.rcaTargetRegistryHash==='string'&&Boolean(value.rcaTargetRegistryHash)}
export function hasCompleteCanonicalInputIdentityV21(value:ActiveCanonicalBundle):value is CompleteCanonicalInputBundleV21{return hasCompleteCanonicalInputIdentityV20(value)&&value.sourceContractVersion==='v2'&&typeof value.sourceReplacementProofHash==='string'&&Boolean(value.sourceReplacementProofHash)&&Array.isArray(value.sourceReplacements)}
function isActiveCanonicalBundle(value:unknown):value is ActiveCanonicalBundle{if(!value||typeof value!=='object')return false;const candidate=value as Partial<ActiveCanonicalBundle>;if(candidate.status!=='ACTIVE'||typeof candidate.motorBuildId!=='string'||!candidate.motorBuildId||typeof candidate.stagingManifestHash!=='string'||!candidate.stagingManifestHash||typeof candidate.schemaVersion!=='string'||typeof candidate.engineVersion!=='string'||!candidate.rowCounts||!candidate.factTypeCounts)return false;if(candidate.engineVersion===V19_ENGINE&&(!candidate.adminRegistryHash||!candidate.canonicalInputHash))return false;if(candidate.engineVersion===V20_ENGINE&&(!candidate.adminRegistryHash||!candidate.rcaTargetRegistryHash||!candidate.canonicalInputHash))return false;if(candidate.engineVersion===V21_ENGINE&&(!candidate.adminRegistryHash||!candidate.rcaTargetRegistryHash||!candidate.canonicalInputHash||candidate.sourceContractVersion!=='v2'||!candidate.sourceReplacementProofHash||!Array.isArray(candidate.sourceReplacements)))return false;return true}

/** Resolves current v21 and recognizes older active pointers only so sourceImport can rebuild them safely. */
export function resolveActiveCanonicalBundle(storage:Storage|undefined=typeof localStorage==='undefined'?undefined:localStorage):ActiveCanonicalBundle|null{if(!storage)return null;try{const stored=JSON.parse(storage.getItem(ACTIVE_KEY)??'null') as ActiveCanonicalBundle|Deactivated|null;return isActiveCanonicalBundle(stored)?stored:null}catch{return null}}
/** Activates a fully materialized canonical build only after its persistence layer has validated it. */
export function activateCanonicalBundleReference(bundle:ActiveCanonicalBundle,storage:Storage|undefined=typeof localStorage==='undefined'?undefined:localStorage){if(storage){storage.removeItem(LEGACY_KEY);storage.setItem(ACTIVE_KEY,JSON.stringify(bundle));}return bundle}
/** Back-up/restore path for the originally homologated canonical bundle. */
export function activateApprovedCanonicalBundle(storage:Storage|undefined=typeof localStorage==='undefined'?undefined:localStorage){return activateCanonicalBundleReference(APPROVED_CANONICAL_BUILD,storage)}
/** Rollback means no active canonical bundle, never a legacy runtime fallback. */
export function deactivateCanonicalBundle(storage:Storage|undefined=typeof localStorage==='undefined'?undefined:localStorage){if(storage)storage.setItem(ACTIVE_KEY,JSON.stringify({status:'NONE',deactivatedAt:new Date().toISOString()} satisfies Deactivated));}
