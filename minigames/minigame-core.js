// ================================================================
// MINI-GAME SHARED CORE
// Extracted from Rico's Vinyl Quest game(9).js
// Classic script: load this BEFORE game.js.
// ================================================================
// Shared lifecycle, action registry, trophy bookkeeping, lazy Three.js loading, renderer cache, FX, mode selection, and arcade-sign drawing.

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

// ---- shared 3D ambience helpers ---------------------------------------------
// Small, cheap helpers any 3D mini-game scene can pull in to feel "alive"
// without any new assets or textures: a multi-frequency light flicker
// (reads as a lived-in bulb, not a strobe) and a handful of slowly drifting
// dust motes. Both cost almost nothing -- a few extra sin() calls and, for
// the motes, a handful of tiny shared-geometry meshes -- and are torn down
// the same way every other per-scene Three.js object is.
//
// Usage:
//   spot.intensity = flickerIntensity(1.05, t);              // every frame
//   const dust = createDustMotes(T, scene, { center, spread });
//   dust.update(t);                                           // every frame
//   dust.dispose();                                           // in cleanup()
function flickerIntensity(base, t, seed = 0) {
  return base
    + Math.sin(t * 9.3 + seed) * base * 0.02
    + Math.sin(t * 2.6 + seed * 1.7) * base * 0.015
    + (Math.sin(t * 21 + seed * 3.1) > 0.965 ? base * 0.05 : 0); // rare tiny flicker-pop
}

function createDustMotes(T, scene, opts = {}) {
  const count = opts.count ?? 14;
  const spread = opts.spread ?? new T.Vector3(1.6, 1.4, 1.2);
  const center = opts.center ?? new T.Vector3(0, 1.4, -2);
  const color = opts.color ?? 0xf4ecd8;
  const geo = new T.SphereGeometry(0.006, 4, 3);
  const mat = new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.25 });
  const group = new T.Group();
  scene.add(group);
  const motes = [];
  for (let i = 0; i < count; i++) {
    const m = new T.Mesh(geo, mat);
    const seed = Math.random() * Math.PI * 2;
    m.position.set(
      center.x + (Math.random() - 0.5) * spread.x,
      center.y + (Math.random() - 0.5) * spread.y,
      center.z + (Math.random() - 0.5) * spread.z
    );
    group.add(m);
    motes.push({ mesh: m, seed, baseX: m.position.x, baseY: m.position.y, speed: 0.15 + Math.random() * 0.2 });
  }
  return {
    update(t) {
      motes.forEach((mo) => {
        mo.mesh.position.y = mo.baseY + Math.sin(t * mo.speed + mo.seed) * 0.12;
        mo.mesh.position.x = mo.baseX + Math.sin(t * mo.speed * 0.7 + mo.seed * 1.3) * 0.06;
      });
    },
    dispose() {
      scene.remove(group);
      geo.dispose();
      mat.dispose();
    },
  };
}

