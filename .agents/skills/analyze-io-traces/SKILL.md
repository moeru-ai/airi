---
name: analyze-io-traces
description: Read and analyze AIRI IO traces that Tamagotchi saved to local files. Use when the user asks why a chat, speech, or audio turn was slow, failed, or behaved wrongly, and recording is enabled in Settings > System > Developer.
---

# Analyze IO traces

Tamagotchi saves each trace record as one JSON line when **Record IO traces automatically** is on. The setting is under Settings > System > Developer. The record format is in the README of `packages/trace-kit`.

## Find the files

Files are named `<start time>.jsonl`. A new file starts each time recording starts. When a span fails or runs past its deadline, the hub also writes the minute before it to `flight-<reason>-<time>.jsonl`, even when recording is off. Files older than seven days are deleted.

```sh
ls -t "$HOME/Library/Application Support/ai.moeru.airi/io-traces"/*.jsonl | head -3
ls -t "$HOME/Library/Application Support/@proj-airi/stage-tamagotchi/io-traces"/*.jsonl | head -3
```

The first path is the packaged app on macOS. The second is `pnpm dev` on macOS. If `APP_USER_DATA_PATH` is set, use `$APP_USER_DATA_PATH/io-traces`. If recording is off or nothing ran yet, the folder can be empty. Ask the user to turn recording on and reproduce the problem.

## Record shape

Each line is one record with `type`, `source`, `epoch`, `seq`, `ts`, `clock`, and `observedTs`. Domain records also have `track`, and often `ids`, `attrs`, and `links`.

- `span.begin` and `span.end` are separate lines with the same `spanId`. A span without an end was still open, or its source was lost.
- `instant` is one moment. With `spanId`, it belongs to that span.
- `state` is a state change on a state track. `source.started`, `source.stopped`, and `source.lost` give the life of each window. `source.lost` with `reason: "epoch-replaced"` means that the window reloaded.
- `ts` is on the clock that `clock` names. `observedTs` is on the hub clock, `mono:collector`. Use `observedTs` to order records of different windows. Within one span, `ts` values share a clock, so `end.ts - begin.ts` is the duration.
- Files remove user content, such as transcripts and TTS text. Say so when the cause needs content.

Tracks and IDs:

```text
participants/user/wake       wake word
participants/user/input      voice input          ids.input. attrs voice.input.trigger and voice.input.outcome
participants/user/speech     speech segments      ids.input
participants/user/asr        speech recognition   ids.input, or ids.turn for a voice message
participants/user/rephrase   transcript rephrase  ids.input
conversations/<id>/endpoint  end-of-turn judgement attrs decision.verdict and decision.latency_ms
agents/agent/turn            chat turn            ids.turn and ids.conversation. Links caused-by to the input with the same ID
agents/agent/llm             model request        ids.turn. attrs llm.ttft_ms, llm.text_length. Instant llm.first_chunk
agents/agent/control         streaming control    ids.turn
participants/agent/output    speech output        ids.turn
participants/agent/tts       TTS request          ids.turn and ids.segment
participants/agent/playback  played clip          ids.turn and ids.segment
```

A spoken turn uses the input ID as its turn ID, so `ids.input` of the input and `ids.turn` of the chat turn have the same value.

## Common queries

Set `F` to the newest file first.

```sh
# Durations of ended spans in milliseconds, slowest first
jq -s -r 'group_by(.spanId) | map(select(.[0].spanId != null) | {b: (map(select(.type == "span.begin"))[0]), e: (map(select(.type == "span.end"))[0])}) | map(select(.b and .e)) | map([.b.name, .b.track, (.e.ts - .b.ts)] | @tsv)[]' "$F" | sort -t$'\t' -k3 -nr | head -20

# Spans that ended with an error
jq -c 'select(.type == "span.end" and .status == "error") | {track, spanId, reason, message}' "$F"

# Spans that never ended
jq -s -c '(map(select(.type == "span.end") | .spanId)) as $ended | map(select(.type == "span.begin" and ((.spanId | IN($ended[])) | not))) | .[] | {name, track, ids}' "$F"

# Every record of one turn, in hub order
jq -c 'select(.ids.turn == "TURN_ID" or .ids.input == "TURN_ID")' "$F" | jq -s 'sort_by(.observedTs)'

# Voice inputs: trigger and outcome
jq -c 'select(.type == "span.end" and (.track | endswith("/input"))) | {input: .ids.input, outcome: .attrs["voice.input.outcome"], status, reason}' "$F"

# Time to first token of each model request
jq -c 'select(.type == "span.end" and (.track | endswith("/llm"))) | {turn: .ids.turn, ttft: .attrs["llm.ttft_ms"]}' "$F"

# End-of-turn judgements
jq -c 'select(.type == "span.end" and (.track | endswith("/endpoint"))) | {input: .ids.input, verdict: .attrs["decision.verdict"], ms: .attrs["decision.latency_ms"], status}' "$F"

# Lost and reloaded windows
jq -c 'select(.type == "source.lost") | {of, reason}' "$F"
```

## Limits

Records of windows that open before recording starts are in the file only from the time recording starts. A window that crashes leaves open spans and a `source.lost` record. Files keep timing, counts, and IDs, not prompts or replies.
