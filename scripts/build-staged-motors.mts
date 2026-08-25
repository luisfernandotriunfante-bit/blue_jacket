import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCanonicalBundleFromStaging } from '../src/canonical/motors.ts';
import type { ParsedSource } from '../src/canonical/types.ts';

const stagingRoot=process.env.CANONICAL_STAGING_ROOT ?? '.tmp/canonical-staging';
const manifestPath=join(stagingRoot,'manifest.json');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
if(manifest.status!=='READY_FOR_MOTORS'||manifest.sourcesValid!==19||manifest.sourcesInvalid!==0||manifest.sourcesMissing!==0)
 throw new Error('STAGING_NOT_READY_FOR_MOTORS: global staging manifest does not meet the 19/19 precondition.');

type StagingSource={sourceId:string;stagingPath:string};
const asSource=(entry:StagingSource):ParsedSource=>{
 const sourceDir=entry.stagingPath.startsWith(stagingRoot)?entry.stagingPath:join(stagingRoot,entry.stagingPath);
 const parsedPath=join(sourceDir,'parsed.json');
 if(!existsSync(parsedPath)) throw new Error(`STAGING_PAYLOAD_MISSING: ${entry.sourceId}`);
 const payload=JSON.parse(readFileSync(parsedPath,'utf8'));
 if(Array.isArray(payload)) return {source:entry.sourceId,fileName:entry.sourceId,sheet:'staging',rows:[],audits:[]};
 return payload;
};

// The composed source is intentionally loaded as four independent staged
// datasets. This is a read-only operation and never reopens its workbook.
const stagedSources:ParsedSource[]=manifest.sources.flatMap((entry:StagingSource)=>{
 if(entry.sourceId!=="Sortimento Recomendado - Q3'26.xlsx") return [asSource(entry)];
 const d=entry.stagingPath.startsWith(stagingRoot)?entry.stagingPath:join(stagingRoot,entry.stagingPath);
 return [['jul_base.json','JUL_BASE'],['aug_sep_base.json','AUG_SEP_BASE'],['hair_override.json','HAIR_OVERRIDE'],['discontinued_q3.json','DISCONTINUED_Q3']].map(([file,sheet])=>({source:entry.sourceId,fileName:entry.sourceId,sheet,rows:JSON.parse(readFileSync(join(d,file),'utf8')),audits:[]} as ParsedSource));
});
const bundle=buildCanonicalBundleFromStaging(stagedSources);
const generatedAt=new Date().toISOString();
const stagingManifestHash=createHash('sha256').update(readFileSync(manifestPath)).digest('hex');
const motorBuildId=`motor-${Date.now()}`;
const output=join('.tmp/canonical-motors',motorBuildId);
mkdirSync(output,{recursive:true});
for(const [id,list] of Object.entries(bundle.lists)) writeFileSync(join(output,`${id}.json`),JSON.stringify(list));
const factTypeCounts=Object.fromEntries(['SALE','INBOUND_ORDER','RECEIPT','TARGET'].map(k=>[k,bundle.lists.M3_MOVIMENTO_VENDAS.records.filter(r=>r.fact_type===k).length]));
const rowTypeCounts=Object.fromEntries(['TRANSACTION_379','AGG_310','RECEIPT_12322'].map(k=>[k,bundle.lists.M4_HISTORICO_TRANSICAO.records.filter(r=>r.row_type===k).length]));
const movementClassCounts=Object.fromEntries(['SALE','RETURN','OTHER'].map(k=>[k,bundle.lists.M4_HISTORICO_TRANSICAO.records.filter(r=>r.movement_class===k).length]));
const result={motorBuildId,generatedAt,engineVersion:'stage3-v1',schemaVersion:'v1',stagingManifestHash,status:'VALID',lists:Object.fromEntries(Object.entries(bundle.lists).map(([id,list])=>[id,{rowCount:list.records.length,warnings:list.warnings.length,errors:list.errors.length}])),factTypeCounts,rowTypeCounts,movementClassCounts,activeCanonicalBundleChanged:false};
writeFileSync(join(output,'manifest.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({output,...result},null,2));
