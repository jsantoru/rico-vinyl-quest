# Rico's EQ

A standalone EQ practice trainer built with the Web Audio API. No audio files,
no build step, no dependencies — just open `index.html`.

## Files

- `index.html` — layout: transport, analyzer/curve canvas, 5-band EQ, trainer
- `style.css` — dark/gold theme
- `game.js` — the audio graph, parametric EQ, curve drawing, and match game
- `README.md` — this file

## Run it

Open `index.html` in any modern browser, or serve the folder:

```bash
npx serve .
```

Audio starts on first interaction (browser autoplay policy), so tap Play or the
hint button to begin.

## What it does

A real 5-band parametric EQ (low shelf, three peaking bells, high shelf) sits on
a live sound source. You can EQ it two ways:

- **Free Play** — just listen and shape the tone. Great for learning what each
  frequency band *sounds* like. Use **Bypass** to A/B against flat.
- **Match Game** — the app applies a hidden EQ move (1–2 bands, boosted or cut).
  Hit **Hear Target** to audition it, then dial your own bands to match the tone
  by ear. **Check Match** scores how close your curve is to the hidden one and
  reveals the target as a green dashed line.

## Controls

- **Source** — pink noise, white noise, a synthesized drum loop, or a repeating
  sweep tone.
- **Volume** — master gain.
- **Play / Stop** and **Bypass EQ**.
- **Bands** — drag the numbered dots directly on the graph, or use the vertical
  gain sliders. Peaking bands also expose a **Q** (width) slider.

## How it works

Each band is a `BiquadFilterNode`. The signal chain is:

```
source -> [hidden target biquads] -> [your 5 biquads] -> analyser -> master -> out
```

The green analyzer fill is the live spectrum from an `AnalyserNode`. The gold
curve is computed analytically from the band settings (`totalResponseDb`) so it
stays smooth regardless of FFT size. Scoring in the match game samples both the
target and user curves at nine log-spaced frequencies and averages the absolute
dB error.

## Embedding into your own game.js

The engine exposes a small global API so you can drive it from your own code:

```js
RicoEQ.play();
RicoEQ.stop();
RicoEQ.setBand(2, 6, 1.4);   // band index, gain dB, optional Q
RicoEQ.setSource("drums");
RicoEQ.newChallenge();        // start a match-game round
RicoEQ.responseDb(1000);      // EQ gain at 1 kHz, in dB
RicoEQ.reset();               // flatten all bands
RicoEQ.state;                 // live state object
RicoEQ.BANDS;                 // band frequency/type table
```

The reusable core to lift is the biquad chain in `initAudio()`, `applyUserBands()`
(smoothed parameter updates), the `totalResponseDb` curve math, and the
`newChallenge` / `checkMatch` scoring logic if you want the ear-training game.
To EQ real audio instead of the built-in sources, connect your own node into
`chainInput()` rather than the synthesized noise/drum/tone sources.
