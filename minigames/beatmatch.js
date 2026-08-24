// ================================================================
// BEATMATCH MINI-GAME
// Extracted from Rico's Vinyl Quest game(9).js
// Classic script: load this BEFORE game.js.
// ================================================================
// Contains the complete mini-game implementation and mini-game-specific helpers.

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
