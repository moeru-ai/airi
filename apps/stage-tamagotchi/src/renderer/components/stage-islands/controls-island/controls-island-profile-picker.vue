<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { ProfileSwitcherPopover } from '@proj-airi/stage-ui/components'

import { electronOpenSettings } from '../../../../shared/eventa'

const openSettings = useElectronEventaInvoke(electronOpenSettings)

function handleNavigation() {
  openSettings({ route: '/settings/airi-card' })
}
</script>

<template>
  <ProfileSwitcherPopover placement="up" @manage="handleNavigation">
    <template #default="{ open, toggle, activeCard }">
      <slot :open="open" :toggle="toggle" :active-card="activeCard" />
    </template>
  </ProfileSwitcherPopover>
</template>
