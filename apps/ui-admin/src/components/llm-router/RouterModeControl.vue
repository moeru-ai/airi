<script setup lang="ts">
import type { RouterConfigMode } from '../../modules/router-config-form'

import { Button, Callout } from '@proj-airi/ui'

const mode = defineModel<RouterConfigMode>({ required: true })
</script>

<template>
  <section :class="['rounded-lg', 'border', 'border-neutral-200', 'bg-white', 'p-4']">
    <div :class="['flex', 'items-start', 'justify-between', 'gap-3']">
      <div>
        <h3 :class="['text-sm', 'font-semibold']">
          Write Mode
        </h3>
        <p :class="['mt-1', 'text-xs', 'text-neutral-500']">
          Merge keeps untouched router models. Reset replaces the router model tree with this request.
        </p>
      </div>
      <span :class="['badge', mode === 'reset' ? 'badge-amber' : 'badge-green']">
        <span :class="[mode === 'reset' ? 'i-lucide-alert-triangle' : 'i-lucide-git-merge']" />
        {{ mode === 'reset' ? 'Reset' : 'Merge' }}
      </span>
    </div>

    <div :class="['mt-4', 'grid', 'gap-2', 'sm:grid-cols-2']">
      <Button
        icon="i-lucide-git-merge"
        label="Merge"
        size="sm"
        type="button"
        :toggled="mode === 'merge'"
        variant="secondary-muted"
        @click="mode = 'merge'"
      />
      <Button
        icon="i-lucide-rotate-ccw"
        label="Reset"
        size="sm"
        type="button"
        :toggled="mode === 'reset'"
        :variant="mode === 'reset' ? 'caution' : 'secondary-muted'"
        @click="mode = 'reset'"
      />
    </div>

    <Callout v-if="mode === 'reset'" :class="['mt-4']" label="Reset mode" theme="orange">
      Existing LLM/TTS router models not included in this request will be dropped by the server.
    </Callout>
  </section>
</template>
