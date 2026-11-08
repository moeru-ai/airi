# Background conversation Compact

Status: Accepted for the isolated unified Agent candidate. Public release remains pending.

## Context

Terminal settlement starts a new turn in its original Session. Native AUV observations can add large images between Terminal operations.
Message-count trimming cannot preserve a frozen execution history while the foreground continues.
xsAI stores an append-only native input. Its request projection can use a shorter array without changing that accumulator.

## Decision

Each Session owns one disposable `ConversationCompact` cache. It projects provider requests and never edits stored history.
The Core adapter records each completed round before preparing the next request. Transcript ownership does not depend on projected array offsets.
Both Chat Completions and Responses use the same request preparation boundary.

The cache freezes an eligible prefix and starts one background summary. The foreground continues below the hard context budget.
Every request measures its actual protocol context and tool schemas in UTF-8 bytes. The current system prompt participates in that measurement.
Stage starts at 256 KiB and blocks foreground dispatch at 512 KiB. These are application limits, not token-window guarantees.
The summary request also checks its context budget. Its output cap is 2048 tokens.

A ready summary replaces only old images and assistant narratives. Original owner messages, system content and Host notices remain intact.
Every tool call retains its exact identity, arguments, execution status and text receipts. Failed, pending and opaque rounds remain intact.
The two newest rounds keep their full content. Full images and native continuation remain in stored generation transcripts.
The summary has context authority. It cannot select tools, approve an action, settle execution or claim a new owner message.

Prefix comparisons include original content and ordering. Newly appended content joins the summary without rewriting that content.
Edits, deletion, session clearing, provider-scope changes and cancellation invalidate stale jobs.
Loss of renderer leadership and store disposal abort owned jobs. No work transfers through a summary.
An empty, failed or ineffective summary does not retry automatically. At the hard budget, the next model request fails.
Oversized pinned context also fails. No tool execution repeats to reconstruct missing context.

The summary uses the resolved provider request and existing `useLLM.stream` with `taskTools: []` and provider tools disabled.
If the model emits a tool call, the summary aborts. Main approval, B1 cancellation, Notice delivery and Desktop exclusion remain unchanged.

## Evidence

Controlled tests use real Core adapters and SDK serialization with provider responses and executors under test control.
Barriers retain a frozen prefix while later content arrives. Provider dispatch counts prove hard-budget waiting, cancellation and summary failure.
Receipts containing `unknown`, a missing exit code and `noNewDispatch=false` survive exactly. The cache assigns no execution semantics to those fields.
Browser tests use real Chat stores and the tool resolver. They verify tool-free background requests and separate Session projections.

## Limits

No tokenizer or verified provider token limit is available for every configured model. The byte gate does not certify token admission.
Pinned text receipts and owner messages grow. This version stops when they alone fill the budget.
Summaries can contain model errors. Independent task Oracles remain necessary.
Existing character history cuts apply before Compact. Compact preserves the context admitted by that policy.
This change grants no new tool permission. GUI and Browser input remain NO-GO.
