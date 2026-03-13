<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { ProfileSwitcherPopover } from '@proj-airi/stage-ui/components'

import { electronOpenSettings } from '../../../../shared/eventa'

const openSettings = useElectronEventaInvoke(electronOpenSettings)

function handleCreate() {
  // Open the airi-card settings page where users can create a new profile
  openSettings({ route: '/settings/airi-card' })
}

function handleManage() {
  openSettings({ route: '/settings/airi-card' })
}
</script>

<template>
  <ProfileSwitcherPopover placement="up" @create="handleCreate" @manage="handleManage">
    <template #default="{ open, toggle, activeCard }">
      <slot :open="open" :toggle="toggle" :active-card="activeCard" />
    </template>
  </ProfileSwitcherPopover>
</template>
