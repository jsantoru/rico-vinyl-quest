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
    /* Minimal touch layout: every control is pulled into the true screen
       corners and kept small + low-opacity at rest so it stays out of the
       way of the map. Buttons brighten on touch for clear feedback. */
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
    /* compact d-pad, tucked into the bottom-left corner */
    #dpadUp    { left: 56px; bottom: 66px; width: 46px; height: 46px; font-size: 15px; }
    #dpadDown  { left: 56px; bottom: 14px; width: 46px; height: 46px; font-size: 15px; }
    #dpadLeft  { left: 4px;  bottom: 40px; width: 46px; height: 46px; font-size: 15px; }
    #dpadRight { left: 108px; bottom: 40px; width: 46px; height: 46px; font-size: 15px; }
    /* action cluster, tucked into the bottom-right corner. "Extras" sits
       where a fourth always-visible button would've gone, and instead
       pops a small stacked menu open above it on tap — keeps the resting
       footprint identical to just E + MUTE + one more button. */
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
// iPadOS Safari ignores the `user-scalable=no` viewport hint, and its pinch-
// zoom / double-tap-zoom gestures are recognized from raw touch events at the
// WebKit level, not from the Pointer Events our controls use — so
// preventDefault() inside pointerdown handlers doesn't stop them. Fast taps
// during play (mashing E, tapping through dialog, etc.) can land close enough
// together for Safari to read them as a double-tap-zoom. Block both gesture
// paths explicitly.
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
// Each world owns its own 5 records + pad order. To add a new world, add an
// entry here (a records object + a 5-slot padOrder) and set `world` on the maps
// that belong to it. The HUD, record card, win screen and music sampler all
// derive from the CURRENT world automatically, so adding a world gives you a
// fresh set of 5 to find. Each record's `layer` should be one of the sampler
// types the music engine already knows: drums / bass / horns / vox / lead.
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
  // The swamp — a template overworld, not yet connected to any other map.
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
  },
  // ADD MORE WORLDS HERE, e.g.:
  // subway: {
  //   name: 'The Subway',
  //   records: { /* ...5 records, each with layer drums/bass/horns/vox/lead... */ },
  //   padOrder: ['a','b','c','d','e'],
  // },
};

// Runtime helpers — resolve the CURRENT world from the map the player is in.
// (They reference `maps`/`collected`, which are declared later in the file;
// that's fine because these are only *called* at runtime.)
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
  music.start(); // audio needs a user gesture
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

  const groove = building(4, 3, 7, 4, 'Green Door Studio', '#76503a', '#4e3328', 9); // door moved to right
  const wax    = building(28, 3, 7, 4, 'Hey Bud', '#bf4f6f', '#93384f');
  const diner  = building(4, 14, 5, 4, 'Kountry Kart Deli', '#c07a38', '#96591f'); // smaller - 5 tiles wide
  const nectars = building(9, 14, 4, 6, 'Nectars', '#2a2a3a', '#1a1a2a'); // taller building next to deli
  const thrift = building(28, 14, 5, 4, 'Pure Pop Records', '#3f8fbf', '#2a6a93'); // smaller to make room
  const juniors = building(33, 14, 4, 4, "Junior's", '#d84030', '#a83020'); // pizza shop

  // park + winding river, avoiding the building footprints
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

  // second bridge across the river near the bottom of the map, giving the
  // player another way to cross to the other side (rows 9-10 are the first)
  const lowerBridgeRow = 20;
  for (let x = 1; x < W - 1; x++) {
    if (g[lowerBridgeRow][x] === '~') g[lowerBridgeRow][x] = 'b';
  }

  const trees = [[3,20],[5,22],[7,19],[13,21],[15,23],[3,23],[10,23],[16,19],[36,20],[34,23],[9,12],[14,13],[25,12],[36,12],[2,12],[37,7],[2,7],[24,23],[13,6],[26,6]];
  for (const [tx, ty] of trees) if (g[ty][tx] === '.') g[ty][tx] = '#';

  // flea market corner: stalls (fences) + crates, one holds the white label
  // NOTE: skip the tile directly above the Pure Pop Records door so the fence
  // doesn't block access to it.
  for (let x = 25; x <= 31; x++) { if (x === thrift.doorX) continue; g[18][x] = 'f'; }
  for (let y = 18; y <= 22; y++) g[y][32] = 'f';
  g[20][26] = 'c'; g[21][28] = 'c'; g[20][30] = 'c';

  const map = {
    id: 'town', world: 'town', w: W, h: H, grid: g, outside: true, buildings,
    doors: {}, crates: {}, npcs: [], riverTiles,
    // ambient life lanes for this map (which road rows each spawns on)
    ambient: { bikeRows: [9, 10], walkerRow: 12, dogRow: 23 },
  };
  // Talkable townsfolk: Gary (the old hippy guitarist by the deli garbage
  // can) and Willie (the painter out front of Green Door Studio).
  map.npcs = [
    { id: 'gary', tx: 5, ty: 19, name: 'GARY',
      lines: [
        'Hey there, friend, name is Gary. Been playing guitar by this can since before you were born. Good vibes only.',
        'You ever really listen to "Terrapin Station"? Like really sit with it? Man, 1977, Cornell, no wait, the Barton Hall run, I mean the studio cut, well actually...',
        'That one bootleg with the thirty-minute "Dark Star" — okay so it is technically two "Dark Star"s stitched together, but hear me out —',
        'Oh, and do not get me started on Phish. Trey is a genius. That "Tweezer" into "Piper" at the Deer Creek show? I was THERE, man, I was—',
        'Anyway... peace! I am out!'
      ] },
    { id: 'willie', tx: 5, ty: 8, name: 'WILLIE',
      lines: [
        'Hey now, welcome to the wall! I\'m Willie — painter, free spirit, full of love and creativity.',
        'I paint what I feel about the day — the state of things, the color of people, all of it.',
        'Stay a while. Hang, create, talk some good bullshit about life. This wall\'s got room for one more coat.',
        'Every color\'s a story, and yours is one of the good ones.'
      ] },
  ];
  map.crates[key(26, 20)] = { junkSeed: 3 };
  map.crates[key(28, 21)] = { record: 'white' };
  map.crates[key(30, 20)] = { junkSeed: 6 };
  return { map, doors: { groove, wax, diner, nectars, thrift, juniors } };
}

// small deterministic RNG so the swamp layout is identical on every load
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Template world — a murky swamp. NOT connected to anything yet; add a
// `transitions` entry later to wire it to the town. Legend: '~' murky water
// (solid), 'b' boardwalk (walkable), '#' swamp tree (solid), 'c' crate.
function makeSwamp() {
  const W = 44, H = 28;
  const g = blankGrid(W, H, '~');          // start as all water
  const rng = mulberry32(90240214);

  // boardwalk trunk + vertical spurs (the walkable paths through the water)
  for (let x = 0; x < W; x++) g[12][x] = 'b';
  for (let y = 5; y < 22; y++) { g[y][8] = 'b'; g[y][34] = 'b'; }

  // carve muddy ground islands
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

  // sprinkle swamp trees over the mud
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++)
      if (g[y][x] === '.' && rng() < 0.10) g[y][x] = '#';

  // crates: five hidden records + a few junk ones
  const crates = {};
  const crateDefs = [
    [20, 12, { record: 'moss' }],
    [30, 12, { record: 'frog' }],
    [38, 12, { junkSeed: 1 }],
    [6, 12,  { junkSeed: 2 }],
    [8, 9,   { record: 'choir' }],
    [34, 7,  { record: 'swampdrum' }],
    [17, 18, { junkSeed: 0 }],
    [34, 17, { record: 'honeysuckle' }],
    [14, 12, { junkSeed: 3 }],
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
    ambient: { bikeRows: [], walkerRow: -1, dogRow: -1 },  // fish only, no traffic
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
              'You already know: Third Thursdays, the monthly hip hop night. The whole Anthill Collective moves when the bass drops.',
              'I\'m with The Anthill Collective — the crew keeps the color on the walls and the sessions open.',
              'Support the independent hustle, family. We\'re all building our own creative thing in this world.',
              'We cut a few tracks back here between mural sessions. A Static Groove reel ended up in a crate somewhere.',
              'Try digging through the crates against the LEFT wall — should still be under some old spray cans.'],
      foundLine: 'Elm Street Funk?! I thought that tape got lost under the primer. Go make some noise with it.' },
    crates: [ { record: 'elm' }, { junkSeed: 0 }, { junkSeed: 1 }, { junkSeed: 2 } ],
  }),
  wax: makeShop('wax', {
    floor: '#5f4a6a', plank: '#4f3c58', wallColor: '#3a2a44',
    keeper: { name: 'DEE', shirt: '#d05a8a', skin: '#c89a72',
      lines: ['Welcome to Hey Bud — water your soul, or just browse.',
              'Funny enough, a Velvet Horns pressing came in tangled up with a shipment of hanging planters.',
              'Should still be in a crate on the RIGHT side, behind the ferns.'],
      foundLine: 'Midnight Stab, right here at Hey Bud? Those horns are gonna grow on you.' },
    crates: [ { junkSeed: 3 }, { junkSeed: 4 }, { record: 'stab' }, { junkSeed: 5 } ],
  }),
  diner: makeShop('diner', {
    floor: '#b8a08a', plank: '#a89078', wallColor: '#7a4a3a',
    keeper: { name: 'ROSIE', shirt: '#e0e0e0', skin: '#e8b890',
      lines: ['Grab a stool, hon. Kitchen’s slow today but the jukebox never stops.',
              'My old band pressed a 45 back in ’68 — Cherry Cola Bounce. We were something else.',
              'Spare copies ended up in a crate in the BACK of the deli, behind the pickle barrels.'],
      foundLine: 'Well I’ll be. Make that bassline bounce again, sugar.' },
    crates: [ { junkSeed: 6 }, { junkSeed: 7 }, { junkSeed: 0 }, { junkSeed: 1 }, { record: 'cola' } ],
    jukebox: true,
  }),
  thrift: makeShop('thrift', {
    floor: '#6a8a6a', plank: '#587a58', wallColor: '#3a4a3a',
    keeper: { name: 'ZEKE', shirt: '#70b060', skin: '#9a7050',
      lines: ['Welcome to Pure Pop — new arrivals, deep cuts, the whole crate-digger’s dream.',
              'Some church choir gospel came in from an estate sale — real rare pressing.',
              'Might be filed on the RIGHT side. Might be misfiled entirely, honestly.'],
      foundLine: 'Galactic Hallelujah?! I nearly priced that thing at a dollar. Glad you found it first.' },
    crates: [ { junkSeed: 2 }, { junkSeed: 3 }, { junkSeed: 4 }, { record: 'choir' } ],
  }),
  nectars: makeShop('nectars', {
    floor: '#1a1520', plank: '#0f0a15', wallColor: '#2a1a2f',
    keeper: { name: 'JADE', shirt: '#8a2040', skin: '#b08a72',
      lines: ['Welcome to Nectar\'s! Best gravy fries in town, live music every night.',
              'Vinyl? We don\'t stock records, but I know the scene.',
              'Try Pure Pop Records for rare finds, or Hey Bud — they get weird stuff with plant shipments.',
              'Green Door Studio might have some old session reels too.'],
      foundLine: 'Enjoy the show! Those fries are legendary.' },
    crates: [],
    darkClub: true,
  }),
  juniors: makeShop('juniors', {
    floor: '#c8a898', plank: '#b89888', wallColor: '#e8d8c8',
    keeper: { name: 'TONY', shirt: '#e8e8e8', skin: '#d8b898',
      lines: ['Hey! Welcome to Junior\'s — best slice in town, no question.',
              'Vinyl records? Nah, we sling pizza here, not platters.',
              'But I\'ll tell ya — Kountry Kart Deli has some old jukebox connections.',
              'And that art studio down the street? Those painters are always spinning something weird.'],
      foundLine: 'Grab a slice before you go. You\'ll need the energy!' },
    crates: [],
    pizzaShop: true,
  }),
};

// door wiring: town door tile -> shop spawn; shop exit tile -> town spawn
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
let state = 'splash'; // splash | title | play | dialog | record | win
let dialog = null;   // { name, lines, i }
let shownRecord = null;
const completedWorlds = new Set(); // worlds whose 5 records have all been found
let toast = null;    // { text, t }

function toggleSkate() {
  if (state !== 'play' || !maps[player.map].outside) return;
  player.skating = !player.skating;
  toast = { text: player.skating ? 'Skateboard: ON' : 'Skateboard: OFF', t: 1.2 };
}

// Cold brew and iced tea share the same hand, so picking one up puts the
// other down — just like Rico only has two hands to work with.
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
    const pop = (s % 4 === 3); // occasional louder vinyl pop
    const gain = pop ? 0.05 : 0.016;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (pop ? 0.05 : stepDur * 0.6));
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + (pop ? 0.06 : stepDur));
  },

  pump() {
    const stepDur = 60 / this.BPM / 4;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      this.schedule(this.step, this.nextTime, stepDur);
      this.step = (this.step + 1) % 32;
      this.nextTime += stepDur;
    }
  },
  schedule(gs, t, stepDur) {
    const s = gs % 16;
    // old, dusty vinyl drum break while on the title screen
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
    } else if (L.has('tick') && s % 4 === 0) {
      this.hat(t, false, 0.028);
    }
    if (L.has('bass')) {
      const pat = [[0,45,2],[3,45,1],[6,48,2],[8,50,2],[11,45,1],[14,43,2]];
      for (const [ps, n, d] of pat)
        if (ps === s) this.note(t, 'square', n, d * stepDur, 0.10);
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
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.13);
  },
  hat(t, open, gain) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = this.ctx.createGain();
    const dur = open ? 0.22 : 0.045;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.01);
  },
  note(t, type, midi, dur, gain, release = 0.02, vibrato = false) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    if (vibrato) {
      const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
      lfo.frequency.value = 5.2; lg.gain.value = 7;
      lfo.connect(lg); lg.connect(o.detune);
      lfo.start(t); lfo.stop(t + dur + release);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.015);
    g.gain.setValueAtTime(gain, t + dur);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur + release);
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
// Vendor carts are cosmetic sprites (drawn in drawTownDecorations), not part
// of the tile grid, so they're detected by standing near a point in front of
// the counter rather than by facing a specific tile.
const VENDOR_CARTS = [
  // coffee cart just outside Pure Pop Records
  { id: 'coldbrew', map: 'town', label: 'BUY A COLD BREW', x: 27 * TILE + 5 + 28, y: 18 * TILE + 4 + 40, radius: 42 },
  // ice cream van tucked in town's lower-right corner
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
    if (ch === 'T' && map.keeper && Math.abs(tx - map.keeper.x) <= 2 && ty === 2)
      return { type: 'keeper', data: map.keeper };
    if (ch === 'J') return { type: 'jukebox' };
    if (map.npcs) {
      const np = map.npcs.find(n => n.tx === tx && n.ty === ty);
      if (np) return { type: 'npc', data: np };
    }
  }
  const cart = VENDOR_CARTS.find(c => c.map === player.map &&
    Math.hypot(player.x - c.x, player.y - c.y) < c.radius);
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
    dialog = { name: 'JUKEBOX', lines: ['B7: "Cherry Cola Bounce". The button is worn smooth from decades of plays.'], i: 0 };
    state = 'dialog';
  } else if (target.type === 'npc') {
    const n = target.data;
    dialog = { name: n.name, lines: n.lines, i: 0 };
    state = 'dialog';
  }
}

// Buying from a vendor cart pops the item into Rico's hand for a few
// seconds, just like the other held items (cold brew / iced tea).
function doBuy() {
  if (state !== 'play') return;
  const target = facingTarget();
  if (!target || target.type !== 'cart') return;
  if (target.data.id === 'icecream') {
    player.tempItem = 'iceCream';
    player.tempItemTimer = 6;
    toast = { text: 'Ice Cream!', t: 1.2 };
  } else if (target.data.id === 'coldbrew') {
    player.tempItem = 'coldBrew';
    player.tempItemTimer = 6;
    toast = { text: 'Cold Brew!', t: 1.2 };
  }
}

// ---------------------------------------------------------------- ambient town life (people, bikes, dogs, fish)
const ambient = [];
const ambientTimers = { bike: 4, walker: 3, dog: 6, fish: 2 };

function updateAmbient(dt) {
  const map = maps[player.map];
  const amb = map && map.ambient;
  if (!amb) { if (ambient.length) ambient.length = 0; return; }

  ambientTimers.bike -= dt;
  if (ambientTimers.bike <= 0) { spawnBike(map); ambientTimers.bike = 7 + Math.random() * 9; }
  ambientTimers.walker -= dt;
  if (ambientTimers.walker <= 0) { spawnWalker(map); ambientTimers.walker = 5 + Math.random() * 8; }
  ambientTimers.dog -= dt;
  if (ambientTimers.dog <= 0) { spawnDog(map); ambientTimers.dog = 9 + Math.random() * 10; }
  ambientTimers.fish -= dt;
  if (ambientTimers.fish <= 0 && map.riverTiles && map.riverTiles.length) {
    spawnFish(map); ambientTimers.fish = 2 + Math.random() * 3;
  }

  for (let i = ambient.length - 1; i >= 0; i--) {
    const a = ambient[i];
    a.t += dt;
    if (a.type === 'fish') {
      if (a.t > a.life) ambient.splice(i, 1);
      continue;
    }
    a.x += a.vx * dt;
    if (a.x < -50 || a.x > map.w * TILE + 50) ambient.splice(i, 1);
  }
}

