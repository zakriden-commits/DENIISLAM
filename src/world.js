import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD, inside } from './shared.js';
const M={};
export function material(color,roughness=.85,metalness=0){const key=color+':'+roughness+':'+metalness;return M[key]||=new THREE.MeshStandardMaterial({color,roughness,metalness});}
const c={concrete:'#a2a594',dark:'#263a34',brick:'#735f51',road:'#414d49',yellow:'#e0c56b',green:'#567766',wood:'#796b51',skin:'#bf9270',black:'#202927',cream:'#ded9c3'};
export function box(parent,w,h,d,x,y,z,color,opts={}){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),typeof color==='string'?material(color):color);mesh.position.set(x,y,z);mesh.castShadow=opts.shadow!==false;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function cyl(parent,r1,r2,h,x,y,z,color,segments=8){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,segments),material(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function textTexture(text,{bg='#23382e',fg='#e8e4ce',w=1024,h=200,font=90}={}){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${font}px Arial`;ctx.fillText(text,w/2,h/2,w*.93);const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;return t;}
function sign(parent,text,x,y,z,w,h,opts={}){const mat=new THREE.MeshStandardMaterial({map:textTexture(text,opts),roughness:.8});return box(parent,w,h,.09,x,y,z,mat);}
function groundTexture(type){const cvs=document.createElement('canvas');cvs.width=cvs.height=256;const ctx=cvs.getContext('2d');ctx.fillStyle=type==='road'?'#434d49':'#a0a394';ctx.fillRect(0,0,256,256);let seed=42;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<9000;i++){const v=rnd()>.5?255:0;ctx.fillStyle=`rgba(${v},${v},${v},${rnd()*.06})`;ctx.fillRect(rnd()*256,rnd()*256,1+rnd()*2,1+rnd()*2);}if(type!=='road'){ctx.strokeStyle='#6e786d55';ctx.lineWidth=2;for(let i=0;i<256;i+=64){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,256);ctx.moveTo(0,i);ctx.lineTo(256,i);ctx.stroke();}}else{ctx.strokeStyle='#28362d77';ctx.lineWidth=1;for(let i=0;i<8;i++){ctx.beginPath();let x=rnd()*256,y=rnd()*256;ctx.moveTo(x,y);for(let j=0;j<5;j++){x+=rnd()*35-15;y+=rnd()*35;ctx.lineTo(x,y);}ctx.stroke();}}const t=new THREE.CanvasTexture(cvs);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(type==='road'?16:24,type==='road'?6:20);t.colorSpace=THREE.SRGBColorSpace;return t;}
export function weaponModel(type='pistol',display=false){const g=new THREE.Group();if(type==='bag'){box(g,.62,.37,.32,0,.03,0,'#62684a');box(g,.56,.05,.3,0,.23,0,'#343e2e');box(g,.04,.21,.05,-.18,.29,0,'#282e24');box(g,.04,.21,.05,.18,.29,0,'#282e24');box(g,.38,.04,.05,0,.4,0,'#282e24');box(g,.18,.16,.02,0,.02,.17,'#a9ab78');}else if(type==='ammo'){for(let i=0;i<6;i++){const a=cyl(g,.022,.022,.17,(i%3)*.06-.06,Math.floor(i/3)*.06,0,'#bf9a4f');a.rotation.x=Math.PI/2;}box(g,.32,.12,.22,0,-.12,0,'#78815c');}else if(type==='medkit'){box(g,.44,.32,.22,0,0,0,'#d8d4b8');box(g,.07,.2,.01,0,0,.12,'#9c5142');box(g,.22,.06,.01,0,0,.125,'#9c5142');}else if(type==='cash'){for(let i=0;i<5;i++){box(g,.32,.06,.2,0,i*.06,0,'#8c9b6b');box(g,.07,.061,.205,0,i*.06,0,'#d3cca8');}}else if(type==='fist'){box(g,.16,.18,.22,0,0,0,c.skin);for(let i=0;i<4;i++)box(g,.035,.05,.09,-.06+i*.04,.08,.06,'#cda17b');}else{const smg=type==='smg';const dark=material('#343f3d',.4,.7),metal=material('#69716a',.3,.8);box(g,smg?.18:.13,.15,smg?.58:.38,0,.11,0,dark);box(g,smg?.17:.12,.09,smg?.63:.4,0,.22,0,metal);const handle=box(g,.105,.28,.14,0,-.08,-.10,'#2a302b');handle.rotation.x=-.22;box(g,.03,.12,.15,.064,-.02,.08,dark);box(g,.11,.025,.16,0,-.09,.08,dark);const barrel=cyl(g,.037,.037,smg?.35:.1,0,.14,smg?.42:.25,'#252d2b');barrel.rotation.x=Math.PI/2;box(g,.04,.035,.05,0,.28,.14,'#171e1a');if(smg){box(g,.09,.32,.16,0,-.13,.1,'#444c44');box(g,.12,.12,.3,0,.08,-.43,'#4b5149');box(g,.2,.05,.04,0,.24,-.17,'#252e28');}}if(display)g.rotation.y=-.7;return g;}
export function character(type='deni'){
  const g=new THREE.Group(),skin=type==='elder'?'#bda88b':type==='islam'?'#c49471':'#c19b7b';const suit=['deni','guard','police'].includes(type),elder=type==='elder';const coat=type==='deni'?'#263c37':type==='islam'?'#596954':type==='police'?'#334b58':type==='guard'?'#3c4543':type==='seller'?'#654f3c':type==='cashier'?'#a39a7a':elder?'#817d63':type==='rough'?'#765f4d':'#77887a';
  const body=new THREE.Group();body.position.y=1;g.add(body);box(body,.52,.66,.3,0,.19,0,coat);box(body,.43,.15,.27,0,-.16,0,'#323c33');
  if(suit){box(body,.16,.5,.02,0,.23,.165,'#d5d4bc');const tie=box(body,.055,.32,.025,0,.23,.18,type==='deni'?'#7c6250':'#273632');tie.rotation.z=.05;const l=box(body,.13,.38,.03,-.15,.30,.18,coat);l.rotation.z=.26;const r=box(body,.13,.38,.03,.15,.30,.18,coat);r.rotation.z=-.26;}
  const head=new THREE.Group();head.position.y=.76;body.add(head);box(head,.32,.38,.31,0,0,0,skin);box(head,.06,.08,.06,0,-.015,.18,skin);box(head,.07,.055,.016,-.085,.06,.163,'#26332a');box(head,.07,.055,.016,.085,.06,.163,'#26332a');box(head,.13,.018,.015,0,-.115,.16,'#6b5442');
  if(type==='deni'){cyl(head,.28,.28,.055,0,.22,0,'#1b2a24',10);cyl(head,.19,.2,.24,0,.36,0,'#23352b',8);cyl(head,.194,.205,.045,0,.265,0,'#69745a',8);box(head,.35,.07,.04,0,.07,.18,'#313e32');box(head,.05,.04,.05,0,.07,.2,'#ae9f73');}
  else if(type==='islam'||type==='rough'){box(head,.37,.12,.35,0,.22,0,'#606d54');box(head,.34,.035,.22,0,.17,.21,'#394735');if(type==='islam'){for(const side of [-1,1])box(body,.035,.55,.32,side*.235,.2,0,'#c4c8b0');cyl(body,.13,.13,.012,0,.25,.18,'#c3ac66',10).rotation.x=Math.PI/2;}}
  else if(type==='police'||type==='guard'){box(head,.37,.12,.33,0,.22,0,type==='police'?'#2f4550':'#343f37');box(head,.35,.035,.18,0,.17,.18,'#26352c');box(body,.07,.10,.02,-.14,.36,.18,'#c5b36d');}
  else{box(head,.34,.12,.32,0,.19,-.015,elder?'#c8c4ae':'#414339');if(elder){box(head,.35,.05,.025,0,.055,.177,'#696a5b');box(head,.19,.12,.015,0,-.12,.166,'#beb69b');}}
  const arms=[],legs=[];for(const s of [-1,1]){const arm=new THREE.Group();arm.position.set(s*.36,.45,0);body.add(arm);box(arm,.18,.51,.22,0,-.2,0,coat);box(arm,.16,.18,.17,0,-.52,0,skin);if(type==='islam'){for(let i=0;i<2;i++)box(arm,.185,.034,.23,0,-.1-i*.07,0,'#c9ccb7');}arms.push(arm);const leg=new THREE.Group();leg.position.set(s*.15,.79,0);g.add(leg);box(leg,.21,.65,.23,0,-.32,0,type==='islam'?'#4c5947':'#303b34');box(leg,.24,.15,.38,0,-.7,.07,type==='islam'?'#d4d1b9':'#252c25');legs.push(leg);}
  const held=new THREE.Group();held.position.set(0,-.48,.1);arms[1].add(held);
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(.43,16),new THREE.MeshBasicMaterial({color:'#15231b',transparent:true,opacity:.23,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.012;g.add(shadow);
  g.userData={body,head,arms,legs,held,item:null,type};return g;
}
export function animateCharacter(g,state,t,dt){
  const u=g.userData,moving=!!state.moving;const walk=Math.sin(t*(state.carrying?6:9)+g.id)*.6;
  u.legs.forEach((l,i)=>{l.rotation.x=THREE.MathUtils.lerp(l.rotation.x,moving?walk*(i?1:-1):0,.22);});
  u.arms.forEach((a,i)=>{a.rotation.x=THREE.MathUtils.lerp(a.rotation.x,state.looting?-.9+Math.sin(t*5+i)*.25:state.carrying?-.95:(state.selected==='pistol'||state.selected==='smg')?(i?-.95:-.3):moving?-walk*(i?1:-1)*.7:0,.2);});
  u.body.position.y=1+(moving?Math.abs(Math.sin(t*9))*.025:Math.sin(t*1.8)*.012);
  const item=state.carrying?'crate':state.selected;
  if(u.item!==item){u.held.clear();if(item==='crate')box(u.held,.65,.55,.5,-.3,0,.3,'#a08b5c');else if(item&&item!=='fist')u.held.add(weaponModel(item));u.item=item;}
  if(state.sleep>0){g.rotation.z=-Math.PI/2*Math.min(1,state.sleep);g.position.y=.7*Math.min(1,state.sleep);}else{g.rotation.z=0;g.position.y=0;}
}
export class City {
  constructor(scene){this.scene=scene;this.roofs=[];this.obstacles=[];this.lamps=[];this.make();this.batchStatic();}
  batchStatic(){
    // Batch the stationary city by material: dozens of draw calls, not thousands,
    // while retaining invisible wall meshes for precise camera collision rays.
    this.scene.updateMatrixWorld(true);
    const groups=new Map(),dynamic=new Set([...this.roofs.map(r=>r.mesh),this.doorPivot]);
    this.scene.traverse(mesh=>{
      if(!mesh.isMesh||Array.isArray(mesh.material))return;
      let parent=mesh;while(parent){if(dynamic.has(parent))return;parent=parent.parent;}
      const list=groups.get(mesh.material)||[];list.push(mesh);groups.set(mesh.material,list);
    });
    const obstacles=new Set(this.obstacles);
    for(const [mat,meshes] of groups){
      if(meshes.length<2)continue;
      const geometries=meshes.map(m=>{const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();return g.applyMatrix4(m.matrixWorld);});
      const geo=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());if(!geo)continue;
      const batch=new THREE.Mesh(geo,mat);batch.castShadow=meshes.some(m=>m.castShadow);batch.receiveShadow=true;
      for(const m of meshes){if(obstacles.has(m))m.visible=false;else m.removeFromParent();}
      this.scene.add(batch);
    }
  }
  wall(parent,w,h,d,x,y,z,color){const o=box(parent,w,h,d,x,y,z,color);this.obstacles.push(o);return o;}
  building(b,type){const g=new THREE.Group();this.scene.add(g);const h=type==='bank'?6.7:4.6,wall=type==='home'?'#858b77':type==='bank'?'#c2c1a7':'#727b66';
    box(g,b.w,.1,b.d,b.x,.015,b.z,type==='home'?'#726d55':'#a3a28a');
    this.wall(g,.35,h,b.d,b.x-b.w/2,h/2,b.z,wall);this.wall(g,.35,h,b.d,b.x+b.w/2,h/2,b.z,wall);
    const front=type==='bank'?b.z+b.d/2:b.z-b.d/2,back=type==='bank'?b.z-b.d/2:b.z+b.d/2;
    this.wall(g,b.w,h,.35,b.x,h/2,back,wall);
    this.wall(g,(b.w-3.2)/2,h,.35,b.x-(b.w+3.2)/4,h/2,front,wall);this.wall(g,(b.w-3.2)/2,h,.35,b.x+(b.w+3.2)/4,h/2,front,wall);this.wall(g,3.2,h-3.2,.35,b.x,3.2+(h-3.2)/2,front,wall);
    for(const side of [-1,1]){box(g,b.w+.5,.3,.35,b.x,h+.15,b.z+side*b.d/2,'#4c5b4b');box(g,.35,.3,b.d,b.x+side*b.w/2,h+.15,b.z,'#4c5b4b');}const roof=new THREE.Group();box(roof,b.w+.7,.15,b.d+.7,b.x,h+.4,b.z,'#526052');box(roof,3,1.1,2,b.x+b.w/4,h+1,b.z,'#637261');this.scene.add(roof);this.roofs.push({mesh:roof,b});
    // Top ring remains, while roof and lintels fade out indoors.
    const frontSignZ=front+(type==='bank'?.25:-.25);let sg=sign(g,type==='bank'?'НАРОДНЫЙ БАНК':type==='home'?'ДОМ  ·  07':'АРСЕНАЛ',b.x,type==='bank'?5.15:3.9,frontSignZ,type==='bank'?14:8,.85,{bg:type==='bank'?'#33493b':'#2d3b31',fg:'#dce5b9',font:90});if(type!=='bank')sg.rotation.y=Math.PI;
    for(const s of [-1,1]){const wx=b.x+s*(b.w/2-3.4);box(g,3,1.9,.08,wx,2.5,front+(type==='bank'?.2:-.2),'#3b514a');for(let i=0;i<4;i++)box(g,.065,1.95,.12,wx-1.4+i*.95,2.5,front+(type==='bank'?.27:-.27),'#adb09a');box(g,3.1,.1,.35,wx,1.5,front+(type==='bank'?.27:-.27),'#c3bea3');}
    if(type==='bank'){
      for(let x of [-9,9]){cyl(g,.48,.57,5.4,x,2.7,front+.8,'#b4b69e',10);box(g,1.4,.3,1.4,x,.15,front+.8,'#929b83');box(g,1.4,.3,1.4,x,5.4,front+.8,'#c9c6aa');}
      for(const side of [-1,1])box(g,8,.9,1.2,side*5.5,.45,-25,'#6b795f');for(const x of [-7.5,-4.5,4.5,7.5]){box(g,2.5,.04,1, x, .94,-25,'#c0b695');box(g,2.6,1.1,.05,x,1.55,-25,new THREE.MeshStandardMaterial({color:'#99b6ab',transparent:true,opacity:.3,roughness:.15}));}
      sign(g,'КАССА  /  CASH',7,2.5,-30.6,5,.5,{font:75});
      for(let i=0;i<18;i++){const cash=weaponModel('cash');cash.position.set(-2+(i%6)*.8,.12+Math.floor(i/6)*.28,-29);g.add(cash);}
      box(g,7,.9,2.5,0,.45,-29,'#697b5a');for(let i=0;i<18;i++){const cash=weaponModel('cash');cash.position.set(-2+(i%6)*.8,.96+Math.floor(i/6)*.26,-29);g.add(cash);}
      const vault=cyl(g,2.3,2.3,.23,-6,2.4,-32.7,'#596858',16);vault.rotation.x=Math.PI/2;cyl(g,.65,.65,.12,-6,2.4,-32.5,'#9a9e84',8).rotation.x=Math.PI/2;box(g,1.6,.12,.18,-6,2.4,-32.3,'#b3b297');
      for(let x of [-8,8])for(let z of [-18,-21]){box(g,1.1,.1,1.1,x,.55,z,'#4b5c46');for(let s of [-.4,.4])box(g,.07,.55,.07,x+s,.27,z,'#354330');box(g,1.1,.8,.1,x,1,z-.5,'#65765d');}
      sign(g,'ТИШИНА — ЗОЛОТО',0,4.2,-32.75,8,.6,{font:65,bg:'#a2a88c',fg:'#3e5440'});
    }else if(type==='home'){
      for(let [i,spawn] of WORLD.spawns.entries()){box(g,2.2,.45,3.9,spawn.x,.3,spawn.z,c.wood);box(g,2.1,.25,3.8,spawn.x,.65,spawn.z,'#acaa8c');box(g,2.1,.15,2.4,spawn.x,.85,spawn.z+.6,i?'#6a775e':'#596c66');box(g,1.4,.22,.65,spawn.x,.88,spawn.z-1.3,'#d0cbb0');box(g,2.2,1.2,.15,spawn.x,.8,spawn.z-2,'#6c6149');box(g,.9,.65,.85,spawn.x+1.9,.35,spawn.z-1,'#5d654e');}
      for(let [i,p] of WORLD.lockers.entries()){box(g,1.9,2.8,1.1,p.x,1.4,p.z,'#59634e');for(let x of [-.48,.48]){box(g,.87,2.6,.08,p.x+x,1.4,p.z-.6,'#707960');box(g,.05,.3,.08,p.x+x+(x<0?.25:-.25),1.4,p.z-.67,'#beb18b');}sign(g,i?'ISLAM':'DENI',p.x,2.3,p.z-.68,1.4,.24,{font:75,bg:'#414d3d'}).rotation.y=Math.PI;}
      box(g,2,.9,1.5,-22,.45,21,'#685e46');box(g,.6,.1,.6,-22,.95,21,'#bfb898');box(g,.7,.5,.2,-22,1.2,23.1,'#292e26');sign(g,'ДОМА ЛУЧШЕ',-22,3.1,23.8,3.5,.5,{bg:'#8c9078',fg:'#3f513a',font:70});
      this.doorPivot=new THREE.Group();this.doorPivot.position.set(b.doorX-1.5,0,b.doorZ);g.add(this.doorPivot);box(this.doorPivot,3,3.15,.18,1.5,1.57,0,'#47573d');box(this.doorPivot,.1,.1,.12,2.7,1.5,-.15,'#d4c489');sign(this.doorPivot,'07',1.5,2.2,-.12,.5,.3,{font:90,bg:'#47573d'}).rotation.y=Math.PI;
    }else{
      box(g,11,1.2,1.1,24,.6,18.5,'#6b6950');box(g,11,.12,1.4,24,1.25,18.5,'#a8a080');box(g,12,2.5,.16,24,2.4,22.7,'#3c4939');for(let i=0;i<5;i++){const gun=weaponModel(i%2?'pistol':'smg');gun.position.set(19+i*2.4,2.7,22.4);gun.rotation.z=Math.PI/2;g.add(gun);}for(let i=0;i<6;i++)box(g,.8,.35,.6,20+i*1.6,.3,21.5,'#8b8b5c');sign(g,'БЕЗ ЛИШНИХ ВОПРОСОВ',24,3.8,22.7,10,.55,{font:65,bg:'#3c4939'});
    }
    return g;
  }
  make(){const s=this.scene;
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(180,150),new THREE.MeshStandardMaterial({map:groundTexture('pavement'),roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.06;ground.receiveShadow=true;s.add(ground);
    box(s,123,.08,12,0,-.02,-2,new THREE.MeshStandardMaterial({map:groundTexture('road'),roughness:1}),{shadow:false});box(s,12,.07,100,12,-.01,-1,new THREE.MeshStandardMaterial({map:groundTexture('road'),roughness:1}),{shadow:false});
    for(let x=-55;x<57;x+=7){box(s,3,.015,.12,x,.033,-2,'#bebc93',{shadow:false});for(const z of [-8.1,4.1])box(s,6.7,.17,.25,x,.06,z,'#919a83');}
    for(let z=-45;z<45;z+=7)box(s,.12,.012,3,12,.04,z,'#b9b993',{shadow:false});
    for(let i=0;i<8;i++){box(s,.55,.015,9,-3+i*1.1,.035,-2,'#b9baa0',{shadow:false});box(s,9,.015,.55,12,.05,5.5+i*1.1,'#b9baa0',{shadow:false});}
    this.building(WORLD.home,'home');this.building(WORLD.bank,'bank');this.building(WORLD.shop,'shop');
    for(const [i,b] of [{x:-44,z:27,w:12,d:18},{x:44,z:-25,w:15,d:20},{x:-27,z:-35,w:15,d:14},{x:23,z:-35,w:13,d:13},{x:5,z:34,w:18,d:12}].entries()){
      const h=9+i%3*4;this.wall(s,b.w,h,b.d,b.x,h/2,b.z,['#7b826d','#847e66','#717b6c'][i%3]);box(s,b.w+.5,.4,b.d+.5,b.x,h,b.z,'#4c5c4b');for(let y=2.5;y<h-1;y+=3)for(let x=b.x-b.w/2+2;x<b.x+b.w/2-1;x+=3){box(s,1.3,1.7,.06,x,y,b.z+b.d/2+.05,'#435950');box(s,1.5,.1,.3,x,y-.85,b.z+b.d/2+.1,'#a9aa8d');box(s,.06,1.7,.1,x,y,b.z+b.d/2+.1,'#a1a68b');}
      for(let z=b.z-b.d/2+2;z<b.z+b.d/2-1;z+=3)for(let y=2.5;y<h-1;y+=3)box(s,.07,1.7,1.3,b.x-b.w/2-.06,y,z,'#42574d');box(s,2,.8,1.4,b.x,h+.6,b.z,'#6d7863');
    }
    // Distant skyline gives the playable quarter a real neighbourhood silhouette.
    for(let i=0;i<28;i++){const angle=i/28*Math.PI*2,x=Math.sin(angle)*83,z=Math.cos(angle)*67,h=8+(i*7%19);box(s,9+i%4*2,h,9+i%3*3,x,h/2,z,['#798875','#86907a','#667e6c'][i%3]);}
    for(const [x,z] of [[-39,6],[-36,-17],[-8,9],[19,-11],[37,8],[39,28],[-12,32],[-48,-4],[-45,42],[26,34],[-16,-42],[42,-40]])this.tree(x,z);
    for(let x of [-45,-12,18,42])for(let z of [-9,6])this.lamp(x,z);
    this.car(-39,-9,'#bbb69a',true);this.car(30,1,'#697e6b');this.car(-15,1,'#875f49');this.car(17,-5,'#c2c4b0',false,true);
    const depot=new THREE.Group();s.add(depot);for(let i=0;i<9;i++){const x=-30+i%3*1.2,z=-10-Math.floor(i/3)*1.1;box(depot,1,.9,1,x,.45,z,'#9b8b60');for(let j of [-.35,.35])box(depot,.07,.95,1.03,x+j,.45,z,'#6c6243');}
    sign(s,'ПОДРАБОТКА  →',-29,2,-11.5,5,.6,{bg:'#5b6947',fg:'#e0dda6',font:70});
    for(let [x,z] of [[-8,6],[-34,7],[35,-10]]){box(s,2.5,.13,.7,x,.65,z,'#7d7957');box(s,2.5,.7,.12,x,1.03,z+.3,'#777452');for(let a of [-.9,.9])box(s,.12,.65,.5,x+a,.32,z,'#354c3b');}
    // Power cables, posters, drain covers, bollards, planters and litter.
    for(let x=-48;x<49;x+=24){cyl(s,.1,.15,9,x,4.5,7.5,'#655d45');const pts=[];for(let j=0;j<=16;j++)pts.push(new THREE.Vector3(x+j*1.5,8.5-Math.sin(j/16*Math.PI)*.8,7.5));s.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:'#334435'})));}
    for(let i=0;i<20;i++){const x=-50+i*5.1,z=i%2?5.5:-9.5;cyl(s,.12,.16,.75,x,.38,z,'#596b50');if(i%4===0){box(s,1.3,.6,1.3,x,.3,z+1.7,'#7d876e');cyl(s,.7,.6,.7,x,.85,z+1.7,'#586c49',7);}}
    for(let i=0;i<20;i++)box(s,.15+(i%3)*.12,.012,.25,-40+(i*13%85),.06,-7+(i*11%13),'#b2b095',{shadow:false});
    for(let x of [-20,5,35]){const drain=box(s,.8,.03,.6,x,.04,-6.8,'#2d3e31');for(let i=0;i<5;i++)box(s,.045,.01,.5,x-.3+i*.15,.06,-6.8,'#6a7760');}
  }
  tree(x,z){const s=this.scene;cyl(s,.18,.3,3,x,1.5,z,'#665e43');const leaf=new THREE.Mesh(new THREE.IcosahedronGeometry(2.2,1),material('#60774e'));leaf.position.set(x,4,z);leaf.scale.set(1,1.2,1);leaf.castShadow=true;s.add(leaf);const second=leaf.clone();second.position.set(x+1,4.6,z-.4);second.scale.set(.65,.9,.65);s.add(second);box(s,2,.35,2,x,.1,z,'#8c967c');}
  lamp(x,z){const s=this.scene;cyl(s,.055,.1,5,x,2.5,z,'#3b5140');box(s,1.5,.08,.09,x+.7,5,z,'#405440');box(s,.8,.12,.45,x+1.1,4.94,z,'#3d513d');box(s,.65,.025,.32,x+1.1,4.87,z,new THREE.MeshStandardMaterial({color:'#e1d994',emissive:'#d6bc68',emissiveIntensity:.6}));}
  car(x,z,color,truck=false,police=false){const g=new THREE.Group();g.position.set(x,0,z);this.scene.add(g);box(g,2.05,.55,truck?5.8:4.3,0,.65,0,color);box(g,1.85,.7,truck?1.7:2.2,0,1.25,truck?1:0,color);box(g,1.7,.55,.035,0,1.3,truck?1.88:1.15,'#3c5750');box(g,1.7,.5,.035,0,1.3,truck?.12:-1.15,'#3c5750');for(let side of [-1,1]){box(g,.02,.5,1.6,side*.94,1.3,truck?1:0,'#3b554b');for(let zi of [-1.45,1.45]){const wheel=cyl(g,.4,.4,.25,side*1.03,.43,zi,'#25342a',10);wheel.rotation.z=Math.PI/2;cyl(g,.2,.2,.26,side*1.04,.43,zi,'#90967b',8).rotation.z=Math.PI/2;}}for(let side of [-1,1]){box(g,.43,.19,.06,side*.65,.78,truck?2.94:2.19,'#d7d2a0');box(g,.3,.15,.06,side*.7,.73,truck?-2.94:-2.19,'#a46044');}box(g,1.5,.14,.12,0,.45,truck?2.96:2.2,'#7b8872');if(truck){box(g,2.0,1.75,3.1,0,1.25,-1.15,'#8b9379');box(g,1.85,1.65,.05,0,1.25,-2.74,'#656f58');for(let i=0;i<7;i++)box(g,1.84,.025,.07,0,.5+i*.22,-2.79,'#a1a48a');}if(police){box(g,2.08,.22,3.6,0,.8,0,'#405d66');box(g,1,.12,.3,0,1.69,0,'#2d443d');box(g,.4,.2,.32,-.28,1.82,0,'#546f8e');box(g,.4,.2,.32,.28,1.82,0,'#a36755');}return g;}
  update(p,door,dt){for(const r of this.roofs){r.mesh.visible=!p||!inside(p,r.b,-7);}if(this.doorPivot)this.doorPivot.rotation.y=THREE.MathUtils.lerp(this.doorPivot.rotation.y,door?-Math.PI/2:0,Math.min(1,dt*8));}
}
