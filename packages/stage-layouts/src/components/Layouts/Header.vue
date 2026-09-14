<script setup lang="ts">
import { ProfileSwitcherPopover } from '@proj-airi/stage-ui/components'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'

import HeaderLink from './HeaderLink.vue'
import ActionAbout from './InteractiveArea/Actions/About.vue'

const { t } = useI18n()
const router = useRouter()

function handleNavigation() {
  router.push('/settings/airi-card')
}
</script>

<template>
  <header mb-1 w-full flex items-center justify-between gap-2>
    <HeaderLink />
    <div flex items-center gap-2>
      <ActionAbout />
      <ProfileSwitcherPopover @manage="handleNavigation" />
      <RouterLink
        border="2 solid neutral-100/60 dark:neutral-800/30"
        bg="neutral-50/70 dark:neutral-800/70"
        w-fit flex items-center justify-center rounded-xl p-2 backdrop-blur-md
        :title="t('settings.title')"
        to="/settings"
      >
        <div i-solar:settings-minimalistic-bold-duotone size-5 text="neutral-500 dark:neutral-400" />
      </RouterLink>
    </div>
  </header>
</template>
