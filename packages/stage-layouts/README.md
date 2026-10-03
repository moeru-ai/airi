# Stage Layouts

Shared layouts and chat input behavior for AIRI stage applications.

## Use

Import layouts, components, and composables through the package exports.
Use this package for stage-specific presentation and composer behavior.
Do not put provider protocols or general UI primitives here.

## Mobile voice drafts

Web and Pocket pages own microphone transcription sessions.
They queue transcript events until the mobile composer consumes them.
This preserves final results when a provider clears interim text within the same render cycle.

The composer owns voice drafts and automatic submission.
When auto-send is disabled, recognized text stays available for manual submission.
When enabled, each final result starts the configured delay.
Manual edits, new speech text, recording starts, microphone shutdown, and session changes cancel pending submission.
Late events from a different chat session are ignored.

Desktop page-owned hands-free ingestion remains separate from mobile composer routing.
This change does not update ASR or TTS provider protocols.

## Checks

```sh
pnpm -F @proj-airi/stage-layouts typecheck
pnpm -F @proj-airi/stage-layouts exec vitest run
```

The root Vitest configuration includes this package's regression tests.
