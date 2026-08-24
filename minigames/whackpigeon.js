// ================================================================
// WHACKPIGEON MINI-GAME
// Extracted from Rico's Vinyl Quest game(9).js
// Classic script: load this BEFORE game.js.
// ================================================================
// Contains the complete mini-game implementation and mini-game-specific helpers.

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
