(() => {
'use strict';

// ---------------------------------------------------------------- constants
const TILE = 32;
const VIEW_W = 960, VIEW_H = 600;
const WALK_SPEED = 150, SKATE_SPEED = 285;
const SPR_H = 60, SPR_W = Math.round(60 * 129 / 225); // sheet cell is 129x225

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// ---------------------------------------------------------------- responsive fullscreen canvas
(() => {
  let vp = document.querySelector('meta[name="viewport"]');
  if (!vp) { vp = document.createElement('meta'); vp.name = 'viewport'; document.head.appendChild(vp); }
  vp.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

  const style = document.createElement('style');
  style.textContent = `
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      background: #000; overflow: hidden;
      touch-action: none;
      -webkit-user-select: none; user-select: none;
    }
    #game {
      display: block;
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      image-rendering: pixelated;
      image-rendering: -moz-crisp-edges;
      image-rendering: crisp-edges;
      touch-action: none;
    }
    #touchControls {
      position: fixed; inset: 0; pointer-events: none;
      display: none; z-index: 10;
    }
    @media (pointer: coarse) {
      #touchControls { display: block; }
    }
    #touchControls .tc-btn {
      position: absolute;
      pointer-events: auto;
      display: flex; align-items: center; justify-content: center;
      background: rgba(244,236,216,0.08);
      border: 1.5px solid rgba(244,236,216,0.35);
      border-radius: 10px;
      color: rgba(244,236,216,0.85);
      font: bold 12px monospace;
      -webkit-user-select: none; user-select: none;
      -webkit-touch-callout: none;
      touch-action: none;
      transition: background 0.1s, border-color 0.1s;
    }
    #touchControls .tc-btn:active {
      background: rgba(244,236,216,0.32);
      border-color: rgba(244,236,216,0.7);
      color: #f4ecd8;
    }
    #dpadUp    { left: 56px; bottom: 66px; width: 46px; height: 46px; font-size: 15px; }
    #dpadDown  { left: 56px; bottom: 14px; width: 46px; height: 46px; font-size: 15px; }
    #dpadLeft  { left: 4px;  bottom: 40px; width: 46px; height: 46px; font-size: 15px; }
    #dpadRight { left: 108px; bottom: 40px; width: 46px; height: 46px; font-size: 15px; }
    #btnE { right: 14px; bottom: 14px; width: 62px; height: 62px; border-radius: 50%; font-size: 16px; }
    #btnX { right: 14px; bottom: 84px; width: 40px; height: 40px; border-radius: 50%; font-size: 16px; }
    #btnSK8 { right: 86px; bottom: 114px; width: 40px; height: 40px; border-radius: 50%; font-size: 11px; }
    #btnExtras { right: 86px; bottom: 64px; width: 40px; height: 40px; border-radius: 50%; font-size: 16px; }
    #btnM { right: 86px; bottom: 14px; width: 40px; height: 40px; border-radius: 50%; font-size: 9px; }
    #extrasPanel {
      position: absolute;
      right: 86px; bottom: 162px;
      display: none;
      flex-direction: column;
      gap: 6px;
      pointer-events: none;
    }
    #extrasPanel.open { display: flex; pointer-events: auto; }
    #extrasPanel .tc-btn {
      position: static;
      width: 58px; height: 30px;
      border-radius: 8px;
      font-size: 9px;
    }
    .tc-btn.tc-on {
      background: rgba(224,176,64,0.4);
      border-color: rgba(224,176,64,0.9);
      color: #f4ecd8;
    }
  `;
  document.head.appendChild(style);

  function fitCanvas() {
    const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
    canvas.style.width = Math.max(1, Math.floor(VIEW_W * scale)) + 'px';
    canvas.style.height = Math.max(1, Math.floor(VIEW_H * scale)) + 'px';
  }
  window.addEventListener('resize', fitCanvas);
  window.addEventListener('orientationchange', fitCanvas);
  fitCanvas();
})();

// ---------------------------------------------------------------- iOS/iPadOS zoom-gesture guard
(() => {
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
    document.addEventListener(type, (e) => e.preventDefault());
  });
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 350) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (e.scale !== undefined && e.scale !== 1) e.preventDefault();
  }, { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault());
})();

// ---------------------------------------------------------------- worlds & records
const WORLD_DEFS = {
  town: {
    name: 'Burlington',
    records: {
      elm:   { title: 'Elm Street Funk',      artist: 'Static Groove',   year: '1974',
               sample: 'Drum Break',  layer: 'drums', color: '#e0a030', pad: 'DRM',
               flavor: 'The drummer lived right on Elm Street. 500 copies pressed, most lost. Not this one.' },
      cola:  { title: 'Cherry Cola Bounce',   artist: 'Rosie & The Fizz', year: '1968',
               sample: 'Bassline',    layer: 'bass',  color: '#d04830', pad: 'BAS',
               flavor: 'A jukebox 45 so greasy it still smells like fries. The bassline walks for days.' },
      stab:  { title: 'Midnight Stab',        artist: 'The Velvet Horns', year: '1977',
               sample: 'Horn Stab',   layer: 'horns', color: '#c04070', pad: 'HRN',
               flavor: 'Four trombones, one take, recorded at 2am. You can hear somebody knock over a chair.' },
      choir: { title: 'Galactic Hallelujah',  artist: 'Cosmic Choir',     year: '1972',
               sample: 'Vocal Chop',  layer: 'vox',   color: '#4870d0', pad: 'VOX',
               flavor: 'A church choir that thought they were singing to outer space. Maybe they were.' },
      white: { title: 'White Label',          artist: 'Unknown',          year: '197?',
               sample: 'Lead Melody', layer: 'lead',  color: '#e8e4dc', pad: 'LD',
               flavor: 'No sleeve. No name. Just a hand-drawn star on the label. The holy grail.' },
    },
    padOrder: ['elm', 'cola', 'stab', 'choir', 'white'],
  },
  swamp: {
    name: 'Bayou Crossing',
    records: {
      moss: { title: 'Strum Low', artist: 'Boss Bass', year: '1981',
              sample: 'Bassline', layer: 'bass', color: '#3f8f4f', pad: 'BAS',
              flavor: 'Bass plucked deep under the waterline. It hums like rain itself.' },
      frog: { title: 'Frog Chorus Stab', artist: 'The Lilypad Horns', year: '1985',
              sample: 'Horn Stab', layer: 'horns', color: '#8f9a3f', pad: 'HRN',
              flavor: 'Three bullfrogs, one chord, struck right before dawn.' },
      choir: { title: 'Moss Hallelujah', artist: 'Cypress Choir', year: '1979',
               sample: 'Vocal Chop', layer: 'vox', color: '#5f9a7a', pad: 'VOX',
               flavor: 'A choir of crickets singing through the reeds to no one at all.' },
      swampdrum: { title: 'Mud Kick', artist: 'Crawdad Drums', year: '1982',
                   sample: 'Drum Loop', layer: 'drums', color: '#8fbf3f', pad: 'DRM',
                   flavor: 'A rhythm beaten on a hollow log. Wet, muffled, unstoppable.' },
      honeysuckle: { title: 'Honeysuckle Lead', artist: 'Wildflower & Vine', year: '1974',
                    sample: 'Lead Melody', layer: 'lead', color: '#d8c060', pad: 'LD',
                    flavor: 'A single string soaked in swamp honey. It glows through the mist.' },
    },
    padOrder: ['moss', 'frog', 'choir', 'swampdrum', 'honeysuckle'],
  }
};

