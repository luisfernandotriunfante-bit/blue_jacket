import type { CanonicalList } from './types';
import type { ExportProvenance } from './exporters';
import { APPROVED_CANONICAL_BUILD } from './runtime';
import { loadImportedBundleManifest, loadImportedCanonicalList, type BundleLoadOptions } from './bundleStore';

export const candidateBuild={motorBuildId:APPROVED_CANONICAL_BUILD.motorBuildId,stagingManifestHash:APPROVED_CANONICAL_BUILD.stagingManifestHash,schemaVersion:APPROVED_CANONICAL_BUILD.schemaVersion} satisfies ExportProvenance;
export async function loadCandidateManifest(options?:BundleLoadOptions){return loadImportedBundleManifest(options);}
export async function loadCandidateList(id:CanonicalList['id'],options?:BundleLoadOptions){return loadImportedCanonicalList(id,options);}
