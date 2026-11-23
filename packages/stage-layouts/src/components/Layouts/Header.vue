<script setup lang="ts">
import { ProfileSwitcherPopover } from '@proj-airi/stage-ui/components'
import { useRouter } from 'vue-router'

import HeaderFlux from './header-flux.vue'
import HeaderAvatar from './HeaderAvatar.vue'
import HeaderLink from './HeaderLink.vue'

withDefaults(defineProps<{
  /** Shows the character switcher. Only the main stage shows it, because the character belongs to the stage. @default true */
  characterSwitcher?: boolean
}>(), { characterSwitcher: true })

const router = useRouter()

function handleNavigation() {
  router.push('/settings/airi-card')
}
</script>

<template>
  <header mb-1 w-full flex items-center justify-between gap-2>
    <HeaderLink />
    <div flex items-center gap-2>
      <ProfileSwitcherPopover v-if="characterSwitcher" @manage="handleNavigation" />
      <HeaderFlux />
      <HeaderAvatar />
    </div>
  </header>
</template>