function currentWorldId() { return maps[player.map].world; }
function worldDef()      { return WORLD_DEFS[currentWorldId()] || WORLD_DEFS.town; }
function worldRecords()  { return worldDef().records; }
function worldPadOrder() { return worldDef().padOrder; }
function worldComplete() { return worldPadOrder().every(id => collected.has(id)); }

const JUNK = [
  'A water-damaged polka compilation. Hard pass.',
  '"Sounds of the Office" — forty minutes of typewriters. Tempting... no.',
  'Three identical copies of the same smooth jazz album. Why?',
  'A kids’ sing-along record. The crayon cover art is honestly pretty good.',
  'An aerobics record from 1982. The crowd goes mild.',
  'A spoken-word album about lawn care. Riveting stuff.',
  'Somebody’s wedding band demo. They cover "Mustang Sally". Twice.',
  'A bagpipe Christmas album. Some things can’t be sampled.',
];

// ---------------------------------------------------------------- input
const keys = {};
let interactPressed = false;
let buyPressed = false;
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k) || k === ' ') e.preventDefault();
  if (!keys[k]) {
    if (k === 'e' || k === 'enter' || k === 'z' || k === ' ') interactPressed = true;
    if (k === 'x') buyPressed = true;
    if (k === 'b') toggleSkate();
    if (k === 'm') music.toggleMute();
    if (k === 'c') toggleCoffee();
    if (k === 'y') toggleTea();
  }
  keys[k] = true;
  music.start();
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

function axis() {
  let dx = 0, dy = 0;
  if (keys['arrowleft'] || keys['a']) dx -= 1;
  if (keys['arrowright'] || keys['d']) dx += 1;
  if (keys['arrowup'] || keys['w']) dy -= 1;
  if (keys['arrowdown'] || keys['s']) dy += 1;
  return [dx, dy];
}

// ---------------------------------------------------------------- sprite / splash images
const ricoImg = new Image();
ricoImg.src = 'assets/rico.png';
const SHEET_CW = 129, SHEET_CH = 225;
const DIR_ROW = { up: 0, down: 1, left: 2, right: 3 };

const splashImg = new Image();
splashImg.src = 'assets/splash.png';

const purePopPosterImg = new Image();
purePopPosterImg.src = 'assets/purepop_poster.png';

const anthillBillboardImg = new Image();
anthillBillboardImg.src = 'assets/anthill_billboard.png';

const nectarsNeonImg = new Image();
nectarsNeonImg.src = 'assets/nectars_neon.png';

const titleMenuImg = new Image();
titleMenuImg.src = 'assets/title_menu.png';
const titleSkyImg = new Image();
titleSkyImg.src = 'assets/title_sky.png';

// ---------------------------------------------------------------- maps
const SOLID = new Set(['#', 'w', 'f', '~', 'W', 'T', 'C', 'c', 'K', 'J']);

function blankGrid(w, h, fill) {
  return Array.from({ length: h }, () => Array(w).fill(fill));
}

function makeOverworld() {
  const W = 40, H = 26;
  const g = blankGrid(W, H, '.');
  for (let x = 0; x < W; x++) { g[0][x] = '#'; g[H-1][x] = '#'; }
  for (let y = 0; y < H; y++) { g[y][0] = '#'; g[y][W-1] = '#'; }

  for (let x = 1; x < W-1; x++) { g[9][x] = 'r'; g[10][x] = 'r'; }
  for (let y = 1; y < H-1; y++) { g[y][19] = 'r'; g[y][20] = 'r'; }

  const buildings = [];
  function building(x, y, w, h, name, wall, roof, customDoorX) {
    for (let yy = y; yy < y+h; yy++)
      for (let xx = x; xx < x+w; xx++) g[yy][xx] = 'w';
    const doorX = customDoorX !== undefined ? customDoorX : x + Math.floor(w/2);
    g[y+h-1][doorX] = 'D';
    buildings.push({ x, y, w, h, name, wall, roof, doorX });
    return { doorX, doorY: y+h-1 };
  }

  const groove = building(4, 3, 7, 4, 'Green Door Studio', '#76503a', '#4e3328', 9);
  const wax    = building(28, 3, 7, 4, 'Hey Bud', '#bf4f6f', '#93384f');
  const diner  = building(4, 14, 5, 4, 'Kountry Kart Deli', '#c07a38', '#96591f');
  const nectars = building(9, 14, 4, 6, 'Nectars', '#2a2a3a', '#1a1a2a');
  const thrift = building(28, 14, 5, 4, 'Pure Pop Records', '#3f8fbf', '#2a6a93');
  const juniors = building(33, 14, 4, 4, "Junior's", '#d84030', '#a83020');

  const riverTiles = [];
  for (let y = 1; y <= H - 2; y++) {
    const onRoad = (y === 9 || y === 10);
    const wobble = Math.sin(y / 4.2) * 1.8 + Math.sin(y / 1.7) * 0.6;
    const centerX = Math.round(14 + wobble);
    for (let dx = 0; dx < 2; dx++) {
      const x = centerX + dx;
      if (x < 1 || x > W - 2) continue;
      g[y][x] = onRoad ? 'b' : '~';
      if (!onRoad) riverTiles.push({ x, y });
    }
  }

  const lowerBridgeRow = 20;
  for (let x = 1; x < W - 1; x++) {
    if (g[lowerBridgeRow][x] === '~') g[lowerBridgeRow][x] = 'b';
  }

  const trees = [[3,20],[5,22],[7,19],[13,21],[15,23],[3,23],[10,23],[16,19],[36,20],[34,23],[9,12],[14,13],[25,12],[36,12],[2,12],[37,7],[2,7],[24,23],[13,6],[26,6]];
  for (const [tx, ty] of trees) if (g[ty][tx] === '.') g[ty][tx] = '#';

  for (let x = 25; x <= 31; x++) { if (x === thrift.doorX) continue; g[18][x] = 'f'; }
  for (let y = 18; y <= 22; y++) g[y][32] = 'f';
  g[20][26] = 'c'; g[21][28] = 'c'; g[20][30] = 'c';

  const map = {
    id: 'town', world: 'town', w: W, h: H, grid: g, outside: true, buildings,
    doors: {}, crates: {}, npcs: [], riverTiles,
    ambient: { bikeRows: [9, 10], walkerRow: 12, dogRow: 23 },
  };
  map.npcs = [
    { id: 'gary', tx: 5, ty: 19, name: 'GARY',
      lines: [
        'Hey there, friend, name is Gary. Been playing guitar by this can since before you were born. Good vibes only.',
        'You ever really listen to "Terrapin Station"? Like really sit with it? Man, 1977, Cornell, no wait, the Barton Hall run, I mean the studio cut, well actually...',
        'Anyway... peace! I am out!'
      ] },
    { id: 'willie', tx: 5, ty: 8, name: 'WILLIE',
      lines: [
        'Hey now, welcome to the wall! I\'m Willie — painter, free spirit, full of love and creativity.',
        'Every color\'s a story, and yours is one of the good ones.'
      ] },
  ];
  map.crates[key(26, 20)] = { junkSeed: 3 };
  map.crates[key(28, 21)] = { record: 'white' };
  map.crates[key(30, 20)] = { junkSeed: 6 };
  return { map, doors: { groove, wax, diner, nectars, thrift, juniors } };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSwamp() {
  const W = 44, H = 28;
  const g = blankGrid(W, H, '~');
  const rng = mulberry32(90240214);
  for (let x = 0; x < W; x++) g[12][x] = 'b';
  for (let y = 5; y < 22; y++) { g[y][8] = 'b'; g[y][34] = 'b'; }
  for (let i = 0; i < 11; i++) {
    const cx = 2 + Math.floor(rng() * (W - 4));
    const cy = 2 + Math.floor(rng() * (H - 4));
    const r = 2 + Math.floor(rng() * 3);
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && g[y][x] === '~') g[y][x] = '.';
      }
  }
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++)
      if (g[y][x] === '.' && rng() < 0.10) g[y][x] = '#';
  const crates = {};
  const crateDefs = [
    [20, 12, { record: 'moss' }], [30, 12, { record: 'frog' }], [38, 12, { junkSeed: 1 }],
    [6, 12,  { junkSeed: 2 }], [8, 9,   { record: 'choir' }], [34, 7,  { record: 'swampdrum' }],
    [17, 18, { junkSeed: 0 }], [34, 17, { record: 'honeysuckle' }], [14, 12, { junkSeed: 3 }],
  ];
  for (const [x, y, d] of crateDefs) { g[y][x] = 'c'; crates[key(x, y)] = d; }
  const waterTiles = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (g[y][x] === '~') waterTiles.push({ x, y });
  return {
    id: 'swamp', world: 'swamp', w: W, h: H, grid: g, outside: true,
    buildings: [], doors: {}, crates, npcs: [], riverTiles: waterTiles,
    swamp: true,
    palette: {
      groundA: '#6a5a35', groundB: '#5c723a', groundDot: '#6d8a46',
      water: '#2c4330', waterHi: '#3d5a3e',
      trunk: '#4a3a24', leafDark: '#2f5a28', leafMid: '#3c6a30', leafLight: '#4a7c3c',
    },
    ambient: { bikeRows: [], walkerRow: -1, dogRow: -1 },
  };
}

