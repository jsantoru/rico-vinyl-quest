/* =========================================================
   RICO CUTS — Turntable Scratch Engine  (worklet edition)
   ---------------------------------------------------------
   Drag the record back & forth to scratch. The audio playhead
   is slaved to your hand: forward drag = forward audio,
   backward drag = reversed audio. Release to let it ride.

   v2 changes
     - SCRATCH ENGINE moved off the main thread onto an
       AudioWorkletProcessor (ScriptProcessorNode is deprecated
       and adds ~5-15ms latency that hurts a scratch tool).
       The processor is inlined as a Blob URL so the project
       stays single-file / build-free.
     - AUTOMATIC FALLBACK: if AudioWorklet isn't available the
       engine transparently drops back to a ScriptProcessorNode
       running the same playhead logic on the main thread, so
       the app still works on older browsers.
     - PROPER SMOOTHING: rate eases toward the target with a
       real time constant (1 - exp(-dt/tau)) instead of a fixed
       per-sample step, so the feel is identical on any device
       sample rate (44.1k vs 48k).
     - LOAD YOUR OWN SAMPLE: drag & drop, or pick a file, to
       decode any audio into the scratch buffer. The six synth
       loops remain for quick fun.

   Everything is self-contained (no audio files required): the
   loops are synthesized into a Float32Array at runtime.

   Embedding: window.RicoCuts exposes { state, init }.
   state.buffers[name] is a mono Float32Array per scratch source.
   ========================================================= */

