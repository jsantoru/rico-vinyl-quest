/* =========================================================
   RICO CUTS — Turntable Scratch Engine
   ---------------------------------------------------------
   Drag the record back & forth to scratch. The audio playhead
   is slaved to your hand: forward drag = forward audio,
   backward drag = reversed audio. Release to let it ride.

   Everything is self-contained (no audio files needed):
   the loops are synthesized into an AudioBuffer at runtime.

   To drop this into your own game.js later, the important
   pieces are:
     - RicoCuts.init()          -> wire up DOM + audio
     - the ScratchEngine        -> per-sample playhead reader
     - pointer -> rate mapping  -> in attachDragHandlers()
   ========================================================= */

(function () {
  "use strict";

  // ---- Tunables ---------------------------------------------------------
  const SECONDS_PER_ROTATION = 1.8; // visual spin speed at rate 1.0
  const ANG_VEL_NORMAL = (2 * Math.PI) / SECONDS_PER_ROTATION; // rad/s at 1x
  const MAX_RATE = 8; // clamp scratch speed
  const RATE_SMOOTHING = 0.35; // 0..1, higher = snappier
  const FREE_RATE_SMOOTHING = 0.08; // easing back to base pitch on release

  // ---- State ------------------------------------------------------------
  const state = {
    audioCtx: null,
    scratchNode: null,
    gainNode: null,
    buffers: {}, // name -> Float32Array (mono)
    currentBufferName: "funk",
    sampleRate: 44100,

    playing: false,
    scratching: false,
    basePitch: 1.0, // from pitch slider (0.5..1.5)
    volume: 0.8,

    // playhead + rate are shared with the audio callback
    playhead: 0, // fractional sample index
    rate: 0, // current playback multiplier (can be negative)
    targetRate: 0, // where rate is easing toward

    // visual
    angle: 0, // radians
    lastPointerAngle: 0,
    lastMoveTime: 0,
  };

  // ---- DOM refs ---------------------------------------------------------
  let els = {};

  // =======================================================================
  // AUDIO: synthesize loops so no external files are required
  // =======================================================================
  function makeFunkLoop(sr) {
    const dur = 1.8;
    const n = Math.floor(sr * dur);
    const out = new Float32Array(n);
    const beat = dur / 4; // 4 beats

    const kick = (t) => {
      const f = 120 * Math.exp(-t * 18) + 45;
      return Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 9);
    };
    const snare = (t) => {
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 22);
      const tone = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 26);
      return noise * 0.7 + tone * 0.3;
    };
    const hat = (t) => (Math.random() * 2 - 1) * Math.exp(-t * 60) * 0.5;
    const bass = (t, f) => Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 3) * 0.6;

    const bassNotes = [55, 55, 82.4, 65.4];

    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const b = Math.floor(t / beat); // beat index 0..3
      const tb = t - b * beat; // time within beat
      let s = 0;

      // kick on 0 and 2
      if (b === 0 || b === 2) s += kick(tb) * 0.9;
      // snare on 1 and 3
      if (b === 1 || b === 3) s += snare(tb) * 0.7;
      // hats every 8th
      const th = t % (beat / 2);
      s += hat(th);
      // bass line
      s += bass(tb, bassNotes[b]);

      out[i] = s;
    }
    return normalize(out);
  }

  function makeBoomLoop(sr) {
    const dur = 2.4;
    const n = Math.floor(sr * dur);
    const out = new Float32Array(n);
    const beat = dur / 4;

    const kick = (t) => Math.sin(2 * Math.PI * (70 + 60 * Math.exp(-t * 20)) * t) * Math.exp(-t * 7);
    const snare = (t) => ((Math.random() * 2 - 1) * Math.exp(-t * 16)) * 0.8;
    const rim = (t) => Math.sin(2 * Math.PI * 320 * t) * Math.exp(-t * 40) * 0.4;

    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const b = Math.floor(t / beat);
      const tb = t - b * beat;
      let s = 0;
      if (b === 0 || b === 2) s += kick(tb);
      if (b === 1 || b === 3) s += snare(tb);
      const tr = t % (beat / 2);
      s += rim(tr);
      out[i] = s;
    }
    return normalize(out);
  }

  function makeToneLoop(sr) {
    const dur = 1.2;
    const n = Math.floor(sr * dur);
    const out = new Float32Array(n);
    const notes = [261.6, 329.6, 392.0, 329.6]; // C E G E
    const step = dur / notes.length;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const idx = Math.floor(t / step);
      const tn = t - idx * step;
      const f = notes[idx % notes.length];
      const env = Math.exp(-tn * 3);
      out[i] =
        (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2 * t)) * env * 0.5;
    }
    return normalize(out);
  }

  function normalize(arr) {
    let peak = 0;
    for (let i = 0; i < arr.length; i++) peak = Math.max(peak, Math.abs(arr[i]));
    if (peak > 0) {
      const g = 0.9 / peak;
      for (let i = 0; i < arr.length; i++) arr[i] *= g;
    }
    return arr;
  }

  // =======================================================================
  // AUDIO GRAPH
  // =======================================================================
  function ensureAudio() {
    if (state.audioCtx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    state.audioCtx = ctx;
    state.sampleRate = ctx.sampleRate;

    // Build loops at the real sample rate
    state.buffers.funk = makeFunkLoop(ctx.sampleRate);
    state.buffers.boom = makeBoomLoop(ctx.sampleRate);
    state.buffers.tone = makeToneLoop(ctx.sampleRate);

    // Gain
    const gain = ctx.createGain();
    gain.gain.value = state.volume;
    gain.connect(ctx.destination);
    state.gainNode = gain;

    // ScriptProcessor scratch engine (universally supported, single-file friendly)
    const bufSize = 1024;
    const node = ctx.createScriptProcessor(bufSize, 0, 1);
    node.onaudioprocess = onAudioProcess;
    node.connect(gain);
    state.scratchNode = node;
  }

  function onAudioProcess(e) {
    const output = e.outputBuffer.getChannelData(0);
    const buf = state.buffers[state.currentBufferName];
    const len = buf.length;

    // Ease `rate` toward target so scratches don't click.
    const smoothing = state.scratching ? RATE_SMOOTHING : FREE_RATE_SMOOTHING;

    for (let i = 0; i < output.length; i++) {
      // Per-sample smoothing of rate
      state.rate += (state.targetRate - state.rate) * smoothing * 0.05;

      let ph = state.playhead + state.rate;
      // wrap playhead within buffer
      if (ph >= len) ph -= len;
      else if (ph < 0) ph += len;
      state.playhead = ph;

      // linear interpolation
      const i0 = Math.floor(ph);
      const i1 = i0 + 1 >= len ? 0 : i0 + 1;
      const frac = ph - i0;
      output[i] = buf[i0] * (1 - frac) + buf[i1] * frac;
    }

    // If essentially stopped and silent, we still output zeros naturally.
  }

  // =======================================================================
  // POINTER / DRAG -> SCRATCH
  // =======================================================================
  function pointerAngle(clientX, clientY) {
    const rect = els.record.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(clientY - cy, clientX - cx);
  }

  function attachDragHandlers() {
    const rec = els.record;

    const onDown = (ev) => {
      ensureAudio();
      resumeCtx();
      state.scratching = true;
      rec.classList.add("scratching");
      const p = getPoint(ev);
      state.lastPointerAngle = pointerAngle(p.x, p.y);
      state.lastMoveTime = performance.now();
      state.targetRate = 0;
      if (ev.cancelable) ev.preventDefault();
    };

    const onMove = (ev) => {
      if (!state.scratching) return;
      const p = getPoint(ev);
      const now = performance.now();
      const ang = pointerAngle(p.x, p.y);

      let dA = ang - state.lastPointerAngle;
      // shortest angular path
      if (dA > Math.PI) dA -= 2 * Math.PI;
      else if (dA < -Math.PI) dA += 2 * Math.PI;

      const dt = Math.max((now - state.lastMoveTime) / 1000, 1 / 240);
      const angVel = dA / dt; // rad/s

      // Map to playback rate. 1x == normal spin speed.
      let r = angVel / ANG_VEL_NORMAL;
      r = Math.max(-MAX_RATE, Math.min(MAX_RATE, r));
      state.targetRate = r;

      // Drive the visual directly from the hand while scratching
      state.angle += dA;

      state.lastPointerAngle = ang;
      state.lastMoveTime = now;
      if (ev.cancelable) ev.preventDefault();
    };

    const onUp = () => {
      if (!state.scratching) return;
      state.scratching = false;
      rec.classList.remove("scratching");
      // Resume base playback if the deck is "playing", else glide to stop.
      state.targetRate = state.playing ? state.basePitch : 0;
    };

    // Mouse
    rec.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    // Touch
    rec.addEventListener("touchstart", onDown, { passive: false });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    window.addEventListener("touchcancel", onUp);

    // Keyboard nudge for accessibility
    rec.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowLeft" || ev.key === "ArrowRight") {
        ensureAudio();
        resumeCtx();
        const dir = ev.key === "ArrowRight" ? 1 : -1;
        state.targetRate = dir * 2.5;
        state.angle += dir * 0.25;
        setTimeout(() => {
          state.targetRate = state.playing ? state.basePitch : 0;
        }, 120);
        ev.preventDefault();
      }
    });
  }

  function getPoint(ev) {
    if (ev.touches && ev.touches.length) {
      return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
    }
    if (ev.changedTouches && ev.changedTouches.length) {
      return { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY };
    }
    return { x: ev.clientX, y: ev.clientY };
  }

  // =======================================================================
  // TRANSPORT / CONTROLS
  // =======================================================================
  function resumeCtx() {
    if (state.audioCtx && state.audioCtx.state === "suspended") {
      state.audioCtx.resume();
    }
  }

  function togglePlay() {
    ensureAudio();
    resumeCtx();
    state.playing = !state.playing;
    if (state.playing) {
      state.targetRate = state.basePitch;
      els.playBtn.classList.add("playing");
      els.playBtn.setAttribute("aria-pressed", "true");
      els.playBtn.querySelector(".btn-text").textContent = "Stop";
      els.playBtn.querySelector(".btn-icon").textContent = "■";
    } else {
      if (!state.scratching) state.targetRate = 0;
      els.playBtn.classList.remove("playing");
      els.playBtn.setAttribute("aria-pressed", "false");
      els.playBtn.querySelector(".btn-text").textContent = "Play";
      els.playBtn.querySelector(".btn-icon").textContent = "▶";
    }
  }

  function attachControls() {
    els.playBtn.addEventListener("click", togglePlay);

    els.volume.addEventListener("input", (e) => {
      state.volume = e.target.value / 100;
      if (state.gainNode) state.gainNode.gain.value = state.volume;
    });

    els.pitch.addEventListener("input", (e) => {
      state.basePitch = e.target.value / 100; // 0.5 .. 1.5
      if (state.playing && !state.scratching) state.targetRate = state.basePitch;
    });

    els.track.addEventListener("change", (e) => {
      state.currentBufferName = e.target.value;
      state.playhead = 0;
    });
  }

  // =======================================================================
  // VISUAL LOOP
  // =======================================================================
  function tick(now) {
    if (!state._lastTick) state._lastTick = now;
    const dt = (now - state._lastTick) / 1000;
    state._lastTick = now;

    // When not physically scratching, spin visual from playback rate
    if (!state.scratching) {
      state.angle += state.rate * ANG_VEL_NORMAL * dt;
    }

    els.record.style.transform = `rotate(${state.angle}rad)`;

    // HUD
    els.rateVal.textContent = state.rate.toFixed(2) + "x";
    let dir = "—";
    if (state.rate > 0.05) dir = "FWD ▶";
    else if (state.rate < -0.05) dir = "◀ REV";
    els.dirVal.textContent = dir;

    // reflect on aria
    const deg = ((((state.angle * 180) / Math.PI) % 360) + 360) % 360;
    els.record.setAttribute("aria-valuenow", Math.round(deg));

    requestAnimationFrame(tick);
  }

  // =======================================================================
  // INIT
  // =======================================================================
  function init() {
    els = {
      record: document.getElementById("record"),
      platter: document.getElementById("platter"),
      playBtn: document.getElementById("playBtn"),
      volume: document.getElementById("volume"),
      pitch: document.getElementById("pitch"),
      track: document.getElementById("track"),
      rateVal: document.getElementById("rateVal"),
      dirVal: document.getElementById("dirVal"),
    };

    attachDragHandlers();
    attachControls();
    requestAnimationFrame(tick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Expose for embedding / debugging
  window.RicoCuts = { state, init };
})();
