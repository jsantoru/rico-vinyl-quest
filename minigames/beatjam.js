// ================================================================
// BEATJAM MINI-GAME
// Extracted from Rico's Vinyl Quest game(9).js
// Classic script: load this BEFORE game.js.
// ================================================================
// Contains the complete mini-game implementation and mini-game-specific helpers.

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