// Spawn helpers now read from the current map, so any overworld with an
// `ambient` config gets its own life without hardcoding 'town'.
function spawnBike(map) {
  const amb = map.ambient || {};
  const rows = amb.bikeRows;
  if (!rows || !rows.length) return;   // no bike lanes -> no bikes
  const dir = Math.random() < 0.5 ? 1 : -1;
  const row = rows[Math.floor(Math.random() * rows.length)];
  ambient.push({ type: 'bike', x: dir > 0 ? -30 : map.w * TILE + 30, y: row * TILE + 16, vx: dir * 115, dir, t: 0 });
}
function spawnWalker(map) {
  const amb = map.ambient || {};
  const dir = Math.random() < 0.5 ? 1 : -1;
  const shirts = ['#c86a3a', '#4a7ab0', '#7a4a9a', '#3a9a5a', '#c2a23a', '#3a8a8a'];
  const skins = ['#b87954', '#8a5a34', '#d8a878', '#e8c8a0'];
  const hairs = ['#2a2018', '#4a3020', '#6a4020', '#8a8a8a', '#c8a860'];
  const backpacks = ['#4a5a3a', '#8a4030', '#2a3a5a'];
  const row = amb.walkerRow !== undefined ? amb.walkerRow : 12;
  if (row < 0) return;                  // no walker lane -> no walkers
  const shirt = shirts[Math.floor(Math.random() * shirts.length)];
  ambient.push({
    type: 'walker', x: dir > 0 ? -20 : map.w * TILE + 20, y: row * TILE + 24,
    vx: dir * 44, dir, t: 0,
    shirt, shirtDark: shadeColor(shirt, -45), shirtLight: shadeColor(shirt, 40),
    skin: skins[Math.floor(Math.random() * skins.length)],
    pants: '#3a3a46', shoe: '#241c18',
    hair: hairs[Math.floor(Math.random() * hairs.length)],
    backpack: Math.random() < 0.35 ? backpacks[Math.floor(Math.random() * backpacks.length)] : null,
  });
}
function spawnDog(map) {
  const amb = map.ambient || {};
  const dir = Math.random() < 0.5 ? 1 : -1;
  const row = amb.dogRow !== undefined ? amb.dogRow : 23;
  if (row < 0) return;                  // no dog lane -> no dogs
  const furs = ['#a9713f', '#3a2e26', '#e8d8b8', '#8a5a34'];
  const fur = furs[Math.floor(Math.random() * furs.length)];
  ambient.push({
    type: 'dog', x: dir > 0 ? -20 : map.w * TILE + 20, y: row * TILE + 20, vx: dir * 58, dir, t: 0,
    fur, furDark: shadeColor(fur, -40), furLight: shadeColor(fur, 35),
  });
}
function spawnFish(map) {
  const tile = map.riverTiles[Math.floor(Math.random() * map.riverTiles.length)];
  ambient.push({
    type: 'fish',
    x: tile.x * TILE + 10 + Math.random() * 12,
    y: tile.y * TILE + 10 + Math.random() * 12,
    t: 0, life: 1 + Math.random() * 0.8,
  });
}

// Darken (negative percent) or lighten (positive percent) a '#rrggbb' color.
// Used to build the shadow/highlight tones for the layered pixel-art look.
function shadeColor(hex, amount) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0xff) + amount;
  let b = (num & 0xff) + amount;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

function drawAmbient() {
  for (const a of ambient) {
    if (a.type === 'bike') drawBikeActor(a);
    else if (a.type === 'walker') drawWalkerActor(a);
    else if (a.type === 'dog') drawDogActor(a);
    else if (a.type === 'fish') drawFishActor(a);
  }
}

function drawWheel(cx, cy, spin) {
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(spin) * 6, cy + Math.sin(spin) * 6);
  ctx.lineTo(cx - Math.cos(spin) * 6, cy - Math.sin(spin) * 6);
  ctx.stroke();
}

function drawBikeActor(a) {
  const flip = a.dir < 0;
  ctx.save();
  ctx.translate(a.x, a.y);
  if (flip) ctx.scale(-1, 1);
  const spin = a.t * 10;
  ctx.strokeStyle = '#1c1a20';
  ctx.lineWidth = 2;
  drawWheel(-10, 8, spin);
  drawWheel(10, 8, spin);
  ctx.strokeStyle = '#3f6fae';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-10, 8); ctx.lineTo(0, -4); ctx.lineTo(10, 8);
  ctx.moveTo(0, -4); ctx.lineTo(-4, -12);
  ctx.stroke();
  ctx.fillStyle = '#d0703c';
  ctx.fillRect(-5, -20, 9, 10);
  ctx.fillStyle = '#b87954';
  ctx.fillRect(-4, -28, 7, 8);
  ctx.restore();
}

function drawWalkerActor(a) {
  const flip = a.dir < 0;
  ctx.save();
  ctx.translate(a.x, a.y);
  if (flip) ctx.scale(-1, 1);
  const stride = Math.sin(a.t * 8) * 3;
  const outline = '#1c140f';
  const backSwing = -stride * 0.4, frontSwing = stride * 0.4;

  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-8, 14, 16, 4);

  // back leg (outline, then pants, then shoe)
  ctx.fillStyle = outline;
  ctx.fillRect(-6, 1 + backSwing, 6, 14);
  ctx.fillStyle = a.pants;
  ctx.fillRect(-5, 2 + backSwing, 4, 10);
  ctx.fillStyle = a.shoe;
  ctx.fillRect(-5, 11 + backSwing, 4, 3);

  // front leg
  ctx.fillStyle = outline;
  ctx.fillRect(0, 1 + frontSwing, 6, 14);
  ctx.fillStyle = a.pants;
  ctx.fillRect(1, 2 + frontSwing, 4, 10);
  ctx.fillStyle = a.shoe;
  ctx.fillRect(1, 11 + frontSwing, 4, 3);

  // optional backpack, tucked behind the torso
  if (a.backpack) {
    ctx.fillStyle = outline;
    ctx.fillRect(-10, -8, 6, 11);
    ctx.fillStyle = a.backpack;
    ctx.fillRect(-9, -7, 4, 9);
  }

  // torso: outline, base shirt, trailing-side shadow, leading-side highlight
  ctx.fillStyle = outline;
  ctx.fillRect(-7, -9, 14, 13);
  ctx.fillStyle = a.shirt;
  ctx.fillRect(-6, -8, 12, 11);
  ctx.fillStyle = a.shirtDark;
  ctx.fillRect(-6, -8, 4, 11);
  ctx.fillStyle = a.shirtLight;
  ctx.fillRect(3, -8, 3, 4);

  // arms, swinging opposite the legs
  ctx.fillStyle = a.skin;
  ctx.fillRect(-8, -6 + frontSwing * 0.5, 2, 7);
  ctx.fillRect(6, -6 + backSwing * 0.5, 2, 7);

  // head: outline, skin, hair/cap with a shaded brim line
  ctx.fillStyle = outline;
  ctx.fillRect(-5, -17, 10, 10);
  ctx.fillStyle = a.skin;
  ctx.fillRect(-4, -16, 8, 8);
  ctx.fillStyle = a.hair;
  ctx.fillRect(-4, -17, 8, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(-4, -13, 8, 2);

  ctx.restore();
}

function drawDogActor(a) {
  const flip = a.dir < 0;
  ctx.save();
  ctx.translate(a.x, a.y);
  if (flip) ctx.scale(-1, 1);
  const legOff = Math.sin(a.t * 10) * 2;
  const outline = '#241a12';

  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-9, 8, 18, 3);

  // legs: outline then darker fur
  ctx.fillStyle = outline;
  ctx.fillRect(-8, 1 + legOff, 4, 8);
  ctx.fillRect(3, 1 - legOff, 4, 8);
  ctx.fillStyle = a.furDark;
  ctx.fillRect(-7, 2 + legOff, 2, 6);
  ctx.fillRect(4, 2 - legOff, 2, 6);

  // tail
  ctx.fillStyle = outline;
  ctx.fillRect(-12, -3, 5, 4);
  ctx.fillStyle = a.fur;
  ctx.fillRect(-11, -2, 4, 3);

  // body: outline, base fur, top highlight, belly shadow
  ctx.fillStyle = outline;
  ctx.fillRect(-10, -5, 20, 10);
  ctx.fillStyle = a.fur;
  ctx.fillRect(-9, -4, 18, 8);
  ctx.fillStyle = a.furLight;
  ctx.fillRect(-9, -4, 18, 2);
  ctx.fillStyle = a.furDark;
  ctx.fillRect(-9, 1, 18, 3);

  // head: outline, fur, ear shading, snout with a small nose dot
  ctx.fillStyle = outline;
  ctx.fillRect(6, -9, 8, 8);
  ctx.fillStyle = a.fur;
  ctx.fillRect(7, -8, 6, 6);
  ctx.fillStyle = a.furDark;
  ctx.fillRect(7, -9, 3, 3);
  ctx.fillStyle = outline;
  ctx.fillRect(12, -3, 3, 3);
  ctx.fillStyle = '#2a1c14';
  ctx.fillRect(13, -2, 1, 1);

  ctx.restore();
}

