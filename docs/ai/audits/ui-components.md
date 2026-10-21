# UI component audit

Snapshot: 2026-10-21. Base: 6876b0dcd on origin/main, rechecked unchanged on de5844c3f, with the consumer consolidation of this branch. The story baseline before PR #2854 was b8b508014.

## Scope and method

The inventory contains every source Vue SFC found by `rg --files apps packages`, except stories, story helpers, public assets, and build output.
Pages and application entries have separate roles in the CSV. A Vue SFC does not automatically represent a reusable component.
Rows from the previous snapshot keep their reviewed role. New rows get a role from the path. A file below `pages/` is a page. `App.vue` and top-level `layouts/` files are entries or layouts.
The script parses imports and package exports with TypeScript. It resolves relative imports, workspace exports, and barrel re-exports.
Direct coverage means a Histoire story renders an imported component through a static template tag.
Composed coverage follows rendered component imports. It indicates an import path through a story, not execution of every conditional branch.
Unresolved aliases, auto-imports, namespace imports, dynamic components, and render functions need manual inspection. The CSV records unresolved static Vue imports.
Raw controls identify audit candidates. Hidden file inputs, custom radio cards, and draggable numeric fields can require native controls.
No shared component import does not prove duplication. Local wrappers can provide shared components through composition.

## Story coverage

| Package | Vue components | Direct | Composed only | No story path |
| --- | ---: | ---: | ---: | ---: |
| `packages/ui/` | 57 | 53 | 2 | 2 |
| `packages/stage-ui/src/components/` | 162 | 51 | 25 | 86 |

At b8b508014, direct coverage was 36 of 55 `packages/ui/` components and 40 of 137 stage-ui components.
PR #2854 added 15 stories for 24 previously uncovered components. Existing stories already cover the other public primitives.
`BasicInputFile` and `SelectOption` remain composed examples through their parent components.
`ComboboxOption` remains uncovered. It is exported but has no repository caller. Its string injection keys require the old parent contract.
Review that export before adding a showcase or removing it. This batch does not alter the public API.
`SettingsCard` came from main after PR #2854. It has no story path yet.

## Application and shared UI adoption

| Area | Source SFCs | Render shared component imports | Files with raw controls |
| --- | ---: | ---: | ---: |
| `apps/stage-web/` | 26 | 16 | 7 |
| `apps/stage-pocket/` | 23 | 14 | 4 |
| `apps/stage-tamagotchi/` | 115 | 60 | 19 |
| `apps/stage-tamagotchi-kirie/` | 76 | 42 | 13 |
| `packages/stage-layouts/` | 32 | 13 | 4 |
| `packages/stage-pages/` | 142 | 115 | 35 |
| `packages/stage-ui/` | 180 | 100 | 35 |

The Kirie application repeats several desktop control implementations. Treat these as a separate migration scope.

## Reviewed consolidation candidates

