// FRAGMENT 1/3 -- engine head (constants, atmosphere, input, mini-game entry points)
// Concatenated by build.sh into game.js. Not loaded standalone. Edit here, then run build.sh.
// This fragment opens the shared closure that every other fragment runs inside --
// do not add a closing '})();' to this file, it belongs at the end of 20-engine-tail.js.
//
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

// ---------------------------------------------------------------- atmosphere: cached gradients & glow sprites
// These are built ONCE, here, instead of inside render() or any per-frame
// draw function. ctx.createLinearGradient/createRadialGradient are
// relatively expensive DOM-adjacent calls, and both gradients below only
// ever depend on VIEW_W/VIEW_H, which are fixed constants -- so rebuilding
// them 60x/sec would be pure waste. A single CanvasGradient object can be
// reused for the life of the page.

// Night-sky backdrop, screen-space, used in place of the old flat '#120e18'
// fill behind every scene.
const SKY_GRADIENT = (() => {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#0a0814');
  g.addColorStop(0.55, '#161027');
  g.addColorStop(1, '#241d38');
  return g;
})();

// Soft screen-space vignette, drawn once per frame over the fully-composited
// world (after ctx.restore(), before the HUD) to add depth without touching
// any of the world-space drawing underneath it.
const VIGNETTE_GRADIENT = (() => {
  const g = ctx.createRadialGradient(
    VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.32,
    VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.85
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.5)');
  return g;
})();

// Small pre-rendered "glow" sprites stand in for every light halo drawn in
// the world (floodlights, neon signs, and future light sources). Each is
// baked into an offscreen canvas ONCE per (radius, color) pair and cached;
// drawing one is then a single ctx.drawImage() call, which is far cheaper
// per-call than building a fresh createRadialGradient + fillRect every time
// a light is drawn -- outdoor scenes can have a dozen+ light sources
// on-screen at once, all repainted every frame.
// `color` must be an rgba() string containing the literal text 'ALPHA' in
// place of the alpha channel, e.g. 'rgba(224,176,64,ALPHA)'.
const glowSpriteCache = new Map();
function getGlowSprite(radius, color) {
  const key = radius + '|' + color;
  let spr = glowSpriteCache.get(key);
  if (spr) return spr;
  const size = radius * 2;
  const off = document.createElement('canvas');
  off.width = size; off.height = size;
  const octx = off.getContext('2d');
  const g = octx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  g.addColorStop(0, color.replace('ALPHA', '0.55'));
  g.addColorStop(0.5, color.replace('ALPHA', '0.22'));
  g.addColorStop(1, color.replace('ALPHA', '0'));
  octx.fillStyle = g;
  octx.fillRect(0, 0, size, size);
  glowSpriteCache.set(key, off);
  return off;
}
function drawGlow(x, y, radius, color) {
  const spr = getGlowSprite(radius, color);
  ctx.drawImage(spr, x - radius, y - radius);
}

// Converts a '#rrggbb' hex string (the color format used throughout this
// file for particles, records, etc.) into the 'rgba(r,g,b,ALPHA)' template
// drawGlow()/getGlowSprite() expect. Cached per hex string since the same
// handful of colors get reused constantly.
const hexRgbaCache = new Map();
function hexToRgbaTemplate(hex) {
  let t = hexRgbaCache.get(hex);
  if (t) return t;
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  t = `rgba(${r},${g},${b},ALPHA)`;
  hexRgbaCache.set(hex, t);
  return t;
}

// Elliptical glow (soft contact shadows, halo behind a collected HUD icon,
// etc). Reuses ONE fixed-resolution circular sprite per color -- stretching
// it non-uniformly via drawImage's destination width/height -- rather than
// caching a new sprite per (rx, ry) pair, so drawing any number of
// different ellipse sizes in a given color costs no extra sprite bakes.
function drawGlowEllipse(x, y, rx, ry, color) {
  const spr = getGlowSprite(32, color);
  ctx.drawImage(spr, x - rx, y - ry, rx * 2, ry * 2);
}

