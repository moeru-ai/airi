# Keep the voice inlay shown

Status: accepted

## Context

The desktop inlay showed live speech in a vibrancy panel that opened when speech produced text.
The first open waited for a window, a page load, and runtime setup. Short speech, for example after a wake word, ended before the panel appeared.
Then the panel opened and hid again at once.

## Decision

- The main window shows the inlay window once at startup, inactive. The window stays shown and loaded.
- The window is transparent and has no vibrancy. It floats above other windows on every workspace.
- The home of the window is the bottom center of the primary display. The user can drag the capsule or the card away.
  After the page paints nothing for 5 seconds, the window returns home, so the next capsule appears where the user expects it.
  The move is invisible, because nothing is painted. Speech and drafts keep a dragged window in place. A display change also moves it home.
- The window ignores the mouse by default. The page uses `useChatFloatingClickThrough`, so only what it paints takes the pointer.
- The page anchors its content to the bottom center and paints one of four views:
  - `hidden`: nothing.
  - `capsule`: a small listening pill with a level meter. It appears when any capture starts.
  - `card`: the draft and live transcript, with the existing `VoiceDrafts` composer.
  - `sent`: the sent text. The card moves up and fades out, so the speech reads as a message that left.
- The capsule grows into the card with a size transition. The window is 200px high and at most 520px wide, so the card and the send motion fit.
- Escape interrupts instead of hiding the window. Live speech is cancelled with `cancel-presented`, and the card shrinks and fades in place.
  A dismissed draft stays in the chat window, and the inlay shows it again only after its text changes.
  Hiding the window while capture continues would leave the user unsure whether AIRI still listens.
- Escape works from any app while the inlay shows a capsule or a card. The inlay registers a global Escape through the
  uiohook driver only for that time. The driver does not consume keys, so the focused app still receives its Escape.
  An Electron accelerator would take Escape away from every app. Without the macOS Accessibility permission, only Escape in the focused inlay works.
- The tray menu can still hide the window. The next capture shows it again.

## Consequences

- The inlay renderer costs memory from startup, also for users who never speak.
- A transparent window has no system blur, so the card uses an opaque surface.
- In development, overlays that a dev tool injects into the page also take the pointer over their area.
