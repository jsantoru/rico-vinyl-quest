# Rico's Vinyl Quest - Desktop & Mobile Build Setup

## Quick Start

### Desktop (Electron)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run desktop dev version:**
   ```bash
   npm start
   ```

3. **Build for your OS:**
   ```bash
   npm run build:win   # Windows
   npm run build:mac   # macOS
   npm run build:linux # Linux
   ```

### Mobile (Capacitor)

#### Android Setup

1. **Install Android SDK** (via Android Studio)

2. **Initialize mobile project:**
   ```bash
   npm run mobile:init
   ```

3. **Add Android platform:**
   ```bash
   npm run mobile:add:android
   ```

4. **Sync files:**
   ```bash
   npm run mobile:sync
   ```

5. **Build APK:**
   ```bash
   npm run mobile:build:android
   ```

6. **Or open in Android Studio:**
   ```bash
   npx capacitor open android
   ```

#### iOS Setup (macOS only)

1. **Install Xcode** from App Store

2. **Add iOS platform:**
   ```bash
   npm run mobile:add:ios
   ```

3. **Sync files:**
   ```bash
   npm run mobile:sync
   ```

4. **Build:**
   ```bash
   npm run mobile:build:ios
   ```

5. **Or open in Xcode:**
   ```bash
   npx capacitor open ios
   ```

## Project Structure

```
├── electron/          # Electron main process
│   ├── main.js       # Electron window setup
│   └── preload.js    # Context isolation
├── index.html        # Web entry point
├── game.js           # Your game code
├── assets/           # Game assets
├── android/          # Android app (generated)
├── ios/              # iOS app (generated)
└── package.json      # Dependencies & scripts
```

## Performance Testing Workflow

1. **Test on Desktop First:**
   - Run `npm start` to launch Electron app
   - Use DevTools (Ctrl+Shift+I) to monitor performance
   - Test all game features

2. **Test on Mobile:**
   - Deploy to Android emulator or device
   - Use Chrome DevTools for WebView debugging
   - Monitor FPS and memory usage

3. **iOS Testing:**
   - Deploy to simulator or iPhone via Xcode
   - Use Xcode console for logging

## Debugging

### Desktop
- DevTools automatically open in dev mode
- Use console.log() in game.js

### Android
- Enable USB Debugging on device
- Use Chrome DevTools: `chrome://inspect/#devices`

### iOS
- Use Xcode console output
- Connect device via Xcode

## Notes

- Game canvas is responsive and maintains 8:5 aspect ratio
- Ensure all assets are in the `assets/` folder
- For production builds, update app version in `package.json`
