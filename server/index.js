import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Game } from './game.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dataDir=process.env.DATA_DIR||path.join(root,'data');
await mkdir(dataDir,{recursive:true});
let saved={};try{saved=JSON.parse(await readFile(path.join(dataDir,'save.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')console.error('Save read failed:',e.message);}
const game=new Game(saved), app=express(), server=createServer(app), instance=randomUUID();
app.disable('x-powered-by');
// Read-only discovery endpoints are also used by the bundled Android client.
app.use('/api',(_req,res,next)=>{res.setHeader('Access-Control-Allow-Origin','*');next();});
app.get('/api/health',(_req,res)=>res.json({ok:true,players:game.players.size,capacity:2,instance,version:'0.1.0'}));
app.get('/api/voice',(_req,res)=>res.json({iceServers:process.env.TURN_URL?[{urls:'stun:stun.l.google.com:19302'},{urls:process.env.TURN_URL,username:process.env.TURN_USERNAME,credential:process.env.TURN_CREDENTIAL}]:[{urls:'stun:stun.l.google.com:19302'}],relay:!!process.env.TURN_URL}));
if(process.env.NODE_ENV==='production'){
  app.use(express.static(path.join(root,'dist'),{maxAge:'1h'}));app.get('/{*splat}',(_req,res)=>res.sendFile(path.join(root,'dist/index.html')));
}else{
  const {createServer:createVite}=await import('vite');const vite=await createVite({root,server:{middlewareMode:true,hmr:false,allowedHosts:true},appType:'spa'});app.use(vite.middlewares);
}
const wss=new WebSocketServer({server,path:'/online',maxPayload:8192});const clients=new Map();
const send=(ws,data)=>{if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<256000)ws.send(JSON.stringify(data));};
wss.on('connection',ws=>{
  let id=null,count=0,last=Date.now();ws.alive=true;ws.on('pong',()=>{ws.alive=true;});
  const authTimer=setTimeout(()=>{if(!id)ws.close(1008,'Join timeout');},10000);
  ws.on('message',raw=>{
    if(Date.now()-last>1000){last=Date.now();count=0;}if(++count>100){ws.close(1008,'Rate limit');return;}
    let msg;try{msg=JSON.parse(raw.toString());}catch{return;}if(!msg||typeof msg!=='object')return;
    if(msg.type==='join'&&!id){
      if(typeof msg.token!=='string'||!/^[a-zA-Z0-9-]{24,80}$/.test(msg.token)){send(ws,{type:'error',text:'Некорректный профиль.'});ws.close(1008);return;}
      if(process.env.ROOM_CODE&&msg.code!==process.env.ROOM_CODE){send(ws,{type:'error',text:'Неверный код комнаты.'});ws.close(1008);return;}
      try{const p=game.add(msg.token,msg.role);id=p.id;clients.set(id,ws);clearTimeout(authTimer);send(ws,{type:'welcome',slot:p.slot,instance});send(ws,game.snapshot(id));for(const [other,client] of clients)if(other!==id)send(client,{type:'peerJoined'});}catch(e){send(ws,{type:'error',text:e.message});ws.close(1008);}return;
    }
    if(!id)return;
    if(msg.type==='signal'){for(const [other,client] of clients)if(other!==id)send(client,{type:'signal',data:msg.data});return;}
    try{game.action(game.players.get(id),msg);}catch(e){console.error('Action failed:',e.message);}
  });
  ws.on('close',()=>{clearTimeout(authTimer);if(id&&clients.get(id)===ws){clients.delete(id);game.remove(id);queueSave();for(const client of clients.values())send(client,{type:'peerLeft'});}});
  ws.on('error',()=>{});
});
let saving=Promise.resolve();
function queueSave(){const serialized=JSON.stringify(game.save());saving=saving.then(async()=>{await writeFile(path.join(dataDir,'save.tmp'),serialized);await rename(path.join(dataDir,'save.tmp'),path.join(dataDir,'save.json'));}).catch(e=>console.error('SAVE ERROR',e));return saving;}
const tick=setInterval(()=>{game.step(.05);for(const [id,ws] of clients)send(ws,game.snapshot(id));for(const event of game.events.splice(0))if(clients.has(event.to))send(clients.get(event.to),{type:'notice',text:event.text});},50);
const saveTimer=setInterval(queueSave,10000);
const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},15000);
const port=Number(process.env.PORT)||3000;server.listen(port,'0.0.0.0',()=>console.log(`Deni Islam server on 0.0.0.0:${port} — one room, two players`));
async function shutdown(){clearInterval(tick);clearInterval(saveTimer);clearInterval(heartbeat);await queueSave();wss.clients.forEach(ws=>ws.close(1001,'Server shutting down'));server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
