# Rico Lab — deploy to GitHub Pages

This folder is a ready-to-publish static site: a landing page (`index.html`)
linking out to your four tools (`rico-keys/`, `rico-eq/`, `rico-cuts/`,
`rico-pocket-sampler/`). Nothing to build — GitHub Pages can serve it as-is.

## Option A — new repo, from the command line

```bash
cd rico-lab-site          # this folder
git init
git add .
git commit -m "Rico Lab site"
git branch -M main
git remote add origin https://github.com/<your-username>/rico-lab.git
git push -u origin main
```

Then on GitHub: **Settings → Pages → Source → Deploy from a branch →
`main` / `(root)` → Save**. Your site goes live at:

```
https://<your-username>.github.io/rico-lab/
```

(First deploy usually takes 1–2 minutes.)

## Option B — add to an existing repo

Copy `index.html`, `rico-keys/`, `rico-eq/`, `rico-cuts/`, and
`rico-pocket-sampler/` into the repo (root, or a subfolder like `/tools`).
Commit and push, then enable Pages the same way as above. If you put it in
a subfolder, your URL becomes `https://<username>.github.io/<repo>/tools/`.

## Option C — no local git, upload via github.com

1. Create a new repo on github.com (public, so Pages is free).
2. Use **Add file → Upload files**, drag in `index.html` and the four
   tool folders (drag each folder in individually — GitHub preserves
   the folder structure).
3. Commit, then enable Pages as in Option A.

## Notes

- Each tool is fully self-contained (HTML/CSS/JS, no build step, no
  external audio files — everything is synthesized via Web Audio API),
  so nothing else needs configuring.
- Microphone access (used by the Pocket Sampler's Record feature) only
  works over HTTPS or localhost — GitHub Pages serves HTTPS by default,
  so that's covered.
