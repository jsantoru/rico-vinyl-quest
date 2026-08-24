// ================================================================
// CRATEDIG MINI-GAME
// Extracted from Rico's Vinyl Quest game(9).js
// Classic script: load this BEFORE game.js.
// ================================================================
// Contains the complete mini-game implementation and mini-game-specific helpers.

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
  let introT = 0; // counts up from 0 each time a fresh stack drops in; drives the camera push-in
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
  function newStack() { slots = Array.from({ length: SLOTS }, pickOutcome); introT = 0; }
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
  // (alternating shades) until grabbed, then flip color to the outcome. Each
  // gets a small circular "vinyl label" child mesh, hidden until a rare find
  // pulls it out and turns it to face the camera.
  const slotH = CRATE_H / SLOTS;
  const sleeveMeshes = [];
  const labelMeshes = [];
  const labelGeo = new T.CircleGeometry(0.11, 24);
  for (let i = 0; i < SLOTS; i++) {
    const sleeve = new T.Mesh(
      new T.BoxGeometry(CRATE_W - 0.1, slotH - 0.03, 0.16),
      new T.MeshStandardMaterial({ color: i % 2 === 0 ? 0x9a8058 : 0x8a7048, roughness: 0.85 })
    );
    sleeve.position.set(0, CRATE_H / 2 - slotH / 2 - i * slotH, -0.1);
    sleeve.castShadow = true;
    sleeve.receiveShadow = true;
    sleeve.userData.baseX = sleeve.position.x;
    sleeve.userData.baseY = sleeve.position.y;
    sleeve.userData.swaySeed = Math.random() * Math.PI * 2;
    crateGroup.add(sleeve);
    sleeveMeshes.push(sleeve);

    const label = new T.Mesh(
      labelGeo,
      new T.MeshBasicMaterial({ color: 0xf4ecd8, transparent: true, opacity: 0 })
    );
    label.position.set(0, 0, 0.09);
    label.scale.setScalar(0.001);
    sleeve.add(label);
    labelMeshes.push(label);
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
  const SPOT_BASE = spot.intensity;
  let spotBoostT = 0; // brief flare when a rare 45 catches the light

  // slow-drifting dust motes in the spotlight beam -- pure atmosphere
  const dust = createDustMotes(T, scene, {
    center: new T.Vector3(0, 1.6, -2.2), spread: new T.Vector3(1.8, 1.6, 2.2), count: 14,
  });

  // Fires the feedback for a grabbed sleeve, scaled to how good the find
  // was -- a rare 45 gets the full "perfect" treatment (camera punch, a
  // flash, a bigger particle burst, a bold popup), a mixtape gets a lighter
  // touch, and a dud gets barely more than a dull nudge. All of it routes
  // through the shared miniFX toolkit instead of one-off shake/ring code.
  function fireOutcomeFX(mesh, outcome, index) {
    const worldPos = new T.Vector3();
    mesh.getWorldPosition(worldPos);
    worldPos.z += 0.05;
    const screenPos = worldToScreen(worldPos);
    const label = labelMeshes[index];
    // sleeves on the left half of the crate flip open toward the right and
    // vice versa, so a grab never rotates a sleeve straight into its neighbor
    const side = index < SLOTS / 2 ? 1 : -1;

    if (outcome.type === 'rare') {
      // full PERFECT treatment: pop + flip toward camera, the vinyl label
      // catches the light, a warm spotlight flare, a bigger dust burst
      mesh.userData.popRotY = side * 0.5;
      label.userData.reveal = 1;
      spotBoostT = 0.4;
      fx.perfect3D(T, scene, worldPos, outcome.color);
      fx.flash('#e0b040', 0.14, 0.22);
      fx.ring(screenPos.x, screenPos.y, '#e0b040', { endRadius: 60 });
      fx.popup(`+${outcome.pts}`, screenPos.x, screenPos.y, { color: '#e0b040', size: 22 });
    } else if (outcome.type === 'mixtape') {
      mesh.userData.popRotY = side * 0.18;
      fx.cameraPunch(0.045, 0.16);
      fx.shake(0.025, 0.14);
      fx.spawnParticles3D(T, scene, worldPos, { color: outcome.color, count: 8 });
      fx.ring(screenPos.x, screenPos.y, '#4870d0');
      fx.popup(`+${outcome.pts}`, screenPos.x, screenPos.y, { color: '#4870d0' });
    } else {
      // MISS treatment: an awkward sideways slide instead of a clean pop,
      // a dull grey dust puff, a muted thud shake, and a brief screen dim
      // (reusing fx.flash with a dark color, rather than a bright one)
      mesh.userData.popX = side * -0.05;
      fx.shake(0.015, 0.12);
      fx.spawnParticles3D(T, scene, worldPos, { color: 0x555058, count: 5, speed: 0.7 });
      fx.flash('#050308', 0.22, 0.3);
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

    fireOutcomeFX(mesh, lastOutcome, grabbedIndex);

    phase = 'result';
    resultTimer = 1.0;
  }

  function resetSlot(i) {
    const mesh = sleeveMeshes[i];
    mesh.material.color.setHex(i % 2 === 0 ? 0x9a8058 : 0x8a7048);
    mesh.material.emissiveIntensity = 0;
    mesh.userData.popZ = 0;
    mesh.userData.popRotY = 0;
    mesh.userData.popX = 0;
    mesh.rotation.y = 0;
    mesh.position.z = -0.1;
    mesh.position.x = mesh.userData.baseX;
    const label = labelMeshes[i];
    label.userData.reveal = 0;
    label.material.opacity = 0;
    label.scale.setScalar(0.001);
  }

  // Full teardown -- called right before every exitMinigame().
  function cleanup() {
    fx.disposeParticles3D();
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

  return {
    update(dt) {
      t += dt;
      introT += dt;
      fx.update(dt);
      fx.updateParticles3D(dt);
      dust.update(t);
      if (spotBoostT > 0) spotBoostT = Math.max(0, spotBoostT - dt);
      spot.intensity = flickerIntensity(SPOT_BASE, t) + spotBoostT * SPOT_BASE * 1.6;

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
      // tonearm tip breathes gently, like it's riding the sleeves' surface
      needleTip.scale.setScalar(1 + Math.sin(t * 6) * 0.05);

      // sleeves sway slightly while sitting in the crate -- a little overlap
      // and shuffle so the stack reads as loose records, not a solid block --
      // and ease toward their grabbed pop/slide/rotate targets
      sleeveMeshes.forEach((mesh, i) => {
        if (phase === 'dig' && i !== grabbedIndex) {
          mesh.position.x = mesh.userData.baseX + Math.sin(t * 0.7 + mesh.userData.swaySeed) * 0.01;
          mesh.rotation.z = Math.sin(t * 0.5 + mesh.userData.swaySeed) * 0.008;
        }
        const targetZ = -0.1 + (mesh.userData.popZ || 0);
        mesh.position.z += (targetZ - mesh.position.z) * Math.min(1, dt * 8);
        const targetRotY = mesh.userData.popRotY || 0;
        mesh.rotation.y += (targetRotY - mesh.rotation.y) * Math.min(1, dt * 7);
        const targetX = mesh.userData.baseX + (mesh.userData.popX || 0);
        if (mesh.userData.popX) mesh.position.x += (targetX - mesh.position.x) * Math.min(1, dt * 10);
      });

      // vinyl label scales/fades in on a rare pull, tracking its sleeve's pop
      labelMeshes.forEach((label) => {
        const target = label.userData.reveal || 0;
        const cur = label.material.opacity;
        label.material.opacity += (target - cur) * Math.min(1, dt * 6);
        label.scale.setScalar(Math.max(0.001, label.material.opacity));
      });

      // camera: push in toward the crate as a fresh stack drops in, dolly
      // in further on a result, gentle idle sway, plus miniFX's decaying
      // shake and push-in punch layered on top
      const introPush = Math.max(0, 0.4 * (1 - Math.min(1, introT / 0.7)));
      const wantZ = (phase === 'result' || phase === 'done') ? CAM_Z_IN : CAM_POS.z + introPush;
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
