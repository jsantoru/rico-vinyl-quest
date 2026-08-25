/* =========================================================
   RICO CUTS — Turntable Scratch Engine  (excited edition)
   ---------------------------------------------------------
   Drag the record back & forth to scratch. The audio playhead
   is slaved to your hand: forward drag = forward audio,
   backward drag = reversed audio. Release to let it ride.

   Added fun:
     - FX bus (Filter sweep / Echo / Drive) routed after the
       scratch engine so every move is colored live.
     - 6 synthesized loops incl. horn stabs, an 808 groove,
       and a vowel-phrase "vocal" loop.
     - A CUTS counter that counts direction changes (each
       change of scratch direction = one cut).
     - Tonearm + platter-glow visuals that react to speed.

   Everything is self-contained (no audio files needed):
   the loops are synthesized into a Float32Array at runtime.

   To drop this into your own game.js later, the important
   pieces are:
     - RicoCuts.init()          -> wire up DOM + audio
     - the ScratchEngine        -> per-sample playhead reader
     - pointer -> rate mapping  -> in attachDragHandlers()
     - buildFX()/applyFx()      -> the effects bus
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

    // FX
    fx: { filter: 1, echo: 0, drive: 0 }, // 0..1

    // scratch counter (direction changes)
    cuts: 0,
    lastRateSign: 0,

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
    const snare = (t) => (Math.random() * 2 - 1) * Math.exp(-t * 16) * 0.8;
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

  // Funky horn stabs over a pocket groove — great for quick choppy scratches.
  function makeStabLoop(sr) {
    const dur = 1.6;
    const n = Math.floor(sr * dur);
    const out = new Float32Array(n);
    const beat = dur / 4;

    const horn = (t, f) => {
      let s = 0;
      for (let h = 1; h <= 5; h++) s += Math.sin(2 * Math.PI * f * h * t) / h;
      return s * Math.exp(-t * 5.5) * (1 - Math.exp(-t * 220));
    };
    const kick = (t) => Math.sin(2 * Math.PI * (110 + 75 * Math.exp(-t * 22)) * t) * Math.exp(-t * 9);
    const hat = (t) => (Math.random() * 2 - 1) * Math.exp(-t * 70) * 0.35;

    const stabs = [
      { t0: 0.02, f: 261.6 }, // C4
      { t0: 0.72, f: 329.6 }, // E4
      { t0: 0.86, f: 349.2 }, // F4
      { t0: 1.28, f: 392.0 }, // G4
      { t0: 1.44, f: 329.6 }, // E4
    ];

    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const tb = t % beat;
      const b = Math.floor(t / beat) % 4;
      let s = 0;
      for (const st of stabs) {
        const dt = t - st.t0;
        if (dt >= 0 && dt < 0.8) s += horn(dt, st.f) * 0.5;
      }
      if (b === 0 || b === 2) s += kick(tb) * 0.6;
      s += hat(t % (beat / 2)) * 0.4;
      out[i] = s;
    }
    return normalize(out);
  }

  // Deep 808-style groove: sub kick + sliding sub bass + hats.
  function makeBassLoop(sr) {
    const dur = 2.4;
    const n = Math.floor(sr * dur);
    const out = new Float32Array(n);
    const beat = dur / 4;

    const sub = (t, f) => Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 2.2) * 0.9;
    const kick = (t) => Math.sin(2 * Math.PI * (90 + 55 * Math.exp(-t * 30)) * t) * Math.exp(-t * 8);
    const hat = (t) => (Math.random() * 2 - 1) * Math.exp(-t * 80) * 0.22;
    // D C A G sub notes (Hz)
    const notes = [73.4, 65.4, 55.0, 49.0];

    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const tb = t % beat;
      const b = Math.floor(t / beat) % 4;
      let s = 0;
      if (b === 0 || b === 2) s += kick(tb);
      s += sub(tb, notes[b]) * 0.5;
      s += hat(t % (beat / 2));
      out[i] = s;
    }
    return normalize(out);
  }

  // Synth "vocal" phrase — formant-shaped syllables ("hey…hey"), fun to scratch.
  function makeVoxLoop(sr) {
    const dur = 1.9;
    const n = Math.floor(sr * dur);
    const out = new Float32Array(n);
    const sylls = [
      { t0: 0.0, f0: 205, F: [420, 1300, 2400] },
      { t0: 0.42, f0: 235, F: [600, 1500, 2600] },
      { t0: 0.84, f0: 185, F: [520, 1500, 2600] },
      { t0: 1.28, f0: 220, F: [620, 1500, 2700] },
    ];

    const voice = (dt, f0, F) => {
      // glottal buzz: harmonic stack
      let buzz = 0;
      for (let h = 1; h <= 8; h++) buzz += Math.sin(2 * Math.PI * f0 * h * dt) / h;
      // formants
      let form = 0;
      for (let k = 0; k < F.length; k++) form += Math.sin(2 * Math.PI * F[k] * dt) / (k + 1);
      const env = Math.exp(-dt * 6.5) * (1 - Math.exp(-dt * 140));
      return (buzz * 0.5 + form * 0.4) * env;
    };

    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let s = 0;
      for (const sy of sylls) {
        const dt = t - sy.t0;
        if (dt >= 0 && dt < 0.6) s += voice(dt, sy.f0, sy.F);
      }
      s += (Math.random() * 2 - 1) * 0.04; // breathy body
      out[i] = s;
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
  // FX BUS
  //   scratch -> [filter -> drivePre -> shaper] -> master gain
  //   scratch -> echo send -> delay -> wet -> master
  //   master gain -> destination
  // =======================================================================
  function makeDistCurve(k) {
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x);
    }
    return curve;
  }

  function makeImpulse(seconds, decay) {
    const rate = state.audioCtx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = state.audioCtx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function buildFX() {
    const ctx = state.audioCtx;

    state.filter = ctx.createBiquadFilter();
    state.filter.type = "lowpass";

    state.drivePre = ctx.createGain();
    state.shaper = ctx.createWaveShaper();
    state.shaper.curve = makeDistCurve(6);

    state.echoSend = ctx.createGain();
    state.echo = ctx.createDelay(1.0);
    state.echo.delayTime.value = 0.31;
    state.echoFb = ctx.createGain();
    state.echoFb.gain.value = 0.45;
    state.echoWet = ctx.createGain();
    state.echoWet.gain.value = 1;

    // route scratch node through the fx chain into master
    state.scratchNode.connect(state.filter);
    state.filter.connect(state.drivePre);
    state.drivePre.connect(state.shaper);
    state.shaper.connect(state.gainNode);

    state.scratchNode.connect(state.echoSend);
    state.echoSend.connect(state.echo);
    state.echo.connect(state.echoWet);
    state.echoWet.connect(state.gainNode);
    state.echo.connect(state.echoFb);
    state.echoFb.connect(state.echo);

    applyFx();
  }

  function applyFx() {
    if (!state.filter) return;
    const f = state.fx;
    // filter: 0..1 -> 180..14000 Hz (1 = wide open)
    state.filter.frequency.value = 180 * Math.pow(78, f.filter);
    state.drivePre.gain.value = 1 + f.drive * 6;
    state.echoSend.gain.value = f.echo;
    state.gainNode.gain.value = state.volume;
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
    state.buffers.stab = makeStabLoop(ctx.sampleRate);
    state.buffers.bass = makeBassLoop(ctx.sampleRate);
    state.buffers.vox = makeVoxLoop(ctx.sampleRate);

    // Gain (master volume)
    const gain = ctx.createGain();
    gain.gain.value = state.volume;
    gain.connect(ctx.destination);
    state.gainNode = gain;

    // ScriptProcessor scratch engine (universally supported, single-file friendly)
    const bufSize = 1024;
    const node = ctx.createScriptProcessor(bufSize, 0, 1);
    node.onaudioprocess = onAudioProcess;
    state.scratchNode = node;

    buildFX();
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

  function setTonearm(on) {
    if (els.platter) els.platter.classList.toggle("tonearm-on", !!on);
  }

  function attachDragHandlers() {
    const rec = els.record;

    const onDown = (ev) => {
      ensureAudio();
      resumeCtx();
      state.scratching = true;
      rec.classList.add("scratching");
      setTonearm(true);
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

      // Count a "cut" each time the scratch direction flips (>= a small step).
      const sgn = r > 0.08 ? 1 : r < -0.08 ? -1 : 0;
      if (sgn !== 0 && state.lastRateSign !== 0 && sgn !== state.lastRateSign) {
        state.cuts++;
        if (els.cutsVal) els.cutsVal.textContent = state.cuts;
      }
      if (sgn !== 0) state.lastRateSign = sgn;

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
      setTonearm(state.playing);
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
      setTonearm(true);
    } else {
      if (!state.scratching) state.targetRate = 0;
      els.playBtn.classList.remove("playing");
      els.playBtn.setAttribute("aria-pressed", "false");
      els.playBtn.querySelector(".btn-text").textContent = "Play";
      els.playBtn.querySelector(".btn-icon").textContent = "▶";
      if (!state.scratching) setTonearm(false);
    }
  }

  // generic FX slider binding
  function fxBind(key, slider, valEl) {
    slider.addEventListener("input", (e) => {
      state.fx[key] = e.target.value / 100;
      applyFx();
      valEl.textContent = key === "filter" && state.fx[key] >= 0.98 ? "Open" : Math.round(state.fx[key] * 100) + "%";
    });
  }

  function attachControls() {
    els.playBtn.addEventListener("click", togglePlay);

    els.volume.addEventListener("input", (e) => {
      state.volume = e.target.value / 100;
      applyFx();
    });

    els.pitch.addEventListener("input", (e) => {
      state.basePitch = e.target.value / 100; // 0.5 .. 1.5
      if (state.playing && !state.scratching) state.targetRate = state.basePitch;
    });

    els.track.addEventListener("change", (e) => {
      state.currentBufferName = e.target.value;
      state.playhead = 0;
    });

    fxBind("filter", els.fxFilter, els.fxFilterVal);
    fxBind("echo", els.fxEcho, els.fxEchoVal);
    fxBind("drive", els.fxDrive, els.fxDriveVal);
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

    // Platter glow follows scratch velocity
    const glow = Math.min(1, Math.abs(state.rate));
    els.platter.style.setProperty("--glow", glow.toFixed(3));

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
      cutsVal: document.getElementById("cutsVal"),
      fxFilter: document.getElementById("fxFilter"),
      fxFilterVal: document.getElementById("fxFilterVal"),
      fxEcho: document.getElementById("fxEcho"),
      fxEchoVal: document.getElementById("fxEchoVal"),
      fxDrive: document.getElementById("fxDrive"),
      fxDriveVal: document.getElementById("fxDriveVal"),
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