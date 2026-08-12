// Browser stubs so we can load game_v2.js in Node and sanity-check the swamp.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

const ctx = new Proxy({}, {
  get(t, p) {
    if (p === 'measureText') return () => ({ width: 0 });
    if (p in t) return t[p];
    return () => {};
  },
  set(t, p, v) { t[p] = v; return true; },
});

function makeEl() {
  return {
    id: '', className: '', style: {}, textContent: '',
    appendChild() {}, addEventListener() {}, getContext: () => ctx,
  };
}
const canvas = makeEl();
const body = { appendChild() {} };
const head = { appendChild() {} };

global.document = {
  getElementById: () => canvas,
  querySelector: () => null,
  createElement: () => makeEl(),
  head, body,
  addEventListener() {},
};
global.window = { addEventListener() {}, innerWidth: 1280, innerHeight: 800 };
global.requestAnimationFrame = () => 0;
global.performance = { now: () => 0 };
global.Image = class {
  set src(v) { this._s = v; }
  get complete() { return false; }
};

eval(src);

const maps = global.window.__rico.maps;
const swamp = maps.swamp;
console.log('swamp exists:', !!swamp);
console.log('swamp:', swamp.id, '| world=', swamp.world, '| outside=', swamp.outside, '| swamp=', swamp.swamp);
console.log('dims:', swamp.w, 'x', swamp.h);
console.log('palette groundA/water:', swamp.palette.groundA, swamp.palette.water);

let water=0, ground=0, board=0, tree=0, crate=0;
for (const row of swamp.grid) for (const ch of row) {
  if (ch==='~') water++; else if (ch==='.') ground++;
  else if (ch==='b') board++; else if (ch==='#') tree++; else if (ch==='c') crate++;
}
console.log('tiles water=%d ground=%d board=%d tree=%d crate=%d', water, ground, board, tree, crate);

const recs = Object.values(swamp.crates).filter(c=>c.record).map(c=>c.record);
console.log('records in crates:', recs.join(', '));

const SOLID = new Set(['#','w','f','~','W','T','C','c','K','J']);
function walkable(x,y){return x>=0&&y>=0&&x<swamp.w&&y<swamp.h && !SOLID.has(swamp.grid[y][x]);}
for (const k of Object.keys(swamp.crates)) {
  const [kx, ky] = k.split(',').map(Number);
  const seen = new Set(), st = [[kx,ky]]; seen.add(k);
  let ground = false;
  while (st.length) {
    const [x,y] = st.pop();
    if (swamp.grid[y][x]==='.') ground = true;
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx=x+dx, ny=y+dy, nk=nx+','+ny;
      if (walkable(nx,ny) && !seen.has(nk)) { seen.add(nk); st.push([nx,ny]); }
    }
  }
  console.log(`crate(${kx},${ky}) reachable=${seen.size} touchesGround=${ground}`);
}
console.log('LOAD OK');