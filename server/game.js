import { WORLD, ITEMS, dist, inside, blocked } from '../src/shared.js';
import { randomUUID } from 'node:crypto';
export class Game {
  constructor(saved = {}) {
    this.players = new Map(); this.profiles = saved.profiles || {}; this.door = true; this.time = 0; this.tickId = 0;
    this.bankCash = saved.bankCash ?? 180000; this.restockAt = 0; this.npcs = []; this.events=[];
    for(let i=0;i<16;i++) this.npcs.push({id:'civil'+i,type:i%4===0?'elder':i%4===1?'rough':'civil',x:-44+i*5.6,z:i%2?2:-7,hp:100,yaw:0,target:null,dead:0});
    this.npcs.push({id:'guard0',type:'guard',x:-6,z:-20,hp:140,yaw:0,dead:0},{id:'guard1',type:'guard',x:6,z:-27,hp:140,yaw:0,dead:0});
    this.npcs.push({id:'seller',type:'seller',x:24,z:20,hp:100,yaw:Math.PI,dead:0},{id:'cashier',type:'cashier',x:7,z:-28,hp:100,yaw:0,dead:0});
  }
  add(token,role) {
    if(this.players.has(token)) throw Error('Этот профиль уже в игре в другом окне.');
    if(this.players.size>=2) throw Error('Сервер заполнен: два игрока уже в городе.');
    const saved=this.profiles[token]; const slot=saved?.slot ?? (role==='islam'?1:0);
    if([...this.players.values()].some(p=>p.slot===slot)) throw Error('Этот персонаж уже в игре. Выберите второго.');
    const spawn=WORLD.spawns[slot];
    const p={id:token,slot,name:slot?'Islam':'Deni',x:spawn.x,z:spawn.z,yaw:Math.PI,hp:100,stamina:100,balance:200,inventory:[],locker:[],selected:'fist',ammo:0,mag:{pistol:0,smg:0},bagCash:0,bundles:0,wanted:0,lastSeen:0,lastShot:-100,job:null,loot:null,sleep:3,input:{x:0,z:0,run:false,aim:Math.PI},...saved};
    // Always rejoin at your own bed; offline players cannot remain in combat.
    Object.assign(p,{id:token,slot,name:slot?'Islam':'Deni',x:spawn.x,z:spawn.z,hp:Math.max(50,p.hp),wanted:0,loot:null,job:null,input:{x:0,z:0,run:false,aim:Math.PI},sleep:3});
    this.players.set(token,p); return p;
  }
  remove(id) { const p=this.players.get(id);if(p){this.profiles[id]=this.savePlayer(p);this.players.delete(id);} }
  savePlayer(p) { return Object.fromEntries(['slot','hp','stamina','balance','inventory','locker','selected','ammo','mag','bagCash','bundles','handCash'].map(k=>[k,structuredClone(p[k])])); }
  save() { for(const p of this.players.values())this.profiles[p.id]=this.savePlayer(p);return {profiles:this.profiles,bankCash:this.bankCash}; }
  tell(p,text) { this.events.push({to:p.id,text}); }
  crime(p,amount=1) { p.wanted=Math.min(5,Math.max(1,p.wanted+amount));p.lastSeen=this.time; }
  canSee(n,p,range=13) {
    if(n.dead||dist(n,p)>range)return false;
    const dx=p.x-n.x,dz=p.z-n.z,d=Math.hypot(dx,dz)||1;
    if((Math.sin(n.yaw)*dx+Math.cos(n.yaw)*dz)/d < .25)return false;
    // Building walls occlude sight, including a closed home door.
    const steps=Math.ceil(d*3);for(let i=1;i<steps;i++)if(blocked(n.x+dx*i/steps,n.z+dz*i/steps,this.door))return false;
    return true;
  }
  action(p,msg) {
    if(!p || p.sleep>0)return;
    const near=(pos,r=3.4)=>dist(p,pos)<r;
    if(msg.type==='input') {p.input={x:Math.max(-1,Math.min(1,Number(msg.x)||0)),z:Math.max(-1,Math.min(1,Number(msg.z)||0)),run:!!msg.run,aim:Number.isFinite(msg.aim)?msg.aim:0};return;}
    if(msg.type==='select') {
      if(msg.item==='fist'||p.inventory.includes(msg.item)||msg.item==='cash'&&p.bundles>0){p.selected=msg.item;p.loot=null;}return;
    }
    if(msg.type==='door'&&near({x:WORLD.home.doorX,z:WORLD.home.doorZ})) {this.door=!this.door;this.tell(p,this.door?'Дверь открыта.':'Дверь закрыта. Если вас не видели — розыск скоро спадёт.');}
    if(msg.type==='buy') {
      if(!inside(p,WORLD.shop))return this.tell(p,'Покупки доступны у продавца в «Арсенале».');
      const item=ITEMS[msg.item];if(!item)return;
      if(p.balance<item.price)return this.tell(p,'Не хватает денег. На складе есть подработка.');
      if(!['ammo','medkit'].includes(msg.item)&&p.inventory.includes(msg.item))return this.tell(p,'У вас уже есть этот предмет.');
      if(msg.item!=='ammo'&&p.inventory.length>=10)return this.tell(p,'Инвентарь полон.');
      p.balance-=item.price;if(msg.item==='ammo')p.ammo+=24;else p.inventory.push(msg.item);
      this.tell(p,'Куплено: '+item.name);return;
    }
    if(msg.type==='reload') {
      const gun=ITEMS[p.selected];if(!gun?.mag)return this.tell(p,'Сначала возьмите оружие.');
      if(p.reload)return;if(p.mag[p.selected]>=gun.mag)return;
      if(p.ammo<=0)return this.tell(p,'Нет патронов. Купите патроны в магазине.');
      p.reload={item:p.selected,remaining:1.6};this.tell(p,'Перезарядка…');return;
    }
    if(msg.type==='shoot') {
      if(p.reload)return;
      const gun=ITEMS[p.selected];const armed=!!gun?.mag;
      if(!armed&&p.selected!=='fist')return;
      if(this.time-p.lastShot<(armed?gun.cooldown:.6))return;
      if(armed&&!p.mag[p.selected])return this.tell(p,p.ammo?'Магазин пуст. Нажмите R / ↻.':'Купите патроны в магазине.');
      p.lastShot=this.time;p.shotUntil=this.time+.13;if(armed){p.mag[p.selected]--;this.crime(p,0);}
      const aim=p.input.aim; p.yaw=aim;
      // Only NPCs are eligible hits. Friendly fire is impossible on the server.
      const targets=this.npcs.filter(n=>!n.dead&&this.canSee({...p,yaw:aim},n,armed?gun.range:2.1)).map(n=>({n,d:dist(p,n),a:(Math.sin(aim)*(n.x-p.x)+Math.cos(aim)*(n.z-p.z))/(dist(p,n)||1)})).filter(v=>v.a>(armed?.975:.65)).sort((a,b)=>a.d-b.d);
      const target=targets[0]?.n;
      if(target){target.hp-=armed?gun.damage:18;target.hurt=this.time+.2;this.crime(p,0);if(target.hp<=0){target.dead=25;this.crime(p,1);}}
      return;
    }
    if(msg.type==='job') {
      if(p.job)return;
      if(!near(WORLD.job,5))return this.tell(p,'Подойдите к грузчику у склада.');
      p.job={stage:'pickup',reward:140+Math.floor(Math.random()*380),count:0};this.tell(p,'Подработка: возьмите ящик у склада, отнесите к фургону. Нужно 3 ящика.');return;
    }
    if(msg.type==='interactJob'&&p.job) {
      if(p.job.stage==='pickup'&&near(WORLD.job,4)){p.job.stage='carry';this.tell(p,'Ящик в руках. Несите его к фургону.');}
      else if(p.job.stage==='carry'&&near(WORLD.truck,4)){p.job.count++;if(p.job.count>=3){p.balance+=p.job.reward;this.tell(p,`Работа выполнена! +${p.job.reward} ₽`);p.job=null;p.nextOffer=this.time+60;}else{p.job.stage='pickup';this.tell(p,`Доставлено ${p.job.count}/3. Возьмите ещё ящик.`);}}return;
    }
    if(msg.type==='lootStart') {
      if(!near(WORLD.loot,3))return this.tell(p,'Подойдите к пачкам денег в глубине банка.');
      const bag=p.selected==='bag'&&p.inventory.includes('bag');
      if(!bag&&p.selected!=='fist')return this.tell(p,'Уберите оружие или выберите сумку.');
      if(!bag&&p.bundles>=5)return this.tell(p,'В руках уже пять пачек. Перечислите их на баланс.');
      if(bag&&p.bagCash>=50000)return this.tell(p,'Сумка полна.');
      if(this.bankCash<=0)return this.tell(p,'Хранилище пусто. Деньги привезут позже.');
      p.loot={elapsed:0,duration:bag?30:15,bag};return;
    }
    if(msg.type==='lootStop'){p.loot=null;return;}
    if(msg.type==='deposit') {
      if(p.selected==='cash'&&p.bundles){const value=p.handCash||0;p.balance+=value;p.bundles=0;p.handCash=0;p.selected='fist';this.tell(p,`Перечислено ${value} ₽.`);}
      else if(p.selected==='bag'){const amount=Math.max(0,Math.min(p.bagCash,Math.floor(Number(msg.amount)||p.bagCash)));p.bagCash-=amount;p.balance+=amount;this.tell(p,`Из сумки перечислено ${amount} ₽.`);}return;
    }
    if(msg.type==='heal'&&p.inventory.includes('medkit')) {p.hp=Math.min(100,p.hp+60);p.inventory.splice(p.inventory.indexOf('medkit'),1);if(p.selected==='medkit')p.selected='fist';return;}
    if(msg.type==='locker') {
      if(!near(WORLD.lockers[p.slot],3))return this.tell(p,'Это не ваш шкаф или вы слишком далеко.');
      const i=Number(msg.index);if(!Number.isInteger(i)||i<0)return;
      if(msg.direction==='store') {
        if(p.locker.length>=15)return this.tell(p,'В шкафу уже 15 вещей.');
        const item=p.inventory[i];if(!item)return;
        p.locker.push({id:randomUUID(),item,loaded:p.mag[item]||0,cash:item==='bag'?p.bagCash:0});p.inventory.splice(i,1);if(item==='bag')p.bagCash=0;if(p.mag[item]!==undefined)p.mag[item]=0;if(p.selected===item)p.selected='fist';
      } else if(msg.direction==='take'&&p.inventory.length<10) {
        const entry=p.locker[i];if(!entry)return;if(entry.item!=='medkit'&&p.inventory.includes(entry.item))return this.tell(p,'Такой предмет уже в инвентаре.');
        p.inventory.push(entry.item);if(entry.item==='bag')p.bagCash=entry.cash;if(p.mag[entry.item]!==undefined)p.mag[entry.item]=entry.loaded;p.locker.splice(i,1);
      }return;
    }
  }
  step(dt) {
    this.time+=dt;this.tickId++;
    if(this.bankCash<180000&&this.time>this.restockAt){this.bankCash=Math.min(180000,this.bankCash+5000);this.restockAt=this.time+120;}
    for(const p of this.players.values()) {
      p.sleep=Math.max(0,p.sleep-dt);
      if(p.sleep>0)continue;
      const input=p.input,len=Math.hypot(input.x,input.z),running=input.run&&p.stamina>1&&p.job?.stage!=='carry';
      const speed=p.job?.stage==='carry'?2.5:running?7:4;
      if(len>.05){const dx=input.x/Math.max(1,len)*speed*dt,dz=input.z/Math.max(1,len)*speed*dt;if(!blocked(p.x+dx,p.z,this.door))p.x+=dx;if(!blocked(p.x,p.z+dz,this.door))p.z+=dz;p.yaw=Math.atan2(input.x,input.z);}
      p.moving=len>.05;p.stamina=Math.max(0,Math.min(100,p.stamina+(running&&len>.05?-18:13)*dt));
      if(p.reload){p.reload.remaining-=dt;if(p.reload.remaining<=0){const item=p.reload.item,take=Math.min(ITEMS[item].mag-p.mag[item],p.ammo);p.mag[item]+=take;p.ammo-=take;p.reload=null;}}
      if(p.loot) {
        if(dist(p,WORLD.loot)>3||len>.1||p.selected!==(p.loot.bag?'bag':'fist'))p.loot=null;
        else {p.loot.elapsed+=dt;if(p.loot.elapsed>=p.loot.duration){const amount=Math.min(this.bankCash,p.loot.bag?50000-p.bagCash:2500+Math.floor(Math.random()*7500));this.bankCash-=amount;if(p.loot.bag)p.bagCash+=amount;else{p.bundles=5;p.handCash=(p.handCash||0)+amount;}this.crime(p,0);this.tell(p,`Взято ${amount} ₽. Выберите ${p.loot.bag?'сумку':'пачки денег'}, чтобы перечислить.`);p.loot=null;}}
      }
      let seen=false;
      for(const n of this.npcs){if(n.dead)continue;
        if((n.type==='guard'||n.type==='cashier')&&inside(p,WORLD.bank)&&this.canSee(n,p,17)&&(ITEMS[p.selected]?.mag||p.loot||p.wanted)){this.crime(p,0);seen=true;}
        if(n.type==='police'&&p.wanted&&this.canSee(n,p,24)){seen=true;p.lastSeen=this.time;}
      }
      if(p.wanted&&!seen&&this.time-p.lastSeen>18){p.wanted--;p.lastSeen=this.time;this.tell(p,p.wanted?'Погоня ослабевает. Не попадайтесь на глаза.':'Розыск снят. Вы чисты.');}
      if(!p.job&&(p.nextOffer??25)<this.time){const nearby=this.npcs.find(n=>!n.dead&&['civil','rough'].includes(n.type)&&dist(n,p)<12);if(nearby){nearby.target={x:p.x,z:p.z};p.nextOffer=this.time+65;this.tell(p,'Эй, нужна подработка? У склада нужны руки. За три ящика хорошо платят.');}}
      if(p.hp<=0){Object.assign(p,{hp:100,inventory:[],selected:'fist',mag:{pistol:0,smg:0},ammo:0,bagCash:0,bundles:0,handCash:0,wanted:0,loot:null,job:null,reload:null,sleep:3,...WORLD.spawns[p.slot]});this.tell(p,'Вас вырубили. Вещи потеряны, но баланс и личный шкаф сохранены.');}
    }
    const wanted=[...this.players.values()].filter(p=>p.wanted>0);
    if(wanted.length&&this.npcs.filter(n=>n.type==='police'&&!n.dead).length<Math.max(...wanted.map(p=>p.wanted))+1&&this.tickId%80===0){this.npcs.push({id:'police'+this.tickId,type:'police',x:17,z:-4,hp:120,yaw:Math.PI,dead:0});for(const p of wanted)this.tell(p,'Полиция прибыла в квартал. Уходите из поля зрения!');}
    for(const n of this.npcs){
      if(n.dead){n.dead-=dt;if(n.dead<=0){if(n.type==='police'){n.remove=true;continue;}n.hp=n.type==='guard'?140:100;n.x=n.type==='guard'?(n.id==='guard0'?-6:6):n.x;n.z=n.type==='guard'?-23:n.z;}continue;}
      if(['seller','cashier'].includes(n.type))continue;
      let target=null;
      if(n.type==='police'||n.type==='guard')target=[...this.players.values()].filter(p=>p.wanted&& (n.type==='police'||inside(p,WORLD.bank))&&(this.canSee(n,p,27)||dist(n,p)<4)).sort((a,b)=>dist(n,a)-dist(n,b))[0];
      if(target){n.target={x:target.x,z:target.z};if(dist(n,target)<(n.type==='police'?10:1.8)&&this.canSee({...n,yaw:Math.atan2(target.x-n.x,target.z-n.z)},target,12)){target.hp-=(n.type==='police'?7:13)*dt;target.lastSeen=this.time;n.attacking=true;}else n.attacking=false;}
      else if(!n.target||dist(n,n.target)<1||this.tickId%180===0){n.attacking=false;n.target=n.type==='guard'?{x:-7+Math.random()*14,z:-18-Math.random()*11}:{x:-45+Math.random()*90,z:-8+Math.random()*15};}
      if(n.target){const dx=n.target.x-n.x,dz=n.target.z-n.z,len=Math.hypot(dx,dz);n.yaw=Math.atan2(dx,dz);const s=(target?3.5:n.type==='elder'?.65:1.25)*dt;if(len>1){if(!blocked(n.x+dx/len*s,n.z,this.door))n.x+=dx/len*s;if(!blocked(n.x,n.z+dz/len*s,this.door))n.z+=dz/len*s;}else if(!target)n.yaw+=Math.sin(this.time)*dt;}
      // Bystanders occasionally look at the closest player.
      if(!target&&this.tickId%100<20){const p=[...this.players.values()].find(p=>dist(n,p)<7);if(p)n.yaw=Math.atan2(p.x-n.x,p.z-n.z);}
    }
    this.npcs=this.npcs.filter(n=>!n.remove);
  }
  snapshot(id) {
    const players=[...this.players.values()].map(p=>({id:p.id===id?'self':`player${p.slot}`,slot:p.slot,name:p.name,x:p.x,z:p.z,yaw:p.yaw,hp:p.hp,moving:p.moving,selected:p.selected,wanted:p.wanted,sleep:p.sleep,shot:p.shotUntil>this.time,carrying:p.job?.stage==='carry',looting:!!p.loot}));
    const p=this.players.get(id);const self=p?{...this.savePlayer(p),handCash:p.handCash||0,wanted:p.wanted,job:p.job,loot:p.loot,reload:!!p.reload,sleep:p.sleep}:null;
    return {type:'state',time:this.time,door:this.door,bankCash:this.bankCash,players,self,npcs:this.npcs.map(({target,...n})=>n)};
  }
}
