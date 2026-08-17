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
let buyPressed = false;

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
    if (k === 'arrowleft') selectMove = -1;
    if (k === 'arrowright') selectMove = 1;

    // track typed letters for the "fifa" easter egg, keeping only the last
    // 4 characters typed so it works no matter what came before
    if (k.length === 1 && k >= 'a' && k <= 'z') {
      fifaBuffer = (fifaBuffer + k).slice(-FIFA_CODE.length);
      if (fifaBuffer === FIFA_CODE) {
        fifaBuffer = '';
        triggerFifaEasterEgg();
      }
    } else {
      fifaBuffer = '';
    }
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
// Rico, but dressed for a walk — Yankees cap + grey hoodie. Same 3x4 sheet
// layout as ricoImg so it can be swapped in without touching drawPlayer's
// row/col math.
const ricoAltImg = new Image();
ricoAltImg.src = 'assets/rico_alt.png';
// Santos — Rico's longtime best friend. NOFX shirt, glasses, same sheet
// layout as the other two.
const santosImg = new Image();
santosImg.src = 'assets/santos.png';
const SHEET_CW = 129, SHEET_CH = 225;
const DIR_ROW = { up: 0, down: 1, left: 2, right: 3 };

// ---------------------------------------------------------------- playable characters
// Every entry shares the same 129x225, 3-col x 4-row sheet layout as ricoImg,
// so drawPlayer() just swaps which image it draws from.
const CHARACTERS = {
  rico:    { id: 'rico',    img: ricoImg,     label: 'RICO' },
  ricoAlt: { id: 'ricoAlt', img: ricoAltImg,  label: 'RICO' },
  santos:  { id: 'santos',  img: santosImg,   label: 'SANTOS' },
};
let selectedCharacter = 'rico';

const characterSelectImg = new Image();
characterSelectImg.src = 'assets/character_select.png';
// Left-to-right order the character-select portraits appear in the art
// (green/NOFX = Santos, blue/cap = Rico in his hoodie, red/shades = classic
// Rico) — used both for keyboard left/right navigation and for mapping a
// tap's x-position to a character.
const SELECT_ORDER = ['santos', 'ricoAlt', 'rico'];
let selectIndex = 2; // highlighted portrait for keyboard/E users; defaults to classic Rico
let selectMove = 0;  // edge-triggered -1/0/1 from arrow keys, consumed in update()
let selectLayout = null; // { originX, originY, scale } of the drawn select-screen art, set each frame it's drawn

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

// "Closed for now" splash shown when the player walks into one of the
// placeholder portal doors at the west/east edges of the map.
const portalClosedImg = new Image();
portalClosedImg.src = 'assets/closed_for_now.png';

// Easter-egg splash shown when the player types "fifa" on a keyboard (see
// the fifaBuffer tracking in the keydown listener below).
const fifaImg = new Image();
fifaImg.src = 'assets/fifa.png';

// Green Door Studio's two extra characters — Kanga on the turntables and
// Truth posted up nearby. Full pre-drawn scenes rather than the sheet-based
// player art, so they're just drawn as-is, feet anchored to the floor line.
const kangaImg = new Image();
kangaImg.src = 'assets/kanga.png';
const truthImg = new Image();
truthImg.src = 'assets/truth.png';

// Henry's Diner's coffee-table trio — same "pre-drawn, drawn as-is" approach
// as the Green Door Studio npcs above.
const billImg = new Image();
billImg.src = 'assets/bill.png';
const rzaImg = new Image();
rzaImg.src = 'assets/rza.png';
const gzaImg = new Image();
gzaImg.src = 'assets/gza.png';

// Zach "SkySplitterInk" — Green Door Studio's resident sound engineer,
// posted up with his MPC and notebook. Same pre-drawn treatment as the rest
// of the shop npcs above.
const zachImg = new Image();
zachImg.src = 'assets/zach.png';

// ---------------------------------------------------------------- maps
const SOLID = new Set(['#', 'w', 'f', '~', 'W', 'T', 'C', 'c', 'K', 'J', 'S', 'A', 'N', 'F']);

function blankGrid(w, h, fill) {
  return Array.from({ length: h }, () => Array(w).fill(fill));
}

