---
name: analyze-io-traces
description: Read and analyze AIRI IO traces that Tamagotchi saved to local files. Use when the user asks why a chat, speech, or audio turn was slow, failed, or behaved wrongly, and recording is enabled in Settings > System > Developer.
---

# Analyze IO traces

Tamagotchi saves each ended IO span as one JSON line when **Record IO traces automatically** is on. The setting is under Settings > System > Developer.

## Find the files

Files are named `<start time>.jsonl`. A new file starts each time recording starts. Files older than seven days are deleted.

```sh
ls -t "$HOME/Library/Application Support/ai.moeru.airi/io-traces"/*.jsonl | head -3
ls -t "$HOME/Library/Application Support/@proj-airi/stage-tamagotchi/io-traces"/*.jsonl | head -3
```

The first path is the packaged app on macOS. The second is `pnpm dev` on macOS. If `APP_USER_DATA_PATH` is set, use `$APP_USER_DATA_PATH/io-traces`. If recording is off or nothing ran yet, the folder does not exist. Ask the user to turn it on and reproduce the problem.

## Record shape

Each line is one span with `traceId`, `spanId`, `parentSpanId`, `name`, `startTimeNano`, `endTimeNano`, `status.code` (2 means error), `attributes`, and `events`. Time values are decimal strings in nanoseconds. A trace is one interaction turn. Subsystems are in `attributes["ai.moeru.airi.io.subsystem"]`.

## Common queries

Set `F` to the newest file first.

```sh
# Spans by name, slowest first, in milliseconds
jq -r '[.name, ((.endTimeNano|tonumber)-(.startTimeNano|tonumber))/1e6] | @tsv' "$F" | sort -t$'\t' -k2 -nr | head -20

# Spans with an error status
jq -c 'select(.status.code == 2) | {name, traceId, message: .status.message}' "$F"

# All spans of one trace in start order
jq -c 'select(.traceId == "TRACE_ID")' "$F" | jq -s 'sort_by(.startTimeNano|tonumber)'

# Time to first token for each LLM span
jq -c 'select(.events | any(.name | endswith("llm.first_token"))) | {traceId, events}' "$F"
```

## Limits

Spans are saved only after they end. A call that never ends is not in the file. Spans record timing and counts, not prompts or replies. Say so when the cause needs content.
