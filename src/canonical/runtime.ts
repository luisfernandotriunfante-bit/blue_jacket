import type { CanonicalList } from './types';

export type ActiveCanonicalBundle={status:'ACTIVE';motorBuildId:string;stagingManifestHash:string;schemaVersion:string;engineVersion:string;approvedAt:string;rowCounts:Record<CanonicalList['id'],number>;factTypeCounts:Record<'SALE'|'INBOUND_ORDER'|'RECEIPT'|'TARGET',number>};
type Deactivated={status:'NONE';deactivatedAt:string};
const ACTIVE_KEY='blue-jacket-v3:active-canonical-build';
const LEGACY_KEY='blue-jacket-v2:canonical-bundle';
export const APPROVED_CANONICAL_BUILD:ActiveCanonicalBundle={status:'ACTIVE',motorBuildId:'motor-1787651967348',stagingManifestHash:'24cd8c8f794bc5387a3a4c199289cf84360c1912035c41ce52eb7ef5a049085b',schemaVersion:'v1',engineVersion:'stage3-v1',approvedAt:'2026-08-25T10:00:00.000Z',rowCounts:{M1_ITEM_ESTOQUE:744,M2_CLIENTE_RCA:8748,M3_MOVIMENTO_VENDAS:4291,M4_HISTORICO_TRANSICAO:316772},factTypeCounts:{SALE:3652,INBOUND_ORDER:542,RECEIPT:69,TARGET:28}};

/** Resolves a pointer only. It never opens source files, invokes parsers, or runs motors. */
export function resolveActiveCanonicalBundle(storage:Storage|undefined=typeof localStorage==='undefined'?undefined:localStorage):ActiveCanonicalBundle|null{if(!storage)return null;try{const stored=JSON.parse(storage.getItem(ACTIVE_KEY)??'null') as ActiveCanonicalBundle|Deactivated|null;if(stored?.status==='ACTIVE'&&stored.motorBuildId===APPROVED_CANONICAL_BUILD.motorBuildId&&stored.stagingManifestHash===APPROVED_CANONICAL_BUILD.stagingManifestHash)return stored;return null}catch{return null}}
/** Writes the approved reference only; lists remain immutable static candidate files. */
export function activateApprovedCanonicalBundle(storage:Storage|undefined=typeof localStorage==='undefined'?undefined:localStorage){if(storage){storage.removeItem(LEGACY_KEY);storage.setItem(ACTIVE_KEY,JSON.stringify(APPROVED_CANONICAL_BUILD));}return APPROVED_CANONICAL_BUILD}
/** Rollback means no active canonical bundle, never a legacy runtime fallback. */
export function deactivateCanonicalBundle(storage:Storage|undefined=typeof localStorage==='undefined'?undefined:localStorage){if(storage)storage.setItem(ACTIVE_KEY,JSON.stringify({status:'NONE',deactivatedAt:new Date().toISOString()} satisfies Deactivated));}
