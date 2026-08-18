import { readFile,stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { processCanonicalFiles } from '../src/services/canonicalEngine.ts';

const paths=process.argv.slice(2);
if(!paths.length){
  console.error('Uso: npm run audit:sources -- <arquivo1> <arquivo2> ...');
  process.exit(2);
}

const files:File[]=[];
for(const path of paths){
  const [buffer,metadata]=await Promise.all([readFile(path),stat(path)]);
  files.push(new File([buffer],basename(path),{lastModified:metadata.mtimeMs}));
}

const {canonical}=await processCanonicalFiles(files);
const result={
  referenceDate:canonical.referenceDate,
  sources:canonical.sources,
  sellOut:canonical.sellOut,
  stock:canonical.stock,
  counts:{transactions:canonical.transactions.length,inventory:canonical.inventory.length,vendors:canonical.vendors.length,coordinators:canonical.coordinators.length,clients:canonical.clients.length,networks:canonical.networks.length},
  reconciliation:canonical.reconciliation,
  warnings:canonical.warnings,
};
console.log(JSON.stringify(result,null,2));
