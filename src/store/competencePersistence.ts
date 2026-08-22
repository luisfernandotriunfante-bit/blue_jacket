import { DEFAULT_MANUAL_CONFIGURATION, LINE_NAMES } from '../domain/canonical';
import type { CanonicalState, ManualConfiguration } from '../domain/canonical';

export interface StorageLike {
  getItem(key:string):string|null;
  setItem(key:string,value:string):void;
  removeItem?(key:string):void;
}

export type ManualConfigLoadSource = 'COMPETENCE' | 'LEGACY_MIGRATED' | 'DEFAULT';
export interface ManualConfigLoadResult { config:ManualConfiguration; source:ManualConfigLoadSource; key:string|null; persistenceError?:string; }

export const LEGACY_MANUAL_CONFIG_KEY='bj_manual_config';
export const MANUAL_CONFIG_PREFIX='bj_manual_config:';

type JsonRead<T>={value:T|null;error:string};
const parseJson=<T>(raw:string|null,label:string):JsonRead<T>=>{
  if(!raw)return{value:null,error:''};
  try{return{value:JSON.parse(raw) as T,error:''}}catch(error){return{value:null,error:`${label}: configuração persistida está corrompida e não foi restaurada (${error instanceof Error?error.message:'JSON inválido'}).`}}
};

const nonNegative=(value:unknown,fallback=0)=>{
  const parsed=Number(value);
  return Number.isFinite(parsed)?Math.max(parsed,0):fallback;
};

export function competenceFromPeriod(periodStart:string|undefined|null):string{
  const match=String(periodStart||'').match(/^(\d{4})-(\d{2})(?:-|$)/);
  if(!match)return'';
  const month=Number(match[2]);
  return month>=1&&month<=12?`${match[1]}-${match[2]}`:'';
}

export function competenceFromCanonical(state:Pick<CanonicalState,'periodStart'>|null|undefined):string{
  return competenceFromPeriod(state?.periodStart);
}

export function manualConfigStorageKey(competence:string):string|null{
  return competenceFromPeriod(`${competence}-01`)?`${MANUAL_CONFIG_PREFIX}${competence}`:null;
}

export function normalizeManualConfiguration(value:Partial<ManualConfiguration>|null|undefined):ManualConfiguration{
  const input=value||{};
  const lineShares={...DEFAULT_MANUAL_CONFIGURATION.lineShares};
  const suppliedShares=input.lineShares||{} as ManualConfiguration['lineShares'];
  LINE_NAMES.forEach(name=>{if(Object.prototype.hasOwnProperty.call(suppliedShares,name))lineShares[name]=nonNegative(suppliedShares[name],lineShares[name])});

  const networkTargets:Record<string,number>={};
  Object.entries(input.networkTargets||{}).forEach(([key,target])=>{networkTargets[key]=nonNegative(target,0)});

  const hasOwnHolidays=Object.prototype.hasOwnProperty.call(input,'holidays');
  const holidays=Array.from(new Set((hasOwnHolidays?(input.holidays||[]):DEFAULT_MANUAL_CONFIGURATION.holidays).filter(Boolean))).sort();

  return{
    sellOutTarget:nonNegative(input.sellOutTarget,DEFAULT_MANUAL_CONFIGURATION.sellOutTarget),
    coverageTargetDays:nonNegative(input.coverageTargetDays,DEFAULT_MANUAL_CONFIGURATION.coverageTargetDays),
    portfolioSaleMarkup:nonNegative(input.portfolioSaleMarkup,DEFAULT_MANUAL_CONFIGURATION.portfolioSaleMarkup),
    networkTargets,
    holidays,
    lineShares,
  };
}

export function loadManualConfiguration(storage:StorageLike,competence:string,{migrateLegacy=false}:{migrateLegacy?:boolean}={}):ManualConfigLoadResult{
  const key=manualConfigStorageKey(competence);
  if(!key)return{config:normalizeManualConfiguration(null),source:'DEFAULT',key:null};

  const scopedRead=parseJson<Partial<ManualConfiguration>>(storage.getItem(key),`Configuração ${competence}`);
  if(scopedRead.value)return{config:normalizeManualConfiguration(scopedRead.value),source:'COMPETENCE',key};
  if(scopedRead.error)return{config:normalizeManualConfiguration(null),source:'DEFAULT',key,persistenceError:scopedRead.error};

  if(migrateLegacy){
    const legacyRead=parseJson<Partial<ManualConfiguration>>(storage.getItem(LEGACY_MANUAL_CONFIG_KEY),'Configuração legada');
    if(legacyRead.value){
      const config=normalizeManualConfiguration(legacyRead.value);
      storage.setItem(key,JSON.stringify(config));
      storage.removeItem?.(LEGACY_MANUAL_CONFIG_KEY);
      return{config,source:'LEGACY_MIGRATED',key};
    }
    if(legacyRead.error)return{config:normalizeManualConfiguration(null),source:'DEFAULT',key,persistenceError:legacyRead.error};
  }

  return{config:normalizeManualConfiguration(null),source:'DEFAULT',key};
}

export function saveManualConfiguration(storage:StorageLike,competence:string,config:ManualConfiguration):string|null{
  const key=manualConfigStorageKey(competence);
  if(!key)return null;
  storage.setItem(key,JSON.stringify(normalizeManualConfiguration(config)));
  storage.removeItem?.(LEGACY_MANUAL_CONFIG_KEY);
  return key;
}
