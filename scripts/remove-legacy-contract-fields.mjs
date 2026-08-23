import { readFileSync, writeFileSync, rmSync } from 'node:fs';

function edit(path, changes){let s=readFileSync(path,'utf8');for(const [from,to,label] of changes){if(!s.includes(from))throw new Error(`${label} não encontrado em ${path}`);s=s.replace(from,to)}writeFileSync(path,s,'utf8')}

edit('src/domain/canonical.ts',[
  ["  legacyNetworkTargets: Record<string, number>;\n  legacyNetworkOwners: Record<string, { teamCode:string; vendorCode:string }>;\n  legacyClientNetworks: Record<string, string>;\n  legacyClientOwners: Record<string, { teamCode:string; vendorCode:string }>;\n",'', 'campos legacy support'],
  ["export const EMPTY_CANONICAL_SUPPORT: CanonicalSupportData = { rcas:[], vendorTargets:[], clients:[], activeRoute:[], legacyNetworkTargets:{}, legacyNetworkOwners:{}, legacyClientNetworks:{}, legacyClientOwners:{}, products:[], itemCodes:[] };","export const EMPTY_CANONICAL_SUPPORT: CanonicalSupportData = { rcas:[], vendorTargets:[], clients:[], activeRoute:[], products:[], itemCodes:[] };", 'empty support'],
  ["export interface CanonicalNetworkResult { key:string; name:string; teamCode:string; vendorCode:string; detectedNetworkTarget:number; networkTarget:number; topTarget:number; invoiced:number; toInvoice:number; total:number; networkAttainment:number; topAttainment:number; gapToNetworkTarget:number; gapToTopTarget:number; clients:number; stores:CanonicalNetworkStore[]; }","export interface CanonicalNetworkResult { key:string; name:string; networkTarget:number; topTarget:number; invoiced:number; toInvoice:number; total:number; networkAttainment:number; topAttainment:number; gapToNetworkTarget:number; gapToTopTarget:number; clients:number; stores:CanonicalNetworkStore[]; }", 'network result legado'],
]);

const calc='src/services/motors/calculationService.ts';
let s=readFileSync(calc,'utf8');
if(!s.includes("return{key,name,teamCode:'',vendorCode:'',detectedNetworkTarget:0,networkTarget:target"))throw new Error('retorno network legado não encontrado');
s=s.replace("return{key,name,teamCode:'',vendorCode:'',detectedNetworkTarget:0,networkTarget:target","return{key,name,networkTarget:target");
writeFileSync(calc,s,'utf8');

rmSync('scripts/remove-legacy-contract-fields.mjs');
rmSync('.github/workflows/remove-legacy-contract-fields.yml');
