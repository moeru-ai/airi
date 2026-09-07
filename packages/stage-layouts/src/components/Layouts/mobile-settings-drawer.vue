<script setup lang="ts">
import { HearingConfig } from '@proj-airi/stage-ui/components'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { Avatar, BasicButton, BottomDrawer, Checkbox, GhostButton, useTheme } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'

import ActionAbout from './InteractiveArea/Actions/About.vue'

import { BackgroundDialogPicker } from '../Backgrounds'

const props = defineProps<{
  viewControlsAvailable: boolean
}>()
const emit = defineEmits<{
  openViewControls: []
}>()
const characterVoiceEnabled = defineModel<boolean>('characterVoiceEnabled', { required: true })
const { t } = useI18n()
const { isDark } = useTheme()
const authStore = useAuthStore()
const { isAuthenticated, user } = storeToRefs(authStore)
const router = useRouter()
const settingsAudioDevice = useSettingsAudioDevice()
const hearingOpen = shallowRef(false)
const backgroundDialogOpen = shallowRef(false)
const settingsOpen = shallowRef(false)
const aboutOpen = shallowRef(false)
// Finish closing settings before opening a sibling modal, so focus and scroll locks have one owner.
const nextPanel = shallowRef<'background' | 'about' | 'account' | 'hearing' | 'view'>()

function openPanel(panel: 'background' | 'about' | 'account' | 'hearing' | 'view') {
  nextPanel.value = panel
  settingsOpen.value = false
}

function finishSettingsClose() {
  if (nextPanel.value === 'background') {
    backgroundDialogOpen.value = true
  }
  else if (nextPanel.value === 'about') {
    aboutOpen.value = true
  }
  else if (nextPanel.value === 'hearing') {
    hearingOpen.value = true
  }
  else if (nextPanel.value === 'account') {
    if (isAuthenticated.value)
      void router.push('/settings/account')
    else
      authStore.needsLogin = true
  }
  else if (nextPanel.value === 'view') {
    emit('openViewControls')
  }
  nextPanel.value = undefined
}

watch(hearingOpen, async (open) => {
  if (open)
    await settingsAudioDevice.askPermission()
})
</script>

