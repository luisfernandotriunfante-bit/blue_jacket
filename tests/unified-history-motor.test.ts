import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyHistoricalMovement, historicalMovementSign, parseHistorical379Transactions } from '../src/services/motors/historicalMotor';

test('Motor Histórico classifica exatamente as combinações aprovadas de venda e devolução', () => {
  for (const operation of ['51201','51216','51234']) {
    for (const cfop of ['5403','5102']) assert.equal(classifyHistoricalMovement(operation, cfop), 'SALE', `${operation}/${cfop}`);
  }
  for (const operation of ['13201','13216','13234']) {
    for (const cfop of ['1411','1202']) assert.equal(classifyHistoricalMovement(operation, cfop), 'RETURN', `${operation}/${cfop}`);
  }
  assert.equal(classifyHistoricalMovement('51201','9999'), 'OTHER');
  assert.equal(classifyHistoricalMovement('99999','5403'), 'OTHER');
  assert.equal(historicalMovementSign('SALE'), 1);
  assert.equal(historicalMovementSign('RETURN'), -1);
  assert.equal(historicalMovementSign('OTHER'), 0);
});

test('379 aceita código histórico de oito dígitos fora do prefixo 111 sem transformá-lo em Winthor', () => {
  const line = '22/02/2025 777013 002 87654321 12,00 70,64 19,67 51201 5403 410 000382468003375 033168717000449 0712 12,00 13,20 33 116.515 1110 JARDIM 7891024158609 0,00';
  const parsed = parseHistorical379Transactions(line, 2025);
  assert.equal(parsed.facts.length, 1);
  const fact = parsed.facts[0];
  assert.equal(fact.legacyProductCode, '87654321');
  assert.equal(fact.movementClass, 'SALE');
  assert.equal(fact.signedValue, 70.64);
  assert.equal(fact.itemCanonicalId, '', 'identidade atual só pode ser resolvida posteriormente via GTIN');
  assert.equal(fact.historicalGtin, '7891024158609');
});

test('devolução histórica recebe sinal negativo e OTHER permanece preservado com sinal zero', () => {
  const returnLine = '22/02/2025 777014 002 11100897 3,00 20,00 2,00 13216 1411 410 000382468003375 033168717000449 0712 3,00 3,30 7891024158609';
  const otherLine = '22/02/2025 777015 002 11100897 5,00 30,00 1,00 99999 5403 410 000382468003375 033168717000449 0712 5,00 5,50 7891024158609';
  const parsed = parseHistorical379Transactions(`${returnLine}\n${otherLine}`, 2025);
  assert.equal(parsed.facts.length, 2);
  assert.equal(parsed.facts[0].movementClass, 'RETURN');
  assert.equal(parsed.facts[0].signedQuantity, -3);
  assert.equal(parsed.facts[0].signedValue, -20);
  assert.equal(parsed.facts[1].movementClass, 'OTHER');
  assert.equal(parsed.facts[1].signedValue, 0);
});
