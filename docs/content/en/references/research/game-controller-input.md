# Game controller input for browsers and Electron

Research date: 2026-08-26.

## Decision

No mature WebHID JavaScript library provides one complete API for Joy-Con, DualSense, DualShock, and Xbox controllers.

Use two input layers:

1. Use the browser Gamepad API for common buttons, sticks, triggers, connection state, and basic rumble.
2. Add device-specific WebHID adapters for motion, touchpads, LEDs, advanced haptics, and adaptive triggers.

This design keeps Xbox controllers on the path that browsers and operating systems support best. It also keeps vendor report formats inside device packages.

SDL3 is the closest existing universal native layer. It is not a browser or TypeScript library. An Electron integration needs a native binding or sidecar.

## Why one API is not enough

The [Gamepad specification](https://w3c.github.io/gamepad/) defines normalized axes and buttons. A recognized device can expose the `standard` physical layout.

Chromium contains mappings for Sony, Nintendo, and Microsoft controllers. Its source lists DualShock 4, DualSense, Joy-Con, Switch Pro, and several Xbox models. See the [macOS mapping table](https://chromium.googlesource.com/chromium/src/+/HEAD/device/gamepad/gamepad_standard_mappings_mac.mm), [Linux mapping table](https://chromium.googlesource.com/chromium/src/+/HEAD/device/gamepad/gamepad_standard_mappings_linux.cc), and [Windows mapping table](https://chromium.googlesource.com/chromium/src/+/HEAD/device/gamepad/gamepad_standard_mappings_win.cc).

The reliable common denominator is still buttons and axes. The specification excludes motion sensing from its portable scope. Touch and haptic interfaces exist, but support varies by device, operating system, and browser.

The [WebHID specification](https://wicg.github.io/webhid/) provides raw input, output, and feature reports. It does not interpret vendor report bytes or create a standard controller state.

`requestDevice()` shows a permission dialog. `getDevices()` only returns devices that the origin can already access. WebHID also applies a report blocklist.

Chrome documents WebHID support in Chromium browsers from version 89. Its support table does not list Firefox or Safari. See the [Chrome WebHID guide](https://developer.chrome.com/docs/capabilities/hid).

Electron exposes Chromium WebHID through its session APIs. It supports a custom chooser, origin checks, device permission checks, and permission persistence. See [Electron Device Access](https://www.electronjs.org/docs/latest/tutorial/devices) and the [`Session` API](https://www.electronjs.org/docs/latest/api/session#event-select-hid-device).

## Option comparison

| Option | Coverage | Runtime | Extra features | Maintenance and license | Fit for AIRI |
| --- | --- | --- | --- | --- | --- |
| Browser Gamepad API | Broad standard controllers, including the four target families in Chromium | Browser and Electron renderer | Standard buttons and axes; basic haptics where implemented | Browser platform API; Chromium mappings remain active | Recommended common-input path |
| WebHID API | Any device that Chromium and the operating system permit | Chromium browser and Electron renderer | Raw input, output, and feature reports | Browser platform API with user permission and a blocklist | Recommended transport for device adapters |
| [`dualsense-ts`](https://github.com/nsfm/dualsense-ts) | DualSense and PlayStation Access; no DualShock 4 or DualSense Edge | Browser WebHID; Node uses optional `node-hid` | Motion, touchpad, battery, LEDs, rumble, and adaptive triggers | npm `6.15.38`; active in 2026; npm declares LGPL-3.0 | Strong DualSense option, but the license needs project review |
| [`joy-con-webhid`](https://github.com/tomayac/joy-con-webhid) | Nintendo Joy-Con | Browser WebHID | Buttons, sticks, IMU, LEDs, and rumble | npm `0.11.0`, published 2025-07-17; Apache-2.0 | Best focused Joy-Con candidate |
| [`webhid-ds4`](https://github.com/TheBITLINK/WebHID-DS4) | DualShock 4 | Browser WebHID; USB and Bluetooth | Motion, touchpad, LEDs, and rumble | npm `1.0.5`, published 2026-02-16; MIT | Useful adapter or reference, with device-model limits |
| [`node-hid`](https://github.com/node-hid/node-hid) | Raw HID devices | Node and Electron main; native addon | Raw reports only | npm `3.4.0`, published 2026-07-18; package metadata says `(MIT OR X11)` | Transport only; adds native build and packaging work |
| [SDL3 Gamepad API](https://wiki.libsdl.org/SDL3/CategoryGamepad) | Broad controller database and vendor drivers | Native desktop | Mapping, motion sensors, touchpads, LED, rumble, and trigger rumble | Active in 2026; zlib license | Closest universal backend, but needs a native bridge |
| [`@kmamal/sdl`](https://github.com/kmamal/node-sdl) | SDL2 controller and joystick support | Node and Electron main; native addon | Public controller API exposes mapping, LED, rumble, and trigger rumble | npm `0.11.13`; repository active in 2026; MIT | Promising desktop backend, but it does not expose the full SDL3 gamepad API |
| [`gamepad-node`](https://github.com/monteslu/gamepad-node) | SDL2 mappings exposed as a browser-like Gamepad API | Node 20 or newer | Common input, hot-plug, and rumble | npm `1.5.0`, published 2026-07-02; ISC; small project | Useful experiment, but too new for the core boundary |
| [`JoyShockLibrary`](https://github.com/JibbSmart/JoyShockLibrary) | DualShock 4, DualSense, Joy-Con, and Switch Pro; no Xbox | Native library; distributed Windows DLLs | Unified input, motion, touch, LED, and some rumble | Active in 2026; MIT | Good Sony/Nintendo reference, but not a complete Electron solution |

Package versions and licenses come from the first-party npm metadata for [dualsense-ts](https://registry.npmjs.org/dualsense-ts), [joy-con-webhid](https://registry.npmjs.org/joy-con-webhid), [webhid-ds4](https://registry.npmjs.org/webhid-ds4), [node-hid](https://registry.npmjs.org/node-hid), [`@kmamal/sdl`](https://registry.npmjs.org/%40kmamal%2Fsdl), and [gamepad-node](https://registry.npmjs.org/gamepad-node).

Repository activity was checked through the first-party commit feeds for [dualsense-ts](https://github.com/nsfm/dualsense-ts/commits/main.atom), [joy-con-webhid](https://github.com/tomayac/joy-con-webhid/commits/main.atom), [webhid-ds4](https://github.com/TheBITLINK/WebHID-DS4/commits/master.atom), [node-hid](https://github.com/node-hid/node-hid/commits/master.atom), [SDL](https://github.com/libsdl-org/SDL/commits/main.atom), [`@kmamal/sdl`](https://github.com/kmamal/node-sdl/commits/master.atom), [gamepad-node](https://github.com/monteslu/gamepad-node/commits/main.atom), and [JoyShockLibrary](https://github.com/JibbSmart/JoyShockLibrary/commits/master.atom).

## Candidate notes

### Gamepad API

Use this API first when AIRI only needs directional input and actions. Chromium already owns platform-specific mappings and transport differences.

Read `gamepad.mapping` before using the standard indices. Keep a remapping path for devices that return an empty mapping.

Do not infer the printed face-button label from a standard index. The standard layout describes physical positions. Nintendo and Xbox print different labels in the same positions.

### Existing browser implementation patterns

The [Google Chrome Stadia sample](https://github.com/GoogleChrome/samples/blob/gh-pages/stadia-controller-webhid-gamepad/script.js) uses both browser APIs. The Gamepad API supplies standard input. WebHID supplies buttons that the Gamepad API omits.

The sample opens an already-granted HID device through `navigator.hid.getDevices()`. A user action calls `navigator.hid.requestDevice()` for the first grant. The sample reads Gamepad API state in `requestAnimationFrame`.

The sample starts HID reconnection after `gamepadconnected`. AIRI cannot copy this trigger. Electron 41 does not emit that event for the tested Bluetooth DualSense.

[`dualsense-tester`](https://github.com/daidr/dualsense-tester/blob/main/src/store/dualsense.ts) uses WebHID as its complete DualSense transport. It listens for HID connect and disconnect events. It also reuses device wrappers and serializes open and close operations.

[`dualsense-ts`](https://github.com/nsfm/dualsense-ts/blob/main/src/manager.ts) uses a similar WebHID lifecycle. It also polls `navigator.hid.getDevices()` every two seconds. This poll finds permitted devices that reconnect without a new HID connect event.

Both DualSense implementations detect USB and Bluetooth from the HID report descriptor. The known maximum input-report sizes are 504 bits for USB and 616 bits for Bluetooth. For Bluetooth, `dualsense-ts` reads feature report `0x05` before it processes full input reports.

Electron's [`setDevicePermissionHandler` tests](https://github.com/electron/electron/blob/main/spec/chromium-spec.ts) exercise `navigator.hid.requestDevice()`. They do not exercise `navigator.getGamepads()`. The handler controls WebHID access, not Gamepad API enumeration.

### macOS Chromium change

Chromium added Sony controller support to its Apple GameController backend on 2026-02-21. The [change](https://chromium.googlesource.com/chromium/src/+/50244958c7839105a42b8e40402aa3826659d219) covers DualShock and DualSense controllers.

Chromium 150 includes this path and enables it by default. [Electron 43](https://www.electronjs.org/blog/electron-43-0) uses Chromium 150. Electron 41 uses Chromium 146 and does not contain this path.

Test Electron 43 or 44 before AIRI adds a permanent macOS fallback. Keep the WebHID fallback if AIRI must support Electron 41.

### WebHID in Electron

Use WebHID in the renderer for device-specific packages. Keep Electron permission policy in the main process.

The host must handle these operations:

- accept HID requests only from the expected application origin;
- select only approved vendor, product, usage-page, and usage values;
- persist grants only when the product needs reconnection without another chooser;
- keep the Chromium HID blocklist enabled;
- release devices when their owning window or feature closes.

Electron documents `select-hid-device`, `setPermissionCheckHandler`, and `setDevicePermissionHandler` for this flow. The device-added and device-removed chooser events are not general hot-plug listeners.

### DualSense Bluetooth on Electron and macOS

The current workspace selects Electron `^41.2.1`. [Electron 41 uses Chromium 146](https://www.electronjs.org/blog/electron-41-0#stack-changes).

This version boundary matters on macOS. The [Chromium 146 GameController fetcher](https://github.com/chromium/chromium/blob/146.0.7680.65/device/gamepad/game_controller_data_fetcher_mac.mm#L30-L48) rejects the Apple `GameController.framework` objects whose product category is `DualShock 4` or `DualSense`. Its comment says another Chromium fetcher owns those devices. This leaves PlayStation controllers on Chromium's older `IOHIDManager` path.

Chromium later added [DualSense and DualShock support through Apple GameController](https://github.com/chromium/chromium/commit/50244958c7839105a42b8e40402aa3826659d219). The newer implementation does the following:

- It accepts `DualShock 4` and `DualSense` objects when the PlayStation feature is enabled, but still requires an `extendedGamepad` profile. See [`GetSupportOutcome`](https://github.com/chromium/chromium/blob/f1985a4833097ebeba992c60a5dd49a18e8652de/device/gamepad/game_controller_data_fetcher_mac.mm#L122-L159).
- It enables background controller monitoring and listens for Apple's connect and disconnect notifications. Apple should also notify it about controllers that were already connected. See [`RegisterOnMainThread`](https://github.com/chromium/chromium/blob/f1985a4833097ebeba992c60a5dd49a18e8652de/device/gamepad/game_controller_data_fetcher_mac.mm#L235-L271).
- The feature is [enabled by default](https://github.com/chromium/chromium/blob/f1985a4833097ebeba992c60a5dd49a18e8652de/device/gamepad/public/cpp/gamepad_features.cc#L44-L52).
- Recognized PlayStation devices are then [excluded from the lower-level IOHID fetcher](https://github.com/chromium/chromium/blob/f1985a4833097ebeba992c60a5dd49a18e8652de/device/gamepad/gamepad_platform_data_fetcher_mac.mm#L170-L180). The ID test explicitly includes DualShock 4 and PlayStation 5 devices. See [`IsSupportedByGameController`](https://github.com/chromium/chromium/blob/f1985a4833097ebeba992c60a5dd49a18e8652de/device/gamepad/gamepad_platform_data_fetcher_mac.mm#L361-L388).

The observed result, where USB works but Bluetooth makes `navigator.getGamepads()` empty, is therefore consistent with a Chromium 146 macOS backend gap. USB can reach the old IOHID path while the Bluetooth controller does not become a usable Gamepad API device. This is a source-based explanation, not a confirmed diagnosis of the tested machine.

Do not diagnose this state from one `getGamepads()` call. The [Gamepad specification](https://github.com/w3c/gamepad/blob/81ad0752c4dd06011722b158314eef68cbc2460d/index.html#L2069-L2112) requires an empty list before the document observes a gamepad user gesture. Focus the window and press a face button before comparing USB and Bluetooth.

Use this verification order:

1. In the focused settings window, press a face button and record `gamepadconnected`, `gamepaddisconnected`, and `navigator.getGamepads()` results.
2. Repeat the same minimal page in current Chrome. This separates an Electron version problem from macOS pairing or firmware state.
3. Test an Electron 43 or 44 build before changing the input architecture. [Electron 43 uses Chromium 150](https://www.electronjs.org/blog/electron-43-0#stack-changes), which contains the PlayStation GameController change. [Electron 44 uses Chromium 152](https://releases.electronjs.org/release/v44.0.0). Electron 44 also raises the minimum operating system to macOS 13.
4. Keep the WebHID provider for Electron 41 compatibility and for device-specific data. Apple officially lists both USB and Bluetooth as supported DualSense connection methods on Mac. See [Apple's controller connection guide](https://support.apple.com/en-us/111100).

The WebHID fallback should have an explicit owner. Do not read the same selected controller from both Gamepad API and WebHID at the same time.

- Call `requestDevice()` only from a user action. Filter by Sony vendor ID, DualSense product ID, gamepad usage page, and gamepad usage.
- On startup, call `getDevices()` to recover prior grants. Listen for `connect` and `disconnect` events, then refresh the permitted-device list after a reconnect.
- Open the selected HID device, determine USB or Bluetooth from its report descriptors, and install one input-report listener.
- For Bluetooth, initialize the full DualSense report stream before expecting motion and touchpad data.

The first-party [`dualsense-ts` WebHID provider](https://github.com/nsfm/dualsense-ts/blob/6922a0e84e4c2dde6a5555e34e4e2b7300750f83/src/hid/web_hid_provider.ts#L20-L119) demonstrates transport detection, open, feature-report initialization, input reports, and connect/disconnect handling. Its [permission and permitted-device methods](https://github.com/nsfm/dualsense-ts/blob/6922a0e84e4c2dde6a5555e34e4e2b7300750f83/src/hid/web_hid_provider.ts#L150-L216) keep `requestDevice()` in an interactive callback and use `getDevices()` for later enumeration. Its [manager](https://github.com/nsfm/dualsense-ts/blob/6922a0e84e4c2dde6a5555e34e4e2b7300750f83/src/manager.ts#L580-L615) combines WebHID connect events with permitted-device polling and deduplicates the returned `HIDDevice` objects.

If the controller is still absent after an Electron 43 or 44 test, the modern Chromium control flow has another possible gap: it suppresses the IOHID path as soon as the vendor and product IDs identify a PlayStation controller. It does not first prove that Apple GameController published that controller. A failure inside Apple's framework can therefore leave neither Gamepad fetcher publishing the device. This is an inference from the two Chromium branches above. WebHID remains the practical renderer-side fallback for that case.

### `node-hid`

`node-hid` is a low-level transport. AIRI must still own report parsing, normalization, output scheduling, and device lifecycle.

It also adds native addon distribution. Its README lists prebuilt targets and explains the N-API compatibility model. The same README states that Windows 10 cannot expose an Xbox 360 controller through `node-hid`.

For these reasons, do not move Xbox support to `node-hid`. Use Gamepad API in the renderer, or SDL and XInput in a native backend.

### SDL3 and SDL-based Node packages

SDL3 has the broadest complete controller model in this survey. It defines standard positions and capability checks for sensors, touchpads, LEDs, and rumble.

SDL also contains HIDAPI drivers for PlayStation, Nintendo, and Xbox families. See the [SDL HIDAPI driver list](https://github.com/libsdl-org/SDL/blob/main/src/joystick/hidapi/SDL_hidapijoystick_c.h).

The current `@kmamal/sdl` package binds SDL2. Its public controller API lists axes, buttons, LEDs, rumble, and trigger rumble. It does not list gamepad touchpad or controller-sensor methods.

`gamepad-node` adds a `navigator.getGamepads()`-style API over `@kmamal/sdl`. Its repository has little adoption history. It also targets common input rather than complete vendor features.

Adopt an SDL backend only when browser mappings become insufficient for many devices. A native backend increases release, signing, and architecture costs.

## Recommended AIRI boundary

```text
ControllerState + ControllerCapabilities
                    ^
                    |
        +-----------+-----------+
        |                       |
Gamepad API provider     Device-specific adapters
common input             DualSense / DS4 / Joy-Con
                                ^
                                |
                         WebHID transport
```

Use these package boundaries:

- Keep `input-playstation-dualsense-5` device-specific.
- Add a small shared controller-state contract only when a second provider needs it.
- Add a Gamepad API provider for common buttons, sticks, triggers, and connection state.
- Add `input-playstation-dualshock-4` and `input-nintendo-joy-con` only for special features.
- Route Xbox controllers through the Gamepad API by default.
- Evaluate SDL after AIRI has a tested device list that Chromium cannot map.

Do not force all features into one lowest-common-denominator state. Expose optional capabilities such as `motion`, `touchpad`, `light`, `rumble`, and `adaptiveTrigger`.

## Source-license risk in the supplied DualSense code

The supplied HTML matches [`nondebug/dualsense/dualsense-explorer.html`](https://github.com/nondebug/dualsense/blob/main/dualsense-explorer.html).

The [repository root](https://github.com/nondebug/dualsense) does not contain a license file. GitHub also shows no repository license.

Code without an explicit license is not safe to copy into a distributable package. User access to the source does not grant redistribution rights.

Before release, use one of these paths:

1. Get explicit permission from the copyright owner.
2. Replace copied implementation details with an independently written implementation and independent tests.
3. Adopt a compatible licensed library after a project license review.

Do not treat a source citation as a software license.