(function () {
  "use strict";

  // ---- Tunables ---------------------------------------------------------
  const SECONDS_PER_ROTATION = 1.8; // visual spin speed at rate 1.0
  const ANG_VEL_NORMAL = (2 * Math.PI) / SECONDS_PER_ROTATION; // rad/s at 1x
  const MAX_RATE = 8; // clamp scratch speed
  const SCRATCH_TAU_MS = 12; // time constant while dragging (snappy)
  const FREE_TAU_MS = 70; // time constant easing back to base on release

  const CRACKLE_LEVEL = 0.045; // vinyl surface-noise volume
  const NEEDLE_LEVEL = 0.5; // needle-drop "thunk" volume

  const USER_BUF = "user"; // buffer name reserved for a user-loaded sample

  // AudioWorklet processor source, inlined so the project stays one file.
  // The playhead + per-sample smoothing now live here, off the main thread.
  const WORKLET_SOURCE = `
'use strict';
class ScratchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(1);
    this.playhead = 0;
    this.rate = 0;
    this.targetRate = 0;
    this.smoothing = 0.02; // per-sample coefficient, sent from main thread
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.buffer) { this.buf = d.buffer; }
      if (d.targetRate !== undefined) { this.targetRate = d.targetRate; }
      if (d.smoothing !== undefined) { this.smoothing = d.smoothing; }
      if (d.playhead !== undefined) { this.playhead = d.playhead; }
      if (d.reset) { this.playhead = 0; }
    };
  }
  process(inputs, outputs) {
    const out = outputs[0];
    const len = this.buf.length;
    if (!len) return true;
    for (let ch = 0; ch < out.length; ch++) {
      const chan = out[ch];
      for (let i = 0; i < chan.length; i++) {
        // Per-sample easing toward the target with the requested smoothing.
        this.rate += (this.targetRate - this.rate) * this.smoothing;
        let ph = this.playhead + this.rate;
        if (ph >= len) ph -= len; else if (ph < 0) ph += len;
        this.playhead = ph;
        const i0 = Math.floor(ph) | 0;
        const i1 = i0 + 1 >= len ? 0 : i0 + 1;
        const frac = ph - i0;
        chan[i] = this.buf[i0] * (1 - frac) + this.buf[i1] * frac;
      }
    }
    return true;
  }
}
registerProcessor('scratch-processor', ScratchProcessor);
`;

  // ---- State ------------------------------------------------------------
  const state = {
    audioCtx: null,
    scratchNode: null, // AudioWorkletNode (or ScriptProcessor fallback)
    scratchSend: null, // fn(message) -> routes control/buffer to the engine
    engine: "none", // "worklet" | "script" | "none"
    gainNode: null,
    buffers: {}, // name -> Float32Array (mono)
    currentBufferName: "funk",
    sampleRate: 44100,

    playing: false,
    scratching: false,
    basePitch: 1.0,
    volume: 0.8,
    ambient: false, // vinyl crackle + needle drop

    fx: { filter: 1, echo: 0, drive: 0 }, // 0..1

    cuts: 0,
    lastRateSign: 0,

    // main-thread mirrors used for visuals/HUD; the real playhead + rate
    // live inside the worklet.
    playhead: 0,
    rate: 0,
    targetRate: 0,

    angle: 0, // radians (visual)
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
    const beat = dur / 4;

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
      const b = Math.floor(t / beat);
      const tb = t - b * beat;
      let s = 0;
      if (b === 0 || b === 2) s += kick(tb) * 0.9;
      if (b === 1 || b === 3) s += snare(tb) * 0.7;
      const th = t % (beat / 2);
      s += hat(th);
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
    const notes = [261.6, 329.6, 392.0, 329.6];
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

  // Funky horn stabs over a pocket groove.
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
      { t0: 0.02, f: 261.6 },
      { t0: 0.72, f: 329.6 },
      { t0: 0.86, f: 349.2 },
      { t0: 1.28, f: 392.0 },
      { t0: 1.44, f: 329.6 },
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

  // Deep 808-style groove.
  function makeBassLoop(sr) {
    const dur = 2.4;
    const n = Math.floor(sr * dur);
    const out = new Float32Array(n);
    const beat = dur / 4;

    const sub = (t, f) => Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 2.2) * 0.9;
    const kick = (t) => Math.sin(2 * Math.PI * (90 + 55 * Math.exp(-t * 30)) * t) * Math.exp(-t * 8);
    const hat = (t) => (Math.random() * 2 - 1) * Math.exp(-t * 80) * 0.22;
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

  // Synth "vocal" phrase — formant-shaped syllables.
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
      let buzz = 0;
      for (let h = 1; h <= 8; h++) buzz += Math.sin(2 * Math.PI * f0 * h * dt) / h;
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
      s += (Math.random() * 2 - 1) * 0.04;
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
  //   master gain -> limiter -> destination
  // =======================================================================
  function makeDistCurve(amount) {
    const n = 512;
    const curve = new Float32Array(n);
    const k = amount * 18;
    const norm = k > 0.0001 ? Math.tanh(k) : 1;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = k > 0.0001 ? Math.tanh(k * x) / norm : x;
    }
    return curve;
  }

  function buildFX() {
    const ctx = state.audioCtx;

    state.filter = ctx.createBiquadFilter();
    state.filter.type = "lowpass";

    state.drivePre = ctx.createGain();
    state.shaper = ctx.createWaveShaper();
    state.shaper.oversample = "4x";

    state.echoSend = ctx.createGain();
    state.echo = ctx.createDelay(1.0);
    state.echo.delayTime.value = 0.31;
    state.echoFb = ctx.createGain();
    state.echoFb.gain.value = 0.45;
    state.echoWet = ctx.createGain();
    state.echoWet.gain.value = 1;

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
    state.filter.frequency.value = 180 * Math.pow(78, f.filter);
    state.shaper.curve = makeDistCurve(f.drive);
    state.drivePre.gain.value = 1 + f.drive * 2;
    state.echoSend.gain.value = f.echo;
    state.gainNode.gain.value = state.volume;
  }

  // Proper sample-rate-independent smoothing coefficient for a time constant.
  function smoothingCoef(tauMs) {
    // coefficient per sample = 1 - exp(-dt/tau), dt = 1/sampleRate
    return 1 - Math.exp(-1000 / (tauMs * state.sampleRate));
  }

  // =======================================================================
  // VINYL AMBIENCE: crackle loop + needle-drop thunk
  // =======================================================================
  // Crackle = filtered noise with sparse pops, looped while the toggle is on.
  function makeCrackle(sr, seconds) {
    const n = Math.floor(sr * seconds);
    const out = new Float32Array(n);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      lp = lp * 0.96 + white * 0.04; // gentle low-pass -> softer hiss
      let s = white * 0.18 + lp * 0.55;
      if (Math.random() < 0.00045) s += (Math.random() * 2 - 1) * 0.6; // occasional pop
      out[i] = s;
    }
    return out;
  }

  // Needle drop: a low thump + a fast click, a short one-shot.
  function makeNeedle(sr) {
    const n = Math.floor(sr * 0.14);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const thump = Math.sin(2 * Math.PI * 72 * t) * Math.exp(-t * 30);
      const click = (Math.random() * 2 - 1) * Math.exp(-t * 300) * 0.4;
      out[i] = thump * 0.7 + click;
    }
    return out;
  }

  function applyAmbient() {
    if (state.crackleGain) state.crackleGain.gain.value = state.ambient ? CRACKLE_LEVEL : 0;
    if (els.ambientBtn) els.ambientBtn.setAttribute("aria-pressed", String(state.ambient));
  }

  function playNeedleDrop() {
    if (!state.audioCtx || !state.needleBuffer || !state.ambient) return;
    const src = state.audioCtx.createBufferSource();
    src.buffer = state.needleBuffer;
    const g = state.audioCtx.createGain();
    g.gain.value = NEEDLE_LEVEL;
    src.connect(g);
    g.connect(state.gainNode);
    src.start();
  }

  function toggleAmbient() {
    ensureAudio();
    resumeCtx();
    state.ambient = !state.ambient;
    applyAmbient();
    if (state.ambient) playNeedleDrop();
  }

  // =======================================================================
  // AUDIO GRAPH
  // =======================================================================
  function ensureAudio() {
    if (state.audioCtx) return Promise.resolve();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    state.audioCtx = ctx;
    state.sampleRate = ctx.sampleRate;

    // Build loops at the real sample rate; empty user slot until a file loads.
    state.buffers.funk = makeFunkLoop(ctx.sampleRate);
    state.buffers.boom = makeBoomLoop(ctx.sampleRate);
    state.buffers.tone = makeToneLoop(ctx.sampleRate);
    state.buffers.stab = makeStabLoop(ctx.sampleRate);
    state.buffers.bass = makeBassLoop(ctx.sampleRate);
    state.buffers.vox = makeVoxLoop(ctx.sampleRate);
    state.buffers[USER_BUF] = new Float32Array(1);

    // Master gain
    const gain = ctx.createGain();
    gain.gain.value = state.volume;
    state.gainNode = gain;

    // Limiter (same rationale as before: the dry signal and the echo tail
    // both land on gainNode; the shaper ceiling doesn't cover that sum).
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    state.limiter = limiter;

    gain.connect(limiter);
    limiter.connect(ctx.destination);

    // Vinyl ambience: looping crackle source (level 0 until toggled on) +
    // a needle-drop one-shot for replaying when the tonearm lands.
    state.crackleBuffer = makeCrackle(ctx.sampleRate, 2.0);
    const crackleSrc = ctx.createBufferSource();
    crackleSrc.buffer = state.crackleBuffer;
    crackleSrc.loop = true;
    state.crackleGain = ctx.createGain();
    crackleSrc.connect(state.crackleGain);
    state.crackleGain.connect(gain);
    crackleSrc.start();
    state.needleBuffer = makeNeedle(ctx.sampleRate);
    applyAmbient();

    // Build the scratch engine: prefer AudioWorklet (low latency, off the
    // main thread), fall back to ScriptProcessorNode when it's unavailable.
    return (async () => {
      await createScratchNode(ctx);
      if (!state.scratchNode) return; // neither engine could start
      buildFX();
      sendBuffer();
      sendControl();
    })();
  }

  // =======================================================================
  // ENGINE: AudioWorklet with ScriptProcessorNode fallback
  // =======================================================================
  // Both engines speak the same small control interface (scratchSend):
  //   { buffer: Float32Array, reset: bool }  -> load a new loop
  //   { targetRate, smoothing }              -> live control
  // The worklet receives these over its MessagePort; the fallback applies
  // them to a shared object read by the onAudioProcess callback.

  // Shared state for the ScriptProcessor fallback (runs on the main thread).
  const scratch = {
    buffer: new Float32Array(1),
    playhead: 0,
    rate: 0,
    targetRate: 0,
    smoothing: 0.02,
  };

  function onAudioProcess(e) {
    const output = e.outputBuffer.getChannelData(0);
    const len = scratch.buffer.length;
    if (!len) return;
    for (let i = 0; i < output.length; i++) {
      scratch.rate += (scratch.targetRate - scratch.rate) * scratch.smoothing;
      let ph = scratch.playhead + scratch.rate;
      if (ph >= len) ph -= len;
      else if (ph < 0) ph += len;
      scratch.playhead = ph;
      const i0 = Math.floor(ph) | 0;
      const i1 = i0 + 1 >= len ? 0 : i0 + 1;
      const frac = ph - i0;
      output[i] = scratch.buffer[i0] * (1 - frac) + scratch.buffer[i1] * frac;
    }
  }

  // Apply a control message to the running engine.
  function applyMessage(msg) {
    if (msg.buffer) scratch.buffer = msg.buffer;
    if (msg.targetRate !== undefined) scratch.targetRate = msg.targetRate;
    if (msg.smoothing !== undefined) scratch.smoothing = msg.smoothing;
    if (msg.playhead !== undefined) scratch.playhead = msg.playhead;
    if (msg.reset) scratch.playhead = 0;
  }

  async function createScratchNode(ctx) {
    // 1) Try AudioWorklet first.
    if (ctx.audioWorklet && ctx.audioWorklet.addModule) {
      try {
        const blob = new Blob([WORKLET_SOURCE], { type: "application/javascript" });
        const url = URL.createObjectURL(blob);
        await ctx.audioWorklet.addModule(url);
        const node = new AudioWorkletNode(ctx, "scratch-processor", {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        state.scratchNode = node;
        state.scratchSend = (msg) => node.port.postMessage(msg);
        state.engine = "worklet";
        updateEngineTag();
        console.log("Rico Cuts: using AudioWorklet engine");
        return;
      } catch (err) {
        console.warn("AudioWorklet unavailable; falling back to ScriptProcessor:", err);
      }
    }

    // 2) Fallback: ScriptProcessorNode.
    try {
      const node = ctx.createScriptProcessor(1024, 0, 1);
      node.onaudioprocess = onAudioProcess;
      state.scratchNode = node;
      state.scratchSend = applyMessage;
      state.engine = "script";
      updateEngineTag();
      console.log("Rico Cuts: using ScriptProcessor fallback engine");
    } catch (err) {
      console.error("Could not start any scratch engine:", err);
      state.engine = "none";
      updateEngineTag();
    }
  }

  // Show which engine is running in the HUD badge.
  function updateEngineTag() {
    const t = els.engineTag;
    if (!t) return;
    if (state.engine === "worklet") {
      t.textContent = "⚡ AudioWorklet";
      t.classList.remove("fallback");
      t.hidden = false;
    } else if (state.engine === "script") {
      t.textContent = "ScriptProcessor fallback";
      t.classList.add("fallback");
      t.hidden = false;
    } else {
      t.hidden = true;
    }
  }

  // ---- engine messaging ------------------------------------------------
  function sendBuffer() {
    if (!state.scratchSend) return;
    if (recorder) recEvent({ t: recClock(), buffer: state.currentBufferName });
    state.scratchSend({ buffer: state.buffers[state.currentBufferName], reset: true });
    state.playhead = 0; // engine resets playhead on swap; mirror it
    buildWaveform();
  }

  function sendControl() {
    if (!state.scratchSend) return;
    if (recorder) {
      recEvent({ t: recClock(), targetRate: state.targetRate, scratching: state.scratching });
    }
    state.scratchSend({
      targetRate: state.targetRate,
      smoothing: smoothingCoef(state.scratching ? SCRATCH_TAU_MS : FREE_TAU_MS),
    });
  }

  // =======================================================================
  // CLICKABLE WAVEFORM RING -> jump the playhead
  // =======================================================================
  // Tap (or click) the ring outside the record to seek the playhead to that
  // spot in the loop. The angle maps clockwise from the top, matching the
  // waveform drawing and the marker rotation. Works with both engines via the
  // `playhead` field on the control message.
  function seekPlayhead(pos) {
    ensureAudio().then(() => {
      resumeCtx();
      state.playhead = pos;
      if (state.scratchSend) state.scratchSend({ playhead: pos });
    });
  }

  function onWaveClick(ev) {
    const pl = els.platter;
    if (!pl) return;
    const rect = pl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const p = getPoint(ev);
    const dx = p.x - cx;
    const dy = p.y - cy;
    // Convert px -> viewBox units (platter spans radius 0..100).
    const scale = 200 / rect.width;
    const r = Math.sqrt(dx * dx + dy * dy) * scale;
    if (r < 84 || r > 100) return; // only the ring band outside the record
    const ang = Math.atan2(dy, dx);
    const frac =
      ((((ang + Math.PI / 2) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) /
      (2 * Math.PI);
    const buf = state.buffers[state.currentBufferName];
    if (!buf || !buf.length) return;
    seekPlayhead(Math.floor(frac * buf.length) % buf.length);
    if (ev.cancelable) ev.preventDefault();
  }

  // =======================================================================
  // RECORD YOUR SCRATCH -> download as WAV
  // =======================================================================
  // While recording we capture the timeline of control events (rate + buffer
  // changes at real timestamps) in recEvents. On stop, we deterministically
  // re-run the same playhead/smoothing/interpolation logic over that timeline
  // to build a dry mono track, push it through a real FX graph in an
  // OfflineAudioContext, and encode the result as a 16-bit WAV for download.
  const REC_TAIL_SEC = 1.0; // extra seconds so the echo tail isn't cut off
  let recorder = false;
  let recEvents = [];
  let recBuffer = "funk";
  let recStartCtx = 0;
  let recTicker = null;

  function recClock() {
    return state.audioCtx ? state.audioCtx.currentTime - recStartCtx : 0;
  }

  function recEvent(ev) {
    if (!recorder) return;
    const last = recEvents[recEvents.length - 1];
    if (last) {
      const sameT = Math.abs(ev.t - last.t) < 0.001;
      const sameBuf = ev.buffer === undefined || last.buffer === ev.buffer;
      const sameRate = ev.targetRate === undefined || last.targetRate === ev.targetRate;
      const sameScr = ev.scratching === undefined || last.scratching === ev.scratching;
      if (sameT && sameBuf && sameRate && sameScr) return; // dedupe
    }
    recEvents.push(ev);
  }

  function elRecUI(msg) {
    if (els.recStatus) els.recStatus.textContent = msg;
  }

  function renderRecUI() {
    if (els.recBtn) {
      els.recBtn.classList.toggle("recording", recorder);
      els.recBtn.setAttribute("aria-pressed", String(recorder));
      els.recBtn.querySelector(".btn-text").textContent = recorder ? "Stop" : "Record";
    }
    if (recorder) elRecUI(recClock().toFixed(1) + "s · recording");
  }

  function startRecording() {
    ensureAudio();
    resumeCtx();
    if (!state.playing) togglePlay();
    recStartCtx = state.audioCtx.currentTime;
    recBuffer = state.currentBufferName;
    recEvents = [{ t: 0, targetRate: state.targetRate, scratching: state.scratching }];
    recorder = true;
    recTicker = setInterval(renderRecUI, 200);
    renderRecUI();
  }

  async function stopRecording() {
    if (!recorder) return;
    recorder = false;
    clearInterval(recTicker);
    renderRecUI();
    elRecUI("Saving…");
    const dur = Math.max(state.audioCtx.currentTime - recStartCtx, 0.25);
    try {
      await renderScratchWav(dur);
      elRecUI("Saved " + dur.toFixed(1) + "s · .wav");
    } catch (err) {
      console.error(err);
      elRecUI("Render failed");
    }
  }

  // Re-run the recorded timeline as a dry mono track (no Web Audio needed
  // for this part; it mirrors the live engine exactly).
  function generateDry(durationSec) {
    const sr = state.sampleRate;
    const n = Math.floor(durationSec * sr);
    const dry = new Float32Array(n);
    let buffer = state.buffers[recBuffer] || state.buffers[state.currentBufferName];
    let playhead = 0;
    let rate = 0;
    let targetRate = 0;
    let scratching = false;
    let ei = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      while (ei < recEvents.length && recEvents[ei].t <= t) {
        const ev = recEvents[ei];
        if (ev.buffer && state.buffers[ev.buffer]) {
          buffer = state.buffers[ev.buffer];
          playhead = 0;
        }
        if (ev.targetRate !== undefined) targetRate = ev.targetRate;
        if (ev.scratching !== undefined) scratching = ev.scratching;
        ei++;
      }
      const blen = buffer.length;
      if (!blen) { dry[i] = 0; playhead = 0; continue; }
      const smoothing = smoothingCoef(scratching ? SCRATCH_TAU_MS : FREE_TAU_MS);
      rate += (targetRate - rate) * smoothing;
      let ph = playhead + rate;
      if (ph >= blen) ph -= blen;
      else if (ph < 0) ph += blen;
      playhead = ph;
      const i0 = Math.floor(ph) | 0;
      const i1 = i0 + 1 >= blen ? 0 : i0 + 1;
      const frac = ph - i0;
      dry[i] = buffer[i0] * (1 - frac) + buffer[i1] * frac;
    }
    return dry;
  }

  // Pass the dry track through a real FX graph inside an OfflineAudioContext.
  async function renderOfflineFX(dry) {
    const sr = state.sampleRate;
    const off = new OfflineAudioContext(2, dry.length, sr);

    const srcBuf = off.createBuffer(1, dry.length, sr);
    srcBuf.getChannelData(0).set(dry);
    const src = off.createBufferSource();
    src.buffer = srcBuf;

    const filter = off.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 180 * Math.pow(78, state.fx.filter);

    const drivePre = off.createGain();
    drivePre.gain.value = 1 + state.fx.drive * 2;
    const shaper = off.createWaveShaper();
    shaper.oversample = "4x";
    shaper.curve = makeDistCurve(state.fx.drive);

    const master = off.createGain();
    master.gain.value = state.volume;
    const limiter = off.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;

    const echoSend = off.createGain();
    echoSend.gain.value = state.fx.echo;
    const echo = off.createDelay(1.0);
    echo.delayTime.value = 0.31;
    const echoFb = off.createGain();
    echoFb.gain.value = 0.45;
    const echoWet = off.createGain();
    echoWet.gain.value = 1;

    src.connect(filter);
    filter.connect(drivePre);
    drivePre.connect(shaper);
    shaper.connect(master);
    src.connect(echoSend);
    echoSend.connect(echo);
    echo.connect(echoWet);
    echoWet.connect(master);
    echo.connect(echoFb);
    echoFb.connect(echo);
    master.connect(limiter);
    limiter.connect(off.destination);

    src.start(0);
    return off.startRendering();
  }

  function audioBufferToWav(buffer) {
    const numCh = buffer.numberOfChannels;
    const sr = buffer.sampleRate;
    const samples = buffer.length;
    const blockAlign = numCh * 2;
    const dataSize = samples * blockAlign;
    const ab = new ArrayBuffer(44 + dataSize);
    const v = new DataView(ab);

    function w(off, str) {
      for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i));
    }
    w(0, "RIFF");
    v.setUint32(4, 36 + dataSize, true);
    w(8, "WAVE");
    w(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); // PCM
    v.setUint16(22, numCh, true);
    v.setUint32(24, sr, true);
    v.setUint32(28, sr * blockAlign, true);
    v.setUint16(32, blockAlign, true);
    v.setUint16(34, 16, true); // 16-bit
    w(36, "data");
    v.setUint32(40, dataSize, true);

    const chans = [];
    for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
    let off = 44;
    for (let i = 0; i < samples; i++) {
      for (let c = 0; c < numCh; c++) {
        let s = Math.max(-1, Math.min(1, chans[c][i]));
        v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        off += 2;
      }
    }
    return new Blob([ab], { type: "audio/wav" });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function renderScratchWav(durationSec) {
    const total = durationSec + REC_TAIL_SEC;
    const dry = generateDry(total);
    const rendered = await renderOfflineFX(dry);
    const blob = audioBufferToWav(rendered);
    downloadBlob(blob, "rico-cut-" + Date.now() + ".wav");
  }

  // =======================================================================
  // LOAD YOUR OWN SAMPLE
  // =======================================================================
  async function loadUser(file) {
    if (!file) return;
    try {
      await ensureAudio();
      if (state.audioCtx.state === "suspended") await state.audioCtx.resume();
      const ab = await state.audioCtx.decodeAudioData(await file.arrayBuffer());

      // mix down to mono
      const mono = new Float32Array(ab.length);
      for (let i = 0; i < ab.length; i++) {
        let s = 0;
        for (let c = 0; c < ab.numberOfChannels; c++) s += ab.getChannelData(c)[i];
        mono[i] = s / ab.numberOfChannels;
      }
      normalize(mono);

      state.buffers[USER_BUF] = mono;
      state.currentBufferName = USER_BUF;
      state.playhead = 0;
      addSampleOption(file.name);
      sendBuffer();
      sendControl();

      if (els.sampleName) els.sampleName.textContent = file.name;
      if (els.sampleName) els.sampleName.classList.add("loaded");

      // Auto-start so the user hears their sample immediately.
      if (!state.playing) {
        state.playing = true;
        state.targetRate = state.basePitch;
        renderPlayUI();
      }
      setTonearm(true);
    } catch (err) {
      console.error(err);
      if (els.sampleName) els.sampleName.textContent = "Couldn't decode that file";
      setTimeout(() => {
        if (els.sampleName) els.sampleName.textContent = "Load a .wav / .mp3 / .ogg";
      }, 2500);
    }
  }

  function addSampleOption(label) {
    let opt = els.track.querySelector('option[value="' + USER_BUF + '"]');
    if (!opt) {
      opt = document.createElement("option");
      opt.value = USER_BUF;
      els.track.appendChild(opt);
    }
    opt.textContent = label || "My Sample";
    els.track.value = USER_BUF;
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
      sendControl();
      if (ev.cancelable) ev.preventDefault();
    };

    const onMove = (ev) => {
      if (!state.scratching) return;
      const p = getPoint(ev);
      const now = performance.now();
      const ang = pointerAngle(p.x, p.y);

      let dA = ang - state.lastPointerAngle;
      if (dA > Math.PI) dA -= 2 * Math.PI;
      else if (dA < -Math.PI) dA += 2 * Math.PI;

      const dt = Math.max((now - state.lastMoveTime) / 1000, 1 / 240);
      const angVel = dA / dt;

      let r = angVel / ANG_VEL_NORMAL;
      r = Math.max(-MAX_RATE, Math.min(MAX_RATE, r));
      state.targetRate = r;
      sendControl();

      // Count a "cut" each time the scratch direction flips.
      const sgn = r > 0.08 ? 1 : r < -0.08 ? -1 : 0;
      if (sgn !== 0 && state.lastRateSign !== 0 && sgn !== state.lastRateSign) {
        state.cuts++;
        if (els.cutsVal) els.cutsVal.textContent = state.cuts;
      }
      if (sgn !== 0) state.lastRateSign = sgn;

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
      state.targetRate = state.playing ? state.basePitch : 0;
      sendControl();
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
        sendControl();
        state.angle += dir * 0.25;
        setTimeout(() => {
          state.targetRate = state.playing ? state.basePitch : 0;
          sendControl();
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
    if (state.audioCtx && state.audioCtx.state === "suspended") state.audioCtx.resume();
  }

  function renderPlayUI() {
    els.playBtn.classList.toggle("playing", state.playing);
    els.playBtn.setAttribute("aria-pressed", String(state.playing));
    els.playBtn.querySelector(".btn-text").textContent = state.playing ? "Stop" : "Play";
    els.playBtn.querySelector(".btn-icon").textContent = state.playing ? "■" : "▶";
    setTonearm(state.playing && !state.scratching);
  }

  function togglePlay() {
    ensureAudio();
    resumeCtx();
    state.playing = !state.playing;
    if (state.playing) {
      if (!state.scratching) state.targetRate = state.basePitch;
      playNeedleDrop();
    } else {
      if (!state.scratching) state.targetRate = 0;
    }
    sendControl();
    renderPlayUI();
  }

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
      state.basePitch = e.target.value / 100;
      if (state.playing && !state.scratching) {
        state.targetRate = state.basePitch;
        sendControl();
      }
    });

    els.track.addEventListener("change", (e) => {
      state.currentBufferName = e.target.value;
      state.playhead = 0;
      sendBuffer();
    });

    fxBind("filter", els.fxFilter, els.fxFilterVal);
    fxBind("echo", els.fxEcho, els.fxEchoVal);
    fxBind("drive", els.fxDrive, els.fxDriveVal);

    // File picker for user sample
    if (els.loadFile) {
      els.loadFile.addEventListener("change", (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) loadUser(f);
        e.target.value = "";
      });
    }

    // Record / download your scratch as a WAV
    if (els.recBtn) {
      els.recBtn.addEventListener("click", () => {
        if (recorder) stopRecording();
        else startRecording();
      });
    }

    // Tap the waveform ring to jump the playhead there.
    if (els.platter) {
      els.platter.addEventListener("pointerdown", onWaveClick);
    }

    // Vinyl ambience (crackle + needle drop)
    if (els.ambientBtn) {
      els.ambientBtn.addEventListener("click", toggleAmbient);
    }

    // Drag & drop anywhere
    window.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (els.dropzone) els.dropzone.classList.add("show");
    });
    window.addEventListener("dragleave", (e) => {
      if (e.target === document.documentElement) hideDropzone();
    });
    window.addEventListener("drop", (e) => {
      e.preventDefault();
      hideDropzone();
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadUser(f);
    });
  }

  function hideDropzone() {
    if (els.dropzone) els.dropzone.classList.remove("show");
  }

  // =======================================================================
  // VISUAL LOOP
  // =======================================================================
  // Draw the loop's transients as a ring of peaks around the record. Peak
  // (absolute) amplitude per segment maps to radial extent: quiet = inner,
  // loud = outer, so kicks and horn stabs pop as visible bumps.
  function buildWaveform() {
    const path = els.wavePath;
    if (!path) return;
    const buf = state.buffers[state.currentBufferName];
    if (!buf || !buf.length) {
      path.setAttribute("d", "");
      return;
    }
    const N = 360;
    const seg = Math.max(1, Math.floor(buf.length / N));
    const R0 = 86; // inner radius (just outside the record)
    const R1 = 98; // outer radius (near platter edge)
    let d = "";
    for (let i = 0; i < N; i++) {
      let peak = 0;
      const start = i * seg;
      const end = Math.min(start + seg, buf.length);
      for (let k = start; k < end; k++) {
        const a = Math.abs(buf[k]);
        if (a > peak) peak = a;
      }
      const ang = (i / N) * 2 * Math.PI - Math.PI / 2;
      const r = R0 + peak * (R1 - R0);
      const x = r * Math.cos(ang);
      const y = r * Math.sin(ang);
      d += (i === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
    }
    d += "Z";
    path.setAttribute("d", d);
  }

  function tick(now) {
    if (!state._lastTick) state._lastTick = now;
    const dt = (now - state._lastTick) / 1000;
    state._lastTick = now;

    // Mirror the audio smoothing on the main thread so the HUD rate, glow,
    // and platter spin track the real (worklet) rate closely.
    const tau = state.scratching ? SCRATCH_TAU_MS : FREE_TAU_MS;
    const coef = 1 - Math.exp(-dt / (tau / 1000));
    state.rate += (state.targetRate - state.rate) * coef;

    // Mirror the playhead too so the waveform marker tracks the audio.
    const wlen = state.buffers[state.currentBufferName]
      ? state.buffers[state.currentBufferName].length
      : 0;
    if (wlen) {
      state.playhead += state.rate;
      if (state.playhead >= wlen) state.playhead -= wlen;
      else if (state.playhead < 0) state.playhead += wlen;
    }

    // When not physically scratching, spin the visual from playback rate.
    if (!state.scratching) {
      state.angle += state.rate * ANG_VEL_NORMAL * dt;
    }

    els.record.style.transform = "rotate(" + state.angle + "rad)";

    // Waveform playhead marker
    if (els.waveMarker && wlen) {
      const f = ((state.playhead % wlen) + wlen) % wlen;
      els.waveMarker.setAttribute("transform", "rotate(" + ((f / wlen) * 360).toFixed(2) + ")");
    }

    // HUD
    els.rateVal.textContent = state.rate.toFixed(2) + "x";
    let dir = "—";
    if (state.rate > 0.05) dir = "FWD ▶";
    else if (state.rate < -0.05) dir = "◀ REV";
    els.dirVal.textContent = dir;

    const glow = Math.min(1, Math.abs(state.rate));
    els.platter.style.setProperty("--glow", glow.toFixed(3));

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
      loadFile: document.getElementById("loadFile"),
      sampleName: document.getElementById("sampleName"),
      dropzone: document.getElementById("dropzone"),
      recBtn: document.getElementById("recBtn"),
      recStatus: document.getElementById("recStatus"),
      ambientBtn: document.getElementById("ambientBtn"),
      wavePath: document.getElementById("wavePath"),
      waveMarker: document.getElementById("waveMarker"),
      rateVal: document.getElementById("rateVal"),
      dirVal: document.getElementById("dirVal"),
      cutsVal: document.getElementById("cutsVal"),
      engineTag: document.getElementById("engineTag"),
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
  window.RicoCuts = { state, init, startRecording, stopRecording, seekPlayhead, toggleAmbient };
})();