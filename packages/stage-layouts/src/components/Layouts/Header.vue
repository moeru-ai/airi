<script setup lang="ts">
import { ProfileSwitcherPopover } from '@proj-airi/stage-ui/components'
import { useRouter } from 'vue-router'

import HeaderAvatar from './HeaderAvatar.vue'
import HeaderLink from './HeaderLink.vue'

const router = useRouter()

function handleNavigation() {
  router.push('/settings/airi-card')
}
</script>

<template>
  <header mb-1 w-full flex items-center justify-between gap-2>
    <HeaderLink />
    <div flex items-center gap-2>
      <ProfileSwitcherPopover @manage="handleNavigation" />
      <HeaderAvatar />
    </div>
  </header>
</template>