function key(x, y) { return x + ',' + y; }

function makeShop(id, opts) {
  const W = 14, H = 10;
  const g = blankGrid(W, H, '=');
  for (let x = 0; x < W; x++) { g[0][x] = 'W'; g[H-1][x] = 'W'; }
  for (let y = 0; y < H; y++) { g[y][0] = 'W'; g[y][W-1] = 'W'; }
  for (let x = 4; x <= 9; x++) g[2][x] = 'T';
  g[1][6] = 'K';
  g[H-1][6] = 'E';
  const map = {
    id, world: opts.world || 'town', w: W, h: H, grid: g, outside: false,
    floor: opts.floor, plank: opts.plank, wallColor: opts.wallColor,
    keeper: { x: 6, y: 1, ...opts.keeper },
    crates: {}, npcs: [],
    darkClub: opts.darkClub || false,
    pizzaShop: opts.pizzaShop || false,
  };
  const spots = [[1,4],[1,6],[12,4],[12,6],[2,8],[11,8]];
  opts.crates.forEach((c, i) => {
    const [x, y] = spots[i % spots.length];
    g[y][x] = 'C';
    map.crates[key(x, y)] = c;
  });
  if (opts.jukebox) { g[2][11] = 'J'; map.jukebox = true; }
  return map;
}

const { map: town, doors } = makeOverworld();
const shops = {
  groove: makeShop('groove', {
    floor: '#8a6a4a', plank: '#7a5a3c', wallColor: '#4a3a5f',
    keeper: { name: 'SK1', shirt: '#1f1d26', skin: '#8a5a34',
      lines: ['Welcome to Green Door Studio — mind the wet paint by the door.',
              'I\'m with The Anthill Collective — we keep the color on the walls.',
              'Try digging through the crates against the LEFT wall.'],
      foundLine: 'Elm Street Funk?! Go make some noise with it.' },
    crates: [ { record: 'elm' }, { junkSeed: 0 }, { junkSeed: 1 }, { junkSeed: 2 } ],
  }),
  wax: makeShop('wax', {
    floor: '#5f4a6a', plank: '#4f3c58', wallColor: '#3a2a44',
    keeper: { name: 'DEE', shirt: '#d05a8a', skin: '#c89a72',
      lines: ['Welcome to Hey Bud — water your soul, or just browse.',
              'Should still be in a crate on the RIGHT side, behind the ferns.'],
      foundLine: 'Midnight Stab, right here at Hey Bud? Those horns are gonna grow on you.' },
    crates: [ { junkSeed: 3 }, { junkSeed: 4 }, { record: 'stab' }, { junkSeed: 5 } ],
  }),
  diner: makeShop('diner', {
    floor: '#b8a08a', plank: '#a89078', wallColor: '#7a4a3a',
    keeper: { name: 'ROSIE', shirt: '#e0e0e0', skin: '#e8b890',
      lines: ['Grab a stool, hon. Kitchen’s slow today but the jukebox never stops.',
              'Spare copies ended up in a crate in the BACK of the deli.'],
      foundLine: 'Well I’ll be. Make that bassline bounce again, sugar.' },
    crates: [ { junkSeed: 6 }, { junkSeed: 7 }, { junkSeed: 0 }, { junkSeed: 1 }, { record: 'cola' } ],
    jukebox: true,
  }),
  thrift: makeShop('thrift', {
    floor: '#6a8a6a', plank: '#587a58', wallColor: '#3a4a3a',
    keeper: { name: 'ZEKE', shirt: '#70b060', skin: '#9a7050',
      lines: ['Welcome to Pure Pop — the crate-digger’s dream.',
              'Might be filed on the RIGHT side. Might be misfiled entirely.'],
      foundLine: 'Galactic Hallelujah?! Glad you found it first.' },
    crates: [ { junkSeed: 2 }, { junkSeed: 3 }, { junkSeed: 4 }, { record: 'choir' } ],
  }),
  nectars: makeShop('nectars', {
    floor: '#1a1520', plank: '#0f0a15', wallColor: '#2a1a2f',
    keeper: { name: 'JADE', shirt: '#8a2040', skin: '#b08a72',
      lines: ['Welcome to Nectar\'s! Best gravy fries in town.',
              'Try Pure Pop Records for rare finds, or Green Door Studio.'],
      foundLine: 'Enjoy the show! Those fries are legendary.' },
    crates: [],
    darkClub: true,
  }),
  juniors: makeShop('juniors', {
    floor: '#c8a898', plank: '#b89888', wallColor: '#e8d8c8',
    keeper: { name: 'TONY', shirt: '#e8e8e8', skin: '#d8b898',
      lines: ['Hey! Welcome to Junior\'s — best slice in town.',
              'Vinyl records? Kountry Kart Deli has some old jukebox connections.'],
      foundLine: 'Grab a slice before you go. You\'ll need the energy!' },
    crates: [],
    pizzaShop: true,
  }),
};

