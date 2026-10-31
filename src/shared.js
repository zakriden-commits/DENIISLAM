export const WORLD = {
  home: { x: -22, z: 17, w: 18, d: 14, doorX: -22, doorZ: 10 },
  bank: { x: 0, z: -23, w: 24, d: 20, doorX: 0, doorZ: -13 },
  shop: { x: 24, z: 16, w: 16, d: 14, doorX: 24, doorZ: 9 },
  loot: { x: 0, z: -29 }, job: { x: -29, z: -9 }, truck: { x: -39, z: -9 },
  lockers: [{ x: -28, z: 21 }, { x: -16, z: 21 }], spawns: [{ x: -27, z: 17 }, { x: -17, z: 17 }]
};
export const ITEMS = {
  pistol: { name: 'Пистолет «Вектор»', price: 650, icon: '⌐', mag: 12, damage: 30, range: 35, cooldown: 0.32, description: '12 патронов. Надёжный выбор для первой вылазки.' },
  smg: { name: 'ПП «Квартал»', price: 1800, icon: '⌐', mag: 25, damage: 22, range: 30, cooldown: 0.11, description: '25 патронов. Быстрый, компактный, убедительный.' },
  ammo: { name: 'Патроны · 24 шт.', price: 45, icon: '▥', description: 'Общий запас для обоих видов оружия. Покупается отдельно.' },
  bag: { name: 'Спортивная сумка', price: 450, icon: '▰', description: 'Экипируй и удерживай у денег 30 секунд. Вмещает до 50 000 ₽.' },
  medkit: { name: 'Аптечка', price: 120, icon: '+', description: 'Восстанавливает 60 здоровья. Используется из инвентаря.' }
};
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const inside = (p, b, margin = 0) => Math.abs(p.x-b.x) < b.w/2-margin && Math.abs(p.z-b.z) < b.d/2-margin;
export function blocked(x,z,doorOpen=true) {
  if (Math.abs(x)>57 || Math.abs(z)>48) return true;
  for (const [name,b] of Object.entries({home:WORLD.home,bank:WORLD.bank,shop:WORLD.shop})) {
    const l=b.x-b.w/2,r=b.x+b.w/2,t=b.z-b.d/2,bt=b.z+b.d/2;
    const gap=Math.abs(x-b.doorX)<1.65;
    if(z>t-.45 && z<bt+.45 && (Math.abs(x-l)<.65 || Math.abs(x-r)<.65)) return true;
    if(x>l-.45 && x<r+.45 && (Math.abs(z-t)<.65 || Math.abs(z-bt)<.65)) {
      const front = name==='bank' ? Math.abs(z-bt)<.65 : Math.abs(z-t)<.65;
      if (!(front && gap && (name!=='home'||doorOpen))) return true;
    }
  }
  // Decorative buildings are solid; they are not traversable scenery.
  for (const b of [{x:-44,z:27,w:12,d:18},{x:44,z:-25,w:15,d:20},{x:-27,z:-35,w:15,d:14},{x:23,z:-35,w:13,d:13},{x:5,z:34,w:18,d:12}])
    if(inside({x,z},b,-.45)) return true;
  return false;
}
