import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePremisesClassification } from '../src/services/motors/customerMotor.ts';

test('Premissas aceita CNPJ declarado com zero inicial perdido e rejeita código curto', () => {
  const header = ['SEMESTRE_PREMISSA','AMBIENTE','COD CLIENTE','NOME_CLIENTE','FAIXAS','ESTADO','CIDADE','IND_CLUSTER_COD','IND_CLUSTER_DESC','AVG 12 MESES','AREA DISTRIBUIDOR','AREA NIELSEN','PERFIL','TIPO','CHECK PDV','REDE'];
  const valid = Array(16).fill(''); valid[0]='2SEM26'; valid[2]=4757459000519; valid[3]='ABV'; valid[10]='MILENIO'; valid[12]='VAREJO'; valid[13]='CNPJ'; valid[15]='REDE ABV';
  const invalid = Array(16).fill(''); invalid[0]='2SEM26'; invalid[2]=11846; invalid[3]='CODIGO'; invalid[10]='MILENIO'; invalid[12]='REPASSE VAREJO'; invalid[13]='CNPJ';
  const parsed = parsePremisesClassification([header, valid, invalid]);
  assert.equal(parsed.classifications.length, 1);
  assert.equal(parsed.classifications[0].cnpj, '04757459000519');
  assert.equal(parsed.qualityIssues.some(issue=>issue.code==='PREMISES_INVALID_CNPJ'), true);
});
