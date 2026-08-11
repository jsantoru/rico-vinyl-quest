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
      background: rgba(244,236,216,0.15);
      border: 2px solid rgba(244,236,216,0.55);
      border-radius: 12px;
      color: #f4ecd8;
      font: bold 13px monospace;
      -webkit-user-select: none; user-select: none;
      -webkit-touch-callout: none;
      touch-action: none;
    }
    #touchControls .tc-btn:active { background: rgba(244,236,216,0.35); }
    #dpadUp    { left: 68px;  bottom: 156px; width: 56px; height: 56px; font-size: 18px; }
    #dpadDown  { left: 68px;  bottom: 88px;  width: 56px; height: 56px; font-size: 18px; }
    #dpadLeft  { left: 18px;  bottom: 122px; width: 56px; height: 56px; font-size: 18px; }
    #dpadRight { left: 118px; bottom: 122px; width: 56px; height: 56px; font-size: 18px; }
    #btnE { right: 22px;  bottom: 116px; width: 78px; height: 78px; border-radius: 50%; font-size: 20px; }
    #btnB { right: 114px; bottom: 148px; width: 54px; height: 54px; border-radius: 50%; }
    #btnM { right: 114px; bottom: 78px;  width: 54px; height: 54px; border-radius: 50%; }
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

