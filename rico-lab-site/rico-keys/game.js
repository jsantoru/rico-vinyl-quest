/* ============================================================
   Rico's Keys - Touchscreen Piano
   Standalone Web Audio synth. No external files required.

   Public API (attached to window.RicoKeys):
     RicoKeys.noteOn(midi)      -> trigger a note by MIDI number
     RicoKeys.noteOff(midi)     -> release a note
     RicoKeys.setVoice(name)    -> 'rhodes'|'triangle'|'sawtooth'|'square'|'sine'|'organ'
     RicoKeys.setOctave(n)      -> base octave (1..7)
     RicoKeys.setVolume(0..1)   -> master gain
     RicoKeys.state             -> live state object
   ============================================================ */

(function () {
  "use strict";

  // ---------- State ----------
  const state = {
    ctx: null,
    master: null,
    voice: "rhodes",
    octave: 4,
    volume: 0.75,
    sustain: false,
    labels: true,
    voices: {}, // active notes: midi -> { nodes, stop() }
    keyEls: {}, // midi -> element
  };

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
      state.master.connect(comp);
      comp.connect(state.ctx.destination);
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

  function noteOn(midi) {
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
    litKey(midi, true);
    setNowPlaying(midiToName(midi));
  }

  function noteOff(midi) {
    const voice = state.voices[midi];
    if (!voice) return;
    litKey(midi, false);
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
    const midi = midiFromPoint(e.clientX, e.clientY);
    if (midi == null) return;
    pointerNotes[e.pointerId] = midi;
    noteOn(midi);
    hideHint();
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!(e.pointerId in pointerNotes)) return;
    const midi = midiFromPoint(e.clientX, e.clientY);
    const prev = pointerNotes[e.pointerId];
    if (midi == null || midi === prev) return;
    // glissando: release previous, sound new
    noteOff(prev);
    pointerNotes[e.pointerId] = midi;
    noteOn(midi);
  }

  function onPointerUp(e) {
    const midi = pointerNotes[e.pointerId];
    if (midi == null) return;
    noteOff(midi);
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
    const midi = (state.octave + 1) * 12 + KEYMAP[k];
    heldKeys[k] = midi;
    noteOn(midi);
    hideHint();
  });

  window.addEventListener("keyup", function (e) {
    const k = e.key.toLowerCase();
    if (!(k in heldKeys)) return;
    noteOff(heldKeys[k]);
    delete heldKeys[k];
  });

  // ---------- Controls wiring ----------
  const waveSel = document.getElementById("waveSel");
  const octaveVal = document.getElementById("octaveVal");
  const octUp = document.getElementById("octUp");
  const octDown = document.getElementById("octDown");
  const volume = document.getElementById("volume");
  const volVal = document.getElementById("volVal");
  const sustainBtn = document.getElementById("sustainBtn");
  const labelsBtn = document.getElementById("labelsBtn");
  const nowPlaying = document.getElementById("nowPlaying");
  const hint = document.getElementById("powerHint");

  waveSel.addEventListener("change", function () {
    state.voice = waveSel.value;
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
  }

  octUp.addEventListener("click", function () { adjustOctave(1); });
  octDown.addEventListener("click", function () { adjustOctave(-1); });

  volume.addEventListener("input", function () {
    state.volume = volume.value / 100;
    volVal.textContent = volume.value;
    if (state.master) state.master.gain.value = state.volume;
  });

  sustainBtn.addEventListener("click", function () {
    state.sustain = !state.sustain;
    sustainBtn.classList.toggle("is-on", state.sustain);
    sustainBtn.setAttribute("aria-pressed", String(state.sustain));
    if (!state.sustain) releaseSustained();
  });

  labelsBtn.addEventListener("click", function () {
    state.labels = !state.labels;
    labelsBtn.classList.toggle("is-on", state.labels);
    labelsBtn.setAttribute("aria-pressed", String(state.labels));
    kb.classList.toggle("no-labels", !state.labels);
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

  // ---------- Boot ----------
  buildKeyboard();

  // ---------- Public API ----------
  window.RicoKeys = {
    noteOn: noteOn,
    noteOff: noteOff,
    setVoice: function (name) {
      if (VOICES[name]) { state.voice = name; waveSel.value = name; }
    },
    setOctave: function (n) { adjustOctave(n - state.octave); },
    setVolume: function (v) {
      state.volume = Math.min(1, Math.max(0, v));
      volume.value = String(Math.round(state.volume * 100));
      volVal.textContent = volume.value;
      if (state.master) state.master.gain.value = state.volume;
    },
    midiToFreq: midiToFreq,
    midiToName: midiToName,
    state: state,
  };
})();