// Same reasoning as SKY_GRADIENT/VIGNETTE_GRADIENT above: the HUD samples
// panel is always drawn at the same fixed rect (8,8,320,44), so its subtle
// top-to-bottom sheen can be built once and reused every frame instead of
// re-creating a gradient on every drawHUD() call.
const HUD_PANEL_GRADIENT = (() => {
  const g = ctx.createLinearGradient(0, 8, 0, 52);
  g.addColorStop(0, 'rgba(30,24,40,0.85)');
  g.addColorStop(1, 'rgba(8,6,12,0.85)');
  return g;
})();
// Fixed screen-space stars for outdoor scenes. Positions/sizes/phases are
// generated ONCE with a tiny deterministic PRNG (not Math.random(), so the
// field is identical across reloads instead of reshuffling every launch),
// then only their twinkle brightness changes per frame via a cheap sine --
// no per-frame allocation, no gradients, just filled circles.
const STARS = (() => {
  const arr = [];
  let seed = 1337;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 55; i++) {
    arr.push({
      x: rand() * VIEW_W,
      y: rand() * VIEW_H * 0.5, // keep the field in the upper half of the sky
      r: 0.6 + rand() * 1.1,
      phase: rand() * Math.PI * 2,
      speed: 0.5 + rand() * 0.7,
    });
  }
  return arr;
})();
function drawStars(time) {
  ctx.fillStyle = '#f4ecd8';
  for (const s of STARS) {
    const tw = 0.5 + 0.5 * Math.sin(time * s.speed + s.phase);
    ctx.globalAlpha = 0.25 + tw * 0.55;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- skate trail
// A small fixed-capacity ring buffer of recent skating positions, drawn as a
// fading streak behind the player. Capacity is capped (SKATE_TRAIL_MAX) so
// this can never grow unbounded -- oldest samples are evicted with shift()
// once over the cap, same "bounded small array" pattern the FX module
// already uses for its own 2D particle list.
const SKATE_TRAIL_MAX = 8;
const SKATE_TRAIL_INTERVAL = 0.035; // seconds between samples
const SKATE_TRAIL_LIFE = 0.3; // seconds a sample stays visible
let skateTrail = [];
let skateTrailNextSample = 0;
function updateSkateTrail(time) {
  if (player.skating && player.moving) {
    if (time >= skateTrailNextSample) {
      skateTrailNextSample = time + SKATE_TRAIL_INTERVAL;
      skateTrail.push({ x: player.x, y: player.y + 6, t: time });
      if (skateTrail.length > SKATE_TRAIL_MAX) skateTrail.shift();
    }
  } else if (skateTrail.length) {
    skateTrail.length = 0;
  }
}
function drawSkateTrail(time) {
  for (let i = 0; i < skateTrail.length; i++) {
    const s = skateTrail[i];
    const k = Math.max(0, 1 - (time - s.t) / SKATE_TRAIL_LIFE);
    if (k <= 0) continue;
    ctx.globalAlpha = k * 0.35;
    ctx.fillStyle = '#e0e8f4';
    ctx.fillRect(s.x - 9, s.y - 1, 18, 2);
  }
  ctx.globalAlpha = 1;
}

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
      position: fixed; top: 0; left: 0; right: 0;
      /* iOS Safari sizes a plain 100vh fixed box against the viewport with
         its toolbars hidden, so bottom-anchored children can end up parked
         below the part of the screen you can actually see -- worst in
         portrait, where the toolbar is a bigger share of the height. 100svh
         (the SMALL viewport, i.e. toolbars visible) keeps bottom:0 inside
         what's actually on screen. Older browsers fall back to 100vh. */
      height: 100vh;
      height: 100svh;
      /* keep controls clear of notches / home-indicator safe areas */
      padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
                env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
      box-sizing: border-box;
      pointer-events: none;
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
    /* d-pad, tucked into the bottom-left corner. Sized and spaced for
       comfortable one-thumb reach (bigger targets + more edge clearance
       than a first pass), laid out in a classic plus shape. */
    #dpadUp    { left: 78px;  bottom: 96px; width: 66px; height: 66px; font-size: 22px; }
    #dpadDown  { left: 78px;  bottom: 12px; width: 66px; height: 66px; font-size: 22px; }
    #dpadLeft  { left: 8px;   bottom: 54px; width: 66px; height: 66px; font-size: 22px; }
    #dpadRight { left: 148px; bottom: 54px; width: 66px; height: 66px; font-size: 22px; }
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
    /* SAVE / NEW get their own color in the extras panel so they stand
       out from the BREW/YERBA toggles above them. */
    #extrasPanel .tc-btn.tc-important {
      background: rgba(196,90,64,0.35);
      border-color: rgba(224,120,90,0.85);
      color: #f4ecd8;
    }
    #extrasPanel .tc-btn.tc-important:active {
      background: rgba(224,120,90,0.55);
      border-color: rgba(224,120,90,1);
    }
    /* TROPHY gets its own distinct color so it stands out from both the
       BREW/YERBA toggles and the SAVE/NEW/CRATE tc-important group. */
    #extrasPanel .tc-btn.tc-trophy {
      background: rgba(90,150,220,0.35);
      border-color: rgba(120,180,240,0.9);
      color: #f4ecd8;
    }
    #extrasPanel .tc-btn.tc-trophy:active {
      background: rgba(120,180,240,0.55);
      border-color: rgba(120,180,240,1);
    }
    #extrasPanel .tc-btn.tc-trophy svg {
      width: 20px; height: 20px;
      fill: currentColor;
      pointer-events: none;
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
  // `locked: true` keeps it out of player-facing lists (currently just the
  // Crate's world tabs) while it's still under construction. Flip it off
  // once a real portal into it exists and it's ready for players to find.
  swamp: {
    name: 'Bayou Crossing',
    locked: true,
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
// `collected` stores world-qualified keys ("town:choir", "swamp:choir") so
// that worlds which happen to reuse a record id (both worlds have a
// 'choir' slot right now) stay independent -- finding one no longer marks
// the other as found. Every in-game read/write of `collected` should go
// through this helper rather than using a bare record id directly.
function recKey(worldId, id) { return worldId + ':' + id; }
function worldComplete() { return worldPadOrder().every(id => collected.has(recKey(currentWorldId(), id))); }

// Reactive NPC dialogue -- lets an NPC's `lines` array mix in plain strings
// with callback functions (() => string|null) that check live game state
// (`collected`, `completedWorlds`) and return a line only when it applies
// ("heard you found the Cherry Cola 45"). A callback returning null/
// undefined is dropped entirely, so an unmet condition just leaves that
// slot out rather than showing a gap or a placeholder. Dialogue always
// restarts at line 0 (see doInteract()), so callbacks are re-evaluated
// fresh every single time a conversation opens -- an NPC's gossip updates
// itself the moment the relevant record or world gets found, with zero
// extra bookkeeping. Costs one array entry per reactive line; no new
// state, no visuals.
function resolveLines(rawLines) {
  return rawLines.map((l) => (typeof l === 'function' ? l() : l)).filter((l) => l != null);
}

// All player-visible world ids, in WORLD_DEFS order, skipping any marked
// `locked` (worlds still under construction, not yet reachable in-game --
// see the comment on WORLD_DEFS.swamp). Adding a new finished world is all
// it takes for it to show up as another Crate tab; leaving `locked: true`
// on one keeps it out of the Crate until it's ready to be found.
function crateWorldIds() { return Object.keys(WORLD_DEFS).filter((id) => !WORLD_DEFS[id].locked); }

// Opens The Crate (see drawCrate()) from 'play', defaulting the world tab to
// wherever the player currently is so it never opens on an unrelated world.
function openCrate() {
  if (state !== 'play') return;
  crateReturnState = state;
  crateWorldIndex = Math.max(0, crateWorldIds().indexOf(currentWorldId()));
  crateSlotIndex = 0;
  state = 'crate';
}

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

// Classic comedy album junk finds — used for comedy-club dig crates that
// aren't hiding one of the 5 collectible records, just old stand-up vinyl.
const COMEDY_JUNK = [
  'A scratchy "Live at the Chuckle Hut" LP — the laugh track sounds suspiciously canned.',
  '"Knock Knock, Vol. 3" — ninety minutes of knock-knock jokes. Still not funny.',
  'A ventriloquist album. On vinyl. You can somehow still hear the guy\'s lips move.',
  'Some open-mic tape scrawled "DO NOT RELEASE" in shaky marker. Released anyway.',
  'A one-liner record so old the jokes have their own jokes about them being old.',
  'A heckler-response album — just forty minutes of comebacks with no setup jokes.',
];

// Italian soundtracks & Sinatra-adjacent junk finds — used for Junior's
// Pizza's dig crates. Good vibes, but never one of the 5 collectible
// records, so these never advance the sampler.
const PIZZA_JUNK = [
  'A well-worn "Sinatra at the Sands" LP. Somebody\'s dad definitely cried to this.',
  'A Rat Pack cocktail-hour compilation. Smells faintly of oregano and cologne.',
  'The soundtrack to some old spaghetti western. Not a single word of English on it.',
  '"Dino Sings, Dino Swings" — the sleeve is stained with what you sincerely hope is marinara.',
  'A Neapolitan mandolin record, warped slightly from sitting too close to the pizza oven.',
  'Tony Bennett doing his best Sinatra impression on a bootleg 45. Not bad, actually.',
];

// Nectar's own three themed dig crates -- each one a dead end for the
// sampler, but flavorful for its own reason. Unlike JUNK/COMEDY_JUNK/
// PIZZA_JUNK (a shared pool multiple crates draw from), each entry here is
// paired 1:1 with one specific crate via c.nectarsSeed (see doInteract()),
// so digging a given crate always turns up its own themed find.
const NECTARS_JUNK = [
  { line: 'Crate after crate of amateur Phish and Grateful Dead cover bands, taped live at open mic nights around town. You are not interested. At all.',
    reply: 'Keep digging... there\'s got to be something else in here.' },
  { line: 'Deep reggae cuts, hand-selected — this whole crate is Big Dog\'s own top-shelf picks, dubbed special for Reggae Night.',
    reply: 'Serious quality selections, but not one of the five you\'re chasing.' },
  { line: 'Raw, dope hip hop instrumentals — big shoutout to FLEX RECORDS for supplying the heat in this crate.',
    reply: 'Certified fire beats. Still not what\'s calling you tonight, though.' },
];

// Henry's Diner's two themed dig crates -- vintage 1950s jazz crooners,
// same 1:1 pairing via c.henrysSeed as NECTARS_JUNK above. Great records,
// worth a trip back once the current hunt is done, but never one of the
// 5 collectibles.
const HENRYS_JUNK = [
  { line: 'A stack of 1950s jazz crooner 78s — smooth, late-night stuff, sleeves gone soft and yellowed with age. Really cool records.',
    reply: 'Worth coming back for sometime. Just not what you\'re after tonight.' },
  { line: 'More crooner sides from the same era — some big-band swing mixed in, all beautifully worn from decades of diner jukebox spins.',
    reply: 'Great stuff, all of it. None of it is one of the five, though.' },
];

// Fake front-page stories for the town's newspaper stands. Onion/Daily Show
// style Vermont satire — one random headline+body pops up each time a stand
// is read. Keep these silly and harmless, no real people, just generic
// Vermont flavor.
const VERMONT_NEWS_PAPER = 'THE GREEN MOUNTAIN BUGLE';
const VERMONT_NEWS = [
  { headline: 'LOCAL MAN PROUD TO ANNOUNCE HIS DRIVEWAY IS "MOSTLY" MUD SEASON-FREE',
    body: 'Area resident stood at the end of his driveway for forty-five minutes Tuesday, insisting to no one in particular that this year\'s mud was "definitely less soupy" than last year\'s. Sources say his boots disagreed.' },
  { headline: 'STATE MOOSE POPULATION DEMANDS RIGHT OF WAY, GETS IT',
    body: 'A single moose brought the highway to a standstill for the third time this month, chewing thoughtfully at a guardrail while a dozen Subarus idled in respectful silence.' },
  { headline: 'GENERAL STORE OWNER SIGHTS FIRST TOURIST OF LEAF SEASON, RINGS CEREMONIAL BELL',
    body: 'Locals report the annual ritual came a full nine days early this year, with the tourist reportedly asking whether the "fall colors are still on."' },
  { headline: 'ARTISANAL CHEESE FEUD ENTERS SECOND GENERATION',
    body: 'Two neighboring farms remain locked in a decades-long dispute over whose raw-milk cheddar is "the sharp one," with no resolution expected before Town Meeting Day.' },
  { headline: 'COVERED BRIDGE VOTED "MOST PHOTOGENIC STRUCTURE" FOR 47TH STRAIGHT YEAR',
    body: 'The wooden bridge could not be reached for comment but was, as always, extremely picturesque.' },
  { headline: 'MAPLE SYRUP FUTURES MARKET ROCKED BY EARLY THAW',
    body: 'Sugarmakers across the state report "cautious optimism," which local linguists confirm is Vermont for panic.' },
  { headline: 'TOWN MEETING DAY VOTE ON NEW STOP SIGN ENTERS FOURTH HOUR OF DEBATE',
    body: 'Residents remain divided on the sign\'s "overall vibe," with several speakers noting it "doesn\'t really fit the character of the intersection."' },
  { headline: 'LOCAL BREWERY RELEASES SEASONAL ALE BREWED WITH "WHATEVER WAS GROWING BEHIND THE BARN"',
    body: 'Early reviews describe the beer as "hazy," "extremely hazy," and "is that a spruce tip?"' },
  { headline: 'PORCH SEASON OFFICIALLY DECLARED OPEN BY UNANIMOUS NEIGHBORHOOD WAVE',
    body: 'Residents confirm the traditional slow-motion driveway wave has returned, with peak wave season expected through Labor Day.' },
  { headline: 'AREA HIKER ACHIEVES FULL EYE CONTACT WITH FELLOW HIKER, NODS ONCE',
    body: 'Witnesses called it "the most emotion exchanged on that trail all week."' },
  { headline: 'WOODSTOVE INSTALLED IN JUNE "JUST TO BE SAFE," OWNER EXPLAINS',
    body: 'Neighbors say the move is "reasonable" and "frankly overdue," citing last week\'s brief 61-degree evening.' },
  { headline: 'STATE LEGISLATURE DEBATES OFFICIAL FLANNEL OF VERMONT',
    body: 'Lawmakers remain gridlocked between "classic red-and-black" and "the green one my uncle has," with a vote expected sometime after mud season.' },
  { headline: 'FARMERS MARKET ZUCCHINI SURPLUS REACHES CRISIS LEVELS',
    body: 'Residents report finding unmarked zucchini on their porches, in their mailboxes, and, in one case, in their car.' },
  { headline: 'LOCAL DOG ACHIEVES MINOR CELEBRITY STATUS FOR SITTING NEAR GENERAL STORE',
    body: 'The dog, reached for comment, declined to elaborate on its process but did accept a piece of jerky.' },
  { headline: 'SKI TOWN PARKING LOT ACHIEVES SENTIENCE, STILL WORSE THAN LAST YEAR',
    body: 'Visitors describe circling for "geologic amounts of time" before abandoning their cars in what locals call "creative interpretations of a parking space."' },
  { headline: 'COMMUNITY GARDEN COMMITTEE SPLITS OVER PROPER DEFINITION OF "HEIRLOOM"',
    body: 'Tensions remain high after a member brought store-bought tomatoes to the potluck and called them "rustic."' },
  { headline: 'BLACK FLY SEASON ARRIVES RIGHT ON SCHEDULE, RUINS EVERYTHING SLIGHTLY',
    body: 'Outdoor gathering organizers report a sharp increase in "casual arm flailing" across all town events this week.' },
  { headline: 'LOCAL FIDDLER SPOTTED PRACTICING ON PORCH, NEIGHBORHOOD DECLARES IT "PRETTY GOOD, ACTUALLY"',
    body: 'A brief pause in traffic was reported as several cars slowed to listen, then remembered they were on a dirt road with no other cars.' },
  { headline: 'BUGLE ANNOUNCES IT IS, ONCE AGAIN, OUT OF ACTUAL NEWS',
    body: 'Editors confirm today\'s front page was filled entirely with vibes, one weather observation, and a strong opinion about zucchini.' },
];

// ---------------------------------------------------------------- input
const keys = {};
let interactPressed = false;
let buyPressed = false; // also doubles as "back" (X) on the dig-choice/slot-choose menus
// Second action key, only meaningful inside a mini-game that needs two
// independent inputs (currently just Freestyle Scratch-DJ's right-hand
// needle). Keyboard: [Q]. Touch: doubles up on the SK8 button, which is
// otherwise a no-op outside the 'play' state (see toggleSkate()).
let scratchPressed = false;
let menuMove = 0; // edge-triggered -1/0/1 from up/down arrows, consumed by the dig-choice/slot-choose menus

// ---- "fifa" keyword easter egg -------------------------------------------
// Typing the word "fifa" on a physical keyboard (any time, in any state)
// pops a splash + countdown popup, then hands control back to whatever
// state the player was in. Keyboard-only by nature: touch users have no
// keys to type, so this simply never fires for them.
const FIFA_CODE = 'fifa';
let fifaBuffer = '';
let fifaReturnState = 'play';
let fifaStartTime = 0;
function triggerFifaEasterEgg() {
  if (state === 'fifa') return; // already showing, don't restart the clock
  fifaReturnState = state;
  state = 'fifa';
  fifaStartTime = performance.now();
}

