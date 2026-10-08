import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, managerKey, rankPayments } from '../lib/payments.ts';
test('amounts use exact kopecks and accept Russian formatting',()=>{
  assert.equal(parseAmount('150 000,25'),15000025);
  assert.equal(parseAmount('0.01'),1);
  for(const invalid of ['0','-100','1.234','NaN','1e6','1,2,3','1000000000']) assert.throws(()=>parseAmount(invalid));
});
test('repeat payments from one manager combine, normalized names match',()=>{
  const key=managerKey('  Анна  ','Иванова');assert.equal(key,managerKey('АННА','ИВАНОВА'));
  const base={slot:1,managerKey:key,firstName:'Анна',lastName:'Иванова',photoKey:'one.jpg',version:1,updatedAt:'2026-10-01',amountKopecks:10025};
  const result=rankPayments([base,{...base,slot:2,amountKopecks:2075},{...base,slot:3,managerKey:'other',firstName:'Елена',amountKopecks:11000}]);
  assert.equal(result.length,2);assert.equal(result[0].count,2);assert.equal(result[0].amountKopecks,12100);
  assert.equal(result[1].count,1);
});