// ---------------------------------------------------------------- records
const RECORDS = {
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
};
const PAD_ORDER = ['elm', 'cola', 'stab', 'choir', 'white'];

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
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k) || k === ' ') e.preventDefault();
  if (!keys[k]) {
    if (k === 'e' || k === 'enter' || k === 'z' || k === ' ') interactPressed = true;
    if (k === 'b') toggleSkate();
    if (k === 'm') music.toggleMute();
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

// Splash screen image — save the intro artwork as assets/splash.png (same folder as rico.png)
const splashImg = new Image();
splashImg.src = 'assets/splash.png';

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
  function building(x, y, w, h, name, wall, roof) {
    for (let yy = y; yy < y+h; yy++)
      for (let xx = x; xx < x+w; xx++) g[yy][xx] = 'w';
    const doorX = x + Math.floor(w/2);
    g[y+h-1][doorX] = 'D';
    buildings.push({ x, y, w, h, name, wall, roof, doorX });
    return { doorX, doorY: y+h-1 };
  }

  // Building names / colors
  const groove = building(4, 3, 7, 4, 'Green Door Studio', '#3f7f45', '#2f6335');
  const wax    = building(28, 3, 7, 4, 'Hey Bud', '#bf4f6f', '#93384f');
  const diner  = building(4, 14, 7, 4, 'Kountry Kart Deli', '#c07a38', '#96591f');
  const thrift = building(28, 14, 7, 4, 'Pure Pop Records', '#3f8fbf', '#2a6a93');

  // park & pond, bottom of town
  const trees = [[3,20],[5,22],[7,19],[13,21],[15,23],[3,23],[10,23],[16,19],[36,20],[34,23],[9,12],[14,13],[25,12],[36,12],[2,12],[37,7],[2,7],[24,23],[13,6],[26,6]];
  for (const [tx, ty] of trees) if (g[ty][tx] === '.') g[ty][tx] = '#';
  for (let y = 20; y <= 21; y++) for (let x = 8; x <= 11; x++) g[y][x] = '~';

  // flea market corner: stalls (fences) + crates, one holds the white label
  // NOTE: skip the tile directly above the Thrift Shop door so the fence
  // doesn't block access to it.
  for (let x = 25; x <= 31; x++) { if (x === thrift.doorX) continue; g[18][x] = 'f'; }
  for (let y = 18; y <= 22; y++) g[y][32] = 'f';
  g[20][26] = 'c'; g[21][28] = 'c'; g[20][30] = 'c';

  const map = {
    id: 'town', w: W, h: H, grid: g, outside: true, buildings,
    doors: {}, crates: {}, npcs: [],
  };
  map.crates[key(26,20)] = { junkSeed: 3 };
  map.crates[key(28,21)] = { record: 'white' };
  map.crates[key(30,20)] = { junkSeed: 6 };
  return { map, doors: { groove, wax, diner, thrift } };
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
    id, w: W, h: H, grid: g, outside: false,
    floor: opts.floor, plank: opts.plank, wallColor: opts.wallColor,
    keeper: { x: 6, y: 1, ...opts.keeper },
    crates: {}, npcs: [],
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
    keeper: { name: 'MARCUS', shirt: '#c8b030', skin: '#8a5a34',
      lines: ['Rico! My man. Diggers been through all week and found nothing.',
              'But between you and me... a Static Groove record came in with an estate lot.',
              'It’s somewhere in the crates by the LEFT wall. Happy digging.'],
      foundLine: 'You FOUND it?! Elm Street Funk, in my own shop. Flip that break into something beautiful.' },
    crates: [ { record: 'elm' }, { junkSeed: 0 }, { junkSeed: 1 }, { junkSeed: 2 } ],
  }),

  wax: makeShop('wax', {
    floor: '#5f4a6a', plank: '#4f3c58', wallColor: '#3a2a44',
    keeper: { name: 'DEE', shirt: '#d05a8a', skin: '#c89a72',
      lines: ['Welcome to the Wax Museum. Look, don’t touch. Unless you’re buying. Then touch.',
              'The Velvet Horns pressing? Yeah, I’ve heard the rumor too.',
              'Try the crates on the RIGHT side. And if you find it, I want a credit on the beat.'],
      foundLine: 'Midnight Stab, in the flesh. Those horns are going to slap so hard.' },
    crates: [ { junkSeed: 3 }, { junkSeed: 4 }, { record: 'stab' }, { junkSeed: 5 } ],
  }),

  diner: makeShop('diner', {
    floor: '#b8a08a', plank: '#a89078', wallColor: '#7a4a3a',
    keeper: { name: 'ROSIE', shirt: '#e0e0e0', skin: '#e8b890',
      lines: ['Sit anywhere, hon. Kitchen’s slow but the jukebox is fast.',
              'My old band pressed a 45 back in ’68. Cherry Cola Bounce. We were something.',
              'The spare copies ended up in a crate in the BACK of the diner somewhere.'],
      foundLine: 'Well I’ll be. Make that bassline bounce again, sugar.' },
    crates: [ { junkSeed: 6 }, { junkSeed: 7 }, { junkSeed: 0 }, { junkSeed: 1 }, { record: 'cola' } ],
    jukebox: true,
  }),

  thrift: makeShop('thrift', {
    floor: '#6a8a6a', plank: '#587a58', wallColor: '#3a4a3a',
    keeper: { name: 'ZEKE', shirt: '#70b060', skin: '#9a7050',
      lines: ['Everything’s a dollar. Except the stuff that isn’t.',
              'Records? Aisle... uh... we don’t have aisles. They’re in crates. Somewhere.',
              'Some church choir stuff came in from a storage unit. Might be on the RIGHT. Might not.'],
      foundLine: 'Galactic Hallelujah! I almost priced that at fifty cents. Glad it’s you.' },
    crates: [ { junkSeed: 2 }, { junkSeed: 3 }, { junkSeed: 4 }, { record: 'choir' } ],
  }),
};

// door wiring: town door tile -> shop spawn; shop exit tile -> town spawn
const transitions = {};
for (const [id, d] of Object.entries(doors)) {
  transitions['town:' + key(d.doorX, d.doorY)] = { map: id, x: 6.5, y: 7.5 };
  transitions[id + ':' + key(6, 9)] = { map: 'town', x: d.doorX + 0.5, y: d.doorY + 1.6 };
}

const maps = { town, ...shops };

// ---------------------------------------------------------------- state
const player = {
  map: 'town', x: 19.5 * TILE, y: 12.5 * TILE,
  dir: 'down', moving: false, skating: false, animT: 0,
};

const collected = new Set();
let state = 'splash'; // splash | title | play | dialog | record | win
let dialog = null;   // { name, lines, i }
let shownRecord = null;
let winShown = false;
let toast = null;    // { text, t }

