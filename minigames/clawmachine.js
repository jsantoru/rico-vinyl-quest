// ================================================================
// CLAWMACHINE MINI-GAME
// Extracted from Rico's Vinyl Quest game(9).js
// Classic script: load this BEFORE game.js.
// ================================================================
// Contains the complete mini-game implementation and mini-game-specific helpers.

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
