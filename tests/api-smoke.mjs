import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const origin=process.env.TEST_ORIGIN??'http://127.0.0.1:5173';
const adminPassword=process.env.TEST_ADMIN_PASSWORD;
if(!adminPassword) throw new Error('Set TEST_ADMIN_PASSWORD for the local test environment.');
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('This test is restricted to a local test database.');
const initial=await fetch(origin+'/api/payments').then(r=>r.json());
assert.deepEqual(initial.payments,[], 'Requires an empty local database');
assert.equal(initial.canEdit,false);
assert.equal((await fetch(origin+'/api/payments',{method:'POST',headers:{Origin:origin}})).status,403);
const bad=await fetch(origin+'/api/auth',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'ADMIN',password:'wrong'})});assert.equal(bad.status,401);
const login=await fetch(origin+'/api/auth',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'ADMIN',password:adminPassword})});assert.equal(login.status,200,await login.text());
const cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly/);
const post=async(slot,version,amount,first='Тест',last='Менеджер',photo=true)=>{const form=new FormData();Object.entries({slot,version,amount,firstName:first,lastName:last}).forEach(([k,v])=>form.set(k,String(v)));if(photo)form.set('photo',new Blob([await readFile(new URL('../public/assets/coin.png',import.meta.url))],{type:'image/png'}),'test.png');return fetch(origin+'/api/payments',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:form});};
try{
  assert.equal((await post(1,0,'150000.25')).status,200);
  assert.equal((await post(2,0,'50000.50','ТЕСТ','МЕНЕДЖЕР',false)).status,200);
  assert.equal((await post(1,0,'999')).status,409);
  const visitor=await fetch(origin+'/api/payments').then(r=>r.json());assert.equal(visitor.canEdit,false);assert.equal(visitor.payments.length,2);assert.equal(visitor.payments.reduce((s,p)=>s+p.amountKopecks,0),20000075);
  assert.equal(visitor.payments[0].managerKey,visitor.payments[1].managerKey);
  assert.equal((await fetch(origin+'/api/photos/'+visitor.payments[0].photoKey)).status,200);
  assert.equal((await post(1,1,'160000.25', 'Тест','Менеджер',false)).status,200);
  assert.equal((await post(1,1,'888')).status,409);
  assert.equal((await fetch(origin+'/api/payments',{method:'DELETE',headers:{Origin:'https://wrong.example',Cookie:cookie,'Content-Type':'application/json'},body:'{"slot":1,"version":2}'})).status,403);
  const admin=await fetch(origin+'/api/payments',{headers:{Cookie:cookie}}).then(r=>r.json());assert.equal(admin.canEdit,true);
  console.log('PASS: public reads, login, protected writes, uploads, repeat manager, exact amounts, edit, conflict and origin protection');
}finally{
  const rows=await fetch(origin+'/api/payments').then(r=>r.json());
  for(const p of rows.payments)assert.equal((await fetch(origin+'/api/payments',{method:'DELETE',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({slot:p.slot,version:p.version})})).status,200);
}
assert.equal((await fetch(origin+'/api/payments').then(r=>r.json())).payments.length,0);
const logout=await fetch(origin+'/api/auth',{method:'DELETE',headers:{Origin:origin,Cookie:cookie}});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
console.log('PASS: deletion, restored empty state and logout');
