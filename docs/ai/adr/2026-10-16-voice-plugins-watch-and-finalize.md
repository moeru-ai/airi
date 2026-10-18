# Voice plugins watch the transcript and finalize it

Status: accepted

## Context

Voice input plugins ran as concurrent, isolated participants. Each registration declared a selection of raw or
corrected text, segment scope, neighbor segments, and the context keys of other plugins. The runtime tracked a
freshness basis for each snapshot. It evicted derived values in a cascade when their inputs changed, and it checked
a dependency graph for cycles. Most of this machinery answered one question: was a result computed from the newest
transcript?

Saved IO traces from 2026-10-13 and 2026-10-14 show two delays on each spoken turn:

- `Transcript rephrase` started only after `Speech recognition` ended, and took 4 to 6 seconds. The plugin rewrote
  only when every segment was final, and the provider marks segments final at the end.
- `End of speech judgement` was cancelled again and again after the speaker stopped, without new voice activity.
  The judgement key contained the transcript revision. A provider revision with the same text discarded the
  judgement, so the input ended only at the 4.2-second silence limit.

A speech input differs from an HTTP request because the input keeps changing while plugin work runs. When the input
is complete, the work is a sequence, like middleware.

## Decision

- An input has two phases for plugins:
  - While the provider transcribes, `input.watch(run, { key, debounceMs })` runs work for the newest document only,
    like a language server analysis. A new key aborts the active run. Watchers do not read the results of other
    watchers, so no cascade is necessary.
  - After the provider ends, `input.finalize(stage, { timeoutMs })` stages run one after another, in plugin
    installation order. Each stage sees earlier corrections, writes with `patch` and `attach`, and then the host
    receives the submission.
- Selections, context publication between plugins, `dependsOn`, and the `transcript-patch` grant are removed.
  Installation order replaces the dependency graph. Plugins are trusted in-process code.
- Plugin corrections apply only during finalization. During capture, only a user correction changes corrected text.
- `onSpeechInput` can be asynchronous. Finalization waits for pending installs.
- An end judgement depends on the transcript text, not on the provider revision.
- The rephrase plugin speculates. Interim text that stays the same for 600 ms starts a rewrite. Finalization reuses
  the rewrite when the final segment texts are the same, even while it still runs.
- `@proj-airi/stream-kit` owns the lifetime primitives: `createTask`, `runTask`, `createLatest`, `createScope`, and
  `createPushStream`. The voice runtime uses them instead of its own lifetime classes.

## Consequences

- When a pause gives the rewrite a head start, a spoken turn reaches the chat model sooner. Its time after the end
  of speech is the remaining rewrite time, not the full rewrite time.
- Speculation costs one extra model request for each pause with new text. An aborted request can still cost input tokens.
- A plugin that needs another plugin's result reads it in a later finalization stage, not during capture.
- The provider's real revision pattern decides how often the text-based judgement key helps. A live trace after this
  change must confirm the shorter end of speech.
- The input attempt still mixes its state machine with its audio and provider streams. The speech output still has
  two synthesis paths. Both are follow-up work.
