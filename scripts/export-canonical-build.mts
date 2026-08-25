import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import contract from '../src/canonical/contracts/blueJacketContractV1.json' with { type: 'json' };
import { createExcelWorkbook } from '../src/canonical/exporters.ts';
import { writeCanonicalXlsx } from './stream-canonical-xlsx.mts';

const buildId='motor-1787651967348', root=join('.tmp/canonical-motors',buildId), expected={M1_ITEM_ESTOQUE:744,M2_CLIENTE_RCA:8748,M3_MOVIMENTO_VENDAS:4291,M4_HISTORICO_TRANSICAO:316772} as const;
const manifest=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));
if(manifest.motorBuildId!==buildId||manifest.stagingManifestHash!=='24cd8c8f794bc5387a3a4c199289cf84360c1912035c41ce52eb7ef5a049085b'||manifest.status!=='VALID')throw new Error('MOTOR_BUILD_INTEGRITY_FAILED: manifest mismatch.');
const schemas=contract.motor_schemas as Record<string,Array<{field:string;type:string}>>; const output=join('.tmp/canonical-exports',buildId);mkdirSync(output,{recursive:true});
const provenance={motorBuildId:buildId,stagingManifestHash:manifest.stagingManifestHash,schemaVersion:manifest.schemaVersion,generatedAt:manifest.generatedAt};const results:any={};
for(const [id,rowCount] of Object.entries(expected)){
 const list=JSON.parse(readFileSync(join(root,`${id}.json`),'utf8'));
 if(list.id!==id||list.records.length!==rowCount||!Array.isArray(list.records))throw new Error(`MOTOR_BUILD_INTEGRITY_FAILED: ${id}`);
 const fields=schemas[id].map(x=>x.field); if(Object.keys(list.records[0]).join('|')!==fields.join('|'))throw new Error(`SCHEMA_VALIDATION_FAILED: ${id}`);
 const payload={...provenance,rowCount,listId:id,records:list.records}; const jsonPath=join(output,`${id}.json`);writeFileSync(jsonPath,JSON.stringify(payload));
 const xlsxPath=join(output,`${id}.xlsx`);if(id==='M4_HISTORICO_TRANSICAO')await writeCanonicalXlsx(xlsxPath,list,schemas[id],{...provenance,rowCount,listId:id});else XLSX.writeFile(createExcelWorkbook(list,provenance),xlsxPath,{bookType:'xlsx',cellDates:true,compression:true});
 const reopened=XLSX.read(readFileSync(xlsxPath),{type:'buffer',cellDates:true,raw:true});const sheet=reopened.Sheets[id];const range=XLSX.utils.decode_range(sheet['!ref']??'A1:A1');const excelRows=range.e.r; if(excelRows!==rowCount)throw new Error(`EXCEL_REOPEN_FAILED: ${id} rows=${excelRows}`);
 const metadata=XLSX.utils.sheet_to_json(reopened.Sheets.METADATA,{header:1}) as any[][]; const meta=Object.fromEntries(metadata.slice(1).map(r=>[r[0],r[1]]));if(meta.motorBuildId!==buildId||meta.stagingManifestHash!==manifest.stagingManifestHash||Number(meta.rowCount)!==rowCount)throw new Error(`METADATA_VALIDATION_FAILED: ${id}`);
 results[id]={motorRows:rowCount,jsonRows:JSON.parse(readFileSync(jsonPath,'utf8')).records.length,excelRows,excelReopen:'PASS',jsonSha256:createHash('sha256').update(readFileSync(jsonPath)).digest('hex'),xlsxBytes:readFileSync(xlsxPath).byteLength};
 console.log(`${id}: ${JSON.stringify(results[id])}`);
}
writeFileSync(join(output,'manifest.json'),JSON.stringify({buildId,provenance,results,activeCanonicalBundleChanged:false},null,2));console.log(JSON.stringify({output,results},null,2));