const transitions = {};
for (const [id, d] of Object.entries(doors)) {
  transitions['town:' + key(d.doorX, d.doorY)] = { map: id, x: 6.5, y: 7.5 };
  transitions[id + ':' + key(6, 9)] = { map: 'town', x: d.doorX + 0.5, y: d.doorY + 1.6 };
}
const swamp = makeSwamp();
const maps = { town, ...shops, swamp };

// ---------------------------------------------------------------- state
const player = {
  map: 'town', x: 19.5 * TILE, y: 12.5 * TILE,
  dir: 'down', moving: false, skating: false, animT: 0,
  holdingCoffee: false, holdingTea: false,
  tempItem: null, tempItemTimer: 0,
};
const collected = new Set();
let state = 'splash';
let dialog = null;
let shownRecord = null;
const completedWorlds = new Set();
let toast = null;

function toggleSkate() {
  if (state !== 'play' || !maps[player.map].outside) return;
  player.skating = !player.skating;
  toast = { text: player.skating ? 'Skateboard: ON' : 'Skateboard: OFF', t: 1.2 };
}
function toggleCoffee() {
  if (state !== 'play') return;
  player.holdingCoffee = !player.holdingCoffee;
  if (player.holdingCoffee) player.holdingTea = false;
  toast = { text: player.holdingCoffee ? 'Cold Brew: ON' : 'Cold Brew: OFF', t: 1.2 };
}
function toggleTea() {
  if (state !== 'play') return;
  player.holdingTea = !player.holdingTea;
  if (player.holdingTea) player.holdingCoffee = false;
  toast = { text: player.holdingTea ? 'Yerba Mate: ON' : 'Yerba Mate: OFF', t: 1.2 };
}

// ---------------------------------------------------------------- audio
const music = {
  ctx: null, master: null, noiseBuf: null, muted: false,
  step: 0, nextTime: 0, BPM: 92,
  layers: new Set(['tick']),
  menuDusty: false,
  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.28;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.nextTime = this.ctx.currentTime + 0.1;
    setInterval(() => this.pump(), 25);
  },
  toggleMute() {
    if (!this.ctx) return;
    this.muted = !this.muted;
    this.master.gain.value = this.muted ? 0 : 0.28;
    toast = { text: this.muted ? 'Music: MUTED' : 'Music: ON', t: 1.2 };
  },
  enable(layer) { this.layers.add(layer); },
  setMenuBreak(on) { this.menuDusty = on; },
  crackle(t, s, stepDur) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2800;
    const g = this.ctx.createGain();
    const pop = (s % 4 === 3);
    const gain = pop ? 0.05 : 0.016;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (pop ? 0.05 : stepDur * 0.6));
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + (pop ? 0.06 : stepDur));
  },
  pump() {
    const stepDur = 60 / this.BPM / 4;
    if (this.nextTime < this.ctx.currentTime - 0.5) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.4) {
      this.schedule(this.step, this.nextTime, stepDur);
      this.step = (this.step + 1) % 32;
      this.nextTime += stepDur;
    }
  },
  schedule(gs, t, stepDur) {
    const s = gs % 16;
    if (this.menuDusty) {
      if ([0, 7, 10].includes(s)) this.kick(t);
      if (s === 4 || s === 12) this.snare(t);
      if (s % 2 === 0) this.hat(t, s === 14, 0.10);
      this.crackle(t, s, stepDur);
      return;
    }
    const bar = Math.floor(gs / 16);
    const L = this.layers;
    if (L.has('drums')) {
      if ([0, 7, 10].includes(s)) this.kick(t);
      if (s === 4 || s === 12) this.snare(t);
      if (s % 2 === 0) this.hat(t, s === 14, 0.10);
    } else if (L.has('tick') && s % 4 === 0) this.hat(t, false, 0.028);
    if (L.has('bass')) {
      const pat = [[0,45,2],[3,45,1],[6,48,2],[8,50,2],[11,45,1],[14,43,2]];
      for (const [ps, n, d] of pat) if (ps === s) this.note(t, 'square', n, d * stepDur, 0.10);
    }
    if (L.has('horns') && (s === 4 || s === 11)) {
      for (const n of [57, 60, 64]) this.note(t, 'sawtooth', n, 1.4 * stepDur, 0.05, 0.03);
    }
    if (L.has('vox') && (s === 0 || s === 8)) {
      const notes = bar % 2 === 0 ? [69, 67] : [72, 71];
      this.note(t, 'triangle', notes[s === 0 ? 0 : 1], 7.5 * stepDur, 0.07, 0.25, true);
    }
    if (L.has('lead') && bar % 2 === 1 && s % 2 === 0) {
      const mel = [76, 74, 72, 69, 72, 74, 76, 79];
      this.note(t, 'square', mel[s / 2], 1.6 * stepDur, 0.045, 0.02);
    }
  },
  kick(t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.16);
  },
  snare(t) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.13);
  },
  hat(t, open, gain) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = this.ctx.createGain();
    const dur = open ? 0.22 : 0.045;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.01);
  },
  note(t, type, midi, dur, gain, release = 0.02, vibrato = false) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    if (vibrato) {
      const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
      lfo.frequency.value = 5.2; lg.gain.value = 7;
      lfo.connect(lg); lg.connect(o.detune);
      lfo.start(t); lfo.stop(t + dur + release);
    }
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.015);
    g.gain.setValueAtTime(gain, t + dur); g.gain.exponentialRampToValueAtTime(0.001, t + dur + release);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + release + 0.02);
  },
  sting() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    [69, 73, 76, 81].forEach((n, i) => this.note(t + i * 0.09, 'square', n, 0.14, 0.09, 0.08));
  },
};

