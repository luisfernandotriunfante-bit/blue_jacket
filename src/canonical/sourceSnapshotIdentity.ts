import { REQUIRED_SOURCE_IDS, type SourceStorageSnapshot } from './sourceImport';

async function sha256Bytes(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

/**
 * Computes the exact source identity used by sourceImport.ts stagingManifestHash:
 * REQUIRED_SOURCE_IDS order and [source,fileHash,parserVersion,schemaVersion]
 * for every required source. The canonical build algorithm itself remains
 * untouched; this function only verifies an exported SourceStorageSnapshot.
 */
export async function sourceStorageSnapshotManifestHash(snapshot: SourceStorageSnapshot) {
  const compact = REQUIRED_SOURCE_IDS.map(source => {
    const stage = snapshot.staging.find(candidate => candidate.source === source);
    return [
      source,
      stage?.manifest.fileHash ?? '',
      stage?.manifest.parserVersion ?? '',
      stage?.manifest.schemaVersion ?? '',
    ];
  });
  return sha256Bytes(new TextEncoder().encode(JSON.stringify(compact)));
}
