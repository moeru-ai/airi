# Screen ambient capture

`screen-capture.swift` supplies small full-display RGBA frames for desktop
ambient lighting on macOS 13 or later. ScreenCaptureKit excludes the owning
stage window while retaining the windows beneath it. This prevents the
character from lighting itself and preserves sources hidden behind its outline.

Use this helper through the stage window's Eventa capture session. It does not
record video, save images, capture audio, or replace general screen sharing.
Other platforms keep the Electron video capture path.

## Build and run

Normal desktop development and builds compile the helper automatically on
macOS. Install Xcode or its command-line tools with a macOS 13 or newer SDK.
The build creates an arm64/x86_64 universal executable in `out/native` and
reuses it until its source or build script changes. Release packaging copies
and signs the executable in `Contents/Resources/native`; users need no Swift
compiler. Screen Recording permission is still required.

## Lifetime and transport

The main process owns one helper per stage window. Reload, renderer crash,
window close, disable, or a replacement session stops it. Session IDs prevent
stale reads and stops from affecting a replacement. The renderer requests one
frame at a time at its configured sample rate. The helper retains the latest
pixel buffer and reports when no fresh frame exists. The renderer can reuse
unchanged pixels for moving stage geometry and temporal smoothing.

Stdout uses a kind byte, a little-endian 32-bit payload length, and a payload:
ready (0), packed RGBA (1), UTF-8 error (2), or unchanged frame (3). Stdin accepts
`frame` followed by a newline. EOF ends capture. Sizes are fixed per session
and bounded to 512 by 512 pixels; the requested rate is at most 30 Hz.