function toggleSkate() {
  if (state !== 'play' || !maps[player.map].outside) return;
  player.skating = !player.skating;
  toast = { text: player.skating ? 'Skateboard: ON' : 'Skateboard: OFF', t: 1.2 };
}

// ---------------------------------------------------------------- audio
const music = {
  ctx: null, master: null, noiseBuf: null, muted: false,
  step: 0, nextTime: 0, BPM: 92,
  layers: new Set(['tick']),

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

  pump() {
    const stepDur = 60 / this.BPM / 4;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      this.schedule(this.step, this.nextTime, stepDur);
      this.step = (this.step + 1) % 32;
      this.nextTime += stepDur;
    }
  },

  schedule(gs, t, stepDur) {
    const s = gs % 16, bar = Math.floor(gs / 16);
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
  const hw = 10, hh = 7; // feet-anchored hitbox
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
  const speed = player.skating ? SKATE_SPEED : WALK_SPEED;
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
function facingTile() {
  const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[player.dir];
  const fx = player.x + d[0] * 24, fy = player.y + d[1] * 22;
  return [Math.floor(fx / TILE), Math.floor(fy / TILE)];
}

function facingTarget() {
  const map = maps[player.map];
  const [tx, ty] = facingTile();

  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return null;

  const ch = map.grid[ty][tx];

  if (ch === 'C' || ch === 'c')
    return { type: 'crate', tx, ty, data: map.crates[key(tx, ty)] };

  if (ch === 'K')
    return { type: 'keeper', data: map.keeper };

  if (ch === 'T' && map.keeper && Math.abs(tx - map.keeper.x) <= 2 && ty === 2)
    return { type: 'keeper', data: map.keeper };

  if (ch === 'J')
    return { type: 'jukebox' };

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
      music.enable(RECORDS[c.record].layer);
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
  }
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

  const bBtn = document.createElement('div');
  bBtn.id = 'btnB'; bBtn.className = 'tc-btn'; bBtn.textContent = 'SKATE';
  bindTap(bBtn, () => { toggleSkate(); music.start(); });
  wrap.appendChild(bBtn);

  const mBtn = document.createElement('div');
  mBtn.id = 'btnM'; mBtn.className = 'tc-btn'; mBtn.textContent = 'MUTE';
  bindTap(mBtn, () => { music.toggleMute(); music.start(); });
  wrap.appendChild(mBtn);

  document.body.appendChild(wrap);
}

createTouchControls();

// Tapping the game screen itself advances splash/title/dialog/record/win screens
// (movement + interact during actual play stays on the dedicated controls above).
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
  if (toast) {
    toast.t -= dt;
    if (toast.t <= 0) toast = null;
  }

  if (state === 'splash') {
    if (interactPressed) state = 'title';

  } else if (state === 'title') {
    if (interactPressed) state = 'play';

  } else if (state === 'play') {
    movePlayer(dt);
    if (interactPressed) doInteract();

  } else if (state === 'dialog') {
    if (interactPressed) {
      dialog.i++;
      if (dialog.i >= dialog.lines.length) {
        dialog = null;
        state = 'play';
      }
    }

  } else if (state === 'record') {
    if (interactPressed) {
      shownRecord = null;
      if (collected.size === PAD_ORDER.length && !winShown) {
        winShown = true;
        state = 'win';
      } else {
        state = 'play';
      }
    }

  } else if (state === 'win') {
    if (interactPressed) state = 'play';
  }

  interactPressed = false;
}

// ---------------------------------------------------------------- render
function camera(map) {
  const worldW = map.w * TILE, worldH = map.h * TILE;

  let cx = player.x - VIEW_W / 2;
  let cy = player.y - VIEW_H / 2;

  cx = Math.max(0, Math.min(cx, worldW - VIEW_W));
  cy = Math.max(0, Math.min(cy, worldH - VIEW_H));

  if (worldW < VIEW_W) cx = (worldW - VIEW_W) / 2;
  if (worldH < VIEW_H) cy = (worldH - VIEW_H) / 2;

  return [Math.round(cx), Math.round(cy)];
}

function hash2(x, y) {
  return ((x * 73856093) ^ (y * 19349663)) >>> 0;
}