// ---------------------------------------------------------------- movement
function isSolid(map, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true;
  return SOLID.has(map.grid[ty][tx]);
}
function boxClear(map, cx, cy) {
  const hw = 10, hh = 7;
  const pts = [[cx-hw, cy-hh], [cx+hw, cy-hh], [cx-hw, cy+hh], [cx+hw, cy+hh]];
  return pts.every(([px, py]) => !isSolid(map, Math.floor(px / TILE), Math.floor(py / TILE)));
}
function movePlayer(dt) {
  const [dx, dy] = axis();
  player.moving = dx !== 0 || dy !== 0;
  if (!player.moving) return;
  if (dy < 0) player.dir = 'up';
  else if (dy > 0) player.dir = 'down';
  else if (dx < 0) player.dir = 'left';
  else if (dx > 0) player.dir = 'right';
  const map = maps[player.map];
  const baseSpeed = player.skating ? SKATE_SPEED : WALK_SPEED;
  const speed = (player.holdingCoffee || player.holdingTea) ? baseSpeed * 1.15 : baseSpeed;
  const mag = Math.hypot(dx, dy) || 1;
  const stepX = (dx / mag) * speed * dt;
  const stepY = (dy / mag) * speed * dt;
  if (boxClear(map, player.x + stepX, player.y)) player.x += stepX;
  if (boxClear(map, player.x, player.y + stepY)) player.y += stepY;
  player.animT += dt * (player.skating ? 1.4 : 1);
  const tk = player.map + ':' + key(Math.floor(player.x / TILE), Math.floor(player.y / TILE));
  const tr = transitions[tk];
  if (tr) {
    player.map = tr.map;
    player.x = tr.x * TILE;
    player.y = tr.y * TILE;
    if (!maps[tr.map].outside) player.skating = false;
  }
}

// ---------------------------------------------------------------- interact
const VENDOR_CARTS = [
  { id: 'coldbrew', map: 'town', label: 'BUY A COLD BREW', x: 27 * TILE + 5 + 28, y: 18 * TILE + 4 + 40, radius: 42 },
  { id: 'icecream', map: 'town', label: 'BUY ICE CREAM', x: 35.2 * TILE + 46, y: 21.4 * TILE + 63, radius: 46 },
];
function facingTile() {
  const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[player.dir];
  const fx = player.x + d[0] * 24, fy = player.y + d[1] * 22;
  return [Math.floor(fx / TILE), Math.floor(fy / TILE)];
}
function facingTarget() {
  const map = maps[player.map];
  const [tx, ty] = facingTile();
  if (tx >= 0 && ty >= 0 && tx < map.w && ty < map.h) {
    const ch = map.grid[ty][tx];
    if (ch === 'C' || ch === 'c') return { type: 'crate', tx, ty, data: map.crates[key(tx, ty)] };
    if (ch === 'K') return { type: 'keeper', data: map.keeper };
    if (ch === 'T' && map.keeper && Math.abs(tx - map.keeper.x) <= 2 && ty === 2) return { type: 'keeper', data: map.keeper };
    if (ch === 'J') return { type: 'jukebox' };
    if (map.npcs) {
      const np = map.npcs.find(n => n.tx === tx && n.ty === ty);
      if (np) return { type: 'npc', data: np };
    }
  }
  const cart = VENDOR_CARTS.find(c => c.map === player.map && Math.hypot(player.x - c.x, player.y - c.y) < c.radius);
  if (cart) return { type: 'cart', data: cart };
  return null;
}
function doInteract() {
  const target = facingTarget();
  if (!target) return;
  if (target.type === 'keeper') {
    const k = target.data;
    const shopRecord = Object.values(maps[player.map].crates).find(c => c.record)?.record;
    const lines = shopRecord && collected.has(shopRecord) ? [k.foundLine] : k.lines;
    dialog = { name: k.name, lines, i: 0 };
    state = 'dialog';
  } else if (target.type === 'crate') {
    const c = target.data;
    if (!c) return;
    if (c.record && !collected.has(c.record)) {
      collected.add(c.record);
      music.enable(worldRecords()[c.record].layer);
      music.sting();
      shownRecord = c.record;
      state = 'record';
    } else if (c.record) {
      dialog = { name: 'CRATE', lines: ['Nothing left in here but dust and old sleeves.'], i: 0 };
      state = 'dialog';
    } else {
      dialog = { name: 'CRATE', lines: [JUNK[c.junkSeed % JUNK.length], 'Keep digging...'], i: 0 };
      state = 'dialog';
    }
  } else if (target.type === 'jukebox') {
    dialog = { name: 'JUKEBOX', lines: ['B7: "Cherry Cola Bounce".'], i: 0 };
    state = 'dialog';
  } else if (target.type === 'npc') {
    const n = target.data;
    dialog = { name: n.name, lines: n.lines, i: 0 };
    state = 'dialog';
  }
}
function doBuy() {
  if (state !== 'play') return;
  const target = facingTarget();
  if (!target || target.type !== 'cart') return;
  if (target.data.id === 'icecream') {
    player.tempItem = 'iceCream'; player.tempItemTimer = 6;
    toast = { text: 'Ice Cream!', t: 1.2 };
  } else if (target.data.id === 'coldbrew') {
    player.tempItem = 'coldBrew'; player.tempItemTimer = 6;
    toast = { text: 'Cold Brew!', t: 1.2 };
  }
}

// ---------------------------------------------------------------- ambient town life
const ambient = [];
const ambientTimers = { bike: 4, walker: 3, dog: 6, fish: 2 };
function updateAmbient(dt) {
  const map = maps[player.map];
  const amb = map && map.ambient;
  if (!amb) { if (ambient.length) ambient.length = 0; return; }
  ambientTimers.bike -= dt; if (ambientTimers.bike <= 0) { spawnBike(map); ambientTimers.bike = 7 + Math.random() * 9; }
  ambientTimers.walker -= dt; if (ambientTimers.walker <= 0) { spawnWalker(map); ambientTimers.walker = 5 + Math.random() * 8; }
  ambientTimers.dog -= dt; if (ambientTimers.dog <= 0) { spawnDog(map); ambientTimers.dog = 9 + Math.random() * 10; }
  ambientTimers.fish -= dt; if (ambientTimers.fish <= 0 && map.riverTiles && map.riverTiles.length) { spawnFish(map); ambientTimers.fish = 2 + Math.random() * 3; }
  for (let i = ambient.length - 1; i >= 0; i--) {
    const a = ambient[i];
    a.t += dt;
    if (a.type === 'fish') { if (a.t > a.life) ambient.splice(i, 1); continue; }
    a.x += a.vx * dt;
    if (a.x < -50 || a.x > map.w * TILE + 50) ambient.splice(i, 1);
  }
}
function spawnBike(map) {
  const amb = map.ambient || {};
  const rows = amb.bikeRows; if (!rows || !rows.length) return;
  const dir = Math.random() < 0.5 ? 1 : -1;
  const row = rows[Math.floor(Math.random() * rows.length)];
  ambient.push({ type: 'bike', x: dir > 0 ? -30 : map.w * TILE + 30, y: row * TILE + 16, vx: dir * 115, dir, t: 0 });
}
function spawnWalker(map) {
  const amb = map.ambient || {};
  const dir = Math.random() < 0.5 ? 1 : -1;
  const shirts = ['#c86a3a', '#4a7ab0', '#7a4a9a', '#3a9a5a'];
  const row = amb.walkerRow !== undefined ? amb.walkerRow : 12;
  if (row < 0) return;
  const shirt = shirts[Math.floor(Math.random() * shirts.length)];
  ambient.push({
    type: 'walker', x: dir > 0 ? -20 : map.w * TILE + 20, y: row * TILE + 24, vx: dir * 44, dir, t: 0,
    shirt, shirtDark: shadeColor(shirt, -45), shirtLight: shadeColor(shirt, 40),
    skin: '#d8a878', pants: '#3a3a46', shoe: '#241c18', hair: '#4a3020',
    backpack: Math.random() < 0.35 ? '#4a5a3a' : null,
  });
}
function spawnDog(map) {
  const amb = map.ambient || {};
  const dir = Math.random() < 0.5 ? 1 : -1;
  const row = amb.dogRow !== undefined ? amb.dogRow : 23;
  if (row < 0) return;
  const fur = '#a9713f';
  ambient.push({
    type: 'dog', x: dir > 0 ? -20 : map.w * TILE + 20, y: row * TILE + 20, vx: dir * 58, dir, t: 0,
    fur, furDark: shadeColor(fur, -40), furLight: shadeColor(fur, 35),
  });
}
function spawnFish(map) {
  const tile = map.riverTiles[Math.floor(Math.random() * map.riverTiles.length)];
  ambient.push({ type: 'fish', x: tile.x * TILE + 10 + Math.random() * 12, y: tile.y * TILE + 10 + Math.random() * 12, t: 0, life: 1 + Math.random() * 0.8 });
}
function shadeColor(hex, amount) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) + amount, g = ((num >> 8) & 0xff) + amount, b = (num & 0xff) + amount;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

