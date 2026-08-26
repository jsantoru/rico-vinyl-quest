# Rico Cuts (worklet edition)

A self-contained turntable scratch app. Drag the vinyl back and forth to scratch —
forward drag plays audio forward, backward drag plays it in reverse, just like a
real turntable. Release to let it ride.

## Features

- **Scratch engine** — the audio playhead is slaved to your hand (forward =
  forward audio, reverse = reversed audio), with per-sample rate smoothing.
- **Low-latency worklet** — the engine runs on an `AudioWorkletProcessor`
  (inlined as a Blob URL), replacing the deprecated `ScriptProcessorNode` so
  the audio tracks your hand with minimal latency. On browsers without
  AudioWorklet it **automatically falls back** to a `ScriptProcessorNode`
  running the same logic, so the app still works on older browsers.
- **Load your own sample** — drag & drop or pick any audio file (.wav/.mp3/
  .ogg/.m4a/.aiff/.flac) to decode it into the scratch buffer.
- **Effects bus** — **Filter**, **Echo**, and **Drive** color every scratch live.
- **Six loops** — Funk Beat, Boom Bap, Sine Stab, Horn Stab, 808 Groove, and a
  synthesized Vocal Phrase.
- **CUTS counter** — every direction change while scratching counts as a cut.
- **Record & download** — hit the red **Record** button, scratch, then stop to
  export your session as a 16-bit stereo **.wav** (with the current FX applied,
  rendered offline).
- **Vinyl ambience** — a toggle adds subtle **crackle** (filtered noise with
  occasional pops) plus a **needle-drop** thump when the tonearm lands.
- **Living visuals** — the tonearm swings down when the deck spins, and the
  platter glows gold that brightens with scratch speed.
- **Waveform ring** — the loop's transients are drawn as a ring of peaks around
  the record, with a red **playhead marker** that tracks the audio. **Tap the
  ring** to jump the playhead to that spot in the loop.

## Files

- `index.html` — markup for the deck, record, tonearm, FX, and controls
- `style.css` — all styling
- `game.js` — the worklet scratch engine (Web Audio) + FX bus + drag handling + visuals

No audio files are required. All six loops are synthesized in `game.js` at
runtime; the "Your sample" row adds your own audio.

## Run it

Open `index.html` in a browser, or serve the folder with any static server:

```bash
npx serve .
```

Audio starts on your first interaction (browser autoplay policy).

## Controls

- **Play/Stop** — start/stop the free-running loop
- **Record** — capture your scratch session and download it as a .wav
- **Volume** — master output
- **Base Pitch** — normal playback speed when not scratching (0.5x–1.5x)
- **Loop** — switch between the six synthesized beats
- **Your sample** — load your own audio to scratch
- **Filter / Echo / Drive** — sweep the effects bus while you scratch
- **Drag the record** — scratch (mouse or touch)
- **Arrow keys** — nudge the record (accessibility)
- **Tap the waveform ring** — jump the playhead to that spot (seek)
- **Vinyl ambience** — toggle crackle + needle-drop on/off

## Embedding into your own game.js

The important pieces to lift:

1. `WORKLET_SOURCE` — the `ScratchProcessor` AudioWorklet class. It keeps a
   fractional `playhead` and advances it by `rate` samples each output sample,
   with linear interpolation and looping. `rate` can be negative for reverse.
2. `sendControl()` / `sendBuffer()` — main→worklet messaging for the live
   `targetRate`, the smoothing coefficient, and the current loop buffer.
3. The pointer → rate mapping in `attachDragHandlers()`, and the time-constant
   `smoothingCoef()` used instead of a fixed per-sample step.
4. `buildFX()` / `applyFx()` — the effects bus after the scratch node.
5. `window.RicoCuts.state` exposes the live engine state for debugging.
   `window.RicoCuts.startRecording()` / `stopRecording()` drive the recorder.

Recording: the app logs every control change (rate + buffer switch) with a real
timestamp while the Record button is on. On stop it re-runs the playhead/smoothing
logic deterministically to a dry mono track, pushes that through the FX graph in an
`OfflineAudioContext`, and encodes the result as a stereo 16-bit WAV.

Swap the synthesized buffers for your own loops by assigning a `Float32Array`
(mono) to `state.buffers[name]` and adding it to the `<select id="track">`.