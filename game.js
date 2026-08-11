(() => {
'use strict';

// ---------------------------------------------------------------- constants
const TILE = 32;
const VIEW_W = 960, VIEW_H = 600;
const WALK_SPEED = 150, SKATE_SPEED = 285;
const SPR_H = 60, SPR_W = Math.round(60 * 129 / 225); // sheet cell is 129x225

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// ---------------------------------------------------------------- responsive fullscreen canvas
(() => {
  let vp = document.querySelector('meta[name="viewport"]');
  if (!vp) { vp = document.createElement('meta'); vp.name = 'viewport'; document.head.appendChild(vp); }
  vp.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

  const style = document.createElement('style');
  style.textContent = `
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      background: #000; overflow: hidden;
      touch-action: none;
      -webkit-user-select: none; user-select: none;
    }
    #game {
      display: block;
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      image-rendering: pixelated;
      image-rendering: -moz-crisp-edges;
      image-rendering: crisp-edges;
      touch-action: none;
    }
    #touchControls {
      position: fixed; inset: 0; pointer-events: none;
      display: none; z-index: 10;
    }
    @media (pointer: coarse) {
      #touchControls { display: block; }
    }
    #touchControls .tc-btn {
      position: absolute;
      pointer-events: auto;
      display: flex; align-items: center; justify-content: center;
      background: rgba(244,236,216,0.15);
      border: 2px solid rgba(244,236,216,0.55);
      border-radius: 12px;
      color: #f4ecd8;
      font: bold 13px monospace;
      -webkit-user-select: none; user-select: none;
      -webkit-touch-callout: none;
      touch-action: none;
    }
    #touchControls .tc-btn:active { background: rgba(244,236,216,0.35); }
    #dpadUp    { left: 68px;  bottom: 156px; width: 56px; height: 56px; font-size: 18px; }
    #dpadDown  { left: 68px;  bottom: 88px;  width: 56px; height: 56px; font-size: 18px; }
    #dpadLeft  { left: 18px;  bottom: 122px; width: 56px; height: 56px; font-size: 18px; }
    #dpadRight { left: 118px; bottom: 122px; width: 56px; height: 56px; font-size: 18px; }
    #btnE { right: 22px;  bottom: 116px; width: 78px; height: 78px; border-radius: 50%; font-size: 20px; }
    #btnB { right: 114px; bottom: 148px; width: 54px; height: 54px; border-radius: 50%; }
    #btnM { right: 114px; bottom: 78px;  width: 54px; height: 54px; border-radius: 50%; }
  `;
  document.head.appendChild(style);

  function fitCanvas() {
    const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
    canvas.style.width = Math.max(1, Math.floor(VIEW_W * scale)) + 'px';
    canvas.style.height = Math.max(1, Math.floor(VIEW_H * scale)) + 'px';
  }
  window.addEventListener('resize', fitCanvas);
  window.addEventListener('orientationchange', fitCanvas);
  fitCanvas();
})();

// ---------------------------------------------------------------- records
const RECORDS = {
  elm:   { title: 'Elm Street Funk',      artist: 'Static Groove',   year: '1974',
           sample: 'Drum Break',  layer: 'drums', color: '#e0a030', pad: 'DRM',
           flavor: 'The drummer lived right on Elm Street. 500 copies pressed, most lost. Not this one.' },
  cola:  { title: 'Cherry Cola Bounce',   artist: 'Rosie & The Fizz', year: '1968',
           sample: 'Bassline',    layer: 'bass',  color: '#d04830', pad: 'BAS',
           flavor: 'A jukebox 45 so greasy it still smells like fries. The bassline walks for days.' },
  stab:  { title: 'Midnight Stab',        artist: 'The Velvet Horns', year: '1977',
           sample: 'Horn Stab',   layer: 'horns', color: '#c04070', pad: 'HRN',
           flavor: 'Four trombones, one take,