function makeOverworld() {
  const W = 40, H = 26;
  const g = blankGrid(W, H, '.');
  for (let x = 0; x < W; x++) { g[0][x] = '#'; g[H-1][x] = '#'; }
  for (let y = 0; y < H; y++) { g[y][0] = '#'; g[y][W-1] = '#'; }

  for (let x = 1; x < W-1; x++) { g[9][x] = 'r'; }
  for (let y = 1; y < H-1; y++) { g[y][19] = 'r'; }

  // Placeholder portal doors on the west, east, north & south edges of the
  // map. The west/east pair sits right on Main Street (row 9); the
  // north/south pair sits on the vertical cross-street (column 19), so all
  // four read as a natural continuation of a road. None lead anywhere yet —
  // walking into one pops the "more lands coming" splash (see
  // checkPortal()/drawPortalPopup()).
  g[9][0] = 'P';
  g[9][W - 1] = 'P';
  g[0][19] = 'P';
  g[H - 1][19] = 'P';

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
  const henrys = building(23, 3, 4, 4, "Henry's Diner", '#f2eee2', '#e8b830'); // white with yellow trim, classic diner, just west of Hey Bud
  const wax    = building(28, 3, 7, 4, 'Hey Bud', '#f2efe4', '#2f8fa8'); // white w/ teal-topped mural band, red door & kickplate
  const diner  = building(4, 14, 5, 4, 'Kountry Kart Deli', '#181614', '#a8281f'); // black storefront, red trim band — smaller, 5 tiles wide
  const nectars = building(9, 14, 4, 6, 'Nectars', '#2a2a3a', '#1a1a2a'); // taller building next to deli
  const thrift = building(28, 14, 5, 4, 'Pure Pop Records', '#3f8fbf', '#2a6a93'); // smaller to make room
  const juniors = building(33, 14, 4, 4, "Junior's", '#d84030', '#a83020'); // pizza shop
  // Tiny comedy club squeezed into the last 2 open columns before the town's
  // east wall — right next door to Junior's, hence the "tiny" footprint.
  const comedy  = building(37, 14, 2, 4, 'VT COMEDY CLUB', '#3a1a52', '#24102f');

  // Church: kept as its own bespoke red-brick meetinghouse (drawChurch(),
  // drawn separately in drawTownDecorations) rather than run through the
  // generic building() renderer, so the custom steeple/brick art doesn't get
  // covered by a second plain box underneath it. Still needs solid wall
  // tiles + a working door though, sized and positioned to match
  // drawChurch()'s own footprint exactly (px=18*TILE, py=6*TILE, 3x3 tiles).
  const CHURCH_X = 18, CHURCH_Y = 6, CHURCH_W = 3, CHURCH_H = 3;
  for (let yy = CHURCH_Y; yy < CHURCH_Y + CHURCH_H; yy++)
    for (let xx = CHURCH_X; xx < CHURCH_X + CHURCH_W; xx++) g[yy][xx] = 'w';
  const church = { doorX: CHURCH_X + Math.floor(CHURCH_W / 2), doorY: CHURCH_Y + CHURCH_H - 1 };
  g[church.doorY][church.doorX] = 'D';

  // park + winding river, avoiding the building footprints
  const riverTiles = [];
  for (let y = 1; y <= H - 2; y++) {
    const onRoad = (y === 9);
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

  const trees = [[3,20],[5,22],[7,19],[13,21],[15,23],[3,23],[10,23],[36,20],[34,23],[9,12],[14,13],[25,12],[36,12],[2,12],[37,7],[2,7],[24,23],[13,6],[26,6]];
  for (const [tx, ty] of trees) if (g[ty][tx] === '.') g[ty][tx] = '#';

  // Vermont Green FC soccer stadium — a big solid outdoor structure with no
  // door; the player just walks around it like a landmark, never inside it.
  // Only the top 3/4 of the stadium bowl lives on this map (drawStadium()
  // draws it clipped to this footprint); the bottom 1/4 is meant to continue
  // into the map area planned for directly south of here, to be connected
  // once that map exists.
  const STADIUM_X = 17, STADIUM_Y = 17, STADIUM_W = 6, STADIUM_H = 7;
  for (let yy = STADIUM_Y; yy < STADIUM_Y + STADIUM_H; yy++)
    for (let xx = STADIUM_X; xx < STADIUM_X + STADIUM_W; xx++) g[yy][xx] = 'w';
  // carve out the pitch itself so the player can walk around inside the
  // bowl, then punch two openings through the west/east walls (at the same
  // row) so there's a way in and out on either side of the field.
  for (let yy = STADIUM_Y + 1; yy < STADIUM_Y + STADIUM_H - 1; yy++)
    for (let xx = STADIUM_X + 1; xx < STADIUM_X + STADIUM_W - 1; xx++) g[yy][xx] = '.';
  const STADIUM_OPEN_Y = STADIUM_Y + Math.floor(STADIUM_H / 2); // must match drawStadium()'s gate row
  g[STADIUM_OPEN_Y][STADIUM_X] = '.';                     // west opening
  g[STADIUM_OPEN_Y][STADIUM_X + STADIUM_W - 1] = '.';     // east opening
  // south opening, directly above the vertical cross-street (column 19) so
  // the pitch connects straight down through the one open road row below
  // the stadium (24) to the south portal on the map's bottom edge (25).
  g[STADIUM_Y + STADIUM_H - 1][19] = '.';

  // flea market corner: crates only (the fence stalls were removed — they
  // boxed the player in too much while walking around), one holds the white label
  g[20][26] = 'c'; g[21][28] = 'c'; g[20][30] = 'c';

  const map = {
    id: 'town', world: 'town', w: W, h: H, grid: g, outside: true, buildings,
    doors: {}, crates: {}, npcs: [], riverTiles,
    // ambient life lanes for this map (which road rows each spawns on)
    // dogRow moved off 23 -> 6: the new stadium footprint (rows 17-23) now
    // sits on top of the old dog lane.
    ambient: { bikeRows: [9], walkerRow: 12, dogRow: 6 },
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
  // Newspaper stands: three spots picked in open grass, well clear of
  // buildings, the river/roads, trees, and every other interactable (NPCs,
  // crates, vendor carts) so their prompt box never overlaps another one.
  map.newsstands = [
    { id: 'news1', tx: 11, ty: 2 },
    { id: 'news2', tx: 33, ty: 12 },
    { id: 'news3', tx: 30, ty: 24 },
  ];
  return { map, doors: { groove, henrys, wax, diner, nectars, thrift, juniors, comedy, church } };
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
  // table footprint + keeper spot both default to the classic centered
  // layout, but either can be overridden per-shop (e.g. Green Door Studio
  // pushes both into the upper-right corner of the room).
  const tableStart = opts.tableRange ? opts.tableRange.start : 4;
  const tableEnd = opts.tableRange ? opts.tableRange.end : 9;
  for (let x = tableStart; x <= tableEnd; x++) g[2][x] = 'T';
  const keeperX = (opts.keeper && opts.keeper.x !== undefined) ? opts.keeper.x : 6;
  const keeperY = (opts.keeper && opts.keeper.y !== undefined) ? opts.keeper.y : 1;
  g[keeperY][keeperX] = 'K';
  g[H-1][6] = 'E';
  (opts.couchTiles || []).forEach(([cx, cy]) => { g[cy][cx] = 'S'; });
  (opts.armchairTiles || []).forEach(([cx, cy]) => { g[cy][cx] = 'A'; });
  if (opts.micStand) { g[opts.micStand[1]][opts.micStand[0]] = 'Y'; }
  (opts.gearTiles || []).forEach(([gx, gy]) => { g[gy][gx] = 'G'; });
  // Freestanding customer tables out on the floor (separate from the
  // counter table above) — e.g. Henry's Diner's coffee-klatch table.
  (opts.extraTables || []).forEach(([ex, ey]) => { g[ey][ex] = 'T'; });
  // Shop npcs (e.g. Kanga & Truth in Green Door Studio) block movement just
  // like the keeper does, so the player can't walk through them.
  (opts.npcs || []).forEach((n) => { g[n.ty][n.tx] = 'N'; });
  // Big carnival floor props (giant lollipops, candy canes, popcorn buckets)
  // — solid, so they read as real fairground fixtures, not floor decals.
  (opts.carnivalProps || []).forEach(([fx, fy]) => { g[fy][fx] = 'F'; });
  const map = {
    id, world: opts.world || 'town', w: W, h: H, grid: g, outside: false,
    floor: opts.floor, plank: opts.plank, wallColor: opts.wallColor,
    keeper: { x: keeperX, y: keeperY, ...opts.keeper },
    artTable: opts.artTable || false,
    paintings: opts.paintings || null,
    muralWall: opts.muralWall || false,
    graffitiWalls: opts.graffitiWalls || false,
    cypherVibe: opts.cypherVibe || false,
    paintFloor: opts.paintFloor || false,
    confettiColors: opts.confettiColors || null,
    bigTopWalls: opts.bigTopWalls || false,
    buntingFlags: opts.buntingFlags || false,
    couchPillow: opts.couchPillow || null,
    crates: {}, npcs: opts.npcs || [],
    darkClub: opts.darkClub || false,
    pizzaShop: opts.pizzaShop || false,
    diner: opts.diner || false,
    comedyClub: opts.comedyClub || false,
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
    // dark, paint-scuffed concrete-studio look, matching the reference photo
    floor: '#5c5a5e', plank: '#4c4a4e', wallColor: '#19171d',
    paintFloor: true,
    // table + keeper pushed into the upper-right corner instead of centered
    tableRange: { start: 8, end: 11 },
    artTable: true,
    // colorful gallery paintings along the left wall, above the dig crates
    paintings: {
      '0,2': { base: '#e0a030', a: '#c04070', b: '#4870d0' },
      '0,3': { base: '#4870d0', a: '#e0a030', b: '#4a8a4a' },
      '0,5': { base: '#c04070', a: '#4870d0', b: '#e0a030' },
      '0,7': { base: '#4a8a4a', a: '#e0603a', b: '#e0e0dc' },
    },
    // big abstract mural across the back wall behind the keeper
    muralWall: true,
    // every wall tile gets a wild-style graffiti pass (garage art-gallery
    // look), with the framed paintings/mural sitting on top of it like
    // pieces hung over a painted wall
    graffitiWalls: true,
    // cypher-night clutter: mic stand, scattered gear, bottles + ashtrays
    cypherVibe: true,
    micStand: [7, 5],
    gearTiles: [[3, 3], [8, 3], [4, 7], [10, 7], [2, 5]],
    // dark couch along the right wall (with a throw pillow) plus a gold
    // armchair pulled up near the table, mirroring the photo's seating nook
    couchTiles: [[12, 7], [12, 8]],
    couchPillow: { x: 12, y: 7 },
    armchairTiles: [[9, 4]],
    keeper: { name: 'SK1', shirt: '#1f1d26', skin: '#8a5a34', x: 9, y: 1,
      lines: ['Welcome to Green Door Studio — mind the wet paint by the door.',
              'You already know: Third Thursdays, the monthly hip hop night. The whole Anthill Collective moves when the bass drops.',
              'I\'m with The Anthill Collective — the crew keeps the color on the walls and the sessions open.',
              'Support the independent hustle, family. We\'re all building our own creative thing in this world.',
              'We cut a few tracks back here between mural sessions. A Static Groove reel ended up in a crate somewhere.',
              'Try digging through the crates against the LEFT wall — should still be under some old spray cans.'],
      foundLine: 'Elm Street Funk?! I thought that tape got lost under the primer. Go make some noise with it.' },
    crates: [ { record: 'elm' }, { junkSeed: 0 }, { junkSeed: 1 }, { junkSeed: 2 } ],
    // Kanga on the turntables, posted up next to SK1's table; Truth holding
    // down the middle of the floor.
    npcs: [
      { id: 'kanga', tx: 6, ty: 4, name: 'KANGA', sprite: 'kanga',
        lines: [
          'Yo — Kanga on the ones and twos. Got a crate of dubs right here, all killer, no filler.',
          'That frog record on top? Don\'t ask, don\'t sleep on it either. Certified heat.',
          'Third Thursdays I run this booth till the breaker trips. Come through.',
        ] },
      { id: 'truth', tx: 5, ty: 6, name: 'TRUTH', sprite: 'truth',
        lines: [
          'Truth, QSD, swamp life, all day. You already know.',
          'Cane\'s for style, not for support — don\'t get it twisted.',
          'Green Door\'s family. Anybody good with you is good with me.',
        ] },
      { id: 'zach', tx: 10, ty: 6, name: 'SKYSPLITTERINK', sprite: 'zach',
        lines: [
          'Zach — but around here everybody just says SkySplitterInk. Sound engineer, producer, full-time studio rat.',
          'I\'ve had a hand in more Vermont hip hop than I can count. If it came out of this scene, chances are it passed through these speakers.',
          'People call me a magician with sound. I just call it paying attention — EQ, levels, the pocket. It all matters.',
          'This whole independent scene runs on people showing up for each other. I just try to make everybody\'s stuff sound as good as it deserves to.',
          'Got the MPC, got the notebook, got the headphones warmed up. Always cooking something back here.',
        ] },
    ],
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
  henrys: makeShop('henrys', {
    floor: '#e8dcc8', plank: '#d8c8a8', wallColor: '#8a2820',
    keeper: { name: 'HENRY', shirt: '#f4ecd8', skin: '#c89268',
      lines: ['Welcome to Henry\'s — grab a stool, the coffee\'s always on.',
              'Been flipping burgers on this griddle since before you were born.',
              'Menu\'s simple: burgers, fries, milkshakes. Don\'t overthink it.'],
      foundLine: 'Well butter my biscuit — is that a record? Keep on truckin\', kid.' },
    crates: [],
    diner: true,
    // Corner coffee table with three regulars posted up around it, same
    // "solid, image-drawn" treatment as Green Door Studio's npcs.
    extraTables: [[5, 6], [6, 6]],
    npcs: [
      { id: 'actor', tx: 5, ty: 7, name: 'THE ACTOR', sprite: 'bill',
        lines: [
          'You know, the secret isn\'t finding meaning. It\'s finding a good cup of coffee and pretending you already have.',
          'Bruce Lee once said "be water." I say, be decaf. Fewer regrets.',
          'Chess is just checkers for people who read too much. I respect that.',
          'Somebody told me cash rules everything around me. I told them so does good posture.',
          'Half of wisdom is just showing up. The other half is not spilling your coffee.',
          'I\'ve seen every kung fu movie ever made. Twice. Cheaper than therapy, and the fight choreography\'s better.',
        ] },
      { id: 'abbot', tx: 4, ty: 6, name: 'THE ABBOT', sprite: 'rza',
        lines: [
          'Bong Bong. The knowledge of self is the beginning of all understanding — know that before you know anything else.',
          'Bong Bong. C.R.E.A.M. ain\'t just about the paper. It\'s about what controls you, and what you choose to control instead.',
          'Bong Bong. Every closed fist was once an open hand. Patience sharpens the blade more than anger ever could.',
          'Bong Bong. Chess and kung fu teach the same lesson — see three moves ahead, but stay light on your feet.',
          'Bong Bong. Peace is a discipline, not a mood. Some days you gotta build it brick by brick.',
          'Bong Bong. The wise man drinks his coffee slow and speaks slower. Rushing is the enemy of clarity.',
        ] },
      { id: 'chessmaster', tx: 7, ty: 6, name: 'THE CHESSMASTER', sprite: 'gza',
        lines: [
          'Every game starts even. What separates the master from the amateur is what happens on move four.',
          'A pawn that reaches the other side of the board becomes a queen. Never underestimate small, steady movement.',
          'Liquid swords, wooden swords, chess pieces — it\'s all the same discipline. Precision over power.',
          'You don\'t win by attacking everything. You win by controlling the center and waiting for your opponent to overextend.',
          'Bruce Lee said absorb what is useful. On the chessboard, that means studying your losses harder than your wins.',
          'Cash rules plenty, but calculation rules cash. Think three moves before you spend one dollar.',
        ] },
    ],
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
  comedy: makeShop('comedy', {
    world: 'town',
    floor: '#241830', plank: '#1a1224', wallColor: '#3a1a52',
    keeper: { name: 'MOOZY', shirt: '#e0b040', skin: '#c89a72',
      lines: ['Welcome to the VT COMEDY CLUB — smallest room in town, biggest laughs.',
              'Open mic every night. Sign-up sheet\'s by the door, no cover charge.',
              'Records? Nah, we don\'t spin vinyl in here — just bad puns and worse timing.',
              'Try Pure Pop Records down the street if you\'re digging for tunes.'],
      foundLine: 'Ha! Save that energy for the mic, we could use it.' },
    crates: [],
    comedyClub: true,
  }),
  church: makeShop('church', {
    world: 'town',
    // Candy-pink floor, deep violet walls, big-top candy stripes, bunting
    // pennants along the ceiling line, rainbow confetti underfoot — the
    // sedate red-brick meetinghouse outside gives zero warning for this.
    floor: '#ffe1f2', plank: '#ffc4e0', wallColor: '#4a1268',
    paintFloor: true,
    confettiColors: ['#ff5fa2', '#5fd0ff', '#ffe14d', '#8cff5f', '#c85fff'],
    bigTopWalls: true,
    buntingFlags: true,
    muralWall: true,
    paintings: {
      '0,2': { base: '#ff5fa2', a: '#5fd0ff', b: '#ffe14d' },
      '0,3': { base: '#5fd0ff', a: '#ff5fa2', b: '#8cff5f' },
      '0,5': { base: '#ffe14d', a: '#c85fff', b: '#ff5fa2' },
      '0,7': { base: '#8cff5f', a: '#5fd0ff', b: '#ffe14d' },
    },
    // Giant lollipops, candy canes, and popcorn buckets scattered around
    // the floor — solid, so they read as real fairground fixtures.
    carnivalProps: [[2, 6], [11, 6], [2, 8], [11, 8]],
    // Lanny holds down the centered counter spot (the same "front and
    // center" position SK1 uses in Green Door Studio) so she's always the
    // first thing the player sees walking in.
    keeper: { name: 'LANNY', shirt: '#ff2f8a', skin: '#e8b48a',
      lines: [
        'Every eye in the room is on Lanny — and honestly? She loves it.',
        'She throws her head back and launches into a big, dramatic rendition of "Ironic." None of it is actually ironic. Doesn\'t matter.',
        'Now she\'s pointing dramatically at absolutely nobody in particular, belting out "You Oughta Know." Riveting stuff.',
        'She croons her way through "Hand in My Pocket" — one hand, fittingly, still in her pocket the entire time.',
        'Spinning in a slow circle now, mid-chorus of "Head Over Feet." You clap along whether you meant to or not.',
        'Somewhere between a whisper and a wail, she works through "Uninvited." Nobody invited this. Here we are anyway.',
        'Big finish: she closes it out on "Thank U," bowing so low her sequined cape nearly hits the floor.',
      ] },
    crates: [],
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
let state = 'splash'; // splash | title | select | play | dialog | record | win | portal | fifa
let dialog = null;   // { name, lines, i }
let shownRecord = null;
let activePortal = null; // { x, y } tile the player walked into to open the portal popup
const completedWorlds = new Set(); // worlds whose 5 records have all been found
let toast = null;    // { text, t }

// Voice line played the instant a character is locked in at the select
// screen — drop a short vocal clip at assets/lets_do_this.mp3 (or .ogg/.wav,
// see loadSfx below) to hear it. Until that file exists the browser just
// fails to load it silently; nothing breaks.
const letsDoThisSfx = loadSfx('assets/lets_do_this');
function loadSfx(basePath) {
  const a = new Audio();
  a.preload = 'auto';
  a.volume = 0.9;
  // Try each format as a separate <source>, so whichever file actually
  // exists (mp3/ogg/wav) gets picked up rather than only ever looking for
  // .mp3. Per the media spec, the browser falls through to the next
  // <source> both on an unsupported type AND on a failed/missing fetch, so
  // this covers "I dropped in a .wav" as well as "the .mp3 doesn't exist".
  ['mp3', 'ogg', 'wav'].forEach((ext) => {
    const src = document.createElement('source');
    src.src = `${basePath}.${ext}`;
    a.appendChild(src);
  });
  return a;
}

// Locks in a playable character and boots straight into the game with them.
function chooseCharacter(id) {
  if (!CHARACTERS[id]) return;
  selectedCharacter = id;
  state = 'play';
  music.setMenuBreak(false);
}

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

  // How far ahead of real audio time we keep notes scheduled. The outdoor
  // town map draws a lot more per frame than an interior (fountain, jazz
  // banner, wall painter, parked cars, newsstands, etc. all redrawn from
  // scratch every frame), so main-thread frames/GC pauses run noticeably
  // longer there than indoors. If a stall outlasts this buffer, playback
  // runs dry and you hear a glitch/stutter — so this needs enough margin
  // to comfortably absorb outdoor-map frame spikes, not just indoor ones.
  //
  // This used to be 0.9s, which is plenty for a handful of slow frames but
  // not for a sustained run of heavy outdoor frames (or a GC pause) — once
  // real time ate into the buffer, `nextTime` could end up behind (or only
  // just ahead of) ctx.currentTime. Web Audio clamps any start time that has
  // already passed to "now", so several queued steps would all fire at once
  // — that's the burst/glitch you hear right when you step outside. Bumping
  // this up gives a much bigger cushion before that can happen at all.
  LOOKAHEAD: 2.0,
  // Minimum gap we insist a scheduled note sits ahead of real audio time.
  // Even with a big LOOKAHEAD, the *last* step scheduled in a catch-up pass
  // could still land within a few ms of "now" — this margin guarantees every
  // note is genuinely in the future, so nothing gets clamped and doubled up.
  MIN_MARGIN: 0.06,

  pump() {
    const stepDur = 60 / this.BPM / 4;
    const now = this.ctx.currentTime;
    // If something stalled the main thread for a long stretch (tab backgrounded,
    // a very long GC pause, etc.), don't dump a burst of overdue notes all at
    // once — resync onto the next clean beat boundary and carry on from there,
    // silently (no note is scheduled for the missed span, rather than cramming
    // several into the same instant). This should only trigger for genuinely
    // extreme stalls, well beyond LOOKAHEAD, so ordinary outdoor-map frame
    // jank gets absorbed by the buffer instead of resyncing.
    if (this.nextTime < now - this.LOOKAHEAD) {
      const stepsPerBeat = 4;
      const beatDur = stepDur * stepsPerBeat;
      const beatsAhead = Math.ceil((now + this.MIN_MARGIN - this.nextTime) / beatDur);
      this.step = (this.step + beatsAhead * stepsPerBeat) % 32;
      this.nextTime += beatsAhead * beatDur;
    }
    // Scheduled well ahead of real time (not just ~1 frame) so a slow
    // render frame in the busy outdoor map can't cause the scheduler to
    // fall behind and produce audible stutter/catch-up bursts. Every step
    // is also clamped to MIN_MARGIN ahead of "now" so a long catch-up pass
    // can never schedule two steps close enough together to sound doubled.
    while (this.nextTime < now + this.LOOKAHEAD) {
      const t = Math.max(this.nextTime, now + this.MIN_MARGIN);
      this.schedule(this.step, t, stepDur);
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

  checkPortal(map);
}

// Placeholder portal doors: walking onto a 'P' tile pops the "more lands
// coming" splash instead of an actual map transition. Records which tile
// was entered so closing the popup can nudge the player back off of it —
// otherwise standing still on the tile would reopen the popup every frame.
function checkPortal(map) {
  const tx = Math.floor(player.x / TILE), ty = Math.floor(player.y / TILE);
  if (map.grid[ty] && map.grid[ty][tx] === 'P') {
    activePortal = { x: tx, y: ty };
    state = 'portal';
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
    if (map.newsstands) {
      const ns = map.newsstands.find(n => n.tx === tx && n.ty === ty);
      if (ns) return { type: 'newspaper', data: ns };
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
  } else if (target.type === 'newspaper') {
    const story = VERMONT_NEWS[Math.floor(Math.random() * VERMONT_NEWS.length)];
    dialog = { name: VERMONT_NEWS_PAPER, lines: [story.headline, story.body], i: 0 };
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

// Floating analog joystick removed in favor of discrete d-pad buttons (see
// createTouchControls) \u2014 four separate elements proved more reliable for
// touch input than a single drag-tracked zone.

function createTouchControls() {
  const wrap = document.createElement('div');
  wrap.id = 'touchControls';
  wrap.addEventListener('contextmenu', (e) => e.preventDefault());

  // Explicitly pin the container's height in px to the actually-visible
  // viewport. This is belt-and-suspenders alongside the 100svh CSS rule:
  // some mobile browsers (older Safari/Chrome builds especially) don't
  // support svh units, and fall back to 100vh, which on-screen-toolbar
  // quirks can size against the viewport with toolbars hidden -- leaving
  // bottom-anchored controls positioned below the visible screen, worst in
  // portrait. Recomputing this in JS on every resize/orientation change
  // sidesteps CSS unit support entirely.
  function syncHeight() {
    const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    wrap.style.height = h + 'px';
  }
  syncHeight();
  window.addEventListener('resize', syncHeight);
  window.addEventListener('orientationchange', syncHeight);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', syncHeight);

  const dpad = [
    ['dpadUp', 'arrowup', '▲'],
    ['dpadDown', 'arrowdown', '▼'],
    ['dpadLeft', 'arrowleft', '◀'],
    ['dpadRight', 'arrowright', '▶'],
  ];
  dpad.forEach(([id, k, label]) => {
    const btn = document.createElement('div');
    btn.id = id; btn.className = 'tc-btn'; btn.textContent = label;
    bindHold(btn, () => {
      keys[k] = true;
      // On the character-select screen the d-pad's left/right taps need to
      // drive selectMove directly, the same way the keydown listener does
      // for a physical keyboard — held/synthetic key state alone never
      // reaches update()'s selectMove check.
      if (state === 'select') {
        if (k === 'arrowleft') selectMove = -1;
        if (k === 'arrowright') selectMove = 1;
      }
      music.start();
    }, () => { keys[k] = false; });
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

canvas.addEventListener('pointerdown', (e) => {
  music.start();
  if (state === 'select') {
    const rect = canvas.getBoundingClientRect();
    const vx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const vy = (e.clientY - rect.top) * (canvas.height / rect.height);
    handleCharacterTap(vx, vy);
  } else if (state !== 'play') {
    interactPressed = true;
  }
});

// Maps a tap/click in view (960x600) coordinates to whichever character
// portrait it landed on, using the layout drawCharacterSelect() recorded
// the last time it drew the art. Ignores taps outside the art entirely.
function handleCharacterTap(vx, vy) {
  if (!selectLayout) return;
  const { originX, originY, scale, imgW, imgH } = selectLayout;
  const ix = (vx - originX) / scale, iy = (vy - originY) / scale;
  if (ix < 0 || ix > imgW || iy < 0 || iy > imgH) return;
  const frac = ix / imgW;
  let idx;
  if (frac < 0.345) idx = 0;
  else if (frac < 0.658) idx = 1;
  else idx = 2;
  selectIndex = idx;
  chooseCharacter(SELECT_ORDER[idx]);
}

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
    if (interactPressed) { state = 'select'; music.setMenuBreak(true); }
  } else if (state === 'select') {
    if (selectMove) {
      selectIndex = Math.max(0, Math.min(SELECT_ORDER.length - 1, selectIndex + selectMove));
      selectMove = 0;
    }
    if (interactPressed) chooseCharacter(SELECT_ORDER[selectIndex]);
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
  } else if (state === 'portal') {
    if (interactPressed) {
      state = 'play';
      if (activePortal) {
        // step the player back off the portal tile onto the road tile just
        // inside the map, so the popup doesn't instantly reopen. Push
        // horizontally for the west/east portals, vertically for the
        // north/south ones — whichever edge the portal actually sits on.
        const m = maps[player.map];
        let pushX = 0, pushY = 0;
        if (activePortal.x === 0) pushX = 1;
        else if (activePortal.x === m.w - 1) pushX = -1;
        else if (activePortal.y === 0) pushY = 1;
        else if (activePortal.y === m.h - 1) pushY = -1;
        player.x = (activePortal.x + pushX + 0.5) * TILE;
        player.y = (activePortal.y + pushY + 0.5) * TILE;
        activePortal = null;
      }
    }
  } else if (state === 'fifa') {
    if (performance.now() - fifaStartTime >= 5000) {
      state = fifaReturnState;
    }
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

// Hoisted out of drawMountains: this array is fully static, so allocating a
// fresh copy of it (plus 3 fresh object literals) on every single outdoor
// frame was pure churn — one more small source of GC pressure stacking on
// top of everything else that redraws every frame outside.
const MOUNTAIN_LAYERS = [
  { color: '#241d38', speed: 0.05, baseY: 130, amp: 32, seed: 0,    snow: false },
  { color: '#332a4c', speed: 0.10, baseY: 155, amp: 48, seed: 700,  snow: true },
  { color: '#443860', speed: 0.18, baseY: 185, amp: 60, seed: 1500, snow: true },
];
function drawMountains(camX) {
  for (const layer of MOUNTAIN_LAYERS) drawMountainLayer(layer, camX);
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
  if (map.diner) drawHenrysInterior(time);
  if (map.comedyClub) drawComedyClubInterior(time);
  if (map.keeper) drawKeeper(map.keeper);
  drawShopImageNpcs(map);
  drawPlayer(time);

  ctx.restore();
  if (state !== 'splash') drawHUD();
  if (state === 'splash') drawSplash();
  if (state === 'title') drawTitle(time);
  if (state === 'select') drawCharacterSelect(time);
  if (state === 'dialog') drawDialog();
  if (state === 'record') drawRecordCard();
  if (state === 'win') drawWin();
  if (state === 'portal') drawPortalPopup();
  if (state === 'fifa') drawFifaPopup();
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
        if (map.paintFloor && (ch === '=') && h % 4 === 0) {
          const drips = map.confettiColors || ['#c0403a', '#3a7ab0', '#e0b030', '#4a8a4a'];
          ctx.fillStyle = drips[h % drips.length];
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.arc(px + 6 + (h % 18), py + 6 + ((h * 3) % 18), 1 + (h % 3), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
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
        case 'P': drawPortalDoor(px, py, tx, ty, time); break;
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
          if (map.bigTopWalls) drawBigTopStripe(px, py, tx);
          if (map.graffitiWalls) drawWildStyleGraffiti(px, py, tx, ty);
          if (map.paintings && map.paintings[key(tx, ty)]) {
            drawWallPainting(px, py, map.paintings[key(tx, ty)]);
          } else if (map.muralWall && ty === 0) {
            drawMuralSwatch(px, py, tx);
          }
          if (map.buntingFlags && ty === 0) drawBunting(px, py, tx);
          break;
        }
        case 'T': {
          if (map.artTable) {
            drawArtTable(px, py, tx, map.cypherVibe);
            break;
          }
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
        case 'S': drawCouch(px, py, !!(map.couchPillow && map.couchPillow.x === tx && map.couchPillow.y === ty)); break;
        case 'A': drawArmchair(px, py); break;
        case 'Y': drawMicStand(px, py); break;
        case 'G': drawHipHopGear(px, py, tx, ty); break;
        case 'F': drawCarnivalProp(px, py, tx, ty); break;
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

// A shimmering, not-yet-open portal doorway. Purely a placeholder visual —
// walking into it triggers drawPortalPopup() instead of an actual map
// transition. Drawn taller than a single tile (it overlaps the row above)
// so it reads as an archway rather than a floor tile.
function drawPortalDoor(px, py, tx, ty, time) {
  const t = time || 0;
  const cx = px + TILE / 2, cy = py + TILE / 2;
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + tx * 3 + ty);

  ctx.save();
  ctx.beginPath();
  ctx.rect(px - 6, py - TILE - 4, TILE + 12, TILE * 2 + 8);
  ctx.clip();

  // outer glow
  const grd = ctx.createRadialGradient(cx, cy, 2, cx, cy, TILE * 0.95);
  grd.addColorStop(0, `rgba(196,150,255,${0.55 + pulse * 0.25})`);
  grd.addColorStop(0.55, 'rgba(108,60,190,0.5)');
  grd.addColorStop(1, 'rgba(20,10,40,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(px - 6, py - TILE - 4, TILE + 12, TILE * 2 + 8);

  // stone archway frame
  ctx.fillStyle = '#241a30';
  ctx.fillRect(px + 1, py - TILE + 4, TILE - 2, TILE * 2 - 4);
  ctx.fillStyle = '#3a2a4a';
  ctx.fillRect(px + 4, py - TILE + 7, TILE - 8, TILE * 2 - 10);

  // swirling portal core
  ctx.fillStyle = `rgba(30,10,50,0.9)`;
  ctx.beginPath();
  ctx.ellipse(cx, py + TILE - 12, 10, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    const a = t * 1.6 + i * (Math.PI * 2 / 3);
    ctx.fillStyle = i % 2 === 0 ? '#c8a0ff' : '#7a4fd0';
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * 4, py + TILE - 12 + Math.sin(a) * 9, 3, 6, a, 0, Math.PI * 2);
    ctx.fill();
  }

  // "?" marking it as not-yet-a-real-door
  ctx.fillStyle = '#f4ecd8';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('?', cx, py - TILE + 22);
  ctx.restore();
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

// Green Door Studio's keeper table, styled after the reference photo: a
// deep red velvet cloth draped over a plain wood table, a small caddy of
// art supplies sitting on top, and a stack of records leaned against the
// base.
function drawArtTable(px, py, tx, cypherVibe) {
  // wood legs, same footprint as the classic table
  ctx.fillStyle = '#2a1c10';
  ctx.fillRect(px, py + 5, TILE, TILE - 5);
  ctx.fillStyle = '#5a3d22';
  ctx.fillRect(px + 1, py + 6, TILE - 2, TILE - 7);

  // red velvet drape over the top, hanging past the table edge a touch
  ctx.fillStyle = '#7a1a22';
  ctx.fillRect(px - 1, py, TILE + 2, 12);
  ctx.fillStyle = '#921f2a';
  ctx.fillRect(px - 1, py, TILE + 2, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(px - 1, py, TILE + 2, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let fx = 3; fx < TILE; fx += 6) ctx.fillRect(px + fx, py, 1, 12); // cloth folds

  // alternating studio props sitting on the cloth — a third, cypher-night
  // prop (empties + a smoking ashtray) joins the rotation when the shop
  // has cypherVibe set
  const propCount = cypherVibe ? 3 : 2;
  const propIdx = tx % propCount;
  if (propIdx === 0) {
    // caddy box of art supplies (brushes + pencils poking out)
    ctx.fillStyle = '#3a2c1c';
    ctx.fillRect(px + 10, py - 8, 12, 9);
    ctx.fillStyle = '#5a4530';
    ctx.fillRect(px + 11, py - 7, 10, 7);
    const toolColors = ['#c04030', '#3a7ab0', '#e0b030', '#4a8a4a'];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = toolColors[i];
      ctx.fillRect(px + 12 + i * 2, py - 14, 1, 7);
    }
  } else if (propIdx === 1) {
    // wooden palette with dabs of paint
    ctx.fillStyle = '#a87c48';
    ctx.beginPath();
    ctx.ellipse(px + 21, py - 3, 7, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e0b030';
    ctx.beginPath(); ctx.arc(px + 18, py - 4, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c04030';
    ctx.beginPath(); ctx.arc(px + 22, py - 2, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a7ab0';
    ctx.beginPath(); ctx.arc(px + 24, py - 5, 1.4, 0, Math.PI * 2); ctx.fill();
  } else {
    // a couple of empty bottles and a full ashtray, left over from the
    // last cypher session
    ctx.fillStyle = 'rgba(80,140,90,0.85)';
    ctx.fillRect(px + 9, py - 13, 5, 14);
    ctx.fillRect(px + 10, py - 16, 3, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(px + 9, py - 11, 1, 8);
    ctx.fillStyle = 'rgba(150,110,60,0.85)';
    ctx.fillRect(px + 16, py - 10, 4, 11);
    ctx.fillRect(px + 17, py - 12, 2, 3);
    // ashtray with a couple of lit cigarettes resting on the rim
    ctx.fillStyle = '#8a8880';
    ctx.beginPath(); ctx.ellipse(px + 25, py - 3, 5.5, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5a5852';
    ctx.beginPath(); ctx.ellipse(px + 25, py - 3, 3.5, 1.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e8e4dc';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px + 23, py - 4); ctx.lineTo(px + 20, py - 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px + 27, py - 4); ctx.lineTo(px + 30, py - 7); ctx.stroke();
    ctx.fillStyle = '#c04030';
    ctx.fillRect(px + 19.5, py - 6.5, 1.4, 1.4);
  }

  // stack of records leaned against the base of the table
  const recColors = ['#c04030', '#3a7ab0', '#e0b030'];
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = shadeColor(recColors[i % recColors.length], -10);
    ctx.fillRect(px + 3, py + TILE - 10 + i * 3, TILE - 7, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.arc(px + 3 + (TILE - 7) / 2, py + TILE - 8.5 + i * 3, 1, 0, Math.PI * 2); ctx.fill();
  }
}

// A small framed painting hung on a wall tile — bold blocky "abstract art"
// built from a base color plus a couple of contrasting accent shapes, so
// each one reads as distinct art rather than a repeated decal.
function drawWallPainting(px, py, palette) {
  ctx.fillStyle = '#1c1a20';
  ctx.fillRect(px + 4, py + 2, TILE - 8, 20);
  ctx.fillStyle = palette.base;
  ctx.fillRect(px + 6, py + 4, TILE - 12, 16);
  ctx.fillStyle = palette.a;
  ctx.fillRect(px + 7, py + 5, 7, 6);
  ctx.fillStyle = palette.b;
  ctx.beginPath();
  ctx.arc(px + TILE - 12, py + 14, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(px + 6, py + 4, TILE - 12, 2);
}

// One swatch of the big abstract mural covering the back wall — colorful,
// loose, spray-paint style shapes rather than a tidy picture frame.
function drawMuralSwatch(px, py, tx) {
  const palettes = [
    ['#c0403a', '#e0b030'], ['#3a7ab0', '#4a8a4a'], ['#8a4ab0', '#e0603a'],
  ];
  const [c1, c2] = palettes[tx % palettes.length];
  ctx.fillStyle = c1;
  ctx.beginPath();
  ctx.arc(px + 10, py + 16, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c2;
  ctx.beginPath();
  ctx.arc(px + TILE - 10, py + 20, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px + 2, py + 28);
  ctx.lineTo(px + TILE - 2, py + 6);
  ctx.stroke();
}

// Wild-style interior graffiti, one wall tile at a time. Each tile gets a
// jagged interlocking spray-paint block, a contrasting spike/arrow accent,
// a hard black keyline, a couple of drips, and a spray-can highlight dot —
// varied per-tile via hash2 so a whole wall run reads as one chaotic,
// hand-painted piece rather than a repeating decal. Framed paintings and
// the back mural are drawn on top of this, like gallery pieces hung over
// a painted wall.
function drawWildStyleGraffiti(px, py, tx, ty) {
  const h = hash2(tx, ty);
  const palettes = [
    ['#e0303a', '#f0a830'], ['#3a7ab0', '#e8e0d0'], ['#8a4ab0', '#4ecb6e'],
    ['#f0d030', '#e0603a'], ['#2ecfcf', '#c93aa0'], ['#4ecb6e', '#e0303a'],
  ];
  const [c1, c2] = palettes[h % palettes.length];
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, TILE, TILE - 2);
  ctx.clip();

  // big jagged block, angled differently per tile
  const jitter = h % 9;
  ctx.fillStyle = c1;
  ctx.beginPath();
  ctx.moveTo(px - 2, py + 6 + jitter);
  ctx.lineTo(px + 12 + (h % 6), py - 2);
  ctx.lineTo(px + TILE - 6, py + 4 + (h % 5));
  ctx.lineTo(px + TILE + 2, py + 14 - jitter);
  ctx.lineTo(px + TILE - 4, py + TILE - 4);
  ctx.lineTo(px + 6 - (h % 4), py + TILE + 2);
  ctx.lineTo(px - 2, py + TILE - 10);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(10,8,6,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // contrasting spike/arrow accent, position varies with hash
  ctx.fillStyle = c2;
  ctx.beginPath();
  if (h % 2 === 0) {
    ctx.moveTo(px + 4, py + TILE - 6);
    ctx.lineTo(px + 16, py + 10);
    ctx.lineTo(px + 22, py + TILE - 10);
  } else {
    ctx.moveTo(px + TILE - 4, py + 6);
    ctx.lineTo(px + 14, py + 16);
    ctx.lineTo(px + TILE - 8, py + TILE - 6);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(10,8,6,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // drips running down from the block
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 2; i++) {
    const dx = px + 6 + ((h * (i + 3)) % (TILE - 10));
    const dripLen = 4 + ((h * (i + 1)) % 7);
    ctx.beginPath();
    ctx.moveTo(dx, py + 18 + i * 3);
    ctx.lineTo(dx, py + 18 + i * 3 + dripLen);
    ctx.stroke();
  }

  // spray-can highlight fleck
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.arc(px + 8 + (h % 14), py + 8 + (h % 9), 1.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// A small couch cushion segment, meant to be placed a few tiles in a row
// against a wall so it reads as one loveseat/couch.
function drawCouch(px, py, withPillow) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(px + 2, py + TILE - 6, TILE - 4, 4);
  // wooden feet
  ctx.fillStyle = '#3a2818';
  ctx.fillRect(px + 4, py + TILE - 5, 3, 4);
  ctx.fillRect(px + TILE - 7, py + TILE - 5, 3, 4);
  // backrest along the wall side
  ctx.fillStyle = '#7a3a3a';
  ctx.fillRect(px + 2, py + 4, TILE - 4, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(px + 2, py + 4, TILE - 4, 2);
  // seat cushion
  ctx.fillStyle = '#9a5050';
  ctx.fillRect(px + 2, py + 13, TILE - 4, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(px + 2, py + 13, TILE - 4, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(px + TILE / 2 - 1, py + 13, 2, 12);
  // armrests
  ctx.fillStyle = '#6a3232';
  ctx.fillRect(px + 1, py + 6, 4, 19);
  ctx.fillRect(px + TILE - 5, py + 6, 4, 19);
  if (withPillow) {
    ctx.fillStyle = '#e8e4dc';
    ctx.fillRect(px + 9, py + 15, 14, 12);
    ctx.strokeStyle = '#8a8478';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 9, py + 15, 14, 12);
    ctx.fillStyle = '#3a3a3e';
    ctx.beginPath(); ctx.arc(px + 13, py + 19, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(px + 19, py + 23, 1.6, 0, Math.PI * 2); ctx.fill();
  }
}

// The mustard-gold armchair from the reference photo, with a small
// checkered throw draped over its back.
function drawArmchair(px, py) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(px + 3, py + TILE - 5, TILE - 6, 4);
  ctx.fillStyle = '#3a2818';
  ctx.fillRect(px + 5, py + TILE - 4, 3, 4);
  ctx.fillRect(px + TILE - 8, py + TILE - 4, 3, 4);
  // body
  ctx.fillStyle = '#c8962e';
  ctx.fillRect(px + 4, py + 8, TILE - 8, TILE - 12);
  ctx.fillStyle = shadeColor('#c8962e', -20);
  ctx.fillRect(px + 4, py + 8, 5, TILE - 12);
  ctx.fillStyle = shadeColor('#c8962e', 25);
  ctx.fillRect(px + TILE - 9, py + 8, 4, 8);
  // rolled arms
  ctx.fillStyle = '#b3822a';
  ctx.fillRect(px + 2, py + 12, 5, 14);
  ctx.fillRect(px + TILE - 7, py + 12, 5, 14);
  // checkered throw over the back
  ctx.fillStyle = '#2a2a30';
  ctx.fillRect(px + 6, py + 3, TILE - 12, 8);
  for (let cy = 0; cy < 2; cy++) {
    for (let cx = 0; cx < 3; cx++) {
      if ((cx + cy) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(px + 6 + cx * ((TILE - 12) / 3), py + 3 + cy * 4, (TILE - 12) / 3, 4);
      }
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

// A standalone mic stand, left set up in the middle of the floor from the
// last freestyle cypher — round weighted base, telescoping pole, boom arm,
// and a mic head with a foam windscreen.
function drawMicStand(px, py) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(px + 16, py + TILE - 5, 10, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // tripod base legs
  ctx.strokeStyle = '#2a2a2e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px + 16, py + TILE - 8);
  ctx.lineTo(px + 7, py + TILE - 3);
  ctx.moveTo(px + 16, py + TILE - 8);
  ctx.lineTo(px + 25, py + TILE - 3);
  ctx.moveTo(px + 16, py + TILE - 8);
  ctx.lineTo(px + 16, py + TILE - 2);
  ctx.stroke();
  // pole
  ctx.strokeStyle = '#3a3a3e';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(px + 16, py + TILE - 8);
  ctx.lineTo(px + 16, py + 4);
  ctx.stroke();
  // boom arm angled up
  ctx.beginPath();
  ctx.moveTo(px + 16, py + 8);
  ctx.lineTo(px + 24, py + 2);
  ctx.stroke();
  // mic body + windscreen
  ctx.fillStyle = '#1c1c20';
  ctx.fillRect(px + 22, py - 1, 3, 6);
  ctx.fillStyle = '#8a8a92';
  ctx.beginPath();
  ctx.arc(px + 25, py - 1, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.arc(px + 24, py - 2.5, 1, 0, Math.PI * 2);
  ctx.fill();
}

// One randomly-picked piece of hip hop gear per tile — boombox, snapback,
// crossed spray cans, a kicked-off sneaker, or an empty bottle with a
// smoldering ashtray — so a handful of these scattered around the floor
// each read as distinct clutter rather than a repeated prop.
function drawHipHopGear(px, py, tx, ty) {
  const h = hash2(tx, ty);
  const kind = h % 5;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(px + 16, py + TILE - 6, 10, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  if (kind === 0) {
    // boombox
    ctx.fillStyle = '#242226';
    ctx.fillRect(px + 6, py + 12, 20, 12);
    ctx.fillStyle = '#3a373e';
    ctx.beginPath(); ctx.arc(px + 11, py + 18, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(px + 21, py + 18, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a8890';
    ctx.beginPath(); ctx.arc(px + 11, py + 18, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(px + 21, py + 18, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e0b030';
    ctx.fillRect(px + 14, py + 9, 4, 4);
    ctx.strokeStyle = '#5a5760';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px + 16, py + 9, 9, Math.PI, 0); ctx.stroke();
  } else if (kind === 1) {
    // snapback cap, brim down
    ctx.fillStyle = '#1f6a4a';
    ctx.beginPath();
    ctx.ellipse(px + 16, py + 20, 10, 5, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#28855e';
    ctx.beginPath();
    ctx.arc(px + 16, py + 17, 8, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#e8e4dc';
    ctx.beginPath(); ctx.arc(px + 16, py + 14, 2, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 2) {
    // crossed spray cans
    drawSprayCan(px + 8, py + 8, '#c0403a');
    drawSprayCan(px + 18, py + 6, '#3a7ab0');
  } else if (kind === 3) {
    // kicked-off sneaker
    ctx.fillStyle = '#e8e4dc';
    ctx.beginPath();
    ctx.moveTo(px + 6, py + 22);
    ctx.quadraticCurveTo(px + 8, py + 12, px + 18, py + 12);
    ctx.quadraticCurveTo(px + 26, py + 13, px + 26, py + 19);
    ctx.quadraticCurveTo(px + 26, py + 23, px + 20, py + 23);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c0403a';
    ctx.fillRect(px + 6, py + 21, 20, 3);
    ctx.strokeStyle = '#b8b2a4';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(px + 12 + i * 3, py + 14);
      ctx.lineTo(px + 10 + i * 3, py + 19);
      ctx.stroke();
    }
  } else {
    // empty bottle + tipped ashtray with a couple of cigarettes
    ctx.fillStyle = 'rgba(80,140,90,0.85)';
    ctx.fillRect(px + 7, py + 8, 5, 14);
    ctx.fillRect(px + 8, py + 5, 3, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(px + 7, py + 10, 1, 8);
    ctx.fillStyle = '#8a8880';
    ctx.beginPath();
    ctx.ellipse(px + 21, py + 20, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6a6862';
    ctx.beginPath();
    ctx.ellipse(px + 21, py + 20, 3.5, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e8e4dc';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px + 19, py + 19); ctx.lineTo(px + 15, py + 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px + 22, py + 18); ctx.lineTo(px + 26, py + 14); ctx.stroke();
    ctx.fillStyle = '#c04030';
    ctx.fillRect(px + 14, py + 15, 1.5, 1.5);
    ctx.strokeStyle = 'rgba(180,180,180,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px + 26, py + 14); ctx.lineTo(px + 27, py + 11); ctx.stroke();
  }
}

// Candy-stripe "big top" tent wall — a translucent vertical stripe laid over
// the base wall fill, alternating by column so it reads as continuous
// diagonal-free candy-cane striping across the whole room.
function drawBigTopStripe(px, py, tx) {
  const stripeColors = ['#ff3b5c', '#fff6f0'];
  ctx.fillStyle = stripeColors[tx % 2];
  ctx.globalAlpha = 0.5;
  ctx.fillRect(px, py, TILE, TILE - 2);
  ctx.globalAlpha = 1;
}

// A couple of small triangle pennant flags strung along the bottom lip of
// the top wall row — kept inside the tile's own bounds so it never gets
// clipped by the floor row drawn just after it.
function drawBunting(px, py, tx) {
  const colors = ['#ff5fa2', '#5fd0ff', '#ffe14d', '#8cff5f', '#c85fff'];
  const c1 = colors[tx % colors.length];
  const c2 = colors[(tx + 2) % colors.length];
  ctx.fillStyle = c1;
  ctx.beginPath();
  ctx.moveTo(px + 3, py + 16); ctx.lineTo(px + 13, py + 16); ctx.lineTo(px + 8, py + 29);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = c2;
  ctx.beginPath();
  ctx.moveTo(px + 18, py + 16); ctx.lineTo(px + 28, py + 16); ctx.lineTo(px + 23, py + 29);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(px, py + 16); ctx.lineTo(px + TILE, py + 16); ctx.stroke();
}

// Oversized fairground floor props — giant lollipop, candy cane, or popcorn
// bucket — solid fixtures scattered around a carnival-themed room.
function drawCarnivalProp(px, py, tx, ty) {
  const variant = hash2(tx, ty) % 3;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(px + 16, py + 28, 10, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  if (variant === 0) {
    // giant swirl lollipop
    ctx.strokeStyle = '#f4ecd8';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(px + 16, py + 30); ctx.lineTo(px + 16, py + 15); ctx.stroke();
    ctx.fillStyle = '#ff5fa2';
    ctx.beginPath(); ctx.arc(px + 16, py + 8, 11, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5fd0ff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px + 16, py + 8, 7, 0.6, Math.PI * 1.6); ctx.stroke();
    ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(px + 16, py + 8, 4, 1.2, Math.PI * 2.2); ctx.stroke();
  } else if (variant === 1) {
    // candy cane
    ctx.strokeStyle = '#fff6f0'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px + 14, py + 30); ctx.lineTo(px + 14, py + 13);
    ctx.arc(px + 18, py + 13, 4, Math.PI, 0);
    ctx.lineTo(px + 22, py + 17);
    ctx.stroke();
    ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(px + 11, py + 27 - i * 5);
      ctx.lineTo(px + 17, py + 24 - i * 5);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  } else {
    // popcorn bucket
    ctx.fillStyle = '#ff3b5c';
    ctx.fillRect(px + 8, py + 16, 16, 14);
    ctx.fillStyle = '#fff6f0';
    ctx.fillRect(px + 8, py + 16, 4, 14);
    ctx.fillRect(px + 16, py + 16, 4, 14);
    ctx.fillRect(px + 24, py + 16, 4, 14);
    ctx.fillStyle = '#ffe9c8';
    for (let i = 0; i < 6; i++) {
      const kx = px + 9 + (i * 4) % 18, ky = py + 9 + ((i * 7) % 8);
      ctx.beginPath(); ctx.arc(kx, ky, 3, 0, Math.PI * 2); ctx.fill();
    }
  }
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
    const isHenrys = b.name === "Henry's Diner";
    const isComedyClub = b.name === 'VT COMEDY CLUB';
    const isDeli = b.name === 'Kountry Kart Deli';

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

    if (!isDeli) {
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
    } else if (isDeli) {
      // No separate wood door here — the deli's whole front is one glass
      // storefront, entry included, drawn by drawDeliDecor() below.
    } else if (isHeyBud) {
      // red-framed glass door, matching the reference storefront's red door
      const doorXi = dx + 4, doorY = py + h - TILE + 2, doorW = TILE - 8, doorH = TILE - 2;
      ctx.fillStyle = '#1c140f';
      ctx.fillRect(doorXi - 2, doorY - 3, doorW + 4, doorH + 3);
      ctx.fillStyle = '#a8281f';
      ctx.fillRect(doorXi, doorY, doorW, doorH);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';                  // shadowed half
      ctx.fillRect(doorXi, doorY, doorW / 2, doorH);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';             // lit half
      ctx.fillRect(doorXi + doorW / 2, doorY, doorW / 2 - 1, doorH);
      ctx.fillStyle = 'rgba(20,18,22,0.55)';               // dark glass insert
      ctx.fillRect(doorXi + 3, doorY + 4, doorW - 6, doorH * 0.6);
      ctx.fillStyle = '#e0c060';
      ctx.fillRect(dx + TILE - 12, py + h - 16, 3, 3);
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
    if (isDeli) drawDeliDecor(px, py, w, h, dx);
    if (isNectars) {
      drawNectarsDecor(px, py, w, h);
      drawWallPoster(px, py, w, h);
    }
    if (isJuniors) drawJuniorsDecor(px, py, w, h);
    if (isHenrys) drawHenrysDecor(px, py, w, h);
    if (isComedyClub) drawComedyClubDecor(px, py, w, h);
    // "3rd Thursdays" flyer on the outside wall of Pure Pop Records
    if (isThrift) drawThursPoster(px + 6, py + 40);

    // Draw building name sign (skip for Nectar's - uses neon sign instead).
    // High-contrast dark plate + bright bold lettering, auto-sized to the
    // name so it always fits cleanly and never overlaps or crowds.
    if (isComedyClub) {
      // The building is only 2 tiles wide, so a single-line plate for "VT
      // COMEDY CLUB" would have to grow wide enough to creep into Junior's
      // sign next door. Wrap onto two lines and grow the plate DOWN instead
      // of sideways so it stays clear of the neighbors.
      const lines = ['VT COMEDY', 'CLUB'];
      const maxTextW = w + 26;
      let fsize = 13;
      ctx.font = 'bold ' + fsize + 'px monospace';
      let lineW = Math.max(...lines.map((l) => ctx.measureText(l).width));
      while (fsize > 9 && lineW > maxTextW) {
        fsize--;
        ctx.font = 'bold ' + fsize + 'px monospace';
        lineW = Math.max(...lines.map((l) => ctx.measureText(l).width));
      }
      const lineH = fsize + 4;
      const sw = lineW + 14, sh = lineH * lines.length + 8;
      const sx = px + (w - sw) / 2, sy = py + 3;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(sx + 2, sy + 3, sw, sh);
      ctx.fillStyle = '#120e0a';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.fillStyle = b.roof || '#e0b040';
      ctx.fillRect(sx, sy + sh - 3, sw, 3);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f9f2e0';
      lines.forEach((line, i) => {
        ctx.fillText(line, px + w / 2, sy + lineH * (i + 1) - 3);
      });
    } else if (!isNectars) {
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
      if (isHenrys) {
        // glowing red neon-tube look: a soft outer glow under a brighter
        // pink-white core, so the lettering reads like a lit neon sign
        // against the dark plate instead of flat printed text.
        //
        // This used to use ctx.shadowBlur, which is drawn every outdoor
        // frame (this building's sign is on screen constantly while
        // outside) and is one of the most expensive things you can ask
        // Canvas2D to do per-pixel — on slower/mobile GPUs it can eat
        // several ms every frame, all on the same main thread the music
        // scheduler needs. A handful of cheap offset fillText passes gives
        // a near-identical glow for a fraction of the cost.
        const tx2 = px + w / 2, ty2 = sy + sh / 2 + fsize * 0.36;
        ctx.save();
        ctx.fillStyle = 'rgba(255,42,60,0.35)';
        for (const [ox, oy] of NEON_GLOW_OFFSETS) ctx.fillText(b.name, tx2 + ox, ty2 + oy);
        ctx.fillStyle = '#ff2a3c';
        ctx.fillText(b.name, tx2, ty2);
        ctx.fillStyle = '#ffc4cb';
        ctx.fillText(b.name, tx2, ty2);
        ctx.restore();
      } else {
        ctx.fillStyle = '#f9f2e0';
        ctx.fillText(b.name, px + w / 2, sy + sh / 2 + fsize * 0.36);
      }
    }
  }
}

// Cheap stand-in for shadowBlur's glow on Henry's neon sign — see the call
// site for why. A small fixed ring of offsets drawn at low opacity.
const NEON_GLOW_OFFSETS = [
  [-2, 0], [2, 0], [0, -2], [0, 2], [-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5],
];

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

  // Wavy teal / white / orange mural band across the top of the wall —
  // echoes the real storefront's abstract paint job wrapping the top edge.
  const muralY = py + 46, muralH = 20;
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, muralY, w, muralH);
  ctx.clip();
  ctx.fillStyle = '#2f8fa8';
  ctx.fillRect(px, muralY, w, muralH);
  const blobs = [
    [8, 6, 14], [30, 12, 10], [52, 4, 16], [76, 14, 9],
    [98, 6, 15], [122, 13, 10], [146, 4, 14], [170, 13, 9],
    [194, 6, 15], [214, 12, 10],
  ];
  blobs.forEach(([bx, by, r], i) => {
    ctx.fillStyle = i % 2 === 0 ? '#eef1ea' : '#dd6a38';
    ctx.beginPath();
    ctx.ellipse(px + bx, muralY + by, r, r * 0.55, 0.35, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  // red corrugated kickplate band along the base, under the windows/door —
  // matches the real building's red ribbed metal skirt
  const bandY = py + h - 14;
  ctx.fillStyle = '#a8281f';
  ctx.fillRect(px, bandY, w, 14);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let x = 0; x < w; x += 8) ctx.fillRect(px + x, bandY, 4, 14);

  drawPlantPot(px + 8, py + h - 14);
  drawPlantPot(px + w - 20, py + h - 14);

  ctx.restore();
}

// Kountry Kart Deli: replaces the standard punch-windows + door with one
// continuous floor-to-ceiling glass storefront across the whole front wall,
// door included — styled after the real shop's black-and-red storefront,
// with hand-painted Vermont farm murals over the two side windows.
function drawDeliDecor(px, py, w, h, doorPx) {
  ctx.save();

  const top = py + 40;       // just below the roof/eave trim
  const bottom = py + h - 4; // just above the foundation shading
  const left = px + 4, right = px + w - 4;
  const glassH = bottom - top;

  const BLACK = '#141210', RED = '#a8281f', RED_DK = '#7c1a14';
  const CREAM = '#f4ecd8';

  // black recess behind the glazing so the panes read as inset
  ctx.fillStyle = BLACK;
  ctx.fillRect(left - 2, top - 2, (right - left) + 4, glassH + 4);

  const doorW = TILE - 10, doorL = doorPx + 5;
  const leftX = left, leftW = doorL - 4 - left;
  const rightX = doorL + doorW + 4, rightW = right - rightX;

  // -- hand-painted farm mural over one side window: green rolling hills
  // under a pale sky, a scatter of round hay bales
  function drawHillMural(bx, bw, by, bh) {
    ctx.save();
    ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
    ctx.fillStyle = '#bfe0ea';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#3f8f4a';
    ctx.beginPath();
    ctx.moveTo(bx, by + bh);
    ctx.lineTo(bx, by + bh * 0.6);
    for (let i = 0; i <= bw; i += 6) {
      ctx.lineTo(bx + i, by + bh * 0.55 - 5 * Math.sin(i / 9));
    }
    ctx.lineTo(bx + bw, by + bh);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7a5a2c';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(bx + bw * (0.25 + i * 0.28), by + bh * 0.8, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // -- hand-painted farm mural: red barn with a white roofline, on a
  // green field
  function drawBarnMural(bx, bw, by, bh) {
    ctx.save();
    ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
    ctx.fillStyle = '#bfe0ea';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#3f8f4a';
    ctx.fillRect(bx, by + bh * 0.62, bw, bh * 0.4);
    const bcx = bx + bw * 0.5;
    ctx.fillStyle = RED;
    ctx.fillRect(bcx - bw * 0.26, by + bh * 0.4, bw * 0.52, bh * 0.3);
    ctx.beginPath();
    ctx.moveTo(bcx - bw * 0.3, by + bh * 0.4);
    ctx.lineTo(bcx, by + bh * 0.2);
    ctx.lineTo(bcx + bw * 0.3, by + bh * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = CREAM;
    ctx.fillRect(bcx - 2, by + bh * 0.42, 4, bh * 0.14);
    ctx.restore();
  }

  const muralTop = top, muralH = 30;
  drawHillMural(leftX, leftW, muralTop, muralH);
  drawBarnMural(rightX, rightW, muralTop, muralH);

  // -- text pane below the mural: cream panel with red hand-lettering,
  // like the shop's painted window signage
  const textTop = muralTop + muralH, textH = 26;
  ctx.fillStyle = CREAM;
  ctx.fillRect(leftX, textTop, leftW, textH);
  ctx.fillRect(rightX, textTop, rightW, textH);

  ctx.fillStyle = RED;
  ctx.textAlign = 'center';
  ctx.font = 'italic bold 8px Georgia, serif';
  ctx.fillText('Kountry Kart', leftX + leftW / 2, textTop + 12);
  ctx.font = 'italic bold 7px Georgia, serif';
  ctx.fillText('Deli', leftX + leftW / 2, textTop + 21);

  ctx.font = 'bold 5px monospace';
  ctx.fillText('SUBS \u00b7 WRAPS', rightX + rightW / 2, textTop + 10);
  ctx.fillText('GYROS \u00b7 SALADS', rightX + rightW / 2, textTop + 18);
  ctx.font = '5px monospace';
  ctx.fillText('BEVERAGES', rightX + rightW / 2, textTop + 25);

  // -- lower glass: dim interior glow, cool blue-tinted glass over both
  // side windows, running down to the kickplate
  const interiorTop = textTop + textH, interiorH = bottom - 16 - interiorTop;
  [[leftX, leftW], [rightX, rightW]].forEach(([bx, bw]) => {
    const grad = ctx.createLinearGradient(0, interiorTop, 0, interiorTop + interiorH);
    grad.addColorStop(0, 'rgba(214,236,244,0.5)');
    grad.addColorStop(1, 'rgba(110,150,175,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(bx, interiorTop, bw, interiorH);
  });

  // -- red pillars framing each window bay and the door, echoing the
  // real storefront's red-painted structural columns
  ctx.fillStyle = RED;
  [left - 2, leftX + leftW, doorL + doorW + 1, right - 1].forEach((cxp) => {
    ctx.fillRect(cxp, top, 4, glassH);
  });
  ctx.fillStyle = RED_DK;
  [left - 2, leftX + leftW, doorL + doorW + 1, right - 1].forEach((cxp) => {
    ctx.fillRect(cxp, top, 4, 4);
  });

  // -- glass entry door: black frame, dark glass, small round push plate,
  // "OPEN 24 HRS" placard above it
  ctx.fillStyle = 'rgba(50,60,64,0.55)';
  ctx.fillRect(doorL, top, doorW, glassH);
  ctx.strokeStyle = BLACK;
  ctx.lineWidth = 2;
  ctx.strokeRect(doorL, top, doorW, glassH);
  ctx.fillStyle = CREAM;
  ctx.fillRect(doorL + 2, top + glassH * 0.32, doorW - 4, 9);
  ctx.fillStyle = RED;
  ctx.font = 'bold 5px monospace';
  ctx.fillText('OPEN', doorL + doorW / 2, top + glassH * 0.32 + 7);
  ctx.fillStyle = '#cfd8da';
  ctx.fillRect(doorL + doorW - 7, top + glassH * 0.6, 3, glassH * 0.24);

  // -- black-and-white striped kickplate along the very bottom, matching
  // the real storefront's painted base band
  const kickTop = bottom - 16;
  ctx.fillStyle = BLACK;
  ctx.fillRect(left, kickTop, right - left, 16);
  ctx.save();
  ctx.beginPath(); ctx.rect(left, kickTop, right - left, 16); ctx.clip();
  ctx.strokeStyle = CREAM;
  ctx.lineWidth = 2;
  for (let sx = left - 16; sx < right + 16; sx += 10) {
    ctx.beginPath();
    ctx.moveTo(sx, kickTop + 16);
    ctx.lineTo(sx + 16, kickTop);
    ctx.stroke();
  }
  ctx.restore();

  // small red call button near the door, low on the kickplate
  ctx.fillStyle = RED;
  ctx.beginPath(); ctx.arc(doorL + doorW + 8, kickTop + 8, 3, 0, Math.PI * 2); ctx.fill();

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
  drawJazzFestBanner(time);
  drawStadium();
  drawIceCreamVan();
  drawNewsstands();
}

// Little curbside newspaper boxes scattered around town. Purely a sprite;
// the interact logic lives in facingTarget()/doInteract() keyed off
// map.newsstands, matched by tile coordinate exactly like the NPCs are.
function drawNewsstand(px, py) {
  const W = 26, H = 30;
  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(px + 1, py + H - 5, W - 2, 5);
  // metal box body
  ctx.fillStyle = '#2c5a8a';
  ctx.fillRect(px, py + 10, W, H - 10);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(px, py + H - 12, W, 3);
  // front window showing the paper stack
  ctx.fillStyle = '#dcd6c4';
  ctx.fillRect(px + 3, py + 15, W - 6, 10);
  ctx.strokeStyle = '#16324e';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 3.5, py + 15.5, W - 7, 9);
  ctx.fillStyle = '#9a9284';
  ctx.fillRect(px + 4, py + 17, W - 8, 1.5);
  ctx.fillRect(px + 4, py + 20, W - 8, 1.5);
  // coin slot
  ctx.fillStyle = '#16324e';
  ctx.fillRect(px + W / 2 - 4, py + 27, 8, 2);
  // slanted headline sign on top
  ctx.fillStyle = '#e8e2cf';
  ctx.beginPath();
  ctx.moveTo(px - 2, py + 10);
  ctx.lineTo(px + W + 2, py + 10);
  ctx.lineTo(px + W - 3, py);
  ctx.lineTo(px + 3, py);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#16324e';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#16324e';
  ctx.font = 'bold 6px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('NEWS', px + W / 2, py + 7);
}

function drawNewsstands() {
  const map = maps[player.map];
  if (!map || !map.newsstands) return;
  for (const ns of map.newsstands) {
    drawNewsstand(ns.tx * TILE + 3, ns.ty * TILE);
  }
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
  // Positioned so its front steps sit right at the Main Street crossroads
  // (the vertical road meets the horizontal road here), so the road leads
  // straight up to the church door.
  // Styled after a New England red-brick meetinghouse: brick facade, a
  // tall white tiered steeple (louvered belfry + open colonnade + lantern),
  // a weathered green conical spire with weathervane, a tower clock, an
  // arched window, and a white pedimented entrance porch.
  const px = 18 * TILE, py = 6 * TILE;
  const w = 3 * TILE, h = 3 * TILE;
  const cx = px + w / 2;

  const BRICK = '#a8442c', BRICK_DK = '#8a3620';
  const WHITE = '#f4efe3', WHITE_DK = '#d3c9b8';
  const SPIRE = '#55836c', SPIRE_DK = '#3f6353';
  const GLASS = '#37456a';

  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(px - 4, py + h - 8, w + 8, 12);

  // brick body
  ctx.fillStyle = BRICK;
  ctx.fillRect(px, py + 13, w, h - 13);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(px, py + h - 8, w, 8);
  // subtle brick coursing
  ctx.fillStyle = BRICK_DK;
  for (let ly = py + 20; ly < py + h - 6; ly += 8) ctx.fillRect(px, ly, w, 1);
  // white corner pilasters
  ctx.fillStyle = WHITE;
  ctx.fillRect(px, py + 13, 5, h - 13);
  ctx.fillRect(px + w - 5, py + 13, 5, h - 13);

  // white cornice band under the tower
  ctx.fillStyle = WHITE;
  ctx.fillRect(px, py + 8, w, 6);
  ctx.fillStyle = WHITE_DK;
  ctx.fillRect(px, py + 13, w, 2);

  // === steeple ===
  // louvered belfry tier (widest, sits on the cornice)
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 12, py - 6, 24, 14);
  ctx.fillStyle = BRICK_DK;
  ctx.fillRect(cx - 8, py - 3, 3, 9);
  ctx.fillRect(cx - 1, py - 3, 3, 9);
  ctx.fillRect(cx + 6, py - 3, 3, 9);
  // ledge
  ctx.fillStyle = WHITE_DK;
  ctx.fillRect(cx - 13, py - 8, 26, 3);

  // open colonnade tier (narrower, columns visible)
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 9, py - 20, 18, 12);
  ctx.fillStyle = '#8a97a8';
  ctx.fillRect(cx - 7, py - 18, 2, 9);
  ctx.fillRect(cx - 1, py - 18, 2, 9);
  ctx.fillRect(cx + 5, py - 18, 2, 9);
  // ledge
  ctx.fillStyle = WHITE_DK;
  ctx.fillRect(cx - 10, py - 22, 20, 3);

  // small octagonal lantern drum
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 6, py - 31, 12, 10);
  ctx.fillStyle = GLASS;
  ctx.fillRect(cx - 2, py - 28, 4, 6);

  // conical spire (weathered green)
  ctx.fillStyle = SPIRE;
  ctx.beginPath();
  ctx.moveTo(cx, py - 48);
  ctx.lineTo(cx - 8, py - 31);
  ctx.lineTo(cx + 8, py - 31);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = SPIRE_DK;
  ctx.beginPath();
  ctx.moveTo(cx, py - 48);
  ctx.lineTo(cx, py - 31);
  ctx.lineTo(cx + 8, py - 31);
  ctx.closePath();
  ctx.fill();

  // finial + weathervane
  ctx.strokeStyle = '#2a2420';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx, py - 48); ctx.lineTo(cx, py - 55); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 3, py - 53); ctx.lineTo(cx + 4, py - 53); ctx.stroke();

  // tower clock
  ctx.fillStyle = WHITE;
  ctx.beginPath(); ctx.arc(cx, py + 30, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a2420';
  ctx.beginPath(); ctx.arc(cx, py + 30, 8, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx, py + 30); ctx.lineTo(cx, py + 25); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, py + 30); ctx.lineTo(cx + 5, py + 32); ctx.stroke();

  // arched window below the clock
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 10, py + 46, 20, 18);
  ctx.beginPath(); ctx.arc(cx, py + 46, 10, Math.PI, 0); ctx.fill();
  ctx.fillStyle = GLASS;
  ctx.fillRect(cx - 7, py + 50, 14, 13);
  ctx.beginPath(); ctx.arc(cx, py + 50, 7, Math.PI, 0); ctx.fill();

  // entrance porch: pediment + columns + arched door
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.moveTo(cx - 22, py + 74);
  ctx.lineTo(cx, py + 64);
  ctx.lineTo(cx + 22, py + 74);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(cx - 22, py + 74, 44, 4);
  ctx.fillStyle = WHITE_DK;
  ctx.fillRect(cx - 18, py + 78, 4, h - 84);
  ctx.fillRect(cx + 14, py + 78, 4, h - 84);

  ctx.fillStyle = '#5a3d22';
  ctx.fillRect(cx - 11, py + 80, 22, h - 86);
  ctx.beginPath(); ctx.arc(cx, py + 80, 11, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#e0b460';
  ctx.fillRect(cx + 5, py + h - 20, 2, 3);

  // stone steps
  ctx.fillStyle = '#d9d2c2';
  ctx.fillRect(cx - 26, py + h - 4, 52, 6);
}

// Simple rounded-rect path helper (canvas has no built-in one we can rely on
// consistently, so build it from lines + corner arcs). Starts a fresh path;
// caller fills/strokes it.
function roundRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// A small stadium floodlight tower: pole + lamp head, gold-tinted bulbs.
function drawFloodlight(x, y) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x + 5, y + 34, 10, 4);
  ctx.fillStyle = '#3a3a3e';
  ctx.fillRect(x + 7, y + 12, 5, 26);
  ctx.fillStyle = '#1c1c1f';
  ctx.fillRect(x - 2, y, 22, 12);
  ctx.fillStyle = '#e0b030';
  for (let i = 0; i < 4; i++) ctx.fillRect(x + 1 + i * 5, y + 3, 3, 3);
}

// Vermont Green FC soccer stadium — a big decorative outdoor landmark, not
// an enterable building (no door, never added to the `buildings` list so it
// never gets the automatic door/sign treatment other shops get).
//
// Only the top 3/4 of the stadium bowl is drawn here: the shape is built at
// its full height, then clipped to the map's solid footprint so the bottom
// 1/4 is cut off flush with the bottom of the footprint. That's deliberate —
// the remaining 1/4 is meant to reappear in the map area planned for
// directly south of this one, once it's built and the two are connected.
function drawStadium() {
  const TX = 17, TY = 17, TW = 6, TH = 7; // must match STADIUM_* in makeOverworld()
  const px = TX * TILE, py = TY * TILE;
  const w = TW * TILE, hVis = TH * TILE;
  const hFull = hVis / 0.75; // full stadium height if it weren't cut off
  const cx = px + w / 2;

  const GREEN_DK = '#0f3323';
  const GREEN_MD = '#1c4a30';
  const GREEN_LT = '#2c6b45';
  const GOLD     = '#e0b030';
  const PITCH    = '#2d8a3e';
  const PITCH_LN = 'rgba(255,255,255,0.85)';

  ctx.save();
  // Clip to (slightly beyond) the stadium's solid footprint — this is what
  // actually produces the "cut off at 3/4 height" look, since the shape
  // below is drawn at full height and simply never gets to render.
  ctx.beginPath();
  ctx.rect(px - 24, py - 56, w + 48, hVis + 56);
  ctx.clip();

  // floodlight towers, top two corners (the only two that read at this scale)
  drawFloodlight(px - 6, py - 34);
  drawFloodlight(px + w - 16, py - 34);

  // outer wall / facade, rounded corners, full height (bottom gets clipped)
  ctx.fillStyle = GREEN_DK;
  roundRectPath(px - 8, py, w + 16, hFull, 16);
  ctx.fill();

  // facade band across the top with the team name
  ctx.fillStyle = GREEN_MD;
  ctx.fillRect(px - 8, py, w + 16, 42);
  ctx.fillStyle = GOLD;
  ctx.fillRect(px - 8, py + 42, w + 16, 4);

  ctx.textAlign = 'center';
  ctx.fillStyle = GOLD;
  ctx.font = 'bold 13px monospace';
  ctx.fillText('VERMONT GREEN', cx, py + 20);
  ctx.font = 'bold 10px monospace';
  ctx.fillText('\u2605\u2605 CHAMPIONS', cx, py + 34);

  // west & east entrance gaps in the outer wall, at the same map row as the
  // walkable openings carved into the collision grid (STADIUM_OPEN_Y in
  // makeOverworld) so the visual lines up with where the player can walk in.
  const gateY = py + TILE * Math.floor(TH / 2), gateH = TILE;
  ctx.fillStyle = '#3e7c34';
  ctx.fillRect(px - 12, gateY, 26, gateH);       // west gate
  ctx.fillRect(px + w - 14, gateY, 26, gateH);   // east gate

  // inner stand ring, lighter green, with a faint row of seat-dot texture
  ctx.fillStyle = GREEN_LT;
  ctx.fillRect(px + 14, py + 52, w - 28, hFull - 60);
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  for (let ty = py + 60; ty < py + hVis - 6; ty += 8) {
    for (let tx = px + 20; tx < px + w - 16; tx += 7) ctx.fillRect(tx, ty, 3, 3);
  }

  // pitch (soccer field) at the center, with basic line markings
  const fx = px + 34, fy = py + 76, fw = w - 68, fh = hFull - 108;
  ctx.fillStyle = PITCH;
  ctx.fillRect(fx, fy, fw, fh);
  ctx.strokeStyle = PITCH_LN;
  ctx.lineWidth = 2;
  ctx.strokeRect(fx, fy, fw, fh);
  // goal box at the visible (north) end of the pitch
  ctx.strokeRect(fx + fw * 0.28, fy, fw * 0.44, 22);
  // halfway line + center circle, roughly at the pitch's midpoint
  const midY = fy + fh * 0.42;
  ctx.beginPath();
  ctx.moveTo(fx, midY);
  ctx.lineTo(fx + fw, midY);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, midY, 18, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
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
  // the little white church, now at the top of Main Street
  drawChurch();
  // cobblestone strip leading away from the church door (south), down to
  // where it meets the main road at the crossroads
  drawCobblePath(19, 9, 1, 3);

  // small row of food stands / shops running along the center road
  drawStand(21 * TILE, 4 * TILE + 6,   { top: '#d84030', top2: '#f4efe3', body: '#8a5a32', a: '#e06a38', b: '#c8d84a' });
  drawStand(21 * TILE, 8 * TILE + 6,   { top: '#d0a02c', top2: '#f4efe3', body: '#4a7ab0', a: '#c8443c', b: '#9ac84a' });
  drawStand(21 * TILE, 16 * TILE + 6,  { top: '#7a5a92', top2: '#f4efe3', body: '#b89878', a: '#d8b050', b: '#c8785a' });
  drawStand(21 * TILE, 19 * TILE + 6,  { top: '#3f6fb0', top2: '#f4efe3', body: '#e8e0d0', a: '#7a4a2a', b: '#d0c06a' });
}

// A banner strung between two poles across the main crossroads, announcing
// the town's annual summer jazz festival. Purely decorative — it hangs above
// the road tiles rather than modifying the grid, so it never blocks movement.
function drawJazzFestBanner(time) {
  const polL = 17 * TILE, polR = 23 * TILE;
  const poleTopY = 11 * TILE, poleBotY = 13 * TILE + 16;

  ctx.save();

  // wooden poles anchoring the banner on either side of the road
  ctx.fillStyle = '#5a3a20';
  ctx.fillRect(polL - 3, poleTopY, 6, poleBotY - poleTopY);
  ctx.fillRect(polR - 3, poleTopY, 6, poleBotY - poleTopY);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(polL - 3, poleBotY - 4, 6, 4);
  ctx.fillRect(polR - 3, poleBotY - 4, 6, 4);

  // banner cloth, gently swaying, strung between the poles above the road
  const sway = Math.sin(time * 1.3) * 3;
  const topY = poleTopY + 12, bh = 34;
  const x0 = polL + 4, x1 = polR - 4;
  const teeth = 6;

  ctx.fillStyle = '#4a1e5e';
  ctx.beginPath();
  ctx.moveTo(x0, topY);
  ctx.lineTo(x1, topY);
  for (let i = 0; i <= teeth; i++) {
    const tx = x1 - (i / teeth) * (x1 - x0);
    const ty = topY + bh + sway + (i % 2 === 0 ? 0 : -6);
    ctx.lineTo(tx, ty);
  }
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#f0c840';
  ctx.fillRect(x0, topY, x1 - x0, 4);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4ecd8';
  ctx.font = 'bold 15px monospace';
  ctx.fillText('BTV JAZZ FEST', (x0 + x1) / 2, topY + bh / 2 - 3 + sway * 0.3);
  ctx.fillStyle = '#e0b040';
  ctx.font = 'bold 8px monospace';
  ctx.fillText('ANNUAL SUMMER FESTIVAL', (x0 + x1) / 2, topY + bh / 2 + 11 + sway * 0.3);

  ctx.fillStyle = '#f0c840';
  ctx.font = '12px monospace';
  ctx.fillText('\u266a', x0 + 12, topY + 14);
  ctx.fillText('\u266b', x1 - 12, topY + 14);

  ctx.restore();
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

  // wheels — green-painted hubs to match the body
  ctx.fillStyle = '#1c1a20';
  ctx.beginPath(); ctx.arc(x + 18, y + h - 2, 8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w - 18, y + h - 2, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4a8a3a';
  ctx.beginPath(); ctx.arc(x + 18, y + h - 2, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w - 18, y + h - 2, 3, 0, Math.PI * 2); ctx.fill();

  // van body — grass-green lower panel under a sky-blue upper band, split
  // by a rolling horizon line (a nod to a classic Vermont dairy-farm van
  // paint job, not any one brand's exact trade dress)
  ctx.fillStyle = '#5cae5a';
  ctx.fillRect(x, y + 14, w, h - 22);
  ctx.fillStyle = '#8ec6e6';
  ctx.fillRect(x, y, w, 20);
  ctx.fillStyle = '#5cae5a';
  ctx.beginPath();
  ctx.moveTo(x, y + 20);
  for (let i = 0; i <= w; i += 8) {
    ctx.lineTo(x + i, y + 20 - 3 * Math.sin(i / 14));
  }
  ctx.lineTo(x + w, y + 26);
  ctx.lineTo(x, y + 26);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(x, y + h - 22, w, 3);

  // standing black-and-white cows across the green panel, callback to
  // Vermont dairy country rather than any specific brand's trade dress
  function drawCow(cxp, cyp, s) {
    // legs
    ctx.fillStyle = '#f4ecd8';
    ctx.fillRect(cxp - 7 * s, cyp + 2 * s, 2 * s, 6 * s);
    ctx.fillRect(cxp + 5 * s, cyp + 2 * s, 2 * s, 6 * s);
    // body
    ctx.beginPath();
    ctx.ellipse(cxp, cyp, 9 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // head + ears + snout
    ctx.beginPath();
    ctx.ellipse(cxp + 10 * s, cyp - 2 * s, 4 * s, 3.6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#211c18';
    ctx.beginPath(); ctx.ellipse(cxp + 8 * s, cyp - 5 * s, 1.6 * s, 1.4 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cxp + 12.5 * s, cyp - 5 * s, 1.6 * s, 1.4 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f4ecd8';
    ctx.beginPath(); ctx.ellipse(cxp + 13 * s, cyp - 1 * s, 2 * s, 1.6 * s, 0, 0, Math.PI * 2); ctx.fill();
    // black patches on the body
    ctx.fillStyle = '#211c18';
    ctx.beginPath(); ctx.ellipse(cxp - 4 * s, cyp - 1 * s, 3 * s, 2.4 * s, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cxp + 3 * s, cyp + 1 * s, 2.4 * s, 1.8 * s, -0.3, 0, Math.PI * 2); ctx.fill();
  }
  drawCow(x + w * 0.14, y + h - 15, 1.05);
  drawCow(x + w * 0.34, y + h - 15, 1.1);
  drawCow(x + w * 0.53, y + h - 15, 1.0);

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

  // roof vent stack
  ctx.fillStyle = '#b8bcc0';
  ctx.fillRect(x + w * 0.42 - 5, y - 9, 10, 9);
  ctx.fillStyle = '#8e9296';
  ctx.fillRect(x + w * 0.42 - 6, y - 10, 12, 3);

  // hand-painted name banner along the body — kept to generic wording
  ctx.fillStyle = '#211c18';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ICE CREAM', x + w * 0.5, y + 10);
}

// Smaller now, and moved off the riverbank to the open ground between Green
// Door Studio's east wall and the river — still just west of the water.
function drawAnthillBillboard() {
  const x = 12 * TILE;
  const y = 4 * TILE;
  const w = 80, h = 30;

  ctx.fillStyle = '#553c2b';
  ctx.fillRect(x + 8, y + h, 4, 21);
  ctx.fillRect(x + w - 12, y + h, 4, 21);

  ctx.fillStyle = '#29242a';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);

  ctx.fillStyle = '#d6c35e';
  ctx.fillRect(x, y, w, h);

  // Graffiti mural artwork fills the board (cover-fit, cropped to the frame)
  if (anthillBillboardImg.complete && anthillBillboardImg.naturalWidth) {
    const ix = x + 3, iy = y + 3, iw = w - 6, ih = h - 6;
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
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
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

// Cheap stand-in for shadowBlur's glow on the Nectar's sign — see the call
// site for why. A wider ring than Henry's since this sign is bigger (32px).
const NECTARS_GLOW_OFFSETS = [
  [-4, 0], [4, 0], [0, -4], [0, 4], [-3, -3], [3, -3], [-3, 3], [3, 3],
  [-2, 0], [2, 0], [0, -2], [0, 2],
];

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
  //
  // This used to stack three ctx.shadowBlur passes (20/15/10px) on a 32px
  // strokeText/fillText, every single outdoor frame — this building's sign
  // is on screen the whole time you're outside. shadowBlur is a per-pixel
  // blur and one of the most expensive things Canvas2D can do; three passes
  // of it running every frame was a steady drain on the same main thread
  // the music scheduler needs to stay on time (see the LOOKAHEAD comment in
  // the `music` object), which is what caused the outdoor audio glitches.
  // A small ring of low-opacity offset copies reads as the same glow for a
  // fraction of the cost, no shadowBlur required.
  const signX = px + w/2;
  const signY = py + 60;
  ctx.font = 'italic bold 32px cursive';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = 'rgba(255,32,64,0.22)';
  for (const [ox, oy] of NECTARS_GLOW_OFFSETS) ctx.fillText("Nectar's", signX + ox, signY + oy);
  ctx.strokeStyle = '#ff4060';
  ctx.lineWidth = 2;
  ctx.strokeText("Nectar's", signX, signY);
  ctx.fillStyle = '#ffe0e6';
  ctx.fillText("Nectar's", signX, signY);
  
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

// Round sign with a cartoon cow face on it — VT Comedy Club's mascot/logo,
// mounted on the wall between the name plate up top and the door below.
// The building footprint is only 2 tiles wide, so everything here is sized
// small and centered on the wall rather than spread out.
function drawComedyClubDecor(px, py, w, h) {
  ctx.save();

  const cx = px + w / 2;
  const cy = py + 76;
  const r = 13;

  // glow + chrome-style ring, echoing the round signs elsewhere in town
  ctx.fillStyle = 'rgba(224,176,64,0.18)';
  ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8e4dc';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8a6a20';
  ctx.lineWidth = 2;
  ctx.stroke();

  // cow face: white head, black patches, pink snout, big goofy grin
  ctx.fillStyle = '#f4ecd8';
  ctx.beginPath(); ctx.arc(cx, cy + 1, r - 3, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#241a1a';                      // black patches
  ctx.beginPath(); ctx.ellipse(cx - 7, cy - 5, 4, 5, 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 6, cy + 4, 3, 4, -0.3, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#f4ecd8';                       // ears
  ctx.beginPath(); ctx.ellipse(cx - r + 2, cy - 3, 3, 5, 0.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + r - 2, cy - 3, 3, 5, -0.6, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#f0b8c8';                       // snout
  ctx.beginPath(); ctx.ellipse(cx, cy + 7, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a2222';                        // nostrils
  ctx.beginPath(); ctx.ellipse(cx - 3, cy + 7, 1.2, 1.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 3, cy + 7, 1.2, 1.6, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#1c1414';                        // eyes
  ctx.beginPath(); ctx.arc(cx - 4, cy - 2, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 4, cy - 2, 1.6, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = '#3a2222';                      // grin, laughing wide
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy + 3, 5, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  ctx.restore();
}

function drawHenrysDecor(px, py, w, h) {
  ctx.save();

  // black & white checkerboard trim band along the base — classic diner look
  const bandY = py + h - 14, sq = 8;
  for (let i = 0; i * sq < w; i++) {
    ctx.fillStyle = (i % 2 === 0) ? '#f4ecd8' : '#1c1c1e';
    ctx.fillRect(px + i * sq, bandY, sq, 8);
  }

  // red-and-white striped awning over the door
  const awnY = py + h - TILE - 16;
  for (let i = 0; i * 8 < w; i++) {
    ctx.fillStyle = (i % 2 === 0) ? '#c23b30' : '#f4ecd8';
    ctx.fillRect(px + i * 8, awnY, 8, 10);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(px, awnY + 10, w, 3);

  // round chrome-ringed "EAT" sign, diner-style
  const cx = px + w / 2, cy = py + 46;
  ctx.fillStyle = '#c8ccd0';
  ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e04030';
  ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4ecd8';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('EAT', cx, cy + 4);

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

function drawComedyClubInterior(time) {
  // Small brick-backed stage with a spotlight, mic stand, a row of stools
  // facing it, and a curtain along the side wall — plus a little cow-face
  // callback to the sign outside.

  // back wall brick, exposed-brick comedy-club look
  ctx.fillStyle = '#3a2830';
  ctx.fillRect(0, 0, 14 * TILE, 3 * TILE);
  ctx.strokeStyle = '#2a1c22';
  ctx.lineWidth = 1;
  for (let row = 0; row < 4; row++) {
    const by = 8 + row * 16;
    ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(14 * TILE, by); ctx.stroke();
    const offset = row % 2 === 0 ? 0 : 14;
    for (let bx = offset; bx < 14 * TILE; bx += 28) {
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by + 16); ctx.stroke();
    }
  }

  // stage platform
  const stageX = 3 * TILE, stageY = 2 * TILE + 20, stageW = 8 * TILE, stageH = 10;
  ctx.fillStyle = '#5a3a48';
  ctx.fillRect(stageX, stageY, stageW, stageH);
  ctx.fillStyle = '#40222e';
  ctx.fillRect(stageX, stageY + stageH - 3, stageW, 3);

  // spotlight cone, gently flickers
  const flick = 0.75 + 0.25 * Math.sin(time * 3);
  ctx.save();
  ctx.fillStyle = `rgba(255, 233, 160, ${0.16 * flick})`;
  ctx.beginPath();
  ctx.moveTo(6.5 * TILE, 0);
  ctx.lineTo(5 * TILE, stageY);
  ctx.lineTo(8 * TILE, stageY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // mic stand, center stage
  const micX = 6.5 * TILE, micBaseY = stageY;
  ctx.strokeStyle = '#1c1c1e';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(micX, micBaseY); ctx.lineTo(micX, micBaseY - 28); ctx.stroke();
  ctx.fillStyle = '#2a2a2e';
  ctx.fillRect(micX - 10, micBaseY - 2, 20, 3);
  ctx.fillStyle = '#c8c8cc';
  ctx.beginPath(); ctx.arc(micX, micBaseY - 32, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1c1c1e';
  ctx.beginPath(); ctx.arc(micX, micBaseY - 32, 3, 0, Math.PI * 2); ctx.fill();

  // deep purple curtain along the right wall
  const curtX = 11 * TILE;
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#4a2060' : '#3a1850';
    ctx.fillRect(curtX + i * 10, 0, 10, 6 * TILE);
  }

  // a few stools facing the stage
  ctx.fillStyle = '#8a5a30';
  [[4, 7], [6.5, 7.5], [9, 7]].forEach(([tx, ty]) => {
    const sx = tx * TILE, sy = ty * TILE;
    ctx.beginPath(); ctx.ellipse(sx, sy, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5a3a1e';
    ctx.fillRect(sx - 2, sy + 3, 4, 10);
    ctx.fillStyle = '#8a5a30';
  });

  // "COMEDY NIGHT" marquee lettering above the stage
  ctx.fillStyle = '#e0b040';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('COMEDY NIGHT', 7 * TILE, 1 * TILE + 4);

  // little cow-face plaque on the brick wall, echoing the sign outside
  const ccx = 12 * TILE, ccy = 1 * TILE + 8, cr = 9;
  ctx.fillStyle = '#f4ecd8';
  ctx.beginPath(); ctx.arc(ccx, ccy, cr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#241a1a';
  ctx.beginPath(); ctx.ellipse(ccx - 4, ccy - 3, 2.4, 3, 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f0b8c8';
  ctx.beginPath(); ctx.ellipse(ccx, ccy + 4, 4.5, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1c1414';
  ctx.beginPath(); ctx.arc(ccx - 2, ccy - 1, 1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(ccx + 2, ccy - 1, 1, 0, Math.PI * 2); ctx.fill();
}

function drawHenrysInterior(time) {
  // Classic old-school diner: black & white checker floor, long red-topped
  // counter with chrome stools, a soda fountain, and a corner jukebox.

  // checkerboard floor across the middle of the room
  for (let fy = 3; fy <= 7; fy++) {
    for (let fx = 1; fx <= 12; fx++) {
      if ((fx + fy) % 2 === 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(fx * TILE, fy * TILE, TILE, TILE);
      }
    }
  }

  // long counter along the back wall
  const counterX = 2 * TILE, counterY = 2 * TILE;
  const counterW = 9 * TILE, counterH = TILE + 6;
  ctx.fillStyle = '#8a2820';
  ctx.fillRect(counterX, counterY, counterW, counterH);
  ctx.fillStyle = '#c8ccd0';
  ctx.fillRect(counterX, counterY, counterW, 6);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(counterX, counterY + counterH - 6, counterW, 6);

  // chrome stools along the front of the counter
  for (let i = 0; i < 6; i++) {
    const sx = counterX + 14 + i * 26, sy = counterY + counterH + 12;
    ctx.fillStyle = '#9a9ea2';
    ctx.fillRect(sx - 2, sy - 10, 4, 10);
    ctx.fillStyle = '#c23b30';
    ctx.beginPath(); ctx.ellipse(sx, sy - 12, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
  }

  // soda fountain / milkshake mixer on the counter
  const fountX = counterX + counterW - 40, fountY = counterY - 22;
  ctx.fillStyle = '#c8ccd0';
  ctx.fillRect(fountX, fountY, 30, 24);
  ctx.fillStyle = '#7a2018';
  ctx.fillRect(fountX + 4, fountY + 4, 22, 8);
  ctx.fillStyle = '#e8e8ec';
  ctx.fillRect(fountX + 10, fountY - 6, 3, 8);
  ctx.fillRect(fountX + 17, fountY - 6, 3, 8);

  // pie case on the other end of the counter
  const pieX = counterX + 6, pieY = counterY - 20;
  ctx.fillStyle = 'rgba(200,220,240,0.3)';
  ctx.fillRect(pieX, pieY, 26, 20);
  ctx.strokeStyle = '#9a9a9e';
  ctx.lineWidth = 2;
  ctx.strokeRect(pieX, pieY, 26, 20);
  ctx.fillStyle = '#e8c060';
  ctx.beginPath();
  ctx.moveTo(pieX + 13, pieY + 8);
  ctx.lineTo(pieX + 21, pieY + 16);
  ctx.lineTo(pieX + 5, pieY + 16);
  ctx.closePath();
  ctx.fill();

  // "HENRY'S" sign on the back wall
  ctx.fillStyle = '#e0483c';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.fillText("HENRY'S", 6.5 * TILE, 1 * TILE + 4);

  // jukebox in the corner, red & chrome
  const jbX = 11.3 * TILE, jbY = 6 * TILE;
  ctx.fillStyle = '#7a2018';
  ctx.fillRect(jbX, jbY, 22, 34);
  ctx.fillStyle = '#c8ccd0';
  ctx.fillRect(jbX + 2, jbY + 2, 18, 6);
  ctx.fillStyle = 'rgba(120,200,220,0.55)';
  ctx.fillRect(jbX + 4, jbY + 10, 14, 14);
  ctx.fillStyle = '#e8c060';
  ctx.fillRect(jbX + 6, jbY + 26, 10, 4);
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
const KEEPER_HAIR = { DEE: '#5a2e1c', ROSIE: '#c8c0b0', ZEKE: '#241a12', JADE: '#141014', TONY: '#2a2018', LANNY: '#3a1a5c' };

// Optional per-keeper artwork. Drop a PNG at assets/keepers/<name>.png (any
// size — it's scaled to KEEPER_SPR_H, feet anchored at the same floor line
// the procedural sprite uses) and it's picked up automatically. Until a file
// exists (or while it's still loading), drawKeeper falls back to the shaded
// procedural sprite below, so nothing ever renders blank.
const KEEPER_NAMES = ['SK1', 'DEE', 'ROSIE', 'ZEKE', 'JADE', 'TONY', 'LANNY'];
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

// Registry of full pre-drawn character images usable as shop npcs (see
// map.npcs[i].sprite). Each is drawn as-is, scaled to spriteH with feet
// anchored to the tile's floor line — no procedural fallback, since there's
// no simple shape that stands in for this art; it just waits for the image
// to finish loading.
const SHOP_NPC_IMAGES = { kanga: kangaImg, truth: truthImg, bill: billImg, rza: rzaImg, gza: gzaImg, zach: zachImg };

function drawShopImageNpcs(map) {
  if (!map.npcs) return;
  for (const n of map.npcs) {
    if (!n.sprite) continue;
    const img = SHOP_NPC_IMAGES[n.sprite];
    if (!img || !img.complete || !img.naturalWidth) continue;
    const px = n.tx * TILE, py = n.ty * TILE;
    const kh = n.spriteH || 80;
    const kw = Math.round(kh * img.naturalWidth / img.naturalHeight);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(px + 16 - kw * 0.3, py + 27, kw * 0.6, 4);
    ctx.drawImage(img, Math.round(px + 16 - kw / 2), Math.round(py + 30 - kh), kw, kh);
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
  const charImg = CHARACTERS[selectedCharacter].img;
  if (charImg.complete && charImg.naturalWidth) {
    ctx.drawImage(charImg, col * SHEET_CW, row * SHEET_CH, SHEET_CW, SHEET_CH,
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
                  : target.type === 'newspaper' ? '[E] READ'
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

// Splash popup shown when the player walks into one of the placeholder
// portal doors. Mirrors the look of drawDialog()/drawSplash() so it feels
// native to the game rather than a bolted-on alert box.
function drawPortalPopup() {
  ctx.fillStyle = 'rgba(8,6,12,0.6)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  if (portalClosedImg.complete && portalClosedImg.naturalWidth) {
    const iw = portalClosedImg.naturalWidth, ih = portalClosedImg.naturalHeight;
    const scale = Math.min((VIEW_W * 0.62) / iw, (VIEW_H * 0.58) / ih);
    const dw = iw * scale, dh = ih * scale;
    const dx = (VIEW_W - dw) / 2, dy = 38;
    ctx.drawImage(portalClosedImg, dx, dy, dw, dh);
  }

  const boxW = VIEW_W - 120, boxH = 128, boxX = 60, boxY = VIEW_H - boxH - 28;
  ctx.fillStyle = 'rgba(10,8,14,0.94)';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = '#f4ecd8';
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX + 2, boxY + 2, boxW - 4, boxH - 4);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4ecd8';
  ctx.font = '15px monospace';
  const lines = wrapLinesCentered(
    'More lands are being created. More vinyl awaits. Check back later homie!',
    boxW - 48
  );
  const startY = boxY + 30;
  lines.forEach((l, i) => ctx.fillText(l, VIEW_W / 2, startY + i * 20));

  ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#e0b040' : '#f4ecd8';
  ctx.font = 'bold 14px monospace';
  ctx.fillText('Press [E] or tap screen to return', VIEW_W / 2, boxY + boxH - 16);
}

// "fifa" keyword easter egg: splash image + a countdown popup that reads
// "Time for a quick friendly! Back in 5...4...3..." with a live number,
// shown for 5 seconds (see triggerFifaEasterEgg / fifaStartTime) before
// control hands back to whatever state the player was in.
function drawFifaPopup() {
  ctx.fillStyle = 'rgba(8,6,12,0.68)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  if (fifaImg.complete && fifaImg.naturalWidth) {
    const iw = fifaImg.naturalWidth, ih = fifaImg.naturalHeight;
    const scale = Math.min((VIEW_W * 0.72) / iw, (VIEW_H * 0.6) / ih);
    const dw = iw * scale, dh = ih * scale;
    const dx = (VIEW_W - dw) / 2, dy = 26;
    ctx.drawImage(fifaImg, dx, dy, dw, dh);
  }

  const secondsLeft = Math.max(1, Math.ceil(5 - (performance.now() - fifaStartTime) / 1000));

  const boxW = VIEW_W - 160, boxH = 100, boxX = 80, boxY = VIEW_H - boxH - 24;
  ctx.fillStyle = 'rgba(10,8,14,0.94)';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = '#f4ecd8';
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX + 2, boxY + 2, boxW - 4, boxH - 4);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4ecd8';
  ctx.font = '16px monospace';
  ctx.fillText('Time for a quick friendly!', VIEW_W / 2, boxY + 36);

  ctx.fillStyle = '#e0b040';
  ctx.font = 'bold 26px monospace';
  ctx.fillText(`Back in ${secondsLeft}...`, VIEW_W / 2, boxY + 74);
}

// Like wrapText(), but returns the wrapped lines instead of drawing them
// left-aligned, so a caller can center each line itself.
function wrapLinesCentered(text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
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
    'E, OR THE ON-SCREEN E BUTTON ... talk / dig crates / read',
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

// Portrait centers, as fractions of the character_select art's own
// width/height — measured against the source image so labels land inside
// the blank boxes under each portrait regardless of how the art gets
// scaled to fit the view.
const SELECT_LABEL_POS = [
  { xFrac: 0.1888, yFrac: 0.8398 }, // Santos (green, left)
  { xFrac: 0.5013, yFrac: 0.8398 }, // Rico, hoodie/Yankees cap (blue, middle)
  { xFrac: 0.8138, yFrac: 0.8398 }, // Rico, red hat (red, right)
];
// Name + smaller qualifier drawn in the title box under each portrait.
// Order matches SELECT_ORDER (Santos, Rico-Yankees, Rico-red-hat).
const SELECT_TITLES = [
  { main: 'SANTOS', sub: null },
  { main: 'RICO', sub: '(YANKS)' },
  { main: 'RICO', sub: '(HIERO)' },
];

// Draws text with a chunky dark outline behind a gold gradient fill, the
// same recipe classic Zelda-style logos use to get that engraved, "carved
// from treasure" look out of an ordinary serif font.
function drawRetroTitle(text, cx, cy, size) {
  ctx.font = `bold ${size}px Georgia, 'Times New Roman', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.lineWidth = Math.max(2, size * 0.16);
  ctx.strokeStyle = '#241206';
  ctx.strokeText(text, cx, cy);
  ctx.restore();

  const grad = ctx.createLinearGradient(0, cy - size * 0.8, 0, cy + size * 0.15);
  grad.addColorStop(0, '#fff6d6');
  grad.addColorStop(0.5, '#f0c33e');
  grad.addColorStop(1, '#b3760f');
  ctx.fillStyle = grad;
  ctx.fillText(text, cx, cy);
}

function drawCharacterSelect(time) {
  // background: reuse the same drifting sky as the title screen so the two
  // screens feel like one continuous flow
  if (titleSkyImg.complete && titleSkyImg.naturalWidth) {
    const tw = titleSkyImg.naturalWidth * (VIEW_H / titleSkyImg.naturalHeight);
    const off = (time * 16) % tw;
    ctx.fillStyle = '#9fd0ee';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    for (let x = -off; x < VIEW_W; x += tw) {
      ctx.drawImage(titleSkyImg, x, 0, tw, VIEW_H);
    }
  } else {
    ctx.fillStyle = 'rgba(8,6,12,0.93)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  if (characterSelectImg.complete && characterSelectImg.naturalWidth) {
    const iw = characterSelectImg.naturalWidth, ih = characterSelectImg.naturalHeight;
    const scale = Math.min(VIEW_W / iw, VIEW_H / ih);
    const dw = iw * scale, dh = ih * scale;
    const originX = (VIEW_W - dw) / 2, originY = (VIEW_H - dh) / 2;
    selectLayout = { originX, originY, scale, imgW: iw, imgH: ih };
    ctx.drawImage(characterSelectImg, originX, originY, dw, dh);

    // highlight the keyboard-selected portrait with a pulsing box, so
    // arrow-key/E users can see where they are without a mouse
    const bounds = [[0, 0.345], [0.345, 0.658], [0.658, 1]];
    const [x0f, x1f] = bounds[selectIndex];
    const hx = originX + x0f * dw, hw = (x1f - x0f) * dw;
    ctx.strokeStyle = Math.floor(time * 2.4) % 2 ? '#e0b040' : '#f4ecd8';
    ctx.lineWidth = 4;
    ctx.strokeRect(hx + 3, originY + 3, hw - 6, dh - 6);

    // retro Zelda-style name titles in the blank boxes under each portrait
    SELECT_ORDER.forEach((id, i) => {
      const pos = SELECT_LABEL_POS[i];
      const title = SELECT_TITLES[i];
      const lx = originX + pos.xFrac * dw, ly = originY + pos.yFrac * dh;
      if (title.sub) {
        drawRetroTitle(title.main, lx, ly - 8, 26);
        drawRetroTitle(title.sub, lx, ly + 18, 16);
      } else {
        drawRetroTitle(title.main, lx, ly + 8, 28);
      }
    });
  } else {
    // fallback: simple colored panels until the art loads. Map taps across
    // the full view width using the same thirds the real art uses, so
    // tapping works even before character_select.png has loaded in.
    selectLayout = { originX: 0, originY: 0, scale: 1, imgW: VIEW_W, imgH: VIEW_H };
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e0b040';
    ctx.font = 'bold 30px monospace';
    ctx.fillText('SELECT YOUR CHARACTER', VIEW_W / 2, 90);
    const panelW = 260, panelH = 340, gap = 30;
    const totalW = panelW * 3 + gap * 2;
    const startX = (VIEW_W - totalW) / 2, y = 140;
    const colors = ['#2c5a1e', '#123a5e', '#5e1414'];
    SELECT_ORDER.forEach((id, i) => {
      const x = startX + i * (panelW + gap);
      ctx.fillStyle = i === selectIndex ? '#e0b040' : colors[i];
      ctx.fillRect(x, y, panelW, panelH);
      const title = SELECT_TITLES[i];
      const lx = x + panelW / 2, ly = y + panelH - 34;
      if (title.sub) {
        drawRetroTitle(title.main, lx, ly - 10, 32);
        drawRetroTitle(title.sub, lx, ly + 20, 19);
      } else {
        drawRetroTitle(title.main, lx, ly + 10, 34);
      }
    });
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#e0b040' : '#f4ecd8';
  ctx.font = 'bold 16px monospace';
  ctx.fillText('- TAP A CHARACTER, OR USE \u25c0 \u25b6 AND E -', VIEW_W / 2, VIEW_H - 22);
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
window.__rico = { player, maps, collected, getState: () => state, getCharacter: () => selectedCharacter };
})();
