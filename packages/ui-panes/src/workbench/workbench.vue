<script setup lang="ts">
import type { DockviewApi, DockviewReadyEvent, DockviewTheme, VueComponent } from 'dockview-vue'

import { useTheme } from '@proj-airi/ui'
import { DockviewVue } from 'dockview-vue'
import { computed, defineComponent, h, useSlots } from 'vue'

import WorkbenchTab from './workbench-tab.vue'

/**
 * A docking workbench for devtools pages. Each named slot becomes a panel component with the same name.
 *
 * The page owns the layout: it adds the panels in `ready`, with `api.addPanel({ id, component: '<slot name>' })`.
 * Panels can be resized, moved, and stacked as tabs.
 *
 * Use it for a tool page with several views of the same data. Do not use it for a settings form.
 */
const props = withDefaults(defineProps<{
  /** The slot names that become panel components. */
  panels: readonly string[]
  /** A panel can float above the layout. */
  floating?: boolean
  /** The panel content scrolls inside the panel and gets padding. A panel with its own scroll area turns it off. */
  padded?: boolean
}>(), { floating: false, padded: true })

const emit = defineEmits<{
  ready: [api: DockviewApi]
}>()

const { isDark } = useTheme()
const slots = useSlots()

function createPanelComponent(slotName: string): VueComponent {
  // NOTICE:
  // Dockview declares registry entries as DefineComponent<any>.
  // Vue's concrete defineComponent result is not assignable to that broad generic type.
  // Source: dockview-vue/dist/types/utils.d.ts.
  // Remove this cast when Dockview accepts Vue's Component type for registry entries.
  return defineComponent({
    setup() {
      // The padding lines the content up with the icon of the tab.
      return () => h('div', { class: props.padded ? 'h-full overflow-auto px-4 py-3' : 'h-full min-h-0 overflow-hidden' }, slots[slotName]?.())
    },
  }) as VueComponent
}

// NOTICE:
// Dockview types registry entries as DefineComponent<any>, and an SFC with typed props does not overlap that type, so a
// single assertion fails. The tab only reads `params`, which Dockview passes.
// Source: dockview-vue/dist/types/utils.d.ts.
// Remove this cast when Dockview accepts Vue's Component type for registry entries.
const tabComponent = WorkbenchTab as unknown as VueComponent

const components = computed<Record<string, VueComponent>>(() => Object.fromEntries(props.panels.map(name => [name, createPanelComponent(name)])))

const theme = computed<DockviewTheme>(() => ({
  name: 'airi',
  className: 'airi-workbench',
  colorScheme: isDark.value ? 'dark' : 'light',
  gap: 6,
  dndOverlayMounting: 'relative',
  dndPanelOverlay: 'group',
  dndTabIndicator: 'line',
}))

function handleReady({ api }: DockviewReadyEvent) {
  emit('ready', api)
}
</script>

<template>
  <DockviewVue
    :theme="theme"
    :components="components"
    :default-tab-component="tabComponent"
    :disable-floating-groups="!floating"
    :class="['h-full w-full']"
    @ready="handleReady"
  />
</template>

<style>
@import 'dockview-vue/dist/styles/dockview.css';

.airi-workbench {
  --airi-workbench-accent: oklch(clamp(0%, calc(74% * var(--chromatic-bri, 1)), 100%) calc(var(--chromatic-chroma-400) * var(--chromatic-sat, 1)) calc(var(--chromatic-hue) + 0));
  /* The 28 px tabs sit 6 px from the top, the bottom, and the left of their card. */
  --dv-tabs-and-actions-container-height: 2.5rem;
  /* The tab bar has the color of its panel, so a card is one surface. */
  --dv-tabs-and-actions-container-background-color: rgb(255 255 255);
  --dv-group-view-background-color: rgb(255 255 255);
  /* WorkbenchTab draws the tab, so the tab slot itself stays transparent. */
  --dv-activegroup-visiblepanel-tab-background-color: transparent;
  --dv-activegroup-hiddenpanel-tab-background-color: transparent;
  --dv-inactivegroup-visiblepanel-tab-background-color: transparent;
  --dv-inactivegroup-hiddenpanel-tab-background-color: transparent;
  --dv-tab-divider-color: transparent;
  --dv-separator-border: rgb(229 229 229 / 0.72);
  --dv-sash-color: transparent;
  --dv-active-sash-color: color-mix(in oklch, var(--airi-workbench-accent) 60%, transparent);
  --dv-icon-hover-background-color: rgb(229 229 229 / 0.8);
  --dv-drag-over-background-color: color-mix(in oklch, var(--airi-workbench-accent) 12%, transparent);
  --dv-drag-over-border-color: color-mix(in oklch, var(--airi-workbench-accent) 65%, transparent);
  --dv-border-radius: 0.375rem;
  --dv-tab-border-radius: 0.5rem;
  --dv-spacing-padding: 0.375rem;
  /* In light mode, the gap is a step darker than the white cards, so each card reads as its own surface. */
  background: rgb(236 236 236);
}

/* Dockview paints its root with the card color, which hides the gap. The gap shows the workbench background. */
.airi-workbench .dv-dockview {
  background-color: transparent;
}

.dark .airi-workbench {
  --dv-tabs-and-actions-container-background-color: rgb(10 10 10 / 0.7);
  --dv-group-view-background-color: rgb(10 10 10 / 0.7);
  --dv-separator-border: rgb(64 64 64 / 0.64);
  --dv-icon-hover-background-color: rgb(64 64 64 / 0.8);
  background: rgb(23 23 23 / 0.52);
}

/* Each group is a card with its own border. The gaps between cards separate the groups, so no separator line draws. */
.airi-workbench .dv-groupview {
  overflow: hidden;
  border: 1px solid rgb(229 229 229 / 0.55);
  border-radius: 0.625rem;
}

.dark .airi-workbench .dv-groupview {
  border-color: rgb(64 64 64 / 0.4);
}

.airi-workbench .dv-tab {
  padding: 0;
}

.airi-workbench .dv-tabs-and-actions-container {
  padding-inline: 0.25rem;
}

.airi-workbench .dv-split-view-container > .dv-view-container > .dv-view::before {
  display: none;
}
</style>