// ---------------------------------------------------------------- touch controls
function bindHold(el, onDown, onUp) {
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); onDown(); });
  el.addEventListener('pointerup', (e) => { e.preventDefault(); onUp(); });
  el.addEventListener('pointercancel', () => onUp());
  el.addEventListener('pointerleave', () => onUp());
}
function bindTap(el, onTap) {
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); onTap(); });
}
function createTouchControls() {
  const wrap = document.createElement('div'); wrap.id = 'touchControls';
  wrap.addEventListener('contextmenu', (e) => e.preventDefault());
  const dpad = [['dpadUp', 'arrowup', '▲'], ['dpadDown', 'arrowdown', '▼'], ['dpadLeft', 'arrowleft', '◀'], ['dpadRight', 'arrowright', '▶']];
  dpad.forEach(([id, k, label]) => {
    const btn = document.createElement('div'); btn.id = id; btn.className = 'tc-btn'; btn.textContent = label;
    bindHold(btn, () => { keys[k] = true; music.start(); }, () => { keys[k] = false; });
    wrap.appendChild(btn);
  });
  const eBtn = document.createElement('div'); eBtn.id = 'btnE'; eBtn.className = 'tc-btn'; eBtn.textContent = 'E';
  bindTap(eBtn, () => { interactPressed = true; music.start(); }); wrap.appendChild(eBtn);
  const xBtn = document.createElement('div'); xBtn.id = 'btnX'; xBtn.className = 'tc-btn'; xBtn.textContent = 'X';
  bindTap(xBtn, () => { buyPressed = true; music.start(); }); wrap.appendChild(xBtn);
  const mBtn = document.createElement('div'); mBtn.id = 'btnM'; mBtn.className = 'tc-btn'; mBtn.textContent = 'MUTE';
  bindTap(mBtn, () => { music.toggleMute(); music.start(); }); wrap.appendChild(mBtn);
  const skBtn = document.createElement('div'); skBtn.id = 'btnSK8'; skBtn.className = 'tc-btn'; skBtn.textContent = 'SK8';
  bindTap(skBtn, () => { toggleSkate(); music.start(); skBtn.classList.toggle('tc-on', player.skating); }); wrap.appendChild(skBtn);
  const extrasPanel = document.createElement('div'); extrasPanel.id = 'extrasPanel';
  const extras = [['BREW', () => toggleCoffee(), () => player.holdingCoffee], ['YERBA', () => toggleTea(), () => player.holdingTea]];
  extras.forEach(([label, action, isOn]) => {
    const btn = document.createElement('div'); btn.className = 'tc-btn'; btn.textContent = label;
    bindTap(btn, () => { action(); music.start(); btn.classList.toggle('tc-on', isOn()); }); extrasPanel.appendChild(btn);
  });
  wrap.appendChild(extrasPanel);
  const extrasBtn = document.createElement('div'); extrasBtn.id = 'btnExtras'; extrasBtn.className = 'tc-btn'; extrasBtn.textContent = '☰';
  bindTap(extrasBtn, () => { extrasPanel.classList.toggle('open'); music.start(); }); wrap.appendChild(extrasBtn);
  document.body.appendChild(wrap);
}
createTouchControls();
canvas.addEventListener('pointerdown', () => { music.start(); if (state !== 'play') interactPressed = true; });

// ---------------------------------------------------------------- update
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now; update(dt); render(now / 1000);
  requestAnimationFrame(frame);
}
function update(dt) {
  updateAmbient(dt);
  if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }
  if (state === 'splash') { if (interactPressed) { state = 'title'; music.setMenuBreak(true); } }
  else if (state === 'title') { if (interactPressed) { state = 'play'; music.setMenuBreak(false); } }
  else if (state === 'play') {
    movePlayer(dt);
    if (interactPressed) doInteract();
    if (buyPressed) doBuy();
    if (player.tempItemTimer > 0) { player.tempItemTimer -= dt; if (player.tempItemTimer <= 0) { player.tempItemTimer = 0; player.tempItem = null; } }
  } else if (state === 'dialog') {
    if (interactPressed) { dialog.i++; if (dialog.i >= dialog.lines.length) { dialog = null; state = 'play'; } }
  } else if (state === 'record') {
    if (interactPressed) { shownRecord = null; if (worldComplete() && !completedWorlds.has(currentWorldId())) { completedWorlds.add(currentWorldId()); state = 'win'; } else state = 'play'; }
  } else if (state === 'win') { if (interactPressed) state = 'play'; }
  interactPressed = false; buyPressed = false;
}