function render(time) {
  const map = maps[player.map];
  const [camX, camY] = camera(map);

  ctx.fillStyle = '#120e18';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.save();

  if (map.outside) {
    // The overworld keeps the normal camera and 1:1 pixel-art scale.
    ctx.translate(-camX, -camY);
  } else {
    // Shop interiors are smaller than the 960x600 game view. Scale the
    // entire interior to fill the full game screen instead of leaving
    // black/empty space around the room.
    const scaleX = VIEW_W / (map.w * TILE);
    const scaleY = VIEW_H / (map.h * TILE);
    ctx.scale(scaleX, scaleY);
  }

  drawTiles(map, time);

  if (map.outside)
    drawBuildings(map);

  if (map.keeper)
    drawKeeper(map.keeper);

  drawPlayer(time);

  ctx.restore();

  if (state !== 'splash')
    drawHUD();

  if (state === 'splash')
    drawSplash();

  if (state === 'title')
    drawTitle();

  if (state === 'dialog')
    drawDialog();

  if (state === 'record')
    drawRecordCard();

  if (state === 'win')
    drawWin();

  if (toast)
    drawToast();
}

function drawTiles(map, time) {
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      const px = tx * TILE, py = ty * TILE;
      const ch = map.grid[ty][tx];
      const h = hash2(tx, ty);

      if (map.outside) {
        // grass base everywhere outdoors
        ctx.fillStyle = (h % 7 === 0) ? '#3e7c34' : '#468a3a';
        ctx.fillRect(px, py, TILE, TILE);

        if (h % 5 === 0) {
          ctx.fillStyle = '#54a046';
          ctx.fillRect(px + (h % 20), py + (h % 22), 3, 3);
        }

      } else {
        ctx.fillStyle = map.floor;
        ctx.fillRect(px, py, TILE, TILE);

        ctx.fillStyle = map.plank;
        ctx.fillRect(px, py + 10, TILE, 2);
        ctx.fillRect(px, py + 24, TILE, 2);
      }

      switch (ch) {

        case 'r': {
          ctx.fillStyle = '#44424a';
          ctx.fillRect(px, py, TILE, TILE);

          ctx.fillStyle = '#504e58';
          if (h % 6 === 0)
            ctx.fillRect(px + (h % 18), py + ((h >> 3) % 24), 4, 3);

          break;
        }

        case '#':
          drawTree(px, py);
          break;

        case '~': {
          ctx.fillStyle = '#3060b0';
          ctx.fillRect(px, py, TILE, TILE);

          ctx.fillStyle = '#4878cc';
          const off = Math.floor(time * 6) % 2 === 0 ? 4 : 12;

          ctx.fillRect(px + off, py + 8, 10, 2);
          ctx.fillRect(px + (TILE - off - 10), py + 22, 10, 2);

          break;
        }

        case 'f': {
          ctx.fillStyle = '#8a6a42';
          ctx.fillRect(px + 2, py + 8, TILE - 4, 6);
          ctx.fillRect(px + 4, py + 4, 4, 20);
          ctx.fillRect(px + TILE - 8, py + 4, 4, 20);
          break;
        }

        case 'c':
        case 'C':
          drawCrate(px, py, map.crates[key(tx, ty)]);
          break;

        case 'W': {
          ctx.fillStyle = map.wallColor;
          ctx.fillRect(px, py, TILE, TILE);

          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.fillRect(px, py + 14, TILE, 2);
          ctx.fillRect(px + (ty % 2 === 0 ? 8 : 20), py, 2, 14);

          break;
        }

        case 'T': {
          ctx.fillStyle = '#6a4a2a';
          ctx.fillRect(px, py + 6, TILE, TILE - 6);

          ctx.fillStyle = '#9a7040';
          ctx.fillRect(px, py, TILE, 10);

          break;
        }

        case 'J': {
          ctx.fillStyle = '#b03030';
          ctx.fillRect(px + 4, py, TILE - 8, TILE);

          ctx.fillStyle = '#f0d060';
          ctx.fillRect(px + 8, py + 4, TILE - 16, 8);

          ctx.fillStyle = Math.floor(time * 2) % 2 ? '#60d0f0' : '#f06090';
          ctx.fillRect(px + 8, py + 16, TILE - 16, 4);

          break;
        }

        case 'E': {
          ctx.fillStyle = '#7a3a20';
          ctx.fillRect(px, py, TILE, TILE);

          ctx.fillStyle = '#9a5a30';
          ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);

          break;
        }
      }
    }
  }
}

