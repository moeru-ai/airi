<script lang="ts" setup>
import { Button } from '@proj-airi/stage-ui/components'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { storeToRefs } from 'pinia'

const emits = defineEmits<{
  (e: 'reset'): void
}>()

const { stageModelRenderer, stageViewControlsEnabled } = storeToRefs(useSettings())

const mode = defineModel<'x' | 'y' | 'z' | 'scale'>({ required: true })

function handleViewControlsToggle(targetMode: 'x' | 'y' | 'z' | 'scale') {
  if (mode.value === targetMode) {
    emits('reset')
    return
  }

  mode.value = targetMode
}
</script>

<template>
  <div w-full flex flex-1 items-center self-end justify-end gap-2>
    <Transition name="fade">
      <div v-if="stageViewControlsEnabled" w-full flex justify-between gap-2>
        <Button variant="secondary-muted" :toggled="mode === 'x'" w-full @click="handleViewControlsToggle('x')">
          X
        </Button>
        <Button variant="secondary-muted" :toggled="mode === 'y'" w-full @click="handleViewControlsToggle('y')">
          Y
        </Button>
        <Button v-if="stageModelRenderer === 'vrm'" variant="secondary-muted" :toggled="mode === 'z'" w-full @click="handleViewControlsToggle('z')">
          Z
        </Button>
        <Button variant="secondary-muted" :toggled="mode === 'scale'" w-full @click="handleViewControlsToggle('scale')">
          Scale
        </Button>
      </div>
    </Transition>
    <button
      w-fit flex items-center self-end justify-center justify-self-end rounded-xl p-2 backdrop-blur-md
      border="2 solid neutral-100/60 dark:neutral-800/30"
      bg="neutral-50/70 dark:neutral-800/70"
      title="View"
      text="neutral-500 dark:neutral-400"
      @click="stageViewControlsEnabled = !stageViewControlsEnabled"
    >
      <Transition name="fade" mode="out-in">
        <div v-if="!stageViewControlsEnabled" i-solar:tuning-outline size-5 />
        <div v-else i-solar:alt-arrow-right-outline size-5 />
      </Transition>
    </button>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease-in-out;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-to,
.fade-leave-from {
  opacity: 1;
}
</style>
