# Terminal Reroute Demo Evidence

This note curates the evidence from:

- `/Users/liuziheng/airi/services/computer-use-mcp/.computer-use-mcp/reports/airi-chat-terminal-reroute-2026-03-12T04-40-56-026Z`

Use this as PR-facing demo/proof material for the **legacy outward terminal reroute** flow.

## What This Run Proves

This run shows a real AIRI chat flow where:

1. AIRI starts on the normal workflow validation path.
2. `workflow_validate_workspace` begins on the `exec` surface.
3. The workflow detects that the validation command needs an interactive terminal.
4. The workflow returns a formal terminal reroute instead of continuing on the wrong surface.
5. AIRI reads the reroute instruction, switches to PTY session `pty_2`, and continues the interaction.
6. AIRI verifies the expected PTY output and finishes successfully.

This is specifically proof that:

- terminal surface switching was not just implied in text
- `workflow_reroute` reached the AIRI chat layer
- AIRI consumed the reroute and continued with PTY tools
- PTY output was observable and verified

## Important Scope Note

This report is **not** the current terminal-lane mainline proof.

It proves the older, still-supported **outward reroute** path:

- `exec -> workflow_reroute -> PTY`

The current terminal-lane mainline has since moved to **workflow self-acquire PTY**.

So if this evidence is attached to the PR, describe it accurately as:

- proof of the terminal reroute flow
- proof that AIRI can receive and continue from a PTY reroute

Do **not** describe this artifact as proof of the newer self-acquire mainline.

## Source Run Summary

From `report.json`:

- status: `completed`
- provider: `google-generative-ai`
- model: `models/gemini-2.5-flash`
- PTY session used after reroute: `pty_2`
- started at: `2026-03-12T04:40:56.027Z`
- finished at: `2026-03-12T04:41:46.939Z`

Prompt summary:

- AIRI was instructed to call `computer_use::workflow_validate_workspace`
- the validation command was `node services/computer-use-mcp/fixtures/interactive-echo.mjs`
- AIRI was instructed to wait for `workflow_reroute`
- after reroute, AIRI had to continue on PTY and verify:
  - `ECHO: hello from AIRI terminal reroute airi-chat-terminal-reroute--56-026Z`
  - `DONE`

## Observable Evidence

### AIRI final summary

From `demo-summary.md`:

> The workflow for validating the AIRI repository started via `exec` and rerouted to a PTY session for interactive validation.
>
> The interactive validation continued on PTY session `pty_2`.
>
> AIRI verified the interactive response and `DONE` from the tool output.
>
> The interactive validation completed successfully.

### PTY output evidence

The captured PTY evidence includes:

- `ECHO: hello from AIRI terminal reroute airi-chat-terminal-reroute--56-026Z`
- `DONE`

This is the critical proof that AIRI did not stop at reroute, but actually continued inside the PTY session and verified the result.

### Workflow-side evidence

The run prompt and summary together show this sequence:

- workflow started on `exec`
- workflow returned a terminal reroute
- AIRI continued on PTY
- AIRI verified the interactive fixture result

### Trace / audit evidence

The demo summary for this run records:

- `5` PTY audit entries
- `12` new trace entries

That makes this usable as both:

- a product demo artifact
- an engineering proof artifact

## Suggested PR Attachments

These are the files worth attaching or referencing in the PR:

- report:
  - `/Users/liuziheng/airi/services/computer-use-mcp/.computer-use-mcp/reports/airi-chat-terminal-reroute-2026-03-12T04-40-56-026Z/report.json`
- human-readable summary:
  - `/Users/liuziheng/airi/services/computer-use-mcp/.computer-use-mcp/reports/airi-chat-terminal-reroute-2026-03-12T04-40-56-026Z/demo-summary.md`
- screenshots:
  - `/Users/liuziheng/airi/services/computer-use-mcp/.computer-use-mcp/reports/airi-chat-terminal-reroute-2026-03-12T04-40-56-026Z/screenshots/011-chat-ready.png`
  - `/Users/liuziheng/airi/services/computer-use-mcp/.computer-use-mcp/reports/airi-chat-terminal-reroute-2026-03-12T04-40-56-026Z/screenshots/047-post-reroute-tool-turn.png`
  - `/Users/liuziheng/airi/services/computer-use-mcp/.computer-use-mcp/reports/airi-chat-terminal-reroute-2026-03-12T04-40-56-026Z/screenshots/054-demo-summary.png`
- optional screen recording:
  - `/Users/liuziheng/airi/services/computer-use-mcp/.computer-use-mcp/reports/airi-chat-terminal-reroute-2026-03-12T04-40-56-026Z/录屏2026-03-12 下午12.41.19.mov`

## Do Not Upload These

Do **not** upload the whole directory as-is.

Specifically exclude:

- `stage-user-data/`
- `Cookies`
- `Cookies-journal`
- `DIPS`
- `Trust Tokens`
- any browser/user profile artifacts
- `.DS_Store`

Those are runtime byproducts, not demo evidence, and they are not appropriate PR artifacts.

## PR Wording You Can Reuse

This PR includes a product-level demo artifact for the terminal reroute flow.
In the captured AIRI chat run, `workflow_validate_workspace` started on the normal `exec` path, returned a formal PTY reroute for the interactive validation step, and AIRI continued on PTY session `pty_2` to verify the expected interactive output. The attached screenshots, `demo-summary.md`, and `report.json` together show that the reroute was not just emitted by the workflow, but actually consumed and completed by AIRI.

## Reviewer Note

If the PR also includes the newer terminal self-acquire work, keep the distinction explicit:

- this artifact proves **legacy outward reroute**
- the newer terminal-lane mainline is **self-acquire**

That distinction matters, otherwise the evidence will overclaim what this specific report demonstrates.
