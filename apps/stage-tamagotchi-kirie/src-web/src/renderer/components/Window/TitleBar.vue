<script setup lang="ts">
import { IconButton } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useAppRuntime } from '../../composables/runtime'
import { initializeHostContext } from '../../host-context'
import { returnToStage } from '../../host-context/mobile-navigation'

defineProps<{
  title: string
  icon: string
}>()

const emit = defineEmits<{
  titleClick: []
}>()

const { platform } = useAppRuntime()
const isAndroid = initializeHostContext().os === 'android'
const router = useRouter()
const { t } = useI18n()
</script>

<template>
  <div
    :class="[
      'fixed top-0 z-100 w-full select-none py-2 pr-4',
      'bg-neutral-100 dark:bg-neutral-900',
      isAndroid ? '' : 'drag-region',
      platform === 'macos' ? 'pl-20' : 'pl-4',
    ]"
  >
    <div :class="['flex items-center', isAndroid ? '' : 'drag-region']">
      <IconButton
        v-if="isAndroid"
        icon="i-solar:arrow-left-linear"
        :aria-label="t('tamagotchi.stage.operations.back')"
        :class="['mr-2 h-7 w-9 shrink-0']"
        @click="returnToStage(router)"
      />
      <div
        :class="[
          'flex cursor-pointer select-none items-center gap-2 rounded-md px-1.5 py-0.5',
          'transition-all duration-200 ease-in-out hover:bg-neutral-200 dark:hover:bg-neutral-800',
          '[-webkit-app-region:no-drag]',
        ]"
        @click="emit('titleClick')"
      >
        <div :class="[icon, 'select-none whitespace-nowrap text-neutral-400 dark:text-neutral-500']" />
        <div><span :class="['select-none whitespace-nowrap text-sm']">{{ title }}</span></div>
      </div>
      <div :class="['w-full', isAndroid ? '' : 'drag-region']" />
      <div
        :class="['flex items-center gap-1', '[-webkit-app-region:no-drag]']"
      >
        <slot name="actions" />
      </div>
      <!--
        NOTICE:
        The planned collapse feature was not implemented. Keep this icon hidden until the feature exists.
        https://github.com/moeru-ai/airi/issues/1835#issuecomment-4487178613
      -->
      <!--
      <div
        bg="hover:neutral-200 hover:dark:neutral-800"
        transition="all duration-200 ease-in-out"
        flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-0.5
      >
        <div i-solar:info-circle-bold text="neutral-400 dark:neutral-500" whitespace-nowrap />
      </div>
      -->
    </div>
  </div>
</template>
