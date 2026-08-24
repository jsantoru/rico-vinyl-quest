// ================================================================
// SPEEDSWEEP MINI-GAME
// Extracted from Rico's Vinyl Quest game(9).js
// Classic script: load this BEFORE game.js.
// ================================================================
// Contains the complete mini-game implementation and mini-game-specific helpers.

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