| Source | Before | After |
| --- | --- | --- |
| [packages/stage-layouts/src/components/Widgets/ChatToolbarButton.vue:14](../../../packages/stage-layouts/src/components/Widgets/ChatToolbarButton.vue#L14) | A local button owns size, surface, active state, focus, and press feedback. | Uses BasicButton. Active surface, slot, attributes, and disabled actions stay local. |
| [apps/stage-tamagotchi/src/renderer/components/chat-window/chat-speech-mute-button.vue:23](../../../apps/stage-tamagotchi/src/renderer/components/chat-window/chat-speech-mute-button.vue#L23) | A native icon button duplicates shared focus and press behavior. | Uses IconButton. Speech state and output-host lookup stay local. |
| [packages/stage-ui/src/components/scenarios/chat/components/image-attachment-preview.vue:18](../../../packages/stage-ui/src/components/scenarios/chat/components/image-attachment-preview.vue#L18) | A native delete button owns an overlay surface and interaction styles. | Uses IconButton. Removal keeps its label and stopped click propagation. |
| [packages/stage-ui/src/components/layouts/page-header.vue:87](../../../packages/stage-ui/src/components/layouts/page-header.vue#L87) | The back action uses a native button without its own accessible label. | Uses IconButton. Back has a localized label. Hidden and disabled navigation cannot activate. |
| [packages/stage-ui/src/components/scenarios/providers/provider-validation-alerts.vue:35](../../../packages/stage-ui/src/components/scenarios/providers/provider-validation-alerts.vue#L35) | Validation actions use multiple native buttons. | Uses BasicButton. Existing action callbacks and pending states remain. |
| [packages/stage-pages/src/pages/settings/providers/index.vue:253](../../../packages/stage-pages/src/pages/settings/providers/index.vue#L253) | Category and filter controls use native buttons. | Uses GhostButton for categories and SelectTab for pricing and deployment filters. |
| [apps/stage-pocket/src/components/websocket-status-button.vue:59](../../../apps/stage-pocket/src/components/websocket-status-button.vue#L59) | Connection state owns a custom surface and native button. | Uses BasicButton. Connection labels, colors, and settings navigation remain. |
| [packages/stage-ui/src/components/scenarios/chat/components/tool-call-shell.vue:33](../../../packages/stage-ui/src/components/scenarios/chat/components/tool-call-shell.vue#L33) | A local trigger button sits inside shared Collapsible. | Uses BasicButton. Trigger exposes aria-expanded. Separate action slots do not toggle content. |
| [packages/stage-ui/src/components/misc/steppers/steppers.vue:170](../../../packages/stage-ui/src/components/misc/steppers/steppers.vue#L170) | Stepper actions use native buttons. | Uses BasicButton. Back, next, and finish keep their state transitions. Step keys no longer use any. |
| [packages/stage-ui/src/components/data-pane/property-number.vue:200](../../../packages/stage-ui/src/components/data-pane/property-number.vue#L200) | Numeric controls include custom drag and pointer behavior. | Uses Input for numeric entry. Native range retains custom progress styling and drag behavior. |
| [packages/stage-ui/src/components/menu/radio-card-many-select.vue:174](../../../packages/stage-ui/src/components/menu/radio-card-many-select.vue#L174) | Selection cards own their custom composition. | Uses Input for search and BasicButton for expansion. RadioCardDetail keeps its selection contract. |
| [packages/stage-ui/src/components/data-pane/color-picker.vue:517](../../../packages/stage-ui/src/components/data-pane/color-picker.vue#L517) | The color editor combines native selectors and channel inputs. | Uses Select and Input for color space and channels. Disabled channel controls prevent editing. |

All 12 reviewed components now use shared primitives for their general controls. Specialized slider and radio-card composition remain in their owners.
The CSV reflects this consolidation. The adoption table reflects the current consumer source.

## Shared business components without a direct story

The following table contains every stage-ui component without direct coverage. Composed entries already have a story import path.

| Component | Status |
| --- | --- |
| [animations/Replayable.vue](../../../packages/stage-ui/src/components/animations/Replayable.vue) | Needs a dedicated scenario and fixture |
| [auth/SignInPanel.vue](../../../packages/stage-ui/src/components/auth/SignInPanel.vue) | Needs a dedicated scenario and fixture |
| [data-pane/color-picker.vue](../../../packages/stage-ui/src/components/data-pane/color-picker.vue) | Uses Select and Input for color space and channels. Disabled channel controls prevent editing. |
| [data-pane/container.vue](../../../packages/stage-ui/src/components/data-pane/container.vue) | Needs a dedicated scenario and fixture |
| [data-pane/pane.vue](../../../packages/stage-ui/src/components/data-pane/pane.vue) | Needs a dedicated scenario and fixture |
| [data-pane/property-point.vue](../../../packages/stage-ui/src/components/data-pane/property-point.vue) | Needs a dedicated scenario and fixture |
| [gestures/swipeable.vue](../../../packages/stage-ui/src/components/gestures/swipeable.vue) | Composed in an existing story |
| [layouts/backgrounds/background-gradient-overlay.vue](../../../packages/stage-ui/src/components/layouts/backgrounds/background-gradient-overlay.vue) | Needs a dedicated scenario and fixture |
| [layouts/page-header.vue](../../../packages/stage-ui/src/components/layouts/page-header.vue) | Uses IconButton. Back has a localized label. Hidden and disabled navigation cannot activate. |
| [layouts/splitpanes/pane-area.vue](../../../packages/stage-ui/src/components/layouts/splitpanes/pane-area.vue) | Needs a dedicated scenario and fixture |
| [menu/radio-card-many-select.vue](../../../packages/stage-ui/src/components/menu/radio-card-many-select.vue) | Uses Input for search and BasicButton for expansion. RadioCardDetail keeps its selection contract. |
| [misc/character-switcher-drawer.vue](../../../packages/stage-ui/src/components/misc/character-switcher-drawer.vue) | Needs a dedicated scenario and fixture |
| [misc/profile-switcher-popover.vue](../../../packages/stage-ui/src/components/misc/profile-switcher-popover.vue) | Needs a dedicated scenario and fixture |
| [modules/GamingFactorio.vue](../../../packages/stage-ui/src/components/modules/GamingFactorio.vue) | Needs a dedicated scenario and fixture |
| [modules/GamingMinecraft.vue](../../../packages/stage-ui/src/components/modules/GamingMinecraft.vue) | Needs a dedicated scenario and fixture |
| [modules/GamingModuleSettings.vue](../../../packages/stage-ui/src/components/modules/GamingModuleSettings.vue) | Needs a dedicated scenario and fixture |
| [modules/MessagingDiscord.vue](../../../packages/stage-ui/src/components/modules/MessagingDiscord.vue) | Needs a dedicated scenario and fixture |
| [modules/WebSearch.vue](../../../packages/stage-ui/src/components/modules/WebSearch.vue) | Needs a dedicated scenario and fixture |
| [modules/X.vue](../../../packages/stage-ui/src/components/modules/X.vue) | Needs a dedicated scenario and fixture |
| [modules/stickers.vue](../../../packages/stage-ui/src/components/modules/stickers.vue) | Needs a dedicated scenario and fixture |
| [scenarios/about/about-content.vue](../../../packages/stage-ui/src/components/scenarios/about/about-content.vue) | Needs a dedicated scenario and fixture |
| [scenarios/chat/JournalPreviewModal.vue](../../../packages/stage-ui/src/components/scenarios/chat/JournalPreviewModal.vue) | Needs a dedicated scenario and fixture |
| [scenarios/chat/components/action-menu/index.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/action-menu/index.vue) | Composed in an existing story |
| [scenarios/chat/components/assistant-item.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/assistant-item.vue) | Composed in an existing story |
| [scenarios/chat/components/background-tasks.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/background-tasks.vue) | Needs a dedicated scenario and fixture |
| [scenarios/chat/components/chat-history-scroll-container.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/chat-history-scroll-container.vue) | Composed in an existing story |
| [scenarios/chat/components/error-item.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/error-item.vue) | Composed in an existing story |
| [scenarios/chat/components/history-message-frame.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/history-message-frame.vue) | Composed in an existing story |
| [scenarios/chat/components/history-time-separator.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/history-time-separator.vue) | Composed in an existing story |
| [scenarios/chat/components/hit-pill.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/hit-pill.vue) | Composed in an existing story |
| [scenarios/chat/components/image-attachment-preview.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/image-attachment-preview.vue) | Uses IconButton. Removal keeps its label and stopped click propagation. |
| [scenarios/chat/components/invoked-skills.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/invoked-skills.vue) | Composed in an existing story |
| [scenarios/chat/components/notice-item.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/notice-item.vue) | Composed in an existing story |
| [scenarios/chat/components/provider-setup-callout.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/provider-setup-callout.vue) | Needs a dedicated scenario and fixture |
| [scenarios/chat/components/reply-card.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/reply-card.vue) | Composed in an existing story |
| [scenarios/chat/components/reply-preview.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/reply-preview.vue) | Needs a dedicated scenario and fixture |
| [scenarios/chat/components/reply-quote.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/reply-quote.vue) | Composed in an existing story |
| [scenarios/chat/components/response-citations.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/response-citations.vue) | Composed in an existing story |
| [scenarios/chat/components/response-part.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/response-part.vue) | Composed in an existing story |
| [scenarios/chat/components/send-button.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/send-button.vue) | Needs a dedicated scenario and fixture |
| [scenarios/chat/components/sessions-dialog.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/sessions-dialog.vue) | Needs a dedicated scenario and fixture |
| [scenarios/chat/components/sessions-drawer.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/sessions-drawer.vue) | Needs a dedicated scenario and fixture |
| [scenarios/chat/components/sessions-list.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/sessions-list.vue) | Needs a dedicated scenario and fixture |
| [scenarios/chat/components/sticker.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/sticker.vue) | Composed in an existing story |
| [scenarios/chat/components/tool-call-home-assistant-widget.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/tool-call-home-assistant-widget.vue) | Needs a dedicated scenario and fixture |
| [scenarios/chat/components/tool-call-judgment-widget.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/tool-call-judgment-widget.vue) | Needs a dedicated scenario and fixture |
| [scenarios/chat/components/tool-call-payload-node.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/tool-call-payload-node.vue) | Composed in an existing story |
| [scenarios/chat/components/tool-call-payload.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/tool-call-payload.vue) | Composed in an existing story |
| [scenarios/chat/components/tool-call-recipe-widget.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/tool-call-recipe-widget.vue) | Needs a dedicated scenario and fixture |
| [scenarios/chat/components/tool-call-scroll-area.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/tool-call-scroll-area.vue) | Composed in an existing story |
| [scenarios/chat/components/tool-call-web-search-widget.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/tool-call-web-search-widget.vue) | Needs a dedicated scenario and fixture |
| [scenarios/chat/components/user-item.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/user-item.vue) | Composed in an existing story |
| [scenarios/chat/components/voice-composer.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/voice-composer.vue) | Needs a dedicated scenario and fixture |
| [scenarios/chat/components/voice-drafts.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/voice-drafts.vue) | Needs a dedicated scenario and fixture |
| [scenarios/chat/components/voice-input-button.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/voice-input-button.vue) | Needs a dedicated scenario and fixture |
| [scenarios/chat/components/voice-message-player.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/voice-message-player.vue) | Composed in an existing story |
| [scenarios/chat/components/voice-waveform.vue](../../../packages/stage-ui/src/components/scenarios/chat/components/voice-waveform.vue) | Needs a dedicated scenario and fixture |
| [scenarios/connection/settings/index.vue](../../../packages/stage-ui/src/components/scenarios/connection/settings/index.vue) | Needs a dedicated scenario and fixture |
| [scenarios/dialogs/about.vue](../../../packages/stage-ui/src/components/scenarios/dialogs/about.vue) | Needs a dedicated scenario and fixture |
| [scenarios/dialogs/about/about-dialog.vue](../../../packages/stage-ui/src/components/scenarios/dialogs/about/about-dialog.vue) | Needs a dedicated scenario and fixture |
| [scenarios/dialogs/audio-input/hearing-config-dialog.vue](../../../packages/stage-ui/src/components/scenarios/dialogs/audio-input/hearing-config-dialog.vue) | Needs a dedicated scenario and fixture |
| [scenarios/dialogs/audio-input/hearing-config.vue](../../../packages/stage-ui/src/components/scenarios/dialogs/audio-input/hearing-config.vue) | Needs a dedicated scenario and fixture |
| [scenarios/dialogs/audio-input/wake-word-status.vue](../../../packages/stage-ui/src/components/scenarios/dialogs/audio-input/wake-word-status.vue) | Needs a dedicated scenario and fixture |
| [scenarios/dialogs/background-picker/background-picker-dialog.vue](../../../packages/stage-ui/src/components/scenarios/dialogs/background-picker/background-picker-dialog.vue) | Needs a dedicated scenario and fixture |
| [scenarios/dialogs/background-picker/background-picker.vue](../../../packages/stage-ui/src/components/scenarios/dialogs/background-picker/background-picker.vue) | Needs a dedicated scenario and fixture |
| [scenarios/dialogs/bug-report/bug-report-dialog.vue](../../../packages/stage-ui/src/components/scenarios/dialogs/bug-report/bug-report-dialog.vue) | Composed in an existing story |
| [scenarios/dialogs/bug-report/bug-report-form.vue](../../../packages/stage-ui/src/components/scenarios/dialogs/bug-report/bug-report-form.vue) | Composed in an existing story |
| [scenarios/dialogs/model-selector/model-selector-dialog.vue](../../../packages/stage-ui/src/components/scenarios/dialogs/model-selector/model-selector-dialog.vue) | Needs a dedicated scenario and fixture |
| [scenarios/dialogs/model-selector/model-selector.vue](../../../packages/stage-ui/src/components/scenarios/dialogs/model-selector/model-selector.vue) | Needs a dedicated scenario and fixture |
| [scenarios/dialogs/model-selector/reports/live2d/content.vue](../../../packages/stage-ui/src/components/scenarios/dialogs/model-selector/reports/live2d/content.vue) | Composed in an existing story |
| [scenarios/dialogs/model-selector/tachieReportModal.vue](../../../packages/stage-ui/src/components/scenarios/dialogs/model-selector/tachieReportModal.vue) | Needs a dedicated scenario and fixture |
| [scenarios/dialogs/onboarding/onboarding-dialog.vue](../../../packages/stage-ui/src/components/scenarios/dialogs/onboarding/onboarding-dialog.vue) | Needs a dedicated scenario and fixture |
| [scenarios/dialogs/onboarding/onboarding.vue](../../../packages/stage-ui/src/components/scenarios/dialogs/onboarding/onboarding.vue) | Needs a dedicated scenario and fixture |
| [scenarios/dialogs/onboarding/step-analytics-notice.vue](../../../packages/stage-ui/src/components/scenarios/dialogs/onboarding/step-analytics-notice.vue) | Needs a dedicated scenario and fixture |
| [scenarios/dialogs/onboarding/step-model-selection.vue](../../../packages/stage-ui/src/components/scenarios/dialogs/onboarding/step-model-selection.vue) | Needs a dedicated scenario and fixture |
| [scenarios/dialogs/onboarding/step-provider-configuration.vue](../../../packages/stage-ui/src/components/scenarios/dialogs/onboarding/step-provider-configuration.vue) | Needs a dedicated scenario and fixture |
| [scenarios/dialogs/onboarding/step-provider-selection.vue](../../../packages/stage-ui/src/components/scenarios/dialogs/onboarding/step-provider-selection.vue) | Needs a dedicated scenario and fixture |
| [scenarios/dialogs/onboarding/step-welcome.vue](../../../packages/stage-ui/src/components/scenarios/dialogs/onboarding/step-welcome.vue) | Needs a dedicated scenario and fixture |
| [scenarios/dialogs/validation-details/provider-validation-details-dialog.vue](../../../packages/stage-ui/src/components/scenarios/dialogs/validation-details/provider-validation-details-dialog.vue) | Needs a dedicated scenario and fixture |
| [scenarios/hologram/holo-coupon.vue](../../../packages/stage-ui/src/components/scenarios/hologram/holo-coupon.vue) | Needs a dedicated scenario and fixture |
| [scenarios/home-assistant/entity-tile.vue](../../../packages/stage-ui/src/components/scenarios/home-assistant/entity-tile.vue) | Needs a dedicated scenario and fixture |
| [scenarios/notifications/inbox-drawer.vue](../../../packages/stage-ui/src/components/scenarios/notifications/inbox-drawer.vue) | Needs a dedicated scenario and fixture |
| [scenarios/notifications/inbox-message-item.vue](../../../packages/stage-ui/src/components/scenarios/notifications/inbox-message-item.vue) | Composed in an existing story |
| [scenarios/notifications/inbox-popover.vue](../../../packages/stage-ui/src/components/scenarios/notifications/inbox-popover.vue) | Needs a dedicated scenario and fixture |
| [scenarios/providers/provider-download-model.vue](../../../packages/stage-ui/src/components/scenarios/providers/provider-download-model.vue) | Needs a dedicated scenario and fixture |
| [scenarios/providers/provider-generation-settings.vue](../../../packages/stage-ui/src/components/scenarios/providers/provider-generation-settings.vue) | Needs a dedicated scenario and fixture |
| [scenarios/providers/provider-validation-alerts.vue](../../../packages/stage-ui/src/components/scenarios/providers/provider-validation-alerts.vue) | Uses BasicButton. Existing action callbacks and pending states remain. |
| [scenarios/providers/speech-playground-openai-compatible.vue](../../../packages/stage-ui/src/components/scenarios/providers/speech-playground-openai-compatible.vue) | Needs a dedicated scenario and fixture |
| [scenarios/providers/speech-playground.vue](../../../packages/stage-ui/src/components/scenarios/providers/speech-playground.vue) | Needs a dedicated scenario and fixture |
| [scenarios/providers/speech-provider-settings.vue](../../../packages/stage-ui/src/components/scenarios/providers/speech-provider-settings.vue) | Needs a dedicated scenario and fixture |
| [scenarios/providers/transcription-playground.vue](../../../packages/stage-ui/src/components/scenarios/providers/transcription-playground.vue) | Needs a dedicated scenario and fixture |
| [scenarios/providers/transcription-provider-settings.vue](../../../packages/stage-ui/src/components/scenarios/providers/transcription-provider-settings.vue) | Needs a dedicated scenario and fixture |
| [scenarios/providers/voicevox-family-settings.vue](../../../packages/stage-ui/src/components/scenarios/providers/voicevox-family-settings.vue) | Needs a dedicated scenario and fixture |
| [scenarios/settings/ModelCacheManager.vue](../../../packages/stage-ui/src/components/scenarios/settings/ModelCacheManager.vue) | Needs a dedicated scenario and fixture |
| [scenarios/settings/model-settings/godot.vue](../../../packages/stage-ui/src/components/scenarios/settings/model-settings/godot.vue) | Needs a dedicated scenario and fixture |
| [scenarios/settings/model-settings/index.vue](../../../packages/stage-ui/src/components/scenarios/settings/model-settings/index.vue) | Needs a dedicated scenario and fixture |
| [scenarios/settings/model-settings/live2d-expression-list.vue](../../../packages/stage-ui/src/components/scenarios/settings/model-settings/live2d-expression-list.vue) | Needs a dedicated scenario and fixture |
| [scenarios/settings/model-settings/live2d.vue](../../../packages/stage-ui/src/components/scenarios/settings/model-settings/live2d.vue) | Needs a dedicated scenario and fixture |
| [scenarios/settings/model-settings/mmd.vue](../../../packages/stage-ui/src/components/scenarios/settings/model-settings/mmd.vue) | Needs a dedicated scenario and fixture |
| [scenarios/settings/model-settings/panel.vue](../../../packages/stage-ui/src/components/scenarios/settings/model-settings/panel.vue) | Needs a dedicated scenario and fixture |
| [scenarios/settings/model-settings/preview-stage.vue](../../../packages/stage-ui/src/components/scenarios/settings/model-settings/preview-stage.vue) | Needs a dedicated scenario and fixture |
| [scenarios/settings/model-settings/spine.vue](../../../packages/stage-ui/src/components/scenarios/settings/model-settings/spine.vue) | Needs a dedicated scenario and fixture |
| [scenarios/settings/model-settings/tachie.vue](../../../packages/stage-ui/src/components/scenarios/settings/model-settings/tachie.vue) | Needs a dedicated scenario and fixture |
| [scenarios/settings/model-settings/vrm.vue](../../../packages/stage-ui/src/components/scenarios/settings/model-settings/vrm.vue) | Needs a dedicated scenario and fixture |
| [scenarios/startup/startup-overlay.vue](../../../packages/stage-ui/src/components/scenarios/startup/startup-overlay.vue) | Needs a dedicated scenario and fixture |
| [scenarios/status/hearing-status.vue](../../../packages/stage-ui/src/components/scenarios/status/hearing-status.vue) | Needs a dedicated scenario and fixture |
| [scenes/Stage.vue](../../../packages/stage-ui/src/components/scenes/Stage.vue) | Needs a dedicated scenario and fixture |
| [scenes/ViewControlSlider.vue](../../../packages/stage-ui/src/components/scenes/ViewControlSlider.vue) | Needs a dedicated scenario and fixture |
| [scenes/stage-avatar-model-missing.vue](../../../packages/stage-ui/src/components/scenes/stage-avatar-model-missing.vue) | Needs a dedicated scenario and fixture |
| [scenes/stage-render-error.vue](../../../packages/stage-ui/src/components/scenes/stage-render-error.vue) | Needs a dedicated scenario and fixture |
| [widgets/ColorPalette.vue](../../../packages/stage-ui/src/components/widgets/ColorPalette.vue) | Needs a dedicated scenario and fixture |

## Complete inventory and repeat command

[The CSV inventory](./ui-components.csv) contains all source SFCs, story references, shared imports, local components, and raw control locations.
The inventory includes render packages, loading screens, layouts, and example applications. Filter its path and role columns for each migration.

```sh
node scripts/audit-ui-components.mjs > /tmp/airi-ui-components.json
```

Regenerate the snapshot after concurrent component changes. The audit script reports JSON and does not modify components.

## Remaining work

- Add fixtures for the remaining business stories. Authentication, providers, model renderers, and settings require their real runtime boundaries.
- Resolve the unused ComboboxOption export.
- Migrate the reviewed control candidates in focused changes. Verify keyboard behavior, theme colors, and mobile hit areas.
- Extend static analysis when auto-imported or dynamic components need complete coverage.
- Review raw buttons that main added after PR #2854. Examples are `tool-call-group.vue`, `model-selector.vue`, `inbox-message-item.vue`, and `entity-tile.vue`. They are outside the 12 reviewed components.

## Verification

Checks in this section refer to the isolated PR branch. Results from the original dirty checkout are not PR acceptance evidence.

- `pnpm run build:packages`: passed, 34 tasks.
- `pnpm -F @proj-airi/stage-ui typecheck`: passed.
- `pnpm typecheck`: passed, 55 tasks.
- `pnpm exec eslint <15 new stories> scripts/audit-ui-components.mjs`: passed.
- `pnpm lint`: passed with existing warnings.
- `pnpm -F @proj-airi/stage-ui exec vitest run`: 188 files passed. Three files failed because Node native localStorage was unavailable.
- `NODE_OPTIONS=--no-experimental-webstorage pnpm -F @proj-airi/stage-ui exec vitest run src/stores/onboarding.test.ts src/stores/modules/consciousness-settings.test.ts src/stores/modules/consciousness.test.ts`: all 22 failed tests passed.
- `pnpm -F @proj-airi/stage-ui exec vitest run src/components/scenarios/status/status-capsule.browser.test.ts src/components/scenarios/chat/components/scrollable-area.browser.test.ts`: 6 tests passed.
- Vishot rendered all 15 real story components in a disposable browser gallery. Initial variants were captured and inspected.

The browser gallery uses Story and Variant wrappers. Screenshots prove the captured initial states, not every interaction or Histoire navigation.

## Consumer consolidation verification

These checks ran after the rebase onto de5844c3f. Main changed only agent documentation, test runners, and an eval after the 6876b0dcd audit base.
PR #3048 moved workspace tests to Turbo. The root Vitest config now covers only GitHub scripts, so each workspace ran its own changed tests.

- `pnpm exec vitest run --changed de5844c3f --passWithNoTests`: no test files found.
- `NODE_OPTIONS=--no-experimental-webstorage pnpm -F @proj-airi/stage-ui exec vitest run --changed de5844c3f --passWithNoTests`: 7 files and 29 tests passed.
- `pnpm -F @proj-airi/stage-pages exec vitest run --changed de5844c3f --passWithNoTests`: 6 files and 23 tests passed.
- `pnpm -F @proj-airi/stage-tamagotchi exec vitest run --changed de5844c3f --passWithNoTests`: 8 files and 110 tests passed.
- `pnpm -F @proj-airi/stage-ui exec vitest run --project browser src/components/shared-controls.browser.test.ts`: 13 browser interaction tests passed.
- `NODE_OPTIONS=--no-experimental-webstorage pnpm -F @proj-airi/stage-layouts exec vitest run`: 3 files and 17 tests passed.
- `pnpm -F <package> typecheck` for stage-ui, stage-pages, stage-layouts, stage-pocket, and stage-tamagotchi: passed.
- `pnpm typecheck`: all 60 workspace tasks passed.
- `pnpm lint`: 0 errors and 671 existing warnings.
- Before the rebase, Vishot captured and inspected 12 before and after component states in a browser fixture at 1000×1200, light theme. Main did not change these 12 components after PR #2854.

Desktop and Pocket controls were exercised in Chromium with real components and stores. Native Electron and Capacitor acceptance was not performed.
