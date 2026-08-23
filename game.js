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

// ---- mini-games -----------------------------------------------------------
// One shared entry point for any mini-game: `state` flips to 'minigame' and
// `activeMinigame` holds a plain object with update(dt)/draw()/onExit(). The
// mini-game owns all of its own state in a closure, runs on the exact same
// rAF loop as everything else (no timers, no extra assets), and exits by
// calling exitMinigame() itself once it's done. This mirrors the 'fifa'
// easter egg above, just player-controlled instead of a fixed countdown.
let activeMinigame = null;
let minigameReturnState = 'play';

function enterMinigame(game) {
  minigameReturnState = state;
  activeMinigame = game;
  state = 'minigame';
}

function exitMinigame() {
  state = minigameReturnState;
  activeMinigame = null;
}

// Maps a mini-game's `id` (as listed in a map's `minigames` array) to the
// function that launches it. Both the "[E]" interact prompt and the tap-the-
// sign shortcut read from this same table, so adding a future mini-game is
// just: add its tx/ty/id/label to the map's `minigames` list, then add one
// line here. The floating arcade sign (drawMinigameArcadeSign) and its tap
// hitbox pick up every entry in a map's `minigames` list automatically -- no
// per-game wiring needed anywhere else.
const MINIGAME_ACTIONS = {
  // Darts, Beat Match, Crate Digging, Whack-a-Pigeon, and Beat Jam each have
  // two renderers: the original canvas version and a Three.js remake. These
  // route through createModeSelectMenu(), which now goes straight to the 3D
  // version on entry -- classic is kept only as an automatic fallback if
  // Three.js/WebGL fails, never as a player-facing choice. This is the
  // standard shape for any mini-game with a 3D version, and the default
  // shape for brand new mini-games going forward (see the note above
  // createModeSelectMenu for the template).
  darts: () => enterMinigame(createDartsModeSelect()),
  beatmatch: () => enterMinigame(createBeatMatchModeSelect()),
  whackpigeon: () => enterMinigame(createWhackPigeonModeSelect()),
  cratedig: () => enterMinigame(createCrateDiggingModeSelect()),
  speedsweep: () => enterMinigame(createSpeedSweepModeSelect()),
  staringcontest: () => enterMinigame(createStaringContestGame()),
  buildpizza: () => enterMinigame(createPizzaBuildGame()),
  clawmachine: () => enterMinigame(createClawMachineModeSelect()),
  beatjam: () => enterMinigame(createBeatJamModeSelect()),
  scratchdj: () => enterMinigame(createScratchDJModeSelect()),
};

// ---- trophy case: personal bests for the 8 scored mini-games --------------
// One entry per scored mini-game (beatjam is a freeform jam session with no
// score, so it sits this one out). `unit` controls how drawTrophyCase() and
// each mini-game's own 'done' screen format the stored number -- 'pts' for
// the seven point-scored games, 's' for the staring contest, which tracks
// longest time held still instead of a points total. `flavor` is a one-line
// blurb shown in the case's detail panel, same spirit as a record's flavor
// text in drawCrate().
const MINIGAME_TROPHIES = [
  { id: 'darts', label: 'Darts', unit: 'pts',
    flavor: 'Three throws, dead center or bust.' },
  { id: 'beatmatch', label: 'Beat Match', unit: 'pts',
    flavor: 'Five beats, tap it right on the click.' },
  { id: 'whackpigeon', label: 'Whack-a-Pigeon', unit: 'pts',
    flavor: 'Eight rounds of quick reflexes on the ledge.' },
  { id: 'cratedig', label: 'Crate Digging', unit: 'pts',
    flavor: 'Grab the sleeve right as the needle passes it.' },
  { id: 'speedsweep', label: 'Speed Sweep', unit: 'pts',
    flavor: 'Clear as much dust as you can before time\'s up.' },
  { id: 'staringcontest', label: 'Staring Contest', unit: 's',
    flavor: 'How long can you hold still before it blinks -- or you do.' },
  { id: 'buildpizza', label: 'Build A Pizza', unit: 'pts',
    flavor: 'Grab the right topping right as it passes the marker.' },
  { id: 'clawmachine', label: 'Claw Machine', unit: 'pts',
    flavor: 'Six tries to walk off with the good flowers.' },
  { id: 'scratchdj', label: 'Freestyle Scratch-DJ', unit: 'pts',
    flavor: 'Two needles, two hands, no time to think about either.' },
];

function trophyMetaFor(id) { return MINIGAME_TROPHIES.find((t) => t.id === id); }
function bestFor(id) { return personalBests[id]; }
function formatTrophyValue(id, value) {
  const meta = trophyMetaFor(id);
  if (value === undefined || value === null) return '--';
  return meta && meta.unit === 's' ? `${value.toFixed(1)}s` : `${value}`;
}

// Called once, right when a mini-game's own `phase` flips to 'done' (see
// each createXGame() above), never on every 'done' frame -- callers guard
// that with their own local `bestRecorded` flag. Updates personalBests in
// place and silently checkpoints the save (same pattern as the world-
// complete autosave in the 'record' state) so a best survives a reload.
// Returns true when this run set a new best, so the mini-game's 'done'
// screen can flash "NEW BEST!".
function recordMinigameScore(id, value) {
  const prev = personalBests[id];
  if (prev === undefined || value > prev) {
    personalBests[id] = value;
    saveGame();
    return true;
  }
  return false;
}

// Opens the Trophy Case (see drawTrophyCase()) from 'play', same open/close
// shape as openCrate() -- [T] toggles it, [Esc]/E/X close it.
function openTrophyCase() {
  if (state !== 'play') return;
  trophyReturnState = state;
  trophyIndex = 0;
  state = 'trophies';
}

// Darts: a two-tap power/accuracy throw, same trick classic golf games use.
// Tap 1 (E) locks the power while a needle sweeps left-right. Tap 2 (E)
// locks the accuracy while a second needle sweeps across the dartboard's
// width. Three throws, score totalled, then auto-exits back to 'play'.
// Everything drawn with canvas primitives -- no images, no new assets.
//
// The ring table and the aim->points math are shared with the 3D remake
// (createDarts3DGame) so both modes score identically and feed the same
// 'darts' trophy. `r` is a fraction of the board radius, outermost first,
// so the first ring whose radius contains the hit distance wins.
const DARTS_RINGS = [
  { r: 1.00, pts: 0,  color: '#241a2a' },
  { r: 0.78, pts: 5,  color: '#3a2840' },
  { r: 0.55, pts: 15, color: '#c04070' },
  { r: 0.32, pts: 30, color: '#e0a030' },
  { r: 0.12, pts: 50, color: '#f4ecd8' },
];

// aim is -1..1 offset from dead center; power accuracy shrinks the
// effective miss distance, so a well-timed power tap still helps even
// on an imperfect aim tap. Returns { dist, pts } so the 3D mode can also
// place the dart at the exact distance that was scored. The table is
// ordered outermost-first (the draw code needs painter's order), so the
// scoring scan runs innermost-out to award the tightest ring that
// contains the hit. (The original scanned outermost-first, which made the
// 0-point outer ring swallow every throw -- darts could never score.)
function dartsResolveThrow(aim, power) {
  const powerAccuracy = 1 - Math.abs(power - 0.5) * 2 * 0.4; // 0.6..1
  const dist = Math.abs(aim) * powerAccuracy;
  for (let i = DARTS_RINGS.length - 1; i >= 0; i--) {
    if (dist <= DARTS_RINGS[i].r) return { dist, pts: DARTS_RINGS[i].pts };
  }
  return { dist, pts: 0 };
}

function createDartsGame() {
  const ROUNDS = 3;
  let phase = 'power';       // 'power' | 'aim' | 'result' | 'done'
  let power = 0, powerDir = 1;
  let aim = 0, aimDir = 1;
  let lockedPower = 0;
  let throwsLeft = ROUNDS;
  let score = 0;
  let lastScoreLabel = '';
  let resultTimer = 0;
  let bestRecorded = false, isNewBest = false;

  const cx = VIEW_W / 2, cy = 230, boardR = 120;
  const RINGS = DARTS_RINGS;

  return {
    update(dt) {
      if (phase === 'power') {
        power += powerDir * dt * 0.9;
        if (power >= 1) { power = 1; powerDir = -1; }
        if (power <= 0) { power = 0; powerDir = 1; }
        if (interactPressed) { lockedPower = power; phase = 'aim'; aim = -1; aimDir = 1; }
      } else if (phase === 'aim') {
        aim += aimDir * dt * 1.3;
        if (aim >= 1) { aim = 1; aimDir = -1; }
        if (aim <= -1) { aim = -1; aimDir = 1; }
        if (interactPressed) {
          power = lockedPower;
          const pts = dartsResolveThrow(aim, power).pts;
          score += pts;
          lastScoreLabel = pts > 0 ? `+${pts}` : 'MISS';
          throwsLeft--;
          phase = 'result';
          resultTimer = 0.9;
        }
      } else if (phase === 'result') {
        resultTimer -= dt;
        if (resultTimer <= 0) {
          if (throwsLeft <= 0) phase = 'done';
          else { phase = 'power'; power = 0; powerDir = 1; }
        }
      } else if (phase === 'done') {
        if (!bestRecorded) { isNewBest = recordMinigameScore('darts', score); bestRecorded = true; }
        if (interactPressed) exitMinigame();
      }
      // X always bails out early, no matter the phase
      if (buyPressed) exitMinigame();
    },
    draw() {
      ctx.fillStyle = 'rgba(8,6,12,0.9)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#e0b040';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('DARTS', cx, 60);
      ctx.fillStyle = '#f4ecd8';
      ctx.font = '15px monospace';
      ctx.fillText(`SCORE ${score}   THROWS LEFT ${Math.max(0, throwsLeft)}`, cx, 84);

      // board
      for (const ring of RINGS) {
        ctx.beginPath();
        ctx.arc(cx, cy, boardR * ring.r, 0, Math.PI * 2);
        ctx.fillStyle = ring.color;
        ctx.fill();
      }
      ctx.strokeStyle = '#0c0810';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, boardR, 0, Math.PI * 2);
      ctx.stroke();

      // aim needle position (only meaningful during aim/result)
      if (phase === 'aim' || phase === 'result' || phase === 'done') {
        const nx = cx + aim * boardR;
        ctx.strokeStyle = '#f4ecd8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(nx, cy - boardR - 14);
        ctx.lineTo(nx, cy + boardR + 14);
        ctx.stroke();
      }

      // power meter
      const barX = cx - 100, barY = 400, barW = 200, barH = 18;
      ctx.strokeStyle = '#f4ecd8';
      ctx.lineWidth = 2;
      ctx.strokeRect(barX, barY, barW, barH);
      const shownPower = phase === 'power' ? power : lockedPower;
      ctx.fillStyle = '#e0a030';
      ctx.fillRect(barX + 2, barY + 2, (barW - 4) * shownPower, barH - 4);
      ctx.fillStyle = '#9a90a8';
      ctx.font = '14px monospace';
      ctx.fillText('POWER', cx, barY - 8);

      ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#e0b040' : '#f4ecd8';
      ctx.font = 'bold 17px monospace';
      if (phase === 'power') ctx.fillText('- TAP E TO SET POWER -', cx, 452);
      else if (phase === 'aim') ctx.fillText('- TAP E TO THROW -', cx, 452);
      else if (phase === 'result') ctx.fillText(lastScoreLabel, cx, 452);
      else if (phase === 'done') ctx.fillText(`FINAL SCORE: ${score} - PRESS E TO LEAVE`, cx, 452);

      if (phase === 'done') {
        ctx.font = '14px monospace';
        ctx.fillStyle = isNewBest ? '#8cff5f' : '#9a90a8';
        ctx.fillText(isNewBest ? 'NEW BEST!' : `BEST: ${bestFor('darts')}`, cx, 470);
      }

      ctx.fillStyle = '#6a6070';
      ctx.font = '13px monospace';
      ctx.fillText('X to walk away anytime', cx, phase === 'done' ? 488 : 476);
    },
  };
}

// ---- lazy Three.js loader -------------------------------------------------
// lib/three.min.js (vendored, ~600KB) is only fetched the first time a
// player actually picks 3D mode, so the base game's load time and the
// no-network file:// case are completely untouched. A classic script tag
// (not an ES module import) keeps it working from file://, Electron, and
// Capacitor alike. State is polled by the chooser screen's update() rather
// than delivered via callback so everything stays on the one rAF loop.
let threeLoadState = 'idle'; // 'idle' | 'loading' | 'ready' | 'error'
function loadThreeJS() {
  if (window.THREE) { threeLoadState = 'ready'; return; }
  if (threeLoadState === 'loading' || threeLoadState === 'ready') return;
  threeLoadState = 'loading';
  const s = document.createElement('script');
  s.src = 'lib/three.min.js';
  s.onload = () => { threeLoadState = window.THREE ? 'ready' : 'error'; };
  s.onerror = () => { threeLoadState = 'error'; };
  document.head.appendChild(s);
}

// ---- shared 3D renderer cache ----------------------------------------------
// One offscreen WebGL renderer/canvas per mini-game id, created once and
// reused across visits (context creation is the slow part) while the scene
// itself is rebuilt on entry and disposed on exit by each game. Any new 3D
// mini-game should grab its renderer through this instead of hand-rolling
// its own module-level renderer/canvas pair.
const minigame3DRenderers = {};
function getMinigame3DRenderer(key) {
  const T = window.THREE;
  let entry = minigame3DRenderers[key];
  if (!entry) {
    const canvas = document.createElement('canvas');
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    // preserveDrawingBuffer guarantees drawImage() always sees the frame we
    // just rendered, whatever the browser's compositing timing.
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(VIEW_W, VIEW_H, false);
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    entry = { renderer, canvas };
    minigame3DRenderers[key] = entry;
  }
  return entry;
}

// ---- generic "CLASSIC vs 3D" mode chooser ----------------------------------
// Runs as a mini-game itself (same update/draw contract) so the arcade sign
// and the tap shortcut need no per-game changes: entering the mini-game
// lands here, and picking a mode swaps `activeMinigame` in place -- state
// stays 'minigame' and minigameReturnState is preserved. Up/down (or
// tapping a card) picks, E confirms, X walks away. If Three.js fails to
// load or WebGL is unavailable, the error screen offers classic as the
// fallback.
//
// This is now the STANDARD shape for a mini-game that has a 3D version, and
// the default template for any brand-new mini-game: build the classic 2D
// version first if you like, but ship it behind createModeSelectMenu() with
// a 3D companion rather than wiring MINIGAME_ACTIONS straight to a single
// renderer. `createClassic`/`createThreeD` are zero-arg factories, same
// contract as every other entry in MINIGAME_ACTIONS.
function createModeSelectMenu(opts) {
  // opts: { title, classicSub, threeDSub, createClassic, createThreeD, pickLabel }
  //
  // Players no longer get a choice here: entering always goes straight into
  // loading the 3D version. `createClassic` is kept only as an automatic
  // fallback if Three.js fails to load or WebGL is unavailable -- it is
  // never offered as a player-facing option.
  loadThreeJS();
  let phase = threeLoadState === 'error' ? 'error' : 'loading'; // 'loading' | 'error'
  let loadDots = 0;

  function startThreeD() {
    try {
      activeMinigame = opts.createThreeD();
    } catch (err) {
      console.error(opts.title + ' 3D failed to start:', err);
      phase = 'error';
    }
  }

  return {
    update(dt) {
      if (phase === 'loading') {
        loadDots += dt;
        if (threeLoadState === 'ready') { startThreeD(); return; }
        if (threeLoadState === 'error') phase = 'error';
        if (buyPressed) exitMinigame();
      } else if (phase === 'error') {
        if (interactPressed) { activeMinigame = opts.createClassic(); return; }
        if (buyPressed) exitMinigame();
      }
    },
    onPointerDown(vx, vy) {
      if (phase === 'error') {
        activeMinigame = opts.createClassic();
      }
    },
    draw() {
      ctx.fillStyle = 'rgba(8,6,12,0.9)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e0b040';
      ctx.font = 'bold 26px monospace';
      ctx.fillText(opts.title, VIEW_W / 2, 100);

      if (phase === 'loading') {
        ctx.fillStyle = '#f4ecd8';
        ctx.font = 'bold 17px monospace';
        ctx.fillText('LOADING 3D' + '.'.repeat(1 + (Math.floor(loadDots * 3) % 3)), VIEW_W / 2, 290);
        ctx.fillStyle = '#6a6070';
        ctx.font = '13px monospace';
        ctx.fillText('X to walk away', VIEW_W / 2, 330);
        return;
      }
      if (phase === 'error') {
        ctx.fillStyle = '#c04070';
        ctx.font = 'bold 17px monospace';
        ctx.fillText("COULDN'T START 3D MODE", VIEW_W / 2, 270);
        ctx.fillStyle = '#f4ecd8';
        ctx.font = '15px monospace';
        ctx.fillText('E - PLAY CLASSIC INSTEAD', VIEW_W / 2, 310);
        ctx.fillStyle = '#6a6070';
        ctx.font = '13px monospace';
        ctx.fillText('X to walk away', VIEW_W / 2, 340);
      }
    },
  };
}

// ---- darts mode chooser -----------------------------------------------------
function createDartsModeSelect() {
  return createModeSelectMenu({
    title: 'DARTS',
    pickLabel: 'PICK YOUR BOARD',
    classicSub: 'The original two-tap board',
    threeDSub: 'Step up to the oche -- full 3D',
    createClassic: () => createDartsGame(),
    createThreeD: () => createDarts3DGame(),
  });
}

// ---- Darts 3D -------------------------------------------------------------
// The Three.js remake of darts. Identical gameplay contract to the classic
// version -- same two-tap power/aim, same sweep speeds, same
// dartsResolveThrow() scoring, same 'darts' trophy -- only the rendering
// changed: a pub-corner scene with a spotlit board, a dart that flies with
// a real arc and sticks where the score says it landed. The scene renders
// to an offscreen WebGL canvas that gets blitted into the main 2D canvas
// each frame, so input handling, CSS scaling, and the rAF loop are all
// untouched, and the HUD is drawn over the blit with the same monospace
// styling every other mini-game uses.
//
// The renderer (and its WebGL context) is created once and cached across
// visits -- context creation is the slow part -- while the scene itself is
// rebuilt on entry and fully disposed on exit. See getMinigame3DRenderer().
function createDarts3DGame() {
  const T = window.THREE;
  const { renderer, canvas: darts3DCanvas } = getMinigame3DRenderer('darts');

  // ---- gameplay state: mirrors createDartsGame exactly
  const ROUNDS = 3;
  let phase = 'power'; // 'power' | 'aim' | 'throwing' | 'result' | 'done'
  let power = 0, powerDir = 1;
  let aim = 0, aimDir = 1;
  let lockedPower = 0;
  let throwsLeft = ROUNDS;
  let score = 0;
  let lastScoreLabel = '';
  let resultTimer = 0;
  let bestRecorded = false, isNewBest = false;
  let t = 0; // scene clock for idle bob / sway

  // ---- scene ----
  const BOARD_POS = new T.Vector3(0, 1.55, -3.4);
  const R = 0.5; // board radius in world units
  const scene = new T.Scene();
  scene.background = new T.Color(0x0d0912);
  scene.fog = new T.Fog(0x0d0912, 6, 16);

  const camera = new T.PerspectiveCamera(55, VIEW_W / VIEW_H, 0.1, 30);
  const CAM_POS = new T.Vector3(0, 1.45, 0.35);
  // the camera dollies toward the board while a dart is in the air (and
  // stays in for the result) so the stick lands right in the player's face,
  // then eases back out for the next throw
  const CAM_Z_IN = -0.6;
  let camZ = CAM_POS.z;
  camera.position.copy(CAM_POS);
  camera.lookAt(BOARD_POS.x, BOARD_POS.y + 0.05, BOARD_POS.z);

  // room: wall + floor + wainscot strip, palette pulled from the town's
  // usual purples so the pub corner feels like the same world
  const wallMat = new T.MeshStandardMaterial({ color: 0x1a1224, roughness: 1 });
  const wall = new T.Mesh(new T.PlaneGeometry(12, 7), wallMat);
  wall.position.set(0, 2.6, -4.0);
  wall.receiveShadow = true;
  scene.add(wall);

  const floorMat = new T.MeshStandardMaterial({ color: 0x241a28, roughness: 0.95 });
  const floor = new T.Mesh(new T.PlaneGeometry(12, 14), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -2);
  floor.receiveShadow = true;
  scene.add(floor);

  const wainscot = new T.Mesh(
    new T.BoxGeometry(12, 1.1, 0.08),
    new T.MeshStandardMaterial({ color: 0x2e1f30, roughness: 0.85 })
  );
  wainscot.position.set(0, 0.55, -3.95);
  scene.add(wainscot);

  // oche line on the floor -- the throw line every pub board has
  const oche = new T.Mesh(
    new T.BoxGeometry(1.6, 0.012, 0.07),
    new T.MeshStandardMaterial({ color: 0xf4ecd8, roughness: 0.8 })
  );
  oche.position.set(0, 0.006, -0.3);
  scene.add(oche);

  // dartboard: dark wood backboard disc + the exact classic ring palette as
  // stacked circles (tiny z offsets stop z-fighting), thin dark torus lines
  // separating the rings so scoring zones read at a glance
  const board = new T.Group();
  board.position.copy(BOARD_POS);
  const backboard = new T.Mesh(
    new T.CylinderGeometry(R * 1.34, R * 1.34, 0.06, 48),
    new T.MeshStandardMaterial({ color: 0x1a1118, roughness: 0.75 })
  );
  backboard.rotation.x = Math.PI / 2;
  backboard.position.z = -0.035;
  backboard.receiveShadow = true;
  board.add(backboard);
  const rim = new T.Mesh(
    new T.TorusGeometry(R * 1.34, 0.022, 12, 48),
    new T.MeshStandardMaterial({ color: 0xe0a030, metalness: 0.65, roughness: 0.35 })
  );
  board.add(rim);
  DARTS_RINGS.forEach((ring, i) => {
    const disc = new T.Mesh(
      new T.CircleGeometry(R * ring.r, 48),
      new T.MeshStandardMaterial({ color: new T.Color(ring.color), roughness: 0.85 })
    );
    disc.position.z = 0.002 * (i + 1);
    disc.receiveShadow = true;
    board.add(disc);
    const line = new T.Mesh(
      new T.TorusGeometry(R * ring.r, 0.006, 8, 48),
      new T.MeshStandardMaterial({ color: 0x0c0810, roughness: 0.9 })
    );
    line.position.z = 0.002 * (i + 1) + 0.001;
    board.add(line);
  });
  scene.add(board);
  const BOARD_FACE_Z = BOARD_POS.z + 0.002 * DARTS_RINGS.length + 0.002;

  // lights: warm spot on the board, dim ambient, and a magenta/amber sconce
  // pair matching the game's two accent colors
  scene.add(new T.AmbientLight(0x352c40, 0.75));
  const spot = new T.SpotLight(0xffe2c0, 1.05, 14, 0.38, 0.45);
  spot.position.set(0, 3.5, -1.2);
  spot.target = board;
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  scene.add(spot);
  const sconceGeo = new T.SphereGeometry(0.05, 12, 12);
  [[-2.1, 0xc04070], [2.1, 0xe0a030]].forEach(([x, color]) => {
    const p = new T.PointLight(color, 0.55, 7);
    p.position.set(x, 2.3, -3.8);
    scene.add(p);
    const bulb = new T.Mesh(sconceGeo, new T.MeshBasicMaterial({ color }));
    bulb.position.copy(p.position);
    scene.add(bulb);
  });

  // aim needle: a glowing vertical bar sweeping across the board face,
  // 1:1 with the classic version's needle
  const needle = new T.Mesh(
    new T.BoxGeometry(0.014, R * 2 + 0.22, 0.014),
    new T.MeshBasicMaterial({ color: 0xf4ecd8 })
  );
  needle.visible = false;
  scene.add(needle);

  // dart: nose built along +z so lookAt() aims it; shared geometry for the
  // three flight fins, rotated 120 degrees apart around the shaft
  const dartMats = {
    metal: new T.MeshStandardMaterial({ color: 0xd8d8e0, metalness: 0.8, roughness: 0.3 }),
    gold: new T.MeshStandardMaterial({ color: 0xe0a030, metalness: 0.6, roughness: 0.35 }),
    dark: new T.MeshStandardMaterial({ color: 0x241a2a, roughness: 0.8 }),
    // a touch of emissive keeps the flights readable when a stuck dart sits
    // in the board's shadowed face
    flight: new T.MeshStandardMaterial({ color: 0xc04070, emissive: 0x481828, roughness: 0.7, side: T.DoubleSide }),
  };
  function makeDart() {
    const g = new T.Group();
    const tip = new T.Mesh(new T.ConeGeometry(0.012, 0.1, 12), dartMats.metal);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.135;
    tip.castShadow = true;
    g.add(tip);
    const barrel = new T.Mesh(new T.CylinderGeometry(0.022, 0.022, 0.11, 14), dartMats.gold);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.05;
    barrel.castShadow = true;
    g.add(barrel);
    const shaft = new T.Mesh(new T.CylinderGeometry(0.014, 0.01, 0.12, 10), dartMats.dark);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = -0.06;
    g.add(shaft);
    // cone flight, apex toward the nose: unlike flat fins it stays readable
    // dead-on from behind -- which is exactly how a stuck dart is seen
    const flight = new T.Mesh(new T.ConeGeometry(0.05, 0.13, 12, 1, true), dartMats.flight);
    flight.rotation.x = Math.PI / 2;
    flight.position.z = -0.1;
    flight.castShadow = true;
    g.add(flight);
    return g;
  }
  let dart = makeDart();
  scene.add(dart);
  const HELD_POS = new T.Vector3(0.44, 1.1, -0.75);

  // throw animation + impact feedback state
  let throwU = 0;
  const THROW_TIME = 0.42;
  let throwFrom = new T.Vector3(), throwTo = new T.Vector3();
  let arcH = 0.3;
  let pendingPts = 0;
  let shakeT = 0;
  let impactRing = null, impactT = 0;

  // Where the dart lands: radial distance from center is exactly the
  // distance the shared scoring used, so the dart always sticks in the ring
  // it scored. The angle around the center is cosmetic -- a random wedge on
  // the side the aim needle was on -- so three throws don't stack up on one
  // horizontal line.
  function landingPoint(aimVal, dist) {
    const side = aimVal >= 0 ? 1 : -1;
    const ang = (Math.random() - 0.5) * 1.1; // +/- ~31 degrees off horizontal
    // z holds the dart's origin far enough off the face that only the tip
    // (0.185 long in local +z) actually embeds
    return new T.Vector3(
      BOARD_POS.x + side * Math.cos(ang) * dist * R,
      BOARD_POS.y + Math.sin(ang) * dist * R,
      BOARD_FACE_Z + 0.155
    );
  }

  function startThrow() {
    const res = dartsResolveThrow(aim, lockedPower);
    pendingPts = res.pts;
    throwFrom.copy(dart.position);
    throwTo = landingPoint(aim, res.dist);
    // weaker throws fly on a loopier arc
    arcH = 0.16 + (1 - lockedPower) * 0.3;
    throwU = 0;
    needle.visible = false;
    phase = 'throwing';
  }

  function onImpact() {
    score += pendingPts;
    lastScoreLabel = pendingPts > 0 ? `+${pendingPts}` : 'MISS';
    throwsLeft--;
    shakeT = 0.22;
    // expanding fading ring right where the dart hit
    impactRing = new T.Mesh(
      new T.TorusGeometry(0.05, 0.008, 8, 32),
      new T.MeshBasicMaterial({ color: pendingPts > 0 ? 0xe0b040 : 0x6a6070, transparent: true, opacity: 0.9 })
    );
    impactRing.position.set(throwTo.x, throwTo.y, BOARD_FACE_Z + 0.01);
    scene.add(impactRing);
    impactT = 0;
    phase = 'result';
    resultTimer = 0.9;
  }

  function disposeImpactRing() {
    if (!impactRing) return;
    scene.remove(impactRing);
    impactRing.geometry.dispose();
    impactRing.material.dispose();
    impactRing = null;
  }

  // Full teardown -- called by this game right before every exitMinigame().
  // Geometries and materials go; the renderer and its context stay cached
  // for the next visit.
  function cleanup() {
    disposeImpactRing();
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
    scene.clear();
  }
  function leave() { cleanup(); exitMinigame(); }

  function positionHeldDart() {
    // idle bob + a slight pull-back as power builds; during aim the dart
    // drifts with the needle so the throw reads from the right hand
    const bobY = Math.sin(t * 2.4) * 0.012;
    const pullZ = (phase === 'power' ? power : lockedPower) * 0.14;
    const aimX = phase === 'aim' ? aim * 0.12 : 0;
    dart.position.set(HELD_POS.x + aimX, HELD_POS.y + bobY, HELD_POS.z + pullZ);
    dart.lookAt(BOARD_POS.x + aimX * 2, BOARD_POS.y + 0.12, BOARD_POS.z);
  }

  positionHeldDart();

  return {
    update(dt) {
      t += dt;

      if (phase === 'power') {
        power += powerDir * dt * 0.9;
        if (power >= 1) { power = 1; powerDir = -1; }
        if (power <= 0) { power = 0; powerDir = 1; }
        positionHeldDart();
        if (interactPressed) { lockedPower = power; phase = 'aim'; aim = -1; aimDir = 1; needle.visible = true; }
      } else if (phase === 'aim') {
        aim += aimDir * dt * 1.3;
        if (aim >= 1) { aim = 1; aimDir = -1; }
        if (aim <= -1) { aim = -1; aimDir = 1; }
        needle.position.set(BOARD_POS.x + aim * R, BOARD_POS.y, BOARD_FACE_Z + 0.02);
        positionHeldDart();
        if (interactPressed) startThrow();
      } else if (phase === 'throwing') {
        throwU = Math.min(1, throwU + dt / THROW_TIME);
        const u = throwU;
        dart.position.lerpVectors(throwFrom, throwTo, u);
        dart.position.y += arcH * 4 * u * (1 - u);
        // aim the nose along the flight path, then roll it for spin
        const uAhead = Math.min(1, u + 0.05);
        const ahead = new T.Vector3().lerpVectors(throwFrom, throwTo, uAhead);
        ahead.y += arcH * 4 * uAhead * (1 - uAhead);
        if (ahead.distanceToSquared(dart.position) > 1e-8) dart.lookAt(ahead);
        dart.rotateZ(u * 14);
        if (u >= 1) {
          dart.lookAt(throwTo.x * 1.1, throwTo.y - 0.22, throwTo.z - 3); // settle nose-in, tail drooping
          onImpact();
        }
      } else if (phase === 'result') {
        resultTimer -= dt;
        if (resultTimer <= 0) {
          disposeImpactRing();
          if (throwsLeft <= 0) phase = 'done';
          else {
            // stuck dart stays on the board; a fresh one appears in hand
            dart = makeDart();
            scene.add(dart);
            phase = 'power';
            power = 0; powerDir = 1;
            positionHeldDart();
          }
        }
      } else if (phase === 'done') {
        if (!bestRecorded) { isNewBest = recordMinigameScore('darts', score); bestRecorded = true; }
        if (interactPressed) { leave(); return; }
      }

      if (impactRing) {
        impactT += dt;
        const k = Math.min(1, impactT / 0.35);
        impactRing.scale.setScalar(1 + k * 3);
        impactRing.material.opacity = 0.9 * (1 - k);
      }

      // camera: dolly in while the dart flies / sticks, back out to throw;
      // plus gentle idle sway and a decaying impact shake
      const wantZ = (phase === 'throwing' || phase === 'result' || phase === 'done') ? CAM_Z_IN : CAM_POS.z;
      camZ += (wantZ - camZ) * Math.min(1, dt * 4);
      const sway = Math.sin(t * 0.7) * 0.015;
      camera.position.set(CAM_POS.x + sway, CAM_POS.y + Math.sin(t * 0.9) * 0.008, camZ);
      if (shakeT > 0) {
        shakeT -= dt;
        const s = Math.max(0, shakeT / 0.22) * 0.03;
        camera.position.x += (Math.random() - 0.5) * s;
        camera.position.y += (Math.random() - 0.5) * s;
      }
      camera.lookAt(BOARD_POS.x, BOARD_POS.y + 0.05, BOARD_POS.z);

      // X always bails out early, no matter the phase
      if (buyPressed) { leave(); return; }
    },
    draw() {
      renderer.render(scene, camera);
      ctx.drawImage(darts3DCanvas, 0, 0);

      // HUD: same layout and styling as the classic version
      const cx = VIEW_W / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e0b040';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('DARTS 3D', cx, 60);
      ctx.fillStyle = '#f4ecd8';
      ctx.font = '15px monospace';
      ctx.fillText(`SCORE ${score}   THROWS LEFT ${Math.max(0, throwsLeft)}`, cx, 84);

      const barX = cx - 100, barY = 470, barW = 200, barH = 18;
      ctx.fillStyle = 'rgba(8,6,12,0.55)';
      ctx.fillRect(barX - 8, barY - 26, barW + 16, barH + 34);
      ctx.strokeStyle = '#f4ecd8';
      ctx.lineWidth = 2;
      ctx.strokeRect(barX, barY, barW, barH);
      const shownPower = phase === 'power' ? power : lockedPower;
      ctx.fillStyle = '#e0a030';
      ctx.fillRect(barX + 2, barY + 2, (barW - 4) * shownPower, barH - 4);
      ctx.fillStyle = '#9a90a8';
      ctx.font = '14px monospace';
      ctx.fillText('POWER', cx, barY - 10);

      ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#e0b040' : '#f4ecd8';
      ctx.font = 'bold 17px monospace';
      if (phase === 'power') ctx.fillText('- TAP E TO SET POWER -', cx, 520);
      else if (phase === 'aim') ctx.fillText('- TAP E TO THROW -', cx, 520);
      else if (phase === 'result') ctx.fillText(lastScoreLabel, cx, 520);
      else if (phase === 'done') ctx.fillText(`FINAL SCORE: ${score} - PRESS E TO LEAVE`, cx, 520);

      if (phase === 'done') {
        ctx.font = '14px monospace';
        ctx.fillStyle = isNewBest ? '#8cff5f' : '#9a90a8';
        ctx.fillText(isNewBest ? 'NEW BEST!' : `BEST: ${bestFor('darts')}`, cx, 542);
      }

      ctx.fillStyle = '#6a6070';
      ctx.font = '13px monospace';
      ctx.fillText('X to walk away anytime', cx, phase === 'done' ? 562 : 544);
    },
  };
}

// Beat Match: a repeating needle sweeps across a timing bar; tap E while
// it's inside the target zone. Same two-key contract as darts (E to act,
// X to bail anytime), same dark-overlay/monospace look, same round-based
// scoring-then-auto-exit shape -- just built around one timing tap per
// round instead of darts' power+aim pair, since a beat is a single hit,
// not a two-stage throw. Canvas primitives only, no new assets, same as
// every mini-game in this file.
function createBeatMatchGame() {
  const ROUNDS = 5;
  let phase = 'wait';        // 'wait' | 'result' | 'done'
  let pos = -1, dir = 1;     // -1..1 sweep position across the bar
  let speed = 1.15;          // ramps up slightly each round
  let round = 1;
  let score = 0;
  let combo = 0;
  let lastHitLabel = '';
  let resultTimer = 0;
  let bestRecorded = false, isNewBest = false;

  const barW = 280, barX = VIEW_W / 2 - barW / 2, barY = 300, barH = 22;
  const barCx = barX + barW / 2;

  function hitFor(p) {
    const d = Math.abs(p);
    if (d <= 0.08) return { label: 'PERFECT!', pts: 50 };
    if (d <= 0.22) return { label: 'GOOD', pts: 25 };
    if (d <= 0.45) return { label: 'OK', pts: 10 };
    return { label: 'MISS', pts: 0 };
  }

  return {
    update(dt) {
      if (phase === 'wait') {
        pos += dir * dt * speed;
        if (pos >= 1) { pos = 1; dir = -1; }
        if (pos <= -1) { pos = -1; dir = 1; }
        if (interactPressed) {
          const res = hitFor(pos);
          score += res.pts;
          combo = res.pts > 0 ? combo + 1 : 0;
          lastHitLabel = res.label;
          phase = 'result';
          resultTimer = 0.7;
        }
      } else if (phase === 'result') {
        resultTimer -= dt;
        if (resultTimer <= 0) {
          if (round >= ROUNDS) { phase = 'done'; }
          else { round++; speed += 0.15; pos = -1; dir = 1; phase = 'wait'; }
        }
      } else if (phase === 'done') {
        if (!bestRecorded) { isNewBest = recordMinigameScore('beatmatch', score); bestRecorded = true; }
        if (interactPressed) exitMinigame();
      }
      // X always bails out early, no matter the phase
      if (buyPressed) exitMinigame();
    },
    draw() {
      ctx.fillStyle = 'rgba(8,6,12,0.9)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#4ad0ff';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('BEAT MATCH', VIEW_W / 2, 60);
      ctx.fillStyle = '#f4ecd8';
      ctx.font = '15px monospace';
      ctx.fillText(`SCORE ${score}   BEAT ${Math.min(round, ROUNDS)}/${ROUNDS}   COMBO x${combo}`, VIEW_W / 2, 84);

      // timing bar track
      ctx.strokeStyle = '#f4ecd8';
      ctx.lineWidth = 2;
      ctx.strokeRect(barX, barY, barW, barH);

      // GOOD band, then PERFECT band on top of it, both centered
      ctx.fillStyle = 'rgba(224,160,48,0.35)';
      ctx.fillRect(barCx - barW * 0.22, barY, barW * 0.44, barH);
      ctx.fillStyle = 'rgba(240,236,216,0.55)';
      ctx.fillRect(barCx - barW * 0.08, barY, barW * 0.16, barH);

      // sweeping needle
      const nx = barCx + pos * (barW / 2);
      ctx.fillStyle = '#e04858';
      ctx.fillRect(nx - 2, barY - 8, 4, barH + 16);

      ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#4ad0ff' : '#f4ecd8';
      ctx.font = 'bold 17px monospace';
      if (phase === 'wait') ctx.fillText('- TAP E ON THE BEAT -', VIEW_W / 2, 360);
      else if (phase === 'result') ctx.fillText(lastHitLabel, VIEW_W / 2, 360);
      else if (phase === 'done') ctx.fillText(`FINAL SCORE: ${score} - PRESS E TO LEAVE`, VIEW_W / 2, 360);

      if (phase === 'done') {
        ctx.font = '14px monospace';
        ctx.fillStyle = isNewBest ? '#8cff5f' : '#9a90a8';
        ctx.fillText(isNewBest ? 'NEW BEST!' : `BEST: ${bestFor('beatmatch')}`, VIEW_W / 2, 378);
      }

      ctx.fillStyle = '#6a6070';
      ctx.font = '13px monospace';
      ctx.fillText('X to walk away anytime', VIEW_W / 2, phase === 'done' ? 396 : 384);
    },
  };
}

// ---- beat match mode chooser -----------------------------------------------
function createBeatMatchModeSelect() {
  return createModeSelectMenu({
    title: 'BEAT MATCH',
    pickLabel: 'PICK YOUR BOOTH',
    classicSub: 'The original sweeping timing bar',
    threeDSub: 'Step up to the decks -- full 3D',
    createClassic: () => createBeatMatchGame(),
    createThreeD: () => createBeatMatch3DGame(),
  });
}

// ---- Beat Match 3D ----------------------------------------------------------
// The Three.js remake of Beat Match. Identical gameplay contract to the
// classic version -- same sweep speed/ramp, same hitFor() judging, same
// round count, same 'beatmatch' trophy -- only the rendering changed: a
// neon DJ booth with a spinning turntable and a glowing orb that slides
// along a suspended light rail in place of the flat timing bar. The scene
// renders to an offscreen WebGL canvas (see getMinigame3DRenderer()) that
// gets blitted into the main 2D canvas each frame, so input handling, CSS
// scaling, and the rAF loop are all untouched, and the HUD is drawn over
// the blit with the same monospace styling every other mini-game uses.
function createBeatMatch3DGame() {
  const T = window.THREE;
  const { renderer, canvas: bm3DCanvas } = getMinigame3DRenderer('beatmatch');

  // ---- gameplay state: mirrors createBeatMatchGame exactly
  const ROUNDS = 5;
  let phase = 'wait';        // 'wait' | 'result' | 'done'
  let pos = -1, dir = 1;     // -1..1 sweep position along the rail
  let speed = 1.15;
  let round = 1;
  let score = 0;
  let combo = 0;
  let lastHitLabel = '';
  let resultTimer = 0;
  let bestRecorded = false, isNewBest = false;
  let t = 0;

  function hitFor(p) {
    const d = Math.abs(p);
    if (d <= 0.08) return { label: 'PERFECT!', pts: 50, color: 0xffffff };
    if (d <= 0.22) return { label: 'GOOD', pts: 25, color: 0xe0b040 };
    if (d <= 0.45) return { label: 'OK', pts: 10, color: 0x9a90a8 };
    return { label: 'MISS', pts: 0, color: 0x6a6070 };
  }

  // ---- scene ----
  const RAIL_POS = new T.Vector3(0, 1.75, -3.2);
  const RAIL_LEN = 3.0; // world-unit rail length, matches the classic bar's role
  const scene = new T.Scene();
  scene.background = new T.Color(0x0a0714);
  scene.fog = new T.Fog(0x0a0714, 6, 16);

  const camera = new T.PerspectiveCamera(55, VIEW_W / VIEW_H, 0.1, 30);
  const CAM_POS = new T.Vector3(0, 1.35, 0.6);
  const CAM_Z_IN = -0.35;
  let camZ = CAM_POS.z;
  camera.position.copy(CAM_POS);
  camera.lookAt(RAIL_POS.x, RAIL_POS.y - 0.3, RAIL_POS.z);

  // room: dark booth walls/floor, same purple family as the rest of the world
  const wallMat = new T.MeshStandardMaterial({ color: 0x150f1c, roughness: 1 });
  const wall = new T.Mesh(new T.PlaneGeometry(12, 7), wallMat);
  wall.position.set(0, 2.6, -4.0);
  wall.receiveShadow = true;
  scene.add(wall);

  const floorMat = new T.MeshStandardMaterial({ color: 0x1c1422, roughness: 0.9, metalness: 0.1 });
  const floor = new T.Mesh(new T.PlaneGeometry(12, 14), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -2);
  floor.receiveShadow = true;
  scene.add(floor);

  // turntable: a spinning platter facing the player, speed tied to combo
  const deck = new T.Group();
  deck.position.set(0, 0.62, -1.6);
  const platter = new T.Mesh(
    new T.CylinderGeometry(0.42, 0.42, 0.05, 40),
    new T.MeshStandardMaterial({ color: 0x14101a, roughness: 0.5, metalness: 0.4 })
  );
  platter.castShadow = true;
  deck.add(platter);
  const platterRing = new T.Mesh(
    new T.TorusGeometry(0.42, 0.012, 10, 40),
    new T.MeshStandardMaterial({ color: 0x4ad0ff, emissive: 0x1a5570, roughness: 0.4 })
  );
  platterRing.rotation.x = Math.PI / 2;
  platterRing.position.y = 0.026;
  deck.add(platterRing);
  const tonearm = new T.Mesh(
    new T.BoxGeometry(0.5, 0.03, 0.03),
    new T.MeshStandardMaterial({ color: 0xd8d8e0, metalness: 0.7, roughness: 0.3 })
  );
  tonearm.position.set(0.32, 0.05, -0.32);
  tonearm.rotation.y = -0.5;
  deck.add(tonearm);
  scene.add(deck);

  // speaker stacks flanking the deck, tops pulse with the sweep
  const speakerMat = new T.MeshStandardMaterial({ color: 0x1a1220, roughness: 0.85 });
  const speakers = [-1.9, 1.9].map((x) => {
    const spk = new T.Mesh(new T.BoxGeometry(0.55, 1.5, 0.55), speakerMat);
    spk.position.set(x, 0.75, -2.6);
    spk.castShadow = true;
    spk.receiveShadow = true;
    scene.add(spk);
    const cone = new T.Mesh(
      new T.CircleGeometry(0.16, 24),
      new T.MeshStandardMaterial({ color: 0xe04858, emissive: 0x400810, roughness: 0.6 })
    );
    cone.position.set(x, 1.25, -2.32);
    scene.add(cone);
    return cone;
  });

  // suspended neon rail: the beat-match "timing bar" reimagined as a light
  // fixture above the deck. GOOD band + PERFECT band are separate emissive
  // segments so the target zones read at a glance, same proportions as the
  // classic bar (0.44 width GOOD, 0.16 width PERFECT, both centered).
  const railTrack = new T.Mesh(
    new T.BoxGeometry(RAIL_LEN + 0.2, 0.05, 0.05),
    new T.MeshStandardMaterial({ color: 0x2a2030, roughness: 0.7 })
  );
  railTrack.position.copy(RAIL_POS);
  scene.add(railTrack);
  const goodBand = new T.Mesh(
    new T.BoxGeometry(RAIL_LEN * 0.44, 0.09, 0.09),
    new T.MeshStandardMaterial({ color: 0xe0a030, emissive: 0x4a3010, transparent: true, opacity: 0.55, roughness: 0.5 })
  );
  goodBand.position.copy(RAIL_POS);
  scene.add(goodBand);
  const perfectBand = new T.Mesh(
    new T.BoxGeometry(RAIL_LEN * 0.16, 0.11, 0.11),
    new T.MeshStandardMaterial({ color: 0xf4ecd8, emissive: 0x888078, transparent: true, opacity: 0.7, roughness: 0.4 })
  );
  perfectBand.position.copy(RAIL_POS);
  scene.add(perfectBand);

  // hanging support cables, purely cosmetic
  [-RAIL_LEN / 2 - 0.1, RAIL_LEN / 2 + 0.1].forEach((x) => {
    const cable = new T.Mesh(
      new T.CylinderGeometry(0.008, 0.008, 1.1, 6),
      new T.MeshStandardMaterial({ color: 0x241a2a, roughness: 0.9 })
    );
    cable.position.set(x, RAIL_POS.y + 0.55, RAIL_POS.z);
    scene.add(cable);
  });

  // glowing orb: slides along the rail with `pos`, flashes hit color on result
  const orb = new T.Mesh(
    new T.SphereGeometry(0.09, 20, 20),
    new T.MeshStandardMaterial({ color: 0x4ad0ff, emissive: 0x0f3a4a, emissiveIntensity: 1.2, roughness: 0.3 })
  );
  orb.castShadow = true;
  scene.add(orb);
  const orbGlow = new T.PointLight(0x4ad0ff, 0.9, 4);
  scene.add(orbGlow);

  function orbX(p) { return RAIL_POS.x + p * (RAIL_LEN / 2 - 0.05); }
  orb.position.set(orbX(pos), RAIL_POS.y, RAIL_POS.z);
  orbGlow.position.copy(orb.position);

  // lights: dim ambient plus the two accent colors the classic HUD uses
  scene.add(new T.AmbientLight(0x302840, 0.7));
  const spot = new T.SpotLight(0xffe2c0, 0.9, 14, 0.5, 0.5);
  spot.position.set(0, 3.4, -1.0);
  spot.target = deck;
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  scene.add(spot);

  // impact feedback state
  let shakeT = 0;
  let impactRing = null, impactT = 0;

  function onHit(res) {
    score += res.pts;
    combo = res.pts > 0 ? combo + 1 : 0;
    lastHitLabel = res.label;
    orb.material.color.setHex(res.color);
    orb.material.emissive.setHex(res.color);
    orbGlow.color.setHex(res.color);
    shakeT = res.pts > 0 ? 0.16 : 0.22;
    if (impactRing) disposeImpactRing();
    impactRing = new T.Mesh(
      new T.TorusGeometry(0.09, 0.012, 8, 32),
      new T.MeshBasicMaterial({ color: res.color, transparent: true, opacity: 0.9 })
    );
    impactRing.position.copy(orb.position);
    scene.add(impactRing);
    impactT = 0;
    phase = 'result';
    resultTimer = 0.7;
  }

  function disposeImpactRing() {
    if (!impactRing) return;
    scene.remove(impactRing);
    impactRing.geometry.dispose();
    impactRing.material.dispose();
    impactRing = null;
  }

  // Full teardown -- called right before every exitMinigame().
  function cleanup() {
    disposeImpactRing();
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
    scene.clear();
  }
  function leave() { cleanup(); exitMinigame(); }

  return {
    update(dt) {
      t += dt;

      if (phase === 'wait') {
        pos += dir * dt * speed;
        if (pos >= 1) { pos = 1; dir = -1; }
        if (pos <= -1) { pos = -1; dir = 1; }
        if (interactPressed) onHit(hitFor(pos));
      } else if (phase === 'result') {
        resultTimer -= dt;
        if (resultTimer <= 0) {
          if (round >= ROUNDS) { phase = 'done'; }
          else {
            round++; speed += 0.15; pos = -1; dir = 1; phase = 'wait';
            orb.material.color.setHex(0x4ad0ff);
            orb.material.emissive.setHex(0x0f3a4a);
            orbGlow.color.setHex(0x4ad0ff);
            disposeImpactRing();
          }
        }
      } else if (phase === 'done') {
        if (!bestRecorded) { isNewBest = recordMinigameScore('beatmatch', score); bestRecorded = true; }
        if (interactPressed) { leave(); return; }
      }

      orb.position.set(orbX(pos), RAIL_POS.y, RAIL_POS.z);
      orbGlow.position.copy(orb.position);

      // deck spins faster with a hot combo, and pulses on each result
      deck.rotation.y += dt * (0.6 + combo * 0.35);
      const pulse = 0.7 + Math.sin(t * 4) * 0.15;
      speakers.forEach((cone) => { cone.material.emissiveIntensity = pulse; });

      if (impactRing) {
        impactT += dt;
        const k = Math.min(1, impactT / 0.35);
        impactRing.scale.setScalar(1 + k * 3);
        impactRing.material.opacity = 0.9 * (1 - k);
      }

      // camera: dolly in slightly on a result, gentle idle sway, decaying shake
      const wantZ = (phase === 'result' || phase === 'done') ? CAM_Z_IN : CAM_POS.z;
      camZ += (wantZ - camZ) * Math.min(1, dt * 5);
      const sway = Math.sin(t * 0.7) * 0.02;
      camera.position.set(CAM_POS.x + sway, CAM_POS.y + Math.sin(t * 0.9) * 0.01, camZ);
      if (shakeT > 0) {
        shakeT -= dt;
        const s = Math.max(0, shakeT / 0.22) * 0.025;
        camera.position.x += (Math.random() - 0.5) * s;
        camera.position.y += (Math.random() - 0.5) * s;
      }
      camera.lookAt(RAIL_POS.x, RAIL_POS.y - 0.3, RAIL_POS.z);

      // X always bails out early, no matter the phase
      if (buyPressed) { leave(); return; }
    },
    draw() {
      renderer.render(scene, camera);
      ctx.drawImage(bm3DCanvas, 0, 0);

      // HUD: same layout and styling as the classic version
      const cx = VIEW_W / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#4ad0ff';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('BEAT MATCH 3D', cx, 60);
      ctx.fillStyle = '#f4ecd8';
      ctx.font = '15px monospace';
      ctx.fillText(`SCORE ${score}   BEAT ${Math.min(round, ROUNDS)}/${ROUNDS}   COMBO x${combo}`, cx, 84);

      ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#4ad0ff' : '#f4ecd8';
      ctx.font = 'bold 17px monospace';
      if (phase === 'wait') ctx.fillText('- TAP E ON THE BEAT -', cx, 520);
      else if (phase === 'result') ctx.fillText(lastHitLabel, cx, 520);
      else if (phase === 'done') ctx.fillText(`FINAL SCORE: ${score} - PRESS E TO LEAVE`, cx, 520);

      if (phase === 'done') {
        ctx.font = '14px monospace';
        ctx.fillStyle = isNewBest ? '#8cff5f' : '#9a90a8';
        ctx.fillText(isNewBest ? 'NEW BEST!' : `BEST: ${bestFor('beatmatch')}`, cx, 542);
      }

      ctx.fillStyle = '#6a6070';
      ctx.font = '13px monospace';
      ctx.fillText('X to walk away anytime', cx, phase === 'done' ? 562 : 544);
    },
  };
}

// Beat Jam: a freeform MPC-style pad session, not a scored mini-game at
// all -- four beat pads (Kick, Snare, Hi-Hat, Keys) arranged in a cross
// that lines up 1:1 with the d-pad/arrow keys, so \u25B2\u25BC\u25C0\u25B6
// hits the pad in that same screen direction. Each pad also answers a
// direct tap/click right on the pad itself (see onPointerDown below and
// its hookup on the shared canvas pointerdown handler), since "hit the
// pad" is the whole point of an MPC and touch players shouldn't have to
// find the d-pad for it. No rounds, no win/lose -- just a 30-second
// freestyle window to vibe out before it auto-exits back to 'play'.
// Reuses the same kick/snare/hat synths the background music engine
// already has (see the `music` object above) instead of any new assets,
// plus a short rotating note run for the Keys pad so mashing it still
// sounds musical instead of one dead note on repeat.
function createBeatJamGame() {
  const TIME_LIMIT = 30;
  // Pads enlarged for mobile touch play: pushed down a bit from the header
  // (title/hits/timer stay put at the top) and grown as large as the
  // available vertical space allows, with the "TAP A PAD" footer text
  // moved further down to make room. OFFSET (center-to-pad distance) is
  // kept just above PAD (pad width/height) so the four pads sit with a
  // small gap between them and never overlap.
  const cx = VIEW_W / 2, cy = 330;
  const OFFSET = 126, PAD = 116;
  const KEY_NOTES = [60, 63, 65, 67, 70]; // short minor-pentatonic run for the Keys pad

  const PADS = [
    { id: 'snare', label: 'SNARE',  hint: '\u25B2', key: 'arrowup',    dx: 0,       dy: -OFFSET, color: '#4ad0ff', flash: 0 },
    { id: 'kick',  label: 'KICK',   hint: '\u25BC', key: 'arrowdown',  dx: 0,       dy: OFFSET,  color: '#e0603a', flash: 0 },
    { id: 'hihat', label: 'HI-HAT', hint: '\u25C0', key: 'arrowleft',  dx: -OFFSET, dy: 0,       color: '#e0b040', flash: 0 },
    { id: 'keys',  label: 'KEYS',   hint: '\u25B6', key: 'arrowright', dx: OFFSET,  dy: 0,       color: '#8cff5f', flash: 0 },
  ];

  let timeLeft = TIME_LIMIT;
  let hits = 0;
  let keyIdx = 0;
  let phase = 'jam'; // jam | done
  const prevKey = {};

  function triggerPad(p) {
    p.flash = 1;
    hits++;
    if (!music.ctx) return;
    const t = music.ctx.currentTime + 0.02;
    if (p.id === 'kick') music.kick(t);
    else if (p.id === 'snare') music.snare(t);
    else if (p.id === 'hihat') music.hat(t, false, 0.16);
    else if (p.id === 'keys') {
      music.note(t, 'triangle', KEY_NOTES[keyIdx % KEY_NOTES.length], 0.22, 0.09, 0.08);
      keyIdx++;
    }
  }

  function padAt(vx, vy) {
    return PADS.find((p) => {
      const x = cx + p.dx, y = cy + p.dy;
      return Math.abs(vx - x) < PAD / 2 && Math.abs(vy - y) < PAD / 2;
    });
  }

  return {
    // Called by the shared canvas pointerdown handler with view-space
    // (960x600) coordinates -- lets a mouse click or touch tap land
    // directly on a pad, same as pressing its matching arrow key.
    onPointerDown(vx, vy) {
      if (phase !== 'jam') return;
      const p = padAt(vx, vy);
      if (p) triggerPad(p);
    },
    update(dt) {
      if (buyPressed) { exitMinigame(); return; }

      if (phase === 'jam') {
        timeLeft -= dt;
        if (timeLeft <= 0) { timeLeft = 0; phase = 'done'; }

        PADS.forEach((p) => {
          const down = !!keys[p.key];
          if (down && !prevKey[p.key]) triggerPad(p);
          prevKey[p.key] = down;
          p.flash = Math.max(0, p.flash - dt * 3.2);
        });
      } else if (phase === 'done') {
        if (interactPressed) exitMinigame();
      }
    },
    draw() {
      ctx.fillStyle = 'rgba(8,6,12,0.9)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#e0b040';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('BEAT JAM', cx, 56);
      ctx.fillStyle = '#f4ecd8';
      ctx.font = '15px monospace';
      ctx.fillText(`HITS ${hits}`, cx, 78);

      // countdown bar
      const barW = 260, barX = cx - barW / 2, barY = 92;
      ctx.fillStyle = 'rgba(244,236,216,0.15)';
      ctx.fillRect(barX, barY, barW, 8);
      const frac = timeLeft / TIME_LIMIT;
      ctx.fillStyle = frac > 0.3 ? '#8cff5f' : '#e0603a';
      ctx.fillRect(barX, barY, barW * Math.max(0, frac), 8);
      ctx.fillStyle = '#f4ecd8';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`${Math.ceil(timeLeft)}s`, cx, barY + 24);

      // MPC-style pad body behind the four pads
      const bodyR = OFFSET + PAD / 2 + 20;
      ctx.fillStyle = '#241a2a';
      ctx.fillRect(cx - bodyR, cy - bodyR, bodyR * 2, bodyR * 2);
      ctx.strokeStyle = '#5a4a6a';
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - bodyR, cy - bodyR, bodyR * 2, bodyR * 2);

      PADS.forEach((p) => {
        const x = cx + p.dx, y = cy + p.dy;
        const lit = p.flash > 0;
        ctx.globalAlpha = lit ? 0.5 + p.flash * 0.5 : 1;
        ctx.fillStyle = lit ? p.color : 'rgba(244,236,216,0.08)';
        ctx.fillRect(x - PAD / 2, y - PAD / 2, PAD, PAD);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = lit ? p.color : 'rgba(244,236,216,0.35)';
        ctx.lineWidth = lit ? 3 : 1.5;
        ctx.strokeRect(x - PAD / 2, y - PAD / 2, PAD, PAD);

        ctx.fillStyle = lit ? '#181418' : '#f4ecd8';
        ctx.font = 'bold 22px monospace';
        ctx.fillText(p.label, x, y + 8);
        ctx.font = '20px monospace';
        ctx.fillText(p.hint, x, y - 26);
      });

      ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#8cff5f' : '#f4ecd8';
      ctx.font = 'bold 17px monospace';
      if (phase === 'jam') ctx.fillText('- \u25B2\u25BC\u25C0\u25B6 OR TAP A PAD TO PLAY -', cx, 562);
      else ctx.fillText("TIME'S UP! NICE SET - PRESS E TO LEAVE", cx, 562);

      ctx.fillStyle = '#6a6070';
      ctx.font = '13px monospace';
      ctx.fillText('X to walk away anytime', cx, 584);
    },
  };
}

// ---- beat jam mode chooser --------------------------------------------------
function createBeatJamModeSelect() {
  return createModeSelectMenu({
    title: 'BEAT JAM',
    pickLabel: 'PICK YOUR RIG',
    classicSub: 'The original flat four-pad MPC',
    threeDSub: 'Get hands-on with the machine -- full 3D',
    createClassic: () => createBeatJamGame(),
    createThreeD: () => createBeatJam3DGame(),
  });
}

// ---- Beat Jam 3D --------------------------------------------------------------
// The Three.js remake of Beat Jam. Identical freeform contract to the
// classic version -- same four pads, same d-pad/arrow-key mapping, same
// kick/snare/hat/keys synths, same 30-second no-score jam window -- only
// the rendering changed: a real drum-machine chassis on a stand with four
// physical pads that depress and light up when hit, instead of flat
// squares. onPointerDown keeps using the exact same view-space hit zones
// as the classic version (see padAt()) so touch play is untouched; only
// what's drawn under those zones is new. Renders to an offscreen WebGL
// canvas (see getMinigame3DRenderer()) blitted into the main 2D canvas
// each frame, so input handling, CSS scaling, and the rAF loop are all
// untouched, and the HUD is drawn over the blit with the same monospace
// styling every other mini-game uses.
function createBeatJam3DGame() {
  const T = window.THREE;
  const { renderer, canvas: jam3DCanvas } = getMinigame3DRenderer('beatjam');

  const TIME_LIMIT = 30;
  const cx = VIEW_W / 2, cy = 330;
  const OFFSET = 126, PAD = 116;
  const KEY_NOTES = [60, 63, 65, 67, 70];

  const PADS = [
    { id: 'snare', label: 'SNARE',  hint: '\u25B2', key: 'arrowup',    dx: 0,       dy: -OFFSET, color: 0x4ad0ff, flash: 0 },
    { id: 'kick',  label: 'KICK',   hint: '\u25BC', key: 'arrowdown',  dx: 0,       dy: OFFSET,  color: 0xe0603a, flash: 0 },
    { id: 'hihat', label: 'HI-HAT', hint: '\u25C0', key: 'arrowleft',  dx: -OFFSET, dy: 0,       color: 0xe0b040, flash: 0 },
    { id: 'keys',  label: 'KEYS',   hint: '\u25B6', key: 'arrowright', dx: OFFSET,  dy: 0,       color: 0x8cff5f, flash: 0 },
  ];

  let timeLeft = TIME_LIMIT;
  let hits = 0;
  let keyIdx = 0;
  let phase = 'jam'; // jam | done
  let t = 0;
  const prevKey = {};

  // ---- scene ----
  const MPC_POS = new T.Vector3(0, 1.25, -2.5);
  const scene = new T.Scene();
  scene.background = new T.Color(0x0c0a12);
  scene.fog = new T.Fog(0x0c0a12, 6, 16);

  const camera = new T.PerspectiveCamera(50, VIEW_W / VIEW_H, 0.1, 30);
  const CAM_POS = new T.Vector3(0, 1.3, 0.85);
  camera.position.copy(CAM_POS);
  camera.lookAt(MPC_POS.x, MPC_POS.y, MPC_POS.z);

  const wall = new T.Mesh(
    new T.PlaneGeometry(12, 7),
    new T.MeshStandardMaterial({ color: 0x18101e, roughness: 1 })
  );
  wall.position.set(0, 2.6, -4.0);
  wall.receiveShadow = true;
  scene.add(wall);
  const floor = new T.Mesh(
    new T.PlaneGeometry(12, 14),
    new T.MeshStandardMaterial({ color: 0x201828, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -2);
  floor.receiveShadow = true;
  scene.add(floor);

  // drum-machine chassis: a dark panel with a raised bezel, facing the
  // player like a wall-mounted MPC -- keeps the cross layout screen-facing
  // so it maps cleanly onto the same tap zones the classic version uses.
  const chassisGroup = new T.Group();
  chassisGroup.position.copy(MPC_POS);
  scene.add(chassisGroup);
  const bezel = new T.Mesh(
    new T.BoxGeometry(1.3, 1.3, 0.16),
    new T.MeshStandardMaterial({ color: 0x241a2a, roughness: 0.6, metalness: 0.25 })
  );
  bezel.castShadow = true;
  bezel.receiveShadow = true;
  chassisGroup.add(bezel);
  const bezelTrim = new T.Mesh(
    new T.TorusGeometry(0.58, 0.02, 8, 4),
    new T.MeshStandardMaterial({ color: 0x5a4a6a, roughness: 0.4, metalness: 0.5 })
  );
  bezelTrim.rotation.z = Math.PI / 4;
  bezelTrim.position.z = 0.081;
  chassisGroup.add(bezelTrim);

  // one pad per PADS entry, positioned proportionally to the classic
  // OFFSET layout and colored to match; each depresses on hit
  const WORLD_OFFSET = 0.32, WORLD_PAD = 0.42;
  const padMeshes = {};
  PADS.forEach((p) => {
    const mat = new T.MeshStandardMaterial({ color: 0x2c2436, emissive: 0x000000, roughness: 0.55, metalness: 0.15 });
    const pad = new T.Mesh(new T.BoxGeometry(WORLD_PAD, WORLD_PAD, 0.1), mat);
    pad.position.set(
      (p.dx / OFFSET) * WORLD_OFFSET,
      -(p.dy / OFFSET) * WORLD_OFFSET,
      0.08 + 0.05
    );
    pad.castShadow = true;
    pad.receiveShadow = true;
    chassisGroup.add(pad);
    padMeshes[p.id] = pad;
  });

  // lights: dim ambient + a spot on the chassis, plus a soft rim light
  scene.add(new T.AmbientLight(0x302840, 0.75));
  const spot = new T.SpotLight(0xffe2c0, 0.9, 14, 0.55, 0.5);
  spot.position.set(0, 3.2, -1.4);
  spot.target = chassisGroup;
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  scene.add(spot);

  let shakeT = 0;
  let flashRings = [];

  function triggerPad(p) {
    p.flash = 1;
    hits++;
    const mesh = padMeshes[p.id];
    mesh.userData.pressT = 0.001; // kicks off the press-in animation
    const worldPos = new T.Vector3();
    mesh.getWorldPosition(worldPos);
    worldPos.z += 0.06;
    const ring = new T.Mesh(
      new T.TorusGeometry(0.22, 0.012, 8, 28),
      new T.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.9 })
    );
    ring.position.copy(worldPos);
    scene.add(ring);
    flashRings.push({ mesh: ring, life: 0 });
    shakeT = Math.min(shakeT + 0.05, 0.14);

    if (!music.ctx) return;
    const time = music.ctx.currentTime + 0.02;
    if (p.id === 'kick') music.kick(time);
    else if (p.id === 'snare') music.snare(time);
    else if (p.id === 'hihat') music.hat(time, false, 0.16);
    else if (p.id === 'keys') {
      music.note(time, 'triangle', KEY_NOTES[keyIdx % KEY_NOTES.length], 0.22, 0.09, 0.08);
      keyIdx++;
    }
  }

  function padAt(vx, vy) {
    return PADS.find((p) => {
      const x = cx + p.dx, y = cy + p.dy;
      return Math.abs(vx - x) < PAD / 2 && Math.abs(vy - y) < PAD / 2;
    });
  }

  // Full teardown -- called right before every exitMinigame().
  function cleanup() {
    flashRings.forEach((r) => { scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); });
    flashRings = [];
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
    scene.clear();
  }
  function leave() { cleanup(); exitMinigame(); }

  return {
    // Same view-space hit zones as the classic version -- see padAt() above.
    onPointerDown(vx, vy) {
      if (phase !== 'jam') return;
      const p = padAt(vx, vy);
      if (p) triggerPad(p);
    },
    update(dt) {
      t += dt;
      if (buyPressed) { leave(); return; }

      if (phase === 'jam') {
        timeLeft -= dt;
        if (timeLeft <= 0) { timeLeft = 0; phase = 'done'; }

        PADS.forEach((p) => {
          const down = !!keys[p.key];
          if (down && !prevKey[p.key]) triggerPad(p);
          prevKey[p.key] = down;
          p.flash = Math.max(0, p.flash - dt * 3.2);
        });
      } else if (phase === 'done') {
        if (interactPressed) { leave(); return; }
      }

      // pads glow with their color while lit and ease back to neutral,
      // with a quick press-in/out motion driven by the same flash timer
      PADS.forEach((p) => {
        const mesh = padMeshes[p.id];
        mesh.material.emissive.setHex(p.flash > 0 ? p.color : 0x000000);
        mesh.material.emissiveIntensity = p.flash;
        const restZ = 0.08 + 0.05;
        const pressedZ = restZ - 0.035;
        const targetZ = p.flash > 0.6 ? pressedZ : restZ;
        mesh.position.z += (targetZ - mesh.position.z) * Math.min(1, dt * 14);
      });

      flashRings = flashRings.filter((r) => {
        r.life += dt;
        const k = Math.min(1, r.life / 0.35);
        r.mesh.scale.setScalar(1 + k * 2.4);
        r.mesh.material.opacity = 0.9 * (1 - k);
        if (k >= 1) { scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); return false; }
        return true;
      });

      // gentle idle sway plus a tiny shake on each hit, decaying fast so
      // rapid mashing reads as a steady vibration rather than a jolt
      const sway = Math.sin(t * 0.55) * 0.012;
      camera.position.set(CAM_POS.x + sway, CAM_POS.y + Math.sin(t * 0.75) * 0.007, CAM_POS.z);
      if (shakeT > 0) {
        shakeT -= dt;
        const s = Math.max(0, shakeT / 0.14) * 0.015;
        camera.position.x += (Math.random() - 0.5) * s;
        camera.position.y += (Math.random() - 0.5) * s;
      }
      camera.lookAt(MPC_POS.x, MPC_POS.y, MPC_POS.z);
    },
    draw() {
      renderer.render(scene, camera);
      ctx.drawImage(jam3DCanvas, 0, 0);

      // HUD: same layout and styling as the classic version
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e0b040';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('BEAT JAM 3D', cx, 56);
      ctx.fillStyle = '#f4ecd8';
      ctx.font = '15px monospace';
      ctx.fillText(`HITS ${hits}`, cx, 78);

      const barW = 260, barX = cx - barW / 2, barY = 92;
      ctx.fillStyle = 'rgba(244,236,216,0.15)';
      ctx.fillRect(barX, barY, barW, 8);
      const frac = timeLeft / TIME_LIMIT;
      ctx.fillStyle = frac > 0.3 ? '#8cff5f' : '#e0603a';
      ctx.fillRect(barX, barY, barW * Math.max(0, frac), 8);
      ctx.fillStyle = '#f4ecd8';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`${Math.ceil(timeLeft)}s`, cx, barY + 24);

      // pad labels/hints over the 3D chassis, same positions as the
      // classic version's flat squares
      PADS.forEach((p) => {
        const x = cx + p.dx, y = cy + p.dy;
        const lit = p.flash > 0;
        ctx.fillStyle = lit ? '#181418' : '#f4ecd8';
        ctx.globalAlpha = lit ? 0.5 + p.flash * 0.5 : 0.9;
        ctx.font = 'bold 20px monospace';
        ctx.fillText(p.label, x, y + 8);
        ctx.font = '18px monospace';
        ctx.fillText(p.hint, x, y - 26);
        ctx.globalAlpha = 1;
      });

      ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#8cff5f' : '#f4ecd8';
      ctx.font = 'bold 17px monospace';
      if (phase === 'jam') ctx.fillText('- \u25B2\u25BC\u25C0\u25B6 OR TAP A PAD TO PLAY -', cx, 562);
      else ctx.fillText("TIME'S UP! NICE SET - PRESS E TO LEAVE", cx, 562);

      ctx.fillStyle = '#6a6070';
      ctx.font = '13px monospace';
      ctx.fillText('X to walk away anytime', cx, 584);
    },
  };
}

// Whack-a-Pigeon: a pigeon pops up in one of six holes in the church's
// choir-loft ledge and lingers for a shrinking window; tap E while it's up
// to whack it, scored by reaction speed (same PERFECT/GOOD/OK banding as
// Beat Match). Miss the window and it flies off with nothing. Same
// single-action contract as darts/beatmatch (E to act, X to bail anytime),
// same dark-overlay/monospace look, same round-based scoring-then-auto-exit
// shape. Canvas primitives only -- no images, no new assets.
function createWhackPigeonGame() {
  const ROUNDS = 8;
  let phase = 'up';          // 'up' | 'result' | 'done'
  let round = 1;
  let score = 0;
  let combo = 0;
  let lastHitLabel = '';
  let resultTimer = 0;
  let upTimer = 0;
  let upWindow = 1.1;        // seconds the pigeon stays up; shrinks each round
  let holeIndex = 0;
  let flapT = 0;             // local anim clock for the pigeon bob/flap
  let bestRecorded = false, isNewBest = false;

  const cx = VIEW_W / 2;
  const HOLES = [
    { x: cx - 90, y: 250 }, { x: cx, y: 250 }, { x: cx + 90, y: 250 },
    { x: cx - 90, y: 330 }, { x: cx, y: 330 }, { x: cx + 90, y: 330 },
  ];
  const holeRX = 34, holeRY = 16;

  function pickHole() {
    let next = Math.floor(Math.random() * HOLES.length);
    if (HOLES.length > 1 && next === holeIndex) next = (next + 1) % HOLES.length;
    return next;
  }
  holeIndex = pickHole();

  function hitFor(frac) {
    if (frac <= 0.35) return { label: 'PERFECT!', pts: 50 };
    if (frac <= 0.65) return { label: 'GOOD', pts: 25 };
    return { label: 'OK', pts: 10 };
  }

  function drawPigeon(x, y, bob) {
    // body
    ctx.fillStyle = '#8a8a94';
    ctx.beginPath();
    ctx.ellipse(x, y + bob, 20, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    // head
    ctx.fillStyle = '#a8a8b2';
    ctx.beginPath();
    ctx.arc(x - 14, y + bob - 10, 9, 0, Math.PI * 2);
    ctx.fill();
    // beak
    ctx.fillStyle = '#e0a030';
    ctx.beginPath();
    ctx.moveTo(x - 22, y + bob - 10);
    ctx.lineTo(x - 30, y + bob - 7);
    ctx.lineTo(x - 22, y + bob - 5);
    ctx.closePath();
    ctx.fill();
    // eye
    ctx.fillStyle = '#181418';
    ctx.beginPath();
    ctx.arc(x - 16, y + bob - 12, 1.6, 0, Math.PI * 2);
    ctx.fill();
    // wing, flapping
    const wingLift = Math.sin(flapT * 14) * 6;
    ctx.fillStyle = '#6a6a76';
    ctx.beginPath();
    ctx.ellipse(x + 4, y + bob - wingLift, 12, 8, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // chest highlight
    ctx.fillStyle = '#d8c890';
    ctx.beginPath();
    ctx.ellipse(x - 6, y + bob + 4, 8, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  return {
    update(dt) {
      flapT += dt;
      if (phase === 'up') {
        upTimer += dt;
        if (interactPressed) {
          const res = hitFor(upTimer / upWindow);
          score += res.pts;
          combo++;
          lastHitLabel = res.label;
          phase = 'result';
          resultTimer = 0.6;
        } else if (upTimer >= upWindow) {
          lastHitLabel = 'FLEW OFF!';
          combo = 0;
          phase = 'result';
          resultTimer = 0.6;
        }
      } else if (phase === 'result') {
        resultTimer -= dt;
        if (resultTimer <= 0) {
          if (round >= ROUNDS) { phase = 'done'; }
          else {
            round++;
            upWindow = Math.max(0.5, upWindow - 0.07);
            holeIndex = pickHole();
            upTimer = 0;
            phase = 'up';
          }
        }
      } else if (phase === 'done') {
        if (!bestRecorded) { isNewBest = recordMinigameScore('whackpigeon', score); bestRecorded = true; }
        if (interactPressed) exitMinigame();
      }
      // X always bails out early, no matter the phase
      if (buyPressed) exitMinigame();
    },
    draw() {
      ctx.fillStyle = 'rgba(8,6,12,0.9)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#8cff5f';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('WHACK-A-PIGEON', cx, 60);
      ctx.fillStyle = '#f4ecd8';
      ctx.font = '15px monospace';
      ctx.fillText(`SCORE ${score}   ROUND ${Math.min(round, ROUNDS)}/${ROUNDS}   COMBO x${combo}`, cx, 84);

      // ledge + holes
      ctx.fillStyle = '#3a2840';
      ctx.fillRect(cx - 160, 200, 320, 180);
      ctx.strokeStyle = '#241a2a';
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - 160, 200, 320, 180);

      HOLES.forEach((h, i) => {
        ctx.fillStyle = '#181418';
        ctx.beginPath();
        ctx.ellipse(h.x, h.y, holeRX, holeRY, 0, 0, Math.PI * 2);
        ctx.fill();

        if (i === holeIndex && (phase === 'up' || (phase === 'result' && lastHitLabel !== 'FLEW OFF!'))) {
          const bob = Math.sin(flapT * 10) * 3;
          drawPigeon(h.x, h.y - 14, bob);
        }

        // countdown ring around the active hole while it's up, so players
        // can gauge how much time is left without needing a number
        if (i === holeIndex && phase === 'up') {
          const frac = 1 - upTimer / upWindow;
          ctx.strokeStyle = frac > 0.35 ? '#8cff5f' : '#e0603a';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(h.x, h.y, holeRX + 6, holeRY + 6, 0, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
          ctx.stroke();
        }
      });

      ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#8cff5f' : '#f4ecd8';
      ctx.font = 'bold 17px monospace';
      if (phase === 'up') ctx.fillText('- TAP E TO WHACK IT -', cx, 420);
      else if (phase === 'result') ctx.fillText(lastHitLabel, cx, 420);
      else if (phase === 'done') ctx.fillText(`FINAL SCORE: ${score} - PRESS E TO LEAVE`, cx, 420);

      if (phase === 'done') {
        ctx.font = '14px monospace';
        ctx.fillStyle = isNewBest ? '#8cff5f' : '#9a90a8';
        ctx.fillText(isNewBest ? 'NEW BEST!' : `BEST: ${bestFor('whackpigeon')}`, cx, 438);
      }

      ctx.fillStyle = '#6a6070';
      ctx.font = '13px monospace';
      ctx.fillText('X to walk away anytime', cx, phase === 'done' ? 456 : 444);
    },
  };
}

// ---- whack-a-pigeon mode chooser -------------------------------------------
function createWhackPigeonModeSelect() {
  return createModeSelectMenu({
    title: 'WHACK-A-PIGEON',
    pickLabel: 'PICK YOUR LOFT',
    classicSub: 'The original flat six-hole ledge',
    threeDSub: 'Get up in the rafters -- full 3D',
    createClassic: () => createWhackPigeonGame(),
    createThreeD: () => createWhackPigeon3DGame(),
  });
}

// ---- Whack-a-Pigeon 3D -------------------------------------------------------
// The Three.js remake of Whack-a-Pigeon. Identical gameplay contract to the
// classic version -- same PERFECT/GOOD/OK reaction banding, same shrinking
// up-window, same round count, same 'whackpigeon' trophy -- only the
// rendering changed: a real stone choir-loft ledge with six holes you're
// looking into, a low-poly pigeon that pops up and flaps in place of the
// drawn sprite, and a whack that scatters feathers instead of just a hit
// label. Renders to an offscreen WebGL canvas (see getMinigame3DRenderer())
// blitted into the main 2D canvas each frame, so input handling, CSS
// scaling, and the rAF loop are all untouched, and the HUD is drawn over
// the blit with the same monospace styling every other mini-game uses.
function createWhackPigeon3DGame() {
  const T = window.THREE;
  const { renderer, canvas: wap3DCanvas } = getMinigame3DRenderer('whackpigeon');

  // ---- gameplay state: mirrors createWhackPigeonGame exactly
  const ROUNDS = 8;
  let phase = 'up';          // 'up' | 'result' | 'done'
  let round = 1;
  let score = 0;
  let combo = 0;
  let lastHitLabel = '';
  let resultTimer = 0;
  let upTimer = 0;
  let upWindow = 1.1;
  let holeIndex = 0;
  let t = 0;
  let bestRecorded = false, isNewBest = false;

  // 2x3 grid of holes on the ledge, world-space equivalent of the classic
  // screen-space layout (top row / bottom row, left-center-right)
  const HOLES = [
    { dx: -0.5, dy: 0.26 }, { dx: 0, dy: 0.26 }, { dx: 0.5, dy: 0.26 },
    { dx: -0.5, dy: -0.26 }, { dx: 0, dy: -0.26 }, { dx: 0.5, dy: -0.26 },
  ];

  function pickHole() {
    let next = Math.floor(Math.random() * HOLES.length);
    if (HOLES.length > 1 && next === holeIndex) next = (next + 1) % HOLES.length;
    return next;
  }
  holeIndex = pickHole();

  function hitFor(frac) {
    if (frac <= 0.35) return { label: 'PERFECT!', pts: 50 };
    if (frac <= 0.65) return { label: 'GOOD', pts: 25 };
    return { label: 'OK', pts: 10 };
  }

  // ---- scene ----
  const LEDGE_POS = new T.Vector3(0, 1.15, -2.6);
  const scene = new T.Scene();
  scene.background = new T.Color(0x0a0c10);
  scene.fog = new T.Fog(0x0a0c10, 6, 16);

  const camera = new T.PerspectiveCamera(55, VIEW_W / VIEW_H, 0.1, 30);
  const CAM_POS = new T.Vector3(0, 1.35, 0.75);
  const CAM_Z_IN = -0.15;
  let camZ = CAM_POS.z;
  camera.position.copy(CAM_POS);
  camera.lookAt(LEDGE_POS.x, LEDGE_POS.y, LEDGE_POS.z);

  // stone backdrop + floor, cool choir-loft palette
  const wall = new T.Mesh(
    new T.PlaneGeometry(12, 7),
    new T.MeshStandardMaterial({ color: 0x161a1c, roughness: 1 })
  );
  wall.position.set(0, 2.6, -4.0);
  wall.receiveShadow = true;
  scene.add(wall);
  const floor = new T.Mesh(
    new T.PlaneGeometry(12, 14),
    new T.MeshStandardMaterial({ color: 0x1c2020, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -2);
  floor.receiveShadow = true;
  scene.add(floor);

  // ledge: a stone slab with six holes recessed into its face
  const ledgeGroup = new T.Group();
  ledgeGroup.position.copy(LEDGE_POS);
  scene.add(ledgeGroup);
  const ledgeMat = new T.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.85 });
  const slab = new T.Mesh(new T.BoxGeometry(1.9, 1.1, 0.4), ledgeMat);
  slab.castShadow = true;
  slab.receiveShadow = true;
  ledgeGroup.add(slab);

  // hole rims + dark recesses, plus a countdown ring per hole that shrinks
  // and shifts green->red as the up-window runs out
  const holeMeshes = HOLES.map((h) => {
    const recess = new T.Mesh(
      new T.CircleGeometry(0.16, 24),
      new T.MeshStandardMaterial({ color: 0x0c0e10, roughness: 0.9 })
    );
    recess.position.set(h.dx, h.dy, 0.201);
    ledgeGroup.add(recess);
    const rim = new T.Mesh(
      new T.TorusGeometry(0.16, 0.012, 8, 28),
      new T.MeshStandardMaterial({ color: 0x241a2a, roughness: 0.8 })
    );
    rim.position.set(h.dx, h.dy, 0.205);
    ledgeGroup.add(rim);
    const countdown = new T.Mesh(
      new T.TorusGeometry(0.19, 0.01, 8, 28),
      new T.MeshBasicMaterial({ color: 0x8cff5f, transparent: true, opacity: 0 })
    );
    countdown.position.set(h.dx, h.dy, 0.21);
    ledgeGroup.add(countdown);
    return { recess, rim, countdown };
  });

  // pigeon: built from primitives so it needs no new assets, same
  // grey/gold/cream palette the drawn sprite used
  const pigeonMats = {
    body: new T.MeshStandardMaterial({ color: 0x8a8a94, roughness: 0.8 }),
    head: new T.MeshStandardMaterial({ color: 0xa8a8b2, roughness: 0.8 }),
    beak: new T.MeshStandardMaterial({ color: 0xe0a030, roughness: 0.6 }),
    eye: new T.MeshBasicMaterial({ color: 0x181418 }),
    wing: new T.MeshStandardMaterial({ color: 0x6a6a76, roughness: 0.85 }),
    chest: new T.MeshStandardMaterial({ color: 0xd8c890, roughness: 0.8 }),
  };
  function makePigeon() {
    const g = new T.Group();
    const body = new T.Mesh(new T.SphereGeometry(0.11, 16, 12), pigeonMats.body);
    body.scale.set(1, 0.85, 1.15);
    body.castShadow = true;
    g.add(body);
    const head = new T.Mesh(new T.SphereGeometry(0.06, 14, 10), pigeonMats.head);
    head.position.set(0, 0.09, 0.11);
    g.add(head);
    const beak = new T.Mesh(new T.ConeGeometry(0.018, 0.06, 8), pigeonMats.beak);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.08, 0.19);
    g.add(beak);
    const eyeL = new T.Mesh(new T.SphereGeometry(0.01, 8, 8), pigeonMats.eye);
    eyeL.position.set(0.045, 0.1, 0.15);
    g.add(eyeL);
    const eyeR = eyeL.clone();
    eyeR.position.x = -0.045;
    g.add(eyeR);
    const wingL = new T.Mesh(new T.SphereGeometry(0.08, 12, 8), pigeonMats.wing);
    wingL.scale.set(0.6, 1, 1.6);
    wingL.position.set(0.09, 0.02, -0.02);
    g.add(wingL);
    const wingR = wingL.clone();
    wingR.position.x = -0.09;
    g.add(wingR);
    const chest = new T.Mesh(new T.SphereGeometry(0.06, 12, 10), pigeonMats.chest);
    chest.position.set(0, -0.02, 0.1);
    g.add(chest);
    g.userData.wings = [wingL, wingR];
    return g;
  }
  let pigeon = makePigeon();
  ledgeGroup.add(pigeon);
  let popFrac = 0;      // 0 = hidden in hole, 1 = fully popped up
  let flyOffT = 0;       // used only during the 'FLEW OFF!' escape animation

  function placePigeon() {
    const h = HOLES[holeIndex];
    const hiddenY = h.dy - 0.28;
    const upY = h.dy + 0.02;
    const bob = Math.sin(t * 10) * 0.012 * popFrac;
    pigeon.position.set(h.dx, hiddenY + (upY - hiddenY) * popFrac + bob - flyOffT * flyOffT * 0.6, 0.32 + flyOffT * 0.3);
    pigeon.userData.wings.forEach((w, i) => {
      w.rotation.z = Math.sin(t * 16 + i * Math.PI) * 0.5 * (0.4 + popFrac);
    });
  }

  // lights: cool ambient + a warm lantern spot on the ledge, plus the
  // game's green accent as a soft rim light
  scene.add(new T.AmbientLight(0x303840, 0.75));
  const spot = new T.SpotLight(0xffe2c0, 0.95, 14, 0.5, 0.5);
  spot.position.set(0, 3.4, -1.2);
  spot.target = ledgeGroup;
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  scene.add(spot);
  const rim = new T.PointLight(0x8cff5f, 0.4, 6);
  rim.position.set(0, 1.6, -1.8);
  scene.add(rim);

  let shakeT = 0;
  let impactRing = null, impactT = 0;

  function disposeImpactRing() {
    if (!impactRing) return;
    scene.remove(impactRing);
    impactRing.geometry.dispose();
    impactRing.material.dispose();
    impactRing = null;
  }

  // a little feather-burst -- three small flattened spheres flung outward,
  // reusing the wing material so no new assets are needed
  let feathers = [];
  function burstFeathers(worldPos) {
    feathers.forEach((f) => { scene.remove(f.mesh); f.mesh.geometry.dispose(); f.mesh.material.dispose(); });
    feathers = [];
    for (let i = 0; i < 5; i++) {
      const mesh = new T.Mesh(
        new T.SphereGeometry(0.02, 6, 6),
        new T.MeshStandardMaterial({ color: 0x6a6a76, roughness: 0.85, transparent: true, opacity: 1 })
      );
      mesh.scale.set(1, 0.3, 1.6);
      mesh.position.copy(worldPos);
      scene.add(mesh);
      const ang = (i / 5) * Math.PI * 2 + Math.random() * 0.4;
      feathers.push({ mesh, vx: Math.cos(ang) * 0.7, vy: 0.5 + Math.random() * 0.4, vz: Math.sin(ang) * 0.3, life: 0 });
    }
  }

  function whack() {
    const res = hitFor(upTimer / upWindow);
    score += res.pts;
    combo++;
    lastHitLabel = res.label;
    shakeT = res.label === 'PERFECT!' ? 0.22 : 0.12;
    const worldPos = new T.Vector3();
    pigeon.getWorldPosition(worldPos);
    burstFeathers(worldPos);
    disposeImpactRing();
    impactRing = new T.Mesh(
      new T.TorusGeometry(0.1, 0.012, 8, 28),
      new T.MeshBasicMaterial({ color: 0x8cff5f, transparent: true, opacity: 0.9 })
    );
    impactRing.position.copy(worldPos);
    scene.add(impactRing);
    impactT = 0;
    popFrac = 0; // whacked pigeon drops immediately
    phase = 'result';
    resultTimer = 0.6;
  }

  function flyOff() {
    lastHitLabel = 'FLEW OFF!';
    combo = 0;
    shakeT = 0;
    phase = 'result';
    resultTimer = 0.6;
  }

  // Full teardown -- called right before every exitMinigame().
  function cleanup() {
    disposeImpactRing();
    feathers.forEach((f) => { scene.remove(f.mesh); f.mesh.geometry.dispose(); f.mesh.material.dispose(); });
    feathers = [];
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
    scene.clear();
  }
  function leave() { cleanup(); exitMinigame(); }

  return {
    update(dt) {
      t += dt;

      if (phase === 'up') {
        upTimer += dt;
        popFrac = Math.min(1, popFrac + dt * 8); // quick pop-in, cosmetic only
        if (interactPressed) whack();
        else if (upTimer >= upWindow) flyOff();
      } else if (phase === 'result') {
        resultTimer -= dt;
        if (lastHitLabel === 'FLEW OFF!') flyOffT = Math.min(1, flyOffT + dt * 2.2);
        if (resultTimer <= 0) {
          if (round >= ROUNDS) { phase = 'done'; }
          else {
            round++;
            upWindow = Math.max(0.5, upWindow - 0.07);
            holeIndex = pickHole();
            upTimer = 0;
            popFrac = 0;
            flyOffT = 0;
            phase = 'up';
          }
        }
      } else if (phase === 'done') {
        if (!bestRecorded) { isNewBest = recordMinigameScore('whackpigeon', score); bestRecorded = true; }
        if (interactPressed) { leave(); return; }
      }

      placePigeon();
      pigeon.visible = phase !== 'done' && popFrac > 0.01;

      // countdown rings shrink and shift green->red while a hole is active
      holeMeshes.forEach((hm, i) => {
        if (i === holeIndex && phase === 'up') {
          const frac = 1 - upTimer / upWindow;
          hm.countdown.material.opacity = 0.9;
          hm.countdown.scale.setScalar(0.7 + frac * 0.5);
          const col = frac > 0.35 ? 0x8cff5f : 0xe0603a;
          hm.countdown.material.color.setHex(col);
        } else {
          hm.countdown.material.opacity = Math.max(0, hm.countdown.material.opacity - dt * 4);
        }
      });

      feathers.forEach((f) => {
        f.life += dt;
        f.mesh.position.x += f.vx * dt;
        f.mesh.position.y += (f.vy - f.life * 1.8) * dt;
        f.mesh.position.z += f.vz * dt;
        f.mesh.rotation.z += dt * 6;
        f.mesh.material.opacity = Math.max(0, 1 - f.life * 1.3);
      });

      if (impactRing) {
        impactT += dt;
        const k = Math.min(1, impactT / 0.35);
        impactRing.scale.setScalar(1 + k * 2.4);
        impactRing.material.opacity = 0.9 * (1 - k);
      }

      // camera: quick punch-in on a whack, gentle idle sway, decaying shake
      const wantZ = phase === 'result' && lastHitLabel !== 'FLEW OFF!' ? CAM_Z_IN : CAM_POS.z;
      camZ += (wantZ - camZ) * Math.min(1, dt * 6);
      const sway = Math.sin(t * 0.6) * 0.015;
      camera.position.set(CAM_POS.x + sway, CAM_POS.y + Math.sin(t * 0.8) * 0.008, camZ);
      if (shakeT > 0) {
        shakeT -= dt;
        const s = Math.max(0, shakeT / 0.22) * 0.03;
        camera.position.x += (Math.random() - 0.5) * s;
        camera.position.y += (Math.random() - 0.5) * s;
      }
      camera.lookAt(LEDGE_POS.x, LEDGE_POS.y, LEDGE_POS.z);

      // X always bails out early, no matter the phase
      if (buyPressed) { leave(); return; }
    },
    draw() {
      renderer.render(scene, camera);
      ctx.drawImage(wap3DCanvas, 0, 0);

      // HUD: same layout and styling as the classic version
      const cx = VIEW_W / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8cff5f';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('WHACK-A-PIGEON 3D', cx, 60);
      ctx.fillStyle = '#f4ecd8';
      ctx.font = '15px monospace';
      ctx.fillText(`SCORE ${score}   ROUND ${Math.min(round, ROUNDS)}/${ROUNDS}   COMBO x${combo}`, cx, 84);

      ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#8cff5f' : '#f4ecd8';
      ctx.font = 'bold 17px monospace';
      if (phase === 'up') ctx.fillText('- TAP E TO WHACK IT -', cx, 520);
      else if (phase === 'result') ctx.fillText(lastHitLabel, cx, 520);
      else if (phase === 'done') ctx.fillText(`FINAL SCORE: ${score} - PRESS E TO LEAVE`, cx, 520);

      if (phase === 'done') {
        ctx.font = '14px monospace';
        ctx.fillStyle = isNewBest ? '#8cff5f' : '#9a90a8';
        ctx.fillText(isNewBest ? 'NEW BEST!' : `BEST: ${bestFor('whackpigeon')}`, cx, 542);
      }

      ctx.fillStyle = '#6a6070';
      ctx.font = '13px monospace';
      ctx.fillText('X to walk away anytime', cx, phase === 'done' ? 562 : 544);
    },
  };
}

// Crate Digging: a needle sweeps down through a vertical stack of drawn
// record sleeves; tap E to grab whichever one it's over. Every sleeve looks
// the same (plain cardboard) until it's grabbed, then it flips over to
// reveal what was actually inside -- a rare 45, a scratched dud, or
// somebody's mixtape -- same reveal-on-tap trick the shops' own crates use
// (see openDigChoice/keeper.foundLine elsewhere in this file), just turned
// into a timing mini-game. Same single-action contract as the other three
// mini-games above (E to act, X to bail anytime), same dark-overlay/
// monospace look, same round-based scoring-then-auto-exit shape. Canvas
// primitives only -- no images, no new assets.
function createCrateDiggingGame() {
  const ROUNDS = 5;
  const SLOTS = 6; // sleeves in the stack per round
  let phase = 'dig';        // 'dig' | 'result' | 'done'
  let round = 1;
  let score = 0;
  let needlePos = 0, dir = 1; // 0..1 down the stack
  let speed = 0.5;            // ramps up slightly each round, like beatmatch
  let slots = [];
  let grabbedIndex = -1;
  let lastOutcome = null;
  let resultTimer = 0;
  let bestRecorded = false, isNewBest = false;
  const tally = { rare: 0, mixtape: 0, dud: 0 };

  const stackX = VIEW_W / 2 - 100, stackW = 200;
  const stackTop = 130, stackBottom = 400;
  const slotH = (stackBottom - stackTop) / SLOTS;

  // Weighted so rares are genuinely rare, duds are the most common find --
  // matches the "mostly junk, occasionally treasure" feel of the shops'
  // own dig crates.
  const OUTCOMES = [
    { type: 'rare',    label: 'RARE 45!',       sub: 'A genuine find.',            pts: 100, color: '#e0b040', weight: 1 },
    { type: 'mixtape', label: 'SOMEONE\'S MIXTAPE', sub: 'Handwritten label, no track list.', pts: 30, color: '#4870d0', weight: 2 },
    { type: 'dud',     label: 'SCRATCHED DUD',  sub: 'Straight to the bargain bin.', pts: 0,   color: '#6a6070', weight: 3 },
  ];
  function pickOutcome() {
    const total = OUTCOMES.reduce((s, o) => s + o.weight, 0);
    let r = Math.random() * total;
    for (const o of OUTCOMES) { if (r < o.weight) return o; r -= o.weight; }
    return OUTCOMES[OUTCOMES.length - 1];
  }
  function newStack() { slots = Array.from({ length: SLOTS }, pickOutcome); }
  newStack();

  return {
    update(dt) {
      if (phase === 'dig') {
        needlePos += dir * dt * speed;
        if (needlePos >= 1) { needlePos = 1; dir = -1; }
        if (needlePos <= 0) { needlePos = 0; dir = 1; }
        if (interactPressed) {
          grabbedIndex = Math.min(SLOTS - 1, Math.floor(needlePos * SLOTS));
          lastOutcome = slots[grabbedIndex];
          score += lastOutcome.pts;
          tally[lastOutcome.type]++;
          phase = 'result';
          resultTimer = 1.0;
        }
      } else if (phase === 'result') {
        resultTimer -= dt;
        if (resultTimer <= 0) {
          if (round >= ROUNDS) { phase = 'done'; }
          else {
            round++;
            speed += 0.1;
            needlePos = 0; dir = 1;
            grabbedIndex = -1;
            newStack();
            phase = 'dig';
          }
        }
      } else if (phase === 'done') {
        if (!bestRecorded) { isNewBest = recordMinigameScore('cratedig', score); bestRecorded = true; }
        if (interactPressed) exitMinigame();
      }
      // X always bails out early, no matter the phase
      if (buyPressed) exitMinigame();
    },
    draw() {
      ctx.fillStyle = 'rgba(8,6,12,0.9)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#e0b040';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('CRATE DIGGING', VIEW_W / 2, 56);
      ctx.fillStyle = '#f4ecd8';
      ctx.font = '15px monospace';
      ctx.fillText(`SCORE ${score}   DIG ${Math.min(round, ROUNDS)}/${ROUNDS}`, VIEW_W / 2, 78);

      // crate frame around the stack
      ctx.strokeStyle = '#7a5a34';
      ctx.lineWidth = 3;
      ctx.strokeRect(stackX - 10, stackTop - 10, stackW + 20, stackBottom - stackTop + 20);

      // sleeves -- plain cardboard until grabbed (or revealed on the result
      // screen), then flip to their revealed color for a beat
      for (let i = 0; i < SLOTS; i++) {
        const sy = stackTop + i * slotH;
        const revealed = phase !== 'dig' && i === grabbedIndex;
        ctx.fillStyle = revealed ? lastOutcome.color : (i % 2 === 0 ? '#9a8058' : '#8a7048');
        ctx.fillRect(stackX, sy + 2, stackW, slotH - 4);
        ctx.strokeStyle = revealed ? '#181418' : 'rgba(24,20,24,0.4)';
        ctx.lineWidth = revealed ? 2 : 1;
        ctx.strokeRect(stackX, sy + 2, stackW, slotH - 4);
        if (revealed) {
          ctx.fillStyle = '#181418';
          ctx.font = 'bold 14px monospace';
          ctx.fillText(lastOutcome.type === 'rare' ? '\u2605 RARE' : lastOutcome.type === 'mixtape' ? 'MIXTAPE' : 'DUD',
            stackX + stackW / 2, sy + slotH / 2 + 4);
        }
      }

      // sweeping needle, only while actively digging
      if (phase === 'dig') {
        const ny = stackTop + needlePos * (stackBottom - stackTop);
        ctx.strokeStyle = '#e04858';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(stackX - 20, ny);
        ctx.lineTo(stackX + stackW + 20, ny);
        ctx.stroke();
        // little needle tip on the left, like a tonearm
        ctx.fillStyle = '#e04858';
        ctx.beginPath();
        ctx.moveTo(stackX - 20, ny);
        ctx.lineTo(stackX - 32, ny - 6);
        ctx.lineTo(stackX - 32, ny + 6);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#e0b040' : '#f4ecd8';
      ctx.font = 'bold 17px monospace';
      if (phase === 'dig') ctx.fillText('- TAP E TO GRAB ONE -', VIEW_W / 2, 430);
      else if (phase === 'result') {
        ctx.fillText(lastOutcome.label, VIEW_W / 2, 430);
        ctx.fillStyle = '#9a90a8';
        ctx.font = '14px monospace';
        ctx.fillText(lastOutcome.sub, VIEW_W / 2, 448);
      } else if (phase === 'done') {
        ctx.fillText(`FINAL SCORE: ${score} - PRESS E TO LEAVE`, VIEW_W / 2, 430);
        ctx.fillStyle = '#9a90a8';
        ctx.font = '14px monospace';
        ctx.fillText(`${tally.rare} rare 45${tally.rare === 1 ? '' : 's'}, ${tally.mixtape} mixtape${tally.mixtape === 1 ? '' : 's'}, ${tally.dud} dud${tally.dud === 1 ? '' : 's'}`, VIEW_W / 2, 448);
        ctx.fillStyle = isNewBest ? '#8cff5f' : '#9a90a8';
        ctx.fillText(isNewBest ? 'NEW BEST!' : `BEST: ${bestFor('cratedig')}`, VIEW_W / 2, 464);
      }

      ctx.fillStyle = '#6a6070';
      ctx.font = '13px monospace';
      ctx.fillText('X to walk away anytime', VIEW_W / 2, phase === 'dig' ? 454 : 486);
    },
  };
}

// ---- crate digging mode chooser --------------------------------------------
function createCrateDiggingModeSelect() {
  return createModeSelectMenu({
    title: 'CRATE DIGGING',
    pickLabel: 'PICK YOUR CRATE',
    classicSub: 'The original flat sleeve stack',
    threeDSub: 'Get your hands in the crate -- full 3D',
    createClassic: () => createCrateDiggingGame(),
    createThreeD: () => createCrateDigging3DGame(),
  });
}

// ---- Crate Digging 3D -------------------------------------------------------
// The Three.js remake of Crate Digging. Identical gameplay contract to the
// classic version -- same weighted outcome pool, same sweep speed/ramp,
// same round count, same 'cratedig' trophy -- only the rendering changed:
// a real wooden crate holding six record sleeves you're looking down into,
// a tonearm-style needle sweeping down the stack, and a grabbed sleeve that
// pops forward and flips to reveal its color, with feedback scaled to how
// good the find was. Renders to an offscreen WebGL canvas (see
// getMinigame3DRenderer()) blitted into the main 2D canvas each frame, so
// input handling, CSS scaling, and the rAF loop are all untouched, and the
// HUD is drawn over the blit with the same monospace styling every other
// mini-game uses.
function createCrateDigging3DGame() {
  const T = window.THREE;
  const { renderer, canvas: crate3DCanvas } = getMinigame3DRenderer('cratedig');

  // ---- gameplay state: mirrors createCrateDiggingGame exactly
  const ROUNDS = 5;
  const SLOTS = 6;
  let phase = 'dig';        // 'dig' | 'result' | 'done'
  let round = 1;
  let score = 0;
  let needlePos = 0, dir = 1;
  let speed = 0.5;
  let slots = [];
  let grabbedIndex = -1;
  let lastOutcome = null;
  let resultTimer = 0;
  let bestRecorded = false, isNewBest = false;
  let t = 0;
  const tally = { rare: 0, mixtape: 0, dud: 0 };

  const OUTCOMES = [
    { type: 'rare',    label: 'RARE 45!',       sub: 'A genuine find.',            pts: 100, color: 0xe0b040, weight: 1 },
    { type: 'mixtape', label: 'SOMEONE\'S MIXTAPE', sub: 'Handwritten label, no track list.', pts: 30, color: 0x4870d0, weight: 2 },
    { type: 'dud',     label: 'SCRATCHED DUD',  sub: 'Straight to the bargain bin.', pts: 0,   color: 0x6a6070, weight: 3 },
  ];
  function pickOutcome() {
    const total = OUTCOMES.reduce((s, o) => s + o.weight, 0);
    let r = Math.random() * total;
    for (const o of OUTCOMES) { if (r < o.weight) return o; r -= o.weight; }
    return OUTCOMES[OUTCOMES.length - 1];
  }
  function newStack() { slots = Array.from({ length: SLOTS }, pickOutcome); }
  newStack();

  // ---- scene ----
  const CRATE_POS = new T.Vector3(0, 1.15, -2.6);
  const CRATE_W = 1.5, CRATE_H = 1.9;
  const scene = new T.Scene();
  scene.background = new T.Color(0x0c0810);
  scene.fog = new T.Fog(0x0c0810, 6, 16);

  const camera = new T.PerspectiveCamera(52, VIEW_W / VIEW_H, 0.1, 30);
  const CAM_POS = new T.Vector3(0, 1.35, 0.7);
  const CAM_Z_IN = -0.3;
  let camZ = CAM_POS.z;
  camera.position.copy(CAM_POS);
  camera.lookAt(CRATE_POS.x, CRATE_POS.y, CRATE_POS.z);

  // shop backdrop: wall + floor, same purple family as the rest of the world
  const wall = new T.Mesh(
    new T.PlaneGeometry(12, 7),
    new T.MeshStandardMaterial({ color: 0x1a1224, roughness: 1 })
  );
  wall.position.set(0, 2.6, -4.0);
  wall.receiveShadow = true;
  scene.add(wall);
  const floor = new T.Mesh(
    new T.PlaneGeometry(12, 14),
    new T.MeshStandardMaterial({ color: 0x241a28, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -2);
  floor.receiveShadow = true;
  scene.add(floor);

  // wooden crate frame around the stack
  const crateMat = new T.MeshStandardMaterial({ color: 0x7a5a34, roughness: 0.8 });
  const crateGroup = new T.Group();
  crateGroup.position.copy(CRATE_POS);
  scene.add(crateGroup);
  const frameThick = 0.07;
  [
    [0, CRATE_H / 2 + frameThick / 2, 0, CRATE_W + frameThick * 2, frameThick, 0.4],   // top
    [0, -CRATE_H / 2 - frameThick / 2, 0, CRATE_W + frameThick * 2, frameThick, 0.4],  // bottom
    [-CRATE_W / 2 - frameThick / 2, 0, 0, frameThick, CRATE_H, 0.4],                    // left
    [CRATE_W / 2 + frameThick / 2, 0, 0, frameThick, CRATE_H, 0.4],                     // right
  ].forEach(([x, y, z, w, h, d]) => {
    const bar = new T.Mesh(new T.BoxGeometry(w, h, d), crateMat);
    bar.position.set(x, y, z - 0.17);
    bar.castShadow = true;
    bar.receiveShadow = true;
    crateGroup.add(bar);
  });
  const crateBack = new T.Mesh(
    new T.PlaneGeometry(CRATE_W, CRATE_H),
    new T.MeshStandardMaterial({ color: 0x14101a, roughness: 0.9 })
  );
  crateBack.position.set(0, 0, -0.37);
  crateBack.receiveShadow = true;
  crateGroup.add(crateBack);

  // six sleeve slots stacked top to bottom, front face plain cardboard
  // (alternating shades) until grabbed, then flip color to the outcome
  const slotH = CRATE_H / SLOTS;
  const sleeveMeshes = [];
  for (let i = 0; i < SLOTS; i++) {
    const sleeve = new T.Mesh(
      new T.BoxGeometry(CRATE_W - 0.1, slotH - 0.03, 0.16),
      new T.MeshStandardMaterial({ color: i % 2 === 0 ? 0x9a8058 : 0x8a7048, roughness: 0.85 })
    );
    sleeve.position.set(0, CRATE_H / 2 - slotH / 2 - i * slotH, -0.1);
    sleeve.castShadow = true;
    sleeve.receiveShadow = true;
    crateGroup.add(sleeve);
    sleeveMeshes.push(sleeve);
  }

  // sweeping needle: a glowing bar that travels down the crate, with a
  // tonearm-style tip poking out the left side, 1:1 with the classic needle
  const needle = new T.Mesh(
    new T.BoxGeometry(CRATE_W + 0.5, 0.02, 0.02),
    new T.MeshBasicMaterial({ color: 0xe04858 })
  );
  crateGroup.add(needle);
  const needleTip = new T.Mesh(
    new T.ConeGeometry(0.06, 0.14, 3),
    new T.MeshBasicMaterial({ color: 0xe04858 })
  );
  needleTip.rotation.z = Math.PI / 2;
  crateGroup.add(needleTip);

  function needleY() { return CRATE_H / 2 - needlePos * CRATE_H; }
  needle.position.y = needleY();
  needleTip.position.set(-CRATE_W / 2 - 0.32, needleY(), 0);

  // lights: warm spot into the crate, dim ambient, matching darts' palette
  scene.add(new T.AmbientLight(0x352c40, 0.8));
  const spot = new T.SpotLight(0xffe2c0, 1.0, 14, 0.5, 0.45);
  spot.position.set(0, 3.4, -1.2);
  spot.target = crateGroup;
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  scene.add(spot);

  let shakeT = 0;
  let impactRing = null, impactT = 0;

  function disposeImpactRing() {
    if (!impactRing) return;
    scene.remove(impactRing);
    impactRing.geometry.dispose();
    impactRing.material.dispose();
    impactRing = null;
  }

  function grabSlot() {
    grabbedIndex = Math.min(SLOTS - 1, Math.floor(needlePos * SLOTS));
    lastOutcome = slots[grabbedIndex];
    score += lastOutcome.pts;
    tally[lastOutcome.type]++;

    const mesh = sleeveMeshes[grabbedIndex];
    mesh.material.color.setHex(lastOutcome.color);
    mesh.material.emissive = new T.Color(lastOutcome.color);
    mesh.material.emissiveIntensity = 0.3;

    // rare finds pop forward harder and shake the camera more -- the "feel"
    // scales with how good the pull was, same spirit as darts' impact shake
    const popZ = lastOutcome.type === 'rare' ? 0.32 : lastOutcome.type === 'mixtape' ? 0.2 : 0.1;
    mesh.userData.popZ = popZ;
    shakeT = lastOutcome.type === 'rare' ? 0.3 : lastOutcome.type === 'mixtape' ? 0.16 : 0.08;

    disposeImpactRing();
    const worldPos = new T.Vector3();
    mesh.getWorldPosition(worldPos);
    impactRing = new T.Mesh(
      new T.TorusGeometry(0.14, 0.014, 8, 32),
      new T.MeshBasicMaterial({ color: lastOutcome.color, transparent: true, opacity: 0.9 })
    );
    impactRing.position.copy(worldPos);
    impactRing.position.z += 0.05;
    scene.add(impactRing);
    impactT = 0;

    phase = 'result';
    resultTimer = 1.0;
  }

  function resetSlot(i) {
    const mesh = sleeveMeshes[i];
    mesh.material.color.setHex(i % 2 === 0 ? 0x9a8058 : 0x8a7048);
    mesh.material.emissiveIntensity = 0;
    mesh.userData.popZ = 0;
    mesh.position.z = -0.1;
  }

  // Full teardown -- called right before every exitMinigame().
  function cleanup() {
    disposeImpactRing();
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
    scene.clear();
  }
  function leave() { cleanup(); exitMinigame(); }

  return {
    update(dt) {
      t += dt;

      if (phase === 'dig') {
        needlePos += dir * dt * speed;
        if (needlePos >= 1) { needlePos = 1; dir = -1; }
        if (needlePos <= 0) { needlePos = 0; dir = 1; }
        if (interactPressed) grabSlot();
      } else if (phase === 'result') {
        resultTimer -= dt;
        if (resultTimer <= 0) {
          if (round >= ROUNDS) { phase = 'done'; }
          else {
            resetSlot(grabbedIndex);
            round++;
            speed += 0.1;
            needlePos = 0; dir = 1;
            grabbedIndex = -1;
            newStack();
            disposeImpactRing();
            phase = 'dig';
          }
        }
      } else if (phase === 'done') {
        if (!bestRecorded) { isNewBest = recordMinigameScore('cratedig', score); bestRecorded = true; }
        if (interactPressed) { leave(); return; }
      }

      needle.position.y = needleY();
      needle.visible = phase === 'dig';
      needleTip.position.y = needleY();
      needleTip.visible = phase === 'dig';

      // grabbed sleeve eases forward out of the crate, then eases back on reset
      sleeveMeshes.forEach((mesh) => {
        const targetZ = -0.1 + (mesh.userData.popZ || 0);
        mesh.position.z += (targetZ - mesh.position.z) * Math.min(1, dt * 8);
      });

      if (impactRing) {
        impactT += dt;
        const k = Math.min(1, impactT / 0.4);
        impactRing.scale.setScalar(1 + k * 3);
        impactRing.material.opacity = 0.9 * (1 - k);
      }

      // camera: dolly in on a result, gentle idle sway, decaying impact shake
      const wantZ = (phase === 'result' || phase === 'done') ? CAM_Z_IN : CAM_POS.z;
      camZ += (wantZ - camZ) * Math.min(1, dt * 5);
      const sway = Math.sin(t * 0.6) * 0.015;
      camera.position.set(CAM_POS.x + sway, CAM_POS.y + Math.sin(t * 0.8) * 0.008, camZ);
      if (shakeT > 0) {
        shakeT -= dt;
        const s = Math.max(0, shakeT / 0.3) * 0.035;
        camera.position.x += (Math.random() - 0.5) * s;
        camera.position.y += (Math.random() - 0.5) * s;
      }
      camera.lookAt(CRATE_POS.x, CRATE_POS.y, CRATE_POS.z);

      // X always bails out early, no matter the phase
      if (buyPressed) { leave(); return; }
    },
    draw() {
      renderer.render(scene, camera);
      ctx.drawImage(crate3DCanvas, 0, 0);

      // HUD: same layout and styling as the classic version
      const cx = VIEW_W / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e0b040';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('CRATE DIGGING 3D', cx, 56);
      ctx.fillStyle = '#f4ecd8';
      ctx.font = '15px monospace';
      ctx.fillText(`SCORE ${score}   DIG ${Math.min(round, ROUNDS)}/${ROUNDS}`, cx, 78);

      ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#e0b040' : '#f4ecd8';
      ctx.font = 'bold 17px monospace';
      if (phase === 'dig') ctx.fillText('- TAP E TO GRAB ONE -', cx, 520);
      else if (phase === 'result') {
        ctx.fillText(lastOutcome.label, cx, 520);
        ctx.fillStyle = '#9a90a8';
        ctx.font = '14px monospace';
        ctx.fillText(lastOutcome.sub, cx, 538);
      } else if (phase === 'done') {
        ctx.fillText(`FINAL SCORE: ${score} - PRESS E TO LEAVE`, cx, 520);
        ctx.fillStyle = '#9a90a8';
        ctx.font = '14px monospace';
        ctx.fillText(`${tally.rare} rare 45${tally.rare === 1 ? '' : 's'}, ${tally.mixtape} mixtape${tally.mixtape === 1 ? '' : 's'}, ${tally.dud} dud${tally.dud === 1 ? '' : 's'}`, cx, 538);
        ctx.fillStyle = isNewBest ? '#8cff5f' : '#9a90a8';
        ctx.fillText(isNewBest ? 'NEW BEST!' : `BEST: ${bestFor('cratedig')}`, cx, 554);
      }

      ctx.fillStyle = '#6a6070';
      ctx.font = '13px monospace';
      ctx.fillText('X to walk away anytime', cx, phase === 'dig' ? 544 : 576);
    },
  };
}

// Speed Sweep: literally sweeping the shop floor. A broom icon slides left/
// right along the floor (held ◀▶ / A-D, or the touch d-pad -- same `keys`
// object the overworld movement already reads from), and tapping E sweeps
// away any dust pile within reach of the bristles. Piles keep spawning at
// random spots until the clock runs out -- simple accumulation-under-timer
// scoring, no rounds, no combo, just "how much can you clear before time's
// up". Same single-action contract as the other mini-games (E to act, X to
// bail anytime), same dark-overlay/monospace look. Canvas primitives only.
// The shop floor (fill + plank-seam gridlines + border) never changes frame
// to frame -- same rect, same lines, same colors -- so it's wasteful (and,
// on slower devices, visibly stutter-inducing) to re-issue ~35 individual
// beginPath()/stroke() calls for it every single frame. Bake it once into an
// offscreen canvas and just blit that with a single drawImage() per frame
// instead. Built lazily on first use and cached for the lifetime of the page
// since the geometry it depends on (FLOOR_LEFT/RIGHT/Y, VIEW_W) is constant.
let speedSweepFloorCache = null;
function getSpeedSweepFloorCanvas(floorLeft, floorRight, floorTop, floorH) {
  if (speedSweepFloorCache) return speedSweepFloorCache;
  const off = document.createElement('canvas');
  off.width = VIEW_W;
  off.height = VIEW_H;
  const fctx = off.getContext('2d');
  fctx.fillStyle = '#a8946e';
  fctx.fillRect(floorLeft - 40, floorTop, floorRight - floorLeft + 80, floorH);
  fctx.strokeStyle = 'rgba(90,70,40,0.4)';
  fctx.lineWidth = 1;
  for (let px = floorLeft - 40; px <= floorRight + 40; px += 22) {
    fctx.beginPath(); fctx.moveTo(px, floorTop); fctx.lineTo(px, floorTop + floorH); fctx.stroke();
  }
  fctx.strokeStyle = '#5c4a30';
  fctx.lineWidth = 3;
  fctx.strokeRect(floorLeft - 40, floorTop, floorRight - floorLeft + 80, floorH);
  speedSweepFloorCache = off;
  return off;
}

function createSpeedSweepGame() {
  const TIME_LIMIT = 24;           // seconds on the clock
  const FLOOR_Y = 300;             // baseline the dust/broom sit on
  const FLOOR_LEFT = 150, FLOOR_RIGHT = VIEW_W - 150; // sweeping range
  const BROOM_SPEED = 340;         // px/sec while held
  const SWEEP_RADIUS = 34;         // how close the broom needs to be to clear a pile
  const MAX_PILES = 6;             // dust piles on the floor at once, at most

  let phase = 'sweep';             // 'sweep' | 'done'
  let timeLeft = TIME_LIMIT;
  let score = 0;
  let swept = 0;
  let broomX = VIEW_W / 2;
  let piles = [];
  let pileId = 0;
  let spawnTimer = 0.5;
  let pops = []; // brief "+pts" pop effects where a pile just got swept
  let bestRecorded = false, isNewBest = false;

  // Weighted so small piles are the bread-and-butter and the occasional
  // big pile is worth stopping for -- same weighted-pick trick as the
  // crate-digging mini-game's outcome table.
  const PILE_TYPES = [
    { type: 'small', r: 7,  pts: 10, color: '#c8b088', weight: 5 },
    { type: 'big',   r: 12, pts: 25, color: '#a8895c', weight: 2 },
  ];
  function pickType() {
    const total = PILE_TYPES.reduce((s, o) => s + o.weight, 0);
    let r = Math.random() * total;
    for (const o of PILE_TYPES) { if (r < o.weight) return o; r -= o.weight; }
    return PILE_TYPES[0];
  }
  function spawnPile() {
    if (piles.length >= MAX_PILES) return;
    const t = pickType();
    piles.push({
      id: pileId++,
      x: FLOOR_LEFT + Math.random() * (FLOOR_RIGHT - FLOOR_LEFT),
      y: FLOOR_Y + (Math.random() * 34 - 17), // slight scatter, purely visual
      driftSeed: Math.random() * 10,
      ...t,
    });
  }
  // seed a handful so the floor isn't bare the instant the game opens
  for (let i = 0; i < 3; i++) spawnPile();

  function drawBroom(x, y) {
    // handle, angled back over the shoulder
    ctx.strokeStyle = '#8a6a3a';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 10, y - 78);
    ctx.lineTo(x, y - 16);
    ctx.stroke();
    // binding band where the straw meets the handle
    ctx.fillStyle = '#5c4326';
    ctx.fillRect(x - 8, y - 20, 16, 6);
    // fanned straw bristles
    ctx.strokeStyle = '#e0c060';
    ctx.lineWidth = 2;
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x, y - 16);
      ctx.lineTo(x + i * 6, y + 14);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(224,192,96,0.25)';
    ctx.beginPath();
    ctx.moveTo(x - 24, y + 14);
    ctx.lineTo(x + 24, y + 14);
    ctx.lineTo(x, y - 16);
    ctx.closePath();
    ctx.fill();
    // faint reach indicator so players can gauge the sweep radius
    ctx.strokeStyle = 'rgba(224,192,96,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.ellipse(x, y + 4, SWEEP_RADIUS, 10, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  return {
    update(dt) {
      if (phase === 'sweep') {
        timeLeft -= dt;
        if (timeLeft <= 0) { timeLeft = 0; phase = 'done'; }

        let dx = 0;
        if (keys['arrowleft'] || keys['a']) dx -= 1;
        if (keys['arrowright'] || keys['d']) dx += 1;
        broomX += dx * BROOM_SPEED * dt;
        broomX = Math.max(FLOOR_LEFT, Math.min(FLOOR_RIGHT, broomX));

        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          spawnPile();
          spawnTimer = 0.5 + Math.random() * 0.6;
        }

        // one swipe clears every pile within reach in a single go -- feels
        // like an actual broom stroke catching a cluster of dust at once
        if (interactPressed) {
          piles = piles.filter((p) => {
            const hit = Math.abs(p.x - broomX) <= SWEEP_RADIUS;
            if (hit) {
              score += p.pts;
              swept++;
              pops.push({ x: p.x, y: p.y, pts: p.pts, life: 0.5, color: p.color });
            }
            return !hit;
          });
        }

        pops.forEach((p) => { p.life -= dt; p.y -= dt * 24; });
        pops = pops.filter((p) => p.life > 0);
      } else if (phase === 'done') {
        if (!bestRecorded) { isNewBest = recordMinigameScore('speedsweep', score); bestRecorded = true; }
        if (interactPressed) exitMinigame();
      }
      // X always bails out early, no matter the phase
      if (buyPressed) exitMinigame();
    },
    draw() {
      ctx.fillStyle = 'rgba(8,6,12,0.9)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#e0b040';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('SPEED SWEEP', VIEW_W / 2, 56);
      ctx.fillStyle = '#f4ecd8';
      ctx.font = '15px monospace';
      ctx.fillText(`SCORE ${score}   SWEPT ${swept}`, VIEW_W / 2, 78);

      // countdown bar
      const barW = 260, barX = VIEW_W / 2 - barW / 2, barY = 92;
      ctx.fillStyle = 'rgba(244,236,216,0.15)';
      ctx.fillRect(barX, barY, barW, 8);
      const frac = timeLeft / TIME_LIMIT;
      ctx.fillStyle = frac > 0.3 ? '#8cff5f' : '#e0603a';
      ctx.fillRect(barX, barY, barW * Math.max(0, frac), 8);
      ctx.fillStyle = '#f4ecd8';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`${Math.ceil(timeLeft)}s`, VIEW_W / 2, barY + 24);

      // shop floor strip -- pre-baked once (see getSpeedSweepFloorCanvas) and
      // blitted with a single drawImage() instead of redrawing ~35 individual
      // line strokes every frame, which was the source of the stutter.
      const floorTop = FLOOR_Y - 70, floorH = 150;
      ctx.drawImage(getSpeedSweepFloorCanvas(FLOOR_LEFT, FLOOR_RIGHT, floorTop, floorH), 0, 0);

      // dust piles
      piles.forEach((p) => {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.ellipse(p.x - p.r * 0.3, p.y - p.r * 0.25, p.r * 0.35, p.r * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
      });

      // "+pts" pop effects where dust just got swept
      pops.forEach((p) => {
        ctx.globalAlpha = Math.max(0, p.life / 0.5);
        ctx.fillStyle = '#8cff5f';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(`+${p.pts}`, p.x, p.y - 10);
        ctx.globalAlpha = 1;
      });

      if (phase === 'sweep') drawBroom(broomX, FLOOR_Y);

      ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#8cff5f' : '#f4ecd8';
      ctx.font = 'bold 17px monospace';
      if (phase === 'sweep') ctx.fillText('- HOLD \u25c0 \u25b6 TO MOVE, TAP E TO SWEEP -', VIEW_W / 2, 420);
      else ctx.fillText(`TIME'S UP! FINAL SCORE: ${score} - PRESS E TO LEAVE`, VIEW_W / 2, 420);

      if (phase === 'done') {
        ctx.font = '14px monospace';
        ctx.fillStyle = isNewBest ? '#8cff5f' : '#9a90a8';
        ctx.fillText(isNewBest ? 'NEW BEST!' : `BEST: ${bestFor('speedsweep')}`, VIEW_W / 2, 438);
      }

      ctx.fillStyle = '#6a6070';
      ctx.font = '13px monospace';
      ctx.fillText('X to walk away anytime', VIEW_W / 2, phase === 'done' ? 456 : 444);
    },
  };
}

// ---- speed sweep mode chooser ------------------------------------------------
function createSpeedSweepModeSelect() {
  return createModeSelectMenu({
    title: 'SPEED SWEEP',
    pickLabel: 'PICK YOUR BROOM',
    classicSub: 'The original flat sweeping strip',
    threeDSub: 'Get the dust up close -- full 3D',
    createClassic: () => createSpeedSweepGame(),
    createThreeD: () => createSpeedSweep3DGame(),
  });
}

// ---- Speed Sweep 3D ----------------------------------------------------------
// The Three.js remake of Speed Sweep. Identical gameplay contract to the
// classic version -- same 24-second clock, same weighted small/big pile
// table, same spawn timer, same SWEEP_RADIUS-clears-everything-in-reach
// stroke, same 'speedsweep' trophy -- only the rendering changed: a real
// shop floor with a broom rig that slides on its own little rail, dust
// piles built as low domes instead of drawn ellipses, and a swing animation
// plus a dust-burst particle effect on every sweep. The scene renders to an
// offscreen WebGL canvas (see getMinigame3DRenderer()) that gets blitted
// into the main 2D canvas each frame, so input handling, CSS scaling, and
// the rAF loop are all untouched, and the HUD is drawn over the blit with
// the same monospace styling every other mini-game uses.
function createSpeedSweep3DGame() {
  const T = window.THREE;
  const { renderer, canvas: sweep3DCanvas } = getMinigame3DRenderer('speedsweep');

  // ---- gameplay state: mirrors createSpeedSweepGame exactly, just in
  // world-space units instead of screen pixels
  const TIME_LIMIT = 24;
  const FLOOR_X_HALF = 1.6;           // sweeping range, world units either side of center
  const BROOM_SPEED = 1.65;           // world units/sec while held
  const SWEEP_RADIUS = 0.17;          // how close the broom needs to be to clear a pile
  const MAX_PILES = 6;
  const FLOOR_Z = -2.4, FLOOR_Y = 0;

  let phase = 'sweep';                // 'sweep' | 'done'
  let timeLeft = TIME_LIMIT;
  let score = 0;
  let swept = 0;
  let broomX = 0;
  let pileId = 0;
  let spawnTimer = 0.5;
  let bestRecorded = false, isNewBest = false;
  let t = 0;

  const PILE_TYPES = [
    { type: 'small', r: 0.09,  pts: 10, color: 0xc8b088, weight: 5 },
    { type: 'big',   r: 0.15, pts: 25, color: 0xa8895c, weight: 2 },
  ];
  function pickType() {
    const total = PILE_TYPES.reduce((s, o) => s + o.weight, 0);
    let r = Math.random() * total;
    for (const o of PILE_TYPES) { if (r < o.weight) return o; r -= o.weight; }
    return PILE_TYPES[0];
  }

  // ---- scene ----
  const scene = new T.Scene();
  scene.background = new T.Color(0x0a0714);
  scene.fog = new T.Fog(0x0a0714, 6, 16);

  const camera = new T.PerspectiveCamera(52, VIEW_W / VIEW_H, 0.1, 30);
  const CAM_POS = new T.Vector3(0, 1.3, 0.9);
  let camZ = CAM_POS.z;
  camera.position.copy(CAM_POS);
  camera.lookAt(0, 0.15, FLOOR_Z);

  // room: dark backdrop, same purple family as the rest of the world
  const wall = new T.Mesh(
    new T.PlaneGeometry(12, 7),
    new T.MeshStandardMaterial({ color: 0x150f1c, roughness: 1 })
  );
  wall.position.set(0, 2.6, -4.0);
  wall.receiveShadow = true;
  scene.add(wall);
  const backFloor = new T.Mesh(
    new T.PlaneGeometry(12, 14),
    new T.MeshStandardMaterial({ color: 0x1c1422, roughness: 0.95 })
  );
  backFloor.rotation.x = -Math.PI / 2;
  backFloor.position.set(0, 0, -2);
  backFloor.receiveShadow = true;
  scene.add(backFloor);

  // shop floor strip: wood-toned planks with a raised trim, same footprint
  // as the classic's stroked rect
  const stripW = FLOOR_X_HALF * 2 + 0.5, stripD = 1.2;
  const shopFloor = new T.Mesh(
    new T.BoxGeometry(stripW, 0.06, stripD),
    new T.MeshStandardMaterial({ color: 0xa8946e, roughness: 0.85 })
  );
  shopFloor.position.set(0, -0.03, FLOOR_Z);
  shopFloor.receiveShadow = true;
  scene.add(shopFloor);
  // plank seams, purely cosmetic
  for (let px = -stripW / 2; px <= stripW / 2; px += 0.22) {
    const seam = new T.Mesh(
      new T.BoxGeometry(0.006, 0.062, stripD),
      new T.MeshStandardMaterial({ color: 0x5c4a30, roughness: 0.9 })
    );
    seam.position.set(px, -0.03, FLOOR_Z);
    scene.add(seam);
  }
  const trim = new T.Mesh(
    new T.BoxGeometry(stripW + 0.06, 0.09, stripD + 0.06),
    new T.MeshStandardMaterial({ color: 0x5c4a30, roughness: 0.8 })
  );
  trim.position.set(0, -0.065, FLOOR_Z);
  scene.add(trim);

  // faint dashed reach ring, following the broom, showing the sweep radius
  const reachRing = new T.Mesh(
    new T.RingGeometry(SWEEP_RADIUS - 0.012, SWEEP_RADIUS, 32),
    new T.MeshBasicMaterial({ color: 0xe0c060, transparent: true, opacity: 0.28, side: T.DoubleSide })
  );
  reachRing.rotation.x = -Math.PI / 2;
  scene.add(reachRing);

  // dust piles: low domes built from a hemisphere, one mesh per pile
  function buildPileMesh(p) {
    const dome = new T.Mesh(
      new T.SphereGeometry(p.r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new T.MeshStandardMaterial({ color: p.color, roughness: 0.95 })
    );
    dome.castShadow = true;
    dome.receiveShadow = true;
    scene.add(dome);
    return dome;
  }
  function spawnPile() {
    if (piles.length >= MAX_PILES) return;
    const ty = pickType();
    const p = {
      id: pileId++,
      x: (Math.random() * 2 - 1) * (FLOOR_X_HALF - 0.15),
      z: FLOOR_Z + (Math.random() * 0.7 - 0.35),
      driftSeed: Math.random() * 10,
      ...ty,
    };
    p.mesh = buildPileMesh(p);
    p.mesh.position.set(p.x, 0, p.z);
    piles.push(p);
  }
  function disposePileMesh(p) {
    if (!p.mesh) return;
    scene.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.mesh.material.dispose();
    p.mesh = null;
  }

  let piles = [];
  for (let i = 0; i < 3; i++) spawnPile();

  // broom rig: handle angled back, brush head with fanned bristles
  const broomGroup = new T.Group();
  scene.add(broomGroup);
  const handle = new T.Mesh(
    new T.CylinderGeometry(0.018, 0.018, 0.9, 8),
    new T.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.75 })
  );
  handle.position.set(0, 0.44, -0.05);
  handle.rotation.x = 0.55;
  broomGroup.add(handle);
  const band = new T.Mesh(
    new T.CylinderGeometry(0.032, 0.032, 0.05, 10),
    new T.MeshStandardMaterial({ color: 0x5c4326, roughness: 0.7 })
  );
  band.position.set(0, 0.1, 0.02);
  broomGroup.add(band);
  const bristleGroup = new T.Group();
  bristleGroup.position.set(0, 0.08, 0.02);
  broomGroup.add(bristleGroup);
  const bristleMat = new T.MeshStandardMaterial({ color: 0xe0c060, roughness: 0.7 });
  for (let i = -4; i <= 4; i++) {
    const straw = new T.Mesh(new T.CylinderGeometry(0.004, 0.007, 0.16, 4), bristleMat);
    straw.position.set(i * 0.02, -0.08, i * 0.006);
    straw.rotation.x = -0.15;
    straw.rotation.z = i * 0.05;
    bristleGroup.add(straw);
  }
  let swingT = 0; // decays after every sweep press, drives the swipe animation

  // dust-burst particles, spawned on every successful sweep
  let bursts = [];
  function spawnBurst(x, z, color) {
    for (let i = 0; i < 6; i++) {
      const mesh = new T.Mesh(
        new T.SphereGeometry(0.018, 6, 6),
        new T.MeshStandardMaterial({ color, roughness: 0.9, transparent: true, opacity: 1 })
      );
      mesh.position.set(x, 0.04, z);
      scene.add(mesh);
      const ang = Math.random() * Math.PI * 2;
      bursts.push({
        mesh, vx: Math.cos(ang) * 0.55, vy: 0.35 + Math.random() * 0.3, vz: Math.sin(ang) * 0.3, life: 0,
      });
    }
  }

  // "+pts" pop text: single HUD-space callout per sweep, matching the
  // established single-message convention the other 3D remakes use
  let popText = null; // { text, timer }

  // lights: warm spot over the shop floor, dim ambient
  scene.add(new T.AmbientLight(0x352c40, 0.8));
  const spot = new T.SpotLight(0xffe2c0, 1.0, 14, 0.55, 0.45);
  spot.position.set(0, 3.4, -1.2);
  spot.target = shopFloor;
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  scene.add(spot);
  scene.add(spot.target);

  // Full teardown -- called right before every exitMinigame().
  function cleanup() {
    piles.forEach((p) => disposePileMesh(p));
    bursts.forEach((b) => { scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); });
    bursts = [];
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
    scene.clear();
  }
  function leave() { cleanup(); exitMinigame(); }

  return {
    update(dt) {
      t += dt;
      if (buyPressed) { leave(); return; }

      if (phase === 'sweep') {
        timeLeft -= dt;
        if (timeLeft <= 0) { timeLeft = 0; phase = 'done'; }

        let dx = 0;
        if (keys['arrowleft'] || keys['a']) dx -= 1;
        if (keys['arrowright'] || keys['d']) dx += 1;
        broomX += dx * BROOM_SPEED * dt;
        broomX = Math.max(-FLOOR_X_HALF, Math.min(FLOOR_X_HALF, broomX));

        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          spawnPile();
          spawnTimer = 0.5 + Math.random() * 0.6;
        }

        // one swipe clears every pile within reach in a single go -- feels
        // like an actual broom stroke catching a cluster of dust at once
        if (interactPressed) {
          swingT = 1;
          let gained = 0, hitAny = false, lastColor = 0x8cff5f;
          piles = piles.filter((p) => {
            const hit = Math.abs(p.x - broomX) <= SWEEP_RADIUS;
            if (hit) {
              score += p.pts;
              gained += p.pts;
              swept++;
              hitAny = true;
              spawnBurst(p.x, p.z, p.color);
              disposePileMesh(p);
            }
            return !hit;
          });
          if (hitAny) popText = { text: `+${gained}`, timer: 0.5 };
        }
      } else if (phase === 'done') {
        if (!bestRecorded) { isNewBest = recordMinigameScore('speedsweep', score); bestRecorded = true; }
        if (interactPressed) { leave(); return; }
      }

      if (popText) {
        popText.timer -= dt;
        if (popText.timer <= 0) popText = null;
      }

      // broom rig follows broomX, with a quick swing decay on every press
      broomGroup.position.set(broomX, 0, FLOOR_Z);
      swingT = Math.max(0, swingT - dt * 3.2);
      broomGroup.rotation.z = Math.sin(swingT * Math.PI) * 0.35;
      reachRing.position.set(broomX, 0.005, FLOOR_Z);

      // piles drift/settle very slightly for visual life
      piles.forEach((p) => {
        if (!p.mesh) return;
        p.mesh.rotation.y = Math.sin(t * 0.8 + p.driftSeed) * 0.1;
      });

      bursts.forEach((b) => {
        b.life += dt;
        b.mesh.position.x += b.vx * dt;
        b.mesh.position.y += (b.vy - b.life * 1.6) * dt;
        b.mesh.position.z += b.vz * dt;
        b.mesh.material.opacity = Math.max(0, 1 - b.life * 1.4);
      });
      bursts = bursts.filter((b) => {
        if (b.life * 1.4 >= 1) {
          scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose();
          return false;
        }
        return true;
      });

      // camera: gentle idle sway, no shake needed -- sweeping is a calmer
      // mini-game than the reflex-timing ones
      const sway = Math.sin(t * 0.5) * 0.02;
      camera.position.set(CAM_POS.x + sway, CAM_POS.y + Math.sin(t * 0.7) * 0.008, camZ);
      camera.lookAt(0, 0.15, FLOOR_Z);
    },
    draw() {
      renderer.render(scene, camera);
      ctx.drawImage(sweep3DCanvas, 0, 0);

      // HUD: same layout and styling as the classic version
      const cx = VIEW_W / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e0b040';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('SPEED SWEEP 3D', cx, 56);
      ctx.fillStyle = '#f4ecd8';
      ctx.font = '15px monospace';
      ctx.fillText(`SCORE ${score}   SWEPT ${swept}`, cx, 78);

      // countdown bar
      const barW = 260, barX = cx - barW / 2, barY = 92;
      ctx.fillStyle = 'rgba(244,236,216,0.15)';
      ctx.fillRect(barX, barY, barW, 8);
      const frac = timeLeft / TIME_LIMIT;
      ctx.fillStyle = frac > 0.3 ? '#8cff5f' : '#e0603a';
      ctx.fillRect(barX, barY, barW * Math.max(0, frac), 8);
      ctx.fillStyle = '#f4ecd8';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`${Math.ceil(timeLeft)}s`, cx, barY + 24);

      if (popText) {
        ctx.fillStyle = '#8cff5f';
        ctx.font = 'bold 16px monospace';
        ctx.globalAlpha = Math.max(0, popText.timer / 0.5);
        ctx.fillText(popText.text, cx, 480);
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#8cff5f' : '#f4ecd8';
      ctx.font = 'bold 17px monospace';
      if (phase === 'sweep') ctx.fillText('- HOLD \u25c0 \u25b6 TO MOVE, TAP E TO SWEEP -', cx, 520);
      else ctx.fillText(`TIME'S UP! FINAL SCORE: ${score} - PRESS E TO LEAVE`, cx, 520);

      if (phase === 'done') {
        ctx.font = '14px monospace';
        ctx.fillStyle = isNewBest ? '#8cff5f' : '#9a90a8';
        ctx.fillText(isNewBest ? 'NEW BEST!' : `BEST: ${bestFor('speedsweep')}`, cx, 538);
      }

      ctx.fillStyle = '#6a6070';
      ctx.font = '13px monospace';
      ctx.fillText('X to walk away anytime', cx, phase === 'done' ? 556 : 544);
    },
  };
}

// Staring Contest with a Cat: the cat blinks at a random moment; hold
// completely still (no movement keys, no E, no X) until it does, and you
// win. Press or hold ANYTHING before the blink and that counts as giving
// in -- you lose. No score, no cost, just vibes. Canvas primitives only --
// no images, no new assets. Unlike the other mini-games, X does NOT bail
// out for free here -- pressing it mid-stare IS the "give in" loss, since
// that's the whole joke.
function createStaringContestGame() {
  // Movement keys are held/level-triggered (not edge-triggered like E/X),
  // so a key already down when the game opens (e.g. still holding the
  // arrow that walked the player onto the sign) shouldn't count as an
  // instant loss -- only a FRESH press should. heldLast snapshots the
  // starting state per key so we can detect that transition ourselves.
  const WATCHED_KEYS = ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'w', 'a', 's', 'd'];
  const heldLast = {};
  WATCHED_KEYS.forEach((k) => { heldLast[k] = !!keys[k]; });

  let phase = 'staring';   // 'staring' | 'result' | 'done'
  let outcome = null;      // 'won' | 'lost'
  let elapsed = 0;
  const blinkAt = 1.6 + Math.random() * 3.4; // the cat blinks somewhere in here
  const BLINK_DUR = 0.22;
  let blinkT = 0;           // >0 while the blink animation is playing
  let idleT = 0;            // free-running clock for tail/whisker idle motion
  let resultTimer = 0;
  let bestRecorded = false, isNewBest = false;

  function loseByGivingIn() {
    if (phase !== 'staring') return;
    outcome = 'lost';
    phase = 'result';
    resultTimer = 1.3;
  }

  return {
    update(dt) {
      idleT += dt;
      if (phase === 'staring') {
        elapsed += dt;
        if (blinkT > 0) {
          blinkT -= dt;
        } else if (elapsed >= blinkAt) {
          // the cat blinks first -- the player wins, no input needed
          blinkT = BLINK_DUR;
          outcome = 'won';
          phase = 'result';
          resultTimer = 1.3;
        }
        if (phase === 'staring') {
          if (interactPressed || buyPressed) {
            loseByGivingIn();
          } else {
            for (const k of WATCHED_KEYS) {
              const down = !!keys[k];
              if (down && !heldLast[k]) loseByGivingIn();
              heldLast[k] = down;
            }
          }
        }
      } else if (phase === 'result') {
        resultTimer -= dt;
        if (resultTimer <= 0 || interactPressed || buyPressed) phase = 'done';
      } else if (phase === 'done') {
        if (!bestRecorded) { isNewBest = recordMinigameScore('staringcontest', elapsed); bestRecorded = true; }
        if (interactPressed || buyPressed) exitMinigame();
      }
    },
    draw() {
      ctx.fillStyle = 'rgba(8,6,12,0.9)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      const cx = VIEW_W / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e0b040';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('STARING CONTEST', cx, 56);
      ctx.fillStyle = '#c8c0d8';
      ctx.font = '15px monospace';
      ctx.fillText('First one to blink loses.', cx, 78);

      // --- cushion the cat sits on ---
      const catCx = cx, catBaseY = 340;
      ctx.fillStyle = '#4a3a52';
      ctx.beginPath();
      ctx.ellipse(catCx, catBaseY + 34, 110, 22, 0, 0, Math.PI * 2);
      ctx.fill();

      // eyelid closure: 0 = fully open, 1 = fully shut. Rides a sine pulse
      // across BLINK_DUR so the eye opens -> shuts -> opens again inside
      // that one short window, instead of just snapping.
      const closure = blinkT > 0 ? Math.sin(Math.PI * (blinkT / BLINK_DUR)) : 0;

      // tail: slow idle sweep, a little quicker if the player just lost
      // (a small told-you-so flick)
      const tailSpeed = outcome === 'lost' ? 3.2 : 1.4;
      const tailSwing = Math.sin(idleT * tailSpeed) * 22;
      ctx.strokeStyle = '#2a2430';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(catCx + 70, catBaseY + 10);
      ctx.quadraticCurveTo(catCx + 110, catBaseY - 10 + tailSwing, catCx + 96, catBaseY - 60 + tailSwing * 0.4);
      ctx.stroke();

      // body
      ctx.fillStyle = '#3a3038';
      ctx.beginPath();
      ctx.ellipse(catCx, catBaseY, 74, 54, 0, 0, Math.PI * 2);
      ctx.fill();
      // chest patch
      ctx.fillStyle = '#e8e0d0';
      ctx.beginPath();
      ctx.ellipse(catCx, catBaseY + 18, 30, 34, 0, 0, Math.PI * 2);
      ctx.fill();
      // front paws
      ctx.fillStyle = '#3a3038';
      ctx.beginPath(); ctx.ellipse(catCx - 26, catBaseY + 46, 14, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(catCx + 26, catBaseY + 46, 14, 10, 0, 0, Math.PI * 2); ctx.fill();

      // head
      const headCx = catCx, headCy = catBaseY - 78, headR = 46;
      ctx.fillStyle = '#3a3038';
      ctx.beginPath();
      ctx.arc(headCx, headCy, headR, 0, Math.PI * 2);
      ctx.fill();
      // ears
      ctx.fillStyle = '#3a3038';
      ctx.beginPath();
      ctx.moveTo(headCx - 40, headCy - 18); ctx.lineTo(headCx - 20, headCy - 60); ctx.lineTo(headCx - 4, headCy - 24);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(headCx + 40, headCy - 18); ctx.lineTo(headCx + 20, headCy - 60); ctx.lineTo(headCx + 4, headCy - 24);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c86a8a';
      ctx.beginPath();
      ctx.moveTo(headCx - 32, headCy - 22); ctx.lineTo(headCx - 20, headCy - 46); ctx.lineTo(headCx - 10, headCy - 26);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(headCx + 32, headCy - 22); ctx.lineTo(headCx + 20, headCy - 46); ctx.lineTo(headCx + 10, headCy - 26);
      ctx.closePath(); ctx.fill();

      // muzzle patch
      ctx.fillStyle = '#e8e0d0';
      ctx.beginPath();
      ctx.ellipse(headCx, headCy + 20, 22, 16, 0, 0, Math.PI * 2);
      ctx.fill();

      // whiskers -- twitch slightly with the idle clock
      const whiskT = Math.sin(idleT * 2.2) * 2;
      ctx.strokeStyle = '#d8d0e0';
      ctx.lineWidth = 1.5;
      [-1, 1].forEach((side) => {
        for (let i = 0; i < 3; i++) {
          const wy = headCy + 14 + i * 6;
          ctx.beginPath();
          ctx.moveTo(headCx + side * 14, wy);
          ctx.lineTo(headCx + side * (52 + whiskT), wy - 4 + i * 3);
          ctx.stroke();
        }
      });

      // nose
      ctx.fillStyle = '#c86a8a';
      ctx.beginPath();
      ctx.moveTo(headCx - 5, headCy + 8); ctx.lineTo(headCx + 5, headCy + 8); ctx.lineTo(headCx, headCy + 15);
      ctx.closePath(); ctx.fill();

      // eyes -- ellipse height shrinks toward zero as `closure` -> 1, and
      // a smug slit gets drawn instead once the player has lost
      const eyeY = headCy - 6, eyeDX = 20;
      const eyeColor = '#8cd050';
      [-1, 1].forEach((side) => {
        const ex = headCx + side * eyeDX;
        if (outcome === 'lost') {
          // narrowed, satisfied slits -- the cat clearly won
          ctx.strokeStyle = eyeColor;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(ex - 9, eyeY + 2);
          ctx.quadraticCurveTo(ex, eyeY - 4, ex + 9, eyeY + 2);
          ctx.stroke();
          return;
        }
        const openness = Math.max(0.04, 1 - closure);
        ctx.fillStyle = eyeColor;
        ctx.beginPath();
        ctx.ellipse(ex, eyeY, 10, 10 * openness, 0, 0, Math.PI * 2);
        ctx.fill();
        if (openness > 0.35) {
          ctx.fillStyle = '#181418';
          ctx.beginPath();
          ctx.ellipse(ex, eyeY, 3, 7 * openness, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // status line + result
      ctx.textAlign = 'center';
      ctx.font = 'bold 17px monospace';
      if (phase === 'staring') {
        ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#e0b040' : '#f4ecd8';
        ctx.fillText('- DON\'T MOVE. DON\'T PRESS ANYTHING. -', cx, 440);
        ctx.font = '14px monospace';
        ctx.fillStyle = '#9a90a8';
        ctx.fillText(`HOLDING STILL: ${elapsed.toFixed(1)}s`, cx, 462);
      } else if (phase === 'result' || phase === 'done') {
        if (outcome === 'won') {
          ctx.fillStyle = '#8cff5f';
          ctx.fillText('IT BLINKED FIRST -- YOU WIN!', cx, 440);
        } else {
          ctx.fillStyle = '#e0603a';
          ctx.fillText('YOU BLINKED. THE CAT WINS.', cx, 440);
        }
        if (phase === 'done') {
          ctx.font = '14px monospace';
          ctx.fillStyle = '#9a90a8';
          ctx.fillText('PRESS E TO LEAVE', cx, 462);
          ctx.fillStyle = isNewBest ? '#8cff5f' : '#9a90a8';
          ctx.fillText(isNewBest ? 'NEW BEST!' : `BEST: ${formatTrophyValue('staringcontest', bestFor('staringcontest'))}`, cx, 480);
        }
      }
    },
  };
}

// Build A Pizza: a ring of six toppings spins around the pie like a lazy
// Susan; an order calls out one topping and the player taps E to grab it
// right as it passes the marker at 12 o'clock. Score bands on how close
// the tap landed to dead-center (same PERFECT/GOOD/OK banding as Beat
// Match and Whack-a-Pigeon); the wrong topping under the marker is always
// a miss, no matter how precise the tap. Same single-action contract as
// every other mini-game here (E to act, X to bail anytime), same dark-
// overlay/monospace look, same round-based scoring-then-auto-exit shape.
// Canvas primitives only -- no images, no new assets.
function createPizzaBuildGame() {
  const ROUNDS = 6;
  const TOPPINGS = [
    { id: 'pepperoni', label: 'PEPPERONI', draw(x, y, r) {
        ctx.fillStyle = '#c0392b';
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#8a2418';
        [[-0.3, -0.25], [0.32, -0.1], [-0.1, 0.32], [0.28, 0.3]].forEach(([ox, oy]) => {
          ctx.beginPath(); ctx.arc(x + ox * r, y + oy * r, r * 0.14, 0, Math.PI * 2); ctx.fill();
        });
      } },
    { id: 'mushroom', label: 'MUSHROOM', draw(x, y, r) {
        ctx.fillStyle = '#d8c8a8';
        ctx.beginPath(); ctx.ellipse(x, y + r * 0.15, r * 0.75, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#a89070';
        ctx.beginPath(); ctx.ellipse(x, y - r * 0.15, r * 0.7, r * 0.45, 0, Math.PI, 0); ctx.fill();
      } },
    { id: 'olive', label: 'OLIVES', draw(x, y, r) {
        [[-0.3, -0.2], [0.25, 0.1], [-0.1, 0.35], [0.3, -0.3]].forEach(([ox, oy]) => {
          ctx.fillStyle = '#241a1a';
          ctx.beginPath(); ctx.arc(x + ox * r, y + oy * r, r * 0.22, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#3a2a2a';
          ctx.beginPath(); ctx.arc(x + ox * r, y + oy * r, r * 0.09, 0, Math.PI * 2); ctx.fill();
        });
      } },
    { id: 'pepper', label: 'PEPPERS', draw(x, y, r) {
        ctx.strokeStyle = '#3a8a3a'; ctx.lineWidth = r * 0.22; ctx.lineCap = 'round';
        [[-0.5, -0.3, 0.4, 0.3], [-0.1, -0.4, 0.3, 0.35], [0.2, -0.1, -0.35, 0.4]].forEach(([x1, y1, x2, y2]) => {
          ctx.beginPath(); ctx.moveTo(x + x1 * r, y + y1 * r); ctx.lineTo(x + x2 * r, y + y2 * r); ctx.stroke();
        });
      } },
    { id: 'pineapple', label: 'PINEAPPLE', draw(x, y, r) {
        ctx.fillStyle = '#e0c030';
        [[-0.25, -0.2], [0.28, 0.15], [-0.15, 0.3]].forEach(([ox, oy]) => {
          ctx.beginPath();
          ctx.moveTo(x + ox * r, y + oy * r - r * 0.22);
          ctx.lineTo(x + ox * r - r * 0.2, y + oy * r + r * 0.18);
          ctx.lineTo(x + ox * r + r * 0.2, y + oy * r + r * 0.18);
          ctx.closePath(); ctx.fill();
        });
      } },
    { id: 'cheese', label: 'EXTRA CHEESE', draw(x, y, r) {
        ctx.fillStyle = '#f0d060';
        ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e8b840';
        [[-0.3, -0.2], [0.3, 0.1], [0, 0.35]].forEach(([ox, oy]) => {
          ctx.beginPath(); ctx.arc(x + ox * r, y + oy * r, r * 0.18, 0, Math.PI * 2); ctx.fill();
        });
      } },
  ];
  const N = TOPPINGS.length;
  const angleStep = (Math.PI * 2) / N;

  let phase = 'spin';       // 'spin' | 'result' | 'done'
  let round = 1;
  let score = 0;
  let combo = 0;
  let rotation = 0;
  let speed = 1.3;           // rad/s, ramps up slightly each round
  let target = TOPPINGS[Math.floor(Math.random() * N)];
  let lastLabel = '';
  let resultTimer = 0;
  let bestRecorded = false, isNewBest = false;

  function pickTarget() {
    let next;
    do { next = TOPPINGS[Math.floor(Math.random() * N)]; } while (next.id === target.id);
    return next;
  }

  function hitFor(dist) {
    if (dist <= 0.09) return { label: 'PERFECT!', pts: 50 };
    if (dist <= 0.22) return { label: 'GOOD', pts: 25 };
    return { label: 'OK', pts: 10 };
  }

  // Which slot currently sits under the top marker, and how far off (in
  // radians, normalized to the -PI..PI range) it is -- used both to score
  // a tap and to highlight the slot as it passes through.
  function slotAtTop() {
    let bestI = 0, bestDist = Infinity;
    for (let i = 0; i < N; i++) {
      let a = (i * angleStep + rotation) % (Math.PI * 2);
      if (a > Math.PI) a -= Math.PI * 2;
      if (a < -Math.PI) a += Math.PI * 2;
      const d = Math.abs(a);
      if (d < bestDist) { bestDist = d; bestI = i; }
    }
    return { index: bestI, dist: bestDist };
  }

  const cx = VIEW_W / 2, cy = 260, wheelR = 130, iconR = 30;

  return {
    update(dt) {
      if (phase === 'spin') {
        rotation += speed * dt;
        if (interactPressed) {
          const { index, dist } = slotAtTop();
          if (TOPPINGS[index].id === target.id) {
            const res = hitFor(dist / (angleStep / 2));
            score += res.pts;
            combo++;
            lastLabel = res.label;
          } else {
            lastLabel = 'WRONG TOPPING!';
            combo = 0;
          }
          phase = 'result';
          resultTimer = 0.7;
        }
      } else if (phase === 'result') {
        resultTimer -= dt;
        if (resultTimer <= 0) {
          if (round >= ROUNDS) { phase = 'done'; }
          else {
            round++;
            speed = Math.min(3.2, speed + 0.22);
            target = pickTarget();
            phase = 'spin';
          }
        }
      } else if (phase === 'done') {
        if (!bestRecorded) { isNewBest = recordMinigameScore('buildpizza', score); bestRecorded = true; }
        if (interactPressed) exitMinigame();
      }
      // X always bails out early, no matter the phase
      if (buyPressed) exitMinigame();
    },
    draw() {
      ctx.fillStyle = 'rgba(8,6,12,0.9)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#e0b040';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('BUILD A PIZZA', cx, 52);
      ctx.fillStyle = '#f4ecd8';
      ctx.font = '15px monospace';
      ctx.fillText(`SCORE ${score}   ORDER ${Math.min(round, ROUNDS)}/${ROUNDS}   COMBO x${combo}`, cx, 74);

      if (phase !== 'done') {
        ctx.fillStyle = '#e0603a';
        ctx.font = 'bold 18px monospace';
        ctx.fillText(`ORDER UP: ${target.label}`, cx, 106);
      }

      // pizza base
      ctx.fillStyle = '#e0c080';
      ctx.beginPath(); ctx.arc(cx, cy, wheelR - iconR - 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#a87840';
      ctx.lineWidth = 6;
      ctx.stroke();

      // wheel of toppings
      const top = slotAtTop();
      for (let i = 0; i < N; i++) {
        const a = i * angleStep + rotation - Math.PI / 2;
        const x = cx + Math.cos(a) * wheelR, y = cy + Math.sin(a) * wheelR;
        if (i === top.index && phase === 'spin') {
          ctx.fillStyle = 'rgba(244,236,216,0.25)';
          ctx.beginPath(); ctx.arc(x, y, iconR + 6, 0, Math.PI * 2); ctx.fill();
        }
        TOPPINGS[i].draw(x, y, iconR);
      }

      // marker at 12 o'clock
      ctx.strokeStyle = '#4ad0ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy - wheelR - iconR - 20);
      ctx.lineTo(cx - 10, cy - wheelR - iconR - 4);
      ctx.lineTo(cx + 10, cy - wheelR - iconR - 4);
      ctx.closePath();
      ctx.fillStyle = '#4ad0ff';
      ctx.fill();

      const bottomY = cy + wheelR + iconR + 40;
      ctx.textAlign = 'center';
      ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#e0b040' : '#f4ecd8';
      ctx.font = 'bold 17px monospace';
      if (phase === 'spin') ctx.fillText('- TAP E WHEN IT HITS THE MARKER -', cx, bottomY);
      else if (phase === 'result') ctx.fillText(lastLabel, cx, bottomY);
      else if (phase === 'done') {
        const tip = score >= 240 ? 'PERFECT SHIFT! TONY SLIPS YOU A BIG TIP!'
          : score >= 150 ? 'SOLID SHIFT -- NICE WORK.'
          : 'ROOKIE MISTAKES -- PRACTICE MAKES PERFECT.';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(tip, cx, bottomY);
        ctx.font = 'bold 17px monospace';
        ctx.fillText(`FINAL SCORE: ${score} - PRESS E TO LEAVE`, cx, bottomY + 24);
        ctx.font = '14px monospace';
        ctx.fillStyle = isNewBest ? '#8cff5f' : '#9a90a8';
        ctx.fillText(isNewBest ? 'NEW BEST!' : `BEST: ${bestFor('buildpizza')}`, cx, bottomY + 42);
      }

      ctx.fillStyle = '#6a6070';
      ctx.font = '13px monospace';
      ctx.fillText('X to walk away anytime', cx, phase === 'done' ? bottomY + 66 : bottomY + 24);
    },
  };
}

// Claw Machine: a classic arcade grabber stocked with tiny potted flowers
// instead of plushies -- fits right in at Hey Bud. Hold LEFT/RIGHT to slide
// the claw along the top rail, tap E to drop it straight down. Whatever
// flower is closest to the claw's X when it bottoms out gets a grab attempt
// -- rarer blooms score more but are harder to hold, so the claw can still
// fumble one on the way up to the chute, same petty betrayal every real
// claw machine pulls. A fixed number of drops, score tallied, then
// auto-exits back to 'play'. Canvas primitives only -- no images, no new
// assets, same one-function-per-minigame pattern as the games above.
function createClawMachineGame() {
  const TRIES_TOTAL = 6;
  const RAIL_Y = 130;                 // claw's resting height, top of the case
  const FLOOR_Y = 360;                // where flowers sit at the bottom of the case
  const CASE_LEFT = VIEW_W / 2 - 220, CASE_RIGHT = VIEW_W / 2 + 220;
  const CLAW_SPEED = 240;             // px/sec sliding left/right
  const DROP_SPEED = 260;             // px/sec descending/ascending
  const GRAB_RADIUS = 26;             // how close, in x, the claw needs to be to a flower to try grabbing it
  const CHUTE_X = CASE_RIGHT + 46, CHUTE_Y = RAIL_Y;

  // Weighted so daisies are the bread-and-butter grab and a rose is a rare,
  // hard-won prize -- same weighted-pick trick as speed sweep's dust piles.
  const FLOWER_TYPES = [
    { type: 'daisy', pts: 10, grabChance: 0.85, petal: '#f4ecd8', center: '#e0b040', weight: 5 },
    { type: 'tulip', pts: 20, grabChance: 0.65, petal: '#d94f9a', center: '#e0b040', weight: 3 },
    { type: 'rose',  pts: 40, grabChance: 0.45, petal: '#c0392b', center: '#8e2418', weight: 1 },
  ];
  function pickType() {
    const total = FLOWER_TYPES.reduce((s, o) => s + o.weight, 0);
    let r = Math.random() * total;
    for (const o of FLOWER_TYPES) { if (r < o.weight) return o; r -= o.weight; }
    return FLOWER_TYPES[0];
  }
  function spawnFlowers(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        id: i,
        x: CASE_LEFT + 24 + Math.random() * (CASE_RIGHT - CASE_LEFT - 48),
        wobble: Math.random() * 10,
        ...pickType(),
      });
    }
    return out;
  }

  let flowers = spawnFlowers(9);
  let triesLeft = TRIES_TOTAL;
  let score = 0, caught = 0;
  let phase = 'aim';         // aim | drop | rise | deliver | done
  let clawX = VIEW_W / 2, clawY = RAIL_Y;
  let held = null;           // flower currently gripped, or null
  let pops = [];             // "+pts" / "SLIPPED!" / "MISS" pop effects
  let bestRecorded = false, isNewBest = false;

  // Common exit for the drop/rise/deliver branches: back to aiming if
  // there's a try and a flower left to go for, otherwise the round's over.
  function afterAttempt() {
    phase = (triesLeft > 0 && flowers.length > 0) ? 'aim' : 'done';
  }

  function nearestFlower(x) {
    let best = null, bestD = Infinity;
    flowers.forEach((f) => {
      const d = Math.abs(f.x - x);
      if (d < GRAB_RADIUS && d < bestD) { best = f; bestD = d; }
    });
    return best;
  }

  function drawClawArm(x, y, closed) {
    ctx.strokeStyle = '#5a5060';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, RAIL_Y - 30); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = '#9a90a8';
    ctx.fillRect(x - 10, y - 6, 20, 10);
    ctx.strokeStyle = '#c8bcd8';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    const spread = closed ? 4 : 14;
    ctx.beginPath();
    ctx.moveTo(x - 8, y + 4); ctx.lineTo(x - spread, y + 22);
    ctx.moveTo(x + 8, y + 4); ctx.lineTo(x + spread, y + 22);
    ctx.stroke();
  }

  function drawFlower(f, y) {
    const wob = Math.sin(performance.now() / 400 + f.wobble) * 1.5;
    ctx.strokeStyle = '#4f9a52';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(f.x, y + 14); ctx.lineTo(f.x + wob, y - 2); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.fillStyle = f.petal;
      ctx.beginPath();
      ctx.ellipse(f.x + wob + Math.cos(a) * 6, y - 2 + Math.sin(a) * 6, 4, 3, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = f.center;
    ctx.beginPath(); ctx.arc(f.x + wob, y - 2, 3.5, 0, Math.PI * 2); ctx.fill();
  }

  return {
    update(dt) {
      if (buyPressed) { exitMinigame(); return; }

      if (phase === 'aim') {
        let dx = 0;
        if (keys['arrowleft'] || keys['a']) dx -= 1;
        if (keys['arrowright'] || keys['d']) dx += 1;
        clawX += dx * CLAW_SPEED * dt;
        clawX = Math.max(CASE_LEFT + 10, Math.min(CASE_RIGHT - 10, clawX));
        if (interactPressed && triesLeft > 0) phase = 'drop';
      } else if (phase === 'drop') {
        clawY += DROP_SPEED * dt;
        if (clawY >= FLOOR_Y) {
          clawY = FLOOR_Y;
          const f = nearestFlower(clawX);
          if (f && Math.random() < f.grabChance) {
            held = f;
            flowers = flowers.filter((x) => x !== f);
          }
          phase = 'rise';
        }
      } else if (phase === 'rise') {
        clawY -= DROP_SPEED * dt;
        if (clawY <= RAIL_Y) {
          clawY = RAIL_Y;
          triesLeft--;
          if (held) {
            // one more chance for the claw to fumble it before the chute
            if (Math.random() < 0.22) {
              pops.push({ x: clawX, y: RAIL_Y, life: 0.7, color: '#e0603a', text: 'SLIPPED!' });
              flowers.push({ ...held, x: clawX });
              held = null;
              afterAttempt();
            } else {
              phase = 'deliver';
            }
          } else {
            pops.push({ x: clawX, y: RAIL_Y, life: 0.6, color: '#9a90a8', text: 'MISS' });
            afterAttempt();
          }
        }
      } else if (phase === 'deliver') {
        const dxp = CHUTE_X - clawX;
        clawX += Math.sign(dxp) * CLAW_SPEED * 1.3 * dt;
        if (Math.abs(dxp) < 6) {
          score += held.pts;
          caught++;
          pops.push({ x: CHUTE_X, y: CHUTE_Y, life: 0.7, color: '#8cff5f', text: `+${held.pts}` });
          held = null;
          afterAttempt();
        }
      } else if (phase === 'done') {
        if (!bestRecorded) { isNewBest = recordMinigameScore('clawmachine', score); bestRecorded = true; }
        if (interactPressed) exitMinigame();
      }

      pops.forEach((p) => { p.life -= dt; p.y -= dt * 20; });
      pops = pops.filter((p) => p.life > 0);
    },
    draw() {
      ctx.fillStyle = 'rgba(8,6,12,0.9)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#e0b040';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('CLAW MACHINE', VIEW_W / 2, 56);
      ctx.fillStyle = '#f4ecd8';
      ctx.font = '15px monospace';
      ctx.fillText(`SCORE ${score}   CAUGHT ${caught}   TRIES LEFT ${Math.max(0, triesLeft)}`, VIEW_W / 2, 78);

      // glass case
      ctx.strokeStyle = 'rgba(200,220,255,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(CASE_LEFT - 20, RAIL_Y - 40, CASE_RIGHT - CASE_LEFT + 40, FLOOR_Y - RAIL_Y + 60);
      ctx.fillStyle = 'rgba(200,220,255,0.05)';
      ctx.fillRect(CASE_LEFT - 20, RAIL_Y - 40, CASE_RIGHT - CASE_LEFT + 40, FLOOR_Y - RAIL_Y + 60);
      // planter-box floor of the case
      ctx.fillStyle = '#3c5c40';
      ctx.fillRect(CASE_LEFT - 20, FLOOR_Y + 14, CASE_RIGHT - CASE_LEFT + 40, 16);

      // prize chute off to the right
      ctx.fillStyle = '#6a4a2c';
      ctx.fillRect(CHUTE_X - 16, RAIL_Y - 46, 32, 24);
      ctx.fillStyle = '#8a6438';
      ctx.fillRect(CHUTE_X - 12, RAIL_Y - 42, 24, 16);
      ctx.fillStyle = '#f4ecd8';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('WIN', CHUTE_X, RAIL_Y - 52);

      flowers.forEach((f) => drawFlower(f, FLOOR_Y));
      if (held) drawFlower(held, clawY + 20);
      drawClawArm(clawX, clawY, !!held || (phase === 'drop' && clawY >= FLOOR_Y - 6));

      pops.forEach((p) => {
        ctx.globalAlpha = Math.max(0, p.life / 0.7);
        ctx.fillStyle = p.color;
        ctx.font = 'bold 16px monospace';
        ctx.fillText(p.text, p.x, p.y - 10);
        ctx.globalAlpha = 1;
      });

      ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#8cff5f' : '#f4ecd8';
      ctx.font = 'bold 17px monospace';
      if (phase === 'done') {
        ctx.fillText(`OUT OF TRIES! FINAL SCORE: ${score} - PRESS E TO LEAVE`, VIEW_W / 2, 420);
      } else if (phase === 'aim') {
        ctx.fillText('- HOLD \u25c0 \u25b6 TO AIM, TAP E TO DROP -', VIEW_W / 2, 420);
      }

      if (phase === 'done') {
        ctx.font = '14px monospace';
        ctx.fillStyle = isNewBest ? '#8cff5f' : '#9a90a8';
        ctx.fillText(isNewBest ? 'NEW BEST!' : `BEST: ${bestFor('clawmachine')}`, VIEW_W / 2, 438);
      }

      ctx.fillStyle = '#6a6070';
      ctx.font = '13px monospace';
      ctx.fillText('X to walk away anytime', VIEW_W / 2, phase === 'done' ? 456 : 444);
    },
  };
}

// ---- claw machine mode chooser -----------------------------------------------
function createClawMachineModeSelect() {
  return createModeSelectMenu({
    title: 'CLAW MACHINE',
    pickLabel: 'PICK YOUR CABINET',
    classicSub: 'The original flat glass case',
    threeDSub: 'Reach right into the case -- full 3D',
    createClassic: () => createClawMachineGame(),
    createThreeD: () => createClawMachine3DGame(),
  });
}

// ---- Claw Machine 3D --------------------------------------------------------
// The Three.js remake of Claw Machine. Identical gameplay contract to the
// classic version -- same 6 tries, same weighted flower types/grab chances/
// point values, same GRAB_RADIUS logic, same 22% post-grab fumble chance,
// same 'clawmachine' trophy -- only the rendering changed: a real glass
// case with a planter floor, a claw that actually descends on a rod and
// opens/closes its fingers, and flowers built from primitives instead of
// drawn circles. The scene renders to an offscreen WebGL canvas (see
// getMinigame3DRenderer()) that gets blitted into the main 2D canvas each
// frame, so input handling, CSS scaling, and the rAF loop are all
// untouched, and the HUD is drawn over the blit with the same monospace
// styling every other mini-game uses.
function createClawMachine3DGame() {
  const T = window.THREE;
  const { renderer, canvas: claw3DCanvas } = getMinigame3DRenderer('clawmachine');

  // ---- gameplay state: mirrors createClawMachineGame exactly, just in
  // world-space units instead of screen pixels (world Y increases upward,
  // so "descending" now means clawY decreasing toward FLOOR_Y).
  const TRIES_TOTAL = 6;
  const RAIL_Y = 1.85;                // claw's resting height, top of the case
  const FLOOR_Y = 0.25;               // where flowers sit at the bottom of the case
  const CASE_X_HALF = 1.3;
  const CASE_Z = -2.6, CASE_DEPTH = 0.85;
  const CLAW_SPEED = 1.4;             // world units/sec sliding left/right
  const DROP_SPEED = 1.8;             // world units/sec descending/ascending
  const GRAB_RADIUS = 0.16;           // how close, in x, the claw needs to be to a flower to try grabbing it
  const CHUTE_X = CASE_X_HALF + 0.55, CHUTE_Y = RAIL_Y;

  const FLOWER_TYPES = [
    { type: 'daisy', pts: 10, grabChance: 0.85, petal: '#f4ecd8', center: '#e0b040', weight: 5 },
    { type: 'tulip', pts: 20, grabChance: 0.65, petal: '#d94f9a', center: '#e0b040', weight: 3 },
    { type: 'rose',  pts: 40, grabChance: 0.45, petal: '#c0392b', center: '#8e2418', weight: 1 },
  ];
  function pickType() {
    const total = FLOWER_TYPES.reduce((s, o) => s + o.weight, 0);
    let r = Math.random() * total;
    for (const o of FLOWER_TYPES) { if (r < o.weight) return o; r -= o.weight; }
    return FLOWER_TYPES[0];
  }
  function spawnFlowerData(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        id: i,
        x: -CASE_X_HALF + 0.18 + Math.random() * (CASE_X_HALF * 2 - 0.36),
        z: CASE_Z + (Math.random() - 0.5) * (CASE_DEPTH - 0.15),
        wobble: Math.random() * 10,
        ...pickType(),
      });
    }
    return out;
  }

  let triesLeft = TRIES_TOTAL;
  let score = 0, caught = 0;
  let phase = 'aim';         // aim | drop | rise | deliver | done
  let clawX = 0, clawY = RAIL_Y;
  let held = null;           // flower currently gripped, or null
  let message = null;        // { text, color, timer } -- one-at-a-time HUD callout
  let bestRecorded = false, isNewBest = false;
  let t = 0;

  function showMessage(text, color, dur) { message = { text, color, timer: dur }; }

  // Common exit for the drop/rise/deliver branches: back to aiming if
  // there's a try and a flower left to go for, otherwise the round's over.
  function afterAttempt() {
    phase = (triesLeft > 0 && flowers.length > 0) ? 'aim' : 'done';
  }

  function nearestFlower(x) {
    let best = null, bestD = Infinity;
    flowers.forEach((f) => {
      const d = Math.abs(f.x - x);
      if (d < GRAB_RADIUS && d < bestD) { best = f; bestD = d; }
    });
    return best;
  }

  // ---- scene ----
  const scene = new T.Scene();
  scene.background = new T.Color(0x0a0714);
  scene.fog = new T.Fog(0x0a0714, 6, 16);

  const camera = new T.PerspectiveCamera(52, VIEW_W / VIEW_H, 0.1, 30);
  const CAM_POS = new T.Vector3(0, 1.5, 1.1);
  const CAM_Z_IN = -0.25;
  let camZ = CAM_POS.z;
  camera.position.copy(CAM_POS);
  camera.lookAt(0, (RAIL_Y + FLOOR_Y) / 2, CASE_Z);

  // room: dark backdrop, same purple family as the rest of the world
  const wall = new T.Mesh(
    new T.PlaneGeometry(12, 7),
    new T.MeshStandardMaterial({ color: 0x150f1c, roughness: 1 })
  );
  wall.position.set(0, 2.6, -4.0);
  wall.receiveShadow = true;
  scene.add(wall);
  const floor = new T.Mesh(
    new T.PlaneGeometry(12, 14),
    new T.MeshStandardMaterial({ color: 0x1c1422, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -2);
  floor.receiveShadow = true;
  scene.add(floor);

  // glass case: transparent box with visible edges, plus a planter-box
  // floor at the bottom -- same footprint as the classic's stroked rect
  const caseCenterY = (RAIL_Y + FLOOR_Y) / 2 + 0.15;
  const caseH = RAIL_Y - FLOOR_Y + 0.5, caseW = CASE_X_HALF * 2 + 0.3, caseD = CASE_DEPTH + 0.3;
  const glassMat = new T.MeshPhysicalMaterial({
    color: 0xc8dcff, transparent: true, opacity: 0.07, roughness: 0.1,
    metalness: 0, transmission: 0.6, side: T.DoubleSide,
  });
  const glassBox = new T.Mesh(new T.BoxGeometry(caseW, caseH, caseD), glassMat);
  glassBox.position.set(0, caseCenterY, CASE_Z);
  scene.add(glassBox);
  const glassEdges = new T.LineSegments(
    new T.EdgesGeometry(new T.BoxGeometry(caseW, caseH, caseD)),
    new T.LineBasicMaterial({ color: 0xc8dcff, transparent: true, opacity: 0.5 })
  );
  glassEdges.position.copy(glassBox.position);
  scene.add(glassEdges);

  const planter = new T.Mesh(
    new T.BoxGeometry(caseW, 0.14, caseD),
    new T.MeshStandardMaterial({ color: 0x3c5c40, roughness: 0.9 })
  );
  planter.position.set(0, FLOOR_Y - 0.08, CASE_Z);
  planter.receiveShadow = true;
  scene.add(planter);

  // rail the claw's carriage rides along, top of the case
  const railBar = new T.Mesh(
    new T.BoxGeometry(caseW - 0.1, 0.04, 0.04),
    new T.MeshStandardMaterial({ color: 0x5a4a6a, roughness: 0.6, metalness: 0.3 })
  );
  railBar.position.set(0, RAIL_Y + 0.1, CASE_Z);
  scene.add(railBar);

  // prize chute off to the right
  const chuteOuter = new T.Mesh(
    new T.BoxGeometry(0.3, 0.22, 0.28),
    new T.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.85 })
  );
  chuteOuter.position.set(CHUTE_X, RAIL_Y - 0.1, CASE_Z);
  chuteOuter.castShadow = true;
  scene.add(chuteOuter);
  const chuteInner = new T.Mesh(
    new T.BoxGeometry(0.22, 0.15, 0.05),
    new T.MeshStandardMaterial({ color: 0x8a6438, roughness: 0.8 })
  );
  chuteInner.position.set(CHUTE_X, RAIL_Y - 0.1, CASE_Z + CASE_DEPTH / 2 - 0.02);
  scene.add(chuteInner);

  // flowers: built from primitives, one group per flower, kept alive for
  // the flower's whole lifetime (floor -> held -> either back to the floor
  // on a fumble, or disposed once delivered)
  function buildFlowerMesh(f) {
    const g = new T.Group();
    const stem = new T.Mesh(
      new T.CylinderGeometry(0.008, 0.012, 0.22, 6),
      new T.MeshStandardMaterial({ color: 0x4f9a52, roughness: 0.85 })
    );
    stem.position.y = 0.11;
    g.add(stem);
    const head = new T.Group();
    head.position.y = 0.23;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const petal = new T.Mesh(
        new T.SphereGeometry(0.035, 8, 6),
        new T.MeshStandardMaterial({ color: f.petal, roughness: 0.7 })
      );
      petal.scale.set(1, 0.5, 0.6);
      petal.position.set(Math.cos(a) * 0.045, 0, Math.sin(a) * 0.045);
      head.add(petal);
    }
    const center = new T.Mesh(
      new T.SphereGeometry(0.025, 10, 8),
      new T.MeshStandardMaterial({ color: f.center, roughness: 0.6 })
    );
    head.add(center);
    g.add(head);
    g.userData.head = head;
    g.castShadow = true;
    scene.add(g);
    return g;
  }

  let flowers = spawnFlowerData(9);
  flowers.forEach((f) => { f.mesh = buildFlowerMesh(f); });

  function disposeFlowerMesh(f) {
    if (!f.mesh) return;
    scene.remove(f.mesh);
    f.mesh.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    f.mesh = null;
  }

  // claw rig: a rod from the rail down to the fingers, plus a small
  // carriage riding the rail and two fingers that open/close
  const carriage = new T.Mesh(
    new T.BoxGeometry(0.14, 0.08, 0.14),
    new T.MeshStandardMaterial({ color: 0x9a90a8, roughness: 0.5, metalness: 0.35 })
  );
  scene.add(carriage);
  const clawRod = new T.Mesh(
    new T.CylinderGeometry(0.012, 0.012, 1, 8),
    new T.MeshStandardMaterial({ color: 0x5a5060, roughness: 0.6 })
  );
  scene.add(clawRod);
  const clawHead = new T.Mesh(
    new T.BoxGeometry(0.09, 0.05, 0.09),
    new T.MeshStandardMaterial({ color: 0x9a90a8, roughness: 0.5, metalness: 0.3 })
  );
  scene.add(clawHead);
  const fingerMat = new T.MeshStandardMaterial({ color: 0xc8bcd8, roughness: 0.4, metalness: 0.4 });
  const fingerL = new T.Mesh(new T.ConeGeometry(0.018, 0.11, 6), fingerMat);
  const fingerR = new T.Mesh(new T.ConeGeometry(0.018, 0.11, 6), fingerMat);
  fingerL.rotation.z = 0.55;
  fingerR.rotation.z = -0.55;
  scene.add(fingerL, fingerR);
  let fingerSpread = 0.09;

  // lights: warm spot into the case, dim ambient, matching the rest of the
  // world's palette
  scene.add(new T.AmbientLight(0x352c40, 0.8));
  const spot = new T.SpotLight(0xffe2c0, 1.0, 14, 0.5, 0.45);
  spot.position.set(0, 3.6, -1.4);
  spot.target = glassBox;
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  scene.add(spot);
  scene.add(spot.target);

  let shakeT = 0;
  let impactRing = null, impactT = 0;

  function disposeImpactRing() {
    if (!impactRing) return;
    scene.remove(impactRing);
    impactRing.geometry.dispose();
    impactRing.material.dispose();
    impactRing = null;
  }
  function spawnImpact(pos, color) {
    disposeImpactRing();
    impactRing = new T.Mesh(
      new T.TorusGeometry(0.09, 0.012, 8, 28),
      new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
    );
    impactRing.position.copy(pos);
    scene.add(impactRing);
    impactT = 0;
  }

  // Full teardown -- called right before every exitMinigame().
  function cleanup() {
    disposeImpactRing();
    flowers.forEach((f) => disposeFlowerMesh(f));
    if (held) disposeFlowerMesh(held);
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
    scene.clear();
  }
  function leave() { cleanup(); exitMinigame(); }

  return {
    update(dt) {
      t += dt;
      if (buyPressed) { leave(); return; }

      if (phase === 'aim') {
        let dx = 0;
        if (keys['arrowleft'] || keys['a']) dx -= 1;
        if (keys['arrowright'] || keys['d']) dx += 1;
        clawX += dx * CLAW_SPEED * dt;
        clawX = Math.max(-CASE_X_HALF + 0.1, Math.min(CASE_X_HALF - 0.1, clawX));
        if (interactPressed && triesLeft > 0) phase = 'drop';
      } else if (phase === 'drop') {
        clawY -= DROP_SPEED * dt;
        if (clawY <= FLOOR_Y) {
          clawY = FLOOR_Y;
          const f = nearestFlower(clawX);
          if (f && Math.random() < f.grabChance) {
            held = f;
            flowers = flowers.filter((x) => x !== f);
          }
          phase = 'rise';
        }
      } else if (phase === 'rise') {
        clawY += DROP_SPEED * dt;
        if (clawY >= RAIL_Y) {
          clawY = RAIL_Y;
          triesLeft--;
          if (held) {
            // one more chance for the claw to fumble it before the chute
            if (Math.random() < 0.22) {
              showMessage('SLIPPED!', '#e0603a', 0.7);
              spawnImpact(new T.Vector3(clawX, RAIL_Y, CASE_Z), 0xe0603a);
              shakeT = 0.14;
              held.x = clawX;
              flowers.push(held);
              held = null;
              afterAttempt();
            } else {
              phase = 'deliver';
            }
          } else {
            showMessage('MISS', '#9a90a8', 0.6);
            afterAttempt();
          }
        }
      } else if (phase === 'deliver') {
        const dxp = CHUTE_X - clawX;
        clawX += Math.sign(dxp) * CLAW_SPEED * 1.3 * dt;
        if (Math.abs(dxp) < 0.03) {
          score += held.pts;
          caught++;
          showMessage(`+${held.pts}`, '#8cff5f', 0.7);
          spawnImpact(new T.Vector3(CHUTE_X, CHUTE_Y, CASE_Z), 0x8cff5f);
          shakeT = 0.12;
          disposeFlowerMesh(held);
          held = null;
          afterAttempt();
        }
      } else if (phase === 'done') {
        if (!bestRecorded) { isNewBest = recordMinigameScore('clawmachine', score); bestRecorded = true; }
        if (interactPressed) { leave(); return; }
      }

      if (message) {
        message.timer -= dt;
        if (message.timer <= 0) message = null;
      }

      // flowers still on the floor: settle at their spot with a gentle sway
      flowers.forEach((f) => {
        f.mesh.position.set(f.x, FLOOR_Y, f.z);
        f.mesh.userData.head.position.x = Math.sin(t * 2 + f.wobble) * 0.02;
      });
      // the held flower rides along under the claw
      if (held) {
        held.mesh.position.set(clawX, clawY - 0.12, CASE_Z);
        held.mesh.userData.head.position.x = Math.sin(t * 3 + held.wobble) * 0.012;
      }

      // claw rig follows clawX/clawY every frame
      const railTopY = RAIL_Y + 0.1;
      carriage.position.set(clawX, railTopY, CASE_Z);
      clawRod.position.set(clawX, (railTopY + clawY) / 2, CASE_Z);
      clawRod.scale.y = Math.max(0.001, railTopY - clawY);
      clawHead.position.set(clawX, clawY, CASE_Z);
      const closed = !!held || (phase === 'drop' && clawY <= FLOOR_Y + 0.04);
      const targetSpread = closed ? 0.028 : 0.09;
      fingerSpread += (targetSpread - fingerSpread) * Math.min(1, dt * 10);
      fingerL.position.set(clawX - fingerSpread, clawY - 0.05, CASE_Z);
      fingerR.position.set(clawX + fingerSpread, clawY - 0.05, CASE_Z);

      if (impactRing) {
        impactT += dt;
        const k = Math.min(1, impactT / 0.35);
        impactRing.scale.setScalar(1 + k * 3);
        impactRing.material.opacity = 0.9 * (1 - k);
      }

      // camera: gentle idle sway, decaying impact shake
      const sway = Math.sin(t * 0.5) * 0.02;
      camera.position.set(CAM_POS.x + sway, CAM_POS.y + Math.sin(t * 0.7) * 0.01, camZ);
      if (shakeT > 0) {
        shakeT -= dt;
        const s = Math.max(0, shakeT / 0.14) * 0.02;
        camera.position.x += (Math.random() - 0.5) * s;
        camera.position.y += (Math.random() - 0.5) * s;
      }
      camera.lookAt(0, caseCenterY - 0.1, CASE_Z);
    },
    draw() {
      renderer.render(scene, camera);
      ctx.drawImage(claw3DCanvas, 0, 0);

      // HUD: same layout and styling as the classic version
      const cx = VIEW_W / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e0b040';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('CLAW MACHINE 3D', cx, 56);
      ctx.fillStyle = '#f4ecd8';
      ctx.font = '15px monospace';
      ctx.fillText(`SCORE ${score}   CAUGHT ${caught}   TRIES LEFT ${Math.max(0, triesLeft)}`, cx, 78);

      ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#8cff5f' : '#f4ecd8';
      ctx.font = 'bold 17px monospace';
      if (phase === 'done') {
        ctx.fillText(`OUT OF TRIES! FINAL SCORE: ${score} - PRESS E TO LEAVE`, cx, 540);
      } else if (message) {
        ctx.fillStyle = message.color;
        ctx.fillText(message.text, cx, 540);
      } else if (phase === 'aim') {
        ctx.fillText('- HOLD \u25c0 \u25b6 TO AIM, TAP E TO DROP -', cx, 540);
      }

      if (phase === 'done') {
        ctx.font = '14px monospace';
        ctx.fillStyle = isNewBest ? '#8cff5f' : '#9a90a8';
        ctx.fillText(isNewBest ? 'NEW BEST!' : `BEST: ${bestFor('clawmachine')}`, cx, 558);
      }

      ctx.fillStyle = '#6a6070';
      ctx.font = '13px monospace';
      ctx.fillText('X to walk away anytime', cx, phase === 'done' ? 576 : 564);
    },
  };
}

// Freestyle Scratch-DJ: twin turntables instead of beat match's one bar --
// a left needle (under [E]) and a right needle (under [Q]) sweep back and
// forth completely independently, at different speeds and out of phase
// with each other, so they're never lined up the same way twice. Each
// round the game calls out a hand; scratch that hand's key while its
// needle sits in the target zone to score, with a combo multiplier that
// climbs the longer the streak holds. Scratching the *wrong* hand -- or
// missing the zone -- resets the combo to zero. Same finite-rounds/score-
// then-exit shape and dark-overlay/monospace look as every mini-game in
// this file, just two sweeps instead of one, which is what actually makes
// it chaotic: the "wrong" needle never stops moving while you're focused
// on the one you were called for. Canvas primitives only, no new assets.
function createScratchDJGame() {
  const ROUNDS = 10;
  let phase = 'wait';        // 'wait' | 'result' | 'done'
  let round = 1;
  let score = 0;
  let combo = 0;
  let lastHitLabel = '';
  let resultTimer = 0;
  let bestRecorded = false, isNewBest = false;

  // Two independent needles. Different starting positions/directions and
  // speeds that ramp up separately each round, so they drift in and out
  // of sync with each other instead of ever settling into a rhythm.
  let leftPos = -1, leftDir = 1, leftSpeed = 1.05;
  let rightPos = 1, rightDir = -1, rightSpeed = 1.35;
  let expectedHand = Math.random() < 0.5 ? 'left' : 'right';

  const DECK_W = 210, DECK_H = 20;
  const leftCx = VIEW_W / 2 - 150, rightCx = VIEW_W / 2 + 150;
  const leftX = leftCx - DECK_W / 2, rightX = rightCx - DECK_W / 2;
  const deckY = 290;

  function hitFor(p) {
    const d = Math.abs(p);
    if (d <= 0.08) return { label: 'PERFECT!', pts: 50 };
    if (d <= 0.22) return { label: 'GOOD', pts: 25 };
    if (d <= 0.45) return { label: 'OK', pts: 10 };
    return { label: 'MISS', pts: 0 };
  }

  function nextRound() {
    round++;
    leftSpeed += 0.07;
    rightSpeed += 0.09;
    expectedHand = Math.random() < 0.5 ? 'left' : 'right';
    phase = 'wait';
  }

  return {
    update(dt) {
      if (phase === 'wait') {
        leftPos += leftDir * dt * leftSpeed;
        if (leftPos >= 1) { leftPos = 1; leftDir = -1; }
        if (leftPos <= -1) { leftPos = -1; leftDir = 1; }
        rightPos += rightDir * dt * rightSpeed;
        if (rightPos >= 1) { rightPos = 1; rightDir = -1; }
        if (rightPos <= -1) { rightPos = -1; rightDir = 1; }

        const pressedHand = interactPressed ? 'left' : (scratchPressed ? 'right' : null);
        if (pressedHand) {
          if (pressedHand !== expectedHand) {
            // wrong hand -- the chaotic penalty: combo dies, no points,
            // no matter how well-timed the press was.
            combo = 0;
            lastHitLabel = 'WRONG HAND!';
          } else {
            const pos = pressedHand === 'left' ? leftPos : rightPos;
            const res = hitFor(pos);
            const mult = 1 + Math.min(combo, 8) * 0.1;
            score += Math.round(res.pts * mult);
            combo = res.pts > 0 ? combo + 1 : 0;
            lastHitLabel = res.label;
          }
          phase = 'result';
          resultTimer = 0.6;
        }
      } else if (phase === 'result') {
        resultTimer -= dt;
        if (resultTimer <= 0) {
          if (round >= ROUNDS) phase = 'done';
          else nextRound();
        }
      } else if (phase === 'done') {
        if (!bestRecorded) { isNewBest = recordMinigameScore('scratchdj', score); bestRecorded = true; }
        if (interactPressed || scratchPressed) exitMinigame();
      }
      // X always bails out early, no matter the phase
      if (buyPressed) exitMinigame();
    },
    draw() {
      ctx.fillStyle = 'rgba(8,6,12,0.9)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#e0b040';
      ctx.font = 'bold 24px monospace';
      ctx.fillText('FREESTYLE SCRATCH-DJ', VIEW_W / 2, 56);
      ctx.fillStyle = '#f4ecd8';
      ctx.font = '15px monospace';
      ctx.fillText(`SCORE ${score}   COMBO x${combo}   ROUND ${Math.min(round, ROUNDS)}/${ROUNDS}`, VIEW_W / 2, 80);

      // called-hand callout, flashing above the deck it belongs to
      const calloutX = expectedHand === 'left' ? leftCx : rightCx;
      const flash = Math.floor(performance.now() / 250) % 2;
      if (phase === 'wait' && flash) {
        ctx.fillStyle = expectedHand === 'left' ? '#5fd0ff' : '#ff5fb0';
        ctx.font = 'bold 20px monospace';
        ctx.fillText('\u25bc', calloutX, deckY - 46);
      }

      [
        { cx: leftCx, x: leftX, pos: leftPos, label: 'LEFT [E]', color: '#5fd0ff', hand: 'left' },
        { cx: rightCx, x: rightX, pos: rightPos, label: 'RIGHT [Q/SK8]', color: '#ff5fb0', hand: 'right' },
      ].forEach((deck) => {
        const isCalled = deck.hand === expectedHand;
        // little vinyl platter above each deck, purely decorative flavor
        ctx.beginPath();
        ctx.arc(deck.cx, deckY - 34, 16, 0, Math.PI * 2);
        ctx.fillStyle = '#141018';
        ctx.fill();
        ctx.strokeStyle = deck.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(deck.cx, deckY - 34, 4, 0, Math.PI * 2);
        ctx.fillStyle = deck.color;
        ctx.fill();

        // deck bar + target zone
        ctx.strokeStyle = isCalled ? deck.color : 'rgba(244,236,216,0.35)';
        ctx.lineWidth = isCalled ? 3 : 2;
        ctx.strokeRect(deck.x, deckY, DECK_W, DECK_H);
        ctx.fillStyle = 'rgba(224,176,64,0.28)';
        const zoneW = DECK_W * 0.22; // matches the 'GOOD' (d <= 0.22) band
        ctx.fillRect(deck.cx - zoneW / 2, deckY, zoneW, DECK_H);
        ctx.fillStyle = 'rgba(224,176,64,0.55)';
        const perfectW = DECK_W * 0.08;
        ctx.fillRect(deck.cx - perfectW / 2, deckY, perfectW, DECK_H);

        // needle
        const nx = deck.x + DECK_W / 2 + deck.pos * (DECK_W / 2);
        ctx.strokeStyle = '#f4ecd8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(nx, deckY - 6);
        ctx.lineTo(nx, deckY + DECK_H + 6);
        ctx.stroke();

        ctx.fillStyle = deck.color;
        ctx.font = 'bold 13px monospace';
        ctx.fillText(deck.label, deck.cx, deckY + DECK_H + 22);
      });

      ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#e0b040' : '#f4ecd8';
      ctx.font = 'bold 16px monospace';
      if (phase === 'wait') ctx.fillText('- SCRATCH THE CALLED HAND ON THE BEAT -', VIEW_W / 2, 380);
      else if (phase === 'result') ctx.fillText(lastHitLabel, VIEW_W / 2, 380);
      else if (phase === 'done') ctx.fillText(`FINAL SCORE: ${score} - PRESS E TO LEAVE`, VIEW_W / 2, 380);

      if (phase === 'done') {
        ctx.font = '14px monospace';
        ctx.fillStyle = isNewBest ? '#8cff5f' : '#9a90a8';
        ctx.fillText(isNewBest ? 'NEW BEST!' : `BEST: ${bestFor('scratchdj')}`, VIEW_W / 2, 400);
      }

      ctx.fillStyle = '#6a6070';
      ctx.font = '13px monospace';
      ctx.fillText('X to walk away anytime', VIEW_W / 2, phase === 'done' ? 418 : 402);
    },
  };
}

// ---- scratch-dj mode chooser ------------------------------------------------
function createScratchDJModeSelect() {
  return createModeSelectMenu({
    title: 'SCRATCH-DJ',
    pickLabel: 'PICK YOUR SETUP',
    classicSub: 'The original twin-needle bars',
    threeDSub: 'Get behind the decks -- full 3D',
    createClassic: () => createScratchDJGame(),
    createThreeD: () => createScratchDJ3DGame(),
  });
}

// ---- Scratch-DJ 3D ----------------------------------------------------------
// The Three.js remake of Scratch-DJ. Identical gameplay contract to the
// classic version -- same two independent needle sweeps/speeds/ramps, same
// wrong-hand penalty, same hitFor() judging, same round count, same
// 'scratchdj' trophy -- only the rendering changed: a twin-deck DJ booth
// with two spinning turntables, each topped by a suspended neon rail whose
// glowing orb tracks that needle's sweep. The scene renders to an offscreen
// WebGL canvas (see getMinigame3DRenderer()) that gets blitted into the
// main 2D canvas each frame, so input handling, CSS scaling, and the rAF
// loop are all untouched, and the HUD is drawn over the blit with the same
// monospace styling every other mini-game uses.
function createScratchDJ3DGame() {
  const T = window.THREE;
  const { renderer, canvas: dj3DCanvas } = getMinigame3DRenderer('scratchdj');

  // ---- gameplay state: mirrors createScratchDJGame exactly
  const ROUNDS = 10;
  let phase = 'wait';        // 'wait' | 'result' | 'done'
  let round = 1;
  let score = 0;
  let combo = 0;
  let lastHitLabel = '';
  let resultTimer = 0;
  let bestRecorded = false, isNewBest = false;

  let leftPos = -1, leftDir = 1, leftSpeed = 1.05;
  let rightPos = 1, rightDir = -1, rightSpeed = 1.35;
  let expectedHand = Math.random() < 0.5 ? 'left' : 'right';
  let t = 0;

  function hitFor(p) {
    const d = Math.abs(p);
    if (d <= 0.08) return { label: 'PERFECT!', pts: 50, color: 0xffffff };
    if (d <= 0.22) return { label: 'GOOD', pts: 25, color: 0xe0b040 };
    if (d <= 0.45) return { label: 'OK', pts: 10, color: 0x9a90a8 };
    return { label: 'MISS', pts: 0, color: 0x6a6070 };
  }

  // ---- scene ----
  const LEFT_COLOR = 0x5fd0ff, RIGHT_COLOR = 0xff5fb0;
  const RAIL_LEN = 1.7;
  const LEFT_X = -1.15, RIGHT_X = 1.15;
  const RAIL_Y = 1.7, DECK_Z = -2.6;

  const scene = new T.Scene();
  scene.background = new T.Color(0x0a0714);
  scene.fog = new T.Fog(0x0a0714, 6, 16);

  const camera = new T.PerspectiveCamera(55, VIEW_W / VIEW_H, 0.1, 30);
  const CAM_POS = new T.Vector3(0, 1.4, 0.8);
  const CAM_Z_IN = -0.3;
  let camZ = CAM_POS.z;
  camera.position.copy(CAM_POS);
  camera.lookAt(0, RAIL_Y - 0.35, DECK_Z);

  // room: dark booth walls/floor, same purple family as the rest of the world
  const wallMat = new T.MeshStandardMaterial({ color: 0x150f1c, roughness: 1 });
  const wall = new T.Mesh(new T.PlaneGeometry(12, 7), wallMat);
  wall.position.set(0, 2.6, -4.0);
  wall.receiveShadow = true;
  scene.add(wall);

  const floorMat = new T.MeshStandardMaterial({ color: 0x1c1422, roughness: 0.9, metalness: 0.1 });
  const floor = new T.Mesh(new T.PlaneGeometry(12, 14), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -2);
  floor.receiveShadow = true;
  scene.add(floor);

  // DJ booth counter, spanning under both decks
  const counter = new T.Mesh(
    new T.BoxGeometry(3.2, 0.75, 0.7),
    new T.MeshStandardMaterial({ color: 0x1a1220, roughness: 0.7, metalness: 0.15 })
  );
  counter.position.set(0, 0.375, -1.9);
  counter.castShadow = true;
  counter.receiveShadow = true;
  scene.add(counter);
  const counterTrim = new T.Mesh(
    new T.BoxGeometry(3.24, 0.03, 0.74),
    new T.MeshStandardMaterial({ color: 0xe0b040, metalness: 0.6, roughness: 0.35 })
  );
  counterTrim.position.set(0, 0.75, -1.9);
  scene.add(counterTrim);

  // two turntables set into the counter top, one per hand/color
  const decks = {};
  [['left', LEFT_X, LEFT_COLOR], ['right', RIGHT_X, RIGHT_COLOR]].forEach(([hand, x, color]) => {
    const group = new T.Group();
    group.position.set(x, 0.77, -1.85);
    const platter = new T.Mesh(
      new T.CylinderGeometry(0.4, 0.4, 0.05, 40),
      new T.MeshStandardMaterial({ color: 0x14101a, roughness: 0.5, metalness: 0.4 })
    );
    platter.castShadow = true;
    group.add(platter);
    const ring = new T.Mesh(
      new T.TorusGeometry(0.4, 0.012, 10, 40),
      new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.4 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.026;
    group.add(ring);
    const label = new T.Mesh(
      new T.CircleGeometry(0.11, 24),
      new T.MeshStandardMaterial({ color: 0x0c0810, roughness: 0.6 })
    );
    label.rotation.x = -Math.PI / 2;
    label.position.y = 0.027;
    group.add(label);
    const tonearm = new T.Mesh(
      new T.BoxGeometry(0.42, 0.025, 0.025),
      new T.MeshStandardMaterial({ color: 0xd8d8e0, metalness: 0.7, roughness: 0.3 })
    );
    tonearm.position.set(0.28, 0.05, -0.28);
    tonearm.rotation.y = -0.5;
    group.add(tonearm);
    scene.add(group);
    decks[hand] = { group, ring, color };
  });

  // called-hand callout light, hovers above the correct deck when flashing
  const calloutArrow = new T.Mesh(
    new T.ConeGeometry(0.1, 0.16, 4),
    new T.MeshStandardMaterial({ color: LEFT_COLOR, emissive: LEFT_COLOR, emissiveIntensity: 1.4, roughness: 0.3 })
  );
  calloutArrow.rotation.x = Math.PI;
  scene.add(calloutArrow);

  // suspended neon rails: one per deck, reimagining each classic bar as a
  // hanging light fixture. GOOD band (0.44 width) + PERFECT band (0.16
  // width) match the classic's proportions exactly, both centered.
  function buildRail(x, color) {
    const group = new T.Group();
    group.position.set(x, RAIL_Y, DECK_Z);
    const track = new T.Mesh(
      new T.BoxGeometry(RAIL_LEN + 0.16, 0.045, 0.045),
      new T.MeshStandardMaterial({ color: 0x2a2030, roughness: 0.7 })
    );
    group.add(track);
    const goodBand = new T.Mesh(
      new T.BoxGeometry(RAIL_LEN * 0.44, 0.075, 0.075),
      new T.MeshStandardMaterial({ color: 0xe0a030, emissive: 0x4a3010, transparent: true, opacity: 0.5, roughness: 0.5 })
    );
    group.add(goodBand);
    const perfectBand = new T.Mesh(
      new T.BoxGeometry(RAIL_LEN * 0.08, 0.095, 0.095),
      new T.MeshStandardMaterial({ color: 0xf4ecd8, emissive: 0x888078, transparent: true, opacity: 0.65, roughness: 0.4 })
    );
    group.add(perfectBand);
    scene.add(group);
    [-RAIL_LEN / 2 - 0.08, RAIL_LEN / 2 + 0.08].forEach((cx) => {
      const cable = new T.Mesh(
        new T.CylinderGeometry(0.006, 0.006, 0.85, 6),
        new T.MeshStandardMaterial({ color: 0x241a2a, roughness: 0.9 })
      );
      cable.position.set(x + cx, RAIL_Y + 0.42, DECK_Z);
      scene.add(cable);
    });
    const orb = new T.Mesh(
      new T.SphereGeometry(0.075, 18, 18),
      new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1, roughness: 0.3 })
    );
    orb.castShadow = true;
    scene.add(orb);
    const glow = new T.PointLight(color, 0.7, 3);
    scene.add(glow);
    return { orb, glow };
  }
  const leftRail = buildRail(LEFT_X, LEFT_COLOR);
  const rightRail = buildRail(RIGHT_X, RIGHT_COLOR);

  function railX(base, p) { return base + p * (RAIL_LEN / 2 - 0.04); }
  leftRail.orb.position.set(railX(LEFT_X, leftPos), RAIL_Y, DECK_Z);
  leftRail.glow.position.copy(leftRail.orb.position);
  rightRail.orb.position.set(railX(RIGHT_X, rightPos), RAIL_Y, DECK_Z);
  rightRail.glow.position.copy(rightRail.orb.position);

  // lights: dim ambient plus a warm spot over the booth, matching the rest
  // of the world's palette
  scene.add(new T.AmbientLight(0x302840, 0.7));
  const spot = new T.SpotLight(0xffe2c0, 0.9, 14, 0.55, 0.5);
  spot.position.set(0, 3.4, -1.0);
  spot.target = counter;
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  scene.add(spot);
  scene.add(spot.target);

  // impact feedback state
  let shakeT = 0;
  const impactRings = {}; // hand -> { mesh, t }

  function spawnImpact(hand, rail, color) {
    if (impactRings[hand]) disposeImpact(hand);
    const ring = new T.Mesh(
      new T.TorusGeometry(0.075, 0.01, 8, 28),
      new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
    );
    ring.position.copy(rail.orb.position);
    scene.add(ring);
    impactRings[hand] = { mesh: ring, t: 0 };
  }
  function disposeImpact(hand) {
    const r = impactRings[hand];
    if (!r) return;
    scene.remove(r.mesh);
    r.mesh.geometry.dispose();
    r.mesh.material.dispose();
    delete impactRings[hand];
  }

  function nextRound() {
    round++;
    leftSpeed += 0.07;
    rightSpeed += 0.09;
    expectedHand = Math.random() < 0.5 ? 'left' : 'right';
    phase = 'wait';
  }

  function resetRailColor(hand) {
    const rail = hand === 'left' ? leftRail : rightRail;
    const color = hand === 'left' ? LEFT_COLOR : RIGHT_COLOR;
    rail.orb.material.color.setHex(color);
    rail.orb.material.emissive.setHex(color);
    rail.glow.color.setHex(color);
  }

  // Full teardown -- called right before every exitMinigame().
  function cleanup() {
    disposeImpact('left');
    disposeImpact('right');
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
    scene.clear();
  }
  function leave() { cleanup(); exitMinigame(); }

  return {
    update(dt) {
      t += dt;

      if (phase === 'wait') {
        leftPos += leftDir * dt * leftSpeed;
        if (leftPos >= 1) { leftPos = 1; leftDir = -1; }
        if (leftPos <= -1) { leftPos = -1; leftDir = 1; }
        rightPos += rightDir * dt * rightSpeed;
        if (rightPos >= 1) { rightPos = 1; rightDir = -1; }
        if (rightPos <= -1) { rightPos = -1; rightDir = 1; }

        const pressedHand = interactPressed ? 'left' : (scratchPressed ? 'right' : null);
        if (pressedHand) {
          if (pressedHand !== expectedHand) {
            combo = 0;
            lastHitLabel = 'WRONG HAND!';
            shakeT = 0.18;
            const rail = pressedHand === 'left' ? leftRail : rightRail;
            spawnImpact(pressedHand, rail, 0x6a6070);
            rail.orb.material.color.setHex(0x6a6070);
            rail.orb.material.emissive.setHex(0x6a6070);
            rail.glow.color.setHex(0x6a6070);
          } else {
            const pos = pressedHand === 'left' ? leftPos : rightPos;
            const res = hitFor(pos);
            const mult = 1 + Math.min(combo, 8) * 0.1;
            score += Math.round(res.pts * mult);
            combo = res.pts > 0 ? combo + 1 : 0;
            lastHitLabel = res.label;
            shakeT = res.pts > 0 ? 0.14 : 0.2;
            const rail = pressedHand === 'left' ? leftRail : rightRail;
            spawnImpact(pressedHand, rail, res.color);
            rail.orb.material.color.setHex(res.color);
            rail.orb.material.emissive.setHex(res.color);
            rail.glow.color.setHex(res.color);
          }
          phase = 'result';
          resultTimer = 0.6;
        }
      } else if (phase === 'result') {
        resultTimer -= dt;
        if (resultTimer <= 0) {
          if (round >= ROUNDS) phase = 'done';
          else {
            nextRound();
            resetRailColor('left');
            resetRailColor('right');
            disposeImpact('left');
            disposeImpact('right');
          }
        }
      } else if (phase === 'done') {
        if (!bestRecorded) { isNewBest = recordMinigameScore('scratchdj', score); bestRecorded = true; }
        if (interactPressed || scratchPressed) { leave(); return; }
      }

      leftRail.orb.position.set(railX(LEFT_X, leftPos), RAIL_Y, DECK_Z);
      leftRail.glow.position.copy(leftRail.orb.position);
      rightRail.orb.position.set(railX(RIGHT_X, rightPos), RAIL_Y, DECK_Z);
      rightRail.glow.position.copy(rightRail.orb.position);

      // turntables spin faster with a hot combo
      decks.left.group.rotation.y += dt * (0.5 + combo * 0.3);
      decks.right.group.rotation.y -= dt * (0.5 + combo * 0.3);

      // called-hand callout hovers and pulses above the correct deck
      const calloutBase = expectedHand === 'left' ? LEFT_X : RIGHT_X;
      const calloutColor = expectedHand === 'left' ? LEFT_COLOR : RIGHT_COLOR;
      calloutArrow.position.set(calloutBase, 1.35 + Math.sin(t * 5) * 0.03, -1.55);
      calloutArrow.material.color.setHex(calloutColor);
      calloutArrow.material.emissive.setHex(calloutColor);
      calloutArrow.visible = phase === 'wait' && Math.floor(t * 4) % 2 === 0;

      Object.entries(impactRings).forEach(([hand, r]) => {
        r.t += dt;
        const k = Math.min(1, r.t / 0.32);
        r.mesh.scale.setScalar(1 + k * 3);
        r.mesh.material.opacity = 0.9 * (1 - k);
      });

      // camera: dolly in slightly on a result, gentle idle sway, decaying shake
      const wantZ = (phase === 'result' || phase === 'done') ? CAM_Z_IN : CAM_POS.z;
      camZ += (wantZ - camZ) * Math.min(1, dt * 5);
      const sway = Math.sin(t * 0.6) * 0.02;
      camera.position.set(CAM_POS.x + sway, CAM_POS.y + Math.sin(t * 0.8) * 0.01, camZ);
      if (shakeT > 0) {
        shakeT -= dt;
        const s = Math.max(0, shakeT / 0.2) * 0.025;
        camera.position.x += (Math.random() - 0.5) * s;
        camera.position.y += (Math.random() - 0.5) * s;
      }
      camera.lookAt(0, RAIL_Y - 0.35, DECK_Z);

      // X always bails out early, no matter the phase
      if (buyPressed) { leave(); return; }
    },
    draw() {
      renderer.render(scene, camera);
      ctx.drawImage(dj3DCanvas, 0, 0);

      // HUD: same layout and styling as the classic version
      const cx = VIEW_W / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e0b040';
      ctx.font = 'bold 24px monospace';
      ctx.fillText('FREESTYLE SCRATCH-DJ 3D', cx, 56);
      ctx.fillStyle = '#f4ecd8';
      ctx.font = '15px monospace';
      ctx.fillText(`SCORE ${score}   COMBO x${combo}   ROUND ${Math.min(round, ROUNDS)}/${ROUNDS}`, cx, 80);

      ctx.fillStyle = '#5fd0ff';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('LEFT [E]', cx - 150, 560);
      ctx.fillStyle = '#ff5fb0';
      ctx.fillText('RIGHT [Q/SK8]', cx + 150, 560);

      ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#e0b040' : '#f4ecd8';
      ctx.font = 'bold 16px monospace';
      if (phase === 'wait') ctx.fillText('- SCRATCH THE CALLED HAND ON THE BEAT -', cx, 522);
      else if (phase === 'result') ctx.fillText(lastHitLabel, cx, 522);
      else if (phase === 'done') ctx.fillText(`FINAL SCORE: ${score} - PRESS E TO LEAVE`, cx, 522);

      if (phase === 'done') {
        ctx.font = '14px monospace';
        ctx.fillStyle = isNewBest ? '#8cff5f' : '#9a90a8';
        ctx.fillText(isNewBest ? 'NEW BEST!' : `BEST: ${bestFor('scratchdj')}`, cx, 542);
      }

      ctx.fillStyle = '#6a6070';
      ctx.font = '13px monospace';
      ctx.fillText('X to walk away anytime', cx, 582);
    },
  };
}

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k) || k === ' ') e.preventDefault();
  if (!keys[k]) {
    if (k === 'e' || k === 'enter' || k === 'z' || k === ' ') interactPressed = true;
    if (k === 'x') buyPressed = true;
    if (k === 'q') scratchPressed = true;
    if (k === 'b') toggleSkate();
    if (k === 'm') music.toggleMute();
    if (k === 'c') toggleCoffee();
    if (k === 'y') toggleTea();
    if (k === 'k') saveGame(true);
    if (k === 'n' && (state === 'title' || state === 'play')) openDigChoice();
    if (k === 'h') {
      // [H] opens the hot-keys popup any time during gameplay, and closes
      // it again on a second press -- mirrors how other in-game popups
      // (portal, dialog) sit over 'play' without touching the menu music.
      if (state === 'play') { hotkeysReturnState = state; state = 'hotkeys'; }
      else if (state === 'hotkeys') { state = hotkeysReturnState; }
      // On the title screen itself, [H] just flips to/from the Hot Keys
      // page instead -- same key, same idea, no separate state needed.
      else if (state === 'title') { titlePage = titlePage === 0 ? 1 : 0; }
      // On the history slideshow, [H] pages forward the same as [E] (and
      // wraps back to digChoice from the last slide), so it's a consistent
      // "advance" key across every title-flow screen.
      else if (state === 'history') {
        if (historyPage < HISTORY_PAGES.length - 1) historyPage += 1;
        else { state = 'digChoice'; digChoiceIndex = 2; }
      }
    }
    if (k === 'escape' && state === 'hotkeys') { state = hotkeysReturnState; }
    if (k === 'v') {
      // [V] opens The Crate any time during gameplay, and closes it again
      // on a second press -- same open/close pattern as [H] for hotkeys.
      if (state === 'play') openCrate();
      else if (state === 'crate') state = crateReturnState;
    }
    if (k === 'escape' && state === 'crate') { state = crateReturnState; }
    if (k === 't') {
      // [T] opens the Trophy Case any time during gameplay, and closes it
      // again on a second press -- same open/close pattern as [V] for The
      // Crate and [H] for hotkeys.
      if (state === 'play') openTrophyCase();
      else if (state === 'trophies') state = trophyReturnState;
    }
    if (k === 'escape' && state === 'trophies') { state = trophyReturnState; }
    if (k === 'arrowleft') selectMove = -1;
    if (k === 'arrowright') selectMove = 1;
    if (k === 'arrowup') menuMove = -1;
    if (k === 'arrowdown') menuMove = 1;

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

// Beat-complete splash art — one per playable character, shown on the
// "BEAT COMPLETE!" screen once all 5 records for a world are collected.
// Keyed by the same character ids as CHARACTERS above.
const santosCheersImg = new Image();
santosCheersImg.src = 'assets/santos_cheers.png';
const ricoYanksCheersImg = new Image();
ricoYanksCheersImg.src = 'assets/rico_yanks_cheers.png';
const ricoHeiroCheersImg = new Image();
ricoHeiroCheersImg.src = 'assets/rico_heiro_cheers.png';
const CHARACTER_CHEERS_IMG = {
  santos:  santosCheersImg,
  ricoAlt: ricoYanksCheersImg,
  rico:    ricoHeiroCheersImg,
};

const characterSelectImg = new Image();
characterSelectImg.src = 'assets/character_select.png';
// Left-to-right order the character-select portraits appear in the art
// (green/NOFX = Santos, blue/cap = Rico in his hoodie, red/shades = classic
// Rico) — used both for keyboard left/right navigation and for mapping a
// tap's x-position to a character.
const SELECT_ORDER = ['santos', 'ricoAlt', 'rico'];
let selectIndex = 2; // highlighted portrait for keyboard/E users; defaults to classic Rico
let selectMove = 0;  // edge-triggered -1/0/1 from arrow keys, consumed in update()

// ---- title menu: START DIGGING / CONTINUE DIGGING -> slot chooser --------
// digChoice: 0 = START DIGGING, 1 = CONTINUE DIGGING, 2 = WHAT IS DIGGING?
const DIG_CHOICES = ['START DIGGING', 'CONTINUE DIGGING', 'WHAT IS DIGGING?'];
let digChoiceIndex = 0;
// pendingMode carries the player's dig-choice pick through the slot
// chooser and into the character-select screen, where it decides whether
// choosing a character starts fresh or loads a save.
let pendingMode = 'new';   // 'new' | 'continue'
let pendingSlot = 1;       // slot (1-3) chosen on the slot-chooser screen
let slotChoiceIndex = 0;
// When picking START DIGGING on a slot that already has a save, the player
// has to confirm the overwrite -- pressing E once "arms" that slot, and a
// second E on the SAME slot confirms it. Moving the selection or backing
// out clears the arm.
let armedOverwriteSlot = null;
// Page index (0-3) for the "WHAT IS DIGGING?" history slideshow -- see
// openHistory() and the 'history' state in update()/render().
let historyPage = 0;

// Opens the START/CONTINUE popup fresh -- used by the title screen's [E]
// prompt and by the 'N' key / NEW button as a way back into it mid-game.
function openDigChoice() {
  state = 'digChoice';
  digChoiceIndex = 0;
  armedOverwriteSlot = null;
  music.setMenuBreak(true);
}

// Opens the "WHAT IS DIGGING?" history slideshow from the digChoice screen.
// The player pages forward through the 4 slides with [E] (or the on-screen
// E button); [X] backs out early. Landing on the last slide and pressing
// [E] again returns to digChoice, same as backing out -- see the 'history'
// block in update().
function openHistory() {
  state = 'history';
  historyPage = 0;
  music.setMenuBreak(true);
}


function openSlotChoose(mode) {
  state = 'slotChoose';
  pendingMode = mode;
  slotChoiceIndex = 0;
  armedOverwriteSlot = null;
}

// Confirms whichever slot is currently highlighted on the slot-chooser
// screen, per pendingMode. Always ends by moving to the character-select
// screen; chooseCharacter() finishes the job (fresh start vs. load) once
// the player also picks a character.
function confirmSlotChoice() {
  const slot = slotChoiceIndex + 1;
  if (pendingMode === 'new') {
    if (hasSave(slot) && armedOverwriteSlot !== slot) {
      armedOverwriteSlot = slot; // first press just arms the overwrite
      return;
    }
    armedOverwriteSlot = null;
    pendingSlot = slot;
    newGame(slot); // wipes the slot, resets progress, state -> 'select'
  } else {
    // continue: an empty slot behaves just like starting fresh in it
    if (!hasSave(slot)) {
      pendingSlot = slot;
      newGame(slot);
    } else {
      pendingSlot = slot;
      state = 'select'; // actual loadGame() happens once a character is chosen
      music.setMenuBreak(true);
    }
  }
}
let selectLayout = null; // { originX, originY, scale } of the drawn select-screen art, set each frame it's drawn

// Startup splash: aggressively prioritize this asset because it is the
// very first thing the player should see. The preload hint starts the fetch
// before normal image discovery, while the Image object is kept for drawing.
(function preloadStartupSplash() {
  try {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = 'assets/splash.png';
    link.fetchPriority = 'high';
    document.head.appendChild(link);
  } catch (err) {
    // Older/embedded environments may not expose document.head or preload;
    // the Image object below remains the fallback.
  }
})();

const splashImg = new Image();
splashImg.decoding = 'sync';
splashImg.fetchPriority = 'high';
splashImg.loading = 'eager';
splashImg.src = 'assets/splash.png';

const purePopPosterImg = new Image();
purePopPosterImg.src = 'assets/purepop_poster.png';

const anthillBillboardImg = new Image();
anthillBillboardImg.src = 'assets/anthill_billboard.png';

const nectarsNeonImg = new Image();
nectarsNeonImg.src = 'assets/nectars_neon.png';

// The title screen's two full-art pages: page 0 is the original
// story/start screen, page 1 is the Hot Keys reference. Each is its own
// baked PNG (logo, copy, and "press [E]" prompt all included) sharing the
// same chroma-green backdrop, which gets keyed out in buildKeyedTitleMenu()
// so the drifting sky/clouds show through behind both -- see drawTitle().
const titleMenuPg1Img = new Image();
titleMenuPg1Img.src = 'assets/menu_title_pg_1.png';
const titleMenuPg2Img = new Image();
titleMenuPg2Img.src = 'assets/menu_title_pg_2.png';
// The "WHAT IS DIGGING?" history slideshow, opened from the digChoice
// screen (see openHistory()). Four full-art slides sharing the exact same
// chroma-green backdrop/frame style as the title-menu pages above, so they
// get keyed and drawn the same way -- see buildKeyedHistoryPage/drawHistory().
const historyImg1 = new Image();
historyImg1.src = 'assets/menu_title_history_1.png';
const historyImg2 = new Image();
historyImg2.src = 'assets/menu_title_history_2.png';
const historyImg3 = new Image();
historyImg3.src = 'assets/menu_title_history_3.png';
const historyImg4 = new Image();
historyImg4.src = 'assets/menu_title_history_4.png';
const HISTORY_PAGES = [historyImg1, historyImg2, historyImg3, historyImg4];
// Full-art backgrounds for the two title-menu popups (dig-choice and
// slot-chooser). The row text/highlight/slot data is still drawn live on
// top each frame -- see drawDigChoice/drawSlotChoose -- so these images
// mainly supply the frame, logo, and static labels/hints.
// Shared frame art for the two title-menu popups (dig-choice and
// slot-chooser): logo/border/hint baked in, with a blank content panel in
// the middle that we fill with live title text + rows each frame -- see
// drawDigChoice/drawSlotChoose.
const menuPopupSplashImg = new Image();
menuPopupSplashImg.src = 'assets/start_splash_1v2.png';
const titleSkyImg = new Image();
titleSkyImg.src = 'assets/title_sky.png';

// Full-art "record found" splash shown by drawRecordCard() when a record
// is picked up -- one PNG per record id, keyed to match worldRecords() for
// the town world (elm/cola/stab/choir/white). Each image already has the
// title, art, flavor text and "[E]" prompt baked in, so drawRecordCard()
// just centers and scales the right one; other worlds (no matching art
// yet) fall back to the procedural card -- see drawRecordCardFallback().
const RECORD_FOUND_IMGS = {
  elm:   new Image(),
  cola:  new Image(),
  stab:  new Image(),
  choir: new Image(),
  white: new Image(),
};
RECORD_FOUND_IMGS.elm.src   = 'assets/record_found_elm.png';
RECORD_FOUND_IMGS.cola.src  = 'assets/record_found_cola.png';
RECORD_FOUND_IMGS.stab.src  = 'assets/record_found_stab.png';
RECORD_FOUND_IMGS.choir.src = 'assets/record_found_choir.png';
RECORD_FOUND_IMGS.white.src = 'assets/record_found_white.png';

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

// Truth & Humble — grabbing a quick slice at Nectars before the freestyle
// cypher later at Green Door Studio. Same pre-drawn treatment as the rest.
const humbleImg = new Image();
humbleImg.src = 'assets/humble.png';

const hicksImg = new Image();
hicksImg.src = 'assets/hicks.png';

// MAVSTAR — veteran Vermont emcee, posted up at Junior's grabbing a quick
// slice before he heads over to Green Door Studio to get lively with the
// crew. Same pre-drawn treatment as the rest of the shop npcs above.
const mavstarImg = new Image();
mavstarImg.src = 'assets/mavstar.png';

// BOXGUTS — ferocious lyricist and SWAMP CAMP crew member, posted up at
// Junior's with MAVSTAR grabbing a slice before they both head over to
// Green Door Studio. Same pre-drawn treatment as the rest of the shop npcs
// above.
const boxgutsImg = new Image();
boxgutsImg.src = 'assets/boxguts.png';

// TRAV — skater and G FAM emcee, always ready to spit a verse, posted up
// inside Kountry Kart Deli. Same pre-drawn treatment as the rest of the
// shop npcs above.
const travImg = new Image();
travImg.src = 'assets/trav.png';

// ---------------------------------------------------------------- maps
const SOLID = new Set(['#', 'w', 'f', '~', 'W', 'T', 'C', 'c', 'K', 'J', 'S', 'A', 'N', 'F', 'R', 'V', 'Z']);

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

  // A haphazard tower of different-colored filing cabinets, stacked four
  // tiles high in the far northwest corner. Its top tile sits directly
  // beneath the tree bordering the map's north edge (row 0 is all trees),
  // so the stack reads as if it's been piled up right against that tree.
  // Solid landmark, talkable — no door, nothing inside, just a bit at
  // interact time.
  const FILING_CABINETS_X = 1, FILING_CABINETS_TOP_Y = 1, FILING_CABINETS_H = 4;
  const filingCabinets = [];
  for (let i = 0; i < FILING_CABINETS_H; i++) {
    const ty = FILING_CABINETS_TOP_Y + i;
    g[ty][FILING_CABINETS_X] = 'Z';
    filingCabinets.push({ tx: FILING_CABINETS_X, ty });
  }

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
    doors: {}, crates: {}, npcs: [], riverTiles, filingCabinets,
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
        () => collected.has(recKey('town', 'cola'))
          ? 'Oh hey — heard you found the Cherry Cola 45. Rosie\'s been playing it behind the counter all week. Good bassline, man.'
          : null,
        'Anyway... peace! I am out!'
      ] },
    { id: 'willie', tx: 5, ty: 8, name: 'WILLIE',
      lines: [
        'Hey now, welcome to the wall! I\'m Willie — painter, free spirit, full of love and creativity.',
        'I paint what I feel about the day — the state of things, the color of people, all of it.',
        'Stay a while. Hang, create, talk some good bullshit about life. This wall\'s got room for one more coat.',
        () => completedWorlds.has('town')
          ? 'Word is you found every last record hiding around this town. That\'s a whole mural\'s worth of story right there.'
          : null,
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

// One unit of the filing-cabinet tower (see FILING_CABINETS_* in
// makeOverworld). Each tile in the stack gets its own color off this list,
// keyed by its row so the four units read as a mismatched, haphazard pile
// rather than a single repeated block.
const FILING_CABINET_COLORS = ['#c0392b', '#2f7dc4', '#e0a030', '#4a9e4a'];
function drawFilingCabinet(px, py, ty) {
  const color = FILING_CABINET_COLORS[(ty - 1) % FILING_CABINET_COLORS.length];
  // ground shadow so the stack reads as sitting on the grass, not floating
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(px + 2, py + TILE - 4, TILE - 4, 4);
  // cabinet body
  ctx.fillStyle = shadeColor(color, -30);
  ctx.fillRect(px + 3, py + 1, TILE - 6, TILE - 3);
  ctx.fillStyle = color;
  ctx.fillRect(px + 4, py + 2, TILE - 8, TILE - 5);
  // drawer split line through the middle
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(px + 4, py + Math.round(TILE / 2), TILE - 8, 1);
  // two drawer handles
  ctx.fillStyle = '#d8d0b8';
  ctx.fillRect(px + TILE / 2 - 5, py + 8, 10, 2);
  ctx.fillRect(px + TILE / 2 - 5, py + TILE - 11, 10, 2);
  // top highlight edge
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(px + 4, py + 2, TILE - 8, 2);
}

function makeShop(id, opts) {
  const W = 14, H = 10;
  const g = blankGrid(W, H, '=');
  for (let x = 0; x < W; x++) { g[0][x] = 'W'; g[H-1][x] = 'W'; }
  for (let y = 0; y < H; y++) { g[y][0] = 'W'; g[y][W-1] = 'W'; }
  // table footprint + keeper spot both default to the classic centered
  // layout, but either can be overridden per-shop (e.g. Green Door Studio
  // pushes both into the upper-right corner of the room). The table's row
  // always sits exactly one tile in front of (south of) the keeper's row,
  // so the keeper reads as standing behind the counter with a visual gap
  // between them — this holds automatically even if a shop overrides the
  // keeper's position, and for any shop added later.
  const keeperX = (opts.keeper && opts.keeper.x !== undefined) ? opts.keeper.x : 6;
  const keeperY = (opts.keeper && opts.keeper.y !== undefined) ? opts.keeper.y : 2;
  const tableRow = keeperY + 1;
  const tableStart = opts.tableRange ? opts.tableRange.start : 4;
  const tableEnd = opts.tableRange ? opts.tableRange.end : 9;
  if (!opts.noCounterTable) {
    for (let x = tableStart; x <= tableEnd; x++) g[tableRow][x] = 'T';
  }
  g[keeperY][keeperX] = 'K';
  g[H-1][6] = 'E';
  (opts.couchTiles || []).forEach(([cx, cy]) => { g[cy][cx] = 'S'; });
  (opts.armchairTiles || []).forEach(([cx, cy]) => { g[cy][cx] = 'A'; });
  if (opts.micStand) { g[opts.micStand[1]][opts.micStand[0]] = 'Y'; }
  // A standee cow prop — e.g. VT Comedy Club's mascot parked in a corner.
  if (opts.cowTile) { g[opts.cowTile[1]][opts.cowTile[0]] = 'V'; }
  (opts.gearTiles || []).forEach(([gx, gy]) => { g[gy][gx] = 'G'; });
  // Two-tile-wide recording desk (studio monitors + gear), with a hanging
  // neon sign above it — e.g. Zach's "SKYLAB" workstation in Green Door
  // Studio. opts.recordingDesk is [x, y] for the LEFT tile; the desk always
  // occupies that tile and the one directly to its right.
  if (opts.recordingDesk) {
    const [dx, dy] = opts.recordingDesk;
    g[dy][dx] = 'R';
    g[dy][dx + 1] = 'R';
  }
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
    deliShop: opts.deliShop || false,
    comedyClub: opts.comedyClub || false,
    circusInterior: opts.circusInterior || false,
    recordShop: opts.recordShop || false,
    plantShop: opts.plantShop || false,
    recordingDesk: opts.recordingDesk
      ? { x: opts.recordingDesk[0], y: opts.recordingDesk[1], sign: opts.recordingDeskSign || 'SKYLAB' }
      : null,
    // Mini-games placed in this shop (tx/ty/id/label per entry) -- this is
    // the one line that actually wires opts.minigames onto the map object;
    // without it, the glow/arcade-sign/interact system in render() and
    // facingTarget() has nothing to find, no matter what's listed above.
    minigames: opts.minigames || [],
  };
  // Default crate spots, in priority order. A shop can override which
  // tiles its own crates land on (e.g. Henry's Diner pushes its crates to
  // the right wall, clear of the magazine rack) via opts.crateSpots.
  const spots = opts.crateSpots || [[1,4],[1,6],[12,4],[12,6],[2,8],[11,8]];
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
    // Zach's "SKYLAB" workstation — a two-tile recording desk with studio
    // monitors, tucked into the back left corner of the room, with a
    // glowing neon sign hanging above it.
    recordingDesk: [1, 2],
    // dark couch along the right wall (with a throw pillow) plus a gold
    // armchair pulled up near the table, mirroring the photo's seating nook.
    // A second, longer couch runs along the bottom wall to the left of the
    // entrance (the door sits at tile x=6), so it doesn't block the doorway.
    couchTiles: [[12, 7], [12, 8], [1, 8], [2, 8], [3, 8]],
    couchPillow: { x: 12, y: 7 },
    armchairTiles: [[9, 4]],
    keeper: { name: 'SK1', shirt: '#1f1d26', skin: '#8a5a34', x: 9, y: 2,
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
          () => collected.has(recKey('town', 'elm'))
            ? 'Hold up — you actually pulled Elm Street Funk out of our own crates? Right under my nose. Respect.'
            : null,
          'Third Thursdays I run this booth till the breaker trips. Come through.',
        ] },
      { id: 'zach', tx: 2, ty: 3, name: 'SKYSPLITTERINK', sprite: 'zach',
        lines: [
          'This corner\'s mine — SKYLAB. Desk, monitors, the whole rig. Come check what I\'m cooking up.',
          'Zach — but around here everybody just says SkySplitterInk. Sound engineer, producer, full-time studio rat.',
          'I\'ve had a hand in more Vermont hip hop than I can count. If it came out of this scene, chances are it passed through these speakers.',
          'People call me a magician with sound. I just call it paying attention — EQ, levels, the pocket. It all matters.',
          () => collected.size >= 3
            ? 'Heard you\'ve been deep in the crates all over town. Respect — that\'s basically what digging for samples feels like.'
            : null,
          'This whole independent scene runs on people showing up for each other. I just try to make everybody\'s stuff sound as good as it deserves to.',
          'Got the MPC, got the notebook, got the headphones warmed up. Always cooking something back here.',
        ] },
    ],
    // Beat-matching mini-game, pushed up against the back wall (top row of
    // the room, right below the wall tile) instead of out on the floor.
    // ty nudged down 2 tiles from the wall so its top edge doesn't get
    // clipped by the wall tile above it.
    // Beat Jam sits on open floor near the bottom of the room, clear of
    // the gear tiles (4,7)/(10,7), the mic stand (7,5), and the couch run
    // along the bottom-left wall (1,8)/(2,8)/(3,8).
    minigames: [
      { id: 'beatmatch', tx: 5, ty: 3, label: 'PLAY BEAT MATCH' },
      { id: 'beatjam', tx: 9, ty: 7, label: 'FREESTYLE BEAT JAM' },
    ],
  }),
  wax: makeShop('wax', {
    // Exotic-plant-shop redesign: sage-green walls, warm wood-toned floor
    // planking — a jungly, sunlit greenhouse feel instead of the old
    // nightclub purple. drawHeyBudInterior() below adds the hanging
    // plants, book/tee shelving, street-art prints, and the "99" poster.
    floor: '#e4dcc0', plank: '#cfc29a', wallColor: '#3c5c40',
    plantShop: true,
    keeper: { name: 'DEE', shirt: '#d05a8a', skin: '#c89a72',
      lines: ['Welcome to Hey Bud — exotic plants, street art, books, tees. Water your soul, or just browse.',
              'Funny enough, a Velvet Horns pressing came in tangled up with a shipment of hanging planters.',
              'Should still be in a crate on the RIGHT side, behind the ferns.'],
      foundLine: 'Midnight Stab, right here at Hey Bud? Those horns are gonna grow on you.' },
    crates: [ { junkSeed: 3 }, { junkSeed: 4 }, { record: 'stab' }, { junkSeed: 5 } ],
    // Claw machine, set back on open floor between the two big tropical
    // potted plants flanking the doorway (tiles 4,8 and 9,8) -- clear of
    // the shelf/hoodie rack (cols 2-6), the tee table (~5,7), and the
    // glass display cases on the right wall (cols 10-13).
    minigames: [
      { id: 'clawmachine', tx: 7, ty: 8, label: 'CLAW MACHINE' },
    ],
  }),
  henrys: makeShop('henrys', {
    floor: '#e8dcc8', plank: '#d8c8a8', wallColor: '#8a2820',
    keeper: { name: 'EDNA', shirt: '#d87a9a', skin: '#c89268',
      lines: ['Thirty-four years on this floor, honey. I could pour coffee in my sleep. Some nights I do.',
              'I called the morning shift the day I started, and nobody\'s pried it out of my hands since.',
              'Menu\'s simple: burgers, fries, milkshakes. Don\'t make me explain a milkshake to you.',
              () => collected.has(recKey('town', 'white'))
                ? 'Somebody told me you found that White Label. No sleeve, no name — good ears, honey. That one\'s a legend around here.'
                : null],
      foundLine: 'Well butter my biscuit — is that a record? Keep on truckin\', kid.' },
    crates: [ { henrysSeed: 0 }, { henrysSeed: 1 } ],
    // Right side of the room, clear of the magazine rack at (1,4)/(1,6)
    // on the left wall (see drawMagazineRack in drawHenrysInterior).
    crateSpots: [[12,4],[12,6]],
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
    deliShop: true,
    // TRAV — skater and G FAM emcee, posted up with his board, always
    // ready to spit a verse for anybody who'll listen.
    npcs: [
      { id: 'trav', tx: 3, ty: 6, name: 'TRAV', sprite: 'trav',
        lines: [
          'Trav. Skate deck in one hand, sixteen bars in the other — I don\'t really put either one down.',
          'Any time, any place, I\'m ready to spit. You want a verse right here in the deli line? Say less.',
          'G FAM, that\'s the crew. We roll deep and we roll loud — pavement by day, mic by night.',
          'Board\'s got more scars than a heavy bag. Every chip\'s a story, every story\'s a bar waiting to happen.',
          'Grab a sandwich, stick around. I been known to freestyle off whatever\'s on the menu board.',
        ] },
    ],
    // Speed Sweep mini-game, set back on open floor -- clear of the counter
    // table (row 3), Trav (3,6), the corner crates (1,4)/(1,6)/(12,4)/(12,6),
    // and the deli case/cooler/newspaper-rack dressing drawn over cols 9-11
    // rows 5-6 and col 4 row 7 (see drawKountryKartDeliInterior).
    minigames: [
      { id: 'speedsweep', tx: 10, ty: 8, label: 'SPEED SWEEP' },
    ],
  }),
  thrift: makeShop('thrift', {
    floor: '#6a8a6a', plank: '#587a58', wallColor: '#3a4a3a',
    // Crate-digger's-dream redecoration: wall shelves stuffed with vinyl
    // spines, open bins of fanned sleeves, a built-in twin-turntable DJ
    // booth on the counter, loose record stacks, and a disco ball -- see
    // drawPurePopInterior().
    recordShop: true,
    keeper: { name: 'ZEKE', shirt: '#70b060', skin: '#9a7050',
      lines: ['Welcome to Pure Pop — new arrivals, deep cuts, the whole crate-digger’s dream.',
              'Some church choir gospel came in from an estate sale — real rare pressing.',
              'Might be filed on the RIGHT side. Might be misfiled entirely, honestly.'],
      foundLine: 'Galactic Hallelujah?! I nearly priced that thing at a dollar. Glad you found it first.' },
    crates: [ { junkSeed: 2 }, { junkSeed: 3 }, { junkSeed: 4 }, { record: 'choir' } ],
    // Crate Digging mini-game, set back on open floor -- clear of the
    // counter table (row 3), the keeper, and the four dig crates against
    // the left/right walls (cols 1 and 12).
    minigames: [
      { id: 'cratedig', tx: 9, ty: 7, label: 'DIG THE CRATES' },
    ],
  }),
  nectars: makeShop('nectars', {
    floor: '#1a1520', plank: '#0f0a15', wallColor: '#2a1a2f',
    noCounterTable: true,
    keeper: { name: 'BIGDOG', shirt: '#1a1a1a', skin: '#e8b48a',
      lines: ['Big up yourself — welcome to Nectar\'s! I\'m Big Dog, I run REGGAE NIGHT here every week.',
              'Best gravy fries in town, and once these decks get going the whole room\'s on good vibes.',
              'Vinyl? I spin off my own crates, but Nectar\'s itself doesn\'t stock records.',
              'Try Pure Pop Records for rare finds, or Hey Bud — they get weird stuff with plant shipments.',
              'Green Door Studio might have some old session reels too.'],
      foundLine: 'Big tune! That\'s the kind of find that makes Reggae Night legendary.' },
    crates: [ { nectarsSeed: 0 }, { nectarsSeed: 1 }, { nectarsSeed: 2 } ],
    // Pulled off the default left/right-wall spots (cols 1/12, rows 4/6),
    // which sat right behind the bar counter drawn in drawNectarsInterior
    // (cols 1-2, rows 4-6) and were half-hidden behind it. Lined up instead
    // along the bottom wall, clear of the door at (6,9) so the entrance
    // stays walkable, and clear of Truth/Humble at row 6 above.
    crateSpots: [[3,8],[7,8],[10,8]],
    darkClub: true,
    // Truth & Humble, grabbing a quick slice before the freestyle cypher
    // later tonight at Green Door Studio.
    npcs: [
      { id: 'truth', tx: 4, ty: 6, name: 'TRUTH', sprite: 'truth',
        lines: [
          'Truth, QSD, swamp life, all day. You already know.',
          'Cane\'s for style, not for support — don\'t get it twisted.',
          'Grabbing a quick slice before the cypher — Green Door\'s gonna be packed tonight.',
        ] },
      { id: 'humble', tx: 9, ty: 6, name: 'HUMBLE', sprite: 'humble',
        lines: [
          'Humble — staff in one hand, mic in the other. Come as you are.',
          'Fuel up now, save the energy for the cypher. Green Door gets loud once the bass drops.',
          'Third Thursdays hit different. See you over there in a bit.',
        ] },
    ],
    // Dartboard on the back wall, plus a pair of turntables tucked right
    // next to Big Dog's counter spot (6,2) for a quick scratch session --
    // same tx/ty-facing pattern as npcs above.
    minigames: [
      { id: 'darts', tx: 11, ty: 4, label: 'PLAY DARTS' },
      { id: 'scratchdj', tx: 3, ty: 2, label: 'SCRATCH DJ' },
    ],
  }),
  juniors: makeShop('juniors', {
    floor: '#c8a898', plank: '#b89888', wallColor: '#e8d8c8',
    keeper: { name: 'TONY', shirt: '#e8e8e8', skin: '#d8b898',
      lines: ['Hey! Welcome to Junior\'s — best slice in town, no question.',
              'Vinyl records? Nah, we sling pizza here, not platters.',
              'But I\'ll tell ya — Kountry Kart Deli has some old jukebox connections.',
              'And that art studio down the street? Those painters are always spinning something weird.'],
      foundLine: 'Grab a slice before you go. You\'ll need the energy!' },
    // Tony's own crates behind the counter -- all Italian soundtracks and
    // Sinatra/Rat Pack records. Good digging, great vibes, but never one
    // of the 5 records the player's actually after (see PIZZA_JUNK).
    crates: [ { pizzaSeed: 0 }, { pizzaSeed: 1 } ],
    pizzaShop: true,
    // MAVSTAR — veteran Vermont emcee, posted up by the counter grabbing a
    // quick slice before he heads to Green Door Studio for the cypher.
    // BOXGUTS — ferocious lyricist and SWAMP CAMP crew member, posted up
    // with him grabbing food before the same trip over to Green Door.
    npcs: [
      { id: 'mavstar', tx: 10, ty: 6, name: 'MAVSTAR', sprite: 'mavstar',
        lines: [
          'Yo. Mavstar. Some call me Magnus Ver Mavusson — I\'ve been pulling this scene uphill since before you had bars.',
          'Grabbing a slice quick. Gotta keep the energy up — Green Door\'s calling and the crew doesn\'t wait.',
          () => collected.has(recKey('town', 'elm'))
            ? 'Hold on — heard you already dug through the crates over at Green Door. Damn, you beat me there.'
            : null,
          'Every cypher I\'m in, I\'m sharpening something. Perfect ain\'t a destination, it\'s the whole walk.',
          'Vermont don\'t get enough credit for the pen game up here. I\'m out to fix that, one bar at a time.',
          'Catch me at Green Door later — mic\'s open, and I never let it stay quiet for long.',
        ] },
      { id: 'boxguts', tx: 3, ty: 6, name: 'BOXGUTS', sprite: 'boxguts',
        lines: [
          'Boxguts. Bars on bars on bars — I don\'t write filler, I don\'t write filler, I don\'t write filler.',
          'Rolling with Mavstar today. Grab a slice, save some bars, head to Green Door — that\'s the whole itinerary.',
          'Swamp Camp, that\'s my crew. We ain\'t soft — I\'ve wrestled gators with less attitude than some rappers.',
          'Choked out a copperhead before breakfast once. Booth\'s a lot less dangerous, but I bring the same energy.',
          'Living that swamp life up here in Vermont — long way from the bayou, bars translate anywhere though.',
        ] },
    ],
    // Order-up arcade sign, set back on open floor near the exit -- clear
    // of the counter table (row 3), the crates against the left wall
    // (col 1), and Mavstar/Boxguts posted up at (10,6)/(3,6).
    minigames: [
      { id: 'buildpizza', tx: 9, ty: 8, label: 'BUILD A PIZZA' },
    ],
  }),
  comedy: makeShop('comedy', {
    world: 'town',
    floor: '#241830', plank: '#1a1224', wallColor: '#3a1a52',
    keeper: { name: 'MITCH', shirt: '#3a4a2a', skin: '#c89a72',
      lines: ['I used to be a person. Now I\'m a bit. Same amount of people laughing, honestly.',
              'The mic doesn\'t need to be plugged in tonight. I\'m already not really here, so it evens out.',
              'I used to alphabetize my records. Then I died, and now I just get rid of the ones that come first. Efficient.',
              'I ordered a drink I can\'t drink. Just to hold it. The ice has a better future than I do, and it\'s made of water.',
              'I walked through a wall earlier. Didn\'t even do it on purpose, that\'s just Tuesday now.',
              'I sold a signed vinyl to Pure Pop Records once. Or I haunt their bargain bin. One of those. Both, maybe. Time\'s a weird thing for me now.',
              'I tell the same joke twice. I forget I already told it. It\'s funnier the second time — I really committed to the bit, apparently.',
              'Somebody asked if I have a shadow. No. But I still won\'t stand in the light. Habit, I guess.'],
      foundLine: 'Ha — that\'s a good one. I\'d write it down, but ghosts don\'t carry pens. Or pockets. Or hands, really.' },
    crates: [ { comedySeed: 0 } ],
    comedyClub: true,
    // Waiting on the corner stool for his set — sharp, skeptical,
    // no-patience-for-nonsense energy. A cigarette he never quite lights.
    npcs: [
      { id: 'skeptic', tx: 10, ty: 6, name: 'THE SKEPTIC', sprite: 'hicks',
        lines: [
          'You ever notice the news tells you what to be afraid of right before the commercial for the thing that fixes it? Funny how that works.',
          'They keep saying "think for yourself" on a t-shirt they sold you. Read that back.',
          'I\'m not cynical. Cynical implies I expected better. I read the fine print, that\'s all.',
          'Every generation thinks they invented questioning authority. No — authority just keeps counting on you forgetting.',
          'The smartest thing you can say in a room full of certainty is "wait, why though." Watch how fast people get uncomfortable.',
          'I quit trying to be liked by everybody. Turns out that\'s also when people started actually listening.',
        ] },
    ],
    // Corner arcade sign for the staring contest -- clear of the crate at
    // (1,4) and the skeptic NPC at (10,6).
    minigames: [
      { id: 'staringcontest', tx: 11, ty: 4, label: 'STARE DOWN THE CAT' },
    ],
  }),
  church: makeShop('church', {
    world: 'town',
    // Candy-pink floor, deep violet walls, big-top candy stripes, bunting
    // pennants along the ceiling line, rainbow confetti underfoot — the
    // sedate red-brick meetinghouse outside gives zero warning for this.
    // Full Ringling Bros. and Barnum & Bailey treatment: a trapeze flyer
    // swinging from the rafters, an elephant and lion flanking the ring,
    // and a pair of juggling clowns working the floor.
    floor: '#ffe1f2', plank: '#ffc4e0', wallColor: '#4a1268',
    paintFloor: true,
    confettiColors: ['#ff5fa2', '#5fd0ff', '#ffe14d', '#8cff5f', '#c85fff'],
    bigTopWalls: true,
    buntingFlags: true,
    muralWall: true,
    circusInterior: true,
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
        () => completedWorlds.has('town')
          ? 'Somebody in the front row shouted that you found every record in town. She dedicates the next verse to you. Whether you asked for it or not.'
          : null,
        'Somewhere between a whisper and a wail, she works through "Uninvited." Nobody invited this. Here we are anyway.',
        'Big finish: she closes it out on "Thank U," bowing so low her sequined cape nearly hits the floor.',
      ] },
    crates: [ { junkSeed: 3 }, { junkSeed: 7 } ],
    // Whack-a-Pigeon, tucked into open floor on the right side of the big
    // top -- clear of the counter table (row 3), the crates against the
    // left wall, and the carnival props flanking the ring.
    minigames: [
      { id: 'whackpigeon', tx: 9, ty: 6, label: 'WHACK-A-PIGEON' },
    ],
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
let state = 'splash'; // splash | title | digChoice | history | slotChoose | select | play | dialog | record | win | portal | fifa | minigame | hotkeys | crate | trophies
// State to snap back to when the [H] hotkeys popup is closed -- currently
// always 'play' since that's the only state H can be opened from, but kept
// as its own var in case another state wants to offer the popup later.
let hotkeysReturnState = 'play';
// The Crate -- a persistent collection book of every record found across
// every world (see WORLD_DEFS + drawCrate()). crateWorldIndex/crateSlotIndex
// track which world tab and which of that world's 5 slots the player is
// currently browsing; both reset to 0 whenever the crate is opened fresh so
// it always starts on the player's current world.
let crateReturnState = 'play';
let crateWorldIndex = 0;
let crateSlotIndex = 0;
// Trophy Case -- personal-best tracker for the 8 mini-games (see
// MINIGAME_TROPHIES + recordMinigameScore() below and drawTrophyCase()).
// personalBests maps a mini-game id to the best value reached so far; it
// rides along in the save file exactly like `collected`, so bests are
// per-slot, same as everything else about a playthrough. trophyIndex
// tracks which of the 8 rows the player is currently browsing, resetting
// to 0 whenever the case is opened fresh.
let personalBests = {};
let trophyReturnState = 'play';
let trophyIndex = 0;
// Which of the title screen's two pages is showing: 0 = the main title
// (story + start prompt), 1 = the Hot Keys page. Toggled with left/right
// (or [H]) while state === 'title'; reset to 0 any time the player lands
// back on the title screen fresh, so it never gets stuck on page 2.
let titlePage = 0;
let dialog = null;   // { name, lines, i }
let shownRecord = null;
let activePortal = null; // { x, y } tile the player walked into to open the portal popup
const completedWorlds = new Set(); // worlds whose 5 records have all been found
let toast = null;    // { text, t }

// ---------------------------------------------------------------- save / load
// Save/load only ever run on explicit checkpoints below (never once per
// frame), so this has zero effect on gameplay performance or loading times.
// The payload is a tiny JSON object (well under 1KB), and localStorage
// read/write for something that size is effectively instant.
//
// Three independent save slots (1-3) let a player keep multiple digs going
// at once. `currentSlot` is whichever slot the *active* playthrough reads
// from/writes to; it's set the moment a slot is chosen (fresh or continued)
// and every autosave/manual save from then on goes to that slot only.
const SAVE_KEY_PREFIX = 'ricoVinylQuest_save_v1_slot';
const LEGACY_SAVE_KEY = 'ricoVinylQuest_save_v1'; // pre-slots single save
const SAVE_SLOTS = [1, 2, 3];
let currentSlot = 1;

function slotKey(slot) { return SAVE_KEY_PREFIX + slot; }

function hasSave(slot) {
  try { return !!localStorage.getItem(slotKey(slot)); }
  catch { return false; }
}

// A save exists in ANY slot -- used only for one-time migration below.
function hasAnySave() { return SAVE_SLOTS.some(hasSave); }

// One-time migration: if this is a returning player with the old
// single-save format and slot 1 is empty, move it into slot 1 so nobody's
// progress disappears when this update ships.
(function migrateLegacySave() {
  try {
    const legacy = localStorage.getItem(LEGACY_SAVE_KEY);
    if (legacy && !hasSave(1)) {
      localStorage.setItem(slotKey(1), legacy);
      localStorage.removeItem(LEGACY_SAVE_KEY);
    }
  } catch (err) { console.warn('save migration failed:', err); }
})();

// Reads and validates a slot's save data without applying it to the live
// game state. Returns null for an empty, corrupt, or outdated slot.
function readSlot(slot) {
  try {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !CHARACTERS[data.character] || !maps[data.map]) return null;
    return data;
  } catch (err) {
    return null;
  }
}

// Short "SANTOS - Burlington" style summary for a slot chooser row, or null
// if the slot is empty/unreadable.
function slotSummary(slot) {
  const data = readSlot(slot);
  if (!data) return null;
  const label = (CHARACTERS[data.character] || {}).label || '???';
  const worldId = (maps[data.map] || {}).world;
  const place = (WORLD_DEFS[worldId] || {}).name || data.map;
  return `${label} \u2014 ${place}`;
}

// Writes the current progress to localStorage under currentSlot. Called
// silently at natural checkpoints (record found, world completed, room
// change) plus on demand from the SAVE button / 'K' key, where showToast
// lets the player know it actually happened.
function saveGame(showToast) {
  try {
    const data = {
      v: 1,
      character: selectedCharacter,
      map: player.map,
      x: player.x,
      y: player.y,
      dir: player.dir,
      collected: [...collected],
      completedWorlds: [...completedWorlds],
      bests: personalBests,
    };
    localStorage.setItem(slotKey(currentSlot), JSON.stringify(data));
    if (showToast) toast = { text: 'Game Saved', t: 1.2 };
  } catch (err) {
    // Private browsing, full storage, disabled storage, etc. -- never let a
    // save failure crash or interrupt the game.
    if (showToast) toast = { text: 'Save failed', t: 1.2 };
    console.warn('saveGame failed:', err);
  }
}

// Saves written before `collected` switched to world-qualified keys
// ("town:elm" instead of a bare "elm") stored the bare id. Every world that
// was actually reachable back then was 'town', so that's the only sensible
// home for a legacy id -- the fallback scan only matters if a bare id ever
// shows up that isn't a town record, which shouldn't happen in practice.
function migrateRecordId(id) {
  if (typeof id !== 'string' || id.includes(':')) return id; // already namespaced
  if (WORLD_DEFS.town.records[id]) return recKey('town', id);
  const worldId = Object.keys(WORLD_DEFS).find((w) => WORLD_DEFS[w].records[id]);
  return worldId ? recKey(worldId, id) : recKey('town', id);
}

// Restores progress from the given slot and drops the player straight into
// 'play' at their last position. Returns false (and leaves the game state
// untouched) if the slot is empty or corrupt/outdated.
function loadGame(slot) {
  const data = readSlot(slot);
  if (!data) return false;

  currentSlot = slot;
  selectedCharacter = data.character;
  player.map = data.map;
  player.x = data.x;
  player.y = data.y;
  player.dir = data.dir || 'down';
  player.moving = false;
  player.skating = false;
  player.holdingCoffee = false;
  player.holdingTea = false;
  player.tempItem = null;
  player.tempItemTimer = 0;

  collected.clear();
  (data.collected || []).forEach((id) => collected.add(migrateRecordId(id)));
  completedWorlds.clear();
  (data.completedWorlds || []).forEach((id) => completedWorlds.add(id));
  personalBests = { ...(data.bests || {}) };

  state = 'play';
  music.setMenuBreak(false);
  toast = { text: 'Game Loaded', t: 1.2 };
  return true;
}

// Wipes the given slot and resets progress, then sends the player to the
// character-select screen just like a first-time launch. currentSlot is
// updated so the checkpoint autosaves that follow land in this slot.
function newGame(slot) {
  currentSlot = slot;
  try { localStorage.removeItem(slotKey(slot)); } catch (err) { console.warn('newGame clear failed:', err); }
  collected.clear();
  completedWorlds.clear();
  personalBests = {};
  player.map = 'town';
  player.x = 19.5 * TILE;
  player.y = 12.5 * TILE;
  player.dir = 'down';
  player.skating = false;
  player.holdingCoffee = false;
  player.holdingTea = false;
  player.tempItem = null;
  player.tempItemTimer = 0;
  state = 'select';
  music.setMenuBreak(true);
}

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
// Behavior depends on how the player got here (see pendingMode, set by the
// START DIGGING / CONTINUE DIGGING -> slot-chooser flow):
//  - 'new':      fresh save in pendingSlot (already reset by newGame()).
//  - 'continue': loads pendingSlot's save, but the character picked HERE
//                (not the one stored in the save) is who you play as --
//                lets a player reskin a save without losing progress.
function chooseCharacter(id) {
  if (!CHARACTERS[id]) return;
  if (pendingMode === 'continue') {
    if (loadGame(pendingSlot)) {
      selectedCharacter = id;
      saveGame(); // keep the slot's stored character in sync with the pick
    } else {
      // slot vanished/corrupted between selection and now -- fail soft into
      // a fresh start rather than getting stuck.
      newGame(pendingSlot);
      selectedCharacter = id;
      state = 'play';
      music.setMenuBreak(false);
      saveGame();
    }
  } else {
    currentSlot = pendingSlot;
    selectedCharacter = id;
    state = 'play';
    music.setMenuBreak(false);
    saveGame(); // silent autosave checkpoint -- a save exists from the moment play begins
  }
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
    this.startTicker();
    this.installResumeGuards();
  },

  // The scheduler only works if `pump()` actually gets called on a steady
  // cadence. A plain main-thread setInterval shares its queue with every
  // synchronous bit of canvas drawing the game does each frame — the
  // outdoor map redraws a lot more per frame than an interior (see the
  // LOOKAHEAD comment below) — and on iPad Safari in particular, timer
  // callbacks queued behind that work fire far less consistently than on
  // desktop. A Worker's timers run on their own OS thread with their own
  // event loop, so they keep firing on schedule no matter how busy the
  // main thread's render work is; the worker just pings us and the actual
  // (cheap) scheduling call still happens here. This is the standard fix
  // for Web-Audio-timing-vs-busy-main-thread jank (see Chris Wilson's "A
  // Tale of Two Clocks"). If Workers/Blobs aren't available for some
  // reason, we fall back to the old plain setInterval so nothing breaks.
  startTicker() {
    try {
      const workerSrc = 'setInterval(() => postMessage(1), 25);';
      const blob = new Blob([workerSrc], { type: 'application/javascript' });
      const worker = new Worker(URL.createObjectURL(blob));
      worker.onmessage = () => this.pump();
      this._tickWorker = worker;
    } catch (e) {
      setInterval(() => this.pump(), 25);
    }
  },

  // iPadOS/iOS Safari will silently drop an AudioContext into 'suspended'
  // (backgrounding, multitasking transitions, some low-power situations)
  // without the game doing anything to cause it. A suspended context just
  // stops producing sound entirely rather than glitching, but resuming
  // proactively whenever the tab/page becomes active again means the
  // player never has to notice or work around it.
  installResumeGuards() {
    const tryResume = () => { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); };
    document.addEventListener('visibilitychange', tryResume);
    window.addEventListener('focus', tryResume);
    window.addEventListener('pageshow', tryResume);
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
    if (this.ctx.state === 'suspended') this.ctx.resume();
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
    saveGame(); // silent autosave checkpoint -- keeps "Continue" accurate to the room the player is in
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
    if (ch === 'T' && map.keeper && Math.abs(tx - map.keeper.x) <= 2 && ty === map.keeper.y + 1)
      return { type: 'keeper', data: map.keeper };
    if (ch === 'J') return { type: 'jukebox' };
    if (ch === 'Z') return { type: 'filingCabinets' };
    if (map.npcs) {
      const np = map.npcs.find(n => n.tx === tx && n.ty === ty);
      if (np) return { type: 'npc', data: np };
    }
    if (map.newsstands) {
      const ns = map.newsstands.find(n => n.tx === tx && n.ty === ty);
      if (ns) return { type: 'newspaper', data: ns };
    }
    if (map.minigames) {
      const mg = map.minigames.find(m => m.tx === tx && m.ty === ty);
      if (mg) return { type: 'minigame', data: mg };
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
    const lines = shopRecord && collected.has(recKey(currentWorldId(), shopRecord)) ? [k.foundLine] : resolveLines(k.lines);
    dialog = { name: k.name, lines, i: 0 };
    state = 'dialog';
  } else if (target.type === 'crate') {
    const c = target.data;
    if (!c) return;
    if (c.record && !collected.has(recKey(currentWorldId(), c.record))) {
      collected.add(recKey(currentWorldId(), c.record));
      music.enable(worldRecords()[c.record].layer);
      music.sting();
      shownRecord = c.record;
      state = 'record';
      saveGame(); // silent autosave checkpoint
    } else if (c.record) {
      dialog = { name: 'CRATE', lines: ['Nothing left in here but dust and old sleeves.'], i: 0 };
      state = 'dialog';
    } else if (c.comedySeed !== undefined) {
      dialog = { name: 'CRATE', lines: [COMEDY_JUNK[c.comedySeed % COMEDY_JUNK.length], 'Keep digging...'], i: 0 };
      state = 'dialog';
    } else if (c.pizzaSeed !== undefined) {
      dialog = { name: 'CRATE', lines: [PIZZA_JUNK[c.pizzaSeed % PIZZA_JUNK.length], 'Good vibes, but not what you\'re digging for.'], i: 0 };
      state = 'dialog';
    } else if (c.nectarsSeed !== undefined) {
      const nj = NECTARS_JUNK[c.nectarsSeed % NECTARS_JUNK.length];
      dialog = { name: 'CRATE', lines: [nj.line, nj.reply], i: 0 };
      state = 'dialog';
    } else if (c.henrysSeed !== undefined) {
      const hj = HENRYS_JUNK[c.henrysSeed % HENRYS_JUNK.length];
      dialog = { name: 'CRATE', lines: [hj.line, hj.reply], i: 0 };
      state = 'dialog';
    } else {
      dialog = { name: 'CRATE', lines: [JUNK[c.junkSeed % JUNK.length], 'Keep digging...'], i: 0 };
      state = 'dialog';
    }
  } else if (target.type === 'jukebox') {
    dialog = { name: 'JUKEBOX', lines: ['B7: "Cherry Cola Bounce". The button is worn smooth from decades of plays.'], i: 0 };
    state = 'dialog';
  } else if (target.type === 'filingCabinets') {
    dialog = { name: 'FILING CABINETS', lines: [
      'Of course the files you actually need are jammed in the very top drawer.',
      'No ladder. No stairs. Not even a stray milk crate to stand on. How is anybody supposed to get up there?',
      'You circle the whole stack twice and come away no closer to an answer.'
    ], i: 0 };
    state = 'dialog';
  } else if (target.type === 'npc') {
    const n = target.data;
    dialog = { name: n.name, lines: resolveLines(n.lines), i: 0 };
    state = 'dialog';
  } else if (target.type === 'newspaper') {
    const story = VERMONT_NEWS[Math.floor(Math.random() * VERMONT_NEWS.length)];
    dialog = { name: VERMONT_NEWS_PAPER, lines: [story.headline, story.body], i: 0 };
    state = 'dialog';
  } else if (target.type === 'minigame') {
    const start = MINIGAME_ACTIONS[target.data.id];
    if (start) start();
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
      // On the character-select screen (and the title screen's left/right
      // page flip) the d-pad's left/right taps need to drive selectMove
      // directly, the same way the keydown listener does for a physical
      // keyboard — held/synthetic key state alone never reaches update()'s
      // selectMove check.
      if (state === 'select' || state === 'title' || state === 'history') {
        if (k === 'arrowleft') selectMove = -1;
        if (k === 'arrowright') selectMove = 1;
      }
      // 'minigame' included for the darts mode chooser (classic vs 3D) --
      // running mini-games themselves ignore menuMove.
      if (state === 'digChoice' || state === 'slotChoose' || state === 'minigame') {
        if (k === 'arrowup') menuMove = -1;
        if (k === 'arrowdown') menuMove = 1;
      }
      // The Crate uses left/right for world tabs and up/down to browse
      // slots, same reasoning as the selectMove/menuMove cases above.
      if (state === 'crate') {
        if (k === 'arrowleft') selectMove = -1;
        if (k === 'arrowright') selectMove = 1;
        if (k === 'arrowup') menuMove = -1;
        if (k === 'arrowdown') menuMove = 1;
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
    scratchPressed = true; // doubles as the 2nd mini-game action button; harmless outside 'minigame'
    music.start();
    skBtn.classList.toggle('tc-on', player.skating);
  });
  wrap.appendChild(skBtn);

  // "Extras" — a small popup menu (cold brew, iced tea) so the resting
  // button cluster stays minimal instead of growing a permanent button
  // for every toggle.
  const extrasPanel = document.createElement('div');
  extrasPanel.id = 'extrasPanel';
  // A simple monochrome trophy silhouette (cup + handles + base), drawn as
  // inline SVG so it scales crisply at any size and inherits the button's
  // text color via currentColor/fill.
  const TROPHY_ICON_SVG = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M6 2h12v2h2a1 1 0 0 1 1 1v2c0 2.76-1.9 5.07-4.46 5.72A6.02 6.02 0 0 1 13 17.42V20h3v2H8v-2h3v-2.58a6.02 6.02 0 0 1-3.54-4.7C4.9 12.07 3 9.76 3 7V5a1 1 0 0 1 1-1h2V2zm0 4H5v1c0 1.5.91 2.78 2.2 3.34A8.5 8.5 0 0 1 6 7V6zm12 0v1c0 .82-.13 1.6-.37 2.34C18.91 8.78 19.82 7.5 19.82 6H18z"/>' +
    '</svg>';

  const extras = [
    ['BREW',  () => toggleCoffee(),     () => player.holdingCoffee],
    ['YERBA', () => toggleTea(),        () => player.holdingTea],
    ['CRATE', () => openCrate(),        () => false],
    ['SAVE',  () => saveGame(true),     () => false],
    ['NEW',   () => { openDigChoice(); },       () => false],
    ['TROPHY', () => openTrophyCase(),  () => false],
  ];
  extras.forEach(([label, action, isOn]) => {
    const btn = document.createElement('div');
    btn.className = 'tc-btn' + ((label === 'SAVE' || label === 'NEW' || label === 'CRATE') ? ' tc-important' : '')
      + (label === 'TROPHY' ? ' tc-trophy' : '');
    if (label === 'TROPHY') {
      btn.innerHTML = TROPHY_ICON_SVG;
      btn.setAttribute('aria-label', 'Trophy Case');
    } else {
      btn.textContent = label;
    }
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
  } else if (state === 'play') {
    // Tapping directly on a "TAP HERE TO PLAY AROUND" sign jumps straight
    // into that mini-game -- no need to walk up and face the exact tile.
    const rect = canvas.getBoundingClientRect();
    const vx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const vy = (e.clientY - rect.top) * (canvas.height / rect.height);
    const w = viewToWorld(vx, vy);
    const hit = minigameSignHitboxes.find(h => h.map === player.map &&
      Math.abs(w.x - h.cx) < h.hw && Math.abs(w.y - h.cy) < h.hh);
    if (hit) {
      const start = MINIGAME_ACTIONS[hit.id];
      if (start) start();
    }
  } else if (state === 'minigame' && activeMinigame && activeMinigame.onPointerDown) {
    // Lets a mini-game (e.g. Beat Jam's pads) answer a direct tap/click at
    // its own screen position, instead of only the generic "E" press every
    // other mini-game uses. Falls through to interactPressed for any
    // mini-game that doesn't define this.
    const rect = canvas.getBoundingClientRect();
    const vx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const vy = (e.clientY - rect.top) * (canvas.height / rect.height);
    activeMinigame.onPointerDown(vx, vy);
  } else {
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
// Paint the startup splash as early as possible. This does not wait for
// the rest of the game's assets to initialize.
if (state === 'splash') {
  drawSplash();
}

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
    if (interactPressed) { state = 'title'; titlePage = 0; music.setMenuBreak(true); }
  } else if (state === 'title') {
    // Left/right (physical arrows, on-screen d-pad, or [H]) still flips
    // between the two title pages directly; [E] instead steps through them
    // in order -- page 1 (story/start) advances to page 2 (hot keys), and
    // page 2 is what starts the dig-choice flow.
    if (selectMove) {
      titlePage = Math.max(0, Math.min(1, titlePage + selectMove));
      selectMove = 0;
    }
    if (interactPressed) {
      if (titlePage === 0) titlePage = 1; // page 1 (story) -> page 2 (hot keys) first
      else openDigChoice(); // page 2 (hot keys) -> START DIGGING / CONTINUE DIGGING
    }
    else if (buyPressed && titlePage === 1) titlePage = 0; // X = back to the main page
  } else if (state === 'digChoice') {
    if (menuMove) {
      digChoiceIndex = Math.max(0, Math.min(DIG_CHOICES.length - 1, digChoiceIndex + menuMove));
      menuMove = 0;
    }
    if (interactPressed) {
      if (digChoiceIndex === 2) openHistory();
      else openSlotChoose(digChoiceIndex === 0 ? 'new' : 'continue');
    }
    else if (buyPressed) { state = 'title'; titlePage = 0; music.setMenuBreak(true); } // X = back
  } else if (state === 'history') {
    // [\u2190]/[\u2192] (or the on-screen d-pad) let the player flip back and
    // forth freely to re-read a slide; [E] pages forward and, from the
    // last slide, returns to digChoice; [X] backs out to digChoice early.
    if (selectMove) {
      historyPage = Math.max(0, Math.min(HISTORY_PAGES.length - 1, historyPage + selectMove));
      selectMove = 0;
    }
    if (interactPressed) {
      if (historyPage < HISTORY_PAGES.length - 1) historyPage += 1;
      else { state = 'digChoice'; digChoiceIndex = 2; }
    }
    else if (buyPressed) { state = 'digChoice'; digChoiceIndex = 2; } // X = back out early
  } else if (state === 'slotChoose') {
    if (menuMove) {
      const newIndex = Math.max(0, Math.min(SAVE_SLOTS.length - 1, slotChoiceIndex + menuMove));
      if (newIndex !== slotChoiceIndex) armedOverwriteSlot = null; // moving cancels an overwrite arm
      slotChoiceIndex = newIndex;
      menuMove = 0;
    }
    if (interactPressed) confirmSlotChoice();
    else if (buyPressed) openDigChoice(); // X = back
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
        saveGame(); // silent autosave checkpoint
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
  } else if (state === 'hotkeys') {
    if (interactPressed || buyPressed) state = hotkeysReturnState;
  } else if (state === 'crate') {
    // Left/right flips between world tabs, up/down browses that world's 5
    // slots. Both are read-only browsing -- E, X, [V] and [Esc] all just
    // close the book, same as the hotkeys popup.
    if (selectMove) {
      const ids = crateWorldIds();
      crateWorldIndex = (crateWorldIndex + selectMove + ids.length) % ids.length;
      crateSlotIndex = 0;
      selectMove = 0;
    }
    if (menuMove) {
      const slots = WORLD_DEFS[crateWorldIds()[crateWorldIndex]].padOrder;
      crateSlotIndex = Math.max(0, Math.min(slots.length - 1, crateSlotIndex + menuMove));
      menuMove = 0;
    }
    if (interactPressed || buyPressed) state = crateReturnState;
  } else if (state === 'trophies') {
    // Up/down browses the 8 rows; E, X, [T] and [Esc] all just close the
    // case, same read-only-popup pattern as 'crate' and 'hotkeys'.
    if (menuMove) {
      trophyIndex = Math.max(0, Math.min(MINIGAME_TROPHIES.length - 1, trophyIndex + menuMove));
      menuMove = 0;
    }
    if (interactPressed || buyPressed) state = trophyReturnState;
  } else if (state === 'fifa') {
    if (performance.now() - fifaStartTime >= 5000) {
      state = fifaReturnState;
    }
  } else if (state === 'minigame') {
    if (activeMinigame) activeMinigame.update(dt);
  }
  interactPressed = false;
  buyPressed = false;
  scratchPressed = false;
  menuMove = 0;
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

// ---------------------------------------------------------------- mini-game arcade sign
// Every mini-game automatically gets this, driven entirely by each map's
// `minigames` list -- so a future mini-game only needs an entry there (plus
// one line in MINIGAME_ACTIONS) and it picks up the exact same look for
// free, with zero per-game drawing code required:
//   drawMinigameArcadeSign -- a small arcade-cabinet icon that floats and
//     bobs above the tile, marking "mini-game here" from across the room.
//     Sized off MINIGAME_OBJECT_SCALE below, so resizing every mini-game
//     object (current and future) is a one-line change.
// drawMinigameTileGlow is a no-op (glow removed) kept only so the render()
// call site doesn't need to change.
// Both are keyed off the same tile position and seed, so they stay in sync
// automatically for any mini-game added later.
let minigameSignHitboxes = []; // world-space rects, rebuilt every render() frame
let lastCam = { outside: true, camX: 0, camY: 0, zoom: 1, dx: 0, dy: 0 };

// Shared size for every mini-game object drawn in the world (the little
// arcade-cabinet sign floating above its tile). Applies automatically to
// every entry in every map's `minigames` list -- current and future -- so
// changing this one constant is the single place to resize them all.
const MINIGAME_OBJECT_SCALE = 0.75; // 25% smaller than the original 1.0 size

function drawMinigameTileGlow(wx, wy, time, seed) {
  // Glow disabled -- kept as a no-op so callers/config don't need to change.
}

function drawMinigameArcadeSign(wx, wy, time, seed, label) {
  const s = MINIGAME_OBJECT_SCALE;
  const bob = Math.sin(time * 0.003 + seed) * 4;
  const cx = wx, cy = wy - 46 + bob;
  const cabW = 30 * s, cabH = 38 * s;

  // post connecting the sign down to the mini-game tile itself
  ctx.strokeStyle = '#241c28';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(wx, cy + cabH / 2 + 4);
  ctx.lineTo(wx, wy - 4);
  ctx.stroke();

  // cabinet body
  ctx.fillStyle = '#1c1420';
  ctx.fillRect(cx - cabW / 2, cy - cabH / 2, cabW, cabH);
  ctx.strokeStyle = '#ffd23c';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - cabW / 2, cy - cabH / 2, cabW, cabH);

  // marquee -- red strip across the top, like a real cabinet header
  ctx.fillStyle = '#e04858';
  ctx.fillRect(cx - cabW / 2 + 2 * s, cy - cabH / 2 + 2 * s, cabW - 4 * s, 7 * s);

  // screen -- cyan, the classic "game's on" cue
  ctx.fillStyle = '#4ad0ff';
  ctx.fillRect(cx - cabW / 2 + 5 * s, cy - cabH / 2 + 12 * s, cabW - 10 * s, 11 * s);

  // joystick + buttons on the control panel
  ctx.fillStyle = '#f4ecd8';
  ctx.fillRect(cx - 7 * s, cy + cabH / 2 - 9 * s, 1.5 * s, 6 * s);
  ctx.beginPath(); ctx.arc(cx - 6.25 * s, cy + cabH / 2 - 10 * s, 2 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd23c';
  ctx.beginPath(); ctx.arc(cx + 4 * s, cy + cabH / 2 - 10 * s, 1.6 * s, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 9 * s, cy + cabH / 2 - 6 * s, 1.6 * s, 0, Math.PI * 2); ctx.fill();

  // floating label above the cabinet -- flashes between the game's own
  // label (e.g. "PLAY DARTS") and a generic "TAP TO PLAY" tap hint
  const flashOnLabel = Math.floor(time / 1400) % 2 === 0;
  ctx.fillStyle = '#ffd23c';
  ctx.font = `bold ${Math.round(9 * s)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(flashOnLabel ? (label || 'MINI-GAME') : 'TAP TO PLAY', cx, cy - cabH / 2 - 8);

  return { cx, cy, hw: cabW / 2 + 12, hh: cabH / 2 + 20 };
}

// Converts a tap already in 960x600 view-space (same space VIEW_W/VIEW_H
// describe) into world coordinates, using whichever camera transform the
// most recent render() frame actually drew with. Mirrors the inverse of the
// ctx.translate/scale calls made at the top of render().
function viewToWorld(vx, vy) {
  if (lastCam.outside) return { x: vx + lastCam.camX, y: vy + lastCam.camY };
  return { x: (vx - lastCam.dx) / lastCam.zoom, y: (vy - lastCam.dy) / lastCam.zoom };
}

// States whose screen is a full, opaque takeover -- title, the dig-choice
// and slot-choose popups, the history slides, and character select all
// paint their own complete backdrop (art or a near-opaque fill) and are
// reached before `state` ever becomes 'play'. Nothing of the game world is
// ever visible behind them. render() used to redraw the full outdoor town
// scene every frame regardless of `state` -- camera math, every building,
// every parked car/walker/dog, all of it -- and only *then* paint the
// opaque menu screen on top, completely hiding that work. That's the exact
// same expensive per-frame render the LOOKAHEAD buffer above exists to
// tolerate when the player is actually outside, except here it was 100%
// wasted: nobody ever sees it, and it was eating into the same main thread
// the music scheduler needs to stay on time -- which is why the menu/title
// screens glitched exactly like being outside. They were quietly rendering
// the outdoors the whole time. Skipping the world draw for these states
// (the same way 'splash' already did) removes that cost entirely.
const WORLD_HIDDEN_STATES = new Set(['title', 'digChoice', 'history', 'slotChoose', 'select']);

function render(time) {
  // Startup optimization: the splash is the first screen and is drawn
  // immediately. Do not spend time rendering the game world underneath it.
  if (state === 'splash') {
    drawSplash();
    return;
  }
  if (WORLD_HIDDEN_STATES.has(state)) {
    ctx.fillStyle = '#120e18';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (state === 'title') drawTitle(time);
    else if (state === 'digChoice') drawDigChoice(time);
    else if (state === 'history') drawHistory(time);
    else if (state === 'slotChoose') drawSlotChoose(time);
    else if (state === 'select') drawCharacterSelect(time);
    if (toast) drawToast();
    return;
  }
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
    lastCam = { outside: true, camX, camY, zoom: 1, dx: 0, dy: 0 };
  } else {
    const worldW = map.w * TILE, worldH = map.h * TILE;
    const zoom = Math.min(VIEW_W / worldW, VIEW_H / worldH);
    const dx = (VIEW_W - worldW * zoom) / 2;
    const dy = (VIEW_H - worldH * zoom) / 2;
    ctx.translate(dx, dy);
    ctx.scale(zoom, zoom);
    lastCam = { outside: false, camX: 0, camY: 0, zoom, dx, dy };
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
  if (map.deliShop) drawKountryKartDeliInterior(time);
  if (map.comedyClub) drawComedyClubInterior(time);
  if (map.circusInterior) drawChurchCircusInterior(time);
  if (map.plantShop) drawHeyBudInterior(time);
  if (map.recordShop) drawPurePopInterior(time);
  if (map.keeper) drawKeeper(map.keeper);
  drawShopImageNpcs(map);
  drawPlayer(time);

  // Floating callout signs for every mini-game on this map -- drawn last
  // (on top of everything) so they're always readable, and their hitboxes
  // rebuilt fresh each frame for the tap-the-sign shortcut below.
  minigameSignHitboxes = [];
  if (map.minigames) {
    map.minigames.forEach((mg, i) => {
      const wx = mg.tx * TILE + TILE / 2, wy = mg.ty * TILE + TILE / 2;
      const seed = i * 1.7;
      drawMinigameTileGlow(wx, wy, time, seed);
      const rect = drawMinigameArcadeSign(wx, wy, time, seed, mg.label);
      minigameSignHitboxes.push({ map: player.map, id: mg.id, ...rect });
    });
  }

  ctx.restore();
  // 'splash' and the WORLD_HIDDEN_STATES (title/digChoice/history/
  // slotChoose/select) already returned earlier in render() -- only the
  // gameplay-overlay states that draw on top of a *visible* world reach
  // this point.
  drawHUD();
  if (state === 'dialog') drawDialog();
  if (state === 'record') drawRecordCard();
  if (state === 'win') drawWin();
  if (state === 'portal') drawPortalPopup();
  if (state === 'hotkeys') drawHotkeysPopup();
  if (state === 'crate') drawCrate();
  if (state === 'trophies') drawTrophyCase();
  if (state === 'fifa') drawFifaPopup();
  if (state === 'minigame' && activeMinigame) activeMinigame.draw();
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
        case 'c': case 'C': drawCrateProp(px, py, map.crates[key(tx, ty)], map.world); break;
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
        case 'V': drawCow(px, py); break;
        case 'Y': drawMicStand(px, py); break;
        case 'G': drawHipHopGear(px, py, tx, ty); break;
        case 'R': drawRecordingDesk(px, py, tx, ty, map.recordingDesk); break;
        case 'F': drawCarnivalProp(px, py, tx, ty); break;
        case 'Z': drawFilingCabinet(px, py, ty); break;
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

// A standee cow prop — a full-body callback to VT Comedy Club's round
// cow-face mascot/logo, parked in a corner of the room. Same white/black
// patch/pink snout palette as drawComedyClubDecor's wall plaque.
function drawCow(px, py) {
  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(px + 16, py + 29, 12, 3, 0, 0, Math.PI * 2); ctx.fill();

  // legs + hooves
  ctx.fillStyle = '#f4ecd8';
  [7, 13, 19, 24].forEach((lx, i) => {
    ctx.fillRect(px + lx, py + 20 + (i % 3 === 0 ? 0 : 1), 3, 9 - (i % 3 === 0 ? 0 : 1));
  });
  ctx.fillStyle = '#3a2222';
  [7, 13, 19, 24].forEach((lx) => ctx.fillRect(px + lx, py + 27, 3, 2));

  // body
  ctx.fillStyle = '#f4ecd8';
  ctx.beginPath(); ctx.ellipse(px + 16, py + 17, 13, 9, 0, 0, Math.PI * 2); ctx.fill();

  // black patches on the body
  ctx.fillStyle = '#241a1a';
  ctx.beginPath(); ctx.ellipse(px + 10, py + 13, 4, 5, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(px + 21, py + 19, 4, 4, -0.4, 0, Math.PI * 2); ctx.fill();

  // tail with a little tuft
  ctx.strokeStyle = '#f4ecd8';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(px + 28, py + 15); ctx.quadraticCurveTo(px + 33, py + 18, px + 31, py + 24); ctx.stroke();
  ctx.fillStyle = '#241a1a';
  ctx.beginPath(); ctx.arc(px + 31, py + 24, 2, 0, Math.PI * 2); ctx.fill();

  // head, facing left, with ears
  const hx = px + 5, hy = py + 8;
  ctx.fillStyle = '#f4ecd8';
  ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx - 6, hy - 4, 3, 4, 0.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx + 2, hy - 7, 3, 4, -0.6, 0, Math.PI * 2); ctx.fill();

  // patch on the head
  ctx.fillStyle = '#241a1a';
  ctx.beginPath(); ctx.ellipse(hx + 3, hy - 2, 3, 3, 0.2, 0, Math.PI * 2); ctx.fill();

  // pink snout with nostrils
  ctx.fillStyle = '#f0b8c8';
  ctx.beginPath(); ctx.ellipse(hx - 2, hy + 4, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a2222';
  ctx.beginPath(); ctx.ellipse(hx - 4, hy + 4, 1, 1.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx, hy + 4, 1, 1.3, 0, 0, Math.PI * 2); ctx.fill();

  // eye
  ctx.fillStyle = '#1c1414';
  ctx.beginPath(); ctx.arc(hx - 1, hy - 1, 1.4, 0, Math.PI * 2); ctx.fill();
}

function drawCrateProp(px, py, data, worldId) {
  ctx.fillStyle = '#8a5a30';
  ctx.fillRect(px + 2, py + 6, TILE - 4, TILE - 8);
  ctx.fillStyle = '#6a4020';
  ctx.fillRect(px + 2, py + 6, TILE - 4, 3);
  ctx.fillRect(px + 2, py + TILE - 5, TILE - 4, 3);
  const empty = data && data.record && collected.has(recKey(worldId, data.record));
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

// A two-tile-wide hip hop recording workstation — big studio monitor
// speakers flanking a laptop/DAW rig, a small mixer with an audio
// interface, and a mini keyboard controller. Drawn one tile at a time (the
// left tile gets the laptop + left monitor, the right tile gets the mixer +
// right monitor) so it reads as one continuous desk across both tiles. The
// left tile also hangs the neon sign above it (see drawSkylabSign).
function drawRecordingDesk(px, py, tx, ty, desk) {
  const isLeft = desk && tx === desk.x;

  // shared ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(px + 16, py + TILE - 5, 15, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // desk carcass (front + top), same footprint on both tiles so it reads
  // as one continuous slab
  ctx.fillStyle = '#1c1518';
  ctx.fillRect(px, py + 20, TILE, TILE - 20);
  ctx.fillStyle = '#3a2e32';
  ctx.fillRect(px, py + 14, TILE, 8);
  ctx.fillStyle = '#5a4a50';
  ctx.fillRect(px, py + 10, TILE, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(px, py + 10, TILE, 1);

  if (isLeft) {
    // big studio monitor speaker, left side
    ctx.fillStyle = '#17151a';
    ctx.fillRect(px + 1, py - 8, 11, 19);
    ctx.fillStyle = '#403f46';
    ctx.beginPath(); ctx.arc(px + 6.5, py + 3, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0e0d10';
    ctx.beginPath(); ctx.arc(px + 6.5, py + 3, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5c5b62';
    ctx.beginPath(); ctx.arc(px + 6.5, py - 3, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.arc(px + 5.5, py - 3.7, 0.6, 0, Math.PI * 2); ctx.fill();

    // open laptop running the DAW
    ctx.fillStyle = '#8a888e';
    ctx.fillRect(px + 14, py + 7, 15, 3);
    ctx.fillStyle = '#cac8ce';
    ctx.fillRect(px + 14, py - 7, 15, 14);
    ctx.fillStyle = '#1c2a34';
    ctx.fillRect(px + 15, py - 6, 13, 12);
    // little waveform bars glowing on the screen
    ctx.fillStyle = '#3ce0c8';
    const bars = [3, 6, 2, 8, 4, 6, 3];
    bars.forEach((h, i) => ctx.fillRect(px + 17 + i * 1.6, py + 4 - h, 1, h));
  } else {
    // big studio monitor speaker, right side
    ctx.fillStyle = '#17151a';
    ctx.fillRect(px + 20, py - 8, 11, 19);
    ctx.fillStyle = '#403f46';
    ctx.beginPath(); ctx.arc(px + 25.5, py + 3, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0e0d10';
    ctx.beginPath(); ctx.arc(px + 25.5, py + 3, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5c5b62';
    ctx.beginPath(); ctx.arc(px + 25.5, py - 3, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.arc(px + 24.5, py - 3.7, 0.6, 0, Math.PI * 2); ctx.fill();

    // small mixer / audio interface with glowing knobs
    ctx.fillStyle = '#1c1c22';
    ctx.fillRect(px + 2, py + 3, 15, 7);
    ctx.fillStyle = '#e0a030';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.arc(px + 5 + i * 3.2, py + 6.5, 1.2, 0, Math.PI * 2); ctx.fill();
    }
    // mini keyboard controller in front
    ctx.fillStyle = '#e8e4dc';
    ctx.fillRect(px + 1, py + 12, 17, 5);
    ctx.fillStyle = '#201f22';
    for (let i = 0; i < 6; i++) ctx.fillRect(px + 2 + i * 2.8, py + 12, 1.6, 3.5);
  }

  if (isLeft) drawSkylabSign(px, py, desk && desk.sign);
}

// Hanging neon-plaque sign above the recording desk, spanning both of its
// tiles (mounted on the wall behind/above the setup). Purple glow to match
// the hip hop / studio vibe.
function drawSkylabSign(px, py, label) {
  const cx = px + TILE; // midpoint between the desk's two tiles
  const sw = 66, sh = 17;
  const signY = py - 32;

  // soft glow behind the plaque
  ctx.fillStyle = 'rgba(150,90,230,0.32)';
  ctx.fillRect(cx - sw / 2 - 5, signY - 4, sw + 10, sh + 10);

  // mount bracket down to the desk
  ctx.fillStyle = '#241c28';
  ctx.fillRect(cx - 2, signY + sh, 4, py - (signY + sh) - 10);

  // plaque
  ctx.fillStyle = '#18121e';
  ctx.fillRect(cx - sw / 2, signY, sw, sh);
  ctx.strokeStyle = '#b87cff';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - sw / 2, signY, sw, sh);

  ctx.fillStyle = '#c896ff';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label || 'SKYLAB', cx, signY + sh - 5);

  // little corner bulbs for a neon-tube feel
  ctx.fillStyle = '#e8d0ff';
  ctx.beginPath(); ctx.arc(cx - sw / 2 + 3, signY + 3, 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + sw / 2 - 3, signY + 3, 1.3, 0, Math.PI * 2); ctx.fill();
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

    // wall/roof shade colors: each building's wall/roof color never changes,
    // so compute these once per building and cache them on the building
    // object instead of re-parsing hex + re-building strings in shadeColor()
    // for every building, every single frame. drawBuildings only runs for
    // outdoor maps, so this churn was pure GC pressure sitting on exactly
    // the main thread the music scheduler needs to stay on time (see the
    // LOOKAHEAD comment on the `music` object) — and it scaled with the
    // number of buildings on screen, which is why it only ever showed up
    // outside, never indoors.
    if (!b._shades) {
      b._shades = {
        wallDark: shadeColor(b.wall, -30),
        wallLight: shadeColor(b.wall, 18),
        roofDark: shadeColor(b.roof, -35),
        roofLight: shadeColor(b.roof, 25),
      };
    }
    // wall: outline, base fill, side shading bands, and a darker foundation
    // strip along the bottom — same layered look as the keeper sprites.
    const wallDark = b._shades.wallDark;
    const wallLight = b._shades.wallLight;
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

    const roofDark = b._shades.roofDark;
    const roofLight = b._shades.roofLight;
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

// Kountry Kart Deli: classic sandwich-shop interior dressing layered on top
// of the generic shop shell (counter/keeper/crates/jukebox are already
// placed by makeShop()). Adds a glass deli case up front with cold cuts and
// salad tubs, twin glass-door beverage coolers, a wire newspaper rack by
// the door, and a heat-lamp case of wrapped breakfast sandwiches at the end
// of Rosie's counter. Positions are chosen to sit clear of the jukebox
// (11,2), the counter/keeper (row 2-3), and the dig crates in the corners.
function drawKountryKartDeliInterior(time) {
  // --- glass deli case: meats & salads, front-and-center on the floor,
  // clear of the corner crates at (12,4)/(12,6)
  const caseX = 9 * TILE, caseY = 5 * TILE, caseW = 3 * TILE, caseH = 2 * TILE;
  ctx.fillStyle = '#888e96';
  ctx.fillRect(caseX, caseY, caseW, caseH);
  ctx.fillStyle = '#585d64';
  ctx.fillRect(caseX, caseY + caseH - 8, caseW, 8);
  ctx.fillStyle = 'rgba(200,225,245,0.28)';
  ctx.fillRect(caseX + 4, caseY + 6, caseW - 8, caseH - 18);
  ctx.strokeStyle = '#c8d0d8';
  ctx.lineWidth = 2;
  ctx.strokeRect(caseX + 4, caseY + 6, caseW - 8, caseH - 18);
  // rolled cold cuts along the back of the case
  const meatColors = ['#d8776a', '#c8543f', '#e0a06a'];
  for (let i = 0; i < 3; i++) {
    const mx = caseX + 14 + i * 26;
    ctx.fillStyle = meatColors[i % meatColors.length];
    ctx.beginPath();
    ctx.arc(mx, caseY + 15, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(mx - 2, caseY + 12, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // salad tubs up front
  const saladColors = ['#8ab84a', '#e8c840', '#e8dcc0'];
  for (let i = 0; i < 3; i++) {
    const sx = caseX + 8 + i * 28;
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(sx, caseY + caseH - 24, 22, 12);
    ctx.fillStyle = saladColors[i];
    ctx.fillRect(sx + 2, caseY + caseH - 22, 18, 6);
  }
  ctx.fillStyle = '#241608';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('DELI MEATS & SALADS', caseX + caseW / 2, caseY - 6);

  // --- pickle barrel tucked beside the case -- a nod to Rosie's "behind
  // the pickle barrels" line
  drawPickleBarrel(caseX - 20, caseY + caseH - 24);

  // --- twin glass-door beverage coolers against the left wall, above the
  // crates so nothing overlaps
  const coolerX = 2 * TILE, coolerY = TILE + 4, coolerW = TILE * 2 - 4, coolerH = TILE * 2 + 10;
  ctx.fillStyle = '#3a3f46';
  ctx.fillRect(coolerX, coolerY, coolerW, coolerH);
  const canColors = ['#c8302a', '#2a68b0', '#e0b030', '#3a9450'];
  for (let i = 0; i < 2; i++) {
    const dx = coolerX + 3 + i * (coolerW / 2);
    const dw = coolerW / 2 - 6;
    ctx.fillStyle = 'rgba(160,210,240,0.3)';
    ctx.fillRect(dx, coolerY + 4, dw, coolerH - 8);
    ctx.strokeStyle = '#c8d8e0';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(dx, coolerY + 4, dw, coolerH - 8);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 2; col++) {
        ctx.fillStyle = canColors[(row + col + i) % canColors.length];
        ctx.fillRect(dx + 3 + col * 9, coolerY + 10 + row * 14, 7, 10);
      }
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(coolerX, coolerY, coolerW, 3);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('COLD DRINKS', coolerX + coolerW / 2, coolerY - 4);

  // --- wire newspaper rack, tucked in the front corner near the door
  const rackX = 4 * TILE, rackY = 7 * TILE;
  ctx.strokeStyle = '#8a8f96';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rackX, rackY + 26); ctx.lineTo(rackX, rackY);
  ctx.lineTo(rackX + 20, rackY); ctx.lineTo(rackX + 20, rackY + 26);
  ctx.stroke();
  const paperColors = ['#f4f0e6', '#eee8da'];
  for (let i = 0; i < 3; i++) {
    const py2 = rackY - 2 - i * 5;
    ctx.fillStyle = paperColors[i % 2];
    ctx.fillRect(rackX - 2 + i, py2, 24, 14);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(rackX - 2 + i, py2, 24, 14);
    ctx.fillStyle = '#181818';
    ctx.font = 'bold 5px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('DAILY NEWS', rackX, py2 + 8);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    for (let l = 0; l < 3; l++) ctx.fillRect(rackX, py2 + 10 + l * 2, 18 - l * 3, 1);
  }

  // --- breakfast sandwiches under the heat lamp, at the end of Rosie's
  // counter (clear of the jukebox at col 11)
  const wx = 9 * TILE, wy = 2 * TILE + 4, ww = TILE + 12, wh = TILE - 10;
  ctx.save();
  ctx.fillStyle = '#ff9a40';
  ctx.shadowColor = '#ff9a40';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.ellipse(wx + ww / 2, wy - 4, ww / 2, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
  ctx.strokeStyle = '#7a4a2a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(wx, wy - 6); ctx.lineTo(wx + ww, wy - 6);
  ctx.stroke();
  ctx.fillStyle = '#6a4a30';
  ctx.fillRect(wx, wy, ww, wh);
  ctx.fillStyle = 'rgba(255,210,140,0.25)';
  ctx.fillRect(wx + 3, wy + 3, ww - 6, wh - 6);
  const foilColors = ['#e8d888', '#d8e8e0'];
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = foilColors[i % 2];
    const bx = wx + 6 + i * 12;
    ctx.beginPath();
    ctx.moveTo(bx, wy + wh - 4);
    ctx.lineTo(bx + 9, wy + wh - 4);
    ctx.lineTo(bx + 4.5, wy + 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#f4ecd8';
  ctx.font = 'bold 7px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('B\'FAST', wx + ww / 2, wy + wh + 9);
}

// Small wooden pickle barrel prop -- (px, py) is its top-left corner.
function drawPickleBarrel(px, py) {
  ctx.fillStyle = '#5c4326';
  ctx.fillRect(px, py, 18, 22);
  ctx.fillStyle = '#3a2c18';
  ctx.fillRect(px, py, 18, 3);
  ctx.fillRect(px, py + 19, 18, 3);
  ctx.fillStyle = '#4a8a3a';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(px + 4 + i * 5, py + 2, 2.5, 4, 0.3, 0, Math.PI * 2);
    ctx.fill();
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

  // the club's cow mascot standee, perched up on top of the far-left
  // stool rather than parked on the floor
  drawCow(4 * TILE - 16, 7 * TILE - 34);

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

// ------------------------------------------------------- church "big top"
// The church interior masquerades as a full Ringling Bros. and Barnum &
// Bailey style big top: a trapeze flyer swinging from the rafters, an
// elephant and lion flanking the ring, and a pair of juggling clowns
// working the floor. Purely original pixel art — no real circus branding.

// A trapeze artist mid-swing above the ring: two rigging ropes from the
// rafters down to a swinging bar, with a tiny sequined flyer riding it.
// The swing angle oscillates with `time` so it reads as motion overhead
// rather than a static prop.
function drawTrapezeArtist(time) {
  const anchorX = 7 * TILE, anchorY = 2;
  const swing = Math.sin(time * 1.6) * 46;
  const barY = 1.3 * TILE;
  const barX = anchorX + swing;

  // rigging ropes down from the rafters
  ctx.strokeStyle = '#c8b088';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(anchorX - 30, anchorY); ctx.lineTo(barX - 12, barY);
  ctx.moveTo(anchorX + 30, anchorY); ctx.lineTo(barX + 12, barY);
  ctx.stroke();

  // trapeze bar
  ctx.strokeStyle = '#3a2c18';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(barX - 12, barY); ctx.lineTo(barX + 12, barY); ctx.stroke();

  // flyer: sequined performer hooked over the bar by the knees, arms flung
  // out mid-trick
  const flip = Math.sin(time * 1.6 + 1) * 0.3;
  ctx.save();
  ctx.translate(barX, barY);
  ctx.rotate(flip);
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(-3, -4, 6, 10);
  ctx.fillStyle = '#ff3b5c';
  ctx.fillRect(-4, 6, 8, 12);
  ctx.strokeStyle = '#f0c8a0';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-4, 10); ctx.lineTo(-16, 4);
  ctx.moveTo(4, 10); ctx.lineTo(16, 4);
  ctx.stroke();
  ctx.fillStyle = '#f0c8a0';
  ctx.beginPath(); ctx.arc(0, 20, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Gray circus elephant, trunk raised in a showy curl, plumed headdress and
// all — a nod to the classic Ringling Bros. menagerie acts.
function drawCircusElephant(px, py) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(px, py + 30, 26, 6, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#7a828a';
  [[-10, 12], [6, 12], [-14, 10], [12, 10]].forEach(([dx, dy]) => {
    ctx.fillRect(px + dx, py + dy, 6, 14);
  });

  ctx.fillStyle = '#9098a0';
  ctx.beginPath(); ctx.ellipse(px, py, 24, 18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(px - 22, py - 6, 14, 13, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#7a828a';
  ctx.beginPath(); ctx.ellipse(px - 24, py - 14, 11, 13, -0.3, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = '#9098a0';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(px - 34, py - 2);
  ctx.quadraticCurveTo(px - 44, py - 18, px - 34, py - 26);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // showgirl-style plume headdress
  ctx.fillStyle = '#ff3b5c';
  ctx.beginPath();
  ctx.moveTo(px - 22, py - 20); ctx.lineTo(px - 26, py - 32); ctx.lineTo(px - 18, py - 30);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffe14d';
  ctx.beginPath(); ctx.arc(px - 22, py - 20, 3, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#1c1a1e';
  ctx.beginPath(); ctx.arc(px - 26, py - 8, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#f4ecd8';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(px - 30, py); ctx.lineTo(px - 34, py + 6); ctx.stroke();
}

// Circus lion perched on a striped pedestal stool, mane framing its face —
// paired with the elephant to flank the ring.
function drawCircusLion(px, py) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(px, py + 22, 20, 5, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#ff3b5c';
  ctx.fillRect(px - 16, py + 6, 32, 14);
  ctx.fillStyle = '#fff6f0';
  ctx.fillRect(px - 16, py + 6, 32, 4);

  ctx.fillStyle = '#e0a850';
  ctx.beginPath(); ctx.ellipse(px, py - 2, 16, 14, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#a85a20';
  ctx.beginPath(); ctx.arc(px, py - 10, 15, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#e8c078';
  ctx.beginPath(); ctx.arc(px, py - 10, 9, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#a85a20';
  ctx.beginPath(); ctx.arc(px - 8, py - 20, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(px + 8, py - 20, 3.5, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#1c1a1e';
  ctx.beginPath(); ctx.arc(px - 3, py - 11, 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(px + 3, py - 11, 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(px - 2, py - 6); ctx.lineTo(px + 2, py - 6); ctx.lineTo(px, py - 3);
  ctx.closePath(); ctx.fill();

  ctx.strokeStyle = '#e0a850';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px + 14, py); ctx.quadraticCurveTo(px + 26, py + 4, px + 24, py - 8);
  ctx.stroke();
  ctx.fillStyle = '#a85a20';
  ctx.beginPath(); ctx.arc(px + 24, py - 8, 3, 0, Math.PI * 2); ctx.fill();
}

// A juggling clown, tossing three balls in a looping arc timed to `time` —
// `phase` offsets each clown so a pair of them don't juggle in lockstep.
function drawJugglingClown(px, py, time, phase) {
  const t = time * 3 + phase;

  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(px, py + 26, 12, 4, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#ffe14d';
  ctx.fillRect(px - 7, py + 10, 5, 14);
  ctx.fillRect(px + 2, py + 10, 5, 14);
  ctx.fillStyle = '#241a1a';
  ctx.fillRect(px - 9, py + 22, 8, 4);
  ctx.fillRect(px + 1, py + 22, 8, 4);

  ctx.fillStyle = '#5fd0ff';
  ctx.beginPath(); ctx.ellipse(px, py, 11, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff6f0';
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath(); ctx.arc(px + i * 4.5, py - 10, 3, 0, Math.PI * 2); ctx.fill();
  }

  ctx.fillStyle = '#f0c8a0';
  ctx.beginPath(); ctx.arc(px, py - 20, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff5fa2';
  ctx.beginPath(); ctx.arc(px - 9, py - 20, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(px + 9, py - 20, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff3b5c';
  ctx.beginPath(); ctx.arc(px, py - 18, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1c1a1e';
  ctx.beginPath(); ctx.arc(px - 3, py - 22, 1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(px + 3, py - 22, 1, 0, Math.PI * 2); ctx.fill();

  // three juggling balls looping overhead, 120 degrees apart
  const ballColors = ['#ff5fa2', '#5fd0ff', '#ffe14d'];
  for (let i = 0; i < 3; i++) {
    const a = t + (i * Math.PI * 2) / 3;
    const bx = px + Math.cos(a) * 12;
    const by = py - 34 + Math.sin(a) * 10;
    ctx.fillStyle = ballColors[i];
    ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fill();
  }
}

function drawChurchCircusInterior(time) {
  drawTrapezeArtist(time);
  drawCircusElephant(3.4 * TILE, 8.2 * TILE);
  drawCircusLion(10.6 * TILE, 8.2 * TILE);
  drawJugglingClown(5.1 * TILE, 8.5 * TILE, time, 0);
  drawJugglingClown(8.9 * TILE, 8.5 * TILE, time, 2.1);
}

// The big poster hanging on the wall behind Hey Bud's counter — a large
// hand-rolled "99" in hot neon pink, painted with a real paint roller
// rather than printed: streaky uneven bands of coverage, visible roller-
// nap texture, a soft bleedy edge where the roller overshot the letter
// shapes, and a few drips running down where the paint pooled before it
// dried. Purely original pixel art, not a real logo/brand.
function drawHeyBudRollerPoster(x, y, w, h) {
  ctx.save();

  // dark backing shadow + cream canvas/paper the "99" is rolled onto
  ctx.fillStyle = '#241f2c';
  ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  ctx.fillStyle = '#efe8d6';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fillRect(x, y, w, 4);
  ctx.fillRect(x, y + h - 4, w, 4);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.floor(h * 0.74)}px Impact, "Arial Black", sans-serif`;
  const cx = x + w / 2, cy = y + h / 2 + h * 0.03;

  // soft bleedy underlay so the roller reads as having overshot the
  // letterforms slightly, like real paint spreading on paper
  ctx.save();
  ctx.shadowColor = 'rgba(255,40,160,0.5)';
  ctx.shadowBlur = 5;
  ctx.fillStyle = 'rgba(255,60,170,0.85)';
  ctx.fillText('99', cx, cy);
  ctx.restore();

  // solid hot-pink base coat for the numerals
  ctx.fillStyle = '#ff2ea6';
  ctx.fillText('99', cx, cy);

  // roller streaks + nap texture, clipped to only the painted numerals
  // (source-atop only draws over existing opaque pixels)
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const bandH = Math.max(3, h * 0.055);
  let by = y - h * 0.1, i = 0;
  while (by < y + h * 1.1) {
    const wobble = Math.sin(i * 1.7) * 2;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,150,205,0.35)' : 'rgba(190,10,105,0.30)';
    ctx.fillRect(x - 4, by + wobble, w + 8, bandH);
    by += bandH * 1.6;
    i++;
  }
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  for (let ny = y; ny < y + h; ny += 2.4) ctx.fillRect(x, ny, w, 0.8);
  ctx.restore();

  // a few drips trailing down from the bottom of the numerals, like
  // excess roller paint that ran before it dried
  ctx.fillStyle = '#ff2ea6';
  [{ fx: 0.28, len: 12 }, { fx: 0.45, len: 7 }, { fx: 0.63, len: 16 }, { fx: 0.80, len: 6 }]
    .forEach((d) => {
      const dx = x + w * d.fx, dy0 = y + h * 0.87;
      ctx.beginPath();
      ctx.moveTo(dx - 2, dy0);
      ctx.lineTo(dx + 2, dy0);
      ctx.lineTo(dx + 1.3, dy0 + d.len);
      ctx.quadraticCurveTo(dx, dy0 + d.len + 3, dx - 1.3, dy0 + d.len);
      ctx.closePath();
      ctx.fill();
    });

  ctx.restore();
}

// Small framed street-art print (flat, hung — not on an easel) for the
// gallery wall inside Hey Bud.
function drawStreetArtPrint(x, y, w, h, style) {
  ctx.fillStyle = '#241a14';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#efe6cf';
  ctx.fillRect(x, y, w, h);
  if (style === 0) {
    // spray-paint drip tag
    ctx.fillStyle = '#d94f9a';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('VT', x + 4, y + h * 0.5);
    ctx.fillStyle = '#3fa8d4';
    ctx.fillRect(x + 4, y + h * 0.55, w - 8, 2);
  } else if (style === 1) {
    // abstract mountain-line print
    ctx.strokeStyle = '#3f8a44';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 3, y + h - 5);
    ctx.lineTo(x + w * 0.35, y + 6);
    ctx.lineTo(x + w * 0.6, y + h * 0.5);
    ctx.lineTo(x + w - 3, y + h - 5);
    ctx.stroke();
    ctx.fillStyle = '#e0a030';
    ctx.beginPath();
    ctx.arc(x + w - 10, y + 10, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // wheatpaste-style stencil face/leaf motif
    ctx.fillStyle = '#5fa862';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w * 0.28, h * 0.34, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a2016';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + h * 0.2);
    ctx.lineTo(x + w / 2, y + h * 0.8);
    ctx.stroke();
  }
}

// A glass display case up on legs, showing off a couple of prized exotic
// specimens on a lit shelf — the shop's rare-plant centerpiece.
function drawGlassPlantCase(x, y, w, h) {
  ctx.save();

  // wooden base/legs
  const legY = y + h;
  ctx.fillStyle = '#5a3d22';
  ctx.fillRect(x + 4, legY, 5, 10);
  ctx.fillRect(x + w - 9, legY, 5, 10);
  ctx.fillStyle = '#4a3018';
  ctx.fillRect(x, legY - 4, w, 6);

  // metal frame
  ctx.strokeStyle = '#8a8e92';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

  // glass panes — a cool, faintly luminous tint with a soft inner glow
  ctx.fillStyle = 'rgba(170,215,225,0.22)';
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = 'rgba(140,240,200,0.08)';
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);

  // interior shelf, a third of the way up from the base
  const shelfY = y + h * 0.62;
  ctx.fillStyle = 'rgba(90,70,50,0.85)';
  ctx.fillRect(x + 3, shelfY, w - 6, 3);

  // a couple of prized exotic specimens sitting on the shelf, each a
  // different jungle color so they read as rare/collectible
  const specimens = [
    { fx: 0.28, color: '#d94f9a', color2: '#3fa8d4' }, // pink & blue variegated
    { fx: 0.68, color: '#e0483c', color2: '#2f8a44' }, // red anthurium-style
  ];
  specimens.forEach((s) => {
    const px = x + w * s.fx, py = shelfY;
    ctx.fillStyle = '#8a5a30';
    ctx.fillRect(px - 5, py - 8, 10, 8);
    ctx.fillStyle = s.color2;
    ctx.beginPath(); ctx.ellipse(px - 3, py - 14, 5, 8, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(px + 4, py - 16, 4, 7, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = s.color;
    ctx.beginPath(); ctx.ellipse(px, py - 20, 4, 7, 0, 0, Math.PI * 2); ctx.fill();
  });

  // glass highlight streak, diagonal
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(x + 4, y + h - 4);
  ctx.lineTo(x + w * 0.35, y + 4);
  ctx.lineTo(x + w * 0.48, y + 4);
  ctx.lineTo(x + w * 0.18, y + h - 4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// A second glass display case, this one showing off vivid exotic
// flowers rather than foliage — tall orchid sprays and a spiky
// bird-of-paradise bloom, each in its own bright petal color, sitting in
// small pots on the case's lit shelf. Same case construction as
// drawGlassPlantCase (wooden base, metal frame, tinted glass, highlight
// streak) so the two read as a matched pair of display cases.
function drawGlassFlowerCase(x, y, w, h) {
  ctx.save();

  const legY = y + h;
  ctx.fillStyle = '#5a3d22';
  ctx.fillRect(x + 4, legY, 5, 10);
  ctx.fillRect(x + w - 9, legY, 5, 10);
  ctx.fillStyle = '#4a3018';
  ctx.fillRect(x, legY - 4, w, 6);

  ctx.strokeStyle = '#8a8e92';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

  ctx.fillStyle = 'rgba(225,190,225,0.20)';
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = 'rgba(255,210,140,0.08)';
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);

  const shelfY = y + h * 0.62;
  ctx.fillStyle = 'rgba(90,70,50,0.85)';
  ctx.fillRect(x + 3, shelfY, w - 6, 3);

  // three flowering specimens: a hot-pink orchid spray, a spiky
  // orange-and-blue bird-of-paradise, and a deep-purple orchid spray
  const blooms = [
    { fx: 0.2, kind: 'orchid', color: '#ff5fb0', color2: '#3fa8d4' },
    { fx: 0.52, kind: 'bird', color: '#e0a030', color2: '#3f6ad4' },
    { fx: 0.82, kind: 'orchid', color: '#b15fe0', color2: '#5fb862' },
  ];
  blooms.forEach((s) => {
    const px = x + w * s.fx, py = shelfY;
    // small terracotta pot
    ctx.fillStyle = '#8a5a30';
    ctx.fillRect(px - 4, py - 7, 8, 7);
    // leafy base
    ctx.fillStyle = s.color2;
    ctx.beginPath(); ctx.ellipse(px - 2, py - 10, 4, 6, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(px + 3, py - 9, 3.5, 5, 0.4, 0, Math.PI * 2); ctx.fill();
    if (s.kind === 'orchid') {
      // a spray of petal blossoms along a thin arching stem
      ctx.strokeStyle = '#3f7a3f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, py - 9);
      ctx.quadraticCurveTo(px + 6, py - 22, px + 3, py - 32);
      ctx.stroke();
      const petalSpots = [[px + 1, py - 15], [px + 4, py - 21], [px + 2, py - 27], [px + 4, py - 32]];
      petalSpots.forEach(([bx, by]) => {
        ctx.fillStyle = s.color;
        for (let k = 0; k < 4; k++) {
          const ang = (k / 4) * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(bx + Math.cos(ang) * 3, by + Math.sin(ang) * 3, 2.4, 1.6, ang, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#f4ecd8';
        ctx.beginPath(); ctx.arc(bx, by, 1, 0, Math.PI * 2); ctx.fill();
      });
    } else {
      // bird-of-paradise: a beak-shaped sheath with flame-like orange
      // and blue petals fanning up and out
      ctx.strokeStyle = '#3f7a3f';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px, py - 9); ctx.lineTo(px + 2, py - 26); ctx.stroke();
      ctx.fillStyle = '#7a4a30';
      ctx.beginPath();
      ctx.moveTo(px + 2, py - 24);
      ctx.lineTo(px + 12, py - 30);
      ctx.lineTo(px + 3, py - 34);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = s.color;
      [[px + 4, py - 32], [px + 7, py - 34], [px + 10, py - 30]].forEach(([bx, by]) => {
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + 5, by - 3);
        ctx.lineTo(bx + 1, by + 2);
        ctx.closePath();
        ctx.fill();
      });
      ctx.fillStyle = s.color2;
      ctx.beginPath();
      ctx.moveTo(px + 3, py - 30);
      ctx.lineTo(px + 8, py - 33);
      ctx.lineTo(px + 4, py - 27);
      ctx.closePath();
      ctx.fill();
    }
  });

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(x + 4, y + h - 4);
  ctx.lineTo(x + w * 0.35, y + 4);
  ctx.lineTo(x + w * 0.48, y + 4);
  ctx.lineTo(x + w * 0.18, y + h - 4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}


function drawHoodieRack(x, y) {
  const w = 46;
  ctx.strokeStyle = '#6a5a44';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();

  const hoodieColors = ['#3a4a6a', '#8a2a2a', '#2f6a44'];
  hoodieColors.forEach((c, i) => {
    const hx = x + 6 + i * 16;
    // hanger
    ctx.strokeStyle = '#9a9a9e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx, y);
    ctx.lineTo(hx - 3, y + 4);
    ctx.lineTo(hx + 3, y + 4);
    ctx.closePath();
    ctx.stroke();
    // body
    ctx.fillStyle = c;
    ctx.fillRect(hx - 7, y + 4, 14, 18);
    // hood
    ctx.beginPath();
    ctx.ellipse(hx, y + 5, 6, 4, 0, 0, Math.PI, true);
    ctx.fill();
    // sleeves flaring out
    ctx.fillRect(hx - 11, y + 5, 4, 11);
    ctx.fillRect(hx + 7, y + 5, 4, 11);
    // drawstrings
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(hx - 2, y + 6, 1, 6);
    ctx.fillRect(hx + 1, y + 6, 1, 6);
    // front pocket
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(hx - 5, y + 15, 10, 5);
  });
}

// A low wooden display table with a small stack of folded tees on top —
// a second, more retail-shelf-y way tees show up in the shop besides the
// tee row already folded onto the books/tees shelf.
function drawFoldedTeeTable(x, y) {
  const w = 40, h = 8;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x, y + 22, w, 4);
  ctx.fillStyle = '#6a4a2c';
  ctx.fillRect(x, y + 16, w, h);
  ctx.fillStyle = '#5a3d22';
  ctx.fillRect(x + 3, y + 24, 4, 6);
  ctx.fillRect(x + w - 7, y + 24, 4, 6);

  const teeColors = ['#e0a030', '#3a4a6a', '#c0392b'];
  let ty = y + 12;
  teeColors.forEach((c, i) => {
    const inset = i * 2;
    ctx.fillStyle = c;
    ctx.fillRect(x + 2 + inset, ty, w - 4 - inset * 2, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(x + 2 + inset, ty + 4, w - 4 - inset * 2, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 2 + inset, ty, w - 4 - inset * 2, 1);
    ty -= 5;
  });
}

// A cascading vine trailing down from a ceiling corner, thick with
// leaves — part of the "overflowing" jungle-shop dressing. dir flips it
// to hang from the left or right corner.
function drawVineCorner(x, y, dir, time, seed) {
  const sway = Math.sin(time * 0.8 + seed) * 3;
  ctx.strokeStyle = '#3f7a3f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + dir * 14, y + 26, x + dir * 6 + sway, y + 52);
  ctx.stroke();
  const leafSpots = [10, 22, 34, 46];
  leafSpots.forEach((dy, i) => {
    const lx = x + dir * (10 + (i % 2) * 4) + sway * (dy / 52);
    ctx.fillStyle = i % 2 === 0 ? '#4f9a52' : '#5fb862';
    ctx.beginPath();
    ctx.ellipse(lx, y + dy, 6, 3, dir * 0.6, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawHeyBudInterior(time) {
  // Exotic-plant-shop redesign: hanging macrame planters up top, big
  // tropical potted plants flanking the entrance, a wooden shelf stocked
  // with books and folded tees, a folded-tee display table, a hoodie rack,
  // a small gallery of street-art prints, twin glass display cases (one of
  // rare exotic plants, one of exotic flowering blooms), and the "99"
  // Vermont-silhouette poster behind the counter.

  // --- hanging macrame plant pots, gently swaying from the rafters ---
  const hangs = [[2 * TILE + 16, 0.3], [4 * TILE + 8, 1.4], [10 * TILE + 16, 0.7], [12 * TILE + 16, 2.1]];
  hangs.forEach(([hx, seed]) => {
    const sway = Math.sin(time * 1.1 + seed) * 2;
    ctx.strokeStyle = '#8a7a5a';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(hx, 3); ctx.lineTo(hx + sway, 32); ctx.stroke();
    ctx.fillStyle = '#c9a876';
    ctx.beginPath();
    ctx.moveTo(hx + sway - 8, 32); ctx.lineTo(hx + sway + 8, 32);
    ctx.lineTo(hx + sway + 5, 44); ctx.lineTo(hx + sway - 5, 44);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5fb862';
    ctx.beginPath(); ctx.ellipse(hx + sway, 38, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4f9a52';
    for (let j = -1; j <= 1; j += 2) {
      ctx.beginPath();
      ctx.ellipse(hx + sway + j * 6, 48 + Math.abs(j), 3, 8, j * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // --- big tropical potted plants flanking the doorway, spilling well
  // past their pots so the greenery reads as overflowing the space ---
  [[4 * TILE, 8 * TILE + 10], [9 * TILE, 8 * TILE + 10]].forEach(([bx, by]) => {
    drawPlantPot(bx, by);
    ctx.fillStyle = '#3f8a44';
    ctx.beginPath(); ctx.ellipse(bx + 6, by - 22, 12, 6, 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(bx + 6, by - 32, 11, 5, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(bx - 4, by - 16, 9, 4.5, 1.0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#57a85c';
    ctx.beginPath(); ctx.ellipse(bx + 2, by - 26, 8, 4, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(bx + 14, by - 18, 7, 3.5, -0.3, 0, Math.PI * 2); ctx.fill();
  });

  // --- extra floor greenery tucked along the front wall, so plants read
  // as overflowing the whole shop rather than just flanking the door ---
  [[1 * TILE + 6, 7 * TILE + 20], [12 * TILE + 6, 6 * TILE + 22]].forEach(([bx, by]) => {
    drawPlantPot(bx, by);
    ctx.fillStyle = '#4f9a52';
    ctx.beginPath(); ctx.ellipse(bx + 6, by - 20, 8, 4, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(bx + 2, by - 27, 6, 3, -0.4, 0, Math.PI * 2); ctx.fill();
  });

  // --- cascading vines trailing down from both ceiling corners ---
  drawVineCorner(1 * TILE, 0, 1, time, 0.5);
  drawVineCorner(13 * TILE, 0, -1, time, 1.8);

  // --- wooden shelving unit: books up top, folded tees on the lower shelf ---
  const shelfX = 2 * TILE, shelfY = 5 * TILE, shelfW = 2 * TILE + 12, shelfH = 2 * TILE - 4;
  ctx.fillStyle = '#6a4a2c';
  ctx.fillRect(shelfX, shelfY, shelfW, shelfH);
  ctx.fillStyle = '#8a6438';
  ctx.fillRect(shelfX + 3, shelfY + 3, shelfW - 6, shelfH - 6);
  ctx.fillStyle = '#5a3d22';
  ctx.fillRect(shelfX, shelfY + shelfH / 2 - 1, shelfW, 3);
  const bookColors = ['#c0392b', '#2980b9', '#27ae60', '#e0a030', '#8e44ad'];
  let bkx = shelfX + 6;
  bookColors.forEach((c, i) => {
    const bw = 6, bh = 18 - (i % 3) * 3;
    ctx.fillStyle = c;
    ctx.fillRect(bkx, shelfY + shelfH / 2 - 3 - bh, bw, bh);
    bkx += bw + 1;
  });
  const teeColors = ['#e8e4dc', '#3a4a6a', '#c0392b'];
  let tly = shelfY + shelfH / 2 + 4;
  teeColors.forEach((c) => {
    ctx.fillStyle = c;
    ctx.fillRect(shelfX + 6, tly, shelfW - 16, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(shelfX + 6, tly + 5, shelfW - 16, 1);
    tly += 8;
  });

  // --- hoodie rack, hanging right beside the shelf ---
  drawHoodieRack(shelfX + shelfW + 8, shelfY + 6);

  // --- a small folded-tee display table out on the floor, a second
  // dedicated spot for tees besides the shelf's lower row ---
  drawFoldedTeeTable(5 * TILE + 12, 7 * TILE + 22);

  // --- street-art gallery: three prints, one tucked above the hoodie
  // rack and a pair stacked on the right-hand wall ---
  drawStreetArtPrint(4 * TILE + 20, 4 * TILE + 8, 26, 26, 0);
  drawStreetArtPrint(10 * TILE + 4, 5 * TILE + 6, 26, 30, 1);
  drawStreetArtPrint(10 * TILE + 4, 6 * TILE + 10, 26, 26, 2);

  // --- glass display case of prized exotic plant specimens, on the floor
  // below the street-art wall ---
  drawGlassPlantCase(10 * TILE, 7 * TILE + 2, 3 * TILE, 2 * TILE - 10);

  // --- a second glass case, front and center in the room, showing off
  // vivid exotic flowering blooms -- orchid sprays and a bird-of-paradise ---
  drawGlassFlowerCase(6 * TILE + 18, 5 * TILE, 2 * TILE + 6, 1 * TILE + 22);

  // --- the big roller-painted neon-pink "99" poster, centered on the wall
  // directly behind the keeper (keeper sits at tile 6,2) ---
  const posterW = 76, posterH = 72;
  const posterX = (6 * TILE + TILE / 2) - posterW / 2;
  drawHeyBudRollerPoster(posterX, 6, posterW, posterH);
}

// ------------------------------------------------------------------
// Pure Pop Records interior: a proper crate-digger's dream -- wall-mounted
// browsing shelves stuffed with colorful vinyl spines, open bins with
// sleeves fanned out for flipping through, a twin-turntable-and-mixer DJ
// booth built right into the counter (so Zeke reads as always mid-set),
// loose leaning stacks of records scattered on the floor, a wall-mounted
// vinyl medallion behind the counter, and a disco ball turning lazily up in
// the rafters. Every helper below is Pure-Pop-specific and only called from
// drawPurePopInterior() -- same one-function-per-shop pattern as
// drawHeyBudInterior() above.
// ------------------------------------------------------------------

// A short run of vertical vinyl-sleeve "spines" side by side, like books on
// a shelf -- each a flat color block with a thin pale line near the top to
// read as a sleeve edge, and a tiny notch of the black disc peeking out.
function drawVinylSpineRow(x, y, count, spineW, h, seedBase) {
  const colors = ['#c0392b', '#2980b9', '#27ae60', '#e0a030', '#8e44ad', '#d94f9a', '#16a085', '#e74c3c'];
  for (let i = 0; i < count; i++) {
    const sx = x + i * spineW;
    ctx.fillStyle = colors[(seedBase + i) % colors.length];
    ctx.fillRect(sx, y, spineW - 1, h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(sx, y, spineW - 1, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(sx, y + 3, spineW - 1, 1);
    // a sliver of black vinyl peeking past the sleeve edge
    ctx.fillStyle = '#181418';
    ctx.fillRect(sx + spineW - 2, y + 1, 1, h - 2);
  }
}

// Wall/floor browsing shelf: a wooden frame divided into a few rows, each
// packed edge-to-edge with vinyl spines -- the classic record-store wall of
// crates look.
function drawRecordShelfUnit(x, y, w, h, seed) {
  ctx.fillStyle = '#5a3d22';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#7a5535';
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  const rows = 3;
  const rowH = (h - 6) / rows;
  for (let r = 0; r < rows; r++) {
    const ry = y + 3 + r * rowH;
    ctx.fillStyle = '#4a3018';
    ctx.fillRect(x + 2, ry + rowH - 2, w - 4, 2);
    const spineW = 6;
    const count = Math.max(1, Math.floor((w - 8) / spineW));
    drawVinylSpineRow(x + 4, ry + 2, count, spineW, rowH - 6, seed + r * 7);
  }
}

// An open wooden crate/bin with a fan of record sleeves sticking up out of
// it at angles, like someone left mid-flip through the stack -- the
// literal "crate digging" look.
function drawRecordBin(x, y, seed) {
  const w = 46, h = 28;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h + 4, w / 2, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  const colors = ['#c0392b', '#2980b9', '#27ae60', '#e0a030', '#8e44ad', '#d94f9a'];
  const sCount = 6;
  for (let i = 0; i < sCount; i++) {
    const t = i / (sCount - 1);
    const angle = (t - 0.5) * 0.7;
    const sx = x + 8 + t * (w - 16);
    ctx.save();
    ctx.translate(sx, y + 6);
    ctx.rotate(angle);
    ctx.fillStyle = colors[(seed + i) % colors.length];
    ctx.fillRect(-9, -28, 18, 28);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-9, -28, 18, 28);
    ctx.restore();
  }

  // crate body drawn on top, so the sleeves read as sticking up out of it
  ctx.fillStyle = '#8a5a30';
  ctx.fillRect(x, y + 2, w, h - 2);
  ctx.fillStyle = '#6a4020';
  ctx.fillRect(x, y + 2, w, 4);
  ctx.fillRect(x, y + h - 4, w, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  for (let i = 8; i < w; i += 10) ctx.fillRect(x + i, y + 6, 2, h - 10);
}

// A single turntable: body, spinning platter with a highlight groove that
// rotates over time, a gold center label, and a tonearm that drifts gently
// as if it's mid-play.
function drawTurntableDeck(x, y, scale, time, seed) {
  const w = 44 * scale, h = 34 * scale;
  ctx.fillStyle = '#1c1c20';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#2c2a30';
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);

  const cx = x + w * 0.38, cy = y + h * 0.55, r = h * 0.38;
  ctx.fillStyle = '#111014';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3a3a40';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath(); ctx.arc(cx, cy, r * (0.35 + i * 0.2), 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = '#e0b040';
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2); ctx.fill();

  const spin = time * 3 + seed;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(spin) * r, cy + Math.sin(spin) * r);
  ctx.stroke();

  const armBaseX = x + w * 0.86, armBaseY = y + h * 0.22;
  const armAngle = -0.45 + Math.sin(time * 0.5 + seed) * 0.05;
  ctx.strokeStyle = '#c8c8cc';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(armBaseX, armBaseY);
  ctx.lineTo(armBaseX - Math.cos(armAngle) * w * 0.5, armBaseY + Math.sin(armAngle) * w * 0.5);
  ctx.stroke();
  ctx.fillStyle = '#c8c8cc';
  ctx.beginPath(); ctx.arc(armBaseX, armBaseY, 3, 0, Math.PI * 2); ctx.fill();
}

// A small DJ mixer -- three faders with gold caps sitting between the two
// turntables in the counter's built-in booth.
function drawMixerProp(x, y) {
  ctx.fillStyle = '#242226';
  ctx.fillRect(x, y, 26, 30);
  ctx.fillStyle = '#3a373e';
  ctx.fillRect(x + 2, y + 2, 22, 10);
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = '#555a60';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 5 + i * 7, y + 14); ctx.lineTo(x + 5 + i * 7, y + 27); ctx.stroke();
    ctx.fillStyle = '#e0b040';
    ctx.fillRect(x + 3 + i * 7, y + 14 + ((i * 5) % 10), 4, 3);
  }
}

// A hanging disco ball, swaying slightly, faceted with a fine mirror grid
// and a couple of blinking sparkle glints -- the funk factor.
function drawDiscoBallHang(x, ropeLen, time) {
  const sway = Math.sin(time * 0.8) * 3;
  ctx.strokeStyle = '#8a8a8a';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + sway, ropeLen); ctx.stroke();

  const bx = x + sway, by = ropeLen + 10, r = 9;
  ctx.fillStyle = '#c8ccd4';
  ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(60,60,70,0.5)';
  ctx.lineWidth = 0.6;
  for (let i = -r; i <= r; i += 3) {
    ctx.beginPath(); ctx.moveTo(bx - r, by + i); ctx.lineTo(bx + r, by + i); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx + i, by - r); ctx.lineTo(bx + i, by + r); ctx.stroke();
  }
  const glints = [[-4, -3], [3, -5], [5, 2], [-3, 4]];
  const glintPhase = Math.floor(time * 3) % glints.length;
  const [gx, gy] = glints[glintPhase];
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(bx + gx, by + gy, 1.4, 0, Math.PI * 2); ctx.fill();
}

// The big vinyl-record medallion mounted on the wall behind the counter,
// standing in for a store logo/sign -- concentric grooves, a gold center
// label reading "PURE POP RECORDS", and a punched spindle hole.
function drawVinylWallArt(cx, cy, r) {
  const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
  grad.addColorStop(0, '#2a2a2e');
  grad.addColorStop(1, '#0c0c0e');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath(); ctx.arc(cx, cy, r * (i / 5), 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = '#e0b040';
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#181418';
  ctx.textAlign = 'center';
  ctx.font = 'bold 7px monospace';
  ctx.fillText('PURE POP', cx, cy - 1);
  ctx.font = '6px monospace';
  ctx.fillText('RECORDS', cx, cy + 7);
  ctx.fillStyle = '#0c0c0e';
  ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
}

// A loose leaning stack of records on the floor -- flat sleeves piled up
// with a slight alternating lean, like a stack someone's still sorting.
function drawLeaningVinylStack(x, y, count, seed) {
  const colors = ['#c0392b', '#2980b9', '#27ae60', '#e0a030', '#8e44ad'];
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(x + 10, y + 4, 12, 3, 0, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < count; i++) {
    const lean = (i % 2 === 0 ? 1 : -1) * i;
    ctx.save();
    ctx.translate(x + 10, y - i * 4);
    ctx.rotate(lean * 0.02);
    ctx.fillStyle = colors[(seed + i) % colors.length];
    ctx.fillRect(-11, -3, 22, 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-11, -3, 22, 6);
    ctx.restore();
  }
}

function drawPurePopInterior(time) {
  // vinyl medallion on the back wall, centered behind the counter (keeper
  // stands at tile 6,2) -- drawn first so the keeper sprite layers on top
  drawVinylWallArt(6 * TILE + 16, 46, 38);

  // wall-to-wall browsing shelves packed with vinyl spines, flanking the
  // counter on both sides -- clear of the interactive dig crates at
  // tile-columns 1 and 12
  drawRecordShelfUnit(2 * TILE, 4 * TILE + 22, 3 * TILE + 8, 2 * TILE - 16, 2);
  drawRecordShelfUnit(9 * TILE - 8, 4 * TILE + 22, 3 * TILE + 8, 2 * TILE - 16, 9);

  // twin-turntable-and-mixer DJ booth built right into the counter, so
  // Zeke reads as always mid-set behind the register
  drawTurntableDeck(4 * TILE + 12, 2 * TILE + 18, 0.85, time, 0.4);
  drawMixerProp(6 * TILE + 2, 2 * TILE + 22);
  drawTurntableDeck(7 * TILE + 2, 2 * TILE + 18, 0.85, time, 2.1);

  // open bins of fanned-out sleeves, down in the open floor corners --
  // clear of the mini-game sign at tile 9,7
  drawRecordBin(2 * TILE + 6, 8 * TILE - 4, 1);
  drawRecordBin(10 * TILE + 10, 8 * TILE - 4, 4);

  // loose stacks of vinyl scattered across the open floor between the
  // shelves -- the "stacks and stacks" of the request
  drawLeaningVinylStack(5 * TILE + 30, 5 * TILE + 10, 5, 0);
  drawLeaningVinylStack(7 * TILE + 6, 5 * TILE + 18, 4, 2);
  drawLeaningVinylStack(6 * TILE + 16, 7 * TILE + 26, 3, 1);

  // disco ball turning slowly up in the rafters for the funk factor
  drawDiscoBallHang(11 * TILE + 8, 22, time);
}

// A wire newsstand rack, angled shelves stacked with colorful magazine
// covers — the top shelf's front copy is the local alt-weekly, "SEVEN
// DAYS", with a bold readable masthead. Purely original pixel art, not a
// real logo/brand.
function drawMagazineRack(x, y) {
  const w = 42, h = 74;

  // wire frame stand — a simple A-frame of angled metal rods
  ctx.strokeStyle = '#8a8e92';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + 4, y);
  ctx.lineTo(x + w - 4, y);
  ctx.lineTo(x + w, y + h);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 3, y + h + 4);
  ctx.lineTo(x + w + 3, y + h + 4);
  ctx.stroke();

  // three angled wire shelves, each cradling a little fan of magazines
  const shelves = [
    { sy: y + 6,  sw: w - 10, mh: 22 },
    { sy: y + 30, sw: w - 4,  mh: 24 },
    { sy: y + 54, sw: w,      mh: 26 },
  ];
  const deckColors = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#e0a030', '#d94f9a'];
  let colorIdx = 0;

  shelves.forEach((shelf, si) => {
    // wire ledge
    ctx.strokeStyle = '#9a9ea2';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + (w - shelf.sw) / 2, shelf.sy + shelf.mh + 2);
    ctx.lineTo(x + (w - shelf.sw) / 2 + shelf.sw, shelf.sy + shelf.mh + 2);
    ctx.stroke();

    const magCount = si === 0 ? 2 : 3;
    const magW = shelf.sw / magCount;
    for (let j = 0; j < magCount; j++) {
      const mx = x + (w - shelf.sw) / 2 + j * magW;
      const lean = (j - (magCount - 1) / 2) * 2;
      ctx.save();
      ctx.translate(mx + magW / 2, shelf.sy + shelf.mh);
      ctx.rotate(lean * 0.03);

      // the top shelf's front-most copy is always the "SEVEN DAYS" issue
      if (si === 0 && j === magCount - 1) {
        drawSevenDaysCover(-magW * 0.42, -shelf.mh, magW * 0.84, shelf.mh);
      } else {
        const c = deckColors[colorIdx % deckColors.length];
        colorIdx++;
        ctx.fillStyle = c;
        ctx.fillRect(-magW * 0.42, -shelf.mh, magW * 0.84, shelf.mh);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-magW * 0.42, -shelf.mh, magW * 0.84, shelf.mh);
        // a couple of faint horizontal "text" bars so it reads as a cover
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(-magW * 0.3, -shelf.mh + 4, magW * 0.6, 2);
        ctx.fillRect(-magW * 0.3, -shelf.mh + 8, magW * 0.4, 2);
      }
      ctx.restore();
    }
  });
}

// A single "SEVEN DAYS" magazine cover — cream stock, a bold red masthead
// banner across the top, and a couple of thin "headline" bars below it.
function drawSevenDaysCover(x, y, w, h) {
  ctx.fillStyle = '#f4ecd8';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  // masthead banner
  const bannerH = h * 0.34;
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(x, y, w, bannerH);
  ctx.fillStyle = '#f4ecd8';
  ctx.font = `900 ${Math.max(3, Math.floor(w * 0.19))}px Impact, "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SEVEN', x + w / 2, y + bannerH * 0.32);
  ctx.fillText('DAYS', x + w / 2, y + bannerH * 0.75);

  // a small photo block and a couple of headline bars filling the rest
  ctx.fillStyle = '#8fa8b8';
  ctx.fillRect(x + w * 0.12, y + bannerH + 2, w * 0.76, h * 0.36);
  ctx.fillStyle = 'rgba(30,30,30,0.55)';
  ctx.fillRect(x + w * 0.14, y + h * 0.82, w * 0.72, h * 0.06);
  ctx.fillRect(x + w * 0.14, y + h * 0.90, w * 0.5, h * 0.06);
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

  // magazine rack, tucked along the open wall between the counter and
  // the coffee-klatch table, stocked with covers — the local weekly,
  // "SEVEN DAYS", is the front-facing copy up top
  drawMagazineRack(1 * TILE + 6, 4 * TILE + 2);

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

// Small wall-mounted dartboard, drawn with the same ring colors as
// createDartsGame() so the mini-game feels like the same object.
function drawDartboardDecoration(x, y) {
  const r = 13;
  const rings = [
    { f: 1.0,  color: '#241a2a' },
    { f: 0.78, color: '#3a2840' },
    { f: 0.55, color: '#c04070' },
    { f: 0.32, color: '#e0a030' },
    { f: 0.12, color: '#f4ecd8' },
  ];
  ctx.fillStyle = '#4a3018';
  ctx.beginPath();
  ctx.arc(x, y, r + 3, 0, Math.PI * 2);
  ctx.fill();
  for (const ring of rings) {
    ctx.beginPath();
    ctx.arc(x, y, r * ring.f, 0, Math.PI * 2);
    ctx.fillStyle = ring.color;
    ctx.fill();
  }
}

// A compact pair of DJ turntables -- two small vinyl platters with
// tonearms, sat side by side on a little booth ledge -- marking the
// 'scratchdj' mini-game's tile the same way drawDartboardDecoration()
// marks 'darts'. Purely original pixel art, canvas primitives only.
function drawTurntablesDecoration(x, y) {
  const boothW = 40, boothH = 26;
  ctx.fillStyle = '#2a1a30';
  ctx.fillRect(x - boothW / 2, y - boothH / 2, boothW, boothH);
  ctx.strokeStyle = '#4a3060';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - boothW / 2, y - boothH / 2, boothW, boothH);

  [-1, 1].forEach((side) => {
    const px = x + side * 10, py = y;
    // platter
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#0f0a15';
    ctx.fill();
    ctx.strokeStyle = side < 0 ? '#5fd0ff' : '#ff5fb0';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // record label
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#e0b040';
    ctx.fill();
    // tonearm, angled in toward the label from the outer corner
    ctx.strokeStyle = '#c8ccd0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + side * 8, py - 8);
    ctx.lineTo(px + side * 2, py - 2);
    ctx.stroke();
  });
}

function drawNectarsInterior(time) {
  // Dark rock club atmosphere with stage, bar, and gravy fries station

  // "MI YARD" banner, up on the open wall to the right, above the
  // Gravy Fries station and clear of the stage below it
  drawMiYardBanner(9 * TILE + 6, 1 * TILE + 2, 66, 56);
  
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

  // Dartboard on the back wall -- lines up with the 'darts' entry in
  // this map's `minigames` list (tx:11, ty:4)
  drawDartboardDecoration(11 * TILE + TILE / 2, 4 * TILE + TILE / 2);

  // Twin turntables, right next to Big Dog's spot behind the counter --
  // lines up with the 'scratchdj' entry (tx:3, ty:2)
  drawTurntablesDecoration(3 * TILE + TILE / 2, 2 * TILE + TILE / 2);
  
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

// A "MI YARD" reggae banner hung on Nectar's club wall — red/gold/green
// backing, a simple pixel-art lion face up top, bold text underneath.
// Purely original pixel art, not a real logo/brand.
function drawMiYardBanner(x, y, w, h) {
  ctx.save();

  // dark backing with a gold border
  ctx.fillStyle = '#0e1c0e';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#e0b040';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // red / gold / green stripe across the top edge, reggae flag colors
  const stripeH = Math.max(2, h * 0.06);
  ctx.fillStyle = '#c02a2a';
  ctx.fillRect(x, y, w / 3, stripeH);
  ctx.fillStyle = '#e0b040';
  ctx.fillRect(x + w / 3, y, w / 3, stripeH);
  ctx.fillStyle = '#2a7a3a';
  ctx.fillRect(x + (2 * w) / 3, y, w - (2 * w) / 3, stripeH);

  // lion face, centered in the upper portion of the banner
  const cx = x + w / 2, cy = y + h * 0.4, faceR = h * 0.2;

  // mane: a ring of jagged triangular tufts alternating gold/rust
  const tufts = 14;
  for (let i = 0; i < tufts; i++) {
    const a = (i / tufts) * Math.PI * 2;
    const inner = faceR * 0.85;
    const outer = faceR * (i % 2 === 0 ? 1.55 : 1.35);
    const a0 = a - Math.PI / tufts * 0.5;
    const a1 = a + Math.PI / tufts * 0.5;
    ctx.fillStyle = i % 2 === 0 ? '#c07a20' : '#8a4a18';
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a0) * inner, cy + Math.sin(a0) * inner);
    ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    ctx.lineTo(cx + Math.cos(a1) * inner, cy + Math.sin(a1) * inner);
    ctx.closePath();
    ctx.fill();
  }

  // face
  ctx.fillStyle = '#e8b878';
  ctx.beginPath();
  ctx.arc(cx, cy, faceR, 0, Math.PI * 2);
  ctx.fill();

  // eyes
  ctx.fillStyle = '#1a140c';
  ctx.beginPath();
  ctx.ellipse(cx - faceR * 0.35, cy - faceR * 0.1, faceR * 0.14, faceR * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + faceR * 0.35, cy - faceR * 0.1, faceR * 0.14, faceR * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // muzzle
  ctx.fillStyle = '#f4dcae';
  ctx.beginPath();
  ctx.ellipse(cx, cy + faceR * 0.35, faceR * 0.45, faceR * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // nose
  ctx.fillStyle = '#1a140c';
  ctx.beginPath();
  ctx.moveTo(cx - faceR * 0.14, cy + faceR * 0.2);
  ctx.lineTo(cx + faceR * 0.14, cy + faceR * 0.2);
  ctx.lineTo(cx, cy + faceR * 0.34);
  ctx.closePath();
  ctx.fill();

  // mouth
  ctx.strokeStyle = '#1a140c';
  ctx.lineWidth = Math.max(1, faceR * 0.06);
  ctx.beginPath();
  ctx.moveTo(cx, cy + faceR * 0.34);
  ctx.lineTo(cx, cy + faceR * 0.48);
  ctx.moveTo(cx, cy + faceR * 0.48);
  ctx.quadraticCurveTo(cx - faceR * 0.22, cy + faceR * 0.6, cx - faceR * 0.4, cy + faceR * 0.5);
  ctx.moveTo(cx, cy + faceR * 0.48);
  ctx.quadraticCurveTo(cx + faceR * 0.22, cy + faceR * 0.6, cx + faceR * 0.4, cy + faceR * 0.5);
  ctx.stroke();

  // "MI YARD" underneath, bold with a dark outline
  ctx.textAlign = 'center';
  ctx.font = `900 ${Math.floor(w * 0.19)}px Impact, "Arial Black", sans-serif`;
  ctx.strokeStyle = '#1a140c';
  ctx.lineWidth = 2;
  ctx.strokeText('MI YARD', x + w / 2, y + h * 0.93);
  ctx.fillStyle = '#e0b040';
  ctx.fillText('MI YARD', x + w / 2, y + h * 0.93);

  ctx.restore();
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
const KEEPER_HAIR = { DEE: '#5a2e1c', ROSIE: '#c8c0b0', ZEKE: '#241a12', JADE: '#141014', TONY: '#2a2018', LANNY: '#3a1a5c', MITCH: '#5a3a1c', BIGDOG: '#3a2a1c', EDNA: '#a8a8a8' };

// Optional per-keeper artwork. Drop a PNG at assets/keepers/<name>.png (any
// size — it's scaled to KEEPER_SPR_H, feet anchored at the same floor line
// the procedural sprite uses) and it's picked up automatically. Until a file
// exists (or while it's still loading), drawKeeper falls back to the shaded
// procedural sprite below, so nothing ever renders blank.
const KEEPER_NAMES = ['SK1', 'DEE', 'ROSIE', 'ZEKE', 'JADE', 'TONY', 'LANNY', 'MITCH', 'BIGDOG', 'EDNA'];
// Matches the 80px height used for Green Door Studio's image-based npcs
// (truth.png, zach.png, kanga.png — see SHOP_NPC_IMAGES/drawShopImageNpcs'
// `n.spriteH || 80` default), so every keeper — current and future — reads
// at the same scale as those three.
const KEEPER_SPR_H = 80;
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
const SHOP_NPC_IMAGES = { kanga: kangaImg, truth: truthImg, bill: billImg, rza: rzaImg, gza: gzaImg, zach: zachImg, humble: humbleImg, hicks: hicksImg, mavstar: mavstarImg, boxguts: boxgutsImg, trav: travImg };

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
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#c8c0d8';
  ctx.fillText('SAMPLES', 18, 26);
  worldPadOrder().forEach((id, i) => {
    const r = worldRecords()[id];
    const x = 88 + i * 46, y = 14;
    ctx.fillStyle = collected.has(recKey(currentWorldId(), id)) ? r.color : '#262030';
    ctx.fillRect(x, y, 38, 30);
    ctx.strokeStyle = '#0a080e';
    ctx.strokeRect(x + 0.5, y + 0.5, 37, 29);
    ctx.fillStyle = collected.has(recKey(currentWorldId(), id)) ? '#181418' : '#4a4258';
    ctx.textAlign = 'center';
    ctx.fillText(r.pad, x + 19, y + 20);
  });

  if (state === 'play') {
    const target = facingTarget();
    if (target) {
      const label = target.type === 'crate' ? '[E] DIG CRATE'
                  : (target.type === 'keeper' || target.type === 'npc' || target.type === 'filingCabinets') ? '[E] TALK'
                  : target.type === 'newspaper' ? '[E] READ'
                  : target.type === 'cart' ? `[X] ${target.data.label}`
                  : target.type === 'minigame' ? `[E] ${target.data.label || 'PLAY'}`
                  : '[E] LOOK';
      pill(label, VIEW_W / 2, VIEW_H - 34);
    }
  }
}

function pill(text, cx, cy) {
  ctx.font = 'bold 16px monospace';
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
  ctx.font = 'bold 19px monospace';
  ctx.fillStyle = '#e0b040';
  ctx.fillText(dialog.name, 44, y + 32);
  ctx.fillStyle = '#f4ecd8';
  ctx.font = '21px monospace';
  wrapText(dialog.lines[dialog.i], 44, y + 62, VIEW_W - 96, 28);
  ctx.font = '16px monospace';
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
  ctx.font = '18px monospace';
  const lines = wrapLinesCentered(
    'More lands are being created. More vinyl awaits. Check back later homie!',
    boxW - 48
  );
  const startY = boxY + 30;
  lines.forEach((l, i) => ctx.fillText(l, VIEW_W / 2, startY + i * 22));

  ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#e0b040' : '#f4ecd8';
  ctx.font = 'bold 17px monospace';
  ctx.fillText('Press [E] or tap screen to return', VIEW_W / 2, boxY + boxH - 16);
}

// [H] hot-keys popup -- reachable any time during gameplay (see the
// keydown handler and the 'hotkeys' state in update()). Pauses the action
// behind a dark overlay the same way drawPortalPopup() does, then lists
// every key the player has available. Keep this list in sync with the
// keydown handler above and the fallback controls list in drawTitle().
function drawHotkeysPopup() {
  ctx.fillStyle = 'rgba(8,6,12,0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const boxW = 460, boxH = 368, boxX = (VIEW_W - boxW) / 2, boxY = (VIEW_H - boxH) / 2;
  ctx.fillStyle = 'rgba(10,8,14,0.95)';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = '#f4ecd8';
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX + 2, boxY + 2, boxW - 4, boxH - 4);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#e0b040';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('HOT KEYS', VIEW_W / 2, boxY + 34);

  const rows = [
    ['ARROWS / WASD', 'move'],
    ['E', 'talk / dig crates / read'],
    ['B', 'skateboard on & off'],
    ['C', 'cold brew coffee on & off'],
    ['Y', 'iced yerba mate on & off'],
    ['M', 'mute music'],
    ['X', 'buy from carts'],
    ['K', 'quicksave'],
    ['N', 'back to start / new game'],
    ['V', 'open The Crate (record collection)'],
    ['T', 'open the Trophy Case (mini-game bests)'],
    ['H', 'toggle this hot-keys popup'],
  ];
  const listX = boxX + 30, keyColW = 150, startY = boxY + 66, lh = 24;
  ctx.textAlign = 'left';
  rows.forEach(([keyLabel, desc], i) => {
    const y = startY + i * lh;
    ctx.fillStyle = '#e0b040';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`[${keyLabel}]`, listX, y);
    ctx.fillStyle = '#f4ecd8';
    ctx.font = '16px monospace';
    ctx.fillText(desc, listX + keyColW, y);
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#e0b040' : '#f4ecd8';
  ctx.font = 'bold 17px monospace';
  ctx.fillText('- PRESS [H] OR [E] TO CLOSE -', VIEW_W / 2, boxY + boxH - 16);
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
  ctx.font = '19px monospace';
  ctx.fillText('Time for a quick friendly!', VIEW_W / 2, boxY + 36);

  ctx.fillStyle = '#e0b040';
  ctx.font = 'bold 29px monospace';
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
  // Prefer the full-art splash PNG for this record when we have one loaded;
  // otherwise fall back to the original procedurally-drawn card below (this
  // keeps other worlds like swamp -- which reuse ids like 'choir' for a
  // different record -- working without matching art).
  const img = RECORD_FOUND_IMGS[shownRecord];
  if (currentWorldId() === 'town' && img && img.complete && img.naturalWidth) {
    ctx.fillStyle = 'rgba(6,4,10,0.85)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const maxW = VIEW_W * 0.8, maxH = VIEW_H * 0.88;
    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    const dx = (VIEW_W - dw) / 2, dy = (VIEW_H - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
    return;
  }
  drawRecordCardFallback();
}

function drawRecordCardFallback() {
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
  ctx.font = 'bold 20px monospace';
  ctx.fillStyle = '#f4ecd8';
  ctx.fillText('★ RECORD FOUND ★', x + w / 2, y + 36);
  ctx.textAlign = 'left';
  const tx = sx + ss + 130;
  ctx.font = 'bold 19px monospace';
  ctx.fillStyle = r.color === '#e8e4dc' ? '#f4ecd8' : r.color;
  wrapText('"' + r.title + '"', tx, sy + 14, w - (tx - x) - 24, 20);
  ctx.font = '16px monospace';
  ctx.fillStyle = '#c8c0d8';
  ctx.fillText(r.artist + ' · ' + r.year, tx, sy + 58);
  ctx.fillStyle = '#f4ecd8';
  ctx.font = 'bold 16px monospace';
  ctx.fillText('SAMPLE: ' + r.sample, tx, sy + 86);
  ctx.font = '15px monospace';
  ctx.fillStyle = '#9a90a8';
  wrapText('New layer added to the beat. Listen!', tx, sy + 110, w - (tx - x) - 24, 16);

  ctx.font = '15px monospace';
  ctx.fillStyle = '#c8c0d8';
  wrapText(r.flavor, x + 36, y + h - 52, w - 72, 16);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#9a90a8';
  ctx.font = '14px monospace';
  ctx.fillText('[E] ▶', x + w - 20, y + h - 12);
}

// ---------------------------------------------------------------- The Crate
// A read-only browse-and-remember screen, not a new gameplay system: it
// just reads WORLD_DEFS + collected, the same two things worldRecords()/
// worldComplete() already read. Adding a new world to WORLD_DEFS (or a 6th
// record to an existing one) shows up here automatically -- nothing about
// drawCrate() needs to change.
//
// Every world.record id is looked up via recKey(worldId, id) here (not the
// bare id) so that ids reused across worlds -- e.g. 'choir' means a
// different record in town vs. swamp -- are tracked independently. See
// recKey()'s definition for the full rationale.
function drawCrate() {
  ctx.fillStyle = 'rgba(6,4,10,0.88)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const boxW = 760, boxH = 470, boxX = (VIEW_W - boxW) / 2, boxY = (VIEW_H - boxH) / 2;
  ctx.fillStyle = '#1c1626';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = '#e0b040';
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX + 2, boxY + 2, boxW - 4, boxH - 4);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#e0b040';
  ctx.font = 'bold 27px monospace';
  ctx.fillText('THE CRATE', VIEW_W / 2, boxY + 38);

  const ids = crateWorldIds();
  const worldId = ids[crateWorldIndex];
  const def = WORLD_DEFS[worldId];
  const records = def.records;
  const padOrder = def.padOrder;
  const foundInWorld = padOrder.filter((id) => collected.has(recKey(worldId, id))).length;

  // world tab row -- left/right (arrows, d-pad, or dedicated buttons in
  // future control schemes) cycles through every world in WORLD_DEFS
  ctx.font = 'bold 20px monospace';
  ctx.fillStyle = '#f4ecd8';
  const tabY = boxY + 70;
  ctx.fillText(`\u25C0  ${def.name.toUpperCase()}  \u25B6`, VIEW_W / 2, tabY);
  ctx.font = '15px monospace';
  ctx.fillStyle = '#9a90a8';
  ctx.fillText(
    `${foundInWorld} / ${padOrder.length} found here  \u00b7  world ${crateWorldIndex + 1} of ${ids.length}`,
    VIEW_W / 2, tabY + 20
  );

  // 5-slot grid, same visual language as the pad HUD / win-screen grid:
  // filled + colored when found, dim with a "?" when not. The currently
  // browsed slot (crateSlotIndex) gets a pulsing highlight border.
  const sq = 78, gap = 18;
  const totalW = sq * padOrder.length + gap * (padOrder.length - 1);
  const gridX = VIEW_W / 2 - totalW / 2, gridY = tabY + 44;
  padOrder.forEach((id, i) => {
    const r = records[id];
    const x = gridX + i * (sq + gap);
    const found = collected.has(recKey(worldId, id));
    ctx.fillStyle = found ? r.color : '#262030';
    ctx.fillRect(x, gridY, sq, sq);
    if (i === crateSlotIndex) {
      ctx.strokeStyle = Math.floor(performance.now() / 300) % 2 ? '#e0b040' : '#f4ecd8';
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 3, gridY - 3, sq + 6, sq + 6);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = found ? '#181418' : '#4a4258';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(found ? r.pad : '?', x + sq / 2, gridY + sq / 2 + 5);
  });

  // detail panel for whichever slot is currently browsed
  const selId = padOrder[crateSlotIndex];
  const selRecord = records[selId];
  const found = collected.has(recKey(worldId, selId));
  const panelY = gridY + sq + 26;
  const panelX = boxX + 40, panelW = boxW - 80;

  if (found) {
    const artS = 96;
    drawAlbumArt(panelX, panelY, artS, selRecord);
    ctx.strokeStyle = selRecord.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, artS, artS);

    const tx = panelX + artS + 24;
    ctx.textAlign = 'left';
    ctx.font = 'bold 19px monospace';
    ctx.fillStyle = selRecord.color === '#e8e4dc' ? '#f4ecd8' : selRecord.color;
    wrapText('"' + selRecord.title + '"', tx, panelY + 16, panelW - artS - 24, 20);
    ctx.font = '16px monospace';
    ctx.fillStyle = '#c8c0d8';
    ctx.fillText(selRecord.artist + ' \u00b7 ' + selRecord.year, tx, panelY + 60);
    ctx.fillStyle = '#f4ecd8';
    ctx.font = 'bold 15px monospace';
    ctx.fillText('SAMPLE: ' + selRecord.sample, tx, panelY + 82);

    ctx.font = '15px monospace';
    ctx.fillStyle = '#c8c0d8';
    wrapText(selRecord.flavor, panelX, panelY + artS + 22, panelW, 16);
  } else {
    ctx.textAlign = 'left';
    ctx.font = 'bold 19px monospace';
    ctx.fillStyle = '#6a6278';
    ctx.fillText('??? \u2014 not yet found', panelX, panelY + 40);
    ctx.font = '15px monospace';
    ctx.fillStyle = '#4a4258';
    ctx.fillText('Dig around ' + def.name + ' to turn this one up.', panelX, panelY + 62);
  }

  // running total across every world -- grows on its own as WORLD_DEFS grows
  let totalFound = 0, totalSlots = 0;
  ids.forEach((wid) => {
    const p = WORLD_DEFS[wid].padOrder;
    totalSlots += p.length;
    totalFound += p.filter((id) => collected.has(recKey(wid, id))).length;
  });
  ctx.textAlign = 'center';
  ctx.font = '15px monospace';
  ctx.fillStyle = '#9a90a8';
  ctx.fillText(`${totalFound} / ${totalSlots} records found across all worlds`, VIEW_W / 2, boxY + boxH - 46);

  ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#e0b040' : '#f4ecd8';
  ctx.font = 'bold 17px monospace';
  ctx.fillText('[\u25C0\u25B6] world   [\u25B2\u25BC] browse   [E] close', VIEW_W / 2, boxY + boxH - 18);
}

// The Trophy Case -- a personal-bests list for the 8 scored mini-games (see
// MINIGAME_TROPHIES + personalBests near the top of the file). Same bordered-
// popup language as drawCrate() and drawHotkeysPopup(): a row list on the
// left half the player browses with up/down, a detail panel on the right for
// whichever row is selected. Rows with no personalBests entry yet just show
// "--" instead of a score, same "not yet found" idea as an empty Crate slot.
function drawTrophyCase() {
  ctx.fillStyle = 'rgba(6,4,10,0.88)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const boxW = 720, boxH = 440, boxX = (VIEW_W - boxW) / 2, boxY = (VIEW_H - boxH) / 2;
  ctx.fillStyle = '#1c1626';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = '#e0b040';
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX + 2, boxY + 2, boxW - 4, boxH - 4);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#e0b040';
  ctx.font = 'bold 27px monospace';
  ctx.fillText('TROPHY CASE', VIEW_W / 2, boxY + 38);

  const playedCount = MINIGAME_TROPHIES.filter((t) => bestFor(t.id) !== undefined).length;
  ctx.font = '15px monospace';
  ctx.fillStyle = '#9a90a8';
  ctx.fillText(`${playedCount} / ${MINIGAME_TROPHIES.length} personal bests set`, VIEW_W / 2, boxY + 60);

  // row list -- left column, one row per mini-game
  const listX = boxX + 34, listY = boxY + 84, rowH = 38;
  const listW = 300;
  MINIGAME_TROPHIES.forEach((t, i) => {
    const y = listY + i * rowH;
    const best = bestFor(t.id);
    const active = i === trophyIndex;

    if (active) {
      ctx.fillStyle = 'rgba(224,176,64,0.14)';
      ctx.fillRect(listX - 10, y - 22, listW, rowH - 6);
      ctx.strokeStyle = Math.floor(performance.now() / 300) % 2 ? '#e0b040' : '#f4ecd8';
      ctx.lineWidth = 2;
      ctx.strokeRect(listX - 10, y - 22, listW, rowH - 6);
    }

    ctx.textAlign = 'left';
    ctx.font = 'bold 17px monospace';
    ctx.fillStyle = active ? '#e0b040' : (best !== undefined ? '#f4ecd8' : '#5a5462');
    ctx.fillText((active ? '\u25B8 ' : '') + t.label, listX, y);

    ctx.textAlign = 'right';
    ctx.font = '16px monospace';
    ctx.fillStyle = best !== undefined ? '#8cff5f' : '#4a4258';
    ctx.fillText(formatTrophyValue(t.id, best), listX + listW - 14, y);
  });

  // detail panel -- right half, describes whichever row is selected
  const sel = MINIGAME_TROPHIES[trophyIndex];
  const selBest = bestFor(sel.id);
  const panelX = listX + listW + 26, panelW = boxX + boxW - 40 - panelX;
  const panelY = listY + 6;

  ctx.textAlign = 'left';
  ctx.font = 'bold 20px monospace';
  ctx.fillStyle = '#e0b040';
  ctx.fillText(sel.label, panelX, panelY);

  ctx.font = '15px monospace';
  ctx.fillStyle = '#c8c0d8';
  wrapText(sel.flavor, panelX, panelY + 26, panelW, 16);

  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = '#9a90a8';
  ctx.fillText('PERSONAL BEST', panelX, panelY + 78);
  ctx.font = 'bold 34px monospace';
  ctx.fillStyle = selBest !== undefined ? '#8cff5f' : '#4a4258';
  ctx.fillText(selBest !== undefined ? formatTrophyValue(sel.id, selBest) : 'NOT SET', panelX, panelY + 114);

  if (selBest === undefined) {
    ctx.font = '15px monospace';
    ctx.fillStyle = '#6a6278';
    ctx.fillText('Play this one to set your first best.', panelX, panelY + 140);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#e0b040' : '#f4ecd8';
  ctx.font = 'bold 17px monospace';
  ctx.fillText('[\u25B2\u25BC] browse   [E] close', VIEW_W / 2, boxY + boxH - 18);
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

// Offscreen canvases with the chroma-green removed, one per title-screen
// page (index 0 = story/start, index 1 = hot keys). Built lazily below.
const titleMenuKeyed = [null, null];
const TITLE_MENU_IMGS = [titleMenuPg1Img, titleMenuPg2Img];

// Removes the backdrop's chroma-green from `img` onto a same-size offscreen
// canvas: any pixel that is green-dominant & strong is made transparent, so
// the drifting sky/clouds behind it show through. Shared by the title-menu
// pages (buildKeyedTitleMenu) and the "WHAT IS DIGGING?" history slides
// (buildKeyedHistoryPage), since both sets of art share the same
// chroma-green backdrop/frame style.
function chromaKeyToCanvas(img) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], grn = d[i + 1], b = d[i + 2];
    if (grn > 140 && (grn - b) > 90 && (grn - r) > 55) d[i + 3] = 0;
  }
  g.putImageData(id, 0, 0);
  return c;
}

// Build the chroma-keyed version of the given title-menu page's art once
// its image loads.
function buildKeyedTitleMenu(page) {
  if (titleMenuKeyed[page]) return;
  const img = TITLE_MENU_IMGS[page];
  if (!img.complete || !img.naturalWidth) return;
  titleMenuKeyed[page] = chromaKeyToCanvas(img);
}

// Same idea as titleMenuKeyed/buildKeyedTitleMenu, but for the 4-slide
// "WHAT IS DIGGING?" history slideshow (see openHistory(), the 'history'
// state in update(), and drawHistory() below).
const historyPageKeyed = [null, null, null, null];
function buildKeyedHistoryPage(page) {
  if (historyPageKeyed[page]) return;
  const img = HISTORY_PAGES[page];
  if (!img.complete || !img.naturalWidth) return;
  historyPageKeyed[page] = chromaKeyToCanvas(img);
}

// Slowly drifting cloud background shared by the title screen and the
// popups that follow it (dig-choice, slot-chooser), so the sky reads as
// one continuous backdrop from the title screen up until character select
// takes over. Falls back to a flat dark fill if the art hasn't loaded yet.
function drawDriftingSky(time) {
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
}

// The title screen is two pages sharing one backdrop (the drifting-cloud
// sky, plus each page's own framed menu art once it's loaded): page 0 is
// the original story/start screen (menu_title_pg_1.png), page 1 is the Hot
// Keys reference (menu_title_pg_2.png). Both are reachable any time via
// left/right, the on-screen d-pad, or [H] -- see the 'title' block in
// update() and the keydown handler.
function drawTitle(time) {
  buildKeyedTitleMenu(titlePage);
  const keyed = titleMenuKeyed[titlePage];

  // Menu ready: chroma-keyed menu centered over a slowly drifting sky.
  if (keyed) {
    drawDriftingSky(time);
    const mw = keyed.width, mh = keyed.height;
    const s = Math.min(VIEW_W / mw, VIEW_H / mh);
    const dw = mw * s, dh = mh * s;
    ctx.drawImage(keyed, (VIEW_W - dw) / 2, (VIEW_H - dh) / 2, dw, dh);
    if (titlePage === 0) {
      drawTitleSaveHint();
    } else {
      drawTitleBackHint((VIEW_H + dh) / 2);
    }
    return;
  }

  // fallback text-only title (used until the current page's art loads)
  if (titlePage === 1) { drawTitleHotkeysFallback(time); return; }

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
  ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#e0b040' : '#f4ecd8';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('- PRESS E TO CONTINUE -', VIEW_W / 2, 340);
  drawTitleSaveHint();
}

// Small reminder shown on the title screen's Hot Keys page (1), pointing
// players back to the main page. Kept unboxed to match how this line
// looked on the old text-only Hot Keys page.
function drawTitleBackHint(boxBottomY) {
  ctx.textAlign = 'center';
  const flashOn = Math.floor(performance.now() / 400) % 2;
  ctx.fillStyle = flashOn ? '#8a6420' : '#5a5245';
  ctx.font = 'bold 16px monospace';
  const y = Math.min(boxBottomY + 30, VIEW_H - 18);
  ctx.fillText('[\u25C0] OR [H] BACK TO TITLE', VIEW_W / 2, y);
}

// Text-only fallback for the Hot Keys page, used only for the brief window
// before menu_title_pg_2.png has loaded. Shares the exact same
// drifting-cloud backdrop as page 0 (drawDriftingSky) -- just framed by the
// same bordered menu-box look the rest of the game's popups use
// (drawHotkeysPopup, drawMenuBox) instead of the story art, so the full key
// list has room to breathe. The list itself keeps its original muted color
// from the old title screen on purpose, so it still reads as its own thing
// and never looks like a continuation of the story/copy on page 0.
function drawTitleHotkeysFallback(time) {
  drawDriftingSky(time);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const boxW = 480, boxH = 330, boxX = (VIEW_W - boxW) / 2, boxY = (VIEW_H - boxH) / 2 - 6;
  ctx.fillStyle = 'rgba(10,8,14,0.9)';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = '#f4ecd8';
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX + 2, boxY + 2, boxW - 4, boxH - 4);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#e0b040';
  ctx.font = 'bold 27px monospace';
  ctx.fillText('HOT KEYS', VIEW_W / 2, boxY + 42);

  // same muted color the old title-screen controls list used, so it never
  // reads as a continuation of the story copy on page 0
  ctx.fillStyle = '#9a90a8';
  ctx.font = '16px monospace';
  const controls = [
    'ARROWS / WASD, OR THE ON-SCREEN D-PAD .... move',
    'E, OR THE ON-SCREEN E BUTTON ... talk / dig crates / read',
    'B, OR ON-SCREEN "SK8" ........ skateboard on & off',
    'C ....................... cold brew coffee on & off',
    'Y ......................... iced yerba mate on & off',
    'M, OR ON-SCREEN "MUTE" ....................... mute',
    'X, OR ON-SCREEN "X" ................... buy from carts',
  ];
  controls.forEach((l, i) => ctx.fillText(l, VIEW_W / 2, boxY + 80 + i * 28));

  ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#e0b040' : '#f4ecd8';
  ctx.font = 'bold 19px monospace';
  ctx.fillText('- PRESS E TO CONTINUE -', VIEW_W / 2, boxY + boxH - 44);

  ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#8a6420' : '#5a5245';
  ctx.font = 'bold 16px monospace';
  ctx.fillText('[\u25C0] OR [H] BACK TO TITLE', VIEW_W / 2, boxY + boxH - 18);
}

// Small persistent reminder, shown under the main prompt on the title
// screen only, that at least one save exists.
function drawTitleSaveHint() {
  if (!hasAnySave() || titlePage !== 0) return;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(244,236,216,0.75)';
  ctx.font = '12px monospace';
  ctx.fillText('[E] to dig for gold, choose a slot', VIEW_W / 2, VIEW_H - 10);
}

// ---------------------------------------------------------------- "WHAT IS DIGGING?" history slideshow
// Opened from the digChoice screen (see openHistory()). Four full-art
// slides sharing the drifting-cloud sky and chroma-key treatment used by
// the title-menu pages (drawDriftingSky/chromaKeyToCanvas), so the sky
// reads as the same continuous backdrop as everywhere else in the title
// flow. [\u2190]/[\u2192] (or the d-pad) page back and forth freely; [E] pages
// forward and wraps back to digChoice from the last slide; [X] backs out
// early -- see the 'history' block in update().
function drawHistory(time) {
  drawDriftingSky(time);
  buildKeyedHistoryPage(historyPage);
  const keyed = historyPageKeyed[historyPage];

  if (keyed) {
    const mw = keyed.width, mh = keyed.height;
    const s = Math.min(VIEW_W / mw, VIEW_H / mh);
    const dw = mw * s, dh = mh * s;
    ctx.drawImage(keyed, (VIEW_W - dw) / 2, (VIEW_H - dh) / 2, dw, dh);
  }

  // Small unboxed progress/nav hint, unflashing (matches the title screen's
  // current style now that its flashing callout is gone).
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(244,236,216,0.75)';
  ctx.font = 'bold 13px monospace';
  const navLabel = historyPage < HISTORY_PAGES.length - 1
    ? `${historyPage + 1} / ${HISTORY_PAGES.length}   [\u25C0\u25B6] REREAD   [E] OR [H] NEXT   [X] BACK`
    : `${historyPage + 1} / ${HISTORY_PAGES.length}   [\u25C0\u25B6] REREAD   [E], [H], OR [X] BACK TO MENU`;
  ctx.fillText(navLabel, VIEW_W / 2, VIEW_H - 10);
}

// ---------------------------------------------------------------- dig-choice / slot-choose popups
// Shared "retro menu box" look for the two title-flow popups below --
// mirrors the dark box + cream border used by drawDialog()/drawPortalPopup()
// so these feel native rather than bolted on.
function drawMenuBox(title, hint) {
  ctx.fillStyle = 'rgba(8,6,12,0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const boxW = 420, boxH = 260, boxX = (VIEW_W - boxW) / 2, boxY = (VIEW_H - boxH) / 2;
  ctx.fillStyle = 'rgba(10,8,14,0.95)';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = '#f4ecd8';
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX + 2, boxY + 2, boxW - 4, boxH - 4);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#e0b040';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(title, VIEW_W / 2, boxY + 34);

  if (hint) {
    ctx.fillStyle = '#9a90a8';
    ctx.font = '15px monospace';
    ctx.fillText(hint, VIEW_W / 2, boxY + boxH - 16);
  }

  return { boxX, boxY, boxW, boxH };
}

// Draws one selectable row inside a menu box: highlighted (gold + arrows)
// when `active`, plain cream otherwise. `subtext`, if given, renders smaller
// and dimmer just under the main label (used for slot summaries).
function drawMenuRow(label, cy, active, subtext) {
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = active ? '#e0b040' : '#f4ecd8';
  ctx.fillText((active ? '\u25B8 ' : '') + label + (active ? ' \u25C2' : ''), VIEW_W / 2, cy);
  if (subtext) {
    ctx.font = '16px monospace';
    ctx.fillStyle = active ? 'rgba(224,176,64,0.85)' : 'rgba(244,236,216,0.6)';
    ctx.fillText(subtext, VIEW_W / 2, cy + 20);
  }
}

function drawDigChoiceFallback() {
  const { boxY } = drawMenuBox("WHAT'S THE MOVE?", '[\u2191\u2193] choose   [E] select   [X] back');
  const rowY = [boxY + 90, boxY + 140, boxY + 190];
  DIG_CHOICES.forEach((label, i) => drawMenuRow(label, rowY[i], i === digChoiceIndex));
}

function drawSlotChooseFallback() {
  const title = pendingMode === 'new' ? 'START DIGGING \u2014 PICK A SLOT' : 'CONTINUE DIGGING \u2014 PICK A SLOT';
  const { boxY } = drawMenuBox(title, '[\u2191\u2193] choose   [E] select   [X] back');
  const rowY = [boxY + 90, boxY + 140, boxY + 190];
  SAVE_SLOTS.forEach((slot, i) => {
    const active = i === slotChoiceIndex;
    const summary = slotSummary(slot);
    let label = `SLOT ${slot}`;
    let subtext = summary || 'EMPTY';
    if (active && armedOverwriteSlot === slot) subtext = 'PRESS [E] AGAIN TO OVERWRITE';
    drawMenuRow(label, rowY[i], active, subtext);
  });
}

// Draws `img` scaled/letterboxed to fit inside the view (same "contain"
// fit as the character-select art), and returns the placement so callers
// can position dynamic overlay text against the art's own coordinates
// regardless of how it ends up scaled.
function drawSplashBackground(img, time) {
  drawDriftingSky(time);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const scale = Math.min(VIEW_W / iw, VIEW_H / ih);
  const dw = iw * scale, dh = ih * scale;
  const originX = (VIEW_W - dw) / 2, originY = (VIEW_H - dh) / 2;
  ctx.drawImage(img, originX, originY, dw, dh);
  return { originX, originY, dw, dh, scale };
}

// Layout measured directly from start_splash_1v2.png (as fractions of the
// art's own width/height): the title line above the divider, and the
// blank content panel below it where rows get drawn live. Both popups
// share this same frame art -- see drawDigChoice/drawSlotChoose.
const MENU_POPUP_LAYOUT = {
  titleYFrac: 0.4652,       // baseline of the title line
  titleCoverYFrac: 0.4196, titleCoverHFrac: 0.0910, // rect to blank out before redrawing title
  boxTopFrac: 0.5278, boxBottomFrac: 0.8443,
  boxXFrac: 0.0592, boxWFrac: 0.9408 - 0.0592,
};

function drawMenuPopupBackground(time, title) {
  const { originX, originY, dw, dh } = drawSplashBackground(menuPopupSplashImg, time);

  const boxX = originX + MENU_POPUP_LAYOUT.boxXFrac * dw;
  const boxW = MENU_POPUP_LAYOUT.boxWFrac * dw;
  const boxY = originY + MENU_POPUP_LAYOUT.boxTopFrac * dh;
  const boxH = (MENU_POPUP_LAYOUT.boxBottomFrac - MENU_POPUP_LAYOUT.boxTopFrac) * dh;

  // blank out the baked-in title text, then draw the one this screen needs.
  // Inset to boxX/boxW (same as the content panel below) so this doesn't
  // paint over the gold frame border on either side.
  const coverY = originY + MENU_POPUP_LAYOUT.titleCoverYFrac * dh;
  const coverH = MENU_POPUP_LAYOUT.titleCoverHFrac * dh;
  ctx.fillStyle = '#05111a';
  ctx.fillRect(boxX, coverY, boxW, coverH);
  ctx.textAlign = 'center';
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#e0b040';
  ctx.fillText(title, boxX + boxW / 2, originY + MENU_POPUP_LAYOUT.titleYFrac * dh);

  return { originX, originY, dw, dh, boxX, boxW, boxY, boxH };
}

function drawDigChoice(time) {
  if (!menuPopupSplashImg.complete || !menuPopupSplashImg.naturalWidth) { drawDigChoiceFallback(); return; }
  const { boxX, boxW, boxY, boxH } = drawMenuPopupBackground(time, "WHAT'S THE MOVE?");
  const cx = boxX + boxW / 2;
  const rowY = [boxY + boxH * 0.22, boxY + boxH * 0.5, boxY + boxH * 0.78];
  DIG_CHOICES.forEach((label, i) => {
    const active = i === digChoiceIndex;
    if (active) {
      // padded highlight box: extra breathing room above/below the text
      // baseline, and inset a bit from the panel's own edges, so the gold
      // border doesn't hug the letters or the frame.
      const rh = boxH * 0.2;
      const boxCY = rowY[i] - 4; // nudge up: fillText's y is the baseline, not the glyph's visual center
      const inset = boxW * 0.05;
      const hx = boxX + inset, hw = boxW - inset * 2;
      ctx.fillStyle = 'rgba(8,14,20,0.92)';
      ctx.fillRect(hx, boxCY - rh / 2, hw, rh);
      ctx.strokeStyle = '#e0b040';
      ctx.lineWidth = 2;
      ctx.strokeRect(hx + 2, boxCY - rh / 2 + 2, hw - 4, rh - 4);
    }
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = active ? '#e0b040' : '#f4ecd8';
    ctx.fillText((active ? '\u25B8 ' : '') + label + (active ? ' \u25C2' : ''), cx, rowY[i]);
  });
}

function drawSlotChoose(time) {
  if (!menuPopupSplashImg.complete || !menuPopupSplashImg.naturalWidth) { drawSlotChooseFallback(); return; }
  const title = pendingMode === 'new' ? 'START DIGGING \u2014 PICK A SLOT' : 'CONTINUE DIGGING \u2014 PICK A SLOT';
  const { boxX, boxW, boxY, boxH } = drawMenuPopupBackground(time, title);
  const textX = boxX + boxW * 0.06;
  const mainY = [boxY + boxH * 0.22, boxY + boxH * 0.52, boxY + boxH * 0.82];
  const subYOffset = boxH * 0.115;
  SAVE_SLOTS.forEach((slot, i) => {
    const active = i === slotChoiceIndex;
    const summary = slotSummary(slot);
    const label = `SLOT ${slot}`;
    let subtext = summary || 'EMPTY';
    if (active && armedOverwriteSlot === slot) subtext = 'PRESS [E] AGAIN TO OVERWRITE';
    if (active) {
      const rh = boxH * 0.27;
      ctx.fillStyle = 'rgba(8,14,20,0.92)';
      ctx.fillRect(boxX, mainY[i] - rh * 0.4, boxW, rh);
      ctx.strokeStyle = '#e0b040';
      ctx.lineWidth = 2;
      ctx.strokeRect(boxX + 2, mainY[i] - rh * 0.4 + 2, boxW - 4, rh - 4);
    }
    ctx.textAlign = 'left';
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = active ? '#e0b040' : '#f4ecd8';
    ctx.fillText((active ? '\u25B8 ' : '') + label, textX, mainY[i]);
    ctx.font = '13px monospace';
    ctx.fillStyle = active ? 'rgba(224,176,64,0.85)' : 'rgba(244,236,216,0.6)';
    ctx.fillText(subtext, textX, mainY[i] + subYOffset);
  });
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
  // background: flat dark backdrop -- the drifting sky from the title
  // screen stops here, once the player has moved on to picking a character.
  ctx.fillStyle = 'rgba(8,6,12,0.93)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
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

  // Character-specific cheers splash: santos -> santos_cheers, ricoAlt (Yanks
  // outfit) -> rico_yanks_cheers, rico (classic/Hiero) -> rico_heiro_cheers.
  const cheersImg = CHARACTER_CHEERS_IMG[selectedCharacter] || santosCheersImg;
  let dh = 0, dy = 10;
  if (cheersImg.complete && cheersImg.naturalWidth) {
    const iw = cheersImg.naturalWidth, ih = cheersImg.naturalHeight;
    const scale = Math.min(300 / iw, 380 / ih);
    const dw = iw * scale;
    dh = ih * scale;
    const dx = (VIEW_W - dw) / 2;
    ctx.drawImage(cheersImg, dx, dy, dw, dh);
  }

  // Same text/copy as the original popup, now laid out under the splash art.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e0b040';
  ctx.font = 'bold 26px monospace';
  const titleY = dy + dh + 32;
  ctx.fillText('BEAT COMPLETE!', VIEW_W / 2, titleY);

  ctx.fillStyle = '#f4ecd8';
  ctx.font = '13px monospace';
  ctx.fillText('All five samples on the pads. The whole town is bumping your track.', VIEW_W / 2, titleY + 22);

  const gridY = titleY + 36, sq = 34, gap = 10;
  const totalW = sq * 5 + gap * 4;
  worldPadOrder().forEach((id, i) => {
    const r = worldRecords()[id];
    const x = VIEW_W / 2 - totalW / 2 + i * (sq + gap);
    ctx.fillStyle = r.color;
    ctx.fillRect(x, gridY, sq, sq);
    ctx.fillStyle = '#181418';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(r.pad, x + sq / 2, gridY + sq / 2 + 4);
  });

  ctx.fillStyle = '#9a90a8';
  ctx.font = '12px monospace';
  ctx.fillText('Rico’s next beat tape: certified classic.', VIEW_W / 2, gridY + sq + 24);

  ctx.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#e0b040' : '#f4ecd8';
  ctx.font = 'bold 15px monospace';
  ctx.fillText('- PRESS E TO KEEP CRUISING -', VIEW_W / 2, VIEW_H - 18);
}

requestAnimationFrame(frame);

// debug/test handle
window.__rico = { player, maps, collected, getState: () => state, getCharacter: () => selectedCharacter,
  openDarts: () => enterMinigame(createDartsModeSelect()) };
})();
