// ================================================================
// BUILDPIZZA MINI-GAME
// Extracted from Rico's Vinyl Quest game(9).js
// Classic script: load this BEFORE game.js.
// ================================================================
// Contains the complete mini-game implementation and mini-game-specific helpers.

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
