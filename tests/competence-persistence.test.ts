import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MANUAL_CONFIGURATION } from '../src/domain/canonical.ts';
import {
  LEGACY_MANUAL_CONFIG_KEY,
  competenceFromPeriod,
  loadManualConfiguration,
  manualConfigStorageKey,
  normalizeManualConfiguration,
  saveManualConfiguration,
  type StorageLike,
} from '../src/store/competencePersistence.ts';

class MemoryStorage implements StorageLike {
  private data=new Map<string,string>();
  getItem(key:string){return this.data.get(key)??null}
  setItem(key:string,value:string){this.data.set(key,value)}
  removeItem(key:string){this.data.delete(key)}
}

const config=(overrides:Partial<typeof DEFAULT_MANUAL_CONFIGURATION>={})=>normalizeManualConfiguration({...DEFAULT_MANUAL_CONFIGURATION,...overrides});

test('competência é derivada do início do período e rejeita mês inválido',()=>{
  assert.equal(competenceFromPeriod('2026-08-01'),'2026-08');
  assert.equal(competenceFromPeriod('2026-09'),'2026-09');
  assert.equal(competenceFromPeriod('2026-13-01'),'');
  assert.equal(manualConfigStorageKey('2026-08'),'bj_manual_config:2026-08');
});

test('agosto e setembro mantêm configurações independentes',()=>{
  const storage=new MemoryStorage();
  const august=config({sellOutTarget:5_000_000,coverageTargetDays:60,portfolioSaleMarkup:0.31,networkTargets:{ABV:1_200_000}});
  const september=config({sellOutTarget:5_500_000,coverageTargetDays:45,portfolioSaleMarkup:0.28,networkTargets:{ABV:900_000}});

  saveManualConfiguration(storage,'2026-08',august);
  saveManualConfiguration(storage,'2026-09',september);

  const loadedAugust=loadManualConfiguration(storage,'2026-08');
  const loadedSeptember=loadManualConfiguration(storage,'2026-09');

  assert.equal(loadedAugust.source,'COMPETENCE');
  assert.equal(loadedAugust.config.sellOutTarget,5_000_000);
  assert.equal(loadedAugust.config.networkTargets.ABV,1_200_000);
  assert.equal(loadedSeptember.config.sellOutTarget,5_500_000);
  assert.equal(loadedSeptember.config.coverageTargetDays,45);
  assert.equal(loadedSeptember.config.networkTargets.ABV,900_000);
});

test('competência sem configuração não herda silenciosamente o mês anterior',()=>{
  const storage=new MemoryStorage();
  saveManualConfiguration(storage,'2026-08',config({sellOutTarget:5_000_000,networkTargets:{ABV:1_200_000}}));

  const september=loadManualConfiguration(storage,'2026-09');
  assert.equal(september.source,'DEFAULT');
  assert.equal(september.config.sellOutTarget,DEFAULT_MANUAL_CONFIGURATION.sellOutTarget);
  assert.deepEqual(september.config.networkTargets,{});
});

test('configuração global antiga só migra quando a competência conhecida autoriza',()=>{
  const storage=new MemoryStorage();
  storage.setItem(LEGACY_MANUAL_CONFIG_KEY,JSON.stringify(config({sellOutTarget:4_800_000,coverageTargetDays:55})));

  const withoutMigration=loadManualConfiguration(storage,'2026-09');
  assert.equal(withoutMigration.source,'DEFAULT');
  assert.equal(storage.getItem(LEGACY_MANUAL_CONFIG_KEY)!==null,true);

  const migrated=loadManualConfiguration(storage,'2026-08',{migrateLegacy:true});
  assert.equal(migrated.source,'LEGACY_MIGRATED');
  assert.equal(migrated.config.sellOutTarget,4_800_000);
  assert.equal(storage.getItem(LEGACY_MANUAL_CONFIG_KEY),null);
  assert.equal(loadManualConfiguration(storage,'2026-08').source,'COMPETENCE');
  assert.equal(loadManualConfiguration(storage,'2026-09').source,'DEFAULT');
});

test('feriados removidos permanecem removidos dentro da competência',()=>{
  const storage=new MemoryStorage();
  const august=config({holidays:['2026-08-26']});
  saveManualConfiguration(storage,'2026-08',august);
  const edited={...loadManualConfiguration(storage,'2026-08').config,holidays:[]};
  saveManualConfiguration(storage,'2026-08',edited);

  const reloaded=loadManualConfiguration(storage,'2026-08');
  assert.deepEqual(reloaded.config.holidays,[]);
});
