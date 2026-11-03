<script setup lang="ts">
import type { WorkbenchApi } from '.'

import { Workbench } from '.'

const PANELS = ['first', 'second', 'third'] as const

function handleReady(api: WorkbenchApi) {
  api.addPanel({ id: 'first', component: 'first', title: 'Timeline', params: { icon: 'i-mingcute:timeline-line' } })
  api.addPanel({ id: 'second', component: 'second', title: 'Pipeline', params: { icon: 'i-mingcute:route-line' }, position: { referencePanel: 'first', direction: 'within' }, inactive: true })
  api.addPanel({ id: 'third', component: 'third', title: 'Detail', params: { icon: 'i-mingcute:document-2-line' }, position: { referencePanel: 'first', direction: 'right' } })
}
</script>

<template>
  <Story title="Workbench" group="devtools" :layout="{ type: 'single', iframe: true }">
    <Variant id="tabs" title="Tabs">
      <div :class="['flex h-screen flex-col gap-3 p-4 text-xs text-neutral-500']">
        <p>Panels with browser-like tabs. Drag a tab to move or stack its panel, and drag a gap to resize.</p>
        <div :class="['min-h-0 flex-1']">
          <Workbench :panels="PANELS" @ready="handleReady">
            <template #first>
              Timeline panel
            </template>
            <template #second>
              Pipeline panel
            </template>
            <template #third>
              Detail panel
            </template>
          </Workbench>
        </div>
      </div>
    </Variant>
  </Story>
</template>
