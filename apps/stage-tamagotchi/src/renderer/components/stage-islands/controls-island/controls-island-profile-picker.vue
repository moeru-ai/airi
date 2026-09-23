<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { ProfileSwitcherPopover } from '@proj-airi/stage-ui/components'
import { computed } from 'vue'

import { electronOpenSettings } from '../../../../shared/eventa'
import { useControlsIslandPlacement } from './use-controls-island-placement'

defineOptions({ inheritAttrs: false })

const props = defineProps<{ active: boolean }>()
const emit = defineEmits<{ interactionChange: [active: boolean] }>()

const open = defineModel<boolean>('open', { default: false })

const openSettings = useElectronEventaInvoke(electronOpenSettings)
const { isLeft, isTop } = useControlsIslandPlacement()
const contentSide = computed(() => isTop.value ? 'bottom' : 'top')
const contentAlign = computed(() => isLeft.value ? 'start' : 'end')

function handleManage() {
  openSettings({ route: '/settings/airi-card' })
}
</script>

<template>
  <ProfileSwitcherPopover
    v-model:open="open"
    :active="props.active"
    :content-side="contentSide"
    :content-align="contentAlign"
    @interaction-change="emit('interactionChange', $event)"
    @manage="handleManage"
  >
    <template #default="{ open: popoverOpen, toggle, activeCard }">
      <slot :open="popoverOpen" :toggle="toggle" :active-card="activeCard" />
    </template>
  </ProfileSwitcherPopover>
</template>
