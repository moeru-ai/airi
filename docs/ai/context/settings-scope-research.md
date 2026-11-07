# Settings scope and entry points

Research date: 2026-11-07.
This note separates published guidance from a proposed AIRI design.
It records design research, not an implementation contract.

## What the official guidance says

### Apple: separate general settings from task options

Apple recommends useful defaults and a limited number of settings.
General settings belong in the settings area.
Options for a specific task belong near that task, where people can see their effects.
Apple also recommends direct links to system settings when those settings control the relevant behavior.
Its warning about redundant system settings concerns operating-system choices.
It does not establish precedence among AIRI's internal switches. [Apple HIG: Settings](https://developer.apple.com/design/human-interface-guidelines/settings)

### Apple: identify what a toggle controls

A toggle represents two opposing states.
Its context or label must identify the affected setting, content, or view.
A choice with more than two states needs a suitable choice control.
Apple's macOS guidance also describes visual hierarchies for dependent controls. [Apple HIG: Toggles](https://developer.apple.com/design/human-interface-guidelines/toggles)

### Apple: reveal details near the relevant choice

Disclosure controls keep frequent choices visible and reveal other details when they become relevant.
The disclosure label identifies the hidden content.
The disclosure control stays near the content that it reveals. [Apple HIG: Disclosure controls](https://developer.apple.com/design/human-interface-guidelines/disclosure-controls)

### Apple: simplicity needs sufficient context

Apple distinguishes simplicity from visual minimalism.
Putting every feature behind one entry point can increase effort.
Clear hierarchy, direct language, and necessary context help people understand the interface.
Sometimes an additional status or explanation makes the interface simpler. [WWDC26: Principles of great design, Simplicity at 11:13](https://developer.apple.com/videos/play/wwdc2026/250/?time=673)

### VS Code: distinguish scope from entry point

VS Code exposes user and workspace scopes explicitly.
Workspace settings override user settings, but some application settings cannot have workspace overrides.
The editor, JSON files, commands, and setting links provide different routes to the same settings.
Settings support groups, search filters, modification indicators, and reset actions.
Reset removes an explicit value so the applicable default can take effect.
Policy settings form a separate category that other scopes cannot override. [VS Code: User and workspace settings](https://code.visualstudio.com/docs/configure/settings)

### KDE: expose detail by subject

KDE recommends customization for distinct supported workflows.
Settings cannot replace product decisions or conceal defects.
KDE discourages a generic Advanced page because that name does not identify its contents.
Instead, specific items can open subpages or reveal optional details. [KDE HIG: Powerful when needed](https://develop.kde.org/hig/powerful_when_needed/)

## Proposed AIRI model

The following proposal applies those principles to AIRI.
Apple does not prescribe this data model or its resolution rules.
The existing [AIRI Design Guide](../../../DESIGN.md) remains the authority for shared visual patterns.

### Separate three questions

| Question | Meaning | Example |
| --- | --- | --- |
| Can the feature run? | Capability, configuration, permissions, and explicit global stops | A speech provider exists and global speech output is on. |
| Does this conversation use it? | A conversation choice or an inherited default | This conversation permits reply expressions. |
| Where can people change it? | Navigation and contextual entry points | Model settings, conversation options, or a stage shortcut. |

The location of a control does not establish its scope or precedence.
A control inside the chat view can still affect the whole app.
Two controls for the same setting and scope share one stored value.
Two controls with different scopes need labels or context that explain the distinction.

### Classify each existing setting before changing it

| Kind | Resolution | UI treatment |
| --- | --- | --- |
| The same preference in several places | All entry points read and write one value. | Keep useful entry points or link to the owning setting. |
| A user default and a conversation override | The explicit conversation value replaces the default. | Identify the scope. A reset removes the override. |
| A capability prerequisite or explicit global stop | A conversation cannot bypass it. | Explain a blocked result near the affected feature and link to its owner. |
| Different behaviors with similar names | Each behavior retains its own meaning. | Name the behaviors precisely, such as idle animation and reply expressions. |

A global default is overridable.
An explicit global stop is not.
An existing global switch requires a behavior audit before its classification changes.
A label containing Enable does not establish whether that switch represents a default or a stop.

For an overridable preference, the selected value is the conversation choice or the user default.
Execution also requires the relevant capability and permissions.
An explicit global stop prevents execution even when the selected preference is on.
This rule does not require a new global stop for every feature.

### Keep multiple routes without multiplying state

Each setting has one owner, a stable identifier, and explicit supported scopes.
Feature pages group settings by subject.
Conversation options group relevant choices by their effect on the current conversation.
Search and direct links provide other routes without creating new settings.

The conversation editor does not need provider credentials, device configuration, or copies of global shortcuts.
A global shortcut updates its original global value.
A conversation choice updates only that conversation.
Related pages can link to each other when showing the same control adds confusion.

### Explain exceptions at the point of failure

Normal rows keep their short labels and familiar controls.
Blocked rows show the specific cause, such as speech output off or no configured provider.
The row links directly to the controlling setting.
The interface distinguishes a stored preference from the actual result when a prerequisite blocks it.
A global stop does not erase a conversation's stored choice.

Default inheritance can remain compact.
A brief source indicator or an optional detail view can explain an unexpected value.
The existing single reset action removes conversation overrides.
It does not reset module configuration, global shortcuts, or user defaults.

### Audit before another UI reduction

The audit records each control's behavior, owner, scope, persistence, prerequisites, and execution gates.
It also records every entry point and the replacement route for any removed control.
Similar labels alone do not justify merging controls.
A crowded page alone does not justify removing a supported choice.

Resolution checks cover changes in both directions: global settings while a conversation is open, and conversation changes while a global stop applies.
Other checks cover switching conversations, reset, unavailable providers, and whether a disabled feature actually stops its execution flow.

## Current AIRI behavior audit

This sample records the implementation after the settings ownership changes.

| Controls | Current relationship | Consequence |
| --- | --- | --- |
| Live2D Expression system and conversation reply expressions | The model switch selects AIRI blending or the SDK expression executor. The conversation choice admits reply signals. | Turning the model switch off does not disable all expressions. These controls do not override or synchronize each other. |
| Individual model expressions and motions, and conversation reply expressions | The selected character's avatar policy filters available named expressions and motions. Conversation permission admits their use during replies. | Conversation permission cannot restore a disabled named expression or motion. |
| Idle animation and conversation reply expressions | Idle animation controls model behavior outside reply signals. Conversation permission controls reply-driven behavior. | These controls represent different behaviors. Neither is a replacement for the other. |
| Memory module and conversation memory | The module switch supplies the default. Explicit conversation access replaces that default for prompts and tools. | A conversation can use memory while the default is off. |
| Stickers module and conversation stickers | The module switch supplies the default. Conversation selection overrides it. Frequency still governs catalog selection. | A conversation can use stickers while the default is off. It cannot guarantee a sticker in each reply. |
| Web search or Home Assistant, and conversation tool choices | Module configuration determines availability. Conversation policy further filters tools. | Conversation permission cannot provide credentials or reopen a disabled module. |
| Speech module switch and chat speaker | The module, speaker, and volume controls share the existing output-enabled preference through one synchronized store. | Every entrance controls the same output state. Zero volume also stops synthesis. |
| Conversation defaults and explicit conversation choices | Explicit choices replace the three user defaults. Reset removes the explicit choices. | A default is not a global prohibition. Existing explicit choices survive later default changes. |

### Source map

- [Live2D executor selection](../../../packages/stage-ui-live2d/src/components/scenes/live2d/Model.vue): `selectExpressionExecutor` retains SDK execution when AIRI blending is off.
- [Live2D settings](../../../packages/stage-ui-live2d/src/composables/live2d/live2d.ts): expression processing and idle behavior have separate device settings.
- [Avatar policy](../../../packages/stage-ui/src/stores/modules/airi-card.ts): the selected character's avatar stores named expression and motion exclusions.
- [Expression admission](../../../packages/stage-ui-live2d/src/contexts/expressions.ts): `execute` checks the enabled expression catalog before calling its executor.
- [Reply output](../../../packages/stage-ui/src/components/scenes/Stage.vue): reply signals pass through conversation reaction checks.
- [Chat host](../../../packages/stage-ui/src/stores/chat.ts): memory composition, sticker selection, and tool construction consume conversation choices.
- [Stickers](../../../packages/stage-ui/src/stores/modules/stickers.ts): catalog selection uses the resolved conversation choice and sticker frequency.
- [Conversation availability](../../../packages/stage-ui/src/composables/use-session-feature-availability.ts): configured services and explicit choices remain visible when a prerequisite blocks them.
- [Speech output](../../../packages/stage-ui/src/stores/voice.ts): `outputEnabled` reads the shared global speech output state.
- [Speech settings page](../../../packages/stage-pages/src/pages/settings/modules/speech.vue): the module page edits `speechStore.enabled`.
- [Chat speaker](../../../packages/stage-layouts/src/composables/useStopSpeakingButton.ts): the speaker edits global `speechMuted`, without conversation metadata writes.
- [Conversation defaults](../../../packages/stage-ui/src/stores/chat/features-store.ts) and [inheritance](../../../packages/stage-ui/src/stores/chat/session-features.ts): defaults and explicit choices have separate ownership.

### Implemented UI rules

Normal conversation rows show their labels and switches without help popovers.
Configured services and explicit choices stay visible when unavailable.
Blocked rows show the effective off state, a specific reason, and a direct settings link when available.
Their saved conversation choices remain intact and become active when the prerequisite returns.
Unconfigured optional sources without a conversation choice stay hidden.

Memory and sticker module pages identify their switches as defaults.
The defaults page continues to own only reactions, Skills, and background tasks.
Its reset changes only those three defaults. Conversation reset removes only conversation overrides.
Neither reset changes credentials, service activation, global speech output, or the other module defaults.

The model expression switch now identifies AIRI expression handling.
Its off-state description explains that the model retains its own expression handling.
It is independent of reply reactions and named avatar exclusions.

Search requires a distinction between sources.
The independent search service and provider-native search retain their original activation settings.
The conversation choice restricts both sources without changing either source's settings.
Availability reads the same provider schema as the provider settings page, including protocol defaults and endpoint restrictions.
It does not create a provider transport, write settings, or require independent search credentials when native search is available.
