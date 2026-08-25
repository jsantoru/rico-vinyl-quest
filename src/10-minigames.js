// FRAGMENT 2/3 -- all mini-games (darts, beat match, whack-a-pigeon, crate digging,
// speed sweep, staring contest, pizza build, claw machine, scratch-dj) + shared
// mini-game plumbing (enterMinigame/exitMinigame, trophy case, miniFX, axis()).
// Concatenated by build.sh into game.js. Not loaded standalone. Edit here, then run build.sh.
// Runs inside the same closure as 00-engine-head.js / 20-engine-tail.js -- it relies on
// (and can freely use) ctx, player, state, camera, maps, shops, etc. declared there.
//
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

// ---- shared Three.js teardown helpers --------------------------------------
// Every 3D mini-game builds its own scene and its own one-off tracked meshes
// (impact rings, held pieces, etc). These two helpers cover both patterns so
// each game's cleanup()/disposeX() just calls through instead of repeating
// the same geometry/material dispose dance.

// Disposes every mesh's geometry + material still attached to `scene`, then
// clears the scene itself. Call this last in a game's cleanup(), after any
// one-off tracked meshes (impact rings, particles, etc.) have already been
// disposed individually -- scene.traverse() only reaches what's still in the
// scene graph at the moment it runs.
function disposeSceneContents(scene) {
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  });
  scene.clear();
}

