# Rico's Vinyl Quest

An NES-style, Zelda-inspired crate-digging adventure. You are Rico, a beatmaker
with an empty sampler and a beat that's due. Five legendary records are hidden
around town — in record shop crates, a diner backroom, a thrift store, and a
flea market stall. Dig them all up to finish the beat.

Every record you find adds a real audio layer to the town's music (Web Audio
chiptune engine): drums, bassline, horn stabs, vocal chops, and a lead melody.
By the end, the whole town is bumping your track.

## How to play

Open `index.html` in a browser, or serve the folder:

```
cd rico-vinyl-quest
python3 -m http.server 8000
# open http://localhost:8000
```

## Controls

| Key | Action |
| --- | --- |
| Arrows / WASD | Move |
| E (or Z / Enter / Space) | Talk, dig crates, advance dialog |
| B | Skateboard on/off (outdoors only — faster!) |
| M | Mute music |

## Tips

- Shopkeepers drop hints about which crates hold the goods.
- Most crates are junk. That's crate digging, baby.
- The fifth record has no sleeve and no name. Check the flea market.

## Tech

- Single HTML page + vanilla JS canvas, no dependencies.
- `assets/rico.png` — 4-direction, 3-frame walk cycle sprite sheet.
- Music is generated live with the Web Audio API; each collected sample
  enables another layer in a 92 BPM two-bar loop.
