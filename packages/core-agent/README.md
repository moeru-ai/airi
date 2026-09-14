# Core Agent

Shared agent runtime for AIRI. This package provides chat orchestration, context
and session contracts, response parsing, and LLM streaming.

## When to use it

Use the public exports for agent behavior shared by multiple applications.
Keep Vue stores, UI state, and application-specific tools in their owning packages.

## LLM streaming

Import `streamFrom` and `StreamFromOptions` from `@proj-airi/core-agent`.
Pass the model, chat provider, messages, and optional tools and callbacks.
Await the returned promise to handle completion or failure.

The runtime checks text and reasoning for serialized calls to registered tools.
It checks complete JSON candidates at step boundaries. If a candidate is unmatched,
it retains that candidate and all later output until the stream ends.
The final check joins each channel across tool rounds. Valid ordinary objects retain
their nested examples, including examples split across steps.
Native tool activity does not disable this check or wait for buffered UI notifications.

Each channel inspection has a parse-work budget. The budget permits candidate
lengths to total at most eight times the channel length, measured in UTF-16 code units.
Valid objects need one pass. The budget adds no size or depth limit to valid objects.
An unmatched prefix is inspected at its first boundary and once at stream completion.
Intermediate boundaries do not rescan that growing prefix.

Ordinary text before a JSON candidate still streams immediately. Complete candidates
can flush at step boundaries. After an unmatched candidate, text, reasoning, and
native UI notifications wait for stream completion and retain their original order.
Final incomplete ordinary output remains unchanged unless it contains a detected tool call.

If malformed candidates exhaust the budget, the response rejects with
`Model output exceeded the JSON inspection work limit.`
The runtime discards unchecked buffered output and skips message, finish, and usage callbacks.
Earlier streamed output and native tool side effects cannot be rolled back.
Deeply malformed output can fail this check even without a tool call.
This error does not establish tool incompatibility. The Stage UI store does not
retry it or change the tool compatibility cache.

## Development

Build the public exports before tests in consuming packages:

```shell
pnpm -F @proj-airi/core-agent build
pnpm -F @proj-airi/core-agent exec vitest run
```