// Disposes a single tracked mesh (e.g. an impact ring) referenced by a plain
// `{ current }`-style holder, removing it from `scene` first. No-op if the
// holder's current value is already null. Games keep the mesh in a closure
// variable and pass a tiny getter/setter pair so this stays a plain function
// instead of needing per-game boilerplate.
function disposeTrackedMesh(scene, getMesh, clearMesh) {
  const mesh = getMesh();
  if (!mesh) return;
  scene.remove(mesh);
  mesh.geometry.dispose();
  mesh.material.dispose();
  clearMesh();
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
    disposeTrackedMesh(scene, () => impactRing, () => { impactRing = null; });
  }

  // Full teardown -- called by this game right before every exitMinigame().
  // Geometries and materials go; the renderer and its context stay cached
  // for the next visit.
  function cleanup() {
    disposeImpactRing();
    disposeSceneContents(scene);
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
    disposeTrackedMesh(scene, () => impactRing, () => { impactRing = null; });
  }

  // Full teardown -- called right before every exitMinigame().
  function cleanup() {
    disposeImpactRing();
    disposeSceneContents(scene);
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
    // Fire at the current audio-clock instant -- no forward offset -- so a
    // pad hit is heard as close to instantly as Web Audio allows. (Web
    // Audio clamps any start time at/behind "now" to play immediately
    // rather than throwing, so this is safe.)
    const t = music.ctx.currentTime;
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
  const SPOT_BASE = 0.9;
  const spot = new T.SpotLight(0xffe2c0, SPOT_BASE, 14, 0.55, 0.5);
  spot.position.set(0, 3.2, -1.4);
  spot.target = chassisGroup;
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  scene.add(spot);

  const fx = createMiniFX();
  let spotBoost = 0; // kick gives the spotlight a brief boom-pulse, decays back to SPOT_BASE

  // Each pad gets its own reaction instead of one shared generic flash --
  // kick is a BOOM that thumps the camera and pulses the spotlight, snare
  // is a sharp FLASH, hi-hat is a tiny sparkle, keys ripple outward like a
  // wave. All of it routes through the shared miniFX toolkit.
  function triggerPad(p) {
    p.flash = 1;
    hits++;
    const mesh = padMeshes[p.id];
    mesh.userData.pressT = 0.001; // kicks off the press-in animation
    const worldPos = new T.Vector3();
    mesh.getWorldPosition(worldPos);
    worldPos.z += 0.06;

    if (p.id === 'kick') {
      fx.cameraPunch(0.05, 0.14);
      fx.shake(0.03, 0.16);
      fx.flash('#e0603a', 0.1, 0.12);
      fx.spawnParticles3D(T, scene, worldPos, { color: p.color, count: 10, speed: 1.7 });
      spotBoost = Math.min(spotBoost + 1.1, 1.6);
    } else if (p.id === 'snare') {
      fx.cameraPunch(0.03, 0.1);
      fx.shake(0.018, 0.1);
      fx.flash('#4ad0ff', 0.08, 0.1);
      fx.spawnParticles3D(T, scene, worldPos, { color: p.color, count: 8, speed: 1.3 });
    } else if (p.id === 'hihat') {
      fx.shake(0.006, 0.06);
      fx.spawnParticles3D(T, scene, worldPos, { color: p.color, count: 4, speed: 0.9, size: 0.018, life: 0.3 });
    } else if (p.id === 'keys') {
      fx.cameraPunch(0.02, 0.12);
      fx.shake(0.01, 0.08);
      fx.ring(cx + p.dx, cy + p.dy, '#8cff5f', { endRadius: 70, duration: 0.5, lineWidth: 2 });
      fx.spawnParticles3D(T, scene, worldPos, { color: p.color, count: 6, speed: 1.0 });
    }

    if (!music.ctx) return;
    // Same reasoning as the classic version's triggerPad: play right at
    // "now" instead of scheduling 20ms out, so pads respond instantly.
    const time = music.ctx.currentTime;
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
    fx.disposeParticles3D();
    disposeSceneContents(scene);
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
      fx.update(dt);
      fx.updateParticles3D(dt);
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

      // kick's spotlight boom-pulse decays back to its resting brightness
      spotBoost = Math.max(0, spotBoost - dt * 4);
      spot.intensity = SPOT_BASE + spotBoost;

      // gentle idle sway, plus miniFX's decaying shake and push-in punch
      // (mashing pads reads as a steady vibration since fx.shake() won't
      // let a small hit cut off a bigger one still playing out)
      const sway = Math.sin(t * 0.55) * 0.012;
      camera.position.set(
        CAM_POS.x + sway + fx.shakeOffset.x,
        CAM_POS.y + Math.sin(t * 0.75) * 0.007 + fx.shakeOffset.y,
        CAM_POS.z + fx.cameraPunchOffset
      );
      camera.lookAt(MPC_POS.x, MPC_POS.y, MPC_POS.z);
    },
    draw() {
      renderer.render(scene, camera);
      ctx.drawImage(jam3DCanvas, 0, 0);
      fx.draw(); // screen-space flash/ring from the last hit, on top of the 3D frame

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
    disposeTrackedMesh(scene, () => impactRing, () => { impactRing = null; });
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
    disposeSceneContents(scene);
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
  const fx = createMiniFX();

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

  // Projects a 3D world position to 2D canvas pixel coordinates, so fx's
  // screen-space effects (ring/popup) can land on top of a specific sleeve
  // even though the scene itself is rendered in 3D.
  function worldToScreen(vec3) {
    const p = vec3.clone().project(camera);
    return { x: (p.x + 1) / 2 * VIEW_W, y: (1 - p.y) / 2 * VIEW_H };
  }

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

  // Fires the feedback for a grabbed sleeve, scaled to how good the find
  // was -- a rare 45 gets the full "perfect" treatment (camera punch, a
  // flash, a bigger particle burst, a bold popup), a mixtape gets a lighter
  // touch, and a dud gets barely more than a dull nudge. All of it routes
  // through the shared miniFX toolkit instead of one-off shake/ring code.
  function fireOutcomeFX(mesh, outcome) {
    const worldPos = new T.Vector3();
    mesh.getWorldPosition(worldPos);
    worldPos.z += 0.05;
    const screenPos = worldToScreen(worldPos);

    if (outcome.type === 'rare') {
      fx.perfect3D(T, scene, worldPos, outcome.color);
      fx.flash('#e0b040', 0.14, 0.22);
      fx.ring(screenPos.x, screenPos.y, '#e0b040', { endRadius: 60 });
      fx.popup(`+${outcome.pts}`, screenPos.x, screenPos.y, { color: '#e0b040', size: 22 });
    } else if (outcome.type === 'mixtape') {
      fx.cameraPunch(0.045, 0.16);
      fx.shake(0.025, 0.14);
      fx.spawnParticles3D(T, scene, worldPos, { color: outcome.color, count: 8 });
      fx.ring(screenPos.x, screenPos.y, '#4870d0');
      fx.popup(`+${outcome.pts}`, screenPos.x, screenPos.y, { color: '#4870d0' });
    } else {
      fx.shake(0.012, 0.1);
      fx.popup('DUD', screenPos.x, screenPos.y, { color: '#8a8090', size: 13 });
    }
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

    // rare finds pop forward harder -- the "feel" scales with how good the
    // pull was, same spirit as darts' impact shake
    const popZ = lastOutcome.type === 'rare' ? 0.32 : lastOutcome.type === 'mixtape' ? 0.2 : 0.1;
    mesh.userData.popZ = popZ;

    fireOutcomeFX(mesh, lastOutcome);

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
    fx.disposeParticles3D();
    disposeSceneContents(scene);
  }
  function leave() { cleanup(); exitMinigame(); }

  return {
    update(dt) {
      t += dt;
      fx.update(dt);
      fx.updateParticles3D(dt);

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

      // camera: dolly in on a result, gentle idle sway, plus miniFX's
      // decaying shake and push-in punch layered on top
      const wantZ = (phase === 'result' || phase === 'done') ? CAM_Z_IN : CAM_POS.z;
      camZ += (wantZ - camZ) * Math.min(1, dt * 5);
      const sway = Math.sin(t * 0.6) * 0.015;
      camera.position.set(
        CAM_POS.x + sway + fx.shakeOffset.x,
        CAM_POS.y + Math.sin(t * 0.8) * 0.008 + fx.shakeOffset.y,
        camZ + fx.cameraPunchOffset
      );
      camera.lookAt(CRATE_POS.x, CRATE_POS.y, CRATE_POS.z);

      // X always bails out early, no matter the phase
      if (buyPressed) { leave(); return; }
    },
    draw() {
      renderer.render(scene, camera);
      ctx.drawImage(crate3DCanvas, 0, 0);
      fx.draw(); // screen-space flash/ring/popup from the last grab, on top of the 3D frame

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
    disposeSceneContents(scene);
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
    disposeTrackedMesh(scene, () => impactRing, () => { impactRing = null; });
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
    disposeSceneContents(scene);
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
    disposeSceneContents(scene);
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

