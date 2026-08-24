// ================================================================
// STARINGCONTEST MINI-GAME
// Extracted from Rico's Vinyl Quest game(9).js
// Classic script: load this BEFORE game.js.
// ================================================================
// Contains the complete mini-game implementation and mini-game-specific helpers.

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
