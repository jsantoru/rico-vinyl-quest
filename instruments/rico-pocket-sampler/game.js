/* ============================================================
 * Rico's Pocket Sampler  (excited edition)
 * A simplified Koala-style sampler: 8 pads, waveform chopping,
 * a 16-step drum sequencer, PLUS a live effects bus
 * (drive / filter / delay / reverb), per-pad pitch + reverse,
 * keyboard triggering, choke groups, and a level meter.
 *
 * Drop-in notes for game.js integration:
 *  - All state lives in the `S` object.
 *  - Audio is a single AudioContext (`S.ctx`).
 *  - Each pad holds an AudioBuffer in `S.pads[i].buffer`.
 *  - triggerPad(i) plays a pad; you can call it from anywhere.
 *  - The external API is exposed on window.RicoSampler.
 * ============================================================ */

(function () {
  "use strict";

  var PAD_COUNT = 8;
  var STEPS = 16;

  // ---- Global state ----
  var S = {
    ctx: null,
    pads: [], // { buffer, name, start, end, pitch, reverse, choke }
    selected: 0,
    // recording
    recording: false,
    mediaStream: null,
    recorder: null,
    recChunks: [],
    // editor
    editStart: 0, // 0..1
    editEnd: 1, // 0..1
    playingSource: null,
    // sequencer
    seq: [], // seq[pad][step] = bool
    playing: false,
    bpm: 96,
    stepIndex: 0,
    nextNoteTime: 0,
    timer: null,
    // ---- FX state ----
    fx: {
      drive: 0, // 0..1  -> input gain to waveshaper
      tone: 1, // 0..1  -> lowpass cutoff (1 = wide open)
      delay: 0, // 0..1  -> delay send mix
      space: 0, // 0..1  -> reverb send mix
      volume: 0.9, // 0..1  -> master gain
    },
    // ---- active sources for choke ----
    running: {}, // running[pad] = [ {src} ]
    // ---- pattern bank ----
    slots: [], // up to SLOTS saved seq grids
    activeSlot: 0,
    // keyboard mapping (finger-drum friendly)
  };

  var SLOTS = 4;
  var PAT_KEY = "ricoSamplerPatterns";

  // ---- DOM refs ----
  var el = {};

  // ------------------------------------------------------------
  // Audio context (created lazily on first user gesture)
  // ------------------------------------------------------------
  function audio() {
    if (!S.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      S.ctx = new AC();
      buildFX();
    }
    if (S.ctx.state === "suspended") S.ctx.resume();
    return S.ctx;
  }

  // ------------------------------------------------------------
  // Effects bus (built once with the context)
  //   pads -> bus -> [drive pre -> shaper -> filter] -> master
  //   bus -> delay send -> delay -> wet -> master
  //   bus -> verb send -> convolver -> wet -> master
  //   master -> analyser -> destination
  // ------------------------------------------------------------
  function buildFX() {
    var ctx = S.ctx;

    S.bus = ctx.createGain(); // all pads drop here

    // Drive: pre-gain feeds a tanh waveshaper. Curve itself is set from the
    // live Drive slider in applyFx() below, not fixed here -- see makeDistCurve().
    S.drivePre = ctx.createGain();
    S.shaper = ctx.createWaveShaper();
    S.shaper.oversample = "4x"; // reduces the harsh aliasing waveshaping otherwise adds

    // Filter: lowpass
    S.filter = ctx.createBiquadFilter();
    S.filter.type = "lowpass";

    // Delay (parallel send + internal feedback loop)
    S.delaySend = ctx.createGain();
    S.delay = ctx.createDelay(1.0);
    S.delay.delayTime.value = 0.27;
    S.delayFb = ctx.createGain();
    S.delayFb.gain.value = 0.42;
    S.delayWet = ctx.createGain();
    S.delayWet.gain.value = 1;

    // Reverb (parallel send, generated impulse response)
    S.verbSend = ctx.createGain();
    S.verb = ctx.createConvolver();
    S.verb.buffer = makeImpulse(2.4, 2.6);
    S.verbWet = ctx.createGain();
    S.verbWet.gain.value = 1;

    // Master + analyser for the meter
    S.master = ctx.createGain();
    S.analyser = ctx.createAnalyser();
    S.analyser.fftSize = 512;

    // Limiter: pads can (and by default do, e.g. kick+snare+hat landing on
    // the same step) sum well past 0dBFS before any drive/volume is even
    // touched -- up to 8 synthesized voices stack straight into S.bus with
    // no per-voice headroom. Without a ceiling that summing clips hard at
    // the destination, which is the "blown out / distorted" sound. This
    // mirrors the limiter already used in Rico's EQ for the same reason.
    S.limiter = ctx.createDynamicsCompressor();
    S.limiter.threshold.value = -1;
    S.limiter.knee.value = 0;
    S.limiter.ratio.value = 20;
    S.limiter.attack.value = 0.001;
    S.limiter.release.value = 0.1;

    // ----- wiring -----
    S.bus.connect(S.drivePre);
    S.drivePre.connect(S.shaper);
    S.shaper.connect(S.filter);
    S.filter.connect(S.master);

    S.bus.connect(S.delaySend);
    S.delaySend.connect(S.delay);
    S.delay.connect(S.delayWet);
    S.delayWet.connect(S.master);
    S.delay.connect(S.delayFb);
    S.delayFb.connect(S.delay);

    S.bus.connect(S.verbSend);
    S.verbSend.connect(S.verb);
    S.verb.connect(S.verbWet);
    S.verbWet.connect(S.master);

    // master -> limiter -> analyser -> destination, so the level meter
    // reflects what's actually reaching the speakers (post-limiting).
    S.master.connect(S.limiter);
    S.limiter.connect(S.analyser);
    S.analyser.connect(ctx.destination);

    applyFx();
  }

  // `amount` is 0..1 (straight from the Drive slider). At 0 the curve is the
  // identity line (no coloration at all); as amount rises it eases into tanh
  // saturation, normalized so a full-scale input (x = ±1) always maps to
  // output ±1 instead of being under-driven.
  function makeDistCurve(amount) {
    var n = 512;
    var curve = new Float32Array(n);
    var k = amount * 18;
    var norm = k > 0.0001 ? Math.tanh(k) : 1;
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1;
      curve[i] = k > 0.0001 ? Math.tanh(k * x) / norm : x;
    }
    return curve;
  }

  function makeImpulse(seconds, decay) {
    var rate = S.ctx.sampleRate;
    var len = Math.floor(rate * seconds);
    var buf = S.ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function applyFx() {
    if (!S.master) return;
    var f = S.fx;
    S.shaper.curve = makeDistCurve(f.drive);
    S.drivePre.gain.value = 1 + f.drive * 2; // shaper input level
    var cutoff = 150 * Math.pow(120, f.tone); // tone 0..1 -> 150..18000Hz
    S.filter.frequency.value = cutoff;
    S.delaySend.gain.value = f.delay;
    S.verbSend.gain.value = f.space;
    S.master.gain.value = f.volume;
  }

  // ------------------------------------------------------------
  // Built-in synthesized kit so the app is usable with no input
  // ------------------------------------------------------------
  function renderTone(fn, seconds) {
    var ctx = audio();
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) {
      data[i] = fn(i / ctx.sampleRate, i / len);
    }
    return buf;
  }

  function makeKit() {
    var kit = [];
    // Kick
    kit.push({
      name: "Kick",
      buffer: renderTone(function (t, p) {
        var f = 120 * Math.pow(0.5, t * 18);
        return Math.sin(2 * Math.PI * f * t) * Math.pow(1 - p, 2.2);
      }, 0.35),
    });
    // Snare
    kit.push({
      name: "Snare",
      buffer: renderTone(function (t, p) {
        var noise = (Math.random() * 2 - 1) * Math.pow(1 - p, 3);
        var body = Math.sin(2 * Math.PI * 190 * t) * Math.pow(1 - p, 6);
        return noise * 0.7 + body * 0.5;
      }, 0.25),
    });
    // Closed hat
    kit.push({
      name: "Hat",
      buffer: renderTone(function (t, p) {
        return (Math.random() * 2 - 1) * Math.pow(1 - p, 12) * 0.6;
      }, 0.12),
    });
    // Open hat (chokes the closed hat)
    kit.push({
      name: "OpenHat",
      choke: [2],
      buffer: renderTone(function (t, p) {
        return (Math.random() * 2 - 1) * Math.pow(1 - p, 3.5) * 0.5;
      }, 0.3),
    });
    // Clap
    kit.push({
      name: "Clap",
      buffer: renderTone(function (t, p) {
        var burst = Math.sin(t * 900) > 0 ? 1 : 0.3;
        return (Math.random() * 2 - 1) * Math.pow(1 - p, 4) * burst * 0.7;
      }, 0.2),
    });
    // Tom
    kit.push({
      name: "Tom",
      buffer: renderTone(function (t, p) {
        var f = 180 * Math.pow(0.5, t * 6);
        return Math.sin(2 * Math.PI * f * t) * Math.pow(1 - p, 2.5);
      }, 0.3),
    });
    // Rim / blip
    kit.push({
      name: "Rim",
      buffer: renderTone(function (t, p) {
        return Math.sin(2 * Math.PI * 420 * t) * Math.pow(1 - p, 20) * 0.8;
      }, 0.1),
    });
    // Bass stab
    kit.push({
      name: "Bass",
      buffer: renderTone(function (t, p) {
        var f = 65;
        var saw = 2 * (t * f - Math.floor(0.5 + t * f));
        return saw * Math.pow(1 - p, 1.5) * 0.5;
      }, 0.4),
    });
    return kit;
  }

  // ------------------------------------------------------------
  // Pad helpers
  // ------------------------------------------------------------
  function setPad(i, buffer, name, opts) {
    opts = opts || {};
    S.pads[i] = {
      buffer: buffer || null,
      name: name || "\u2014",
      start: 0,
      end: 1,
      pitch: opts.pitch != null ? opts.pitch : 0,
      reverse: !!opts.reverse,
      choke: opts.choke || null,
      muted: false,
      solo: false,
    };
    refreshPadUI(i);
  }

  // Core play routine — used by both live triggers and the sequencer.
  function playPad(i, t, flash) {
    var pad = S.pads[i];
    if (!pad || !pad.buffer) return;
    // mute / solo gating
    if (pad.muted) return;
    var anySolo = false;
    for (var si = 0; si < PAD_COUNT; si++) {
      if (S.pads[si] && S.pads[si].solo) {
        anySolo = true;
        break;
      }
    }
    if (anySolo && !pad.solo) return;
    var ctx = audio();
    // choke: stop whatever is ringing in the choke group
    if (pad.choke) {
      for (var k = 0; k < pad.choke.length; k++) stopPad(pad.choke[k], t);
    }
    var src = ctx.createBufferSource();
    src.buffer = pad.buffer;
    var dur = pad.buffer.duration;
    var trimStart = pad.start * dur;
    var len = Math.max(0.01, (pad.end - pad.start) * dur);
    var rate = Math.pow(2, pad.pitch / 12);
    src.playbackRate.value = pad.reverse ? -rate : rate;
    var pos = pad.reverse ? pad.end * dur : trimStart;
    src.connect(S.bus);
    src.start(t, pos, len);

    // remember for chokes; auto-remove when the source finishes
    S.running[i] = S.running[i] || [];
    var rec = { src: src };
    S.running[i].push(rec);
    src.onended = function () {
      var arr = S.running[i];
      if (arr) {
        var k = arr.indexOf(rec);
        if (k > -1) arr.splice(k, 1);
      }
    };

    if (flash) flashPad(i);
  }

  function stopPad(i, t) {
    var arr = S.running[i];
    if (!arr) return;
    if (t < S.ctx.currentTime) t = S.ctx.currentTime;
    for (var k = 0; k < arr.length; k++) {
      try {
        arr[k].src.stop(t);
      } catch (e) {
        /* already stopped */
      }
    }
    S.running[i] = [];
  }

  function triggerPad(i) {
    if (!S.pads[i] || !S.pads[i].buffer) return;
    audio();
    playPad(i, S.ctx.currentTime, true);
  }

  function selectPad(i) {
    S.selected = i;
    var pad = S.pads[i];
    S.editStart = pad ? pad.start : 0;
    S.editEnd = pad ? pad.end : 1;
    document.querySelectorAll(".pad").forEach(function (p, idx) {
      p.classList.toggle("selected", idx === i);
    });
    el.editTarget.textContent = "PAD " + (i + 1);
    refreshPitchUI();
    drawWave();
    layoutHandles();
    updateEditReadout();
  }

  function refreshPitchUI() {
    var pad = S.pads[S.selected];
    var p = pad ? pad.pitch : 0;
    el.pitch.value = p;
    el.pitchVal.textContent = p > 0 ? "+" + p + " st" : p + " st";
    el.reverseBtn.classList.toggle("active", !!(pad && pad.reverse));
  }

  // ------------------------------------------------------------
  // Pad UI
  // ------------------------------------------------------------
  function buildPads() {
    el.pads.innerHTML = "";
    for (var i = 0; i < PAD_COUNT; i++) {
      var pad = document.createElement("div");
      pad.className = "pad empty";
      pad.tabIndex = 0;
      pad.setAttribute("role", "button");
      pad.dataset.i = String(i);
      pad.innerHTML =
        '<span class="pad-num">PAD ' +
        (i + 1) +
        "</span>" +
        '<span class="pad-chips">' +
        '<button type="button" class="pad-chip" data-act="mute" title="Mute this pad">M</button>' +
        '<button type="button" class="pad-chip" data-act="solo" title="Solo this pad">S</button>' +
        "</span>" +
        '<span class="pad-name">\u2014</span>';
      bindPad(pad, i);
      bindPadChips(pad, i);
      el.pads.appendChild(pad);
    }
  }

  function bindPadChips(node, i) {
    node
      .querySelector('[data-act="mute"]')
      .addEventListener("pointerdown", function (e) {
        e.stopPropagation();
        e.preventDefault();
        toggleMute(i);
      });
    node
      .querySelector('[data-act="solo"]')
      .addEventListener("pointerdown", function (e) {
        e.stopPropagation();
        e.preventDefault();
        toggleSolo(i);
      });
  }

  function toggleMute(i) {
    var pad = S.pads[i];
    if (!pad) return;
    pad.muted = !pad.muted;
    refreshPadUI(i);
  }

  function toggleSolo(i) {
    var pad = S.pads[i];
    if (!pad) return;
    pad.solo = !pad.solo;
    if (pad.solo) {
      // exclusive solo: clear every other pad
      for (var p = 0; p < PAD_COUNT; p++) {
        if (p !== i && S.pads[p]) S.pads[p].solo = false;
      }
    }
    for (var q = 0; q < PAD_COUNT; q++) refreshPadUI(q);
  }

  function bindPad(node, i) {
    var onDown = function (e) {
      e.preventDefault();
      triggerPad(i);
      selectPad(i);
    };
    node.addEventListener("pointerdown", onDown);
  }

  function refreshPadUI(i) {
    var node = el.pads.querySelector('.pad[data-i="' + i + '"]');
    if (!node) return;
    var pad = S.pads[i];
    var has = pad && pad.buffer;
    node.classList.toggle("empty", !has);
    node.classList.toggle("muted", has && pad.muted);
    node.classList.toggle("solo", has && pad.solo);
    node.querySelector(".pad-name").textContent = has ? pad.name : "\u2014";
    var m = node.querySelector('[data-act="mute"]');
    var s = node.querySelector('[data-act="solo"]');
    if (m) m.classList.toggle("active", has && pad.muted);
    if (s) s.classList.toggle("active", has && pad.solo);
  }

  function flashPad(i) {
    var node = el.pads.querySelector('.pad[data-i="' + i + '"]');
    if (!node) return;
    node.classList.add("flash");
    setTimeout(function () {
      node.classList.remove("flash");
    }, 110);
  }

  // ------------------------------------------------------------
  // Computer-keyboard triggers:  A S D F ... J K L
  // ------------------------------------------------------------
  function bindKeyboard() {
    var map = { a: 0, s: 1, d: 2, f: 3, g: 4, h: 5, j: 6, k: 7 };
    window.addEventListener("keydown", function (e) {
      if (e.repeat) return;
      var t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var idx = map[String(e.key).toLowerCase()];
      if (idx === undefined) return;
      e.preventDefault();
      triggerPad(idx);
      selectPad(idx);
    });
  }

  // ------------------------------------------------------------
  // Recording (mic)
  // ------------------------------------------------------------
  function toggleRecord() {
    if (S.recording) return stopRecord();
    startRecord();
  }

  function startRecord() {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      alert("Recording is not supported in this browser. Try 'Load Audio' instead.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(function (stream) {
        audio();
        S.mediaStream = stream;
        S.recChunks = [];
        S.recorder = new MediaRecorder(stream);
        S.recorder.ondataavailable = function (e) {
          if (e.data.size > 0) S.recChunks.push(e.data);
        };
        S.recorder.onstop = onRecStop;
        S.recorder.start();
        S.recording = true;
        el.recBtn.classList.add("active");
        el.recBtn.lastChild.textContent = " Stop";
      })
      .catch(function () {
        alert("Microphone permission denied.");
      });
  }

  function stopRecord() {
    if (S.recorder && S.recording) S.recorder.stop();
  }

  function onRecStop() {
    S.recording = false;
    el.recBtn.classList.remove("active");
    el.recBtn.lastChild.textContent = " Record";
    if (S.mediaStream) {
      S.mediaStream.getTracks().forEach(function (t) {
        t.stop();
      });
      S.mediaStream = null;
    }
    var blob = new Blob(S.recChunks, { type: "audio/webm" });
    blob.arrayBuffer().then(decodeToSelected);
  }

  // ------------------------------------------------------------
  // File load
  // ------------------------------------------------------------
  function onFile(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    file.arrayBuffer().then(decodeToSelected);
    e.target.value = "";
  }

  function decodeToSelected(arrayBuf) {
    var ctx = audio();
    ctx.decodeAudioData(arrayBuf.slice(0)).then(function (buffer) {
      setPad(S.selected, buffer, "Sample");
      S.pads[S.selected].start = 0;
      S.pads[S.selected].end = 1;
      refreshPitchUI();
      drawWave();
      layoutHandles();
      updateEditReadout();
    }).catch(function () {
      alert("Could not decode that audio file.");
    });
  }

  // ------------------------------------------------------------
  // Waveform drawing
  // ------------------------------------------------------------
  function drawWave() {
    var canvas = el.wave;
    var ctx2d = canvas.getContext("2d");
    var W = canvas.width;
    var H = canvas.height;
    ctx2d.clearRect(0, 0, W, H);

    var pad = S.pads[S.selected];
    // baseline
    ctx2d.strokeStyle = "rgba(255,255,255,0.08)";
    ctx2d.beginPath();
    ctx2d.moveTo(0, H / 2);
    ctx2d.lineTo(W, H / 2);
    ctx2d.stroke();

    if (!pad || !pad.buffer) {
      ctx2d.fillStyle = "#8b8b96";
      ctx2d.font = "600 16px system-ui, sans-serif";
      ctx2d.textAlign = "center";
      ctx2d.fillText("No sample \u2014 Record or Load Audio", W / 2, H / 2 - 8);
      return;
    }

    var data = pad.buffer.getChannelData(0);
    var step = Math.max(1, Math.floor(data.length / W));
    var mid = H / 2;

    // dim area outside the selection
    var sx = S.editStart * W;
    var ex = S.editEnd * W;
    ctx2d.fillStyle = "rgba(0,0,0,0.45)";
    ctx2d.fillRect(0, 0, sx, H);
    ctx2d.fillRect(ex, 0, W - ex, H);
    // selection tint
    ctx2d.fillStyle = "rgba(232,178,58,0.08)";
    ctx2d.fillRect(sx, 0, ex - sx, H);

    // waveform
    ctx2d.strokeStyle = "#e8b23a";
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    for (var x = 0; x < W; x++) {
      var min = 1.0;
      var max = -1.0;
      for (var j = 0; j < step; j++) {
        var idx = x * step + j;
        if (idx >= data.length) break;
        var v = data[idx];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ctx2d.moveTo(x, mid + min * mid * 0.95);
      ctx2d.lineTo(x, mid + max * mid * 0.95);
    }
    ctx2d.stroke();
  }

  // ------------------------------------------------------------
  // Trim handles (drag)
  // ------------------------------------------------------------
  function layoutHandles() {
    var w = el.waveWrap.clientWidth;
    el.handleStart.style.left = S.editStart * w - 7 + "px";
    el.handleStart.style.right = "auto";
    el.handleEnd.style.left = S.editEnd * w - 7 + "px";
    el.handleEnd.style.right = "auto";
  }

  function bindHandle(handle, which) {
    var dragging = false;
    var rect = null;

    function move(clientX) {
      var x = clientX - rect.left;
      var frac = Math.min(1, Math.max(0, x / rect.width));
      if (which === "start") {
        S.editStart = Math.min(frac, S.editEnd - 0.01);
      } else {
        S.editEnd = Math.max(frac, S.editStart + 0.01);
      }
      var pad = S.pads[S.selected];
      if (pad) {
        pad.start = S.editStart;
        pad.end = S.editEnd;
      }
      drawWave();
      layoutHandles();
      updateEditReadout();
    }

    handle.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      dragging = true;
      rect = el.waveWrap.getBoundingClientRect();
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", function (e) {
      if (dragging) move(e.clientX);
    });
    handle.addEventListener("pointerup", function () {
      dragging = false;
    });
    handle.addEventListener("pointercancel", function () {
      dragging = false;
    });
  }

  function updateEditReadout() {
    var pad = S.pads[S.selected];
    var dur = pad && pad.buffer ? pad.buffer.duration : 0;
    el.startVal.textContent = (S.editStart * dur).toFixed(2) + "s";
    el.endVal.textContent = (S.editEnd * dur).toFixed(2) + "s";
    el.lenVal.textContent = ((S.editEnd - S.editStart) * dur).toFixed(2) + "s";
  }

  // ------------------------------------------------------------
  // Play current selection in editor (with moving playhead)
  // ------------------------------------------------------------
  function playSelection() {
    var pad = S.pads[S.selected];
    if (!pad || !pad.buffer) return;
    var ctx = audio();
    var src = ctx.createBufferSource();
    src.buffer = pad.buffer;
    src.connect(S.bus);
    var dur = pad.buffer.duration;
    var offset = S.editStart * dur;
    var len = Math.max(0.01, (S.editEnd - S.editStart) * dur);
    src.start(0, offset, len);

    // animate playhead
    var w = el.waveWrap.clientWidth;
    var t0 = ctx.currentTime;
    el.playhead.hidden = false;
    function tick() {
      var elapsed = ctx.currentTime - t0;
      var frac = S.editStart + (elapsed / len) * (S.editEnd - S.editStart);
      if (elapsed >= len) {
        el.playhead.hidden = true;
        return;
      }
      el.playhead.style.left = frac * w + "px";
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------
  // Apply trim — bake selection into a new (shorter) buffer
  // ------------------------------------------------------------
  function applyTrim() {
    var pad = S.pads[S.selected];
    if (!pad || !pad.buffer) return;
    var ctx = audio();
    var src = pad.buffer;
    var startSamp = Math.floor(S.editStart * src.length);
    var endSamp = Math.floor(S.editEnd * src.length);
    var newLen = Math.max(1, endSamp - startSamp);
    var out = ctx.createBuffer(src.numberOfChannels, newLen, src.sampleRate);
    for (var ch = 0; ch < src.numberOfChannels; ch++) {
      var from = src.getChannelData(ch);
      var to = out.getChannelData(ch);
      for (var i = 0; i < newLen; i++) {
        to[i] = from[startSamp + i];
      }
    }
    pad.buffer = out;
    pad.start = 0;
    pad.end = 1;
    S.editStart = 0;
    S.editEnd = 1;
    drawWave();
    layoutHandles();
    updateEditReadout();
  }

  // ------------------------------------------------------------
  // Chop selected buffer into 8 equal slices across all pads
  // ------------------------------------------------------------
  function chopToPads() {
    var pad = S.pads[S.selected];
    if (!pad || !pad.buffer) {
      alert("Load or record a sample first, then chop it.");
      return;
    }
    var ctx = audio();
    var src = pad.buffer;
    var startSamples = Math.floor(S.editStart * src.length);
    var endSamples = Math.floor(S.editEnd * src.length);
    var region = Math.max(PAD_COUNT, endSamples - startSamples);
    var sliceLen = Math.floor(region / PAD_COUNT);

    for (var p = 0; p < PAD_COUNT; p++) {
      var from = startSamples + p * sliceLen;
      var out = ctx.createBuffer(src.numberOfChannels, sliceLen, src.sampleRate);
      for (var ch = 0; ch < src.numberOfChannels; ch++) {
        var fromData = src.getChannelData(ch);
        var toData = out.getChannelData(ch);
        for (var i = 0; i < sliceLen; i++) {
          var idx = from + i;
          toData[i] = idx < fromData.length ? fromData[idx] : 0;
        }
      }
      setPad(p, out, "Chop " + (p + 1));
    }
    selectPad(0);
  }

  // ------------------------------------------------------------
  // Sequencer
  // ------------------------------------------------------------
  function buildGrid() {
    el.grid.innerHTML = "";
    S.seq = [];
    for (var p = 0; p < PAD_COUNT; p++) {
      S.seq.push(new Array(STEPS).fill(false));
      var row = document.createElement("div");
      row.className = "seq-row";
      var label = document.createElement("span");
      label.className = "seq-label";
      label.textContent = "P" + (p + 1);
      label.dataset.p = String(p);
      row.appendChild(label);
      for (var s = 0; s < STEPS; s++) {
        var step = document.createElement("button");
        step.className = "step";
        step.type = "button";
        step.dataset.p = String(p);
        step.dataset.s = String(s);
        bindStep(step);
        row.appendChild(step);
      }
      el.grid.appendChild(row);
    }
  }

  function bindStep(node) {
    node.addEventListener("click", function () {
      var p = +node.dataset.p;
      var s = +node.dataset.s;
      S.seq[p][s] = !S.seq[p][s];
      node.classList.toggle("on", S.seq[p][s]);
    });
  }

  function syncGridLabels() {
    el.grid.querySelectorAll(".seq-label").forEach(function (lab) {
      var p = +lab.dataset.p;
      var pad = S.pads[p];
      lab.textContent = pad && pad.buffer ? pad.name.slice(0, 6) : "P" + (p + 1);
    });
  }

  function toggleSeq() {
    if (S.playing) return stopSeq();
    startSeq();
  }

  function startSeq() {
    audio();
    S.playing = true;
    S.stepIndex = 0;
    S.nextNoteTime = S.ctx.currentTime + 0.05;
    el.seqPlay.classList.add("active");
    el.seqPlay.textContent = "Stop Loop";
    scheduler();
  }

  function stopSeq() {
    S.playing = false;
    clearTimeout(S.timer);
    el.seqPlay.classList.remove("active");
    el.seqPlay.textContent = "Play Loop";
    clearStepCursor();
  }

  // Look-ahead scheduler for tight timing
  function scheduler() {
    if (!S.playing) return;
    var secondsPerStep = 60.0 / S.bpm / 4; // 16th notes
    while (S.nextNoteTime < S.ctx.currentTime + 0.1) {
      scheduleStep(S.stepIndex, S.nextNoteTime);
      S.nextNoteTime += secondsPerStep;
      S.stepIndex = (S.stepIndex + 1) % STEPS;
    }
    S.timer = setTimeout(scheduler, 25);
  }

  function scheduleStep(stepIdx, time) {
    for (var p = 0; p < PAD_COUNT; p++) {
      if (S.seq[p][stepIdx] && S.pads[p] && S.pads[p].buffer) {
        playPad(p, time, false);
      }
    }
    var uiDelay = Math.max(0, (time - S.ctx.currentTime) * 1000);
    setTimeout(function () {
      moveStepCursor(stepIdx);
    }, uiDelay);
  }

  function moveStepCursor(stepIdx) {
    clearStepCursor();
    el.grid
      .querySelectorAll('.step[data-s="' + stepIdx + '"]')
      .forEach(function (n) {
        n.classList.add("cursor");
      });
  }

  function clearStepCursor() {
    el.grid.querySelectorAll(".step.cursor").forEach(function (n) {
      n.classList.remove("cursor");
    });
  }

  function clearSequence() {
    S.seq.forEach(function (row) {
      row.fill(false);
    });
    el.grid.querySelectorAll(".step.on").forEach(function (n) {
      n.classList.remove("on");
    });
  }

  // ------------------------------------------------------------
  // Pattern bank (save / load sequencer patterns)
  // ------------------------------------------------------------
  function buildPatternSlots() {
    el.patSlots.innerHTML = "";
    S.slots = S.slots.length ? S.slots : new Array(SLOTS).fill(null);
    for (var i = 0; i < SLOTS; i++) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "pat-slot";
      b.dataset.i = String(i);
      b.textContent = String(i + 1);
      b.addEventListener("click", function () {
        selectPattern(+this.dataset.i);
      });
      el.patSlots.appendChild(b);
    }
    renderPatternSlots();
  }

  function renderPatternSlots() {
    if (!el.patSlots) return;
    var btns = el.patSlots.querySelectorAll(".pat-slot");
    btns.forEach(function (b) {
      var i = +b.dataset.i;
      var has = !!(S.slots[i] && S.slots[i].length);
      b.classList.toggle("has", has);
      b.classList.toggle("active", i === S.activeSlot);
    });
  }

  function selectPattern(i) {
    S.activeSlot = i;
    // clicking a filled slot loads it
    if (S.slots[i] && S.slots[i].length) {
      loadPatternInto(S.slots[i]);
    }
    renderPatternSlots();
  }

  function savePattern() {
    S.slots[S.activeSlot] = S.seq.map(function (row) {
      return row.slice();
    });
    persistPatterns();
    renderPatternSlots();
  }

  function clearPattern() {
    S.slots[S.activeSlot] = null;
    persistPatterns();
    renderPatternSlots();
  }

  function loadPatternInto(pat) {
    for (var p = 0; p < PAD_COUNT; p++) {
      for (var s = 0; s < STEPS; s++) {
        S.seq[p][s] = !!(pat[p] && pat[p][s]);
      }
    }
    // reflect in UI
    el.grid.querySelectorAll(".step").forEach(function (n) {
      var p = +n.dataset.p;
      var s = +n.dataset.s;
      n.classList.toggle("on", !!S.seq[p][s]);
    });
  }

  function persistPatterns() {
    try {
      localStorage.setItem(PAT_KEY, JSON.stringify({ slots: S.slots, active: S.activeSlot }));
    } catch (e) {
      /* storage unavailable */
    }
  }

  function restorePatterns() {
    try {
      var raw = localStorage.getItem(PAT_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (d && Array.isArray(d.slots)) {
        S.slots = d.slots.slice(0, SLOTS);
        while (S.slots.length < SLOTS) S.slots.push(null);
        if (typeof d.active === "number") S.activeSlot = d.active % SLOTS;
      }
    } catch (e) {
      /* ignore corrupt storage */
    }
  }

  // ------------------------------------------------------------
  // Load built-in kit onto all pads
  // ------------------------------------------------------------
  function loadKit() {
    var kit = makeKit();
    for (var i = 0; i < PAD_COUNT; i++) {
      setPad(i, kit[i].buffer, kit[i].name, {
        pitch: 0,
        reverse: false,
        choke: kit[i].choke || null,
      });
    }
    syncGridLabels();
    selectPad(0);
  }

  // ------------------------------------------------------------
  // Level meter (analyser driven)
  // ------------------------------------------------------------
  function meterLoop() {
    if (el.meterFill) {
      if (S.analyser) {
        var buf = new Float32Array(S.analyser.fftSize);
        S.analyser.getFloatTimeDomainData(buf);
        var sum = 0;
        for (var i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        var rms = Math.sqrt(sum / buf.length);
        var db = 20 * Math.log10(rms + 1e-6);
        var pct = Math.min(1, Math.max(0, (db + 50) / 50));
        el.meterFill.style.width = (pct * 100).toFixed(1) + "%";
      }
    }
    requestAnimationFrame(meterLoop);
  }

  // ------------------------------------------------------------
  // Wire up
  // ------------------------------------------------------------
  function cache() {
    el.pads = document.getElementById("pads");
    el.recBtn = document.getElementById("recBtn");
    el.fileInput = document.getElementById("fileInput");
    el.kitBtn = document.getElementById("kitBtn");
    el.editTarget = document.getElementById("editTarget");
    el.wave = document.getElementById("wave");
    el.waveWrap = document.querySelector(".wave-wrap");
    el.handleStart = document.getElementById("handleStart");
    el.handleEnd = document.getElementById("handleEnd");
    el.playhead = document.getElementById("playhead");
    el.playSel = document.getElementById("playSel");
    el.chop8 = document.getElementById("chop8");
    el.trimBtn = document.getElementById("trimBtn");
    el.startVal = document.getElementById("startVal");
    el.endVal = document.getElementById("endVal");
    el.lenVal = document.getElementById("lenVal");
    el.seqPlay = document.getElementById("seqPlay");
    el.tempo = document.getElementById("tempo");
    el.tempoVal = document.getElementById("tempoVal");
    el.clearSeq = document.getElementById("clearSeq");
    el.grid = document.getElementById("grid");
    el.patSlots = document.getElementById("patSlots");
    el.savePat = document.getElementById("savePat");
    el.clearPat = document.getElementById("clearPat");
    el.meterFill = document.getElementById("meterFill");
    // pitch / reverse
    el.pitch = document.getElementById("pitch");
    el.pitchVal = document.getElementById("pitchVal");
    el.reverseBtn = document.getElementById("reverseBtn");
    // fx controls
    el.fx = {
      drive: document.getElementById("fxDrive"),
      driveVal: document.getElementById("fxDriveVal"),
      tone: document.getElementById("fxTone"),
      toneVal: document.getElementById("fxToneVal"),
      delay: document.getElementById("fxDelay"),
      delayVal: document.getElementById("fxDelayVal"),
      space: document.getElementById("fxSpace"),
      spaceVal: document.getElementById("fxSpaceVal"),
      volume: document.getElementById("fxVolume"),
      volumeVal: document.getElementById("fxVolumeVal"),
    };
  }

  // attach an fx slider -> state + readout
  function pct(v) {
    return Math.round(v * 100) + "%";
  }

  // attach an fx slider -> state + readout
  function fxBind(input, key, readout, fmt) {
    input.addEventListener("input", function () {
      S.fx[key] = +input.value;
      readout.textContent = fmt ? fmt(S.fx[key]) : pct(S.fx[key]);
      applyFx();
    });
  }

  function bindGlobal() {
    el.recBtn.addEventListener("click", toggleRecord);
    el.fileInput.addEventListener("change", onFile);
    el.kitBtn.addEventListener("click", loadKit);
    el.playSel.addEventListener("click", playSelection);
    el.chop8.addEventListener("click", function () {
      chopToPads();
      syncGridLabels();
    });
    el.trimBtn.addEventListener("click", applyTrim);
    el.seqPlay.addEventListener("click", toggleSeq);
    el.clearSeq.addEventListener("click", clearSequence);
    el.savePat.addEventListener("click", savePattern);
    el.clearPat.addEventListener("click", clearPattern);
    el.tempo.addEventListener("input", function () {
      S.bpm = +el.tempo.value;
      el.tempoVal.textContent = S.bpm;
    });

    // pitch + reverse
    el.pitch.addEventListener("input", function () {
      var pad = S.pads[S.selected];
      if (!pad) return;
      pad.pitch = +el.pitch.value;
      el.pitchVal.textContent =
        pad.pitch > 0 ? "+" + pad.pitch + " st" : pad.pitch + " st";
    });
    el.reverseBtn.addEventListener("click", function () {
      var pad = S.pads[S.selected];
      if (!pad) return;
      pad.reverse = !pad.reverse;
      el.reverseBtn.classList.toggle("active", pad.reverse);
    });

    // fx
    fxBind(el.fx.drive, "drive", el.fx.driveVal, pct);
    fxBind(el.fx.tone, "tone", el.fx.toneVal, function (v) {
      return v >= 0.98 ? "Open" : pct(v);
    });
    fxBind(el.fx.delay, "delay", el.fx.delayVal, pct);
    fxBind(el.fx.space, "space", el.fx.spaceVal, pct);
    fxBind(el.fx.volume, "volume", el.fx.volumeVal, pct);

    bindHandle(el.handleStart, "start");
    bindHandle(el.handleEnd, "end");
    window.addEventListener("resize", function () {
      resizeCanvas();
      layoutHandles();
    });
  }

  function resizeCanvas() {
    var w = el.waveWrap.clientWidth;
    el.wave.width = Math.max(300, Math.floor(w));
    drawWave();
  }

  function seedDemoBeat() {
    var K = 0,
      SN = 1,
      H = 2;
    [0, 4, 8, 12].forEach(function (s) {
      S.seq[K][s] = true;
    });
    [4, 12].forEach(function (s) {
      S.seq[SN][s] = true;
    });
    [0, 2, 4, 6, 8, 10, 12, 14].forEach(function (s) {
      S.seq[H][s] = true;
    });
    el.grid.querySelectorAll(".step").forEach(function (n) {
      var p = +n.dataset.p;
      var s = +n.dataset.s;
      n.classList.toggle("on", !!S.seq[p][s]);
    });
  }

  function syncFxUI() {
    el.fx.drive.value = S.fx.drive;
    el.fx.driveVal.textContent = pct(S.fx.drive);
    el.fx.tone.value = S.fx.tone;
    el.fx.toneVal.textContent = S.fx.tone >= 0.98 ? "Open" : pct(S.fx.tone);
    el.fx.delay.value = S.fx.delay;
    el.fx.delayVal.textContent = pct(S.fx.delay);
    el.fx.space.value = S.fx.space;
    el.fx.spaceVal.textContent = pct(S.fx.space);
    el.fx.volume.value = S.fx.volume;
    el.fx.volumeVal.textContent = pct(S.fx.volume);
  }

  function init() {
    cache();
    buildPads();
    buildGrid();
    restorePatterns();
    buildPatternSlots();
    bindGlobal();
    bindKeyboard();
    for (var i = 0; i < PAD_COUNT; i++) S.pads[i] = null;
    resizeCanvas();
    layoutHandles();
    updateEditReadout();
    loadKit();
    seedDemoBeat();
    syncFxUI();
    S.bpm = +el.tempo.value;
    el.tempoVal.textContent = S.bpm;
    meterLoop();
  }

  // expose a tiny API for later game.js integration
  window.RicoSampler = {
    trigger: triggerPad,
    state: S,
    loadKit: loadKit,
    // convenient fx helpers
    getFx: function () {
      return S.fx;
    },
    setFx: function (patch) {
      var k;
      for (k in patch) {
        if (S.fx.hasOwnProperty(k)) S.fx[k] = patch[k];
      }
      applyFx();
      return S.fx;
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();