// ---- shared mini-game "juice" system (miniFX) ------------------------------
// A small reusable effects toolkit any mini-game can pull from instead of
// hand-rolling its own flash/shake/popup/particle/camera-punch code every
// time -- Crate Digging 3D already rolls its own version of several of these
// (a decaying camera shake, an expanding impact ring, a per-sleeve pop) and
// this is that pattern pulled out and generalized so every mini-game,
// current and future, can share one implementation.
//
// Nothing calls into this yet. It's built first, on its own, so the next
// pass -- upgrading Crate Digging 3D to use it -- is wiring, not invention.
// Once that one mini-game proves the system out, the same `fx` instance
// shape drops into Beat Match, Beat Jam, and the rest.
//
// Usage shape, once wired into a mini-game (2D canvas games read `fx.draw()`
// and `fx.shakeOffset`; 3D scenes skip `fx.draw()` and instead read the live
// numeric offsets directly and manage their own particle scene):
//
//   const fx = createMiniFX();
//
//   update(dt) {
//     fx.update(dt);                              // every frame, first thing
//     ...
//     if (goodHit) fx.perfect(x, y, '#e0b040', '+100');  // 2D combo
//     if (miss)    fx.miss(x, y);
//   }
//
//   draw() {                                       // 2D mini-game
//     ctx.save();
//     ctx.translate(fx.shakeOffset.x, fx.shakeOffset.y);
//     ...normal drawing...
//     ctx.restore();
//     fx.draw();                                    // flashes/popups/etc on top
//   }
//
//   // 3D mini-game, each frame:
//   camera.position.x = CAM_POS.x + fx.shakeOffset.x;
//   camera.position.z = baseZ + fx.cameraPunchOffset;   // punch curve
//   if (goodHit) fx.perfect3D(T, scene, worldPos, 0xe0b040);
//   fx.updateParticles3D(dt);
//   // on cleanup, alongside the scene's own dispose:
//   fx.disposeParticles3D();
function createMiniFX() {
  // ---- screen flash: a full-view color wash that fades out -----------------
  let flashColor = '#ffffff', flashT = 0, flashDur = 0, flashPeak = 0;
  function flash(color, duration = 0.15, peakAlpha = 0.35) {
    flashColor = color; flashT = 0; flashDur = duration; flashPeak = peakAlpha;
  }

  // ---- screen/camera shake: decaying random jitter --------------------------
  let shakeT = 0, shakeDur = 0, shakeMag = 0;
  const shakeOffset = { x: 0, y: 0 };
  function shake(magnitude = 6, duration = 0.2) {
    // don't let a small hit cut off a bigger shake that's still playing out
    const remaining = shakeT < shakeDur ? shakeMag * (1 - shakeT / shakeDur) : 0;
    if (magnitude < remaining) return;
    shakeMag = magnitude; shakeDur = duration; shakeT = 0;
  }

  // ---- camera punch: a quick push-in-and-back curve, for 3D cameras --------
  let punchT = 0, punchDur = 0, punchMag = 0;
  let cameraPunchOffset = 0;
  function cameraPunch(magnitude = 0.06, duration = 0.18) {
    punchMag = magnitude; punchDur = duration; punchT = 0;
  }

  // ---- popups: floating score/label text ------------------------------------
  let popups = [];
  function popup(text, x, y, opts = {}) {
    popups.push({
      text, x, y,
      color: opts.color || '#f4ecd8',
      size: opts.size || 16,
      life: 0,
      maxLife: opts.duration || 0.9,
      rise: opts.rise || 40,
    });
  }

  // ---- rings: expanding, fading circle outlines (2D) -------------------------
  let rings = [];
  function ring(x, y, color, opts = {}) {
    rings.push({
      x, y, color,
      life: 0,
      maxLife: opts.duration || 0.4,
      startR: opts.startRadius ?? 6,
      endR: opts.endRadius ?? 46,
      lineWidth: opts.lineWidth || 3,
    });
  }

  // ---- particles: small 2D canvas bursts -------------------------------------
  let particles2D = [];
  function particles(x, y, opts = {}) {
    const count = opts.count ?? 10;
    const color = opts.color || '#e0b040';
    const speed = opts.speed ?? 90;
    const gravity = opts.gravity ?? 160;
    const life = opts.life ?? 0.6;
    const size = opts.size ?? 3;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      particles2D.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.3,
        life: 0, maxLife: life * (0.7 + Math.random() * 0.6),
        color, size: size * (0.7 + Math.random() * 0.6), gravity,
      });
    }
  }

  // ---- particles3D: small Three.js mesh bursts, for 3D scenes ----------------
  // The caller's scene owns these meshes once added -- disposeParticles3D()
  // must be called from the mini-game's own cleanup() so nothing leaks past
  // exitMinigame(), same as every other Three.js object those scenes create.
  let particles3D = [];
  function spawnParticles3D(T, scene, position, opts = {}) {
    const count = opts.count ?? 8;
    const color = opts.color ?? 0xe0b040;
    const speed = opts.speed ?? 1.4;
    const size = opts.size ?? 0.03;
    const life = opts.life ?? 0.5;
    const geo = new T.SphereGeometry(size, 5, 4);
    for (let i = 0; i < count; i++) {
      const mat = new T.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const mesh = new T.Mesh(geo, mat);
      mesh.position.copy(position);
      const dir = new T.Vector3(
        Math.random() - 0.5, Math.random() * 0.6 + 0.2, Math.random() - 0.5
      ).normalize();
      const s = speed * (0.5 + Math.random() * 0.6);
      scene.add(mesh);
      particles3D.push({
        mesh, vel: dir.multiplyScalar(s), life: 0,
        maxLife: life * (0.7 + Math.random() * 0.6),
        sharedGeo: geo,
      });
    }
  }
  function updateParticles3D(dt) {
    for (let i = particles3D.length - 1; i >= 0; i--) {
      const p = particles3D[i];
      p.life += dt;
      const k = p.life / p.maxLife;
      if (k >= 1) {
        if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
        p.mesh.material.dispose();
        particles3D.splice(i, 1);
        continue;
      }
      p.vel.y -= dt * 1.6; // gentle gravity
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.material.opacity = 1 - k;
      p.mesh.scale.setScalar(1 - k * 0.5);
    }
  }
  // Call from the mini-game's own cleanup(), before exitMinigame().
  function disposeParticles3D() {
    const seenGeo = new Set();
    particles3D.forEach((p) => {
      if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
      p.mesh.material.dispose();
      if (!seenGeo.has(p.sharedGeo)) { p.sharedGeo.dispose(); seenGeo.add(p.sharedGeo); }
    });
    particles3D = [];
  }

  // ---- convenience combos -----------------------------------------------------
  // A "big success" moment, 2D: flash + shake + ring + particles + popup.
  function perfect(x, y, color = '#e0b040', text = null) {
    flash(color, 0.12, 0.22);
    shake(7, 0.22);
    ring(x, y, color);
    particles(x, y, { color, count: 14 });
    if (text) popup(text, x, y, { color });
  }
  // A smaller "ok" moment, 2D: no flash, gentler shake/particles.
  function goodHit(x, y, color = '#f4ecd8', text = null) {
    shake(3, 0.12);
    particles(x, y, { color, count: 6, speed: 60 });
    if (text) popup(text, x, y, { color });
  }
  // A miss, 2D: a quick dull shake, no flash, no particles.
  function miss(x, y, text = null) {
    shake(4, 0.15);
    if (text) popup(text, x, y, { color: '#c04070' });
  }
  // A "big success" moment, 3D: camera punch + shake + a particle burst at
  // the given world position. The caller still owns rendering the scene/camera.
  function perfect3D(T, scene, worldPos, color = 0xe0b040) {
    cameraPunch(0.08, 0.2);
    shake(0.05, 0.22);
    spawnParticles3D(T, scene, worldPos, { color, count: 12 });
  }

  return {
    // primitives
    flash, shake, cameraPunch, popup, ring, particles,
    spawnParticles3D, updateParticles3D, disposeParticles3D,
    // convenience combos
    perfect, goodHit, miss, perfect3D,
    // live values 2D and 3D scenes read directly each frame
    shakeOffset,
    get cameraPunchOffset() { return cameraPunchOffset; },

    update(dt) {
      if (flashT < flashDur) flashT += dt;

      if (shakeT < shakeDur) {
        shakeT += dt;
        const k = Math.max(0, 1 - shakeT / shakeDur);
        const m = shakeMag * k;
        shakeOffset.x = (Math.random() - 0.5) * 2 * m;
        shakeOffset.y = (Math.random() - 0.5) * 2 * m;
      } else {
        shakeOffset.x = 0; shakeOffset.y = 0;
      }

      // eases up to the peak and back down to 0 over the punch's duration,
      // rather than snapping in and cutting off
      if (punchT < punchDur) {
        punchT += dt;
        const k = Math.min(1, punchT / punchDur);
        cameraPunchOffset = Math.sin(k * Math.PI) * punchMag;
      } else {
        cameraPunchOffset = 0;
      }

      popups.forEach((p) => { p.life += dt; });
      popups = popups.filter((p) => p.life < p.maxLife);

      rings.forEach((r) => { r.life += dt; });
      rings = rings.filter((r) => r.life < r.maxLife);

      for (let i = particles2D.length - 1; i >= 0; i--) {
        const p = particles2D[i];
        p.life += dt;
        if (p.life >= p.maxLife) { particles2D.splice(i, 1); continue; }
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    },

    // Draws every active 2D effect (particles, rings, popups, flash wash) on
    // top of whatever the mini-game already drew this frame. 3D scenes don't
    // call this -- they read shakeOffset/cameraPunchOffset directly and call
    // updateParticles3D() instead, since their particles live in the scene.
    draw() {
      particles2D.forEach((p) => {
        const k = 1 - p.life / p.maxLife;
        ctx.globalAlpha = Math.max(0, k);
        // soft halo behind the solid core -- radius is rounded so the
        // shared sprite cache only ever holds a handful of entries even
        // though particle sizes vary continuously
        drawGlow(p.x, p.y, Math.max(4, Math.round(p.size * 1.6)), hexToRgbaTemplate(p.color));
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      });
      ctx.globalAlpha = 1;

      rings.forEach((r) => {
        const k = r.life / r.maxLife;
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.strokeStyle = r.color;
        ctx.lineWidth = r.lineWidth;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.startR + (r.endR - r.startR) * k, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;

      popups.forEach((p) => {
        const k = p.life / p.maxLife;
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.fillStyle = p.color;
        ctx.font = `bold ${p.size}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y - k * p.rise);
      });
      ctx.globalAlpha = 1;

      if (flashT < flashDur) {
        const k = Math.max(0, 1 - flashT / flashDur);
        ctx.globalAlpha = flashPeak * k;
        ctx.fillStyle = flashColor;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        ctx.globalAlpha = 1;
      }
    },
  };
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
