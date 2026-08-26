/* ============================================================
   Rico's Keys - Touchscreen Piano
   Standalone Web Audio synth. No external files required.

   Public API (attached to window.RicoKeys):
     RicoKeys.noteOn(midi)      -> trigger a note by MIDI number
     RicoKeys.noteOff(midi)     -> release a note
     RicoKeys.setVoice(name)    -> 'rhodes'|'triangle'|'sawtooth'|'square'|'sine'|'organ'
     RicoKeys.setOctave(n)      -> base octave (1..7)
     RicoKeys.setTranspose(s)   -> semitone shift (-11..+11)
     RicoKeys.setVolume(0..1)   -> master gain
     RicoKeys.recorder          -> { toggle(), play(), clear(), exportWav() }
     RicoKeys.state             -> live state object
   Settings (voice, octave, transpose, volume, sustain, labels) persist
   to localStorage automatically.
   ============================================================ */

(function () {
  "use strict";

  // ---------- State ----------
  const state = {
    ctx: null,
    master: null,
    comp: null,
    voice: "rhodes",
    octave: 4,
    transpose: 0, // semitones, -11..+11
    volume: 0.75,
    sustain: false,
    labels: true,
    voices: {}, // active notes: midi -> { nodes, stop() }
    keyEls: {}, // midi -> element
  };

  // ---------- Persistence ----------
  const SETTINGS_KEY = "rico-keys-settings";
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.voice && VOICES[s.voice]) state.voice = s.voice;
      if (typeof s.octave === "number") state.octave = Math.min(7, Math.max(1, Math.round(s.octave)));
      if (typeof s.transpose === "number") state.transpose = Math.min(11, Math.max(-11, Math.round(s.transpose)));
      if (typeof s.volume === "number") state.volume = Math.min(1, Math.max(0, s.volume));
      if (typeof s.sustain === "boolean") state.sustain = s.sustain;
      if (typeof s.labels === "boolean") state.labels = s.labels;
    } catch (e) { /* ignore corrupt settings */ }
  }
  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        voice: state.voice,
        octave: state.octave,
        transpose: state.transpose,
        volume: state.volume,
        sustain: state.sustain,
        labels: state.labels,
      }));
    } catch (e) { /* storage may be unavailable */ }
  }

  // ---------- Note math ----------
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const WHITE_SET = new Set([0, 2, 4, 5, 7, 9, 11]);

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  function midiToName(midi) {
    const n = NOTE_NAMES[midi % 12];
    const oct = Math.floor(midi / 12) - 1;
    return n + oct;
  }

  // ---------- Audio ----------
  function ensureCtx() {
    if (!state.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      state.ctx = new AC();
      state.master = state.ctx.createGain();
      state.master.gain.value = state.volume;
      // gentle master compression to avoid clipping on chords
      const comp = state.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      state.comp = comp;
      state.master.connect(comp);
      comp.connect(state.ctx.destination);
      // analyser taps the master bus for the spectrum visualizer
      const analyser = state.ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      state.analyser = analyser;
      state.master.connect(analyser);
    }
    if (state.ctx.state === "suspended") state.ctx.resume();
    return state.ctx;
  }

  // Voice presets: return an array of oscillator specs + envelope shape
  const VOICES = {
    sine: { type: "sine", partials: [[1, 1]], attack: 0.005, decay: 0.3, sustain: 0.7, release: 0.4 },
    triangle: { type: "triangle", partials: [[1, 1]], attack: 0.005, decay: 0.4, sustain: 0.6, release: 0.5 },
    sawtooth: { type: "sawtooth", partials: [[1, 0.8]], attack: 0.004, decay: 0.25, sustain: 0.55, release: 0.35 },
    square: { type: "square", partials: [[1, 0.6]], attack: 0.004, decay: 0.2, sustain: 0.5, release: 0.3 },
    organ: {
      type: "sine",
      partials: [[1, 0.8], [2, 0.5], [3, 0.35], [4, 0.2]],
      attack: 0.01, decay: 0.05, sustain: 0.95, release: 0.15,
    },
    rhodes: {
      type: "sine",
      partials: [[1, 1], [2, 0.35], [7, 0.08]],
      attack: 0.005, decay: 0.9, sustain: 0.25, release: 0.6,
    },
  };

  // ---------- Recorder ----------
  // Captures note events (on/off + sustain) for live playback, and taps the
  // master bus for WAV export of whatever you play.
  const recorder = {
    mode: "idle", // 'idle' | 'recording' | 'playing'
    events: [],   // { t, type: 'on'|'off'|'sustain', midi?, value? }
    startCtx: 0,
    playTimers: [],
    // audio capture
    captureNode: null,
    left: [],
    right: [],
    capLen: 0,
    // ui refs (set at boot)
    els: {},

    toggle() {
      if (this.mode === "recording") this.stop();
      else this.begin();
    },

    capture(type, midi, lit, value) {
      if (this.mode !== "recording" || !state.ctx) return;
      this.events.push({
        t: state.ctx.currentTime - this.startCtx,
        type: type,
        midi: midi,
        lit: lit,
        value: value,
      });
    },

    begin() {
      ensureCtx();
      if (this.mode === "playing") this.stopPlay();
      this.mode = "recording";
      this.events = [];
      this.startCtx = state.ctx.currentTime;
      // record the current sustain state so playback starts in the same position
      if (state.sustain) this.events.push({ t: 0, type: "sustain", value: true });
      this.startCapture();
      this.updateUI();
      this.startTick();
    },

    stop() {
      if (this.mode !== "recording") return;
      this.mode = "idle";
      this.stopCapture();
      this.stopTick();
      this.updateUI();
    },

    _tickTimer: null,
    startTick() {
      if (this._tickTimer) clearTimeout(this._tickTimer);
      const step = () => {
        const el = this.els && this.els.time;
        if (el) el.textContent = fmt(state.ctx.currentTime - this.startCtx);
        this._tickTimer = setTimeout(step, 100);
      };
      step();
    },
    stopTick() {
      if (this._tickTimer) { clearTimeout(this._tickTimer); this._tickTimer = null; }
    },

    play() {
      if (!this.events.length) return;
      ensureCtx();
      if (this.mode === "recording") this.stop();
      this._sustainBefore = state.sustain;
      this.mode = "playing";
      const base = state.ctx.currentTime;
      const total = this.events.length ? this.events[this.events.length - 1].t : 0;
      this.playTimers = [];
      this.events.forEach(function (ev) {
        const delay = (ev.t - (state.ctx.currentTime - base)) * 1000;
        const timer = setTimeout(function () {
          if (ev.type === "on") noteOn(ev.midi, ev.lit);
          else if (ev.type === "off") noteOff(ev.midi, ev.lit);
          else if (ev.type === "sustain") setSustain(ev.value);
        }, Math.max(0, delay));
        this.playTimers.push(timer);
      }, this);
      // finish playback after last event + release tail
      const finish = setTimeout(() => { this.stopPlay(); }, (total + 1.2) * 1000);
      this.playTimers.push(finish);
      this.updateUI();
    },

    stopPlay() {
      this.playTimers.forEach(function (t) { clearTimeout(t); });
      this.playTimers = [];
      // release any held playback notes
      Object.keys(state.voices).forEach(function (midi) {
        const v = state.voices[midi];
        if (v && v.playback) { v.stop(); delete state.voices[midi]; }
      });
      // restore the sustain state the user had before playback
      if (state.sustain !== this._sustainBefore) setSustain(this._sustainBefore);
      this.mode = "idle";
      this.updateUI();
    },

    clear() {
      this.stopPlay();
      this.stop();
      this.events = [];
      this.clearCapture();
      this.updateUI();
    },

    startCapture() {
      const ctx = state.ctx;
      const node = ctx.createScriptProcessor(2048, 2, 2);
      this.buf = [];
      this.capLen = 0;
      node.onaudioprocess = (function (rec) {
        return function (e) {
          rec.buf.push([
            e.inputBuffer.getChannelData(0).slice(),
            e.inputBuffer.getChannelData(1).slice(),
          ]);
          rec.capLen += e.inputBuffer.length;
        };
      })(this);
      state.master.disconnect(state.comp);
      state.master.connect(node);
      node.connect(state.comp);
      this.captureNode = node;
    },

    stopCapture() {
      if (!this.captureNode) return;
      state.master.disconnect(this.captureNode);
      this.captureNode.disconnect();
      this.captureNode = null;
      state.master.connect(state.comp);
    },

    clearCapture() {
      this.buf = [];
      this.capLen = 0;
    },

    exportWav() {
      ensureCtx();
      const sr = state.ctx.sampleRate;
      const frames = this.capLen;
      if (!frames || !this.buf.length) {
        if (this.els) this.els.status.textContent = "Nothing captured yet";
        return;
      }
      const data = encodeWav(this.buf, frames, sr);
      const blob = new Blob([data], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "rico-keys-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".wav";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 500);
      if (this.els) this.els.status.textContent = "WAV saved";
    },

    updateUI() {
      const els = this.els;
      if (!els) return;
      const rec = this.mode === "recording";
      els.record.classList.toggle("is-on", rec);
      els.record.textContent = rec ? "Stop" : "\u25CF Record";
      els.play.disabled = rec || !this.events.length;
      els.exportWav.disabled = !this.capLen || rec || this.mode === "playing";
      els.clear.disabled = rec;
      els.wrap.classList.toggle("recording", rec);
      els.status.textContent =
        this.mode === "recording" ? "Recording" :
        this.mode === "playing" ? "Playing" :
        (this.events.length ? this.events.filter(function (e) { return e.type === "on"; }).length + " notes" : "Ready");
      if (this.mode !== "recording" && this.events.length) {
        els.time.textContent = fmt(this.events[this.events.length - 1].t);
      }
    },
  };

  function fmt(s) {
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(1);
    return m + ":" + (sec < 10 ? "0" : "") + sec;
  }

  function encodeWav(chunks, frames, sampleRate) {
    const numChannels = 2;
    const bytesPerSample = 2;
    const dataSize = frames * numChannels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    function wstr(off, str) {
      for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
    }
    wstr(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); wstr(8, "WAVE");
    wstr(12, "fmt "); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);                 // PCM
    view.setUint16(22, numChannels, true);       // channels
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, 16, true);                // bits per sample
    wstr(36, "data"); view.setUint32(40, dataSize, true);
    let off = 44;
    let sofar = 0;
    for (let c = 0; c < chunks.length; c++) {
      const chunk = chunks[c];
      const n = chunk[0].length;
      for (let k = 0; k < n; k++) {
        const l = chunk[0][k];
        const r = chunk[1][k];
        const clamp = function (v) { return Math.max(-1, Math.min(1, v)); };
        view.setInt16(off, clamp(l) < 0 ? clamp(l) * 0x8000 : clamp(l) * 0x7FFF, true);
        view.setInt16(off + 2, clamp(r) < 0 ? clamp(r) * 0x8000 : clamp(r) * 0x7FFF, true);
        off += 4;
      }
      sofar += n;
    }
    return buffer;
  }

  // ---------- Synth ----------
  // `lit` is the on-screen key to light (defaults to `midi`). This lets
  // transposed notes sound at `midi` while the visible key stays lit.
  function noteOn(midi, lit) {
    ensureCtx();
    if (state.voices[midi]) return; // already sounding
    const ctx = state.ctx;
    const now = ctx.currentTime;
    const preset = VOICES[state.voice] || VOICES.sine;
    const freq = midiToFreq(midi);

    const noteGain = ctx.createGain();
    noteGain.gain.value = 0;
    noteGain.connect(state.master);

    const oscs = [];
    const peak = 0.9 / Math.max(1, preset.partials.length); // headroom per partial
    preset.partials.forEach(function (p) {
      const mult = p[0];
      const amp = p[1];
      const osc = ctx.createOscillator();
      osc.type = preset.type;
      osc.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.value = amp * peak;
      osc.connect(g);
      g.connect(noteGain);
      osc.start(now);
      oscs.push(osc);
    });

    // ADSR attack + decay to sustain
    noteGain.gain.cancelScheduledValues(now);
    noteGain.gain.setValueAtTime(0, now);
    noteGain.gain.linearRampToValueAtTime(1, now + preset.attack);
    noteGain.gain.linearRampToValueAtTime(preset.sustain, now + preset.attack + preset.decay);

    const voice = {
      oscs: oscs,
      gain: noteGain,
      preset: preset,
      playback: recorder.mode === "playing",
      stop: function () {
        const t = ctx.currentTime;
        const rel = preset.release;
        noteGain.gain.cancelScheduledValues(t);
        noteGain.gain.setValueAtTime(noteGain.gain.value, t);
        noteGain.gain.linearRampToValueAtTime(0.0001, t + rel);
        oscs.forEach(function (o) {
          o.stop(t + rel + 0.02);
        });
        setTimeout(function () {
          try { noteGain.disconnect(); } catch (e) {}
        }, (rel + 0.1) * 1000);
      },
    };

    state.voices[midi] = voice;
    litKey(lit != null ? lit : midi, true);
    setNowPlaying(midiToName(midi));
    recorder.capture("on", midi, lit != null ? lit : midi);
  }

  function noteOff(midi, lit) {
    const voice = state.voices[midi];
    if (!voice) return;
    litKey(lit != null ? lit : midi, false);
    recorder.capture("off", midi, lit != null ? lit : midi);
    if (state.sustain) {
      // hold until sustain released; mark as pending
      voice.pendingRelease = true;
      return;
    }
    voice.stop();
    delete state.voices[midi];
  }

  function releaseSustained() {
    Object.keys(state.voices).forEach(function (midi) {
      const v = state.voices[midi];
      if (v.pendingRelease) {
        v.stop();
        delete state.voices[midi];
      }
    });
  }

  function litKey(midi, on) {
    const el = state.keyEls[midi];
    if (el) el.classList.toggle("lit", on);
  }

  // ---------- Keyboard build ----------
  const kb = document.getElementById("keyboard");
  const WHITE_COUNT = 14; // two octaves of white keys

  function buildKeyboard() {
    kb.innerHTML = "";
    state.keyEls = {};
    const base = (state.octave + 1) * 12; // MIDI for C of base octave
    const whiteMidis = [];
    let m = base;
    while (whiteMidis.length < WHITE_COUNT) {
      if (WHITE_SET.has(m % 12)) whiteMidis.push(m);
      m++;
    }

    // white keys
    whiteMidis.forEach(function (midi) {
      const el = document.createElement("div");
      el.className = "key white";
      el.dataset.midi = String(midi);
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = midiToName(midi);
      el.appendChild(label);
      kb.appendChild(el);
      state.keyEls[midi] = el;
    });

    // black keys positioned relative to white keys
    const whiteWidthPct = 100 / WHITE_COUNT;
    whiteMidis.forEach(function (midi, i) {
      const semitone = midi % 12;
      // black key follows C, D, F, G, A (not E, B)
      if (semitone === 0 || semitone === 2 || semitone === 5 || semitone === 7 || semitone === 9) {
        const blackMidi = midi + 1;
        // don't add a trailing black key past our range
        if (i === WHITE_COUNT - 1) return;
        const el = document.createElement("div");
        el.className = "key black";
        el.dataset.midi = String(blackMidi);
        el.style.left = (i + 1) * whiteWidthPct + "%";
        const label = document.createElement("span");
        label.className = "label";
        label.textContent = NOTE_NAMES[blackMidi % 12];
        el.appendChild(label);
        kb.appendChild(el);
        state.keyEls[blackMidi] = el;
      }
    });

    kb.classList.toggle("no-labels", !state.labels);
  }

  // ---------- Pointer handling (touch + mouse, with glissando) ----------
  const pointerNotes = {}; // pointerId -> midi currently held by that pointer

  function midiFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const keyEl = el.closest ? el.closest(".key") : null;
    if (!keyEl) return null;
    return parseInt(keyEl.dataset.midi, 10);
  }

  function onPointerDown(e) {
    ensureCtx();
    const visual = midiFromPoint(e.clientX, e.clientY);
    if (visual == null) return;
    pointerNotes[e.pointerId] = visual;
    noteOn(visual + state.transpose, visual);
    hideHint();
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!(e.pointerId in pointerNotes)) return;
    const visual = midiFromPoint(e.clientX, e.clientY);
    const prev = pointerNotes[e.pointerId];
    if (visual == null || visual === prev) return;
    // glissando: release previous, sound new
    noteOff(prev + state.transpose, prev);
    pointerNotes[e.pointerId] = visual;
    noteOn(visual + state.transpose, visual);
  }

  function onPointerUp(e) {
    const visual = pointerNotes[e.pointerId];
    if (visual == null) return;
    noteOff(visual + state.transpose, visual);
    delete pointerNotes[e.pointerId];
  }

  kb.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  // ---------- Computer keyboard mapping ----------
  // A S D F G H J K L -> white keys; W E T Y U O P -> black keys
  const KEYMAP = {
    a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6,
    g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14,
  };
  const heldKeys = {};

  window.addEventListener("keydown", function (e) {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === "z") { adjustOctave(-1); return; }
    if (k === "x") { adjustOctave(1); return; }
    if (!(k in KEYMAP)) return;
    const visual = (state.octave + 1) * 12 + KEYMAP[k];
    heldKeys[k] = visual;
    noteOn(visual + state.transpose, visual);
    hideHint();
  });

  window.addEventListener("keyup", function (e) {
    const k = e.key.toLowerCase();
    if (!(k in heldKeys)) return;
    noteOff(heldKeys[k] + state.transpose, heldKeys[k]);
    delete heldKeys[k];
  });

  // ---------- Controls wiring ----------
  const waveSel = document.getElementById("waveSel");
  const octaveVal = document.getElementById("octaveVal");
  const octUp = document.getElementById("octUp");
  const octDown = document.getElementById("octDown");
  const transposeVal = document.getElementById("transposeVal");
  const transUp = document.getElementById("transUp");
  const transDown = document.getElementById("transDown");
  const transReset = document.getElementById("transReset");
  const volume = document.getElementById("volume");
  const volVal = document.getElementById("volVal");
  const sustainBtn = document.getElementById("sustainBtn");
  const labelsBtn = document.getElementById("labelsBtn");
  const nowPlaying = document.getElementById("nowPlaying");
  const hint = document.getElementById("powerHint");

  waveSel.addEventListener("change", function () {
    state.voice = waveSel.value;
    saveSettings();
  });

  function adjustOctave(delta) {
    const next = Math.min(7, Math.max(1, state.octave + delta));
    if (next === state.octave) return;
    // release everything to avoid stuck notes across rebuild
    Object.keys(state.voices).forEach(function (midi) {
      state.voices[midi].stop();
      delete state.voices[midi];
    });
    state.octave = next;
    octaveVal.textContent = String(next);
    buildKeyboard();
    saveSettings();
  }

  function fmtTranspose(t) {
    return (t > 0 ? "+" : "") + t;
  }

  function adjustTranspose(delta) {
    const next = Math.min(11, Math.max(-11, state.transpose + delta));
    if (next === state.transpose) return;
    // release all notes so none hang at the old pitch
    Object.keys(state.voices).forEach(function (midi) {
      state.voices[midi].stop();
      delete state.voices[midi];
    });
    state.transpose = next;
    transposeVal.textContent = fmtTranspose(next);
    saveSettings();
  }

  octUp.addEventListener("click", function () { adjustOctave(1); });
  octDown.addEventListener("click", function () { adjustOctave(-1); });
  transUp.addEventListener("click", function () { adjustTranspose(1); });
  transDown.addEventListener("click", function () { adjustTranspose(-1); });
  transReset.addEventListener("click", function () { adjustTranspose(-state.transpose); });

  volume.addEventListener("input", function () {
    state.volume = volume.value / 100;
    volVal.textContent = volume.value;
    if (state.master) state.master.gain.value = state.volume;
    saveSettings();
  });

  function setSustain(on) {
    state.sustain = on;
    sustainBtn.classList.toggle("is-on", on);
    sustainBtn.setAttribute("aria-pressed", String(on));
    if (!on) releaseSustained();
    saveSettings();
  }

  sustainBtn.addEventListener("click", function () {
    setSustain(!state.sustain);
    recorder.capture("sustain", null, null, state.sustain);
  });

  labelsBtn.addEventListener("click", function () {
    state.labels = !state.labels;
    labelsBtn.classList.toggle("is-on", state.labels);
    labelsBtn.setAttribute("aria-pressed", String(state.labels));
    kb.classList.toggle("no-labels", !state.labels);
    saveSettings();
  });

  hint.addEventListener("click", function () {
    ensureCtx();
    hideHint();
  });

  let hintHidden = false;
  function hideHint() {
    if (hintHidden) return;
    hintHidden = true;
    hint.textContent = "Playing";
  }

  let nowPlayingTimer = null;
  function setNowPlaying(name) {
    nowPlaying.textContent = name;
    if (nowPlayingTimer) clearTimeout(nowPlayingTimer);
    nowPlayingTimer = setTimeout(function () {
      nowPlaying.textContent = "Ready";
    }, 1200);
  }

  // ---------- Recorder UI wiring ----------
  const recRecord = document.getElementById("recRecord");
  const recPlay = document.getElementById("recPlay");
  const recExport = document.getElementById("recExport");
  const recClear = document.getElementById("recClear");
  const recTime = document.getElementById("recTime");
  const recStatus = document.getElementById("recStatus");

  recorder.els = {
    record: recRecord, play: recPlay, exportWav: recExport, clear: recClear,
    time: recTime, status: recStatus,
    wrap: document.querySelector(".recorder"),
  };

  recRecord.addEventListener("click", function () {
    if (recorder.mode === "recording") recorder.stop();
    else recorder.toggle();
  });

  recPlay.addEventListener("click", function () { recorder.play(); });
  recExport.addEventListener("click", function () { recorder.exportWav(); });
  recClear.addEventListener("click", function () { recorder.clear(); });

  // ---------- Spectrum visualizer ----------
  const spectrumCanvas = document.getElementById("spectrum");
  let spectrumRunning = false;
  function startSpectrum() {
    if (spectrumRunning || !spectrumCanvas) return;
    spectrumRunning = true;
    const ctx = spectrumCanvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const draw = () => {
      if (!state.analyser) { requestAnimationFrame(draw); return; }
      const width = spectrumCanvas.clientWidth || 300;
      const height = spectrumCanvas.clientHeight || 90;
      if (spectrumCanvas.width !== Math.round(width * dpr)) {
        spectrumCanvas.width = Math.round(width * dpr);
        spectrumCanvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const bins = new Uint8Array(state.analyser.frequencyBinCount);
      state.analyser.getByteFrequencyData(bins);
      const barW = width / bins.length;
      for (let i = 0; i < bins.length; i++) {
        const v = bins[i] / 255;
        const h = Math.max(1, v * height);
        const hue = 40 + v * 10; // 40 (gold) -> 50 (yellower gold)
        ctx.fillStyle = "hsla(" + hue + ", 80%, " + (40 + v * 30) + "%, 0.95)";
        ctx.fillRect(i * barW, height - h, Math.max(1, barW - 0.5), h);
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  // ---------- Boot ----------
  loadSettings();
  // apply persisted settings to the UI
  waveSel.value = state.voice;
  octaveVal.textContent = String(state.octave);
  transposeVal.textContent = fmtTranspose(state.transpose);
  volume.value = String(Math.round(state.volume * 100));
  volVal.textContent = volume.value;
  sustainBtn.classList.toggle("is-on", state.sustain);
  sustainBtn.setAttribute("aria-pressed", String(state.sustain));
  labelsBtn.classList.toggle("is-on", state.labels);
  labelsBtn.setAttribute("aria-pressed", String(state.labels));

  buildKeyboard();
  recorder.updateUI();
  startSpectrum();

  // ---------- Public API ----------
  window.RicoKeys = {
    noteOn: noteOn,
    noteOff: noteOff,
    setVoice: function (name) {
      if (VOICES[name]) { state.voice = name; waveSel.value = name; }
    },
    setOctave: function (n) { adjustOctave(n - state.octave); },
    setTranspose: function (semi) {
      const n = Math.min(11, Math.max(-11, Math.round(semi)));
      adjustTranspose(n - state.transpose);
    },
    setVolume: function (v) {
      state.volume = Math.min(1, Math.max(0, v));
      volume.value = String(Math.round(state.volume * 100));
      volVal.textContent = volume.value;
      if (state.master) state.master.gain.value = state.volume;
      saveSettings();
    },
    recorder: {
      toggle: function () {
        if (recorder.mode === "recording") recorder.stop();
        else recorder.toggle();
      },
      play: function () { recorder.play(); },
      clear: function () { recorder.clear(); },
      exportWav: function () { recorder.exportWav(); },
    },
    midiToFreq: midiToFreq,
    midiToName: midiToName,
    state: state,
  };
})();