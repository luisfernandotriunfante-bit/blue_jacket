import type { CanonicalSalesTransaction } from '../src/domain/canonical.ts';

export function sale(overrides:Partial<CanonicalSalesTransaction>={}):CanonicalSalesTransaction {
  return{
    date:'2026-08-17',status:'FATURADO',clientCode:'1',clientName:'Cliente',cnpj:'02318826000200',city:'Campo Grande',
    vendorCode:'101',vendorName:'Vendedor',supervisorCode:'10',supervisorName:'FLAVIO',manufacturerCode:'MAT1',ean:'7890000000000',
    internalProductCode:'100',productDescription:'Produto',cases:1,units:12,value:100,saleType:'VENDA',line:'Creme Dental',...overrides,
  };
}

export function gtin13(body12:string):string {
  const body=body12.padStart(12,'0').slice(-12);let sum=0;
  for(let index=body.length-1,position=0;index>=0;index-=1,position+=1)sum+=Number(body[index])*(position%2===0?3:1);
  return`${body}${(10-(sum%10))%10}`;
}