<template>
  <BottomDrawer
    v-model="settingsOpen"
    :title="t('stage.mobile-tools.title')"
    @after-close="finishSettingsClose"
    @close-auto-focus="event => { if (nextPanel) event.preventDefault() }"
  >
    <template #trigger>
      <BasicButton
        size="unset"
        :aria-label="t('stage.mobile-tools.title')"
        :title="t('stage.mobile-tools.title')"
        data-testid="mobile-settings-button"
        :class="['pointer-events-auto size-11 rounded-full bg-neutral-50/70 text-neutral-600 backdrop-blur-md dark:bg-neutral-900/70 dark:text-neutral-300', 'focus-visible:outline-2 focus-visible:outline-primary-500']"
      >
        <span aria-hidden="true" :class="['i-solar:settings-outline size-6']" />
      </BasicButton>
    </template>
    <GhostButton
      block size="unset"
      :class="[
        'mobile-tool-row rounded-2xl',
        '[&_.basic-button-content]:w-full [&_.basic-button-content]:gap-3 [&_[aria-hidden]]:shrink-0',
        isAuthenticated ? 'mobile-tool-row-authenticated mb-4 min-h-16' : 'mobile-tool-row-anonymous mb-3 min-h-14',
      ]"
      @click="openPanel('account')"
    >
      <Avatar v-if="isAuthenticated" :src="user?.image" :class="['size-12 shrink-0 rounded-full bg-neutral-200 text-neutral-500 dark:bg-neutral-700']" />
      <span :class="['min-w-0 flex-1 text-left']">
        <span :class="['block truncate text-base font-semibold']">{{ isAuthenticated ? user?.name : t('stage.mobile-tools.sign-in') }}</span>
        <span :class="['block text-xs text-neutral-500 dark:text-neutral-400']">{{ t('stage.mobile-tools.account-description') }}</span>
      </span>
      <span aria-hidden="true" :class="['i-solar:alt-arrow-right-outline size-4 shrink-0 text-neutral-400']" />
    </GhostButton>
    <section :class="['mb-4']">
      <h3 :class="['mb-2 px-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400']">
        {{ t('stage.mobile-tools.appearance') }}
      </h3>
      <div :class="['overflow-hidden rounded-2xl bg-white dark:bg-neutral-800/60']">
        <label :class="['min-h-13 flex cursor-pointer items-center gap-3 px-4 py-3']">
          <span aria-hidden="true" :class="['i-solar:moon-outline size-5 shrink-0 text-neutral-400']" />
          <span :class="['flex-1 text-sm']">{{ t('stage.mobile-tools.dark-mode') }}</span>
          <Checkbox v-model="isDark" :aria-label="t('stage.mobile-tools.dark-mode')" />
        </label>
        <div :class="['mx-4 border-t border-neutral-100 dark:border-neutral-700/50']" />
        <GhostButton
          block size="unset"
          :class="['mobile-tool-row min-h-13 rounded-none px-4 py-3']"
          @click="openPanel('background')"
        >
          <span aria-hidden="true" :class="['i-solar:gallery-wide-outline size-5 shrink-0 text-neutral-400']" />
          <span :class="['flex-1 text-left text-sm']">{{ t('stage.mobile-tools.background') }}</span>
          <span aria-hidden="true" :class="['i-solar:alt-arrow-right-outline size-4 text-neutral-400']" />
        </GhostButton>
        <div :class="['mx-4 border-t border-neutral-100 dark:border-neutral-700/50']" />
        <GhostButton
          block size="unset"
          :disabled="!props.viewControlsAvailable"
          :class="['mobile-tool-row min-h-13 rounded-none px-4 py-3']"
          @click="openPanel('view')"
        >
          <span aria-hidden="true" :class="['i-solar:tuning-outline size-5 shrink-0 text-neutral-400']" />
          <span :class="['flex-1 text-left text-sm']">{{ t('stage.mobile-tools.view') }}</span>
          <span aria-hidden="true" :class="['i-solar:alt-arrow-right-outline size-4 text-neutral-400']" />
        </GhostButton>
      </div>
    </section>
    <section :class="['mb-4']">
      <h3 :class="['mb-2 px-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400']">
        {{ t('stage.mobile-tools.sound') }}
      </h3>
      <div :class="['overflow-hidden rounded-2xl bg-white dark:bg-neutral-800/60']">
        <label :class="['min-h-13 flex cursor-pointer items-center gap-3 px-4 py-3']">
          <span aria-hidden="true" :class="['i-solar:volume-loud-outline size-5 shrink-0 text-neutral-400']" />
          <span :class="['flex-1 text-sm']">{{ t('stage.mobile-tools.character-voice') }}</span>
          <Checkbox v-model="characterVoiceEnabled" :aria-label="t('stage.mobile-tools.character-voice')" />
        </label>
        <div :class="['mx-4 border-t border-neutral-100 dark:border-neutral-700/50']" />
        <GhostButton block size="unset" :class="['mobile-tool-row min-h-13 rounded-none px-4 py-3']" @click="openPanel('hearing')">
          <span aria-hidden="true" :class="['i-solar:microphone-3-outline size-5 shrink-0 text-neutral-400']" />
          <span :class="['flex-1 text-left text-sm']">{{ t('stage.mobile-tools.hearing') }}</span>
          <span aria-hidden="true" :class="['i-solar:alt-arrow-right-outline size-4 text-neutral-400']" />
        </GhostButton>
      </div>
    </section>
    <section :class="['mb-4']">
      <h3 :class="['mb-2 px-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400']">
        {{ t('stage.mobile-tools.application') }}
      </h3>
      <div :class="['overflow-hidden rounded-2xl bg-white dark:bg-neutral-800/60']">
        <RouterLink
          to="/settings"
          :class="[
            'min-h-13 flex items-center gap-3 px-4 py-3 text-sm',
            'hover:bg-primary-500/10 focus-visible:outline-2 focus-visible:outline-primary-500',
          ]"
          @click="settingsOpen = false"
        >
          <span aria-hidden="true" :class="['i-solar:settings-outline size-5 shrink-0 text-neutral-400']" />
          <span :class="['flex-1']">{{ t('stage.mobile-tools.settings') }}</span>
          <span aria-hidden="true" :class="['i-solar:alt-arrow-right-outline size-4 text-neutral-400']" />
        </RouterLink>
        <div :class="['mx-4 border-t border-neutral-100 dark:border-neutral-700/50']" />
        <GhostButton
          block size="unset"
          :class="['mobile-tool-row min-h-13 rounded-none px-4 py-3']"
          @click="openPanel('about')"
        >
          <span aria-hidden="true" :class="['i-solar:info-circle-outline size-5 text-neutral-400']" />
          <span :class="['flex-1 text-left text-sm']">{{ t('stage.mobile-tools.about') }}</span>
          <span aria-hidden="true" :class="['i-solar:alt-arrow-right-outline size-4 text-neutral-400']" />
        </GhostButton>
      </div>
    </section>
  </BottomDrawer>
  <BottomDrawer
    v-model="hearingOpen"
    :title="t('stage.mobile-tools.hearing')"
    @close-auto-focus="event => event.preventDefault()"
    @after-close="settingsOpen = true"
  >
    <HearingConfig :granted="true" />
  </BottomDrawer>
  <BackgroundDialogPicker v-model="backgroundDialogOpen" class="pointer-events-auto" />
  <ActionAbout v-model="aboutOpen" hide-trigger />
</template>

<style scoped>
.mobile-tool-row :deep(.basic-button-content) {
  width: 100%;
  gap: 0.75rem;
}

.mobile-tool-row :deep([aria-hidden]) {
  flex-shrink: 0;
}

.mobile-tool-row.mobile-tool-row-authenticated {
  padding: 0.75rem 1rem !important;
}

.mobile-tool-row.mobile-tool-row-anonymous {
  padding: 0.5rem 0 !important;
}
</style>
