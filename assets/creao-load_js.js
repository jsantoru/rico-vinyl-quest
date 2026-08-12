// Minimal browser stubs so we can load game_v2.js in Node and sanity-check
// that the swamp map builds and is walkable.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

const ctx = new Proxy({}, {
  get(t, p) {
    if (p === 'measureText') return () => ({ width: 0 });
    if (p in t) return t[p];
    return (...a) => {};
  },
  set(t, p, v) { t[p] = v; return true; },
});

function makeEl(id) {
  return {
    id, className: '', textContent: '', style: {},
    content: '', _append: [], textContent,
    set textContent(v) { this._text = v; },
    appendChild() {}, addEventListener() {}, getContext: () => ctx,
  };
}

const canvas = makeEl('game');
const body = { appendChild() {}, addEventListener() {} };
const head = { appendChild() {} };

global.document = {
  getElementById: (id) => canvas,
  querySelector: () => null,
  createElement: (tag) => tag === 'style' ? { textContent: '' } : makeEl('x'),
  head,
  body,
  addEventListener() {},
};
global.window = {
  addEventListener() {},
  innerWidth: 1280, innerHeight: 800,
};
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
console.log('swamp id/world/outside/swamp:', swamp.id, swamp.world, swamp.outside, swamp.swamp);
console.log('dims:', swamp.w, 'x', swamp.h);
console.log('palette groundA:', swamp.palette.groundA, 'water:', swamp.palette.water);

// Count tile types
let water = 0, ground = 0, board = 0, tree = 0, crate = 0;
for (const row of swamp.grid) for (const ch of row) {
  if (ch === '~') water++; else if (ch === '.') ground++;
  else if (ch === 'b') board++; else if (ch === '#') tree++; else if (ch === 'c') crate++;
}
console.log('tiles -> water:%d ground:%d board:%d tree:%d crate:%d', water, ground, board, tree, crate);

// Verify the 5 records are hidden in the swamp crates and reachable via boardwalk
const records = Object.values(swamp.crates).filter(c => c.record).map(c => c.record);
console.log('records in crates:', records.join(', '));
const worldDefs = maps.__worldDefs ?? null;

// quick connectivity: BFS from each crate over walkable tiles ('.','b') to ensure reachable
const SOLID = new Set(['#', 'w', 'f', '~', 'W', 'T', 'C', 'c', 'K', 'J']);
const W = swamp.w, H = swamp.h;
function walkable(x, y) { return x>=0&&y>=0&&x<W&&y<H && !SOLID.has(swamp.grid[y][x]); }
for (const [kx, ky] of Object.keys(swamp.crates).map(k => k.split(',').map(Number))) {
  const seen = new Set(), stack = [[kx, ky]]; seen.add(kx+','+ky);
  let foundLand = false, biggest = 0;
  while (stack.length) {
    const [x, y] = stack.pop();
    if (swamp.grid[y][x] === '.') foundLand = true;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x+dx, ny = y+dy;
      const k = nx+','+ny;
      if (walkable(nx, ny) && !seen.has(k)) { seen.add(k); stack.push([nx, ny]); }
    }
  }
  const reachable = seen.size;
  console.log(`crate at (${kx},${ky}) -> reachable tiles: ${reachable}, touches ground: ${foundLand}`);
}
console.log('LOAD OK');