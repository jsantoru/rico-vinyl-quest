# Rico Cuts (excited edition)

A self-contained turntable scratch app. Drag the vinyl back and forth to scratch —
forward drag plays audio forward, backward drag plays it in reverse, just like a
real turntable. Release to let it ride.

## Features

- **Scratch engine** — the audio playhead is slaved to your hand (forward =
  forward audio, reverse = reversed audio), with per-sample rate smoothing.
- **Effects bus** — **Filter** (ride a low-pass sweep), **Echo** (feedback
  delay), and **Drive** (saturation) color every scratch live.
- **Six loops** — Funk Beat, Boom Bap, Sine Stab, plus new **Horn Stab**,
  **808 Groove**, and a synthesized **Vocal Phrase**.
- **CUTS counter** — every direction change you make while scratching counts as
  a cut, so you can chase a higher number.
- **Living visuals** — the tonearm swings down onto the record when the deck is
  spinning, and the platter glows gold that brightens with scratch speed.

## Files

- `index.html` — markup for the deck, record, tonearm, FX, and controls
- `style.css` — all styling
- `game.js` — the scratch engine (Web Audio) + FX bus + drag handling + visuals

No audio files are required. All six loops are synthesized in `game.js` at
runtime.

## Run it

Open `index.html` in a browser, or serve the folder with any static server:

```bash
npx serve .
```

Audio starts on your first interaction (browser autoplay policy).

## Controls

- **Play/Stop** — start/stop the free-running loop
- **Volume** — master output
- **Base Pitch** — normal playback speed when not scratching (0.5x–1.5x)
- **Loop** — switch between the six synthesized beats
- **Filter / Echo / Drive** — sweep the effects bus while you scratch
- **Drag the record** — scratch (mouse or touch)
- **Arrow keys** — nudge the record (accessibility)

## Embedding into your own game.js

The important pieces to lift:

1. `ScratchEngine` = the `onAudioProcess` callback. It keeps a fractional
   `playhead` and advances it by `rate` samples each output sample, with linear
   interpolation and looping. `rate` can be negative for reverse.
2. The pointer → rate mapping in `attachDragHandlers()`. It converts the
   record's angular velocity (rad/s) into a playback multiplier where `1.0x` ==
   normal spin speed (`ANG_VEL_NORMAL`).
3. `buildFX()` / `applyFx()` — the effects bus (filter → drive → master, plus
   an echo send) sitting after the scratch node.
4. `window.RicoCuts.state` exposes the live engine state for debugging.

Swap the synthesized buffers for your own loops by assigning a `Float32Array`
(mono) to `state.buffers[name]` and adding it to the `<select id="track">`.