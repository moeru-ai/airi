# Conversation Compact scheduling

Status: experimental. Default Off.

The existing device feature flag exposes one switch and two mutually exclusive enabled variants.
The disabled switch selects Off. Enabled variants select Synchronous or Background.

All modes use one `ConversationCompact` cache per Session.
Snapshots, summary generation, exact receipt preservation, delta merging, and stale-prefix checks remain shared.
Stored history and Host execution state remain outside the cache.

| Mode | Soft byte limit | Hard byte limit |
| --- | --- | --- |
| Off | No summary request | Reject a new provider request |
| Synchronous | Wait for a summary before continuing | Wait or reject |
| Background | Continue while a summary runs | Wait or reject |

Device mode changes immediately invalidate each local Session cache and abort only its summary controller.
Mode changes never abort the foreground controller or an executor.
A waiting request rechecks the new mode and byte gate after a scheduling change.
Session cleanup, deletion, renderer disposal, leadership loss, and request cancellation invalidate the corresponding summary.
Failed snapshots remain suppressed until a different eligible prefix exists.

The application limits remain 256 KiB soft and 512 KiB hard.
These measurements do not establish a provider token window, cost saving, or 80 percent threshold.
Controlled scheduling tests do not establish performance benefits. Real performance comparison remains outside this delivery.
