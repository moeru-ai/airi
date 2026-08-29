<script setup lang="ts">
import type { DockviewReadyEvent, DockviewTheme, VueComponent } from 'dockview-vue'

import { useTheme } from '@proj-airi/ui'
import { DockviewVue } from 'dockview-vue'
import { computed, defineComponent, h, useSlots } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { isDark } = useTheme()
const slots = useSlots()

type PanelSlotName = 'direct-control' | 'inference' | 'preview' | 'timeline'

function createPanelComponent(slotName: PanelSlotName): VueComponent {
  // NOTICE:
  // Dockview declares registry entries as DefineComponent<any>.
  // Vue's concrete defineComponent result is not assignable to that broad generic type.
  // Source: dockview-vue/dist/types/utils.d.ts.
  // Remove this cast when Dockview accepts Vue's Component type for registry entries.
  return defineComponent({
    setup() {
      return () => h('div', { class: 'h-full overflow-auto p-3' }, slots[slotName]?.())
    },
  }) as VueComponent
}

const components: Record<string, VueComponent> = {
  directControl: createPanelComponent('direct-control'),
  inference: createPanelComponent('inference'),
  preview: createPanelComponent('preview'),
  timeline: createPanelComponent('timeline'),
}

const theme = computed<DockviewTheme>(() => ({
  name: 'airi',
  className: 'dockview-theme-airi',
  colorScheme: isDark.value ? 'dark' : 'light',
  gap: 8,
  dndOverlayMounting: 'relative',
  dndPanelOverlay: 'group',
  dndTabIndicator: 'line',
}))

function handleReady({ api }: DockviewReadyEvent) {
  const layoutWidth = api.width
  const layoutHeight = api.height
  const sideWidth = Math.max(200, Math.round(layoutWidth / 6))
  const previewHeight = Math.max(180, Math.round(layoutHeight / 4))

  const preview = api.addPanel({
    id: 'preview',
    component: 'preview',
    title: t('tamagotchi.settings.devtools.pages.live2d-motion.panels.preview'),
    initialWidth: Math.max(280, layoutWidth - sideWidth * 2),
    minimumWidth: 280,
    minimumHeight: 180,
  })

  const directControl = api.addPanel({
    id: 'direct-control',
    component: 'directControl',
    title: t('tamagotchi.settings.devtools.pages.live2d-motion.panels.direct-control'),
    position: { referencePanel: 'preview', direction: 'left' },
    initialWidth: sideWidth,
    minimumWidth: 200,
  })

  const inference = api.addPanel({
    id: 'inference',
    component: 'inference',
    title: t('tamagotchi.settings.devtools.pages.live2d-motion.panels.inference'),
    position: { referencePanel: 'preview', direction: 'right' },
    initialWidth: sideWidth,
    minimumWidth: 200,
  })

  const timeline = api.addPanel({
    id: 'timeline',
    component: 'timeline',
    title: t('tamagotchi.settings.devtools.pages.live2d-motion.panels.timeline'),
    position: { referencePanel: 'preview', direction: 'below' },
    initialHeight: Math.max(240, layoutHeight - previewHeight),
    minimumHeight: 240,
  })

  directControl.group.api.setSize({ width: sideWidth })
  inference.group.api.setSize({ width: sideWidth })
  preview.group.api.setSize({ height: previewHeight })
  timeline.group.api.setSize({ height: Math.max(240, layoutHeight - previewHeight) })
}
</script>

<template>
  <DockviewVue
    :theme="theme"
    :components="components"
    :disable-floating-groups="true"
    :class="['h-full w-full']"
    @ready="handleReady"
  />
</template>

<style>
@import 'dockview-vue/dist/styles/dockview.css';

.dockview-theme-airi {
  --motion-workbench-accent: oklch(clamp(0%, calc(74% * var(--chromatic-bri, 1)), 100%) calc(var(--chromatic-chroma-400) * var(--chromatic-sat, 1)) calc(var(--chromatic-hue) + 0));
  --dv-tabs-and-actions-container-height: 2.25rem;
  --dv-tabs-and-actions-container-background-color: rgb(250 250 250 / 0.92);
  --dv-group-view-background-color: rgb(255 255 255 / 0.68);
  --dv-activegroup-visiblepanel-tab-background-color: rgb(255 255 255 / 0.9);
  --dv-activegroup-visiblepanel-tab-color: rgb(23 23 23);
  --dv-activegroup-hiddenpanel-tab-background-color: transparent;
  --dv-activegroup-hiddenpanel-tab-color: rgb(115 115 115);
  --dv-inactivegroup-visiblepanel-tab-background-color: rgb(255 255 255 / 0.72);
  --dv-inactivegroup-visiblepanel-tab-color: rgb(64 64 64);
  --dv-inactivegroup-hiddenpanel-tab-background-color: transparent;
  --dv-inactivegroup-hiddenpanel-tab-color: rgb(115 115 115);
  --dv-tab-divider-color: rgb(229 229 229 / 0.8);
  --dv-separator-border: rgb(229 229 229 / 0.72);
  --dv-sash-color: transparent;
  --dv-active-sash-color: color-mix(in oklch, var(--motion-workbench-accent) 60%, transparent);
  --dv-icon-hover-background-color: rgb(229 229 229 / 0.8);
  --dv-drag-over-background-color: color-mix(in oklch, var(--motion-workbench-accent) 12%, transparent);
  --dv-drag-over-border-color: color-mix(in oklch, var(--motion-workbench-accent) 65%, transparent);
  --dv-border-radius: 0.75rem;
  --dv-tab-border-radius: 0.625rem;
  --dv-spacing-padding: 0.5rem;
  background: rgb(245 245 245 / 0.72);
}

.dark .dockview-theme-airi {
  --dv-tabs-and-actions-container-background-color: rgb(23 23 23 / 0.9);
  --dv-group-view-background-color: rgb(10 10 10 / 0.62);
  --dv-activegroup-visiblepanel-tab-background-color: rgb(38 38 38 / 0.9);
  --dv-activegroup-visiblepanel-tab-color: rgb(245 245 245);
  --dv-activegroup-hiddenpanel-tab-color: rgb(163 163 163);
  --dv-inactivegroup-visiblepanel-tab-background-color: rgb(38 38 38 / 0.66);
  --dv-inactivegroup-visiblepanel-tab-color: rgb(229 229 229);
  --dv-inactivegroup-hiddenpanel-tab-color: rgb(163 163 163);
  --dv-tab-divider-color: rgb(64 64 64 / 0.74);
  --dv-separator-border: rgb(64 64 64 / 0.64);
  --dv-icon-hover-background-color: rgb(64 64 64 / 0.8);
  background: rgb(23 23 23 / 0.52);
}

.dockview-theme-airi .dv-groupview {
  overflow: hidden;
  border-radius: 0.875rem;
}

.dockview-theme-airi .dv-tabs-and-actions-container {
  backdrop-filter: blur(16px);
}

.dockview-theme-airi .dv-tab .dv-default-tab {
  padding-inline: 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.dockview-theme-airi .dv-tab .dv-default-tab .dv-default-tab-action {
  display: none;
}

.dockview-theme-airi .dv-content-container {
  background-image: radial-gradient(circle at 50% 0%, color-mix(in oklch, var(--motion-workbench-accent) 4%, transparent), transparent 38%);
}

.dockview-theme-airi .dv-split-view-container.dv-horizontal > .dv-view-container > .dv-view::before {
  display: none;
}
</style>
