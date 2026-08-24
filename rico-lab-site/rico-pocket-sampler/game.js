/* ============================================================
 * Rico's Pocket Sampler
 * A simplified Koala-style sampler: 8 pads, waveform chopping,
 * and a 16-step drum sequencer. Zero dependencies, Web Audio API.
 *
 * Drop-in notes for game.js integration:
 *  - All state lives in the `S` object.
 *  - Audio is a single AudioContext (`S.ctx`).
 *  - Each pad holds an AudioBuffer in `S.pads[i].buffer`.
 *  - triggerPad(i) plays a pad; you can call it from anywhere.
 * ============================================================ */

(function () {
  "use strict";

  var PAD_COUNT = 8;
  var STEPS = 16;

  // ---- Global state ----
  var S = {
    ctx: null,
    pads: [], // { buffer, name, start, end }  start/end are 0..1 of buffer
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
  };

  // ---- DOM refs ----
  var el = {};

  // ------------------------------------------------------------
  // Audio context (created lazily on first user gesture)
  // ------------------------------------------------------------
  function audio() {
    if (!S.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      S.ctx = new AC();
    }
    if (S.ctx.state === "suspended") S.ctx.resume();
    return S.ctx;
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
    // Open hat
    kit.push({
      name: "OpenHat",
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
  function setPad(i, buffer, name) {
    S.pads[i] = {
      buffer: buffer || null,
      name: name || "—",
      start: 0,
      end: 1,
    };
    refreshPadUI(i);
  }

  function triggerPad(i) {
    var pad = S.pads[i];
    if (!pad || !pad.buffer) return;
    var ctx = audio();
    var src = ctx.createBufferSource();
    src.buffer = pad.buffer;
    var g = ctx.createGain();
    src.connect(g).connect(ctx.destination);

    var dur = pad.buffer.duration;
    var offset = pad.start * dur;
    var playLen = Math.max(0.01, (pad.end - pad.start) * dur);
    src.start(0, offset, playLen);
    flashPad(i);
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
    drawWave();
    layoutHandles();
    updateEditReadout();
  }

  // ------------------------------------------------------------
  // Pad UI
  // ------------------------------------------------------------
  function buildPads() {
    el.pads.innerHTML = "";
    for (var i = 0; i < PAD_COUNT; i++) {
      var pad = document.createElement("button");
      pad.className = "pad empty";
      pad.type = "button";
      pad.dataset.i = String(i);
      pad.innerHTML =
        '<span class="pad-num">PAD ' +
        (i + 1) +
        '</span><span class="pad-name">—</span>';
      bindPad(pad, i);
      el.pads.appendChild(pad);
    }
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
    node.querySelector(".pad-name").textContent = has ? pad.name : "—";
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
        el.recBtn.querySelector(".dot")
          ? (el.recBtn.childNodes[el.recBtn.childNodes.length - 1].textContent = " Stop")
          : null;
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
      var name = "Sample";
      setPad(S.selected, buffer, name);
      S.editStart = 0;
      S.editEnd = 1;
      S.pads[S.selected].start = 0;
      S.pads[S.selected].end = 1;
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
      ctx2d.fillText("No sample — Record or Load Audio", W / 2, H / 2 - 8);
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
      // persist live to pad so pad playback reflects trim
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
    src.connect(ctx.destination);
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
    var dur = src.duration;
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
    var startSamp = Math.floor(S.editStart * src.length);
    var endSamp = Math.floor(S.editEnd * src.length);
    var region = Math.max(PAD_COUNT, endSamp - startSamp);
    var sliceLen = Math.floor(region / PAD_COUNT);

    for (var p = 0; p < PAD_COUNT; p++) {
      var from = startSamp + p * sliceLen;
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
        playAt(p, time);
      }
    }
    // UI cursor
    var uiDelay = Math.max(0, (time - S.ctx.currentTime) * 1000);
    setTimeout(function () {
      moveStepCursor(stepIdx);
    }, uiDelay);
  }

  function playAt(i, time) {
    var pad = S.pads[i];
    var ctx = audio();
    var src = ctx.createBufferSource();
    src.buffer = pad.buffer;
    src.connect(ctx.destination);
    var dur = pad.buffer.duration;
    var offset = pad.start * dur;
    var len = Math.max(0.01, (pad.end - pad.start) * dur);
    src.start(time, offset, len);
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
  // Load built-in kit onto all pads
  // ------------------------------------------------------------
  function loadKit() {
    var kit = makeKit();
    for (var i = 0; i < PAD_COUNT; i++) {
      setPad(i, kit[i].buffer, kit[i].name);
    }
    syncGridLabels();
    selectPad(0);
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
    el.tempo.addEventListener("input", function () {
      S.bpm = +el.tempo.value;
      el.tempoVal.textContent = S.bpm;
    });
    bindHandle(el.handleStart, "start");
    bindHandle(el.handleEnd, "end");
    window.addEventListener("resize", function () {
      resizeCanvas();
      layoutHandles();
    });
  }

  function resizeCanvas() {
    // keep internal resolution crisp relative to display width
    var w = el.waveWrap.clientWidth;
    el.wave.width = Math.max(300, Math.floor(w));
    drawWave();
  }

  function seedDemoBeat() {
    // a light starter pattern (kick/snare/hat) once a kit is present
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
    // reflect in UI
    el.grid.querySelectorAll(".step").forEach(function (n) {
      var p = +n.dataset.p;
      var s = +n.dataset.s;
      n.classList.toggle("on", !!S.seq[p][s]);
    });
  }

  function init() {
    cache();
    buildPads();
    buildGrid();
    bindGlobal();
    for (var i = 0; i < PAD_COUNT; i++) S.pads[i] = null;
    resizeCanvas();
    layoutHandles();
    updateEditReadout();
    // start with the built-in kit + a demo beat so it's instantly playable
    loadKit();
    seedDemoBeat();
    S.bpm = +el.tempo.value;
    el.tempoVal.textContent = S.bpm;
  }

  // expose a tiny API for later game.js integration
  window.RicoSampler = {
    trigger: triggerPad,
    state: S,
    loadKit: loadKit,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
