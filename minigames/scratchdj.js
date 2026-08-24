// ================================================================
// SCRATCHDJ MINI-GAME
// Extracted from Rico's Vinyl Quest game(9).js
// Classic script: load this BEFORE game.js.
// ================================================================
// Contains the complete mini-game implementation and mini-game-specific helpers.

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

