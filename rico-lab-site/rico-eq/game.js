/* Rico's EQ - standalone EQ practice trainer
 * Web Audio API, no dependencies, no build step.
 *
 * Signal graph:
 *   source -> [target biquads (hidden, match game)] -> [user biquads x5] -> analyser -> master gain -> destination
 *
 * The five user bands are a real parametric EQ (lowshelf, 3x peaking, highshelf).
 * In Match Game a hidden set of biquads applies a random EQ "move"; the player
 * recreates it with their own bands and is scored on how close the two curves are.
 */

(function () {
  "use strict";

  // ---- Band definitions -------------------------------------------------
  // freq is fixed per band; the user moves gain (and Q for the peaks).
  var BANDS = [
    { name: "Low", freq: 80, type: "lowshelf", q: 0.7 },
    { name: "Lo-Mid", freq: 250, type: "peaking", q: 1.0 },
    { name: "Mid", freq: 1000, type: "peaking", q: 1.0 },
    { name: "Hi-Mid", freq: 4000, type: "peaking", q: 1.0 },
    { name: "High", freq: 12000, type: "highshelf", q: 0.7 },
  ];

  var MIN_F = 20;
  var MAX_F = 20000;
  var GAIN_RANGE = 15; // +/- dB on the graph

  // ---- State ------------------------------------------------------------
  var state = {
    playing: false,
    bypass: false,
    mode: "free", // "free" | "match"
    source: "pink",
    volume: 0.7,
    score: 0,
    hearingTarget: false,
    hasChallenge: false,
    // user band values (gain in dB, q)
    bands: BANDS.map(function (b) {
      return { gain: 0, q: b.q };
    }),
    // hidden target band values (match game)
    target: BANDS.map(function () {
      return { gain: 0, q: 0.7 };
    }),
  };

  // ---- Audio graph ------------------------------------------------------
  var ac = null;
  var master = null;
  var analyser = null;
  var userFilters = []; // BiquadFilterNode[]
  var targetFilters = []; // BiquadFilterNode[]
  var sourceNode = null; // current playing node
  var sourceGain = null;
  var freqData = null;

  function initAudio() {
    if (ac) return;
    ac = new (window.AudioContext || window.webkitAudioContext)();

    master = ac.createGain();
    master.gain.value = state.volume;

    analyser = ac.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.8;
    freqData = new Uint8Array(analyser.frequencyBinCount);

    // Build target filters (hidden) first in the chain.
    targetFilters = BANDS.map(function (b) {
      var f = ac.createBiquadFilter();
      f.type = b.type;
      f.frequency.value = b.freq;
      f.Q.value = b.q;
      f.gain.value = 0;
      return f;
    });

    // Build user filters.
    userFilters = BANDS.map(function (b) {
      var f = ac.createBiquadFilter();
      f.type = b.type;
      f.frequency.value = b.freq;
      f.Q.value = b.q;
      f.gain.value = 0;
      return f;
    });

    // Chain: target[0..4] -> user[0..4] -> analyser -> master -> out
    var chain = targetFilters.concat(userFilters);
    for (var i = 0; i < chain.length - 1; i++) {
      chain[i].connect(chain[i + 1]);
    }
    chain[chain.length - 1].connect(analyser);
    analyser.connect(master);
    master.connect(ac.destination);
  }

  // Entry point of the filter chain (where the source connects).
  function chainInput() {
    return targetFilters[0];
  }

  // ---- Sources ----------------------------------------------------------
  function makeNoiseBuffer(kind) {
    var len = ac.sampleRate * 2;
    var buf = ac.createBuffer(1, len, ac.sampleRate);
    var d = buf.getChannelData(0);
    if (kind === "white") {
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else {
      // pink noise (Paul Kellet's economy method)
      var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (var j = 0; j < len; j++) {
        var w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        var pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
        b6 = w * 0.115926;
        d[j] = pink * 0.11;
      }
    }
    return buf;
  }

  function makeDrumBuffer() {
    // A simple 2-second 4-on-the-floor loop: kick + hats synthesized to a buffer.
    var sr = ac.sampleRate;
    var len = sr * 2;
    var buf = ac.createBuffer(1, len, sr);
    var d = buf.getChannelData(0);
    var bpm = 120;
    var beat = (60 / bpm) * sr; // samples per beat
    function kick(at) {
      for (var i = 0; i < sr * 0.25; i++) {
        var t = i / sr;
        var f = 120 * Math.exp(-t * 18) + 45;
        var env = Math.exp(-t * 8);
        var idx = Math.floor(at + i);
        if (idx < len) d[idx] += Math.sin(2 * Math.PI * f * t) * env * 0.9;
      }
    }
    function hat(at) {
      for (var i = 0; i < sr * 0.06; i++) {
        var t = i / sr;
        var env = Math.exp(-t * 60);
        var idx = Math.floor(at + i);
        if (idx < len) d[idx] += (Math.random() * 2 - 1) * env * 0.25;
      }
    }
    for (var b = 0; b < 4; b++) {
      kick(b * beat);
      hat(b * beat);
      hat(b * beat + beat / 2);
    }
    return buf;
  }

  function startSource() {
    stopSource();
    if (state.source === "tone") {
      // slow log sweep 40Hz -> 16kHz on repeat
      var osc = ac.createOscillator();
      osc.type = "sawtooth";
      sourceGain = ac.createGain();
      sourceGain.gain.value = 0.25;
      var now = ac.currentTime;
      osc.frequency.setValueAtTime(40, now);
      osc.frequency.exponentialRampToValueAtTime(16000, now + 4);
      osc.frequency.exponentialRampToValueAtTime(40, now + 8);
      // loop the sweep manually
      scheduleSweep(osc, now + 8);
      osc.connect(sourceGain);
      sourceGain.connect(chainInput());
      osc.start();
      sourceNode = osc;
    } else {
      var buf = state.source === "drums" ? makeDrumBuffer() : makeNoiseBuffer(state.source);
      var src = ac.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      sourceGain = ac.createGain();
      sourceGain.gain.value = 1;
      src.connect(sourceGain);
      sourceGain.connect(chainInput());
      src.start();
      sourceNode = src;
    }
  }

  function scheduleSweep(osc, startAt) {
    // Re-ramp every 8s while playing.
    var iv = setInterval(function () {
      if (!state.playing || sourceNode !== osc) {
        clearInterval(iv);
        return;
      }
      var now = ac.currentTime;
      osc.frequency.cancelScheduledValues(now);
      osc.frequency.setValueAtTime(40, now);
      osc.frequency.exponentialRampToValueAtTime(16000, now + 4);
      osc.frequency.exponentialRampToValueAtTime(40, now + 8);
    }, 8000);
  }

  function stopSource() {
    if (sourceNode) {
      try { sourceNode.stop(); } catch (e) {}
      try { sourceNode.disconnect(); } catch (e) {}
      sourceNode = null;
    }
    if (sourceGain) {
      try { sourceGain.disconnect(); } catch (e) {}
      sourceGain = null;
    }
  }

  // ---- Apply band values to filters ------------------------------------
  function applyUserBands() {
    for (var i = 0; i < userFilters.length; i++) {
      var g = state.bypass ? 0 : state.bands[i].gain;
      userFilters[i].gain.setTargetAtTime(g, ac.currentTime, 0.02);
      userFilters[i].Q.setTargetAtTime(state.bands[i].q, ac.currentTime, 0.02);
    }
  }

  function applyTargetBands(active) {
    for (var i = 0; i < targetFilters.length; i++) {
      var g = active ? state.target[i].gain : 0;
      targetFilters[i].gain.setTargetAtTime(g, ac.currentTime, 0.02);
      targetFilters[i].Q.setTargetAtTime(state.target[i].q, ac.currentTime, 0.02);
    }
  }

  // ---- Frequency response math (for drawing the curve) ------------------
  // Analog-prototype-ish magnitude for each biquad type, in dB.
  function bandResponseDb(band, def, f) {
    var A = Math.pow(10, band.gain / 40);
    var w = f / def.freq;
    if (def.type === "peaking") {
      // bell: peak at freq, width from Q
      var bw = Math.log(w) * band.q;
      var bell = Math.exp(-(bw * bw));
      return band.gain * bell;
    } else if (def.type === "lowshelf") {
      // full boost below freq, tapering above
      var t = 1 / (1 + Math.pow(f / def.freq, 2));
      return band.gain * t;
    } else if (def.type === "highshelf") {
      var t2 = 1 / (1 + Math.pow(def.freq / f, 2));
      return band.gain * t2;
    }
    return 0;
  }

  function totalResponseDb(bands, f) {
    var sum = 0;
    for (var i = 0; i < BANDS.length; i++) {
      sum += bandResponseDb(bands[i], BANDS[i], f);
    }
    return sum;
  }

  // ---- Canvas drawing ---------------------------------------------------
  var canvas, ctx, cw, ch, dpr;

  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    cw = rect.width;
    ch = rect.height;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function freqToX(f) {
    var min = Math.log10(MIN_F);
    var max = Math.log10(MAX_F);
    return ((Math.log10(f) - min) / (max - min)) * cw;
  }
  function xToFreq(x) {
    var min = Math.log10(MIN_F);
    var max = Math.log10(MAX_F);
    return Math.pow(10, min + (x / cw) * (max - min));
  }
  function dbToY(db) {
    return ch / 2 - (db / GAIN_RANGE) * (ch / 2 - 12);
  }
  function yToDb(y) {
    return ((ch / 2 - y) / (ch / 2 - 12)) * GAIN_RANGE;
  }

  function drawGrid() {
    ctx.clearRect(0, 0, cw, ch);
    ctx.lineWidth = 1;
    ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "top";

    // vertical freq lines
    var marks = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
    ctx.strokeStyle = "rgba(162,147,124,0.14)";
    ctx.fillStyle = "rgba(162,147,124,0.6)";
    marks.forEach(function (f) {
      var x = freqToX(f);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ch);
      ctx.stroke();
      var label = f >= 1000 ? f / 1000 + "k" : "" + f;
      ctx.fillText(label, x + 3, ch - 14);
    });

    // horizontal dB lines
    [-12, -6, 0, 6, 12].forEach(function (db) {
      var y = dbToY(db);
      ctx.strokeStyle = db === 0 ? "rgba(217,164,65,0.35)" : "rgba(162,147,124,0.12)";
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cw, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(162,147,124,0.6)";
      ctx.fillText((db > 0 ? "+" : "") + db, 3, y + 2);
    });
  }

  function drawSpectrum() {
    if (!analyser || !state.playing) return;
    analyser.getByteFrequencyData(freqData);
    var nyq = ac.sampleRate / 2;
    ctx.beginPath();
    var started = false;
    for (var i = 1; i < freqData.length; i++) {
      var f = (i / freqData.length) * nyq;
      if (f < MIN_F || f > MAX_F) continue;
      var x = freqToX(f);
      var mag = freqData[i] / 255; // 0..1
      var y = ch - mag * ch * 0.9;
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(cw, ch);
    ctx.lineTo(0, ch);
    ctx.closePath();
    ctx.fillStyle = "rgba(217,164,65,0.10)";
    ctx.fill();
  }

  function drawCurve(bands, color, width, dashed) {
    ctx.beginPath();
    for (var x = 0; x <= cw; x += 2) {
      var f = xToFreq(x);
      var db = totalResponseDb(bands, f);
      var y = dbToY(db);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (dashed) ctx.setLineDash([6, 5]); else ctx.setLineDash([]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawBandDots() {
    for (var i = 0; i < BANDS.length; i++) {
      var def = BANDS[i];
      var x = freqToX(def.freq);
      var y = dbToY(state.bands[i].gain);
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = i === dragBand ? "#f3ead9" : "#d9a441";
      ctx.fill();
      ctx.strokeStyle = "#1a1712";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#1a1712";
      ctx.font = "bold 10px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), x, y);
      ctx.textAlign = "left";
    }
  }

  function render() {
    drawGrid();
    drawSpectrum();
    // target curve (only while hearing target OR after a check in match mode)
    if (state.mode === "match" && state.hasChallenge && showTargetCurve) {
      drawCurve(state.target, "rgba(123,185,106,0.9)", 2, true);
    }
    if (!state.bypass) {
      drawCurve(state.bands, "#d9a441", 2.5, false);
    } else {
      drawCurve(state.bands.map(function () { return { gain: 0, q: 1 }; }), "rgba(162,147,124,0.5)", 2, false);
    }
    drawBandDots();
    requestAnimationFrame(render);
  }

  // ---- Canvas dragging --------------------------------------------------
  var dragBand = -1;
  var showTargetCurve = false;

  function nearestBand(x, y) {
    var best = -1, bestD = 24;
    for (var i = 0; i < BANDS.length; i++) {
      var bx = freqToX(BANDS[i].freq);
      var by = dbToY(state.bands[i].gain);
      var d = Math.hypot(x - bx, y - by);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function pointerPos(e) {
    var rect = canvas.getBoundingClientRect();
    var p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - rect.left, y: p.clientY - rect.top };
  }

  function onDown(e) {
    ensureRunning();
    var p = pointerPos(e);
    dragBand = nearestBand(p.x, p.y);
    if (dragBand >= 0) {
      e.preventDefault();
      updateDrag(p);
    }
  }
  function onMove(e) {
    if (dragBand < 0) return;
    e.preventDefault();
    updateDrag(pointerPos(e));
  }
  function onUp() {
    dragBand = -1;
  }
  function updateDrag(p) {
    var db = Math.max(-GAIN_RANGE, Math.min(GAIN_RANGE, yToDb(p.y)));
    state.bands[dragBand].gain = Math.round(db * 10) / 10;
    syncBandUI(dragBand);
    applyUserBands();
  }

  // ---- Band UI (sliders) ------------------------------------------------
  var bandEls = [];

  function buildBands() {
    var wrap = document.getElementById("eqBands");
    wrap.innerHTML = "";
    bandEls = [];
    BANDS.forEach(function (def, i) {
      var el = document.createElement("div");
      el.className = "band";
      var freqLabel = def.freq >= 1000 ? def.freq / 1000 + " kHz" : def.freq + " Hz";
      var showQ = def.type === "peaking";
      el.innerHTML =
        '<span class="band-name">' + def.name + "</span>" +
        '<span class="band-freq">' + freqLabel + "</span>" +
        '<input class="band-gain-slider" type="range" min="-15" max="15" step="0.5" value="0" ' +
        'orient="vertical" aria-label="' + def.name + ' gain" />' +
        '<span class="band-gain-val">0.0 dB</span>' +
        (showQ
          ? '<div class="band-q"><label>Q <span class="qv">1.0</span></label>' +
            '<input type="range" min="0.4" max="6" step="0.1" value="1" aria-label="' +
            def.name + ' Q" /></div>'
          : "");
      wrap.appendChild(el);

      var gainSlider = el.querySelector(".band-gain-slider");
      var gainVal = el.querySelector(".band-gain-val");
      gainSlider.addEventListener("input", function () {
        ensureRunning();
        state.bands[i].gain = parseFloat(gainSlider.value);
        gainVal.textContent = state.bands[i].gain.toFixed(1) + " dB";
        applyUserBands();
      });

      var qSlider = showQ ? el.querySelector(".band-q input") : null;
      var qVal = showQ ? el.querySelector(".qv") : null;
      if (qSlider) {
        qSlider.addEventListener("input", function () {
          ensureRunning();
          state.bands[i].q = parseFloat(qSlider.value);
          qVal.textContent = state.bands[i].q.toFixed(1);
          applyUserBands();
        });
      }

      bandEls.push({ gainSlider: gainSlider, gainVal: gainVal, qSlider: qSlider, qVal: qVal });
    });
  }

  function syncBandUI(i) {
    var b = bandEls[i];
    if (!b) return;
    b.gainSlider.value = state.bands[i].gain;
    b.gainVal.textContent = state.bands[i].gain.toFixed(1) + " dB";
    if (b.qSlider) {
      b.qSlider.value = state.bands[i].q;
      b.qVal.textContent = state.bands[i].q.toFixed(1);
    }
  }

  function resetBands() {
    state.bands = BANDS.map(function (b) { return { gain: 0, q: b.q }; });
    for (var i = 0; i < BANDS.length; i++) syncBandUI(i);
    applyUserBands();
  }

  // ---- Match game -------------------------------------------------------
  function newChallenge() {
    // Pick 1-2 bands to move by a random amount.
    state.target = BANDS.map(function (b) { return { gain: 0, q: b.q }; });
    var count = 1 + Math.floor(Math.random() * 2);
    var picks = [];
    while (picks.length < count) {
      var idx = Math.floor(Math.random() * BANDS.length);
      if (picks.indexOf(idx) === -1) picks.push(idx);
    }
    picks.forEach(function (idx) {
      var sign = Math.random() < 0.5 ? -1 : 1;
      var amt = 6 + Math.random() * 8; // 6..14 dB, obvious enough to hear
      state.target[idx].gain = Math.round(sign * amt);
      if (BANDS[idx].type === "peaking") state.target[idx].q = 1 + Math.random() * 2;
    });
    state.hasChallenge = true;
    showTargetCurve = false;
    state.hearingTarget = false;
    resetBands();
    applyTargetBands(false);
    setResult("", "");
    document.getElementById("gameMsg").textContent =
      "Listen to the target, then dial your bands to match its tone. Bands moved: " +
      count + ".";
    setStatus("New challenge");
    updateToggleRefUI();
  }

  function toggleHearTarget() {
    if (!state.hasChallenge) return;
    state.hearingTarget = !state.hearingTarget;
    // When hearing target, disable user bands and enable target bands.
    applyTargetBands(state.hearingTarget);
    if (state.hearingTarget) {
      for (var i = 0; i < userFilters.length; i++)
        userFilters[i].gain.setTargetAtTime(0, ac.currentTime, 0.02);
    } else {
      applyUserBands();
    }
    updateToggleRefUI();
    setStatus(state.hearingTarget ? "Hearing target" : "Hearing your EQ");
  }

  function updateToggleRefUI() {
    var btn = document.getElementById("toggleRefBtn");
    btn.classList.toggle("is-on", state.hearingTarget);
    btn.textContent = state.hearingTarget ? "Hear Yours" : "Hear Target";
  }

  function checkMatch() {
    if (!state.hasChallenge) {
      setResult("Start a challenge first.", "bad");
      return;
    }
    // Stop auditioning target so the user hears their result.
    state.hearingTarget = false;
    applyTargetBands(false);
    applyUserBands();
    updateToggleRefUI();

    // Score by comparing curves across log-spaced frequencies.
    var testF = [40, 80, 160, 320, 640, 1280, 2560, 5120, 10240];
    var err = 0;
    testF.forEach(function (f) {
      var t = totalResponseDb(state.target, f);
      var u = totalResponseDb(state.bands, f);
      err += Math.abs(t - u);
    });
    var avgErr = err / testF.length; // avg dB error per point

    showTargetCurve = true; // reveal the answer

    var pts, msg, cls;
    if (avgErr < 1.5) { pts = 100; msg = "Perfect match! "; cls = "good"; }
    else if (avgErr < 3) { pts = 70; msg = "Great match. "; cls = "good"; }
    else if (avgErr < 5) { pts = 40; msg = "Close. "; cls = "good"; }
    else { pts = 10; msg = "Off the mark. "; cls = "bad"; }

    state.score += pts;
    document.getElementById("scoreVal").textContent = state.score;
    setResult(
      msg + "Avg error " + avgErr.toFixed(1) + " dB  (+" + pts +
      "). Green dashed line is the target.",
      cls
    );
    setStatus("Checked: +" + pts);
  }

  function setResult(text, cls) {
    var el = document.getElementById("resultBar");
    el.textContent = text;
    el.className = "result-bar" + (cls ? " " + cls : "");
  }

  // ---- Modes ------------------------------------------------------------
  function setMode(mode) {
    state.mode = mode;
    var free = document.getElementById("modeFree");
    var match = document.getElementById("modeMatch");
    free.classList.toggle("is-on", mode === "free");
    free.setAttribute("aria-pressed", String(mode === "free"));
    match.classList.toggle("is-on", mode === "match");
    match.setAttribute("aria-pressed", String(mode === "match"));
    document.getElementById("gamePanel").hidden = mode !== "match";

    if (mode === "free") {
      state.hasChallenge = false;
      state.hearingTarget = false;
      showTargetCurve = false;
      applyTargetBands(false);
      applyUserBands();
      setStatus("Free play");
    } else {
      newChallenge();
    }
  }

  // ---- Transport / helpers ---------------------------------------------
  function ensureRunning() {
    initAudio();
    if (ac.state === "suspended") ac.resume();
  }

  function setPlaying(on) {
    ensureRunning();
    state.playing = on;
    var btn = document.getElementById("playBtn");
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.innerHTML = on ? "&#9632; Stop" : "&#9654; Play";
    if (on) {
      startSource();
      applyUserBands();
      applyTargetBands(state.hearingTarget);
      setStatus("Playing " + labelForSource());
    } else {
      stopSource();
      setStatus("Stopped");
    }
  }

  function labelForSource() {
    return { pink: "pink noise", white: "white noise", drums: "drum loop", tone: "sweep tone" }[state.source];
  }

  function setStatus(t) {
    document.getElementById("statusLine").textContent = t;
  }

  // ---- Wire up UI -------------------------------------------------------
  function init() {
    canvas = document.getElementById("eqCanvas");
    ctx = canvas.getContext("2d");
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    buildBands();

    // transport
    document.getElementById("playBtn").addEventListener("click", function () {
      setPlaying(!state.playing);
    });
    document.getElementById("bypassBtn").addEventListener("click", function () {
      state.bypass = !state.bypass;
      var b = document.getElementById("bypassBtn");
      b.classList.toggle("is-on", state.bypass);
      b.setAttribute("aria-pressed", String(state.bypass));
      applyUserBands();
      setStatus(state.bypass ? "EQ bypassed" : "EQ active");
    });
    document.getElementById("sourceSel").addEventListener("change", function (e) {
      state.source = e.target.value;
      if (state.playing) startSource();
      setStatus("Source: " + labelForSource());
    });
    document.getElementById("volume").addEventListener("input", function (e) {
      state.volume = e.target.value / 100;
      document.getElementById("volVal").textContent = e.target.value;
      if (master) master.gain.setTargetAtTime(state.volume, ac.currentTime, 0.02);
    });

    // modes
    document.getElementById("modeFree").addEventListener("click", function () { setMode("free"); });
    document.getElementById("modeMatch").addEventListener("click", function () { setMode("match"); });
    document.getElementById("newRoundBtn").addEventListener("click", newChallenge);
    document.getElementById("toggleRefBtn").addEventListener("click", toggleHearTarget);
    document.getElementById("checkBtn").addEventListener("click", checkMatch);

    document.getElementById("powerHint").addEventListener("click", function () {
      setPlaying(true);
    });

    // canvas drag
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("touchstart", onDown, { passive: false });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);

    render();
  }

  // ---- Public API for embedding ----------------------------------------
  window.RicoEQ = {
    play: function () { setPlaying(true); },
    stop: function () { setPlaying(false); },
    setBand: function (i, gain, q) {
      if (i < 0 || i >= BANDS.length) return;
      state.bands[i].gain = gain;
      if (q != null) state.bands[i].q = q;
      syncBandUI(i);
      applyUserBands();
    },
    reset: resetBands,
    newChallenge: newChallenge,
    setSource: function (s) {
      state.source = s;
      document.getElementById("sourceSel").value = s;
      if (state.playing) startSource();
    },
    responseDb: function (f) { return totalResponseDb(state.bands, f); },
    state: state,
    BANDS: BANDS,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