function drawTree(px, py) {
  ctx.fillStyle = '#6a4a2a';
  ctx.fillRect(px + 13, py + 20, 6, 10);

  ctx.fillStyle = '#2e6428';
  ctx.fillRect(px + 4, py + 10, 24, 12);

  ctx.fillStyle = '#38782e';
  ctx.fillRect(px + 8, py + 2, 16, 14);

  ctx.fillStyle = '#4a9038';
  ctx.fillRect(px + 10, py + 4, 8, 6);
}

function drawCrate(px, py, data) {
  ctx.fillStyle = '#8a5a30';
  ctx.fillRect(px + 2, py + 6, TILE - 4, TILE - 8);

  ctx.fillStyle = '#6a4020';
  ctx.fillRect(px + 2, py + 6, TILE - 4, 3);
  ctx.fillRect(px + 2, py + TILE - 5, TILE - 4, 3);

  // record sleeves peeking out
  const empty = data && data.record && collected.has(data.record);
  const colors = empty ? ['#5a3a1e'] : ['#c04040', '#4060c0', '#d0a030'];

  colors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(px + 6 + i * 7, py + 2, 5, 8);
  });
}

function drawBuildings(map) {
  for (const b of map.buildings) {
    const px = b.x * TILE, py = b.y * TILE, w = b.w * TILE, h = b.h * TILE;

    ctx.fillStyle = b.wall;
    ctx.fillRect(px, py, w, h);

    ctx.fillStyle = b.roof;
    ctx.fillRect(px, py, w, TILE + 8);

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(px, py + TILE + 8, w, 3);

    // windows
    ctx.fillStyle = '#ffe9a0';

    for (let i = 0; i < b.w; i++) {
      if (b.x + i === b.doorX) continue;
      if (i === 0 || i === b.w - 1) continue;

      ctx.fillRect(px + i * TILE + 8, py + h - TILE - 14, 16, 18);

      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(px + i * TILE + 8, py + h - TILE - 6, 16, 2);

      ctx.fillStyle = '#ffe9a0';
    }

    // door
    const dx = b.doorX * TILE;

    // Green Door Studio gets a green door.
    const isGreenDoorStudio = b.name === 'Green Door Studio';

    ctx.fillStyle = isGreenDoorStudio ? '#245b2b' : '#3a2414';
    ctx.fillRect(dx + 4, py + h - TILE + 2, TILE - 8, TILE - 2);

    ctx.fillStyle = isGreenDoorStudio ? '#b7d96a' : '#e0c060';
    ctx.fillRect(dx + TILE - 12, py + h - 16, 3, 3);

    // sign
    ctx.fillStyle = '#f4ecd8';

    const sw = Math.min(w - 10, b.name.length * 9 + 14);
    ctx.fillRect(px + (w - sw) / 2, py + 6, sw, 20);

    ctx.fillStyle = '#2a2020';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(b.name, px + w / 2, py + 20);
  }
}

function drawKeeper(k) {
  const px = k.x * TILE, py = k.y * TILE;

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(px + 8, py + 26, 16, 4);

  ctx.fillStyle = k.shirt;
  ctx.fillRect(px + 8, py + 12, 16, 14);

  ctx.fillStyle = k.skin;
  ctx.fillRect(px + 10, py + 2, 12, 11);

  ctx.fillStyle = '#201818';
  ctx.fillRect(px + 12, py + 6, 2, 2);
  ctx.fillRect(px + 18, py + 6, 2, 2);
  ctx.fillRect(px + 10, py, 12, 3);
}

