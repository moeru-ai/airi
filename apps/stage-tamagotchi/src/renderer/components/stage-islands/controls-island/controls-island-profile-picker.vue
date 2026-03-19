<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { ProfileSwitcherPopover } from '@proj-airi/stage-ui/components'

import { electronOpenSettings } from '../../../../shared/eventa'

defineOptions({ inheritAttrs: false })

const open = defineModel<boolean>('open', { default: false })

const openSettings = useElectronEventaInvoke(electronOpenSettings)

function handleManage() {
  openSettings({ route: '/settings/airi-card' })
}
</script>

<template>
  <ProfileSwitcherPopover v-bind="$attrs" v-model:open="open" @manage="handleManage">
    <template #default="{ open: popoverOpen, toggle, activeCard }">
      <slot :open="popoverOpen" :toggle="toggle" :active-card="activeCard" />
    </template>
  </ProfileSwitcherPopover>
</template>
