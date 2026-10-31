import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
function client(port,token,role){
  const ws=new WebSocket(`ws://127.0.0.1:${port}/online`),queue=[],waiters=[];
  ws.on('open',()=>ws.send(JSON.stringify({type:'join',token,role})));
  ws.on('message',raw=>{const msg=JSON.parse(raw);queue.push(msg);for(const w of [...waiters])if(w.check(msg)){w.done(msg);waiters.splice(waiters.indexOf(w),1);}});
  return {ws,wait(check){const found=queue.find(check);if(found)return Promise.resolve(found);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('WebSocket message timeout')),6000);waiters.push({check,done:msg=>{clearTimeout(timer);resolve(msg);}});});}};
}
test('real server: two clients share room, signaling relays, third rejected, disk save survives restart',{timeout:20000},async()=>{
  const data=await mkdtemp(join(tmpdir(),'deni-islam-test-')),port=3191,token1='10000000-aaaa-aaaa-aaaa-aaaaaaaaaaaa',token2='20000000-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  let process,connections=[];
  async function start(){process=spawn('node',['server/index.js'],{env:{...global.process.env,NODE_ENV:'production',PORT:String(port),DATA_DIR:data},stdio:['ignore','pipe','pipe']});let log='';await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server start timeout: '+log)),6000);process.stdout.on('data',raw=>{log+=raw;if(log.includes('one room')){clearTimeout(timer);resolve();}});process.on('exit',code=>{if(code){clearTimeout(timer);reject(Error('Server exited '+code));}});});}
  async function stop(){const child=process;if(!child||child.exitCode!==null)return;await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});}
  try{
    await start();const a=client(port,token1,'deni');connections.push(a.ws);assert.equal((await a.wait(m=>m.type==='welcome')).slot,0);
    const b=client(port,token2,'islam');connections.push(b.ws);assert.equal((await b.wait(m=>m.type==='welcome')).slot,1);
    const sa=await a.wait(m=>m.type==='state'&&m.players.length===2);assert.deepEqual(sa.players.map(p=>p.name),['Deni','Islam']);assert.equal(sa.self.balance,200);assert.equal(sa.players.filter(p=>p.id==='self').length,1);assert.ok(!JSON.stringify(sa).includes(token2));
    const c=client(port,'30000000-aaaa-aaaa-aaaa-aaaaaaaaaaaa','deni');connections.push(c.ws);assert.match((await c.wait(m=>m.type==='error')).text,/заполнен/);
    a.ws.send(JSON.stringify({type:'signal',data:{test:'voice-check'}}));assert.equal((await b.wait(m=>m.type==='signal')).data.test,'voice-check');
    const health=await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();assert.equal(health.players,2);
    await stop();const saved=JSON.parse(await readFile(join(data,'save.json'),'utf8'));assert.equal(saved.profiles[token1].balance,200);assert.equal(saved.profiles[token2].slot,1);
    await start();const again=client(port,token1,'deni');connections.push(again.ws);const restored=await again.wait(m=>m.type==='state');assert.equal(restored.self.balance,200);assert.equal(restored.players[0].name,'Deni');
  }finally{for(const ws of connections)ws.terminate();await stop();await rm(data,{recursive:true,force:true});}
});
