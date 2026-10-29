# Web voice composer and voice call

Status: accepted

## Context

The web and mobile composers had several voice surfaces that grew separately:

- The desktop web composer had a voice button with a hover menu. The menu held the mode, the microphone, Auto send, and the continuous listening switch.
- The mobile composer had a hold-to-record button with a full-screen blurred backdrop, and a separate Hearing drawer behind a soundwave button.
- Hands-free speech with Auto send off became a draft. The draft card was removed in #3207 because it had no design, so these drafts had no surface on the web.
- The chat panel used `max-w-500px` with `min-w-30%`. The minimum won on wide screens, so the panel grew to 576px at 1920px and 768px at 2560px.

The desktop app already had a designed surface for live speech: the voice inlay window.

## Decision

### Composer layout

- The desktop web composer keeps the desktop app layout: the text above, and a toolbar inside the composer with the add button, the recording status, the microphone, and send.
- The touch composer uses one row: an add button, a text field with a microphone inside it, and a send button outside it.
- The add button opens an upward menu. It attaches images or starts a voice call.
- `AnimatedContent` reads `data-side`, so an upward menu slides up from its trigger.
- The chat panel is `min(440px, 45%)` wide.

### Microphone modes

- `ChatComposerVoiceInput` is the microphone in the text field. A tap acts on the mode. A long press, a right-click, or the up arrow opens a menu with the mode and one Auto send switch.
- The modes:
  - Dictation, the default. A tap records. The microphone becomes a neutral stop button in place, and the waveform and time fill the area beside it, like the desktop app. A second tap puts the text into the field, or sends it with Auto send.
  - Walkie-talkie. A tap turns the field into a hold-to-talk bar. A release ends the speech. A drag up before the release cancels it. Without Auto send, the field returns to the keyboard with the text in it.
  - Voice message. A tap records audio. A second tap sends it with Auto send, or keeps it for the send button.
- Dictation no longer writes its live transcript into the text field. The presence card above the composer shows it.
- No mode covers the page with a backdrop.
- The Electron chat window keeps `VoiceInputButton` until the desktop app adopts this design.

### Live speech above the composer

- The inlay logic moved into `VoicePresence` in stage-ui: the `hidden`, `capsule`, `card`, and `sent` views, the dismissed state, and the sent rewrite.
- The tamagotchi inlay wraps it and keeps only window concerns: the backdrop, the pointer hit test, the return home, and the global Escape.
- The web and mobile composers render `VoicePresence` above the composer, without a window frame.

### Voice call

- A voice call is continuous listening that the user starts from the add menu. The voice host owns it with `callActive` and `callMuted`.
- During a call, speech starts an input in every Hearing input mode, and each input is sent at once. A call never keeps a draft.
- Mute keeps the microphone open and turns off the voice activity plugin. Unmuting is immediate and asks for no permission. Mute cancels speech that it was capturing.
- The microphone switch in Hearing closes the microphone for every feature. A call does not start while it is off, and turning it off ends a call.
- `useVoiceListening` stays the one place that starts and stops listening. It listens during a call, or when the input mode listens and the `continuous` option allows it. When its scope ends, for example when the user leaves the stage page for settings, the call ends too, because that page shows the call controls.
- The call capsule at the top of the page has a hang-up button on the left and the call time on the right. Behind them, a waveform of the speaker fades out to the right. Only the hang-up button ends the call, so a stray tap does not.
- On the desktop web, a call panel above the composer shows the character, the status, the time, the live speech, a hang-up button, and a mute button. A tap or a downward drag on its handle reduces the call to the capsule. A tap on the capsule body returns to the panel.
- On a touch layout, the capsule is the whole call UI, so nothing covers the character. The live speech shows above the composer, and the microphone in the text field becomes the mute button. A progressive blur behind the whole input area keeps the composer readable over the stage, and it grows stronger during a call.

### Settings and small screens

- Hearing details are in settings. The desktop web header menu and the mobile settings drawer link to the Hearing page.
- The mobile soundwave button and its Hearing drawer are removed.
- Small web and Pocket screens do not listen outside a call. `HearingConfig` hides the input mode and the microphone switch there and says that a call listens.
- The desktop app keeps continuous listening at every window size. A later change can apply the call model there.

## Consequences

- Hands-free speech on small screens needs a call. A user who turned the microphone on before this change no longer listens there until a call starts.
- A user who chose voice message as the mode before this change starts with dictation, because the composer stores its mode under a new key.
- The desktop app and the web now use different composer voice controls until the desktop app moves to `ChatComposerVoiceInput`.
- `useVoiceCallStore` calls the voice store directly, so a call runs only in the window that owns the voice host. The web has one window, so this holds there.
