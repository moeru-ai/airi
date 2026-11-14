# Native observation admission

Status: containment only. Trusted window observation remains blocked.

## Evidence and decision

U7 dispatched two global OCR requests and one region capture without a trusted observation grant.
Electron attribution identifies request routing. It does not grant observation authority.
Tool selection, model arguments, window titles, and owner text do not create a Main-owned window grant.

AUV SDK 0.0.40 captures a window by `windowId` alone.
Its request does not bind an expected PID, process creation time, or window generation.
Enumeration before capture cannot close the handle-reuse race inside the executor.
The inspected driver checkout has no proven build relationship to the installed binary.
These facts do not prove native capture always selects the wrong window. They prevent the required identity guarantee.

Main therefore rejects all native observation requests before runtime queue admission.
No observation request reaches daemon startup or dispatch. Command help remains available.
Main rejects model image reads and history previews because stored screenshots lack trusted capture provenance.
Existing runtime codec tests validate bytes and containment only. They do not grant production observation access.

The MCP runtime also disables native AUV window observation, foreground metadata, and display metadata.
Terminal registration and its approval protocol stay independent.
The SDK adapter remains an internal executor implementation, not a model-accessible authority source.

## Scope distinctions

| Capability | Current production decision |
| --- | --- |
| Window capture and window OCR | Denied. No trusted grant or lifecycle-bound capture contract exists. |
| Display capture | Denied. A window grant cannot authorize the screen. |
| Region capture | Denied. Coordinates cannot establish scope. |
| Global OCR and OCR waiting | Denied. Read-only does not imply authorized. |
| Window enumeration | Denied. Titles, applications, and PIDs disclose global context. |
| Display and pointer metadata | Denied without a separate observation decision. |
| Media and permission observation | Denied by the same native observation gate. |
| Stored screenshot reading and preview | Denied without trusted capture provenance. |
| CLI help | Allowed. It does not observe the desktop. |

Existing mutating operation approval does not grant observation authority. GUI and Browser input remain outside this admission.
Terminal can access resources through its separately approved command. This change does not sandbox Shell commands.
Other operating-system executors and external MCP servers are not covered by this Windows native admission.
Electron's separate screen-sharing package still exposes `screenCapture.getSources` and renderer-selected `setSource`.
Those routes do not use the AUV gate or establish a Main-owned Agent window grant.
They remain an additional admission gap. This patch does not claim whole-renderer observation isolation.
Persisted chat images and user-supplied attachments also require separate provenance analysis before a broader privacy claim.

## Required contract before reopening

Main must obtain approval through a trusted Host interaction and retain the actual sender and original request binding.
The approved target needs an executor-verifiable lifecycle identity, not a title or reusable handle alone.
Admission and dispatch must reject revoked, expired, or replaced targets.
Captured artifacts need provenance tied to that verified operation before model or preview reads.
Unknown targets stay closed. Global observation requires its own explicit authorization.

This patch does not implement a grant UI, a generic ACL, a new driver, or a placeholder grant store.
The legitimate scoped-window positive control remains unavailable. Unified visual Beta admission is NO-GO.
