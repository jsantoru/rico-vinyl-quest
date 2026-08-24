# Rico Cuts

A self-contained turntable scratch app. Drag the vinyl back and forth to scratch —
forward drag plays audio forward, backward drag plays it in reverse, just like a
real turntable. Release to let it ride.

## Files

- `index.html` — markup for the deck, record, tonearm, and controls
- `style.css` — all styling
- `game.js` — the scratch engine (Web Audio) + drag handling + visuals

No audio files are required. The loops (Funk Beat, Boom Bap, Sine Stab) are
synthesized in `game.js` at runtime.

## Run it

Just open `index.html` in a browser, or serve the folder with any static server:

```bash
npx serve .
```

Audio starts on your first interaction (browser autoplay policy).

## Controls

- **Play/Stop** — start or stop the free-running loop
- **Volume** — master output
- **Base Pitch** — normal playback speed when not scratching (0.5x–1.5x)
- **Loop** — switch between the three synthesized beats
- **Drag the record** — scratch (mouse or touch)
- **Arrow keys** — nudge the record (accessibility)

## Embedding into your own game.js

The important pieces to lift:

1. `ScratchEngine` = the `onAudioProcess` callback. It keeps a fractional
   `playhead` and advances it by `rate` samples each output sample, with linear
   interpolation and looping. `rate` can be negative for reverse.
2. The pointer → rate mapping in `attachDragHandlers()`. It converts the record's
   angular velocity (rad/s) into a playback multiplier where `1.0x` == normal
   spin speed (`ANG_VEL_NORMAL`).
3. `window.RicoCuts.state` exposes the live engine state for debugging.

Swap the synthesized buffers for your own decoded audio by assigning a
`Float32Array` (mono) to `state.buffers[name]`.
