# Rico's Pocket Sampler

A simplified, Koala-style sampler in a single vanilla HTML/CSS/JS app. No build
step, no dependencies — just the Web Audio API.

## Features

- **8 sound pads** — tap to play and select. Ships with a built-in synthesized
  drum kit so it's playable instantly.
- **Sampling** — record from the mic (`Record`) or import any audio file
  (`Load Audio`). New audio lands on the currently selected pad.
- **Waveform editor + chopping** — drag the gold handles to set a start/end
  region, `Play` to audition it, `Apply Trim` to bake the region into the pad,
  or `Chop -> 8 Pads` to slice the selection into 8 equal hits across the kit.
- **16-step sequencer** — one row per pad, adjustable BPM (60-180), with a
  look-ahead scheduler for tight timing. Comes seeded with a starter beat.

## Run it

Open `index.html` in any modern browser, or serve the folder:

```bash
npx serve .
```

Microphone recording requires `https://` or `localhost`.

## Files

| File         | Purpose                                             |
| ------------ | --------------------------------------------------- |
| `index.html` | Layout: pads, editor, sequencer                     |
| `style.css`  | All styling (dark + gold theme)                     |
| `game.js`    | Audio engine, chopping, sequencer — the file to lift |

## Integrating into your own `game.js`

Everything is wrapped in an IIFE with state on the `S` object. The reusable
pieces:

- **`makeKit()` / `renderTone()`** — procedural drum synthesis; swap for your
  own decoded `AudioBuffer`s by calling `setPad(i, buffer, name)`.
- **`chopToPads()`** — the slicing routine: splits the selected region into
  `PAD_COUNT` equal `AudioBuffer`s.
- **`applyTrim()`** — bakes a start/end region into a shorter buffer.
- **Look-ahead scheduler** — `scheduler()` / `scheduleStep()` drive the
  sequencer with sample-accurate `src.start(time, ...)` scheduling.

A small global API is exposed for external triggering:

```js
RicoSampler.trigger(0); // play pad 1
RicoSampler.loadKit(); // reload the built-in kit
RicoSampler.state; // full internal state (pads, seq, bpm, ...)
```
