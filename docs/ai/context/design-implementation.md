# Design Implementation Notes

The [AIRI Design Guide](../../../DESIGN.md) defines visual identity and reuse rules. This document records source findings and delivery procedures.

## Format Alignment

The guide follows the eight ordered sections in the [Google DESIGN.md specification](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md).

The optional YAML token block is omitted. Dynamic colors remain in Chromatic and theme settings. Static component values stay linked to their implementations.

The uppercase `DESIGN.md` filename follows the format convention. It is an explicit exception to AIRI's kebab-case file naming rule.

Root `AGENTS.md` explicitly references it. Automatic discovery by external tools is not assumed.

No Google CLI or new skill is installed. This change aligns document structure and content, not token export or CLI integration.

## Known Differences and Follow-up Work

These findings come from source inspection. This guide does not change runtime code.

| Difference | Evidence | Follow-up |
| --- | --- | --- |
| Input declares size without corresponding styles | `input.vue` declares `size`, but its template only uses variant styles. | Define the size contract, then update the component, reference, and stories. |
| Two Input variants look identical | `primary` and `secondary` contain identical style arrays. | Decide whether both names remain. Avoid page-specific differences. |
| Focus treatment varies | Button and GhostButton define focus outlines. IconButton and OverlayButton do not define equivalent rules. | Check keyboard interactions before a shared correction. |
| Motion timing and reduced-motion support vary | The motion implementations in the design guide define separate parameters. | Group changes by interaction type instead of replacing all durations. |
| Global visual tokens are incomplete | Color variables are shared. Components still define most radii, spacing, and layer values. | Extract repeated requirements from real use cases before adding tokens. |

Address keyboard focus and field sizing first. Then consolidate repeated visual parameters and check business pages. Each runtime change needs behavior and visual evidence.

For theme switching, reuse [useTheme](../../../packages/ui/src/composables/use-theme.ts). The UnoCSS rules explicitly permit this composable despite its `disableTransition: true` setting.

For direct `useDark` calls, set `disableTransition: false` as required by the repository rules.

## Design Workflow and Existing Skills

The repository already includes implementation, review, and screenshot skills. This documentation task requires no additional design skill installation.

| Task | Entry point | Purpose |
| --- | --- | --- |
| Choose visual patterns and components | The design guide and the [component reference](../../../docs/ai/context/ui-components.md) | Understand AIRI design conventions and APIs |
| Write component styles | [enforce-rules-for-unocss](../../../.agents/skills/enforce-rules-for-unocss/SKILL.md) | Reuse controls, organize utilities, and preserve theme behavior |
| Write Vue components | [vue-best-practices](../../../.agents/skills/vue-best-practices/SKILL.md) and [TypeScript rules](../../../.agents/skills/enforce-rules-for-typescript/SKILL.md) | Define component boundaries, state, and implementation practices |
| Review interaction and accessibility | [web-design-guidelines](../../../.agents/skills/web-design-guidelines/SKILL.md) | Supply review checks alongside AIRI visual conventions |
| Capture visual evidence | [use-vishot](../../../.agents/skills/use-vishot/SKILL.md) | Capture screenshots through the appropriate runtime scenarios |
| Publish a UI PR | [create-pr](../../../.agents/skills/create-pr/SKILL.md) | Review affected behavior and provide comparable screenshots |

The root `AGENTS.md` routes UI design work to the design guide. Skills provide implementation and review procedures without duplicating the design reference.

### For each design change

1. Locate the shared control and existing business pages. Determine whether the difference belongs to the control or the scenario.
2. Choose existing variants, sizes, and shapes before extending the API.
3. When a shared component changes, update its reference and stories.
4. Check light mode, dark mode, custom hues, long text, loading, and disabled states.
5. Check keyboard focus, touch targets, the software keyboard, and safe areas.
6. Record results and unverified items through the PR workflow.

Run `pnpm dev:ui` for component previews. Histoire lives in `packages/stage-ui`.

Start with the [button stories](../../../packages/stage-ui/src/components/misc/button.story.vue), [input stories](../../../packages/stage-ui/src/components/form/input/input.story.vue), [select stories](../../../packages/stage-ui/src/components/form/select/select.story.vue), and [swipe action stories](../../../packages/stage-ui/src/components/misc/swipe-actions.story.vue).

Documentation changes require link and format checks. Runtime UI changes also require type checks, relevant tests, and visual acceptance. Source inspection does not replace runtime checks.