function drawPlayer(time) {
  const row = DIR_ROW[player.dir];

  let col = 0;

  if (player.moving)
    col = [0, 1, 0, 2][Math.floor(player.animT * 7) % 4];

  if (player.skating)
    col = player.moving ? 2 : 0;

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
    ctx.drawImage(
      ricoImg,
      col * SHEET_CW,
      row * SHEET_CH,
      SHEET_CW,
      SHEET_CH,
      Math.round(player.x - SPR_W / 2),
      Math.round(footY - SPR_H - (player.skating ? 4 : 0) + bob),
      SPR_W,
      SPR_H
    );
  } else {
    ctx.fillStyle = '#d0a060';
    ctx.fillRect(player.x - 8, footY - 40, 16, 40);
  }
}

// ---------------------------------------------------------------- UI
function drawHUD() {
  ctx.fillStyle = 'rgba(10,8,14,0.75)';
  ctx.fillRect(8, 8, 320, 44);

  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#c8c0d8';
  ctx.fillText('SAMPLES', 18, 26);

  PAD_ORDER.forEach((id, i) => {
    const r = RECORDS[id];
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
      const label =
        target.type === 'crate' ? '[E] DIG CRATE' :
        target.type === 'keeper' ? '[E] TALK' :
        '[E] LOOK';

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
  const h = 120, y = VIEW_H - h - 16;

  ctx.fillStyle = 'rgba(10,8,14,0.92)';
  ctx.fillRect(24, y, VIEW_W - 48, h);

  ctx.strokeStyle = '#f4ecd8';
  ctx.lineWidth = 2;
  ctx.strokeRect(26, y + 2, VIEW_W - 52, h - 4);

  ctx.textAlign = 'left';
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = '#e0b040';
  ctx.fillText(dialog.name, 44, y + 28);

  ctx.fillStyle = '#f4ecd8';
  ctx.font = '14px monospace';
  wrapText(dialog.lines[dialog.i], 44, y + 52, VIEW_W - 96, 20);

  ctx.font = '11px monospace';
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
    } else {
      line = test;
    }
  }

  ctx.fillText(line, x, y);
}

function drawRecordCard() {
  const r = RECORDS[shownRecord];

  ctx.fillStyle = 'rgba(6,4,10,0.85)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const w = 560, h = 300;
  const x = (VIEW_W - w) / 2;
  const y = (VIEW_H - h) / 2;

  ctx.fillStyle = '#1c1626';
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = r.color;
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);

  // sleeve + vinyl
  const sx = x + 36, sy = y + 60, ss = 150;

  ctx.fillStyle = r.color;
  ctx.fillRect(sx, sy, ss, ss);

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(sx, sy + ss - 26, ss, 26);

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

    const dx = (VIEW_W - dw) / 2;
    const dy = (VIEW_H - dh) / 2;

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

function drawTitle() {
  ctx.fillStyle = 'rgba(8,6,12,0.93)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#e0b040';
  ctx.font = 'bold 44px monospace';
  ctx.fillText("RICO'S VINYL QUEST", VIEW_W / 2, 130);

  ctx.fillStyle = '#f4ecd8';
  ctx.font = '15px monospace';

  const story = [
    'Your sampler is empty. Your beat is due.',
    'Five legendary records are hiding somewhere in this town —',
    'in shop crates, diner backrooms, and flea market stalls.',
    'Dig them ALL up and the whole town hears your beat come alive.',
  ];

  story.forEach((l, i) => ctx.fillText(l, VIEW_W / 2, 190 + i * 26));

  ctx.fillStyle = '#9a90a8';
  ctx.font = '13px monospace';

  const controls = [
    'ARROWS / WASD, OR THE ON-SCREEN D-PAD .... move',
    'E, OR THE ON-SCREEN E BUTTON ... talk / dig crates',
    'B, OR ON-SCREEN "SKATE" ...... skateboard on & off',
    'M, OR ON-SCREEN "MUTE" ....................... mute',
  ];

  controls.forEach((l, i) => ctx.fillText(l, VIEW_W / 2, 330 + i * 22));

  ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#e0b040' : '#f4ecd8';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('- PRESS E TO START -', VIEW_W / 2, 480);
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

  PAD_ORDER.forEach((id, i) => {
    const r = RECORDS[id];
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
window.__rico = {
  player,
  maps,
  collected,
  getState: () => state
};

})();