// ---------------------------------------------------------------- render
function camera(map) {
  const worldW = map.w * TILE, worldH = map.h * TILE;
  let cx = player.x - VIEW_W / 2, cy = player.y - VIEW_H / 2;
  cx = Math.max(0, Math.min(cx, worldW - VIEW_W)); cy = Math.max(0, Math.min(cy, worldH - VIEW_H));
  if (worldW < VIEW_W) cx = (worldW - VIEW_W) / 2; if (worldH < VIEW_H) cy = (worldH - VIEW_H) / 2;
  return [Math.round(cx), Math.round(cy)];
}
function hash2(x, y) { return ((x * 73856093) ^ (y * 19349663)) >>> 0; }
function drawMountains(camX) {
  const layers = [{ color: '#241d38', speed: 0.05, baseY: 130, amp: 32, seed: 0 }, { color: '#332a4c', speed: 0.10, baseY: 155, amp: 48, seed: 700 }, { color: '#443860', speed: 0.18, baseY: 185, amp: 60, seed: 1500 }];
  for (const layer of layers) {
    const period = 240, offset = (camX * layer.speed) % period;
    ctx.fillStyle = layer.color; ctx.beginPath(); ctx.moveTo(-period - offset, VIEW_H);
    for (let sx = -period; sx <= VIEW_W + period; sx += 40) {
      const n = Math.sin((sx + layer.seed) * 0.02) * 0.6 + Math.sin((sx + layer.seed) * 0.045) * 0.4;
      ctx.lineTo(sx - offset, layer.baseY - Math.abs(n) * layer.amp);
    }
    ctx.lineTo(VIEW_W + period - offset, VIEW_H); ctx.closePath(); ctx.fill();
  }
}
function render(time) {
  const map = maps[player.map];
  ctx.fillStyle = '#120e18'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  let camX = 0, camY = 0; if (map.outside) { [camX, camY] = camera(map); drawMountains(camX); }
  ctx.save();
  if (map.outside) ctx.translate(-camX, -camY);
  else {
    const worldW = map.w * TILE, worldH = map.h * TILE, zoom = Math.min(VIEW_W / worldW, VIEW_H / worldH);
    ctx.translate((VIEW_W - worldW * zoom) / 2, (VIEW_H - worldH * zoom) / 2); ctx.scale(zoom, zoom);
  }
  drawTiles(map, time, camX, camY);
  if (map.outside) { drawBuildings(map); if (map.swamp) drawSwampDecorations(time, map, camX, camY); else drawTownDecorations(time); drawAmbient(); }
  if (map.darkClub) drawNectarsInterior(time); if (map.pizzaShop) drawJuniorsInterior(time);
  if (map.keeper) drawKeeper(map.keeper); drawPlayer(time);
  ctx.restore();
  if (state !== 'splash') drawHUD(); if (state === 'splash') drawSplash(); if (state === 'title') drawTitle(time);
  if (state === 'dialog') drawDialog(); if (state === 'record') drawRecordCard(); if (state === 'win') drawWin();
  if (toast) drawToast();
}

function drawTiles(map, time, camX = 0, camY = 0) {
  const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(map.w, Math.ceil((camX + VIEW_W) / TILE)), y1 = Math.min(map.h, Math.ceil((camY + VIEW_H) / TILE));
  for (let ty = y0; ty < y1; ty++) {
    for (let tx = x0; tx < x1; tx++) {
      const px = tx * TILE, py = ty * TILE, ch = map.grid[ty][tx], h = hash2(tx, ty);
      if (map.outside) {
        ctx.fillStyle = (h % 7 === 0) ? (map.palette ? map.palette.groundB : '#3e7c34') : (map.palette ? map.palette.groundA : '#468a3a');
        ctx.fillRect(px, py, TILE, TILE);
      } else { ctx.fillStyle = map.floor; ctx.fillRect(px, py, TILE, TILE); }
      if (ch === 'r') { ctx.fillStyle = '#9a98a0'; ctx.fillRect(px, py, TILE, TILE); }
      else if (ch === '#') drawTree(px, py, map);
      else if (ch === '~') { ctx.fillStyle = map.palette ? map.palette.water : '#3060b0'; ctx.fillRect(px, py, TILE, TILE); }
      else if (ch === 'b') { ctx.fillStyle = '#8a6a42'; ctx.fillRect(px, py + 2, TILE, TILE - 4); }
      else if (ch === 'f') { ctx.fillStyle = '#3a2c18'; ctx.fillRect(px + 3, py + 7, TILE - 6, TILE - 7); }
      else if (ch === 'c' || ch === 'C') drawCrate(px, py, map.crates[key(tx, ty)]);
      else if (ch === 'W') { ctx.fillStyle = map.wallColor; ctx.fillRect(px, py, TILE, TILE); }
      else if (ch === 'T') { ctx.fillStyle = '#6a4a2a'; ctx.fillRect(px + 1, py + 6, TILE - 2, TILE - 7); }
      else if (ch === 'J') { ctx.fillStyle = '#b03030'; ctx.fillRect(px + 4, py, TILE - 8, TILE); }
      else if (ch === 'E') { ctx.fillStyle = '#7a3a20'; ctx.fillRect(px, py, TILE, TILE); }
    }
  }
}
function drawTree(px, py, map) {
  const p = map.palette;
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(px + 16, py + 29, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p ? p.trunk : '#6a4a2a'; ctx.fillRect(px + 13, py + 20, 6, 10);
  ctx.fillStyle = p ? p.leafMid : '#38782e'; ctx.fillRect(px + 4, py + 10, 24, 12); ctx.fillRect(px + 8, py + 2, 16, 14);
}
function drawSwampDecorations(time, map, camX, camY) {
  const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(map.w, Math.ceil((camX + VIEW_W) / TILE)), y1 = Math.min(map.h, Math.ceil((camY + VIEW_H) / TILE));
  for (let ty = y0; ty < y1; ty++)
    for (let tx = x0; tx < x1; tx++) {
      if (map.grid[ty][tx] !== '~') continue;
      const h = hash2(tx, ty); if (h % 7 === 0) { ctx.fillStyle = '#3f7a35'; ctx.beginPath(); ctx.ellipse(tx * TILE + 15, ty * TILE + 18, 7, 4, 0.2, 0, Math.PI * 2); ctx.fill(); }
    }
}
function drawCrate(px, py, data) {
  ctx.fillStyle = '#8a5a30'; ctx.fillRect(px + 2, py + 6, TILE - 4, TILE - 8);
  const empty = data && data.record && collected.has(data.record);
  ctx.fillStyle = empty ? '#5a3a1e' : '#c04040'; ctx.fillRect(px + 6, py + 2, 5, 8);
}
function drawBuildings(map) {
  for (const b of map.buildings) {
    const px = b.x * TILE, py = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
    ctx.fillStyle = b.wall; ctx.fillRect(px, py, w, h);
    ctx.fillStyle = b.roof; ctx.fillRect(px, py, w, TILE + 8);
    const dx = b.doorX * TILE; ctx.fillStyle = '#3a2414'; ctx.fillRect(dx + 4, py + h - TILE + 2, TILE - 8, TILE - 2);
    ctx.textAlign = 'center'; ctx.fillStyle = '#f9f2e0'; ctx.font = 'bold 12px monospace'; ctx.fillText(b.name, px + w / 2, py + 24);
  }
}
function drawTownDecorations(time) {
  const x = 3 * TILE, y = 18 * TILE + 2;
  ctx.fillStyle = '#41454a'; ctx.fillRect(x + 7, y + 8, 20, 25);
}
function drawKeeper(k) {
  const px = k.x * TILE, py = k.y * TILE;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px + 8, py + 26, 16, 4);
  ctx.fillStyle = k.shirt; ctx.fillRect(px + 8, py + 12, 16, 14);
  ctx.fillStyle = k.skin; ctx.fillRect(px + 10, py + 2, 12, 11);
}
function drawPlayer(time) {
  const row = DIR_ROW[player.dir];
  let col = 0; if (player.moving) col = [0, 1, 0, 2][Math.floor(player.animT * 7) % 4];
  const footY = player.y + 6;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(player.x - 11, footY - 3, 22, 5);
  if (ricoImg.complete && ricoImg.naturalWidth) {
    ctx.drawImage(ricoImg, col * SHEET_CW, row * SHEET_CH, SHEET_CW, SHEET_CH, Math.round(player.x - SPR_W / 2), Math.round(footY - SPR_H - (player.skating ? 4 : 0)), SPR_W, SPR_H);
  }
  const hx = player.x + (player.dir === 'left' ? -13 : 13), hy = footY - SPR_H * 0.5;
  if (player.holdingCoffee || player.tempItem === 'coldBrew') { ctx.fillStyle = '#3a2617'; ctx.fillRect(hx - 3, hy + 3, 6, 9); }
  if (player.holdingTea) { ctx.fillStyle = '#e8c020'; ctx.fillRect(hx - 4, hy, 8, 14); }
}
function drawNectarsInterior(time) {}
function drawJuniorsInterior(time) {}

