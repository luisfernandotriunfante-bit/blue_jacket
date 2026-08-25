import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import contract from '../src/canonical/contracts/blueJacketContractV1.json' with { type: 'json' };
import { typed } from '../src/canonical/normalization.ts';
import { readCompassZip } from '../src/canonical/compassZipReader.ts';

const source='Bussola de Metas AGOSTO - 2026 DEFINITIVA.xlsx';
const sourcePath=process.env.BUSSOLA_FILE ?? '/workspace/scratch/aa773cda9b82/upload/15-Bussola-de-Metas-AGOSTO-2026-DEFINITIVA.xlsx';
const root='.tmp/canonical-staging', active=join(root,'bussola');
const bytes=readFileSync(sourcePath), arrayBuffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const started=performance.now(), parsed=readCompassZip(arrayBuffer), fields=(contract.parser_contracts as any[]).filter(x=>x.source===source&&/^[A-Z]+$/.test(x.coordinate));
const letter=(n:number)=>{let s='';while(n){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26)}return s};
// The approved workbook has a physically blank D and a merged/blank E header,
// while the data below E is contractually "Nome". The remaining signature is
// still exact and proves the table instead of assuming a row number.
const headers=parsed.rows.find(r=>r.cells.A==='Supervisor'&&r.cells.B==='St'&&r.cells.C==='Pas.'&&r.cells.G==='CNPJ'&&r.cells.H==='Indústria'&&r.cells.Q==='Meta PNA'&&r.cells.V==='Meta. Pos. Ind.');
if(!headers)throw new Error('PARSER_SCHEMA_CHANGED: fingerprint da Bússola não encontrado na aba Metas.');
const canonical=parsed.rows.filter(r=>r.row>headers.row).filter(r=>['A','B','D','E','G','H','Q','V'].some(c=>(r.cells[c]??'').trim()!==''));
const records=canonical.map(r=>{const record:Record<string,unknown>={};for(const f of fields){const c=f.coordinate;record[f.output_field]={raw:r.rawCells[c]??'',typed:typed(r.cells[c]??'',f.type).typed};}record.__source_row={raw:r.row,typed:r.row};record.__schema_version={raw:'v2-compass-xml',typed:'v2-compass-xml'};record.sourceSheet={raw:'Metas',typed:'Metas'};record.supportRaw=r.supportRaw;return record});
const norm=(s:string)=>(s??'').trim().toUpperCase(); const context=(r:any)=>String(r.pasta_type?.typed??''); const industry=(r:any)=>String(r.industry_name?.typed??'');
const mcd=records.filter(r=>norm(context(r as any))==='MCD'), colgate=records.filter(r=>norm(industry(r as any))==='COLGATE'), eligible=records.filter(r=>norm(context(r as any))==='MCD'&&norm(industry(r as any))==='COLGATE');
const proof=eligible.filter(r=>['706','759'].includes(String((r as any).target_rca_code?.typed))).map(r=>({sourceCode:(r as any).target_rca_code.typed,name:(r as any).target_rca_name.typed,pasta:(r as any).pasta_type.typed,industry:(r as any).industry_name.typed,metaPna:(r as any).sales_target_pna.typed,metaPos:(r as any).positivity_target.typed}));
if(!eligible.length||!proof.some(r=>r.sourceCode==='706')||!proof.some(r=>r.sourceCode==='759'))throw new Error('BUSSOLA_CONTEXT_PROOF_FAILED: MCD/Colgate or mandatory RCA samples missing.');
const archiveRoot='.tmp/canonical-staging-archive'; if(existsSync(active)){mkdirSync(archiveRoot,{recursive:true});renameSync(active,join(archiveRoot,`bussola_${Date.now()}_INVALID_SUPERSEDED`));}
mkdirSync(active,{recursive:true}); const hash=createHash('sha256').update(bytes).digest('hex'); const metrics={xmlRowsSeen:parsed.rows.length,rawParsedRows:parsed.rows.length,canonicalRows:records.length,MCDRows:mcd.length,ColgateRows:colgate.length,MCDColgateRows:eligible.length,TARGETRows:eligible.length};
const manifest={source,sourceId:source,fileName:source,fileHash:hash,parserVersion:'v2-compass-xml',schemaVersion:'v1',schemaVariant:'METAS_A_AC_SUPPORT_AD_DY',status:'VALID',createdAt:new Date().toISOString(),processingTimeMs:performance.now()-started,...metrics,proof,reason:'replaces staging that omitted contractual textual context'};
writeFileSync(join(active,'parsed.json'),JSON.stringify({source,fileName:source,sheet:'Metas',rows:records,audits:[]}));writeFileSync(join(active,'manifest.json'),JSON.stringify(manifest,null,2));
const reload=JSON.parse(readFileSync(join(active,'parsed.json'),'utf8'));if(reload.rows.filter((r:any)=>norm(String(r.pasta_type?.typed))==='MCD'&&norm(String(r.industry_name?.typed))==='COLGATE').length!==eligible.length)throw new Error('STAGING_RELOAD_FAILED: Bússola textual context did not survive reload.');
const global=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));const item=global.sources.find((x:any)=>x.sourceId===source);Object.assign(item,{fileHash:hash,parserVersion:'v2-compass-xml',schemaVersion:'v1',parsedRows:records.length,stagingPath:active,status:'VALID'});global.generatedAt=new Date().toISOString();global.status='READY_FOR_MOTORS';writeFileSync(join(root,'manifest.json'),JSON.stringify(global,null,2));
console.log(JSON.stringify({hash,...metrics,proof,stagingReload:'PASS',totalMs:performance.now()-started},null,2));
