# Conversation features

Users set three defaults in **Settings > System > Default conversation settings**: reply expressions, Skill instructions, and background task permission.
The defaults page uses standard `FieldCheckbox` controls in full-width sections, like the System experimental settings page.
Descriptions appear below each label. The conversation editor keeps its own compact fields.
Memory and stickers reuse their existing module switches as defaults. Their settings pages label them as default choices.
Changing either default updates conversations without an explicit choice. Explicit conversation values override these defaults.
Service configuration and global service switches keep their original owners.

Conversation features open in a centered desktop dialog or the existing mobile drawer.
The desktop conversation list keeps its compact popover. Closing the feature dialog returns focus to the conversation selector.
The editor shows two sections: reply behavior, and available tools and information. It has no tabs.
Unconfigured optional integrations stay hidden until configured or explicitly selected for a conversation.
Configured services and explicit choices remain visible when unavailable. Their switches show the effective off state with a short reason.
A blocked choice remains stored. Restoring service availability restores its selected conversation behavior.
A conversation restriction never hides its own control.
Memory uses an on/off switch. Read-only policy remains available to adapters without adding a user-facing mode selector.
Normal rows have no help buttons or explanatory footer. Only blocked rows show a reason and a direct settings link when available.
Task conversations also show when their parent's restriction prevents a feature.

The speech settings page, chat speaker, and volume controls share `speech-output-settings`.
It owns the existing `settings/speech/enabled` preference, volume, and last audible volume, with Pinia snapshot synchronization.
The speech module exposes a computed alias. The control store derives mute without persisting a second choice.
Zero volume means speech off, including hydrated zero volume. Enabling speech restores audible volume without snapshot repair watchers.
The chat speaker does not store conversation preferences.
The desktop computer-use button controls one global runtime choice. Windows share it for typed and spoken turns. Restart restores its default.
Reply cards and automatic drawing keep their existing settings. They have no additional controls in this editor.
Application commands, desktop tools, client tools, and module context remain adapter controls without ordinary UI switches.

One restore action at the top removes explicit conversation restrictions. It does not change the global speaker or computer-use controls.
It does not reset module settings, credentials, device volume, or user defaults. Individual controls have no restore actions.

## Ownership

`core-agent` owns `SessionFeatures`, `SessionFeatureOverrides`, default values, and task restrictions.
`stage-ui/stores/chat/features-store` persists three account-specific preferences under `settings/chat/preferences/<account>` on this device.
`ChatSessionMeta.features` stores only explicit conversation choices. The session store persists and synchronizes those choices through its leader.

An omitted choice follows the user's current preference or the runtime default.
Memory and sticker preferences come directly from their existing module settings, without another persisted copy.
Search, vision, and Home Assistant retain service prerequisites that conversation choices cannot bypass. An explicit value stays explicit when it equals the default.
Tool choices are stored by source, for example `tools: { mcp: false }`. Other sources retain their existing choices or runtime defaults.
Resolved request snapshots expose the selected sources as a tool allowlist.
Restoring a choice removes that property. Restoring all choices removes the complete override.
Existing module settings determine service availability and reusable defaults according to their ownership. Feature choices do not configure providers, install tools, or grant device access.

Defaults and conversation metadata stay on the device. Session exports include conversation overrides.
The existing cloud chat projection does not transfer feature choices.

## Request and output lifetime

The chat host resolves choices for the target conversation before preparing a send.
The runtime copies that snapshot before queueing. Each concurrent conversation and queued turn keeps its own snapshot.
Prompt composition, tool resolution, and generation hooks consume the same policy.

Changes apply to the next send. Adapter speech restrictions also cancel the current conversation's producer immediately.
Global speech off, from any entrance, prevents local and remote producers from opening. The Stage skips audio analysis and lip-sync setup.
Turning global speech off aborts synthesis, stops playback, and releases the Stage's lip-sync and analysis resources.
Silent text turns still finish their control handlers. They create no speech response.
Synthesis, queued playback, and lip sync stop together. Text generation continues.
Re-enabling speech does not resume a cancelled producer. The next turn can speak.

Character expressions and actions have a separate policy. Their control events carry both conversation and turn identities.
A silent turn can drive expressions. A spoken turn can keep expressions disabled.
Model idle behavior stays in model settings.

## Execution gates

- Stickers: omit catalog discovery, instructions, and new sticker output.
- Skills: omit new instructions and instruction replay from stored messages.
- Background tasks: prevent new recipe runs. Existing tasks retain their explicit stop action.
- Automatic drawing: prevent automatic triggers and bind each trigger to its source conversation.
- Memory off: omit the index, instructions, and all memory tools.
- Memory read only: expose the index and read tool, without write or forget instructions and tools.
- Reply cards: omit card instructions and card-producing tools.
- Tools: filter registered sources and their prompt contributions before tool resolution.
- Screen context: omit automatic vision observations when conversation permission, vision configuration, or global chat context is off.
- Module context: omit automatic external context and skip disabled module context providers.

Attached images and recordings remain explicit input. Feature choices do not remove stored messages.
Disabling a feature cannot erase information already present in conversation history.

## Tool sources

Registered tools declare their `group`. First-party app commands use `application` by default.
Adapters assign `mcp`, `plugins`, `computer-use`, `home-assistant`, `desktop`, or `client` explicitly.
Web search has its own group. Provider-native search also follows that choice.
Disabled sources cannot reappear through stored tool references or tool reruns.
Computer use retains its requirement for explicit selection on each request.
Search sources keep their original activation settings. Conversation search permission restricts both independent search tools and provider-native search.
The provider settings page and conversation availability use the same provider schema reader. They do not create provider transports to discover search support.
Home Assistant checks its global service gate during tool resolution and execution, including executors captured before a service refresh.

Request-owned internal tools, such as memory and recipe tools, follow their corresponding feature choices.
External adapters must register client-owned tools with `group: 'client'` rather than passing unclassified internal tools.

## Adapter use

An external adapter can create a conversation with explicit initial choices:

```ts
const sessionId = await sessions.createSession(characterId, {
  setActive: false,
  features: {
    speech: false,
    reactions: false,
    cards: false,
    screen: false,
    modules: false,
    memory: 'off',
    tools: {
      'application': false,
      'web-search': false,
      'mcp': false,
      'plugins': false,
      'computer-use': false,
      'home-assistant': false,
      'desktop': false,
      'client': true,
    },
  },
})
```

The adapter uses the returned conversation ID for normal chat submissions.
It can read `sessions.sessionFeatures[sessionId]` for the resolved choices.
It updates choices with `setSessionFeatures(sessionId, change)`.
It restores one choice with `setSessionFeatures(sessionId, {}, ['speech'])`, or all choices with `setSessionFeatures(sessionId)`.
It changes one tool source with `setSessionFeatures(sessionId, { tools: { mcp: false } })`.
It restores that source with `setSessionFeatures(sessionId, {}, ['tools.mcp'])`. Restoring `tools` removes all explicit tool choices.

Shared code does not inspect protocol names. ACP can use the same contract without introducing ACP-specific feature flags.

Ordinary branches copy explicit choices and then evolve independently.
Recipe task conversations also intersect their choices with parent restrictions. A child cannot grant itself additional tools or memory access.
