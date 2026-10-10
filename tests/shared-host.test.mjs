import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { once } from 'node:events';

// Every mutation uses a newly created local test directory. Real exports are read-only.
const php = resolve(process.env.PHP_BINARY ?? 'work/php-runtime/php.exe');
const work = await mkdtemp(resolve('work/shared-host-test-'));
const docroot = join(work, 'public_html');
const data = join(work, 'zaruba-data');
await cp(resolve('hosting/public_html'), docroot, { recursive:true });
await mkdir(join(data,'photos'), { recursive:true });
const password = randomBytes(20).toString('hex');
const passwordHash = execFileSync(php, ['-r', "echo password_hash(getenv('TEST_PASSWORD'), PASSWORD_BCRYPT);"], { encoding:'utf8', env:{...process.env, TEST_PASSWORD:password} });
const socket = createServer(); socket.listen(0,'127.0.0.1'); await once(socket,'listening');
const port=socket.address().port; await new Promise(r=>socket.close(r));
const origin=`http://127.0.0.1:${port}`;
const config={passwordHash,sessionSecret:randomBytes(48).toString('hex'),origin};
await writeFile(join(data,'config.php'), `<?php return json_decode(base64_decode('${Buffer.from(JSON.stringify(config)).toString('base64')}'), true);`);
await writeFile(join(data,'payments.json'), JSON.stringify({payments:[],slotVersions:{}}));
const extensions=process.platform==='win32'?['-d',`extension_dir=${join(dirname(php),'ext')}`,'-d','extension=mbstring','-d','extension=intl']:[];
let server, logs='';
const start=async()=>{
  server=spawn(php,[...extensions,'-d','upload_max_filesize=5M','-d','post_max_size=6M','-d','display_errors=0','-S',`127.0.0.1:${port}`,'-t',docroot,resolve('hosting/router.php')],{windowsHide:true});
  server.stderr.on('data',d=>logs+=d); server.stdout.on('data',d=>logs+=d);
  for(let i=0;i<60;i++){
    try { const r=await fetch(origin+'/api/payments'); if(r.ok)return; }catch{}
    await new Promise(r=>setTimeout(r,100));
  }
  throw new Error('Local PHP did not start: '+logs);
};
const stop=async()=>{const done=once(server,'exit');server.kill();await done;};
try {
  await start();
  // Run existing end-to-end behavior checks against the new backend.
  const smoke=spawn(process.execPath,['tests/api-smoke.mjs'],{env:{...process.env,TEST_ORIGIN:origin,TEST_ADMIN_PASSWORD:password},windowsHide:true,stdio:'inherit'});
  assert.equal((await once(smoke,'exit'))[0],0);
  const login=await fetch(origin+'/api/auth',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'ADMIN',password})});
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const testPhoto=await readFile('public/assets/coin.png');
  const post=async(slot,version,bytes=testPhoto,firstName='Тест')=>{
    const form=new FormData();
    for(const [key,value] of Object.entries({slot,version,firstName,lastName:'Менеджер',amount:'123,45'}))form.set(key,String(value));
    form.set('photo',new Blob([bytes],{type:'image/png'}),'photo.png');
    return fetch(origin+'/api/payments',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:form});
  };
  assert.equal((await post(1,0)).status,200);
  let rows=(await fetch(origin+'/api/payments').then(r=>r.json())).payments;
  assert.equal(rows[0].version,3,'deleted/recreated slots must not reuse an old edit version');
  assert.equal((await post(1,2)).status,409);
  assert.equal((await post(3,0,Buffer.from('<script>not an image</script>'))).status,400);
  assert.equal((await post(3,0,Buffer.alloc(5_000_001)) ).status,400);
  assert.equal((await fetch(origin+'/api/photos/..%2fconfig.php')).status,404);
  assert.equal((await fetch(origin+'/zaruba-data/payments.json')).status,404);
  const expired=`1.nonce.${'0'.repeat(64)}`;
  assert.equal((await fetch(origin+'/api/payments',{headers:{Cookie:'zaruba_ru_admin='+expired}}).then(r=>r.json())).canEdit,false);
  const beforeRestart=rows;
  await stop(); await start();
  rows=(await fetch(origin+'/api/payments').then(r=>r.json())).payments;
  assert.deepEqual(rows,beforeRestart,'payments survive a server restart');
  assert.ok((await readdir(join(data,'backups'))).length>=5);
  for(let i=0;i<10;i++)assert.equal((await fetch(origin+'/api/auth',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{"username":"ADMIN","password":"wrong"}'})).status,401);
  assert.equal((await fetch(origin+'/api/auth',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'ADMIN',password})})).status,429);
  console.log('PASS: restart persistence, stale edits after slot reuse, image validation, private data isolation, expired cookies, backups, login rate limit');

  // Install a COPY of the export in the disposable directory and verify reads byte for byte.
  const backup=process.env.MIGRATION_BACKUP;
  if(backup){
    await stop();
    const imported=JSON.parse(await readFile(join(backup,'payments.json'),'utf8'));
    await cp(join(backup,'photos'),join(data,'photos'),{recursive:true});
    await writeFile(join(data,'payments.json'),JSON.stringify({payments:imported,slotVersions:Object.fromEntries(imported.map(p=>[p.slot,p.version]))}));
    await start();
    const result=await fetch(origin+'/api/payments').then(r=>r.json());
    assert.deepEqual(result.payments,imported);
    for(const p of imported){
      const expected=await readFile(join(backup,'photos',p.photoKey));
      const actual=Buffer.from(await (await fetch(origin+'/api/photos/'+p.photoKey)).arrayBuffer());
      assert.equal(createHash('sha256').update(actual).digest('hex'),createHash('sha256').update(expected).digest('hex'));
    }
    console.log(`PASS: ${imported.length} imported payments and every photo match the original snapshot exactly`);
  }
} finally { if(server && server.exitCode===null)await stop(); }
