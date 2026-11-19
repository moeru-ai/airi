<script setup lang="ts">
import type { DockviewApi, DockviewReadyEvent, DockviewTheme, IDockviewHeaderActionsProps, VueComponent } from 'dockview-vue'
import type { PropType, VNode } from 'vue'

import type { WorkbenchFrame } from './types'

import { useTheme } from '@proj-airi/ui'
import { DockviewVue } from 'dockview-vue'
import { computed, defineComponent, h, onScopeDispose, shallowRef, useSlots, useTemplateRef } from 'vue'

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
  /**
   * The workbench fills a window without a title bar, so the tab bars at the top edge act as the title bar.
   * The `frame-end` slot shows at the end of the top-right tab bar, for example the window buttons.
   */
  frame?: WorkbenchFrame
}>(), { floating: false, padded: true })

const emit = defineEmits<{
  ready: [api: DockviewApi]
}>()

const { isDark } = useTheme()
const slots = useSlots()
const root = useTemplateRef<HTMLElement>('root')

/** The edges of the workbench that a group touches. The frame uses them to find the groups that are in the title bar. */
interface GroupEdges {
  top: boolean
  start: boolean
  end: boolean
}

const edges = shallowRef<ReadonlyMap<string, GroupEdges>>(new Map())

/** A group that touches an edge has a distance to it below half of the gap between groups. */
const EDGE_TOLERANCE = 3

function measureEdges(api: DockviewApi) {
  if (!root.value)
    return

  const bounds = root.value.getBoundingClientRect()
  const next = new Map<string, GroupEdges>()
  for (const group of api.groups) {
    if (group.api.location.type !== 'grid')
      continue

    const rect = group.element.getBoundingClientRect()
    const groupEdges = {
      top: rect.top - bounds.top < EDGE_TOLERANCE,
      start: rect.left - bounds.left < EDGE_TOLERANCE,
      end: bounds.right - rect.right < EDGE_TOLERANCE,
    }
    next.set(group.id, groupEdges)
    // The style sheet can then reach the void part of the tab bar, which Dockview owns.
    group.element.classList.toggle('airi-workbench-group--top', groupEdges.top)
  }
  edges.value = next
}

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

/**
 * A header action of each group. It renders only in a group that touches the given edges, so it moves with the layout.
 */
function createFrameActionsComponent(render: (edges: GroupEdges, frame: WorkbenchFrame) => VNode | null | undefined): VueComponent {
  // NOTICE:
  // Dockview declares registry entries as DefineComponent<any>.
  // Vue's concrete defineComponent result is not assignable to that broad generic type.
  // Source: dockview-vue/dist/types/utils.d.ts.
  // Remove this cast when Dockview accepts Vue's Component type for registry entries.
  return defineComponent({
    props: { params: { type: Object as PropType<IDockviewHeaderActionsProps>, required: true } },
    setup(actionsProps) {
      return () => {
        const groupEdges = edges.value.get(actionsProps.params.group.id)
        return props.frame && groupEdges ? render(groupEdges, props.frame) : null
      }
    },
  }) as VueComponent
}

/** Keeps space at the start of the top-left tab bar, for window buttons that the system draws over the page. */
const prefixActionsComponent = createFrameActionsComponent(({ top, start }, { insetStart }) => top && start && insetStart
  ? h('div', { class: 'airi-workbench-frame-inset h-full shrink-0', style: { width: insetStart } })
  : null)

/** Shows the `frame-end` slot at the end of the top-right tab bar. */
const rightActionsComponent = createFrameActionsComponent(({ top, end }) => top && end
  ? h('div', { class: 'h-full flex items-stretch [-webkit-app-region:no-drag]' }, slots['frame-end']?.())
  : null)

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

let stopLayoutChange: (() => void) | undefined
onScopeDispose(() => stopLayoutChange?.())

function handleReady({ api }: DockviewReadyEvent) {
  // Every add, move, and removal of a group fires a layout change, so the edges follow the user's layout.
  const disposable = api.onDidLayoutChange(() => measureEdges(api))
  stopLayoutChange = () => disposable.dispose()
  emit('ready', api)
  measureEdges(api)
}
</script>

<template>
  <!-- The surface is a step darker than the cards on it. Its padding is as wide as the gap between the cards. -->
  <div :class="['airi-workbench-surface h-full w-full p-1.5', frame?.draggable && 'airi-workbench--draggable']">
    <div ref="root" :class="['h-full w-full']">
      <DockviewVue
        :theme="theme"
        :components="components"
        :default-tab-component="tabComponent"
        :prefix-header-actions-component="prefixActionsComponent"
        :right-header-actions-component="rightActionsComponent"
        :disable-floating-groups="!floating"
        :class="['h-full w-full']"
        @ready="handleReady"
      />
    </div>
  </div>
</template>

<style>
@import 'dockview-vue/dist/styles/dockview.css';

.airi-workbench {
  /* The alpha resolves the %alpha placeholder of the Chromatic v2 shade, which a plain theme() leaves in the value. */
  --airi-workbench-accent: theme('colors.primary.400 / 100%');
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
}

/* The cards are white on a gray surface, so each card reads as a layer above it. */
.airi-workbench-surface {
  background: rgb(229 229 229);
}

.dark .airi-workbench-surface {
  background: rgb(10 10 10);
}

/* Dockview paints its root with the card color, which hides the gap. The gap shows the workbench background. */
.airi-workbench .dv-dockview {
  background-color: transparent;
}

.dark .airi-workbench {
  /* In dark mode, a card is a step lighter than the surface, so it also reads as a layer above it. */
  --dv-tabs-and-actions-container-background-color: rgb(23 23 23);
  --dv-group-view-background-color: rgb(23 23 23);
  --dv-separator-border: rgb(64 64 64 / 0.64);
  --dv-icon-hover-background-color: rgb(64 64 64 / 0.8);
}

/* Each group is a card. The gaps between cards separate the groups, so no border or separator line draws. */
.airi-workbench .dv-groupview {
  overflow: hidden;
  border-radius: 0.625rem;
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

/* In a frame, the empty part of each tab bar at the top edge moves the window. A tab still moves its panel. */
.airi-workbench--draggable .airi-workbench-group--top .dv-void-container,
.airi-workbench--draggable .airi-workbench-frame-inset {
  -webkit-app-region: drag;
}
</style>