function drawFishActor(a) {
  const p = a.t / a.life;
  const alpha = p < 0.2 ? p / 0.2 : p > 0.8 ? (1 - p) / 0.2 : 1;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = '#e8d060';
  ctx.beginPath();
  ctx.ellipse(a.x, a.y, 5, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(a.x - 5, a.y);
  ctx.lineTo(a.x - 8, a.y - 3);
  ctx.lineTo(a.x - 8, a.y + 3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(230,240,255,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(a.x, a.y, 8 + p * 10, 3 + p * 4, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- touch controls (phones / tablets)
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
  const wrap = document.createElement('div');
  wrap.id = 'touchControls';
  wrap.addEventListener('contextmenu', (e) => e.preventDefault());

  const dpad = [
    ['dpadUp', 'arrowup', '▲'],
    ['dpadDown', 'arrowdown', '▼'],
    ['dpadLeft', 'arrowleft', '◀'],
    ['dpadRight', 'arrowright', '▶'],
  ];
  dpad.forEach(([id, k, label]) => {
    const btn = document.createElement('div');
    btn.id = id; btn.className = 'tc-btn'; btn.textContent = label;
    bindHold(btn, () => { keys[k] = true; music.start(); }, () => { keys[k] = false; });
    wrap.appendChild(btn);
  });

  const eBtn = document.createElement('div');
  eBtn.id = 'btnE'; eBtn.className = 'tc-btn'; eBtn.textContent = 'E';
  bindTap(eBtn, () => { interactPressed = true; music.start(); });
  wrap.appendChild(eBtn);

  const xBtn = document.createElement('div');
  xBtn.id = 'btnX'; xBtn.className = 'tc-btn'; xBtn.textContent = 'X';
  bindTap(xBtn, () => { buyPressed = true; music.start(); });
  wrap.appendChild(xBtn);

  const mBtn = document.createElement('div');
  mBtn.id = 'btnM'; mBtn.className = 'tc-btn'; mBtn.textContent = 'MUTE';
  bindTap(mBtn, () => { music.toggleMute(); music.start(); });
  wrap.appendChild(mBtn);

  // SK8 gets its own always-visible button — it's the toggle players reach
  // for most, so it shouldn't be buried in the Extras dropdown.
  const skBtn = document.createElement('div');
  skBtn.id = 'btnSK8'; skBtn.className = 'tc-btn'; skBtn.textContent = 'SK8';
  bindTap(skBtn, () => {
    toggleSkate();
    music.start();
    skBtn.classList.toggle('tc-on', player.skating);
  });
  wrap.appendChild(skBtn);

  // "Extras" — a small popup menu (cold brew, iced tea) so the resting
  // button cluster stays minimal instead of growing a permanent button
  // for every toggle.
  const extrasPanel = document.createElement('div');
  extrasPanel.id = 'extrasPanel';
  const extras = [
    ['BREW',  () => toggleCoffee(),     () => player.holdingCoffee],
    ['YERBA', () => toggleTea(),        () => player.holdingTea],
  ];
  extras.forEach(([label, action, isOn]) => {
    const btn = document.createElement('div');
    btn.className = 'tc-btn';
    btn.textContent = label;
    bindTap(btn, () => {
      action();
      music.start();
      btn.classList.toggle('tc-on', isOn());
    });
    extrasPanel.appendChild(btn);
  });
  wrap.appendChild(extrasPanel);

  const extrasBtn = document.createElement('div');
  extrasBtn.id = 'btnExtras'; extrasBtn.className = 'tc-btn'; extrasBtn.textContent = '☰';
  bindTap(extrasBtn, () => { extrasPanel.classList.toggle('open'); music.start(); });
  wrap.appendChild(extrasBtn);

  document.body.appendChild(wrap);
}
createTouchControls();

canvas.addEventListener('pointerdown', () => {
  music.start();
  if (state !== 'play') interactPressed = true;
});

// ---------------------------------------------------------------- update
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  render(now / 1000);
  requestAnimationFrame(frame);
}

function update(dt) {
  updateAmbient(dt);
  if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }

  if (state === 'splash') {
    if (interactPressed) { state = 'title'; music.setMenuBreak(true); }
  } else if (state === 'title') {
    if (interactPressed) { state = 'play'; music.setMenuBreak(false); }
  } else if (state === 'play') {
    movePlayer(dt);
    if (interactPressed) doInteract();
    if (buyPressed) doBuy();
    if (player.tempItemTimer > 0) {
      player.tempItemTimer -= dt;
      if (player.tempItemTimer <= 0) { player.tempItemTimer = 0; player.tempItem = null; }
    }
  } else if (state === 'dialog') {
    if (interactPressed) {
      dialog.i++;
      if (dialog.i >= dialog.lines.length) { dialog = null; state = 'play'; }
    }
  } else if (state === 'record') {
    if (interactPressed) {
      shownRecord = null;
      if (worldComplete() && !completedWorlds.has(currentWorldId())) {
        completedWorlds.add(currentWorldId());
        state = 'win';
      }
      else state = 'play';
    }
  } else if (state === 'win') {
    if (interactPressed) state = 'play';
  }
  interactPressed = false;
  buyPressed = false;
}

// ---------------------------------------------------------------- render
function camera(map) {
  const worldW = map.w * TILE, worldH = map.h * TILE;
  let cx = player.x - VIEW_W / 2, cy = player.y - VIEW_H / 2;
  cx = Math.max(0, Math.min(cx, worldW - VIEW_W));
  cy = Math.max(0, Math.min(cy, worldH - VIEW_H));
  if (worldW < VIEW_W) cx = (worldW - VIEW_W) / 2;
  if (worldH < VIEW_H) cy = (worldH - VIEW_H) / 2;
  return [Math.round(cx), Math.round(cy)];
}

function hash2(x, y) { return ((x * 73856093) ^ (y * 19349663)) >>> 0; }

// ---------------------------------------------------------------- mountain backdrop
function drawMountainLayer(layer, camX) {
  const period = 240;
  const offset = (camX * layer.speed) % period;
  ctx.fillStyle = layer.color;
  ctx.beginPath();
  ctx.moveTo(-period - offset, VIEW_H);
  for (let sx = -period; sx <= VIEW_W + period; sx += 40) {
    const n = Math.sin((sx + layer.seed) * 0.02) * 0.6 + Math.sin((sx + layer.seed) * 0.045) * 0.4;
    const py = layer.baseY - Math.abs(n) * layer.amp;
    ctx.lineTo(sx - offset, py);
  }
  ctx.lineTo(VIEW_W + period - offset, VIEW_H);
  ctx.closePath();
  ctx.fill();

  if (layer.snow) {
    ctx.fillStyle = 'rgba(230,230,240,0.65)';
    for (let sx = -period; sx <= VIEW_W + period; sx += 40) {
      const n = Math.sin((sx + layer.seed) * 0.02) * 0.6 + Math.sin((sx + layer.seed) * 0.045) * 0.4;
      if (Math.abs(n) > 0.75) {
        const py = layer.baseY - Math.abs(n) * layer.amp;
        const px = sx - offset;
        ctx.beginPath();
        ctx.moveTo(px - 8, py + 10);
        ctx.lineTo(px, py);
        ctx.lineTo(px + 8, py + 10);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}

function drawMountains(camX) {
  const layers = [
    { color: '#241d38', speed: 0.05, baseY: 130, amp: 32, seed: 0,    snow: false },
    { color: '#332a4c', speed: 0.10, baseY: 155, amp: 48, seed: 700,  snow: true },
    { color: '#443860', speed: 0.18, baseY: 185, amp: 60, seed: 1500, snow: true },
  ];
  for (const layer of layers) drawMountainLayer(layer, camX);
}

function render(time) {
  const map = maps[player.map];
  ctx.fillStyle = '#120e18';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  let camX = 0, camY = 0;
  if (map.outside) {
    [camX, camY] = camera(map);
    drawMountains(camX);
  }

  ctx.save();
  if (map.outside) {
    ctx.translate(-camX, -camY);
  } else {
    const worldW = map.w * TILE, worldH = map.h * TILE;
    const zoom = Math.min(VIEW_W / worldW, VIEW_H / worldH);
    const dx = (VIEW_W - worldW * zoom) / 2;
    const dy = (VIEW_H - worldH * zoom) / 2;
    ctx.translate(dx, dy);
    ctx.scale(zoom, zoom);
  }

  drawTiles(map, time, camX, camY);
  if (map.outside) {
    drawBuildings(map);
    if (map.swamp) drawSwampDecorations(time, map, camX, camY);
    else drawTownDecorations(time);
    drawAmbient();
  }
  if (map.darkClub) drawNectarsInterior(time);
  if (map.pizzaShop) drawJuniorsInterior(time);
  if (map.keeper) drawKeeper(map.keeper);
  drawPlayer(time);

  ctx.restore();
  if (state !== 'splash') drawHUD();
  if (state === 'splash') drawSplash();
  if (state === 'title') drawTitle(time);
  if (state === 'dialog') drawDialog();
  if (state === 'record') drawRecordCard();
  if (state === 'win') drawWin();
  if (toast) drawToast();
}

// ---------------------------------------------------------------- tiles
function drawTiles(map, time, camX = 0, camY = 0) {
  // Camera culling: only draw tiles that are actually on screen. This keeps
  // per-frame work bounded no matter how big the map is — the #1 way to grow
  // worlds without lag.
  const x0 = Math.max(0, Math.floor(camX / TILE));
  const y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(map.w, Math.ceil((camX + VIEW_W) / TILE));
  const y1 = Math.min(map.h, Math.ceil((camY + VIEW_H) / TILE));
  for (let ty = y0; ty < y1; ty++) {
    for (let tx = x0; tx < x1; tx++) {
      const px = tx * TILE, py = ty * TILE;
      const ch = map.grid[ty][tx];
      const h = hash2(tx, ty);
      if (map.outside) {
        const p = map.palette;
        ctx.fillStyle = (h % 7 === 0) ? (p ? p.groundB : '#3e7c34') : (p ? p.groundA : '#468a3a');
        ctx.fillRect(px, py, TILE, TILE);
        // gentle bottom-edge shade on every tile — cheap depth cue at high tile counts
        ctx.fillStyle = 'rgba(0,0,0,0.07)';
        ctx.fillRect(px, py + TILE - 3, TILE, 3);
        if (h % 5 === 0) {
          // small grass tuft (stem + lighter tip) instead of a flat dot
          const tx2 = px + (h % 20), ty2 = py + (h % 22);
          ctx.fillStyle = p ? p.leafDark : '#2e6428';
          ctx.fillRect(tx2, ty2, 2, 4);
          ctx.fillStyle = p ? p.groundDot : '#54a046';
          ctx.fillRect(tx2, ty2 - 1, 2, 2);
        }
      } else {
        ctx.fillStyle = map.floor;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.fillRect(px, py + 10, TILE, 2);
        ctx.fillRect(px, py + 24, TILE, 2);
        ctx.fillStyle = map.plank;
        ctx.fillRect(px, py + 11, TILE, 1);
        ctx.fillRect(px, py + 25, TILE, 1);
      }
      switch (ch) {
        case 'r': {
          // simplified, lighter road surface — flat color with a single
          // soft edge shade instead of layered insets/speckle, so the
          // street grid stays calm and doesn't compete with the map
          ctx.fillStyle = '#9a98a0';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = 'rgba(0,0,0,0.06)';
          ctx.fillRect(px, py + TILE - 2, TILE, 2);
          break;
        }
        case '#': drawTree(px, py, map); break;
        case '~': {
          const p = map.palette;
          ctx.fillStyle = p ? p.water : '#3060b0';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.fillRect(px, py + TILE - 10, TILE, 10);
          ctx.fillStyle = p ? p.waterHi : '#4878cc';
          const off = Math.floor(time * 6) % 2 === 0 ? 4 : 12;
          ctx.fillRect(px + off, py + 8, 10, 2);
          ctx.fillRect(px + (TILE - off - 10), py + 22, 10, 2);
          break;
        }
        case 'b': {
          ctx.fillStyle = '#5a4326';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#8a6a42';
          ctx.fillRect(px, py + 2, TILE, TILE - 4);
          for (let i = 3; i < TILE; i += 7) ctx.fillRect(px + i, py + 2, 2, TILE - 4);
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.fillRect(px, py, TILE, 2);
          ctx.fillRect(px, py + TILE - 2, TILE, 2);
          break;
        }
        case 'f': {
          ctx.fillStyle = '#3a2c18';
          ctx.fillRect(px + 3, py + 7, TILE - 6, TILE - 7);
          ctx.fillRect(px + 3, py + 3, 5, TILE - 3);
          ctx.fillRect(px + TILE - 9, py + 3, 5, TILE - 3);
          ctx.fillStyle = '#8a6a42';
          ctx.fillRect(px + 2, py + 8, TILE - 4, 6);
          ctx.fillRect(px + 4, py + 4, 4, 20);
          ctx.fillRect(px + TILE - 8, py + 4, 4, 20);
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(px + 4, py + 4, 1, 20);
          ctx.fillRect(px + TILE - 8, py + 4, 1, 20);
          break;
        }
        case 'c': case 'C': drawCrate(px, py, map.crates[key(tx, ty)]); break;
        case 'W': {
          ctx.fillStyle = shadeColor(map.wallColor, -35);
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = map.wallColor;
          ctx.fillRect(px, py, TILE, TILE - 2);
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(px, py, TILE, 3);
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.fillRect(px, py + 14, TILE, 2);
          ctx.fillRect(px + (ty % 2 === 0 ? 8 : 20), py, 2, 14);
          break;
        }
        case 'T': {
          ctx.fillStyle = '#2a1c10';
          ctx.fillRect(px, py + 5, TILE, TILE - 5);
          ctx.fillStyle = '#6a4a2a';
          ctx.fillRect(px + 1, py + 6, TILE - 2, TILE - 7);
          ctx.fillStyle = '#9a7040';
          ctx.fillRect(px, py, TILE, 10);
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.fillRect(px, py, TILE, 2);
          break;
        }
        case 'J': {
          ctx.fillStyle = '#1c140f';
          ctx.fillRect(px + 3, py - 1, TILE - 6, TILE + 1);
          ctx.fillStyle = '#b03030';
          ctx.fillRect(px + 4, py, TILE - 8, TILE);
          ctx.fillStyle = shadeColor('#b03030', -30);
          ctx.fillRect(px + 4, py, 4, TILE);
          ctx.fillStyle = '#f0d060';
          ctx.fillRect(px + 8, py + 4, TILE - 16, 8);
          ctx.fillStyle = Math.floor(time * 2) % 2 ? '#60d0f0' : '#f06090';
          ctx.fillRect(px + 8, py + 16, TILE - 16, 4);
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillRect(px + 9, py + 5, 3, 3);
          break;
        }
        case 'E': {
          ctx.fillStyle = '#3a1c10';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#7a3a20';
          ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
          ctx.fillStyle = '#9a5a30';
          ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
          ctx.fillStyle = 'rgba(255,255,255,0.1)';
          ctx.fillRect(px + 4, py + 4, TILE - 8, 3);
          break;
        }
      }
    }
  }
}

function drawTree(px, py, map) {
  const p = map && map.palette;
  const trunk = p ? p.trunk : '#6a4a2a';
  const leafDark = p ? p.leafDark : '#2e6428';
  const leafMid = p ? p.leafMid : '#38782e';
  const leafLight = p ? p.leafLight : '#4a9038';
  const outline = '#16110a';

  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 29, 11, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // trunk: outline, base, and a shaded side for roundness
  ctx.fillStyle = outline;
  ctx.fillRect(px + 12, py + 19, 8, 12);
  ctx.fillStyle = trunk;
  ctx.fillRect(px + 13, py + 20, 6, 10);
  ctx.fillStyle = shadeColor(trunk, -30);
  ctx.fillRect(px + 13, py + 20, 2, 10);

  // foliage: outlined silhouette, then three layered tones, then a highlight clump
  ctx.fillStyle = outline;
  ctx.fillRect(px + 3, py + 9, 26, 14);
  ctx.fillRect(px + 7, py + 1, 18, 15);
  ctx.fillStyle = leafDark;
  ctx.fillRect(px + 4, py + 10, 24, 12);
  ctx.fillStyle = leafMid;
  ctx.fillRect(px + 8, py + 2, 16, 14);
  ctx.fillStyle = leafLight;
  ctx.fillRect(px + 10, py + 4, 8, 6);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(px + 4, py + 18, 24, 4);
}

// Scatter lily pads + cattails over the swamp's water. Called from render
// only when the current map has `swamp: true`.
function drawSwampDecorations(time, map, camX, camY) {
  const p = map.palette || {};
  const x0 = Math.max(0, Math.floor(camX / TILE));
  const y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(map.w, Math.ceil((camX + VIEW_W) / TILE));
  const y1 = Math.min(map.h, Math.ceil((camY + VIEW_H) / TILE));
  for (let ty = y0; ty < y1; ty++)
    for (let tx = x0; tx < x1; tx++) {
      if (map.grid[ty][tx] !== '~') continue;
      const h = hash2(tx, ty);
      const px = tx * TILE, py = ty * TILE;
      if (h % 7 === 0) {                     // lily pad (bobs gently)
        const bob = Math.sin(time * 2 + h) * 1;
        const lx = px + 10 + (h % 11), ly = py + 18 + bob;
        ctx.fillStyle = '#3f7a35';
        ctx.beginPath();
        ctx.ellipse(lx, ly, 7, 4, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.water || '#2c4330';  // notch
        ctx.beginPath();
        ctx.moveTo(lx - 1, ly);
        ctx.lineTo(lx + 3, ly - 2);
        ctx.lineTo(lx + 3, ly + 2);
        ctx.closePath();
        ctx.fill();
      }
      if (h % 11 === 0) {                    // cattail
        ctx.fillStyle = '#3a4a2a';
        ctx.fillRect(px + 6, py + 12, 2, 18);
        ctx.fillStyle = '#6a4a28';
        ctx.fillRect(px + 4, py + 8, 6, 9);
      }
    }
}

function drawCrate(px, py, data) {
  ctx.fillStyle = '#8a5a30';
  ctx.fillRect(px + 2, py + 6, TILE - 4, TILE - 8);
  ctx.fillStyle = '#6a4020';
  ctx.fillRect(px + 2, py + 6, TILE - 4, 3);
  ctx.fillRect(px + 2, py + TILE - 5, TILE - 4, 3);
  const empty = data && data.record && collected.has(data.record);
  const colors = empty ? ['#5a3a1e'] : ['#c04040', '#4060c0', '#d0a030'];
  colors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(px + 6 + i * 7, py + 2, 5, 8);
  });
}

// ---------------------------------------------------------------- buildings
function drawBuildings(map) {
  for (const b of map.buildings) {
    const px = b.x * TILE, py = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
    const isGreenDoorStudio = b.name === 'Green Door Studio';
    const isHeyBud = b.name === 'Hey Bud';
    const isThrift = b.name === 'Pure Pop Records';
    const isNectars = b.name === 'Nectars';
    const isJuniors = b.name === "Junior's";

    // wall: outline, base fill, side shading bands, and a darker foundation
    // strip along the bottom — same layered look as the keeper sprites.
    const wallDark = shadeColor(b.wall, -30);
    const wallLight = shadeColor(b.wall, 18);
    ctx.fillStyle = '#1c140f';
    ctx.fillRect(px - 1, py - 1, w + 2, h + 2);
    ctx.fillStyle = b.wall;
    ctx.fillRect(px, py, w, h);
    ctx.fillStyle = wallLight;
    ctx.fillRect(px, py, 5, h);
    ctx.fillStyle = wallDark;
    ctx.fillRect(px + w - 5, py, 5, h);
    ctx.fillRect(px, py + h - 8, w, 8);

    if (isGreenDoorStudio) {
      for (let row = 0; row < 4; row++) {
        const brickY = py + 34 + row * 17;
        ctx.strokeStyle = '#5b3b2e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, brickY);
        ctx.lineTo(px + w, brickY);
        ctx.stroke();
        const offset = row % 2 === 0 ? 0 : 16;
        for (let bx = offset; bx < w; bx += 32) {
          ctx.beginPath();
          ctx.moveTo(px + bx, brickY);
          ctx.lineTo(px + bx, brickY + 17);
          ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(30,20,18,0.22)';
      ctx.fillRect(px + 4, py + 38, 5, 26);
      ctx.fillRect(px + w - 10, py + 48, 5, 18);
    }

    const roofDark = shadeColor(b.roof, -35);
    const roofLight = shadeColor(b.roof, 25);
    ctx.fillStyle = '#1c140f';
    ctx.fillRect(px - 1, py - 1, w + 2, TILE + 10);
    ctx.fillStyle = b.roof;
    ctx.fillRect(px, py, w, TILE + 8);
    ctx.fillStyle = roofLight;
    ctx.fillRect(px, py, w, 4);
    ctx.fillStyle = roofDark;
    ctx.fillRect(px, py + TILE + 2, w, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(px, py + TILE + 8, w, 3);

    for (let i = 0; i < b.w; i++) {
      if (b.x + i === b.doorX) continue;
      if (i === 0 || i === b.w - 1) continue;
      const wx = px + i * TILE + 8, wy = py + h - TILE - 14;
      ctx.fillStyle = '#3a2a1c';                          // frame
      ctx.fillRect(wx - 2, wy - 2, 20, 22);
      ctx.fillStyle = '#ffe9a0';                           // glass base
      ctx.fillRect(wx, wy, 16, 18);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';                  // lower pane in shadow
      ctx.fillRect(wx, wy + 9, 16, 9);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';             // glint, upper-left
      ctx.fillRect(wx + 1, wy + 1, 5, 5);
      ctx.fillStyle = '#3a2a1c';                           // muntin cross
      ctx.fillRect(wx + 7, wy, 2, 18);
      ctx.fillRect(wx, wy + 8, 16, 2);
      ctx.fillStyle = '#2a1c12';                           // sill
      ctx.fillRect(wx - 3, wy + 19, 22, 3);
    }

    if (isGreenDoorStudio) {
      drawGraffiti(px, py, w, h);
    }

    // Garage door on left side of Green Door Studio (closed, graffiti-covered)
    if (isGreenDoorStudio) {
      const garageDoorX = px + TILE + 2;
      const garageDoorY = py + h - TILE + 2;
      const garageDoorW = TILE + 22;   // a little wider so it reads as a proper garage door
      const garageDoorH = TILE - 2;
      
      // Garage door panels: outline, base fill, top highlight, bottom shadow
      ctx.fillStyle = '#1c140f';
      ctx.fillRect(garageDoorX - 2, garageDoorY - 2, garageDoorW + 4, garageDoorH + 2);
      ctx.fillStyle = '#3a3a3e';
      ctx.fillRect(garageDoorX, garageDoorY, garageDoorW, garageDoorH);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(garageDoorX, garageDoorY, garageDoorW, 5);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(garageDoorX, garageDoorY + garageDoorH - 6, garageDoorW, 6);
      
      // Panel lines (horizontal + vertical ribs)
      ctx.strokeStyle = '#2a2a2e';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(garageDoorX, garageDoorY + i * (garageDoorH / 5));
        ctx.lineTo(garageDoorX + garageDoorW, garageDoorY + i * (garageDoorH / 5));
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(garageDoorX + garageDoorW / 2, garageDoorY);
      ctx.lineTo(garageDoorX + garageDoorW / 2, garageDoorY + garageDoorH);
      ctx.stroke();
      
      // Graffiti on garage door
      ctx.strokeStyle = '#e06a38';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(garageDoorX + 4, garageDoorY + 8);
      ctx.lineTo(garageDoorX + 12, garageDoorY + 4);
      ctx.lineTo(garageDoorX + 18, garageDoorY + 10);
      ctx.stroke();
      
      ctx.fillStyle = '#3d83b8';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('BEAT', garageDoorX + 5, garageDoorY + 22);
      
      ctx.strokeStyle = '#9b4f9f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(garageDoorX + 24, garageDoorY + 5);
      ctx.lineTo(garageDoorX + 32, garageDoorY + 12);
      ctx.lineTo(garageDoorX + 26, garageDoorY + 18);
      ctx.stroke();
      
      ctx.fillStyle = '#f0a83c';
      ctx.fillRect(garageDoorX + 30, garageDoorY + 24, 3, 3);

      // a few more tags to fill out the wider door
      ctx.fillStyle = '#3d83b8';
      ctx.fillRect(garageDoorX + garageDoorW - 12, garageDoorY + 8, 5, 4);
      ctx.fillStyle = '#f0a83c';
      ctx.fillRect(garageDoorX + garageDoorW - 9, garageDoorY + 18, 4, 3);
      ctx.strokeStyle = '#e06a38';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(garageDoorX + garageDoorW - 20, garageDoorY + 26);
      ctx.lineTo(garageDoorX + garageDoorW - 14, garageDoorY + 26);
      ctx.stroke();
    }

    const dx = b.doorX * TILE;
    
    // Special mural door for Green Door Studio
    if (isGreenDoorStudio) {
      drawGreenDoorMural(dx, py + h - TILE);
      drawOpenDoorSign(dx, py + h - TILE);
      // "3rd Thursdays" hip-hop night flyer taped in a window near the entrance
      drawThursPoster(dx - TILE - 4, py + h - TILE - 18);
    } else {
      // Standard door for other buildings: outline, frame, shaded panels, handle
      const doorXi = dx + 4, doorY = py + h - TILE + 2, doorW = TILE - 8, doorH = TILE - 2;
      ctx.fillStyle = '#1c140f';
      ctx.fillRect(doorXi - 2, doorY - 3, doorW + 4, doorH + 3);
      ctx.fillStyle = '#3a2414';
      ctx.fillRect(doorXi, doorY, doorW, doorH);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';                  // shadowed half
      ctx.fillRect(doorXi, doorY, doorW / 2, doorH);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';            // lit half
      ctx.fillRect(doorXi + doorW / 2, doorY, doorW / 2 - 1, doorH);
      ctx.fillStyle = '#241811';                           // recessed panels
      ctx.fillRect(doorXi + 3, doorY + 4, doorW - 6, doorH * 0.4);
      ctx.fillRect(doorXi + 3, doorY + doorH * 0.5, doorW - 6, doorH * 0.4);
      ctx.fillStyle = '#e0c060';
      ctx.fillRect(dx + TILE - 12, py + h - 16, 3, 3);
    }

    if (isHeyBud) drawHeyBudDecor(px, py, w, h);
    if (isNectars) {
      drawNectarsDecor(px, py, w, h);
      drawWallPoster(px, py, w, h);
    }
    if (isJuniors) drawJuniorsDecor(px, py, w, h);
    // "3rd Thursdays" flyer on the outside wall of Pure Pop Records
    if (isThrift) drawThursPoster(px + 6, py + 40);

    // Draw building name sign (skip for Nectar's - uses neon sign instead).
    // High-contrast dark plate + bright bold lettering, auto-sized to the
    // name so it always fits cleanly and never overlaps or crowds.
    if (!isNectars) {
      const maxTextW = w + 26;
      let fsize = 17;
      ctx.font = 'bold ' + fsize + 'px monospace';
      while (fsize > 11 && ctx.measureText(b.name).width > maxTextW) {
        fsize--;
        ctx.font = 'bold ' + fsize + 'px monospace';
      }
      const textW = ctx.measureText(b.name).width;
      const sw = textW + 22, sh = fsize + 15;
      const sx = px + (w - sw) / 2, sy = py + 3;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(sx + 2, sy + 3, sw, sh);
      ctx.fillStyle = '#120e0a';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.fillStyle = b.roof || '#e0b040';
      ctx.fillRect(sx, sy + sh - 3, sw, 3);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f9f2e0';
      ctx.fillText(b.name, px + w / 2, sy + sh / 2 + fsize * 0.36);
    }
  }
}

function drawOpenDoorSign(doorX, doorY) {
  // "OPEN" sign with a glowing arrow above the Green Door Studio entrance.
  // doorX/doorY is the top-left of the door tile; the sign hangs in the wall
  // row directly above it and points down at the doorway.
  const cx = doorX + TILE / 2;
  const signY = doorY - 24;
  const sw = 30, sh = 15;

  // soft glow behind the sign so it pops off the brick wall
  ctx.fillStyle = 'rgba(255,233,160,0.28)';
  ctx.fillRect(cx - sw / 2 - 4, signY - 3, sw + 8, sh + 8);

  // wooden hanger/mount
  ctx.fillStyle = '#4a3020';
  ctx.fillRect(cx - 3, signY - 3, 6, 3);

  // the glowing plaque
  ctx.fillStyle = '#ffe9a0';
  ctx.fillRect(cx - sw / 2, signY, sw, sh);
  ctx.strokeStyle = '#a8782a';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - sw / 2, signY, sw, sh);
  ctx.fillStyle = '#4a2006';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('OPEN', cx, signY + 13);

  // small lit bulb above the "O" for a neon vibe
  ctx.fillStyle = '#fff6c8';
  ctx.beginPath();
  ctx.arc(cx - 7, signY + 3, 1.6, 0, Math.PI * 2);
  ctx.fill();

  // downward arrow pointing at the doorway
  const ay = signY + sh + 3;
  ctx.strokeStyle = '#ffe9a0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, ay);
  ctx.lineTo(cx, ay + 10);
  ctx.stroke();
  ctx.fillStyle = '#ffe9a0';
  ctx.beginPath();
  ctx.moveTo(cx - 6, ay + 5);
  ctx.lineTo(cx, ay + 11);
  ctx.lineTo(cx + 6, ay + 5);
  ctx.closePath();
  ctx.fill();
}

function drawGreenDoorMural(doorX, doorY) {
  // Vibrant mural on Green Door Studio entrance
  // Based on the green character with purple hair and blue background
  
  const w = TILE;
  const h = TILE;
  
  ctx.save();
  
  // Bright cyan/turquoise background
  ctx.fillStyle = '#20c0d8';
  ctx.fillRect(doorX, doorY, w, h);
  
  // Add some texture/splatter to background
  ctx.fillStyle = '#18a8c0';
  ctx.fillRect(doorX + 2, doorY + 4, 4, 3);
  ctx.fillRect(doorX + w - 8, doorY + 8, 5, 4);
  ctx.fillRect(doorX + 5, doorY + h - 10, 3, 3);
  
  // Purple hair swirls (left side)
  ctx.fillStyle = '#9060b0';
  ctx.beginPath();
  ctx.ellipse(doorX + 8, doorY + 10, 6, 8, -0.3, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#b080d0';
  ctx.beginPath();
  ctx.ellipse(doorX + 6, doorY + 12, 4, 6, -0.4, 0, Math.PI * 2);
  ctx.fill();
  
  // Purple hair swirls (right side)
  ctx.fillStyle = '#9060b0';
  ctx.beginPath();
  ctx.ellipse(doorX + w - 10, doorY + 11, 6, 8, 0.3, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#b080d0';
  ctx.beginPath();
  ctx.ellipse(doorX + w - 8, doorY + 13, 4, 6, 0.4, 0, Math.PI * 2);
  ctx.fill();
  
  // Green face (center)
  ctx.fillStyle = '#40d050';
  ctx.beginPath();
  ctx.ellipse(doorX + w/2, doorY + h/2 - 2, 10, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Face outline/shadow
  ctx.strokeStyle = '#2a9838';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(doorX + w/2, doorY + h/2 - 2, 10, 12, 0, 0, Math.PI * 2);
  ctx.stroke();
  
  // Left eye (bright blue)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(doorX + w/2 - 4, doorY + h/2 - 4, 3, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#20d0f0';
  ctx.beginPath();
  ctx.ellipse(doorX + w/2 - 4, doorY + h/2 - 4, 2, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#1a1a1e';
  ctx.beginPath();
  ctx.ellipse(doorX + w/2 - 4, doorY + h/2 - 4, 1, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Right eye (bright blue)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(doorX + w/2 + 4, doorY + h/2 - 4, 3, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#20d0f0';
  ctx.beginPath();
  ctx.ellipse(doorX + w/2 + 4, doorY + h/2 - 4, 2, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#1a1a1e';
  ctx.beginPath();
  ctx.ellipse(doorX + w/2 + 4, doorY + h/2 - 4, 1, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Nose (small)
  ctx.fillStyle = '#2a9838';
  ctx.beginPath();
  ctx.moveTo(doorX + w/2, doorY + h/2);
  ctx.lineTo(doorX + w/2 - 1, doorY + h/2 + 2);
  ctx.lineTo(doorX + w/2 + 1, doorY + h/2 + 2);
  ctx.closePath();
  ctx.fill();
  
  // Big smile (pink/magenta lips)
  ctx.fillStyle = '#f060a0';
  ctx.beginPath();
  ctx.ellipse(doorX + w/2, doorY + h/2 + 5, 6, 3, 0, 0, Math.PI);
  ctx.fill();
  
  // Teeth highlight
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(doorX + w/2 - 3, doorY + h/2 + 4, 6, 2);
  
  // Yellow sunflower (right side of hair)
  ctx.fillStyle = '#f0d060';
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const petalX = doorX + w - 6 + Math.cos(angle) * 3;
    const petalY = doorY + 8 + Math.sin(angle) * 3;
    ctx.beginPath();
    ctx.ellipse(petalX, petalY, 2, 3, angle, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Flower center
  ctx.fillStyle = '#8a5a3a';
  ctx.beginPath();
  ctx.arc(doorX + w - 6, doorY + 8, 2, 0, Math.PI * 2);
  ctx.fill();
  
  // Earring/jewelry (yellow)
  ctx.fillStyle = '#f0d860';
  ctx.beginPath();
  ctx.arc(doorX + w/2 + 8, doorY + h/2 + 2, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(doorX + w/2 + 7, doorY + h/2 + 4, 2, 3);
  
  // Green body/shoulders (bottom)
  ctx.fillStyle = '#40d050';
  ctx.fillRect(doorX + w/2 - 8, doorY + h - 8, 16, 8);
  
  // Darker outfit/belt area
  ctx.fillStyle = '#2a5a30';
  ctx.fillRect(doorX + w/2 - 8, doorY + h - 4, 16, 4);
  
  // Belt studs
  ctx.fillStyle = '#7a7a7e';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(doorX + w/2 - 4 + i * 4, doorY + h - 2, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Door handle (small circle)
  ctx.fillStyle = '#8a8a8e';
  ctx.beginPath();
  ctx.arc(doorX + w - 8, doorY + h/2 + 8, 2, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
}

function drawGraffiti(px, py, w, h) {
  ctx.save();
  ctx.strokeStyle = '#e06a38';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px + 10, py + 57);
  ctx.lineTo(px + 32, py + 44);
  ctx.lineTo(px + 48, py + 59);
  ctx.lineTo(px + 65, py + 43);
  ctx.lineTo(px + 82, py + 56);
  ctx.stroke();

  ctx.fillStyle = '#3d83b8';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('GDS', px + 12, py + 73);

  ctx.strokeStyle = '#9b4f9f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px + 86, py + 38);
  ctx.lineTo(px + 102, py + 48);
  ctx.lineTo(px + 88, py + 58);
  ctx.lineTo(px + 105, py + 67);
  ctx.stroke();

  ctx.strokeStyle = '#e6d9c4';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px + 16, py + 47);
  ctx.lineTo(px + 29, py + 40);
  ctx.stroke();

  ctx.fillStyle = '#f0a83c';
  ctx.fillRect(px + 103, py + 39, 4, 4);
  ctx.fillRect(px + 109, py + 47, 3, 3);

  ctx.fillStyle = '#64a4d0';
  ctx.fillRect(px + 20, py + 82, 4, 4);
  ctx.fillRect(px + 28, py + 85, 3, 3);
  ctx.restore();
}

function drawHeyBudDecor(px, py, w, h) {
  ctx.save();
  ctx.strokeStyle = '#285f32';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px + 8, py + 30);
  ctx.quadraticCurveTo(px + 16, py + 46, px + 22, py + 34);
  ctx.quadraticCurveTo(px + 30, py + 49, px + 38, py + 35);
  ctx.quadraticCurveTo(px + 48, py + 49, px + 57, py + 34);
  ctx.stroke();

  const leaves = [[12,37],[22,40],[31,36],[43,41],[54,36],[67,40],[83,35],[101,42],[116,36],[126,42],[137,35],[151,42],[174,37],[190,42],[205,36]];
  ctx.fillStyle = '#3f863e';
  for (const [lx, ly] of leaves) {
    ctx.beginPath();
    ctx.arc(px + lx, py + ly, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  drawPlantPot(px + 8, py + h - 5);
  drawPlantPot(px + w - 20, py + h - 5);

  ctx.strokeStyle = '#3a2a20';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px + w - 44, py + 25);
  ctx.lineTo(px + w - 38, py + 47);
  ctx.stroke();

  ctx.fillStyle = '#9b633a';
  ctx.fillRect(px + w - 48, py + 45, 20, 7);
  ctx.fillStyle = '#4d9342';
  ctx.fillRect(px + w - 44, py + 38, 5, 9);
  ctx.fillRect(px + w - 37, py + 35, 5, 12);
  ctx.fillRect(px + w - 30, py + 39, 5, 8);
  ctx.restore();
}

function drawPlantPot(x, y) {
  ctx.fillStyle = '#70432d';
  ctx.fillRect(x, y - 10, 12, 8);
  ctx.fillStyle = '#4d8c3d';
  ctx.fillRect(x + 2, y - 18, 4, 9);
  ctx.fillRect(x + 7, y - 22, 4, 13);
  ctx.fillRect(x - 2, y - 15, 5, 5);
  ctx.fillRect(x + 9, y - 18, 5, 5);
}

// ---------------------------------------------------------------- town decorations
function drawTownDecorations(time) {
  drawGreenDoorArtArea();
  drawWallPainter(time);
  drawDeliScene(time);
  drawCoffeeCart();
  drawAnthillBillboard();
  drawOldLotByHeyBud();
  drawHeyBudParkedCars();
  drawSmokingPerson(time);
  // Widened sign: shifted left of its old anchor so its right edge still lines
  // up with the flea-market crate at tile (26,20) instead of growing into it.
  drawYardSign(25 * TILE - 10, 20 * TILE);
  drawFountainArea(time);
  drawCenterStretch();
  drawIceCreamVan();
}

// ----------------------------------------------------------------------
// Decor buildings around the center road (purely cosmetic, no doors).
// ----------------------------------------------------------------------
function drawCobblePath(tx, ty, w, h) {
  // a narrow single-strip grey & red cobblestone footpath over w x h tiles
  // starting at tile (tx,ty). Each tile shows one column of stones, so a
  // 1-wide path reads as one clean middle strip.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = (tx + x) * TILE, py = (ty + y) * TILE;
      // narrow strip base
      ctx.fillStyle = '#9a9da1';
      ctx.fillRect(px + 8, py, TILE - 16, TILE);
      // grey stones (one column)
      ctx.fillStyle = '#c4c7cc';
      ctx.fillRect(px + 9, py + 2, 11, 13);
      ctx.fillRect(px + 9, py + 17, 11, 13);
      // mortar
      ctx.fillStyle = '#7d8085';
      ctx.fillRect(px + 8, py + 16, TILE - 16, 2);
      // red accent stones
      ctx.fillStyle = '#c06a55';
      ctx.fillRect(px + 12, py + 5, 6, 6);
      ctx.fillRect(px + 13, py + 19, 6, 6);
    }
  }
}

function drawChurch() {
  const px = 21 * TILE, py = 11 * TILE;
  const w = 3 * TILE, h = 3 * TILE;
  const cx = px + w / 2;

  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(px - 4, py + h - 8, w + 8, 12);

  // white body
  ctx.fillStyle = '#f4efe3';
  ctx.fillRect(px, py + 28, w, h - 28);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(px, py + h - 8, w, 8);

  // slate gable roof
  ctx.fillStyle = '#3c3e45';
  ctx.beginPath();
  ctx.moveTo(px - 6, py + 36);
  ctx.lineTo(cx, py + 6);
  ctx.lineTo(px + w + 6, py + 36);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#52555f';
  ctx.fillRect(px - 2, py + 32, w + 4, 5);

  // bell tower / steeple
  ctx.fillStyle = '#4a4d56';
  ctx.fillRect(cx - 7, py - 12, 14, 16);
  ctx.fillStyle = '#f4efe3';
  ctx.fillRect(cx - 5, py - 6, 10, 16);
  ctx.fillStyle = '#3c3e45';
  ctx.fillRect(cx - 7, py - 17, 14, 7);
  // cross
  ctx.fillStyle = '#e8e4d6';
  ctx.fillRect(cx - 1, py - 27, 3, 12);
  ctx.fillRect(cx - 4, py - 22, 9, 3);

  // arched blue windows
  ctx.fillStyle = '#8aa0c4';
  ctx.fillRect(px + 16, py + 52, 17, 20);
  ctx.fillRect(px + w - 33, py + 52, 17, 20);
  ctx.beginPath(); ctx.arc(px + 24, py + 52, 8, Math.PI, 0); ctx.fill();
  ctx.beginPath(); ctx.arc(px + w - 24, py + 52, 8, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#dcecf6';
  ctx.fillRect(px + 16, py + 50, 17, 5);
  ctx.fillRect(px + w - 33, py + 50, 17, 5);

  // rounded wooden door
  ctx.fillStyle = '#6b4a28';
  ctx.fillRect(cx - 20, py + 62, 40, 30);
  ctx.beginPath(); ctx.arc(cx, py + 62, 20, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#8a6238';
  ctx.fillRect(cx - 20, py + 62, 40, 7);
  ctx.fillStyle = '#e0b460';
  ctx.fillRect(cx - 4, py + h - 16, 3, 3);

  // stone steps
  ctx.fillStyle = '#d9d2c2';
  ctx.fillRect(cx - 16, py + h - 4, 32, 6);
}

function drawStand(px, py, c) {
  // a small street stall: c = {top, top2, body, a, b}
  const W = 30, H = 32;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(px + 2, py + H - 6, W, 5);
  // posts
  ctx.fillStyle = '#5a3a22';
  ctx.fillRect(px + 3, py + 16, 3, H - 18);
  ctx.fillRect(px + W - 6, py + 16, 3, H - 18);
  // counter
  ctx.fillStyle = c.body;
  ctx.fillRect(px, py + 16, W, H - 16);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(px, py + 16, W, 3);
  // items on the counter
  ctx.fillStyle = c.a;
  ctx.fillRect(px + 5, py + 9, 6, 4);
  ctx.fillRect(px + 13, py + 8, 4, 5);
  ctx.fillStyle = c.b;
  ctx.fillRect(px + 20, py + 10, 5, 3);
  // awning
  ctx.fillStyle = c.top;
  ctx.fillRect(px, py, W, 9);
  ctx.fillStyle = c.top2;
  for (let i = 0; i < 3; i++) ctx.fillRect(px + 4 + i * 10, py, 4, 9);
  // scalloped edge
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = c.top;
    ctx.beginPath(); ctx.arc(px + 6 + i * 10, py + 9, 5, 0, Math.PI); ctx.fill();
    ctx.fillStyle = c.top2;
    ctx.fillRect(px + 5 + i * 10, py + 5, 3, 4);
  }
}

function drawCenterStretch() {
  // single middle strip of cobblestone leading away from the church door (south)
  drawCobblePath(22, 14, 1, 4);
  // the little white church
  drawChurch();

  // small row of food stands / shops running along the center road
  drawStand(21 * TILE, 4 * TILE + 6,   { top: '#d84030', top2: '#f4efe3', body: '#8a5a32', a: '#e06a38', b: '#c8d84a' });
  drawStand(21 * TILE, 8 * TILE + 6,   { top: '#d0a02c', top2: '#f4efe3', body: '#4a7ab0', a: '#c8443c', b: '#9ac84a' });
  drawStand(21 * TILE, 16 * TILE + 6,  { top: '#7a5a92', top2: '#f4efe3', body: '#b89878', a: '#d8b050', b: '#c8785a' });
  drawStand(21 * TILE, 19 * TILE + 6,  { top: '#3f6fb0', top2: '#f4efe3', body: '#e8e0d0', a: '#7a4a2a', b: '#d0c06a' });
  drawStand(18 * TILE, 6 * TILE + 6,   { top: '#b8508a', top2: '#f4efe3', body: '#6a9a4a', a: '#e0609a', b: '#4a8a5a' });
}

function drawFountainArea(time) {
  // Fountain and seating area in lower left (near coordinates 3,20-22)
  // Positioned to avoid blocking paths
  const baseX = 2 * TILE + 8;
  const baseY = 20 * TILE;
  
  // Concrete seating area (patio)
  const patioW = 3 * TILE + 8;
  const patioH = 2 * TILE + 8;
  
  ctx.fillStyle = '#9a9a9e';
  ctx.fillRect(baseX, baseY, patioW, patioH);
  
  // Concrete texture (subtle lines)
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(baseX, baseY + i * 18);
    ctx.lineTo(baseX + patioW, baseY + i * 18);
    ctx.stroke();
  }
  
  // Fountain (center-left of patio)
  const fountainX = baseX + 18;
  const fountainY = baseY + 20;
  const fountainR = 16;
  
  // Fountain base (stone)
  ctx.fillStyle = '#7a7a7e';
  ctx.beginPath();
  ctx.arc(fountainX, fountainY, fountainR, 0, Math.PI * 2);
  ctx.fill();
  
  // Water (blue with shimmer)
  ctx.fillStyle = '#4890d0';
  ctx.beginPath();
  ctx.arc(fountainX, fountainY, fountainR - 4, 0, Math.PI * 2);
  ctx.fill();
  
  // Water shimmer effect
  const shimmer = Math.floor(time * 3) % 3;
  ctx.fillStyle = 'rgba(200,230,255,0.4)';
  ctx.beginPath();
  ctx.arc(fountainX - 4 + shimmer * 2, fountainY - 3, 3, 0, Math.PI * 2);
  ctx.fill();
  
  // Center fountain spout
  ctx.fillStyle = '#5a5a5e';
  ctx.fillRect(fountainX - 2, fountainY - 8, 4, 8);
  
  // Water spray (animated)
  ctx.save();
  ctx.fillStyle = 'rgba(180,220,255,0.6)';
  const spray = Math.sin(time * 4) * 2;
  ctx.fillRect(fountainX - 1, fountainY - 12 - spray, 2, 4 + spray);
  ctx.fillStyle = 'rgba(180,220,255,0.3)';
  ctx.fillRect(fountainX - 3, fountainY - 10 - spray, 1, 3);
  ctx.fillRect(fountainX + 2, fountainY - 10 - spray, 1, 3);
  ctx.restore();
  
  // Bench (right side of patio)
  const benchX = baseX + patioW - TILE - 10;
  const benchY = baseY + 16;
  
  // Bench seat
  ctx.fillStyle = '#6a4a3a';
  ctx.fillRect(benchX, benchY, 32, 6);
  
  // Bench back
  ctx.fillStyle = '#6a4a3a';
  ctx.fillRect(benchX + 2, benchY - 12, 28, 4);
  
  // Bench legs
  ctx.fillStyle = '#5a3a2a';
  ctx.fillRect(benchX + 4, benchY + 6, 4, 8);
  ctx.fillRect(benchX + 24, benchY + 6, 4, 8);
  
  // Person sitting on bench
  const personX = benchX + 12;
  const personY = benchY - 6;
  
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(personX - 4, benchY + 6, 10, 3);
  
  // Legs (sitting position)
  ctx.fillStyle = '#3a4a6a';
  ctx.fillRect(personX - 2, benchY + 6, 3, 8);
  ctx.fillRect(personX + 3, benchY + 6, 3, 8);
  
  // Body
  ctx.fillStyle = '#7a5a4a';
  ctx.fillRect(personX - 3, personY, 10, 10);
  
  // Head
  ctx.fillStyle = '#c89a72';
  ctx.fillRect(personX - 2, personY - 6, 7, 7);
  
  // Hair
  ctx.fillStyle = '#5a3a2a';
  ctx.fillRect(personX - 2, personY - 8, 7, 3);
  
  // Arm resting on bench back
  ctx.fillStyle = '#c89a72';
  ctx.fillRect(personX + 7, personY + 2, 6, 2);
  
  // Small decorative plants around fountain
  const plants = [
    [fountainX - 24, fountainY + 8],
    [fountainX + 20, fountainY + 10]
  ];
  
  for (const [px, py] of plants) {
    ctx.fillStyle = '#4d8c3d';
    ctx.fillRect(px, py - 8, 3, 8);
    ctx.fillRect(px - 2, py - 10, 2, 4);
    ctx.fillRect(px + 3, py - 9, 2, 4);
  }
}

function drawGreenDoorArtArea() {
  const baseX = 3 * TILE;
  const baseY = 7 * TILE + 4;

  ctx.fillStyle = '#513628';
  ctx.fillRect(baseX + 6, baseY + 17, 52, 4);
  ctx.fillRect(baseX + 10, baseY + 21, 4, 18);
  ctx.fillRect(baseX + 49, baseY + 21, 4, 18);

  drawSprayCan(baseX + 3, baseY + 2, '#e34b3c');
  drawSprayCan(baseX + 20, baseY + 1, '#3f82c0');
  drawSprayCan(baseX + 36, baseY + 4, '#d7a52f');

  drawCanvas(baseX + 63, baseY + 5, 25, 31, 0);
  drawCanvas(baseX + 93, baseY + 1, 28, 35, 1);

  ctx.fillStyle = '#d9c7a2';
  ctx.beginPath();
  ctx.ellipse(baseX + 42, baseY + 29, 10, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d84b38';
  ctx.fillRect(baseX + 37, baseY + 27, 3, 3);
  ctx.fillStyle = '#3d82bd';
  ctx.fillRect(baseX + 42, baseY + 25, 3, 3);
  ctx.fillStyle = '#e0b33c';
  ctx.fillRect(baseX + 47, baseY + 28, 3, 3);

  // Artist 1 - painting on canvas
  drawArtist1(baseX + 75, baseY + 28);
  
  // Artist 2 - sitting with spray can
  drawArtist2(baseX + 105, baseY + 30);
}

function drawArtist1(x, y) {
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x - 8, y + 14, 16, 4);
  
  // Legs
  ctx.fillStyle = '#2a3a46';
  ctx.fillRect(x - 5, y + 2, 4, 12);
  ctx.fillRect(x + 1, y + 2, 4, 12);
  
  // Body/shirt
  ctx.fillStyle = '#c86a3c';
  ctx.fillRect(x - 6, y - 8, 12, 11);
  
  // Arm reaching toward canvas
  ctx.fillStyle = '#c86a3c';
  ctx.fillRect(x + 5, y - 4, 8, 4);
  
  // Head/skin
  ctx.fillStyle = '#b87954';
  ctx.fillRect(x - 4, y - 16, 8, 8);
  
  // Hair
  ctx.fillStyle = '#2a2020';
  ctx.fillRect(x - 4, y - 18, 8, 4);
}

function drawArtist2(x, y) {
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x - 8, y + 14, 16, 4);
  
  // Legs (sitting position)
  ctx.fillStyle = '#3a3a46';
  ctx.fillRect(x - 6, y + 6, 5, 8);
  ctx.fillRect(x + 1, y + 6, 5, 8);
  
  // Body/shirt
  ctx.fillStyle = '#4a7ab0';
  ctx.fillRect(x - 6, y - 4, 12, 11);
  
  // Arm with spray can
  ctx.fillStyle = '#4a7ab0';
  ctx.fillRect(x - 10, y, 6, 4);
  
  // Spray can in hand
  ctx.fillStyle = '#e34b3c';
  ctx.fillRect(x - 12, y - 2, 4, 6);
  ctx.fillStyle = '#202026';
  ctx.fillRect(x - 12, y - 4, 4, 2);
  
  // Head/skin
  ctx.fillStyle = '#c89a72';
  ctx.fillRect(x - 4, y - 12, 8, 8);
  
  // Hair
  ctx.fillStyle = '#4a3a2a';
  ctx.fillRect(x - 4, y - 14, 8, 4);
}

function drawSprayCan(x, y, color) {
  ctx.fillStyle = '#202026';
  ctx.fillRect(x + 2, y + 5, 10, 19);
  ctx.fillStyle = color;
  ctx.fillRect(x + 3, y + 8, 8, 12);
  ctx.fillStyle = '#cfc7b5';
  ctx.fillRect(x + 4, y + 2, 6, 4);
  ctx.fillStyle = '#141218';
  ctx.fillRect(x + 5, y, 4, 3);
}

function drawWallPainter(time) {
  // A painter on a scaffold up against the side of the Green Door Studio,
  // rolling paint onto the wall with a fresh coat dripping down.
  const wallBase = 4 * TILE + 6;  // where the roller meets the building wall
  const groundY  = 7 * TILE;      // ground below the building
  const platY    = 5 * TILE + 12; // scaffold platform height (high on the wall)
  const rollerY  = 4 * TILE + 10; // roller height on the wall

  // scaffold frame
  ctx.fillStyle = '#7a4a34';
  ctx.fillRect(wallBase + 2, platY - 3, 3, groundY - platY + 8);
  ctx.fillRect(wallBase + 28, platY - 3, 3, groundY - platY + 8);
  ctx.fillStyle = '#8a6a3a';
  ctx.fillRect(wallBase - 1, platY - 3, 36, 5);

  // painter standing on the platform
  const px = wallBase + 18, py = platY;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(px - 8, py - 2, 16, 4);            // shadow
  ctx.fillStyle = '#2c2c3a';                       // legs
  ctx.fillRect(px - 6, py - 30, 5, 28);
  ctx.fillRect(px + 1, py - 30, 5, 28);
  ctx.fillStyle = '#e8e4dc';                       // paint overalls / body
  ctx.fillRect(px - 7, py - 42, 14, 14);
  ctx.fillStyle = '#b87954';                       // head
  ctx.fillRect(px - 4, py - 50, 9, 9);
  ctx.fillStyle = '#2a2020';                       // hair
  ctx.fillRect(px - 5, py - 52, 11, 3);
  ctx.fillStyle = '#f0d060';                       // cap
  ctx.fillRect(px - 5, py - 53, 11, 2);

  // arm + roller pole reaching up to the wall
  ctx.strokeStyle = '#5a4a30';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px + 5, py - 38);
  ctx.lineTo(wallBase + 2, rollerY + 6);
  ctx.stroke();

  // roller head against the wall
  ctx.fillStyle = '#d04030';
  ctx.fillRect(wallBase + 2, rollerY, 11, 13);
  ctx.fillStyle = '#a03020';
  ctx.fillRect(wallBase + 2, rollerY + 9, 11, 4);

  // paint splatter on the wall around the roller
  ctx.fillStyle = 'rgba(208,64,48,0.6)';
  ctx.fillRect(wallBase - 2, rollerY + 3, 3, 3);
  ctx.fillRect(wallBase + 15, rollerY + 8, 3, 3);
  ctx.fillRect(wallBase - 4, rollerY + 13, 2, 2);

  // paint drips rolling down the wall
  ctx.fillStyle = '#d04030';
  for (let i = 0; i < 3; i++) {
    const dx = wallBase + 5 + i * 4;
    ctx.fillRect(dx, rollerY + 15, 2, 5 + i * 2);
  }
  // an animated drip that slides down the wall
  const drip = (time * 14) % 42;
  ctx.fillStyle = '#c84030';
  ctx.fillRect(wallBase + 11, rollerY + 16 + drip, 2, 6);
}

function drawCanvas(x, y, w, h, style) {
  ctx.strokeStyle = '#69472d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + h);
  ctx.lineTo(x + 2, y + h + 12);
  ctx.moveTo(x + w / 2, y + h);
  ctx.lineTo(x + w - 2, y + h + 12);
  ctx.stroke();

  ctx.fillStyle = '#d9cdb8';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#4a3427';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  if (style === 0) {
    ctx.strokeStyle = '#db4d3e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 3, y + h - 5);
    ctx.lineTo(x + 10, y + 9);
    ctx.lineTo(x + 16, y + 20);
    ctx.lineTo(x + 22, y + 5);
    ctx.stroke();
    ctx.strokeStyle = '#397bb4';
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 8);
    ctx.lineTo(x + 19, y + 26);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#d35a42';
    ctx.fillRect(x + 3, y + 5, 9, 10);
    ctx.fillStyle = '#407eb6';
    ctx.fillRect(x + 12, y + 16, 12, 11);
    ctx.fillStyle = '#d5a531';
    ctx.beginPath();
    ctx.arc(x + 10, y + 25, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6b4592';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 28);
    ctx.lineTo(x + 23, y + 7);
    ctx.stroke();
  }
}

function drawDeliScene(time) {
  const x = 3 * TILE;
  const y = 18 * TILE + 2;

  // Garbage can - moved to the left side of deli
  ctx.fillStyle = '#41454a';
  ctx.fillRect(x + 7, y + 8, 20, 25);
  ctx.fillStyle = '#5c6267';
  ctx.fillRect(x + 5, y + 6, 24, 5);
  ctx.fillStyle = '#303338';
  ctx.fillRect(x + 9, y + 13, 3, 15);
  ctx.fillRect(x + 17, y + 13, 3, 15);
  ctx.fillRect(x + 25, y + 13, 2, 15);

  // Small table with items - positioned in front of deli
  ctx.fillStyle = '#d8d0b8';
  ctx.fillRect(x + 11, y + 2, 8, 8);
  ctx.fillStyle = '#9a4038';
  ctx.fillRect(x + 18, y + 4, 6, 5);

  // Guitar player - positioned next to garbage can
  drawGuitarPlayer(x + 50, y + 12, time);
}

function drawGuitarPlayer(x, y, time) {
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(x - 13, y + 27, 31, 5);

  ctx.fillStyle = '#252638';
  ctx.fillRect(x - 10, y + 18, 8, 13);
  ctx.fillRect(x + 4, y + 17, 8, 14);

  ctx.fillStyle = '#1c1a20';
  ctx.fillRect(x - 13, y + 28, 10, 4);
  ctx.fillRect(x + 9, y + 28, 10, 4);

  ctx.fillStyle = '#bd5745';
  ctx.fillRect(x - 8, y + 7, 17, 14);

  ctx.fillStyle = '#b87954';
  ctx.fillRect(x - 5, y - 1, 11, 11);

  ctx.fillStyle = '#2b211e';
  ctx.fillRect(x - 6, y - 4, 13, 5);
  ctx.fillRect(x - 7, y - 1, 3, 7);

  ctx.fillStyle = '#c8903e';
  ctx.beginPath();
  ctx.ellipse(x + 4, y + 13, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#704525';
  ctx.beginPath();
  ctx.arc(x + 4, y + 13, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#704525';
  ctx.fillRect(x - 19, y + 5, 22, 3);

  ctx.strokeStyle = '#ead8a4';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 18, y + 5);
  ctx.lineTo(x + 10, y + 13);
  ctx.moveTo(x - 18, y + 7);
  ctx.lineTo(x + 10, y + 14);
  ctx.stroke();

  const strum = Math.floor(time * 5) % 2;
  ctx.fillStyle = '#b87954';
  ctx.fillRect(x + 9, y + 7 + strum, 5, 6);
}

function drawCoffeeCart() {
  const x = 27 * TILE + 5;
  const y = 18 * TILE + 4;

  ctx.fillStyle = '#202126';
  ctx.beginPath();
  ctx.arc(x + 8, y + 27, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 48, y + 27, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#e8d4a3';
  ctx.fillRect(x + 3, y + 5, 50, 23);
  ctx.strokeStyle = '#594432';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 3, y + 5, 50, 23);

  ctx.fillStyle = '#9a513d';
  ctx.fillRect(x, y, 56, 7);
  ctx.fillStyle = '#f0d4a0';
  for (let i = 0; i < 4; i++) ctx.fillRect(x + 4 + i * 13, y, 7, 7);

  ctx.fillStyle = '#493326';
  ctx.fillRect(x + 17, y + 9, 24, 8);
  ctx.fillStyle = '#f4ecd8';
  ctx.font = 'bold 6px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('COFFEE', x + 29, y + 15);

  ctx.fillStyle = '#666a6d';
  ctx.fillRect(x + 7, y + 18, 12, 8);

  ctx.fillStyle = '#f2e5c7';
  ctx.fillRect(x + 25, y + 19, 7, 7);
  ctx.fillStyle = '#5c3928';
  ctx.fillRect(x + 26, y + 18, 5, 3);

  ctx.fillStyle = '#70432d';
  ctx.fillRect(x + 37, y + 18, 10, 8);
  ctx.fillStyle = '#e9d5ad';
  ctx.fillRect(x + 39, y + 20, 6, 1);
  ctx.fillRect(x + 39, y + 23, 5, 1);
}

// A little hippie-creamery ice cream van, tucked into the map's lower-right
// corner. Purely cosmetic (like the coffee cart / deli scene), not a
// building — the player can't walk into it or enter it.
function drawIceCreamVan() {
  const x = 35.2 * TILE, y = 21.4 * TILE;
  const w = 92, h = 48;

  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h + 4, w / 2 + 2, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // wheels
  ctx.fillStyle = '#1c1a20';
  ctx.beginPath(); ctx.arc(x + 18, y + h - 2, 8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w - 18, y + h - 2, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#54525c';
  ctx.beginPath(); ctx.arc(x + 18, y + h - 2, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w - 18, y + h - 2, 3, 0, Math.PI * 2); ctx.fill();

  // van body — cream base with a mint-green roof band
  ctx.fillStyle = '#f4ecd8';
  ctx.fillRect(x, y + 14, w, h - 22);
  ctx.fillStyle = '#5fa38a';
  ctx.fillRect(x, y, w, 16);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(x, y + 14, w, 3);

  // gentle cow-spot pattern on the lower panel, callback to Vermont dairy
  // country rather than any specific brand's trade dress
  ctx.fillStyle = 'rgba(40,34,30,0.55)';
  const spotRng = coverRng('icecreamvan');
  for (let i = 0; i < 6; i++) {
    const sx2 = x + 6 + spotRng() * (w - 12), sy2 = y + 20 + spotRng() * (h - 30);
    ctx.beginPath();
    ctx.ellipse(sx2, sy2, 5 + spotRng() * 4, 3 + spotRng() * 3, spotRng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // serving window with an awning
  const winX = x + w - 34, winY = y + 16, winW = 26, winH = 14;
  ctx.fillStyle = '#dff0ea';
  ctx.fillRect(winX, winY, winW, winH);
  ctx.strokeStyle = '#3a2e20';
  ctx.lineWidth = 2;
  ctx.strokeRect(winX, winY, winW, winH);
  ctx.fillStyle = '#d8604a';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(winX + i * (winW / 4), winY - 1);
    ctx.lineTo(winX + (i + 0.5) * (winW / 4), winY - 8);
    ctx.lineTo(winX + (i + 1) * (winW / 4), winY - 1);
    ctx.closePath();
    ctx.fill();
  }

  // windshield up front
  ctx.fillStyle = '#cfe6f2';
  ctx.fillRect(x + 4, y + 17, 16, 11);
  ctx.strokeStyle = '#3a2e20';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 4, y + 17, 16, 11);

  // soft-serve cone sign mounted on the roof
  const cx = x + w * 0.42, cy = y - 8;
  ctx.fillStyle = '#e8c078';
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy + 2); ctx.lineTo(cx + 5, cy + 2); ctx.lineTo(cx, cy + 12);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f4ecd8';
  ctx.beginPath();
  ctx.arc(cx, cy - 3, 6, Math.PI, 0); ctx.fill();
  ctx.beginPath(); ctx.arc(cx - 3, cy - 6, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 3, cy - 6, 4, 0, Math.PI * 2); ctx.fill();

  // hand-painted name banner along the body
  ctx.fillStyle = '#3a2e20';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('UDDERLY GOOD', x + w * 0.36, y + h - 8);
  ctx.font = '6px monospace';
  ctx.fillText('CREAMERY', x + w * 0.36, y + h - 1);
}

function drawAnthillBillboard() {
  const x = 14 * TILE;
  const y = 4 * TILE;
  const w = 150, h = 54;

  ctx.fillStyle = '#553c2b';
  ctx.fillRect(x + 15, y + h, 7, 38);
  ctx.fillRect(x + w - 22, y + h, 7, 38);

  ctx.fillStyle = '#29242a';
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);

  ctx.fillStyle = '#d6c35e';
  ctx.fillRect(x, y, w, h);

  // Graffiti mural artwork fills the board (cover-fit, cropped to the frame)
  if (anthillBillboardImg.complete && anthillBillboardImg.naturalWidth) {
    const ix = x + 4, iy = y + 4, iw = w - 8, ih = h - 8;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ix, iy, iw, ih);
    ctx.clip();
    const scale = Math.max(iw / anthillBillboardImg.naturalWidth, ih / anthillBillboardImg.naturalHeight);
    const dw = anthillBillboardImg.naturalWidth * scale;
    const dh = anthillBillboardImg.naturalHeight * scale;
    const dx = ix + (iw - dw) / 2;
    const dy = iy + (ih - dh) / 2;
    ctx.drawImage(anthillBillboardImg, dx, dy, dw, dh);
    ctx.restore();
  }

  ctx.strokeStyle = '#4b3928';
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
}

function drawOldLotByHeyBud() {
  const x = 28 * TILE, y = 7 * TILE;
  const w = 9 * TILE, h = 2 * TILE;

  ctx.fillStyle = '#5a5a5e';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#4c4c50';
  for (let i = 0; i < 14; i++) {
    ctx.fillRect(x + (i * 37) % w, y + (i * 23) % h, 10, 3);
  }

  ctx.strokeStyle = 'rgba(230,220,180,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const lx = x + 14 + i * 34;
    ctx.beginPath();
    ctx.moveTo(lx, y + 6);
    ctx.lineTo(lx, y + h - 6);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(20,20,22,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 10, y + 4);
  ctx.lineTo(x + 40, y + h - 10);
  ctx.lineTo(x + 70, y + 8);
  ctx.moveTo(x + 120, y + 6);
  ctx.lineTo(x + 150, y + h - 6);
  ctx.stroke();

  ctx.fillStyle = '#4a8a3e';
  const weeds = [[18,10],[62,44],[130,20],[190,50],[230,12]];
  for (const [wx, wy] of weeds) {
    ctx.fillRect(x + wx, y + wy, 2, 6);
    ctx.fillRect(x + wx - 3, y + wy + 2, 2, 5);
    ctx.fillRect(x + wx + 3, y + wy + 2, 2, 5);
  }

  ctx.fillStyle = '#7a3a26';
  ctx.fillRect(x + w - 30, y + 8, 14, 20);
  ctx.fillStyle = '#5a2818';
  ctx.fillRect(x + w - 30, y + 12, 14, 3);
  ctx.fillRect(x + w - 30, y + 20, 14, 3);

  ctx.save();
  ctx.translate(x + 6, y + h - 4);
  ctx.rotate(-0.25);
  ctx.fillStyle = '#8a7a5a';
  ctx.fillRect(-2, -22, 16, 22);
  ctx.restore();
}

function drawParkedCar(x, y, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x + 1, y + 23, 32, 6);

  ctx.fillStyle = '#161616';
  ctx.fillRect(x - 1, y + 5, 4, 8);
  ctx.fillRect(x - 1, y + 16, 4, 8);
  ctx.fillRect(x + 31, y + 5, 4, 8);
  ctx.fillRect(x + 31, y + 16, 4, 8);

  ctx.fillStyle = color;
  ctx.fillRect(x, y + 3, 34, 20);
  ctx.fillRect(x + 4, y, 26, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x, y + 19, 34, 4);

  ctx.fillStyle = '#bcd6e8';
  ctx.fillRect(x + 7, y + 1, 8, 6);
  ctx.fillRect(x + 19, y + 1, 8, 6);

  ctx.fillStyle = '#f0e090';
  ctx.fillRect(x + 30, y + 5, 3, 3);
  ctx.fillStyle = '#c04040';
  ctx.fillRect(x + 1, y + 17, 3, 3);
}

function drawHeyBudParkedCars() {
  // a couple of cars parked in the gravel lot right beside Hey Bud,
  // kept clear of the doorway path through the middle of the lot
  drawParkedCar(28 * TILE + 18, 7 * TILE + 8, '#4a7a8c');
  drawParkedCar(28 * TILE + 168, 7 * TILE + 4, '#8a3f3a');
}

function drawSmokingPerson(time) {
  // Person smoking outside Hey Bud on the right side
  const x = 35 * TILE - 10;
  const y = 6 * TILE + 8;
  
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x - 6, y + 20, 12, 4);
  
  // Legs
  ctx.fillStyle = '#2a3a5a';
  ctx.fillRect(x - 3, y + 10, 3, 10);
  ctx.fillRect(x + 1, y + 10, 3, 10);
  
  // Body
  ctx.fillStyle = '#5a4a6a';
  ctx.fillRect(x - 4, y, 9, 12);
  
  // Head
  ctx.fillStyle = '#c89a72';
  ctx.fillRect(x - 3, y - 6, 7, 7);
  
  // Hair
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(x - 3, y - 8, 7, 3);
  
  // Arm holding cigarette
  ctx.fillStyle = '#c89a72';
  ctx.fillRect(x + 5, y + 2, 8, 2);
  
  // Cigarette with glowing tip
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(x + 13, y + 2, 6, 1);
  
  // Glowing cigarette tip (flickers)
  const glow = Math.floor(time * 4) % 3 !== 0;
  if (glow) {
    ctx.fillStyle = '#ff6030';
    ctx.fillRect(x + 19, y + 2, 2, 1);
  }
  
  // Smoke wisps rising
  ctx.save();
  ctx.strokeStyle = 'rgba(180,180,190,0.4)';
  ctx.lineWidth = 1;
  const smokeOffset = (time * 20) % 15;
  ctx.beginPath();
  ctx.moveTo(x + 20, y + 2);
  ctx.lineTo(x + 21 + Math.sin(smokeOffset) * 2, y - 8 - smokeOffset);
  ctx.stroke();
  ctx.restore();
}

function drawWallPoster(px, py, w, h) {
  // portrait poster on the side of the storefront wall, between the
  // shop sign and the windows
  const pw = 34, ph = Math.round(pw * 806 / 555);
  const x = px + w - pw - 14;
  const y = py + 100; // moved down to make room for neon sign

  ctx.fillStyle = '#1c1a20';
  ctx.fillRect(x - 3, y - 3, pw + 6, ph + 6);
  ctx.fillStyle = '#f4ecd8';
  ctx.fillRect(x - 1, y - 1, pw + 2, ph + 2);

  if (purePopPosterImg.complete && purePopPosterImg.naturalWidth) {
    ctx.drawImage(purePopPosterImg, x, y, pw, ph);
  } else {
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(x, y, pw, ph);
  }

  ctx.fillStyle = 'rgba(230,224,200,0.6)';
  ctx.fillRect(x - 4, y - 4, 8, 4);
  ctx.fillRect(x + pw - 4, y - 4, 8, 4);
}

function drawThursPoster(x, y) {
  // "3rd Thursdays" monthly hip-hop night flyer (SK1's event) taped to a window/wall.
  const pw = 28, ph = 38;

  // tape corners
  ctx.fillStyle = 'rgba(230,224,200,0.75)';
  ctx.fillRect(x - 3, y - 4, 7, 4);
  ctx.fillRect(x + pw - 4, y - 4, 7, 4);
  ctx.fillRect(x - 3, y + ph - 1, 7, 4);
  ctx.fillRect(x + pw - 4, y + ph - 1, 7, 4);

  // paper
  ctx.fillStyle = '#efe6c9';
  ctx.fillRect(x, y, pw, ph);
  ctx.strokeStyle = '#a9a876';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, pw, ph);

  // red header ribbon
  ctx.fillStyle = '#c92c2a';
  ctx.fillRect(x, y, pw, 9);
  ctx.fillStyle = '#fbe6b0';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('3RD', x + pw / 2, y + 8);

  // body lines
  ctx.fillStyle = '#20232c';
  ctx.font = 'bold 7px monospace';
  ctx.fillText('THURS', x + pw / 2, y + 16);
  ctx.font = 'bold 5px monospace';
  ctx.fillText('HIP HOP', x + pw / 2, y + 23);
  ctx.font = 'bold 7px monospace';
  ctx.fillText('NIGHT', x + pw / 2, y + 29);

  // little vinyl record icon
  ctx.fillStyle = '#1a1a1e';
  ctx.beginPath();
  ctx.arc(x + pw / 2, y + 33, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c92b2a';
  ctx.beginPath();
  ctx.arc(x + pw / 2, y + 33, 1.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawNectarsDecor(px, py, w, h) {
  ctx.save();
  
  // Dark brick texture for taller rock club building
  ctx.fillStyle = '#1a1a24';
  for (let by = 0; by < 6; by++) {
    const brickY = py + 34 + by * 16;
    ctx.strokeStyle = '#0a0a14';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, brickY);
    ctx.lineTo(px + w, brickY);
    ctx.stroke();
  }
  
  // Neon script sign - "Nectar's"
  const signX = px + w/2;
  const signY = py + 60;
  
  // Outer glow
  ctx.shadowColor = '#ff2040';
  ctx.shadowBlur = 20;
  ctx.strokeStyle = '#ff2040';
  ctx.lineWidth = 1;
  ctx.font = 'italic bold 32px cursive';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText("Nectar's", signX, signY);
  
  // Inner bright glow
  ctx.shadowBlur = 15;
  ctx.strokeStyle = '#ff4060';
  ctx.lineWidth = 2;
  ctx.strokeText("Nectar's", signX, signY);
  
  // Bright core
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ffe0e6';
  ctx.fillText("Nectar's", signX, signY);
  
  // Reset shadow
  ctx.shadowBlur = 0;
  
  // Windows with warm glow
  ctx.fillStyle = '#ffe090';
  ctx.fillRect(px + 8, py + h - TILE - 14, 14, 16);
  ctx.fillRect(px + w - 22, py + h - TILE - 14, 14, 16);
  ctx.fillRect(px + 8, py + h - TILE * 2 - 14, 14, 16);
  ctx.fillRect(px + w - 22, py + h - TILE * 2 - 14, 14, 16);
  
  // Window panes
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px + 15, py + h - TILE - 14);
  ctx.lineTo(px + 15, py + h - TILE + 2);
  ctx.moveTo(px + w - 15, py + h - TILE - 14);
  ctx.lineTo(px + w - 15, py + h - TILE + 2);
  ctx.stroke();
  
  ctx.restore();
}

function drawJuniorsDecor(px, py, w, h) {
  ctx.save();
  
  // Red brick pattern
  ctx.fillStyle = '#c84030';
  for (let by = 0; by < 4; by++) {
    const brickY = py + 34 + by * 16;
    ctx.strokeStyle = '#a83020';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, brickY);
    ctx.lineTo(px + w, brickY);
    ctx.stroke();
  }
  
  // Pizza slice sign on front
  const signX = px + w/2;
  const signY = py + 55;
  
  // Pizza slice shape
  ctx.fillStyle = '#f0d060';
  ctx.beginPath();
  ctx.moveTo(signX, signY - 10);
  ctx.lineTo(signX + 15, signY + 10);
  ctx.lineTo(signX - 15, signY + 10);
  ctx.closePath();
  ctx.fill();
  
  // Pizza toppings (pepperoni dots)
  ctx.fillStyle = '#d04030';
  ctx.fillRect(signX - 5, signY, 4, 4);
  ctx.fillRect(signX + 3, signY + 4, 3, 3);
  ctx.fillRect(signX - 8, signY + 6, 3, 3);
  
  // Cheese highlights
  ctx.fillStyle = '#ffe890';
  ctx.fillRect(signX - 2, signY - 4, 4, 2);
  ctx.fillRect(signX + 6, signY + 2, 3, 2);
  
  // Window with checkered curtain pattern
  ctx.fillStyle = '#e8f0f8';
  ctx.fillRect(px + 8, py + h - TILE - 14, 20, 18);
  
  // Checkered curtain
  ctx.fillStyle = '#d84848';
  for (let cy = 0; cy < 3; cy++) {
    for (let cx = 0; cx < 3; cx++) {
      if ((cx + cy) % 2 === 0) {
        ctx.fillRect(px + 8 + cx * 6, py + h - TILE - 14 + cy * 6, 6, 6);
      }
    }
  }
  
  ctx.restore();
}

function drawJuniorsInterior(time) {
  // Classic NY style pizza shop interior
  
  // Pizza oven (left side, back wall)
  const ovenX = 1 * TILE + 8;
  const ovenY = 1 * TILE + 8;
  const ovenW = 2 * TILE;
  const ovenH = TILE + 8;
  
  // Oven body (brick)
  ctx.fillStyle = '#8a4a3a';
  ctx.fillRect(ovenX, ovenY, ovenW, ovenH);
  
  // Oven opening with glow
  ctx.save();
  ctx.fillStyle = '#ff6030';
  ctx.shadowColor = '#ff6030';
  ctx.shadowBlur = 12;
  ctx.fillRect(ovenX + 12, ovenY + 10, ovenW - 24, ovenH - 20);
  ctx.shadowBlur = 0;
  ctx.restore();
  
  // Oven door frame
  ctx.strokeStyle = '#3a2a1a';
  ctx.lineWidth = 3;
  ctx.strokeRect(ovenX + 10, ovenY + 8, ovenW - 20, ovenH - 16);
  
  // Pizza peel leaning against wall
  const peelX = ovenX + ovenW + 6;
  const peelY = ovenY + ovenH - 30;
  ctx.fillStyle = '#9a7050';
  ctx.fillRect(peelX, peelY, 4, 30);
  ctx.fillRect(peelX - 6, peelY - 4, 16, 6);
  
  // Counter (right side)
  const counterX = 9 * TILE;
  const counterY = 4 * TILE;
  const counterW = 3 * TILE;
  const counterH = 2 * TILE;
  
  ctx.fillStyle = '#6a4a3a';
  ctx.fillRect(counterX, counterY, counterW, counterH);
  ctx.fillStyle = '#8a6a4a';
  ctx.fillRect(counterX, counterY, counterW, 8);
  
  // Glass display case on counter
  ctx.fillStyle = 'rgba(200,220,240,0.3)';
  ctx.fillRect(counterX + 6, counterY + 10, counterW - 12, 24);
  ctx.strokeStyle = '#9a9a9e';
  ctx.lineWidth = 2;
  ctx.strokeRect(counterX + 6, counterY + 10, counterW - 12, 24);
  
  // Pizza slices in display
  ctx.fillStyle = '#f0d060';
  for (let i = 0; i < 3; i++) {
    const sliceX = counterX + 12 + i * 14;
    const sliceY = counterY + 20;
    ctx.beginPath();
    ctx.moveTo(sliceX, sliceY - 4);
    ctx.lineTo(sliceX + 8, sliceY + 4);
    ctx.lineTo(sliceX, sliceY + 4);
    ctx.closePath();
    ctx.fill();
    
    // Pepperoni
    ctx.fillStyle = '#d04030';
    ctx.fillRect(sliceX + 2, sliceY, 2, 2);
    ctx.fillStyle = '#f0d060';
  }
  
  // "PIZZA" sign on back wall
  const signX = 6 * TILE;
  const signY = 1 * TILE + 2;
  
  ctx.fillStyle = '#e8e030';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PIZZA', signX, signY + 12);
  
  // Menu board
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(signX + TILE, signY - 8, TILE + 12, 32);
  ctx.fillStyle = '#f0f0f0';
  ctx.font = '8px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('SLICE $3', signX + TILE + 4, signY + 4);
  ctx.fillText('PIE $18', signX + TILE + 4, signY + 14);
  
  // Napkin dispenser on counter
  ctx.fillStyle = '#c0c0c8';
  ctx.fillRect(counterX + counterW - 20, counterY + 36, 12, 10);
  
  // Oregano shaker
  ctx.fillStyle = '#d04030';
  ctx.fillRect(counterX + 10, counterY + 38, 6, 10);
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(counterX + 11, counterY + 40, 4, 2);
  
  // Parmesan shaker  
  ctx.fillStyle = '#60a060';
  ctx.fillRect(counterX + 20, counterY + 38, 6, 10);
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(counterX + 21, counterY + 40, 4, 2);
  
  // Checkered floor accent (a few tiles near entrance for NY vibe)
  const floorChecks = [[6, 8], [7, 8], [6, 9], [7, 9]];
  for (const [fx, fy] of floorChecks) {
    if ((fx + fy) % 2 === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(fx * TILE, fy * TILE, TILE, TILE);
    }
  }
}

function drawYardSign(x, y) {
  ctx.strokeStyle = '#9a9a9a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 9, y + 27);
  ctx.lineTo(x + 9, y + 44);
  ctx.moveTo(x + 33, y + 27);
  ctx.lineTo(x + 33, y + 44);
  ctx.stroke();

  ctx.fillStyle = '#f4ecd8';
  ctx.fillRect(x, y, 44, 29);
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, 42, 27);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#1c3f7a';
  ctx.font = 'bold 10px monospace';
  ctx.fillText('KANGA', x + 22, y + 14);
  ctx.fillStyle = '#c0392b';
  ctx.font = 'bold 9px monospace';
  ctx.fillText('FOR MAYOR', x + 22, y + 25);

  ctx.fillStyle = '#c0392b';
  ctx.fillRect(x + 3, y + 3, 3, 3);
  ctx.fillRect(x + 38, y + 3, 3, 3);
}

function drawBench(x, y, w) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x, y + 25, w, 3);

  ctx.fillStyle = '#4a3018';
  ctx.fillRect(x + 3, y + 16, 4, 10);
  ctx.fillRect(x + w - 7, y + 16, 4, 10);

  ctx.fillStyle = '#8a5a30';
  ctx.fillRect(x, y + 10, w, 6);
  ctx.fillStyle = '#6a4020';
  ctx.fillRect(x, y + 15, w, 2);

  ctx.fillStyle = '#8a5a30';
  ctx.fillRect(x + 2, y, 4, 12);
  ctx.fillRect(x + w / 2 - 2, y, 4, 12);
  ctx.fillRect(x + w - 6, y, 4, 12);
}

function drawNectarsInterior(time) {
  // Dark rock club atmosphere with stage, bar, and gravy fries station
  
  // Stage area (top center with small platform)
  const stageX = 5 * TILE;
  const stageY = 2 * TILE + TILE;
  const stageW = 4 * TILE;
  const stageH = 12;
  
  // Stage platform
  ctx.fillStyle = '#3a2a40';
  ctx.fillRect(stageX, stageY, stageW, stageH);
  ctx.fillStyle = '#2a1a30';
  ctx.fillRect(stageX + 2, stageY + 2, stageW - 4, 2);
  
  // Microphone stand on stage
  ctx.fillStyle = '#8a8a8e';
  ctx.fillRect(stageX + stageW/2 - 1, stageY - 20, 2, 20);
  ctx.fillStyle = '#5a5a5e';
  ctx.fillRect(stageX + stageW/2 - 3, stageY - 24, 6, 6);
  
  // Amp on stage
  ctx.fillStyle = '#1a1a1e';
  ctx.fillRect(stageX + 8, stageY - 14, 16, 14);
  ctx.fillStyle = '#4a3a2a';
  ctx.fillRect(stageX + 10, stageY - 12, 12, 10);
  ctx.fillStyle = '#2a2a2e';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(stageX + 11, stageY - 11 + i * 3, 3, 2);
    ctx.fillRect(stageX + 16, stageY - 11 + i * 3, 3, 2);
  }
  
  // Bar area (left side)
  const barX = TILE;
  const barY = 4 * TILE;
  const barW = 2 * TILE;
  const barH = 3 * TILE;
  
  // Bar counter
  ctx.fillStyle = '#4a3a2a';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = '#6a5a3a';
  ctx.fillRect(barX, barY, barW, 6);
  
  // Glasses on bar
  ctx.fillStyle = 'rgba(200,220,240,0.4)';
  ctx.fillRect(barX + 8, barY + 10, 6, 8);
  ctx.fillRect(barX + 18, barY + 10, 6, 8);
  
  // Gravy Fries station sign (right side)
  const signX = 10 * TILE;
  const signY = 4 * TILE;
  
  ctx.fillStyle = '#5a3a2a';
  ctx.fillRect(signX, signY, 3 * TILE, 18);
  
  // "GRAVY FRIES" text
  ctx.save();
  ctx.fillStyle = '#f0d060';
  ctx.shadowColor = '#f0d060';
  ctx.shadowBlur = 6;
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('GRAVY', signX + 1.5 * TILE, signY + 8);
  ctx.fillText('FRIES', signX + 1.5 * TILE, signY + 16);
  ctx.shadowBlur = 0;
  ctx.restore();
  
  // Neon "OPEN" sign (flickering)
  const openX = 11 * TILE;
  const openY = 6 * TILE;
  const flicker = Math.floor(time * 3) % 7 !== 0;
  
  if (flicker) {
    ctx.save();
    ctx.fillStyle = '#ff2060';
    ctx.shadowColor = '#ff2060';
    ctx.shadowBlur = 10;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('OPEN', openX, openY);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
  
  // Hanging lights (dim red/purple glow)
  const lights = [[3, 5], [7, 5], [11, 5]];
  for (const [lx, ly] of lights) {
    const lightX = lx * TILE + TILE/2;
    const lightY = ly * TILE;
    
    ctx.save();
    ctx.fillStyle = '#8a2040';
    ctx.shadowColor = '#8a2040';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(lightX, lightY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
    
    // Light cord
    ctx.strokeStyle = '#3a3a3e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lightX, lightY - 4);
    ctx.lineTo(lightX, lightY - 20);
    ctx.stroke();
  }
  
  // Bar stools (simple rectangles)
  const stools = [[barX + barW + 4, barY + 8], [barX + barW + 4, barY + 24]];
  for (const [sx, sy] of stools) {
    ctx.fillStyle = '#5a3a2a';
    ctx.fillRect(sx, sy, 8, 4);
    ctx.fillStyle = '#4a2a1a';
    ctx.fillRect(sx + 2, sy - 8, 4, 8);
  }
}

function drawDeliSeatingArea() {
  // a small seating nook down by the riverbank, a bit removed from the
  // deli's front door so it reads as its own little spot
  const x = 9 * TILE, y = 19 * TILE + 10;

  ctx.fillStyle = 'rgba(110,98,76,0.5)';
  ctx.beginPath();
  ctx.ellipse(x + 46, y + 20, 60, 32, 0, 0, Math.PI * 2);
  ctx.fill();

  drawBench(x, y, 34);
  drawBench(x + 58, y, 34);

  ctx.fillStyle = '#6a4a2a';
  ctx.fillRect(x + 42, y + 14, 4, 12);
  ctx.fillStyle = '#9a7a50';
  ctx.beginPath();
  ctx.ellipse(x + 44, y + 10, 16, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#5a3e22';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#5a4028';
  ctx.fillRect(x + 90, y - 4, 14, 10);
  ctx.fillStyle = '#4d8c3d';
  ctx.fillRect(x + 92, y - 12, 4, 10);
  ctx.fillRect(x + 98, y - 15, 4, 13);
  ctx.fillRect(x + 102, y - 10, 4, 8);

  ctx.fillStyle = '#454a4d';
  ctx.fillRect(x - 14, y + 4, 12, 16);
  ctx.fillStyle = '#5c6265';
  ctx.fillRect(x - 15, y + 2, 14, 4);
}

// ---------------------------------------------------------------- keeper
const KEEPER_HAIR = { DEE: '#5a2e1c', ROSIE: '#c8c0b0', ZEKE: '#241a12', JADE: '#141014', TONY: '#2a2018' };

// Optional per-keeper artwork. Drop a PNG at assets/keepers/<name>.png (any
// size — it's scaled to KEEPER_SPR_H, feet anchored at the same floor line
// the procedural sprite uses) and it's picked up automatically. Until a file
// exists (or while it's still loading), drawKeeper falls back to the shaded
// procedural sprite below, so nothing ever renders blank.
const KEEPER_NAMES = ['SK1', 'DEE', 'ROSIE', 'ZEKE', 'JADE', 'TONY'];
const KEEPER_SPR_H = 64;
const keeperImgs = {};
KEEPER_NAMES.forEach((name) => {
  const img = new Image();
  img.src = `assets/keepers/${name.toLowerCase()}.png`;
  keeperImgs[name] = img;
});

function drawAnt(cx, cy, s) {
  // A white ant silhouette (the Anthill Collective mark), drawn on SK1's hat.
  // Side profile: head + antennae at the front-right, thorax, big abdomen at the rear.
  ctx.fillStyle = '#f4f0e2';
  // abdomen (rear, left)
  ctx.beginPath(); ctx.arc(cx - 3.0 * s, cy + 0.4 * s, 1.9 * s, 0, Math.PI * 2); ctx.fill();
  // thorax (middle)
  ctx.beginPath(); ctx.arc(cx - 0.4 * s, cy - 0.1 * s, 1.2 * s, 0, Math.PI * 2); ctx.fill();
  // head (front, right)
  ctx.beginPath(); ctx.arc(cx + 2.1 * s, cy - 0.4 * s, 1.2 * s, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#f2efe3';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 1.8 * s, cy); ctx.lineTo(cx - 0.8 * s, cy);           // waist
  // antennae (up off the head)
  ctx.moveTo(cx + 1.7 * s, cy - 1.0 * s); ctx.lineTo(cx + 2.4 * s, cy - 2.2 * s);
  ctx.moveTo(cx + 2.5 * s, cy - 0.9 * s); ctx.lineTo(cx + 3.3 * s, cy - 2.0 * s);
  // legs (down off the body)
  ctx.moveTo(cx - 0.9 * s, cy + 0.5 * s); ctx.lineTo(cx - 1.5 * s, cy + 2.3 * s);
  ctx.moveTo(cx - 0.1 * s, cy + 0.6 * s); ctx.lineTo(cx - 0.2 * s, cy + 2.4 * s);
  ctx.moveTo(cx + 1.0 * s, cy + 0.3 * s); ctx.lineTo(cx + 1.6 * s, cy + 2.0 * s);
  ctx.moveTo(cx - 2.3 * s, cy + 1.0 * s); ctx.lineTo(cx - 3.0 * s, cy + 2.3 * s);
  ctx.moveTo(cx - 3.6 * s, cy + 0.9 * s); ctx.lineTo(cx - 4.2 * s, cy + 2.1 * s);
  ctx.stroke();
}

function drawKeeper(k) {
  const px = k.x * TILE, py = k.y * TILE;

  // ground shadow (shared by both the image and procedural paths)
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(px + 8, py + 26, 16, 4);

  const img = keeperImgs[k.name];
  if (img && img.complete && img.naturalWidth) {
    const kh = KEEPER_SPR_H;
    const kw = Math.round(kh * img.naturalWidth / img.naturalHeight);
    ctx.drawImage(img, Math.round(px + 16 - kw / 2), Math.round(py + 30 - kh), kw, kh);
    return;
  }

  const outline = '#1c140f';
  const shirtDark = shadeColor(k.shirt, -45);
  const shirtLight = shadeColor(k.shirt, 35);
  const skinDark = shadeColor(k.skin, -30);
  const skinLight = shadeColor(k.skin, 22);
  const hair = KEEPER_HAIR[k.name] || '#241a14';
  const hairDark = shadeColor(hair, -35);

  // torso: outline, base shirt, shadowed side, highlighted side
  ctx.fillStyle = outline;
  ctx.fillRect(px + 7, py + 11, 18, 16);
  ctx.fillStyle = k.shirt;
  ctx.fillRect(px + 8, py + 12, 16, 14);
  ctx.fillStyle = shirtDark;
  ctx.fillRect(px + 8, py + 12, 5, 14);
  ctx.fillStyle = shirtLight;
  ctx.fillRect(px + 19, py + 12, 4, 5);

  // arms at the sides, with hands
  ctx.fillStyle = outline;
  ctx.fillRect(px + 4, py + 13, 6, 11);
  ctx.fillRect(px + 22, py + 13, 6, 11);
  ctx.fillStyle = k.shirt;
  ctx.fillRect(px + 5, py + 14, 4, 7);
  ctx.fillRect(px + 23, py + 14, 4, 7);
  ctx.fillStyle = k.skin;
  ctx.fillRect(px + 5, py + 20, 4, 4);
  ctx.fillRect(px + 23, py + 20, 4, 4);

  // head: outline, base skin, shadowed/highlighted sides
  ctx.fillStyle = outline;
  ctx.fillRect(px + 9, py + 1, 14, 13);
  ctx.fillStyle = k.skin;
  ctx.fillRect(px + 10, py + 2, 12, 11);
  ctx.fillStyle = skinDark;
  ctx.fillRect(px + 10, py + 2, 3, 11);
  ctx.fillStyle = skinLight;
  ctx.fillRect(px + 18, py + 2, 3, 5);

  // face: brows, eyes, nose, mouth
  ctx.fillStyle = hairDark;
  ctx.fillRect(px + 12, py + 5, 2, 1);
  ctx.fillRect(px + 18, py + 5, 2, 1);
  ctx.fillStyle = '#201818';
  ctx.fillRect(px + 12, py + 6, 2, 2);
  ctx.fillRect(px + 18, py + 6, 2, 2);
  ctx.fillStyle = skinDark;
  ctx.fillRect(px + 15, py + 8, 2, 2);
  ctx.fillStyle = '#5a3428';
  ctx.fillRect(px + 13, py + 11, 6, 1);

  if (k.name === 'SK1') {
    // black hat with a white Anthill ant on the front
    ctx.fillStyle = '#15131a';                     // hat crown
    ctx.fillRect(px + 6, py - 4, 20, 7);
    ctx.fillStyle = '#0d0b12';                     // hat brim
    ctx.fillRect(px + 7, py + 3, 22, 3);
    drawAnt(px + 15, py + 1, 1.4);
  } else {
    // outlined, shaded hair
    ctx.fillStyle = outline;
    ctx.fillRect(px + 8, py - 2, 16, 6);
    ctx.fillStyle = hair;
    ctx.fillRect(px + 9, py - 1, 14, 5);
    ctx.fillStyle = hairDark;
    ctx.fillRect(px + 9, py - 1, 14, 2);
  }
}

// ---------------------------------------------------------------- player
function drawPlayer(time) {
  const row = DIR_ROW[player.dir];
  let col = 0;
  if (player.moving) col = [0, 1, 0, 2][Math.floor(player.animT * 7) % 4];
  if (player.skating) col = player.moving ? 2 : 0;

  const bob = player.skating && player.moving ? Math.sin(time * 14) * 1.5 : 0;
  const footY = player.y + 6;

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(player.x - 11, footY - 3, 22, 5);

  if (player.skating) {
    ctx.fillStyle = '#8a4a20';
    ctx.fillRect(player.x - 14, footY - 3 + bob, 28, 4);
    ctx.fillStyle = '#e8d8b0';
    ctx.fillRect(player.x - 10, footY + 1 + bob, 5, 4);
    ctx.fillRect(player.x + 5, footY + 1 + bob, 5, 4);
  }
  if (ricoImg.complete && ricoImg.naturalWidth) {
    ctx.drawImage(ricoImg, col * SHEET_CW, row * SHEET_CH, SHEET_CW, SHEET_CH,
      Math.round(player.x - SPR_W / 2), Math.round(footY - SPR_H - (player.skating ? 4 : 0) + bob),
      SPR_W, SPR_H);
  } else {
    ctx.fillStyle = '#d0a060';
    ctx.fillRect(player.x - 8, footY - 40, 16, 40);
  }

  const spriteTopY = footY - SPR_H - (player.skating ? 4 : 0) + bob;
  if (player.tempItem === 'coldBrew') {
    drawPlayerColdBrew(spriteTopY);
  } else if (player.tempItem === 'iceCream') {
    drawPlayerIceCream(spriteTopY);
  } else {
    if (player.holdingCoffee) drawPlayerColdBrew(spriteTopY);
    if (player.holdingTea) drawPlayerIcedTea(spriteTopY);
  }
}

// A cold brew coffee, iced and dark, in a to-go cup with a straw — held at
// Rico's side.
function drawPlayerColdBrew(spriteTopY) {
  const hx = player.x + (player.dir === 'left' ? -13 : 13), hy = spriteTopY + SPR_H * 0.5;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(hx - 5, hy + 13, 10, 2);
  ctx.fillStyle = '#efe9dc';
  ctx.fillRect(hx - 4, hy, 8, 13);
  ctx.fillStyle = '#3a2617';
  ctx.fillRect(hx - 3, hy + 3, 6, 9);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(hx - 3, hy + 4, 1, 6);
  ctx.fillStyle = '#cfcac0';
  ctx.fillRect(hx - 5, hy - 2, 10, 3);
  ctx.strokeStyle = '#f4ecd8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(hx + 1, hy - 2);
  ctx.lineTo(hx + 3, hy - 9);
  ctx.stroke();
}

// A yellow can of iced yerba mate tea, held at Rico's side.
function drawPlayerIcedTea(spriteTopY) {
  const hx = player.x + (player.dir === 'left' ? -13 : 13), hy = spriteTopY + SPR_H * 0.5;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(hx - 5, hy + 14, 10, 2);
  ctx.fillStyle = '#e8c020';
  ctx.fillRect(hx - 4, hy, 8, 14);
  ctx.fillStyle = '#c8a010';
  ctx.fillRect(hx - 4, hy, 8, 2);
  ctx.fillRect(hx - 4, hy + 12, 8, 2);
  ctx.fillStyle = '#3a6a2a';
  ctx.fillRect(hx - 3, hy + 5, 6, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillRect(hx - 3, hy + 2, 1, 8);
}

// A scoop of ice cream in a waffle cone, held at Rico's side — bought from
// the ice cream van.
function drawPlayerIceCream(spriteTopY) {
  const hx = player.x + (player.dir === 'left' ? -13 : 13), hy = spriteTopY + SPR_H * 0.5;
  ctx.fillStyle = '#d8a24a';
  ctx.beginPath();
  ctx.moveTo(hx - 4, hy + 2);
  ctx.lineTo(hx + 4, hy + 2);
  ctx.lineTo(hx, hy + 14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#a87830';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hx - 4, hy + 5); ctx.lineTo(hx + 4, hy + 5);
  ctx.moveTo(hx - 3, hy + 8); ctx.lineTo(hx + 3, hy + 8);
  ctx.moveTo(hx - 2, hy + 11); ctx.lineTo(hx + 2, hy + 11);
  ctx.stroke();
  ctx.fillStyle = '#f7c9d8';
  ctx.beginPath();
  ctx.arc(hx, hy - 2, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.arc(hx - 2, hy - 4, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c02840';
  ctx.beginPath();
  ctx.arc(hx, hy - 8, 2, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------- UI
function drawHUD() {
  ctx.fillStyle = 'rgba(10,8,14,0.75)';
  ctx.fillRect(8, 8, 320, 44);
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#c8c0d8';
  ctx.fillText('SAMPLES', 18, 26);
  worldPadOrder().forEach((id, i) => {
    const r = worldRecords()[id];
    const x = 88 + i * 46, y = 14;
    ctx.fillStyle = collected.has(id) ? r.color : '#262030';
    ctx.fillRect(x, y, 38, 30);
    ctx.strokeStyle = '#0a080e';
    ctx.strokeRect(x + 0.5, y + 0.5, 37, 29);
    ctx.fillStyle = collected.has(id) ? '#181418' : '#4a4258';
    ctx.textAlign = 'center';
    ctx.fillText(r.pad, x + 19, y + 20);
  });

  if (state === 'play') {
    const target = facingTarget();
    if (target) {
      const label = target.type === 'crate' ? '[E] DIG CRATE'
                  : (target.type === 'keeper' || target.type === 'npc') ? '[E] TALK'
                  : target.type === 'cart' ? `[X] ${target.data.label}`
                  : '[E] LOOK';
      pill(label, VIEW_W / 2, VIEW_H - 34);
    }
  }
}

function pill(text, cx, cy) {
  ctx.font = 'bold 13px monospace';
  const w = ctx.measureText(text).width + 24;
  ctx.fillStyle = 'rgba(10,8,14,0.8)';
  ctx.fillRect(cx - w / 2, cy - 14, w, 26);
  ctx.fillStyle = '#f4ecd8';
  ctx.textAlign = 'center';
  ctx.fillText(text, cx, cy + 4);
}

function drawToast() {
  ctx.globalAlpha = Math.min(1, toast.t * 3);
  pill(toast.text, VIEW_W / 2, 80);
  ctx.globalAlpha = 1;
}

function drawDialog() {
  const h = 150, y = VIEW_H - h - 16;
  ctx.fillStyle = 'rgba(10,8,14,0.92)';
  ctx.fillRect(24, y, VIEW_W - 48, h);
  ctx.strokeStyle = '#f4ecd8';
  ctx.lineWidth = 2;
  ctx.strokeRect(26, y + 2, VIEW_W - 52, h - 4);
  ctx.textAlign = 'left';
  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = '#e0b040';
  ctx.fillText(dialog.name, 44, y + 32);
  ctx.fillStyle = '#f4ecd8';
  ctx.font = '19px monospace';
  wrapText(dialog.lines[dialog.i], 44, y + 62, VIEW_W - 96, 26);
  ctx.font = '13px monospace';
  ctx.fillStyle = '#9a90a8';
  ctx.textAlign = 'right';
  ctx.fillText('[E] ▶', VIEW_W - 44, y + h - 14);
}

function wrapText(text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW) {
      ctx.fillText(line, x, y);
      y += lh;
      line = w;
    } else line = test;
  }
  ctx.fillText(line, x, y);
}

// ---------------------------------------------------------------- album cover art
// Small deterministic PRNG so each cover's "grain"/speckle pattern is
// stable frame to frame instead of shimmering.
function coverRng(seedStr) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) | 0;
  let a = (h >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A hand-drawn, worn-sleeve look laid over every cover: a faint vignette,
// a scattering of paper grain specks, and a soft ring-wear circle — the
// little imperfections that make old vinyl jackets feel nostalgic.
function drawCoverWear(x, y, s, rng) {
  const grd = ctx.createRadialGradient(x + s / 2, y + s / 2, s * 0.2, x + s / 2, y + s / 2, s * 0.72);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = grd;
  ctx.fillRect(x, y, s, s);
  ctx.fillStyle = 'rgba(20,16,10,0.5)';
  ctx.beginPath();
  ctx.arc(x + s * 0.66, y + s * 0.4, s * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(244,236,216,0.5)';
  for (let i = 0; i < 26; i++) {
    const gx = x + rng() * s, gy = y + rng() * s;
    ctx.fillRect(gx, gy, 1, 1);
  }
}

function drawAlbumArt(x, y, s, r) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, s, s);
  ctx.clip();
  const rng = coverRng(r.title);
  const cx = x + s / 2, cy = y + s / 2;

  switch (r.title) {
    case 'Elm Street Funk': {
      // dusty 70s sunset over a row of brick stoops, one bare elm in front
      const g = ctx.createLinearGradient(x, y, x, y + s);
      g.addColorStop(0, '#7a3a2a'); g.addColorStop(0.55, '#e0a030'); g.addColorStop(1, '#3a2418');
      ctx.fillStyle = g; ctx.fillRect(x, y, s, s);
      ctx.fillStyle = '#c4791f';
      ctx.beginPath(); ctx.arc(cx, y + s * 0.42, s * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#241a14';
      ctx.fillRect(x, y + s * 0.72, s, s * 0.28);
      for (let i = 0; i < 4; i++) ctx.fillRect(x + i * (s / 4) + 4, y + s * 0.6, s / 4 - 8, s * 0.12);
      ctx.strokeStyle = '#1c1410'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + s * 0.22, y + s * 0.72); ctx.lineTo(x + s * 0.3, y + s * 0.4); ctx.stroke();
      for (const [dx, dy] of [[-14, 10], [10, 6], [-6, -8], [12, -4]]) {
        ctx.beginPath(); ctx.moveTo(x + s * 0.3, y + s * 0.4);
        ctx.lineTo(x + s * 0.3 + dx, y + s * 0.4 + dy); ctx.stroke();
      }
      break;
    }
    case 'Cherry Cola Bounce': {
      // diner checkerboard + a bouncing soda bottle, all polka-dot bubbles
      ctx.fillStyle = '#f4ecd8'; ctx.fillRect(x, y, s, s);
      const cell = s / 8;
      ctx.fillStyle = '#d04830';
      for (let ry = 0; ry < 8; ry++) for (let rx = 0; rx < 8; rx++)
        if ((rx + ry) % 2 === 0) ctx.fillRect(x + rx * cell, y + ry * cell, cell, cell);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let i = 0; i < 14; i++) {
        const bx = x + rng() * s, by = y + rng() * s, br = 3 + rng() * 5;
        ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#7a2018';
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy + 34); ctx.lineTo(cx - 14, cy - 4); ctx.lineTo(cx - 7, cy - 20);
      ctx.lineTo(cx - 7, cy - 34); ctx.lineTo(cx + 7, cy - 34); ctx.lineTo(cx + 7, cy - 20);
      ctx.lineTo(cx + 14, cy - 4); ctx.lineTo(cx + 12, cy + 34); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f4ecd8'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText('COLA', cx, cy + 8);
      break;
    }
    case 'Midnight Stab': {
      // smoky jazz-club spotlight with a horn silhouette
      const g = ctx.createLinearGradient(x, y, x, y + s);
      g.addColorStop(0, '#1a1024'); g.addColorStop(1, '#3a1830');
      ctx.fillStyle = g; ctx.fillRect(x, y, s, s);
      ctx.fillStyle = 'rgba(196,64,112,0.35)';
      ctx.beginPath();
      ctx.moveTo(cx, y - 10); ctx.lineTo(x + s * 0.16, y + s); ctx.lineTo(x + s * 0.84, y + s);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      for (let i = 0; i < 18; i++) {
        const sxr = x + rng() * s, syr = y + rng() * s * 0.5;
        ctx.beginPath(); ctx.arc(sxr, syr, 0.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = '#f4ecd8'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 22, cy + 26); ctx.quadraticCurveTo(cx - 22, cy - 10, cx + 6, cy - 14);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 16, cy - 8, 14, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'Galactic Hallelujah': {
      // starfield with a radiant halo behind a robed choir silhouette
      ctx.fillStyle = '#0c1030'; ctx.fillRect(x, y, s, s);
      ctx.fillStyle = '#f4ecd8';
      for (let i = 0; i < 40; i++) {
        const sxr = x + rng() * s, syr = y + rng() * s;
        ctx.fillRect(sxr, syr, rng() > 0.85 ? 2 : 1, rng() > 0.85 ? 2 : 1);
      }
      const g = ctx.createRadialGradient(cx, cy - 6, 4, cx, cy - 6, s * 0.4);
      g.addColorStop(0, 'rgba(72,112,208,0.9)'); g.addColorStop(1, 'rgba(72,112,208,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy - 6, s * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a1030';
      ctx.beginPath();
      ctx.moveTo(cx, cy - 30); ctx.quadraticCurveTo(cx + 26, cy - 6, cx + 22, cy + 34);
      ctx.lineTo(cx - 22, cy + 34); ctx.quadraticCurveTo(cx - 26, cy - 6, cx, cy - 30);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'White Label': {
      // a plain, worn-white promo sleeve with just a hand-drawn star
      ctx.fillStyle = '#efe9dc'; ctx.fillRect(x, y, s, s);
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      for (let i = 0; i < 30; i++) ctx.fillRect(x + rng() * s, y + rng() * s, 1, 1);
      ctx.strokeStyle = '#c8a020'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const ang = -Math.PI / 2 + i * (Math.PI * 4 / 5);
        const px2 = cx + Math.cos(ang) * 34, py2 = cy + Math.sin(ang) * 34;
        i === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
      }
      ctx.closePath(); ctx.stroke();
      break;
    }
    case 'Strum Low': {
      // moonlit bayou water with cattail silhouettes
      const g = ctx.createLinearGradient(x, y, x, y + s);
      g.addColorStop(0, '#0e2a24'); g.addColorStop(1, '#12463a');
      ctx.fillStyle = g; ctx.fillRect(x, y, s, s);
      ctx.fillStyle = '#e8dfa0';
      ctx.beginPath(); ctx.arc(x + s * 0.72, y + s * 0.28, s * 0.11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(232,223,160,0.4)'; ctx.lineWidth = 2;
      for (const ry of [0.62, 0.72, 0.82]) {
        ctx.beginPath(); ctx.moveTo(x + 6, y + s * ry); ctx.lineTo(x + s - 6, y + s * ry); ctx.stroke();
      }
      ctx.strokeStyle = '#0a1a16'; ctx.lineWidth = 3;
      for (const cxo of [0.2, 0.32, 0.44]) {
        ctx.beginPath(); ctx.moveTo(x + s * cxo, y + s * 0.9); ctx.lineTo(x + s * cxo, y + s * 0.5); ctx.stroke();
        ctx.fillStyle = '#0a1a16';
        ctx.fillRect(x + s * cxo - 3, y + s * 0.44, 6, 12);
      }
      break;
    }
    case 'Frog Chorus Stab': {
      // sunburst over lily pads
      ctx.fillStyle = '#dfe8a0'; ctx.fillRect(x, y, s, s);
      ctx.fillStyle = 'rgba(143,154,63,0.5)';
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
        ctx.fillRect(-4, -s * 0.6, 8, s * 0.6);
        ctx.restore();
      }
      ctx.fillStyle = '#4f6a2a';
      for (const [dx, dy, r2] of [[-30, 26, 22], [26, 20, 26], [2, -26, 18]]) {
        ctx.beginPath(); ctx.ellipse(cx + dx, cy + dy, r2, r2 * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#2e5f1f';
      ctx.beginPath(); ctx.ellipse(cx, cy + 6, 16, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8f0c0';
      ctx.beginPath(); ctx.arc(cx - 6, cy - 2, 3, 0, Math.PI * 2); ctx.arc(cx + 6, cy - 2, 3, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'Moss Hallelujah': {
      // foggy cypress silhouettes, banded like an old screen print
      const bands = ['#204a3a', '#2a5f48', '#356f54', '#4a8a68'];
      bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(x, y + (s / 4) * i, s, s / 4 + 1); });
      ctx.fillStyle = 'rgba(230,240,225,0.18)';
      ctx.fillRect(x, y + s * 0.5, s, s * 0.14);
      ctx.fillStyle = '#12261e';
      for (const [dx, w2, h2] of [[-40, 20, 70], [-4, 26, 90], [36, 18, 60]]) {
        ctx.beginPath();
        ctx.moveTo(cx + dx, y + s);
        ctx.lineTo(cx + dx - w2 / 2, y + s - h2 * 0.4);
        ctx.lineTo(cx + dx, y + s - h2);
        ctx.lineTo(cx + dx + w2 / 2, y + s - h2 * 0.4);
        ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'Mud Kick': {
      // hollow-log drum with a muddy splatter ring
      ctx.fillStyle = '#5a4a28'; ctx.fillRect(x, y, s, s);
      ctx.fillStyle = 'rgba(30,24,14,0.5)';
      for (let i = 0; i < 16; i++) {
        const ang = rng() * Math.PI * 2, dist = rng() * s * 0.5;
        ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist, 2 + rng() * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#8fbf3f';
      ctx.beginPath(); ctx.ellipse(cx, cy, 42, 42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#5a4a28'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'Honeysuckle Lead': {
      // climbing vine-and-flower frame around a warm glow
      ctx.fillStyle = '#3a2e14'; ctx.fillRect(x, y, s, s);
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, s * 0.5);
      g.addColorStop(0, 'rgba(216,192,96,0.8)'); g.addColorStop(1, 'rgba(216,192,96,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = '#6f8a3a'; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(x + 8, y + s); ctx.bezierCurveTo(x + 30, y + s * 0.6, x + 4, y + s * 0.3, x + 24, y + 8);
      ctx.stroke();
      ctx.fillStyle = '#e8c860';
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const px2 = x + 8 + t * 16, py2 = y + s - t * (s - 8);
        ctx.beginPath(); ctx.arc(px2, py2, 4, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    default: {
      ctx.fillStyle = r.color; ctx.fillRect(x, y, s, s);
    }
  }

  // subtle shadow along the bottom edge, like light catching the inside
  // lip of the sleeve — drawn before the wear pass and the frame stroke
  // so it never breaks the border that boxes the whole cover in
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x, y + s - 22, s, 22);

  drawCoverWear(x, y, s, rng);
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
}

function drawRecordCard() {
  const r = worldRecords()[shownRecord];
  ctx.fillStyle = 'rgba(6,4,10,0.85)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const w = 560, h = 300, x = (VIEW_W - w) / 2, y = (VIEW_H - h) / 2;
  ctx.fillStyle = '#1c1626';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = r.color;
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);

  const sx = x + 36, sy = y + 60, ss = 150;
  drawAlbumArt(sx, sy, ss, r);
  ctx.fillStyle = '#0c0a10';
  ctx.beginPath();
  ctx.arc(sx + ss + 40, sy + ss / 2, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2a2632';
  ctx.lineWidth = 1;
  for (const rr of [30, 42, 54]) {
    ctx.beginPath();
    ctx.arc(sx + ss + 40, sy + ss / 2, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = r.color;
  ctx.beginPath();
  ctx.arc(sx + ss + 40, sy + ss / 2, 20, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#f4ecd8';
  ctx.fillText('★ RECORD FOUND ★', x + w / 2, y + 36);
  ctx.textAlign = 'left';
  const tx = sx + ss + 130;
  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = r.color === '#e8e4dc' ? '#f4ecd8' : r.color;
  wrapText('"' + r.title + '"', tx, sy + 14, w - (tx - x) - 24, 20);
  ctx.font = '13px monospace';
  ctx.fillStyle = '#c8c0d8';
  ctx.fillText(r.artist + ' · ' + r.year, tx, sy + 58);
  ctx.fillStyle = '#f4ecd8';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('SAMPLE: ' + r.sample, tx, sy + 86);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#9a90a8';
  wrapText('New layer added to the beat. Listen!', tx, sy + 110, w - (tx - x) - 24, 16);

  ctx.font = '12px monospace';
  ctx.fillStyle = '#c8c0d8';
  wrapText(r.flavor, x + 36, y + h - 52, w - 72, 16);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#9a90a8';
  ctx.font = '11px monospace';
  ctx.fillText('[E] ▶', x + w - 20, y + h - 12);
}

function drawSplash() {
  if (splashImg.complete && splashImg.naturalWidth) {
    const iw = splashImg.naturalWidth, ih = splashImg.naturalHeight;
    const scale = Math.max(VIEW_W / iw, VIEW_H / ih);
    const dw = iw * scale, dh = ih * scale;
    const dx = (VIEW_W - dw) / 2, dy = (VIEW_H - dh) / 2;
    ctx.drawImage(splashImg, dx, dy, dw, dh);
  } else {
    ctx.fillStyle = '#120e18';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  ctx.fillStyle = 'rgba(8,6,12,0.55)';
  ctx.fillRect(0, VIEW_H - 64, VIEW_W, 64);
  ctx.textAlign = 'center';
  ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#e0b040' : '#f4ecd8';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('- PRESS E OR TAP TO BEGIN -', VIEW_W / 2, VIEW_H - 26);
}

let titleMenuKeyed = null; // offscreen canvas with the chroma-green removed

// Build the chroma-keyed menu once the image loads: any pixel that is the
// backdrop's chroma-green (green dominant & strong) is made transparent so the
// drifting sky/clouds show through behind the UI art.
function buildKeyedTitleMenu() {
  if (titleMenuKeyed || !titleMenuImg.complete || !titleMenuImg.naturalWidth) return;
  const w = titleMenuImg.naturalWidth, h = titleMenuImg.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(titleMenuImg, 0, 0);
  const id = g.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], grn = d[i + 1], b = d[i + 2];
    if (grn > 140 && (grn - b) > 90 && (grn - r) > 55) d[i + 3] = 0;
  }
  g.putImageData(id, 0, 0);
  titleMenuKeyed = c;
}

function drawTitle(time) {
  buildKeyedTitleMenu();

  // Menu ready: chroma-keyed menu centered over a slowly drifting sky.
  if (titleMenuKeyed) {
    if (titleSkyImg.complete && titleSkyImg.naturalWidth) {
      const tw = titleSkyImg.naturalWidth * (VIEW_H / titleSkyImg.naturalHeight);
      const off = (time * 16) % tw;   // clouds slowly float by
      ctx.fillStyle = '#9fd0ee';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      for (let x = -off; x < VIEW_W; x += tw) {
        ctx.drawImage(titleSkyImg, x, 0, tw, VIEW_H);
      }
    } else {
      ctx.fillStyle = 'rgba(8,6,12,0.93)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    const mw = titleMenuKeyed.width, mh = titleMenuKeyed.height;
    const s = Math.min(VIEW_W / mw, VIEW_H / mh);
    const dw = mw * s, dh = mh * s;
    ctx.drawImage(titleMenuKeyed, (VIEW_W - dw) / 2, (VIEW_H - dh) / 2, dw, dh);
    return;
  }

  // fallback text-only title (used until the menu image loads)
  ctx.fillStyle = 'rgba(8,6,12,0.93)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e0b040';
  ctx.font = 'bold 44px monospace';
  ctx.fillText("RICO'S VINYL QUEST", VIEW_W / 2, 130);
  ctx.fillStyle = '#8fc9bc';
  ctx.font = 'italic 14px monospace';
  const story = [
    'Your sampler is empty. Your beat is due.',
    'Five legendary records are hiding somewhere in this town \u2014',
    'in shop crates, diner backrooms, and flea market stalls.',
    'Dig them ALL up and the whole town hears your beat come alive.',
  ];
  story.forEach((l, i) => ctx.fillText(l, VIEW_W / 2, 190 + i * 26));
  ctx.fillStyle = '#9a90a8';
  ctx.font = '13px monospace';
  const controls = [
    'ARROWS / WASD, OR THE ON-SCREEN D-PAD .... move',
    'E, OR THE ON-SCREEN E BUTTON ... talk / dig crates',
    'B, OR ON-SCREEN "SK8" ........ skateboard on & off',
    'C ....................... cold brew coffee on & off',
    'Y ......................... iced yerba mate on & off',
    'M, OR ON-SCREEN "MUTE" ....................... mute',
    'X, OR ON-SCREEN "X" ................... buy from carts',
  ];
  controls.forEach((l, i) => ctx.fillText(l, VIEW_W / 2, 320 + i * 20));
  ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#e0b040' : '#f4ecd8';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('- PRESS E TO START -', VIEW_W / 2, 500);
}

function drawWin() {
  ctx.fillStyle = 'rgba(8,6,12,0.88)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e0b040';
  ctx.font = 'bold 40px monospace';
  ctx.fillText('BEAT COMPLETE!', VIEW_W / 2, 120);
  ctx.fillStyle = '#f4ecd8';
  ctx.font = '15px monospace';
  ctx.fillText('All five samples on the pads. The whole town is bumping your track.', VIEW_W / 2, 165);
  worldPadOrder().forEach((id, i) => {
    const r = worldRecords()[id];
    const x = VIEW_W / 2 - 230 + i * 92, y = 210;
    ctx.fillStyle = r.color;
    ctx.fillRect(x, y, 76, 76);
    ctx.fillStyle = '#181418';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(r.pad, x + 38, y + 44);
    ctx.fillStyle = '#c8c0d8';
    ctx.font = '10px monospace';
    ctx.fillText(r.sample, x + 38, y + 96);
  });
  ctx.fillStyle = '#9a90a8';
  ctx.font = '13px monospace';
  ctx.fillText('Rico’s next beat tape: certified classic.', VIEW_W / 2, 360);
  ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#e0b040' : '#f4ecd8';
  ctx.font = 'bold 15px monospace';
  ctx.fillText('- PRESS E TO KEEP CRUISING -', VIEW_W / 2, 420);
}

requestAnimationFrame(frame);

// debug/test handle
window.__rico = { player, maps, collected, getState: () => state };
})();
