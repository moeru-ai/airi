# stage-pocket and mobile coverage

## Browser-driven mobile layout

Run stage-pocket's web surface on a dedicated HTTPS port:

```bash
pnpm -F @proj-airi/stage-pocket dev:web --host 127.0.0.1 --port 5174
agent-browser --session airi-pocket-web --ignore-https-errors open https://127.0.0.1:5174/settings/models
```

Set a desktop-width viewport while operating the settings page if controls are present in the DOM but visually outside the compact layout:

```bash
agent-browser set viewport 768 1024
```

Follow the shared import contract. After `Pick`, switch to the intended phone viewport before opening the stage and capturing evidence:

```bash
agent-browser set viewport 390 844
agent-browser open https://127.0.0.1:5174/
agent-browser wait 'canvas'
agent-browser screenshot
```

This validates stage-pocket's shared Vue UI and mobile responsive renderer. It does not validate a native file picker, Android WebView, WKWebView, filesystem permission, or Capacitor bridge.

## Android emulator

Run a native Android test only when `adb devices` lists a booted emulator and an automation bridge can inspect its WebView or drive the native picker. Agent-browser requires a reachable Chromium CDP endpoint; do not claim coverage merely because the app launches.

Use `pnpm dev:pocket:android` for the project runtime. Upload each format through the native document picker, return to AIRI, select the imported card, and verify the final renderer plus Logcat. Record “not runnable” when `adb` or a compatible WebView debugging endpoint is unavailable.

## iOS Simulator

Use `pnpm dev:pocket:ios` with a booted Simulator for manual or XCUITest/Appium coverage. WKWebView exposes Safari Web Inspector rather than Chromium CDP, so agent-browser cannot directly automate it.

Do not substitute an agent-browser mobile viewport result for native iOS coverage. Report the browser-driven stage-pocket result and the native Simulator result as separate rows.