// ---------------------------------------------------------------- UI
function drawHUD() {
  ctx.fillStyle = 'rgba(10,8,14,0.75)'; ctx.fillRect(8, 8, 320, 44);
  worldPadOrder().forEach((id, i) => {
    const r = worldRecords()[id]; ctx.fillStyle = collected.has(id) ? r.color : '#262030';
    ctx.fillRect(88 + i * 46, 14, 38, 30);
  });
  if (state === 'play') {
    const target = facingTarget();
    if (target) pill(target.type === 'crate' ? '[E] DIG' : '[E] TALK', VIEW_W / 2, VIEW_H - 34);
  }
}
function pill(text, cx, cy) {
  ctx.font = 'bold 13px monospace'; const w = ctx.measureText(text).width + 24;
  ctx.fillStyle = 'rgba(10,8,14,0.8)'; ctx.fillRect(cx - w / 2, cy - 14, w, 26);
  ctx.fillStyle = '#f4ecd8'; ctx.textAlign = 'center'; ctx.fillText(text, cx, cy + 4);
}
function drawToast() { ctx.globalAlpha = Math.min(1, toast.t * 3); pill(toast.text, VIEW_W / 2, 80); ctx.globalAlpha = 1; }
function drawDialog() {
  ctx.fillStyle = 'rgba(10,8,14,0.92)'; ctx.fillRect(24, VIEW_H - 166, VIEW_W - 48, 150);
  ctx.textAlign = 'left'; ctx.font = 'bold 16px monospace'; ctx.fillStyle = '#e0b040'; ctx.fillText(dialog.name, 44, VIEW_H - 134);
  ctx.fillStyle = '#f4ecd8'; ctx.font = '19px monospace'; ctx.fillText(dialog.lines[dialog.i], 44, VIEW_H - 104);
}
function drawRecordCard() {
  const r = worldRecords()[shownRecord]; ctx.fillStyle = 'rgba(6,4,10,0.85)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center'; ctx.font = 'bold 18px monospace'; ctx.fillStyle = '#f4ecd8'; ctx.fillText('RECORD FOUND: ' + r.title, VIEW_W / 2, VIEW_H / 2);
}
function drawSplash() {
  if (splashImg.complete) ctx.drawImage(splashImg, 0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center'; ctx.fillStyle = '#e0b040'; ctx.font = 'bold 18px monospace'; ctx.fillText('PRESS E TO BEGIN', VIEW_W / 2, VIEW_H - 40);
}

// ---------------------------------------------------------------- updated title screen
let titleMenuKeyed = null;
function buildKeyedTitleMenu() {
  if (titleMenuKeyed || !titleMenuImg.complete) return;
  const c = document.createElement('canvas'); c.width = titleMenuImg.width; c.height = titleMenuImg.height;
  const g = c.getContext('2d'); g.drawImage(titleMenuImg, 0, 0);
  const id = g.getImageData(0, 0, c.width, c.height), d = id.data;
  for (let i = 0; i < d.length; i += 4) { if (d[i+1] > 140 && (d[i+1] - d[i+2]) > 90) d[i+3] = 0; }
  g.putImageData(id, 0, 0); titleMenuKeyed = c;
}

function drawTitle(time) {
  buildKeyedTitleMenu();

  // 1. Draw Sky Background
  if (titleSkyImg.complete && titleSkyImg.naturalWidth) {
    const tw = titleSkyImg.naturalWidth * (VIEW_H / titleSkyImg.naturalHeight);
    const off = (time * 16) % tw;
    ctx.fillStyle = '#9fd0ee'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    for (let x = -off; x < VIEW_W; x += tw) ctx.drawImage(titleSkyImg, x, 0, tw, VIEW_H);
  } else { ctx.fillStyle = '#120e18'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }

  // 2. Draw Chroma-Keyed Menu Art
  if (titleMenuKeyed) {
    const mw = titleMenuKeyed.width, mh = titleMenuKeyed.height, s = Math.min(VIEW_W / mw, VIEW_H / mh);
    ctx.drawImage(titleMenuKeyed, (VIEW_W - mw * s) / 2, (VIEW_H - mh * s) / 2, mw * s, mh * s);
  } else {
    ctx.textAlign = 'center'; ctx.fillStyle = '#e0b040'; ctx.font = 'bold 44px monospace';
    ctx.fillText("RICO'S VINYL QUEST", VIEW_W / 2, 130);
  }

  // 3. Equipment & Actions Legend
  const boxW = 440, boxH = 160, bx = (VIEW_W - boxW) / 2, by = VIEW_H - boxH - 75;
  ctx.fillStyle = 'rgba(20, 15, 25, 0.8)'; ctx.fillRect(bx, by, boxW, boxH);
  ctx.strokeStyle = '#e0b040'; ctx.lineWidth = 2; ctx.strokeRect(bx + 2, by + 2, boxW - 4, boxH - 4);
  ctx.textAlign = 'left'; ctx.fillStyle = '#e0b040'; ctx.font = 'bold 12px monospace';
  ctx.fillText('--- EQUIPMENT & ACTIONS ---', bx + 20, by + 25);
  const controls = [
    ['[B] SKATEBOARD', 'Toggle skating speed (Outdoors)'],
    ['[C] COLD BREW',  'Toggle Cold Brew boost'],
    ['[Y] YERBA MATE', 'Toggle Yerba Mate boost'],
    ['[X] BUY TREAT',  'Purchase from Vendor Carts'],
    ['[E] INTERACT',   'Talk / Dig Crates / Confirm'],
    ['[M] MUTE',       'Toggle Music']
  ];
  ctx.font = '11px monospace';
  controls.forEach((ctrl, i) => {
    const lineY = by + 50 + (i * 18); ctx.fillStyle = '#f4ecd8'; ctx.fillText(ctrl[0], bx + 20, lineY);
    ctx.fillStyle = '#9a90a8'; ctx.fillText('.... ' + ctrl[1], bx + 130, lineY);
  });

  ctx.textAlign = 'center'; ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#e0b040' : '#f4ecd8';
  ctx.font = 'bold 16px monospace'; ctx.fillText('- PRESS E OR TAP TO START -', VIEW_W / 2, VIEW_H - 35);
}

function drawWin() { ctx.fillStyle = 'rgba(8,6,12,0.88)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
requestAnimationFrame(frame);
})();
