// ================================================================
// DARTS MINI-GAME
// Extracted from Rico's Vinyl Quest game(9).js
// Classic script: load this BEFORE game.js.
// ================================================================
// Contains the complete mini-game implementation and mini-game-specific helpers.

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
  const SPOT_BASE = spot.intensity;

  // slow-drifting dust motes catching the spotlight, plus a couple of
  // floating motes near each sconce -- pure atmosphere, no gameplay effect
  const dust = createDustMotes(T, scene, {
    center: new T.Vector3(0, 1.9, -1.8), spread: new T.Vector3(2.6, 1.6, 3.2), count: 16,
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
  let spotBoostT = 0; // brief radial flare on the board when a throw lands

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
    spotBoostT = pendingPts > 0 ? 0.3 : 0.12; // brief flare on the scoring zone
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
    dust.dispose();
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
      dust.update(t);
      if (spotBoostT > 0) spotBoostT = Math.max(0, spotBoostT - dt);
      spot.intensity = flickerIntensity(SPOT_BASE, t) + spotBoostT * SPOT_BASE * 1.4;

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
